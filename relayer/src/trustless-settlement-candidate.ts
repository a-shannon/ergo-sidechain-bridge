import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';

import {
  buildAggregateSettlementPlan,
  type SettlementIdentity,
} from './aggregate-settlement-builder.js';
import {
  buildAggregateSettlementTrustlessCandidateEvidenceRecord,
  resolveAggregateSettlementEvidenceJsonPath,
  validateAggregateSettlementTrustlessCandidateEvidenceRecord,
  type AggregateSettlementTrustlessCandidateEvidenceRecord,
  type AggregateSettlementTrustlessCandidateSourceBindings,
  type TrustlessSettlementCandidateProofVectorSourceEvidence,
} from './aggregate-settlement-evidence.js';
import { readEvidenceJsonTarget } from './evidence-json-target-path.js';
import { StateTracker } from './state-tracker.js';
import type { ParsedPegOut } from './sidechain-client.js';
import { deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';
import {
  validateTrustlessBurnProofVector,
  type TrustlessBurnProofVectorFile,
} from './trustless-burn-proof-vector.js';

export interface TrustlessSettlementCandidateBuildInput {
  stateDbPath?: string;
  burnTxHash: string;
  duplicatePreventionKeyHex: string;
  bridgeEventRootHex: string;
  recipientErgoTreeHashHex: string;
  amountNanoErg: string;
  assetIdHex?: string;
  sidechainIdHex: string;
  sourceBindings?: AggregateSettlementTrustlessCandidateSourceBindings;
  label?: string;
  generatedAt?: string;
}

export interface TrustlessSettlementCandidateBuildResult {
  evidence: AggregateSettlementTrustlessCandidateEvidenceRecord;
  summary: {
    stateTrackerMode: 'read-only';
    evidenceKind: 'trustless-settlement-candidate';
    broadcast: 'no';
    contractCompatibility: 'candidate-only-trustless-v2-required';
    gate5Closure: 'no';
    prebroadcastEvidence: 'no';
    settlementReadiness: 'no';
    claimAuthorization: 'no';
    claimCount: number;
  };
}

export interface TrustlessSettlementCandidateWriteInput extends TrustlessSettlementCandidateBuildInput {
  out: string;
}

export interface TrustlessSettlementCandidateProofVectorInput {
  stateDbPath?: string;
  proofVectorTarget: string;
  label?: string;
  generatedAt?: string;
}

export interface TrustlessSettlementCandidateProofVectorWriteInput
  extends TrustlessSettlementCandidateProofVectorInput {
  out: string;
}

const bytes32HexPattern = /^[0-9a-f]{64}$/i;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;

interface ReadTrustlessCandidateProofVectorResult {
  vector: TrustlessBurnProofVectorFile;
  sourceBinding: TrustlessSettlementCandidateProofVectorSourceEvidence;
}

export function validateTrustlessSettlementCandidateBuildInput(
  input: TrustlessSettlementCandidateBuildInput,
): string[] {
  const errors: string[] = [];
  requireBytes32Hex(input.burnTxHash, 'burnTxHash', errors);
  requireBytes32Hex(input.duplicatePreventionKeyHex, 'duplicatePreventionKeyHex', errors);
  requireBytes32Hex(input.bridgeEventRootHex, 'bridgeEventRootHex', errors);
  requireBytes32Hex(input.recipientErgoTreeHashHex, 'recipientErgoTreeHashHex', errors);
  requireBytes32Hex(input.sidechainIdHex, 'sidechainIdHex', errors);
  if (input.assetIdHex !== undefined) {
    requireBytes32Hex(input.assetIdHex, 'assetIdHex', errors);
  }
  if (!isPositiveUint64DecimalString(input.amountNanoErg)) {
    errors.push('amountNanoErg must be a positive uint64 decimal string');
  }
  if (input.generatedAt !== undefined && !isIsoTimestamp(input.generatedAt)) {
    errors.push('generatedAt must be an ISO timestamp');
  }
  if (input.label !== undefined && input.label.trim().length === 0) {
    errors.push('label must be a non-empty string when provided');
  }
  return errors;
}

export function buildTrustlessSettlementCandidateEvidenceFromState(
  input: TrustlessSettlementCandidateBuildInput,
): TrustlessSettlementCandidateBuildResult {
  const inputErrors = validateTrustlessSettlementCandidateBuildInput(input);
  if (inputErrors.length > 0) {
    throw new Error(inputErrors.join('; '));
  }

  const state = new StateTracker(input.stateDbPath ?? './bridge-state.sqlite', { readOnly: true });
  try {
    const pegOutRow = state.getPegOutByTxHash(input.burnTxHash) as any;
    if (!pegOutRow) {
      throw new Error('peg-out burn was not found in read-only state');
    }

    const sidechainBlockNumber = Number(pegOutRow.sidechain_burn_height ?? pegOutRow.sidechainBurnHeight);
    if (!Number.isSafeInteger(sidechainBlockNumber) || sidechainBlockNumber < 0) {
      throw new Error('peg-out sidechain burn height must be a non-negative safe integer');
    }

    const trackerIdentity = state.getSpvTrackerIdentityByHeight(
      sidechainBlockNumber,
      input.sidechainIdHex,
    );
    if (!trackerIdentity) {
      throw new Error('SPV tracker identity was not found for peg-out sidechain height');
    }

    const amountNanoErg = BigInt(input.amountNanoErg);
    const storedAmountNanoErg = BigInt(pegOutRow.amount_nanoerg ?? pegOutRow.amountNanoErg);
    if (storedAmountNanoErg !== amountNanoErg) {
      throw new Error('amountNanoErg must match read-only peg-out state');
    }
    const sidechainLogIndex = pegOutRow.sidechain_log_index ?? pegOutRow.sidechainLogIndex;
    if (!Number.isSafeInteger(sidechainLogIndex) || sidechainLogIndex < 0) {
      throw new Error('sidechainLogIndex is required in read-only peg-out state to verify trustless burnId');
    }
    if (sidechainLogIndex > 0xffff_ffff) {
      throw new Error('sidechainLogIndex must fit uint32 to verify trustless burnId');
    }
    const expectedBurnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex: input.sidechainIdHex,
      sidechainTxHashHex: input.burnTxHash,
      eventIndex: sidechainLogIndex,
    });
    if (input.duplicatePreventionKeyHex.toLowerCase() !== expectedBurnIdHex) {
      throw new Error('duplicatePreventionKeyHex must match derived trustless burnId');
    }

    const pegOut: ParsedPegOut = {
      user: pegOutRow.user ?? '0x0000000000000000000000000000000000000000',
      amount: amountNanoErg,
      ergoRecipientAddress: pegOutRow.ergo_recipient_address ?? pegOutRow.ergoRecipientAddress,
      sidechainTxHash: pegOutRow.sidechain_burn_tx_hash ?? pegOutRow.sidechainBurnTxHash,
      sidechainBlockNumber,
      sidechainLogIndex,
    };
    const settlementIdentity: SettlementIdentity = {
      source: 'trustless-burn-leaf',
      duplicatePreventionKeyHex: input.duplicatePreventionKeyHex,
      bridgeEventRootHex: input.bridgeEventRootHex,
      recipientErgoTreeHashHex: input.recipientErgoTreeHashHex,
      amountNanoErg: input.amountNanoErg,
      ...(input.assetIdHex === undefined ? {} : { assetIdHex: input.assetIdHex }),
    };
    const plan = buildAggregateSettlementPlan({
      spvHistory: state.getSpvTrackerHistory(),
      dupHistoryKeys: state.getAllAvlKeys(),
      claims: [{
        pegOut,
        trackerIdentity,
        settlementIdentity,
      }],
    });
    if (plan.contractCompatibility !== 'candidate-only-trustless-v2-required') {
      throw new Error('trustless settlement candidate requires candidate-only-trustless-v2-required plan');
    }

    const evidence = buildAggregateSettlementTrustlessCandidateEvidenceRecord({
      generatedAt: input.generatedAt,
      label: input.label ?? 'Trustless aggregate settlement candidate',
      sourceBindings: input.sourceBindings,
      claims: plan.claims.map(claim => ({
        legacySidechainTxHash: pegOut.sidechainTxHash,
        sidechainBlockHeight: pegOut.sidechainBlockNumber,
        trustlessBurnDerivation: {
          sidechainIdHex: input.sidechainIdHex,
          sidechainLogIndex,
          derivedBurnIdHex: expectedBurnIdHex,
        },
        settlementIdentity: {
          source: 'trustless-burn-leaf',
          duplicatePreventionKeyHex: claim.settlementIdentity.duplicatePreventionKeyHex,
          bridgeEventRootHex: claim.settlementIdentity.bridgeEventRootHex,
          recipientErgoTreeHashHex: input.recipientErgoTreeHashHex,
          amountNanoErg: input.amountNanoErg,
          ...(input.assetIdHex === undefined ? {} : { assetIdHex: input.assetIdHex }),
        },
      })),
    });
    const errors = validateAggregateSettlementTrustlessCandidateEvidenceRecord(evidence);
    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }

    return {
      evidence,
      summary: {
        stateTrackerMode: 'read-only',
        evidenceKind: 'trustless-settlement-candidate',
        broadcast: 'no',
        contractCompatibility: 'candidate-only-trustless-v2-required',
        gate5Closure: 'no',
        prebroadcastEvidence: 'no',
        settlementReadiness: 'no',
        claimAuthorization: 'no',
        claimCount: evidence.claimCount,
      },
    };
  } finally {
    state.close();
  }
}

export function buildTrustlessSettlementCandidateBuildInputFromProofVector(
  input: TrustlessSettlementCandidateProofVectorInput,
): TrustlessSettlementCandidateBuildInput {
  const { vector, sourceBinding } = readTrustlessCandidateProofVector(input.proofVectorTarget);
  const expected = vector.expected;
  const leaf = vector.leaves[expected.leafIndex];
  if (!leaf) {
    throw new Error('proof vector target leafIndex must select a burn leaf');
  }
  const settlementBinding = expected.settlementBinding;

  return {
    stateDbPath: input.stateDbPath,
    burnTxHash: leaf.sidechainTxHashHex,
    duplicatePreventionKeyHex: settlementBinding.duplicatePreventionKeyHex,
    bridgeEventRootHex: expected.bridgeEventRootHex,
    recipientErgoTreeHashHex: settlementBinding.recipientErgoTreeHashHex,
    amountNanoErg: String(settlementBinding.amountNanoErg),
    sidechainIdHex: leaf.sidechainIdHex,
    sourceBindings: {
      proofVector: sourceBinding,
    },
    ...(settlementBinding.assetIdHex === undefined ? {} : { assetIdHex: settlementBinding.assetIdHex }),
    ...(input.label === undefined ? {} : { label: input.label }),
    ...(input.generatedAt === undefined ? {} : { generatedAt: input.generatedAt }),
  };
}

export function buildTrustlessSettlementCandidateEvidenceFromProofVector(
  input: TrustlessSettlementCandidateProofVectorInput,
): TrustlessSettlementCandidateBuildResult {
  return buildTrustlessSettlementCandidateEvidenceFromState(
    buildTrustlessSettlementCandidateBuildInputFromProofVector(input),
  );
}

export function writeTrustlessSettlementCandidateEvidence(
  input: TrustlessSettlementCandidateWriteInput,
): TrustlessSettlementCandidateBuildResult {
  const resolved = resolveAggregateSettlementEvidenceJsonPath(input.out);
  if (resolved.errors.length > 0) {
    throw new Error(resolved.errors.join('; '));
  }
  const result = buildTrustlessSettlementCandidateEvidenceFromState(input);
  mkdirSync(dirname(resolved.path!), { recursive: true });
  writeFileSync(resolved.path!, `${JSON.stringify(result.evidence, null, 2)}\n`, { flag: 'wx' });
  return result;
}

export function writeTrustlessSettlementCandidateEvidenceFromProofVector(
  input: TrustlessSettlementCandidateProofVectorWriteInput,
): TrustlessSettlementCandidateBuildResult {
  const resolved = resolveAggregateSettlementEvidenceJsonPath(input.out);
  if (resolved.errors.length > 0) {
    throw new Error(resolved.errors.join('; '));
  }
  const candidateInput = buildTrustlessSettlementCandidateBuildInputFromProofVector(input);
  const result = buildTrustlessSettlementCandidateEvidenceFromState(candidateInput);
  mkdirSync(dirname(resolved.path!), { recursive: true });
  writeFileSync(resolved.path!, `${JSON.stringify(result.evidence, null, 2)}\n`, { flag: 'wx' });
  return result;
}

function readTrustlessCandidateProofVector(target: string): ReadTrustlessCandidateProofVectorResult {
  const read = readEvidenceJsonTarget(target, '--proof-vector');
  if (read.errors.length > 0) {
    throw new Error(read.errors.join('; '));
  }

  const vector = read.json as TrustlessBurnProofVectorFile;
  const validation = validateTrustlessBurnProofVector(vector);
  const errors = [...validation.errors];
  const expected = isRecord(vector?.expected) ? vector.expected as TrustlessBurnProofVectorFile['expected'] : undefined;
  const leafCount = typeof expected?.leafCount === 'number' ? expected.leafCount : undefined;
  const proofNodeCount = Array.isArray(expected?.proof) ? expected.proof.length : undefined;

  if (leafCount !== undefined && leafCount < 2) {
    errors.push('proof vector target must be evidence-ready: expected.leafCount must be at least 2');
  }
  if (proofNodeCount !== undefined && proofNodeCount === 0) {
    errors.push('proof vector target must be evidence-ready: expected.proof must include at least one structured inclusion proof node');
  }
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
  return {
    vector,
    sourceBinding: {
      sourceKind: 'trustless-burn-proof-vector',
      target: read.label,
      targetBurnIdHex: vector.targetBurnIdHex,
      bridgeEventRootHex: validation.bridgeEventRootHex,
      leafHashHex: validation.leafHashHex,
      leafCount: leafCount!,
      proofNodeCount: proofNodeCount!,
      gate5Claim: false,
      contractsChanged: false,
      boundary: 'local-proof-core-candidate-only',
    },
  };
}

function requireBytes32Hex(value: string, label: string, errors: string[]): void {
  if (!bytes32HexPattern.test(value)) {
    errors.push(`${label} must be 32-byte hex`);
  }
}

function isPositiveUint64DecimalString(value: string): boolean {
  return /^(?!0+$)\d+$/.test(value) && BigInt(value) <= UINT64_MAX;
}

function isIsoTimestamp(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
