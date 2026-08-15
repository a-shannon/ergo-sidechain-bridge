import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const provenance = vi.hoisted(() => ({
  reviews: new WeakSet<object>(),
  provisioningPlans: new WeakSet<object>(),
  historicalReplayPackets: new WeakSet<object>(),
  assert(set: WeakSet<object>, value: unknown, label: string): void {
    if (value === null || typeof value !== 'object' || !set.has(value)) {
      throw new Error(`${label} provenance is missing`);
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
      provenance.assert(
        provenance.historicalReplayPackets,
        value,
        'historical replay genesis',
      );
    },
  }),
);
vi.mock(
  './validity-application-pooled-reserve-provisioning-v6.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-provisioning-v6.js'
      )
    >();
    const assertActual: (value: unknown) => void =
      actual.assertValidityApplicationPooledReserveProvisioningV6Provenance;
    return {
      ...actual,
      assertValidityApplicationPooledReserveProvisioningV6Provenance(
        value: unknown,
      ) {
        try {
          assertActual(value);
        } catch {
          provenance.assert(
            provenance.provisioningPlans,
            value,
            'V6 provisioning plan',
          );
        }
      },
    };
  },
);

import {
  getDupTreeDigest,
} from './avl-bridge.js';
import {
  encodeAvlTreeRegister,
  encodeCollByteRegister,
} from './ergo-encoding.js';
import { sha256CanonicalJson } from './strict-json.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V6_STATUS,
  assertValidityApplicationPooledReserveCutoverEligibilityV6Provenance,
  buildValidityApplicationPooledReserveCutoverEligibilityV6,
  type BuildValidityApplicationPooledReserveCutoverEligibilityV6Input,
} from './validity-application-pooled-reserve-cutover-eligibility-v6.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4,
} from './validity-application-pooled-reserve-legacy-route-requirements-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_INTEGRATED_V5_ROUTE_REQUIREMENTS_V6,
  VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6,
} from './validity-application-pooled-reserve-legacy-route-requirements-v6.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_CONTRACT_IDS,
} from './validity-application-pooled-reserve-burn-family-v5.js';
import {
  buildValidityApplicationPooledReserveBurnFamilyV6CompilerFixture,
  buildValidityApplicationPooledReserveBurnFamilyV6CompilerFixtureInput,
} from './validity-application-pooled-reserve-burn-family-v6-fixture.js';
import {
  buildValidityApplicationPooledReserveInstanceV6,
} from './validity-application-pooled-reserve-instance-v6.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_LOCAL_PREDICATE_CLOSURE_V6,
  VALIDITY_APPLICATION_POOLED_RESERVE_PROVISIONING_V6_SCHEMA,
  buildValidityApplicationPooledReserveProvisioningV6,
} from './validity-application-pooled-reserve-provisioning-v6.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_SCHEMA,
  VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_STATUS,
} from './validity-application-pooled-reserve-testnet-cutover-review-profile-v4.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V6_STATUS,
  assertValidityApplicationPooledReserveTargetCheckRequestV6Provenance,
  buildValidityApplicationPooledReserveTargetCheckRequestV6,
} from './validity-application-pooled-reserve-target-check-request-v6.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_PRECONDITION_V6_STATUS,
  assertValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6Provenance,
  buildValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6,
} from './validity-application-pooled-reserve-funds-authority-switch-precondition-v6.js';

describe('pooled-reserve V6 cutover eligibility', () => {
  it('binds the exact V4 review and V6 target while remaining blocked', () => {
    const input = fixture();
    const candidate =
      buildValidityApplicationPooledReserveCutoverEligibilityV6(input);

    expect(candidate.status).toBe(
      VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V6_STATUS,
    );
    expect(candidate.routeInventory.routeCount).toBe(
      VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6.length,
    );
    expect(candidate.routeInventory.routeCount).toBe(53);
    expect(candidate.routeInventory.observedV4RouteCount).toBe(49);
    expect(candidate.routeInventory.pendingIntegratedV5RouteCount).toBe(4);
    expect(candidate.replay.historicalLineageCount).toBe(9);
    expect(candidate.replay.emptyLineageCount).toBe(9);
    expect(candidate.replay.mappedLineageCount).toBe(0);
    expect(candidate.sourceV4.lineageProfileIdHex).toBe(
      input.provisioningPlan.profile.sourceRuntimeLineageProfileIdHex,
    );
    expect(candidate.targetV6.lineageProfileIdHex).toBe(
      input.provisioningPlan.profile.targetLineageProfileIdHex,
    );
    expect(candidate.targetV6.provisioningPlanDigestHex).toBe(
      input.provisioningPlan.planDigestHex,
    );
    expect(candidate.targetV6.localPredicateClosure).toEqual(
      VALIDITY_APPLICATION_POOLED_RESERVE_LOCAL_PREDICATE_CLOSURE_V6,
    );
    expect(candidate.checks.exactV6LocalPredicateClosureIdentityBound)
      .toBe(true);
    expect(candidate.targetV6.transactionIdentities).toMatchObject({
      trackerIssuanceTxIdHex: hash('tracker-issuance'),
      duplicatePreventionIssuanceTxIdHex: hash('dup-issuance'),
      pooledReserveIssuanceTxIdHex: hash('reserve-issuance'),
    });
    expect(candidate.targetV6.lineageProfileIdHex).not.toBe(
      candidate.sourceV4.lineageProfileIdHex,
    );
    expect(candidate.blockers).toContain(
      'legacy-route-retirement-evidence-is-not-authenticated',
    );
    expect(candidate.blockers).toContain(
      'integrated-v5-route-inventory-and-retirement-evidence-is-not-authenticated',
    );
    expect(candidate.blockers).not.toContain(
      'v5-protected-input-burn-attribution-is-not-single-valued',
    );
    expect(candidate.blockers).not.toContain(
      'v6-protected-input-burn-attribution-is-not-single-valued',
    );
    expect(Object.values(candidate.boundaries).every(value => value === false))
      .toBe(true);
    expect(candidate.checks.callerRetirementClaimsAccepted).toBe(false);
    const request =
      buildValidityApplicationPooledReserveTargetCheckRequestV6({
        cutoverEligibility: candidate,
        provisioningPlan: input.provisioningPlan,
      });
    const repeated =
      buildValidityApplicationPooledReserveTargetCheckRequestV6({
        cutoverEligibility: candidate,
        provisioningPlan: input.provisioningPlan,
      });
    expect(repeated).toEqual(request);
    expect(request.version).toBe(6);
    expect(request.status).toBe(
      VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V6_STATUS,
    );
    expect(request.target.localPredicateClosure).toEqual(
      candidate.targetV6.localPredicateClosure,
    );
    expect(request.transactions.map(transaction => transaction.role)).toEqual([
      'tracker-issuance',
      'duplicate-prevention-issuance',
      'pooled-reserve-issuance',
    ]);
    expect(Object.values(request.boundaries).every(value => value === false))
      .toBe(true);
    expect(() =>
      assertValidityApplicationPooledReserveTargetCheckRequestV6Provenance(
        request,
      )
    ).not.toThrow();
    expect(() =>
      assertValidityApplicationPooledReserveTargetCheckRequestV6Provenance(
        structuredClone(request),
      )
    ).toThrow(/not built in this process/);
    const precondition =
      buildValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6({
        cutoverEligibility: candidate,
        targetCheckRequest: request,
      });
    const repeatedPrecondition =
      buildValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6({
        cutoverEligibility: candidate,
        targetCheckRequest: request,
      });
    expect(repeatedPrecondition).toEqual(precondition);
    expect(precondition.version).toBe(6);
    expect(precondition.status).toBe(
      VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_PRECONDITION_V6_STATUS,
    );
    expect(precondition.atomicSwitchRule.requiredEvidenceOrder).toEqual([
      'target-check-result',
      'confirmed-target-lineages',
      'global-replay-import',
      'authenticated-legacy-retirement',
    ]);
    expect(precondition.atomicSwitchRule.localPredicateClosureMustMatchTargetCheck)
      .toBe(true);
    expect(precondition.requiredEvidence.authenticatedLegacyRetirement.routeCount)
      .toBe(53);
    expect(Object.values(precondition.boundaries).every(value => value === false))
      .toBe(true);
    expect(() =>
      assertValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6Provenance(
        precondition,
      )
    ).not.toThrow();
    expect(() =>
      assertValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6Provenance(
        structuredClone(precondition),
      )
    ).toThrow(/not built in this process/);
    expect(() =>
      assertValidityApplicationPooledReserveCutoverEligibilityV6Provenance(
        candidate,
      )
    ).not.toThrow();
    expect(() =>
      assertValidityApplicationPooledReserveCutoverEligibilityV6Provenance(
        structuredClone(candidate),
      )
    ).toThrow(/not built in this process/);
  });

  it('requires exact retirement evidence for every integrated V5 contract', () => {
    const input = fixture();
    const eligibility =
      buildValidityApplicationPooledReserveCutoverEligibilityV6(input);
    const request = buildValidityApplicationPooledReserveTargetCheckRequestV6({
      cutoverEligibility: eligibility,
      provisioningPlan: input.provisioningPlan,
    });
    const precondition =
      buildValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6({
        cutoverEligibility: eligibility,
        targetCheckRequest: request,
      });
    const integratedV5Routes = eligibility.routeInventory.routes.filter(
      route => route.requirementSource === 'v5-static-retirement-requirement',
    );
    const expectedByRouteId = new Map(
      VALIDITY_APPLICATION_POOLED_RESERVE_INTEGRATED_V5_ROUTE_REQUIREMENTS_V6
        .map(requirement => [requirement.routeId, requirement] as const),
    );

    expect(integratedV5Routes).toHaveLength(4);
    expect(new Set(integratedV5Routes.map(route => route.contractIdHex))).toEqual(
      new Set(Object.values(
        VALIDITY_APPLICATION_POOLED_RESERVE_BURN_FAMILY_V5_CONTRACT_IDS,
      )),
    );
    for (const route of integratedV5Routes) {
      const requirement = expectedByRouteId.get(route.routeId)!;
      expect(route).toMatchObject({
        layer: requirement.layer,
        routeClass: requirement.routeClass,
        sourceSurface: requirement.sourceSurface,
        historicalAuthority: requirement.historicalAuthority,
        requiredDisposition: 'prove-never-funded-and-disable',
        contractIdHex: requirement.contractIdHex,
        requirementSource: 'v5-static-retirement-requirement',
        inventorySource: 'pending-authenticated-v5-inventory',
        instanceIds: [],
        retirementEvidenceAuthenticated: false,
        routeRetired: false,
      });
      expect(new Set([
        route.inventoryBindingDigestHex,
        route.sanitizedInventoryBindingDigestHex,
        route.retirementEvidenceDigestHex,
      ]).size).toBe(3);
      expect(
        precondition.requiredEvidence.authenticatedLegacyRetirement.routes
          .find(bound => bound.routeId === route.routeId),
      ).toMatchObject({
        sourceSurface: requirement.sourceSurface,
        historicalAuthority: requirement.historicalAuthority,
        requiredDisposition: requirement.requiredDisposition,
        contractIdHex: requirement.contractIdHex,
        requirementSource: 'v5-static-retirement-requirement',
        inventorySource: 'pending-authenticated-v5-inventory',
        instanceIds: [],
        retirementEvidenceAuthenticated: false,
        routeRetired: false,
      });
    }

    const nonHistoricalSuccessorContracts = new Set([
      'DoubleUnlockPreventionPooledReserveV6.es',
      'MainChainLockPooledReserveV6.es',
      'MainChainPooledReserveValidityApplicationV6.es',
      'SPVTrackerPooledReserveBurnSettlementV6.es',
      'DoubleUnlockPreventionSubstrateFederatedV1.es',
      'SPVTrackerSubstrateFederatedV1.es',
    ]);
    const contractDirectory = resolve(
      import.meta.dirname,
      '..',
      '..',
      'contracts',
    );
    const historicalContracts = readdirSync(contractDirectory)
      .filter(name =>
        name === 'SideChainState.es'
        || /^(?:DoubleUnlockPrevention|MainChain|SPVTracker).*\.es$/.test(name)
      )
      .filter(name => !nonHistoricalSuccessorContracts.has(name))
      .sort();
    const registeredContracts =
      VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V6
        .filter(requirement =>
          requirement.layer === 'ergo'
          && requirement.sourceSurface.startsWith('contracts/')
        )
        .map(requirement => requirement.sourceSurface.slice('contracts/'.length))
        .sort();

    expect(registeredContracts).toEqual(historicalContracts);
  });

  it('consumes the real provisioning producer provenance and rejects its clone', async () => {
    const [compilerRequest, compilerFixtureInput] = await Promise.all([
      buildValidityApplicationPooledReserveBurnFamilyV6CompilerFixture(),
      buildValidityApplicationPooledReserveBurnFamilyV6CompilerFixtureInput(),
    ]);
    const compiled = buildValidityApplicationPooledReserveInstanceV6({
      compilerRequest,
      compilerBatchJson: readFileSync(resolve(
        import.meta.dirname,
        '..',
        'test-vectors',
        'validity-application-pooled-reserve-compiler-v6.json',
      ), 'utf8'),
    });
    const historicalReplayGenesis = integrationHistoricalReplayPacket(compiled);
    provenance.historicalReplayPackets.add(historicalReplayGenesis);
    const plan = await buildValidityApplicationPooledReserveProvisioningV6({
      compiledInstance: compiled,
      historicalReplayGenesis,
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
    const base = fixture();
    const review = structuredClone(base.cutoverReview) as any;
    review.components.historicalReplayGenesisPacketDigestHex =
      plan.lineage.historicalReplayGenesisPacketDigestHex;
    review.components.ergoCutoverObservationReportDigestHex =
      plan.lineage.cutoverObservationReportDigestHex;
    review.application.lineageProfileIdHex =
      plan.profile.sourceRuntimeLineageProfileIdHex;
    review.application.runtimeProfileIdHex =
      plan.profile.sourceRuntimeProfileIdHex;
    review.application.sourceProofSystemIdHex = plan.profile.proofSystemIdHex;
    review.replay.importedCanonicalBurnIdCount =
      plan.lineage.plannedCanonicalBurnIdCount;
    review.replay.duplicatePreventionGenesisDigestHex =
      plan.lineage.plannedReplayDigestHex;
    provenance.reviews.add(review);

    const candidate = buildValidityApplicationPooledReserveCutoverEligibilityV6({
      cutoverReview: review,
      provisioningPlan: plan,
    });
    expect(candidate.targetV6.provisioningPlanDigestHex).toBe(
      plan.planDigestHex,
    );
    expect(candidate.targetV6.transactionIdentities).toEqual({
      trackerIssuanceTxIdHex: plan.transactions.trackerIssuance.txId,
      trackerBoxIdHex: plan.boxes.tracker.boxId,
      duplicatePreventionIssuanceTxIdHex:
        plan.transactions.duplicatePreventionIssuance.txId,
      duplicatePreventionBoxIdHex: plan.boxes.duplicatePrevention.boxId,
      pooledReserveIssuanceTxIdHex:
        plan.transactions.pooledReserveIssuance.txId,
      pooledReserveBoxIdHex: plan.boxes.pooledReserve.boxId,
    });
    expect(candidate.version).toBe(6);
    const request =
      buildValidityApplicationPooledReserveTargetCheckRequestV6({
        cutoverEligibility: candidate,
        provisioningPlan: plan,
      });
    expect(request.source).toEqual({
      cutoverEligibilityCandidateDigestHex: candidate.candidateDigestHex,
      provisioningPlanDigestHex: plan.planDigestHex,
    });
    expect(request.target.localPredicateClosure).toEqual(
      plan.localPredicateClosure,
    );
    expect(request.transactions.map(transaction => ({
      role: transaction.role,
      unsignedTxIdHex: transaction.unsignedTxIdHex,
      predictedOutputBoxIdHex: transaction.predictedOutputBoxIdHex,
    }))).toEqual([
      {
        role: 'tracker-issuance',
        unsignedTxIdHex: plan.transactions.trackerIssuance.txId,
        predictedOutputBoxIdHex: plan.boxes.tracker.boxId,
      },
      {
        role: 'duplicate-prevention-issuance',
        unsignedTxIdHex: plan.transactions.duplicatePreventionIssuance.txId,
        predictedOutputBoxIdHex: plan.boxes.duplicatePrevention.boxId,
      },
      {
        role: 'pooled-reserve-issuance',
        unsignedTxIdHex: plan.transactions.pooledReserveIssuance.txId,
        predictedOutputBoxIdHex: plan.boxes.pooledReserve.boxId,
      },
    ]);
    const precondition =
      buildValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6({
        cutoverEligibility: candidate,
        targetCheckRequest: request,
      });
    expect(precondition.source).toEqual({
      cutoverEligibilityCandidateDigestHex: candidate.candidateDigestHex,
      targetCheckRequestDigestHex: request.requestDigestHex,
      provisioningPlanDigestHex: plan.planDigestHex,
    });
    expect(precondition.requiredEvidence.targetCheckResult.transactions).toEqual(
      request.transactions.map(transaction => ({
        role: transaction.role,
        unsignedTxIdHex: transaction.unsignedTxIdHex,
        unsignedTransactionDigestHex:
          transaction.unsignedTransactionDigestHex,
        predictedOutputBoxIdHex: transaction.predictedOutputBoxIdHex,
      })),
    );
    expect(candidate.blockers).not.toContain(
      'v5-protected-input-burn-attribution-is-not-single-valued',
    );
    expect(() =>
      buildValidityApplicationPooledReserveCutoverEligibilityV6({
        cutoverReview: review,
        provisioningPlan: structuredClone(plan),
      })
    ).toThrow(/V6 provisioning plan provenance is missing/);
  });

  it('rejects cloned provenance and non-exact constructor inputs', () => {
    const input = fixture();
    expect(() =>
      buildValidityApplicationPooledReserveCutoverEligibilityV6({
        ...input,
        cutoverReview: structuredClone(input.cutoverReview),
      })
    ).toThrow(/cutover review provenance is missing/);
    expect(() =>
      buildValidityApplicationPooledReserveCutoverEligibilityV6({
        ...input,
        provisioningPlan: structuredClone(input.provisioningPlan),
      })
    ).toThrow(/V6 provisioning plan provenance is missing/);

    expect(() =>
      buildValidityApplicationPooledReserveCutoverEligibilityV6({
        ...input,
        approved: true,
      } as unknown as BuildValidityApplicationPooledReserveCutoverEligibilityV6Input)
    ).toThrow(/fields are not exact/);
  });

  it('rejects target-check clone, cross-plan, transaction, and authority drift', () => {
    const input = fixture();
    const eligibility =
      buildValidityApplicationPooledReserveCutoverEligibilityV6(input);

    expect(() =>
      buildValidityApplicationPooledReserveTargetCheckRequestV6({
        cutoverEligibility: structuredClone(eligibility),
        provisioningPlan: input.provisioningPlan,
      })
    ).toThrow(/not built in this process/);
    expect(() =>
      buildValidityApplicationPooledReserveTargetCheckRequestV6({
        cutoverEligibility: eligibility,
        provisioningPlan: structuredClone(input.provisioningPlan),
      })
    ).toThrow(/V6 provisioning plan provenance is missing/);

    const planDigestDrift = mutableProvisioningPlan(input);
    planDigestDrift.planDigestHex = hash('different-v6-plan');
    expect(() =>
      buildValidityApplicationPooledReserveTargetCheckRequestV6({
        cutoverEligibility: eligibility,
        provisioningPlan: planDigestDrift,
      })
    ).toThrow(/does not bind the exact eligibility plan/);

    const closureDrift = mutableProvisioningPlan(input);
    closureDrift.localPredicateClosure.acceptanceSpecSha256Hex =
      hash('different-v6-local-closure');
    expect(() =>
      buildValidityApplicationPooledReserveTargetCheckRequestV6({
        cutoverEligibility: eligibility,
        provisioningPlan: closureDrift,
      })
    ).toThrow(/does not bind the exact eligibility plan/);

    const transactionDrift = mutableProvisioningPlan(input);
    transactionDrift.transactions.trackerIssuance.txId = hash('other-v6-tx');
    expect(() =>
      buildValidityApplicationPooledReserveTargetCheckRequestV6({
        cutoverEligibility: eligibility,
        provisioningPlan: transactionDrift,
      })
    ).toThrow(/does not match the cutover-eligibility identity/);

    const predictedOutputDrift = mutableProvisioningPlan(input);
    predictedOutputDrift.transactions.trackerIssuance.outputs[0].boxId =
      hash('other-v6-predicted-output');
    expect(() =>
      buildValidityApplicationPooledReserveTargetCheckRequestV6({
        cutoverEligibility: eligibility,
        provisioningPlan: predictedOutputDrift,
      })
    ).toThrow(/does not match the cutover-eligibility identity/);

    const duplicateIdentity = fixture();
    const duplicatePlan = mutableProvisioningPlan(duplicateIdentity);
    duplicatePlan.transactions.pooledReserveIssuance.txId =
      duplicatePlan.transactions.trackerIssuance.txId;
    expect(() => {
      const duplicateEligibility =
        buildValidityApplicationPooledReserveCutoverEligibilityV6({
          ...duplicateIdentity,
          provisioningPlan: duplicatePlan,
        });
      buildValidityApplicationPooledReserveTargetCheckRequestV6({
        cutoverEligibility: duplicateEligibility,
        provisioningPlan: duplicatePlan,
      });
    }).toThrow(/pairwise distinct/);

    const authorityDrift = mutableProvisioningPlan(input);
    authorityDrift.stages.signing = 'authorized';
    expect(() =>
      buildValidityApplicationPooledReserveTargetCheckRequestV6({
        cutoverEligibility: eligibility,
        provisioningPlan: authorityDrift,
      })
    ).toThrow(/no longer an unsigned non-authorizing plan/);

    expect(() =>
      buildValidityApplicationPooledReserveTargetCheckRequestV6({
        cutoverEligibility: eligibility,
        provisioningPlan: input.provisioningPlan,
        extra: true,
      } as any)
    ).toThrow(/fields are not exact/);
  });

  it('domain-separates and digest-binds every target-check field group', () => {
    const input = fixture();
    const eligibility =
      buildValidityApplicationPooledReserveCutoverEligibilityV6(input);
    const request =
      buildValidityApplicationPooledReserveTargetCheckRequestV6({
        cutoverEligibility: eligibility,
        provisioningPlan: input.provisioningPlan,
      });
    const requestBinding = structuredClone(request) as any;
    delete requestBinding.requestDigestHex;
    const requestDomain =
      'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V6';
    expect(sha256CanonicalJson(requestBinding, requestDomain))
      .toBe(request.requestDigestHex);
    expect(sha256CanonicalJson(
      requestBinding,
      'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V5',
    )).not.toBe(request.requestDigestHex);

    const firstTransaction = request.transactions[0]!;
    expect(firstTransaction.unsignedTransactionDigestHex).toBe(
      sha256CanonicalJson(
        firstTransaction.eip12Tx,
        `E2S_VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V6_TRANSACTION:${firstTransaction.role}`,
      ),
    );
    expect(firstTransaction.unsignedTransactionDigestHex).not.toBe(
      sha256CanonicalJson(
        firstTransaction.eip12Tx,
        `E2S_VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V5_TRANSACTION:${firstTransaction.role}`,
      ),
    );
    expect(request.target.profile.contractFamilyDigestHex).toBe(
      sha256CanonicalJson(
        input.provisioningPlan.contracts,
        'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V6_CONTRACTS',
      ),
    );
    expect(request.target.profile.contractFamilyDigestHex).not.toBe(
      sha256CanonicalJson(
        input.provisioningPlan.contracts,
        'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V5_CONTRACTS',
      ),
    );

    const mutations: readonly [string, (binding: any) => void][] = [
      ['schema/version', binding => {
        binding.schema =
          'e2s.validity-application-pooled-reserve-target-check-request.v5';
        binding.version = 5;
      }],
      ['network', binding => {
        binding.target.network.ergoGenesisBlockIdHex = hash('digest-network');
      }],
      ['profile', binding => {
        binding.target.profile.burnBindingDigestHex = hash('digest-profile');
      }],
      ['contract family', binding => {
        binding.target.profile.contractFamilyDigestHex = hash('digest-contracts');
      }],
      ['local predicate closure', binding => {
        binding.target.localPredicateClosure.acceptanceFixtureSha256Hex =
          hash('digest-local-closure');
      }],
      ['EIP-12 payload', binding => {
        binding.transactions[0].eip12Tx.outputs[0].value = '42';
      }],
      ['predicted output', binding => {
        binding.transactions[0].predictedOutputBoxIdHex =
          hash('digest-predicted-output');
      }],
      ['receipt policy', binding => {
        binding.receiptPolicy.sameNodeOriginRequired = false;
      }],
    ];
    for (const [label, mutate] of mutations) {
      const mutated = structuredClone(requestBinding);
      mutate(mutated);
      expect(
        sha256CanonicalJson(mutated, requestDomain),
        label,
      ).not.toBe(request.requestDigestHex);
    }
  });

  it('domain-separates the V6 atomic switch requirement without accepting evidence', () => {
    const input = fixture();
    const eligibility =
      buildValidityApplicationPooledReserveCutoverEligibilityV6(input);
    const request =
      buildValidityApplicationPooledReserveTargetCheckRequestV6({
        cutoverEligibility: eligibility,
        provisioningPlan: input.provisioningPlan,
      });
    const precondition =
      buildValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6({
        cutoverEligibility: eligibility,
        targetCheckRequest: request,
      });

    const binding = structuredClone(precondition) as any;
    delete binding.preconditionDigestHex;
    expect(sha256CanonicalJson(
      binding,
      'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_PRECONDITION_V6',
    )).toBe(precondition.preconditionDigestHex);
    expect(sha256CanonicalJson(
      binding,
      'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_PRECONDITION_V5',
    )).not.toBe(precondition.preconditionDigestHex);

    const closureDomain =
      'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_PRECONDITION_V6_LOCAL_PREDICATE_CLOSURE';
    expect(precondition.target.localPredicateClosureDigestHex).toBe(
      sha256CanonicalJson(request.target.localPredicateClosure, closureDomain),
    );
    expect(precondition.target.localPredicateClosureDigestHex).not.toBe(
      sha256CanonicalJson(
        request.target.localPredicateClosure,
        'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_PRECONDITION_V5_LOCAL_PREDICATE_CLOSURE',
      ),
    );
    expect(
      precondition.requiredEvidence.targetCheckResult
        .localPredicateClosureDigestHex,
    ).toBe(precondition.target.localPredicateClosureDigestHex);
    expect(
      precondition.requiredEvidence.targetCheckResult.requirements
        .exactLocalPredicateClosureIdentityRequired,
    ).toBe(true);

    const retirementBinding = {
      routes: structuredClone(
        precondition.requiredEvidence.authenticatedLegacyRetirement.routes,
      ) as any[],
      requirements: structuredClone(
        precondition.requiredEvidence.authenticatedLegacyRetirement.requirements,
      ) as any,
    };
    const retirementDomain =
      'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_PRECONDITION_V6_RETIREMENT';
    expect(sha256CanonicalJson(retirementBinding, retirementDomain)).toBe(
      precondition.requiredEvidence.authenticatedLegacyRetirement
        .retirementRequirementSetDigestHex,
    );
    const integratedV5RouteIndex = retirementBinding.routes.findIndex(
      route => route.requirementSource === 'v5-static-retirement-requirement',
    );
    expect(integratedV5RouteIndex).toBeGreaterThanOrEqual(0);
    for (const [label, mutate] of [
      ['contract ID', (route: any) => {
        route.contractIdHex = hash('other-integrated-v5-contract');
      }],
      ['source surface', (route: any) => {
        route.sourceSurface = 'contracts/OtherIntegratedV5.es';
      }],
      ['requirement source', (route: any) => {
        route.requirementSource = 'v4-cutover-review';
      }],
      ['inventory source', (route: any) => {
        route.inventorySource = 'ergo-cutover-observation';
      }],
      ['retirement authentication', (route: any) => {
        route.retirementEvidenceAuthenticated = true;
      }],
      ['route retirement', (route: any) => {
        route.routeRetired = true;
      }],
    ] as const) {
      const mutatedBinding = structuredClone(retirementBinding);
      mutate(mutatedBinding.routes[integratedV5RouteIndex]);
      expect(
        sha256CanonicalJson(mutatedBinding, retirementDomain),
        label,
      ).not.toBe(
        precondition.requiredEvidence.authenticatedLegacyRetirement
          .retirementRequirementSetDigestHex,
      );
    }
    for (const requirement of [
      'integratedV5InventoryAuthenticationRequired',
      'integratedV5NeverFundedAndDisabledProofRequired',
    ] as const) {
      const mutatedBinding = structuredClone(retirementBinding);
      mutatedBinding.requirements[requirement] = false;
      expect(
        sha256CanonicalJson(mutatedBinding, retirementDomain),
        requirement,
      ).not.toBe(
        precondition.requiredEvidence.authenticatedLegacyRetirement
          .retirementRequirementSetDigestHex,
      );
    }

    const evidenceFamilies = [
      precondition.requiredEvidence.targetCheckResult,
      precondition.requiredEvidence.confirmedTargetLineages,
      precondition.requiredEvidence.globalReplayImport,
      precondition.requiredEvidence.authenticatedLegacyRetirement,
    ];
    expect(new Set(evidenceFamilies.map(
      evidence => evidence.switchIntentDigestHex,
    ))).toEqual(new Set([precondition.commonContext.switchIntentDigestHex]));
    expect(new Set(evidenceFamilies.map(
      evidence => evidence.activationContextPolicyDigestHex,
    ))).toEqual(new Set([
      precondition.commonContext.activationContextPolicyDigestHex,
    ]));
    expect(precondition.checks.callerEvidenceAccepted).toBe(false);
    expect(
      precondition.requiredEvidence.authenticatedLegacyRetirement.requirements
        .integratedV5InventoryAuthenticationRequired,
    ).toBe(true);
    expect(
      precondition.requiredEvidence.authenticatedLegacyRetirement.requirements
        .integratedV5NeverFundedAndDisabledProofRequired,
    ).toBe(true);
    expect(Object.values(precondition.boundaries).every(value => value === false))
      .toBe(true);
  });

  it('rejects cloned, cross-bound, accessor, and caller-widened V6 switch inputs', () => {
    const first = fixture();
    const firstEligibility =
      buildValidityApplicationPooledReserveCutoverEligibilityV6(first);
    const firstRequest =
      buildValidityApplicationPooledReserveTargetCheckRequestV6({
        cutoverEligibility: firstEligibility,
        provisioningPlan: first.provisioningPlan,
      });

    expect(() =>
      buildValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6({
        cutoverEligibility: structuredClone(firstEligibility),
        targetCheckRequest: firstRequest,
      })
    ).toThrow(/not built in this process/);
    expect(() =>
      buildValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6({
        cutoverEligibility: firstEligibility,
        targetCheckRequest: structuredClone(firstRequest),
      })
    ).toThrow(/not built in this process/);

    const second = fixture();
    const secondPlan = mutableProvisioningPlan(second);
    secondPlan.targetNetwork.ergoGenesisBlockIdHex = hash('second-v6-genesis');
    secondPlan.planDigestHex = hash('second-v6-plan');
    const secondEligibility =
      buildValidityApplicationPooledReserveCutoverEligibilityV6({
        ...second,
        provisioningPlan: secondPlan,
      });
    const secondRequest =
      buildValidityApplicationPooledReserveTargetCheckRequestV6({
        cutoverEligibility: secondEligibility,
        provisioningPlan: secondPlan,
      });
    const firstPrecondition =
      buildValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6({
        cutoverEligibility: firstEligibility,
        targetCheckRequest: firstRequest,
      });
    const secondPrecondition =
      buildValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6({
        cutoverEligibility: secondEligibility,
        targetCheckRequest: secondRequest,
      });
    expect(secondPrecondition.commonContext.switchIntentDigestHex).not.toBe(
      firstPrecondition.commonContext.switchIntentDigestHex,
    );
    expect(
      secondPrecondition.commonContext.activationContextPolicyDigestHex,
    ).not.toBe(
      firstPrecondition.commonContext.activationContextPolicyDigestHex,
    );
    expect(() =>
      buildValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6({
        cutoverEligibility: firstEligibility,
        targetCheckRequest: secondRequest,
      })
    ).toThrow(/do not describe one exact target/);
    expect(() =>
      buildValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6({
        cutoverEligibility: firstEligibility,
        targetCheckRequest: firstRequest,
        approved: true,
      } as any)
    ).toThrow(/fields are not exact/);

    let getterReads = 0;
    const accessorInput: Record<string, unknown> = {
      targetCheckRequest: firstRequest,
    };
    Object.defineProperty(accessorInput, 'cutoverEligibility', {
      enumerable: true,
      get() {
        getterReads += 1;
        return firstEligibility;
      },
    });
    expect(() =>
      buildValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6(
        accessorInput as any,
      )
    ).toThrow(/own data property/);
    expect(getterReads).toBe(0);
  });

  it('rejects omitted routes, unsafe inventory, and retirement claims', () => {
    const omitted = mutableReview(fixture());
    omitted.routes.pop();
    expectBuildWithReview(omitted).toThrow(/exact observed V4 legacy route set/);

    for (const classification of ['funded', 'unresolved'] as const) {
      const unsafe = mutableReview(fixture());
      firstErgoInstance(unsafe).inventoryClassification = classification;
      expectBuildWithReview(unsafe).toThrow(
        new RegExp(`is ${classification}`),
      );
    }

    const claimedRetirement = mutableReview(fixture());
    claimedRetirement.routes[0].retirement.routeRetired = true;
    expectBuildWithReview(claimedRetirement).toThrow(
      /does not accept retirement claims/,
    );
  });

  it('rejects incomplete replay lineage and cross-packet drift', () => {
    const missing = mutableReview(fixture());
    missing.replay.lineages.pop();
    expectBuildWithReview(missing).toThrow(/one replay lineage per DUP instance/);

    const replayDrift = fixture();
    const provisioningPlan = mutableProvisioningPlan(replayDrift);
    provisioningPlan.lineage.cutoverObservationReportDigestHex =
      hash('wrong-observation');
    expect(() =>
      buildValidityApplicationPooledReserveCutoverEligibilityV6({
        ...replayDrift,
        provisioningPlan,
      })
    ).toThrow(/does not bind the exact V4 review and replay state/);
  });

  it('accepts one mapped lineage and rejects each isolated admission drift', () => {
    const valid = fixtureWithNonemptyLineage();
    const candidate =
      buildValidityApplicationPooledReserveCutoverEligibilityV6(valid);
    expect(candidate.replay.mappedLineageCount).toBe(1);
    expect(candidate.replay.plannedCanonicalBurnIdCount).toBe(1);

    const cases: readonly [string, (lineage: any) => void][] = [
      ['classification', lineage => {
        lineage.lineageClassification = 'never-funded';
      }],
      ['contribution kind', lineage => {
        lineage.contributionKind = 'empty-observed-lineage';
      }],
      ['event mapping', lineage => {
        lineage.eventMapping = 'not-required-empty-lineage';
      }],
      ['source admission', lineage => {
        lineage.sourceAdmission = 'not-required-empty-lineage';
      }],
      ['replay import digest', lineage => {
        lineage.replayImportPacketDigestHex = null;
      }],
      ['canonical burn count', lineage => {
        lineage.canonicalBurnIdCount = 0;
      }],
    ];
    for (const [label, mutate] of cases) {
      const input = fixtureWithNonemptyLineage();
      const review = structuredClone(input.cutoverReview) as any;
      mutate(review.replay.lineages[0]);
      provenance.reviews.add(review);
      expect(
        () => buildValidityApplicationPooledReserveCutoverEligibilityV6({
          ...input,
          cutoverReview: review,
        }),
        label,
      ).toThrow(/nonempty and unmapped or inconsistent/);
    }
  });

  it('rejects isolated global replay array, count, and digest drift', () => {
    const cases: readonly [string, (plan: any) => void][] = [
      ['burn-ID array', plan => {
        plan.lineage.plannedCanonicalBurnIdsHex = [];
      }],
      ['burn-ID count', plan => {
        plan.lineage.plannedCanonicalBurnIdCount = 2;
      }],
      ['AVL digest', plan => {
        plan.lineage.plannedReplayDigestHex = getDupTreeDigest([
          hash('other-mapped-burn'),
        ]);
      }],
    ];
    for (const [label, mutate] of cases) {
      const input = fixtureWithNonemptyLineage();
      const provisioningPlan = mutableProvisioningPlan(input);
      mutate(provisioningPlan);
      expect(
        () => buildValidityApplicationPooledReserveCutoverEligibilityV6({
          ...input,
          provisioningPlan,
        }),
        label,
      ).toThrow(/does not bind the exact V4 review and replay state/);
    }
  });

  it('rejects unsorted and duplicate canonical burn IDs independently', () => {
    const input = fixtureWithNonemptyLineage();
    const burnIdsHex = [hash('mapped-burn-a'), hash('mapped-burn-b')].sort();
    const review = structuredClone(input.cutoverReview) as any;
    const provisioningPlan = mutableProvisioningPlan(input);
    const digestHex = getDupTreeDigest(burnIdsHex);
    review.replay.lineages[0].canonicalBurnIdCount = burnIdsHex.length;
    review.replay.importedCanonicalBurnIdCount = burnIdsHex.length;
    review.replay.duplicatePreventionGenesisDigestHex = digestHex;
    provisioningPlan.lineage.plannedCanonicalBurnIdsHex = burnIdsHex;
    provisioningPlan.lineage.plannedCanonicalBurnIdCount = burnIdsHex.length;
    provisioningPlan.lineage.plannedReplayDigestHex = digestHex;
    provenance.reviews.add(review);
    const valid = { ...input, cutoverReview: review, provisioningPlan };
    expect(() =>
      buildValidityApplicationPooledReserveCutoverEligibilityV6(valid)
    ).not.toThrow();

    for (const [label, canonicalBurnIdsHex] of [
      ['unsorted', [...burnIdsHex].reverse()],
      ['duplicate', [burnIdsHex[0]!, burnIdsHex[0]!]],
    ] as const) {
      const driftedPlan = structuredClone(provisioningPlan) as any;
      driftedPlan.lineage.plannedCanonicalBurnIdsHex = canonicalBurnIdsHex;
      provenance.provisioningPlans.add(driftedPlan);
      expect(
        () => buildValidityApplicationPooledReserveCutoverEligibilityV6({
          ...valid,
          provisioningPlan: driftedPlan,
        }),
        label,
      ).toThrow(/strictly sorted and unique/);
    }
  });

  it('rejects target drift and every authority widening', () => {
    const targetDrift = fixture();
    const targetPlan = mutableProvisioningPlan(targetDrift);
    targetPlan.transactions.duplicatePreventionIssuance.outputs[0] = {
      ...targetPlan.transactions.duplicatePreventionIssuance.outputs[0],
      boxId: hash('wrong-dup-box'),
    };
    expect(() =>
      buildValidityApplicationPooledReserveCutoverEligibilityV6({
        ...targetDrift,
        provisioningPlan: targetPlan,
      })
    ).toThrow(/does not bind its predicted singleton box/);

    const networkDrift = fixture();
    const networkPlan = mutableProvisioningPlan(networkDrift);
    networkPlan.targetNetwork.ergoAddressNetworkPrefix = 0;
    expect(() =>
      buildValidityApplicationPooledReserveCutoverEligibilityV6({
        ...networkDrift,
        provisioningPlan: networkPlan,
      })
    ).toThrow(/not the exact Ergo testnet profile/);

    const profileDrift = fixture();
    const profilePlan = mutableProvisioningPlan(profileDrift);
    profilePlan.profile.sourceRuntimeProfileIdHex = hash('wrong-runtime');
    expect(() =>
      buildValidityApplicationPooledReserveCutoverEligibilityV6({
        ...profileDrift,
        provisioningPlan: profilePlan,
      })
    ).toThrow(/does not retain the exact V4 runtime identity/);

    const closureDrift = fixture();
    const closurePlan = mutableProvisioningPlan(closureDrift);
    closurePlan.localPredicateClosure.acceptanceFixtureSha256Hex =
      hash('wrong-local-predicate-closure');
    expect(() =>
      buildValidityApplicationPooledReserveCutoverEligibilityV6({
        ...closureDrift,
        provisioningPlan: closurePlan,
      })
    ).toThrow(/local predicate closure does not match the exact reviewed identity/);

    const singletonDrift = fixture();
    const singletonPlan = mutableProvisioningPlan(singletonDrift);
    singletonPlan.lineage.trackerGenesisInputBoxIdHex = hash('wrong-input');
    expect(() =>
      buildValidityApplicationPooledReserveCutoverEligibilityV6({
        ...singletonDrift,
        provisioningPlan: singletonPlan,
      })
    ).toThrow(/does not consume its designated genesis input/);

    const sameContract = fixture();
    const sameContractPlan = mutableProvisioningPlan(sameContract);
    sameContractPlan.contracts.tracker.contractIdHex =
      sameContract.cutoverReview.application.contractIds.sourceLock;
    expect(() =>
      buildValidityApplicationPooledReserveCutoverEligibilityV6({
        ...sameContract,
        provisioningPlan: sameContractPlan,
      })
    ).toThrow(/target tracker contract must be disjoint from V4/);

    const duplicateTargetContract = fixture();
    const duplicatePlan = mutableProvisioningPlan(duplicateTargetContract);
    duplicatePlan.contracts.tracker.contractIdHex =
      duplicatePlan.contracts.duplicatePrevention.contractIdHex;
    expect(() =>
      buildValidityApplicationPooledReserveCutoverEligibilityV6({
        ...duplicateTargetContract,
        provisioningPlan: duplicatePlan,
      })
    ).toThrow(/four distinct identities/);

    const reviewAuthority = mutableReview(fixture());
    reviewAuthority.authority.fundsAuthorityEstablished = true;
    expectBuildWithReview(reviewAuthority).toThrow(/authority must remain false/);

    const provisioningAuthority = fixture();
    const widenedProvisioning = mutableProvisioningPlan(provisioningAuthority);
    widenedProvisioning.boundaries.broadcastAuthorityEstablished = true;
    expect(() =>
      buildValidityApplicationPooledReserveCutoverEligibilityV6({
        ...provisioningAuthority,
        provisioningPlan: widenedProvisioning,
      })
    ).toThrow(/provisioning boundaries must remain false/);

    const signingAuthority = fixture();
    const signingPlan = mutableProvisioningPlan(signingAuthority);
    signingPlan.stages.signing = 'authorized';
    expect(() =>
      buildValidityApplicationPooledReserveCutoverEligibilityV6({
        ...signingAuthority,
        provisioningPlan: signingPlan,
      })
    ).toThrow(/not the exact unsigned non-authorizing plan/);
  });
});

function fixture(): BuildValidityApplicationPooledReserveCutoverEligibilityV6Input {
  const sourceLineage = hash('source-lineage');
  const targetLineage = hash('target-lineage');
  const runtimeProfile = hash('runtime-profile');
  const proofSystem = hash('proof-system');
  const observationDigest = hash('observation');
  const historicalReplayDigest = hash('historical-replay');
  const globalReplayDigest = getDupTreeDigest([]);
  const sourceContracts = contractIds('v4');
  const targetContracts = contractIds('v6');
  const routes = [...VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_ROUTE_REQUIREMENTS_V4]
    .sort((left, right) => left.routeId < right.routeId ? -1 : 1)
    .map(requirement => {
      const inventoryDigest = hash(`inventory:${requirement.routeId}`);
      return {
        ...requirement,
        inventory: {
          source: requirement.layer === 'ergo'
            ? 'ergo-cutover-observation'
            : 'frontier-relayer-compatibility-inventory',
          bindingDigestHex: inventoryDigest,
          sanitizedBindingDigestHex: hash(`sanitized:${requirement.routeId}`),
          instances: requirement.layer === 'ergo'
            ? [{
              instanceId: `${requirement.routeId}-instance`,
              inventoryClassification: 'never-funded',
            }]
            : [],
          blockerCodes: ['route-retirement-evidence-is-not-authenticated'],
        },
        declaration: {
          declaredStatus: 'inactive-unverified',
          inventoryEvidenceDigestHex: inventoryDigest,
          retirementEvidenceDigestHex: hash(`retirement:${requirement.routeId}`),
        },
        retirement: {
          evidenceAuthenticated: false,
          routeRetired: false,
        },
      };
    });
  const lineages = routes
    .filter(route => route.routeClass === 'duplicate-prevention')
    .map(route => ({
      routeId: route.routeId,
      instanceId: route.inventory.instances[0].instanceId,
      lineagePacketDigestHex: hash(`lineage:${route.routeId}`),
      lineageClassification: 'never-funded',
      rawReplayKeyCount: 0,
      contributionKind: 'empty-observed-lineage',
      eventMapping: 'not-required-empty-lineage',
      sourceAdmission: 'not-required-empty-lineage',
      replayImportPacketDigestHex: null,
      canonicalBurnIdCount: 0,
      canonicalBurnIdsDigestHex: hash(`burns:${route.routeId}`),
    }));
  const review = {
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_SCHEMA,
    version: 4,
    status:
      VALIDITY_APPLICATION_POOLED_RESERVE_TESTNET_CUTOVER_REVIEW_PROFILE_V4_STATUS,
    profileDigestHex: hash('review-profile'),
    scope: {
      settlementNetworkId: 'ergo-testnet',
      sourceNetworkScope: 'public-testnet',
      sourceChainId: '1337',
      sourceOriginIdentifiersIncluded: false,
      rawObservationObjectsIncluded: false,
    },
    components: {
      ergoCutoverObservationReportDigestHex: observationDigest,
      historicalReplayGenesisPacketDigestHex: historicalReplayDigest,
      compatibilityInventoryPacketDigestHex: hash('compatibility-inventory'),
    },
    application: {
      lineageProfileIdHex: sourceLineage,
      runtimeProfileIdHex: runtimeProfile,
      applicationBindingDigestHex: hash('v4-application'),
      sourceAdmissionPolicyIdHex: hash('v4-source-admission'),
      sourceProofSystemIdHex: proofSystem,
      sourceProofProfileIdHex: hash('v4-proof-profile'),
      contractIds: sourceContracts,
    },
    activation: {
      parentAuthenticated: false,
      profileActivated: false,
    },
    replay: {
      routeProfileDigestHex: hash('route-profile'),
      routeRequirementsDigestHex: hash('route-requirements'),
      historicalLineageCount: lineages.length,
      importedCanonicalBurnIdCount: 0,
      lineageSetDigestHex: hash('lineage-set'),
      duplicatePreventionGenesisDigestHex: globalReplayDigest,
      allObservedLineagesComposed: true,
      inventoryExhaustivenessAuthenticated: false,
      lineages,
    },
    routes,
    blockers: ['review-remains-non-authorizing'],
    checks: {
      builderAssertions: {
        sameProcessComponentProvenanceVerified: true,
        exactApplicationBindingsMatched: true,
        exactDeploymentLineageTerminalMatched: true,
        exactLegacyRouteSetMatched: true,
        exactInventoryDigestPerRouteMatched: true,
        exactReplayContributionPerObservedLineageMatched: true,
        sourceOriginIdentifiersExcluded: true,
        rawObservationObjectsExcluded: true,
      },
      serializedBoundary: {
        componentProvenanceReplayed: false,
        sourceComponentMembershipReplayed: false,
        callerAuthorityClaimsAccepted: false,
      },
    },
    authority: {
      profileActivated: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    },
  } as any;
  const compiled = {
    lineageProfileIdHex: targetLineage,
    sourceRuntimeLineageProfileIdHex: sourceLineage,
    application: {
      runtimeProfileIdHex: runtimeProfile,
      burnBindingDigestHex: hash('v6-application'),
    },
    sidechainFinalityPolicy: {
      policyIdHex: hash('v6-finality-policy'),
      proofSystemIdHex: proofSystem,
      proofProfileIdHex: hash('v6-proof-profile'),
      approvedTrustAnchorDigestHex: hash('trust-anchor'),
    },
    contracts: Object.fromEntries(
      Object.entries(targetContracts).map(([role, contractIdHex]) => [
        role,
        { receipt: { contractIdHex } },
      ]),
    ),
    genesis: {
      trackerInputBoxIdHex: hash('tracker-input'),
      trackerNftIdHex: hash('tracker-nft'),
      duplicatePreventionInputBoxIdHex: hash('dup-input'),
      duplicatePreventionNftIdHex: hash('dup-nft'),
      settlementVaultInputBoxIdHex: hash('reserve-input'),
      settlementVaultNftIdHex: hash('reserve-nft'),
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
  const replay = {
    packetDigestHex: hash('replay-cutover'),
    sourceReplay: {
      historicalReplayGenesisPacketDigestHex: historicalReplayDigest,
      cutoverObservationReportDigestHex: observationDigest,
      sourceV4LineageProfileIdHex: sourceLineage,
      canonicalBurnIdsHex: [],
      canonicalBurnIdCount: 0,
      duplicatePreventionDigestHex: globalReplayDigest,
    },
    targetLineage: {
      lineageProfileIdHex: targetLineage,
      duplicatePreventionGenesisInputBoxIdHex:
        compiled.genesis.duplicatePreventionInputBoxIdHex,
      duplicatePreventionNftIdHex:
        compiled.genesis.duplicatePreventionNftIdHex,
      duplicatePreventionContractIdHex: targetContracts.duplicatePrevention,
    },
    duplicatePreventionBox: { boxId: hash('dup-box') },
    invariants: {
      globalReplayPacketConsumed: true,
      sourceV4LineageMatched: true,
      targetV6LineageRebound: true,
      replayDigestPreserved: true,
      exactV6ContractAndSingletonBound: true,
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
  provenance.reviews.add(review);
  const provisioningPlan = provisioningPlanFixture(compiled, replay);
  provenance.provisioningPlans.add(provisioningPlan);
  return {
    cutoverReview: review,
    provisioningPlan,
  };
}

function fixtureWithNonemptyLineage():
BuildValidityApplicationPooledReserveCutoverEligibilityV6Input {
  const input = fixture();
  const review = structuredClone(input.cutoverReview) as any;
  const provisioningPlan = mutableProvisioningPlan(input);
  const burnIdHex = hash('mapped-burn');
  const digestHex = getDupTreeDigest([burnIdHex]);
  review.replay.lineages[0] = {
    ...review.replay.lineages[0],
    lineageClassification: 'raw-reconstructed',
    rawReplayKeyCount: 1,
    contributionKind: 'authenticated-v2-replay-import',
    eventMapping: 'event-complete-mapping-bound',
    sourceAdmission: 'source-admission-bound',
    replayImportPacketDigestHex: hash('mapped-replay-import'),
    canonicalBurnIdCount: 1,
    canonicalBurnIdsDigestHex: hash('mapped-burn-set'),
  };
  review.replay.importedCanonicalBurnIdCount = 1;
  review.replay.duplicatePreventionGenesisDigestHex = digestHex;
  provisioningPlan.lineage.plannedCanonicalBurnIdsHex = [burnIdHex];
  provisioningPlan.lineage.plannedCanonicalBurnIdCount = 1;
  provisioningPlan.lineage.plannedReplayDigestHex = digestHex;
  provenance.reviews.add(review);
  return {
    ...input,
    cutoverReview: review,
    provisioningPlan,
  };
}

function provisioningPlanFixture(compiled: any, replay: any): any {
  const boxes = {
    tracker: { boxId: hash('tracker-box') },
    duplicatePrevention: replay.duplicatePreventionBox,
    pooledReserve: { boxId: hash('reserve-box') },
  };
  const transaction = (label: string, inputBoxIdHex: string, box: any) => ({
    txId: hash(`${label}-issuance`),
    eip12Tx: {
      inputs: [{ boxId: inputBoxIdHex }],
      dataInputs: [],
      outputs: [{}],
    },
    outputs: [box],
  });
  return {
    schema: VALIDITY_APPLICATION_POOLED_RESERVE_PROVISIONING_V6_SCHEMA,
    version: 6,
    planDigestHex: hash('provisioning-plan'),
    localPredicateClosure: {
      ...VALIDITY_APPLICATION_POOLED_RESERVE_LOCAL_PREDICATE_CLOSURE_V6,
    },
    targetNetwork: {
      ergoNetworkId: 'ergo-testnet',
      ergoAddressNetworkPrefix: 16,
      p2sAddressHeader: 19,
      ergoGenesisBlockIdHex: hash('ergo-genesis'),
      sourceNetworkIdHex: hash('source-network'),
      sidechainIdHex: hash('sidechain'),
      settlementProfileIdHex: hash('settlement-profile'),
    },
    profile: {
      targetLineageProfileIdHex: compiled.lineageProfileIdHex,
      sourceRuntimeLineageProfileIdHex:
        compiled.sourceRuntimeLineageProfileIdHex,
      sourceRuntimeProfileIdHex: compiled.application.runtimeProfileIdHex,
      burnBindingDigestHex: compiled.application.burnBindingDigestHex,
      finalityPolicyIdHex: compiled.sidechainFinalityPolicy.policyIdHex,
      proofSystemIdHex: compiled.sidechainFinalityPolicy.proofSystemIdHex,
      proofProfileIdHex: compiled.sidechainFinalityPolicy.proofProfileIdHex,
      approvedTrustAnchorDigestHex:
        compiled.sidechainFinalityPolicy.approvedTrustAnchorDigestHex,
    },
    contracts: Object.fromEntries(Object.entries(compiled.contracts).map(
      ([role, contract]: [string, any]) => [role, {
        templateSha256Hex: hash(`${role}-template`),
        resolvedSourceSha256Hex: hash(`${role}-source`),
        propositionSha256Hex: hash(`${role}-proposition`),
        contractIdHex: contract.receipt.contractIdHex,
      }],
    )),
    lineage: {
      trackerGenesisInputBoxIdHex: compiled.genesis.trackerInputBoxIdHex,
      trackerNftIdHex: compiled.genesis.trackerNftIdHex,
      duplicatePreventionGenesisInputBoxIdHex:
        compiled.genesis.duplicatePreventionInputBoxIdHex,
      duplicatePreventionNftIdHex:
        compiled.genesis.duplicatePreventionNftIdHex,
      pooledReserveGenesisInputBoxIdHex:
        compiled.genesis.settlementVaultInputBoxIdHex,
      pooledReserveNftIdHex: compiled.genesis.settlementVaultNftIdHex,
      historicalReplayGenesisPacketDigestHex:
        replay.sourceReplay.historicalReplayGenesisPacketDigestHex,
      cutoverObservationReportDigestHex:
        replay.sourceReplay.cutoverObservationReportDigestHex,
      replayCutoverPacketDigestHex: replay.packetDigestHex,
      plannedCanonicalBurnIdsHex: [
        ...replay.sourceReplay.canonicalBurnIdsHex,
      ],
      plannedCanonicalBurnIdCount: replay.sourceReplay.canonicalBurnIdCount,
      plannedReplayDigestHex:
        replay.sourceReplay.duplicatePreventionDigestHex,
    },
    transactions: {
      trackerIssuance: transaction(
        'tracker',
        compiled.genesis.trackerInputBoxIdHex,
        boxes.tracker,
      ),
      duplicatePreventionIssuance: transaction(
        'dup',
        compiled.genesis.duplicatePreventionInputBoxIdHex,
        boxes.duplicatePrevention,
      ),
      pooledReserveIssuance: transaction(
        'reserve',
        compiled.genesis.settlementVaultInputBoxIdHex,
        boxes.pooledReserve,
      ),
    },
    boxes,
    pooledReserveGenesisSeedNanoErg: '2000000',
    invariants: {
      exactTargetNetworkBound: true,
      exactCompiledV6ContractFamilyBound: true,
      allGenesisInputsPairwiseDistinct: true,
      singletonIdsEqualDesignatedGenesisInputs: true,
      genesisInputsArePureErgAndRegisterFree: true,
      globalV4ReplayStateBoundIntoV6Plan: true,
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
  };
}

function integrationHistoricalReplayPacket(compiled: any): any {
  const duplicatePreventionDigestHex = getDupTreeDigest([]);
  return {
    packetDigestHex: '81'.repeat(32),
    lineage: {
      lineageProfileIdHex: `0x${compiled.sourceRuntimeLineageProfileIdHex}`,
      encodedLineageProfileHex: `0x${'41'.repeat(64)}`,
    },
    observation: {
      cutoverObservationReportDigestHex: '82'.repeat(32),
    },
    duplicatePreventionGenesis: {
      canonicalBurnIdsHex: [],
      digestHex: duplicatePreventionDigestHex,
      registers: {
        R4: encodeCollByteRegister(Buffer.from(
          compiled.sourceRuntimeLineageProfileIdHex,
          'hex',
        )),
        R5: encodeAvlTreeRegister(
          Buffer.from(duplicatePreventionDigestHex, 'hex'),
          0x01,
          1,
        ),
      },
    },
  };
}

function mutableProvisioningPlan(
  input: BuildValidityApplicationPooledReserveCutoverEligibilityV6Input,
): any {
  const plan = structuredClone(input.provisioningPlan) as any;
  provenance.provisioningPlans.add(plan);
  return plan;
}

function mutableReview(input: BuildValidityApplicationPooledReserveCutoverEligibilityV6Input): any {
  const review = structuredClone(input.cutoverReview) as any;
  provenance.reviews.add(review);
  currentInput = { ...input, cutoverReview: review };
  return review;
}

let currentInput: BuildValidityApplicationPooledReserveCutoverEligibilityV6Input;

function expectBuildWithReview(review: any) {
  return expect(() =>
    buildValidityApplicationPooledReserveCutoverEligibilityV6({
      ...currentInput,
      cutoverReview: review,
    })
  );
}

function firstErgoInstance(review: any): any {
  return review.routes.find((route: any) => route.layer === 'ergo')
    .inventory.instances[0];
}

function contractIds(prefix: string) {
  return {
    tracker: hash(`${prefix}:tracker`),
    duplicatePrevention: hash(`${prefix}:dup`),
    sourceLock: hash(`${prefix}:source-lock`),
    pooledReserve: hash(`${prefix}:reserve`),
  };
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
