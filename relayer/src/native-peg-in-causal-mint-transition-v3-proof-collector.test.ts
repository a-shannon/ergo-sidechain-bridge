import { describe, expect, it, vi } from 'vitest';

const causalV3ProvenanceMocks = vi.hoisted(() => ({
  assertEvaluator: vi.fn(),
  assertCandidate: vi.fn(),
}));

vi.mock('./native-peg-in-causal-mint-transition-v3-execution-authority.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./native-peg-in-causal-mint-transition-v3-execution-authority.js')
  >();
  return {
    ...actual,
    assertPinnedLocalCausalV3ResultCandidateEvaluatorProvenance:
      causalV3ProvenanceMocks.assertEvaluator,
    assertPinnedLocalCausalV3ResultCandidateFromEvaluatorProvenance:
      causalV3ProvenanceMocks.assertCandidate,
  };
});

import {
  COLLECTED_NATIVE_PEG_IN_CAUSAL_MINT_TRANSITION_V3_CANDIDATE_SCHEMA,
  COLLECTED_NATIVE_PEG_IN_CAUSAL_MINT_TRANSITION_V3_REQUEST_SCHEMA,
  collectNativeFinalizedPegInCausalMintTransitionV3Candidate,
  collectNativeFinalizedPegInCausalMintTransitionV3Request,
} from './native-checkpoint-proof-collector.js';
import {
  deriveNativeFinalizedPegInCausalMintTransitionV3ExactRequestDigestHex,
} from './native-finalized-peg-in-causal-mint-transition-v3.js';
import type {
  PinnedLocalCausalV3ResultCandidateEvaluator,
} from './native-peg-in-causal-mint-transition-v3-execution-authority.js';
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
  encodePegInRuntimeRecordV1ScaleHex,
} from './peg-in-runtime-state.js';
import {
  ReadOnlySubstrateFinalityRpc,
  derivePegInCausalAdmissionReceiptStorageKeyV1,
  derivePegInCausalInvalidationTombstoneStorageKeyV1,
  type SubstrateRpcHeaderObservation,
} from './substrate-finality-provider.js';

const hash = (byte: string): string => `0x${byte.repeat(64)}`;
const sidechainId = hash('1');
const anchorHash = hash('a');
const targetHash = hash('c');
const transitionHash = hash('b');
const horizonHash = hash('d');
const executionBlockHash = hash('6');
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
const eventStatement = {
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
const causalKeys = derivePegInCausalRuntimeStorageKeysV2({
  sidechainIdHex: sidechainId,
  ergoBoxIdHex,
});
const targetReceiptKey =
  derivePegInCausalAdmissionReceiptStorageKeyV1(causalKeys.recordKeyHex);
const targetInvalidationTombstoneKey =
  derivePegInCausalInvalidationTombstoneStorageKeyV1(causalKeys.recordKeyHex);
const additionalRecordKey = hash('5');
const additionalPendingKey =
  derivePegInCausalPendingAdmissionStorageKeyV2(additionalRecordKey);
const additionalReceiptKey =
  derivePegInCausalAdmissionReceiptStorageKeyV1(additionalRecordKey);
const parentPendingKeysScaleHex = scalePendingKeys([
  causalKeys.recordKeyHex,
  additionalRecordKey,
]);
const childPendingKeysScaleHex = scalePendingKeys([additionalRecordKey]);
const chain = new Map<number, { hash: string; parent: string }>([
  [10, { hash: anchorHash, parent: hash('9') }],
  [11, { hash: targetHash, parent: anchorHash }],
  [12, { hash: transitionHash, parent: targetHash }],
  [13, { hash: horizonHash, parent: transitionHash }],
]);

describe('native causal mint-transition V3 proof collector', () => {
  it('builds the exact receipt-aware V3 request without granting authority', async () => {
    const childProof = ['0x0102', '0x0304'];
    const parentProof = ['0x0506', '0x0708'];
    const { rpc, request } = createRpc((_keys: unknown, at: string) => ({
      at,
      proof: at === targetHash ? childProof : parentProof,
    }));

    const result = await collectNativeFinalizedPegInCausalMintTransitionV3Request({
      rpc,
      codec: createCodec(),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      executionIdentityStatement,
      eventStatement,
      contractStateStatement,
    });
    const transitionKeys = derivePegInFrontierMintTransitionStatementV1({
      sidechainIdHex: sidechainId,
      ergoBoxIdHex,
      tokenAddressHex,
      recipientHex: `0x${'66'.repeat(20)}`,
    });
    const causalSuffix = [
      causalKeys.currentPegInProfileStorageKeyHex,
      causalKeys.currentCausalProfileStorageKeyHex,
      causalKeys.causalEnforcementStorageKeyHex,
      causalKeys.pendingKeysStorageKeyHex,
      causalKeys.pendingAdmissionStorageKeyHex,
      targetReceiptKey,
      targetInvalidationTombstoneKey,
      causalKeys.consumedAdmissionStorageKeyHex,
      additionalPendingKey,
      additionalReceiptKey,
    ];
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
      COLLECTED_NATIVE_PEG_IN_CAUSAL_MINT_TRANSITION_V3_REQUEST_SCHEMA,
    );
    expect(result.request.schema).toBe(
      'e2s.native-finalized-peg-in-causal-mint-transition-request.v3',
    );
    expect(result.request.statement).toEqual({
      schema: 'e2s.peg-in-causal-mint-transition-statement.v3',
      ...causalKeys,
      admissionReceiptStorageKeyHex: targetReceiptKey,
      invalidationTombstoneStorageKeyHex: targetInvalidationTombstoneKey,
    });
    expect(result.request.mintTransitionRequest.parentStateProofNodesHex).toEqual(parentProof);
    expect(result.request.mintTransitionRequest.contractStateRequest.eventRequest
      .executionIdentityRequest.runtimeStateProofNodesHex).toEqual(childProof);
    expect(result.acquisition.postStateStorageKeysHex).toEqual(expectedChildKeys);
    expect(result.acquisition.parentStateStorageKeysHex).toEqual(expectedParentKeys);
    expect(result.acquisition.postStateStorageKeysHex).toContain(additionalReceiptKey);
    expect(result.acquisition.parentStateStorageKeysHex).toContain(additionalReceiptKey);
    expect(request).toHaveBeenCalledWith(
      'state_getReadProof',
      [expectedChildKeys, targetHash],
    );
    expect(request).toHaveBeenCalledWith(
      'state_getReadProof',
      [expectedParentKeys, anchorHash],
    );
    expect(result.boundary.readOnlyRpc).toBe(true);
    expect(result.boundary.candidatePackageOnly).toBe(true);
    expect(Object.entries(result.boundary)
      .filter(([key]) => !['readOnlyRpc', 'candidatePackageOnly'].includes(key))
      .every(([, value]) => value === false)).toBe(true);
    expect(Object.isFrozen(result.request.statement)).toBe(true);
  });

  it('rejects parent/child identity drift after both V3 proofs', async () => {
    const { rpc, request } = createRpc(
      (_keys: unknown, at: string) => ({ at, proof: ['0x0102'] }),
      ({ height, defaultHash, proofReadCount }) =>
        proofReadCount === 2 && height === 11 ? hash('8') : defaultHash,
    );
    await expect(collectNativeFinalizedPegInCausalMintTransitionV3Request({
      rpc,
      codec: createCodec(),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      executionIdentityStatement,
      eventStatement,
      contractStateStatement,
    })).rejects.toThrow(/parent\/child identities changed/i);
    expect(request.mock.calls.filter(call => call[0] === 'state_getReadProof')).toHaveLength(2);
  });

  it('binds one collected request to exact evaluator pins without accepting proof claims', async () => {
    const candidate = Object.freeze({
      schema: 'e2s.pinned-local-causal-v3-result-candidate.v1',
      status: 'UNAUTHENTICATED_CAUSAL_V3_CANDIDATE_OUTPUT_WITH_NON_ATOMIC_LAUNCHER_BOUNDARY',
      requestDigestHex: hash('8'),
    });
    const evaluate = vi.fn(async () => candidate);
    const evaluator = createEvaluator(evaluate);

    const result = await collectNativeFinalizedPegInCausalMintTransitionV3Candidate({
      rpc: createRpc((_keys: unknown, at: string) => ({
        at,
        proof: ['0x0102', '0x0304'],
      })).rpc,
      codec: createCodec(),
      evaluator,
      trustedAnchorDigestHex: hash('6'),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      executionIdentityStatement,
      eventStatement,
      contractStateStatement,
    });
    const exactRequestBytes = Buffer.from(JSON.stringify(result.collection.request), 'utf8');

    expect(result.schema).toBe(
      COLLECTED_NATIVE_PEG_IN_CAUSAL_MINT_TRANSITION_V3_CANDIDATE_SCHEMA,
    );
    expect(result.attemptCount).toBe(1);
    expect(result.candidate).toBe(candidate);
    expect(causalV3ProvenanceMocks.assertEvaluator).toHaveBeenCalledWith(evaluator);
    expect(causalV3ProvenanceMocks.assertCandidate).toHaveBeenCalledWith({
      evaluator,
      candidate,
      expectedRequestDigestHex:
        deriveNativeFinalizedPegInCausalMintTransitionV3ExactRequestDigestHex(
          exactRequestBytes,
        ),
    });
    expect(evaluate).toHaveBeenCalledWith({
      trustedAnchorDigestHex: hash('6'),
      request: result.collection.request,
    });
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
      sourceExecutionIdentityDigestHex: hash('4'),
    });
    expect(result.boundary).toEqual({
      readOnlyRpc: true,
      sourceRefreshedBeforeAndAfterExecution: true,
      brokerSelfImageBoundToAuthorityRecordV2: true,
      launcherInstallationActivationCampaignCompleted: false,
      launcherAtomicBootstrapProven: false,
      candidateOutputOnly: true,
      nativeVerifierExecutionAuthenticated: false,
      reportedProofShapeValidated: true,
      sidechainFinalityVerified: false,
      directParentChildVerified: false,
      causalPrePostStateVerified: false,
      exactCausalSuccessorVerified: false,
      federatedSourceProofReceiptAuthenticated: false,
      sourceProofExecutionAuthenticated: false,
      sourceCanonicalityVerified: false,
      trustlessSourceProofVerified: false,
      independentBuildAttestationVerified: false,
      localConformanceOnly: true,
      admissionEligible: false,
      lifecycleReferenceJoined: false,
      committedVaultTransitionVerified: false,
      mintAuthorized: false,
      daemonAdmissionAuthorized: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
      productionReadinessVerified: false,
    });
  });

  it('recollects after snapshot drift and evaluates only the stable request', async () => {
    const evaluate = vi.fn(async () => Object.freeze({ requestDigestHex: hash('8') }));
    const evaluator = createEvaluator(evaluate);
    let injectedDrift = false;
    const { rpc, request } = createRpc(
      (_keys: unknown, at: string) => ({ at, proof: ['0x0102'] }),
      ({ height, defaultHash, proofReadCount }) => {
        if (!injectedDrift && proofReadCount === 2 && height === 11) {
          injectedDrift = true;
          return hash('8');
        }
        return defaultHash;
      },
    );

    const result = await collectNativeFinalizedPegInCausalMintTransitionV3Candidate({
      rpc,
      codec: createCodec(),
      evaluator,
      trustedAnchorDigestHex: hash('6'),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      executionIdentityStatement,
      eventStatement,
      contractStateStatement,
      maxAttempts: 2,
    });

    expect(result.attemptCount).toBe(2);
    expect(evaluate).toHaveBeenCalledOnce();
    expect(request.mock.calls.filter(call => call[0] === 'state_getReadProof')).toHaveLength(4);
  });

  it('keeps the original evaluator and pins when the caller mutates input during collection', async () => {
    const originalCandidate = Object.freeze({ requestDigestHex: hash('8') });
    const substitutedCandidate = Object.freeze({ requestDigestHex: hash('9') });
    const originalEvaluate = vi.fn(async () => originalCandidate);
    const substitutedEvaluate = vi.fn(async () => substitutedCandidate);
    const originalEvaluator = createEvaluator(originalEvaluate);
    const substitutedEvaluator = createEvaluator(substitutedEvaluate, {
      executableSha256Hex: hash('b'),
      executionPolicySha256: 'c'.repeat(64),
      sourceExecutionIdentityDigestHex: hash('d'),
    });
    let input!: Parameters<
      typeof collectNativeFinalizedPegInCausalMintTransitionV3Candidate
    >[0];
    let substitutionInjected = false;
    const { rpc } = createRpc((_keys: unknown, at: string) => {
      if (!substitutionInjected) {
        substitutionInjected = true;
        const mutableInput = input as {
          evaluator: PinnedLocalCausalV3ResultCandidateEvaluator;
          trustedAnchorDigestHex: string;
        };
        mutableInput.evaluator = substitutedEvaluator;
        mutableInput.trustedAnchorDigestHex = hash('e');
      }
      return { at, proof: ['0x0102'] };
    });
    input = {
      rpc,
      codec: createCodec(),
      evaluator: originalEvaluator,
      trustedAnchorDigestHex: hash('6'),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      executionIdentityStatement,
      eventStatement,
      contractStateStatement,
    };

    const result = await collectNativeFinalizedPegInCausalMintTransitionV3Candidate(
      input,
    );

    expect(originalEvaluate).toHaveBeenCalledOnce();
    expect(originalEvaluate).toHaveBeenCalledWith({
      trustedAnchorDigestHex: hash('6'),
      request: result.collection.request,
    });
    expect(substitutedEvaluate).not.toHaveBeenCalled();
    expect(result.candidate).toBe(originalCandidate);
    expect(result.nativeExecutablePins.verifierSha256Hex).toBe(hash('8'));
    expect(result.nativeExecutablePins.sourceExecutionIdentityDigestHex).toBe(hash('4'));
    expect(causalV3ProvenanceMocks.assertCandidate).toHaveBeenLastCalledWith({
      evaluator: originalEvaluator,
      candidate: originalCandidate,
      expectedRequestDigestHex:
        deriveNativeFinalizedPegInCausalMintTransitionV3ExactRequestDigestHex(
          Buffer.from(JSON.stringify(result.collection.request), 'utf8'),
        ),
    });
  });

  it('does not retry a candidate evaluator rejection', async () => {
    const evaluate = vi.fn(async () => {
      throw new Error('causal V3 candidate rejected');
    });
    const evaluator = createEvaluator(evaluate);
    const { rpc, request } = createRpc(
      (_keys: unknown, at: string) => ({ at, proof: ['0x0102'] }),
    );

    await expect(collectNativeFinalizedPegInCausalMintTransitionV3Candidate({
      rpc,
      codec: createCodec(),
      evaluator,
      trustedAnchorDigestHex: hash('6'),
      trustAnchor,
      targetNativeBlockHashHex: targetHash,
      executionIdentityStatement,
      eventStatement,
      contractStateStatement,
      maxAttempts: 3,
    })).rejects.toThrow(/causal V3 candidate rejected/i);

    expect(evaluate).toHaveBeenCalledOnce();
    expect(request.mock.calls.filter(call => call[0] === 'state_getReadProof')).toHaveLength(2);
  });
});

function createEvaluator(
  evaluate: ReturnType<typeof vi.fn>,
  overrides: Partial<{
    executableSha256Hex: string;
    executionPolicySha256: string;
    sourceExecutionIdentityDigestHex: string;
  }> = {},
): PinnedLocalCausalV3ResultCandidateEvaluator {
  return {
    executableSha256Hex: overrides.executableSha256Hex ?? hash('8'),
    executionPolicySha256: overrides.executionPolicySha256 ?? '9'.repeat(64),
    sourceExecutionIdentityDigestHex:
      overrides.sourceExecutionIdentityDigestHex ?? hash('4'),
    executionBoundary: {
      mode: 'pinned-local-source-refreshed-contained-v3-candidate-only',
    },
    deriveExecutableInvocationSha256Hex: vi.fn(() => hash('7')),
    evaluate,
  } as unknown as PinnedLocalCausalV3ResultCandidateEvaluator;
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
  readProofResponse: unknown = { at: targetHash, proof: ['0x0102'] },
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
