import { resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  WP06_FIXTURE_LIFECYCLE_WORKER_SENTINEL,
  assertAbsoluteLifecyclePaths,
  buildWp06FixtureLifecycleWorkerSummary,
  runWp06FixtureBackedLifecycle,
  type Wp06FixtureLifecyclePaths,
} from '../../test-fixtures/wp06-fixture-backed-lifecycle.js';
import {
  assertWp06SourceBoundSettlementVmResultProvenance,
} from './spike14-authenticated-settlement-full-tx-eval.js';
import { runWp06SourceToSettlementVm } from './spike16-wp06-source-to-settlement-vm.js';

export async function runWp06FixtureBackedLifecycleCli(argv: string[]): Promise<void> {
  const worker = argv[0] === '--worker';
  const input = parseArguments(worker ? argv.slice(1) : argv);
  if (worker) {
    const result = await runWp06SourceToSettlementVm(input);
    assertWp06SourceBoundSettlementVmResultProvenance(result);
    const summary = buildWp06FixtureLifecycleWorkerSummary(result);
    console.log(`${WP06_FIXTURE_LIFECYCLE_WORKER_SENTINEL}${JSON.stringify(summary)}`);
    return;
  }
  const report = await runWp06FixtureBackedLifecycle(input);
  console.log(JSON.stringify(report, null, 2));
}

function parseArguments(argv: string[]): Wp06FixtureLifecyclePaths {
  const optionNames = [
    '--frontier-source',
    '--ergo-source',
    '--cargo',
    '--rustc',
    '--git',
  ] as const;
  if (argv.length !== optionNames.length * 2) throw new Error('invalid WP-06 lifecycle arguments');
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (
      !optionNames.includes(option as typeof optionNames[number])
      || !value
      || value.startsWith('--')
      || values.has(option)
    ) {
      throw new Error('invalid WP-06 lifecycle arguments');
    }
    values.set(option, value);
  }
  const input: Wp06FixtureLifecyclePaths = {
    frontierSourcePath: values.get('--frontier-source')!,
    ergoSourcePath: values.get('--ergo-source')!,
    cargoExecutablePath: values.get('--cargo')!,
    rustcExecutablePath: values.get('--rustc')!,
    gitExecutablePath: values.get('--git')!,
  };
  assertAbsoluteLifecyclePaths(input);
  return input;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runWp06FixtureBackedLifecycleCli(process.argv.slice(2)).catch(error => {
    console.error('FATAL:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
