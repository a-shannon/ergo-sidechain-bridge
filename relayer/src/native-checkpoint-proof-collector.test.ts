import { describe, expect, it, vi } from 'vitest';

import {
  NativeCheckpointCollectionDriftError,
  collectNativeFinalizedCheckpointRequest,
  validateNativeCheckpointFinalityBounds,
} from './native-checkpoint-proof-collector.js';
import type {
  NativeSubstrateRpcProofCodec,
  RpcFinalityInspection,
  RpcWarpInspection,
} from './native-substrate-rpc-proof-codec.js';
import {
  BRIDGE_EVENT_COMMITMENT_V1_SCALE_BYTES,
  ReadOnlySubstrateFinalityRpc,
  type SubstrateRpcHeaderObservation,
  type SubstrateRpcTransport,
} from './substrate-finality-provider.js';

const hash = (byte: string): string => `0x${byte.repeat(64)}`;
const sidechainId = hash('1');
const anchorHash = hash('a');
const transitionHash = hash('b');
const targetHash = hash('c');
const horizonHash = hash('d');
const authorityListScaleHex = `0x04${'21'.repeat(32)}0100000000000000`;
const commitmentScaleHex = `0x${'11'.repeat(BRIDGE_EVENT_COMMITMENT_V1_SCALE_BYTES)}`;

describe('validateNativeCheckpointFinalityBounds', () => {
  it('accepts a target and finality horizon within the observed finalized head', () => {
    expect(() => validateNativeCheckpointFinalityBounds({
      checkpointNumber: 10,
      targetNumber: 11,
      finalizedHeadNumber: 13,
      finality: { horizonNumber: 13, unknownHeaderCount: 2 },
    })).not.toThrow();
  });

  it('preserves target-bound rejection behavior', () => {
    expect(() => validateNativeCheckpointFinalityBounds({
      checkpointNumber: 10,
      targetNumber: 9,
      finalizedHeadNumber: 13,
    })).toThrow('target native block precedes the reviewed trust checkpoint');

    expect(() => validateNativeCheckpointFinalityBounds({
      checkpointNumber: 10,
      targetNumber: 14,
      finalizedHeadNumber: 13,
    })).toThrow('target native block is above the observed finalized head');
  });

  it('preserves finality-span and finalized-horizon drift rejections', () => {
    expect(() => validateNativeCheckpointFinalityBounds({
      checkpointNumber: 10,
      targetNumber: 11,
      finalizedHeadNumber: 13,
      finality: { horizonNumber: 12, unknownHeaderCount: 2 },
    })).toThrow('target finality proof header span changed during collection');

    expect(() => validateNativeCheckpointFinalityBounds({
      checkpointNumber: 10,
      targetNumber: 11,
      finalizedHeadNumber: 12,
      finality: { horizonNumber: 13, unknownHeaderCount: 2 },
    })).toThrow('target finality horizon is above the observed finalized head');

    for (const finality of [
      { horizonNumber: 10, unknownHeaderCount: 0 },
      { horizonNumber: 13, unknownHeaderCount: 1 },
    ]) {
      expect(() => validateNativeCheckpointFinalityBounds({
        checkpointNumber: 10,
        targetNumber: 11,
        finalizedHeadNumber: 13,
        finality,
      })).toThrow(NativeCheckpointCollectionDriftError);
    }
  });

  it('rejects non-integer bounds before comparing finality relationships', () => {
    expect(() => validateNativeCheckpointFinalityBounds({
      checkpointNumber: 10,
      targetNumber: Number.NaN,
      finalizedHeadNumber: 13,
    })).toThrow('target native block number must be between 0');

    expect(() => validateNativeCheckpointFinalityBounds({
      checkpointNumber: 10,
      targetNumber: 11,
      finalizedHeadNumber: 13,
      finality: { horizonNumber: 13, unknownHeaderCount: -1 },
    })).toThrow('target finality unknown-header count must be between 0');
  });
});

const trustAnchor = {
  sidechainIdHex: sidechainId,
  checkpointHashHex: anchorHash,
  checkpointNumber: '10',
  grandpaSetId: '7',
  authorityListScaleHex,
} as const;

const chain = new Map<number, { hash: string; parent: string }>([
  [10, { hash: anchorHash, parent: hash('9') }],
  [11, { hash: targetHash, parent: anchorHash }],
  [12, { hash: transitionHash, parent: targetHash }],
  [13, { hash: horizonHash, parent: transitionHash }],
]);

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

function createRpc(overrides: {
  canonicalTargetHash?: string;
} = {}): { rpc: ReadOnlySubstrateFinalityRpc; request: ReturnType<typeof vi.fn> } {
  const request = vi.fn(async (method: string, params: readonly unknown[]) => {
    if (method === 'chain_getFinalizedHead') return horizonHash;
    if (method === 'chain_getBlockHash') {
      const height = Number(params[0]);
      if (height === 0) return sidechainId;
      if (height === 11 && overrides.canonicalTargetHash) return overrides.canonicalTargetHash;
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
    if (method === 'state_getStorage') return commitmentScaleHex;
    if (method === 'state_getReadProof') {
      return { at: targetHash, proof: ['0x0102', '0x0304'] };
    }
    throw new Error(`unexpected method ${method}`);
  });
  const transport: SubstrateRpcTransport = {
    request<T>(method: string, params: readonly unknown[]): Promise<T> {
      return request(method, params) as Promise<T>;
    },
  };
  return { rpc: new ReadOnlySubstrateFinalityRpc(transport), request };
}

function createCodec(overrides: {
  horizonHashHex?: string;
  forkAtHeight?: number;
  selectedTargetNumber?: number;
} = {}): NativeSubstrateRpcProofCodec {
  const selectedTargetNumber = overrides.selectedTargetNumber ?? 12;
  const selectedTargetHash = selectedTargetNumber === 12 ? transitionHash : hash('f');
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
    selectedTargetHashHex: selectedTargetHash,
    selectedTargetNumber: String(selectedTargetNumber),
    selectedTargetParentHashHex: targetHash,
    selectedTargetHeaderScaleHex: `0x${selectedTargetNumber.toString(16).padStart(2, '0')}`,
    cryptographicallyVerified: false,
  };
  const finality: RpcFinalityInspection = {
    horizonHashHex: overrides.horizonHashHex ?? horizonHash,
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
        const parent = overrides.forkAtHeight === number
          ? hash('f')
          : observation.header.parentHash;
        return {
          hashHex: observation.expectedHashHex,
          number: String(number),
          parentHashHex: parent,
          stateRootHex: observation.header.stateRoot,
          headerScaleHex: `0x${number.toString(16).padStart(2, '0')}`,
        };
      });
    },
    async inspectWarpProof(_proofScaleHex, finalityHorizonNumber) {
      expect(finalityHorizonNumber).toBe('13');
      return warp;
    },
    async inspectFinalityProof() {
      return finality;
    },
  };
}

describe('collectNativeFinalizedCheckpointRequest', () => {
  it('constructs one exact bounded read-only native verification request', async () => {
    const { rpc, request } = createRpc();
    const collected = await collectNativeFinalizedCheckpointRequest({
      rpc,
      codec: createCodec(),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
    });

    expect(collected.request).toEqual({
      schema: 'e2s.native-finalized-bridge-checkpoint-request.v2',
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      targetHeaderScaleHex: '0x0b',
      linkedGrandpaProofs: [{
        ancestryHeadersScaleHex: ['0x0b', '0x0c'],
        proofScaleHex: '0xaabb',
      }],
      checkpointTailHeadersScaleHex: ['0x0d'],
      finalityProofScaleHex: '0xccdd',
      runtimeStateProofNodesHex: ['0x0102', '0x0304'],
    });
    expect(collected.acquisition).toMatchObject({
      finalizedHeadHashHex: horizonHash,
      finalizedHeadNumber: '13',
      targetHashHex: targetHash,
      targetNumber: '11',
      linkedProofCount: 1,
      ancestryHeaderCount: 3,
      finalityHorizonHashHex: horizonHash,
      finalityHorizonNumber: '13',
      runtimeStateProofNodeCount: 2,
      codecExecutableSha256Hex: hash('e'),
      codecExecutableInvocationSha256Hex: {
        encodeHeaders: hash('1'),
        inspectWarpProof: hash('2'),
        inspectFinalityProof: hash('3'),
      },
    });
    expect(collected.boundary).toEqual({
      readOnlyRpc: true,
      candidatePackageOnly: true,
      rpcCodecCryptographicallyVerified: false,
      sidechainFinalityVerified: false,
      ergoExtensionAnchorVerified: false,
      onChainAcceptanceVerified: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
    });
    const methods = request.mock.calls.map(call => call[0]);
    expect(new Set(methods)).toEqual(new Set([
      'chain_getBlockHash',
      'chain_getFinalizedHead',
      'chain_getHeader',
      'bridge_grandpaWarpProof',
      'grandpa_proveFinality',
      'state_getStorage',
      'state_getReadProof',
    ]));
    expect(methods.every(method => !/submit|author_|sign|wallet|broadcast/i.test(String(method))))
      .toBe(true);
    expect(Object.isFrozen(collected)).toBe(true);
    expect(Object.isFrozen(collected.request.linkedGrandpaProofs[0])).toBe(true);
  });

  it('collects a contiguous two-chunk authority path before the target horizon', async () => {
    const codec = createCodec();
    let warpCall = 0;
    codec.inspectWarpProof = async (_proofScaleHex, finalityHorizonNumber) => {
      expect(finalityHorizonNumber).toBe('13');
      warpCall += 1;
      if (warpCall === 1) {
        return {
          sourceTargetHashHex: targetHash,
          sourceTargetNumber: '11',
          sourceTargetParentHashHex: anchorHash,
          sourceTargetHeaderScaleHex: '0x0b',
          sourceComplete: false,
          sourceFragmentCount: 1,
          stoppedBeforeHorizon: false,
          selectedFragmentCount: 1,
          selectedProofScaleHex: '0xaa',
          selectedTargetHashHex: targetHash,
          selectedTargetNumber: '11',
          selectedTargetParentHashHex: anchorHash,
          selectedTargetHeaderScaleHex: '0x0b',
          cryptographicallyVerified: false,
        };
      }
      return {
        sourceTargetHashHex: horizonHash,
        sourceTargetNumber: '13',
        sourceTargetParentHashHex: transitionHash,
        sourceTargetHeaderScaleHex: '0x0d',
        sourceComplete: true,
        sourceFragmentCount: 2,
        stoppedBeforeHorizon: true,
        selectedFragmentCount: 1,
        selectedProofScaleHex: '0xbb',
        selectedTargetHashHex: transitionHash,
        selectedTargetNumber: '12',
        selectedTargetParentHashHex: targetHash,
        selectedTargetHeaderScaleHex: '0x0c',
        cryptographicallyVerified: false,
      };
    };

    const collected = await collectNativeFinalizedCheckpointRequest({
      rpc: createRpc().rpc,
      codec,
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
    });

    expect(collected.request.linkedGrandpaProofs).toEqual([
      { ancestryHeadersScaleHex: ['0x0b'], proofScaleHex: '0xaa' },
      { ancestryHeadersScaleHex: ['0x0c'], proofScaleHex: '0xbb' },
    ]);
    expect(collected.request.checkpointTailHeadersScaleHex).toEqual(['0x0d']);
    expect(collected.acquisition.ancestryHeaderCount).toBe(3);
    expect(warpCall).toBe(2);
  });

  it('fails closed on target, ancestry, and finality-horizon drift', async () => {
    const targetDrift = createRpc({ canonicalTargetHash: hash('f') });
    await expect(collectNativeFinalizedCheckpointRequest({
      rpc: targetDrift.rpc,
      codec: createCodec(),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
    })).rejects.toBeInstanceOf(NativeCheckpointCollectionDriftError);

    await expect(collectNativeFinalizedCheckpointRequest({
      rpc: createRpc().rpc,
      codec: createCodec({ forkAtHeight: 11 }),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
    })).rejects.toThrow(/ancestry changed/);

    await expect(collectNativeFinalizedCheckpointRequest({
      rpc: createRpc().rpc,
      codec: createCodec({ horizonHashHex: hash('f') }),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
    })).rejects.toThrow(/canonical identity/);
  });

  it('rejects a stale trust checkpoint whose ancestry exceeds the bounded profile', async () => {
    await expect(collectNativeFinalizedCheckpointRequest({
      rpc: createRpc().rpc,
      codec: createCodec({ selectedTargetNumber: 4_107 }),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
    })).rejects.toThrow(/review a newer trust checkpoint/);
  });

  it('rejects an endpoint whose genesis is not the reviewed sidechain', async () => {
    const request = vi.fn(async (method: string) =>
      method === 'chain_getBlockHash' ? hash('f') : null);
    const rpc = new ReadOnlySubstrateFinalityRpc({
      request<T>(method: string): Promise<T> {
        return request(method) as Promise<T>;
      },
    });
    await expect(collectNativeFinalizedCheckpointRequest({
      rpc,
      codec: createCodec(),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
    })).rejects.toThrow(/genesis hash/);
    expect(request).toHaveBeenCalledOnce();
  });
});
