import { existsSync } from 'fs';

import { ERGO_CONFIG } from '../config.js';
import { ErgoClient } from '../ergo-client.js';
import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js';
import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import {
  formatOfflineReportJsonWriteLine,
  writeOfflineReportJson,
} from '../offline-report-json.js';
import { resolveStateDbPath } from '../post-submit-observe-paths.js';
import { validateReadOnlyNodeUrl } from '../read-only-node-url.js';
import { StateTracker } from '../state-tracker.js';
import {
  observeTestnetRehearsalPostSubmitEvidence,
  type ObservedPegOutRow,
  type TestnetRehearsalPostSubmitObserveInput,
} from '../testnet-rehearsal-post-submit-observe.js';

interface CliArgs {
  expectedTxId?: string;
  submittedTxId?: string;
  burnTxIds: string[];
  nodeUrl?: string;
  stateDb?: string;
  submissionArtifact?: string;
  confirmationArtifact?: string;
  finalityEvidenceArtifact?: string;
  reconciliationArtifact?: string;
  submissionTimestamp?: string;
  firstObservedMempoolHeight?: string;
  confirmationsRequired?: string;
  spvTrackerNftId?: string;
  aggregateDupNftId?: string;
  aggregateUnlockErgoTreeHex?: string;
  feeNanoErg?: string;
  failedEventQueue?: string;
  manualRepairPerformed?: 'yes' | 'no';
  livePreflightReport?: string;
  out?: string;
  jsonOut?: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    burnTxIds: [],
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--expected-tx-id') {
      args.expectedTxId = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--submitted-tx-id') {
      args.submittedTxId = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--burn-tx-id') {
      args.burnTxIds.push(requireValue(argv, index, arg));
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
    if (arg === '--submission-artifact') {
      args.submissionArtifact = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--confirmation-artifact') {
      args.confirmationArtifact = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--finality-evidence-artifact') {
      args.finalityEvidenceArtifact = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--reconciliation-artifact') {
      args.reconciliationArtifact = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--submission-timestamp') {
      args.submissionTimestamp = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--first-observed-mempool-height') {
      args.firstObservedMempoolHeight = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--confirmations-required') {
      args.confirmationsRequired = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--spv-tracker-nft-id') {
      args.spvTrackerNftId = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--aggregate-dup-nft-id') {
      args.aggregateDupNftId = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--aggregate-unlock-ergo-tree-hex') {
      args.aggregateUnlockErgoTreeHex = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--fee-nanoerg') {
      args.feeNanoErg = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--failed-event-queue') {
      args.failedEventQueue = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--manual-repair-performed') {
      args.manualRepairPerformed = requireChoice(requireValue(argv, index, arg), arg, ['yes', 'no'] as const);
      index += 1;
      continue;
    }
    if (arg === '--live-preflight-report') {
      args.livePreflightReport = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--out') {
      args.out = requireValue(argv, index, arg);
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
    '  npm run rehearsal:post-submit:observe -- --expected-tx-id <64hex> --submitted-tx-id <64hex> --burn-tx-id <64hex> [--burn-tx-id <64hex> ...] --submission-artifact <artifact://...> --confirmation-artifact <artifact://...> --finality-evidence-artifact <artifact://...> --reconciliation-artifact <artifact://...> --submission-timestamp <YYYY-MM-DDTHH:mm:ssZ> --first-observed-mempool-height <n> --confirmations-required <n> --fee-nanoerg <positive-int> --failed-event-queue <status> --manual-repair-performed <yes|no> --live-preflight-report <live-preflight.json> --spv-tracker-nft-id <64hex> --aggregate-dup-nft-id <64hex> --state-db <read-only-state-db> [--aggregate-unlock-ergo-tree-hex <hex>] [--node-url <http://...>] [--out <evidence.md>] [--json-out <report.json>]',
    '',
    'SPV tracker and aggregate DUP NFT IDs must be supplied explicitly; this command does not read deployed-state defaults.',
    'The JSON report records settlementOutputs.outputCount and settlementOutputs.boxIds in observed transaction output order for release-gate validation.',
    'This command only performs read-only node and SQLite observation after an already approved live submit. It never signs, submits, confirms, reconciles, or approves transactions.',
  ].join('\n'));
}

function requireInput(args: CliArgs): Omit<TestnetRehearsalPostSubmitObserveInput, 'tx' | 'pegOutRows' | 'currentErgoHeight'> {
  const missing: string[] = [];
  const required: Array<[keyof CliArgs, string]> = [
    ['expectedTxId', '--expected-tx-id'],
    ['submittedTxId', '--submitted-tx-id'],
    ['submissionArtifact', '--submission-artifact'],
    ['confirmationArtifact', '--confirmation-artifact'],
    ['finalityEvidenceArtifact', '--finality-evidence-artifact'],
    ['reconciliationArtifact', '--reconciliation-artifact'],
    ['submissionTimestamp', '--submission-timestamp'],
    ['firstObservedMempoolHeight', '--first-observed-mempool-height'],
    ['confirmationsRequired', '--confirmations-required'],
    ['feeNanoErg', '--fee-nanoerg'],
    ['failedEventQueue', '--failed-event-queue'],
    ['manualRepairPerformed', '--manual-repair-performed'],
    ['livePreflightReport', '--live-preflight-report'],
    ['spvTrackerNftId', '--spv-tracker-nft-id'],
    ['aggregateDupNftId', '--aggregate-dup-nft-id'],
  ];
  for (const [key, option] of required) {
    if (!args[key]) missing.push(option);
  }
  if (args.burnTxIds.length === 0) missing.push('--burn-tx-id');
  if (missing.length > 0) {
    throw new Error(`Missing required option(s): ${missing.join(', ')}`);
  }
  return {
    expectedTxId: args.expectedTxId!,
    submittedTxId: args.submittedTxId!,
    submissionArtifact: args.submissionArtifact!,
    confirmationArtifact: args.confirmationArtifact!,
    finalityEvidenceArtifact: args.finalityEvidenceArtifact!,
    reconciliationArtifact: args.reconciliationArtifact!,
    submissionTimestamp: args.submissionTimestamp!,
    firstObservedMempoolHeight: args.firstObservedMempoolHeight!,
    confirmationsRequired: args.confirmationsRequired!,
    spvTrackerNftId: args.spvTrackerNftId!,
    aggregateDupNftId: args.aggregateDupNftId!,
    aggregateUnlockErgoTreeHex: args.aggregateUnlockErgoTreeHex,
    feeNanoErg: args.feeNanoErg!,
    failedEventQueue: args.failedEventQueue!,
    manualRepairPerformed: args.manualRepairPerformed!,
    stateTargetClass: 'operator-provided-state-db',
  };
}

function rowValue(row: any, snake: string, camel: string): any {
  return row?.[snake] ?? row?.[camel];
}

async function readObservedPegOutRow(
  state: StateTracker,
  ergo: ErgoClient,
  burnTxId: string,
): Promise<ObservedPegOutRow> {
  const row = state.getPegOutByTxHash(burnTxId) ?? state.getPegOutByTxHash(`0x${burnTxId}`);
  if (!row) {
    throw new Error('peg-out row not found in read-only state database');
  }

  const recipientAddress = rowValue(row, 'ergo_recipient_address', 'ergoRecipientAddress');
  if (!recipientAddress) {
    throw new Error('peg-out row is missing recipient address');
  }

  return {
    burnTxId: rowValue(row, 'sidechain_burn_tx_hash', 'sidechainBurnTxHash'),
    status: rowValue(row, 'status', 'status'),
    phase2UnlockTxId: rowValue(row, 'phase2_unlock_tx_id', 'phase2UnlockTxId'),
    pendingAvlKey: rowValue(row, 'pending_avl_key', 'pendingAvlKey'),
    amountNanoErg: rowValue(row, 'amount_nanoerg', 'amountNanoErg'),
    recipientErgoTreeHex: await ergo.addressToTree(recipientAddress),
  };
}

let args: CliArgs;
try {
  args = parseArgs(process.argv.slice(2));
} catch (err: any) {
  console.error(err?.message ?? String(err));
  usage();
  process.exit(1);
}

if (args.help) {
  usage();
  process.exit(0);
}

const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;
if (outputTarget?.errors.length) {
  for (const error of outputTarget.errors) console.error(error);
  process.exit(1);
}
const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;
if (jsonOutputTarget?.errors.length) {
  for (const error of jsonOutputTarget.errors) console.error(error);
  process.exit(1);
}

let baseInput: Omit<TestnetRehearsalPostSubmitObserveInput, 'tx' | 'pegOutRows' | 'currentErgoHeight'>;
try {
  baseInput = requireInput(args);
} catch (err: any) {
  console.error(err?.message ?? String(err));
  usage();
  process.exit(1);
}

const stateDbTarget = resolvePostSubmitObserveStateDbPath(args.stateDb);
if (stateDbTarget.errors.length > 0) {
  for (const error of stateDbTarget.errors) console.error(error);
  process.exit(1);
}

const livePreflightReport = args.livePreflightReport
  ? readEvidenceJsonTarget(args.livePreflightReport, '--live-preflight-report')
  : undefined;
if (livePreflightReport?.errors.length) {
  for (const error of livePreflightReport.errors) console.error(error);
  process.exit(1);
}
const nodeUrlErrors = validateReadOnlyNodeUrl(
  args.nodeUrl,
  'testnet rehearsal post-submit observe: --node-url',
);
if (nodeUrlErrors.length > 0) {
  for (const error of nodeUrlErrors) console.error(error);
  process.exit(1);
}

let state: StateTracker | undefined;
try {
  const ergo = new ErgoClient(args.nodeUrl, { readOnly: true });
  state = new StateTracker(stateDbTarget.path!, { readOnly: true });
  const [tx, nodeInfo, pegOutRows] = await Promise.all([
    ergo.getTransaction(args.submittedTxId!),
    ergo.getInfo(),
    Promise.all(args.burnTxIds.map(burnTxId => readObservedPegOutRow(state!, ergo, burnTxId))),
  ]);
  const report = observeTestnetRehearsalPostSubmitEvidence({
    ...baseInput,
    tx,
    pegOutRows,
    currentErgoHeight: nodeInfo.fullHeight,
    nodeUrl: args.nodeUrl ?? ERGO_CONFIG.nodeUrl,
    observedAt: new Date().toISOString(),
    nodeNetwork: nodeInfo.network,
    stateTargetClass: 'operator-provided-state-db',
    livePreflightReport: livePreflightReport?.json,
    livePreflightReportTarget: args.livePreflightReport,
  });

  for (const line of report.lines) console.log(line);
  if (args.jsonOut) {
    const output = writeOfflineReportJson(args.jsonOut, {
      schemaVersion: 1,
      ...report,
    });
    if (output.errors.length > 0) {
      for (const error of output.errors) console.error(error);
      process.exitCode = 1;
    } else {
      console.log(formatOfflineReportJsonWriteLine('post-submit observe report', args.jsonOut));
    }
  }
  if (report.status === 'BLOCKED') {
    process.exitCode = 1;
  }
} catch (err: any) {
  console.error(`testnet rehearsal post-submit observe failed: ${err?.message ?? String(err)}`);
  process.exitCode = 1;
} finally {
  state?.close();
}

function resolvePostSubmitObserveStateDbPath(target: string | undefined): { path?: string; errors: string[] } {
  if (target === undefined) {
    return {
      errors: [
        'testnet rehearsal post-submit observe: --state-db is required for read-only state observation; no default runtime database is opened',
      ],
    };
  }

  const resolved = resolveStateDbPath(target);
  if (resolved.errors.length > 0) {
    return { errors: resolved.errors.map(error => `testnet rehearsal post-submit observe: ${error}`) };
  }
  if (!resolved.path || !existsSync(resolved.path)) {
    return { errors: ['testnet rehearsal post-submit observe: --state-db could not be read in read-only mode'] };
  }
  return { path: resolved.path, errors: [] };
}
