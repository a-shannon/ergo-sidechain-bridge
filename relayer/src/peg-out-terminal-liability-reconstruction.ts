/**
 * Resolve current, in-flight, reverted, and paid peg-out liabilities from one
 * complete sidechain supply/inventory snapshot. Submitted exits additionally
 * require an exact durable journal; paid exits require authenticated V2 DUP
 * lineage plus exact historical payout agreed across two bounded Ergo sources.
 * This is non-authorizing operational evidence, not consensus authentication
 * or a solvency certificate.
 */

import { createHash } from 'node:crypto';

import {
  assertMatchingAggregateSettlementErgoObservationConsensusProvenance,
  observeMatchingAggregateSettlementErgoTransaction,
  type AggregateSettlementErgoObservationSourcePair,
} from './adapters/aggregate-settlement-ergo-observation.js';
import {
  assertAuthenticatedV2DupReconstructionProvenance,
  reconstructAuthenticatedV2DupHistoryFromDistinctSources,
  type AuthenticatedV2DupChainSource,
} from './authenticated-v2-dup-reconstruction.js';
import {
  assertAuthenticatedV2HistoricalPayoutAgreementProvenance,
  collectAuthenticatedV2HistoricalPayoutFromDistinctSources,
  type AuthenticatedV2HistoricalPayoutChainSource,
} from './authenticated-v2-historical-payout-evidence.js';
import type {
  AuthenticatedSpvTrackerNodeSource,
} from './authenticated-spv-tracker-read-only-node-client.js';
import {
  assertOutstandingPegOutLiabilityObservation,
  LEGACY_FAILED_PEG_OUT_CLASS_V1,
  projectCrossLedgerBackingAlarm,
  type CrossLedgerBackingAlarmProjection,
  type OutstandingPegOutLiabilityObservation,
} from './relayer-core/cross-ledger-backing-alarm.js';
import {
  assertCompleteSidechainBackingSnapshotProvenance,
  type CompleteSidechainBackingSnapshot,
  type CompletePegOutBackingInventoryEntry,
  type CompletePegOutBackingInventoryResult,
} from './relayer-core/peg-out-backing-inventory.js';

const SOURCE_ID_DIGEST_DOMAIN =
  'E2S_PEG_OUT_TERMINAL_LIABILITY_SOURCE_ID_V1';
const RESOLUTIONS = new WeakSet<object>();
const RESOLUTION_SNAPSHOTS = new WeakMap<
  object,
  CompleteSidechainBackingSnapshot
>();

type TerminalLiabilitySource = AuthenticatedV2DupChainSource
  & AuthenticatedV2HistoricalPayoutChainSource;

export interface AuthenticatedV2TerminalLiabilityProfile {
  readonly primarySource: AuthenticatedSpvTrackerNodeSource;
  readonly witnessSource: AuthenticatedSpvTrackerNodeSource;
  readonly duplicatePreventionNftIdHex: string;
  readonly duplicatePreventionErgoTreeHex: string;
  readonly settlementObservationSources: AggregateSettlementErgoObservationSourcePair;
}

export interface ExcludedAuthenticatedV2Payout {
  readonly burnIdHex: string;
  readonly legacyHistoryKeyHex: string;
  readonly ergoSettlementTransactionIdHex: string;
  readonly ergoSettlementBlockIdHex: string;
  readonly ergoSettlementInclusionHeight: number;
  readonly payoutBoxIdHex: string;
  readonly payoutValueNanoErg: bigint;
  readonly payoutErgoTreeHex: string;
  readonly payoutAgreementDigestHex: string;
}

export interface PegOutTerminalLiabilityResolution {
  readonly retainedLiabilities: readonly OutstandingPegOutLiabilityObservation[];
  readonly excludedAuthenticatedV2Payouts: readonly ExcludedAuthenticatedV2Payout[];
  readonly excludedRevertedBurns: readonly ExcludedRevertedBurn[];
}

export interface ExcludedRevertedBurn {
  readonly burnIdHex: string;
  readonly sidechainTransactionHashHex: string;
  readonly sidechainLogIndex: number;
  readonly absencePinnedHeight: number;
  readonly absencePinnedBlockHashHex: string;
}

export interface ReconstructPegOutTerminalLiabilitiesInput {
  readonly observations: readonly OutstandingPegOutLiabilityObservation[];
  readonly aggregateSettlementAttempts:
    readonly InFlightAggregateSettlementAttempt[];
  readonly authenticatedSettlementBindings:
    readonly ActiveAuthenticatedSettlementBinding[];
  readonly authenticatedV2: AuthenticatedV2TerminalLiabilityProfile | null;
  readonly sidechainBackingSnapshot: CompleteSidechainBackingSnapshot;
}

export interface InFlightAggregateSettlementAttempt {
  readonly mode: 'single' | 'single-with-ingest' | 'batch';
  readonly expectedTxId: string;
  readonly submittedTxId: string | null;
  readonly burnTxHashes: readonly string[];
  readonly status: 'pending' | 'submitted' | 'confirmed' | 'abandoned';
}

export interface ActiveAuthenticatedSettlementBinding {
  readonly candidateIdHex: string;
  readonly burnIdHex: string;
  readonly sidechainTransactionHashHex: string;
  readonly expectedTransactionIdHex: string | null;
  readonly status: 'prepared' | 'check_passed';
}

export async function reconstructPegOutTerminalLiabilities(
  input: ReconstructPegOutTerminalLiabilitiesInput,
): Promise<Readonly<PegOutTerminalLiabilityResolution>> {
  assertCompleteSidechainBackingSnapshotProvenance(
    input.sidechainBackingSnapshot,
  );
  const completeSidechainInventory = input.sidechainBackingSnapshot.inventory;
  const currentInventoryByBurnId = new Map(
    completeSidechainInventory.entries.map(
      entry => [entry.burnIdHex, entry] as const,
    ),
  );
  const currentInventoryByTransactionHash = groupInventoryByTransactionHash(
    completeSidechainInventory.entries,
  );
  const seenBurnIds = new Set<string>();
  const transactionEventCounts = new Map<string, number>();
  const observationsByTransactionHash = new Map<
    string,
    OutstandingPegOutLiabilityObservation[]
  >();
  const observationsByBurnId = new Map<
    string,
    OutstandingPegOutLiabilityObservation
  >();
  for (const observation of input.observations) {
    assertOutstandingPegOutLiabilityObservation(observation);
    if (seenBurnIds.has(observation.burnIdHex)) {
      throw new Error(`duplicate peg-out burn identity ${observation.burnIdHex}`);
    }
    seenBurnIds.add(observation.burnIdHex);
    observationsByBurnId.set(observation.burnIdHex, observation);
    transactionEventCounts.set(
      observation.sidechainTransactionHashHex,
      (transactionEventCounts.get(observation.sidechainTransactionHashHex) ?? 0) + 1,
    );
    const transactionObservations = observationsByTransactionHash.get(
      observation.sidechainTransactionHashHex,
    ) ?? [];
    transactionObservations.push(observation);
    observationsByTransactionHash.set(
      observation.sidechainTransactionHashHex,
      transactionObservations,
    );
  }
  const seenAttemptTransactionIds = new Set<string>();
  const claimedBurnTransactions = new Set<string>();
  for (const attempt of input.aggregateSettlementAttempts) {
    assertInFlightAggregateSettlementAttempt(attempt);
    if (seenAttemptTransactionIds.has(attempt.expectedTxId)) {
      throw new Error(
        `duplicate aggregate settlement liability journal ${attempt.expectedTxId}`,
      );
    }
    seenAttemptTransactionIds.add(attempt.expectedTxId);
    for (const burnTransactionHashHex of attempt.burnTxHashes) {
      if (claimedBurnTransactions.has(burnTransactionHashHex)) {
        throw new Error(
          `aggregate settlement liability journals overlap at burn ${burnTransactionHashHex}`,
        );
      }
      claimedBurnTransactions.add(burnTransactionHashHex);
    }
  }
  assertActiveAuthenticatedSettlementBindings(
    input.authenticatedSettlementBindings,
    observationsByBurnId,
  );
  for (const attempt of input.aggregateSettlementAttempts) {
    assertActiveSettlementJournalMembership({
      attempt,
      observationsByTransactionHash,
      currentInventoryByBurnId,
      currentInventoryByTransactionHash,
      completeSidechainInventory,
    });
  }

  const retained: OutstandingPegOutLiabilityObservation[] = [];
  const inFlight: OutstandingPegOutLiabilityObservation[] = [];
  const phase2: OutstandingPegOutLiabilityObservation[] = [];
  const reverted: OutstandingPegOutLiabilityObservation[] = [];
  const failed: OutstandingPegOutLiabilityObservation[] = [];
  for (const observation of input.observations) {
    if (observation.status === 'detected' || observation.status === 'confirmed') {
      retained.push(observation);
    } else if (
      observation.status === 'phase1_created'
      || observation.status === 'aggregate_submitted'
      || observation.status === 'batch_submitted'
    ) {
      inFlight.push(observation);
    } else if (observation.status === 'phase2_unlocked') {
      phase2.push(observation);
    } else if (observation.status === 'burn_reverted') {
      reverted.push(observation);
    } else if (observation.status === 'failed') {
      failed.push(observation);
    } else {
      throw new Error(
        `cannot resolve peg-out status ${observation.status} without its dedicated canonical reconstruction`,
      );
    }
  }

  for (const observation of inFlight) {
    assertInventoryPinCoversObservation(completeSidechainInventory, observation);
    const current = currentInventoryByBurnId.get(observation.burnIdHex);
    if (current === undefined) {
      throw new Error(
        `current complete sidechain inventory does not contain in-flight burn ${observation.burnIdHex}`,
      );
    }
    assertCurrentInventoryBurnMatches(current, observation);
    if (
      observation.status === 'aggregate_submitted'
      || observation.status === 'batch_submitted'
    ) {
      assertSubmittedLiabilityAttempt({
        observation,
        attempts: input.aggregateSettlementAttempts,
        observationsByTransactionHash,
        currentInventoryByBurnId,
        currentInventoryByTransactionHash,
        completeSidechainInventory,
      });
    }
    retained.push(Object.freeze({
      ...observation,
      sidechainBlockHashHex: current.sidechainBlockHashHex,
      sidechainBurnHeight: current.sidechainBurnHeight,
      inFlightSettlementTransactionIdHex: null,
      phase2UnlockTransactionIdHex: null,
      status: 'detected',
    }));
  }

  for (const observation of failed) {
    assertInventoryPinCoversObservation(completeSidechainInventory, observation);
    const current = currentInventoryByBurnId.get(observation.burnIdHex);
    if (current === undefined) {
      throw new Error(
        `${LEGACY_FAILED_PEG_OUT_CLASS_V1} burn ${observation.burnIdHex} is absent and requires external settlement reconstruction`,
      );
    }
    assertCurrentInventoryBurnMatches(current, observation);
    retained.push(Object.freeze({
      ...observation,
      sidechainBlockHashHex: current.sidechainBlockHashHex,
      sidechainBurnHeight: current.sidechainBurnHeight,
      inFlightSettlementTransactionIdHex: null,
      phase2UnlockTransactionIdHex: null,
      status: 'detected',
    }));
  }

  const excludedReverted: ExcludedRevertedBurn[] = [];
  for (const observation of reverted) {
    assertInventoryPinCoversObservation(completeSidechainInventory, observation);
    const current = currentInventoryByBurnId.get(observation.burnIdHex);
    if (current === undefined) {
      excludedReverted.push(Object.freeze({
        burnIdHex: observation.burnIdHex,
        sidechainTransactionHashHex: observation.sidechainTransactionHashHex,
        sidechainLogIndex: observation.sidechainLogIndex,
        absencePinnedHeight: completeSidechainInventory.pinnedHeight,
        absencePinnedBlockHashHex:
          completeSidechainInventory.pinnedBlockHashHex,
      }));
      continue;
    }
    assertCurrentInventoryBurnMatches(current, observation);
    retained.push(Object.freeze({
      ...observation,
      sidechainBlockHashHex: current.sidechainBlockHashHex,
      sidechainBurnHeight: current.sidechainBurnHeight,
      status: 'detected',
    }));
  }

  if (phase2.length === 0) {
    return brandResolution(
      retained,
      [],
      excludedReverted,
      input.sidechainBackingSnapshot,
    );
  }
  if (input.authenticatedV2 === null) {
    throw new Error(
      'authenticated V2 reconstruction profile is unavailable for a phase2_unlocked liability',
    );
  }

  for (const observation of phase2) {
    assertInventoryPinCoversObservation(completeSidechainInventory, observation);
    const current = currentInventoryByBurnId.get(observation.burnIdHex);
    if (current === undefined) {
      throw new Error(
        `current complete sidechain inventory does not contain phase2_unlocked burn ${observation.burnIdHex}`,
      );
    }
    assertCurrentInventoryBurnMatches(current, observation);
    const eventCount = transactionEventCounts.get(
      observation.sidechainTransactionHashHex,
    ) ?? 0;
    if (eventCount !== 1) {
      throw new Error(
        `legacy authenticated V2 history key ${observation.sidechainTransactionHashHex} `
        + `is shared by ${eventCount} sidechain events`,
      );
    }
    if (observation.phase2UnlockTransactionIdHex === null) {
      throw new Error(
        'phase2_unlocked liability is missing its settlement transaction ID',
      );
    }
  }

  const primarySource = requireTerminalLiabilitySource(
    input.authenticatedV2.primarySource,
    'primary',
  );
  const witnessSource = requireTerminalLiabilitySource(
    input.authenticatedV2.witnessSource,
    'witness',
  );
  const reconstruction =
    await reconstructAuthenticatedV2DupHistoryFromDistinctSources({
      primarySource,
      witnessSource,
      duplicatePreventionNftIdHex:
        input.authenticatedV2.duplicatePreventionNftIdHex,
      duplicatePreventionErgoTreeHex:
        input.authenticatedV2.duplicatePreventionErgoTreeHex,
    });
  assertAuthenticatedV2DupReconstructionProvenance(reconstruction);

  const primarySourceIdHex = sourceIdentityDigestHex(
    primarySource.observationSourceId,
    'primary',
  );
  const witnessSourceIdHex = sourceIdentityDigestHex(
    witnessSource.observationSourceId,
    'witness',
  );
  const excluded: ExcludedAuthenticatedV2Payout[] = [];

  for (const observation of phase2) {
    const legacyHistoryKeyHex = observation.sidechainTransactionHashHex;
    const transitions = reconstruction.transitions.filter(
      transition => transition.burnIdHex === legacyHistoryKeyHex,
    );
    if (transitions.length !== 1) {
      throw new Error(
        `authenticated V2 DUP reconstruction contains ${transitions.length} `
        + `transitions for history key ${legacyHistoryKeyHex}`,
      );
    }
    const transition = transitions[0];
    if (
      transition.spendingTransactionIdHex
      !== observation.phase2UnlockTransactionIdHex
    ) {
      throw new Error(
        'persisted phase-2 settlement transaction does not match the reconstructed transaction',
      );
    }
    if (BigInt(transition.payoutValueNanoErg) !== observation.amountNanoErg) {
      throw new Error(
        'reconstructed authenticated V2 payout amount does not match the sidechain burn',
      );
    }

    const agreement =
      await collectAuthenticatedV2HistoricalPayoutFromDistinctSources({
        primarySource,
        primarySourceIdHex,
        witnessSource,
        witnessSourceIdHex,
        authenticatedV2Reconstruction: reconstruction,
        legacyHistoryKeyHex,
      });
    assertAuthenticatedV2HistoricalPayoutAgreementProvenance(agreement, {
      authenticatedV2Reconstruction: reconstruction,
      legacyHistoryKeyHex,
    });

    const stableSettlement =
      await observeMatchingAggregateSettlementErgoTransaction({
        primary: input.authenticatedV2.settlementObservationSources.primarySource,
        witness: input.authenticatedV2.settlementObservationSources.witnessSource,
        transactionId: observation.phase2UnlockTransactionIdHex,
      });
    assertMatchingAggregateSettlementErgoObservationConsensusProvenance(
      stableSettlement.consensus,
    );
    const settlementRecord = stableSettlement.consensus.record;
    if (settlementRecord.status !== 'confirmed_final') {
      throw new Error(
        'authenticated V2 historical payout is not final under the Ergo settlement policy',
      );
    }
    if (
      settlementRecord.transactionIdHex
        !== agreement.view.ergoSettlementTransactionIdHex
      || settlementRecord.inclusionHeight
        !== agreement.view.ergoSettlementInclusionHeight
      || settlementRecord.inclusionHeaderIdHex
        !== agreement.view.ergoSettlementBlockIdHex
    ) {
      throw new Error(
        'stable Ergo settlement transaction inclusion does not match the historical payout agreement',
      );
    }

    const expectedRecipientTreeHex = canonicalP2pkErgoTree(
      observation.ergoRecipientAddress,
      'sidechain burn recipient',
    );
    if (
      agreement.view.ergoSettlementTransactionIdHex
        !== observation.phase2UnlockTransactionIdHex
      || agreement.view.ergoSettlementTransactionIdHex
        !== transition.spendingTransactionIdHex
    ) {
      throw new Error(
        'historical payout agreement does not match the phase-2 settlement transaction',
      );
    }
    if (BigInt(agreement.view.payoutValueNanoErg) !== observation.amountNanoErg) {
      throw new Error(
        'historical payout agreement amount does not match the sidechain burn',
      );
    }
    if (
      canonicalP2pkErgoTree(
        agreement.view.payoutErgoTreeHex,
        'historical payout recipient',
      ) !== expectedRecipientTreeHex
    ) {
      throw new Error(
        'historical payout agreement recipient does not match the sidechain burn',
      );
    }

    excluded.push(Object.freeze({
      burnIdHex: observation.burnIdHex,
      legacyHistoryKeyHex,
      ergoSettlementTransactionIdHex:
        agreement.view.ergoSettlementTransactionIdHex,
      ergoSettlementBlockIdHex: agreement.view.ergoSettlementBlockIdHex,
      ergoSettlementInclusionHeight:
        agreement.view.ergoSettlementInclusionHeight,
      payoutBoxIdHex: agreement.view.payoutBoxIdHex,
      payoutValueNanoErg: observation.amountNanoErg,
      payoutErgoTreeHex: expectedRecipientTreeHex,
      payoutAgreementDigestHex: agreement.sources.agreementDigestHex,
    }));
  }

  return brandResolution(
    retained,
    excluded,
    excludedReverted,
    input.sidechainBackingSnapshot,
  );
}

export function projectCrossLedgerBackingAlarmFromTerminalLiabilityResolution(
  input: Readonly<{
    sidechainBackingSnapshot: CompleteSidechainBackingSnapshot;
    canonicalVaultBackingNanoErg: bigint;
    resolution: PegOutTerminalLiabilityResolution;
  }>,
): CrossLedgerBackingAlarmProjection {
  assertCompleteSidechainBackingSnapshotProvenance(
    input.sidechainBackingSnapshot,
  );
  assertPegOutTerminalLiabilityResolutionProvenance(input.resolution);
  if (
    RESOLUTION_SNAPSHOTS.get(input.resolution)
    !== input.sidechainBackingSnapshot
  ) {
    throw new Error(
      'terminal liability resolution does not match the sidechain backing snapshot',
    );
  }
  return projectCrossLedgerBackingAlarm({
    totalSupplyNanoErg: input.sidechainBackingSnapshot.totalSupplyNanoErg,
    canonicalVaultBackingNanoErg: input.canonicalVaultBackingNanoErg,
    outstandingPegOuts: input.resolution.retainedLiabilities,
  });
}

export function assertPegOutTerminalLiabilityResolutionProvenance(
  value: PegOutTerminalLiabilityResolution,
): void {
  if (!value || typeof value !== 'object' || !RESOLUTIONS.has(value)) {
    throw new Error('peg-out terminal liability resolution provenance is missing');
  }
}

function brandResolution(
  retained: readonly OutstandingPegOutLiabilityObservation[],
  excluded: readonly ExcludedAuthenticatedV2Payout[],
  excludedReverted: readonly ExcludedRevertedBurn[],
  sidechainBackingSnapshot: CompleteSidechainBackingSnapshot,
): Readonly<PegOutTerminalLiabilityResolution> {
  const resolution = Object.freeze({
    retainedLiabilities: Object.freeze(retained.map(
      observation => Object.freeze({ ...observation }),
    )),
    excludedAuthenticatedV2Payouts: Object.freeze([...excluded]),
    excludedRevertedBurns: Object.freeze([...excludedReverted]),
  });
  RESOLUTIONS.add(resolution);
  RESOLUTION_SNAPSHOTS.set(resolution, sidechainBackingSnapshot);
  return resolution;
}

function assertInventoryPinCoversObservation(
  inventory: CompletePegOutBackingInventoryResult,
  observation: OutstandingPegOutLiabilityObservation,
): void {
  if (inventory.pinnedHeight < observation.sidechainBurnHeight) {
    throw new Error(
      `complete sidechain inventory pin ${inventory.pinnedHeight} predates burn height ${observation.sidechainBurnHeight}`,
    );
  }
}

function assertCurrentInventoryBurnMatches(
  current: CompletePegOutBackingInventoryEntry,
  observation: OutstandingPegOutLiabilityObservation,
): void {
  const matches = current.burnIdHex === observation.burnIdHex
    && current.sidechainIdHex === observation.sidechainIdHex
    && current.sidechainTransactionHashHex
      === observation.sidechainTransactionHashHex
    && current.sidechainLogIndex === observation.sidechainLogIndex
    && current.amountNanoErg === observation.amountNanoErg
    && canonicalP2pkErgoTree(
      current.ergoRecipientAddress,
      'current sidechain burn recipient',
    ) === canonicalP2pkErgoTree(
      observation.ergoRecipientAddress,
      'persisted sidechain burn recipient',
    );
  if (!matches) {
    throw new Error(
      `current sidechain burn ${observation.burnIdHex} does not match persisted burn semantics`,
    );
  }
}

function assertSubmittedLiabilityAttempt(input: Readonly<{
  observation: OutstandingPegOutLiabilityObservation;
  attempts: readonly InFlightAggregateSettlementAttempt[];
  observationsByTransactionHash: ReadonlyMap<
    string,
    readonly OutstandingPegOutLiabilityObservation[]
  >;
  currentInventoryByBurnId: ReadonlyMap<
    string,
    CompletePegOutBackingInventoryEntry
  >;
  currentInventoryByTransactionHash: ReadonlyMap<
    string,
    readonly CompletePegOutBackingInventoryEntry[]
  >;
  completeSidechainInventory: CompletePegOutBackingInventoryResult;
}>): void {
  const settlementTransactionIdHex =
    input.observation.inFlightSettlementTransactionIdHex;
  if (settlementTransactionIdHex === null) {
    throw new Error('submitted liability is missing its settlement transaction ID');
  }
  const matchingAttempts = input.attempts.filter(attempt =>
    attempt.burnTxHashes.includes(
      input.observation.sidechainTransactionHashHex,
    )
  );
  if (matchingAttempts.length !== 1) {
    throw new Error(
      `submitted liability ${input.observation.burnIdHex} matches ${matchingAttempts.length} aggregate settlement attempts`,
    );
  }
  const attempt = matchingAttempts[0];
  if (
    attempt.status !== 'submitted'
    || attempt.expectedTxId !== settlementTransactionIdHex
    || attempt.submittedTxId !== settlementTransactionIdHex
  ) {
    throw new Error(
      'submitted liability does not match one completed transport journal identity',
    );
  }
  const expectedBatch = input.observation.status === 'batch_submitted';
  if (expectedBatch !== (attempt.mode === 'batch')) {
    throw new Error('submitted liability status does not match its journal mode');
  }

  for (const burnTransactionHashHex of attempt.burnTxHashes) {
    const observations = input.observationsByTransactionHash.get(
      burnTransactionHashHex,
    ) ?? [];
    const currentEntries = input.currentInventoryByTransactionHash.get(
      burnTransactionHashHex,
    ) ?? [];
    if (observations.length !== 1 || currentEntries.length !== 1) {
      throw new Error(
        `aggregate settlement journal burn ${burnTransactionHashHex} has ambiguous event identity`,
      );
    }
    const member = observations[0];
    if (
      member.status !== input.observation.status
      || member.inFlightSettlementTransactionIdHex
        !== settlementTransactionIdHex
    ) {
      throw new Error(
        'aggregate settlement journal members do not share one submitted lifecycle identity',
      );
    }
    assertInventoryPinCoversObservation(
      input.completeSidechainInventory,
      member,
    );
    const current = input.currentInventoryByBurnId.get(member.burnIdHex);
    if (current === undefined || current !== currentEntries[0]) {
      throw new Error(
        `current complete sidechain inventory does not contain aggregate member burn ${member.burnIdHex}`,
      );
    }
    assertCurrentInventoryBurnMatches(current, member);
  }
}

function assertActiveAuthenticatedSettlementBindings(
  bindings: readonly ActiveAuthenticatedSettlementBinding[],
  observationsByBurnId: ReadonlyMap<
    string,
    OutstandingPegOutLiabilityObservation
  >,
): void {
  const seenCandidates = new Set<string>();
  const seenBurns = new Set<string>();
  for (const binding of bindings) {
    assertCanonicalHex32(
      binding.candidateIdHex,
      'authenticated settlement liability candidate ID',
    );
    assertCanonicalHex32(
      binding.burnIdHex,
      'authenticated settlement liability burn ID',
    );
    assertCanonicalHex32(
      binding.sidechainTransactionHashHex,
      'authenticated settlement liability burn transaction hash',
    );
    if (binding.expectedTransactionIdHex !== null) {
      assertCanonicalHex32(
        binding.expectedTransactionIdHex,
        'authenticated settlement liability expected transaction ID',
      );
    }
    if (binding.status !== 'prepared' && binding.status !== 'check_passed') {
      throw new Error('authenticated settlement liability candidate status is invalid');
    }
    if (
      (binding.status === 'prepared')
      !== (binding.expectedTransactionIdHex === null)
    ) {
      throw new Error(
        'authenticated settlement liability candidate status and transaction identity disagree',
      );
    }
    if (seenCandidates.has(binding.candidateIdHex)) {
      throw new Error('authenticated settlement liability candidate ID is duplicated');
    }
    if (seenBurns.has(binding.burnIdHex)) {
      throw new Error('authenticated settlement liability burn ID is duplicated');
    }
    seenCandidates.add(binding.candidateIdHex);
    seenBurns.add(binding.burnIdHex);

    const observation = observationsByBurnId.get(binding.burnIdHex);
    if (
      observation === undefined
      || observation.sidechainTransactionHashHex
        !== binding.sidechainTransactionHashHex
    ) {
      throw new Error(
        `active authenticated settlement candidate ${binding.candidateIdHex} has no exact peg-out liability member`,
      );
    }
    if (observation.status === 'failed') {
      throw new Error(
        `${LEGACY_FAILED_PEG_OUT_CLASS_V1} overlaps active authenticated settlement candidate ${binding.candidateIdHex}`,
      );
    }
  }
}

function assertActiveSettlementJournalMembership(input: Readonly<{
  attempt: InFlightAggregateSettlementAttempt;
  observationsByTransactionHash: ReadonlyMap<
    string,
    readonly OutstandingPegOutLiabilityObservation[]
  >;
  currentInventoryByBurnId: ReadonlyMap<
    string,
    CompletePegOutBackingInventoryEntry
  >;
  currentInventoryByTransactionHash: ReadonlyMap<
    string,
    readonly CompletePegOutBackingInventoryEntry[]
  >;
  completeSidechainInventory: CompletePegOutBackingInventoryResult;
}>): void {
  const expectedSubmittedStatus = input.attempt.mode === 'batch'
    ? 'batch_submitted'
    : 'aggregate_submitted';
  for (const burnTransactionHashHex of input.attempt.burnTxHashes) {
    const observations = input.observationsByTransactionHash.get(
      burnTransactionHashHex,
    ) ?? [];
    if (observations.length !== 1) {
      throw new Error(
        `active aggregate settlement journal burn ${burnTransactionHashHex} has ambiguous persisted membership`,
      );
    }
    const member = observations[0];
    if (input.attempt.status === 'pending') {
      if (member.status !== 'detected' && member.status !== 'confirmed') {
        throw new Error(
          'pending aggregate settlement journal member has incompatible lifecycle state',
        );
      }
      continue;
    }
    if (
      member.status !== expectedSubmittedStatus
      || member.inFlightSettlementTransactionIdHex
        !== input.attempt.expectedTxId
    ) {
      throw new Error(
        'submitted aggregate settlement journal member has incompatible lifecycle identity',
      );
    }
    const currentEntries = input.currentInventoryByTransactionHash.get(
      burnTransactionHashHex,
    ) ?? [];
    if (currentEntries.length !== 1) {
      throw new Error(
        `aggregate settlement journal burn ${burnTransactionHashHex} has ambiguous event identity`,
      );
    }
    assertInventoryPinCoversObservation(
      input.completeSidechainInventory,
      member,
    );
    const current = input.currentInventoryByBurnId.get(member.burnIdHex);
    if (current === undefined || current !== currentEntries[0]) {
      throw new Error(
        `current complete sidechain inventory does not contain aggregate member burn ${member.burnIdHex}`,
      );
    }
    assertCurrentInventoryBurnMatches(current, member);
  }
}

function assertInFlightAggregateSettlementAttempt(
  attempt: InFlightAggregateSettlementAttempt,
): void {
  if (
    attempt.mode !== 'single'
    && attempt.mode !== 'single-with-ingest'
    && attempt.mode !== 'batch'
  ) {
    throw new Error('aggregate settlement liability journal mode is invalid');
  }
  assertCanonicalHex32(
    attempt.expectedTxId,
    'aggregate settlement liability expected transaction ID',
  );
  if (attempt.submittedTxId !== null) {
    assertCanonicalHex32(
      attempt.submittedTxId,
      'aggregate settlement liability submitted transaction ID',
    );
  }
  if (attempt.status !== 'pending' && attempt.status !== 'submitted') {
    throw new Error('aggregate settlement liability journal status is invalid');
  }
  if (
    (attempt.status === 'pending' && attempt.submittedTxId !== null)
    || (
      attempt.status === 'submitted'
      && attempt.submittedTxId !== attempt.expectedTxId
    )
  ) {
    throw new Error(
      'aggregate settlement liability journal status and transaction identity disagree',
    );
  }
  const seenBurns = new Set<string>();
  for (const burnTransactionHashHex of attempt.burnTxHashes) {
    assertCanonicalHex32(
      burnTransactionHashHex,
      'aggregate settlement liability burn transaction hash',
    );
    if (seenBurns.has(burnTransactionHashHex)) {
      throw new Error('aggregate settlement liability journal repeats a burn transaction');
    }
    seenBurns.add(burnTransactionHashHex);
  }
  const expectedCountIsValid = attempt.mode === 'batch'
    ? attempt.burnTxHashes.length >= 2
    : attempt.burnTxHashes.length === 1;
  if (!expectedCountIsValid) {
    throw new Error('aggregate settlement liability journal has invalid claim cardinality');
  }
}

function groupInventoryByTransactionHash(
  entries: readonly CompletePegOutBackingInventoryEntry[],
): ReadonlyMap<string, readonly CompletePegOutBackingInventoryEntry[]> {
  const grouped = new Map<string, CompletePegOutBackingInventoryEntry[]>();
  for (const entry of entries) {
    const values = grouped.get(entry.sidechainTransactionHashHex) ?? [];
    values.push(entry);
    grouped.set(entry.sidechainTransactionHashHex, values);
  }
  return grouped;
}

function assertCanonicalHex32(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be canonical lowercase 32-byte hex`);
  }
}

function requireTerminalLiabilitySource(
  source: AuthenticatedSpvTrackerNodeSource,
  label: string,
): TerminalLiabilitySource {
  const candidate = source as AuthenticatedSpvTrackerNodeSource
    & Partial<AuthenticatedV2DupChainSource>;
  if (
    typeof candidate.observationSourceId !== 'string'
    || candidate.observationSourceId.length === 0
    || typeof source.getBlockByHeaderId !== 'function'
    || typeof source.getBoxBinaryByIdOrNull !== 'function'
  ) {
    throw new Error(
      `${label} authenticated V2 terminal-liability source lacks bounded reconstruction capabilities`,
    );
  }
  return source as unknown as TerminalLiabilitySource;
}

function sourceIdentityDigestHex(value: string, label: string): string {
  if (value.length === 0) {
    throw new Error(`${label} terminal-liability source identity is empty`);
  }
  return createHash('sha256')
    .update(SOURCE_ID_DIGEST_DOMAIN, 'utf8')
    .update(Buffer.from([0]))
    .update(value, 'utf8')
    .digest('hex');
}

function canonicalP2pkErgoTree(value: string, label: string): string {
  const normalized = value.replace(/^0x/, '').toLowerCase();
  if (/^(02|03)[0-9a-f]{64}$/.test(normalized)) {
    return `0008cd${normalized}`;
  }
  if (/^0008cd(02|03)[0-9a-f]{64}$/.test(normalized)) {
    return normalized;
  }
  throw new Error(`${label} must be a compressed key or canonical P2PK ErgoTree`);
}
