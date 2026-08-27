import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  target: Object.freeze({
    primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052',
    primaryMining: false,
    witnessReadOnly: true,
    miningStopped: true,
    checkpointBound: true,
    reservationFreshnessCheckBound: true,
    trackerTransport: true,
  }),
  processBindingDigestHex: '41'.repeat(32),
  executionTargetIdentityDigestHex: '42'.repeat(32),
  trackerInputBoxIdHex: '0c'.repeat(32),
  transactionIdHex: '0d'.repeat(32),
  inputBoxIdsHex: Object.freeze(['0c'.repeat(32), '0e'.repeat(32)]),
  signedTransactionDigestHex: '51'.repeat(32),
  signedTransactionBytesSha256Hex: '52'.repeat(32),
  checkResponseDigestHex: '53'.repeat(32),
  freshnessReceiptDigestHex: '54'.repeat(32),
  signedCandidate: Object.freeze({
    txId: '0d'.repeat(32),
    signedTransactionDigestHex: '51'.repeat(32),
    signedTransactionBytesSha256Hex: '52'.repeat(32),
    signedTransactionBytesLength: 226_795,
  }),
  handle: Object.freeze({
    txId: '0d'.repeat(32),
    signedTransactionDigestHex: '51'.repeat(32),
    signedTransactionBytesSha256Hex: '52'.repeat(32),
    signedTransactionBytesLength: 226_795,
    checkResponseDigestHex: '53'.repeat(32),
  }),
  requestBinding: Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-bootstrap-request-campaign-binding.v1',
    version: 1 as const,
    requestSha256Hex: 'bc'.repeat(32),
  }),
  relayerLineage: Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-packet-relayer-lineage.v1',
    version: 1 as const,
    headCommitSha1Hex: 'ab'.repeat(20),
    relayerArtifactSetDigestHex: 'cd'.repeat(32),
    packetReceiptDigestHex: 'de'.repeat(32),
  }),
  requestBindingConsumed: false,
  relayerLineageConsumed: false,
}));

vi.mock('../../fleet-signer.js', () => ({
  projectLocalWasmSignedCheckInputBoxIdsV1: (value: unknown) => {
    if (value !== fixture.signedCandidate) {
      throw new Error('synthetic signed candidate provenance is absent');
    }
    return fixture.inputBoxIdsHex;
  },
}));

vi.mock(
  '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV1:
      (value: unknown) => {
        if (value !== fixture.target) {
          throw new Error('synthetic tracker transport target is absent');
        }
        return Object.freeze({
          processBindingDigestHex: fixture.processBindingDigestHex,
          executionTargetIdentityDigestHex:
            fixture.executionTargetIdentityDigestHex,
          reservationFreshnessProcessBindingDigestHex: '43'.repeat(32),
          reservationFreshnessExecutionTargetIdentityDigestHex:
            '44'.repeat(32),
        });
      },
  }),
);

vi.mock(
  '../../substrate-federated-isolated-devnet-setup-check-execution-v2.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetTrackerTransportExecutionCheckV1:
      (value: unknown, target: unknown) => {
        if (
          value !== syntheticExecutionCheck
          || target !== fixture.target
        ) {
          throw new Error('synthetic tracker execution check is absent');
        }
        return Object.freeze({
          processBindingDigestHex: fixture.processBindingDigestHex,
          executionTargetIdentityDigestHex:
            fixture.executionTargetIdentityDigestHex,
          reservationFreshnessProcessBindingDigestHex: '43'.repeat(32),
          reservationFreshnessExecutionTargetIdentityDigestHex:
            '44'.repeat(32),
        });
      },
  }),
);

vi.mock(
  './substrate-federated-isolated-devnet-tracker-admission-reservation-authorization-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1Provenance:
      (value: unknown) => {
        if (value !== syntheticDurableReservation) {
          throw new Error('synthetic durable reservation provenance is absent');
        }
      },
    assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1PersistenceStore:
      (value: unknown) => {
        if (value !== syntheticDurableReservation) {
          throw new Error('synthetic reservation persistence binding is absent');
        }
      },
  }),
);

vi.mock(
  '../../adapters/substrate-federated-isolated-devnet-bootstrap-request-binding-v1.js',
  () => ({
    projectSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingDigestV1:
      (value: unknown) => {
        if (value !== fixture.requestBinding || fixture.requestBindingConsumed) {
          throw new Error(
            'synthetic bootstrap request campaign binding lacks fresh process provenance',
          );
        }
        return fixture.requestBinding.requestSha256Hex;
      },
    consumeSubstrateFederatedIsolatedDevnetBootstrapRequestCampaignBindingV1:
      (value: unknown) => {
        if (value !== fixture.requestBinding || fixture.requestBindingConsumed) {
          throw new Error(
            'synthetic bootstrap request campaign binding lacks fresh process provenance',
          );
        }
        fixture.requestBindingConsumed = true;
        return fixture.requestBinding.requestSha256Hex;
      },
  }),
);

vi.mock(
  '../../substrate-federated-isolated-devnet-packet-producer-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1:
      (value: unknown) => {
        if (
          value !== fixture.relayerLineage
          || fixture.relayerLineageConsumed
        ) {
          throw new Error(
            'synthetic packet relayer lineage lacks process provenance',
          );
        }
      },
    consumeSubstrateFederatedIsolatedDevnetPacketRelayerLineageV1:
      (value: unknown) => {
        if (
          value !== fixture.relayerLineage
          || fixture.relayerLineageConsumed
        ) {
          throw new Error(
            'synthetic packet relayer lineage lacks process provenance',
          );
        }
        fixture.relayerLineageConsumed = true;
        return fixture.relayerLineage;
      },
  }),
);

import { StateTracker } from '../../state-tracker.js';
import {
  assertSubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1,
  authorizeSubstrateFederatedIsolatedDevnetTrackerTransportV1,
  claimSubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1,
  consumeSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1,
  createSubstrateFederatedIsolatedDevnetTrackerTransportJournalV1,
  createSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1,
  issueSubstrateFederatedIsolatedDevnetTrackerTransportResultV1,
} from './substrate-federated-isolated-devnet-tracker-transport-attempt-v1.js';

let syntheticExecutionCheck: any;
let syntheticDurableReservation: any;

beforeEach(() => {
  fixture.requestBindingConsumed = false;
  fixture.relayerLineageConsumed = false;
  syntheticExecutionCheck = Object.freeze({
    receipt: Object.freeze({
      unsignedTransactionIdHex: fixture.transactionIdHex,
      signedTransactionIdHex: fixture.transactionIdHex,
      trackerInputBoxIdHex: fixture.trackerInputBoxIdHex,
      signedTransactionBytesSha256Hex:
        fixture.signedTransactionBytesSha256Hex,
      signedTransactionBytesLength: 226_795,
      receiptDigestHex: fixture.freshnessReceiptDigestHex,
      signer: Object.freeze({ stateContextTipHeight: 123 }),
    }),
    signedCandidate: fixture.signedCandidate,
    checkedAcceptance: Object.freeze({
      submissionHandle: fixture.handle,
    }),
  });
});

describe('isolated tracker transport authorization and durable attempt V1', () => {
  it('binds exact checked material, persists before claim, and finalizes accepted', () => {
    withState((state, reservation) => {
      syntheticDurableReservation = durableReceipt(reservation);
      const authorization = authorize();
      expect(authorization).toMatchObject({
        expectedTransactionIdHex: fixture.transactionIdHex,
        inputBoxIdsHex: fixture.inputBoxIdsHex,
        attemptedAtHeight: 123,
        processBindingDigestHex: fixture.processBindingDigestHex,
        executionTargetIdentityDigestHex:
          fixture.executionTargetIdentityDigestHex,
      });
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1(
          structuredClone(authorization),
          fixture.target as any,
          syntheticExecutionCheck,
        )
      ).toThrow(/lacks exact provenance|binding changed/);

      const journal = createJournal(state);
      const attempt = journal.reserve(authorization);
      const preflight = createPreflight(journal, attempt, authorization);
      expect(preflight).toMatchObject({
        headCommitSha1Hex: 'ab'.repeat(20),
        requestSha256Hex: 'bc'.repeat(32),
        relayerArtifactSetDigestHex: 'cd'.repeat(32),
        packetReceiptDigestHex: 'de'.repeat(32),
        executionTargetIdentityDigestHex:
          fixture.executionTargetIdentityDigestHex,
        expectedTransactionIdHex: fixture.transactionIdHex,
        durableAttemptDigestHex: attempt.durableAttemptDigestHex,
        authorizationDigestHex: authorization.authorizationDigestHex,
        boundaries: {
          transportPerformed: false,
          trackerAdmissionEstablished: false,
          publicNetworkUsed: false,
          gate5Closed: false,
        },
      });
      expect(JSON.stringify(preflight)).not.toMatch(
        /(?:signedTransactionBytes|privateKey|mnemonic|[A-Za-z]:[\\/])/u,
      );
      expect(() => createPreflight(journal, attempt, authorization)).toThrow(
        /not eligible for a fresh preflight/,
      );
      expect(() =>
        consumeSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1(
          structuredClone(preflight),
          preflightBinding(journal, attempt, authorization),
        )
      ).toThrow(/lacks fresh process provenance/);
      expect(
        state.getSubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1(
          reservation.reservationIdentityHex,
        ),
      ).toMatchObject({ status: 'pending' });
      expect(() =>
        issueSubstrateFederatedIsolatedDevnetTrackerTransportResultV1(
          journal,
          attempt,
          {
            status: 'accepted',
            submittedTransactionIdHex: fixture.transactionIdHex,
            responseDigestHex: '61'.repeat(32),
          },
        )
      ).toThrow(/was not claimed/);
      const persisted =
        claimSubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1(
          journal,
          attempt,
          authorization,
        );
      expect(persisted.durableAttemptDigestHex)
        .toBe(attempt.durableAttemptDigestHex);
      consumeSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1(
        preflight,
        preflightBinding(journal, attempt, authorization),
      );
      expect(() =>
        consumeSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1(
          preflight,
          preflightBinding(journal, attempt, authorization),
        )
      ).toThrow(/lacks fresh process provenance/);
      expect(() =>
        claimSubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1(
          journal,
          attempt,
          authorization,
        )
      ).toThrow(/already claimed/);

      expect(() => journal.finalize(attempt, {
        status: 'accepted',
        submittedTransactionIdHex: fixture.transactionIdHex,
        responseDigestHex: '61'.repeat(32),
        resultArtifact: Object.freeze({
          schema:
            'e2s.substrate-federated-isolated-devnet-tracker-transport-outcome.v1',
          expectedTransactionIdHex: fixture.transactionIdHex,
        }),
      })).toThrow(/lacks exact provenance|binding changed/);
      const result = issueSubstrateFederatedIsolatedDevnetTrackerTransportResultV1(
        journal,
        attempt,
        {
          status: 'accepted',
          submittedTransactionIdHex: fixture.transactionIdHex,
          responseDigestHex: '61'.repeat(32),
        },
      );
      const outcome = journal.finalize(attempt, result);
      expect(outcome).toMatchObject({
        status: 'accepted',
        submittedTransactionIdHex: fixture.transactionIdHex,
        trackerAdmissionEstablished: false,
      });
      expect(outcome.outcomeDigestHex).toMatch(/^[0-9a-f]{64}$/u);
    });
  });

  it('refuses duplicate authorization, target copies, and any second durable POST claim', () => {
    withState((state, reservation) => {
      syntheticDurableReservation = durableReceipt(reservation);
      const authorization = authorize();
      expect(() => authorize()).toThrow(/already authorized/);
      expect(() =>
        assertSubstrateFederatedIsolatedDevnetTrackerTransportAuthorizationV1(
          authorization,
          { ...fixture.target } as any,
          syntheticExecutionCheck,
        )
      ).toThrow(/synthetic tracker transport target is absent/);

      const firstJournal = createJournal(state);
      firstJournal.reserve(authorization);
      const reopenedJournal = createJournal(state);
      expect(() => reopenedJournal.reserve(authorization)).toThrow(
        /already exists; reconcile before any POST/,
      );
    });
  });

  it('persists an ambiguous transport outcome without claiming admission', () => {
    withState((state, reservation) => {
      syntheticDurableReservation = durableReceipt(reservation);
      const authorization = authorize();
      const journal = createJournal(state);
      const attempt = journal.reserve(authorization);
      claimSubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1(
        journal,
        attempt,
        authorization,
      );
      const result = issueSubstrateFederatedIsolatedDevnetTrackerTransportResultV1(
        journal,
        attempt,
        {
          status: 'ambiguous',
          submittedTransactionIdHex: null,
          responseDigestHex: '62'.repeat(32),
        },
      );
      expect(journal.finalize(attempt, result)).toMatchObject({
        status: 'ambiguous',
        submittedTransactionIdHex: null,
        trackerAdmissionEstablished: false,
      });
    });
  });

  it('rejects copied request or packet lineage before a preflight exists', () => {
    withState((state, reservation) => {
      syntheticDurableReservation = durableReceipt(reservation);
      const authorization = authorize();
      const journal = createJournal(state);
      const attempt = journal.reserve(authorization);
      expect(() =>
        createSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1({
          ...preflightBinding(journal, attempt, authorization),
          requestBinding: structuredClone(fixture.requestBinding),
          relayerLineage: fixture.relayerLineage,
        })
      ).toThrow(/request campaign binding lacks fresh process provenance/);
      expect(() =>
        createSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1({
          ...preflightBinding(journal, attempt, authorization),
          requestBinding: fixture.requestBinding,
          relayerLineage: structuredClone(fixture.relayerLineage),
        })
      ).toThrow(/packet relayer lineage lacks process provenance/);
    });
  });

  it('rejects a durable state change after claim and before preflight consumption', () => {
    withState((state, reservation) => {
      syntheticDurableReservation = durableReceipt(reservation);
      const authorization = authorize();
      const journal = createJournal(state);
      const attempt = journal.reserve(authorization);
      const preflight = createPreflight(journal, attempt, authorization);
      claimSubstrateFederatedIsolatedDevnetTrackerTransportDurableAttemptV1(
        journal,
        attempt,
        authorization,
      );
      state.finalizeSubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1({
        expectedTransactionIdHex: attempt.expectedTransactionIdHex,
        durableAttemptDigestHex: attempt.durableAttemptDigestHex,
        disposition: 'ambiguous',
        submittedTransactionIdHex: null,
        responseDigestHex: '63'.repeat(32),
      });

      expect(() =>
        consumeSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1(
          preflight,
          preflightBinding(journal, attempt, authorization),
        )
      ).toThrow(/durable state changed/);
    });
  });
});

function authorize() {
  return authorizeSubstrateFederatedIsolatedDevnetTrackerTransportV1({
    executionCheck: syntheticExecutionCheck,
    target: fixture.target as any,
    durableReservation: syntheticDurableReservation,
  });
}

function createJournal(state: StateTracker) {
  return createSubstrateFederatedIsolatedDevnetTrackerTransportJournalV1({
    state,
    durableReservation: syntheticDurableReservation,
  });
}

function preflightBinding(
  journal: ReturnType<typeof createJournal>,
  attempt: ReturnType<ReturnType<typeof createJournal>['reserve']>,
  authorization: ReturnType<typeof authorize>,
) {
  return {
    target: fixture.target as any,
    executionCheck: syntheticExecutionCheck,
    authorization,
    journal,
    attempt,
  };
}

function createPreflight(
  journal: ReturnType<typeof createJournal>,
  attempt: ReturnType<ReturnType<typeof createJournal>['reserve']>,
  authorization: ReturnType<typeof authorize>,
) {
  return createSubstrateFederatedIsolatedDevnetTrackerTransportPreflightV1({
    ...preflightBinding(journal, attempt, authorization),
    requestBinding: fixture.requestBinding,
    relayerLineage: fixture.relayerLineage,
  });
}

function durableReceipt(
  reservation: ReturnType<
    StateTracker['reserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1']
  >['reservation'],
) {
  return Object.freeze({
    reservationIdentityHex: reservation.reservationIdentityHex,
    durableReservationDigestHex: reservation.durableReservationDigestHex,
    bindings: Object.freeze({
      unsignedTransactionIdHex: fixture.transactionIdHex,
      trackerInputBoxIdHex: fixture.trackerInputBoxIdHex,
    }),
  });
}

function withState(
  run: (
    state: StateTracker,
    reservation: ReturnType<
      StateTracker['reserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1']
    >['reservation'],
  ) => void,
): void {
  const root = mkdtempSync(join(tmpdir(), 'tracker-transport-attempt-test-'));
  const state = new StateTracker(join(root, 'state-store'));
  try {
    const reservation = state
      .reserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1({
        reservationIdentityHex: '01'.repeat(32),
        operationProfileDigestHex: '02'.repeat(32),
        rootReceiptDigestHex: '03'.repeat(32),
        authorizationDigestHex: '04'.repeat(32),
        sourceProfileDigestHex: '05'.repeat(32),
        trackerSetupDigestHex: '06'.repeat(32),
        checkpointAnchorDigestHex: '07'.repeat(32),
        frozenTargetDigestHex: '08'.repeat(32),
        trackerCandidateDigestHex: '09'.repeat(32),
        jvmCheckDigestHex: '0a'.repeat(32),
        statementIdHex: '0b'.repeat(32),
        trackerInputBoxIdHex: fixture.trackerInputBoxIdHex,
        unsignedTransactionIdHex: fixture.transactionIdHex,
        anchorHeaderIdHex: '0f'.repeat(32),
        targetIdentityDigestHex: '10'.repeat(32),
      }).reservation;
    run(state, reservation);
  } finally {
    state.close();
    rmSync(root, { recursive: true, force: true });
  }
}
