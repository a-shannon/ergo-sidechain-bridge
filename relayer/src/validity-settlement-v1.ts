/**
 * Pure settlement planner for the preactivation ValiditySettlementV1 profile.
 *
 * This module binds a V1 burn leaf to a validity tracker entry and an
 * append-only DUP transition. It has no node, signer, persistence, submitter,
 * or broadcast capability. A successful plan is not proof validity in an
 * accepted payout transaction and does not close Gate 5.
 */

import blakejs from 'blakejs';

import { getDupTreeDigest, insertLockRecord } from './avl-bridge.js';
import { TRUSTLESS_COMPACT_UNLOCK_MAX_BURN_PROOF_NODES } from './aggregate-settlement-limits.js';
import { encodeCollByteRegister } from './ergo-encoding.js';
import {
  buildValiditySpvTrackerGetProof,
  decodeValiditySpvTrackerValue,
  deriveValiditySpvTrackerKey,
  type ValiditySpvTrackerHistoryEntry,
  type ValiditySpvTrackerIdentity,
} from './spv-tracker-validity-v1.js';
import {
  encodeTrustlessBurnLeaf,
  verifyTrustlessBurnInclusionProof,
  type TrustlessBurnLeaf,
  type TrustlessBurnLeafInput,
  type TrustlessBurnMerkleProofStep,
} from './trustless-burn-proof.js';

export const VALIDITY_SETTLEMENT_PROFILE_V1_FORMAT = 1 as const;
export const VALIDITY_SETTLEMENT_PROFILE_V1_DOMAIN =
  'E2S_VALIDITY_SETTLEMENT_PROFILE_V1' as const;
export const VALIDITY_SETTLEMENT_V1_TRACKER_DOMAIN =
  'E2S_SPV_VALIDITY_V1' as const;
export const VALIDITY_SETTLEMENT_V1_COMPATIBILITY_PROOF_SYSTEM_ID = 1 as const;
export const VALIDITY_SETTLEMENT_V1_MIN_ANCHOR_CONFIRMATIONS = 10 as const;
export const VALIDITY_SETTLEMENT_PROFILE_V1_BYTES = 329;
export const VALIDITY_SETTLEMENT_V1_BURN_LEAF_BYTES = 205;
export const VALIDITY_SETTLEMENT_V1_RECIPIENT_ERGOTREE_BYTES = 36;
export const VALIDITY_SETTLEMENT_V1_ZERO_SOURCE_ASSET_ID_HEX = '00'.repeat(32);

const ERGO_LONG_MAX = 0x7fff_ffff_ffff_ffffn;

export interface ValiditySettlementProfileV1 {
  readonly formatVersion: typeof VALIDITY_SETTLEMENT_PROFILE_V1_FORMAT;
  readonly compatibilityProofSystemId:
    typeof VALIDITY_SETTLEMENT_V1_COMPATIBILITY_PROOF_SYSTEM_ID;
  readonly minAnchorConfirmations:
    typeof VALIDITY_SETTLEMENT_V1_MIN_ANCHOR_CONFIRMATIONS;
  readonly sourceNetworkIdHex: string;
  readonly sidechainIdHex: string;
  readonly trackerNftIdHex: string;
  readonly trackerContractIdHex: string;
  readonly approvedTrustRootDigestHex: string;
  readonly compatibilitySemanticProgramIdHex: string;
  readonly compatibilityVerifierProfileIdHex: string;
  readonly duplicatePreventionNftIdHex: string;
  readonly admissionProfileIdHex: string;
  readonly zeroSourceAssetIdHex: string;
}

export interface ValiditySettlementClaimV1 {
  readonly trackerIdentity: Omit<ValiditySpvTrackerIdentity, 'sidechainIdHex'>;
  readonly burnLeaf: TrustlessBurnLeafInput;
  readonly burnProof: readonly TrustlessBurnMerkleProofStep[];
  readonly recipientErgoTreeHex: string;
}

export interface BuildValiditySettlementPlanV1Input {
  readonly profile: ValiditySettlementProfileV1;
  readonly trackerHistory: readonly ValiditySpvTrackerHistoryEntry[];
  readonly duplicatePreventionHistoryKeys: readonly string[];
  readonly claim: ValiditySettlementClaimV1;
  readonly currentErgoHeight: number;
}

export interface ValiditySettlementPlanV1 {
  readonly profile: ValiditySettlementProfileV1;
  readonly profileIdHex: string;
  readonly encodedProfileHex: string;
  readonly contractCompatibility: 'validity-settlement-v1';
  readonly trackerKeyHex: string;
  readonly trackerValueHex: string;
  readonly trackerGetProofHex: string;
  readonly trackerInputDigestHex: string;
  readonly trackerAnchorHeaderIdHex: string;
  readonly trackerAnchorHeight: number;
  readonly bridgeEventRootHex: string;
  readonly burnLeaf: TrustlessBurnLeaf;
  readonly burnProof: readonly TrustlessBurnMerkleProofStep[];
  readonly recipientErgoTreeHex: string;
  readonly duplicatePreventionKeyHex: string;
  readonly dupInputDigestHex: string;
  readonly dupOutputDigestHex: string;
  readonly dupLookupProofHex: string;
  readonly dupInsertProofHex: string;
  readonly dupExtension: Readonly<Record<'0' | '1' | '2', string>>;
  readonly vaultExtension: Readonly<Record<'0' | '1' | '2' | '3', string>>;
  readonly boundaries: {
    readonly trackerEntryDecoded: true;
    readonly burnInclusionValidatedByPlanner: true;
    readonly chainDomainActivationIdentityResolved: false;
    readonly bridgeEventRootFinalizedStateMembershipEstablished: false;
    readonly activationEstablished: false;
    readonly nodeAcceptanceEstablished: false;
    readonly proofValidityEstablishedInPayoutTx: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
  };
}

export function encodeValiditySettlementProfileV1(
  profile: ValiditySettlementProfileV1,
): string {
  const normalized = normalizeProfile(profile);
  return Buffer.concat([
    Buffer.from([normalized.formatVersion]),
    fixedHexBytes(normalized.sourceNetworkIdHex, 32, 'sourceNetworkId'),
    fixedHexBytes(normalized.sidechainIdHex, 32, 'sidechainId'),
    fixedHexBytes(normalized.trackerNftIdHex, 32, 'trackerNftId'),
    fixedHexBytes(normalized.trackerContractIdHex, 32, 'trackerContractId'),
    fixedHexBytes(normalized.approvedTrustRootDigestHex, 32, 'approvedTrustRootDigest'),
    fixedHexBytes(
      normalized.compatibilitySemanticProgramIdHex,
      32,
      'compatibilitySemanticProgramId',
    ),
    fixedHexBytes(
      normalized.compatibilityVerifierProfileIdHex,
      32,
      'compatibilityVerifierProfileId',
    ),
    fixedHexBytes(
      normalized.duplicatePreventionNftIdHex,
      32,
      'duplicatePreventionNftId',
    ),
    fixedHexBytes(normalized.admissionProfileIdHex, 32, 'admissionProfileId'),
    fixedHexBytes(normalized.zeroSourceAssetIdHex, 32, 'zeroSourceAssetId'),
    uint32Be(normalized.minAnchorConfirmations),
    uint32Be(normalized.compatibilityProofSystemId),
  ]).toString('hex');
}

export function decodeValiditySettlementProfileV1(
  profileHex: string,
): ValiditySettlementProfileV1 {
  const bytes = Buffer.from(
    fixedHex(profileHex, VALIDITY_SETTLEMENT_PROFILE_V1_BYTES, 'validity settlement profile'),
    'hex',
  );
  const profile: ValiditySettlementProfileV1 = {
    formatVersion: bytes[0] as typeof VALIDITY_SETTLEMENT_PROFILE_V1_FORMAT,
    sourceNetworkIdHex: bytes.subarray(1, 33).toString('hex'),
    sidechainIdHex: bytes.subarray(33, 65).toString('hex'),
    trackerNftIdHex: bytes.subarray(65, 97).toString('hex'),
    trackerContractIdHex: bytes.subarray(97, 129).toString('hex'),
    approvedTrustRootDigestHex: bytes.subarray(129, 161).toString('hex'),
    compatibilitySemanticProgramIdHex: bytes.subarray(161, 193).toString('hex'),
    compatibilityVerifierProfileIdHex: bytes.subarray(193, 225).toString('hex'),
    duplicatePreventionNftIdHex: bytes.subarray(225, 257).toString('hex'),
    admissionProfileIdHex: bytes.subarray(257, 289).toString('hex'),
    zeroSourceAssetIdHex: bytes.subarray(289, 321).toString('hex'),
    minAnchorConfirmations: bytes.readUInt32BE(321) as 10,
    compatibilityProofSystemId: bytes.readUInt32BE(325) as 1,
  };
  const normalized = normalizeProfile(profile);
  if (encodeValiditySettlementProfileV1(normalized) !== profileHex) {
    throw new Error('validity settlement profile must use canonical encoding');
  }
  return normalized;
}

export function deriveValiditySettlementProfileIdV1(
  profile: ValiditySettlementProfileV1,
): string {
  return blake2b256(Buffer.concat([
    Buffer.from(VALIDITY_SETTLEMENT_PROFILE_V1_DOMAIN, 'ascii'),
    Buffer.from(encodeValiditySettlementProfileV1(profile), 'hex'),
  ])).toString('hex');
}

export function buildValiditySettlementPlanV1(
  input: BuildValiditySettlementPlanV1Input,
): ValiditySettlementPlanV1 {
  const profile = normalizeProfile(input.profile);
  const encodedProfileHex = encodeValiditySettlementProfileV1(profile);
  const profileIdHex = deriveValiditySettlementProfileIdV1(profile);
  const recipientErgoTreeHex = fixedHex(
    input.claim.recipientErgoTreeHex,
    VALIDITY_SETTLEMENT_V1_RECIPIENT_ERGOTREE_BYTES,
    'recipientErgoTree',
  );
  const burnLeaf = encodeTrustlessBurnLeaf(input.claim.burnLeaf);
  if (burnLeaf.encodedLeafHex.length / 2 !== VALIDITY_SETTLEMENT_V1_BURN_LEAF_BYTES) {
    throw new Error('validity settlement burn leaf must use the 205-byte V1 format');
  }
  if (burnLeaf.sidechainIdHex !== profile.sidechainIdHex) {
    throw new Error('validity settlement burn leaf sidechain ID does not match profile');
  }
  if (burnLeaf.assetIdHex !== profile.zeroSourceAssetIdHex) {
    throw new Error('validity settlement V1 supports only the native ERG asset lane');
  }
  if (
    blake2b256(Buffer.from(recipientErgoTreeHex, 'hex')).toString('hex')
    !== burnLeaf.recipientErgoTreeHashHex
  ) {
    throw new Error('validity settlement recipient ErgoTree does not match burn leaf recipient hash');
  }
  const amount = BigInt(burnLeaf.amountNanoErg);
  if (amount <= 0n || amount > ERGO_LONG_MAX) {
    throw new Error('validity settlement burn amount must fit a positive signed Long');
  }
  const trackerIdentity: ValiditySpvTrackerIdentity = {
    sidechainIdHex: profile.sidechainIdHex,
    sidechainHeight: input.claim.trackerIdentity.sidechainHeight,
    executionBlockHashHex: fixedHex(
      input.claim.trackerIdentity.executionBlockHashHex,
      32,
      'executionBlockHash',
    ),
  };
  if (trackerIdentity.executionBlockHashHex !== burnLeaf.sidechainBlockHashHex) {
    throw new Error('validity settlement burn leaf block hash does not match tracker execution block');
  }
  const trackerKeyHex = deriveValiditySpvTrackerKey(trackerIdentity);
  if (!trackerKeyHex) {
    throw new Error('validity settlement must derive a validity tracker key');
  }
  const trackerProof = buildValiditySpvTrackerGetProof(
    input.trackerHistory,
    trackerIdentity,
  );
  const trackerValue = decodeValiditySpvTrackerValue(trackerProof.valueHex);
  if (
    trackerValue.compatibilityProofSystemId
    !== profile.compatibilityProofSystemId
  ) {
    throw new Error('validity settlement tracker proof-system ID does not match profile');
  }
  if (
    trackerValue.compatibilitySemanticProgramIdHex
    !== profile.compatibilitySemanticProgramIdHex
  ) {
    throw new Error('validity settlement tracker semantic program ID does not match profile');
  }
  if (
    trackerValue.compatibilityVerifierProfileIdHex
    !== profile.compatibilityVerifierProfileIdHex
  ) {
    throw new Error('validity settlement tracker verifier profile ID does not match profile');
  }
  const currentErgoHeight = nonnegativeInt(input.currentErgoHeight, 'currentErgoHeight');
  if (currentErgoHeight < trackerValue.anchorHeaderHeight) {
    throw new Error('validity settlement tracker anchor cannot be in the future');
  }
  if (
    currentErgoHeight - trackerValue.anchorHeaderHeight
    < profile.minAnchorConfirmations
  ) {
    throw new Error('validity settlement tracker anchor lacks required confirmations');
  }
  if (!verifyTrustlessBurnInclusionProof({
    leaf: input.claim.burnLeaf,
    bridgeEventRootHex: trackerValue.bridgeEventRootHex,
    proof: [...input.claim.burnProof],
  })) {
    throw new Error('validity settlement burn inclusion proof does not resolve to tracker event root');
  }

  const duplicatePreventionKeyHex = burnLeaf.burnIdHex;
  const dupHistory = input.duplicatePreventionHistoryKeys.map((key, index) =>
    fixedHex(key, 32, `duplicatePreventionHistoryKeys[${index}]`));
  if (dupHistory.includes(duplicatePreventionKeyHex)) {
    throw new Error('validity settlement burn ID is already present in DUP history');
  }
  const dupInputDigestHex = getDupTreeDigest(dupHistory);
  const dupTransition = insertLockRecord(dupHistory, duplicatePreventionKeyHex);
  const dupExtension = Object.freeze({
    '0': encodeCollByteRegister(Buffer.from(dupTransition.lookup_proof_hex, 'hex')),
    '1': encodeCollByteRegister(Buffer.from(duplicatePreventionKeyHex, 'hex')),
    '2': encodeCollByteRegister(Buffer.from(dupTransition.insert_proof_hex, 'hex')),
  });
  const vaultExtension = buildValiditySettlementVaultExtension({
    trackerKeyHex,
    trackerGetProofHex: trackerProof.getProofHex,
    burnLeaf,
    sidechainHeight: trackerIdentity.sidechainHeight,
    burnProof: input.claim.burnProof,
    dupLookupProofHex: dupTransition.lookup_proof_hex,
    dupInsertProofHex: dupTransition.insert_proof_hex,
  });

  return deepFreeze({
    profile,
    profileIdHex,
    encodedProfileHex,
    contractCompatibility: 'validity-settlement-v1' as const,
    trackerKeyHex,
    trackerValueHex: trackerProof.valueHex,
    trackerGetProofHex: trackerProof.getProofHex,
    trackerInputDigestHex: trackerProof.digestHex,
    trackerAnchorHeaderIdHex: trackerValue.anchorHeaderIdHex,
    trackerAnchorHeight: trackerValue.anchorHeaderHeight,
    bridgeEventRootHex: trackerValue.bridgeEventRootHex,
    burnLeaf,
    burnProof: [...input.claim.burnProof],
    recipientErgoTreeHex,
    duplicatePreventionKeyHex,
    dupInputDigestHex,
    dupOutputDigestHex: dupTransition.new_digest_hex,
    dupLookupProofHex: dupTransition.lookup_proof_hex,
    dupInsertProofHex: dupTransition.insert_proof_hex,
    dupExtension,
    vaultExtension,
    boundaries: {
      trackerEntryDecoded: true as const,
      burnInclusionValidatedByPlanner: true as const,
      // EIP-0045 chain-domain identity is an activation-time capability, not
      // caller-provided settlement data and not a V1 payout authority.
      chainDomainActivationIdentityResolved: false as const,
      // V1 carries the compatibility burn root but does not prove that root
      // as application-state membership under the finalized state root.
      bridgeEventRootFinalizedStateMembershipEstablished: false as const,
      activationEstablished: false as const,
      nodeAcceptanceEstablished: false as const,
      proofValidityEstablishedInPayoutTx: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
    },
  });
}

export function buildValiditySettlementVaultExtension(input: {
  readonly trackerKeyHex: string;
  readonly trackerGetProofHex: string;
  readonly burnLeaf: TrustlessBurnLeaf;
  readonly sidechainHeight: string | number | bigint;
  readonly burnProof: readonly TrustlessBurnMerkleProofStep[];
  readonly dupLookupProofHex: string;
  readonly dupInsertProofHex: string;
}): Readonly<Record<'0' | '1' | '2' | '3', string>> {
  const trackerKeyHex = fixedHex(input.trackerKeyHex, 32, 'trackerKey');
  const trackerGetProofHex = variableHex(
    input.trackerGetProofHex,
    'tracker get proof',
  );
  const encodedLeafHex = fixedHex(
    input.burnLeaf.encodedLeafHex,
    VALIDITY_SETTLEMENT_V1_BURN_LEAF_BYTES,
    'burn leaf',
  );
  return Object.freeze({
    '0': encodeCollByteRegister(Buffer.from(trackerKeyHex, 'hex')),
    '1': encodeCollByteRegister(Buffer.from(trackerGetProofHex, 'hex')),
    '2': encodeCollByteRegister(Buffer.from(encodedLeafHex, 'hex')),
    '3': encodeCollByteRegister(buildCompactProofBundle({
      sidechainHeight: input.sidechainHeight,
      burnProof: input.burnProof,
      dupLookupProofHex: input.dupLookupProofHex,
      dupInsertProofHex: input.dupInsertProofHex,
    })),
  });
}

function normalizeProfile(profile: ValiditySettlementProfileV1): ValiditySettlementProfileV1 {
  if (profile.formatVersion !== VALIDITY_SETTLEMENT_PROFILE_V1_FORMAT) {
    throw new Error('validity settlement profile format version is not supported');
  }
  if (
    profile.compatibilityProofSystemId
    !== VALIDITY_SETTLEMENT_V1_COMPATIBILITY_PROOF_SYSTEM_ID
  ) {
    throw new Error('validity settlement profile proof-system ID is not supported');
  }
  if (
    profile.minAnchorConfirmations
    !== VALIDITY_SETTLEMENT_V1_MIN_ANCHOR_CONFIRMATIONS
  ) {
    throw new Error('validity settlement profile must require exactly 10 anchor confirmations');
  }
  const normalized = {
    formatVersion: profile.formatVersion,
    compatibilityProofSystemId: profile.compatibilityProofSystemId,
    minAnchorConfirmations: profile.minAnchorConfirmations,
    sourceNetworkIdHex: fixedHex(profile.sourceNetworkIdHex, 32, 'sourceNetworkId'),
    sidechainIdHex: fixedHex(profile.sidechainIdHex, 32, 'sidechainId'),
    trackerNftIdHex: fixedHex(profile.trackerNftIdHex, 32, 'trackerNftId'),
    trackerContractIdHex: fixedHex(profile.trackerContractIdHex, 32, 'trackerContractId'),
    approvedTrustRootDigestHex: fixedHex(
      profile.approvedTrustRootDigestHex,
      32,
      'approvedTrustRootDigest',
    ),
    compatibilitySemanticProgramIdHex: fixedHex(
      profile.compatibilitySemanticProgramIdHex,
      32,
      'compatibilitySemanticProgramId',
    ),
    compatibilityVerifierProfileIdHex: fixedHex(
      profile.compatibilityVerifierProfileIdHex,
      32,
      'compatibilityVerifierProfileId',
    ),
    duplicatePreventionNftIdHex: fixedHex(
      profile.duplicatePreventionNftIdHex,
      32,
      'duplicatePreventionNftId',
    ),
    admissionProfileIdHex: fixedHex(
      profile.admissionProfileIdHex,
      32,
      'admissionProfileId',
    ),
    zeroSourceAssetIdHex: fixedHex(
      profile.zeroSourceAssetIdHex,
      32,
      'zeroSourceAssetId',
    ),
  } as const;
  if (normalized.zeroSourceAssetIdHex !== VALIDITY_SETTLEMENT_V1_ZERO_SOURCE_ASSET_ID_HEX) {
    throw new Error('validity settlement V1 supports only the zero native ERG asset ID');
  }
  const requiredIdentities = [
    ['sourceNetworkId', normalized.sourceNetworkIdHex],
    ['sidechainId', normalized.sidechainIdHex],
    ['trackerNftId', normalized.trackerNftIdHex],
    ['trackerContractId', normalized.trackerContractIdHex],
    ['approvedTrustRootDigest', normalized.approvedTrustRootDigestHex],
    ['compatibilitySemanticProgramId', normalized.compatibilitySemanticProgramIdHex],
    ['compatibilityVerifierProfileId', normalized.compatibilityVerifierProfileIdHex],
    ['duplicatePreventionNftId', normalized.duplicatePreventionNftIdHex],
    ['admissionProfileId', normalized.admissionProfileIdHex],
  ] as const;
  for (const [label, value] of requiredIdentities) {
    if (value === VALIDITY_SETTLEMENT_V1_ZERO_SOURCE_ASSET_ID_HEX) {
      throw new Error(`validity settlement ${label} must be nonzero`);
    }
  }
  return Object.freeze(normalized);
}

function buildCompactProofBundle(input: {
  readonly sidechainHeight: string | number | bigint;
  readonly burnProof: readonly TrustlessBurnMerkleProofStep[];
  readonly dupLookupProofHex: string;
  readonly dupInsertProofHex: string;
}): Buffer {
  if (input.burnProof.length > TRUSTLESS_COMPACT_UNLOCK_MAX_BURN_PROOF_NODES) {
    throw new Error('validity settlement burn proof exceeds the compact ABI node cap');
  }
  const burnProof = Buffer.concat(input.burnProof.map(step => {
    const side = step.side === 'left' ? 0 : step.side === 'right' ? 1 : undefined;
    if (side === undefined) throw new Error('validity settlement burn proof side is invalid');
    return Buffer.concat([
      Buffer.from([side]),
      fixedHexBytes(step.hashHex, 32, 'burn proof hash'),
    ]);
  }));
  const lookup = Buffer.from(variableHex(input.dupLookupProofHex, 'DUP lookup proof'), 'hex');
  const insert = Buffer.from(variableHex(input.dupInsertProofHex, 'DUP insert proof'), 'hex');
  if (lookup.length === 0 || insert.length === 0) {
    throw new Error('validity settlement DUP proofs must be non-empty');
  }
  return Buffer.concat([
    uint64Be(positiveSignedLong(input.sidechainHeight, 'sidechainHeight')),
    uint64Be(BigInt(input.burnProof.length)),
    uint64Be(BigInt(lookup.length)),
    burnProof,
    lookup,
    insert,
  ]);
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length !== bytes * 2
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be exactly ${bytes} lowercase hex bytes`);
  }
  return value;
}

function variableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be non-empty canonical lowercase hex`);
  }
  return value;
}

function fixedHexBytes(value: unknown, bytes: number, label: string): Buffer {
  return Buffer.from(fixedHex(value, bytes, label), 'hex');
}

function uint32Be(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function uint64Be(value: bigint): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(value);
  return bytes;
}

function positiveSignedLong(value: string | number | bigint, label: string): bigint {
  let normalized: bigint;
  try {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) {
      throw new Error();
    }
    if (typeof value === 'string' && !/^(?:0|[1-9][0-9]*)$/.test(value)) {
      throw new Error();
    }
    normalized = BigInt(value);
  } catch {
    throw new Error(`${label} must be a canonical positive signed Long`);
  }
  if (normalized <= 0n || normalized > ERGO_LONG_MAX) {
    throw new Error(`${label} must fit a positive signed Long`);
  }
  return normalized;
}

function nonnegativeInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x7fff_ffff) {
    throw new Error(`${label} must fit a nonnegative Int`);
  }
  return value;
}

function blake2b256(value: Buffer): Buffer {
  return Buffer.from(blakejs.blake2b(value, undefined, 32));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
