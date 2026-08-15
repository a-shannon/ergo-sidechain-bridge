import blakejs from 'blakejs';

export const SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_V1_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_V1' as const;
export const SUBSTRATE_FEDERATED_SOURCE_KEY_SET_V1_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_SOURCE_KEY_SET_V1' as const;
export const SUBSTRATE_FEDERATED_ERGO_KEY_SET_V1_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ERGO_KEY_SET_V1' as const;
export const SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1' as const;
export const SUBSTRATE_FEDERATED_CHECKPOINT_ATTESTATION_V1_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_CHECKPOINT_ATTESTATION_V1' as const;

export const SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_V1_VERSION = 1 as const;
export const SUBSTRATE_FEDERATED_SOURCE_KEY_ALGORITHM_ED25519 = 1 as const;
export const SUBSTRATE_FEDERATED_ERGO_KEY_ALGORITHM_SIGMAPROP = 1 as const;
export const SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_FLAGS_NONE = 0 as const;
export const SUBSTRATE_FEDERATED_CHECKPOINT_MAX_KEYS_PER_ROLE = 8 as const;

export const SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_VERSION = 1 as const;
export const SUBSTRATE_FEDERATED_CHECKPOINT_HASH_BLAKE2B256 = 1 as const;
export const SUBSTRATE_FEDERATED_CHECKPOINT_FINALITY_THRESHOLD_ATTESTED =
  1 as const;
export const SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_FLAGS_NONE = 0 as const;
export const SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_BYTES = 512 as const;
export const SUBSTRATE_FEDERATED_CHECKPOINT_EXTENSION_KEY_HEX = '0401' as const;
export const SUBSTRATE_FEDERATED_CHECKPOINT_EXTENSION_VALUE_BYTES = 64 as const;

const DIGEST_BYTES = 32;
const EVM_ADDRESS_BYTES = 20;
const SOURCE_PUBLIC_KEY_BYTES = 32;
const ERGO_PUBLIC_KEY_BYTES = 33;
const PROFILE_FIXED_PREFIX_BYTES = 24;
const MAX_BURN_LEAVES = 256;
const UINT32_MAX = 0xffff_ffff;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;

export interface SubstrateFederatedCheckpointProfileV1Input {
  readonly federationEpoch: string | number | bigint;
  readonly maxAdmissionValidityBlocks: string | number | bigint;
  readonly sourceAttestationThreshold: number;
  readonly sourceAttestationPublicKeysHex: readonly string[];
  readonly ergoAdmissionThreshold: number;
  readonly ergoAdmissionPublicKeysHex: readonly string[];
}

export interface SubstrateFederatedCheckpointProfileV1 {
  readonly version: 1;
  readonly sourceKeyAlgorithmId: 1;
  readonly ergoKeyAlgorithmId: 1;
  readonly flags: 0;
  readonly federationEpoch: string;
  readonly maxAdmissionValidityBlocks: string;
  readonly sourceAttestationThreshold: number;
  readonly sourceAttestationPublicKeysHex: readonly string[];
  readonly sourceAttestationKeySetDigestHex: string;
  readonly ergoAdmissionThreshold: number;
  readonly ergoAdmissionPublicKeysHex: readonly string[];
  readonly ergoAdmissionKeySetDigestHex: string;
  readonly encodedProfileHex: string;
  readonly profileIdHex: string;
}

export interface SubstrateFederatedCheckpointStatementV1Input {
  readonly profile: Readonly<SubstrateFederatedCheckpointProfileV1>;
  readonly sourceNetworkIdHex: string;
  readonly sidechainIdHex: string;
  readonly sourceNativeBlockHeight: string | number | bigint;
  readonly sourceNativeBlockHashHex: string;
  readonly executionBlockHashHex: string;
  readonly bridgeEventRootHex: string;
  readonly burnLeafCount: number;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly bridgeRuntimeCodeSha256Hex: string;
  readonly bridgeRuntimeCodeBytes: number;
  readonly tokenRuntimeCodeSha256Hex: string;
  readonly tokenRuntimeCodeBytes: number;
  readonly sourceRuntimeCodeSha256Hex: string;
  readonly sourceRuntimeCodeBytes: number;
  readonly runtimeProfileIdHex: string;
  readonly settlementProfileIdHex: string;
  readonly admissionValidFromErgoHeight: string | number | bigint;
  readonly admissionExpiresAtErgoHeight: string | number | bigint;
}

export interface SubstrateFederatedCheckpointStatementV1 {
  readonly version: 1;
  readonly hashAlgorithmId: 1;
  readonly finalityRuleId: 1;
  readonly flags: 0;
  readonly sourceNetworkIdHex: string;
  readonly sidechainIdHex: string;
  readonly sourceNativeBlockHeight: string;
  readonly sourceNativeBlockHashHex: string;
  readonly executionBlockHashHex: string;
  readonly bridgeEventRootHex: string;
  readonly burnLeafCount: number;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly bridgeRuntimeCodeSha256Hex: string;
  readonly bridgeRuntimeCodeBytes: number;
  readonly tokenRuntimeCodeSha256Hex: string;
  readonly tokenRuntimeCodeBytes: number;
  readonly sourceRuntimeCodeSha256Hex: string;
  readonly sourceRuntimeCodeBytes: number;
  readonly runtimeProfileIdHex: string;
  readonly settlementProfileIdHex: string;
  readonly federationProfileIdHex: string;
  readonly sourceAttestationKeySetDigestHex: string;
  readonly sourceAttestationThreshold: number;
  readonly ergoAdmissionKeySetDigestHex: string;
  readonly ergoAdmissionThreshold: number;
  readonly federationEpoch: string;
  readonly admissionValidFromErgoHeight: string;
  readonly admissionExpiresAtErgoHeight: string;
  readonly encodedStatementHex: string;
  readonly statementIdHex: string;
}

export function buildSubstrateFederatedCheckpointProfileV1(
  input: SubstrateFederatedCheckpointProfileV1Input,
): Readonly<SubstrateFederatedCheckpointProfileV1> {
  return decodeSubstrateFederatedCheckpointProfileV1(
    encodeSubstrateFederatedCheckpointProfileV1(input),
  );
}

export function encodeSubstrateFederatedCheckpointProfileV1(
  input: SubstrateFederatedCheckpointProfileV1Input,
): Buffer {
  const normalized = normalizeProfileInput(input);
  return Buffer.concat([
    Buffer.from([
      SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_V1_VERSION,
      SUBSTRATE_FEDERATED_SOURCE_KEY_ALGORITHM_ED25519,
      SUBSTRATE_FEDERATED_ERGO_KEY_ALGORITHM_SIGMAPROP,
      SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_FLAGS_NONE,
    ]),
    uint64Be(normalized.federationEpoch),
    uint64Be(normalized.maxAdmissionValidityBlocks),
    uint16Be(normalized.sourceAttestationThreshold),
    uint16Be(normalized.sourceAttestationPublicKeysHex.length),
    ...normalized.sourceAttestationPublicKeysHex.map(key => Buffer.from(key, 'hex')),
    uint16Be(normalized.ergoAdmissionThreshold),
    uint16Be(normalized.ergoAdmissionPublicKeysHex.length),
    ...normalized.ergoAdmissionPublicKeysHex.map(key => Buffer.from(key, 'hex')),
  ]);
}

export function decodeSubstrateFederatedCheckpointProfileV1(
  encoded: Buffer | string,
): Readonly<SubstrateFederatedCheckpointProfileV1> {
  const bytes = variableBytes(encoded, 'substrate federated checkpoint profile V1');
  if (bytes.length < PROFILE_FIXED_PREFIX_BYTES) {
    throw new Error('substrate federated checkpoint profile V1 is truncated');
  }
  validateProfileDiscriminators(bytes[0], bytes[1], bytes[2], bytes[3]);
  const federationEpoch = bytes.readBigUInt64BE(4);
  const maxAdmissionValidityBlocks = bytes.readBigUInt64BE(12);
  const sourceAttestationThreshold = bytes.readUInt16BE(20);
  const sourceKeyCount = bytes.readUInt16BE(22);
  const sourceKeysEnd = PROFILE_FIXED_PREFIX_BYTES
    + sourceKeyCount * SOURCE_PUBLIC_KEY_BYTES;
  if (sourceKeysEnd + 4 > bytes.length) {
    throw new Error('substrate federated checkpoint source key set is truncated');
  }
  const sourceAttestationPublicKeysHex = Array.from(
    { length: sourceKeyCount },
    (_, index) => bytes.subarray(
      PROFILE_FIXED_PREFIX_BYTES + index * SOURCE_PUBLIC_KEY_BYTES,
      PROFILE_FIXED_PREFIX_BYTES + (index + 1) * SOURCE_PUBLIC_KEY_BYTES,
    ).toString('hex'),
  );
  const ergoAdmissionThreshold = bytes.readUInt16BE(sourceKeysEnd);
  const ergoKeyCount = bytes.readUInt16BE(sourceKeysEnd + 2);
  const ergoKeysOffset = sourceKeysEnd + 4;
  const expectedLength = ergoKeysOffset + ergoKeyCount * ERGO_PUBLIC_KEY_BYTES;
  if (bytes.length !== expectedLength) {
    throw new Error('substrate federated checkpoint profile length is not canonical');
  }
  const ergoAdmissionPublicKeysHex = Array.from(
    { length: ergoKeyCount },
    (_, index) => bytes.subarray(
      ergoKeysOffset + index * ERGO_PUBLIC_KEY_BYTES,
      ergoKeysOffset + (index + 1) * ERGO_PUBLIC_KEY_BYTES,
    ).toString('hex'),
  );
  const normalized = normalizeProfileInput({
    federationEpoch,
    maxAdmissionValidityBlocks,
    sourceAttestationThreshold,
    sourceAttestationPublicKeysHex,
    ergoAdmissionThreshold,
    ergoAdmissionPublicKeysHex,
  });
  const canonical = encodeSubstrateFederatedCheckpointProfileV1(normalized);
  if (!canonical.equals(bytes)) {
    throw new Error('substrate federated checkpoint profile bytes are not canonical');
  }
  const encodedProfileHex = bytes.toString('hex');
  return Object.freeze({
    version: SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_V1_VERSION,
    sourceKeyAlgorithmId: SUBSTRATE_FEDERATED_SOURCE_KEY_ALGORITHM_ED25519,
    ergoKeyAlgorithmId: SUBSTRATE_FEDERATED_ERGO_KEY_ALGORITHM_SIGMAPROP,
    flags: SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_FLAGS_NONE,
    federationEpoch: normalized.federationEpoch.toString(),
    maxAdmissionValidityBlocks: normalized.maxAdmissionValidityBlocks.toString(),
    sourceAttestationThreshold,
    sourceAttestationPublicKeysHex: Object.freeze(sourceAttestationPublicKeysHex),
    sourceAttestationKeySetDigestHex: deriveRoleKeySetDigestHex(
      SUBSTRATE_FEDERATED_SOURCE_KEY_SET_V1_DOMAIN,
      sourceAttestationPublicKeysHex,
      SOURCE_PUBLIC_KEY_BYTES,
    ),
    ergoAdmissionThreshold,
    ergoAdmissionPublicKeysHex: Object.freeze(ergoAdmissionPublicKeysHex),
    ergoAdmissionKeySetDigestHex: deriveRoleKeySetDigestHex(
      SUBSTRATE_FEDERATED_ERGO_KEY_SET_V1_DOMAIN,
      ergoAdmissionPublicKeysHex,
      ERGO_PUBLIC_KEY_BYTES,
    ),
    encodedProfileHex,
    profileIdHex: domainHashHex(
      SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_V1_DOMAIN,
      bytes,
    ),
  });
}

export function buildSubstrateFederatedCheckpointStatementV1(
  input: SubstrateFederatedCheckpointStatementV1Input,
): Readonly<SubstrateFederatedCheckpointStatementV1> {
  const encoded = encodeSubstrateFederatedCheckpointStatementV1(input);
  const statement = decodeSubstrateFederatedCheckpointStatementV1(encoded);
  assertSubstrateFederatedCheckpointStatementV1MatchesProfile(
    statement,
    input.profile,
  );
  return statement;
}

export function encodeSubstrateFederatedCheckpointStatementV1(
  input: SubstrateFederatedCheckpointStatementV1Input,
): Buffer {
  const profile = canonicalProfile(input.profile);
  const sourceNativeBlockHeight = uint64(
    input.sourceNativeBlockHeight,
    'source native block height',
  );
  const admissionValidFromErgoHeight = uint64(
    input.admissionValidFromErgoHeight,
    'admission valid-from Ergo height',
  );
  const admissionExpiresAtErgoHeight = uint64(
    input.admissionExpiresAtErgoHeight,
    'admission expiry Ergo height',
  );
  validateAdmissionHorizon(
    admissionValidFromErgoHeight,
    admissionExpiresAtErgoHeight,
    BigInt(profile.maxAdmissionValidityBlocks),
  );
  const bridgeAddressHex = fixedHex(
    input.bridgeAddressHex,
    EVM_ADDRESS_BYTES,
    'bridge address',
    true,
  );
  const tokenAddressHex = fixedHex(
    input.tokenAddressHex,
    EVM_ADDRESS_BYTES,
    'token address',
    true,
  );
  if (bridgeAddressHex === tokenAddressHex) {
    throw new Error('bridge and token addresses must be distinct');
  }
  const encoded = Buffer.concat([
    Buffer.from([
      SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_VERSION,
      SUBSTRATE_FEDERATED_CHECKPOINT_HASH_BLAKE2B256,
      SUBSTRATE_FEDERATED_CHECKPOINT_FINALITY_THRESHOLD_ATTESTED,
      SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_FLAGS_NONE,
    ]),
    hexBytes(input.sourceNetworkIdHex, DIGEST_BYTES, 'source network ID', true),
    hexBytes(input.sidechainIdHex, DIGEST_BYTES, 'sidechain ID', true),
    uint64Be(sourceNativeBlockHeight),
    hexBytes(input.sourceNativeBlockHashHex, DIGEST_BYTES, 'source native block hash', true),
    hexBytes(input.executionBlockHashHex, DIGEST_BYTES, 'execution block hash', true),
    hexBytes(input.bridgeEventRootHex, DIGEST_BYTES, 'bridge event root', true),
    uint32Be(burnLeafCount(input.burnLeafCount)),
    Buffer.from(bridgeAddressHex, 'hex'),
    Buffer.from(tokenAddressHex, 'hex'),
    hexBytes(input.bridgeRuntimeCodeSha256Hex, DIGEST_BYTES, 'bridge runtime code hash', true),
    uint32Be(positiveUint32(input.bridgeRuntimeCodeBytes, 'bridge runtime code bytes')),
    hexBytes(input.tokenRuntimeCodeSha256Hex, DIGEST_BYTES, 'token runtime code hash', true),
    uint32Be(positiveUint32(input.tokenRuntimeCodeBytes, 'token runtime code bytes')),
    hexBytes(input.sourceRuntimeCodeSha256Hex, DIGEST_BYTES, 'source runtime code hash', true),
    uint32Be(positiveUint32(input.sourceRuntimeCodeBytes, 'source runtime code bytes')),
    hexBytes(input.runtimeProfileIdHex, DIGEST_BYTES, 'runtime profile ID', true),
    hexBytes(input.settlementProfileIdHex, DIGEST_BYTES, 'settlement profile ID', true),
    Buffer.from(profile.profileIdHex, 'hex'),
    Buffer.from(profile.sourceAttestationKeySetDigestHex, 'hex'),
    uint16Be(profile.sourceAttestationThreshold),
    Buffer.from(profile.ergoAdmissionKeySetDigestHex, 'hex'),
    uint16Be(profile.ergoAdmissionThreshold),
    uint64Be(BigInt(profile.federationEpoch)),
    uint64Be(admissionValidFromErgoHeight),
    uint64Be(admissionExpiresAtErgoHeight),
  ]);
  if (encoded.length !== SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_BYTES) {
    throw new Error('substrate federated checkpoint statement internal length mismatch');
  }
  return encoded;
}

export function decodeSubstrateFederatedCheckpointStatementV1(
  encoded: Buffer | string,
): Readonly<SubstrateFederatedCheckpointStatementV1> {
  const bytes = exactBytes(
    encoded,
    SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_BYTES,
    'substrate federated checkpoint statement V1',
  );
  validateStatementDiscriminators(bytes[0], bytes[1], bytes[2], bytes[3]);
  let offset = 4;
  const take = (length: number): Buffer => {
    const value = bytes.subarray(offset, offset + length);
    offset += length;
    return value;
  };
  const sourceNetworkIdHex = nonzeroBuffer(take(32), 'source network ID').toString('hex');
  const sidechainIdHex = nonzeroBuffer(take(32), 'sidechain ID').toString('hex');
  const sourceNativeBlockHeight = take(8).readBigUInt64BE();
  const sourceNativeBlockHashHex = nonzeroBuffer(take(32), 'source native block hash').toString('hex');
  const executionBlockHashHex = nonzeroBuffer(take(32), 'execution block hash').toString('hex');
  const bridgeEventRootHex = nonzeroBuffer(take(32), 'bridge event root').toString('hex');
  const decodedBurnLeafCount = burnLeafCount(take(4).readUInt32BE());
  const bridgeAddressHex = nonzeroBuffer(take(20), 'bridge address').toString('hex');
  const tokenAddressHex = nonzeroBuffer(take(20), 'token address').toString('hex');
  if (bridgeAddressHex === tokenAddressHex) {
    throw new Error('bridge and token addresses must be distinct');
  }
  const bridgeRuntimeCodeSha256Hex = nonzeroBuffer(take(32), 'bridge runtime code hash').toString('hex');
  const bridgeRuntimeCodeBytes = positiveUint32(take(4).readUInt32BE(), 'bridge runtime code bytes');
  const tokenRuntimeCodeSha256Hex = nonzeroBuffer(take(32), 'token runtime code hash').toString('hex');
  const tokenRuntimeCodeBytes = positiveUint32(take(4).readUInt32BE(), 'token runtime code bytes');
  const sourceRuntimeCodeSha256Hex = nonzeroBuffer(take(32), 'source runtime code hash').toString('hex');
  const sourceRuntimeCodeBytes = positiveUint32(take(4).readUInt32BE(), 'source runtime code bytes');
  const runtimeProfileIdHex = nonzeroBuffer(take(32), 'runtime profile ID').toString('hex');
  const settlementProfileIdHex = nonzeroBuffer(take(32), 'settlement profile ID').toString('hex');
  const federationProfileIdHex = nonzeroBuffer(take(32), 'federation profile ID').toString('hex');
  const sourceAttestationKeySetDigestHex = nonzeroBuffer(take(32), 'source key-set digest').toString('hex');
  const sourceAttestationThreshold = statementThreshold(
    take(2).readUInt16BE(),
    'source threshold',
  );
  const ergoAdmissionKeySetDigestHex = nonzeroBuffer(take(32), 'Ergo key-set digest').toString('hex');
  const ergoAdmissionThreshold = statementThreshold(
    take(2).readUInt16BE(),
    'Ergo threshold',
  );
  const federationEpoch = take(8).readBigUInt64BE();
  const admissionValidFromErgoHeight = take(8).readBigUInt64BE();
  const admissionExpiresAtErgoHeight = take(8).readBigUInt64BE();
  if (offset !== bytes.length) {
    throw new Error('substrate federated checkpoint statement offsets are inconsistent');
  }
  validateAdmissionHorizon(
    admissionValidFromErgoHeight,
    admissionExpiresAtErgoHeight,
  );
  if (federationEpoch === 0n) {
    throw new Error('federation epoch must be positive');
  }
  const encodedStatementHex = bytes.toString('hex');
  return Object.freeze({
    version: SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_VERSION,
    hashAlgorithmId: SUBSTRATE_FEDERATED_CHECKPOINT_HASH_BLAKE2B256,
    finalityRuleId: SUBSTRATE_FEDERATED_CHECKPOINT_FINALITY_THRESHOLD_ATTESTED,
    flags: SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_FLAGS_NONE,
    sourceNetworkIdHex,
    sidechainIdHex,
    sourceNativeBlockHeight: sourceNativeBlockHeight.toString(),
    sourceNativeBlockHashHex,
    executionBlockHashHex,
    bridgeEventRootHex,
    burnLeafCount: decodedBurnLeafCount,
    bridgeAddressHex,
    tokenAddressHex,
    bridgeRuntimeCodeSha256Hex,
    bridgeRuntimeCodeBytes,
    tokenRuntimeCodeSha256Hex,
    tokenRuntimeCodeBytes,
    sourceRuntimeCodeSha256Hex,
    sourceRuntimeCodeBytes,
    runtimeProfileIdHex,
    settlementProfileIdHex,
    federationProfileIdHex,
    sourceAttestationKeySetDigestHex,
    sourceAttestationThreshold,
    ergoAdmissionKeySetDigestHex,
    ergoAdmissionThreshold,
    federationEpoch: federationEpoch.toString(),
    admissionValidFromErgoHeight: admissionValidFromErgoHeight.toString(),
    admissionExpiresAtErgoHeight: admissionExpiresAtErgoHeight.toString(),
    encodedStatementHex,
    statementIdHex: domainHashHex(
      SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_DOMAIN,
      bytes,
    ),
  });
}

export function assertSubstrateFederatedCheckpointStatementV1MatchesProfile(
  statement: Readonly<SubstrateFederatedCheckpointStatementV1>,
  expectedProfile: Readonly<SubstrateFederatedCheckpointProfileV1>,
): void {
  const canonicalStatement = decodeSubstrateFederatedCheckpointStatementV1(
    statement.encodedStatementHex,
  );
  const profile = canonicalProfile(expectedProfile);
  const comparisons = [
    [canonicalStatement.federationProfileIdHex, profile.profileIdHex, 'profile ID'],
    [canonicalStatement.sourceAttestationKeySetDigestHex, profile.sourceAttestationKeySetDigestHex, 'source key-set digest'],
    [canonicalStatement.sourceAttestationThreshold, profile.sourceAttestationThreshold, 'source threshold'],
    [canonicalStatement.ergoAdmissionKeySetDigestHex, profile.ergoAdmissionKeySetDigestHex, 'Ergo key-set digest'],
    [canonicalStatement.ergoAdmissionThreshold, profile.ergoAdmissionThreshold, 'Ergo threshold'],
    [canonicalStatement.federationEpoch, profile.federationEpoch, 'federation epoch'],
  ] as const;
  for (const [actual, expected, label] of comparisons) {
    if (actual !== expected) {
      throw new Error(`substrate federated checkpoint ${label} mismatch`);
    }
  }
  validateAdmissionHorizon(
    BigInt(canonicalStatement.admissionValidFromErgoHeight),
    BigInt(canonicalStatement.admissionExpiresAtErgoHeight),
    BigInt(profile.maxAdmissionValidityBlocks),
  );
}

export function assertSubstrateFederatedCheckpointStatementV1Matches(
  statement: Readonly<SubstrateFederatedCheckpointStatementV1>,
  expected: SubstrateFederatedCheckpointStatementV1Input,
): void {
  const canonicalStatement = decodeSubstrateFederatedCheckpointStatementV1(
    statement.encodedStatementHex,
  );
  const rebuilt = buildSubstrateFederatedCheckpointStatementV1(expected);
  if (canonicalStatement.encodedStatementHex !== rebuilt.encodedStatementHex) {
    throw new Error('substrate federated checkpoint statement does not match expected bindings');
  }
}

export function decodeSubstrateFederatedCheckpointStatementV1ForAdmission(
  encoded: Buffer | string,
  expectedProfile: Readonly<SubstrateFederatedCheckpointProfileV1>,
  currentErgoHeight: string | number | bigint,
): Readonly<SubstrateFederatedCheckpointStatementV1> {
  const statement = decodeSubstrateFederatedCheckpointStatementV1(encoded);
  assertSubstrateFederatedCheckpointStatementV1MatchesProfile(
    statement,
    expectedProfile,
  );
  const current = uint64(currentErgoHeight, 'current Ergo height');
  const validFrom = BigInt(statement.admissionValidFromErgoHeight);
  const expires = BigInt(statement.admissionExpiresAtErgoHeight);
  if (current < validFrom || current >= expires) {
    throw new Error('substrate federated checkpoint statement is outside its Ergo admission horizon');
  }
  return statement;
}

export function deriveSubstrateFederatedCheckpointAttestationDigestHex(
  encoded: Buffer | string,
): string {
  const statementIdHex = decodeSubstrateFederatedCheckpointStatementV1(
    encoded,
  ).statementIdHex;
  return domainHashHex(
    SUBSTRATE_FEDERATED_CHECKPOINT_ATTESTATION_V1_DOMAIN,
    Buffer.from(statementIdHex, 'hex'),
  );
}

export function encodeSubstrateFederatedCheckpointExtensionValueV1(
  encoded: Buffer | string,
): string {
  const decoded = decodeSubstrateFederatedCheckpointStatementV1(encoded);
  return `${decoded.bridgeEventRootHex}${decoded.statementIdHex}`;
}

function normalizeProfileInput(
  input: SubstrateFederatedCheckpointProfileV1Input,
): Readonly<{
  federationEpoch: bigint;
  maxAdmissionValidityBlocks: bigint;
  sourceAttestationThreshold: number;
  sourceAttestationPublicKeysHex: readonly string[];
  ergoAdmissionThreshold: number;
  ergoAdmissionPublicKeysHex: readonly string[];
}> {
  const federationEpoch = uint64(input.federationEpoch, 'federation epoch');
  const maxAdmissionValidityBlocks = uint64(
    input.maxAdmissionValidityBlocks,
    'maximum Ergo admission validity blocks',
  );
  if (federationEpoch === 0n || maxAdmissionValidityBlocks === 0n) {
    throw new Error(
      'federation epoch and maximum Ergo admission validity blocks must be positive',
    );
  }
  const sourceAttestationPublicKeysHex = canonicalKeys(
    input.sourceAttestationPublicKeysHex,
    SOURCE_PUBLIC_KEY_BYTES,
    'source attestation',
  );
  const ergoAdmissionPublicKeysHex = canonicalKeys(
    input.ergoAdmissionPublicKeysHex,
    ERGO_PUBLIC_KEY_BYTES,
    'Ergo admission',
    true,
  );
  const sourceAttestationThreshold = roleThreshold(
    input.sourceAttestationThreshold,
    sourceAttestationPublicKeysHex.length,
    'source attestation',
  );
  const ergoAdmissionThreshold = roleThreshold(
    input.ergoAdmissionThreshold,
    ergoAdmissionPublicKeysHex.length,
    'Ergo admission',
  );
  return Object.freeze({
    federationEpoch,
    maxAdmissionValidityBlocks,
    sourceAttestationThreshold,
    sourceAttestationPublicKeysHex,
    ergoAdmissionThreshold,
    ergoAdmissionPublicKeysHex,
  });
}

function canonicalProfile(
  profile: Readonly<SubstrateFederatedCheckpointProfileV1>,
): Readonly<SubstrateFederatedCheckpointProfileV1> {
  const decoded = decodeSubstrateFederatedCheckpointProfileV1(
    Buffer.from(profile.encodedProfileHex, 'hex'),
  );
  if (decoded.profileIdHex !== profile.profileIdHex) {
    throw new Error('substrate federated checkpoint profile identity mismatch');
  }
  return decoded;
}

function canonicalKeys(
  values: readonly string[],
  bytes: number,
  role: string,
  requireCompressedPointPrefix = false,
): readonly string[] {
  if (!Array.isArray(values) || values.length === 0
    || values.length > SUBSTRATE_FEDERATED_CHECKPOINT_MAX_KEYS_PER_ROLE) {
    throw new Error(`${role} key count is outside the supported bound`);
  }
  const normalized = values.map((value, index) => {
    const key = fixedHex(value, bytes, `${role} public key ${index}`, true);
    if (requireCompressedPointPrefix && key.slice(0, 2) !== '02'
      && key.slice(0, 2) !== '03') {
      throw new Error(`${role} public key ${index} is not a compressed group element`);
    }
    return key;
  });
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1] >= normalized[index]) {
      throw new Error(`${role} public keys are not strictly ordered and unique`);
    }
  }
  return Object.freeze(normalized);
}

function deriveRoleKeySetDigestHex(
  domain: string,
  keys: readonly string[],
  keyBytes: number,
): string {
  return domainHashHex(domain, Buffer.concat([
    uint16Be(keys.length),
    ...keys.map((key, index) => hexBytes(key, keyBytes, `role public key ${index}`, true)),
  ]));
}

function roleThreshold(value: number, keyCount: number, role: string): number {
  const threshold = positiveUint16(value, `${role} threshold`);
  if (threshold > keyCount) {
    throw new Error(`${role} threshold exceeds its key count`);
  }
  return threshold;
}

function statementThreshold(value: number, role: string): number {
  const threshold = positiveUint16(value, role);
  if (threshold > SUBSTRATE_FEDERATED_CHECKPOINT_MAX_KEYS_PER_ROLE) {
    throw new Error(`${role} exceeds the supported bound`);
  }
  return threshold;
}

function validateProfileDiscriminators(
  version: number,
  sourceKeyAlgorithmId: number,
  ergoKeyAlgorithmId: number,
  flags: number,
): void {
  if (version !== SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_V1_VERSION
    || sourceKeyAlgorithmId !== SUBSTRATE_FEDERATED_SOURCE_KEY_ALGORITHM_ED25519
    || ergoKeyAlgorithmId !== SUBSTRATE_FEDERATED_ERGO_KEY_ALGORITHM_SIGMAPROP
    || flags !== SUBSTRATE_FEDERATED_CHECKPOINT_PROFILE_FLAGS_NONE) {
    throw new Error('unsupported substrate federated checkpoint profile discriminators');
  }
}

function validateStatementDiscriminators(
  version: number,
  hashAlgorithmId: number,
  finalityRuleId: number,
  flags: number,
): void {
  if (version !== SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_V1_VERSION
    || hashAlgorithmId !== SUBSTRATE_FEDERATED_CHECKPOINT_HASH_BLAKE2B256
    || finalityRuleId !== SUBSTRATE_FEDERATED_CHECKPOINT_FINALITY_THRESHOLD_ATTESTED
    || flags !== SUBSTRATE_FEDERATED_CHECKPOINT_STATEMENT_FLAGS_NONE) {
    throw new Error('unsupported substrate federated checkpoint statement discriminators');
  }
}

function validateAdmissionHorizon(
  validFromErgoHeight: bigint,
  expiresAtErgoHeight: bigint,
  maxAdmissionValidityBlocks?: bigint,
): void {
  if (expiresAtErgoHeight <= validFromErgoHeight) {
    throw new Error('checkpoint Ergo admission horizon is empty or inverted');
  }
  if (maxAdmissionValidityBlocks !== undefined
    && expiresAtErgoHeight - validFromErgoHeight > maxAdmissionValidityBlocks) {
    throw new Error('checkpoint Ergo admission horizon exceeds its federation profile');
  }
}

function burnLeafCount(value: number): number {
  const count = positiveUint32(value, 'burn leaf count');
  if (count > MAX_BURN_LEAVES) {
    throw new Error('burn leaf count exceeds the supported bound');
  }
  return count;
}

function positiveUint16(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)
    || value <= 0 || value > 0xffff) {
    throw new Error(`${label} must be a positive uint16`);
  }
  return value;
}

function positiveUint32(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)
    || value <= 0 || value > UINT32_MAX) {
    throw new Error(`${label} must be a positive uint32`);
  }
  return value;
}

function uint64(value: string | number | bigint, label: string): bigint {
  let normalized: bigint;
  try {
    normalized = typeof value === 'bigint' ? value : BigInt(value);
  } catch {
    throw new Error(`${label} must be an unsigned uint64`);
  }
  if (normalized < 0n || normalized > UINT64_MAX
    || (typeof value === 'number' && !Number.isSafeInteger(value))) {
    throw new Error(`${label} must be an unsigned uint64`);
  }
  return normalized;
}

function uint16Be(value: number): Buffer {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(value);
  return bytes;
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

function exactBytes(
  value: Buffer | string,
  bytes: number,
  label: string,
): Buffer {
  const normalized = variableBytes(value, label);
  if (normalized.length !== bytes) {
    throw new Error(`${label} must contain exactly ${bytes} bytes`);
  }
  return normalized;
}

function variableBytes(value: Buffer | string, label: string): Buffer {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (typeof value !== 'string') throw new Error(`${label} must be bytes or hex`);
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (normalized.length === 0 || normalized.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(normalized)) {
    throw new Error(`${label} must be lowercase canonical hex`);
  }
  return Buffer.from(normalized, 'hex');
}

function fixedHex(
  value: unknown,
  bytes: number,
  label: string,
  nonzero = false,
): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hex`);
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (normalized.length !== bytes * 2 || !/^[0-9a-f]+$/.test(normalized)) {
    throw new Error(`${label} must be ${bytes} lowercase hex bytes`);
  }
  if (nonzero && /^0+$/.test(normalized)) throw new Error(`${label} must be nonzero`);
  return normalized;
}

function hexBytes(
  value: unknown,
  bytes: number,
  label: string,
  nonzero = false,
): Buffer {
  return Buffer.from(fixedHex(value, bytes, label, nonzero), 'hex');
}

function nonzeroBuffer(value: Buffer, label: string): Buffer {
  if (value.every(byte => byte === 0)) throw new Error(`${label} must be nonzero`);
  return value;
}

function domainHashHex(domain: string, bytes: Buffer): string {
  return Buffer.from(blakejs.blake2b(
    Buffer.concat([Buffer.from(domain, 'ascii'), bytes]),
    undefined,
    32,
  )).toString('hex');
}
