import { describe, expect, it, vi } from 'vitest';

import {
  COLLECTED_NATIVE_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_REQUEST_SCHEMA,
  collectNativeFinalizedPegInFrontierExecutionIdentityV1Request,
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
  SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
} from './peg-in-runtime-identity-v2.js';
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
const runtimeCode = {
  storageKeyHex: SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
  artifactSha256Hex: hash('f'),
  artifactSizeBytes: '1831356',
  buildAttestationId: 'bridge-runtime-review-01',
  buildAttestationSha256Hex: hash('e'),
} as const;
const statement = {
  schema: PEG_IN_FRONTIER_EXECUTION_IDENTITY_STATEMENT_V1_SCHEMA,
  runtimeCode,
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
const chain = new Map<number, { hash: string; parent: string }>([
  [10, { hash: anchorHash, parent: hash('9') }],
  [11, { hash: targetHash, parent: anchorHash }],
  [12, { hash: transitionHash, parent: targetHash }],
  [13, { hash: horizonHash, parent: transitionHash }],
]);

describe('native peg-in Frontier execution identity V1 proof collector', () => {
  it('collects one exact three-key proof and accounts every node without storage reads', async () => {
    const proof = ['0x01', '0x0203', '0x040506'];
    const { rpc, request } = createRpc({ at: targetHash, proof });
    const result =
      await collectNativeFinalizedPegInFrontierExecutionIdentityV1Request({
        rpc,
        codec: createCodec(),
        trustAnchor,
        targetNativeBlockHashHex: targetHash,
        statement,
      });
    const recordKey = deriveProcessedPegInRuntimeStorageKeyV1Hex({
      sidechainIdHex: sidechainId,
      ergoBoxIdHex,
    });
    const expectedStorageKeys = [
      SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
      SUBSTRATE_ETHEREUM_CURRENT_BLOCK_STORAGE_KEY_HEX,
      recordKey,
    ];

    expect(result.schema).toBe(
      COLLECTED_NATIVE_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_REQUEST_SCHEMA,
    );
    expect(result.schema).toBe(
      'e2s.collected-native-finalized-peg-in-frontier-execution-identity-request.v1',
    );
    expect(result.request.statement).toEqual(statement);
    expect(result.request.runtimeStateProofNodesHex).toEqual(proof);
    expect(result.acquisition.runtimeStateStorageKeysHex).toEqual(expectedStorageKeys);
    expect(result.acquisition.runtimeStateProofNodeCount).toBe(3);
    expect(result.acquisition.runtimeStateProofBytes).toBe(6);
    expect(result.acquisition.rpcMethods).toEqual([
      'chain_getBlockHash',
      'chain_getFinalizedHead',
      'chain_getHeader',
      'bridge_grandpaWarpProof',
      'grandpa_proveFinality',
      'state_getReadProof',
    ]);
    expect(result.boundary).toEqual(nonAuthorizingBoundary());
    expect(request).toHaveBeenCalledWith(
      'state_getReadProof',
      [expectedStorageKeys, targetHash],
    );
    expect(request.mock.calls.filter(call => call[0] === 'state_getReadProof')).toHaveLength(1);
    expect(request.mock.calls.map(call => call[0])).not.toContain('state_getStorage');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.request)).toBe(true);
    expect(Object.isFrozen(result.acquisition)).toBe(true);
    expect(Object.isFrozen(result.acquisition.runtimeStateStorageKeysHex)).toBe(true);
    expect(Object.isFrozen(result.boundary)).toBe(true);
  });

  it.each([
    ['CurrentBlock key', (candidate: Record<string, unknown>) => {
      candidate.currentBlockStorageKeyHex = hash('0');
    }, /CurrentBlock storage key/i],
    ['record box identity', (candidate: Record<string, unknown>) => {
      candidate.ergoBoxIdHex = hash('8');
    }, /Ergo box ID does not match/i],
    ['runtime identity', (candidate: Record<string, unknown>) => {
      candidate.runtimeCode = {
        ...runtimeCode,
        artifactSha256Hex: hash('0'),
      };
    }, /artifact SHA-256/i],
  ] as const)('rejects %s drift before any RPC', async (_label, mutate, message) => {
    const { rpc, request } = createRpc();
    const candidate = structuredClone(statement) as unknown as Record<string, unknown>;
    mutate(candidate);

    await expect(
      collectNativeFinalizedPegInFrontierExecutionIdentityV1Request({
        rpc,
        codec: createCodec(),
        trustAnchor,
        targetNativeBlockHashHex: targetHash,
        statement: candidate as unknown as typeof statement,
      }),
    ).rejects.toThrow(message);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    [
      'target drift',
      { at: hash('8'), proof: ['0x01'] },
      /requested native block/i,
    ],
    [
      'duplicate trie nodes',
      { at: targetHash, proof: ['0x01', '0x01'] },
      /duplicate/i,
    ],
    [
      'unknown proof response field',
      { at: targetHash, proof: ['0x01'], unexpected: true },
      /missing or unknown fields/i,
    ],
  ] as const)('rejects %s without a storage read', async (_label, response, message) => {
    const { rpc, request } = createRpc(response);

    await expect(
      collectNativeFinalizedPegInFrontierExecutionIdentityV1Request({
        rpc,
        codec: createCodec(),
        trustAnchor,
        targetNativeBlockHashHex: targetHash,
        statement,
      }),
    ).rejects.toThrow(message);
    expect(request.mock.calls.filter(call => call[0] === 'state_getReadProof')).toHaveLength(1);
    expect(request.mock.calls.map(call => call[0])).not.toContain('state_getStorage');
  });
});

function nonAuthorizingBoundary() {
  return {
    readOnlyRpc: true,
    candidatePackageOnly: true,
    rpcCodecCryptographicallyVerified: false,
    sidechainFinalityVerified: false,
    runtimeCodeStateProofVerified: false,
    currentBlockStateProofVerified: false,
    processedRecordStateProofVerified: false,
    executionBlockHashMappedToNativeState: false,
    transactionRootRecomputed: false,
    ommersHashRecomputed: false,
    recordTransactionBoundExactlyOnce: false,
    receiptInclusionVerified: false,
    transactionStatusVerified: false,
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
) {
  const request = vi.fn(async (method: string, params: readonly unknown[]) => {
    if (method === 'chain_getFinalizedHead') return horizonHash;
    if (method === 'chain_getBlockHash') {
      const height = Number(params[0]);
      if (height === 0) return sidechainId;
      return chain.get(height)?.hash ?? null;
    }
    if (method === 'chain_getHeader') {
      const block = [...chain.entries()].find(([, value]) => value.hash === params[0]);
      return block ? header(block[0]) : null;
    }
    if (method === 'bridge_grandpaWarpProof') {
      return { encoding: 'base64', proof: Buffer.from('aabb', 'hex').toString('base64') };
    }
    if (method === 'grandpa_proveFinality') return '0xccdd';
    if (method === 'state_getReadProof') return readProofResponse;
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
