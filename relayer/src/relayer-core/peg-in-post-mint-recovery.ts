export type PegInPostMintRecoveryIncidentKind =
  | 'commitment_disappeared'
  | 'refundable_source_restored'
  | 'commitment_receipt_conflict'
  | 'committed_vault_unavailable';

export interface PegInPostMintRetainedLifecycle {
  readonly sourceBoxIdHex: string;
  readonly targetEvmAddressHex: string;
  readonly amountNanoErg: string;
  readonly depositorErgoTreeHex: string;
  readonly commitmentTxIdHex: string;
  readonly committedVaultBoxIdHex: string;
  readonly commitmentInclusionHeight: number;
  readonly commitmentInclusionHeaderIdHex: string;
}

export interface PegInPostMintRouteDeposit {
  readonly valueNanoErg: string;
  readonly declaredAmountNanoErg: string;
  readonly targetEvmAddressHex: string;
  readonly depositorErgoTreeHex: string;
  readonly spentTransactionIdHex: string | null;
  readonly classification:
    | 'refundable'
    | 'commit_pending'
    | 'committed'
    | 'refunded'
    | 'unresolved';
  readonly transition: null | Readonly<{
    spendingTransactionIdHex: string;
    inclusionHeight: number;
    inclusionBlockIdHex: string;
    vaultBoxIdHex: string | null;
  }>;
}

export interface PegInPostMintRecoveryPorts {
  readonly retained: PegInPostMintRetainedLifecycle;
  readonly route: Readonly<{
    exactDepositMatchCount: number;
    deposit: PegInPostMintRouteDeposit | null;
    sourceBoxCurrentlyUnspent: boolean;
    committedVaultCurrentlyUnspent: boolean;
  }>;
  readonly incidents: Readonly<{
    persist(kind: PegInPostMintRecoveryIncidentKind, reason: string): void;
  }>;
}

export type PegInPostMintRecoveryResult =
  | Readonly<{ status: 'canonical'; reason: string }>
  | Readonly<{ status: 'incident'; reason: string }>;

function incident(
  ports: PegInPostMintRecoveryPorts,
  kind: PegInPostMintRecoveryIncidentKind,
  reason: string,
): PegInPostMintRecoveryResult {
  ports.incidents.persist(kind, reason);
  return Object.freeze({ status: 'incident', reason });
}

export function recoverPegInPostMintLifecycle(
  ports: PegInPostMintRecoveryPorts,
): PegInPostMintRecoveryResult {
  const { retained, route } = ports;
  if (route.exactDepositMatchCount !== 1 || route.deposit === null) {
    return incident(
      ports,
      'commitment_disappeared',
      'the exact post-mint source deposit is absent or ambiguous in the dual-source snapshot',
    );
  }

  const observed = route.deposit;
  if (
    observed.valueNanoErg !== retained.amountNanoErg
    || observed.declaredAmountNanoErg !== retained.amountNanoErg
    || observed.targetEvmAddressHex !== retained.targetEvmAddressHex
    || observed.depositorErgoTreeHex !== retained.depositorErgoTreeHex
  ) {
    return incident(
      ports,
      'commitment_receipt_conflict',
      'the dual-source route snapshot does not match the retained peg-in identity',
    );
  }

  if (observed.classification === 'refundable') {
    if (
      observed.spentTransactionIdHex !== null
      || observed.transition !== null
      || !route.sourceBoxCurrentlyUnspent
    ) {
      return incident(
        ports,
        'commitment_receipt_conflict',
        'the refundable post-mint route observation is internally inconsistent',
      );
    }
    return incident(
      ports,
      'refundable_source_restored',
      'dual-source route reconstruction restored the refundable source after mint',
    );
  }

  if (observed.classification === 'committed') {
    const transition = observed.transition;
    if (
      route.sourceBoxCurrentlyUnspent
      || observed.spentTransactionIdHex !== retained.commitmentTxIdHex
      || transition === null
      || transition.spendingTransactionIdHex !== retained.commitmentTxIdHex
      || transition.vaultBoxIdHex !== retained.committedVaultBoxIdHex
      || transition.inclusionHeight !== retained.commitmentInclusionHeight
      || transition.inclusionBlockIdHex !== retained.commitmentInclusionHeaderIdHex
    ) {
      return incident(
        ports,
        'commitment_receipt_conflict',
        'the dual-source committed route conflicts with retained post-mint evidence',
      );
    }
    if (!route.committedVaultCurrentlyUnspent) {
      return incident(
        ports,
        'committed_vault_unavailable',
        'the retained committed vault is absent from the dual-source current UTXO snapshot',
      );
    }
    return Object.freeze({
      status: 'canonical',
      reason: 'the exact committed route remains present in the dual-source snapshot',
    });
  }

  return incident(
    ports,
    'commitment_disappeared',
    `post-mint route observation is ${observed.classification}`,
  );
}
