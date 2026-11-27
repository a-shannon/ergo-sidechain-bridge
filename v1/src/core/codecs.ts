import blake from 'blakejs';

// ============================================================================
// Domain Constants (must match contracts/v1/*.es byte-for-byte)
// ============================================================================

export const MINER_FEE_ERGO_TREE_HEX =
  '1005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304';

export const MIN_MINER_FEE = 1_000_000n;
export const MAX_MINER_FEE = 5_000_000n;
export const DEFAULT_MINER_FEE = 1_100_000n;
export const MIN_BOX_VALUE = 1_000_000n;

export const DOMAIN_FAMILY_ID = asciiBytes('E2S_BRIDGE_V1_FAMILY_ID_V1');
export const DOMAIN_DEPOSIT_COMMITMENT = asciiBytes('E2S_BRIDGE_V1_DEPOSIT_COMMITMENT_V1');
export const DOMAIN_TRACKER_KEY = asciiBytes('E2S_BRIDGE_V1_TRACKER_KEY_V1');
export const DOMAIN_TRACKER_VALUE = asciiBytes('E2S_BRIDGE_V1_TRACKER_VALUE_V1');
export const DOMAIN_CHECKPOINT_STMT = asciiBytes('E2S_BRIDGE_V1_CHECKPOINT_STMT_V1');
export const DOMAIN_STARK_PAYLOAD = asciiBytes('E2S_BRIDGE_V1_STARK_PAYLOAD_V1\0');
export const DOMAIN_PROOF_BUNDLE = asciiBytes('E2S_BRIDGE_V1_PROOF_BUNDLE_V1\0');
export const DOMAIN_BURN_LEAF = asciiBytes('E2S_TRUSTLESS_BURN_LEAF_V1');
export const DOMAIN_BURN_NODE = asciiBytes('E2S_TRUSTLESS_BURN_NODE_V1');
export const DOMAIN_BURN_ID = asciiBytes('E2S_TRUSTLESS_BURN_ID_V1');
export const DOMAIN_KEY_SET = asciiBytes('E2S_BRIDGE_V1_ERGO_KEYSET_V1');
export const DOMAIN_EIP0045_STATEMENT = asciiBytes('ERGO_STARK_STATEMENT_V1_00');

export const ZERO_32 = new Uint8Array(32);
export const ZERO_22 = new Uint8Array(22);
export const ZERO_20 = new Uint8Array(20);
export const ZERO_8 = new Uint8Array(8);
export const ZERO_32_HEX = '00'.repeat(32);

export const AUTH_MODE_FEDERATED = 1;
export const AUTH_MODE_EIP0045_STARK = 2;

export const UPGRADE_MODE_NONE = 0;
export const UPGRADE_MODE_ROTATE = 1;
export const UPGRADE_MODE_GRADUATE_STARK = 2;

export const TRACKER_VALUE_LENGTH = 370;
export const BURN_LEAF_LENGTH = 205;
export const PEG_IN_INTENT_LENGTH = 229;
export const TRACKER_R9_LENGTH = 81;
export const STARK_PAYLOAD_LENGTH = 300;

// ============================================================================
// Byte & Hash Primitives
// ============================================================================

export function asciiBytes(text: string): Uint8Array {
  return Uint8Array.from(Buffer.from(text, 'ascii'));
}

export function strip0x(hex: string): string {
  return hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
}

export function hexToBytes(hex: string, expectedLen?: number): Uint8Array {
  const clean = strip0x(hex).toLowerCase();
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/.test(clean)) {
    throw new Error(`Invalid hex string: ${hex.slice(0, 32)}`);
  }
  const bytes = Uint8Array.from(Buffer.from(clean, 'hex'));
  if (expectedLen !== undefined && bytes.length !== expectedLen) {
    throw new Error(`Expected ${expectedLen} bytes, got ${bytes.length}`);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function u16be(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`u16 out of range: ${value}`);
  }
  return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

export function u32be(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`u32 out of range: ${value}`);
  }
  const out = new Uint8Array(4);
  const view = new DataView(out.buffer);
  view.setUint32(0, value, false);
  return out;
}

export function u32le(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`u32le out of range: ${value}`);
  }
  const out = new Uint8Array(4);
  const view = new DataView(out.buffer);
  view.setUint32(0, value, true);
  return out;
}

export function u64be(value: bigint): Uint8Array {
  if (value < 0n || value > 0x7fff_ffff_ffff_ffffn) {
    throw new Error(`signed u64be out of range: ${value}`);
  }
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setBigUint64(0, value, false);
  return out;
}

export function readU32be(bytes: Uint8Array, offset: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
  return view.getUint32(0, false);
}

export function readU64be(bytes: Uint8Array, offset: number): bigint {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
  return view.getBigUint64(0, false);
}

export function blake2b256(data: Uint8Array): Uint8Array {
  return blake.blake2b(data, undefined, 32);
}

export function blake2b256Hex(data: Uint8Array): string {
  return bytesToHex(blake2b256(data));
}

// ============================================================================
// Address / ErgoTree Utilities
// ============================================================================

export function p2pkErgoTreeFromPubKeyHex(compressedPubKeyHex: string): string {
  const pk = hexToBytes(compressedPubKeyHex, 33);
  if (pk[0] !== 0x02 && pk[0] !== 0x03) {
    throw new Error('Compressed secp256k1 pubkey must start with 0x02 or 0x03');
  }
  return `0008cd${bytesToHex(pk)}`;
}

export function normalizeRecipientErgoTreeHex(recipientHex: string): string {
  const bytes = hexToBytes(recipientHex);
  if (bytes.length === 33 && (bytes[0] === 0x02 || bytes[0] === 0x03)) {
    return `0008cd${bytesToHex(bytes)}`;
  }
  if (
    bytes.length === 36 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x08 &&
    bytes[2] === 0xcd &&
    (bytes[3] === 0x02 || bytes[3] === 0x03)
  ) {
    return bytesToHex(bytes);
  }
  throw new Error(
    `Recipient must be 33-byte compressed pubkey or 36-byte P2PK ErgoTree (got ${bytes.length} bytes)`,
  );
}

// ============================================================================
// Family & Committee Identity Derivation
// ============================================================================

export function computeFamilyId(params: {
  sourceNetworkIdHex: string;
  sidechainIdHex: string;
  bridgeAddressHex: string;
  tokenAddressHex: string;
  trackerNftIdHex: string;
  dupNftIdHex: string;
  reserveNftIdHex: string;
}): string {
  return blake2b256Hex(
    concatBytes(
      DOMAIN_FAMILY_ID,
      hexToBytes(params.sourceNetworkIdHex, 32),
      hexToBytes(params.sidechainIdHex, 32),
      hexToBytes(params.bridgeAddressHex, 20),
      hexToBytes(params.tokenAddressHex, 20),
      hexToBytes(params.trackerNftIdHex, 32),
      hexToBytes(params.dupNftIdHex, 32),
      hexToBytes(params.reserveNftIdHex, 32),
    ),
  );
}

export function computeErgoKeySetDigest(threshold: number, pubKeysHex: string[]): string {
  if (threshold < 1 || threshold > pubKeysHex.length) {
    throw new Error(`Invalid committee threshold ${threshold}/${pubKeysHex.length}`);
  }
  const parts: Uint8Array[] = [DOMAIN_KEY_SET, u16be(threshold), u16be(pubKeysHex.length)];
  for (const pk of pubKeysHex) {
    parts.push(hexToBytes(pk, 33));
  }
  return blake2b256Hex(concatBytes(...parts));
}

// ============================================================================
// Peg-In Intent (229 bytes) & Deposit Commitment
// ============================================================================

export interface PegInIntentV2 {
  sourceNetworkIdHex: string;
  sidechainIdHex: string;
  bridgeAddressHex: string;
  tokenAddressHex: string;
  familyIdHex: string;
  reserveNftIdHex: string;
  amountNanoErg: bigint;
  evmRecipientHex: string;
}

export function encodePegInIntentV2(intent: PegInIntentV2): Uint8Array {
  const evmRecipient = hexToBytes(intent.evmRecipientHex, 20);
  if (evmRecipient.every((b) => b === 0)) {
    throw new Error('EVM recipient must be non-zero');
  }
  if (intent.amountNanoErg <= 0n) {
    throw new Error('Deposit amount must be positive');
  }
  const out = concatBytes(
    new Uint8Array([2]),
    hexToBytes(intent.sourceNetworkIdHex, 32),
    hexToBytes(intent.sidechainIdHex, 32),
    hexToBytes(intent.bridgeAddressHex, 20),
    hexToBytes(intent.tokenAddressHex, 20),
    hexToBytes(intent.familyIdHex, 32),
    hexToBytes(intent.reserveNftIdHex, 32),
    ZERO_32,
    u64be(intent.amountNanoErg),
    evmRecipient,
  );
  if (out.length !== PEG_IN_INTENT_LENGTH) {
    throw new Error(`Unexpected PegInIntentV2 length: ${out.length}`);
  }
  return out;
}

export function decodePegInIntentV2(bytes: Uint8Array): PegInIntentV2 {
  if (bytes.length !== PEG_IN_INTENT_LENGTH || bytes[0] !== 2) {
    throw new Error(`Invalid PegInIntentV2 (${bytes.length} bytes, version=${bytes[0]})`);
  }
  return {
    sourceNetworkIdHex: bytesToHex(bytes.slice(1, 33)),
    sidechainIdHex: bytesToHex(bytes.slice(33, 65)),
    bridgeAddressHex: bytesToHex(bytes.slice(65, 85)),
    tokenAddressHex: bytesToHex(bytes.slice(85, 105)),
    familyIdHex: bytesToHex(bytes.slice(105, 137)),
    reserveNftIdHex: bytesToHex(bytes.slice(137, 169)),
    amountNanoErg: readU64be(bytes, 201),
    evmRecipientHex: `0x${bytesToHex(bytes.slice(209, 229))}`,
  };
}

export function computeDepositCommitmentHex(
  familyIdHex: string,
  sourceLockBoxIdHex: string,
  encodedIntent: Uint8Array,
): string {
  if (encodedIntent.length !== PEG_IN_INTENT_LENGTH) {
    throw new Error('Invalid encoded intent length');
  }
  return blake2b256Hex(
    concatBytes(
      DOMAIN_DEPOSIT_COMMITMENT,
      hexToBytes(familyIdHex, 32),
      hexToBytes(sourceLockBoxIdHex, 32),
      encodedIntent,
    ),
  );
}

// ============================================================================
// Burn Leaf V1 (205 bytes) & Odd-Width Blake2b Merkle Tree
// ============================================================================

export interface BurnLeafV1 {
  sidechainIdHex: string;
  executionBlockHashHex: string;
  sidechainTxHashHex: string;
  eventIndex: number;
  recipientErgoTreeHex: string;
  amountNanoErg: bigint;
}

export function computeBurnIdHex(
  sidechainIdHex: string,
  sidechainTxHashHex: string,
  eventIndex: number,
): string {
  return blake2b256Hex(
    concatBytes(
      DOMAIN_BURN_ID,
      hexToBytes(sidechainIdHex, 32),
      hexToBytes(sidechainTxHashHex, 32),
      u32be(eventIndex),
    ),
  );
}

export function encodeBurnLeafV1(leaf: BurnLeafV1): {
  burnIdHex: string;
  recipientHashHex: string;
  encodedLeaf: Uint8Array;
} {
  if (leaf.amountNanoErg <= 0n) {
    throw new Error('Burn amount must be positive');
  }
  const burnIdHex = computeBurnIdHex(
    leaf.sidechainIdHex,
    leaf.sidechainTxHashHex,
    leaf.eventIndex,
  );
  const recipientHashHex = blake2b256Hex(hexToBytes(leaf.recipientErgoTreeHex));
  const encodedLeaf = concatBytes(
    new Uint8Array([1]),
    hexToBytes(leaf.sidechainIdHex, 32),
    hexToBytes(leaf.executionBlockHashHex, 32),
    hexToBytes(burnIdHex, 32),
    hexToBytes(leaf.sidechainTxHashHex, 32),
    u32be(leaf.eventIndex),
    hexToBytes(recipientHashHex, 32),
    u64be(leaf.amountNanoErg),
    ZERO_32,
  );
  if (encodedLeaf.length !== BURN_LEAF_LENGTH) {
    throw new Error(`Unexpected BurnLeafV1 length: ${encodedLeaf.length}`);
  }
  return { burnIdHex, recipientHashHex, encodedLeaf };
}

export interface BurnMerkleProofStep {
  side: 0 | 1; // 0 = sibling on left, 1 = sibling on right
  siblingHash: Uint8Array;
}

export interface BurnMerkleTree {
  rootHex: string;
  leafCount: number;
  depth: number;
  getProof(leafIndex: number): BurnMerkleProofStep[];
  getProofBytes(leafIndex: number): Uint8Array;
}

export function buildBurnMerkleTree(encodedLeaves: Uint8Array[]): BurnMerkleTree {
  if (encodedLeaves.length < 1 || encodedLeaves.length > 256) {
    throw new Error(`Burn leaf count must be 1..256 (got ${encodedLeaves.length})`);
  }
  let level = encodedLeaves.map((leaf) => {
    if (leaf.length !== BURN_LEAF_LENGTH) {
      throw new Error(`Burn leaf must be ${BURN_LEAF_LENGTH} bytes`);
    }
    return blake2b256(concatBytes(DOMAIN_BURN_LEAF, leaf));
  });
  const levels: Uint8Array[][] = [level];
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      next.push(blake2b256(concatBytes(DOMAIN_BURN_NODE, left, right)));
    }
    levels.push(next);
    level = next;
  }
  const rootHex = bytesToHex(level[0]);
  const depth = levels.length - 1;
  const leafCount = encodedLeaves.length;

  function getProof(leafIndex: number): BurnMerkleProofStep[] {
    if (leafIndex < 0 || leafIndex >= leafCount) {
      throw new Error(`leafIndex ${leafIndex} out of bounds for leafCount ${leafCount}`);
    }
    const steps: BurnMerkleProofStep[] = [];
    let idx = leafIndex;
    for (let d = 0; d < depth; d++) {
      const cur = levels[d];
      if (idx % 2 === 1) {
        steps.push({ side: 0, siblingHash: cur[idx - 1] });
      } else {
        const sibling = idx + 1 < cur.length ? cur[idx + 1] : cur[idx];
        steps.push({ side: 1, siblingHash: sibling });
      }
      idx = Math.floor(idx / 2);
    }
    return steps;
  }

  function getProofBytes(leafIndex: number): Uint8Array {
    const steps = getProof(leafIndex);
    const parts: Uint8Array[] = [];
    for (const s of steps) {
      parts.push(new Uint8Array([s.side]), s.siblingHash);
    }
    return concatBytes(...parts);
  }

  return { rootHex, leafCount, depth, getProof, getProofBytes };
}

// ============================================================================
// Tracker Governance R9 (81 bytes) & Actions
// ============================================================================

export interface TrackerGovernanceR9 {
  epoch: bigint;
  pendingMode: 0 | 1 | 2;
  pendingTargetScriptHashHex: string;
  pendingActivatesAtHeight: bigint;
  pendingTrustAnchorDigestHex: string;
}

export function encodeTrackerGovernanceR9(state: TrackerGovernanceR9): Uint8Array {
  const out = concatBytes(
    u64be(state.epoch),
    new Uint8Array([state.pendingMode]),
    hexToBytes(state.pendingTargetScriptHashHex, 32),
    u64be(state.pendingActivatesAtHeight),
    hexToBytes(state.pendingTrustAnchorDigestHex, 32),
  );
  if (out.length !== TRACKER_R9_LENGTH) {
    throw new Error(`Unexpected R9 length: ${out.length}`);
  }
  return out;
}

export function decodeTrackerGovernanceR9(bytes: Uint8Array): TrackerGovernanceR9 {
  if (bytes.length !== TRACKER_R9_LENGTH) {
    throw new Error(`Expected 81-byte R9 governance state, got ${bytes.length}`);
  }
  const mode = bytes[8];
  if (mode !== 0 && mode !== 1 && mode !== 2) {
    throw new Error(`Invalid pendingMode in R9: ${mode}`);
  }
  return {
    epoch: readU64be(bytes, 0),
    pendingMode: mode,
    pendingTargetScriptHashHex: bytesToHex(bytes.slice(9, 41)),
    pendingActivatesAtHeight: readU64be(bytes, 41),
    pendingTrustAnchorDigestHex: bytesToHex(bytes.slice(49, 81)),
  };
}

export function initialTrackerGovernanceR9(epoch: bigint): Uint8Array {
  return encodeTrackerGovernanceR9({
    epoch,
    pendingMode: 0,
    pendingTargetScriptHashHex: ZERO_32_HEX,
    pendingActivatesAtHeight: 0n,
    pendingTrustAnchorDigestHex: ZERO_32_HEX,
  });
}

export interface CheckpointAdmitParams {
  sourceNetworkIdHex: string;
  sidechainIdHex: string;
  sourceHeight: bigint;
  sourceBlockHashHex: string;
  executionBlockHashHex: string;
  bridgeEventRootHex: string;
  burnCount: number;
}

export function encodeTrackerAdmitAction(params: CheckpointAdmitParams): Uint8Array {
  if (params.burnCount < 1 || params.burnCount > 256) {
    throw new Error(`burnCount must be 1..256 (got ${params.burnCount})`);
  }
  const action = concatBytes(
    new Uint8Array([1, 1]),
    hexToBytes(params.sourceNetworkIdHex, 32),
    hexToBytes(params.sidechainIdHex, 32),
    u64be(params.sourceHeight),
    hexToBytes(params.sourceBlockHashHex, 32),
    hexToBytes(params.executionBlockHashHex, 32),
    hexToBytes(params.bridgeEventRootHex, 32),
    u32be(params.burnCount),
  );
  if (action.length !== 174) {
    throw new Error(`Unexpected admit action length: ${action.length}`);
  }
  return action;
}

export function encodeTrackerProposeAction(params: {
  mode: 1 | 2;
  targetScriptHashHex: string;
  trustAnchorDigestHex: string;
}): Uint8Array {
  const action = concatBytes(
    new Uint8Array([2, params.mode]),
    hexToBytes(params.targetScriptHashHex, 32),
    hexToBytes(params.trustAnchorDigestHex, 32),
  );
  if (action.length !== 66) {
    throw new Error(`Unexpected propose action length: ${action.length}`);
  }
  return action;
}

export function encodeTrackerCancelAction(): Uint8Array {
  return new Uint8Array([3]);
}

export function encodeTrackerExecuteAction(): Uint8Array {
  return new Uint8Array([4]);
}

// ============================================================================
// Unified 370-byte Tracker AVL Entry (Shared by FED & EIP-0045 STARK)
// ============================================================================

export function computeTrackerKeyHex(params: {
  sourceNetworkIdHex: string;
  sidechainIdHex: string;
  sourceHeight: bigint;
  sourceBlockHashHex: string;
  executionBlockHashHex: string;
}): string {
  return blake2b256Hex(
    concatBytes(
      DOMAIN_TRACKER_KEY,
      hexToBytes(params.sourceNetworkIdHex, 32),
      hexToBytes(params.sidechainIdHex, 32),
      u64be(params.sourceHeight),
      hexToBytes(params.sourceBlockHashHex, 32),
      hexToBytes(params.executionBlockHashHex, 32),
    ),
  );
}

export interface TrackerValueV1 {
  authMode: 1 | 2;
  familyIdHex: string;
  sidechainIdHex: string;
  sourceHeight: bigint;
  sourceBlockHashHex: string;
  executionBlockHashHex: string;
  bridgeEventRootHex: string;
  burnCount: number;
  statementIdHex: string;
  admissionHeight: bigint;
  authorityEpoch: bigint;
  authorityDigestHex: string;
  trustAnchorDigestHex: string;
  sourceNetworkIdHex: string;
}

export function computeFederatedStatementIdHex(admitAction: Uint8Array): string {
  if (admitAction.length !== 174) {
    throw new Error('admitAction must be 174 bytes');
  }
  return blake2b256Hex(concatBytes(DOMAIN_CHECKPOINT_STMT, admitAction));
}

export function encodeTrackerValueV1(v: TrackerValueV1): Uint8Array {
  const out = concatBytes(
    DOMAIN_TRACKER_VALUE,
    new Uint8Array([1, v.authMode]),
    hexToBytes(v.familyIdHex, 32),
    hexToBytes(v.sidechainIdHex, 32),
    u64be(v.sourceHeight),
    hexToBytes(v.sourceBlockHashHex, 32),
    hexToBytes(v.executionBlockHashHex, 32),
    hexToBytes(v.bridgeEventRootHex, 32),
    u32be(v.burnCount),
    hexToBytes(v.statementIdHex, 32),
    u64be(v.admissionHeight),
    u64be(v.authorityEpoch),
    hexToBytes(v.authorityDigestHex, 32),
    hexToBytes(v.trustAnchorDigestHex, 32),
    hexToBytes(v.sourceNetworkIdHex, 32),
    ZERO_22,
  );
  if (out.length !== TRACKER_VALUE_LENGTH) {
    throw new Error(`Unexpected TrackerValueV1 length: ${out.length}`);
  }
  return out;
}

export function decodeTrackerValueV1(bytes: Uint8Array): TrackerValueV1 {
  if (bytes.length !== TRACKER_VALUE_LENGTH) {
    throw new Error(`Expected 370-byte TrackerValueV1, got ${bytes.length}`);
  }
  const authMode = bytes[31];
  if (authMode !== 1 && authMode !== 2) {
    throw new Error(`Invalid tracker authMode: ${authMode}`);
  }
  return {
    authMode,
    familyIdHex: bytesToHex(bytes.slice(32, 64)),
    sidechainIdHex: bytesToHex(bytes.slice(64, 96)),
    sourceHeight: readU64be(bytes, 96),
    sourceBlockHashHex: bytesToHex(bytes.slice(104, 136)),
    executionBlockHashHex: bytesToHex(bytes.slice(136, 168)),
    bridgeEventRootHex: bytesToHex(bytes.slice(168, 200)),
    burnCount: readU32be(bytes, 200),
    statementIdHex: bytesToHex(bytes.slice(204, 236)),
    admissionHeight: readU64be(bytes, 236),
    authorityEpoch: readU64be(bytes, 244),
    authorityDigestHex: bytesToHex(bytes.slice(252, 284)),
    trustAnchorDigestHex: bytesToHex(bytes.slice(284, 316)),
    sourceNetworkIdHex: bytesToHex(bytes.slice(316, 348)),
  };
}

// ============================================================================
// BridgeDup Proof Bundle V1 (71B header || Merkle path || DUP lookup || DUP insert)
// ============================================================================

export function encodeProofBundleV1(params: {
  sidechainHeight: bigint;
  leafIndex: number;
  leafCount: number;
  merkleProofBytes: Uint8Array;
  dupLookupProofBytes: Uint8Array;
  dupInsertProofBytes: Uint8Array;
}): Uint8Array {
  if (params.merkleProofBytes.length % 33 !== 0) {
    throw new Error('merkleProofBytes must be a multiple of 33 bytes');
  }
  const nodeCount = params.merkleProofBytes.length / 33;
  return concatBytes(
    DOMAIN_PROOF_BUNDLE,
    new Uint8Array([1]),
    u64be(params.sidechainHeight),
    u64be(BigInt(params.leafIndex)),
    u64be(BigInt(params.leafCount)),
    u64be(BigInt(nodeCount)),
    u64be(BigInt(params.dupLookupProofBytes.length)),
    params.merkleProofBytes,
    params.dupLookupProofBytes,
    params.dupInsertProofBytes,
  );
}

// ============================================================================
// EIP-0045 Preactivation Seam (BridgeStarkPayloadV1 & ErgoStatementV1)
// ============================================================================

export function encodeStarkPayloadV1(params: {
  trackerNftIdHex: string;
  familyIdHex: string;
  sourceNetworkIdHex: string;
  sidechainIdHex: string;
  sourceHeight: bigint;
  sourceBlockHashHex: string;
  executionBlockHashHex: string;
  bridgeEventRootHex: string;
  burnCount: number;
  trustAnchorDigestHex: string;
}): Uint8Array {
  const out = concatBytes(
    DOMAIN_STARK_PAYLOAD,
    new Uint8Array([1]),
    hexToBytes(params.trackerNftIdHex, 32),
    hexToBytes(params.familyIdHex, 32),
    hexToBytes(params.sourceNetworkIdHex, 32),
    hexToBytes(params.sidechainIdHex, 32),
    u64be(params.sourceHeight),
    hexToBytes(params.sourceBlockHashHex, 32),
    hexToBytes(params.executionBlockHashHex, 32),
    hexToBytes(params.bridgeEventRootHex, 32),
    u32be(params.burnCount),
    hexToBytes(params.trustAnchorDigestHex, 32),
  );
  if (out.length !== STARK_PAYLOAD_LENGTH) {
    throw new Error(`Unexpected StarkPayloadV1 length: ${out.length}`);
  }
  return out;
}

/**
 * Exact EIP-0045 ErgoStatementV1 byte layout committed by the RISC Zero 3.1.0+
 * verifier profile:
 *   domain(26) || version(1) || chainDomainId(32) || profileId(32) ||
 *   programId(32) || blake2b256(SELF.propositionBytes)(32) ||
 *   u32le(payload.length) || payload
 */
export function encodeEip0045StatementV1(params: {
  chainDomainIdHex: string;
  profileIdHex: string;
  programIdHex: string;
  selfContractIdHex: string;
  applicationPayload: Uint8Array;
}): Uint8Array {
  return concatBytes(
    DOMAIN_EIP0045_STATEMENT,
    new Uint8Array([1]),
    hexToBytes(params.chainDomainIdHex, 32),
    hexToBytes(params.profileIdHex, 32),
    hexToBytes(params.programIdHex, 32),
    hexToBytes(params.selfContractIdHex, 32),
    u32le(params.applicationPayload.length),
    params.applicationPayload,
  );
}
