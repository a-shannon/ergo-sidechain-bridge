import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import {
  buildTestnetRehearsalPostSubmitEvidence,
  type TestnetRehearsalPostSubmitInput,
} from '../testnet-rehearsal-post-submit.js';

interface CliArgs {
  expectedTxId?: string;
  submittedTxId?: string;
  burnTxIds: string[];
  submissionArtifact?: string;
  confirmationArtifact?: string;
  finalityEvidenceArtifact?: string;
  reconciliationArtifact?: string;
  submissionTimestamp?: string;
  firstObservedMempoolHeight?: string;
  confirmationHeight?: string;
  confirmationCount?: string;
  confirmationsRequired?: string;
  settlementOutputBoxIds: string[];
  dupSuccessorBoxId?: string;
  spvTrackerSuccessorBoxId?: string;
  recipientPayoutBoxIds: string[];
  feeNanoErg?: string;
  pegOutStatus?: 'confirmed' | 'settled';
  failedEventQueue?: string;
  manualRepairPerformed?: 'yes' | 'no';
  livePreflightReport?: string;
  out?: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    burnTxIds: [],
    settlementOutputBoxIds: [],
    recipientPayoutBoxIds: [],
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--burn-tx-id') {
      args.burnTxIds.push(requireValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === '--settlement-output-box-id') {
      args.settlementOutputBoxIds.push(requireValue(argv, index, arg));
      index += 1;
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
    if (arg === '--confirmation-height') {
      args.confirmationHeight = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--confirmation-count') {
      args.confirmationCount = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--confirmations-required') {
      args.confirmationsRequired = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--dup-successor-box-id') {
      args.dupSuccessorBoxId = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--spv-tracker-successor-box-id') {
      args.spvTrackerSuccessorBoxId = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--recipient-payout-box-id') {
      args.recipientPayoutBoxIds.push(requireValue(argv, index, arg));
      index += 1;
      continue;
    }
    if (arg === '--fee-nanoerg') {
      args.feeNanoErg = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--peg-out-status') {
      args.pegOutStatus = requireChoice(requireValue(argv, index, arg), arg, ['confirmed', 'settled'] as const);
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

function requireArgs(args: CliArgs): TestnetRehearsalPostSubmitInput {
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
    ['confirmationHeight', '--confirmation-height'],
    ['confirmationCount', '--confirmation-count'],
    ['confirmationsRequired', '--confirmations-required'],
    ['dupSuccessorBoxId', '--dup-successor-box-id'],
    ['spvTrackerSuccessorBoxId', '--spv-tracker-successor-box-id'],
    ['feeNanoErg', '--fee-nanoerg'],
    ['pegOutStatus', '--peg-out-status'],
    ['failedEventQueue', '--failed-event-queue'],
    ['manualRepairPerformed', '--manual-repair-performed'],
    ['livePreflightReport', '--live-preflight-report'],
  ];

  for (const [key, option] of required) {
    if (!args[key]) missing.push(option);
  }
  if (args.burnTxIds.length === 0) missing.push('--burn-tx-id');
  if (args.settlementOutputBoxIds.length === 0) missing.push('--settlement-output-box-id');
  if (args.recipientPayoutBoxIds.length === 0) missing.push('--recipient-payout-box-id');
  if (missing.length > 0) {
    throw new Error(`Missing required option(s): ${missing.join(', ')}`);
  }

  return {
    expectedTxId: args.expectedTxId!,
    submittedTxId: args.submittedTxId!,
    burnTxIds: args.burnTxIds,
    submissionArtifact: args.submissionArtifact!,
    confirmationArtifact: args.confirmationArtifact!,
    finalityEvidenceArtifact: args.finalityEvidenceArtifact!,
    reconciliationArtifact: args.reconciliationArtifact!,
    submissionTimestamp: args.submissionTimestamp!,
    firstObservedMempoolHeight: args.firstObservedMempoolHeight!,
    confirmationHeight: args.confirmationHeight!,
    confirmationCount: args.confirmationCount!,
    confirmationsRequired: args.confirmationsRequired!,
    settlementOutputBoxIds: args.settlementOutputBoxIds,
    dupSuccessorBoxId: args.dupSuccessorBoxId!,
    spvTrackerSuccessorBoxId: args.spvTrackerSuccessorBoxId!,
    recipientPayoutBoxId: args.recipientPayoutBoxIds[0],
    recipientPayoutBoxIds: args.recipientPayoutBoxIds,
    feeNanoErg: args.feeNanoErg!,
    pegOutStatus: args.pegOutStatus!,
    failedEventQueue: args.failedEventQueue!,
    manualRepairPerformed: args.manualRepairPerformed!,
  };
}

function usage(): void {
  console.error([
    'Usage:',
    '  npm run rehearsal:post-submit -- --expected-tx-id <64hex> --submitted-tx-id <64hex> --burn-tx-id <64hex> [--burn-tx-id <64hex> ...] --submission-artifact <artifact://...> --confirmation-artifact <artifact://...> --finality-evidence-artifact <artifact://...> --reconciliation-artifact <artifact://...> --submission-timestamp <YYYY-MM-DDTHH:mm:ssZ> --first-observed-mempool-height <n> --confirmation-height <n> --confirmation-count <n> --confirmations-required <n> --settlement-output-box-id <64hex> [--settlement-output-box-id <64hex> ...] --dup-successor-box-id <64hex> --spv-tracker-successor-box-id <64hex> --recipient-payout-box-id <64hex> [--recipient-payout-box-id <64hex> ...] --fee-nanoerg <positive-int> --peg-out-status <confirmed|settled> --failed-event-queue <status> --manual-repair-performed <yes|no> --live-preflight-report <live-preflight.json> [--out <evidence.md>]',
    '',
    'Pass --settlement-output-box-id values in observed transaction output order: OUTPUTS(0) SPV tracker, OUTPUTS(1) aggregate DUP, OUTPUTS(2+i) payouts, then the final miner fee output.',
    'This command only assembles Markdown evidence from already collected live artifacts. It never submits or confirms transactions.',
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

if (args.help) {
  usage();
  process.exit(0);
}

let input: TestnetRehearsalPostSubmitInput;
try {
  input = requireArgs(args);
} catch (err: any) {
  console.error(err?.message ?? String(err));
  usage();
  process.exit(1);
}

const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;
if (outputTarget?.errors.length) {
  for (const error of outputTarget.errors) console.error(error);
  process.exit(1);
}
const livePreflightReport = args.livePreflightReport
  ? readEvidenceJsonTarget(args.livePreflightReport, '--live-preflight-report')
  : undefined;
if (livePreflightReport?.errors.length) {
  for (const error of livePreflightReport.errors) console.error(error);
  process.exit(1);
}

const report = buildTestnetRehearsalPostSubmitEvidence({
  ...input,
  livePreflightReport: livePreflightReport?.json,
  livePreflightReportTarget: args.livePreflightReport,
});
for (const line of report.lines) console.log(line);

if (report.status === 'BLOCKED') {
  process.exitCode = 1;
}
