/**
 * WP-06T3 source-to-settlement pinned-JVM conformance.
 *
 * This command extends WP-06T1 in one process: pinned source and public
 * synthetic vectors produce an immutable tracker-admission capability, and
 * the linked authenticated settlement VM consumes that exact signed tracker
 * successor to derive the payout and DUP transition. Cargo may fetch missing
 * locked dependencies. Ergo boxes, signing keys, and state contexts are
 * ephemeral; each JVM replay uses an isolated per-run, secret-free fixture that
 * is deleted after execution. There is no external wallet, chain RPC,
 * /transactions/check, submit, broadcast, deployment, database, or mutable
 * runtime-state capability.
 */

import { isAbsolute, resolve } from 'path';
import { fileURLToPath } from 'url';

import {
  assertWp06SourceToTrackerVmResultProvenance,
  runWp06SourceToTrackerVm,
} from './spike15-wp06-source-to-tracker-vm.js';
import {
  assertWp06SourceBoundSettlementVmResultProvenance,
  runWp06SourceBoundAuthenticatedSettlementVm,
  type Wp06SourceBoundSettlementVmResult,
} from './spike14-authenticated-settlement-full-tx-eval.js';
import {
  assertWp06SourceToSettlementJvmContinuity,
} from '../../wp06-source-bound-jvm-validation.js';

interface Arguments {
  frontierSourcePath: string;
  ergoSourcePath: string;
  cargoExecutablePath: string;
  rustcExecutablePath: string;
  gitExecutablePath: string;
}

export async function runWp06SourceToSettlementVm(
  input: Arguments,
): Promise<Wp06SourceBoundSettlementVmResult> {
  requireAbsolutePaths(input);
  const handoff = await runWp06SourceToTrackerVm(input);
  assertWp06SourceToTrackerVmResultProvenance(handoff);
  const rehydratedCopy = deepFreeze(structuredClone(handoff));
  let copyRejected = false;
  try {
    assertWp06SourceToTrackerVmResultProvenance(rehydratedCopy);
  } catch (error) {
    copyRejected = /source-to-tracker provenance/i.test(String((error as Error).message));
  }
  if (!copyRejected) {
    throw new Error('serialized WP-06 handoff copy unexpectedly retained settlement authority');
  }
  console.log('PASS deeply frozen handoff copy rejected without process-local provenance.');

  const settlement = await runWp06SourceBoundAuthenticatedSettlementVm({
    ergoSourcePath: input.ergoSourcePath,
    sourceToTrackerHandoff: handoff,
  });
  assertWp06SourceBoundSettlementVmResultProvenance(settlement);
  assertWp06SourceToSettlementJvmContinuity({ handoff, settlement });

  console.log(
    'PASS pinned source -> exact tracker JVM -> exact successor -> payout/DUP settlement JVM.',
  );
  console.log(
    'BOUNDARY: this is offline local VM conformance over synthetic public vectors only; each '
    + 'secret-free JVM fixture is deleted after its isolated per-run execution. Cargo may fetch '
    + 'missing locked dependencies. R9 remains the finality authority and Ergo does not verify '
    + 'GRANDPA payload semantics. Admission eligibility, node stateful acceptance, committee-bypass '
    + 'prevention, Gate 5 closure, submit, broadcast, deployment, trustless operation, and '
    + 'production readiness remain false.',
  );
  return settlement;
}

function requireAbsolutePaths(input: Arguments): void {
  for (const [label, value] of [
    ['Frontier source', input.frontierSourcePath],
    ['Ergo source', input.ergoSourcePath],
    ['Cargo executable', input.cargoExecutablePath],
    ['rustc executable', input.rustcExecutablePath],
    ['Git executable', input.gitExecutablePath],
  ] as const) {
    if (!isAbsolute(value)) throw new Error(`${label} path must be absolute`);
  }
}

function parseArguments(argv: string[]): Arguments {
  const optionNames = [
    '--frontier-source',
    '--ergo-source',
    '--cargo',
    '--rustc',
    '--git',
  ] as const;
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
      throw new Error(
        'usage: spike16-wp06-source-to-settlement-vm '
        + '--frontier-source <absolute-path> --ergo-source <absolute-path> '
        + '--cargo <absolute-path> --rustc <absolute-path> --git <absolute-path>',
      );
    }
    values.set(option, value);
  }
  for (const option of optionNames) {
    if (!values.has(option)) throw new Error(`missing required option ${option}`);
  }
  return {
    frontierSourcePath: values.get('--frontier-source')!,
    ergoSourcePath: values.get('--ergo-source')!,
    cargoExecutablePath: values.get('--cargo')!,
    rustcExecutablePath: values.get('--rustc')!,
    gitExecutablePath: values.get('--git')!,
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void runWp06SourceToSettlementVm(parseArguments(process.argv.slice(2))).catch(error => {
    console.error('FATAL:', error);
    process.exit(1);
  });
}
