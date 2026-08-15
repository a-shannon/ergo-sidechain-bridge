import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import {
  abandonAggregateSettlementAttempt,
  createAggregateSettlementErgoWitness,
  getActiveAggregateSettlementAttemptBurnTxHashes,
  recoverAggregateSettlementAttempts,
  scanAggregateSettlementAttempts,
  type AggregateSettlementAbandonDeps,
  type AggregateSettlementRecoveryDeps,
} from './aggregate-settlement-recovery.js';
import {
  createAggregateSettlementErgoObservationRecord,
  type AggregateSettlementErgoObservationRecord,
} from './aggregate-settlement-ergo-finality-policy.js';
import type { StableAggregateSettlementErgoObservation } from './aggregate-settlement-ergo-observation.js';
import { observeStableAggregateSettlementErgoTransaction } from './aggregate-settlement-ergo-observation.js';
import {
  StateTracker,
  type AggregateSettlementAttempt,
  type AggregateSettlementAttemptMode,
  type AggregateSettlementRecoveryMutationInput,
} from './state-tracker.js';
import { buildConfirmedErgoTransactionFixture } from './aggregate-settlement-ergo-fixture.test-helper.js';
import { getSpvTrackerDigest } from './spv-tracker.js';

const REQUIRED_CONFIRMATIONS = 10;
const DEFAULT_TIP_HEIGHT = 109;
const DEFAULT_INCLUSION_HEIGHT = 100;
const TIP_HEADER = 'a1'.repeat(32);
const REPLACEMENT_TIP_HEADER = 'a2'.repeat(32);
const INCLUSION_HEADER = 'b1'.repeat(32);
const CONFIRMED_TRANSACTION = await buildConfirmedErgoTransactionFixture({
  outputs: [{
    value: 1_000_000,
    ergoTree: '10010100d17300',
    creationHeight: DEFAULT_INCLUSION_HEIGHT,
  }],
  inclusionHeight: DEFAULT_INCLUSION_HEIGHT,
  inclusionHeaderIdHex: INCLUSION_HEADER,
});
const CONFIRMED_TX_ID = CONFIRMED_TRANSACTION.id;
const TEST_SOURCE_IDENTITIES = {
  primaryNodeIdentityDigestHex: '41'.repeat(32),
  primaryAdministrationIdentityDigestHex: '42'.repeat(32),
  witnessNodeIdentityDigestHex: '51'.repeat(32),
  witnessAdministrationIdentityDigestHex: '52'.repeat(32),
} as const;

type ObservationKind = 'absent' | 'mempool' | 'confirmed';

interface StableErgoViewOptions {
  transactionId: string;
  kind?: ObservationKind;
  tipHeight?: number;
  tipHeaderIds?: [string, string];
  ancestorHeaders?: Record<number, string>;
  inclusionHeight?: number;
  transactionInclusionHeaderId?: string;
  canonicalInclusionHeaderId?: string;
}

interface StableErgoViewCalls {
  heights: number;
  tipHeaders: number;
  inclusionHeaders: number;
  transactions: number;
  mempool: number;
}

function policyAttempt(
  overrides: Partial<AggregateSettlementAttempt>
    & Pick<AggregateSettlementAttempt, 'burnTxHashes' | 'expectedTxId'>,
): AggregateSettlementAttempt {
  return {
    id: 1,
    mode: 'single',
    submittedTxId: null,
    status: 'pending',
    abandonmentReason: null,
    lifecycleVersion: 0,
    transportReservationDigest: null,
    fundsReleaseAuthorityEpochHex: null,
    transportStartedAt: null,
    transportCompletedAt: null,
    recoveryBindingStatus: 'policy_v1',
    recoveryPolicyVersion: 1,
    recoveryRequiredConfirmations: REQUIRED_CONFIRMATIONS,
    ergoObservation: null,
    ergoObservationSourceCount: 0,
    ergoObservationConsensusDigest: null,
    recoveryQuarantine: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function preFinalityObservation(transactionId: string): AggregateSettlementErgoObservationRecord {
  return createAggregateSettlementErgoObservationRecord({
    policyVersion: 1,
    requiredConfirmations: REQUIRED_CONFIRMATIONS,
    status: 'confirmed_pre_finality',
    transactionIdHex: transactionId,
    transactionDigestHex: 'c1'.repeat(32),
    inclusionHeight: DEFAULT_INCLUSION_HEIGHT,
    inclusionHeaderIdHex: INCLUSION_HEADER,
    observedTipHeight: DEFAULT_TIP_HEIGHT - 1,
    observedTipHeaderIdHex: TIP_HEADER,
    confirmations: REQUIRED_CONFIRMATIONS - 1,
  });
}

async function finalObservation(transactionId: string): Promise<StableAggregateSettlementErgoObservation> {
  return observeStableAggregateSettlementErgoTransaction({
    ergo: stableErgoView({ transactionId }),
    transactionId,
    policy: { version: 1, requiredConfirmations: REQUIRED_CONFIRMATIONS },
  });
}

function stableErgoView(options: StableErgoViewOptions) {
  const kind = options.kind ?? 'confirmed';
  const tipHeight = options.tipHeight ?? DEFAULT_TIP_HEIGHT;
  const inclusionHeight = options.inclusionHeight ?? DEFAULT_INCLUSION_HEIGHT;
  const tipHeaderIds = options.tipHeaderIds ?? [TIP_HEADER, TIP_HEADER];
  const ancestorHeaders = options.ancestorHeaders ?? {};
  const transactionInclusionHeaderId = options.transactionInclusionHeaderId ?? INCLUSION_HEADER;
  const canonicalInclusionHeaderId = options.canonicalInclusionHeaderId ?? transactionInclusionHeaderId;
  const transaction = {
    ...structuredClone(CONFIRMED_TRANSACTION.transaction),
    inclusionHeight,
    headerId: transactionInclusionHeaderId,
  };
  const calls: StableErgoViewCalls = {
    heights: 0,
    tipHeaders: 0,
    inclusionHeaders: 0,
    transactions: 0,
    mempool: 0,
  };

  return {
    calls,
    getCurrentHeight: async () => {
      calls.heights += 1;
      return tipHeight;
    },
    getBlockHeaderHash: async (height: number) => {
      if (height === inclusionHeight) {
        calls.inclusionHeaders += 1;
        return canonicalInclusionHeaderId;
      }
      if (Object.prototype.hasOwnProperty.call(ancestorHeaders, height)) {
        calls.inclusionHeaders += 1;
        return ancestorHeaders[height];
      }
      if (height !== tipHeight) throw new Error(`unexpected Ergo header lookup at height ${height}`);
      const index = Math.min(calls.tipHeaders, tipHeaderIds.length - 1);
      calls.tipHeaders += 1;
      return tipHeaderIds[index];
    },
    getTransaction: async (transactionId: string) => {
      calls.transactions += 1;
      expect(transactionId).toBe(options.transactionId);
      return kind === 'confirmed' ? transaction : null;
    },
    hasUnconfirmedTransaction: async (transactionId: string) => {
      calls.mempool += 1;
      expect(transactionId).toBe(options.transactionId);
      return kind === 'mempool';
    },
  };
}

function witnessed(
  primaryErgo: ReturnType<typeof stableErgoView>,
  witnessErgo: ReturnType<typeof stableErgoView>,
) {
  return {
    ergo: primaryErgo,
    witness: createAggregateSettlementErgoWitness({
      ...TEST_SOURCE_IDENTITIES,
      primaryErgo,
      primaryNodeUrl: 'http://primary.example:9052',
      witnessErgo,
      witnessNodeUrl: 'http://witness.example:9052',
    }),
  };
}

function recoveryMutation(
  overrides: Partial<ReturnType<AggregateSettlementRecoveryDeps['state']['applyAggregateSettlementRecoveryObservation']>> = {},
) {
  return {
    applied: true,
    restoredBurns: 0,
    skippedBurns: 0,
    missingPegOuts: 0,
    rolledBackBurns: 0,
    rolledBackPreFinality: false,
    ...overrides,
  };
}

function recoveryState(
  attempts: AggregateSettlementAttempt[],
  apply: (input: AggregateSettlementRecoveryMutationInput) => ReturnType<
    AggregateSettlementRecoveryDeps['state']['applyAggregateSettlementRecoveryObservation']
  >,
  confirmedAttempts: AggregateSettlementAttempt[] = [],
): AggregateSettlementRecoveryDeps['state'] {
  return {
    getRecoverableAggregateSettlementAttempts: () => attempts,
    getConfirmedAggregateSettlementAttempts: () => confirmedAttempts,
    applyAggregateSettlementRecoveryObservation: apply,
    recordConfirmedAggregateSettlementReorgObservation: () => {
      throw new Error('confirmed quarantine must not be invoked');
    },
  };
}

async function withTempDatabase(run: (dbPath: string) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'bridge-settlement-recovery-'));
  try {
    await run(join(directory, 'state.db'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function seedAttempt(
  state: StateTracker,
  mode: AggregateSettlementAttemptMode,
  burnTxHashes: string[],
  transactionId: string,
  submitted = false,
): void {
  for (const [index, burnTxHash] of burnTxHashes.entries()) {
    state.insertPegOut(
      burnTxHash,
      `02${String(index + 1).padStart(2, '0').repeat(32)}`,
      1_000_000n + BigInt(index),
      42 + index,
    );
  }
  const admission = state.recordAggregateSettlementAttempt(mode, burnTxHashes, transactionId);
  if (!submitted) return;

  const reservation = state.startPendingAggregateSettlementSubmission(admission);
  expect(state.markAggregateSettlementAttemptSubmitted(reservation, transactionId)).toBe(true);
  const submittedStatus = mode === 'batch' ? 'batch_submitted' : 'aggregate_submitted';
  for (const burnTxHash of burnTxHashes) {
    state.updatePegOutStatus(burnTxHash, submittedStatus, {
      phase1BoxId: transactionId,
      pendingAvlKey: burnTxHash,
    });
  }
}

describe('aggregate settlement recovery', () => {
  it('scans an exact-depth canonical inclusion as final under the bound policy', async () => {
    const burnTxHash = '01'.repeat(32);
    const transactionId = CONFIRMED_TX_ID;
    const ergo = stableErgoView({ transactionId });

    const rows = await scanAggregateSettlementAttempts({
      ergo,
      state: recoveryState([
        policyAttempt({ burnTxHashes: [burnTxHash], expectedTxId: transactionId }),
      ], () => {
        throw new Error('scan must not mutate recovery state');
      }),
    });

    expect(rows).toEqual([{
      mode: 'single',
      status: 'pending',
      expectedTxId: transactionId,
      submittedTxId: null,
      lookupTxId: transactionId,
      burnTxHashes: [burnTxHash],
      confirmedChain: true,
      mempool: false,
      canonical: true,
      unconfirmed: false,
      observationStatus: 'confirmed_final',
      confirmations: REQUIRED_CONFIRMATIONS,
      requiredConfirmations: REQUIRED_CONFIRMATIONS,
      inclusionHeight: DEFAULT_INCLUSION_HEIGHT,
      inclusionHeaderId: INCLUSION_HEADER,
      observedTipHeight: DEFAULT_TIP_HEIGHT,
      observedTipHeaderId: TIP_HEADER,
    }]);
    expect(ergo.calls).toEqual({
      heights: 2,
      tipHeaders: 2,
      inclusionHeaders: 1,
      transactions: 2,
      mempool: 0,
    });
  });

  it('keeps a shallow canonical inclusion submitted and records no finalization claim', async () => {
    await withTempDatabase(async (dbPath) => {
      const burnTxHash = '02'.repeat(32);
      const transactionId = CONFIRMED_TX_ID;
      const state = new StateTracker(dbPath);
      try {
        seedAttempt(state, 'single', [burnTxHash], transactionId);
        const result = await recoverAggregateSettlementAttempts({
          ergo: stableErgoView({
            transactionId,
            tipHeight: DEFAULT_TIP_HEIGHT - 1,
          }),
          state,
        });

        expect(result).toEqual({
          restoredBurns: 1,
          deferredAttempts: 0,
          missingPegOuts: 0,
          skippedBurns: 0,
          rolledBackAttempts: 0,
          rolledBackBurns: 0,
          quarantinedConfirmedAttempts: 0,
        });
        expect(state.getPegOutByTxHash(burnTxHash)?.status).toBe('aggregate_submitted');
        expect(state.getAggregateSettlementAttempt(transactionId)).toEqual(expect.objectContaining({
          status: 'submitted',
          lifecycleVersion: 1,
          recoveryBindingStatus: 'policy_v1',
          recoveryPolicyVersion: 1,
          recoveryRequiredConfirmations: REQUIRED_CONFIRMATIONS,
          ergoObservation: expect.objectContaining({
            status: 'confirmed_pre_finality',
            confirmations: REQUIRED_CONFIRMATIONS - 1,
          }),
          ergoObservationSourceCount: 1,
          ergoObservationConsensusDigest: null,
        }));
      } finally {
        state.close();
      }
    });
  });

  it('rejects an equal-height tip replacement before any local mutation', async () => {
    const burnTxHash = '03'.repeat(32);
    const transactionId = CONFIRMED_TX_ID;
    const mutations: AggregateSettlementRecoveryMutationInput[] = [];

    await expect(recoverAggregateSettlementAttempts({
      ergo: stableErgoView({
        transactionId,
        tipHeaderIds: [TIP_HEADER, REPLACEMENT_TIP_HEADER],
      }),
      state: recoveryState([
        policyAttempt({ burnTxHashes: [burnTxHash], expectedTxId: transactionId }),
      ], input => {
        mutations.push(input);
        return recoveryMutation();
      }),
    })).rejects.toThrow(/canonical tip changed/);

    expect(mutations).toEqual([]);
  });

  it('rejects a non-canonical inclusion header before any local mutation', async () => {
    const burnTxHash = '04'.repeat(32);
    const transactionId = CONFIRMED_TX_ID;
    const mutations: AggregateSettlementRecoveryMutationInput[] = [];

    await expect(recoverAggregateSettlementAttempts({
      ergo: stableErgoView({
        transactionId,
        transactionInclusionHeaderId: INCLUSION_HEADER,
        canonicalInclusionHeaderId: 'b2'.repeat(32),
      }),
      state: recoveryState([
        policyAttempt({ burnTxHashes: [burnTxHash], expectedTxId: transactionId }),
      ], input => {
        mutations.push(input);
        return recoveryMutation();
      }),
    })).rejects.toThrow(/inclusion block is not canonical/);

    expect(mutations).toEqual([]);
  });

  it('defers a pre-finality disappearance without a witness and does not invoke the reducer', async () => {
    const burnTxHash = '05'.repeat(32);
    const transactionId = '15'.repeat(32);
    const mutations: AggregateSettlementRecoveryMutationInput[] = [];
    const previousObservation = preFinalityObservation(transactionId);

    const result = await recoverAggregateSettlementAttempts({
      ergo: stableErgoView({ transactionId, kind: 'absent' }),
      state: recoveryState([
        policyAttempt({
          burnTxHashes: [burnTxHash],
          expectedTxId: transactionId,
          submittedTxId: transactionId,
          status: 'submitted',
          lifecycleVersion: 7,
          ergoObservation: previousObservation,
          ergoObservationSourceCount: 1,
        }),
      ], input => {
        mutations.push(input);
        return recoveryMutation();
      }),
    });

    expect(result).toEqual({
      restoredBurns: 0,
      deferredAttempts: 1,
      missingPegOuts: 0,
      skippedBurns: 0,
      rolledBackAttempts: 0,
      rolledBackBurns: 0,
      quarantinedConfirmedAttempts: 0,
    });
    expect(mutations).toEqual([]);
  });

  it('rejects primary and witness disagreement before destructive rollback', async () => {
    const burnTxHash = '06'.repeat(32);
    const transactionId = '16'.repeat(32);
    const mutations: AggregateSettlementRecoveryMutationInput[] = [];

    await expect(recoverAggregateSettlementAttempts({
      ...witnessed(
        stableErgoView({ transactionId, kind: 'absent' }),
        stableErgoView({ transactionId, kind: 'mempool' }),
      ),
      state: recoveryState([
        policyAttempt({
          burnTxHashes: [burnTxHash],
          expectedTxId: transactionId,
          submittedTxId: transactionId,
          status: 'submitted',
          lifecycleVersion: 3,
          ergoObservation: preFinalityObservation(transactionId),
          ergoObservationSourceCount: 1,
        }),
      ], input => {
        mutations.push(input);
        return recoveryMutation();
      }),
    })).rejects.toThrow(/sources disagree/);

    expect(mutations).toEqual([]);
  });

  it('atomically rolls back a pre-finality batch after matching distinct witness absence', async () => {
    await withTempDatabase(async (dbPath) => {
      const burns = ['07'.repeat(32), '08'.repeat(32)];
      const transactionId = CONFIRMED_TX_ID;
      const state = new StateTracker(dbPath);
      try {
        seedAttempt(state, 'batch', burns, transactionId);
        const shallow = await recoverAggregateSettlementAttempts({
          ergo: stableErgoView({
            transactionId,
            tipHeight: DEFAULT_TIP_HEIGHT - 1,
          }),
          state,
        });
        expect(shallow).toMatchObject({ restoredBurns: 2, rolledBackAttempts: 0 });
        expect(state.getAggregateSettlementAttempt(transactionId)).toEqual(expect.objectContaining({
          status: 'submitted',
          lifecycleVersion: 1,
          ergoObservation: expect.objectContaining({ status: 'confirmed_pre_finality' }),
        }));

        const rolledBack = await recoverAggregateSettlementAttempts({
          ...witnessed(
            stableErgoView({ transactionId, kind: 'absent' }),
            stableErgoView({ transactionId, kind: 'absent' }),
          ),
          state,
        });

        expect(rolledBack).toEqual({
          restoredBurns: 0,
          deferredAttempts: 1,
          missingPegOuts: 0,
          skippedBurns: 0,
          rolledBackAttempts: 1,
          rolledBackBurns: 2,
          quarantinedConfirmedAttempts: 0,
        });
        for (const burnTxHash of burns) {
          expect(state.getPegOutByTxHash(burnTxHash)?.status).toBe('detected');
        }
        expect(state.getAggregateSettlementAttempt(transactionId)).toEqual(expect.objectContaining({
          status: 'pending',
          submittedTxId: null,
          lifecycleVersion: 2,
          ergoObservation: expect.objectContaining({ status: 'absent' }),
          ergoObservationSourceCount: 2,
          ergoObservationConsensusDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
        }));
      } finally {
        state.close();
      }

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getAggregateSettlementAttempt(transactionId)).toEqual(expect.objectContaining({
          status: 'pending',
          lifecycleVersion: 2,
          ergoObservation: expect.objectContaining({ status: 'absent' }),
          ergoObservationSourceCount: 2,
        }));
        for (const burnTxHash of burns) {
          expect(reopened.getPegOutByTxHash(burnTxHash)?.status).toBe('detected');
        }
      } finally {
        reopened.close();
      }
    });
  });

  it('quarantines a locally confirmed settlement that later disappears from two Ergo sources', async () => {
    await withTempDatabase(async (dbPath) => {
      const burnTxHash = '2a'.repeat(32);
      const transactionId = CONFIRMED_TX_ID;
      const state = new StateTracker(dbPath);
      try {
        seedAttempt(state, 'single', [burnTxHash], transactionId, true);
        expect(state.confirmSubmittedSingleSettlementAttempt(
          transactionId,
          state.getAggregateSettlementAttempt(transactionId)!.lifecycleVersion,
          'single',
          burnTxHash,
          await finalObservation(transactionId),
          getSpvTrackerDigest([]),
        )).toBe(true);
        const confirmed = state.getAggregateSettlementAttempt(transactionId)!;
        expect(confirmed).toEqual(expect.objectContaining({
          status: 'confirmed',
          recoveryQuarantine: null,
        }));
        expect(state.getPegOutByTxHash(burnTxHash)?.status).toBe('phase2_unlocked');

        const result = await recoverAggregateSettlementAttempts({
          ...witnessed(
            stableErgoView({ transactionId, kind: 'absent' }),
            stableErgoView({ transactionId, kind: 'absent' }),
          ),
          state,
        });

        expect(result).toEqual({
          restoredBurns: 0,
          deferredAttempts: 0,
          missingPegOuts: 0,
          skippedBurns: 0,
          rolledBackAttempts: 0,
          rolledBackBurns: 0,
          quarantinedConfirmedAttempts: 1,
        });
        expect(state.getPegOutByTxHash(burnTxHash)?.status).toBe('phase2_unlocked');
        expect(state.getAllAvlKeys()).toEqual([burnTxHash]);
        expect(state.getAggregateSettlementAttempt(transactionId)).toEqual(expect.objectContaining({
          status: 'confirmed',
          lifecycleVersion: confirmed.lifecycleVersion + 1,
          recoveryQuarantine: expect.objectContaining({
            reason: 'confirmed_reorg_observed',
            sourceCount: 2,
            consensusDigestHex: expect.stringMatching(/^[0-9a-f]{64}$/),
            observation: expect.objectContaining({
              status: 'absent',
              transactionIdHex: transactionId,
            }),
          }),
        }));
      } finally {
        state.close();
      }
    });
  });

  it('defers a locally confirmed disappearance without witness consensus', async () => {
    await withTempDatabase(async (dbPath) => {
      const burnTxHash = '2b'.repeat(32);
      const transactionId = CONFIRMED_TX_ID;
      const state = new StateTracker(dbPath);
      try {
        seedAttempt(state, 'single', [burnTxHash], transactionId, true);
        expect(state.confirmSubmittedSingleSettlementAttempt(
          transactionId,
          state.getAggregateSettlementAttempt(transactionId)!.lifecycleVersion,
          'single',
          burnTxHash,
          await finalObservation(transactionId),
          getSpvTrackerDigest([]),
        )).toBe(true);
        const confirmed = state.getAggregateSettlementAttempt(transactionId)!;

        const result = await recoverAggregateSettlementAttempts({
          ergo: stableErgoView({ transactionId, kind: 'absent' }),
          state,
        });

        expect(result).toEqual({
          restoredBurns: 0,
          deferredAttempts: 1,
          missingPegOuts: 0,
          skippedBurns: 0,
          rolledBackAttempts: 0,
          rolledBackBurns: 0,
          quarantinedConfirmedAttempts: 0,
        });
        expect(state.getAggregateSettlementAttempt(transactionId)).toEqual(expect.objectContaining({
          status: 'confirmed',
          lifecycleVersion: confirmed.lifecycleVersion,
          recoveryQuarantine: null,
        }));
        expect(state.getPegOutByTxHash(burnTxHash)?.status).toBe('phase2_unlocked');
      } finally {
        state.close();
      }
    });
  });

  it('requires a matching witness before abandonment', async () => {
    const burnTxHash = '09'.repeat(32);
    const transactionId = '19'.repeat(32);
    let mutations = 0;
    const state: AggregateSettlementAbandonDeps['state'] = {
      getAggregateSettlementAttempt: () => policyAttempt({
        burnTxHashes: [burnTxHash],
        expectedTxId: transactionId,
        submittedTxId: transactionId,
        status: 'submitted',
        lifecycleVersion: 4,
      }),
      recordAggregateSettlementRecoveryObservation: () => {
        throw new Error('witness-required rejection must not record recovery history');
      },
      abandonPendingAggregateSettlementTransportReservation: () => {
        throw new Error('witness-required rejection must not retire a transport reservation');
      },
      abandonSubmittedAggregateSettlementAttempt: () => {
        mutations += 1;
        return { resetBurns: 1, skippedBurns: 0 };
      },
    };

    await expect(abandonAggregateSettlementAttempt({
      expectedTxId: transactionId,
      ergo: stableErgoView({ transactionId, kind: 'absent' }),
      state,
    })).rejects.toThrow(/matching witness RPC observation is required/);

    expect(mutations).toBe(0);
  });

  it('rejects primary and witness disagreement before abandonment', async () => {
    const burnTxHash = '0a'.repeat(32);
    const transactionId = '1a'.repeat(32);
    let mutations = 0;
    const state: AggregateSettlementAbandonDeps['state'] = {
      getAggregateSettlementAttempt: () => policyAttempt({
        burnTxHashes: [burnTxHash],
        expectedTxId: transactionId,
        submittedTxId: transactionId,
        status: 'submitted',
        lifecycleVersion: 5,
      }),
      recordAggregateSettlementRecoveryObservation: () => {
        throw new Error('witness-disagreement rejection must not record recovery history');
      },
      abandonPendingAggregateSettlementTransportReservation: () => {
        throw new Error('witness-disagreement rejection must not retire a transport reservation');
      },
      abandonSubmittedAggregateSettlementAttempt: () => {
        mutations += 1;
        return { resetBurns: 1, skippedBurns: 0 };
      },
    };

    await expect(abandonAggregateSettlementAttempt({
      expectedTxId: transactionId,
      ...witnessed(
        stableErgoView({ transactionId, kind: 'absent' }),
        stableErgoView({ transactionId, kind: 'mempool' }),
      ),
      state,
    })).rejects.toThrow(/sources disagree/);

    expect(mutations).toBe(0);
  });

  it.each([
    ['mempool', DEFAULT_TIP_HEIGHT, /still present in mempool/],
    ['confirmed', DEFAULT_TIP_HEIGHT - 1, /still confirmed pre-finality/],
    ['confirmed', DEFAULT_TIP_HEIGHT, /still confirmed final/],
  ] as const)(
    'keeps abandonment fail-closed for matching %s observations at tip %i',
    async (kind, tipHeight, error) => {
      const burnTxHash = '0b'.repeat(32);
      const transactionId = kind === 'confirmed' ? CONFIRMED_TX_ID : '1b'.repeat(32);
      let mutations = 0;
      const state: AggregateSettlementAbandonDeps['state'] = {
        getAggregateSettlementAttempt: () => policyAttempt({
          burnTxHashes: [burnTxHash],
          expectedTxId: transactionId,
          submittedTxId: transactionId,
          status: 'submitted',
          lifecycleVersion: 6,
        }),
        recordAggregateSettlementRecoveryObservation: () => {
          throw new Error('present-transaction rejection must not record recovery history');
        },
        abandonPendingAggregateSettlementTransportReservation: () => {
          throw new Error('present-transaction rejection must not retire a transport reservation');
        },
        abandonSubmittedAggregateSettlementAttempt: () => {
          mutations += 1;
          return { resetBurns: 1, skippedBurns: 0 };
        },
      };

      await expect(abandonAggregateSettlementAttempt({
        expectedTxId: transactionId,
        ...witnessed(
          stableErgoView({ transactionId, kind, tipHeight }),
          stableErgoView({ transactionId, kind, tipHeight }),
        ),
        state,
      })).rejects.toThrow(error);

      expect(mutations).toBe(0);
    },
  );

  it('retires an ambiguous pending transport only after a canonical descendant absence window', async () => {
    await withTempDatabase(async (dbPath) => {
      const burnTxHash = '1f'.repeat(32);
      const transactionId = '2f'.repeat(32);
      const state = new StateTracker(dbPath);
      try {
        seedAttempt(state, 'single', [burnTxHash], transactionId);
        const pending = state.getAggregateSettlementAttempt(transactionId)!;
        state.startPendingAggregateSettlementSubmission({
          expectedTxId: pending.expectedTxId,
          lifecycleVersion: pending.lifecycleVersion,
          mode: pending.mode,
          burnTxHashes: pending.burnTxHashes,
        });

        const first = await abandonAggregateSettlementAttempt({
          expectedTxId: transactionId,
          ...witnessed(
            stableErgoView({ transactionId, kind: 'absent' }),
            stableErgoView({ transactionId, kind: 'absent' }),
          ),
          state,
        });
        expect(first).toEqual({
          expectedTxId: transactionId,
          resetBurns: 0,
          skippedBurns: 0,
          missingPegOuts: 0,
          abandoned: false,
          outcome: 'evidence_recorded',
        });
        expect(state.getAggregateSettlementAttempt(transactionId)).toEqual(expect.objectContaining({
          status: 'pending',
          submittedTxId: null,
          lifecycleVersion: 1,
          transportReservationDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
          transportStartedAt: expect.any(String),
          transportCompletedAt: null,
        }));
        expect(state.getPegOutByTxHash(burnTxHash)?.status).toBe('detected');

        const second = await abandonAggregateSettlementAttempt({
          expectedTxId: transactionId,
          ...witnessed(
            stableErgoView({
              transactionId,
              kind: 'absent',
              tipHeight: DEFAULT_TIP_HEIGHT + REQUIRED_CONFIRMATIONS,
              tipHeaderIds: ['f1'.repeat(32), 'f1'.repeat(32)],
              ancestorHeaders: { [DEFAULT_TIP_HEIGHT]: TIP_HEADER },
            }),
            stableErgoView({
              transactionId,
              kind: 'absent',
              tipHeight: DEFAULT_TIP_HEIGHT + REQUIRED_CONFIRMATIONS,
              tipHeaderIds: ['f1'.repeat(32), 'f1'.repeat(32)],
              ancestorHeaders: { [DEFAULT_TIP_HEIGHT]: TIP_HEADER },
            }),
          ),
          state,
        });
        expect(second).toEqual({
          expectedTxId: transactionId,
          resetBurns: 0,
          skippedBurns: 1,
          missingPegOuts: 0,
          abandoned: true,
          outcome: 'retired',
        });
        expect(state.getAggregateSettlementAttempt(transactionId)).toEqual(expect.objectContaining({
          status: 'abandoned',
          abandonmentReason: 'pending_transport_absence',
          submittedTxId: null,
          lifecycleVersion: 2,
          transportReservationDigest: null,
          transportStartedAt: null,
          transportCompletedAt: null,
          ergoObservation: expect.objectContaining({ status: 'absent' }),
          ergoObservationSourceCount: 2,
          ergoObservationConsensusDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
        }));
        expect(state.getPegOutByTxHash(burnTxHash)?.status).toBe('detected');
        expect(state.getAllAvlKeys()).toEqual([]);
      } finally {
        state.close();
      }
    });
  });

  it('replays a committed pending-transport retirement after restart without network access', async () => {
    await withTempDatabase(async (dbPath) => {
      const burnTxHash = '21'.repeat(32);
      const transactionId = '31'.repeat(32);
      const state = new StateTracker(dbPath);
      try {
        seedAttempt(state, 'single', [burnTxHash], transactionId);
        const pending = state.getAggregateSettlementAttempt(transactionId)!;
        state.startPendingAggregateSettlementSubmission({
          expectedTxId: pending.expectedTxId,
          lifecycleVersion: pending.lifecycleVersion,
          mode: pending.mode,
          burnTxHashes: pending.burnTxHashes,
        });
        await abandonAggregateSettlementAttempt({
          expectedTxId: transactionId,
          ...witnessed(
            stableErgoView({ transactionId, kind: 'absent' }),
            stableErgoView({ transactionId, kind: 'absent' }),
          ),
          state,
        });
        const retired = await abandonAggregateSettlementAttempt({
          expectedTxId: transactionId,
          ...witnessed(
            stableErgoView({
              transactionId,
              kind: 'absent',
              tipHeight: DEFAULT_TIP_HEIGHT + REQUIRED_CONFIRMATIONS,
              tipHeaderIds: ['f2'.repeat(32), 'f2'.repeat(32)],
              ancestorHeaders: { [DEFAULT_TIP_HEIGHT]: TIP_HEADER },
            }),
            stableErgoView({
              transactionId,
              kind: 'absent',
              tipHeight: DEFAULT_TIP_HEIGHT + REQUIRED_CONFIRMATIONS,
              tipHeaderIds: ['f2'.repeat(32), 'f2'.repeat(32)],
              ancestorHeaders: { [DEFAULT_TIP_HEIGHT]: TIP_HEADER },
            }),
          ),
          state,
        });
        expect(retired.outcome).toBe('retired');
      } finally {
        state.close();
      }

      const reopened = new StateTracker(dbPath);
      const unexpectedNetwork = async () => {
        throw new Error('network must not be called after committed pending retirement');
      };
      try {
        await expect(abandonAggregateSettlementAttempt({
          expectedTxId: transactionId,
          state: reopened,
          ergo: {
            getCurrentHeight: unexpectedNetwork,
            getBlockHeaderHash: unexpectedNetwork,
            getTransaction: unexpectedNetwork,
            hasUnconfirmedTransaction: unexpectedNetwork,
          },
        })).resolves.toEqual({
          expectedTxId: transactionId,
          resetBurns: 0,
          skippedBurns: 1,
          missingPegOuts: 0,
          abandoned: true,
          outcome: 'already_retired',
        });
      } finally {
        reopened.close();
      }
    });
  });

  it('does not reinterpret an unrelated abandonment as an absence retirement', async () => {
    await withTempDatabase(async (dbPath) => {
      const burnTxHash = '22'.repeat(32);
      const transactionId = '32'.repeat(32);
      const state = new StateTracker(dbPath);
      const unexpectedNetwork = async () => {
        throw new Error('network must not be called for an already-abandoned journal');
      };
      try {
        seedAttempt(state, 'single', [burnTxHash], transactionId);
        expect(state.markAggregateSettlementAttemptAbandoned(transactionId)).toBe(true);

        await expect(abandonAggregateSettlementAttempt({
          expectedTxId: transactionId,
          state,
          ergo: {
            getCurrentHeight: unexpectedNetwork,
            getBlockHeaderHash: unexpectedNetwork,
            getTransaction: unexpectedNetwork,
            hasUnconfirmedTransaction: unexpectedNetwork,
          },
        })).resolves.toEqual({
          expectedTxId: transactionId,
          resetBurns: 0,
          skippedBurns: 1,
          missingPegOuts: 0,
          abandoned: false,
          outcome: 'already_abandoned',
        });
      } finally {
        state.close();
      }
    });
  });

  it('refuses to abandon an unreserved pending journal', async () => {
    await withTempDatabase(async (dbPath) => {
      const burnTxHash = '20'.repeat(32);
      const transactionId = '30'.repeat(32);
      const state = new StateTracker(dbPath);
      try {
        seedAttempt(state, 'single', [burnTxHash], transactionId);
        await expect(abandonAggregateSettlementAttempt({
          expectedTxId: transactionId,
          ...witnessed(
            stableErgoView({ transactionId, kind: 'absent' }),
            stableErgoView({ transactionId, kind: 'absent' }),
          ),
          state,
        })).rejects.toThrow(/pending attempt has no active transport reservation/);
        expect(state.getAggregateSettlementAttempt(transactionId)).toEqual(expect.objectContaining({
          status: 'pending',
          lifecycleVersion: 0,
          transportReservationDigest: null,
        }));
      } finally {
        state.close();
      }
    });
  });

  it('records the first absence and abandons only after a canonical descendant absence window', async () => {
    await withTempDatabase(async (dbPath) => {
      const burnTxHash = '0c'.repeat(32);
      const transactionId = '1c'.repeat(32);
      const state = new StateTracker(dbPath);
      try {
        seedAttempt(state, 'single', [burnTxHash], transactionId, true);
        const first = await abandonAggregateSettlementAttempt({
          expectedTxId: transactionId,
          ...witnessed(
            stableErgoView({ transactionId, kind: 'absent' }),
            stableErgoView({ transactionId, kind: 'absent' }),
          ),
          state,
        });

        expect(first).toEqual({
          expectedTxId: transactionId,
          resetBurns: 0,
          skippedBurns: 0,
          missingPegOuts: 0,
          abandoned: false,
          outcome: 'evidence_recorded',
        });
        expect(state.getPegOutByTxHash(burnTxHash)?.status).toBe('aggregate_submitted');
        expect(state.getAggregateSettlementAttempt(transactionId)).toEqual(expect.objectContaining({
          status: 'submitted',
          submittedTxId: transactionId,
          lifecycleVersion: 2,
          ergoObservation: null,
        }));

        const second = await abandonAggregateSettlementAttempt({
          expectedTxId: transactionId,
          ...witnessed(
            stableErgoView({
              transactionId,
              kind: 'absent',
              tipHeight: DEFAULT_TIP_HEIGHT + REQUIRED_CONFIRMATIONS,
              tipHeaderIds: ['d1'.repeat(32), 'd1'.repeat(32)],
              ancestorHeaders: { [DEFAULT_TIP_HEIGHT]: TIP_HEADER },
            }),
            stableErgoView({
              transactionId,
              kind: 'absent',
              tipHeight: DEFAULT_TIP_HEIGHT + REQUIRED_CONFIRMATIONS,
              tipHeaderIds: ['d1'.repeat(32), 'd1'.repeat(32)],
              ancestorHeaders: { [DEFAULT_TIP_HEIGHT]: TIP_HEADER },
            }),
          ),
          state,
        });

        expect(second).toEqual({
          expectedTxId: transactionId,
          resetBurns: 1,
          skippedBurns: 0,
          missingPegOuts: 0,
          abandoned: true,
          outcome: 'retired',
        });
        expect(state.getPegOutByTxHash(burnTxHash)?.status).toBe('detected');
        expect(state.getAggregateSettlementAttempt(transactionId)).toEqual(expect.objectContaining({
          status: 'abandoned',
          abandonmentReason: 'submitted_absence',
          submittedTxId: null,
          lifecycleVersion: 3,
          ergoObservation: expect.objectContaining({ status: 'absent' }),
          ergoObservationSourceCount: 2,
          ergoObservationConsensusDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
        }));
      } finally {
        state.close();
      }
    });
  });

  it('replays a committed absence retirement as terminal success without network access', async () => {
    await withTempDatabase(async (dbPath) => {
      const burnTxHash = '0d'.repeat(32);
      const transactionId = '1d'.repeat(32);
      const state = new StateTracker(dbPath);
      try {
        seedAttempt(state, 'single', [burnTxHash], transactionId, true);
        await abandonAggregateSettlementAttempt({
          expectedTxId: transactionId,
          ...witnessed(
            stableErgoView({ transactionId, kind: 'absent' }),
            stableErgoView({ transactionId, kind: 'absent' }),
          ),
          state,
        });
        const retired = await abandonAggregateSettlementAttempt({
          expectedTxId: transactionId,
          ...witnessed(
            stableErgoView({
              transactionId,
              kind: 'absent',
              tipHeight: DEFAULT_TIP_HEIGHT + REQUIRED_CONFIRMATIONS,
              tipHeaderIds: ['d2'.repeat(32), 'd2'.repeat(32)],
              ancestorHeaders: { [DEFAULT_TIP_HEIGHT]: TIP_HEADER },
            }),
            stableErgoView({
              transactionId,
              kind: 'absent',
              tipHeight: DEFAULT_TIP_HEIGHT + REQUIRED_CONFIRMATIONS,
              tipHeaderIds: ['d2'.repeat(32), 'd2'.repeat(32)],
              ancestorHeaders: { [DEFAULT_TIP_HEIGHT]: TIP_HEADER },
            }),
          ),
          state,
        });
        expect(retired.outcome).toBe('retired');
      } finally {
        state.close();
      }

      const reopened = new StateTracker(dbPath);
      const unexpectedNetwork = async () => {
        throw new Error('network must not be called after committed retirement');
      };
      try {
        await expect(abandonAggregateSettlementAttempt({
          expectedTxId: transactionId,
          state: reopened,
          ergo: {
            getCurrentHeight: unexpectedNetwork,
            getBlockHeaderHash: unexpectedNetwork,
            getTransaction: unexpectedNetwork,
            hasUnconfirmedTransaction: unexpectedNetwork,
          },
        })).resolves.toEqual({
          expectedTxId: transactionId,
          resetBurns: 0,
          skippedBurns: 1,
          missingPegOuts: 0,
          abandoned: true,
          outcome: 'already_retired',
        });
      } finally {
        reopened.close();
      }
    });
  });

  it('does not count legacy origin-only absence history toward destructive retirement', async () => {
    await withTempDatabase(async (dbPath) => {
      const burnTxHash = '0f'.repeat(32);
      const transactionId = '1f'.repeat(32);
      const state = new StateTracker(dbPath);
      try {
        seedAttempt(state, 'single', [burnTxHash], transactionId, true);
        const attempt = state.getAggregateSettlementAttempt(transactionId)!;
        const legacyAbsence = createAggregateSettlementErgoObservationRecord({
          policyVersion: 1,
          requiredConfirmations: REQUIRED_CONFIRMATIONS,
          status: 'absent',
          transactionIdHex: transactionId,
          transactionDigestHex: null,
          inclusionHeight: null,
          inclusionHeaderIdHex: null,
          observedTipHeight: DEFAULT_TIP_HEIGHT,
          observedTipHeaderIdHex: TIP_HEADER,
          confirmations: 0,
        });
        const raw = new Database(dbPath);
        try {
          raw.prepare(`
            INSERT INTO aggregate_settlement_recovery_observations (
              expected_tx_id,
              lifecycle_version,
              purpose,
              observation_policy_version,
              observation_required_confirmations,
              observation_status,
              observation_transaction_digest,
              observation_inclusion_height,
              observation_inclusion_header_id,
              observation_tip_height,
              observation_tip_header_id,
              observation_confirmations,
              observation_digest,
              source_count,
              consensus_digest
            ) VALUES (?, ?, 'abandonment_absence', ?, ?, 'absent', NULL, NULL, NULL, ?, ?, 0, ?, 2, ?)
          `).run(
            transactionId,
            attempt.lifecycleVersion,
            legacyAbsence.policyVersion,
            legacyAbsence.requiredConfirmations,
            legacyAbsence.observedTipHeight,
            legacyAbsence.observedTipHeaderIdHex,
            legacyAbsence.observationDigestHex,
            '91'.repeat(32),
          );
        } finally {
          raw.close();
        }

        const result = await abandonAggregateSettlementAttempt({
          expectedTxId: transactionId,
          ...witnessed(
            stableErgoView({
              transactionId,
              kind: 'absent',
              tipHeight: DEFAULT_TIP_HEIGHT + REQUIRED_CONFIRMATIONS,
              tipHeaderIds: ['d3'.repeat(32), 'd3'.repeat(32)],
              ancestorHeaders: { [DEFAULT_TIP_HEIGHT]: TIP_HEADER },
            }),
            stableErgoView({
              transactionId,
              kind: 'absent',
              tipHeight: DEFAULT_TIP_HEIGHT + REQUIRED_CONFIRMATIONS,
              tipHeaderIds: ['d3'.repeat(32), 'd3'.repeat(32)],
              ancestorHeaders: { [DEFAULT_TIP_HEIGHT]: TIP_HEADER },
            }),
          ),
          state,
        });

        expect(result).toMatchObject({
          abandoned: false,
          outcome: 'evidence_recorded',
        });
        expect(state.getAggregateSettlementAttempt(transactionId)).toMatchObject({
          status: 'submitted',
          abandonmentReason: null,
        });
      } finally {
        state.close();
      }
    });
  });

  it('rejects abandonment when the prior absence tip is no longer canonical', async () => {
    await withTempDatabase(async (dbPath) => {
      const burnTxHash = '0e'.repeat(32);
      const transactionId = '1e'.repeat(32);
      const state = new StateTracker(dbPath);
      try {
        seedAttempt(state, 'single', [burnTxHash], transactionId, true);
        await abandonAggregateSettlementAttempt({
          expectedTxId: transactionId,
          ...witnessed(
            stableErgoView({ transactionId, kind: 'absent' }),
            stableErgoView({ transactionId, kind: 'absent' }),
          ),
          state,
        });

        await expect(abandonAggregateSettlementAttempt({
          expectedTxId: transactionId,
          ...witnessed(
            stableErgoView({
              transactionId,
              kind: 'absent',
              tipHeight: DEFAULT_TIP_HEIGHT + REQUIRED_CONFIRMATIONS,
              tipHeaderIds: ['e1'.repeat(32), 'e1'.repeat(32)],
              ancestorHeaders: { [DEFAULT_TIP_HEIGHT]: 'ff'.repeat(32) },
            }),
            stableErgoView({
              transactionId,
              kind: 'absent',
              tipHeight: DEFAULT_TIP_HEIGHT + REQUIRED_CONFIRMATIONS,
              tipHeaderIds: ['e1'.repeat(32), 'e1'.repeat(32)],
              ancestorHeaders: { [DEFAULT_TIP_HEIGHT]: TIP_HEADER },
            }),
          ),
          state,
        })).rejects.toThrow(/prior absence tip is not a canonical ancestor/);

        expect(state.getPegOutByTxHash(burnTxHash)?.status).toBe('aggregate_submitted');
        expect(state.getAggregateSettlementAttempt(transactionId)).toEqual(expect.objectContaining({
          status: 'submitted',
          submittedTxId: transactionId,
          lifecycleVersion: 2,
        }));
      } finally {
        state.close();
      }
    });
  });

  it('normalizes active burn hashes without treating the journal as chain authority', () => {
    const burnTxHash = '0d'.repeat(32);
    const transactionId = '1d'.repeat(32);
    const active = getActiveAggregateSettlementAttemptBurnTxHashes([
      policyAttempt({ burnTxHashes: [`0x${burnTxHash}`], expectedTxId: transactionId }),
    ]);

    expect([...active]).toEqual([burnTxHash]);
  });
});
