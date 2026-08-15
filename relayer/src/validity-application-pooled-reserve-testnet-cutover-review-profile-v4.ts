import { createHash } from 'node:crypto';

import { AddressType, Network } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';

import {
  assertAuthorityBoundDeploymentLineageProvenance,
  type AuthorityBoundDeploymentLineageCandidate,
} from './authority-bound-deployment-lineage.js';
import {
  FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_INVENTORY_V4_STATUS,
  assertFrontierRelayerCompatibilityAuthorityInventoryV4Provenance,
  type FrontierRelayerCompatibilityAuthorityInventoryV4,
} from './frontier-relayer-compatibility-authority-inventory-v4.js';
import {
  assertPooledReserveMintReservationRuntimeProfileV4CandidateProvenance,
  type PooledReserveMintReservationRuntimeProfileV4Candidate,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';
import {
  assertDeploymentIdentityCandidateProvenance,
  type DeploymentIdentityCandidate,
} from './read-only-deployment-identity-observer.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';
import {
  assertValidityApplicationPooledReserveCutoverCandidateV4Provenance,
  type ValidityApplicationPooledReserveCutoverCandidateV4,
} from './validity-application-pooled-reserve-cutover-candidate-v4.js';
import {
  assertValidityApplicationPooledReserveErgoCutoverObservationV4Provenance,
  validateValidityApplicationPooledReserveErgoCutoverObservationV4Report,
  type ValidityApplicationPooledReserveErgoCutoverObservationV4Report,
} from './validity-application-pooled-reserve-ergo-cutover-observation-v4.js';
import {
  assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance,
  type ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet,
} from './validity-application-pooled-reserve-historical-replay-genesis-v4.js';
import {
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate,
  type ValidityApplicationPooledReserveInstanceV4Candidate,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
  type LegacyRouteRetirementRequirementV4,
} from './validity-application-pooled-reserve-legacy-route-requirements-v4.js';
import {
  assertValidityApplicationPooledReserveProvisioningV4Packet,
  type ValidityApplicationPooledReserveProvisioningV4Packet,
} from './validity-application-pooled-reserve-provisioning-v4.js';

export const VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_SCHEMA =
  'e2s.validity-application-pooled-reserve-testnet-cutover-review-profile.v4' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_STATUS =
  'blocked_non_authorizing_review_profile' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_ROUTE_INVENTORY_V4_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_ROUTE_INVENTORY_V4' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_SANITIZED_ROUTE_V4_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_SANITIZED_ROUTE_V4' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REPLAY_LINEAGE_SET_V4_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REPLAY_LINEAGE_SET_V4' as const;

const COMPILED_INSTANCE_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_COMPILED_INSTANCE_REVIEW_V4';
const PROVISIONING_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_PROVISIONING_REVIEW_V4';
const CANONICAL_BURN_SET_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_REPLAY_BURN_SET_REVIEW_V4';
const profiles = new WeakSet<object>();

const FIXED_BLOCKERS = Object.freeze([
  'activation-parent-is-not-authenticated',
  'component-provenance-is-not-replayed-by-the-sanitized-profile',
  'ergo-consensus-is-not-authenticated',
  'gate5-remains-open',
  'legacy-route-retirement-is-not-authenticated',
  'profile-instance-inventory-is-not-exhaustive-or-approved',
  'source-admission-profile-is-not-activated',
  'target-node-acceptance-is-not-established',
] as const);

const AUTHORITY_KEYS = Object.freeze([
  'activationParentAuthenticated',
  'sourceAdmissionActivated',
  'legacyRouteInventoryAuthenticated',
  'legacyRoutesRetired',
  'profileActivated',
  'targetNodeAcceptanceEstablished',
  'mintAuthorized',
  'payoutAuthorized',
  'signingAuthorized',
  'submissionAuthorized',
  'broadcastAuthorized',
  'fundsAuthorityEstablished',
  'gate5Closed',
  'trustlessStatusEstablished',
  'productionReadinessEstablished',
] as const);

type ReviewAuthority = {
  readonly [Key in typeof AUTHORITY_KEYS[number]]: false;
};

export interface BuildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Input {
  readonly compiledInstance: Readonly<
    ValidityApplicationPooledReserveInstanceV4Candidate
  >;
  readonly runtimeProfile: Readonly<
    PooledReserveMintReservationRuntimeProfileV4Candidate
  >;
  readonly ergoCutoverObservation: Readonly<
    ValidityApplicationPooledReserveErgoCutoverObservationV4Report
  >;
  readonly historicalReplayGenesis: Readonly<
    ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet
  >;
  readonly provisioning: Readonly<
    ValidityApplicationPooledReserveProvisioningV4Packet
  >;
  readonly cutoverCandidate: Readonly<
    ValidityApplicationPooledReserveCutoverCandidateV4
  >;
  readonly deploymentIdentity: Readonly<DeploymentIdentityCandidate>;
  readonly deploymentLineage: Readonly<
    AuthorityBoundDeploymentLineageCandidate
  >;
  readonly compatibilityInventory: Readonly<
    FrontierRelayerCompatibilityAuthorityInventoryV4
  >;
}

export interface TestnetCutoverReviewRouteInstanceV4 {
  readonly instanceId: string;
  readonly address: string;
  readonly ergoTreeSha256Hex: string;
  readonly singletonTokenIdHex: string | null;
  readonly genesisBoxIdHex: string | null;
  readonly inventoryClassification:
    | 'funded'
    | 'drained'
    | 'never-funded'
    | 'unresolved';
  readonly inventoryEvidenceDigestHex: string;
}

export interface TestnetCutoverReviewRouteV4
  extends LegacyRouteRetirementRequirementV4 {
  readonly inventory: {
    readonly source:
      | 'ergo-cutover-observation'
      | 'frontier-relayer-compatibility-inventory';
    readonly bindingDigestHex: string;
    readonly sanitizedBindingDigestHex: string;
    readonly instances: readonly TestnetCutoverReviewRouteInstanceV4[];
    readonly blockerCodes: readonly string[];
  };
  readonly declaration: {
    readonly declaredStatus: 'inactive-unverified';
    readonly inventoryEvidenceDigestHex: string;
    readonly retirementEvidenceDigestHex: string;
  };
  readonly retirement: {
    readonly evidenceAuthenticated: false;
    readonly routeRetired: false;
  };
}

export interface TestnetCutoverReviewReplayLineageV4 {
  readonly routeId: string;
  readonly instanceId: string;
  readonly lineagePacketDigestHex: string;
  readonly lineageClassification: 'never-funded' | 'raw-reconstructed';
  readonly rawReplayKeyCount: number;
  readonly contributionKind:
    | 'empty-observed-lineage'
    | 'authenticated-v2-replay-import';
  readonly eventMapping:
    | 'not-required-empty-lineage'
    | 'event-complete-mapping-bound';
  readonly sourceAdmission:
    | 'not-required-empty-lineage'
    | 'source-admission-bound';
  readonly replayImportPacketDigestHex: string | null;
  readonly canonicalBurnIdCount: number;
  readonly canonicalBurnIdsDigestHex: string;
}

export interface ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4 {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_SCHEMA;
  readonly version: 4;
  readonly status:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_STATUS;
  readonly profileDigestHex: string;
  readonly scope: {
    readonly settlementNetworkId: 'ergo-testnet';
    readonly sourceNetworkScope: 'public-testnet';
    readonly sourceChainId: string;
    readonly sourceOriginIdentifiersIncluded: false;
    readonly rawObservationObjectsIncluded: false;
  };
  readonly components: {
    readonly compiledInstanceDigestHex: string;
    readonly runtimeProfileCandidateDigestHex: string;
    readonly ergoCutoverObservationReportDigestHex: string;
    readonly historicalReplayGenesisPacketDigestHex: string;
    readonly provisioningPacketDigestHex: string;
    readonly cutoverCandidateDigestHex: string;
    readonly deploymentIdentityCandidateDigestHex: string;
    readonly deploymentLineageCandidateDigestHex: string;
    readonly compatibilityInventoryPacketDigestHex: string;
  };
  readonly application: {
    readonly lineageProfileIdHex: string;
    readonly runtimeProfileIdHex: string;
    readonly applicationBindingDigestHex: string;
    readonly sourceAdmissionPolicyIdHex: string;
    readonly sourceProofSystemIdHex: string;
    readonly sourceProofProfileIdHex: string;
    readonly contractIds: {
      readonly tracker: string;
      readonly duplicatePrevention: string;
      readonly sourceLock: string;
      readonly pooledReserve: string;
    };
  };
  readonly deployment: {
    readonly artifactProfileDigestHex: string;
    readonly buildManifestSha256Hex: string;
    readonly reviewedDeploymentLineageProfileDigestHex: string;
    readonly bridgeAddress: string;
    readonly tokenAddress: string;
    readonly bridgeRuntimeCodeSha256Hex: string;
    readonly bridgeRuntimeCodeBytes: number;
    readonly tokenRuntimeCodeSha256Hex: string;
    readonly tokenRuntimeCodeBytes: number;
    readonly lineageStartHeight: string;
    readonly lineageTerminalHeight: string;
    readonly lineageTerminalExecutionBlockHashHex: string;
    readonly sourceAgreementCount: 2;
    readonly deploymentLineageAuthenticated: false;
  };
  readonly activation: {
    readonly activationHeight: string;
    readonly parentNativeHeight: string;
    readonly parentExecutionBlockHashHex: string;
    readonly parentObservationDigestHex: string;
    readonly parentBoundToDeploymentLineageTerminal: true;
    readonly parentAuthenticated: false;
    readonly profileActivated: false;
  };
  readonly replay: {
    readonly routeProfileDigestHex: string;
    readonly routeRequirementsDigestHex: string;
    readonly historicalLineageCount: number;
    readonly importedCanonicalBurnIdCount: number;
    readonly lineageSetDigestHex: string;
    readonly duplicatePreventionGenesisDigestHex: string;
    readonly allObservedLineagesComposed: true;
    readonly inventoryExhaustivenessAuthenticated: false;
    readonly lineages: readonly TestnetCutoverReviewReplayLineageV4[];
  };
  readonly routes: readonly TestnetCutoverReviewRouteV4[];
  readonly componentBlockers: {
    readonly ergoCutoverObservation: readonly string[];
    readonly frontierRelayerCompatibility: readonly string[];
  };
  readonly blockers: readonly string[];
  readonly checks: {
    readonly builderAssertions: {
      readonly sameProcessComponentProvenanceVerified: true;
      readonly exactApplicationBindingsMatched: true;
      readonly exactDeploymentLineageTerminalMatched: true;
      readonly exactLegacyRouteSetMatched: true;
      readonly exactInventoryDigestPerRouteMatched: true;
      readonly exactReplayContributionPerObservedLineageMatched: true;
      readonly sourceOriginIdentifiersExcluded: true;
      readonly rawObservationObjectsExcluded: true;
    };
    readonly serializedBoundary: {
      readonly componentProvenanceReplayed: false;
      readonly sourceComponentMembershipReplayed: false;
      readonly callerAuthorityClaimsAccepted: false;
    };
  };
  readonly authority: ReviewAuthority;
}

export interface ValidatedValidityApplicationPooledReserveTestnetCutoverReviewProfileV4 {
  readonly profile: Readonly<
    ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4
  >;
  readonly serializedValidation: {
    readonly canonicalDigestMatched: true;
    readonly exactStaticRouteSetMatched: true;
    readonly exactInternalReplayRouteJoinMatched: true;
    readonly sanitizedFieldPolicyMatched: true;
    readonly componentProvenanceReplayed: false;
    readonly sourceComponentMembershipReplayed: false;
    readonly callerAuthorityClaimsAccepted: false;
  };
}

export function buildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
  input: BuildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Input,
): Readonly<
  ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4
> {
  exactRecord(input, [
    'compiledInstance',
    'runtimeProfile',
    'ergoCutoverObservation',
    'historicalReplayGenesis',
    'provisioning',
    'cutoverCandidate',
    'deploymentIdentity',
    'deploymentLineage',
    'compatibilityInventory',
  ], 'testnet cutover review-profile input');
  assertCompiledValidityApplicationPooledReserveInstanceV4Candidate(
    input.compiledInstance,
  );
  assertPooledReserveMintReservationRuntimeProfileV4CandidateProvenance(
    input.runtimeProfile,
  );
  assertValidityApplicationPooledReserveErgoCutoverObservationV4Provenance(
    input.ergoCutoverObservation,
  );
  const observation =
    validateValidityApplicationPooledReserveErgoCutoverObservationV4Report(
      input.ergoCutoverObservation,
    );
  assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance(
    input.historicalReplayGenesis,
  );
  assertValidityApplicationPooledReserveProvisioningV4Packet(
    input.provisioning,
  );
  assertValidityApplicationPooledReserveCutoverCandidateV4Provenance(
    input.cutoverCandidate,
  );
  assertDeploymentIdentityCandidateProvenance(input.deploymentIdentity);
  assertAuthorityBoundDeploymentLineageProvenance(input.deploymentLineage);
  assertFrontierRelayerCompatibilityAuthorityInventoryV4Provenance(
    input.compatibilityInventory,
  );

  assertAllAuthorityBoundariesFalse(input);
  assertTestnetAndApplicationBindings(input, observation);
  const terminalBlock = assertDeploymentBindings(input);
  const routes = buildReviewRoutes(input, observation);
  const replayLineages = buildReplayLineages(input, observation);
  assertReplayLineagesMatchDuplicatePreventionInstances(
    replayLineages,
    routes,
  );

  const componentBlockers = {
    ergoCutoverObservation: sortedUniqueStrings(
      observation.summary.inventoryBlockerCodes,
      'Ergo cutover observation blocker',
    ),
    frontierRelayerCompatibility: sortedUniqueStrings(
      input.compatibilityInventory.blockers,
      'Frontier/relayer compatibility blocker',
    ),
  };
  const blockers = sortedUniqueStrings([
    ...FIXED_BLOCKERS,
    ...componentBlockers.ergoCutoverObservation,
    ...componentBlockers.frontierRelayerCompatibility,
    ...routes.flatMap(route => route.inventory.blockerCodes),
  ], 'testnet cutover review-profile blocker');
  const compiledInstanceDigestHex = sha256CanonicalJson(
    input.compiledInstance,
    COMPILED_INSTANCE_DIGEST_DOMAIN,
  );
  const provisioningPacketDigestHex = sha256CanonicalJson(
    input.provisioning,
    PROVISIONING_DIGEST_DOMAIN,
  );
  const runtime = input.runtimeProfile.profile;
  const deployment = input.deploymentIdentity.view;
  const candidate = input.cutoverCandidate;
  const replay = input.historicalReplayGenesis;

  const binding = {
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_SCHEMA,
    version: 4 as const,
    status:
      VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_STATUS,
    scope: {
      settlementNetworkId: 'ergo-testnet' as const,
      sourceNetworkScope: 'public-testnet' as const,
      sourceChainId: canonicalUint64(deployment.chainId, 'source chain ID'),
      sourceOriginIdentifiersIncluded: false as const,
      rawObservationObjectsIncluded: false as const,
    },
    components: {
      compiledInstanceDigestHex,
      runtimeProfileCandidateDigestHex: digest(
        input.runtimeProfile.candidateDigestHex,
        'runtime-profile candidate digest',
      ),
      ergoCutoverObservationReportDigestHex: digest(
        observation.reportDigestHex,
        'Ergo cutover observation report digest',
      ),
      historicalReplayGenesisPacketDigestHex: digest(
        replay.packetDigestHex,
        'historical replay-genesis packet digest',
      ),
      provisioningPacketDigestHex,
      cutoverCandidateDigestHex: digest(
        candidate.candidateDigestHex,
        'cutover candidate digest',
      ),
      deploymentIdentityCandidateDigestHex: digest(
        input.deploymentIdentity.candidateDigestHex,
        'deployment-identity candidate digest',
      ),
      deploymentLineageCandidateDigestHex: digest(
        input.deploymentLineage.candidateDigestHex,
        'deployment-lineage candidate digest',
      ),
      compatibilityInventoryPacketDigestHex: digest(
        input.compatibilityInventory.packetDigestHex,
        'compatibility-inventory packet digest',
      ),
    },
    application: {
      lineageProfileIdHex: fixedHex(
        candidate.application.lineageProfileIdHex,
        32,
        'lineage profile ID',
      ),
      runtimeProfileIdHex: fixedHex(
        candidate.application.runtimeProfileIdHex,
        32,
        'runtime profile ID',
      ),
      applicationBindingDigestHex: digest(
        candidate.application.applicationBindingDigestHex,
        'application-binding digest',
      ),
      sourceAdmissionPolicyIdHex: digest(
        candidate.sourceAdmissionProfile.policyIdHex,
        'source-admission policy ID',
      ),
      sourceProofSystemIdHex: digest(
        candidate.sourceAdmissionProfile.proofSystemIdHex,
        'source proof-system ID',
      ),
      sourceProofProfileIdHex: digest(
        candidate.sourceAdmissionProfile.proofProfileIdHex,
        'source proof-profile ID',
      ),
      contractIds: normalizeContractIds(candidate.application.contractIds),
    },
    deployment: {
      artifactProfileDigestHex: digest(
        deployment.artifactProfileDigestHex,
        'deployment artifact-profile digest',
      ),
      buildManifestSha256Hex: digest(
        deployment.buildManifestSha256Hex,
        'deployment build-manifest digest',
      ),
      reviewedDeploymentLineageProfileDigestHex: digest(
        input.deploymentLineage.reviewedProfileDigestHex,
        'reviewed deployment-lineage profile digest',
      ),
      bridgeAddress: address(deployment.bridgeAddress, 'bridge address'),
      tokenAddress: address(deployment.tokenAddress, 'token address'),
      bridgeRuntimeCodeSha256Hex: digest(
        deployment.bridgeRuntimeBytecodeSha256Hex,
        'bridge runtime-code digest',
      ),
      bridgeRuntimeCodeBytes: positiveInteger(
        deployment.bridgeRuntimeByteLength,
        'bridge runtime-code length',
      ),
      tokenRuntimeCodeSha256Hex: digest(
        deployment.tokenRuntimeBytecodeSha256Hex,
        'token runtime-code digest',
      ),
      tokenRuntimeCodeBytes: positiveInteger(
        deployment.tokenRuntimeByteLength,
        'token runtime-code length',
      ),
      lineageStartHeight: canonicalUint64(
        input.deploymentLineage.interval.startHeight,
        'deployment-lineage start height',
      ),
      lineageTerminalHeight: canonicalUint64(
        input.deploymentLineage.interval.terminalHeight,
        'deployment-lineage terminal height',
      ),
      lineageTerminalExecutionBlockHashHex: digest(
        input.deploymentLineage.interval.terminalExecutionBlockHashHex,
        'deployment-lineage terminal execution block hash',
      ),
      sourceAgreementCount: 2 as const,
      deploymentLineageAuthenticated: false as const,
    },
    activation: {
      activationHeight: canonicalUint64(
        runtime.activationHeight,
        'runtime activation height',
      ),
      parentNativeHeight: canonicalUint64(
        candidate.activationParent.nativeHeight,
        'activation-parent native height',
      ),
      parentExecutionBlockHashHex: digest(
        candidate.activationParent.executionBlockHashHex,
        'activation-parent execution block hash',
      ),
      parentObservationDigestHex: digest(
        terminalBlock.observationDigestHex,
        'activation-parent observation digest',
      ),
      parentBoundToDeploymentLineageTerminal: true as const,
      parentAuthenticated: false as const,
      profileActivated: false as const,
    },
    replay: {
      routeProfileDigestHex: digest(
        observation.profile.profileDigestHex,
        'Ergo route-profile digest',
      ),
      routeRequirementsDigestHex: digest(
        observation.profile.requirementsDigestHex,
        'Ergo route-requirements digest',
      ),
      historicalLineageCount: replayLineages.length,
      importedCanonicalBurnIdCount:
        replay.duplicatePreventionGenesis.canonicalBurnIdsHex.length,
      lineageSetDigestHex: sha256CanonicalJson(
        replayLineages,
        VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REPLAY_LINEAGE_SET_V4_DIGEST_DOMAIN,
      ),
      duplicatePreventionGenesisDigestHex: fixedHex(
        replay.duplicatePreventionGenesis.digestHex,
        33,
        'duplicate-prevention genesis digest',
      ),
      allObservedLineagesComposed: true as const,
      inventoryExhaustivenessAuthenticated: false as const,
      lineages: replayLineages,
    },
    routes,
    componentBlockers,
    blockers,
    checks: {
      builderAssertions: {
        sameProcessComponentProvenanceVerified: true as const,
        exactApplicationBindingsMatched: true as const,
        exactDeploymentLineageTerminalMatched: true as const,
        exactLegacyRouteSetMatched: true as const,
        exactInventoryDigestPerRouteMatched: true as const,
        exactReplayContributionPerObservedLineageMatched: true as const,
        sourceOriginIdentifiersExcluded: true as const,
        rawObservationObjectsExcluded: true as const,
      },
      serializedBoundary: {
        componentProvenanceReplayed: false as const,
        sourceComponentMembershipReplayed: false as const,
        callerAuthorityClaimsAccepted: false as const,
      },
    },
    authority: falseAuthority(),
  };
  const profile = deepFreeze({
    ...binding,
    profileDigestHex: sha256CanonicalJson(
      binding,
      VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_DIGEST_DOMAIN,
    ),
  });
  profiles.add(profile);
  return profile;
}

export function validateValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
  value: unknown,
): Readonly<
  ValidatedValidityApplicationPooledReserveTestnetCutoverReviewProfileV4
> {
  const record = exactRecord(value, [
    'schema',
    'version',
    'status',
    'profileDigestHex',
    'scope',
    'components',
    'application',
    'deployment',
    'activation',
    'replay',
    'routes',
    'componentBlockers',
    'blockers',
    'checks',
    'authority',
  ], 'serialized testnet cutover review profile');
  if (
    record.schema
      !== VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_SCHEMA
    || record.version !== 4
    || record.status
      !== VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_STATUS
  ) {
    throw new Error('testnet cutover review-profile schema, version, or status is invalid');
  }
  const profileDigestHex = digest(
    record.profileDigestHex,
    'testnet cutover review-profile digest',
  );
  const binding = { ...record };
  delete binding.profileDigestHex;
  if (
    sha256CanonicalJson(
      binding,
      VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_DIGEST_DOMAIN,
    ) !== profileDigestHex
  ) {
    throw new Error('testnet cutover review-profile digest does not match its content');
  }

  validateScope(record.scope);
  validateComponents(record.components);
  validateApplication(record.application);
  validateDeployment(record.deployment);
  validateActivation(record.activation, record.deployment);
  const replayLineages = validateReplay(record.replay);
  const routes = validateReviewRoutes(record.routes);
  assertReplayLineagesMatchDuplicatePreventionInstances(
    replayLineages,
    routes,
  );
  const componentBlockers = validateComponentBlockers(record.componentBlockers);
  const blockers = sortedUniqueStrings(
    requireArray(record.blockers, 'testnet cutover review-profile blockers'),
    'testnet cutover review-profile blocker',
  );
  if (canonicalJson(blockers) !== canonicalJson(record.blockers)) {
    throw new Error('testnet cutover review-profile blockers must be sorted and unique');
  }
  const requiredBlockers = sortedUniqueStrings([
    ...FIXED_BLOCKERS,
    ...componentBlockers.ergoCutoverObservation,
    ...componentBlockers.frontierRelayerCompatibility,
    ...(record.routes as TestnetCutoverReviewRouteV4[])
      .flatMap(route => route.inventory.blockerCodes),
  ], 'derived testnet cutover review-profile blocker');
  if (canonicalJson(blockers) !== canonicalJson(requiredBlockers)) {
    throw new Error('testnet cutover review-profile blocker set is not exact');
  }
  validateChecks(record.checks);
  validateAuthority(record.authority);
  return deepFreeze({
    profile: structuredClone(value) as
      ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4,
    serializedValidation: {
      canonicalDigestMatched: true as const,
      exactStaticRouteSetMatched: true as const,
      exactInternalReplayRouteJoinMatched: true as const,
      sanitizedFieldPolicyMatched: true as const,
      componentProvenanceReplayed: false as const,
      sourceComponentMembershipReplayed: false as const,
      callerAuthorityClaimsAccepted: false as const,
    },
  });
}

export function assertValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Provenance(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4
> {
  if (value === null || typeof value !== 'object' || !profiles.has(value)) {
    throw new Error('testnet cutover review profile was not built in this process');
  }
}

function assertAllAuthorityBoundariesFalse(
  input: BuildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Input,
): void {
  assertAllFalse(input.compiledInstance.boundaries, 'compiled-instance boundary');
  assertAllFalse(input.runtimeProfile.authority, 'runtime-profile authority');
  assertAllFalse(input.cutoverCandidate.authority, 'cutover-candidate authority');
  assertAllFalse(input.deploymentIdentity.authority, 'deployment-identity authority');
  assertAllFalse(input.deploymentLineage.authority, 'deployment-lineage authority');
  assertAllFalse(input.compatibilityInventory.authority, 'compatibility-inventory authority');
  assertFalseFields(input.ergoCutoverObservation.boundaries, [
    'profileReviewAuthenticated',
    'deploymentLineageAuthenticated',
    'canonicalEventMappingsCompleted',
    'sourceAdmissionEvidenceCompleted',
    'legacyRoutesRetired',
    'profileActivated',
    'targetNodeAcceptanceEstablished',
    'mintAuthorized',
    'payoutAuthorized',
    'signingAuthorized',
    'submissionAuthorized',
    'broadcastAuthorized',
    'fundsAuthorityEstablished',
    'gate5Closed',
    'trustlessStatusEstablished',
    'productionReadinessEstablished',
  ], 'Ergo cutover observation boundary');
  assertFalseFields(input.historicalReplayGenesis.boundaries, [
    'profileInstanceInventoryExhaustiveAuthenticated',
    'legacyRoutesRetired',
    'profileActivated',
    'targetNodeAcceptanceEstablished',
    'signingAuthorityEstablished',
    'submissionAuthorityEstablished',
    'broadcastAuthorityEstablished',
    'fundsAuthorityEstablished',
    'gate5Closed',
    'trustlessStatusEstablished',
    'productionReadinessEstablished',
  ], 'historical replay-genesis boundary');
  assertFalseFields(input.provisioning.boundaries, [
    'singletonLineagesEstablished',
    'reserveLineageEstablished',
    'profileActivated',
    'targetNodeAcceptanceEstablished',
    'signingAuthorityEstablished',
    'submissionAuthorityEstablished',
    'broadcastAuthorityEstablished',
    'fundsAuthorityEstablished',
    'gate5Closed',
    'trustlessStatusEstablished',
    'productionReadinessEstablished',
  ], 'provisioning boundary');
}

function assertTestnetAndApplicationBindings(
  input: BuildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Input,
  observation: Readonly<
    ValidityApplicationPooledReserveErgoCutoverObservationV4Report
  >,
): void {
  if (
    observation.profile.networkId !== 'ergo-testnet'
    || input.deploymentIdentity.view.declaredNetworkScope !== 'public-testnet'
    || input.compatibilityInventory.observations.networkScope !== 'public-testnet'
  ) {
    throw new Error('cutover review profile requires explicit Ergo and source public testnets');
  }
  if (
    input.compatibilityInventory.status
      !== FRONTIER_RELAYER_COMPATIBILITY_AUTHORITY_INVENTORY_V4_STATUS
    || input.compatibilityInventory.observations.reviewedDeploymentLineageProfile
      !== 'reviewed-non-inert-profile'
  ) {
    throw new Error('cutover review profile requires a reviewed non-inert deployment-lineage profile');
  }
  if (
    input.compatibilityInventory.observations.runtimeActivation
      !== 'nonzero-unactivated-candidate'
  ) {
    throw new Error('cutover review profile requires a nonzero unactivated runtime candidate');
  }
  const compiled = input.compiledInstance;
  const runtime = input.runtimeProfile;
  const candidate = input.cutoverCandidate;
  if (
    fixedHex(runtime.profileIdHex, 32, 'runtime profile ID')
      !== fixedHex(candidate.application.runtimeProfileIdHex, 32, 'candidate runtime profile ID')
    || fixedHex(compiled.lineageProfileIdHex, 32, 'compiled lineage profile ID')
      !== fixedHex(candidate.application.lineageProfileIdHex, 32, 'candidate lineage profile ID')
    || digest(compiled.application.burnBindingDigestHex, 'compiled burn application-binding digest')
      !== digest(candidate.application.applicationBindingDigestHex, 'candidate application-binding digest')
    || canonicalJson(normalizeContractIds(candidate.application.contractIds))
      !== canonicalJson(compiledContractIds(compiled))
    || digest(compiled.sidechainFinalityPolicy.policyIdHex, 'compiled source-admission policy ID')
      !== digest(candidate.sourceAdmissionProfile.policyIdHex, 'candidate source-admission policy ID')
    || digest(compiled.sidechainFinalityPolicy.proofSystemIdHex, 'compiled proof-system ID')
      !== digest(candidate.sourceAdmissionProfile.proofSystemIdHex, 'candidate proof-system ID')
    || digest(compiled.sidechainFinalityPolicy.proofProfileIdHex, 'compiled proof-profile ID')
      !== digest(candidate.sourceAdmissionProfile.proofProfileIdHex, 'candidate proof-profile ID')
  ) {
    throw new Error('cutover review profile components do not bind the exact V4 application');
  }
  if (
    digest(input.historicalReplayGenesis.observation.cutoverObservationReportDigestHex, 'replay observation digest')
      !== digest(observation.reportDigestHex, 'cutover observation digest')
    || digest(candidate.replayCutover.historicalReplayGenesisPacketDigestHex, 'candidate replay packet digest')
      !== digest(input.historicalReplayGenesis.packetDigestHex, 'replay packet digest')
    || digest(candidate.replayCutover.cutoverObservationReportDigestHex, 'candidate observation digest')
      !== digest(observation.reportDigestHex, 'observation digest')
    || input.provisioning.duplicatePreventionGenesis.mode
      !== 'historical-replay-genesis'
    || digest(input.provisioning.duplicatePreventionGenesis.historicalReplayGenesisPacketDigestHex, 'provisioning replay packet digest')
      !== digest(input.historicalReplayGenesis.packetDigestHex, 'historical replay packet digest')
    || fixedHex(input.provisioning.duplicatePreventionGenesis.digestHex, 33, 'provisioning DUP digest')
      !== fixedHex(input.historicalReplayGenesis.duplicatePreventionGenesis.digestHex, 33, 'replay DUP digest')
  ) {
    throw new Error('cutover review profile replay and provisioning components disagree');
  }
}

function assertDeploymentBindings(
  input: BuildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Input,
): AuthorityBoundDeploymentLineageCandidate['blocks'][number] {
  const identity = input.deploymentIdentity;
  const lineage = input.deploymentLineage;
  const compatibility = input.compatibilityInventory;
  const runtime = input.runtimeProfile.profile;
  const candidate = input.cutoverCandidate;
  if (
    digest(lineage.deploymentIdentityCandidateDigestHex, 'lineage deployment-identity digest')
      !== digest(identity.candidateDigestHex, 'deployment-identity digest')
    || digest(lineage.artifactProfileDigestHex, 'lineage artifact-profile digest')
      !== digest(identity.view.artifactProfileDigestHex, 'identity artifact-profile digest')
    || digest(compatibility.observations.deploymentIdentityCandidateDigestHex, 'inventory deployment-identity digest')
      !== digest(identity.candidateDigestHex, 'deployment-identity digest')
    || digest(compatibility.observations.deploymentLineageCandidateDigestHex, 'inventory deployment-lineage digest')
      !== digest(lineage.candidateDigestHex, 'deployment-lineage digest')
    || digest(compatibility.observations.runtimeProfileCandidateDigestHex, 'inventory runtime-profile digest')
      !== digest(input.runtimeProfile.candidateDigestHex, 'runtime-profile digest')
    || address(runtime.bridgeAddressHex, 'runtime bridge address')
      !== address(identity.view.bridgeAddress, 'deployment bridge address')
    || address(runtime.tokenAddressHex, 'runtime token address')
      !== address(identity.view.tokenAddress, 'deployment token address')
    || digest(runtime.bridgeRuntimeCodeSha256Hex, 'runtime bridge-code digest')
      !== digest(identity.view.bridgeRuntimeBytecodeSha256Hex, 'deployment bridge-code digest')
    || runtime.bridgeRuntimeCodeBytes !== identity.view.bridgeRuntimeByteLength
    || digest(runtime.tokenRuntimeCodeSha256Hex, 'runtime token-code digest')
      !== digest(identity.view.tokenRuntimeBytecodeSha256Hex, 'deployment token-code digest')
    || runtime.tokenRuntimeCodeBytes !== identity.view.tokenRuntimeByteLength
  ) {
    throw new Error('cutover review profile deployment identity or code binding differs');
  }
  const terminalHeight = canonicalUint64(
    lineage.interval.terminalHeight,
    'deployment-lineage terminal height',
  );
  const terminalBlocks = lineage.blocks.filter(block =>
    canonicalUint64(block.height, 'deployment-lineage block height')
      === terminalHeight
  );
  if (terminalBlocks.length !== 1) {
    throw new Error('deployment lineage must contain exactly one terminal block');
  }
  const terminalBlock = terminalBlocks[0]!;
  if (
    canonicalUint64(candidate.activationParent.nativeHeight, 'activation-parent native height')
      !== terminalHeight
    || digest(candidate.activationParent.executionBlockHashHex, 'activation-parent execution hash')
      !== digest(lineage.interval.terminalExecutionBlockHashHex, 'lineage terminal execution hash')
    || digest(terminalBlock.hashHex, 'lineage terminal block hash')
      !== digest(lineage.interval.terminalExecutionBlockHashHex, 'lineage terminal execution hash')
    || digest(candidate.activationParent.observationDigestHex, 'activation-parent observation digest')
      !== digest(terminalBlock.observationDigestHex, 'lineage terminal observation digest')
    || BigInt(terminalHeight) + 1n
      !== BigInt(canonicalUint64(runtime.activationHeight, 'runtime activation height'))
  ) {
    throw new Error('activation parent is not the exact deployment-lineage terminal');
  }
  return terminalBlock;
}

function buildReviewRoutes(
  input: BuildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Input,
  observation: Readonly<
    ValidityApplicationPooledReserveErgoCutoverObservationV4Report
  >,
): readonly TestnetCutoverReviewRouteV4[] {
  const declarations = uniqueMap(
    input.cutoverCandidate.legacyRouteRetirement.declarations,
    declaration => declaration.routeId,
    'cutover candidate route declaration',
  );
  const ergoRoutes = uniqueMap(
    observation.inventory.routes,
    route => route.routeId,
    'Ergo inventory route',
  );
  const compatibilityRoutes = uniqueMap(
    input.compatibilityInventory.routes,
    route => route.routeId,
    'Frontier/relayer inventory route',
  );
  assertExactRouteKeys(declarations, 'cutover candidate declarations');
  assertExactLayerRouteKeys(ergoRoutes, 'ergo', 'Ergo inventory');
  assertExactCompatibilityRouteKeys(compatibilityRoutes);

  return deepFreeze(
    [...VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4]
      .sort((left, right) => compareCodeUnits(left.routeId, right.routeId))
      .map(requirement => {
        const declaration = declarations.get(requirement.routeId)!;
        if (
          declaration.declaredDisposition !== requirement.requiredDisposition
          || declaration.declaredStatus !== 'inactive-unverified'
        ) {
          throw new Error(`legacy route ${requirement.routeId} declaration differs from its requirement`);
        }
        const observed = requirement.layer === 'ergo'
          ? ergoRouteBinding(ergoRoutes.get(requirement.routeId), requirement)
          : compatibilityRouteBinding(
            compatibilityRoutes.get(requirement.routeId),
            requirement,
          );
        const declaredInventoryDigest = digest(
          declaration.inventoryEvidenceDigestHex,
          `legacy route ${requirement.routeId} declared inventory digest`,
        );
        const retirementEvidenceDigestHex = digest(
          declaration.retirementEvidenceDigestHex,
          `legacy route ${requirement.routeId} retirement-evidence digest`,
        );
        if (declaredInventoryDigest !== observed.bindingDigestHex) {
          throw new Error(`legacy route ${requirement.routeId} declaration does not bind its exact inventory`);
        }
        if (retirementEvidenceDigestHex === declaredInventoryDigest) {
          throw new Error(`legacy route ${requirement.routeId} reuses inventory as retirement evidence`);
        }
        return {
          ...requirement,
          inventory: observed,
          declaration: {
            declaredStatus: 'inactive-unverified' as const,
            inventoryEvidenceDigestHex: declaredInventoryDigest,
            retirementEvidenceDigestHex,
          },
          retirement: {
            evidenceAuthenticated: false as const,
            routeRetired: false as const,
          },
        };
      }),
  );
}

function ergoRouteBinding(
  value: ValidityApplicationPooledReserveErgoCutoverObservationV4Report['inventory']['routes'][number] | undefined,
  requirement: LegacyRouteRetirementRequirementV4,
): TestnetCutoverReviewRouteV4['inventory'] {
  if (
    value === undefined
    || value.sourceSurface !== requirement.sourceSurface
    || value.requiredDisposition !== requirement.requiredDisposition
  ) {
    throw new Error(`Ergo inventory route ${requirement.routeId} differs from its requirement`);
  }
  const instances = [...value.instances]
    .map(instance => {
      const ergoTreeSha256Hex = digest(
        instance.ergoTreeSha256Hex,
        'ErgoTree digest',
      );
      return {
        instanceId: publicIdentifier(
          instance.instanceId,
          'Ergo route instance ID',
        ),
        address: ergoTestnetP2sAddress(
          instance.address,
          ergoTreeSha256Hex,
          'Ergo route instance address',
        ),
        ergoTreeSha256Hex,
        singletonTokenIdHex: nullableDigest(instance.singletonTokenIdHex, 'singleton token ID'),
        genesisBoxIdHex: nullableDigest(instance.genesisBoxIdHex, 'genesis box ID'),
        inventoryClassification: instance.classification,
        inventoryEvidenceDigestHex: digest(
          instance.inventoryEvidenceDigestHex,
          'Ergo route instance inventory digest',
        ),
      };
    })
    .sort((left, right) => compareCodeUnits(left.instanceId, right.instanceId));
  assertStrictlySortedUnique(
    instances.map(instance => instance.instanceId),
    `Ergo route ${requirement.routeId} instance IDs`,
  );
  const binding = {
    source: 'ergo-cutover-observation' as const,
    bindingDigestHex: digest(value.inventoryEvidenceDigestHex, 'Ergo route inventory digest'),
    instances,
    blockerCodes: sortedUniqueStrings([
      ...value.blockerCodes,
      'route-retirement-evidence-is-not-authenticated',
    ], 'Ergo route blocker'),
  };
  return {
    ...binding,
    sanitizedBindingDigestHex: sanitizedRouteBindingDigest(binding),
  };
}

function compatibilityRouteBinding(
  value: FrontierRelayerCompatibilityAuthorityInventoryV4['routes'][number] | undefined,
  requirement: LegacyRouteRetirementRequirementV4,
): TestnetCutoverReviewRouteV4['inventory'] {
  if (
    value === undefined
    || value.layer !== requirement.layer
    || value.routeClass !== requirement.routeClass
    || value.sourceSurface !== requirement.sourceSurface
    || value.historicalAuthority !== requirement.historicalAuthority
    || value.requiredDisposition !== requirement.requiredDisposition
  ) {
    throw new Error(`Frontier/relayer inventory route ${requirement.routeId} differs from its requirement`);
  }
  const binding = {
    source: 'frontier-relayer-compatibility-inventory' as const,
    bindingDigestHex: sha256CanonicalJson(
      value,
      VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_ROUTE_INVENTORY_V4_DIGEST_DOMAIN,
    ),
    instances: [],
    blockerCodes: sortedUniqueStrings([
      ...value.blockers,
      'route-retirement-evidence-is-not-authenticated',
    ], 'Frontier/relayer route blocker'),
  };
  return {
    ...binding,
    sanitizedBindingDigestHex: sanitizedRouteBindingDigest(binding),
  };
}

function buildReplayLineages(
  input: BuildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Input,
  observation: Readonly<
    ValidityApplicationPooledReserveErgoCutoverObservationV4Report
  >,
): readonly TestnetCutoverReviewReplayLineageV4[] {
  const observed = uniqueMap(
    observation.historicalDupLineages,
    lineage => lineageKey(lineage.routeId, lineage.instanceId),
    'observed historical DUP lineage',
  );
  const contributions = uniqueMap(
    input.historicalReplayGenesis.contributions,
    contribution => lineageKey(contribution.routeId, contribution.instanceId),
    'historical replay contribution',
  );
  if (
    observed.size !== contributions.size
    || [...observed.keys()].some(key => !contributions.has(key))
  ) {
    throw new Error('historical replay genesis does not contain exactly one contribution per observed lineage');
  }
  const lineages = [...observed.entries()].map(([key, lineage]) => {
    const contribution = contributions.get(key)!;
    if (
      digest(contribution.lineagePacketDigestHex, 'contribution lineage digest')
        !== digest(lineage.packetDigestHex, 'observed lineage digest')
      || contribution.lineageClassification !== lineage.classification
      || contribution.rawReplayKeyCount !== lineage.rawInsertedKeysHex.length
    ) {
      throw new Error(`historical replay contribution ${key} differs from its observed lineage`);
    }
    const empty = contribution.kind === 'empty-observed-lineage';
    if (
      empty
        ? contribution.rawReplayKeyCount !== 0
          || contribution.replayImportPacketDigestHex !== null
          || contribution.canonicalBurnIdsHex.length !== 0
        : contribution.rawReplayKeyCount === 0
          || contribution.replayImportPacketDigestHex === null
          || contribution.canonicalBurnIdsHex.length === 0
    ) {
      throw new Error(`historical replay contribution ${key} has an invalid mapping or admission boundary`);
    }
    const burnIds = contribution.canonicalBurnIdsHex.map((burnId, index) =>
      digest(burnId, `historical replay contribution ${key} burn ID ${index}`)
    ).sort();
    assertStrictlySortedUnique(burnIds, `historical replay contribution ${key} burn IDs`);
    return {
      routeId: publicIdentifier(contribution.routeId, 'replay route ID'),
      instanceId: publicIdentifier(contribution.instanceId, 'replay instance ID'),
      lineagePacketDigestHex: digest(
        contribution.lineagePacketDigestHex,
        'replay lineage packet digest',
      ),
      lineageClassification: contribution.lineageClassification,
      rawReplayKeyCount: nonnegativeInteger(
        contribution.rawReplayKeyCount,
        'raw replay-key count',
      ),
      contributionKind: contribution.kind,
      eventMapping: empty
        ? 'not-required-empty-lineage' as const
        : 'event-complete-mapping-bound' as const,
      sourceAdmission: empty
        ? 'not-required-empty-lineage' as const
        : 'source-admission-bound' as const,
      replayImportPacketDigestHex: contribution.replayImportPacketDigestHex === null
        ? null
        : digest(contribution.replayImportPacketDigestHex, 'replay-import packet digest'),
      canonicalBurnIdCount: burnIds.length,
      canonicalBurnIdsDigestHex: sha256CanonicalJson(
        burnIds,
        CANONICAL_BURN_SET_DIGEST_DOMAIN,
      ),
    };
  }).sort((left, right) =>
    compareCodeUnits(lineageKey(left.routeId, left.instanceId), lineageKey(right.routeId, right.instanceId))
  );
  assertStrictlySortedUnique(
    lineages.map(lineage => lineageKey(lineage.routeId, lineage.instanceId)),
    'review-profile replay lineages',
  );
  if (
    input.cutoverCandidate.replayCutover.importedHistoricalLineageCount
      !== lineages.length
    || input.cutoverCandidate.replayCutover.importedCanonicalBurnIdCount
      !== input.historicalReplayGenesis.duplicatePreventionGenesis
        .canonicalBurnIdsHex.length
  ) {
    throw new Error('cutover candidate replay summary differs from the composed replay genesis');
  }
  return deepFreeze(lineages);
}

function validateScope(value: unknown): void {
  const record = exactRecord(value, [
    'settlementNetworkId',
    'sourceNetworkScope',
    'sourceChainId',
    'sourceOriginIdentifiersIncluded',
    'rawObservationObjectsIncluded',
  ], 'cutover review-profile scope');
  if (
    record.settlementNetworkId !== 'ergo-testnet'
    || record.sourceNetworkScope !== 'public-testnet'
    || record.sourceOriginIdentifiersIncluded !== false
    || record.rawObservationObjectsIncluded !== false
  ) {
    throw new Error('cutover review-profile scope or sanitization boundary is invalid');
  }
  canonicalUint64(record.sourceChainId, 'source chain ID');
}

function validateComponents(value: unknown): void {
  const record = exactRecord(value, [
    'compiledInstanceDigestHex',
    'runtimeProfileCandidateDigestHex',
    'ergoCutoverObservationReportDigestHex',
    'historicalReplayGenesisPacketDigestHex',
    'provisioningPacketDigestHex',
    'cutoverCandidateDigestHex',
    'deploymentIdentityCandidateDigestHex',
    'deploymentLineageCandidateDigestHex',
    'compatibilityInventoryPacketDigestHex',
  ], 'cutover review-profile components');
  for (const [key, candidate] of Object.entries(record)) {
    digest(candidate, `cutover review-profile component ${key}`);
  }
}

function validateApplication(value: unknown): void {
  const record = exactRecord(value, [
    'lineageProfileIdHex',
    'runtimeProfileIdHex',
    'applicationBindingDigestHex',
    'sourceAdmissionPolicyIdHex',
    'sourceProofSystemIdHex',
    'sourceProofProfileIdHex',
    'contractIds',
  ], 'cutover review-profile application');
  for (const key of [
    'lineageProfileIdHex',
    'runtimeProfileIdHex',
    'applicationBindingDigestHex',
    'sourceAdmissionPolicyIdHex',
    'sourceProofSystemIdHex',
    'sourceProofProfileIdHex',
  ] as const) {
    digest(record[key], `cutover review-profile application ${key}`);
  }
  normalizeContractIds(record.contractIds as Record<string, unknown>);
}

function validateDeployment(value: unknown): void {
  const record = exactRecord(value, [
    'artifactProfileDigestHex',
    'buildManifestSha256Hex',
    'reviewedDeploymentLineageProfileDigestHex',
    'bridgeAddress',
    'tokenAddress',
    'bridgeRuntimeCodeSha256Hex',
    'bridgeRuntimeCodeBytes',
    'tokenRuntimeCodeSha256Hex',
    'tokenRuntimeCodeBytes',
    'lineageStartHeight',
    'lineageTerminalHeight',
    'lineageTerminalExecutionBlockHashHex',
    'sourceAgreementCount',
    'deploymentLineageAuthenticated',
  ], 'cutover review-profile deployment');
  for (const key of [
    'artifactProfileDigestHex',
    'buildManifestSha256Hex',
    'reviewedDeploymentLineageProfileDigestHex',
    'bridgeRuntimeCodeSha256Hex',
    'tokenRuntimeCodeSha256Hex',
    'lineageTerminalExecutionBlockHashHex',
  ] as const) digest(record[key], `cutover review-profile deployment ${key}`);
  address(record.bridgeAddress, 'cutover review-profile bridge address');
  address(record.tokenAddress, 'cutover review-profile token address');
  positiveInteger(record.bridgeRuntimeCodeBytes, 'bridge runtime-code length');
  positiveInteger(record.tokenRuntimeCodeBytes, 'token runtime-code length');
  const start = BigInt(canonicalUint64(record.lineageStartHeight, 'lineage start height'));
  const terminal = BigInt(canonicalUint64(record.lineageTerminalHeight, 'lineage terminal height'));
  if (
    start > terminal
    || record.sourceAgreementCount !== 2
    || record.deploymentLineageAuthenticated !== false
  ) {
    throw new Error('cutover review-profile deployment boundary is invalid');
  }
}

function validateActivation(value: unknown, deploymentValue: unknown): void {
  const record = exactRecord(value, [
    'activationHeight',
    'parentNativeHeight',
    'parentExecutionBlockHashHex',
    'parentObservationDigestHex',
    'parentBoundToDeploymentLineageTerminal',
    'parentAuthenticated',
    'profileActivated',
  ], 'cutover review-profile activation');
  const deployment = deploymentValue as ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4['deployment'];
  const activationHeight = BigInt(canonicalUint64(record.activationHeight, 'activation height'));
  const parentHeight = BigInt(canonicalUint64(record.parentNativeHeight, 'activation-parent height'));
  for (const key of [
    'parentExecutionBlockHashHex',
    'parentObservationDigestHex',
  ] as const) digest(record[key], `cutover review-profile activation ${key}`);
  if (
    parentHeight + 1n !== activationHeight
    || record.parentNativeHeight !== deployment.lineageTerminalHeight
    || record.parentExecutionBlockHashHex
      !== deployment.lineageTerminalExecutionBlockHashHex
    || record.parentBoundToDeploymentLineageTerminal !== true
    || record.parentAuthenticated !== false
    || record.profileActivated !== false
  ) {
    throw new Error('cutover review-profile activation boundary is invalid');
  }
}

function validateReplay(
  value: unknown,
): readonly TestnetCutoverReviewReplayLineageV4[] {
  const record = exactRecord(value, [
    'routeProfileDigestHex',
    'routeRequirementsDigestHex',
    'historicalLineageCount',
    'importedCanonicalBurnIdCount',
    'lineageSetDigestHex',
    'duplicatePreventionGenesisDigestHex',
    'allObservedLineagesComposed',
    'inventoryExhaustivenessAuthenticated',
    'lineages',
  ], 'cutover review-profile replay');
  digest(record.routeProfileDigestHex, 'replay route-profile digest');
  digest(record.routeRequirementsDigestHex, 'replay route-requirements digest');
  fixedHex(record.duplicatePreventionGenesisDigestHex, 33, 'replay DUP genesis digest');
  const lineages = requireArray(record.lineages, 'cutover review-profile replay lineages')
    .map((lineage, index) => validateReplayLineage(lineage, index));
  assertStrictlySortedUnique(
    lineages.map(lineage => lineageKey(lineage.routeId, lineage.instanceId)),
    'serialized review-profile replay lineages',
  );
  const historicalLineageCount = nonnegativeInteger(
    record.historicalLineageCount,
    'historical lineage count',
  );
  const canonicalBurnCount = nonnegativeInteger(
    record.importedCanonicalBurnIdCount,
    'imported canonical burn-ID count',
  );
  const lineageSetDigestHex = digest(
    record.lineageSetDigestHex,
    'replay lineage-set digest',
  );
  if (
    historicalLineageCount !== lineages.length
    || canonicalBurnCount
      !== lineages.reduce((sum, lineage) => sum + lineage.canonicalBurnIdCount, 0)
    || record.allObservedLineagesComposed !== true
    || record.inventoryExhaustivenessAuthenticated !== false
    || lineageSetDigestHex !== sha256CanonicalJson(
      lineages,
      VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REPLAY_LINEAGE_SET_V4_DIGEST_DOMAIN,
    )
  ) {
    throw new Error('cutover review-profile replay summary is invalid');
  }
  return lineages;
}

function validateReplayLineage(
  value: unknown,
  index: number,
): TestnetCutoverReviewReplayLineageV4 {
  const record = exactRecord(value, [
    'routeId',
    'instanceId',
    'lineagePacketDigestHex',
    'lineageClassification',
    'rawReplayKeyCount',
    'contributionKind',
    'eventMapping',
    'sourceAdmission',
    'replayImportPacketDigestHex',
    'canonicalBurnIdCount',
    'canonicalBurnIdsDigestHex',
  ], `cutover review-profile replay lineage ${index}`);
  const rawReplayKeyCount = nonnegativeInteger(record.rawReplayKeyCount, 'raw replay-key count');
  const canonicalBurnIdCount = nonnegativeInteger(record.canonicalBurnIdCount, 'canonical burn-ID count');
  const empty = record.contributionKind === 'empty-observed-lineage';
  const imported = record.contributionKind === 'authenticated-v2-replay-import';
  if (
    (!empty && !imported)
    || (record.lineageClassification !== 'never-funded'
      && record.lineageClassification !== 'raw-reconstructed')
    || (empty && (
      rawReplayKeyCount !== 0
      || canonicalBurnIdCount !== 0
      || record.eventMapping !== 'not-required-empty-lineage'
      || record.sourceAdmission !== 'not-required-empty-lineage'
      || record.replayImportPacketDigestHex !== null
    ))
    || (imported && (
      rawReplayKeyCount === 0
      || canonicalBurnIdCount === 0
      || record.eventMapping !== 'event-complete-mapping-bound'
      || record.sourceAdmission !== 'source-admission-bound'
      || record.replayImportPacketDigestHex === null
    ))
  ) {
    throw new Error(`cutover review-profile replay lineage ${index} boundary is invalid`);
  }
  if (record.replayImportPacketDigestHex !== null) {
    digest(record.replayImportPacketDigestHex, 'replay-import packet digest');
  }
  return {
    routeId: publicIdentifier(record.routeId, 'replay route ID'),
    instanceId: publicIdentifier(record.instanceId, 'replay instance ID'),
    lineagePacketDigestHex: digest(record.lineagePacketDigestHex, 'lineage packet digest'),
    lineageClassification: record.lineageClassification,
    rawReplayKeyCount,
    contributionKind: record.contributionKind,
    eventMapping: record.eventMapping,
    sourceAdmission: record.sourceAdmission,
    replayImportPacketDigestHex: record.replayImportPacketDigestHex,
    canonicalBurnIdCount,
    canonicalBurnIdsDigestHex: digest(record.canonicalBurnIdsDigestHex, 'canonical burn-set digest'),
  } as TestnetCutoverReviewReplayLineageV4;
}

function validateReviewRoutes(
  value: unknown,
): readonly TestnetCutoverReviewRouteV4[] {
  const routes = requireArray(value, 'cutover review-profile routes');
  if (routes.length !== VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4.length) {
    throw new Error('cutover review-profile route count is incomplete');
  }
  const expected = [...VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4]
    .sort((left, right) => compareCodeUnits(left.routeId, right.routeId));
  const routeIds: string[] = [];
  for (const [index, valueRoute] of routes.entries()) {
    const record = exactRecord(valueRoute, [
      'routeId',
      'layer',
      'routeClass',
      'sourceSurface',
      'historicalAuthority',
      'requiredDisposition',
      'inventory',
      'declaration',
      'retirement',
    ], `cutover review-profile route ${index}`);
    const requirement = expected[index];
    if (
      requirement === undefined
      || canonicalJson({
        routeId: record.routeId,
        layer: record.layer,
        routeClass: record.routeClass,
        sourceSurface: record.sourceSurface,
        historicalAuthority: record.historicalAuthority,
        requiredDisposition: record.requiredDisposition,
      }) !== canonicalJson(requirement)
    ) {
      throw new Error(`cutover review-profile route ${index} differs from the static requirement`);
    }
    routeIds.push(requirement.routeId);
    const inventory = validateRouteInventory(record.inventory, requirement);
    const declaration = exactRecord(record.declaration, [
      'declaredStatus',
      'inventoryEvidenceDigestHex',
      'retirementEvidenceDigestHex',
    ], `cutover review-profile route ${requirement.routeId} declaration`);
    const retirement = exactRecord(record.retirement, [
      'evidenceAuthenticated',
      'routeRetired',
    ], `cutover review-profile route ${requirement.routeId} retirement`);
    const inventoryDigest = digest(declaration.inventoryEvidenceDigestHex, 'declared inventory digest');
    const retirementDigest = digest(declaration.retirementEvidenceDigestHex, 'declared retirement digest');
    if (
      declaration.declaredStatus !== 'inactive-unverified'
      || inventoryDigest !== inventory.bindingDigestHex
      || inventoryDigest === retirementDigest
      || retirement.evidenceAuthenticated !== false
      || retirement.routeRetired !== false
    ) {
      throw new Error(`cutover review-profile route ${requirement.routeId} retirement boundary is invalid`);
    }
  }
  assertStrictlySortedUnique(routeIds, 'cutover review-profile route IDs');
  return routes as unknown as readonly TestnetCutoverReviewRouteV4[];
}

function validateRouteInventory(
  value: unknown,
  requirement: LegacyRouteRetirementRequirementV4,
): TestnetCutoverReviewRouteV4['inventory'] {
  const record = exactRecord(value, [
    'source',
    'bindingDigestHex',
    'sanitizedBindingDigestHex',
    'instances',
    'blockerCodes',
  ], `cutover review-profile route ${requirement.routeId} inventory`);
  const expectedSource = requirement.layer === 'ergo'
    ? 'ergo-cutover-observation'
    : 'frontier-relayer-compatibility-inventory';
  const instances = requireArray(record.instances, 'route inventory instances')
    .map((instance, index) => validateRouteInstance(instance, index));
  assertStrictlySortedUnique(
    instances.map(instance => instance.instanceId),
    `cutover review-profile route ${requirement.routeId} instance IDs`,
  );
  const blockers = sortedUniqueStrings(
    requireArray(record.blockerCodes, 'route blocker codes'),
    'route blocker code',
  );
  if (
    record.source !== expectedSource
    || (requirement.layer === 'ergo' ? instances.length === 0 : instances.length !== 0)
    || canonicalJson(blockers) !== canonicalJson(record.blockerCodes)
    || !blockers.includes('route-retirement-evidence-is-not-authenticated')
  ) {
    throw new Error(`cutover review-profile route ${requirement.routeId} inventory boundary is invalid`);
  }
  const binding = {
    source: expectedSource,
    bindingDigestHex: digest(record.bindingDigestHex, 'route inventory binding digest'),
    instances,
    blockerCodes: blockers,
  } as const;
  const sanitizedBindingDigestHex = digest(
    record.sanitizedBindingDigestHex,
    'sanitized route inventory binding digest',
  );
  if (sanitizedBindingDigestHex !== sanitizedRouteBindingDigest(binding)) {
    throw new Error(`cutover review-profile route ${requirement.routeId} sanitized inventory digest is invalid`);
  }
  return { ...binding, sanitizedBindingDigestHex };
}

function validateRouteInstance(
  value: unknown,
  index: number,
): TestnetCutoverReviewRouteInstanceV4 {
  const record = exactRecord(value, [
    'instanceId',
    'address',
    'ergoTreeSha256Hex',
    'singletonTokenIdHex',
    'genesisBoxIdHex',
    'inventoryClassification',
    'inventoryEvidenceDigestHex',
  ], `cutover review-profile route instance ${index}`);
  if (!['funded', 'drained', 'never-funded', 'unresolved'].includes(
    String(record.inventoryClassification),
  )) {
    throw new Error(`cutover review-profile route instance ${index} classification is invalid`);
  }
  const ergoTreeSha256Hex = digest(
    record.ergoTreeSha256Hex,
    'route instance ErgoTree digest',
  );
  return {
    instanceId: publicIdentifier(record.instanceId, 'route instance ID'),
    address: ergoTestnetP2sAddress(
      record.address,
      ergoTreeSha256Hex,
      'route instance address',
    ),
    ergoTreeSha256Hex,
    singletonTokenIdHex: nullableDigest(record.singletonTokenIdHex, 'route instance singleton token ID'),
    genesisBoxIdHex: nullableDigest(record.genesisBoxIdHex, 'route instance genesis box ID'),
    inventoryClassification: record.inventoryClassification,
    inventoryEvidenceDigestHex: digest(record.inventoryEvidenceDigestHex, 'route instance inventory digest'),
  } as TestnetCutoverReviewRouteInstanceV4;
}

function validateComponentBlockers(value: unknown): ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4['componentBlockers'] {
  const record = exactRecord(value, [
    'ergoCutoverObservation',
    'frontierRelayerCompatibility',
  ], 'cutover review-profile component blockers');
  const ergoCutoverObservation = sortedUniqueStrings(
    requireArray(record.ergoCutoverObservation, 'Ergo observation blockers'),
    'Ergo observation blocker',
  );
  const frontierRelayerCompatibility = sortedUniqueStrings(
    requireArray(record.frontierRelayerCompatibility, 'Frontier/relayer blockers'),
    'Frontier/relayer blocker',
  );
  if (
    canonicalJson(ergoCutoverObservation) !== canonicalJson(record.ergoCutoverObservation)
    || canonicalJson(frontierRelayerCompatibility)
      !== canonicalJson(record.frontierRelayerCompatibility)
  ) {
    throw new Error('cutover review-profile component blockers must be sorted and unique');
  }
  return { ergoCutoverObservation, frontierRelayerCompatibility };
}

function validateChecks(value: unknown): void {
  const record = exactRecord(value, [
    'builderAssertions',
    'serializedBoundary',
  ], 'cutover review-profile checks');
  const builder = exactRecord(record.builderAssertions, [
    'sameProcessComponentProvenanceVerified',
    'exactApplicationBindingsMatched',
    'exactDeploymentLineageTerminalMatched',
    'exactLegacyRouteSetMatched',
    'exactInventoryDigestPerRouteMatched',
    'exactReplayContributionPerObservedLineageMatched',
    'sourceOriginIdentifiersExcluded',
    'rawObservationObjectsExcluded',
  ], 'cutover review-profile builder assertions');
  for (const key of [
    'sameProcessComponentProvenanceVerified',
    'exactApplicationBindingsMatched',
    'exactDeploymentLineageTerminalMatched',
    'exactLegacyRouteSetMatched',
    'exactInventoryDigestPerRouteMatched',
    'exactReplayContributionPerObservedLineageMatched',
    'sourceOriginIdentifiersExcluded',
    'rawObservationObjectsExcluded',
  ] as const) {
    if (builder[key] !== true) {
      throw new Error(`cutover review-profile builder assertion ${key} must be true`);
    }
  }
  const serialized = exactRecord(record.serializedBoundary, [
    'componentProvenanceReplayed',
    'sourceComponentMembershipReplayed',
    'callerAuthorityClaimsAccepted',
  ], 'cutover review-profile serialized boundary');
  if (
    serialized.componentProvenanceReplayed !== false
    || serialized.sourceComponentMembershipReplayed !== false
    || serialized.callerAuthorityClaimsAccepted !== false
  ) {
    throw new Error('cutover review-profile serialized authority boundary is invalid');
  }
}

function validateAuthority(value: unknown): void {
  const record = exactRecord(value, AUTHORITY_KEYS, 'cutover review-profile authority');
  assertAllFalse(record, 'cutover review-profile authority');
}

function normalizeContractIds(value: Record<string, unknown>): ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4['application']['contractIds'] {
  const record = exactRecord(value, [
    'tracker',
    'duplicatePrevention',
    'sourceLock',
    'pooledReserve',
  ], 'V4 contract IDs');
  return {
    tracker: digest(record.tracker, 'tracker contract ID'),
    duplicatePrevention: digest(record.duplicatePrevention, 'duplicate-prevention contract ID'),
    sourceLock: digest(record.sourceLock, 'source-lock contract ID'),
    pooledReserve: digest(record.pooledReserve, 'pooled-reserve contract ID'),
  };
}

function compiledContractIds(
  compiled: Readonly<ValidityApplicationPooledReserveInstanceV4Candidate>,
): ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4['application']['contractIds'] {
  return normalizeContractIds({
    tracker: compiled.contracts.tracker.receipt.contractIdHex,
    duplicatePrevention: compiled.contracts.duplicatePrevention.receipt.contractIdHex,
    sourceLock: compiled.contracts.sourceLock.receipt.contractIdHex,
    pooledReserve: compiled.contracts.pooledReserve.receipt.contractIdHex,
  });
}

function assertExactRouteKeys(
  map: ReadonlyMap<string, unknown>,
  label: string,
): void {
  const expected = new Set(
    VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
      .map(route => route.routeId),
  );
  if (
    map.size !== expected.size
    || [...expected].some(routeId => !map.has(routeId))
  ) {
    throw new Error(`${label} do not cover the exact legacy route registry`);
  }
}

function assertExactLayerRouteKeys(
  map: ReadonlyMap<string, unknown>,
  layer: LegacyRouteRetirementRequirementV4['layer'],
  label: string,
): void {
  const expected = new Set(
    VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
      .filter(route => route.layer === layer)
      .map(route => route.routeId),
  );
  if (
    map.size !== expected.size
    || [...expected].some(routeId => !map.has(routeId))
  ) {
    throw new Error(`${label} does not cover the exact ${layer} route registry`);
  }
}

function assertExactCompatibilityRouteKeys(
  map: ReadonlyMap<string, unknown>,
): void {
  const expected = new Set(
    VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
      .filter(route => route.layer === 'frontier' || route.layer === 'relayer')
      .map(route => route.routeId),
  );
  if (
    map.size !== expected.size
    || [...expected].some(routeId => !map.has(routeId))
  ) {
    throw new Error('Frontier/relayer inventory does not cover its exact route registry');
  }
}

function assertReplayLineagesMatchDuplicatePreventionInstances(
  lineages: readonly TestnetCutoverReviewReplayLineageV4[],
  routes: readonly TestnetCutoverReviewRouteV4[],
): void {
  const expected = routes
    .filter(route => route.layer === 'ergo'
      && route.routeClass === 'duplicate-prevention')
    .flatMap(route => route.inventory.instances.map(instance =>
      lineageKey(route.routeId, instance.instanceId)
    ))
    .sort(compareCodeUnits);
  const actual = lineages
    .map(lineage => lineageKey(lineage.routeId, lineage.instanceId))
    .sort(compareCodeUnits);
  assertStrictlySortedUnique(
    expected,
    'duplicate-prevention route instance lineage keys',
  );
  assertStrictlySortedUnique(actual, 'replay lineage keys');
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(
      'cutover review-profile replay lineages do not match the exact duplicate-prevention route instances',
    );
  }
}

function sanitizedRouteBindingDigest(
  value: Readonly<{
    source: unknown;
    bindingDigestHex: unknown;
    instances: readonly TestnetCutoverReviewRouteInstanceV4[];
    blockerCodes: readonly string[];
  }>,
): string {
  return sha256CanonicalJson(
    {
      source: value.source,
      bindingDigestHex: value.bindingDigestHex,
      instances: value.instances,
      blockerCodes: value.blockerCodes,
    },
    VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_SANITIZED_ROUTE_V4_DIGEST_DOMAIN,
  );
}

function falseAuthority(): ReviewAuthority {
  return Object.fromEntries(AUTHORITY_KEYS.map(key => [key, false])) as ReviewAuthority;
}

function assertAllFalse(value: unknown, label: string): void {
  const record = dataRecord(value, label);
  if (Object.values(record).some(candidate => candidate !== false)) {
    throw new Error(`${label} contains an authority claim`);
  }
}

function assertFalseFields(
  value: unknown,
  keys: readonly string[],
  label: string,
): void {
  const record = dataRecord(value, label);
  for (const key of keys) {
    if (record[key] !== false) throw new Error(`${label} ${key} must remain false`);
  }
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  const record = dataRecord(value, label);
  const actual = Object.keys(record).sort(compareCodeUnits);
  const expected = [...expectedKeys].sort(compareCodeUnits);
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} contains unknown or missing fields`);
  }
  return record;
}

function dataRecord(value: unknown, label: string): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain data object`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function uniqueMap<T>(
  values: readonly T[],
  keyOf: (value: T) => string,
  label: string,
): Map<string, T> {
  if (!Array.isArray(values)) throw new Error(`${label} values must be an array`);
  const result = new Map<string, T>();
  for (const value of values) {
    const key = keyOf(value);
    if (result.has(key)) throw new Error(`${label} repeats ${key}`);
    result.set(key, value);
  }
  return result;
}

function sortedUniqueStrings(values: readonly unknown[], label: string): string[] {
  const normalized = [...new Set(
    values.map(value => publicIdentifier(value, label)),
  )].sort(compareCodeUnits);
  assertStrictlySortedUnique(normalized, `${label}s`);
  return normalized;
}

function assertStrictlySortedUnique(values: readonly string[], label: string): void {
  for (let index = 1; index < values.length; index += 1) {
    if (compareCodeUnits(values[index - 1]!, values[index]!) >= 0) {
      throw new Error(`${label} must be strictly sorted and unique`);
    }
  }
}

function lineageKey(routeId: string, instanceId: string): string {
  return `${routeId}/${instanceId}`;
}

function digest(value: unknown, label: string): string {
  return fixedHex(value, 32, label);
}

function nullableDigest(value: unknown, label: string): string | null {
  return value === null ? null : digest(value, label);
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be ${bytes} bytes of hex`);
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (
    normalized.length !== bytes * 2
    || !/^[0-9a-f]+$/.test(normalized)
    || /^0+$/.test(normalized)
  ) {
    throw new Error(`${label} must be nonzero ${bytes}-byte hex`);
  }
  return normalized;
}

function address(value: unknown, label: string): string {
  return `0x${fixedHex(value, 20, label)}`;
}

function canonicalUint64(value: unknown, label: string): string {
  if (
    (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint')
    || (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0))
  ) {
    throw new Error(`${label} must be an unsigned integer`);
  }
  const text = String(value);
  if (!/^(?:0|[1-9][0-9]*)$/.test(text)) throw new Error(`${label} must be canonical decimal`);
  const parsed = BigInt(text);
  if (parsed > 0xffff_ffff_ffff_ffffn) throw new Error(`${label} exceeds uint64`);
  return parsed.toString();
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return Number(value);
}

function nonemptyAscii(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || Buffer.byteLength(value, 'ascii') !== value.length
    || /[\x00-\x1f\x7f]/.test(value)
  ) {
    throw new Error(`${label} must be nonempty printable ASCII`);
  }
  return value;
}

function publicIdentifier(value: unknown, label: string): string {
  const text = nonemptyAscii(value, label);
  if (
    text.length > 128
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(text)
  ) {
    throw new Error(
      `${label} must be a bounded public identifier without path or origin syntax`,
    );
  }
  return text;
}

function ergoTestnetP2sAddress(
  value: unknown,
  expectedErgoTreeSha256Hex: string,
  label: string,
): string {
  const encoded = nonemptyAscii(value, label);
  let decoded: ErgoAddress;
  try {
    decoded = ErgoAddress.fromBase58(encoded);
  } catch {
    throw new Error(`${label} must be a valid Ergo address`);
  }
  if (
    decoded.toString() !== encoded
    || Number(decoded.network) !== Network.Testnet
    || Number(decoded.type) !== AddressType.P2S
    || sha256HexBytes(decoded.ergoTree) !== expectedErgoTreeSha256Hex
  ) {
    throw new Error(
      `${label} must be canonical testnet P2S and bind the retained ErgoTree digest`,
    );
  }
  return encoded;
}

function sha256HexBytes(hex: string): string {
  return createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
