import { createHash } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';

import {
  assertNativePegInCausalF2cCompositionV1Provenance,
  deriveNativePegInCausalF2cCompositionV1IdentityDigestHex,
  NATIVE_PEG_IN_CAUSAL_F2C_COMPOSITION_V1_SCHEMA,
  NATIVE_PEG_IN_CAUSAL_F2C_COMPOSITION_V1_STATUS,
  type NativePegInCausalF2cCompositionV1Candidate,
  type NativePegInCausalF2cCompositionV1CandidatePayload,
} from './native-peg-in-causal-f2c-composition-v1.js';
import {
  assertPinnedLocalCausalV3ResultCandidateEvaluatorProvenance,
  type PinnedLocalCausalV3ResultCandidateEvaluator,
} from './native-peg-in-causal-mint-transition-v3-execution-authority.js';
import {
  assertPinnedLocalCausalSourceProofProducerCandidateEvaluatorProvenance,
  type PinnedLocalCausalSourceProofProducerCandidateEvaluator,
} from './native-peg-in-causal-source-proof-result-producer-execution-authority.js';

export const NATIVE_PEG_IN_CAUSAL_F2D_DUAL_ORIGIN_CAMPAIGN_V1_SCHEMA =
  'e2s.native-peg-in-causal-f2d-dual-origin-campaign.v1' as const;
export const NATIVE_PEG_IN_CAUSAL_F2D_DUAL_ORIGIN_CAMPAIGN_V1_STATUS =
  'DUAL_ORIGIN_F2D_CANDIDATES_AGREE_WITHOUT_AUTHORITY' as const;
export const NATIVE_PEG_IN_CAUSAL_F2D_SINGLE_RUN_V1_SCHEMA =
  'e2s.native-peg-in-causal-f2d-single-run.v1' as const;
export const NATIVE_PEG_IN_CAUSAL_F2D_SINGLE_RUN_V1_STATUS =
  'F2D_CANDIDATE_RETAINED_WITHOUT_PROCESS_AUTHORITY' as const;
export const NATIVE_PEG_IN_CAUSAL_F2D_INSTALLATION_DECLARATIONS_V1_SCHEMA =
  'e2s.native-peg-in-causal-f2d-installation-declarations.v1' as const;
export const NATIVE_PEG_IN_CAUSAL_F2D_INSTALLATION_DECLARATIONS_V1_STATUS =
  'V2_INSTALLATION_DECLARATIONS_DERIVED_WITHOUT_ACTIVATION' as const;

const REPORT_BOUNDARY = deepFreeze({
  readOnlyRpc: true as const,
  distinctRpcOriginsRequired: true as const,
  separateWorkerRequestsRequired: true as const,
  serializedReportsDoNotProveProcessExecution: true as const,
  exactCandidateAgreementRequired: true as const,
  originAgreementIsNotConsensusProof: true as const,
  protectedEvaluatorExecutionRequested: true as const,
  directCodecProcessIsAcquisitionOnly: true as const,
  launcherInstallationActivationCampaignCompleted: false as const,
  nativeVerifierExecutionAuthenticated: false as const,
  reportedRuntimeAdmissionReceiptAuthenticated: false as const,
  sourceProofExecutionAuthenticated: false as const,
  sourceCanonicalityVerified: false as const,
  sidechainFinalityVerified: false as const,
  trustlessSourceProofVerified: false as const,
  runtimePendingAdmissionWritten: false as const,
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
});

const SINGLE_RUN_BOUNDARY = deepFreeze({
  readOnlyRpc: true as const,
  workerRequestDigestBound: true as const,
  serializedReportDoesNotProveProcessExecution: true as const,
  processProvenanceNotSerializable: true as const,
  protectedEvaluatorExecutionRequested: true as const,
  directCodecProcessIsAcquisitionOnly: true as const,
  launcherInstallationActivationCampaignCompleted: false as const,
  nativeVerifierExecutionAuthenticated: false as const,
  reportedRuntimeAdmissionReceiptAuthenticated: false as const,
  sourceProofExecutionAuthenticated: false as const,
  sourceCanonicalityVerified: false as const,
  sidechainFinalityVerified: false as const,
  trustlessSourceProofVerified: false as const,
  runtimePendingAdmissionWritten: false as const,
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
});

const F2C_SERIALIZED_BOUNDARY = deepFreeze({
  candidateOnly: true as const,
  sameProcessCausalV3CandidateProvenanceVerified: true as const,
  sameProcessSourceProofProducerCandidateProvenanceVerified: true as const,
  sameProcessFederatedSourceProofResultProvenanceVerified: true as const,
  sourceRequestToRuntimeRecordBindingsVerified: true as const,
  reportedRuntimeAdmissionReceiptIdentityJoined: true as const,
  denyOnlyLifecycleReferenceJoined: true as const,
  rawChildOutputsQuarantined: true as const,
  nativeVerifierExecutionAuthenticated: false as const,
  reportedRuntimeAdmissionReceiptAuthenticated: false as const,
  sourceProofExecutionAuthenticated: false as const,
  sourceCanonicalityVerified: false as const,
  sidechainFinalityVerified: false as const,
  trustlessSourceProofVerified: false as const,
  runtimePendingAdmissionWritten: false as const,
  lifecycleIsFundsAuthority: false as const,
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
});

const INSTALLATION_BOUNDARY = deepFreeze({
  declarationsDerivedFromProcessProvenantEvaluators: true as const,
  installationPerformed: false as const,
  inspectionPerformed: false as const,
  activationCampaignCompleted: false as const,
  executionPerformed: false as const,
  fundsAuthorityGranted: false as const,
  gate5Closed: false as const,
  productionReadinessVerified: false as const,
});

export interface NativePegInCausalF2dDualOriginCampaignReportV1 {
  readonly schema: typeof NATIVE_PEG_IN_CAUSAL_F2D_DUAL_ORIGIN_CAMPAIGN_V1_SCHEMA;
  readonly status: typeof NATIVE_PEG_IN_CAUSAL_F2D_DUAL_ORIGIN_CAMPAIGN_V1_STATUS;
  readonly capturedAtIso: string;
  readonly launcherSha256Hex: string;
  readonly observations: Readonly<{
    primaryRpcOrigin: string;
    witnessRpcOrigin: string;
    primaryRunReportDigestHex: string;
    witnessRunReportDigestHex: string;
    primaryWorkerRequestDigestHex: string;
    witnessWorkerRequestDigestHex: string;
    candidateIdentityDigestHex: string;
    exactCandidatePayloadsMatched: true;
  }>;
  readonly candidate: NativePegInCausalF2cCompositionV1CandidatePayload;
  readonly boundary: typeof REPORT_BOUNDARY;
  readonly reportDigestHex: string;
}

export interface NativePegInCausalF2dSingleRunReportV1 {
  readonly schema: typeof NATIVE_PEG_IN_CAUSAL_F2D_SINGLE_RUN_V1_SCHEMA;
  readonly status: typeof NATIVE_PEG_IN_CAUSAL_F2D_SINGLE_RUN_V1_STATUS;
  readonly capturedAtIso: string;
  readonly rpcOrigin: string;
  readonly launcherSha256Hex: string;
  readonly workerRequestDigestHex: string;
  readonly candidate: NativePegInCausalF2cCompositionV1CandidatePayload;
  readonly boundary: typeof SINGLE_RUN_BOUNDARY;
  readonly reportDigestHex: string;
}

type InstallationDeclaration =
  | PinnedLocalCausalV3ResultCandidateEvaluator['installation']
  | PinnedLocalCausalSourceProofProducerCandidateEvaluator['installation'];

type InstallationProfile<T extends InstallationDeclaration> = Readonly<T & {
  readonly installerProfileKind: 'V2Immutable';
  readonly installerArguments: Readonly<{
    readonly BrokerPath: string;
    readonly BrokerSha256: string;
    readonly ProfileDigest: string;
    readonly PolicyDigestSha256: string;
    readonly MinimumPolicyEpoch: number;
  }>;
}>;

export interface NativePegInCausalF2dInstallationDeclarationsV1 {
  readonly schema: typeof NATIVE_PEG_IN_CAUSAL_F2D_INSTALLATION_DECLARATIONS_V1_SCHEMA;
  readonly status: typeof NATIVE_PEG_IN_CAUSAL_F2D_INSTALLATION_DECLARATIONS_V1_STATUS;
  readonly generatedAtIso: string;
  readonly launcherSha256Hex: string;
  readonly profiles: readonly [
    InstallationProfile<PinnedLocalCausalV3ResultCandidateEvaluator['installation']>,
    InstallationProfile<
      PinnedLocalCausalSourceProofProducerCandidateEvaluator['installation']
    >,
  ];
  readonly boundary: typeof INSTALLATION_BOUNDARY;
  readonly reportDigestHex: string;
}

export function createNativePegInCausalF2dInstallationDeclarationsV1(input: {
  readonly generatedAt: Date;
  readonly causalV3Evaluator: PinnedLocalCausalV3ResultCandidateEvaluator;
  readonly sourceProofProducerEvaluator:
    PinnedLocalCausalSourceProofProducerCandidateEvaluator;
}): NativePegInCausalF2dInstallationDeclarationsV1 {
  assertExactKeys(input, [
    'causalV3Evaluator',
    'generatedAt',
    'sourceProofProducerEvaluator',
  ], 'F2d installation declaration input');
  assertPinnedLocalCausalV3ResultCandidateEvaluatorProvenance(
    input.causalV3Evaluator,
  );
  assertPinnedLocalCausalSourceProofProducerCandidateEvaluatorProvenance(
    input.sourceProofProducerEvaluator,
  );
  const causalV3 = createInstallationProfile(
    normalizeInstallationDeclaration(
    input.causalV3Evaluator.installation,
    'causal-v3-verifier',
    ),
  ) as InstallationProfile<PinnedLocalCausalV3ResultCandidateEvaluator['installation']>;
  const sourceProof = createInstallationProfile(
    normalizeInstallationDeclaration(
    input.sourceProofProducerEvaluator.installation,
    'source-proof-result-producer',
    ),
  ) as InstallationProfile<
    PinnedLocalCausalSourceProofProducerCandidateEvaluator['installation']
  >;
  if (
    causalV3.launcherSha256Hex !== sourceProof.launcherSha256Hex
    || causalV3.minimumPolicyEpoch !== sourceProof.minimumPolicyEpoch
  ) {
    throw new Error('F2d evaluator installation declarations do not share one launcher and epoch');
  }
  if (
    causalV3.authorityProfileDigestHex === sourceProof.authorityProfileDigestHex
    || causalV3.executionPolicySha256 === sourceProof.executionPolicySha256
  ) {
    throw new Error('F2d evaluator installation declarations must remain role-distinct');
  }
  const body = {
    schema: NATIVE_PEG_IN_CAUSAL_F2D_INSTALLATION_DECLARATIONS_V1_SCHEMA,
    status: NATIVE_PEG_IN_CAUSAL_F2D_INSTALLATION_DECLARATIONS_V1_STATUS,
    generatedAtIso: canonicalDate(input.generatedAt, 'declaration generation time'),
    launcherSha256Hex: causalV3.launcherSha256Hex,
    profiles: [causalV3, sourceProof] as const,
    boundary: INSTALLATION_BOUNDARY,
  };
  const report = deepFreeze({
    ...body,
    reportDigestHex: installationReportDigest(body),
  });
  validateNativePegInCausalF2dInstallationDeclarationsV1(report);
  return report;
}

export function validateNativePegInCausalF2dInstallationDeclarationsV1(
  value: unknown,
): asserts value is NativePegInCausalF2dInstallationDeclarationsV1 {
  assertExactKeys(value, [
    'boundary',
    'generatedAtIso',
    'launcherSha256Hex',
    'profiles',
    'reportDigestHex',
    'schema',
    'status',
  ], 'F2d installation declarations report');
  const report = value as unknown as NativePegInCausalF2dInstallationDeclarationsV1;
  if (
    report.schema !== NATIVE_PEG_IN_CAUSAL_F2D_INSTALLATION_DECLARATIONS_V1_SCHEMA
    || report.status !== NATIVE_PEG_IN_CAUSAL_F2D_INSTALLATION_DECLARATIONS_V1_STATUS
  ) {
    throw new Error('unsupported F2d installation declarations schema or status');
  }
  canonicalIso(report.generatedAtIso, 'installation declaration generation time');
  digest32(report.launcherSha256Hex, 'installation declaration launcher SHA-256');
  if (!Array.isArray(report.profiles) || report.profiles.length !== 2) {
    throw new Error('F2d installation declarations require exactly two profiles');
  }
  const causalV3 = normalizeInstallationProfile(report.profiles[0], 'causal-v3-verifier');
  const sourceProof = normalizeInstallationProfile(
    report.profiles[1],
    'source-proof-result-producer',
  );
  if (
    causalV3.launcherSha256Hex !== report.launcherSha256Hex
    || sourceProof.launcherSha256Hex !== report.launcherSha256Hex
    || causalV3.launcherPath !== sourceProof.launcherPath
    || causalV3.minimumPolicyEpoch !== sourceProof.minimumPolicyEpoch
  ) {
    throw new Error('F2d installation declarations do not share one launcher and epoch');
  }
  if (
    causalV3.authorityProfileDigestHex === sourceProof.authorityProfileDigestHex
    || causalV3.executionPolicySha256 === sourceProof.executionPolicySha256
  ) {
    throw new Error('F2d installation declarations must remain role-distinct');
  }
  if (canonicalJson(report.boundary) !== canonicalJson(INSTALLATION_BOUNDARY)) {
    throw new Error('F2d installation declaration authority boundary is invalid');
  }
  const body = {
    schema: report.schema,
    status: report.status,
    generatedAtIso: report.generatedAtIso,
    launcherSha256Hex: report.launcherSha256Hex,
    profiles: report.profiles,
    boundary: report.boundary,
  };
  if (
    digest32(report.reportDigestHex, 'installation declaration report digest')
      !== installationReportDigest(body)
  ) {
    throw new Error('F2d installation declaration report digest does not match its contents');
  }
}

export function createNativePegInCausalF2dSingleRunReportV1(input: {
  readonly capturedAt: Date;
  readonly rpcOrigin: string;
  readonly launcherSha256Hex: string;
  readonly workerRequestDigestHex: string;
  readonly candidate: NativePegInCausalF2cCompositionV1Candidate;
}): NativePegInCausalF2dSingleRunReportV1 {
  assertExactKeys(input, [
    'candidate',
    'capturedAt',
    'launcherSha256Hex',
    'rpcOrigin',
    'workerRequestDigestHex',
  ], 'F2d single-run report input');
  assertNativePegInCausalF2cCompositionV1Provenance(input.candidate);
  const body = {
    schema: NATIVE_PEG_IN_CAUSAL_F2D_SINGLE_RUN_V1_SCHEMA,
    status: NATIVE_PEG_IN_CAUSAL_F2D_SINGLE_RUN_V1_STATUS,
    capturedAtIso: canonicalDate(input.capturedAt, 'single-run capture time'),
    rpcOrigin: normalizeRpcOrigin(input.rpcOrigin, 'single-run RPC origin'),
    launcherSha256Hex: digest32(input.launcherSha256Hex, 'launcher SHA-256'),
    workerRequestDigestHex: digest32(
      input.workerRequestDigestHex,
      'worker request digest',
    ),
    candidate: candidatePayload(input.candidate),
    boundary: SINGLE_RUN_BOUNDARY,
  };
  const report = deepFreeze({
    ...body,
    reportDigestHex: singleRunReportDigest(body),
  });
  validateNativePegInCausalF2dSingleRunReportV1(report);
  return report;
}

export function validateNativePegInCausalF2dSingleRunReportV1(
  value: unknown,
): asserts value is NativePegInCausalF2dSingleRunReportV1 {
  assertExactKeys(value, [
    'boundary',
    'candidate',
    'capturedAtIso',
    'launcherSha256Hex',
    'reportDigestHex',
    'rpcOrigin',
    'schema',
    'status',
    'workerRequestDigestHex',
  ], 'F2d single-run report');
  const report = value as unknown as NativePegInCausalF2dSingleRunReportV1;
  if (
    report.schema !== NATIVE_PEG_IN_CAUSAL_F2D_SINGLE_RUN_V1_SCHEMA
    || report.status !== NATIVE_PEG_IN_CAUSAL_F2D_SINGLE_RUN_V1_STATUS
  ) {
    throw new Error('unsupported F2d single-run report schema or status');
  }
  canonicalIso(report.capturedAtIso, 'single-run capture time');
  if (normalizeRpcOrigin(report.rpcOrigin, 'single-run RPC origin') !== report.rpcOrigin) {
    throw new Error('F2d single-run RPC origin must use canonical URL form');
  }
  digest32(report.launcherSha256Hex, 'launcher SHA-256');
  digest32(report.workerRequestDigestHex, 'worker request digest');
  assertCandidatePayload(report.candidate);
  if (canonicalJson(report.boundary) !== canonicalJson(SINGLE_RUN_BOUNDARY)) {
    throw new Error('F2d single-run authority boundary is invalid');
  }
  const body = {
    schema: report.schema,
    status: report.status,
    capturedAtIso: report.capturedAtIso,
    rpcOrigin: report.rpcOrigin,
    launcherSha256Hex: report.launcherSha256Hex,
    workerRequestDigestHex: report.workerRequestDigestHex,
    candidate: report.candidate,
    boundary: report.boundary,
  };
  if (
    digest32(report.reportDigestHex, 'single-run report digest')
      !== singleRunReportDigest(body)
  ) {
    throw new Error('F2d single-run report digest does not match its contents');
  }
}

export function createNativePegInCausalF2dDualOriginCampaignReportV1(input: {
  readonly capturedAt: Date;
  readonly primaryRun: NativePegInCausalF2dSingleRunReportV1;
  readonly witnessRun: NativePegInCausalF2dSingleRunReportV1;
}): NativePegInCausalF2dDualOriginCampaignReportV1 {
  assertExactKeys(input, [
    'capturedAt',
    'primaryRun',
    'witnessRun',
  ], 'F2d dual-origin campaign input');
  validateNativePegInCausalF2dSingleRunReportV1(input.primaryRun);
  validateNativePegInCausalF2dSingleRunReportV1(input.witnessRun);
  if (input.primaryRun.rpcOrigin === input.witnessRun.rpcOrigin) {
    throw new Error('F2d campaign requires distinct RPC origins');
  }
  if (input.primaryRun.launcherSha256Hex !== input.witnessRun.launcherSha256Hex) {
    throw new Error('F2d dual-origin launcher identity disagreement');
  }
  if (canonicalJson(input.primaryRun.candidate) !== canonicalJson(input.witnessRun.candidate)) {
    throw new Error('F2d dual-origin candidate disagreement');
  }

  const body = {
    schema: NATIVE_PEG_IN_CAUSAL_F2D_DUAL_ORIGIN_CAMPAIGN_V1_SCHEMA,
    status: NATIVE_PEG_IN_CAUSAL_F2D_DUAL_ORIGIN_CAMPAIGN_V1_STATUS,
    capturedAtIso: canonicalDate(input.capturedAt, 'campaign capture time'),
    launcherSha256Hex: input.primaryRun.launcherSha256Hex,
    observations: {
      primaryRpcOrigin: input.primaryRun.rpcOrigin,
      witnessRpcOrigin: input.witnessRun.rpcOrigin,
      primaryRunReportDigestHex: input.primaryRun.reportDigestHex,
      witnessRunReportDigestHex: input.witnessRun.reportDigestHex,
      primaryWorkerRequestDigestHex: input.primaryRun.workerRequestDigestHex,
      witnessWorkerRequestDigestHex: input.witnessRun.workerRequestDigestHex,
      candidateIdentityDigestHex: input.primaryRun.candidate.identityDigestHex,
      exactCandidatePayloadsMatched: true as const,
    },
    candidate: input.primaryRun.candidate,
    boundary: REPORT_BOUNDARY,
  };
  const report = deepFreeze({
    ...body,
    reportDigestHex: dualOriginReportDigest(body),
  });
  validateNativePegInCausalF2dDualOriginCampaignReportV1(report);
  return report;
}

export function validateNativePegInCausalF2dDualOriginCampaignReportV1(
  value: unknown,
): asserts value is NativePegInCausalF2dDualOriginCampaignReportV1 {
  assertExactKeys(value, [
    'boundary',
    'candidate',
    'capturedAtIso',
    'launcherSha256Hex',
    'observations',
    'reportDigestHex',
    'schema',
    'status',
  ], 'F2d dual-origin campaign report');
  const report = value as unknown as NativePegInCausalF2dDualOriginCampaignReportV1;
  if (report.schema !== NATIVE_PEG_IN_CAUSAL_F2D_DUAL_ORIGIN_CAMPAIGN_V1_SCHEMA) {
    throw new Error('unsupported F2d dual-origin campaign report schema');
  }
  if (report.status !== NATIVE_PEG_IN_CAUSAL_F2D_DUAL_ORIGIN_CAMPAIGN_V1_STATUS) {
    throw new Error('unsupported F2d dual-origin campaign report status');
  }
  canonicalIso(report.capturedAtIso, 'campaign capture time');
  digest32(report.launcherSha256Hex, 'launcher SHA-256');
  assertExactKeys(report.observations, [
    'candidateIdentityDigestHex',
    'exactCandidatePayloadsMatched',
    'primaryRpcOrigin',
    'primaryRunReportDigestHex',
    'primaryWorkerRequestDigestHex',
    'witnessRpcOrigin',
    'witnessRunReportDigestHex',
    'witnessWorkerRequestDigestHex',
  ], 'F2d dual-origin campaign observations');
  const primaryRpcOrigin = normalizeRpcOrigin(
    report.observations.primaryRpcOrigin,
    'primary RPC origin',
  );
  const witnessRpcOrigin = normalizeRpcOrigin(
    report.observations.witnessRpcOrigin,
    'witness RPC origin',
  );
  if (
    primaryRpcOrigin !== report.observations.primaryRpcOrigin
    || witnessRpcOrigin !== report.observations.witnessRpcOrigin
  ) {
    throw new Error('F2d campaign RPC origins must use canonical URL form');
  }
  if (primaryRpcOrigin === witnessRpcOrigin) {
    throw new Error('F2d campaign requires distinct RPC origins');
  }
  if (report.observations.exactCandidatePayloadsMatched !== true) {
    throw new Error('F2d campaign candidate agreement flag is invalid');
  }
  digest32(report.observations.primaryRunReportDigestHex, 'primary run report digest');
  digest32(report.observations.witnessRunReportDigestHex, 'witness run report digest');
  digest32(
    report.observations.primaryWorkerRequestDigestHex,
    'primary worker request digest',
  );
  digest32(
    report.observations.witnessWorkerRequestDigestHex,
    'witness worker request digest',
  );
  assertCandidatePayload(report.candidate);
  const candidateIdentityDigestHex = digest32(
    report.observations.candidateIdentityDigestHex,
    'campaign candidate identity digest',
  );
  if (candidateIdentityDigestHex !== report.candidate.identityDigestHex) {
    throw new Error('F2d campaign candidate identity does not match the retained candidate');
  }
  if (canonicalJson(report.boundary) !== canonicalJson(REPORT_BOUNDARY)) {
    throw new Error('F2d campaign authority boundary is invalid');
  }
  const body = {
    schema: report.schema,
    status: report.status,
    capturedAtIso: report.capturedAtIso,
    launcherSha256Hex: report.launcherSha256Hex,
    observations: report.observations,
    candidate: report.candidate,
    boundary: report.boundary,
  };
  const expectedDigest = dualOriginReportDigest(body);
  if (digest32(report.reportDigestHex, 'campaign report digest') !== expectedDigest) {
    throw new Error('F2d campaign report digest does not match its contents');
  }
}

function candidatePayload(
  candidate: NativePegInCausalF2cCompositionV1Candidate,
): NativePegInCausalF2cCompositionV1CandidatePayload {
  const payload = structuredClone(candidate) as NativePegInCausalF2cCompositionV1CandidatePayload;
  assertCandidatePayload(payload);
  return deepFreeze(payload);
}

function normalizeInstallationDeclaration(
  value: InstallationDeclaration,
  expectedRole: InstallationDeclaration['role'],
): InstallationDeclaration {
  assertExactKeys(value, [
    'activationCampaignCompleted',
    'authorityProfileDigestHex',
    'authorityRecordVersion',
    'executionPolicySha256',
    'fundsAuthorityGranted',
    'launcherPath',
    'launcherSha256Hex',
    'minimumPolicyEpoch',
    'role',
  ], `${expectedRole} installation declaration`);
  if (
    value.role !== expectedRole
    || value.authorityRecordVersion !== 'v2'
    || value.activationCampaignCompleted !== false
    || value.fundsAuthorityGranted !== false
  ) {
    throw new Error(`${expectedRole} installation declaration boundary is invalid`);
  }
  digest32(value.authorityProfileDigestHex, `${expectedRole} authority profile digest`);
  if (!/^[0-9a-f]{64}$/.test(value.executionPolicySha256)) {
    throw new Error(`${expectedRole} execution policy SHA-256 must be 64 lowercase hex characters`);
  }
  digest32(value.launcherSha256Hex, `${expectedRole} launcher SHA-256`);
  canonicalAbsolutePath(value.launcherPath, `${expectedRole} launcher path`);
  if (!Number.isSafeInteger(value.minimumPolicyEpoch) || value.minimumPolicyEpoch <= 0) {
    throw new Error(`${expectedRole} minimum policy epoch must be a positive safe integer`);
  }
  return deepFreeze(structuredClone(value));
}

function createInstallationProfile<T extends InstallationDeclaration>(
  declaration: T,
): InstallationProfile<T> {
  return deepFreeze({
    ...declaration,
    installerProfileKind: 'V2Immutable' as const,
    installerArguments: {
      BrokerPath: declaration.launcherPath,
      BrokerSha256: declaration.launcherSha256Hex.slice(2),
      ProfileDigest: declaration.authorityProfileDigestHex.slice(2),
      PolicyDigestSha256: declaration.executionPolicySha256,
      MinimumPolicyEpoch: declaration.minimumPolicyEpoch,
    },
  });
}

function normalizeInstallationProfile(
  value: unknown,
  expectedRole: InstallationDeclaration['role'],
): InstallationProfile<InstallationDeclaration> {
  assertExactKeys(value, [
    'activationCampaignCompleted',
    'authorityProfileDigestHex',
    'authorityRecordVersion',
    'executionPolicySha256',
    'fundsAuthorityGranted',
    'installerArguments',
    'installerProfileKind',
    'launcherPath',
    'launcherSha256Hex',
    'minimumPolicyEpoch',
    'role',
  ], `${expectedRole} installation profile`);
  const record = value as Record<string, unknown>;
  const declaration = normalizeInstallationDeclaration({
    role: record.role,
    authorityRecordVersion: record.authorityRecordVersion,
    authorityProfileDigestHex: record.authorityProfileDigestHex,
    executionPolicySha256: record.executionPolicySha256,
    launcherPath: record.launcherPath,
    launcherSha256Hex: record.launcherSha256Hex,
    minimumPolicyEpoch: record.minimumPolicyEpoch,
    activationCampaignCompleted: record.activationCampaignCompleted,
    fundsAuthorityGranted: record.fundsAuthorityGranted,
  } as InstallationDeclaration, expectedRole);
  if (record.installerProfileKind !== 'V2Immutable') {
    throw new Error(`${expectedRole} installer profile kind is invalid`);
  }
  assertExactKeys(record.installerArguments, [
    'BrokerPath',
    'BrokerSha256',
    'MinimumPolicyEpoch',
    'PolicyDigestSha256',
    'ProfileDigest',
  ], `${expectedRole} installer arguments`);
  const argumentsRecord = record.installerArguments as Record<string, unknown>;
  const expectedArguments = createInstallationProfile(declaration).installerArguments;
  if (canonicalJson(argumentsRecord) !== canonicalJson(expectedArguments)) {
    throw new Error(`${expectedRole} installer arguments differ from the declared profile`);
  }
  return createInstallationProfile(declaration);
}

function assertCandidatePayload(
  value: unknown,
): asserts value is NativePegInCausalF2cCompositionV1CandidatePayload {
  assertExactKeys(value, [
    'admissionProfileIdHex',
    'boundary',
    'candidateIdHex',
    'causalV3',
    'execution',
    'identityDigestHex',
    'lifecycle',
    'quarantinedChildOutputs',
    'recordKeyHex',
    'schema',
    'sourceIntentIdHex',
    'sourceProof',
    'status',
  ], 'F2d campaign candidate');
  const candidate = value as unknown as NativePegInCausalF2cCompositionV1CandidatePayload;
  if (
    candidate.schema !== NATIVE_PEG_IN_CAUSAL_F2C_COMPOSITION_V1_SCHEMA
    || candidate.status !== NATIVE_PEG_IN_CAUSAL_F2C_COMPOSITION_V1_STATUS
  ) {
    throw new Error('F2d campaign candidate schema or status is invalid');
  }
  digest32(candidate.identityDigestHex, 'candidate identity digest');
  for (const [field, fieldValue] of Object.entries({
    candidateIdHex: candidate.candidateIdHex,
    admissionProfileIdHex: candidate.admissionProfileIdHex,
    sourceIntentIdHex: candidate.sourceIntentIdHex,
    recordKeyHex: candidate.recordKeyHex,
  })) {
    digest32(fieldValue, `candidate ${field}`);
  }
  assertExactKeys(candidate.sourceProof, [
    'proofDigestHex',
    'requestDigestHex',
    'resultIdHex',
    'verifierExecutableSha256Hex',
    'verifierProfileIdHex',
  ], 'F2d campaign candidate source-proof');
  for (const [field, fieldValue] of Object.entries(candidate.sourceProof)) {
    digest32(fieldValue, `candidate source-proof ${field}`);
  }
  assertExactKeys(candidate.causalV3, [
    'admissionAdmittedAtNativeHeight',
    'admissionExpiresAtNativeHeight',
    'admissionReceiptScaleSha256Hex',
    'childNativeBlockHashHex',
    'childNativeHeight',
    'parentNativeBlockHashHex',
    'parentNativeHeight',
    'reportedReceiptIdentityDigestHex',
    'requestDigestHex',
    'trustAnchorDigestHex',
  ], 'F2d campaign candidate causal V3');
  for (const field of [
    'admissionReceiptScaleSha256Hex',
    'childNativeBlockHashHex',
    'parentNativeBlockHashHex',
    'reportedReceiptIdentityDigestHex',
    'requestDigestHex',
    'trustAnchorDigestHex',
  ] as const) {
    digest32(candidate.causalV3[field], `candidate causal V3 ${field}`);
  }
  for (const field of [
    'admissionAdmittedAtNativeHeight',
    'admissionExpiresAtNativeHeight',
    'childNativeHeight',
    'parentNativeHeight',
  ] as const) {
    canonicalUint64(candidate.causalV3[field], `candidate causal V3 ${field}`);
  }
  if (BigInt(candidate.causalV3.childNativeHeight)
    !== BigInt(candidate.causalV3.parentNativeHeight) + 1n) {
    throw new Error('F2d campaign candidate parent/child native heights are not consecutive');
  }
  assertExactKeys(candidate.lifecycle, [
    'currentNativeHeight',
    'journalEventCount',
    'journalHeadDigestHex',
    'proofResultIdHex',
    'status',
  ], 'F2d campaign candidate lifecycle');
  if (
    candidate.lifecycle.status !== 'admitted'
    || !Number.isSafeInteger(candidate.lifecycle.journalEventCount)
    || candidate.lifecycle.journalEventCount <= 0
  ) {
    throw new Error('F2d campaign candidate lifecycle status or event count is invalid');
  }
  digest32(candidate.lifecycle.journalHeadDigestHex, 'candidate lifecycle journal head');
  digest32(candidate.lifecycle.proofResultIdHex, 'candidate lifecycle proof result ID');
  canonicalUint64(candidate.lifecycle.currentNativeHeight, 'candidate lifecycle current height');
  if (candidate.lifecycle.proofResultIdHex !== candidate.sourceProof.resultIdHex) {
    throw new Error('F2d campaign candidate lifecycle proof result differs');
  }
  assertExactKeys(candidate.quarantinedChildOutputs, [
    'causalV3Sha256Hex',
    'causalV3SizeBytes',
    'contentExposed',
    'sourceProofProducerSha256Hex',
    'sourceProofProducerSizeBytes',
  ], 'F2d campaign candidate quarantined outputs');
  digest32(candidate.quarantinedChildOutputs.causalV3Sha256Hex, 'causal V3 output digest');
  digest32(
    candidate.quarantinedChildOutputs.sourceProofProducerSha256Hex,
    'source-proof producer output digest',
  );
  canonicalUint64(candidate.quarantinedChildOutputs.causalV3SizeBytes, 'causal V3 output size');
  canonicalUint64(
    candidate.quarantinedChildOutputs.sourceProofProducerSizeBytes,
    'source-proof producer output size',
  );
  if (candidate.quarantinedChildOutputs.contentExposed !== false) {
    throw new Error('F2d campaign candidate child output is exposed');
  }
  assertExactKeys(candidate.execution, [
    'causalV3ExecutionPolicySha256',
    'causalV3SourceIdentityDigestHex',
    'sourceProofProducerExecutionPolicySha256',
    'sourceProofProducerSourceIdentityDigestHex',
  ], 'F2d campaign candidate execution');
  digest32(
    candidate.execution.causalV3SourceIdentityDigestHex,
    'causal V3 source identity digest',
  );
  digest32(
    candidate.execution.sourceProofProducerSourceIdentityDigestHex,
    'source-proof producer source identity digest',
  );
  flatDigest32(
    candidate.execution.causalV3ExecutionPolicySha256,
    'causal V3 execution policy SHA-256',
  );
  flatDigest32(
    candidate.execution.sourceProofProducerExecutionPolicySha256,
    'source-proof producer execution policy SHA-256',
  );
  if (canonicalJson(candidate.boundary) !== canonicalJson(F2C_SERIALIZED_BOUNDARY)) {
    throw new Error('F2d campaign candidate authority boundary is invalid');
  }
  const expectedIdentityDigestHex =
    deriveNativePegInCausalF2cCompositionV1IdentityDigestHex({
      candidateIdHex: candidate.candidateIdHex,
      admissionProfileIdHex: candidate.admissionProfileIdHex,
      sourceIntentIdHex: candidate.sourceIntentIdHex,
      recordKeyHex: candidate.recordKeyHex,
      sourceProofRequestDigestHex: candidate.sourceProof.requestDigestHex,
      sourceProofResultIdHex: candidate.sourceProof.resultIdHex,
      sourceProofDigestHex: candidate.sourceProof.proofDigestHex,
      causalV3RequestDigestHex: candidate.causalV3.requestDigestHex,
      causalV3TrustAnchorDigestHex: candidate.causalV3.trustAnchorDigestHex,
      receiptIdentityDigestHex: candidate.causalV3.reportedReceiptIdentityDigestHex,
      lifecycleJournalHeadDigestHex: candidate.lifecycle.journalHeadDigestHex,
      currentNativeHeight: candidate.lifecycle.currentNativeHeight,
      causalV3OutputSha256Hex: candidate.quarantinedChildOutputs.causalV3Sha256Hex,
      sourceProofProducerOutputSha256Hex:
        candidate.quarantinedChildOutputs.sourceProofProducerSha256Hex,
    });
  if (candidate.identityDigestHex !== expectedIdentityDigestHex) {
    throw new Error('F2d campaign candidate identity digest does not match its fields');
  }
}

function normalizeRpcOrigin(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL`);
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(`${label} must be an absolute credential-free HTTP(S) origin without path, query, or fragment`);
  }
  return parsed.toString();
}

function canonicalAbsolutePath(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\0')
    || !isAbsolute(value)
    || resolve(value) !== value
  ) {
    throw new Error(`${label} must be an absolute canonical NUL-free path`);
  }
  return value;
}

function canonicalDate(value: unknown, label: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`${label} must be a valid Date`);
  }
  return value.toISOString();
}

function canonicalIso(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be an ISO timestamp`);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}

function digest32(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase 0x-prefixed 32-byte digest`);
  }
  return value;
}

function flatDigest32(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be 64 lowercase hex characters`);
  }
  return value;
}

function canonicalUint64(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical unsigned integer string`);
  }
  const parsed = BigInt(value);
  if (parsed > ((1n << 64n) - 1n)) {
    throw new Error(`${label} exceeds the unsigned 64-bit range`);
  }
  return value;
}

function dualOriginReportDigest(value: unknown): string {
  return `0x${createHash('sha256')
    .update(Buffer.from('E2S_NATIVE_PEG_IN_CAUSAL_F2D_DUAL_ORIGIN_CAMPAIGN_V1', 'utf8'))
    .update(Buffer.from([0]))
    .update(Buffer.from(canonicalJson(value), 'utf8'))
    .digest('hex')}`;
}

function singleRunReportDigest(value: unknown): string {
  return `0x${createHash('sha256')
    .update(Buffer.from('E2S_NATIVE_PEG_IN_CAUSAL_F2D_SINGLE_RUN_V1', 'utf8'))
    .update(Buffer.from([0]))
    .update(Buffer.from(canonicalJson(value), 'utf8'))
    .digest('hex')}`;
}

function installationReportDigest(value: unknown): string {
  return `0x${createHash('sha256')
    .update(Buffer.from('E2S_NATIVE_PEG_IN_CAUSAL_F2D_INSTALLATION_DECLARATIONS_V1', 'utf8'))
    .update(Buffer.from([0]))
    .update(Buffer.from(canonicalJson(value), 'utf8'))
    .digest('hex')}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('campaign report contains a non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  throw new Error('campaign report contains a non-canonical value');
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

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
