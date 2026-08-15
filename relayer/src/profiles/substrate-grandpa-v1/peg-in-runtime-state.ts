import blakejs from 'blakejs';

export const PEG_IN_RUNTIME_PROFILE_FORMAT_VERSION = 1 as const;
export const PEG_IN_RUNTIME_RECORD_FORMAT_VERSION = 1 as const;
export const PEG_IN_RUNTIME_PROFILE_V1_SCALE_BYTES = 69;
export const PEG_IN_RUNTIME_RECORD_V1_SCALE_BYTES = 205;
export const PEG_IN_RUNTIME_RECORD_KEY_DOMAIN = 'E2S_PEG_IN_RECORD_KEY_V1';
export const PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX =
  '0xaf86fef4216ac2bcd1c592b204011ad0d4e9ffac40246e76bb00b9031373d2c3';
export const PEG_IN_RUNTIME_PROCESSED_MAP_PREFIX_HEX =
  '0xaf86fef4216ac2bcd1c592b204011ad0e683c528c6fc8006645fa5989173f2e0';

const UINT32_MAX = 0xffff_ffff;
const UINT64_MAX = (1n << 64n) - 1n;
const ERGO_LONG_MAX = (1n << 63n) - 1n;

export interface PegInRuntimeProfileV1 {
  readonly formatVersion: typeof PEG_IN_RUNTIME_PROFILE_FORMAT_VERSION;
  readonly sidechainIdHex: string;
  readonly bridgeAddress: string;
  readonly profileRevision: string | number | bigint;
  readonly activationHeight: string | number | bigint;
}

export interface PegInRuntimeRecordV1 {
  readonly formatVersion: typeof PEG_IN_RUNTIME_RECORD_FORMAT_VERSION;
  readonly sidechainIdHex: string;
  readonly bridgeAddress: string;
  readonly profileRevision: string | number | bigint;
  readonly profileActivationHeight: string | number | bigint;
  readonly ergoBoxIdHex: string;
  readonly recipientAddress: string;
  readonly amountNanoErg: string | number | bigint;
  readonly sidechainHeight: string | number | bigint;
  readonly executionBlockHashHex: string;
  readonly transactionHashHex: string;
  readonly eventIndex: number;
}

export interface PegInRuntimeRecordIdentityV1 {
  readonly sidechainIdHex: string;
  readonly ergoBoxIdHex: string;
}

export function encodePegInRuntimeProfileV1ScaleHex(
  profile: PegInRuntimeProfileV1,
): string {
  requireVersion(
    profile.formatVersion,
    PEG_IN_RUNTIME_PROFILE_FORMAT_VERSION,
    'peg-in runtime profile format version',
  );
  const encoded = Buffer.concat([
    Buffer.from([profile.formatVersion]),
    fixedHexBytes(profile.sidechainIdHex, 32, 'peg-in runtime profile sidechain ID'),
    fixedHexBytes(profile.bridgeAddress, 20, 'peg-in runtime profile bridge address', true),
    uint64Le(profile.profileRevision, 'peg-in runtime profile revision', true),
    uint64Le(profile.activationHeight, 'peg-in runtime profile activation height'),
  ]);
  if (encoded.length !== PEG_IN_RUNTIME_PROFILE_V1_SCALE_BYTES) {
    throw new Error('peg-in runtime profile SCALE encoding length drifted');
  }
  return `0x${encoded.toString('hex')}`;
}

export function encodePegInRuntimeRecordV1ScaleHex(record: PegInRuntimeRecordV1): string {
  requireVersion(
    record.formatVersion,
    PEG_IN_RUNTIME_RECORD_FORMAT_VERSION,
    'peg-in runtime record format version',
  );
  const encoded = Buffer.concat([
    Buffer.from([record.formatVersion]),
    fixedHexBytes(record.sidechainIdHex, 32, 'peg-in runtime record sidechain ID'),
    fixedHexBytes(record.bridgeAddress, 20, 'peg-in runtime record bridge address', true),
    uint64Le(record.profileRevision, 'peg-in runtime record profile revision', true),
    uint64Le(
      record.profileActivationHeight,
      'peg-in runtime record profile activation height',
    ),
    fixedHexBytes(record.ergoBoxIdHex, 32, 'peg-in runtime record Ergo box ID', true),
    fixedHexBytes(record.recipientAddress, 20, 'peg-in runtime record recipient', true),
    ergoAmountLe(record.amountNanoErg, 'peg-in runtime record amount'),
    uint64Le(record.sidechainHeight, 'peg-in runtime record sidechain height'),
    fixedHexBytes(
      record.executionBlockHashHex,
      32,
      'peg-in runtime record execution block hash',
      true,
    ),
    fixedHexBytes(record.transactionHashHex, 32, 'peg-in runtime record transaction hash', true),
    uint32Le(record.eventIndex, 'peg-in runtime record event index'),
  ]);
  if (encoded.length !== PEG_IN_RUNTIME_RECORD_V1_SCALE_BYTES) {
    throw new Error('peg-in runtime record SCALE encoding length drifted');
  }
  return `0x${encoded.toString('hex')}`;
}

export function decodePegInRuntimeProfileV1ScaleHex(
  value: string,
): PegInRuntimeProfileV1 {
  const bytes = fixedScaleBytes(
    value,
    PEG_IN_RUNTIME_PROFILE_V1_SCALE_BYTES,
    'peg-in runtime profile SCALE value',
  );
  const profile: PegInRuntimeProfileV1 = {
    formatVersion: bytes[0] as typeof PEG_IN_RUNTIME_PROFILE_FORMAT_VERSION,
    sidechainIdHex: `0x${bytes.subarray(1, 33).toString('hex')}`,
    bridgeAddress: `0x${bytes.subarray(33, 53).toString('hex')}`,
    profileRevision: bytes.readBigUInt64LE(53).toString(),
    activationHeight: bytes.readBigUInt64LE(61).toString(),
  };
  if (encodePegInRuntimeProfileV1ScaleHex(profile) !== `0x${bytes.toString('hex')}`) {
    throw new Error('peg-in runtime profile SCALE value is not canonical V1');
  }
  return profile;
}

export function decodePegInRuntimeRecordV1ScaleHex(
  value: string,
): PegInRuntimeRecordV1 {
  const bytes = fixedScaleBytes(
    value,
    PEG_IN_RUNTIME_RECORD_V1_SCALE_BYTES,
    'peg-in runtime record SCALE value',
  );
  const record: PegInRuntimeRecordV1 = {
    formatVersion: bytes[0] as typeof PEG_IN_RUNTIME_RECORD_FORMAT_VERSION,
    sidechainIdHex: `0x${bytes.subarray(1, 33).toString('hex')}`,
    bridgeAddress: `0x${bytes.subarray(33, 53).toString('hex')}`,
    profileRevision: bytes.readBigUInt64LE(53).toString(),
    profileActivationHeight: bytes.readBigUInt64LE(61).toString(),
    ergoBoxIdHex: `0x${bytes.subarray(69, 101).toString('hex')}`,
    recipientAddress: `0x${bytes.subarray(101, 121).toString('hex')}`,
    amountNanoErg: bytes.readBigUInt64LE(121).toString(),
    sidechainHeight: bytes.readBigUInt64LE(129).toString(),
    executionBlockHashHex: `0x${bytes.subarray(137, 169).toString('hex')}`,
    transactionHashHex: `0x${bytes.subarray(169, 201).toString('hex')}`,
    eventIndex: bytes.readUInt32LE(201),
  };
  if (encodePegInRuntimeRecordV1ScaleHex(record) !== `0x${bytes.toString('hex')}`) {
    throw new Error('peg-in runtime record SCALE value is not canonical V1');
  }
  return record;
}

export function derivePegInRuntimeRecordKeyV1Hex(
  identity: PegInRuntimeRecordIdentityV1,
): string {
  const preimage = Buffer.concat([
    Buffer.from(PEG_IN_RUNTIME_RECORD_KEY_DOMAIN, 'ascii'),
    fixedHexBytes(identity.sidechainIdHex, 32, 'peg-in runtime record-key sidechain ID'),
    fixedHexBytes(identity.ergoBoxIdHex, 32, 'peg-in runtime record-key Ergo box ID', true),
  ]);
  return blake2bHex(preimage, 32);
}

export function deriveProcessedPegInRuntimeStorageKeyV1Hex(
  identity: PegInRuntimeRecordIdentityV1,
): string {
  const recordKey = fixedHexBytes(
    derivePegInRuntimeRecordKeyV1Hex(identity),
    32,
    'peg-in runtime derived record key',
  );
  const prefix = fixedHexBytes(
    PEG_IN_RUNTIME_PROCESSED_MAP_PREFIX_HEX,
    32,
    'peg-in runtime processed-map prefix',
  );
  return `0x${Buffer.concat([
    prefix,
    Buffer.from(blakejs.blake2b(recordKey, undefined, 16)),
    recordKey,
  ]).toString('hex')}`;
}

/** Same-generation codec conformance; not historical membership admission after rotation. */
export function assertPegInRuntimeRecordMatchesProfileGenerationV1(
  record: PegInRuntimeRecordV1,
  profile: PegInRuntimeProfileV1,
): void {
  encodePegInRuntimeRecordV1ScaleHex(record);
  encodePegInRuntimeProfileV1ScaleHex(profile);
  if (
    normalizeFixedHex(record.sidechainIdHex, 32, 'peg-in runtime record sidechain ID') !==
    normalizeFixedHex(profile.sidechainIdHex, 32, 'peg-in runtime profile sidechain ID')
  ) {
    throw new Error('peg-in runtime record sidechain ID does not match its profile generation');
  }
  if (
    normalizeFixedHex(record.bridgeAddress, 20, 'peg-in runtime record bridge address') !==
    normalizeFixedHex(profile.bridgeAddress, 20, 'peg-in runtime profile bridge address')
  ) {
    throw new Error('peg-in runtime record bridge address does not match its profile generation');
  }
  if (
    normalizeUint64(record.profileRevision, 'peg-in runtime record profile revision', true) !==
    normalizeUint64(profile.profileRevision, 'peg-in runtime profile revision', true)
  ) {
    throw new Error('peg-in runtime record revision does not match its profile generation');
  }
  if (
    normalizeUint64(
      record.profileActivationHeight,
      'peg-in runtime record profile activation height',
    ) !==
    normalizeUint64(profile.activationHeight, 'peg-in runtime profile activation height')
  ) {
    throw new Error(
      'peg-in runtime record activation height does not match its profile generation',
    );
  }
  if (
    normalizeUint64(record.sidechainHeight, 'peg-in runtime record sidechain height') <=
    normalizeUint64(profile.activationHeight, 'peg-in runtime profile activation height')
  ) {
    throw new Error('peg-in runtime record does not follow its profile activation block');
  }
}

function requireVersion(value: number, expected: number, label: string): void {
  if (value !== expected) {
    throw new Error(`${label} must be exactly ${expected}`);
  }
}

function uint32Le(value: number, label: string): Buffer {
  if (!Number.isSafeInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new Error(`${label} must be an integer between 0 and ${UINT32_MAX}`);
  }
  const encoded = Buffer.alloc(4);
  encoded.writeUInt32LE(value);
  return encoded;
}

function uint64Le(
  value: string | number | bigint,
  label: string,
  positive = false,
): Buffer {
  const normalized = normalizeUint64(value, label, positive);
  const encoded = Buffer.alloc(8);
  encoded.writeBigUInt64LE(normalized);
  return encoded;
}

function ergoAmountLe(value: string | number | bigint, label: string): Buffer {
  const normalized = normalizeUint64(value, label, true);
  if (normalized > ERGO_LONG_MAX) {
    throw new Error(`${label} must fit the positive Ergo Long range`);
  }
  const encoded = Buffer.alloc(8);
  encoded.writeBigUInt64LE(normalized);
  return encoded;
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
  if (normalized < 0n || normalized > UINT64_MAX || (positive && normalized === 0n)) {
    throw new Error(
      `${label} must be ${positive ? 'positive and ' : ''}between 0 and ${UINT64_MAX}`,
    );
  }
  return normalized;
}

function fixedHexBytes(value: string, bytes: number, label: string, nonzero = false): Buffer {
  const normalized = normalizeFixedHex(value, bytes, label);
  if (nonzero && /^0+$/.test(normalized)) {
    throw new Error(`${label} must not be zero`);
  }
  return Buffer.from(normalized, 'hex');
}

function fixedScaleBytes(value: string, bytes: number, label: string): Buffer {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/.test(value)) {
    throw new Error(`${label} must be lowercase 0x-prefixed hexadecimal bytes`);
  }
  if (value.length !== 2 + bytes * 2) {
    throw new Error(`${label} must be exactly ${bytes} bytes`);
  }
  return Buffer.from(value.slice(2), 'hex');
}

function normalizeFixedHex(value: string, bytes: number, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a hexadecimal string`);
  }
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (normalized.length !== bytes * 2 || !/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new Error(`${label} must be exactly ${bytes} bytes`);
  }
  return normalized.toLowerCase();
}

function blake2bHex(value: Buffer, bytes: number): string {
  return `0x${Buffer.from(blakejs.blake2b(value, undefined, bytes)).toString('hex')}`;
}
