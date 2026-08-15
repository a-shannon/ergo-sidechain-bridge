import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Network } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { describe, expect, it, vi } from 'vitest';

const provenance = vi.hoisted(() => ({
  compiled: new WeakSet<object>(),
  runtime: new WeakSet<object>(),
  observation: new WeakSet<object>(),
  replay: new WeakSet<object>(),
  provisioning: new WeakSet<object>(),
  cutover: new WeakSet<object>(),
  deploymentIdentity: new WeakSet<object>(),
  deploymentLineage: new WeakSet<object>(),
  compatibilityInventory: new WeakSet<object>(),
  compiledV5: new WeakSet<object>(),
  replayCutoverV5: new WeakSet<object>(),
  provisioningV5: new WeakSet<object>(),
  assert(set: WeakSet<object>, value: unknown, label: string): void {
    if (!value || typeof value !== 'object' || !set.has(value)) {
      throw new Error(`${label} provenance is missing`);
    }
  },
}));

vi.mock(
  './validity-application-pooled-reserve-instance-v4.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import('./validity-application-pooled-reserve-instance-v4.js')
    >(),
    assertCompiledValidityApplicationPooledReserveInstanceV4Candidate(
      value: unknown,
    ) {
      provenance.assert(provenance.compiled, value, 'compiled instance');
    },
  }),
);
vi.mock(
  './pooled-reserve-mint-reservation-runtime-profile-v4.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import('./pooled-reserve-mint-reservation-runtime-profile-v4.js')
    >(),
    assertPooledReserveMintReservationRuntimeProfileV4CandidateProvenance(
      value: unknown,
    ) {
      provenance.assert(provenance.runtime, value, 'runtime profile');
    },
  }),
);
vi.mock(
  './validity-application-pooled-reserve-ergo-cutover-observation-v4.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-ergo-cutover-observation-v4.js'
      )
    >(),
    assertValidityApplicationPooledReserveErgoCutoverObservationV4Provenance(
      value: unknown,
    ) {
      provenance.assert(provenance.observation, value, 'cutover observation');
    },
    validateValidityApplicationPooledReserveErgoCutoverObservationV4Report(
      value: unknown,
    ) {
      provenance.assert(provenance.observation, value, 'cutover observation');
      return value;
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
      provenance.assert(provenance.replay, value, 'historical replay genesis');
    },
  }),
);
vi.mock(
  './validity-application-pooled-reserve-provisioning-v4.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-provisioning-v4.js'
      )
    >(),
    assertValidityApplicationPooledReserveProvisioningV4Packet(
      value: unknown,
    ) {
      provenance.assert(provenance.provisioning, value, 'provisioning packet');
    },
  }),
);
vi.mock(
  './validity-application-pooled-reserve-cutover-candidate-v4.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-cutover-candidate-v4.js'
      )
    >(),
    assertValidityApplicationPooledReserveCutoverCandidateV4Provenance(
      value: unknown,
    ) {
      provenance.assert(provenance.cutover, value, 'cutover candidate');
    },
  }),
);
vi.mock(
  './read-only-deployment-identity-observer.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import('./read-only-deployment-identity-observer.js')
    >(),
    assertDeploymentIdentityCandidateProvenance(value: unknown) {
      provenance.assert(
        provenance.deploymentIdentity,
        value,
        'deployment identity',
      );
    },
  }),
);
vi.mock(
  './authority-bound-deployment-lineage.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import('./authority-bound-deployment-lineage.js')
    >(),
    assertAuthorityBoundDeploymentLineageProvenance(value: unknown) {
      provenance.assert(
        provenance.deploymentLineage,
        value,
        'deployment lineage',
      );
    },
  }),
);
vi.mock(
  './frontier-relayer-compatibility-authority-inventory-v4.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import(
        './frontier-relayer-compatibility-authority-inventory-v4.js'
      )
    >(),
    assertFrontierRelayerCompatibilityAuthorityInventoryV4Provenance(
      value: unknown,
    ) {
      provenance.assert(
        provenance.compatibilityInventory,
        value,
        'compatibility inventory',
      );
    },
  }),
);
vi.mock(
  './validity-application-pooled-reserve-instance-v5.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import('./validity-application-pooled-reserve-instance-v5.js')
    >(),
    assertCompiledValidityApplicationPooledReserveInstanceV5Candidate(
      value: unknown,
    ) {
      provenance.assert(provenance.compiledV5, value, 'compiled V5 instance');
    },
  }),
);
vi.mock(
  './validity-application-pooled-reserve-replay-cutover-v5.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-replay-cutover-v5.js'
      )
    >(),
    assertValidityApplicationPooledReserveReplayCutoverV5Provenance(
      value: unknown,
    ) {
      provenance.assert(provenance.replayCutoverV5, value, 'V5 replay cutover');
    },
  }),
);
vi.mock(
  './validity-application-pooled-reserve-provisioning-v5.js',
  async importOriginal => ({
    ...await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-provisioning-v5.js'
      )
    >(),
    assertValidityApplicationPooledReserveProvisioningV5Provenance(
      value: unknown,
    ) {
      provenance.assert(provenance.provisioningV5, value, 'V5 provisioning');
    },
  }),
);

import type {
  AuthorityBoundDeploymentLineageCandidate,
} from './authority-bound-deployment-lineage.js';
import { getDupTreeDigest } from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
} from './ergo-encoding.js';
import type {
  FrontierRelayerCompatibilityAuthorityInventoryV4,
} from './frontier-relayer-compatibility-authority-inventory-v4.js';
import type {
  PooledReserveMintReservationRuntimeProfileV4Candidate,
} from './pooled-reserve-mint-reservation-runtime-profile-v4.js';
import type {
  DeploymentIdentityCandidate,
} from './read-only-deployment-identity-observer.js';
import { sha256CanonicalJson } from './strict-json.js';
import {
  buildSubstrateFederatedCutoverGenerationV1,
} from './substrate-federated-cutover-generation-v1.js';
import {
  getSubstrateFederatedSettlementFamilyV1FixtureIdentity,
} from './substrate-federated-burn-settlement-v1-fixture.js';
import type {
  ValidityApplicationPooledReserveCutoverCandidateV4,
} from './validity-application-pooled-reserve-cutover-candidate-v4.js';
import type {
  ValidityApplicationPooledReserveErgoCutoverObservationV4Report,
} from './validity-application-pooled-reserve-ergo-cutover-observation-v4.js';
import {
  buildValidityApplicationPooledReserveHistoricalReplayGenesisV4,
  type HistoricalReplayGenesisContributionV4Input,
  type ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet,
} from './validity-application-pooled-reserve-historical-replay-genesis-v4.js';
import type {
  ValidityApplicationPooledReserveInstanceV4Candidate,
} from './validity-application-pooled-reserve-instance-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
} from './validity-application-pooled-reserve-legacy-route-requirements-v4.js';
import type {
  ValidityApplicationPooledReserveProvisioningV4Packet,
} from './validity-application-pooled-reserve-provisioning-v4.js';
import {
  buildValidityApplicationPooledReserveCutoverEligibilityV6,
} from './validity-application-pooled-reserve-cutover-eligibility-v6.js';
import {
  buildValidityApplicationPooledReserveCutoverEligibilityV5,
  type BuildValidityApplicationPooledReserveCutoverEligibilityV5Input,
} from './validity-application-pooled-reserve-cutover-eligibility-v5.js';
import {
  buildValidityApplicationPooledReserveBurnFamilyV6CompilerFixture,
  buildValidityApplicationPooledReserveBurnFamilyV6CompilerFixtureInput,
} from './validity-application-pooled-reserve-burn-family-v6-fixture.js';
import {
  buildValidityApplicationPooledReserveInstanceV6,
} from './validity-application-pooled-reserve-instance-v6.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_PROVISIONING_V5_SCHEMA,
} from './validity-application-pooled-reserve-provisioning-v5.js';
import {
  buildValidityApplicationPooledReserveProvisioningV6,
} from './validity-application-pooled-reserve-provisioning-v6.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_DIGEST_DOMAIN,
  VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REPLAY_LINEAGE_SET_V4_DIGEST_DOMAIN,
  VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_SANITIZED_ROUTE_V4_DIGEST_DOMAIN,
  VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_ROUTE_INVENTORY_V4_DIGEST_DOMAIN,
  assertValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Provenance,
  buildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4,
  validateValidityApplicationPooledReserveTestnetCutoverReviewProfileV4,
  type BuildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Input,
  type ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4,
} from './validity-application-pooled-reserve-testnet-cutover-review-profile-v4.js';

const BRIDGE_ADDRESS = `0x${'11'.repeat(20)}`;
const TOKEN_ADDRESS = `0x${'22'.repeat(20)}`;
const TERMINAL_HEIGHT = '499';
const ACTIVATION_HEIGHT = '500';
const TERMINAL_EXECUTION_HASH = hash('terminal-execution');
const TERMINAL_OBSERVATION_DIGEST = hash('terminal-observation');
const AUTHENTICATED_DUP_ROUTE =
  'ergo-double-unlock-prevention-authenticated';

describe('pooled-reserve V4 sanitized testnet cutover review profile', () => {
  it('composes every route and replay mapping without widening authority', () => {
    const fixture = candidateFixture();
    const profile =
      buildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
        fixture,
      );
    const reversed =
      buildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
        candidateFixture({ reverseCollections: true }),
      );

    expect(reversed).toEqual(profile);
    expect(profile.routes).toHaveLength(
      VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4.length,
    );
    expect(profile.replay.lineages).toHaveLength(
      VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
        .filter(route =>
          route.layer === 'ergo'
          && route.routeClass === 'duplicate-prevention'
        ).length,
    );
    expect(profile.replay.lineages.find(lineage =>
      lineage.routeId === AUTHENTICATED_DUP_ROUTE
    )).toMatchObject({
      rawReplayKeyCount: 2,
      canonicalBurnIdCount: 2,
      eventMapping: 'event-complete-mapping-bound',
      sourceAdmission: 'source-admission-bound',
    });
    expect(profile.activation).toMatchObject({
      parentNativeHeight: TERMINAL_HEIGHT,
      parentExecutionBlockHashHex: TERMINAL_EXECUTION_HASH,
      parentObservationDigestHex: TERMINAL_OBSERVATION_DIGEST,
      parentAuthenticated: false,
      profileActivated: false,
    });
    expect(Object.values(profile.authority).every(value => value === false))
      .toBe(true);
    expect(JSON.stringify(profile)).not.toContain('sourceIdDigestsHex');
    expect(JSON.stringify(profile)).not.toContain('rawInsertedKeysHex');
    const validated =
      validateValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
        structuredClone(profile),
      );
    expect(validated.profile).toEqual(profile);
    expect(validated.serializedValidation).toEqual({
      canonicalDigestMatched: true,
      exactStaticRouteSetMatched: true,
      exactInternalReplayRouteJoinMatched: true,
      sanitizedFieldPolicyMatched: true,
      componentProvenanceReplayed: false,
      sourceComponentMembershipReplayed: false,
      callerAuthorityClaimsAccepted: false,
    });
    expect(() =>
      assertValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Provenance(
        profile,
      )
    ).not.toThrow();
    expect(() =>
      assertValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Provenance(
        structuredClone(profile),
      )
    ).toThrow(/not built in this process/);
  });

  it('feeds the process-built review into blocked V5 cutover eligibility', () => {
    const source = candidateFixture();
    const review =
      buildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
        source,
      );
    const input = eligibilityFixture(
      review,
      source.historicalReplayGenesis.duplicatePreventionGenesis
        .canonicalBurnIdsHex,
    );
    const candidate =
      buildValidityApplicationPooledReserveCutoverEligibilityV5(input);

    expect(candidate.sourceV4.cutoverReviewProfileDigestHex)
      .toBe(review.profileDigestHex);
    expect(candidate.sourceV4.plannedCanonicalBurnIdCount)
      .toBe(review.replay.importedCanonicalBurnIdCount);
    expect(candidate.routeInventory.routeCount).toBe(review.routes.length);
    expect(candidate.replay.mappedLineageCount).toBe(1);
    expect(candidate.replay.emptyLineageCount)
      .toBe(review.replay.lineages.length - 1);
    expect(Object.values(candidate.boundaries).every(value => value === false))
      .toBe(true);
  });

  it('joins the process-built V4 review to real V6 provisioning without authority', async () => {
    const [compilerRequest, compilerFixtureInput] = await Promise.all([
      buildValidityApplicationPooledReserveBurnFamilyV6CompilerFixture(),
      buildValidityApplicationPooledReserveBurnFamilyV6CompilerFixtureInput(),
    ]);
    const compiledV6 = buildValidityApplicationPooledReserveInstanceV6({
      compilerRequest,
      compilerBatchJson: readFileSync(resolve(
        import.meta.dirname,
        '..',
        'test-vectors',
        'validity-application-pooled-reserve-compiler-v6.json',
      ), 'utf8'),
    });
    const source = candidateFixture({
      lineageProfileIdHex: compiledV6.sourceRuntimeLineageProfileIdHex,
      runtimeProfileIdHex: compiledV6.application.runtimeProfileIdHex,
      proofSystemIdHex: compiledV6.sidechainFinalityPolicy.proofSystemIdHex,
    });
    const review =
      buildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
        source,
      );
    const plan = await buildValidityApplicationPooledReserveProvisioningV6({
      compiledInstance: compiledV6,
      historicalReplayGenesis: source.historicalReplayGenesis,
      targetNetwork: {
        ergoNetworkId: 'ergo-testnet',
        ergoAddressNetworkPrefix: 16,
        ergoGenesisBlockIdHex: '66'.repeat(32),
        sourceNetworkIdHex: '11'.repeat(32),
        sidechainIdHex: '22'.repeat(32),
        settlementProfileIdHex: '55'.repeat(32),
      },
      trackerGenesisInputBox: compilerFixtureInput.genesis.trackerInput,
      duplicatePreventionGenesisInputBox:
        compilerFixtureInput.genesis.duplicatePreventionInput,
      settlementVaultGenesisInputBox:
        compilerFixtureInput.genesis.pooledReserveInput,
      values: {
        trackerNanoErg: '2000000',
        duplicatePreventionNanoErg: '2000000',
        pooledReserveNanoErg: '2000000',
      },
      creationHeights: {
        trackerIssuance: 112,
        duplicatePreventionIssuance: 112,
        pooledReserveIssuance: 112,
      },
    });
    const candidate =
      buildValidityApplicationPooledReserveCutoverEligibilityV6({
        cutoverReview: review,
        provisioningPlan: plan,
      });

    expect(candidate.sourceV4.cutoverReviewProfileDigestHex)
      .toBe(review.profileDigestHex);
    expect(candidate.targetV6.provisioningPlanDigestHex)
      .toBe(plan.planDigestHex);
    expect(candidate.targetV6.localPredicateClosure)
      .toEqual(plan.localPredicateClosure);
    expect(candidate.checks.exactV6LocalPredicateClosureIdentityBound)
      .toBe(true);
    expect(Object.values(candidate.boundaries).every(value => value === false))
      .toBe(true);
  });

  it('feeds real replay and review producers into the blocked federated generation', () => {
    const trackerContract = JSON.parse(readFileSync(resolve(
      import.meta.dirname,
      '..',
      'test-vectors',
      'substrate-federated-v1-tracker-contract.json',
    ), 'utf8'));
    const source = candidateFixture({
      runtimeProfileIdHex: trackerContract.application.runtimeProfileIdHex,
      bridgeAddress: `0x${trackerContract.application.bridgeAddressHex}`,
      tokenAddress: `0x${trackerContract.application.tokenAddressHex}`,
      bridgeRuntimeCodeSha256Hex:
        trackerContract.application.bridgeRuntimeCodeSha256Hex,
      bridgeRuntimeCodeBytes:
        trackerContract.application.bridgeRuntimeCodeBytes,
      tokenRuntimeCodeSha256Hex:
        trackerContract.application.tokenRuntimeCodeSha256Hex,
      tokenRuntimeCodeBytes:
        trackerContract.application.tokenRuntimeCodeBytes,
    }) as unknown as Record<string, any>;
    const stableSnapshot = {
      indexedHeight: 500,
      fullHeight: 500,
      bestHeader: {
        idHex: hash('integration-best-header'),
        parentIdHex: hash('integration-parent-header'),
        height: 500,
        extensionRootHex: hash('integration-extension-root'),
      },
    };
    const sourceIdDigestsHex = [
      hash('integration-source-a'),
      hash('integration-source-b'),
    ].sort();
    source.ergoCutoverObservation.observation = {
      stableSnapshot,
      sourceIdDigestsHex,
    };
    for (const lineage of source.ergoCutoverObservation.historicalDupLineages) {
      lineage.sourceSurface =
        VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4.find(
          candidate => candidate.routeId === lineage.routeId,
        )!.sourceSurface;
      lineage.classification = 'never-funded';
      lineage.rawInsertedKeysHex = [];
      lineage.profileDigestHex =
        source.ergoCutoverObservation.profile.profileDigestHex;
      lineage.requirementsDigestHex =
        source.ergoCutoverObservation.profile.requirementsDigestHex;
      lineage.networkId = source.ergoCutoverObservation.profile.networkId;
      lineage.stableSnapshot = stableSnapshot;
      lineage.sourceIdDigestsHex = sourceIdDigestsHex;
      const route = source.ergoCutoverObservation.inventory.routes.find(
        (candidate: any) => candidate.routeId === lineage.routeId,
      );
      route.classification = 'never-funded';
      route.instances[0].classification = 'never-funded';
    }
    const contributions = source.ergoCutoverObservation.historicalDupLineages
      .map((lineage: any): HistoricalReplayGenesisContributionV4Input => ({
        kind: 'empty-observed-lineage',
        routeId: lineage.routeId,
        instanceId: lineage.instanceId,
        lineagePacketDigestHex: lineage.packetDigestHex,
      }));
    const historicalReplayGenesis =
      buildValidityApplicationPooledReserveHistoricalReplayGenesisV4({
        compiledInstance: source.compiledInstance,
        cutoverObservation: source.ergoCutoverObservation,
        contributions,
      });
    provenance.replay.add(historicalReplayGenesis);
    source.historicalReplayGenesis = historicalReplayGenesis;
    source.provisioning.duplicatePreventionGenesis = {
      mode: 'historical-replay-genesis',
      historicalReplayGenesisPacketDigestHex:
        historicalReplayGenesis.packetDigestHex,
      digestHex:
        historicalReplayGenesis.duplicatePreventionGenesis.digestHex,
    };
    source.cutoverCandidate.replayCutover = {
      historicalReplayGenesisPacketDigestHex:
        historicalReplayGenesis.packetDigestHex,
      cutoverObservationReportDigestHex:
        historicalReplayGenesis.observation.cutoverObservationReportDigestHex,
      importedHistoricalLineageCount:
        historicalReplayGenesis.contributions.length,
      importedCanonicalBurnIdCount:
        historicalReplayGenesis.duplicatePreventionGenesis
          .canonicalBurnIdsHex.length,
    };
    const review =
      buildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
        source as BuildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Input,
      );
    const manifest = buildSubstrateFederatedCutoverGenerationV1({
      familyIdentity:
        getSubstrateFederatedSettlementFamilyV1FixtureIdentity(),
      trackerContract,
      cutoverReview: review,
      historicalReplayGenesis,
    });

    expect(manifest.sourceReview.cutoverReviewProfileDigestHex)
      .toBe(review.profileDigestHex);
    expect(manifest.globalReplay.sourcePacketDigestHex)
      .toBe(historicalReplayGenesis.packetDigestHex);
    expect(manifest.target.genesisPayloads.duplicatePrevention
      .additionalRegisters.R4).not.toBe(
        manifest.globalReplay.sourceRegisters.R4,
      );
    expect(Object.values(manifest.boundaries).every(value => value === false))
      .toBe(true);
  });

  it('rejects scope, profile, deployment, route, and authority mismatches', () => {
    const cases: readonly [
      string,
      (fixture: MutableFixture) => void,
      RegExp,
    ][] = [
      [
        'local source network',
        fixture => {
          fixture.deploymentIdentity.view.declaredNetworkScope =
            'local-devnet';
        },
        /public testnets/,
      ],
      [
        'inert deployment-lineage profile',
        fixture => {
          fixture.compatibilityInventory.observations
            .reviewedDeploymentLineageProfile = 'inert-conformance-profile';
        },
        /non-inert deployment-lineage profile/,
      ],
      [
        'runtime code drift',
        fixture => {
          fixture.runtimeProfile.profile.bridgeRuntimeCodeSha256Hex =
            hash('other-bridge-code');
        },
        /deployment identity or code binding differs/,
      ],
      [
        'activation parent drift',
        fixture => {
          fixture.cutoverCandidate.activationParent.executionBlockHashHex =
            hash('other-terminal');
        },
        /exact deployment-lineage terminal/,
      ],
      [
        'route inventory drift',
        fixture => {
          fixture.cutoverCandidate.legacyRouteRetirement.declarations[0]!
            .inventoryEvidenceDigestHex = hash('other-inventory');
        },
        /does not bind its exact inventory/,
      ],
      [
        'authority widening',
        fixture => {
          (fixture.cutoverCandidate.authority as unknown as {
            mintAuthorized: boolean;
          }).mintAuthorized = true;
        },
        /authority claim/,
      ],
      [
        'path-like public instance identifier',
        fixture => {
          fixture.ergoCutoverObservation.inventory.routes[0]!
            .instances[0]!.instanceId = 'private/source';
        },
        /public identifier/,
      ],
    ];

    for (const [label, mutate, expected] of cases) {
      const fixture = candidateFixture() as unknown as MutableFixture;
      mutate(fixture);
      expect(
        () => buildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
          fixture as unknown as BuildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Input,
        ),
        label,
      ).toThrow(expected);
    }
  });

  it('rejects coordinated serialized authority, route, replay, and shape mutations', () => {
    const profile =
      buildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
        candidateFixture(),
      );

    const authority = structuredClone(profile) as MutableProfile;
    (authority.authority as unknown as { mintAuthorized: boolean })
      .mintAuthorized = true;
    redigest(authority);
    expect(() =>
      validateValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
        authority,
      )
    ).toThrow(/authority claim/);

    const route = structuredClone(profile) as MutableProfile;
    route.routes.pop();
    redigest(route);
    expect(() =>
      validateValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
        route,
      )
    ).toThrow(/route count is incomplete/);

    const replay = structuredClone(profile) as MutableProfile;
    const empty = replay.replay.lineages.find(lineage =>
      lineage.contributionKind === 'empty-observed-lineage'
    )!;
    empty.eventMapping = 'event-complete-mapping-bound';
    redigest(replay);
    expect(() =>
      validateValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
        replay,
      )
    ).toThrow(/replay lineage .* boundary is invalid/);

    const replayOmission = structuredClone(profile) as MutableProfile;
    const removedLineage = replayOmission.replay.lineages.pop()!;
    replayOmission.replay.historicalLineageCount -= 1;
    replayOmission.replay.importedCanonicalBurnIdCount -=
      removedLineage.canonicalBurnIdCount;
    replayOmission.replay.lineageSetDigestHex = sha256CanonicalJson(
      replayOmission.replay.lineages,
      VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REPLAY_LINEAGE_SET_V4_DIGEST_DOMAIN,
    );
    redigest(replayOmission);
    expect(() =>
      validateValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
        replayOmission,
      )
    ).toThrow(/do not match the exact duplicate-prevention route instances/);

    const instanceOmission = structuredClone(profile) as MutableProfile;
    const ergoRoute = instanceOmission.routes.find(candidate =>
      candidate.layer === 'ergo'
    )!;
    ergoRoute.inventory.instances.pop();
    redigest(instanceOmission);
    expect(() =>
      validateValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
        instanceOmission,
      )
    ).toThrow(/inventory boundary|sanitized inventory digest/);

    const allowedFieldLeak = structuredClone(profile) as MutableProfile;
    allowedFieldLeak.routes[0]!.inventory.blockerCodes.push('private/source');
    allowedFieldLeak.routes[0]!.inventory.blockerCodes.sort();
    redigest(allowedFieldLeak);
    expect(() =>
      validateValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
        allowedFieldLeak,
      )
    ).toThrow(/public identifier/);

    const sourceLeak = structuredClone(profile) as MutableProfile & {
      scope: MutableProfile['scope'] & { sourceIdDigestsHex?: string[] };
    };
    sourceLeak.scope.sourceIdDigestsHex = [hash('source-a'), hash('source-b')];
    redigest(sourceLeak);
    expect(() =>
      validateValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
        sourceLeak,
      )
    ).toThrow(/scope contains unknown or missing fields/);

    const coordinatedRewrite = structuredClone(profile) as MutableProfile;
    const nonReplayRoute = coordinatedRewrite.routes.find(candidate =>
      candidate.layer === 'ergo'
      && candidate.routeClass !== 'duplicate-prevention'
    )!;
    nonReplayRoute.inventory.instances[0]!.instanceId =
      'coordinated-public-rewrite';
    nonReplayRoute.inventory.sanitizedBindingDigestHex =
      sanitizedRouteDigest(nonReplayRoute.inventory);
    redigest(coordinatedRewrite);
    const parsedRewrite =
      validateValidityApplicationPooledReserveTestnetCutoverReviewProfileV4(
        coordinatedRewrite,
      );
    expect(parsedRewrite.serializedValidation).toMatchObject({
      componentProvenanceReplayed: false,
      sourceComponentMembershipReplayed: false,
    });
    expect(() =>
      assertValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Provenance(
        coordinatedRewrite,
      )
    ).toThrow(/not built in this process/);
  });
});

function candidateFixture(
  options: Readonly<{
    reverseCollections?: boolean;
    lineageProfileIdHex?: string;
    runtimeProfileIdHex?: string;
    proofSystemIdHex?: string;
    bridgeAddress?: string;
    tokenAddress?: string;
    bridgeRuntimeCodeSha256Hex?: string;
    bridgeRuntimeCodeBytes?: number;
    tokenRuntimeCodeSha256Hex?: string;
    tokenRuntimeCodeBytes?: number;
  }> = {},
): BuildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Input {
  const contractIds = {
    tracker: hash('tracker-contract'),
    duplicatePrevention: hash('dup-contract'),
    sourceLock: hash('source-lock-contract'),
    pooledReserve: hash('pooled-reserve-contract'),
  };
  const applicationBindingDigestHex = hash('application-binding');
  const lineageProfileIdHex =
    options.lineageProfileIdHex ?? hash('lineage-profile');
  const sourceAdmissionPolicyIdHex = hash('source-admission-policy');
  const proofSystemIdHex = options.proofSystemIdHex ?? hash('proof-system');
  const proofProfileIdHex = hash('proof-profile');
  const bridgeAddress = options.bridgeAddress ?? BRIDGE_ADDRESS;
  const tokenAddress = options.tokenAddress ?? TOKEN_ADDRESS;
  const bridgeCodeDigest =
    options.bridgeRuntimeCodeSha256Hex ?? hash('bridge-code');
  const tokenCodeDigest =
    options.tokenRuntimeCodeSha256Hex ?? hash('token-code');
  const bridgeRuntimeCodeBytes = options.bridgeRuntimeCodeBytes ?? 1_024;
  const tokenRuntimeCodeBytes = options.tokenRuntimeCodeBytes ?? 2_048;
  const artifactProfileDigest = hash('artifact-profile');
  const buildManifestDigest = hash('build-manifest');

  const compiledInstance = {
    lineageProfileIdHex,
    encodedLineageProfileHex: `0x${'41'.repeat(64)}`,
    application: {
      bindingDigestHex: hash('source-runtime-binding'),
      burnBindingDigestHex: applicationBindingDigestHex,
    },
    sidechainFinalityPolicy: {
      policyIdHex: sourceAdmissionPolicyIdHex,
      proofSystemIdHex,
      proofProfileIdHex,
    },
    contracts: {
      tracker: { receipt: { contractIdHex: contractIds.tracker } },
      duplicatePrevention: {
        receipt: { contractIdHex: contractIds.duplicatePrevention },
      },
      sourceLock: { receipt: { contractIdHex: contractIds.sourceLock } },
      pooledReserve: {
        receipt: { contractIdHex: contractIds.pooledReserve },
      },
    },
    boundaries: allFalse([
      'setupTransactionsConstructed',
      'singletonLineagesEstablished',
      'reserveLineageEstablished',
      'sourceLockConsumptionEstablished',
      'depositCommitmentStateEstablished',
      'mintEligibilityEstablished',
      'burnSettlementEstablished',
      'profileActivated',
      'targetNodeAcceptanceEstablished',
      'nodeCheckPerformed',
      'signingAuthorityEstablished',
      'submissionAuthorityEstablished',
      'broadcastAuthorityEstablished',
      'fundsAuthorityEstablished',
      'gate5Closed',
      'trustlessStatusEstablished',
      'productionReadinessEstablished',
    ]),
  } as unknown as ValidityApplicationPooledReserveInstanceV4Candidate;

  const runtimeProfile = {
    profile: {
      activationHeight: ACTIVATION_HEIGHT,
      sidechainIdHex: hash('sidechain-id'),
      bridgeAddressHex: bridgeAddress,
      tokenAddressHex: tokenAddress,
      bridgeRuntimeCodeSha256Hex: bridgeCodeDigest,
      bridgeRuntimeCodeBytes,
      tokenRuntimeCodeSha256Hex: tokenCodeDigest,
      tokenRuntimeCodeBytes,
    },
    profileIdHex: options.runtimeProfileIdHex ?? hash('runtime-profile-id'),
    candidateDigestHex: hash('runtime-profile-candidate'),
    authority: allFalse([
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
    ]),
  } as unknown as PooledReserveMintReservationRuntimeProfileV4Candidate;

  const ergoRequirements =
    VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
      .filter(route => route.layer === 'ergo');
  const inventoryRoutes = ergoRequirements.map((requirement, index) => ({
    routeId: requirement.routeId,
    sourceSurface: requirement.sourceSurface,
    requiredDisposition: requirement.requiredDisposition,
    classification: index % 2 === 0 ? 'drained' : 'never-funded',
    instances: [{
      instanceId: `${requirement.routeId}-testnet-instance`,
      address: ErgoAddress.fromErgoTree(
        hash(`tree-${requirement.routeId}`),
        Network.Testnet,
      ).toString(),
      ergoTreeSha256Hex: hashHexBytes(hash(`tree-${requirement.routeId}`)),
      singletonTokenIdHex: requirement.routeClass === 'source-lock'
        ? null
        : hash(`singleton-${requirement.routeId}`),
      genesisBoxIdHex: requirement.routeClass === 'source-lock'
        ? null
        : hash(`genesis-${requirement.routeId}`),
      classification: index % 2 === 0 ? 'drained' : 'never-funded',
      inventoryEvidenceDigestHex: hash(`instance-inventory-${requirement.routeId}`),
    }],
    blockerCodes: ['retirement-evidence-required'],
    inventoryEvidenceDigestHex: hash(`route-inventory-${requirement.routeId}`),
  }));
  const dupRequirements = ergoRequirements.filter(route =>
    route.routeClass === 'duplicate-prevention'
  );
  const historicalDupLineages = dupRequirements.map(requirement => {
    const nonempty = requirement.routeId === AUTHENTICATED_DUP_ROUTE;
    return {
      routeId: requirement.routeId,
      instanceId: `${requirement.routeId}-testnet-instance`,
      packetDigestHex: hash(`lineage-${requirement.routeId}`),
      classification: nonempty ? 'raw-reconstructed' : 'never-funded',
      rawInsertedKeysHex: nonempty
        ? [hash('legacy-key-a'), hash('legacy-key-b')]
        : [],
    };
  });
  const ergoCutoverObservation = {
    reportDigestHex: hash('ergo-cutover-observation'),
    profile: {
      profileDigestHex: hash('ergo-route-profile'),
      requirementsDigestHex: hash('ergo-route-requirements'),
      networkId: 'ergo-testnet',
    },
    inventory: {
      routes: ordered(inventoryRoutes, options.reverseCollections),
    },
    historicalDupLineages: ordered(
      historicalDupLineages,
      options.reverseCollections,
    ),
    summary: {
      inventoryBlockerCodes: ['retirement-evidence-required'],
    },
    boundaries: {
      profileReviewAuthenticated: false,
      deploymentLineageAuthenticated: false,
      canonicalEventMappingsCompleted: false,
      sourceAdmissionEvidenceCompleted: false,
      legacyRoutesRetired: false,
      profileActivated: false,
      targetNodeAcceptanceEstablished: false,
      mintAuthorized: false,
      payoutAuthorized: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
  } as unknown as ValidityApplicationPooledReserveErgoCutoverObservationV4Report;

  const burnIds = [hash('burn-a'), hash('burn-b')].sort();
  const contributions = historicalDupLineages.map(lineage =>
    lineage.routeId === AUTHENTICATED_DUP_ROUTE
      ? {
        kind: 'authenticated-v2-replay-import',
        routeId: lineage.routeId,
        sourceSurface: 'contracts/DoubleUnlockPreventionAuthenticated.es',
        instanceId: lineage.instanceId,
        lineagePacketDigestHex: lineage.packetDigestHex,
        lineageClassification: lineage.classification,
        rawReplayKeyCount: 2,
        replayImportPacketDigestHex: hash('authenticated-replay-import'),
        canonicalBurnIdsHex: burnIds,
      }
      : {
        kind: 'empty-observed-lineage',
        routeId: lineage.routeId,
        sourceSurface: 'historical-empty-route',
        instanceId: lineage.instanceId,
        lineagePacketDigestHex: lineage.packetDigestHex,
        lineageClassification: lineage.classification,
        rawReplayKeyCount: 0,
        replayImportPacketDigestHex: null,
        canonicalBurnIdsHex: [],
      }
  );
  const dupDigest = getDupTreeDigest(burnIds);
  const historicalReplayGenesis = {
    packetDigestHex: hash('historical-replay-genesis'),
    lineage: {
      lineageProfileIdHex: `0x${lineageProfileIdHex}`,
      encodedLineageProfileHex: `0x${'41'.repeat(64)}`,
    },
    observation: {
      cutoverObservationReportDigestHex:
        ergoCutoverObservation.reportDigestHex,
    },
    contributions: ordered(contributions, options.reverseCollections),
    duplicatePreventionGenesis: {
      canonicalBurnIdsHex: burnIds,
      digestHex: dupDigest,
      registers: {
        R4: encodeCollByteRegister(Buffer.from(lineageProfileIdHex, 'hex')),
        R5: encodeAvlTreeRegister(
          Buffer.from(dupDigest, 'hex'),
          0x01,
          1,
        ),
      },
    },
    boundaries: {
      profileInstanceInventoryExhaustiveAuthenticated: false,
      legacyRoutesRetired: false,
      profileActivated: false,
      targetNodeAcceptanceEstablished: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
  } as unknown as ValidityApplicationPooledReserveHistoricalReplayGenesisV4Packet;

  const provisioning = {
    duplicatePreventionGenesis: {
      mode: 'historical-replay-genesis',
      historicalReplayGenesisPacketDigestHex:
        historicalReplayGenesis.packetDigestHex,
      digestHex: dupDigest,
    },
    boundaries: {
      singletonLineagesEstablished: false,
      reserveLineageEstablished: false,
      profileActivated: false,
      targetNodeAcceptanceEstablished: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
  } as unknown as ValidityApplicationPooledReserveProvisioningV4Packet;

  const deploymentIdentity = {
    view: {
      declaredNetworkScope: 'public-testnet',
      chainId: '4242',
      bridgeAddress,
      tokenAddress,
      bridgeRuntimeByteLength: bridgeRuntimeCodeBytes,
      bridgeRuntimeBytecodeSha256Hex: bridgeCodeDigest,
      tokenRuntimeByteLength: tokenRuntimeCodeBytes,
      tokenRuntimeBytecodeSha256Hex: tokenCodeDigest,
      artifactProfileDigestHex: artifactProfileDigest,
      buildManifestSha256Hex: buildManifestDigest,
    },
    authority: allFalse([
      'historicalOwnershipProved',
      'historicalMintAbsenceProved',
      'sidechainFinalityProved',
      'mintAuthorized',
      'settlementAuthorized',
      'reconciliationHoldReleaseAuthorized',
      'signingAuthorized',
      'submissionAuthorized',
      'broadcastAuthorized',
      'gate5Closed',
      'productionReady',
    ]),
    candidateDigestHex: hash('deployment-identity-candidate'),
  } as unknown as DeploymentIdentityCandidate;

  const reviewedProfileDigest = hash('reviewed-lineage-profile');
  const deploymentLineage = {
    deploymentIdentityCandidateDigestHex:
      deploymentIdentity.candidateDigestHex,
    artifactProfileDigestHex: artifactProfileDigest,
    reviewedProfileDigestHex: reviewedProfileDigest,
    interval: {
      startHeight: '100',
      terminalHeight: TERMINAL_HEIGHT,
      terminalExecutionBlockHashHex: TERMINAL_EXECUTION_HASH,
    },
    blocks: [{
      height: TERMINAL_HEIGHT,
      hashHex: TERMINAL_EXECUTION_HASH,
      observationDigestHex: TERMINAL_OBSERVATION_DIGEST,
    }],
    authority: allFalse([
      'historicalReceiptStateProofCompletenessProved',
      'ergoAnchorAcceptanceProved',
      'mintAuthorized',
      'reconciliationHoldReleaseAuthorized',
      'settlementAuthorized',
      'signingAuthorized',
      'submissionAuthorized',
      'broadcastAuthorized',
      'gate5Closed',
      'productionReady',
    ]),
    candidateDigestHex: hash('deployment-lineage-candidate'),
  } as unknown as AuthorityBoundDeploymentLineageCandidate;

  const compatibilityRequirements =
    VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
      .filter(route => route.layer === 'frontier' || route.layer === 'relayer');
  const compatibilityRoutes = compatibilityRequirements.map(requirement => ({
    ...requirement,
    sourcePresence: requirement.layer === 'relayer'
      ? 'source-absent'
      : 'source-present',
    targetObservation: 'unobserved',
    reachability: requirement.layer === 'relayer'
      ? 'disabled-at-exact-state'
      : 'unresolved',
    history: 'unresolved',
    retirement: 'candidate-only',
    configurationObservation: requirement.layer === 'relayer'
      ? 'disabled'
      : 'not-applicable',
    configurationRetirementEffect: 'none',
    blockers: ['legacy-route-retirement-evidence-is-not-authenticated'],
  }));
  const compatibilityInventory = {
    status: 'blocked_non_authorizing_inventory_candidate',
    packetDigestHex: hash('compatibility-inventory'),
    observations: {
      deploymentIdentityCandidateDigestHex:
        deploymentIdentity.candidateDigestHex,
      deploymentLineageCandidateDigestHex:
        deploymentLineage.candidateDigestHex,
      runtimeProfileCandidateDigestHex: runtimeProfile.candidateDigestHex,
      reviewedDeploymentLineageProfileDigestHex: reviewedProfileDigest,
      reviewedDeploymentLineageProfile: 'reviewed-non-inert-profile',
      runtimeActivationHeight: ACTIVATION_HEIGHT,
      runtimeActivation: 'nonzero-unactivated-candidate',
      networkScope: 'public-testnet',
      chainId: deploymentIdentity.view.chainId,
      boundedLineageStartHeight: '100',
      boundedLineageTerminalHeight: TERMINAL_HEIGHT,
      boundedLineageTerminalExecutionBlockHashHex: TERMINAL_EXECUTION_HASH,
    },
    routes: ordered(compatibilityRoutes, options.reverseCollections),
    blockers: [
      'legacy-route-retirement-evidence-is-not-authenticated',
      'target-runtime-activation-is-not-observed',
    ],
    authority: allFalse([
      'inventoryAuthoritative',
      'legacyRouteInventoryAuthenticated',
      'legacyRouteRetirementAuthenticated',
      'cutoverComplete',
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
      'releaseReadinessEstablished',
    ]),
  } as unknown as FrontierRelayerCompatibilityAuthorityInventoryV4;

  const declarations =
    VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4
      .map(requirement => {
        const inventoryEvidenceDigestHex = requirement.layer === 'ergo'
          ? inventoryRoutes.find(route => route.routeId === requirement.routeId)!
            .inventoryEvidenceDigestHex
          : sha256CanonicalJson(
            compatibilityRoutes.find(route =>
              route.routeId === requirement.routeId
            )!,
            VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_ROUTE_INVENTORY_V4_DIGEST_DOMAIN,
          );
        return {
          routeId: requirement.routeId,
          declaredDisposition: requirement.requiredDisposition,
          declaredStatus: 'inactive-unverified',
          inventoryEvidenceDigestHex,
          retirementEvidenceDigestHex: hash(
            `retirement-${requirement.routeId}`,
          ),
        };
      });
  const cutoverCandidate = {
    candidateDigestHex: hash('cutover-candidate'),
    application: {
      lineageProfileIdHex,
      runtimeProfileIdHex: runtimeProfile.profileIdHex,
      applicationBindingDigestHex,
      contractIds,
    },
    sourceAdmissionProfile: {
      policyIdHex: sourceAdmissionPolicyIdHex,
      proofSystemIdHex,
      proofProfileIdHex,
    },
    activationParent: {
      nativeHeight: TERMINAL_HEIGHT,
      nativeBlockHashHex: hash('parent-native-block'),
      nativeStateRootHex: hash('parent-native-state-root'),
      executionBlockHashHex: TERMINAL_EXECUTION_HASH,
      runtimeCodeSha256Hex: hash('parent-runtime-code'),
      runtimeCodeBytes: 4_096,
      observationDigestHex: TERMINAL_OBSERVATION_DIGEST,
    },
    replayCutover: {
      historicalReplayGenesisPacketDigestHex:
        historicalReplayGenesis.packetDigestHex,
      cutoverObservationReportDigestHex:
        ergoCutoverObservation.reportDigestHex,
      importedHistoricalLineageCount: historicalDupLineages.length,
      importedCanonicalBurnIdCount: burnIds.length,
    },
    legacyRouteRetirement: {
      declarations: ordered(declarations, options.reverseCollections),
    },
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
  } as unknown as ValidityApplicationPooledReserveCutoverCandidateV4;

  const result = {
    compiledInstance,
    runtimeProfile,
    ergoCutoverObservation,
    historicalReplayGenesis,
    provisioning,
    cutoverCandidate,
    deploymentIdentity,
    deploymentLineage,
    compatibilityInventory,
  };
  provenance.compiled.add(compiledInstance);
  provenance.runtime.add(runtimeProfile);
  provenance.observation.add(ergoCutoverObservation);
  provenance.replay.add(historicalReplayGenesis);
  provenance.provisioning.add(provisioning);
  provenance.cutover.add(cutoverCandidate);
  provenance.deploymentIdentity.add(deploymentIdentity);
  provenance.deploymentLineage.add(deploymentLineage);
  provenance.compatibilityInventory.add(compatibilityInventory);
  return result;
}

type Mutable<T> = {
  -readonly [Key in keyof T]: T[Key] extends readonly (infer Item)[]
    ? Mutable<Item>[]
    : T[Key] extends object
      ? Mutable<T[Key]>
      : T[Key];
};

type MutableFixture = Mutable<
  BuildValidityApplicationPooledReserveTestnetCutoverReviewProfileV4Input
>;
type MutableProfile = Mutable<
  ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4
>;

function redigest(profile: MutableProfile): void {
  const binding = { ...profile } as Record<string, unknown>;
  delete binding.profileDigestHex;
  profile.profileDigestHex = sha256CanonicalJson(
    binding,
    VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_DIGEST_DOMAIN,
  );
}

function sanitizedRouteDigest(
  inventory: MutableProfile['routes'][number]['inventory'],
): string {
  return sha256CanonicalJson(
    {
      source: inventory.source,
      bindingDigestHex: inventory.bindingDigestHex,
      instances: inventory.instances,
      blockerCodes: inventory.blockerCodes,
    },
    VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_SANITIZED_ROUTE_V4_DIGEST_DOMAIN,
  );
}

function allFalse(keys: readonly string[]): Record<string, false> {
  return Object.fromEntries(keys.map(key => [key, false]));
}

function eligibilityFixture(
  review: Readonly<ValidityApplicationPooledReserveTestnetCutoverReviewProfileV4>,
  canonicalBurnIdsHex: readonly string[],
): BuildValidityApplicationPooledReserveCutoverEligibilityV5Input {
  const targetLineageProfileIdHex = hash('eligibility-v5-target-lineage');
  const targetContracts = {
    tracker: hash('eligibility-v5-tracker'),
    duplicatePrevention: hash('eligibility-v5-dup'),
    sourceLock: hash('eligibility-v5-source-lock'),
    pooledReserve: hash('eligibility-v5-reserve'),
  };
  const compiledInstance = {
    lineageProfileIdHex: targetLineageProfileIdHex,
    sourceRuntimeLineageProfileIdHex:
      review.application.lineageProfileIdHex,
    application: {
      runtimeProfileIdHex: review.application.runtimeProfileIdHex,
      burnBindingDigestHex: hash('eligibility-v5-application'),
    },
    sidechainFinalityPolicy: {
      policyIdHex: hash('eligibility-v5-finality-policy'),
      proofSystemIdHex: review.application.sourceProofSystemIdHex,
      proofProfileIdHex: hash('eligibility-v5-proof-profile'),
      approvedTrustAnchorDigestHex: hash('eligibility-v5-trust-anchor'),
    },
    contracts: Object.fromEntries(
      Object.entries(targetContracts).map(([role, contractIdHex]) => [
        role,
        { receipt: { contractIdHex } },
      ]),
    ),
    genesis: {
      trackerInputBoxIdHex: hash('eligibility-v5-tracker-input'),
      trackerNftIdHex: hash('eligibility-v5-tracker-nft'),
      duplicatePreventionInputBoxIdHex: hash('eligibility-v5-dup-input'),
      duplicatePreventionNftIdHex: hash('eligibility-v5-dup-nft'),
      settlementVaultInputBoxIdHex: hash('eligibility-v5-reserve-input'),
      settlementVaultNftIdHex: hash('eligibility-v5-reserve-nft'),
    },
    boundaries: {
      compilerIdentityValidated: true,
      settlementTransactionConstructed: false,
      profileActivated: false,
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
  } as any;
  const replayCutover = {
    packetDigestHex: hash('eligibility-v5-replay-cutover'),
    sourceReplay: {
      historicalReplayGenesisPacketDigestHex:
        review.components.historicalReplayGenesisPacketDigestHex,
      cutoverObservationReportDigestHex:
        review.components.ergoCutoverObservationReportDigestHex,
      sourceV4LineageProfileIdHex: review.application.lineageProfileIdHex,
      canonicalBurnIdsHex: [...canonicalBurnIdsHex],
      canonicalBurnIdCount: canonicalBurnIdsHex.length,
      duplicatePreventionDigestHex:
        review.replay.duplicatePreventionGenesisDigestHex,
    },
    targetLineage: {
      lineageProfileIdHex: targetLineageProfileIdHex,
      duplicatePreventionGenesisInputBoxIdHex:
        compiledInstance.genesis.duplicatePreventionInputBoxIdHex,
      duplicatePreventionNftIdHex:
        compiledInstance.genesis.duplicatePreventionNftIdHex,
      duplicatePreventionContractIdHex: targetContracts.duplicatePrevention,
    },
    duplicatePreventionBox: { boxId: hash('eligibility-v5-dup-box') },
    invariants: {
      globalReplayPacketConsumed: true,
      sourceV4LineageMatched: true,
      targetV5LineageRebound: true,
      replayDigestPreserved: true,
      exactV5ContractAndSingletonBound: true,
      unsignedIssuanceOnly: true,
    },
    boundaries: {
      inventoryExhaustivenessAuthenticated: false,
      legacyRoutesRetired: false,
      singletonLineageEstablished: false,
      profileActivated: false,
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
  } as any;
  const boxes = {
    tracker: { boxId: hash('eligibility-v5-tracker-box') },
    duplicatePrevention: replayCutover.duplicatePreventionBox,
    pooledReserve: { boxId: hash('eligibility-v5-reserve-box') },
  };
  const transaction = (label: string, inputBoxIdHex: string, box: any) => ({
    txId: hash(`eligibility-v5-${label}-issuance`),
    eip12Tx: {
      inputs: [{ boxId: inputBoxIdHex }],
      dataInputs: [],
      outputs: [{}],
    },
    outputs: [box],
  });
  const provisioningPlan = {
    schema: VALIDITY_APPLICATION_POOLED_RESERVE_PROVISIONING_V5_SCHEMA,
    version: 5,
    planDigestHex: hash('eligibility-v5-provisioning-plan'),
    targetNetwork: {
      ergoNetworkId: 'ergo-testnet',
      ergoAddressNetworkPrefix: 16,
      p2sAddressHeader: 19,
      ergoGenesisBlockIdHex: hash('eligibility-ergo-genesis'),
      sourceNetworkIdHex: hash('eligibility-source-network'),
      sidechainIdHex: hash('eligibility-sidechain'),
      settlementProfileIdHex: hash('eligibility-settlement-profile'),
    },
    profile: {
      targetLineageProfileIdHex,
      sourceRuntimeLineageProfileIdHex:
        compiledInstance.sourceRuntimeLineageProfileIdHex,
      sourceRuntimeProfileIdHex: compiledInstance.application.runtimeProfileIdHex,
      burnBindingDigestHex: compiledInstance.application.burnBindingDigestHex,
      finalityPolicyIdHex:
        compiledInstance.sidechainFinalityPolicy.policyIdHex,
      proofSystemIdHex:
        compiledInstance.sidechainFinalityPolicy.proofSystemIdHex,
      proofProfileIdHex:
        compiledInstance.sidechainFinalityPolicy.proofProfileIdHex,
      approvedTrustAnchorDigestHex:
        compiledInstance.sidechainFinalityPolicy.approvedTrustAnchorDigestHex,
    },
    contracts: Object.fromEntries(Object.entries(targetContracts).map(
      ([role, contractIdHex]) => [role, {
        templateSha256Hex: hash(`eligibility-v5-${role}-template`),
        resolvedSourceSha256Hex: hash(`eligibility-v5-${role}-source`),
        propositionSha256Hex: hash(`eligibility-v5-${role}-proposition`),
        contractIdHex,
      }],
    )),
    lineage: {
      trackerGenesisInputBoxIdHex:
        compiledInstance.genesis.trackerInputBoxIdHex,
      trackerNftIdHex: compiledInstance.genesis.trackerNftIdHex,
      duplicatePreventionGenesisInputBoxIdHex:
        compiledInstance.genesis.duplicatePreventionInputBoxIdHex,
      duplicatePreventionNftIdHex:
        compiledInstance.genesis.duplicatePreventionNftIdHex,
      pooledReserveGenesisInputBoxIdHex:
        compiledInstance.genesis.settlementVaultInputBoxIdHex,
      pooledReserveNftIdHex:
        compiledInstance.genesis.settlementVaultNftIdHex,
      historicalReplayGenesisPacketDigestHex:
        replayCutover.sourceReplay.historicalReplayGenesisPacketDigestHex,
      cutoverObservationReportDigestHex:
        replayCutover.sourceReplay.cutoverObservationReportDigestHex,
      replayCutoverPacketDigestHex: replayCutover.packetDigestHex,
      plannedCanonicalBurnIdsHex: [...canonicalBurnIdsHex],
      plannedCanonicalBurnIdCount: canonicalBurnIdsHex.length,
      plannedReplayDigestHex:
        replayCutover.sourceReplay.duplicatePreventionDigestHex,
    },
    transactions: {
      trackerIssuance: transaction(
        'tracker',
        compiledInstance.genesis.trackerInputBoxIdHex,
        boxes.tracker,
      ),
      duplicatePreventionIssuance: transaction(
        'dup',
        compiledInstance.genesis.duplicatePreventionInputBoxIdHex,
        boxes.duplicatePrevention,
      ),
      pooledReserveIssuance: transaction(
        'reserve',
        compiledInstance.genesis.settlementVaultInputBoxIdHex,
        boxes.pooledReserve,
      ),
    },
    boxes,
    pooledReserveGenesisSeedNanoErg: '2000000',
    invariants: {
      exactTargetNetworkBound: true,
      exactCompiledV5ContractFamilyBound: true,
      allGenesisInputsPairwiseDistinct: true,
      singletonIdsEqualDesignatedGenesisInputs: true,
      genesisInputsArePureErgAndRegisterFree: true,
      globalV4ReplayStateBoundIntoV5Plan: true,
      pooledReserveStartsWithZeroLiability: true,
      unsignedConstructionOnly: true,
    },
    stages: {
      construction: 'unsigned-plan-complete',
      jvmCheck: 'not-performed',
      signing: 'not-authorized',
      submission: 'not-authorized',
      broadcastAuthorization: 'not-granted',
      confirmation: 'not-established',
    },
    boundaries: {
      targetNetworkIdentityAuthenticated: false,
      replayInventoryExhaustivenessAuthenticated: false,
      legacyRoutesRetired: false,
      singletonLineagesEstablished: false,
      reserveLineageEstablished: false,
      profileActivated: false,
      targetNodeAcceptanceEstablished: false,
      nodeCheckPerformed: false,
      signingAuthorityEstablished: false,
      submissionAuthorityEstablished: false,
      broadcastAuthorityEstablished: false,
      confirmationEstablished: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
  } as any;
  provenance.compiledV5.add(compiledInstance);
  provenance.replayCutoverV5.add(replayCutover);
  provenance.provisioningV5.add(provisioningPlan);
  return {
    cutoverReview: review,
    provisioningPlan,
  };
}

function ordered<T>(values: readonly T[], reverse = false): T[] {
  return reverse ? [...values].reverse() : [...values];
}

function hash(label: string): string {
  return createHash('sha256').update(label, 'utf8').digest('hex');
}

function hashHexBytes(hex: string): string {
  return createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');
}
