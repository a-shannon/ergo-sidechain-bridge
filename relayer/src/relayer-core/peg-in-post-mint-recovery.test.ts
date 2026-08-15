import { describe, expect, it } from 'vitest';

import {
  recoverPegInPostMintLifecycle,
  type PegInPostMintRecoveryIncidentKind,
  type PegInPostMintRecoveryPorts,
  type PegInPostMintRouteDeposit,
} from './peg-in-post-mint-recovery.js';

const SOURCE_BOX_ID = '11'.repeat(32);
const COMMITMENT_TX_ID = '22'.repeat(32);
const VAULT_BOX_ID = '33'.repeat(32);
const HEADER_ID = '44'.repeat(32);

const retained = Object.freeze({
  sourceBoxIdHex: SOURCE_BOX_ID,
  targetEvmAddressHex: '55'.repeat(20),
  amountNanoErg: '10000000',
  depositorErgoTreeHex: '10010100d17300',
  commitmentTxIdHex: COMMITMENT_TX_ID,
  committedVaultBoxIdHex: VAULT_BOX_ID,
  commitmentInclusionHeight: 90,
  commitmentInclusionHeaderIdHex: HEADER_ID,
});

function committedDeposit(): PegInPostMintRouteDeposit {
  return Object.freeze({
    valueNanoErg: retained.amountNanoErg,
    declaredAmountNanoErg: retained.amountNanoErg,
    targetEvmAddressHex: retained.targetEvmAddressHex,
    depositorErgoTreeHex: retained.depositorErgoTreeHex,
    spentTransactionIdHex: COMMITMENT_TX_ID,
    classification: 'committed',
    transition: Object.freeze({
      spendingTransactionIdHex: COMMITMENT_TX_ID,
      inclusionHeight: retained.commitmentInclusionHeight,
      inclusionBlockIdHex: HEADER_ID,
      vaultBoxIdHex: VAULT_BOX_ID,
    }),
  });
}

function refundableDeposit(): PegInPostMintRouteDeposit {
  return Object.freeze({
    ...committedDeposit(),
    spentTransactionIdHex: null,
    classification: 'refundable',
    transition: null,
  });
}

function fixture(input: Readonly<{
  exactDepositMatchCount?: number;
  deposit?: PegInPostMintRouteDeposit | null;
  sourceBoxCurrentlyUnspent?: boolean;
  committedVaultCurrentlyUnspent?: boolean;
}> = {}): Readonly<{
  ports: PegInPostMintRecoveryPorts;
  incidents: Array<Readonly<{
    kind: PegInPostMintRecoveryIncidentKind;
    reason: string;
  }>>;
}> {
  const incidents: Array<Readonly<{
    kind: PegInPostMintRecoveryIncidentKind;
    reason: string;
  }>> = [];
  return {
    ports: Object.freeze({
      retained,
      route: Object.freeze({
        exactDepositMatchCount: input.exactDepositMatchCount ?? 1,
        deposit: input.deposit === undefined ? committedDeposit() : input.deposit,
        sourceBoxCurrentlyUnspent: input.sourceBoxCurrentlyUnspent ?? false,
        committedVaultCurrentlyUnspent:
          input.committedVaultCurrentlyUnspent ?? true,
      }),
      incidents: Object.freeze({
        persist: (kind: PegInPostMintRecoveryIncidentKind, reason: string) => {
          incidents.push(Object.freeze({ kind, reason }));
        },
      }),
    }),
    incidents,
  };
}

describe('peg-in post-mint recovery reducer', () => {
  it('accepts only the exact retained committed route', () => {
    const { ports, incidents } = fixture();

    expect(recoverPegInPostMintLifecycle(ports)).toEqual({
      status: 'canonical',
      reason: 'the exact committed route remains present in the dual-source snapshot',
    });
    expect(incidents).toEqual([]);
  });

  it('persists source restoration as an incident', () => {
    const { ports, incidents } = fixture({
      deposit: refundableDeposit(),
      sourceBoxCurrentlyUnspent: true,
      committedVaultCurrentlyUnspent: false,
    });

    expect(recoverPegInPostMintLifecycle(ports).status).toBe('incident');
    expect(incidents.map(value => value.kind)).toEqual([
      'refundable_source_restored',
    ]);
  });

  it.each([
    {
      label: 'missing exact deposit',
      input: { exactDepositMatchCount: 0, deposit: null },
      expectedKind: 'commitment_disappeared',
    },
    {
      label: 'retained identity mismatch',
      input: {
        deposit: Object.freeze({
          ...committedDeposit(),
          declaredAmountNanoErg: '9999999',
        }),
      },
      expectedKind: 'commitment_receipt_conflict',
    },
    {
      label: 'inconsistent refundable observation',
      input: {
        deposit: Object.freeze({
          ...refundableDeposit(),
          spentTransactionIdHex: COMMITMENT_TX_ID,
        }),
        sourceBoxCurrentlyUnspent: true,
      },
      expectedKind: 'commitment_receipt_conflict',
    },
    {
      label: 'committed source restored',
      input: { sourceBoxCurrentlyUnspent: true },
      expectedKind: 'commitment_receipt_conflict',
    },
    {
      label: 'committed transition mismatch',
      input: {
        deposit: Object.freeze({
          ...committedDeposit(),
          transition: Object.freeze({
            ...committedDeposit().transition!,
            inclusionBlockIdHex: '66'.repeat(32),
          }),
        }),
      },
      expectedKind: 'commitment_receipt_conflict',
    },
    {
      label: 'committed vault unavailable',
      input: { committedVaultCurrentlyUnspent: false },
      expectedKind: 'committed_vault_unavailable',
    },
    {
      label: 'nonterminal route classification',
      input: {
        deposit: Object.freeze({
          ...committedDeposit(),
          spentTransactionIdHex: null,
          classification: 'commit_pending' as const,
          transition: null,
        }),
      },
      expectedKind: 'commitment_disappeared',
    },
  ] as const)(
    'persists $label before returning',
    ({ input, expectedKind }) => {
      const { ports, incidents } = fixture(input);

      expect(recoverPegInPostMintLifecycle(ports).status).toBe('incident');
      expect(incidents).toHaveLength(1);
      expect(incidents[0].kind).toBe(expectedKind);
    },
  );
});
