import { realpathSync, statfsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, relative, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { runBoundedProcess } from './bounded-process-runner.js';

const runner = resolve(import.meta.dirname, '../../validity-proof/consumer-jvm/run-substrate-federated-native-tracker-mempool.ps1');
const summary = [
  '[info] Total number of tests run: 20',
  '[info] Suites: completed 2, aborted 0',
  '[info] Tests: succeeded 20, failed 0, canceled 0, ignored 0, pending 0',
  '[info] All tests passed.',
];
const good = summary.join('\n') + '\n';
interface Case { name: string; output: string; exitCode: number; accepted: boolean; mutant?: 'count' | 'exit' | 'ignored' }
const cases: Case[] = [
  { name: 'accepts exact LF success', output: good, exitCode: 0, accepted: true },
  { name: 'accepts exact CRLF success', output: good.replace(/\n/g, '\r\n'), exitCode: 0, accepted: true },
  { name: 'refuses empty output', output: '', exitCode: 0, accepted: false },
];
function changed(name: string, from: string, to: string): void {
  if (good.split(from).length !== 2) throw new Error('output fixture mutation must be isolated');
  cases.push({ name, output: good.replace(from, to), exitCode: 0, accepted: false });
}
changed('refuses fewer tests', 'tests run: 20', 'tests run: 19');
changed('refuses extra tests', 'tests run: 20', 'tests run: 21');
changed('refuses fractional total', 'tests run: 20', 'tests run: 20.0');
changed('refuses fewer completed suites', 'completed 2', 'completed 1');
changed('refuses extra completed suite', 'completed 2', 'completed 3');
changed('refuses fractional completed suites', 'completed 2', 'completed 2.0');
changed('refuses aborted suite', 'aborted 0', 'aborted 1');
changed('refuses fractional aborted suites', 'aborted 0', 'aborted 0.0');
changed('refuses fewer successes', 'succeeded 20', 'succeeded 19');
changed('refuses extra successes', 'succeeded 20', 'succeeded 21');
changed('refuses fractional successes', 'succeeded 20', 'succeeded 20.0');
for (const category of ['failed', 'canceled', 'ignored', 'pending']) {
  changed(`refuses ${category} case`, `${category} 0`, `${category} 1`);
  changed(`refuses fractional ${category}`, `${category} 0`, `${category} 0.0`);
}
for (const [index, category] of ['count', 'suites', 'outcomes', 'marker'].entries()) {
  const line = summary[index]!;
  changed(`refuses missing ${category}`, line + '\n', '');
  changed(`refuses duplicate ${category}`, line, line + '\n' + line);
  changed(`refuses ${category} trailing data`, line, line + ' extra');
}
changed('refuses malformed duplicate count', summary[0]!, summary[0]! + '\n[info] Total number of tests run: invalid');
changed('refuses extra outcome category', summary[2]!, summary[2]! + ', excluded 0');
changed('refuses marker substring', summary[3]!, 'prefix ' + summary[3]!);
changed('refuses missing marker punctuation', summary[3]!, '[info] All tests passed');
cases.push(
  // This composite counterexample passed the historical total-plus-substring guard.
  { name: 'refuses known nineteen-successes one-ignored counterexample',
    output: good.replace('succeeded 20', 'succeeded 19').replace('ignored 0', 'ignored 1'), exitCode: 0, accepted: false },
  { name: 'refuses nonzero exit', output: good, exitCode: 1, accepted: false },
  { name: 'refuses negative exit', output: good, exitCode: -1, accepted: false },
  { name: 'kills count uniqueness mutant', output: summary[0]! + '\n' + good, exitCode: 0, accepted: true, mutant: 'count' },
  { name: 'kills zero-exit mutant', output: good, exitCode: 1, accepted: true, mutant: 'exit' },
  { name: 'kills ignored-category mutant', output: good.replace('ignored 0', 'ignored 1'), exitCode: 0, accepted: true, mutant: 'ignored' },
);

const command = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version Latest
$request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:E2S_TRACKER_RUNNER_CASES)) | ConvertFrom-Json
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($request.runner, [ref]$tokens, [ref]$errors)
if (@($errors).Count -ne 0) { throw 'Runner source parse failed' }
$definitions = @($ast.FindAll({ param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'Assert-SuccessOutput'
}, $true))
$owners = @($ast.FindAll({ param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'Invoke-BoundedJob'
}, $true))
if ($definitions.Count -ne 1 -or $owners.Count -ne 1) { throw 'One actual guard and bounded invocation required' }
$calls = @($owners[0].Body.FindAll({ param($node)
    $node -is [Management.Automation.Language.CommandAst] -and $node.GetCommandName() -ceq 'Assert-SuccessOutput'
}, $true))
if ($calls.Count -ne 1 -or $calls[0].CommandElements.Count -ne 3 -or
    $calls[0].CommandElements[1].Extent.Text -cne '$output' -or
    $calls[0].CommandElements[2].Extent.Text -cne '$exitCode') { throw 'Actual output and exit must reach the guard' }
$results = @(foreach ($case in $request.cases) {
    $body = $definitions[0].Extent.Text
    if ($case.mutant -ceq 'ignored') {
        $needle = ', ignored 0, pending 0'
        if (($body.Split(@($needle), [StringSplitOptions]::None)).Count -ne 2) { throw 'One ignored predicate required' }
        $body = $body.Replace($needle, ', ignored [0-9]+, pending 0')
    } elseif ($case.mutant -cne '') {
        $target = if ($case.mutant -ceq 'count') { '$counts.Count -ne 1' } elseif ($case.mutant -ceq 'exit') { '$ExitCode -ne 0' } else { throw 'Unknown mutant' }
        $nodes = @($definitions[0].FindAll({ param($node)
            $node -is [Management.Automation.Language.BinaryExpressionAst] -and $node.Extent.Text -ceq $target
        }, $true))
        if ($nodes.Count -ne 1) { throw 'One deciding predicate required' }
        $replacement = if ($case.mutant -ceq 'count') { '$counts.Count -lt 1' } else { '$false' }
        $offset = $nodes[0].Extent.StartOffset - $definitions[0].Extent.StartOffset
        $body = $body.Remove($offset, $nodes[0].Extent.Text.Length).Insert($offset, $replacement)
    }
    & {
        param($source, $item)
        # Execute only the real extracted function; never the runner body or owner.
        . ([scriptblock]::Create($source))
        try { Assert-SuccessOutput $item.output $item.exitCode; $accepted = $true }
        catch { $accepted = $false }
        [pscustomobject]@{ name = $item.name; accepted = $accepted }
    } $body $case
})
ConvertTo-Json -Compress -InputObject $results
`;

let observed: Map<string, boolean>;
beforeAll(async () => {
  if (process.platform !== 'win32' || !process.env.SystemRoot) throw new Error('Tracker runner guard tests require Windows PowerShell');
  const directory = realpathSync(tmpdir());
  const relativePath = relative(resolve(import.meta.dirname, '../..'), directory);
  if (!relativePath || (!isAbsolute(relativePath) && relativePath !== '..'
    && !relativePath.startsWith('..\\') && !relativePath.startsWith('../'))) throw new Error('Guard working directory must be external');
  const space = statfsSync(directory, { bigint: true });
  if (space.bavail * space.bsize < 10n * 1024n ** 3n) throw new Error('Insufficient guard test headroom');
  const result = await runBoundedProcess({
    executablePath: resolve(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')],
    cwd: directory,
    env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.SystemRoot,
      E2S_TRACKER_RUNNER_CASES: Buffer.from(JSON.stringify({ runner,
        cases: cases.map(value => ({ ...value, mutant: value.mutant ?? '' })) })).toString('base64') },
    timeoutMs: 15_000, terminationGraceMs: 5_000, maxOutputBytes: 64 * 1024,
    label: 'actual tracker runner acceptance function',
  });
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe('');
  const values = JSON.parse(result.stdout) as { name: string; accepted: boolean }[];
  expect(values.map(value => value.name)).toEqual(cases.map(value => value.name));
  expect(values.every(value => typeof value.accepted === 'boolean')).toBe(true);
  observed = new Map(values.map(value => [value.name, value.accepted]));
}, 30_000);

describe('actual offline tracker runner acceptance', () => {
  it.each(cases)('$name', value => {
    expect(observed.get(value.name)).toBe(value.accepted);
    if (value.mutant === 'count') expect(observed.get('refuses duplicate count')).toBe(false);
    if (value.mutant === 'exit') expect(observed.get('refuses nonzero exit')).toBe(false);
    if (value.mutant === 'ignored') expect(observed.get('refuses ignored case')).toBe(false);
  });
});
