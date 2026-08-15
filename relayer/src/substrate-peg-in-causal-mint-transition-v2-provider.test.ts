import { describe, expect, it } from 'vitest';

import { SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX } from
  './peg-in-frontier-execution-identity-v1.js';
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
import {
  derivePegInCausalPendingAdmissionStorageKeyV2,
  derivePegInCausalRuntimeStorageKeysV2,
} from './peg-in-causal-runtime-state-v2.js';
import { SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX } from './peg-in-runtime-identity-v2.js';
import { deriveProcessedPegInRuntimeStorageKeyV1Hex } from './peg-in-runtime-state.js';
import {
  ReadOnlySubstrateFinalityRpc,
  requestPegInCausalMintTransitionParentStateReadProofV2,
  requestPegInCausalMintTransitionPostStateReadProofV2,
  type SubstrateRpcTransport,
} from './substrate-finality-provider.js';

const CHILD_HASH = `0x${'11'.repeat(32)}`;
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
const CAUSAL_KEYS = derivePegInCausalRuntimeStorageKeysV2({
  sidechainIdHex: SIDECHAIN_ID,
  ergoBoxIdHex: ERGO_BOX_ID,
});
const ADDITIONAL_RECORD_KEY = `0x${'5a'.repeat(32)}`;
const ADDITIONAL_PENDING_STORAGE_KEY =
  derivePegInCausalPendingAdmissionStorageKeyV2(ADDITIONAL_RECORD_KEY);
const CHILD_PENDING_KEYS_SCALE = scalePendingKeys([ADDITIONAL_RECORD_KEY]);
const PARENT_PENDING_KEYS_SCALE = scalePendingKeys([
  CAUSAL_KEYS.recordKeyHex,
  ADDITIONAL_RECORD_KEY,
]);
const CAUSAL_PROOF_SUFFIX = [
  CAUSAL_KEYS.currentPegInProfileStorageKeyHex,
  CAUSAL_KEYS.currentCausalProfileStorageKeyHex,
  CAUSAL_KEYS.causalEnforcementStorageKeyHex,
  CAUSAL_KEYS.pendingKeysStorageKeyHex,
  CAUSAL_KEYS.pendingAdmissionStorageKeyHex,
  CAUSAL_KEYS.consumedAdmissionStorageKeyHex,
] as const;
const CHILD_KEYS = [
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
  ...CAUSAL_PROOF_SUFFIX,
  ADDITIONAL_PENDING_STORAGE_KEY,
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
  ...CAUSAL_PROOF_SUFFIX,
  ADDITIONAL_PENDING_STORAGE_KEY,
] as const;

describe('peg-in causal mint-transition V2 read proofs', () => {
  it('requests the exact child and parent supersets of T20C without authority reads', async () => {
    const transport = new RecordingTransport((method, params) => {
      const at = String(params[1]);
      if (method === 'state_getStorage') {
        return at === CHILD_HASH ? CHILD_PENDING_KEYS_SCALE : PARENT_PENDING_KEYS_SCALE;
      }
      return { at, proof: ['0x010203'] };
    });
    const rpc = new ReadOnlySubstrateFinalityRpc(transport);

    const child = await requestPegInCausalMintTransitionPostStateReadProofV2(
      rpc,
      { ...baseInput(), nativeBlockHashHex: CHILD_HASH },
    );
    const parent = await requestPegInCausalMintTransitionParentStateReadProofV2(
      rpc,
      { ...baseInput(), nativeBlockHashHex: PARENT_HASH },
    );

    expect(transport.calls).toEqual([
      {
        method: 'state_getStorage',
        params: [CAUSAL_KEYS.pendingKeysStorageKeyHex, CHILD_HASH],
      },
      { method: 'state_getReadProof', params: [CHILD_KEYS, CHILD_HASH] },
      {
        method: 'state_getStorage',
        params: [CAUSAL_KEYS.pendingKeysStorageKeyHex, PARENT_HASH],
      },
      { method: 'state_getReadProof', params: [PARENT_KEYS, PARENT_HASH] },
    ]);
    expect(child.storageKeysHex).toEqual(CHILD_KEYS);
    expect(parent.storageKeysHex).toEqual(PARENT_KEYS);
    expect(child.causalStorageKeys).toEqual(CAUSAL_KEYS);
    expect(parent.causalStorageKeys).toEqual(CAUSAL_KEYS);
    expect(child.proofNodesHex).toEqual(['010203']);
    expect(parent.proofBytes).toBe(3);
    expect(child.pendingKeysScaleHex).toBe(CHILD_PENDING_KEYS_SCALE);
    expect(parent.pendingKeysScaleHex).toBe(PARENT_PENDING_KEYS_SCALE);
    expect(child.discoveredPendingRecordKeysHex).toEqual([ADDITIONAL_RECORD_KEY]);
    expect(parent.discoveredPendingRecordKeysHex).toEqual([
      CAUSAL_KEYS.recordKeyHex,
      ADDITIONAL_RECORD_KEY,
    ]);
    expect(new Set(child.storageKeysHex).size).toBe(20);
    expect(new Set(parent.storageKeysHex).size).toBe(17);
    expect(transport.calls.map(call => call.method)).toContain('state_getStorage');
    expect(transport.calls.map(call => call.method)).not.toContain('state_getKeysPaged');
    expect(Object.isFrozen(child)).toBe(true);
    expect(Object.isFrozen(parent.storageKeysHex)).toBe(true);
  });

  it.each([
    ['wrong child hash', { at: PARENT_HASH, proof: ['0x01'] }, /requested native block/i],
    ['empty parent proof', { at: PARENT_HASH, proof: [] }, /must contain trie nodes/i],
    ['duplicate parent node', { at: PARENT_HASH, proof: ['0xaa', '0xAA'] }, /duplicate/i],
    ['unknown parent field', { at: PARENT_HASH, proof: ['0x01'], extra: true }, /unknown fields/i],
  ] as const)('rejects %s', async (label, response, message) => {
    const transport = new RecordingTransport((method) =>
      method === 'state_getStorage' ? scalePendingKeys([]) : response,
    );
    const operation = label.includes('child')
      ? requestPegInCausalMintTransitionPostStateReadProofV2(
          new ReadOnlySubstrateFinalityRpc(transport),
          { ...baseInput(), nativeBlockHashHex: CHILD_HASH },
        )
      : requestPegInCausalMintTransitionParentStateReadProofV2(
          new ReadOnlySubstrateFinalityRpc(transport),
          { ...baseInput(), nativeBlockHashHex: PARENT_HASH },
        );
    await expect(operation).rejects.toThrow(message);
    expect(transport.calls).toHaveLength(2);
  });

  it.each([
    ['absent', null, /is absent/i],
    ['truncated', '0x0411', /malformed SCALE length/i],
    [
      'duplicate',
      scalePendingKeys([ADDITIONAL_RECORD_KEY, ADDITIONAL_RECORD_KEY]),
      /duplicate/i,
    ],
  ] as const)('rejects an %s discovered pending-key list before proof acquisition', async (
    _label,
    response,
    message,
  ) => {
    const transport = new RecordingTransport(() => response);
    await expect(requestPegInCausalMintTransitionPostStateReadProofV2(
      new ReadOnlySubstrateFinalityRpc(transport),
      { ...baseInput(), nativeBlockHashHex: CHILD_HASH },
    )).rejects.toThrow(message);
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0].method).toBe('state_getStorage');
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

  constructor(
    private readonly respond: (method: string, params: readonly unknown[]) => unknown,
  ) {}

  async request<T>(method: string, params: readonly unknown[]): Promise<T> {
    this.calls.push({ method, params });
    return this.respond(method, params) as T;
  }
}

function scalePendingKeys(keys: readonly string[]): string {
  const count = keys.length;
  const prefix = count < 64
    ? Buffer.from([count << 2])
    : Buffer.from([(count << 2) | 1, count >> 6]);
  return `0x${Buffer.concat([
    prefix,
    ...keys.map(key => Buffer.from(key.slice(2), 'hex')),
  ]).toString('hex')}`;
}
