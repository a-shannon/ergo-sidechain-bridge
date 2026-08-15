import { TextDecoder } from 'node:util';

import {
  buildSubstrateFederatedCheckpointProfileV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  canonicalJson,
  parseStrictJson,
  sha256CanonicalJson,
} from './strict-json.js';
import {
  buildSubstrateFederatedIsolatedDevnetGenerationV1,
} from './substrate-federated-isolated-devnet-generation-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetErgoHistoryV1,
  buildSubstrateFederatedIsolatedDevnetLaunchBaselineV1,
  buildSubstrateFederatedIsolatedDevnetLaunchStatementV1,
  buildSubstrateFederatedIsolatedDevnetRelayerClosureV1,
  deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_V1_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LAUNCH_STATEMENT_V1_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_CLOSURE_V1_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TARGET_DESCRIPTOR_DIGEST_DOMAIN,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TARGET_DESCRIPTOR_V1_SCHEMA,
  type SubstrateFederatedAuthoritySafeDevnetHistoryBundleV1,
  type DeriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1Input,
  type SubstrateFederatedIsolatedDevnetLaunchSignatureV1,
  type SubstrateFederatedIsolatedDevnetLaunchStatementV1,
  type SubstrateFederatedIsolatedDevnetTargetDescriptorV1,
  type SubstrateFederatedIsolatedDevnetTargetPinsV1,
} from './substrate-federated-isolated-devnet-launch-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetProvisioningV1,
  type SubstrateFederatedIsolatedDevnetGenesisInputsV1,
  type SubstrateFederatedIsolatedDevnetProvisioningIdentityV1,
} from './substrate-federated-isolated-devnet-provisioning-v1.js';
import {
  compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1,
} from './substrate-federated-settlement-family-jvm-compiler-v1.js';
import type {
  SubstrateFederatedSettlementFamilyV1Template,
} from './substrate-federated-settlement-family-v1.js';
import {
  compileSubstrateFederatedTrackerWithPinnedJvmV1,
} from './substrate-federated-tracker-jvm-compiler-v1.js';
import {
  buildSubstrateFederatedTrackerCompilerRequestV1,
} from './substrate-federated-tracker-compiler-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ATTESTATION_PACKET_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-attestation-packet.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_UTXO_HISTORY_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-ergo-utxo-history.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-portable-replay.v1' as const;

const REPORT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_V1';
const TRUST_PIN_SET_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_TRUST_PIN_SET_V1';
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const UTF8 = new TextDecoder('utf-8', { fatal: true });

const replayContinuations = new WeakMap<
  object,
  Readonly<SubstrateFederatedIsolatedDevnetPortableReplayContinuationV1>
>();

const ARTIFACT_KEYS = Object.freeze([
  'trackerTemplate',
  'duplicatePreventionTemplate',
  'sourceLockTemplate',
  'pooledReserveTemplate',
  'sourceAcceptanceReport',
  'sourceReportedFinalizedBlocks',
  'sourceRuntimeHistory',
  'sourceApplicationHistory',
  'sourceHistoryReceipt',
  'ergoGreatestWorkHeadersManifest',
  'ergoTransactionsManifest',
  'ergoUtxoTransitionsManifest',
  'relayerSourceArchive',
  'relayerPackageLock',
  'relayerRuntimeEntrypointsManifest',
  'relayerBuildArtifact',
  'attestationPacket',
] as const);

type ArtifactKey = typeof ARTIFACT_KEYS[number];

export type SubstrateFederatedIsolatedDevnetPortableArtifactsV1 = Readonly<
  Record<ArtifactKey, Uint8Array>
>;

export interface SubstrateFederatedIsolatedDevnetPortableTrustPinsV1 {
  readonly expectedTargetDescriptorDigestHex: string;
  readonly expectedSourceAttestationKeySetDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetAttestationPacketV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ATTESTATION_PACKET_V1_SCHEMA;
  readonly version: 1;
  readonly statement:
    Readonly<SubstrateFederatedIsolatedDevnetLaunchStatementV1>;
  readonly signatures:
    readonly Readonly<SubstrateFederatedIsolatedDevnetLaunchSignatureV1>[];
}

export interface ReplaySubstrateFederatedIsolatedDevnetPortableV1Input {
  readonly artifacts:
    Readonly<SubstrateFederatedIsolatedDevnetPortableArtifactsV1>;
  readonly trustPins:
    Readonly<SubstrateFederatedIsolatedDevnetPortableTrustPinsV1>;
}

export interface SubstrateFederatedIsolatedDevnetPortableReplayContinuationV1 {
  readonly sourceAndCompilerInput:
    Readonly<DeriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1Input>;
  readonly expectedSettlementGenesisHeaderIdHex: string;
  readonly genesisBoxIds: Readonly<{
    readonly tracker: string;
    readonly duplicatePrevention: string;
    readonly pooledReserve: string;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetPortableReplayV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'portable_authenticated_non_authorizing_replay';
  readonly reportDigestHex: string;
  readonly compiler: Readonly<{
    readonly trackerRequestDigestHex: string;
    readonly trackerReceiptDigestHex: string;
    readonly familyRequestDigestHex: string;
    readonly familyReceiptDigestHex: string;
  }>;
  readonly trustPins: Readonly<{
    readonly pinSetDigestHex: string;
    readonly expectedTargetDescriptorDigestHex: string;
    readonly expectedSourceAttestationKeySetDigestHex: string;
  }>;
  readonly launch: Readonly<{
    readonly targetDescriptorDigestHex: string;
    readonly statementDigestHex: string;
    readonly attestationDigestHex: string;
    readonly signatureSetDigestHex: string;
    readonly baselineDigestHex: string;
    readonly generationManifestDigestHex: string;
    readonly activationGenerationIdHex: string;
  }>;
  readonly inputClosure: Readonly<{
    readonly sourceAcceptanceDigestHex: string;
    readonly sourceHistoryDigestHex: string;
    readonly sourceArtifactDigestsHex: readonly string[];
    readonly ergoHistoryDigestHex: string;
    readonly ergoManifestDigestsHex: readonly string[];
    readonly relayerClosureDigestHex: string;
    readonly relayerArtifactDigestsHex: readonly string[];
  }>;
  readonly provisioning: Readonly<{
    readonly planDigestHex: string;
    readonly identitySetDigestHex: string;
    readonly tracker:
      Readonly<SubstrateFederatedIsolatedDevnetProvisioningIdentityV1>;
    readonly duplicatePrevention:
      Readonly<SubstrateFederatedIsolatedDevnetProvisioningIdentityV1>;
    readonly pooledReserve:
      Readonly<SubstrateFederatedIsolatedDevnetProvisioningIdentityV1>;
  }>;
  readonly checks: Readonly<{
    readonly exactArtifactBytesSnapshotted: true;
    readonly exactPinnedJvmCompilerChainReplayed: true;
    readonly externalStatementRebuiltExactly: true;
    readonly exactSourceAttestationThresholdVerified: true;
    readonly allPredecessorRoutesRebuilt: true;
    readonly emptyReplayRootDerivedInternally: true;
    readonly exactHistoricalGenesisBoxesReparsed: true;
    readonly exactUnsignedProvisioningIdentitiesRebuilt: true;
    readonly explicitTargetDescriptorPinMatched: true;
    readonly explicitSourceAttestationKeySetPinMatched: true;
    readonly deserializedBaselineAccepted: false;
    readonly deserializedGenerationAccepted: false;
    readonly currentUtxoViewAcceptedAsHistory: false;
  }>;
  readonly execution: Readonly<{
    readonly explicitArtifactBundleConsumed: true;
    readonly artifactFileSelectionPerformed: false;
    readonly operatorConfigurationAcceptedAsReplayInput: false;
    readonly pinnedCompilerRuntimeMetadataRead: true;
    readonly ambientEnvironmentAcceptedAsLaunchAuthority: false;
    readonly networkCapabilityOwnedByReplayCore: false;
    readonly runtimeDatabaseCapabilityOwnedByReplayCore: false;
    readonly deploymentStateCapabilityOwnedByReplayCore: false;
    readonly signerOrWalletCapabilityOwnedByReplayCore: false;
    readonly nodeCheckPerformed: false;
    readonly signedTransactionConstructed: false;
    readonly submissionPerformed: false;
    readonly broadcastPerformed: false;
    readonly reportContainsLocalPaths: false;
    readonly freshProcessClaimedByReport: false;
  }>;
  readonly boundaries: Readonly<{
    readonly sourceAttestationQuorumIsLaunchHistoryAuthority: true;
    readonly sourceConsensusIndependentlyVerified: false;
    readonly independentSourceAdministrationEstablished: false;
    readonly sourceFinalityAuthenticated: false;
    readonly ergoConsensusIndependentlyVerified: false;
    readonly currentGenesisInputsObservedUnspent: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly setupLineagesEstablished: false;
    readonly profileActivated: false;
    readonly signingAuthorityEstablished: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly fundsAuthorityEstablished: false;
    readonly callerSuppliedTrustPinsEstablishTargetApproval: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

/**
 * Rebuilds an isolated-devnet launch and its unsigned setup identities from an
 * explicit byte bundle. File selection and fresh-process execution belong to a
 * separate wrapper; this function owns no network, persistence, signer,
 * checker, submission, broadcast, or activation capability.
 */
export async function replaySubstrateFederatedIsolatedDevnetPortableV1(
  input: Readonly<ReplaySubstrateFederatedIsolatedDevnetPortableV1Input>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPortableReplayV1>> {
  const capturedInput = exactDataRecord(
    input,
    ['artifacts', 'trustPins'],
    'isolated portable replay input',
  );
  const artifacts = snapshotArtifacts(capturedInput.artifacts);
  const trustPins = normalizeTrustPins(capturedInput.trustPins);
  const packet = parseAttestationPacket(artifacts.attestationPacket);
  const externalStatement = packet.statement;
  const externalTarget = externalStatement.target;
  const profile = buildSubstrateFederatedCheckpointProfileV1({
    federationEpoch: externalTarget.federation.federationEpoch,
    maxAdmissionValidityBlocks:
      externalTarget.federation.maxAdmissionValidityBlocks,
    sourceAttestationThreshold:
      externalTarget.federation.sourceAttestationThreshold,
    sourceAttestationPublicKeysHex:
      [...externalTarget.federation.sourceAttestationPublicKeysHex],
    ergoAdmissionThreshold: externalTarget.federation.ergoAdmissionThreshold,
    ergoAdmissionPublicKeysHex:
      [...externalTarget.federation.ergoAdmissionPublicKeysHex],
  });
  assertExternalTargetPreflight(externalTarget, trustPins, profile);
  const trackerRequest = buildSubstrateFederatedTrackerCompilerRequestV1({
    template: contractTemplate(
      'contracts/SPVTrackerSubstrateFederatedV1.es',
      artifacts.trackerTemplate,
    ),
    trackerGenesisInputBoxIdHex:
      externalTarget.lineages.tracker.genesisInputBoxIdHex,
    profile,
    application: {
      sourceNetworkIdHex: externalTarget.sourceRuntime.sourceNetworkIdHex,
      sidechainIdHex: externalTarget.sourceRuntime.sidechainIdHex,
      bridgeAddressHex: externalTarget.sourceRuntime.bridgeAddressHex,
      tokenAddressHex: externalTarget.sourceRuntime.tokenAddressHex,
      bridgeRuntimeCodeSha256Hex:
        externalTarget.sourceRuntime.bridgeRuntimeCodeSha256Hex,
      bridgeRuntimeCodeBytes:
        externalTarget.sourceRuntime.bridgeRuntimeCodeBytes,
      tokenRuntimeCodeSha256Hex:
        externalTarget.sourceRuntime.tokenRuntimeCodeSha256Hex,
      tokenRuntimeCodeBytes:
        externalTarget.sourceRuntime.tokenRuntimeCodeBytes,
      sourceRuntimeCodeSha256Hex:
        externalTarget.sourceRuntime.sourceRuntimeCodeSha256Hex,
      sourceRuntimeCodeBytes:
        externalTarget.sourceRuntime.sourceRuntimeCodeBytes,
      runtimeProfileIdHex: externalTarget.sourceRuntime.runtimeProfileIdHex,
      settlementProfileIdHex: externalTarget.profile.settlementProfileIdHex,
    },
  });
  const trackerReceipt =
    await compileSubstrateFederatedTrackerWithPinnedJvmV1(trackerRequest);
  const familyTemplates = {
    duplicatePrevention: contractTemplate(
      'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
      artifacts.duplicatePreventionTemplate,
    ),
    sourceLock: contractTemplate(
      'contracts/MainChainLockPooledReserveV6.es',
      artifacts.sourceLockTemplate,
    ),
    pooledReserve: contractTemplate(
      'contracts/MainChainPooledReserveValidityApplicationV6.es',
      artifacts.pooledReserveTemplate,
    ),
  };
  const familyReceipt =
    await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1({
      trackerRequest,
      trackerReceipt,
      templates: familyTemplates,
      duplicatePreventionGenesisInputBoxIdHex:
        externalTarget.lineages.duplicatePrevention.genesisInputBoxIdHex,
      pooledReserveGenesisInputBoxIdHex:
        externalTarget.lineages.pooledReserve.genesisInputBoxIdHex,
    });
  const historyBundle = sourceHistoryBundle(artifacts);
  const targetPins = targetPinsFromExternalTarget(externalTarget);
  const target = deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1({
    trackerRequest,
    trackerReceipt,
    familyTemplates,
    familyReceipt,
    historyBundle,
    trustPins: targetPins,
  });
  assertTargetMatchesTrustPins(target, trustPins);

  const externalErgo = externalStatement.histories.ergo;
  const ergoHistory = buildSubstrateFederatedIsolatedDevnetErgoHistoryV1({
    target,
    genesisHeaderIdHex: externalErgo.genesis.headerIdHex,
    genesisHeight: externalErgo.genesis.height,
    setupAnchorHeaderIdHex: externalErgo.setupAnchor.headerIdHex,
    setupAnchorHeight: externalErgo.setupAnchor.height,
    greatestWorkHeadersManifest: artifacts.ergoGreatestWorkHeadersManifest,
    transactionsManifest: artifacts.ergoTransactionsManifest,
    utxoTransitionsManifest: artifacts.ergoUtxoTransitionsManifest,
  });
  const externalRelayer = externalStatement.histories.relayer;
  const relayerClosure = buildSubstrateFederatedIsolatedDevnetRelayerClosureV1({
    target,
    gitCommitSha1Hex: externalRelayer.gitCommitSha1Hex,
    sourceArchive: artifacts.relayerSourceArchive,
    packageLock: artifacts.relayerPackageLock,
    runtimeEntrypointsManifest: artifacts.relayerRuntimeEntrypointsManifest,
    buildArtifact: artifacts.relayerBuildArtifact,
  });
  const statement = buildSubstrateFederatedIsolatedDevnetLaunchStatementV1({
    activationGenerationIdHex: externalStatement.activationGenerationIdHex,
    target,
    ergoHistory,
    relayerClosure,
  });
  if (canonicalJson(statement) !== canonicalJson(externalStatement)) {
    throw new Error(
      'isolated portable statement does not match the exact rebuilt artifact closure',
    );
  }
  const baseline = buildSubstrateFederatedIsolatedDevnetLaunchBaselineV1({
    statement,
    signatures: packet.signatures,
  });
  const generation = buildSubstrateFederatedIsolatedDevnetGenerationV1({
    launchBaseline: baseline,
    trackerRequest,
    trackerReceipt,
    familyTemplates,
    familyReceipt,
    historyBundle,
    trustPins: targetPins,
  });
  const genesisInputs = parseHistoricalGenesisInputs(
    artifacts.ergoUtxoTransitionsManifest,
  );
  const provisioning =
    await buildSubstrateFederatedIsolatedDevnetProvisioningV1({
      generation,
      genesisInputs,
    });
  const capturedSource = target.capturedSourceHistory;
  const reportBinding = {
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_V1_SCHEMA,
    version: 1 as const,
    status: 'portable_authenticated_non_authorizing_replay' as const,
    compiler: {
      trackerRequestDigestHex: trackerRequest.requestDigestHex,
      trackerReceiptDigestHex: trackerReceipt.receiptDigestHex,
      familyRequestDigestHex: familyReceipt.familyCompilerRequestDigestHex,
      familyReceiptDigestHex: familyReceipt.receiptDigestHex,
    },
    trustPins,
    launch: {
      targetDescriptorDigestHex: target.descriptorDigestHex,
      statementDigestHex: statement.statementDigestHex,
      attestationDigestHex: statement.attestationDigestHex,
      signatureSetDigestHex: baseline.signatureSetDigestHex,
      baselineDigestHex: baseline.baselineDigestHex,
      generationManifestDigestHex: generation.manifestDigestHex,
      activationGenerationIdHex: generation.generation.generationIdHex,
    },
    inputClosure: {
      sourceAcceptanceDigestHex: capturedSource.acceptanceDigestHex,
      sourceHistoryDigestHex: capturedSource.historyDigestHex,
      sourceArtifactDigestsHex: [
        capturedSource.artifacts.acceptanceReport.sha256Hex,
        capturedSource.artifacts.reportedFinalizedBlocks.sha256Hex,
        capturedSource.artifacts.runtimeHistory.sha256Hex,
        capturedSource.artifacts.applicationHistory.sha256Hex,
        capturedSource.artifacts.historyReceipt.sha256Hex,
      ],
      ergoHistoryDigestHex: ergoHistory.historyDigestHex,
      ergoManifestDigestsHex: [
        ergoHistory.manifests.greatestWorkHeaders.sha256Hex,
        ergoHistory.manifests.transactions.sha256Hex,
        ergoHistory.manifests.utxoTransitions.sha256Hex,
      ],
      relayerClosureDigestHex: relayerClosure.closureDigestHex,
      relayerArtifactDigestsHex: [
        relayerClosure.artifacts.sourceArchive.sha256Hex,
        relayerClosure.artifacts.packageLock.sha256Hex,
        relayerClosure.artifacts.runtimeEntrypoints.sha256Hex,
        relayerClosure.artifacts.buildArtifact.sha256Hex,
      ],
    },
    provisioning: {
      planDigestHex: provisioning.planDigestHex,
      identitySetDigestHex:
        provisioning.provisioning.identitySetDigestHex,
      tracker: provisioning.provisioning.tracker.identity,
      duplicatePrevention:
        provisioning.provisioning.duplicatePrevention.identity,
      pooledReserve: provisioning.provisioning.pooledReserve.identity,
    },
    checks: {
      exactArtifactBytesSnapshotted: true as const,
      exactPinnedJvmCompilerChainReplayed: true as const,
      externalStatementRebuiltExactly: true as const,
      exactSourceAttestationThresholdVerified: true as const,
      allPredecessorRoutesRebuilt: true as const,
      emptyReplayRootDerivedInternally: true as const,
      exactHistoricalGenesisBoxesReparsed: true as const,
      exactUnsignedProvisioningIdentitiesRebuilt: true as const,
      explicitTargetDescriptorPinMatched: true as const,
      explicitSourceAttestationKeySetPinMatched: true as const,
      deserializedBaselineAccepted: false as const,
      deserializedGenerationAccepted: false as const,
      currentUtxoViewAcceptedAsHistory: false as const,
    },
    execution: {
      explicitArtifactBundleConsumed: true as const,
      artifactFileSelectionPerformed: false as const,
      operatorConfigurationAcceptedAsReplayInput: false as const,
      pinnedCompilerRuntimeMetadataRead: true as const,
      ambientEnvironmentAcceptedAsLaunchAuthority: false as const,
      networkCapabilityOwnedByReplayCore: false as const,
      runtimeDatabaseCapabilityOwnedByReplayCore: false as const,
      deploymentStateCapabilityOwnedByReplayCore: false as const,
      signerOrWalletCapabilityOwnedByReplayCore: false as const,
      nodeCheckPerformed: false as const,
      signedTransactionConstructed: false as const,
      submissionPerformed: false as const,
      broadcastPerformed: false as const,
      reportContainsLocalPaths: false as const,
      freshProcessClaimedByReport: false as const,
    },
    boundaries: {
      sourceAttestationQuorumIsLaunchHistoryAuthority: true as const,
      sourceConsensusIndependentlyVerified: false as const,
      independentSourceAdministrationEstablished: false as const,
      sourceFinalityAuthenticated: false as const,
      ergoConsensusIndependentlyVerified: false as const,
      currentGenesisInputsObservedUnspent: false as const,
      targetNodeAcceptanceEstablished: false as const,
      setupLineagesEstablished: false as const,
      profileActivated: false as const,
      signingAuthorityEstablished: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      fundsAuthorityEstablished: false as const,
      callerSuppliedTrustPinsEstablishTargetApproval: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const report = deepFreeze({
    ...reportBinding,
    reportDigestHex: sha256CanonicalJson(
      reportBinding,
      REPORT_DIGEST_DOMAIN,
    ),
  });
  replayContinuations.set(report, deepFreeze({
    sourceAndCompilerInput: {
      trackerRequest,
      trackerReceipt,
      familyTemplates,
      familyReceipt,
      historyBundle,
      trustPins: targetPins,
    },
    expectedSettlementGenesisHeaderIdHex:
      externalErgo.genesis.headerIdHex,
    genesisBoxIds: {
      tracker: target.lineages.tracker.genesisInputBoxIdHex,
      duplicatePrevention:
        target.lineages.duplicatePrevention.genesisInputBoxIdHex,
      pooledReserve: target.lineages.pooledReserve.genesisInputBoxIdHex,
    },
  }));
  return report;
}

/**
 * Transfers the process-owned replay graph to the fixed local setup-check root.
 * Serialized reports and repeated consumption cannot recreate this handle.
 */
export function takeSubstrateFederatedIsolatedDevnetPortableReplayContinuationV1(
  report: unknown,
): Readonly<SubstrateFederatedIsolatedDevnetPortableReplayContinuationV1> {
  if (report === null || typeof report !== 'object') {
    throw new Error('isolated portable replay continuation is unavailable');
  }
  const continuation = replayContinuations.get(report);
  if (continuation === undefined) {
    throw new Error('isolated portable replay continuation is unavailable');
  }
  replayContinuations.delete(report);
  return continuation;
}

function sourceHistoryBundle(
  artifacts: Readonly<Record<ArtifactKey, Buffer>>,
): Readonly<SubstrateFederatedAuthoritySafeDevnetHistoryBundleV1> {
  return deepFreeze({
    acceptanceReport: artifacts.sourceAcceptanceReport,
    reportedFinalizedBlocks: artifacts.sourceReportedFinalizedBlocks,
    runtimeHistory: artifacts.sourceRuntimeHistory,
    applicationHistory: artifacts.sourceApplicationHistory,
    historyReceipt: artifacts.sourceHistoryReceipt,
  });
}

function targetPinsFromExternalTarget(
  target: Readonly<SubstrateFederatedIsolatedDevnetTargetDescriptorV1>,
): Readonly<SubstrateFederatedIsolatedDevnetTargetPinsV1> {
  const captured = target.capturedSourceHistory;
  return deepFreeze({
    expectedAcceptanceDigestHex: captured.acceptanceDigestHex,
    expectedHistoryDigestHex: captured.historyDigestHex,
    expectedHistoryArtifacts: {
      acceptanceReportSha256Hex:
        captured.artifacts.acceptanceReport.sha256Hex,
      reportedFinalizedBlocksSha256Hex:
        captured.artifacts.reportedFinalizedBlocks.sha256Hex,
      runtimeHistorySha256Hex: captured.artifacts.runtimeHistory.sha256Hex,
      applicationHistorySha256Hex:
        captured.artifacts.applicationHistory.sha256Hex,
      historyReceiptSha256Hex: captured.artifacts.historyReceipt.sha256Hex,
    },
    expectedSourceNetworkIdHex: target.sourceRuntime.sourceNetworkIdHex,
    expectedSidechainIdHex: target.sourceRuntime.sidechainIdHex,
    expectedRuntimeProfileIdHex: target.sourceRuntime.runtimeProfileIdHex,
    expectedSettlementProfileIdHex: target.profile.settlementProfileIdHex,
    expectedSourceAttestationKeySetDigestHex:
      target.federation.sourceAttestationKeySetDigestHex,
    expectedSourceAttestationThreshold:
      target.federation.sourceAttestationThreshold,
  });
}

function parseAttestationPacket(
  bytes: Uint8Array,
): Readonly<SubstrateFederatedIsolatedDevnetAttestationPacketV1> {
  const value = parseCanonicalJson(bytes, 'isolated portable attestation packet');
  const record = exactDataRecord(value, [
    'schema',
    'version',
    'statement',
    'signatures',
  ], 'isolated portable attestation packet');
  if (
    record.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ATTESTATION_PACKET_V1_SCHEMA
    || record.version !== 1
  ) {
    throw new Error('isolated portable attestation packet schema is unsupported');
  }
  const statement = plainRecord(record.statement, 'isolated portable statement');
  if (
    statement.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_LAUNCH_STATEMENT_V1_SCHEMA
    || statement.version !== 1
  ) {
    throw new Error('isolated portable launch statement schema is unsupported');
  }
  const target = plainRecord(statement.target, 'isolated portable target');
  if (target.schema !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TARGET_DESCRIPTOR_V1_SCHEMA) {
    throw new Error('isolated portable target descriptor schema is unsupported');
  }
  const histories = plainRecord(
    statement.histories,
    'isolated portable histories',
  );
  if (
    plainRecord(histories.ergo, 'isolated portable Ergo history').schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_V1_SCHEMA
    || plainRecord(histories.relayer, 'isolated portable relayer closure').schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_CLOSURE_V1_SCHEMA
  ) {
    throw new Error('isolated portable history schema is unsupported');
  }
  if (!Array.isArray(record.signatures)) {
    throw new Error('isolated portable signatures must be an array');
  }
  const signatures = record.signatures.map((signature, index) => {
    const fields = exactDataRecord(signature, [
      'signerPublicKeyHex',
      'signatureHex',
    ], `isolated portable signature ${index}`);
    if (
      typeof fields.signerPublicKeyHex !== 'string'
      || typeof fields.signatureHex !== 'string'
    ) {
      throw new Error(`isolated portable signature ${index} fields must be strings`);
    }
    return {
      signerPublicKeyHex: fields.signerPublicKeyHex,
      signatureHex: fields.signatureHex,
    };
  });
  return deepFreeze({
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ATTESTATION_PACKET_V1_SCHEMA,
    version: 1 as const,
    statement: record.statement as Readonly<
      SubstrateFederatedIsolatedDevnetLaunchStatementV1
    >,
    signatures,
  });
}

function parseHistoricalGenesisInputs(
  bytes: Uint8Array,
): Readonly<SubstrateFederatedIsolatedDevnetGenesisInputsV1> {
  const value = parseCanonicalJson(
    bytes,
    'isolated portable Ergo UTXO history',
  );
  const record = exactDataRecord(value, [
    'schema',
    'version',
    'genesisInputs',
  ], 'isolated portable Ergo UTXO history');
  if (
    record.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_UTXO_HISTORY_V1_SCHEMA
    || record.version !== 1
  ) {
    throw new Error('isolated portable Ergo UTXO history schema is unsupported');
  }
  const genesisInputs = exactDataRecord(record.genesisInputs, [
    'tracker',
    'duplicatePrevention',
    'pooledReserve',
  ], 'isolated portable historical genesis inputs');
  return deepFreeze({
    tracker: genesisInputs.tracker,
    duplicatePrevention: genesisInputs.duplicatePrevention,
    pooledReserve: genesisInputs.pooledReserve,
  });
}

function snapshotArtifacts(value: unknown): Readonly<Record<ArtifactKey, Buffer>> {
  const record = exactDataRecord(
    value,
    ARTIFACT_KEYS,
    'isolated portable artifact bundle',
  );
  const entries = ARTIFACT_KEYS.map(key => {
    const raw = record[key];
    if (!ArrayBuffer.isView(raw)) {
      throw new Error(`isolated portable ${key} must be a byte artifact`);
    }
    if (!(raw.buffer instanceof ArrayBuffer)) {
      throw new Error(
        `isolated portable ${key} must not use shared backing memory`,
      );
    }
    const bytes = Buffer.from(
      raw.buffer,
      raw.byteOffset,
      raw.byteLength,
    );
    if (bytes.length === 0 || bytes.length > MAX_ARTIFACT_BYTES) {
      throw new Error(`isolated portable ${key} size is outside the replay bound`);
    }
    return [key, Buffer.from(bytes)] as const;
  });
  return deepFreeze(Object.fromEntries(entries) as Record<ArtifactKey, Buffer>);
}

function normalizeTrustPins(
  value: unknown,
): Readonly<SubstrateFederatedIsolatedDevnetPortableReplayV1['trustPins']> {
  const record = exactDataRecord(value, [
    'expectedTargetDescriptorDigestHex',
    'expectedSourceAttestationKeySetDigestHex',
  ], 'isolated portable trust pins');
  const binding = {
    expectedTargetDescriptorDigestHex: fixedDigestHex(
      record.expectedTargetDescriptorDigestHex,
      'expected target descriptor digest',
    ),
    expectedSourceAttestationKeySetDigestHex: fixedDigestHex(
      record.expectedSourceAttestationKeySetDigestHex,
      'expected source-attestation key-set digest',
    ),
  };
  return deepFreeze({
    pinSetDigestHex: sha256CanonicalJson(
      binding,
      TRUST_PIN_SET_DIGEST_DOMAIN,
    ),
    ...binding,
  });
}

function assertTargetMatchesTrustPins(
  target: Readonly<{
    readonly descriptorDigestHex: string;
    readonly federation: Readonly<{
      readonly sourceAttestationKeySetDigestHex: string;
    }>;
  }>,
  trustPins: Readonly<SubstrateFederatedIsolatedDevnetPortableReplayV1['trustPins']>,
): void {
  if (
    target.descriptorDigestHex !== trustPins.expectedTargetDescriptorDigestHex
    || target.federation.sourceAttestationKeySetDigestHex
      !== trustPins.expectedSourceAttestationKeySetDigestHex
  ) {
    throw new Error('isolated portable target does not match the explicit trust pins');
  }
}

function assertExternalTargetPreflight(
  target: Readonly<SubstrateFederatedIsolatedDevnetTargetDescriptorV1>,
  trustPins: Readonly<SubstrateFederatedIsolatedDevnetPortableReplayV1['trustPins']>,
  profile: ReturnType<typeof buildSubstrateFederatedCheckpointProfileV1>,
): void {
  const { descriptorDigestHex, ...body } = target;
  const recomputedDescriptorDigestHex = sha256CanonicalJson(
    body,
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TARGET_DESCRIPTOR_DIGEST_DOMAIN,
  );
  if (
    descriptorDigestHex !== recomputedDescriptorDigestHex
    || descriptorDigestHex !== trustPins.expectedTargetDescriptorDigestHex
  ) {
    throw new Error(
      'isolated portable target descriptor does not match its body and explicit pin',
    );
  }
  const rebuiltFederation = {
    federationProfileIdHex: profile.profileIdHex,
    federationEpoch: profile.federationEpoch,
    maxAdmissionValidityBlocks: profile.maxAdmissionValidityBlocks,
    sourceAttestationPublicKeysHex:
      profile.sourceAttestationPublicKeysHex,
    sourceAttestationKeySetDigestHex:
      profile.sourceAttestationKeySetDigestHex,
    sourceAttestationThreshold: profile.sourceAttestationThreshold,
    ergoAdmissionPublicKeysHex: profile.ergoAdmissionPublicKeysHex,
    ergoAdmissionKeySetDigestHex: profile.ergoAdmissionKeySetDigestHex,
    ergoAdmissionThreshold: profile.ergoAdmissionThreshold,
  };
  if (
    canonicalJson(target.federation) !== canonicalJson(rebuiltFederation)
    || profile.sourceAttestationKeySetDigestHex
      !== trustPins.expectedSourceAttestationKeySetDigestHex
  ) {
    throw new Error(
      'isolated portable federation does not match its keys and explicit pin',
    );
  }
}

function contractTemplate(
  relativePath: string,
  bytes: Uint8Array,
): SubstrateFederatedSettlementFamilyV1Template {
  const source = decodeUtf8(bytes, `${relativePath} template`);
  if (source.length === 0) {
    throw new Error(`${relativePath} template must not be empty`);
  }
  return { relativePath, source };
}

function parseCanonicalJson(bytes: Uint8Array, label: string): unknown {
  const source = decodeUtf8(bytes, label);
  const parsed = parseStrictJson(source, label);
  if (source !== `${canonicalJson(parsed)}\n`) {
    throw new Error(`${label} must use canonical JSON with one trailing LF`);
  }
  return parsed;
}

function decodeUtf8(bytes: Uint8Array, label: string): string {
  try {
    return UTF8.decode(bytes);
  } catch {
    throw new Error(`${label} must be canonical UTF-8`);
  }
}

function fixedDigestHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`isolated portable ${label} must be 32-byte lowercase hex`);
  }
  return value;
}

function exactDataRecord<K extends string>(
  value: unknown,
  keys: readonly K[],
  label: string,
): Readonly<Record<K, unknown>> {
  const record = plainRecord(value, label);
  const descriptors = Object.getOwnPropertyDescriptors(record);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.some(key => typeof key !== 'string')) {
    throw new Error(`${label} keys are invalid`);
  }
  const sorted = (actual as string[]).sort(compareCodeUnits);
  const expected = [...keys].sort(compareCodeUnits);
  if (canonicalJson(sorted) !== canonicalJson(expected)) {
    throw new Error(`${label} fields are not exact`);
  }
  const captured: Partial<Record<K, unknown>> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new Error(`${label}.${key} must be an enumerable data property`);
    }
    captured[key] = descriptor.value;
  }
  return Object.freeze(captured as Record<K, unknown>);
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
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
