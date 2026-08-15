import { describe, expect, it } from 'vitest';

import {
  SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
} from './peg-in-frontier-execution-identity-v1.js';
import {
  SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
} from './peg-in-runtime-identity-v2.js';
import {
  deriveProcessedPegInRuntimeStorageKeyV1Hex,
} from './peg-in-runtime-state.js';
import {
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_BYTES,
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODE_BYTES,
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODES,
  ReadOnlySubstrateFinalityRpc,
  requestPegInFrontierExecutionIdentityReadProofV1,
  type SubstrateRpcTransport,
} from './substrate-finality-provider.js';

const BLOCK_HASH = `0x${'11'.repeat(32)}`;
const SIDECHAIN_ID = `0x${'22'.repeat(32)}`;
const ERGO_BOX_ID = `0x${'33'.repeat(32)}`;
const RECORD_KEY = deriveProcessedPegInRuntimeStorageKeyV1Hex({
  sidechainIdHex: SIDECHAIN_ID,
  ergoBoxIdHex: ERGO_BOX_ID,
});
const ORDERED_KEYS = [
  SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
  SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
  RECORD_KEY,
] as const;

describe('peg-in Frontier execution identity V1 read proof', () => {
  it('pins the Rust-mirrored proof bounds', () => {
    expect({
      nodes: MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODES,
      nodeBytes: MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODE_BYTES,
      proofBytes: MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_BYTES,
    }).toEqual({
      nodes: 512,
      nodeBytes: 8 * 1024 * 1024,
      proofBytes: 12 * 1024 * 1024,
    });
  });

  it('makes one exact read-proof request without a storage read and freezes the result', async () => {
    const transport = new RecordingTransport({
      at: BLOCK_HASH,
      proof: ['0x0102', '0x030405'],
    });
    const result = await requestPegInFrontierExecutionIdentityReadProofV1(
      new ReadOnlySubstrateFinalityRpc(transport),
      baseInput(),
    );

    expect(transport.calls).toEqual([{
      method: 'state_getReadProof',
      params: [ORDERED_KEYS, BLOCK_HASH],
    }]);
    expect(transport.calls.some(({ method }) => method === 'state_getStorage')).toBe(false);
    expect(result).toEqual({
      atNativeBlockHashHex: BLOCK_HASH.slice(2),
      storageKeysHex: ORDERED_KEYS,
      proofNodesHex: ['0102', '030405'],
      proofBytes: 5,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.storageKeysHex)).toBe(true);
    expect(Object.isFrozen(result.proofNodesHex)).toBe(true);
  });

  it.each([
    ['wrong target', { at: `0x${'44'.repeat(32)}`, proof: ['0x01'] }, /requested native block/i],
    ['empty proof', { at: BLOCK_HASH, proof: [] }, /must contain trie nodes/i],
    [
      'unknown response field',
      { at: BLOCK_HASH, proof: ['0x01'], extra: true },
      /missing or unknown fields/i,
    ],
    ['duplicate normalized node', { at: BLOCK_HASH, proof: ['0xAA', '0xaa'] }, /duplicate/i],
    ['missing prefix', { at: BLOCK_HASH, proof: ['01'] }, /0x-prefixed/i],
    ['empty node', { at: BLOCK_HASH, proof: ['0x'] }, /non-empty whole bytes/i],
    ['partial byte', { at: BLOCK_HASH, proof: ['0x0'] }, /non-empty whole bytes/i],
    ['non-hex node', { at: BLOCK_HASH, proof: ['0xzz'] }, /hexadecimal bytes/i],
  ] as const)('rejects %s', async (_label, response, message) => {
    await expect(requestPegInFrontierExecutionIdentityReadProofV1(
      new ReadOnlySubstrateFinalityRpc(new RecordingTransport(response)),
      baseInput(),
    )).rejects.toThrow(message);
  });

  it('rejects too many proof nodes', async () => {
    await expect(requestPegInFrontierExecutionIdentityReadProofV1(
      new ReadOnlySubstrateFinalityRpc(new RecordingTransport({
        at: BLOCK_HASH,
        proof: Array.from(
          { length: MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODES + 1 },
          (_, index) => `0x${index.toString(16).padStart(4, '0')}`,
        ),
      })),
      baseInput(),
    )).rejects.toThrow(/exceeds 512 nodes/i);
  });

  it('rejects a node beyond the Rust-mirrored per-node bound', async () => {
    await expect(requestPegInFrontierExecutionIdentityReadProofV1(
      new ReadOnlySubstrateFinalityRpc(new RecordingTransport({
        at: BLOCK_HASH,
        proof: [
          `0x${'aa'.repeat(MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODE_BYTES + 1)}`,
        ],
      })),
      baseInput(),
    )).rejects.toThrow(
      new RegExp(
        `exceeds ${MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODE_BYTES} bytes`,
        'i',
      ),
    );
  });

  it('rejects aggregate bytes beyond the Rust-mirrored proof bound', async () => {
    const maxNode = `0x${'aa'.repeat(MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODE_BYTES)}`;
    const remainingBound =
      MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_BYTES
      - MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODE_BYTES;
    await expect(requestPegInFrontierExecutionIdentityReadProofV1(
      new ReadOnlySubstrateFinalityRpc(new RecordingTransport({
        at: BLOCK_HASH,
        proof: [maxNode, `0x${'bb'.repeat(remainingBound)}`, '0x01'],
      })),
      baseInput(),
    )).rejects.toThrow(
      new RegExp(
        `exceeds ${MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_BYTES} bytes`,
        'i',
      ),
    );
  });
});

function baseInput() {
  return {
    nativeBlockHashHex: BLOCK_HASH,
    sidechainIdHex: SIDECHAIN_ID,
    ergoBoxIdHex: ERGO_BOX_ID,
  };
}

class RecordingTransport implements SubstrateRpcTransport {
  readonly calls: Array<{ method: string; params: readonly unknown[] }> = [];

  constructor(private readonly response: unknown) {}

  async request<T>(method: string, params: readonly unknown[]): Promise<T> {
    this.calls.push({ method, params });
    return this.response as T;
  }
}
