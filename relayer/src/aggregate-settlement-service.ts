/**
 * Aggregate settlement service.
 *
 * Retains offline V1/batch construction for diagnostic checks, authenticated
 * candidate construction, and exact reconciliation of historical submissions.
 * It deliberately exposes no signing, authorization, submission, or broadcast
 * method for a new legacy aggregate payout.
 */

import type { DeployedState } from './config.js';
import type { ErgoClient } from './ergo-client.js';
import { decodeAvlTreeRegisterDigest, ensureEip12Box, MINER_FEE } from './ergo-helpers.js';
import type { ParsedPegOut } from './sidechain-client.js';
import type {
  AggregateSettlementAttempt,
  PegOutEventLookup,
  StateTracker,
  SubmittedSettlementStatus,
} from './state-tracker.js';
import {
  assertStableAggregateSettlementErgoObservationProvenance,
  observeStableAggregateSettlementErgoTransaction,
} from './aggregate-settlement-ergo-observation.js';
import type { AggregateSettlementErgoFinalityPolicyV1 } from './aggregate-settlement-ergo-finality-policy.js';
import {
  deriveSpvTrackerKey,
  encodeSpvTrackerValue,
  type SpvTrackerEntry,
  type SpvTrackerIdentity,
} from './spv-tracker.js';
import {
  buildAggregateSettlementPlan,
  buildBatchSettlementPlan,
  BATCH_UNLOCK_MAX_CLAIMS,
  type AggregateSettlementClaim,
  type AggregateSettlementPlan,
  type AuthenticatedSettlementPlan,
  type BatchSettlementPlan,
  type SettlementIdentity,
} from './aggregate-settlement-builder.js';
import { getDupTreeDigest } from './avl-bridge.js';
import {
  buildSingleClaimAggregateSettlementTx,
  buildTrustlessSingleLeafAggregateSettlementTx,
  buildBatchAggregateSettlementTx,
  type AggregateSettlementUnsignedTx,
  type BoxLike,
} from './aggregate-settlement-tx.js';
import {
  assembleSubstrateGrandpaV1AuthenticatedSettlementUnsignedTx,
  buildValidatedSubstrateGrandpaV1AuthenticatedSettlementPlan,
  prepareSubstrateGrandpaV1AuthenticatedSettlementUnsignedTx,
  type AuthenticatedSettlementContractIdentities,
  type PreparedSubstrateGrandpaV1AuthenticatedSettlementUnsignedTx,
} from './profiles/substrate-grandpa-v1/authenticated-settlement-candidate.js';
import {
  assertContextExtensionSafe,
  ContextExtensionDivergenceError,
  MAX_SAFE_CONTEXT_EXTENSION_VARS,
  type ContextExtensionOffender,
} from './context-extension-guard.js';
import {
  buildAggregateSettlementTrustlessCandidateEvidenceRecord,
  buildAggregateSettlementTrustlessUnsignedTxEvidenceRecord,
  summarizePreparedSettlementShape,
  summarizeTrustlessUnsignedTxPayoutBinding,
  type AggregateSettlementTrustlessCandidateEvidenceRecord,
  type AggregateSettlementTrustlessUnsignedTxEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import type {
  AuthenticatedSpvTrackerHistoryEntry,
  AuthenticatedSpvTrackerIdentity,
} from './spv-tracker-authenticated.js';
import { deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';
import { safeNanoErgNumber } from './tx-balance.js';
export { AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS } from './aggregate-settlement-limits.js';

type ServiceErgoClient = Pick<
  ErgoClient,
  | 'addressToTree'
  | 'findSingletonBox'
  | 'getBlockHeaderHash'
  | 'getCurrentHeight'
  | 'getTransaction'
  | 'hasUnconfirmedTransaction'
  | 'getUnspentBoxesByAddress'
>;

type ServiceStateTracker = Pick<
  StateTracker,
  | 'getAllAvlKeys'
  | 'getAggregateSettlementAttempt'
  | 'getAuthenticatedV2DupHistory'
  | 'getAuthenticatedSpvTrackerHistory'
  | 'getPegOutEventCountByTxHash'
  | 'getSpvTrackerHistory'
  | 'getSpvTrackerIdentityByHeight'
  | 'getSubmittedSettlementTxId'
  | 'hasAvlKey'
  | 'confirmSubmittedSingleSettlementAttempt'
  | 'confirmSubmittedBatchSettlementAttempt'
  | 'updatePegOutStatus'
> & Partial<Pick<
  StateTracker,
  'markPegOutBurnRevertedAndInvalidateCandidates'
>>;

export type SidechainBurnVerificationStatus = 'confirmed' | 'reverted' | 'unknown';

export interface AggregateSettlementServiceDeps {
  ergo: ServiceErgoClient;
  state: ServiceStateTracker;
  deployed: DeployedState;
  sidechainIdHex?: string;
  verifySidechainBurn?: (pegOut: ParsedPegOut) => Promise<SidechainBurnVerificationStatus>;
}

export interface PrepareSingleClaimAggregateSettlementInput {
  pegOut: ParsedPegOut;
  trackerIdentity: SpvTrackerIdentity;
  trackerIngest?: SpvTrackerEntry;
  creationHeight?: number;
  unlockBoxId?: string;
}

export interface PrepareSingleClaimFromPegOutInput {
  pegOut: ParsedPegOut;
  sidechainIdHex?: string;
  creationHeight?: number;
  unlockBoxId?: string;
}

export interface PrepareTrustlessSettlementCandidateInput {
  pegOut: ParsedPegOut;
  trackerIdentity: SpvTrackerIdentity;
  settlementIdentity: SettlementIdentity;
  trackerIngest?: SpvTrackerEntry;
  evidenceLabel?: string;
  evidenceGeneratedAt?: string;
}

export interface PrepareTrustlessSingleLeafUnsignedTxInput extends PrepareTrustlessSettlementCandidateInput {
  creationHeight?: number;
  unlockBoxId?: string;
}

export interface PrepareAuthenticatedSettlementUnsignedTxInput {
  pegOut: ParsedPegOut;
  trackerIdentity: AuthenticatedSpvTrackerIdentity;
  settlementIdentity: SettlementIdentity;
  creationHeight?: number;
  unlockBoxId?: string;
}

export interface PrepareBatchClaimsInput {
  claims: Array<{
    pegOut: ParsedPegOut;
    trackerIdentity: SpvTrackerIdentity;
  }>;
  trackerIngest?: SpvTrackerEntry;
  creationHeight?: number;
  unlockBoxId?: string;
}

export interface PreparedAggregateSettlement {
  plan: AggregateSettlementPlan;
  unsignedTx: AggregateSettlementUnsignedTx;
  eip12Tx: {
    inputs: Array<BoxLike & { extension: Record<string, string> }>;
    dataInputs: any[];
    outputs: any[];
  };
  recipientErgoTreeHex: string;
  trackerBox: BoxLike;
  aggregateDupBox: BoxLike;
  unlockBox: BoxLike;
}

export interface PreparedBatchSettlement {
  plan: BatchSettlementPlan;
  unsignedTx: AggregateSettlementUnsignedTx;
  eip12Tx: {
    inputs: Array<BoxLike & { extension: Record<string, string> }>;
    dataInputs: any[];
    outputs: any[];
  };
  recipientErgoTreeHexes: string[];
  trackerBox: BoxLike;
  aggregateDupBox: BoxLike;
  unlockBox: BoxLike;
  claimCount: number;
}

export interface PreparedTrustlessSettlementCandidate {
  plan: AggregateSettlementPlan;
  evidence: AggregateSettlementTrustlessCandidateEvidenceRecord;
}

export interface TrustlessSingleLeafContextExtensionGuardReport {
  status: 'pass' | 'blocked';
  reason: 'unsigned-source-boundary-only' | 'context-extension-serialization-conformance';
  effectiveThreshold: number;
  offenders: ContextExtensionOffender[];
  signingPermitted: false;
  broadcastPermitted: false;
  message?: string;
}

export interface PreparedTrustlessSingleLeafUnsignedSettlement {
  plan: AggregateSettlementPlan;
  evidence: AggregateSettlementTrustlessCandidateEvidenceRecord;
  unsignedTxEvidence: AggregateSettlementTrustlessUnsignedTxEvidenceRecord;
  unsignedTx: AggregateSettlementUnsignedTx;
  eip12Tx: {
    inputs: Array<BoxLike & { extension: Record<string, string> }>;
    dataInputs: any[];
    outputs: any[];
  };
  recipientErgoTreeHex: string;
  trackerBox: BoxLike;
  aggregateDupBox: BoxLike;
  unlockBox: BoxLike;
  contextExtensionGuard: TrustlessSingleLeafContextExtensionGuardReport;
}

const PREPARED_AUTHENTICATED_SETTLEMENT_UNSIGNED_TX_BRAND: unique symbol = Symbol(
  'e2s.prepared-authenticated-settlement-unsigned-tx',
);
const PREPARED_AUTHENTICATED_SETTLEMENT_UNSIGNED_TX_RESULTS = new WeakSet<object>();

export interface PreparedAuthenticatedSettlementUnsignedTxPayload {
  plan: AuthenticatedSettlementPlan;
  unsignedTx: AggregateSettlementUnsignedTx;
  eip12Tx: {
    inputs: Array<BoxLike & { extension: Record<string, string> }>;
    dataInputs: any[];
    outputs: any[];
  };
  recipientErgoTreeHex: string;
  trackerBox: BoxLike;
  authenticatedDupBox: BoxLike;
  unlockBox: BoxLike;
  contextExtensionGuard: TrustlessSingleLeafContextExtensionGuardReport;
}

export type PreparedAuthenticatedSettlementUnsignedTx =
  PreparedAuthenticatedSettlementUnsignedTxPayload & {
    readonly [PREPARED_AUTHENTICATED_SETTLEMENT_UNSIGNED_TX_BRAND]: true;
  };

export type {
  AuthenticatedSettlementContractIdentities,
} from './profiles/substrate-grandpa-v1/authenticated-settlement-candidate.js';

export interface PrepareAuthenticatedSettlementUnsignedTxPureInput {
  contractIdentities: AuthenticatedSettlementContractIdentities;
  trackerBox: BoxLike;
  authenticatedDupBox: BoxLike;
  unlockBox: BoxLike;
  trackerHistory: AuthenticatedSpvTrackerHistoryEntry[];
  dupHistoryKeys: string[];
  pegOut: ParsedPegOut;
  trackerIdentity: AuthenticatedSpvTrackerIdentity;
  settlementIdentity: SettlementIdentity;
  recipientErgoTreeHex: string;
  creationHeight: number;
}

export function assertPreparedAuthenticatedSettlementUnsignedTxProvenance(
  prepared: unknown,
): asserts prepared is PreparedAuthenticatedSettlementUnsignedTx {
  if (
    typeof prepared !== 'object'
    || prepared === null
    || !PREPARED_AUTHENTICATED_SETTLEMENT_UNSIGNED_TX_RESULTS.has(prepared)
  ) {
    throw new Error('prepared authenticated settlement transaction provenance is missing');
  }
}

function authorizePreparedAuthenticatedSettlementUnsignedTx(
  prepared: PreparedAuthenticatedSettlementUnsignedTxPayload,
): PreparedAuthenticatedSettlementUnsignedTx {
  PREPARED_AUTHENTICATED_SETTLEMENT_UNSIGNED_TX_RESULTS.add(prepared);
  return prepared as PreparedAuthenticatedSettlementUnsignedTx;
}

function normalizeHex(hex: string, label: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error(`${label} must be even-length hex`);
  }
  return clean.toLowerCase();
}

function normalizeBurnTxId(txHash: string): string {
  const clean = normalizeHex(txHash, 'sidechainTxHash');
  if (clean.length !== 64) {
    throw new Error(`sidechainTxHash must be 32 bytes, got ${clean.length / 2}`);
  }
  return clean;
}

function normalizeTransactionId(txId: string): string | undefined {
  try {
    return normalizeFixedHex(txId, 32, 'settlementTxId');
  } catch {
    return undefined;
  }
}

function normalizeFixedHex(hex: string, expectedBytes: number, label: string): string {
  const clean = normalizeHex(hex, label);
  if (clean.length !== expectedBytes * 2) {
    throw new Error(`${label} must be ${expectedBytes} bytes, got ${clean.length / 2}`);
  }
  return clean;
}

function hasNoAssets(box: BoxLike): boolean {
  return !box.assets || box.assets.length === 0;
}

function boxValue(box: BoxLike): number {
  return safeNanoErgNumber(box.value, 'aggregate unlock box value');
}

function assertBoxAvlDigest(box: BoxLike, expectedDigestHex: string, label: string): void {
  const r5 = box.additionalRegisters?.R5;
  if (!r5) throw new Error(`${label} box is missing R5 AvlTree register`);

  const actualDigestHex = decodeAvlTreeRegisterDigest(r5, `${label} R5`);
  if (actualDigestHex !== expectedDigestHex.toLowerCase()) {
    throw new Error(
      `${label} AVL digest mismatch: on-chain ${actualDigestHex}, ` +
      `rebuilt local history ${expectedDigestHex.toLowerCase()}`,
    );
  }
}

function outputHasToken(output: any, tokenId: string): boolean {
  return (output.assets || []).some((asset: any) => asset.tokenId === tokenId && Number(asset.amount) === 1);
}

function outputValueAtLeast(output: any, value: number): boolean {
  return BigInt(output.value) >= BigInt(value);
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function toStateSpvTrackerEntry(entry: SpvTrackerEntry) {
  return {
    keyHex: deriveSpvTrackerKey(entry),
    valueHex: encodeSpvTrackerValue(entry),
    sidechainHeight: BigInt(entry.sidechainHeight),
    sidechainHeaderHash: normalizeFixedHex(entry.sidechainHeaderHashHex, 32, 'sidechainHeaderHash'),
    bridgeEventRoot: normalizeFixedHex(entry.bridgeEventRootHex, 32, 'bridgeEventRoot'),
    ergoAnchorHeight: entry.ergoAnchorHeight,
  };
}

function trackerSuccessorDigest(output: any): string | null {
  const r5 = output?.additionalRegisters?.R5;
  if (typeof r5 !== 'string') return null;
  return decodeAvlTreeRegisterDigest(r5, 'confirmed tracker successor R5');
}

function aggregateSettlementErgoFinalityPolicy(
  attempt: AggregateSettlementAttempt,
): AggregateSettlementErgoFinalityPolicyV1 | null {
  if (
    attempt.recoveryBindingStatus !== 'policy_v1'
    || attempt.recoveryPolicyVersion !== 1
    || attempt.recoveryRequiredConfirmations === null
  ) {
    return null;
  }
  return {
    version: 1,
    requiredConfirmations: attempt.recoveryRequiredConfirmations,
  };
}

function pegOutEventLookup(pegOut: ParsedPegOut): PegOutEventLookup {
  return pegOut.sidechainLogIndex === undefined
    ? pegOut.sidechainTxHash
    : {
      burnTxHash: pegOut.sidechainTxHash,
      sidechainLogIndex: pegOut.sidechainLogIndex,
    };
}

function summarizeDefaultContextExtensionGuard(
  inputs: AggregateSettlementUnsignedTx['inputs'],
  label: string,
): TrustlessSingleLeafContextExtensionGuardReport {
  try {
    assertContextExtensionSafe(inputs, label, MAX_SAFE_CONTEXT_EXTENSION_VARS);
    return {
      status: 'pass',
      reason: 'unsigned-source-boundary-only',
      effectiveThreshold: MAX_SAFE_CONTEXT_EXTENSION_VARS,
      offenders: [],
      signingPermitted: false,
      broadcastPermitted: false,
    };
  } catch (err) {
    if (err instanceof ContextExtensionDivergenceError) {
      return {
        status: 'blocked',
        reason: 'context-extension-serialization-conformance',
        effectiveThreshold: err.effectiveThreshold,
        offenders: err.offenders,
        signingPermitted: false,
        broadcastPermitted: false,
        message: err.message,
      };
    }
    throw err;
  }
}

export function prepareAuthenticatedSettlementUnsignedTxPure(
  input: PrepareAuthenticatedSettlementUnsignedTxPureInput,
): PreparedAuthenticatedSettlementUnsignedTxPayload {
  return materializeAuthenticatedSettlementUnsignedTxPure(
    prepareSubstrateGrandpaV1AuthenticatedSettlementUnsignedTx(input),
  );
}

function materializeAuthenticatedSettlementUnsignedTxPure(
  input: PreparedSubstrateGrandpaV1AuthenticatedSettlementUnsignedTx,
): PreparedAuthenticatedSettlementUnsignedTxPayload {
  const spentInputBoxes = [input.authenticatedDupBox, input.unlockBox];
  const eip12Tx = {
    inputs: input.unsignedTx.inputs.map((txInput, index) => ({
      ...ensureEip12Box(spentInputBoxes[index]),
      extension: txInput.extension,
    })),
    dataInputs: input.unsignedTx.dataInputs.map((dataInput, index) => {
      const box = [input.trackerBox][index];
      if (!box || dataInput.boxId !== box.boxId) {
        throw new Error('authenticated settlement tracker data-input ordering drifted');
      }
      return ensureEip12Box(box);
    }),
    outputs: input.unsignedTx.outputs,
  };
  const contextExtensionGuard = summarizeDefaultContextExtensionGuard(
    input.unsignedTx.inputs,
    'Authenticated V2 single-leaf settlement',
  );
  const prepared = deepFreeze(structuredClone({
    plan: input.plan,
    unsignedTx: input.unsignedTx,
    eip12Tx,
    recipientErgoTreeHex: input.recipientErgoTreeHex,
    trackerBox: input.trackerBox,
    authenticatedDupBox: input.authenticatedDupBox,
    unlockBox: input.unlockBox,
    contextExtensionGuard,
  })) as PreparedAuthenticatedSettlementUnsignedTxPayload;
  return prepared;
}

export async function resolveAggregateRecipientErgoTree(
  raw: string,
  addressToTree: (address: string) => Promise<string>,
): Promise<string> {
  const clean = raw.startsWith('0x') ? raw.slice(2) : raw;
  if (/^(02|03)[0-9a-fA-F]{64}$/.test(clean)) {
    return `0008cd${clean.toLowerCase()}`;
  }

  if (/^[0-9a-fA-F]+$/.test(clean) && clean.length >= 72 && clean.length % 2 === 0) {
    return normalizeHex(clean, 'recipient ErgoTree');
  }

  return normalizeHex(await addressToTree(raw), 'recipient ErgoTree');
}

export class AggregateSettlementService {
  constructor(private deps: AggregateSettlementServiceDeps) {}

  async prepareSingleClaim(
    input: PrepareSingleClaimAggregateSettlementInput,
  ): Promise<PreparedAggregateSettlement> {
    const deployed = this.deps.deployed;
    if (!deployed.spvTracker) throw new Error('deployed.spvTracker is required');
    if (!deployed.doubleUnlockPreventionAggregate) {
      throw new Error('deployed.doubleUnlockPreventionAggregate is required');
    }
    if (!deployed.mainChainAggregateUnlock) {
      throw new Error('deployed.mainChainAggregateUnlock is required');
    }

    const creationHeight = input.creationHeight ?? await this.deps.ergo.getCurrentHeight();
    const recipientErgoTreeHex = await this.resolveRecipientErgoTree(input.pegOut.ergoRecipientAddress);
    const spvHistory = this.deps.state.getSpvTrackerHistory();
    const dupHistoryKeys = this.deps.state.getAllAvlKeys();

    const claim: AggregateSettlementClaim = {
      pegOut: input.pegOut,
      trackerIdentity: input.trackerIdentity,
    };
    const plan = buildAggregateSettlementPlan({
      spvHistory,
      dupHistoryKeys,
      ingests: input.trackerIngest ? [input.trackerIngest] : undefined,
      claims: [claim],
    });
    if (plan.requiresBatchedDupContract) {
      throw new Error('V1 aggregate settlement service only supports one claim');
    }

    const trackerBox = await this.deps.ergo.findSingletonBox(deployed.spvTracker.nftId) as BoxLike;
    const aggregateDupBox = await this.deps.ergo.findSingletonBox(
      deployed.doubleUnlockPreventionAggregate.nftId,
    ) as BoxLike;
    assertBoxAvlDigest(trackerBox, plan.trackerInputDigestHex, 'SPV tracker input');
    assertBoxAvlDigest(aggregateDupBox, getDupTreeDigest(dupHistoryKeys), 'Aggregate DUP input');

    const payoutValue = safeNanoErgNumber(input.pegOut.amount, 'peg-out amount');
    if (payoutValue > Number.MAX_SAFE_INTEGER - MINER_FEE) {
      throw new Error(`peg-out amount plus miner fee is outside JavaScript safe integer range: ${input.pegOut.amount}`);
    }
    const unlockBox = await this.selectUnlockBox(
      deployed.mainChainAggregateUnlock.address,
      payoutValue + MINER_FEE,
      input.unlockBoxId,
    );

    const unsignedTx = buildSingleClaimAggregateSettlementTx({
      deployed,
      plan,
      trackerBox,
      aggregateDupBox,
      unlockBox,
      recipientErgoTreeHex,
      creationHeight,
    });

    const inputBoxes = [trackerBox, aggregateDupBox, unlockBox];
    const eip12Tx = {
      inputs: unsignedTx.inputs.map((txInput, index) => ({
        ...ensureEip12Box(inputBoxes[index]),
        extension: txInput.extension,
      })),
      dataInputs: unsignedTx.dataInputs,
      outputs: unsignedTx.outputs,
    };

    return {
      plan,
      unsignedTx,
      eip12Tx,
      recipientErgoTreeHex,
      trackerBox,
      aggregateDupBox,
      unlockBox,
    };
  }

  async prepareSingleClaimNoIngest(
    input: PrepareSingleClaimAggregateSettlementInput,
  ): Promise<PreparedAggregateSettlement> {
    return await this.prepareSingleClaim({
      ...input,
      trackerIngest: undefined,
    });
  }

  async prepareSingleClaimNoIngestFromPegOut(
    input: PrepareSingleClaimFromPegOutInput,
  ): Promise<PreparedAggregateSettlement> {
    const sidechainIdHex = input.sidechainIdHex ?? this.deps.sidechainIdHex;
    if (!sidechainIdHex) {
      throw new Error('sidechainIdHex is required to resolve SPV tracker identity from a PegOut');
    }

    const trackerIdentity = this.deps.state.getSpvTrackerIdentityByHeight(
      input.pegOut.sidechainBlockNumber,
      sidechainIdHex,
    );
    if (!trackerIdentity) {
      throw new Error(`no SPV tracker entry for sidechain height ${input.pegOut.sidechainBlockNumber}`);
    }

    return await this.prepareSingleClaimNoIngest({
      pegOut: input.pegOut,
      trackerIdentity,
      creationHeight: input.creationHeight,
      unlockBoxId: input.unlockBoxId,
    });
  }

  async prepareTrustlessSettlementCandidate(
    input: PrepareTrustlessSettlementCandidateInput,
  ): Promise<PreparedTrustlessSettlementCandidate> {
    const plan = buildAggregateSettlementPlan({
      spvHistory: this.deps.state.getSpvTrackerHistory(),
      dupHistoryKeys: this.deps.state.getAllAvlKeys(),
      ingests: input.trackerIngest ? [input.trackerIngest] : undefined,
      claims: [{
        pegOut: input.pegOut,
        trackerIdentity: input.trackerIdentity,
        settlementIdentity: input.settlementIdentity,
      }],
    });
    if (plan.contractCompatibility !== 'candidate-only-trustless-v2-required') {
      throw new Error('trustless settlement candidate requires trustless-burn-leaf settlement identity');
    }
    const evidence = buildAggregateSettlementTrustlessCandidateEvidenceRecord({
      generatedAt: input.evidenceGeneratedAt,
      label: input.evidenceLabel ?? 'Trustless aggregate settlement candidate',
      claims: plan.claims.map(claim => {
        const sidechainLogIndexValue = claim.claim.pegOut.sidechainLogIndex;
        if (
          typeof sidechainLogIndexValue !== 'number' ||
          !Number.isSafeInteger(sidechainLogIndexValue) ||
          sidechainLogIndexValue < 0
        ) {
          throw new Error('sidechainLogIndex is required to produce trustless settlement candidate evidence');
        }
        if (sidechainLogIndexValue > 0xffff_ffff) {
          throw new Error('sidechainLogIndex must fit uint32 to produce trustless settlement candidate evidence');
        }
        const sidechainLogIndex = sidechainLogIndexValue;
        const legacySidechainTxHash = normalizeBurnTxId(claim.claim.pegOut.sidechainTxHash);
        if (claim.settlementIdentity.recipientErgoTreeHashHex === undefined) {
          throw new Error('trustless settlement candidate evidence requires recipientErgoTreeHashHex');
        }
        if (claim.settlementIdentity.amountNanoErg === undefined) {
          throw new Error('trustless settlement candidate evidence requires amountNanoErg');
        }
        return {
          legacySidechainTxHash,
          sidechainBlockHeight: claim.claim.pegOut.sidechainBlockNumber,
          trustlessBurnDerivation: {
            sidechainIdHex: claim.claim.trackerIdentity.sidechainIdHex,
            sidechainLogIndex,
            derivedBurnIdHex: deriveTrustlessBurnIdHex({
              sidechainIdHex: claim.claim.trackerIdentity.sidechainIdHex,
              sidechainTxHashHex: legacySidechainTxHash,
              eventIndex: sidechainLogIndex,
            }),
          },
          settlementIdentity: {
            source: 'trustless-burn-leaf',
            duplicatePreventionKeyHex: claim.settlementIdentity.duplicatePreventionKeyHex,
            bridgeEventRootHex: claim.settlementIdentity.bridgeEventRootHex,
            recipientErgoTreeHashHex: claim.settlementIdentity.recipientErgoTreeHashHex,
            amountNanoErg: claim.settlementIdentity.amountNanoErg.toString(),
            ...(claim.settlementIdentity.assetIdHex === undefined
              ? {}
              : { assetIdHex: claim.settlementIdentity.assetIdHex }),
          },
        };
      }),
    });
    return { plan, evidence };
  }

  async prepareTrustlessSingleLeafUnsignedTx(
    input: PrepareTrustlessSingleLeafUnsignedTxInput,
  ): Promise<PreparedTrustlessSingleLeafUnsignedSettlement> {
    const deployed = this.deps.deployed;
    if (!deployed.spvTracker) throw new Error('deployed.spvTracker is required');
    if (!deployed.doubleUnlockPreventionAggregate) {
      throw new Error('deployed.doubleUnlockPreventionAggregate is required');
    }
    if (!deployed.mainChainAggregateUnlockTrustless) {
      throw new Error('deployed.mainChainAggregateUnlockTrustless is required');
    }

    const { plan, evidence } = await this.prepareTrustlessSettlementCandidate(input);
    const creationHeight = input.creationHeight ?? await this.deps.ergo.getCurrentHeight();
    const recipientErgoTreeHex = await this.resolveRecipientErgoTree(input.pegOut.ergoRecipientAddress);

    const trackerBox = await this.deps.ergo.findSingletonBox(deployed.spvTracker.nftId) as BoxLike;
    const aggregateDupBox = await this.deps.ergo.findSingletonBox(
      deployed.doubleUnlockPreventionAggregate.nftId,
    ) as BoxLike;
    assertBoxAvlDigest(trackerBox, plan.trackerInputDigestHex, 'SPV tracker input');
    assertBoxAvlDigest(aggregateDupBox, getDupTreeDigest(this.deps.state.getAllAvlKeys()), 'Aggregate DUP input');

    const payoutValue = safeNanoErgNumber(input.pegOut.amount, 'peg-out amount');
    if (payoutValue > Number.MAX_SAFE_INTEGER - MINER_FEE) {
      throw new Error(`peg-out amount plus miner fee is outside JavaScript safe integer range: ${input.pegOut.amount}`);
    }
    const unlockBox = await this.selectUnlockBox(
      deployed.mainChainAggregateUnlockTrustless.address,
      payoutValue + MINER_FEE,
      input.unlockBoxId,
    );

    const unsignedTx = buildTrustlessSingleLeafAggregateSettlementTx({
      deployed,
      plan,
      trackerBox,
      aggregateDupBox,
      unlockBox,
      recipientErgoTreeHex,
      creationHeight,
    });

    const inputBoxes = [trackerBox, aggregateDupBox, unlockBox];
    const eip12Tx = {
      inputs: unsignedTx.inputs.map((txInput, index) => ({
        ...ensureEip12Box(inputBoxes[index]),
        extension: txInput.extension,
      })),
      dataInputs: unsignedTx.dataInputs,
      outputs: unsignedTx.outputs,
    };

    const contextExtensionGuard = summarizeDefaultContextExtensionGuard(
      unsignedTx.inputs,
      'V2 trustless single-leaf aggregate settlement',
    );
    const unsignedTxEvidence = buildAggregateSettlementTrustlessUnsignedTxEvidenceRecord({
      generatedAt: input.evidenceGeneratedAt,
      label: input.evidenceLabel ?? 'Trustless single-leaf unsigned tx',
      candidateEvidence: evidence,
      settlementShape: summarizePreparedSettlementShape(eip12Tx),
      selectedBoxes: {
        trackerBoxId: trackerBox.boxId,
        aggregateDupBoxId: aggregateDupBox.boxId,
        unlockBoxId: unlockBox.boxId,
      },
      payoutBinding: summarizeTrustlessUnsignedTxPayoutBinding(eip12Tx),
      contextExtensionGuard,
    });

    return {
      plan,
      evidence,
      unsignedTxEvidence,
      unsignedTx,
      eip12Tx,
      recipientErgoTreeHex,
      trackerBox,
      aggregateDupBox,
      unlockBox,
      contextExtensionGuard,
    };
  }

  async prepareAuthenticatedSettlementUnsignedTx(
    input: PrepareAuthenticatedSettlementUnsignedTxInput,
  ): Promise<PreparedAuthenticatedSettlementUnsignedTx> {
    const deployed = this.deps.deployed;
    if (!deployed.spvTrackerAuthenticated) {
      throw new Error('deployed.spvTrackerAuthenticated is required');
    }
    if (!deployed.doubleUnlockPreventionAuthenticated) {
      throw new Error('deployed.doubleUnlockPreventionAuthenticated is required');
    }
    if (!deployed.mainChainAggregateUnlockAuthenticated) {
      throw new Error('deployed.mainChainAggregateUnlockAuthenticated is required');
    }
    if (!await this.assertBurnsStillConfirmed([input.pegOut])) {
      throw new Error('authenticated V2 settlement requires a freshly confirmed sidechain burn');
    }

    const creationHeight = input.creationHeight ?? await this.deps.ergo.getCurrentHeight();
    const recipientErgoTreeHex = await this.resolveRecipientErgoTree(input.pegOut.ergoRecipientAddress);
    const trackerHistory = this.deps.state.getAuthenticatedSpvTrackerHistory(
      input.trackerIdentity.sidechainIdHex,
    );
    const dupHistoryKeys = this.deps.state.getAuthenticatedV2DupHistory();
    const plan = buildValidatedSubstrateGrandpaV1AuthenticatedSettlementPlan({
      trackerHistory,
      dupHistoryKeys,
      pegOut: input.pegOut,
      trackerIdentity: input.trackerIdentity,
      settlementIdentity: input.settlementIdentity,
      creationHeight,
    });
    const trackerBox = await this.deps.ergo.findSingletonBox(
      deployed.spvTrackerAuthenticated.nftId,
    ) as BoxLike;
    const authenticatedDupBox = await this.deps.ergo.findSingletonBox(
      deployed.doubleUnlockPreventionAuthenticated.nftId,
    ) as BoxLike;

    const payoutValue = safeNanoErgNumber(input.pegOut.amount, 'peg-out amount');
    if (payoutValue > Number.MAX_SAFE_INTEGER - MINER_FEE) {
      throw new Error(`peg-out amount plus miner fee is outside JavaScript safe integer range: ${input.pegOut.amount}`);
    }
    const unlockBox = await this.selectUnlockBox(
      deployed.mainChainAggregateUnlockAuthenticated.address,
      payoutValue + MINER_FEE,
      input.unlockBoxId,
    );

    return authorizePreparedAuthenticatedSettlementUnsignedTx(
      materializeAuthenticatedSettlementUnsignedTxPure(
        assembleSubstrateGrandpaV1AuthenticatedSettlementUnsignedTx({
          contractIdentities: {
            tracker: {
              nftId: deployed.spvTrackerAuthenticated.nftId,
              ergoTreeHex: deployed.spvTrackerAuthenticated.ergoTreeHex,
            },
            duplicatePrevention: {
              nftId: deployed.doubleUnlockPreventionAuthenticated.nftId,
              ergoTreeHex: deployed.doubleUnlockPreventionAuthenticated.ergoTreeHex,
            },
            vault: {
              ergoTreeHex: deployed.mainChainAggregateUnlockAuthenticated.ergoTreeHex,
            },
          },
          trackerBox,
          authenticatedDupBox,
          unlockBox,
          plan,
          recipientErgoTreeHex,
          creationHeight,
        }),
      ),
    );
  }

  async confirmSingleClaimSettlement(
    pegOut: ParsedPegOut,
    settlementTxId: string,
    trackerIngest?: SpvTrackerEntry,
  ): Promise<boolean> {
    if (!this.isApprovedSubmittedTx(pegOut, 'aggregate_submitted', settlementTxId)) {
      return false;
    }
    const normalizedSettlementTxId = normalizeTransactionId(settlementTxId);
    if (!normalizedSettlementTxId) return false;
    const attempt = this.deps.state.getAggregateSettlementAttempt(normalizedSettlementTxId);
    const normalizedBurn = normalizeBurnTxId(pegOut.sidechainTxHash);
    if (
      !attempt
      || attempt.mode === 'batch'
      || attempt.burnTxHashes.length !== 1
      || attempt.burnTxHashes[0] !== normalizedBurn
      || (attempt.submittedTxId ?? attempt.expectedTxId) !== normalizedSettlementTxId
      || (attempt.status !== 'submitted' && attempt.status !== 'confirmed')
    ) {
      return false;
    }
    const finalityPolicy = aggregateSettlementErgoFinalityPolicy(attempt);
    if (!finalityPolicy) return false;

    const deployed = this.deps.deployed;
    if (!deployed.spvTracker) throw new Error('deployed.spvTracker is required');
    if (!deployed.doubleUnlockPreventionAggregate) {
      throw new Error('deployed.doubleUnlockPreventionAggregate is required');
    }
    const recipientTree = await this.resolveRecipientErgoTree(pegOut.ergoRecipientAddress);
    const payoutValue = safeNanoErgNumber(pegOut.amount, 'peg-out amount');
    if (!await this.assertBurnsStillConfirmed([pegOut])) {
      return false;
    }
    const observation = await observeStableAggregateSettlementErgoTransaction({
      ergo: this.deps.ergo,
      transactionId: normalizedSettlementTxId,
      policy: finalityPolicy,
    });
    assertStableAggregateSettlementErgoObservationProvenance(observation);
    if (observation.record.status !== 'confirmed_final' || !observation.transaction) {
      return false;
    }

    const outputs = Array.isArray(observation.transaction.outputs)
      ? observation.transaction.outputs
      : [];
    const trackerSuccessors = outputs.filter((output: any) =>
      outputHasToken(output, deployed.spvTracker!.nftId),
    );
    const trackerSuccessorDigestHex = trackerSuccessors.length === 1
      ? trackerSuccessorDigest(trackerSuccessors[0])
      : null;
    const hasDupSuccessor = outputs.some((output: any) =>
      outputHasToken(output, deployed.doubleUnlockPreventionAggregate!.nftId),
    );
    const hasPayout = outputs.some((output: any) =>
      normalizeHex(output.ergoTree ?? '', 'settlement payout ErgoTree') === recipientTree &&
      outputValueAtLeast(output, payoutValue),
    );
    if (!trackerSuccessorDigestHex || !hasDupSuccessor || !hasPayout) {
      return false;
    }
    if (!await this.assertBurnsStillConfirmed([pegOut])) {
      return false;
    }
    return this.deps.state.confirmSubmittedSingleSettlementAttempt(
      normalizedSettlementTxId,
      attempt.lifecycleVersion,
      attempt.mode,
      normalizedBurn,
      observation,
      trackerSuccessorDigestHex,
      trackerIngest ? toStateSpvTrackerEntry(trackerIngest) : undefined,
      pegOutEventLookup(pegOut),
    );
  }

  // ── Batch (multi-claim) settlement ────────────────────────────────────

  async prepareBatchClaims(
    input: PrepareBatchClaimsInput,
  ): Promise<PreparedBatchSettlement> {
    const deployed = this.deps.deployed;
    if (!deployed.spvTracker) throw new Error('deployed.spvTracker is required');
    if (!deployed.doubleUnlockPreventionAggregateBatch) {
      throw new Error('deployed.doubleUnlockPreventionAggregateBatch is required for batch mode');
    }
    if (!deployed.mainChainAggregateUnlockBatch) {
      throw new Error('deployed.mainChainAggregateUnlockBatch is required for batch mode');
    }
    if (input.claims.length < 2) {
      throw new Error('Batch settlement requires at least 2 claims');
    }
    if (input.claims.length > BATCH_UNLOCK_MAX_CLAIMS) {
      throw new Error(
        `Batch settlement has ${input.claims.length} claims, max is ${BATCH_UNLOCK_MAX_CLAIMS}`,
      );
    }

    const creationHeight = input.creationHeight ?? await this.deps.ergo.getCurrentHeight();
    const recipientErgoTreeHexes = await Promise.all(
      input.claims.map(c => this.resolveRecipientErgoTree(c.pegOut.ergoRecipientAddress)),
    );
    const spvHistory = this.deps.state.getSpvTrackerHistory();
    const dupHistoryKeys = this.deps.state.getAllAvlKeys();

    const claims: AggregateSettlementClaim[] = input.claims.map(c => ({
      pegOut: c.pegOut,
      trackerIdentity: c.trackerIdentity,
    }));

    const plan = buildBatchSettlementPlan({
      spvHistory,
      dupHistoryKeys,
      ingests: input.trackerIngest ? [input.trackerIngest] : undefined,
      claims,
      recipientErgoTreeHexes,
    });

    const trackerBox = await this.deps.ergo.findSingletonBox(deployed.spvTracker.nftId) as BoxLike;
    const aggregateDupBox = await this.deps.ergo.findSingletonBox(
      deployed.doubleUnlockPreventionAggregateBatch.nftId,
    ) as BoxLike;
    assertBoxAvlDigest(trackerBox, plan.trackerInputDigestHex, 'SPV tracker input');
    assertBoxAvlDigest(aggregateDupBox, getDupTreeDigest(dupHistoryKeys), 'Batch DUP input');

    // Total payout needed from the single unlock box
    let totalPayout = 0;
    for (const amount of plan.payoutAmounts) {
      totalPayout += safeNanoErgNumber(amount, 'batch payout amount');
    }
    if (totalPayout > Number.MAX_SAFE_INTEGER - MINER_FEE) {
      throw new Error(`total batch payout plus miner fee is outside JavaScript safe integer range: ${totalPayout}`);
    }

    const unlockBox = await this.selectUnlockBox(
      deployed.mainChainAggregateUnlockBatch.address,
      totalPayout + MINER_FEE,
      input.unlockBoxId,
    );

    const unsignedTx = buildBatchAggregateSettlementTx({
      deployed,
      plan,
      trackerBox,
      aggregateDupBox,
      unlockBox,
      creationHeight,
    });

    const inputBoxes = [trackerBox, aggregateDupBox, unlockBox];
    const eip12Tx = {
      inputs: unsignedTx.inputs.map((txInput, index) => ({
        ...ensureEip12Box(inputBoxes[index]),
        extension: txInput.extension,
      })),
      dataInputs: unsignedTx.dataInputs,
      outputs: unsignedTx.outputs,
    };

    return {
      plan,
      unsignedTx,
      eip12Tx,
      recipientErgoTreeHexes,
      trackerBox,
      aggregateDupBox,
      unlockBox,
      claimCount: input.claims.length,
    };
  }

  async confirmBatchSettlement(
    pegOuts: ParsedPegOut[],
    settlementTxId: string,
    trackerIngest?: SpvTrackerEntry,
  ): Promise<boolean> {
    if (pegOuts.length === 0) return false;
    const normalizedSettlementTxId = normalizeTransactionId(settlementTxId);
    if (!normalizedSettlementTxId) return false;
    const normalizedBurns = pegOuts.map(pegOut => normalizeBurnTxId(pegOut.sidechainTxHash));
    const attempt = this.deps.state.getAggregateSettlementAttempt(normalizedSettlementTxId);
    if (
      !attempt ||
      attempt.mode !== 'batch' ||
      (attempt.submittedTxId ?? attempt.expectedTxId) !== normalizedSettlementTxId ||
      !arraysEqual(attempt.burnTxHashes, normalizedBurns) ||
      (attempt.status !== 'submitted' && attempt.status !== 'confirmed')
    ) {
      return false;
    }
    const finalityPolicy = aggregateSettlementErgoFinalityPolicy(attempt);
    if (!finalityPolicy) return false;

    const deployed = this.deps.deployed;
    if (!deployed.spvTracker) throw new Error('deployed.spvTracker is required');
    if (!deployed.doubleUnlockPreventionAggregateBatch) {
      throw new Error('deployed.doubleUnlockPreventionAggregateBatch is required');
    }

    const expectedPayouts = await Promise.all(pegOuts.map(async pegOut => ({
      recipientTree: await this.resolveRecipientErgoTree(pegOut.ergoRecipientAddress),
      payoutValue: safeNanoErgNumber(pegOut.amount, 'peg-out amount'),
    })));
    if (!await this.assertBurnsStillConfirmed(pegOuts)) {
      return false;
    }
    const observation = await observeStableAggregateSettlementErgoTransaction({
      ergo: this.deps.ergo,
      transactionId: normalizedSettlementTxId,
      policy: finalityPolicy,
    });
    assertStableAggregateSettlementErgoObservationProvenance(observation);
    if (observation.record.status !== 'confirmed_final' || !observation.transaction) {
      return false;
    }

    const outputs = Array.isArray(observation.transaction.outputs)
      ? observation.transaction.outputs
      : [];
    const trackerSuccessorDigestHex = outputHasToken(outputs[0], deployed.spvTracker.nftId)
      && outputs.filter((output: any) => outputHasToken(output, deployed.spvTracker!.nftId)).length === 1
      ? trackerSuccessorDigest(outputs[0])
      : null;
    if (!trackerSuccessorDigestHex) return false;
    if (!outputHasToken(outputs[1], deployed.doubleUnlockPreventionAggregateBatch.nftId)) return false;

    // Verify all payouts are present at their EXPECTED positional indexes.
    // Batch TX layout: OUTPUTS(0)=tracker, OUTPUTS(1)=DUP, OUTPUTS(2..2+N-1)=payouts.
    // Using positional matching prevents the "multiset collision" bug where two
    // peg-outs to the same recipient/value would both match the same output.
    for (let i = 0; i < pegOuts.length; i++) {
      const payoutIndex = 2 + i;
      if (payoutIndex >= outputs.length) return false;
      const output = outputs[payoutIndex];
      const expectedPayout = expectedPayouts[i];
      const treeMatches = normalizeHex(output.ergoTree ?? '', 'settlement payout ErgoTree')
        === expectedPayout.recipientTree;
      if (!treeMatches || !outputValueAtLeast(output, expectedPayout.payoutValue)) return false;
    }
    if (!await this.assertBurnsStillConfirmed(pegOuts)) {
      return false;
    }

    return this.deps.state.confirmSubmittedBatchSettlementAttempt(
      normalizedSettlementTxId,
      attempt.lifecycleVersion,
      normalizedBurns,
      observation,
      trackerSuccessorDigestHex,
      trackerIngest ? toStateSpvTrackerEntry(trackerIngest) : undefined,
      pegOuts.map(pegOutEventLookup),
    );
  }

  // ── Shared helpers ───────────────────────────────────────────────────

  private async assertBurnsStillConfirmed(
    pegOuts: ParsedPegOut[],
  ): Promise<boolean> {
    if (!this.deps.verifySidechainBurn) {
      throw new Error(
        'aggregate settlement requires a fresh sidechain burn verifier before submission or confirmation',
      );
    }

    const observations: Array<{ pegOut: ParsedPegOut; status: SidechainBurnVerificationStatus }> = [];
    for (const pegOut of pegOuts) {
      observations.push({
        pegOut,
        status: await this.deps.verifySidechainBurn(pegOut),
      });
    }

    for (const { pegOut, status } of observations) {
      if (status === 'reverted') {
        if (this.deps.state.markPegOutBurnRevertedAndInvalidateCandidates) {
          this.deps.state.markPegOutBurnRevertedAndInvalidateCandidates(
            pegOutEventLookup(pegOut),
            'fresh sidechain burn verification invalidated the settlement candidate',
          );
        } else {
          this.deps.state.updatePegOutStatus(pegOutEventLookup(pegOut), 'burn_reverted');
        }
      }
    }

    return observations.every(({ status }) => status === 'confirmed');
  }

  private async selectUnlockBox(
    aggregateUnlockAddress: string,
    minimumValue: number,
    preferredBoxId?: string,
  ): Promise<BoxLike> {
    const boxes = await this.deps.ergo.getUnspentBoxesByAddress(aggregateUnlockAddress) as BoxLike[];
    const candidates = boxes
      .filter(box => hasNoAssets(box))
      .filter(box => boxValue(box) >= minimumValue)
      .sort((a, b) => boxValue(a) - boxValue(b));

    if (preferredBoxId) {
      const preferred = candidates.find(box => box.boxId === preferredBoxId);
      if (!preferred) {
        throw new Error(`preferred aggregate unlock box ${preferredBoxId} is unavailable or underfunded`);
      }
      return preferred;
    }

    const selected = candidates[0];
    if (!selected) {
      throw new Error(`no aggregate unlock liquidity box covers ${minimumValue} nanoERG`);
    }
    return selected;
  }

  private async resolveRecipientErgoTree(raw: string): Promise<string> {
    return await resolveAggregateRecipientErgoTree(
      raw,
      address => this.deps.ergo.addressToTree(address),
    );
  }

  private isApprovedSubmittedTx(
    pegOut: ParsedPegOut,
    expectedStatus: SubmittedSettlementStatus,
    settlementTxId: string,
  ): boolean {
    const normalizedSettlementTxId = normalizeTransactionId(settlementTxId);
    if (!normalizedSettlementTxId) return false;

    const submittedTxId = this.deps.state.getSubmittedSettlementTxId(
      pegOutEventLookup(pegOut),
      expectedStatus,
    );
    if (!submittedTxId) return false;

    return normalizeTransactionId(submittedTxId) === normalizedSettlementTxId;
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
