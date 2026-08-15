/**
 * Pure preactivation planner for the application-bound SPV tracker V2 family.
 *
 * This module freezes a distinct key/value format for the 973-byte
 * application-bound payload. It validates canonical statement bytes, the
 * configured identities, one exact 0x0401 anchor membership proof and the AVL
 * successor. It performs no proof verification, network, persistence, signing,
 * submission or broadcast operation.
 */

import blakejs from 'blakejs';

import {
  tracker_application_v2_empty_digest,
  tracker_application_v2_get_proof,
  tracker_application_v2_insert,
} from '../../wasm-avl/pkg/bridge_avl.js';
import {
  BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES,
  decodeBridgeValidityApplicationPayloadV3,
  decodeEip0045BridgeApplicationStatementV2,
} from './bridge-validity-application-statement-v2.js';
import {
  ERGO_EXTENSION_MERKLE_LEVEL_SIZE,
  ERGO_EXTENSION_MERKLE_MAX_DEPTH,
  validateErgoExtensionMembershipProof,
  verifyErgoExtensionMembership,
} from './ergo-extension-membership.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
} from './ergo-encoding.js';

export const APPLICATION_VALIDITY_SPV_TRACKER_KEY_DOMAIN =
  'E2S_SPV_VALIDITY_APPLICATION_KEY_V2';
export const APPLICATION_VALIDITY_SPV_TRACKER_VALUE_DOMAIN =
  'E2S_SPV_VALIDITY_APPLICATION_VALUE_V2';
export const APPLICATION_VALIDITY_SPV_TRACKER_PAYLOAD_DIGEST_DOMAIN =
  'E2S_SPV_VALIDITY_APPLICATION_PAYLOAD_DIGEST_V2';
export const APPLICATION_VALIDITY_SPV_TRACKER_KEY_LENGTH = 32;
export const APPLICATION_VALIDITY_SPV_TRACKER_VALUE_LENGTH = 370;
export const APPLICATION_VALIDITY_SPV_TRACKER_FLAGS = 0x01;
export const APPLICATION_VALIDITY_SPV_TRACKER_VALUE_VERSION = 2;
export const APPLICATION_VALIDITY_SPV_TRACKER_HASH_BLAKE2B256 = 1;
export const APPLICATION_VALIDITY_SPV_TRACKER_SOURCE_FINALITY_V1 = 1;
export const APPLICATION_VALIDITY_SPV_TRACKER_VALUE_FLAGS_NONE = 0;
export const APPLICATION_VALIDITY_SPV_TRACKER_MAX_BURNS = 256;
export const APPLICATION_VALIDITY_SPV_TRACKER_MAX_HEADER_INDEX = 9;
export const APPLICATION_VALIDITY_SPV_TRACKER_MAX_EXTENSION_PROOF_BYTES =
  ERGO_EXTENSION_MERKLE_LEVEL_SIZE * ERGO_EXTENSION_MERKLE_MAX_DEPTH;
export const EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX =
  '230c268ecac522e15bb208092a51462e2840ba05402214c6dfda230b9ffe112c';
export const EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX =
  '23c4a123ffb33a1c8db89436fe0e7972bd8e4e289459ee5fd71be5440607d383';

const DIGEST_BYTES = 32;
const MAX_SIGNED_LONG = 0x7fff_ffff_ffff_ffffn;
const MAX_HEADER_HEIGHT = 0x7fff_ffff;
const VALUE_DOMAIN_BYTES = Buffer.byteLength(
  APPLICATION_VALIDITY_SPV_TRACKER_VALUE_DOMAIN,
  'ascii',
);
const VALUE_DISCRIMINATOR_OFFSET = VALUE_DOMAIN_BYTES + 1;
const VALUE_BRIDGE_EVENT_ROOT_OFFSET = VALUE_DISCRIMINATOR_OFFSET + 4;
const VALUE_CHECKPOINT_COMMITMENT_OFFSET = VALUE_BRIDGE_EVENT_ROOT_OFFSET + DIGEST_BYTES;
const VALUE_ANCHOR_HEADER_ID_OFFSET = VALUE_CHECKPOINT_COMMITMENT_OFFSET + DIGEST_BYTES;
const VALUE_ANCHOR_HEADER_HEIGHT_OFFSET = VALUE_ANCHOR_HEADER_ID_OFFSET + DIGEST_BYTES;
const VALUE_CONSENSUS_BLOCK_HASH_OFFSET = VALUE_ANCHOR_HEADER_HEIGHT_OFFSET + 4;
const VALUE_BURN_LEAF_COUNT_OFFSET = VALUE_CONSENSUS_BLOCK_HASH_OFFSET + DIGEST_BYTES;
const VALUE_APPLICATION_BINDING_DIGEST_OFFSET = VALUE_BURN_LEAF_COUNT_OFFSET + 4;
const VALUE_SETTLEMENT_PROFILE_OFFSET =
  VALUE_APPLICATION_BINDING_DIGEST_OFFSET + DIGEST_BYTES;
const VALUE_CAUSAL_PROFILE_OFFSET = VALUE_SETTLEMENT_PROFILE_OFFSET + DIGEST_BYTES;
const VALUE_APPLICATION_PAYLOAD_DIGEST_OFFSET = VALUE_CAUSAL_PROFILE_OFFSET + DIGEST_BYTES;
const VALUE_PROGRAM_ID_OFFSET = VALUE_APPLICATION_PAYLOAD_DIGEST_OFFSET + DIGEST_BYTES;
const VALUE_VERIFIER_PROFILE_ID_OFFSET = VALUE_PROGRAM_ID_OFFSET + DIGEST_BYTES;

export interface ApplicationValiditySpvTrackerHistoryEntry {
  readonly key: string;
  readonly value: string;
}

export interface ApplicationValiditySpvTrackerIdentity {
  readonly sidechainIdHex: string;
  readonly sidechainHeight: string | number | bigint;
  readonly executionBlockHashHex: string;
}

export interface ApplicationValiditySpvTrackerValue {
  readonly version: 2;
  readonly hashAlgorithmId: 1;
  readonly sourceFinalityProfileId: 1;
  readonly flags: 0;
  readonly bridgeEventRootHex: string;
  readonly checkpointCommitmentHex: string;
  readonly anchorHeaderIdHex: string;
  readonly anchorHeaderHeight: number;
  readonly sidechainConsensusBlockHashHex: string;
  readonly burnLeafCount: number;
  readonly applicationBindingDigestHex: string;
  readonly settlementProfileIdHex: string;
  readonly causalProfileIdHex: string;
  readonly applicationPayloadDigestHex: string;
  readonly programIdHex: string;
  readonly verifierProfileIdHex: string;
}

export interface ApplicationValiditySpvTrackerGetProof {
  readonly keyHex: string;
  readonly valueHex: string;
  readonly getProofHex: string;
  readonly digestHex: string;
}

export interface ApplicationValiditySpvSuppliedAnchorTuple {
  readonly idHex: string;
  readonly height: number;
  readonly extensionRootHex: string;
  readonly contextIndex: number;
}

export interface BuildApplicationValiditySpvAdmissionV2Input {
  readonly encodedStatement: Buffer | string;
  readonly expectedContractIdHex: string;
  readonly trackerNftIdHex: string;
  readonly extensionProofHex: string;
  readonly suppliedAnchorTuple: ApplicationValiditySpvSuppliedAnchorTuple;
  readonly expectedSourceNetworkIdHex: string;
  readonly expectedSidechainIdHex: string;
  readonly expectedTrustAnchorDigestHex: string;
  readonly expectedApplicationBindingDigestHex: string;
  readonly expectedSettlementProfileIdHex: string;
  readonly expectedCausalProfileIdHex: string;
  readonly history: readonly ApplicationValiditySpvTrackerHistoryEntry[];
  readonly currentCounter: number | bigint;
  readonly currentLatestSidechainHeight: string | number | bigint;
  readonly currentStampHeight: number;
  readonly currentErgoHeight: number;
}

export interface ApplicationValiditySpvAdmissionV2Plan {
  readonly trackerNftIdHex: string;
  readonly expectedSourceNetworkIdHex: string;
  readonly expectedSidechainIdHex: string;
  readonly expectedTrustAnchorDigestHex: string;
  readonly expectedApplicationBindingDigestHex: string;
  readonly expectedSettlementProfileIdHex: string;
  readonly expectedCausalProfileIdHex: string;
  readonly contractIdHex: string;
  readonly programIdHex: typeof EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX;
  readonly verifierProfileIdHex:
    typeof EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX;
  readonly encodedStatementHex: string;
  readonly statementDigestHex: string;
  readonly applicationPayloadHex: string;
  readonly applicationPayloadDigestHex: string;
  readonly checkpointCommitmentHex: string;
  readonly trackerKeyHex: string;
  readonly trackerValueHex: string;
  readonly extensionValueHex: string;
  readonly extensionProofHex: string;
  readonly avlInsertProofHex: string;
  readonly transitionProofBundleHex: string;
  readonly inputDigestHex: string;
  readonly successorDigestHex: string;
  readonly sidechainHeight: string;
  readonly currentErgoHeight: number;
  readonly suppliedAnchorTuple: ApplicationValiditySpvSuppliedAnchorTuple;
  readonly inputRegisters:
    Readonly<Record<'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9', string>>;
  readonly successorRegisters:
    Readonly<Record<'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9', string>>;
  readonly boundaries: {
    readonly statementCodecValidated: true;
    readonly applicationBindingMatched: true;
    readonly suppliedAnchorRootMembershipValidated: true;
    readonly anchorHeaderTupleAuthenticated: false;
    readonly expectedIdentitiesAuthorityEstablished: false;
    readonly avlTransitionConstructed: true;
    readonly proofTransportValidated: false;
    readonly proofValidityEstablishedByPlanner: false;
    readonly profileActivated: false;
    readonly onChainAcceptanceEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
  };
}

export function deriveApplicationValiditySpvTrackerKey(
  input: ApplicationValiditySpvTrackerIdentity,
): string {
  const sidechainHeight =
    positiveSignedLong(input.sidechainHeight, 'sidechainHeight');
  return blake2b256(Buffer.concat([
    Buffer.from(APPLICATION_VALIDITY_SPV_TRACKER_KEY_DOMAIN, 'ascii'),
    nonzeroHexBytes(input.sidechainIdHex, DIGEST_BYTES, 'sidechainId'),
    uint64Be(sidechainHeight),
    nonzeroHexBytes(
      input.executionBlockHashHex,
      DIGEST_BYTES,
      'executionBlockHash',
    ),
  ])).toString('hex');
}

export function deriveApplicationValidityPayloadDigestHex(
  encodedPayload: Buffer | string,
): string {
  const payload = exactBytes(
    encodedPayload,
    BRIDGE_VALIDITY_APPLICATION_PAYLOAD_V3_BYTES,
    'bridge validity application payload V3',
  );
  decodeBridgeValidityApplicationPayloadV3(payload);
  return blake2b256(Buffer.concat([
    Buffer.from(
      APPLICATION_VALIDITY_SPV_TRACKER_PAYLOAD_DIGEST_DOMAIN,
      'ascii',
    ),
    payload,
  ])).toString('hex');
}

export function encodeApplicationValiditySpvTrackerValue(input: {
  readonly bridgeEventRootHex: string;
  readonly checkpointCommitmentHex: string;
  readonly anchorHeaderIdHex: string;
  readonly anchorHeaderHeight: number;
  readonly sidechainConsensusBlockHashHex: string;
  readonly burnLeafCount: number;
  readonly applicationBindingDigestHex: string;
  readonly settlementProfileIdHex: string;
  readonly causalProfileIdHex: string;
  readonly applicationPayloadDigestHex: string;
  readonly programIdHex: string;
  readonly verifierProfileIdHex: string;
}): string {
  const encoded = Buffer.concat([
    Buffer.from(APPLICATION_VALIDITY_SPV_TRACKER_VALUE_DOMAIN, 'ascii'),
    Buffer.from([0]),
    Buffer.from([
      APPLICATION_VALIDITY_SPV_TRACKER_VALUE_VERSION,
      APPLICATION_VALIDITY_SPV_TRACKER_HASH_BLAKE2B256,
      APPLICATION_VALIDITY_SPV_TRACKER_SOURCE_FINALITY_V1,
      APPLICATION_VALIDITY_SPV_TRACKER_VALUE_FLAGS_NONE,
    ]),
    nonzeroHexBytes(input.bridgeEventRootHex, DIGEST_BYTES, 'bridgeEventRoot'),
    nonzeroHexBytes(
      input.checkpointCommitmentHex,
      DIGEST_BYTES,
      'checkpointCommitment',
    ),
    nonzeroHexBytes(input.anchorHeaderIdHex, DIGEST_BYTES, 'anchorHeaderId'),
    uint32Be(headerHeight(input.anchorHeaderHeight, 'anchorHeaderHeight')),
    nonzeroHexBytes(
      input.sidechainConsensusBlockHashHex,
      DIGEST_BYTES,
      'sidechainConsensusBlockHash',
    ),
    uint32Be(burnLeafCount(input.burnLeafCount)),
    nonzeroHexBytes(
      input.applicationBindingDigestHex,
      DIGEST_BYTES,
      'applicationBindingDigest',
    ),
    nonzeroHexBytes(
      input.settlementProfileIdHex,
      DIGEST_BYTES,
      'settlementProfileId',
    ),
    nonzeroHexBytes(input.causalProfileIdHex, DIGEST_BYTES, 'causalProfileId'),
    nonzeroHexBytes(
      input.applicationPayloadDigestHex,
      DIGEST_BYTES,
      'applicationPayloadDigest',
    ),
    nonzeroHexBytes(input.programIdHex, DIGEST_BYTES, 'programId'),
    nonzeroHexBytes(
      input.verifierProfileIdHex,
      DIGEST_BYTES,
      'verifierProfileId',
    ),
  ]);
  if (encoded.length !== APPLICATION_VALIDITY_SPV_TRACKER_VALUE_LENGTH) {
    throw new Error('application validity tracker value internal length mismatch');
  }
  return encoded.toString('hex');
}

export function decodeApplicationValiditySpvTrackerValue(
  valueHex: string,
): ApplicationValiditySpvTrackerValue {
  const bytes = Buffer.from(fixedHex(
    valueHex,
    APPLICATION_VALIDITY_SPV_TRACKER_VALUE_LENGTH,
    'application validity tracker value',
  ), 'hex');
  const expectedDomain = Buffer.concat([
    Buffer.from(APPLICATION_VALIDITY_SPV_TRACKER_VALUE_DOMAIN, 'ascii'),
    Buffer.from([0]),
  ]);
  if (!bytes.subarray(0, VALUE_DISCRIMINATOR_OFFSET).equals(expectedDomain)) {
    throw new Error('application validity tracker value domain mismatch');
  }
  validateValueDiscriminators(
    bytes[VALUE_DISCRIMINATOR_OFFSET],
    bytes[VALUE_DISCRIMINATOR_OFFSET + 1],
    bytes[VALUE_DISCRIMINATOR_OFFSET + 2],
    bytes[VALUE_DISCRIMINATOR_OFFSET + 3],
  );
  const anchorHeaderHeight = bytes.readUInt32BE(VALUE_ANCHOR_HEADER_HEIGHT_OFFSET);
  headerHeight(anchorHeaderHeight, 'application validity tracker anchor height');
  const decodedBurnLeafCount = bytes.readUInt32BE(VALUE_BURN_LEAF_COUNT_OFFSET);
  burnLeafCount(decodedBurnLeafCount);

  return Object.freeze({
    version: APPLICATION_VALIDITY_SPV_TRACKER_VALUE_VERSION,
    hashAlgorithmId: APPLICATION_VALIDITY_SPV_TRACKER_HASH_BLAKE2B256,
    sourceFinalityProfileId:
      APPLICATION_VALIDITY_SPV_TRACKER_SOURCE_FINALITY_V1,
    flags: APPLICATION_VALIDITY_SPV_TRACKER_VALUE_FLAGS_NONE,
    bridgeEventRootHex: nonzeroSlice(
      bytes,
      VALUE_BRIDGE_EVENT_ROOT_OFFSET,
      'bridgeEventRoot',
    ),
    checkpointCommitmentHex: nonzeroSlice(
      bytes,
      VALUE_CHECKPOINT_COMMITMENT_OFFSET,
      'checkpointCommitment',
    ),
    anchorHeaderIdHex: nonzeroSlice(
      bytes,
      VALUE_ANCHOR_HEADER_ID_OFFSET,
      'anchorHeaderId',
    ),
    anchorHeaderHeight,
    sidechainConsensusBlockHashHex: nonzeroSlice(
      bytes,
      VALUE_CONSENSUS_BLOCK_HASH_OFFSET,
      'sidechainConsensusBlockHash',
    ),
    burnLeafCount: decodedBurnLeafCount,
    applicationBindingDigestHex: nonzeroSlice(
      bytes,
      VALUE_APPLICATION_BINDING_DIGEST_OFFSET,
      'applicationBindingDigest',
    ),
    settlementProfileIdHex: nonzeroSlice(
      bytes,
      VALUE_SETTLEMENT_PROFILE_OFFSET,
      'settlementProfileId',
    ),
    causalProfileIdHex: nonzeroSlice(
      bytes,
      VALUE_CAUSAL_PROFILE_OFFSET,
      'causalProfileId',
    ),
    applicationPayloadDigestHex: nonzeroSlice(
      bytes,
      VALUE_APPLICATION_PAYLOAD_DIGEST_OFFSET,
      'applicationPayloadDigest',
    ),
    programIdHex: nonzeroSlice(bytes, VALUE_PROGRAM_ID_OFFSET, 'programId'),
    verifierProfileIdHex: nonzeroSlice(
      bytes,
      VALUE_VERIFIER_PROFILE_ID_OFFSET,
      'verifierProfileId',
    ),
  });
}

export function buildApplicationValiditySpvTrackerGetProof(
  history: readonly ApplicationValiditySpvTrackerHistoryEntry[],
  identity: ApplicationValiditySpvTrackerIdentity,
): ApplicationValiditySpvTrackerGetProof {
  const normalized = normalizeHistory(history);
  const keyHex = deriveApplicationValiditySpvTrackerKey(identity);
  if (!normalized.some(entry => entry.key === keyHex)) {
    throw new Error(
      'application validity tracker history does not contain the derived V2 key',
    );
  }
  const result = JSON.parse(
    tracker_application_v2_get_proof(JSON.stringify(normalized), keyHex),
  ) as Readonly<Record<string, unknown>>;
  const valueHex = fixedHex(
    result.value_hex,
    APPLICATION_VALIDITY_SPV_TRACKER_VALUE_LENGTH,
    'application validity tracker proof value',
  );
  decodeApplicationValiditySpvTrackerValue(valueHex);
  return Object.freeze({
    keyHex,
    valueHex,
    getProofHex: variableHex(
      result.get_proof_hex,
      'application validity tracker get proof',
    ),
    digestHex: fixedHex(
      result.digest_hex,
      33,
      'application validity tracker proof digest',
    ),
  });
}

export function getApplicationValiditySpvTrackerDigest(
  history: readonly ApplicationValiditySpvTrackerHistoryEntry[],
): string {
  if (history.length === 0) {
    return fixedHex(
      tracker_application_v2_empty_digest(),
      33,
      'empty application validity tracker digest',
    );
  }
  const normalized = normalizeHistory(history);
  return currentTrackerDigest(normalized);
}

export function buildApplicationValiditySpvAdmissionV2(
  input: BuildApplicationValiditySpvAdmissionV2Input,
): ApplicationValiditySpvAdmissionV2Plan {
  const statement =
    decodeEip0045BridgeApplicationStatementV2(input.encodedStatement);
  requireEqual(
    statement.profileIdHex,
    EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
    'application statement verifier profile',
  );
  requireEqual(
    statement.programIdHex,
    EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
    'application statement guest program',
  );
  const contractIdHex = nonzeroFixedHex(
    input.expectedContractIdHex,
    DIGEST_BYTES,
    'expected application tracker contract ID',
  );
  requireEqual(
    statement.contractIdHex,
    contractIdHex,
    'application statement contract',
  );

  const payload = statement.applicationPayload;
  const finality = payload.finality;
  const application = payload.application;
  const expectedSourceNetworkIdHex = nonzeroFixedHex(
    input.expectedSourceNetworkIdHex,
    DIGEST_BYTES,
    'expected source network ID',
  );
  requireEqual(
    statement.chainDomainIdHex,
    expectedSourceNetworkIdHex,
    'application statement chain domain',
  );
  requireEqual(
    application.sourceNetworkIdHex,
    expectedSourceNetworkIdHex,
    'application source network',
  );
  const trackerNftIdHex = nonzeroFixedHex(
    input.trackerNftIdHex,
    DIGEST_BYTES,
    'tracker NFT ID',
  );
  requireEqual(
    finality.trackerNftIdHex,
    trackerNftIdHex,
    'application validity payload tracker NFT',
  );
  const expectedSidechainIdHex = nonzeroFixedHex(
    input.expectedSidechainIdHex,
    DIGEST_BYTES,
    'expected sidechain ID',
  );
  requireEqual(
    finality.checkpoint.sidechainIdHex,
    expectedSidechainIdHex,
    'application validity checkpoint sidechain expectation',
  );
  requireEqual(
    application.sidechainIdHex,
    expectedSidechainIdHex,
    'application sidechain expectation',
  );
  const expectedTrustAnchorDigestHex = nonzeroFixedHex(
    input.expectedTrustAnchorDigestHex,
    DIGEST_BYTES,
    'expected trust-anchor digest',
  );
  requireEqual(
    finality.trustedAnchorDigestHex,
    expectedTrustAnchorDigestHex,
    'application validity trust anchor',
  );
  const expectedApplicationBindingDigestHex = nonzeroFixedHex(
    input.expectedApplicationBindingDigestHex,
    DIGEST_BYTES,
    'expected application-binding digest',
  );
  requireEqual(
    payload.applicationBindingDigestHex,
    expectedApplicationBindingDigestHex,
    'application-binding digest expectation',
  );
  const expectedSettlementProfileIdHex = nonzeroFixedHex(
    input.expectedSettlementProfileIdHex,
    DIGEST_BYTES,
    'expected settlement profile ID',
  );
  requireEqual(
    application.settlementProfileIdHex,
    expectedSettlementProfileIdHex,
    'application settlement profile',
  );
  const expectedCausalProfileIdHex = nonzeroFixedHex(
    input.expectedCausalProfileIdHex,
    DIGEST_BYTES,
    'expected causal profile ID',
  );
  requireEqual(
    application.causalProfileIdHex,
    expectedCausalProfileIdHex,
    'application causal profile',
  );

  const sidechainHeight = positiveSignedLong(
    finality.checkpoint.sidechainHeight,
    'checkpoint sidechain height',
  );
  const oldLatestHeight = nonnegativeSignedLong(
    input.currentLatestSidechainHeight,
    'current latest sidechain height',
  );
  if (sidechainHeight <= oldLatestHeight) {
    throw new Error(
      'application validity checkpoint must advance the tracker height',
    );
  }
  burnLeafCount(finality.checkpoint.burnLeafCount);

  const suppliedAnchorTuple =
    normalizeSuppliedAnchorTuple(input.suppliedAnchorTuple);
  const currentErgoHeight =
    headerHeight(input.currentErgoHeight, 'current Ergo height');
  const currentStampHeight =
    headerHeight(input.currentStampHeight, 'current tracker stamp height');
  if (suppliedAnchorTuple.height > currentErgoHeight) {
    throw new Error(
      'application validity anchor cannot be newer than the current Ergo height',
    );
  }
  if (
    currentErgoHeight - suppliedAnchorTuple.height
    !== suppliedAnchorTuple.contextIndex + 1
  ) {
    throw new Error(
      'application validity anchor context index must match its exact Ergo depth',
    );
  }
  if (currentStampHeight >= currentErgoHeight) {
    throw new Error('current Ergo height must advance the tracker stamp');
  }

  const extensionProofHex = variableHex(
    input.extensionProofHex,
    'extension proof',
    APPLICATION_VALIDITY_SPV_TRACKER_MAX_EXTENSION_PROOF_BYTES,
  );
  const extensionProof = Buffer.from(extensionProofHex, 'hex');
  const extensionProofValidation =
    validateErgoExtensionMembershipProof(extensionProof);
  if (!extensionProofValidation.ok) {
    throw new Error(extensionProofValidation.errors.join('; '));
  }
  if (!verifyErgoExtensionMembership({
    key: Buffer.from(finality.extensionKeyHex, 'hex'),
    value: Buffer.from(finality.extensionValueHex, 'hex'),
    proof: extensionProof,
    root: Buffer.from(suppliedAnchorTuple.extensionRootHex, 'hex'),
  })) {
    throw new Error(
      'application validity checkpoint 0x0401 value is not in the anchor extension root',
    );
  }

  const trackerKeyHex = deriveApplicationValiditySpvTrackerKey({
    sidechainIdHex: finality.checkpoint.sidechainIdHex,
    sidechainHeight,
    executionBlockHashHex: finality.checkpoint.executionBlockHashHex,
  });
  const applicationPayloadHex = payload.encodedPayloadHex;
  const applicationPayloadDigestHex =
    deriveApplicationValidityPayloadDigestHex(applicationPayloadHex);
  const trackerValueHex = encodeApplicationValiditySpvTrackerValue({
    bridgeEventRootHex: finality.checkpoint.bridgeEventRootHex,
    checkpointCommitmentHex: finality.checkpointCommitmentHex,
    anchorHeaderIdHex: suppliedAnchorTuple.idHex,
    anchorHeaderHeight: suppliedAnchorTuple.height,
    sidechainConsensusBlockHashHex:
      finality.checkpoint.sidechainConsensusBlockHashHex,
    burnLeafCount: finality.checkpoint.burnLeafCount,
    applicationBindingDigestHex: payload.applicationBindingDigestHex,
    settlementProfileIdHex: application.settlementProfileIdHex,
    causalProfileIdHex: application.causalProfileIdHex,
    applicationPayloadDigestHex,
    programIdHex: statement.programIdHex,
    verifierProfileIdHex: statement.profileIdHex,
  });
  const history = normalizeHistory(input.history);
  if (history.some(entry => entry.key === trackerKeyHex)) {
    throw new Error(
      'application validity tracker history already contains the derived V2 key',
    );
  }
  const inputDigestHex = history.length === 0
    ? fixedHex(
      tracker_application_v2_empty_digest(),
      33,
      'empty application validity tracker digest',
    )
    : currentTrackerDigest(history);
  const inserted = JSON.parse(
    tracker_application_v2_insert(
      JSON.stringify(history),
      trackerKeyHex,
      trackerValueHex,
    ),
  ) as Readonly<Record<string, unknown>>;
  const successorDigestHex = fixedHex(
    inserted.new_digest_hex,
    33,
    'successor application validity tracker digest',
  );
  const avlInsertProofHex = variableHex(
    inserted.insert_proof_hex,
    'application validity tracker AVL insert proof',
  );
  const transitionProofBundleHex =
    encodeApplicationValiditySpvTransitionProofBundle(
      extensionProofHex,
      avlInsertProofHex,
    );
  const currentCounter =
    nonnegativeSignedLong(input.currentCounter, 'current tracker counter');
  if (currentCounter === MAX_SIGNED_LONG) {
    throw new Error('current tracker counter cannot advance beyond Long range');
  }

  return deepFreeze({
    trackerNftIdHex,
    expectedSourceNetworkIdHex,
    expectedSidechainIdHex,
    expectedTrustAnchorDigestHex,
    expectedApplicationBindingDigestHex,
    expectedSettlementProfileIdHex,
    expectedCausalProfileIdHex,
    contractIdHex,
    programIdHex: EIP0045_BRIDGE_APPLICATION_GUEST_PROGRAM_ID_HEX,
    verifierProfileIdHex:
      EIP0045_BRIDGE_APPLICATION_PREACTIVATION_PROFILE_ID_HEX,
    encodedStatementHex: statement.encodedStatementHex,
    statementDigestHex: statement.statementDigestHex,
    applicationPayloadHex,
    applicationPayloadDigestHex,
    checkpointCommitmentHex: finality.checkpointCommitmentHex,
    trackerKeyHex,
    trackerValueHex,
    extensionValueHex: finality.extensionValueHex,
    extensionProofHex,
    avlInsertProofHex,
    transitionProofBundleHex,
    inputDigestHex,
    successorDigestHex,
    sidechainHeight: sidechainHeight.toString(),
    currentErgoHeight,
    suppliedAnchorTuple,
    inputRegisters: {
      R4: encodeLongRegister(currentCounter),
      R5: encodeApplicationValiditySpvTrackerAvlRegister(inputDigestHex),
      R6: encodeCollByteRegister(Buffer.from(expectedSidechainIdHex, 'hex')),
      R7: encodeLongRegister(oldLatestHeight),
      R8: encodeIntRegister(currentStampHeight),
      R9: encodeCollByteRegister(
        Buffer.from(expectedTrustAnchorDigestHex, 'hex'),
      ),
    },
    successorRegisters: {
      R4: encodeLongRegister(currentCounter + 1n),
      R5: encodeApplicationValiditySpvTrackerAvlRegister(successorDigestHex),
      R6: encodeCollByteRegister(Buffer.from(expectedSidechainIdHex, 'hex')),
      R7: encodeLongRegister(sidechainHeight),
      R8: encodeIntRegister(currentErgoHeight),
      R9: encodeCollByteRegister(
        Buffer.from(expectedTrustAnchorDigestHex, 'hex'),
      ),
    },
    boundaries: {
      statementCodecValidated: true as const,
      applicationBindingMatched: true as const,
      suppliedAnchorRootMembershipValidated: true as const,
      anchorHeaderTupleAuthenticated: false as const,
      expectedIdentitiesAuthorityEstablished: false as const,
      avlTransitionConstructed: true as const,
      proofTransportValidated: false as const,
      proofValidityEstablishedByPlanner: false as const,
      profileActivated: false as const,
      onChainAcceptanceEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
    },
  });
}

export function encodeApplicationValiditySpvTransitionProofBundle(
  extensionProofHex: string,
  avlInsertProofHex: string,
): string {
  const extensionProof = Buffer.from(variableHex(
    extensionProofHex,
    'extension proof',
    APPLICATION_VALIDITY_SPV_TRACKER_MAX_EXTENSION_PROOF_BYTES,
  ), 'hex');
  const validation = validateErgoExtensionMembershipProof(extensionProof);
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  const avlInsertProof = Buffer.from(variableHex(
    avlInsertProofHex,
    'application validity tracker AVL insert proof',
  ), 'hex');
  if (avlInsertProof.length === 0) {
    throw new Error(
      'application validity tracker AVL insert proof must be non-empty',
    );
  }
  return Buffer.concat([
    uint64Be(BigInt(extensionProof.length)),
    extensionProof,
    avlInsertProof,
  ]).toString('hex');
}

export function encodeApplicationValiditySpvTrackerAvlRegister(
  digestHex: string,
): string {
  return encodeAvlTreeRegister(
    Buffer.from(
      fixedHex(digestHex, 33, 'application validity tracker digest'),
      'hex',
    ),
    APPLICATION_VALIDITY_SPV_TRACKER_FLAGS,
    APPLICATION_VALIDITY_SPV_TRACKER_VALUE_LENGTH,
  );
}

function currentTrackerDigest(
  history: readonly ApplicationValiditySpvTrackerHistoryEntry[],
): string {
  const proof = JSON.parse(
    tracker_application_v2_get_proof(
      JSON.stringify(history),
      history[0].key,
    ),
  ) as Readonly<Record<string, unknown>>;
  return fixedHex(
    proof.digest_hex,
    33,
    'current application validity tracker digest',
  );
}

function normalizeHistory(
  history: readonly ApplicationValiditySpvTrackerHistoryEntry[],
): ApplicationValiditySpvTrackerHistoryEntry[] {
  const seen = new Set<string>();
  return history.map((entry, index) => {
    const key = fixedHex(
      entry.key,
      APPLICATION_VALIDITY_SPV_TRACKER_KEY_LENGTH,
      `history[${index}].key`,
    );
    if (seen.has(key)) {
      throw new Error('application validity tracker history contains a duplicate key');
    }
    seen.add(key);
    const value = fixedHex(
      entry.value,
      APPLICATION_VALIDITY_SPV_TRACKER_VALUE_LENGTH,
      `history[${index}].value`,
    );
    decodeApplicationValiditySpvTrackerValue(value);
    return { key, value };
  });
}

function normalizeSuppliedAnchorTuple(
  input: ApplicationValiditySpvSuppliedAnchorTuple,
): ApplicationValiditySpvSuppliedAnchorTuple {
  if (
    !Number.isSafeInteger(input.contextIndex)
    || input.contextIndex < 0
    || input.contextIndex > APPLICATION_VALIDITY_SPV_TRACKER_MAX_HEADER_INDEX
  ) {
    throw new Error(
      'application validity anchor context index must be between '
      + `0 and ${APPLICATION_VALIDITY_SPV_TRACKER_MAX_HEADER_INDEX}`,
    );
  }
  return Object.freeze({
    idHex: nonzeroFixedHex(
      input.idHex,
      DIGEST_BYTES,
      'application validity anchor header ID',
    ),
    height: headerHeight(input.height, 'application validity anchor height'),
    extensionRootHex: nonzeroFixedHex(
      input.extensionRootHex,
      DIGEST_BYTES,
      'application validity anchor extension root',
    ),
    contextIndex: input.contextIndex,
  });
}

function validateValueDiscriminators(
  version: number,
  hashAlgorithmId: number,
  sourceFinalityProfileId: number,
  flags: number,
): void {
  if (version !== APPLICATION_VALIDITY_SPV_TRACKER_VALUE_VERSION) {
    throw new Error(`unsupported application validity tracker value version: ${version}`);
  }
  if (hashAlgorithmId !== APPLICATION_VALIDITY_SPV_TRACKER_HASH_BLAKE2B256) {
    throw new Error(
      `unsupported application validity tracker hash algorithm: ${hashAlgorithmId}`,
    );
  }
  if (
    sourceFinalityProfileId
    !== APPLICATION_VALIDITY_SPV_TRACKER_SOURCE_FINALITY_V1
  ) {
    throw new Error(
      'unsupported application validity tracker source finality profile: '
      + sourceFinalityProfileId,
    );
  }
  if (flags !== APPLICATION_VALIDITY_SPV_TRACKER_VALUE_FLAGS_NONE) {
    throw new Error(`unsupported application validity tracker value flags: ${flags}`);
  }
}

function burnLeafCount(value: number): number {
  if (
    !Number.isSafeInteger(value)
    || value < 1
    || value > APPLICATION_VALIDITY_SPV_TRACKER_MAX_BURNS
  ) {
    throw new Error(
      'application validity checkpoint burn count must be between '
      + `1 and ${APPLICATION_VALIDITY_SPV_TRACKER_MAX_BURNS}`,
    );
  }
  return value;
}

function positiveSignedLong(
  value: string | number | bigint,
  label: string,
): bigint {
  const normalized = signedLong(value, label);
  if (normalized <= 0n) throw new Error(`${label} must be positive`);
  return normalized;
}

function nonnegativeSignedLong(
  value: string | number | bigint,
  label: string,
): bigint {
  const normalized = signedLong(value, label);
  if (normalized < 0n) throw new Error(`${label} must be nonnegative`);
  return normalized;
}

function signedLong(
  value: string | number | bigint,
  label: string,
): bigint {
  if (
    typeof value === 'number'
    && (!Number.isSafeInteger(value) || value < 0)
  ) {
    throw new Error(`${label} must be a canonical signed Long`);
  }
  if (
    typeof value === 'string'
    && !/^(?:0|[1-9][0-9]*)$/.test(value)
  ) {
    throw new Error(`${label} must be a canonical signed Long`);
  }
  let normalized: bigint;
  try {
    normalized = BigInt(value);
  } catch {
    throw new Error(`${label} must be a canonical signed Long`);
  }
  if (normalized < 0n || normalized > MAX_SIGNED_LONG) {
    throw new Error(`${label} must fit a nonnegative signed Long`);
  }
  return normalized;
}

function headerHeight(value: number, label: string): number {
  if (
    !Number.isSafeInteger(value)
    || value < 0
    || value > MAX_HEADER_HEIGHT
  ) {
    throw new Error(`${label} must fit a nonnegative Int`);
  }
  return value;
}

function requireEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} does not match the expected V2 identity`);
  }
}

function exactBytes(
  value: Buffer | string,
  expectedBytes: number,
  label: string,
): Buffer {
  const bytes = Buffer.isBuffer(value)
    ? Buffer.from(value)
    : Buffer.from(fixedHex(value, expectedBytes, label), 'hex');
  if (bytes.length !== expectedBytes) {
    throw new Error(`${label} must be exactly ${expectedBytes} bytes`);
  }
  return bytes;
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
  if (/^0+$/.test(normalized)) {
    throw new Error(`${label} must be nonzero`);
  }
  return normalized;
}

function nonzeroHexBytes(
  value: unknown,
  bytes: number,
  label: string,
): Buffer {
  return Buffer.from(nonzeroFixedHex(value, bytes, label), 'hex');
}

function nonzeroSlice(bytes: Buffer, offset: number, label: string): string {
  return nonzeroFixedHex(
    bytes.subarray(offset, offset + DIGEST_BYTES).toString('hex'),
    DIGEST_BYTES,
    label,
  );
}

function variableHex(
  value: unknown,
  label: string,
  maxBytes = Number.MAX_SAFE_INTEGER,
): string {
  if (
    typeof value !== 'string'
    || value.length % 2 !== 0
    || !/^[0-9a-f]*$/.test(value)
  ) {
    throw new Error(`${label} must be canonical lowercase hex`);
  }
  if (value.length / 2 > maxBytes) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte bound`);
  }
  return value;
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
