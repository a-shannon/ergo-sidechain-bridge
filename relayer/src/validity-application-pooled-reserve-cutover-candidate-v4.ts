import {
  assertPooledReserveMintReservationRuntimeProfileV4CandidateProvenance,
  type PooledReserveMintReservationRuntimeProfileV4Candidate,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';
import {
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate,
  type ValidityApplicationPooledReserveInstanceV4Candidate,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance,
  type ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet,
} from './validity-application-pooled-reserve-historical-replay-genesis-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
  type LegacyRouteRetirementDispositionV4,
  type LegacyRouteRetirementRequirementV4,
} from './validity-application-pooled-reserve-legacy-route-requirements-v4.js';
import {
  assertValidityApplicationPooledReserveProvisioningV4Packet,
  type ValidityApplicationPooledReserveProvisioningV4Packet,
} from './validity-application-pooled-reserve-provisioning-v4.js';

export const VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_CANDIDATE_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-cutover-candidate.v4' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_CANDIDATE_V4_STATUS =
  'structurally_complete_non_authorizing_candidate' as const;

const CANDIDATE_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_CANDIDATE_V4';
const candidates = new WeakSet<object>();

export {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
};
export type {
  LegacyRouteRetirementDispositionV4,
  LegacyRouteRetirementRequirementV4,
};

export interface LegacyRouteRetirementDeclarationV4 {
  readonly routeId: string;
  readonly declaredDisposition: LegacyRouteRetirementDispositionV4;
  readonly declaredStatus: 'inactive-unverified' | 'active';
  readonly inventoryEvidenceDigestHex: string;
  readonly retirementEvidenceDigestHex: string;
}

export interface PooledReserveCutoverActivationParentV4 {
  readonly sidechainIdHex: string;
  readonly nativeBlockHashHex: string;
  readonly nativeHeight: string | number | bigint;
  readonly nativeStateRootHex: string;
  readonly executionBlockHashHex: string;
  readonly runtimeCodeSha256Hex: string;
  readonly runtimeCodeBytes: number;
  readonly sourceAdmissionPolicyIdHex: string;
  readonly observationDigestHex: string;
}

export interface BuildValidityApplicationPooledReserveCutoverCandidateV4Input {
  readonly compiledInstance: Readonly<
    ValidityApplicationPooledReserveInstanceV4Candidate
  >;
  readonly runtimeProfile: Readonly<
    PooledReserveMintReservationRuntimeProfileV4Candidate
  >;
  readonly historicalReplayGenesis: Readonly<
    ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet
  >;
  readonly provisioning: Readonly<
    ValidityApplicationPooledReserveProvisioningV4Packet
  >;
  readonly activationParent: PooledReserveCutoverActivationParentV4;
  readonly legacyRouteDeclarations:
    readonly LegacyRouteRetirementDeclarationV4[];
}

export interface ValidityApplicationPooledReserveCutoverCandidateV4 {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_CANDIDATE_V4_SCHEMA;
  readonly version: 4;
  readonly status:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_CANDIDATE_V4_STATUS;
  readonly candidateDigestHex: string;
  readonly application: {
    readonly lineageProfileIdHex: string;
    readonly runtimeProfileScaleHex: string;
    readonly runtimeProfileIdHex: string;
    readonly sourceRuntimeBindingDigestHex: string;
    readonly burnApplicationBindingHex: string;
    readonly applicationBindingDigestHex: string;
    readonly contractIds: {
      readonly tracker: string;
      readonly duplicatePrevention: string;
      readonly sourceLock: string;
      readonly pooledReserve: string;
    };
  };
  readonly sourceAdmissionProfile: {
    readonly policyIdHex: string;
    readonly proofSystemIdHex: string;
    readonly proofProfileIdHex: string;
    readonly approvedTrustAnchorDigestHex: string;
  };
  readonly activationParent: {
    readonly sidechainIdHex: string;
    readonly nativeBlockHashHex: string;
    readonly nativeHeight: string;
    readonly nativeStateRootHex: string;
    readonly executionBlockHashHex: string;
    readonly runtimeCodeSha256Hex: string;
    readonly runtimeCodeBytes: number;
    readonly sourceAdmissionPolicyIdHex: string;
    readonly observationDigestHex: string;
  };
  readonly replayCutover: {
    readonly historicalReplayGenesisPacketDigestHex: string;
    readonly cutoverObservationReportDigestHex: string;
    readonly provisioningDuplicatePreventionDigestHex: string;
    readonly importedCanonicalBurnIdCount: number;
    readonly importedHistoricalLineageCount: number;
    readonly allObservedHistoricalLineagesComposed: true;
    readonly allHistoricalLineagesImported: false;
  };
  readonly legacyRouteRetirement: {
    readonly requirementCount: number;
    readonly requirementsDigestHex: string;
    readonly declarations: readonly LegacyRouteRetirementDeclarationV4[];
    readonly declarationsStructurallyComplete: true;
    readonly declarationsAuthenticated: false;
    readonly inventoryCompletenessAuthenticated: false;
    readonly routesRetired: false;
  };
  readonly checks: {
    readonly sameProcessCompiledInstanceVerified: true;
    readonly sameProcessRuntimeProfileVerified: true;
    readonly sameProcessHistoricalReplayGenesisVerified: true;
    readonly sameProcessProvisioningVerified: true;
    readonly exactCompiledApplicationBindingMatched: true;
    readonly activationParentHeightMatched: true;
    readonly replayGenesisConsumedByProvisioning: true;
    readonly legacyRouteDeclarationSetComplete: true;
  };
  readonly authority: {
    readonly activationParentAuthenticated: false;
    readonly sourceAdmissionActivated: false;
    readonly legacyRouteInventoryAuthenticated: false;
    readonly legacyRoutesRetired: false;
    readonly profileActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly mintAuthorized: false;
    readonly payoutAuthorized: false;
    readonly signingAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  };
}

export function buildValidityApplicationPooledReserveCutoverCandidateV4(
  input: BuildValidityApplicationPooledReserveCutoverCandidateV4Input,
): Readonly<ValidityApplicationPooledReserveCutoverCandidateV4> {
  assertExactDataObject(input, [
    'compiledInstance',
    'runtimeProfile',
    'historicalReplayGenesis',
    'provisioning',
    'activationParent',
    'legacyRouteDeclarations',
  ], 'pooled-reserve V4 cutover candidate input');
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate(
    input.compiledInstance,
  );
  assertPooledReserveMintReservationRuntimeProfileV4CandidateProvenance(
    input.runtimeProfile,
  );
  assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance(
    input.historicalReplayGenesis,
  );
  assertValidityApplicationPooledReserveProvisioningV4Packet(
    input.provisioning,
  );

  const compiled = input.compiledInstance;
  const runtimeProfile = input.runtimeProfile;
  const historicalReplayGenesis = input.historicalReplayGenesis;
  const provisioning = input.provisioning;
  assertSameCompiledApplication(compiled, runtimeProfile);
  assertSameReplayLineage(compiled, historicalReplayGenesis);
  assertProvisioningConsumesReplay(
    compiled,
    historicalReplayGenesis,
    provisioning,
  );

  const activationHeight = canonicalUint64(
    runtimeProfile.profile.activationHeight,
    'runtime-profile activation height',
  );
  if (activationHeight === 0n) {
    throw new Error('pooled-reserve V4 activation height must have a parent');
  }
  const activationParent = normalizeActivationParent(input.activationParent);
  if (
    activationParent.sidechainIdHex
      !== fixedHex(
        runtimeProfile.profile.sidechainIdHex,
        32,
        'runtime-profile sidechain ID',
      )
    || BigInt(activationParent.nativeHeight) + 1n !== activationHeight
  ) {
    throw new Error(
      'pooled-reserve V4 activation parent does not immediately precede activation',
    );
  }
  if (
    activationParent.sourceAdmissionPolicyIdHex
      !== fixedHex(
        compiled.sidechainFinalityPolicy.policyIdHex,
        32,
        'compiled source-admission policy ID',
      )
  ) {
    throw new Error(
      'pooled-reserve V4 activation parent uses another source-admission policy',
    );
  }
  if (
    activationParent.runtimeCodeSha256Hex
      !== fixedHex(
        compiled.application.sourceRuntimeCodeSha256Hex,
        32,
        'compiled source runtime-code digest',
      )
    || activationParent.runtimeCodeBytes
      !== compiled.application.sourceRuntimeCodeBytes
  ) {
    throw new Error(
      'pooled-reserve V4 activation parent uses another source runtime',
    );
  }

  const declarations = normalizeLegacyRouteDeclarations(
    input.legacyRouteDeclarations,
  );
  const requirementsDigestHex = sha256CanonicalJson(
    VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
    'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4',
  );
  const binding = {
    schema: VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_CANDIDATE_V4_SCHEMA,
    version: 4 as const,
    status:
      VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_CANDIDATE_V4_STATUS,
    application: {
      lineageProfileIdHex: fixedHex(
        compiled.lineageProfileIdHex,
        32,
        'compiled lineage profile ID',
      ),
      runtimeProfileScaleHex: fixedHex(
        compiled.application.runtimeProfileScaleHex,
        349,
        'compiled runtime profile',
      ),
      runtimeProfileIdHex: fixedHex(
        runtimeProfile.profileIdHex,
        32,
        'runtime profile ID',
      ),
      sourceRuntimeBindingDigestHex: fixedHex(
        compiled.application.bindingDigestHex,
        32,
        'compiled source-runtime binding digest',
      ),
      burnApplicationBindingHex: fixedHex(
        compiled.application.burnBindingHex,
        485,
        'compiled burn application binding',
      ),
      applicationBindingDigestHex: fixedHex(
        compiled.application.burnBindingDigestHex,
        32,
        'compiled burn application-binding digest',
      ),
      contractIds: {
        tracker: fixedHex(
          compiled.contracts.tracker.receipt.contractIdHex,
          32,
          'compiled tracker contract ID',
        ),
        duplicatePrevention: fixedHex(
          compiled.contracts.duplicatePrevention.receipt.contractIdHex,
          32,
          'compiled duplicate-prevention contract ID',
        ),
        sourceLock: fixedHex(
          compiled.contracts.sourceLock.receipt.contractIdHex,
          32,
          'compiled source-lock contract ID',
        ),
        pooledReserve: fixedHex(
          compiled.contracts.pooledReserve.receipt.contractIdHex,
          32,
          'compiled pooled-reserve contract ID',
        ),
      },
    },
    sourceAdmissionProfile: {
      policyIdHex: fixedHex(
        compiled.sidechainFinalityPolicy.policyIdHex,
        32,
        'source-admission policy ID',
      ),
      proofSystemIdHex: fixedHex(
        compiled.sidechainFinalityPolicy.proofSystemIdHex,
        32,
        'source-admission proof-system ID',
      ),
      proofProfileIdHex: fixedHex(
        compiled.sidechainFinalityPolicy.proofProfileIdHex,
        32,
        'source-admission proof-profile ID',
      ),
      approvedTrustAnchorDigestHex: fixedHex(
        compiled.sidechainFinalityPolicy.approvedTrustAnchorDigestHex,
        32,
        'source-admission trust-anchor digest',
      ),
    },
    activationParent,
    replayCutover: {
      historicalReplayGenesisPacketDigestHex: fixedHex(
        historicalReplayGenesis.packetDigestHex,
        32,
        'historical replay-genesis packet digest',
      ),
      cutoverObservationReportDigestHex: fixedHex(
        historicalReplayGenesis.observation.cutoverObservationReportDigestHex,
        32,
        'cutover observation report digest',
      ),
      provisioningDuplicatePreventionDigestHex: fixedHex(
        provisioning.duplicatePreventionGenesis.digestHex,
        33,
        'provisioned duplicate-prevention digest',
      ),
      importedCanonicalBurnIdCount:
        historicalReplayGenesis.duplicatePreventionGenesis
          .canonicalBurnIdsHex.length,
      importedHistoricalLineageCount:
        historicalReplayGenesis.contributions.length,
      allObservedHistoricalLineagesComposed: true as const,
      allHistoricalLineagesImported: false as const,
    },
    legacyRouteRetirement: {
      requirementCount:
        VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4.length,
      requirementsDigestHex,
      declarations,
      declarationsStructurallyComplete: true as const,
      declarationsAuthenticated: false as const,
      inventoryCompletenessAuthenticated: false as const,
      routesRetired: false as const,
    },
    checks: {
      sameProcessCompiledInstanceVerified: true as const,
      sameProcessRuntimeProfileVerified: true as const,
      sameProcessHistoricalReplayGenesisVerified: true as const,
      sameProcessProvisioningVerified: true as const,
      exactCompiledApplicationBindingMatched: true as const,
      activationParentHeightMatched: true as const,
      replayGenesisConsumedByProvisioning: true as const,
      legacyRouteDeclarationSetComplete: true as const,
    },
    authority: {
      activationParentAuthenticated: false as const,
      sourceAdmissionActivated: false as const,
      legacyRouteInventoryAuthenticated: false as const,
      legacyRoutesRetired: false as const,
      profileActivated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      mintAuthorized: false as const,
      payoutAuthorized: false as const,
      signingAuthorized: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const candidate = deepFreeze({
    ...binding,
    candidateDigestHex: sha256CanonicalJson(
      binding,
      CANDIDATE_DIGEST_DOMAIN,
    ),
  });
  candidates.add(candidate);
  return candidate;
}

export function assertValidityApplicationPooledReserveCutoverCandidateV4Provenance(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveCutoverCandidateV4
> {
  if (value === null || typeof value !== 'object' || !candidates.has(value)) {
    throw new Error(
      'pooled-reserve V4 cutover candidate was not built in this process',
    );
  }
}

function assertSameCompiledApplication(
  compiled: Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>,
  runtimeProfile: Readonly<
    PooledReserveMintReservationRuntimeProfileV4Candidate
  >,
): void {
  const expectedContractIds = {
    tracker: compiled.contracts.tracker.receipt.contractIdHex,
    duplicatePrevention:
      compiled.contracts.duplicatePrevention.receipt.contractIdHex,
    sourceLock: compiled.contracts.sourceLock.receipt.contractIdHex,
    pooledReserve: compiled.contracts.pooledReserve.receipt.contractIdHex,
  };
  if (
    runtimeProfile.compiledBinding.lineageProfileIdHex
      !== compiled.lineageProfileIdHex
    || runtimeProfile.compiledBinding.encodedLineageProfileHex
      !== compiled.encodedLineageProfileHex
    || runtimeProfile.compiledBinding.applicationBindingHex
      !== compiled.application.bindingHex
    || runtimeProfile.compiledBinding.applicationBindingDigestHex
      !== compiled.application.bindingDigestHex
    || runtimeProfile.compiledBinding.runtimeProfileScaleHex
      !== compiled.application.runtimeProfileScaleHex
    || runtimeProfile.compiledBinding.runtimeProfileIdHex
      !== compiled.application.runtimeProfileIdHex
    || runtimeProfile.compiledBinding.burnApplicationBindingHex
      !== compiled.application.burnBindingHex
    || runtimeProfile.compiledBinding.burnApplicationBindingDigestHex
      !== compiled.application.burnBindingDigestHex
    || canonicalJson(runtimeProfile.compiledBinding.contractIds)
      !== canonicalJson(expectedContractIds)
  ) {
    throw new Error(
      'runtime profile does not bind the exact compiled V4 application',
    );
  }
}

function assertSameReplayLineage(
  compiled: Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>,
  historicalReplayGenesis: Readonly<
    ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet
  >,
): void {
  if (
    historicalReplayGenesis.lineage.lineageProfileIdHex
      !== compiled.lineageProfileIdHex
    || historicalReplayGenesis.lineage.encodedLineageProfileHex
      !== compiled.encodedLineageProfileHex
  ) {
    throw new Error(
      'historical replay genesis does not bind the exact compiled V4 lineage',
    );
  }
}

function assertProvisioningConsumesReplay(
  compiled: Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>,
  historicalReplayGenesis: Readonly<
    ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet
  >,
  provisioning: Readonly<
    ValidityApplicationPooledReserveProvisioningV4Packet
  >,
): void {
  if (
    provisioning.lineageProfileIdHex !== compiled.lineageProfileIdHex
    || provisioning.duplicatePreventionGenesis.mode
      !== 'historical-replay-genesis'
    || provisioning.duplicatePreventionGenesis
      .historicalReplayGenesisPacketDigestHex
      !== historicalReplayGenesis.packetDigestHex
    || provisioning.duplicatePreventionGenesis.canonicalBurnIdCount
      !== historicalReplayGenesis.duplicatePreventionGenesis
        .canonicalBurnIdsHex.length
    || provisioning.duplicatePreventionGenesis.digestHex
      !== historicalReplayGenesis.duplicatePreventionGenesis.digestHex
    || canonicalJson(
      provisioning.boxes.duplicatePrevention.additionalRegisters,
    ) !== canonicalJson(
      historicalReplayGenesis.duplicatePreventionGenesis.registers,
    )
  ) {
    throw new Error(
      'pooled-reserve V4 provisioning does not consume the historical replay genesis',
    );
  }
}

function normalizeActivationParent(
  value: PooledReserveCutoverActivationParentV4,
): ValidityApplicationPooledReserveCutoverCandidateV4['activationParent'] {
  const record = assertExactDataObject(value, [
    'sidechainIdHex',
    'nativeBlockHashHex',
    'nativeHeight',
    'nativeStateRootHex',
    'executionBlockHashHex',
    'runtimeCodeSha256Hex',
    'runtimeCodeBytes',
    'sourceAdmissionPolicyIdHex',
    'observationDigestHex',
  ], 'pooled-reserve V4 activation parent');
  return {
    sidechainIdHex: fixedHex(
      record.sidechainIdHex,
      32,
      'activation-parent sidechain ID',
    ),
    nativeBlockHashHex: nonzeroFixedHex(
      record.nativeBlockHashHex,
      32,
      'activation-parent native block hash',
    ),
    nativeHeight: canonicalUint64(
      record.nativeHeight,
      'activation-parent native height',
    ).toString(),
    nativeStateRootHex: nonzeroFixedHex(
      record.nativeStateRootHex,
      32,
      'activation-parent state root',
    ),
    executionBlockHashHex: nonzeroFixedHex(
      record.executionBlockHashHex,
      32,
      'activation-parent execution block hash',
    ),
    runtimeCodeSha256Hex: nonzeroFixedHex(
      record.runtimeCodeSha256Hex,
      32,
      'activation-parent runtime-code digest',
    ),
    runtimeCodeBytes: positiveUint32(
      record.runtimeCodeBytes,
      'activation-parent runtime-code size',
    ),
    sourceAdmissionPolicyIdHex: nonzeroFixedHex(
      record.sourceAdmissionPolicyIdHex,
      32,
      'activation-parent source-admission policy ID',
    ),
    observationDigestHex: nonzeroFixedHex(
      record.observationDigestHex,
      32,
      'activation-parent observation digest',
    ),
  };
}

function normalizeLegacyRouteDeclarations(
  value: readonly LegacyRouteRetirementDeclarationV4[],
): readonly LegacyRouteRetirementDeclarationV4[] {
  if (!Array.isArray(value)) {
    throw new Error('legacy route retirement declarations must be an array');
  }
  const requirementById = new Map(
    VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4.map(
      requirement => [requirement.routeId, requirement],
    ),
  );
  const seen = new Set<string>();
  const declarations = value.map((entry, index) => {
    const record = assertExactDataObject(entry, [
      'routeId',
      'declaredDisposition',
      'declaredStatus',
      'inventoryEvidenceDigestHex',
      'retirementEvidenceDigestHex',
    ], `legacy route retirement declaration ${index}`);
    const routeId = nonemptyAscii(
      record.routeId,
      `legacy route retirement declaration ${index} route ID`,
    );
    const requirement = requirementById.get(routeId);
    if (requirement === undefined) {
      throw new Error(`unknown legacy route retirement declaration ${routeId}`);
    }
    if (seen.has(routeId)) {
      throw new Error(`duplicate legacy route retirement declaration ${routeId}`);
    }
    seen.add(routeId);
    if (record.declaredDisposition !== requirement.requiredDisposition) {
      throw new Error(
        `legacy route ${routeId} uses the wrong retirement disposition`,
      );
    }
    if (record.declaredStatus !== 'inactive-unverified') {
      throw new Error(
        `legacy route ${routeId} remains active or has an unknown status`,
      );
    }
    return {
      routeId,
      declaredDisposition: requirement.requiredDisposition,
      declaredStatus: 'inactive-unverified' as const,
      inventoryEvidenceDigestHex: nonzeroFixedHex(
        record.inventoryEvidenceDigestHex,
        32,
        `legacy route ${routeId} inventory-evidence digest`,
      ),
      retirementEvidenceDigestHex: nonzeroFixedHex(
        record.retirementEvidenceDigestHex,
        32,
        `legacy route ${routeId} retirement-evidence digest`,
      ),
    };
  });
  const missing = [...requirementById.keys()].filter(routeId =>
    !seen.has(routeId)
  );
  if (missing.length > 0) {
    throw new Error(
      `legacy route retirement declarations omit ${missing.join(', ')}`,
    );
  }
  return deepFreeze(declarations.sort((left, right) =>
    left.routeId.localeCompare(right.routeId)
  ));
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
    throw new Error(`${label} must be a plain data object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
  return value as Record<string, unknown>;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (
    normalized.length !== bytes * 2
    || !/^[0-9a-f]+$/.test(normalized)
  ) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return normalized;
}

function nonzeroFixedHex(
  value: unknown,
  bytes: number,
  label: string,
): string {
  const normalized = fixedHex(value, bytes, label);
  if (/^0+$/.test(normalized)) {
    throw new Error(`${label} must be nonzero`);
  }
  return normalized;
}

function canonicalUint64(value: unknown, label: string): bigint {
  if (
    typeof value !== 'string'
    && typeof value !== 'number'
    && typeof value !== 'bigint'
  ) {
    throw new Error(`${label} must fit uint64`);
  }
  if (
    typeof value === 'number'
    && (!Number.isSafeInteger(value) || value < 0)
  ) {
    throw new Error(`${label} must fit uint64`);
  }
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(`${label} must fit uint64`);
  }
  if (parsed < 0n || parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`${label} must fit uint64`);
  }
  return parsed;
}

function positiveUint32(value: unknown, label: string): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value <= 0
    || value > 0xffff_ffff
  ) {
    throw new Error(`${label} must be a positive uint32`);
  }
  return value;
}

function nonemptyAscii(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || !Buffer.from(value, 'utf8').equals(Buffer.from(value, 'ascii'))
  ) {
    throw new Error(`${label} must be non-empty ASCII`);
  }
  return value;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (
    value === null
    || typeof value !== 'object'
    || seen.has(value as object)
  ) {
    return value as Readonly<T>;
  }
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
