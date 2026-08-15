import { getDupTreeDigest } from './avl-bridge.js';
import {
  assertSubstrateFederatedGenesisObservationV1Provenance,
  observeSubstrateFederatedGenesisV1,
  revalidateSubstrateFederatedGenesisBoxObservationV1,
  type SubstrateFederatedGenesisBoxObservationV1,
  type SubstrateFederatedGenesisObservationV1,
  type SubstrateFederatedGenesisTargetProfileV1,
} from './substrate-federated-genesis-observation-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetGenerationTargetV1,
  type SubstrateFederatedIsolatedDevnetGenerationV1,
} from './substrate-federated-isolated-devnet-generation-v1.js';
import {
  materializeSubstrateFederatedIsolatedDevnetProvisioningCoreV1,
  type SubstrateFederatedIsolatedDevnetProvisioningV1,
} from './substrate-federated-isolated-devnet-provisioning-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetSettlementTargetV2Provenance,
  type SubstrateFederatedIsolatedDevnetSettlementTargetV2,
} from './substrate-federated-isolated-devnet-settlement-target-v2.js';
import { canonicalNodeOrigin } from './ergo-node-endpoint-alignment.js';
import { sha256CanonicalJson } from './strict-json.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LOCAL_PROVISIONING_V2_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-local-provisioning.v2' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LOCAL_PROVISIONING_V2_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LOCAL_PROVISIONING_V2' as const;

const LOCAL_LAUNCH_INTENT_V2_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LOCAL_LAUNCH_INTENT_V2';
const MAX_FRESH_OBSERVATION_AGE_MS = 60_000;
const localProvisionings = new WeakSet<object>();
const localProvisioningCheckTargets = new WeakMap<
  object,
  SubstrateFederatedIsolatedDevnetLocalCheckTargetV2
>();
const localProvisioningObservationProfiles = new WeakMap<
  object,
  Readonly<SubstrateFederatedGenesisTargetProfileV1>
>();

export interface SubstrateFederatedIsolatedDevnetLocalCheckTargetV2 {
  readonly environment: 'devnet' | 'patched-devnet';
  readonly nodeReportedNetwork: 'devnet';
  readonly genesisHeaderIdHex: string;
  readonly primary: Readonly<{
    readonly nodeOrigin: string;
    readonly sourceIdHex: string;
  }>;
  readonly witness: Readonly<{
    readonly nodeOrigin: string;
    readonly sourceIdHex: string;
  }>;
}

export interface BuildSubstrateFederatedIsolatedDevnetLocalProvisioningV2Input {
  readonly settlementTarget:
    Readonly<SubstrateFederatedIsolatedDevnetSettlementTargetV2>;
  readonly settlementTargetProfile:
    Readonly<SubstrateFederatedGenesisTargetProfileV1>;
  readonly freshSettlementObservation:
    Readonly<SubstrateFederatedGenesisObservationV1>;
}

export interface SubstrateFederatedIsolatedDevnetLocalProvisioningV2 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LOCAL_PROVISIONING_V2_SCHEMA;
  readonly version: 2;
  readonly status: 'fresh_observation_bound_non_authorizing_local_provisioning';
  readonly planDigestHex: string;
  readonly launchIntentIdHex: string;
  readonly target: Readonly<{
    readonly settlementTargetDigestHex: string;
    readonly sourceAndCompilerClosureDigestHex: string;
    readonly compatibilityTargetV1AuditDigestHex: string;
    readonly sourceNetworkScope: 'isolated-devnet';
    readonly trustModel: 'federated_non_trustless';
    readonly settlementNetworkScope: 'ergo-local-devnet';
    readonly profileIdHex: string;
    readonly profileDigestHex: string;
  }>;
  readonly freshObservation: Readonly<{
    readonly retainedReportDigestHex: string;
    readonly reportDigestHex: string;
    readonly observedAt: string;
    readonly maxAgeMs: typeof MAX_FRESH_OBSERVATION_AGE_MS;
    readonly preSetupAnchor: Readonly<{
      readonly headerIdHex: string;
      readonly height: number;
    }>;
    readonly boxes: Readonly<{
      readonly tracker: Readonly<ObservedInputIdentityV2>;
      readonly duplicatePrevention: Readonly<ObservedInputIdentityV2>;
      readonly pooledReserve: Readonly<ObservedInputIdentityV2>;
    }>;
  }>;
  readonly globalReplay: Readonly<{
    readonly canonicalBurnIdsHex: readonly [];
    readonly canonicalBurnIdCount: 0;
    readonly duplicatePreventionDigestHex: string;
    readonly derivation: 'empty-new-local-profile-intent';
    readonly predecessorNonInstantiationAuthenticated: false;
  }>;
  readonly genesisPayloads:
    SubstrateFederatedIsolatedDevnetGenerationV1['target']['genesisPayloads'];
  readonly genesisInputs:
    SubstrateFederatedIsolatedDevnetProvisioningV1['genesisInputs'];
  readonly provisioning:
    SubstrateFederatedIsolatedDevnetProvisioningV1['provisioning'];
  readonly checks: Readonly<{
    readonly sameProcessSettlementTargetVerified: true;
    readonly sameProcessFreshObservationVerified: true;
    readonly observationStrictlyNewerThanTargetSnapshot: true;
    readonly localClockFreshnessWindowVerified: true;
    readonly exactLocalDevnetProfileAndGenesisMatched: true;
    readonly exactCanonicalBoxEvidenceRevalidated: true;
    readonly exactThreeInputsObservedInCurrentUtxoView: true;
    readonly exactThreeInputsMatchedCompiledLineages: true;
    readonly emptyReplayRootDerivedInternally: true;
    readonly exactGenesisPayloadsMaterialized: true;
    readonly exactUnsignedProvisioningIdentitiesBound: true;
    readonly retainedSnapshotAcceptedForMaterialization: false;
    readonly copiedTargetOrObservationAccepted: false;
  }>;
  readonly execution: Readonly<{
    readonly networkAccessPerformed: false;
    readonly runtimeDatabaseOpened: false;
    readonly deploymentStateOpened: false;
    readonly signerOrWalletMaterialRead: false;
    readonly nodeCheckPerformed: false;
    readonly signedTransactionConstructed: false;
    readonly submissionPerformed: false;
    readonly broadcastPerformed: false;
  }>;
  readonly boundaries: Readonly<{
    readonly localCompatibilityIntentOnly: true;
    readonly currentGenesisInputsObservedUnspent: true;
    readonly tipUtxoAtomicityProved: false;
    readonly compatibilityTargetV1DigestAuthorizesSettlementNetwork: false;
    readonly retainedObservationAuthorizesMaterialization: false;
    readonly localClockAuthenticatesErgoConsensus: false;
    readonly sourceControlledProfileApprovalAuthenticated: false;
    readonly independentNodeAdministrationEstablished: false;
    readonly ergoConsensusIndependentlyAuthenticated: false;
    readonly sourceConsensusIndependentlyAuthenticated: false;
    readonly sourceFinalityAuthenticated: false;
    readonly predecessorRouteNonInstantiationAuthenticated: false;
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

interface ObservedInputIdentityV2 {
  readonly boxIdHex: string;
  readonly sigmaSerializedSha256Hex: string;
}

export async function buildSubstrateFederatedIsolatedDevnetLocalProvisioningV2(
  input: Readonly<
    BuildSubstrateFederatedIsolatedDevnetLocalProvisioningV2Input
  >,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetLocalProvisioningV2>> {
  const captured = exactDataRecord(input, [
    'settlementTarget',
    'settlementTargetProfile',
    'freshSettlementObservation',
  ], 'isolated local provisioning input');
  const settlementTarget = captured.settlementTarget as Readonly<
    SubstrateFederatedIsolatedDevnetSettlementTargetV2
  >;
  const settlementTargetProfile = captured.settlementTargetProfile as Readonly<
    SubstrateFederatedGenesisTargetProfileV1
  >;
  const freshObservation = captured.freshSettlementObservation as Readonly<
    SubstrateFederatedGenesisObservationV1
  >;
  assertSubstrateFederatedIsolatedDevnetSettlementTargetV2Provenance(
    settlementTarget,
  );
  assertSubstrateFederatedGenesisObservationV1Provenance(
    settlementTargetProfile,
    freshObservation,
  );
  assertTargetProfileAndObservation(
    settlementTarget,
    settlementTargetProfile,
    freshObservation,
  );
  const freshObservedAt = canonicalTimestamp(
    freshObservation.observedAt,
    'fresh local-settlement observation time',
  );
  const retainedObservedAt = canonicalTimestamp(
    settlementTarget.settlementNetwork.observation.observedAt,
    'retained local-settlement observation time',
  );
  if (
    freshObservation.reportDigestHex
      === settlementTarget.settlementNetwork.observation.reportDigestHex
    || Date.parse(freshObservedAt) <= Date.parse(retainedObservedAt)
  ) {
    throw new Error(
      'isolated local provisioning requires an observation newer than the retained target snapshot',
    );
  }
  assertFreshObservationAge(freshObservedAt);

  const [trackerObservation, duplicatePreventionObservation, reserveObservation]
    = await Promise.all([
      revalidateSubstrateFederatedGenesisBoxObservationV1(
        freshObservation.boxes.tracker,
        settlementTarget.lineages.tracker.genesisInputBoxIdHex,
        'tracker',
        freshObservation.target.tipHeight,
      ),
      revalidateSubstrateFederatedGenesisBoxObservationV1(
        freshObservation.boxes.duplicatePrevention,
        settlementTarget.lineages.duplicatePrevention.genesisInputBoxIdHex,
        'duplicate-prevention',
        freshObservation.target.tipHeight,
      ),
      revalidateSubstrateFederatedGenesisBoxObservationV1(
        freshObservation.boxes.pooledReserve,
        settlementTarget.lineages.pooledReserve.genesisInputBoxIdHex,
        'pooled-reserve',
        freshObservation.target.tipHeight,
      ),
    ]);
  const observedBoxes = {
    tracker: observedInputIdentity(trackerObservation),
    duplicatePrevention:
      observedInputIdentity(duplicatePreventionObservation),
    pooledReserve: observedInputIdentity(reserveObservation),
  };
  const emptyReplayDigestHex = fixedHex(
    getDupTreeDigest([]),
    33,
    'isolated local empty replay digest',
  );
  const generationTarget =
    buildSubstrateFederatedIsolatedDevnetGenerationTargetV1(
      settlementTarget,
      emptyReplayDigestHex,
    );
  const provisioningCore =
    await materializeSubstrateFederatedIsolatedDevnetProvisioningCoreV1({
      genesisInputs: {
        tracker: trackerObservation.box,
        duplicatePrevention: duplicatePreventionObservation.box,
        pooledReserve: reserveObservation.box,
      },
      lineages: generationTarget.lineages,
      genesisPayloads: generationTarget.genesisPayloads,
      creationHeight: freshObservation.target.tipHeight,
      inputMode: 'fresh-current',
    });
  const preSetupAnchor = {
    headerIdHex: fixedHex(
      freshObservation.target.tipHeaderIdHex,
      32,
      'fresh local-settlement tip header ID',
    ),
    height: positiveSafeInteger(
      freshObservation.target.tipHeight,
      'fresh local-settlement tip height',
    ),
  };
  const launchIntentIdHex = sha256CanonicalJson({
    settlementTargetDigestHex: settlementTarget.descriptorDigestHex,
    freshObservationDigestHex: freshObservation.reportDigestHex,
    preSetupAnchor,
    genesisPayloadSetDigestHex:
      generationTarget.genesisPayloads.payloadSetDigestHex,
    provisioningIdentitySetDigestHex:
      provisioningCore.provisioning.identitySetDigestHex,
  }, LOCAL_LAUNCH_INTENT_V2_DIGEST_DOMAIN);
  assertFreshObservationAge(freshObservedAt);
  const localCheckTarget = buildExactLocalCheckTarget(
    settlementTarget,
    freshObservation,
  );
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LOCAL_PROVISIONING_V2_SCHEMA,
    version: 2 as const,
    status:
      'fresh_observation_bound_non_authorizing_local_provisioning' as const,
    launchIntentIdHex,
    target: {
      settlementTargetDigestHex: settlementTarget.descriptorDigestHex,
      sourceAndCompilerClosureDigestHex:
        settlementTarget.sourceAndCompilerClosureDigestHex,
      compatibilityTargetV1AuditDigestHex:
        settlementTarget.compatibilityTargetV1AuditDigestHex,
      sourceNetworkScope: settlementTarget.sourceNetworkScope,
      trustModel: settlementTarget.trustModel,
      settlementNetworkScope: settlementTarget.settlementNetwork.scope,
      profileIdHex: settlementTarget.settlementNetwork.profileIdHex,
      profileDigestHex: settlementTarget.settlementNetwork.profileDigestHex,
    },
    freshObservation: {
      retainedReportDigestHex:
        settlementTarget.settlementNetwork.observation.reportDigestHex,
      reportDigestHex: fixedHex(
        freshObservation.reportDigestHex,
        32,
        'fresh local-settlement observation digest',
      ),
      observedAt: freshObservedAt,
      maxAgeMs: MAX_FRESH_OBSERVATION_AGE_MS as
        typeof MAX_FRESH_OBSERVATION_AGE_MS,
      preSetupAnchor,
      boxes: observedBoxes,
    },
    globalReplay: {
      canonicalBurnIdsHex: deepFreeze([] as []),
      canonicalBurnIdCount: 0 as const,
      duplicatePreventionDigestHex: emptyReplayDigestHex,
      derivation: 'empty-new-local-profile-intent' as const,
      predecessorNonInstantiationAuthenticated: false as const,
    },
    genesisPayloads: generationTarget.genesisPayloads,
    genesisInputs: provisioningCore.genesisInputs,
    provisioning: provisioningCore.provisioning,
    checks: {
      sameProcessSettlementTargetVerified: true as const,
      sameProcessFreshObservationVerified: true as const,
      observationStrictlyNewerThanTargetSnapshot: true as const,
      localClockFreshnessWindowVerified: true as const,
      exactLocalDevnetProfileAndGenesisMatched: true as const,
      exactCanonicalBoxEvidenceRevalidated: true as const,
      exactThreeInputsObservedInCurrentUtxoView: true as const,
      exactThreeInputsMatchedCompiledLineages: true as const,
      emptyReplayRootDerivedInternally: true as const,
      exactGenesisPayloadsMaterialized: true as const,
      exactUnsignedProvisioningIdentitiesBound: true as const,
      retainedSnapshotAcceptedForMaterialization: false as const,
      copiedTargetOrObservationAccepted: false as const,
    },
    execution: falseExecution(),
    boundaries: fixedBoundaries(),
  };
  const result = deepFreeze({
    ...body,
    planDigestHex: sha256CanonicalJson(
      body,
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LOCAL_PROVISIONING_V2_DIGEST_DOMAIN,
    ),
  });
  localProvisionings.add(result);
  localProvisioningCheckTargets.set(result, localCheckTarget);
  localProvisioningObservationProfiles.set(result, settlementTargetProfile);
  return result;
}

export function assertSubstrateFederatedIsolatedDevnetLocalProvisioningV2Provenance(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetLocalProvisioningV2
> {
  if (
    value === null
    || typeof value !== 'object'
    || !localProvisionings.has(value)
  ) {
    throw new Error(
      'isolated local provisioning was not built in this process',
    );
  }
  const plan = value as SubstrateFederatedIsolatedDevnetLocalProvisioningV2;
  const { planDigestHex, ...body } = plan;
  if (
    plan.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LOCAL_PROVISIONING_V2_SCHEMA
    || plan.version !== 2
    || sha256CanonicalJson(
      body,
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LOCAL_PROVISIONING_V2_DIGEST_DOMAIN,
    ) !== planDigestHex
  ) {
    throw new Error('isolated local provisioning content drifted');
  }
}

export function getSubstrateFederatedIsolatedDevnetLocalCheckTargetV2(
  plan: Readonly<SubstrateFederatedIsolatedDevnetLocalProvisioningV2>,
): Readonly<SubstrateFederatedIsolatedDevnetLocalCheckTargetV2> {
  assertSubstrateFederatedIsolatedDevnetLocalProvisioningV2Provenance(plan);
  const target = localProvisioningCheckTargets.get(plan);
  if (target === undefined) {
    throw new Error('isolated local provisioning check target is unavailable');
  }
  return target;
}

export async function reobserveSubstrateFederatedIsolatedDevnetLocalProvisioningV2(
  plan: Readonly<SubstrateFederatedIsolatedDevnetLocalProvisioningV2>,
): Promise<Readonly<SubstrateFederatedGenesisObservationV1>> {
  assertSubstrateFederatedIsolatedDevnetLocalProvisioningV2Provenance(plan);
  const profile = localProvisioningObservationProfiles.get(plan);
  if (profile === undefined) {
    throw new Error(
      'isolated local provisioning observation profile is unavailable',
    );
  }
  const observation = await observeSubstrateFederatedGenesisV1(profile);
  assertSubstrateFederatedGenesisObservationV1Provenance(
    profile,
    observation,
  );
  return observation;
}

function assertTargetProfileAndObservation(
  target: Readonly<SubstrateFederatedIsolatedDevnetSettlementTargetV2>,
  profile: Readonly<SubstrateFederatedGenesisTargetProfileV1>,
  observation: Readonly<SubstrateFederatedGenesisObservationV1>,
): void {
  if (
    target.settlementNetwork.scope !== 'ergo-local-devnet'
    || target.settlementNetwork.nodeReportedNetwork !== 'devnet'
    || profile.expectedNetwork !== 'devnet'
    || observation.target.network !== 'devnet'
    || profile.profileIdHex !== target.settlementNetwork.profileIdHex
    || profile.profileDigestHex !== target.settlementNetwork.profileDigestHex
    || profile.environment !== target.settlementNetwork.environment
    || profile.expectedGenesisHeaderIdHex
      !== target.settlementNetwork.genesisHeader.idHex
    || observation.target.genesisHeaderHeight !== 1
    || observation.target.genesisHeaderIdHex
      !== target.settlementNetwork.genesisHeader.idHex
  ) {
    throw new Error(
      'isolated local provisioning profile or genesis differs from the exact V2 target',
    );
  }
  if (
    observation.status !== 'AGREED'
    || observation.boundary.revalidationRequiredBeforeMaterialization !== true
    || !Object.values(observation.agreement).every(value => value === true)
  ) {
    throw new Error(
      'isolated local provisioning requires an agreed revalidation observation',
    );
  }
}

function buildExactLocalCheckTarget(
  target: Readonly<SubstrateFederatedIsolatedDevnetSettlementTargetV2>,
  observation: Readonly<SubstrateFederatedGenesisObservationV1>,
): Readonly<SubstrateFederatedIsolatedDevnetLocalCheckTargetV2> {
  const primaryOrigin = canonicalLoopbackNodeOrigin(
    observation.sources.primary.endpointOrigin,
    'isolated local primary node origin',
  );
  const witnessOrigin = canonicalLoopbackNodeOrigin(
    observation.sources.witness.endpointOrigin,
    'isolated local witness node origin',
  );
  if (primaryOrigin === witnessOrigin) {
    throw new Error('isolated local check target requires distinct node origins');
  }
  return deepFreeze({
    environment: target.settlementNetwork.environment,
    nodeReportedNetwork: target.settlementNetwork.nodeReportedNetwork,
    genesisHeaderIdHex: target.settlementNetwork.genesisHeader.idHex,
    primary: {
      nodeOrigin: primaryOrigin,
      sourceIdHex: fixedHex(
        observation.sources.primary.sourceIdHex,
        32,
        'isolated local primary source ID',
      ),
    },
    witness: {
      nodeOrigin: witnessOrigin,
      sourceIdHex: fixedHex(
        observation.sources.witness.sourceIdHex,
        32,
        'isolated local witness source ID',
      ),
    },
  });
}

function canonicalLoopbackNodeOrigin(value: string, label: string): string {
  const canonical = canonicalNodeOrigin(value, label);
  const hostname = new URL(canonical).hostname.toLowerCase();
  if (
    canonical !== value
    || !['127.0.0.1', '[::1]', '::1'].includes(hostname)
  ) {
    throw new Error(`${label} must be an exact canonical loopback origin`);
  }
  return canonical;
}

function observedInputIdentity(
  observation: Readonly<SubstrateFederatedGenesisBoxObservationV1>,
): Readonly<ObservedInputIdentityV2> {
  const boxIdHex = fixedHex(
    observation.box.boxId,
    32,
    `${observation.role} observed box ID`,
  );
  const sigmaSerializedSha256Hex = fixedHex(
    observation.sigmaSerializedSha256Hex,
    32,
    `${observation.role} canonical Sigma-box digest`,
  );
  return Object.freeze({ boxIdHex, sigmaSerializedSha256Hex });
}

function falseExecution(): SubstrateFederatedIsolatedDevnetLocalProvisioningV2['execution'] {
  return Object.freeze({
    networkAccessPerformed: false as const,
    runtimeDatabaseOpened: false as const,
    deploymentStateOpened: false as const,
    signerOrWalletMaterialRead: false as const,
    nodeCheckPerformed: false as const,
    signedTransactionConstructed: false as const,
    submissionPerformed: false as const,
    broadcastPerformed: false as const,
  });
}

function fixedBoundaries(): SubstrateFederatedIsolatedDevnetLocalProvisioningV2['boundaries'] {
  return Object.freeze({
    localCompatibilityIntentOnly: true as const,
    currentGenesisInputsObservedUnspent: true as const,
    tipUtxoAtomicityProved: false as const,
    compatibilityTargetV1DigestAuthorizesSettlementNetwork: false as const,
    retainedObservationAuthorizesMaterialization: false as const,
    localClockAuthenticatesErgoConsensus: false as const,
    sourceControlledProfileApprovalAuthenticated: false as const,
    independentNodeAdministrationEstablished: false as const,
    ergoConsensusIndependentlyAuthenticated: false as const,
    sourceConsensusIndependentlyAuthenticated: false as const,
    sourceFinalityAuthenticated: false as const,
    predecessorRouteNonInstantiationAuthenticated: false as const,
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

function canonicalTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a canonical ISO-8601 timestamp`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO-8601 timestamp`);
  }
  return value;
}

function assertFreshObservationAge(observedAt: string): void {
  const observationAgeMs = Date.now() - Date.parse(observedAt);
  if (observationAgeMs < 0 || observationAgeMs > MAX_FRESH_OBSERVATION_AGE_MS) {
    throw new Error(
      'isolated local provisioning requires a fresh observation within the fixed local clock window',
    );
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)
  ) {
    throw new Error(`${label} must be canonical lowercase ${bytes}-byte hex`);
  }
  return value;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value as number;
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

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
