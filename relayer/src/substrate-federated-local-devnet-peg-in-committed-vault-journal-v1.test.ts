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
  './substrate-federated-isolated-devnet-peg-in-committed-vault-broadcast-authorizer-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultBroadcastAuthorizationArtifactV1:
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
  assertSubstrateFederatedLocalDevnetPegInCommittedVaultDurableAttemptV1,
  createSubstrateFederatedLocalDevnetPegInCommittedVaultJournalV1,
} from './substrate-federated-local-devnet-peg-in-committed-vault-journal-v1.js';
import {
  PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import { StateTracker } from './state-tracker.js';

const hex = (byte: string): string => byte.repeat(32);
const TX_ID = hex('11');
const SECOND_TX_ID = hex('18');
const RESERVE_ID = hex('12');
const SECOND_RESERVE_ID = hex('19');
const SOURCE_LOCK_ID = hex('13');
const SECOND_SOURCE_LOCK_ID = hex('1a');
const FEE_ID = hex('14');
const SECOND_FEE_ID = hex('1b');
const TARGET_ID = hex('15');
const OLD_TARGET_ID = hex('1c');
const GENESIS_ID = hex('16');
const CONFIRMATION_HEADER = hex('17');

let root: string;
let state: StateTracker;

beforeEach(() => {
  vi.clearAllMocks();
  root = mkdtempSync(join(tmpdir(), 'e2s-committed-vault-journal-test-'));
  state = new StateTracker(join(root, 'state'));
});

afterEach(() => {
  state.close();
  rmSync(root, { recursive: true, force: true });
});

function authorization(
  expectedTxId = TX_ID,
  reserveId = RESERVE_ID,
  sourceLockId = SOURCE_LOCK_ID,
  feeId = FEE_ID,
) {
  const admission = Object.freeze({
    operationProfile: PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
    expectedTxId,
    sourceBoxId: reserveId,
    inputBoxIds: Object.freeze([reserveId, sourceLockId, feeId]),
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
  executionTargetIdentityDigestHex = TARGET_ID,
  journalState = state,
) {
  return createSubstrateFederatedLocalDevnetPegInCommittedVaultJournalV1({
    state: journalState,
    authorizer: Object.freeze({}) as never,
    executionTargetIdentityDigestHex,
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

function statePort(overrides: Record<string, unknown> = {}) {
  return {
    reserveErgoOperationalTransactionAttempt:
      state.reserveErgoOperationalTransactionAttempt.bind(state),
    getErgoOperationalTransactionAttempts:
      state.getErgoOperationalTransactionAttempts.bind(state),
    getActiveErgoOperationalTransactionAttempts:
      state.getActiveErgoOperationalTransactionAttempts.bind(state),
    getConfirmedErgoOperationalTransactionAttempts:
      state.getConfirmedErgoOperationalTransactionAttempts.bind(state),
    finalizeErgoOperationalTransactionAttempt:
      state.finalizeErgoOperationalTransactionAttempt.bind(state),
    confirmErgoOperationalTransactionAttempt:
      state.confirmErgoOperationalTransactionAttempt.bind(state),
    rebindConfirmedErgoOperationalTransactionAttempt:
      state.rebindConfirmedErgoOperationalTransactionAttempt.bind(state),
    quarantineErgoOperationalTransactionAttempt:
      state.quarantineErgoOperationalTransactionAttempt.bind(state),
    ...overrides,
  };
}

function reserveWrongProfile(expectedTxId: string, sourceBoxId: string): void {
  const attempt = state.reserveErgoOperationalTransactionAttempt({
    operationProfile:
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    expectedTxId,
    sourceBoxId,
    inputBoxIds: [sourceBoxId],
    attemptedAtHeight: 100,
    targetSidechainHeight: null,
    targetSidechainBlockHashHex: null,
    heartbeatKeyHex: null,
    reconciliationIdentityDigestHex: hex('41'),
    bindingDigestHex: hex('42'),
    signedTransactionDigestHex: hex('43'),
    checkResponseDigestHex: hex('44'),
    revalidationDigestHex: hex('45'),
    authorizationDigestHex: hex('46'),
  });
  state.finalizeErgoOperationalTransactionAttempt({
    expectedTxId,
    durableAttemptDigestHex: attempt.durableAttemptDigestHex,
    disposition: 'accepted',
    submittedTxId: expectedTxId,
    responseDigestHex: hex('47'),
  });
  state.confirmErgoOperationalTransactionAttempt({
    expectedTxId,
    confirmationHeight: 110,
    confirmationHeaderId: CONFIRMATION_HEADER,
  });
}

describe('local devnet committed-vault journal V1', () => {
  it('persists before transport and reconciles an accepted attempt to confirmation', async () => {
    const journal = createJournal();
    const exactAuthorization = authorization();
    const durable = journal.journal.reserve(exactAuthorization as never);
    expect(
      state.getActiveErgoOperationalTransactionAttempts(
        PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
      ),
    ).toHaveLength(1);
    const attempt = Object.freeze({
      authorization: exactAuthorization,
      durableAttemptDigestHex: durable.durableAttemptDigestHex,
      durableArtifact: durable.durableArtifact,
    });
    expect(() =>
      assertSubstrateFederatedLocalDevnetPegInCommittedVaultDurableAttemptV1(
        Object.freeze({}) as never,
        attempt as never,
      )
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedLocalDevnetPegInCommittedVaultDurableAttemptV1(
        Object.freeze({}) as never,
        { ...attempt, durableArtifact: { ...durable.durableArtifact } } as never,
      )
    ).toThrow(/lacks exact journal provenance/);
    journal.journal.finalize({
      attempt: attempt as never,
      submission: {
        status: 'accepted',
        submittedTxId: TX_ID,
        responseDigestHex: hex('32'),
      },
    });
    expect(() =>
      assertSubstrateFederatedLocalDevnetPegInCommittedVaultDurableAttemptV1(
        Object.freeze({}) as never,
        attempt as never,
      )
    ).toThrow(/not pending in SQLite/);
    const observer = Object.freeze({
      observe: vi.fn(async () => confirmed()),
    });

    await expect(journal.reconcileActive(observer as never)).resolves.toBe(
      'confirmed',
    );
    expect(
      state.getConfirmedErgoOperationalTransactionAttempts(
        PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
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
    'quarantines a confirmed transition that loses canonical inclusion (%s selector)',
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
          PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
        ),
      ).toHaveLength(1);
    },
  );

  it('returns the latest re-inclusion after rebinding a confirmed transaction', async () => {
    const journal = createJournal();
    const exactAuthorization = authorization();
    const durable = journal.journal.reserve(exactAuthorization as never);
    journal.journal.finalize({
      attempt: {
        authorization: exactAuthorization,
        durableAttemptDigestHex: durable.durableAttemptDigestHex,
        durableArtifact: durable.durableArtifact,
      } as never,
      submission: {
        status: 'accepted',
        submittedTxId: TX_ID,
        responseDigestHex: hex('34'),
      },
    });
    journal.confirmExact(TX_ID, confirmed());
    const rebound = Object.freeze({
      ...confirmed(),
      observationDigestHex: hex('35'),
      confirmationHeight: 113,
      observedAtHeight: 123,
      confirmationHeaderIdHex: hex('36'),
      observerArtifact: Object.freeze({ expectedTxId: TX_ID, round: 2 }),
    });
    const observer = Object.freeze({
      observe: vi.fn(async () => rebound),
    });

    await expect(journal.revalidateConfirmed(observer as never)).resolves.toEqual([
      rebound,
    ]);
    expect(
      state.getConfirmedErgoOperationalTransactionAttempts(
        PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
      )[0],
    ).toMatchObject({
      confirmationHeight: 113,
      confirmationHeaderId: hex('36'),
    });
  });

  it('revalidates only the selected current transaction and preserves old confirmed history', async () => {
    persistConfirmed(
      createJournal(OLD_TARGET_ID),
      authorization(TX_ID, RESERVE_ID, SOURCE_LOCK_ID, FEE_ID),
    );
    const journal = createJournal();
    persistConfirmed(
      journal,
      authorization(
        SECOND_TX_ID,
        SECOND_RESERVE_ID,
        SECOND_SOURCE_LOCK_ID,
        SECOND_FEE_ID,
      ),
    );
    const oldBefore = state.getErgoOperationalTransactionAttempts(
      PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
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
    ).resolves.toEqual([rebound]);
    expect(observer.observe).toHaveBeenCalledTimes(1);
    expect(observer.observe).toHaveBeenCalledWith(
      SECOND_TX_ID,
      'http://127.0.0.1:9051',
    );
    const attempts = state.getErgoOperationalTransactionAttempts(
      PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
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
  });

  it('rejects missing, wrong-profile, wrong-binding and non-confirmed exact rows before observation', async () => {
    const observer = Object.freeze({
      observe: vi.fn(async () => confirmed(SECOND_TX_ID)),
    });
    const journal = createJournal();
    await expect(
      journal.revalidateConfirmed(observer as never, 'not-a-transaction-id'),
    ).rejects.toThrow(/must be 32-byte lowercase hexadecimal/);
    await expect(
      journal.revalidateConfirmed(observer as never, SECOND_TX_ID),
    ).rejects.toThrow(/exactly one confirmed committed-vault attempt/);

    reserveWrongProfile(SECOND_TX_ID, SECOND_RESERVE_ID);
    await expect(
      journal.revalidateConfirmed(observer as never, SECOND_TX_ID),
    ).rejects.toThrow(/exactly one confirmed committed-vault attempt/);

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
      PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
    )[0]!;
    await expect(
      journal.revalidateConfirmed(observer as never, TX_ID),
    ).rejects.toThrow(/exactly one confirmed committed-vault attempt/);
    expect(() => journal.journal.reserve(authorization(
      hex('51'),
      hex('52'),
      hex('53'),
      hex('54'),
    ) as never)).toThrow(/must be reconciled/);
    expect(state.getActiveErgoOperationalTransactionAttempts(
      PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
    )[0]).toEqual(activeBefore);

    state.close();
    state = new StateTracker(join(root, 'wrong-binding'));
    const validJournal = createJournal();
    persistConfirmed(validJournal);
    const confirmedRow = state.getConfirmedErgoOperationalTransactionAttempts(
      PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
    )[0]!;
    const wrongBindingJournal = createJournal(TARGET_ID, statePort({
      getConfirmedErgoOperationalTransactionAttempts: vi.fn(() => [{
        ...confirmedRow,
        reconciliationIdentityDigestHex: hex('55'),
      }]),
    }) as never);
    await expect(
      wrongBindingJournal.revalidateConfirmed(observer as never, TX_ID),
    ).rejects.toThrow(/identity is invalid/);
    expect(observer.observe).not.toHaveBeenCalled();
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
      PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
    )[0]).toMatchObject({
      confirmationHeight: 112,
      confirmationHeaderId: driftedHeader,
    });

    const beforeTargetLoss = state.getConfirmedErgoOperationalTransactionAttempts(
      PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
    )[0]!;
    mocks.assertConfirmationArtifact.mockImplementationOnce(() => {
      throw new Error('committed-vault target identity changed during observation');
    });
    const targetLossObserver = Object.freeze({
      observe: vi.fn(async () => confirmed()),
    });
    await expect(
      journal.revalidateConfirmed(targetLossObserver as never, TX_ID),
    ).rejects.toThrow(/target identity changed/);
    expect(state.getConfirmedErgoOperationalTransactionAttempts(
      PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
    )[0]).toEqual(beforeTargetLoss);
  });

  it('keeps no-selector bulk revalidation compatible', async () => {
    const journal = createJournal();
    persistConfirmed(
      journal,
      authorization(TX_ID, RESERVE_ID, SOURCE_LOCK_ID, FEE_ID),
    );
    persistConfirmed(
      journal,
      authorization(
        SECOND_TX_ID,
        SECOND_RESERVE_ID,
        SECOND_SOURCE_LOCK_ID,
        SECOND_FEE_ID,
      ),
    );
    const observer = Object.freeze({
      observe: vi.fn(async (expectedTxId: string) => confirmed(expectedTxId)),
    });

    await expect(journal.revalidateConfirmed(observer as never)).resolves.toHaveLength(2);
    expect(observer.observe.mock.calls.map(call => call[0])).toEqual([
      TX_ID,
      SECOND_TX_ID,
    ]);
  });
});
