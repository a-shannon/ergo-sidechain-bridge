import { beforeEach, describe, expect, it, vi } from 'vitest';

const dependencies = vi.hoisted(() => ({
  assertDupProvenance: vi.fn(),
  assertPayoutProvenance: vi.fn(),
  assertSettlementConsensusProvenance: vi.fn(),
  collectPayout: vi.fn(),
  observeSettlement: vi.fn(),
  reconstructDup: vi.fn(),
}));

vi.mock('./authenticated-v2-dup-reconstruction.js', () => ({
  assertAuthenticatedV2DupReconstructionProvenance:
    dependencies.assertDupProvenance,
  reconstructAuthenticatedV2DupHistoryFromDistinctSources:
    dependencies.reconstructDup,
}));

vi.mock('./authenticated-v2-historical-payout-evidence.js', () => ({
  assertAuthenticatedV2HistoricalPayoutAgreementProvenance:
    dependencies.assertPayoutProvenance,
  collectAuthenticatedV2HistoricalPayoutFromDistinctSources:
    dependencies.collectPayout,
}));

vi.mock('./adapters/aggregate-settlement-ergo-observation.js', () => ({
  assertMatchingAggregateSettlementErgoObservationConsensusProvenance:
    dependencies.assertSettlementConsensusProvenance,
  observeMatchingAggregateSettlementErgoTransaction:
    dependencies.observeSettlement,
}));

import {
  projectCrossLedgerBackingAlarmFromTerminalLiabilityResolution,
  reconstructPegOutTerminalLiabilities,
  type ActiveAuthenticatedSettlementBinding,
  type InFlightAggregateSettlementAttempt,
  type PegOutTerminalLiabilityResolution,
} from './peg-out-terminal-liability-reconstruction.js';
import type { OutstandingPegOutLiabilityObservation } from './relayer-core/cross-ledger-backing-alarm.js';
import {
  createCompleteSidechainBackingSnapshot,
  reconcileCompletePegOutBackingInventory,
  type CompletePegOutBackingInventoryEntry,
} from './relayer-core/peg-out-backing-inventory.js';
import { deriveTrustlessBurnIdHex } from './ergo-settlement-core/trustless-burn-id.js';

const LEGACY_BURN_KEY = '31'.repeat(32);
const SETTLEMENT_TX_ID = '41'.repeat(32);
const PAYOUT_TREE = `0008cd02${'51'.repeat(32)}`;
const DUP_NFT_ID = '61'.repeat(32);
const DUP_TREE = `1008cd02${'62'.repeat(32)}`;

function observation(
  overrides: Partial<OutstandingPegOutLiabilityObservation> = {},
): OutstandingPegOutLiabilityObservation {
  const candidate: OutstandingPegOutLiabilityObservation = {
    burnIdHex: '',
    sidechainIdHex: '21'.repeat(32),
    sidechainTransactionHashHex: LEGACY_BURN_KEY,
    sidechainBlockHashHex: '22'.repeat(32),
    sidechainLogIndex: 3,
    sidechainBurnHeight: 1_200,
    amountNanoErg: 3_900_000n,
    ergoRecipientAddress: PAYOUT_TREE,
    inFlightSettlementTransactionIdHex: null,
    phase2UnlockTransactionIdHex: null,
    status: 'detected',
    ...overrides,
  };
  return Object.freeze({
    ...candidate,
    burnIdHex: overrides.burnIdHex ?? deriveTrustlessBurnIdHex({
      sidechainIdHex: candidate.sidechainIdHex,
      sidechainTxHashHex: candidate.sidechainTransactionHashHex,
      eventIndex: candidate.sidechainLogIndex,
    }),
  });
}

function source(observationSourceId: string): any {
  return {
    observationSourceId,
    async getBlockByHeaderId() { return null; },
    async getBoxBinaryByIdOrNull() { return null; },
  };
}

function authenticatedV2() {
  return {
    primarySource: source('https://primary.example.invalid'),
    witnessSource: source('https://witness.example.invalid'),
    duplicatePreventionNftIdHex: DUP_NFT_ID,
    duplicatePreventionErgoTreeHex: DUP_TREE,
    settlementObservationSources: {
      primarySource: { sourceIdHex: '91'.repeat(32) },
      witnessSource: { sourceIdHex: '92'.repeat(32) },
    } as any,
  };
}

function completeInventory(
  observations: readonly OutstandingPegOutLiabilityObservation[],
  overrides: Readonly<{
    pinnedHeight?: number;
    pinnedBlockHashHex?: string;
    entries?: readonly CompletePegOutBackingInventoryEntry[];
  }> = {},
) {
  const entries = overrides.entries ?? observations.map(item => Object.freeze({
    burnIdHex: item.burnIdHex,
    sidechainIdHex: item.sidechainIdHex,
    sidechainTransactionHashHex: item.sidechainTransactionHashHex,
    sidechainBlockHashHex: item.sidechainBlockHashHex,
    sidechainLogIndex: item.sidechainLogIndex,
    sidechainBurnHeight: item.sidechainBurnHeight,
    amountNanoErg: item.amountNanoErg,
    ergoRecipientAddress: item.ergoRecipientAddress,
    user: '0x0000000000000000000000000000000000000001',
  }));
  return reconcileCompletePegOutBackingInventory({
    entries,
    persistence: {
      persistAndRevalidateAll: (entries, validate) =>
        validate(entries.map(() => 'revalidated' as const)),
    },
    scanFromHeight: 0,
    pinnedHeight: overrides.pinnedHeight ?? 1_400,
    pinnedBlockHashHex:
      overrides.pinnedBlockHashHex ?? 'a1'.repeat(32),
  });
}

function reconstructionInput(
  observations: readonly OutstandingPegOutLiabilityObservation[],
  profile: ReturnType<typeof authenticatedV2> | null = authenticatedV2(),
  currentObservations: readonly OutstandingPegOutLiabilityObservation[] = observations,
  totalSupplyNanoErg = 9_000_000n,
  aggregateSettlementAttempts:
    readonly InFlightAggregateSettlementAttempt[] = [],
  authenticatedSettlementBindings:
    readonly ActiveAuthenticatedSettlementBinding[] = [],
) {
  return {
    observations,
    aggregateSettlementAttempts,
    authenticatedSettlementBindings,
    authenticatedV2: profile,
    sidechainBackingSnapshot: createCompleteSidechainBackingSnapshot({
      inventory: completeInventory(currentObservations),
      totalSupplyNanoErg,
    }),
  };
}

function authenticatedSettlementBinding(
  member: OutstandingPegOutLiabilityObservation,
  overrides: Partial<ActiveAuthenticatedSettlementBinding> = {},
): ActiveAuthenticatedSettlementBinding {
  return Object.freeze({
    candidateIdHex: '42'.repeat(32),
    burnIdHex: member.burnIdHex,
    sidechainTransactionHashHex: member.sidechainTransactionHashHex,
    expectedTransactionIdHex: null,
    status: 'prepared' as const,
    ...overrides,
  });
}

function settlementAttempt(
  overrides: Partial<InFlightAggregateSettlementAttempt> = {},
): InFlightAggregateSettlementAttempt {
  return Object.freeze({
    mode: 'single' as const,
    expectedTxId: SETTLEMENT_TX_ID,
    submittedTxId: SETTLEMENT_TX_ID,
    burnTxHashes: Object.freeze([LEGACY_BURN_KEY]),
    status: 'submitted' as const,
    ...overrides,
  });
}

function reconstruction() {
  return {
    observationDigestHex: '71'.repeat(32),
    distinctSourceAgreement: true,
    historyKeys: [LEGACY_BURN_KEY],
    transitions: [{
      burnIdHex: LEGACY_BURN_KEY,
      spendingTransactionIdHex: SETTLEMENT_TX_ID,
      spendingBlockIdHex: '72'.repeat(32),
      spendingInclusionHeight: 1_300,
      payoutBoxIdHex: '73'.repeat(32),
      payoutValueNanoErg: '3900000',
    }],
  };
}

function payoutAgreement(overrides: Record<string, unknown> = {}) {
  return {
    view: {
      legacyHistoryKeyHex: LEGACY_BURN_KEY,
      ergoSettlementTransactionIdHex: SETTLEMENT_TX_ID,
      ergoSettlementBlockIdHex: '72'.repeat(32),
      ergoSettlementInclusionHeight: 1_300,
      payoutBoxIdHex: '73'.repeat(32),
      payoutValueNanoErg: '3900000',
      payoutErgoTreeHex: PAYOUT_TREE,
      ...overrides,
    },
    sources: {
      agreementDigestHex: '74'.repeat(32),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.reconstructDup.mockResolvedValue(reconstruction());
  dependencies.collectPayout.mockResolvedValue(payoutAgreement());
  dependencies.observeSettlement.mockResolvedValue({
    consensus: {
      record: {
        status: 'confirmed_final',
        transactionIdHex: SETTLEMENT_TX_ID,
        inclusionHeight: 1_300,
        inclusionHeaderIdHex: '72'.repeat(32),
      },
    },
  });
});

describe('peg-out terminal liability reconstruction', () => {
  it('retains current burns and excludes only an exactly reconstructed authenticated V2 payout', async () => {
    const pending = observation({
      sidechainTransactionHashHex: '33'.repeat(32),
      amountNanoErg: 1_000_000n,
    });
    const settled = observation({
      sidechainLogIndex: 4,
      ergoRecipientAddress: `02${'51'.repeat(32)}`,
      phase2UnlockTransactionIdHex: SETTLEMENT_TX_ID,
      status: 'phase2_unlocked',
    });
    const profile = authenticatedV2();

    const input = reconstructionInput([pending, settled], profile);
    const resolution = await reconstructPegOutTerminalLiabilities(input);

    expect(resolution.retainedLiabilities).toEqual([pending]);
    expect(resolution.excludedAuthenticatedV2Payouts).toEqual([{
      burnIdHex: settled.burnIdHex,
      legacyHistoryKeyHex: LEGACY_BURN_KEY,
      ergoSettlementTransactionIdHex: SETTLEMENT_TX_ID,
      ergoSettlementBlockIdHex: '72'.repeat(32),
      ergoSettlementInclusionHeight: 1_300,
      payoutBoxIdHex: '73'.repeat(32),
      payoutValueNanoErg: 3_900_000n,
      payoutErgoTreeHex: PAYOUT_TREE,
      payoutAgreementDigestHex: '74'.repeat(32),
    }]);
    expect(dependencies.reconstructDup).toHaveBeenCalledWith({
      primarySource: profile.primarySource,
      witnessSource: profile.witnessSource,
      duplicatePreventionNftIdHex: DUP_NFT_ID,
      duplicatePreventionErgoTreeHex: DUP_TREE,
    });
    expect(dependencies.collectPayout).toHaveBeenCalledWith(expect.objectContaining({
      legacyHistoryKeyHex: LEGACY_BURN_KEY,
      authenticatedV2Reconstruction: expect.any(Object),
      primarySourceIdHex: expect.stringMatching(/^[0-9a-f]{64}$/),
      witnessSourceIdHex: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(dependencies.observeSettlement).toHaveBeenCalledWith({
      primary: profile.settlementObservationSources.primarySource,
      witness: profile.settlementObservationSources.witnessSource,
      transactionId: SETTLEMENT_TX_ID,
    });

    expect(projectCrossLedgerBackingAlarmFromTerminalLiabilityResolution({
      sidechainBackingSnapshot: input.sidechainBackingSnapshot,
      canonicalVaultBackingNanoErg: 10_000_000n,
      resolution,
    })).toMatchObject({
      pendingExitLiabilityNanoErg: 1_000_000n,
      requiredBackingNanoErg: 10_000_000n,
      deficitNanoErg: 0n,
    });
  });

  it('does not require Ergo reconstruction while every liability remains pending', async () => {
    const observations = [observation(), observation({
        sidechainTransactionHashHex: '32'.repeat(32),
        sidechainLogIndex: 5,
        status: 'confirmed',
      })];
    const resolution = await reconstructPegOutTerminalLiabilities(
      reconstructionInput(observations, null),
    );

    expect(resolution.retainedLiabilities).toHaveLength(2);
    expect(dependencies.reconstructDup).not.toHaveBeenCalled();
    expect(dependencies.collectPayout).not.toHaveBeenCalled();
  });

  it('retains phase-1 and submitted exits only after rebinding their current burns and journals', async () => {
    const phase1 = observation({
      sidechainTransactionHashHex: '34'.repeat(32),
      sidechainLogIndex: 5,
      amountNanoErg: 1_000_000n,
      status: 'phase1_created',
    });
    const submitted = observation({
      inFlightSettlementTransactionIdHex: SETTLEMENT_TX_ID,
      status: 'aggregate_submitted',
    });
    const input = reconstructionInput(
      [phase1, submitted],
      null,
      [phase1, submitted],
      6_000_000n,
      [settlementAttempt()],
    );
    const resolution = await reconstructPegOutTerminalLiabilities(input);

    expect(resolution.retainedLiabilities).toEqual([
      expect.objectContaining({
        burnIdHex: phase1.burnIdHex,
        inFlightSettlementTransactionIdHex: null,
        status: 'detected',
      }),
      expect.objectContaining({
        burnIdHex: submitted.burnIdHex,
        inFlightSettlementTransactionIdHex: null,
        status: 'detected',
      }),
    ]);
    expect(projectCrossLedgerBackingAlarmFromTerminalLiabilityResolution({
      sidechainBackingSnapshot: input.sidechainBackingSnapshot,
      canonicalVaultBackingNanoErg: 10_900_000n,
      resolution,
    })).toMatchObject({
      pendingExitLiabilityNanoErg: 4_900_000n,
      requiredBackingNanoErg: 10_900_000n,
      deficitNanoErg: 0n,
    });
    expect(dependencies.reconstructDup).not.toHaveBeenCalled();
  });

  it('retains a current burn while its aggregate settlement journal is pending', async () => {
    const pending = observation();
    const input = reconstructionInput(
      [pending],
      null,
      [pending],
      5_000_000n,
      [settlementAttempt({
        submittedTxId: null,
        status: 'pending',
      })],
    );
    const resolution = await reconstructPegOutTerminalLiabilities(input);

    expect(resolution.retainedLiabilities).toEqual([pending]);
    expect(projectCrossLedgerBackingAlarmFromTerminalLiabilityResolution({
      sidechainBackingSnapshot: input.sidechainBackingSnapshot,
      canonicalVaultBackingNanoErg: 8_900_000n,
      resolution,
    })).toMatchObject({
      pendingExitLiabilityNanoErg: pending.amountNanoErg,
      requiredBackingNanoErg: 8_900_000n,
      deficitNanoErg: 0n,
    });
  });

  it('retains one complete submitted batch as individual current liabilities', async () => {
    const first = observation({
      inFlightSettlementTransactionIdHex: SETTLEMENT_TX_ID,
      amountNanoErg: 2_000_000n,
      status: 'batch_submitted',
    });
    const second = observation({
      sidechainTransactionHashHex: '35'.repeat(32),
      sidechainLogIndex: 6,
      inFlightSettlementTransactionIdHex: SETTLEMENT_TX_ID,
      amountNanoErg: 3_000_000n,
      status: 'batch_submitted',
    });
    const input = reconstructionInput(
      [first, second],
      null,
      [first, second],
      5_000_000n,
      [settlementAttempt({
        mode: 'batch',
        burnTxHashes: Object.freeze([
          first.sidechainTransactionHashHex,
          second.sidechainTransactionHashHex,
        ]),
      })],
    );
    const resolution = await reconstructPegOutTerminalLiabilities(input);

    expect(resolution.retainedLiabilities.map(item => item.burnIdHex)).toEqual([
      first.burnIdHex,
      second.burnIdHex,
    ]);
    expect(projectCrossLedgerBackingAlarmFromTerminalLiabilityResolution({
      sidechainBackingSnapshot: input.sidechainBackingSnapshot,
      canonicalVaultBackingNanoErg: 10_000_000n,
      resolution,
    })).toMatchObject({
      pendingExitLiabilityNanoErg: 5_000_000n,
      requiredBackingNanoErg: 10_000_000n,
      deficitNanoErg: 0n,
    });
  });

  it.each([
    'phase1_created',
    'aggregate_submitted',
    'batch_submitted',
  ] as const)('rejects %s when its current burn is absent', async (status) => {
    const inFlight = observation({
      inFlightSettlementTransactionIdHex:
        status === 'phase1_created' ? null : SETTLEMENT_TX_ID,
      status,
    });
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput([inFlight], null, []),
    )).rejects.toThrow(/current complete sidechain inventory.*in-flight burn/i);
  });

  it.each([
    ['missing journal', [], /matches 0 aggregate settlement attempts/i],
    ['pending journal', [settlementAttempt({
      submittedTxId: null,
      status: 'pending',
    })], /pending aggregate settlement journal member.*lifecycle state/i],
    ['different settlement transaction', [settlementAttempt({
      expectedTxId: '36'.repeat(32),
      submittedTxId: '36'.repeat(32),
    })], /submitted aggregate settlement journal member.*lifecycle identity/i],
    ['batch journal mode', [settlementAttempt({
      mode: 'batch',
      burnTxHashes: Object.freeze([LEGACY_BURN_KEY, '37'.repeat(32)]),
    })], /submitted aggregate settlement journal member.*lifecycle identity/i],
  ] as const)('rejects submitted liability with %s', async (_label, attempts, expected) => {
    const submitted = observation({
      inFlightSettlementTransactionIdHex: SETTLEMENT_TX_ID,
      status: 'aggregate_submitted',
    });
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput([submitted], null, [submitted], 9_000_000n, attempts),
    )).rejects.toThrow(expected);
  });

  it.each([
    ['duplicate transaction identity', [
      settlementAttempt(),
      settlementAttempt({
        burnTxHashes: Object.freeze(['39'.repeat(32)]),
        status: 'pending',
        submittedTxId: null,
      }),
    ], /duplicate aggregate settlement liability journal/i],
    ['overlapping burn identity', [
      settlementAttempt(),
      settlementAttempt({
        expectedTxId: '3a'.repeat(32),
        submittedTxId: null,
        status: 'pending',
      }),
    ], /journals overlap at burn/i],
  ] as const)('rejects %s across active settlement journals', async (
    _label,
    attempts,
    expected,
  ) => {
    const submitted = observation({
      inFlightSettlementTransactionIdHex: SETTLEMENT_TX_ID,
      status: 'aggregate_submitted',
    });
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput([submitted], null, [submitted], 9_000_000n, attempts),
    )).rejects.toThrow(expected);
  });

  it('rejects a semantically replaced in-flight burn', async () => {
    const submitted = observation({
      inFlightSettlementTransactionIdHex: SETTLEMENT_TX_ID,
      status: 'aggregate_submitted',
    });
    const replacement = observation({
      ...submitted,
      amountNanoErg: submitted.amountNanoErg + 1n,
    });
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput(
        [submitted],
        null,
        [replacement],
        9_000_000n,
        [settlementAttempt()],
      ),
    )).rejects.toThrow(/current.*does not match persisted burn semantics/i);
  });

  it('rejects a partial or ambiguous submitted batch identity', async () => {
    const first = observation({
      inFlightSettlementTransactionIdHex: SETTLEMENT_TX_ID,
      status: 'batch_submitted',
    });
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput(
        [first],
        null,
        [first],
        9_000_000n,
        [settlementAttempt({
          mode: 'batch',
          burnTxHashes: Object.freeze([
            first.sidechainTransactionHashHex,
            '38'.repeat(32),
          ]),
        })],
      ),
    )).rejects.toThrow(/ambiguous persisted membership/i);
  });

  it.each([
    ['pending', settlementAttempt({
      submittedTxId: null,
      status: 'pending',
    })],
    ['submitted', settlementAttempt()],
  ] as const)('does not exclude a reverted burn claimed by a %s journal', async (
    _status,
    attempt,
  ) => {
    const reverted = observation({ status: 'burn_reverted' });
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput([reverted], null, [], 9_000_000n, [attempt]),
    )).rejects.toThrow(/journal member has incompatible lifecycle/i);
  });

  it('does not exclude a fully reverted submitted batch with an active journal', async () => {
    const first = observation({ status: 'burn_reverted' });
    const second = observation({
      sidechainTransactionHashHex: '3b'.repeat(32),
      sidechainLogIndex: 7,
      status: 'burn_reverted',
    });
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput(
        [first, second],
        null,
        [],
        9_000_000n,
        [settlementAttempt({
          mode: 'batch',
          burnTxHashes: Object.freeze([
            first.sidechainTransactionHashHex,
            second.sidechainTransactionHashHex,
          ]),
        })],
      ),
    )).rejects.toThrow(/submitted aggregate settlement journal member.*lifecycle identity/i);
  });

  it.each([
    ['missing settlement transaction ID', {
      phase2UnlockTransactionIdHex: null,
    }, /settlement transaction ID/i],
    ['wrong settlement transaction', {
      phase2UnlockTransactionIdHex: '81'.repeat(32),
    }, /does not match.*transaction/i],
  ] as const)('rejects %s', async (_label, overrides, expected) => {
    const settled = observation({
        status: 'phase2_unlocked',
        ...overrides,
      });
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput([settled]),
    )).rejects.toThrow(expected);
  });

  it('rejects a legacy transaction-hash key shared by sibling events', async () => {
    const observations = [
        observation({
          phase2UnlockTransactionIdHex: SETTLEMENT_TX_ID,
          status: 'phase2_unlocked',
        }),
        observation({
          sidechainLogIndex: 9,
        }),
      ];
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput(observations),
    )).rejects.toThrow(/shared by 2 sidechain events/i);
    expect(dependencies.reconstructDup).not.toHaveBeenCalled();
  });

  it.each([
    ['payout amount', { payoutValueNanoErg: '3900001' }, /amount/i],
    ['payout recipient', { payoutErgoTreeHex: `0008cd03${'52'.repeat(32)}` }, /recipient/i],
    ['settlement transaction', { ergoSettlementTransactionIdHex: '82'.repeat(32) }, /transaction/i],
  ] as const)('rejects mismatched %s evidence', async (_label, view, expected) => {
    dependencies.collectPayout.mockResolvedValue(payoutAgreement(view));
    const settled = observation({
        phase2UnlockTransactionIdHex: SETTLEMENT_TX_ID,
        status: 'phase2_unlocked',
      });
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput([settled]),
    )).rejects.toThrow(expected);
  });

  it.each([
    ['wrong transaction', {
      status: 'confirmed_final',
      transactionIdHex: '76'.repeat(32),
      inclusionHeight: 1_300,
      inclusionHeaderIdHex: '72'.repeat(32),
    }, /inclusion.*does not match/i],
    ['wrong inclusion height', {
      status: 'confirmed_final',
      transactionIdHex: SETTLEMENT_TX_ID,
      inclusionHeight: 1_301,
      inclusionHeaderIdHex: '72'.repeat(32),
    }, /inclusion.*does not match/i],
    ['pre-final settlement', {
      status: 'confirmed_pre_finality',
      transactionIdHex: SETTLEMENT_TX_ID,
      inclusionHeight: 1_300,
      inclusionHeaderIdHex: '72'.repeat(32),
    }, /not final/i],
    ['wrong inclusion block', {
      status: 'confirmed_final',
      transactionIdHex: SETTLEMENT_TX_ID,
      inclusionHeight: 1_300,
      inclusionHeaderIdHex: '75'.repeat(32),
    }, /inclusion.*does not match/i],
  ] as const)('rejects %s in the stable Ergo observation', async (_label, record, expected) => {
    dependencies.observeSettlement.mockResolvedValue({ consensus: { record } });
    const settled = observation({
        phase2UnlockTransactionIdHex: SETTLEMENT_TX_ID,
        status: 'phase2_unlocked',
      });
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput([settled]),
    )).rejects.toThrow(expected);
  });

  it('rejects a reconstructed transition amount that differs from the burn', async () => {
    dependencies.reconstructDup.mockResolvedValue({
      ...reconstruction(),
      transitions: [{
        ...reconstruction().transitions[0],
        payoutValueNanoErg: '3900001',
      }],
    });
    const settled = observation({
        phase2UnlockTransactionIdHex: SETTLEMENT_TX_ID,
        status: 'phase2_unlocked',
      });
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput([settled]),
    )).rejects.toThrow(/reconstructed.*amount/i);
  });

  it.each([
    ['DUP reconstruction', () => {
      dependencies.assertDupProvenance.mockImplementationOnce(() => {
        throw new Error('DUP reconstruction provenance is missing');
      });
    }],
    ['historical payout agreement', () => {
      dependencies.assertPayoutProvenance.mockImplementationOnce(() => {
        throw new Error('historical payout agreement provenance is missing');
      });
    }],
    ['stable settlement observation', () => {
      dependencies.assertSettlementConsensusProvenance.mockImplementationOnce(() => {
        throw new Error('stable settlement observation provenance is missing');
      });
    }],
  ] as const)('rejects missing %s provenance', async (_label, removeProvenance) => {
    removeProvenance();
    const settled = observation({
        phase2UnlockTransactionIdHex: SETTLEMENT_TX_ID,
        status: 'phase2_unlocked',
      });
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput([settled]),
    )).rejects.toThrow(/provenance/i);
  });

  it('rejects absent or duplicate DUP transitions and incomplete read sources', async () => {
    dependencies.reconstructDup.mockResolvedValue({
      ...reconstruction(),
      historyKeys: [],
      transitions: [],
    });
    const settled = observation({
      phase2UnlockTransactionIdHex: SETTLEMENT_TX_ID,
      status: 'phase2_unlocked',
    });
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput([settled]),
    )).rejects.toThrow(/contains 0 transitions/i);

    dependencies.reconstructDup.mockResolvedValue({
      ...reconstruction(),
      transitions: [
        reconstruction().transitions[0],
        reconstruction().transitions[0],
      ],
    });
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput([settled]),
    )).rejects.toThrow(/contains 2 transitions/i);

    const profile = authenticatedV2();
    delete (profile.primarySource as any).getBlockByHeaderId;
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput([settled], profile),
    )).rejects.toThrow(/lacks bounded reconstruction capabilities/i);
  });

  it('excludes burn_reverted only when the current complete inventory proves absence', async () => {
    const reverted = observation({ status: 'burn_reverted' });
    const input = reconstructionInput([reverted], null, [], 10_000_000n);
    const resolution = await reconstructPegOutTerminalLiabilities(input);

    expect(resolution.retainedLiabilities).toEqual([]);
    expect(resolution.excludedRevertedBurns).toEqual([{
      burnIdHex: reverted.burnIdHex,
      sidechainTransactionHashHex: reverted.sidechainTransactionHashHex,
      sidechainLogIndex: reverted.sidechainLogIndex,
      absencePinnedHeight: 1_400,
      absencePinnedBlockHashHex: 'a1'.repeat(32),
    }]);
    expect(projectCrossLedgerBackingAlarmFromTerminalLiabilityResolution({
      sidechainBackingSnapshot: input.sidechainBackingSnapshot,
      canonicalVaultBackingNanoErg: 10_000_000n,
      resolution,
    })).toMatchObject({
      pendingExitLiabilityNanoErg: 0n,
      deficitNanoErg: 0n,
    });
  });

  it('retains an exactly re-included burn_reverted event at its current coordinates', async () => {
    const reverted = observation({ status: 'burn_reverted' });
    const currentEntry = Object.freeze({
      burnIdHex: reverted.burnIdHex,
      sidechainIdHex: reverted.sidechainIdHex,
      sidechainTransactionHashHex: reverted.sidechainTransactionHashHex,
      sidechainBlockHashHex: 'a2'.repeat(32),
      sidechainLogIndex: reverted.sidechainLogIndex,
      sidechainBurnHeight: 1_350,
      amountNanoErg: reverted.amountNanoErg,
      ergoRecipientAddress: reverted.ergoRecipientAddress,
      user: '0x0000000000000000000000000000000000000001',
    });
    const sidechainBackingSnapshot = createCompleteSidechainBackingSnapshot({
      inventory: completeInventory([], { entries: [currentEntry] }),
      totalSupplyNanoErg: 6_100_000n,
    });
    const resolution = await reconstructPegOutTerminalLiabilities({
      observations: [reverted],
      aggregateSettlementAttempts: [],
      authenticatedSettlementBindings: [],
      authenticatedV2: null,
      sidechainBackingSnapshot,
    });

    expect(resolution.excludedRevertedBurns).toEqual([]);
    expect(resolution.retainedLiabilities).toEqual([{
      ...reverted,
      sidechainBlockHashHex: currentEntry.sidechainBlockHashHex,
      sidechainBurnHeight: currentEntry.sidechainBurnHeight,
      status: 'detected',
    }]);
    expect(projectCrossLedgerBackingAlarmFromTerminalLiabilityResolution({
      sidechainBackingSnapshot,
      canonicalVaultBackingNanoErg: 10_000_000n,
      resolution,
    })).toMatchObject({
      pendingExitLiabilityNanoErg: 3_900_000n,
      requiredBackingNanoErg: 10_000_000n,
      deficitNanoErg: 0n,
    });
  });

  it.each([
    ['amount', { amountNanoErg: 3_900_001n }],
    ['recipient', { ergoRecipientAddress: `02${'a3'.repeat(32)}` }],
  ] as const)('rejects a re-included burn with mismatched %s', async (_label, overrides) => {
    const reverted = observation({ status: 'burn_reverted' });
    const currentEntry = {
      burnIdHex: reverted.burnIdHex,
      sidechainIdHex: reverted.sidechainIdHex,
      sidechainTransactionHashHex: reverted.sidechainTransactionHashHex,
      sidechainBlockHashHex: 'a2'.repeat(32),
      sidechainLogIndex: reverted.sidechainLogIndex,
      sidechainBurnHeight: 1_350,
      amountNanoErg: reverted.amountNanoErg,
      ergoRecipientAddress: reverted.ergoRecipientAddress,
      user: '0x0000000000000000000000000000000000000001',
      ...overrides,
    };
    const sidechainBackingSnapshot = createCompleteSidechainBackingSnapshot({
      inventory: completeInventory([], { entries: [currentEntry] }),
      totalSupplyNanoErg: 9_000_000n,
    });
    await expect(reconstructPegOutTerminalLiabilities({
      observations: [reverted],
      aggregateSettlementAttempts: [],
      authenticatedSettlementBindings: [],
      authenticatedV2: null,
      sidechainBackingSnapshot,
    })).rejects.toThrow(/current.*does not match/i);
  });

  it('rejects phase2 payout exclusion when the current burn is absent', async () => {
    const settled = observation({
      phase2UnlockTransactionIdHex: SETTLEMENT_TX_ID,
      status: 'phase2_unlocked',
    });
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput([settled], authenticatedV2(), []),
    )).rejects.toThrow(/current complete sidechain inventory.*does not contain/i);
    expect(dependencies.reconstructDup).not.toHaveBeenCalled();
  });

  it('rejects unbranded or stale complete backing-snapshot evidence', async () => {
    const reverted = observation({ status: 'burn_reverted' });
    await expect(reconstructPegOutTerminalLiabilities({
      observations: [reverted],
      aggregateSettlementAttempts: [],
      authenticatedSettlementBindings: [],
      authenticatedV2: null,
      sidechainBackingSnapshot: {
        pinnedHeight: 1_400,
        pinnedBlockHashHex: 'a1'.repeat(32),
        totalSupplyNanoErg: 9_000_000n,
        inventory: completeInventory([]),
      } as any,
    })).rejects.toThrow(/snapshot provenance/i);

    const staleSnapshot = createCompleteSidechainBackingSnapshot({
      inventory: completeInventory([], { pinnedHeight: 1_199 }),
      totalSupplyNanoErg: 9_000_000n,
    });
    await expect(reconstructPegOutTerminalLiabilities({
      observations: [reverted],
      aggregateSettlementAttempts: [],
      authenticatedSettlementBindings: [],
      authenticatedV2: null,
      sidechainBackingSnapshot: staleSnapshot,
    })).rejects.toThrow(/predates/i);
  });

  it('brands only a complete genesis-to-pin inventory with coherent pin data', () => {
    expect(() => reconcileCompletePegOutBackingInventory({
      entries: [],
      persistence: {
        persistAndRevalidateAll: (entries, validate) =>
          validate(entries.map(() => 'revalidated' as const)),
      },
      scanFromHeight: 1,
      pinnedHeight: 1_400,
      pinnedBlockHashHex: 'a1'.repeat(32),
    })).toThrow(/start at height 0/i);

    const atPin = observation({
      sidechainBlockHashHex: 'a5'.repeat(32),
      sidechainBurnHeight: 1_400,
    });
    expect(() => completeInventory([atPin])).toThrow(/pinned block/i);
  });

  it.each([
    ['burn ID', { burnIdHex: 'a6'.repeat(32) }],
    ['sidechain ID', { sidechainIdHex: 'a7'.repeat(32) }],
    ['transaction hash', { sidechainTransactionHashHex: 'a8'.repeat(32) }],
    ['event index', { sidechainLogIndex: 4 }],
  ] as const)('rejects inventory with mismatched %s identity', (_label, overrides) => {
    const current = observation();
    const entry = {
      burnIdHex: current.burnIdHex,
      sidechainIdHex: current.sidechainIdHex,
      sidechainTransactionHashHex: current.sidechainTransactionHashHex,
      sidechainBlockHashHex: current.sidechainBlockHashHex,
      sidechainLogIndex: current.sidechainLogIndex,
      sidechainBurnHeight: current.sidechainBurnHeight,
      amountNanoErg: current.amountNanoErg,
      ergoRecipientAddress: current.ergoRecipientAddress,
      user: '0x0000000000000000000000000000000000000001',
      ...overrides,
    };
    expect(() => completeInventory([], { entries: [entry] })).toThrow(
      /burn ID does not match.*event identity/i,
    );
  });

  it('rejects projection with supply from a different branded snapshot', async () => {
    const pending = observation();
    const input = reconstructionInput([pending], null, [pending], 9_000_000n);
    const resolution = await reconstructPegOutTerminalLiabilities(input);
    const differentSupplySnapshot = createCompleteSidechainBackingSnapshot({
      inventory: completeInventory([pending]),
      totalSupplyNanoErg: 8_000_000n,
    });

    expect(() => projectCrossLedgerBackingAlarmFromTerminalLiabilityResolution({
      sidechainBackingSnapshot: differentSupplySnapshot,
      canonicalVaultBackingNanoErg: 10_000_000n,
      resolution,
    })).toThrow(/does not match the sidechain backing snapshot/i);
  });

  it('fails closed without a capable profile', async () => {
    const settled = observation({
      phase2UnlockTransactionIdHex: SETTLEMENT_TX_ID,
      status: 'phase2_unlocked',
    });
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput([settled], null),
    )).rejects.toThrow(/authenticated V2 reconstruction profile is unavailable/i);
  });

  it('retains a legacy-unclassified failed row only while its exact burn is current', async () => {
    const failed = observation({
      phase2UnlockTransactionIdHex: SETTLEMENT_TX_ID,
      status: 'failed',
    });
    const input = reconstructionInput([failed], null, [failed], 5_000_000n);
    const resolution = await reconstructPegOutTerminalLiabilities(input);

    expect(resolution.retainedLiabilities).toEqual([
      expect.objectContaining({
        burnIdHex: failed.burnIdHex,
        phase2UnlockTransactionIdHex: null,
        status: 'detected',
      }),
    ]);
    expect(projectCrossLedgerBackingAlarmFromTerminalLiabilityResolution({
      sidechainBackingSnapshot: input.sidechainBackingSnapshot,
      canonicalVaultBackingNanoErg: 8_900_000n,
      resolution,
    })).toMatchObject({
      pendingExitLiabilityNanoErg: failed.amountNanoErg,
      requiredBackingNanoErg: 8_900_000n,
      deficitNanoErg: 0n,
    });
  });

  it('keeps an absent or semantically replaced legacy failed row unavailable', async () => {
    const failed = observation({ status: 'failed' });
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput([failed], null, []),
    )).rejects.toThrow(/legacy_failed_unclassified_v1.*external settlement reconstruction/i);

    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput([failed], null, [{
        ...failed,
        amountNanoErg: failed.amountNanoErg + 1n,
      }]),
    )).rejects.toThrow(/current.*does not match persisted burn semantics/i);
  });

  it('keeps a legacy failed row unavailable while authenticated settlement state is active', async () => {
    const failed = observation({ status: 'failed' });
    await expect(reconstructPegOutTerminalLiabilities(
      reconstructionInput(
        [failed],
        null,
        [failed],
        9_000_000n,
        [],
        [authenticatedSettlementBinding(failed)],
      ),
    )).rejects.toThrow(
      /legacy_failed_unclassified_v1.*active authenticated settlement candidate/i,
    );
  });

  it('rejects forged resolution objects', () => {
    const forged = {
      retainedLiabilities: [],
      excludedAuthenticatedV2Payouts: [],
    } as unknown as PegOutTerminalLiabilityResolution;
    const sidechainBackingSnapshot = createCompleteSidechainBackingSnapshot({
      inventory: completeInventory([]),
      totalSupplyNanoErg: 0n,
    });
    expect(() => projectCrossLedgerBackingAlarmFromTerminalLiabilityResolution({
      sidechainBackingSnapshot,
      canonicalVaultBackingNanoErg: 0n,
      resolution: forged,
    })).toThrow(/provenance/i);
  });
});
