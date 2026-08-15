import { createHash } from 'crypto';

import {
  assertReviewedIndependentlyAttestedNativeVerifierProfileProvenance,
  verifyReviewedIndependentlyAttestedNativeVerifierProfile,
  type NativeVerifierAttestationPacket,
} from './independently-attested-native-verifier-profile.js';
import {
  runNativeContainedProcess,
  type NativeContainedProcessResult,
} from './native-contained-process.js';
import {
  assertNativePegInVerifierExecutionPolicyValidationProvenance,
  deriveNativePegInVerifierExecutionPolicySha256,
  validateNativePegInVerifierExecutionPolicyAgainstProfile,
  type NativePegInVerifierExecutionPolicy,
  type NativePegInVerifierExecutionPolicyOperation,
} from './native-peg-in-verifier-execution-policy.js';
import {
  deriveNativeVerifierAuthorityProfileDigestHex,
} from './native-verifier-execution-authority.js';
import type {
  NativeRuntimeDependencyManifest,
} from './native-verifier-execution-policy.js';

export const NATIVE_PEG_IN_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_SCHEMA =
  'e2s.native-peg-in-verifier-execution-authority-package.v1';
export const NATIVE_PEG_IN_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_ENV =
  'NATIVE_PEG_IN_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_JSON';

export type NativePegInVerifierExecutionAuthorityOperation =
  NativePegInVerifierExecutionPolicyOperation;

export interface NativePegInVerifierExecutionAuthorityOptions {
  packet: NativeVerifierAttestationPacket;
  executionPolicy: NativePegInVerifierExecutionPolicy;
  runtimeDependencyManifest: NativeRuntimeDependencyManifest<'bridge-checkpoint-verifier'>;
  launcherPath: string;
  verifierExecutablePath: string;
  codecExecutablePath: string;
}

export interface NativePegInVerifierExecutionAuthorityPackage
  extends NativePegInVerifierExecutionAuthorityOptions {
  schema: typeof NATIVE_PEG_IN_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_SCHEMA;
}

export interface NativePegInVerifierExecutionAuthorityRequest {
  operation: NativePegInVerifierExecutionAuthorityOperation;
  trustedAnchorDigestHex: string;
  requestBytes: Buffer;
}

export interface NativePegInVerifierExecutionAuthorityResult {
  stdout: Buffer;
  profileId: string;
  attestationId: string;
  policyId: string;
  executionPolicySha256: string;
  policyEpoch: number;
  operation: NativePegInVerifierExecutionAuthorityOperation;
  boundary: {
    sourceOwnedAttestorLockReloaded: true;
    sourceOwnedAttestorLockRevalidatedAfterExecution: true;
    reviewedTrustRootsRequired: true;
    exactPegInPolicyValidatedAfterReload: true;
    exactPegInPolicyRevalidatedAfterExecution: true;
    brokerAuthorityModeRequested: true;
    directProcessAllowed: false;
    pegInConformanceAttested: false;
    runtimeCodeIdentityVerified: false;
    mintAuthorityGranted: false;
    settlementAuthorityGranted: false;
    gate5Closed: false;
    productionReady: false;
  };
}

export interface NativePegInVerifierExecutionAuthority {
  readonly declaration: NativePegInVerifierExecutionAuthorityDeclaration;
  execute(
    input: NativePegInVerifierExecutionAuthorityRequest,
  ): Promise<NativePegInVerifierExecutionAuthorityResult>;
}

export interface NativePegInVerifierExecutionAuthorityDeclaration {
  operation: NativePegInVerifierExecutionAuthorityOperation;
  profileId: string;
  attestationId: string;
  policyId: string;
  executionPolicySha256: string;
  policyEpoch: number;
  launcherPath: string;
  verifierExecutablePath: string;
  codecExecutablePath: string;
  verifierExecutableSha256Hex: string;
}

const AUTHORITIES = new WeakSet<object>();
const RESULTS = new WeakMap<object, {
  authority: object;
  stdoutSha256: string;
}>();

export function parseNativePegInVerifierExecutionAuthorityPackage(
  value: unknown,
): NativePegInVerifierExecutionAuthorityPackage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('native peg-in verifier execution authority package must be an object');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [
    'codecExecutablePath',
    'executionPolicy',
    'launcherPath',
    'packet',
    'runtimeDependencyManifest',
    'schema',
    'verifierExecutablePath',
  ];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error('native peg-in verifier execution authority package has an unexpected field');
  }
  if (record.schema !== NATIVE_PEG_IN_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_SCHEMA) {
    throw new Error('native peg-in verifier execution authority package schema is unsupported');
  }
  const parsed: NativePegInVerifierExecutionAuthorityPackage = {
    schema: NATIVE_PEG_IN_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_SCHEMA,
    packet: structuredClone(record.packet) as NativeVerifierAttestationPacket,
    executionPolicy:
      structuredClone(record.executionPolicy) as NativePegInVerifierExecutionPolicy,
    runtimeDependencyManifest: structuredClone(
      record.runtimeDependencyManifest,
    ) as NativeRuntimeDependencyManifest<'bridge-checkpoint-verifier'>,
    launcherPath: nonEmptyString(record.launcherPath, 'native contained launcher path'),
    verifierExecutablePath: nonEmptyString(
      record.verifierExecutablePath,
      'native peg-in verifier executable path',
    ),
    codecExecutablePath: nonEmptyString(
      record.codecExecutablePath,
      'native RPC codec executable path',
    ),
  };
  deriveNativePegInVerifierExecutionPolicySha256(parsed.executionPolicy);
  return parsed;
}

export function loadNativePegInVerifierExecutionAuthorityFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): NativePegInVerifierExecutionAuthority | null {
  const serialized = env[NATIVE_PEG_IN_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_ENV];
  if (serialized === undefined || serialized.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error(
      'native peg-in verifier execution authority package environment value is not valid JSON',
    );
  }
  return createNativePegInVerifierExecutionAuthority(
    parseNativePegInVerifierExecutionAuthorityPackage(parsed),
  );
}

export function createNativePegInVerifierExecutionAuthority(
  options: NativePegInVerifierExecutionAuthorityOptions,
): NativePegInVerifierExecutionAuthority {
  if (!options || typeof options !== 'object') {
    throw new Error('native peg-in verifier execution authority options must be an object');
  }
  const packet = structuredClone(options.packet);
  const executionPolicy = structuredClone(options.executionPolicy);
  const runtimeDependencyManifest = structuredClone(options.runtimeDependencyManifest);
  const launcherPath = nonEmptyString(options.launcherPath, 'native contained launcher path');
  const verifierExecutablePath = nonEmptyString(
    options.verifierExecutablePath,
    'native peg-in verifier executable path',
  );
  const codecExecutablePath = nonEmptyString(
    options.codecExecutablePath,
    'native RPC codec executable path',
  );
  const executionPolicySha256 =
    deriveNativePegInVerifierExecutionPolicySha256(executionPolicy);
  const declaration = Object.freeze({
    operation: executionPolicy.verifier.invocation.operation,
    profileId: executionPolicy.profileId,
    attestationId: executionPolicy.attestationId,
    policyId: executionPolicy.policyId,
    executionPolicySha256,
    policyEpoch: executionPolicy.validity.policyEpoch,
    launcherPath,
    verifierExecutablePath,
    codecExecutablePath,
    verifierExecutableSha256Hex: `0x${executionPolicy.verifier.artifactSha256}`,
  });

  validateCurrentAuthorityProfile({
    packet,
    executionPolicy,
    runtimeDependencyManifest,
    verifierExecutablePath,
    codecExecutablePath,
  });

  const authority = Object.freeze({
    declaration,
    async execute(
      input: NativePegInVerifierExecutionAuthorityRequest,
    ): Promise<NativePegInVerifierExecutionAuthorityResult> {
      if (!Buffer.isBuffer(input?.requestBytes)) {
        throw new Error('native peg-in verifier authority request must be a Buffer');
      }
      if (
        input.operation !== 'verify-peg-in-state'
        && input.operation
          !== 'verify-pooled-reserve-mint-reservation-state-v4'
      ) {
        throw new Error('native peg-in verifier authority operation is unsupported');
      }
      const operation = input.operation;
      if (operation !== executionPolicy.verifier.invocation.operation) {
        throw new Error(
          'native peg-in verifier authority operation is not authorized by the exact execution policy',
        );
      }
      const trustedAnchorDigestHex = lowercasePrefixedDigest32(
        input.trustedAnchorDigestHex,
        'trusted anchor digest',
      );

      const { profile, policyReport } = validateCurrentAuthorityProfile({
        packet,
        executionPolicy,
        runtimeDependencyManifest,
        verifierExecutablePath,
        codecExecutablePath,
      });
      if (executionPolicySha256 !== policyReport.executionPolicySha256) {
        throw new Error('native peg-in verifier authority policy digest changed after validation');
      }

      const contained = await runNativeContainedProcess({
        launcherPath,
        launcherSha256Hex: `0x${executionPolicy.bindings.launcher.sha256}`,
        targetPath: verifierExecutablePath,
        targetSha256Hex: `0x${executionPolicy.verifier.artifactSha256}`,
        targetArgs: [
          `--${operation}`,
          '--trusted-anchor-digest',
          trustedAnchorDigestHex,
        ],
        policyNotBeforeUnixMs: Date.parse(executionPolicy.validity.notBefore),
        policyExpiresAtUnixMs: Date.parse(executionPolicy.validity.expiresAt),
        timeoutMs: executionPolicy.verifier.limits.timeoutMs,
        requestLimitBytes: executionPolicy.verifier.limits.requestLimitBytes,
        stdoutLimitBytes: executionPolicy.verifier.limits.stdoutLimitBytes,
        stderrLimitBytes: executionPolicy.verifier.limits.stderrLimitBytes,
        requestBytes: input.requestBytes,
        authority: {
          profileDigestHex: deriveNativeVerifierAuthorityProfileDigestHex(profile.profileId),
          policyDigestHex: `0x${executionPolicySha256}`,
          policyEpoch: executionPolicy.validity.policyEpoch,
          allowedSystemDlls: runtimeDependencyManifest.systemDlls,
        },
      });
      assertContainedProcessBoundary(contained);

      const postExecution = validateCurrentAuthorityProfile({
        packet,
        executionPolicy,
        runtimeDependencyManifest,
        verifierExecutablePath,
        codecExecutablePath,
      });
      if (
        postExecution.profile.profileId !== profile.profileId
        || postExecution.profile.attestationId !== profile.attestationId
        || postExecution.policyReport.executionPolicySha256
          !== policyReport.executionPolicySha256
      ) {
        throw new Error('native peg-in verifier authority changed during broker execution');
      }

      const stdoutSnapshot = Buffer.from(contained.stdout);
      const stdoutSha256 = createHash('sha256').update(stdoutSnapshot).digest('hex');
      const result: NativePegInVerifierExecutionAuthorityResult = Object.freeze({
        get stdout(): Buffer {
          return Buffer.from(stdoutSnapshot);
        },
        profileId: postExecution.profile.profileId,
        attestationId: postExecution.profile.attestationId,
        policyId: executionPolicy.policyId,
        executionPolicySha256,
        policyEpoch: executionPolicy.validity.policyEpoch,
        operation,
        boundary: Object.freeze({
          sourceOwnedAttestorLockReloaded: true as const,
          sourceOwnedAttestorLockRevalidatedAfterExecution: true as const,
          reviewedTrustRootsRequired: true as const,
          exactPegInPolicyValidatedAfterReload: true as const,
          exactPegInPolicyRevalidatedAfterExecution: true as const,
          brokerAuthorityModeRequested: true as const,
          directProcessAllowed: false as const,
          pegInConformanceAttested: false as const,
          runtimeCodeIdentityVerified: false as const,
          mintAuthorityGranted: false as const,
          settlementAuthorityGranted: false as const,
          gate5Closed: false as const,
          productionReady: false as const,
        }),
      });
      RESULTS.set(result, { authority, stdoutSha256 });
      return result;
    },
  });
  AUTHORITIES.add(authority);
  return authority;
}

export function assertNativePegInVerifierExecutionAuthorityProvenance(
  authority: unknown,
): asserts authority is NativePegInVerifierExecutionAuthority {
  if (!authority || typeof authority !== 'object' || !AUTHORITIES.has(authority)) {
    throw new Error('native peg-in verifier execution authority provenance is missing');
  }
}

export function assertNativePegInVerifierExecutionAuthorityResultProvenance(input: {
  authority: NativePegInVerifierExecutionAuthority;
  result: unknown;
}): asserts input is {
  authority: NativePegInVerifierExecutionAuthority;
  result: NativePegInVerifierExecutionAuthorityResult;
} {
  assertNativePegInVerifierExecutionAuthorityProvenance(input.authority);
  if (!input.result || typeof input.result !== 'object') {
    throw new Error('native peg-in verifier execution authority result provenance is missing');
  }
  const provenance = RESULTS.get(input.result);
  const stdout = (input.result as { stdout?: unknown }).stdout;
  if (
    provenance?.authority !== input.authority
    || !Buffer.isBuffer(stdout)
    || createHash('sha256').update(stdout).digest('hex') !== provenance.stdoutSha256
  ) {
    throw new Error('native peg-in verifier execution authority result provenance is missing');
  }
}

function validateCurrentAuthorityProfile(input: {
  packet: NativeVerifierAttestationPacket;
  executionPolicy: NativePegInVerifierExecutionPolicy;
  runtimeDependencyManifest: NativeRuntimeDependencyManifest<'bridge-checkpoint-verifier'>;
  verifierExecutablePath: string;
  codecExecutablePath: string;
}) {
  const profile = verifyReviewedIndependentlyAttestedNativeVerifierProfile({
    packet: structuredClone(input.packet),
    verifierExecutablePath: input.verifierExecutablePath,
    codecExecutablePath: input.codecExecutablePath,
  });
  assertReviewedIndependentlyAttestedNativeVerifierProfileProvenance(profile);
  if (profile.boundary.reviewedTrustRootsLoaded !== true) {
    throw new Error('native peg-in verifier authority requires source-reviewed trust roots');
  }
  const policyReport = validateNativePegInVerifierExecutionPolicyAgainstProfile({
    profile,
    policy: structuredClone(input.executionPolicy),
    runtimeDependencyManifest: structuredClone(input.runtimeDependencyManifest),
    evaluatedAt: new Date().toISOString(),
  });
  assertNativePegInVerifierExecutionPolicyValidationProvenance({
    profile,
    report: policyReport,
  });
  if (policyReport.boundary.reviewedTrustRootsLoaded !== true) {
    throw new Error(
      'native peg-in verifier authority policy lacks reviewed trust-root provenance',
    );
  }
  return { profile, policyReport };
}

function lowercasePrefixedDigest32(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error(
      `native peg-in verifier authority ${label} must be a lowercase 0x-prefixed 32-byte digest`,
    );
  }
  return value;
}

function assertContainedProcessBoundary(result: NativeContainedProcessResult): void {
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
    throw new Error('native peg-in verifier authority broker boundary is invalid');
  }
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0')) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}
