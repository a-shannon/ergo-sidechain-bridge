import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

import {
  normalizeImmutableNativeContainedLauncherPath,
  runNativeContainedProcess,
  type NativeContainedProcessResult,
} from './native-contained-process.js';
import {
  NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
  deriveNativeGrandpaTrustAnchorDigestHex,
  type NativeFinalizedBridgeCheckpointRequest,
} from './native-finalized-bridge-checkpoint.js';
import {
  assertNativeFinalizedPegInCausalMintTransitionV3ResultCandidateProvenance,
  buildNativeFinalizedPegInCausalMintTransitionV3ResultCandidate,
  deriveNativeFinalizedPegInCausalMintTransitionV3ExactRequestDigestHex,
  normalizeNativeFinalizedPegInCausalMintTransitionV3Request,
  type NativeFinalizedPegInCausalMintTransitionV3Request,
} from './native-finalized-peg-in-causal-mint-transition-v3.js';
import {
  deriveExecutableInvocationSha256Hex,
  normalizeExecutableSha256Hex,
} from './native-executable-pin.js';
import {
  assertPinnedLocalPegInCausalMintTransitionV3ExecutionIdentityProvenance,
  getPinnedLocalNativeVerifierExecution,
  refreshPinnedLocalPegInCausalMintTransitionV3ExecutionIdentity,
  type PinnedLocalNativeVerifierBuild,
  type PinnedLocalPegInCausalMintTransitionV3ExecutionIdentity,
} from './pinned-local-native-verifier-build.js';
import { parseStrictJson } from './strict-json.js';

const PINNED_LOCAL_CAUSAL_V3_EXECUTION_AUTHORITY_SCHEMA =
  'e2s.pinned-local-causal-v3-execution-authority.v1' as const;
const PINNED_LOCAL_CAUSAL_V3_EXECUTION_POLICY_SCHEMA =
  'e2s.pinned-local-causal-v3-execution-policy.v1' as const;
export const PINNED_LOCAL_CAUSAL_V3_RESULT_CANDIDATE_SCHEMA =
  'e2s.pinned-local-causal-v3-result-candidate.v1' as const;
export const PINNED_LOCAL_CAUSAL_V3_RESULT_CANDIDATE_STATUS =
  'UNAUTHENTICATED_CAUSAL_V3_CANDIDATE_OUTPUT_WITH_NON_ATOMIC_LAUNCHER_BOUNDARY' as const;

const OPERATION = 'verify-peg-in-causal-mint-transition-v3' as const;
const TIMEOUT_MS = 30_000;
const REQUEST_LIMIT_BYTES = 32 * 1024 * 1024;
const STDOUT_LIMIT_BYTES = 16 * 1024 * 1024;
const STDERR_LIMIT_BYTES = 64 * 1024;
const MAX_SYSTEM_DLLS = 128;
const MAX_SYSTEM_DLL_NAME_BYTES = 128;

export interface PinnedLocalCausalV3ResultCandidateEvaluatorOptions {
  readonly build: PinnedLocalNativeVerifierBuild;
  readonly launcherPath: string;
  readonly launcherSha256Hex: string;
  readonly policyEpoch: number;
  readonly policyNotBeforeUnixMs: number;
  readonly policyExpiresAtUnixMs: number;
  readonly allowedSystemDlls: readonly string[];
}

interface PinnedLocalCausalV3ExecutionAuthorityRequest {
  readonly operation: typeof OPERATION;
  readonly trustedAnchorDigestHex: string;
  readonly requestBytes: Buffer;
}

interface PinnedLocalCausalV3ExecutionAuthorityResult {
  readonly stdout: Buffer;
  readonly operation: typeof OPERATION;
  readonly requestSha256Hex: string;
  readonly stdoutSha256Hex: string;
  readonly trustedAnchorDigestHex: string;
  readonly sourceExecutionIdentityDigestHex: string;
  readonly authorityProfileDigestHex: string;
  readonly executionPolicySha256: string;
  readonly policyEpoch: number;
  readonly boundary: {
    readonly sourceLocksReloadedBeforeExecution: true;
    readonly sourceLocksReloadedAfterExecution: true;
    readonly sourceCheckoutRevalidatedBeforeExecution: true;
    readonly sourceCheckoutRevalidatedAfterExecution: true;
    readonly toolchainReobservedBeforeExecution: true;
    readonly toolchainReobservedAfterExecution: true;
    readonly executableDigestReobservedBeforeExecution: true;
    readonly executableDigestReobservedAfterExecution: true;
    readonly launcherDigestMatchedBeforeAndAfter: true;
    readonly brokerSelfImageBoundToAuthorityRecordV2: true;
    readonly launcherInstallationActivationCampaignCompleted: false;
    readonly launcherAtomicBootstrapProven: false;
    readonly brokerAuthorityModeRequested: true;
    readonly containedProofExecutionRequested: true;
    readonly directProcessAllowed: false;
    readonly candidateOutputOnly: true;
    readonly nativeVerifierExecutionAuthenticated: false;
    readonly independentBuildAttestationVerified: false;
    readonly completeBuildToolClosureVerified: false;
    readonly dependencyCacheContentAttested: false;
    readonly localConformanceOnly: true;
    readonly admissionEligible: false;
    readonly sourceProofExecutionAuthenticated: false;
    readonly sourceCanonicalityVerified: false;
    readonly mintAuthorityGranted: false;
    readonly settlementAuthorityGranted: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly gate5Closed: false;
    readonly productionReady: false;
  };
}

interface PinnedLocalCausalV3ExecutionAuthorityDeclaration {
  readonly schema: typeof PINNED_LOCAL_CAUSAL_V3_EXECUTION_AUTHORITY_SCHEMA;
  readonly operation: typeof OPERATION;
  readonly sourceExecutionIdentityDigestHex: string;
  readonly authorityProfileDigestHex: string;
  readonly executionPolicySha256: string;
  readonly policyEpoch: number;
  readonly policyNotBeforeUnixMs: number;
  readonly policyExpiresAtUnixMs: number;
  readonly launcherPath: string;
  readonly launcherSha256Hex: string;
  readonly verifierExecutablePath: string;
  readonly verifierExecutableSha256Hex: string;
  readonly vectorCanonicalSha256Hex: string;
  readonly allowedSystemDlls: readonly string[];
  readonly limits: {
    readonly timeoutMs: typeof TIMEOUT_MS;
    readonly requestLimitBytes: typeof REQUEST_LIMIT_BYTES;
    readonly stdoutLimitBytes: typeof STDOUT_LIMIT_BYTES;
    readonly stderrLimitBytes: typeof STDERR_LIMIT_BYTES;
  };
  readonly boundary: {
    readonly sourceRefreshedPerLaunch: true;
    readonly exactToolchainBound: true;
    readonly exactExecutableBound: true;
    readonly exactVectorBound: true;
    readonly immutableLauncherInstallationRequired: true;
    readonly authorityRecordV2Required: true;
    readonly brokerSelfImageBindingRequired: true;
    readonly launcherInstallationActivationCampaignCompleted: false;
    readonly launcherAtomicBootstrapProven: false;
    readonly candidateOutputOnly: true;
    readonly independentBuildAttestationVerified: false;
    readonly localConformanceOnly: true;
    readonly admissionEligible: false;
    readonly gate5Closed: false;
  };
}

interface PinnedLocalCausalV3ExecutionAuthority {
  readonly declaration: PinnedLocalCausalV3ExecutionAuthorityDeclaration;
  execute(
    input: PinnedLocalCausalV3ExecutionAuthorityRequest,
  ): Promise<PinnedLocalCausalV3ExecutionAuthorityResult>;
}

declare const PINNED_LOCAL_CAUSAL_V3_CANDIDATE_BRAND: unique symbol;

export interface PinnedLocalCausalV3ResultCandidatePayload {
  readonly schema: typeof PINNED_LOCAL_CAUSAL_V3_RESULT_CANDIDATE_SCHEMA;
  readonly status: typeof PINNED_LOCAL_CAUSAL_V3_RESULT_CANDIDATE_STATUS;
  readonly requestDigestHex: string;
  readonly trustAnchorDigestHex: string;
  readonly quarantinedChildOutput: {
    readonly sha256Hex: string;
    readonly sizeBytes: string;
    readonly contentExposed: false;
    readonly proofClaimsAccepted: false;
  };
  readonly execution: {
    readonly sourceExecutionIdentityDigestHex: string;
    readonly authorityProfileDigestHex: string;
    readonly executionPolicySha256: string;
    readonly policyEpoch: number;
    readonly verifierExecutableSha256Hex: string;
    readonly exactRequestSha256Hex: string;
    readonly exactResultSha256Hex: string;
    readonly independentlySuppliedTrustAnchorDigestHex: string;
  };
  readonly boundary: {
    readonly candidateOnly: true;
    readonly localConformanceOnly: true;
    readonly sourceRefreshedBeforeAndAfterExecution: true;
    readonly exactToolchainIdentityBound: true;
    readonly exactExecutableIdentityBound: true;
    readonly exactTrackedVectorIdentityBound: true;
    readonly containedProcessRequested: true;
    readonly immutableLauncherInstallationRequired: true;
    readonly authorityRecordV2Required: true;
    readonly launcherDigestMatchedBeforeAndAfter: true;
    readonly brokerSelfImageBoundToAuthorityRecordV2: true;
    readonly launcherInstallationActivationCampaignCompleted: false;
    readonly launcherAtomicBootstrapProven: false;
    readonly directProcessAllowed: false;
    readonly nativeVerifierExecutionAuthenticated: false;
    readonly independentlySuppliedTrustAnchorDigestBound: true;
    readonly reportedProofShapeValidated: true;
    readonly authenticatedTrustRootOriginVerified: false;
    readonly sidechainFinalityVerified: false;
    readonly directParentChildVerified: false;
    readonly causalPrePostStateVerified: false;
    readonly exactCausalSuccessorVerified: false;
    readonly federatedSourceProofReceiptAuthenticated: false;
    readonly sourceProofExecutionAuthenticated: false;
    readonly sourceCanonicalityVerified: false;
    readonly trustlessSourceProofVerified: false;
    readonly runtimeAdmissionReceiptJoined: false;
    readonly lifecycleReferenceJoined: false;
    readonly independentBuildAttestationVerified: false;
    readonly completeBuildToolClosureVerified: false;
    readonly dependencyCacheContentAttested: false;
    readonly admissionEligible: false;
    readonly committedVaultTransitionVerified: false;
    readonly mintAuthorized: false;
    readonly daemonAdmissionAuthorized: false;
    readonly reconciliationHoldReleaseAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly transactionMutationEnabled: false;
    readonly gate5Closed: false;
    readonly productionReadinessVerified: false;
  };
}

export type PinnedLocalCausalV3ResultCandidate =
  PinnedLocalCausalV3ResultCandidatePayload & {
    readonly [PINNED_LOCAL_CAUSAL_V3_CANDIDATE_BRAND]: true;
  };

export interface PinnedLocalCausalV3ReportedReceiptIdentityExpectation {
  readonly recordKeyHex: string;
  readonly causalProfileIdHex: string;
  readonly sourceIntentIdHex: string;
  readonly admissionIdHex: string;
  readonly proofSystemIdHex: string;
  readonly proofProfileIdHex: string;
  readonly admissionReceiptStorageKeyHex: string;
  readonly sourceProofRequestDigestHex: string;
  readonly sourceProofResultIdHex: string;
  readonly sourceProofDigestHex: string;
  readonly verifierExecutableSha256Hex: string;
  readonly verifierProfileIdHex: string;
  readonly admissionExpiresAtNativeHeight: string | number | bigint;
  readonly sourceProofIssuedAtNativeHeight: string | number | bigint;
}

export interface PinnedLocalCausalV3ReportedReceiptIdentityProjection {
  readonly receiptIdentityDigestHex: string;
  readonly admissionReceiptScaleSha256Hex: string;
  readonly admissionAdmittedAtNativeHeight: string;
  readonly admissionExpiresAtNativeHeight: string;
  readonly parentNativeBlockHashHex: string;
  readonly parentNativeHeight: string;
  readonly childNativeBlockHashHex: string;
  readonly childNativeHeight: string;
}

export interface PinnedLocalCausalV3ResultCandidateEvaluator {
  readonly executableSha256Hex: string;
  readonly executionPolicySha256: string;
  readonly sourceExecutionIdentityDigestHex: string;
  readonly installation: Readonly<{
    readonly role: 'causal-v3-verifier';
    readonly authorityRecordVersion: 'v2';
    readonly authorityProfileDigestHex: string;
    readonly executionPolicySha256: string;
    readonly launcherPath: string;
    readonly launcherSha256Hex: string;
    readonly minimumPolicyEpoch: number;
    readonly activationCampaignCompleted: false;
    readonly fundsAuthorityGranted: false;
  }>;
  readonly executionBoundary: {
    readonly mode: 'pinned-local-source-refreshed-contained-v3-candidate-only';
    readonly sourceRefreshedPerLaunch: true;
    readonly exactToolchainBound: true;
    readonly exactExecutableBound: true;
    readonly exactVectorBound: true;
    readonly containedProcessRequested: true;
    readonly brokerSelfImageBindingRequired: true;
    readonly launcherInstallationActivationCampaignCompleted: false;
    readonly launcherAtomicBootstrapProven: false;
    readonly nativeVerifierExecutionAuthenticated: false;
    readonly independentBuildAttestationVerified: false;
    readonly localConformanceOnly: true;
    readonly admissionEligible: false;
    readonly sourceProofExecutionAuthenticated: false;
    readonly mintAuthorityGranted: false;
    readonly settlementAuthorityGranted: false;
    readonly gate5Closed: false;
  };
  deriveExecutableInvocationSha256Hex(trustedAnchorDigestHex: string): string;
  evaluate(input: {
    readonly trustedAnchorDigestHex: string;
    readonly request: NativeFinalizedPegInCausalMintTransitionV3Request;
  }): Promise<PinnedLocalCausalV3ResultCandidate>;
}

const AUTHORITIES = new WeakSet<object>();
const RESULTS = new WeakMap<object, {
  authority: object;
  requestSha256Hex: string;
  stdoutSha256Hex: string;
  trustedAnchorDigestHex: string;
}>();
const CANDIDATE_EVALUATORS = new WeakSet<object>();
const CANDIDATES = new WeakMap<object, {
  readonly evaluator: object;
  readonly requestDigestHex: string;
  readonly executionPolicySha256: string;
  readonly stdoutSha256Hex: string;
  readonly reportedReceiptIdentity: Readonly<{
    readonly recordKeyHex: string;
    readonly causalProfileIdHex: string;
    readonly sourceIntentIdHex: string;
    readonly admissionIdHex: string;
    readonly proofSystemIdHex: string;
    readonly proofProfileIdHex: string;
    readonly admissionReceiptStorageKeyHex: string;
    readonly sourceProofRequestDigestHex: string;
    readonly sourceProofResultIdHex: string;
    readonly sourceProofDigestHex: string;
    readonly verifierExecutableSha256Hex: string;
    readonly verifierProfileIdHex: string;
    readonly admissionAdmittedAtNativeHeight: string;
    readonly admissionExpiresAtNativeHeight: string;
  }>;
  readonly reportedReceiptProjection:
    PinnedLocalCausalV3ReportedReceiptIdentityProjection;
}>();

function createPinnedLocalCausalV3ExecutionAuthority(
  options: PinnedLocalCausalV3ResultCandidateEvaluatorOptions,
): PinnedLocalCausalV3ExecutionAuthority {
  if (!options || typeof options !== 'object') {
    throw new Error('pinned local causal V3 execution authority options must be an object');
  }
  const build = options.build;
  const initialIdentity = refreshExecutionIdentity(build);
  const execution = getPinnedLocalNativeVerifierExecution(build);
  const verifierExecutableSha256Hex = normalizeExecutableSha256Hex(
    execution.pegInCausalMintTransitionV3VerifierSha256Hex,
    'pinned local causal V3 verifier executable digest',
  );
  if (verifierExecutableSha256Hex !== initialIdentity.executable.sha256Hex) {
    throw new Error('pinned local causal V3 executable differs from refreshed source identity');
  }
  const launcherSha256Hex = normalizeExecutableSha256Hex(
    options.launcherSha256Hex,
    'pinned local causal V3 contained launcher digest',
  );
  const launcherPath = normalizeImmutableNativeContainedLauncherPath(
    options.launcherPath,
    launcherSha256Hex,
  );
  const policyEpoch = positiveSafeInteger(options.policyEpoch, 'policy epoch');
  const policyNotBeforeUnixMs = nonNegativeSafeInteger(
    options.policyNotBeforeUnixMs,
    'policy not-before timestamp',
  );
  const policyExpiresAtUnixMs = nonNegativeSafeInteger(
    options.policyExpiresAtUnixMs,
    'policy expiry timestamp',
  );
  if (policyNotBeforeUnixMs >= policyExpiresAtUnixMs) {
    throw new Error('pinned local causal V3 policy window is empty');
  }
  const allowedSystemDlls = normalizeSystemDlls(options.allowedSystemDlls);
  const authorityProfileDigestHex = domainSha256(
    'E2S_PINNED_LOCAL_CAUSAL_V3_AUTHORITY_PROFILE_V1',
    {
      sourceExecutionIdentityDigestHex: initialIdentity.identityDigestHex,
      verifierExecutableSha256Hex,
      vectorCanonicalSha256Hex: initialIdentity.executable.vectorCanonicalSha256Hex,
      operation: OPERATION,
    },
  );
  const executionPolicySha256 = domainSha256(
    'E2S_PINNED_LOCAL_CAUSAL_V3_EXECUTION_POLICY_V1',
    {
      schema: PINNED_LOCAL_CAUSAL_V3_EXECUTION_POLICY_SCHEMA,
      operation: OPERATION,
      sourceExecutionIdentityDigestHex: initialIdentity.identityDigestHex,
      authorityProfileDigestHex,
      launcherSha256Hex,
      verifierExecutableSha256Hex,
      policyEpoch,
      policyNotBeforeUnixMs,
      policyExpiresAtUnixMs,
      allowedSystemDlls,
      limits: {
        timeoutMs: TIMEOUT_MS,
        requestLimitBytes: REQUEST_LIMIT_BYTES,
        stdoutLimitBytes: STDOUT_LIMIT_BYTES,
        stderrLimitBytes: STDERR_LIMIT_BYTES,
      },
    },
  ).slice(2);
  const declaration: PinnedLocalCausalV3ExecutionAuthorityDeclaration = deepFreeze({
    schema: PINNED_LOCAL_CAUSAL_V3_EXECUTION_AUTHORITY_SCHEMA,
    operation: OPERATION,
    sourceExecutionIdentityDigestHex: initialIdentity.identityDigestHex,
    authorityProfileDigestHex,
    executionPolicySha256,
    policyEpoch,
    policyNotBeforeUnixMs,
    policyExpiresAtUnixMs,
    launcherPath,
    launcherSha256Hex,
    verifierExecutablePath:
      execution.pegInCausalMintTransitionV3VerifierExecutablePath,
    verifierExecutableSha256Hex,
    vectorCanonicalSha256Hex:
      initialIdentity.executable.vectorCanonicalSha256Hex,
    allowedSystemDlls,
    limits: {
      timeoutMs: TIMEOUT_MS as typeof TIMEOUT_MS,
      requestLimitBytes: REQUEST_LIMIT_BYTES as typeof REQUEST_LIMIT_BYTES,
      stdoutLimitBytes: STDOUT_LIMIT_BYTES as typeof STDOUT_LIMIT_BYTES,
      stderrLimitBytes: STDERR_LIMIT_BYTES as typeof STDERR_LIMIT_BYTES,
    },
    boundary: {
      sourceRefreshedPerLaunch: true as const,
      exactToolchainBound: true as const,
      exactExecutableBound: true as const,
      exactVectorBound: true as const,
      immutableLauncherInstallationRequired: true as const,
      authorityRecordV2Required: true as const,
      brokerSelfImageBindingRequired: true as const,
      launcherInstallationActivationCampaignCompleted: false as const,
      launcherAtomicBootstrapProven: false as const,
      candidateOutputOnly: true as const,
      independentBuildAttestationVerified: false as const,
      localConformanceOnly: true as const,
      admissionEligible: false as const,
      gate5Closed: false as const,
    },
  });

  const authority: PinnedLocalCausalV3ExecutionAuthority = Object.freeze({
    declaration,
    async execute(
      input: PinnedLocalCausalV3ExecutionAuthorityRequest,
    ): Promise<PinnedLocalCausalV3ExecutionAuthorityResult> {
      if (input?.operation !== OPERATION) {
        throw new Error('pinned local causal V3 execution authority operation is unsupported');
      }
      if (!Buffer.isBuffer(input.requestBytes)) {
        throw new Error('pinned local causal V3 execution request must be a Buffer');
      }
      if (input.requestBytes.length > REQUEST_LIMIT_BYTES) {
        throw new Error(
          `pinned local causal V3 execution request exceeds ${REQUEST_LIMIT_BYTES} bytes`,
        );
      }
      const trustedAnchorDigestHex = lowercasePrefixedDigest32(
        input.trustedAnchorDigestHex,
        'trusted anchor digest',
      );
      assertPolicyWindow(declaration);
      const before = refreshExecutionIdentity(build);
      assertSameExecutionIdentity(before, declaration);
      const currentExecution = getPinnedLocalNativeVerifierExecution(build);
      if (
        currentExecution.pegInCausalMintTransitionV3VerifierExecutablePath
          !== declaration.verifierExecutablePath
        || currentExecution.pegInCausalMintTransitionV3VerifierSha256Hex
          !== declaration.verifierExecutableSha256Hex
      ) {
        throw new Error('pinned local causal V3 execution target changed after authority creation');
      }

      const requestSnapshot = Buffer.from(input.requestBytes);
      const contained = await runNativeContainedProcess({
        launcherPath: declaration.launcherPath,
        launcherSha256Hex: declaration.launcherSha256Hex,
        targetPath: declaration.verifierExecutablePath,
        targetSha256Hex: declaration.verifierExecutableSha256Hex,
        targetArgs: [
          '--trusted-anchor-digest',
          trustedAnchorDigestHex,
        ],
        policyNotBeforeUnixMs: declaration.policyNotBeforeUnixMs,
        policyExpiresAtUnixMs: declaration.policyExpiresAtUnixMs,
        timeoutMs: declaration.limits.timeoutMs,
        requestLimitBytes: declaration.limits.requestLimitBytes,
        stdoutLimitBytes: declaration.limits.stdoutLimitBytes,
        stderrLimitBytes: declaration.limits.stderrLimitBytes,
        requestBytes: requestSnapshot,
        authority: {
          profileDigestHex: declaration.authorityProfileDigestHex,
          policyDigestHex: `0x${declaration.executionPolicySha256}`,
          policyEpoch: declaration.policyEpoch,
          recordVersion: 'v2',
          allowedSystemDlls: declaration.allowedSystemDlls,
        },
      });
      assertContainedBoundary(contained);
      assertPolicyWindow(declaration);
      const after = refreshExecutionIdentity(build);
      assertSameExecutionIdentity(after, declaration);

      const stdoutSnapshot = Buffer.from(contained.stdout);
      const requestSha256Hex = sha256Bytes(requestSnapshot);
      const stdoutSha256Hex = sha256Bytes(stdoutSnapshot);
      const result: PinnedLocalCausalV3ExecutionAuthorityResult = deepFreeze({
        get stdout(): Buffer {
          return Buffer.from(stdoutSnapshot);
        },
        operation: OPERATION,
        requestSha256Hex,
        stdoutSha256Hex,
        trustedAnchorDigestHex,
        sourceExecutionIdentityDigestHex:
          declaration.sourceExecutionIdentityDigestHex,
        authorityProfileDigestHex: declaration.authorityProfileDigestHex,
        executionPolicySha256: declaration.executionPolicySha256,
        policyEpoch: declaration.policyEpoch,
        boundary: {
          sourceLocksReloadedBeforeExecution: true as const,
          sourceLocksReloadedAfterExecution: true as const,
          sourceCheckoutRevalidatedBeforeExecution: true as const,
          sourceCheckoutRevalidatedAfterExecution: true as const,
          toolchainReobservedBeforeExecution: true as const,
          toolchainReobservedAfterExecution: true as const,
          executableDigestReobservedBeforeExecution: true as const,
          executableDigestReobservedAfterExecution: true as const,
          launcherDigestMatchedBeforeAndAfter: true as const,
          brokerSelfImageBoundToAuthorityRecordV2: true as const,
          launcherInstallationActivationCampaignCompleted: false as const,
          launcherAtomicBootstrapProven: false as const,
          brokerAuthorityModeRequested: true as const,
          containedProofExecutionRequested: true as const,
          directProcessAllowed: false as const,
          candidateOutputOnly: true as const,
          nativeVerifierExecutionAuthenticated: false as const,
          independentBuildAttestationVerified: false as const,
          completeBuildToolClosureVerified: false as const,
          dependencyCacheContentAttested: false as const,
          localConformanceOnly: true as const,
          admissionEligible: false as const,
          sourceProofExecutionAuthenticated: false as const,
          sourceCanonicalityVerified: false as const,
          mintAuthorityGranted: false as const,
          settlementAuthorityGranted: false as const,
          signingAuthorized: false as const,
          submissionAuthorized: false as const,
          broadcastAuthorized: false as const,
          gate5Closed: false as const,
          productionReady: false as const,
        },
      });
      RESULTS.set(result, {
        authority,
        requestSha256Hex,
        stdoutSha256Hex,
        trustedAnchorDigestHex,
      });
      return result;
    },
  });
  AUTHORITIES.add(authority);
  return authority;
}

function assertPinnedLocalCausalV3ExecutionAuthorityProvenance(
  authority: unknown,
): asserts authority is PinnedLocalCausalV3ExecutionAuthority {
  if (!authority || typeof authority !== 'object' || !AUTHORITIES.has(authority)) {
    throw new Error('pinned local causal V3 execution authority provenance is missing');
  }
}

function assertPinnedLocalCausalV3ExecutionAuthorityResultProvenance(
  input: {
    authority: PinnedLocalCausalV3ExecutionAuthority;
    result: unknown;
    expectedRequestBytes: Buffer;
    expectedTrustedAnchorDigestHex: string;
  },
): asserts input is {
  authority: PinnedLocalCausalV3ExecutionAuthority;
  result: PinnedLocalCausalV3ExecutionAuthorityResult;
  expectedRequestBytes: Buffer;
  expectedTrustedAnchorDigestHex: string;
} {
  assertPinnedLocalCausalV3ExecutionAuthorityProvenance(input.authority);
  if (!input.result || typeof input.result !== 'object') {
    throw new Error('pinned local causal V3 execution result provenance is missing');
  }
  if (!Buffer.isBuffer(input.expectedRequestBytes)) {
    throw new Error('expected pinned local causal V3 request must be a Buffer');
  }
  const provenance = RESULTS.get(input.result);
  const result = input.result as Partial<PinnedLocalCausalV3ExecutionAuthorityResult>;
  const stdout = result.stdout;
  const expectedRequestSha256Hex = sha256Bytes(input.expectedRequestBytes);
  const expectedTrustedAnchorDigestHex = lowercasePrefixedDigest32(
    input.expectedTrustedAnchorDigestHex,
    'expected trusted anchor digest',
  );
  if (
    provenance?.authority !== input.authority
    || provenance.requestSha256Hex !== expectedRequestSha256Hex
    || provenance.trustedAnchorDigestHex !== expectedTrustedAnchorDigestHex
    || !Buffer.isBuffer(stdout)
    || provenance.stdoutSha256Hex !== sha256Bytes(stdout)
    || result.requestSha256Hex !== provenance.requestSha256Hex
    || result.stdoutSha256Hex !== provenance.stdoutSha256Hex
    || result.trustedAnchorDigestHex !== provenance.trustedAnchorDigestHex
    || result.sourceExecutionIdentityDigestHex
      !== input.authority.declaration.sourceExecutionIdentityDigestHex
    || result.executionPolicySha256
      !== input.authority.declaration.executionPolicySha256
  ) {
    throw new Error('pinned local causal V3 execution result provenance is missing');
  }
}

export function createPinnedLocalCausalV3ResultCandidateEvaluator(
  options: PinnedLocalCausalV3ResultCandidateEvaluatorOptions,
): PinnedLocalCausalV3ResultCandidateEvaluator {
  const authority = createPinnedLocalCausalV3ExecutionAuthority(options);
  const declaration = authority.declaration;
  const executableSha256Hex = normalizeExecutableSha256Hex(
    declaration.verifierExecutableSha256Hex,
    'pinned local causal V3 candidate evaluator executable digest',
  );
  const executionPolicySha256 = lowercaseSha256NoPrefix(
    declaration.executionPolicySha256,
    'pinned local causal V3 candidate evaluator execution policy digest',
  );
  const sourceExecutionIdentityDigestHex = lowercasePrefixedDigest32(
    declaration.sourceExecutionIdentityDigestHex,
    'candidate evaluator source execution identity digest',
  );
  const executionBoundary = deepFreeze({
    mode: 'pinned-local-source-refreshed-contained-v3-candidate-only' as const,
    sourceRefreshedPerLaunch: true as const,
    exactToolchainBound: true as const,
    exactExecutableBound: true as const,
    exactVectorBound: true as const,
    containedProcessRequested: true as const,
    brokerSelfImageBindingRequired: true as const,
    launcherInstallationActivationCampaignCompleted: false as const,
    launcherAtomicBootstrapProven: false as const,
    nativeVerifierExecutionAuthenticated: false as const,
    independentBuildAttestationVerified: false as const,
    localConformanceOnly: true as const,
    admissionEligible: false as const,
    sourceProofExecutionAuthenticated: false as const,
    mintAuthorityGranted: false as const,
    settlementAuthorityGranted: false as const,
    gate5Closed: false as const,
  });

  const evaluator: PinnedLocalCausalV3ResultCandidateEvaluator = Object.freeze({
    executableSha256Hex,
    executionPolicySha256,
    sourceExecutionIdentityDigestHex,
    installation: deepFreeze({
      role: 'causal-v3-verifier' as const,
      authorityRecordVersion: 'v2' as const,
      authorityProfileDigestHex: declaration.authorityProfileDigestHex,
      executionPolicySha256,
      launcherPath: declaration.launcherPath,
      launcherSha256Hex: declaration.launcherSha256Hex,
      minimumPolicyEpoch: declaration.policyEpoch,
      activationCampaignCompleted: false as const,
      fundsAuthorityGranted: false as const,
    }),
    executionBoundary,
    deriveExecutableInvocationSha256Hex(
      trustedAnchorDigestHex: string,
    ): string {
      return deriveExecutableInvocationSha256Hex(executableSha256Hex, [
        '--trusted-anchor-digest',
        lowercasePrefixedDigest32(
          trustedAnchorDigestHex,
          'candidate evaluator trust anchor digest',
        ),
      ]);
    },
    async evaluate(input: {
      readonly trustedAnchorDigestHex: string;
      readonly request: NativeFinalizedPegInCausalMintTransitionV3Request;
    }): Promise<PinnedLocalCausalV3ResultCandidate> {
      const request = normalizeNativeFinalizedPegInCausalMintTransitionV3Request(
        input?.request,
      );
      const trustedAnchorDigestHex = lowercasePrefixedDigest32(
        input?.trustedAnchorDigestHex,
        'independently supplied causal V3 trust anchor digest',
      );
      if (
        deriveNativeGrandpaTrustAnchorDigestHex(commonFinalityRequestV3(request))
          !== trustedAnchorDigestHex
      ) {
        throw new Error(
          'causal V3 request trust anchor does not match the independently supplied digest',
        );
      }
      const requestBytes = Buffer.from(JSON.stringify(request), 'utf8');
      if (requestBytes.length > REQUEST_LIMIT_BYTES) {
        throw new Error(
          `native finalized causal mint-transition request exceeds ${REQUEST_LIMIT_BYTES} bytes`,
        );
      }
      const executionResult = await authority.execute({
        operation: OPERATION,
        trustedAnchorDigestHex,
        requestBytes,
      });
      assertPinnedLocalCausalV3ExecutionAuthorityResultProvenance({
        authority,
        result: executionResult,
        expectedRequestBytes: requestBytes,
        expectedTrustedAnchorDigestHex: trustedAnchorDigestHex,
      });
      assertCandidateExecutionResultBoundary(executionResult);
      const stdout = executionResult.stdout;
      const reportedCandidate =
        buildNativeFinalizedPegInCausalMintTransitionV3ResultCandidate({
          requestBytes,
          trustedAnchorDigestHex,
          verification: parseSingleJsonObject(stdout),
        });
      assertNativeFinalizedPegInCausalMintTransitionV3ResultCandidateProvenance(
        reportedCandidate,
      );
      const requestDigestHex =
        deriveNativeFinalizedPegInCausalMintTransitionV3ExactRequestDigestHex(
          requestBytes,
        );
      if (reportedCandidate.requestDigestHex !== requestDigestHex) {
        throw new Error('reported causal V3 candidate does not match the exact request digest');
      }
      const candidate = deepFreeze({
        schema: PINNED_LOCAL_CAUSAL_V3_RESULT_CANDIDATE_SCHEMA,
        status: PINNED_LOCAL_CAUSAL_V3_RESULT_CANDIDATE_STATUS,
        requestDigestHex,
        trustAnchorDigestHex: trustedAnchorDigestHex,
        quarantinedChildOutput: {
          sha256Hex: executionResult.stdoutSha256Hex,
          sizeBytes: stdout.length.toString(),
          contentExposed: false as const,
          proofClaimsAccepted: false as const,
        },
        execution: {
          sourceExecutionIdentityDigestHex,
          authorityProfileDigestHex: declaration.authorityProfileDigestHex,
          executionPolicySha256,
          policyEpoch: declaration.policyEpoch,
          verifierExecutableSha256Hex: executableSha256Hex,
          exactRequestSha256Hex: executionResult.requestSha256Hex,
          exactResultSha256Hex: executionResult.stdoutSha256Hex,
          independentlySuppliedTrustAnchorDigestHex: trustedAnchorDigestHex,
        },
        boundary: {
          candidateOnly: true as const,
          localConformanceOnly: true as const,
          sourceRefreshedBeforeAndAfterExecution: true as const,
          exactToolchainIdentityBound: true as const,
          exactExecutableIdentityBound: true as const,
          exactTrackedVectorIdentityBound: true as const,
          containedProcessRequested: true as const,
          immutableLauncherInstallationRequired: true as const,
          authorityRecordV2Required: true as const,
          launcherDigestMatchedBeforeAndAfter: true as const,
          brokerSelfImageBoundToAuthorityRecordV2: true as const,
          launcherInstallationActivationCampaignCompleted: false as const,
          launcherAtomicBootstrapProven: false as const,
          directProcessAllowed: false as const,
          nativeVerifierExecutionAuthenticated: false as const,
          independentlySuppliedTrustAnchorDigestBound: true as const,
          reportedProofShapeValidated: true as const,
          authenticatedTrustRootOriginVerified: false as const,
          sidechainFinalityVerified: false as const,
          directParentChildVerified: false as const,
          causalPrePostStateVerified: false as const,
          exactCausalSuccessorVerified: false as const,
          federatedSourceProofReceiptAuthenticated: false as const,
          sourceProofExecutionAuthenticated: false as const,
          sourceCanonicalityVerified: false as const,
          trustlessSourceProofVerified: false as const,
          runtimeAdmissionReceiptJoined: false as const,
          lifecycleReferenceJoined: false as const,
          independentBuildAttestationVerified: false as const,
          completeBuildToolClosureVerified: false as const,
          dependencyCacheContentAttested: false as const,
          admissionEligible: false as const,
          committedVaultTransitionVerified: false as const,
          mintAuthorized: false as const,
          daemonAdmissionAuthorized: false as const,
          reconciliationHoldReleaseAuthorized: false as const,
          signingAuthorized: false as const,
          submissionAuthorized: false as const,
          broadcastAuthorized: false as const,
          transactionMutationEnabled: false as const,
          gate5Closed: false as const,
          productionReadinessVerified: false as const,
        },
      }) as PinnedLocalCausalV3ResultCandidate;
      const reportedReceiptIdentity = deepFreeze({
        recordKeyHex: reportedCandidate.causalTransition.recordKeyHex,
        causalProfileIdHex: reportedCandidate.causalTransition.causalProfileIdHex,
        sourceIntentIdHex: reportedCandidate.causalTransition.sourceIntentIdHex,
        admissionIdHex: reportedCandidate.causalTransition.admissionIdHex,
        proofSystemIdHex: reportedCandidate.causalTransition.proofSystemIdHex,
        proofProfileIdHex: reportedCandidate.causalTransition.proofProfileIdHex,
        admissionReceiptStorageKeyHex:
          reportedCandidate.causalTransition.admissionReceiptStorageKeyHex,
        sourceProofRequestDigestHex:
          reportedCandidate.causalTransition.sourceProofRequestDigestHex,
        sourceProofResultIdHex:
          reportedCandidate.causalTransition.sourceProofResultIdHex,
        sourceProofDigestHex: reportedCandidate.causalTransition.sourceProofDigestHex,
        verifierExecutableSha256Hex:
          reportedCandidate.causalTransition.verifierExecutableSha256Hex,
        verifierProfileIdHex: reportedCandidate.causalTransition.verifierProfileIdHex,
        admissionAdmittedAtNativeHeight:
          reportedCandidate.causalTransition.admissionAdmittedAtNativeHeight,
        admissionExpiresAtNativeHeight:
          reportedCandidate.causalTransition.admissionExpiresAtNativeHeight,
      });
      const reportedReceiptProjection = deepFreeze({
        receiptIdentityDigestHex: domainSha256(
          'E2S_PINNED_LOCAL_CAUSAL_V3_REPORTED_RECEIPT_IDENTITY_V1',
          {
            ...reportedReceiptIdentity,
            admissionReceiptScaleSha256Hex: sha256Bytes(Buffer.from(
              reportedCandidate.causalTransition.admissionReceiptScaleHex.slice(2),
              'hex',
            )),
            parentNativeBlockHashHex:
              reportedCandidate.headerBinding.parentNativeBlockHashHex,
            parentNativeHeight: reportedCandidate.headerBinding.parentNativeHeight,
            childNativeBlockHashHex:
              reportedCandidate.headerBinding.childNativeBlockHashHex,
            childNativeHeight: reportedCandidate.headerBinding.childNativeHeight,
          },
        ),
        admissionReceiptScaleSha256Hex: sha256Bytes(Buffer.from(
          reportedCandidate.causalTransition.admissionReceiptScaleHex.slice(2),
          'hex',
        )),
        admissionAdmittedAtNativeHeight:
          reportedCandidate.causalTransition.admissionAdmittedAtNativeHeight,
        admissionExpiresAtNativeHeight:
          reportedCandidate.causalTransition.admissionExpiresAtNativeHeight,
        parentNativeBlockHashHex:
          reportedCandidate.headerBinding.parentNativeBlockHashHex,
        parentNativeHeight: reportedCandidate.headerBinding.parentNativeHeight,
        childNativeBlockHashHex:
          reportedCandidate.headerBinding.childNativeBlockHashHex,
        childNativeHeight: reportedCandidate.headerBinding.childNativeHeight,
      });
      CANDIDATES.set(candidate, {
        evaluator,
        requestDigestHex,
        executionPolicySha256,
        stdoutSha256Hex: executionResult.stdoutSha256Hex,
        reportedReceiptIdentity,
        reportedReceiptProjection,
      });
      return candidate;
    },
  });
  CANDIDATE_EVALUATORS.add(evaluator);
  return evaluator;
}

export function assertPinnedLocalCausalV3ResultCandidateEvaluatorProvenance(
  evaluator: unknown,
): asserts evaluator is PinnedLocalCausalV3ResultCandidateEvaluator {
  if (
    !evaluator
    || typeof evaluator !== 'object'
    || !CANDIDATE_EVALUATORS.has(evaluator)
  ) {
    throw new Error('pinned local causal V3 candidate evaluator provenance is missing');
  }
}

export function assertPinnedLocalCausalV3ResultCandidateFromEvaluatorProvenance(
  input: {
    readonly evaluator: PinnedLocalCausalV3ResultCandidateEvaluator;
    readonly candidate: unknown;
    readonly expectedRequestDigestHex: string;
  },
): asserts input is {
  evaluator: PinnedLocalCausalV3ResultCandidateEvaluator;
  candidate: PinnedLocalCausalV3ResultCandidate;
  expectedRequestDigestHex: string;
} {
  assertPinnedLocalCausalV3ResultCandidateEvaluatorProvenance(input.evaluator);
  if (!input.candidate || typeof input.candidate !== 'object') {
    throw new Error('pinned local causal V3 candidate provenance is missing');
  }
  const expectedRequestDigestHex = lowercasePrefixedDigest32(
    input.expectedRequestDigestHex,
    'expected causal V3 request digest',
  );
  const provenance = CANDIDATES.get(input.candidate);
  const candidate = input.candidate as Partial<PinnedLocalCausalV3ResultCandidate>;
  if (
    provenance?.evaluator !== input.evaluator
    || provenance.requestDigestHex !== expectedRequestDigestHex
    || provenance.executionPolicySha256 !== input.evaluator.executionPolicySha256
    || provenance.stdoutSha256Hex !== candidate.quarantinedChildOutput?.sha256Hex
  ) {
    throw new Error('pinned local causal V3 candidate provenance is missing');
  }
}

/**
 * Project only the normalized identity of the reported runtime receipt after
 * matching it to caller-held, process-provenant source-proof identities. The
 * child stdout, receipt bytes, proof nodes and proof claims remain quarantined.
 */
export function projectPinnedLocalCausalV3ReportedReceiptIdentity(
  input: {
    readonly evaluator: PinnedLocalCausalV3ResultCandidateEvaluator;
    readonly candidate: unknown;
    readonly expectedRequestDigestHex: string;
    readonly expected: PinnedLocalCausalV3ReportedReceiptIdentityExpectation;
  },
): PinnedLocalCausalV3ReportedReceiptIdentityProjection {
  assertPinnedLocalCausalV3ResultCandidateFromEvaluatorProvenance(input);
  const provenance = CANDIDATES.get(input.candidate as object);
  if (!provenance) {
    throw new Error('pinned local causal V3 reported receipt provenance is missing');
  }
  assertExactKeys(input.expected, [
    'admissionExpiresAtNativeHeight',
    'admissionIdHex',
    'admissionReceiptStorageKeyHex',
    'causalProfileIdHex',
    'proofProfileIdHex',
    'proofSystemIdHex',
    'recordKeyHex',
    'sourceIntentIdHex',
    'sourceProofIssuedAtNativeHeight',
    'sourceProofDigestHex',
    'sourceProofRequestDigestHex',
    'sourceProofResultIdHex',
    'verifierExecutableSha256Hex',
    'verifierProfileIdHex',
  ], 'causal V3 reported receipt expectation');
  const expected = {
    recordKeyHex: lowercasePrefixedDigest32(input.expected.recordKeyHex, 'record key'),
    causalProfileIdHex: lowercasePrefixedDigest32(
      input.expected.causalProfileIdHex,
      'causal profile ID',
    ),
    sourceIntentIdHex: lowercasePrefixedDigest32(
      input.expected.sourceIntentIdHex,
      'source intent ID',
    ),
    admissionIdHex: lowercasePrefixedDigest32(input.expected.admissionIdHex, 'admission ID'),
    proofSystemIdHex: lowercasePrefixedDigest32(
      input.expected.proofSystemIdHex,
      'proof-system ID',
    ),
    proofProfileIdHex: lowercasePrefixedDigest32(
      input.expected.proofProfileIdHex,
      'proof-profile ID',
    ),
    admissionReceiptStorageKeyHex: lowercaseByteHex(
      input.expected.admissionReceiptStorageKeyHex,
      'admission receipt storage key',
    ),
    sourceProofRequestDigestHex: lowercasePrefixedDigest32(
      input.expected.sourceProofRequestDigestHex,
      'source-proof request digest',
    ),
    sourceProofResultIdHex: lowercasePrefixedDigest32(
      input.expected.sourceProofResultIdHex,
      'source-proof result ID',
    ),
    sourceProofDigestHex: lowercasePrefixedDigest32(
      input.expected.sourceProofDigestHex,
      'source-proof digest',
    ),
    verifierExecutableSha256Hex: lowercasePrefixedDigest32(
      input.expected.verifierExecutableSha256Hex,
      'source-proof verifier executable digest',
    ),
    verifierProfileIdHex: lowercasePrefixedDigest32(
      input.expected.verifierProfileIdHex,
      'source-proof verifier profile ID',
    ),
    admissionExpiresAtNativeHeight: uint64Decimal(
      input.expected.admissionExpiresAtNativeHeight,
      'admission expiry height',
    ),
  };
  for (const [field, value] of Object.entries(expected)) {
    if (provenance.reportedReceiptIdentity[
      field as keyof typeof provenance.reportedReceiptIdentity
    ] !== value) {
      throw new Error(`reported runtime admission receipt ${field} differs from expectation`);
    }
  }
  const sourceProofIssuedAtNativeHeight = BigInt(uint64Decimal(
    input.expected.sourceProofIssuedAtNativeHeight,
    'source-proof issue height',
  ));
  if (
    BigInt(provenance.reportedReceiptIdentity.admissionAdmittedAtNativeHeight)
      < sourceProofIssuedAtNativeHeight
  ) {
    throw new Error('reported runtime admission receipt predates source-proof issuance');
  }
  return provenance.reportedReceiptProjection;
}

function assertCandidateExecutionResultBoundary(
  result: PinnedLocalCausalV3ExecutionAuthorityResult,
): void {
  const boundary = result.boundary;
  if (
    boundary.sourceLocksReloadedBeforeExecution !== true
    || boundary.sourceLocksReloadedAfterExecution !== true
    || boundary.sourceCheckoutRevalidatedBeforeExecution !== true
    || boundary.sourceCheckoutRevalidatedAfterExecution !== true
    || boundary.toolchainReobservedBeforeExecution !== true
    || boundary.toolchainReobservedAfterExecution !== true
    || boundary.executableDigestReobservedBeforeExecution !== true
    || boundary.executableDigestReobservedAfterExecution !== true
    || boundary.launcherDigestMatchedBeforeAndAfter !== true
    || boundary.brokerSelfImageBoundToAuthorityRecordV2 !== true
    || boundary.launcherInstallationActivationCampaignCompleted !== false
    || boundary.launcherAtomicBootstrapProven !== false
    || boundary.brokerAuthorityModeRequested !== true
    || boundary.containedProofExecutionRequested !== true
    || boundary.directProcessAllowed !== false
    || boundary.candidateOutputOnly !== true
    || boundary.nativeVerifierExecutionAuthenticated !== false
    || boundary.independentBuildAttestationVerified !== false
    || boundary.completeBuildToolClosureVerified !== false
    || boundary.dependencyCacheContentAttested !== false
    || boundary.localConformanceOnly !== true
    || boundary.admissionEligible !== false
    || boundary.sourceProofExecutionAuthenticated !== false
    || boundary.sourceCanonicalityVerified !== false
    || boundary.mintAuthorityGranted !== false
    || boundary.settlementAuthorityGranted !== false
    || boundary.signingAuthorized !== false
    || boundary.submissionAuthorized !== false
    || boundary.broadcastAuthorized !== false
    || boundary.gate5Closed !== false
    || boundary.productionReady !== false
  ) {
    throw new Error('pinned local causal V3 candidate execution weakens a fail-closed boundary');
  }
}

function commonFinalityRequestV3(
  request: NativeFinalizedPegInCausalMintTransitionV3Request,
): NativeFinalizedBridgeCheckpointRequest {
  const source = request.mintTransitionRequest.contractStateRequest.eventRequest
    .executionIdentityRequest;
  return {
    schema: NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
    trustAnchor: source.trustAnchor,
    targetNativeBlockHashHex: source.targetNativeBlockHashHex,
    targetHeaderScaleHex: source.targetHeaderScaleHex,
    linkedGrandpaProofs: [...source.linkedGrandpaProofs],
    checkpointTailHeadersScaleHex: [...source.checkpointTailHeadersScaleHex],
    finalityProofScaleHex: source.finalityProofScaleHex,
    runtimeStateProofNodesHex: [...source.runtimeStateProofNodesHex],
  };
}

function parseSingleJsonObject(stdout: Buffer): unknown {
  if (stdout.length === 0) {
    throw new Error('causal V3 verifier produced empty stdout');
  }
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(stdout);
  } catch {
    throw new Error('causal V3 verifier stdout is not valid UTF-8');
  }
  if (decoded.trim() !== decoded || /[\r\n]/.test(decoded)) {
    throw new Error('causal V3 verifier stdout must contain exactly one JSON result');
  }
  return parseStrictJson(decoded, 'causal V3 verifier stdout');
}

function refreshExecutionIdentity(
  build: PinnedLocalNativeVerifierBuild,
): PinnedLocalPegInCausalMintTransitionV3ExecutionIdentity {
  const identity = refreshPinnedLocalPegInCausalMintTransitionV3ExecutionIdentity(build);
  assertPinnedLocalPegInCausalMintTransitionV3ExecutionIdentityProvenance({
    build,
    identity,
  });
  assertRefreshBoundary(identity);
  return identity;
}

function assertRefreshBoundary(
  identity: PinnedLocalPegInCausalMintTransitionV3ExecutionIdentity,
): void {
  const boundary = identity.boundary;
  if (
    boundary.sourceLocksReloaded !== true
    || boundary.sourceCheckoutRevalidated !== true
    || boundary.toolchainReobserved !== true
    || boundary.executableDigestReobserved !== true
    || boundary.trackedVectorBuildBindingPreserved !== true
    || boundary.independentBuildAttestationVerified !== false
    || boundary.completeBuildToolClosureVerified !== false
    || boundary.dependencyCacheContentAttested !== false
    || boundary.localConformanceOnly !== true
    || boundary.admissionEligible !== false
    || boundary.gate5Closed !== false
  ) {
    throw new Error('pinned local causal V3 source refresh boundary is invalid');
  }
}

function assertSameExecutionIdentity(
  current: PinnedLocalPegInCausalMintTransitionV3ExecutionIdentity,
  declaration: PinnedLocalCausalV3ExecutionAuthorityDeclaration,
): void {
  if (
    current.identityDigestHex !== declaration.sourceExecutionIdentityDigestHex
    || current.executable.sha256Hex !== declaration.verifierExecutableSha256Hex
    || current.executable.vectorCanonicalSha256Hex
      !== declaration.vectorCanonicalSha256Hex
  ) {
    throw new Error('pinned local causal V3 source identity changed during authority lifetime');
  }
}

function assertPolicyWindow(
  declaration: PinnedLocalCausalV3ExecutionAuthorityDeclaration,
): void {
  const now = Date.now();
  if (
    now < declaration.policyNotBeforeUnixMs
    || now >= declaration.policyExpiresAtUnixMs
  ) {
    throw new Error('pinned local causal V3 execution policy is outside its validity window');
  }
}

function assertContainedBoundary(result: NativeContainedProcessResult): void {
  if (
    !result
    || !Buffer.isBuffer(result.stdout)
    || result.boundary.trustedLauncherInstallationRequired !== true
    || result.boundary.launcherDigestMatchedBeforeAndAfter !== true
    || result.boundary.brokerSelfImageBoundToAuthorityRecordV2 !== true
    || result.boundary.launcherInstallationActivationCampaignCompleted !== false
    || result.boundary.launcherAtomicBootstrapProven !== false
    || result.boundary.targetAtomicityDelegatedToBroker !== true
    || result.boundary.targetAtomicityObservedByTypeScript !== false
    || result.boundary.executionAdmissionGranted !== false
    || result.boundary.gate5Closed !== false
    || result.boundary.productionReady !== false
  ) {
    throw new Error('pinned local causal V3 contained execution boundary is invalid');
  }
}

function normalizeSystemDlls(value: readonly string[]): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SYSTEM_DLLS) {
    throw new Error('pinned local causal V3 system DLL allowlist is invalid');
  }
  const normalized = value.map((entry, index) => {
    if (
      typeof entry !== 'string'
      || Buffer.byteLength(entry, 'utf8') > MAX_SYSTEM_DLL_NAME_BYTES
      || !/^[a-z0-9._-]+\.dll$/.test(entry)
    ) {
      throw new Error(`pinned local causal V3 system DLL ${index} is invalid`);
    }
    if (index > 0 && value[index - 1] >= entry) {
      throw new Error('pinned local causal V3 system DLL allowlist must be sorted and unique');
    }
    return entry;
  });
  return Object.freeze(normalized);
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`pinned local causal V3 ${label} must be a positive safe integer`);
  }
  return Number(value);
}

function nonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`pinned local causal V3 ${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function lowercasePrefixedDigest32(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error(
      `pinned local causal V3 ${label} must be a lowercase 0x-prefixed 32-byte digest`,
    );
  }
  return value;
}

function lowercaseByteHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^0x(?:[0-9a-f]{2})+$/.test(value)
  ) {
    throw new Error(`pinned local causal V3 ${label} must be canonical lowercase byte hex`);
  }
  return value;
}

function uint64Decimal(value: unknown, label: string): string {
  let parsed: bigint;
  try {
    parsed = typeof value === 'bigint' ? value : BigInt(value as string | number);
  } catch {
    throw new Error(`${label} must be an unsigned 64-bit integer`);
  }
  if (parsed < 0n || parsed > ((1n << 64n) - 1n)) {
    throw new Error(`${label} must be an unsigned 64-bit integer`);
  }
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`${label} must be an unsigned 64-bit integer`);
  }
  if (typeof value === 'string' && value !== parsed.toString()) {
    throw new Error(`${label} must use canonical decimal encoding`);
  }
  return parsed.toString();
}

function assertExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has an unexpected field set`);
  }
}

function lowercaseSha256NoPrefix(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function domainSha256(domain: string, body: unknown): string {
  return `0x${createHash('sha256')
    .update(`${domain}\0`, 'utf8')
    .update(JSON.stringify(body), 'utf8')
    .digest('hex')}`;
}

function sha256Bytes(value: Buffer): string {
  return `0x${createHash('sha256').update(value).digest('hex')}`;
}

function deepFreeze<T>(value: T): T {
  if (ArrayBuffer.isView(value)) return value;
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
