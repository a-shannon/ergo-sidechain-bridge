import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({
  getExecution: vi.fn(),
  refreshIdentity: vi.fn(),
  assertIdentity: vi.fn(),
  runContained: vi.fn(),
}));

vi.mock('./pinned-local-native-verifier-build.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./pinned-local-native-verifier-build.js')
  >();
  return {
    ...actual,
    getPinnedLocalNativeVerifierExecution: mocks.getExecution,
    refreshPinnedLocalPegInCausalMintTransitionV3ExecutionIdentity:
      mocks.refreshIdentity,
    assertPinnedLocalPegInCausalMintTransitionV3ExecutionIdentityProvenance:
      mocks.assertIdentity,
  };
});

vi.mock('./native-contained-process.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./native-contained-process.js')
  >();
  return {
    ...actual,
    runNativeContainedProcess: mocks.runContained,
  };
});

import {
  deriveNativeFinalizedPegInCausalMintTransitionV3ExactRequestDigestHex,
  type NativeFinalizedPegInCausalMintTransitionV3Request,
} from './native-finalized-peg-in-causal-mint-transition-v3.js';
import {
  PINNED_LOCAL_CAUSAL_V3_RESULT_CANDIDATE_SCHEMA,
  PINNED_LOCAL_CAUSAL_V3_RESULT_CANDIDATE_STATUS,
  assertPinnedLocalCausalV3ResultCandidateEvaluatorProvenance,
  assertPinnedLocalCausalV3ResultCandidateFromEvaluatorProvenance,
  createPinnedLocalCausalV3ResultCandidateEvaluator,
} from './native-peg-in-causal-mint-transition-v3-execution-authority.js';
import type {
  PinnedLocalNativeVerifierBuild,
  PinnedLocalPegInCausalMintTransitionV3ExecutionIdentity,
} from './pinned-local-native-verifier-build.js';

interface Vector {
  trustedAnchorDigestHex: string;
  request: NativeFinalizedPegInCausalMintTransitionV3Request;
  expected: Record<string, unknown>;
}

const vector = JSON.parse(readFileSync(
  new URL('../test-vectors/native-finalized-peg-in-causal-mint-transition-v3.json', import.meta.url),
  'utf8',
)) as Vector;
const LAUNCHER_SHA256_HEX = `0x${'11'.repeat(32)}`;
const VERIFIER_SHA256_HEX = `0x${'22'.repeat(32)}`;
const VECTOR_SHA256_HEX = `0x${'33'.repeat(32)}`;
const IDENTITY_DIGEST_HEX = `0x${'44'.repeat(32)}`;
const LAUNCHER_PATH = [
  'C:',
  'Program Files',
  'E2SBridge',
  'NativeExecution',
  'v2',
  'Images',
  LAUNCHER_SHA256_HEX.slice(2),
  'bridge-contained-launcher.exe',
].join('\\');
const VERIFIER_PATH = resolve('bridge-causal-v3-verifier.exe');
const BUILD = Object.freeze({}) as unknown as PinnedLocalNativeVerifierBuild;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-22T10:00:00.000Z'));
  mocks.getExecution.mockReturnValue({
    pegInCausalMintTransitionV3VerifierExecutablePath: VERIFIER_PATH,
    pegInCausalMintTransitionV3VerifierSha256Hex: VERIFIER_SHA256_HEX,
  });
  mocks.refreshIdentity.mockReturnValue(executionIdentity());
  mocks.runContained.mockResolvedValue(containedResult(
    Buffer.from(JSON.stringify(vector.expected), 'utf8'),
  ));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('pinned local causal V3 result candidate evaluation', () => {
  it('quarantines structurally valid child output under explicit non-authority boundaries', async () => {
    const evaluator = createEvaluator();
    const candidate = await evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: vector.request,
    });
    const requestBytes = Buffer.from(JSON.stringify(vector.request), 'utf8');
    const requestDigestHex =
      deriveNativeFinalizedPegInCausalMintTransitionV3ExactRequestDigestHex(
        requestBytes,
      );

    expect(candidate.schema).toBe(
      PINNED_LOCAL_CAUSAL_V3_RESULT_CANDIDATE_SCHEMA,
    );
    expect(candidate.status).toBe(
      PINNED_LOCAL_CAUSAL_V3_RESULT_CANDIDATE_STATUS,
    );
    expect(candidate.requestDigestHex).toBe(requestDigestHex);
    expect(candidate.quarantinedChildOutput).toMatchObject({
      contentExposed: false,
      proofClaimsAccepted: false,
    });
    expect(candidate).not.toHaveProperty('mintTransitionVerification');
    expect(candidate).not.toHaveProperty('causalTransition');
    expect(candidate.execution).toMatchObject({
      sourceExecutionIdentityDigestHex: IDENTITY_DIGEST_HEX,
      verifierExecutableSha256Hex: VERIFIER_SHA256_HEX,
      independentlySuppliedTrustAnchorDigestHex: vector.trustedAnchorDigestHex,
    });
    expect(candidate.boundary).toEqual({
      candidateOnly: true,
      localConformanceOnly: true,
      sourceRefreshedBeforeAndAfterExecution: true,
      exactToolchainIdentityBound: true,
      exactExecutableIdentityBound: true,
      exactTrackedVectorIdentityBound: true,
      containedProcessRequested: true,
      immutableLauncherInstallationRequired: true,
      authorityRecordV2Required: true,
      launcherDigestMatchedBeforeAndAfter: true,
      brokerSelfImageBoundToAuthorityRecordV2: true,
      launcherInstallationActivationCampaignCompleted: false,
      launcherAtomicBootstrapProven: false,
      directProcessAllowed: false,
      nativeVerifierExecutionAuthenticated: false,
      independentlySuppliedTrustAnchorDigestBound: true,
      reportedProofShapeValidated: true,
      authenticatedTrustRootOriginVerified: false,
      sidechainFinalityVerified: false,
      directParentChildVerified: false,
      causalPrePostStateVerified: false,
      exactCausalSuccessorVerified: false,
      federatedSourceProofReceiptAuthenticated: false,
      sourceProofExecutionAuthenticated: false,
      sourceCanonicalityVerified: false,
      trustlessSourceProofVerified: false,
      runtimeAdmissionReceiptJoined: false,
      lifecycleReferenceJoined: false,
      independentBuildAttestationVerified: false,
      completeBuildToolClosureVerified: false,
      dependencyCacheContentAttested: false,
      admissionEligible: false,
      committedVaultTransitionVerified: false,
      mintAuthorized: false,
      daemonAdmissionAuthorized: false,
      reconciliationHoldReleaseAuthorized: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
      productionReadinessVerified: false,
    });
    assertPinnedLocalCausalV3ResultCandidateEvaluatorProvenance(
      evaluator,
    );
    assertPinnedLocalCausalV3ResultCandidateFromEvaluatorProvenance({
      evaluator,
      candidate,
      expectedRequestDigestHex: requestDigestHex,
    });
  });

  it('rejects trust-root substitution before launching the verifier', async () => {
    const evaluator = createEvaluator();
    await expect(evaluator.evaluate({
      trustedAnchorDigestHex: `0x${'77'.repeat(32)}`,
      request: vector.request,
    })).rejects.toThrow(/request trust anchor does not match/i);
    expect(mocks.runContained).not.toHaveBeenCalled();
  });

  it('rejects weakened native output and non-canonical stdout', async () => {
    const evaluator = createEvaluator();
    const weakened = structuredClone(vector.expected) as {
      boundary: { gate5Closed: boolean };
    };
    weakened.boundary.gate5Closed = true;
    mocks.runContained.mockResolvedValueOnce(containedResult(
      Buffer.from(JSON.stringify(weakened), 'utf8'),
    ));
    await expect(evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: vector.request,
    })).rejects.toThrow(/gate5Closed/i);

    mocks.runContained.mockResolvedValueOnce(containedResult(
      Buffer.from(`${JSON.stringify(vector.expected)}\n`, 'utf8'),
    ));
    await expect(evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: vector.request,
    })).rejects.toThrow(/exactly one JSON result/i);
  });

  it('rejects cloned and cross-evaluator candidate objects', async () => {
    const evaluator = createEvaluator();
    const otherEvaluator = createEvaluator();
    const candidate = await evaluator.evaluate({
      trustedAnchorDigestHex: vector.trustedAnchorDigestHex,
      request: vector.request,
    });
    const requestDigestHex = candidate.requestDigestHex;

    expect(() => assertPinnedLocalCausalV3ResultCandidateFromEvaluatorProvenance({
      evaluator,
      candidate: structuredClone(candidate),
      expectedRequestDigestHex: requestDigestHex,
    })).toThrow(/provenance is missing/i);
    expect(() => assertPinnedLocalCausalV3ResultCandidateFromEvaluatorProvenance({
      evaluator: otherEvaluator,
      candidate,
      expectedRequestDigestHex: requestDigestHex,
    })).toThrow(/provenance is missing/i);
  });
});

function createEvaluator() {
  return createPinnedLocalCausalV3ResultCandidateEvaluator({
    build: BUILD,
    launcherPath: LAUNCHER_PATH,
    launcherSha256Hex: LAUNCHER_SHA256_HEX,
    policyEpoch: 7,
    policyNotBeforeUnixMs: Date.parse('2026-07-22T09:00:00.000Z'),
    policyExpiresAtUnixMs: Date.parse('2026-07-22T11:00:00.000Z'),
    allowedSystemDlls: ['kernel32.dll', 'ntdll.dll'],
  });
}

function executionIdentity(): PinnedLocalPegInCausalMintTransitionV3ExecutionIdentity {
  return Object.freeze({
    schema: 'e2s.pinned-local-peg-in-causal-mint-transition-v3-execution-identity.v1',
    status: 'PINNED_LOCAL_CAUSAL_V3_EXECUTION_IDENTITY_REFRESHED',
    identityDigestHex: IDENTITY_DIGEST_HEX,
    sourceIdentity: {
      consensusSourceLockSha256: '1e0c1e1b7848e47ce3d07a2697ff2b1ca02492d49afcfdd5cc09f1819c957380',
      frontierCommit: '75329a2df49e2cc7981485392c31160929d1bd48',
      frontierPatchSha256: 'c5e9b7fd36977e387e96049813afd634ae4317c591860c2b017303418ab336ab',
    },
    toolchain: {
      platformKey: 'win32-x64',
      rustTarget: 'x86_64-pc-windows-msvc',
      cargo: { version: 'cargo pinned', sha256: '77'.repeat(32) },
      rustc: { version: 'rustc pinned', sha256: '88'.repeat(32) },
      git: { version: 'git pinned', sha256: '99'.repeat(32) },
    },
    executable: {
      sha256Hex: VERIFIER_SHA256_HEX,
      vectorCanonicalSha256Hex: VECTOR_SHA256_HEX,
    },
    boundary: {
      sourceLocksReloaded: true,
      sourceCheckoutRevalidated: true,
      toolchainReobserved: true,
      executableDigestReobserved: true,
      trackedVectorBuildBindingPreserved: true,
      independentBuildAttestationVerified: false,
      completeBuildToolClosureVerified: false,
      dependencyCacheContentAttested: false,
      localConformanceOnly: true,
      admissionEligible: false,
      gate5Closed: false,
    },
  }) as PinnedLocalPegInCausalMintTransitionV3ExecutionIdentity;
}

function containedResult(stdout: Buffer) {
  return {
    stdout,
    boundary: {
      trustedLauncherInstallationRequired: true as const,
      launcherDigestMatchedBeforeAndAfter: true as const,
      brokerSelfImageBoundToAuthorityRecordV2: true as const,
      launcherInstallationActivationCampaignCompleted: false as const,
      launcherAtomicBootstrapProven: false as const,
      targetAtomicityDelegatedToBroker: true as const,
      targetAtomicityObservedByTypeScript: false as const,
      executionAdmissionGranted: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    },
  };
}
