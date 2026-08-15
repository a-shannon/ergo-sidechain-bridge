import { describe, expect, it, vi } from 'vitest';

import {
  COLLECTED_NATIVE_PEG_IN_FRONTIER_EVENT_V1_REQUEST_SCHEMA,
  COLLECTED_NATIVE_PEG_IN_FRONTIER_CONTRACT_STATE_V1_REQUEST_SCHEMA,
  COLLECTED_NATIVE_PEG_IN_FRONTIER_MINT_TRANSITION_V1_REQUEST_SCHEMA,
  COLLECTED_NATIVE_PEG_IN_CAUSAL_MINT_TRANSITION_V2_REQUEST_SCHEMA,
  collectNativeFinalizedPegInFrontierContractStateV1Request,
  collectNativeFinalizedPegInFrontierEventV1Request,
  collectNativeFinalizedPegInFrontierMintTransitionV1Request,
  collectNativeFinalizedPegInCausalMintTransitionV2Request,
} from './native-checkpoint-proof-collector.js';
import type {
  NativeSubstrateRpcProofCodec,
  RpcFinalityInspection,
  RpcWarpInspection,
} from './native-substrate-rpc-proof-codec.js';
import {
  PEG_IN_FRONTIER_EXECUTION_IDENTITY_STATEMENT_V1_SCHEMA,
  SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
} from './peg-in-frontier-execution-identity-v1.js';
import {
  PEG_IN_FRONTIER_EVENT_STATEMENT_V1_SCHEMA,
  SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
  SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
} from './peg-in-frontier-event-v1.js';
import {
  PEG_IN_FRONTIER_CONTRACT_STATE_STATEMENT_V1_SCHEMA,
  derivePegInFrontierContractStateStorageKeysV1,
} from './peg-in-frontier-contract-state-v1.js';
import {
  derivePegInFrontierMintTransitionStatementV1,
} from './peg-in-frontier-mint-transition-v1.js';
import {
  derivePegInCausalPendingAdmissionStorageKeyV2,
  derivePegInCausalRuntimeStorageKeysV2,
} from './peg-in-causal-runtime-state-v2.js';
import { SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX } from './peg-in-runtime-identity-v2.js';
import {
  deriveProcessedPegInRuntimeStorageKeyV1Hex,
  encodePegInRuntimeRecordV1ScaleHex,
} from './peg-in-runtime-state.js';
import {
  ReadOnlySubstrateFinalityRpc,
  type SubstrateRpcHeaderObservation,
} from './substrate-finality-provider.js';

const hash = (byte: string): string => `0x${byte.repeat(64)}`;
const sidechainId = hash('1');
const anchorHash = hash('a');
const targetHash = hash('c');
const executionBlockHash = hash('6');
const transitionHash = hash('b');
const horizonHash = hash('d');
const ergoBoxIdHex = hash('5');
const authorityListScaleHex = `0x04${'21'.repeat(32)}0100000000000000`;
const trustAnchor = {
  sidechainIdHex: sidechainId,
  checkpointHashHex: anchorHash,
  checkpointNumber: '10',
  grandpaSetId: '7',
  authorityListScaleHex,
} as const;
const executionIdentityStatement = {
  schema: PEG_IN_FRONTIER_EXECUTION_IDENTITY_STATEMENT_V1_SCHEMA,
  runtimeCode: {
    storageKeyHex: SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
    artifactSha256Hex: hash('f'),
    artifactSizeBytes: '1831356',
    buildAttestationId: 'bridge-runtime-review-01',
    buildAttestationSha256Hex: hash('e'),
  },
  currentBlockStorageKeyHex: SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
  ergoBoxIdHex,
  expectedRecordScaleHex: encodePegInRuntimeRecordV1ScaleHex({
    formatVersion: 1,
    sidechainIdHex: sidechainId,
    bridgeAddress: `0x${'44'.repeat(20)}`,
    profileRevision: '1',
    profileActivationHeight: '1',
    ergoBoxIdHex,
    recipientAddress: `0x${'66'.repeat(20)}`,
    amountNanoErg: '1000000000',
    sidechainHeight: '11',
    executionBlockHashHex: executionBlockHash,
    transactionHashHex: hash('7'),
    eventIndex: 0,
  }),
} as const;
const statement = {
  schema: PEG_IN_FRONTIER_EVENT_STATEMENT_V1_SCHEMA,
  currentReceiptsStorageKeyHex: SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
  currentTransactionStatusesStorageKeyHex:
    SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
} as const;
const bridgeAddressHex = `0x${'44'.repeat(20)}`;
const tokenAddressHex = `0x${'21'.repeat(20)}`;
const contractStateKeys = derivePegInFrontierContractStateStorageKeysV1({
  bridgeAddressHex,
  tokenAddressHex,
  ergoBoxIdHex,
});
const contractStateStatement = {
  schema: PEG_IN_FRONTIER_CONTRACT_STATE_STATEMENT_V1_SCHEMA,
  bridgeAddressHex,
  tokenAddressHex,
  ...contractStateKeys,
  bridgeRuntimeCodeSha256Hex: hash('8'),
  bridgeRuntimeCodeBytes: '4104',
  tokenRuntimeCodeSha256Hex: hash('9'),
  tokenRuntimeCodeBytes: '2356',
} as const;
const causalRuntimeKeys = derivePegInCausalRuntimeStorageKeysV2({
  sidechainIdHex: sidechainId,
  ergoBoxIdHex,
});
const additionalPendingRecordKey = hash('5');
const additionalPendingStorageKey =
  derivePegInCausalPendingAdmissionStorageKeyV2(additionalPendingRecordKey);
const parentPendingKeysScaleHex = scalePendingKeys([
  causalRuntimeKeys.recordKeyHex,
  additionalPendingRecordKey,
]);
const childPendingKeysScaleHex = scalePendingKeys([additionalPendingRecordKey]);
const chain = new Map<number, { hash: string; parent: string }>([
  [10, { hash: anchorHash, parent: hash('9') }],
  [11, { hash: targetHash, parent: anchorHash }],
  [12, { hash: transitionHash, parent: targetHash }],
  [13, { hash: horizonHash, parent: transitionHash }],
]);

describe('native peg-in Frontier event V1 proof collector', () => {
  it('collects one exact five-key proof without storage reads or authority claims', async () => {
    const proof = ['0x01', '0x0203', '0x040506'];
    const { rpc, request } = createRpc({ at: targetHash, proof });
    const result = await collectNativeFinalizedPegInFrontierEventV1Request({
      rpc,
      codec: createCodec(),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      executionIdentityStatement,
      statement,
    });
    const recordKey = deriveProcessedPegInRuntimeStorageKeyV1Hex({
      sidechainIdHex: sidechainId,
      ergoBoxIdHex,
    });
    const expectedStorageKeys = [
      SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
      SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
      SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
      SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
      recordKey,
    ];

    expect(result.schema).toBe(COLLECTED_NATIVE_PEG_IN_FRONTIER_EVENT_V1_REQUEST_SCHEMA);
    expect(result.request.executionIdentityRequest.statement)
      .toEqual(executionIdentityStatement);
    expect(result.request.statement).toEqual(statement);
    expect(result.request.executionIdentityRequest.runtimeStateProofNodesHex).toEqual(proof);
    expect(result.acquisition.runtimeStateStorageKeysHex).toEqual(expectedStorageKeys);
    expect(result.acquisition.runtimeStateProofNodeCount).toBe(3);
    expect(result.acquisition.runtimeStateProofBytes).toBe(6);
    expect(result.boundary).toEqual(nonAuthorizingBoundary());
    expect(request).toHaveBeenCalledWith(
      'state_getReadProof',
      [expectedStorageKeys, targetHash],
    );
    expect(request.mock.calls.filter(call => call[0] === 'state_getReadProof')).toHaveLength(1);
    expect(request.mock.calls.map(call => call[0])).not.toContain('state_getStorage');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.request.executionIdentityRequest)).toBe(true);
    expect(Object.isFrozen(result.acquisition.runtimeStateStorageKeysHex)).toBe(true);
    expect(Object.isFrozen(result.boundary)).toBe(true);
  });

  it.each([
    ['CurrentBlock key', (candidate: Record<string, unknown>) => {
      candidate.currentBlockStorageKeyHex = hash('0');
    }, /CurrentBlock storage key/i],
    ['record box', (candidate: Record<string, unknown>) => {
      candidate.ergoBoxIdHex = hash('8');
    }, /Ergo box ID does not match/i],
  ] as const)('rejects execution %s drift before RPC', async (_label, mutate, message) => {
    const { rpc, request } = createRpc();
    const candidate = structuredClone(executionIdentityStatement) as unknown as Record<string, unknown>;
    mutate(candidate);
    await expect(collectNativeFinalizedPegInFrontierEventV1Request({
      rpc,
      codec: createCodec(),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      executionIdentityStatement: candidate as unknown as typeof executionIdentityStatement,
      statement,
    })).rejects.toThrow(message);
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a receipt/status statement drift before RPC', async () => {
    const { rpc, request } = createRpc();
    await expect(collectNativeFinalizedPegInFrontierEventV1Request({
      rpc,
      codec: createCodec(),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      executionIdentityStatement,
      statement: {
        ...statement,
        currentReceiptsStorageKeyHex: hash('0') as never,
      },
    })).rejects.toThrow(/CurrentReceipts storage key/i);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ['target drift', { at: hash('8'), proof: ['0x01'] }, /requested native block/i],
    ['duplicate nodes', { at: targetHash, proof: ['0x01', '0x01'] }, /duplicate/i],
    ['unknown field', { at: targetHash, proof: ['0x01'], unexpected: true }, /unknown fields/i],
  ] as const)('rejects %s without a storage read', async (_label, response, message) => {
    const { rpc, request } = createRpc(response);
    await expect(collectNativeFinalizedPegInFrontierEventV1Request({
      rpc,
      codec: createCodec(),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      executionIdentityStatement,
      statement,
    })).rejects.toThrow(message);
    expect(request.mock.calls.filter(call => call[0] === 'state_getReadProof')).toHaveLength(1);
    expect(request.mock.calls.map(call => call[0])).not.toContain('state_getStorage');
  });

  it('collects one exact twelve-key contract-state request without authority claims', async () => {
    const proof = ['0x01', '0x0203', '0x040506'];
    const { rpc, request } = createRpc({ at: targetHash, proof });
    const result = await collectNativeFinalizedPegInFrontierContractStateV1Request({
      rpc,
      codec: createCodec(),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      executionIdentityStatement,
      eventStatement: statement,
      contractStateStatement,
    });
    const recordKey = deriveProcessedPegInRuntimeStorageKeyV1Hex({
      sidechainIdHex: sidechainId,
      ergoBoxIdHex,
    });
    const expectedStorageKeys = [
      SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
      SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
      SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
      SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
      recordKey,
      contractStateKeys.bridgeAccountCodeStorageKeyHex,
      contractStateKeys.tokenAccountCodeStorageKeyHex,
      contractStateKeys.bridgeOwnerStorageKeyHex,
      contractStateKeys.bridgeConfigurationStorageKeyHex,
      contractStateKeys.processedPegInStorageKeyHex,
      contractStateKeys.tokenTotalSupplyStorageKeyHex,
      contractStateKeys.tokenOwnerStorageKeyHex,
    ];

    expect(result.schema).toBe(
      COLLECTED_NATIVE_PEG_IN_FRONTIER_CONTRACT_STATE_V1_REQUEST_SCHEMA,
    );
    expect(result.request.eventRequest.statement).toEqual(statement);
    expect(result.request.statement).toEqual(contractStateStatement);
    expect(result.request.eventRequest.executionIdentityRequest.runtimeStateProofNodesHex)
      .toEqual(proof);
    expect(result.acquisition.runtimeStateStorageKeysHex).toEqual(expectedStorageKeys);
    expect(result.acquisition.runtimeStateProofNodeCount).toBe(3);
    expect(result.acquisition.runtimeStateProofBytes).toBe(6);
    expect(result.boundary).toEqual(contractStateNonAuthorizingBoundary());
    expect(request).toHaveBeenCalledWith(
      'state_getReadProof',
      [expectedStorageKeys, targetHash],
    );
    expect(request.mock.calls.filter(call => call[0] === 'state_getReadProof')).toHaveLength(1);
    expect(request.mock.calls.map(call => call[0])).not.toContain('state_getStorage');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.boundary)).toBe(true);
  });

  it('collects exact direct-parent and event-block mint-transition proofs', async () => {
    const postProof = ['0x0102', '0x0304'];
    const parentProof = ['0x0506', '0x0708'];
    const { rpc, request } = createRpc((_keys: unknown, at: string) => ({
      at,
      proof: at === targetHash ? postProof : parentProof,
    }));
    const result = await collectNativeFinalizedPegInFrontierMintTransitionV1Request({
      rpc,
      codec: createCodec(),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      executionIdentityStatement,
      eventStatement: statement,
      contractStateStatement,
    });
    const recordKey = deriveProcessedPegInRuntimeStorageKeyV1Hex({
      sidechainIdHex: sidechainId,
      ergoBoxIdHex,
    });
    const transitionKeys = derivePegInFrontierMintTransitionStatementV1({
      sidechainIdHex: sidechainId,
      ergoBoxIdHex,
      tokenAddressHex,
      recipientHex: `0x${'66'.repeat(20)}`,
    });
    const expectedPostKeys = [
      SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
      SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
      SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
      SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
      recordKey,
      contractStateKeys.bridgeAccountCodeStorageKeyHex,
      contractStateKeys.tokenAccountCodeStorageKeyHex,
      contractStateKeys.bridgeOwnerStorageKeyHex,
      contractStateKeys.bridgeConfigurationStorageKeyHex,
      contractStateKeys.processedPegInStorageKeyHex,
      contractStateKeys.tokenTotalSupplyStorageKeyHex,
      contractStateKeys.tokenOwnerStorageKeyHex,
      transitionKeys.recipientBalanceStorageKeyHex,
    ];
    const expectedParentKeys = [
      SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
      transitionKeys.parentNativeProcessedRecordStorageKeyHex,
      contractStateKeys.bridgeAccountCodeStorageKeyHex,
      contractStateKeys.tokenAccountCodeStorageKeyHex,
      contractStateKeys.bridgeOwnerStorageKeyHex,
      contractStateKeys.bridgeConfigurationStorageKeyHex,
      contractStateKeys.processedPegInStorageKeyHex,
      contractStateKeys.tokenTotalSupplyStorageKeyHex,
      contractStateKeys.tokenOwnerStorageKeyHex,
      transitionKeys.recipientBalanceStorageKeyHex,
    ];

    expect(result.schema).toBe(
      COLLECTED_NATIVE_PEG_IN_FRONTIER_MINT_TRANSITION_V1_REQUEST_SCHEMA,
    );
    expect(result.request.parentNativeBlockHashHex).toBe(anchorHash);
    expect(result.request.parentHeaderScaleHex).toBe('0x0a');
    expect(result.request.statement).toEqual(transitionKeys);
    expect(result.request.contractStateRequest.eventRequest.executionIdentityRequest
      .runtimeStateProofNodesHex).toEqual(postProof);
    expect(result.request.parentStateProofNodesHex).toEqual(parentProof);
    expect(result.acquisition.postStateStorageKeysHex).toEqual(expectedPostKeys);
    expect(result.acquisition.parentStateStorageKeysHex).toEqual(expectedParentKeys);
    expect(result.acquisition.parentNumber).toBe('10');
    expect(result.acquisition.parentHashHex).toBe(anchorHash);
    expect(result.boundary).toEqual(mintTransitionNonAuthorizingBoundary());
    expect(request).toHaveBeenCalledWith('state_getReadProof', [expectedPostKeys, targetHash]);
    expect(request).toHaveBeenCalledWith('state_getReadProof', [expectedParentKeys, anchorHash]);
    expect(request.mock.calls.filter(call => call[0] === 'state_getReadProof')).toHaveLength(2);
    expect(request.mock.calls.map(call => call[0])).not.toContain('state_getStorage');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.request.parentStateProofNodesHex)).toBe(true);
  });

  it.each([
    ['event block', 11],
    ['direct parent', 10],
  ] as const)(
    'rejects a canonical %s replacement after both mint-transition proofs are collected',
    async (_label, driftHeight) => {
      const { rpc, request } = createRpc(
        (_keys: unknown, at: string) => ({ at, proof: ['0x0102'] }),
        ({ height, defaultHash, proofReadCount }) =>
          proofReadCount === 2 && height === driftHeight ? hash('8') : defaultHash,
      );

      await expect(collectNativeFinalizedPegInFrontierMintTransitionV1Request({
        rpc,
        codec: createCodec(),
        trustAnchor,
        targetNativeBlockHashHex: targetHash,
        executionIdentityStatement,
        eventStatement: statement,
        contractStateStatement,
      })).rejects.toThrow(/parent\/event identities changed during proof collection/i);
      expect(request.mock.calls.filter(call => call[0] === 'state_getReadProof')).toHaveLength(2);
    },
  );

  it('composes the T20C request with exact causal parent/child proof keys', async () => {
    const childProof = ['0x0102', '0x0304'];
    const parentProof = ['0x0506', '0x0708'];
    const { rpc, request } = createRpc((_keys: unknown, at: string) => ({
      at,
      proof: at === targetHash ? childProof : parentProof,
    }));
    const result = await collectNativeFinalizedPegInCausalMintTransitionV2Request({
      rpc,
      codec: createCodec(),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      executionIdentityStatement,
      eventStatement: statement,
      contractStateStatement,
    });
    const causalKeys = causalRuntimeKeys;
    const causalSuffix = [
      causalKeys.currentPegInProfileStorageKeyHex,
      causalKeys.currentCausalProfileStorageKeyHex,
      causalKeys.causalEnforcementStorageKeyHex,
      causalKeys.pendingKeysStorageKeyHex,
      causalKeys.pendingAdmissionStorageKeyHex,
      causalKeys.consumedAdmissionStorageKeyHex,
      additionalPendingStorageKey,
    ];
    const transitionKeys = derivePegInFrontierMintTransitionStatementV1({
      sidechainIdHex: sidechainId,
      ergoBoxIdHex,
      tokenAddressHex,
      recipientHex: `0x${'66'.repeat(20)}`,
    });
    const expectedChildKeys = [
      SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
      SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
      SUBSTRATE_ETHEREUM_CURRENT_RECEIPTS_STORAGE_KEY_HEX,
      SUBSTRATE_ETHEREUM_CURRENT_TRANSACTION_STATUSES_STORAGE_KEY_HEX,
      causalKeys.processedRecordStorageKeyHex,
      contractStateKeys.bridgeAccountCodeStorageKeyHex,
      contractStateKeys.tokenAccountCodeStorageKeyHex,
      contractStateKeys.bridgeOwnerStorageKeyHex,
      contractStateKeys.bridgeConfigurationStorageKeyHex,
      contractStateKeys.processedPegInStorageKeyHex,
      contractStateKeys.tokenTotalSupplyStorageKeyHex,
      contractStateKeys.tokenOwnerStorageKeyHex,
      transitionKeys.recipientBalanceStorageKeyHex,
      ...causalSuffix,
    ];
    const expectedParentKeys = [
      SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
      causalKeys.processedRecordStorageKeyHex,
      contractStateKeys.bridgeAccountCodeStorageKeyHex,
      contractStateKeys.tokenAccountCodeStorageKeyHex,
      contractStateKeys.bridgeOwnerStorageKeyHex,
      contractStateKeys.bridgeConfigurationStorageKeyHex,
      contractStateKeys.processedPegInStorageKeyHex,
      contractStateKeys.tokenTotalSupplyStorageKeyHex,
      contractStateKeys.tokenOwnerStorageKeyHex,
      transitionKeys.recipientBalanceStorageKeyHex,
      ...causalSuffix,
    ];

    expect(result.schema).toBe(
      COLLECTED_NATIVE_PEG_IN_CAUSAL_MINT_TRANSITION_V2_REQUEST_SCHEMA,
    );
    expect(result.request).toEqual({
      schema: 'e2s.native-finalized-peg-in-causal-mint-transition-request.v2',
      mintTransitionRequest: expect.objectContaining({
        schema: 'e2s.native-finalized-peg-in-frontier-mint-transition-request.v1',
        parentNativeBlockHashHex: anchorHash,
        parentStateProofNodesHex: parentProof,
      }),
      statement: {
        schema: 'e2s.peg-in-causal-mint-transition-statement.v2',
        ...causalKeys,
      },
    });
    expect(result.request.mintTransitionRequest.contractStateRequest.eventRequest
      .executionIdentityRequest.runtimeStateProofNodesHex).toEqual(childProof);
    expect(result.acquisition.postStateStorageKeysHex).toEqual(expectedChildKeys);
    expect(result.acquisition.parentStateStorageKeysHex).toEqual(expectedParentKeys);
    expect(result.acquisition.postPendingKeysScaleHex).toBe(childPendingKeysScaleHex);
    expect(result.acquisition.parentPendingKeysScaleHex).toBe(parentPendingKeysScaleHex);
    expect(result.acquisition.postPendingRecordKeysHex).toEqual([
      additionalPendingRecordKey,
    ]);
    expect(result.acquisition.parentPendingRecordKeysHex).toEqual([
      causalKeys.recordKeyHex,
      additionalPendingRecordKey,
    ]);
    expect(new Set(result.acquisition.postStateStorageKeysHex).size).toBe(20);
    expect(new Set(result.acquisition.parentStateStorageKeysHex).size).toBe(17);
    expect(request).toHaveBeenCalledWith(
      'state_getReadProof',
      [expectedChildKeys, targetHash],
    );
    expect(request).toHaveBeenCalledWith(
      'state_getReadProof',
      [expectedParentKeys, anchorHash],
    );
    expect(request.mock.calls.filter(call => call[0] === 'state_getReadProof')).toHaveLength(2);
    expect(request.mock.calls.filter(call => call[0] === 'state_getStorage')).toHaveLength(2);
    expect(request.mock.calls.map(call => call[0])).not.toContain('state_getKeysPaged');
    expect(result.boundary.readOnlyRpc).toBe(true);
    expect(result.boundary.candidatePackageOnly).toBe(true);
    expect(Object.entries(result.boundary)
      .filter(([key]) => !['readOnlyRpc', 'candidatePackageOnly'].includes(key))
      .every(([, value]) => value === false)).toBe(true);
    expect(Object.isFrozen(result.request.statement)).toBe(true);
  });

  it.each([
    ['finalized child', 11],
    ['decoded direct parent', 10],
  ] as const)(
    'rejects canonical %s drift after causal proof acquisition',
    async (_label, driftHeight) => {
      const { rpc, request } = createRpc(
        (_keys: unknown, at: string) => ({ at, proof: ['0x0102'] }),
        ({ height, defaultHash, proofReadCount }) =>
          proofReadCount === 2 && height === driftHeight ? hash('8') : defaultHash,
      );

      await expect(collectNativeFinalizedPegInCausalMintTransitionV2Request({
        rpc,
        codec: createCodec(),
        trustAnchor,
        targetNativeBlockHashHex: targetHash,
        executionIdentityStatement,
        eventStatement: statement,
        contractStateStatement,
      })).rejects.toThrow(/parent\/child identities changed during proof collection/i);
      expect(request.mock.calls.filter(call => call[0] === 'state_getReadProof')).toHaveLength(2);
    },
  );
});

function nonAuthorizingBoundary() {
  return {
    readOnlyRpc: true,
    candidatePackageOnly: true,
    rpcCodecCryptographicallyVerified: false,
    sidechainFinalityVerified: false,
    executionIdentityVerified: false,
    receiptStateProofVerified: false,
    receiptsRootRecomputed: false,
    transactionStatusVerified: false,
    successfulReceiptVerified: false,
    depositEventSemanticsVerified: false,
    evmCodeStateVerified: false,
    evmStorageStateVerified: false,
    runtimeBuildAttestationVerified: false,
    runtimeCodeIdentityVerified: false,
    committedVaultTransitionVerified: false,
    runtimeUpgradeHistoryVerified: false,
    historicalMintAbsenceVerified: false,
    mintAuthorized: false,
    transactionMutationEnabled: false,
    gate5Closed: false,
    productionReadinessVerified: false,
  } as const;
}

function contractStateNonAuthorizingBoundary() {
  return {
    readOnlyRpc: true,
    candidatePackageOnly: true,
    rpcCodecCryptographicallyVerified: false,
    sidechainFinalityVerified: false,
    executionIdentityVerified: false,
    receiptStateProofVerified: false,
    receiptsRootRecomputed: false,
    transactionStatusVerified: false,
    successfulReceiptVerified: false,
    depositEventSemanticsVerified: false,
    evmCodeStateVerified: false,
    evmStorageStateVerified: false,
    runtimeBuildAttestationVerified: false,
    runtimeCodeIdentityVerified: false,
    runtimeUpgradeHistoryVerified: false,
    historicalCodeContinuityVerified: false,
    historicalReceiptStateProofCompletenessVerified: false,
    committedVaultTransitionVerified: false,
    historicalMintAbsenceVerified: false,
    mintAuthorized: false,
    settlementAuthorized: false,
    reconciliationHoldReleaseAuthorized: false,
    signingAuthorized: false,
    submissionAuthorized: false,
    broadcastAuthorized: false,
    transactionMutationEnabled: false,
    gate5Closed: false,
    productionReadinessVerified: false,
  } as const;
}

function mintTransitionNonAuthorizingBoundary() {
  return {
    readOnlyRpc: true,
    candidatePackageOnly: true,
    rpcCodecCryptographicallyVerified: false,
    sidechainFinalityVerified: false,
    directParentVerified: false,
    prePostStateVerified: false,
    replayTransitionVerified: false,
    exactMintDeltasVerified: false,
    pairedMintLogVerified: false,
    singleTokenEffectVerified: false,
    reviewedDeploymentLineageVerified: false,
    committedVaultTransitionVerified: false,
    historicalMintAbsenceVerified: false,
    mintAuthorized: false,
    daemonAdmissionAuthorized: false,
    settlementAuthorized: false,
    reconciliationHoldReleaseAuthorized: false,
    signingAuthorized: false,
    submissionAuthorized: false,
    broadcastAuthorized: false,
    transactionMutationEnabled: false,
    gate5Closed: false,
    productionReadinessVerified: false,
  } as const;
}

function header(number: number): SubstrateRpcHeaderObservation {
  const block = chain.get(number)!;
  return {
    parentHash: block.parent,
    number: `0x${number.toString(16)}`,
    stateRoot: hash(number === 11 ? 'e' : '2'),
    extrinsicsRoot: hash('3'),
    digest: { logs: [] },
  };
}

function createRpc(
  readProofResponse: unknown = { at: targetHash, proof: ['0x0102', '0x0304'] },
  blockHashResponse?: (input: {
    height: number;
    defaultHash: string | null;
    proofReadCount: number;
  }) => string | null,
) {
  let proofReadCount = 0;
  const request = vi.fn(async (method: string, params: readonly unknown[]) => {
    if (method === 'chain_getFinalizedHead') return horizonHash;
    if (method === 'chain_getBlockHash') {
      const height = Number(params[0]);
      if (height === 0) return sidechainId;
      const defaultHash = chain.get(height)?.hash ?? null;
      return blockHashResponse
        ? blockHashResponse({ height, defaultHash, proofReadCount })
        : defaultHash;
    }
    if (method === 'chain_getHeader') {
      const block = [...chain.entries()].find(([, value]) => value.hash === params[0]);
      return block ? header(block[0]) : null;
    }
    if (method === 'bridge_grandpaWarpProof') {
      return { encoding: 'base64', proof: Buffer.from('aabb', 'hex').toString('base64') };
    }
    if (method === 'grandpa_proveFinality') return '0xccdd';
    if (method === 'state_getStorage') {
      return params[1] === anchorHash
        ? parentPendingKeysScaleHex
        : childPendingKeysScaleHex;
    }
    if (method === 'state_getReadProof') {
      proofReadCount += 1;
      if (typeof readProofResponse === 'function') {
        return readProofResponse(params[0], params[1]);
      }
      return readProofResponse;
    }
    throw new Error(`unexpected method ${method}`);
  });
  return {
    rpc: new ReadOnlySubstrateFinalityRpc({
      request<T>(method: string, params: readonly unknown[]): Promise<T> {
        return request(method, params) as Promise<T>;
      },
    }),
    request,
  };
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

function createCodec(): NativeSubstrateRpcProofCodec {
  const warp: RpcWarpInspection = {
    sourceTargetHashHex: horizonHash,
    sourceTargetNumber: '13',
    sourceTargetParentHashHex: transitionHash,
    sourceTargetHeaderScaleHex: '0x0d',
    sourceComplete: true,
    sourceFragmentCount: 2,
    stoppedBeforeHorizon: true,
    selectedFragmentCount: 1,
    selectedProofScaleHex: '0xaabb',
    selectedTargetHashHex: transitionHash,
    selectedTargetNumber: '12',
    selectedTargetParentHashHex: targetHash,
    selectedTargetHeaderScaleHex: '0x0c',
    cryptographicallyVerified: false,
  };
  const finality: RpcFinalityInspection = {
    horizonHashHex: horizonHash,
    horizonNumber: '13',
    canonicalJustificationScaleHex: '0x0102',
    unknownHeaderCount: 2,
    cryptographicallyVerified: false,
  };
  return {
    executionBoundary: {
      mode: 'direct-process-acquisition-only',
      executionPolicyValidated: false,
      containedProcessRequired: false,
      cryptographicVerificationProvided: false,
      settlementAuthorityGranted: false,
    },
    executableSha256Hex: hash('e'),
    executableInvocationSha256Hex: {
      encodeHeaders: hash('1'),
      inspectWarpProof: hash('2'),
      inspectFinalityProof: hash('3'),
    },
    async encodeHeaders(observations) {
      return observations.map(observation => {
        const number = Number.parseInt(observation.header.number.slice(2), 16);
        return {
          hashHex: observation.expectedHashHex,
          number: String(number),
          parentHashHex: observation.header.parentHash,
          stateRootHex: observation.header.stateRoot,
          headerScaleHex: `0x${number.toString(16).padStart(2, '0')}`,
        };
      });
    },
    async inspectWarpProof() {
      return warp;
    },
    async inspectFinalityProof() {
      return finality;
    },
  };
}
