import blakejs from 'blakejs';

import {
  decodeBridgeCausalApplicationBindingV2,
} from './bridge-validity-application-statement-v2.js';
import {
  decodePegInPooledReserveLineageProfileV4Hex,
  derivePegInPooledReserveLineageProfileV4IdHex,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import { sha256CanonicalJson } from './strict-json.js';
import {
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate,
  type ValidityApplicationPooledReserveInstanceV4Candidate,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_BYTES,
  POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_DOMAIN,
} from './pooled-reserve-burn-profile-v4.js';
import {
  POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES as CODEC_PROFILE_BYTES,
  POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_FORMAT_VERSION as CODEC_FORMAT_VERSION,
  POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_ID_DOMAIN as CODEC_ID_DOMAIN,
  decodePooledReserveMintReservationRuntimeProfileV4ScaleHex as decodeRuntimeProfile,
  derivePooledReserveMintReservationRuntimeProfileV4 as deriveRuntimeProfile,
  derivePooledReserveMintReservationRuntimeProfileV4IdHex as deriveRuntimeProfileId,
  encodePooledReserveMintReservationRuntimeProfileV4ScaleHex as encodeRuntimeProfile,
  type DerivePooledReserveMintReservationRuntimeProfileV4Input as CodecDerivationInput,
  type PooledReserveMintReservationRuntimeProfileV4 as CodecRuntimeProfile,
} from './pooled-reserve-mint-reservation-runtime-profile-v4-codec.js';

export const POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_SCHEMA =
  'e2s.pooled-reserve-mint-reservation-runtime-profile.v4' as const;
export const POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_STATUS =
  'non_authorizing_candidate' as const;
export const POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_FORMAT_VERSION =
  CODEC_FORMAT_VERSION;
export const POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_BYTES =
  CODEC_PROFILE_BYTES;
export const POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_ID_DOMAIN =
  CODEC_ID_DOMAIN;
export const POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_DIGEST_DOMAIN =
  'E2S_POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_CANDIDATE_V4' as const;

const UINT32_MAX = 0xffff_ffff;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;
const candidates = new WeakSet<object>();

export type PooledReserveMintReservationRuntimeProfileV4 = CodecRuntimeProfile;

export interface PooledReserveMintReservationRuntimeProfileV4Candidate {
  readonly schema:
    typeof POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_SCHEMA;
  readonly version:
    typeof POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_FORMAT_VERSION;
  readonly status:
    typeof POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_STATUS;
  readonly profile: Readonly<PooledReserveMintReservationRuntimeProfileV4>;
  readonly profileScaleHex: string;
  readonly profileIdHex: string;
  readonly compiledBinding: {
    readonly lineageProfileIdHex: string;
    readonly encodedLineageProfileHex: string;
    readonly lineageActivationHeight: string;
    readonly applicationBindingHex: string;
    readonly applicationBindingDigestHex: string;
    readonly runtimeProfileScaleHex: string;
    readonly runtimeProfileIdHex: string;
    readonly burnApplicationBindingHex: string;
    readonly burnApplicationBindingDigestHex: string;
    readonly contractIds: {
      readonly tracker: string;
      readonly duplicatePrevention: string;
      readonly sourceLock: string;
      readonly pooledReserve: string;
    };
  };
  readonly checks: {
    readonly sameProcessCompiledInstanceVerified: true;
    readonly exactLineageProfileDecoded: true;
    readonly exactApplicationBindingDecoded: true;
    readonly exactRuntimeProfileBoundBeforeCompilation: true;
    readonly exactBurnApplicationBindingRetained: true;
    readonly exactCompiledContractIdentitiesRetained: true;
    readonly activationHeightInheritedFromLineage: true;
    readonly callerSuppliedProfileAccepted: false;
  };
  readonly authority: {
    readonly profileActivated: false;
    readonly sourceProofVerified: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly mintAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
  readonly candidateDigestHex: string;
}

export type DerivePooledReserveMintReservationRuntimeProfileV4Input =
  CodecDerivationInput;

export function encodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
  value: PooledReserveMintReservationRuntimeProfileV4,
): string {
  return encodeRuntimeProfile(value);
}

export function decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
  value: string,
): Readonly<PooledReserveMintReservationRuntimeProfileV4> {
  return decodeRuntimeProfile(value);
}

export function derivePooledReserveMintReservationRuntimeProfileV4IdHex(
  value: PooledReserveMintReservationRuntimeProfileV4 | string,
): string {
  return deriveRuntimeProfileId(value);
}

export function derivePooledReserveMintReservationRuntimeProfileV4(
  input: DerivePooledReserveMintReservationRuntimeProfileV4Input,
): Readonly<PooledReserveMintReservationRuntimeProfileV4> {
  return deriveRuntimeProfile(input);
}

export function buildPooledReserveMintReservationRuntimeProfileV4Candidate(
  input: {
    readonly compiledInstance:
      Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>;
    readonly maxPendingBlocks: number;
  },
): Readonly<PooledReserveMintReservationRuntimeProfileV4Candidate> {
  assertExactDataObject(
    input,
    ['compiledInstance', 'maxPendingBlocks'],
    'pooled-reserve runtime-profile candidate input',
  );
  const compiled = input.compiledInstance;
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate(compiled);

  const lineage = decodePegInPooledReserveLineageProfileV4Hex(
    compiled.encodedLineageProfileHex,
  );
  const lineageProfileIdHex =
    derivePegInPooledReserveLineageProfileV4IdHex(lineage);
  if (lineageProfileIdHex !== compiled.lineageProfileIdHex) {
    throw new Error(
      'compiled pooled-reserve lineage identity is inconsistent',
    );
  }

  const application = decodeBridgeCausalApplicationBindingV2(
    compiled.application.bindingHex,
  );
  assertCompiledApplicationBindings(compiled, lineage, application);

  const profile = derivePooledReserveMintReservationRuntimeProfileV4({
    encodedLineageProfileHex: compiled.encodedLineageProfileHex,
    lineageProfileIdHex,
    bridgeRuntimeCodeSha256Hex:
      prefixedHex(application.bridgeRuntimeCodeSha256Hex),
    bridgeRuntimeCodeBytes: application.bridgeRuntimeCodeBytes,
    tokenRuntimeCodeSha256Hex:
      prefixedHex(application.tokenRuntimeCodeSha256Hex),
    tokenRuntimeCodeBytes: application.tokenRuntimeCodeBytes,
    maxPendingBlocks: positiveUint32(
      input.maxPendingBlocks,
      'maximum pending blocks',
    ),
  });
  const profileScaleHex =
    encodePooledReserveMintReservationRuntimeProfileV4ScaleHex(profile);
  const profileIdHex =
    derivePooledReserveMintReservationRuntimeProfileV4IdHex(profileScaleHex);
  if (
    profileScaleHex !== compiled.application.runtimeProfileScaleHex
    || profileIdHex !== compiled.application.runtimeProfileIdHex
  ) {
    throw new Error(
      'maximum pending blocks must match the runtime profile bound before compilation',
    );
  }
  const compiledBinding = deepFreeze({
    lineageProfileIdHex: compiled.lineageProfileIdHex,
    encodedLineageProfileHex: compiled.encodedLineageProfileHex,
    lineageActivationHeight: profile.activationHeight,
    applicationBindingHex: compiled.application.bindingHex,
    applicationBindingDigestHex: compiled.application.bindingDigestHex,
    runtimeProfileScaleHex: compiled.application.runtimeProfileScaleHex,
    runtimeProfileIdHex: compiled.application.runtimeProfileIdHex,
    burnApplicationBindingHex: compiled.application.burnBindingHex,
    burnApplicationBindingDigestHex:
      compiled.application.burnBindingDigestHex,
    contractIds: {
      tracker: compiled.contracts.tracker.receipt.contractIdHex,
      duplicatePrevention:
        compiled.contracts.duplicatePrevention.receipt.contractIdHex,
      sourceLock: compiled.contracts.sourceLock.receipt.contractIdHex,
      pooledReserve: compiled.contracts.pooledReserve.receipt.contractIdHex,
    },
  });
  const checks = deepFreeze({
    sameProcessCompiledInstanceVerified: true as const,
    exactLineageProfileDecoded: true as const,
    exactApplicationBindingDecoded: true as const,
    exactRuntimeProfileBoundBeforeCompilation: true as const,
    exactBurnApplicationBindingRetained: true as const,
    exactCompiledContractIdentitiesRetained: true as const,
    activationHeightInheritedFromLineage: true as const,
    callerSuppliedProfileAccepted: false as const,
  });
  const authority = deepFreeze({
    profileActivated: false as const,
    sourceProofVerified: false as const,
    targetNodeAcceptanceEstablished: false as const,
    mintAuthorized: false as const,
    signingAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
  const binding = {
    schema: POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_SCHEMA,
    version: POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_FORMAT_VERSION,
    status: POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_STATUS,
    profile,
    profileScaleHex,
    profileIdHex,
    compiledBinding,
    checks,
    authority,
  } as const;
  const candidate = deepFreeze({
    ...binding,
    candidateDigestHex: `0x${sha256CanonicalJson(
      binding,
      POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_DIGEST_DOMAIN,
    )}`,
  });
  candidates.add(candidate);
  return candidate;
}

export function assertPooledReserveMintReservationRuntimeProfileV4CandidateProvenance(
  value: unknown,
): asserts value is Readonly<
  PooledReserveMintReservationRuntimeProfileV4Candidate
> {
  validateCandidateBindings(value);
  if (value === null || typeof value !== 'object' || !candidates.has(value)) {
    throw new Error(
      'pooled-reserve mint-reservation runtime-profile candidate was not built in this process',
    );
  }
}

function assertCompiledApplicationBindings(
  compiled: Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>,
  lineage: ReturnType<
    typeof decodePegInPooledReserveLineageProfileV4Hex
  >,
  application: ReturnType<typeof decodeBridgeCausalApplicationBindingV2>,
): void {
  if (
    application.encodedBindingHex !== compiled.application.bindingHex
    || application.bindingDigestHex
      !== compiled.application.bindingDigestHex
  ) {
    throw new Error(
      'compiled pooled-reserve application binding digest is inconsistent',
    );
  }
  for (const [lineageValue, applicationValue, label] of [
    [lineage.sourceNetworkIdHex, application.sourceNetworkIdHex, 'source network'],
    [lineage.sidechainIdHex, application.sidechainIdHex, 'sidechain'],
    [lineage.bridgeAddressHex, application.bridgeAddressHex, 'bridge address'],
    [lineage.tokenAddressHex, application.tokenAddressHex, 'token address'],
    [
      lineage.settlementProfileIdHex,
      application.settlementProfileIdHex,
      'settlement profile',
    ],
    [
      compiled.lineageProfileIdHex,
      application.causalProfileIdHex,
      'lineage profile',
    ],
  ] as const) {
    if (stripHexPrefix(lineageValue) !== applicationValue) {
      throw new Error(
        `compiled pooled-reserve ${label} binding is inconsistent`,
      );
    }
  }
  if (
    compiled.application.statementContractIdHex
      !== compiled.contracts.tracker.receipt.contractIdHex
    || compiled.sidechainFinalityPolicy.policyIdHex
      !== lineage.sidechainFinalityPolicyIdHex
    || compiled.sidechainFinalityPolicy.proofSystemIdHex
      !== lineage.proofSystemIdHex
    || compiled.sidechainFinalityPolicy.proofProfileIdHex
      !== lineage.proofProfileIdHex
    || compiled.ergoDepositFinalityPolicy.policyIdHex
      !== lineage.ergoDepositFinalityPolicyIdHex
  ) {
    throw new Error(
      'compiled pooled-reserve policy or statement binding is inconsistent',
    );
  }
}

function validateCandidateBindings(value: unknown): void {
  const candidate = assertExactDataObject(
    value,
    [
      'schema',
      'version',
      'status',
      'profile',
      'profileScaleHex',
      'profileIdHex',
      'compiledBinding',
      'checks',
      'authority',
      'candidateDigestHex',
    ],
    'pooled-reserve runtime-profile candidate',
  );
  if (
    candidate.schema
      !== POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_SCHEMA
    || candidate.version
      !== POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_FORMAT_VERSION
    || candidate.status
      !== POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_STATUS
  ) {
    throw new Error('pooled-reserve runtime-profile candidate identity is invalid');
  }
  const profile = normalizeProfile(candidate.profile);
  const profileScaleHex =
    encodePooledReserveMintReservationRuntimeProfileV4ScaleHex(profile);
  if (candidate.profileScaleHex !== profileScaleHex) {
    throw new Error(
      'pooled-reserve runtime-profile candidate SCALE bytes are inconsistent',
    );
  }
  if (
    candidate.profileIdHex
      !== derivePooledReserveMintReservationRuntimeProfileV4IdHex(
        profileScaleHex,
      )
  ) {
    throw new Error(
      'pooled-reserve runtime-profile candidate profile ID is inconsistent',
    );
  }

  const compiledBinding = assertExactDataObject(
    candidate.compiledBinding,
    [
      'lineageProfileIdHex',
      'encodedLineageProfileHex',
      'lineageActivationHeight',
      'applicationBindingHex',
      'applicationBindingDigestHex',
      'runtimeProfileScaleHex',
      'runtimeProfileIdHex',
      'burnApplicationBindingHex',
      'burnApplicationBindingDigestHex',
      'contractIds',
    ],
    'pooled-reserve runtime-profile compiled binding',
  );
  const lineage = decodePegInPooledReserveLineageProfileV4Hex(
    stringValue(
      compiledBinding.encodedLineageProfileHex,
      'encoded lineage profile',
    ),
  );
  if (
    derivePegInPooledReserveLineageProfileV4IdHex(lineage)
      !== compiledBinding.lineageProfileIdHex
    || profile.lineageProfileIdHex !== compiledBinding.lineageProfileIdHex
  ) {
    throw new Error(
      'pooled-reserve runtime-profile candidate lineage binding is inconsistent',
    );
  }
  if (
    compiledBinding.runtimeProfileScaleHex !== candidate.profileScaleHex
    || compiledBinding.runtimeProfileIdHex !== candidate.profileIdHex
  ) {
    throw new Error(
      'pooled-reserve runtime-profile candidate differs from the pre-compilation binding',
    );
  }
  const contractIds = assertExactDataObject(
    compiledBinding.contractIds,
    ['tracker', 'duplicatePrevention', 'sourceLock', 'pooledReserve'],
    'pooled-reserve runtime-profile contract identities',
  );
  for (const [role, contractId] of Object.entries(contractIds)) {
    fixedBareHex(
      contractId,
      32,
      `pooled-reserve ${role} contract ID`,
      true,
    );
  }
  const burnBindingHex = fixedBareHex(
    compiledBinding.burnApplicationBindingHex,
    POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_BYTES,
    'pooled-reserve burn application binding',
    true,
  );
  const burnBinding = Buffer.from(burnBindingHex, 'hex');
  const expectedBurnBindingDigest = stripHexPrefix(blake2b256Hex(Buffer.concat([
    Buffer.from(POOLED_RESERVE_BURN_APPLICATION_BINDING_V4_DOMAIN, 'ascii'),
    burnBinding,
  ])));
  if (
    fixedBareHex(
      compiledBinding.burnApplicationBindingDigestHex,
      32,
      'pooled-reserve burn application binding digest',
      true,
    ) !== expectedBurnBindingDigest
    || burnBinding.subarray(0, 349).toString('hex')
      !== candidate.profileScaleHex.slice(2)
    || burnBinding.subarray(349, 381).toString('hex')
      !== candidate.profileIdHex.slice(2)
    || burnBinding.subarray(449, 481).toString('hex')
      !== contractIds.tracker
    || !burnBinding.subarray(481).equals(Buffer.alloc(4))
  ) {
    throw new Error(
      'pooled-reserve runtime-profile candidate burn application binding is inconsistent',
    );
  }
  if (
    profile.activationHeight !== compiledBinding.lineageActivationHeight
    || profile.activationHeight
      !== canonicalUint64(lineage.activationHeight, 'lineage activation height')
  ) {
    throw new Error(
      'pooled-reserve runtime-profile candidate activation height differs from the compiled lineage',
    );
  }
  if (
    profile.sourceNetworkIdHex !== lineage.sourceNetworkIdHex
    || profile.sidechainIdHex !== lineage.sidechainIdHex
    || profile.bridgeAddressHex !== lineage.bridgeAddressHex
    || profile.tokenAddressHex !== lineage.tokenAddressHex
    || profile.settlementProfileIdHex !== lineage.settlementProfileIdHex
    || profile.ergoDepositFinalityPolicyIdHex
      !== lineage.ergoDepositFinalityPolicyIdHex
    || profile.sourceProofSystemIdHex !== lineage.proofSystemIdHex
    || profile.sourceProofProfileIdHex !== lineage.proofProfileIdHex
  ) {
    throw new Error(
      'pooled-reserve runtime-profile candidate differs from the compiled lineage fields',
    );
  }
  const application = decodeBridgeCausalApplicationBindingV2(
    stringValue(
      compiledBinding.applicationBindingHex,
      'application binding',
    ),
  );
  if (
    application.bindingDigestHex
      !== compiledBinding.applicationBindingDigestHex
    || prefixedHex(application.causalProfileIdHex)
      !== profile.lineageProfileIdHex
    || prefixedHex(application.sourceNetworkIdHex)
      !== profile.sourceNetworkIdHex
    || prefixedHex(application.sidechainIdHex) !== profile.sidechainIdHex
    || prefixedHex(application.bridgeAddressHex) !== profile.bridgeAddressHex
    || prefixedHex(application.tokenAddressHex) !== profile.tokenAddressHex
    || prefixedHex(application.bridgeRuntimeCodeSha256Hex)
      !== profile.bridgeRuntimeCodeSha256Hex
    || application.bridgeRuntimeCodeBytes
      !== profile.bridgeRuntimeCodeBytes
    || prefixedHex(application.tokenRuntimeCodeSha256Hex)
      !== profile.tokenRuntimeCodeSha256Hex
    || application.tokenRuntimeCodeBytes !== profile.tokenRuntimeCodeBytes
    || prefixedHex(application.settlementProfileIdHex)
      !== profile.settlementProfileIdHex
  ) {
    throw new Error(
      'pooled-reserve runtime-profile candidate compiled application binding is inconsistent',
    );
  }
  const checks = assertExactDataObject(
    candidate.checks,
    [
      'sameProcessCompiledInstanceVerified',
      'exactLineageProfileDecoded',
      'exactApplicationBindingDecoded',
      'exactRuntimeProfileBoundBeforeCompilation',
      'exactBurnApplicationBindingRetained',
      'exactCompiledContractIdentitiesRetained',
      'activationHeightInheritedFromLineage',
      'callerSuppliedProfileAccepted',
    ],
    'pooled-reserve runtime-profile checks',
  );
  for (const field of [
    'sameProcessCompiledInstanceVerified',
    'exactLineageProfileDecoded',
    'exactApplicationBindingDecoded',
    'exactRuntimeProfileBoundBeforeCompilation',
    'exactBurnApplicationBindingRetained',
    'exactCompiledContractIdentitiesRetained',
    'activationHeightInheritedFromLineage',
  ]) {
    if (checks[field] !== true) {
      throw new Error(`pooled-reserve runtime-profile check ${field} is invalid`);
    }
  }
  if (checks.callerSuppliedProfileAccepted !== false) {
    throw new Error(
      'pooled-reserve runtime-profile cannot accept a caller-supplied profile',
    );
  }
  const authority = assertExactDataObject(
    candidate.authority,
    [
      'profileActivated',
      'sourceProofVerified',
      'targetNodeAcceptanceEstablished',
      'mintAuthorized',
      'signingAuthorized',
      'submissionAuthorized',
      'broadcastAuthorized',
      'fundsAuthorityEstablished',
      'gate5Closed',
      'trustlessStatusEstablished',
      'productionReadinessEstablished',
    ],
    'pooled-reserve runtime-profile authority',
  );
  if (Object.values(authority).some(field => field !== false)) {
    throw new Error(
      'pooled-reserve runtime-profile candidate widens authority or readiness',
    );
  }
  const binding = {
    schema: candidate.schema,
    version: candidate.version,
    status: candidate.status,
    profile: candidate.profile,
    profileScaleHex: candidate.profileScaleHex,
    profileIdHex: candidate.profileIdHex,
    compiledBinding: candidate.compiledBinding,
    checks: candidate.checks,
    authority: candidate.authority,
  };
  if (
    candidate.candidateDigestHex !== `0x${sha256CanonicalJson(
      binding,
      POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_DIGEST_DOMAIN,
    )}`
  ) {
    throw new Error(
      'pooled-reserve runtime-profile candidate digest is inconsistent',
    );
  }
}

function normalizeProfile(
  value: unknown,
): Readonly<PooledReserveMintReservationRuntimeProfileV4> {
  const profile = assertExactDataObject(
    value,
    [
      'formatVersion',
      'lineageProfileIdHex',
      'sourceNetworkIdHex',
      'sidechainIdHex',
      'bridgeAddressHex',
      'tokenAddressHex',
      'bridgeRuntimeCodeSha256Hex',
      'bridgeRuntimeCodeBytes',
      'tokenRuntimeCodeSha256Hex',
      'tokenRuntimeCodeBytes',
      'settlementProfileIdHex',
      'ergoDepositFinalityPolicyIdHex',
      'sourceProofSystemIdHex',
      'sourceProofProfileIdHex',
      'activationHeight',
      'maxPendingBlocks',
    ],
    'pooled-reserve mint-reservation runtime profile V4',
  );
  if (
    profile.formatVersion
      !== POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_FORMAT_VERSION
  ) {
    throw new Error(
      'pooled-reserve mint-reservation runtime profile version is unsupported',
    );
  }
  const normalized = {
    formatVersion:
      POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_FORMAT_VERSION,
    lineageProfileIdHex:
      fixedPrefixedHex(profile.lineageProfileIdHex, 32, 'lineage profile ID', true),
    sourceNetworkIdHex:
      fixedPrefixedHex(profile.sourceNetworkIdHex, 32, 'source-network ID', true),
    sidechainIdHex:
      fixedPrefixedHex(profile.sidechainIdHex, 32, 'sidechain ID', true),
    bridgeAddressHex:
      fixedPrefixedHex(profile.bridgeAddressHex, 20, 'bridge address', true),
    tokenAddressHex:
      fixedPrefixedHex(profile.tokenAddressHex, 20, 'token address', true),
    bridgeRuntimeCodeSha256Hex: fixedPrefixedHex(
      profile.bridgeRuntimeCodeSha256Hex,
      32,
      'bridge runtime code digest',
      true,
    ),
    bridgeRuntimeCodeBytes: positiveUint32(
      profile.bridgeRuntimeCodeBytes,
      'bridge runtime code bytes',
    ),
    tokenRuntimeCodeSha256Hex: fixedPrefixedHex(
      profile.tokenRuntimeCodeSha256Hex,
      32,
      'token runtime code digest',
      true,
    ),
    tokenRuntimeCodeBytes: positiveUint32(
      profile.tokenRuntimeCodeBytes,
      'token runtime code bytes',
    ),
    settlementProfileIdHex: fixedPrefixedHex(
      profile.settlementProfileIdHex,
      32,
      'settlement profile ID',
      true,
    ),
    ergoDepositFinalityPolicyIdHex: fixedPrefixedHex(
      profile.ergoDepositFinalityPolicyIdHex,
      32,
      'Ergo deposit finality-policy ID',
      true,
    ),
    sourceProofSystemIdHex: fixedPrefixedHex(
      profile.sourceProofSystemIdHex,
      32,
      'source-proof system ID',
      true,
    ),
    sourceProofProfileIdHex: fixedPrefixedHex(
      profile.sourceProofProfileIdHex,
      32,
      'source-proof profile ID',
      true,
    ),
    activationHeight: canonicalUint64(
      profile.activationHeight,
      'activation height',
    ),
    maxPendingBlocks: positiveUint32(
      profile.maxPendingBlocks,
      'maximum pending blocks',
    ),
  } as const;
  if (normalized.bridgeAddressHex === normalized.tokenAddressHex) {
    throw new Error(
      'pooled-reserve mint-reservation runtime profile aliases bridge and token addresses',
    );
  }
  return deepFreeze(normalized);
}

function assertExactDataObject(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actualKeys = Object.keys(descriptors).sort();
  const expected = [...expectedKeys].sort();
  if (
    actualKeys.length !== expected.length
    || actualKeys.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly ${expectedKeys.join(', ')}`);
  }
  for (const descriptor of Object.values(descriptors)) {
    if (
      !('value' in descriptor)
      || descriptor.enumerable !== true
    ) {
      throw new Error(`${label} fields must be own enumerable data properties`);
    }
  }
  return value as Record<string, unknown>;
}

function fixedPrefixedHex(
  value: unknown,
  bytes: number,
  label: string,
  nonZero = false,
): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be a lowercase 0x-prefixed ${bytes}-byte value`);
  }
  if (nonZero && /^0x0+$/.test(value)) {
    throw new Error(`${label} must not be zero`);
  }
  return value;
}

function fixedBareHex(
  value: unknown,
  bytes: number,
  label: string,
  nonZero = false,
): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be exactly ${bytes} lowercase bytes`);
  }
  if (nonZero && /^0+$/.test(value)) {
    throw new Error(`${label} must not be zero`);
  }
  return value;
}

function positiveUint32(value: unknown, label: string): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value <= 0
    || value > UINT32_MAX
  ) {
    throw new Error(`${label} must be a positive uint32`);
  }
  return value;
}

function canonicalUint64(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical uint64 decimal string`);
  }
  if (BigInt(value) > UINT64_MAX) {
    throw new Error(`${label} exceeds uint64`);
  }
  return value;
}

function prefixedHex(value: string): string {
  return value.startsWith('0x') ? value : `0x${value}`;
}

function stripHexPrefix(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

function blake2b256Hex(value: Uint8Array): string {
  return `0x${Buffer.from(
    blakejs.blake2b(value, undefined, 32),
  ).toString('hex')}`;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested, seen);
  }
  return Object.freeze(value);
}
