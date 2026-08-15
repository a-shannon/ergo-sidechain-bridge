/**
 * Spike 2b: ErgoScript Extension Merkle Proof Verification
 * =========================================================
 * 
 * STATUS: PASS (2026-05-07) — compile, simulation, and Phase C real TX eval all verified.
 *         Phase C (spike2c) confirmed getVar[Coll[Byte]] + fold + blake2b256 for depths 1-14.
 * 
 * This test validates that the Extension Merkle proof format from Spike 1
 * can be verified INSIDE ErgoScript using blake2b256() and slice().
 * 
 * Three phases:
 *   Phase A: Off-chain TypeScript simulation of the ErgoScript logic
 *   Phase B: Compile the ErgoScript via node /script/p2sAddress (requires running node)
 *   Phase C: Build test TX with context extensions and verify evaluation (requires testnet)
 * 
 * Phase A + B + C historically passed. The direct broadcast-capable Phase C
 * evaluator is intentionally absent; its result remains in the phase plan and
 * Git history. Current ContextExtension safety remains enforced by the
 * fail-closed guard and authenticated VM/JVM conformance paths.
 */

import blakejs from 'blakejs';

// === Constants ===
const LEAF_PREFIX = 0x00;
const INTERNAL_NODE_PREFIX = 0x01;
const DIGEST_SIZE = 32;
const LEVEL_SIZE = 33; // 1-byte side + 32-byte (sibling hash or padding)

// Side values (first byte of each 33-byte proof level):
//   0x00 = target is left child, sibling hash present in bytes 1-32
//   0x01 = target is right child, sibling hash present in bytes 1-32
//   0x02 = target is left child, right sibling is EmptyNode — bytes 1-32 ignored
//   0x03 = target is right child, left sibling is EmptyNode — bytes 1-32 ignored
// When side >= 0x02, the verifier hashes with no sibling: blake2b256(0x01 || current).
const SIDE_LEFT          = 0x00;
const SIDE_RIGHT         = 0x01;
const SIDE_LEFT_EMPTY_R  = 0x02;
const SIDE_RIGHT_EMPTY_L = 0x03;

function blake2b256(data: Uint8Array): Uint8Array {
  return blakejs.blake2b(data, undefined, DIGEST_SIZE);
}

// === Re-use Spike 1 tree construction ===

function prefixedHash(prefix: number, ...inputs: Uint8Array[]): Uint8Array {
  const totalLen = 1 + inputs.reduce((s, i) => s + i.length, 0);
  const buf = new Uint8Array(totalLen);
  buf[0] = prefix;
  let offset = 1;
  for (const inp of inputs) { buf.set(inp, offset); offset += inp.length; }
  return blake2b256(buf);
}

function leafHash(d: Uint8Array): Uint8Array { return prefixedHash(LEAF_PREFIX, d); }
function internalNodeHash(l: Uint8Array, r: Uint8Array): Uint8Array { return prefixedHash(INTERNAL_NODE_PREFIX, l, r); }

function kvToLeaf(key: Uint8Array, value: Uint8Array): Uint8Array {
  const result = new Uint8Array(1 + key.length + value.length);
  result[0] = key.length;
  result.set(key, 1);
  result.set(value, 1 + key.length);
  return result;
}

const EMPTY_HASH = new Uint8Array(0);

interface TreeNode { hash: Uint8Array; left?: TreeNode; right?: TreeNode; leafIndex?: number; }

function calcTopNode(nodes: TreeNode[]): TreeNode {
  if (nodes.length === 0) return { hash: new Uint8Array(DIGEST_SIZE) };
  let current = [...nodes];
  while (true) {
    const next: TreeNode[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = i + 1 < current.length ? current[i + 1] : { hash: EMPTY_HASH };
      next.push({ hash: internalNodeHash(left.hash, right.hash), left, right });
    }
    if (next.length === 1) return next[0];
    current = next;
  }
}

function buildMerkleTree(leafDatas: Uint8Array[]) {
  const leafNodes: TreeNode[] = leafDatas.map((d, i) => ({ hash: leafHash(d), leafIndex: i }));
  return { tree: calcTopNode(leafNodes), root: calcTopNode(leafNodes).hash, leafHashes: leafNodes.map(n => n.hash) };
}

function buildProofFlat(tree: TreeNode, targetIndex: number, _numLeaves: number): Uint8Array {
  // Fixed 33-byte format: [side(1) || siblingHash(32)] per level
  // Side byte encodes both direction AND whether sibling is EmptyNode:
  //   0x00/0x01 = sibling present (use 32-byte hash)
  //   0x02/0x03 = sibling is EmptyNode (32-byte slot is padding, ignored)
  const levels: { side: number; siblingHash: Uint8Array }[] = [];

  function collect(node: TreeNode): boolean {
    if (!node.left && !node.right) return node.leafIndex === targetIndex;
    if (node.left && collect(node.left)) {
      const sibHash = node.right?.hash ?? EMPTY_HASH;
      const isEmpty = sibHash.length === 0;
      levels.push({ side: isEmpty ? SIDE_LEFT_EMPTY_R : SIDE_LEFT, siblingHash: isEmpty ? new Uint8Array(32) : sibHash });
      return true;
    }
    if (node.right && collect(node.right)) {
      const sibHash = node.left?.hash ?? EMPTY_HASH;
      const isEmpty = sibHash.length === 0;
      levels.push({ side: isEmpty ? SIDE_RIGHT_EMPTY_L : SIDE_RIGHT, siblingHash: isEmpty ? new Uint8Array(32) : sibHash });
      return true;
    }
    return false;
  }

  collect(tree);

  // Fixed-width serialization: [side(1) || siblingHash(32)] x numLevels
  const flatProof = new Uint8Array(levels.length * LEVEL_SIZE);
  for (let i = 0; i < levels.length; i++) {
    flatProof[i * LEVEL_SIZE] = levels[i].side;
    flatProof.set(levels[i].siblingHash, i * LEVEL_SIZE + 1);
  }
  return flatProof;
}

function ergoScriptSimulation(leafData: Uint8Array, flatProof: Uint8Array, expectedRoot: Uint8Array): { 
  verified: boolean; 
  hashOps: number;
  sliceOps: number;
  totalOps: number;
} {
  // Step 1: compute leaf hash — blake2b256(0x00 ++ leafData)
  const leafPfx = new Uint8Array([LEAF_PREFIX]);
  let currentHash = blake2b256(new Uint8Array([...leafPfx, ...leafData]));
  let hashOps = 1;
  let sliceOps = 0;

  // Step 2: iterate fixed-width 33-byte levels: [side(1) || siblingHash(32)]
  const proofLen = flatProof.length / LEVEL_SIZE;

  for (let i = 0; i < proofLen; i++) {
    const side = flatProof[i * LEVEL_SIZE];
    const siblingHash = flatProof.slice(i * LEVEL_SIZE + 1, i * LEVEL_SIZE + 33);
    sliceOps++;

    const intPfx = new Uint8Array([INTERNAL_NODE_PREFIX]);
    if (side > SIDE_RIGHT_EMPTY_L) {
      throw new Error(`Invalid side byte 0x${side.toString(16)} at level ${i}`);
    }
    if (side >= 0x02) {
      // Side 0x02 or 0x03: EmptyNode sibling — hash with no sibling appended
      currentHash = blake2b256(new Uint8Array([...intPfx, ...currentHash]));
    } else if (side === SIDE_LEFT) {
      // Target is left child, sibling present
      currentHash = blake2b256(new Uint8Array([...intPfx, ...currentHash, ...siblingHash]));
    } else {
      // Target is right child, sibling present
      currentHash = blake2b256(new Uint8Array([...intPfx, ...siblingHash, ...currentHash]));
    }
    hashOps++;
  }

  const verified = Buffer.from(currentHash).equals(Buffer.from(expectedRoot));
  return { verified, hashOps, sliceOps, totalOps: hashOps + sliceOps };
}

// =====================================================================
// ERGOSCRIPT CONTRACT (for Phase B node compilation)
// =====================================================================
const EXTENSION_MERKLE_VERIFIER_ERGOSCRIPT = `{
  // Extension Merkle Proof Verifier — Coll[Int] fold, max depth 14
  //
  // Context extensions:
  //   Var(0): Coll[Byte] — flat proof, 33 bytes/level: [side(1) || sibHash(32)]
  //   Var(1): Coll[Byte] — leaf data (keyLen || key || value)
  //   Var(2): Coll[Byte] — expected extension root (32 bytes)
  //
  // Side byte encoding:
  //   0x00 = target is left child, sibling hash in bytes 1-32
  //   0x01 = target is right child, sibling hash in bytes 1-32
  //   0x02 = target is left child, right sibling is EmptyNode (bytes 1-32 ignored)
  //   0x03 = target is right child, left sibling is EmptyNode (bytes 1-32 ignored)

  val proof = getVar[Coll[Byte]](0).get
  val leafData = getVar[Coll[Byte]](1).get
  val expectedRoot = getVar[Coll[Byte]](2).get

  val proofLen = proof.size / 33

  val leafHash = blake2b256( Coll(0.toByte) ++ leafData )

  // Fold over level indices (max 14) — explicit Coll[Int] required for type inference
  val levels: Coll[Int] = Coll(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13)

  val computedRoot = levels.fold(leafHash, { (acc: Coll[Byte], i: Int) =>
    if (i >= proofLen) { acc }
    else {
      val off = i * 33
      val side = proof(off)
      val sib = proof.slice(off + 1, off + 33)
      val pfx = Coll(1.toByte)
      if (side >= 2.toByte) { blake2b256(pfx ++ acc) }
      else if (side == 0.toByte) { blake2b256(pfx ++ acc ++ sib) }
      else { blake2b256(pfx ++ sib ++ acc) }
    }
  })

  // Validate: all side bytes must be exactly 0x00, 0x01, 0x02, or 0x03
  // (cannot use <= 3 because Byte is signed: 0xFF = -1 would pass)
  val allSidesValid = levels.forall({ (i: Int) =>
    if (i >= proofLen) { true }
    else {
      val s = proof(i * 33)
      s == 0.toByte || s == 1.toByte || s == 2.toByte || s == 3.toByte
    }
  })

  sigmaProp( computedRoot == expectedRoot && proof.size % 33 == 0 && allSidesValid )
}`;

// =====================================================================
// CORRECTED WORST-CASE ANALYSIS
// =====================================================================
// The extension Merkle tree contains ALL fields from ALL prefixes:
//   0x00: SystemParameters (few, only at epoch boundaries)
//   0x01: NiPoPoW interlinks (10-20 per block)
//   0x02: ValidationRules (few, only when rules change)
//   0x04: SidechainsData (future — our data)
//   Other: potentially more prefixes in future
//
// ExtensionCandidate doc: "Data must be 32,768 bytes max"
// Key = 2 bytes, Value = max 64 bytes
// Minimum field size: 2 + 1 = 3 bytes (1-byte value)
// Maximum fields (theoretical): 32768 / 3 ≈ 10,922
// Maximum fields (typical 33-byte values): 32768 / 35 ≈ 936
//
// Proof depths:
//   10,922 fields → depth = ceil(log2(10922)) = 14
//   936 fields → depth = ceil(log2(936)) = 10
//   50 fields → depth = ceil(log2(50)) = 6
//   20 fields → depth = ceil(log2(20)) = 5

function calcWorstCaseDepth(): { scenario: string; fields: number; depth: number; proofBytes: number }[] {
  return [
    { scenario: 'Typical mainnet (NiPoPoW only)', fields: 15, depth: Math.ceil(Math.log2(15)), proofBytes: Math.ceil(Math.log2(15)) * 33 },
    { scenario: 'With sidechain + params', fields: 30, depth: Math.ceil(Math.log2(30)), proofBytes: Math.ceil(Math.log2(30)) * 33 },
    { scenario: 'Heavy extension (many prefixes)', fields: 100, depth: Math.ceil(Math.log2(100)), proofBytes: Math.ceil(Math.log2(100)) * 33 },
    { scenario: 'Max realistic (33-byte values)', fields: 936, depth: Math.ceil(Math.log2(936)), proofBytes: Math.ceil(Math.log2(936)) * 33 },
    { scenario: 'Theoretical max (1-byte values)', fields: 10922, depth: Math.ceil(Math.log2(10922)), proofBytes: Math.ceil(Math.log2(10922)) * 33 },
  ];
}

// =====================================================================
// RUN TESTS
// =====================================================================

let allPassed = true;
function test(name: string, fn: () => boolean) {
  const ok = fn();
  console.log(`  ${ok ? '✅' : '❌'} ${name}`);
  if (!ok) allPassed = false;
}

function bytesToHex(b: Uint8Array): string { return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(''); }
function hexToBytes(h: string): Uint8Array { const b = new Uint8Array(h.length/2); for(let i=0;i<h.length;i+=2) b[i/2]=parseInt(h.substring(i,i+2),16); return b; }

console.log('=== Spike 2b: ErgoScript Extension Merkle Proof Verification ===\n');

// --- Test 1: depth=1 (2 fields) ---
console.log('--- Depth 1 (2 fields) ---');
{
  const fields = [
    kvToLeaf(new Uint8Array([0x04, 0x01]), new Uint8Array(32).fill(0xAA)),
    kvToLeaf(new Uint8Array([0x04, 0x02]), new Uint8Array(32).fill(0xBB)),
  ];
  const { root, tree } = buildMerkleTree(fields);
  const proof = buildProofFlat(tree, 0, 2);
  const result = ergoScriptSimulation(fields[0], proof, root);
  test('Proof verifies (depth 1)', () => result.verified);
  test(`Hash ops: ${result.hashOps}, Slice ops: ${result.sliceOps}`, () => result.hashOps === 2);
  console.log(`  Proof size: ${proof.length} bytes`);
}

// --- Test 2: depth=4 (15 fields — typical mainnet block) ---
console.log('\n--- Depth 4 (15 fields, typical mainnet) ---');
{
  const fields = Array.from({ length: 15 }, (_, i) => {
    const key = new Uint8Array([0x01, i]);  // NiPoPoW interlinks
    const value = new Uint8Array(33); value.fill(i);
    return kvToLeaf(key, value);
  });
  const { root, tree } = buildMerkleTree(fields);
  // Verify proof for field at index 7 (middle)
  const proof = buildProofFlat(tree, 7, 15);
  const result = ergoScriptSimulation(fields[7], proof, root);
  test('Proof verifies (depth 4)', () => result.verified);
  test(`Hash ops: ${result.hashOps}, Slice ops: ${result.sliceOps}`, () => result.hashOps === 5);
  console.log(`  Proof size: ${proof.length} bytes`);
}

// --- Test 3: depth=5 (20 fields — mainnet with sidechain data) ---
console.log('\n--- Depth 5 (20 fields, mainnet + sidechain) ---');
{
  const fields = [
    ...Array.from({ length: 15 }, (_, i) => kvToLeaf(new Uint8Array([0x01, i]), new Uint8Array(33).fill(i))),
    ...Array.from({ length: 3 }, (_, i) => kvToLeaf(new Uint8Array([0x00, i]), new Uint8Array(8).fill(i))),
    kvToLeaf(new Uint8Array([0x04, 0x01]), blake2b256(new Uint8Array([1, 2, 3]))),  // sidechain commitment
    kvToLeaf(new Uint8Array([0x04, 0x02]), blake2b256(new Uint8Array([4, 5, 6]))),  // another sidechain
  ];
  const { root, tree } = buildMerkleTree(fields);
  // Verify proof for our sidechain field (index 18, key 0x0401)
  const proof = buildProofFlat(tree, 18, fields.length);
  const result = ergoScriptSimulation(fields[18], proof, root);
  test('Proof verifies for 0x0401 sidechain field (depth 5)', () => result.verified);
  test(`Hash ops: ${result.hashOps}`, () => result.hashOps === 6);
  console.log(`  Proof size: ${proof.length} bytes`);
}

// --- Test 4: depth=8 (200 fields — stress test) ---
console.log('\n--- Depth 8 (200 fields, stress) ---');
{
  const fields = Array.from({ length: 200 }, (_, i) => {
    const prefix = Math.floor(i / 50);
    const sub = i % 50;
    return kvToLeaf(new Uint8Array([prefix, sub]), new Uint8Array(16).fill(i & 0xFF));
  });
  const { root, tree } = buildMerkleTree(fields);
  const proof = buildProofFlat(tree, 150, fields.length);
  const result = ergoScriptSimulation(fields[150], proof, root);
  test('Proof verifies (depth 8)', () => result.verified);
  test(`Hash ops: ${result.hashOps}`, () => result.hashOps === 9);
  console.log(`  Proof size: ${proof.length} bytes`);
}

// --- Test 5: depth=10 (936 fields — max realistic) ---
console.log('\n--- Depth 10 (936 fields, max realistic) ---');
{
  const fields = Array.from({ length: 936 }, (_, i) => {
    const prefix = Math.floor(i / 256);
    const sub = i % 256;
    return kvToLeaf(new Uint8Array([prefix, sub]), new Uint8Array(33).fill(i & 0xFF));
  });
  const { root, tree } = buildMerkleTree(fields);
  const proof = buildProofFlat(tree, 500, fields.length);
  const result = ergoScriptSimulation(fields[500], proof, root);
  test('Proof verifies (depth 10, max realistic)', () => result.verified);
  test(`Hash ops: ${result.hashOps}`, () => result.hashOps === 11);
  console.log(`  Proof size: ${proof.length} bytes`);
}

// --- Test 6: Verify against real Ergo block (from Spike 1) ---
console.log('\n--- Real Ergo mainnet block cross-check ---');
{
  const realFields: [string, string][] = [
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
  const expectedRoot = '0a76e0eebac158ad24b57be692d6a054ee0d4d7b208955c473e648138de194cd';
  const leafDatas = realFields.map(([k, v]) => kvToLeaf(hexToBytes(k), hexToBytes(v)));
  const { root, tree } = buildMerkleTree(leafDatas);

  test('Root matches real block', () => bytesToHex(root) === expectedRoot);

  // Test ErgoScript simulation against real block
  const proof0 = buildProofFlat(tree, 0, realFields.length);
  const sim0 = ergoScriptSimulation(leafDatas[0], proof0, root);
  test('ErgoScript simulation verifies field 0 of real block', () => sim0.verified);

  const proof9 = buildProofFlat(tree, 9, realFields.length);
  const sim9 = ergoScriptSimulation(leafDatas[9], proof9, root);
  test('ErgoScript simulation verifies field 9 of real block', () => sim9.verified);
}

// --- Test 7: Negative test — wrong root should fail ---
console.log('\n--- Negative test: wrong root ---');
{
  const fields = [
    kvToLeaf(new Uint8Array([0x04, 0x01]), new Uint8Array(32).fill(0xAA)),
    kvToLeaf(new Uint8Array([0x04, 0x02]), new Uint8Array(32).fill(0xBB)),
  ];
  const { root, tree } = buildMerkleTree(fields);
  const proof = buildProofFlat(tree, 0, 2);
  const fakeRoot = new Uint8Array(32).fill(0xFF);
  const result = ergoScriptSimulation(fields[0], proof, fakeRoot);
  test('Proof correctly REJECTS wrong root', () => !result.verified);
}

// --- Corrected worst-case table ---
console.log('\n--- Corrected Worst-Case Analysis (ALL extension fields, not just 0x04) ---\n');
const worstCases = calcWorstCaseDepth();
console.log('  The Merkle tree covers ALL extension fields across ALL prefixes.');
console.log('  Total extension section limit: 32,768 bytes.');
console.log();
for (const wc of worstCases) {
  console.log(`  ${wc.scenario.padEnd(40)} | ${wc.fields.toString().padStart(6)} fields | depth ${wc.depth.toString().padStart(2)} | proof ${wc.proofBytes.toString().padStart(4)} bytes | ${wc.depth + 1} blake2b256 calls`);
}

// --- ErgoScript JIT cost estimate ---
console.log('\n--- JIT Cost Estimate (per proof depth) ---\n');
console.log('  ErgoScript blake2b256 cost: ~100-200 units per call (from sigmastate JIT costing)');
console.log('  ErgoScript slice() cost: ~10-50 units per call');
console.log('  ErgoScript collection fold: ~20 units overhead');
console.log('  ErgoScript getVar[Coll[Byte]]: ~100 units per call');
console.log();
for (const wc of worstCases) {
  const hashCalls = wc.depth + 1;
  const sliceCalls = wc.depth;
  const getVarCost = 3 * 100;  // 3 getVar calls
  const hashCost = hashCalls * 200;  // upper bound
  const sliceCost = sliceCalls * 50;  // upper bound
  const foldOverhead = 20;
  const total = getVarCost + hashCost + sliceCost + foldOverhead;
  console.log(`  Depth ${wc.depth.toString().padStart(2)} (${wc.fields.toString().padStart(6)} fields): ~${total} JIT units (budget: 1,000,000)`);
}

// --- ErgoScript source ---
console.log('\n--- ErgoScript Contract Source (for Phase B compilation) ---\n');
console.log(EXTENSION_MERKLE_VERIFIER_ERGOSCRIPT);

// --- Phase B: Node compilation attempt ---
console.log('\n--- Phase B: Node Compilation Test ---\n');
const NODE_URL = 'http://localhost:9052';
async function attemptNodeCompile() {
  try {
    const resp = await fetch(`${NODE_URL}/script/p2sAddress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api_key': 'hello' },
      body: JSON.stringify({ source: EXTENSION_MERKLE_VERIFIER_ERGOSCRIPT, treeVersion: 0 }),
    });
    if (resp.ok) {
      const data = await resp.json() as { address?: string };
      console.log(`  ✅ Contract compiled! Address: ${data.address}`);
      return true;
    } else {
      const err = await resp.text();
      console.log(`  ❌ Compilation failed: ${err}`);
      return false;
    }
  } catch (e: any) {
    console.log(`  ⚠️ Node offline (${NODE_URL}). Phase B deferred.`);
    console.log(`  Run this test again when testnet node is running.`);
    return null;
  }
}

const nodeResult = await attemptNodeCompile();

// === SUMMARY ===
console.log('\n====================================');
console.log('SPIKE 2b SUMMARY');
console.log('====================================\n');
console.log('Phase A (off-chain simulation): ' + (allPassed ? '✅ ALL PASSED' : '❌ SOME FAILED'));
console.log(`Phase B (node compilation):     ${nodeResult === true ? '✅ PASSED' : nodeResult === false ? '❌ FAILED' : '⏳ DEFERRED (node offline)'}`);
console.log('Phase C (TX evaluation):        ⏳ DEFERRED (requires testnet)');
console.log();
console.log('Key findings:');
console.log('  1. ErgoScript blake2b256 folding logic correctly reproduces extension roots');
console.log('  2. Flat proof format [side(1)||sibHash(32)] per level, side-byte encodes empty siblings');
console.log('  3. Worst-case depth across ALL prefixes: 14 (10,922 fields) → 462 bytes, 15 blake2b256 calls');
console.log('  4. Typical depth: 4-5 → 132-165 bytes, 5-6 blake2b256 calls');
console.log('  5. JIT cost estimate: ~1,000-3,500 units (well within 1M budget, NEEDS MEASUREMENT in Phase C)');
console.log('  6. Negative test: wrong root correctly rejected');

process.exit(allPassed ? 0 : 1);
