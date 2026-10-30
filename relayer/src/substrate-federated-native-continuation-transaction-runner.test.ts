import { realpathSync, statfsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { runBoundedProcess } from './pinned-local-native-verifier-build.js';

const runner = resolve(import.meta.dirname, '../../validity-proof/consumer-jvm/run-substrate-federated-native-continuation-transaction.ps1');
// The actual SBT summary format, with the pinned 48-case closure. The
// previously accepted 33- and 35-case results must not satisfy this runner.
const summary = [
  '[info] Total number of tests run: 48',
  '[info] Suites: completed 1, aborted 0',
  '[info] Tests: succeeded 48, failed 0, canceled 0, ignored 0, pending 0',
  '[info] All tests passed.',
];
const good = summary.join('\n') + '\n';
interface Case {
  name: string;
  output: string;
  exitCode: number;
  accepted: boolean;
  mutant?: 'count' | 'exit';
}
const cases: Case[] = [
  { name: 'accepts complete LF success', output: good, exitCode: 0, accepted: true },
  { name: 'accepts complete CRLF success', output: good.replace(/\n/gu, '\r\n'), exitCode: 0, accepted: true },
  { name: 'refuses empty output', output: '', exitCode: 0, accepted: false },
];
const changed = (name: string, from: string, to: string): void => {
  if (good.split(from).length !== 2) throw new Error('runner fixture mutation is not isolated');
  cases.push({ name, output: good.replace(from, to), exitCode: 0, accepted: false });
};
changed('refuses one fewer test', 'tests run: 48', 'tests run: 47');
changed('refuses one extra test', 'tests run: 48', 'tests run: 49');
changed('refuses old 33-case count', 'tests run: 48', 'tests run: 33');
changed('refuses old 35-case count', 'tests run: 48', 'tests run: 35');
changed('refuses missing count', summary[0]! + '\n', '');
changed('refuses duplicate count', summary[0]!, summary[0]! + '\n' + summary[0]!);
changed('refuses contradictory count', summary[0]!, summary[0]! + '\n[info] Total number of tests run: 1');
changed('refuses malformed duplicate count', summary[0]!, summary[0]! + '\n[info] Total number of tests run: invalid');
changed('refuses zero completed suites', 'completed 1', 'completed 0');
changed('refuses extra completed suite', 'completed 1', 'completed 2');
changed('refuses aborted suite', 'aborted 0', 'aborted 1');
changed('refuses missing suites', summary[1]! + '\n', '');
changed('refuses duplicate suites', summary[1]!, summary[1]! + '\n' + summary[1]!);
changed('refuses contradictory suites', summary[1]!, summary[1]! + '\n[info] Suites: completed 0, aborted 1');
changed('refuses fewer successes', 'succeeded 48', 'succeeded 47');
changed('refuses failed case', 'failed 0', 'failed 1');
changed('refuses canceled case', 'canceled 0', 'canceled 1');
changed('refuses ignored case', 'ignored 0', 'ignored 1');
changed('refuses pending case', 'pending 0', 'pending 1');
changed('refuses missing outcome summary', summary[2]! + '\n', '');
changed('refuses duplicate outcome summary', summary[2]!, summary[2]! + '\n' + summary[2]!);
changed('refuses contradictory outcome summary', summary[2]!, summary[2]! + '\n[info] Tests: succeeded 47, failed 1, canceled 0, ignored 0, pending 0');
changed('refuses missing success marker', summary[3]! + '\n', '');
changed('refuses duplicate success marker', summary[3]!, summary[3]! + '\n' + summary[3]!);
changed('refuses marker suffix', summary[3]!, summary[3]! + ' not really');
changed('refuses marker substring', summary[3]!, 'prefix ' + summary[3]!);
cases.push(
  { name: 'refuses nonzero exit despite successful output', output: good, exitCode: 1, accepted: false },
  { name: 'refuses negative exit despite successful output', output: good, exitCode: -1, accepted: false },
  { name: 'kills duplicate-count guard mutant', output: summary[0]! + '\n' + good,
    exitCode: 0, accepted: true, mutant: 'count' },
  { name: 'kills zero-exit guard mutant', output: good, exitCode: 1, accepted: true, mutant: 'exit' },
);

const command = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest
$request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:E2S_CONTINUATION_RUNNER_CASES)) | ConvertFrom-Json
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($request.runner, [ref]$tokens, [ref]$parseErrors)
if (@($parseErrors).Count -ne 0) { throw 'runner source parse failed' }
$definitions = @($ast.FindAll({ param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'Assert-SuccessOutput'
}, $true))
if ($definitions.Count -ne 1) { throw 'exactly one acceptance function required' }
$owners = @($ast.FindAll({ param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'Invoke-BoundedJob'
}, $true))
if ($owners.Count -ne 1) { throw 'exactly one bounded invocation required' }
$calls = @($owners[0].Body.FindAll({ param($node)
    $node -is [Management.Automation.Language.CommandAst] -and $node.GetCommandName() -ceq 'Assert-SuccessOutput'
}, $true))
if ($calls.Count -ne 1 -or $calls[0].CommandElements.Count -ne 3 -or
    $calls[0].CommandElements[1].Extent.Text -cne '$output' -or
    $calls[0].CommandElements[2].Extent.Text -cne '$exitCode') { throw 'production result must reach acceptance function' }
$definition = $definitions[0].Extent.Text
$results = @(foreach ($case in $request.cases) {
    $body = $definition
    if ($case.mutant -cne '') {
        $target = if ($case.mutant -ceq 'count') { '$counts.Count -ne 1' } elseif ($case.mutant -ceq 'exit') { '$ExitCode -ne 0' } else { throw 'unknown mutant' }
        $nodes = @($definitions[0].FindAll({ param($node)
            $node -is [Management.Automation.Language.BinaryExpressionAst] -and $node.Extent.Text -ceq $target
        }, $true))
        if ($nodes.Count -ne 1) { throw 'one deciding predicate required for mutant' }
        $replacement = if ($case.mutant -ceq 'count') { '$counts.Count -lt 1' } else { '$false' }
        $offset = $nodes[0].Extent.StartOffset - $definitions[0].Extent.StartOffset
        $body = $body.Remove($offset, $nodes[0].Extent.Text.Length).Insert($offset, $replacement)
    }
    $result = & {
        param($source, $item)
        # Only the selected function body enters this fresh scope. The runner's
        # parameter block, source checks and process invocation never execute.
        . ([ScriptBlock]::Create($source))
        try {
            Assert-SuccessOutput $item.output $item.exitCode
            [pscustomobject]@{ name = $item.name; accepted = $true }
        } catch {
            [pscustomobject]@{ name = $item.name; accepted = $false }
        }
    } $body $case
    $result
})
ConvertTo-Json -Compress -Depth 4 -InputObject $results
`;

let observed: Map<string, boolean>;
beforeAll(async () => {
  // This is an executable Windows boundary test, never an optional skip.
  if (process.platform !== 'win32' || !process.env.SystemRoot) {
    throw new Error('continuation runner acceptance tests require Windows PowerShell');
  }
  const directory = realpathSync(tmpdir());
  const fromSource = relative(resolve(import.meta.dirname, '../..'), directory);
  if (!fromSource || (!isAbsolute(fromSource) && fromSource !== '..'
    && !fromSource.startsWith('..\\') && !fromSource.startsWith('../'))) {
    throw new Error('runner refusal working directory must be outside the source checkout');
  }
  const space = statfsSync(directory, { bigint: true });
  if (space.bavail * space.bsize < 10n * 1024n ** 3n) {
    throw new Error('insufficient fresh test headroom');
  }
  // Use the existing external temporary directory without writing work files.
  // All cases and extracted code stay in this bounded Windows process.
  const result = await runBoundedProcess({
    executablePath: resolve(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')],
    cwd: directory,
    env: {
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.SystemRoot,
      E2S_CONTINUATION_RUNNER_CASES: Buffer.from(JSON.stringify({ runner,
        cases: cases.map(value => ({ ...value, mutant: value.mutant ?? '' })) }), 'utf8').toString('base64'),
    },
    timeoutMs: 15_000,
    terminationGraceMs: 5_000,
    maxOutputBytes: 64 * 1024,
    label: 'offline continuation runner acceptance function',
  });
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe('');
  const values = JSON.parse(result.stdout) as { name: string; accepted: boolean }[];
  expect(values).toHaveLength(cases.length);
  expect(values.map(value => value.name)).toEqual(cases.map(value => value.name));
  expect(values.every(value => typeof value.accepted === 'boolean')).toBe(true);
  observed = new Map(values.map(value => [value.name, value.accepted]));
}, 30_000);

describe('actual offline continuation runner acceptance', () => {
  it.each(cases)('$name', value => {
    expect(observed.get(value.name)).toBe(value.accepted);
    if (value.mutant === 'count') expect(observed.get('refuses duplicate count')).toBe(false);
    if (value.mutant === 'exit') expect(observed.get('refuses nonzero exit despite successful output')).toBe(false);
  });
});
