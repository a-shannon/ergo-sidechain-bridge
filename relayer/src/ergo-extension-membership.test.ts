import { describe, expect, it } from 'vitest';

import {
  ERGO_EXTENSION_MERKLE_LEVEL_SIZE,
  ERGO_EXTENSION_MERKLE_SIDE_LEFT,
  ERGO_EXTENSION_MERKLE_SIDE_LEFT_EMPTY,
  ERGO_EXTENSION_MERKLE_SIDE_RIGHT,
  ERGO_EXTENSION_MERKLE_SIDE_RIGHT_EMPTY,
  buildErgoExtensionMembershipProof,
  encodeErgoExtensionLeafData,
  parseErgoExtensionMembershipProof,
  validateErgoExtensionMembershipProof,
  verifyErgoExtensionMembership,
  type ErgoExtensionMerkleField,
} from './ergo-settlement-core/ergo-extension-membership.js';

const KEY_0401 = Buffer.from('0401', 'hex');
const VALUE_64 = Buffer.from(Array.from({ length: 64 }, (_, index) => index));

function field(keyHex: string, valueByte: number): ErgoExtensionMerkleField {
  return {
    key: Buffer.from(keyHex, 'hex'),
    value: Buffer.from([valueByte]),
  };
}

function proofFor0401(): ReturnType<typeof buildErgoExtensionMembershipProof> {
  return buildErgoExtensionMembershipProof([
    field('0101', 0x11),
    { key: KEY_0401, value: VALUE_64 },
    field('0501', 0x55),
  ], KEY_0401);
}

describe('Ergo extension Merkle membership', () => {
  it('encodes arbitrary key bytes and a 0x0401 64-byte value canonically', () => {
    const leafData = encodeErgoExtensionLeafData(KEY_0401, VALUE_64);

    expect(leafData).toEqual(Buffer.concat([Buffer.from([2]), KEY_0401, VALUE_64]));

    const proof = proofFor0401();
    expect(proof.fieldCount).toBe(3);
    expect(proof.targetIndex).toBe(1);
    expect(proof.leafData).toEqual(leafData);
    expect(verifyErgoExtensionMembership({
      key: KEY_0401,
      value: VALUE_64,
      proof: proof.proof,
      root: proof.root,
    })).toBe(true);
  });

  it('builds and verifies a depth-one proof for a single field', () => {
    const key = Buffer.from([0xff, 0x00, 0x7f]);
    const value = Buffer.from([0x42]);
    const proof = buildErgoExtensionMembershipProof([{ key, value }], key);

    expect(proof.proof).toHaveLength(ERGO_EXTENSION_MERKLE_LEVEL_SIZE);
    expect(proof.proof[0]).toBe(ERGO_EXTENSION_MERKLE_SIDE_LEFT_EMPTY);
    expect(proof.proof.subarray(1)).toEqual(Buffer.alloc(32));
    expect(verifyErgoExtensionMembership({ key, value, proof: proof.proof, root: proof.root })).toBe(true);

    const rightEmptyProof = Buffer.from(proof.proof);
    rightEmptyProof[0] = ERGO_EXTENSION_MERKLE_SIDE_RIGHT_EMPTY;
    expect(verifyErgoExtensionMembership({ key, value, proof: rightEmptyProof, root: proof.root })).toBe(true);
  });

  it('uses an empty-sibling side with zero padding for an odd ordered tree', () => {
    const fields = [field('0101', 0x10), field('0201', 0x20), field('0301', 0x30)];
    const proof = buildErgoExtensionMembershipProof(fields, fields[2].key);
    const steps = parseErgoExtensionMembershipProof(proof.proof);

    expect(steps.map(step => step.side)).toEqual([
      ERGO_EXTENSION_MERKLE_SIDE_LEFT_EMPTY,
      ERGO_EXTENSION_MERKLE_SIDE_RIGHT,
    ]);
    expect(steps[0].sibling).toEqual(Buffer.alloc(32));
    expect(verifyErgoExtensionMembership({
      key: fields[2].key,
      value: fields[2].value,
      proof: proof.proof,
      root: proof.root,
    })).toBe(true);
  });

  it('returns false for a wrong key, value, root, or sibling in an otherwise valid proof', () => {
    const proof = proofFor0401();
    const wrongSibling = Buffer.from(proof.proof);
    wrongSibling[1] ^= 0x01;

    expect(verifyErgoExtensionMembership({
      key: Buffer.from('0402', 'hex'),
      value: VALUE_64,
      proof: proof.proof,
      root: proof.root,
    })).toBe(false);
    expect(verifyErgoExtensionMembership({
      key: KEY_0401,
      value: Buffer.concat([VALUE_64.subarray(0, 63), Buffer.from([0xff])]),
      proof: proof.proof,
      root: proof.root,
    })).toBe(false);
    expect(verifyErgoExtensionMembership({
      key: KEY_0401,
      value: VALUE_64,
      proof: proof.proof,
      root: Buffer.alloc(32, 0xff),
    })).toBe(false);
    expect(verifyErgoExtensionMembership({
      key: KEY_0401,
      value: VALUE_64,
      proof: wrongSibling,
      root: proof.root,
    })).toBe(false);
  });

  it('rejects malformed lengths, depth zero, and depth fifteen', () => {
    expect(validateErgoExtensionMembershipProof(Buffer.alloc(0))).toMatchObject({ ok: false, depth: 0 });
    expect(() => parseErgoExtensionMembershipProof(Buffer.alloc(0))).toThrow(/at least one level/);

    const malformed = Buffer.alloc(ERGO_EXTENSION_MERKLE_LEVEL_SIZE + 1);
    expect(validateErgoExtensionMembershipProof(malformed)).toMatchObject({ ok: false, depth: null });
    expect(() => parseErgoExtensionMembershipProof(malformed)).toThrow(/divisible/);

    const depthFifteen = Buffer.alloc(ERGO_EXTENSION_MERKLE_LEVEL_SIZE * 15);
    expect(validateErgoExtensionMembershipProof(depthFifteen)).toMatchObject({ ok: false, depth: 15 });
    expect(() => parseErgoExtensionMembershipProof(depthFifteen)).toThrow(/must not exceed 14/);
  });

  it('rejects invalid sides and non-canonical empty-node padding', () => {
    const invalidSide = Buffer.alloc(ERGO_EXTENSION_MERKLE_LEVEL_SIZE);
    invalidSide[0] = 0x04;
    expect(() => parseErgoExtensionMembershipProof(invalidSide)).toThrow(/invalid side/);

    const nonCanonicalEmpty = Buffer.alloc(ERGO_EXTENSION_MERKLE_LEVEL_SIZE);
    nonCanonicalEmpty[0] = ERGO_EXTENSION_MERKLE_SIDE_LEFT_EMPTY;
    nonCanonicalEmpty[1] = 0x01;
    expect(() => parseErgoExtensionMembershipProof(nonCanonicalEmpty)).toThrow(/padding must be zero/);
  });

  it('rejects a root with the wrong length', () => {
    const proof = proofFor0401();
    expect(() => verifyErgoExtensionMembership({
      key: KEY_0401,
      value: VALUE_64,
      proof: proof.proof,
      root: Buffer.alloc(31),
    })).toThrow(/root must be 32 bytes/);
  });

  it('rejects duplicate and missing target keys', () => {
    expect(() => buildErgoExtensionMembershipProof([
      field('0401', 0x01),
      field('0401', 0x02),
    ], KEY_0401)).toThrow(/occur exactly once/);

    expect(() => buildErgoExtensionMembershipProof([field('0101', 0x01)], KEY_0401))
      .toThrow(/not present/);
  });

  it('keeps caller field order deterministic', () => {
    const fields = [field('0301', 0x30), field('0101', 0x10), field('0401', 0x40)];
    const first = buildErgoExtensionMembershipProof(fields, KEY_0401);
    const second = buildErgoExtensionMembershipProof(fields, KEY_0401);
    const reordered = buildErgoExtensionMembershipProof([fields[1], fields[0], fields[2]], KEY_0401);

    expect(second.root).toEqual(first.root);
    expect(second.proof).toEqual(first.proof);
    expect(reordered.root).not.toEqual(first.root);
    expect(first.proof[ERGO_EXTENSION_MERKLE_LEVEL_SIZE]).toBe(ERGO_EXTENSION_MERKLE_SIDE_RIGHT);
    expect(first.proof[0]).toBe(ERGO_EXTENSION_MERKLE_SIDE_LEFT_EMPTY);
    expect(verifyErgoExtensionMembership({
      key: KEY_0401,
      value: fields[2].value,
      proof: first.proof,
      root: first.root,
    })).toBe(true);
  });
});
