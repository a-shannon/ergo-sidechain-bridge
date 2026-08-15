import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import {
  resolveAggregateSettlementEvidenceJsonPath,
} from '../aggregate-settlement-evidence.js';
import { resolveEvidenceOutputPath } from '../evidence-output-path.js';
import {
  assembleTestnetPrebroadcastEvidence,
  type TestnetPrebroadcastAssembleInput,
} from '../testnet-prebroadcast-assemble.js';

interface CliArgs {
  aggregateJson?: string;
  aggregateJsonLinkTarget?: string;
  evidencePackageName?: string;
  date?: string;
  operator?: string;
  reviewer?: string;
  gitCommit?: string;
  sidechainNetwork?: string;
  checkArtifact?: string;
  wasmTestArtifact?: string;
  readinessArtifact?: string;
  statusArtifact?: string;
  contextExtensionGuardResult?: string;
  broadcastPolicyResult?: string;
  cleanDeploymentStateEvidence?: string;
  currentErgoHeight?: string;
  currentSidechainHeight?: string;
  pegInEventIdOrTxId?: string;
  nonBroadcastArtifact?: string;
  daemonApprovalPreparation?: string;
  releaseNotesUpdated?: 'yes' | 'no';
  pendingEvidenceRegisterUpdated?: 'yes' | 'no';
  followUpRecoveryDrillRequired?: 'yes' | 'no';
  stopConditionsDiscovered?: string;
  classification?: 'pass' | 'fail' | 'inconclusive';
  out?: string;
  help: boolean;
}

const usageText = [
  'Usage:',
  '  npm run prebroadcast:assemble -- --aggregate-json <aggregate-check.json> --aggregate-json-link-target <aggregate-check.json> --evidence-package-name <name> --date <YYYY-MM-DD> --operator <name> --reviewer <name> --git-commit <commit> --sidechain-network <patched-devnet|testnet|non-mainnet> --check-artifact <artifact://...> --wasm-test-artifact <artifact://...> --readiness-artifact <artifact://...> --status-artifact <artifact://...> --context-extension-guard-result <artifact://... ContextExtension guard sigma-rust/JVM fail-closed> --broadcast-policy-result <artifact://... broadcast disabled> --clean-deployment-state-evidence <artifact://... deployment-state hash=... contract IDs=... singleton inventory=...> --current-ergo-height "<height> artifact://..." --current-sidechain-height "<height> artifact://..." --peg-in-event-id-or-tx-id "<64hex> artifact://..." --non-broadcast-artifact <artifact://...> [--daemon-approval-preparation <evidence>] [--release-notes-updated yes|no] [--pending-evidence-register-updated yes|no] [--follow-up-recovery-drill-required yes|no] [--stop-conditions-discovered <value>] [--classification pass|fail|inconclusive] [--out <evidence.md>]',
  '',
  'This command assembles Markdown evidence only. It does not read secrets, query nodes, sign, submit, confirm, reconcile, or broadcast transactions.',
].join('\n');

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--aggregate-json') {
      args.aggregateJson = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--aggregate-json-link-target') {
      args.aggregateJsonLinkTarget = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--evidence-package-name') {
      args.evidencePackageName = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--date') {
      args.date = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--operator') {
      args.operator = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--reviewer') {
      args.reviewer = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--git-commit') {
      args.gitCommit = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--sidechain-network') {
      args.sidechainNetwork = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--check-artifact') {
      args.checkArtifact = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--wasm-test-artifact') {
      args.wasmTestArtifact = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--readiness-artifact') {
      args.readinessArtifact = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--status-artifact') {
      args.statusArtifact = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--context-extension-guard-result') {
      args.contextExtensionGuardResult = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--broadcast-policy-result') {
      args.broadcastPolicyResult = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--clean-deployment-state-evidence') {
      args.cleanDeploymentStateEvidence = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--current-ergo-height') {
      args.currentErgoHeight = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--current-sidechain-height') {
      args.currentSidechainHeight = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--peg-in-event-id-or-tx-id') {
      args.pegInEventIdOrTxId = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--non-broadcast-artifact') {
      args.nonBroadcastArtifact = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--daemon-approval-preparation') {
      args.daemonApprovalPreparation = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--release-notes-updated') {
      args.releaseNotesUpdated = requireChoice(requireValue(argv, index, arg), arg, ['yes', 'no'] as const);
      index += 1;
      continue;
    }
    if (arg === '--pending-evidence-register-updated') {
      args.pendingEvidenceRegisterUpdated = requireChoice(requireValue(argv, index, arg), arg, ['yes', 'no'] as const);
      index += 1;
      continue;
    }
    if (arg === '--follow-up-recovery-drill-required') {
      args.followUpRecoveryDrillRequired = requireChoice(requireValue(argv, index, arg), arg, ['yes', 'no'] as const);
      index += 1;
      continue;
    }
    if (arg === '--stop-conditions-discovered') {
      args.stopConditionsDiscovered = requireValue(argv, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--classification') {
      args.classification = requireChoice(requireValue(argv, index, arg), arg, ['pass', 'fail', 'inconclusive'] as const);
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
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

function requireChoice<T extends string>(value: string, option: string, choices: readonly T[]): T {
  if (!choices.includes(value as T)) throw new Error(`${option} must be one of: ${choices.join(', ')}`);
  return value as T;
}

function readAggregateJsonRecord(target: string): unknown {
  const resolved = resolveAggregateSettlementEvidenceJsonPath(target);
  const label = resolved.label;
  if (resolved.errors.length > 0) {
    console.error(`${label}: aggregate evidence JSON input BLOCKED: ${resolved.errors.length} structural issue(s).`);
    for (const error of resolved.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  if (!resolved.path || !existsSync(resolved.path)) {
    console.error(`${label}: aggregate evidence JSON input could not be read in read-only mode`);
    process.exit(1);
  }

  try {
    return JSON.parse(readFileSync(resolved.path!, 'utf8'));
  } catch {
    console.error(`${label}: aggregate evidence JSON input could not be read or parsed`);
    process.exit(1);
  }
}

function requireInput(args: CliArgs, aggregateRecord: unknown): TestnetPrebroadcastAssembleInput {
  const required: Array<[keyof CliArgs, string]> = [
    ['aggregateJsonLinkTarget', '--aggregate-json-link-target'],
    ['evidencePackageName', '--evidence-package-name'],
    ['date', '--date'],
    ['operator', '--operator'],
    ['reviewer', '--reviewer'],
    ['gitCommit', '--git-commit'],
    ['sidechainNetwork', '--sidechain-network'],
    ['checkArtifact', '--check-artifact'],
    ['wasmTestArtifact', '--wasm-test-artifact'],
    ['readinessArtifact', '--readiness-artifact'],
    ['statusArtifact', '--status-artifact'],
    ['contextExtensionGuardResult', '--context-extension-guard-result'],
    ['broadcastPolicyResult', '--broadcast-policy-result'],
    ['cleanDeploymentStateEvidence', '--clean-deployment-state-evidence'],
    ['currentErgoHeight', '--current-ergo-height'],
    ['currentSidechainHeight', '--current-sidechain-height'],
    ['pegInEventIdOrTxId', '--peg-in-event-id-or-tx-id'],
    ['nonBroadcastArtifact', '--non-broadcast-artifact'],
  ];
  const missing = required
    .filter(([key]) => !args[key])
    .map(([, option]) => option);
  if (missing.length > 0) throw new Error(`Missing required option(s): ${missing.join(', ')}`);

  return {
    aggregateRecord,
    aggregateJsonLinkTarget: args.aggregateJsonLinkTarget!,
    evidencePackageName: args.evidencePackageName!,
    date: args.date!,
    operator: args.operator!,
    reviewer: args.reviewer!,
    gitCommit: args.gitCommit!,
    sidechainNetwork: args.sidechainNetwork!,
    checkArtifact: args.checkArtifact!,
    wasmTestArtifact: args.wasmTestArtifact!,
    readinessArtifact: args.readinessArtifact!,
    statusArtifact: args.statusArtifact!,
    contextExtensionGuardResult: args.contextExtensionGuardResult!,
    broadcastPolicyResult: args.broadcastPolicyResult!,
    cleanDeploymentStateEvidence: args.cleanDeploymentStateEvidence!,
    currentErgoHeight: args.currentErgoHeight!,
    currentSidechainHeight: args.currentSidechainHeight!,
    pegInEventIdOrTxId: args.pegInEventIdOrTxId!,
    nonBroadcastArtifact: args.nonBroadcastArtifact!,
    daemonApprovalPreparation: args.daemonApprovalPreparation,
    releaseNotesUpdated: args.releaseNotesUpdated,
    pendingEvidenceRegisterUpdated: args.pendingEvidenceRegisterUpdated,
    followUpRecoveryDrillRequired: args.followUpRecoveryDrillRequired,
    stopConditionsDiscovered: args.stopConditionsDiscovered,
    classification: args.classification,
  };
}

let args: CliArgs;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error: any) {
  console.error(error?.message ?? String(error));
  console.error(usageText);
  process.exit(1);
}

if (args.help) {
  console.error(usageText);
  process.exit(0);
}
if (!args.aggregateJson) {
  console.error('Missing required option(s): --aggregate-json');
  console.error(usageText);
  process.exit(1);
}

const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;
if (outputTarget?.errors.length) {
  for (const error of outputTarget.errors) console.error(error);
  process.exit(1);
}

const aggregateRecord = readAggregateJsonRecord(args.aggregateJson);

let input: TestnetPrebroadcastAssembleInput;
try {
  input = requireInput(args, aggregateRecord);
} catch (error: any) {
  console.error(error?.message ?? String(error));
  console.error(usageText);
  process.exit(1);
}

const report = assembleTestnetPrebroadcastEvidence(input);
for (const line of report.lines) console.log(line);

if (report.status === 'BLOCKED') {
  process.exitCode = 1;
} else if (args.out && report.markdown) {
  const outputPath = outputTarget!.path!;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${report.markdown.trimEnd()}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(`- prebroadcast evidence written: ${args.out}`);
} else if (report.markdown) {
  console.log('');
  console.log(report.markdown.trimEnd());
}
