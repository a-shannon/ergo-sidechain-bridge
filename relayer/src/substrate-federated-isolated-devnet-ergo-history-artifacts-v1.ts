import { createHash } from 'node:crypto';

import {
  assertErgoBlockTransactionCommitmentVerificationProvenance,
  assertErgoSignedTransactionSemanticsVerificationProvenance,
  verifyErgoBlockTransactionCommitment,
  verifyErgoSignedTransactionSemantics,
} from './adapters/ergo-block-transaction-commitment.js';
import { snapshotJsonData } from './adapters/json-data-snapshot.js';
import {
  normalizeErgoNodeHeaderBytes,
} from './adapters/ergo-utxo-state-runtime-witness-capture-port-v1.js';
import {
  AuthenticatedSpvTrackerReadOnlyNodeClient,
  normalizeAuthenticatedSpvTrackerNodeNetwork,
} from './authenticated-spv-tracker-read-only-node-client.js';
import {
  decodeErgoCompactDifficulty,
} from './ergo-settlement-core/ergo-autolykos-v2-header.js';
import {
  computeErgoHeaderId,
  parseErgoHeaderIdentity,
} from './ergo-settlement-core/ergo-header-id.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_UTXO_HISTORY_V1_SCHEMA,
} from './substrate-federated-isolated-devnet-portable-replay-v1.js';
import {
  assertSubstrateFederatedRewardInputDiscoveryV1Provenance,
  assertSubstrateFederatedRewardInputDiscoveryV2Provenance,
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  type SubstrateFederatedRewardInputDiscoveryV1,
  type SubstrateFederatedRewardInputDiscoveryV2,
} from './substrate-federated-isolated-devnet-reward-input-discovery-v1.js';
import {
  normalizeEip12Box,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_ARTIFACTS_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-ergo-history-artifacts.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_ARTIFACTS_V2_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-ergo-history-artifacts.v2' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HEADERS_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-ergo-headers.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_TRANSACTIONS_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-ergo-transactions.v1' as const;

const REPORT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_ARTIFACTS_V1';
const REPORT_V2_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_ARTIFACTS_V2';
const MAX_HEADER_COUNT = 4_096;
const REPORTS = new WeakSet<object>();
const REPORTS_V2 = new WeakSet<object>();

type GenesisRole = 'tracker' | 'duplicatePrevention' | 'pooledReserve';

interface ByteArtifactV1 {
  readonly sha256Hex: string;
  readonly sizeBytes: number;
}

export interface SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1 {
  readonly receipt: Readonly<{
    readonly schema:
      typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_ARTIFACTS_V1_SCHEMA;
    readonly version: 1;
    readonly status: 'matching_non_authorizing_ergo_history';
    readonly reportDigestHex: string;
    readonly observedAt: string;
    readonly rewardInputDiscoveryDigestHex: string;
    readonly sources: Readonly<{
      readonly primaryNodeOrigin:
        typeof SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN;
      readonly witnessNodeOrigin:
        typeof SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN;
    }>;
    readonly target: Readonly<{
      readonly network: 'devnet';
      readonly genesisHeaderIdHex: string;
      readonly genesisHeight: 1;
      readonly setupAnchorHeaderIdHex: string;
      readonly setupAnchorHeight: number;
      readonly headerCount: number;
    }>;
    readonly genesisBoxIds: Readonly<Record<GenesisRole, string>>;
    readonly artifacts: Readonly<{
      readonly greatestWorkHeaders: Readonly<ByteArtifactV1>;
      readonly transactions: Readonly<ByteArtifactV1>;
      readonly utxoTransitions: Readonly<ByteArtifactV1>;
    }>;
    readonly checks: Readonly<{
      readonly exactProcessOwnedRewardDiscoveryConsumed: true;
      readonly fixedDualLoopbackSourcesMatched: true;
      readonly completeReportedBestChainCollected: true;
      readonly canonicalHeaderIdsRecomputed: true;
      readonly contiguousParentLineageRecomputed: true;
      readonly selectedTransactionRootsRecomputed: true;
      readonly selectedSignedTransactionBytesReparsed: true;
      readonly selectedOutputsMatchedExactGenesisBoxes: true;
      readonly selectedUtxosStableAcrossCollection: true;
      readonly canonicalManifestBytesProduced: true;
    }>;
    readonly boundaries: Readonly<{
      readonly nodeReportedBestChainIsObservationOnly: true;
      readonly targetBinaryRevalidationRequired: true;
      readonly headerDifficultyTransitionsAuthenticated: false;
      readonly claimedProofOfWorkVerified: false;
      readonly globallyGreatestWorkEstablished: false;
      readonly tipAndUtxoObservedAtomically: false;
      readonly nodeExecutableIdentityAuthenticated: false;
      readonly independentNodeControlVerified: false;
      readonly historicalRouteNonInstantiationAuthenticated: false;
      readonly ergoConsensusIndependentlyAuthenticated: false;
    }>;
    readonly authorization: Readonly<{
      readonly constructSetup: false;
      readonly check: false;
      readonly sign: false;
      readonly submit: false;
      readonly broadcast: false;
      readonly activate: false;
      readonly fundsAuthority: false;
      readonly gate5Closed: false;
      readonly productionReady: false;
    }>;
  }>;
  readonly artifacts: Readonly<{
    readonly greatestWorkHeadersManifest: string;
    readonly transactionsManifest: string;
    readonly utxoTransitionsManifest: string;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2 {
  readonly receipt: Readonly<{
    readonly schema:
      typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_ARTIFACTS_V2_SCHEMA;
    readonly version: 2;
    readonly status: 'matching_non_authorizing_snapshot_anchored_ergo_history';
    readonly reportDigestHex: string;
    readonly observedAt: string;
    readonly rewardInputDiscoveryDigestHex: string;
    readonly sources: SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1['receipt']['sources'];
    readonly target: SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1['receipt']['target'];
    readonly genesisBoxIds: Readonly<Record<GenesisRole, string>>;
    readonly artifacts: SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1['receipt']['artifacts'];
    readonly checks: Readonly<{
      readonly exactProcessOwnedSnapshotAnchoredRewardDiscoveryConsumed: true;
      readonly fixedDualLoopbackAnchorArtifactsMatched: true;
      readonly discoveryAnchorRetainedAcrossCanonicalExtension: true;
      readonly completeDiscoveryAnchorChainCollected: true;
      readonly canonicalHeaderIdsRecomputed: true;
      readonly contiguousParentLineageRecomputed: true;
      readonly selectedTransactionRootsRecomputed: true;
      readonly selectedSignedTransactionBytesReparsed: true;
      readonly selectedOutputsMatchedExactGenesisBoxes: true;
      readonly selectedUtxosStableAcrossCollection: true;
      readonly canonicalManifestBytesProduced: true;
    }>;
    readonly boundaries: Readonly<{
      readonly nodeReportedCanonicalExtensionIsObservationOnly: true;
      readonly movingTipExcludedFromArtifactIdentity: true;
      readonly targetBinaryRevalidationRequired: true;
      readonly headerDifficultyTransitionsAuthenticated: false;
      readonly claimedProofOfWorkVerified: false;
      readonly globallyGreatestWorkEstablished: false;
      readonly tipAndUtxoObservedAtomically: false;
      readonly nodeExecutableIdentityAuthenticated: false;
      readonly independentNodeControlVerified: false;
      readonly historicalRouteNonInstantiationAuthenticated: false;
      readonly ergoConsensusIndependentlyAuthenticated: false;
    }>;
    readonly authorization: SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1['receipt']['authorization'];
  }>;
  readonly artifacts: SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1['artifacts'];
}

type RewardInputDiscovery =
  | Readonly<SubstrateFederatedRewardInputDiscoveryV1>
  | Readonly<SubstrateFederatedRewardInputDiscoveryV2>;

interface HeaderRowV1 {
  readonly height: number;
  readonly headerIdHex: string;
  readonly parentHeaderIdHex: string;
  readonly canonicalHeaderBytesHex: string;
  readonly version: number;
  readonly timestampMs: string;
  readonly nBits: number;
  readonly declaredDifficulty: string;
}

interface TargetSnapshotV1 {
  readonly network: 'devnet';
  readonly tipHeight: number;
  readonly tipHeaderIdHex: string;
}

interface SourceHistoryV1 {
  readonly snapshot: TargetSnapshotV1;
  readonly headersManifest: Readonly<Record<string, unknown>>;
  readonly transactionsManifest: Readonly<Record<string, unknown>>;
  readonly utxoTransitionsManifest: Readonly<Record<string, unknown>>;
}

/**
 * Materializes the three Ergo history roles required by the portable packet.
 * Dual-node agreement and local byte verification remain federated evidence;
 * they do not establish global Ergo fork choice or funds authority.
 */
export async function collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1(
  discovery: Readonly<SubstrateFederatedRewardInputDiscoveryV1>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1>> {
  assertSubstrateFederatedRewardInputDiscoveryV1Provenance(discovery);
  const primary = new AuthenticatedSpvTrackerReadOnlyNodeClient(
    SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  );
  const witness = new AuthenticatedSpvTrackerReadOnlyNodeClient(
    SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  );
  const [primaryHistory, witnessHistory] = await Promise.all([
    observeSource(primary, discovery),
    observeSource(witness, discovery),
  ]);
  if (canonicalJson(primaryHistory) !== canonicalJson(witnessHistory)) {
    throw new Error('fixed dual-loopback Ergo history observations disagree');
  }

  const artifacts = Object.freeze({
    greatestWorkHeadersManifest: manifestText(primaryHistory.headersManifest),
    transactionsManifest: manifestText(primaryHistory.transactionsManifest),
    utxoTransitionsManifest: manifestText(
      primaryHistory.utxoTransitionsManifest,
    ),
  });
  const artifactBindings = Object.freeze({
    greatestWorkHeaders: artifact(artifacts.greatestWorkHeadersManifest),
    transactions: artifact(artifacts.transactionsManifest),
    utxoTransitions: artifact(artifacts.utxoTransitionsManifest),
  });
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_ARTIFACTS_V1_SCHEMA,
    version: 1 as const,
    status: 'matching_non_authorizing_ergo_history' as const,
    observedAt: new Date().toISOString(),
    rewardInputDiscoveryDigestHex: discovery.reportDigestHex,
    sources: {
      primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
      witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
    },
    target: {
      network: 'devnet' as const,
      genesisHeaderIdHex: discovery.target.genesisHeaderIdHex,
      genesisHeight: 1 as const,
      setupAnchorHeaderIdHex: primaryHistory.snapshot.tipHeaderIdHex,
      setupAnchorHeight: primaryHistory.snapshot.tipHeight,
      headerCount: primaryHistory.snapshot.tipHeight,
    },
    genesisBoxIds: { ...discovery.genesisBoxIds },
    artifacts: artifactBindings,
    checks: {
      exactProcessOwnedRewardDiscoveryConsumed: true as const,
      fixedDualLoopbackSourcesMatched: true as const,
      completeReportedBestChainCollected: true as const,
      canonicalHeaderIdsRecomputed: true as const,
      contiguousParentLineageRecomputed: true as const,
      selectedTransactionRootsRecomputed: true as const,
      selectedSignedTransactionBytesReparsed: true as const,
      selectedOutputsMatchedExactGenesisBoxes: true as const,
      selectedUtxosStableAcrossCollection: true as const,
      canonicalManifestBytesProduced: true as const,
    },
    boundaries: {
      nodeReportedBestChainIsObservationOnly: true as const,
      targetBinaryRevalidationRequired: true as const,
      headerDifficultyTransitionsAuthenticated: false as const,
      claimedProofOfWorkVerified: false as const,
      globallyGreatestWorkEstablished: false as const,
      tipAndUtxoObservedAtomically: false as const,
      nodeExecutableIdentityAuthenticated: false as const,
      independentNodeControlVerified: false as const,
      historicalRouteNonInstantiationAuthenticated: false as const,
      ergoConsensusIndependentlyAuthenticated: false as const,
    },
    authorization: falseAuthorization(),
  };
  const receipt = deepFreeze({
    ...body,
    reportDigestHex: sha256CanonicalJson(body, REPORT_DIGEST_DOMAIN),
  });
  const result = Object.freeze({ receipt, artifacts });
  REPORTS.add(result);
  return result;
}

export function assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1> {
  if (value === null || typeof value !== 'object' || !REPORTS.has(value)) {
    throw new Error('isolated-devnet Ergo history artifacts lack process provenance');
  }
  const result = value as SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1;
  const { reportDigestHex, ...body } = result.receipt;
  if (
    result.receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_ARTIFACTS_V1_SCHEMA
    || result.receipt.version !== 1
    || sha256CanonicalJson(body, REPORT_DIGEST_DOMAIN) !== reportDigestHex
  ) {
    throw new Error('isolated-devnet Ergo history receipt content drifted');
  }
  assertArtifact(
    result.artifacts.greatestWorkHeadersManifest,
    result.receipt.artifacts.greatestWorkHeaders,
    'greatest-work header history',
  );
  assertArtifact(
    result.artifacts.transactionsManifest,
    result.receipt.artifacts.transactions,
    'transaction history',
  );
  assertArtifact(
    result.artifacts.utxoTransitionsManifest,
    result.receipt.artifacts.utxoTransitions,
    'UTXO history',
  );
}

export async function collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2(
  discovery: Readonly<SubstrateFederatedRewardInputDiscoveryV2>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2>> {
  assertSubstrateFederatedRewardInputDiscoveryV2Provenance(discovery);
  const primary = new AuthenticatedSpvTrackerReadOnlyNodeClient(
    SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  );
  const witness = new AuthenticatedSpvTrackerReadOnlyNodeClient(
    SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  );
  const [primaryHistory, witnessHistory] = await Promise.all([
    observeSourceV2(primary, discovery),
    observeSourceV2(witness, discovery),
  ]);
  if (canonicalJson(primaryHistory) !== canonicalJson(witnessHistory)) {
    throw new Error(
      'fixed dual-loopback snapshot-anchor history artifacts disagree',
    );
  }

  const artifacts = Object.freeze({
    greatestWorkHeadersManifest: manifestText(primaryHistory.headersManifest),
    transactionsManifest: manifestText(primaryHistory.transactionsManifest),
    utxoTransitionsManifest: manifestText(
      primaryHistory.utxoTransitionsManifest,
    ),
  });
  const artifactBindings = Object.freeze({
    greatestWorkHeaders: artifact(artifacts.greatestWorkHeadersManifest),
    transactions: artifact(artifacts.transactionsManifest),
    utxoTransitions: artifact(artifacts.utxoTransitionsManifest),
  });
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_ARTIFACTS_V2_SCHEMA,
    version: 2 as const,
    status: 'matching_non_authorizing_snapshot_anchored_ergo_history' as const,
    observedAt: new Date().toISOString(),
    rewardInputDiscoveryDigestHex: discovery.reportDigestHex,
    sources: {
      primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
      witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
    },
    target: {
      network: 'devnet' as const,
      genesisHeaderIdHex: discovery.target.genesisHeaderIdHex,
      genesisHeight: 1 as const,
      setupAnchorHeaderIdHex: primaryHistory.snapshot.tipHeaderIdHex,
      setupAnchorHeight: primaryHistory.snapshot.tipHeight,
      headerCount: primaryHistory.snapshot.tipHeight,
    },
    genesisBoxIds: { ...discovery.genesisBoxIds },
    artifacts: artifactBindings,
    checks: {
      exactProcessOwnedSnapshotAnchoredRewardDiscoveryConsumed: true as const,
      fixedDualLoopbackAnchorArtifactsMatched: true as const,
      discoveryAnchorRetainedAcrossCanonicalExtension: true as const,
      completeDiscoveryAnchorChainCollected: true as const,
      canonicalHeaderIdsRecomputed: true as const,
      contiguousParentLineageRecomputed: true as const,
      selectedTransactionRootsRecomputed: true as const,
      selectedSignedTransactionBytesReparsed: true as const,
      selectedOutputsMatchedExactGenesisBoxes: true as const,
      selectedUtxosStableAcrossCollection: true as const,
      canonicalManifestBytesProduced: true as const,
    },
    boundaries: {
      nodeReportedCanonicalExtensionIsObservationOnly: true as const,
      movingTipExcludedFromArtifactIdentity: true as const,
      targetBinaryRevalidationRequired: true as const,
      headerDifficultyTransitionsAuthenticated: false as const,
      claimedProofOfWorkVerified: false as const,
      globallyGreatestWorkEstablished: false as const,
      tipAndUtxoObservedAtomically: false as const,
      nodeExecutableIdentityAuthenticated: false as const,
      independentNodeControlVerified: false as const,
      historicalRouteNonInstantiationAuthenticated: false as const,
      ergoConsensusIndependentlyAuthenticated: false as const,
    },
    authorization: falseAuthorization(),
  };
  const receipt = deepFreeze({
    ...body,
    reportDigestHex: sha256CanonicalJson(body, REPORT_V2_DIGEST_DOMAIN),
  });
  const result = Object.freeze({ receipt, artifacts });
  REPORTS_V2.add(result);
  return result;
}

export function assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2> {
  if (value === null || typeof value !== 'object' || !REPORTS_V2.has(value)) {
    throw new Error(
      'snapshot-anchored Ergo history artifacts lack process provenance',
    );
  }
  const result = value as SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2;
  const { reportDigestHex, ...body } = result.receipt;
  if (
    result.receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_ARTIFACTS_V2_SCHEMA
    || result.receipt.version !== 2
    || sha256CanonicalJson(body, REPORT_V2_DIGEST_DOMAIN) !== reportDigestHex
  ) {
    throw new Error('snapshot-anchored Ergo history receipt content drifted');
  }
  assertArtifact(
    result.artifacts.greatestWorkHeadersManifest,
    result.receipt.artifacts.greatestWorkHeaders,
    'snapshot-anchored greatest-work header history',
  );
  assertArtifact(
    result.artifacts.transactionsManifest,
    result.receipt.artifacts.transactions,
    'snapshot-anchored transaction history',
  );
  assertArtifact(
    result.artifacts.utxoTransitionsManifest,
    result.receipt.artifacts.utxoTransitions,
    'snapshot-anchored UTXO history',
  );
}

async function observeSource(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  discovery: Readonly<SubstrateFederatedRewardInputDiscoveryV1>,
): Promise<Readonly<SourceHistoryV1>> {
  client.beginAuthenticatedTrackerReconstruction();
  try {
    const before = await observeSnapshot(client, discovery);
    const beforeBoxes = await revalidateSelectedBoxes(client, discovery);
    const headers = await collectHeaderChain(client, discovery, before);
    const transactionHistory = await collectSelectedTransactions(
      client,
      discovery,
      headers,
    );
    const afterBoxes = await revalidateSelectedBoxes(client, discovery);
    if (canonicalJson(beforeBoxes) !== canonicalJson(afterBoxes)) {
      throw new Error('selected reward UTXOs changed during Ergo history collection');
    }
    const after = await observeSnapshot(client, discovery);
    if (canonicalJson(before) !== canonicalJson(after)) {
      throw new Error('fixed Ergo target changed during history collection');
    }
    const cumulativeDeclaredDifficulty = headers.reduce(
      (sum, header) => sum + BigInt(header.declaredDifficulty),
      0n,
    ).toString();
    const headersManifest = deepFreeze({
      schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HEADERS_V1_SCHEMA,
      version: 1,
      network: 'devnet',
      selection: 'matching-dual-node-reported-best-chain',
      firstHeight: 1,
      lastHeight: before.tipHeight,
      genesisHeaderIdHex: discovery.target.genesisHeaderIdHex,
      setupAnchorHeaderIdHex: before.tipHeaderIdHex,
      cumulativeDeclaredDifficulty,
      headers,
      boundaries: {
        headerIdsAndParentsRecomputed: true,
        difficultyValuesDecodedOnly: true,
        difficultyTransitionsAuthenticated: false,
        proofOfWorkVerified: false,
        globalForkChoiceEstablished: false,
      },
    });
    const transactionsManifest = deepFreeze({
      schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_TRANSACTIONS_V1_SCHEMA,
      version: 1,
      genesisBoxIds: { ...discovery.genesisBoxIds },
      ...transactionHistory,
    });
    const utxoTransitionsManifest = deepFreeze({
      schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_UTXO_HISTORY_V1_SCHEMA,
      version: 1,
      genesisInputs: beforeBoxes,
    });
    return deepFreeze({
      snapshot: before,
      headersManifest,
      transactionsManifest,
      utxoTransitionsManifest,
    });
  } finally {
    client.endAuthenticatedTrackerReconstruction();
  }
}

async function observeSourceV2(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  discovery: Readonly<SubstrateFederatedRewardInputDiscoveryV2>,
): Promise<Readonly<SourceHistoryV1>> {
  client.beginAuthenticatedTrackerReconstruction();
  try {
    const anchor = discoverySnapshot(discovery);
    const before = await observeSnapshotV2(client);
    await assertCanonicalAnchor(client, anchor, before);
    const beforeBoxes = await revalidateSelectedBoxes(client, discovery);
    const headers = await collectHeaderChain(client, discovery, anchor);
    const transactionHistory = await collectSelectedTransactions(
      client,
      discovery,
      headers,
    );
    const afterBoxes = await revalidateSelectedBoxes(client, discovery);
    if (canonicalJson(beforeBoxes) !== canonicalJson(afterBoxes)) {
      throw new Error('selected reward UTXOs changed during Ergo history collection');
    }
    const after = await observeSnapshotV2(client);
    await assertCanonicalAnchor(client, anchor, after);
    const cumulativeDeclaredDifficulty = headers.reduce(
      (sum, header) => sum + BigInt(header.declaredDifficulty),
      0n,
    ).toString();
    const headersManifest = deepFreeze({
      schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HEADERS_V1_SCHEMA,
      version: 1,
      network: 'devnet',
      selection: 'matching-dual-node-snapshot-anchor-chain',
      firstHeight: 1,
      lastHeight: anchor.tipHeight,
      genesisHeaderIdHex: discovery.target.genesisHeaderIdHex,
      setupAnchorHeaderIdHex: anchor.tipHeaderIdHex,
      cumulativeDeclaredDifficulty,
      headers,
      boundaries: {
        headerIdsAndParentsRecomputed: true,
        difficultyValuesDecodedOnly: true,
        difficultyTransitionsAuthenticated: false,
        proofOfWorkVerified: false,
        globalForkChoiceEstablished: false,
      },
    });
    const transactionsManifest = deepFreeze({
      schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_TRANSACTIONS_V1_SCHEMA,
      version: 1,
      genesisBoxIds: { ...discovery.genesisBoxIds },
      ...transactionHistory,
    });
    const utxoTransitionsManifest = deepFreeze({
      schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_UTXO_HISTORY_V1_SCHEMA,
      version: 1,
      genesisInputs: beforeBoxes,
    });
    return deepFreeze({
      snapshot: anchor,
      headersManifest,
      transactionsManifest,
      utxoTransitionsManifest,
    });
  } finally {
    client.endAuthenticatedTrackerReconstruction();
  }
}

function discoverySnapshot(
  discovery: RewardInputDiscovery,
): Readonly<TargetSnapshotV1> {
  return Object.freeze({
    network: 'devnet' as const,
    tipHeight: discovery.target.tipHeight,
    tipHeaderIdHex: discovery.target.tipHeaderIdHex,
  });
}

async function observeSnapshot(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  discovery: Readonly<SubstrateFederatedRewardInputDiscoveryV1>,
): Promise<Readonly<TargetSnapshotV1>> {
  const info = plainRecord(await client.getInfo(), 'Ergo node info');
  const network = normalizeAuthenticatedSpvTrackerNodeNetwork(
    info.network ?? info.networkType,
    'Ergo history node',
  );
  if (network !== 'devnet') {
    throw new Error('isolated-devnet Ergo history requires devnet');
  }
  const fullHeight = positiveSafeInteger(
    info.fullHeight,
    'Ergo history node full height',
  );
  const bestHeaderBytes = normalizeErgoNodeHeaderBytes(
    await client.getBestHeader(),
  );
  const bestHeader = parseErgoHeaderIdentity(bestHeaderBytes);
  const tipHeaderIdHex = computeErgoHeaderId(bestHeader).toString('hex');
  if (
    bestHeader.height !== fullHeight
    || fullHeight !== discovery.target.tipHeight
    || tipHeaderIdHex !== discovery.target.tipHeaderIdHex
  ) {
    throw new Error('Ergo history target differs from reward-input discovery');
  }
  return Object.freeze({
    network: 'devnet' as const,
    tipHeight: fullHeight,
    tipHeaderIdHex,
  });
}

async function observeSnapshotV2(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
): Promise<Readonly<TargetSnapshotV1>> {
  const info = plainRecord(await client.getInfo(), 'Ergo node info');
  const network = normalizeAuthenticatedSpvTrackerNodeNetwork(
    info.network ?? info.networkType,
    'Ergo history node',
  );
  if (network !== 'devnet') {
    throw new Error('isolated-devnet Ergo history requires devnet');
  }
  const fullHeight = positiveSafeInteger(
    info.fullHeight,
    'Ergo history node full height',
  );
  const bestHeaderBytes = normalizeErgoNodeHeaderBytes(
    await client.getBestHeader(),
  );
  const bestHeader = parseErgoHeaderIdentity(bestHeaderBytes);
  const tipHeaderIdHex = computeErgoHeaderId(bestHeader).toString('hex');
  if (bestHeader.height !== fullHeight) {
    throw new Error('Ergo history node info and best-header heights disagree');
  }
  return Object.freeze({
    network: 'devnet' as const,
    tipHeight: fullHeight,
    tipHeaderIdHex,
  });
}

async function assertCanonicalAnchor(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  anchor: Readonly<TargetSnapshotV1>,
  observed: Readonly<TargetSnapshotV1>,
): Promise<void> {
  if (observed.tipHeight < anchor.tipHeight) {
    throw new Error('Ergo history target is behind reward-input discovery');
  }
  const extensionLength = observed.tipHeight - anchor.tipHeight;
  if (extensionLength > MAX_HEADER_COUNT) {
    throw new Error('Ergo history canonical extension exceeds the header bound');
  }
  let expectedIdHex = observed.tipHeaderIdHex;
  let expectedHeight = observed.tipHeight;
  while (expectedHeight > anchor.tipHeight) {
    const raw = await client.getBlockHeaderById(expectedIdHex);
    if (raw === null) {
      throw new Error('Ergo history canonical extension header is unavailable');
    }
    const canonicalBytes = normalizeErgoNodeHeaderBytes(raw);
    const header = parseErgoHeaderIdentity(canonicalBytes);
    const headerIdHex = computeErgoHeaderId(header).toString('hex');
    if (headerIdHex !== expectedIdHex || header.height !== expectedHeight) {
      throw new Error(
        'Ergo history canonical extension header identity or height drifted',
      );
    }
    expectedIdHex = Buffer.from(header.parentId).toString('hex');
    expectedHeight -= 1;
  }
  if (expectedIdHex !== anchor.tipHeaderIdHex) {
    throw new Error('Ergo history reward-discovery anchor is not canonical');
  }
}

async function collectHeaderChain(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  discovery: RewardInputDiscovery,
  snapshot: Readonly<TargetSnapshotV1>,
): Promise<readonly Readonly<HeaderRowV1>[]> {
  if (snapshot.tipHeight > MAX_HEADER_COUNT) {
    throw new Error(`Ergo history exceeds the ${MAX_HEADER_COUNT}-header bound`);
  }
  const descending: HeaderRowV1[] = [];
  let expectedIdHex = snapshot.tipHeaderIdHex;
  let expectedHeight = snapshot.tipHeight;
  while (expectedHeight >= 1) {
    const raw = await client.getBlockHeaderById(expectedIdHex);
    if (raw === null) {
      throw new Error(`Ergo history header ${expectedIdHex} is unavailable`);
    }
    const canonicalBytes = normalizeErgoNodeHeaderBytes(raw);
    const header = parseErgoHeaderIdentity(canonicalBytes);
    const headerIdHex = computeErgoHeaderId(header).toString('hex');
    if (headerIdHex !== expectedIdHex || header.height !== expectedHeight) {
      throw new Error('Ergo history header identity or height drifted');
    }
    const parentHeaderIdHex = Buffer.from(header.parentId).toString('hex');
    descending.push(Object.freeze({
      height: header.height,
      headerIdHex,
      parentHeaderIdHex,
      canonicalHeaderBytesHex: canonicalBytes.toString('hex'),
      version: header.version,
      timestampMs: header.timestamp.toString(),
      nBits: header.nBits,
      declaredDifficulty: decodeErgoCompactDifficulty(header.nBits).toString(),
    }));
    expectedIdHex = parentHeaderIdHex;
    expectedHeight -= 1;
  }
  const headers = descending.reverse();
  if (
    headers.length !== snapshot.tipHeight
    || headers[0]?.height !== 1
    || headers[0]?.headerIdHex !== discovery.target.genesisHeaderIdHex
  ) {
    throw new Error('Ergo history does not reach the exact discovered genesis header');
  }
  for (let index = 1; index < headers.length; index += 1) {
    if (headers[index]!.parentHeaderIdHex !== headers[index - 1]!.headerIdHex) {
      throw new Error('Ergo history parent lineage is not contiguous');
    }
  }
  return deepFreeze(headers);
}

async function collectSelectedTransactions(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  discovery: RewardInputDiscovery,
  headers: readonly Readonly<HeaderRowV1>[],
): Promise<Readonly<Record<string, unknown>>> {
  const selected = selectedBoxes(discovery);
  const byHeight = new Map(headers.map(header => [header.height, header]));
  const transactionIds = [...new Set(
    selected.map(({ box }) => box.transactionId),
  )].sort(compareCodeUnits);
  const transactions = [];
  const inclusionHeightByTransactionId = new Map<string, number>();
  for (const transactionIdHex of transactionIds) {
    const roles = selected.filter(entry => entry.box.transactionId === transactionIdHex);
    const transaction = await client.getTransaction(transactionIdHex);
    if (transaction === null) {
      throw new Error('genesis transaction is unavailable');
    }
    const inclusionHeight = positiveSafeInteger(
      plainRecord(transaction, 'genesis transaction').inclusionHeight,
      'genesis transaction inclusion height',
    );
    const header = byHeight.get(inclusionHeight);
    if (header === undefined) {
      throw new Error('genesis transaction height is outside the collected header chain');
    }
    const block = await client.getBlockByHeaderId(header.headerIdHex);
    if (block === null) {
      throw new Error('genesis transaction containing block is unavailable');
    }
    const signedTransaction = selectSignedTransactionFromBlock(
      block,
      transactionIdHex,
    );
    const commitment = await verifyErgoBlockTransactionCommitment({
      block,
      expectedHeaderIdHex: header.headerIdHex,
      expectedHeight: inclusionHeight,
      expectedTransactionIdHex: transactionIdHex,
      expectedTransaction: signedTransaction,
    });
    assertErgoBlockTransactionCommitmentVerificationProvenance(commitment);
    const semantics = await verifyErgoSignedTransactionSemantics({
      expectedTransaction: signedTransaction,
      expectedTransactionIdHex: transactionIdHex,
      expectedTransactionSigmaDigestHex: commitment.transactionSigmaDigestHex,
    });
    assertErgoSignedTransactionSemanticsVerificationProvenance(semantics);
    for (const { role, box } of roles) {
      const output = semantics.outputs[box.index];
      if (output === undefined || canonicalJson(output) !== canonicalJson({
        boxIdHex: box.boxId,
        valueNanoErg: box.value,
        ergoTreeHex: box.ergoTree,
        assets: box.assets.map(asset => ({
          tokenIdHex: asset.tokenId,
          amount: asset.amount,
        })),
        additionalRegisters: box.additionalRegisters,
        creationHeight: box.creationHeight,
        transactionIdHex: box.transactionId,
        outputIndex: box.index,
      })) {
        throw new Error(`${role} genesis box differs from its signed transaction output`);
      }
    }
    transactions.push(deepFreeze({
      transactionIdHex,
      inclusionHeaderIdHex: header.headerIdHex,
      inclusionHeight,
      transactionIndex: commitment.transactionIndex,
      transactionCount: commitment.transactionCount,
      transactionSigmaDigestHex: commitment.transactionSigmaDigestHex,
      signedTransaction: snapshotJsonData(
        signedTransaction,
        `genesis transaction ${transactionIdHex}`,
      ),
    }));
    inclusionHeightByTransactionId.set(transactionIdHex, inclusionHeight);
  }
  return deepFreeze({
    transactions,
    selectedOutputs: selected.map(({ role, box }) => ({
      role,
      boxIdHex: box.boxId,
      transactionIdHex: box.transactionId,
      outputIndex: box.index,
      inclusionHeight: inclusionHeightByTransactionId.get(box.transactionId)!,
    })),
  });
}

function selectSignedTransactionFromBlock(
  block: unknown,
  transactionIdHex: string,
): unknown {
  const section = plainRecord(
    plainRecord(block, 'genesis transaction containing block').blockTransactions,
    'genesis block transaction section',
  );
  if (!Array.isArray(section.transactions)) {
    throw new Error('genesis block transaction section must contain transactions');
  }
  const matches = section.transactions.filter((value, index) => {
    const transaction = plainRecord(
      value,
      `genesis block transaction ${index}`,
    );
    return transaction.id === transactionIdHex;
  });
  if (matches.length !== 1) {
    throw new Error(
      'genesis transaction must appear exactly once in its containing block',
    );
  }
  return matches[0];
}

async function revalidateSelectedBoxes(
  client: AuthenticatedSpvTrackerReadOnlyNodeClient,
  discovery: RewardInputDiscovery,
): Promise<Readonly<Record<GenesisRole, Readonly<Eip12Box>>>> {
  const entries = await Promise.all(selectedBoxes(discovery).map(
    async ({ role, box }) => {
      const observed = await client.getBoxByIdOrNull(box.boxId);
      if (observed === null) {
        throw new Error(`${role} reward input is absent from the current UTXO view`);
      }
      const normalized = await normalizeEip12Box(
        observed,
        `${role} current reward input`,
      );
      if (canonicalJson(normalized) !== canonicalJson(box)) {
        throw new Error(`${role} reward input drifted from its discovery bytes`);
      }
      return [role, normalized] as const;
    },
  ));
  return deepFreeze(Object.fromEntries(entries) as Record<
    GenesisRole,
    Readonly<Eip12Box>
  >);
}

function selectedBoxes(
  discovery: RewardInputDiscovery,
): readonly Readonly<{ readonly role: GenesisRole; readonly box: Readonly<Eip12Box> }>[] {
  return [
    { role: 'tracker', box: discovery.genesisInputs.tracker },
    {
      role: 'duplicatePrevention',
      box: discovery.genesisInputs.duplicatePrevention,
    },
    { role: 'pooledReserve', box: discovery.genesisInputs.pooledReserve },
  ];
}

function falseAuthorization(): SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1['receipt']['authorization'] {
  return Object.freeze({
    constructSetup: false as const,
    check: false as const,
    sign: false as const,
    submit: false as const,
    broadcast: false as const,
    activate: false as const,
    fundsAuthority: false as const,
    gate5Closed: false as const,
    productionReady: false as const,
  });
}

function manifestText(value: unknown): string {
  return `${canonicalJson(value)}\n`;
}

function artifact(text: string): Readonly<ByteArtifactV1> {
  const bytes = Buffer.from(text, 'utf8');
  return Object.freeze({
    sha256Hex: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.byteLength,
  });
}

function assertArtifact(
  text: string,
  expected: Readonly<ByteArtifactV1>,
  label: string,
): void {
  const actual = artifact(text);
  if (
    actual.sha256Hex !== expected.sha256Hex
    || actual.sizeBytes !== expected.sizeBytes
  ) {
    throw new Error(`isolated-devnet ${label} artifact bytes drifted`);
  }
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return Number(value);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (
    value !== null
    && typeof value === 'object'
    && !ArrayBuffer.isView(value)
    && !Object.isFrozen(value)
  ) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
