import {
  assertFrontierContractStateDeploymentLineageJoinCandidateProvenance,
  type FrontierContractStateDeploymentLineageJoinCandidate,
} from './frontier-contract-state-deployment-lineage-join.js';
import {
  assertNativeFinalizedPegInFrontierMintTransitionV1ResultCandidateProvenance,
  type NativeFinalizedPegInFrontierMintTransitionV1ResultCandidate,
} from './native-finalized-peg-in-frontier-mint-transition-v1.js';
import { sha256CanonicalJson } from './strict-json.js';

export const FRONTIER_MINT_TRANSITION_DEPLOYMENT_LINEAGE_JOIN_SCHEMA =
  'e2s.native-finalized-peg-in-mint-transition-deployment-lineage-join-candidate.v1' as const;
export const FRONTIER_MINT_TRANSITION_DEPLOYMENT_LINEAGE_JOIN_STATUS =
  'non_authorizing_candidate' as const;
export const FRONTIER_MINT_TRANSITION_DEPLOYMENT_LINEAGE_JOIN_DIGEST_DOMAIN =
  'e2s.native-finalized-peg-in-mint-transition-deployment-lineage-join-candidate.digest.v1' as const;

const JOIN_CANDIDATES = new WeakSet<object>();

export interface FrontierMintTransitionDeploymentLineageJoinCandidate {
  readonly schema: typeof FRONTIER_MINT_TRANSITION_DEPLOYMENT_LINEAGE_JOIN_SCHEMA;
  readonly status: typeof FRONTIER_MINT_TRANSITION_DEPLOYMENT_LINEAGE_JOIN_STATUS;
  readonly mintTransitionRequestDigestHex: string;
  readonly contractStateLineageJoinDigestHex: string;
  readonly contractStateRequestDigestHex: string;
  readonly trustAnchorDigestHex: string;
  readonly nativeFinalityStatementDigestHex: string;
  readonly target: Readonly<{
    parentNativeBlockHashHex: string;
    parentNativeHeight: string;
    parentStateRootHex: string;
    eventNativeBlockHashHex: string;
    eventNativeHeight: string;
    eventNativeStateRootHex: string;
    executionHeight: string;
    executionBlockHashHex: string;
  }>;
  readonly contracts: FrontierContractStateDeploymentLineageJoinCandidate['contracts'];
  readonly pegIn: FrontierContractStateDeploymentLineageJoinCandidate['pegIn'];
  readonly transition: Readonly<{
    parentProcessedPegIn: false;
    postProcessedPegIn: true;
    parentTokenTotalSupply: string;
    postTokenTotalSupply: string;
    tokenTotalSupplyDelta: string;
    parentRecipientBalance: string;
    postRecipientBalance: string;
    recipientBalanceDelta: string;
    recipientBalanceStorageKeyHex: string;
    mintTransactionLogIndex: number;
    mintGlobalEventIndex: number;
  }>;
  readonly checks: Readonly<{
    sameProcessCandidateProvenanceVerified: true;
    exactNestedContractStateRequestBound: true;
    exactReviewedDeploymentLineageBound: true;
    exactDirectParentAndEventIdentityBound: true;
    exactContractAndPostStateBound: true;
    exactPegInAndPairedMintBound: true;
    exactReplayTransitionAndMintDeltasBound: true;
  }>;
  readonly authority: Readonly<{
    nativeVerifierExecutionAuthenticated: false;
    historicalCodeContinuityProved: false;
    historicalReceiptStateProofCompletenessProved: false;
    committedVaultTransitionProved: false;
    historicalMintAbsenceProved: false;
    mintAuthorized: false;
    daemonAdmissionAuthorized: false;
    settlementAuthorized: false;
    reconciliationHoldReleaseAuthorized: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    gate5Closed: false;
    productionReady: false;
  }>;
  readonly limitations: readonly string[];
  readonly candidateDigestHex: string;
}

/** Join the T20C report candidate to the genuine existing T19/T20A/T20B lineage candidate. */
export function buildFrontierMintTransitionDeploymentLineageJoinCandidate(input: {
  readonly mintTransitionCandidate:
    NativeFinalizedPegInFrontierMintTransitionV1ResultCandidate;
  readonly contractStateLineageJoinCandidate:
    FrontierContractStateDeploymentLineageJoinCandidate;
}): FrontierMintTransitionDeploymentLineageJoinCandidate {
  assertNativeFinalizedPegInFrontierMintTransitionV1ResultCandidateProvenance(
    input?.mintTransitionCandidate,
  );
  assertFrontierContractStateDeploymentLineageJoinCandidateProvenance(
    input?.contractStateLineageJoinCandidate,
  );
  const mint = input.mintTransitionCandidate;
  const lineage = input.contractStateLineageJoinCandidate;
  const state = mint.contractStateVerification.contractState;
  const eventCandidate = mint.contractStateVerification.eventVerification;
  const event = eventCandidate.event;
  const execution = eventCandidate.executionIdentity.execution;
  const nativeTarget = eventCandidate.executionIdentity.target;
  const transition = mint.transition;

  if (mint.contractStateVerification.requestDigestHex !== lineage.contractStateRequestDigestHex) {
    throw new Error('mint transition does not contain the exact reviewed contract-state request');
  }
  if (
    mint.trustAnchorDigestHex !== lineage.trustAnchorDigestHex
    || mint.contractStateVerification.trustAnchorDigestHex !== lineage.trustAnchorDigestHex
  ) {
    throw new Error('mint transition does not share the reviewed deployment trust root');
  }
  if (
    mint.parentLink.eventNativeBlockHashHex !== nativeTarget.nativeBlockHashHex
    || mint.parentLink.eventNativeHeight !== nativeTarget.nativeHeight
    || lineage.target.nativeBlockHashHex !== nativeTarget.nativeBlockHashHex
    || lineage.target.nativeHeight !== nativeTarget.nativeHeight
    || lineage.target.nativeStateRootHex !== nativeTarget.stateRootHex
    || lineage.target.executionHeight !== execution.executionHeight
    || lineage.target.executionBlockHashHex !== execution.executionBlockHashHex
  ) {
    throw new Error('mint transition differs from the exact reviewed event-block identity');
  }
  if (
    lineage.contracts.bridgeAddressHex !== state.bridgeAddressHex
    || lineage.contracts.tokenAddressHex !== state.tokenAddressHex
    || lineage.contracts.bridgeRuntimeCodeSha256Hex !== state.bridgeRuntimeCodeSha256Hex
    || lineage.contracts.bridgeRuntimeCodeBytes !== state.bridgeRuntimeCodeBytes
    || lineage.contracts.tokenRuntimeCodeSha256Hex !== state.tokenRuntimeCodeSha256Hex
    || lineage.contracts.tokenRuntimeCodeBytes !== state.tokenRuntimeCodeBytes
    || lineage.contracts.bridgeOwnerAddressHex !== state.bridgeOwnerAddressHex
    || lineage.contracts.tokenOwnerAddressHex !== state.tokenOwnerAddressHex
    || lineage.contracts.bridgeTokenAddressHex !== state.bridgeTokenAddressHex
    || lineage.contracts.bridgePaused !== state.bridgePaused
    || lineage.contracts.tokenTotalSupply !== state.tokenTotalSupply
    || transition.postTokenTotalSupply !== state.tokenTotalSupply
  ) {
    throw new Error('mint transition contract state differs from reviewed deployment lineage');
  }
  if (
    lineage.pegIn.transactionHashHex !== event.transactionHashHex
    || lineage.pegIn.transactionIndex !== event.transactionIndex
    || lineage.pegIn.globalEventIndex !== event.globalEventIndex
    || lineage.pegIn.recipientHex !== event.recipientHex
    || lineage.pegIn.amountNanoErg !== event.amountNanoErg
    || lineage.pegIn.ergoBoxIdHex !== event.ergoBoxIdHex
    || lineage.pegIn.processedPegIn !== true
    || transition.mintTransactionHashHex !== event.transactionHashHex
    || transition.mintTransactionIndex !== event.transactionIndex
    || transition.mintTokenAddressHex !== state.tokenAddressHex
    || transition.mintRecipientAddressHex !== event.recipientHex
    || transition.mintAmount !== event.amountNanoErg
  ) {
    throw new Error('mint transition differs from the exact reviewed PegIn and mint pair');
  }
  if (
    transition.parentProcessedPegIn !== false
    || transition.postProcessedPegIn !== true
    || transition.tokenTotalSupplyDelta !== event.amountNanoErg
    || transition.recipientBalanceDelta !== event.amountNanoErg
  ) {
    throw new Error('mint transition replay or amount deltas differ from the reviewed PegIn');
  }

  const target = deepFreeze({
    parentNativeBlockHashHex: mint.parentLink.parentNativeBlockHashHex,
    parentNativeHeight: mint.parentLink.parentNativeHeight,
    parentStateRootHex: mint.parentLink.parentStateRootHex,
    eventNativeBlockHashHex: nativeTarget.nativeBlockHashHex,
    eventNativeHeight: nativeTarget.nativeHeight,
    eventNativeStateRootHex: nativeTarget.stateRootHex,
    executionHeight: execution.executionHeight,
    executionBlockHashHex: execution.executionBlockHashHex,
  });
  const joinedTransition = deepFreeze({
    parentProcessedPegIn: false as const,
    postProcessedPegIn: true as const,
    parentTokenTotalSupply: transition.parentTokenTotalSupply,
    postTokenTotalSupply: transition.postTokenTotalSupply,
    tokenTotalSupplyDelta: transition.tokenTotalSupplyDelta,
    parentRecipientBalance: transition.parentRecipientBalance,
    postRecipientBalance: transition.postRecipientBalance,
    recipientBalanceDelta: transition.recipientBalanceDelta,
    recipientBalanceStorageKeyHex: transition.recipientBalanceStorageKeyHex,
    mintTransactionLogIndex: transition.mintTransactionLogIndex,
    mintGlobalEventIndex: transition.mintGlobalEventIndex,
  });
  const checks = deepFreeze({
    sameProcessCandidateProvenanceVerified: true as const,
    exactNestedContractStateRequestBound: true as const,
    exactReviewedDeploymentLineageBound: true as const,
    exactDirectParentAndEventIdentityBound: true as const,
    exactContractAndPostStateBound: true as const,
    exactPegInAndPairedMintBound: true as const,
    exactReplayTransitionAndMintDeltasBound: true as const,
  });
  const authority = deepFreeze({
    nativeVerifierExecutionAuthenticated: false as const,
    historicalCodeContinuityProved: false as const,
    historicalReceiptStateProofCompletenessProved: false as const,
    committedVaultTransitionProved: false as const,
    historicalMintAbsenceProved: false as const,
    mintAuthorized: false as const,
    daemonAdmissionAuthorized: false as const,
    settlementAuthorized: false as const,
    reconciliationHoldReleaseAuthorized: false as const,
    signingAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
    gate5Closed: false as const,
    productionReady: false as const,
  });
  const limitations = Object.freeze([
    'the caller-supplied native report remains execution-unauthenticated and non-authorizing',
    'the RPC lineage remains bounded corroboration rather than cryptographic historical completeness',
    'the exact confirmed Ergo deposit-to-vault transition remains a separate prerequisite',
    'idempotent mint admission remains fail-closed and is not connected to this candidate',
  ]);
  const binding = {
    schema: FRONTIER_MINT_TRANSITION_DEPLOYMENT_LINEAGE_JOIN_SCHEMA,
    status: FRONTIER_MINT_TRANSITION_DEPLOYMENT_LINEAGE_JOIN_STATUS,
    mintTransitionRequestDigestHex: mint.requestDigestHex,
    contractStateLineageJoinDigestHex: lineage.candidateDigestHex,
    contractStateRequestDigestHex: lineage.contractStateRequestDigestHex,
    trustAnchorDigestHex: mint.trustAnchorDigestHex,
    nativeFinalityStatementDigestHex: lineage.nativeFinalityStatementDigestHex,
    target,
    contracts: lineage.contracts,
    pegIn: lineage.pegIn,
    transition: joinedTransition,
    checks,
    authority,
    limitations,
  } as const;
  const candidate = deepFreeze({
    ...binding,
    candidateDigestHex: `0x${sha256CanonicalJson(
      binding,
      FRONTIER_MINT_TRANSITION_DEPLOYMENT_LINEAGE_JOIN_DIGEST_DOMAIN,
    )}`,
  });
  JOIN_CANDIDATES.add(candidate);
  return candidate;
}

export function assertFrontierMintTransitionDeploymentLineageJoinCandidateProvenance(
  value: unknown,
): asserts value is FrontierMintTransitionDeploymentLineageJoinCandidate {
  if (!value || typeof value !== 'object' || !JOIN_CANDIDATES.has(value)) {
    throw new Error('Frontier mint-transition deployment-lineage join provenance is missing');
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
