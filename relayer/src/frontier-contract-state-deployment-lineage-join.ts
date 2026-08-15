import {
  assertAuthorityBoundDeploymentLineageProvenance,
  type AuthorityBoundDeploymentLineageCandidate,
  type CanonicalDeploymentLineageEvent,
} from './authority-bound-deployment-lineage.js';
import {
  assertNativeFinalizedPegInFrontierContractStateV1ResultCandidateProvenance,
  type NativeFinalizedPegInFrontierContractStateV1ResultCandidate,
} from './native-finalized-peg-in-frontier-contract-state-v1.js';
import {
  assertDeploymentIdentityArtifactProfileProvenance,
  assertDeploymentIdentityCandidateProvenance,
  type DeploymentIdentityArtifactProfile,
  type DeploymentIdentityCandidate,
} from './read-only-deployment-identity-observer.js';
import {
  assertReviewedDeploymentLineageProfileProvenance,
  type DeploymentLineageProfileV1,
} from './reviewed-deployment-lineage-profiles.js';
import { sha256CanonicalJson } from './strict-json.js';

export const FRONTIER_CONTRACT_STATE_DEPLOYMENT_LINEAGE_JOIN_SCHEMA =
  'e2s.native-finalized-peg-in-deployment-lineage-join-candidate.v1' as const;
export const FRONTIER_CONTRACT_STATE_DEPLOYMENT_LINEAGE_JOIN_STATUS =
  'non_authorizing_candidate' as const;
export const FRONTIER_CONTRACT_STATE_DEPLOYMENT_LINEAGE_JOIN_DIGEST_DOMAIN =
  'e2s.native-finalized-peg-in-deployment-lineage-join-candidate.digest.v1' as const;

const JOIN_CANDIDATES = new WeakSet<object>();
const ZERO_ADDRESS = `0x${'00'.repeat(20)}`;

export interface FrontierContractStateDeploymentLineageJoinCandidate {
  readonly schema: typeof FRONTIER_CONTRACT_STATE_DEPLOYMENT_LINEAGE_JOIN_SCHEMA;
  readonly status: typeof FRONTIER_CONTRACT_STATE_DEPLOYMENT_LINEAGE_JOIN_STATUS;
  readonly contractStateRequestDigestHex: string;
  readonly deploymentIdentityCandidateDigestHex: string;
  readonly deploymentLineageCandidateDigestHex: string;
  readonly artifactProfileDigestHex: string;
  readonly buildManifestSha256Hex: string;
  readonly reviewedProfileDigestHex: string;
  readonly trustAnchorDigestHex: string;
  readonly nativeFinalityStatementDigestHex: string;
  readonly target: Readonly<{
    nativeBlockHashHex: string;
    nativeHeight: string;
    nativeStateRootHex: string;
    executionHeight: string;
    executionBlockHashHex: string;
  }>;
  readonly contracts: Readonly<{
    bridgeAddressHex: string;
    tokenAddressHex: string;
    bridgeRuntimeCodeSha256Hex: string;
    bridgeRuntimeCodeBytes: string;
    tokenRuntimeCodeSha256Hex: string;
    tokenRuntimeCodeBytes: string;
    bridgeOwnerAddressHex: string;
    tokenOwnerAddressHex: string;
    bridgeTokenAddressHex: string;
    bridgePaused: boolean;
    tokenTotalSupply: string;
  }>;
  readonly pegIn: Readonly<{
    transactionHashHex: string;
    transactionIndex: number;
    globalEventIndex: number;
    recipientHex: string;
    amountNanoErg: string;
    ergoBoxIdHex: string;
    processedPegIn: true;
  }>;
  readonly checks: Readonly<{
    sameProcessCandidateProvenanceVerified: true;
    trackedArtifactClosureBound: true;
    reviewedLineageProfileBound: true;
    exactExecutionBlockIdentityBound: true;
    exactContractCodeIdentityBound: true;
    exactOwnerAndTokenBindingsBound: true;
    exactExecutionBlockPostStateBound: true;
    exactPegInAndMintPairBound: true;
    exactReplayPostStateBound: true;
  }>;
  readonly authority: Readonly<{
    nativeVerifierExecutionAuthenticated: false;
    historicalCodeContinuityProved: false;
    historicalReceiptStateProofCompletenessProved: false;
    preEventReplayAbsenceProved: false;
    committedVaultTransitionProved: false;
    historicalMintAbsenceProved: false;
    mintAuthorized: false;
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

export function buildFrontierContractStateDeploymentLineageJoinCandidate(input: {
  readonly contractStateCandidate:
    NativeFinalizedPegInFrontierContractStateV1ResultCandidate;
  readonly artifactProfile: DeploymentIdentityArtifactProfile;
  readonly deploymentIdentityCandidate: DeploymentIdentityCandidate;
  readonly deploymentLineageCandidate: AuthorityBoundDeploymentLineageCandidate;
  readonly reviewedProfile: DeploymentLineageProfileV1;
}): FrontierContractStateDeploymentLineageJoinCandidate {
  assertNativeFinalizedPegInFrontierContractStateV1ResultCandidateProvenance(
    input?.contractStateCandidate,
  );
  assertDeploymentIdentityArtifactProfileProvenance(input?.artifactProfile);
  assertDeploymentIdentityCandidateProvenance(input?.deploymentIdentityCandidate);
  assertAuthorityBoundDeploymentLineageProvenance(input?.deploymentLineageCandidate);
  assertReviewedDeploymentLineageProfileProvenance(input?.reviewedProfile);

  const contractCandidate = input.contractStateCandidate;
  const state = contractCandidate.contractState;
  const eventCandidate = contractCandidate.eventVerification;
  const execution = eventCandidate.executionIdentity.execution;
  const target = eventCandidate.executionIdentity.target;
  const event = eventCandidate.event;
  const artifact = input.artifactProfile;
  const identity = input.deploymentIdentityCandidate;
  const lineage = input.deploymentLineageCandidate;
  const profile = input.reviewedProfile;

  assertArtifactBindings(state, artifact);
  assertIdentityBindings(state, artifact, identity, profile);
  assertLineageBindings(
    state,
    identity,
    lineage,
    profile,
    execution.executionHeight,
    execution.executionBlockHashHex,
  );
  assertTrustBindings(contractCandidate, lineage, profile);
  assertEventBindings(eventCandidate, lineage);

  const targetBinding = deepFreeze({
    nativeBlockHashHex: target.nativeBlockHashHex,
    nativeHeight: target.nativeHeight,
    nativeStateRootHex: target.stateRootHex,
    executionHeight: execution.executionHeight,
    executionBlockHashHex: execution.executionBlockHashHex,
  });
  const contracts = deepFreeze({
    bridgeAddressHex: state.bridgeAddressHex,
    tokenAddressHex: state.tokenAddressHex,
    bridgeRuntimeCodeSha256Hex: state.bridgeRuntimeCodeSha256Hex,
    bridgeRuntimeCodeBytes: state.bridgeRuntimeCodeBytes,
    tokenRuntimeCodeSha256Hex: state.tokenRuntimeCodeSha256Hex,
    tokenRuntimeCodeBytes: state.tokenRuntimeCodeBytes,
    bridgeOwnerAddressHex: state.bridgeOwnerAddressHex,
    tokenOwnerAddressHex: state.tokenOwnerAddressHex,
    bridgeTokenAddressHex: state.bridgeTokenAddressHex,
    bridgePaused: state.bridgePaused,
    tokenTotalSupply: state.tokenTotalSupply,
  });
  const pegIn = deepFreeze({
    transactionHashHex: event.transactionHashHex,
    transactionIndex: event.transactionIndex,
    globalEventIndex: event.globalEventIndex,
    recipientHex: event.recipientHex,
    amountNanoErg: event.amountNanoErg,
    ergoBoxIdHex: event.ergoBoxIdHex,
    processedPegIn: state.processedPegIn,
  });
  const checks = deepFreeze({
    sameProcessCandidateProvenanceVerified: true as const,
    trackedArtifactClosureBound: true as const,
    reviewedLineageProfileBound: true as const,
    exactExecutionBlockIdentityBound: true as const,
    exactContractCodeIdentityBound: true as const,
    exactOwnerAndTokenBindingsBound: true as const,
    exactExecutionBlockPostStateBound: true as const,
    exactPegInAndMintPairBound: true as const,
    exactReplayPostStateBound: true as const,
  });
  const authority = deepFreeze({
    nativeVerifierExecutionAuthenticated: false as const,
    historicalCodeContinuityProved: false as const,
    historicalReceiptStateProofCompletenessProved: false as const,
    preEventReplayAbsenceProved: false as const,
    committedVaultTransitionProved: false as const,
    historicalMintAbsenceProved: false as const,
    mintAuthorized: false as const,
    settlementAuthorized: false as const,
    reconciliationHoldReleaseAuthorized: false as const,
    signingAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
    gate5Closed: false as const,
    productionReady: false as const,
  });
  const limitations = Object.freeze([
    'one authenticated post-state does not prove pre-event replay absence or historical code continuity',
    'the RPC lineage remains bounded corroboration rather than cryptographic historical completeness',
    'committed-vault eligibility and idempotent mint admission remain separate fail-closed obligations',
    'this candidate cannot authorize mint, hold release, settlement, signing, submission, or broadcast',
  ]);
  const binding = {
    schema: FRONTIER_CONTRACT_STATE_DEPLOYMENT_LINEAGE_JOIN_SCHEMA,
    status: FRONTIER_CONTRACT_STATE_DEPLOYMENT_LINEAGE_JOIN_STATUS,
    contractStateRequestDigestHex: contractCandidate.requestDigestHex,
    deploymentIdentityCandidateDigestHex: identity.candidateDigestHex,
    deploymentLineageCandidateDigestHex: lineage.candidateDigestHex,
    artifactProfileDigestHex: artifact.profileDigestHex,
    buildManifestSha256Hex: artifact.buildManifestSha256Hex,
    reviewedProfileDigestHex: profile.profileDigestHex,
    trustAnchorDigestHex: contractCandidate.trustAnchorDigestHex,
    nativeFinalityStatementDigestHex: lineage.nativeFinalityStatementDigestHex,
    target: targetBinding,
    contracts,
    pegIn,
    checks,
    authority,
    limitations,
  } as const;
  const candidate = deepFreeze({
    ...binding,
    candidateDigestHex: `0x${sha256CanonicalJson(
      binding,
      FRONTIER_CONTRACT_STATE_DEPLOYMENT_LINEAGE_JOIN_DIGEST_DOMAIN,
    )}`,
  });
  JOIN_CANDIDATES.add(candidate);
  return candidate;
}

export function assertFrontierContractStateDeploymentLineageJoinCandidateProvenance(
  value: unknown,
): asserts value is FrontierContractStateDeploymentLineageJoinCandidate {
  if (!value || typeof value !== 'object' || !JOIN_CANDIDATES.has(value)) {
    throw new Error('Frontier contract-state deployment-lineage join provenance is missing');
  }
}

function assertArtifactBindings(
  state: NativeFinalizedPegInFrontierContractStateV1ResultCandidate['contractState'],
  artifact: DeploymentIdentityArtifactProfile,
): void {
  if (
    stripPrefix(state.bridgeRuntimeCodeSha256Hex)
      !== artifact.bridge.runtimeBytecodeSha256Hex
    || state.bridgeRuntimeCodeBytes !== artifact.bridge.runtimeByteLength.toString()
    || stripPrefix(state.tokenRuntimeCodeSha256Hex)
      !== artifact.token.runtimeBytecodeSha256Hex
    || state.tokenRuntimeCodeBytes !== artifact.token.runtimeByteLength.toString()
  ) {
    throw new Error('authenticated contract code differs from the tracked artifact profile');
  }
}

function assertIdentityBindings(
  state: NativeFinalizedPegInFrontierContractStateV1ResultCandidate['contractState'],
  artifact: DeploymentIdentityArtifactProfile,
  identity: DeploymentIdentityCandidate,
  profile: DeploymentLineageProfileV1,
): void {
  const view = identity.view;
  if (
    view.chainId !== profile.evmChainId
    || view.tipHeight !== profile.interval.terminalHeight
    || stripPrefix(view.tipHashHex)
      !== stripPrefix(profile.interval.terminalExecutionBlockHashHex)
  ) {
    throw new Error('T19 observation does not match the reviewed lineage terminal');
  }
  if (
    view.bridgeAddress !== state.bridgeAddressHex
    || view.tokenAddress !== state.tokenAddressHex
    || profile.bridge.address !== state.bridgeAddressHex
    || profile.token.address !== state.tokenAddressHex
    || view.bridgeTokenAddress !== state.bridgeTokenAddressHex
  ) {
    throw new Error('authenticated contract addresses differ from the T19 deployment identity');
  }
  if (
    view.bridgeRuntimeByteLength.toString() !== state.bridgeRuntimeCodeBytes
    || view.bridgeRuntimeBytecodeSha256Hex !== stripPrefix(state.bridgeRuntimeCodeSha256Hex)
    || view.tokenRuntimeByteLength.toString() !== state.tokenRuntimeCodeBytes
    || view.tokenRuntimeBytecodeSha256Hex !== stripPrefix(state.tokenRuntimeCodeSha256Hex)
  ) {
    throw new Error('authenticated contract code differs from the T19 deployment identity');
  }
  if (
    view.artifactProfileDigestHex !== artifact.profileDigestHex
    || view.buildManifestSha256Hex !== artifact.buildManifestSha256Hex
  ) {
    throw new Error('T19 deployment identity differs from the tracked artifact closure');
  }
}

function assertLineageBindings(
  state: NativeFinalizedPegInFrontierContractStateV1ResultCandidate['contractState'],
  identity: DeploymentIdentityCandidate,
  lineage: AuthorityBoundDeploymentLineageCandidate,
  profile: DeploymentLineageProfileV1,
  executionHeight: string,
  executionBlockHashHex: string,
): void {
  const targetBlock = lineage.blocks.find(block =>
    block.height === executionHeight && block.hashHex === executionBlockHashHex);
  if (
    lineage.deploymentIdentityCandidateDigestHex !== identity.candidateDigestHex
    || lineage.artifactProfileDigestHex !== identity.view.artifactProfileDigestHex
    || lineage.reviewedProfileDigestHex !== profile.profileDigestHex
    || lineage.interval.terminalHeight !== profile.interval.terminalHeight
    || lineage.interval.terminalExecutionBlockHashHex
      !== profile.interval.terminalExecutionBlockHashHex
    || lineage.deployments.bridge.address !== state.bridgeAddressHex
    || lineage.deployments.token.address !== state.tokenAddressHex
    || lineage.deployments.bridge.runtimeBytecodeSha256Hex
      !== stripPrefix(state.bridgeRuntimeCodeSha256Hex)
    || lineage.deployments.token.runtimeBytecodeSha256Hex
      !== stripPrefix(state.tokenRuntimeCodeSha256Hex)
    || !targetBlock
    || targetBlock.bridgeOwnerAddress !== state.bridgeOwnerAddressHex
    || targetBlock.tokenOwnerAddress !== state.tokenOwnerAddressHex
    || targetBlock.tokenTotalSupply !== state.tokenTotalSupply
    || targetBlock.bridgeCodeState !== 'reviewed-runtime'
    || targetBlock.tokenCodeState !== 'reviewed-runtime'
  ) {
    throw new Error('authenticated contract state differs from the exact T20A execution block');
  }
}

function assertTrustBindings(
  candidate: NativeFinalizedPegInFrontierContractStateV1ResultCandidate,
  lineage: AuthorityBoundDeploymentLineageCandidate,
  profile: DeploymentLineageProfileV1,
): void {
  if (
    candidate.trustAnchorDigestHex !== profile.nativeGrandpaTrust.trustedAnchorDigestHex
    || candidate.eventVerification.executionIdentity.record.sidechainIdHex
      !== profile.sidechainIdHex
    || lineage.reviewedProfileDigestHex !== profile.profileDigestHex
  ) {
    throw new Error('authenticated contract state differs from the reviewed trust lineage');
  }
}

function assertEventBindings(
  candidate: NativeFinalizedPegInFrontierContractStateV1ResultCandidate['eventVerification'],
  lineage: AuthorityBoundDeploymentLineageCandidate,
): void {
  const event = candidate.event;
  const execution = candidate.executionIdentity.execution;
  const block = lineage.blocks.find(item =>
    item.height === execution.executionHeight
    && item.hashHex === execution.executionBlockHashHex);
  if (!block) throw new Error('T20A lineage lacks the authenticated execution block');
  const matchingPegIns = block.events.filter(item => exactPegInEvent(item, event));
  if (matchingPegIns.length !== 1) {
    throw new Error('T20A lineage does not contain exactly one authenticated PegIn event');
  }
  const matchingMints = block.events.filter(item => exactMintEvent(item, event));
  if (matchingMints.length !== 1) {
    throw new Error('T20A lineage does not contain exactly one paired mint event');
  }
}

function exactPegInEvent(
  item: CanonicalDeploymentLineageEvent,
  event: NativeFinalizedPegInFrontierContractStateV1ResultCandidate['eventVerification']['event'],
): boolean {
  return item.kind === 'bridge_peg_in'
    && item.transactionHashHex === event.transactionHashHex
    && item.transactionIndex === event.transactionIndex
    && item.logIndex === event.globalEventIndex
    && item.toAddress === event.recipientHex
    && item.amount === event.amountNanoErg
    && item.ergoBoxIdHex === event.ergoBoxIdHex;
}

function exactMintEvent(
  item: CanonicalDeploymentLineageEvent,
  event: NativeFinalizedPegInFrontierContractStateV1ResultCandidate['eventVerification']['event'],
): boolean {
  return item.kind === 'token_transfer'
    && item.transactionHashHex === event.transactionHashHex
    && item.transactionIndex === event.transactionIndex
    && item.fromAddress === ZERO_ADDRESS
    && item.toAddress === event.recipientHex
    && item.amount === event.amountNanoErg;
}

function stripPrefix(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
