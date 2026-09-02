import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1,
  createSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1,
} from '../../adapters/substrate-federated-isolated-devnet-tracker-transport-response-v1.js';

const fixture = vi.hoisted(() => ({
  target: Object.freeze({
    primaryNodeOrigin: 'http://127.0.0.1:9051',
    witnessNodeOrigin: 'http://127.0.0.1:9052',
    primaryMining: true,
    witnessReadOnly: true,
    checkpointBound: true,
    reservationFreshnessCheckBound: true,
    trackerTransport: true,
    sameProcessCanonicalConfirmation: true,
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
    profile: 'synthetic-fresh-signed-candidate',
    txId: '0d'.repeat(32),
    nodeOrigin: 'http://127.0.0.1:9051',
    signedTransactionDigestHex: '51'.repeat(32),
    signedTransactionBytesSha256Hex: '52'.repeat(32),
    signedTransactionBytesLength: 226_795,
    signerContext: Object.freeze({ profile: 'synthetic-fresh-signer' }),
  }),
  handle: Object.freeze({
    profile: 'e2s.local-wasm-checked-submission-handle.v1',
    txId: '0d'.repeat(32),
    nodeOrigin: 'http://127.0.0.1:9051',
    signedTransactionDigestHex: '51'.repeat(32),
    signedTransactionBytesSha256Hex: '52'.repeat(32),
    signedTransactionBytesLength: 226_795,
    checkResponseDigestHex: '53'.repeat(32),
    checkerIdentity: Object.freeze({ profile: 'synthetic-checker' }),
  }),
  signedTransaction: Object.freeze({
    id: '0d'.repeat(32),
    inputs: Object.freeze([
      Object.freeze({ boxId: '0c'.repeat(32) }),
      Object.freeze({ boxId: '0e'.repeat(32) }),
    ]),
    proofs: Object.freeze(['fresh-opaque-proof']),
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
  handleConsumed: false,
  transportEvents: [] as string[],
}));

const node = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock('../../fleet-signer.js', () => ({
  projectLocalWasmSignedCheckInputBoxIdsV1: (value: unknown) => {
    if (value !== fixture.signedCandidate) {
      throw new Error('synthetic signed candidate provenance is absent');
    }
    return fixture.inputBoxIdsHex;
  },
  assertLocalWasmSignedCheckCandidateProvenance: (value: unknown) => {
    if (value !== fixture.signedCandidate) {
      throw new Error('synthetic signed candidate provenance is absent');
    }
  },
  assertLocalWasmCheckedSubmissionHandleV1Provenance: (value: unknown) => {
    if (value !== fixture.handle || fixture.handleConsumed) {
      throw new Error('synthetic checked handle provenance is absent');
    }
  },
  assertLocalWasmCheckedSubmissionHandleV1ExecutionBinding: (
    value: unknown,
    binding: Readonly<{
      processBindingDigestHex: string;
      executionTargetIdentityDigestHex: string;
    }>,
  ) => {
    if (
      value !== fixture.handle
      || Object.keys(binding).sort().join(',')
        !== 'executionTargetIdentityDigestHex,processBindingDigestHex'
      || binding.processBindingDigestHex !== fixture.processBindingDigestHex
      || binding.executionTargetIdentityDigestHex
        !== fixture.executionTargetIdentityDigestHex
    ) {
      throw new Error('synthetic checked handle execution binding changed');
    }
  },
  consumeLocalWasmCheckedSubmissionHandleV1: async (
    handle: unknown,
    signedCandidate: unknown,
    consume: (signedTransaction: Readonly<Record<string, unknown>>) =>
      Promise<unknown>,
  ) => {
    if (
      handle !== fixture.handle
      || signedCandidate !== fixture.signedCandidate
      || fixture.handleConsumed
    ) {
      throw new Error('synthetic checked submission material is absent');
    }
    fixture.handleConsumed = true;
    fixture.transportEvents.push('consume');
    return await consume(fixture.signedTransaction);
  },
}));

vi.mock('axios', () => ({
  default: {
    post: node.post,
    isAxiosError: (error: unknown) =>
      typeof error === 'object'
      && error !== null
      && (error as { isAxiosError?: unknown }).isAxiosError === true,
  },
}));

vi.mock(
  '../../substrate-federated-isolated-devnet-ergo-node-process-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV2:
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
  projectSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1,
} from './substrate-federated-isolated-devnet-tracker-transport-attempt-v1.js';
import {
  submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1,
} from './substrate-federated-isolated-devnet-tracker-checked-transport-v1.js';

let syntheticExecutionCheck: any;
let syntheticDurableReservation: any;

beforeEach(() => {
  fixture.requestBindingConsumed = false;
  fixture.relayerLineageConsumed = false;
  fixture.handleConsumed = false;
  fixture.transportEvents.length = 0;
  node.post.mockReset();
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
  it('composes fresh checked bytes through durable accepted transport', async () => {
    await withAsyncState(async (state, reservation) => {
      syntheticDurableReservation = durableReceipt(reservation);
      const authorization = authorize();
      const journal = createJournal(state);
      const attempt = journal.reserve(authorization);
      const preflight = createPreflight(journal, attempt, authorization);
      node.post.mockImplementation(async (url, signedTransaction) => {
        expect(url).toBe('http://127.0.0.1:9051/transactions');
        expect(signedTransaction).toBe(fixture.signedTransaction);
        expect(
          state.getSubstrateFederatedIsolatedDevnetTrackerTransportAttemptV1(
            reservation.reservationIdentityHex,
          ),
        ).toMatchObject({ status: 'pending' });
        fixture.transportEvents.push('post');
        return { status: 200, data: fixture.transactionIdHex };
      });

      const submission =
        await submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1({
          target: fixture.target as any,
          executionCheck: syntheticExecutionCheck,
          authorization,
          journal,
          attempt,
          preflight,
        });
      expect(submission).toMatchObject({
        status: 'accepted',
        submittedTransactionIdHex: fixture.transactionIdHex,
      });
      const outcome = journal.finalize(attempt, submission);
      expect(outcome).toMatchObject({
        status: 'accepted',
        submittedTransactionIdHex: fixture.transactionIdHex,
        trackerAdmissionEstablished: false,
      });
      expect(fixture.transportEvents).toEqual(['consume', 'post']);
      expect(node.post).toHaveBeenCalledTimes(1);
    });
  });

  it('composes fresh checked bytes through durable ambiguous transport', async () => {
    await withAsyncState(async (state, reservation) => {
      syntheticDurableReservation = durableReceipt(reservation);
      const authorization = authorize();
      const journal = createJournal(state);
      const attempt = journal.reserve(authorization);
      const preflight = createPreflight(journal, attempt, authorization);
      node.post.mockRejectedValue({
        isAxiosError: true,
        response: { status: 503 },
      });

      const submission =
        await submitSubstrateFederatedIsolatedDevnetTrackerCheckedTransportV1({
          target: fixture.target as any,
          executionCheck: syntheticExecutionCheck,
          authorization,
          journal,
          attempt,
          preflight,
        });
      expect(submission).toMatchObject({
        status: 'ambiguous',
        submittedTransactionIdHex: null,
      });
      expect(journal.finalize(attempt, submission)).toMatchObject({
        status: 'ambiguous',
        submittedTransactionIdHex: null,
        trackerAdmissionEstablished: false,
      });
      expect(fixture.transportEvents).toEqual(['consume']);
      expect(node.post).toHaveBeenCalledTimes(1);
    });
  });

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
            responseCategory: 'accepted',
            httpStatus: 200,
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
        responseClassification:
          createSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1({
            status: 'accepted',
            responseCategory: 'accepted',
            httpStatus: 200,
            responseDigestHex: '61'.repeat(32),
          }),
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
          responseCategory: 'accepted',
          httpStatus: 200,
          responseDigestHex: '61'.repeat(32),
        },
      );
      const outcome = journal.finalize(attempt, result);
      expect(outcome).toMatchObject({
        status: 'accepted',
        submittedTransactionIdHex: fixture.transactionIdHex,
        trackerAdmissionEstablished: false,
      });
      expect(outcome).not.toHaveProperty('responseCategory');
      expect(
        projectSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1(
          outcome,
        ),
      ).toMatchObject({
        status: 'accepted',
        responseCategory: 'accepted',
        httpStatus: 200,
        responseDigestHex: '61'.repeat(32),
        classificationDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/u),
      });
      expect(
        projectSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1(
          structuredClone(outcome),
        ),
      ).toBeNull();
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
          responseCategory: 'ambiguous_http_response',
          httpStatus: 503,
          responseDigestHex: '62'.repeat(32),
        },
      );
      const outcome = journal.finalize(attempt, result);
      expect(outcome).toMatchObject({
        status: 'ambiguous',
        submittedTransactionIdHex: null,
        trackerAdmissionEstablished: false,
      });
      expect(
        projectSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1(
          outcome,
        ),
      ).toMatchObject({
        status: 'ambiguous',
        responseCategory: 'ambiguous_http_response',
        httpStatus: 503,
        responseDigestHex: '62'.repeat(32),
      });
    });
  });

  it('rejects a coherent response-pair mutation that retains the old digest', () => {
    const classification =
      createSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1({
        status: 'ambiguous',
        responseCategory: 'ambiguous_http_response',
        httpStatus: 503,
        responseDigestHex: '63'.repeat(32),
      });
    const mutated = Object.freeze({
      ...classification,
      responseCategory: 'ambiguous_no_response' as const,
      httpStatus: null,
    });

    expect(() =>
      assertSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1(
        mutated,
      )
    ).toThrow(/response classification changed/u);
  });

  it.each([
    ['schema', (value: any) => { value.schema = 'unknown'; }],
    ['version', (value: any) => { value.version = 2; }],
    ['status', (value: any) => { value.status = 'accepted'; }],
    ['response category', (value: any) => {
      value.responseCategory = 'ambiguous_no_response';
    }],
    ['HTTP status', (value: any) => { value.httpStatus = 502; }],
    ['response digest', (value: any) => {
      value.responseDigestHex = '65'.repeat(32);
    }],
    ['classification digest', (value: any) => {
      value.classificationDigestHex = '66'.repeat(32);
    }],
    ['extra key', (value: any) => { value.unexpected = true; }],
    ['missing key', (value: any) => { delete value.version; }],
  ] as const)(
    'rejects exact response-classification field drift: %s',
    (_label, mutate) => {
      const classification =
        createSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1({
          status: 'ambiguous',
          responseCategory: 'ambiguous_http_response',
          httpStatus: 503,
          responseDigestHex: '63'.repeat(32),
        });
      const mutated = structuredClone(classification);
      mutate(mutated);

      expect(() =>
        assertSubstrateFederatedIsolatedDevnetTrackerTransportResponseClassificationV1(
          mutated,
        )
      ).toThrow(/response classification (?:changed|is invalid)/u);
    },
  );

  it.each([
    ['accepted category on ambiguous status', 'ambiguous', null, 'accepted', 200],
    ['ambiguous category on accepted status', 'accepted', fixture.transactionIdHex, 'ambiguous_success_response', 200],
    ['missing accepted HTTP status', 'accepted', fixture.transactionIdHex, 'accepted', null],
    ['HTTP status on no-response category', 'ambiguous', null, 'ambiguous_no_response', 503],
    ['non-success status on success-response category', 'ambiguous', null, 'ambiguous_success_response', 503],
    ['success status on HTTP-response category', 'ambiguous', null, 'ambiguous_http_response', 200],
    ['missing ambiguous HTTP status', 'ambiguous', null, 'ambiguous_http_response', null],
  ] as const)(
    'rejects incoherent response classification: %s',
    (_label, status, submittedTransactionIdHex, responseCategory, httpStatus) => {
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

        expect(() =>
          issueSubstrateFederatedIsolatedDevnetTrackerTransportResultV1(
            journal,
            attempt,
            {
              status,
              submittedTransactionIdHex,
              responseCategory,
              httpStatus,
              responseDigestHex: '64'.repeat(32),
            },
          )
        ).toThrow(/tracker transport response classification changed/u);
      });
    },
  );

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

async function withAsyncState(
  run: (
    state: StateTracker,
    reservation: ReturnType<
      StateTracker['reserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1']
    >['reservation'],
  ) => Promise<void>,
): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'tracker-transport-join-test-'));
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
    await run(state, reservation);
  } finally {
    state.close();
    rmSync(root, { recursive: true, force: true });
  }
}
