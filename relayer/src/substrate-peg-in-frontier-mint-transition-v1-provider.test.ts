import { describe, expect, it } from 'vitest';

import {
  SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
} from './peg-in-frontier-execution-identity-v1.js';
import {
  derivePegInFrontierContractStateStorageKeysV1,
} from './peg-in-frontier-contract-state-v1.js';
import {
  SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
  SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
} from './peg-in-frontier-event-v1.js';
import {
  derivePegInFrontierMintTransitionStatementV1,
} from './peg-in-frontier-mint-transition-v1.js';
import { SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX } from './peg-in-runtime-identity-v2.js';
import { deriveProcessedPegInRuntimeStorageKeyV1Hex } from './peg-in-runtime-state.js';
import {
  ReadOnlySubstrateFinalityRpc,
  requestPegInFrontierMintTransitionParentStateReadProofV1,
  requestPegInFrontierMintTransitionPostStateReadProofV1,
  type SubstrateRpcTransport,
} from './substrate-finality-provider.js';

const BLOCK_HASH = `0x${'11'.repeat(32)}`;
const PARENT_HASH = `0x${'10'.repeat(32)}`;
const SIDECHAIN_ID = `0x${'12'.repeat(32)}`;
const ERGO_BOX_ID = `0x${'44'.repeat(32)}`;
const BRIDGE = `0x${'22'.repeat(20)}`;
const TOKEN = `0x${'21'.repeat(20)}`;
const RECIPIENT = `0x${'55'.repeat(20)}`;
const RECORD_KEY = deriveProcessedPegInRuntimeStorageKeyV1Hex({
  sidechainIdHex: SIDECHAIN_ID,
  ergoBoxIdHex: ERGO_BOX_ID,
});
const CONTRACT_KEYS = derivePegInFrontierContractStateStorageKeysV1({
  bridgeAddressHex: BRIDGE,
  tokenAddressHex: TOKEN,
  ergoBoxIdHex: ERGO_BOX_ID,
});
const TRANSITION_KEYS = derivePegInFrontierMintTransitionStatementV1({
  sidechainIdHex: SIDECHAIN_ID,
  ergoBoxIdHex: ERGO_BOX_ID,
  tokenAddressHex: TOKEN,
  recipientHex: RECIPIENT,
});
const POST_KEYS = [
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
  TRANSITION_KEYS.recipientBalanceStorageKeyHex,
] as const;
const PARENT_KEYS = [
  SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
  TRANSITION_KEYS.parentNativeProcessedRecordStorageKeyHex,
  CONTRACT_KEYS.bridgeAccountCodeStorageKeyHex,
  CONTRACT_KEYS.tokenAccountCodeStorageKeyHex,
  CONTRACT_KEYS.bridgeOwnerStorageKeyHex,
  CONTRACT_KEYS.bridgeConfigurationStorageKeyHex,
  CONTRACT_KEYS.processedPegInStorageKeyHex,
  CONTRACT_KEYS.tokenTotalSupplyStorageKeyHex,
  CONTRACT_KEYS.tokenOwnerStorageKeyHex,
  TRANSITION_KEYS.recipientBalanceStorageKeyHex,
] as const;

describe('peg-in Frontier mint-transition V1 read proofs', () => {
  it('requests exactly thirteen post-state keys without individual storage reads', async () => {
    const transport = new RecordingTransport({ at: BLOCK_HASH, proof: ['0x0102'] });
    const result = await requestPegInFrontierMintTransitionPostStateReadProofV1(
      new ReadOnlySubstrateFinalityRpc(transport),
      { ...baseInput(), nativeBlockHashHex: BLOCK_HASH },
    );

    expect(transport.calls).toEqual([{
      method: 'state_getReadProof',
      params: [POST_KEYS, BLOCK_HASH],
    }]);
    expect(result.storageKeysHex).toEqual(POST_KEYS);
    expect(result.proofNodesHex).toEqual(['0102']);
    expect(result.proofBytes).toBe(2);
    expect(transport.calls.some(call => call.method === 'state_getStorage')).toBe(false);
  });

  it('requests exactly ten parent-state keys without individual storage reads', async () => {
    const transport = new RecordingTransport({ at: PARENT_HASH, proof: ['0x010203'] });
    const result = await requestPegInFrontierMintTransitionParentStateReadProofV1(
      new ReadOnlySubstrateFinalityRpc(transport),
      { ...baseInput(), nativeBlockHashHex: PARENT_HASH },
    );

    expect(transport.calls).toEqual([{
      method: 'state_getReadProof',
      params: [PARENT_KEYS, PARENT_HASH],
    }]);
    expect(result.storageKeysHex).toEqual(PARENT_KEYS);
    expect(result.proofNodesHex).toEqual(['010203']);
    expect(result.proofBytes).toBe(3);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.storageKeysHex)).toBe(true);
    expect(Object.isFrozen(result.proofNodesHex)).toBe(true);
  });

  it.each([
    ['wrong block', { at: BLOCK_HASH, proof: ['0x01'] }, /requested native block/i],
    ['empty proof', { at: PARENT_HASH, proof: [] }, /must contain trie nodes/i],
    ['duplicate node', { at: PARENT_HASH, proof: ['0xaa', '0xAA'] }, /duplicate/i],
    ['unknown response field', { at: PARENT_HASH, proof: ['0x01'], extra: true }, /unknown fields/i],
  ] as const)('rejects parent proof %s', async (_label, response, message) => {
    await expect(requestPegInFrontierMintTransitionParentStateReadProofV1(
      new ReadOnlySubstrateFinalityRpc(new RecordingTransport(response)),
      { ...baseInput(), nativeBlockHashHex: PARENT_HASH },
    )).rejects.toThrow(message);
  });
});

function baseInput() {
  return {
    sidechainIdHex: SIDECHAIN_ID,
    ergoBoxIdHex: ERGO_BOX_ID,
    bridgeAddressHex: BRIDGE,
    tokenAddressHex: TOKEN,
    recipientHex: RECIPIENT,
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
