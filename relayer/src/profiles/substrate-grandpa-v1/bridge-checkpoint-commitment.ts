import blakejs from 'blakejs';

import {
  buildTrustlessBurnCommitment,
  encodeTrustlessBurnLeaf,
  type TrustlessBurnLeafInput,
} from './trustless-burn-proof.js';

export const BRIDGE_EXTENSION_KEY_HEX = '0401';
export const BRIDGE_CHECKPOINT_VERSION = 1;
export const BRIDGE_HASH_ALGORITHM_BLAKE2B256 = 1;
export const BRIDGE_FINALITY_RULE_GRANDPA_JUSTIFICATION_V1 = 1;
export const BRIDGE_CHECKPOINT_FLAGS_NONE = 0;
export const BRIDGE_CHECKPOINT_ENCODED_BYTES = 216;
export const BRIDGE_EXTENSION_VALUE_BYTES = 64;
export const BRIDGE_CHECKPOINT_DOMAIN = 'E2S_BRIDGE_CHECKPOINT_V1';
export const GRANDPA_AUTHORITY_SET_DOMAIN = 'E2S_GRANDPA_AUTHORITY_SET_V1';
export const GRANDPA_JUSTIFICATION_DOMAIN = 'E2S_GRANDPA_JUSTIFICATION_V1';

export interface BridgeCheckpointV1Input {
  version?: number;
  hashAlgorithmId?: number;
  finalityRuleId?: number;
  flags?: number;
  sidechainIdHex: string;
  sidechainHeight: string | number | bigint;
  sidechainConsensusBlockHashHex: string;
  executionBlockHashHex: string;
  bridgeEventRootHex: string;
  burnLeafCount: number;
  finalityAuthoritySetId: string | number | bigint;
  finalityAuthoritySetHashHex: string;
  finalityProofHashHex: string;
}

export interface BridgeCheckpointV1 {
  version: 1;
  hashAlgorithmId: 1;
  finalityRuleId: 1;
  flags: 0;
  sidechainIdHex: string;
  sidechainHeight: string;
  sidechainConsensusBlockHashHex: string;
  executionBlockHashHex: string;
  bridgeEventRootHex: string;
  burnLeafCount: number;
  finalityAuthoritySetId: string;
  finalityAuthoritySetHashHex: string;
  finalityProofHashHex: string;
}

export interface BridgeCheckpointCommitmentV1 {
  checkpoint: BridgeCheckpointV1;
  encodedCheckpointHex: string;
  checkpointCommitmentHex: string;
  extensionKeyHex: typeof BRIDGE_EXTENSION_KEY_HEX;
  extensionValueHex: string;
}

export interface BridgeCheckpointFromBurnsV1Input extends Omit<
  BridgeCheckpointV1Input,
  'bridgeEventRootHex' | 'burnLeafCount'
> {
  burnLeavesInCanonicalOrder: TrustlessBurnLeafInput[];
}

export function deriveGrandpaJustificationHashHex(justificationBytes: Buffer): string {
  if (!Buffer.isBuffer(justificationBytes) || justificationBytes.length === 0) {
    throw new Error('GRANDPA justification bytes must be non-empty');
  }
  return blake2b256(Buffer.concat([
    Buffer.from(GRANDPA_JUSTIFICATION_DOMAIN, 'ascii'),
    justificationBytes,
  ])).toString('hex');
}

export function deriveGrandpaAuthoritySetHashHex(authoritySetBytes: Buffer): string {
  if (!Buffer.isBuffer(authoritySetBytes) || authoritySetBytes.length === 0) {
    throw new Error('GRANDPA authority-set bytes must be non-empty');
  }
  return blake2b256(Buffer.concat([
    Buffer.from(GRANDPA_AUTHORITY_SET_DOMAIN, 'ascii'),
    authoritySetBytes,
  ])).toString('hex');
}

export function encodeBridgeCheckpointV1(input: BridgeCheckpointV1Input): Buffer {
  const checkpoint = normalizeCheckpoint(input);
  return Buffer.concat([
    Buffer.from([
      checkpoint.version,
      checkpoint.hashAlgorithmId,
      checkpoint.finalityRuleId,
      checkpoint.flags,
    ]),
    Buffer.from(checkpoint.sidechainIdHex, 'hex'),
    uint64Be(checkpoint.sidechainHeight, 'sidechainHeight'),
    Buffer.from(checkpoint.sidechainConsensusBlockHashHex, 'hex'),
    Buffer.from(checkpoint.executionBlockHashHex, 'hex'),
    Buffer.from(checkpoint.bridgeEventRootHex, 'hex'),
    uint32Be(checkpoint.burnLeafCount, 'burnLeafCount'),
    uint64Be(checkpoint.finalityAuthoritySetId, 'finalityAuthoritySetId'),
    Buffer.from(checkpoint.finalityAuthoritySetHashHex, 'hex'),
    Buffer.from(checkpoint.finalityProofHashHex, 'hex'),
  ]);
}

export function decodeBridgeCheckpointV1(encoded: Buffer | string): BridgeCheckpointV1 {
  const bytes = normalizeBytes(encoded, BRIDGE_CHECKPOINT_ENCODED_BYTES, 'encoded checkpoint');
  const checkpoint: BridgeCheckpointV1Input = {
    version: bytes[0],
    hashAlgorithmId: bytes[1],
    finalityRuleId: bytes[2],
    flags: bytes[3],
    sidechainIdHex: bytes.subarray(4, 36).toString('hex'),
    sidechainHeight: bytes.readBigUInt64BE(36),
    sidechainConsensusBlockHashHex: bytes.subarray(44, 76).toString('hex'),
    executionBlockHashHex: bytes.subarray(76, 108).toString('hex'),
    bridgeEventRootHex: bytes.subarray(108, 140).toString('hex'),
    burnLeafCount: bytes.readUInt32BE(140),
    finalityAuthoritySetId: bytes.readBigUInt64BE(144),
    finalityAuthoritySetHashHex: bytes.subarray(152, 184).toString('hex'),
    finalityProofHashHex: bytes.subarray(184, 216).toString('hex'),
  };
  return normalizeCheckpoint(checkpoint);
}

export function deriveBridgeCheckpointCommitmentHex(
  checkpoint: BridgeCheckpointV1Input | Buffer | string,
): string {
  const encoded = Buffer.isBuffer(checkpoint) || typeof checkpoint === 'string'
    ? normalizeBytes(checkpoint, BRIDGE_CHECKPOINT_ENCODED_BYTES, 'encoded checkpoint')
    : encodeBridgeCheckpointV1(checkpoint);
  // Decoding rejects unsupported version, hash, finality, and flag identifiers.
  decodeBridgeCheckpointV1(encoded);
  return blake2b256(Buffer.concat([
    Buffer.from(BRIDGE_CHECKPOINT_DOMAIN, 'ascii'),
    encoded,
  ])).toString('hex');
}

export function buildBridgeCheckpointCommitmentV1(
  input: BridgeCheckpointV1Input,
): BridgeCheckpointCommitmentV1 {
  const encoded = encodeBridgeCheckpointV1(input);
  const checkpoint = decodeBridgeCheckpointV1(encoded);
  const checkpointCommitmentHex = deriveBridgeCheckpointCommitmentHex(encoded);
  return {
    checkpoint,
    encodedCheckpointHex: encoded.toString('hex'),
    checkpointCommitmentHex,
    extensionKeyHex: BRIDGE_EXTENSION_KEY_HEX,
    extensionValueHex: encodeBridgeExtensionValueV1({
      bridgeEventRootHex: checkpoint.bridgeEventRootHex,
      checkpointCommitmentHex,
    }),
  };
}

export function buildBridgeCheckpointFromBurnsV1(
  input: BridgeCheckpointFromBurnsV1Input,
): BridgeCheckpointCommitmentV1 {
  if (input.burnLeavesInCanonicalOrder.length === 0) {
    throw new Error('V1 checkpoint requires at least one successful canonical burn');
  }
  const sidechainIdHex = normalizeHex(input.sidechainIdHex, 32, 'sidechainId');
  const executionBlockHashHex = normalizeHex(
    input.executionBlockHashHex,
    32,
    'executionBlockHash',
  );
  for (const burn of input.burnLeavesInCanonicalOrder) {
    const leaf = encodeTrustlessBurnLeaf(burn);
    if (leaf.sidechainIdHex !== sidechainIdHex) {
      throw new Error('every burn leaf must match the checkpoint sidechainId');
    }
    if (leaf.sidechainBlockHashHex !== executionBlockHashHex) {
      throw new Error('every burn leaf must match the checkpoint executionBlockHash');
    }
  }

  const commitment = buildTrustlessBurnCommitment(input.burnLeavesInCanonicalOrder);
  return buildBridgeCheckpointCommitmentV1({
    ...input,
    sidechainIdHex,
    executionBlockHashHex,
    bridgeEventRootHex: commitment.bridgeEventRootHex,
    burnLeafCount: commitment.leaves.length,
  });
}

export function encodeBridgeExtensionValueV1(input: {
  bridgeEventRootHex: string;
  checkpointCommitmentHex: string;
}): string {
  return Buffer.concat([
    Buffer.from(normalizeHex(input.bridgeEventRootHex, 32, 'bridgeEventRoot'), 'hex'),
    Buffer.from(normalizeHex(input.checkpointCommitmentHex, 32, 'checkpointCommitment'), 'hex'),
  ]).toString('hex');
}

export function decodeBridgeExtensionValueV1(value: Buffer | string): {
  bridgeEventRootHex: string;
  checkpointCommitmentHex: string;
} {
  const bytes = normalizeBytes(value, BRIDGE_EXTENSION_VALUE_BYTES, '0x0401 V1 extension value');
  return {
    bridgeEventRootHex: bytes.subarray(0, 32).toString('hex'),
    checkpointCommitmentHex: bytes.subarray(32, 64).toString('hex'),
  };
}

export function verifyBridgeExtensionBindingV1(
  checkpoint: BridgeCheckpointV1Input,
  extensionValue: Buffer | string,
): boolean {
  const expected = buildBridgeCheckpointCommitmentV1(checkpoint);
  const observed = decodeBridgeExtensionValueV1(extensionValue);
  return observed.bridgeEventRootHex === expected.checkpoint.bridgeEventRootHex &&
    observed.checkpointCommitmentHex === expected.checkpointCommitmentHex;
}

function normalizeCheckpoint(input: BridgeCheckpointV1Input): BridgeCheckpointV1 {
  const version = input.version ?? BRIDGE_CHECKPOINT_VERSION;
  const hashAlgorithmId = input.hashAlgorithmId ?? BRIDGE_HASH_ALGORITHM_BLAKE2B256;
  const finalityRuleId = input.finalityRuleId ?? BRIDGE_FINALITY_RULE_GRANDPA_JUSTIFICATION_V1;
  const flags = input.flags ?? BRIDGE_CHECKPOINT_FLAGS_NONE;
  if (version !== BRIDGE_CHECKPOINT_VERSION) {
    throw new Error(`unsupported bridge checkpoint version: ${version}`);
  }
  if (hashAlgorithmId !== BRIDGE_HASH_ALGORITHM_BLAKE2B256) {
    throw new Error(`unsupported bridge checkpoint hash algorithm: ${hashAlgorithmId}`);
  }
  if (finalityRuleId !== BRIDGE_FINALITY_RULE_GRANDPA_JUSTIFICATION_V1) {
    throw new Error(`unsupported bridge checkpoint finality rule: ${finalityRuleId}`);
  }
  if (flags !== BRIDGE_CHECKPOINT_FLAGS_NONE) {
    throw new Error(`unsupported bridge checkpoint flags: ${flags}`);
  }

  const burnLeafCount = normalizeUint32(input.burnLeafCount, 'burnLeafCount');
  if (burnLeafCount === 0) {
    throw new Error('V1 checkpoint requires burnLeafCount greater than zero');
  }
  return {
    version: BRIDGE_CHECKPOINT_VERSION,
    hashAlgorithmId: BRIDGE_HASH_ALGORITHM_BLAKE2B256,
    finalityRuleId: BRIDGE_FINALITY_RULE_GRANDPA_JUSTIFICATION_V1,
    flags: BRIDGE_CHECKPOINT_FLAGS_NONE,
    sidechainIdHex: normalizeHex(input.sidechainIdHex, 32, 'sidechainId'),
    sidechainHeight: normalizeUint64(input.sidechainHeight, 'sidechainHeight').toString(),
    sidechainConsensusBlockHashHex: normalizeHex(
      input.sidechainConsensusBlockHashHex,
      32,
      'sidechainConsensusBlockHash',
    ),
    executionBlockHashHex: normalizeHex(input.executionBlockHashHex, 32, 'executionBlockHash'),
    bridgeEventRootHex: normalizeHex(input.bridgeEventRootHex, 32, 'bridgeEventRoot'),
    burnLeafCount,
    finalityAuthoritySetId: normalizeUint64(
      input.finalityAuthoritySetId,
      'finalityAuthoritySetId',
    ).toString(),
    finalityAuthoritySetHashHex: normalizeHex(
      input.finalityAuthoritySetHashHex,
      32,
      'finalityAuthoritySetHash',
    ),
    finalityProofHashHex: normalizeHex(input.finalityProofHashHex, 32, 'finalityProofHash'),
  };
}

function normalizeBytes(value: Buffer | string, expectedBytes: number, label: string): Buffer {
  if (Buffer.isBuffer(value)) {
    if (value.length !== expectedBytes) {
      throw new Error(`${label} must be ${expectedBytes} bytes, got ${value.length}`);
    }
    return Buffer.from(value);
  }
  return Buffer.from(normalizeHex(value, expectedBytes, label), 'hex');
}

function normalizeHex(value: string, expectedBytes: number, label: string): string {
  const clean = value?.startsWith('0x') ? value.slice(2) : value;
  if (!clean || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be hex`);
  }
  if (clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes, got ${clean.length / 2}`);
  }
  return clean.toLowerCase();
}

function normalizeUint32(value: number, label: string): number {
  if (!Number.isInteger(value) || !Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error(`${label} must fit uint32`);
  }
  return value;
}

function normalizeUint64(value: string | number | bigint, label: string): bigint {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`${label} number input must be a non-negative safe integer`);
  }
  const raw = String(value);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  const parsed = BigInt(raw);
  if (parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit uint64`);
  }
  return parsed;
}

function uint32Be(value: number, label: string): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(normalizeUint32(value, label));
  return out;
}

function uint64Be(value: string | number | bigint, label: string): Buffer {
  const out = Buffer.alloc(8);
  out.writeBigUInt64BE(normalizeUint64(value, label));
  return out;
}

function blake2b256(data: Buffer): Buffer {
  return Buffer.from(blakejs.blake2b(data, undefined, 32));
}
