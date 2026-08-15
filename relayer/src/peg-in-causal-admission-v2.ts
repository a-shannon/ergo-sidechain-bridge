import blakejs from 'blakejs';

import { derivePegInRuntimeRecordKeyV1Hex } from './peg-in-runtime-state.js';

export const PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION = 2 as const;
export const PEG_IN_CONSUMED_ADMISSION_FORMAT_VERSION = 3 as const;
export const PEG_IN_CAUSAL_ADMISSION_PROFILE_V2_BYTES = 313;
export const PEG_IN_SOURCE_INTENT_V2_BYTES = 229;
export const PEG_IN_CAUSAL_ADMISSION_STATEMENT_V2_BYTES = 381;
export const PEG_IN_CONSUMED_ADMISSION_V2_BYTES = 249;
export const PEG_IN_CONSUMED_ADMISSION_V3_BYTES = 249;
export const PEG_IN_CAUSAL_ADMISSION_PROFILE_V2_DOMAIN =
  'E2S_PEG_IN_CAUSAL_PROFILE_V2' as const;
export const PEG_IN_SOURCE_INTENT_V2_DOMAIN =
  'E2S_PEG_IN_SOURCE_INTENT_V2' as const;
export const PEG_IN_CAUSAL_ADMISSION_V2_DOMAIN =
  'E2S_PEG_IN_CAUSAL_ADMISSION_V2' as const;

const UINT32_MAX = 0xffff_ffff;
const UINT64_MAX = (1n << 64n) - 1n;
const ERGO_LONG_MAX = (1n << 63n) - 1n;
const ZERO_32_HEX = `0x${'00'.repeat(32)}`;

export interface PegInCausalAdmissionProfileV2 {
  readonly formatVersion: typeof PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION;
  readonly sourceNetworkIdHex: string;
  readonly sidechainIdHex: string;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly settlementProfileIdHex: string;
  readonly sourceLockErgoTreeHashHex: string;
  readonly vaultErgoTreeHashHex: string;
  readonly finalityPolicyIdHex: string;
  readonly proofSystemIdHex: string;
  readonly proofProfileIdHex: string;
  readonly profileRevision: string | number | bigint;
  readonly activationHeight: string | number | bigint;
}

export interface PegInSourceIntentV2 {
  readonly formatVersion: typeof PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION;
  readonly sourceNetworkIdHex: string;
  readonly sidechainIdHex: string;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly settlementProfileIdHex: string;
  readonly admissionProfileIdHex: string;
  readonly sourceAssetIdHex: string;
  readonly amountNanoErg: string | number | bigint;
  readonly recipientAddressHex: string;
}

export interface PegInCausalAdmissionStatementV2 {
  readonly formatVersion: typeof PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION;
  readonly sourceIntentIdHex: string;
  readonly legacyMintIdentityHex: string;
  readonly sourceBoxIdHex: string;
  readonly sourceCreationTransactionIdHex: string;
  readonly sourceOutputIndex: number;
  readonly sourceLockErgoTreeHashHex: string;
  readonly commitmentTransactionIdHex: string;
  readonly vaultOutputIndex: number;
  readonly vaultBoxIdHex: string;
  readonly vaultErgoTreeHashHex: string;
  readonly commitmentInclusionBlockIdHex: string;
  readonly commitmentInclusionHeight: string | number | bigint;
  readonly acceptanceCheckpointBlockIdHex: string;
  readonly acceptanceCheckpointHeight: string | number | bigint;
  readonly finalityPolicyIdHex: string;
  readonly requiredConfirmations: number;
}

export interface PegInConsumedAdmissionV2 {
  readonly formatVersion: typeof PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION;
  readonly admissionIdHex: string;
  readonly sourceIntentIdHex: string;
  readonly legacyMintIdentityHex: string;
  readonly nativeBlockHashHex: string;
  readonly nativeHeight: string | number | bigint;
  readonly executionBlockHashHex: string;
  readonly executionHeight: string | number | bigint;
  readonly transactionHashHex: string;
  readonly transactionIndex: number;
  readonly eventIndex: number;
  readonly processedRecordBlake2b256Hex: string;
}

/**
 * Runtime-producible successor to the unactivated V2 consumed record.
 *
 * A native block cannot commit its own final hash inside the state root from
 * which that hash is derived. V3 therefore binds the direct parent hash and
 * leaves the mint-child hash to the authenticated child header.
 */
export interface PegInConsumedAdmissionV3 {
  readonly formatVersion: typeof PEG_IN_CONSUMED_ADMISSION_FORMAT_VERSION;
  readonly admissionIdHex: string;
  readonly sourceIntentIdHex: string;
  readonly legacyMintIdentityHex: string;
  readonly nativeParentBlockHashHex: string;
  readonly nativeMintHeight: string | number | bigint;
  readonly executionBlockHashHex: string;
  readonly executionHeight: string | number | bigint;
  readonly transactionHashHex: string;
  readonly transactionIndex: number;
  readonly eventIndex: number;
  readonly processedRecordBlake2b256Hex: string;
}

export function encodePegInCausalAdmissionProfileV2Hex(
  profile: PegInCausalAdmissionProfileV2,
): string {
  requireVersion(profile.formatVersion, 'peg-in causal admission profile');
  const encoded = Buffer.concat([
    Buffer.from([profile.formatVersion]),
    fixedHexBytes(profile.sourceNetworkIdHex, 32, 'source network ID', true),
    fixedHexBytes(profile.sidechainIdHex, 32, 'sidechain ID', true),
    fixedHexBytes(profile.bridgeAddressHex, 20, 'bridge address', true),
    fixedHexBytes(profile.tokenAddressHex, 20, 'token address', true),
    fixedHexBytes(profile.settlementProfileIdHex, 32, 'settlement profile ID', true),
    fixedHexBytes(
      profile.sourceLockErgoTreeHashHex,
      32,
      'source-lock ErgoTree hash',
      true,
    ),
    fixedHexBytes(profile.vaultErgoTreeHashHex, 32, 'vault ErgoTree hash', true),
    fixedHexBytes(profile.finalityPolicyIdHex, 32, 'finality policy ID', true),
    fixedHexBytes(profile.proofSystemIdHex, 32, 'proof-system ID', true),
    fixedHexBytes(profile.proofProfileIdHex, 32, 'proof profile ID', true),
    uint64Be(profile.profileRevision, 'profile revision', true),
    uint64Be(profile.activationHeight, 'profile activation height'),
  ]);
  return fixedLengthHex(encoded, PEG_IN_CAUSAL_ADMISSION_PROFILE_V2_BYTES, 'profile');
}

export function decodePegInCausalAdmissionProfileV2Hex(
  value: string,
): PegInCausalAdmissionProfileV2 {
  const bytes = fixedWireBytes(
    value,
    PEG_IN_CAUSAL_ADMISSION_PROFILE_V2_BYTES,
    'peg-in causal admission profile',
  );
  const profile: PegInCausalAdmissionProfileV2 = {
    formatVersion: bytes[0] as typeof PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
    sourceNetworkIdHex: sliceHex(bytes, 1, 33),
    sidechainIdHex: sliceHex(bytes, 33, 65),
    bridgeAddressHex: sliceHex(bytes, 65, 85),
    tokenAddressHex: sliceHex(bytes, 85, 105),
    settlementProfileIdHex: sliceHex(bytes, 105, 137),
    sourceLockErgoTreeHashHex: sliceHex(bytes, 137, 169),
    vaultErgoTreeHashHex: sliceHex(bytes, 169, 201),
    finalityPolicyIdHex: sliceHex(bytes, 201, 233),
    proofSystemIdHex: sliceHex(bytes, 233, 265),
    proofProfileIdHex: sliceHex(bytes, 265, 297),
    profileRevision: bytes.readBigUInt64BE(297).toString(),
    activationHeight: bytes.readBigUInt64BE(305).toString(),
  };
  assertCanonicalRoundTrip(
    value,
    encodePegInCausalAdmissionProfileV2Hex(profile),
    'peg-in causal admission profile',
  );
  return profile;
}

export function derivePegInCausalAdmissionProfileIdV2Hex(
  profile: PegInCausalAdmissionProfileV2,
): string {
  return domainHash(
    PEG_IN_CAUSAL_ADMISSION_PROFILE_V2_DOMAIN,
    encodePegInCausalAdmissionProfileV2Hex(profile),
  );
}

export function encodePegInSourceIntentV2Hex(intent: PegInSourceIntentV2): string {
  requireVersion(intent.formatVersion, 'peg-in source intent');
  const encoded = Buffer.concat([
    Buffer.from([intent.formatVersion]),
    fixedHexBytes(intent.sourceNetworkIdHex, 32, 'source network ID', true),
    fixedHexBytes(intent.sidechainIdHex, 32, 'sidechain ID', true),
    fixedHexBytes(intent.bridgeAddressHex, 20, 'bridge address', true),
    fixedHexBytes(intent.tokenAddressHex, 20, 'token address', true),
    fixedHexBytes(intent.settlementProfileIdHex, 32, 'settlement profile ID', true),
    fixedHexBytes(intent.admissionProfileIdHex, 32, 'admission profile ID', true),
    fixedHexBytes(intent.sourceAssetIdHex, 32, 'source asset ID'),
    ergoAmountBe(intent.amountNanoErg, 'source amount'),
    fixedHexBytes(intent.recipientAddressHex, 20, 'recipient address', true),
  ]);
  return fixedLengthHex(encoded, PEG_IN_SOURCE_INTENT_V2_BYTES, 'source intent');
}

export function decodePegInSourceIntentV2Hex(value: string): PegInSourceIntentV2 {
  const bytes = fixedWireBytes(value, PEG_IN_SOURCE_INTENT_V2_BYTES, 'peg-in source intent');
  const intent: PegInSourceIntentV2 = {
    formatVersion: bytes[0] as typeof PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
    sourceNetworkIdHex: sliceHex(bytes, 1, 33),
    sidechainIdHex: sliceHex(bytes, 33, 65),
    bridgeAddressHex: sliceHex(bytes, 65, 85),
    tokenAddressHex: sliceHex(bytes, 85, 105),
    settlementProfileIdHex: sliceHex(bytes, 105, 137),
    admissionProfileIdHex: sliceHex(bytes, 137, 169),
    sourceAssetIdHex: sliceHex(bytes, 169, 201),
    amountNanoErg: bytes.readBigUInt64BE(201).toString(),
    recipientAddressHex: sliceHex(bytes, 209, 229),
  };
  assertCanonicalRoundTrip(
    value,
    encodePegInSourceIntentV2Hex(intent),
    'peg-in source intent',
  );
  return intent;
}

export function derivePegInSourceIntentIdV2Hex(intent: PegInSourceIntentV2): string {
  return domainHash(PEG_IN_SOURCE_INTENT_V2_DOMAIN, encodePegInSourceIntentV2Hex(intent));
}

export function encodePegInCausalAdmissionStatementV2Hex(
  statement: PegInCausalAdmissionStatementV2,
): string {
  requireVersion(statement.formatVersion, 'peg-in causal admission statement');
  const sourceBoxId = fixedHexBytes(statement.sourceBoxIdHex, 32, 'source box ID', true);
  const sourceCreationTransactionId = fixedHexBytes(
    statement.sourceCreationTransactionIdHex,
    32,
    'source creation transaction ID',
    true,
  );
  const commitmentTransactionId = fixedHexBytes(
    statement.commitmentTransactionIdHex,
    32,
    'commitment transaction ID',
    true,
  );
  const vaultBoxId = fixedHexBytes(statement.vaultBoxIdHex, 32, 'vault box ID', true);
  if (sourceCreationTransactionId.equals(commitmentTransactionId)) {
    throw new Error('source creation and commitment transaction IDs must be distinct');
  }
  if (sourceBoxId.equals(vaultBoxId)) {
    throw new Error('source and vault box IDs must be distinct');
  }
  const inclusionHeight = normalizeUint64(
    statement.commitmentInclusionHeight,
    'commitment inclusion height',
  );
  const checkpointHeight = normalizeUint64(
    statement.acceptanceCheckpointHeight,
    'acceptance checkpoint height',
  );
  const requiredConfirmations = normalizeUint32(
    statement.requiredConfirmations,
    'required confirmations',
    true,
  );
  if (checkpointHeight < inclusionHeight) {
    throw new Error('acceptance checkpoint height precedes commitment inclusion');
  }
  const observedConfirmations = checkpointHeight - inclusionHeight + 1n;
  if (observedConfirmations < BigInt(requiredConfirmations)) {
    throw new Error('acceptance checkpoint does not satisfy required confirmations');
  }
  const encoded = Buffer.concat([
    Buffer.from([statement.formatVersion]),
    fixedHexBytes(statement.sourceIntentIdHex, 32, 'source intent ID', true),
    fixedHexBytes(statement.legacyMintIdentityHex, 32, 'legacy mint identity', true),
    sourceBoxId,
    sourceCreationTransactionId,
    uint32Be(statement.sourceOutputIndex, 'source output index'),
    fixedHexBytes(statement.sourceLockErgoTreeHashHex, 32, 'source lock ErgoTree hash', true),
    commitmentTransactionId,
    uint32Be(statement.vaultOutputIndex, 'vault output index'),
    vaultBoxId,
    fixedHexBytes(statement.vaultErgoTreeHashHex, 32, 'vault ErgoTree hash', true),
    fixedHexBytes(
      statement.commitmentInclusionBlockIdHex,
      32,
      'commitment inclusion block ID',
      true,
    ),
    uint64Buffer(inclusionHeight),
    fixedHexBytes(
      statement.acceptanceCheckpointBlockIdHex,
      32,
      'acceptance checkpoint block ID',
      true,
    ),
    uint64Buffer(checkpointHeight),
    fixedHexBytes(statement.finalityPolicyIdHex, 32, 'finality policy ID', true),
    uint32Buffer(requiredConfirmations),
  ]);
  return fixedLengthHex(
    encoded,
    PEG_IN_CAUSAL_ADMISSION_STATEMENT_V2_BYTES,
    'causal admission statement',
  );
}

export function decodePegInCausalAdmissionStatementV2Hex(
  value: string,
): PegInCausalAdmissionStatementV2 {
  const bytes = fixedWireBytes(
    value,
    PEG_IN_CAUSAL_ADMISSION_STATEMENT_V2_BYTES,
    'peg-in causal admission statement',
  );
  const statement: PegInCausalAdmissionStatementV2 = {
    formatVersion: bytes[0] as typeof PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
    sourceIntentIdHex: sliceHex(bytes, 1, 33),
    legacyMintIdentityHex: sliceHex(bytes, 33, 65),
    sourceBoxIdHex: sliceHex(bytes, 65, 97),
    sourceCreationTransactionIdHex: sliceHex(bytes, 97, 129),
    sourceOutputIndex: bytes.readUInt32BE(129),
    sourceLockErgoTreeHashHex: sliceHex(bytes, 133, 165),
    commitmentTransactionIdHex: sliceHex(bytes, 165, 197),
    vaultOutputIndex: bytes.readUInt32BE(197),
    vaultBoxIdHex: sliceHex(bytes, 201, 233),
    vaultErgoTreeHashHex: sliceHex(bytes, 233, 265),
    commitmentInclusionBlockIdHex: sliceHex(bytes, 265, 297),
    commitmentInclusionHeight: bytes.readBigUInt64BE(297).toString(),
    acceptanceCheckpointBlockIdHex: sliceHex(bytes, 305, 337),
    acceptanceCheckpointHeight: bytes.readBigUInt64BE(337).toString(),
    finalityPolicyIdHex: sliceHex(bytes, 345, 377),
    requiredConfirmations: bytes.readUInt32BE(377),
  };
  assertCanonicalRoundTrip(
    value,
    encodePegInCausalAdmissionStatementV2Hex(statement),
    'peg-in causal admission statement',
  );
  return statement;
}

export function derivePegInCausalAdmissionIdV2Hex(
  statement: PegInCausalAdmissionStatementV2,
): string {
  return domainHash(
    PEG_IN_CAUSAL_ADMISSION_V2_DOMAIN,
    encodePegInCausalAdmissionStatementV2Hex(statement),
  );
}

export function encodePegInConsumedAdmissionV2Hex(
  record: PegInConsumedAdmissionV2,
): string {
  requireVersion(record.formatVersion, 'consumed peg-in admission');
  const encoded = Buffer.concat([
    Buffer.from([record.formatVersion]),
    fixedHexBytes(record.admissionIdHex, 32, 'admission ID', true),
    fixedHexBytes(record.sourceIntentIdHex, 32, 'source intent ID', true),
    fixedHexBytes(record.legacyMintIdentityHex, 32, 'legacy mint identity', true),
    fixedHexBytes(record.nativeBlockHashHex, 32, 'native block hash', true),
    uint64Be(record.nativeHeight, 'native height'),
    fixedHexBytes(record.executionBlockHashHex, 32, 'execution block hash', true),
    uint64Be(record.executionHeight, 'execution height'),
    fixedHexBytes(record.transactionHashHex, 32, 'transaction hash', true),
    uint32Be(record.transactionIndex, 'transaction index'),
    uint32Be(record.eventIndex, 'event index'),
    fixedHexBytes(
      record.processedRecordBlake2b256Hex,
      32,
      'processed-record Blake2b-256',
      true,
    ),
  ]);
  return fixedLengthHex(
    encoded,
    PEG_IN_CONSUMED_ADMISSION_V2_BYTES,
    'consumed admission',
  );
}

export function decodePegInConsumedAdmissionV2Hex(
  value: string,
): PegInConsumedAdmissionV2 {
  const bytes = fixedWireBytes(
    value,
    PEG_IN_CONSUMED_ADMISSION_V2_BYTES,
    'consumed peg-in admission',
  );
  const record: PegInConsumedAdmissionV2 = {
    formatVersion: bytes[0] as typeof PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION,
    admissionIdHex: sliceHex(bytes, 1, 33),
    sourceIntentIdHex: sliceHex(bytes, 33, 65),
    legacyMintIdentityHex: sliceHex(bytes, 65, 97),
    nativeBlockHashHex: sliceHex(bytes, 97, 129),
    nativeHeight: bytes.readBigUInt64BE(129).toString(),
    executionBlockHashHex: sliceHex(bytes, 137, 169),
    executionHeight: bytes.readBigUInt64BE(169).toString(),
    transactionHashHex: sliceHex(bytes, 177, 209),
    transactionIndex: bytes.readUInt32BE(209),
    eventIndex: bytes.readUInt32BE(213),
    processedRecordBlake2b256Hex: sliceHex(bytes, 217, 249),
  };
  assertCanonicalRoundTrip(
    value,
    encodePegInConsumedAdmissionV2Hex(record),
    'consumed peg-in admission',
  );
  return record;
}

export function encodePegInConsumedAdmissionV3Hex(
  record: PegInConsumedAdmissionV3,
): string {
  requireExactVersion(
    record.formatVersion,
    PEG_IN_CONSUMED_ADMISSION_FORMAT_VERSION,
    'consumed peg-in admission V3',
  );
  const encoded = Buffer.concat([
    Buffer.from([record.formatVersion]),
    fixedHexBytes(record.admissionIdHex, 32, 'admission ID', true),
    fixedHexBytes(record.sourceIntentIdHex, 32, 'source intent ID', true),
    fixedHexBytes(record.legacyMintIdentityHex, 32, 'legacy mint identity', true),
    fixedHexBytes(
      record.nativeParentBlockHashHex,
      32,
      'native parent block hash',
      true,
    ),
    uint64Be(record.nativeMintHeight, 'native mint height'),
    fixedHexBytes(record.executionBlockHashHex, 32, 'execution block hash', true),
    uint64Be(record.executionHeight, 'execution height'),
    fixedHexBytes(record.transactionHashHex, 32, 'transaction hash', true),
    uint32Be(record.transactionIndex, 'transaction index'),
    uint32Be(record.eventIndex, 'event index'),
    fixedHexBytes(
      record.processedRecordBlake2b256Hex,
      32,
      'processed-record Blake2b-256',
      true,
    ),
  ]);
  return fixedLengthHex(
    encoded,
    PEG_IN_CONSUMED_ADMISSION_V3_BYTES,
    'consumed admission V3',
  );
}

export function decodePegInConsumedAdmissionV3Hex(
  value: string,
): PegInConsumedAdmissionV3 {
  const bytes = fixedWireBytes(
    value,
    PEG_IN_CONSUMED_ADMISSION_V3_BYTES,
    'consumed peg-in admission V3',
  );
  const record: PegInConsumedAdmissionV3 = {
    formatVersion: bytes[0] as typeof PEG_IN_CONSUMED_ADMISSION_FORMAT_VERSION,
    admissionIdHex: sliceHex(bytes, 1, 33),
    sourceIntentIdHex: sliceHex(bytes, 33, 65),
    legacyMintIdentityHex: sliceHex(bytes, 65, 97),
    nativeParentBlockHashHex: sliceHex(bytes, 97, 129),
    nativeMintHeight: bytes.readBigUInt64BE(129).toString(),
    executionBlockHashHex: sliceHex(bytes, 137, 169),
    executionHeight: bytes.readBigUInt64BE(169).toString(),
    transactionHashHex: sliceHex(bytes, 177, 209),
    transactionIndex: bytes.readUInt32BE(209),
    eventIndex: bytes.readUInt32BE(213),
    processedRecordBlake2b256Hex: sliceHex(bytes, 217, 249),
  };
  assertCanonicalRoundTrip(
    value,
    encodePegInConsumedAdmissionV3Hex(record),
    'consumed peg-in admission V3',
  );
  return record;
}

export function assertPegInCausalAdmissionV2Bindings(input: {
  readonly profile: PegInCausalAdmissionProfileV2;
  readonly sourceIntent: PegInSourceIntentV2;
  readonly statement: PegInCausalAdmissionStatementV2;
}): void {
  encodePegInCausalAdmissionProfileV2Hex(input.profile);
  encodePegInSourceIntentV2Hex(input.sourceIntent);
  encodePegInCausalAdmissionStatementV2Hex(input.statement);
  const profileId = derivePegInCausalAdmissionProfileIdV2Hex(input.profile);
  if (normalizeHex(input.sourceIntent.admissionProfileIdHex, 32) !== profileId) {
    throw new Error('source intent does not bind the exact causal admission profile');
  }
  for (const [intentValue, profileValue, label, bytes] of [
    [input.sourceIntent.sourceNetworkIdHex, input.profile.sourceNetworkIdHex, 'source network', 32],
    [input.sourceIntent.sidechainIdHex, input.profile.sidechainIdHex, 'sidechain', 32],
    [input.sourceIntent.bridgeAddressHex, input.profile.bridgeAddressHex, 'bridge address', 20],
    [input.sourceIntent.tokenAddressHex, input.profile.tokenAddressHex, 'token address', 20],
    [input.sourceIntent.settlementProfileIdHex, input.profile.settlementProfileIdHex, 'settlement profile', 32],
  ] as const) {
    if (normalizeHex(intentValue, bytes) !== normalizeHex(profileValue, bytes)) {
      throw new Error(`source intent ${label} does not match the admission profile`);
    }
  }
  if (normalizeHex(input.sourceIntent.sourceAssetIdHex, 32) !== ZERO_32_HEX) {
    throw new Error('causal admission V2 supports only the native ERG asset lane');
  }
  if (
    normalizeHex(input.statement.finalityPolicyIdHex, 32)
    !== normalizeHex(input.profile.finalityPolicyIdHex, 32)
  ) {
    throw new Error('causal admission statement finality policy does not match the profile');
  }
  if (
    normalizeHex(input.statement.sourceLockErgoTreeHashHex, 32)
      !== normalizeHex(input.profile.sourceLockErgoTreeHashHex, 32)
    || normalizeHex(input.statement.vaultErgoTreeHashHex, 32)
      !== normalizeHex(input.profile.vaultErgoTreeHashHex, 32)
  ) {
    throw new Error('causal admission statement ErgoTrees do not match the profile');
  }
  if (
    normalizeHex(input.statement.sourceIntentIdHex, 32)
    !== derivePegInSourceIntentIdV2Hex(input.sourceIntent)
  ) {
    throw new Error('causal admission statement does not bind the exact source intent');
  }
  const expectedLegacyIdentity = derivePegInRuntimeRecordKeyV1Hex({
    sidechainIdHex: input.sourceIntent.sidechainIdHex,
    ergoBoxIdHex: input.statement.sourceBoxIdHex,
  });
  if (
    normalizeHex(input.statement.legacyMintIdentityHex, 32)
    !== expectedLegacyIdentity
  ) {
    throw new Error('causal admission statement does not preserve the V1 mint identity');
  }
}

export function blake2b256Hex(value: string): string {
  const bytes = variableWireBytes(value, 'Blake2b-256 input');
  return `0x${Buffer.from(blakejs.blake2b(bytes, undefined, 32)).toString('hex')}`;
}

function domainHash(domain: string, value: string): string {
  const bytes = variableWireBytes(value, `${domain} value`);
  return `0x${Buffer.from(blakejs.blake2b(
    Buffer.concat([Buffer.from(domain, 'ascii'), bytes]),
    undefined,
    32,
  )).toString('hex')}`;
}

function requireVersion(value: number, label: string): void {
  requireExactVersion(value, PEG_IN_CAUSAL_ADMISSION_FORMAT_VERSION, label);
}

function requireExactVersion(value: number, expected: number, label: string): void {
  if (value !== expected) {
    throw new Error(
      `${label} format version must be exactly ${expected}`,
    );
  }
}

function uint32Be(value: number, label: string): Buffer {
  return uint32Buffer(normalizeUint32(value, label));
}

function normalizeUint32(value: number, label: string, positive = false): number {
  if (
    !Number.isSafeInteger(value)
    || value < 0
    || value > UINT32_MAX
    || (positive && value === 0)
  ) {
    throw new Error(`${label} must be a ${positive ? 'positive ' : ''}uint32`);
  }
  return value;
}

function uint32Buffer(value: number): Buffer {
  const encoded = Buffer.alloc(4);
  encoded.writeUInt32BE(value);
  return encoded;
}

function uint64Be(
  value: string | number | bigint,
  label: string,
  positive = false,
): Buffer {
  return uint64Buffer(normalizeUint64(value, label, positive));
}

function uint64Buffer(value: bigint): Buffer {
  const encoded = Buffer.alloc(8);
  encoded.writeBigUInt64BE(value);
  return encoded;
}

function ergoAmountBe(value: string | number | bigint, label: string): Buffer {
  const normalized = normalizeUint64(value, label, true);
  if (normalized > ERGO_LONG_MAX) {
    throw new Error(`${label} must be within the positive Ergo Long range`);
  }
  return uint64Buffer(normalized);
}

function normalizeUint64(
  value: string | number | bigint,
  label: string,
  positive = false,
): bigint {
  let normalized: bigint;
  if (typeof value === 'bigint') {
    normalized = value;
  } else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${label} number must be a safe integer`);
    }
    normalized = BigInt(value);
  } else if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) {
    normalized = BigInt(value);
  } else {
    throw new Error(`${label} must be a canonical decimal uint64`);
  }
  if (
    normalized < 0n
    || normalized > UINT64_MAX
    || (positive && normalized === 0n)
  ) {
    throw new Error(`${label} must be a ${positive ? 'positive ' : ''}uint64`);
  }
  return normalized;
}

function fixedHexBytes(
  value: string,
  bytes: number,
  label: string,
  nonzero = false,
): Buffer {
  const normalized = normalizeHex(value, bytes);
  if (nonzero && /^0x0+$/.test(normalized)) {
    throw new Error(`${label} must not be zero`);
  }
  return Buffer.from(normalized.slice(2), 'hex');
}

function normalizeHex(value: string, bytes: number): string {
  if (typeof value !== 'string') {
    throw new Error(`hexadecimal value must be exactly ${bytes} bytes`);
  }
  const raw = value.startsWith('0x') ? value.slice(2) : value;
  if (raw.length !== bytes * 2 || !/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error(`hexadecimal value must be exactly ${bytes} bytes`);
  }
  return `0x${raw.toLowerCase()}`;
}

function fixedWireBytes(value: string, bytes: number, label: string): Buffer {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be lowercase 0x-prefixed hexadecimal bytes`);
  }
  if (value.length !== 2 + bytes * 2) {
    throw new Error(`${label} must be exactly ${bytes} bytes`);
  }
  return Buffer.from(value.slice(2), 'hex');
}

function variableWireBytes(value: string, label: string): Buffer {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error(`${label} must be lowercase 0x-prefixed hexadecimal bytes`);
  }
  return Buffer.from(value.slice(2), 'hex');
}

function fixedLengthHex(value: Buffer, expected: number, label: string): string {
  if (value.length !== expected) {
    throw new Error(`peg-in ${label} encoding length drifted`);
  }
  return `0x${value.toString('hex')}`;
}

function sliceHex(value: Buffer, start: number, end: number): string {
  return `0x${value.subarray(start, end).toString('hex')}`;
}

function assertCanonicalRoundTrip(input: string, encoded: string, label: string): void {
  if (input !== encoded) {
    throw new Error(`${label} bytes are not canonical V2`);
  }
}
