import blakejs from 'blakejs';

import {
  ERGO_AUTOLYKOS_V2_RELAY_WITNESS_V1_SCHEMA,
  normalizeErgoAutolykosV2RelayWitnessV1,
  replayErgoAutolykosV2RelayWitnessV1,
  type ErgoAutolykosV2RelayBranchWitnessV1,
  type ErgoAutolykosV2RelayWitnessV1,
  type ErgoHeaderWitnessV1,
  type ReplayedErgoAutolykosV2RelayWitnessV1,
} from './ergo-autolykos-v2-relay-witness-v1.js';
import {
  computeErgoAutolykosV2SpvProfileId,
  evaluateErgoSpvBranchTargetDepth,
  selectHeavierErgoAutolykosV2Branch,
} from './ergo-autolykos-v2-spv-branch.js';
import {
  computeErgoHeaderId,
  parseErgoAutolykosV2HeaderIdentity,
  serializeErgoHeaderIdentity,
  type ErgoHeaderIdentityFields,
} from './ergo-header-id.js';

export const ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_FORMAT = 1 as const;
export const ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_MAX_BYTES =
  8 * 1024 * 1024;
export const ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_FAMILY_DOMAIN =
  'E2S_ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_FAMILY_V1' as const;
export const ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_ID_DOMAIN =
  'E2S_ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_ID_V1' as const;

const MAGIC = Buffer.from('E2SARW01', 'ascii');
const SECTION_COUNT = 4;
const FIXED_PREFIX_BYTES = 48;
const DIRECTORY_ENTRY_BYTES = 6;
const ENVELOPE_HEADER_BYTES =
  FIXED_PREFIX_BYTES + (SECTION_COUNT * DIRECTORY_ENTRY_BYTES);
const PROFILE_SECTION = 1;
const CHECKPOINT_SECTION = 2;
const BRANCHES_SECTION = 3;
const TARGET_SECTION = 4;
const PROFILE_SECTION_BYTES = 225;
const MAX_BRANCHES = 32;
const MAX_HEADERS_PER_BRANCH = 512;
const MAX_DIFFICULTY_CONTEXT_HEADERS = 512;
const MAX_CANONICAL_HEADER_BYTES = 4_096;
const MAX_U16 = 0xffff;
const MAX_U32 = 0xffff_ffff;
const MAX_U64 = 0xffff_ffff_ffff_ffffn;
const MAX_U256 = (1n << 256n) - 1n;

export const ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_FAMILY_ID_HEX =
  blake2b256(Buffer.from(
    ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_FAMILY_DOMAIN,
    'ascii',
  )).toString('hex');

/**
 * Encodes the proof-core relay witness into bytes suitable for cross-language
 * runtime verification. This is intentionally distinct from the durable JSON
 * recovery packet and does not carry transaction or box semantics.
 */
export function encodeErgoAutolykosV2RelayRuntimeWitnessV1(
  value: unknown,
): Buffer {
  const witness = normalizeErgoAutolykosV2RelayWitnessV1(value);
  const replayed = assertRuntimeRelaySelection(witness);
  return encodeCanonicalRuntimeWitness(
    witness,
    computeErgoAutolykosV2SpvProfileId(replayed.profile).toString('hex'),
  );
}

function encodeCanonicalRuntimeWitness(
  witness: Readonly<ErgoAutolykosV2RelayWitnessV1>,
  spvProfileIdHex: string,
): Buffer {
  const sections = [
    encodeProfile(witness, spvProfileIdHex),
    encodeCheckpoint(witness),
    encodeBranches(witness),
    encodeTarget(witness),
  ];
  const totalLength = ENVELOPE_HEADER_BYTES + sections.reduce(
    (total, section) => total + section.length,
    0,
  );
  if (totalLength > ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_MAX_BYTES) {
    throw new Error(
      `Ergo relay runtime witness exceeds ${ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_MAX_BYTES} bytes`,
    );
  }

  const writer = new BinaryWriter();
  writer.bytes(MAGIC);
  writer.u8(ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_FORMAT);
  writer.u8(0);
  writer.u16(SECTION_COUNT);
  writer.u32(totalLength);
  writer.bytes(Buffer.from(
    ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
    'hex',
  ));
  for (let index = 0; index < sections.length; index += 1) {
    writer.u8(index + 1);
    writer.u8(0);
    writer.u32(sections[index]!.length);
  }
  for (const section of sections) writer.bytes(section);
  const encoded = writer.finish();
  if (encoded.length !== totalLength) {
    throw new Error('Ergo relay runtime witness length accounting failed');
  }
  return encoded;
}

export function decodeErgoAutolykosV2RelayRuntimeWitnessV1(
  value: Uint8Array,
  expectedSpvProfileIdHex: string,
): Readonly<ErgoAutolykosV2RelayWitnessV1> {
  const bytes = exactWitnessBytes(value);
  const expectedSpvProfileId = exactLowerHex(
    expectedSpvProfileIdHex,
    32,
    'expected SPV profile ID',
  );
  const reader = new BinaryReader(bytes);
  if (!reader.bytes(MAGIC.length, 'magic').equals(MAGIC)) {
    throw new Error('Ergo relay runtime witness magic is unsupported');
  }
  if (reader.u8('format') !== ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_FORMAT) {
    throw new Error('Ergo relay runtime witness format is unsupported');
  }
  if (reader.u8('flags') !== 0) {
    throw new Error('Ergo relay runtime witness flags are unsupported');
  }
  if (reader.u16('section count') !== SECTION_COUNT) {
    throw new Error('Ergo relay runtime witness section count is unsupported');
  }
  if (reader.u32('total length') !== bytes.length) {
    throw new Error('Ergo relay runtime witness total length is inconsistent');
  }
  const familyId = reader.bytes(32, 'format-family ID');
  if (
    familyId.toString('hex')
    !== ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_FAMILY_ID_HEX
  ) {
    throw new Error('Ergo relay runtime witness format-family ID is unsupported');
  }

  const sectionLengths: number[] = [];
  for (let sectionId = 1; sectionId <= SECTION_COUNT; sectionId += 1) {
    if (reader.u8(`section ${sectionId} ID`) !== sectionId) {
      throw new Error('Ergo relay runtime witness section order is unsupported');
    }
    if (reader.u8(`section ${sectionId} flags`) !== 0) {
      throw new Error('Ergo relay runtime witness section flags are unsupported');
    }
    sectionLengths.push(reader.u32(`section ${sectionId} length`));
  }
  const payloadLength = sectionLengths.reduce(
    (total, length) => total + length,
    0,
  );
  if (payloadLength !== bytes.length - ENVELOPE_HEADER_BYTES) {
    throw new Error('Ergo relay runtime witness section lengths are inconsistent');
  }

  const profileSection = decodeProfile(reader.section(
    sectionLengths[PROFILE_SECTION - 1]!,
    'profile section',
  ));
  const checkpoint = decodeCheckpoint(reader.section(
    sectionLengths[CHECKPOINT_SECTION - 1]!,
    'checkpoint section',
  ));
  const branches = decodeBranches(reader.section(
    sectionLengths[BRANCHES_SECTION - 1]!,
    'branches section',
  ));
  const targetHeader = decodeTarget(reader.section(
    sectionLengths[TARGET_SECTION - 1]!,
    'target section',
  ));
  reader.end('Ergo relay runtime witness');

  const witness = normalizeErgoAutolykosV2RelayWitnessV1({
    schema: ERGO_AUTOLYKOS_V2_RELAY_WITNESS_V1_SCHEMA,
    profile: profileSection.profile,
    checkpoint,
    branches,
    targetHeader,
  });
  const replayed = assertRuntimeRelaySelection(witness);
  const actualSpvProfileIdHex = computeErgoAutolykosV2SpvProfileId(
    replayed.profile,
  ).toString('hex');
  if (profileSection.spvProfileIdHex !== actualSpvProfileIdHex) {
    throw new Error('Ergo relay runtime witness SPV profile ID is inconsistent');
  }
  if (actualSpvProfileIdHex !== expectedSpvProfileId) {
    throw new Error('Ergo relay runtime witness SPV profile is not statically registered');
  }
  if (!encodeCanonicalRuntimeWitness(
    witness,
    actualSpvProfileIdHex,
  ).equals(bytes)) {
    throw new Error('Ergo relay runtime witness is not canonically encoded');
  }
  return witness;
}

export function deriveErgoAutolykosV2RelayRuntimeWitnessIdV1Hex(
  value: Uint8Array,
  expectedSpvProfileIdHex: string,
): string {
  const bytes = exactWitnessBytes(value);
  decodeErgoAutolykosV2RelayRuntimeWitnessV1(
    bytes,
    expectedSpvProfileIdHex,
  );
  return blake2b256(Buffer.concat([
    Buffer.from(ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_ID_DOMAIN, 'ascii'),
    bytes,
  ])).toString('hex');
}

function encodeProfile(
  witness: Readonly<ErgoAutolykosV2RelayWitnessV1>,
  spvProfileIdHex: string,
): Buffer {
  const { profile } = witness;
  const writer = new BinaryWriter();
  writer.hex(spvProfileIdHex, 32, 'SPV profile ID');
  writer.hex(profile.sourceNetworkIdHex, 32, 'source network ID');
  writer.hex(profile.checkpointHeaderIdHex, 32, 'checkpoint header ID');
  writer.hex(
    profile.checkpointDifficultyContextDigestHex,
    32,
    'checkpoint difficulty-context digest',
  );
  writer.u256(decimal(profile.checkpointCumulativeWork, 'checkpoint work'));
  writer.u8(profile.expectedHeaderVersion);
  writer.u32(profile.difficulty.activationHeight);
  writer.u32(profile.difficulty.epochLength);
  writer.u32(profile.difficulty.useLastEpochs);
  writer.u64(decimal(
    profile.difficulty.desiredBlockIntervalMs,
    'desired block interval',
  ));
  writer.u256(decimal(
    profile.difficulty.initialDifficulty,
    'initial difficulty',
  ));
  writer.u16(profile.requiredConfirmations);
  writer.u16(profile.maximumHeaders);
  writer.u64(decimal(profile.maximumFutureDriftMs, 'maximum future drift'));
  const section = writer.finish();
  if (section.length !== PROFILE_SECTION_BYTES) {
    throw new Error('Ergo relay runtime profile section length is invalid');
  }
  return section;
}

function assertRuntimeRelaySelection(
  witness: Readonly<ErgoAutolykosV2RelayWitnessV1>,
): ReplayedErgoAutolykosV2RelayWitnessV1 {
  const replayed = replayErgoAutolykosV2RelayWitnessV1(witness);
  const currentTip = replayed.currentBranch.headers.at(-1)!.headerId
    .toString('hex');
  const seenTips = new Set<string>([currentTip]);
  let previousCompetingTip: string | null = null;
  for (const competing of replayed.competingBranches) {
    const competingTip = competing.headers.at(-1)!.headerId.toString('hex');
    if (seenTips.has(competingTip)) {
      throw new Error('Ergo relay runtime witness contains a duplicate branch tip');
    }
    if (
      previousCompetingTip !== null
      && competingTip <= previousCompetingTip
    ) {
      throw new Error(
        'Ergo relay runtime competing branches are not ordered by tip ID',
      );
    }
    seenTips.add(competingTip);
    previousCompetingTip = competingTip;
    if (
      selectHeavierErgoAutolykosV2Branch(
        replayed.currentBranch,
        competing,
      ) !== replayed.currentBranch
    ) {
      throw new Error(
        'Ergo relay runtime current branch is not greatest-work among supplied branches',
      );
    }
  }
  const targetDepth = evaluateErgoSpvBranchTargetDepth(
    replayed.currentBranch,
    computeErgoHeaderId(replayed.targetHeader),
  );
  if (!targetDepth.included || !targetDepth.depthSatisfied) {
    throw new Error(
      'Ergo relay runtime target is absent or below required depth in the current branch',
    );
  }
  return replayed;
}

function decodeProfile(reader: BinaryReader): Readonly<{
  spvProfileIdHex: string;
  profile: ErgoAutolykosV2RelayWitnessV1['profile'];
}> {
  if (reader.length !== PROFILE_SECTION_BYTES) {
    throw new Error('Ergo relay runtime profile section length is invalid');
  }
  const spvProfileIdHex = reader.bytes(32, 'SPV profile ID').toString('hex');
  const profile = {
    sourceNetworkIdHex: reader.bytes(32, 'source network ID').toString('hex'),
    checkpointHeaderIdHex:
      reader.bytes(32, 'checkpoint header ID').toString('hex'),
    checkpointDifficultyContextDigestHex: reader
      .bytes(32, 'checkpoint difficulty-context digest')
      .toString('hex'),
    checkpointCumulativeWork: reader.u256('checkpoint cumulative work').toString(),
    expectedHeaderVersion: reader.u8('expected header version'),
    difficulty: {
      activationHeight: reader.u32('difficulty activation height'),
      epochLength: reader.u32('difficulty epoch length'),
      useLastEpochs: reader.u32('difficulty retained epochs'),
      desiredBlockIntervalMs:
        reader.u64('desired block interval').toString(),
      initialDifficulty: reader.u256('initial difficulty').toString(),
    },
    requiredConfirmations: reader.u16('required confirmations'),
    maximumHeaders: reader.u16('maximum branch headers'),
    maximumFutureDriftMs: reader.u64('maximum future drift').toString(),
  };
  reader.end('Ergo relay runtime profile section');
  return { spvProfileIdHex, profile };
}

function encodeCheckpoint(witness: ErgoAutolykosV2RelayWitnessV1): Buffer {
  const writer = new BinaryWriter();
  writer.hex(
    witness.checkpoint.sourceNetworkIdHex,
    32,
    'checkpoint source network ID',
  );
  writer.header(headerIdentity(witness.checkpoint.header));
  writer.u16(witness.checkpoint.difficultyContext.length);
  for (const entry of witness.checkpoint.difficultyContext) {
    writer.u32(entry.height);
    writer.u64(decimal(entry.timestamp, 'difficulty-context timestamp'));
    writer.u32(entry.nBits);
  }
  return writer.finish();
}

function decodeCheckpoint(reader: BinaryReader): ErgoAutolykosV2RelayWitnessV1['checkpoint'] {
  const sourceNetworkIdHex = reader
    .bytes(32, 'checkpoint source network ID')
    .toString('hex');
  const header = headerWitness(reader.header('checkpoint header'));
  const count = reader.u16('difficulty-context count');
  if (count > MAX_DIFFICULTY_CONTEXT_HEADERS) {
    throw new Error('Ergo relay runtime difficulty context exceeds its bound');
  }
  const difficultyContext = Array.from({ length: count }, (_, index) => ({
    height: reader.u32(`difficulty-context ${index} height`),
    timestamp: reader.u64(`difficulty-context ${index} timestamp`).toString(),
    nBits: reader.u32(`difficulty-context ${index} nBits`),
  }));
  reader.end('Ergo relay runtime checkpoint section');
  return { sourceNetworkIdHex, header, difficultyContext };
}

function encodeBranches(witness: ErgoAutolykosV2RelayWitnessV1): Buffer {
  const writer = new BinaryWriter();
  writer.u8(witness.branches.length);
  for (const branch of witness.branches) {
    writer.u8(branch.role === 'current' ? 0 : 1);
    writer.u64(decimal(branch.observedAtTimestamp, 'branch observation timestamp'));
    writer.u16(branch.suffix.length);
    for (const header of branch.suffix) writer.header(headerIdentity(header));
  }
  return writer.finish();
}

function decodeBranches(reader: BinaryReader): readonly ErgoAutolykosV2RelayBranchWitnessV1[] {
  const count = reader.u8('branch count');
  if (count === 0 || count > MAX_BRANCHES) {
    throw new Error('Ergo relay runtime branch count is invalid');
  }
  const branches = Array.from({ length: count }, (_, branchIndex) => {
    const roleValue = reader.u8(`branch ${branchIndex} role`);
    if (roleValue > 1) {
      throw new Error(`Ergo relay runtime branch ${branchIndex} role is unsupported`);
    }
    const observedAtTimestamp = reader
      .u64(`branch ${branchIndex} observation timestamp`)
      .toString();
    const headerCount = reader.u16(`branch ${branchIndex} header count`);
    if (headerCount === 0 || headerCount > MAX_HEADERS_PER_BRANCH) {
      throw new Error(`Ergo relay runtime branch ${branchIndex} header count is invalid`);
    }
    const suffix = Array.from({ length: headerCount }, (_, headerIndex) =>
      headerWitness(reader.header(`branch ${branchIndex} header ${headerIndex}`))
    );
    return {
      role: roleValue === 0 ? 'current' as const : 'competing' as const,
      observedAtTimestamp,
      suffix,
    };
  });
  reader.end('Ergo relay runtime branches section');
  return branches;
}

function encodeTarget(witness: ErgoAutolykosV2RelayWitnessV1): Buffer {
  const writer = new BinaryWriter();
  writer.header(headerIdentity(witness.targetHeader));
  return writer.finish();
}

function decodeTarget(reader: BinaryReader): ErgoHeaderWitnessV1 {
  const header = headerWitness(reader.header('target header'));
  reader.end('Ergo relay runtime target section');
  return header;
}

function headerIdentity(value: ErgoHeaderWitnessV1): ErgoHeaderIdentityFields {
  return {
    version: value.version,
    parentId: Buffer.from(value.parentIdHex, 'hex'),
    adProofsRoot: Buffer.from(value.adProofsRootHex, 'hex'),
    stateRoot: Buffer.from(value.stateRootHex, 'hex'),
    transactionsRoot: Buffer.from(value.transactionsRootHex, 'hex'),
    timestamp: BigInt(value.timestamp),
    nBits: value.nBits,
    height: value.height,
    extensionHash: Buffer.from(value.extensionHashHex, 'hex'),
    votes: Buffer.from(value.votesHex, 'hex'),
    unparsedBytes: Buffer.from(value.unparsedBytesHex, 'hex'),
    powSolution: {
      publicKey: Buffer.from(value.powSolution.publicKeyHex, 'hex'),
      nonce: Buffer.from(value.powSolution.nonceHex, 'hex'),
    },
  };
}

function headerWitness(value: ErgoHeaderIdentityFields): ErgoHeaderWitnessV1 {
  return {
    version: value.version,
    parentIdHex: Buffer.from(value.parentId).toString('hex'),
    adProofsRootHex: Buffer.from(value.adProofsRoot).toString('hex'),
    stateRootHex: Buffer.from(value.stateRoot).toString('hex'),
    transactionsRootHex: Buffer.from(value.transactionsRoot).toString('hex'),
    timestamp: value.timestamp.toString(),
    nBits: value.nBits,
    height: value.height,
    extensionHashHex: Buffer.from(value.extensionHash).toString('hex'),
    votesHex: Buffer.from(value.votes).toString('hex'),
    unparsedBytesHex: Buffer.from(value.unparsedBytes ?? []).toString('hex'),
    powSolution: {
      publicKeyHex: Buffer.from(value.powSolution.publicKey).toString('hex'),
      nonceHex: Buffer.from(value.powSolution.nonce).toString('hex'),
      oneTimePublicKeyHex: null,
      distance: null,
    },
  };
}

class BinaryWriter {
  private readonly chunks: Buffer[] = [];

  bytes(value: Uint8Array): void {
    this.chunks.push(Buffer.from(value));
  }

  hex(value: string, length: number, label: string): void {
    if (!new RegExp(`^[0-9a-f]{${length * 2}}$`).test(value)) {
      throw new Error(`${label} must be exactly ${length} lowercase hex bytes`);
    }
    this.bytes(Buffer.from(value, 'hex'));
  }

  u8(value: number): void {
    this.integer(value, 0xff, 1, 'UInt8');
  }

  u16(value: number): void {
    this.integer(value, MAX_U16, 2, 'UInt16');
  }

  u32(value: number): void {
    this.integer(value, MAX_U32, 4, 'UInt32');
  }

  u64(value: bigint): void {
    if (value < 0n || value > MAX_U64) {
      throw new Error('UInt64 value is out of range');
    }
    const bytes = Buffer.alloc(8);
    bytes.writeBigUInt64BE(value);
    this.bytes(bytes);
  }

  u256(value: bigint): void {
    if (value < 0n || value > MAX_U256) {
      throw new Error('UInt256 value is out of range');
    }
    this.bytes(Buffer.from(value.toString(16).padStart(64, '0'), 'hex'));
  }

  header(value: ErgoHeaderIdentityFields): void {
    const bytes = serializeErgoHeaderIdentity(value);
    if (bytes.length === 0 || bytes.length > MAX_CANONICAL_HEADER_BYTES) {
      throw new Error('canonical Ergo header length is outside the runtime bound');
    }
    this.u16(bytes.length);
    this.bytes(bytes);
  }

  finish(): Buffer {
    return Buffer.concat(this.chunks);
  }

  private integer(
    value: number,
    maximum: number,
    bytes: number,
    label: string,
  ): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
      throw new Error(`${label} value is out of range`);
    }
    const encoded = Buffer.alloc(bytes);
    if (bytes === 1) encoded.writeUInt8(value);
    else if (bytes === 2) encoded.writeUInt16BE(value);
    else encoded.writeUInt32BE(value);
    this.bytes(encoded);
  }
}

class BinaryReader {
  private offset = 0;

  readonly length: number;

  constructor(private readonly source: Buffer) {
    this.length = source.length;
  }

  bytes(length: number, label: string): Buffer {
    if (
      !Number.isSafeInteger(length)
      || length < 0
      || this.offset + length > this.source.length
    ) {
      throw new Error(`${label} exceeds the Ergo relay runtime witness boundary`);
    }
    const result = Buffer.from(
      this.source.subarray(this.offset, this.offset + length),
    );
    this.offset += length;
    return result;
  }

  u8(label: string): number {
    return this.bytes(1, label).readUInt8(0);
  }

  u16(label: string): number {
    return this.bytes(2, label).readUInt16BE(0);
  }

  u32(label: string): number {
    return this.bytes(4, label).readUInt32BE(0);
  }

  u64(label: string): bigint {
    return this.bytes(8, label).readBigUInt64BE(0);
  }

  u256(label: string): bigint {
    const bytes = this.bytes(32, label);
    return BigInt(`0x${bytes.toString('hex')}`);
  }

  header(label: string): ErgoHeaderIdentityFields {
    const length = this.u16(`${label} length`);
    if (length === 0 || length > MAX_CANONICAL_HEADER_BYTES) {
      throw new Error(`${label} length is outside the runtime bound`);
    }
    return parseErgoAutolykosV2HeaderIdentity(this.bytes(length, label));
  }

  section(length: number, label: string): BinaryReader {
    return new BinaryReader(this.bytes(length, label));
  }

  end(label: string): void {
    if (this.offset !== this.source.length) {
      throw new Error(`${label} contains trailing bytes`);
    }
  }
}

function exactWitnessBytes(value: Uint8Array): Buffer {
  if (!(value instanceof Uint8Array)) {
    throw new Error('Ergo relay runtime witness must be bytes');
  }
  const bytes = Buffer.from(value);
  if (
    bytes.length < ENVELOPE_HEADER_BYTES
    || bytes.length > ERGO_AUTOLYKOS_V2_RELAY_RUNTIME_WITNESS_V1_MAX_BYTES
  ) {
    throw new Error('Ergo relay runtime witness length is outside its bound');
  }
  return bytes;
}

function decimal(value: string, label: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be canonical unsigned decimal`);
  }
  return BigInt(value);
}

function exactLowerHex(value: string, bytes: number, label: string): string {
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be exactly ${bytes} lowercase hex bytes`);
  }
  return value;
}

function blake2b256(value: Uint8Array): Buffer {
  return Buffer.from(blakejs.blake2b(value, undefined, 32));
}
