import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

const provenance = vi.hoisted(() => ({
  reviews: new WeakSet<object>(),
  replayPackets: new WeakSet<object>(),
  assert(set: WeakSet<object>, value: unknown, label: string): void {
    if (value === null || typeof value !== 'object' || !set.has(value)) {
      throw new Error(`${label} was not built in this process`);
    }
  },
}));

vi.mock(
  './validity-application-pooled-reserve-testnet-cutover-review-profile-v4.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-testnet-cutover-review-profile-v4.js'
      )
    >(),
    assertValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Provenance(
      value: unknown,
    ) {
      provenance.assert(provenance.reviews, value, 'cutover review');
    },
    validateValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
      value: unknown,
    ) {
      provenance.assert(provenance.reviews, value, 'cutover review');
      return {
        profile: value,
        serializedValidation: {
          canonicalDigestMatched: true,
          exactStaticRouteSetMatched: true,
          exactInternalReplayRouteJoinMatched: true,
          sanitizedFieldPolicyMatched: true,
          componentProvenanceReplayed: false,
          sourceComponentMembershipReplayed: false,
          callerAuthorityClaimsAccepted: false,
        },
      };
    },
  }),
);

vi.mock(
  './validity-application-pooled-reserve-historical-replay-genesis-v4.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-historical-replay-genesis-v4.js'
      )
    >(),
    assertValidityApplicationPooledReserveHistoricalReplayGenesisV4Provenance(
      value: unknown,
    ) {
      provenance.assert(provenance.replayPackets, value, 'historical replay packet');
    },
  }),
);

import { getDupTreeDigest } from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
} from './ergo-encoding.js';
import {
  SUBSTRATE_FEDERATED_CUTOVER_GENERATION_V1_STATUS,
  assertSubstrateFederatedCutoverGenerationV1Provenance,
  buildSubstrateFederatedCutoverGenerationV1,
  validateSubstrateFederatedCutoverGenerationV1,
} from './substrate-federated-cutover-generation-v1.js';
import {
  getSubstrateFederatedSettlementFamilyV1FixtureIdentity,
} from './substrate-federated-burn-settlement-v1-fixture.js';
import {
  assertSubstrateFederatedTrackerContractV1Identity,
  type SubstrateFederatedTrackerContractV1Identity,
} from './substrate-federated-tracker-v1.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
} from './validity-application-pooled-reserve-legacy-route-requirements-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6,
} from './validity-application-pooled-reserve-legacy-route-requirements-v6.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_STATUS,
} from './validity-application-pooled-reserve-testnet-cutover-review-profile-v4.js';

const trackerContract = JSON.parse(readFileSync(new URL(
  '../test-vectors/substrate-federated-v1-tracker-contract.json',
  import.meta.url,
), 'utf8')) as SubstrateFederatedTrackerContractV1Identity;
const SOURCE_LINEAGE_ID = '41'.repeat(32);
const REPLAY_BURN_ID = '51'.repeat(32);
const REPLAY_ROUTE_ID = 'ergo-double-unlock-prevention-authenticated';
const REPLAY_INSTANCE_ID = 'authenticated-v2-instance-1';

describe('substrate federated cutover generation V1', () => {
  it('freezes one exact blocked generation over target lineages, replay and all legacy routes', () => {
    const input = fixture();
    const manifest = buildSubstrateFederatedCutoverGenerationV1(input);

    expect(manifest.status).toBe(
      SUBSTRATE_FEDERATED_CUTOVER_GENERATION_V1_STATUS,
    );
    expect(manifest.generation).toMatchObject({
      settlementNetworkId: 'ergo-testnet',
      sourceNetworkScope: 'public-testnet',
      trustModel: 'federated_non_trustless',
    });
    expect(manifest.globalReplay.canonicalBurnIdsHex).toEqual([REPLAY_BURN_ID]);
    expect(manifest.globalReplay.contributions).toHaveLength(1);
    expect(manifest.legacyRoutes.routeCount).toBe(
      VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6.length,
    );
    expect(manifest.legacyRoutes.routeCount).toBe(53);
    expect(manifest.legacyRoutes.historicalAuthorityCounts.ownerKey)
      .toBeGreaterThan(0);
    expect(manifest.legacyRoutes.historicalAuthorityCounts.committee)
      .toBeGreaterThan(0);
    expect(manifest.legacyRoutes.historicalAuthorityCounts.singleR9)
      .toBeGreaterThan(0);
    expect(Object.values(manifest.legacyRoutes.historicalAuthorityCounts)
      .reduce((sum, count) => sum + count, 0)).toBe(53);
    expect(manifest.target.sourceRuntime).toMatchObject({
      sourceRuntimeCodeSha256Hex:
        trackerContract.application.sourceRuntimeCodeSha256Hex,
      runtimeProfileIdHex: trackerContract.application.runtimeProfileIdHex,
    });
    expect(manifest.target.lineages.tracker.genesisInputBoxIdHex)
      .toBe(manifest.target.lineages.tracker.singletonTokenIdHex);
    expect(manifest.target.lineages.duplicatePrevention.genesisInputBoxIdHex)
      .toBe(manifest.target.lineages.duplicatePrevention.singletonTokenIdHex);
    expect(manifest.target.lineages.pooledReserve.genesisInputBoxIdHex)
      .toBe(manifest.target.lineages.pooledReserve.singletonTokenIdHex);
    expect(manifest.target.genesisPayloads.duplicatePrevention
      .additionalRegisters).toEqual({
        R4: encodeCollByteRegister(Buffer.from(
          manifest.target.profile.familyIdHex,
          'hex',
        )),
        R5: manifest.globalReplay.sourceRegisters.R5,
      });
    expect(manifest.target.genesisPayloads.duplicatePrevention
      .additionalRegisters.R4).not.toBe(manifest.globalReplay.sourceRegisters.R4);
    expect([
      manifest.target.genesisPayloads.tracker,
      manifest.target.genesisPayloads.duplicatePrevention,
      manifest.target.genesisPayloads.pooledReserve,
    ].every(payload =>
      payload.valueNanoErg === '10000000'
      && payload.assets.length === 1
      && payload.assets[0]!.amount === '1'
    )).toBe(true);
    expect(manifest.target.genesisPayloads).toMatchObject({
      importedReplayDigestHex: manifest.globalReplay.duplicatePreventionDigestHex,
      creationHeightsBoundAtMaterialization: false,
      outputIdsBoundAtMaterialization: false,
    });
    expect(Object.values(manifest.boundaries).every(value => value === false))
      .toBe(true);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(() => assertSubstrateFederatedCutoverGenerationV1Provenance(manifest))
      .not.toThrow();

    const copied = structuredClone(manifest);
    const validated = validateSubstrateFederatedCutoverGenerationV1({
      ...input,
      manifest: copied,
    });
    expect(validated.validation).toEqual({
      exactSourceInputsReplayed: true,
      canonicalManifestMatched: true,
      callerAuthorityClaimsAccepted: false,
      targetNodeAcceptanceEstablished: false,
      fundsAuthorityEstablished: false,
    });
    expect(() => assertSubstrateFederatedCutoverGenerationV1Provenance(copied))
      .toThrow(/not built in this process/);
  });

  it('rejects copied compiler identity and tracker metadata drift', () => {
    const copiedFamily = fixture();
    expect(() => buildSubstrateFederatedCutoverGenerationV1({
      ...copiedFamily,
      familyIdentity: structuredClone(copiedFamily.familyIdentity),
    })).toThrow(/same-process compiler provenance/);

    const driftedTracker = structuredClone(trackerContract) as any;
    driftedTracker.application.sourceRuntimeCodeSha256Hex = '61'.repeat(32);
    expect(() => assertSubstrateFederatedTrackerContractV1Identity(driftedTracker))
      .toThrow(/metadata is not the pinned artifact/);
    expect(() => buildSubstrateFederatedCutoverGenerationV1({
      ...fixture(),
      trackerContract: driftedTracker,
    })).toThrow(/metadata is not the pinned artifact/);
  });

  it('rejects copied cutover-review and historical-replay producer outputs', () => {
    const copiedReview = fixture();
    expect(() => buildSubstrateFederatedCutoverGenerationV1({
      ...copiedReview,
      cutoverReview: structuredClone(copiedReview.cutoverReview),
    })).toThrow(/cutover review was not built in this process/);

    const copiedReplay = fixture();
    expect(() => buildSubstrateFederatedCutoverGenerationV1({
      ...copiedReplay,
      historicalReplayGenesis:
        structuredClone(copiedReplay.historicalReplayGenesis),
    })).toThrow(/historical replay packet was not built in this process/);
  });

  it('rejects source/runtime and replay joins that differ from the reviewed generation', () => {
    const runtimeDrift = fixture();
    runtimeDrift.cutoverReview.application.runtimeProfileIdHex = '62'.repeat(32);
    expect(() => buildSubstrateFederatedCutoverGenerationV1(runtimeDrift))
      .toThrow(/runtime profile ID differs from the source review/);

    const replayPacketDrift = fixture();
    replayPacketDrift.historicalReplayGenesis.packetDigestHex = '63'.repeat(32);
    expect(() => buildSubstrateFederatedCutoverGenerationV1(replayPacketDrift))
      .toThrow(/replay packet differs from the cutover review/);

    const observationDrift = fixture();
    observationDrift.historicalReplayGenesis.observation
      .cutoverObservationReportDigestHex = '64'.repeat(32);
    expect(() => buildSubstrateFederatedCutoverGenerationV1(observationDrift))
      .toThrow(/replay observation differs from the cutover review/);

    const replaySetDrift = fixture();
    replaySetDrift.historicalReplayGenesis.duplicatePreventionGenesis
      .canonicalBurnIdsHex = [REPLAY_BURN_ID, REPLAY_BURN_ID];
    expect(() => buildSubstrateFederatedCutoverGenerationV1(replaySetDrift))
      .toThrow(/strictly sorted and unique/);

    const legacyOverlap = fixture();
    legacyOverlap.cutoverReview.application.contractIds.tracker =
      trackerContract.contractIdHex;
    expect(() => buildSubstrateFederatedCutoverGenerationV1(legacyOverlap))
      .toThrow(/overlaps the reviewed application or integrated V5 route/);
  });

  it('rejects omitted routes, unresolved funds and caller retirement claims', () => {
    const omitted = fixture();
    omitted.cutoverReview.routes.pop();
    expect(() => buildSubstrateFederatedCutoverGenerationV1(omitted))
      .toThrow(/exact V4 legacy route set/);

    const funded = fixture();
    funded.cutoverReview.routes[0]!.inventory.instances.push({
      instanceId: 'funded-instance',
      address: 'test-address',
      ergoTreeSha256Hex: hash('funded-tree'),
      singletonTokenIdHex: null,
      genesisBoxIdHex: null,
      inventoryClassification: 'funded',
      inventoryEvidenceDigestHex: hash('funded-evidence'),
    });
    expect(() => buildSubstrateFederatedCutoverGenerationV1(funded))
      .toThrow(/is funded/);

    const claimed = fixture();
    claimed.cutoverReview.routes[0]!.retirement.routeRetired = true;
    expect(() => buildSubstrateFederatedCutoverGenerationV1(claimed))
      .toThrow(/does not accept retirement claims/);

    const duplicated = fixture();
    duplicated.cutoverReview.routes.push(
      structuredClone(duplicated.cutoverReview.routes[0]!),
    );
    expect(() => buildSubstrateFederatedCutoverGenerationV1(duplicated))
      .toThrow(/cutover review route .* is duplicated/);
  });

  it('rejects isolated tracker, DUP and reserve genesis-register drift', () => {
    const cases = [
      ['tracker', 'R5'],
      ['duplicatePrevention', 'R4'],
      ['pooledReserve', 'R6'],
    ] as const;
    for (const [role, register] of cases) {
      const input = fixture();
      const manifest = structuredClone(
        buildSubstrateFederatedCutoverGenerationV1(input),
      ) as any;
      manifest.target.genesisPayloads[role].additionalRegisters[register] =
        '0e00';
      expect(() => validateSubstrateFederatedCutoverGenerationV1({
        ...input,
        manifest,
      }), `${role} ${register}`).toThrow(/differs from its exact source inputs/);
    }
  });

  it('rejects manifest mutation even when all exact source inputs are retained', () => {
    const input = fixture();
    const manifest = structuredClone(
      buildSubstrateFederatedCutoverGenerationV1(input),
    ) as any;
    manifest.boundaries.fundsAuthorityEstablished = true;

    expect(() => validateSubstrateFederatedCutoverGenerationV1({
      ...input,
      manifest,
    })).toThrow(/differs from its exact source inputs/);
  });
});

function fixture(): any {
  const replayDigest = getDupTreeDigest([REPLAY_BURN_ID]);
  const replayPacketDigest = hash('historical-replay-packet');
  const cutoverObservationDigest = hash('cutover-observation');
  const routes = VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
    .map(requirement => {
      const inventoryDigest = hash(`inventory-${requirement.routeId}`);
      const replayInstance = requirement.routeId === REPLAY_ROUTE_ID
        ? [{
          instanceId: REPLAY_INSTANCE_ID,
          address: 'test-address',
          ergoTreeSha256Hex: hash('replay-tree'),
          singletonTokenIdHex: hash('replay-singleton'),
          genesisBoxIdHex: hash('replay-genesis'),
          inventoryClassification: 'drained',
          inventoryEvidenceDigestHex: hash('replay-inventory-evidence'),
        }]
        : [];
      return {
        ...requirement,
        inventory: {
          source: requirement.layer === 'ergo'
            ? 'ergo-cutover-observation'
            : 'frontier-relayer-compatibility-inventory',
          bindingDigestHex: inventoryDigest,
          sanitizedBindingDigestHex: hash(`sanitized-${requirement.routeId}`),
          instances: replayInstance,
          blockerCodes: [],
        },
        declaration: {
          declaredStatus: 'inactive-unverified',
          inventoryEvidenceDigestHex: inventoryDigest,
          retirementEvidenceDigestHex: hash(`retirement-${requirement.routeId}`),
        },
        retirement: {
          evidenceAuthenticated: false,
          routeRetired: false,
        },
      };
    });
  const cutoverReview = {
    schema: 'e2s.validity-application-pooled-reserve-testnet-cutover-review-profile.v4',
    version: 4,
    status:
      VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_STATUS,
    profileDigestHex: hash('cutover-review-profile'),
    scope: {
      settlementNetworkId: 'ergo-testnet',
      sourceNetworkScope: 'public-testnet',
      sourceChainId: '7777',
      sourceOriginIdentifiersIncluded: false,
      rawObservationObjectsIncluded: false,
    },
    components: {
      historicalReplayGenesisPacketDigestHex: replayPacketDigest,
      compatibilityInventoryPacketDigestHex: hash('compatibility-inventory'),
      ergoCutoverObservationReportDigestHex: cutoverObservationDigest,
    },
    application: {
      lineageProfileIdHex: SOURCE_LINEAGE_ID,
      runtimeProfileIdHex: trackerContract.application.runtimeProfileIdHex,
      contractIds: {
        tracker: hash('legacy-tracker'),
        duplicatePrevention: hash('legacy-dup'),
        sourceLock: hash('legacy-source-lock'),
        pooledReserve: hash('legacy-reserve'),
      },
    },
    deployment: {
      bridgeAddress: `0x${trackerContract.application.bridgeAddressHex}`,
      tokenAddress: `0x${trackerContract.application.tokenAddressHex}`,
      bridgeRuntimeCodeSha256Hex:
        trackerContract.application.bridgeRuntimeCodeSha256Hex,
      bridgeRuntimeCodeBytes: trackerContract.application.bridgeRuntimeCodeBytes,
      tokenRuntimeCodeSha256Hex:
        trackerContract.application.tokenRuntimeCodeSha256Hex,
      tokenRuntimeCodeBytes: trackerContract.application.tokenRuntimeCodeBytes,
    },
    replay: {
      routeProfileDigestHex: hash('route-profile'),
      routeRequirementsDigestHex: hash('route-requirements'),
      historicalLineageCount: 1,
      importedCanonicalBurnIdCount: 1,
      lineageSetDigestHex: hash('lineage-set'),
      duplicatePreventionGenesisDigestHex: replayDigest,
      allObservedLineagesComposed: true,
      inventoryExhaustivenessAuthenticated: false,
      lineages: [{
        routeId: REPLAY_ROUTE_ID,
        instanceId: REPLAY_INSTANCE_ID,
        lineagePacketDigestHex: hash('replay-lineage-packet'),
        lineageClassification: 'raw-reconstructed',
        rawReplayKeyCount: 1,
        contributionKind: 'authenticated-v2-replay-import',
        eventMapping: 'event-complete-mapping-bound',
        sourceAdmission: 'source-admission-bound',
        replayImportPacketDigestHex: hash('replay-import'),
        canonicalBurnIdCount: 1,
        canonicalBurnIdsDigestHex: hash('canonical-burn-set'),
      }],
    },
    routes,
    blockers: ['cutover-review-remains-non-authorizing'],
    authority: allFalse([
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
    ]),
  };
  const historicalReplayGenesis = {
    schema: 'e2s.validity-application-pooled-reserve-historical-replay-genesis.v4',
    version: 4,
    packetDigestHex: replayPacketDigest,
    lineage: {
      lineageProfileIdHex: `0x${SOURCE_LINEAGE_ID}`,
      encodedLineageProfileHex: `0x${'42'.repeat(64)}`,
    },
    observation: {
      cutoverObservationReportDigestHex: cutoverObservationDigest,
      routeProfileDigestHex: hash('route-profile'),
      requirementsDigestHex: hash('route-requirements'),
      networkId: 'ergo-testnet',
      stableSnapshot: {},
      sourceIdDigestsHex: [hash('source-a'), hash('source-b')],
    },
    contributions: [{
      kind: 'authenticated-v2-replay-import',
      routeId: REPLAY_ROUTE_ID,
      sourceSurface: 'contracts/DoubleUnlockPreventionAuthenticated.es',
      instanceId: REPLAY_INSTANCE_ID,
      lineagePacketDigestHex: hash('replay-lineage-packet'),
      lineageClassification: 'raw-reconstructed',
      rawReplayKeyCount: 1,
      replayImportPacketDigestHex: hash('replay-import'),
      canonicalBurnIdsHex: [REPLAY_BURN_ID],
    }],
    duplicatePreventionGenesis: {
      canonicalBurnIdsHex: [REPLAY_BURN_ID],
      digestHex: replayDigest,
      registers: {
        R4: encodeCollByteRegister(Buffer.from(SOURCE_LINEAGE_ID, 'hex')),
        R5: encodeAvlTreeRegister(
          Buffer.from(replayDigest, 'hex'),
          VALIDITY_APPLICATION_POOLED_RESERVE_INSERT_ONLY_AVL_FLAGS,
          1,
        ),
      },
    },
    boundaries: {
      cutoverObservationValidatedInProcess: true,
      exactContributionPerObservedLineage: true,
      deterministicInsertOnlyGenesisBuilt: true,
      allObservedHistoricalLineagesComposed: true,
      profileInstanceInventoryExhaustiveAuthenticated: false,
      legacyRoutesRetired: false,
      profileActivated: false,
      transactionConstructed: false,
      targetNodeAcceptanceEstablished: false,
      nodeCheckPerformed: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
  };
  provenance.reviews.add(cutoverReview);
  provenance.replayPackets.add(historicalReplayGenesis);
  return {
    familyIdentity: getSubstrateFederatedSettlementFamilyV1FixtureIdentity(),
    trackerContract,
    cutoverReview,
    historicalReplayGenesis,
  };
}

function allFalse(keys: readonly string[]): Record<string, false> {
  return Object.fromEntries(keys.map(key => [key, false]));
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
