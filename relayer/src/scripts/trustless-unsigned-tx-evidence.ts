import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import { resolveAggregateSettlementEvidenceJsonPath } from '../aggregate-settlement-evidence.js';
import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import {
  validateTrustlessBurnInstanceBindingReportJson,
  type TrustlessBurnInstanceBindingReport,
} from '../trustless-burn-instance-binding.js';
import {
  buildLocalTrustlessSingleLeafUnsignedTxEvidence,
  type TrustlessUnsignedTxInstanceBindingInput,
} from '../trustless-unsigned-tx-local-evidence.js';
import {
  validateTrustlessBurnProofVectorTarget,
  type TrustlessBurnProofVectorFile,
} from '../trustless-burn-proof-vector.js';

interface CliArgs {
  generatedAt?: string;
  label?: string;
  instanceBindingJson?: string;
  proofVectorJson?: string;
  out?: string;
}

const usage = [
  'Usage: npm run trustless:unsigned-tx -- --generated-at <ISO> --out <trustless-single-leaf-unsigned-tx-evidence.json> [--label <text>] [--instance-binding-json <binding.json>] [--proof-vector-json <proof-vector.json>]',
  '',
  'Builds deterministic local public-fixture trustless unsigned transaction evidence by exercising the aggregate settlement service builder.',
  'When --instance-binding-json is provided, the generated source-boundary evidence uses the validated Gate 5 bound instance identity.',
  'When --proof-vector-json is provided with an instance binding, the local fixture uses the validated Merkle proof and recipient ErgoTree from that proof vector.',
  'Boundary: this command does not load environment files, query nodes, read runtime databases, read deployment state, sign, check, approve, submit, reconcile, mutate state, broadcast, or authorize claims.',
  'The generated JSON is source-boundary evidence only; it is not Gate 5 closure, not pre-broadcast evidence, not transaction-check evidence, not expected-tx-id evidence, not signing authorization, not settlement readiness, and not a production-readiness claim.',
].join('\n');

export function parseTrustlessUnsignedTxEvidenceArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      console.log(usage);
      process.exit(0);
    }

    const next = argv[index + 1];
    const setValue = (key: keyof CliArgs): void => {
      if (!next) throw new Error(`${arg} requires a value`);
      args[key] = next;
      index += 1;
    };

    if (arg === '--generated-at') {
      setValue('generatedAt');
    } else if (arg === '--instance-binding-json') {
      setValue('instanceBindingJson');
    } else if (arg === '--label') {
      setValue('label');
    } else if (arg === '--proof-vector-json') {
      setValue('proofVectorJson');
    } else if (arg === '--out') {
      setValue('out');
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

export async function runTrustlessUnsignedTxEvidenceCli(argv: string[]): Promise<void> {
  const args = parseTrustlessUnsignedTxEvidenceArgs(argv);
  const generatedAt = requireArg(args.generatedAt, '--generated-at');
  const out = requireArg(args.out, '--out');
  const resolved = resolveAggregateSettlementEvidenceJsonPath(out);
  if (resolved.errors.length > 0 || !resolved.path) {
    for (const error of resolved.errors) console.error(error);
    process.exit(1);
  }

  const instanceIdentity = readInstanceIdentity(args.instanceBindingJson);
  const result = await buildLocalTrustlessSingleLeafUnsignedTxEvidence({
    generatedAt,
    label: args.label ?? 'Gate 5 local trustless single-leaf unsigned transaction evidence',
    instanceIdentity: bindProofVectorToInstance(args.proofVectorJson, instanceIdentity),
  });

  mkdirSync(dirname(resolved.path), { recursive: true });
  writeFileSync(resolved.path, `${JSON.stringify(result.evidence, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });

  console.log(`evidenceKind: ${result.evidence.evidenceKind}`);
  console.log(`stateTrackerMode: ${result.evidence.stateTrackerMode}`);
  console.log(`broadcast: ${result.evidence.broadcast}`);
  console.log(`contextExtensionGuard: ${result.evidence.contextExtensionGuard.status}`);
  console.log(`transactionCheck: ${result.evidence.boundary.transactionCheck}`);
  console.log(`expectedTxId: ${result.evidence.boundary.expectedTxId}`);
  console.log(`signing: ${result.evidence.boundary.signing}`);
  console.log(`submit: ${result.evidence.boundary.submit}`);
  console.log(`gate5Closure: ${result.evidence.boundary.gate5Closure}`);
  if (args.instanceBindingJson) console.log(`instanceBindingJson: ${args.instanceBindingJson}`);
  if (args.proofVectorJson) console.log(`proofVectorJson: ${args.proofVectorJson}`);
  console.log('evidenceJson: written');
  console.log('Boundary: no environment files, nodes, runtime databases, deployed state, signing, check, submit, reconcile, state mutation, broadcast, or claim authorization were used.');
}

function readInstanceIdentity(target: string | undefined): TrustlessUnsignedTxInstanceBindingInput | undefined {
  if (!target) return undefined;
  const read = readEvidenceJsonTarget(target, '--instance-binding-json');
  if (read.errors.length > 0 || read.json === undefined) {
    for (const error of read.errors) console.error(error);
    process.exit(1);
  }
  const errors = validateTrustlessBurnInstanceBindingReportJson(read.json);
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exit(1);
  }
  return (read.json as TrustlessBurnInstanceBindingReport).identity;
}

function bindProofVectorToInstance(
  target: string | undefined,
  identity: TrustlessUnsignedTxInstanceBindingInput | undefined,
): TrustlessUnsignedTxInstanceBindingInput | undefined {
  if (!target) return identity;
  if (!identity) {
    console.error('--proof-vector-json requires --instance-binding-json so sidechain height and anchor identity stay explicit');
    process.exit(1);
  }

  const targetValidation = validateTrustlessBurnProofVectorTarget(target);
  if (targetValidation.status !== 'PASS') {
    for (const error of targetValidation.errors) console.error(error);
    process.exit(1);
  }
  const read = readEvidenceJsonTarget(target, '--proof-vector-json');
  if (read.errors.length > 0 || read.json === undefined) {
    for (const error of read.errors) console.error(error);
    process.exit(1);
  }

  const vector = read.json as TrustlessBurnProofVectorFile;
  const expected = vector.expected;
  const leaf = vector.leaves[expected.leafIndex];
  const settlement = expected.settlementBinding;
  const errors: string[] = [];
  if (!leaf) {
    errors.push('proof vector expected.leafIndex must select a burn leaf');
  }
  if (typeof settlement.recipientErgoTreeHex !== 'string') {
    errors.push('proof vector expected.settlementBinding.recipientErgoTreeHex is required for unsigned tx evidence');
  }
  if (leaf && leaf.sidechainIdHex !== identity.sidechainIdHex) {
    errors.push('proof vector sidechainIdHex must match instance binding identity');
  }
  if (leaf && leaf.sidechainBlockHashHex !== identity.sidechainBlockHashHex) {
    errors.push('proof vector sidechainBlockHashHex must match instance binding identity');
  }
  if (leaf && leaf.sidechainTxHashHex !== identity.sidechainTxHashHex) {
    errors.push('proof vector sidechainTxHashHex must match instance binding identity');
  }
  if (leaf && leaf.eventIndex !== identity.eventIndex) {
    errors.push('proof vector eventIndex must match instance binding identity');
  }
  if (vector.targetBurnIdHex !== identity.burnIdHex) {
    errors.push('proof vector targetBurnIdHex must match instance binding burnIdHex');
  }
  if (expected.bridgeEventRootHex !== identity.bridgeEventRootHex) {
    errors.push('proof vector bridgeEventRootHex must match instance binding identity');
  }
  if (settlement.duplicatePreventionKeyHex !== identity.duplicatePreventionKeyHex) {
    errors.push('proof vector duplicatePreventionKeyHex must match instance binding identity');
  }
  if (settlement.recipientErgoTreeHashHex !== identity.recipientErgoTreeHashHex) {
    errors.push('proof vector recipientErgoTreeHashHex must match instance binding identity');
  }
  if (String(settlement.amountNanoErg) !== identity.amountNanoErg) {
    errors.push('proof vector amountNanoErg must match instance binding identity');
  }
  if ((settlement.assetIdHex ?? '00'.repeat(32)) !== identity.assetIdHex) {
    errors.push('proof vector assetIdHex must match instance binding identity');
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    process.exit(1);
  }

  return {
    ...identity,
    recipientErgoTreeHex: settlement.recipientErgoTreeHex,
    trustlessBurnProof: expected.proof,
  };
}

function requireArg(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runTrustlessUnsignedTxEvidenceCli(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage);
    process.exit(1);
  });
}
