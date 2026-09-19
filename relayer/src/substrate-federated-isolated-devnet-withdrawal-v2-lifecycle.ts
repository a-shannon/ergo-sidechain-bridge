import axios from 'axios';
import { checkSignedTransaction, promoteLocalWasmCheckedTransactionForSubmissionV1,
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding } from './fleet-signer.js';
import { ngetDirect } from './ergo-helpers.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import { normalizeEip12Box } from './unsigned-ergo-transaction.js';
import { admitErgoOperationalTransaction,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_V2_OPERATION_PROFILE as PROFILE }
  from './relayer-core/ergo-operational-transaction-lifecycle.js';
import { StateTracker, type ErgoOperationalTransactionAttempt } from './state-tracker.js';
import { assertSubstrateFederatedIsolatedDevnetWithdrawalV2Check,
  claimSubstrateFederatedIsolatedDevnetWithdrawalV2Check,
  type SubstrateFederatedIsolatedDevnetWithdrawalV2Check as Check }
  from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import type { SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1 as Target }
  from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import { createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1,
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1 }
  from './substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
import { normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1,
  type SubstrateFederatedLocalDevnetGenesisConfirmation as Confirmation }
  from './relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';

export interface SubstrateFederatedIsolatedDevnetWithdrawalV2Authorization {
  readonly authorizationDigestHex: string;
  readonly genesisHeaderIdHex: string;
}
export interface SubstrateFederatedIsolatedDevnetWithdrawalV2Attempt {
  readonly expectedTxId: string;
  readonly durableAttemptDigestHex: string;
}
type Authorization = Readonly<SubstrateFederatedIsolatedDevnetWithdrawalV2Authorization>;
type Attempt = Readonly<SubstrateFederatedIsolatedDevnetWithdrawalV2Attempt>;
type Lineage = ReturnType<typeof claimSubstrateFederatedIsolatedDevnetWithdrawalV2Check>;
interface Material {
  readonly check: Readonly<Check>;
  readonly target: Readonly<Target>;
  readonly lineage: Lineage;
  readonly authorization: Authorization;
  readonly revalidationDigestHex: string;
}
interface DurableMaterial extends Material {
  readonly state: StateTracker;
  readonly stored: ErgoOperationalTransactionAttempt;
  readonly expectedReservation: Readonly<Record<string, unknown>>;
}
interface ConfirmedMaterial {
  readonly attempt: Attempt;
  readonly check: Readonly<Check>;
  readonly target: Readonly<Target>;
  readonly originalConfirmation: Readonly<Confirmation>;
  readonly normalizedConfirmation: Readonly<Confirmation>;
  readonly journal: Readonly<ErgoOperationalTransactionAttempt>;
}
type Submission = Readonly<{ status: 'accepted' | 'ambiguous'; submittedTxId: string | null; responseDigestHex: string | null }>;
const AUTHORIZATIONS = new WeakMap<object, Material>();
const RESERVED = new WeakSet<object>();
const ATTEMPTS = new WeakMap<object, DurableMaterial>();
const TRANSPORT_STARTED = new WeakSet<object>();
const TRANSPORT_READY = new WeakSet<object>();
const FINALIZATION_STARTED = new WeakSet<object>();
const FINALIZATIONS = new WeakMap<object, Submission>();
const CONFIRMATION_STARTED = new WeakSet<object>();
const CONFIRMATIONS = new WeakMap<object, ConfirmedMaterial>();

/** Explicit local LAB payout authority; a check or a journal row is insufficient. */
export async function authorizeSubstrateFederatedIsolatedDevnetWithdrawalV2(
  check: Readonly<Check>, target: Readonly<Target>,
): Promise<Authorization> {
  const lineage = claimSubstrateFederatedIsolatedDevnetWithdrawalV2Check(check, target);
  const revalidationDigestHex = await reobserve(check, target, lineage);
  const authorization = Object.freeze({ genesisHeaderIdHex: lineage.genesisHeaderIdHex,
    authorizationDigestHex: sha256CanonicalJson({ checkDigestHex: lineage.checkDigestHex,
      setupRequestDigestHex: lineage.setupRequestDigestHex, targetBinding: lineage.binding,
      genesisHeaderIdHex: lineage.genesisHeaderIdHex, revalidationDigestHex,
      expectedTxId: check.packet.transaction.txId,
      signedTransactionBytesSha256Hex: check.signedCandidate.signedTransactionBytesSha256Hex,
    }, 'E2S_ISOLATED_WITHDRAWAL_V2_AUTHORIZATION') });
  AUTHORIZATIONS.set(authorization, Object.freeze({ check, target, lineage, authorization, revalidationDigestHex }));
  return authorization;
}

export function reserveSubstrateFederatedIsolatedDevnetWithdrawalV2(authorization: Authorization, state: StateTracker): Attempt {
  const material = AUTHORIZATIONS.get(authorization);
  if (material === undefined || RESERVED.has(authorization) || !(state instanceof StateTracker)) {
    throw new Error('withdrawal V2 authorization is absent, consumed or has no journal');
  }
  RESERVED.add(authorization);
  assertLineage(material.check, material.target, material.lineage);
  const { check } = material;
  const tx = check.packet.transaction;
  const admission = admitErgoOperationalTransaction({ operationProfile: PROFILE, expectedTxId: tx.txId,
    sourceBoxId: check.packet.boxes.reservePredecessor.boxId,
    inputBoxIds: tx.eip12Tx.inputs.map(box => box.boxId),
    attemptedAtHeight: tx.eip12Tx.outputs[0]!.creationHeight - 1, unsignedTransaction: tx.eip12Tx });
  const { unsignedTransaction: _unsigned, ...fields } = admission;
  const reservation = Object.freeze({ ...fields,
    reconciliationIdentityDigestHex: material.lineage.binding.executionTargetIdentityDigestHex,
    signedTransactionDigestHex: check.signedCandidate.signedTransactionDigestHex,
    checkResponseDigestHex: material.lineage.checkDigestHex,
    revalidationDigestHex: material.revalidationDigestHex, authorizationDigestHex: authorization.authorizationDigestHex });
  const expectedReservation = Object.freeze({ ...reservation, fundsReleaseAuthorityEpochHex: null,
    durableAttemptDigestHex: sha256CanonicalJson({ domain: 'E2S_ERGO_OPERATIONAL_DURABLE_ATTEMPT_V1',
      ...reservation, fundsReleaseAuthorityEpochHex: null }) });
  const returned = state.reserveErgoOperationalTransactionAttempt(reservation);
  const stored = Object.freeze({ ...returned, inputBoxIds: Object.freeze([...returned.inputBoxIds]) });
  const materialized = Object.freeze({ ...material, state, stored, expectedReservation });
  assertStored(materialized, 'pending');
  const attempt = Object.freeze({ expectedTxId: stored.expectedTxId, durableAttemptDigestHex: stored.durableAttemptDigestHex });
  ATTEMPTS.set(attempt, materialized);
  return attempt;
}

/** The fixed submitter alone consumes the fresh exact-byte acceptance. */
export async function claimSubstrateFederatedIsolatedDevnetWithdrawalV2Transport(attempt: Attempt, target: Readonly<Target>) {
  const material = requireAttempt(attempt, target);
  if (TRANSPORT_STARTED.has(attempt)) throw new Error('withdrawal V2 transport is already consumed');
  TRANSPORT_STARTED.add(attempt);
  assertStored(material, 'pending');
  await reobserve(material.check, target, material.lineage);
  const checked = await checkSignedTransaction(material.check.signedCandidate, 'isolated withdrawal V2 pretransport', target.primaryNodeOrigin);
  if (checked === null) throw new Error('withdrawal V2 pretransport node check failed');
  await reobserve(material.check, target, material.lineage);
  assertStored(material, 'pending');
  const checkedAcceptance = promoteLocalWasmCheckedTransactionForSubmissionV1(material.check.signedCandidate, checked, material.lineage.binding);
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding(checkedAcceptance.submissionHandle, material.lineage.binding);
  TRANSPORT_READY.add(attempt);
  return Object.freeze({ check: material.check, binding: material.lineage.binding,
    checkedAcceptance, authorization: material.authorization });
}

export function assertSubstrateFederatedIsolatedDevnetWithdrawalV2TransportReady(attempt: Attempt, target: Readonly<Target>): void {
  const material = requireAttempt(attempt, target);
  if (!TRANSPORT_READY.has(attempt)) throw new Error('withdrawal V2 transport is not ready');
  assertStored(material, 'pending');
}

/** Result provenance is checked by the fixed transport before this journal mutation. */
export function finalizeSubstrateFederatedIsolatedDevnetWithdrawalV2TransportJournal(attempt: Attempt, submission: Submission) {
  const material = requireAttempt(attempt);
  if (!TRANSPORT_READY.has(attempt) || FINALIZATION_STARTED.has(attempt)) throw new Error('withdrawal V2 finalization is absent or consumed');
  FINALIZATION_STARTED.add(attempt);
  assertStored(material, 'pending');
  const expected = Object.freeze({ ...submission });
  const finalized = material.state.finalizeErgoOperationalTransactionAttempt({ expectedTxId: attempt.expectedTxId,
    durableAttemptDigestHex: attempt.durableAttemptDigestHex, disposition: expected.status,
    submittedTxId: expected.submittedTxId, responseDigestHex: expected.responseDigestHex });
  FINALIZATIONS.set(attempt, expected);
  assertFinalization(attempt, material);
  return finalized;
}

export async function confirmSubstrateFederatedIsolatedDevnetWithdrawalV2(attempt: Attempt, target: Readonly<Target>, value: Confirmation) {
  const material = requireAttempt(attempt, target);
  if (CONFIRMATION_STARTED.has(attempt)) throw new Error('withdrawal V2 confirmation is already consumed');
  CONFIRMATION_STARTED.add(attempt);
  assertFinalization(attempt, material);
  const confirmation = normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1(value);
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(confirmation.observerArtifact,
    material.lineage.binding.executionTargetIdentityDigestHex, material.lineage.genesisHeaderIdHex, attempt.expectedTxId, confirmation);
  if (confirmation.status !== 'confirmed' || confirmation.confirmationHeight === null || confirmation.confirmationHeaderIdHex === null) {
    throw new Error('withdrawal V2 requires canonical payout confirmation');
  }
  const assertCurrent = () => {
    assertLineage(material.check, target, material.lineage);
    assertFinalization(attempt, material);
  };
  await observeConfirmedWithdrawalState(material.check.packet, target, [material.check.packet.boxes.reserveSuccessor,
    material.check.packet.boxes.duplicatePreventionSuccessor, material.check.packet.boxes.payout,
    material.check.packet.boxes.trackerDataInput], assertCurrent);
  await assertSameCanonicalConfirmation(attempt, target, material.lineage.genesisHeaderIdHex, confirmation, assertCurrent);
  assertCurrent();
  const confirmed = material.state.confirmErgoOperationalTransactionAttempt({ expectedTxId: attempt.expectedTxId,
    confirmationHeight: confirmation.confirmationHeight, confirmationHeaderId: confirmation.confirmationHeaderIdHex });
  const journal = snapshotAttempt(confirmed);
  assertConfirmedJournal(attempt, material, confirmation, journal);
  CONFIRMATIONS.set(attempt, Object.freeze({ attempt, check: material.check, target,
    originalConfirmation: value, normalizedConfirmation: confirmation, journal }));
  return confirmed;
}

/** Re-observe only the exact successors retained by a successful in-process confirmation. */
export async function reobserveSubstrateFederatedIsolatedDevnetConfirmedWithdrawalV2(
  attempt: Attempt, target: Readonly<Target>, expectedCheck: Readonly<Check>,
): Promise<Readonly<Check['packet']>> {
  const retained = requireConfirmed(attempt, target, expectedCheck);
  const material = requireAttempt(attempt, target);
  const assertCurrent = () => assertConfirmedJournal(attempt, material, retained.normalizedConfirmation, retained.journal);
  assertCurrent();
  await observeConfirmedWithdrawalState(retained.check.packet, target, [retained.check.packet.boxes.reserveSuccessor,
    retained.check.packet.boxes.duplicatePreventionSuccessor, retained.check.packet.boxes.trackerDataInput], assertCurrent);
  await assertSameCanonicalConfirmation(attempt, target, material.lineage.genesisHeaderIdHex,
    retained.normalizedConfirmation, assertCurrent);
  assertCurrent();
  return retained.check.packet;
}

async function requireSpent(boxId: string, origin: string): Promise<void> {
  try {
    await axios.get(`${origin}/utxo/byId/${boxId}`, { timeout: 30_000, maxRedirects: 0, proxy: false, maxContentLength: 1024 * 1024 });
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return;
    throw new Error('withdrawal V2 spent-input observation is unavailable');
  }
  throw new Error('withdrawal V2 predecessor remains unspent');
}

async function observeConfirmedWithdrawalState(
  packet: Readonly<Check['packet']>, target: Readonly<Target>,
  outputs: readonly Readonly<Check['packet']['boxes'][keyof Check['packet']['boxes']]>[], assertCurrent: () => void,
): Promise<void> {
  for (const origin of [target.primaryNodeOrigin, target.witnessNodeOrigin]) {
    for (const box of outputs) {
      assertCurrent();
      const observed = await ngetDirect(`/utxo/byId/${box.boxId}`, origin);
      assertCurrent();
      const current = await normalizeEip12Box(observed, 'confirmed withdrawal V2 output');
      assertCurrent();
      if (canonicalJson(current) !== canonicalJson(box)) throw new Error('confirmed withdrawal V2 output differs');
    }
    for (const input of packet.transaction.eip12Tx.inputs) {
      assertCurrent();
      await requireSpent(input.boxId, origin);
      assertCurrent();
    }
  }
}

async function assertSameCanonicalConfirmation(
  attempt: Attempt, target: Readonly<Target>, genesisHeaderIdHex: string,
  confirmation: Readonly<Confirmation>, assertCurrent: () => void,
): Promise<void> {
  assertCurrent();
  const refreshed = await createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(target,
    genesisHeaderIdHex).observe(attempt.expectedTxId, target.primaryNodeOrigin);
  assertCurrent();
  if (refreshed === null || refreshed.status !== 'confirmed'
    || refreshed.confirmationHeight !== confirmation.confirmationHeight
    || refreshed.confirmationHeaderIdHex !== confirmation.confirmationHeaderIdHex
    || refreshed.confirmations < confirmation.confirmations || refreshed.observedAtHeight < confirmation.observedAtHeight) {
    throw new Error('withdrawal V2 canonical payout changed after output observation');
  }
}

function assertLineage(check: Readonly<Check>, target: Readonly<Target>, lineage: Lineage): void {
  if (assertSubstrateFederatedIsolatedDevnetWithdrawalV2Check(check, target) !== lineage
    || target.primaryNodeOrigin !== 'http://127.0.0.1:9051' || target.witnessNodeOrigin !== 'http://127.0.0.1:9052'
    || target.primaryMining !== true || target.witnessReadOnly !== true) throw new Error('withdrawal V2 live lineage differs');
}

async function reobserve(check: Readonly<Check>, target: Readonly<Target>, lineage: Lineage): Promise<string> {
  assertLineage(check, target, lineage);
  const observations = [];
  for (const origin of [target.primaryNodeOrigin, target.witnessNodeOrigin]) {
    const boxes = [];
    for (const box of [check.packet.boxes.reservePredecessor, check.packet.boxes.duplicatePreventionPredecessor,
      check.packet.boxes.feeFundingInput, check.packet.boxes.trackerDataInput]) {
      const current = await normalizeEip12Box(await ngetDirect(`/utxo/byId/${box.boxId}`, origin), 'withdrawal V2 revalidated input');
      if (canonicalJson(current) !== canonicalJson(box)) throw new Error('withdrawal V2 revalidated input changed');
      boxes.push(current);
    }
    observations.push({ origin, boxes });
    assertLineage(check, target, lineage);
  }
  const observer = createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(target, lineage.genesisHeaderIdHex);
  const confirmations = [];
  for (const [index, expected] of lineage.predecessors.entries()) {
    const current = await observer.observe(expected.transactionIdHex, target.primaryNodeOrigin);
    if (current === null || current.status !== 'confirmed' || current.confirmationHeight !== expected.confirmationHeight
      || current.confirmationHeaderIdHex !== expected.confirmationHeaderIdHex
      || current.confirmations < expected.confirmations || current.observedAtHeight < expected.observedAtHeight) {
      throw new Error(`withdrawal V2 canonical predecessor ${index} changed`);
    }
    confirmations.push(current.observationDigestHex);
  }
  assertLineage(check, target, lineage);
  return sha256CanonicalJson({ checkDigestHex: lineage.checkDigestHex, observations, confirmations }, 'E2S_ISOLATED_WITHDRAWAL_V2_REVALIDATION');
}

function requireAttempt(attempt: Attempt, target?: Readonly<Target>): DurableMaterial {
  const material = ATTEMPTS.get(attempt);
  if (material === undefined || (target !== undefined && material.target !== target)
    || attempt.expectedTxId !== material.stored.expectedTxId || attempt.durableAttemptDigestHex !== material.stored.durableAttemptDigestHex) {
    throw new Error('withdrawal V2 attempt lacks exact process provenance');
  }
  assertLineage(material.check, material.target, material.lineage);
  return material;
}

function requireConfirmed(attempt: Attempt, target: Readonly<Target>, expectedCheck: Readonly<Check>): ConfirmedMaterial {
  const material = requireAttempt(attempt, target);
  const retained = CONFIRMATIONS.get(attempt);
  if (retained === undefined || retained.attempt !== attempt || retained.check !== expectedCheck
    || retained.check !== material.check || retained.target !== target) {
    throw new Error('withdrawal V2 confirmation lacks exact in-process provenance');
  }
  assertConfirmedJournal(attempt, material, retained.normalizedConfirmation, retained.journal);
  return retained;
}

function assertStored(material: DurableMaterial, phase: 'pending' | 'submitted'): ErgoOperationalTransactionAttempt {
  const row = material.state.getErgoOperationalTransactionAttempt(material.stored.expectedTxId);
  if (row === null || row.operationProfile !== PROFILE
    || canonicalJson(Object.fromEntries(Object.keys(material.expectedReservation).map(key => [key, row[key as keyof ErgoOperationalTransactionAttempt]])))
      !== canonicalJson(material.expectedReservation)
    || (phase === 'pending' ? row.status !== 'pending' : !['accepted', 'ambiguous'].includes(row.status))) {
    throw new Error('withdrawal V2 durable journal binding or state differs');
  }
  return row;
}

function assertFinalization(attempt: Attempt, material: DurableMaterial): void {
  const row = assertStored(material, 'submitted');
  const expected = FINALIZATIONS.get(attempt);
  if (expected === undefined || row.status !== expected.status || row.submissionDisposition !== expected.status
    || row.submittedTxId !== expected.submittedTxId || row.responseDigestHex !== expected.responseDigestHex) {
    throw new Error('withdrawal V2 journal differs from retained transport result');
  }
}

function snapshotAttempt(value: ErgoOperationalTransactionAttempt): Readonly<ErgoOperationalTransactionAttempt> {
  return Object.freeze({ ...value, inputBoxIds: Object.freeze([...value.inputBoxIds]) });
}

function assertConfirmedJournal(
  attempt: Attempt, material: DurableMaterial, confirmation: Readonly<Confirmation>,
  retainedJournal: Readonly<ErgoOperationalTransactionAttempt>,
): void {
  assertLineage(material.check, material.target, material.lineage);
  const row = material.state.getErgoOperationalTransactionAttempt(material.stored.expectedTxId);
  const submission = FINALIZATIONS.get(attempt);
  if (row === null || submission === undefined || row.status !== 'confirmed'
    || row.operationProfile !== PROFILE
    || canonicalJson(Object.fromEntries(Object.keys(material.expectedReservation)
      .map(key => [key, row[key as keyof ErgoOperationalTransactionAttempt]]))) !== canonicalJson(material.expectedReservation)
    || row.submissionDisposition !== submission.status || row.submittedTxId !== submission.submittedTxId
    || row.responseDigestHex !== submission.responseDigestHex || row.confirmationHeight !== confirmation.confirmationHeight
    || row.confirmationHeaderId !== confirmation.confirmationHeaderIdHex
    || canonicalJson(row) !== canonicalJson(retainedJournal)) {
    throw new Error('withdrawal V2 confirmed journal differs from retained reservation, transport or confirmation');
  }
}
