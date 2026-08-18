import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
  type ErgoOperationalBroadcastAuthorization,
  type ErgoOperationalTransactionExecutionPorts,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
  normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1,
  type SubstrateFederatedLocalDevnetGenesisConfirmation,
} from './relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';
import type {
  ErgoOperationalTransactionAttempt,
  StateTracker,
} from './state-tracker.js';
import {
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1,
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1,
  type SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1,
} from './substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizationArtifactV1,
  type SubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1,
} from './substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.js';

export const SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_JOURNAL_V1_SCHEMA =
  'e2s.substrate-federated-local-devnet-peg-in-source-lock-journal.v1' as const;

type JournalPort = ErgoOperationalTransactionExecutionPorts['journal'];
type Observer = SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1;

export interface SubstrateFederatedLocalDevnetPegInSourceLockJournalStateV1 {
  reserveErgoOperationalTransactionAttempt:
    StateTracker['reserveErgoOperationalTransactionAttempt'];
  getErgoOperationalTransactionAttempts:
    StateTracker['getErgoOperationalTransactionAttempts'];
  getActiveErgoOperationalTransactionAttempts:
    StateTracker['getActiveErgoOperationalTransactionAttempts'];
  getConfirmedErgoOperationalTransactionAttempts:
    StateTracker['getConfirmedErgoOperationalTransactionAttempts'];
  finalizeErgoOperationalTransactionAttempt:
    StateTracker['finalizeErgoOperationalTransactionAttempt'];
  confirmErgoOperationalTransactionAttempt:
    StateTracker['confirmErgoOperationalTransactionAttempt'];
  rebindConfirmedErgoOperationalTransactionAttempt:
    StateTracker['rebindConfirmedErgoOperationalTransactionAttempt'];
  quarantineErgoOperationalTransactionAttempt:
    StateTracker['quarantineErgoOperationalTransactionAttempt'];
}

export interface SubstrateFederatedLocalDevnetPegInSourceLockJournalV1 {
  readonly journal: Readonly<JournalPort>;
  reconcileActive(observer: Readonly<Observer>): Promise<'none' | 'confirmed'>;
  confirmExact(
    expectedTxId: string,
    confirmation: SubstrateFederatedLocalDevnetGenesisConfirmation,
  ): void;
  revalidateConfirmed(observer: Readonly<Observer>): Promise<number>;
}

interface DurableMaterialV1 {
  readonly authorization: ErgoOperationalBroadcastAuthorization;
  readonly expectedTxId: string;
  readonly durableAttemptDigestHex: string;
}

const DURABLE_MATERIAL = new WeakMap<object, DurableMaterialV1>();

export function createSubstrateFederatedLocalDevnetPegInSourceLockJournalV1(
  input: Readonly<{
    state: SubstrateFederatedLocalDevnetPegInSourceLockJournalStateV1;
    authorizer:
      Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizerV1>;
    reconciliationIdentityDigestHex: string;
    targetGenesisHeaderIdHex: string;
  }>,
): Readonly<SubstrateFederatedLocalDevnetPegInSourceLockJournalV1> {
  const state = requireState(input.state);
  const reconciliationIdentityDigestHex = fixedHex32(
    input.reconciliationIdentityDigestHex,
    'source-lock reconciliation identity digest',
  );
  const targetGenesisHeaderIdHex = fixedHex32(
    input.targetGenesisHeaderIdHex,
    'source-lock target genesis header ID',
  );
  assertJournalState(state, reconciliationIdentityDigestHex);

  const journal: JournalPort = Object.freeze({
    reserve: authorization => {
      assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizationArtifactV1(
        input.authorizer,
        authorization,
      );
      if (activeAttempts(state).length !== 0) {
        throw new Error(
          'unresolved source-lock attempt must be reconciled before replacement',
        );
      }
      const admission = authorization.revalidated.checked.signed.admission;
      const attempt = state.reserveErgoOperationalTransactionAttempt({
        operationProfile:
          SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
        expectedTxId: admission.expectedTxId,
        sourceBoxId: admission.sourceBoxId,
        inputBoxIds: admission.inputBoxIds,
        attemptedAtHeight: admission.attemptedAtHeight,
        targetSidechainHeight: null,
        targetSidechainBlockHashHex: null,
        heartbeatKeyHex: null,
        reconciliationIdentityDigestHex,
        bindingDigestHex: admission.bindingDigestHex,
        signedTransactionDigestHex:
          authorization.revalidated.checked.signed.signedTransactionDigestHex,
        checkResponseDigestHex:
          authorization.revalidated.checked.checkResponseDigestHex,
        revalidationDigestHex: authorization.revalidated.revalidationDigestHex,
        authorizationDigestHex: authorization.authorizationDigestHex,
      });
      assertAttemptBinding(
        attempt,
        authorization,
        reconciliationIdentityDigestHex,
      );
      const durableArtifact = Object.freeze({
        schema:
          SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_JOURNAL_V1_SCHEMA,
        expectedTxId: attempt.expectedTxId,
      });
      DURABLE_MATERIAL.set(durableArtifact, Object.freeze({
        authorization,
        expectedTxId: attempt.expectedTxId,
        durableAttemptDigestHex: attempt.durableAttemptDigestHex,
      }));
      return Object.freeze({
        durableAttemptDigestHex: attempt.durableAttemptDigestHex,
        durableArtifact,
      });
    },
    finalize: ({ attempt, submission }) => {
      const material = requireDurableMaterial(attempt);
      const finalized = state.finalizeErgoOperationalTransactionAttempt({
        expectedTxId: material.expectedTxId,
        durableAttemptDigestHex: material.durableAttemptDigestHex,
        disposition: submission.status,
        submittedTxId: submission.submittedTxId,
        responseDigestHex: submission.responseDigestHex,
      });
      assertAttemptBinding(
        finalized.attempt,
        material.authorization,
        reconciliationIdentityDigestHex,
      );
      return Object.freeze({
        status: submission.status,
        journalDigestHex: finalized.journalDigestHex,
      });
    },
  });

  const confirmExact = (
    expectedTxId: string,
    confirmation: SubstrateFederatedLocalDevnetGenesisConfirmation,
  ): void => {
    const exact = normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1(
      confirmation,
    );
    const normalizedTxId = fixedHex32(expectedTxId, 'source-lock transaction ID');
    if (
      exact.status !== 'confirmed'
      || exact.confirmationHeight === null
      || exact.confirmationHeaderIdHex === null
    ) {
      throw new Error('source-lock journal requires final canonical confirmation');
    }
    assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
      exact.observerArtifact,
      reconciliationIdentityDigestHex,
      targetGenesisHeaderIdHex,
      normalizedTxId,
      exact,
    );
    const confirmed = state.confirmErgoOperationalTransactionAttempt({
      expectedTxId: normalizedTxId,
      confirmationHeight: exact.confirmationHeight,
      confirmationHeaderId: exact.confirmationHeaderIdHex,
    });
    assertStoredIdentity(confirmed, reconciliationIdentityDigestHex);
  };

  return Object.freeze({
    journal,
    confirmExact,
    reconcileActive: async (observer: Readonly<Observer>) => {
      assertSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
        observer,
        reconciliationIdentityDigestHex,
      );
      const active = activeAttempts(state);
      if (active.length === 0) return 'none';
      if (active.length !== 1) {
        throw new Error('multiple active source-lock attempts violate the LAB profile');
      }
      const attempt = active[0]!;
      const observation = await observeExact(observer, attempt.expectedTxId);
      if (observation.status !== 'confirmed') {
        throw new Error(
          `durable source-lock attempt ${attempt.expectedTxId} remains `
            + `${observation.status}`,
        );
      }
      confirmExact(attempt.expectedTxId, observation);
      return 'confirmed';
    },
    revalidateConfirmed: async (observer: Readonly<Observer>) => {
      assertSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
        observer,
        reconciliationIdentityDigestHex,
      );
      const confirmed = state.getConfirmedErgoOperationalTransactionAttempts(
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
      );
      for (const attempt of confirmed) {
        const observation = await observeExact(observer, attempt.expectedTxId);
        if (
          observation.status !== 'confirmed'
          || observation.confirmationHeight === null
          || observation.confirmationHeaderIdHex === null
        ) {
          state.quarantineErgoOperationalTransactionAttempt(
            attempt.expectedTxId,
            `confirmed local source-lock transaction lost canonical inclusion (${observation.status})`,
          );
          throw new Error(
            `confirmed source-lock transaction ${attempt.expectedTxId} lost canonical inclusion`,
          );
        }
        const rebound = state.rebindConfirmedErgoOperationalTransactionAttempt({
          expectedTxId: attempt.expectedTxId,
          confirmationHeight: observation.confirmationHeight,
          confirmationHeaderId: observation.confirmationHeaderIdHex,
        });
        assertStoredIdentity(rebound, reconciliationIdentityDigestHex);
      }
      return confirmed.length;
    },
  });

  async function observeExact(
    observer: Readonly<Observer>,
    expectedTxId: string,
  ): Promise<SubstrateFederatedLocalDevnetGenesisConfirmation> {
    const raw = await observer.observe(
      expectedTxId,
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
    );
    if (raw === null) {
      throw new Error('source-lock confirmation observation is unavailable');
    }
    const exact = normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1(raw);
    assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
      exact.observerArtifact,
      reconciliationIdentityDigestHex,
      targetGenesisHeaderIdHex,
      expectedTxId,
      exact,
    );
    return exact;
  }
}

function requireDurableMaterial(
  attempt: Parameters<JournalPort['finalize']>[0]['attempt'],
): DurableMaterialV1 {
  const material = DURABLE_MATERIAL.get(attempt.durableArtifact);
  if (
    material === undefined
    || material.authorization !== attempt.authorization
    || material.durableAttemptDigestHex !== attempt.durableAttemptDigestHex
  ) {
    throw new Error('source-lock durable attempt lacks exact process provenance');
  }
  return material;
}

function assertJournalState(
  state: SubstrateFederatedLocalDevnetPegInSourceLockJournalStateV1,
  reconciliationIdentityDigestHex: string,
): void {
  for (const attempt of state.getErgoOperationalTransactionAttempts(
    SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
  )) {
    assertStoredIdentity(attempt, reconciliationIdentityDigestHex);
    if (attempt.status === 'quarantined' || attempt.status === 'abandoned') {
      throw new Error(
        `source-lock attempt ${attempt.expectedTxId} requires reviewed recovery`,
      );
    }
  }
}

function activeAttempts(
  state: SubstrateFederatedLocalDevnetPegInSourceLockJournalStateV1,
): ErgoOperationalTransactionAttempt[] {
  return state.getActiveErgoOperationalTransactionAttempts(
    SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
  );
}

function assertAttemptBinding(
  attempt: ErgoOperationalTransactionAttempt,
  authorization: ErgoOperationalBroadcastAuthorization,
  reconciliationIdentityDigestHex: string,
): void {
  const checked = authorization.revalidated.checked;
  const admission = checked.signed.admission;
  if (
    attempt.expectedTxId !== admission.expectedTxId
    || attempt.sourceBoxId !== admission.sourceBoxId
    || !sameStrings(attempt.inputBoxIds, admission.inputBoxIds)
    || attempt.attemptedAtHeight !== admission.attemptedAtHeight
    || attempt.bindingDigestHex !== admission.bindingDigestHex
    || attempt.signedTransactionDigestHex
      !== checked.signed.signedTransactionDigestHex
    || attempt.checkResponseDigestHex !== checked.checkResponseDigestHex
    || attempt.revalidationDigestHex
      !== authorization.revalidated.revalidationDigestHex
    || attempt.authorizationDigestHex !== authorization.authorizationDigestHex
  ) {
    throw new Error('source-lock SQLite attempt differs from its authorization');
  }
  assertStoredIdentity(attempt, reconciliationIdentityDigestHex);
}

function assertStoredIdentity(
  attempt: ErgoOperationalTransactionAttempt,
  reconciliationIdentityDigestHex: string,
): void {
  if (
    attempt.operationProfile
      !== SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE
    || attempt.targetSidechainHeight !== null
    || attempt.targetSidechainBlockHashHex !== null
    || attempt.heartbeatKeyHex !== null
    || attempt.reconciliationIdentityDigestHex
      !== reconciliationIdentityDigestHex
    || attempt.fundsReleaseAuthorityEpochHex !== null
  ) {
    throw new Error('source-lock SQLite attempt identity is invalid');
  }
}

function requireState(
  value: SubstrateFederatedLocalDevnetPegInSourceLockJournalStateV1,
): SubstrateFederatedLocalDevnetPegInSourceLockJournalStateV1 {
  if (value === null || typeof value !== 'object') {
    throw new Error('source-lock journal requires StateTracker-compatible state');
  }
  return value;
}

function fixedHex32(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${label} must be 32-byte lowercase hexadecimal`);
  }
  return value;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}
