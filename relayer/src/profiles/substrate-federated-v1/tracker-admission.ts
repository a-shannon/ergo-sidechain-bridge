import blakejs from 'blakejs';

import {
  decodeSubstrateFederatedCheckpointStatementV1ForAdmission,
  encodeSubstrateFederatedCheckpointExtensionValueV1,
  type SubstrateFederatedCheckpointProfileV1,
  type SubstrateFederatedCheckpointStatementV1,
} from './checkpoint-statement.js';

export const SUBSTRATE_FEDERATED_TRACKER_KEY_V1_DOMAIN =
  'E2S_SPV_SUBSTRATE_FEDERATED_KEY_V1' as const;
export const SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_DOMAIN =
  'E2S_SPV_SUBSTRATE_FEDERATED_VALUE_V1' as const;
export const SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_BYTES = 370 as const;
export const SUBSTRATE_FEDERATED_TRACKER_EXTENSION_KEY_HEX = '0401' as const;

const SIGNED_LONG_MAX = 0x7fff_ffff_ffff_ffffn;

export interface SubstrateFederatedTrackerAdmissionV1Input {
  readonly profile: Readonly<SubstrateFederatedCheckpointProfileV1>;
  readonly encodedStatementHex: string;
  readonly currentErgoHeight: number;
  readonly anchorHeaderIdHex: string;
  readonly anchorHeaderHeight: number;
}

export interface SubstrateFederatedTrackerAdmissionV1 {
  readonly statement: Readonly<SubstrateFederatedCheckpointStatementV1>;
  readonly extensionKeyHex: typeof SUBSTRATE_FEDERATED_TRACKER_EXTENSION_KEY_HEX;
  readonly extensionValueHex: string;
  readonly trackerKeyHex: string;
  readonly trackerValueHex: string;
}

export interface SubstrateFederatedTrackerIdentityV1 {
  readonly sourceNetworkIdHex: string;
  readonly sidechainIdHex: string;
  readonly sourceNativeBlockHeight: string;
  readonly sourceNativeBlockHashHex: string;
  readonly executionBlockHashHex: string;
}

export interface SubstrateFederatedTrackerValueV1 {
  readonly version: 1;
  readonly hashAlgorithmId: 1;
  readonly sourceFinalityProfileId: 1;
  readonly flags: 0;
  readonly bridgeEventRootHex: string;
  readonly statementIdHex: string;
  readonly anchorHeaderIdHex: string;
  readonly anchorHeaderHeight: number;
  readonly sourceNativeBlockHeight: string;
  readonly sourceNativeBlockHashHex: string;
  readonly executionBlockHashHex: string;
  readonly burnLeafCount: number;
  readonly runtimeProfileIdHex: string;
  readonly settlementProfileIdHex: string;
  readonly federationProfileIdHex: string;
  readonly ergoAdmissionKeySetDigestHex: string;
  readonly ergoAdmissionThreshold: number;
  readonly federationEpoch: string;
  readonly admissionValidFromErgoHeight: string;
  readonly admissionExpiresAtErgoHeight: string;
}

export function buildSubstrateFederatedTrackerAdmissionV1(
  input: SubstrateFederatedTrackerAdmissionV1Input,
): Readonly<SubstrateFederatedTrackerAdmissionV1> {
  const currentErgoHeight = positiveInt32(
    input.currentErgoHeight,
    'current Ergo height',
  );
  const anchorHeaderHeight = positiveInt32(
    input.anchorHeaderHeight,
    'anchor header height',
  );
  if (anchorHeaderHeight > currentErgoHeight) {
    throw new Error('federated tracker anchor height exceeds the current Ergo height');
  }
  const statement = decodeSubstrateFederatedCheckpointStatementV1ForAdmission(
    input.encodedStatementHex,
    input.profile,
    currentErgoHeight,
  );
  const sourceHeight = signedLong(
    statement.sourceNativeBlockHeight,
    'source native block height',
  );
  const federationEpoch = signedLong(
    statement.federationEpoch,
    'federation epoch',
  );
  const validFrom = signedLong(
    statement.admissionValidFromErgoHeight,
    'admission valid-from Ergo height',
  );
  const expiresAt = signedLong(
    statement.admissionExpiresAtErgoHeight,
    'admission expiry Ergo height',
  );
  if (BigInt(anchorHeaderHeight) < validFrom || BigInt(anchorHeaderHeight) >= expiresAt) {
    throw new Error('federated tracker anchor is outside the statement admission horizon');
  }
  const anchorHeaderIdHex = exactHex(
    input.anchorHeaderIdHex,
    32,
    'anchor header ID',
  );
  const trackerKeyHex = deriveSubstrateFederatedTrackerKeyV1Hex({
    sourceNetworkIdHex: statement.sourceNetworkIdHex,
    sidechainIdHex: statement.sidechainIdHex,
    sourceNativeBlockHeight: sourceHeight.toString(),
    sourceNativeBlockHashHex: statement.sourceNativeBlockHashHex,
    executionBlockHashHex: statement.executionBlockHashHex,
  });
  const trackerValue = Buffer.concat([
    Buffer.from(SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_DOMAIN, 'ascii'),
    Buffer.from([1, 1, 1, 0]),
    Buffer.from(statement.bridgeEventRootHex, 'hex'),
    Buffer.from(statement.statementIdHex, 'hex'),
    Buffer.from(anchorHeaderIdHex, 'hex'),
    uint32Be(anchorHeaderHeight),
    uint64Be(sourceHeight),
    Buffer.from(statement.sourceNativeBlockHashHex, 'hex'),
    Buffer.from(statement.executionBlockHashHex, 'hex'),
    uint32Be(statement.burnLeafCount),
    Buffer.from(statement.runtimeProfileIdHex, 'hex'),
    Buffer.from(statement.settlementProfileIdHex, 'hex'),
    Buffer.from(statement.federationProfileIdHex, 'hex'),
    Buffer.from(statement.ergoAdmissionKeySetDigestHex, 'hex'),
    uint16Be(statement.ergoAdmissionThreshold),
    uint64Be(federationEpoch),
    uint64Be(validFrom),
    uint64Be(expiresAt),
  ]);
  if (trackerValue.length !== SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_BYTES) {
    throw new Error('federated tracker value length is not canonical');
  }
  return deepFreeze({
    statement,
    extensionKeyHex: SUBSTRATE_FEDERATED_TRACKER_EXTENSION_KEY_HEX,
    extensionValueHex: encodeSubstrateFederatedCheckpointExtensionValueV1(
      statement.encodedStatementHex,
    ),
    trackerKeyHex,
    trackerValueHex: trackerValue.toString('hex'),
  });
}

export function deriveSubstrateFederatedTrackerKeyV1Hex(
  input: SubstrateFederatedTrackerIdentityV1,
): string {
  const sourceHeight = signedLong(
    input.sourceNativeBlockHeight,
    'source native block height',
  );
  return blake2b256Hex(Buffer.concat([
    Buffer.from(SUBSTRATE_FEDERATED_TRACKER_KEY_V1_DOMAIN, 'ascii'),
    Buffer.from(exactHex(input.sourceNetworkIdHex, 32, 'source network ID'), 'hex'),
    Buffer.from(exactHex(input.sidechainIdHex, 32, 'sidechain ID'), 'hex'),
    uint64Be(sourceHeight),
    Buffer.from(exactHex(
      input.sourceNativeBlockHashHex,
      32,
      'source native block hash',
    ), 'hex'),
    Buffer.from(exactHex(
      input.executionBlockHashHex,
      32,
      'execution block hash',
    ), 'hex'),
  ]));
}

export function decodeSubstrateFederatedTrackerValueV1(
  encodedHex: string,
): Readonly<SubstrateFederatedTrackerValueV1> {
  if (
    typeof encodedHex !== 'string'
    || !new RegExp(
      `^[0-9a-f]{${SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_BYTES * 2}}$`,
    ).test(encodedHex)
  ) {
    throw new Error('federated tracker value must be canonical lowercase hex');
  }
  const value = Buffer.from(encodedHex, 'hex');
  if (
    value.subarray(0, 36).toString('ascii')
      !== SUBSTRATE_FEDERATED_TRACKER_VALUE_V1_DOMAIN
  ) {
    throw new Error('federated tracker value domain is invalid');
  }
  const discriminators = [...value.subarray(36, 40)];
  const expectedDiscriminators = [1, 1, 1, 0];
  if (discriminators.some(
    (field, index) => field !== expectedDiscriminators[index],
  )) {
    throw new Error('federated tracker value discriminators are invalid');
  }

  const sourceHeight = value.readBigUInt64BE(140);
  const burnLeafCount = value.readUInt32BE(212);
  const ergoAdmissionThreshold = value.readUInt16BE(344);
  const federationEpoch = value.readBigUInt64BE(346);
  const validFrom = value.readBigUInt64BE(354);
  const expiresAt = value.readBigUInt64BE(362);
  if (sourceHeight === 0n || sourceHeight > SIGNED_LONG_MAX) {
    throw new Error('federated tracker source height is invalid');
  }
  if (burnLeafCount === 0 || burnLeafCount > 256) {
    throw new Error('federated tracker burn leaf count is invalid');
  }
  if (ergoAdmissionThreshold === 0) {
    throw new Error('federated tracker Ergo admission threshold is invalid');
  }
  if (federationEpoch === 0n || federationEpoch > SIGNED_LONG_MAX) {
    throw new Error('federated tracker federation epoch is invalid');
  }
  if (
    validFrom === 0n
    || validFrom > SIGNED_LONG_MAX
    || expiresAt <= validFrom
    || expiresAt > SIGNED_LONG_MAX
  ) {
    throw new Error('federated tracker admission horizon is invalid');
  }

  return deepFreeze({
    version: 1 as const,
    hashAlgorithmId: 1 as const,
    sourceFinalityProfileId: 1 as const,
    flags: 0 as const,
    bridgeEventRootHex: nonzeroSlice(value, 40, 72, 'bridge event root'),
    statementIdHex: nonzeroSlice(value, 72, 104, 'statement ID'),
    anchorHeaderIdHex: nonzeroSlice(value, 104, 136, 'anchor header ID'),
    anchorHeaderHeight: value.readUInt32BE(136),
    sourceNativeBlockHeight: sourceHeight.toString(),
    sourceNativeBlockHashHex: nonzeroSlice(
      value,
      148,
      180,
      'source native block hash',
    ),
    executionBlockHashHex: nonzeroSlice(
      value,
      180,
      212,
      'execution block hash',
    ),
    burnLeafCount,
    runtimeProfileIdHex: nonzeroSlice(value, 216, 248, 'runtime profile ID'),
    settlementProfileIdHex: nonzeroSlice(
      value,
      248,
      280,
      'settlement profile ID',
    ),
    federationProfileIdHex: nonzeroSlice(
      value,
      280,
      312,
      'federation profile ID',
    ),
    ergoAdmissionKeySetDigestHex: nonzeroSlice(
      value,
      312,
      344,
      'Ergo admission key-set digest',
    ),
    ergoAdmissionThreshold,
    federationEpoch: federationEpoch.toString(),
    admissionValidFromErgoHeight: validFrom.toString(),
    admissionExpiresAtErgoHeight: expiresAt.toString(),
  });
}

function signedLong(value: string, label: string): bigint {
  const parsed = BigInt(value);
  if (parsed <= 0n || parsed > SIGNED_LONG_MAX) {
    throw new Error(`${label} exceeds the positive signed Long range`);
  }
  return parsed;
}

function positiveInt32(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0 || value > 0x7fff_ffff) {
    throw new Error(`${label} must be a positive signed Int`);
  }
  return value;
}

function uint16Be(value: number): Buffer {
  if (!Number.isInteger(value) || value <= 0 || value > 0xffff) {
    throw new Error('uint16 value is out of range');
  }
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(value);
  return bytes;
}

function uint32Be(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error('uint32 value is out of range');
  }
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function uint64Be(value: bigint): Buffer {
  if (value < 0n || value > SIGNED_LONG_MAX) {
    throw new Error('uint64 value exceeds the signed Long range');
  }
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(value);
  return bytes;
}

function exactHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)
    || /^0+$/.test(value)
  ) {
    throw new Error(`${label} must be ${bytes} nonzero lowercase hex bytes`);
  }
  return value;
}

function nonzeroSlice(
  value: Buffer,
  start: number,
  end: number,
  label: string,
): string {
  const encoded = value.subarray(start, end).toString('hex');
  if (/^0+$/.test(encoded)) {
    throw new Error(`federated tracker ${label} must not be zero`);
  }
  return encoded;
}

function blake2b256Hex(value: Uint8Array): string {
  return Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex');
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
