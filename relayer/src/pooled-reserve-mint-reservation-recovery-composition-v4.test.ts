import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildAdmission: vi.fn(),
  buildReservation: vi.fn(),
  collectReservationState: vi.fn(),
  assertCollectedProvenance: vi.fn(),
  requestFinalizedHead: vi.fn(),
}));

vi.mock(
  './validity-application-pooled-reserve-mint-admission-v4.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-mint-admission-v4.js'
      )
    >();
    return {
      ...actual,
      buildValidityApplicationPooledReserveMintAdmissionV4:
        mocks.buildAdmission,
    };
  },
);

vi.mock(
  './validity-application-pooled-reserve-mint-reservation-v4.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import(
        './validity-application-pooled-reserve-mint-reservation-v4.js'
      )
    >();
    return {
      ...actual,
      buildValidityApplicationPooledReserveMintReservationV4:
        mocks.buildReservation,
    };
  },
);

vi.mock(
  './native-pooled-reserve-mint-reservation-state-v4-proof-collector.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import(
        './native-pooled-reserve-mint-reservation-state-v4-proof-collector.js'
      )
    >();
    return {
      ...actual,
      collectAuthenticatedPooledReserveMintReservationStateV4:
        mocks.collectReservationState,
      assertAuthenticatedPooledReserveMintReservationStateV4Provenance:
        mocks.assertCollectedProvenance,
    };
  },
);

vi.mock('./substrate-finality-provider.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./substrate-finality-provider.js')
  >();
  return {
    ...actual,
    requestSubstrateFinalizedHeadHash: mocks.requestFinalizedHead,
  };
});

import {
  assertPooledReserveMintReservationSourceRecoveryV4ReportProvenance,
  recoverPooledReserveMintReservationFromSourcesV4,
} from './pooled-reserve-mint-reservation-recovery-composition-v4.js';
import { StateTracker } from './state-tracker.js';
import type {
  ValidityApplicationPooledReserveMintReservationV4Request,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';

const vectorFile = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/validity-application-pooled-reserve-mint-reservation-v4.json',
    import.meta.url,
  ),
  'utf8',
)) as {
  readonly statement:
    ValidityApplicationPooledReserveMintReservationV4Request['statement'];
  readonly expected: {
    readonly statementHex: string;
    readonly statementIdHex: string;
    readonly reservationKeyHex: string;
  };
};
const vector = Object.freeze({
  statement: vectorFile.statement,
  ...vectorFile.expected,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestFinalizedHead.mockResolvedValue(hex32('c1'));
  mocks.buildReservation.mockImplementation(
    ({ admissionCandidate }: {
      readonly admissionCandidate: { readonly candidateDigestHex: string };
    }) => reservationRequest(admissionCandidate.candidateDigestHex),
  );
  mocks.collectReservationState.mockImplementation(
    (input: {
      readonly reservationRequest:
        Readonly<ValidityApplicationPooledReserveMintReservationV4Request>;
      readonly targetNativeBlockHashHex: string;
    }) => Promise.resolve(authenticatedState({
      request: input.reservationRequest,
      targetNativeBlockHashHex: input.targetNativeBlockHashHex,
      targetNativeHeight: 10n,
    })),
  );
});

describe('pooled-reserve source-owned reservation recovery V4', () => {
  it('owns both source admissions, finalized target selection, and persistence', async () => {
    await withTracker(async tracker => {
      mocks.buildAdmission
        .mockResolvedValueOnce(admissionCandidate('51'))
        .mockResolvedValueOnce(admissionCandidate('52'));

      const report =
        await recoverPooledReserveMintReservationFromSourcesV4(
          sourceRecoveryInput(tracker),
        );

      assertPooledReserveMintReservationSourceRecoveryV4ReportProvenance(
        report,
      );
      expect(report).toMatchObject({
        reservation: {
          statementIdHex: vector.statementIdHex,
          reservationKeyHex: vector.reservationKeyHex,
          initialAdmissionCandidateDigestHex: hex32('51'),
          revalidatedAdmissionCandidateDigestHex: hex32('52'),
        },
        checks: {
          finalizedTargetSelectedInternally: true,
          initialSourceAdmissionBuiltInternally: true,
          authenticatedReservationStateCollectedInternally: true,
          postCollectionSourceAdmissionRebuiltInternally: true,
          exactReservationStatementRemainedStable: true,
          callerSuppliedChildReportAccepted: false,
        },
        boundary: {
          localObservationAuthoritative: false,
          ergoConsensusAuthenticated: false,
          reservationAuthorized: false,
          mintAuthorized: false,
          signingAuthorized: false,
          submissionAuthorized: false,
          broadcastAuthorized: false,
          gate5Closed: false,
          trustlessStatusEstablished: false,
          productionReadinessVerified: false,
        },
      });
      expect(mocks.buildAdmission).toHaveBeenCalledTimes(2);
      expect(mocks.requestFinalizedHead).toHaveBeenCalledTimes(1);
      expect(mocks.collectReservationState).toHaveBeenCalledWith(
        expect.objectContaining({
          targetNativeBlockHashHex: hex32('c1'),
          reservationRequest: expect.objectContaining({
            statementIdHex: vector.statementIdHex,
          }),
        }),
      );
      expect(mocks.requestFinalizedHead.mock.invocationCallOrder[0])
        .toBeLessThan(
          mocks.collectReservationState.mock.invocationCallOrder[0]!,
        );
      expect(mocks.collectReservationState.mock.invocationCallOrder[0])
        .toBeLessThan(mocks.buildAdmission.mock.invocationCallOrder[1]!);
      expect(tracker.getPooledReserveMintReservationRecoveryHoldV4(
        vector.reservationKeyHex,
      )?.reservation.admissionCandidateDigestHex).toBe(hex32('51'));
    });
  });

  it('rejects caller-selected targets and caller-supplied child reports', async () => {
    await withTracker(async tracker => {
      const base = sourceRecoveryInput(tracker);
      await expect(
        recoverPooledReserveMintReservationFromSourcesV4({
          ...base,
          targetNativeBlockHashHex: hex32('d1'),
        } as never),
      ).rejects.toThrow(/unsupported child or capability/i);
      await expect(
        recoverPooledReserveMintReservationFromSourcesV4({
          ...base,
          authenticatedReservationState: {},
        } as never),
      ).rejects.toThrow(/unsupported child or capability/i);
      expect(mocks.buildAdmission).not.toHaveBeenCalled();
      expect(mocks.requestFinalizedHead).not.toHaveBeenCalled();
      expect(mocks.collectReservationState).not.toHaveBeenCalled();
    });
  });

  it('rejects a collector result for another internally selected target', async () => {
    await withTracker(async tracker => {
      mocks.buildAdmission.mockResolvedValueOnce(admissionCandidate('59'));
      mocks.collectReservationState.mockImplementationOnce(
        (input: {
          readonly reservationRequest:
            Readonly<ValidityApplicationPooledReserveMintReservationV4Request>;
        }) => Promise.resolve(authenticatedState({
          request: input.reservationRequest,
          targetNativeBlockHashHex: hex32('cf'),
          targetNativeHeight: 10n,
        })),
      );

      await expect(
        recoverPooledReserveMintReservationFromSourcesV4(
          sourceRecoveryInput(tracker),
        ),
      ).rejects.toThrow(/does not bind the source-owned request/i);
      expect(mocks.buildAdmission).toHaveBeenCalledTimes(1);
      expect(tracker.getPooledReserveMintReservationRecoveryHoldV4(
        vector.reservationKeyHex,
      )).toBeNull();
    });
  });

  it('rejects post-collection reservation drift before persistence', async () => {
    await withTracker(async tracker => {
      mocks.buildAdmission
        .mockResolvedValueOnce(admissionCandidate('61'))
        .mockResolvedValueOnce(admissionCandidate('62'));
      mocks.buildReservation
        .mockImplementationOnce(
          ({ admissionCandidate }: {
            readonly admissionCandidate: {
              readonly candidateDigestHex: string;
            };
          }) => reservationRequest(admissionCandidate.candidateDigestHex),
        )
        .mockImplementationOnce(
          ({ admissionCandidate }: {
            readonly admissionCandidate: {
              readonly candidateDigestHex: string;
            };
          }) => ({
            ...reservationRequest(admissionCandidate.candidateDigestHex),
            statementHex: `0x${'ff'.repeat(603)}`,
          }),
        );

      await expect(
        recoverPooledReserveMintReservationFromSourcesV4(
          sourceRecoveryInput(tracker),
        ),
      ).rejects.toThrow(/changed the reservation statement/i);
      expect(mocks.collectReservationState).toHaveBeenCalledTimes(1);
      expect(mocks.buildAdmission).toHaveBeenCalledTimes(2);
      expect(tracker.getPooledReserveMintReservationRecoveryHoldV4(
        vector.reservationKeyHex,
      )).toBeNull();
    });
  });

  it('rebuilds after restart and complete database loss only from fresh sources', async () => {
    await withTrackerPath(async dbPath => {
      const first = new StateTracker(dbPath);
      mocks.buildAdmission
        .mockResolvedValueOnce(admissionCandidate('71'))
        .mockResolvedValueOnce(admissionCandidate('72'));
      await recoverPooledReserveMintReservationFromSourcesV4(
        sourceRecoveryInput(first),
      );
      first.close();

      const restarted = new StateTracker(dbPath);
      mocks.requestFinalizedHead.mockResolvedValueOnce(hex32('c2'));
      mocks.buildAdmission
        .mockResolvedValueOnce(admissionCandidate('73'))
        .mockResolvedValueOnce(admissionCandidate('74'));
      mocks.collectReservationState.mockImplementationOnce(
        (input: {
          readonly reservationRequest:
            Readonly<ValidityApplicationPooledReserveMintReservationV4Request>;
          readonly targetNativeBlockHashHex: string;
        }) => Promise.resolve(authenticatedState({
          request: input.reservationRequest,
          targetNativeBlockHashHex: input.targetNativeBlockHashHex,
          targetNativeHeight: 11n,
        })),
      );
      await recoverPooledReserveMintReservationFromSourcesV4(
        sourceRecoveryInput(restarted),
      );
      expect(restarted.getPooledReserveMintReservationRecoveryJournalV4(
        vector.reservationKeyHex,
      )).toHaveLength(2);
      restarted.close();

      removeSqliteFiles(dbPath);
      const empty = new StateTracker(dbPath);
      mocks.requestFinalizedHead.mockResolvedValueOnce(hex32('c3'));
      mocks.buildAdmission
        .mockResolvedValueOnce(admissionCandidate('75'))
        .mockResolvedValueOnce(admissionCandidate('76'));
      mocks.collectReservationState.mockImplementationOnce(
        (input: {
          readonly reservationRequest:
            Readonly<ValidityApplicationPooledReserveMintReservationV4Request>;
          readonly targetNativeBlockHashHex: string;
        }) => Promise.resolve(authenticatedState({
          request: input.reservationRequest,
          targetNativeBlockHashHex: input.targetNativeBlockHashHex,
          targetNativeHeight: 12n,
        })),
      );
      await recoverPooledReserveMintReservationFromSourcesV4(
        sourceRecoveryInput(empty),
      );
      expect(empty.getPooledReserveMintReservationRecoveryJournalV4(
        vector.reservationKeyHex,
      )).toHaveLength(1);
      expect(mocks.collectReservationState).toHaveBeenCalledTimes(3);
      expect(mocks.buildAdmission).toHaveBeenCalledTimes(6);
      empty.close();
    });
  });
});

function sourceRecoveryInput(tracker: StateTracker) {
  return {
    compiledInstance: Object.freeze({ marker: 'compiled-instance' }) as never,
    depositTransition: Object.freeze({ marker: 'deposit-transition' }) as never,
    sourcePair: Object.freeze({ marker: 'source-pair' }) as never,
    rpc: Object.freeze({ marker: 'read-only-rpc' }) as never,
    codec: Object.freeze({ marker: 'proof-codec' }) as never,
    trustAnchor: Object.freeze({ marker: 'trust-anchor' }) as never,
    expectedRuntimeCodeSha256Hex: hex32('99'),
    expectedRuntimeCodeBytes: 1234,
    trustedAnchorDigestHex: hex32('66'),
    verifier: Object.freeze({ marker: 'verifier' }) as never,
    persistence: tracker,
    now: () => new Date('2026-07-28T11:00:00.000Z'),
  };
}

function admissionCandidate(byte: string) {
  return Object.freeze({
    candidateDigestHex: hex32(byte),
  });
}

function reservationRequest(
  admissionCandidateDigestHex: string,
): Readonly<ValidityApplicationPooledReserveMintReservationV4Request> {
  return Object.freeze({
    schema: 'e2s.validity-application-pooled-reserve-mint-reservation.v4',
    version: 4,
    status: 'unsubmitted_non_authorizing_request',
    statement: Object.freeze({ ...vector.statement }),
    statementHex: vector.statementHex,
    statementIdHex: vector.statementIdHex,
    reservationKeyHex: vector.reservationKeyHex,
    provenance: Object.freeze({
      admissionCandidateDigestHex,
      sameProcessAdmissionCandidateVerified: true,
      callerSuppliedProofAccepted: false,
      localPersistenceConsulted: false,
    }),
    authority: Object.freeze({
      sourceProofVerifiedByRuntime: false,
      authenticatedSidechainStateReserved: false,
      historicalMintAbsenceProved: false,
      mintExecuted: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    }),
    limitations: Object.freeze([]),
  });
}

function authenticatedState(input: {
  readonly request:
    Readonly<ValidityApplicationPooledReserveMintReservationV4Request>;
  readonly targetNativeBlockHashHex: string;
  readonly targetNativeHeight: bigint;
}) {
  return Object.freeze({
    collection: Object.freeze({
      request: Object.freeze({
        targetNativeBlockHashHex: input.targetNativeBlockHashHex,
        statement: Object.freeze({
          statementHex: input.request.statementHex,
          statementIdHex: input.request.statementIdHex,
          reservationKeyHex: input.request.reservationKeyHex,
        }),
      }),
      source: Object.freeze({
        admissionCandidateDigestHex:
          input.request.provenance.admissionCandidateDigestHex,
        reservationStatementIdHex: input.request.statementIdHex,
        reservationKeyHex: input.request.reservationKeyHex,
      }),
    }),
    verification: Object.freeze({
      requestDigestHex: hex32(
        Number(input.targetNativeHeight).toString(16).padStart(2, '0'),
      ),
      trustAnchorDigestHex: hex32('66'),
      target: Object.freeze({
        nativeBlockHashHex: input.targetNativeBlockHashHex,
        nativeHeight: input.targetNativeHeight.toString(),
        stateRootHex: hex32('ee'),
      }),
      finality: Object.freeze({
        horizonHashHex: hex32('dd'),
        horizonHeight: '100',
      }),
      reservationState: Object.freeze({
        status: 'pending',
        statementIdHex: input.request.statementIdHex,
        reservationKeyHex: input.request.reservationKeyHex,
        profileIdHex: hex32('33'),
        lifecycleRecordScaleHex: pendingRecord(200n),
        bridgeRuntimeCodeSha256Hex: hex32('99'),
        bridgeRuntimeCodeBytes: '1234',
      }),
    }),
  });
}

function pendingRecord(expiresAt: bigint): string {
  const statementBytes = Buffer.from(vector.statementHex.slice(2), 'hex');
  const bytes = Buffer.alloc(918, 0x41);
  bytes[0] = 4;
  bytes.writeUInt16LE((statementBytes.length << 2) | 1, 33);
  statementBytes.copy(bytes, 35);
  bytes.writeBigUInt64LE(expiresAt, bytes.length - 8);
  return `0x${bytes.toString('hex')}`;
}

function hex32(byte: string): string {
  if (!/^[0-9a-f]{2}$/.test(byte)) {
    throw new Error('test byte must be lowercase hex');
  }
  return `0x${byte.repeat(32)}`;
}

async function withTracker(
  run: (tracker: StateTracker) => Promise<void>,
): Promise<void> {
  await withTrackerPath(async dbPath => {
    const tracker = new StateTracker(dbPath);
    try {
      await run(tracker);
    } finally {
      tracker.close();
    }
  });
}

async function withTrackerPath(
  run: (dbPath: string) => Promise<void>,
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-v4-source-recovery-test-'));
  try {
    await run(join(dir, 'state.sqlite'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function removeSqliteFiles(dbPath: string): void {
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    rmSync(path, { force: true });
  }
}
