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
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import { StateTracker } from './state-tracker.js';

const hex = (byte: string): string => byte.repeat(32);
const TX_ID = hex('11');
const RESERVE_ID = hex('12');
const SOURCE_LOCK_ID = hex('13');
const FEE_ID = hex('14');
const TARGET_ID = hex('15');
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

function authorization() {
  const admission = Object.freeze({
    operationProfile: PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
    expectedTxId: TX_ID,
    sourceBoxId: RESERVE_ID,
    inputBoxIds: Object.freeze([RESERVE_ID, SOURCE_LOCK_ID, FEE_ID]),
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

function createJournal() {
  return createSubstrateFederatedLocalDevnetPegInCommittedVaultJournalV1({
    state,
    authorizer: Object.freeze({}) as never,
    executionTargetIdentityDigestHex: TARGET_ID,
    targetGenesisHeaderIdHex: GENESIS_ID,
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

  it('quarantines a confirmed transition that loses canonical inclusion', async () => {
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

    await expect(journal.revalidateConfirmed(observer as never)).rejects.toThrow(
      /lost canonical inclusion/,
    );
    expect(
      state.getQuarantinedErgoOperationalTransactionAttempts(
        PEG_IN_COMMITTED_VAULT_OPERATION_PROFILE,
      ),
    ).toHaveLength(1);
  });

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
});
