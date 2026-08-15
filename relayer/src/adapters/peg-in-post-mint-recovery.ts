import type {
  PegInPostMintRecoveryIncidentKind,
  PegInPostMintRecoveryPorts,
  PegInPostMintRouteDeposit,
} from '../relayer-core/peg-in-post-mint-recovery.js';

export interface PegInPostMintRecoveryEventSource {
  readonly ergoLockBoxId: string;
  readonly targetEvmAddress: string;
  readonly amountNanoErg: bigint;
  readonly status: string;
  readonly depositorErgoTreeHex: string | null;
  readonly commitTxId: string | null;
  readonly committedVaultBoxId: string | null;
  readonly commitmentReceipt: Readonly<{
    verification: Readonly<{
      height: number;
      headerIdHex: string;
    }>;
  }> | null;
  readonly commitmentReceiptDigestHex: string | null;
}

export interface PegInPostMintRecoveryReportSource {
  readonly reconstructionDigestHex: string;
  readonly observationDigestHex: string;
}

export interface PegInPostMintRecoverySnapshotSource {
  readonly state: Readonly<{
    reconstructionDigestHex: string;
    observationDigestHex: string;
  }>;
  readonly activeHistory: readonly Readonly<{
    boxIdHex: string;
    valueNanoErg: string;
    declaredAmountNanoErg: string;
    targetEvmAddressHex: string;
    depositorErgoTreeHex: string;
    spentTransactionIdHex: string | null;
    classification:
      | 'refundable'
      | 'commit_pending'
      | 'committed'
      | 'refunded'
      | 'unresolved';
    transition: null | Readonly<{
      spendingTransactionIdHex: string;
      inclusionHeight: number;
      inclusionBlockIdHex: string;
      vaultBoxIdHex: string | null;
    }>;
  }>[];
  readonly activeCurrentBoxIdsHex: readonly string[];
  readonly vaultCurrentBoxIdsHex: readonly string[];
}

export interface PegInPostMintRecoveryState {
  getPegInByBoxId(
    sourceBoxIdHex: string,
  ): PegInPostMintRecoveryEventSource | undefined;
  getPegInRouteReconstructionSnapshot(): PegInPostMintRecoverySnapshotSource | null;
  markPegInIncident(
    sourceBoxIdHex: string,
    incident: Readonly<{
      kind: PegInPostMintRecoveryIncidentKind;
      reason: string;
    }>,
  ): void;
}

export interface PegInPostMintRecoveryApplicationInput {
  readonly sourceBoxIdHex: string;
  readonly recovery: PegInPostMintRecoveryReportSource;
  readonly state: PegInPostMintRecoveryState;
}

export class PegInPostMintIncidentPersistenceError extends Error {
  constructor(readonly sourceBoxIdHex: string, cause: unknown) {
    super(`failed to persist post-mint recovery incident for ${sourceBoxIdHex}`, { cause });
    this.name = 'PegInPostMintIncidentPersistenceError';
  }
}

function normalizedHex(value: string, bytes: number, label: string): string {
  const normalized = value.trim().replace(/^0x/i, '').toLowerCase();
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(normalized)) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return normalized;
}

function normalizedVariableHex(value: string, label: string): string {
  const normalized = value.trim().replace(/^0x/i, '').toLowerCase();
  if (normalized.length === 0 || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/.test(normalized)) {
    throw new Error(`${label} must be non-empty, byte-aligned hex`);
  }
  return normalized;
}

export function createPegInPostMintRecoveryPorts(
  input: PegInPostMintRecoveryApplicationInput,
): PegInPostMintRecoveryPorts {
  const { recovery, state } = input;
  const sourceBoxIdHex = normalizedHex(
    input.sourceBoxIdHex,
    32,
    'post-mint source box ID',
  );
  const event = state.getPegInByBoxId(sourceBoxIdHex);
  if (event === undefined) {
    throw new Error('post-mint recovery requires a persisted peg-in lifecycle row');
  }
  if (
    normalizedHex(event.ergoLockBoxId, 32, 'persisted post-mint source box ID')
    !== sourceBoxIdHex
  ) {
    throw new Error('persisted post-mint lifecycle identity does not match its lookup key');
  }
  if (event.status !== 'minted' && event.status !== 'minting') {
    throw new Error('post-mint recovery requires a minted or minting lifecycle row');
  }
  if (
    event.commitTxId === null
    || event.committedVaultBoxId === null
    || event.commitmentReceipt === null
    || event.commitmentReceiptDigestHex === null
  ) {
    throw new Error('post-mint recovery requires retained committed-vault evidence');
  }

  const snapshot = state.getPegInRouteReconstructionSnapshot();
  if (
    snapshot === null
    || snapshot.state.reconstructionDigestHex !== recovery.reconstructionDigestHex
    || snapshot.state.observationDigestHex !== recovery.observationDigestHex
  ) {
    throw new Error('post-mint recovery report does not match the persisted route snapshot');
  }
  const committedVaultBoxIdHex = normalizedHex(
    event.committedVaultBoxId,
    32,
    'retained committed vault box ID',
  );
  const matches = snapshot.activeHistory.filter(
    deposit => deposit.boxIdHex === sourceBoxIdHex,
  );
  const observed = matches.length === 1 ? matches[0] : null;
  const deposit: PegInPostMintRouteDeposit | null = observed === null
    ? null
    : Object.freeze({
        valueNanoErg: observed.valueNanoErg,
        declaredAmountNanoErg: observed.declaredAmountNanoErg,
        targetEvmAddressHex: normalizedHex(
          observed.targetEvmAddressHex,
          20,
          'observed target EVM address',
        ),
        depositorErgoTreeHex: normalizedVariableHex(
          observed.depositorErgoTreeHex,
          'observed depositor ErgoTree',
        ),
        spentTransactionIdHex: observed.spentTransactionIdHex === null
          ? null
          : normalizedHex(
              observed.spentTransactionIdHex,
              32,
              'observed spending transaction ID',
            ),
        classification: observed.classification,
        transition: observed.transition === null
          ? null
          : Object.freeze({
              spendingTransactionIdHex: normalizedHex(
                observed.transition.spendingTransactionIdHex,
                32,
                'observed transition transaction ID',
              ),
              inclusionHeight: observed.transition.inclusionHeight,
              inclusionBlockIdHex: normalizedHex(
                observed.transition.inclusionBlockIdHex,
                32,
                'observed transition block ID',
              ),
              vaultBoxIdHex: observed.transition.vaultBoxIdHex === null
                ? null
                : normalizedHex(
                    observed.transition.vaultBoxIdHex,
                    32,
                    'observed transition vault box ID',
                  ),
            }),
      });

  return Object.freeze({
    retained: Object.freeze({
      sourceBoxIdHex,
      targetEvmAddressHex: normalizedHex(
        event.targetEvmAddress,
        20,
        'post-mint target EVM address',
      ),
      amountNanoErg: event.amountNanoErg.toString(),
      depositorErgoTreeHex: event.depositorErgoTreeHex === null
        ? ''
        : normalizedVariableHex(event.depositorErgoTreeHex, 'post-mint depositor ErgoTree'),
      commitmentTxIdHex: normalizedHex(
        event.commitTxId,
        32,
        'retained commitment transaction ID',
      ),
      committedVaultBoxIdHex,
      commitmentInclusionHeight: event.commitmentReceipt.verification.height,
      commitmentInclusionHeaderIdHex: normalizedHex(
        event.commitmentReceipt.verification.headerIdHex,
        32,
        'retained commitment inclusion header ID',
      ),
    }),
    route: Object.freeze({
      exactDepositMatchCount: matches.length,
      deposit,
      sourceBoxCurrentlyUnspent: snapshot.activeCurrentBoxIdsHex.includes(sourceBoxIdHex),
      committedVaultCurrentlyUnspent:
        snapshot.vaultCurrentBoxIdsHex.includes(committedVaultBoxIdHex),
    }),
    incidents: Object.freeze({
      persist: (kind: PegInPostMintRecoveryIncidentKind, reason: string) => {
        try {
          state.markPegInIncident(sourceBoxIdHex, {
            kind,
            reason,
          });
        } catch (cause) {
          throw new PegInPostMintIncidentPersistenceError(sourceBoxIdHex, cause);
        }
      },
    }),
  });
}
