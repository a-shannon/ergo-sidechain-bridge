/**
 * Pure composition of the reviewed V5 compiler family into one settlement
 * instance identity. It performs no network, node-check, signing, submission,
 * broadcast, or funds-authority operation.
 */

import {
  decodePegInPooledReserveLineageProfileV4Hex,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  decodePooledReserveBurnApplicationBindingV5,
} from './pooled-reserve-burn-statement-v5.js';
import {
  type ValidityApplicationPooledReserveBurnFamilyV5CompilerRequest,
  type ValidityApplicationPooledReserveBurnFamilyV5Identity,
  validateValidityApplicationPooledReserveBurnFamilyV5CompilerBatch,
} from './validity-application-pooled-reserve-burn-family-v5.js';

export const VALIDITY_APPLICATION_POOLED_RESERVE_INSTANCE_V5_SCHEMA =
  'e2s.validity-application-pooled-reserve-instance.v5' as const;

export interface BuildValidityApplicationPooledReserveInstanceV5Input {
  readonly compilerRequest:
    Readonly<ValidityApplicationPooledReserveBurnFamilyV5CompilerRequest>;
  readonly compilerBatchJson: string;
}

export interface ValidityApplicationPooledReserveInstanceV5Candidate {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_INSTANCE_V5_SCHEMA;
  readonly version: 5;
  readonly lineageProfileIdHex: string;
  readonly encodedLineageProfileHex: string;
  readonly sourceRuntimeLineageProfileIdHex: string;
  readonly genesis: {
    readonly trackerInputBoxIdHex: string;
    readonly trackerNftIdHex: string;
    readonly duplicatePreventionInputBoxIdHex: string;
    readonly duplicatePreventionNftIdHex: string;
    readonly settlementVaultInputBoxIdHex: string;
    readonly settlementVaultNftIdHex: string;
  };
  readonly application: {
    readonly burnBindingHex: string;
    readonly burnBindingDigestHex: string;
    readonly runtimeProfileScaleHex: string;
    readonly runtimeProfileIdHex: string;
    readonly programIdHex: string;
    readonly verifierProfileIdHex: string;
    readonly statementContractIdHex: string;
  };
  readonly sidechainFinalityPolicy: {
    readonly policyIdHex: string;
    readonly proofSystemIdHex: string;
    readonly proofProfileIdHex: string;
    readonly approvedTrustAnchorDigestHex: string;
  };
  readonly contracts:
    ValidityApplicationPooledReserveBurnFamilyV5Identity['contracts'];
  readonly relations: {
    readonly exactV4SourceRuntimeRetained: true;
    readonly v5SettlementLineageIsDistinct: true;
    readonly trackerContractSelfBound: true;
    readonly dependentContractCascadeBound: true;
  };
  readonly boundaries: {
    readonly compilerIdentityValidated: true;
    readonly settlementTransactionConstructed: false;
    readonly profileActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly nodeCheckPerformed: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

const candidates = new WeakSet<object>();

export function buildValidityApplicationPooledReserveInstanceV5(
  input: BuildValidityApplicationPooledReserveInstanceV5Input,
): Readonly<ValidityApplicationPooledReserveInstanceV5Candidate> {
  assertExactKeys(input, [
    'compilerRequest',
    'compilerBatchJson',
  ], 'pooled-reserve V5 instance input');
  const request = input.compilerRequest;
  const identity =
    validateValidityApplicationPooledReserveBurnFamilyV5CompilerBatch({
      request,
      compilerBatchJson: input.compilerBatchJson,
    });
  const profile = decodePegInPooledReserveLineageProfileV4Hex(
    `0x${variableHex(
      request.lineage.encodedProfileHex,
      'target settlement lineage profile',
    )}`,
  );
  const binding = decodePooledReserveBurnApplicationBindingV5(
    identity.applicationBindingHex,
  );

  requireEqual(identity.lineageProfileIdHex, request.lineage.profileIdHex,
    'target settlement lineage profile ID');
  requireEqual(identity.sourceRuntimeProfileIdHex,
    request.sourceRuntime.profileIdHex, 'source runtime profile ID');
  requireEqual(identity.sourceRuntimeLineageProfileIdHex,
    request.sourceRuntime.lineageProfileIdHex,
    'source runtime lineage profile ID');
  requireEqual(identity.proofProfileIdHex, request.policies.proofProfileIdHex,
    'V5 proof profile ID');
  requireEqual(binding.bindingDigestHex, identity.applicationBindingDigestHex,
    'V5 application binding digest');
  requireEqual(binding.runtimeProfileScaleHex,
    request.sourceRuntime.profileScaleHex, 'exact V4 source runtime profile');
  requireEqual(binding.runtimeProfileIdHex, request.sourceRuntime.profileIdHex,
    'exact V4 source runtime profile ID');
  requireEqual(binding.runtimeProfile.lineageProfileIdHex,
    prefixed(request.sourceRuntime.lineageProfileIdHex),
    'exact V4 source runtime lineage');
  requireEqual(binding.trackerNftIdHex,
    request.lineage.trackerNftIdHex, 'V5 tracker NFT ID');
  requireEqual(binding.settlementTrackerContractIdHex,
    identity.contracts.tracker.receipt.contractIdHex,
    'V5 tracker contract ID');
  requireEqual(binding.runtimeProfile.sidechainIdHex,
    prefixed(request.bindings.sidechainIdHex), 'source runtime sidechain ID');
  requireEqual(binding.runtimeProfile.settlementProfileIdHex,
    prefixed(request.bindings.settlementProfileIdHex),
    'source runtime settlement profile ID');
  requireEqual(profile.sidechainIdHex, prefixed(request.bindings.sidechainIdHex),
    'target settlement sidechain ID');
  requireEqual(profile.settlementProfileIdHex,
    prefixed(request.bindings.settlementProfileIdHex),
    'target settlement profile ID');
  if (
    request.lineage.profileIdHex === request.sourceRuntime.lineageProfileIdHex
  ) {
    throw new Error(
      'pooled-reserve V5 target settlement lineage must differ from the V4 source runtime lineage',
    );
  }

  const candidate = deepFreeze({
    schema: VALIDITY_APPLICATION_POOLED_RESERVE_INSTANCE_V5_SCHEMA,
    version: 5 as const,
    lineageProfileIdHex: fixedHex(request.lineage.profileIdHex, 32,
      'target settlement lineage profile ID'),
    encodedLineageProfileHex: `0x${variableHex(
      request.lineage.encodedProfileHex,
      'target settlement lineage profile',
    )}`,
    sourceRuntimeLineageProfileIdHex: fixedHex(
      request.sourceRuntime.lineageProfileIdHex,
      32,
      'source runtime lineage profile ID',
    ),
    genesis: {
      trackerInputBoxIdHex: fixedHex(
        request.lineage.trackerGenesisInputBoxIdHex, 32,
        'tracker genesis input box ID',
      ),
      trackerNftIdHex: fixedHex(request.lineage.trackerNftIdHex, 32,
        'tracker NFT ID'),
      duplicatePreventionInputBoxIdHex: fixedHex(
        request.lineage.duplicatePreventionGenesisInputBoxIdHex,
        32,
        'duplicate-prevention genesis input box ID',
      ),
      duplicatePreventionNftIdHex: fixedHex(
        request.lineage.duplicatePreventionNftIdHex, 32,
        'duplicate-prevention NFT ID',
      ),
      settlementVaultInputBoxIdHex: fixedHex(
        request.lineage.pooledReserveGenesisInputBoxIdHex,
        32,
        'pooled-reserve genesis input box ID',
      ),
      settlementVaultNftIdHex: fixedHex(
        request.lineage.pooledReserveNftIdHex, 32,
        'pooled-reserve NFT ID',
      ),
    },
    application: {
      burnBindingHex: variableHex(identity.applicationBindingHex,
        'V5 application binding'),
      burnBindingDigestHex: fixedHex(identity.applicationBindingDigestHex, 32,
        'V5 application binding digest'),
      runtimeProfileScaleHex: fixedHex(request.sourceRuntime.profileScaleHex,
        349, 'exact V4 source runtime profile'),
      runtimeProfileIdHex: fixedHex(request.sourceRuntime.profileIdHex, 32,
        'exact V4 source runtime profile ID'),
      programIdHex: fixedHex(request.bindings.programIdHex, 32,
        'V5 program ID'),
      verifierProfileIdHex: fixedHex(request.bindings.verifierProfileIdHex, 32,
        'V5 verifier profile ID'),
      statementContractIdHex: fixedHex(
        identity.contracts.tracker.receipt.contractIdHex,
        32,
        'V5 tracker contract ID',
      ),
    },
    sidechainFinalityPolicy: {
      policyIdHex: fixedHex(request.policies.sidechainFinalityPolicyIdHex, 32,
        'sidechain-finality policy ID'),
      proofSystemIdHex: fixedHex(request.policies.proofSystemIdHex, 32,
        'proof-system ID'),
      proofProfileIdHex: fixedHex(request.policies.proofProfileIdHex, 32,
        'V5 proof-profile ID'),
      approvedTrustAnchorDigestHex: fixedHex(
        request.bindings.approvedTrustAnchorDigestHex,
        32,
        'approved trust-anchor digest',
      ),
    },
    contracts: identity.contracts,
    relations: {
      exactV4SourceRuntimeRetained: true as const,
      v5SettlementLineageIsDistinct: true as const,
      trackerContractSelfBound: true as const,
      dependentContractCascadeBound: true as const,
    },
    boundaries: {
      compilerIdentityValidated: true as const,
      settlementTransactionConstructed: false as const,
      profileActivated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      nodeCheckPerformed: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  });
  candidates.add(candidate);
  return candidate;
}

export function assertCompiledValidityApplicationPooledReserveInstanceV5Candidate(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveInstanceV5Candidate
> {
  if (value === null || typeof value !== 'object' || !candidates.has(value)) {
    throw new Error(
      'pooled-reserve V5 instance was not built from the reviewed compiler family in this process',
    );
  }
}

function prefixed(value: string): string {
  return `0x${fixedHex(value, 32, 'prefixed identity')}`;
}

function requireEqual(actual: string, expected: string, label: string): void {
  if (
    actual.toLowerCase().replace(/^0x/, '')
      !== expected.toLowerCase().replace(/^0x/, '')
  ) {
    throw new Error(`${label} mismatch`);
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^(?:0x)?[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be ${bytes} lowercase hex bytes`);
  }
  return value.startsWith('0x') ? value.slice(2) : value;
}

function variableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^(?:0x)?[0-9a-f]+$/.test(value)
    || (value.startsWith('0x') ? value.length - 2 : value.length) % 2 !== 0
  ) {
    throw new Error(`${label} must be non-empty lowercase hex bytes`);
  }
  return value.startsWith('0x') ? value.slice(2) : value;
}

function assertExactKeys(
  value: unknown,
  required: readonly string[],
  label: string,
): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...required].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly: ${expected.join(', ')}`);
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || seen.has(value as object)) {
    return value;
  }
  seen.add(value as object);
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested, seen);
  }
  return Object.freeze(value);
}
