import { createHash } from 'crypto';

import {
  assertReviewedNativePegInRuntimeIdentityV2AttestationProvenance,
  verifyReviewedNativePegInRuntimeIdentityV2Attestation,
  type NativePegInRuntimeIdentityV2AttestationPacket,
} from './native-peg-in-runtime-identity-v2-verifier-attestation.js';
import {
  normalizeImmutableNativeContainedLauncherPath,
  runNativeContainedProcess,
  type NativeContainedProcessResult,
} from './native-contained-process.js';
import {
  assertNativePegInRuntimeIdentityV2ExecutionPolicyValidationProvenance,
  deriveNativePegInRuntimeIdentityV2ExecutionPolicySha256,
  validateNativePegInRuntimeIdentityV2ExecutionPolicyAgainstAttestations,
  type NativePegInRuntimeIdentityV2ExecutionPolicy,
} from './native-peg-in-runtime-identity-v2-execution-policy.js';
import type {
  NativeRuntimeDependencyManifest,
} from './native-verifier-execution-policy.js';
import {
  assertReviewedPegInRuntimeBuildAttestationProvenance,
  verifyReviewedPegInRuntimeBuildAttestation,
  type PegInRuntimeBuildAttestationPacket,
} from './peg-in-runtime-build-attestation.js';

export const NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_AUTHORITY_PACKAGE_SCHEMA =
  'e2s.native-peg-in-runtime-identity-v2-execution-authority-package.v1' as const;
export const NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_AUTHORITY_PACKAGE_ENV =
  'NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_AUTHORITY_PACKAGE_JSON';

type RuntimeManifest = NativeRuntimeDependencyManifest<
  'bridge-peg-in-runtime-identity-v2-verifier'
>;

export interface NativePegInRuntimeIdentityV2ExecutionAuthorityOptions {
  runtimeBuildPacket: PegInRuntimeBuildAttestationPacket;
  nativeVerifierPacket: NativePegInRuntimeIdentityV2AttestationPacket;
  executionPolicy: NativePegInRuntimeIdentityV2ExecutionPolicy;
  runtimeDependencyManifest: RuntimeManifest;
  launcherPath: string;
  runtimeCodePath: string;
  verifierExecutablePath: string;
}

export interface NativePegInRuntimeIdentityV2ExecutionAuthorityPackage
  extends NativePegInRuntimeIdentityV2ExecutionAuthorityOptions {
  schema:
    typeof NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_AUTHORITY_PACKAGE_SCHEMA;
}

export interface NativePegInRuntimeIdentityV2ExecutionAuthorityRequest {
  operation: 'verify-peg-in-runtime-identity-v2';
  trustedAnchorDigestHex: string;
  requestBytes: Buffer;
}

export interface NativePegInRuntimeIdentityV2ExecutionAuthorityResult {
  readonly stdout: Buffer;
  readonly runtimeBuildProfileId: string;
  readonly runtimeBuildAttestationId: string;
  readonly runtimeBuildPacketSha256Hex: string;
  readonly nativeVerifierProfileId: string;
  readonly nativeVerifierAttestationId: string;
  readonly jointAuthorityProfileDigestHex: string;
  readonly policyId: string;
  readonly executionPolicySha256: string;
  readonly policyEpoch: number;
  readonly operation: 'verify-peg-in-runtime-identity-v2';
  readonly boundary: {
    readonly sourceOwnedRuntimeBuildAttestorLockReloaded: true;
    readonly sourceOwnedNativeVerifierAttestorLockReloaded: true;
    readonly sourceOwnedAttestorLocksRevalidatedAfterExecution: true;
    readonly reviewedTrustRootsRequired: true;
    readonly exactJointPolicyValidatedAfterReload: true;
    readonly exactJointPolicyRevalidatedAfterExecution: true;
    readonly brokerAuthorityModeRequested: true;
    readonly containedProofExecutionOnly: true;
    readonly directProcessAllowed: false;
    readonly runtimeBuildAttestationVerified: true;
    readonly nativeVerifierAttestationVerified: true;
    readonly immutableLauncherInstallationRequired: true;
    readonly authorityRecordV2Required: true;
    readonly launcherInstallationActivationCampaignCompleted: false;
    readonly launcherAtomicBootstrapProven: false;
    readonly targetRuntimeBuildIdentityVerified: false;
    readonly runtimeCodeIdentityVerified: false;
    readonly runtimeUpgradeHistoryVerified: false;
    readonly cutoverPolicyVerified: false;
    readonly historicalMintAbsenceVerified: false;
    readonly committedVaultTransitionVerified: false;
    readonly mintAuthorityGranted: false;
    readonly settlementAuthorityGranted: false;
    readonly gate5Closed: false;
    readonly productionReady: false;
  };
}

export interface NativePegInRuntimeIdentityV2ExecutionAuthority {
  readonly declaration:
    NativePegInRuntimeIdentityV2ExecutionAuthorityDeclaration;
  execute(
    input: NativePegInRuntimeIdentityV2ExecutionAuthorityRequest,
  ): Promise<NativePegInRuntimeIdentityV2ExecutionAuthorityResult>;
}

export interface NativePegInRuntimeIdentityV2ExecutionAuthorityDeclaration {
  readonly runtimeBuildProfileId: string;
  readonly runtimeBuildAttestationId: string;
  readonly runtimeBuildPacketSha256Hex: string;
  readonly nativeVerifierProfileId: string;
  readonly nativeVerifierAttestationId: string;
  readonly jointAuthorityProfileDigestHex: string;
  readonly policyId: string;
  readonly executionPolicySha256: string;
  readonly policyEpoch: number;
  readonly launcherPath: string;
  readonly runtimeCodePath: string;
  readonly verifierExecutablePath: string;
  readonly runtimeCodeSha256Hex: string;
  readonly runtimeCodeSizeBytes: number;
  readonly verifierExecutableSha256Hex: string;
}

const AUTHORITIES = new WeakSet<object>();
const RESULTS = new WeakMap<object, {
  authority: object;
  stdoutSha256: string;
}>();

export function parseNativePegInRuntimeIdentityV2ExecutionAuthorityPackage(
  value: unknown,
): NativePegInRuntimeIdentityV2ExecutionAuthorityPackage {
  const record = exactRecord(value, [
    'executionPolicy',
    'launcherPath',
    'nativeVerifierPacket',
    'runtimeBuildPacket',
    'runtimeCodePath',
    'runtimeDependencyManifest',
    'schema',
    'verifierExecutablePath',
  ], 'runtime identity V2 execution authority package');
  if (
    record.schema
      !== NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_AUTHORITY_PACKAGE_SCHEMA
  ) {
    throw new Error(
      'runtime identity V2 execution authority package schema is unsupported',
    );
  }
  const parsed: NativePegInRuntimeIdentityV2ExecutionAuthorityPackage = {
    schema:
      NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_AUTHORITY_PACKAGE_SCHEMA,
    runtimeBuildPacket: structuredClone(
      record.runtimeBuildPacket,
    ) as PegInRuntimeBuildAttestationPacket,
    nativeVerifierPacket: structuredClone(
      record.nativeVerifierPacket,
    ) as NativePegInRuntimeIdentityV2AttestationPacket,
    executionPolicy: structuredClone(
      record.executionPolicy,
    ) as NativePegInRuntimeIdentityV2ExecutionPolicy,
    runtimeDependencyManifest:
      structuredClone(record.runtimeDependencyManifest) as RuntimeManifest,
    launcherPath: nonEmptyString(
      record.launcherPath,
      'native contained launcher path',
    ),
    runtimeCodePath: nonEmptyString(
      record.runtimeCodePath,
      'attested runtime code path',
    ),
    verifierExecutablePath: nonEmptyString(
      record.verifierExecutablePath,
      'native runtime identity V2 verifier executable path',
    ),
  };
  deriveNativePegInRuntimeIdentityV2ExecutionPolicySha256(
    parsed.executionPolicy,
  );
  parsed.launcherPath = normalizeImmutableNativeContainedLauncherPath(
    parsed.launcherPath,
    `0x${parsed.executionPolicy.nativeVerifier.launcher.sha256}`,
  );
  return parsed;
}

export function loadNativePegInRuntimeIdentityV2ExecutionAuthorityFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): NativePegInRuntimeIdentityV2ExecutionAuthority | null {
  const serialized =
    env[
      NATIVE_PEG_IN_RUNTIME_IDENTITY_V2_EXECUTION_AUTHORITY_PACKAGE_ENV
    ];
  if (serialized === undefined || serialized.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error(
      'runtime identity V2 execution authority package environment value is not valid JSON',
    );
  }
  return createNativePegInRuntimeIdentityV2ExecutionAuthority(
    parseNativePegInRuntimeIdentityV2ExecutionAuthorityPackage(parsed),
  );
}

export function createNativePegInRuntimeIdentityV2ExecutionAuthority(
  options: NativePegInRuntimeIdentityV2ExecutionAuthorityOptions,
): NativePegInRuntimeIdentityV2ExecutionAuthority {
  if (!options || typeof options !== 'object') {
    throw new Error(
      'runtime identity V2 execution authority options must be an object',
    );
  }
  const runtimeBuildPacket = structuredClone(options.runtimeBuildPacket);
  const nativeVerifierPacket = structuredClone(options.nativeVerifierPacket);
  const executionPolicy = structuredClone(options.executionPolicy);
  const runtimeDependencyManifest =
    structuredClone(options.runtimeDependencyManifest);
  const executionPolicySha256 =
    deriveNativePegInRuntimeIdentityV2ExecutionPolicySha256(executionPolicy);
  const launcherPath = normalizeImmutableNativeContainedLauncherPath(
    options.launcherPath,
    `0x${executionPolicy.nativeVerifier.launcher.sha256}`,
  );
  const runtimeCodePath = nonEmptyString(
    options.runtimeCodePath,
    'attested runtime code path',
  );
  const verifierExecutablePath = nonEmptyString(
    options.verifierExecutablePath,
    'native runtime identity V2 verifier executable path',
  );
  const initial = validateCurrentAuthorityProfile({
    runtimeBuildPacket,
    nativeVerifierPacket,
    executionPolicy,
    runtimeDependencyManifest,
    runtimeCodePath,
    verifierExecutablePath,
  });
  const jointAuthorityProfileDigestHex =
    deriveJointAuthorityProfileDigestHex(executionPolicy);
  const declaration = Object.freeze({
    runtimeBuildProfileId: initial.runtimeBuild.profileId,
    runtimeBuildAttestationId: initial.runtimeBuild.attestationId,
    runtimeBuildPacketSha256Hex:
      initial.runtimeBuild.attestation.packetSha256Hex,
    nativeVerifierProfileId: initial.nativeVerifier.profileId,
    nativeVerifierAttestationId: initial.nativeVerifier.attestationId,
    jointAuthorityProfileDigestHex,
    policyId: executionPolicy.policyId,
    executionPolicySha256,
    policyEpoch: executionPolicy.validity.policyEpoch,
    launcherPath,
    runtimeCodePath,
    verifierExecutablePath,
    runtimeCodeSha256Hex:
      `0x${executionPolicy.runtimeBuild.artifactSha256}`,
    runtimeCodeSizeBytes: executionPolicy.runtimeBuild.artifactSizeBytes,
    verifierExecutableSha256Hex:
      `0x${executionPolicy.nativeVerifier.artifactSha256}`,
  });

  const authority:
  NativePegInRuntimeIdentityV2ExecutionAuthority = Object.freeze({
    declaration,
    async execute(
      input: NativePegInRuntimeIdentityV2ExecutionAuthorityRequest,
    ): Promise<NativePegInRuntimeIdentityV2ExecutionAuthorityResult> {
      if (!Buffer.isBuffer(input?.requestBytes)) {
        throw new Error(
          'runtime identity V2 execution authority request must be a Buffer',
        );
      }
      if (input.operation !== 'verify-peg-in-runtime-identity-v2') {
        throw new Error(
          'runtime identity V2 execution authority operation is unsupported',
        );
      }
      const trustedAnchorDigestHex = lowercasePrefixedDigest32(
        input.trustedAnchorDigestHex,
        'trusted anchor digest',
      );

      const current = validateCurrentAuthorityProfile({
        runtimeBuildPacket,
        nativeVerifierPacket,
        executionPolicy,
        runtimeDependencyManifest,
        runtimeCodePath,
        verifierExecutablePath,
      });
      if (
        current.policyReport.executionPolicySha256
          !== executionPolicySha256
      ) {
        throw new Error(
          'runtime identity V2 execution authority policy changed after validation',
        );
      }

      const contained = await runNativeContainedProcess({
        launcherPath,
        launcherSha256Hex:
          `0x${executionPolicy.nativeVerifier.launcher.sha256}`,
        targetPath: verifierExecutablePath,
        targetSha256Hex:
          `0x${executionPolicy.nativeVerifier.artifactSha256}`,
        targetArgs: [
          '--trusted-anchor-digest',
          trustedAnchorDigestHex,
        ],
        policyNotBeforeUnixMs:
          Date.parse(executionPolicy.validity.notBefore),
        policyExpiresAtUnixMs:
          Date.parse(executionPolicy.validity.expiresAt),
        timeoutMs: executionPolicy.invocation.limits.timeoutMs,
        requestLimitBytes:
          executionPolicy.invocation.limits.requestLimitBytes,
        stdoutLimitBytes:
          executionPolicy.invocation.limits.stdoutLimitBytes,
        stderrLimitBytes:
          executionPolicy.invocation.limits.stderrLimitBytes,
        requestBytes: input.requestBytes,
        authority: {
          profileDigestHex: jointAuthorityProfileDigestHex,
          policyDigestHex: `0x${executionPolicySha256}`,
          policyEpoch: executionPolicy.validity.policyEpoch,
          recordVersion: 'v2',
          allowedSystemDlls: runtimeDependencyManifest.systemDlls,
        },
      });
      assertContainedProcessBoundary(contained);

      const postExecution = validateCurrentAuthorityProfile({
        runtimeBuildPacket,
        nativeVerifierPacket,
        executionPolicy,
        runtimeDependencyManifest,
        runtimeCodePath,
        verifierExecutablePath,
      });
      if (
        postExecution.runtimeBuild.profileId
          !== current.runtimeBuild.profileId
        || postExecution.runtimeBuild.attestationId
          !== current.runtimeBuild.attestationId
        || postExecution.runtimeBuild.attestation.packetSha256Hex
          !== current.runtimeBuild.attestation.packetSha256Hex
        || postExecution.nativeVerifier.profileId
          !== current.nativeVerifier.profileId
        || postExecution.nativeVerifier.attestationId
          !== current.nativeVerifier.attestationId
        || postExecution.policyReport.executionPolicySha256
          !== current.policyReport.executionPolicySha256
      ) {
        throw new Error(
          'runtime identity V2 execution authority changed during broker execution',
        );
      }

      const stdoutSnapshot = Buffer.from(contained.stdout);
      const result: NativePegInRuntimeIdentityV2ExecutionAuthorityResult =
        Object.freeze({
          get stdout(): Buffer {
            return Buffer.from(stdoutSnapshot);
          },
          runtimeBuildProfileId: postExecution.runtimeBuild.profileId,
          runtimeBuildAttestationId:
            postExecution.runtimeBuild.attestationId,
          runtimeBuildPacketSha256Hex:
            postExecution.runtimeBuild.attestation.packetSha256Hex,
          nativeVerifierProfileId: postExecution.nativeVerifier.profileId,
          nativeVerifierAttestationId:
            postExecution.nativeVerifier.attestationId,
          jointAuthorityProfileDigestHex,
          policyId: executionPolicy.policyId,
          executionPolicySha256,
          policyEpoch: executionPolicy.validity.policyEpoch,
          operation: 'verify-peg-in-runtime-identity-v2' as const,
          boundary: Object.freeze({
            sourceOwnedRuntimeBuildAttestorLockReloaded: true as const,
            sourceOwnedNativeVerifierAttestorLockReloaded: true as const,
            sourceOwnedAttestorLocksRevalidatedAfterExecution: true as const,
            reviewedTrustRootsRequired: true as const,
            exactJointPolicyValidatedAfterReload: true as const,
            exactJointPolicyRevalidatedAfterExecution: true as const,
            brokerAuthorityModeRequested: true as const,
            containedProofExecutionOnly: true as const,
            directProcessAllowed: false as const,
            runtimeBuildAttestationVerified: true as const,
            nativeVerifierAttestationVerified: true as const,
            immutableLauncherInstallationRequired: true as const,
            authorityRecordV2Required: true as const,
            launcherInstallationActivationCampaignCompleted: false as const,
            launcherAtomicBootstrapProven: false as const,
            targetRuntimeBuildIdentityVerified: false as const,
            runtimeCodeIdentityVerified: false as const,
            runtimeUpgradeHistoryVerified: false as const,
            cutoverPolicyVerified: false as const,
            historicalMintAbsenceVerified: false as const,
            committedVaultTransitionVerified: false as const,
            mintAuthorityGranted: false as const,
            settlementAuthorityGranted: false as const,
            gate5Closed: false as const,
            productionReady: false as const,
          }),
        });
      RESULTS.set(result, {
        authority,
        stdoutSha256: createHash('sha256')
          .update(stdoutSnapshot)
          .digest('hex'),
      });
      return result;
    },
  });
  AUTHORITIES.add(authority);
  return authority;
}

export function assertNativePegInRuntimeIdentityV2ExecutionAuthorityProvenance(
  authority: unknown,
): asserts authority is NativePegInRuntimeIdentityV2ExecutionAuthority {
  if (
    !authority
    || typeof authority !== 'object'
    || !AUTHORITIES.has(authority)
  ) {
    throw new Error(
      'runtime identity V2 execution authority provenance is missing',
    );
  }
}

export function assertNativePegInRuntimeIdentityV2ExecutionAuthorityResultProvenance(
  input: {
    authority: NativePegInRuntimeIdentityV2ExecutionAuthority;
    result: unknown;
  },
): asserts input is {
  authority: NativePegInRuntimeIdentityV2ExecutionAuthority;
  result: NativePegInRuntimeIdentityV2ExecutionAuthorityResult;
} {
  assertNativePegInRuntimeIdentityV2ExecutionAuthorityProvenance(
    input.authority,
  );
  if (!input.result || typeof input.result !== 'object') {
    throw new Error(
      'runtime identity V2 execution authority result provenance is missing',
    );
  }
  const provenance = RESULTS.get(input.result);
  const stdout = (input.result as { stdout?: unknown }).stdout;
  if (
    provenance?.authority !== input.authority
    || !Buffer.isBuffer(stdout)
    || createHash('sha256').update(stdout).digest('hex')
      !== provenance.stdoutSha256
  ) {
    throw new Error(
      'runtime identity V2 execution authority result provenance is missing',
    );
  }
}

function validateCurrentAuthorityProfile(input: {
  runtimeBuildPacket: PegInRuntimeBuildAttestationPacket;
  nativeVerifierPacket: NativePegInRuntimeIdentityV2AttestationPacket;
  executionPolicy: NativePegInRuntimeIdentityV2ExecutionPolicy;
  runtimeDependencyManifest: RuntimeManifest;
  runtimeCodePath: string;
  verifierExecutablePath: string;
}) {
  const runtimeBuild = verifyReviewedPegInRuntimeBuildAttestation({
    packet: structuredClone(input.runtimeBuildPacket),
    runtimeCodePath: input.runtimeCodePath,
  });
  assertReviewedPegInRuntimeBuildAttestationProvenance(runtimeBuild);
  if (runtimeBuild.boundary.reviewedTrustRootsLoaded !== true) {
    throw new Error(
      'runtime identity V2 authority requires reviewed runtime build trust roots',
    );
  }

  const nativeVerifier =
    verifyReviewedNativePegInRuntimeIdentityV2Attestation({
      packet: structuredClone(input.nativeVerifierPacket),
      verifierExecutablePath: input.verifierExecutablePath,
    });
  assertReviewedNativePegInRuntimeIdentityV2AttestationProvenance(
    nativeVerifier,
  );
  if (nativeVerifier.boundary.reviewedTrustRootsLoaded !== true) {
    throw new Error(
      'runtime identity V2 authority requires reviewed native verifier trust roots',
    );
  }

  const policyReport =
    validateNativePegInRuntimeIdentityV2ExecutionPolicyAgainstAttestations({
      runtimeBuild,
      nativeVerifier,
      policy: structuredClone(input.executionPolicy),
      runtimeDependencyManifest:
        structuredClone(input.runtimeDependencyManifest),
      evaluatedAt: new Date().toISOString(),
    });
  assertNativePegInRuntimeIdentityV2ExecutionPolicyValidationProvenance({
    runtimeBuild,
    nativeVerifier,
    report: policyReport,
  });
  if (
    policyReport.boundary.runtimeReviewedTrustRootsLoaded !== true
    || policyReport.boundary.nativeVerifierReviewedTrustRootsLoaded !== true
  ) {
    throw new Error(
      'runtime identity V2 authority policy lacks reviewed trust-root provenance',
    );
  }
  return { runtimeBuild, nativeVerifier, policyReport };
}

function deriveJointAuthorityProfileDigestHex(
  policy: NativePegInRuntimeIdentityV2ExecutionPolicy,
): string {
  const runtimeBuildProfileId = nonEmptyString(
    policy.runtimeBuild.profileId,
    'runtime build profile ID',
  );
  const nativeVerifierProfileId = nonEmptyString(
    policy.nativeVerifier.profileId,
    'native V2 verifier profile ID',
  );
  const authorityFields = [
    runtimeBuildProfileId,
    policy.runtimeBuild.attestorPolicyDigestHex,
    policy.runtimeBuild.builderKeyIdHex,
    policy.runtimeBuild.builderOrganizationId,
    policy.runtimeBuild.reviewerKeyIdHex,
    policy.runtimeBuild.reviewerOrganizationId,
    nativeVerifierProfileId,
    policy.nativeVerifier.attestorPolicyDigestHex,
    policy.nativeVerifier.builderKeyIdHex,
    policy.nativeVerifier.builderOrganizationId,
    policy.nativeVerifier.reviewerKeyIdHex,
    policy.nativeVerifier.reviewerOrganizationId,
  ].map((value, index) =>
    nonEmptyString(value, `joint authority field ${index}`));
  return `0x${createHash('sha256')
    .update(
      `E2S_RUNTIME_IDENTITY_V2_JOINT_AUTHORITY_V2\0${authorityFields.join('\0')}`,
      'utf8',
    )
    .digest('hex')}`;
}

function lowercasePrefixedDigest32(
  value: unknown,
  label: string,
): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error(
      `runtime identity V2 execution authority ${label} must be a lowercase 0x-prefixed 32-byte digest`,
    );
  }
  return value;
}

function assertContainedProcessBoundary(
  result: NativeContainedProcessResult,
): void {
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
    throw new Error(
      'runtime identity V2 execution authority broker boundary is invalid',
    );
  }
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} has an unexpected field`);
  }
  return record;
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
