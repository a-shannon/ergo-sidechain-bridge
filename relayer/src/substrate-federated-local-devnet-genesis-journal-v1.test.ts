import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock(
  './substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetGenesisConfirmationObserverV1: (
      value: Readonly<Record<string, unknown>>,
      expectedReconciliationIdentityDigestHex: string,
    ) => {
      if (
        value.schema
          !== 'e2s.substrate-federated-isolated-devnet-genesis-confirmation-observer.v1'
        || value.reconciliationIdentityDigestHex
          !== expectedReconciliationIdentityDigestHex
      ) {
        throw new Error('synthetic confirmation observer provenance is missing');
      }
    },
    assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1: (
      value: Readonly<Record<string, unknown>>,
      expectedReconciliationIdentityDigestHex: string,
      expectedTargetGenesisHeaderIdHex: string,
      expectedTxId: string,
      expectedConfirmation: Readonly<Record<string, unknown>>,
    ) => {
      if (
        value.reconciliationIdentityDigestHex
          !== expectedReconciliationIdentityDigestHex
        || value.targetGenesisHeaderIdHex !== expectedTargetGenesisHeaderIdHex
        || value.expectedTxId !== expectedTxId
        || value.observationDigestHex
          !== expectedConfirmation.observationDigestHex
        || expectedConfirmation.observerArtifact !== value
      ) {
        throw new Error('synthetic confirmation artifact provenance is missing');
      }
    },
  }),
);

import {
  canonicalJson,
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import {
  SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
  executeSubstrateFederatedLocalDevnetGenesisV1,
  type SubstrateFederatedLocalDevnetGenesisConfirmation,
  type SubstrateFederatedLocalDevnetGenesisExecutionInput,
  type SubstrateFederatedLocalDevnetGenesisExecutionPorts,
} from './relayer-core/substrate-federated-local-devnet-genesis-execution-v1.js';
import {
  ERGO_OPERATIONAL_DEFINITIVE_TRANSPORT_REJECTION_REASON,
  StateTracker,
} from './state-tracker.js';
import {
  createSubstrateFederatedLocalDevnetGenesisJournalV1,
} from './substrate-federated-local-devnet-genesis-journal-v1.js';

const hex = (byte: string): string => byte.repeat(32);

const PLAN_DIGEST = hex('01');
const GENESIS_HEADER_ID = hex('02');
const EXPECTED_TX_ID = hex('03');
const SOURCE_BOX_ID = hex('04');
const FEE_BOX_ID = hex('05');
const SIGNED_DIGEST = hex('06');
const CHECK_DIGEST = hex('07');
const POST_CHECK_DIGEST = hex('08');
const PRE_TRANSPORT_DIGEST = hex('09');
const AUTHORIZATION_DIGEST = hex('0a');
const RESPONSE_DIGEST = hex('0b');
const CONFIRMATION_DIGEST = hex('0c');
const CONFIRMATION_HEADER_ID = hex('0d');
const RECONCILIATION_IDENTITY = hex('0e');
const OBSERVER_ARTIFACT = Object.freeze({
  reconciliationIdentityDigestHex: RECONCILIATION_IDENTITY,
  targetGenesisHeaderIdHex: GENESIS_HEADER_ID,
  expectedTxId: EXPECTED_TX_ID,
  observationDigestHex: CONFIRMATION_DIGEST,
});

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

function campaign(): {
  readonly root: string;
  readonly dbPath: string;
  readonly markerDirectory: string;
  readonly state: StateTracker;
} {
  const root = mkdtempSync(join(tmpdir(), 'e2s-fed6-genesis-journal-'));
  temporaryRoots.push(root);
  const markerDirectory = join(root, 'attempt-markers');
  mkdirSync(markerDirectory);
  const dbPath = join(root, 'state.sqlite');
  return {
    root,
    dbPath,
    markerDirectory,
    state: new StateTracker(dbPath),
  };
}

function executionInput(
  patch: Partial<SubstrateFederatedLocalDevnetGenesisExecutionInput> = {},
): SubstrateFederatedLocalDevnetGenesisExecutionInput {
  return {
    role: 'tracker',
    planDigestHex: PLAN_DIGEST,
    targetGenesisHeaderIdHex: GENESIS_HEADER_ID,
    expectedTxId: EXPECTED_TX_ID,
    sourceBoxId: SOURCE_BOX_ID,
    inputBoxIds: [SOURCE_BOX_ID, FEE_BOX_ID],
    attemptedAtHeight: 720,
    nodeOrigin: SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_PRIMARY_ORIGIN,
    unsignedTransaction: Object.freeze({
      inputs: [
        { boxId: SOURCE_BOX_ID },
        { boxId: FEE_BOX_ID },
      ],
    }),
    ...patch,
  };
}

function confirmed(
  patch: Partial<SubstrateFederatedLocalDevnetGenesisConfirmation> = {},
): SubstrateFederatedLocalDevnetGenesisConfirmation {
  return {
    status: 'confirmed',
    confirmations: 10,
    observedAtHeight: 731,
    observationDigestHex: CONFIRMATION_DIGEST,
    confirmationHeight: 721,
    confirmationHeaderIdHex: CONFIRMATION_HEADER_ID,
    observerArtifact: OBSERVER_ARTIFACT,
    ...patch,
  };
}

function pending(): SubstrateFederatedLocalDevnetGenesisConfirmation {
  return {
    status: 'pending',
    confirmations: 2,
    observedAtHeight: 723,
    observationDigestHex: CONFIRMATION_DIGEST,
    confirmationHeight: null,
    confirmationHeaderIdHex: null,
    observerArtifact: OBSERVER_ARTIFACT,
  };
}

function notFound(): SubstrateFederatedLocalDevnetGenesisConfirmation {
  return {
    status: 'not_found',
    confirmations: 0,
    observedAtHeight: 731,
    observationDigestHex: CONFIRMATION_DIGEST,
    confirmationHeight: null,
    confirmationHeaderIdHex: null,
    observerArtifact: OBSERVER_ARTIFACT,
  };
}

function observer(
  value: SubstrateFederatedLocalDevnetGenesisConfirmation | null,
): Readonly<{
  readonly schema:
    'e2s.substrate-federated-isolated-devnet-genesis-confirmation-observer.v1';
  readonly reconciliationIdentityDigestHex: string;
  readonly observe:
    SubstrateFederatedLocalDevnetGenesisExecutionPorts['confirmationObserver']['observe'];
}> {
  return {
    schema:
      'e2s.substrate-federated-isolated-devnet-genesis-confirmation-observer.v1',
    reconciliationIdentityDigestHex: RECONCILIATION_IDENTITY,
    observe: vi.fn(async () => value),
  };
}

function ports(
  journal: SubstrateFederatedLocalDevnetGenesisExecutionPorts['journal'],
  options: Readonly<{
    confirmation?: SubstrateFederatedLocalDevnetGenesisConfirmation | null;
    transportResult?: 'accepted' | 'rejected' | 'ambiguous';
    onSubmit?: () => void;
  }> = {},
): SubstrateFederatedLocalDevnetGenesisExecutionPorts {
  return {
    signer: {
      sign: async () => ({
        signedTransactionDigestHex: SIGNED_DIGEST,
        signerArtifact: Object.freeze({ stage: 'signed' }),
      }),
    },
    checker: {
      check: async () => ({
        checkResponseDigestHex: CHECK_DIGEST,
        checkerArtifact: Object.freeze({ stage: 'checked' }),
      }),
    },
    revalidator: {
      revalidate: async (_checked, phase) => ({
        sourceBoxId: SOURCE_BOX_ID,
        sourceBoxUnspent: true,
        targetGenesisHeaderIdHex: GENESIS_HEADER_ID,
        observedAtHeight: phase === 'post-check' ? 720 : 721,
        observedTipHeaderIdHex: '91'.repeat(32),
        sourceBoxDigestHex: '92'.repeat(32),
        sourceBoxSigmaSerializedSha256Hex: '93'.repeat(32),
        observationDigestHex: phase === 'post-check'
          ? POST_CHECK_DIGEST
          : PRE_TRANSPORT_DIGEST,
        revalidationArtifact: Object.freeze({ phase }),
      }),
    },
    broadcastAuthorizer: {
      authorize: () => ({
        authorizationDigestHex: AUTHORIZATION_DIGEST,
        authorizationArtifact: Object.freeze({ stage: 'authorized' }),
      }),
    },
    journal,
    transport: {
      submit: async () => {
        options.onSubmit?.();
        if (options.transportResult === 'ambiguous') {
          return {
            status: 'ambiguous',
            submittedTxId: null,
            responseDigestHex: null,
          };
        }
        if (options.transportResult === 'rejected') {
          return {
            status: 'rejected',
            submittedTxId: null,
            responseDigestHex: RESPONSE_DIGEST,
          };
        }
        return {
          status: 'accepted',
          submittedTxId: EXPECTED_TX_ID,
          responseDigestHex: RESPONSE_DIGEST,
        };
      },
    },
    confirmationObserver: observer(
      Object.hasOwn(options, 'confirmation')
        ? options.confirmation ?? null
        : confirmed(),
    ),
  };
}

function createJournal(state: StateTracker, markerDirectory: string) {
  return createSubstrateFederatedLocalDevnetGenesisJournalV1({
    state,
    markerDirectory,
    reconciliationIdentityDigestHex: RECONCILIATION_IDENTITY,
  });
}

describe('substrate federated local-devnet genesis journal V1', () => {
  it('persists an exact accepted attempt before transport and survives restart', async () => {
    const run = campaign();
    let state = run.state;
    try {
      const adapter = createJournal(state, run.markerDirectory);
      let cloneRejected = false;
      const journal: SubstrateFederatedLocalDevnetGenesisExecutionPorts['journal'] = {
        ...adapter.journal,
        reserve: candidate => {
          expect(() => adapter.journal.reserve({ ...candidate }))
            .toThrow(/lacks process provenance/);
          cloneRejected = true;
          return adapter.journal.reserve(candidate);
        },
      };
      let persistedBeforeTransport = false;

      await expect(executeSubstrateFederatedLocalDevnetGenesisV1(
        executionInput(),
        ports(journal, {
          onSubmit: () => {
            persistedBeforeTransport =
              state.getActiveErgoOperationalTransactionAttempts(
                SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
              ).length === 1;
          },
        }),
      )).resolves.toMatchObject({
        status: 'accepted',
        confirmationStatus: 'confirmed',
      });
      expect(cloneRejected).toBe(true);
      expect(persistedBeforeTransport).toBe(true);
      expect(state.getConfirmedErgoOperationalTransactionAttempts(
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
      )).toEqual([
        expect.objectContaining({
          expectedTxId: EXPECTED_TX_ID,
          sourceBoxId: SOURCE_BOX_ID,
          inputBoxIds: [SOURCE_BOX_ID, FEE_BOX_ID],
          status: 'confirmed',
        }),
      ]);

      state.close();
      state = new StateTracker(run.dbPath);
      const restarted = createJournal(state, run.markerDirectory);
      await expect(restarted.revalidateConfirmed(observer(confirmed())))
        .resolves.toBe(1);
    } finally {
      state.close();
    }
  });

  it('reconciles a crash after reservation without blind replacement', async () => {
    const run = campaign();
    let state = run.state;
    try {
      const adapter = createJournal(state, run.markerDirectory);
      const crashingJournal: SubstrateFederatedLocalDevnetGenesisExecutionPorts['journal'] = {
        ...adapter.journal,
        reserve: candidate => {
          adapter.journal.reserve(candidate);
          throw new Error('synthetic process crash after reservation');
        },
      };
      const submit = vi.fn();

      await expect(executeSubstrateFederatedLocalDevnetGenesisV1(
        executionInput(),
        ports(crashingJournal, { onSubmit: submit }),
      )).rejects.toThrow(/synthetic process crash/);
      expect(submit).not.toHaveBeenCalled();
      expect(state.getActiveErgoOperationalTransactionAttempts(
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
      )).toEqual([
        expect.objectContaining({ status: 'pending' }),
      ]);

      state.close();
      state = new StateTracker(run.dbPath);
      const restarted = createJournal(state, run.markerDirectory);
      await expect(restarted.reconcileActive(observer(pending())))
        .rejects.toThrow(/unresolved.*no replacement transaction/u);
      await expect(executeSubstrateFederatedLocalDevnetGenesisV1(
        executionInput({ expectedTxId: hex('10') }),
        ports(restarted.journal),
      )).rejects.toThrow(/must be reconciled before replacement/);
      await expect(restarted.reconcileActive(observer(confirmed())))
        .resolves.toBe('confirmed');
      expect(state.getActiveErgoOperationalTransactionAttempts(
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
      )).toEqual([]);
    } finally {
      state.close();
    }
  });

  it('reconciles an unknown effect after transport without submitting again', async () => {
    const run = campaign();
    let state = run.state;
    try {
      const adapter = createJournal(state, run.markerDirectory);
      const crashingFinalize: SubstrateFederatedLocalDevnetGenesisExecutionPorts['journal'] = {
        ...adapter.journal,
        finalize: () => {
          throw new Error('synthetic process crash after transport');
        },
      };
      const submit = vi.fn();

      await expect(executeSubstrateFederatedLocalDevnetGenesisV1(
        executionInput(),
        ports(crashingFinalize, { onSubmit: submit }),
      )).rejects.toThrow(/synthetic process crash after transport/);
      expect(submit).toHaveBeenCalledTimes(1);
      expect(state.getActiveErgoOperationalTransactionAttempts(
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
      )).toEqual([expect.objectContaining({ status: 'pending' })]);

      state.close();
      state = new StateTracker(run.dbPath);
      const restarted = createJournal(state, run.markerDirectory);
      await expect(restarted.reconcileActive(observer(confirmed())))
        .resolves.toBe('confirmed');
      expect(state.getConfirmedErgoOperationalTransactionAttempts(
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
      )).toHaveLength(1);
    } finally {
      state.close();
    }
  });

  it('retains an ambiguous result across restart until exact confirmation', async () => {
    const run = campaign();
    let state = run.state;
    try {
      const adapter = createJournal(state, run.markerDirectory);
      await expect(executeSubstrateFederatedLocalDevnetGenesisV1(
        executionInput(),
        ports(adapter.journal, {
          transportResult: 'ambiguous',
          confirmation: null,
        }),
      )).resolves.toMatchObject({
        status: 'ambiguous',
        confirmationStatus: 'unavailable',
      });
      state.close();

      state = new StateTracker(run.dbPath);
      const restarted = createJournal(state, run.markerDirectory);
      await expect(restarted.reconcileActive(observer(pending())))
        .rejects.toThrow(/unresolved.*no replacement transaction/u);
      await expect(restarted.reconcileActive(observer(confirmed())))
        .resolves.toBe('confirmed');
    } finally {
      state.close();
    }
  });

  it('durably classifies a definitive rejection without claiming submission', async () => {
    const run = campaign();
    let state = run.state;
    try {
      const adapter = createJournal(state, run.markerDirectory);
      await expect(executeSubstrateFederatedLocalDevnetGenesisV1(
        executionInput(),
        ports(adapter.journal, {
          transportResult: 'rejected',
          confirmation: notFound(),
        }),
      )).resolves.toMatchObject({
        status: 'rejected',
        submittedTxId: null,
        confirmationStatus: 'not_found',
      });
      expect(state.getErgoOperationalTransactionAttempts(
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
      )).toEqual([
        expect.objectContaining({
          status: 'abandoned',
          submissionDisposition: null,
          submittedTxId: null,
          responseDigestHex: RESPONSE_DIGEST,
          abandonmentReason:
            ERGO_OPERATIONAL_DEFINITIVE_TRANSPORT_REJECTION_REASON,
        }),
      ]);
      expect(() => state.confirmErgoOperationalTransactionAttempt({
        expectedTxId: EXPECTED_TX_ID,
        confirmationHeight: 722,
        confirmationHeaderId: CONFIRMATION_HEADER_ID,
      })).toThrow(/definitively rejected.*requires quarantine/);

      state.close();
      state = new StateTracker(run.dbPath);
      const restarted = createJournal(state, run.markerDirectory);
      await expect(restarted.revalidateConfirmed(observer(notFound())))
        .resolves.toBe(0);
      await expect(restarted.revalidateConfirmed(observer(confirmed())))
        .rejects.toThrow(/definitively rejected.*appeared on-chain/);
      expect(state.getErgoOperationalTransactionAttempts(
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
      )[0]).toMatchObject({
        status: 'quarantined',
        quarantineReason: expect.stringMatching(/appeared on-chain/),
      });
    } finally {
      state.close();
    }
  });

  it('fails closed when SQLite is lost but the create-only marker remains', async () => {
    const run = campaign();
    let state = run.state;
    try {
      const adapter = createJournal(state, run.markerDirectory);
      const crashingJournal: SubstrateFederatedLocalDevnetGenesisExecutionPorts['journal'] = {
        ...adapter.journal,
        reserve: candidate => {
          adapter.journal.reserve(candidate);
          throw new Error('synthetic process crash after reservation');
        },
      };
      await expect(executeSubstrateFederatedLocalDevnetGenesisV1(
        executionInput(),
        ports(crashingJournal),
      )).rejects.toThrow(/synthetic process crash/);

      state.close();
      rmSync(run.dbPath, { force: true });
      rmSync(`${run.dbPath}-wal`, { force: true });
      rmSync(`${run.dbPath}-shm`, { force: true });
      state = new StateTracker(run.dbPath);
      expect(() => createJournal(state, run.markerDirectory))
        .toThrow(/marker\/SQLite continuity differs/);
    } finally {
      state.close();
    }
  });

  it('rejects marker corruption on restart', async () => {
    const run = campaign();
    let state = run.state;
    try {
      const adapter = createJournal(state, run.markerDirectory);
      await executeSubstrateFederatedLocalDevnetGenesisV1(
        executionInput(),
        ports(adapter.journal, { confirmation: pending() }),
      );
      state.close();

      const markerPath = join(run.markerDirectory, `${EXPECTED_TX_ID}.json`);
      const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as Record<
        string,
        unknown
      >;
      delete marker.markerDigestHex;
      marker.role = 'pooledReserve';
      marker.markerDigestHex = sha256CanonicalJson(
        marker,
        'E2S_SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_ATTEMPT_MARKER_V1',
      );
      writeFileSync(markerPath, `${canonicalJson(marker)}\n`, 'utf8');

      state = new StateTracker(run.dbPath);
      expect(() => createJournal(state, run.markerDirectory))
        .toThrow(/marker admission binding is invalid/);
    } finally {
      state.close();
    }
  });

  it('quarantines a confirmed attempt when canonical inclusion disappears', async () => {
    const run = campaign();
    const state = run.state;
    try {
      const adapter = createJournal(state, run.markerDirectory);
      await executeSubstrateFederatedLocalDevnetGenesisV1(
        executionInput(),
        ports(adapter.journal),
      );

      await expect(adapter.revalidateConfirmed(observer(notFound())))
        .rejects.toThrow(/lost canonical inclusion/);
      expect(state.getErgoOperationalTransactionAttempts(
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
      )).toEqual([
        expect.objectContaining({
          expectedTxId: EXPECTED_TX_ID,
          status: 'quarantined',
        }),
      ]);
      expect(() => createJournal(state, run.markerDirectory))
        .toThrow(/requires reviewed recovery/);
    } finally {
      state.close();
    }
  });

  it('rebinds the exact confirmed transaction after a canonical block move', async () => {
    const run = campaign();
    const state = run.state;
    try {
      const adapter = createJournal(state, run.markerDirectory);
      await executeSubstrateFederatedLocalDevnetGenesisV1(
        executionInput(),
        ports(adapter.journal),
      );
      const movedHeader = hex('20');

      await expect(adapter.revalidateConfirmed(observer(confirmed({
        observedAtHeight: 809,
        confirmationHeight: 799,
        confirmationHeaderIdHex: movedHeader,
      })))).resolves.toBe(1);
      expect(state.getConfirmedErgoOperationalTransactionAttempts(
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
      )).toEqual([
        expect.objectContaining({
          expectedTxId: EXPECTED_TX_ID,
          confirmationHeight: 799,
          confirmationHeaderId: movedHeader,
        }),
      ]);
    } finally {
      state.close();
    }
  });

  it('never reuses a historically journaled input under a new transaction ID', async () => {
    const run = campaign();
    const state = run.state;
    try {
      const adapter = createJournal(state, run.markerDirectory);
      await executeSubstrateFederatedLocalDevnetGenesisV1(
        executionInput(),
        ports(adapter.journal),
      );

      await expect(executeSubstrateFederatedLocalDevnetGenesisV1(
        executionInput({ expectedTxId: hex('30') }),
        ports(adapter.journal),
      )).rejects.toThrow(/cannot reuse an input from durable history/);
      expect(state.getErgoOperationalTransactionAttempts(
        SUBSTRATE_FEDERATED_LOCAL_DEVNET_GENESIS_OPERATION_PROFILE,
      )).toHaveLength(1);
    } finally {
      state.close();
    }
  });
});
