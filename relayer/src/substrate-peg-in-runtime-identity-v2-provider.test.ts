import { describe, expect, it } from 'vitest';

import {
  MAX_PEG_IN_RUNTIME_IDENTITY_PROOF_BYTES,
  MAX_PEG_IN_RUNTIME_IDENTITY_PROOF_NODE_BYTES,
  MAX_PEG_IN_RUNTIME_IDENTITY_PROOF_NODES,
  ReadOnlySubstrateFinalityRpc,
  requestPegInRuntimeIdentityReadProofV2,
  type SubstrateRpcTransport,
} from './substrate-finality-provider.js';
import {
  PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX,
  deriveProcessedPegInRuntimeStorageKeyV1Hex,
} from './peg-in-runtime-state.js';
import {
  SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
} from './peg-in-runtime-identity-v2.js';

const BLOCK_HASH = `0x${'11'.repeat(32)}`;
const SIDECHAIN_ID = `0x${'22'.repeat(32)}`;
const ERGO_BOX_ID = `0x${'33'.repeat(32)}`;
const RECORD_KEY = deriveProcessedPegInRuntimeStorageKeyV1Hex({
  sidechainIdHex: SIDECHAIN_ID,
  ergoBoxIdHex: ERGO_BOX_ID,
});

describe('peg-in runtime identity V2 read proof', () => {
  it.each([
    [
      'membership',
      [SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX, RECORD_KEY],
    ],
    [
      'nonMembership',
      [
        SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
        PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX,
        RECORD_KEY,
      ],
    ],
  ] as const)('requests exactly one ordered %s proof', async (outcome, expectedKeys) => {
    const transport = new RecordingTransport({
      at: BLOCK_HASH,
      proof: ['0x0102', '0x030405'],
    });
    const result = await requestPegInRuntimeIdentityReadProofV2(
      new ReadOnlySubstrateFinalityRpc(transport),
      {
        nativeBlockHashHex: BLOCK_HASH,
        sidechainIdHex: SIDECHAIN_ID,
        ergoBoxIdHex: ERGO_BOX_ID,
        outcome,
      },
    );

    expect(transport.calls).toEqual([{
      method: 'state_getReadProof',
      params: [expectedKeys, BLOCK_HASH],
    }]);
    expect(result).toEqual({
      atNativeBlockHashHex: BLOCK_HASH.slice(2),
      outcome,
      storageKeysHex: expectedKeys,
      proofNodesHex: ['0102', '030405'],
      proofBytes: 5,
    });
  });

  it.each([
    ['wrong target', { at: `0x${'44'.repeat(32)}`, proof: ['0x01'] }, /requested native block/i],
    ['empty proof', { at: BLOCK_HASH, proof: [] }, /must contain trie nodes/i],
    [
      'unknown response field',
      { at: BLOCK_HASH, proof: ['0x01'], extra: true },
      /missing or unknown fields/i,
    ],
    ['duplicate node', { at: BLOCK_HASH, proof: ['0x01', '0x01'] }, /duplicate/i],
    [
      'oversized node',
      { at: BLOCK_HASH, proof: [`0x${'aa'.repeat(MAX_PEG_IN_RUNTIME_IDENTITY_PROOF_NODE_BYTES + 1)}`] },
      /exceeds/i,
    ],
  ] as const)('rejects %s', async (_label, response, message) => {
    await expect(requestPegInRuntimeIdentityReadProofV2(
      new ReadOnlySubstrateFinalityRpc(new RecordingTransport(response)),
      baseInput(),
    )).rejects.toThrow(message);
  });

  it('rejects too many proof nodes before accepting candidate material', async () => {
    await expect(requestPegInRuntimeIdentityReadProofV2(
      new ReadOnlySubstrateFinalityRpc(new RecordingTransport({
        at: BLOCK_HASH,
        proof: Array.from(
          { length: MAX_PEG_IN_RUNTIME_IDENTITY_PROOF_NODES + 1 },
          (_, index) => `0x${index.toString(16).padStart(4, '0')}`,
        ),
      })),
      baseInput(),
    )).rejects.toThrow(/exceeds 512 nodes/i);
  });

  it('rejects aggregate proof bytes beyond the separate V2 bound', async () => {
    const node = `0x${'aa'.repeat(MAX_PEG_IN_RUNTIME_IDENTITY_PROOF_NODE_BYTES)}`;
    await expect(requestPegInRuntimeIdentityReadProofV2(
      new ReadOnlySubstrateFinalityRpc(new RecordingTransport({
        at: BLOCK_HASH,
        proof: [node, `0x${'ab'.repeat(MAX_PEG_IN_RUNTIME_IDENTITY_PROOF_NODE_BYTES)}`, '0x01'],
      })),
      baseInput(),
    )).rejects.toThrow(
      new RegExp(`exceeds ${MAX_PEG_IN_RUNTIME_IDENTITY_PROOF_BYTES} bytes`, 'i'),
    );
  });
});

function baseInput() {
  return {
    nativeBlockHashHex: BLOCK_HASH,
    sidechainIdHex: SIDECHAIN_ID,
    ergoBoxIdHex: ERGO_BOX_ID,
    outcome: 'membership' as const,
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
