import { describe, expect, it, vi } from 'vitest';

const pegInProvenanceMocks = vi.hoisted(() => ({
  assertVerifier: vi.fn(),
  assertVerification: vi.fn(),
}));

vi.mock('./native-finalized-peg-in-state.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./native-finalized-peg-in-state.js')>();
  return {
    ...actual,
    assertAuthorityBoundNativeFinalizedPegInStateVerifierProvenance:
      pegInProvenanceMocks.assertVerifier,
    assertAuthorityBoundNativeFinalizedPegInStateVerificationFromVerifierProvenance:
      pegInProvenanceMocks.assertVerification,
  };
});

import {
  collectAndVerifyNativeFinalizedPegInState,
  collectNativeFinalizedPegInStateRequest,
} from './native-checkpoint-proof-collector.js';
import {
  deriveNativeFinalizedPegInStateRequestDigestHex,
  type AuthorityBoundNativeFinalizedPegInStateVerifier,
} from './native-finalized-peg-in-state.js';
import type {
  NativeSubstrateRpcProofCodec,
  RpcFinalityInspection,
  RpcWarpInspection,
} from './native-substrate-rpc-proof-codec.js';
import {
  encodePegInRuntimeProfileV1ScaleHex,
  encodePegInRuntimeRecordV1ScaleHex,
  PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX,
  deriveProcessedPegInRuntimeStorageKeyV1Hex,
} from './peg-in-runtime-state.js';
import {
  ReadOnlySubstrateFinalityRpc,
  type SubstrateRpcHeaderObservation,
} from './substrate-finality-provider.js';

const hash = (byte: string): string => `0x${byte.repeat(64)}`;
const sidechainId = hash('1');
const anchorHash = hash('a');
const targetHash = hash('c');
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
const membershipStatement = {
  schema: 'e2s.peg-in-runtime-state-statement.v1',
  ergoBoxIdHex,
  record: {
    outcome: 'membership',
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
      executionBlockHashHex: targetHash,
      transactionHashHex: hash('7'),
      eventIndex: 0,
    }),
  },
} as const;
const nonMembershipStatement = {
  schema: 'e2s.peg-in-runtime-state-statement.v1',
  ergoBoxIdHex,
  expectedProfileScaleHex: encodePegInRuntimeProfileV1ScaleHex({
    formatVersion: 1,
    sidechainIdHex: sidechainId,
    bridgeAddress: `0x${'44'.repeat(20)}`,
    profileRevision: '1',
    activationHeight: '1',
  }),
  record: {
    outcome: 'nonMembership',
  },
} as const;
const chain = new Map<number, { hash: string; parent: string }>([
  [10, { hash: anchorHash, parent: hash('9') }],
  [11, { hash: targetHash, parent: anchorHash }],
  [12, { hash: transitionHash, parent: targetHash }],
  [13, { hash: horizonHash, parent: transitionHash }],
]);

describe('native peg-in state proof collector', () => {
  it('collects membership with exactly one record-key read proof and no storage-value read', async () => {
    const { rpc, request } = createRpc();
    const result = await collectNativeFinalizedPegInStateRequest({
      rpc,
      codec: createCodec(),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      statement: membershipStatement,
    });
    const recordKey = deriveProcessedPegInRuntimeStorageKeyV1Hex({
      sidechainIdHex: sidechainId,
      ergoBoxIdHex,
    });

    expect(result.request.statement).toEqual(membershipStatement);
    expect(result.request.runtimeStateProofNodesHex).toEqual(['0x0102', '0x0304']);
    expect(result.acquisition.runtimeStateStorageKeysHex).toEqual([recordKey]);
    expect(result.acquisition.runtimeStateOutcome).toBe('membership');
    expect(result.boundary).toEqual({
      readOnlyRpc: true,
      candidatePackageOnly: true,
      rpcCodecCryptographicallyVerified: false,
      sidechainFinalityVerified: false,
      statementRuntimeStateVerified: false,
      historicalMintAbsenceVerified: false,
      runtimeCodeIdentityVerified: false,
      committedVaultTransitionVerified: false,
      mintAuthorityGranted: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
    });
    expect(request).toHaveBeenCalledWith('state_getReadProof', [[recordKey], targetHash]);
    expect(request.mock.calls.map(call => call[0])).not.toContain('state_getStorage');
  });

  it('collects non-membership with profile then record key in the same proof', async () => {
    const { rpc, request } = createRpc();
    const result = await collectNativeFinalizedPegInStateRequest({
      rpc,
      codec: createCodec(),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      statement: nonMembershipStatement,
    });
    const recordKey = deriveProcessedPegInRuntimeStorageKeyV1Hex({
      sidechainIdHex: sidechainId,
      ergoBoxIdHex,
    });

    expect(result.acquisition.runtimeStateStorageKeysHex).toEqual([
      PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX,
      recordKey,
    ]);
    expect(request).toHaveBeenCalledWith('state_getReadProof', [[
      PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX,
      recordKey,
    ], targetHash]);
  });

  it('rejects a statement whose authenticated identity does not match before any RPC', async () => {
    const { rpc, request } = createRpc();
    const mismatched = {
      ...structuredClone(membershipStatement),
      ergoBoxIdHex: hash('8'),
    };

    await expect(collectNativeFinalizedPegInStateRequest({
      rpc,
      codec: createCodec(),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      statement: mismatched,
    })).rejects.toThrow(/Ergo box ID does not match/i);
    expect(request).not.toHaveBeenCalled();
  });

  it('returns a proof-only authority result without mint, vault, or Gate 5 authority', async () => {
    const verify = vi.fn(async () => ({
      schema: 'e2s.native-finalized-peg-in-state-verification.v1',
      requestDigestHex: hash('8'),
      boundary: {
        sidechainFinalityVerified: true,
        statementRuntimeStateVerified: true,
        historicalMintAbsenceVerified: false,
        runtimeCodeIdentityVerified: false,
        committedVaultTransitionVerified: false,
        mintAuthorized: false,
        transactionMutationEnabled: false,
        gate5Closed: false,
      },
    }));
    const verifier = {
      executableSha256Hex: hash('8'),
      executionPolicySha256: '9'.repeat(64),
      executionBoundary: {
        mode: 'source-refreshed-authority-contained-proof-only',
      },
      deriveExecutableInvocationSha256Hex: vi.fn(() => hash('7')),
      verify,
    } as unknown as AuthorityBoundNativeFinalizedPegInStateVerifier;

    const result = await collectAndVerifyNativeFinalizedPegInState({
      rpc: createRpc().rpc,
      codec: createCodec(),
      verifier,
      trustedAnchorDigestHex: hash('6'),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      statement: membershipStatement,
    });

    expect(pegInProvenanceMocks.assertVerifier).toHaveBeenCalledWith(verifier);
    expect(pegInProvenanceMocks.assertVerification).toHaveBeenCalledWith({
      verifier,
      verification: result.verification,
      expectedRequestDigestHex:
        deriveNativeFinalizedPegInStateRequestDigestHex(result.collection.request),
    });
    expect(verify).toHaveBeenCalledOnce();
    expect(result.nativeExecutablePins).toEqual({
      codecSha256Hex: hash('e'),
      codecInvocationSha256Hex: {
        encodeHeaders: hash('1'),
        inspectWarpProof: hash('2'),
        inspectFinalityProof: hash('3'),
      },
      verifierSha256Hex: hash('8'),
      verifierInvocationSha256Hex: hash('7'),
      verifierExecutionPolicySha256: '9'.repeat(64),
    });
    expect(result.boundary).toEqual({
      readOnlyRpc: true,
      sidechainFinalityVerified: true,
      statementRuntimeStateVerified: true,
      historicalMintAbsenceVerified: false,
      runtimeCodeIdentityVerified: false,
      committedVaultTransitionVerified: false,
      mintAuthorityGranted: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
    });
  });
});

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

function createRpc() {
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
    if (method === 'state_getReadProof') {
      return { at: targetHash, proof: ['0x0102', '0x0304'] };
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
