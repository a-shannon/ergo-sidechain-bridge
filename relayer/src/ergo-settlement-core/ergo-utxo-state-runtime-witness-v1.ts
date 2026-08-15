import blakejs from 'blakejs';

import { sha256Bytes } from './strict-json.js';

export const ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_FORMAT = 1 as const;
export const ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_SCHEMA =
  'e2s.ergo-utxo-state-runtime-witness.v1' as const;
export const ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_FAMILY_DOMAIN =
  'E2S_ERGO_UTXO_STATE_RUNTIME_WITNESS_FAMILY_V1' as const;
export const ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_ID_DOMAIN =
  'E2S_ERGO_UTXO_STATE_RUNTIME_WITNESS_ID_V1' as const;
export const ERGO_UTXO_STATE_RUNTIME_VERIFIER_PROFILE_V1_DOMAIN =
  'E2S_ERGO_UTXO_STATE_RUNTIME_VERIFIER_PROFILE_V1' as const;

const MAGIC = Buffer.from('E2UTXW01', 'ascii');
const SECTION_COUNT = 2;
const ENVELOPE_HEADER_BYTES = 60;
const BINDING_SECTION = 1;
const PROOF_SECTION = 2;
const DIGEST_BYTES = 32;
const STATE_ROOT_BYTES = 33;
const KEY_BYTES = 32;
const MAX_VALUE_BYTES = 4 * 1024;
const MAX_PROOF_BYTES = 16 * 1024;
const MAX_WITNESS_BYTES = ENVELOPE_HEADER_BYTES + 137
  + MAX_VALUE_BYTES + MAX_PROOF_BYTES;
const KEY_LENGTH = 32;
const OPERATION_COUNT = 2;
const MEMBERSHIP_OPERATION = 1;
const NON_MEMBERSHIP_OPERATION = 2;
const INTERNAL_LEFT_HIGHER = 0xff;
const INTERNAL_BALANCED = 0;
const INTERNAL_RIGHT_HIGHER = 1;
const LEAF_TAG = 2;
const LABEL_TAG = 3;
const END_TAG = 4;

export const ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_FAMILY_ID_HEX =
  blake2b256(Buffer.from(
    ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_FAMILY_DOMAIN,
    'ascii',
  )).toString('hex');

export const ERGO_UTXO_STATE_RUNTIME_VERIFIER_PROFILE_V1_ID_HEX =
  blake2b256(Buffer.from(
    ERGO_UTXO_STATE_RUNTIME_VERIFIER_PROFILE_V1_DOMAIN,
    'ascii',
  )).toString('hex');

export interface ErgoUtxoStateRuntimeWitnessInputV1 {
  readonly stateRootHex: string;
  readonly vaultBoxIdHex: string;
  readonly refundableSourceBoxIdHex: string;
  readonly expectedVaultBoxHex: string;
  readonly proofHex: string;
}

export interface VerifiedErgoUtxoStateRuntimeWitnessV1 {
  readonly schema: typeof ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_SCHEMA;
  readonly status: 'NON_AUTHORIZING_ERGO_UTXO_RUNTIME_WITNESS_VERIFIED';
  readonly formatVersion: typeof ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_FORMAT;
  readonly formatFamilyIdHex: string;
  readonly verifierProfileIdHex: string;
  readonly witnessIdHex: string;
  readonly stateRootHex: string;
  readonly vaultBoxIdHex: string;
  readonly refundableSourceBoxIdHex: string;
  readonly expectedVaultBoxHex: string;
  readonly expectedVaultBoxLength: number;
  readonly expectedVaultBoxSha256Hex: string;
  readonly proofHex: string;
  readonly proofLength: number;
  readonly proofSha256Hex: string;
  readonly authority: Readonly<{
    stateRootConsensusAuthenticated: false;
    currentUtxoMembershipEstablished: false;
    runtimeAdmissionAuthorized: false;
    mintAuthorized: false;
    fundsAuthorityEstablished: false;
    gate5Closed: false;
    productionReady: false;
  }>;
}

type FramedNode = Readonly<
  | { kind: 'label'; label: Buffer }
  | { kind: 'leaf'; key: Buffer; nextKey: Buffer; value: Buffer; label: Buffer }
  | {
    kind: 'internal';
    balance: number;
    left: FramedNode;
    right: FramedNode;
    label: Buffer;
  }
>;

interface NormalizedWitness {
  readonly stateRoot: Buffer;
  readonly vaultBoxId: Buffer;
  readonly refundableSourceBoxId: Buffer;
  readonly expectedVaultBox: Buffer;
  readonly proof: Buffer;
}

export function encodeErgoUtxoStateRuntimeWitnessV1(
  value: ErgoUtxoStateRuntimeWitnessInputV1,
): Buffer {
  const witness = normalizeWitness(value);
  validateProofAndBindings(witness);
  const binding = Buffer.concat([
    Buffer.from(ERGO_UTXO_STATE_RUNTIME_VERIFIER_PROFILE_V1_ID_HEX, 'hex'),
    witness.stateRoot,
    Buffer.from([
      KEY_LENGTH,
      OPERATION_COUNT,
      MEMBERSHIP_OPERATION,
      NON_MEMBERSHIP_OPERATION,
    ]),
    witness.vaultBoxId,
    witness.refundableSourceBoxId,
    u32(witness.expectedVaultBox.length),
    witness.expectedVaultBox,
  ]);
  const totalLength = ENVELOPE_HEADER_BYTES + binding.length + witness.proof.length;
  if (totalLength > MAX_WITNESS_BYTES) {
    throw new Error('Ergo UTXO runtime witness exceeds its byte bound');
  }
  return Buffer.concat([
    MAGIC,
    Buffer.from([
      ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_FORMAT,
      0,
    ]),
    u16(SECTION_COUNT),
    u32(totalLength),
    Buffer.from(ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_FAMILY_ID_HEX, 'hex'),
    Buffer.from([BINDING_SECTION, 0]),
    u32(binding.length),
    Buffer.from([PROOF_SECTION, 0]),
    u32(witness.proof.length),
    binding,
    witness.proof,
  ]);
}

export function decodeErgoUtxoStateRuntimeWitnessV1(
  value: Uint8Array,
): Readonly<VerifiedErgoUtxoStateRuntimeWitnessV1> {
  const bytes = exactBytes(value, 'Ergo UTXO runtime witness');
  if (bytes.length < ENVELOPE_HEADER_BYTES || bytes.length > MAX_WITNESS_BYTES) {
    throw new Error('Ergo UTXO runtime witness length is outside its bound');
  }
  const reader = new BinaryReader(bytes);
  if (!reader.bytes(MAGIC.length, 'magic').equals(MAGIC)) {
    throw new Error('Ergo UTXO runtime witness magic is unsupported');
  }
  if (reader.u8('format') !== ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_FORMAT) {
    throw new Error('Ergo UTXO runtime witness format is unsupported');
  }
  if (reader.u8('flags') !== 0 || reader.u16('section count') !== SECTION_COUNT) {
    throw new Error('Ergo UTXO runtime witness envelope shape is unsupported');
  }
  if (reader.u32('total length') !== bytes.length) {
    throw new Error('Ergo UTXO runtime witness total length is inconsistent');
  }
  if (
    reader.bytes(DIGEST_BYTES, 'format-family ID').toString('hex')
      !== ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_FAMILY_ID_HEX
  ) {
    throw new Error('Ergo UTXO runtime witness format-family ID is unsupported');
  }
  const bindingLength = sectionLength(reader, BINDING_SECTION);
  const proofLength = sectionLength(reader, PROOF_SECTION);
  if (bindingLength + proofLength !== bytes.length - ENVELOPE_HEADER_BYTES) {
    throw new Error('Ergo UTXO runtime witness section lengths are inconsistent');
  }
  const binding = reader.section(bindingLength, 'binding section');
  const verifierProfileId = binding.bytes(DIGEST_BYTES, 'verifier profile ID');
  if (
    verifierProfileId.toString('hex')
      !== ERGO_UTXO_STATE_RUNTIME_VERIFIER_PROFILE_V1_ID_HEX
  ) {
    throw new Error('Ergo UTXO runtime verifier profile is not statically registered');
  }
  const stateRoot = binding.bytes(STATE_ROOT_BYTES, 'state root');
  if (
    binding.u8('key length') !== KEY_LENGTH
    || binding.u8('operation count') !== OPERATION_COUNT
    || binding.u8('membership operation') !== MEMBERSHIP_OPERATION
    || binding.u8('non-membership operation') !== NON_MEMBERSHIP_OPERATION
  ) {
    throw new Error('Ergo UTXO runtime lookup profile is unsupported');
  }
  const vaultBoxId = binding.bytes(KEY_BYTES, 'vault box ID');
  const refundableSourceBoxId = binding.bytes(KEY_BYTES, 'refundable source box ID');
  const valueLength = binding.u32('expected vault box length');
  if (valueLength === 0 || valueLength > MAX_VALUE_BYTES) {
    throw new Error('Ergo UTXO runtime expected vault box length is outside its bound');
  }
  const expectedVaultBox = binding.bytes(valueLength, 'expected vault box');
  binding.end('Ergo UTXO runtime binding section');
  const proof = reader.bytes(proofLength, 'lookup proof');
  reader.end('Ergo UTXO runtime witness');
  const witness = {
    stateRoot,
    vaultBoxId,
    refundableSourceBoxId,
    expectedVaultBox,
    proof,
  };
  validateProofAndBindings(witness);
  const canonical = encodeErgoUtxoStateRuntimeWitnessV1({
    stateRootHex: stateRoot.toString('hex'),
    vaultBoxIdHex: vaultBoxId.toString('hex'),
    refundableSourceBoxIdHex: refundableSourceBoxId.toString('hex'),
    expectedVaultBoxHex: expectedVaultBox.toString('hex'),
    proofHex: proof.toString('hex'),
  });
  if (!canonical.equals(bytes)) {
    throw new Error('Ergo UTXO runtime witness is not canonically encoded');
  }
  return deepFreeze({
    schema: ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_SCHEMA,
    status: 'NON_AUTHORIZING_ERGO_UTXO_RUNTIME_WITNESS_VERIFIED' as const,
    formatVersion: ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_FORMAT,
    formatFamilyIdHex: ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_FAMILY_ID_HEX,
    verifierProfileIdHex:
      ERGO_UTXO_STATE_RUNTIME_VERIFIER_PROFILE_V1_ID_HEX,
    witnessIdHex: deriveErgoUtxoStateRuntimeWitnessIdV1Hex(bytes),
    stateRootHex: stateRoot.toString('hex'),
    vaultBoxIdHex: vaultBoxId.toString('hex'),
    refundableSourceBoxIdHex: refundableSourceBoxId.toString('hex'),
    expectedVaultBoxHex: expectedVaultBox.toString('hex'),
    expectedVaultBoxLength: expectedVaultBox.length,
    expectedVaultBoxSha256Hex: sha256Bytes(expectedVaultBox),
    proofHex: proof.toString('hex'),
    proofLength: proof.length,
    proofSha256Hex: sha256Bytes(proof),
    authority: {
      stateRootConsensusAuthenticated: false as const,
      currentUtxoMembershipEstablished: false as const,
      runtimeAdmissionAuthorized: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
  });
}

export function deriveErgoUtxoStateRuntimeWitnessIdV1Hex(
  value: Uint8Array,
): string {
  const bytes = exactBytes(value, 'Ergo UTXO runtime witness');
  if (bytes.length < ENVELOPE_HEADER_BYTES || bytes.length > MAX_WITNESS_BYTES) {
    throw new Error('Ergo UTXO runtime witness length is outside its bound');
  }
  return blake2b256(Buffer.concat([
    Buffer.from(ERGO_UTXO_STATE_RUNTIME_WITNESS_V1_ID_DOMAIN, 'ascii'),
    bytes,
  ])).toString('hex');
}

function normalizeWitness(value: unknown): NormalizedWitness {
  const raw = exactDataObject(value, [
    'stateRootHex',
    'vaultBoxIdHex',
    'refundableSourceBoxIdHex',
    'expectedVaultBoxHex',
    'proofHex',
  ], 'Ergo UTXO runtime witness input');
  const expectedVaultBox = exactHex(raw.expectedVaultBoxHex, undefined, 'expected vault box');
  if (expectedVaultBox.length === 0 || expectedVaultBox.length > MAX_VALUE_BYTES) {
    throw new Error('Ergo UTXO runtime expected vault box length is outside its bound');
  }
  const proof = exactHex(raw.proofHex, undefined, 'lookup proof');
  if (proof.length === 0 || proof.length > MAX_PROOF_BYTES) {
    throw new Error('Ergo UTXO runtime proof length is outside its bound');
  }
  return {
    stateRoot: exactHex(raw.stateRootHex, STATE_ROOT_BYTES, 'state root'),
    vaultBoxId: exactHex(raw.vaultBoxIdHex, KEY_BYTES, 'vault box ID'),
    refundableSourceBoxId: exactHex(
      raw.refundableSourceBoxIdHex,
      KEY_BYTES,
      'refundable source box ID',
    ),
    expectedVaultBox,
    proof,
  };
}

function validateProofAndBindings(witness: NormalizedWitness): void {
  if (witness.vaultBoxId.equals(witness.refundableSourceBoxId)) {
    throw new Error('Ergo UTXO runtime lookup keys must be distinct');
  }
  for (const [label, key] of [
    ['vault', witness.vaultBoxId],
    ['refundable source', witness.refundableSourceBoxId],
  ] as const) {
    if (isUniform(key, 0) || isUniform(key, 0xff)) {
      throw new Error(`Ergo UTXO runtime ${label} key is outside the AVL key domain`);
    }
  }
  if (!blake2b256(witness.expectedVaultBox).equals(witness.vaultBoxId)) {
    throw new Error('Ergo UTXO runtime vault bytes do not derive the vault box ID');
  }
  const { root, directionStart } = parseProofTree(
    witness.proof,
    witness.stateRoot[STATE_ROOT_BYTES - 1]!,
  );
  if (!root.label.equals(witness.stateRoot.subarray(0, DIGEST_BYTES))) {
    throw new Error('Ergo UTXO runtime proof root disagrees with the state root');
  }
  let directionBit = 0;
  directionBit = consumeLookup(
    root,
    witness.vaultBoxId,
    'membership',
    witness.expectedVaultBox,
    witness.proof,
    directionStart,
    directionBit,
  );
  directionBit = consumeLookup(
    root,
    witness.refundableSourceBoxId,
    'non-membership',
    undefined,
    witness.proof,
    directionStart,
    directionBit,
  );
  const directionBytes = Math.ceil(directionBit / 8);
  if (witness.proof.length !== directionStart + directionBytes) {
    throw new Error('Ergo UTXO runtime proof contains unused direction bytes');
  }
  if (directionBit % 8 !== 0 && directionBytes !== 0) {
    const usedMask = (1 << (directionBit % 8)) - 1;
    if ((witness.proof.at(-1)! & ~usedMask) !== 0) {
      throw new Error('Ergo UTXO runtime proof contains nonzero direction padding');
    }
  }
}

function parseProofTree(
  proof: Buffer,
  declaredHeight: number,
): { readonly root: FramedNode; readonly directionStart: number } {
  const stack: FramedNode[] = [];
  let offset = 0;
  let nodes = 0;
  let previousLeafNextKey: Buffer | undefined;
  const maximumNodes = 4 * declaredHeight + 3;
  while (true) {
    if (offset >= proof.length) {
      throw new Error('Ergo UTXO runtime proof is truncated before its tree terminator');
    }
    const tag = proof[offset++]!;
    if (tag === END_TAG) break;
    nodes += 1;
    if (nodes > maximumNodes) {
      throw new Error('Ergo UTXO runtime proof tree exceeds its operation bound');
    }
    if (tag === LABEL_TAG) {
      const label = take(proof, offset, DIGEST_BYTES, 'label');
      offset += DIGEST_BYTES;
      stack.push({ kind: 'label', label });
      previousLeafNextKey = undefined;
      continue;
    }
    if (tag === LEAF_TAG) {
      const key = previousLeafNextKey === undefined
        ? take(proof, offset, KEY_BYTES, 'leaf key')
        : Buffer.from(previousLeafNextKey);
      if (previousLeafNextKey === undefined) offset += KEY_BYTES;
      const nextKey = take(proof, offset, KEY_BYTES, 'next leaf key');
      offset += KEY_BYTES;
      const valueLengthBytes = take(proof, offset, 4, 'leaf value length');
      offset += 4;
      const valueLength = valueLengthBytes.readUInt32BE();
      if (valueLength === 0 || valueLength > MAX_VALUE_BYTES) {
        throw new Error('Ergo UTXO runtime proof leaf value length is outside its bound');
      }
      const value = take(proof, offset, valueLength, 'leaf value');
      offset += valueLength;
      if (Buffer.compare(key, nextKey) >= 0) {
        throw new Error('Ergo UTXO runtime proof leaf key interval is invalid');
      }
      const label = blake2b256(Buffer.concat([
        Buffer.from([0]),
        key,
        value,
        nextKey,
      ]));
      stack.push({ kind: 'leaf', key, nextKey, value, label });
      previousLeafNextKey = nextKey;
      continue;
    }
    if (![INTERNAL_LEFT_HIGHER, INTERNAL_BALANCED, INTERNAL_RIGHT_HIGHER].includes(tag)) {
      throw new Error('Ergo UTXO runtime proof contains an invalid internal balance');
    }
    const right = stack.pop();
    const left = stack.pop();
    if (left === undefined || right === undefined) {
      throw new Error('Ergo UTXO runtime proof internal node underflows its stack');
    }
    stack.push({
      kind: 'internal',
      balance: tag,
      left,
      right,
      label: blake2b256(Buffer.concat([
        Buffer.from([1, tag]),
        left.label,
        right.label,
      ])),
    });
  }
  if (stack.length !== 1) {
    throw new Error('Ergo UTXO runtime proof tree does not contain one root');
  }
  const root = stack[0]!;
  if (revealedDepth(root) > declaredHeight) {
    throw new Error('Ergo UTXO runtime proof exceeds the declared tree height');
  }
  return { root, directionStart: offset };
}

function consumeLookup(
  root: FramedNode,
  key: Buffer,
  expectedKind: 'membership' | 'non-membership',
  expectedValue: Buffer | undefined,
  proof: Buffer,
  directionStart: number,
  initialDirectionBit: number,
): number {
  let node = root;
  let directionBit = initialDirectionBit;
  while (node.kind === 'internal') {
    const byteOffset = directionStart + Math.floor(directionBit / 8);
    if (byteOffset >= proof.length) {
      throw new Error('Ergo UTXO runtime proof direction bits are truncated');
    }
    const left = (proof[byteOffset]! & (1 << (directionBit % 8))) !== 0;
    directionBit += 1;
    node = left ? node.left : node.right;
  }
  if (node.kind === 'label') {
    throw new Error('Ergo UTXO runtime lookup terminates at an unresolved label');
  }
  const comparison = Buffer.compare(key, node.key);
  const membership = comparison === 0;
  const nonMembership = comparison > 0 && Buffer.compare(key, node.nextKey) < 0;
  if (expectedKind === 'membership') {
    if (!membership || expectedValue === undefined || !node.value.equals(expectedValue)) {
      throw new Error('Ergo UTXO runtime vault membership proof is invalid');
    }
  } else if (!nonMembership) {
    throw new Error('Ergo UTXO runtime refundable source non-membership proof is invalid');
  }
  return directionBit;
}

function revealedDepth(node: FramedNode): number {
  return node.kind === 'internal'
    ? 1 + Math.max(revealedDepth(node.left), revealedDepth(node.right))
    : 0;
}

function sectionLength(reader: BinaryReader, expectedId: number): number {
  if (reader.u8(`section ${expectedId} ID`) !== expectedId) {
    throw new Error('Ergo UTXO runtime witness section order is unsupported');
  }
  if (reader.u8(`section ${expectedId} flags`) !== 0) {
    throw new Error('Ergo UTXO runtime witness section flags are unsupported');
  }
  return reader.u32(`section ${expectedId} length`);
}

function exactDataObject(
  value: unknown,
  fields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const symbolKeys = Object.getOwnPropertySymbols(value);
  const actualKeys = Object.getOwnPropertyNames(descriptors).sort();
  const expectedKeys = [...fields].sort();
  if (
    symbolKeys.length !== 0
    || actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`${label} must contain exactly ${fields.join(', ')}`);
  }
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const descriptor = descriptors[field]!;
    if (!('value' in descriptor) || descriptor.enumerable !== true) {
      throw new Error(`${label}.${field} must be an enumerable data property`);
    }
    result[field] = descriptor.value;
  }
  return result;
}

function exactBytes(value: unknown, label: string): Buffer {
  if (!(value instanceof Uint8Array)) {
    throw new Error(`${label} must be bytes`);
  }
  return Buffer.from(value);
}

function exactHex(
  value: unknown,
  expectedBytes: number | undefined,
  label: string,
): Buffer {
  if (typeof value !== 'string') throw new Error(`${label} must be hexadecimal`);
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  if (
    normalized.length % 2 !== 0
    || !/^[0-9a-f]*$/.test(normalized)
    || (expectedBytes !== undefined && normalized.length !== expectedBytes * 2)
  ) {
    throw new Error(`${label} has an invalid hexadecimal encoding`);
  }
  return Buffer.from(normalized, 'hex');
}

function take(bytes: Buffer, offset: number, length: number, label: string): Buffer {
  const end = offset + length;
  if (!Number.isSafeInteger(end) || end > bytes.length) {
    throw new Error(`Ergo UTXO runtime proof is truncated in ${label}`);
  }
  return Buffer.from(bytes.subarray(offset, end));
}

function isUniform(value: Buffer, byte: number): boolean {
  return value.every(current => current === byte);
}

function blake2b256(value: Uint8Array): Buffer {
  return Buffer.from(blakejs.blake2b(value, undefined, DIGEST_BYTES));
}

function u16(value: number): Buffer {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(value);
  return bytes;
}

function u32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

class BinaryReader {
  private offset = 0;

  constructor(private readonly value: Buffer) {}

  u8(label: string): number {
    return this.bytes(1, label)[0]!;
  }

  u16(label: string): number {
    return this.bytes(2, label).readUInt16BE();
  }

  u32(label: string): number {
    return this.bytes(4, label).readUInt32BE();
  }

  bytes(length: number, label: string): Buffer {
    if (!Number.isSafeInteger(length) || length < 0) {
      throw new Error(`${label} length is invalid`);
    }
    const end = this.offset + length;
    if (!Number.isSafeInteger(end) || end > this.value.length) {
      throw new Error(`${label} is truncated`);
    }
    const result = Buffer.from(this.value.subarray(this.offset, end));
    this.offset = end;
    return result;
  }

  section(length: number, label: string): BinaryReader {
    return new BinaryReader(this.bytes(length, label));
  }

  end(label: string): void {
    if (this.offset !== this.value.length) {
      throw new Error(`${label} contains trailing bytes`);
    }
  }
}
