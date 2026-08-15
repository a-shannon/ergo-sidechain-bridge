import { describe, expect, it, vi } from 'vitest';

import type {
  AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator,
} from './authority-bound-native-finalized-peg-in-runtime-identity-v2.js';

const authorityMocks = vi.hoisted(() => ({
  assertEvaluator: vi.fn(),
  assertCandidate: vi.fn(),
}));

vi.mock(
  './authority-bound-native-finalized-peg-in-runtime-identity-v2.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import(
        './authority-bound-native-finalized-peg-in-runtime-identity-v2.js'
      )
    >();
    return {
      ...actual,
      assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluatorProvenance:
        authorityMocks.assertEvaluator,
      assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateFromEvaluatorProvenance:
        authorityMocks.assertCandidate,
    };
  },
);

import {
  collectNativeFinalizedPegInRuntimeIdentityV2Candidate,
  collectNativeFinalizedPegInRuntimeIdentityV2Request,
} from './native-checkpoint-proof-collector.js';
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
  SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
} from './peg-in-runtime-identity-v2.js';
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
const runtimeCode = {
  storageKeyHex: SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
  artifactSha256Hex: hash('f'),
  artifactSizeBytes: '1831356',
  buildAttestationId: 'bridge-runtime-review-01',
  buildAttestationSha256Hex: hash('e'),
} as const;
const membershipStatement = {
  schema: 'e2s.peg-in-runtime-identity-statement.v2',
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
  runtimeCode,
} as const;
const nonMembershipStatement = {
  schema: 'e2s.peg-in-runtime-identity-statement.v2',
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
  runtimeCode,
} as const;
const chain = new Map<number, { hash: string; parent: string }>([
  [10, { hash: anchorHash, parent: hash('9') }],
  [11, { hash: targetHash, parent: anchorHash }],
  [12, { hash: transitionHash, parent: targetHash }],
  [13, { hash: horizonHash, parent: transitionHash }],
]);

describe('native peg-in runtime identity V2 proof collector', () => {
  it('collects membership with one ordered code-and-record proof', async () => {
    const { rpc, request } = createRpc();
    const result = await collectNativeFinalizedPegInRuntimeIdentityV2Request({
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
    expect(result.acquisition.runtimeStateStorageKeysHex).toEqual([
      SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
      recordKey,
    ]);
    expect(result.acquisition.runtimeStateOutcome).toBe('membership');
    expect(result.acquisition.runtimeStateProofNodeCount).toBe(2);
    expect(result.acquisition.runtimeStateProofBytes).toBe(4);
    expect(result.boundary).toEqual({
      readOnlyRpc: true,
      candidatePackageOnly: true,
      rpcCodecCryptographicallyVerified: false,
      sidechainFinalityVerified: false,
      statementRuntimeStateVerified: false,
      runtimeCodeStateProofVerified: false,
      runtimeBuildAttestationVerified: false,
      historicalMintAbsenceVerified: false,
      runtimeCodeIdentityVerified: false,
      committedVaultTransitionVerified: false,
      mintAuthorityGranted: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
    });
    expect(request).toHaveBeenCalledWith('state_getReadProof', [[
      SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
      recordKey,
    ], targetHash]);
    expect(request.mock.calls.filter(call => call[0] === 'state_getReadProof')).toHaveLength(1);
    expect(request.mock.calls.map(call => call[0])).not.toContain('state_getStorage');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.request)).toBe(true);
    expect(Object.isFrozen(result.acquisition.runtimeStateStorageKeysHex)).toBe(true);
    expect(Object.isFrozen(result.boundary)).toBe(true);
  });

  it('collects non-membership with code, profile, and record in the same proof', async () => {
    const { rpc, request } = createRpc();
    const result = await collectNativeFinalizedPegInRuntimeIdentityV2Request({
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
      SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
      PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX,
      recordKey,
    ]);
    expect(result.acquisition.runtimeStateOutcome).toBe('nonMembership');
    expect(request).toHaveBeenCalledWith('state_getReadProof', [[
      SUBSTRATE_RUNTIME_CODE_STORAGE_KEY_HEX,
      PEG_IN_RUNTIME_CURRENT_PROFILE_STORAGE_KEY_HEX,
      recordKey,
    ], targetHash]);
    expect(request.mock.calls.filter(call => call[0] === 'state_getReadProof')).toHaveLength(1);
  });

  it('rejects a statement whose authenticated identity does not match before any RPC', async () => {
    const { rpc, request } = createRpc();
    const mismatched = {
      ...structuredClone(membershipStatement),
      ergoBoxIdHex: hash('8'),
    };

    await expect(collectNativeFinalizedPegInRuntimeIdentityV2Request({
      rpc,
      codec: createCodec(),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      statement: mismatched,
    })).rejects.toThrow(/Ergo box ID does not match/i);
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a malformed runtime-code identity before any RPC', async () => {
    const { rpc, request } = createRpc();
    const malformed = {
      ...structuredClone(membershipStatement),
      runtimeCode: {
        ...structuredClone(runtimeCode),
        storageKeyHex: '0x3a436f6465',
      },
    } as unknown as typeof membershipStatement;

    await expect(collectNativeFinalizedPegInRuntimeIdentityV2Request({
      rpc,
      codec: createCodec(),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      statement: malformed,
    })).rejects.toThrow(/storage key/i);
    expect(request).not.toHaveBeenCalled();
  });

  it('collects and quarantines unauthenticated candidate output without releasing the mint hold', async () => {
    const { rpc } = createRpc();
    const evaluate = vi.fn(async ({ request: exactRequest }) => ({
      requestDigestHex: JSON.stringify(exactRequest),
      boundary: {
        launcherAtomicBootstrapProven: false,
        targetRuntimeBuildEvidenceMatched: false,
        targetRuntimeBuildIdentityVerified: false,
        runtimeCodeIdentityVerified: false,
        mintAuthorized: false,
      },
    }));
    const evaluator = {
      executableSha256Hex: hash('9'),
      runtimeCodeSha256Hex: runtimeCode.artifactSha256Hex,
      runtimeCodeSizeBytes: runtimeCode.artifactSizeBytes,
      runtimeBuildAttestationId: runtimeCode.buildAttestationId,
      runtimeBuildPacketSha256Hex:
        runtimeCode.buildAttestationSha256Hex,
      executionPolicySha256: 'a'.repeat(64),
      executionBoundary: {
        mode:
          'source-refreshed-dual-attestation-candidate-output-only',
        sourceOwnedRuntimeBuildAttestorLockReloadedPerLaunch: true,
        sourceOwnedNativeVerifierAttestorLockReloadedPerLaunch: true,
        executionPolicyValidatedPerLaunch: true,
        containedProcessRequired: true,
        immutableLauncherInstallationRequired: true,
        authorityRecordV2Required: true,
        launcherInstallationActivationCampaignCompleted: false,
        launcherAtomicBootstrapProven: false,
        targetStateCodeIsHistoricalProducerCode: false,
        targetRuntimeBuildIdentityVerified: false,
        runtimeUpgradeHistoryVerified: false,
        runtimeCodeIdentityVerified: false,
        mintAuthorityGranted: false,
        settlementAuthorityGranted: false,
        gate5Closed: false,
      },
      deriveExecutableInvocationSha256Hex: vi.fn(() => hash('8')),
      evaluate,
    } as const;

    const result =
      await collectNativeFinalizedPegInRuntimeIdentityV2Candidate({
        rpc,
        codec: createCodec(),
        trustAnchor,
        targetNativeBlockHashHex: targetHash,
        statement: membershipStatement,
        trustedAnchorDigestHex: hash('4'),
        evaluator: evaluator as unknown as
          AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator,
      });

    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(result.nativeExecutablePins).toEqual({
      codecSha256Hex: hash('e'),
      codecInvocationSha256Hex: {
        encodeHeaders: hash('1'),
        inspectWarpProof: hash('2'),
        inspectFinalityProof: hash('3'),
      },
      verifierSha256Hex: hash('9'),
      verifierInvocationSha256Hex: hash('8'),
      verifierExecutionPolicySha256: 'a'.repeat(64),
      runtimeCodeSha256Hex: runtimeCode.artifactSha256Hex,
      runtimeBuildPacketSha256Hex:
        runtimeCode.buildAttestationSha256Hex,
    });
    expect(result.boundary).toEqual({
      readOnlyRpc: true,
      sidechainFinalityVerified: false,
      statementRuntimeStateVerified: false,
      runtimeCodeStateProofVerified: false,
      runtimeBuildAttestationVerified: true,
      nativeVerifierAttestationVerified: true,
      immutableLauncherInstallationRequired: true,
      authorityRecordV2Required: true,
      launcherInstallationActivationCampaignCompleted: false,
      launcherAtomicBootstrapProven: false,
      targetRuntimeBuildEvidenceMatched: false,
      targetRuntimeBuildIdentityVerified: false,
      targetStateCodeIsHistoricalProducerCode: false,
      runtimeUpgradeHistoryVerified: false,
      cutoverPolicyVerified: false,
      historicalMintAbsenceVerified: false,
      runtimeCodeIdentityVerified: false,
      committedVaultTransitionVerified: false,
      mintAuthorityGranted: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
      productionReady: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.boundary)).toBe(true);
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
