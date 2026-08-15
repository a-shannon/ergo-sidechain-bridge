import { createHash } from 'crypto';
import { isAbsolute } from 'path';

import {
  collectAndVerifyNativeFinalizedCheckpoint,
} from './native-checkpoint-proof-collector.js';
import {
  assertNativeVerifiedBridgeCheckpointAuthorityExecutionProvenance,
  assertNativeVerifiedBridgeCheckpointProvenance,
  buildNativeCheckpointAggregateFinalityProofV1,
  createAuthorityBoundNativeFinalizedBridgeCheckpointVerifier,
  type NativeFinalizedBridgeCheckpointRequest,
  type NativeVerifiedBridgeCheckpoint,
} from './native-finalized-bridge-checkpoint.js';
import type { AggregateFinalityProofV1 } from './bridge-finality-proof.js';
import {
  createAuthorityBoundNativeSubstrateRpcProofCodec,
  createNativeSubstrateRpcProofCodec,
  type NativeSubstrateRpcProofCodec,
} from './native-substrate-rpc-proof-codec.js';
import {
  assertNativeVerifierExecutionAuthorityProvenance,
  type NativeVerifierExecutionAuthority,
} from './native-verifier-execution-authority.js';
import {
  BoundedHttpSubstrateRpcTransport,
  ReadOnlySubstrateFinalityRpc,
  requestSubstrateBlockHashAt,
} from './substrate-finality-provider.js';
import {
  REVIEWED_NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_SHA256_HEXES,
} from './reviewed-native-checkpoint-settlement-profiles.js';

export { REVIEWED_NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_SHA256_HEXES };

export const NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_SCHEMA =
  'e2s.native-checkpoint-settlement-profile.v2';
export const NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_ENV =
  'NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_JSON';
const REVIEWED_NATIVE_CHECKPOINT_RESULTS = new WeakMap<object, string>();

type NativeTrustAnchor = NativeFinalizedBridgeCheckpointRequest['trustAnchor'];

export interface NativeCheckpointSettlementProfile {
  schema: typeof NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_SCHEMA;
  rpcUrl: string;
  authority: {
    profileId: string;
    attestationId: string;
    policyId: string;
    executionPolicySha256: string;
    minimumPolicyEpoch: number;
    launcherPath: string;
  };
  trustAnchor: NativeTrustAnchor & {
    trustedAnchorDigestHex: string;
  };
  codec: {
    executablePath: string;
    executableSha256Hex: string;
    executableInvocationSha256Hex: {
      encodeHeaders: string;
      inspectWarpProof: string;
      inspectFinalityProof: string;
    };
  };
  verifier: {
    executablePath: string;
    executableSha256Hex: string;
    executableInvocationSha256Hex: string;
  };
}

export interface NativeCheckpointSettlementSource {
  collectForSettlement(input: {
    sidechainIdHex: string;
    sidechainHeight: number;
  }): Promise<NativeCheckpointSettlementProofPackage>;
}

export interface NativeCheckpointSettlementProofPackage {
  checkpoint: NativeVerifiedBridgeCheckpoint;
  aggregateFinalityProof: AggregateFinalityProofV1;
}

export interface NativeCheckpointSettlementSourceDependencies {
  rpc: ReadOnlySubstrateFinalityRpc;
  codec: NativeSubstrateRpcProofCodec;
  requestBlockHashAt: typeof requestSubstrateBlockHashAt;
  collectAndVerify: typeof collectAndVerifyNativeFinalizedCheckpoint;
}

export function parseNativeCheckpointSettlementProfile(
  value: unknown,
): NativeCheckpointSettlementProfile {
  const profile = exactRecord(
    value,
    ['schema', 'rpcUrl', 'authority', 'trustAnchor', 'codec', 'verifier'],
    'native checkpoint settlement profile',
  );
  if (profile.schema !== NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_SCHEMA) {
    throw new Error('native checkpoint settlement profile schema is unsupported');
  }

  const rpcUrl = httpUrl(profile.rpcUrl, 'native checkpoint RPC URL');
  const authority = exactRecord(
    profile.authority,
    [
      'profileId',
      'attestationId',
      'policyId',
      'executionPolicySha256',
      'minimumPolicyEpoch',
      'launcherPath',
    ],
    'native checkpoint authority binding',
  );
  const trustAnchor = exactRecord(
    profile.trustAnchor,
    [
      'sidechainIdHex',
      'checkpointHashHex',
      'checkpointNumber',
      'grandpaSetId',
      'authorityListScaleHex',
      'trustedAnchorDigestHex',
    ],
    'native checkpoint trust anchor',
  );
  const codec = exactRecord(
    profile.codec,
    ['executablePath', 'executableSha256Hex', 'executableInvocationSha256Hex'],
    'native checkpoint codec',
  );
  const codecInvocation = exactRecord(
    codec.executableInvocationSha256Hex,
    ['encodeHeaders', 'inspectWarpProof', 'inspectFinalityProof'],
    'native checkpoint codec invocation pins',
  );
  const verifier = exactRecord(
    profile.verifier,
    ['executablePath', 'executableSha256Hex', 'executableInvocationSha256Hex'],
    'native checkpoint verifier',
  );

  return deepFreeze({
    schema: NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_SCHEMA,
    rpcUrl,
    authority: {
      profileId: boundedIdentifier(
        authority.profileId,
        'native checkpoint authority profile ID',
      ),
      attestationId: boundedIdentifier(
        authority.attestationId,
        'native checkpoint authority attestation ID',
      ),
      policyId: boundedIdentifier(
        authority.policyId,
        'native checkpoint authority policy ID',
      ),
      executionPolicySha256: unprefixedFixedHex(
        authority.executionPolicySha256,
        32,
        'native checkpoint authority policy digest',
      ),
      minimumPolicyEpoch: positiveSafeInteger(
        authority.minimumPolicyEpoch,
        'native checkpoint authority minimum policy epoch',
      ),
      launcherPath: fixedInstalledLauncherPath(authority.launcherPath),
    },
    trustAnchor: {
      sidechainIdHex: prefixedFixedHex(
        trustAnchor.sidechainIdHex,
        32,
        'trust anchor sidechain ID',
      ),
      checkpointHashHex: prefixedFixedHex(
        trustAnchor.checkpointHashHex,
        32,
        'trust anchor checkpoint hash',
      ),
      checkpointNumber: decimalUint64(
        trustAnchor.checkpointNumber,
        'trust anchor checkpoint number',
      ),
      grandpaSetId: decimalUint64(
        trustAnchor.grandpaSetId,
        'trust anchor GRANDPA set ID',
      ),
      authorityListScaleHex: prefixedVariableHex(
        trustAnchor.authorityListScaleHex,
        'trust anchor authority list',
      ),
      trustedAnchorDigestHex: prefixedFixedHex(
        trustAnchor.trustedAnchorDigestHex,
        32,
        'trusted anchor digest',
      ),
    },
    codec: {
      executablePath: absolutePath(codec.executablePath, 'native checkpoint codec path'),
      executableSha256Hex: prefixedFixedHex(
        codec.executableSha256Hex,
        32,
        'native checkpoint codec digest',
      ),
      executableInvocationSha256Hex: {
        encodeHeaders: prefixedFixedHex(
          codecInvocation.encodeHeaders,
          32,
          'native checkpoint encode-headers invocation digest',
        ),
        inspectWarpProof: prefixedFixedHex(
          codecInvocation.inspectWarpProof,
          32,
          'native checkpoint warp-proof invocation digest',
        ),
        inspectFinalityProof: prefixedFixedHex(
          codecInvocation.inspectFinalityProof,
          32,
          'native checkpoint finality-proof invocation digest',
        ),
      },
    },
    verifier: {
      executablePath: absolutePath(
        verifier.executablePath,
        'native checkpoint verifier path',
      ),
      executableSha256Hex: prefixedFixedHex(
        verifier.executableSha256Hex,
        32,
        'native checkpoint verifier digest',
      ),
      executableInvocationSha256Hex: prefixedFixedHex(
        verifier.executableInvocationSha256Hex,
        32,
        'native checkpoint verifier invocation digest',
      ),
    },
  });
}

export function createNativeCheckpointSettlementSource(
  profileInput: NativeCheckpointSettlementProfile,
): NativeCheckpointSettlementSource {
  const profile = parseNativeCheckpointSettlementProfile(profileInput);
  assertProfileDigestIsReviewed(profile);
  throw new Error(
    'reviewed native checkpoint settlement requires a source-refreshed execution authority; direct process profiles are disabled',
  );
}

export function createAuthorityBoundNativeCheckpointSettlementSource(
  profileInput: NativeCheckpointSettlementProfile,
  authority: NativeVerifierExecutionAuthority,
): NativeCheckpointSettlementSource {
  const profile = parseNativeCheckpointSettlementProfile(profileInput);
  assertProfileDigestIsReviewed(profile);
  assertNativeVerifierExecutionAuthorityProvenance(authority);
  assertAuthorityMatchesSettlementProfile(profile, authority);
  const codec = createAuthorityBoundNativeSubstrateRpcProofCodec(authority);
  const verifier = createAuthorityBoundNativeFinalizedBridgeCheckpointVerifier(authority);
  if (
    verifier.deriveExecutableInvocationSha256Hex(
      profile.trustAnchor.trustedAnchorDigestHex,
    ) !== profile.verifier.executableInvocationSha256Hex
  ) {
    throw new Error(
      'native checkpoint settlement authority verifier invocation does not match the reviewed profile',
    );
  }
  return createNativeCheckpointSettlementSourceInternal(
    profile,
    { codec },
    { authority, verifier },
  );
}

export function createUnreviewedNativeCheckpointSettlementSourceForTesting(
  profileInput: NativeCheckpointSettlementProfile,
  dependencies: Partial<NativeCheckpointSettlementSourceDependencies>,
): NativeCheckpointSettlementSource {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('unreviewed native checkpoint settlement source is test-only');
  }
  return createNativeCheckpointSettlementSourceInternal(
    parseNativeCheckpointSettlementProfile(profileInput),
    dependencies,
    null,
  );
}

function createNativeCheckpointSettlementSourceInternal(
  profile: NativeCheckpointSettlementProfile,
  dependencies: Partial<NativeCheckpointSettlementSourceDependencies>,
  reviewedExecution: {
    authority: NativeVerifierExecutionAuthority;
    verifier: ReturnType<typeof createAuthorityBoundNativeFinalizedBridgeCheckpointVerifier>;
  } | null,
): NativeCheckpointSettlementSource {
  const rpc = dependencies.rpc ?? new ReadOnlySubstrateFinalityRpc(
    new BoundedHttpSubstrateRpcTransport(profile.rpcUrl),
  );
  const codec = dependencies.codec ?? createNativeSubstrateRpcProofCodec({
    executablePath: profile.codec.executablePath,
    expectedExecutableSha256Hex: profile.codec.executableSha256Hex,
    expectedExecutableInvocationSha256Hex:
      profile.codec.executableInvocationSha256Hex,
  });
  const resolveBlockHash = dependencies.requestBlockHashAt
    ?? requestSubstrateBlockHashAt;
  const collectAndVerify = dependencies.collectAndVerify
    ?? collectAndVerifyNativeFinalizedCheckpoint;
  const trustAnchor: NativeTrustAnchor = {
    sidechainIdHex: profile.trustAnchor.sidechainIdHex,
    checkpointHashHex: profile.trustAnchor.checkpointHashHex,
    checkpointNumber: profile.trustAnchor.checkpointNumber,
    grandpaSetId: profile.trustAnchor.grandpaSetId,
    authorityListScaleHex: profile.trustAnchor.authorityListScaleHex,
  };

  return Object.freeze({
    async collectForSettlement(input: {
      sidechainIdHex: string;
      sidechainHeight: number;
    }): Promise<NativeCheckpointSettlementProofPackage> {
      const sidechainIdHex = `0x${unprefixedFixedHex(
        input?.sidechainIdHex,
        32,
        'settlement sidechain ID',
      )}`;
      if (sidechainIdHex !== trustAnchor.sidechainIdHex) {
        throw new Error('settlement sidechain ID does not match the reviewed trust anchor sidechain ID');
      }
      const sidechainHeight = positiveSafeInteger(
        input?.sidechainHeight,
        'settlement sidechain height',
      );
      const targetNativeBlockHashHex = await resolveBlockHash(rpc, sidechainHeight);
      const common = {
        rpc,
        codec,
        trustAnchor,
        targetNativeBlockHashHex,
        trustedAnchorDigestHex: profile.trustAnchor.trustedAnchorDigestHex,
      };
      const result = reviewedExecution === null
        ? await collectAndVerify({
            ...common,
            verifierExecutablePath: profile.verifier.executablePath,
            verifierExecutableSha256Hex: profile.verifier.executableSha256Hex,
            verifierExecutableInvocationSha256Hex:
              profile.verifier.executableInvocationSha256Hex,
          })
        : await collectAndVerify({
            ...common,
            verifier: reviewedExecution.verifier,
          });
      assertNativeVerifiedBridgeCheckpointProvenance(result?.checkpoint);
      const checkpoint = result.checkpoint.checkpointCommitment.checkpoint;
      if (checkpoint.sidechainIdHex !== sidechainIdHex.slice(2)) {
        throw new Error('native checkpoint result does not match the requested sidechain ID');
      }
      if (BigInt(checkpoint.sidechainHeight) !== BigInt(sidechainHeight)) {
        throw new Error('native checkpoint result does not match the requested sidechain height');
      }
      if (
        checkpoint.sidechainConsensusBlockHashHex
        !== unprefixedFixedHex(
          targetNativeBlockHashHex,
          32,
          'resolved native target block hash',
        )
      ) {
        throw new Error('native checkpoint result does not match the resolved native target block hash');
      }
      if (
        unprefixedFixedHex(
          result.checkpoint.nativeVerification.trustAnchorDigestHex,
          32,
          'native checkpoint result trust anchor digest',
        )
        !== profile.trustAnchor.trustedAnchorDigestHex.slice(2)
      ) {
        throw new Error('native checkpoint result does not match the reviewed trust anchor digest');
      }
      if (reviewedExecution !== null) {
        assertNativeVerifiedBridgeCheckpointAuthorityExecutionProvenance(
          result.checkpoint,
          reviewedExecution.authority,
        );
        REVIEWED_NATIVE_CHECKPOINT_RESULTS.set(
          result.checkpoint,
          deriveNativeCheckpointSettlementProfileSha256Hex(profile),
        );
      }
      const aggregateFinalityProof = buildNativeCheckpointAggregateFinalityProofV1({
        checkpoint: result.checkpoint,
        request: result.collection.request,
      });
      return deepFreeze({
        checkpoint: result.checkpoint,
        aggregateFinalityProof,
      });
    },
  });
}

export function assertReviewedNativeCheckpointSettlementProfileProvenance(
  checkpoint: unknown,
): asserts checkpoint is NativeVerifiedBridgeCheckpoint {
  if (
    typeof checkpoint !== 'object'
    || checkpoint === null
    || !REVIEWED_NATIVE_CHECKPOINT_RESULTS.has(checkpoint)
  ) {
    throw new Error('reviewed native checkpoint settlement profile provenance is missing');
  }
}

export function getReviewedNativeCheckpointSettlementProfileSha256Hex(
  checkpoint: unknown,
): string {
  assertReviewedNativeCheckpointSettlementProfileProvenance(checkpoint);
  return REVIEWED_NATIVE_CHECKPOINT_RESULTS.get(checkpoint)!;
}

export function deriveNativeCheckpointSettlementProfileSha256Hex(
  profileInput: NativeCheckpointSettlementProfile,
): string {
  const profile = parseNativeCheckpointSettlementProfile(profileInput);
  return `0x${createHash('sha256')
    .update(canonicalJson(profile), 'utf8')
    .digest('hex')}`;
}

export function loadNativeCheckpointSettlementSourceFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  authority?: NativeVerifierExecutionAuthority,
): NativeCheckpointSettlementSource | null {
  const serialized = env[NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_ENV];
  if (serialized === undefined || serialized.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('native checkpoint settlement profile environment value is not valid JSON');
  }
  const profile = parseNativeCheckpointSettlementProfile(parsed);
  assertProfileDigestIsReviewed(profile);
  if (authority === undefined) {
    throw new Error(
      'native checkpoint settlement profile is configured without a source-refreshed execution authority',
    );
  }
  return createAuthorityBoundNativeCheckpointSettlementSource(profile, authority);
}

function assertAuthorityMatchesSettlementProfile(
  profile: NativeCheckpointSettlementProfile,
  authority: NativeVerifierExecutionAuthority,
): void {
  const declaration = authority.declaration;
  if (
    declaration.profileId !== profile.authority.profileId
    || declaration.attestationId !== profile.authority.attestationId
    || declaration.policyId !== profile.authority.policyId
    || declaration.executionPolicySha256 !== profile.authority.executionPolicySha256
    || declaration.launcherPath !== profile.authority.launcherPath
  ) {
    throw new Error(
      'native checkpoint settlement authority identity or policy does not match the reviewed profile',
    );
  }
  if (declaration.policyEpoch < profile.authority.minimumPolicyEpoch) {
    throw new Error(
      'native checkpoint settlement authority epoch is below the reviewed profile minimum',
    );
  }
  if (
    declaration.verifierExecutablePath !== profile.verifier.executablePath
    || declaration.verifierExecutableSha256Hex !== profile.verifier.executableSha256Hex
  ) {
    throw new Error('native checkpoint settlement authority verifier does not match the reviewed profile');
  }
  if (
    declaration.codecExecutablePath !== profile.codec.executablePath
    || declaration.codecExecutableSha256Hex !== profile.codec.executableSha256Hex
    || declaration.codecExecutableInvocationSha256Hex.encodeHeaders
      !== profile.codec.executableInvocationSha256Hex.encodeHeaders
    || declaration.codecExecutableInvocationSha256Hex.inspectWarpProof
      !== profile.codec.executableInvocationSha256Hex.inspectWarpProof
    || declaration.codecExecutableInvocationSha256Hex.inspectFinalityProof
      !== profile.codec.executableInvocationSha256Hex.inspectFinalityProof
  ) {
    throw new Error('native checkpoint settlement authority codec does not match the reviewed profile');
  }
}

function assertProfileDigestIsReviewed(
  profile: NativeCheckpointSettlementProfile,
): void {
  const profileDigestHex = deriveNativeCheckpointSettlementProfileSha256Hex(profile);
  if (!REVIEWED_NATIVE_CHECKPOINT_SETTLEMENT_PROFILE_SHA256_HEXES.includes(
    profileDigestHex,
  )) {
    throw new Error(
      `native checkpoint settlement profile ${profileDigestHex} is not present in the reviewed profile registry`,
    );
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('native checkpoint settlement profile cannot contain non-finite numbers');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new Error(`native checkpoint settlement profile cannot serialize ${typeof value}`);
}

function exactRecord(
  value: unknown,
  fields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} contains an unexpected field or is missing a required field`);
  }
  return record;
}

function httpUrl(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be an HTTP(S) URL`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an HTTP(S) URL`);
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(`${label} must be an uncredentialed HTTP(S) URL`);
  }
  return value;
}

function absolutePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new Error(`${label} must be absolute`);
  }
  return value;
}

function fixedInstalledLauncherPath(value: unknown): string {
  const path = absolutePath(value, 'native checkpoint authority launcher path');
  const match = /^([a-z]):\\program files\\e2sbridge\\nativeexecution\\v1\\bridge-contained-launcher\.exe$/i
    .exec(path);
  if (!match) {
    throw new Error(
      'native checkpoint authority launcher path must use the fixed Program Files installation',
    );
  }
  return `${match[1].toUpperCase()}:\\Program Files\\E2SBridge\\NativeExecution\\v1\\bridge-contained-launcher.exe`;
}

function prefixedFixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error(`${label} must be 0x-prefixed hex`);
  }
  const normalized = value.slice(2).toLowerCase();
  if (normalized.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} bytes`);
  }
  return `0x${normalized}`;
}

function unprefixedFixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length !== bytes * 2) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return normalized;
}

function prefixedVariableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^0x[0-9a-fA-F]+$/.test(value)
    || value.length % 2 !== 0
  ) {
    throw new Error(`${label} must be non-empty 0x-prefixed byte hex`);
  }
  return value.toLowerCase();
}

function decimalUint64(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${label} must be a canonical decimal uint64`);
  }
  const parsed = BigInt(value);
  if (parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit uint64`);
  }
  return parsed.toString();
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function boundedIdentifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{2,127}$/.test(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
