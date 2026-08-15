import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

import {
  normalizeImmutableNativeContainedLauncherPath,
  runNativeContainedProcess,
  type NativeContainedProcessResult,
} from './native-contained-process.js';
import { deriveExecutableInvocationSha256Hex, normalizeExecutableSha256Hex }
  from './native-executable-pin.js';
import {
  PEG_IN_CAUSAL_SOURCE_FINALITY_POLICY_ID_V1_HEX,
  MAX_PEG_IN_CAUSAL_SOURCE_OBJECT_BYTES,
  MAX_PEG_IN_CAUSAL_SOURCE_PROOF_BYTES,
  PEG_IN_CAUSAL_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
  PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
  PEG_IN_CAUSAL_SOURCE_PROOF_REQUIRED_CONFIRMATIONS_V1,
  PEG_IN_CAUSAL_SOURCE_PROOF_SIGNER_PUBLIC_KEYS_V1_HEX,
  PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
  PEG_IN_CAUSAL_SOURCE_PROOF_THRESHOLD_V1,
  PEG_IN_CAUSAL_SOURCE_VERIFIER_PROFILE_ID_V1_HEX,
  buildPegInCausalSourceProofResultFieldsV1,
  derivePegInCausalSourceProofRequestV1DigestHex,
  derivePegInCausalSourceProofResultIdV1Hex,
  type PegInCausalSourceProofRequestV1,
  type PegInCausalSourceProofResultFieldsV1,
} from './peg-in-causal-source-proof-admission-v1.js';
import {
  derivePegInCausalAdmissionIdV2Hex,
  encodePegInCausalAdmissionProfileV2Hex,
  encodePegInCausalAdmissionStatementV2Hex,
  encodePegInSourceIntentV2Hex,
} from './peg-in-causal-admission-v2.js';
import {
  assertPinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentityProvenance,
  getPinnedLocalNativeVerifierExecution,
  refreshPinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentity,
  type PinnedLocalNativeVerifierBuild,
  type PinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentity,
} from './pinned-local-native-verifier-build.js';
import { parseStrictJson } from './strict-json.js';

const EXECUTION_AUTHORITY_SCHEMA =
  'e2s.pinned-local-causal-source-proof-result-producer-execution-authority.v1' as const;
const EXECUTION_POLICY_SCHEMA =
  'e2s.pinned-local-causal-source-proof-result-producer-execution-policy.v1' as const;
const PRODUCER_REQUEST_SCHEMA =
  'e2s.peg-in-causal-source-proof-result-producer-request.v1' as const;
const PRODUCER_RESULT_SCHEMA =
  'e2s.peg-in-causal-source-proof-result-producer-result.v1' as const;
const PRODUCER_RESULT_STATUS =
  'SOURCE_PROOF_RESULT_FIELDS_DERIVED_WITHOUT_SOURCE_CANONICALITY' as const;
export const PINNED_LOCAL_CAUSAL_SOURCE_PROOF_PRODUCER_CANDIDATE_SCHEMA =
  'e2s.pinned-local-causal-source-proof-result-producer-candidate.v1' as const;
export const PINNED_LOCAL_CAUSAL_SOURCE_PROOF_PRODUCER_CANDIDATE_STATUS =
  'QUARANTINED_SOURCE_PROOF_RESULT_PRODUCER_OUTPUT_WITH_INCOMPLETE_V2_CAMPAIGN' as const;

const OPERATION = 'produce-peg-in-causal-source-proof-result-v1' as const;
const TIMEOUT_MS = 30_000;
const REQUEST_LIMIT_BYTES = 1024 * 1024;
const STDOUT_LIMIT_BYTES = 64 * 1024;
const STDERR_LIMIT_BYTES = 64 * 1024;
const MAX_SYSTEM_DLLS = 128;
const MAX_SYSTEM_DLL_NAME_BYTES = 128;
const UINT64_MAX = (1n << 64n) - 1n;

export interface PinnedLocalCausalSourceProofProducerCandidateEvaluatorOptions {
  readonly build: PinnedLocalNativeVerifierBuild;
  readonly launcherPath: string;
  readonly launcherSha256Hex: string;
  readonly policyEpoch: number;
  readonly policyNotBeforeUnixMs: number;
  readonly policyExpiresAtUnixMs: number;
  readonly allowedSystemDlls: readonly string[];
}

interface ProducerRequestV1 {
  readonly schema: typeof PRODUCER_REQUEST_SCHEMA;
  readonly candidateIdHex: string;
  readonly admissionProfileCanonicalHex: string;
  readonly sourceIntentCanonicalHex: string;
  readonly statementCanonicalHex: string;
  readonly sourceBoxCanonicalHex: string;
  readonly commitmentTransactionCanonicalHex: string;
  readonly vaultSuccessorCanonicalHex: string;
  readonly inclusionProofCanonicalHex: string;
  readonly checkpointAncestryCanonicalHex: string;
  readonly finalityProofCanonicalHex: string;
  readonly verifierExecutableSha256Hex: string;
  readonly issuedAtNativeHeight: string;
  readonly expiresAtNativeHeight: string;
}

interface ProducerExecutionAuthorityRequest {
  readonly operation: typeof OPERATION;
  readonly requestBytes: Buffer;
}

interface ProducerExecutionAuthorityResult {
  readonly stdout: Buffer;
  readonly requestSha256Hex: string;
  readonly stdoutSha256Hex: string;
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
    readonly containedProducerExecutionRequested: true;
    readonly directProcessAllowed: false;
    readonly candidateOutputOnly: true;
    readonly sourceProofExecutionAuthenticated: false;
    readonly sourceCanonicalityVerified: false;
    readonly signaturesProduced: false;
    readonly signingAuthorized: false;
    readonly runtimePendingAdmissionWritten: false;
    readonly lifecycleAdmissionAdvanced: false;
    readonly mintAuthorized: false;
    readonly reconciliationHoldReleaseAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly gate5Closed: false;
    readonly productionReady: false;
  };
}

interface ProducerExecutionAuthorityDeclaration {
  readonly schema: typeof EXECUTION_AUTHORITY_SCHEMA;
  readonly operation: typeof OPERATION;
  readonly sourceExecutionIdentityDigestHex: string;
  readonly authorityProfileDigestHex: string;
  readonly executionPolicySha256: string;
  readonly policyEpoch: number;
  readonly policyNotBeforeUnixMs: number;
  readonly policyExpiresAtUnixMs: number;
  readonly launcherPath: string;
  readonly launcherSha256Hex: string;
  readonly producerExecutablePath: string;
  readonly producerExecutableSha256Hex: string;
  readonly producerVectorCanonicalSha256Hex: string;
  readonly allowedSystemDlls: readonly string[];
  readonly limits: {
    readonly timeoutMs: typeof TIMEOUT_MS;
    readonly requestLimitBytes: typeof REQUEST_LIMIT_BYTES;
    readonly stdoutLimitBytes: typeof STDOUT_LIMIT_BYTES;
    readonly stderrLimitBytes: typeof STDERR_LIMIT_BYTES;
  };
}

interface ProducerExecutionAuthority {
  readonly declaration: ProducerExecutionAuthorityDeclaration;
  execute(input: ProducerExecutionAuthorityRequest): Promise<ProducerExecutionAuthorityResult>;
}

declare const CANDIDATE_BRAND: unique symbol;

export interface PinnedLocalCausalSourceProofProducerCandidatePayload {
  readonly schema: typeof PINNED_LOCAL_CAUSAL_SOURCE_PROOF_PRODUCER_CANDIDATE_SCHEMA;
  readonly status: typeof PINNED_LOCAL_CAUSAL_SOURCE_PROOF_PRODUCER_CANDIDATE_STATUS;
  readonly requestDigestHex: string;
  readonly quarantinedChildOutput: {
    readonly sha256Hex: string;
    readonly sizeBytes: string;
    readonly contentExposed: false;
    readonly resultFieldsAcceptedAsAuthority: false;
  };
  readonly execution: {
    readonly sourceExecutionIdentityDigestHex: string;
    readonly authorityProfileDigestHex: string;
    readonly executionPolicySha256: string;
    readonly policyEpoch: number;
    readonly producerExecutableSha256Hex: string;
    readonly producerVectorCanonicalSha256Hex: string;
    readonly exactRequestSha256Hex: string;
    readonly exactResultSha256Hex: string;
  };
  readonly boundary: {
    readonly candidateOnly: true;
    readonly localConformanceOnly: true;
    readonly sourceRefreshedBeforeAndAfterExecution: true;
    readonly exactToolchainIdentityBound: true;
    readonly exactExecutableIdentityBound: true;
    readonly exactTrackedVectorIdentityBound: true;
    readonly staticFederatedCompatibilityProfileBound: true;
    readonly containedProcessRequested: true;
    readonly immutableLauncherInstallationRequired: true;
    readonly authorityRecordV2Required: true;
    readonly launcherDigestMatchedBeforeAndAfter: true;
    readonly brokerSelfImageBoundToAuthorityRecordV2: true;
    readonly launcherInstallationActivationCampaignCompleted: false;
    readonly launcherAtomicBootstrapProven: false;
    readonly directProcessAllowed: false;
    readonly producerOutputShapeValidated: true;
    readonly sourceProofExecutionAuthenticated: false;
    readonly sourceCanonicalityVerified: false;
    readonly trustlessSourceProofVerified: false;
    readonly signaturesProduced: false;
    readonly signingAuthorized: false;
    readonly runtimePendingAdmissionWritten: false;
    readonly lifecycleAdmissionAdvanced: false;
    readonly runtimeAdmissionReceiptJoined: false;
    readonly causalV3CandidateJoined: false;
    readonly mintAuthorized: false;
    readonly reconciliationHoldReleaseAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly transactionMutationEnabled: false;
    readonly gate5Closed: false;
    readonly productionReadinessVerified: false;
  };
}

export type PinnedLocalCausalSourceProofProducerCandidate =
  PinnedLocalCausalSourceProofProducerCandidatePayload & {
    readonly [CANDIDATE_BRAND]: true;
  };

export interface PinnedLocalCausalSourceProofProducerCandidateEvaluator {
  readonly executableSha256Hex: string;
  readonly executionPolicySha256: string;
  readonly sourceExecutionIdentityDigestHex: string;
  readonly installation: Readonly<{
    readonly role: 'source-proof-result-producer';
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
    readonly mode: 'pinned-local-source-refreshed-contained-source-proof-producer-candidate-only';
    readonly sourceRefreshedPerLaunch: true;
    readonly exactToolchainBound: true;
    readonly exactExecutableBound: true;
    readonly exactVectorBound: true;
    readonly containedProcessRequested: true;
    readonly launcherInstallationActivationCampaignCompleted: false;
    readonly sourceProofExecutionAuthenticated: false;
    readonly sourceCanonicalityVerified: false;
    readonly signingAuthorized: false;
    readonly admissionEligible: false;
    readonly mintAuthorized: false;
    readonly gate5Closed: false;
  };
  deriveExecutableInvocationSha256Hex(): string;
  evaluate(input: {
    readonly request: PegInCausalSourceProofRequestV1;
    readonly issuedAtNativeHeight: string | number | bigint;
    readonly expiresAtNativeHeight: string | number | bigint;
  }): Promise<PinnedLocalCausalSourceProofProducerCandidate>;
}

const AUTHORITIES = new WeakSet<object>();
const EXECUTION_RESULTS = new WeakMap<object, {
  readonly authority: object;
  readonly requestSha256Hex: string;
  readonly stdoutSha256Hex: string;
}>();
const EVALUATORS = new WeakSet<object>();
const CANDIDATES = new WeakMap<object, {
  readonly evaluator: object;
  readonly requestDigestHex: string;
  readonly resultIdHex: string;
  readonly executionPolicySha256: string;
  readonly stdoutSha256Hex: string;
}>();

export function createPinnedLocalCausalSourceProofProducerCandidateEvaluator(
  options: PinnedLocalCausalSourceProofProducerCandidateEvaluatorOptions,
): PinnedLocalCausalSourceProofProducerCandidateEvaluator {
  const authority = createSourceProofProducerExecutionAuthority(options);
  const declaration = authority.declaration;
  const executionBoundary = deepFreeze({
    mode:
      'pinned-local-source-refreshed-contained-source-proof-producer-candidate-only' as const,
    sourceRefreshedPerLaunch: true as const,
    exactToolchainBound: true as const,
    exactExecutableBound: true as const,
    exactVectorBound: true as const,
    containedProcessRequested: true as const,
    launcherInstallationActivationCampaignCompleted: false as const,
    sourceProofExecutionAuthenticated: false as const,
    sourceCanonicalityVerified: false as const,
    signingAuthorized: false as const,
    admissionEligible: false as const,
    mintAuthorized: false as const,
    gate5Closed: false as const,
  });
  const evaluator: PinnedLocalCausalSourceProofProducerCandidateEvaluator = Object.freeze({
    executableSha256Hex: declaration.producerExecutableSha256Hex,
    executionPolicySha256: declaration.executionPolicySha256,
    sourceExecutionIdentityDigestHex: declaration.sourceExecutionIdentityDigestHex,
    installation: deepFreeze({
      role: 'source-proof-result-producer' as const,
      authorityRecordVersion: 'v2' as const,
      authorityProfileDigestHex: declaration.authorityProfileDigestHex,
      executionPolicySha256: declaration.executionPolicySha256,
      launcherPath: declaration.launcherPath,
      launcherSha256Hex: declaration.launcherSha256Hex,
      minimumPolicyEpoch: declaration.policyEpoch,
      activationCampaignCompleted: false as const,
      fundsAuthorityGranted: false as const,
    }),
    executionBoundary,
    deriveExecutableInvocationSha256Hex(): string {
      return deriveExecutableInvocationSha256Hex(
        declaration.producerExecutableSha256Hex,
        [],
      );
    },
    async evaluate(input: {
      readonly request: PegInCausalSourceProofRequestV1;
      readonly issuedAtNativeHeight: string | number | bigint;
      readonly expiresAtNativeHeight: string | number | bigint;
    }): Promise<PinnedLocalCausalSourceProofProducerCandidate> {
      const producerRequest = buildProducerRequest(input);
      const requestDigestHex = derivePegInCausalSourceProofRequestV1DigestHex(input.request);
      const requestBytes = Buffer.from(JSON.stringify(producerRequest), 'utf8');
      if (requestBytes.length > REQUEST_LIMIT_BYTES) {
        throw new Error(`source-proof producer request exceeds ${REQUEST_LIMIT_BYTES} bytes`);
      }
      const executionResult = await authority.execute({
        operation: OPERATION,
        requestBytes,
      });
      assertExecutionResultProvenance({ authority, result: executionResult, requestBytes });
      assertExecutionResultBoundary(executionResult);
      const expectedResult = buildPegInCausalSourceProofResultFieldsV1({
        request: input.request,
        issuedAtNativeHeight: producerRequest.issuedAtNativeHeight,
        expiresAtNativeHeight: producerRequest.expiresAtNativeHeight,
      });
      validateProducerOutput({
        stdout: executionResult.stdout,
        requestDigestHex,
        expectedResult,
      });
      const candidate = deepFreeze({
        schema: PINNED_LOCAL_CAUSAL_SOURCE_PROOF_PRODUCER_CANDIDATE_SCHEMA,
        status: PINNED_LOCAL_CAUSAL_SOURCE_PROOF_PRODUCER_CANDIDATE_STATUS,
        requestDigestHex,
        quarantinedChildOutput: {
          sha256Hex: executionResult.stdoutSha256Hex,
          sizeBytes: executionResult.stdout.length.toString(),
          contentExposed: false as const,
          resultFieldsAcceptedAsAuthority: false as const,
        },
        execution: {
          sourceExecutionIdentityDigestHex: declaration.sourceExecutionIdentityDigestHex,
          authorityProfileDigestHex: declaration.authorityProfileDigestHex,
          executionPolicySha256: declaration.executionPolicySha256,
          policyEpoch: declaration.policyEpoch,
          producerExecutableSha256Hex: declaration.producerExecutableSha256Hex,
          producerVectorCanonicalSha256Hex:
            declaration.producerVectorCanonicalSha256Hex,
          exactRequestSha256Hex: executionResult.requestSha256Hex,
          exactResultSha256Hex: executionResult.stdoutSha256Hex,
        },
        boundary: {
          candidateOnly: true as const,
          localConformanceOnly: true as const,
          sourceRefreshedBeforeAndAfterExecution: true as const,
          exactToolchainIdentityBound: true as const,
          exactExecutableIdentityBound: true as const,
          exactTrackedVectorIdentityBound: true as const,
          staticFederatedCompatibilityProfileBound: true as const,
          containedProcessRequested: true as const,
          immutableLauncherInstallationRequired: true as const,
          authorityRecordV2Required: true as const,
          launcherDigestMatchedBeforeAndAfter: true as const,
          brokerSelfImageBoundToAuthorityRecordV2: true as const,
          launcherInstallationActivationCampaignCompleted: false as const,
          launcherAtomicBootstrapProven: false as const,
          directProcessAllowed: false as const,
          producerOutputShapeValidated: true as const,
          sourceProofExecutionAuthenticated: false as const,
          sourceCanonicalityVerified: false as const,
          trustlessSourceProofVerified: false as const,
          signaturesProduced: false as const,
          signingAuthorized: false as const,
          runtimePendingAdmissionWritten: false as const,
          lifecycleAdmissionAdvanced: false as const,
          runtimeAdmissionReceiptJoined: false as const,
          causalV3CandidateJoined: false as const,
          mintAuthorized: false as const,
          reconciliationHoldReleaseAuthorized: false as const,
          submissionAuthorized: false as const,
          broadcastAuthorized: false as const,
          transactionMutationEnabled: false as const,
          gate5Closed: false as const,
          productionReadinessVerified: false as const,
        },
      }) as unknown as PinnedLocalCausalSourceProofProducerCandidate;
      CANDIDATES.set(candidate, {
        evaluator,
        requestDigestHex,
        resultIdHex: derivePegInCausalSourceProofResultIdV1Hex(expectedResult),
        executionPolicySha256: declaration.executionPolicySha256,
        stdoutSha256Hex: executionResult.stdoutSha256Hex,
      });
      return candidate;
    },
  });
  EVALUATORS.add(evaluator);
  return evaluator;
}

export function assertPinnedLocalCausalSourceProofProducerCandidateEvaluatorProvenance(
  evaluator: unknown,
): asserts evaluator is PinnedLocalCausalSourceProofProducerCandidateEvaluator {
  if (!evaluator || typeof evaluator !== 'object' || !EVALUATORS.has(evaluator)) {
    throw new Error('causal source-proof producer candidate evaluator provenance is missing');
  }
}

export function assertPinnedLocalCausalSourceProofProducerCandidateFromEvaluatorProvenance(
  input: {
    readonly evaluator: PinnedLocalCausalSourceProofProducerCandidateEvaluator;
    readonly candidate: unknown;
    readonly expectedRequestDigestHex: string;
  },
): asserts input is {
  evaluator: PinnedLocalCausalSourceProofProducerCandidateEvaluator;
  candidate: PinnedLocalCausalSourceProofProducerCandidate;
  expectedRequestDigestHex: string;
} {
  assertPinnedLocalCausalSourceProofProducerCandidateEvaluatorProvenance(input.evaluator);
  const expectedRequestDigestHex = lowercasePrefixedDigest32(
    input.expectedRequestDigestHex,
    'expected source-proof request digest',
  );
  if (!input.candidate || typeof input.candidate !== 'object') {
    throw new Error('causal source-proof producer candidate provenance is missing');
  }
  const provenance = CANDIDATES.get(input.candidate);
  const candidate = input.candidate as Partial<PinnedLocalCausalSourceProofProducerCandidate>;
  if (
    provenance?.evaluator !== input.evaluator
    || provenance.requestDigestHex !== expectedRequestDigestHex
    || candidate.requestDigestHex !== expectedRequestDigestHex
    || provenance.executionPolicySha256 !== input.evaluator.executionPolicySha256
    || provenance.stdoutSha256Hex !== candidate.quarantinedChildOutput?.sha256Hex
  ) {
    throw new Error('causal source-proof producer candidate provenance is missing');
  }
}

/**
 * Bind one quarantined producer candidate to the exact deterministic result
 * identity that was checked inside its same-process evaluator. Result fields
 * and child stdout remain private to the evaluator.
 */
export function assertPinnedLocalCausalSourceProofProducerCandidateResultIdentityProvenance(
  input: {
    readonly evaluator: PinnedLocalCausalSourceProofProducerCandidateEvaluator;
    readonly candidate: unknown;
    readonly expectedRequestDigestHex: string;
    readonly expectedResultIdHex: string;
  },
): void {
  assertPinnedLocalCausalSourceProofProducerCandidateFromEvaluatorProvenance(input);
  const expectedResultIdHex = lowercasePrefixedDigest32(
    input.expectedResultIdHex,
    'expected source-proof result ID',
  );
  if (CANDIDATES.get(input.candidate as object)?.resultIdHex !== expectedResultIdHex) {
    throw new Error(
      'causal source-proof producer candidate result identity provenance is missing',
    );
  }
}

function createSourceProofProducerExecutionAuthority(
  options: PinnedLocalCausalSourceProofProducerCandidateEvaluatorOptions,
): ProducerExecutionAuthority {
  if (!options || typeof options !== 'object') {
    throw new Error('causal source-proof producer authority options must be an object');
  }
  const build = options.build;
  const initialIdentity = refreshExecutionIdentity(build);
  const execution = getPinnedLocalNativeVerifierExecution(build);
  const producerExecutableSha256Hex = normalizeExecutableSha256Hex(
    execution.pegInCausalSourceProofResultV1ProducerSha256Hex,
    'causal source-proof result producer executable digest',
  );
  if (producerExecutableSha256Hex !== initialIdentity.executable.sha256Hex) {
    throw new Error('source-proof producer executable differs from refreshed source identity');
  }
  const launcherSha256Hex = normalizeExecutableSha256Hex(
    options.launcherSha256Hex,
    'source-proof producer contained launcher digest',
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
    throw new Error('source-proof producer policy window is empty');
  }
  const allowedSystemDlls = normalizeSystemDlls(options.allowedSystemDlls);
  const authorityProfileDigestHex = domainSha256(
    'E2S_CAUSAL_SOURCE_PROOF_RESULT_PRODUCER_AUTHORITY_PROFILE_V1',
    {
      operation: OPERATION,
      sourceExecutionIdentityDigestHex: initialIdentity.identityDigestHex,
      producerExecutableSha256Hex,
      producerVectorCanonicalSha256Hex:
        initialIdentity.executable.vectorCanonicalSha256Hex,
      profile: {
        proofSystemIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
        proofProfileIdHex: PEG_IN_CAUSAL_SOURCE_PROOF_PROFILE_ID_V1_HEX,
        finalityPolicyIdHex: PEG_IN_CAUSAL_SOURCE_FINALITY_POLICY_ID_V1_HEX,
        verifierProfileIdHex: PEG_IN_CAUSAL_SOURCE_VERIFIER_PROFILE_ID_V1_HEX,
        threshold: PEG_IN_CAUSAL_SOURCE_PROOF_THRESHOLD_V1,
        signerPublicKeysHex: PEG_IN_CAUSAL_SOURCE_PROOF_SIGNER_PUBLIC_KEYS_V1_HEX,
        requiredConfirmations: PEG_IN_CAUSAL_SOURCE_PROOF_REQUIRED_CONFIRMATIONS_V1,
        maxValidityBlocks: PEG_IN_CAUSAL_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1.toString(),
      },
    },
  );
  const executionPolicySha256 = domainSha256(
    'E2S_CAUSAL_SOURCE_PROOF_RESULT_PRODUCER_EXECUTION_POLICY_V1',
    {
      schema: EXECUTION_POLICY_SCHEMA,
      operation: OPERATION,
      sourceExecutionIdentityDigestHex: initialIdentity.identityDigestHex,
      authorityProfileDigestHex,
      launcherSha256Hex,
      producerExecutableSha256Hex,
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
  const declaration = deepFreeze({
    schema: EXECUTION_AUTHORITY_SCHEMA,
    operation: OPERATION,
    sourceExecutionIdentityDigestHex: initialIdentity.identityDigestHex,
    authorityProfileDigestHex,
    executionPolicySha256,
    policyEpoch,
    policyNotBeforeUnixMs,
    policyExpiresAtUnixMs,
    launcherPath,
    launcherSha256Hex,
    producerExecutablePath:
      execution.pegInCausalSourceProofResultV1ProducerExecutablePath,
    producerExecutableSha256Hex,
    producerVectorCanonicalSha256Hex:
      initialIdentity.executable.vectorCanonicalSha256Hex,
    allowedSystemDlls,
    limits: {
      timeoutMs: TIMEOUT_MS as typeof TIMEOUT_MS,
      requestLimitBytes: REQUEST_LIMIT_BYTES as typeof REQUEST_LIMIT_BYTES,
      stdoutLimitBytes: STDOUT_LIMIT_BYTES as typeof STDOUT_LIMIT_BYTES,
      stderrLimitBytes: STDERR_LIMIT_BYTES as typeof STDERR_LIMIT_BYTES,
    },
  });
  const authority: ProducerExecutionAuthority = Object.freeze({
    declaration,
    async execute(
      input: ProducerExecutionAuthorityRequest,
    ): Promise<ProducerExecutionAuthorityResult> {
      if (input?.operation !== OPERATION) {
        throw new Error('source-proof producer operation is unsupported');
      }
      if (!Buffer.isBuffer(input.requestBytes)) {
        throw new Error('source-proof producer request must be a Buffer');
      }
      if (input.requestBytes.length > REQUEST_LIMIT_BYTES) {
        throw new Error(`source-proof producer request exceeds ${REQUEST_LIMIT_BYTES} bytes`);
      }
      assertPolicyWindow(declaration);
      assertSameExecutionIdentity(refreshExecutionIdentity(build), declaration);
      const currentExecution = getPinnedLocalNativeVerifierExecution(build);
      if (
        currentExecution.pegInCausalSourceProofResultV1ProducerExecutablePath
          !== declaration.producerExecutablePath
        || currentExecution.pegInCausalSourceProofResultV1ProducerSha256Hex
          !== declaration.producerExecutableSha256Hex
      ) {
        throw new Error('source-proof producer execution target changed after authority creation');
      }
      const requestSnapshot = Buffer.from(input.requestBytes);
      const contained = await runNativeContainedProcess({
        launcherPath: declaration.launcherPath,
        launcherSha256Hex: declaration.launcherSha256Hex,
        targetPath: declaration.producerExecutablePath,
        targetSha256Hex: declaration.producerExecutableSha256Hex,
        targetArgs: [],
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
      assertSameExecutionIdentity(refreshExecutionIdentity(build), declaration);
      const stdoutSnapshot = Buffer.from(contained.stdout);
      const result = deepFreeze({
        get stdout(): Buffer {
          return Buffer.from(stdoutSnapshot);
        },
        requestSha256Hex: sha256Bytes(requestSnapshot),
        stdoutSha256Hex: sha256Bytes(stdoutSnapshot),
        sourceExecutionIdentityDigestHex: declaration.sourceExecutionIdentityDigestHex,
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
          containedProducerExecutionRequested: true as const,
          directProcessAllowed: false as const,
          candidateOutputOnly: true as const,
          sourceProofExecutionAuthenticated: false as const,
          sourceCanonicalityVerified: false as const,
          signaturesProduced: false as const,
          signingAuthorized: false as const,
          runtimePendingAdmissionWritten: false as const,
          lifecycleAdmissionAdvanced: false as const,
          mintAuthorized: false as const,
          reconciliationHoldReleaseAuthorized: false as const,
          submissionAuthorized: false as const,
          broadcastAuthorized: false as const,
          gate5Closed: false as const,
          productionReady: false as const,
        },
      });
      EXECUTION_RESULTS.set(result, {
        authority,
        requestSha256Hex: result.requestSha256Hex,
        stdoutSha256Hex: result.stdoutSha256Hex,
      });
      return result;
    },
  });
  AUTHORITIES.add(authority);
  return authority;
}

function buildProducerRequest(input: {
  readonly request: PegInCausalSourceProofRequestV1;
  readonly issuedAtNativeHeight: string | number | bigint;
  readonly expiresAtNativeHeight: string | number | bigint;
}): ProducerRequestV1 {
  const requestDigestHex = derivePegInCausalSourceProofRequestV1DigestHex(input?.request);
  const issuedAtNativeHeight = uint64(input.issuedAtNativeHeight, 'issue height');
  const expiresAtNativeHeight = uint64(input.expiresAtNativeHeight, 'expiry height');
  if (
    expiresAtNativeHeight <= issuedAtNativeHeight
    || expiresAtNativeHeight - issuedAtNativeHeight
      > PEG_IN_CAUSAL_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1
  ) {
    throw new Error('source-proof producer validity window is invalid');
  }
  const candidateIdHex = derivePegInCausalAdmissionIdV2Hex(input.request.statement);
  if (candidateIdHex !== lowercasePrefixedDigest32(input.request.candidateIdHex, 'candidate ID')) {
    throw new Error('source-proof producer candidate ID does not match the admission statement');
  }
  const expectedResult = buildPegInCausalSourceProofResultFieldsV1({
    request: input.request,
    issuedAtNativeHeight,
    expiresAtNativeHeight,
  });
  if (expectedResult.requestDigestHex !== requestDigestHex) {
    throw new Error('source-proof producer request digest changed during canonicalization');
  }
  return deepFreeze({
    schema: PRODUCER_REQUEST_SCHEMA,
    candidateIdHex,
    admissionProfileCanonicalHex:
      encodePegInCausalAdmissionProfileV2Hex(input.request.admissionProfile),
    sourceIntentCanonicalHex: encodePegInSourceIntentV2Hex(input.request.sourceIntent),
    statementCanonicalHex:
      encodePegInCausalAdmissionStatementV2Hex(input.request.statement),
    sourceBoxCanonicalHex:
      canonicalObjectHex(
        input.request.sourceBoxCanonicalHex,
        MAX_PEG_IN_CAUSAL_SOURCE_OBJECT_BYTES,
        'source box',
      ),
    commitmentTransactionCanonicalHex: canonicalObjectHex(
      input.request.commitmentTransactionCanonicalHex,
      MAX_PEG_IN_CAUSAL_SOURCE_PROOF_BYTES,
      'commitment transaction',
    ),
    vaultSuccessorCanonicalHex:
      canonicalObjectHex(
        input.request.vaultSuccessorCanonicalHex,
        MAX_PEG_IN_CAUSAL_SOURCE_OBJECT_BYTES,
        'vault successor',
      ),
    inclusionProofCanonicalHex:
      canonicalObjectHex(
        input.request.inclusionProofCanonicalHex,
        MAX_PEG_IN_CAUSAL_SOURCE_PROOF_BYTES,
        'inclusion proof',
      ),
    checkpointAncestryCanonicalHex: canonicalObjectHex(
      input.request.checkpointAncestryCanonicalHex,
      MAX_PEG_IN_CAUSAL_SOURCE_PROOF_BYTES,
      'checkpoint ancestry',
    ),
    finalityProofCanonicalHex:
      canonicalObjectHex(
        input.request.finalityProofCanonicalHex,
        MAX_PEG_IN_CAUSAL_SOURCE_PROOF_BYTES,
        'finality proof',
      ),
    verifierExecutableSha256Hex: lowercasePrefixedDigest32(
      input.request.verifierExecutableSha256Hex,
      'claimed source verifier executable digest',
    ),
    issuedAtNativeHeight: issuedAtNativeHeight.toString(),
    expiresAtNativeHeight: expiresAtNativeHeight.toString(),
  });
}

function validateProducerOutput(input: {
  readonly stdout: Buffer;
  readonly requestDigestHex: string;
  readonly expectedResult: PegInCausalSourceProofResultFieldsV1;
}): void {
  const record = asRecord(parseSingleJsonObject(input.stdout), 'source-proof producer result');
  exactKeys(record, ['boundary', 'requestDigestHex', 'result', 'schema', 'status'],
    'source-proof producer result');
  if (record.schema !== PRODUCER_RESULT_SCHEMA || record.status !== PRODUCER_RESULT_STATUS) {
    throw new Error('source-proof producer result schema or status is invalid');
  }
  if (record.requestDigestHex !== input.requestDigestHex) {
    throw new Error('source-proof producer result does not bind the exact request digest');
  }
  const result = asRecord(record.result, 'source-proof producer result fields');
  exactKeys(result, [
    'checkpointAncestryBlake2b256Hex',
    'commitmentTransactionCanonicalBlake2b256Hex',
    'expiresAtNativeHeight',
    'finalityProofBlake2b256Hex',
    'formatVersion',
    'inclusionProofBlake2b256Hex',
    'issuedAtNativeHeight',
    'requestDigestHex',
    'sourceBoxCanonicalBlake2b256Hex',
    'vaultSuccessorCanonicalBlake2b256Hex',
    'verifierExecutableSha256Hex',
    'verifierProfileIdHex',
  ], 'source-proof producer result fields');
  if (JSON.stringify(result) !== JSON.stringify(input.expectedResult)) {
    throw new Error('source-proof producer result fields differ from the canonical result');
  }
  const boundary = asRecord(record.boundary, 'source-proof producer boundary');
  exactKeys(boundary, [
    'admissionBindingsValidated',
    'broadcastAuthorized',
    'canonicalObjectsHashed',
    'gate5Closed',
    'lifecycleAdvanced',
    'mintAuthorized',
    'productionReady',
    'reconciliationHoldReleaseAuthorized',
    'runtimeAdmissionWritten',
    'signaturesProduced',
    'signingAuthorized',
    'sourceCanonicalityVerified',
    'sourceProofExecutionAuthenticated',
    'submissionAuthorized',
  ], 'source-proof producer boundary');
  if (
    boundary.admissionBindingsValidated !== true
    || boundary.canonicalObjectsHashed !== true
    || boundary.sourceCanonicalityVerified !== false
    || boundary.sourceProofExecutionAuthenticated !== false
    || boundary.signaturesProduced !== false
    || boundary.signingAuthorized !== false
    || boundary.runtimeAdmissionWritten !== false
    || boundary.lifecycleAdvanced !== false
    || boundary.mintAuthorized !== false
    || boundary.reconciliationHoldReleaseAuthorized !== false
    || boundary.submissionAuthorized !== false
    || boundary.broadcastAuthorized !== false
    || boundary.gate5Closed !== false
    || boundary.productionReady !== false
  ) {
    throw new Error('source-proof producer output weakens a fail-closed boundary');
  }
}

function refreshExecutionIdentity(
  build: PinnedLocalNativeVerifierBuild,
): PinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentity {
  const identity =
    refreshPinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentity(build);
  assertPinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentityProvenance({
    build,
    identity,
  });
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
    || boundary.sourceCanonicalityVerified !== false
    || boundary.sourceProofExecutionAuthenticated !== false
    || boundary.gate5Closed !== false
  ) {
    throw new Error('source-proof producer source refresh boundary is invalid');
  }
  return identity;
}

function assertSameExecutionIdentity(
  current: PinnedLocalPegInCausalSourceProofResultProducerV1ExecutionIdentity,
  declaration: ProducerExecutionAuthorityDeclaration,
): void {
  if (
    current.identityDigestHex !== declaration.sourceExecutionIdentityDigestHex
    || current.executable.sha256Hex !== declaration.producerExecutableSha256Hex
    || current.executable.vectorCanonicalSha256Hex
      !== declaration.producerVectorCanonicalSha256Hex
  ) {
    throw new Error('source-proof producer source identity changed during authority lifetime');
  }
}

function assertExecutionResultProvenance(input: {
  readonly authority: ProducerExecutionAuthority;
  readonly result: unknown;
  readonly requestBytes: Buffer;
}): asserts input is {
  authority: ProducerExecutionAuthority;
  result: ProducerExecutionAuthorityResult;
  requestBytes: Buffer;
} {
  if (!AUTHORITIES.has(input.authority) || !input.result || typeof input.result !== 'object') {
    throw new Error('source-proof producer execution result provenance is missing');
  }
  const provenance = EXECUTION_RESULTS.get(input.result);
  const result = input.result as Partial<ProducerExecutionAuthorityResult>;
  if (
    provenance?.authority !== input.authority
    || provenance.requestSha256Hex !== sha256Bytes(input.requestBytes)
    || result.requestSha256Hex !== provenance.requestSha256Hex
    || !Buffer.isBuffer(result.stdout)
    || provenance.stdoutSha256Hex !== sha256Bytes(result.stdout)
    || result.stdoutSha256Hex !== provenance.stdoutSha256Hex
    || result.sourceExecutionIdentityDigestHex
      !== input.authority.declaration.sourceExecutionIdentityDigestHex
    || result.authorityProfileDigestHex
      !== input.authority.declaration.authorityProfileDigestHex
    || result.executionPolicySha256 !== input.authority.declaration.executionPolicySha256
  ) {
    throw new Error('source-proof producer execution result provenance is missing');
  }
}

function assertExecutionResultBoundary(result: ProducerExecutionAuthorityResult): void {
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
    || boundary.containedProducerExecutionRequested !== true
    || boundary.directProcessAllowed !== false
    || boundary.candidateOutputOnly !== true
    || boundary.sourceProofExecutionAuthenticated !== false
    || boundary.sourceCanonicalityVerified !== false
    || boundary.signaturesProduced !== false
    || boundary.signingAuthorized !== false
    || boundary.runtimePendingAdmissionWritten !== false
    || boundary.lifecycleAdmissionAdvanced !== false
    || boundary.mintAuthorized !== false
    || boundary.reconciliationHoldReleaseAuthorized !== false
    || boundary.submissionAuthorized !== false
    || boundary.broadcastAuthorized !== false
    || boundary.gate5Closed !== false
    || boundary.productionReady !== false
  ) {
    throw new Error('source-proof producer candidate execution weakens a fail-closed boundary');
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
    throw new Error('source-proof producer contained execution boundary is invalid');
  }
}

function parseSingleJsonObject(stdout: Buffer): unknown {
  if (stdout.length === 0) throw new Error('source-proof producer stdout is empty');
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(stdout);
  } catch {
    throw new Error('source-proof producer stdout is not valid UTF-8');
  }
  if (decoded.trim() !== decoded || /[\r\n]/.test(decoded)) {
    throw new Error('source-proof producer stdout must contain exactly one JSON result');
  }
  try {
    return parseStrictJson(decoded, 'source-proof producer stdout');
  } catch {
    throw new Error('source-proof producer stdout must contain valid strict JSON');
  }
}

function canonicalObjectHex(value: unknown, maxBytes: number, label: string): string {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(value)) {
    throw new Error(`${label} canonical bytes must be non-empty whole hexadecimal bytes`);
  }
  const bytes = Buffer.from(value.slice(2), 'hex');
  if (bytes.length > maxBytes) {
    throw new Error(`${label} canonical bytes exceed ${maxBytes} bytes`);
  }
  return `0x${bytes.toString('hex')}`;
}

function uint64(value: unknown, label: string): bigint {
  let parsed: bigint;
  try {
    if (typeof value === 'bigint') parsed = value;
    else if (typeof value === 'number' && Number.isSafeInteger(value)) parsed = BigInt(value);
    else if (typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value)) {
      parsed = BigInt(value);
    } else throw new Error();
  } catch {
    throw new Error(`source-proof producer ${label} must be an unsigned 64-bit integer`);
  }
  if (parsed < 0n || parsed > UINT64_MAX) {
    throw new Error(`source-proof producer ${label} must be an unsigned 64-bit integer`);
  }
  return parsed;
}

function normalizeSystemDlls(value: readonly string[]): readonly string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SYSTEM_DLLS) {
    throw new Error('source-proof producer system DLL allowlist is invalid');
  }
  return Object.freeze(value.map((entry, index) => {
    if (
      typeof entry !== 'string'
      || Buffer.byteLength(entry, 'utf8') > MAX_SYSTEM_DLL_NAME_BYTES
      || !/^[a-z0-9._-]+\.dll$/.test(entry)
    ) {
      throw new Error(`source-proof producer system DLL ${index} is invalid`);
    }
    if (index > 0 && value[index - 1]! >= entry) {
      throw new Error('source-proof producer system DLL allowlist must be sorted and unique');
    }
    return entry;
  }));
}

function assertPolicyWindow(declaration: ProducerExecutionAuthorityDeclaration): void {
  const now = Date.now();
  if (now < declaration.policyNotBeforeUnixMs || now >= declaration.policyExpiresAtUnixMs) {
    throw new Error('source-proof producer execution policy is outside its validity window');
  }
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`source-proof producer ${label} must be a positive safe integer`);
  }
  return Number(value);
}

function nonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`source-proof producer ${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function lowercasePrefixedDigest32(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase 0x-prefixed 32-byte digest`);
  }
  return value;
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has unexpected fields`);
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function domainSha256(domain: string, value: unknown): string {
  return `0x${createHash('sha256')
    .update(`${domain}\0`, 'utf8')
    .update(JSON.stringify(value), 'utf8')
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
