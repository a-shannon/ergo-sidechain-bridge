import {
  PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
  type ErgoOperationalBroadcastAuthorization,
  type ErgoOperationalDurableAttempt,
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
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1,
  type SubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizerV1,
} from './substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.js';

export const SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_COMMITTED_VAULT_JOURNAL_V1_SCHEMA =
  'e2s.substrate-federated-local-devnet-peg-in-committed-vault-journal.v1' as const;

type JournalPort = ErgoOperationalTransactionExecutionPorts['journal'];
type Observer = SubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1;

export interface SubstrateFederatedLocalDevnetPegInCommittedVaultJournalStateV1 {
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

export interface SubstrateFederatedLocalDevnetPegInCommittedVaultJournalV1 {
  readonly journal: Readonly<JournalPort>;
  reconcileActive(observer: Readonly<Observer>): Promise<'none' | 'confirmed'>;
  confirmExact(
    expectedTxId: string,
    confirmation: SubstrateFederatedLocalDevnetGenesisConfirmation,
  ): void;
  revalidateConfirmed(observer: Readonly<Observer>): Promise<readonly Readonly<
    SubstrateFederatedLocalDevnetGenesisConfirmation
  >[]>;
}

interface DurableMaterialV1 {
  readonly state: SubstrateFederatedLocalDevnetPegInCommittedVaultJournalStateV1;
  readonly authorization: ErgoOperationalBroadcastAuthorization;
  readonly expectedTxId: string;
  readonly durableAttemptDigestHex: string;
}

const DURABLE_MATERIAL = new WeakMap<object, DurableMaterialV1>();

export function createSubstrateFederatedLocalDevnetPegInCommittedVaultJournalV1(
  input: Readonly<{
    state: SubstrateFederatedLocalDevnetPegInCommittedVaultJournalStateV1;
    authorizer:
      Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizerV1>;
    executionTargetIdentityDigestHex: string;
    targetGenesisHeaderIdHex: string;
  }>,
): Readonly<SubstrateFederatedLocalDevnetPegInCommittedVaultJournalV1> {
  const state = requireState(input.state);
  const executionTargetIdentityDigestHex = fixedHex32(
    input.executionTargetIdentityDigestHex,
    'committed-vault execution-target identity digest',
  );
  const targetGenesisHeaderIdHex = fixedHex32(
    input.targetGenesisHeaderIdHex,
    'committed-vault target genesis header ID',
  );
  assertJournalState(state);

  const journal: JournalPort = Object.freeze({
    reserve: authorization => {
      assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1(
        input.authorizer,
        authorization,
      );
      if (activeAttempts(state).length !== 0) {
        throw new Error(
          'unresolved committed-vault attempt must be reconciled before replacement',
        );
      }
      const admission = authorization.revalidated.checked.signed.admission;
      const attempt = state.reserveErgoOperationalTransactionAttempt({
        operationProfile: PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
        expectedTxId: admission.expectedTxId,
        sourceBoxId: admission.sourceBoxId,
        inputBoxIds: admission.inputBoxIds,
        attemptedAtHeight: admission.attemptedAtHeight,
        targetSidechainHeight: null,
        targetSidechainBlockHashHex: null,
        heartbeatKeyHex: null,
        reconciliationIdentityDigestHex: null,
        bindingDigestHex: admission.bindingDigestHex,
        signedTransactionDigestHex:
          authorization.revalidated.checked.signed.signedTransactionDigestHex,
        checkResponseDigestHex:
          authorization.revalidated.checked.checkResponseDigestHex,
        revalidationDigestHex: authorization.revalidated.revalidationDigestHex,
        authorizationDigestHex: authorization.authorizationDigestHex,
      });
      assertAttemptBinding(attempt, authorization);
      const durableArtifact = Object.freeze({
        schema:
          SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_COMMITTED_VAULT_JOURNAL_V1_SCHEMA,
        expectedTxId: attempt.expectedTxId,
      });
      DURABLE_MATERIAL.set(durableArtifact, Object.freeze({
        state,
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
      assertAttemptBinding(finalized.attempt, material.authorization);
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
    const normalizedTxId = fixedHex32(
      expectedTxId,
      'committed-vault transaction ID',
    );
    if (
      exact.status !== 'confirmed'
      || exact.confirmationHeight === null
      || exact.confirmationHeaderIdHex === null
    ) {
      throw new Error(
        'committed-vault journal requires final canonical confirmation',
      );
    }
    assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
      exact.observerArtifact,
      executionTargetIdentityDigestHex,
      targetGenesisHeaderIdHex,
      normalizedTxId,
      exact,
    );
    const confirmed = state.confirmErgoOperationalTransactionAttempt({
      expectedTxId: normalizedTxId,
      confirmationHeight: exact.confirmationHeight,
      confirmationHeaderId: exact.confirmationHeaderIdHex,
    });
    assertStoredIdentity(confirmed);
  };

  return Object.freeze({
    journal,
    confirmExact,
    reconcileActive: async (observer: Readonly<Observer>) => {
      assertSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
        observer,
        executionTargetIdentityDigestHex,
      );
      const active = activeAttempts(state);
      if (active.length === 0) return 'none';
      if (active.length !== 1) {
        throw new Error(
          'multiple active committed-vault attempts violate the LAB profile',
        );
      }
      const attempt = active[0]!;
      const observation = await observeExact(observer, attempt.expectedTxId);
      if (observation.status !== 'confirmed') {
        throw new Error(
          `durable committed-vault attempt ${attempt.expectedTxId} remains `
            + `${observation.status}`,
        );
      }
      confirmExact(attempt.expectedTxId, observation);
      return 'confirmed';
    },
    revalidateConfirmed: async (observer: Readonly<Observer>) => {
      assertSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1(
        observer,
        executionTargetIdentityDigestHex,
      );
      const confirmed = state.getConfirmedErgoOperationalTransactionAttempts(
        PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
      );
      const observations: SubstrateFederatedLocalDevnetGenesisConfirmation[] = [];
      for (const attempt of confirmed) {
        const observation = await observeExact(observer, attempt.expectedTxId);
        if (
          observation.status !== 'confirmed'
          || observation.confirmationHeight === null
          || observation.confirmationHeaderIdHex === null
        ) {
          state.quarantineErgoOperationalTransactionAttempt(
            attempt.expectedTxId,
            `confirmed local committed-vault transaction lost canonical inclusion (${observation.status})`,
          );
          throw new Error(
            `confirmed committed-vault transaction ${attempt.expectedTxId} lost canonical inclusion`,
          );
        }
        const rebound = state.rebindConfirmedErgoOperationalTransactionAttempt({
          expectedTxId: attempt.expectedTxId,
          confirmationHeight: observation.confirmationHeight,
          confirmationHeaderId: observation.confirmationHeaderIdHex,
        });
        assertStoredIdentity(rebound);
        observations.push(observation);
      }
      return Object.freeze(observations);
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
      throw new Error('committed-vault confirmation observation is unavailable');
    }
    const exact = normalizeSubstrateFederatedLocalDevnetGenesisConfirmationV1(raw);
    assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1(
      exact.observerArtifact,
      executionTargetIdentityDigestHex,
      targetGenesisHeaderIdHex,
      expectedTxId,
      exact,
    );
    return exact;
  }
}

/** Require the exact still-pending SQLite reservation before transport. */
export function assertSubstrateFederatedLocalDevnetPegInCommittedVaultDurableAttemptV1(
  authorizer:
    Readonly<SubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizerV1>,
  attempt: Readonly<ErgoOperationalDurableAttempt>,
): void {
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1(
    authorizer,
    attempt.authorization,
  );
  const material = DURABLE_MATERIAL.get(attempt.durableArtifact);
  if (
    material === undefined
    || material.authorization !== attempt.authorization
    || material.expectedTxId
      !== attempt.authorization.revalidated.checked.signed.admission.expectedTxId
    || material.durableAttemptDigestHex !== attempt.durableAttemptDigestHex
  ) {
    throw new Error(
      'committed-vault durable attempt lacks exact journal provenance',
    );
  }
  const stored = material.state.getErgoOperationalTransactionAttempts(
    PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
  ).filter(value =>
    value.expectedTxId === material.expectedTxId
    && value.durableAttemptDigestHex === material.durableAttemptDigestHex
  );
  if (stored.length !== 1 || stored[0]!.status !== 'pending') {
    throw new Error(
      'committed-vault durable attempt is not pending in SQLite',
    );
  }
  assertAttemptBinding(stored[0]!, material.authorization);
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
    throw new Error(
      'committed-vault durable attempt lacks exact process provenance',
    );
  }
  return material;
}

function assertJournalState(
  state: SubstrateFederatedLocalDevnetPegInCommittedVaultJournalStateV1,
): void {
  for (const attempt of state.getErgoOperationalTransactionAttempts(
    PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
  )) {
    assertStoredIdentity(attempt);
    if (attempt.status === 'quarantined' || attempt.status === 'abandoned') {
      throw new Error(
        `committed-vault attempt ${attempt.expectedTxId} requires reviewed recovery`,
      );
    }
  }
}

function activeAttempts(
  state: SubstrateFederatedLocalDevnetPegInCommittedVaultJournalStateV1,
): ErgoOperationalTransactionAttempt[] {
  return state.getActiveErgoOperationalTransactionAttempts(
    PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
  );
}

function assertAttemptBinding(
  attempt: ErgoOperationalTransactionAttempt,
  authorization: ErgoOperationalBroadcastAuthorization,
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
    throw new Error(
      'committed-vault SQLite attempt differs from its authorization',
    );
  }
  assertStoredIdentity(attempt);
}

function assertStoredIdentity(
  attempt: ErgoOperationalTransactionAttempt,
): void {
  if (
    attempt.operationProfile !== PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE
    || attempt.targetSidechainHeight !== null
    || attempt.targetSidechainBlockHashHex !== null
    || attempt.heartbeatKeyHex !== null
    || attempt.reconciliationIdentityDigestHex !== null
    || attempt.fundsReleaseAuthorityEpochHex !== null
  ) {
    throw new Error('committed-vault SQLite attempt identity is invalid');
  }
}

function requireState(
  value: SubstrateFederatedLocalDevnetPegInCommittedVaultJournalStateV1,
): SubstrateFederatedLocalDevnetPegInCommittedVaultJournalStateV1 {
  if (value === null || typeof value !== 'object') {
    throw new Error(
      'committed-vault journal requires StateTracker-compatible state',
    );
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
