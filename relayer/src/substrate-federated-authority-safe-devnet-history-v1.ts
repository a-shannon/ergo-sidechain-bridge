import { createHash } from 'node:crypto';

import {
  acceptSubstrateFederatedAuthoritySafeDevnetWithHistoryV1,
  assertSubstrateFederatedAuthoritySafeDevnetAcceptedHistoryV1Provenance,
  assertSubstrateFederatedAuthoritySafeDevnetAcceptanceV1Provenance,
  type AcceptSubstrateFederatedAuthoritySafeDevnetV1Input,
  type SubstrateFederatedAuthoritySafeDevnetAcceptanceV1,
  type SubstrateFederatedAuthoritySafeDevnetAcceptedHistoryV1,
} from './substrate-federated-authority-safe-devnet-acceptance-v1.js';
import {
  SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_APPLICATION_HISTORY_V1_SCHEMA,
  SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_REPORTED_FINALIZED_BLOCKS_V1_SCHEMA,
  SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_RUNTIME_HISTORY_V1_SCHEMA,
  type ReportedFinalityPathV1,
  type SubstrateFederatedAuthoritySafeDevnetHistoryArtifactsV1,
} from './substrate-federated-authority-safe-devnet-history-action-v1.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';

export {
  SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_APPLICATION_HISTORY_V1_SCHEMA,
  SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_REPORTED_FINALIZED_BLOCKS_V1_SCHEMA,
  SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_RUNTIME_HISTORY_V1_SCHEMA,
};
export type {
  SubstrateFederatedAuthoritySafeDevnetHistoryArtifactsV1,
};

export const SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_HISTORY_V1_SCHEMA =
  'e2s.substrate-federated-authority-safe-devnet-history.v1' as const;

const HISTORY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_HISTORY_V1';
const HISTORIES = new WeakSet<object>();
const HISTORY_ACTIONS = new WeakMap<
  object,
  Readonly<SubstrateFederatedAuthoritySafeDevnetAcceptedHistoryV1>
>();

export interface CollectSubstrateFederatedAuthoritySafeDevnetHistoryV1Input {
  readonly acceptance:
    Readonly<AcceptSubstrateFederatedAuthoritySafeDevnetV1Input>;
}

export interface SubstrateFederatedAuthoritySafeDevnetHistoryV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_HISTORY_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'isolated_exact_target_history_collected';
  readonly acceptanceDigestHex: string;
  readonly target: Readonly<{
    readonly frontierCommit: string;
    readonly frontierPatchSha256Hex: string;
    readonly generatedSpecSha256Hex: string;
    readonly nativeGenesisHashHex: string;
    readonly acceptedNativeTipHashHex: string;
    readonly acceptedExecutionTipHashHex: string;
    readonly sourceRuntimeCodeSha256Hex: string;
    readonly sourceRuntimeCodeBytes: number;
    readonly storageLayoutDigestHex: string;
    readonly bridgeAddressHex: string;
    readonly bridgeRuntimeCodeSha256Hex: string;
    readonly bridgeRuntimeCodeBytes: number;
    readonly tokenAddressHex: string;
    readonly tokenRuntimeCodeSha256Hex: string;
    readonly tokenRuntimeCodeBytes: number;
    readonly binarySha256Hex: string;
    readonly processBindingDigestHex: string;
  }>;
  readonly interval: Readonly<{
    readonly semantics: 'genesis-through-accepted-observation-tip-inclusive';
    readonly genesisNativeBlockHashHex: string;
    readonly observedTipHeight: string;
    readonly observedTipNativeBlockHashHex: string;
    readonly observedTipExecutionBlockHashHex: string;
    readonly blockCount: number;
    readonly reportedFinality: readonly Readonly<ReportedFinalityPathV1>[];
  }>;
  readonly artifacts: Readonly<{
    readonly acceptanceReport: Readonly<ByteArtifactV1>;
    readonly reportedFinalizedBlocks: Readonly<ByteArtifactV1>;
    readonly runtimeHistory: Readonly<ByteArtifactV1>;
    readonly applicationHistory: Readonly<ByteArtifactV1>;
  }>;
  readonly checks: Readonly<{
    readonly freshExactTargetAcceptanceConsumed: true;
    readonly exactProcessOwnedObservationTipConsumed: true;
    readonly exactAcceptedTargetIdentityRecheckedAtHistoryTip: true;
    readonly archiveGenesisStateReadFromBothOrigins: true;
    readonly completeBoundedHeightIntervalCollected: true;
    readonly nativeAndExecutionParentChainsContiguous: true;
    readonly bothOriginsMatchedEveryCollectedHeight: true;
    readonly acceptedTipIsAncestorOfEachRpcReportedFinalizedHead: true;
    readonly everyCollectedRowStableAfterCollection: true;
    readonly exactRuntimeAndApplicationHistoryMaterialized: true;
  }>;
  readonly boundaries: Readonly<{
    readonly targetHistoryCollected: true;
    readonly targetHistoryAuthenticated: false;
    readonly sourceAttestationQuorumVerified: false;
    readonly sourceConsensusIndependentlyVerified: false;
    readonly independentSourceAdministrationEstablished: false;
    readonly sourceFinalityAuthenticated: false;
    readonly ergoHistoryCollected: false;
    readonly relayerClosureCollected: false;
    readonly isolatedDevnetTargetDescriptorProduced: false;
    readonly isolatedDevnetLaunchStatementProduced: false;
    readonly portableReplayCompleted: false;
    readonly setupTransactionIdentitiesFrozen: false;
    readonly setupTransactionConstructed: false;
    readonly setupTransactionSigned: false;
    readonly nodeCheckPerformed: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly profileActivated: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly historyDigestHex: string;
}

interface ByteArtifactV1 {
  readonly sha256Hex: string;
  readonly sizeBytes: number;
}

export interface SubstrateFederatedAuthoritySafeDevnetHistoryV1 {
  readonly acceptance:
    Readonly<SubstrateFederatedAuthoritySafeDevnetAcceptanceV1>;
  readonly receipt:
    Readonly<SubstrateFederatedAuthoritySafeDevnetHistoryV1Receipt>;
  readonly artifacts:
    Readonly<SubstrateFederatedAuthoritySafeDevnetHistoryArtifactsV1>;
}

export async function collectSubstrateFederatedAuthoritySafeDevnetHistoryV1(
  input: Readonly<CollectSubstrateFederatedAuthoritySafeDevnetHistoryV1Input>,
): Promise<Readonly<SubstrateFederatedAuthoritySafeDevnetHistoryV1>> {
  const accepted =
    await acceptSubstrateFederatedAuthoritySafeDevnetWithHistoryV1(
      input.acceptance,
    );
  assertSubstrateFederatedAuthoritySafeDevnetAcceptedHistoryV1Provenance(
    accepted,
  );
  const collected = accepted.value;
  const artifacts = Object.freeze({
    acceptanceReport: Buffer.from(
      `${canonicalJson(accepted.acceptance)}\n`,
      'utf8',
    ),
    ...collected.artifacts,
  });
  const artifactBinding = Object.freeze({
    acceptanceReport: artifact(artifacts.acceptanceReport),
    reportedFinalizedBlocks: artifact(
      artifacts.reportedFinalizedBlocksManifest,
    ),
    runtimeHistory: artifact(artifacts.runtimeHistoryManifest),
    applicationHistory: artifact(
      artifacts.applicationHistoryManifest,
    ),
  });
  const binding = {
    schema: SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_HISTORY_V1_SCHEMA,
    version: 1 as const,
    status: 'isolated_exact_target_history_collected' as const,
    acceptanceDigestHex: accepted.acceptance.acceptanceDigestHex,
    target: {
      ...collected.target,
      binarySha256Hex: accepted.acceptance.binary.sha256Hex,
      processBindingDigestHex:
        accepted.acceptance.processes.processBindingDigestHex,
    },
    interval: {
      semantics:
        'genesis-through-accepted-observation-tip-inclusive' as const,
      ...collected.interval,
    },
    artifacts: artifactBinding,
    checks: {
      freshExactTargetAcceptanceConsumed: true as const,
      exactProcessOwnedObservationTipConsumed: true as const,
      exactAcceptedTargetIdentityRecheckedAtHistoryTip: true as const,
      archiveGenesisStateReadFromBothOrigins: true as const,
      completeBoundedHeightIntervalCollected: true as const,
      nativeAndExecutionParentChainsContiguous: true as const,
      bothOriginsMatchedEveryCollectedHeight: true as const,
      acceptedTipIsAncestorOfEachRpcReportedFinalizedHead: true as const,
      everyCollectedRowStableAfterCollection: true as const,
      exactRuntimeAndApplicationHistoryMaterialized: true as const,
    },
    boundaries: {
      targetHistoryCollected: true as const,
      targetHistoryAuthenticated: false as const,
      sourceAttestationQuorumVerified: false as const,
      sourceConsensusIndependentlyVerified: false as const,
      independentSourceAdministrationEstablished: false as const,
      sourceFinalityAuthenticated: false as const,
      ergoHistoryCollected: false as const,
      relayerClosureCollected: false as const,
      isolatedDevnetTargetDescriptorProduced: false as const,
      isolatedDevnetLaunchStatementProduced: false as const,
      portableReplayCompleted: false as const,
      setupTransactionIdentitiesFrozen: false as const,
      setupTransactionConstructed: false as const,
      setupTransactionSigned: false as const,
      nodeCheckPerformed: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      profileActivated: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const receipt = Object.freeze({
    ...binding,
    historyDigestHex: sha256CanonicalJson(binding, HISTORY_DIGEST_DOMAIN),
  });
  const result = Object.freeze({
    acceptance: accepted.acceptance,
    receipt,
    artifacts,
  });
  HISTORIES.add(result);
  HISTORY_ACTIONS.set(result, accepted);
  return result;
}

export function assertSubstrateFederatedAuthoritySafeDevnetHistoryV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedAuthoritySafeDevnetHistoryV1> {
  if (typeof value !== 'object' || value === null || !HISTORIES.has(value)) {
    throw new Error('authority-safe devnet history provenance is missing');
  }
  const history = value as SubstrateFederatedAuthoritySafeDevnetHistoryV1;
  assertSubstrateFederatedAuthoritySafeDevnetAcceptanceV1Provenance(
    history.acceptance,
  );
  const action = HISTORY_ACTIONS.get(value);
  assertSubstrateFederatedAuthoritySafeDevnetAcceptedHistoryV1Provenance(action);
  const { historyDigestHex, ...withoutDigest } = history.receipt;
  if (
    sha256CanonicalJson(withoutDigest, HISTORY_DIGEST_DOMAIN)
      !== historyDigestHex
  ) {
    throw new Error('authority-safe devnet history digest drifted');
  }
  assertArtifactBinding(
    history.artifacts.acceptanceReport,
    history.receipt.artifacts.acceptanceReport,
    'acceptance report',
  );
  assertArtifactBinding(
    history.artifacts.reportedFinalizedBlocksManifest,
    history.receipt.artifacts.reportedFinalizedBlocks,
    'reported-finalized-block history',
  );
  assertArtifactBinding(
    history.artifacts.runtimeHistoryManifest,
    history.receipt.artifacts.runtimeHistory,
    'runtime history',
  );
  assertArtifactBinding(
    history.artifacts.applicationHistoryManifest,
    history.receipt.artifacts.applicationHistory,
    'application history',
  );
}


function artifact(bytes: Uint8Array): ByteArtifactV1 {
  return Object.freeze({ sha256Hex: sha256(bytes), sizeBytes: bytes.length });
}

function assertArtifactBinding(
  bytes: Uint8Array,
  expected: Readonly<ByteArtifactV1>,
  label: string,
): void {
  if (
    bytes.length !== expected.sizeBytes
    || sha256(bytes) !== expected.sha256Hex
  ) {
    throw new Error(`authority-safe ${label} artifact drifted`);
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
