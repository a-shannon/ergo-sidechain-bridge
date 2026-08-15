import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import blakejs from 'blakejs';
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  collectFinality: vi.fn(),
  requestStateProof: vi.fn(),
  assertReservationRequest: vi.fn(),
  assertVerifier: vi.fn(),
  assertVerification: vi.fn(),
}));

vi.mock('./native-checkpoint-proof-collector.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./native-checkpoint-proof-collector.js')
  >();
  return {
    ...actual,
    collectNativeFinalityMaterial: mocks.collectFinality,
  };
});

vi.mock('./substrate-finality-provider.js', async importOriginal => {
  const actual = await importOriginal<
    typeof import('./substrate-finality-provider.js')
  >();
  return {
    ...actual,
    requestPooledReserveMintReservationStateReadProofV4:
      mocks.requestStateProof,
  };
});

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
      assertValidityApplicationPooledReserveMintReservationV4Request:
        mocks.assertReservationRequest,
    };
  },
);

vi.mock(
  './native-finalized-pooled-reserve-mint-reservation-state-v4.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import(
        './native-finalized-pooled-reserve-mint-reservation-state-v4.js'
      )
    >();
    return {
      ...actual,
      assertAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4VerifierProvenance:
        mocks.assertVerifier,
      assertAuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4VerificationFromVerifierProvenance:
        mocks.assertVerification,
    };
  },
);

import {
  collectAuthenticatedPooledReserveMintReservationStateV4,
  type AuthenticatedPooledReserveMintReservationStateV4,
} from './native-pooled-reserve-mint-reservation-state-v4-proof-collector.js';
import type {
  AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verifier,
  PooledReserveMintReservationLifecycleStatusV4,
} from './native-finalized-pooled-reserve-mint-reservation-state-v4.js';
import {
  assertPooledReserveMintReservationRecoveryV4ReportProvenance,
  recoverPooledReserveMintReservationV4,
  type PooledReserveMintReservationRecoveryPersistenceV4,
} from './pooled-reserve-mint-reservation-recovery-v4.js';
import {
  buildPooledReserveMintReservationFinalityContinuityV4,
  type PooledReserveMintReservationFinalityContinuityV4,
} from './pooled-reserve-mint-reservation-finality-continuity-v4.js';
import {
  derivePooledReserveMintReservationRuntimeStorageKeysV4,
} from './pooled-reserve-mint-reservation-runtime-state-v4.js';
import { StateTracker } from './state-tracker.js';
import type {
  ValidityApplicationPooledReserveMintReservationV4Request,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';

const vector = JSON.parse(readFileSync(
  new URL(
    '../test-vectors/validity-application-pooled-reserve-mint-reservation-v4.json',
    import.meta.url,
  ),
  'utf8',
)) as {
  readonly expected: {
    readonly statementHex: string;
    readonly statementIdHex: string;
    readonly reservationKeyHex: string;
  };
};

const keys = derivePooledReserveMintReservationRuntimeStorageKeysV4(
  vector.expected.reservationKeyHex,
);
const trustedAnchorDigestHex = hex32('66');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requestStateProof.mockResolvedValue({
    atNativeBlockHashHex: hex32('cc').slice(2),
    storageKeysHex: [
      keys.runtimeCodeStorageKeyHex,
      keys.currentProfileStorageKeyHex,
      keys.enforcementStorageKeyHex,
      keys.pendingKeysStorageKeyHex,
      keys.pendingReservationStorageKeyHex,
      keys.consumedReservationStorageKeyHex,
      keys.invalidatedReservationStorageKeyHex,
    ],
    reservationStorageKeys: keys,
    proofNodesHex: ['0102', '0304'],
    proofBytes: 4,
  });
});

describe('pooled-reserve mint-reservation V4 recovery', () => {
  it('keeps absent and expired pending states held, then accepts only runtime invalidation', async () => {
    await withTracker(async tracker => {
      const absent = await recoverState(tracker, {
        status: 'absent',
        height: 5n,
        blockByte: '15',
      });
      expect(absent.appended).toBe(true);
      expect(absent.hold.classification).toBe(
        'absent_non_authorizing_hold',
      );
      expect(Object.values(absent.boundary).every(value => value === false))
        .toBe(true);
      expect(() =>
        assertPooledReserveMintReservationRecoveryV4ReportProvenance(absent)
      ).not.toThrow();
      expect(() =>
        assertPooledReserveMintReservationRecoveryV4ReportProvenance({
          ...absent,
        })
      ).toThrow(/provenance is missing/i);

      const pending = await recoverState(tracker, {
        status: 'pending',
        height: 10n,
        blockByte: '16',
        lifecycleRecordScaleHex: pendingRecord(20n),
      });
      expect(pending.hold.classification).toBe('pending_hold');

      const duplicate = await recoverState(tracker, {
        status: 'pending',
        height: 10n,
        blockByte: '16',
        lifecycleRecordScaleHex: pendingRecord(20n),
      });
      expect(duplicate.appended).toBe(false);
      expect(tracker.getPooledReserveMintReservationRecoveryJournalV4(
        vector.expected.reservationKeyHex,
      )).toHaveLength(2);

      const expired = await recoverState(tracker, {
        status: 'pending',
        height: 20n,
        blockByte: '17',
        lifecycleRecordScaleHex: pendingRecord(20n),
      });
      expect(expired.hold.classification).toBe(
        'expired_pending_runtime_retirement_required',
      );

      const invalidated = await recoverState(tracker, {
        status: 'invalidated',
        height: 21n,
        blockByte: '18',
        lifecycleRecordScaleHex: terminalRecord('invalidated', '31'),
      });
      expect(invalidated.hold.classification).toBe(
        'invalidated_terminal_hold',
      );
      expect(tracker.getPooledReserveMintReservationRecoveryHoldV4(
        vector.expected.reservationKeyHex,
      )?.classification).toBe('invalidated_terminal_hold');
    });
  });

  it('persists an append-only journal and hold atomically across crash and restart', async () => {
    await withTrackerPath(async dbPath => {
      const tracker = new StateTracker(dbPath);
      const blocker = new Database(dbPath);
      blocker.exec(`
        CREATE TRIGGER force_v4_hold_failure
        BEFORE INSERT ON pooled_reserve_mint_reservation_holds_v4
        BEGIN
          SELECT RAISE(ABORT, 'forced post-reservation hold failure');
        END;
      `);
      blocker.close();

      await expect(recoverState(tracker, {
        status: 'pending',
        height: 10n,
        blockByte: '21',
        lifecycleRecordScaleHex: pendingRecord(20n),
      })).rejects.toThrow(/forced post-reservation hold failure/i);
      expect(tracker.getPooledReserveMintReservationRecoveryJournalV4(
        vector.expected.reservationKeyHex,
      )).toEqual([]);
      expect(tracker.getPooledReserveMintReservationRecoveryHoldV4(
        vector.expected.reservationKeyHex,
      )).toBeNull();
      tracker.close();

      const cleanup = new Database(dbPath);
      cleanup.exec('DROP TRIGGER force_v4_hold_failure');
      cleanup.close();
      const restarted = new StateTracker(dbPath);
      await recoverState(restarted, {
        status: 'pending',
        height: 10n,
        blockByte: '21',
        lifecycleRecordScaleHex: pendingRecord(20n),
      });
      restarted.close();

      const reopened = new StateTracker(dbPath);
      expect(reopened.getPooledReserveMintReservationRecoveryHoldV4(
        vector.expected.reservationKeyHex,
      )?.classification).toBe('pending_hold');
      const before = reopened.getPooledReserveMintReservationRecoveryJournalV4(
        vector.expected.reservationKeyHex,
      );
      await expect(recoverPooledReserveMintReservationV4({
        collectFresh: async () => {
          throw new Error('divergent RPC reservation views');
        },
        assertCollateralRemainsCommitted: async () => undefined,
        assertReserveLineageRemainsCurrent: async () => undefined,
        persistence: reopened,
      })).rejects.toThrow(/divergent RPC/i);
      expect(reopened.getPooledReserveMintReservationRecoveryJournalV4(
        vector.expected.reservationKeyHex,
      )).toEqual(before);
      reopened.close();
    });
  });

  it('reconstructs after complete database loss only from a fresh authenticated result', async () => {
    await withTrackerPath(async dbPath => {
      const first = new StateTracker(dbPath);
      await recoverState(first, {
        status: 'pending',
        height: 10n,
        blockByte: '25',
        lifecycleRecordScaleHex: pendingRecord(20n),
      });
      first.close();
      removeSqliteFiles(dbPath);

      const empty = new StateTracker(dbPath);
      expect(empty.getPooledReserveMintReservationRecoveryHoldV4(
        vector.expected.reservationKeyHex,
      )).toBeNull();
      await expect(recoverPooledReserveMintReservationV4({
        collectFresh: async () => {
          throw new Error('fresh T3A collection unavailable');
        },
        assertCollateralRemainsCommitted: async () => undefined,
        assertReserveLineageRemainsCurrent: async () => undefined,
        persistence: empty,
      })).rejects.toThrow(/fresh T3A collection unavailable/i);
      expect(empty.getPooledReserveMintReservationRecoveryHoldV4(
        vector.expected.reservationKeyHex,
      )).toBeNull();

      await recoverState(empty, {
        status: 'pending',
        height: 11n,
        blockByte: '26',
        lifecycleRecordScaleHex: pendingRecord(20n),
      });
      expect(empty.getPooledReserveMintReservationRecoveryHoldV4(
        vector.expected.reservationKeyHex,
      )?.source.targetNativeHeight).toBe('11');
      empty.close();
    });
  });

  it('rejects out-of-order, same-height conflict, reorg to absent, and terminal rollback', async () => {
    await withTracker(async tracker => {
      await recoverState(tracker, {
        status: 'pending',
        height: 10n,
        blockByte: '30',
        lifecycleRecordScaleHex: pendingRecord(20n),
      });
      await expect(recoverState(tracker, {
        status: 'pending',
        height: 9n,
        blockByte: '31',
        lifecycleRecordScaleHex: pendingRecord(20n),
      })).rejects.toThrow(/out of order/i);
      await expect(recoverState(tracker, {
        status: 'pending',
        height: 10n,
        blockByte: '32',
        lifecycleRecordScaleHex: pendingRecord(20n),
      })).rejects.toThrow(/same-height conflicting/i);
      await expect(recoverState(tracker, {
        status: 'pending',
        height: 11n,
        blockByte: '32',
        lifecycleRecordScaleHex: pendingRecord(20n),
        finalityHorizonHeight: 99n,
      })).rejects.toThrow(/finality horizon regressed/i);
      await expect(recoverState(tracker, {
        status: 'pending',
        height: 11n,
        blockByte: '32',
        lifecycleRecordScaleHex: pendingRecord(20n),
        finalityHorizonHeight: 100n,
        finalityHorizonByte: '99',
      })).rejects.toThrow(/finality horizon conflicts/i);
      await expect(recoverState(tracker, {
        status: 'pending',
        height: 11n,
        blockByte: '32',
        lifecycleRecordScaleHex: pendingRecord(20n),
        finalityHorizonHeight: 101n,
        finalityHorizonByte: '98',
      })).rejects.toThrow(/advance lacks authenticated ancestry/i);
      await expect(recoverState(tracker, {
        status: 'absent',
        height: 11n,
        blockByte: '33',
      })).rejects.toThrow(/pending state cannot roll back to absent/i);
      await expect(recoverState(tracker, {
        status: 'pending',
        height: 11n,
        blockByte: '34',
        lifecycleRecordScaleHex: pendingRecord(20n, '51'),
      })).rejects.toThrow(/conflicts with replay state/i);

      await recoverState(tracker, {
        status: 'consumed',
        height: 12n,
        blockByte: '35',
        lifecycleRecordScaleHex: terminalRecord('consumed', '61'),
      });
      await expect(recoverState(tracker, {
        status: 'pending',
        height: 13n,
        blockByte: '36',
        lifecycleRecordScaleHex: pendingRecord(20n),
      })).rejects.toThrow(/terminal state cannot roll back or conflict/i);
      await expect(recoverState(tracker, {
        status: 'invalidated',
        height: 13n,
        blockByte: '37',
        lifecycleRecordScaleHex: terminalRecord('invalidated', '71'),
      })).rejects.toThrow(/terminal state cannot roll back or conflict/i);
      expect(tracker.getPooledReserveMintReservationRecoveryJournalV4(
        vector.expected.reservationKeyHex,
      )).toHaveLength(2);
    });
  });

  it('rejects a duplicate reservation identity and conflicting terminal replay', async () => {
    await withTracker(async tracker => {
      await recoverState(tracker, {
        status: 'pending',
        height: 10n,
        blockByte: '40',
        lifecycleRecordScaleHex: pendingRecord(20n),
      });
      await expect(recoverState(tracker, {
        status: 'pending',
        height: 10n,
        blockByte: '40',
        lifecycleRecordScaleHex: pendingRecord(20n),
        admissionCandidateByte: '99',
      })).resolves.toMatchObject({
        observation: {
          reservation: {
            admissionCandidateDigestHex: hex32('99'),
          },
        },
      });
      await expect(recoverState(tracker, {
        status: 'pending',
        height: 11n,
        blockByte: '41',
        lifecycleRecordScaleHex: pendingRecord(20n),
        trustAnchorDigestHex: hex32('ca'),
      })).rejects.toThrow(/identity conflicts/i);

      await recoverState(tracker, {
        status: 'invalidated',
        height: 12n,
        blockByte: '42',
        lifecycleRecordScaleHex: terminalRecord('invalidated', '81'),
      });
      await expect(recoverState(tracker, {
        status: 'invalidated',
        height: 13n,
        blockByte: '43',
        lifecycleRecordScaleHex: terminalRecord('invalidated', '82'),
      })).rejects.toThrow(/conflicts with replay state/i);
    });
  });

  it('rejects replay of a historical observation after the hold advances', async () => {
    await withTracker(async tracker => {
      const historical: CollectStateInput = {
        status: 'pending',
        height: 10n,
        blockByte: '4a',
        lifecycleRecordScaleHex: pendingRecord(20n),
      };
      await recoverState(tracker, historical);
      await recoverState(tracker, {
        status: 'consumed',
        height: 11n,
        blockByte: '4b',
        lifecycleRecordScaleHex: terminalRecord('consumed', '83'),
      });

      await expect(
        recoverState(tracker, historical),
      ).rejects.toThrow(/stale journal replay/i);
      const hold = tracker.getPooledReserveMintReservationRecoveryHoldV4(
        vector.expected.reservationKeyHex,
      );
      expect(hold?.reservation.lifecycleStatus).toBe('consumed');
      expect(hold?.source.targetNativeHeight).toBe('11');
      expect(tracker.getPooledReserveMintReservationRecoveryJournalV4(
        vector.expected.reservationKeyHex,
      )).toHaveLength(2);
    });
  });

  it('advances a hold only with same-process authenticated ancestry', async () => {
    await withTracker(async tracker => {
      await recoverState(tracker, {
        status: 'pending',
        height: 1n,
        blockByte: '45',
        lifecycleRecordScaleHex: pendingRecord(20n),
        finalityHorizonHeight: 1n,
        finalityHorizonByte: 'aa',
      });
      const headerScaleHex = substrateHeaderScaleHex({
        parentHashHex: hex32('aa'),
        height: 2n,
        stateRootByte: 'b1',
        extrinsicsRootByte: 'c1',
      });
      const finalityHorizonHashHex =
        substrateHeaderHashHex(headerScaleHex);
      const collectionInput: CollectStateInput = {
        status: 'pending',
        height: 2n,
        blockByte: '46',
        lifecycleRecordScaleHex: pendingRecord(20n),
        finalityHorizonHeight: 2n,
        finalityHorizonHashHex,
        checkpointTailHeadersScaleHex: [headerScaleHex],
      };

      const clonedCollection = await collectState(collectionInput);
      const current =
        tracker.getPooledReserveMintReservationRecoveryHoldV4(
          vector.expected.reservationKeyHex,
        );
      expect(current).not.toBeNull();
      const evidence =
        buildPooledReserveMintReservationFinalityContinuityV4({
          currentHold: current!,
          collected: clonedCollection,
        });
      const duplicateCurrent = await collectState({
        status: 'pending',
        height: 1n,
        blockByte: '45',
        lifecycleRecordScaleHex: pendingRecord(20n),
        finalityHorizonHeight: 1n,
        finalityHorizonByte: 'aa',
      });
      await expect(recoverCollectedState(
        tracker,
        duplicateCurrent,
        evidence,
      )).rejects.toThrow(/duplicate observation cannot carry/i);
      const clone = structuredClone(evidence) as Readonly<
        PooledReserveMintReservationFinalityContinuityV4
      >;
      await expect(recoverCollectedState(
        tracker,
        clonedCollection,
        clone,
      )).rejects.toThrow(/provenance is missing/i);
      expect(tracker.getPooledReserveMintReservationRecoveryHoldV4(
        vector.expected.reservationKeyHex,
      )?.source.finalityHorizonHeight).toBe('1');

      const freshCollection = await collectState(collectionInput);
      const freshEvidence =
        buildPooledReserveMintReservationFinalityContinuityV4({
          currentHold: current!,
          collected: freshCollection,
        });
      await expect(recoverCollectedState(
        tracker,
        freshCollection,
        freshEvidence,
      )).resolves.toMatchObject({
        hold: {
          source: {
            finalityHorizonHashHex,
            finalityHorizonHeight: '2',
          },
        },
      });
    });
  });

  it('rejects a forked or incomplete authenticated finality path', async () => {
    await withTracker(async tracker => {
      await recoverState(tracker, {
        status: 'pending',
        height: 1n,
        blockByte: '47',
        lifecycleRecordScaleHex: pendingRecord(20n),
        finalityHorizonHeight: 1n,
        finalityHorizonByte: 'aa',
      });
      const current =
        tracker.getPooledReserveMintReservationRecoveryHoldV4(
          vector.expected.reservationKeyHex,
        );
      expect(current).not.toBeNull();

      const forkHeaderScaleHex = substrateHeaderScaleHex({
        parentHashHex: hex32('bb'),
        height: 2n,
        stateRootByte: 'b2',
        extrinsicsRootByte: 'c2',
      });
      const forked = await collectState({
        status: 'pending',
        height: 2n,
        blockByte: '48',
        lifecycleRecordScaleHex: pendingRecord(20n),
        finalityHorizonHeight: 2n,
        finalityHorizonHashHex:
          substrateHeaderHashHex(forkHeaderScaleHex),
        checkpointTailHeadersScaleHex: [forkHeaderScaleHex],
      });
      expect(() =>
        buildPooledReserveMintReservationFinalityContinuityV4({
          currentHold: current!,
          collected: forked,
        }),
      ).toThrow(/not a contiguous descendant chain/i);

      const heightThreeHeader = substrateHeaderScaleHex({
        parentHashHex: hex32('aa'),
        height: 3n,
        stateRootByte: 'b3',
        extrinsicsRootByte: 'c3',
      });
      const incomplete = await collectState({
        status: 'pending',
        height: 2n,
        blockByte: '49',
        lifecycleRecordScaleHex: pendingRecord(20n),
        finalityHorizonHeight: 3n,
        finalityHorizonHashHex:
          substrateHeaderHashHex(heightThreeHeader),
        checkpointTailHeadersScaleHex: [heightThreeHeader],
      });
      expect(() =>
        buildPooledReserveMintReservationFinalityContinuityV4({
          currentHold: current!,
          collected: incomplete,
        }),
      ).toThrow(/does not contain every checkpoint successor/i);
    });
  });

  it('authenticates continuity across linked GRANDPA chunks and the checkpoint tail', async () => {
    await withTracker(async tracker => {
      const headerTwo = substrateHeaderScaleHex({
        parentHashHex: hex32('aa'),
        height: 2n,
        stateRootByte: 'b4',
        extrinsicsRootByte: 'c4',
      });
      const hashTwo = substrateHeaderHashHex(headerTwo);
      await recoverState(tracker, {
        status: 'pending',
        height: 1n,
        blockByte: '4c',
        lifecycleRecordScaleHex: pendingRecord(20n),
        finalityHorizonHeight: 2n,
        finalityHorizonHashHex: hashTwo,
        checkpointTailHeadersScaleHex: [headerTwo],
      });
      const headerThree = substrateHeaderScaleHex({
        parentHashHex: hashTwo,
        height: 3n,
        stateRootByte: 'b5',
        extrinsicsRootByte: 'c5',
      });
      const hashThree = substrateHeaderHashHex(headerThree);
      const headerFour = substrateHeaderScaleHex({
        parentHashHex: hashThree,
        height: 4n,
        stateRootByte: 'b6',
        extrinsicsRootByte: 'c6',
      });
      const hashFour = substrateHeaderHashHex(headerFour);
      const collected = await collectState({
        status: 'pending',
        height: 2n,
        blockByte: '4d',
        lifecycleRecordScaleHex: pendingRecord(20n),
        finalityHorizonHeight: 4n,
        finalityHorizonHashHex: hashFour,
        linkedGrandpaProofs: [{
          ancestryHeadersScaleHex: [headerTwo],
          proofScaleHex: '0x0102',
        }, {
          ancestryHeadersScaleHex: [headerThree],
          proofScaleHex: '0x0304',
        }],
        checkpointTailHeadersScaleHex: [headerFour],
      });
      const current =
        tracker.getPooledReserveMintReservationRecoveryHoldV4(
          vector.expected.reservationKeyHex,
        );
      expect(current?.source.finalityHorizonHashHex).toBe(hashTwo);
      const evidence =
        buildPooledReserveMintReservationFinalityContinuityV4({
          currentHold: current!,
          collected,
        });
      expect(evidence.ancestry.authenticatedHeaderCount).toBe(2);
      await expect(recoverCollectedState(
        tracker,
        collected,
        evidence,
      )).resolves.toMatchObject({
        hold: {
          source: {
            finalityHorizonHashHex: hashFour,
            finalityHorizonHeight: '4',
          },
        },
      });
    });
  });

  it('runs divergent-view and source-continuity checks before persistence', async () => {
    const persistence = {
      persistPooledReserveMintReservationRecoveryObservationV4: vi.fn(),
    } as unknown as PooledReserveMintReservationRecoveryPersistenceV4;
    const collateral = vi.fn(async () => undefined);
    const lineage = vi.fn(async () => undefined);

    await expect(recoverPooledReserveMintReservationV4({
      collectFresh: async () => {
        throw new Error('collector sources disagree');
      },
      assertCollateralRemainsCommitted: collateral,
      assertReserveLineageRemainsCurrent: lineage,
      persistence,
    })).rejects.toThrow(/sources disagree/i);
    expect(collateral).not.toHaveBeenCalled();
    expect(lineage).not.toHaveBeenCalled();
    expect(persistence.persistPooledReserveMintReservationRecoveryObservationV4)
      .not.toHaveBeenCalled();

    const collected = await collectState({
      status: 'pending',
      height: 10n,
      blockByte: '50',
      lifecycleRecordScaleHex: pendingRecord(20n),
    });
    collateral.mockRejectedValueOnce(
      new Error('refundable collateral was restored'),
    );
    await expect(recoverPooledReserveMintReservationV4({
      collectFresh: async () => collected,
      assertCollateralRemainsCommitted: collateral,
      assertReserveLineageRemainsCurrent: lineage,
      persistence,
    })).rejects.toThrow(/refundable collateral was restored/i);
    expect(lineage).not.toHaveBeenCalled();
    expect(persistence.persistPooledReserveMintReservationRecoveryObservationV4)
      .not.toHaveBeenCalled();
    await expect(recoverPooledReserveMintReservationV4({
      collectFresh: async () => collected,
      assertCollateralRemainsCommitted: async () => undefined,
      assertReserveLineageRemainsCurrent: async () => undefined,
      persistence,
    })).rejects.toThrow(/requires a fresh authenticated result/i);

    const refreshed = await collectState({
      status: 'pending',
      height: 11n,
      blockByte: '51',
      lifecycleRecordScaleHex: pendingRecord(20n),
    });
    collateral.mockResolvedValueOnce(undefined);
    lineage.mockRejectedValueOnce(new Error('reserve lineage rolled back'));
    await expect(recoverPooledReserveMintReservationV4({
      collectFresh: async () => refreshed,
      assertCollateralRemainsCommitted: collateral,
      assertReserveLineageRemainsCurrent: lineage,
      persistence,
    })).rejects.toThrow(/reserve lineage rolled back/i);
    expect(persistence.persistPooledReserveMintReservationRecoveryObservationV4)
      .not.toHaveBeenCalled();
  });

  it('does not mutate peg-in, mint, settlement, signing, or transport authority tables', async () => {
    await withTrackerPath(async dbPath => {
      const tracker = new StateTracker(dbPath);
      await recoverState(tracker, {
        status: 'pending',
        height: 10n,
        blockByte: '60',
        lifecycleRecordScaleHex: pendingRecord(20n),
      });
      tracker.close();

      const db = new Database(dbPath);
      const counts = Object.fromEntries([
        'peg_in_events',
        'aggregate_settlement_attempts',
        'authenticated_settlement_candidates',
        'authenticated_settlement_execution_reservations',
      ].map(table => [
        table,
        (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
          count: number;
        }).count,
      ]));
      const journalCount = (db.prepare(`
        SELECT COUNT(*) AS count
        FROM pooled_reserve_mint_reservation_observation_journal_v4
      `).get() as { count: number }).count;
      const holdCount = (db.prepare(`
        SELECT COUNT(*) AS count
        FROM pooled_reserve_mint_reservation_holds_v4
      `).get() as { count: number }).count;
      expect(() => db.prepare(`
        UPDATE pooled_reserve_mint_reservation_observation_journal_v4
        SET observed_at = observed_at
      `).run()).toThrow(/append-only/i);
      expect(() => db.prepare(`
        DELETE FROM pooled_reserve_mint_reservation_holds_v4
      `).run()).toThrow(/cannot be cleared locally/i);
      db.close();

      expect(counts).toEqual({
        peg_in_events: 0,
        aggregate_settlement_attempts: 0,
        authenticated_settlement_candidates: 0,
        authenticated_settlement_execution_reservations: 0,
      });
      expect(journalCount).toBe(1);
      expect(holdCount).toBe(1);
    });
  });
});

async function recoverState(
  tracker: StateTracker,
  input: CollectStateInput,
) {
  return recoverPooledReserveMintReservationV4({
    collectFresh: () => collectState(input),
    assertCollateralRemainsCommitted: async () => undefined,
    assertReserveLineageRemainsCurrent: async () => undefined,
    persistence: tracker,
    now: () => new Date('2026-07-28T10:00:00.000Z'),
  });
}

async function recoverCollectedState(
  tracker: StateTracker,
  collected: AuthenticatedPooledReserveMintReservationStateV4,
  finalityContinuity:
    Readonly<PooledReserveMintReservationFinalityContinuityV4>,
) {
  return recoverPooledReserveMintReservationV4({
    collectFresh: async () => collected,
    assertCollateralRemainsCommitted: async () => undefined,
    assertReserveLineageRemainsCurrent: async () => undefined,
    persistence: tracker,
    finalityContinuity,
    now: () => new Date('2026-07-28T10:00:00.000Z'),
  });
}

interface CollectStateInput {
  readonly status: PooledReserveMintReservationLifecycleStatusV4;
  readonly height: bigint;
  readonly blockByte: string;
  readonly lifecycleRecordScaleHex?: string;
  readonly admissionCandidateByte?: string;
  readonly trustAnchorDigestHex?: string;
  readonly finalityHorizonHeight?: bigint;
  readonly finalityHorizonByte?: string;
  readonly finalityHorizonHashHex?: string;
  readonly linkedGrandpaProofs?: readonly {
    readonly ancestryHeadersScaleHex: readonly string[];
    readonly proofScaleHex: string;
  }[];
  readonly checkpointTailHeadersScaleHex?: readonly string[];
}

async function collectState(
  input: CollectStateInput,
): Promise<AuthenticatedPooledReserveMintReservationStateV4> {
  const targetHashHex = hex32(input.blockByte);
  const material = finalityMaterial(input.height, targetHashHex, input);
  mocks.collectFinality.mockResolvedValueOnce(material);
  const request = reservationRequest(
    input.admissionCandidateByte ?? '55',
  );
  const expectedTrustAnchorDigestHex =
    input.trustAnchorDigestHex ?? trustedAnchorDigestHex;
  return collectAuthenticatedPooledReserveMintReservationStateV4({
    rpc: {} as never,
    codec: {} as never,
    trustAnchor: material.trustAnchor,
    targetNativeBlockHashHex: targetHashHex,
    reservationRequest: request,
    expectedRuntimeCodeSha256Hex: hex32('99'),
    expectedRuntimeCodeBytes: 1234,
    trustedAnchorDigestHex: expectedTrustAnchorDigestHex,
    verifier: fakeVerifier(verificationResult(input)),
  });
}

function reservationRequest(
  admissionCandidateByte: string,
): Readonly<ValidityApplicationPooledReserveMintReservationV4Request> {
  return Object.freeze({
    statementHex: vector.expected.statementHex,
    statementIdHex: vector.expected.statementIdHex,
    reservationKeyHex: vector.expected.reservationKeyHex,
    provenance: Object.freeze({
      admissionCandidateDigestHex: hex32(admissionCandidateByte),
    }),
  }) as unknown as
  Readonly<ValidityApplicationPooledReserveMintReservationV4Request>;
}

function fakeVerifier(
  verification:
    ReturnType<typeof verificationResult>,
): AuthorityBoundNativeFinalizedPooledReserveMintReservationStateV4Verifier {
  return {
    executableSha256Hex: hex32('88'),
    executionPolicySha256: 'ab'.repeat(32),
    executionBoundary: {
      mode:
        'source-refreshed-authority-contained-non-authorizing-proof-only',
      sourceOwnedAttestorLockReloadedPerLaunch: true,
      executionPolicyValidatedPerLaunch: true,
      containedProcessRequired: true,
      runtimeCodeStateProofRequired: true,
      independentRuntimeBuildProvenanceVerified: false,
      mintAuthorityGranted: false,
      settlementAuthorityGranted: false,
      gate5Closed: false,
    },
    deriveExecutableInvocationSha256Hex: vi.fn(() => hex32('77')),
    verify: vi.fn(async () => verification),
  };
}

function verificationResult(input: CollectStateInput) {
  const targetHashHex = hex32(input.blockByte);
  const finalityHorizonHeight =
    input.finalityHorizonHeight ?? 100n;
  const finalityHorizonHashHex = hex32(
    input.finalityHorizonByte ?? 'dd',
  );
  const lifecycleRecordScaleHex = input.status === 'absent'
    ? null
    : input.status === 'pending'
      ? input.lifecycleRecordScaleHex ?? pendingRecord(input.height + 10n)
      : input.lifecycleRecordScaleHex
        ?? terminalRecord(input.status, '91');
  return {
    schema:
      'e2s.native-finalized-pooled-reserve-mint-reservation-state-verification.v4',
    status: 'VERIFIED_RELATIVE_TO_SUPPLIED_TRUST_ROOT_DIGEST',
    requestDigestHex: hex32(input.blockByte),
    trustAnchorDigestHex:
      input.trustAnchorDigestHex ?? trustedAnchorDigestHex,
    target: {
      nativeBlockHashHex: targetHashHex,
      nativeHeight: input.height.toString(),
      stateRootHex: hex32(incrementByte(input.blockByte, 1)),
    },
    authority: {
      finalitySigningSetId: '7',
      finalitySigningAuthorityListScaleHex: '0x0102',
      finalitySigningAuthoritySetHashHex: hex32('11'),
      transitionCount: 0,
      linkedAncestryVerified: true,
    },
    finality: {
      horizonHashHex:
        input.finalityHorizonHashHex ?? finalityHorizonHashHex,
      horizonHeight: finalityHorizonHeight.toString(),
      canonicalJustificationScaleHex: '0x0304',
      verified: true,
    },
    reservationState: {
      status: input.status,
      statementIdHex: vector.expected.statementIdHex,
      reservationKeyHex: vector.expected.reservationKeyHex,
      profileIdHex: hex32('33'),
      profileScaleHex: '0x04',
      pendingKeyCount: input.status === 'pending' ? 1 : 0,
      pendingIndexContainsTarget: input.status === 'pending',
      lifecycleRecordScaleHex,
      bridgeRuntimeCodeSha256Hex: hex32('99'),
      bridgeRuntimeCodeBytes: '1234',
      runtimeCodeStateProofVerified: true,
      proofNodeCount: 2,
      proofBytes: 4,
      sevenKeyStateProofVerified: true,
      nonAuthorizing: true,
    },
    boundary: {
      mintAuthorized: false,
      signingEnabled: false,
      submissionEnabled: false,
      broadcastEnabled: false,
      runtimeMutationEnabled: false,
      independentRuntimeBuildProvenanceVerified: false,
      gate5Closed: false,
      trustlessOperationVerified: false,
      productionReadinessClaimed: false,
    },
  } as never;
}

function finalityMaterial(
  height: bigint,
  targetHashHex: string,
  input: CollectStateInput,
) {
  const finalityHorizonHeight =
    input.finalityHorizonHeight ?? height + 2n;
  const finalityHorizonHashHex =
    input.finalityHorizonHashHex
      ?? hex32(input.finalityHorizonByte ?? 'dd');
  return {
    rpc: Object.freeze({}),
    codec: Object.freeze({}),
    trustAnchor: {
      sidechainIdHex: hex32('22'),
      checkpointHashHex: hex32('aa'),
      checkpointNumber: '1',
      grandpaSetId: '7',
      authorityListScaleHex: '0x0102',
    },
    targetHash: targetHashHex,
    targetParentHash: hex32('aa'),
    targetHeaderScaleHex: '0x0102',
    linkedGrandpaProofs: input.linkedGrandpaProofs ?? [],
    checkpointTailHeadersScaleHex:
      input.checkpointTailHeadersScaleHex ?? [],
    finalityProofScaleHex: '0x0304',
    acquisition: {
      finalizedHeadHashHex: hex32('dd'),
      finalizedHeadNumber: (height + 2n).toString(),
      targetHashHex,
      targetNumber: height.toString(),
      linkedProofCount: input.linkedGrandpaProofs?.length ?? 0,
      ancestryHeaderCount:
        (input.linkedGrandpaProofs ?? []).reduce(
          (total, proof) =>
            total + proof.ancestryHeadersScaleHex.length,
          input.checkpointTailHeadersScaleHex?.length ?? 0,
        ),
      finalityHorizonHashHex,
      finalityHorizonNumber: finalityHorizonHeight.toString(),
      codecExecutableSha256Hex: hex32('ee'),
      codecExecutableInvocationSha256Hex: {
        encodeHeaders: hex32('01'),
        inspectWarpProof: hex32('02'),
        inspectFinalityProof: hex32('03'),
      },
    },
    accountMaterial: vi.fn(),
    checkDeadline: vi.fn(),
  };
}

function substrateHeaderScaleHex(input: {
  readonly parentHashHex: string;
  readonly height: bigint;
  readonly stateRootByte: string;
  readonly extrinsicsRootByte: string;
}): string {
  if (input.height < 0n || input.height >= 64n) {
    throw new Error('test header height must use compact mode zero');
  }
  return `0x${[
    input.parentHashHex.slice(2),
    Number(input.height << 2n).toString(16).padStart(2, '0'),
    hex32(input.stateRootByte).slice(2),
    hex32(input.extrinsicsRootByte).slice(2),
    '00',
  ].join('')}`;
}

function substrateHeaderHashHex(headerScaleHex: string): string {
  const bytes = Buffer.from(headerScaleHex.slice(2), 'hex');
  return `0x${Buffer.from(
    blakejs.blake2b(bytes, undefined, 32),
  ).toString('hex')}`;
}

function pendingRecord(expiresAt: bigint, fill = '41'): string {
  const statementBytes = Buffer.from(
    vector.expected.statementHex.slice(2),
    'hex',
  );
  const bytes = Buffer.alloc(918, Number.parseInt(fill, 16));
  bytes[0] = 4;
  bytes.writeUInt16LE((statementBytes.length << 2) | 1, 33);
  statementBytes.copy(bytes, 35);
  bytes.writeBigUInt64LE(expiresAt, bytes.length - 8);
  return `0x${bytes.toString('hex')}`;
}

function terminalRecord(
  status: Exclude<PooledReserveMintReservationLifecycleStatusV4, 'absent' | 'pending'>,
  fill: string,
): string {
  const bytes = Buffer.alloc(
    status === 'consumed' ? 173 : 138,
    Number.parseInt(fill, 16),
  );
  bytes[0] = 4;
  return `0x${bytes.toString('hex')}`;
}

function hex32(byte: string): string {
  if (!/^[0-9a-f]{2}$/.test(byte)) throw new Error('test byte must be hex');
  return `0x${byte.repeat(32)}`;
}

function incrementByte(byte: string, amount: number): string {
  return ((Number.parseInt(byte, 16) + amount) & 0xff)
    .toString(16)
    .padStart(2, '0');
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
  const dir = mkdtempSync(join(tmpdir(), 'bridge-v4-recovery-test-'));
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
