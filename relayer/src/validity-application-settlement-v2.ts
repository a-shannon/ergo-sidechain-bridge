/**
 * Pure preactivation planner for the application-bound settlement V2 family.
 *
 * The planner consumes the exact WP-06AD tracker family, cross-checks the
 * application payload off-chain, validates one canonical burn inclusion path,
 * and constructs tracker/DUP proofs plus the compact settlement ABI. It has no
 * node, persistence, checker, signer, submitter, or broadcast capability.
 */

import blakejs from 'blakejs';

import { getDupTreeDigest, insertLockRecord } from './avl-bridge.js';
import {
  BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES,
  decodeBridgeValidityApplicationPayloadV3,
  deriveBridgeCausalApplicationBindingV2DigestHex,
} from './bridge-validity-application-statement-v2.js';
import {
  EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES,
  EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_SHA256_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX,
} from './bridge-validity-tracker-contract-v2.js';
import { encodeCollByteRegister } from './ergo-encoding.js';
import {
  APPLICATION_VALIDITY_SPV_TRACKER_FLAGS,
  APPLICATION_VALIDITY_SPV_TRACKER_KEY_LENGTH,
  APPLICATION_VALIDITY_SPV_TRACKER_MAX_BURNS,
  APPLICATION_VALIDITY_SPV_TRACKER_VALUE_LENGTH,
  EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
  EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
  buildApplicationValiditySpvTrackerGetProof,
  decodeApplicationValiditySpvTrackerValue,
  deriveApplicationValidityPayloadDigestHex,
  deriveApplicationValiditySpvTrackerKey,
  type ApplicationValiditySpvTrackerHistoryEntry,
  type ApplicationValiditySpvTrackerIdentity,
  type ApplicationValiditySpvTrackerValue,
} from './spv-tracker-validity-v2.js';
import {
  encodeTrustlessBurnLeaf,
  validateTrustlessBurnInclusionProofEnvelope,
  type TrustlessBurnLeaf,
  type TrustlessBurnLeafInput,
  type TrustlessBurnMerkleProofStep,
} from './trustless-burn-proof.js';

export const VALIDITY_APPLICATION_SETTLEMENT_PROFILE_V2_FORMAT = 2 as const;
export const VALIDITY_APPLICATION_SETTLEMENT_PROFILE_V2_DOMAIN =
  'E2S_VALIDITY_APPLICATION_SETTLEMENT_PROFILE_V2' as const;
export const VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_DOMAIN =
  'E2S_VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2' as const;
export const VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_VERSION = 2 as const;
export const VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_HASH_BLAKE2B256 = 1 as const;
export const VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_SOURCE_APPLICATION = 1 as const;
export const VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_FLAGS_NONE = 0 as const;
export const VALIDITY_APPLICATION_SETTLEMENT_V2_MIN_ANCHOR_CONFIRMATIONS = 10 as const;
export const VALIDITY_APPLICATION_SETTLEMENT_V2_BURN_LEAF_BYTES = 205;
export const VALIDITY_APPLICATION_SETTLEMENT_V2_RECIPIENT_ERGOTREE_BYTES = 36;
export const VALIDITY_APPLICATION_SETTLEMENT_V2_ZERO_SOURCE_ASSET_ID_HEX =
  '00'.repeat(32);
export const VALIDITY_APPLICATION_SETTLEMENT_V2_TRACKER_NFT_ID_HEX =
  'a1'.repeat(32);
export const VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_NFT_ID_HEX =
  'a2'.repeat(32);
export const VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX =
  'bb6a14b2c4a73c39dae8de6c2214c330858120232806c77110263b395e493abe';
export const VALIDITY_APPLICATION_SETTLEMENT_PROFILE_V2_BYTES = 421;
export const VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_HEADER_BYTES =
  Buffer.byteLength(VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_DOMAIN, 'ascii')
  + 1
  + 4
  + (5 * 8);

const DIGEST_BYTES = 32;
const MAX_SIGNED_LONG = 0x7fff_ffff_ffff_ffffn;
const MAX_HEADER_HEIGHT = 0x7fff_ffff;
const BURN_NODE_BYTES = 33;
const BURN_NODE_DOMAIN = Buffer.from('E2S_TRUSTLESS_BURN_NODE_V1', 'ascii');
const EXACT_APPLICATION_BINDING_DIGEST_HEX =
  deriveBridgeCausalApplicationBindingV2DigestHex(
    EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX,
  );

export interface ValidityApplicationSettlementProfileV2 {
  readonly formatVersion: typeof VALIDITY_APPLICATION_SETTLEMENT_PROFILE_V2_FORMAT;
  readonly minAnchorConfirmations:
    typeof VALIDITY_APPLICATION_SETTLEMENT_V2_MIN_ANCHOR_CONFIRMATIONS;
  readonly sourceNetworkIdHex: string;
  readonly sidechainIdHex: string;
  readonly trackerNftIdHex: string;
  readonly trackerContractIdHex: string;
  readonly trackerPropositionBytesHex: string;
  readonly approvedTrustRootDigestHex: string;
  readonly applicationBindingHex: string;
  readonly applicationBindingDigestHex: string;
  readonly settlementProfileIdHex: string;
  readonly causalProfileIdHex: string;
  readonly programIdHex: string;
  readonly verifierProfileIdHex: string;
  readonly duplicatePreventionNftIdHex: string;
  readonly zeroSourceAssetIdHex: string;
}

export interface ApplicationValidityTrackerTreeV2 {
  readonly digestHex: string;
  readonly keyLength: number;
  readonly valueLength: number;
  readonly flags: number;
}

export interface ValidityApplicationSettlementClaimV2 {
  readonly trackerIdentity: Omit<ApplicationValiditySpvTrackerIdentity, 'sidechainIdHex'>;
  readonly burnLeaf: TrustlessBurnLeafInput;
  readonly leafIndex: number;
  readonly leafCount: number;
  readonly burnProof: readonly TrustlessBurnMerkleProofStep[];
  readonly recipientErgoTreeHex: string;
}

export interface BuildValidityApplicationSettlementPlanV2Input {
  readonly profile: ValidityApplicationSettlementProfileV2;
  readonly trackerHistory: readonly ApplicationValiditySpvTrackerHistoryEntry[];
  readonly trackerTree: ApplicationValidityTrackerTreeV2;
  readonly applicationPayloadHex: string;
  readonly duplicatePreventionHistoryKeys: readonly string[];
  readonly claim: ValidityApplicationSettlementClaimV2;
  readonly currentErgoHeight: number;
}

export interface ValidityApplicationSettlementBundleV2 {
  readonly sidechainHeight: string;
  readonly leafIndex: number;
  readonly leafCount: number;
  readonly burnProofNodeCount: number;
  readonly dupLookupProofLength: number;
  readonly burnProof: readonly TrustlessBurnMerkleProofStep[];
  readonly dupLookupProofHex: string;
  readonly dupInsertProofHex: string;
  readonly encodedBundleHex: string;
}

export interface ValidityApplicationSettlementPlanV2 {
  readonly profile: ValidityApplicationSettlementProfileV2;
  readonly settlementProfileIdHex: string;
  readonly profileDescriptorDigestHex: string;
  readonly encodedProfileHex: string;
  readonly contractCompatibility:
    'validity-application-settlement-v2-preactivation';
  readonly trackerPropositionBytesHex: string;
  readonly trackerKeyHex: string;
  readonly trackerValueHex: string;
  readonly trackerGetProofHex: string;
  readonly trackerInputDigestHex: string;
  readonly trackerValue: ApplicationValiditySpvTrackerValue;
  readonly applicationPayloadDigestHex: string;
  readonly burnLeaf: TrustlessBurnLeaf;
  readonly leafIndex: number;
  readonly leafCount: number;
  readonly burnProof: readonly TrustlessBurnMerkleProofStep[];
  readonly recipientErgoTreeHex: string;
  readonly duplicatePreventionKeyHex: string;
  readonly dupInputDigestHex: string;
  readonly dupOutputDigestHex: string;
  readonly dupLookupProofHex: string;
  readonly dupInsertProofHex: string;
  readonly proofBundleHex: string;
  readonly dupExtension: Readonly<Record<'0' | '1' | '2', string>>;
  readonly vaultExtension: Readonly<Record<'0' | '1' | '2' | '3', string>>;
  readonly boundaries: {
    readonly trackerValueDecoded: true;
    readonly applicationPayloadCrossCheckedOffChain: true;
    readonly canonicalBurnPathValidatedByPlanner: true;
    readonly payloadOrReceiptTransportedToSettlement: false;
    readonly profileActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly proofValidityEstablishedInPayoutTransaction: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
  };
}

export function encodeValidityApplicationSettlementProfileV2(
  profile: ValidityApplicationSettlementProfileV2,
): string {
  const normalized = normalizeProfile(profile);
  const encoded = Buffer.concat([
    Buffer.from([normalized.formatVersion]),
    fixedHexBytes(normalized.sourceNetworkIdHex, 32, 'sourceNetworkId'),
    fixedHexBytes(normalized.sidechainIdHex, 32, 'sidechainId'),
    fixedHexBytes(normalized.trackerNftIdHex, 32, 'trackerNftId'),
    fixedHexBytes(normalized.trackerContractIdHex, 32, 'trackerContractId'),
    fixedHexBytes(
      EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_SHA256_HEX,
      32,
      'trackerPropositionSha256',
    ),
    fixedHexBytes(
      normalized.approvedTrustRootDigestHex,
      32,
      'approvedTrustRootDigest',
    ),
    fixedHexBytes(
      normalized.applicationBindingDigestHex,
      32,
      'applicationBindingDigest',
    ),
    fixedHexBytes(normalized.settlementProfileIdHex, 32, 'settlementProfileId'),
    fixedHexBytes(normalized.causalProfileIdHex, 32, 'causalProfileId'),
    fixedHexBytes(normalized.programIdHex, 32, 'programId'),
    fixedHexBytes(normalized.verifierProfileIdHex, 32, 'verifierProfileId'),
    fixedHexBytes(
      normalized.duplicatePreventionNftIdHex,
      32,
      'duplicatePreventionNftId',
    ),
    fixedHexBytes(normalized.zeroSourceAssetIdHex, 32, 'zeroSourceAssetId'),
    uint32Be(normalized.minAnchorConfirmations),
  ]);
  if (encoded.length !== VALIDITY_APPLICATION_SETTLEMENT_PROFILE_V2_BYTES) {
    throw new Error('application settlement V2 profile internal length mismatch');
  }
  return encoded.toString('hex');
}

export function deriveValidityApplicationSettlementProfileDescriptorDigestV2(
  profile: ValidityApplicationSettlementProfileV2,
): string {
  return blake2b256(Buffer.concat([
    Buffer.from(VALIDITY_APPLICATION_SETTLEMENT_PROFILE_V2_DOMAIN, 'ascii'),
    Buffer.from(encodeValidityApplicationSettlementProfileV2(profile), 'hex'),
  ])).toString('hex');
}

export function buildValidityApplicationSettlementPlanV2(
  input: BuildValidityApplicationSettlementPlanV2Input,
): ValidityApplicationSettlementPlanV2 {
  const profile = normalizeProfile(input.profile);
  const encodedProfileHex =
    encodeValidityApplicationSettlementProfileV2(profile);
  const trackerTree = normalizeTrackerTree(input.trackerTree);
  const recipientErgoTreeHex = fixedHex(
    input.claim.recipientErgoTreeHex,
    VALIDITY_APPLICATION_SETTLEMENT_V2_RECIPIENT_ERGOTREE_BYTES,
    'recipientErgoTree',
  );
  const burnLeaf = encodeTrustlessBurnLeaf(input.claim.burnLeaf);
  if (
    burnLeaf.encodedLeafHex.length / 2
    !== VALIDITY_APPLICATION_SETTLEMENT_V2_BURN_LEAF_BYTES
  ) {
    throw new Error('application settlement burn leaf must use the 205-byte V1 leaf codec');
  }
  requireEqual(
    burnLeaf.sidechainIdHex,
    profile.sidechainIdHex,
    'burn leaf sidechain ID',
  );
  requireEqual(
    burnLeaf.assetIdHex,
    profile.zeroSourceAssetIdHex,
    'application settlement native ERG asset lane',
  );
  requireEqual(
    blake2b256(Buffer.from(recipientErgoTreeHex, 'hex')).toString('hex'),
    burnLeaf.recipientErgoTreeHashHex,
    'settlement recipient ErgoTree',
  );
  positiveSignedLong(burnLeaf.amountNanoErg, 'burn amount');

  const trackerIdentity: ApplicationValiditySpvTrackerIdentity = {
    sidechainIdHex: profile.sidechainIdHex,
    sidechainHeight: input.claim.trackerIdentity.sidechainHeight,
    executionBlockHashHex: fixedHex(
      input.claim.trackerIdentity.executionBlockHashHex,
      DIGEST_BYTES,
      'executionBlockHash',
    ),
  };
  requireEqual(
    trackerIdentity.executionBlockHashHex,
    burnLeaf.sidechainBlockHashHex,
    'burn leaf execution block',
  );
  const trackerKeyHex = deriveApplicationValiditySpvTrackerKey(trackerIdentity);
  const trackerProof = buildApplicationValiditySpvTrackerGetProof(
    input.trackerHistory,
    trackerIdentity,
  );
  requireEqual(trackerProof.keyHex, trackerKeyHex, 'application tracker V2 key');
  requireEqual(
    trackerProof.digestHex,
    trackerTree.digestHex,
    'application tracker V2 AVL digest',
  );
  const trackerValue =
    decodeApplicationValiditySpvTrackerValue(trackerProof.valueHex);
  validateTrackerStaticBindings(trackerValue, profile);
  validateTrackerDynamicBindings(
    trackerValue,
    trackerIdentity,
    input.applicationPayloadHex,
    profile,
  );

  const currentErgoHeight =
    nonnegativeInt(input.currentErgoHeight, 'currentErgoHeight');
  if (currentErgoHeight < trackerValue.anchorHeaderHeight) {
    throw new Error('application settlement tracker anchor cannot be in the future');
  }
  if (
    currentErgoHeight - trackerValue.anchorHeaderHeight
    < profile.minAnchorConfirmations
  ) {
    throw new Error('application settlement tracker anchor lacks required confirmations');
  }

  const leafIndex = boundedLeafIndex(input.claim.leafIndex, 'leafIndex');
  const leafCount = boundedLeafCount(input.claim.leafCount, 'leafCount');
  if (leafCount !== trackerValue.burnLeafCount) {
    throw new Error(
      'application settlement leafCount must equal tracker burnLeafCount',
    );
  }
  const envelope = validateTrustlessBurnInclusionProofEnvelope({
    bridgeEventRootHex: trackerValue.bridgeEventRootHex,
    leaf: burnLeaf,
    leafIndex,
    leafCount,
    proof: [...input.claim.burnProof],
  });
  const canonicalPathErrors = validateCanonicalBurnPath({
    leafHashHex: burnLeaf.leafHashHex,
    leafIndex,
    leafCount,
    proof: input.claim.burnProof,
  });
  const proofErrors = [...envelope.errors, ...canonicalPathErrors];
  if (proofErrors.length > 0) {
    throw new Error(
      `application settlement burn inclusion rejected: ${[...new Set(proofErrors)].join('; ')}`,
    );
  }

  const duplicatePreventionKeyHex = burnLeaf.burnIdHex;
  const dupHistory = input.duplicatePreventionHistoryKeys.map((key, index) =>
    fixedHex(key, DIGEST_BYTES, `duplicatePreventionHistoryKeys[${index}]`));
  if (dupHistory.includes(duplicatePreventionKeyHex)) {
    throw new Error('application settlement burn ID is already present in DUP history');
  }
  const dupInputDigestHex = getDupTreeDigest(dupHistory);
  const dupTransition = insertLockRecord(
    dupHistory,
    duplicatePreventionKeyHex,
  );
  const proofBundle = encodeValidityApplicationSettlementBundleV2({
    sidechainHeight: trackerIdentity.sidechainHeight,
    leafIndex,
    leafCount,
    leafHashHex: burnLeaf.leafHashHex,
    burnProof: input.claim.burnProof,
    dupLookupProofHex: dupTransition.lookup_proof_hex,
    dupInsertProofHex: dupTransition.insert_proof_hex,
  });
  const dupExtension = Object.freeze({
    '0': encodeCollByteRegister(
      Buffer.from(dupTransition.lookup_proof_hex, 'hex'),
    ),
    '1': encodeCollByteRegister(Buffer.from(duplicatePreventionKeyHex, 'hex')),
    '2': encodeCollByteRegister(
      Buffer.from(dupTransition.insert_proof_hex, 'hex'),
    ),
  });
  const vaultExtension = Object.freeze({
    '0': encodeCollByteRegister(Buffer.from(trackerKeyHex, 'hex')),
    '1': encodeCollByteRegister(Buffer.from(trackerProof.getProofHex, 'hex')),
    '2': encodeCollByteRegister(Buffer.from(burnLeaf.encodedLeafHex, 'hex')),
    '3': encodeCollByteRegister(Buffer.from(proofBundle, 'hex')),
  });

  return deepFreeze({
    profile,
    settlementProfileIdHex: profile.settlementProfileIdHex,
    profileDescriptorDigestHex:
      deriveValidityApplicationSettlementProfileDescriptorDigestV2(profile),
    encodedProfileHex,
    contractCompatibility:
      'validity-application-settlement-v2-preactivation' as const,
    trackerPropositionBytesHex: profile.trackerPropositionBytesHex,
    trackerKeyHex,
    trackerValueHex: trackerProof.valueHex,
    trackerGetProofHex: trackerProof.getProofHex,
    trackerInputDigestHex: trackerProof.digestHex,
    trackerValue,
    applicationPayloadDigestHex: trackerValue.applicationPayloadDigestHex,
    burnLeaf,
    leafIndex,
    leafCount,
    burnProof: [...input.claim.burnProof],
    recipientErgoTreeHex,
    duplicatePreventionKeyHex,
    dupInputDigestHex,
    dupOutputDigestHex: dupTransition.new_digest_hex,
    dupLookupProofHex: dupTransition.lookup_proof_hex,
    dupInsertProofHex: dupTransition.insert_proof_hex,
    proofBundleHex: proofBundle,
    dupExtension,
    vaultExtension,
    boundaries: {
      trackerValueDecoded: true as const,
      applicationPayloadCrossCheckedOffChain: true as const,
      canonicalBurnPathValidatedByPlanner: true as const,
      payloadOrReceiptTransportedToSettlement: false as const,
      profileActivated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      proofValidityEstablishedInPayoutTransaction: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
    },
  });
}

export function encodeValidityApplicationSettlementBundleV2(input: {
  readonly sidechainHeight: string | number | bigint;
  readonly leafIndex: number;
  readonly leafCount: number;
  readonly leafHashHex: string;
  readonly burnProof: readonly TrustlessBurnMerkleProofStep[];
  readonly dupLookupProofHex: string;
  readonly dupInsertProofHex: string;
}): string {
  const sidechainHeight =
    positiveSignedLong(input.sidechainHeight, 'sidechainHeight');
  const leafIndex = boundedLeafIndex(input.leafIndex, 'leafIndex');
  const leafCount = boundedLeafCount(input.leafCount, 'leafCount');
  const pathErrors = validateCanonicalBurnPath({
    leafHashHex: input.leafHashHex,
    leafIndex,
    leafCount,
    proof: input.burnProof,
  });
  if (pathErrors.length > 0) {
    throw new Error(
      `application settlement compact burn path rejected: ${pathErrors.join('; ')}`,
    );
  }
  const burnProof = Buffer.concat(input.burnProof.map((step, index) => {
    const side = step.side === 'left'
      ? 0
      : step.side === 'right'
        ? 1
        : undefined;
    if (side === undefined) {
      throw new Error(`burn proof step ${index} side is invalid`);
    }
    return Buffer.concat([
      Buffer.from([side]),
      fixedHexBytes(step.hashHex, DIGEST_BYTES, `burn proof step ${index} hash`),
    ]);
  }));
  const lookup = Buffer.from(
    variableHex(input.dupLookupProofHex, 'DUP lookup proof'),
    'hex',
  );
  const insert = Buffer.from(
    variableHex(input.dupInsertProofHex, 'DUP insert proof'),
    'hex',
  );
  if (lookup.length === 0 || insert.length === 0) {
    throw new Error('application settlement DUP proofs must be non-empty');
  }
  const encoded = Buffer.concat([
    Buffer.from(VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_DOMAIN, 'ascii'),
    Buffer.from([0]),
    Buffer.from([
      VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_VERSION,
      VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_HASH_BLAKE2B256,
      VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_SOURCE_APPLICATION,
      VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_FLAGS_NONE,
    ]),
    uint64Be(sidechainHeight),
    uint64Be(BigInt(leafIndex)),
    uint64Be(BigInt(leafCount)),
    uint64Be(BigInt(input.burnProof.length)),
    uint64Be(BigInt(lookup.length)),
    burnProof,
    lookup,
    insert,
  ]);
  return encoded.toString('hex');
}

export function decodeValidityApplicationSettlementBundleV2(
  bundleHex: string,
): ValidityApplicationSettlementBundleV2 {
  const bytes = Buffer.from(
    variableHex(bundleHex, 'application settlement V2 bundle'),
    'hex',
  );
  if (bytes.length < VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_HEADER_BYTES + 2) {
    throw new Error('application settlement V2 bundle is truncated');
  }
  const domainBytes = Buffer.byteLength(
    VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_DOMAIN,
    'ascii',
  );
  const expectedDomain = Buffer.concat([
    Buffer.from(VALIDITY_APPLICATION_SETTLEMENT_BUNDLE_V2_DOMAIN, 'ascii'),
    Buffer.from([0]),
  ]);
  if (!bytes.subarray(0, domainBytes + 1).equals(expectedDomain)) {
    throw new Error('application settlement V2 bundle domain mismatch');
  }
  const discriminatorOffset = domainBytes + 1;
  const discriminators = [
    bytes[discriminatorOffset],
    bytes[discriminatorOffset + 1],
    bytes[discriminatorOffset + 2],
    bytes[discriminatorOffset + 3],
  ];
  if (discriminators.join(',') !== '2,1,1,0') {
    throw new Error('application settlement V2 bundle discriminator mismatch');
  }
  let offset = discriminatorOffset + 4;
  const sidechainHeight = readPositiveSignedLong(bytes, offset, 'sidechainHeight');
  offset += 8;
  const leafIndex = readBoundedCount(bytes, offset, 'leafIndex', 0, 255);
  offset += 8;
  const leafCount = readBoundedCount(
    bytes,
    offset,
    'leafCount',
    1,
    APPLICATION_VALIDITY_SPV_TRACKER_MAX_BURNS,
  );
  offset += 8;
  const burnProofNodeCount = readBoundedCount(
    bytes,
    offset,
    'burnProofNodeCount',
    0,
    maxMerkleDepth(APPLICATION_VALIDITY_SPV_TRACKER_MAX_BURNS),
  );
  offset += 8;
  const dupLookupProofLength = readBoundedCount(
    bytes,
    offset,
    'dupLookupProofLen',
    1,
    Number.MAX_SAFE_INTEGER,
  );
  offset += 8;
  if (leafIndex >= leafCount) {
    throw new Error('application settlement V2 bundle leafIndex must be less than leafCount');
  }
  if (burnProofNodeCount !== maxMerkleDepth(leafCount)) {
    throw new Error('application settlement V2 bundle path length does not match leafCount');
  }
  const burnProofBytes = burnProofNodeCount * BURN_NODE_BYTES;
  const insertOffset = offset + burnProofBytes + dupLookupProofLength;
  if (insertOffset >= bytes.length) {
    throw new Error('application settlement V2 bundle proof lengths exceed payload');
  }
  const burnProof: TrustlessBurnMerkleProofStep[] = [];
  for (let index = 0; index < burnProofNodeCount; index += 1) {
    const side = bytes[offset];
    if (side !== 0 && side !== 1) {
      throw new Error(`application settlement V2 bundle burn step ${index} side is invalid`);
    }
    burnProof.push({
      side: side === 0 ? 'left' : 'right',
      hashHex: bytes.subarray(offset + 1, offset + BURN_NODE_BYTES).toString('hex'),
    });
    offset += BURN_NODE_BYTES;
  }
  const directionErrors = validatePathShape(leafIndex, leafCount, burnProof);
  if (directionErrors.length > 0) {
    throw new Error(
      `application settlement V2 bundle path rejected: ${directionErrors.join('; ')}`,
    );
  }
  const dupLookupProofHex =
    bytes.subarray(offset, offset + dupLookupProofLength).toString('hex');
  offset += dupLookupProofLength;
  const dupInsertProofHex = bytes.subarray(offset).toString('hex');
  if (dupInsertProofHex.length === 0) {
    throw new Error('application settlement V2 bundle DUP insert proof is empty');
  }
  return deepFreeze({
    sidechainHeight: sidechainHeight.toString(),
    leafIndex,
    leafCount,
    burnProofNodeCount,
    dupLookupProofLength,
    burnProof,
    dupLookupProofHex,
    dupInsertProofHex,
    encodedBundleHex: bytes.toString('hex'),
  });
}

function validateTrackerStaticBindings(
  trackerValue: ApplicationValiditySpvTrackerValue,
  profile: ValidityApplicationSettlementProfileV2,
): void {
  requireEqual(
    trackerValue.applicationBindingDigestHex,
    profile.applicationBindingDigestHex,
    'tracker application-binding digest',
  );
  requireEqual(
    trackerValue.settlementProfileIdHex,
    profile.settlementProfileIdHex,
    'tracker settlement profile',
  );
  requireEqual(
    trackerValue.causalProfileIdHex,
    profile.causalProfileIdHex,
    'tracker causal profile',
  );
  requireEqual(
    trackerValue.programIdHex,
    profile.programIdHex,
    'tracker program ID',
  );
  requireEqual(
    trackerValue.verifierProfileIdHex,
    profile.verifierProfileIdHex,
    'tracker verifier profile',
  );
}

function validateTrackerDynamicBindings(
  trackerValue: ApplicationValiditySpvTrackerValue,
  trackerIdentity: ApplicationValiditySpvTrackerIdentity,
  applicationPayloadHex: string,
  profile: ValidityApplicationSettlementProfileV2,
): void {
  const payload = decodeBridgeValidityApplicationPayloadV3(applicationPayloadHex);
  const application = payload.application;
  const checkpoint = payload.finality.checkpoint;
  requireEqual(
    application.encodedBindingHex,
    profile.applicationBindingHex,
    'application payload exact binding',
  );
  requireEqual(
    payload.applicationBindingDigestHex,
    profile.applicationBindingDigestHex,
    'application payload binding digest',
  );
  requireEqual(
    application.sourceNetworkIdHex,
    profile.sourceNetworkIdHex,
    'application payload source network',
  );
  requireEqual(
    application.sidechainIdHex,
    profile.sidechainIdHex,
    'application payload sidechain',
  );
  requireEqual(
    application.settlementProfileIdHex,
    profile.settlementProfileIdHex,
    'application payload settlement profile',
  );
  requireEqual(
    application.causalProfileIdHex,
    profile.causalProfileIdHex,
    'application payload causal profile',
  );
  requireEqual(
    payload.finality.trackerNftIdHex,
    profile.trackerNftIdHex,
    'application payload tracker NFT',
  );
  requireEqual(
    payload.finality.trustedAnchorDigestHex,
    profile.approvedTrustRootDigestHex,
    'application payload trust root',
  );
  requireEqual(
    checkpoint.sidechainIdHex,
    profile.sidechainIdHex,
    'application checkpoint sidechain',
  );
  requireEqual(
    checkpoint.sidechainHeight,
    positiveSignedLong(
      trackerIdentity.sidechainHeight,
      'tracker sidechainHeight',
    ).toString(),
    'application checkpoint sidechain height',
  );
  requireEqual(
    checkpoint.executionBlockHashHex,
    trackerIdentity.executionBlockHashHex,
    'application checkpoint execution block',
  );
  requireEqual(
    checkpoint.bridgeEventRootHex,
    trackerValue.bridgeEventRootHex,
    'application checkpoint bridge event root',
  );
  requireEqual(
    payload.finality.checkpointCommitmentHex,
    trackerValue.checkpointCommitmentHex,
    'application checkpoint commitment',
  );
  requireEqual(
    checkpoint.sidechainConsensusBlockHashHex,
    trackerValue.sidechainConsensusBlockHashHex,
    'application checkpoint consensus block',
  );
  if (checkpoint.burnLeafCount !== trackerValue.burnLeafCount) {
    throw new Error('application checkpoint burn count does not match tracker value');
  }
  requireEqual(
    deriveApplicationValidityPayloadDigestHex(applicationPayloadHex),
    trackerValue.applicationPayloadDigestHex,
    'application payload digest',
  );
}

function normalizeProfile(
  profile: ValidityApplicationSettlementProfileV2,
): ValidityApplicationSettlementProfileV2 {
  if (profile.formatVersion !== VALIDITY_APPLICATION_SETTLEMENT_PROFILE_V2_FORMAT) {
    throw new Error('application settlement profile format version is not supported');
  }
  if (
    profile.minAnchorConfirmations
    !== VALIDITY_APPLICATION_SETTLEMENT_V2_MIN_ANCHOR_CONFIRMATIONS
  ) {
    throw new Error('application settlement profile must require exactly 10 anchor confirmations');
  }
  const normalized = {
    formatVersion: profile.formatVersion,
    minAnchorConfirmations: profile.minAnchorConfirmations,
    sourceNetworkIdHex: fixedHex(profile.sourceNetworkIdHex, 32, 'sourceNetworkId'),
    sidechainIdHex: fixedHex(profile.sidechainIdHex, 32, 'sidechainId'),
    trackerNftIdHex: nonzeroFixedHex(profile.trackerNftIdHex, 32, 'trackerNftId'),
    trackerContractIdHex: fixedHex(
      profile.trackerContractIdHex,
      32,
      'trackerContractId',
    ),
    trackerPropositionBytesHex: fixedHex(
      profile.trackerPropositionBytesHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES,
      'trackerPropositionBytes',
    ),
    approvedTrustRootDigestHex: nonzeroFixedHex(
      profile.approvedTrustRootDigestHex,
      32,
      'approvedTrustRootDigest',
    ),
    applicationBindingHex: fixedHex(
      profile.applicationBindingHex,
      BRIDGE_CAUSAL_APPLICATION_BINDING_V2_BYTES,
      'applicationBinding',
    ),
    applicationBindingDigestHex: fixedHex(
      profile.applicationBindingDigestHex,
      32,
      'applicationBindingDigest',
    ),
    settlementProfileIdHex: fixedHex(
      profile.settlementProfileIdHex,
      32,
      'settlementProfileId',
    ),
    causalProfileIdHex: fixedHex(
      profile.causalProfileIdHex,
      32,
      'causalProfileId',
    ),
    programIdHex: fixedHex(profile.programIdHex, 32, 'programId'),
    verifierProfileIdHex: fixedHex(
      profile.verifierProfileIdHex,
      32,
      'verifierProfileId',
    ),
    duplicatePreventionNftIdHex: nonzeroFixedHex(
      profile.duplicatePreventionNftIdHex,
      32,
      'duplicatePreventionNftId',
    ),
    zeroSourceAssetIdHex: fixedHex(
      profile.zeroSourceAssetIdHex,
      32,
      'zeroSourceAssetId',
    ),
  } as const;
  const exactBindings = [
    ['source network', normalized.sourceNetworkIdHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_SOURCE_NETWORK_ID_HEX],
    ['sidechain', normalized.sidechainIdHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_SIDECHAIN_ID_HEX],
    ['tracker contract', normalized.trackerContractIdHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_CONTRACT_ID_HEX],
    ['tracker NFT', normalized.trackerNftIdHex,
      VALIDITY_APPLICATION_SETTLEMENT_V2_TRACKER_NFT_ID_HEX],
    ['tracker proposition', normalized.trackerPropositionBytesHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_PROPOSITION_BYTES_HEX],
    ['approved trust root', normalized.approvedTrustRootDigestHex,
      VALIDITY_APPLICATION_SETTLEMENT_V2_APPROVED_TRUST_ROOT_HEX],
    ['application binding', normalized.applicationBindingHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_APPLICATION_BINDING_HEX],
    ['application-binding digest', normalized.applicationBindingDigestHex,
      EXACT_APPLICATION_BINDING_DIGEST_HEX],
    ['settlement profile', normalized.settlementProfileIdHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_SETTLEMENT_PROFILE_ID_HEX],
    ['causal profile', normalized.causalProfileIdHex,
      EIP0045_BRIDGE_APPLICATION_TRACKER_CAUSAL_PROFILE_ID_HEX],
    ['program ID', normalized.programIdHex,
      EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX],
    ['verifier profile', normalized.verifierProfileIdHex,
      EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX],
    ['duplicate-prevention NFT', normalized.duplicatePreventionNftIdHex,
      VALIDITY_APPLICATION_SETTLEMENT_V2_DUP_NFT_ID_HEX],
    ['native ERG asset', normalized.zeroSourceAssetIdHex,
      VALIDITY_APPLICATION_SETTLEMENT_V2_ZERO_SOURCE_ASSET_ID_HEX],
  ] as const;
  for (const [label, actual, expected] of exactBindings) {
    requireEqual(actual, expected, `application settlement profile ${label}`);
  }
  return Object.freeze(normalized);
}

function normalizeTrackerTree(
  tree: ApplicationValidityTrackerTreeV2,
): ApplicationValidityTrackerTreeV2 {
  if (tree.keyLength !== APPLICATION_VALIDITY_SPV_TRACKER_KEY_LENGTH) {
    throw new Error('application tracker V2 tree must use 32-byte keys');
  }
  if (tree.valueLength !== APPLICATION_VALIDITY_SPV_TRACKER_VALUE_LENGTH) {
    throw new Error('application tracker V2 tree must use 370-byte values');
  }
  if (tree.flags !== APPLICATION_VALIDITY_SPV_TRACKER_FLAGS) {
    throw new Error('application tracker V2 tree flags do not match the exact profile');
  }
  return Object.freeze({
    digestHex: fixedHex(tree.digestHex, 33, 'application tracker V2 tree digest'),
    keyLength: tree.keyLength,
    valueLength: tree.valueLength,
    flags: tree.flags,
  });
}

function validateCanonicalBurnPath(input: {
  readonly leafHashHex: string;
  readonly leafIndex: number;
  readonly leafCount: number;
  readonly proof: readonly TrustlessBurnMerkleProofStep[];
}): string[] {
  const errors = validatePathShape(input.leafIndex, input.leafCount, input.proof);
  let current = fixedHexBytes(input.leafHashHex, DIGEST_BYTES, 'burn leaf hash');
  let index = input.leafIndex;
  let width = input.leafCount;
  for (let level = 0; level < input.proof.length && width > 1; level += 1) {
    const step = input.proof[level];
    const sibling = fixedHexBytes(
      step.hashHex,
      DIGEST_BYTES,
      `burn proof step ${level} hash`,
    );
    if (index % 2 === 0 && index + 1 >= width && !sibling.equals(current)) {
      errors.push(
        `proof step ${level} must duplicate the current hash at an odd-width boundary`,
      );
    }
    current = step.side === 'left'
      ? hashBurnParent(sibling, current)
      : hashBurnParent(current, sibling);
    index = Math.floor(index / 2);
    width = Math.ceil(width / 2);
  }
  return errors;
}

function validatePathShape(
  leafIndex: number,
  leafCount: number,
  proof: readonly TrustlessBurnMerkleProofStep[],
): string[] {
  const errors: string[] = [];
  const expectedDepth = maxMerkleDepth(leafCount);
  if (proof.length !== expectedDepth) {
    errors.push(
      `proof length must match leafCount depth: expected ${expectedDepth}, got ${proof.length}`,
    );
  }
  let index = leafIndex;
  let width = leafCount;
  for (let level = 0; level < proof.length && width > 1; level += 1) {
    const expectedSide = index % 2 === 1 ? 'left' : 'right';
    if (proof[level].side !== expectedSide) {
      errors.push(`proof step ${level} side must match leafIndex path`);
    }
    index = Math.floor(index / 2);
    width = Math.ceil(width / 2);
  }
  return errors;
}

function maxMerkleDepth(leafCount: number): number {
  let depth = 0;
  let width = leafCount;
  while (width > 1) {
    depth += 1;
    width = Math.ceil(width / 2);
  }
  return depth;
}

function hashBurnParent(left: Buffer, right: Buffer): Buffer {
  return blake2b256(Buffer.concat([BURN_NODE_DOMAIN, left, right]));
}

function boundedLeafIndex(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= APPLICATION_VALIDITY_SPV_TRACKER_MAX_BURNS) {
    throw new Error(
      `${label} must be between 0 and ${APPLICATION_VALIDITY_SPV_TRACKER_MAX_BURNS - 1}`,
    );
  }
  return value;
}

function boundedLeafCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > APPLICATION_VALIDITY_SPV_TRACKER_MAX_BURNS) {
    throw new Error(
      `${label} must be between 1 and ${APPLICATION_VALIDITY_SPV_TRACKER_MAX_BURNS}`,
    );
  }
  return value;
}

function readPositiveSignedLong(bytes: Buffer, offset: number, label: string): bigint {
  const value = bytes.readBigUInt64BE(offset);
  if (value <= 0n || value > MAX_SIGNED_LONG) {
    throw new Error(`${label} must fit a positive signed Long`);
  }
  return value;
}

function readBoundedCount(
  bytes: Buffer,
  offset: number,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const value = bytes.readBigUInt64BE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds the safe integer range`);
  }
  const normalized = Number(value);
  if (normalized < minimum || normalized > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
  return normalized;
}

function positiveSignedLong(
  value: string | number | bigint,
  label: string,
): bigint {
  let normalized: bigint;
  try {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error();
    if (typeof value === 'string' && !/^(?:0|[1-9][0-9]*)$/.test(value)) {
      throw new Error();
    }
    normalized = BigInt(value);
  } catch {
    throw new Error(`${label} must be a canonical positive signed Long`);
  }
  if (normalized <= 0n || normalized > MAX_SIGNED_LONG) {
    throw new Error(`${label} must fit a positive signed Long`);
  }
  return normalized;
}

function nonnegativeInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_HEADER_HEIGHT) {
    throw new Error(`${label} must fit a nonnegative Int`);
  }
  return value;
}

function requireEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} does not match the exact V2 binding`);
  }
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

function nonzeroFixedHex(value: unknown, bytes: number, label: string): string {
  const normalized = fixedHex(value, bytes, label);
  if (/^0+$/.test(normalized)) throw new Error(`${label} must be nonzero`);
  return normalized;
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
  bytes.writeUInt32BE(value, 0);
  return bytes;
}

function uint64Be(value: bigint): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(value, 0);
  return bytes;
}

function blake2b256(value: Uint8Array): Buffer {
  return Buffer.from(blakejs.blake2b(value, undefined, DIGEST_BYTES));
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
