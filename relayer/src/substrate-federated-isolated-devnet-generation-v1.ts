import {
  getDupTreeDigest,
  getPooledReserveEmptyDigest,
} from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
  encodeIntRegister,
  encodeLongRegister,
} from './ergo-encoding.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';
import {
  getSubstrateFederatedTrackerDigestV1Hex,
} from './substrate-federated-burn-settlement-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetLaunchBaselineV1Provenance,
  deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1,
  type DeriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1Input,
  type SubstrateFederatedIsolatedDevnetLaunchBaselineV1,
  type SubstrateFederatedIsolatedDevnetTargetDescriptorV1,
} from './substrate-federated-isolated-devnet-launch-v1.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
} from './validity-application-pooled-reserve-instance-v4.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENERATION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-generation.v1' as const;

const GENERATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENERATION_V1';
const COMPILER_CLOSURE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_COMPILER_CLOSURE_V1';
const GENESIS_PAYLOAD_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_PAYLOAD_V1';
const GENESIS_PAYLOAD_SET_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_PAYLOAD_SET_V1';
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SINGLETON_VALUE_NANOERG =
  '10000000' as const;
const generations = new WeakSet<object>();

export interface SubstrateFederatedIsolatedDevnetGenesisPayloadV1 {
  readonly role: 'tracker' | 'duplicate-prevention' | 'pooled-reserve';
  readonly valueNanoErg:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SINGLETON_VALUE_NANOERG;
  readonly ergoTreeHex: string;
  readonly assets: readonly Readonly<{
    readonly tokenId: string;
    readonly amount: '1';
  }>[];
  readonly additionalRegisters: Readonly<Record<string, string>>;
  readonly payloadDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetGenerationV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENERATION_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'authenticated_non_authorizing_isolated_devnet_generation';
  readonly manifestDigestHex: string;
  readonly generation: Readonly<{
    readonly label: 'substrate-federated-isolated-devnet-v1';
    readonly generationIdHex: string;
    readonly settlementNetworkId: 'ergo-testnet';
    readonly sourceNetworkScope: 'isolated-devnet';
    readonly trustModel: 'federated_non_trustless';
  }>;
  readonly launchBaseline: Readonly<{
    readonly baselineDigestHex: string;
    readonly statementDigestHex: string;
    readonly attestationDigestHex: string;
    readonly signatureSetDigestHex: string;
    readonly sourceAcceptanceDigestHex: string;
    readonly sourceHistoryDigestHex: string;
    readonly ergoHistoryDigestHex: string;
    readonly relayerClosureDigestHex: string;
    readonly ergoGenesis: Readonly<{
      readonly headerIdHex: string;
      readonly height: number;
    }>;
    readonly ergoSetupAnchor: Readonly<{
      readonly headerIdHex: string;
      readonly height: number;
    }>;
  }>;
  readonly target: Readonly<{
    readonly descriptorDigestHex: string;
    readonly compilerClosureDigestHex: string;
    readonly profile: SubstrateFederatedIsolatedDevnetTargetDescriptorV1['profile'];
    readonly sourceRuntime:
      SubstrateFederatedIsolatedDevnetTargetDescriptorV1['sourceRuntime'];
    readonly federation: Readonly<{
      readonly federationProfileIdHex: string;
      readonly federationEpoch: string;
      readonly sourceAttestationKeySetDigestHex: string;
      readonly sourceAttestationThreshold: number;
      readonly ergoAdmissionKeySetDigestHex: string;
      readonly ergoAdmissionThreshold: number;
      readonly ergoAdmissionPublicKeysHex: readonly string[];
    }>;
    readonly lineages:
      SubstrateFederatedIsolatedDevnetTargetDescriptorV1['lineages'];
    readonly genesisPayloads: Readonly<{
      readonly schema:
        'e2s.substrate-federated-isolated-devnet-genesis-payloads.v1';
      readonly version: 1;
      readonly payloadSetDigestHex: string;
      readonly importedReplayDigestHex: string;
      readonly emptyTrackerDigestHex: string;
      readonly emptyDepositDigestHex: string;
      readonly tracker:
        Readonly<SubstrateFederatedIsolatedDevnetGenesisPayloadV1>;
      readonly duplicatePrevention:
        Readonly<SubstrateFederatedIsolatedDevnetGenesisPayloadV1>;
      readonly pooledReserve:
        Readonly<SubstrateFederatedIsolatedDevnetGenesisPayloadV1>;
      readonly creationHeightsBoundAtMaterialization: false;
      readonly outputIdsBoundAtMaterialization: false;
    }>;
  }>;
  readonly globalReplay: Readonly<{
    readonly sourcePacketDigestHex: string;
    readonly canonicalBurnIdsHex: readonly [];
    readonly canonicalBurnIdCount: 0;
    readonly duplicatePreventionDigestHex: string;
    readonly derivation:
      'empty-from-quorum-authenticated-isolated-non-instantiation';
  }>;
  readonly predecessorRoutes: Readonly<{
    readonly exactStaticRouteSetDigestHex: string;
    readonly boundRouteSetDigestHex: string;
    readonly routeCount: number;
    readonly routes:
      SubstrateFederatedIsolatedDevnetLaunchBaselineV1['statement']['routeCoverage']['routes'];
    readonly everyRouteNotInstantiatedUnderDisclosedQuorum: true;
  }>;
  readonly blockers: readonly string[];
  readonly checks: Readonly<{
    readonly sameProcessLaunchBaselineVerified: true;
    readonly sameProcessTrackerCompilationVerified: true;
    readonly sameProcessFamilyCompilationVerified: true;
    readonly exactTargetDescriptorMatchedCompilers: true;
    readonly exactStaticPredecessorRouteSetMatched: true;
    readonly emptyReplayRootDerivedInternally: true;
    readonly emptyReplayClaimAuthenticatedBySourceQuorum: true;
    readonly exactTargetGenesisPayloadsBound: true;
    readonly frozenGreenfieldGenerationAccepted: false;
    readonly callerNonInstantiationClaimsAccepted: false;
  }>;
  readonly boundaries: Readonly<{
    readonly isolatedDevnetLaunchBaselineAuthenticated: true;
    readonly predecessorRouteNonInstantiationAcceptedUnderFederatedTrust: true;
    readonly sourceDomainObservedInCapturedHistory: false;
    readonly sourceConsensusIndependentlyAuthenticated: false;
    readonly independentSourceAdministrationEstablished: false;
    readonly sourceFinalityAuthenticated: false;
    readonly ergoConsensusIndependentlyAuthenticated: false;
    readonly trackerLineageEstablished: false;
    readonly duplicatePreventionLineageEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly profileActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly nodeCheckPerformed: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly confirmationEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export type SubstrateFederatedIsolatedDevnetGenerationTargetSourceV1 =
  Pick<
    SubstrateFederatedIsolatedDevnetTargetDescriptorV1,
    | 'descriptorDigestHex'
    | 'compiler'
    | 'profile'
    | 'sourceRuntime'
    | 'federation'
    | 'lineages'
  >;

export interface BuildSubstrateFederatedIsolatedDevnetGenerationV1Input
  extends DeriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1Input {
  readonly launchBaseline:
    Readonly<SubstrateFederatedIsolatedDevnetLaunchBaselineV1>;
}

export function buildSubstrateFederatedIsolatedDevnetGenerationV1(
  input: Readonly<BuildSubstrateFederatedIsolatedDevnetGenerationV1Input>,
): Readonly<SubstrateFederatedIsolatedDevnetGenerationV1> {
  exactRecord(input, [
    'launchBaseline', 'trackerRequest', 'trackerReceipt', 'familyTemplates',
    'familyReceipt', 'historyBundle', 'trustPins',
  ], 'isolated-devnet generation input');
  assertSubstrateFederatedIsolatedDevnetLaunchBaselineV1Provenance(
    input.launchBaseline,
  );
  const target = deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1({
    trackerRequest: input.trackerRequest,
    trackerReceipt: input.trackerReceipt,
    familyTemplates: input.familyTemplates,
    familyReceipt: input.familyReceipt,
    historyBundle: input.historyBundle,
    trustPins: input.trustPins,
  });
  if (canonicalJson(target) !== canonicalJson(input.launchBaseline.statement.target)) {
    throw new Error(
      'isolated-devnet launch baseline target differs from the exact compiler and history closure',
    );
  }
  const importedReplayDigestHex = fixedHex(
    getDupTreeDigest([]),
    33,
    'isolated-devnet empty duplicate-prevention digest',
  );
  const targetManifest =
    buildSubstrateFederatedIsolatedDevnetGenerationTargetV1(
      target,
      importedReplayDigestHex,
    );
  const statement = input.launchBaseline.statement;
  const routeCoverage = statement.routeCoverage;
  const blockers = deepFreeze([
    'source-domain-is-not-observed-in-g1da-history',
    'source-consensus-is-not-independently-authenticated',
    'ergo-consensus-is-not-independently-authenticated',
    'federated-tracker-lineage-is-not-established',
    'federated-duplicate-prevention-lineage-is-not-established',
    'federated-reserve-lineage-is-not-established',
    'federated-genesis-creation-heights-are-not-bound',
    'federated-genesis-output-identities-are-not-bound',
    'federated-profile-is-not-activated',
    'federated-target-node-acceptance-is-not-established',
    'federated-confirmation-is-not-established',
    'federated-funds-authority-is-not-established',
  ] as const);
  const binding = {
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENERATION_V1_SCHEMA,
    version: 1 as const,
    status: 'authenticated_non_authorizing_isolated_devnet_generation' as const,
    generation: {
      label: 'substrate-federated-isolated-devnet-v1' as const,
      generationIdHex: statement.activationGenerationIdHex,
      settlementNetworkId: 'ergo-testnet' as const,
      sourceNetworkScope: 'isolated-devnet' as const,
      trustModel: 'federated_non_trustless' as const,
    },
    launchBaseline: {
      baselineDigestHex: input.launchBaseline.baselineDigestHex,
      statementDigestHex: statement.statementDigestHex,
      attestationDigestHex: statement.attestationDigestHex,
      signatureSetDigestHex: input.launchBaseline.signatureSetDigestHex,
      sourceAcceptanceDigestHex:
        statement.histories.source.acceptanceDigestHex,
      sourceHistoryDigestHex: statement.histories.source.historyDigestHex,
      ergoHistoryDigestHex: statement.histories.ergo.historyDigestHex,
      relayerClosureDigestHex: statement.histories.relayer.closureDigestHex,
      ergoGenesis: statement.histories.ergo.genesis,
      ergoSetupAnchor: statement.histories.ergo.setupAnchor,
    },
    target: targetManifest,
    globalReplay: {
      sourcePacketDigestHex: input.launchBaseline.baselineDigestHex,
      canonicalBurnIdsHex: deepFreeze([] as []),
      canonicalBurnIdCount: 0 as const,
      duplicatePreventionDigestHex: importedReplayDigestHex,
      derivation:
        'empty-from-quorum-authenticated-isolated-non-instantiation' as const,
    },
    predecessorRoutes: {
      exactStaticRouteSetDigestHex:
        routeCoverage.staticRequirementsDigestHex,
      boundRouteSetDigestHex: routeCoverage.coverageDigestHex,
      routeCount: routeCoverage.routeCount,
      routes: routeCoverage.routes,
      everyRouteNotInstantiatedUnderDisclosedQuorum: true as const,
    },
    blockers,
    checks: {
      sameProcessLaunchBaselineVerified: true as const,
      sameProcessTrackerCompilationVerified: true as const,
      sameProcessFamilyCompilationVerified: true as const,
      exactTargetDescriptorMatchedCompilers: true as const,
      exactStaticPredecessorRouteSetMatched: true as const,
      emptyReplayRootDerivedInternally: true as const,
      emptyReplayClaimAuthenticatedBySourceQuorum: true as const,
      exactTargetGenesisPayloadsBound: true as const,
      frozenGreenfieldGenerationAccepted: false as const,
      callerNonInstantiationClaimsAccepted: false as const,
    },
    boundaries: {
      isolatedDevnetLaunchBaselineAuthenticated: true as const,
      predecessorRouteNonInstantiationAcceptedUnderFederatedTrust: true as const,
      sourceDomainObservedInCapturedHistory: false as const,
      sourceConsensusIndependentlyAuthenticated: false as const,
      independentSourceAdministrationEstablished: false as const,
      sourceFinalityAuthenticated: false as const,
      ergoConsensusIndependentlyAuthenticated: false as const,
      trackerLineageEstablished: false as const,
      duplicatePreventionLineageEstablished: false as const,
      reserveLineageEstablished: false as const,
      profileActivated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      nodeCheckPerformed: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      confirmationEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const generation = deepFreeze({
    ...binding,
    manifestDigestHex: sha256CanonicalJson(binding, GENERATION_DIGEST_DOMAIN),
  });
  generations.add(generation);
  return generation;
}

export function assertSubstrateFederatedIsolatedDevnetGenerationV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetGenerationV1> {
  if (value === null || typeof value !== 'object' || !generations.has(value)) {
    throw new Error('isolated-devnet generation lacks process provenance');
  }
}

export function buildSubstrateFederatedIsolatedDevnetGenerationTargetV1(
  descriptor: Readonly<
    SubstrateFederatedIsolatedDevnetGenerationTargetSourceV1
  >,
  importedReplayDigestHex: string,
): SubstrateFederatedIsolatedDevnetGenerationV1['target'] {
  const exactImportedReplayDigestHex = fixedHex(
    importedReplayDigestHex,
    33,
    'isolated-devnet imported replay digest',
  );
  const emptyTrackerDigestHex = fixedHex(
    getSubstrateFederatedTrackerDigestV1Hex([]),
    33,
    'isolated-devnet empty tracker digest',
  );
  const emptyDepositDigestHex = fixedHex(
    getPooledReserveEmptyDigest(),
    33,
    'isolated-devnet empty deposit digest',
  );
  const lineages = descriptor.lineages;
  const tracker = targetGenesisPayload(
    'tracker',
    lineages.tracker.propositionHex,
    lineages.tracker.singletonTokenIdHex,
    {
      R4: encodeCollByteRegister(Buffer.from(
        descriptor.federation.federationProfileIdHex,
        'hex',
      )),
      R5: encodeAvlTreeRegister(
        Buffer.from(emptyTrackerDigestHex, 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
        370,
      ),
      R6: encodeCollByteRegister(Buffer.from(
        descriptor.sourceRuntime.sidechainIdHex,
        'hex',
      )),
      R7: encodeLongRegister(0n),
      R8: encodeIntRegister(0),
      R9: encodeCollByteRegister(Buffer.from(
        descriptor.federation.ergoAdmissionKeySetDigestHex,
        'hex',
      )),
    },
  );
  const familyRegister = encodeCollByteRegister(Buffer.from(
    descriptor.profile.familyIdHex,
    'hex',
  ));
  const duplicatePrevention = targetGenesisPayload(
    'duplicate-prevention',
    lineages.duplicatePrevention.propositionHex,
    lineages.duplicatePrevention.singletonTokenIdHex,
    {
      R4: familyRegister,
      R5: encodeAvlTreeRegister(
        Buffer.from(exactImportedReplayDigestHex, 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
        1,
      ),
    },
  );
  const pooledReserve = targetGenesisPayload(
    'pooled-reserve',
    lineages.pooledReserve.propositionHex,
    lineages.pooledReserve.singletonTokenIdHex,
    {
      R4: familyRegister,
      R5: encodeAvlTreeRegister(
        Buffer.from(emptyDepositDigestHex, 'hex'),
        VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
        32,
      ),
      R6: encodeLongRegister(0n),
    },
  );
  const payloadSet = { tracker, duplicatePrevention, pooledReserve };
  return deepFreeze({
    descriptorDigestHex: descriptor.descriptorDigestHex,
    compilerClosureDigestHex: sha256CanonicalJson(
      descriptor.compiler,
      COMPILER_CLOSURE_DIGEST_DOMAIN,
    ),
    profile: descriptor.profile,
    sourceRuntime: descriptor.sourceRuntime,
    federation: {
      federationProfileIdHex: descriptor.federation.federationProfileIdHex,
      federationEpoch: descriptor.federation.federationEpoch,
      sourceAttestationKeySetDigestHex:
        descriptor.federation.sourceAttestationKeySetDigestHex,
      sourceAttestationThreshold:
        descriptor.federation.sourceAttestationThreshold,
      ergoAdmissionKeySetDigestHex:
        descriptor.federation.ergoAdmissionKeySetDigestHex,
      ergoAdmissionThreshold: descriptor.federation.ergoAdmissionThreshold,
      ergoAdmissionPublicKeysHex:
        descriptor.federation.ergoAdmissionPublicKeysHex,
    },
    lineages,
    genesisPayloads: {
      schema:
        'e2s.substrate-federated-isolated-devnet-genesis-payloads.v1' as const,
      version: 1 as const,
      payloadSetDigestHex: sha256CanonicalJson(
        payloadSet,
        GENESIS_PAYLOAD_SET_DIGEST_DOMAIN,
      ),
      importedReplayDigestHex: exactImportedReplayDigestHex,
      emptyTrackerDigestHex,
      emptyDepositDigestHex,
      ...payloadSet,
      creationHeightsBoundAtMaterialization: false as const,
      outputIdsBoundAtMaterialization: false as const,
    },
  });
}

function targetGenesisPayload(
  role: SubstrateFederatedIsolatedDevnetGenesisPayloadV1['role'],
  ergoTreeHex: string,
  singletonTokenIdHex: string,
  additionalRegisters: Readonly<Record<string, string>>,
): Readonly<SubstrateFederatedIsolatedDevnetGenesisPayloadV1> {
  const body = {
    role,
    valueNanoErg:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SINGLETON_VALUE_NANOERG,
    ergoTreeHex: variableHex(ergoTreeHex, `${role} genesis ErgoTree`),
    assets: deepFreeze([{
      tokenId: fixedHex(singletonTokenIdHex, 32, `${role} singleton token ID`),
      amount: '1' as const,
    }]),
    additionalRegisters: deepFreeze({ ...additionalRegisters }),
  };
  return deepFreeze({
    ...body,
    payloadDigestHex: sha256CanonicalJson(body, GENESIS_PAYLOAD_DIGEST_DOMAIN),
  });
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Reflect.ownKeys(value);
  if (actual.some(key => typeof key !== 'string')) {
    throw new Error(`${label} keys are invalid`);
  }
  const sorted = (actual as string[]).sort(compareCodeUnits);
  const expected = [...keys].sort(compareCodeUnits);
  if (canonicalJson(sorted) !== canonicalJson(expected)) {
    throw new Error(`${label} fields are invalid`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new Error(`${label}.${key} must be an enumerable data property`);
    }
  }
}

function fixedHex(
  value: unknown,
  bytes: number,
  label: string,
): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be canonical lowercase ${bytes}-byte hex`);
  }
  return value;
}

function variableHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error(`${label} must be nonempty canonical lowercase byte hex`);
  }
  return value;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
