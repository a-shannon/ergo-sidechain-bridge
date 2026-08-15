import type { ErgoClient } from './ergo-client.js';
import {
  AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE,
  type StableAggregateSettlementErgoObservation,
} from './aggregate-settlement-ergo-observation.js';
import type {
  AggregateSettlementErgoObservationStatus,
} from './aggregate-settlement-ergo-finality-policy.js';
import {
  createAggregateSettlementErgoWitness,
  observeAggregateSettlementRecoveryAttempt,
  type AggregateSettlementErgoWitness,
} from './adapters/aggregate-settlement-recovery-ergo.js';
import { runAggregateSettlementRecovery } from './apps/bridge-daemon/aggregate-settlement-recovery.js';
import {
  getAggregateSettlementRecoveryPolicy,
  normalizeAggregateSettlementRecoveryTxId,
  type AggregateSettlementRecoveryResult,
} from './relayer-core/aggregate-settlement-recovery.js';
import type {
  AggregateSettlementAttempt,
  AggregateSettlementRecoveryObservationHistoryEntry,
  StateTracker,
} from './state-tracker.js';

type RecoveryState = Pick<
  StateTracker,
  | 'applyAggregateSettlementRecoveryObservation'
  | 'getConfirmedAggregateSettlementAttempts'
  | 'getRecoverableAggregateSettlementAttempts'
  | 'recordConfirmedAggregateSettlementReorgObservation'
>;

type AbandonState = Pick<
  StateTracker,
  | 'getAggregateSettlementAttempt'
  | 'recordAggregateSettlementRecoveryObservation'
  | 'abandonPendingAggregateSettlementTransportReservation'
  | 'abandonSubmittedAggregateSettlementAttempt'
>;

type RecoveryErgo = Pick<
  ErgoClient,
  'getCurrentHeight' | 'getBlockHeaderHash' | 'getTransaction' | 'hasUnconfirmedTransaction'
>;
type ScanErgo = RecoveryErgo;
type AbandonErgo = RecoveryErgo;

export { createAggregateSettlementErgoWitness };
export type { AggregateSettlementErgoWitness };

export interface AggregateSettlementRecoveryDeps {
  state: RecoveryState;
  ergo: RecoveryErgo;
  witness?: AggregateSettlementErgoWitness;
  log?: (level: 'info' | 'warn', msg: string, data?: Record<string, unknown>) => void;
}

export type { AggregateSettlementRecoveryResult };

export interface AggregateSettlementRecoveryScanRow {
  mode: AggregateSettlementAttempt['mode'];
  status: AggregateSettlementAttempt['status'];
  expectedTxId: string;
  submittedTxId: string | null;
  lookupTxId: string;
  burnTxHashes: string[];
  confirmedChain: boolean;
  mempool: boolean;
  canonical: boolean;
  unconfirmed: boolean;
  observationStatus: AggregateSettlementErgoObservationStatus;
  confirmations: number;
  requiredConfirmations: number;
  inclusionHeight: number | null;
  inclusionHeaderId: string | null;
  observedTipHeight: number;
  observedTipHeaderId: string;
}

export interface AggregateSettlementAbandonDeps {
  state: AbandonState;
  ergo: AbandonErgo;
  witness?: AggregateSettlementErgoWitness;
  expectedTxId: string;
}

export interface AggregateSettlementAbandonResult {
  expectedTxId: string;
  resetBurns: number;
  skippedBurns: number;
  missingPegOuts: number;
  abandoned: boolean;
  outcome: 'evidence_recorded' | 'retired' | 'already_retired' | 'already_abandoned';
}

const AGGREGATE_SETTLEMENT_ABANDONMENT_ABSENCE_PURPOSE = 'abandonment_absence' as const;

function normalizeBurnTxHash(txHash: string): string {
  const clean = txHash.startsWith('0x') ? txHash.slice(2) : txHash;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`sidechain burn tx hash must be 32-byte hex: ${txHash}`);
  }
  return clean.toLowerCase();
}

function submittedStatusForAttempt(attempt: AggregateSettlementAttempt): 'aggregate_submitted' | 'batch_submitted' {
  return attempt.mode === 'batch' ? 'batch_submitted' : 'aggregate_submitted';
}

export function getActiveAggregateSettlementAttemptBurnTxHashes(
  attempts: Pick<AggregateSettlementAttempt, 'burnTxHashes'>[],
): Set<string> {
  const active = new Set<string>();
  for (const attempt of attempts) {
    for (const burnTxHash of attempt.burnTxHashes) {
      active.add(normalizeBurnTxHash(burnTxHash));
    }
  }
  return active;
}

async function hasCanonicalDescendantAbsenceWindow(input: {
  ergo: AbandonErgo;
  witness: AggregateSettlementErgoWitness;
  previous: AggregateSettlementRecoveryObservationHistoryEntry | null;
  current: StableAggregateSettlementErgoObservation;
}): Promise<boolean> {
  const previous = input.previous;
  if (!previous) return false;
  const earlier = previous.observation;
  const later = input.current.record;
  if (
    previous.purpose !== AGGREGATE_SETTLEMENT_ABANDONMENT_ABSENCE_PURPOSE
    || previous.sourceAuthorityProfile !== AGGREGATE_SETTLEMENT_ERGO_SOURCE_AUTHORITY_PROFILE
    || earlier.status !== 'absent'
    || later.status !== 'absent'
    || earlier.transactionIdHex !== later.transactionIdHex
    || earlier.policyVersion !== later.policyVersion
    || earlier.requiredConfirmations !== later.requiredConfirmations
    || later.observedTipHeight <= earlier.observedTipHeight
  ) {
    return false;
  }
  const descendantDistance = later.observedTipHeight - earlier.observedTipHeight;
  if (descendantDistance < later.requiredConfirmations) return false;

  const [primaryAncestor, witnessAncestor] = await Promise.all([
    input.ergo.getBlockHeaderHash(earlier.observedTipHeight),
    input.witness.witnessSource.ergo.getBlockHeaderHash(earlier.observedTipHeight),
  ]);
  const expectedAncestor = earlier.observedTipHeaderIdHex;
  if (
    normalizeHeaderHash(primaryAncestor) !== expectedAncestor
    || normalizeHeaderHash(witnessAncestor) !== expectedAncestor
  ) {
    throw new Error('cannot abandon aggregate settlement attempt: prior absence tip is not a canonical ancestor');
  }
  return true;
}

export async function recoverAggregateSettlementAttempts(
  deps: AggregateSettlementRecoveryDeps,
): Promise<AggregateSettlementRecoveryResult> {
  return runAggregateSettlementRecovery({
    state: deps.state,
    ergo: deps.ergo,
    witness: deps.witness,
    log: deps.log,
  });
}

function normalizeHeaderHash(headerHash: string): string {
  const clean = headerHash.startsWith('0x') ? headerHash.slice(2) : headerHash;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`Ergo header hash must be 32-byte hex: ${headerHash}`);
  }
  return clean.toLowerCase();
}

export async function scanAggregateSettlementAttempts(
  deps: {
    state: Pick<AggregateSettlementRecoveryDeps, 'state'>['state'];
    ergo: ScanErgo;
    witness?: AggregateSettlementErgoWitness;
  },
): Promise<AggregateSettlementRecoveryScanRow[]> {
  const attempts = deps.state.getRecoverableAggregateSettlementAttempts();
  const rows: AggregateSettlementRecoveryScanRow[] = [];
  for (const attempt of attempts) {
    const policy = getAggregateSettlementRecoveryPolicy(attempt);
    if (!policy) {
      throw new Error(`aggregate settlement attempt ${attempt.expectedTxId} has no versioned recovery policy`);
    }
    const lookupTxId = normalizeAggregateSettlementRecoveryTxId(
      attempt.submittedTxId ?? attempt.expectedTxId,
    );
    const observed = await observeAggregateSettlementRecoveryAttempt({
      ergo: deps.ergo,
      witness: deps.witness,
      transactionId: lookupTxId,
      policy,
    });
    const record = observed.observation.record;
    const confirmedChain = record.status === 'confirmed_pre_finality'
      || record.status === 'confirmed_final';
    const mempool = record.status === 'mempool';
    rows.push({
      mode: attempt.mode,
      status: attempt.status,
      expectedTxId: attempt.expectedTxId,
      submittedTxId: attempt.submittedTxId,
      lookupTxId,
      burnTxHashes: attempt.burnTxHashes,
      confirmedChain,
      mempool,
      canonical: confirmedChain,
      unconfirmed: mempool,
      observationStatus: record.status,
      confirmations: record.confirmations,
      requiredConfirmations: record.requiredConfirmations,
      inclusionHeight: record.inclusionHeight,
      inclusionHeaderId: record.inclusionHeaderIdHex,
      observedTipHeight: record.observedTipHeight,
      observedTipHeaderId: record.observedTipHeaderIdHex,
    });
  }
  return rows;
}

export async function abandonAggregateSettlementAttempt(
  deps: AggregateSettlementAbandonDeps,
): Promise<AggregateSettlementAbandonResult> {
  const expectedTxId = deps.expectedTxId.startsWith('0x')
    ? deps.expectedTxId.slice(2).toLowerCase()
    : deps.expectedTxId.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedTxId)) {
    throw new Error(`expected aggregate settlement tx id must be 32-byte hex: ${deps.expectedTxId}`);
  }

  const attempt = deps.state.getAggregateSettlementAttempt(expectedTxId);
  if (!attempt) {
    throw new Error(`aggregate settlement attempt not found: ${expectedTxId}`);
  }
  if (attempt.status === 'confirmed') {
    throw new Error(`cannot abandon aggregate settlement attempt ${expectedTxId}: already confirmed`);
  }
  if (attempt.status === 'abandoned') {
    const alreadyRetired = (
      attempt.abandonmentReason === 'submitted_absence'
      || attempt.abandonmentReason === 'pending_transport_absence'
    )
      && attempt.ergoObservation?.status === 'absent'
      && attempt.ergoObservationSourceCount >= 2
      && attempt.ergoObservationConsensusDigest !== null
      && attempt.submittedTxId === null
      && attempt.transportReservationDigest === null
      && attempt.transportStartedAt === null
      && attempt.transportCompletedAt === null;
    return {
      expectedTxId,
      resetBurns: 0,
      skippedBurns: attempt.burnTxHashes.length,
      missingPegOuts: 0,
      abandoned: alreadyRetired,
      outcome: alreadyRetired ? 'already_retired' : 'already_abandoned',
    };
  }
  const isPendingTransportReservation = attempt.status === 'pending'
    && attempt.submittedTxId === null
    && attempt.transportReservationDigest !== null
    && attempt.transportStartedAt !== null
    && attempt.transportCompletedAt === null;
  if (attempt.status !== 'submitted' && !isPendingTransportReservation) {
    const detail = attempt.status === 'pending'
      ? 'pending attempt has no active transport reservation'
      : `status is ${attempt.status}`;
    throw new Error(`cannot abandon aggregate settlement attempt ${expectedTxId}: ${detail}`);
  }

  const lookupTxId = attempt.submittedTxId ?? attempt.expectedTxId;
  const policy = getAggregateSettlementRecoveryPolicy(attempt);
  if (!policy) {
    throw new Error(`cannot abandon aggregate settlement attempt ${expectedTxId}: no versioned recovery policy`);
  }
  if (!deps.witness) {
    throw new Error(
      `cannot abandon aggregate settlement attempt ${expectedTxId}: matching witness RPC observation is required`,
    );
  }
  const observed = await observeAggregateSettlementRecoveryAttempt({
    ergo: deps.ergo,
    witness: deps.witness,
    transactionId: lookupTxId,
    policy,
  });
  if (!observed.consensus) {
    throw new Error(`cannot abandon aggregate settlement attempt ${expectedTxId}: witness consensus is missing`);
  }
  if (observed.observation.record.status === 'confirmed_pre_finality') {
    throw new Error(`cannot abandon aggregate settlement attempt ${expectedTxId}: transaction is still confirmed pre-finality`);
  }
  if (observed.observation.record.status === 'confirmed_final') {
    throw new Error(`cannot abandon aggregate settlement attempt ${expectedTxId}: transaction is still confirmed final`);
  }
  if (observed.observation.record.status === 'mempool') {
    throw new Error(`cannot abandon aggregate settlement attempt ${expectedTxId}: transaction is still present in mempool`);
  }

  const recorded = deps.state.recordAggregateSettlementRecoveryObservation({
    expectedTxId,
    expectedLifecycleVersion: attempt.lifecycleVersion,
    expectedStatus: attempt.status,
    purpose: AGGREGATE_SETTLEMENT_ABANDONMENT_ABSENCE_PURPOSE,
    observation: observed.observation,
    consensus: observed.consensus,
  });
  const hasDescendantWindow = await hasCanonicalDescendantAbsenceWindow({
    ergo: deps.ergo,
    witness: deps.witness,
    previous: recorded.previous,
    current: observed.observation,
  });
  if (!hasDescendantWindow) {
    return {
      expectedTxId,
      resetBurns: 0,
      skippedBurns: 0,
      missingPegOuts: 0,
      abandoned: false,
      outcome: 'evidence_recorded',
    };
  }

  const mutation = isPendingTransportReservation
    ? deps.state.abandonPendingAggregateSettlementTransportReservation(
      expectedTxId,
      attempt.lifecycleVersion,
      attempt.mode,
      attempt.burnTxHashes,
      observed.observation,
      observed.consensus,
    )
    : deps.state.abandonSubmittedAggregateSettlementAttempt(
      expectedTxId,
      attempt.lifecycleVersion,
      submittedStatusForAttempt(attempt),
      attempt.burnTxHashes,
      observed.observation,
      observed.consensus,
    );

  return {
    expectedTxId,
    resetBurns: mutation.resetBurns,
    skippedBurns: mutation.skippedBurns,
    missingPegOuts: 0,
    abandoned: true,
    outcome: 'retired',
  };
}
