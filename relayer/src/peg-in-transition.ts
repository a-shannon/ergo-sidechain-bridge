import type { DeployedState } from './config.js';
import type { ErgoClient } from './ergo-client.js';
import {
  SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
} from './profiles/substrate-grandpa-v1/asset-profile.js';
import {
  assertExactCommittedVaultV1,
  inspectPegInCommitmentInclusionV1,
  MIN_PEG_IN_COMMIT_CONFIRMATIONS_V1,
  resolveActivePegInDeploymentV1,
  type ActivePegInDeploymentV1,
  type CanonicalCommittedVaultV1,
  type CanonicalPegInCommitmentV1,
  type PegInMintIntentV1,
} from './profiles/substrate-grandpa-v1/peg-in-committed-vault.js';
import {
  derivePegInEvmReplayIdentityV1,
} from './profiles/substrate-grandpa-v1/peg-in-mint-identity.js';
import {
  createPegInCommitmentReceipt,
  pegInCommitmentReceiptDigestHex,
  pegInCommitmentReceiptsEqual,
  type PegInCommitmentReceipt,
  type PegInCommitmentVerification,
} from './peg-in-commitment-receipt.js';
import {
  PEG_IN_MINT_CONFIRMATIONS,
} from './relayer-core/peg-in-mint-transport-lifecycle.js';
import type { SidechainClient } from './sidechain-client.js';
import type {
  PegInEvent,
  PegInSafetyIncidentKind,
  PegInSourceClassification,
  StateTracker,
} from './state-tracker.js';

export const MIN_PEG_IN_COMMIT_CONFIRMATIONS = MIN_PEG_IN_COMMIT_CONFIRMATIONS_V1;

type PegInState = Pick<
  StateTracker,
  | 'recordPegInConsumeConfirmed'
  | 'recordPegInMinted'
  | 'confirmPegInMintTransportRecovery'
  | 'resetPegInMintForRetry'
  | 'getLatestPegInMintTransportAttempt'
  | 'resetPegInCommit'
  | 'markPegInCommitInvalid'
  | 'markPegInIncident'
  | 'updatePegInClassification'
  | 'assertFundsReleaseAuthorized'
>;

type PegInErgoClient = Pick<
  ErgoClient,
  | 'getTransaction'
  | 'hasUnconfirmedTransaction'
  | 'getBoxByIdOrNull'
  | 'getBlockByHeaderId'
  | 'getBlockHeaderIdsAtHeight'
>;

type PegInSidechainClient = Pick<
  SidechainClient,
  | 'isBoxProcessed'
  | 'getCurrentBlockNumber'
  | 'observePegInMintTransportConfirmation'
>;

export interface PegInBlockTransactionCommitmentVerificationInput {
  readonly block: unknown;
  readonly expectedHeaderIdHex: string;
  readonly expectedHeight: number;
  readonly expectedTransactionIdHex: string;
  readonly expectedTransaction: unknown;
}

export interface PegInTransitionDeps {
  ergo: PegInErgoClient;
  sidechain: PegInSidechainClient;
  state: PegInState;
  vaultErgoTreeHex: string;
  commitConfirmations?: number;
  assertReadQuorumCurrent?: (boundary: string) => void;
  verifyBlockTransactionCommitment: (
    input: PegInBlockTransactionCommitmentVerificationInput,
  ) => Promise<PegInCommitmentVerification>;
}

export type PegInTransitionResult =
  | { status: 'pending'; reason: string }
  | { status: 'confirmed'; vaultBoxId: string }
  | { status: 'minted'; mintTxHash?: string }
  | { status: 'reset'; reason: string }
  | { status: 'invalid'; reason: string }
  | { status: 'incident'; reason: string }
  | { status: 'uncertain'; reason: string };

export type CommitmentObservation =
  | { status: 'pending'; reason: string }
  | {
      status: 'confirmed';
      vaultBoxId: string;
      inclusionHeight: number;
      inclusionBlockId: string;
      commitmentReceipt: Readonly<PegInCommitmentReceipt>;
    }
  | {
      status: 'reorged';
      reason: string;
      incidentKind?: PegInSafetyIncidentKind;
    }
  | {
      status: 'invalid';
      reason: string;
      incidentKind?: PegInSafetyIncidentKind;
    }
  | {
      status: 'evidence_conflict';
      reason: string;
      incidentKind: Extract<
        PegInSafetyIncidentKind,
        'canonical_header_replaced' | 'commitment_receipt_conflict'
      >;
      observedCommitmentReceiptDigestHex: string | null;
    }
  | {
      status: 'chain_conflict';
      reason: string;
      incidentKind: Extract<
        PegInSafetyIncidentKind,
        | 'commitment_disappeared'
        | 'canonical_header_replaced'
        | 'refundable_source_restored'
      >;
    }
  | { status: 'uncertain'; reason: string };

export type ActivePegInDeployment = ActivePegInDeploymentV1;

function normalizeHex(value: string, label: string, expectedBytes?: number): string {
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error(`${label} must be even-length hex`);
  }
  if (expectedBytes !== undefined && clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes`);
  }
  return clean.toLowerCase();
}

function consistentHexAlias(
  value: any,
  fields: readonly string[],
  label: string,
  expectedBytes: number,
): string {
  const aliases = fields
    .filter(field => value?.[field] !== undefined && value?.[field] !== null)
    .map(field => normalizeHex(String(value[field]), label, expectedBytes));
  if (aliases.length === 0) {
    return normalizeHex('', label, expectedBytes);
  }
  if (aliases.some(alias => alias !== aliases[0])) {
    throw new Error(`${label} aliases disagree`);
  }
  return aliases[0];
}

function consistentInclusionHeight(transaction: any): number {
  const aliases = ['inclusionHeight', 'blockHeight']
    .filter(field => transaction?.[field] !== undefined && transaction?.[field] !== null)
    .map(field => Number(transaction[field]));
  if (
    aliases.length === 0
    || aliases.some(value => !Number.isSafeInteger(value) || value < 0)
  ) {
    throw new Error('commit transaction is missing a valid inclusion height');
  }
  if (aliases.some(value => value !== aliases[0])) {
    throw new Error('commit inclusion height aliases disagree');
  }
  return aliases[0];
}

function canonicalPegInCommitment(transaction: any): CanonicalPegInCommitmentV1 {
  const inputs = Array.isArray(transaction?.inputs) ? transaction.inputs : [];
  return Object.freeze({
    transactionIdHex: consistentHexAlias(
      transaction,
      ['id', 'txId'],
      'commit transaction id',
      32,
    ),
    inclusionBlockIdHex: consistentHexAlias(
      transaction,
      ['headerId', 'blockId', 'inclusionBlockId'],
      'commit inclusion block id',
      32,
    ),
    inclusionHeight: consistentInclusionHeight(transaction),
    inputBoxIdsHex: Object.freeze(inputs.map((input: any) => normalizeHex(
      String(input?.boxId ?? ''),
      'transaction input box id',
      32,
    ))),
  });
}

function canonicalRegisterValue(box: any, register: string): string | undefined {
  const value = box?.additionalRegisters?.[register];
  if (typeof value === 'string') return normalizeHex(value, `${register} register`);
  if (typeof value?.serializedValue === 'string') {
    return normalizeHex(value.serializedValue, `${register} register`);
  }
  return undefined;
}

function canonicalCommittedVault(box: any): CanonicalCommittedVaultV1 {
  if (!Array.isArray(box?.assets)) {
    throw new Error('committed vault output assets must be an array');
  }
  return Object.freeze({
    boxIdHex: normalizeHex(String(box?.boxId ?? ''), 'committed vault box id', 32),
    valueNanoErg: BigInt(box?.value),
    ergoTreeHex: normalizeHex(String(box?.ergoTree ?? ''), 'committed vault ErgoTree'),
    tokenCount: box.assets.length,
    registers: Object.freeze({
      R4: canonicalRegisterValue(box, 'R4'),
      R5: canonicalRegisterValue(box, 'R5'),
      R6: canonicalRegisterValue(box, 'R6'),
      R7: canonicalRegisterValue(box, 'R7'),
    }),
  });
}

function pegInMintIntent(event: PegInEvent): PegInMintIntentV1 {
  return {
    assetProfileId: SUBSTRATE_GRANDPA_V1_NATIVE_ERG_ASSET_PROFILE_ID,
    sourceBoxIdHex: event.ergoLockBoxId,
    targetH160Hex: event.targetEvmAddress,
    amountNanoErg: event.amountNanoErg,
    depositorErgoTreeHex: event.depositorErgoTreeHex ?? null,
  };
}

export function resolveActivePegInDeployment(
  deployed: DeployedState,
): ActivePegInDeployment | null {
  return resolveActivePegInDeploymentV1(deployed);
}

export function classifyLegacyPegIn(
  sourceBoxUnspent: boolean,
  sidechainMintProcessed: boolean,
): PegInSourceClassification {
  if (!sourceBoxUnspent) return 'legacy_already_consumed';
  return sidechainMintProcessed
    ? 'legacy_minted_requires_migration'
    : 'legacy_unminted_refundable';
}

export class PegInIncidentPersistenceError extends Error {
  readonly cause: unknown;

  constructor(boxId: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`failed to persist peg-in safety incident for ${boxId}: ${detail}`);
    this.name = 'PegInIncidentPersistenceError';
    this.cause = cause;
  }
}

export class PegInTransitionCoordinator {
  private readonly confirmations: number;

  constructor(private readonly deps: PegInTransitionDeps) {
    const confirmations = deps.commitConfirmations ?? MIN_PEG_IN_COMMIT_CONFIRMATIONS;
    if (
      !Number.isSafeInteger(confirmations) ||
      confirmations < MIN_PEG_IN_COMMIT_CONFIRMATIONS
    ) {
      throw new Error(
        `peg-in commitment confirmations must be at least ${MIN_PEG_IN_COMMIT_CONFIRMATIONS}`,
      );
    }
    this.confirmations = confirmations;
    normalizeHex(deps.vaultErgoTreeHex, 'configured vault ErgoTree');
  }

  private persistIncident(
    boxId: string,
    incident: Parameters<PegInState['markPegInIncident']>[1],
  ): void {
    try {
      this.deps.state.markPegInIncident(boxId, incident);
    } catch (cause) {
      throw new PegInIncidentPersistenceError(boxId, cause);
    }
  }

  private failClosedAfterCommitLoss(
    event: PegInEvent,
    observation: Extract<
      CommitmentObservation,
      {
        status:
          | 'reorged'
          | 'invalid'
          | 'evidence_conflict'
          | 'chain_conflict';
      }
    >,
  ): PegInTransitionResult {
    if (event.status === 'minting') {
      const reason = `${observation.reason}; EVM mint submission may already have been accepted`;
      this.persistIncident(event.ergoLockBoxId, {
        kind: observation.incidentKind ?? 'mint_outcome_commitment_lost',
        reason,
        observedCommitmentReceiptDigestHex:
          observation.status === 'evidence_conflict'
            ? observation.observedCommitmentReceiptDigestHex
            : null,
      });
      return { status: 'incident', reason };
    }
    if (
      observation.status === 'evidence_conflict'
      || observation.status === 'chain_conflict'
    ) {
      return { status: 'uncertain', reason: observation.reason };
    }
    if (observation.status === 'reorged') {
      this.deps.state.resetPegInCommit(event.ergoLockBoxId, observation.reason);
      return { status: 'reset', reason: observation.reason };
    }
    this.deps.state.markPegInCommitInvalid(event.ergoLockBoxId, observation.reason);
    return observation;
  }

  private async reconcileProcessedMintTransport(
    event: PegInEvent,
  ): Promise<PegInTransitionResult | null> {
    const attempt =
      this.deps.state.getLatestPegInMintTransportAttempt(
        event.ergoLockBoxId,
      );
    if (!attempt) return null;
    if (
      !['pending', 'accepted', 'ambiguous', 'confirmed'].includes(
        attempt.status,
      )
    ) {
      const reason =
        `processed EVM mint conflicts with ${attempt.status}`
        + ' exact transport evidence';
      this.persistIncident(event.ergoLockBoxId, {
        kind: 'submission_identity_mismatch',
        reason,
      });
      return { status: 'incident', reason };
    }

    let confirmation;
    try {
      confirmation =
        await this.deps.sidechain.observePegInMintTransportConfirmation(
          attempt.expectedTransactionHashHex,
        );
    } catch (error: any) {
      return {
        status: 'uncertain',
        reason:
          `cannot reconcile exact EVM mint confirmation: ${error.message}`,
      };
    }
    if (confirmation.status === 'absent') {
      return {
        status: 'uncertain',
        reason:
          'processed EVM mint has no receipt for the exact reserved transaction',
      };
    }
    if (confirmation.status === 'pending') {
      return {
        status: 'pending',
        reason:
          `exact reserved EVM mint has ${confirmation.confirmationCount}`
          + `/${PEG_IN_MINT_CONFIRMATIONS} required confirmations`,
      };
    }
    this.deps.state.confirmPegInMintTransportRecovery(
      event.ergoLockBoxId,
      attempt.expectedTransactionHashHex,
      confirmation.submission,
    );
    return {
      status: 'minted',
      mintTxHash: `0x${confirmation.submission.transactionHashHex}`,
    };
  }

  async observeCommitment(
    event: PegInEvent,
    currentHeight: number,
    requireVaultUnspent: boolean,
  ): Promise<CommitmentObservation> {
    if (!event.commitTxId) {
      return { status: 'invalid', reason: 'peg-in has no persisted commitment transaction id' };
    }
    if (!Number.isSafeInteger(currentHeight) || currentHeight < 0) {
      return { status: 'uncertain', reason: 'current Ergo height is invalid' };
    }

    let tx: any | null;
    try {
      tx = await this.deps.ergo.getTransaction(event.commitTxId);
    } catch (error: any) {
      return { status: 'uncertain', reason: `cannot read commitment transaction: ${error.message}` };
    }
    if (!tx) {
      try {
        const inMempool = await this.deps.ergo.hasUnconfirmedTransaction(
          event.commitTxId,
        );
        let retainedHeaderCanonical = false;
        if (event.commitmentReceipt) {
          if (currentHeight < event.commitmentReceipt.verification.height) {
            return {
              status: 'uncertain',
              reason:
                'current Ergo tip rolled below the retained commitment inclusion height',
            };
          }
          const retainedHeaderIds = (
            await this.deps.ergo.getBlockHeaderIdsAtHeight(
              event.commitmentReceipt.verification.height,
            )
          ).map(id => normalizeHex(String(id), 'canonical block id', 32));
          if (retainedHeaderIds.length === 0) {
            return {
              status: 'uncertain',
              reason:
                'canonical header index returned no identity at the retained commitment height',
            };
          }
          // Ergo may return fork headers after the best-chain header. Only the
          // first identity is canonical at this height.
          retainedHeaderCanonical = retainedHeaderIds[0]
            === event.commitmentReceipt.verification.headerIdHex;
        }
        const sourceBox = await this.deps.ergo.getBoxByIdOrNull(
          event.ergoLockBoxId,
        );
        if (event.commitmentReceipt && retainedHeaderCanonical) {
          if (sourceBox) {
            return {
              status: 'chain_conflict',
              reason:
                'retained header remains canonical while the commitment transaction is absent and the source deposit is refundable',
              incidentKind: 'refundable_source_restored',
            };
          }
          return {
            status: 'uncertain',
            reason:
              'transaction, mempool, source-box, and retained canonical-header RPC evidence disagree',
          };
        }
        if (event.commitmentReceipt) {
          return sourceBox
            ? {
                status: 'reorged',
                reason:
                  'retained commitment header left the canonical chain and the source deposit is refundable again',
                incidentKind: 'refundable_source_restored',
              }
            : {
                status: 'chain_conflict',
                reason: inMempool
                  ? 'retained commitment header left the canonical chain and the transaction is only in the mempool'
                  : 'retained commitment header and transaction disappeared while the source deposit remains unavailable',
                incidentKind: 'commitment_disappeared',
              };
        }
        if (inMempool) {
          return {
            status: 'pending',
            reason: 'commitment transaction remains in the mempool',
          };
        }
        return sourceBox
          ? {
              status: 'reorged',
              reason: 'commitment left the canonical chain and source deposit is refundable again',
              incidentKind: 'refundable_source_restored',
            }
          : {
              status: 'chain_conflict',
              reason: 'commitment is absent and the source deposit is also unavailable',
              incidentKind: 'commitment_disappeared',
            };
      } catch (error: any) {
        return { status: 'uncertain', reason: `cannot classify missing commitment: ${error.message}` };
      }
    }

    try {
      let inclusion: CanonicalPegInCommitmentV1;
      try {
        inclusion = inspectPegInCommitmentInclusionV1({
          commitment: canonicalPegInCommitment(tx),
          expectedTransactionIdHex: event.commitTxId,
          sourceBoxIdHex: event.ergoLockBoxId,
        });
      } catch (error: any) {
        return {
          status: 'uncertain',
          reason: `commitment transaction RPC evidence is inconsistent: ${error.message}`,
        };
      }
      const inclusionHeight = inclusion.inclusionHeight;
      const inclusionBlockId = inclusion.inclusionBlockIdHex;
      if (currentHeight < inclusionHeight) {
        return {
          status: 'uncertain',
          reason: 'current Ergo height is below commitment inclusion height',
        };
      }
      let canonicalBlockIds: string[];
      try {
        canonicalBlockIds = (
          await this.deps.ergo.getBlockHeaderIdsAtHeight(inclusionHeight)
        ).map(id => normalizeHex(String(id), 'canonical block id', 32));
      } catch (error: any) {
        return {
          status: 'uncertain',
          reason:
            `cannot read canonical commitment inclusion height: ${error.message}`,
        };
      }
      if (canonicalBlockIds.length === 0) {
        return {
          status: 'uncertain',
          reason:
            'canonical header index returned no identity at the commitment inclusion height',
        };
      }
      // `/blocks/at/{height}` orders the best-chain header first; later entries
      // are known fork identities and must never authorize minting.
      if (canonicalBlockIds[0] !== inclusionBlockId) {
        let sourceBox: unknown;
        try {
          sourceBox = await this.deps.ergo.getBoxByIdOrNull(
            event.ergoLockBoxId,
          );
        } catch (error: any) {
          return {
            status: 'uncertain',
            reason:
              `cannot classify noncanonical commitment: ${error.message}`,
          };
        }
        return sourceBox
          ? {
              status: 'reorged',
              reason: 'commitment inclusion block is no longer canonical and source deposit is refundable again',
              incidentKind: 'refundable_source_restored',
            }
          : {
              status: 'chain_conflict',
              reason: 'commitment inclusion block is no longer canonical but source deposit remains unavailable',
              incidentKind: 'canonical_header_replaced',
            };
      }

      const confirmations = currentHeight - inclusionHeight + 1;
      const hasRequiredConfirmations = confirmations >= this.confirmations;
      if (!hasRequiredConfirmations && !event.commitmentReceipt) {
        return {
          status: 'pending',
          reason: `commitment has ${confirmations}/${this.confirmations} confirmations`,
        };
      }

      let inclusionBlock: unknown;
      try {
        inclusionBlock = await this.deps.ergo.getBlockByHeaderId(inclusionBlockId);
        if (inclusionBlock === null || inclusionBlock === undefined) {
          throw new Error('block response is unavailable');
        }
      } catch (error: any) {
        return {
          status: 'uncertain',
          reason:
            `cannot read commitment inclusion block: ${error.message}`,
        };
      }
      let verification: PegInCommitmentVerification;
      try {
        verification = await this.deps.verifyBlockTransactionCommitment({
          block: inclusionBlock,
          expectedHeaderIdHex: inclusionBlockId,
          expectedHeight: inclusionHeight,
          expectedTransactionIdHex: event.commitTxId,
          expectedTransaction: tx,
        });
      } catch (error: any) {
        return {
          status: 'uncertain',
          reason:
            `cannot authenticate commitment inclusion block: ${error.message}`,
        };
      }

      const vaultOutput = tx?.outputs?.[0];
      if (!vaultOutput) throw new Error('commitment transaction has no OUTPUTS(0) vault output');
      const vaultBoxId = assertExactCommittedVaultV1(
        pegInMintIntent(event),
        canonicalCommittedVault(vaultOutput),
        this.deps.vaultErgoTreeHex,
      );
      let commitmentReceipt: Readonly<PegInCommitmentReceipt>;
      try {
        commitmentReceipt = createPegInCommitmentReceipt({
          sourceBoxIdHex: event.ergoLockBoxId,
          committedVaultBoxIdHex: vaultBoxId,
          commitmentTxIdHex: event.commitTxId,
          verification,
        });
      } catch (error: any) {
        return {
          status: 'uncertain',
          reason:
            `cannot normalize authenticated commitment receipt: ${error.message}`,
        };
      }
      if (
        commitmentReceipt.verification.height !== inclusionHeight
        || commitmentReceipt.verification.headerIdHex !== inclusionBlockId
      ) {
        return {
          status: 'uncertain',
          reason:
            'authenticated commitment receipt does not match independently observed inclusion',
        };
      }
      if (commitmentReceipt.committedVaultBoxIdHex !== vaultBoxId) {
        return {
          status: 'uncertain',
          reason: 'authenticated commitment receipt vault identity disagrees with canonical output',
        };
      }
      if (
        event.commitmentReceipt
        && !pegInCommitmentReceiptsEqual(
          event.commitmentReceipt,
          commitmentReceipt,
        )
      ) {
        return {
          status: 'evidence_conflict',
          reason:
            event.commitmentReceipt.verification.headerIdHex
              !== commitmentReceipt.verification.headerIdHex
              ? 'fresh canonical commitment uses a replacement inclusion header'
              : 'fresh WP-01C commitment receipt does not match retained evidence',
          incidentKind:
            event.commitmentReceipt.verification.headerIdHex
              !== commitmentReceipt.verification.headerIdHex
              ? 'canonical_header_replaced'
              : 'commitment_receipt_conflict',
          observedCommitmentReceiptDigestHex:
            pegInCommitmentReceiptDigestHex(commitmentReceipt),
        };
      }
      if (!hasRequiredConfirmations) {
        return {
          status: 'pending',
          reason: `commitment has ${confirmations}/${this.confirmations} confirmations`,
        };
      }
      if (
        event.committedVaultBoxId &&
        normalizeHex(event.committedVaultBoxId, 'persisted vault box id', 32) !== vaultBoxId
      ) {
        throw new Error('canonical vault box id does not match persisted vault box id');
      }

      let sourceBox: unknown;
      let unspentVaultBox: unknown;
      try {
        sourceBox = await this.deps.ergo.getBoxByIdOrNull(
          event.ergoLockBoxId,
        );
        unspentVaultBox = await this.deps.ergo.getBoxByIdOrNull(vaultBoxId);
      } catch (error: any) {
        return {
          status: 'uncertain',
          reason:
            `cannot read commitment source or vault state: ${error.message}`,
        };
      }
      if (sourceBox) {
        return {
          status: 'chain_conflict',
          reason:
            'authenticated commitment and refundable source RPC evidence disagree',
          incidentKind: 'refundable_source_restored',
        };
      }
      if (requireVaultUnspent && !unspentVaultBox) {
        return {
          status: 'uncertain',
          reason:
            'committed vault output could not be established as unspent immediately before mint',
        };
      }
      if (unspentVaultBox) {
        try {
          assertExactCommittedVaultV1(
            pegInMintIntent(event),
            canonicalCommittedVault(unspentVaultBox),
            this.deps.vaultErgoTreeHex,
          );
        } catch (error: any) {
          return {
            status: 'uncertain',
            reason:
              `cannot authenticate committed vault response: ${error.message}`,
          };
        }
      }
      return {
        status: 'confirmed',
        vaultBoxId,
        inclusionHeight,
        inclusionBlockId,
        commitmentReceipt,
      };
    } catch (error: any) {
      return { status: 'invalid', reason: error.message };
    }
  }

  async advance(event: PegInEvent, currentHeight: number): Promise<PegInTransitionResult> {
    this.deps.state.assertFundsReleaseAuthorized();
    let current = event;
    if (current.status === 'consume_submitted') {
      const observation = await this.observeCommitment(current, currentHeight, true);
      if (observation.status === 'pending' || observation.status === 'uncertain') return observation;
      if (
        observation.status === 'evidence_conflict'
        || observation.status === 'chain_conflict'
      ) {
        return { status: 'uncertain', reason: observation.reason };
      }
      if (observation.status === 'reorged') {
        this.deps.state.resetPegInCommit(current.ergoLockBoxId, observation.reason);
        return { status: 'reset', reason: observation.reason };
      }
      if (observation.status === 'invalid') {
        this.deps.state.markPegInCommitInvalid(current.ergoLockBoxId, observation.reason);
        return observation;
      }
      this.deps.state.recordPegInConsumeConfirmed(
        current.ergoLockBoxId,
        observation.vaultBoxId,
        {
          inclusionHeight: observation.inclusionHeight,
          inclusionHeaderId: observation.inclusionBlockId,
          verification: observation.commitmentReceipt.verification,
        },
      );
      current = {
        ...current,
        status: 'consume_confirmed',
        committedVaultBoxId: observation.vaultBoxId,
        commitInclusionHeight: observation.inclusionHeight,
        commitInclusionHeaderId: observation.inclusionBlockId,
        commitmentReceipt: observation.commitmentReceipt,
        commitmentReceiptDigestHex:
          pegInCommitmentReceiptDigestHex(observation.commitmentReceipt),
      };
    }

    if (current.status !== 'consume_confirmed' && current.status !== 'minting') {
      return { status: 'pending', reason: `peg-in state ${current.status} is not mintable` };
    }
    if (current.status === 'minting' && !current.commitmentReceipt) {
      const reason = 'minting peg-in has no retained WP-01C commitment receipt';
      this.persistIncident(current.ergoLockBoxId, {
        kind: 'missing_commitment_receipt',
        reason,
      });
      return { status: 'incident', reason };
    }

    const canonical = await this.observeCommitment(current, currentHeight, false);
    if (canonical.status === 'pending' || canonical.status === 'uncertain') return canonical;
    if (
      canonical.status === 'reorged'
      || canonical.status === 'invalid'
      || canonical.status === 'evidence_conflict'
      || canonical.status === 'chain_conflict'
    ) {
      return this.failClosedAfterCommitLoss(current, canonical);
    }
    if (!current.commitmentReceipt) {
      this.deps.state.recordPegInConsumeConfirmed(
        current.ergoLockBoxId,
        canonical.vaultBoxId,
        {
          inclusionHeight: canonical.inclusionHeight,
          inclusionHeaderId: canonical.inclusionBlockId,
          verification: canonical.commitmentReceipt.verification,
        },
      );
      current = {
        ...current,
        committedVaultBoxId: canonical.vaultBoxId,
        commitInclusionHeight: canonical.inclusionHeight,
        commitInclusionHeaderId: canonical.inclusionBlockId,
        commitmentReceipt: canonical.commitmentReceipt,
        commitmentReceiptDigestHex:
          pegInCommitmentReceiptDigestHex(canonical.commitmentReceipt),
      };
    }

    const mintIdentity = derivePegInEvmReplayIdentityV1(current.ergoLockBoxId);
    let alreadyProcessed: boolean;
    try {
      alreadyProcessed = await this.deps.sidechain.isBoxProcessed(mintIdentity.sourceBoxIdHex);
    } catch (error: any) {
      return { status: 'uncertain', reason: `cannot verify EVM mint dedup state: ${error.message}` };
    }
    if (alreadyProcessed) {
      const exactRecovery =
        await this.reconcileProcessedMintTransport(current);
      if (exactRecovery) return exactRecovery;
      this.deps.state.recordPegInMinted(current.ergoLockBoxId);
      return { status: 'minted' };
    }

    const preMint = await this.observeCommitment(current, currentHeight, true);
    if (preMint.status === 'pending' || preMint.status === 'uncertain') return preMint;
    if (
      preMint.status === 'reorged'
      || preMint.status === 'invalid'
      || preMint.status === 'evidence_conflict'
      || preMint.status === 'chain_conflict'
    ) {
      return this.failClosedAfterCommitLoss(current, preMint);
    }

    this.deps.assertReadQuorumCurrent?.('peg-in mint reservation');
    if (
      !current.committedVaultBoxId
      || !current.commitmentReceiptDigestHex
    ) {
      const reason = 'peg-in mint lacks exact committed-vault evidence';
      this.persistIncident(current.ergoLockBoxId, {
        kind: 'missing_commitment_receipt',
        reason,
      });
      return { status: 'incident', reason };
    }
    return {
      status: 'pending',
      reason:
        'legacy owner-mint execution is retired; an authenticated V4 pending reservation and atomic runtime consumption are required',
    };
  }

  async reconcileMinted(
    event: PegInEvent,
    currentHeight: number,
  ): Promise<PegInTransitionResult> {
    if (!event.commitmentReceipt) {
      const reason = 'minted peg-in has no retained WP-01C commitment receipt';
      this.persistIncident(event.ergoLockBoxId, {
        kind: 'missing_commitment_receipt',
        reason,
      });
      return { status: 'incident', reason };
    }
    const canonical = await this.observeCommitment(event, currentHeight, false);
    if (canonical.status === 'pending' || canonical.status === 'uncertain') return canonical;
    if (
      canonical.status === 'reorged'
      || canonical.status === 'invalid'
      || canonical.status === 'evidence_conflict'
      || canonical.status === 'chain_conflict'
    ) {
      this.persistIncident(event.ergoLockBoxId, {
        kind: canonical.incidentKind ?? 'commitment_disappeared',
        reason: canonical.reason,
        observedCommitmentReceiptDigestHex:
          canonical.status === 'evidence_conflict'
            ? canonical.observedCommitmentReceiptDigestHex
            : null,
      });
      return { status: 'incident', reason: canonical.reason };
    }

    const mintIdentity = derivePegInEvmReplayIdentityV1(event.ergoLockBoxId);
    let processed: boolean;
    try {
      processed = await this.deps.sidechain.isBoxProcessed(mintIdentity.sourceBoxIdHex);
    } catch (error: any) {
      return { status: 'uncertain', reason: `cannot reconcile EVM mint: ${error.message}` };
    }
    if (processed) {
      const exactRecovery =
        await this.reconcileProcessedMintTransport(event);
      if (exactRecovery) return exactRecovery;
      if (event.status === 'minting') {
        this.deps.state.recordPegInMinted(event.ergoLockBoxId);
      }
      return { status: 'minted', mintTxHash: event.sidechainMintTxHash ?? undefined };
    }

    const retryable = await this.observeCommitment(event, currentHeight, true);
    if (retryable.status === 'confirmed') {
      let stillAbsent: boolean;
      try {
        stillAbsent = !(await this.deps.sidechain.isBoxProcessed(
          mintIdentity.sourceBoxIdHex,
        ));
      } catch (error: any) {
        return {
          status: 'uncertain',
          reason: `cannot confirm EVM mint absence: ${error.message}`,
        };
      }
      if (!stillAbsent) {
        const exactRecovery =
          await this.reconcileProcessedMintTransport(event);
        if (exactRecovery) return exactRecovery;
        if (event.status === 'minting') {
          this.deps.state.recordPegInMinted(event.ergoLockBoxId);
        }
        return {
          status: 'minted',
          mintTxHash: event.sidechainMintTxHash ?? undefined,
        };
      }
      const attempt =
        this.deps.state.getLatestPegInMintTransportAttempt(
          event.ergoLockBoxId,
        );
      if (
        attempt
        && ['pending', 'accepted', 'ambiguous'].includes(attempt.status)
      ) {
        let currentSidechainBlock: number;
        try {
          currentSidechainBlock =
            await this.deps.sidechain.getCurrentBlockNumber();
        } catch (error: any) {
          return {
            status: 'uncertain',
            reason:
              `cannot evaluate mint reservation expiry: ${error.message}`,
          };
        }
        if (currentSidechainBlock <= attempt.expiresAtBlockNumber) {
          return {
            status: 'pending',
            reason:
              'durable mint transport attempt remains within its approval window',
          };
        }
      }
      this.deps.state.resetPegInMintForRetry(
        event.ergoLockBoxId,
        'EVM mint disappeared while the committed vault remains canonical and unspent',
      );
      return {
        status: 'reset',
        reason: 'EVM mint disappeared; reset to consume_confirmed for idempotent retry',
      };
    }
    const reason = retryable.reason;
    if (retryable.status === 'uncertain') return retryable;
    if (retryable.status === 'pending') return retryable;
    this.persistIncident(event.ergoLockBoxId, {
      kind: retryable.incidentKind ?? 'committed_vault_unavailable',
      reason,
      observedCommitmentReceiptDigestHex:
        retryable.status === 'evidence_conflict'
          ? retryable.observedCommitmentReceiptDigestHex
          : null,
    });
    return { status: 'incident', reason };
  }

  async classifyLegacy(
    event: PegInEvent,
    sourceBoxUnspent: boolean,
  ): Promise<PegInSourceClassification> {
    const processed = await this.deps.sidechain.isBoxProcessed(
      derivePegInEvmReplayIdentityV1(event.ergoLockBoxId).sourceBoxIdHex,
    );
    const classification = classifyLegacyPegIn(sourceBoxUnspent, processed);
    this.deps.state.updatePegInClassification(event.ergoLockBoxId, classification);
    if (classification === 'legacy_minted_requires_migration') {
      this.persistIncident(
        event.ergoLockBoxId,
        {
          kind: 'legacy_refundable_after_mint',
          reason: 'legacy source deposit remains refundable after its sidechain mint',
        },
      );
    }
    return classification;
  }
}
