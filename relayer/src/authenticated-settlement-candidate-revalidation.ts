import { createHash } from 'crypto';

import {
  assertNativeCheckpointSettlementCandidateBindings,
  buildAuthenticatedSettlementCandidate,
  deriveNativeVerifiedAuthenticatedSettlementCandidateId,
} from './authenticated-settlement-candidate.js';
import {
  assertPreparedAuthenticatedSettlementUnsignedTxProvenance,
  type AggregateSettlementService,
  type PreparedAuthenticatedSettlementUnsignedTx,
} from './aggregate-settlement-service.js';
import { deriveUnsignedTransactionId } from './ergo-unsigned-transaction.js';
import { FRONTIER_BRIDGE_EVENT_ROOT_MAX_BURNS } from './finalized-bridge-checkpoint.js';
import { collectFrontierBurnProofForPegOut } from './frontier-burn-proof-source.js';
import {
  assertNativeCheckpointSettlementAdmissionProvenance,
  bindNativeCheckpointToAuthenticatedSettlement,
  type NativeCheckpointSettlementAdmission,
} from './native-checkpoint-settlement-admission.js';
import type { NativeCheckpointSettlementSource } from './native-checkpoint-settlement-source.js';
import type { ParsedPegOut } from './sidechain-client.js';
import {
  AUTHENTICATED_SPV_TRACKER_VALUE_LENGTH,
  type AuthenticatedSpvTrackerHistoryEntry,
  type AuthenticatedSpvTrackerIdentity,
} from './spv-tracker-authenticated.js';
import type { AuthenticatedSettlementCandidate } from './state-tracker.js';

const REVALIDATED_AUTHENTICATED_SETTLEMENT_CANDIDATES = new WeakSet<object>();

export interface RevalidateAuthenticatedSettlementCandidateInput {
  candidate: AuthenticatedSettlementCandidate;
  nativeAdmission: NativeCheckpointSettlementAdmission;
  prepared: PreparedAuthenticatedSettlementUnsignedTx;
  pegOut: ParsedPegOut;
  trackerIdentity: AuthenticatedSpvTrackerIdentity;
}

export interface RecollectAndRevalidateAuthenticatedSettlementCandidateInput {
  candidate: AuthenticatedSettlementCandidate;
  pegOut: ParsedPegOut;
  trackerIdentity: AuthenticatedSpvTrackerIdentity;
  trackerHistory: AuthenticatedSpvTrackerHistoryEntry[];
  sidechainIdHex: string;
  bridgeAddress: string;
  frontierProvider: Parameters<
    typeof collectFrontierBurnProofForPegOut
  >[0]['provider'];
  nativeCheckpointSource: NativeCheckpointSettlementSource;
  settlementService: Pick<
    AggregateSettlementService,
    'prepareAuthenticatedSettlementUnsignedTx'
  >;
}

export interface RevalidatedAuthenticatedSettlementCandidate {
  candidateId: string;
  expectedTxId: string;
  unsignedTxDigest: string;
  amountNanoErg: bigint;
  recipientErgoTreeHex: string;
  recipientErgoTreeHashHex: string;
  revalidationDigestHex: string;
  nativeVerificationRequestDigestHex: string;
  trustAnchorDigestHex: string;
  finalityHorizonHashHex: string;
  finalityHorizonHeight: bigint;
  finalityStatementDigestHex: string;
  finalityProgramIdHex: string;
  finalityProofSystemId: number;
  finalityVerifierProfileIdHex: string;
  finalityProofPayloadDigestHex: string;
  finalityProofDigestHex: string;
  prepared: PreparedAuthenticatedSettlementUnsignedTx;
}

type DeriveUnsignedTransactionId = (
  eip12Tx: PreparedAuthenticatedSettlementUnsignedTx['eip12Tx'],
) => Promise<string>;

export async function recollectAndRevalidateAuthenticatedSettlementCandidate(
  input: RecollectAndRevalidateAuthenticatedSettlementCandidateInput,
): Promise<RevalidatedAuthenticatedSettlementCandidate> {
  const finalityPackage = await input.nativeCheckpointSource.collectForSettlement({
    sidechainIdHex: input.sidechainIdHex,
    sidechainHeight: input.pegOut.sidechainBlockNumber,
  });
  const proofBundle = await collectFrontierBurnProofForPegOut({
    provider: input.frontierProvider,
    pegOut: input.pegOut,
    sidechainIdHex: input.sidechainIdHex,
    bridgeAddress: input.bridgeAddress,
    maxBurns: FRONTIER_BRIDGE_EVENT_ROOT_MAX_BURNS,
  });
  const nativeAdmission = bindNativeCheckpointToAuthenticatedSettlement({
    checkpoint: finalityPackage.checkpoint,
    aggregateFinalityProof: finalityPackage.aggregateFinalityProof,
    expectedSidechainIdHex: input.sidechainIdHex,
    pegOut: input.pegOut,
    proofBundle,
    trackerIdentity: input.trackerIdentity,
    trackerHistory: input.trackerHistory,
  });
  const prepared = await input.settlementService
    .prepareAuthenticatedSettlementUnsignedTx({
      pegOut: input.pegOut,
      trackerIdentity: input.trackerIdentity,
      settlementIdentity: proofBundle.settlementIdentity,
      creationHeight: input.candidate.creationHeight,
      unlockBoxId: input.candidate.vaultBoxId,
    });
  return revalidateAuthenticatedSettlementCandidate({
    candidate: input.candidate,
    nativeAdmission,
    prepared,
    pegOut: input.pegOut,
    trackerIdentity: input.trackerIdentity,
  });
}

export async function revalidateAuthenticatedSettlementCandidate(
  input: RevalidateAuthenticatedSettlementCandidateInput,
): Promise<RevalidatedAuthenticatedSettlementCandidate> {
  return revalidateCandidate(input, deriveUnsignedTransactionId);
}

export async function revalidateAuthenticatedSettlementCandidateForTesting(
  input: RevalidateAuthenticatedSettlementCandidateInput,
  deriveTransactionId: DeriveUnsignedTransactionId,
): Promise<RevalidatedAuthenticatedSettlementCandidate> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(
      'injected authenticated settlement transaction ID derivation is test-only',
    );
  }
  return revalidateCandidate(input, deriveTransactionId);
}

async function revalidateCandidate(
  input: RevalidateAuthenticatedSettlementCandidateInput,
  deriveTransactionId: DeriveUnsignedTransactionId,
): Promise<RevalidatedAuthenticatedSettlementCandidate> {
  const { candidate, nativeAdmission, prepared, pegOut, trackerIdentity } = input;
  if (candidate.status === 'invalidated') {
    throw new Error(
      'invalidated authenticated settlement candidate cannot be revalidated',
    );
  }
  assertNativeCheckpointSettlementAdmissionProvenance(nativeAdmission);
  assertPreparedAuthenticatedSettlementUnsignedTxProvenance(prepared);
  assertNativeCheckpointSettlementCandidateBindings({
    nativeAdmission,
    prepared,
    pegOut,
    trackerIdentity,
    observedSidechainTip: candidate.observedSidechainTip,
    observedErgoTip: candidate.observedErgoTip,
  });

  const rebuilt = buildAuthenticatedSettlementCandidate({
    prepared,
    pegOut,
    trackerIdentity,
    observedSidechainTip: candidate.observedSidechainTip,
    observedErgoTip: candidate.observedErgoTip,
  });
  assertStableCandidateBindingMatches(candidate, rebuilt);
  const rebuiltCandidateId = deriveNativeVerifiedAuthenticatedSettlementCandidateId(
    rebuilt,
    nativeAdmission,
  );
  if (
    normalizeFixedHex(candidate.candidateId, 32, 'candidate ID')
      !== rebuiltCandidateId
  ) {
    throw new Error(
      'rebuilt native-bound candidate ID does not match the journaled candidate',
    );
  }

  const expectedTxId = normalizeFixedHex(
    await deriveTransactionId(prepared.eip12Tx),
    32,
    'revalidated unsigned transaction ID',
  );
  if (
    candidate.status === 'check_passed'
    && normalizeFixedHex(
      candidate.checkExpectedTxId,
      32,
      'persisted checked transaction ID',
    ) !== expectedTxId
  ) {
    throw new Error(
      'persisted JVM check transaction ID does not match the rebuilt transaction',
    );
  }

  const revalidationBinding = {
    candidateId: rebuiltCandidateId,
    candidate: stableCandidateBinding(candidate),
    expectedTxId,
    nativeAdmission: {
      sidechainIdHex: nativeAdmission.sidechainIdHex,
      sidechainHeight: nativeAdmission.sidechainHeight,
      nativeConsensusBlockHashHex: nativeAdmission.nativeConsensusBlockHashHex,
      executionBlockHashHex: nativeAdmission.executionBlockHashHex,
      bridgeEventRootHex: nativeAdmission.bridgeEventRootHex,
      burnLeafCount: nativeAdmission.burnLeafCount,
      burnIdHex: nativeAdmission.burnIdHex,
      sidechainTxHashHex: nativeAdmission.sidechainTxHashHex,
      eventIndex: nativeAdmission.eventIndex,
      leafIndex: nativeAdmission.leafIndex,
      leafHashHex: nativeAdmission.leafHashHex,
      proofPathDigestHex: nativeAdmission.proofPathDigestHex,
      trackerKeyHex: nativeAdmission.trackerKeyHex,
      trackerValueHex: nativeAdmission.trackerValueHex,
      trackerAnchorHeaderIdHex: nativeAdmission.trackerAnchorHeaderIdHex,
      trackerAnchorHeaderHeight: nativeAdmission.trackerAnchorHeaderHeight,
      checkpointCommitmentHex: nativeAdmission.checkpointCommitmentHex,
      nativeVerificationRequestDigestHex:
        nativeAdmission.nativeVerificationRequestDigestHex,
      trustAnchorDigestHex: nativeAdmission.trustAnchorDigestHex,
      finalityHorizonHashHex: nativeAdmission.finalityHorizonHashHex,
      finalityHorizonHeight: nativeAdmission.finalityHorizonHeight,
      finalityStatementDigestHex: nativeAdmission.finalityStatementDigestHex,
      finalityProgramIdHex: nativeAdmission.finalityProgramIdHex,
      finalityProofSystemId: nativeAdmission.finalityProofSystemId,
      finalityVerifierProfileIdHex:
        nativeAdmission.finalityVerifierProfileIdHex,
      finalityProofPayloadDigestHex:
        nativeAdmission.finalityProofPayloadDigestHex,
      finalityProofDigestHex: nativeAdmission.finalityProofDigestHex,
    },
  };
  const revalidated = Object.freeze({
    candidateId: rebuiltCandidateId,
    expectedTxId,
    unsignedTxDigest: normalizeFixedHex(
      candidate.unsignedTxDigest,
      32,
      'candidate unsigned transaction digest',
    ),
    amountNanoErg: positiveBigInt(
      nativeAdmission.amountNanoErg,
      'native settlement amount',
    ),
    recipientErgoTreeHex: canonicalRecipientTree(prepared.recipientErgoTreeHex),
    recipientErgoTreeHashHex: normalizeFixedHex(
      nativeAdmission.recipientErgoTreeHashHex,
      32,
      'native settlement recipient ErgoTree hash',
    ),
    revalidationDigestHex: sha256Hex(revalidationBinding),
    nativeVerificationRequestDigestHex: normalizeFixedHex(
      nativeAdmission.nativeVerificationRequestDigestHex,
      32,
      'native verification request digest',
    ),
    trustAnchorDigestHex: normalizeFixedHex(
      nativeAdmission.trustAnchorDigestHex,
      32,
      'native trust anchor digest',
    ),
    finalityHorizonHashHex: normalizeFixedHex(
      nativeAdmission.finalityHorizonHashHex,
      32,
      'native finality horizon hash',
    ),
    finalityHorizonHeight: positiveBigInt(
      nativeAdmission.finalityHorizonHeight,
      'native finality horizon height',
    ),
    finalityStatementDigestHex: normalizeFixedHex(
      nativeAdmission.finalityStatementDigestHex,
      32,
      'finality statement digest',
    ),
    finalityProgramIdHex: normalizeFixedHex(
      nativeAdmission.finalityProgramIdHex,
      32,
      'finality program ID',
    ),
    finalityProofSystemId: nativeAdmission.finalityProofSystemId,
    finalityVerifierProfileIdHex: normalizeFixedHex(
      nativeAdmission.finalityVerifierProfileIdHex,
      32,
      'finality verifier profile ID',
    ),
    finalityProofPayloadDigestHex: normalizeFixedHex(
      nativeAdmission.finalityProofPayloadDigestHex,
      32,
      'finality proof payload digest',
    ),
    finalityProofDigestHex: normalizeFixedHex(
      nativeAdmission.finalityProofDigestHex,
      32,
      'aggregate finality proof digest',
    ),
    prepared,
  });
  REVALIDATED_AUTHENTICATED_SETTLEMENT_CANDIDATES.add(revalidated);
  return revalidated;
}

export function assertRevalidatedAuthenticatedSettlementCandidateProvenance(
  candidate: unknown,
): asserts candidate is RevalidatedAuthenticatedSettlementCandidate {
  if (
    typeof candidate !== 'object'
    || candidate === null
    || !REVALIDATED_AUTHENTICATED_SETTLEMENT_CANDIDATES.has(candidate)
  ) {
    throw new Error(
      'revalidated authenticated settlement candidate provenance is missing',
    );
  }
}

function assertStableCandidateBindingMatches(
  persisted: AuthenticatedSettlementCandidate,
  rebuilt: ReturnType<typeof buildAuthenticatedSettlementCandidate>,
): void {
  if (
    canonicalJson(stableCandidateBinding(persisted))
      !== canonicalJson(stableCandidateBinding(rebuilt))
  ) {
    throw new Error(
      'rebuilt authenticated settlement candidate does not match the journaled transaction binding',
    );
  }
}

function canonicalRecipientTree(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('authenticated settlement recipient must be hex');
  }
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized)) {
    throw new Error('authenticated settlement recipient must be hex');
  }
  if (normalized.length === 66 && /^(02|03)/.test(normalized)) {
    return `0008cd${normalized}`;
  }
  if (normalized.length === 72 && /^(0008cd02|0008cd03)/.test(normalized)) {
    return normalized;
  }
  throw new Error(
    'authenticated settlement recipient must be a compressed key or canonical P2PK ErgoTree',
  );
}

function stableCandidateBinding(candidate: {
  burnId: string;
  burnTxHash: string;
  sidechainId: string;
  sidechainHeight: bigint;
  sidechainBlockHash: string;
  sidechainLogIndex: number;
  trackerKey: string;
  trackerValue: string;
  trackerBoxId: string;
  anchorHeaderId: string;
  anchorHeaderHeight: number;
  dupInputBoxId: string;
  dupInputDigest: string;
  vaultBoxId: string;
  unsignedTxDigest: string;
  creationHeight: number;
  observedSidechainTip: bigint;
  observedErgoTip: number;
}): Record<string, unknown> {
  return {
    burnId: normalizeFixedHex(candidate.burnId, 32, 'candidate burn ID'),
    burnTxHash: normalizeFixedHex(
      candidate.burnTxHash,
      32,
      'candidate burn transaction hash',
    ),
    sidechainId: normalizeFixedHex(
      candidate.sidechainId,
      32,
      'candidate sidechain ID',
    ),
    sidechainHeight: positiveBigInt(
      candidate.sidechainHeight,
      'candidate sidechain height',
    ),
    sidechainBlockHash: normalizeFixedHex(
      candidate.sidechainBlockHash,
      32,
      'candidate sidechain block hash',
    ),
    sidechainLogIndex: uint32(
      candidate.sidechainLogIndex,
      'candidate sidechain log index',
    ),
    trackerKey: normalizeFixedHex(
      candidate.trackerKey,
      32,
      'candidate tracker key',
    ),
    trackerValue: normalizeFixedHex(
      candidate.trackerValue,
      AUTHENTICATED_SPV_TRACKER_VALUE_LENGTH,
      'candidate tracker value',
    ),
    trackerBoxId: normalizeFixedHex(
      candidate.trackerBoxId,
      32,
      'candidate tracker box ID',
    ),
    anchorHeaderId: normalizeFixedHex(
      candidate.anchorHeaderId,
      32,
      'candidate anchor header ID',
    ),
    anchorHeaderHeight: nonnegativeInt(
      candidate.anchorHeaderHeight,
      'candidate anchor height',
    ),
    dupInputBoxId: normalizeFixedHex(
      candidate.dupInputBoxId,
      32,
      'candidate DUP input box ID',
    ),
    dupInputDigest: normalizeFixedHex(
      candidate.dupInputDigest,
      33,
      'candidate DUP input digest',
    ),
    vaultBoxId: normalizeFixedHex(
      candidate.vaultBoxId,
      32,
      'candidate vault box ID',
    ),
    unsignedTxDigest: normalizeFixedHex(
      candidate.unsignedTxDigest,
      32,
      'candidate unsigned transaction digest',
    ),
    creationHeight: positiveInt(
      candidate.creationHeight,
      'candidate creation height',
    ),
    observedSidechainTip: positiveBigInt(
      candidate.observedSidechainTip,
      'candidate observed sidechain tip',
    ),
    observedErgoTip: nonnegativeInt(
      candidate.observedErgoTip,
      'candidate observed Ergo tip',
    ),
  };
}

function sha256Hex(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('revalidation binding cannot contain non-finite numbers');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new Error(`revalidation binding cannot serialize ${typeof value}`);
}

function normalizeFixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} bytes`);
  }
  return clean.toLowerCase();
}

function positiveBigInt(value: unknown, label: string): bigint {
  let parsed: bigint;
  try {
    parsed = BigInt(value as string | number | bigint);
  } catch {
    throw new Error(`${label} must be a positive integer`);
  }
  if (parsed <= 0n || parsed > 0x7fff_ffff_ffff_ffffn) {
    throw new Error(`${label} must be a positive signed 64-bit integer`);
  }
  return parsed;
}

function nonnegativeInt(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function positiveInt(value: unknown, label: string): number {
  const parsed = nonnegativeInt(value, label);
  if (parsed === 0) throw new Error(`${label} must be positive`);
  return parsed;
}

function uint32(value: unknown, label: string): number {
  if (
    !Number.isInteger(value)
    || Number(value) < 0
    || Number(value) > 0xffff_ffff
  ) {
    throw new Error(`${label} must be an unsigned 32-bit integer`);
  }
  return Number(value);
}
