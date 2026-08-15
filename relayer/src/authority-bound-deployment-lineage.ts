import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AbiCoder, Interface } from 'ethers';

import {
  assertNativeVerifiedBridgeCheckpointAuthorityExecutionProvenance,
  assertNativeVerifiedBridgeCheckpointProvenance,
  type NativeVerifiedBridgeCheckpoint,
} from './native-finalized-bridge-checkpoint.js';
import type {
  NativeVerifierExecutionAuthority,
} from './native-verifier-execution-authority.js';
import {
  assertDeploymentIdentityArtifactProfileProvenance,
  assertDeploymentIdentityCandidateProvenance,
  loadTrackedDeploymentIdentityArtifactProfile,
  type DeploymentIdentityArtifactProfile,
  type DeploymentIdentityCandidate,
} from './read-only-deployment-identity-observer.js';
import { validateReadOnlyNodeUrl } from './read-only-node-url.js';
import {
  assertReviewedDeploymentLineageProfileProvenance,
  type DeploymentLineageProfileV1,
} from './reviewed-deployment-lineage-profiles.js';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';

export const AUTHORITY_BOUND_DEPLOYMENT_LINEAGE_SCHEMA =
  'e2s.authority-bound-deployment-lineage-candidate.v1';
export const AUTHORITY_BOUND_DEPLOYMENT_LINEAGE_DIGEST_DOMAIN =
  'e2s.authority-bound-deployment-lineage-candidate.digest.v1';
export const MAX_DEPLOYMENT_LINEAGE_BLOCKS = 4_096;
export const MAX_DEPLOYMENT_LINEAGE_TRANSACTIONS = 100_000;
export const MAX_DEPLOYMENT_LINEAGE_LOGS = 100_000;
export const MAX_DEPLOYMENT_LINEAGE_TRANSACTIONS_PER_BLOCK = 2_048;
export const MAX_DEPLOYMENT_LINEAGE_RECEIPT_CONCURRENCY = 16;
export const MAX_DEPLOYMENT_LINEAGE_RPC_RESPONSE_BYTES = 4 * 1_024 * 1_024;
export const MAX_DEPLOYMENT_LINEAGE_RPC_TOTAL_RESPONSE_BYTES = 64 * 1_024 * 1_024;
export const MAX_DEPLOYMENT_LINEAGE_RPC_REQUESTS = 250_000;
export const MAX_DEPLOYMENT_LINEAGE_OBSERVATION_MS = 5 * 60_000;
export const MAX_DEPLOYMENT_LINEAGE_RPC_BYTE_FIELD_BYTES = 1 * 1_024 * 1_024;

const BUILD_MANIFEST_PATH = 'solidity/compiled/build-manifest.json';
const ZERO_ADDRESS = `0x${'00'.repeat(20)}`;
const CANDIDATES = new WeakSet<object>();
const ACTIVE_SOURCE_PAIRS = new WeakSet<object>();
const SOURCE_PAIRS = new WeakMap<object, Readonly<{
  primary: JsonRpcDeploymentLineageSource;
  witness: JsonRpcDeploymentLineageSource;
  sourceIdsHex: readonly string[];
}>>();

const tokenInterface = new Interface([
  'function owner() view returns (address)',
  'function totalSupply() view returns (uint256)',
  'function mint(address to,uint256 amount)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
  'event OwnershipTransferred(address indexed previousOwner,address indexed newOwner)',
]);
const bridgeInterface = new Interface([
  'function owner() view returns (address)',
  'function sergToken() view returns (address)',
  'function processedPegIns(bytes32) view returns (bool)',
  'event PegIn(address indexed to,uint256 amount,bytes32 ergoBoxId)',
  'event OwnershipTransferred(address indexed previousOwner,address indexed newOwner)',
]);
const directMintSelector = tokenInterface.getFunction('mint')!.selector.toLowerCase();

export interface DeploymentLineageSourcePair {
  readonly sourceIdsHex: readonly string[];
}

export interface CanonicalDeploymentLineageEvent {
  readonly kind: 'token_transfer' | 'token_ownership' | 'bridge_ownership' | 'bridge_peg_in';
  readonly blockHeight: string;
  readonly blockHashHex: string;
  readonly transactionHashHex: string;
  readonly transactionIndex: number;
  readonly logIndex: number;
  readonly fromAddress?: string;
  readonly toAddress?: string;
  readonly amount?: string;
  readonly ergoBoxIdHex?: string;
}

export interface DeploymentLineageBlockAssessment {
  readonly height: string;
  readonly hashHex: string;
  readonly parentHashHex: string;
  readonly transactionCount: number;
  readonly tokenCodeState: 'absent' | 'reviewed-runtime';
  readonly bridgeCodeState: 'absent' | 'reviewed-runtime';
  readonly tokenOwnerAddress: string | null;
  readonly bridgeOwnerAddress: string | null;
  readonly tokenTotalSupply: string;
  readonly events: readonly CanonicalDeploymentLineageEvent[];
  readonly observationDigestHex: string;
  readonly blockDigestHex: string;
}

export interface AuthorityBoundDeploymentLineageCandidate {
  readonly schema: typeof AUTHORITY_BOUND_DEPLOYMENT_LINEAGE_SCHEMA;
  readonly status: 'non_authorizing_candidate';
  readonly deploymentIdentityCandidateDigestHex: string;
  readonly artifactProfileDigestHex: string;
  readonly reviewedProfileDigestHex: string;
  readonly nativeFinalityStatementDigestHex: string;
  readonly nativeVerifierExecutionAuthorityDigestHex: string;
  readonly sourceAgreement: Readonly<{
    sourceCount: 2;
    sourceIdsHex: readonly string[];
    viewAgreementDigestHex: string;
  }>;
  readonly interval: Readonly<{
    startHeight: string;
    startBlockHashHex: string;
    terminalHeight: string;
    terminalExecutionBlockHashHex: string;
    blockCount: number;
  }>;
  readonly deployments: Readonly<{
    token: Readonly<{
      address: string;
      height: string;
      blockHashHex: string;
      transactionHashHex: string;
      creationBytecodeSha256Hex: string;
      runtimeBytecodeSha256Hex: string;
    }>;
    bridge: Readonly<{
      address: string;
      height: string;
      blockHashHex: string;
      transactionHashHex: string;
      creationBytecodeSha256Hex: string;
      runtimeBytecodeSha256Hex: string;
    }>;
  }>;
  readonly blocks: readonly DeploymentLineageBlockAssessment[];
  readonly totals: Readonly<{
    transactions: number;
    receiptLogs: number;
    relevantLogs: number;
    tokenMints: number;
    tokenBurns: number;
    tokenMintedAmount: string;
    tokenBurnedAmount: string;
    bridgePegIns: number;
    terminalTotalSupply: string;
  }>;
  readonly checks: Readonly<{
    sameProcessDeploymentIdentityProvenance: true;
    trackedArtifactClosureBound: true;
    reviewedProfileBound: true;
    nativeGrandpaFinalityBoundToTerminalExecutionHash: true;
    exactDeploymentCoordinatesVerified: true;
    contiguousEvmParentHashesVerified: true;
    continuousRuntimeIdentityVerified: true;
    ownerEventAndStateContinuityVerified: true;
    supplyTransferContinuityVerified: true;
    bridgeMintPairingAndReplayStateVerified: true;
    sourceRefreshedAuthorityExecutionProvenanceVerified: true;
    twoSourceBoundedObservationAgreementVerified: true;
  }>;
  readonly authority: Readonly<{
    historicalReceiptStateProofCompletenessProved: false;
    ergoAnchorAcceptanceProved: false;
    mintAuthorized: false;
    reconciliationHoldReleaseAuthorized: false;
    settlementAuthorized: false;
    signingAuthorized: false;
    submissionAuthorized: false;
    broadcastAuthorized: false;
    gate5Closed: false;
    productionReady: false;
  }>;
  readonly limitations: readonly string[];
  readonly candidateDigestHex: string;
}

interface JsonRpcTransaction {
  readonly hashHex: string;
  readonly blockHashHex: string;
  readonly blockHeight: bigint;
  readonly transactionIndex: number;
  readonly fromAddress: string;
  readonly toAddress: string | null;
  readonly inputHex: string;
}

interface JsonRpcLog {
  readonly address: string;
  readonly topics: readonly string[];
  readonly dataHex: string;
  readonly transactionHashHex: string;
  readonly blockHashHex: string;
  readonly blockHeight: bigint;
  readonly transactionIndex: number;
  readonly logIndex: number;
}

interface JsonRpcReceipt {
  readonly transactionHashHex: string;
  readonly blockHashHex: string;
  readonly blockHeight: bigint;
  readonly transactionIndex: number;
  readonly status: 0 | 1;
  readonly contractAddress: string | null;
  readonly logs: readonly JsonRpcLog[];
}

type JsonRpcReceiptMetadata = Omit<JsonRpcReceipt, 'logs'>;

interface CompactReceiptObservation {
  readonly metadata: JsonRpcReceiptMetadata;
  readonly relevantLogs: readonly JsonRpcLog[];
  readonly receiptObservationDigestHex: string;
}

interface JsonRpcBlock {
  readonly height: bigint;
  readonly hashHex: string;
  readonly parentHashHex: string;
  readonly transactions: readonly JsonRpcTransaction[];
}

interface JsonRpcDeploymentLineageSource {
  beginObservation(): void;
  cancelObservation(): void;
  endObservation(): void;
  getChainId(): Promise<bigint>;
  getBlockNumber(): Promise<bigint>;
  getBlockByNumber(height: bigint): Promise<JsonRpcBlock>;
  getTransactionByHash(hashHex: string): Promise<JsonRpcTransaction>;
  getTransactionReceipt(hashHex: string): Promise<JsonRpcReceipt>;
  getLogs(blockHashHex: string, addresses: readonly string[]): Promise<readonly JsonRpcLog[]>;
  getCode(address: string, block: JsonRpcBlock): Promise<string>;
  call(address: string, dataHex: string, block: JsonRpcBlock): Promise<string>;
}

interface TrackedCreationArtifacts {
  readonly tokenCreationBytecodeHex: string;
  readonly tokenCreationBytecodeSha256Hex: string;
  readonly bridgeCreationBytecodeHex: string;
  readonly bridgeCreationBytecodeSha256Hex: string;
}

interface SourceLineageView {
  readonly blocks: readonly DeploymentLineageBlockAssessment[];
  readonly totals: AuthorityBoundDeploymentLineageCandidate['totals'];
  readonly viewDigestHex: string;
}

export function createDeploymentLineageSourcePair(input: {
  primaryRpcUrl: string;
  witnessRpcUrl: string;
}): DeploymentLineageSourcePair {
  const primary = normalizeRpcOrigin(input.primaryRpcUrl, 'primary deployment-lineage RPC');
  const witness = normalizeRpcOrigin(input.witnessRpcUrl, 'witness deployment-lineage RPC');
  if (primary.canonicalOrigin === witness.canonicalOrigin) {
    throw new Error('deployment-lineage observation requires two distinct RPC origins');
  }
  const sourceIdsHex = Object.freeze([
    deploymentIdentitySourceId(primary.canonicalOrigin),
    deploymentIdentitySourceId(witness.canonicalOrigin),
  ].sort());
  const pair = Object.freeze({ sourceIdsHex });
  SOURCE_PAIRS.set(pair, Object.freeze({
    primary: createJsonRpcSource(primary.rpcUrl),
    witness: createJsonRpcSource(witness.rpcUrl),
    sourceIdsHex,
  }));
  return pair;
}

export async function observeAuthorityBoundDeploymentLineage(input: {
  bridgeRoot: string;
  deploymentIdentityCandidate: DeploymentIdentityCandidate;
  artifactProfile: DeploymentIdentityArtifactProfile;
  reviewedProfile: DeploymentLineageProfileV1;
  nativeCheckpoint: NativeVerifiedBridgeCheckpoint;
  nativeExecutionAuthority: NativeVerifierExecutionAuthority;
  sources: DeploymentLineageSourcePair;
}): Promise<AuthorityBoundDeploymentLineageCandidate> {
  assertDeploymentIdentityCandidateProvenance(input.deploymentIdentityCandidate);
  assertDeploymentIdentityArtifactProfileProvenance(input.artifactProfile);
  assertReviewedDeploymentLineageProfileProvenance(input.reviewedProfile);
  assertNativeVerifiedBridgeCheckpointProvenance(input.nativeCheckpoint);
  assertNativeVerifiedBridgeCheckpointAuthorityExecutionProvenance(
    input.nativeCheckpoint,
    input.nativeExecutionAuthority,
  );
  const sourcePair = sourcePairBinding(input.sources);
  assertInputBindings(input, sourcePair.sourceIdsHex);

  const refreshedArtifactProfile = loadTrackedDeploymentIdentityArtifactProfile(
    input.bridgeRoot,
  );
  if (refreshedArtifactProfile.profileDigestHex !== input.artifactProfile.profileDigestHex) {
    throw new Error('tracked artifact profile changed after deployment identity observation');
  }
  const creationArtifacts = loadTrackedCreationArtifacts(
    input.bridgeRoot,
    input.artifactProfile,
  );
  const [primaryView, witnessView] = await observeSourcePairLineage(
    input.sources,
    sourcePair,
    input,
    creationArtifacts,
  );
  if (primaryView.viewDigestHex !== witnessView.viewDigestHex) {
    throw new Error('deployment-lineage RPC sources disagree on the bounded normalized deciding view');
  }

  const profile = input.reviewedProfile;
  const sourceIdsHex = Object.freeze([...sourcePair.sourceIdsHex]);
  const sourceAgreement = deepFreeze({
    sourceCount: 2 as const,
    sourceIdsHex,
    viewAgreementDigestHex: digest({
      sourceIdsHex,
      viewDigestHex: primaryView.viewDigestHex,
    }, 'e2s.deployment-lineage-source-agreement.digest.v1'),
  });
  const interval = deepFreeze({
    startHeight: profile.interval.startHeight,
    startBlockHashHex: profile.interval.startBlockHashHex,
    terminalHeight: profile.interval.terminalHeight,
    terminalExecutionBlockHashHex: profile.interval.terminalExecutionBlockHashHex,
    blockCount: profile.interval.maximumBlockCount,
  });
  const deployments = deepFreeze({
    token: {
      address: profile.token.address,
      height: profile.token.deploymentHeight,
      blockHashHex: profile.token.deploymentBlockHashHex,
      transactionHashHex: profile.token.deploymentTransactionHashHex,
      creationBytecodeSha256Hex: creationArtifacts.tokenCreationBytecodeSha256Hex,
      runtimeBytecodeSha256Hex: input.artifactProfile.token.runtimeBytecodeSha256Hex,
    },
    bridge: {
      address: profile.bridge.address,
      height: profile.bridge.deploymentHeight,
      blockHashHex: profile.bridge.deploymentBlockHashHex,
      transactionHashHex: profile.bridge.deploymentTransactionHashHex,
      creationBytecodeSha256Hex: creationArtifacts.bridgeCreationBytecodeSha256Hex,
      runtimeBytecodeSha256Hex: input.artifactProfile.bridge.runtimeBytecodeSha256Hex,
    },
  });
  const checks = deepFreeze({
    sameProcessDeploymentIdentityProvenance: true as const,
    trackedArtifactClosureBound: true as const,
    reviewedProfileBound: true as const,
    nativeGrandpaFinalityBoundToTerminalExecutionHash: true as const,
    exactDeploymentCoordinatesVerified: true as const,
    contiguousEvmParentHashesVerified: true as const,
    continuousRuntimeIdentityVerified: true as const,
    ownerEventAndStateContinuityVerified: true as const,
    supplyTransferContinuityVerified: true as const,
    bridgeMintPairingAndReplayStateVerified: true as const,
    sourceRefreshedAuthorityExecutionProvenanceVerified: true as const,
    twoSourceBoundedObservationAgreementVerified: true as const,
  });
  const authority = deepFreeze({
    historicalReceiptStateProofCompletenessProved: false as const,
    ergoAnchorAcceptanceProved: false as const,
    mintAuthorized: false as const,
    reconciliationHoldReleaseAuthorized: false as const,
    settlementAuthorized: false as const,
    signingAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
    gate5Closed: false as const,
    productionReady: false as const,
  });
  const limitations = Object.freeze([
    'two-source bounded normalized observation agreement plus a finalized terminal execution hash does not cryptographically prove receipt or state completeness for the historical interval',
    'the reviewed Substrate genesis binding is source-owned profile context rather than a historical EVM state proof',
    'Ergo extension anchoring and on-chain acceptance remain unproved',
    'this read-only candidate cannot authorize mint, hold release, settlement, signing, submission, or broadcast',
  ]);
  const binding = {
    schema: AUTHORITY_BOUND_DEPLOYMENT_LINEAGE_SCHEMA,
    status: 'non_authorizing_candidate' as const,
    deploymentIdentityCandidateDigestHex:
      input.deploymentIdentityCandidate.candidateDigestHex,
    artifactProfileDigestHex: input.artifactProfile.profileDigestHex,
    reviewedProfileDigestHex: profile.profileDigestHex,
    nativeFinalityStatementDigestHex:
      input.nativeCheckpoint.finalityStatement.statementDigestHex,
    nativeVerifierExecutionAuthorityDigestHex: digest(
      input.nativeExecutionAuthority.declaration,
      'e2s.deployment-lineage-native-execution-authority.digest.v1',
    ),
    sourceAgreement,
    interval,
    deployments,
    blocks: primaryView.blocks,
    totals: primaryView.totals,
    checks,
    authority,
    limitations,
  } as const;
  const candidate = deepFreeze({
    ...binding,
    candidateDigestHex: digest(binding, AUTHORITY_BOUND_DEPLOYMENT_LINEAGE_DIGEST_DOMAIN),
  }) as AuthorityBoundDeploymentLineageCandidate;
  CANDIDATES.add(candidate);
  return candidate;
}

export function assertAuthorityBoundDeploymentLineageProvenance(
  value: unknown,
): asserts value is AuthorityBoundDeploymentLineageCandidate {
  if (!value || typeof value !== 'object' || !CANDIDATES.has(value)) {
    throw new Error('authority-bound deployment-lineage provenance is missing');
  }
}

function assertInputBindings(
  input: Parameters<typeof observeAuthorityBoundDeploymentLineage>[0],
  sourceIdsHex: readonly string[],
): void {
  const candidate = input.deploymentIdentityCandidate;
  const profile = input.reviewedProfile;
  const view = candidate.view;
  if (
    view.artifactProfileDigestHex !== input.artifactProfile.profileDigestHex
    || view.buildManifestSha256Hex !== input.artifactProfile.buildManifestSha256Hex
  ) {
    throw new Error('deployment identity candidate does not bind the supplied artifact profile');
  }
  if (JSON.stringify([...candidate.sourceAgreement.sourceIdsHex].sort()) !== JSON.stringify(sourceIdsHex)) {
    throw new Error('deployment-lineage sources differ from the provenance-bound deployment identity sources');
  }
  if (
    view.declaredNetworkScope !== profile.declaredNetworkScope
    || view.chainId !== profile.evmChainId
    || view.bridgeAddress !== profile.bridge.address
    || view.tokenAddress !== profile.token.address
    || view.bridgeTokenAddress !== profile.token.address
    || view.tipHeight !== profile.interval.terminalHeight
    || prefixed(view.tipHashHex) !== profile.interval.terminalExecutionBlockHashHex
  ) {
    throw new Error('deployment identity terminal view does not match the reviewed lineage profile');
  }
  const checkpoint = input.nativeCheckpoint.nativeVerification;
  if (
    checkpoint.trustAnchorDigestHex !== profile.nativeGrandpaTrust.trustedAnchorDigestHex
    || input.nativeCheckpoint.finalityStatement.trustedAnchorDigestHex
      !== profile.nativeGrandpaTrust.trustedAnchorDigestHex.slice(2)
    || checkpoint.commitment.sidechainIdHex !== profile.sidechainIdHex
    || checkpoint.commitment.sidechainHeight !== profile.interval.terminalHeight
    || checkpoint.commitment.executionBlockHashHex
      !== profile.interval.terminalExecutionBlockHashHex
    || input.nativeCheckpoint.boundary.sidechainFinalityVerified !== true
  ) {
    throw new Error('native finalized checkpoint does not bind the reviewed terminal execution target');
  }
}

async function observeSourcePairLineage(
  pair: DeploymentLineageSourcePair,
  sourcePair: Readonly<{
    primary: JsonRpcDeploymentLineageSource;
    witness: JsonRpcDeploymentLineageSource;
  }>,
  input: Parameters<typeof observeAuthorityBoundDeploymentLineage>[0],
  artifacts: TrackedCreationArtifacts,
): Promise<readonly [SourceLineageView, SourceLineageView]> {
  if (ACTIVE_SOURCE_PAIRS.has(pair)) {
    throw new Error('deployment-lineage source pair already has an active observation');
  }
  ACTIVE_SOURCE_PAIRS.add(pair);
  let firstFailure: unknown;
  let failed = false;
  const run = async (
    source: JsonRpcDeploymentLineageSource,
    peer: JsonRpcDeploymentLineageSource,
  ): Promise<SourceLineageView> => {
    try {
      return await observeSourceLineage(source, input, artifacts);
    } catch (error) {
      if (!failed) {
        firstFailure = error;
        failed = true;
      }
      peer.cancelObservation();
      throw error;
    }
  };
  try {
    const [primary, witness] = await Promise.allSettled([
      run(sourcePair.primary, sourcePair.witness),
      run(sourcePair.witness, sourcePair.primary),
    ]);
    if (failed) throw firstFailure;
    if (primary.status !== 'fulfilled' || witness.status !== 'fulfilled') {
      throw new Error('deployment-lineage source observation failed without an error');
    }
    return Object.freeze([primary.value, witness.value]);
  } finally {
    sourcePair.primary.cancelObservation();
    sourcePair.witness.cancelObservation();
    ACTIVE_SOURCE_PAIRS.delete(pair);
  }
}

async function observeSourceLineage(
  source: JsonRpcDeploymentLineageSource,
  input: Parameters<typeof observeAuthorityBoundDeploymentLineage>[0],
  artifacts: TrackedCreationArtifacts,
): Promise<SourceLineageView> {
  source.beginObservation();
  try {
    return await observeSourceLineageWithinActiveBudget(source, input, artifacts);
  } catch (error) {
    source.cancelObservation();
    throw error;
  } finally {
    source.endObservation();
  }
}

async function observeSourceLineageWithinActiveBudget(
  source: JsonRpcDeploymentLineageSource,
  input: Parameters<typeof observeAuthorityBoundDeploymentLineage>[0],
  artifacts: TrackedCreationArtifacts,
): Promise<SourceLineageView> {
  const profile = input.reviewedProfile;
  const expectedChainId = BigInt(profile.evmChainId);
  if (await source.getChainId() !== expectedChainId) {
    throw new Error('deployment-lineage source chain ID differs from the reviewed profile');
  }
  const terminalHeight = BigInt(profile.interval.terminalHeight);
  const headHeightBefore = await source.getBlockNumber();
  if (headHeightBefore < terminalHeight) {
    throw new Error('deployment-lineage source head does not cover the reviewed terminal height');
  }

  const blocks: JsonRpcBlock[] = [];
  let totalTransactions = 0;
  for (
    let height = BigInt(profile.interval.startHeight);
    height <= terminalHeight;
    height += 1n
  ) {
    const block = await source.getBlockByNumber(height);
    if (block.height !== height) throw new Error('deployment-lineage block height differs from its request');
    if (blocks.length > 0 && block.parentHashHex !== blocks.at(-1)!.hashHex) {
      throw new Error('deployment-lineage history contains a parent-hash gap or reordering');
    }
    if (block.transactions.length > MAX_DEPLOYMENT_LINEAGE_TRANSACTIONS_PER_BLOCK) {
      throw new Error(
        `deployment-lineage block transaction count exceeds ${MAX_DEPLOYMENT_LINEAGE_TRANSACTIONS_PER_BLOCK}`,
      );
    }
    totalTransactions += block.transactions.length;
    if (totalTransactions > MAX_DEPLOYMENT_LINEAGE_TRANSACTIONS) {
      throw new Error(
        `deployment-lineage transaction count exceeds ${MAX_DEPLOYMENT_LINEAGE_TRANSACTIONS}`,
      );
    }
    blocks.push(block);
  }
  if (
    blocks.length !== profile.interval.maximumBlockCount
    || blocks[0].hashHex !== profile.interval.startBlockHashHex
    || blocks.at(-1)!.hashHex !== profile.interval.terminalExecutionBlockHashHex
  ) {
    throw new Error('deployment-lineage block interval does not reach the exact terminal execution hash');
  }
  const tokenHeight = BigInt(profile.token.deploymentHeight);
  const bridgeHeight = BigInt(profile.bridge.deploymentHeight);
  let previousTokenOwner: string | null = null;
  let previousBridgeOwner: string | null = null;
  let previousSupply = 0n;
  let totalReceiptLogs = 0;
  let totalRelevantLogs = 0;
  let tokenMints = 0;
  let tokenBurns = 0;
  let tokenMintedAmount = 0n;
  let tokenBurnedAmount = 0n;
  let bridgePegIns = 0;
  const receiptIdentities = new Set<string>();
  const logIdentities = new Set<string>();
  const pegInBoxIds = new Set<string>();
  const assessments: DeploymentLineageBlockAssessment[] = [];

  for (const block of blocks) {
    const receiptObservations = await mapWithConcurrency(
      block.transactions,
      MAX_DEPLOYMENT_LINEAGE_RECEIPT_CONCURRENCY,
      async transaction => {
        const receipt = await source.getTransactionReceipt(transaction.hashHex);
        assertReceiptMatchesTransaction(receipt, transaction);
        if (receiptIdentities.has(receipt.transactionHashHex)) {
          throw new Error('deployment-lineage repeats a receipt identity');
        }
        receiptIdentities.add(receipt.transactionHashHex);
        for (const log of receipt.logs) {
          const identity = `${log.transactionHashHex}:${log.logIndex}`;
          if (logIdentities.has(identity)) {
            throw new Error('deployment-lineage repeats a log identity');
          }
          logIdentities.add(identity);
        }
        totalReceiptLogs += receipt.logs.length;
        if (totalReceiptLogs > MAX_DEPLOYMENT_LINEAGE_LOGS) {
          throw new Error(
            `deployment-lineage receipt log count exceeds ${MAX_DEPLOYMENT_LINEAGE_LOGS}`,
          );
        }
        return compactReceiptObservation(receipt, profile);
      },
      () => source.cancelObservation(),
    );
    const relevantReceiptLogs = receiptObservations.flatMap(
      observation => observation.relevantLogs,
    );
    for (const observation of receiptObservations) {
      if (
        observation.metadata.status !== 1
        && observation.relevantLogs.length > 0
      ) {
        throw new Error('deployment-lineage receipt carrying relevant logs did not succeed');
      }
    }
    const indexedLogs = await source.getLogs(block.hashHex, [
      profile.token.address,
      profile.bridge.address,
    ]);
    if (canonicalRpcJson(relevantReceiptLogs) !== canonicalRpcJson(indexedLogs)) {
      throw new Error('deployment-lineage indexed logs disagree with complete block receipt logs');
    }
    totalRelevantLogs += relevantReceiptLogs.length;

    for (let index = 0; index < block.transactions.length; index += 1) {
      const transaction = block.transactions[index];
      const receipt = receiptObservations[index].metadata;
      if (
        receipt.status === 1
        && transaction.toAddress === profile.token.address
        && transaction.inputHex.startsWith(directMintSelector)
      ) {
        throw new Error('successful top-level direct SERG.mint call is forbidden');
      }
    }

    const tokenExpected = block.height >= tokenHeight;
    const bridgeExpected = block.height >= bridgeHeight;
    const [tokenCode, bridgeCode] = await mapWithConcurrency(
      [profile.token.address, profile.bridge.address],
      2,
      address => source.getCode(address, block),
      () => source.cancelObservation(),
    );
    assertCodeState(
      tokenCode,
      tokenExpected,
      input.artifactProfile.token.runtimeBytecodeHex,
      'token',
    );
    assertCodeState(
      bridgeCode,
      bridgeExpected,
      input.artifactProfile.bridge.runtimeBytecodeHex,
      'bridge',
    );
    if (block.height === tokenHeight) {
      await assertDeploymentTransaction({
        source,
        block,
        receipt: receiptObservations.find(candidate =>
          candidate.metadata.transactionHashHex
            === profile.token.deploymentTransactionHashHex)?.metadata,
        coordinate: profile.token,
        expectedInputHex: artifacts.tokenCreationBytecodeHex,
        label: 'token',
      });
    }
    if (block.height === bridgeHeight) {
      const constructorArguments = AbiCoder.defaultAbiCoder().encode(
        ['address'],
        [profile.token.address],
      ).slice(2);
      await assertDeploymentTransaction({
        source,
        block,
        receipt: receiptObservations.find(candidate =>
          candidate.metadata.transactionHashHex
            === profile.bridge.deploymentTransactionHashHex)?.metadata,
        coordinate: profile.bridge,
        expectedInputHex: `${artifacts.bridgeCreationBytecodeHex}${constructorArguments}`,
        label: 'bridge',
      });
    }

    const events = relevantReceiptLogs
      .map(log => decodeRelevantEvent(log, profile))
      .filter((event): event is CanonicalDeploymentLineageEvent => event !== null)
      .sort(compareEvents);
    const tokenOwnershipEvents = events.filter(event => event.kind === 'token_ownership');
    const bridgeOwnershipEvents = events.filter(event => event.kind === 'bridge_ownership');
    const tokenTransferEvents = events.filter(event => event.kind === 'token_transfer');
    const pegIns = events.filter(event => event.kind === 'bridge_peg_in');

    const tokenOwnerResultHex = tokenExpected
      ? await source.call(
        profile.token.address,
        tokenInterface.encodeFunctionData('owner'),
        block,
      )
      : null;
    const tokenOwner = tokenOwnerResultHex === null
      ? null
      : decodeAddress(tokenOwnerResultHex, 'token owner state', true);
    const bridgeOwnerResultHex = bridgeExpected
      ? await source.call(
        profile.bridge.address,
        bridgeInterface.encodeFunctionData('owner'),
        block,
      )
      : null;
    const bridgeOwner = bridgeOwnerResultHex === null
      ? null
      : decodeAddress(bridgeOwnerResultHex, 'bridge owner state', true);
    let bridgeTokenResultHex: string | null = null;
    if (bridgeExpected) {
      bridgeTokenResultHex = await source.call(
        profile.bridge.address,
        bridgeInterface.encodeFunctionData('sergToken'),
        block,
      );
      const binding = decodeAddress(bridgeTokenResultHex, 'bridge token binding');
      if (binding !== profile.token.address) {
        throw new Error('historical bridge sergToken binding drifted from the reviewed token');
      }
    }
    const tokenTotalSupplyResultHex = tokenExpected
      ? await source.call(
        profile.token.address,
        tokenInterface.encodeFunctionData('totalSupply'),
        block,
      )
      : null;
    const tokenTotalSupply = tokenTotalSupplyResultHex === null
      ? 0n
      : decodeUint(tokenTotalSupplyResultHex, 'token totalSupply state');
    previousTokenOwner = assertOwnerContinuity({
      previousOwner: previousTokenOwner,
      events: tokenOwnershipEvents,
      postStateOwner: tokenOwner,
      deployedNow: block.height === tokenHeight,
      label: 'token',
    });
    previousBridgeOwner = assertOwnerContinuity({
      previousOwner: previousBridgeOwner,
      events: bridgeOwnershipEvents,
      postStateOwner: bridgeOwner,
      deployedNow: block.height === bridgeHeight,
      label: 'bridge',
    });
    const supplyDelta = tokenTransferEvents.reduce((delta, event) => {
      const amount = BigInt(event.amount!);
      if (event.fromAddress === ZERO_ADDRESS) {
        tokenMints += 1;
        tokenMintedAmount += amount;
        return delta + amount;
      }
      if (event.toAddress === ZERO_ADDRESS) {
        tokenBurns += 1;
        tokenBurnedAmount += amount;
        return delta - amount;
      }
      return delta;
    }, 0n);
    if (previousSupply + supplyDelta !== tokenTotalSupply) {
      throw new Error('token totalSupply delta disagrees with mint and burn Transfer events');
    }
    previousSupply = tokenTotalSupply;
    const processedPegInState = await assertMintPegInPairing(
      source,
      block,
      tokenTransferEvents,
      pegIns,
      profile,
    );
    for (const pegIn of pegIns) {
      if (pegInBoxIds.has(pegIn.ergoBoxIdHex!)) {
        throw new Error('deployment-lineage repeats a PegIn Ergo box ID');
      }
      pegInBoxIds.add(pegIn.ergoBoxIdHex!);
    }
    bridgePegIns += pegIns.length;

    const observationDigestHex = digest(toCanonicalRpcValue({
      block,
      receiptObservations: receiptObservations.map(observation => ({
        transactionHashHex: observation.metadata.transactionHashHex,
        receiptObservationDigestHex: observation.receiptObservationDigestHex,
      })),
      indexedRelevantLogs: indexedLogs,
      code: { tokenCode, bridgeCode },
      stateResults: {
        tokenOwnerResultHex,
        bridgeOwnerResultHex,
        bridgeTokenResultHex,
        tokenTotalSupplyResultHex,
        processedPegInState,
      },
    }), 'e2s.deployment-lineage-block-observation.digest.v1');
    const semantic = {
      height: block.height.toString(),
      hashHex: block.hashHex,
      parentHashHex: block.parentHashHex,
      transactionCount: block.transactions.length,
      tokenCodeState: tokenExpected ? 'reviewed-runtime' as const : 'absent' as const,
      bridgeCodeState: bridgeExpected ? 'reviewed-runtime' as const : 'absent' as const,
      tokenOwnerAddress: tokenOwner,
      bridgeOwnerAddress: bridgeOwner,
      tokenTotalSupply: tokenTotalSupply.toString(),
      events,
      observationDigestHex,
    };
    assessments.push(deepFreeze({
      ...semantic,
      blockDigestHex: digest(semantic, 'e2s.deployment-lineage-block.digest.v1'),
    }));
  }

  const terminal = assessments.at(-1)!;
  if (
    terminal.tokenOwnerAddress !== input.deploymentIdentityCandidate.view.tokenOwnerAddress
    || terminal.bridgeOwnerAddress !== input.deploymentIdentityCandidate.view.bridgeOwnerAddress
  ) {
    throw new Error('deployment-lineage terminal owners differ from the T19 deployment identity');
  }
  const headHeightAfter = await source.getBlockNumber();
  if (headHeightAfter < terminalHeight) {
    throw new Error('deployment-lineage source head rolled back below the reviewed terminal height');
  }
  const terminalAfter = await source.getBlockByNumber(terminalHeight);
  if (terminalAfter.hashHex !== blocks.at(-1)!.hashHex) {
    throw new Error('deployment-lineage terminal block changed during bounded reconstruction');
  }
  if (await source.getChainId() !== expectedChainId) {
    throw new Error('deployment-lineage source chain ID changed during reconstruction');
  }
  const totals = deepFreeze({
    transactions: totalTransactions,
    receiptLogs: totalReceiptLogs,
    relevantLogs: totalRelevantLogs,
    tokenMints,
    tokenBurns,
    tokenMintedAmount: tokenMintedAmount.toString(),
    tokenBurnedAmount: tokenBurnedAmount.toString(),
    bridgePegIns,
    terminalTotalSupply: previousSupply.toString(),
  });
  const semantic = deepFreeze({ blocks: assessments, totals });
  return deepFreeze({
    ...semantic,
    viewDigestHex: digest(semantic, 'e2s.deployment-lineage-view.digest.v1'),
  });
}

async function assertDeploymentTransaction(input: {
  source: JsonRpcDeploymentLineageSource;
  block: JsonRpcBlock;
  receipt: JsonRpcReceiptMetadata | undefined;
  coordinate: DeploymentLineageProfileV1['token'];
  expectedInputHex: string;
  label: string;
}): Promise<void> {
  if (input.block.hashHex !== input.coordinate.deploymentBlockHashHex) {
    throw new Error(`${input.label} deployment block hash differs from the reviewed coordinate`);
  }
  const transaction = await input.source.getTransactionByHash(
    input.coordinate.deploymentTransactionHashHex,
  );
  const receipt = input.receipt;
  const blockTransaction = input.block.transactions.find(
    candidate => candidate.hashHex === transaction.hashHex,
  );
  if (
    !blockTransaction
    || !receipt
    || canonicalRpcJson(transaction) !== canonicalRpcJson(blockTransaction)
    || transaction.blockHeight !== input.block.height
    || transaction.blockHashHex !== input.block.hashHex
    || transaction.toAddress !== null
    || transaction.inputHex !== input.expectedInputHex
    || receipt.status !== 1
    || receipt.contractAddress !== input.coordinate.address
  ) {
    throw new Error(`${input.label} deployment transaction or receipt is not the exact reviewed creation`);
  }
  assertReceiptMatchesTransaction(receipt, transaction);
}

function assertCodeState(
  observed: string,
  expectedPresent: boolean,
  expectedRuntime: string,
  label: string,
): void {
  if (!expectedPresent && observed !== '0x') {
    throw new Error(`${label} code exists before its reviewed deployment`);
  }
  if (expectedPresent && observed !== expectedRuntime) {
    throw new Error(`${label} runtime code disappeared, changed, or reverted`);
  }
}

function assertReceiptMatchesTransaction(
  receipt: JsonRpcReceiptMetadata,
  transaction: JsonRpcTransaction,
): void {
  if (
    receipt.transactionHashHex !== transaction.hashHex
    || receipt.blockHashHex !== transaction.blockHashHex
    || receipt.blockHeight !== transaction.blockHeight
    || receipt.transactionIndex !== transaction.transactionIndex
  ) {
    throw new Error('deployment-lineage receipt identity differs from its block transaction');
  }
}

function compactReceiptObservation(
  receipt: JsonRpcReceipt,
  profile: DeploymentLineageProfileV1,
): CompactReceiptObservation {
  return deepFreeze({
    metadata: {
      transactionHashHex: receipt.transactionHashHex,
      blockHashHex: receipt.blockHashHex,
      blockHeight: receipt.blockHeight,
      transactionIndex: receipt.transactionIndex,
      status: receipt.status,
      contractAddress: receipt.contractAddress,
    },
    relevantLogs: receipt.logs.filter(log =>
      log.address === profile.token.address || log.address === profile.bridge.address),
    receiptObservationDigestHex: digest(
      toCanonicalRpcValue(receipt),
      'e2s.deployment-lineage-receipt-observation.digest.v1',
    ),
  });
}

function decodeRelevantEvent(
  log: JsonRpcLog,
  profile: DeploymentLineageProfileV1,
): CanonicalDeploymentLineageEvent | null {
  const topic = log.topics[0];
  let parsed: ReturnType<Interface['parseLog']> | null = null;
  let kind: CanonicalDeploymentLineageEvent['kind'] | null = null;
  try {
    if (log.address === profile.token.address && topic === tokenInterface.getEvent('Transfer')!.topicHash.toLowerCase()) {
      parsed = tokenInterface.parseLog({ topics: [...log.topics], data: log.dataHex });
      kind = 'token_transfer';
    } else if (
      log.address === profile.token.address
      && topic === tokenInterface.getEvent('OwnershipTransferred')!.topicHash.toLowerCase()
    ) {
      parsed = tokenInterface.parseLog({ topics: [...log.topics], data: log.dataHex });
      kind = 'token_ownership';
    } else if (
      log.address === profile.bridge.address
      && topic === bridgeInterface.getEvent('OwnershipTransferred')!.topicHash.toLowerCase()
    ) {
      parsed = bridgeInterface.parseLog({ topics: [...log.topics], data: log.dataHex });
      kind = 'bridge_ownership';
    } else if (
      log.address === profile.bridge.address
      && topic === bridgeInterface.getEvent('PegIn')!.topicHash.toLowerCase()
    ) {
      parsed = bridgeInterface.parseLog({ topics: [...log.topics], data: log.dataHex });
      kind = 'bridge_peg_in';
    } else {
      return null;
    }
  } catch {
    throw new Error('deployment-lineage relevant event log is malformed');
  }
  if (!parsed || !kind) throw new Error('deployment-lineage relevant event log is malformed');
  const base = {
    kind,
    blockHeight: log.blockHeight.toString(),
    blockHashHex: log.blockHashHex,
    transactionHashHex: log.transactionHashHex,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
  };
  if (kind === 'token_transfer') {
    return deepFreeze({
      ...base,
      fromAddress: canonicalAddress(parsed.args.from, 'Transfer from', true),
      toAddress: canonicalAddress(parsed.args.to, 'Transfer to', true),
      amount: positiveOrZeroBigInt(parsed.args.value, 'Transfer amount').toString(),
    });
  }
  if (kind === 'token_ownership' || kind === 'bridge_ownership') {
    return deepFreeze({
      ...base,
      fromAddress: canonicalAddress(parsed.args.previousOwner, 'ownership previous owner', true),
      toAddress: canonicalAddress(parsed.args.newOwner, 'ownership new owner', true),
    });
  }
  return deepFreeze({
    ...base,
    toAddress: canonicalAddress(parsed.args.to, 'PegIn recipient'),
    amount: positiveBigInt(parsed.args.amount, 'PegIn amount').toString(),
    ergoBoxIdHex: fixedHex(parsed.args.ergoBoxId, 32, 'PegIn Ergo box ID'),
  });
}

function assertOwnerContinuity(input: {
  previousOwner: string | null;
  events: readonly CanonicalDeploymentLineageEvent[];
  postStateOwner: string | null;
  deployedNow: boolean;
  label: string;
}): string | null {
  if (input.postStateOwner === null) {
    if (input.events.length > 0 || input.previousOwner !== null) {
      throw new Error(`${input.label} ownership exists before deployment`);
    }
    return null;
  }
  let owner = input.previousOwner;
  if (input.deployedNow) owner = ZERO_ADDRESS;
  if (owner === null) throw new Error(`${input.label} ownership state appeared without deployment`);
  for (const event of input.events) {
    if (event.fromAddress !== owner) {
      throw new Error(`${input.label} OwnershipTransferred continuity is broken`);
    }
    owner = event.toAddress!;
  }
  if (input.deployedNow && input.events.length === 0) {
    throw new Error(`${input.label} deployment lacks its initial ownership event`);
  }
  if (owner !== input.postStateOwner) {
    throw new Error(`${input.label} owner post-state disagrees with ownership events`);
  }
  return owner;
}

async function assertMintPegInPairing(
  source: JsonRpcDeploymentLineageSource,
  block: JsonRpcBlock,
  transfers: readonly CanonicalDeploymentLineageEvent[],
  pegIns: readonly CanonicalDeploymentLineageEvent[],
  profile: DeploymentLineageProfileV1,
): Promise<readonly Readonly<{
  ergoBoxIdHex: string;
  encodedStateHex: string;
}>[]> {
  const mints = transfers.filter(event => event.fromAddress === ZERO_ADDRESS);
  if (mints.length !== pegIns.length) {
    throw new Error('token mint count does not match bridge PegIn count');
  }
  const usedPegIns = new Set<number>();
  for (const mint of mints) {
    const matches = pegIns.map((event, index) => ({ event, index })).filter(({ event }) =>
      event.transactionHashHex === mint.transactionHashHex
      && event.toAddress === mint.toAddress
      && event.amount === mint.amount
      && !usedPegIns.has(event.logIndex));
    if (matches.length !== 1) {
      throw new Error('token mint is not paired one-to-one with an exact same-transaction PegIn');
    }
    usedPegIns.add(matches[0].event.logIndex);
  }
  const processedState: Array<Readonly<{
    ergoBoxIdHex: string;
    encodedStateHex: string;
  }>> = [];
  for (const pegIn of pegIns) {
    const encoded = await source.call(
      profile.bridge.address,
      bridgeInterface.encodeFunctionData('processedPegIns', [pegIn.ergoBoxIdHex]),
      block,
    );
    if (!decodeBoolean(encoded, 'processedPegIns state')) {
      throw new Error('bridge PegIn is not retained in processedPegIns at its post-state block');
    }
    processedState.push(deepFreeze({
      ergoBoxIdHex: pegIn.ergoBoxIdHex!,
      encodedStateHex: encoded,
    }));
  }
  return Object.freeze(processedState);
}

function createJsonRpcSource(rpcUrl: string): JsonRpcDeploymentLineageSource {
  let requestId = 0;
  let observationDeadlineUnixMs = 0;
  let observationRequestCount = 0;
  let observationResponseBytes = 0;
  let observationAbortController: AbortController | null = null;
  async function request(method: string, params: readonly unknown[]): Promise<unknown> {
    const observation = observationAbortController;
    if (observationDeadlineUnixMs === 0 || observation === null) {
      throw new Error('deployment-lineage RPC observation budget is not active');
    }
    observationRequestCount += 1;
    if (observationRequestCount > MAX_DEPLOYMENT_LINEAGE_RPC_REQUESTS) {
      throw new Error(
        `deployment-lineage RPC request count exceeds ${MAX_DEPLOYMENT_LINEAGE_RPC_REQUESTS}`,
      );
    }
    const remainingMs = observationDeadlineUnixMs - Date.now();
    if (remainingMs <= 0) {
      throw new Error('deployment-lineage RPC observation exceeded its operation deadline');
    }
    const id = ++requestId;
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      redirect: 'error',
      signal: AbortSignal.any([
        observation.signal,
        AbortSignal.timeout(Math.min(10_000, remainingMs)),
      ]),
    });
    if (!response.ok) throw new Error(`read-only deployment-lineage RPC ${method} failed with HTTP ${response.status}`);
    const boundedResponse = await readBoundedRpcJson(response, method, byteLength => {
      observationResponseBytes += byteLength;
      if (observationResponseBytes > MAX_DEPLOYMENT_LINEAGE_RPC_TOTAL_RESPONSE_BYTES) {
        observation.abort();
        throw new Error(
          `deployment-lineage RPC responses exceed ${MAX_DEPLOYMENT_LINEAGE_RPC_TOTAL_RESPONSE_BYTES} total bytes`,
        );
      }
    });
    const body = record(
      boundedResponse.value,
      `deployment-lineage RPC ${method} response`,
    );
    if (Date.now() > observationDeadlineUnixMs) {
      throw new Error('deployment-lineage RPC observation exceeded its operation deadline');
    }
    if (body.jsonrpc !== '2.0' || body.id !== id) {
      throw new Error(`deployment-lineage RPC ${method} returned a mismatched envelope`);
    }
    if (body.error !== undefined || !Object.hasOwn(body, 'result')) {
      throw new Error(`deployment-lineage RPC ${method} returned an error`);
    }
    return body.result;
  }
  return Object.freeze({
    beginObservation() {
      if (observationAbortController !== null) {
        throw new Error('deployment-lineage RPC source already has an active observation');
      }
      observationRequestCount = 0;
      observationResponseBytes = 0;
      observationDeadlineUnixMs = Date.now()
        + MAX_DEPLOYMENT_LINEAGE_OBSERVATION_MS;
      observationAbortController = new AbortController();
    },
    cancelObservation() {
      observationAbortController?.abort();
    },
    endObservation() {
      observationAbortController = null;
      observationDeadlineUnixMs = 0;
      observationRequestCount = 0;
      observationResponseBytes = 0;
    },
    async getChainId() {
      return quantity(await request('eth_chainId', []), 'deployment-lineage chain ID');
    },
    async getBlockNumber() {
      return quantity(await request('eth_blockNumber', []), 'deployment-lineage block number');
    },
    async getBlockByNumber(height: bigint) {
      return normalizeBlock(
        await request('eth_getBlockByNumber', [quantityHex(height), true]),
        'deployment-lineage block',
      );
    },
    async getTransactionByHash(hashHex: string) {
      return normalizeTransaction(
        await request('eth_getTransactionByHash', [hashHex]),
        'deployment-lineage transaction',
      );
    },
    async getTransactionReceipt(hashHex: string) {
      return normalizeReceipt(
        await request('eth_getTransactionReceipt', [hashHex]),
        'deployment-lineage receipt',
      );
    },
    async getLogs(blockHashHex: string, addresses: readonly string[]) {
      const value = await request('eth_getLogs', [{
        blockHash: blockHashHex,
        address: addresses,
      }]);
      if (!Array.isArray(value)) throw new Error('deployment-lineage log result must be an array');
      return Object.freeze(value.map((entry, index) => normalizeLog(
        entry,
        `deployment-lineage indexed log ${index}`,
      )).sort(compareRpcLogs));
    },
    async getCode(address: string, block: JsonRpcBlock) {
      return bytes(await request('eth_getCode', [address, blockSelector(block)]), 'deployment-lineage code', true);
    },
    async call(address: string, dataHex: string, block: JsonRpcBlock) {
      return bytes(await request('eth_call', [
        { to: address, data: dataHex },
        blockSelector(block),
      ]), 'deployment-lineage call result', false);
    },
  });
}

async function readBoundedRpcJson(
  response: Response,
  method: string,
  chargeResponseBytes: (byteLength: number) => void,
): Promise<Readonly<{ value: unknown }>> {
  const declaredLength = response.headers.get('content-length');
  if (
    declaredLength !== null
    && /^\d+$/.test(declaredLength)
    && BigInt(declaredLength) > BigInt(MAX_DEPLOYMENT_LINEAGE_RPC_RESPONSE_BYTES)
  ) {
    throw new Error(
      `deployment-lineage RPC ${method} response exceeds ${MAX_DEPLOYMENT_LINEAGE_RPC_RESPONSE_BYTES} bytes`,
    );
  }
  if (!response.body) {
    throw new Error(`deployment-lineage RPC ${method} response body is missing`);
  }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = Buffer.from(next.value);
      byteLength += chunk.length;
      chargeResponseBytes(chunk.length);
      if (byteLength > MAX_DEPLOYMENT_LINEAGE_RPC_RESPONSE_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The size violation remains the deciding error.
        }
        throw new Error(
          `deployment-lineage RPC ${method} response exceeds ${MAX_DEPLOYMENT_LINEAGE_RPC_RESPONSE_BYTES} bytes`,
        );
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return Object.freeze({
      value: JSON.parse(Buffer.concat(chunks, byteLength).toString('utf8')) as unknown,
    });
  } catch {
    throw new Error(`deployment-lineage RPC ${method} response is not valid JSON`);
  }
}

function normalizeBlock(value: unknown, label: string): JsonRpcBlock {
  const raw = record(value, label);
  if (!Array.isArray(raw.transactions)) throw new Error(`${label} transactions must be an array`);
  const height = quantity(raw.number, `${label} number`);
  const hashHex = fixedHex(raw.hash, 32, `${label} hash`);
  const transactions = raw.transactions.map((entry, index) => {
    const transaction = normalizeTransaction(entry, `${label} transaction ${index}`);
    if (
      transaction.blockHeight !== height
      || transaction.blockHashHex !== hashHex
      || transaction.transactionIndex !== index
    ) {
      throw new Error(`${label} transaction identity is not canonical for the block`);
    }
    return transaction;
  });
  return deepFreeze({
    height,
    hashHex,
    parentHashHex: fixedHex(raw.parentHash, 32, `${label} parent hash`),
    transactions,
  });
}

function normalizeTransaction(value: unknown, label: string): JsonRpcTransaction {
  const raw = record(value, label);
  return deepFreeze({
    hashHex: fixedHex(raw.hash, 32, `${label} hash`),
    blockHashHex: fixedHex(raw.blockHash, 32, `${label} block hash`),
    blockHeight: quantity(raw.blockNumber, `${label} block number`),
    transactionIndex: safeRpcIndex(raw.transactionIndex, `${label} index`),
    fromAddress: canonicalAddress(raw.from, `${label} from`),
    toAddress: raw.to === null ? null : canonicalAddress(raw.to, `${label} to`),
    inputHex: bytes(raw.input ?? raw.data, `${label} input`, true),
  });
}

function normalizeReceipt(value: unknown, label: string): JsonRpcReceipt {
  const raw = record(value, label);
  if (!Array.isArray(raw.logs)) throw new Error(`${label} logs must be an array`);
  const receipt = deepFreeze({
    transactionHashHex: fixedHex(raw.transactionHash, 32, `${label} transaction hash`),
    blockHashHex: fixedHex(raw.blockHash, 32, `${label} block hash`),
    blockHeight: quantity(raw.blockNumber, `${label} block number`),
    transactionIndex: safeRpcIndex(raw.transactionIndex, `${label} transaction index`),
    status: receiptStatus(raw.status, `${label} status`),
    contractAddress: raw.contractAddress === null
      ? null
      : canonicalAddress(raw.contractAddress, `${label} contract address`),
    logs: raw.logs.map((entry, index) => normalizeLog(entry, `${label} log ${index}`))
      .sort(compareRpcLogs),
  });
  for (const log of receipt.logs) {
    if (
      log.transactionHashHex !== receipt.transactionHashHex
      || log.blockHashHex !== receipt.blockHashHex
      || log.blockHeight !== receipt.blockHeight
      || log.transactionIndex !== receipt.transactionIndex
    ) {
      throw new Error(`${label} contains a log with mismatched receipt identity`);
    }
  }
  return receipt;
}

function normalizeLog(value: unknown, label: string): JsonRpcLog {
  const raw = record(value, label);
  if (raw.removed !== false) throw new Error(`${label} must be canonical and non-removed`);
  if (!Array.isArray(raw.topics) || raw.topics.length < 1 || raw.topics.length > 4) {
    throw new Error(`${label} topics are malformed`);
  }
  return deepFreeze({
    address: canonicalAddress(raw.address, `${label} address`),
    topics: raw.topics.map((topic, index) => fixedHex(topic, 32, `${label} topic ${index}`)),
    dataHex: bytes(raw.data, `${label} data`, true),
    transactionHashHex: fixedHex(raw.transactionHash, 32, `${label} transaction hash`),
    blockHashHex: fixedHex(raw.blockHash, 32, `${label} block hash`),
    blockHeight: quantity(raw.blockNumber, `${label} block number`),
    transactionIndex: safeRpcIndex(raw.transactionIndex, `${label} transaction index`),
    logIndex: safeRpcIndex(raw.logIndex, `${label} log index`),
  });
}

function loadTrackedCreationArtifacts(
  bridgeRoot: string,
  artifactProfile: DeploymentIdentityArtifactProfile,
): TrackedCreationArtifacts {
  const manifestBytes = readRequiredFile(resolve(bridgeRoot, BUILD_MANIFEST_PATH), 'Solidity build manifest');
  if (sha256(manifestBytes) !== artifactProfile.buildManifestSha256Hex) {
    throw new Error('Solidity build manifest differs from the provenance-bound artifact profile');
  }
  const manifest = record(parseJson(manifestBytes, 'Solidity build manifest'), 'Solidity build manifest');
  const contracts = record(manifest.contracts, 'Solidity build manifest contracts');
  const token = loadCreationArtifact(bridgeRoot, contracts, 'SERG', 'compiled/SERG.bin');
  const bridge = loadCreationArtifact(bridgeRoot, contracts, 'ErgoBridge', 'compiled/ErgoBridge.bin');
  return deepFreeze({
    tokenCreationBytecodeHex: token.bytecodeHex,
    tokenCreationBytecodeSha256Hex: token.sha256Hex,
    bridgeCreationBytecodeHex: bridge.bytecodeHex,
    bridgeCreationBytecodeSha256Hex: bridge.sha256Hex,
  });
}

function loadCreationArtifact(
  bridgeRoot: string,
  contracts: Record<string, unknown>,
  contract: string,
  expectedPath: string,
): { bytecodeHex: string; sha256Hex: string } {
  const contractRecord = record(contracts[contract], `${contract} build record`);
  const creation = record(contractRecord.creationBytecode, `${contract} creation record`);
  if (creation.path !== expectedPath) throw new Error(`${contract} creation artifact path is unsupported`);
  const file = readRequiredFile(resolve(bridgeRoot, 'solidity', expectedPath), `${contract} creation artifact`);
  const text = file.toString('utf8');
  if (!/^[0-9a-f]+$/.test(text) || text.length % 2 !== 0) {
    throw new Error(`${contract} creation artifact is not canonical lowercase hex`);
  }
  const decoded = Buffer.from(text, 'hex');
  if (
    creation.bytecodeByteLength !== decoded.length
    || creation.bytecodeSha256Hex !== sha256(decoded)
  ) {
    throw new Error(`${contract} creation artifact differs from the tracked build manifest`);
  }
  return { bytecodeHex: `0x${text}`, sha256Hex: sha256(decoded) };
}

function sourcePairBinding(pair: unknown) {
  if (!pair || typeof pair !== 'object') throw new Error('deployment-lineage source-pair provenance is missing');
  const binding = SOURCE_PAIRS.get(pair);
  if (!binding) throw new Error('deployment-lineage source-pair provenance is missing');
  return binding;
}

function normalizeRpcOrigin(raw: string, label: string) {
  const validation = validateReadOnlyNodeUrl(raw, label);
  if (validation.length > 0) throw new Error(validation.join('; '));
  const parsed = new URL(raw);
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${label} must be an HTTP(S) origin without path, query, or fragment`);
  }
  const port = parsed.port || (parsed.protocol === 'http:' ? '80' : '443');
  return {
    rpcUrl: parsed.toString(),
    canonicalOrigin: `${parsed.protocol}//${parsed.hostname.toLowerCase()}:${port}`,
  };
}

function deploymentIdentitySourceId(canonicalOrigin: string): string {
  return sha256CanonicalJson({
    schema: 'e2s.deployment-identity-source.v1',
    canonicalOrigin,
  });
}

function blockSelector(block: JsonRpcBlock) {
  return { blockHash: block.hashHex, requireCanonical: true as const };
}

function decodeAddress(value: unknown, label: string, allowZero = false): string {
  const encoded = bytes(value, `${label} result`, false);
  if (!/^0x0{24}[0-9a-f]{40}$/.test(encoded)) {
    throw new Error(`${label} must return one ABI address`);
  }
  return canonicalAddress(`0x${encoded.slice(-40)}`, label, allowZero);
}

function decodeUint(value: unknown, label: string): bigint {
  const encoded = bytes(value, `${label} result`, false);
  if (!/^0x[0-9a-f]{64}$/.test(encoded)) throw new Error(`${label} must return one ABI uint256`);
  return BigInt(encoded);
}

function decodeBoolean(value: unknown, label: string): boolean {
  const parsed = decodeUint(value, label);
  if (parsed !== 0n && parsed !== 1n) throw new Error(`${label} must return one ABI boolean`);
  return parsed === 1n;
}

function canonicalAddress(value: unknown, label: string, allowZero = false): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${label} must be a 20-byte address`);
  }
  const normalized = value.toLowerCase();
  if (!allowZero && normalized === ZERO_ADDRESS) throw new Error(`${label} must not be zero`);
  return normalized;
}

function fixedHex(value: unknown, byteLength: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^0x[0-9a-fA-F]{${byteLength * 2}}$`).test(value)) {
    throw new Error(`${label} must be exactly ${byteLength} bytes of hex`);
  }
  return value.toLowerCase();
}

function prefixed(value: string): string {
  return value.startsWith('0x') ? value.toLowerCase() : `0x${value.toLowerCase()}`;
}

function bytes(value: unknown, label: string, allowEmpty: boolean): string {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
    throw new Error(`${label} must be even-length hex bytes`);
  }
  const normalized = value.toLowerCase();
  if (!allowEmpty && normalized === '0x') throw new Error(`${label} must not be empty`);
  if ((normalized.length - 2) / 2 > MAX_DEPLOYMENT_LINEAGE_RPC_BYTE_FIELD_BYTES) {
    throw new Error(
      `${label} exceeds ${MAX_DEPLOYMENT_LINEAGE_RPC_BYTE_FIELD_BYTES} bytes`,
    );
  }
  return normalized;
}

function quantity(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value)) {
    throw new Error(`${label} must be a canonical JSON-RPC quantity`);
  }
  return BigInt(value);
}

function quantityHex(value: bigint): string {
  if (value < 0n) throw new Error('JSON-RPC quantity must be nonnegative');
  return `0x${value.toString(16)}`;
}

function safeRpcIndex(value: unknown, label: string): number {
  const parsed = quantity(value, label);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} exceeds safe integer`);
  return Number(parsed);
}

function receiptStatus(value: unknown, label: string): 0 | 1 {
  const parsed = quantity(value, label);
  if (parsed !== 0n && parsed !== 1n) throw new Error(`${label} is unsupported`);
  return Number(parsed) as 0 | 1;
}

function positiveBigInt(value: unknown, label: string): bigint {
  const parsed = positiveOrZeroBigInt(value, label);
  if (parsed === 0n) throw new Error(`${label} must be positive`);
  return parsed;
}

function positiveOrZeroBigInt(value: unknown, label: string): bigint {
  try {
    const parsed = BigInt(value as bigint | string | number);
    if (parsed < 0n) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${label} must be a nonnegative integer`);
  }
}

function compareEvents(
  left: CanonicalDeploymentLineageEvent,
  right: CanonicalDeploymentLineageEvent,
): number {
  return left.transactionIndex - right.transactionIndex || left.logIndex - right.logIndex;
}

function compareRpcLogs(left: JsonRpcLog, right: JsonRpcLog): number {
  return left.transactionIndex - right.transactionIndex || left.logIndex - right.logIndex;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readRequiredFile(path: string, label: string): Buffer {
  try {
    return readFileSync(path);
  } catch {
    throw new Error(`${label} could not be read`);
  }
}

function parseJson(value: Buffer, label: string): unknown {
  try {
    return JSON.parse(value.toString('utf8')) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function digest(value: unknown, domain: string): string {
  return `0x${sha256CanonicalJson(value, domain)}`;
}

function canonicalRpcJson(value: unknown): string {
  return canonicalJson(toCanonicalRpcValue(value));
}

function toCanonicalRpcValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(toCanonicalRpcValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(
      ([key, nested]) => [key, toCanonicalRpcValue(nested)],
    ));
  }
  return value;
}

async function mapWithConcurrency<T, U>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<U>,
  onFailure?: () => void,
): Promise<U[]> {
  const results = new Array<U>(values.length);
  let cursor = 0;
  let failure: unknown;
  let failed = false;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (!failed && cursor < values.length) {
        const index = cursor;
        cursor += 1;
        try {
          results[index] = await mapper(values[index]);
        } catch (error) {
          if (!failed) {
            failure = error;
            failed = true;
            onFailure?.();
          }
        }
      }
    },
  );
  await Promise.all(workers);
  if (failed) throw failure;
  return results;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
