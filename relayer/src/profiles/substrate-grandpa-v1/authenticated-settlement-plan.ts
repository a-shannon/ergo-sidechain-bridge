import blakejs from 'blakejs';

import { encodeCollByteRegister } from '../../ergo-settlement-core/ergo-encoding.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
  selectSubstrateGrandpaV1AssetProfile,
} from './asset-profile.js';
import {
  getDupTreeDigest,
  insertLockRecord,
} from './duplicate-prevention.js';
import {
  buildAuthenticatedSpvTrackerGetProof,
  decodeAuthenticatedSpvTrackerValue,
  type AuthenticatedSpvTrackerHistoryEntry,
} from './spv-tracker-authenticated.js';
import {
  deriveTrustlessBurnIdHex,
  encodeTrustlessBurnLeaf,
  verifyTrustlessBurnInclusionProof,
  type TrustlessBurnMerkleProofStep,
} from './trustless-burn-proof.js';
import { TRUSTLESS_COMPACT_UNLOCK_MAX_BURN_PROOF_NODES } from './settlement-limits.js';

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

export interface AuthenticatedSettlementPegOut {
  user: string;
  amount: bigint;
  ergoRecipientAddress: string;
  sidechainTxHash: string;
  sidechainBlockNumber: number;
  sidechainLogIndex?: number;
}

export interface AuthenticatedSettlementTrackerIdentity {
  sidechainIdHex: string;
  sidechainHeight: string | number | bigint;
  sidechainHeaderHashHex: string;
}

export interface AggregateSettlementClaim {
  pegOut: AuthenticatedSettlementPegOut;
  trackerIdentity: AuthenticatedSettlementTrackerIdentity;
  settlementIdentity?: SettlementIdentity;
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

export interface AuthenticatedPlannedPegOutClaim extends PlannedPegOutClaim {
  trackerTree: 'data-input';
  trackerCheckpointCommitmentHex: string;
  trackerAnchorHeaderIdHex: string;
}

export interface AuthenticatedSettlementPlan {
  trackerInputDigestHex: string;
  trackerOutputDigestHex: string;
  trackerIngests: [];
  claims: [AuthenticatedPlannedPegOutClaim];
  dupProofs: {
    lookup_proofs_hex: string[];
    insert_proof_hex: string;
    new_digest_hex: string;
  };
  dupInputDigestHex: string;
  dupOutputDigestHex: string;
  dupV1Extension: Record<string, string>;
  requiresBatchedDupContract: false;
  contractCompatibility: 'authenticated-v2';
  warnings: [];
}

export interface BuildAuthenticatedSettlementPlanInput {
  spvHistory: AuthenticatedSpvTrackerHistoryEntry[];
  dupHistoryKeys: string[];
  claim: AggregateSettlementClaim;
}

export interface BuildTrustlessSingleLeafAggregateUnlockExtensionInput {
  claim: PlannedPegOutClaim;
  recipientErgoTreeHex: string;
  insertProofHex: string;
}

const NATIVE_ERG_ASSET_PROFILE = selectSubstrateGrandpaV1AssetProfile(
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
);
const ERGO_LONG_MAX = 0x7fff_ffff_ffff_ffffn;

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

function normalizeVariableHex(hex: string, label: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be non-empty even-length hex`);
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
  const parsed = BigInt(value);
  if (parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit uint64`);
  }
  return parsed;
}

function u64be(value: string | number | bigint, label: string): Buffer {
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(parseUint64(value, label));
  return out;
}

function normalizeSettlementIdentity(claim: AggregateSettlementClaim): SettlementIdentity {
  const legacyBurnTxIdHex = normalizeHex(
    claim.pegOut.sidechainTxHash,
    32,
    'sidechainTxHash',
  );
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
      typeof sidechainLogIndex !== 'number'
      || !Number.isSafeInteger(sidechainLogIndex)
      || sidechainLogIndex < 0
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
      ? normalizeHex(
        claim.settlementIdentity.recipientErgoTreeHashHex,
        32,
        'settlement recipientErgoTreeHashHex',
      )
      : undefined,
    amountNanoErg: claim.settlementIdentity.amountNanoErg,
    assetIdHex: claim.settlementIdentity.assetIdHex
      ? normalizeHex(claim.settlementIdentity.assetIdHex, 32, 'settlement assetIdHex')
      : undefined,
    trustlessBurnProof: claim.settlementIdentity.trustlessBurnProof,
  };
}

function toDupV1Extension(
  burnTxIdHex: string,
  lookupProofHex: string,
  insertProofHex: string,
): Record<string, string> {
  return {
    '0': encodeCollByteRegister(Buffer.from(lookupProofHex, 'hex')),
    '1': encodeCollByteRegister(Buffer.from(burnTxIdHex, 'hex')),
    '2': encodeCollByteRegister(Buffer.from(insertProofHex, 'hex')),
  };
}

export function buildAuthenticatedSettlementPlan(
  input: BuildAuthenticatedSettlementPlanInput,
): AuthenticatedSettlementPlan {
  const settlementIdentity = normalizeSettlementIdentity(input.claim);
  if (settlementIdentity.source !== 'trustless-burn-leaf') {
    throw new Error('authenticated V2 settlement requires a trustless-burn-leaf settlement identity');
  }
  if (!settlementIdentity.recipientErgoTreeHashHex) {
    throw new Error('authenticated V2 settlement requires recipientErgoTreeHashHex');
  }
  if (settlementIdentity.amountNanoErg === undefined) {
    throw new Error('authenticated V2 settlement requires amountNanoErg');
  }

  const trackerProof = buildAuthenticatedSpvTrackerGetProof(input.spvHistory, {
    sidechainIdHex: input.claim.trackerIdentity.sidechainIdHex,
    sidechainHeight: input.claim.trackerIdentity.sidechainHeight,
    executionBlockHashHex: input.claim.trackerIdentity.sidechainHeaderHashHex,
  });
  const trackerValue = decodeAuthenticatedSpvTrackerValue(trackerProof.valueHex);
  if (settlementIdentity.bridgeEventRootHex !== trackerValue.bridgeEventRootHex) {
    throw new Error('settlement bridgeEventRootHex must match authenticated SPV tracker bridgeEventRootHex');
  }

  const sidechainLogIndex = input.claim.pegOut.sidechainLogIndex as number;
  const amountNanoErg = parseUint64(
    settlementIdentity.amountNanoErg,
    'settlement amountNanoErg',
  );
  const pegOutAmountNanoErg = parseUint64(input.claim.pegOut.amount, 'peg-out amount');
  if (amountNanoErg === 0n || amountNanoErg > ERGO_LONG_MAX) {
    throw new Error('authenticated V2 settlement amountNanoErg must fit a positive signed Long');
  }
  if (amountNanoErg !== pegOutAmountNanoErg) {
    throw new Error('authenticated V2 settlement amountNanoErg must match peg-out amount');
  }
  const assetIdHex = settlementIdentity.assetIdHex
    ?? NATIVE_ERG_ASSET_PROFILE.assetIdHex;
  if (assetIdHex !== NATIVE_ERG_ASSET_PROFILE.assetIdHex) {
    throw new Error('authenticated V2 settlement currently supports only the ERG asset lane');
  }
  const leaf = encodeTrustlessBurnLeaf({
    sidechainIdHex: input.claim.trackerIdentity.sidechainIdHex,
    sidechainBlockHashHex: input.claim.trackerIdentity.sidechainHeaderHashHex,
    burnIdHex: settlementIdentity.duplicatePreventionKeyHex,
    sidechainTxHashHex: input.claim.pegOut.sidechainTxHash,
    eventIndex: sidechainLogIndex,
    recipientErgoTreeHashHex: settlementIdentity.recipientErgoTreeHashHex,
    amountNanoErg,
    assetIdHex,
  });
  if (leaf.burnIdHex !== settlementIdentity.duplicatePreventionKeyHex) {
    throw new Error('authenticated V2 settlement burnIdHex must match derived duplicate-prevention key');
  }
  if (!verifyTrustlessBurnInclusionProof({
    leaf,
    bridgeEventRootHex: trackerValue.bridgeEventRootHex,
    proof: settlementIdentity.trustlessBurnProof ?? [],
  })) {
    throw new Error('authenticated V2 settlement burn proof must resolve to bridgeEventRootHex');
  }

  const duplicatePreventionKeyHex = settlementIdentity.duplicatePreventionKeyHex;
  const normalizedDupHistory = input.dupHistoryKeys.map((key, index) =>
    normalizeHex(key, 32, `dupHistoryKeys[${index}]`));
  if (normalizedDupHistory.includes(duplicatePreventionKeyHex)) {
    throw new Error('authenticated V2 settlement burnId is already present in DUP history');
  }
  const dupInputDigestHex = getDupTreeDigest(normalizedDupHistory);
  const singleDupProofs = insertLockRecord(
    normalizedDupHistory,
    duplicatePreventionKeyHex,
  );
  const dupProofs = {
    lookup_proofs_hex: [singleDupProofs.lookup_proof_hex],
    insert_proof_hex: singleDupProofs.insert_proof_hex,
    new_digest_hex: singleDupProofs.new_digest_hex,
  };

  const plannedClaim: AuthenticatedPlannedPegOutClaim = {
    claim: input.claim,
    burnTxIdHex: duplicatePreventionKeyHex,
    duplicatePreventionKeyHex,
    settlementIdentity,
    trackerKeyHex: trackerProof.keyHex,
    trackerProofHex: trackerProof.getProofHex,
    trackerValueHex: trackerProof.valueHex,
    bridgeEventRootHex: trackerValue.bridgeEventRootHex,
    ergoAnchorHeight: trackerValue.anchorHeaderHeight,
    trackerTree: 'data-input',
    dupLookupProofHex: dupProofs.lookup_proofs_hex[0],
    trackerCheckpointCommitmentHex: trackerValue.checkpointCommitmentHex,
    trackerAnchorHeaderIdHex: trackerValue.anchorHeaderIdHex,
  };

  return {
    trackerInputDigestHex: trackerProof.digestHex,
    trackerOutputDigestHex: trackerProof.digestHex,
    trackerIngests: [],
    claims: [plannedClaim],
    dupProofs,
    dupInputDigestHex,
    dupOutputDigestHex: dupProofs.new_digest_hex,
    dupV1Extension: toDupV1Extension(
      duplicatePreventionKeyHex,
      dupProofs.lookup_proofs_hex[0],
      dupProofs.insert_proof_hex,
    ),
    requiresBatchedDupContract: false,
    contractCompatibility: 'authenticated-v2',
    warnings: [],
  };
}

function encodeTrustlessBurnProofStep(step: TrustlessBurnMerkleProofStep): Buffer {
  const side = step.side === 'left'
    ? 0
    : step.side === 'right'
      ? 1
      : undefined;
  if (side === undefined) {
    throw new Error('trustless compact unlock proof step side must be left or right');
  }
  return Buffer.concat([
    Buffer.from([side]),
    Buffer.from(normalizeHex(step.hashHex, 32, 'trustless burn proof hash'), 'hex'),
  ]);
}

function buildTrustlessSingleLeafProofBundle(input: {
  sidechainHeight: string | number | bigint;
  trustlessBurnProof?: TrustlessBurnMerkleProofStep[];
  dupLookupProofHex: string;
  dupInsertProofHex: string;
}): Buffer {
  const sidechainHeightBytes = u64be(input.sidechainHeight, 'sidechainHeight');
  const burnProof = input.trustlessBurnProof ?? [];
  if (burnProof.length > TRUSTLESS_COMPACT_UNLOCK_MAX_BURN_PROOF_NODES) {
    throw new Error(
      `trustless compact unlock proof node count ${burnProof.length} exceeds contract cap ${TRUSTLESS_COMPACT_UNLOCK_MAX_BURN_PROOF_NODES}`,
    );
  }
  const burnProofBytes = Buffer.concat(burnProof.map(encodeTrustlessBurnProofStep));
  const dupLookupProof = Buffer.from(
    normalizeVariableHex(input.dupLookupProofHex, 'dupLookupProofHex'),
    'hex',
  );
  const dupInsertProof = Buffer.from(
    normalizeVariableHex(input.dupInsertProofHex, 'insertProofHex'),
    'hex',
  );
  return Buffer.concat([
    sidechainHeightBytes,
    u64be(BigInt(burnProof.length), 'burnProofNodeCount'),
    u64be(BigInt(dupLookupProof.length), 'dupLookupProofLen'),
    burnProofBytes,
    dupLookupProof,
    dupInsertProof,
  ]);
}

function recipientErgoTreeHashHex(recipientErgoTreeHex: string): string {
  return Buffer.from(blakejs.blake2b(
    Buffer.from(normalizeHex(recipientErgoTreeHex, 36, 'recipientErgoTreeHex'), 'hex'),
    undefined,
    32,
  )).toString('hex');
}

export function buildTrustlessSingleLeafAggregateUnlockExtension(
  input: BuildTrustlessSingleLeafAggregateUnlockExtensionInput,
): Record<string, string> {
  const { claim } = input;
  const { settlementIdentity } = claim;
  if (settlementIdentity.source !== 'trustless-burn-leaf') {
    throw new Error('trustless single-leaf unlock extension requires a trustless-burn-leaf settlement identity');
  }
  if (!settlementIdentity.recipientErgoTreeHashHex) {
    throw new Error('trustless single-leaf unlock extension requires recipientErgoTreeHashHex');
  }
  if (settlementIdentity.amountNanoErg === undefined) {
    throw new Error('trustless single-leaf unlock extension requires amountNanoErg');
  }

  const sidechainLogIndex = claim.claim.pegOut.sidechainLogIndex;
  if (
    typeof sidechainLogIndex !== 'number'
    || !Number.isSafeInteger(sidechainLogIndex)
    || sidechainLogIndex < 0
    || sidechainLogIndex > 0xffff_ffff
  ) {
    throw new Error('trustless single-leaf unlock extension requires sidechainLogIndex to fit uint32');
  }

  const recipientErgoTreeHex = normalizeHex(
    input.recipientErgoTreeHex,
    36,
    'recipientErgoTreeHex',
  );
  if (recipientErgoTreeHashHex(recipientErgoTreeHex)
      !== settlementIdentity.recipientErgoTreeHashHex) {
    throw new Error('trustless single-leaf unlock extension recipientErgoTreeHashHex must match recipientErgoTreeHex');
  }

  const amountNanoErg = parseUint64(
    settlementIdentity.amountNanoErg,
    'settlement amountNanoErg',
  );
  const pegOutAmountNanoErg = parseUint64(claim.claim.pegOut.amount, 'peg-out amount');
  if (amountNanoErg === 0n || amountNanoErg > ERGO_LONG_MAX) {
    throw new Error('trustless single-leaf unlock extension amountNanoErg must fit a positive signed Long');
  }
  if (amountNanoErg !== pegOutAmountNanoErg) {
    throw new Error('trustless single-leaf unlock extension amountNanoErg must match peg-out amount');
  }

  const assetIdHex = settlementIdentity.assetIdHex
    ?? NATIVE_ERG_ASSET_PROFILE.assetIdHex;
  if (assetIdHex !== NATIVE_ERG_ASSET_PROFILE.assetIdHex) {
    throw new Error('trustless single-leaf unlock extension currently supports only the ERG asset lane');
  }
  if (claim.trackerTree !== 'input' && claim.trackerTree !== 'data-input') {
    throw new Error('trustless single-leaf compact unlock extension requires tracker input or data-input history');
  }

  const leaf = encodeTrustlessBurnLeaf({
    sidechainIdHex: claim.claim.trackerIdentity.sidechainIdHex,
    sidechainBlockHashHex: claim.claim.trackerIdentity.sidechainHeaderHashHex,
    burnIdHex: claim.duplicatePreventionKeyHex,
    sidechainTxHashHex: claim.claim.pegOut.sidechainTxHash,
    eventIndex: sidechainLogIndex,
    recipientErgoTreeHashHex: settlementIdentity.recipientErgoTreeHashHex,
    amountNanoErg,
    assetIdHex,
  });
  if (leaf.burnIdHex !== claim.duplicatePreventionKeyHex) {
    throw new Error('trustless single-leaf unlock extension burnIdHex must match duplicatePreventionKeyHex');
  }
  const trustlessBurnProof = settlementIdentity.trustlessBurnProof ?? [];
  if (!verifyTrustlessBurnInclusionProof({
    leaf,
    bridgeEventRootHex: claim.bridgeEventRootHex,
    proof: trustlessBurnProof,
  })) {
    throw new Error('trustless compact unlock extension proof must resolve to bridgeEventRootHex');
  }

  return {
    '0': encodeCollByteRegister(Buffer.from(claim.trackerKeyHex, 'hex')),
    '1': encodeCollByteRegister(Buffer.from(claim.trackerProofHex, 'hex')),
    '2': encodeCollByteRegister(Buffer.from(leaf.encodedLeafHex, 'hex')),
    '3': encodeCollByteRegister(buildTrustlessSingleLeafProofBundle({
      sidechainHeight: claim.claim.trackerIdentity.sidechainHeight,
      trustlessBurnProof,
      dupLookupProofHex: claim.dupLookupProofHex,
      dupInsertProofHex: input.insertProofHex,
    })),
  };
}
