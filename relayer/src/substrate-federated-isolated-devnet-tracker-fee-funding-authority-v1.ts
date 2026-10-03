import { checkSignedTransaction, assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding } from './fleet-signer.js';
import { ngetDirect } from './ergo-helpers.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import { normalizeEip12Box } from './unsigned-ergo-transaction.js';
import {
  admitErgoOperationalTransaction,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_TRACKER_FEE_FUNDING_OPERATION_PROFILE as PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_WITHDRAWAL_FEE_FUNDING_OPERATION_PROFILE as WITHDRAWAL_PROFILE,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import { StateTracker, type ErgoOperationalTransactionAttempt } from './state-tracker.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1,
  type SubstrateFederatedIsolatedDevnetExecutionErgoTargetV1 as Target,
  type SubstrateFederatedIsolatedDevnetOwnedExecutionTargetBindingV1 as Binding,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import {
  claimSubstrateFederatedIsolatedDevnetTrackerFeeFundingCheckV1,
  claimSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingCheckV1,
  type SubstrateFederatedIsolatedDevnetTrackerFeeFundingCheckV1 as Check,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import {
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1,
  createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1,
} from './substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
import { normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1,
  type SubstrateFederatedLocalDevnetGenesisConfirmation as Confirmation } from './relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';

export interface SubstrateFederatedIsolatedDevnetTrackerFeeFundingAuthorizationV1 {
  readonly authorizationDigestHex: string;
  readonly genesisHeaderIdHex: string;
}
export interface SubstrateFederatedIsolatedDevnetTrackerFeeFundingAttemptV1 {
  readonly expectedTxId: string;
  readonly durableAttemptDigestHex: string;
}
export type SubstrateFederatedIsolatedDevnetWithdrawalFeeFundingAuthorizationV1 =
  SubstrateFederatedIsolatedDevnetTrackerFeeFundingAuthorizationV1;
export type SubstrateFederatedIsolatedDevnetWithdrawalFeeFundingAttemptV1 =
  SubstrateFederatedIsolatedDevnetTrackerFeeFundingAttemptV1;
type Authorization = Readonly<SubstrateFederatedIsolatedDevnetTrackerFeeFundingAuthorizationV1>;
type Attempt = Readonly<SubstrateFederatedIsolatedDevnetTrackerFeeFundingAttemptV1>;
export type SubstrateFederatedIsolatedDevnetTrackerFeeFundingJournalV1 = StateTracker;
interface Material {
  readonly purpose: 'tracker' | 'withdrawal';
  readonly check: Readonly<Check>;
  readonly target: Readonly<Target>;
  readonly binding: Readonly<Binding>;
  readonly genesisHeaderIdHex: string;
  readonly authorization: Authorization;
  readonly assertCustody: () => void;
}
interface DurableMaterial extends Material {
  readonly state: StateTracker;
  readonly stored: ErgoOperationalTransactionAttempt;
  readonly expectedReservation: Readonly<Record<string, unknown>>;
}
const AUTHORIZATIONS = new WeakMap<object, Material>();
const RESERVED = new WeakSet<object>();
const ATTEMPTS = new WeakMap<object, DurableMaterial>();
const TRANSPORT_STARTED = new WeakSet<object>();
const FUNDING_PROFILES = Object.freeze({
  tracker: Object.freeze({ profile: PROFILE,
    authorizationDomain: 'E2S_ISOLATED_TRACKER_FEE_FUNDING_AUTHORIZATION_V1',
    sourceDomain: 'E2S_ISOLATED_TRACKER_FEE_FUNDING_SOURCE_V1' }),
  withdrawal: Object.freeze({ profile: WITHDRAWAL_PROFILE,
    authorizationDomain: 'E2S_ISOLATED_WITHDRAWAL_FEE_FUNDING_AUTHORIZATION_V1',
    sourceDomain: 'E2S_ISOLATED_WITHDRAWAL_FEE_FUNDING_SOURCE_V1' }),
});

/** Explicit isolated-target authorization from the retained native or LAB setup. */
export async function authorizeSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1(
  check: Readonly<Check>, target: Readonly<Target>,
): Promise<Authorization> {
  return authorizeFeeFunding(check, target, 'tracker');
}

export async function authorizeSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1(
  check: Readonly<Check>, target: Readonly<Target>,
): Promise<Authorization> {
  return authorizeFeeFunding(check, target, 'withdrawal');
}

async function authorizeFeeFunding(
  check: Readonly<Check>, target: Readonly<Target>, purpose: Material['purpose'],
): Promise<Authorization> {
  const { batch, binding, assertActive: assertCustody } = purpose === 'tracker'
    ? claimSubstrateFederatedIsolatedDevnetTrackerFeeFundingCheckV1(check, target)
    : claimSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingCheckV1(check, target);
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding(check.checkedAcceptance.submissionHandle, binding);
  await reobserveSource(check, target, binding, assertCustody);
  assertCustody();
  const authorization = Object.freeze({ genesisHeaderIdHex: batch.request.target.genesisHeaderIdHex, authorizationDigestHex: sha256CanonicalJson({
    processBindingDigestHex: binding.processBindingDigestHex,
    executionTargetIdentityDigestHex: binding.executionTargetIdentityDigestHex,
    requestDigestHex: batch.request.requestDigestHex,
    expectedTxId: check.transaction.txId,
    signedTransactionBytesSha256Hex: check.signedCandidate.signedTransactionBytesSha256Hex,
    checkResponseDigestHex: check.checkedAcceptance.submissionHandle.checkResponseDigestHex,
  }, FUNDING_PROFILES[purpose].authorizationDomain) });
  AUTHORIZATIONS.set(authorization, Object.freeze({
    purpose, check, target, binding, authorization, assertCustody,
    genesisHeaderIdHex: batch.request.target.genesisHeaderIdHex,
  }));
  return authorization;
}

export function reserveSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1(
  authorization: Authorization, state: StateTracker,
): Attempt {
  return reserveFeeFunding(authorization, state, 'tracker');
}

export function reserveSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1(
  authorization: Authorization, state: StateTracker,
): Attempt {
  return reserveFeeFunding(authorization, state, 'withdrawal');
}

function reserveFeeFunding(
  authorization: Authorization, state: StateTracker, purpose: Material['purpose'],
): Attempt {
  const material = AUTHORIZATIONS.get(authorization);
  if (material === undefined || material.purpose !== purpose || RESERVED.has(authorization) || !(state instanceof StateTracker)) {
    throw new Error('tracker fee funding authorization is absent, consumed or has no journal');
  }
  RESERVED.add(authorization);
  material.assertCustody();
  assertBinding(material.target, material.binding);
  const { check, binding } = material;
  const source = check.transaction.eip12Tx.inputs[0]!;
  const admission = admitErgoOperationalTransaction({
    operationProfile: FUNDING_PROFILES[purpose].profile, expectedTxId: check.transaction.txId,
    sourceBoxId: source.boxId, inputBoxIds: [source.boxId],
    attemptedAtHeight: check.transaction.eip12Tx.outputs[0]!.creationHeight - 1,
    unsignedTransaction: check.transaction.eip12Tx,
  });
  const { unsignedTransaction: _unsigned, ...admissionFields } = admission;
  const reservation = Object.freeze({
    ...admissionFields,
    reconciliationIdentityDigestHex: binding.executionTargetIdentityDigestHex,
    signedTransactionDigestHex: check.signedCandidate.signedTransactionDigestHex,
    checkResponseDigestHex: check.checkedAcceptance.submissionHandle.checkResponseDigestHex,
    revalidationDigestHex: sha256CanonicalJson(source, FUNDING_PROFILES[purpose].sourceDomain),
    authorizationDigestHex: authorization.authorizationDigestHex,
  });
  const expectedReservation = Object.freeze({ ...reservation, fundsReleaseAuthorityEpochHex: null,
    durableAttemptDigestHex: sha256CanonicalJson({ domain: 'E2S_ERGO_OPERATIONAL_DURABLE_ATTEMPT_V1',
      ...reservation, fundsReleaseAuthorityEpochHex: null }) });
  const returned = state.reserveErgoOperationalTransactionAttempt(reservation);
  const stored = Object.freeze({ ...returned, inputBoxIds: Object.freeze([...returned.inputBoxIds]) });
  const attempt = Object.freeze({ expectedTxId: stored.expectedTxId, durableAttemptDigestHex: stored.durableAttemptDigestHex });
  const durable = Object.freeze({ ...material, state, stored, expectedReservation });
  assertStored(durable, 'pending');
  ATTEMPTS.set(attempt, durable);
  return attempt;
}

/** Called only by the fixed transport; the source and same signed bytes are checked last. */
export async function claimSubstrateFederatedIsolatedDevnetTrackerFeeFundingTransportV1(
  attempt: Attempt, target: Readonly<Target>,
) {
  return claimFeeFundingTransport(attempt, target, 'tracker');
}

export async function claimSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingTransportV1(
  attempt: Attempt, target: Readonly<Target>,
) {
  return claimFeeFundingTransport(attempt, target, 'withdrawal');
}

async function claimFeeFundingTransport(attempt: Attempt, target: Readonly<Target>, purpose: Material['purpose']) {
  const material = requireAttempt(attempt, purpose);
  if (material.target !== target || TRANSPORT_STARTED.has(attempt)) {
    throw new Error('tracker fee funding transport target differs or attempt is consumed');
  }
  TRANSPORT_STARTED.add(attempt);
  material.assertCustody();
  assertStored(material, 'pending');
  await reobserveSource(material.check, target, material.binding, material.assertCustody);
  const currentCheck = await checkSignedTransaction(material.check.signedCandidate, 'isolated tracker fee pretransport', target.primaryNodeOrigin,
    () => { material.assertCustody(); assertBinding(target, material.binding); });
  if (currentCheck === null) throw new Error('tracker fee funding pretransport node check failed');
  await reobserveSource(material.check, target, material.binding, material.assertCustody);
  assertStored(material, 'pending');
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding(material.check.checkedAcceptance.submissionHandle, material.binding);
  material.assertCustody();
  return Object.freeze({ check: material.check, binding: material.binding, authorization: material.authorization });
}

export function requireSubstrateFederatedIsolatedDevnetTrackerFeeFundingFinalizationV1(
  attempt: Attempt,
) {
  return requireFeeFundingFinalization(attempt, 'tracker');
}

export function requireSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingFinalizationV1(
  attempt: Attempt,
) {
  return requireFeeFundingFinalization(attempt, 'withdrawal');
}

function requireFeeFundingFinalization(attempt: Attempt, purpose: Material['purpose']) {
  const material = requireAttempt(attempt, purpose);
  if (!TRANSPORT_STARTED.has(attempt)) throw new Error('tracker fee funding transport has not started');
  assertStored(material, 'pending');
  return material.state;
}

export async function confirmSubstrateFederatedIsolatedDevnetTrackerFeeFundingV1(
  attempt: Attempt, confirmationValue: Confirmation,
) {
  return confirmFeeFunding(attempt, confirmationValue, 'tracker');
}

export async function confirmSubstrateFederatedIsolatedDevnetWithdrawalFeeFundingV1(
  attempt: Attempt, confirmationValue: Confirmation,
) {
  return confirmFeeFunding(attempt, confirmationValue, 'withdrawal');
}

async function confirmFeeFunding(attempt: Attempt, confirmationValue: Confirmation, purpose: Material['purpose']) {
  const confirmation = normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1(confirmationValue);
  const material = requireAttempt(attempt, purpose);
  assertStored(material, 'submitted');
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
    confirmation.observerArtifact, material.binding.executionTargetIdentityDigestHex,
    material.genesisHeaderIdHex, attempt.expectedTxId, confirmation,
  );
  if (confirmation.status !== 'confirmed' || confirmation.confirmationHeight === null
    || confirmation.confirmationHeaderIdHex === null) {
    throw new Error('tracker fee funding requires canonical confirmation');
  }
  const feeBox = material.check.transaction.outputs[0]!;
  for (const origin of [material.target.primaryNodeOrigin, material.target.witnessNodeOrigin]) {
    const current = await normalizeEip12Box(await ngetDirect(`/utxo/byId/${feeBox.boxId}`, origin), 'confirmed tracker fee box');
    if (canonicalJson(current) !== canonicalJson(feeBox)) throw new Error('confirmed tracker fee box differs');
  }
  // Re-inclusion preserves box bytes; authenticate current inclusion after the UTXO reads.
  const currentConfirmation = await createSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
    material.target, material.genesisHeaderIdHex,
  ).observe(attempt.expectedTxId, material.target.primaryNodeOrigin);
  if (currentConfirmation === null || currentConfirmation.status !== 'confirmed'
    || currentConfirmation.confirmationHeight !== confirmation.confirmationHeight
    || currentConfirmation.confirmationHeaderIdHex !== confirmation.confirmationHeaderIdHex
    || currentConfirmation.observedAtHeight < confirmation.observedAtHeight
    || currentConfirmation.confirmations < confirmation.confirmations) {
    throw new Error('fee funding canonical confirmation changed before persistence');
  }
  assertBinding(material.target, material.binding);
  assertStored(material, 'submitted');
  return material.state.confirmErgoOperationalTransactionAttempt({
    expectedTxId: attempt.expectedTxId, confirmationHeight: confirmation.confirmationHeight,
    confirmationHeaderId: confirmation.confirmationHeaderIdHex,
  });
}

function requireAttempt(attempt: Attempt, purpose: Material['purpose']): DurableMaterial {
  const material = ATTEMPTS.get(attempt);
  if (material === undefined || material.purpose !== purpose || attempt.expectedTxId !== material.stored.expectedTxId
    || attempt.durableAttemptDigestHex !== material.stored.durableAttemptDigestHex) {
    throw new Error('tracker fee funding durable attempt lacks exact provenance');
  }
  assertBinding(material.target, material.binding);
  return material;
}

function assertStored(material: DurableMaterial, phase: 'pending' | 'submitted'): void {
  const current = material.state.getErgoOperationalTransactionAttempt(material.stored.expectedTxId);
  const { check, stored, binding } = material;
  if (current === null || current.operationProfile !== FUNDING_PROFILES[material.purpose].profile
    || canonicalJson(Object.fromEntries(Object.keys(material.expectedReservation)
      .map(key => [key, current[key as keyof ErgoOperationalTransactionAttempt]])))
      !== canonicalJson(material.expectedReservation)
    || current.expectedTxId !== check.transaction.txId
    || current.sourceBoxId !== check.transaction.eip12Tx.inputs[0]!.boxId
    || canonicalJson(current.inputBoxIds) !== canonicalJson([current.sourceBoxId])
    || current.reconciliationIdentityDigestHex !== binding.executionTargetIdentityDigestHex
    || current.durableAttemptDigestHex !== stored.durableAttemptDigestHex
    || current.authorizationDigestHex !== material.authorization.authorizationDigestHex
    || current.signedTransactionDigestHex !== check.signedCandidate.signedTransactionDigestHex
    || current.checkResponseDigestHex !== check.checkedAcceptance.submissionHandle.checkResponseDigestHex
    || (phase === 'pending' ? current.status !== 'pending' : !['accepted', 'ambiguous'].includes(current.status))) {
    throw new Error('tracker fee funding durable journal binding or state differs');
  }
}

function assertBinding(target: Readonly<Target>, binding: Readonly<Binding>): void {
  const current = assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1(target);
  if (target.primaryNodeOrigin !== 'http://127.0.0.1:9051'
    || target.witnessNodeOrigin !== 'http://127.0.0.1:9052'
    || target.primaryMining !== true || target.witnessReadOnly !== true
    || current.processBindingDigestHex !== binding.processBindingDigestHex
    || current.executionTargetIdentityDigestHex !== binding.executionTargetIdentityDigestHex) {
    throw new Error('tracker fee funding owned process binding differs');
  }
}

async function reobserveSource(check: Readonly<Check>, target: Readonly<Target>, binding: Readonly<Binding>, assertCustody: () => void) {
  assertCustody();
  assertBinding(target, binding);
  const { extension: _extension, ...source } = check.transaction.eip12Tx.inputs[0]!;
  for (const origin of [target.primaryNodeOrigin, target.witnessNodeOrigin]) {
    const current = await normalizeEip12Box(await ngetDirect(`/utxo/byId/${source.boxId}`, origin), 'tracker fee pretransport source');
    if (canonicalJson(current) !== canonicalJson(source)) throw new Error('tracker fee funding pretransport source differs');
    assertCustody();
  }
  assertBinding(target, binding);
}
