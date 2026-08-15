import { isDeepStrictEqual } from 'util';

import {
  buildAuthenticatedSettlementPlan,
  type AggregateSettlementClaim,
  type AuthenticatedSettlementPlan,
  type SettlementIdentity,
} from './aggregate-settlement-builder.js';
import { AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS } from './aggregate-settlement-limits.js';
import type { BoxLike } from './aggregate-settlement-tx.js';
import {
  decodeAuthenticatedSpvTrackerValue,
  encodeAuthenticatedSpvTrackerAvlRegister,
  getAuthenticatedSpvTrackerDigest,
  type AuthenticatedSpvTrackerHistoryEntry,
} from './spv-tracker-authenticated.js';
import {
  assertWp06SourceToTrackerVmResultProvenance,
  type Wp06SourceToTrackerVmResult,
} from './scripts/spikes/spike15-wp06-source-to-tracker-vm.js';
import { assertWp06SignedSuccessorBinding } from './wp06-source-bound-jvm-validation.js';

export interface BuildWp06SourceBoundSettlementPlanInput {
  sourceToTrackerHandoff: Wp06SourceToTrackerVmResult;
  dupHistoryKeys?: readonly string[];
}

export interface Wp06SourceBoundSettlementPlan {
  plan: AuthenticatedSettlementPlan;
  trackerBox: Readonly<BoxLike>;
  trackerHistory: ReadonlyArray<Readonly<AuthenticatedSpvTrackerHistoryEntry>>;
  recipientErgoTreeHex: string;
  payoutAmountNanoErg: string;
  duplicatePreventionKeyHex: string;
  minimumSettlementHeight: number;
  bindings: {
    trackerSuccessor: {
      boxId: string;
      ergoTree: string;
      value: string;
      creationHeight: number;
      nftIdHex: string;
      digestHex: string;
      registers: Readonly<Record<string, string>>;
    };
    payout: {
      recipientErgoTreeHex: string;
      recipientErgoTreeHashHex: string;
      amountNanoErg: string;
      assetIdHex: string;
      sidechainTxHashHex: string;
      eventIndex: number;
      leafHashHex: string;
    };
    duplicatePrevention: {
      keyHex: string;
      inputDigestHex: string;
      outputDigestHex: string;
    };
    anchor: {
      headerIdHex: string;
      headerHeight: number;
      extensionRootHex: string;
      trackerAdmissionCurrentHeight: number;
      settlementHeight: number;
    };
  };
  boundary: {
    processLocalProvenanceRequired: true;
    serializedRehydrationAuthorizesSettlement: false;
    sourceTrackerBoxReconstructed: false;
    r9FinalityAuthority: true;
    gate5Closed: false;
    submitOrBroadcastEnabled: false;
  };
}

export function buildWp06SourceBoundSettlementPlan(
  input: BuildWp06SourceBoundSettlementPlanInput,
): Wp06SourceBoundSettlementPlan {
  const handoff = input?.sourceToTrackerHandoff;
  assertWp06SourceToTrackerVmResultProvenance(handoff);
  assertWp06SignedSuccessorBinding({
    signedTransactionIdHex: handoff.sourceBindings.trackerAdmissionTransactionIdHex,
    successorTransactionIdHex: handoff.admittedTrackerSuccessor.transactionId,
    successorIndex: handoff.admittedTrackerSuccessor.index,
  });
  assertSourceBoundary(handoff);

  const burnProof = handoff.burnProofBundle.proof;
  const leaf = burnProof.leaf;
  const expectedSettlementIdentity: SettlementIdentity = {
    source: 'trustless-burn-leaf',
    duplicatePreventionKeyHex: leaf.burnIdHex,
    bridgeEventRootHex: burnProof.bridgeEventRootHex,
    recipientErgoTreeHashHex: leaf.recipientErgoTreeHashHex,
    amountNanoErg: leaf.amountNanoErg,
    assetIdHex: leaf.assetIdHex,
    trustlessBurnProof: burnProof.proof,
  };
  if (!isDeepStrictEqual(handoff.burnProofBundle.settlementIdentity, expectedSettlementIdentity)) {
    throw new Error('WP-06 settlement identity must be derived exactly from the proved burn leaf');
  }
  assertPayoutPreimageBindings(handoff);

  const trackerHistory = handoff.trackerHistoryAfterAdmission.map(entry => ({
    key: entry.key,
    value: entry.value,
  }));
  const trackerDigestHex = getAuthenticatedSpvTrackerDigest(trackerHistory);
  if (
    trackerHistory.length !== 1
    || trackerDigestHex !== handoff.trackerAdmission.successorDigestHex
    || trackerHistory[0]?.key !== handoff.sourceBindings.trackerKeyHex
    || trackerHistory[0]?.value !== handoff.sourceBindings.trackerValueHex
  ) {
    throw new Error('WP-06 tracker history does not identify the admitted successor digest');
  }

  const trackerBox = handoff.admittedTrackerSuccessor as Readonly<BoxLike>;
  const trackerNftIdHex = assertExactAdmittedTrackerSuccessor(
    trackerBox,
    handoff,
    trackerDigestHex,
  );

  const trackerIdentity = {
    sidechainIdHex: handoff.sourceBindings.sidechainIdHex,
    sidechainHeight: BigInt(handoff.sourceBindings.sidechainHeight),
    sidechainHeaderHashHex: handoff.sourceBindings.executionBlockHashHex,
  };
  const claim: AggregateSettlementClaim = {
    pegOut: handoff.pegOut,
    trackerIdentity,
    settlementIdentity: expectedSettlementIdentity,
  };
  const plan = buildAuthenticatedSettlementPlan({
    spvHistory: trackerHistory,
    dupHistoryKeys: [...(input.dupHistoryKeys ?? [])],
    claim,
  });
  const planned = plan.claims[0];
  if (
    plan.trackerInputDigestHex !== trackerDigestHex
    || planned.trackerKeyHex !== handoff.sourceBindings.trackerKeyHex
    || planned.trackerValueHex !== handoff.sourceBindings.trackerValueHex
    || planned.bridgeEventRootHex !== handoff.sourceBindings.bridgeEventRootHex
    || planned.duplicatePreventionKeyHex !== handoff.sourceBindings.burnIdHex
    || planned.claim.pegOut !== handoff.pegOut
  ) {
    throw new Error('WP-06 handoff drifted while deriving the authenticated settlement plan');
  }

  const retainedAnchor = handoff.trackerAdmissionHeaderContext.anchorHeader;
  const retainedTrackerValue = decodeAuthenticatedSpvTrackerValue(planned.trackerValueHex);
  if (
    planned.ergoAnchorHeight !== retainedAnchor.height
    || retainedTrackerValue.anchorHeaderIdHex !== retainedAnchor.id
    || retainedTrackerValue.anchorHeaderHeight !== retainedAnchor.height
    || retainedAnchor.extensionRootHex !== handoff.sourceBindings.extensionRootHex
  ) {
    throw new Error('WP-06 settlement plan drifted from the retained tracker anchor');
  }
  const minimumSettlementHeight = retainedAnchor.height
    + AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS;
  if (!Number.isSafeInteger(minimumSettlementHeight)) {
    throw new Error('WP-06 minimum settlement height must fit a safe integer');
  }

  const result = deepFreeze({
    plan,
    trackerBox,
    trackerHistory,
    recipientErgoTreeHex: handoff.targetBurn.recipientErgoTreeHex,
    payoutAmountNanoErg: leaf.amountNanoErg,
    duplicatePreventionKeyHex: leaf.burnIdHex,
    minimumSettlementHeight,
    bindings: {
      trackerSuccessor: {
        boxId: trackerBox.boxId,
        ergoTree: trackerBox.ergoTree,
        value: String(trackerBox.value),
        creationHeight: trackerBox.creationHeight,
        nftIdHex: trackerNftIdHex,
        digestHex: trackerDigestHex,
        registers: structuredClone(trackerBox.additionalRegisters ?? {}),
      },
      payout: {
        recipientErgoTreeHex: handoff.targetBurn.recipientErgoTreeHex,
        recipientErgoTreeHashHex: leaf.recipientErgoTreeHashHex,
        amountNanoErg: leaf.amountNanoErg,
        assetIdHex: leaf.assetIdHex,
        sidechainTxHashHex: leaf.sidechainTxHashHex,
        eventIndex: leaf.eventIndex,
        leafHashHex: leaf.leafHashHex,
      },
      duplicatePrevention: {
        keyHex: leaf.burnIdHex,
        inputDigestHex: plan.dupInputDigestHex,
        outputDigestHex: plan.dupOutputDigestHex,
      },
      anchor: {
        headerIdHex: retainedAnchor.id,
        headerHeight: retainedAnchor.height,
        extensionRootHex: retainedAnchor.extensionRootHex,
        trackerAdmissionCurrentHeight:
          handoff.trackerAdmissionHeaderContext.currentHeight,
        settlementHeight: minimumSettlementHeight,
      },
    },
    boundary: {
      processLocalProvenanceRequired: true as const,
      serializedRehydrationAuthorizesSettlement: false as const,
      sourceTrackerBoxReconstructed: false as const,
      r9FinalityAuthority: true as const,
      gate5Closed: false as const,
      submitOrBroadcastEnabled: false as const,
    },
  });
  assertWp06SourceToTrackerVmResultProvenance(handoff);
  return result;
}

function assertSourceBoundary(handoff: Wp06SourceToTrackerVmResult): void {
  const boundary = handoff.boundary;
  if (
    boundary.sourceDerivedPublicFixture !== true
    || boundary.chainRpcAccessEnabled !== false
    || boundary.chainRpcWritesEnabled !== false
    || boundary.ephemeralInMemorySigningUsed !== true
    || boundary.externalWalletStateAccessed !== false
    || boundary.r9FinalityAuthority !== true
    || boundary.gate5Closed !== false
    || boundary.submitOrBroadcastEnabled !== false
  ) {
    throw new Error('WP-06 source-to-tracker handoff crossed its settlement boundary');
  }
}

function assertPayoutPreimageBindings(handoff: Wp06SourceToTrackerVmResult): void {
  const leaf = handoff.burnProofBundle.proof.leaf;
  const target = handoff.targetBurn;
  const pegOut = handoff.pegOut;
  const coherent =
    target.burnIdHex === leaf.burnIdHex
    && target.sidechainTxHashHex === leaf.sidechainTxHashHex
    && target.eventIndex === leaf.eventIndex
    && target.recipientErgoTreeHashHex === leaf.recipientErgoTreeHashHex
    && target.amountNanoErg === leaf.amountNanoErg
    && pegOut.user === target.userAddress
    && pegOut.amount.toString() === leaf.amountNanoErg
    && pegOut.ergoRecipientAddress === target.recipientErgoTreeHex
    && pegOut.sidechainTxHash === leaf.sidechainTxHashHex
    && pegOut.sidechainBlockNumber.toString() === handoff.sourceBindings.sidechainHeight
    && pegOut.sidechainBlockHash === leaf.sidechainBlockHashHex
    && pegOut.sidechainLogIndex === leaf.eventIndex
    && leaf.sidechainIdHex === handoff.sourceBindings.sidechainIdHex
    && leaf.sidechainBlockHashHex === handoff.sourceBindings.executionBlockHashHex
    && leaf.burnIdHex === handoff.sourceBindings.burnIdHex
    && handoff.burnProofBundle.proof.bridgeEventRootHex
      === handoff.sourceBindings.bridgeEventRootHex;
  if (!coherent) {
    throw new Error('WP-06 payout preimage drifted from the proved source burn');
  }
}

function assertExactAdmittedTrackerSuccessor(
  trackerBox: Readonly<BoxLike>,
  handoff: Wp06SourceToTrackerVmResult,
  trackerDigestHex: string,
): string {
  if (!trackerBox || typeof trackerBox !== 'object') {
    throw new Error('WP-06 admitted tracker successor is missing');
  }
  if (!/^[0-9a-f]{64}$/i.test(String(trackerBox.boxId ?? ''))) {
    throw new Error('WP-06 admitted tracker successor boxId is invalid');
  }
  if (trackerBox.ergoTree !== handoff.trackerTree) {
    throw new Error('WP-06 admitted tracker successor ErgoTree drifted from tracker admission');
  }
  if (
    !Number.isSafeInteger(trackerBox.creationHeight)
    || trackerBox.creationHeight !== handoff.trackerAdmissionHeaderContext.currentHeight
  ) {
    throw new Error('WP-06 admitted tracker successor creationHeight drifted from admission');
  }
  if (BigInt(trackerBox.value) <= 0n) {
    throw new Error('WP-06 admitted tracker successor value must be positive');
  }
  const assets = trackerBox.assets ?? [];
  if (
    assets.length !== 1
    || !/^[0-9a-f]{64}$/i.test(String(assets[0]?.tokenId ?? ''))
    || BigInt(assets[0]?.amount ?? 0) !== 1n
  ) {
    throw new Error('WP-06 admitted tracker successor must retain one singleton NFT');
  }
  if (!isDeepStrictEqual(
    trackerBox.additionalRegisters,
    handoff.trackerAdmission.successorRegisters,
  )) {
    throw new Error('WP-06 admitted tracker successor registers drifted from tracker admission');
  }
  const expectedR5 = encodeAuthenticatedSpvTrackerAvlRegister(trackerDigestHex);
  if (trackerBox.additionalRegisters?.R5?.toLowerCase() !== expectedR5.toLowerCase()) {
    throw new Error('WP-06 admitted tracker successor R5 does not bind the admitted history');
  }
  return String(assets[0].tokenId).toLowerCase();
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (ArrayBuffer.isView(value)) {
    throw new Error('WP-06 source-bound settlement plans must not retain mutable binary views');
  }
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}
