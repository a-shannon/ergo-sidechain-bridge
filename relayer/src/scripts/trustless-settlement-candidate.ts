import { existsSync } from 'fs';

import { resolveAggregateSettlementEvidenceJsonPath } from '../aggregate-settlement-evidence.js';
import { resolveStateDbPath } from '../post-submit-observe-paths.js';
import {
  buildTrustlessSettlementCandidateBuildInputFromProofVector,
  type TrustlessSettlementCandidateBuildInput,
  validateTrustlessSettlementCandidateBuildInput,
  writeTrustlessSettlementCandidateEvidence,
} from '../trustless-settlement-candidate.js';

interface Args {
  burnTxHash?: string;
  duplicatePreventionKeyHex?: string;
  bridgeEventRootHex?: string;
  recipientErgoTreeHashHex?: string;
  amountNanoErg?: string;
  assetIdHex?: string;
  sidechainIdHex?: string;
  proofVectorTarget?: string;
  label?: string;
  generatedAt?: string;
  stateDbPath?: string;
  out?: string;
  help?: boolean;
}

interface RequiredCandidateArgs {
  burnTxHash: string;
  duplicatePreventionKeyHex: string;
  bridgeEventRootHex: string;
  recipientErgoTreeHashHex: string;
  amountNanoErg: string;
  sidechainIdHex: string;
}

const usage = [
  'Usage: npm run trustless:candidate -- (--proof-vector <proof-vector.json> | --burn-tx <64hex> --duplicate-prevention-key <64hex> --bridge-event-root <64hex> --recipient-ergo-tree-hash <64hex> --amount-nanoerg <positive-uint64-decimal> --sidechain-id-hex <64hex>) --out <candidate.json> [--asset-id <64hex>] [--label <text>] [--generated-at <ISO>] [--state-db bridge-state.sqlite]',
  'This command reads local SQLite state in read-only mode and writes candidate-only evidence JSON; it does not sign, check, approve, submit, reconcile, broadcast, or mutate runtime databases.',
  'When --proof-vector is supplied, burn hash, duplicate-prevention key, bridge event root, recipient hash, amount, asset, and sidechain ID are derived from that evidence-ready local proof vector.',
  'Boundary: candidate-only evidence is not Gate 5 closure, not pre-broadcast evidence, not settlement readiness, and not claim authorization.',
];

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${arg} requires a value`);
    }
    index += 1;
    if (arg === '--burn-tx') args.burnTxHash = value;
    else if (arg === '--duplicate-prevention-key') args.duplicatePreventionKeyHex = value;
    else if (arg === '--bridge-event-root') args.bridgeEventRootHex = value;
    else if (arg === '--recipient-ergo-tree-hash') args.recipientErgoTreeHashHex = value;
    else if (arg === '--amount-nanoerg') args.amountNanoErg = value;
    else if (arg === '--asset-id') args.assetIdHex = value;
    else if (arg === '--sidechain-id-hex') args.sidechainIdHex = value;
    else if (arg === '--proof-vector') args.proofVectorTarget = value;
    else if (arg === '--label') args.label = value;
    else if (arg === '--generated-at') args.generatedAt = value;
    else if (arg === '--state-db') args.stateDbPath = value;
    else if (arg === '--out') args.out = value;
    else throw new Error(`unknown option: ${arg}`);
  }
  return args;
}

function requireArg(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`${flag} is required`);
  return value;
}

function requireCandidateArgs(args: Args): RequiredCandidateArgs {
  return {
    burnTxHash: requireArg(args.burnTxHash, '--burn-tx'),
    duplicatePreventionKeyHex: requireArg(args.duplicatePreventionKeyHex, '--duplicate-prevention-key'),
    bridgeEventRootHex: requireArg(args.bridgeEventRootHex, '--bridge-event-root'),
    recipientErgoTreeHashHex: requireArg(args.recipientErgoTreeHashHex, '--recipient-ergo-tree-hash'),
    amountNanoErg: requireArg(args.amountNanoErg, '--amount-nanoerg'),
    sidechainIdHex: requireArg(args.sidechainIdHex, '--sidechain-id-hex'),
  };
}

function explicitProofFieldArgNames(args: Args): string[] {
  const fields: Array<[keyof Args, string]> = [
    ['burnTxHash', '--burn-tx'],
    ['duplicatePreventionKeyHex', '--duplicate-prevention-key'],
    ['bridgeEventRootHex', '--bridge-event-root'],
    ['recipientErgoTreeHashHex', '--recipient-ergo-tree-hash'],
    ['amountNanoErg', '--amount-nanoerg'],
    ['assetIdHex', '--asset-id'],
    ['sidechainIdHex', '--sidechain-id-hex'],
  ];
  return fields
    .filter(([key]) => args[key] !== undefined)
    .map(([, flag]) => flag);
}

function candidateInputFromArgs(args: Args): TrustlessSettlementCandidateBuildInput {
  if (args.proofVectorTarget) {
    const conflicting = explicitProofFieldArgNames(args);
    if (conflicting.length > 0) {
      throw new Error(`--proof-vector cannot be combined with explicit proof field arguments: ${conflicting.join(', ')}`);
    }
    return buildTrustlessSettlementCandidateBuildInputFromProofVector({
      proofVectorTarget: args.proofVectorTarget,
      ...(args.label === undefined ? {} : { label: args.label }),
      ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
    });
  }

  const requiredArgs = requireCandidateArgs(args);
  return {
    ...requiredArgs,
    ...(args.assetIdHex === undefined ? {} : { assetIdHex: args.assetIdHex }),
    ...(args.label === undefined ? {} : { label: args.label }),
    ...(args.generatedAt === undefined ? {} : { generatedAt: args.generatedAt }),
  };
}

function validateCandidateInputShape(input: TrustlessSettlementCandidateBuildInput): void {
  const errors = validateTrustlessSettlementCandidateBuildInput(input);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
}

function resolveCliStateDbPath(target: string | undefined): string | undefined {
  if (target === undefined) return undefined;

  const resolved = resolveStateDbPath(target);
  if (resolved.errors.length > 0) {
    throw new Error(resolved.errors.join('; '));
  }
  if (!resolved.path || !existsSync(resolved.path)) {
    throw new Error('--state-db could not be read in read-only mode');
  }
  return resolved.path;
}

function validateCliOutputPath(target: string): void {
  const resolved = resolveAggregateSettlementEvidenceJsonPath(target);
  if (resolved.errors.length > 0) {
    throw new Error(resolved.errors.join('; '));
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage.join('\n'));
    process.exit(0);
  }
  const out = requireArg(args.out, '--out');
  validateCliOutputPath(out);
  const candidateInput = candidateInputFromArgs(args);
  validateCandidateInputShape(candidateInput);
  const stateDbPath = resolveCliStateDbPath(args.stateDbPath);

  const result = writeTrustlessSettlementCandidateEvidence({
    ...candidateInput,
    out,
    ...(stateDbPath === undefined ? {} : { stateDbPath }),
  });

  console.log('StateTracker mode: read-only');
  console.log(`evidenceKind: ${result.summary.evidenceKind}`);
  console.log(`broadcast: ${result.summary.broadcast}`);
  console.log(`contractCompatibility: ${result.summary.contractCompatibility}`);
  console.log(`gate5Closure: ${result.summary.gate5Closure}`);
  console.log(`prebroadcastEvidence: ${result.summary.prebroadcastEvidence}`);
  console.log(`settlementReadiness: ${result.summary.settlementReadiness}`);
  console.log(`claimAuthorization: ${result.summary.claimAuthorization}`);
  console.log(`claimCount: ${result.summary.claimCount}`);
  console.log('evidenceJson: written');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
