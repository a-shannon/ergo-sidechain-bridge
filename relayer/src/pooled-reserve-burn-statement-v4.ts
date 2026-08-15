import blakejs from 'blakejs';

import {
  EIP0045_ERGO_STATEMENT_V1_DOMAIN,
  EIP0045_ERGO_STATEMENT_V1_VERSION,
} from './bridge-validity-finality-statement-v2.js';
import {
  BRIDGE_CHECKPOINT_ENCODED_BYTES,
  BRIDGE_EXTENSION_KEY_HEX,
  decodeBridgeCheckpointV1,
  deriveBridgeCheckpointCommitmentHex,
  encodeBridgeExtensionValueV1,
  type BridgeCheckpointV1,
} from './bridge-checkpoint-commitment.js';
import {
  POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES,
  decodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
  derivePooledReserveMintReservationRuntimeProfileV4IdHex,
  type PooledReserveMintReservationRuntimeProfileV4,
} from './pooled-reserve-mint-reservation-runtime-profile-v4-codec.js';
import {
  POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_BYTES,
  POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_DOMAIN,
  POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_PREFIX_BYTES,
} from './pooled-reserve-burn-profile-v4.js';

export {
  POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_BYTES,
  POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_DOMAIN,
  POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_PREFIX_BYTES,
} from './pooled-reserve-burn-profile-v4.js';

export const POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_DOMAIN =
  'E2S_POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4' as const;
export const POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_VERSION = 4 as const;
export const POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_HASH_BLAKE2B256 = 1 as const;
export const POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_SOURCE_SUBSTRATE_GRANDPA_V1 =
  1 as const;
export const POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_FLAGS_NONE = 0 as const;
export const POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES = 980 as const;
export const EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES = 1_139 as const;
export const POOLED_RESERVE_BURN_V4_REJECTED_APPLICATION_V2_PROGRAM_ID_HEX =
  '230c268ecac522e15bb208092a51462e2840ba05402214c6dfda230b9ffe112c' as const;

const DIGEST_BYTES = 32;
const MAX_BURN_LEAVES = 256;
const UINT32_MAX = 0xffff_ffff;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;

const BINDING_RUNTIME_PROFILE_OFFSET = 0;
const BINDING_RUNTIME_PROFILE_ID_OFFSET =
  BINDING_RUNTIME_PROFILE_OFFSET
  + POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES;
const BINDING_SOURCE_RUNTIME_CODE_HASH_OFFSET =
  BINDING_RUNTIME_PROFILE_ID_OFFSET + DIGEST_BYTES;
const BINDING_SOURCE_RUNTIME_CODE_SIZE_OFFSET =
  BINDING_SOURCE_RUNTIME_CODE_HASH_OFFSET + DIGEST_BYTES;
const BINDING_TRACKER_NFT_OFFSET = BINDING_SOURCE_RUNTIME_CODE_SIZE_OFFSET + 4;
const BINDING_TRACKER_CONTRACT_OFFSET = BINDING_TRACKER_NFT_OFFSET + DIGEST_BYTES;
const BINDING_PREACTIVATION_STATE_OFFSET =
  BINDING_TRACKER_CONTRACT_OFFSET + DIGEST_BYTES;
const BINDING_AUTHORIZATION_FLAGS_OFFSET = BINDING_PREACTIVATION_STATE_OFFSET + 1;
const BINDING_RESERVED_OFFSET = BINDING_AUTHORIZATION_FLAGS_OFFSET + 1;

const PUBLIC_INPUTS_DOMAIN_BYTES = Buffer.byteLength(
  POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_DOMAIN,
  'ascii',
);
const PUBLIC_INPUTS_DISCRIMINATOR_OFFSET = PUBLIC_INPUTS_DOMAIN_BYTES + 1;
const PUBLIC_INPUTS_BINDING_OFFSET = PUBLIC_INPUTS_DISCRIMINATOR_OFFSET + 4;
const PUBLIC_INPUTS_BINDING_DIGEST_OFFSET =
  PUBLIC_INPUTS_BINDING_OFFSET + POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_BYTES;
const PUBLIC_INPUTS_CHECKPOINT_OFFSET =
  PUBLIC_INPUTS_BINDING_DIGEST_OFFSET + DIGEST_BYTES;
const PUBLIC_INPUTS_CHECKPOINT_COMMITMENT_OFFSET =
  PUBLIC_INPUTS_CHECKPOINT_OFFSET + BRIDGE_CHECKPOINT_ENCODED_BYTES;
const PUBLIC_INPUTS_TARGET_STATE_ROOT_OFFSET =
  PUBLIC_INPUTS_CHECKPOINT_COMMITMENT_OFFSET + DIGEST_BYTES;
const PUBLIC_INPUTS_TRUSTED_ANCHOR_OFFSET =
  PUBLIC_INPUTS_TARGET_STATE_ROOT_OFFSET + DIGEST_BYTES;
const PUBLIC_INPUTS_FINALITY_HORIZON_HEIGHT_OFFSET =
  PUBLIC_INPUTS_TRUSTED_ANCHOR_OFFSET + DIGEST_BYTES;
const PUBLIC_INPUTS_FINALITY_HORIZON_HASH_OFFSET =
  PUBLIC_INPUTS_FINALITY_HORIZON_HEIGHT_OFFSET + 8;
const PUBLIC_INPUTS_EXTENSION_KEY_OFFSET =
  PUBLIC_INPUTS_FINALITY_HORIZON_HASH_OFFSET + DIGEST_BYTES;
const PUBLIC_INPUTS_EXTENSION_VALUE_OFFSET = PUBLIC_INPUTS_EXTENSION_KEY_OFFSET + 2;

const EIP_STATEMENT_CHAIN_DOMAIN_OFFSET = EIP0045_ERGO_STATEMENT_V1_DOMAIN.length + 1;
const EIP_STATEMENT_PROFILE_OFFSET = EIP_STATEMENT_CHAIN_DOMAIN_OFFSET + DIGEST_BYTES;
const EIP_STATEMENT_PROGRAM_OFFSET = EIP_STATEMENT_PROFILE_OFFSET + DIGEST_BYTES;
const EIP_STATEMENT_CONTRACT_OFFSET = EIP_STATEMENT_PROGRAM_OFFSET + DIGEST_BYTES;
const EIP_STATEMENT_PAYLOAD_LENGTH_OFFSET = EIP_STATEMENT_CONTRACT_OFFSET + DIGEST_BYTES;
const EIP_STATEMENT_PAYLOAD_OFFSET = EIP_STATEMENT_PAYLOAD_LENGTH_OFFSET + 4;

export interface PooledReserveBurnApplicationBindingV4Input {
  readonly runtimeProfileScaleHex: string;
  readonly sourceRuntimeCodeSha256Hex: string;
  readonly sourceRuntimeCodeBytes: number;
  readonly trackerNftIdHex: string;
  readonly settlementTrackerContractIdHex: string;
}

export type PooledReserveBurnApplicationBindingV4PrefixInput = Omit<
  PooledReserveBurnApplicationBindingV4Input,
  'settlementTrackerContractIdHex'
>;

export interface PooledReserveBurnApplicationBindingV4 {
  readonly runtimeProfile: Readonly<PooledReserveMintReservationRuntimeProfileV4>;
  readonly runtimeProfileScaleHex: string;
  readonly runtimeProfileIdHex: string;
  readonly sourceRuntimeCodeSha256Hex: string;
  readonly sourceRuntimeCodeBytes: number;
  readonly trackerNftIdHex: string;
  readonly settlementTrackerContractIdHex: string;
  readonly preactivationState: 0;
  readonly authorizationFlags: 0;
  readonly reservedHex: '0000';
  readonly encodedBindingHex: string;
  readonly bindingDigestHex: string;
}

export interface PooledReserveBurnPublicInputsV4Input {
  readonly applicationBinding: Buffer | string;
  readonly encodedCheckpoint: Buffer | string;
  readonly targetNativeStateRootHex: string;
  readonly trustedAnchorDigestHex: string;
  readonly finalityHorizonHeight: string | number | bigint;
  readonly finalityHorizonHashHex: string;
}

export interface PooledReserveBurnPublicInputsV4 {
  readonly version: 4;
  readonly hashAlgorithmId: 1;
  readonly sourceSemanticsId: 1;
  readonly flags: 0;
  readonly application: Readonly<PooledReserveBurnApplicationBindingV4>;
  readonly applicationBindingDigestHex: string;
  readonly checkpoint: Readonly<BridgeCheckpointV1>;
  readonly encodedCheckpointHex: string;
  readonly checkpointCommitmentHex: string;
  readonly targetNativeStateRootHex: string;
  readonly trustedAnchorDigestHex: string;
  readonly finalityHorizonHeight: string;
  readonly finalityHorizonHashHex: string;
  readonly extensionKeyHex: typeof BRIDGE_EXTENSION_KEY_HEX;
  readonly extensionValueHex: string;
  readonly encodedPublicInputsHex: string;
  readonly publicInputsDigestHex: string;
}

export interface Eip0045PooledReserveBurnStatementV4Input {
  readonly chainDomainIdHex: string;
  readonly profileIdHex: string;
  readonly programIdHex: string;
  readonly contractIdHex: string;
  readonly publicInputs: Buffer | string;
}

export interface Eip0045PooledReserveBurnStatementV4 {
  readonly version: 1;
  readonly chainDomainIdHex: string;
  readonly profileIdHex: string;
  readonly programIdHex: string;
  readonly contractIdHex: string;
  readonly publicInputs: Readonly<PooledReserveBurnPublicInputsV4>;
  readonly encodedStatementHex: string;
  readonly statementDigestHex: string;
}

export function encodePooledReserveBurnApplicationBindingV4(
  input: PooledReserveBurnApplicationBindingV4Input,
): Buffer {
  const prefix = encodePooledReserveBurnApplicationBindingV4Prefix(input);
  const settlementTrackerContractId = nonzeroHexBytes(
    input.settlementTrackerContractIdHex,
    'settlementTrackerContractId',
  );
  const binding = Buffer.concat([
    prefix,
    settlementTrackerContractId,
    Buffer.alloc(4),
  ]);
  if (binding.length !== POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_BYTES) {
    throw new Error('pooled-reserve burn application binding V4 internal length mismatch');
  }
  decodePooledReserveBurnApplicationBindingV4(binding);
  return binding;
}

export function encodePooledReserveBurnApplicationBindingV4Prefix(
  input: PooledReserveBurnApplicationBindingV4PrefixInput,
): Buffer {
  decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
    input.runtimeProfileScaleHex,
  );
  const runtimeProfileBytes = Buffer.from(input.runtimeProfileScaleHex.slice(2), 'hex');
  const runtimeProfileId = exactPrefixedHexBytes(
    derivePooledReserveMintReservationRuntimeProfileV4IdHex(input.runtimeProfileScaleHex),
    DIGEST_BYTES,
    'runtimeProfileId',
  );
  const sourceRuntimeCodeSha256 = nonzeroHexBytes(
    input.sourceRuntimeCodeSha256Hex,
    'sourceRuntimeCodeSha256',
  );
  const sourceRuntimeCodeBytes = positiveUint32(
    input.sourceRuntimeCodeBytes,
    'sourceRuntimeCodeBytes',
  );
  const trackerNftId = nonzeroHexBytes(input.trackerNftIdHex, 'trackerNftId');
  const prefix = Buffer.concat([
    runtimeProfileBytes,
    runtimeProfileId,
    sourceRuntimeCodeSha256,
    uint32Be(sourceRuntimeCodeBytes, 'sourceRuntimeCodeBytes'),
    trackerNftId,
  ]);
  if (
    prefix.length
    !== POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_PREFIX_BYTES
  ) {
    throw new Error(
      'pooled-reserve burn application binding V4 prefix internal length mismatch',
    );
  }
  return prefix;
}

export function decodePooledReserveBurnApplicationBindingV4(
  encodedBinding: Buffer | string,
): PooledReserveBurnApplicationBindingV4 {
  const bytes = exactBytes(
    encodedBinding,
    POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_BYTES,
    'pooled-reserve burn application binding V4',
  );
  const runtimeProfileScaleHex = `0x${bytes.subarray(
    BINDING_RUNTIME_PROFILE_OFFSET,
    BINDING_RUNTIME_PROFILE_ID_OFFSET,
  ).toString('hex')}`;
  const runtimeProfile = decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
    runtimeProfileScaleHex,
  );
  const runtimeProfileId = bytes.subarray(
    BINDING_RUNTIME_PROFILE_ID_OFFSET,
    BINDING_SOURCE_RUNTIME_CODE_HASH_OFFSET,
  );
  const expectedRuntimeProfileId = exactPrefixedHexBytes(
    derivePooledReserveMintReservationRuntimeProfileV4IdHex(runtimeProfileScaleHex),
    DIGEST_BYTES,
    'runtimeProfileId',
  );
  if (!runtimeProfileId.equals(expectedRuntimeProfileId)) {
    throw new Error('pooled-reserve burn runtime profile ID mismatch');
  }
  const sourceRuntimeCodeSha256 = nonzeroBytes(
    bytes.subarray(
      BINDING_SOURCE_RUNTIME_CODE_HASH_OFFSET,
      BINDING_SOURCE_RUNTIME_CODE_SIZE_OFFSET,
    ),
    'sourceRuntimeCodeSha256',
  );
  const sourceRuntimeCodeBytes = positiveUint32(
    bytes.readUInt32BE(BINDING_SOURCE_RUNTIME_CODE_SIZE_OFFSET),
    'sourceRuntimeCodeBytes',
  );
  const trackerNftId = nonzeroBytes(
    bytes.subarray(BINDING_TRACKER_NFT_OFFSET, BINDING_TRACKER_CONTRACT_OFFSET),
    'trackerNftId',
  );
  const settlementTrackerContractId = nonzeroBytes(
    bytes.subarray(
      BINDING_TRACKER_CONTRACT_OFFSET,
      BINDING_PREACTIVATION_STATE_OFFSET,
    ),
    'settlementTrackerContractId',
  );
  if (bytes[BINDING_PREACTIVATION_STATE_OFFSET] !== 0) {
    throw new Error('pooled-reserve burn application binding must remain preactivation');
  }
  if (bytes[BINDING_AUTHORIZATION_FLAGS_OFFSET] !== 0) {
    throw new Error('pooled-reserve burn application binding authorization flags must be zero');
  }
  if (!bytes.subarray(BINDING_RESERVED_OFFSET).equals(Buffer.alloc(2))) {
    throw new Error('pooled-reserve burn application binding reserved bytes must be zero');
  }

  return Object.freeze({
    runtimeProfile,
    runtimeProfileScaleHex,
    runtimeProfileIdHex: `0x${runtimeProfileId.toString('hex')}`,
    sourceRuntimeCodeSha256Hex: sourceRuntimeCodeSha256.toString('hex'),
    sourceRuntimeCodeBytes,
    trackerNftIdHex: trackerNftId.toString('hex'),
    settlementTrackerContractIdHex: settlementTrackerContractId.toString('hex'),
    preactivationState: 0,
    authorizationFlags: 0,
    reservedHex: '0000',
    encodedBindingHex: bytes.toString('hex'),
    bindingDigestHex: domainHash(
      POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_DOMAIN,
      bytes,
    ).toString('hex'),
  });
}

export function derivePooledReserveBurnApplicationBindingV4DigestHex(
  input: PooledReserveBurnApplicationBindingV4Input | Buffer | string,
): string {
  const bytes = Buffer.isBuffer(input) || typeof input === 'string'
    ? exactBytes(
      input,
      POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_BYTES,
      'pooled-reserve burn application binding V4',
    )
    : encodePooledReserveBurnApplicationBindingV4(input);
  return decodePooledReserveBurnApplicationBindingV4(bytes).bindingDigestHex;
}

export function encodePooledReserveBurnPublicInputsV4(
  input: PooledReserveBurnPublicInputsV4Input,
): Buffer {
  const applicationBinding = exactBytes(
    input.applicationBinding,
    POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_BYTES,
    'pooled-reserve burn application binding V4',
  );
  const application = decodePooledReserveBurnApplicationBindingV4(applicationBinding);
  const encodedCheckpoint = exactBytes(
    input.encodedCheckpoint,
    BRIDGE_CHECKPOINT_ENCODED_BYTES,
    'bridge checkpoint V1',
  );
  const checkpoint = decodeBridgeCheckpointV1(encodedCheckpoint);
  validateCheckpoint(checkpoint, application.runtimeProfile);
  const checkpointCommitment = Buffer.from(
    deriveBridgeCheckpointCommitmentHex(encodedCheckpoint),
    'hex',
  );
  const targetNativeStateRoot = nonzeroHexBytes(
    input.targetNativeStateRootHex,
    'targetNativeStateRoot',
  );
  const trustedAnchorDigest = nonzeroHexBytes(
    input.trustedAnchorDigestHex,
    'trustedAnchorDigest',
  );
  const finalityHorizonHeight = normalizeUint64(
    input.finalityHorizonHeight,
    'finalityHorizonHeight',
  );
  if (finalityHorizonHeight < BigInt(checkpoint.sidechainHeight)) {
    throw new Error('finality horizon height precedes checkpoint sidechain height');
  }
  const finalityHorizonHash = nonzeroHexBytes(
    input.finalityHorizonHashHex,
    'finalityHorizonHash',
  );
  const applicationBindingDigest = domainHash(
    POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_DOMAIN,
    applicationBinding,
  );
  const extensionValue = Buffer.from(encodeBridgeExtensionValueV1({
    bridgeEventRootHex: checkpoint.bridgeEventRootHex,
    checkpointCommitmentHex: checkpointCommitment.toString('hex'),
  }), 'hex');

  const publicInputs = Buffer.concat([
    Buffer.from(POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_DOMAIN, 'ascii'),
    Buffer.from([0]),
    Buffer.from([
      POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_VERSION,
      POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_HASH_BLAKE2B256,
      POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_SOURCE_SUBSTRATE_GRANDPA_V1,
      POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_FLAGS_NONE,
    ]),
    applicationBinding,
    applicationBindingDigest,
    encodedCheckpoint,
    checkpointCommitment,
    targetNativeStateRoot,
    trustedAnchorDigest,
    uint64Be(finalityHorizonHeight, 'finalityHorizonHeight'),
    finalityHorizonHash,
    Buffer.from(BRIDGE_EXTENSION_KEY_HEX, 'hex'),
    extensionValue,
  ]);
  if (publicInputs.length !== POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES) {
    throw new Error('pooled-reserve burn public inputs V4 internal length mismatch');
  }
  decodePooledReserveBurnPublicInputsV4(publicInputs);
  return publicInputs;
}

export function decodePooledReserveBurnPublicInputsV4(
  encodedPublicInputs: Buffer | string,
): PooledReserveBurnPublicInputsV4 {
  const bytes = exactBytes(
    encodedPublicInputs,
    POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES,
    'pooled-reserve burn public inputs V4',
  );
  const expectedDomain = Buffer.concat([
    Buffer.from(POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_DOMAIN, 'ascii'),
    Buffer.from([0]),
  ]);
  if (!bytes.subarray(0, PUBLIC_INPUTS_DISCRIMINATOR_OFFSET).equals(expectedDomain)) {
    throw new Error('pooled-reserve burn public inputs V4 domain mismatch');
  }
  validatePublicInputsDiscriminators(
    bytes[PUBLIC_INPUTS_DISCRIMINATOR_OFFSET],
    bytes[PUBLIC_INPUTS_DISCRIMINATOR_OFFSET + 1],
    bytes[PUBLIC_INPUTS_DISCRIMINATOR_OFFSET + 2],
    bytes[PUBLIC_INPUTS_DISCRIMINATOR_OFFSET + 3],
  );

  const applicationBinding = bytes.subarray(
    PUBLIC_INPUTS_BINDING_OFFSET,
    PUBLIC_INPUTS_BINDING_DIGEST_OFFSET,
  );
  const application = decodePooledReserveBurnApplicationBindingV4(applicationBinding);
  const applicationBindingDigest = bytes.subarray(
    PUBLIC_INPUTS_BINDING_DIGEST_OFFSET,
    PUBLIC_INPUTS_CHECKPOINT_OFFSET,
  );
  const expectedBindingDigest = domainHash(
    POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_DOMAIN,
    applicationBinding,
  );
  if (!applicationBindingDigest.equals(expectedBindingDigest)) {
    throw new Error('pooled-reserve burn application binding digest mismatch');
  }

  const encodedCheckpoint = bytes.subarray(
    PUBLIC_INPUTS_CHECKPOINT_OFFSET,
    PUBLIC_INPUTS_CHECKPOINT_COMMITMENT_OFFSET,
  );
  const checkpoint = decodeBridgeCheckpointV1(encodedCheckpoint);
  validateCheckpoint(checkpoint, application.runtimeProfile);
  const checkpointCommitment = bytes.subarray(
    PUBLIC_INPUTS_CHECKPOINT_COMMITMENT_OFFSET,
    PUBLIC_INPUTS_TARGET_STATE_ROOT_OFFSET,
  );
  const expectedCheckpointCommitment = Buffer.from(
    deriveBridgeCheckpointCommitmentHex(encodedCheckpoint),
    'hex',
  );
  if (!checkpointCommitment.equals(expectedCheckpointCommitment)) {
    throw new Error('pooled-reserve burn checkpoint commitment mismatch');
  }
  const targetNativeStateRoot = nonzeroBytes(
    bytes.subarray(
      PUBLIC_INPUTS_TARGET_STATE_ROOT_OFFSET,
      PUBLIC_INPUTS_TRUSTED_ANCHOR_OFFSET,
    ),
    'targetNativeStateRoot',
  );
  const trustedAnchorDigest = nonzeroBytes(
    bytes.subarray(
      PUBLIC_INPUTS_TRUSTED_ANCHOR_OFFSET,
      PUBLIC_INPUTS_FINALITY_HORIZON_HEIGHT_OFFSET,
    ),
    'trustedAnchorDigest',
  );
  const finalityHorizonHeight = bytes.readBigUInt64BE(
    PUBLIC_INPUTS_FINALITY_HORIZON_HEIGHT_OFFSET,
  );
  if (finalityHorizonHeight < BigInt(checkpoint.sidechainHeight)) {
    throw new Error('finality horizon height precedes checkpoint sidechain height');
  }
  const finalityHorizonHash = nonzeroBytes(
    bytes.subarray(
      PUBLIC_INPUTS_FINALITY_HORIZON_HASH_OFFSET,
      PUBLIC_INPUTS_EXTENSION_KEY_OFFSET,
    ),
    'finalityHorizonHash',
  );
  const extensionKey = bytes.subarray(
    PUBLIC_INPUTS_EXTENSION_KEY_OFFSET,
    PUBLIC_INPUTS_EXTENSION_VALUE_OFFSET,
  );
  if (extensionKey.toString('hex') !== BRIDGE_EXTENSION_KEY_HEX) {
    throw new Error('pooled-reserve burn extension key must be 0x0401');
  }
  const extensionValue = bytes.subarray(PUBLIC_INPUTS_EXTENSION_VALUE_OFFSET);
  const expectedExtensionValue = Buffer.from(encodeBridgeExtensionValueV1({
    bridgeEventRootHex: checkpoint.bridgeEventRootHex,
    checkpointCommitmentHex: checkpointCommitment.toString('hex'),
  }), 'hex');
  if (!extensionValue.equals(expectedExtensionValue)) {
    throw new Error('pooled-reserve burn extension value mismatch');
  }

  return Object.freeze({
    version: POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_VERSION,
    hashAlgorithmId: POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_HASH_BLAKE2B256,
    sourceSemanticsId:
      POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_SOURCE_SUBSTRATE_GRANDPA_V1,
    flags: POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_FLAGS_NONE,
    application,
    applicationBindingDigestHex: applicationBindingDigest.toString('hex'),
    checkpoint,
    encodedCheckpointHex: encodedCheckpoint.toString('hex'),
    checkpointCommitmentHex: checkpointCommitment.toString('hex'),
    targetNativeStateRootHex: targetNativeStateRoot.toString('hex'),
    trustedAnchorDigestHex: trustedAnchorDigest.toString('hex'),
    finalityHorizonHeight: finalityHorizonHeight.toString(),
    finalityHorizonHashHex: finalityHorizonHash.toString('hex'),
    extensionKeyHex: BRIDGE_EXTENSION_KEY_HEX,
    extensionValueHex: extensionValue.toString('hex'),
    encodedPublicInputsHex: bytes.toString('hex'),
    publicInputsDigestHex: blake2b256(bytes).toString('hex'),
  });
}

export function derivePooledReserveBurnPublicInputsV4DigestHex(
  encodedPublicInputs: Buffer | string,
): string {
  return decodePooledReserveBurnPublicInputsV4(encodedPublicInputs).publicInputsDigestHex;
}

export function encodeEip0045PooledReserveBurnStatementV4(
  input: Eip0045PooledReserveBurnStatementV4Input,
): Buffer {
  const chainDomainId = nonzeroHexBytes(input.chainDomainIdHex, 'chainDomainId');
  const profileId = nonzeroHexBytes(input.profileIdHex, 'profileId');
  const programId = nonzeroHexBytes(input.programIdHex, 'programId');
  const contractId = nonzeroHexBytes(input.contractIdHex, 'contractId');
  rejectApplicationV2ProgramIdentity(programId);
  const publicInputs = exactBytes(
    input.publicInputs,
    POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES,
    'pooled-reserve burn public inputs V4',
  );
  const decodedPublicInputs = decodePooledReserveBurnPublicInputsV4(publicInputs);
  requireMatchingOuterBindings(chainDomainId, contractId, decodedPublicInputs.application);

  const statement = Buffer.concat([
    Buffer.from(EIP0045_ERGO_STATEMENT_V1_DOMAIN, 'ascii'),
    Buffer.from([EIP0045_ERGO_STATEMENT_V1_VERSION]),
    chainDomainId,
    profileId,
    programId,
    contractId,
    uint32Le(publicInputs.length, 'public inputs length'),
    publicInputs,
  ]);
  if (statement.length !== EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES) {
    throw new Error('EIP-0045 pooled-reserve burn statement V4 internal length mismatch');
  }
  return statement;
}

export function decodeEip0045PooledReserveBurnStatementV4(
  encodedStatement: Buffer | string,
): Eip0045PooledReserveBurnStatementV4 {
  const bytes = exactBytes(
    encodedStatement,
    EIP0045_POOLED_RESERVE_BURN_STATEMENT_V4_BYTES,
    'EIP-0045 pooled-reserve burn statement V4',
  );
  const expectedDomain = Buffer.from(EIP0045_ERGO_STATEMENT_V1_DOMAIN, 'ascii');
  if (!bytes.subarray(0, expectedDomain.length).equals(expectedDomain)) {
    throw new Error('EIP-0045 ErgoStatementV1 domain mismatch');
  }
  if (bytes[expectedDomain.length] !== EIP0045_ERGO_STATEMENT_V1_VERSION) {
    throw new Error('unsupported EIP-0045 ErgoStatement version');
  }
  const publicInputsLength = bytes.readUInt32LE(EIP_STATEMENT_PAYLOAD_LENGTH_OFFSET);
  if (publicInputsLength !== POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_BYTES) {
    throw new Error('EIP-0045 pooled-reserve burn public inputs length mismatch');
  }

  const chainDomainId = nonzeroBytes(
    bytes.subarray(EIP_STATEMENT_CHAIN_DOMAIN_OFFSET, EIP_STATEMENT_PROFILE_OFFSET),
    'chainDomainId',
  );
  const profileId = nonzeroBytes(
    bytes.subarray(EIP_STATEMENT_PROFILE_OFFSET, EIP_STATEMENT_PROGRAM_OFFSET),
    'profileId',
  );
  const programId = nonzeroBytes(
    bytes.subarray(EIP_STATEMENT_PROGRAM_OFFSET, EIP_STATEMENT_CONTRACT_OFFSET),
    'programId',
  );
  const contractId = nonzeroBytes(
    bytes.subarray(EIP_STATEMENT_CONTRACT_OFFSET, EIP_STATEMENT_PAYLOAD_LENGTH_OFFSET),
    'contractId',
  );
  rejectApplicationV2ProgramIdentity(programId);
  const publicInputs = decodePooledReserveBurnPublicInputsV4(
    bytes.subarray(EIP_STATEMENT_PAYLOAD_OFFSET),
  );
  requireMatchingOuterBindings(chainDomainId, contractId, publicInputs.application);

  return Object.freeze({
    version: EIP0045_ERGO_STATEMENT_V1_VERSION,
    chainDomainIdHex: chainDomainId.toString('hex'),
    profileIdHex: profileId.toString('hex'),
    programIdHex: programId.toString('hex'),
    contractIdHex: contractId.toString('hex'),
    publicInputs,
    encodedStatementHex: bytes.toString('hex'),
    statementDigestHex: blake2b256(bytes).toString('hex'),
  });
}

export function deriveEip0045PooledReserveBurnStatementV4DigestHex(
  encodedStatement: Buffer | string,
): string {
  return decodeEip0045PooledReserveBurnStatementV4(encodedStatement).statementDigestHex;
}

export function assertEip0045PooledReserveBurnStatementV4Matches(
  encodedStatement: Buffer | string,
  expected: Eip0045PooledReserveBurnStatementV4Input,
): Eip0045PooledReserveBurnStatementV4 {
  const actual = decodeEip0045PooledReserveBurnStatementV4(encodedStatement);
  const rebuilt = encodeEip0045PooledReserveBurnStatementV4(expected);
  if (actual.encodedStatementHex !== rebuilt.toString('hex')) {
    throw new Error('EIP-0045 pooled-reserve burn statement V4 expected binding mismatch');
  }
  return actual;
}

function validateCheckpoint(
  checkpoint: BridgeCheckpointV1,
  runtimeProfile: PooledReserveMintReservationRuntimeProfileV4,
): void {
  if (checkpoint.burnLeafCount > MAX_BURN_LEAVES) {
    throw new Error(`pooled-reserve burn checkpoint exceeds ${MAX_BURN_LEAVES} leaves`);
  }
  if (checkpoint.sidechainIdHex !== stripHexPrefix(runtimeProfile.sidechainIdHex)) {
    throw new Error('pooled-reserve burn runtime/checkpoint sidechain ID mismatch');
  }
  if (BigInt(checkpoint.sidechainHeight) < BigInt(runtimeProfile.activationHeight)) {
    throw new Error('pooled-reserve burn checkpoint precedes runtime profile activation');
  }
}

function validatePublicInputsDiscriminators(
  version: number,
  hashAlgorithmId: number,
  sourceSemanticsId: number,
  flags: number,
): void {
  if (version !== POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_VERSION) {
    throw new Error(`unsupported pooled-reserve burn public inputs version: ${version}`);
  }
  if (hashAlgorithmId !== POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_HASH_BLAKE2B256) {
    throw new Error(`unsupported pooled-reserve burn hash algorithm: ${hashAlgorithmId}`);
  }
  if (
    sourceSemanticsId
    !== POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_SOURCE_SUBSTRATE_GRANDPA_V1
  ) {
    throw new Error(`unsupported pooled-reserve burn source semantics: ${sourceSemanticsId}`);
  }
  if (flags !== POOLED_RESERVE_BURN_PUBLIC_INPUTS_V4_FLAGS_NONE) {
    throw new Error(`unsupported pooled-reserve burn public inputs flags: ${flags}`);
  }
}

function requireMatchingOuterBindings(
  chainDomainId: Buffer,
  contractId: Buffer,
  application: PooledReserveBurnApplicationBindingV4,
): void {
  if (
    chainDomainId.toString('hex')
    !== stripHexPrefix(application.runtimeProfile.sourceNetworkIdHex)
  ) {
    throw new Error('pooled-reserve burn settlement chain domain mismatch');
  }
  if (contractId.toString('hex') !== application.settlementTrackerContractIdHex) {
    throw new Error('pooled-reserve burn settlement tracker contract mismatch');
  }
}

function rejectApplicationV2ProgramIdentity(programId: Buffer): void {
  if (
    programId.toString('hex')
    === POOLED_RESERVE_BURN_V4_REJECTED_APPLICATION_V2_PROGRAM_ID_HEX
  ) {
    throw new Error('pooled-reserve burn V4 must not reuse the application V2 programId');
  }
}

function exactHexBytes(value: string, expectedBytes: number, label: string): Buffer {
  if (typeof value !== 'string' || !/^[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be lowercase unprefixed hex`);
  }
  if (value.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes`);
  }
  return Buffer.from(value, 'hex');
}

function exactPrefixedHexBytes(value: string, expectedBytes: number, label: string): Buffer {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be lowercase 0x-prefixed hex`);
  }
  if (value.length !== (expectedBytes * 2) + 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes`);
  }
  return Buffer.from(value.slice(2), 'hex');
}

function exactBytes(value: Buffer | string, expectedBytes: number, label: string): Buffer {
  const bytes = Buffer.isBuffer(value)
    ? Buffer.from(value)
    : exactHexBytes(value, expectedBytes, label);
  if (bytes.length !== expectedBytes) {
    throw new Error(`${label} must be ${expectedBytes} bytes`);
  }
  return bytes;
}

function nonzeroHexBytes(
  value: string,
  label: string,
  expectedBytes = DIGEST_BYTES,
): Buffer {
  return nonzeroBytes(exactHexBytes(value, expectedBytes, label), label);
}

function nonzeroBytes(value: Buffer, label: string): Buffer {
  if (value.every((byte) => byte === 0)) {
    throw new Error(`${label} must be nonzero`);
  }
  return Buffer.from(value);
}

function positiveUint32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > UINT32_MAX) {
    throw new Error(`${label} must be a positive uint32`);
  }
  return value;
}

function normalizeUint64(value: string | number | bigint, label: string): bigint {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`${label} number input must be a non-negative safe integer`);
  }
  const raw = String(value);
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) {
    throw new Error(`${label} must be a canonical uint64`);
  }
  const normalized = BigInt(raw);
  if (normalized > UINT64_MAX) {
    throw new Error(`${label} must fit uint64`);
  }
  return normalized;
}

function uint32Be(value: number, label: string): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(positiveUint32(value, label));
  return bytes;
}

function uint32Le(value: number, label: string): Buffer {
  if (!Number.isSafeInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new Error(`${label} must fit uint32`);
  }
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

function uint64Be(value: bigint, label: string): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(normalizeUint64(value, label));
  return bytes;
}

function stripHexPrefix(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

function domainHash(domain: string, bytes: Buffer): Buffer {
  return blake2b256(Buffer.concat([Buffer.from(domain, 'ascii'), bytes]));
}

function blake2b256(bytes: Buffer): Buffer {
  return Buffer.from(blakejs.blake2b(bytes, undefined, DIGEST_BYTES));
}
