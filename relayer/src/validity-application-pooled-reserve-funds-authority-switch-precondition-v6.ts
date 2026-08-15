/**
 * Exact blocked contract for the future V6 funds-authority switch.
 * It freezes the evidence join but cannot accept evidence or authorize funds.
 */

import { sha256CanonicalJson } from './strict-json.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V6_STATUS,
  assertValidityApplicationPooledReserveCutoverEligibilityV6Provenance,
  type ValidityApplicationPooledReserveCutoverEligibilityV6Candidate,
} from './validity-application-pooled-reserve-cutover-eligibility-v6.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V6_STATUS,
  assertValidityApplicationPooledReserveTargetCheckRequestV6Provenance,
  type ValidityApplicationPooledReserveTargetCheckRequestV6Candidate,
} from './validity-application-pooled-reserve-target-check-request-v6.js';
import {
  VALIDITY_APPLICATION_POOLED_RESERVE_INTEGRATED_V5_ROUTE_REQUIREMENTS_V6,
} from './validity-application-pooled-reserve-legacy-route-requirements-v6.js';

export const
VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_PRECONDITION_V6_SCHEMA =
  'e2s.validity-application-pooled-reserve-funds-authority-switch-precondition.v6' as const;
export const
VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_PRECONDITION_V6_STATUS =
  'blocked_awaiting_authenticated_authority_evidence' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_RESULT_V6_SCHEMA =
  'e2s.validity-application-pooled-reserve-target-check-result.v6' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_LINEAGE_CONFIRMATION_V6_SCHEMA =
  'e2s.validity-application-pooled-reserve-lineage-confirmation.v6' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_REPLAY_IMPORT_CONFIRMATION_V6_SCHEMA =
  'e2s.validity-application-pooled-reserve-replay-import-confirmation.v6' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_RETIREMENT_CONFIRMATION_V6_SCHEMA =
  'e2s.validity-application-pooled-reserve-legacy-retirement-confirmation.v6' as const;
export const VALIDITY_APPLICATION_POOLED_RESERVE_ACTIVATION_CONTEXT_V6_SCHEMA =
  'e2s.validity-application-pooled-reserve-activation-context.v6' as const;

const PRECONDITION_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_PRECONDITION_V6';
const SWITCH_INTENT_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_INTENT_V6';
const ACTIVATION_CONTEXT_POLICY_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_ACTIVATION_CONTEXT_POLICY_V6';
const TARGET_NETWORK_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_PRECONDITION_V6_NETWORK';
const TRANSACTION_SET_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_PRECONDITION_V6_TRANSACTIONS';
const RETIREMENT_SET_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_PRECONDITION_V6_RETIREMENT';
const LOCAL_PREDICATE_CLOSURE_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_PRECONDITION_V6_LOCAL_PREDICATE_CLOSURE';
const TARGET_CHECK_CONTRACT_FAMILY_DIGEST_DOMAIN =
  'E2S_VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V6_CONTRACTS';
const preconditions = new WeakSet<object>();

type SetupRole =
  ValidityApplicationPooledReserveTargetCheckRequestV6Candidate[
    'transactions'
  ][number]['role'];
type ContractRole = keyof
  ValidityApplicationPooledReserveCutoverEligibilityV6Candidate[
    'targetV6'
  ]['contractIds'];

export interface BuildValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6Input {
  readonly cutoverEligibility: Readonly<
    ValidityApplicationPooledReserveCutoverEligibilityV6Candidate
  >;
  readonly targetCheckRequest: Readonly<
    ValidityApplicationPooledReserveTargetCheckRequestV6Candidate
  >;
}

export interface ValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6 {
  readonly schema:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_PRECONDITION_V6_SCHEMA;
  readonly version: 6;
  readonly status:
    typeof VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_PRECONDITION_V6_STATUS;
  readonly preconditionDigestHex: string;
  readonly source: Readonly<{
    readonly cutoverEligibilityCandidateDigestHex: string;
    readonly targetCheckRequestDigestHex: string;
    readonly provisioningPlanDigestHex: string;
  }>;
  readonly target: Readonly<{
    readonly targetNetworkDigestHex: string;
    readonly targetLineageProfileIdHex: string;
    readonly sourceRuntimeLineageProfileIdHex: string;
    readonly sourceRuntimeProfileIdHex: string;
    readonly settlementProfileIdHex: string;
    readonly contractFamilyDigestHex: string;
    readonly localPredicateClosureDigestHex: string;
    readonly contractIds: Readonly<Record<ContractRole, string>>;
  }>;
  readonly commonContext: Readonly<{
    readonly switchIntentDigestHex: string;
    readonly activationContextSchema:
      typeof VALIDITY_APPLICATION_POOLED_RESERVE_ACTIVATION_CONTEXT_V6_SCHEMA;
    readonly activationContextPolicyDigestHex: string;
    readonly requiredAuthenticatedFields: readonly [
      'activationGenerationDigestHex',
      'nodeIdentityDigestHex',
      'profileActivationDigestHex',
    ];
  }>;
  readonly requiredEvidence: Readonly<{
    readonly targetCheckResult: Readonly<{
      readonly schema:
        typeof VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_RESULT_V6_SCHEMA;
      readonly targetCheckRequestDigestHex: string;
      readonly switchIntentDigestHex: string;
      readonly activationContextPolicyDigestHex: string;
      readonly transactionReceiptSchema: string;
      readonly expectedReceiptCount: 3;
      readonly transactionSetDigestHex: string;
      readonly localPredicateClosureDigestHex: string;
      readonly transactions: readonly Readonly<{
        readonly role: SetupRole;
        readonly unsignedTxIdHex: string;
        readonly unsignedTransactionDigestHex: string;
        readonly predictedOutputBoxIdHex: string;
      }>[];
      readonly requirements: Readonly<{
        readonly producerMustBeStaticallyRegistered: true;
        readonly producerProvenanceMustBeAuthenticated: true;
        readonly authenticatedActivationGenerationDigestRequired: true;
        readonly exactActivatedProfileRequired: true;
        readonly exactLocalPredicateClosureIdentityRequired: true;
        readonly sameCheckerNodeActivationAndStateContextRequired: true;
        readonly independentUnsignedIdDerivationRequired: true;
        readonly exactSignedBytesAndResponseDigestsRequired: true;
        readonly localJvmAndTargetNodePassRequired: true;
      }>;
    }>;
    readonly confirmedTargetLineages: Readonly<{
      readonly schema:
        typeof VALIDITY_APPLICATION_POOLED_RESERVE_LINEAGE_CONFIRMATION_V6_SCHEMA;
      readonly switchIntentDigestHex: string;
      readonly activationContextPolicyDigestHex: string;
      readonly targetNetworkDigestHex: string;
      readonly targetLineageProfileIdHex: string;
      readonly contractIds: Readonly<Record<ContractRole, string>>;
      readonly singletonNftIds: Readonly<{
        readonly trackerNftIdHex: string;
        readonly duplicatePreventionNftIdHex: string;
        readonly pooledReserveNftIdHex: string;
      }>;
      readonly expectedTransactions: readonly Readonly<{
        readonly role: SetupRole;
        readonly transactionIdHex: string;
        readonly outputBoxIdHex: string;
      }>[];
      readonly requirements: Readonly<{
        readonly exactSignedTransactionIdentityRequired: true;
        readonly allOutputsConfirmedOnOneCanonicalErgoHistoryRequired: true;
        readonly exactUnspentOutputBytesAndContractsRequired: true;
        readonly uniqueSingletonNftLineagesRequired: true;
        readonly reserveZeroLiabilityGenesisRequired: true;
        readonly authenticatedActivationGenerationDigestRequired: true;
        readonly sameActivationGenerationAsTargetCheckRequired: true;
      }>;
    }>;
    readonly globalReplayImport: Readonly<{
      readonly schema:
        typeof VALIDITY_APPLICATION_POOLED_RESERVE_REPLAY_IMPORT_CONFIRMATION_V6_SCHEMA;
      readonly switchIntentDigestHex: string;
      readonly activationContextPolicyDigestHex: string;
      readonly replayCutoverPacketDigestHex: string;
      readonly historicalReplayLineageSetDigestHex: string;
      readonly expectedCanonicalBurnIdCount: number;
      readonly expectedDuplicatePreventionDigestHex: string;
      readonly duplicatePreventionTransactionIdHex: string;
      readonly duplicatePreventionBoxIdHex: string;
      readonly duplicatePreventionNftIdHex: string;
      readonly duplicatePreventionContractIdHex: string;
      readonly requirements: Readonly<{
        readonly completeHistoricalInventoryAuthenticationRequired: true;
        readonly canonicalBurnSetRecomputationRequired: true;
        readonly exactInsertOnlyAvlDigestRequired: true;
        readonly exactConfirmedDuplicatePreventionOutputRequired: true;
        readonly authenticatedActivationGenerationDigestRequired: true;
        readonly importedBurnsMustRejectBeforeFundsAuthority: true;
      }>;
    }>;
    readonly authenticatedLegacyRetirement: Readonly<{
      readonly schema:
        typeof VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_RETIREMENT_CONFIRMATION_V6_SCHEMA;
      readonly switchIntentDigestHex: string;
      readonly activationContextPolicyDigestHex: string;
      readonly exactStaticRouteSetDigestHex: string;
      readonly retirementRequirementSetDigestHex: string;
      readonly routeCount: number;
      readonly routes: readonly Readonly<{
        readonly routeId: string;
        readonly layer: string;
        readonly routeClass: string;
        readonly sourceSurface: string;
        readonly historicalAuthority: string;
        readonly requiredDisposition: string;
        readonly contractIdHex: string | null;
        readonly requirementSource:
          | 'v4-cutover-review'
          | 'v5-static-retirement-requirement';
        readonly inventorySource:
          | 'ergo-cutover-observation'
          | 'frontier-relayer-compatibility-inventory'
          | 'pending-authenticated-v5-inventory';
        readonly inventoryBindingDigestHex: string;
        readonly retirementEvidenceDigestHex: string;
        readonly instanceIds: readonly string[];
        readonly retirementEvidenceAuthenticated: false;
        readonly routeRetired: false;
      }>[];
      readonly requirements: Readonly<{
        readonly everyStaticRouteRequired: true;
        readonly inventoryExhaustivenessAuthenticationRequired: true;
        readonly integratedV5InventoryAuthenticationRequired: true;
        readonly integratedV5NeverFundedAndDisabledProofRequired: true;
        readonly perRouteRetirementEvidenceAuthenticationRequired: true;
        readonly authenticatedActivationGenerationDigestRequired: true;
        readonly everyHistoricalFundsRouteMustBeIneligible: true;
        readonly legacyVaultAndReplayLineagesMustBeFrozenOrRetired: true;
      }>;
    }>;
  }>;
  readonly atomicSwitchRule: Readonly<{
    readonly requiredEvidenceOrder: readonly [
      'target-check-result',
      'confirmed-target-lineages',
      'global-replay-import',
      'authenticated-legacy-retirement',
    ];
    readonly allEvidenceMustBindOneNetworkProfileAndActivationGeneration: true;
    readonly allEvidenceMustCarryOneSwitchIntentDigest: true;
    readonly allEvidenceMustCarryOneAuthenticatedActivationGenerationDigest: true;
    readonly allEvidenceMustBeProvenanceAuthenticated: true;
    readonly oneAtomicDecisionRequired: true;
    readonly partialSwitchRejected: true;
    readonly localStateCannotAuthorize: true;
    readonly selfDeclaredBooleansCannotAuthorize: true;
    readonly legacyRoutesMustBeIneligibleBeforeV6FundsAuthority: true;
    readonly localPredicateClosureMustMatchTargetCheck: true;
  }>;
  readonly blockers: readonly string[];
  readonly checks: Readonly<{
    readonly sameProcessEligibilityVerified: true;
    readonly sameProcessTargetCheckRequestVerified: true;
    readonly exactRequestEligibilityBindingMatched: true;
    readonly exactTargetNetworkProfileAndContractsMatched: true;
    readonly exactLocalPredicateClosureIdentityBound: true;
    readonly exactThreeTransactionLineagesBound: true;
    readonly exactGlobalReplayImportBound: true;
    readonly exactStaticLegacyRouteSetBound: true;
    readonly allFutureEvidenceRequiredAtomically: true;
    readonly callerEvidenceAccepted: false;
  }>;
  readonly boundaries: Readonly<{
    readonly targetCheckResultAccepted: false;
    readonly singletonLineageEstablished: false;
    readonly reserveLineageEstablished: false;
    readonly globalReplayImportConfirmed: false;
    readonly retirementEvidenceAuthenticated: false;
    readonly legacyRoutesRetired: false;
    readonly targetNetworkIdentityAuthenticated: false;
    readonly profileActivated: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly switchPreconditionSatisfied: false;
    readonly fundsAuthoritySwitchAuthorized: false;
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

export function buildValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6(
  input: BuildValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6Input,
): Readonly<ValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6> {
  assertExactKeys(input, [
    'cutoverEligibility',
    'targetCheckRequest',
  ], 'pooled-reserve V6 funds-authority switch precondition input');
  const eligibility = readOwnDataProperty<Readonly<
    ValidityApplicationPooledReserveCutoverEligibilityV6Candidate
  >>(input, 'cutoverEligibility', 'V6 cutover eligibility');
  const request = readOwnDataProperty<Readonly<
    ValidityApplicationPooledReserveTargetCheckRequestV6Candidate
  >>(input, 'targetCheckRequest', 'V6 target-check request');
  assertValidityApplicationPooledReserveCutoverEligibilityV6Provenance(
    eligibility,
  );
  assertValidityApplicationPooledReserveTargetCheckRequestV6Provenance(
    request,
  );
  assertBlockedInputs(eligibility, request);
  assertRequestEligibilityBinding(eligibility, request);
  const transactions = deepFreeze(request.transactions.map(transaction => ({
    role: transaction.role,
    unsignedTxIdHex: transaction.unsignedTxIdHex,
    unsignedTransactionDigestHex: transaction.unsignedTransactionDigestHex,
    predictedOutputBoxIdHex: transaction.predictedOutputBoxIdHex,
  })));
  const confirmedTransactions = deepFreeze(transactions.map(transaction => ({
    role: transaction.role,
    transactionIdHex: transaction.unsignedTxIdHex,
    outputBoxIdHex: transaction.predictedOutputBoxIdHex,
  })));
  const targetNetworkDigestHex = sha256CanonicalJson(
    request.target.network,
    TARGET_NETWORK_DIGEST_DOMAIN,
  );
  const retirementRoutes = deepFreeze(eligibility.routeInventory.routes.map(route => ({
    routeId: route.routeId,
    layer: route.layer,
    routeClass: route.routeClass,
    sourceSurface: route.sourceSurface,
    historicalAuthority: route.historicalAuthority,
    requiredDisposition: route.requiredDisposition,
    contractIdHex: route.contractIdHex,
    requirementSource: route.requirementSource,
    inventorySource: route.inventorySource,
    inventoryBindingDigestHex: route.inventoryBindingDigestHex,
    retirementEvidenceDigestHex: route.retirementEvidenceDigestHex,
    instanceIds: deepFreeze([...route.instanceIds]),
    retirementEvidenceAuthenticated: route.retirementEvidenceAuthenticated,
    routeRetired: route.routeRetired,
  })));
  const retirementRequirements = deepFreeze({
    everyStaticRouteRequired: true as const,
    inventoryExhaustivenessAuthenticationRequired: true as const,
    integratedV5InventoryAuthenticationRequired: true as const,
    integratedV5NeverFundedAndDisabledProofRequired: true as const,
    perRouteRetirementEvidenceAuthenticationRequired: true as const,
    authenticatedActivationGenerationDigestRequired: true as const,
    everyHistoricalFundsRouteMustBeIneligible: true as const,
    legacyVaultAndReplayLineagesMustBeFrozenOrRetired: true as const,
  });
  assertExactBlockedRouteSet(eligibility);
  const transactionSetDigestHex = sha256CanonicalJson(
    transactions,
    TRANSACTION_SET_DIGEST_DOMAIN,
  );
  const retirementRequirementSetDigestHex = sha256CanonicalJson(
    {
      routes: retirementRoutes,
      requirements: retirementRequirements,
    },
    RETIREMENT_SET_DIGEST_DOMAIN,
  );
  const localPredicateClosureDigestHex = sha256CanonicalJson(
    request.target.localPredicateClosure,
    LOCAL_PREDICATE_CLOSURE_DIGEST_DOMAIN,
  );
  const switchIntentDigestHex = sha256CanonicalJson({
    cutoverEligibilityCandidateDigestHex: eligibility.candidateDigestHex,
    targetCheckRequestDigestHex: request.requestDigestHex,
    provisioningPlanDigestHex: request.source.provisioningPlanDigestHex,
    targetNetworkDigestHex,
    targetLineageProfileIdHex: eligibility.targetV6.lineageProfileIdHex,
    sourceRuntimeLineageProfileIdHex:
      eligibility.targetV6.sourceRuntimeLineageProfileIdHex,
    sourceRuntimeProfileIdHex: eligibility.targetV6.sourceRuntimeProfileIdHex,
    settlementProfileIdHex: request.target.network.settlementProfileIdHex,
    contractFamilyDigestHex: request.target.profile.contractFamilyDigestHex,
    localPredicateClosureDigestHex,
    transactionSetDigestHex,
    replayCutoverPacketDigestHex:
      eligibility.targetV6.replayCutoverPacketDigestHex,
    historicalReplayLineageSetDigestHex:
      eligibility.sourceV4.replayLineageSetDigestHex,
    expectedCanonicalBurnIdCount:
      eligibility.replay.plannedCanonicalBurnIdCount,
    expectedDuplicatePreventionDigestHex:
      eligibility.sourceV4.duplicatePreventionDigestHex,
    exactStaticRouteSetDigestHex:
      eligibility.routeInventory.exactStaticRouteSetDigestHex,
    retirementRequirementSetDigestHex,
  }, SWITCH_INTENT_DIGEST_DOMAIN);
  const requiredAuthenticatedFields = deepFreeze([
    'activationGenerationDigestHex',
    'nodeIdentityDigestHex',
    'profileActivationDigestHex',
  ] as const);
  const activationContextPolicyDigestHex = sha256CanonicalJson({
    schema: VALIDITY_APPLICATION_POOLED_RESERVE_ACTIVATION_CONTEXT_V6_SCHEMA,
    switchIntentDigestHex,
    targetNetworkDigestHex,
    targetLineageProfileIdHex: eligibility.targetV6.lineageProfileIdHex,
    settlementProfileIdHex: request.target.network.settlementProfileIdHex,
    contractFamilyDigestHex: request.target.profile.contractFamilyDigestHex,
    localPredicateClosureDigestHex,
    requiredAuthenticatedFields,
  }, ACTIVATION_CONTEXT_POLICY_DIGEST_DOMAIN);

  const binding = {
    schema:
      VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_PRECONDITION_V6_SCHEMA,
    version: 6 as const,
    status:
      VALIDITY_APPLICATION_POOLED_RESERVE_FUNDS_AUTHORITY_SWITCH_PRECONDITION_V6_STATUS,
    source: {
      cutoverEligibilityCandidateDigestHex: eligibility.candidateDigestHex,
      targetCheckRequestDigestHex: request.requestDigestHex,
      provisioningPlanDigestHex: request.source.provisioningPlanDigestHex,
    },
    target: {
      targetNetworkDigestHex,
      targetLineageProfileIdHex: eligibility.targetV6.lineageProfileIdHex,
      sourceRuntimeLineageProfileIdHex:
        eligibility.targetV6.sourceRuntimeLineageProfileIdHex,
      sourceRuntimeProfileIdHex: eligibility.targetV6.sourceRuntimeProfileIdHex,
      settlementProfileIdHex: request.target.network.settlementProfileIdHex,
      contractFamilyDigestHex: request.target.profile.contractFamilyDigestHex,
      localPredicateClosureDigestHex,
      contractIds: deepFreeze({ ...eligibility.targetV6.contractIds }),
    },
    commonContext: {
      switchIntentDigestHex,
      activationContextSchema:
        VALIDITY_APPLICATION_POOLED_RESERVE_ACTIVATION_CONTEXT_V6_SCHEMA,
      activationContextPolicyDigestHex,
      requiredAuthenticatedFields,
    },
    requiredEvidence: {
      targetCheckResult: {
        schema: VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_RESULT_V6_SCHEMA,
        targetCheckRequestDigestHex: request.requestDigestHex,
        switchIntentDigestHex,
        activationContextPolicyDigestHex,
        transactionReceiptSchema: request.receiptPolicy.requiredReceiptSchema,
        expectedReceiptCount: 3 as const,
        transactionSetDigestHex,
        localPredicateClosureDigestHex,
        transactions,
        requirements: {
          producerMustBeStaticallyRegistered: true as const,
          producerProvenanceMustBeAuthenticated: true as const,
          authenticatedActivationGenerationDigestRequired: true as const,
          exactActivatedProfileRequired: true as const,
          exactLocalPredicateClosureIdentityRequired: true as const,
          sameCheckerNodeActivationAndStateContextRequired: true as const,
          independentUnsignedIdDerivationRequired: true as const,
          exactSignedBytesAndResponseDigestsRequired: true as const,
          localJvmAndTargetNodePassRequired: true as const,
        },
      },
      confirmedTargetLineages: {
        schema:
          VALIDITY_APPLICATION_POOLED_RESERVE_LINEAGE_CONFIRMATION_V6_SCHEMA,
        switchIntentDigestHex,
        activationContextPolicyDigestHex,
        targetNetworkDigestHex,
        targetLineageProfileIdHex: eligibility.targetV6.lineageProfileIdHex,
        contractIds: deepFreeze({ ...eligibility.targetV6.contractIds }),
        singletonNftIds: {
          trackerNftIdHex: eligibility.targetV6.genesis.trackerNftIdHex,
          duplicatePreventionNftIdHex:
            eligibility.targetV6.genesis.duplicatePreventionNftIdHex,
          pooledReserveNftIdHex:
            eligibility.targetV6.genesis.pooledReserveNftIdHex,
        },
        expectedTransactions: confirmedTransactions,
        requirements: {
          exactSignedTransactionIdentityRequired: true as const,
          allOutputsConfirmedOnOneCanonicalErgoHistoryRequired: true as const,
          exactUnspentOutputBytesAndContractsRequired: true as const,
          uniqueSingletonNftLineagesRequired: true as const,
          reserveZeroLiabilityGenesisRequired: true as const,
          authenticatedActivationGenerationDigestRequired: true as const,
          sameActivationGenerationAsTargetCheckRequired: true as const,
        },
      },
      globalReplayImport: {
        schema:
          VALIDITY_APPLICATION_POOLED_RESERVE_REPLAY_IMPORT_CONFIRMATION_V6_SCHEMA,
        switchIntentDigestHex,
        activationContextPolicyDigestHex,
        replayCutoverPacketDigestHex:
          eligibility.targetV6.replayCutoverPacketDigestHex,
        historicalReplayLineageSetDigestHex:
          eligibility.sourceV4.replayLineageSetDigestHex,
        expectedCanonicalBurnIdCount:
          eligibility.replay.plannedCanonicalBurnIdCount,
        expectedDuplicatePreventionDigestHex:
          eligibility.sourceV4.duplicatePreventionDigestHex,
        duplicatePreventionTransactionIdHex:
          eligibility.targetV6.transactionIdentities
            .duplicatePreventionIssuanceTxIdHex,
        duplicatePreventionBoxIdHex:
          eligibility.targetV6.transactionIdentities
            .duplicatePreventionBoxIdHex,
        duplicatePreventionNftIdHex:
          eligibility.targetV6.genesis.duplicatePreventionNftIdHex,
        duplicatePreventionContractIdHex:
          eligibility.targetV6.contractIds.duplicatePrevention,
        requirements: {
          completeHistoricalInventoryAuthenticationRequired: true as const,
          canonicalBurnSetRecomputationRequired: true as const,
          exactInsertOnlyAvlDigestRequired: true as const,
          exactConfirmedDuplicatePreventionOutputRequired: true as const,
          authenticatedActivationGenerationDigestRequired: true as const,
          importedBurnsMustRejectBeforeFundsAuthority: true as const,
        },
      },
      authenticatedLegacyRetirement: {
        schema:
          VALIDITY_APPLICATION_POOLED_RESERVE_LEGACY_RETIREMENT_CONFIRMATION_V6_SCHEMA,
        switchIntentDigestHex,
        activationContextPolicyDigestHex,
        exactStaticRouteSetDigestHex:
          eligibility.routeInventory.exactStaticRouteSetDigestHex,
        retirementRequirementSetDigestHex,
        routeCount: eligibility.routeInventory.routeCount,
        routes: retirementRoutes,
        requirements: retirementRequirements,
      },
    },
    atomicSwitchRule: {
      requiredEvidenceOrder: deepFreeze([
        'target-check-result',
        'confirmed-target-lineages',
        'global-replay-import',
        'authenticated-legacy-retirement',
      ] as const),
      allEvidenceMustBindOneNetworkProfileAndActivationGeneration: true as const,
      allEvidenceMustCarryOneSwitchIntentDigest: true as const,
      allEvidenceMustCarryOneAuthenticatedActivationGenerationDigest: true as const,
      allEvidenceMustBeProvenanceAuthenticated: true as const,
      oneAtomicDecisionRequired: true as const,
      partialSwitchRejected: true as const,
      localStateCannotAuthorize: true as const,
      selfDeclaredBooleansCannotAuthorize: true as const,
      legacyRoutesMustBeIneligibleBeforeV6FundsAuthority: true as const,
      localPredicateClosureMustMatchTargetCheck: true as const,
    },
    blockers: sortedUniqueStrings([
      ...eligibility.blockers,
      ...request.blockers,
      'provenance-authenticated-v6-target-check-result-is-not-available',
      'v6-singleton-and-reserve-lineages-are-not-confirmed',
      'global-replay-import-is-not-confirmed-on-chain',
      'legacy-route-retirement-is-not-authenticated',
      'v6-profile-activation-is-not-authenticated',
      'funds-authority-switch-is-not-authorized',
    ]),
    checks: {
      sameProcessEligibilityVerified: true as const,
      sameProcessTargetCheckRequestVerified: true as const,
      exactRequestEligibilityBindingMatched: true as const,
      exactTargetNetworkProfileAndContractsMatched: true as const,
      exactLocalPredicateClosureIdentityBound: true as const,
      exactThreeTransactionLineagesBound: true as const,
      exactGlobalReplayImportBound: true as const,
      exactStaticLegacyRouteSetBound: true as const,
      allFutureEvidenceRequiredAtomically: true as const,
      callerEvidenceAccepted: false as const,
    },
    boundaries: {
      targetCheckResultAccepted: false as const,
      singletonLineageEstablished: false as const,
      reserveLineageEstablished: false as const,
      globalReplayImportConfirmed: false as const,
      retirementEvidenceAuthenticated: false as const,
      legacyRoutesRetired: false as const,
      targetNetworkIdentityAuthenticated: false as const,
      profileActivated: false as const,
      targetNodeAcceptanceEstablished: false as const,
      switchPreconditionSatisfied: false as const,
      fundsAuthoritySwitchAuthorized: false as const,
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
  const precondition = deepFreeze({
    ...binding,
    preconditionDigestHex: sha256CanonicalJson(
      binding,
      PRECONDITION_DIGEST_DOMAIN,
    ),
  });
  preconditions.add(precondition);
  return precondition;
}

export function assertValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6Provenance(
  value: unknown,
): asserts value is Readonly<
  ValidityApplicationPooledReserveFundsAuthoritySwitchPreconditionV6
> {
  if (value === null || typeof value !== 'object' || !preconditions.has(value)) {
    throw new Error(
      'pooled-reserve V6 funds-authority switch precondition was not built in this process',
    );
  }
}

function assertBlockedInputs(
  eligibility: Readonly<
    ValidityApplicationPooledReserveCutoverEligibilityV6Candidate
  >,
  request: Readonly<
    ValidityApplicationPooledReserveTargetCheckRequestV6Candidate
  >,
): void {
  if (
    eligibility.status
      !== VALIDITY_APPLICATION_POOLED_RESERVE_CUTOVER_ELIGIBILITY_V6_STATUS
    || request.status
      !== VALIDITY_APPLICATION_POOLED_RESERVE_TARGET_CHECK_REQUEST_V6_STATUS
    || Object.values(eligibility.boundaries).some(value => value !== false)
    || Object.values(request.boundaries).some(value => value !== false)
  ) {
    throw new Error('V6 funds-authority switch inputs must remain blocked and non-authorizing');
  }
}

function assertRequestEligibilityBinding(
  eligibility: Readonly<
    ValidityApplicationPooledReserveCutoverEligibilityV6Candidate
  >,
  request: Readonly<
    ValidityApplicationPooledReserveTargetCheckRequestV6Candidate
  >,
): void {
  const expectedTransactionIds: Readonly<Record<SetupRole, string>> = {
    'tracker-issuance':
      eligibility.targetV6.transactionIdentities.trackerIssuanceTxIdHex,
    'duplicate-prevention-issuance':
      eligibility.targetV6.transactionIdentities
        .duplicatePreventionIssuanceTxIdHex,
    'pooled-reserve-issuance':
      eligibility.targetV6.transactionIdentities.pooledReserveIssuanceTxIdHex,
  };
  const expectedOutputIds: Readonly<Record<SetupRole, string>> = {
    'tracker-issuance': eligibility.targetV6.transactionIdentities.trackerBoxIdHex,
    'duplicate-prevention-issuance':
      eligibility.targetV6.transactionIdentities.duplicatePreventionBoxIdHex,
    'pooled-reserve-issuance':
      eligibility.targetV6.transactionIdentities.pooledReserveBoxIdHex,
  };
  const expectedContractFamilyDigestHex = sha256CanonicalJson(
    Object.fromEntries(([
      'tracker',
      'duplicatePrevention',
      'sourceLock',
      'pooledReserve',
    ] as const).map(role => [role, {
      ...eligibility.targetV6.contractArtifacts[role],
      contractIdHex: eligibility.targetV6.contractIds[role],
    }])),
    TARGET_CHECK_CONTRACT_FAMILY_DIGEST_DOMAIN,
  );
  if (
    request.source.cutoverEligibilityCandidateDigestHex
      !== eligibility.candidateDigestHex
    || request.source.provisioningPlanDigestHex
      !== eligibility.targetV6.provisioningPlanDigestHex
    || sha256CanonicalJson(request.target.network)
      !== sha256CanonicalJson(eligibility.targetV6.targetNetwork)
    || request.target.profile.targetLineageProfileIdHex
      !== eligibility.targetV6.lineageProfileIdHex
    || request.target.profile.sourceRuntimeLineageProfileIdHex
      !== eligibility.targetV6.sourceRuntimeLineageProfileIdHex
    || request.target.profile.sourceRuntimeProfileIdHex
      !== eligibility.targetV6.sourceRuntimeProfileIdHex
    || request.target.profile.burnBindingDigestHex
      !== eligibility.targetV6.burnBindingDigestHex
    || request.target.profile.finalityPolicyIdHex
      !== eligibility.targetV6.finalityPolicy.policyIdHex
    || request.target.profile.proofSystemIdHex
      !== eligibility.targetV6.finalityPolicy.proofSystemIdHex
    || request.target.profile.proofProfileIdHex
      !== eligibility.targetV6.finalityPolicy.proofProfileIdHex
    || request.target.profile.approvedTrustAnchorDigestHex
      !== eligibility.targetV6.finalityPolicy.approvedTrustAnchorDigestHex
    || sha256CanonicalJson(request.target.localPredicateClosure)
      !== sha256CanonicalJson(eligibility.targetV6.localPredicateClosure)
    || request.target.profile.contractFamilyDigestHex
      !== expectedContractFamilyDigestHex
    || request.transactions.length !== 3
    || request.transactions.some((transaction, index) => {
      const expectedRole = [
        'tracker-issuance',
        'duplicate-prevention-issuance',
        'pooled-reserve-issuance',
      ][index] as SetupRole | undefined;
      return expectedRole === undefined
        || transaction.role !== expectedRole
        || transaction.unsignedTxIdHex !== expectedTransactionIds[expectedRole]
        || transaction.predictedOutputBoxIdHex !== expectedOutputIds[expectedRole];
    })
  ) {
    throw new Error('V6 funds-authority switch inputs do not describe one exact target');
  }
}

function assertExactBlockedRouteSet(
  eligibility: Readonly<
    ValidityApplicationPooledReserveCutoverEligibilityV6Candidate
  >,
): void {
  const routes = eligibility.routeInventory.routes;
  const pendingIntegratedV5Routes = routes.filter(
    route => route.requirementSource === 'v5-static-retirement-requirement',
  );
  const expectedIntegratedV5Routes = new Map(
    VALIDITY_APPLICATION_POOLED_RESERVE_INTEGRATED_V5_ROUTE_REQUIREMENTS_V6
      .map(requirement => [requirement.routeId, requirement] as const),
  );
  if (
    routes.length !== eligibility.routeInventory.routeCount
    || new Set(routes.map(route => route.routeId)).size !== routes.length
    || eligibility.routeInventory.observedV4RouteCount
      + eligibility.routeInventory.pendingIntegratedV5RouteCount
      !== eligibility.routeInventory.routeCount
    || eligibility.routeInventory.pendingIntegratedV5RouteCount
      !== expectedIntegratedV5Routes.size
    || pendingIntegratedV5Routes.length !== expectedIntegratedV5Routes.size
    || routes.some(route =>
      route.retirementEvidenceAuthenticated !== false
      || route.routeRetired !== false
    )
    || pendingIntegratedV5Routes.some(route => {
      const requirement = expectedIntegratedV5Routes.get(route.routeId);
      return requirement === undefined
        || route.layer !== requirement.layer
        || route.routeClass !== requirement.routeClass
        || route.sourceSurface !== requirement.sourceSurface
        || route.historicalAuthority !== requirement.historicalAuthority
        || route.requiredDisposition !== requirement.requiredDisposition
        || route.contractIdHex !== requirement.contractIdHex
        || route.inventorySource !== 'pending-authenticated-v5-inventory'
        || route.instanceIds.length !== 0;
    })
  ) {
    throw new Error('V6 funds-authority switch requires the exact blocked legacy route set');
  }
}

function readOwnDataProperty<T>(
  value: object,
  key: string,
  label: string,
): T {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
    throw new Error(`${label} must be supplied as an own data property`);
  }
  return descriptor.value as T;
}

function assertExactKeys(
  value: object,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compareCodeUnits);
  const wanted = [...expected].sort(compareCodeUnits);
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error(`${label} fields are not exact`);
  }
}

function sortedUniqueStrings(values: readonly string[]): readonly string[] {
  const sorted = [...values].sort(compareCodeUnits);
  return deepFreeze(sorted.filter((value, index) =>
    index === 0 || value !== sorted[index - 1]
  ));
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}
