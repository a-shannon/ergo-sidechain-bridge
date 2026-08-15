import { createHash } from 'node:crypto';

import {
  MAX_NATIVE_VERIFIER_REQUEST_BYTES,
  NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
  deriveNativeGrandpaTrustAnchorDigestHex,
  type NativeFinalizedBridgeCheckpointRequest,
} from './native-finalized-bridge-checkpoint.js';
import {
  deriveExecutableInvocationSha256Hex,
  normalizeExecutableSha256Hex,
} from './native-executable-pin.js';
import {
  assertNativePegInRuntimeIdentityV2ExecutionAuthorityProvenance,
  assertNativePegInRuntimeIdentityV2ExecutionAuthorityResultProvenance,
  type NativePegInRuntimeIdentityV2ExecutionAuthority,
} from './native-peg-in-runtime-identity-v2-execution-authority.js';
import {
  deriveNativeFinalizedPegInRuntimeIdentityV2RequestDigestHex,
  normalizeNativeFinalizedPegInRuntimeIdentityV2Request,
  validateNativeFinalizedPegInRuntimeIdentityV2PayloadBindings,
  type NativeFinalizedPegInRuntimeIdentityV2Request,
} from './native-finalized-peg-in-runtime-identity-v2.js';

export const AUTHORITY_BOUND_NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_CANDIDATE_SCHEMA =
  'e2s.authority-bound-native-finalized-peg-in-runtime-identity-candidate.v2' as const;
export const AUTHORITY_BOUND_NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_CANDIDATE_STATUS =
  'UNAUTHENTICATED_CANDIDATE_OUTPUT_WITH_NON_ATOMIC_LAUNCHER_BOUNDARY' as const;

declare const AUTHORITY_CANDIDATE_BRAND: unique symbol;

export interface AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidatePayload {
  readonly schema:
    typeof AUTHORITY_BOUND_NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_CANDIDATE_SCHEMA;
  readonly status:
    typeof AUTHORITY_BOUND_NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_CANDIDATE_STATUS;
  readonly requestDigestHex: string;
  readonly trustAnchorDigestHex: string;
  readonly quarantinedChildOutput: {
    readonly sha256Hex: string;
    readonly sizeBytes: string;
    readonly contentExposed: false;
    readonly proofClaimsAccepted: false;
  };
  readonly runtimeBuild: {
    readonly profileId: string;
    readonly attestationId: string;
    readonly packetSha256Hex: string;
    readonly runtimeCodeSha256Hex: string;
    readonly runtimeCodeSizeBytes: string;
    readonly attestationVerified: true;
  };
  readonly nativeVerifier: {
    readonly profileId: string;
    readonly attestationId: string;
    readonly executableSha256Hex: string;
    readonly executionPolicySha256: string;
    readonly attestationVerified: true;
  };
  readonly boundary: {
    readonly sidechainFinalityVerified: false;
    readonly statementRuntimeStateVerified: false;
    readonly runtimeCodeStateProofVerified: false;
    readonly runtimeBuildAttestationVerified: true;
    readonly nativeVerifierAttestationVerified: true;
    readonly immutableLauncherInstallationRequired: true;
    readonly authorityRecordV2Required: true;
    readonly launcherInstallationActivationCampaignCompleted: false;
    readonly launcherAtomicBootstrapProven: false;
    readonly targetRuntimeBuildEvidenceMatched: false;
    readonly targetRuntimeBuildIdentityVerified: false;
    readonly targetStateCodeIsHistoricalProducerCode: false;
    readonly runtimeUpgradeHistoryVerified: false;
    readonly cutoverPolicyVerified: false;
    readonly runtimeCodeIdentityVerified: false;
    readonly historicalMintAbsenceVerified: false;
    readonly committedVaultTransitionVerified: false;
    readonly mintAuthorized: false;
    readonly transactionMutationEnabled: false;
    readonly gate5Closed: false;
    readonly productionReady: false;
  };
}

export type AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2Candidate =
  AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidatePayload & {
    readonly [AUTHORITY_CANDIDATE_BRAND]: true;
  };

export interface AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator {
  readonly executableSha256Hex: string;
  readonly runtimeCodeSha256Hex: string;
  readonly runtimeCodeSizeBytes: string;
  readonly runtimeBuildAttestationId: string;
  readonly runtimeBuildPacketSha256Hex: string;
  readonly executionPolicySha256: string;
  readonly executionBoundary: {
    readonly mode:
      'source-refreshed-dual-attestation-candidate-output-only';
    readonly sourceOwnedRuntimeBuildAttestorLockReloadedPerLaunch: true;
    readonly sourceOwnedNativeVerifierAttestorLockReloadedPerLaunch: true;
    readonly executionPolicyValidatedPerLaunch: true;
    readonly containedProcessRequired: true;
    readonly immutableLauncherInstallationRequired: true;
    readonly authorityRecordV2Required: true;
    readonly launcherInstallationActivationCampaignCompleted: false;
    readonly launcherAtomicBootstrapProven: false;
    readonly targetStateCodeIsHistoricalProducerCode: false;
    readonly targetRuntimeBuildIdentityVerified: false;
    readonly runtimeUpgradeHistoryVerified: false;
    readonly runtimeCodeIdentityVerified: false;
    readonly mintAuthorityGranted: false;
    readonly settlementAuthorityGranted: false;
    readonly gate5Closed: false;
  };
  deriveExecutableInvocationSha256Hex(
    trustedAnchorDigestHex: string,
  ): string;
  evaluate(input: {
    trustedAnchorDigestHex: string;
    request: NativeFinalizedPegInRuntimeIdentityV2Request;
  }): Promise<
    AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2Candidate
  >;
}

const AUTHORITY_CANDIDATE_EVALUATORS = new WeakSet<object>();
const AUTHORITY_CANDIDATES = new WeakMap<object, {
  authority: NativePegInRuntimeIdentityV2ExecutionAuthority;
  evaluator:
    AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator;
  requestDigestHex: string;
  executionPolicySha256: string;
  childOutputSha256Hex: string;
}>();

export function createAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator(
  authority: NativePegInRuntimeIdentityV2ExecutionAuthority,
): AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator {
  assertNativePegInRuntimeIdentityV2ExecutionAuthorityProvenance(authority);
  const declaration = authority.declaration;
  const executableSha256Hex = normalizeExecutableSha256Hex(
    declaration.verifierExecutableSha256Hex,
    'authority-bound runtime identity V2 verifier executable digest',
  );
  const runtimeCodeSha256Hex = prefixedSha256(
    declaration.runtimeCodeSha256Hex,
    'authority-bound runtime code digest',
  );
  const runtimeCodeSizeBytes = positiveDecimal(
    String(declaration.runtimeCodeSizeBytes),
    'authority-bound runtime code size',
  );
  const runtimeBuildAttestationId = nonEmptyString(
    declaration.runtimeBuildAttestationId,
    'authority-bound runtime build attestation ID',
  );
  const runtimeBuildPacketSha256Hex = prefixedSha256(
    declaration.runtimeBuildPacketSha256Hex,
    'authority-bound runtime build packet digest',
  );
  const executionPolicySha256 = sha256NoPrefix(
    declaration.executionPolicySha256,
    'authority-bound runtime identity V2 execution policy digest',
  );
  const executionBoundary = Object.freeze({
    mode:
      'source-refreshed-dual-attestation-candidate-output-only' as const,
    sourceOwnedRuntimeBuildAttestorLockReloadedPerLaunch: true as const,
    sourceOwnedNativeVerifierAttestorLockReloadedPerLaunch: true as const,
    executionPolicyValidatedPerLaunch: true as const,
    containedProcessRequired: true as const,
    immutableLauncherInstallationRequired: true as const,
    authorityRecordV2Required: true as const,
    launcherInstallationActivationCampaignCompleted: false as const,
    launcherAtomicBootstrapProven: false as const,
    targetStateCodeIsHistoricalProducerCode: false as const,
    targetRuntimeBuildIdentityVerified: false as const,
    runtimeUpgradeHistoryVerified: false as const,
    runtimeCodeIdentityVerified: false as const,
    mintAuthorityGranted: false as const,
    settlementAuthorityGranted: false as const,
    gate5Closed: false as const,
  });

  const evaluator:
  AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator =
    Object.freeze({
      executableSha256Hex,
      runtimeCodeSha256Hex,
      runtimeCodeSizeBytes,
      runtimeBuildAttestationId,
      runtimeBuildPacketSha256Hex,
      executionPolicySha256,
      executionBoundary,
      deriveExecutableInvocationSha256Hex(
        trustedAnchorDigestHex: string,
      ): string {
        return deriveExecutableInvocationSha256Hex(
          executableSha256Hex,
          [
            '--trusted-anchor-digest',
            fixedHex(
              trustedAnchorDigestHex,
              32,
              'trusted anchor digest',
            ),
          ],
        );
      },
      async evaluate(input: {
        trustedAnchorDigestHex: string;
        request: NativeFinalizedPegInRuntimeIdentityV2Request;
      }): Promise<
        AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2Candidate
      > {
        const request =
          normalizeNativeFinalizedPegInRuntimeIdentityV2Request(
            input?.request,
          );
        const trustedAnchorDigestHex = fixedHex(
          input?.trustedAnchorDigestHex,
          32,
          'independently supplied runtime identity V2 trust anchor digest',
        );
        if (
          deriveNativeGrandpaTrustAnchorDigestHex(
            commonFinalityRequest(request),
          ) !== trustedAnchorDigestHex
        ) {
          throw new Error(
            'runtime identity V2 request trust anchor does not match the independently supplied digest',
          );
        }
        assertRequestRuntimeBuildBinding({
          request,
          runtimeCodeSha256Hex,
          runtimeCodeSizeBytes,
          runtimeBuildAttestationId,
          runtimeBuildPacketSha256Hex,
        });
        const requestBytes = Buffer.from(JSON.stringify(request), 'utf8');
        if (requestBytes.length > MAX_NATIVE_VERIFIER_REQUEST_BYTES) {
          throw new Error(
            `runtime identity V2 verifier request exceeds ${MAX_NATIVE_VERIFIER_REQUEST_BYTES} bytes`,
          );
        }
        const result = await authority.execute({
          operation: 'verify-peg-in-runtime-identity-v2',
          trustedAnchorDigestHex,
          requestBytes,
        });
        assertNativePegInRuntimeIdentityV2ExecutionAuthorityResultProvenance({
          authority,
          result,
        });
        if (result.operation !== 'verify-peg-in-runtime-identity-v2') {
          throw new Error(
            'authority-bound runtime identity V2 result operation does not match',
          );
        }
        assertAuthorityResultDeclarationBinding(authority, result);
        assertAuthorityResultFailClosedBoundary(result);
        const childOutputBytes = result.stdout;
        const structurallyBoundChildOutput =
          validateNativeFinalizedPegInRuntimeIdentityV2PayloadBindings({
            requestBytes,
            trustedAnchorDigestHex,
            verification: parseSingleJsonObject(childOutputBytes),
          });
        const requestDigestHex =
          deriveNativeFinalizedPegInRuntimeIdentityV2RequestDigestHex(
            request,
          );
        if (structurallyBoundChildOutput.requestDigestHex !== requestDigestHex) {
          throw new Error(
            'authority-bound runtime identity V2 proof request digest changed',
          );
        }
        const childOutputSha256Hex = createHash('sha256')
          .update(childOutputBytes)
          .digest('hex');

        const candidate = deepFreeze({
          schema:
            AUTHORITY_BOUND_NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_CANDIDATE_SCHEMA,
          status:
            AUTHORITY_BOUND_NATIVE_FINALIZED_PEG_IN_RUNTIME_IDENTITY_V2_CANDIDATE_STATUS,
          requestDigestHex,
          trustAnchorDigestHex: trustedAnchorDigestHex,
          quarantinedChildOutput: {
            sha256Hex: childOutputSha256Hex,
            sizeBytes: String(childOutputBytes.length),
            contentExposed: false as const,
            proofClaimsAccepted: false as const,
          },
          runtimeBuild: {
            profileId: result.runtimeBuildProfileId,
            attestationId: runtimeBuildAttestationId,
            packetSha256Hex: runtimeBuildPacketSha256Hex,
            runtimeCodeSha256Hex,
            runtimeCodeSizeBytes,
            attestationVerified: true as const,
          },
          nativeVerifier: {
            profileId: result.nativeVerifierProfileId,
            attestationId: result.nativeVerifierAttestationId,
            executableSha256Hex,
            executionPolicySha256,
            attestationVerified: true as const,
          },
          boundary: {
            sidechainFinalityVerified: false as const,
            statementRuntimeStateVerified: false as const,
            runtimeCodeStateProofVerified: false as const,
            runtimeBuildAttestationVerified: true as const,
            nativeVerifierAttestationVerified: true as const,
            immutableLauncherInstallationRequired: true as const,
            authorityRecordV2Required: true as const,
            launcherInstallationActivationCampaignCompleted: false as const,
            launcherAtomicBootstrapProven: false as const,
            targetRuntimeBuildEvidenceMatched: false as const,
            targetRuntimeBuildIdentityVerified: false as const,
            targetStateCodeIsHistoricalProducerCode: false as const,
            runtimeUpgradeHistoryVerified: false as const,
            cutoverPolicyVerified: false as const,
            runtimeCodeIdentityVerified: false as const,
            historicalMintAbsenceVerified: false as const,
            committedVaultTransitionVerified: false as const,
            mintAuthorized: false as const,
            transactionMutationEnabled: false as const,
            gate5Closed: false as const,
            productionReady: false as const,
          },
        }) as AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2Candidate;
        AUTHORITY_CANDIDATES.set(candidate, {
          authority,
          evaluator,
          requestDigestHex,
          executionPolicySha256,
          childOutputSha256Hex,
        });
        return candidate;
      },
    });
  AUTHORITY_CANDIDATE_EVALUATORS.add(evaluator);
  return evaluator;
}

export function assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluatorProvenance(
  evaluator: unknown,
): asserts evaluator is
AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator {
  if (
    !evaluator
    || typeof evaluator !== 'object'
    || !AUTHORITY_CANDIDATE_EVALUATORS.has(evaluator)
  ) {
    throw new Error(
      'authority-bound runtime identity V2 candidate evaluator provenance is missing',
    );
  }
}

export function assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateFromEvaluatorProvenance(
  input: {
    evaluator:
      AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator;
    candidate: unknown;
    expectedRequestDigestHex: string;
  },
): asserts input is {
  evaluator:
    AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluator;
  candidate:
    AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2Candidate;
  expectedRequestDigestHex: string;
} {
  assertAuthorityBoundNativeFinalizedPegInRuntimeIdentityV2CandidateEvaluatorProvenance(
    input.evaluator,
  );
  if (!input.candidate || typeof input.candidate !== 'object') {
    throw new Error(
      'authority-bound runtime identity V2 candidate provenance is missing',
    );
  }
  const expectedRequestDigestHex = fixedHex(
    input.expectedRequestDigestHex,
    32,
    'expected runtime identity V2 request digest',
  );
  const candidate =
    input.candidate as
      AuthorityBoundNativeFinalizedPegInRuntimeIdentityV2Candidate;
  const provenance = AUTHORITY_CANDIDATES.get(candidate);
  if (
    provenance?.evaluator !== input.evaluator
    || provenance.requestDigestHex !== expectedRequestDigestHex
    || provenance.executionPolicySha256
      !== input.evaluator.executionPolicySha256
    || provenance.childOutputSha256Hex
      !== candidate.quarantinedChildOutput.sha256Hex
  ) {
    throw new Error(
      'authority-bound runtime identity V2 candidate provenance is missing',
    );
  }
}

function assertRequestRuntimeBuildBinding(input: {
  request: NativeFinalizedPegInRuntimeIdentityV2Request;
  runtimeCodeSha256Hex: string;
  runtimeCodeSizeBytes: string;
  runtimeBuildAttestationId: string;
  runtimeBuildPacketSha256Hex: string;
}): void {
  const runtimeCode = input.request.statement.runtimeCode;
  if (
    runtimeCode.artifactSha256Hex !== input.runtimeCodeSha256Hex
    || runtimeCode.artifactSizeBytes !== input.runtimeCodeSizeBytes
    || runtimeCode.buildAttestationId
      !== input.runtimeBuildAttestationId
    || runtimeCode.buildAttestationSha256Hex
      !== input.runtimeBuildPacketSha256Hex
  ) {
    throw new Error(
      'runtime identity V2 request does not match the reviewed runtime build attestation',
    );
  }
}

function assertAuthorityResultDeclarationBinding(
  authority: NativePegInRuntimeIdentityV2ExecutionAuthority,
  result: {
    runtimeBuildProfileId: string;
    runtimeBuildAttestationId: string;
    runtimeBuildPacketSha256Hex: string;
    nativeVerifierProfileId: string;
    nativeVerifierAttestationId: string;
    jointAuthorityProfileDigestHex: string;
    policyId: string;
    executionPolicySha256: string;
    policyEpoch: number;
  },
): void {
  const declaration = authority.declaration;
  if (
    result.runtimeBuildProfileId !== declaration.runtimeBuildProfileId
    || result.runtimeBuildAttestationId
      !== declaration.runtimeBuildAttestationId
    || result.runtimeBuildPacketSha256Hex
      !== declaration.runtimeBuildPacketSha256Hex
    || result.nativeVerifierProfileId
      !== declaration.nativeVerifierProfileId
    || result.nativeVerifierAttestationId
      !== declaration.nativeVerifierAttestationId
    || result.jointAuthorityProfileDigestHex
      !== declaration.jointAuthorityProfileDigestHex
    || result.policyId !== declaration.policyId
    || result.executionPolicySha256
      !== declaration.executionPolicySha256
    || result.policyEpoch !== declaration.policyEpoch
  ) {
    throw new Error(
      'runtime identity V2 authority result does not match its declaration',
    );
  }
}

function assertAuthorityResultFailClosedBoundary(
  result: {
    boundary: {
      sourceOwnedRuntimeBuildAttestorLockReloaded: true;
      sourceOwnedNativeVerifierAttestorLockReloaded: true;
      sourceOwnedAttestorLocksRevalidatedAfterExecution: true;
      reviewedTrustRootsRequired: true;
      exactJointPolicyValidatedAfterReload: true;
      exactJointPolicyRevalidatedAfterExecution: true;
      brokerAuthorityModeRequested: true;
      containedProofExecutionOnly: true;
      directProcessAllowed: false;
      runtimeBuildAttestationVerified: true;
      nativeVerifierAttestationVerified: true;
      immutableLauncherInstallationRequired: true;
      authorityRecordV2Required: true;
      launcherInstallationActivationCampaignCompleted: false;
      launcherAtomicBootstrapProven: false;
      targetRuntimeBuildIdentityVerified: false;
      runtimeCodeIdentityVerified: false;
      runtimeUpgradeHistoryVerified: false;
      cutoverPolicyVerified: false;
      historicalMintAbsenceVerified: false;
      committedVaultTransitionVerified: false;
      mintAuthorityGranted: false;
      settlementAuthorityGranted: false;
      gate5Closed: false;
      productionReady: false;
    };
  },
): void {
  const boundary = result.boundary;
  if (
    boundary.sourceOwnedRuntimeBuildAttestorLockReloaded !== true
    || boundary.sourceOwnedNativeVerifierAttestorLockReloaded !== true
    || boundary.sourceOwnedAttestorLocksRevalidatedAfterExecution !== true
    || boundary.reviewedTrustRootsRequired !== true
    || boundary.exactJointPolicyValidatedAfterReload !== true
    || boundary.exactJointPolicyRevalidatedAfterExecution !== true
    || boundary.brokerAuthorityModeRequested !== true
    || boundary.containedProofExecutionOnly !== true
    || boundary.directProcessAllowed !== false
    || boundary.runtimeBuildAttestationVerified !== true
    || boundary.nativeVerifierAttestationVerified !== true
    || boundary.immutableLauncherInstallationRequired !== true
    || boundary.authorityRecordV2Required !== true
    || boundary.launcherInstallationActivationCampaignCompleted !== false
    || boundary.launcherAtomicBootstrapProven !== false
    || boundary.targetRuntimeBuildIdentityVerified !== false
    || boundary.runtimeCodeIdentityVerified !== false
    || boundary.runtimeUpgradeHistoryVerified !== false
    || boundary.cutoverPolicyVerified !== false
    || boundary.historicalMintAbsenceVerified !== false
    || boundary.committedVaultTransitionVerified !== false
    || boundary.mintAuthorityGranted !== false
    || boundary.settlementAuthorityGranted !== false
    || boundary.gate5Closed !== false
    || boundary.productionReady !== false
  ) {
    throw new Error(
      'authority-bound runtime identity V2 result weakens a fail-closed boundary',
    );
  }
}

function commonFinalityRequest(
  request: NativeFinalizedPegInRuntimeIdentityV2Request,
): NativeFinalizedBridgeCheckpointRequest {
  return {
    schema: NATIVE_FINALIZED_BRIDGE_CHECKPOINT_REQUEST_SCHEMA,
    trustAnchor: request.trustAnchor,
    targetNativeBlockHashHex: request.targetNativeBlockHashHex,
    targetHeaderScaleHex: request.targetHeaderScaleHex,
    linkedGrandpaProofs: request.linkedGrandpaProofs,
    checkpointTailHeadersScaleHex: [...request.checkpointTailHeadersScaleHex],
    finalityProofScaleHex: request.finalityProofScaleHex,
    runtimeStateProofNodesHex: ['0x00'],
  };
}

function parseSingleJsonObject(stdout: Buffer): unknown {
  if (stdout.length === 0) {
    throw new Error('runtime identity V2 verifier produced empty stdout');
  }
  const decoded = stdout.toString('utf8');
  if (!Buffer.from(decoded, 'utf8').equals(stdout)) {
    throw new Error('runtime identity V2 verifier stdout is not valid UTF-8');
  }
  const trimmed = decoded.trim();
  if (trimmed === '' || trimmed.split(/\r?\n/).length !== 1) {
    throw new Error(
      'runtime identity V2 verifier stdout must contain exactly one JSON result',
    );
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(
      'runtime identity V2 verifier stdout is not valid JSON',
      { cause: error },
    );
  }
}

function fixedHex(
  value: unknown,
  bytes: number,
  label: string,
): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be exactly ${bytes} lowercase bytes`);
  }
  return value;
}

function prefixedSha256(value: unknown, label: string): string {
  const normalized = fixedHex(value, 32, label);
  if (/^0x0+$/.test(normalized)) {
    throw new Error(`${label} must not be zero`);
  }
  return normalized;
}

function sha256NoPrefix(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function positiveDecimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a canonical positive decimal string`);
  }
  return value;
}

function nonEmptyString(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.trim() === ''
    || value.includes('\0')
  ) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (
    value
    && typeof value === 'object'
    && !Object.isFrozen(value)
  ) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
