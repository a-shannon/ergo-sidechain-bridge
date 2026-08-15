import { describe, expect, it } from 'vitest';

import {
  SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
} from './peg-in-frontier-execution-identity-v1.js';
import {
  SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
  SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
} from './peg-in-frontier-event-v1.js';
import { SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX } from './peg-in-runtime-identity-v2.js';
import { deriveProcessedPegInRuntimeStorageKeyV1Hex } from './peg-in-runtime-state.js';
import {
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_BYTES,
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODE_BYTES,
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODES,
  ReadOnlySubstrateFinalityRpc,
  requestPegInFrontierEventReadProofV1,
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
  SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
  SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
  RECORD_KEY,
] as const;

describe('peg-in Frontier event V1 read proof', () => {
  it('makes one exact five-key request without storage reads and freezes the result', async () => {
    const transport = new RecordingTransport({
      at: BLOCK_HASH,
      proof: ['0x0102', '0x030405'],
    });
    const result = await requestPegInFrontierEventReadProofV1(
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
    ['unknown field', { at: BLOCK_HASH, proof: ['0x01'], extra: true }, /unknown fields/i],
    ['duplicate node', { at: BLOCK_HASH, proof: ['0xAA', '0xaa'] }, /duplicate/i],
    ['malformed node', { at: BLOCK_HASH, proof: ['0x0'] }, /whole bytes/i],
  ] as const)('rejects %s', async (_label, response, message) => {
    await expect(requestPegInFrontierEventReadProofV1(
      new ReadOnlySubstrateFinalityRpc(new RecordingTransport(response)),
      baseInput(),
    )).rejects.toThrow(message);
  });

  it('enforces the inherited node and aggregate proof bounds', async () => {
    await expect(requestPegInFrontierEventReadProofV1(
      new ReadOnlySubstrateFinalityRpc(new RecordingTransport({
        at: BLOCK_HASH,
        proof: Array.from(
          { length: MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODES + 1 },
          (_, index) => `0x${index.toString(16).padStart(4, '0')}`,
        ),
      })),
      baseInput(),
    )).rejects.toThrow(/exceeds 512 nodes/i);

    const maxNode = `0x${'aa'.repeat(MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODE_BYTES)}`;
    const remaining = MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_BYTES
      - MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_PROOF_NODE_BYTES;
    await expect(requestPegInFrontierEventReadProofV1(
      new ReadOnlySubstrateFinalityRpc(new RecordingTransport({
        at: BLOCK_HASH,
        proof: [maxNode, `0x${'bb'.repeat(remaining)}`, '0x01'],
      })),
      baseInput(),
    )).rejects.toThrow(/exceeds 12582912 bytes/i);
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
