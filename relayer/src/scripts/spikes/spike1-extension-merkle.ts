/**
 * Spike 1: Extension Merkle Serialization
 * ========================================
 * 
 * STATUS: PROVISIONAL PASS — real Ergo block extension root cross-check passed;
 *         ErgoScript/on-chain proof verification pending (Spike 2/3 dependency)
 * 
 * SOURCE-VERIFIED from:
 * - input-output-hk/scrypto: MerkleTree.scala, Node.scala, MerkleProof.scala, CryptographicHash.scala
 * - ergoplatform/ergo: Extension.scala, ExtensionSerializer.scala, Algos.scala
 * 
 * KEY FINDINGS:
 * 
 * 1. LEAF SERIALIZATION (Extension.kvToLeaf):
 *    leafBytes = concat(keyLength: 1 byte, key: 2 bytes, value: N bytes)
 *    For standard 2-byte extension key:
 *      leafBytes = [0x02, key[0], key[1], value[0..N-1]]
 *    NOTE: keyLength is always 0x02 for Ergo extension fields.
 *    NOTE: value length is NOT encoded in the leaf — only key length is.
 * 
 * 2. LEAF HASH:
 *    leafHash = Blake2b256(0x00 || leafBytes)
 *    where LeafPrefix = 0x00 (single byte)
 * 
 * 3. INTERNAL NODE HASH:
 *    internalHash = Blake2b256(0x01 || leftHash || rightHash)
 *    where InternalNodePrefix = 0x01 (single byte)
 * 
 * 4. EMPTY NODE:
 *    EmptyNode.hash = [] (empty byte array)
 *    EmptyRootNode.hash = 32 zero bytes
 * 
 * 5. TREE CONSTRUCTION (MerkleTree.calcTopNode — NOT pad-to-power-of-two):
 *    - Leaves are grouped in pairs level by level
 *    - If odd count at any level, last node gets EmptyNode as right sibling
 *    - This is NOT the same as padding all leaves to power-of-two upfront
 *    - Minimum tree: even 1 leaf wraps into InternalNode(leaf, EmptyNode)
 * 
 * 6. FIELD ORDERING:
 *    Extension.merkleTree passes fields.map(kvToLeaf) — serialized block order.
 *    No sorting. Order comes from how the miner/serializer emits the fields.
 * 
 * 7. EMPTY TREE ROOT (Algos.merkleTreeRoot):
 *    Blake2b256(empty) = 0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8
 * 
 * 8. PROOF FORMAT (MerkleProof):
 *    proof.levels: [(siblingHash, side)] bottom-up
 *    side: 0x00 = LeftSide (computed hash is LEFT of sibling)
 *    side: 0x01 = RightSide (computed hash is RIGHT of sibling)
 * 
 * 9. prefixedHash(prefix, inputs*) = hash(prefix +: concat(inputs))
 *    Prepends a SINGLE PREFIX BYTE before concatenating all inputs.
 * 
 * 10. HASH FUNCTION: Blake2b-256 (32-byte output)
 */

import blakejs from 'blakejs';

// === Constants (from Scorex MerkleTree.scala) ===
const LEAF_PREFIX = 0x00;
const INTERNAL_NODE_PREFIX = 0x01;
const DIGEST_SIZE = 32;

// === Hash functions ===

function blake2b256(data: Uint8Array): Uint8Array {
  return blakejs.blake2b(data, undefined, DIGEST_SIZE);
}

function prefixedHash(prefix: number, ...inputs: Uint8Array[]): Uint8Array {
  const totalLen = 1 + inputs.reduce((s, i) => s + i.length, 0);
  const buf = new Uint8Array(totalLen);
  buf[0] = prefix;
  let offset = 1;
  for (const inp of inputs) {
    buf.set(inp, offset);
    offset += inp.length;
  }
  return blake2b256(buf);
}

function leafHash(leafData: Uint8Array): Uint8Array {
  return prefixedHash(LEAF_PREFIX, leafData);
}

function internalNodeHash(left: Uint8Array, right: Uint8Array): Uint8Array {
  return prefixedHash(INTERNAL_NODE_PREFIX, left, right);
}

// === Extension helpers ===

/**
 * Extension.kvToLeaf: Bytes.concat(Array(kv._1.length.toByte), kv._1, kv._2)
 * keyLength is 1 byte. For Ergo extension fields, key is always 2 bytes, so keyLength = 0x02.
 * value length is NOT encoded.
 */
function kvToLeaf(key: Uint8Array, value: Uint8Array): Uint8Array {
  const result = new Uint8Array(1 + key.length + value.length);
  result[0] = key.length;  // always 0x02 for Ergo extension
  result.set(key, 1);
  result.set(value, 1 + key.length);
  return result;
}

// === Merkle Tree — mirrors Scorex MerkleTree.calcTopNode EXACTLY ===

const EMPTY_HASH = new Uint8Array(0);  // EmptyNode.hash

interface TreeNode {
  hash: Uint8Array;
  left?: TreeNode;
  right?: TreeNode;
  leafIndex?: number;  // only for leaves
}

/**
 * MerkleTree.calcTopNode from Scorex:
 *   @tailrec
 *   def calcTopNode(nodes: Seq[Node[D]]): Node[D] = {
 *     if (nodes.isEmpty) EmptyRootNode()
 *     else {
 *       val nextNodes = nodes.grouped(2)
 *         .map(lr => InternalNode(lr.head, if (lr.lengthCompare(2) == 0) lr.last else EmptyNode()))
 *         .toSeq
 *       if (nextNodes.lengthCompare(1) == 0) nextNodes.head else calcTopNode(nextNodes)
 *     }
 *   }
 * 
 * KEY: This does NOT pad to power-of-two upfront. It pads at each level when odd.
 */
function calcTopNode(nodes: TreeNode[]): TreeNode {
  if (nodes.length === 0) {
    return { hash: new Uint8Array(DIGEST_SIZE) };  // EmptyRootNode: 32 zero bytes
  }

  // Scorex: group in pairs, wrap each pair in InternalNode, then recurse
  // This always executes at least once, even for a single leaf
  let current = [...nodes];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const next: TreeNode[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = i + 1 < current.length
        ? current[i + 1]
        : { hash: EMPTY_HASH };  // EmptyNode
      next.push({
        hash: internalNodeHash(left.hash, right.hash),
        left,
        right,
      });
    }
    if (next.length === 1) return next[0];
    current = next;
  }
}

function buildMerkleTree(leafDatas: Uint8Array[]): { root: Uint8Array; tree: TreeNode; leafHashes: Uint8Array[] } {
  if (leafDatas.length === 0) {
    // Algos.merkleTreeRoot: if empty, returns blake2b256(empty), NOT EmptyRootNode
    return {
      root: blake2b256(new Uint8Array(0)),
      tree: { hash: new Uint8Array(DIGEST_SIZE) },
      leafHashes: [],
    };
  }

  const leafNodes: TreeNode[] = leafDatas.map((d, i) => ({
    hash: leafHash(d),
    leafIndex: i,
  }));

  const tree = calcTopNode(leafNodes);
  return { root: tree.hash, tree, leafHashes: leafNodes.map(n => n.hash) };
}

// === Merkle proof — mirrors Scorex MerkleTree.proofByIndex ===

interface MerkleProofLevel {
  siblingHash: Uint8Array;
  side: number;  // 0 = LeftSide (we are left), 1 = RightSide (we are right)
}

/**
 * Scorex proofByIndex uses lengthWithEmptyLeafs (power-of-two virtual size)
 * to navigate the tree. We replicate this exactly.
 * 
 * lengthWithEmptyLeafs = max(2, 2^ceil(log2(length)))
 */
function lengthWithEmptyLeafs(length: number): number {
  if (length <= 0) return 0;
  return Math.max(2, Math.pow(2, Math.ceil(Math.log2(length))));
}

/**
 * Navigate the tree to build proof for leaf at targetIndex.
 * Mirrors Scorex's recursive loop using curLength navigation.
 */
function buildMerkleProof(tree: TreeNode, targetIndex: number, numLeaves: number): MerkleProofLevel[] {
  const virtualLen = lengthWithEmptyLeafs(numLeaves);
  const levels: MerkleProofLevel[] = [];

  function loop(node: TreeNode, i: number, curLength: number): boolean {
    if (!node.left && !node.right) {
      // Leaf node — found it
      return node.leafIndex === targetIndex;
    }

    const half = curLength / 2;
    if (i < half && node.left) {
      // Go left, sibling is right with LeftSide
      if (loop(node.left, i, half)) {
        levels.push({
          siblingHash: node.right?.hash ?? EMPTY_HASH,
          side: 0x00,  // LeftSide
        });
        return true;
      }
    } else if (node.right) {
      // Go right, sibling is left with RightSide
      if (loop(node.right, i - half, half)) {
        levels.push({
          siblingHash: node.left?.hash ?? EMPTY_HASH,
          side: 0x01,  // RightSide
        });
        return true;
      }
    }
    return false;
  }

  loop(tree, targetIndex, virtualLen);
  return levels;  // Note: Scorex reverses, but loop builds top-down → we collect bottom-up
}

function verifyMerkleProof(leafData: Uint8Array, proof: MerkleProofLevel[], expectedRoot: Uint8Array): boolean {
  let currentHash = leafHash(leafData);

  for (const level of proof) {
    if (level.side === 0x00) {
      // LeftSide: our hash is left
      currentHash = internalNodeHash(currentHash, level.siblingHash);
    } else {
      // RightSide: our hash is right
      currentHash = internalNodeHash(level.siblingHash, currentHash);
    }
  }

  return Buffer.from(currentHash).equals(Buffer.from(expectedRoot));
}

// === Utilities ===

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ====================================================================
// TEST SUITE
// ====================================================================

let allPassed = true;

function test(name: string, fn: () => boolean) {
  const ok = fn();
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  if (!ok) allPassed = false;
}

// --- Test 1: Empty tree ---
console.log('\n=== Empty tree ===');
test('Empty tree root matches Ergo constant', () => {
  const { root } = buildMerkleTree([]);
  return bytesToHex(root) === '0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8';
});

// --- Tests for 1..7 leaves (self-consistency: build tree, build proof, verify) ---
function generateLeaf(i: number): Uint8Array {
  const key = new Uint8Array([0x04, i]);
  const value = new Uint8Array(32);
  value[0] = i;
  return kvToLeaf(key, value);
}

for (let numLeaves = 1; numLeaves <= 7; numLeaves++) {
  console.log(`\n=== ${numLeaves} leaf/leaves ===`);
  const leafDatas = Array.from({ length: numLeaves }, (_, i) => generateLeaf(i));
  const { root, tree } = buildMerkleTree(leafDatas);

  test(`Tree builds without error (${numLeaves} leaves)`, () => root.length === 32);

  for (let idx = 0; idx < numLeaves; idx++) {
    test(`Proof for leaf ${idx}/${numLeaves} verifies`, () => {
      const proof = buildMerkleProof(tree, idx, numLeaves);
      return verifyMerkleProof(leafDatas[idx], proof, root);
    });
  }

  // Verify tree depth matches expectation
  test(`Proof depth is ceil(log2(max(2,N)))`, () => {
    const proof = buildMerkleProof(tree, 0, numLeaves);
    const expectedDepth = Math.ceil(Math.log2(Math.max(2, numLeaves)));
    return proof.length === expectedDepth;
  });
}

// --- Cross-check against real Ergo mainnet block ---
console.log('\n=== Cross-check: Real Ergo mainnet block ===');
// Block 87e2e46669cfb4b69e5d3757304cc79019249d0ca398608b562536869b59b6e2
// Height: 1779794
// Extension digest: 0a76e0eebac158ad24b57be692d6a054ee0d4d7b208955c473e648138de194cd

const realBlockExtensionFields: [string, string][] = [
  ['0100', '01b0244dfc267baca974a4caee06120321562784303a8a688976ae56170e4d175b'],
  ['0101', '0423e64616911973ff14480fe295ba32902dc426449b116df38fd46ef6de3d4093'],
  ['0105', '0111347ec5b40da38d465f2f174e375b1d470f9a0f7f7d732fcecba8f45cf21b92'],
  ['0106', '01e4b0d9643a37e599e8bad60cddd74a98ecbb512e25d2fa7aed22ed3f1f793955'],
  ['0107', '02dbd657ced7df483eb2ebcee401793937dc027e9cac9167f712f3b96d158d3464'],
  ['0109', '016f9c20cee05e85310e998eca3022352f4144cc4fdabe7c1c1ab3c17c51da32bc'],
  ['010a', '067b7ed95fcc9db7e4667348333f92e56664f6943aa4aaa697566b042fe27e49ab'],
  ['0110', '0121c91dc4ea5040670a809904026095ba6409a7bff4b20bce9cdc10a7013cad08'],
  ['0111', '03a41d8f78dbc5f9a3eda38289fc1714fa4032ee3f50ed4f0a6f78c80c3d1fc60b'],
  ['0114', '0197d763571fbc9ead5f27222c95d1f7d1c118d8ea3cd3372a29c3f153a623e355'],
];

const expectedExtensionDigest = '0a76e0eebac158ad24b57be692d6a054ee0d4d7b208955c473e648138de194cd';

const realLeafDatas = realBlockExtensionFields.map(([key, value]) =>
  kvToLeaf(hexToBytes(key), hexToBytes(value))
);
const { root: realRoot, tree: realTree } = buildMerkleTree(realLeafDatas);
const computedDigest = bytesToHex(realRoot);

console.log(`  Expected digest: ${expectedExtensionDigest}`);
console.log(`  Computed digest: ${computedDigest}`);
test('Computed root matches real Ergo block extensionHash', () => {
  return computedDigest === expectedExtensionDigest;
});

// Also verify a proof against the real root
test('Proof for field 0 verifies against real root', () => {
  const proof = buildMerkleProof(realTree, 0, realBlockExtensionFields.length);
  return verifyMerkleProof(realLeafDatas[0], proof, realRoot);
});

test('Proof for last field verifies against real root', () => {
  const lastIdx = realBlockExtensionFields.length - 1;
  const proof = buildMerkleProof(realTree, lastIdx, realBlockExtensionFields.length);
  return verifyMerkleProof(realLeafDatas[lastIdx], proof, realRoot);
});

// === Summary ===
console.log('\n====================================');
console.log(allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
console.log('====================================');
console.log('\nFormulas:');
console.log('  Leaf:     Blake2b256(0x00 || 0x02 || key[0..1] || value[0..N])');
console.log('  Internal: Blake2b256(0x01 || leftHash[0..31] || rightHash[0..31])');
console.log('  Empty:    [] (empty byte array)');
console.log('  Tree:     Scorex calcTopNode — pairwise grouping per level, NOT pad-to-power-of-two');
console.log('  Ordering: serialized block order (no sorting)');
console.log('  Hash:     Blake2b-256 (32-byte output)');

process.exit(allPassed ? 0 : 1);
