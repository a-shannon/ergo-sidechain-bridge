/** Pure Ergo extension-tree codecs and membership verification. */
import blakejs from 'blakejs';

export const ERGO_EXTENSION_MERKLE_DIGEST_SIZE = 32;
export const ERGO_EXTENSION_MERKLE_LEVEL_SIZE = 33;
export const ERGO_EXTENSION_MERKLE_MIN_DEPTH = 1;
export const ERGO_EXTENSION_MERKLE_MAX_DEPTH = 14;
export const ERGO_EXTENSION_MERKLE_LEAF_PREFIX = 0x00;
export const ERGO_EXTENSION_MERKLE_INTERNAL_PREFIX = 0x01;

export const ERGO_EXTENSION_MERKLE_SIDE_LEFT = 0x00;
export const ERGO_EXTENSION_MERKLE_SIDE_RIGHT = 0x01;
export const ERGO_EXTENSION_MERKLE_SIDE_LEFT_EMPTY = 0x02;
export const ERGO_EXTENSION_MERKLE_SIDE_RIGHT_EMPTY = 0x03;

export type ErgoExtensionMerkleSide =
  | typeof ERGO_EXTENSION_MERKLE_SIDE_LEFT
  | typeof ERGO_EXTENSION_MERKLE_SIDE_RIGHT
  | typeof ERGO_EXTENSION_MERKLE_SIDE_LEFT_EMPTY
  | typeof ERGO_EXTENSION_MERKLE_SIDE_RIGHT_EMPTY;

export interface ErgoExtensionMerkleField {
  key: Uint8Array;
  value: Uint8Array;
}

export interface ErgoExtensionMembershipProofStep {
  side: ErgoExtensionMerkleSide;
  sibling: Buffer;
}

export interface ErgoExtensionMembershipProof {
  root: Buffer;
  proof: Buffer;
  leafData: Buffer;
  leafHash: Buffer;
  targetIndex: number;
  fieldCount: number;
}

export interface ErgoExtensionMembershipProofValidation {
  ok: boolean;
  depth: number | null;
  errors: string[];
}

interface TreeNode {
  hash: Buffer;
  left?: TreeNode;
  right?: TreeNode;
  leafIndex?: number;
}

const EMPTY_NODE_HASH = Buffer.alloc(0);

export function encodeErgoExtensionLeafData(key: Uint8Array, value: Uint8Array): Buffer {
  if (key.length > 0xff) {
    throw new Error('extension key must fit in the one-byte leaf key length');
  }
  return Buffer.concat([Buffer.from([key.length]), Buffer.from(key), Buffer.from(value)]);
}

export function hashErgoExtensionLeaf(leafData: Uint8Array): Buffer {
  return blake2b256(Buffer.concat([Buffer.from([ERGO_EXTENSION_MERKLE_LEAF_PREFIX]), Buffer.from(leafData)]));
}

export function hashErgoExtensionInternal(left: Uint8Array, right: Uint8Array): Buffer {
  assertDigest(left, 'left node hash');
  assertDigest(right, 'right node hash');
  return blake2b256(Buffer.concat([
    Buffer.from([ERGO_EXTENSION_MERKLE_INTERNAL_PREFIX]),
    Buffer.from(left),
    Buffer.from(right),
  ]));
}

export function parseErgoExtensionMembershipProof(proof: Uint8Array): ErgoExtensionMembershipProofStep[] {
  const validation = validateErgoExtensionMembershipProof(proof);
  if (!validation.ok) {
    throw new Error(validation.errors.join('; '));
  }

  const bytes = Buffer.from(proof);
  const steps: ErgoExtensionMembershipProofStep[] = [];
  for (let offset = 0; offset < bytes.length; offset += ERGO_EXTENSION_MERKLE_LEVEL_SIZE) {
    steps.push({
      side: bytes[offset] as ErgoExtensionMerkleSide,
      sibling: Buffer.from(bytes.subarray(offset + 1, offset + ERGO_EXTENSION_MERKLE_LEVEL_SIZE)),
    });
  }
  return steps;
}

export function validateErgoExtensionMembershipProof(proof: Uint8Array): ErgoExtensionMembershipProofValidation {
  const errors: string[] = [];
  if (proof.length === 0) {
    errors.push('extension membership proof must contain at least one level');
  }
  if (proof.length % ERGO_EXTENSION_MERKLE_LEVEL_SIZE !== 0) {
    errors.push(`extension membership proof length must be divisible by ${ERGO_EXTENSION_MERKLE_LEVEL_SIZE}`);
  }

  const depth = proof.length % ERGO_EXTENSION_MERKLE_LEVEL_SIZE === 0
    ? proof.length / ERGO_EXTENSION_MERKLE_LEVEL_SIZE
    : null;
  if (depth !== null && depth < ERGO_EXTENSION_MERKLE_MIN_DEPTH) {
    errors.push(`extension membership proof depth must be at least ${ERGO_EXTENSION_MERKLE_MIN_DEPTH}`);
  }
  if (depth !== null && depth > ERGO_EXTENSION_MERKLE_MAX_DEPTH) {
    errors.push(`extension membership proof depth must not exceed ${ERGO_EXTENSION_MERKLE_MAX_DEPTH}`);
  }

  for (let offset = 0; offset + ERGO_EXTENSION_MERKLE_LEVEL_SIZE <= proof.length; offset += ERGO_EXTENSION_MERKLE_LEVEL_SIZE) {
    const level = offset / ERGO_EXTENSION_MERKLE_LEVEL_SIZE;
    const side = proof[offset];
    if (!isErgoExtensionMerkleSide(side)) {
      errors.push(`extension membership proof level ${level} has invalid side ${side}`);
      continue;
    }
    if ((side === ERGO_EXTENSION_MERKLE_SIDE_LEFT_EMPTY || side === ERGO_EXTENSION_MERKLE_SIDE_RIGHT_EMPTY) &&
      !proof.subarray(offset + 1, offset + ERGO_EXTENSION_MERKLE_LEVEL_SIZE).every(byte => byte === 0)) {
      errors.push(`extension membership proof level ${level} empty-node padding must be zero`);
    }
  }

  return { ok: errors.length === 0, depth, errors };
}

export function verifyErgoExtensionMembership(input: {
  key: Uint8Array;
  value: Uint8Array;
  proof: Uint8Array;
  root: Uint8Array;
}): boolean {
  assertDigest(input.root, 'extension membership root');
  let current = hashErgoExtensionLeaf(encodeErgoExtensionLeafData(input.key, input.value));
  for (const step of parseErgoExtensionMembershipProof(input.proof)) {
    if (step.side === ERGO_EXTENSION_MERKLE_SIDE_LEFT) {
      current = hashErgoExtensionInternal(current, step.sibling);
    } else if (step.side === ERGO_EXTENSION_MERKLE_SIDE_RIGHT) {
      current = hashErgoExtensionInternal(step.sibling, current);
    } else {
      current = hashErgoExtensionEmptySibling(current);
    }
  }
  return current.equals(Buffer.from(input.root));
}

export function buildErgoExtensionMembershipProof(
  fields: readonly ErgoExtensionMerkleField[],
  targetKey: Uint8Array,
): ErgoExtensionMembershipProof {
  if (fields.length === 0) {
    throw new Error('extension membership proof requires at least one field');
  }

  const targetKeyBytes = Buffer.from(targetKey);
  const targetIndexes: number[] = [];
  const seenKeys = new Set<string>();
  const leafNodes = fields.map((field, index) => {
    const key = Buffer.from(field.key);
    const keyId = key.toString('hex');
    if (seenKeys.has(keyId)) {
      if (key.equals(targetKeyBytes)) {
        throw new Error('target extension key must occur exactly once');
      }
      throw new Error(`duplicate extension key at field index ${index}`);
    }
    seenKeys.add(keyId);
    if (key.equals(targetKeyBytes)) targetIndexes.push(index);

    const leafData = encodeErgoExtensionLeafData(key, field.value);
    return {
      hash: hashErgoExtensionLeaf(leafData),
      leafIndex: index,
    };
  });

  if (targetIndexes.length === 0) {
    throw new Error('target extension key is not present in ordered fields');
  }
  const targetIndex = targetIndexes[0];
  const tree = buildTree(leafNodes);
  const proof = serializeProof(collectProof(tree, targetIndex));
  const validation = validateErgoExtensionMembershipProof(proof);
  if (!validation.ok) {
    throw new Error(validation.errors.join('; '));
  }

  const targetField = fields[targetIndex];
  const leafData = encodeErgoExtensionLeafData(targetField.key, targetField.value);
  return {
    root: Buffer.from(tree.hash),
    proof,
    leafData,
    leafHash: hashErgoExtensionLeaf(leafData),
    targetIndex,
    fieldCount: fields.length,
  };
}

function buildTree(leafNodes: TreeNode[]): TreeNode {
  let current = leafNodes;
  while (true) {
    const next: TreeNode[] = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index];
      const right = index + 1 < current.length ? current[index + 1] : { hash: EMPTY_NODE_HASH };
      next.push({
        hash: hashErgoExtensionNode(left.hash, right.hash),
        left,
        right,
      });
    }
    if (next.length === 1) return next[0];
    current = next;
  }
}

function collectProof(tree: TreeNode, targetIndex: number): ErgoExtensionMembershipProofStep[] {
  const steps: ErgoExtensionMembershipProofStep[] = [];
  const found = collect(tree);
  if (!found) {
    throw new Error(`target extension field index ${targetIndex} was not found in the tree`);
  }
  return steps;

  function collect(node: TreeNode): boolean {
    if (!node.left && !node.right) return node.leafIndex === targetIndex;

    if (node.left && collect(node.left)) {
      const sibling = node.right?.hash ?? EMPTY_NODE_HASH;
      steps.push(sibling.length === 0
        ? { side: ERGO_EXTENSION_MERKLE_SIDE_LEFT_EMPTY, sibling: Buffer.alloc(ERGO_EXTENSION_MERKLE_DIGEST_SIZE) }
        : { side: ERGO_EXTENSION_MERKLE_SIDE_LEFT, sibling: Buffer.from(sibling) });
      return true;
    }
    if (node.right && collect(node.right)) {
      const sibling = node.left?.hash ?? EMPTY_NODE_HASH;
      steps.push(sibling.length === 0
        ? { side: ERGO_EXTENSION_MERKLE_SIDE_RIGHT_EMPTY, sibling: Buffer.alloc(ERGO_EXTENSION_MERKLE_DIGEST_SIZE) }
        : { side: ERGO_EXTENSION_MERKLE_SIDE_RIGHT, sibling: Buffer.from(sibling) });
      return true;
    }
    return false;
  }
}

function serializeProof(steps: readonly ErgoExtensionMembershipProofStep[]): Buffer {
  return Buffer.concat(steps.map(step => Buffer.concat([Buffer.from([step.side]), step.sibling])));
}

function hashErgoExtensionEmptySibling(current: Uint8Array): Buffer {
  assertDigest(current, 'current node hash');
  return blake2b256(Buffer.concat([
    Buffer.from([ERGO_EXTENSION_MERKLE_INTERNAL_PREFIX]),
    Buffer.from(current),
  ]));
}

function hashErgoExtensionNode(left: Uint8Array, right: Uint8Array): Buffer {
  if (right.length === 0) return hashErgoExtensionEmptySibling(left);
  return hashErgoExtensionInternal(left, right);
}

function blake2b256(data: Uint8Array): Buffer {
  return Buffer.from(blakejs.blake2b(data, undefined, ERGO_EXTENSION_MERKLE_DIGEST_SIZE));
}

function assertDigest(value: Uint8Array, label: string): void {
  if (value.length !== ERGO_EXTENSION_MERKLE_DIGEST_SIZE) {
    throw new Error(`${label} must be ${ERGO_EXTENSION_MERKLE_DIGEST_SIZE} bytes`);
  }
}

function isErgoExtensionMerkleSide(value: number): value is ErgoExtensionMerkleSide {
  return value >= ERGO_EXTENSION_MERKLE_SIDE_LEFT && value <= ERGO_EXTENSION_MERKLE_SIDE_RIGHT_EMPTY;
}
