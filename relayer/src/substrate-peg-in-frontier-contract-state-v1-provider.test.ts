import { describe, expect, it } from 'vitest';

import {
  SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
} from './peg-in-frontier-execution-identity-v1.js';
import {
  SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
  SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
} from './peg-in-frontier-event-v1.js';
import {
  derivePegInFrontierContractStateStorageKeysV1,
} from './peg-in-frontier-contract-state-v1.js';
import { SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX } from './peg-in-runtime-identity-v2.js';
import { deriveProcessedPegInRuntimeStorageKeyV1Hex } from './peg-in-runtime-state.js';
import {
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES,
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODE_BYTES,
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODES,
} from './native-finalized-peg-in-frontier-execution-identity-v1.js';
import {
  ReadOnlySubstrateFinalityRpc,
  requestPegInFrontierContractStateReadProofV1,
  type SubstrateRpcTransport,
} from './substrate-finality-provider.js';

const BLOCK_HASH = `0x${'11'.repeat(32)}`;
const SIDECHAIN_ID = `0x${'12'.repeat(32)}`;
const ERGO_BOX_ID = `0x${'44'.repeat(32)}`;
const BRIDGE = `0x${'22'.repeat(20)}`;
const TOKEN = `0x${'21'.repeat(20)}`;
const RECORD_KEY = deriveProcessedPegInRuntimeStorageKeyV1Hex({
  sidechainIdHex: SIDECHAIN_ID,
  ergoBoxIdHex: ERGO_BOX_ID,
});
const CONTRACT_KEYS = derivePegInFrontierContractStateStorageKeysV1({
  bridgeAddressHex: BRIDGE,
  tokenAddressHex: TOKEN,
  ergoBoxIdHex: ERGO_BOX_ID,
});
const ORDERED_KEYS = [
  SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
  SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
  SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
  SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
  RECORD_KEY,
  CONTRACT_KEYS.bridgeAccountCodeStorageKeyHex,
  CONTRACT_KEYS.tokenAccountCodeStorageKeyHex,
  CONTRACT_KEYS.bridgeOwnerStorageKeyHex,
  CONTRACT_KEYS.bridgeConfigurationStorageKeyHex,
  CONTRACT_KEYS.processedPegInStorageKeyHex,
  CONTRACT_KEYS.tokenTotalSupplyStorageKeyHex,
  CONTRACT_KEYS.tokenOwnerStorageKeyHex,
] as const;

describe('peg-in Frontier contract-state V1 read proof', () => {
  it('makes one exact twelve-key request without storage reads', async () => {
    const transport = new RecordingTransport({
      at: BLOCK_HASH,
      proof: ['0x0102', '0x030405'],
    });
    const result = await requestPegInFrontierContractStateReadProofV1(
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
    ['wrong target', { at: `0x${'55'.repeat(32)}`, proof: ['0x01'] }, /requested native block/i],
    ['empty proof', { at: BLOCK_HASH, proof: [] }, /must contain trie nodes/i],
    ['unknown field', { at: BLOCK_HASH, proof: ['0x01'], extra: true }, /unknown fields/i],
    ['duplicate node', { at: BLOCK_HASH, proof: ['0xAA', '0xaa'] }, /duplicate/i],
  ] as const)('rejects %s', async (_label, response, message) => {
    await expect(requestPegInFrontierContractStateReadProofV1(
      new ReadOnlySubstrateFinalityRpc(new RecordingTransport(response)),
      baseInput(),
    )).rejects.toThrow(message);
  });

  it('rejects an invalid contract identity before issuing RPC', async () => {
    const transport = new RecordingTransport({ at: BLOCK_HASH, proof: ['0x01'] });
    await expect(requestPegInFrontierContractStateReadProofV1(
      new ReadOnlySubstrateFinalityRpc(transport),
      { ...baseInput(), tokenAddressHex: BRIDGE },
    )).rejects.toThrow(/must differ/i);
    expect(transport.calls).toEqual([]);
  });

  it('rejects proof-node count before decoding node contents', async () => {
    const response = {
      at: BLOCK_HASH,
      proof: Array.from(
        { length: MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODES + 1 },
        () => '0x01',
      ),
    };
    await expect(requestPegInFrontierContractStateReadProofV1(
      new ReadOnlySubstrateFinalityRpc(new RecordingTransport(response)),
      baseInput(),
    )).rejects.toThrow(/exceeds 512 nodes/i);
  });

  it('rejects one oversized proof node', async () => {
    const response = {
      at: BLOCK_HASH,
      proof: [`0x${'aa'.repeat(
        MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODE_BYTES + 1,
      )}`],
    };
    await expect(requestPegInFrontierContractStateReadProofV1(
      new ReadOnlySubstrateFinalityRpc(new RecordingTransport(response)),
      baseInput(),
    )).rejects.toThrow(/node 0 exceeds/i);
  });

  it('rejects aggregate proof bytes independently of per-node bounds', async () => {
    const firstBytes = Math.floor(
      MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES / 2,
    );
    const response = {
      at: BLOCK_HASH,
      proof: [
        `0x${'aa'.repeat(firstBytes)}`,
        `0x${'bb'.repeat(
          MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES - firstBytes + 1,
        )}`,
      ],
    };
    await expect(requestPegInFrontierContractStateReadProofV1(
      new ReadOnlySubstrateFinalityRpc(new RecordingTransport(response)),
      baseInput(),
    )).rejects.toThrow(/read proof exceeds .* bytes/i);
  });
});

function baseInput() {
  return {
    nativeBlockHashHex: BLOCK_HASH,
    sidechainIdHex: SIDECHAIN_ID,
    ergoBoxIdHex: ERGO_BOX_ID,
    bridgeAddressHex: BRIDGE,
    tokenAddressHex: TOKEN,
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
