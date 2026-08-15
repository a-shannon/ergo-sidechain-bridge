import type {
  AggregateSettlementUnsignedTx,
  BoxLike,
} from '../../ergo-settlement-core/settlement-transaction.js';
import {
  buildAuthenticatedSettlementPlan,
  type AuthenticatedSettlementPegOut,
  type AuthenticatedSettlementPlan,
  type SettlementIdentity,
} from './authenticated-settlement-plan.js';
import { buildAuthenticatedSettlementTx } from './authenticated-settlement-transaction.js';
import type {
  AuthenticatedSpvTrackerHistoryEntry,
  AuthenticatedSpvTrackerIdentity,
} from './spv-tracker-authenticated.js';
import { AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS } from './settlement-limits.js';

export interface AuthenticatedSettlementContractIdentities {
  tracker: { nftId: string; ergoTreeHex: string };
  duplicatePrevention: { nftId: string; ergoTreeHex: string };
  vault: { ergoTreeHex: string };
}

export interface PrepareSubstrateGrandpaV1AuthenticatedSettlementUnsignedTxInput {
  contractIdentities: AuthenticatedSettlementContractIdentities;
  trackerBox: BoxLike;
  authenticatedDupBox: BoxLike;
  unlockBox: BoxLike;
  trackerHistory: AuthenticatedSpvTrackerHistoryEntry[];
  dupHistoryKeys: string[];
  pegOut: AuthenticatedSettlementPegOut;
  trackerIdentity: AuthenticatedSpvTrackerIdentity;
  settlementIdentity: SettlementIdentity;
  recipientErgoTreeHex: string;
  creationHeight: number;
}

export interface BuildValidatedSubstrateGrandpaV1AuthenticatedSettlementPlanInput {
  trackerHistory: AuthenticatedSpvTrackerHistoryEntry[];
  dupHistoryKeys: string[];
  pegOut: AuthenticatedSettlementPegOut;
  trackerIdentity: AuthenticatedSpvTrackerIdentity;
  settlementIdentity: SettlementIdentity;
  creationHeight: number;
}

export interface AssembleSubstrateGrandpaV1AuthenticatedSettlementUnsignedTxInput {
  contractIdentities: AuthenticatedSettlementContractIdentities;
  trackerBox: BoxLike;
  authenticatedDupBox: BoxLike;
  unlockBox: BoxLike;
  plan: AuthenticatedSettlementPlan;
  recipientErgoTreeHex: string;
  creationHeight: number;
}

export interface PreparedSubstrateGrandpaV1AuthenticatedSettlementUnsignedTx {
  plan: AuthenticatedSettlementPlan;
  unsignedTx: AggregateSettlementUnsignedTx;
  recipientErgoTreeHex: string;
  trackerBox: BoxLike;
  authenticatedDupBox: BoxLike;
  unlockBox: BoxLike;
}

export function buildValidatedSubstrateGrandpaV1AuthenticatedSettlementPlan(
  input: BuildValidatedSubstrateGrandpaV1AuthenticatedSettlementPlanInput,
): AuthenticatedSettlementPlan {
  const plan = buildAuthenticatedSettlementPlan({
    spvHistory: input.trackerHistory,
    dupHistoryKeys: input.dupHistoryKeys,
    claim: {
      pegOut: input.pegOut,
      trackerIdentity: {
        sidechainIdHex: input.trackerIdentity.sidechainIdHex,
        sidechainHeight: BigInt(input.trackerIdentity.sidechainHeight),
        sidechainHeaderHashHex: input.trackerIdentity.executionBlockHashHex,
      },
      settlementIdentity: input.settlementIdentity,
    },
  });
  const anchorHeight = plan.claims[0].ergoAnchorHeight;
  if (input.creationHeight - anchorHeight < AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS) {
    throw new Error(
      `authenticated V2 settlement anchor requires ${AUTHENTICATED_SETTLEMENT_MIN_ANCHOR_CONFIRMATIONS} Ergo confirmations`,
    );
  }
  return plan;
}

export function assembleSubstrateGrandpaV1AuthenticatedSettlementUnsignedTx(
  input: AssembleSubstrateGrandpaV1AuthenticatedSettlementUnsignedTxInput,
): PreparedSubstrateGrandpaV1AuthenticatedSettlementUnsignedTx {
  const unsignedTx = buildAuthenticatedSettlementTx({
    deployed: {
      spvTrackerAuthenticated: input.contractIdentities.tracker,
      doubleUnlockPreventionAuthenticated: input.contractIdentities.duplicatePrevention,
      mainChainAggregateUnlockAuthenticated: input.contractIdentities.vault,
    },
    plan: input.plan,
    trackerBox: input.trackerBox,
    duplicatePreventionBox: input.authenticatedDupBox,
    unlockBox: input.unlockBox,
    recipientErgoTreeHex: input.recipientErgoTreeHex,
    creationHeight: input.creationHeight,
  });
  return {
    plan: input.plan,
    unsignedTx,
    recipientErgoTreeHex: input.recipientErgoTreeHex,
    trackerBox: input.trackerBox,
    authenticatedDupBox: input.authenticatedDupBox,
    unlockBox: input.unlockBox,
  };
}

export function prepareSubstrateGrandpaV1AuthenticatedSettlementUnsignedTx(
  input: PrepareSubstrateGrandpaV1AuthenticatedSettlementUnsignedTxInput,
): PreparedSubstrateGrandpaV1AuthenticatedSettlementUnsignedTx {
  const plan = buildValidatedSubstrateGrandpaV1AuthenticatedSettlementPlan(input);
  return assembleSubstrateGrandpaV1AuthenticatedSettlementUnsignedTx({
    contractIdentities: input.contractIdentities,
    trackerBox: input.trackerBox,
    authenticatedDupBox: input.authenticatedDupBox,
    unlockBox: input.unlockBox,
    plan,
    recipientErgoTreeHex: input.recipientErgoTreeHex,
    creationHeight: input.creationHeight,
  });
}
