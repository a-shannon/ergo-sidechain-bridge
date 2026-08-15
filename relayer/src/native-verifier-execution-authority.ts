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
import { deriveExecutableInvocationSha256Hex } from './native-executable-pin.js';
import {
  assertNativeVerifierExecutionPolicyValidationProvenance,
  deriveNativeVerifierExecutionPolicySha256,
  validateNativeVerifierExecutionPolicyAgainstProfile,
  type NativeRuntimeDependencyManifests,
  type NativeVerifierExecutionPolicy,
} from './native-verifier-execution-policy.js';

export const NATIVE_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_SCHEMA =
  'e2s.native-verifier-execution-authority-package.v1';
export const NATIVE_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_ENV =
  'NATIVE_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_JSON';

export type NativeVerifierAuthorityOperation =
  | 'verify-checkpoint'
  | 'encode-headers'
  | 'inspect-warp-proof'
  | 'inspect-finality-proof';

export interface NativeVerifierExecutionAuthorityOptions {
  packet: NativeVerifierAttestationPacket;
  executionPolicy: NativeVerifierExecutionPolicy;
  runtimeDependencyManifests: NativeRuntimeDependencyManifests;
  launcherPath: string;
  verifierExecutablePath: string;
  codecExecutablePath: string;
}

export interface NativeVerifierExecutionAuthorityPackage
  extends NativeVerifierExecutionAuthorityOptions {
  schema: typeof NATIVE_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_SCHEMA;
}

export type NativeVerifierExecutionAuthorityRequest = {
  requestBytes: Buffer;
} & (
  | {
    operation: 'verify-checkpoint';
    trustedAnchorDigestHex: string;
  }
  | {
    operation: Exclude<NativeVerifierAuthorityOperation, 'verify-checkpoint'>;
    trustedAnchorDigestHex?: never;
  }
);

export interface NativeVerifierExecutionAuthorityResult {
  stdout: Buffer;
  profileId: string;
  attestationId: string;
  policyId: string;
  executionPolicySha256: string;
  policyEpoch: number;
  operation: NativeVerifierAuthorityOperation;
  boundary: {
    sourceOwnedAttestorLockReloaded: true;
    sourceOwnedAttestorLockRevalidatedAfterExecution: true;
    reviewedTrustRootsRequired: true;
    exactPolicyValidatedAfterReload: true;
    exactPolicyRevalidatedAfterExecution: true;
    brokerAuthorityModeRequested: true;
    directProcessAllowed: false;
    executionAdmissionGranted: false;
    settlementAuthorityGranted: false;
    gate5Closed: false;
    productionReady: false;
  };
}

export interface NativeVerifierExecutionAuthority {
  readonly declaration: NativeVerifierExecutionAuthorityDeclaration;
  execute(
    input: NativeVerifierExecutionAuthorityRequest,
  ): Promise<NativeVerifierExecutionAuthorityResult>;
}

export interface NativeVerifierExecutionAuthorityDeclaration {
  profileId: string;
  attestationId: string;
  policyId: string;
  executionPolicySha256: string;
  policyEpoch: number;
  launcherPath: string;
  verifierExecutablePath: string;
  codecExecutablePath: string;
  verifierExecutableSha256Hex: string;
  codecExecutableSha256Hex: string;
  codecExecutableInvocationSha256Hex: {
    encodeHeaders: string;
    inspectWarpProof: string;
    inspectFinalityProof: string;
  };
}

const AUTHORITIES = new WeakSet<object>();
const RESULTS = new WeakMap<object, {
  authority: object;
  stdoutSha256: string;
}>();

export function deriveNativeVerifierAuthorityProfileDigestHex(profileId: string): string {
  if (typeof profileId !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,127}$/.test(profileId)) {
    throw new Error('native verifier authority profile ID is invalid');
  }
  return `0x${createHash('sha256').update(profileId, 'utf8').digest('hex')}`;
}

export function parseNativeVerifierExecutionAuthorityPackage(
  value: unknown,
): NativeVerifierExecutionAuthorityPackage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('native verifier execution authority package must be an object');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [
    'codecExecutablePath',
    'executionPolicy',
    'launcherPath',
    'packet',
    'runtimeDependencyManifests',
    'schema',
    'verifierExecutablePath',
  ];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error('native verifier execution authority package has an unexpected field');
  }
  if (record.schema !== NATIVE_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_SCHEMA) {
    throw new Error('native verifier execution authority package schema is unsupported');
  }
  const parsed: NativeVerifierExecutionAuthorityPackage = {
    schema: NATIVE_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_SCHEMA,
    packet: structuredClone(record.packet) as NativeVerifierAttestationPacket,
    executionPolicy: structuredClone(record.executionPolicy) as NativeVerifierExecutionPolicy,
    runtimeDependencyManifests: structuredClone(
      record.runtimeDependencyManifests,
    ) as NativeRuntimeDependencyManifests,
    launcherPath: nonEmptyString(record.launcherPath, 'native contained launcher path'),
    verifierExecutablePath: nonEmptyString(
      record.verifierExecutablePath,
      'native verifier executable path',
    ),
    codecExecutablePath: nonEmptyString(
      record.codecExecutablePath,
      'native RPC codec executable path',
    ),
  };
  // Parsing validates the complete policy shape without opening artifacts or
  // the source-owned attestor lock. Authority construction performs that work.
  deriveNativeVerifierExecutionPolicySha256(parsed.executionPolicy);
  return parsed;
}

export function loadNativeVerifierExecutionAuthorityFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): NativeVerifierExecutionAuthority | null {
  const serialized = env[NATIVE_VERIFIER_EXECUTION_AUTHORITY_PACKAGE_ENV];
  if (serialized === undefined || serialized.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('native verifier execution authority package environment value is not valid JSON');
  }
  const packageValue = parseNativeVerifierExecutionAuthorityPackage(parsed);
  return createNativeVerifierExecutionAuthority(packageValue);
}

export function createNativeVerifierExecutionAuthority(
  options: NativeVerifierExecutionAuthorityOptions,
): NativeVerifierExecutionAuthority {
  if (!options || typeof options !== 'object') {
    throw new Error('native verifier execution authority options must be an object');
  }
  const packet = structuredClone(options.packet);
  const executionPolicy = structuredClone(options.executionPolicy);
  const runtimeDependencyManifests = structuredClone(options.runtimeDependencyManifests);
  const launcherPath = nonEmptyString(options.launcherPath, 'native contained launcher path');
  const verifierExecutablePath = nonEmptyString(
    options.verifierExecutablePath,
    'native verifier executable path',
  );
  const codecExecutablePath = nonEmptyString(
    options.codecExecutablePath,
    'native RPC codec executable path',
  );
  const executionPolicySha256 = deriveNativeVerifierExecutionPolicySha256(
    executionPolicy,
  );
  const codecExecutableSha256Hex = `0x${executionPolicy.targets.codec.artifactSha256}`;
  const declaration = Object.freeze({
    profileId: executionPolicy.profileId,
    attestationId: executionPolicy.attestationId,
    policyId: executionPolicy.policyId,
    executionPolicySha256,
    policyEpoch: executionPolicy.validity.policyEpoch,
    launcherPath,
    verifierExecutablePath,
    codecExecutablePath,
    verifierExecutableSha256Hex: `0x${executionPolicy.targets.verifier.artifactSha256}`,
    codecExecutableSha256Hex,
    codecExecutableInvocationSha256Hex: Object.freeze({
      encodeHeaders: deriveExecutableInvocationSha256Hex(
        codecExecutableSha256Hex,
        ['--encode-headers'],
      ),
      inspectWarpProof: deriveExecutableInvocationSha256Hex(
        codecExecutableSha256Hex,
        ['--inspect-warp-proof'],
      ),
      inspectFinalityProof: deriveExecutableInvocationSha256Hex(
        codecExecutableSha256Hex,
        ['--inspect-finality-proof'],
      ),
    }),
  });
  validateCurrentAuthorityProfile({
    packet,
    executionPolicy,
    runtimeDependencyManifests,
    verifierExecutablePath,
    codecExecutablePath,
  });

  const authority = Object.freeze({
    declaration,
    async execute(
      input: NativeVerifierExecutionAuthorityRequest,
    ): Promise<NativeVerifierExecutionAuthorityResult> {
      if (!Buffer.isBuffer(input?.requestBytes)) {
        throw new Error('native verifier authority request must be a Buffer');
      }
      const operation = nativeVerifierAuthorityOperation(input?.operation);

      // This is intentionally repeated for every launch so source-owned key
      // revocation or rotation invalidates an already-created authority object.
      const { profile, policyReport } = validateCurrentAuthorityProfile({
        packet,
        executionPolicy,
        runtimeDependencyManifests,
        verifierExecutablePath,
        codecExecutablePath,
      });

      const targetKey = operation === 'verify-checkpoint' ? 'verifier' : 'codec';
      const target = executionPolicy.targets[targetKey];
      const manifest = runtimeDependencyManifests[targetKey];
      const targetPath = targetKey === 'verifier'
        ? verifierExecutablePath
        : codecExecutablePath;
      const targetArgs = authorityTargetArgs(operation, input);
      if (executionPolicySha256 !== policyReport.executionPolicySha256) {
        throw new Error('native verifier authority policy digest changed after validation');
      }

      const contained = await runNativeContainedProcess({
        launcherPath,
        launcherSha256Hex: `0x${executionPolicy.bindings.launcher.sha256}`,
        targetPath,
        targetSha256Hex: `0x${target.artifactSha256}`,
        targetArgs,
        policyNotBeforeUnixMs: Date.parse(executionPolicy.validity.notBefore),
        policyExpiresAtUnixMs: Date.parse(executionPolicy.validity.expiresAt),
        timeoutMs: target.limits.timeoutMs,
        requestLimitBytes: target.limits.requestLimitBytes,
        stdoutLimitBytes: target.limits.stdoutLimitBytes,
        stderrLimitBytes: target.limits.stderrLimitBytes,
        requestBytes: input.requestBytes,
        authority: {
          profileDigestHex: deriveNativeVerifierAuthorityProfileDigestHex(profile.profileId),
          policyDigestHex: `0x${executionPolicySha256}`,
          policyEpoch: executionPolicy.validity.policyEpoch,
          allowedSystemDlls: manifest.systemDlls,
        },
      });
      assertContainedProcessBoundary(contained);

      const postExecution = validateCurrentAuthorityProfile({
        packet,
        executionPolicy,
        runtimeDependencyManifests,
        verifierExecutablePath,
        codecExecutablePath,
      });
      if (
        postExecution.profile.profileId !== profile.profileId
        || postExecution.profile.attestationId !== profile.attestationId
        || postExecution.policyReport.executionPolicySha256
          !== policyReport.executionPolicySha256
      ) {
        throw new Error('native verifier authority changed during broker execution');
      }

      const stdoutSnapshot = Buffer.from(contained.stdout);
      const stdoutSha256 = createHash('sha256').update(stdoutSnapshot).digest('hex');
      const result: NativeVerifierExecutionAuthorityResult = Object.freeze({
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
          exactPolicyValidatedAfterReload: true as const,
          exactPolicyRevalidatedAfterExecution: true as const,
          brokerAuthorityModeRequested: true as const,
          directProcessAllowed: false as const,
          executionAdmissionGranted: false as const,
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

function validateCurrentAuthorityProfile(input: {
  packet: NativeVerifierAttestationPacket;
  executionPolicy: NativeVerifierExecutionPolicy;
  runtimeDependencyManifests: NativeRuntimeDependencyManifests;
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
    throw new Error('native verifier authority requires source-reviewed trust roots');
  }
  const policyReport = validateNativeVerifierExecutionPolicyAgainstProfile({
    profile,
    policy: structuredClone(input.executionPolicy),
    runtimeDependencyManifests: structuredClone(input.runtimeDependencyManifests),
    evaluatedAt: new Date().toISOString(),
  });
  assertNativeVerifierExecutionPolicyValidationProvenance({
    profile,
    report: policyReport,
  });
  if (policyReport.boundary.reviewedTrustRootsLoaded !== true) {
    throw new Error('native verifier authority policy lacks reviewed trust-root provenance');
  }
  return { profile, policyReport };
}

export function assertNativeVerifierExecutionAuthorityProvenance(
  authority: unknown,
): asserts authority is NativeVerifierExecutionAuthority {
  if (!authority || typeof authority !== 'object' || !AUTHORITIES.has(authority)) {
    throw new Error('native verifier execution authority provenance is missing');
  }
}

export function assertNativeVerifierExecutionAuthorityResultProvenance(input: {
  authority: NativeVerifierExecutionAuthority;
  result: unknown;
}): asserts input is {
  authority: NativeVerifierExecutionAuthority;
  result: NativeVerifierExecutionAuthorityResult;
} {
  assertNativeVerifierExecutionAuthorityProvenance(input.authority);
  if (!input.result || typeof input.result !== 'object') {
    throw new Error('native verifier execution authority result provenance is missing');
  }
  const provenance = RESULTS.get(input.result);
  const stdout = (input.result as { stdout?: unknown }).stdout;
  if (
    provenance?.authority !== input.authority
    || !Buffer.isBuffer(stdout)
    || createHash('sha256').update(stdout).digest('hex') !== provenance.stdoutSha256
  ) {
    throw new Error('native verifier execution authority result provenance is missing');
  }
}

function authorityTargetArgs(
  operation: NativeVerifierAuthorityOperation,
  input: NativeVerifierExecutionAuthorityRequest,
): string[] {
  if (operation === 'verify-checkpoint') {
    if (!('trustedAnchorDigestHex' in input)) {
      throw new Error('native verifier authority requires a trusted anchor digest');
    }
    return [
      '--trusted-anchor-digest',
      lowercasePrefixedDigest32(input.trustedAnchorDigestHex, 'trusted anchor digest'),
    ];
  }
  const modes: Record<Exclude<NativeVerifierAuthorityOperation, 'verify-checkpoint'>, string> = {
    'encode-headers': '--encode-headers',
    'inspect-warp-proof': '--inspect-warp-proof',
    'inspect-finality-proof': '--inspect-finality-proof',
  };
  return [modes[operation]];
}

function nativeVerifierAuthorityOperation(value: unknown): NativeVerifierAuthorityOperation {
  if (
    value !== 'verify-checkpoint'
    && value !== 'encode-headers'
    && value !== 'inspect-warp-proof'
    && value !== 'inspect-finality-proof'
  ) {
    throw new Error('native verifier authority operation is unsupported');
  }
  return value;
}

function lowercasePrefixedDigest32(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new Error(`native verifier authority ${label} must be a lowercase 0x-prefixed 32-byte digest`);
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
    throw new Error('native verifier authority broker boundary is invalid');
  }
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0')) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}
