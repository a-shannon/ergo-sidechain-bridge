import { existsSync } from 'fs';

import { resolveStateDbPath } from '../post-submit-observe-paths.js';
import { StateTracker } from '../state-tracker.js';
import { ErgoClient } from '../ergo-client.js';
import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import { validateReadOnlyNodeUrl } from '../read-only-node-url.js';
import {
  observeTestnetRecoveryDrill,
  type TestnetRecoveryDrillKind,
} from '../testnet-recovery-drill-evidence.js';

interface CliArgs {
  kind?: TestnetRecoveryDrillKind;
  expectedTxId?: string;
  pegOutBurnTxId?: string;
  singletonInventoryId?: string;
  nodeUrl?: string;
  stateDb?: string;
  jsonOut?: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--kind') {
      args.kind = requireChoice(requireValue(argv, index, arg), arg, [
        'failed-broadcast-phantom-avl',
        'reorged-burn-stale-singleton',
      ] as const);
      index += 1;
      continue;
    }
    if (arg === '--expected-tx-id') {
      args.expectedTxId = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--peg-out-burn-tx-id') {
      args.pegOutBurnTxId = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--singleton-inventory-id') {
      args.singletonInventoryId = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--node-url') {
      args.nodeUrl = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--state-db') {
      args.stateDb = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--json-out') {
      args.jsonOut = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function requireChoice<T extends string>(value: string, option: string, choices: readonly T[]): T {
  if (!choices.includes(value as T)) {
    throw new Error(`${option} must be one of: ${choices.join(', ')}`);
  }
  return value as T;
}

function usage(): void {
  console.error([
    'Usage:',
    '  npm run rehearsal:recovery-observe -- --kind failed-broadcast-phantom-avl --expected-tx-id <64hex> --peg-out-burn-tx-id <64hex> [--node-url <http://...>] --state-db <read-only-state-db> --json-out <report.json>',
    '  npm run rehearsal:recovery-observe -- --kind reorged-burn-stale-singleton --peg-out-burn-tx-id <64hex> --singleton-inventory-id <64hex> [--node-url <http://...>] --state-db <read-only-state-db> --json-out <report.json>',
    '',
    'This command observes recovery state only. It opens SQLite read-only and uses a read-only Ergo node client.',
  ].join('\n'));
}

let args: CliArgs;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err: any) {
  console.error(err?.message ?? String(err));
  usage();
  process.exit(1);
}

if (
  args.help ||
  !args.kind ||
  !args.pegOutBurnTxId ||
  !args.jsonOut ||
  (args.kind === 'failed-broadcast-phantom-avl' && !args.expectedTxId) ||
  (args.kind === 'reorged-burn-stale-singleton' && !args.singletonInventoryId)
) {
  usage();
  process.exit(args.help ? 0 : 1);
}

const nodeUrlErrors = validateReadOnlyNodeUrl(args.nodeUrl, 'recovery observation: --node-url');
if (nodeUrlErrors.length > 0) {
  for (const error of nodeUrlErrors) console.error(error);
  process.exit(1);
}
const outputTarget = resolveEvidenceJsonOutputPath(args.jsonOut);
if (outputTarget.errors.length > 0) {
  for (const error of outputTarget.errors) console.error(error);
  process.exit(1);
}
const stateDbTarget = resolveCliStateDbPath(args.stateDb);
if (stateDbTarget.errors.length > 0) {
  for (const error of stateDbTarget.errors) console.error(error);
  process.exit(1);
}
const stateDbPath = stateDbTarget.path;
if (stateDbPath === undefined) {
  console.error(
    'recovery observation: --state-db is required for read-only state observation; no default runtime database is opened',
  );
  process.exit(1);
}

const state = new StateTracker(stateDbPath, { readOnly: true });
try {
  const report = await observeTestnetRecoveryDrill({
    kind: args.kind,
    pegOutBurnTxId: args.pegOutBurnTxId,
    expectedTxId: args.expectedTxId,
    singletonInventoryId: args.singletonInventoryId,
    stateTargetClass: 'operator-provided-state-db',
    ergo: new ErgoClient(args.nodeUrl, { readOnly: true }),
    state,
  });

  for (const line of report.lines) console.log(line);
  const output = writeOfflineReportJson(args.jsonOut, {
    schemaVersion: 1,
    ...report,
  });
  if (output.errors.length > 0) {
    for (const error of output.errors) console.error(error);
    process.exitCode = 1;
  } else {
    console.log(formatOfflineReportJsonWriteLine('recovery observation report', args.jsonOut));
  }
  if (report.status === 'BLOCKED') {
    process.exitCode = 1;
  }
} finally {
  state.close();
}

function resolveCliStateDbPath(target: string | undefined): { path?: string; errors: string[] } {
  if (target === undefined) {
    return {
      errors: [
        'recovery observation: --state-db is required for read-only state observation; no default runtime database is opened',
      ],
    };
  }

  const resolved = resolveStateDbPath(target);
  if (resolved.errors.length > 0) {
    return { errors: resolved.errors.map(error => `recovery observation: ${error}`) };
  }
  if (!resolved.path || !existsSync(resolved.path)) {
    return { errors: ['recovery observation: --state-db could not be read in read-only mode'] };
  }
  return { path: resolved.path, errors: [] };
}
