import blakejs from 'blakejs';
import { TextDecoder } from 'node:util';

import {
  NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_STATUS,
  buildNativeFinalizedPegInFrontierContractStateV1ResultCandidate,
  normalizeNativeFinalizedPegInFrontierContractStateV1Request,
  type NativeFinalizedPegInFrontierContractStateV1Request,
  type NativeFinalizedPegInFrontierContractStateV1ResultCandidate,
} from './native-finalized-peg-in-frontier-contract-state-v1.js';
import {
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES,
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODE_BYTES,
  MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODES,
} from './native-finalized-peg-in-frontier-execution-identity-v1.js';
import {
  deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity,
} from './native-finalized-peg-in-runtime-identity-v2.js';
import {
  deriveFrontierTokenBalanceMappingSlotV1Hex,
  normalizePegInFrontierMintTransitionStatementV1,
  type PegInFrontierMintTransitionStatementV1,
} from './peg-in-frontier-mint-transition-v1.js';
import { decodePegInRuntimeRecordV1ScaleHex } from './peg-in-runtime-state.js';
import { parseStrictJson } from './strict-json.js';

export const NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_REQUEST_SCHEMA =
  'e2s.native-finalized-peg-in-frontier-mint-transition-request.v1' as const;
export const NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_VERIFICATION_SCHEMA =
  'e2s.native-finalized-peg-in-frontier-mint-transition-verification.v1' as const;
export const NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_STATUS =
  'NATIVE_PEG_IN_FRONTIER_MINT_TRANSITION_VERIFIED_RELATIVE_TO_SUPPLIED_TRUST_ROOT_DIGEST' as const;
export const NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_RESULT_CANDIDATE_SCHEMA =
  'e2s.native-finalized-peg-in-frontier-mint-transition-result-candidate.v1' as const;
export const NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_RESULT_CANDIDATE_STATUS =
  'NATIVE_PEG_IN_FRONTIER_MINT_TRANSITION_RESULT_CANDIDATE' as const;
export const MAX_NATIVE_FRONTIER_MINT_TRANSITION_REQUEST_BYTES = 64 * 1024 * 1024;
export const MAX_NATIVE_FRONTIER_MINT_TRANSITION_HEADER_BYTES = 64 * 1024;

const RESULT_CANDIDATES = new WeakSet<object>();
const ZERO_ADDRESS = `0x${'00'.repeat(20)}`;

export interface NativeFinalizedPegInFrontierMintTransitionV1Request {
  readonly schema:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_REQUEST_SCHEMA;
  readonly contractStateRequest: NativeFinalizedPegInFrontierContractStateV1Request;
  readonly parentNativeBlockHashHex: string;
  readonly parentHeaderScaleHex: string;
  readonly parentStateProofNodesHex: readonly string[];
  readonly statement: PegInFrontierMintTransitionStatementV1;
}

export interface FrontierPegInMintTransitionParentLinkV1Output {
  readonly parentNativeBlockHashHex: string;
  readonly parentNativeHeight: string;
  readonly parentStateRootHex: string;
  readonly eventNativeBlockHashHex: string;
  readonly eventNativeHeight: string;
  readonly directParentVerified: true;
}

export interface FrontierPegInMintTransitionV1Output {
  readonly parentRuntimeCodeSha256Hex: string;
  readonly parentRuntimeCodeBytes: string;
  readonly parentNativeProcessedRecordStorageKeyHex: string;
  readonly parentProcessedPegIn: false;
  readonly postProcessedPegIn: true;
  readonly parentTokenTotalSupply: string;
  readonly postTokenTotalSupply: string;
  readonly tokenTotalSupplyDelta: string;
  readonly recipientBalanceSlotHex: string;
  readonly recipientBalanceStorageKeyHex: string;
  readonly parentRecipientBalance: string;
  readonly postRecipientBalance: string;
  readonly recipientBalanceDelta: string;
  readonly mintTokenAddressHex: string;
  readonly mintTransactionHashHex: string;
  readonly mintTransactionIndex: number;
  readonly mintTransactionLogIndex: number;
  readonly mintGlobalEventIndex: number;
  readonly mintFromAddressHex: typeof ZERO_ADDRESS;
  readonly mintRecipientAddressHex: string;
  readonly mintAmount: string;
  readonly parentProofNodeCount: number;
  readonly parentProofBytes: number;
  readonly postProofNodeCount: number;
  readonly postProofBytes: number;
  readonly verified: true;
}

export interface NativeFinalizedPegInFrontierMintTransitionV1ResultCandidate {
  readonly schema:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_RESULT_CANDIDATE_SCHEMA;
  readonly status:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_RESULT_CANDIDATE_STATUS;
  readonly sourceResultSchema:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_VERIFICATION_SCHEMA;
  readonly reportedSourceResultStatus:
    typeof NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_STATUS;
  readonly requestDigestHex: string;
  readonly trustAnchorDigestHex: string;
  readonly contractStateVerification:
    NativeFinalizedPegInFrontierContractStateV1ResultCandidate;
  readonly parentLink: Omit<FrontierPegInMintTransitionParentLinkV1Output, 'directParentVerified'>;
  readonly transition: Omit<FrontierPegInMintTransitionV1Output, 'verified'>;
  readonly boundary: Readonly<{
    candidateOnly: true;
    exactRequestBytesDigestBound: true;
    independentlySuppliedTrustAnchorDigestBound: true;
    verifierResultClaimShapeChecked: true;
    verifierExecutionAuthenticated: false;
    reviewedDeploymentLineageVerified: false;
    sidechainFinalityVerified: false;
    directParentVerified: false;
    prePostStateVerified: false;
    replayTransitionVerified: false;
    exactMintDeltasVerified: false;
    pairedMintLogVerified: false;
    singleTokenEffectVerified: false;
    historicalCodeContinuityVerified: false;
    historicalReceiptStateProofCompletenessVerified: false;
    committedVaultTransitionVerified: false;
    historicalMintAbsenceVerified: false;
    mintAuthorized: false;
    daemonAdmissionAuthorized: false;
    settlementAuthorized: false;
    reconciliationHoldReleaseAuthorized: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    transactionMutationEnabled: false;
    gate5Closed: false;
    productionReadinessVerified: false;
  }>;
}

/** Normalize the exact nested T20B request plus one bounded direct-parent proof. */
export function normalizeNativeFinalizedPegInFrontierMintTransitionV1Request(
  value: unknown,
): NativeFinalizedPegInFrontierMintTransitionV1Request {
  const record = exactRecord(value, [
    'contractStateRequest',
    'parentHeaderScaleHex',
    'parentNativeBlockHashHex',
    'parentStateProofNodesHex',
    'schema',
    'statement',
  ], 'native finalized peg-in Frontier mint-transition V1 request');
  requireLiteral(
    record.schema,
    NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_REQUEST_SCHEMA,
    'native finalized peg-in Frontier mint-transition V1 request schema',
  );
  const contractStateRequest =
    normalizeNativeFinalizedPegInFrontierContractStateV1Request(
      record.contractStateRequest,
    );
  const executionStatement =
    contractStateRequest.eventRequest.executionIdentityRequest.statement;
  const runtimeRecord = decodePegInRuntimeRecordV1ScaleHex(
    executionStatement.expectedRecordScaleHex,
  );
  const statement = normalizePegInFrontierMintTransitionStatementV1(
    record.statement,
    {
      sidechainIdHex:
        contractStateRequest.eventRequest.executionIdentityRequest.trustAnchor.sidechainIdHex,
      ergoBoxIdHex: executionStatement.ergoBoxIdHex,
      tokenAddressHex: contractStateRequest.statement.tokenAddressHex,
      recipientHex: runtimeRecord.recipientAddress,
    },
  );
  const parentStateProofNodesHex = normalizeProofNodes(
    record.parentStateProofNodesHex,
    'Frontier mint-transition parent-state proof',
  );
  const request = deepFreeze({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_REQUEST_SCHEMA,
    contractStateRequest,
    parentNativeBlockHashHex: fixedHex(
      record.parentNativeBlockHashHex,
      32,
      'Frontier mint-transition parent native block hash',
    ),
    parentHeaderScaleHex: boundedByteHex(
      record.parentHeaderScaleHex,
      MAX_NATIVE_FRONTIER_MINT_TRANSITION_HEADER_BYTES,
      'Frontier mint-transition parent header SCALE',
    ),
    parentStateProofNodesHex,
    statement,
  });
  const requestBytes = Buffer.byteLength(JSON.stringify(request), 'utf8');
  if (requestBytes > MAX_NATIVE_FRONTIER_MINT_TRANSITION_REQUEST_BYTES) {
    throw new Error(
      `native finalized peg-in Frontier mint-transition V1 request exceeds ${MAX_NATIVE_FRONTIER_MINT_TRANSITION_REQUEST_BYTES} bytes`,
    );
  }
  return request;
}

export function deriveNativeFinalizedPegInFrontierMintTransitionV1ExactRequestDigestHex(
  requestBytes: Uint8Array,
): string {
  if (requestBytes.byteLength > MAX_NATIVE_FRONTIER_MINT_TRANSITION_REQUEST_BYTES) {
    throw new Error(
      `native finalized peg-in Frontier mint-transition V1 request exceeds ${MAX_NATIVE_FRONTIER_MINT_TRANSITION_REQUEST_BYTES} bytes`,
    );
  }
  return blake2b256Hex(Buffer.from(requestBytes));
}

/**
 * Quarantine one caller-supplied Rust T20C report as a non-authorizing candidate.
 *
 * Exact fields and arithmetic are checked, but native executable provenance is intentionally not
 * inferred. No returned field can authorize mint, settlement, signing, submission, or broadcast.
 */
export function buildNativeFinalizedPegInFrontierMintTransitionV1ResultCandidate(input: {
  readonly requestBytes: Uint8Array;
  readonly trustedAnchorDigestHex: unknown;
  readonly verification: unknown;
}): NativeFinalizedPegInFrontierMintTransitionV1ResultCandidate {
  if (input.requestBytes.byteLength > MAX_NATIVE_FRONTIER_MINT_TRANSITION_REQUEST_BYTES) {
    throw new Error(
      `native finalized peg-in Frontier mint-transition V1 request exceeds ${MAX_NATIVE_FRONTIER_MINT_TRANSITION_REQUEST_BYTES} bytes`,
    );
  }
  let requestSource: string;
  try {
    requestSource = new TextDecoder('utf-8', { fatal: true }).decode(input.requestBytes);
  } catch (error) {
    throw new Error(
      'native finalized peg-in Frontier mint-transition V1 request bytes are not valid UTF-8 JSON',
      { cause: error },
    );
  }
  const decodedRequest = parseStrictJson(
    requestSource,
    'native finalized peg-in Frontier mint-transition V1 request bytes',
  );
  const request = normalizeNativeFinalizedPegInFrontierMintTransitionV1Request(
    decodedRequest,
  );
  const trustedAnchorDigestHex = fixedHex(
    input.trustedAnchorDigestHex,
    32,
    'independently supplied Frontier mint-transition trust anchor digest',
  );
  const result = exactRecord(input.verification, [
    'boundary',
    'contractStateVerification',
    'parentLink',
    'requestDigestHex',
    'schema',
    'status',
    'transition',
    'trustAnchorDigestHex',
  ], 'native finalized peg-in Frontier mint-transition V1 verification');
  requireLiteral(
    result.schema,
    NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_VERIFICATION_SCHEMA,
    'native finalized peg-in Frontier mint-transition V1 verification schema',
  );
  requireLiteral(
    result.status,
    NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_STATUS,
    'native finalized peg-in Frontier mint-transition V1 verification status',
  );
  const requestDigestHex = fixedHex(
    result.requestDigestHex,
    32,
    'Frontier mint-transition request digest',
  );
  if (
    requestDigestHex
    !== deriveNativeFinalizedPegInFrontierMintTransitionV1ExactRequestDigestHex(
      input.requestBytes,
    )
  ) {
    throw new Error('Frontier mint-transition request digest does not match the exact request');
  }
  const resultTrustAnchorDigestHex = fixedHex(
    result.trustAnchorDigestHex,
    32,
    'Frontier mint-transition verification trust anchor digest',
  );
  if (resultTrustAnchorDigestHex !== trustedAnchorDigestHex) {
    throw new Error(
      'Frontier mint-transition verification does not match the independently supplied trust anchor',
    );
  }

  const projectedContractState = exactRecord(result.contractStateVerification, [
    'boundary',
    'contractState',
    'eventVerification',
    'requestDigestHex',
    'schema',
    'trustAnchorDigestHex',
  ], 'status-free Frontier contract-state verification projection');
  const contractStateVerification =
    buildNativeFinalizedPegInFrontierContractStateV1ResultCandidate({
      requestBytes: Buffer.from(JSON.stringify(request.contractStateRequest), 'utf8'),
      trustedAnchorDigestHex,
      verification: {
        ...projectedContractState,
        status: NATIVE_FINALIZED_PEG_IN_FRONTIER_CONTRACT_STATE_V1_STATUS,
      },
    });
  const parentLink = normalizeParentLink(
    result.parentLink,
    request,
    contractStateVerification,
  );
  const transition = normalizeTransition(
    result.transition,
    request,
    contractStateVerification,
  );
  normalizeVerificationBoundary(result.boundary);
  const { directParentVerified: _directParentVerified, ...candidateParentLink } = parentLink;
  const { verified: _verified, ...candidateTransition } = transition;

  const candidate = deepFreeze({
    schema: NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_RESULT_CANDIDATE_SCHEMA,
    status: NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_RESULT_CANDIDATE_STATUS,
    sourceResultSchema:
      NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_VERIFICATION_SCHEMA,
    reportedSourceResultStatus:
      NATIVE_FINALIZED_PEG_IN_FRONTIER_MINT_TRANSITION_V1_STATUS,
    requestDigestHex,
    trustAnchorDigestHex: trustedAnchorDigestHex,
    contractStateVerification,
    parentLink: candidateParentLink,
    transition: candidateTransition,
    boundary: {
      candidateOnly: true,
      exactRequestBytesDigestBound: true,
      independentlySuppliedTrustAnchorDigestBound: true,
      verifierResultClaimShapeChecked: true,
      verifierExecutionAuthenticated: false,
      reviewedDeploymentLineageVerified: false,
      sidechainFinalityVerified: false,
      directParentVerified: false,
      prePostStateVerified: false,
      replayTransitionVerified: false,
      exactMintDeltasVerified: false,
      pairedMintLogVerified: false,
      singleTokenEffectVerified: false,
      historicalCodeContinuityVerified: false,
      historicalReceiptStateProofCompletenessVerified: false,
      committedVaultTransitionVerified: false,
      historicalMintAbsenceVerified: false,
      mintAuthorized: false,
      daemonAdmissionAuthorized: false,
      settlementAuthorized: false,
      reconciliationHoldReleaseAuthorized: false,
      signingAuthorized: false,
      submissionAuthorized: false,
      broadcastAuthorized: false,
      transactionMutationEnabled: false,
      gate5Closed: false,
      productionReadinessVerified: false,
    } as const,
  });
  RESULT_CANDIDATES.add(candidate);
  return candidate;
}

export function assertNativeFinalizedPegInFrontierMintTransitionV1ResultCandidateProvenance(
  value: unknown,
): asserts value is NativeFinalizedPegInFrontierMintTransitionV1ResultCandidate {
  if (!value || typeof value !== 'object' || !RESULT_CANDIDATES.has(value)) {
    throw new Error('native finalized Frontier mint-transition candidate provenance is missing');
  }
}

function normalizeParentLink(
  value: unknown,
  request: NativeFinalizedPegInFrontierMintTransitionV1Request,
  contractState: NativeFinalizedPegInFrontierContractStateV1ResultCandidate,
): FrontierPegInMintTransitionParentLinkV1Output {
  const link = exactRecord(value, [
    'directParentVerified',
    'eventNativeBlockHashHex',
    'eventNativeHeight',
    'parentNativeBlockHashHex',
    'parentNativeHeight',
    'parentStateRootHex',
  ], 'Frontier mint-transition parent link');
  const parentNativeBlockHashHex = fixedHex(
    link.parentNativeBlockHashHex,
    32,
    'Frontier mint-transition parent native block hash',
  );
  if (parentNativeBlockHashHex !== request.parentNativeBlockHashHex) {
    throw new Error('Frontier mint-transition parent hash differs from the request');
  }
  const parentNativeHeight = uint64Decimal(
    link.parentNativeHeight,
    'Frontier mint-transition parent native height',
  );
  const parentStateRootHex = fixedHex(
    link.parentStateRootHex,
    32,
    'Frontier mint-transition parent state root',
  );
  const eventNativeBlockHashHex = fixedHex(
    link.eventNativeBlockHashHex,
    32,
    'Frontier mint-transition event native block hash',
  );
  const eventNativeHeight = uint64Decimal(
    link.eventNativeHeight,
    'Frontier mint-transition event native height',
  );
  const target = contractState.eventVerification.executionIdentity.target;
  const parentHeader =
    deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity(
      request.parentHeaderScaleHex,
    );
  const eventHeader =
    deriveNativeFinalizedPegInRuntimeIdentityV2TargetHeaderIdentity(
      request.contractStateRequest.eventRequest.executionIdentityRequest
        .targetHeaderScaleHex,
    );
  if (
    parentHeader.nativeBlockHashHex !== parentNativeBlockHashHex
    || parentHeader.nativeHeight !== parentNativeHeight
    || parentHeader.stateRootHex !== parentStateRootHex
  ) {
    throw new Error(
      'Frontier mint-transition parent report differs from the canonical parent header',
    );
  }
  if (
    eventNativeBlockHashHex !== target.nativeBlockHashHex
    || eventNativeHeight !== target.nativeHeight
    || eventHeader.nativeBlockHashHex !== target.nativeBlockHashHex
    || eventHeader.nativeHeight !== target.nativeHeight
    || eventHeader.stateRootHex !== target.stateRootHex
    || eventHeader.parentHashHex !== parentNativeBlockHashHex
    || BigInt(parentNativeHeight) + 1n !== BigInt(eventNativeHeight)
  ) {
    throw new Error('Frontier mint-transition report does not bind one direct finalized parent');
  }
  literalTrue(link.directParentVerified, 'Frontier mint-transition direct-parent verification');
  return {
    parentNativeBlockHashHex,
    parentNativeHeight,
    parentStateRootHex,
    eventNativeBlockHashHex,
    eventNativeHeight,
    directParentVerified: true,
  };
}

function normalizeTransition(
  value: unknown,
  request: NativeFinalizedPegInFrontierMintTransitionV1Request,
  contractState: NativeFinalizedPegInFrontierContractStateV1ResultCandidate,
): FrontierPegInMintTransitionV1Output {
  const transition = exactRecord(value, [
    'mintAmount',
    'mintFromAddressHex',
    'mintGlobalEventIndex',
    'mintRecipientAddressHex',
    'mintTokenAddressHex',
    'mintTransactionHashHex',
    'mintTransactionIndex',
    'mintTransactionLogIndex',
    'parentNativeProcessedRecordStorageKeyHex',
    'parentProcessedPegIn',
    'parentProofBytes',
    'parentProofNodeCount',
    'parentRecipientBalance',
    'parentRuntimeCodeBytes',
    'parentRuntimeCodeSha256Hex',
    'parentTokenTotalSupply',
    'postProcessedPegIn',
    'postProofBytes',
    'postProofNodeCount',
    'postRecipientBalance',
    'postTokenTotalSupply',
    'recipientBalanceDelta',
    'recipientBalanceSlotHex',
    'recipientBalanceStorageKeyHex',
    'tokenTotalSupplyDelta',
    'verified',
  ], 'Frontier peg-in mint transition');
  const executionRequest =
    request.contractStateRequest.eventRequest.executionIdentityRequest;
  const runtimeIdentity = executionRequest.statement.runtimeCode;
  const parentRuntimeCodeSha256Hex = fixedHex(
    transition.parentRuntimeCodeSha256Hex,
    32,
    'Frontier mint-transition parent runtime-code SHA-256',
  );
  const parentRuntimeCodeBytes = positiveDecimal(
    transition.parentRuntimeCodeBytes,
    'Frontier mint-transition parent runtime-code bytes',
  );
  if (
    parentRuntimeCodeSha256Hex !== runtimeIdentity.artifactSha256Hex
    || parentRuntimeCodeBytes !== runtimeIdentity.artifactSizeBytes
  ) {
    throw new Error('Frontier mint-transition parent runtime code differs from the request');
  }
  requireLiteral(
    transition.parentNativeProcessedRecordStorageKeyHex,
    request.statement.parentNativeProcessedRecordStorageKeyHex,
    'Frontier mint-transition parent native processed-record key',
  );
  literalFalse(
    transition.parentProcessedPegIn,
    'Frontier mint-transition parent replay state',
  );
  literalTrue(transition.postProcessedPegIn, 'Frontier mint-transition post replay state');
  if (contractState.contractState.processedPegIn !== true) {
    throw new Error('Frontier mint-transition nested post replay state is not true');
  }

  const event = contractState.eventVerification.event;
  const amount = uint256Decimal(event.amountNanoErg, 'Frontier mint-transition peg-in amount');
  const parentTokenTotalSupply = uint256Decimal(
    transition.parentTokenTotalSupply,
    'Frontier mint-transition parent token supply',
  );
  const postTokenTotalSupply = uint256Decimal(
    transition.postTokenTotalSupply,
    'Frontier mint-transition post token supply',
  );
  const tokenTotalSupplyDelta = uint256Decimal(
    transition.tokenTotalSupplyDelta,
    'Frontier mint-transition token supply delta',
  );
  if (
    postTokenTotalSupply !== contractState.contractState.tokenTotalSupply
    || tokenTotalSupplyDelta !== amount
    || BigInt(parentTokenTotalSupply) + BigInt(amount) !== BigInt(postTokenTotalSupply)
  ) {
    throw new Error('Frontier mint-transition token supply delta differs from the peg-in');
  }

  const expectedBalanceSlot = deriveFrontierTokenBalanceMappingSlotV1Hex(
    event.recipientHex,
  );
  requireLiteral(
    transition.recipientBalanceSlotHex,
    expectedBalanceSlot,
    'Frontier mint-transition recipient balance slot',
  );
  requireLiteral(
    transition.recipientBalanceStorageKeyHex,
    request.statement.recipientBalanceStorageKeyHex,
    'Frontier mint-transition recipient balance storage key',
  );
  const parentRecipientBalance = uint256Decimal(
    transition.parentRecipientBalance,
    'Frontier mint-transition parent recipient balance',
  );
  const postRecipientBalance = uint256Decimal(
    transition.postRecipientBalance,
    'Frontier mint-transition post recipient balance',
  );
  const recipientBalanceDelta = uint256Decimal(
    transition.recipientBalanceDelta,
    'Frontier mint-transition recipient balance delta',
  );
  if (
    recipientBalanceDelta !== amount
    || BigInt(parentRecipientBalance) + BigInt(amount) !== BigInt(postRecipientBalance)
  ) {
    throw new Error('Frontier mint-transition recipient balance delta differs from the peg-in');
  }

  const mintTokenAddressHex = fixedHex(
    transition.mintTokenAddressHex,
    20,
    'Frontier mint-transition mint token',
  );
  const mintTransactionHashHex = fixedHex(
    transition.mintTransactionHashHex,
    32,
    'Frontier mint-transition mint transaction hash',
  );
  const mintTransactionIndex = boundedInteger(
    transition.mintTransactionIndex,
    Number.MAX_SAFE_INTEGER,
    'Frontier mint-transition mint transaction index',
  );
  const mintTransactionLogIndex = boundedInteger(
    transition.mintTransactionLogIndex,
    Number.MAX_SAFE_INTEGER,
    'Frontier mint-transition mint receipt-log index',
  );
  const mintGlobalEventIndex = boundedInteger(
    transition.mintGlobalEventIndex,
    0xffff_ffff,
    'Frontier mint-transition mint global event index',
  );
  const mintFromAddressHex = fixedHex(
    transition.mintFromAddressHex,
    20,
    'Frontier mint-transition mint source',
  );
  const mintRecipientAddressHex = fixedHex(
    transition.mintRecipientAddressHex,
    20,
    'Frontier mint-transition mint recipient',
  );
  const mintAmount = uint256Decimal(
    transition.mintAmount,
    'Frontier mint-transition mint amount',
  );
  if (
    mintTokenAddressHex !== contractState.contractState.tokenAddressHex
    || mintTransactionHashHex !== event.transactionHashHex
    || mintTransactionIndex !== event.transactionIndex
    || mintTransactionLogIndex >= event.transactionLogIndex
    || mintGlobalEventIndex >= event.globalEventIndex
    || mintFromAddressHex !== ZERO_ADDRESS
    || mintRecipientAddressHex !== event.recipientHex
    || mintAmount !== amount
  ) {
    throw new Error('Frontier mint-transition report does not bind the exact paired mint log');
  }

  const parentProofNodeCount = boundedInteger(
    transition.parentProofNodeCount,
    MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODES,
    'Frontier mint-transition parent proof-node count',
  );
  const parentProofBytes = boundedInteger(
    transition.parentProofBytes,
    MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES,
    'Frontier mint-transition parent proof bytes',
  );
  const expectedParentProofBytes = proofBytes(request.parentStateProofNodesHex);
  if (
    parentProofNodeCount !== request.parentStateProofNodesHex.length
    || parentProofBytes !== expectedParentProofBytes
  ) {
    throw new Error('Frontier mint-transition parent proof shape differs from the request');
  }
  const postNodes = executionRequest.runtimeStateProofNodesHex;
  const postProofNodeCount = boundedInteger(
    transition.postProofNodeCount,
    MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODES,
    'Frontier mint-transition post proof-node count',
  );
  const postProofBytes = boundedInteger(
    transition.postProofBytes,
    MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES,
    'Frontier mint-transition post proof bytes',
  );
  if (postProofNodeCount !== postNodes.length || postProofBytes !== proofBytes(postNodes)) {
    throw new Error('Frontier mint-transition post proof shape differs from the request');
  }
  literalTrue(transition.verified, 'Frontier mint-transition verification');

  return {
    parentRuntimeCodeSha256Hex,
    parentRuntimeCodeBytes,
    parentNativeProcessedRecordStorageKeyHex:
      request.statement.parentNativeProcessedRecordStorageKeyHex,
    parentProcessedPegIn: false,
    postProcessedPegIn: true,
    parentTokenTotalSupply,
    postTokenTotalSupply,
    tokenTotalSupplyDelta,
    recipientBalanceSlotHex: expectedBalanceSlot,
    recipientBalanceStorageKeyHex: request.statement.recipientBalanceStorageKeyHex,
    parentRecipientBalance,
    postRecipientBalance,
    recipientBalanceDelta,
    mintTokenAddressHex,
    mintTransactionHashHex,
    mintTransactionIndex,
    mintTransactionLogIndex,
    mintGlobalEventIndex,
    mintFromAddressHex: ZERO_ADDRESS,
    mintRecipientAddressHex,
    mintAmount,
    parentProofNodeCount,
    parentProofBytes,
    postProofNodeCount,
    postProofBytes,
    verified: true,
  };
}

function normalizeVerificationBoundary(value: unknown): void {
  const boundary = exactRecord(value, [
    'committedVaultTransitionVerified',
    'daemonAdmissionAuthorized',
    'directParentVerified',
    'exactMintDeltasVerified',
    'gate5Closed',
    'historicalMintAbsenceVerified',
    'mintAuthorized',
    'nativeVerifierExecutionAuthenticated',
    'pairedMintLogVerified',
    'prePostStateVerified',
    'productionReadinessVerified',
    'replayTransitionVerified',
    'reviewedDeploymentLineageVerified',
    'sidechainFinalityVerified',
    'singleTokenEffectVerified',
    'transactionMutationEnabled',
  ], 'Frontier mint-transition verification claim boundary');
  for (const field of [
    'sidechainFinalityVerified',
    'directParentVerified',
    'prePostStateVerified',
    'replayTransitionVerified',
    'exactMintDeltasVerified',
    'pairedMintLogVerified',
    'singleTokenEffectVerified',
  ] as const) {
    literalTrue(boundary[field], `Frontier mint-transition ${field} boundary`);
  }
  for (const field of [
    'nativeVerifierExecutionAuthenticated',
    'reviewedDeploymentLineageVerified',
    'committedVaultTransitionVerified',
    'historicalMintAbsenceVerified',
    'mintAuthorized',
    'daemonAdmissionAuthorized',
    'transactionMutationEnabled',
    'gate5Closed',
    'productionReadinessVerified',
  ] as const) {
    literalFalse(boundary[field], `Frontier mint-transition ${field} boundary`);
  }
}

function normalizeProofNodes(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must contain trie nodes`);
  }
  if (value.length > MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODES) {
    throw new Error(
      `${label} exceeds ${MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODES} nodes`,
    );
  }
  let totalBytes = 0;
  const nodes = value.map((node, index) => {
    const normalized = boundedByteHex(
      node,
      MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_NODE_BYTES,
      `${label} node ${index}`,
    );
    totalBytes += (normalized.length - 2) / 2;
    if (totalBytes > MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES) {
      throw new Error(
        `${label} exceeds ${MAX_PEG_IN_FRONTIER_EXECUTION_IDENTITY_V1_PROOF_BYTES} bytes`,
      );
    }
    return normalized;
  });
  if (new Set(nodes).size !== nodes.length) {
    throw new Error(`${label} contains duplicate trie nodes`);
  }
  return Object.freeze(nodes);
}

function proofBytes(nodes: readonly string[]): number {
  return nodes.reduce((total, node) => total + (node.length - 2) / 2, 0);
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has an unexpected field`);
  }
  return record;
}

function requireLiteral<T extends string | number>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) throw new Error(`${label} must be exactly ${expected}`);
  return expected;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^0x[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be exactly ${bytes} lowercase bytes`);
  }
  return value;
}

function boundedByteHex(value: unknown, maxBytes: number, label: string): string {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error(`${label} must be canonical non-empty lowercase byte hex`);
  }
  if ((value.length - 2) / 2 > maxBytes) throw new Error(`${label} exceeds ${maxBytes} bytes`);
  return value;
}

function positiveDecimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a canonical positive decimal string`);
  }
  return value;
}

function uint64Decimal(value: unknown, label: string): string {
  const normalized = unsignedDecimal(value, label);
  if (BigInt(normalized) > (1n << 64n) - 1n) throw new Error(`${label} exceeds uint64`);
  return normalized;
}

function uint256Decimal(value: unknown, label: string): string {
  const normalized = unsignedDecimal(value, label);
  if (BigInt(normalized) > (1n << 256n) - 1n) throw new Error(`${label} exceeds uint256`);
  return normalized;
}

function unsignedDecimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical unsigned decimal string`);
  }
  return value;
}

function boundedInteger(value: unknown, max: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > max) {
    throw new Error(`${label} must be a bounded non-negative integer`);
  }
  return value as number;
}

function literalTrue(value: unknown, label: string): true {
  if (value !== true) throw new Error(`${label} must remain true`);
  return true;
}

function literalFalse(value: unknown, label: string): false {
  if (value !== false) throw new Error(`${label} must remain false`);
  return false;
}

function blake2b256Hex(value: Buffer): string {
  return `0x${Buffer.from(blakejs.blake2b(value, undefined, 32)).toString('hex')}`;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
