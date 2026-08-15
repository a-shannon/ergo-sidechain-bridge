import {
  assertSubstrateFederatedGenesisObservationV1Provenance,
  type SubstrateFederatedGenesisObservationV1,
  type SubstrateFederatedGenesisTargetProfileV1,
} from './substrate-federated-genesis-observation-v1.js';
import {
  deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1,
  type DeriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1Input,
  type SubstrateFederatedIsolatedDevnetTargetDescriptorV1,
} from './substrate-federated-isolated-devnet-launch-v1.js';
import { sha256CanonicalJson } from './strict-json.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETTLEMENT_TARGET_V2_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-settlement-target.v2' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETTLEMENT_TARGET_V2_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETTLEMENT_TARGET_V2' as const;
const SOURCE_AND_COMPILER_CLOSURE_V2_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_AND_COMPILER_CLOSURE_V2';

type SourceAndCompilerClosureV1 = Omit<
  SubstrateFederatedIsolatedDevnetTargetDescriptorV1,
  'schema' | 'version' | 'descriptorDigestHex' | 'settlementNetworkId'
>;

export interface BuildSubstrateFederatedIsolatedDevnetSettlementTargetV2Input
  extends DeriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1Input {
  readonly settlementTargetProfile:
    Readonly<SubstrateFederatedGenesisTargetProfileV1>;
  readonly settlementObservation:
    Readonly<SubstrateFederatedGenesisObservationV1>;
}

export interface SubstrateFederatedIsolatedDevnetSettlementTargetV2
  extends SourceAndCompilerClosureV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETTLEMENT_TARGET_V2_SCHEMA;
  readonly version: 2;
  readonly descriptorDigestHex: string;
  readonly compatibilityTargetV1AuditDigestHex: string;
  readonly sourceAndCompilerClosureDigestHex: string;
  readonly settlementNetwork: Readonly<{
    readonly scope: 'ergo-local-devnet';
    readonly nodeReportedNetwork: 'devnet';
    readonly environment: 'devnet' | 'patched-devnet';
    readonly profileIdHex: string;
    readonly profileDigestHex: string;
    readonly observation: Readonly<{
      readonly reportDigestHex: string;
      readonly observedAt: string;
      readonly revalidationRequiredBeforeMaterialization: true;
    }>;
    readonly genesisHeader: Readonly<{
      readonly idHex: string;
      readonly height: 1;
    }>;
    readonly observedTip: Readonly<{
      readonly idHex: string;
      readonly height: number;
    }>;
    readonly genesisInputs: Readonly<{
      readonly trackerBoxIdHex: string;
      readonly duplicatePreventionBoxIdHex: string;
      readonly pooledReserveBoxIdHex: string;
    }>;
  }>;
  readonly settlementChecks: Readonly<{
    readonly sameProcessDualOriginObservationVerified: true;
    readonly exactLocalDevnetNetworkMatched: true;
    readonly exactGenesisHeaderMatchedProfile: true;
    readonly exactThreeGenesisInputsMatchedCompiledLineages: true;
    readonly pureErgRegisterFreeInputsObservedAtSnapshot: true;
  }>;
  readonly materializationBoundary: Readonly<{
    readonly retainedObservationAuthorizesMaterialization: false;
    readonly freshSameProcessObservationRequired: true;
    readonly exactCanonicalEip12AndSigmaBoxesRequired: true;
    readonly genesisInputsMustRemainInCurrentUtxoView: true;
  }>;
  readonly settlementBoundaries: Readonly<{
    readonly compatibilityTargetV1DigestAuthorizesSettlementNetwork: false;
    readonly sourceControlledProfileApprovalAuthenticated: false;
    readonly declaredSourceIdentitiesObservedFromNodes: false;
    readonly independentNodeAdministrationEstablished: false;
    readonly ergoConsensusIndependentlyAuthenticated: false;
    readonly setupLineagesEstablished: false;
    readonly setupTransactionsChecked: false;
    readonly setupTransactionsSigned: false;
    readonly setupTransactionsSubmitted: false;
    readonly setupTransactionsBroadcast: false;
    readonly profileActivated: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

const settlementTargets = new WeakSet<object>();

/**
 * Rebinds the existing source/compiler closure to one observed local Ergo
 * devnet without reinterpreting the V1 `ergo-testnet` network field.
 */
export function buildSubstrateFederatedIsolatedDevnetSettlementTargetV2(
  input: Readonly<BuildSubstrateFederatedIsolatedDevnetSettlementTargetV2Input>,
): Readonly<SubstrateFederatedIsolatedDevnetSettlementTargetV2> {
  const record = exactDataRecord(input, [
    'trackerRequest',
    'trackerReceipt',
    'familyTemplates',
    'familyReceipt',
    'historyBundle',
    'trustPins',
    'settlementTargetProfile',
    'settlementObservation',
  ], 'isolated local-settlement target input');
  const settlementTargetProfile = record.settlementTargetProfile as Readonly<
    SubstrateFederatedGenesisTargetProfileV1
  >;
  const settlementObservation = record.settlementObservation as Readonly<
    SubstrateFederatedGenesisObservationV1
  >;
  assertSubstrateFederatedGenesisObservationV1Provenance(
    settlementTargetProfile,
    settlementObservation,
  );
  if (
    settlementTargetProfile.expectedNetwork !== 'devnet'
    || settlementObservation.target.network !== 'devnet'
  ) {
    throw new Error(
      'isolated local-settlement target requires an exact devnet observation',
    );
  }
  if (
    settlementTargetProfile.environment !== 'devnet'
    && settlementTargetProfile.environment !== 'patched-devnet'
  ) {
    throw new Error(
      'isolated local-settlement target requires a devnet environment',
    );
  }
  if (
    settlementObservation.boundary.revalidationRequiredBeforeMaterialization
      !== true
  ) {
    throw new Error(
      'isolated local-settlement observation must require revalidation before materialization',
    );
  }

  const sourceAndCompilerTarget =
    deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1({
      trackerRequest: record.trackerRequest as BuildSubstrateFederatedIsolatedDevnetSettlementTargetV2Input['trackerRequest'],
      trackerReceipt: record.trackerReceipt as BuildSubstrateFederatedIsolatedDevnetSettlementTargetV2Input['trackerReceipt'],
      familyTemplates: record.familyTemplates as BuildSubstrateFederatedIsolatedDevnetSettlementTargetV2Input['familyTemplates'],
      familyReceipt: record.familyReceipt as BuildSubstrateFederatedIsolatedDevnetSettlementTargetV2Input['familyReceipt'],
      historyBundle: record.historyBundle as BuildSubstrateFederatedIsolatedDevnetSettlementTargetV2Input['historyBundle'],
      trustPins: record.trustPins as BuildSubstrateFederatedIsolatedDevnetSettlementTargetV2Input['trustPins'],
    });
  const observedGenesisInputs = {
    trackerBoxIdHex: fixedHex(
      settlementObservation.boxes.tracker.box.boxId,
      'observed tracker genesis input',
    ),
    duplicatePreventionBoxIdHex: fixedHex(
      settlementObservation.boxes.duplicatePrevention.box.boxId,
      'observed duplicate-prevention genesis input',
    ),
    pooledReserveBoxIdHex: fixedHex(
      settlementObservation.boxes.pooledReserve.box.boxId,
      'observed pooled-reserve genesis input',
    ),
  };
  const expectedGenesisInputs = {
    trackerBoxIdHex:
      sourceAndCompilerTarget.lineages.tracker.genesisInputBoxIdHex,
    duplicatePreventionBoxIdHex:
      sourceAndCompilerTarget.lineages.duplicatePrevention.genesisInputBoxIdHex,
    pooledReserveBoxIdHex:
      sourceAndCompilerTarget.lineages.pooledReserve.genesisInputBoxIdHex,
  };
  if (
    observedGenesisInputs.trackerBoxIdHex
      !== expectedGenesisInputs.trackerBoxIdHex
    || observedGenesisInputs.duplicatePreventionBoxIdHex
      !== expectedGenesisInputs.duplicatePreventionBoxIdHex
    || observedGenesisInputs.pooledReserveBoxIdHex
      !== expectedGenesisInputs.pooledReserveBoxIdHex
  ) {
    throw new Error(
      'isolated local-settlement genesis inputs differ from the compiled target lineages',
    );
  }

  const {
    schema: _sourceSchema,
    version: _sourceVersion,
    descriptorDigestHex: compatibilityTargetV1AuditDigestHex,
    settlementNetworkId: _sourceSettlementNetworkId,
    ...sourceAndCompilerClosure
  } = sourceAndCompilerTarget;
  const sourceAndCompilerClosureDigestHex = sha256CanonicalJson(
    sourceAndCompilerClosure,
    SOURCE_AND_COMPILER_CLOSURE_V2_DIGEST_DOMAIN,
  );
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETTLEMENT_TARGET_V2_SCHEMA,
    version: 2 as const,
    compatibilityTargetV1AuditDigestHex,
    sourceAndCompilerClosureDigestHex,
    settlementNetwork: {
      scope: 'ergo-local-devnet' as const,
      nodeReportedNetwork: 'devnet' as const,
      environment: settlementTargetProfile.environment as
        | 'devnet'
        | 'patched-devnet',
      profileIdHex: fixedHex(
        settlementTargetProfile.profileIdHex,
        'local-settlement profile ID',
      ),
      profileDigestHex: fixedHex(
        settlementTargetProfile.profileDigestHex,
        'local-settlement profile digest',
      ),
      observation: {
        reportDigestHex: fixedHex(
          settlementObservation.reportDigestHex,
          'local-settlement observation digest',
        ),
        observedAt: isoTimestamp(
          settlementObservation.observedAt,
          'local-settlement observation time',
        ),
        revalidationRequiredBeforeMaterialization: true as const,
      },
      genesisHeader: {
        idHex: fixedHex(
          settlementObservation.target.genesisHeaderIdHex,
          'observed local-settlement genesis header ID',
        ),
        height: 1 as const,
      },
      observedTip: {
        idHex: fixedHex(
          settlementObservation.target.tipHeaderIdHex,
          'observed local-settlement tip header ID',
        ),
        height: positiveSafeInteger(
          settlementObservation.target.tipHeight,
          'observed local-settlement tip height',
        ),
      },
      genesisInputs: observedGenesisInputs,
    },
    ...sourceAndCompilerClosure,
    settlementChecks: {
      sameProcessDualOriginObservationVerified: true as const,
      exactLocalDevnetNetworkMatched: true as const,
      exactGenesisHeaderMatchedProfile: true as const,
      exactThreeGenesisInputsMatchedCompiledLineages: true as const,
      pureErgRegisterFreeInputsObservedAtSnapshot: true as const,
    },
    materializationBoundary: {
      retainedObservationAuthorizesMaterialization: false as const,
      freshSameProcessObservationRequired: true as const,
      exactCanonicalEip12AndSigmaBoxesRequired: true as const,
      genesisInputsMustRemainInCurrentUtxoView: true as const,
    },
    settlementBoundaries: falseSettlementBoundaries(),
  };
  const target = deepFreeze({
    ...body,
    descriptorDigestHex: sha256CanonicalJson(
      body,
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETTLEMENT_TARGET_V2_DIGEST_DOMAIN,
    ),
  });
  settlementTargets.add(target);
  return target;
}

export function assertSubstrateFederatedIsolatedDevnetSettlementTargetV2Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetSettlementTargetV2> {
  if (
    value === null
    || typeof value !== 'object'
    || !settlementTargets.has(value)
  ) {
    throw new Error(
      'isolated local-settlement target was not built in this process',
    );
  }
  const target = value as SubstrateFederatedIsolatedDevnetSettlementTargetV2;
  const { descriptorDigestHex, ...body } = target;
  if (
    target.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETTLEMENT_TARGET_V2_SCHEMA
    || target.version !== 2
    || sha256CanonicalJson(
      body,
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETTLEMENT_TARGET_V2_DIGEST_DOMAIN,
    ) !== descriptorDigestHex
  ) {
    throw new Error('isolated local-settlement target content drifted');
  }
}

function falseSettlementBoundaries(): SubstrateFederatedIsolatedDevnetSettlementTargetV2['settlementBoundaries'] {
  return Object.freeze({
    compatibilityTargetV1DigestAuthorizesSettlementNetwork: false as const,
    sourceControlledProfileApprovalAuthenticated: false as const,
    declaredSourceIdentitiesObservedFromNodes: false as const,
    independentNodeAdministrationEstablished: false as const,
    ergoConsensusIndependentlyAuthenticated: false as const,
    setupLineagesEstablished: false as const,
    setupTransactionsChecked: false as const,
    setupTransactionsSigned: false as const,
    setupTransactionsSubmitted: false as const,
    setupTransactionsBroadcast: false as const,
    profileActivated: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
}

function isoTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be an ISO-8601 timestamp`);
  }
  const instant = new Date(value);
  if (
    !Number.isFinite(instant.getTime())
    || instant.toISOString() !== value
  ) {
    throw new Error(`${label} must be a canonical ISO-8601 timestamp`);
  }
  return value;
}

function exactDataRecord<K extends string>(
  value: unknown,
  keys: readonly K[],
  label: string,
): Record<K, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain data object`);
  }
  const actualKeys = Object.keys(value).sort(compareCodeUnits);
  const expectedKeys = [...keys].sort(compareCodeUnits);
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(`${label} fields are not exact`);
  }
  const result = Object.create(null) as Record<K, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new Error(`${label}.${key} must be an enumerable data property`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function fixedHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be lowercase 32-byte hex`);
  }
  return value;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}
