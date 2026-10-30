import { assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding } from './fleet-signer.js';
import { ngetDirect } from './ergo-helpers.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import { materializeUnsignedTransaction, normalizeEip12Box } from './unsigned-ergo-transaction.js';
import {
  admitErgoOperationalTransaction,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_TRACKER_ADMISSION_V2_OPERATION_PROFILE as PROFILE,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import { StateTracker, type ErgoOperationalTransactionAttempt } from './state-tracker.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2,
  assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2,
  assertSubstrateFederatedIsolatedDevnetTrackerConfirmationLineageV2,
  type SubstrateFederatedIsolatedDevnetCheckpointBoundExecutionTargetV2 as FrozenTarget,
  type SubstrateFederatedIsolatedDevnetTrackerReservationFreshnessTargetV1 as FreshnessTarget,
  type SubstrateFederatedIsolatedDevnetTrackerTransportTargetV2 as TransportTarget,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1 as ConfirmationTarget,
  type SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1 as Binding,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  claimSubstrateFederatedIsolatedDevnetTrackerV2Check,
  revalidateSubstrateFederatedIsolatedDevnetTrackerV2Reservation,
  checkSubstrateFederatedIsolatedDevnetTrackerV2Transport,
  type SubstrateFederatedIsolatedDevnetTrackerV2Check as Check,
  type SubstrateFederatedIsolatedDevnetTrackerV2Freshness as Freshness,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import { assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1,
  reobserveSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1 }
  from './substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
import { normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1,
  type SubstrateFederatedLocalDevnetGenesisConfirmation as Confirmation }
  from './relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';

export interface SubstrateFederatedIsolatedDevnetTrackerV2Authorization {
  readonly authorizationDigestHex: string;
  readonly genesisHeaderIdHex: string;
}
export interface SubstrateFederatedIsolatedDevnetTrackerV2Attempt {
  readonly expectedTxId: string;
  readonly durableAttemptDigestHex: string;
}
type Authorization = Readonly<SubstrateFederatedIsolatedDevnetTrackerV2Authorization>;
type Attempt = Readonly<SubstrateFederatedIsolatedDevnetTrackerV2Attempt>;
interface Material {
  readonly assertCustody?: () => void;
  readonly check: Readonly<Check>;
  readonly target: Readonly<FrozenTarget>;
  readonly binding: Readonly<Binding>;
  readonly revalidationDigestHex: string;
  readonly authorization: Authorization;
}
interface DurableMaterial extends Material {
  readonly state: StateTracker;
  readonly expectedReservation: Readonly<Record<string, unknown>>;
  readonly stored: ErgoOperationalTransactionAttempt;
}
type TransportCheck = Awaited<ReturnType<typeof checkSubstrateFederatedIsolatedDevnetTrackerV2Transport>>;
const AUTHORIZATIONS = new WeakMap<object, Material>();
const RESERVED = new WeakSet<object>();
const ATTEMPTS = new WeakMap<object, DurableMaterial>();
const FRESHNESS_STARTED = new WeakSet<object>();
const FRESHNESS = new WeakMap<object, Readonly<Freshness>>();
const TRANSPORT_STARTED = new WeakSet<object>();
const TRANSPORT = new WeakMap<object, Readonly<{ target: Readonly<TransportTarget>; checked: TransportCheck }>>();
const FINALIZATION_STARTED = new WeakSet<object>();
const FINALIZATIONS = new WeakMap<object, Readonly<{
  status: 'accepted' | 'ambiguous';
  submissionDisposition: 'accepted' | 'ambiguous';
  submittedTxId: string | null;
  responseDigestHex: string | null;
}>>();

/** Explicit isolated-devnet broadcast authorization, never supplied by the journal. */
export async function authorizeSubstrateFederatedIsolatedDevnetTrackerV2Admission(
  check: Readonly<Check>, target: Readonly<FrozenTarget>,
): Promise<Authorization> {
  const claimed = await claimSubstrateFederatedIsolatedDevnetTrackerV2Check(check, target);
  claimed.assertCustody?.();
  const authorization = Object.freeze({ genesisHeaderIdHex: claimed.genesisHeaderIdHex,
    authorizationDigestHex: sha256CanonicalJson({
      checkDigestHex: check.result.checkDigestHex,
      setupRequestDigestHex: check.setupRequestDigestHex,
      feeFundingTransactionIdHex: check.feeFundingTransactionIdHex,
      genesisHeaderIdHex: claimed.genesisHeaderIdHex,
      targetBinding: claimed.binding,
      revalidationDigestHex: claimed.revalidationDigestHex,
      expectedTxId: check.result.transaction.unsignedTransactionIdHex,
      signedTransactionBytesSha256Hex: check.result.signedCandidate.signedTransactionBytesSha256Hex,
    }, 'E2S_ISOLATED_TRACKER_V2_ADMISSION_AUTHORIZATION') });
  AUTHORIZATIONS.set(authorization, Object.freeze({ check, target, binding: claimed.binding,
    assertCustody: claimed.assertCustody,
    revalidationDigestHex: claimed.revalidationDigestHex, authorization }));
  return authorization;
}

export function reserveSubstrateFederatedIsolatedDevnetTrackerV2Admission(
  authorization: Authorization, state: StateTracker,
): Attempt {
  const material = AUTHORIZATIONS.get(authorization);
  if (material === undefined || RESERVED.has(authorization) || !(state instanceof StateTracker)) {
    throw new Error('tracker V2 authorization is absent, consumed or has no journal');
  }
  RESERVED.add(authorization);
  material.assertCustody?.();
  const current = assertSubstrateFederatedIsolatedDevnetOwnedCheckpointBoundExecutionTargetV2(material.target);
  if (canonicalJson(current) !== canonicalJson(material.binding)) throw new Error('tracker V2 reservation target changed');
  const { check } = material;
  const transaction = check.result.transaction;
  const admission = admitErgoOperationalTransaction({
    operationProfile: PROFILE, expectedTxId: transaction.unsignedTransactionIdHex,
    sourceBoxId: transaction.inputBoxes[0].boxId,
    inputBoxIds: transaction.inputBoxes.map(box => box.boxId),
    attemptedAtHeight: check.result.observedHeaderContext.currentHeight - 1,
    unsignedTransaction: transaction.eip12UnsignedTransaction,
  });
  const { unsignedTransaction: _unsigned, ...admissionFields } = admission;
  const reservation = Object.freeze({ ...admissionFields,
    reconciliationIdentityDigestHex: material.binding.executionTargetIdentityDigestHex,
    signedTransactionDigestHex: check.result.signedCandidate.signedTransactionDigestHex,
    checkResponseDigestHex: check.result.checkDigestHex,
    revalidationDigestHex: material.revalidationDigestHex,
    authorizationDigestHex: authorization.authorizationDigestHex,
  });
  const expectedReservation = Object.freeze({ ...reservation, fundsReleaseAuthorityEpochHex: null,
    durableAttemptDigestHex: sha256CanonicalJson({ domain: 'E2S_ERGO_OPERATIONAL_DURABLE_ATTEMPT_V1',
      ...reservation, fundsReleaseAuthorityEpochHex: null }) });
  const returned = state.reserveErgoOperationalTransactionAttempt(reservation);
  const stored = Object.freeze({ ...returned, inputBoxIds: Object.freeze([...returned.inputBoxIds]) });
  const durable = Object.freeze({ ...material, state, stored, expectedReservation });
  assertStored(durable, 'pending');
  const attempt = Object.freeze({ expectedTxId: stored.expectedTxId, durableAttemptDigestHex: stored.durableAttemptDigestHex });
  ATTEMPTS.set(attempt, durable);
  return attempt;
}

export async function revalidateSubstrateFederatedIsolatedDevnetTrackerV2Admission(
  attempt: Attempt, target: Readonly<FreshnessTarget>,
) {
  const material = requireAttempt(attempt);
  if (FRESHNESS_STARTED.has(attempt)) throw new Error('tracker V2 reservation freshness is already consumed');
  FRESHNESS_STARTED.add(attempt);
  material.assertCustody?.();
  assertStored(material, 'pending');
  const freshness = await revalidateSubstrateFederatedIsolatedDevnetTrackerV2Reservation(material.check, target);
  material.assertCustody?.();
  assertStored(material, 'pending');
  FRESHNESS.set(attempt, freshness);
  return freshness.completion;
}

/** Only the fixed submitter consumes this result, after another exact-byte node check. */
export async function claimSubstrateFederatedIsolatedDevnetTrackerV2Transport(
  attempt: Attempt, target: Readonly<TransportTarget>,
) {
  const material = requireAttempt(attempt);
  const freshness = FRESHNESS.get(attempt);
  if (freshness === undefined || TRANSPORT_STARTED.has(attempt)) {
    throw new Error('tracker V2 transport has no exact freshness or is already consumed');
  }
  TRANSPORT_STARTED.add(attempt);
  material.assertCustody?.();
  assertStored(material, 'pending');
  const checked = await checkSubstrateFederatedIsolatedDevnetTrackerV2Transport(material.check, freshness, target);
  material.assertCustody?.();
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding(checked.checkedAcceptance.submissionHandle, {
    processBindingDigestHex: checked.binding.processBindingDigestHex,
    executionTargetIdentityDigestHex: checked.binding.executionTargetIdentityDigestHex,
  });
  TRANSPORT.set(attempt, Object.freeze({ target, checked }));
  assertSubstrateFederatedIsolatedDevnetTrackerV2TransportReady(attempt, target);
  return Object.freeze({ check: material.check, binding: checked.binding,
    checkedAcceptance: checked.checkedAcceptance, authorization: material.authorization });
}

export function assertSubstrateFederatedIsolatedDevnetTrackerV2TransportReady(
  attempt: Attempt, target: Readonly<TransportTarget>,
): void {
  const material = requireAttempt(attempt);
  material.assertCustody?.();
  const transport = TRANSPORT.get(attempt);
  if (transport === undefined || transport.target !== target) throw new Error('tracker V2 transport target changed');
  const current = assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2(target);
  if (canonicalJson(current) !== canonicalJson(transport.checked.binding)) throw new Error('tracker V2 transport process binding changed');
  assertStored(material, 'pending');
}

/** The fixed transport validates result provenance before invoking this owner. */
export function finalizeSubstrateFederatedIsolatedDevnetTrackerV2TransportJournal(
  attempt: Attempt,
  submission: Readonly<{ status: 'accepted' | 'ambiguous'; submittedTxId: string | null; responseDigestHex: string | null }>,
) {
  const material = requireAttempt(attempt);
  const transport = TRANSPORT.get(attempt);
  if (transport === undefined || FINALIZATION_STARTED.has(attempt)) throw new Error('tracker V2 transport has not started or finalization is consumed');
  FINALIZATION_STARTED.add(attempt);
  const current = assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2(transport.target);
  if (canonicalJson(current) !== canonicalJson(transport.checked.binding)) throw new Error('tracker V2 finalization target changed');
  assertStored(material, 'pending');
  const expected = Object.freeze({ status: submission.status, submissionDisposition: submission.status,
    submittedTxId: submission.submittedTxId, responseDigestHex: submission.responseDigestHex });
  const finalized = material.state.finalizeErgoOperationalTransactionAttempt({
    expectedTxId: attempt.expectedTxId, durableAttemptDigestHex: attempt.durableAttemptDigestHex,
    disposition: expected.status, submittedTxId: expected.submittedTxId, responseDigestHex: expected.responseDigestHex,
  });
  FINALIZATIONS.set(attempt, expected);
  assertFinalization(attempt, material);
  return finalized;
}

export async function confirmSubstrateFederatedIsolatedDevnetTrackerV2Admission(
  attempt: Attempt, target: Readonly<ConfirmationTarget>, confirmationValue: Confirmation,
) {
  const material = requireAttempt(attempt);
  const transport = TRANSPORT.get(attempt);
  if (transport === undefined) throw new Error('tracker V2 confirmation lacks transport provenance');
  const confirmation = normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1(confirmationValue);
  const binding = assertSubstrateFederatedIsolatedDevnetTrackerConfirmationLineageV2(target, transport.checked.binding, attempt.expectedTxId);
  const assertConfirmation = () => {
    const current = assertSubstrateFederatedIsolatedDevnetTrackerConfirmationLineageV2(target, transport.checked.binding, attempt.expectedTxId);
    if (canonicalJson(current) !== canonicalJson(binding)) throw new Error('tracker V2 confirmation binding changed');
    assertFinalization(attempt, material);
    assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(confirmation.observerArtifact,
      binding.executionTargetIdentityDigestHex, material.authorization.genesisHeaderIdHex, attempt.expectedTxId, confirmation);
  };
  assertConfirmation();
  if (confirmation.status !== 'confirmed' || confirmation.confirmationHeight === null
    || confirmation.confirmationHeaderIdHex === null) throw new Error('tracker V2 admission requires canonical confirmation');
  const body = material.check.result.transaction.eip12UnsignedTransaction;
  const transaction = await materializeUnsignedTransaction({
    inputs: [...body.inputs], dataInputs: [], outputs: [...body.outputs],
  }, 'confirmed tracker V2 transaction');
  const successor = transaction.outputs[0]!;
  for (const origin of [target.primaryNodeOrigin, target.witnessNodeOrigin]) {
    const current = await normalizeEip12Box(await ngetDirect(`/utxo/byId/${successor.boxId}`, origin), 'confirmed tracker V2 successor');
    if (canonicalJson(current) !== canonicalJson(successor)) throw new Error('confirmed tracker V2 successor differs');
  }
  const refreshed = await reobserveSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1({
    artifact: confirmation.observerArtifact,
    expectedReconciliationIdentityDigestHex: binding.executionTargetIdentityDigestHex,
    expectedTargetGenesisHeaderIdHex: material.authorization.genesisHeaderIdHex,
    expectedTxId: attempt.expectedTxId, priorConfirmation: confirmation,
  });
  if (refreshed.status !== 'confirmed' || refreshed.confirmationHeight !== confirmation.confirmationHeight
    || refreshed.confirmationHeaderIdHex !== confirmation.confirmationHeaderIdHex) {
    throw new Error('tracker V2 canonical confirmation changed after successor observation');
  }
  assertConfirmation();
  return material.state.confirmErgoOperationalTransactionAttempt({
    expectedTxId: attempt.expectedTxId, confirmationHeight: confirmation.confirmationHeight,
    confirmationHeaderId: confirmation.confirmationHeaderIdHex,
  });
}

function assertFinalization(attempt: Attempt, material: DurableMaterial): void {
  const current = assertStored(material, 'submitted');
  const expected = FINALIZATIONS.get(attempt);
  if (expected === undefined || current.status !== expected.status
    || current.submissionDisposition !== expected.submissionDisposition || current.submittedTxId !== expected.submittedTxId
    || current.responseDigestHex !== expected.responseDigestHex) {
    throw new Error('tracker V2 journal differs from the retained transport finalization');
  }
}

function requireAttempt(attempt: Attempt): DurableMaterial {
  const material = ATTEMPTS.get(attempt);
  if (material === undefined || attempt.expectedTxId !== material.stored.expectedTxId
    || attempt.durableAttemptDigestHex !== material.stored.durableAttemptDigestHex) {
    throw new Error('tracker V2 durable attempt lacks exact process provenance');
  }
  return material;
}

function assertStored(material: DurableMaterial, phase: 'pending' | 'submitted'): ErgoOperationalTransactionAttempt {
  const current = material.state.getErgoOperationalTransactionAttempt(material.stored.expectedTxId);
  if (current === null || current.operationProfile !== PROFILE
    || canonicalJson(Object.fromEntries(Object.keys(material.expectedReservation)
      .map(key => [key, current[key as keyof ErgoOperationalTransactionAttempt]]))) !== canonicalJson(material.expectedReservation)
    || (phase === 'pending' ? current.status !== 'pending' : !['accepted', 'ambiguous'].includes(current.status))) {
    throw new Error('tracker V2 durable journal binding or state differs');
  }
  return current;
}
