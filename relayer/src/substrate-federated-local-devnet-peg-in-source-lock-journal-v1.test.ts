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
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import { StateTracker } from './state-tracker.js';

const hex = (byte: string): string => byte.repeat(32);
const TX_ID = hex('11');
const SOURCE_ID = hex('12');
const RECONCILIATION_ID = hex('13');
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

function authorization() {
  const admission = Object.freeze({
    operationProfile:
      SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
    expectedTxId: TX_ID,
    sourceBoxId: SOURCE_ID,
    inputBoxIds: Object.freeze([SOURCE_ID]),
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
  return createSubstrateFederatedLocalDevnetPegInSourceLockJournalV1({
    state,
    authorizer: Object.freeze({}) as never,
    reconciliationIdentityDigestHex: RECONCILIATION_ID,
    targetGenesisHeaderIdHex: GENESIS_ID,
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

  it('quarantines a confirmed source-lock transaction that loses inclusion', async () => {
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
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_PEG_IN_SOURCE_LOCK_OPERATION_PROFILE,
      ),
    ).toHaveLength(1);
  });
});
