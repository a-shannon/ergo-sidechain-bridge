import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, realpathSync, statfsSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { runBoundedProcess } from './bounded-process-runner.js';

const root = resolve(import.meta.dirname, '../..');
const callers = ['tracker-mempool', 'continuation-transaction'] as const;
const wrapperHashes = [
  '391aa32f06203512517ca32a9b062247f224cfae29d542b01fb355633849c75a',
  'eec0c0e7a61f5489f957c3ea0d93041cd518cc2a09157122d8648476f67e870c',
  'ea07ff1c95e54e60cfd4e621dce04de6074c46e9744dace674c1dbef4190276a',
];
const implementationHashes = [
  '6a3153c6a69c290ced5f7fd7eaebbb975d69aa1010e9c6bd98ca31e71041c208',
  'b84c68bb7ddd9526832c92a76c149f10d024be477e73127399439ad46d85da02',
  '2dadbfc063fc51f7f7c6ed85ac95380378957447110ebf8daee13723eb797ab3',
];
const oldWrapperHash = '09cc5b729365b8e41b276117b54888dd58d0f2dc89b08a21db1f64853cfa82af';
const specHashes = [
  'bb254fc9ca85dee6c46401d87cd0d1c01f95a78a3f0d07bfd0e7f49a2fc7b49f',
  '21ad223ae443505dc04c7b55f5a9baf9a687c482e7e7e6fb7235dca2fb7d70a4',
];
const trackerSpecHash = '51c546cb36c9c8cf20e6dd1a93ac618872f27f08175f0297de518c80cd125ccd';
const trackerFixtureHash = 'a19a03efbeca8a7a515f75992a772c720499816a9b3c153caaef7969a292ebe1';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
interface Case { name: string; file: string; pins: 'wrapper' | 'implementation' | 'spec'; accepted: boolean; expected?: unknown; legacyDigest?: boolean; caller?: typeof callers[number] }
const cases: Case[] = [
  ...['mixed', 'crlf', 'lf'].map(file => ({ name: `accepts exact wrapper ${file}`, file, pins: 'wrapper' as const, accepted: true })),
  ...['implementation-mixed', 'implementation-crlf', 'implementation-lf'].map(file => ({ name: `accepts exact ${file}`, file, pins: 'implementation' as const, accepted: true })),
  { name: 'retains single-string pin acceptance', file: 'lf', pins: 'wrapper', expected: wrapperHashes[2], accepted: true },
  { name: 'rejects wrapper content drift', file: 'wrapper-mutant', pins: 'wrapper', accepted: false },
  { name: 'rejects unlisted newline representation', file: 'newline-mutant', pins: 'wrapper', accepted: false },
  { name: 'rejects implementation content drift', file: 'implementation-mutant', pins: 'implementation', accepted: false },
  { name: 'rejects wrapper substituted for implementation', file: 'lf', pins: 'implementation', accepted: false },
  { name: 'rejects absent implementation', file: 'absent', pins: 'implementation', accepted: false },
  { name: 'rejects historical wrapper digest', file: 'lf', pins: 'wrapper', legacyDigest: true, accepted: false },
  { name: 'rejects empty pin array', file: 'lf', pins: 'wrapper', expected: [], accepted: false },
  { name: 'rejects null pin', file: 'lf', pins: 'wrapper', expected: null, accepted: false },
  { name: 'rejects numeric pin', file: 'lf', pins: 'wrapper', expected: 1, accepted: false },
  { name: 'rejects malformed pin', file: 'lf', pins: 'wrapper', expected: 'bad', accepted: false },
  { name: 'rejects uppercase pin', file: 'lf', pins: 'wrapper', expected: wrapperHashes[2]!.toUpperCase(), accepted: false },
  { name: 'rejects duplicates despite matching digest', file: 'lf', pins: 'wrapper', expected: [wrapperHashes[2], wrapperHashes[2]], accepted: false },
  { name: 'rejects null sibling despite matching digest', file: 'lf', pins: 'wrapper', expected: [wrapperHashes[2], null], accepted: false },
  { name: 'rejects malformed sibling despite matching digest', file: 'lf', pins: 'wrapper', expected: [wrapperHashes[2], 'bad'], accepted: false },
  { name: 'rejects nested pin array', file: 'lf', pins: 'wrapper', expected: [[wrapperHashes[2]]], accepted: false },
  { name: 'rejects mismatched single-string pin', file: 'lf', pins: 'wrapper', expected: '00'.repeat(32), accepted: false },
  ...['spec-lf', 'spec-crlf'].map(file => ({ name: `accepts exact ${file}`, file, pins: 'spec' as const,
    caller: 'continuation-transaction' as const, accepted: true })),
  { name: 'rejects spec content drift', file: 'spec-mutant', pins: 'spec', caller: 'continuation-transaction', accepted: false },
  { name: 'rejects unlisted spec newline representation', file: 'spec-newline-mutant', pins: 'spec', caller: 'continuation-transaction', accepted: false },
  { name: 'rejects implementation substituted for spec', file: 'implementation-lf', pins: 'spec', caller: 'continuation-transaction', accepted: false },
  { name: 'rejects absent spec', file: 'absent', pins: 'spec', caller: 'continuation-transaction', accepted: false },
  { name: 'rejects historical continuation spec pin', file: 'spec-lf', pins: 'spec',
    expected: 'ab7f9defc3e49121702673ad057ddb3d9cac197c657f8c033468eeab131b8cdf',
    caller: 'continuation-transaction', accepted: false },
  { name: 'accepts current tracker spec', file: 'tracker-spec', pins: 'spec', caller: 'tracker-mempool', accepted: true },
  { name: 'rejects tracker spec content drift', file: 'tracker-spec-mutant', pins: 'spec', caller: 'tracker-mempool', accepted: false },
  { name: 'accepts exact public tracker fixture', file: 'tracker-fixture', pins: 'spec', expected: trackerFixtureHash, caller: 'tracker-mempool', accepted: true },
  { name: 'rejects one-byte public tracker fixture change', file: 'tracker-fixture-mutant', pins: 'spec', expected: trackerFixtureHash, caller: 'tracker-mempool', accepted: false },
];
const casesFor = (caller: typeof callers[number]) => cases.filter(value => value.caller === undefined || value.caller === caller);
let observed: Map<string, boolean>;

beforeAll(async () => {
  if (process.platform !== 'win32' || !process.env.SystemRoot) throw new Error('JVM caller guard tests require Windows PowerShell');
  const directory = realpathSync(tmpdir());
  const space = statfsSync(directory, { bigint: true });
  if (space.bavail * space.bsize < 10n * 1024n ** 3n) throw new Error('insufficient source-pin test headroom');
  const wrapper = readFileSync(resolve(root, 'relayer/src/pinned-local-native-verifier-build.ts'), 'utf8').replace(/\r\n/g, '\n');
  const implementation = readFileSync(resolve(root, 'relayer/src/bounded-process-runner.ts'), 'utf8').replace(/\r\n/g, '\n');
  const spec = readFileSync(resolve(root, 'validity-proof/consumer-jvm/BridgeSubstrateFederatedNativeContinuationTransactionSpec.scala'), 'utf8').replace(/\r\n/g, '\n');
  const trackerSpec = readFileSync(resolve(root, 'validity-proof/consumer-jvm/BridgeSubstrateFederatedNativeTrackerMempoolSpec.scala'), 'utf8');
  const trackerFixture = readFileSync(resolve(root, 'relayer/test-vectors/substrate-federated-native-tracker-mempool-v1.json'), 'utf8');
  expect(hash(trackerSpec)).toBe(trackerSpecHash);
  expect(hash(trackerFixture)).toBe(trackerFixtureHash);
  expect(Buffer.byteLength(trackerFixture)).toBe(29_505);
  // This source-level join binds the public fixture to the pinned Scala consumer;
  // the direct hash-guard tests below do not execute its JVM assertions.
  const fixtureExpectations = [...trackerSpec.matchAll(/sha256\(fixtureBytes\) shouldBe "([0-9a-f]{64})"/g)];
  expect(fixtureExpectations.map(value => value[1])).toEqual([trackerFixtureHash]);
  // Reconstruct the reviewed mixed-EOL source export, independent of checkout EOL.
  // Its exact digest below prevents this representation fixture hiding content drift.
  const bareLfLines = new Set([28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44,
    56, 57, 58, 59, 63, 64, 1125, 1126, 1127, 1128, 1129, 1130, 1132, 1133, 1134, 1135, 1136, 1137,
    1138, 1139, 1140, 1141, 1142, 1143, 1144, 1145, 1146, 1147, 1152, 1153, 1154, 1155]);
  const lines = wrapper.split('\n');
  const mixed = lines.map((line, index) => index === lines.length - 1 ? line : line + (bareLfLines.has(index + 1) ? '\n' : '\r\n')).join('');
  const implementationLines = implementation.split('\n');
  const implementationMixed = implementationLines.map((line, index) => index === implementationLines.length - 1
    ? line : line + (index < 25 ? '\n' : '\r\n')).join('');
  const contents: Record<string, string> = {
    mixed, crlf: wrapper.replace(/\n/g, '\r\n'), lf: wrapper,
    'implementation-mixed': implementationMixed, 'implementation-lf': implementation,
    'implementation-crlf': implementation.replace(/\n/g, '\r\n'),
    'wrapper-mutant': wrapper + '// altered\n', 'implementation-mutant': implementation + '// altered\n',
    'newline-mutant': wrapper.replace(/\n/g, '\r\n').replace('\r\n', '\n'),
    'spec-lf': spec, 'spec-crlf': spec.replace(/\n/g, '\r\n'),
    'spec-mutant': spec + '// altered\n', 'spec-newline-mutant': spec.replace('\n', '\r\n'),
    'tracker-spec': trackerSpec, 'tracker-spec-mutant': trackerSpec + '// altered\n',
    'tracker-fixture': trackerFixture, 'tracker-fixture-mutant': String.fromCharCode(trackerFixture.charCodeAt(0) ^ 1) + trackerFixture.slice(1),
  };
  expect(['mixed', 'crlf', 'lf'].map(key => hash(contents[key]!))).toEqual(wrapperHashes);
  expect(['implementation-mixed', 'implementation-crlf', 'implementation-lf'].map(key => hash(contents[key]!))).toEqual(implementationHashes);
  expect(['spec-lf', 'spec-crlf'].map(key => hash(contents[key]!))).toEqual(specHashes);
  const prefix = `e2s-jvm-source-pins-${randomUUID()}`;
  const paths = Object.fromEntries([...Object.keys(contents), 'absent'].map(key => [key, resolve(directory, `${prefix}-${key}.ts`)]));
  const written: string[] = [];
  try {
    for (const [key, text] of Object.entries(contents)) {
      writeFileSync(paths[key]!, text, { encoding: 'utf8', flag: 'wx' });
      written.push(paths[key]!);
    }
    const command = String.raw`
      $ErrorActionPreference = 'Stop'
      $ProgressPreference = 'SilentlyContinue'
      Set-StrictMode -Version Latest
      $inputData = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:E2S_SOURCE_PIN_CASES)) | ConvertFrom-Json
      $results = @()
      foreach ($caller in $inputData.callers) {
        $tokens = $null; $errors = $null
        $ast = [Management.Automation.Language.Parser]::ParseFile($caller.path, [ref]$tokens, [ref]$errors)
        if ($errors.Count -ne 0) { throw 'Caller PowerShell parse failed' }
        & {
          foreach ($name in @('Resolve-RealPath', 'Assert-Hash')) {
            $found = @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq $name }, $true))
            if ($found.Count -ne 1) { throw 'Ambiguous guard selection' }
            . ([scriptblock]::Create($found[0].Extent.Text))
          }
          $pinNames = @('ExpectedBoundedProcessLibraryHash', 'ExpectedBoundedProcessImplementationHash', 'ExpectedSpecHash')
          foreach ($name in $pinNames) {
            $found = @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.AssignmentStatementAst] -and $node.Left.Extent.Text -ceq ('$' + $name) }, $true))
            if ($found.Count -ne 1) { throw 'Ambiguous source pin selection' }
            . ([scriptblock]::Create($found[0].Extent.Text))
          }
          if (($ExpectedBoundedProcessLibraryHash -join ',') -cne ($inputData.wrapperHashes -join ',') -or
              ($ExpectedBoundedProcessImplementationHash -join ',') -cne ($inputData.implementationHashes -join ',')) { throw 'Caller source pins differ' }
          if ($caller.name -ceq 'continuation-transaction' -and ($ExpectedSpecHash -join ',') -cne ($inputData.specHashes -join ',')) { throw 'Caller spec pins differ' }
          if ($caller.name -ceq 'tracker-mempool' -and $ExpectedSpecHash -cne $inputData.trackerSpecHash) { throw 'Tracker spec pin differs' }
          foreach ($case in $inputData.cases) {
            if (($case.PSObject.Properties.Name -contains 'caller') -and $case.caller -cne $caller.name) { continue }
            $accepted = & {
              $expected = if ($case.pins -ceq 'wrapper') { $ExpectedBoundedProcessLibraryHash }
                elseif ($case.pins -ceq 'spec') { $ExpectedSpecHash } else { $ExpectedBoundedProcessImplementationHash }
              if ($case.PSObject.Properties.Name -contains 'expected') { $expected = $case.expected }
              if ($case.PSObject.Properties.Name -contains 'legacyDigest') {
                # Only this historical-digest branch substitutes hash metadata; no historical source bytes are loaded.
                function Get-FileHash { param($LiteralPath, $Algorithm, $ErrorAction) [pscustomobject]@{ Hash = $inputData.oldWrapperHash } }
              }
              try { Assert-Hash $case.path $expected; return $true } catch { return $false }
            }
            [pscustomobject]@{ name = $caller.name + ': ' + $case.name; accepted = $accepted }
          }
        } | ForEach-Object { $results += $_ }
      }
      ConvertTo-Json -InputObject @($results) -Compress
    `;
    const payload = { callers: callers.map(name => ({ name, path: resolve(root, `validity-proof/consumer-jvm/run-substrate-federated-native-${name}.ps1`) })),
      wrapperHashes, implementationHashes, specHashes, trackerSpecHash, oldWrapperHash, cases: cases.map(value => ({ ...value, path: paths[value.file] })) };
    const result = await runBoundedProcess({
      executablePath: resolve(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')],
      cwd: directory,
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.SystemRoot,
        E2S_SOURCE_PIN_CASES: Buffer.from(JSON.stringify(payload)).toString('base64') },
      timeoutMs: 15_000, terminationGraceMs: 5_000, maxOutputBytes: 64 * 1024,
      label: 'actual JVM caller source hash guards',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe('');
    const values = JSON.parse(result.stdout) as { name: string; accepted: boolean }[];
    expect(values.map(value => value.name)).toEqual(callers.flatMap(caller => casesFor(caller).map(value => `${caller}: ${value.name}`)));
    expect(values.every(value => typeof value.accepted === 'boolean')).toBe(true);
    observed = new Map(values.map(value => [value.name, value.accepted]));
  } finally {
    for (const path of written) unlinkSync(path);
  }
}, 30_000);

describe.each(callers)('%s exact source pin guard', caller => {
  it.each(casesFor(caller))('$name', value => {
    expect(observed.get(`${caller}: ${value.name}`)).toBe(value.accepted);
  });
});
