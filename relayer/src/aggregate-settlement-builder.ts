/**
 * Aggregate settlement proof planner for Phase 011a.
 *
 * This module prepares the cryptographic inputs for the aggregate TX pattern:
 *   INPUTS:  SPV tracker + DUP + lock boxes + fee boxes
 *   OUTPUTS: SPV tracker successor + DUP successor + payouts + fee/change
 *
 * It intentionally does not assemble/sign the final Ergo transaction yet. The
 * single-claim DUP extension is compatible with the aggregate DUP contract
 * shape (`DoubleUnlockPreventionAggregate.es`); multi-claim batches still need
 * the Spike 4 fixed-size batched DUP contract shape before production wiring.
 */

import {
  getDupTreeDigest,
  insertLockRecord,
  insertLockRecordsBatch,
  type BridgeBatchProofResult,
} from './avl-bridge.js';
import { encodeCollByteRegister, encodeIntRegister, encodeLongRegister } from './ergo-encoding.js';
import type { ParsedPegOut } from './sidechain-client.js';
import {
  deriveTrustlessBurnIdHex,
  encodeTrustlessBurnLeaf,
  verifyTrustlessBurnInclusionProof,
  type TrustlessBurnMerkleProofStep,
} from './trustless-burn-proof.js';
import { safeNanoErgNumber } from './tx-balance.js';
import {
  BATCH_UNLOCK_MAX_CLAIMS,
  DEFAULT_AGGREGATE_MAX_CLAIMS,
  TRUSTLESS_COMPACT_UNLOCK_MAX_BURN_PROOF_NODES,
} from './aggregate-settlement-limits.js';
import {
  type AuthenticatedSpvTrackerHistoryEntry,
} from './spv-tracker-authenticated.js';
import {
  buildAuthenticatedSettlementPlan as profileBuildAuthenticatedSettlementPlan,
  buildTrustlessSingleLeafAggregateUnlockExtension as profileBuildTrustlessSingleLeafAggregateUnlockExtension,
} from './profiles/substrate-grandpa-v1/authenticated-settlement-plan.js';
import {
  buildSpvTrackerGetProof,
  buildSpvTrackerInsertProof,
  decodeSpvTrackerValue,
  deriveSpvTrackerKey,
  getSpvTrackerDigest,
  type SpvTrackerEntry,
  type SpvTrackerGetProof,
  type SpvTrackerHistoryEntry,
  type SpvTrackerIdentity,
  type SpvTrackerInsertProof,
} from './spv-tracker.js';

export {
  BATCH_DUP_MAX_KEYS,
  BATCH_UNLOCK_MAX_CLAIMS,
  DEFAULT_AGGREGATE_MAX_CLAIMS,
  TRUSTLESS_COMPACT_UNLOCK_MAX_BURN_PROOF_NODES,
} from './aggregate-settlement-limits.js';

export type SettlementIdentitySource = 'legacy-aggregate-root' | 'trustless-burn-leaf';

export interface SettlementIdentity {
  source: SettlementIdentitySource;
  duplicatePreventionKeyHex: string;
  bridgeEventRootHex: string;
  recipientErgoTreeHashHex?: string;
  amountNanoErg?: string | number | bigint;
  assetIdHex?: string;
  trustlessBurnProof?: TrustlessBurnMerkleProofStep[];
}

export interface AggregateSettlementClaim {
  pegOut: Pick<
    ParsedPegOut,
    'user' | 'amount' | 'ergoRecipientAddress' | 'sidechainTxHash' | 'sidechainBlockNumber' | 'sidechainLogIndex'
  >;
  trackerIdentity: SpvTrackerIdentity;
  settlementIdentity?: SettlementIdentity;
}

export interface PlannedSpvIngest extends SpvTrackerInsertProof {
  entry: SpvTrackerEntry;
  trackerExtension: Record<string, string>;
}

export interface PlannedPegOutClaim {
  claim: AggregateSettlementClaim;
  burnTxIdHex: string;
  duplicatePreventionKeyHex: string;
  settlementIdentity: SettlementIdentity;
  trackerKeyHex: string;
  trackerProofHex: string;
  trackerValueHex: string;
  bridgeEventRootHex: string;
  ergoAnchorHeight: number;
  trackerTree: 'input' | 'output' | 'data-input';
  dupLookupProofHex: string;
}

export interface AggregateSettlementPlan {
  trackerInputDigestHex: string;
  trackerOutputDigestHex: string;
  trackerIngests: PlannedSpvIngest[];
  claims: PlannedPegOutClaim[];
  dupProofs: BridgeBatchProofResult;
  dupOutputDigestHex: string;
  /**
   * Single-claim DUP extension. Compatible with both the legacy
   * DoubleUnlockPrevention.es proof shape and the aggregate variant; the
   * aggregate variant differs by successor output index, not Var layout.
   */
  dupV1Extension: Record<string, string> | null;
  requiresBatchedDupContract: boolean;
  contractCompatibility: 'legacy-aggregate-v1' | 'candidate-only-trustless-v2-required' | 'authenticated-v2';
  warnings: string[];
}

export interface BuildAggregateSettlementPlanInput {
  spvHistory: SpvTrackerHistoryEntry[];
  dupHistoryKeys: string[];
  claims: AggregateSettlementClaim[];
  ingests?: SpvTrackerEntry[];
  maxClaims?: number;
}

export interface BuildTrustlessSingleLeafAggregateUnlockExtensionInput {
  claim: PlannedPegOutClaim;
  recipientErgoTreeHex: string;
  insertProofHex: string;
}

export interface BuildAuthenticatedSettlementPlanInput {
  spvHistory: AuthenticatedSpvTrackerHistoryEntry[];
  dupHistoryKeys: string[];
  claim: AggregateSettlementClaim;
}

export interface AuthenticatedPlannedPegOutClaim extends PlannedPegOutClaim {
  trackerTree: 'data-input';
  trackerCheckpointCommitmentHex: string;
  trackerAnchorHeaderIdHex: string;
}

export interface AuthenticatedSettlementPlan extends Omit<
  AggregateSettlementPlan,
  'claims' | 'contractCompatibility'
> {
  claims: [AuthenticatedPlannedPegOutClaim];
  dupInputDigestHex: string;
  contractCompatibility: 'authenticated-v2';
}

const ERGO_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const BATCH_CLAIM_CORE_BYTES = 109;
const BATCH_CLAIM_AMOUNT_OFFSET = 64;
const BATCH_CLAIM_SELECTOR_OFFSET = 108;

function normalizeHex(hex: string, expectedBytes: number, label: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be hex`);
  }
  if (clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes, got ${clean.length / 2}`);
  }
  return clean.toLowerCase();
}

function parseUint64(value: string | number | bigint, label: string): bigint {
  if (typeof value === 'bigint') {
    if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
      throw new Error(`${label} must fit uint64`);
    }
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative safe integer`);
    }
    return BigInt(value);
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be a decimal uint64 string`);
  }
  const n = BigInt(value);
  if (n > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit uint64`);
  }
  return n;
}

function parsePositiveErgoLong(value: string | number | bigint, label: string): bigint {
  const parsed = parseUint64(value, label);
  if (parsed === 0n || parsed > ERGO_LONG_MAX) {
    throw new Error(`${label} must fit a positive signed Long`);
  }
  return parsed;
}

function normalizeBurnTxId(txHash: string): string {
  return normalizeHex(txHash, 32, 'sidechainTxHash');
}

function normalizeSettlementIdentity(claim: AggregateSettlementClaim): SettlementIdentity {
  const legacyBurnTxIdHex = normalizeBurnTxId(claim.pegOut.sidechainTxHash);
  if (!claim.settlementIdentity) {
    return {
      source: 'legacy-aggregate-root',
      duplicatePreventionKeyHex: legacyBurnTxIdHex,
      bridgeEventRootHex: '',
    };
  }

  const duplicatePreventionKeyHex = normalizeHex(
    claim.settlementIdentity.duplicatePreventionKeyHex,
    32,
    'settlement duplicatePreventionKeyHex',
  );
  const bridgeEventRootHex = normalizeHex(
    claim.settlementIdentity.bridgeEventRootHex,
    32,
    'settlement bridgeEventRootHex',
  );
  if (claim.settlementIdentity.source === 'trustless-burn-leaf') {
    const sidechainLogIndex = claim.pegOut.sidechainLogIndex;
    if (
      typeof sidechainLogIndex !== 'number' ||
      !Number.isSafeInteger(sidechainLogIndex) ||
      sidechainLogIndex < 0
    ) {
      throw new Error('trustless settlement candidate requires sidechainLogIndex to derive burnIdHex');
    }
    if (sidechainLogIndex > 0xffff_ffff) {
      throw new Error('trustless settlement candidate sidechainLogIndex must fit uint32');
    }
    const expectedBurnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex: claim.trackerIdentity.sidechainIdHex,
      sidechainTxHashHex: legacyBurnTxIdHex,
      eventIndex: sidechainLogIndex,
    });
    if (duplicatePreventionKeyHex !== expectedBurnIdHex) {
      throw new Error('trustless settlement candidate duplicatePreventionKeyHex must match derived burnIdHex');
    }
  }

  return {
    source: claim.settlementIdentity.source,
    duplicatePreventionKeyHex,
    bridgeEventRootHex,
    recipientErgoTreeHashHex: claim.settlementIdentity.recipientErgoTreeHashHex
      ? normalizeHex(claim.settlementIdentity.recipientErgoTreeHashHex, 32, 'settlement recipientErgoTreeHashHex')
      : undefined,
    amountNanoErg: claim.settlementIdentity.amountNanoErg,
    assetIdHex: claim.settlementIdentity.assetIdHex
      ? normalizeHex(claim.settlementIdentity.assetIdHex, 32, 'settlement assetIdHex')
      : undefined,
    trustlessBurnProof: claim.settlementIdentity.trustlessBurnProof,
  };
}

function toTrackerExtension(insert: SpvTrackerInsertProof, entry: SpvTrackerEntry): Record<string, string> {
  return {
    '0': encodeCollByteRegister(Buffer.from(insert.keyHex, 'hex')),
    '1': encodeCollByteRegister(Buffer.from(insert.valueHex, 'hex')),
    '2': encodeCollByteRegister(Buffer.from(insert.insertProofHex, 'hex')),
    '3': encodeLongRegister(safeNanoErgNumber(entry.sidechainHeight, 'sidechainHeight')),
  };
}

function toDupV1Extension(burnTxIdHex: string, lookupProofHex: string, insertProofHex: string): Record<string, string> {
  return {
    '0': encodeCollByteRegister(Buffer.from(lookupProofHex, 'hex')),
    '1': encodeCollByteRegister(Buffer.from(burnTxIdHex, 'hex')),
    '2': encodeCollByteRegister(Buffer.from(insertProofHex, 'hex')),
  };
}

function ensureUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate ${label}: ${value}`);
    }
    seen.add(value);
  }
}

export function buildAggregateSettlementPlan(input: BuildAggregateSettlementPlanInput): AggregateSettlementPlan {
  const maxClaims = input.maxClaims ?? DEFAULT_AGGREGATE_MAX_CLAIMS;
  if (input.claims.length === 0) {
    throw new Error('Aggregate settlement requires at least one claim');
  }
  if (input.claims.length > maxClaims) {
    throw new Error(`Aggregate settlement has ${input.claims.length} claims, max is ${maxClaims}`);
  }
  input.claims.forEach((claim, index) => {
    parsePositiveErgoLong(claim.pegOut.amount, `aggregate settlement claim ${index} amount`);
  });

  const ingests = input.ingests ?? [];
  if (ingests.length > 1) {
    throw new Error('SPVTracker.es V1 supports at most one ingest insert per aggregate TX');
  }

  const trackerInputDigestHex = getSpvTrackerDigest(input.spvHistory);
  const inputTrackerKeys = new Set(input.spvHistory.map(entry => entry.key.toLowerCase()));
  const trackerHistoryAfterIngests = [...input.spvHistory];
  const trackerIngests: PlannedSpvIngest[] = [];

  for (const entry of ingests) {
    const insert = buildSpvTrackerInsertProof(trackerHistoryAfterIngests, entry);
    trackerHistoryAfterIngests.push({ key: insert.keyHex, value: insert.valueHex });
    trackerIngests.push({
      ...insert,
      entry,
      trackerExtension: toTrackerExtension(insert, entry),
    });
  }

  const trackerOutputDigestHex = trackerIngests.length > 0
    ? trackerIngests[trackerIngests.length - 1].newDigestHex
    : trackerInputDigestHex;

  const settlementIdentities = input.claims.map(normalizeSettlementIdentity);
  const duplicatePreventionKeys = settlementIdentities.map(identity => identity.duplicatePreventionKeyHex);
  ensureUnique(duplicatePreventionKeys, 'duplicate-prevention key in aggregate claim batch');

  const dupProofs = insertLockRecordsBatch(input.dupHistoryKeys, duplicatePreventionKeys);
  const plannedClaims: PlannedPegOutClaim[] = input.claims.map((claim, index) => {
    const trackerKeyHex = deriveSpvTrackerKey(claim.trackerIdentity);
    const proofHistory = inputTrackerKeys.has(trackerKeyHex)
      ? input.spvHistory
      : trackerHistoryAfterIngests;
    const trackerTree = inputTrackerKeys.has(trackerKeyHex) ? 'input' : 'output';
    const proof: SpvTrackerGetProof = buildSpvTrackerGetProof(proofHistory, claim.trackerIdentity);
    const decoded = decodeSpvTrackerValue(proof.valueHex);
    const settlementIdentity = settlementIdentities[index].source === 'legacy-aggregate-root'
      ? { ...settlementIdentities[index], bridgeEventRootHex: decoded.bridgeEventRootHex }
      : settlementIdentities[index];
    if (settlementIdentity.bridgeEventRootHex !== decoded.bridgeEventRootHex) {
      throw new Error('settlement bridgeEventRootHex must match SPV tracker bridgeEventRootHex');
    }

    return {
      claim,
      burnTxIdHex: duplicatePreventionKeys[index],
      duplicatePreventionKeyHex: duplicatePreventionKeys[index],
      settlementIdentity,
      trackerKeyHex,
      trackerProofHex: proof.getProofHex,
      trackerValueHex: proof.valueHex,
      bridgeEventRootHex: decoded.bridgeEventRootHex,
      ergoAnchorHeight: decoded.ergoAnchorHeight,
      trackerTree,
      dupLookupProofHex: dupProofs.lookup_proofs_hex[index],
    };
  });

  const warnings: string[] = [];
  const requiresBatchedDupContract = input.claims.length > 1;
  if (requiresBatchedDupContract) {
    warnings.push('Multi-claim settlement requires the Spike 4 fixed-size batched DUP contract shape; DoubleUnlockPreventionAggregate.es covers single-claim aggregate settlement only.');
  }
  if (trackerIngests.length === 0) {
    warnings.push('No tracker ingest in this aggregate plan; SPVTracker.es will use its no-ingest settlement path.');
  }
  const hasTrustlessCandidate = settlementIdentities.some(identity => identity.source === 'trustless-burn-leaf');
  if (hasTrustlessCandidate) {
    warnings.push('Trustless settlement identity is candidate-only until aggregate settlement contracts verify bridge-native burn leaves.');
  }

  return {
    trackerInputDigestHex,
    trackerOutputDigestHex,
    trackerIngests,
    claims: plannedClaims,
    dupProofs,
    dupOutputDigestHex: dupProofs.new_digest_hex,
    dupV1Extension: input.claims.length === 1
      ? toDupV1Extension(duplicatePreventionKeys[0], dupProofs.lookup_proofs_hex[0], dupProofs.insert_proof_hex)
      : null,
    requiresBatchedDupContract,
    contractCompatibility: hasTrustlessCandidate
      ? 'candidate-only-trustless-v2-required'
      : 'legacy-aggregate-v1',
    warnings,
  };
}

export const buildAuthenticatedSettlementPlan =
  profileBuildAuthenticatedSettlementPlan as (
    input: BuildAuthenticatedSettlementPlanInput,
  ) => AuthenticatedSettlementPlan;

export const buildTrustlessSingleLeafAggregateUnlockExtension =
  profileBuildTrustlessSingleLeafAggregateUnlockExtension as (
    input: BuildTrustlessSingleLeafAggregateUnlockExtensionInput,
  ) => Record<string, string>;

// ── Batch settlement plan (production wrapper over Spike 11 builders) ──

export interface BatchSettlementPlan extends AggregateSettlementPlan {
  /** Per-claim packed 109-byte cores for the batch unlock extension. */
  claimCores: Buffer[];
  /** Pre-built context extension for the batch DUP input (INPUTS(1)). */
  batchDupExtension: Record<string, string>;
  /** Pre-built context extension for the batch unlock input (INPUTS(2)). */
  batchUnlockExtension: Record<string, string>;
  /** Per-claim recipient ErgoTree hex (same order as claims). */
  recipientErgoTreeHexes: string[];
  /** Per-claim payout amount as bigint (same order as claims). */
  payoutAmounts: bigint[];
}

export interface BuildBatchSettlementPlanInput extends BuildAggregateSettlementPlanInput {
  /**
   * Per-claim recipient ErgoTree hex. Must be same length as `claims`.
   * The caller resolves addresses to ErgoTrees before calling the planner.
   */
  recipientErgoTreeHexes: string[];
}

/**
 * Build a production batch settlement plan for multi-claim aggregate payout.
 *
 * This wraps `buildAggregateSettlementPlan()` and adds:
 *   1. claim cores via `packClaimCore()`
 *   2. batch DUP extension via `buildBatchDupExtension()`
 *   3. batch unlock extension via `buildBatchUnlockExtension()`
 *
 * Requires `claims.length >= 2` — single claims should use the V1 path.
 */
export function buildBatchSettlementPlan(
  input: BuildBatchSettlementPlanInput,
): BatchSettlementPlan {
  if (input.claims.length < 2) {
    throw new Error('Batch settlement requires at least 2 claims; use single-claim path for 1');
  }
  if (input.claims.length > BATCH_UNLOCK_MAX_CLAIMS) {
    throw new Error(
      `Batch settlement has ${input.claims.length} claims, max is ${BATCH_UNLOCK_MAX_CLAIMS}`,
    );
  }
  if (input.recipientErgoTreeHexes.length !== input.claims.length) {
    throw new Error(
      `recipientErgoTreeHexes length ${input.recipientErgoTreeHexes.length} does not match claims length ${input.claims.length}`,
    );
  }

  // Build the base plan (this already validates duplicates and builds AVL proofs)
  const basePlan = buildAggregateSettlementPlan({
    ...input,
    maxClaims: BATCH_UNLOCK_MAX_CLAIMS,
  });

  // Build per-claim data
  const payoutAmounts = input.claims.map((claim, index) =>
    parsePositiveErgoLong(claim.pegOut.amount, `batch settlement claim ${index} amount`),
  );
  const claimCores = basePlan.claims.map((planned, i) =>
    packClaimCore(
      planned.trackerKeyHex,
      planned.burnTxIdHex,
      payoutAmounts[i],
      input.recipientErgoTreeHexes[i],
      planned.trackerTree === 'output' ? 1 : 0,
    ),
  );

  // Build batch DUP extension
  const batchDupExtension = buildBatchDupExtension(
    basePlan.claims.map(c => c.burnTxIdHex),
    basePlan.claims.map(c => c.dupLookupProofHex),
    basePlan.dupProofs.insert_proof_hex,
    encodeCollByteRegister,
    encodeIntRegister,
  );

  // Build batch unlock extension
  const batchUnlockExtension = buildBatchUnlockExtension(
    claimCores,
    basePlan.claims.map(c => c.trackerProofHex),
    basePlan.claims.map(c => c.dupLookupProofHex),
    basePlan.dupProofs.insert_proof_hex,
    encodeCollByteRegister,
    encodeIntRegister,
  );

  return {
    ...basePlan,
    claimCores,
    batchDupExtension,
    batchUnlockExtension,
    recipientErgoTreeHexes: input.recipientErgoTreeHexes,
    payoutAmounts,
  };
}

// ── Multi-claim batch extension builders (Spike 11) ────────────────────

/**
 * Pack a single claim into the 109-byte claimCore format:
 *   trackerKey(32) || burnTxId(32) || amountBytes(8) || recipientTree(36) || selector(1)
 */
export function packClaimCore(
  trackerKeyHex: string,
  burnTxIdHex: string,
  amountNanoErg: bigint,
  recipientTreeHex: string,
  trackerTreeSelector: 0 | 1,
): Buffer {
  // Strict field validation — reject before packing
  const trackerKey = Buffer.from(normalizeHex(trackerKeyHex, 32, 'trackerKeyHex'), 'hex');
  const burnTxId = Buffer.from(normalizeHex(burnTxIdHex, 32, 'burnTxIdHex'), 'hex');
  const recipientTree = Buffer.from(normalizeHex(recipientTreeHex, 36, 'recipientTreeHex'), 'hex');
  if (typeof amountNanoErg !== 'bigint') {
    throw new Error('amountNanoErg must be a bigint');
  }
  if (amountNanoErg <= 0n || amountNanoErg > ERGO_LONG_MAX) {
    throw new Error('amountNanoErg must fit a positive signed Long');
  }
  if (trackerTreeSelector !== 0 && trackerTreeSelector !== 1) {
    throw new Error(`trackerTreeSelector must be 0 or 1, got ${trackerTreeSelector}`);
  }

  const buf = Buffer.alloc(109);
  trackerKey.copy(buf, 0);
  burnTxId.copy(buf, 32);
  buf.writeBigUInt64BE(amountNanoErg, 64);
  recipientTree.copy(buf, 72);
  buf[108] = trackerTreeSelector;
  return buf;
}

/**
 * Build context extension for DoubleUnlockPreventionAggregateBatch.es.
 * Var layout: 0=count, 1=batchInsertProof, 2..21=keys, 22..41=lookupProofs
 */
export function buildBatchDupExtension(
  burnTxIdHexes: string[],
  lookupProofHexes: string[],
  insertProofHex: string,
  sigmaCollByte: (data: Buffer) => string,
  sigmaInt: (value: number) => string,
): Record<string, string> {
  const n = burnTxIdHexes.length;
  if (n < 1 || n > 20) throw new Error(`Batch DUP count out of range: ${n}`);
  if (lookupProofHexes.length !== n) throw new Error('Lookup proof count mismatch');

  // Check for duplicate burn IDs
  const seen = new Set<string>();
  for (const id of burnTxIdHexes) {
    if (seen.has(id)) throw new Error(`Duplicate burn TX ID in batch: ${id}`);
    seen.add(id);
  }

  const ext: Record<string, string> = {
    '0': sigmaInt(n),
    '1': sigmaCollByte(Buffer.from(insertProofHex, 'hex')),
  };
  for (let i = 0; i < n; i++) {
    ext[String(2 + i)] = sigmaCollByte(Buffer.from(burnTxIdHexes[i], 'hex'));
    ext[String(22 + i)] = sigmaCollByte(Buffer.from(lookupProofHexes[i], 'hex'));
  }
  return ext;
}

/**
 * Build context extension for MainChainAggregateUnlockBatch.es.
 * Var layout: 0=count, 1=batchedDupInsertProof,
 *   2..11=claimCore, 12..21=trackerProof, 22..31=dupLookupProof
 */
export function buildBatchUnlockExtension(
  claimCores: Buffer[],
  trackerProofHexes: string[],
  dupLookupProofHexes: string[],
  batchedDupInsertProofHex: string,
  sigmaCollByte: (data: Buffer) => string,
  sigmaInt: (value: number) => string,
): Record<string, string> {
  const n = claimCores.length;
  if (n < 1 || n > 10) throw new Error(`Batch unlock count out of range: ${n}`);
  if (trackerProofHexes.length !== n || dupLookupProofHexes.length !== n) {
    throw new Error('Proof count mismatch');
  }
  claimCores.forEach((claimCore, index) => {
    if (!Buffer.isBuffer(claimCore) || claimCore.length !== BATCH_CLAIM_CORE_BYTES) {
      throw new Error(`batch claim core ${index} must be exactly ${BATCH_CLAIM_CORE_BYTES} bytes`);
    }
    const amountNanoErg = claimCore.readBigUInt64BE(BATCH_CLAIM_AMOUNT_OFFSET);
    if (amountNanoErg === 0n || amountNanoErg > ERGO_LONG_MAX) {
      throw new Error(`batch claim core ${index} amount must fit a positive signed Long`);
    }
    const selector = claimCore[BATCH_CLAIM_SELECTOR_OFFSET];
    if (selector !== 0 && selector !== 1) {
      throw new Error(`batch claim core ${index} tracker selector must be 0 or 1`);
    }
  });

  const ext: Record<string, string> = {
    '0': sigmaInt(n),
    '1': sigmaCollByte(Buffer.from(batchedDupInsertProofHex, 'hex')),
  };
  for (let i = 0; i < n; i++) {
    ext[String(2 + i)] = sigmaCollByte(claimCores[i]);
    ext[String(12 + i)] = sigmaCollByte(Buffer.from(trackerProofHexes[i], 'hex'));
    ext[String(22 + i)] = sigmaCollByte(Buffer.from(dupLookupProofHexes[i], 'hex'));
  }
  return ext;
}
