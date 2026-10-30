import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertAuthorization: vi.fn(),
  assertConfirmationArtifact: vi.fn(),
  assertObserver: vi.fn(),
}));

vi.mock(
  './substrate-federated-isolated-devnet-peg-in-source-lock-broadcast-authorizer-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetPegInSourceLockBroadcastAuthorizationArtifactV1:
      mocks.assertAuthorization,
  }),
);
vi.mock(
  './substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1:
      mocks.assertConfirmationArtifact,
    assertSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1:
      mocks.assertObserver,
  }),
);

import {
  createSubstrateFederatedLocalDevnetPegInSourceLockJournalV1,
} from './substrate-federated-local-devnet-peg-in-source-lock-journal-v1.js';
import {
  PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import { StateTracker } from './state-tracker.js';

const hex = (byte: string): string => byte.repeat(32);
const TX_ID = hex('11');
const SECOND_TX_ID = hex('18');
const SOURCE_ID = hex('12');
const SECOND_SOURCE_ID = hex('19');
const RECONCILIATION_ID = hex('13');
const OLD_RECONCILIATION_ID = hex('1a');
const GENESIS_ID = hex('14');
const CONFIRMATION_HEADER = hex('15');

let root: string;
let state: StateTracker;

beforeEach(() => {
  vi.clearAllMocks();
  root = mkdtempSync(join(tmpdir(), 'e2s-source-lock-journal-test-'));
  state = new StateTracker(join(root, 'state'));
});

afterEach(() => {
  state.close();
  rmSync(root, { recursive: true, force: true });
});

function authorization(
  expectedTxId = TX_ID,
  sourceBoxId = SOURCE_ID,
) {
  const admission = Object.freeze({
    operationProfile:
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    expectedTxId,
    sourceBoxId,
    inputBoxIds: Object.freeze([sourceBoxId]),
    attemptedAtHeight: 100,
    targetSidechainHeight: null,
    targetSidechainBlockHashHex: null,
    heartbeatKeyHex: null,
    bindingDigestHex: hex('21'),
  });
  const checked = Object.freeze({
    signed: Object.freeze({
      admission,
      signedTransactionDigestHex: hex('22'),
    }),
    checkResponseDigestHex: hex('23'),
  });
  return Object.freeze({
    revalidated: Object.freeze({
      checked,
      revalidationDigestHex: hex('24'),
    }),
    authorizationDigestHex: hex('25'),
    authorizationArtifact: Object.freeze({}),
  });
}

function confirmed(expectedTxId = TX_ID) {
  return Object.freeze({
    status: 'confirmed' as const,
    confirmations: 10,
    observedAtHeight: 120,
    observationDigestHex: hex('31'),
    confirmationHeight: 110,
    confirmationHeaderIdHex: CONFIRMATION_HEADER,
    observerArtifact: Object.freeze({ expectedTxId }),
  });
}

function createJournal(
  reconciliationIdentityDigestHex = RECONCILIATION_ID,
  journalState = state,
) {
  return createSubstrateFederatedLocalDevnetPegInSourceLockJournalV1({
    state: journalState,
    authorizer: Object.freeze({}) as never,
    reconciliationIdentityDigestHex,
    targetGenesisHeaderIdHex: GENESIS_ID,
  });
}

function persistConfirmed(
  journal: ReturnType<typeof createJournal>,
  exactAuthorization = authorization(),
): void {
  const expectedTxId = exactAuthorization.revalidated.checked.signed.admission.expectedTxId;
  const durable = journal.journal.reserve(exactAuthorization as never);
  journal.journal.finalize({
    attempt: {
      authorization: exactAuthorization,
      durableAttemptDigestHex: durable.durableAttemptDigestHex,
      durableArtifact: durable.durableArtifact,
    } as never,
    submission: {
      status: 'accepted',
      submittedTxId: expectedTxId,
      responseDigestHex: hex('32'),
    },
  });
  journal.confirmExact(expectedTxId, confirmed(expectedTxId));
}

function reserveDirect(
  operationProfile: typeof PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
  expectedTxId: string,
  sourceBoxId: string,
): void {
  const attempt = state.reserveErgoOperationalTransactionAttempt({
    operationProfile,
    expectedTxId,
    sourceBoxId,
    inputBoxIds: [sourceBoxId],
    attemptedAtHeight: 100,
    targetSidechainHeight: null,
    targetSidechainBlockHashHex: null,
    heartbeatKeyHex: null,
    reconciliationIdentityDigestHex: null,
    bindingDigestHex: hex('41'),
    signedTransactionDigestHex: hex('42'),
    checkResponseDigestHex: hex('43'),
    revalidationDigestHex: hex('44'),
    authorizationDigestHex: hex('45'),
  });
  state.finalizeErgoOperationalTransactionAttempt({
    expectedTxId,
    durableAttemptDigestHex: attempt.durableAttemptDigestHex,
    disposition: 'accepted',
    submittedTxId: expectedTxId,
    responseDigestHex: hex('46'),
  });
  state.confirmErgoOperationalTransactionAttempt({
    expectedTxId,
    confirmationHeight: 110,
    confirmationHeaderId: CONFIRMATION_HEADER,
  });
}

describe('local devnet source-lock journal V1', () => {
  it('persists before transport and reconciles an accepted attempt to confirmation', async () => {
    const journal = createJournal();
    const exactAuthorization = authorization();
    const durable = journal.journal.reserve(exactAuthorization as never);
    expect(
      state.getActiveErgoOperationalTransactionAttempts(
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
      ),
    ).toHaveLength(1);
    const attempt = Object.freeze({
      authorization: exactAuthorization,
      durableAttemptDigestHex: durable.durableAttemptDigestHex,
      durableArtifact: durable.durableArtifact,
    });
    journal.journal.finalize({
      attempt: attempt as never,
      submission: {
        status: 'accepted',
        submittedTxId: TX_ID,
        responseDigestHex: hex('32'),
      },
    });
    const observer = Object.freeze({
      observe: vi.fn(async () => confirmed()),
    });
    await expect(journal.reconcileActive(observer as never)).resolves.toBe('confirmed');
    expect(
      state.getConfirmedErgoOperationalTransactionAttempts(
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
      ),
    ).toHaveLength(1);
  });

  it('blocks replacement while an exact durable attempt is unresolved', () => {
    const journal = createJournal();
    journal.journal.reserve(authorization() as never);
    expect(() => journal.journal.reserve(authorization() as never)).toThrow(
      /must be reconciled/,
    );
  });

  it.each([undefined, TX_ID])(
    'quarantines a confirmed source-lock transaction that loses inclusion (%s selector)',
    async expectedTxId => {
      const journal = createJournal();
      const exactAuthorization = authorization();
      const durable = journal.journal.reserve(exactAuthorization as never);
      const attempt = Object.freeze({
        authorization: exactAuthorization,
        durableAttemptDigestHex: durable.durableAttemptDigestHex,
        durableArtifact: durable.durableArtifact,
      });
      journal.journal.finalize({
        attempt: attempt as never,
        submission: {
          status: 'ambiguous',
          submittedTxId: null,
          responseDigestHex: null,
        },
      });
      journal.confirmExact(TX_ID, confirmed());
      const observer = Object.freeze({
        observe: vi.fn(async () => ({
          status: 'not_found' as const,
          confirmations: 0,
          observedAtHeight: 121,
          observationDigestHex: hex('33'),
          confirmationHeight: null,
          confirmationHeaderIdHex: null,
          observerArtifact: Object.freeze({}),
        })),
      });
      await expect(
        journal.revalidateConfirmed(observer as never, expectedTxId),
      ).rejects.toThrow(
        /lost canonical inclusion/,
      );
      expect(
        state.getQuarantinedErgoOperationalTransactionAttempts(
          SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
        ),
      ).toHaveLength(1);
    },
  );

  it('revalidates only the selected current transaction and preserves old confirmed history', async () => {
    persistConfirmed(
      createJournal(OLD_RECONCILIATION_ID),
      authorization(TX_ID, SOURCE_ID),
    );
    const journal = createJournal();
    persistConfirmed(
      journal,
      authorization(SECOND_TX_ID, SECOND_SOURCE_ID),
    );
    const oldBefore = state.getErgoOperationalTransactionAttempts(
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    ).find(attempt => attempt.expectedTxId === TX_ID)!;
    const rebound = Object.freeze({
      ...confirmed(SECOND_TX_ID),
      confirmationHeight: 113,
      confirmationHeaderIdHex: hex('36'),
      observedAtHeight: 123,
    });
    const observer = Object.freeze({
      observe: vi.fn(async () => rebound),
    });

    await expect(
      journal.revalidateConfirmed(observer as never, SECOND_TX_ID),
    ).resolves.toBe(1);
    expect(observer.observe).toHaveBeenCalledTimes(1);
    expect(observer.observe).toHaveBeenCalledWith(
      SECOND_TX_ID,
      'http://127.0.0.1:9051',
    );
    const attempts = state.getErgoOperationalTransactionAttempts(
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    );
    expect(attempts.find(attempt => attempt.expectedTxId === TX_ID)).toEqual(
      oldBefore,
    );
    expect(
      attempts.find(attempt => attempt.expectedTxId === SECOND_TX_ID),
    ).toMatchObject({
      confirmationHeight: 113,
      confirmationHeaderId: hex('36'),
    });
    await expect(journal.revalidateConfirmed(observer as never)).rejects.toThrow(
      /identity is invalid/,
    );
    expect(observer.observe).toHaveBeenCalledTimes(1);
    expect(state.getErgoOperationalTransactionAttempts(
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    ).find(attempt => attempt.expectedTxId === TX_ID)).toEqual(oldBefore);
  });

  it('rejects selecting an old-bound confirmed transaction before observation', async () => {
    persistConfirmed(createJournal(OLD_RECONCILIATION_ID));
    const journal = createJournal();
    const before = state.getErgoOperationalTransactionAttempts(
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    )[0]!;
    const observer = Object.freeze({
      observe: vi.fn(async () => confirmed()),
    });

    await expect(
      journal.revalidateConfirmed(observer as never, TX_ID),
    ).rejects.toThrow(/identity is invalid/);
    expect(observer.observe).not.toHaveBeenCalled();
    expect(state.getErgoOperationalTransactionAttempts(
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    )[0]).toEqual(before);
  });

  it('rejects missing, wrong-profile and non-confirmed exact rows before observation', async () => {
    const observer = Object.freeze({
      observe: vi.fn(async () => confirmed(SECOND_TX_ID)),
    });
    const journal = createJournal();
    await expect(
      journal.revalidateConfirmed(observer as never, 'not-a-transaction-id'),
    ).rejects.toThrow(/must be 32-byte lowercase hexadecimal/);
    await expect(
      journal.revalidateConfirmed(observer as never, SECOND_TX_ID),
    ).rejects.toThrow(/exactly one confirmed source-lock attempt/);

    reserveDirect(
      PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
      SECOND_TX_ID,
      SECOND_SOURCE_ID,
    );
    await expect(
      journal.revalidateConfirmed(observer as never, SECOND_TX_ID),
    ).rejects.toThrow(/exactly one confirmed source-lock attempt/);

    const exactAuthorization = authorization();
    const durable = journal.journal.reserve(exactAuthorization as never);
    journal.journal.finalize({
      attempt: {
        authorization: exactAuthorization,
        durableAttemptDigestHex: durable.durableAttemptDigestHex,
        durableArtifact: durable.durableArtifact,
      } as never,
      submission: {
        status: 'ambiguous',
        submittedTxId: null,
        responseDigestHex: null,
      },
    });
    const activeBefore = state.getActiveErgoOperationalTransactionAttempts(
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    )[0]!;
    await expect(
      journal.revalidateConfirmed(observer as never, TX_ID),
    ).rejects.toThrow(/exactly one confirmed source-lock attempt/);
    expect(() => journal.journal.reserve(
      authorization(hex('51'), hex('52')) as never,
    )).toThrow(/must be reconciled/);
    expect(observer.observe).not.toHaveBeenCalled();
    expect(state.getActiveErgoOperationalTransactionAttempts(
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    )[0]).toEqual(activeBefore);
  });

  it('rejects malformed confirmed history and foreign unresolved identity at construction', () => {
    const malformedState = {
      ...state,
      getErgoOperationalTransactionAttempts: vi.fn(() => [{
        ...state.reserveErgoOperationalTransactionAttempt({
          operationProfile:
            SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
          expectedTxId: TX_ID,
          sourceBoxId: SOURCE_ID,
          inputBoxIds: [SOURCE_ID],
          attemptedAtHeight: 100,
          targetSidechainHeight: null,
          targetSidechainBlockHashHex: null,
          heartbeatKeyHex: null,
          reconciliationIdentityDigestHex: OLD_RECONCILIATION_ID,
          bindingDigestHex: hex('61'),
          signedTransactionDigestHex: hex('62'),
          checkResponseDigestHex: hex('63'),
          revalidationDigestHex: hex('64'),
          authorizationDigestHex: hex('65'),
        }),
        status: 'confirmed' as const,
        reconciliationIdentityDigestHex: null,
      }]),
    };
    expect(() => createJournal(RECONCILIATION_ID, malformedState as never)).toThrow(
      /must be 32-byte lowercase hexadecimal/,
    );

    state.close();
    state = new StateTracker(join(root, 'foreign-active'));
    const oldJournal = createJournal(OLD_RECONCILIATION_ID);
    oldJournal.journal.reserve(authorization() as never);
    expect(() => createJournal()).toThrow(/identity is invalid/);
  });

  it('rejects selected-row drift and target-artifact loss before journal mutation', async () => {
    const journal = createJournal();
    persistConfirmed(journal);
    const driftedHeader = hex('71');
    const rowDriftObserver = Object.freeze({
      observe: vi.fn(async () => {
        state.rebindConfirmedErgoOperationalTransactionAttempt({
          expectedTxId: TX_ID,
          confirmationHeight: 112,
          confirmationHeaderId: driftedHeader,
        });
        return confirmed();
      }),
    });
    await expect(
      journal.revalidateConfirmed(rowDriftObserver as never, TX_ID),
    ).rejects.toThrow(/changed during confirmation observation/);
    expect(state.getConfirmedErgoOperationalTransactionAttempts(
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    )[0]).toMatchObject({
      confirmationHeight: 112,
      confirmationHeaderId: driftedHeader,
    });

    const beforeTargetLoss = state.getConfirmedErgoOperationalTransactionAttempts(
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    )[0]!;
    mocks.assertConfirmationArtifact.mockImplementationOnce(() => {
      throw new Error('source-lock target identity changed during observation');
    });
    const targetLossObserver = Object.freeze({
      observe: vi.fn(async () => confirmed()),
    });
    await expect(
      journal.revalidateConfirmed(targetLossObserver as never, TX_ID),
    ).rejects.toThrow(/target identity changed/);
    expect(state.getConfirmedErgoOperationalTransactionAttempts(
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    )[0]).toEqual(beforeTargetLoss);
  });

  it('keeps no-selector bulk revalidation compatible', async () => {
    const journal = createJournal();
    persistConfirmed(journal, authorization(TX_ID, SOURCE_ID));
    persistConfirmed(
      journal,
      authorization(SECOND_TX_ID, SECOND_SOURCE_ID),
    );
    const observer = Object.freeze({
      observe: vi.fn(async (expectedTxId: string) => confirmed(expectedTxId)),
    });

    await expect(journal.revalidateConfirmed(observer as never)).resolves.toBe(2);
    expect(observer.observe.mock.calls.map(call => call[0])).toEqual([
      TX_ID,
      SECOND_TX_ID,
    ]);
  });
});
