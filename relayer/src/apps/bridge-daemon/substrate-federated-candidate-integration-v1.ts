import blakejs from 'blakejs';

import type {
  AuthenticatedSettlementCandidateErgoClient,
} from '../../adapters/authenticated-settlement-candidate-observation.js';
import type {
  AuthenticatedSettlementCandidateStateTracker,
} from '../../adapters/authenticated-settlement-candidate-journal.js';
import {
  assertSubstrateFederatedCandidatePreparationV1,
} from '../../adapters/substrate-federated-candidate-provenance-v1.js';
import type {
  AuthenticatedSettlementCandidateReconciliationResult,
  AuthenticatedSettlementCandidateReconciliationView,
  AuthenticatedSettlementCandidateRevalidationCache,
  AuthenticatedSettlementCandidateRevalidationView,
  AuthenticatedSettlementCandidateBurnStatus,
} from '../../relayer-core/authenticated-settlement-candidate-reconciliation.js';
import {
  runAuthenticatedSettlementCandidateReconciliation,
} from './authenticated-settlement-candidate-reconciliation.js';

export const SUBSTRATE_FEDERATED_CANDIDATE_INTEGRATION_V1_SCHEMA =
  'e2s.substrate-federated-candidate-integration.v1' as const;

interface FalseAuthorityBoundary {
  readonly localJournalAuthoritative: false;
  readonly mintAuthorized: false;
  readonly trackerAdmissionAuthorized: false;
  readonly payoutAuthorized: false;
  readonly checkPassed: false;
  readonly signingAuthorized: false;
  readonly submissionAuthorized: false;
  readonly broadcastAuthorized: false;
  readonly fundsAuthorityEstablished: false;
  readonly gate5Closed: false;
  readonly trustlessStatusEstablished: false;
  readonly productionReadinessEstablished: false;
}

export interface SubstrateFederatedMintCandidatePortView {
  readonly schema: 'e2s.substrate-federated-mint-daemon-candidate.v1';
  readonly version: 1;
  readonly status: 'observed_non_authorizing';
  readonly candidateId: string;
  readonly statementIdHex: string;
  readonly reservationKeyHex: string;
  readonly lineageProfileIdHex: string;
  readonly familyIdHex: string;
  readonly sourceNetworkIdHex: string;
  readonly sidechainIdHex: string;
  readonly bridgeAddressHex: string;
  readonly tokenAddressHex: string;
  readonly settlementProfileIdHex: string;
  readonly sourceAssetIdHex: string;
  readonly targetHeaderIdHex: string;
  readonly targetHeight: string;
  readonly boundary: Readonly<FalseAuthorityBoundary>;
}

export interface SubstrateFederatedBurnCandidatePortView
  extends AuthenticatedSettlementCandidateReconciliationView {
  readonly schema: 'e2s.substrate-federated-burn-daemon-candidate.v1';
  readonly version: 1;
  readonly status: 'prepared_non_authorizing';
  readonly sidechainId: string;
  readonly familyIdHex: string;
  readonly settlementTransactionIdHex: string;
  readonly trackerInputDigestHex: string;
  readonly amountNanoErg: string;
  readonly recipientErgoTreeHashHex: string;
  readonly boundary: Readonly<FalseAuthorityBoundary>;
}

export interface SubstrateFederatedCandidateSetPortView<
  Mint extends SubstrateFederatedMintCandidatePortView,
  Burn extends SubstrateFederatedBurnCandidatePortView,
> {
  readonly schema: 'e2s.substrate-federated-daemon-candidates.v1';
  readonly version: 1;
  readonly trustModel: 'federated_non_trustless';
  readonly sharedProfile: {
    readonly sourceNetworkIdHex: string;
    readonly sidechainIdHex: string;
    readonly bridgeAddressHex: string;
    readonly tokenAddressHex: string;
    readonly settlementProfileIdHex: string;
    readonly settlementAssetIdHex: string;
    readonly familyIdHex: string;
  };
  readonly mint: Mint;
  readonly burn: Burn;
  readonly boundary: Readonly<FalseAuthorityBoundary> & {
    readonly mintAndBurnCausallyPaired: false;
    readonly localSnapshotCanRestoreCandidate: false;
    readonly freshMintObservationRequiredBeforeScheduling: true;
    readonly freshBurnObservationRequiredBeforeScheduling: true;
    readonly freshSettlementPreparationRequiredAfterRestart: true;
  };
}

export interface SubstrateFederatedMintObservationPortView {
  readonly statementIdHex: string;
  readonly reservationKeyHex: string;
  readonly lineageProfileIdHex: string;
  readonly familyIdHex: string;
  readonly targetHeaderIdHex: string;
  readonly targetHeight: string;
  readonly lifecycleStatus: 'pending';
  readonly classification: 'pending_hold';
  readonly observationDigestHex: string;
  readonly localObservationAuthoritative: false;
  readonly mintAuthorized: false;
}

export interface SubstrateFederatedCandidateIntegrationV1Deps<
  Mint extends SubstrateFederatedMintCandidatePortView,
  Burn extends SubstrateFederatedBurnCandidatePortView,
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
> {
  readonly prepareFresh: () => Promise<
    Readonly<SubstrateFederatedCandidateSetPortView<Mint, Burn>>
  >;
  readonly observeMint: (
    candidate: Readonly<Mint>,
  ) => Promise<Readonly<SubstrateFederatedMintObservationPortView>>;
  readonly state: AuthenticatedSettlementCandidateStateTracker<Burn>;
  readonly ergo: AuthenticatedSettlementCandidateErgoClient;
  readonly revalidations:
    AuthenticatedSettlementCandidateRevalidationCache<Revalidation>;
  readonly observeBurn: (
    pegOut: Parameters<
      NonNullable<Parameters<
        typeof runAuthenticatedSettlementCandidateReconciliation<
          Burn,
          Revalidation
        >
      >[0]['observeBurn']>
    >[0],
  ) => Promise<AuthenticatedSettlementCandidateBurnStatus>;
  readonly recollect: Parameters<
    typeof runAuthenticatedSettlementCandidateReconciliation<
      Burn,
      Revalidation
    >
  >[0]['recollect'];
  readonly log?: (
    level: 'info' | 'warn',
    message: string,
    data?: Record<string, unknown>,
  ) => void;
}

export interface SubstrateFederatedCandidateIntegrationV1Result {
  readonly schema: typeof SUBSTRATE_FEDERATED_CANDIDATE_INTEGRATION_V1_SCHEMA;
  readonly version: 1;
  readonly mintCandidateId: string;
  readonly burnCandidateId: string;
  readonly mintObservationDigestHex: string;
  readonly burnReconciliation:
    Readonly<AuthenticatedSettlementCandidateReconciliationResult>;
  readonly boundary: {
    readonly candidatesPreparedFreshInProcess: true;
    readonly producerProvenanceVerified: true;
    readonly mintObservationMatchedBeforeScheduling: true;
    readonly burnCandidateReconciledThroughSharedPorts: true;
    readonly localJournalAuthoritative: false;
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

export async function runSubstrateFederatedCandidateIntegrationV1<
  Mint extends SubstrateFederatedMintCandidatePortView,
  Burn extends SubstrateFederatedBurnCandidatePortView,
  Revalidation extends AuthenticatedSettlementCandidateRevalidationView,
>(
  deps: SubstrateFederatedCandidateIntegrationV1Deps<
    Mint,
    Burn,
    Revalidation
  >,
): Promise<Readonly<SubstrateFederatedCandidateIntegrationV1Result>> {
  const candidates = await deps.prepareFresh();
  assertSubstrateFederatedCandidatePreparationV1(candidates);
  assertCandidateSet(candidates);
  const mintObservation = await deps.observeMint(candidates.mint);
  assertMintObservation(candidates.mint, mintObservation);

  const state: AuthenticatedSettlementCandidateStateTracker<Burn> = {
    getActiveAuthenticatedSettlementCandidates: () => [candidates.burn],
    getPegOutByBurnId: burnId => deps.state.getPegOutByBurnId(burnId),
    invalidateAuthenticatedSettlementCandidate: (candidateId, reason) =>
      deps.state.invalidateAuthenticatedSettlementCandidate(candidateId, reason),
    markPegOutBurnRevertedAndInvalidateCandidates: (lookup, reason) =>
      deps.state.markPegOutBurnRevertedAndInvalidateCandidates(lookup, reason),
  };
  const burnReconciliation =
    await runAuthenticatedSettlementCandidateReconciliation({
      state,
      ergo: deps.ergo,
      revalidations: deps.revalidations,
      observeBurn: deps.observeBurn,
      recollect: async (candidate, pegOut) => {
        assertBurnCandidateMatchesPegOut(candidate, pegOut);
        const revalidation = await deps.recollect(candidate, pegOut);
        if (revalidation !== null) {
          assertHexEqual(
            revalidation.expectedTxId,
            candidate.settlementTransactionIdHex,
            'federated burn revalidation transaction ID',
          );
        }
        return revalidation;
      },
      ...(deps.log === undefined ? {} : { log: deps.log }),
    });

  return deepFreeze({
    schema: SUBSTRATE_FEDERATED_CANDIDATE_INTEGRATION_V1_SCHEMA,
    version: 1 as const,
    mintCandidateId: fixedHex(candidates.mint.candidateId, 'mint candidate ID'),
    burnCandidateId: fixedHex(candidates.burn.candidateId, 'burn candidate ID'),
    mintObservationDigestHex: fixedHex(
      mintObservation.observationDigestHex,
      'mint observation digest',
    ),
    burnReconciliation,
    boundary: {
      candidatesPreparedFreshInProcess: true as const,
      producerProvenanceVerified: true as const,
      mintObservationMatchedBeforeScheduling: true as const,
      burnCandidateReconciledThroughSharedPorts: true as const,
      localJournalAuthoritative: false as const,
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
  });
}

function assertBurnCandidateMatchesPegOut(
  candidate: Readonly<SubstrateFederatedBurnCandidatePortView>,
  pegOut: Readonly<{
    amount: bigint;
    ergoRecipientAddress: string;
  }>,
): void {
  if (
    !/^[1-9][0-9]*$/.test(candidate.amountNanoErg)
    || BigInt(candidate.amountNanoErg) !== pegOut.amount
  ) {
    throw new Error(
      'federated burn candidate amount differs from the persisted burn',
    );
  }
  const recipientTreeHex = canonicalRecipientTree(pegOut.ergoRecipientAddress);
  const recipientHashHex = Buffer.from(blakejs.blake2b(
    Buffer.from(recipientTreeHex, 'hex'),
    undefined,
    32,
  )).toString('hex');
  if (
    fixedHex(
      candidate.recipientErgoTreeHashHex,
      'federated burn candidate recipient hash',
    ) !== recipientHashHex
  ) {
    throw new Error(
      'federated burn candidate recipient differs from the persisted burn',
    );
  }
}

function canonicalRecipientTree(value: string): string {
  const normalized = value.replace(/^0x/i, '').toLowerCase();
  if (normalized.length === 66 && /^(02|03)/.test(normalized)) {
    return `0008cd${normalized}`;
  }
  if (normalized.length === 72 && /^(0008cd02|0008cd03)/.test(normalized)) {
    return normalized;
  }
  throw new Error(
    'federated burn recipient must be a compressed key or canonical P2PK ErgoTree',
  );
}

function assertCandidateSet(
  candidates: SubstrateFederatedCandidateSetPortView<
    SubstrateFederatedMintCandidatePortView,
    SubstrateFederatedBurnCandidatePortView
  >,
): void {
  if (
    candidates.schema !== 'e2s.substrate-federated-daemon-candidates.v1'
    || candidates.version !== 1
    || candidates.trustModel !== 'federated_non_trustless'
    || candidates.mint.status !== 'observed_non_authorizing'
    || candidates.burn.status !== 'prepared_non_authorizing'
  ) {
    throw new Error('federated candidate-set discriminators are invalid');
  }
  assertFalseBoundary(candidates.mint.boundary, 'federated mint candidate');
  assertFalseBoundary(candidates.burn.boundary, 'federated burn candidate');
  assertFalseBoundary(candidates.boundary, 'federated candidate set');
  if (
    candidates.boundary.mintAndBurnCausallyPaired !== false
    || candidates.boundary.localSnapshotCanRestoreCandidate !== false
    || candidates.boundary.freshMintObservationRequiredBeforeScheduling !== true
    || candidates.boundary.freshBurnObservationRequiredBeforeScheduling !== true
    || candidates.boundary.freshSettlementPreparationRequiredAfterRestart !== true
  ) {
    throw new Error('federated candidate-set recovery boundaries are invalid');
  }
  for (const [actual, expected, label] of [
    [candidates.mint.familyIdHex, candidates.sharedProfile.familyIdHex, 'mint family ID'],
    [candidates.burn.familyIdHex, candidates.sharedProfile.familyIdHex, 'burn family ID'],
    [candidates.mint.sourceNetworkIdHex, candidates.sharedProfile.sourceNetworkIdHex, 'source network ID'],
    [candidates.mint.sidechainIdHex, candidates.sharedProfile.sidechainIdHex, 'mint sidechain ID'],
    [candidates.burn.sidechainId, candidates.sharedProfile.sidechainIdHex, 'burn sidechain ID'],
    [candidates.mint.bridgeAddressHex, candidates.sharedProfile.bridgeAddressHex, 'bridge address'],
    [candidates.mint.tokenAddressHex, candidates.sharedProfile.tokenAddressHex, 'token address'],
    [candidates.mint.settlementProfileIdHex, candidates.sharedProfile.settlementProfileIdHex, 'settlement profile ID'],
    [candidates.mint.sourceAssetIdHex, candidates.sharedProfile.settlementAssetIdHex, 'settlement asset ID'],
  ] as const) {
    assertHexEqual(actual, expected, label);
  }
}

function assertMintObservation(
  candidate: SubstrateFederatedMintCandidatePortView,
  observation: SubstrateFederatedMintObservationPortView,
): void {
  if (
    observation.lifecycleStatus !== 'pending'
    || observation.classification !== 'pending_hold'
    || observation.localObservationAuthoritative !== false
    || observation.mintAuthorized !== false
  ) {
    throw new Error('federated mint observation is not a non-authorizing pending hold');
  }
  for (const [actual, expected, label] of [
    [observation.statementIdHex, candidate.statementIdHex, 'statement ID'],
    [observation.reservationKeyHex, candidate.reservationKeyHex, 'reservation key'],
    [observation.lineageProfileIdHex, candidate.lineageProfileIdHex, 'lineage profile ID'],
    [observation.familyIdHex, candidate.familyIdHex, 'family ID'],
    [observation.targetHeaderIdHex, candidate.targetHeaderIdHex, 'target header ID'],
  ] as const) {
    assertHexEqual(actual, expected, `mint observation ${label}`);
  }
  if (observation.targetHeight !== candidate.targetHeight) {
    throw new Error('mint observation target height mismatch');
  }
  fixedHex(observation.observationDigestHex, 'mint observation digest');
}

function assertFalseBoundary(
  boundary: Readonly<Record<string, unknown>>,
  label: string,
): void {
  for (const key of [
    'localJournalAuthoritative',
    'mintAuthorized',
    'trackerAdmissionAuthorized',
    'payoutAuthorized',
    'checkPassed',
    'signingAuthorized',
    'submissionAuthorized',
    'broadcastAuthorized',
    'fundsAuthorityEstablished',
    'gate5Closed',
    'trustlessStatusEstablished',
    'productionReadinessEstablished',
  ]) {
    if (boundary[key] !== false) {
      throw new Error(`${label} ${key} must remain false`);
    }
  }
}

function assertHexEqual(actual: string, expected: string, label: string): void {
  if (normalizeHex(actual) !== normalizeHex(expected)) {
    throw new Error(`${label} mismatch`);
  }
}

function fixedHex(value: string, label: string): string {
  const normalized = normalizeHex(value);
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${label} must be exactly 32 bytes of hexadecimal data`);
  }
  return normalized;
}

function normalizeHex(value: string): string {
  return value.replace(/^0x/i, '').toLowerCase();
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
