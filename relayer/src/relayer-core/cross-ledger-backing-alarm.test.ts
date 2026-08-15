import { describe, expect, it } from 'vitest';

import {
  assertStableSidechainBackingSnapshot,
  projectCrossLedgerBackingAlarm,
  type OutstandingPegOutLiabilityObservation,
} from './cross-ledger-backing-alarm.js';

function observation(
  overrides: Partial<OutstandingPegOutLiabilityObservation> = {},
): OutstandingPegOutLiabilityObservation {
  return {
    burnIdHex: '11'.repeat(32),
    sidechainIdHex: '22'.repeat(32),
    sidechainTransactionHashHex: '33'.repeat(32),
    sidechainBlockHashHex: '44'.repeat(32),
    sidechainLogIndex: 7,
    sidechainBurnHeight: 1_234,
    amountNanoErg: 10n,
    ergoRecipientAddress: `02${'99'.repeat(32)}`,
    inFlightSettlementTransactionIdHex: null,
    phase2UnlockTransactionIdHex: null,
    status: 'detected',
    ...overrides,
  };
}

describe('cross-ledger backing alarm', () => {
  it('adds detected and confirmed exits to current sidechain supply', () => {
    const result = projectCrossLedgerBackingAlarm({
      totalSupplyNanoErg: 70n,
      canonicalVaultBackingNanoErg: 100n,
      outstandingPegOuts: [
        observation({ amountNanoErg: 10n }),
        observation({
          burnIdHex: '55'.repeat(32),
          sidechainTransactionHashHex: '66'.repeat(32),
          sidechainLogIndex: 8,
          amountNanoErg: 20n,
          status: 'confirmed',
        }),
      ],
    });

    expect(result).toEqual({
      totalSupplyNanoErg: 70n,
      pendingExitLiabilityNanoErg: 30n,
      requiredBackingNanoErg: 100n,
      canonicalVaultBackingNanoErg: 100n,
      deficitNanoErg: 0n,
    });
  });

  it('exposes a deficit that a canonical burn otherwise masks', () => {
    expect(projectCrossLedgerBackingAlarm({
      totalSupplyNanoErg: 95n,
      canonicalVaultBackingNanoErg: 100n,
      outstandingPegOuts: [observation({ amountNanoErg: 10n })],
    })).toMatchObject({
      pendingExitLiabilityNanoErg: 10n,
      requiredBackingNanoErg: 105n,
      deficitNanoErg: 5n,
    });
  });

  it.each([
    'phase1_created',
    'aggregate_submitted',
    'batch_submitted',
    'phase2_unlocked',
    'burn_reverted',
    'failed',
  ] as const)('fails closed for the ambiguous %s lifecycle', (status) => {
    expect(() => projectCrossLedgerBackingAlarm({
      totalSupplyNanoErg: 90n,
      canonicalVaultBackingNanoErg: 100n,
      outstandingPegOuts: [observation({
        inFlightSettlementTransactionIdHex:
          status === 'aggregate_submitted' || status === 'batch_submitted'
            ? '77'.repeat(32)
            : null,
        status,
      })],
    })).toThrow(/cannot project.*without canonical Ergo settlement reconstruction/i);
  });

  it('requires an exact settlement identity only for submitted liabilities', () => {
    expect(() => projectCrossLedgerBackingAlarm({
      totalSupplyNanoErg: 90n,
      canonicalVaultBackingNanoErg: 100n,
      outstandingPegOuts: [observation({ status: 'aggregate_submitted' })],
    })).toThrow(/status and settlement transaction ID must agree/i);

    expect(() => projectCrossLedgerBackingAlarm({
      totalSupplyNanoErg: 90n,
      canonicalVaultBackingNanoErg: 100n,
      outstandingPegOuts: [observation({
        inFlightSettlementTransactionIdHex: '77'.repeat(32),
        status: 'detected',
      })],
    })).toThrow(/status and settlement transaction ID must agree/i);

    expect(() => projectCrossLedgerBackingAlarm({
      totalSupplyNanoErg: 90n,
      canonicalVaultBackingNanoErg: 100n,
      outstandingPegOuts: [observation({
        inFlightSettlementTransactionIdHex: '77',
        status: 'batch_submitted',
      })],
    })).toThrow(/in-flight settlement transaction ID/i);
  });

  it('binds the alarm inputs to one unchanged sidechain block identity', () => {
    expect(assertStableSidechainBackingSnapshot(
      1_500,
      { number: 1_500, hash: `0x${'ab'.repeat(32)}` },
      { number: 1_500, hash: `0x${'AB'.repeat(32)}` },
    )).toEqual({
      height: 1_500,
      blockHashHex: 'ab'.repeat(32),
    });

    expect(() => assertStableSidechainBackingSnapshot(
      1_500,
      { number: 1_500, hash: `0x${'ab'.repeat(32)}` },
      { number: 1_500, hash: `0x${'ac'.repeat(32)}` },
    )).toThrow(/changed during backing observation/i);
    expect(() => assertStableSidechainBackingSnapshot(
      1_500,
      { number: 1_499, hash: `0x${'ab'.repeat(32)}` },
      { number: 1_500, hash: `0x${'ab'.repeat(32)}` },
    )).toThrow(/height/i);
    expect(() => assertStableSidechainBackingSnapshot(
      1_500,
      { number: 1_500, hash: null },
      { number: 1_500, hash: `0x${'ab'.repeat(32)}` },
    )).toThrow(/block hash/i);
  });

  it('rejects duplicate burn identities instead of double-counting or choosing one row', () => {
    expect(() => projectCrossLedgerBackingAlarm({
      totalSupplyNanoErg: 80n,
      canonicalVaultBackingNanoErg: 100n,
      outstandingPegOuts: [
        observation(),
        observation({
          sidechainTransactionHashHex: '77'.repeat(32),
          sidechainLogIndex: 9,
        }),
      ],
    })).toThrow(/duplicate.*burn identity/i);
  });

  it('rejects malformed identity and non-positive liability values', () => {
    expect(() => projectCrossLedgerBackingAlarm({
      totalSupplyNanoErg: 90n,
      canonicalVaultBackingNanoErg: 100n,
      outstandingPegOuts: [observation({ burnIdHex: 'aa', amountNanoErg: 0n })],
    })).toThrow(/burn ID/i);

    expect(() => projectCrossLedgerBackingAlarm({
      totalSupplyNanoErg: 90n,
      canonicalVaultBackingNanoErg: 100n,
      outstandingPegOuts: [observation({ amountNanoErg: 0n })],
    })).toThrow(/positive signed Long/i);
  });
});
