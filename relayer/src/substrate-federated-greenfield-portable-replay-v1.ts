import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  type Stats,
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { TextDecoder } from 'node:util';

import {
  MINER_FEE,
} from './ergo-encoding.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  canonicalJson,
  parseStrictJson,
  sha256CanonicalJson,
} from './strict-json.js';
import {
  buildSubstrateFederatedGreenfieldErgoHistoryV1,
  buildSubstrateFederatedGreenfieldGenerationV1,
  buildSubstrateFederatedGreenfieldLaunchBaselineV1,
  buildSubstrateFederatedGreenfieldLaunchStatementV1,
  buildSubstrateFederatedGreenfieldRelayerClosureV1,
  buildSubstrateFederatedGreenfieldSourceHistoryV1,
  deriveSubstrateFederatedGreenfieldTargetDescriptorV1,
  SUBSTRATE_FEDERATED_GREENFIELD_ERGO_HISTORY_V1_SCHEMA,
  SUBSTRATE_FEDERATED_GREENFIELD_LAUNCH_STATEMENT_V1_SCHEMA,
  SUBSTRATE_FEDERATED_GREENFIELD_RELAYER_CLOSURE_V1_SCHEMA,
  SUBSTRATE_FEDERATED_GREENFIELD_SOURCE_HISTORY_V1_SCHEMA,
  SUBSTRATE_FEDERATED_GREENFIELD_TARGET_DESCRIPTOR_V1_SCHEMA,
  type SubstrateFederatedGreenfieldLaunchSignatureV1,
  type SubstrateFederatedGreenfieldLaunchStatementV1,
} from './substrate-federated-greenfield-launch-v1.js';
import {
  materializeSubstrateFederatedSingletonIssuanceV1,
} from './substrate-federated-genesis-issuance-materialization-v1.js';
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
import {
  normalizeEip12Box,
  type Eip12Box,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

export const SUBSTRATE_FEDERATED_GREENFIELD_PORTABLE_REPLAY_REQUEST_V1_SCHEMA =
  'e2s.substrate-federated-greenfield-portable-replay-request.v1' as const;
export const SUBSTRATE_FEDERATED_GREENFIELD_ATTESTATION_PACKET_V1_SCHEMA =
  'e2s.substrate-federated-greenfield-attestation-packet.v1' as const;
export const SUBSTRATE_FEDERATED_GREENFIELD_ERGO_UTXO_HISTORY_V1_SCHEMA =
  'e2s.substrate-federated-greenfield-ergo-utxo-history.v1' as const;
export const SUBSTRATE_FEDERATED_GREENFIELD_PORTABLE_REPLAY_REPORT_V1_SCHEMA =
  'e2s.substrate-federated-greenfield-portable-replay-report.v1' as const;

const REPORT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_PORTABLE_REPLAY_REPORT_V1';
const PROVISIONING_IDENTITY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_PORTABLE_PROVISIONING_IDENTITY_V1';
const TRUST_PIN_SET_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_PORTABLE_TRUST_PIN_SET_V1';
const TRANSACTION_BODY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_PORTABLE_UNSIGNED_BODY_V1';
const MATERIALIZED_TRANSACTION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_GREENFIELD_PORTABLE_MATERIALIZED_TX_V1';
const MAX_INPUT_BYTES = 4 * 1024 * 1024;
const UTF8 = new TextDecoder('utf-8', { fatal: true });

const CONTRACT_PATHS = Object.freeze({
  trackerTemplate: 'contracts/SPVTrackerSubstrateFederatedV1.es',
  duplicatePreventionTemplate:
    'contracts/DoubleUnlockPreventionSubstrateFederatedV1.es',
  sourceLockTemplate: 'contracts/MainChainLockPooledReserveV6.es',
  pooledReserveTemplate:
    'contracts/MainChainPooledReserveValidityApplicationV6.es',
});

type ArtifactPathKey =
  | keyof typeof CONTRACT_PATHS
  | 'sourceFinalizedBlocksManifest'
  | 'sourceRuntimeUpgradesManifest'
  | 'sourceApplicationDeploymentsManifest'
  | 'ergoGreatestWorkHeadersManifest'
  | 'ergoTransactionsManifest'
  | 'ergoUtxoTransitionsManifest'
  | 'relayerSourceArchive'
  | 'relayerPackageLock'
  | 'relayerRuntimeEntrypointsManifest'
  | 'relayerBuildArtifact'
  | 'attestationPacket';

const CANONICAL_ARTIFACT_PATHS: Readonly<
  Record<ArtifactPathKey, string>
> = Object.freeze({
  ...CONTRACT_PATHS,
  sourceFinalizedBlocksManifest: 'artifacts/source-finalized-blocks.bin',
  sourceRuntimeUpgradesManifest: 'artifacts/source-runtime-upgrades.bin',
  sourceApplicationDeploymentsManifest:
    'artifacts/source-application-deployments.bin',
  ergoGreatestWorkHeadersManifest: 'artifacts/ergo-greatest-work-headers.bin',
  ergoTransactionsManifest: 'artifacts/ergo-transactions.bin',
  ergoUtxoTransitionsManifest: 'artifacts/ergo-utxo-transitions.json',
  relayerSourceArchive: 'artifacts/relayer-source-archive.bin',
  relayerPackageLock: 'artifacts/relayer-package-lock.bin',
  relayerRuntimeEntrypointsManifest:
    'artifacts/relayer-runtime-entrypoints.bin',
  relayerBuildArtifact: 'artifacts/relayer-build-artifact.bin',
  attestationPacket: 'attestation/launch-packet.json',
});

const ARTIFACT_PATH_KEYS: readonly ArtifactPathKey[] = Object.freeze([
  'trackerTemplate',
  'duplicatePreventionTemplate',
  'sourceLockTemplate',
  'pooledReserveTemplate',
  'sourceFinalizedBlocksManifest',
  'sourceRuntimeUpgradesManifest',
  'sourceApplicationDeploymentsManifest',
  'ergoGreatestWorkHeadersManifest',
  'ergoTransactionsManifest',
  'ergoUtxoTransitionsManifest',
  'relayerSourceArchive',
  'relayerPackageLock',
  'relayerRuntimeEntrypointsManifest',
  'relayerBuildArtifact',
  'attestationPacket',
]);

export interface SubstrateFederatedGreenfieldPortableReplayRequestV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_GREENFIELD_PORTABLE_REPLAY_REQUEST_V1_SCHEMA;
  readonly version: 1;
  readonly files: Readonly<Record<ArtifactPathKey, string>>;
}

export interface SubstrateFederatedGreenfieldAttestationPacketV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_GREENFIELD_ATTESTATION_PACKET_V1_SCHEMA;
  readonly version: 1;
  readonly statement:
    Readonly<SubstrateFederatedGreenfieldLaunchStatementV1>;
  readonly signatures:
    readonly Readonly<SubstrateFederatedGreenfieldLaunchSignatureV1>[];
}

export interface SubstrateFederatedGreenfieldPortableReplayTrustPinsV1 {
  readonly expectedTargetDescriptorDigestHex: string;
  readonly expectedSourceAttestationKeySetDigestHex: string;
}

interface PortableProvisioningIdentityV1 {
  readonly role: 'tracker' | 'duplicate-prevention' | 'pooled-reserve';
  readonly genesisInputBoxIdHex: string;
  readonly unsignedTransactionIdHex: string;
  readonly stateOutputBoxIdHex: string;
  readonly stateOutputIndex: 0;
  readonly creationHeight: number;
  readonly unsignedTransactionBodyDigestHex: string;
  readonly materializedTransactionDigestHex: string;
}

export interface SubstrateFederatedGreenfieldPortableReplayReportV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_GREENFIELD_PORTABLE_REPLAY_REPORT_V1_SCHEMA;
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
    readonly sourceHistoryDigestHex: string;
    readonly ergoHistoryDigestHex: string;
    readonly relayerClosureDigestHex: string;
    readonly sourceManifestDigestsHex: readonly string[];
    readonly ergoManifestDigestsHex: readonly string[];
    readonly relayerArtifactDigestsHex: readonly string[];
  }>;
  readonly provisioning: Readonly<{
    readonly identityDigestHex: string;
    readonly tracker: Readonly<PortableProvisioningIdentityV1>;
    readonly duplicatePrevention: Readonly<PortableProvisioningIdentityV1>;
    readonly pooledReserve: Readonly<PortableProvisioningIdentityV1>;
  }>;
  readonly checks: Readonly<{
    readonly exactRawArtifactsRehashed: true;
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
    readonly explicitRequestBundleRead: true;
    readonly operatorConfigurationFileRead: false;
    readonly pinnedCompilerRuntimeMetadataRead: true;
    readonly ambientEnvironmentAcceptedAsLaunchAuthority: false;
    readonly networkAccessPerformed: false;
    readonly runtimeDatabaseOpened: false;
    readonly deploymentStateOpened: false;
    readonly signerOrWalletMaterialRead: false;
    readonly signedTransactionConstructed: false;
    readonly reportContainsLocalPaths: false;
    readonly freshProcessClaimedByReport: false;
  }>;
  readonly boundaries: Readonly<{
    readonly sourceAttestationQuorumIsLaunchHistoryAuthority: true;
    readonly sourceConsensusIndependentlyVerified: false;
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

interface LoadedBundle {
  readonly request: Readonly<SubstrateFederatedGreenfieldPortableReplayRequestV1>;
  readonly files: Readonly<Record<ArtifactPathKey, Buffer>>;
  readonly packet: Readonly<SubstrateFederatedGreenfieldAttestationPacketV1>;
}

interface HistoricalGenesisInputsV1 {
  readonly tracker: Eip12Box;
  readonly duplicatePrevention: Eip12Box;
  readonly pooledReserve: Eip12Box;
}

/**
 * Replays one externally attested greenfield launch bundle without network,
 * persistence, signing, checking, submission, broadcast, or activation ports.
 */
export async function replaySubstrateFederatedGreenfieldPortableV1(
  requestPath: string,
  trustPinsInput: Readonly<
    SubstrateFederatedGreenfieldPortableReplayTrustPinsV1
  >,
): Promise<Readonly<SubstrateFederatedGreenfieldPortableReplayReportV1>> {
  const bundle = loadBundle(requestPath);
  const trustPins = normalizeTrustPins(trustPinsInput);
  const externalStatement = bundle.packet.statement;
  const target = externalStatement.target;
  assertTargetMatchesTrustPins(target, trustPins);
  const profile = buildSubstrateFederatedCheckpointProfileV1({
    federationEpoch: target.federation.federationEpoch,
    maxAdmissionValidityBlocks:
      target.federation.maxAdmissionValidityBlocks,
    sourceAttestationThreshold:
      target.federation.sourceAttestationThreshold,
    sourceAttestationPublicKeysHex:
      [...target.federation.sourceAttestationPublicKeysHex],
    ergoAdmissionThreshold: target.federation.ergoAdmissionThreshold,
    ergoAdmissionPublicKeysHex:
      [...target.federation.ergoAdmissionPublicKeysHex],
  });
  const trackerRequest = buildSubstrateFederatedTrackerCompilerRequestV1({
    template: contractTemplate(
      CONTRACT_PATHS.trackerTemplate,
      bundle.files.trackerTemplate,
    ),
    trackerGenesisInputBoxIdHex:
      target.lineages.tracker.genesisInputBoxIdHex,
    profile,
    application: {
      sourceNetworkIdHex: target.sourceRuntime.sourceNetworkIdHex,
      sidechainIdHex: target.sourceRuntime.sidechainIdHex,
      bridgeAddressHex: target.sourceRuntime.bridgeAddressHex,
      tokenAddressHex: target.sourceRuntime.tokenAddressHex,
      bridgeRuntimeCodeSha256Hex:
        target.sourceRuntime.bridgeRuntimeCodeSha256Hex,
      bridgeRuntimeCodeBytes: target.sourceRuntime.bridgeRuntimeCodeBytes,
      tokenRuntimeCodeSha256Hex:
        target.sourceRuntime.tokenRuntimeCodeSha256Hex,
      tokenRuntimeCodeBytes: target.sourceRuntime.tokenRuntimeCodeBytes,
      sourceRuntimeCodeSha256Hex:
        target.sourceRuntime.sourceRuntimeCodeSha256Hex,
      sourceRuntimeCodeBytes: target.sourceRuntime.sourceRuntimeCodeBytes,
      runtimeProfileIdHex: target.sourceRuntime.runtimeProfileIdHex,
      settlementProfileIdHex: target.profile.settlementProfileIdHex,
    },
  });
  const trackerReceipt =
    await compileSubstrateFederatedTrackerWithPinnedJvmV1(trackerRequest);
  const familyTemplates = {
    duplicatePrevention: contractTemplate(
      CONTRACT_PATHS.duplicatePreventionTemplate,
      bundle.files.duplicatePreventionTemplate,
    ),
    sourceLock: contractTemplate(
      CONTRACT_PATHS.sourceLockTemplate,
      bundle.files.sourceLockTemplate,
    ),
    pooledReserve: contractTemplate(
      CONTRACT_PATHS.pooledReserveTemplate,
      bundle.files.pooledReserveTemplate,
    ),
  };
  const familyReceipt =
    await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1({
      trackerRequest,
      trackerReceipt,
      templates: familyTemplates,
      duplicatePreventionGenesisInputBoxIdHex:
        target.lineages.duplicatePrevention.genesisInputBoxIdHex,
      pooledReserveGenesisInputBoxIdHex:
        target.lineages.pooledReserve.genesisInputBoxIdHex,
    });
  const descriptor = deriveSubstrateFederatedGreenfieldTargetDescriptorV1({
    trackerRequest,
    trackerReceipt,
    familyTemplates,
    familyReceipt,
  });
  assertTargetMatchesTrustPins(descriptor, trustPins);

  const externalSource = externalStatement.histories.source;
  const sourceHistory = buildSubstrateFederatedGreenfieldSourceHistoryV1({
    target: descriptor,
    genesisNativeBlockHashHex:
      externalSource.genesis.nativeBlockHashHex,
    genesisExecutionBlockHashHex:
      externalSource.genesis.executionBlockHashHex,
    activationNativeBlockHeight:
      externalSource.activation.nativeBlockHeight,
    activationNativeBlockHashHex:
      externalSource.activation.nativeBlockHashHex,
    activationExecutionBlockHashHex:
      externalSource.activation.executionBlockHashHex,
    finalizedBlocksManifest:
      bundle.files.sourceFinalizedBlocksManifest,
    runtimeUpgradesManifest:
      bundle.files.sourceRuntimeUpgradesManifest,
    applicationDeploymentsManifest:
      bundle.files.sourceApplicationDeploymentsManifest,
  });
  const externalErgo = externalStatement.histories.ergo;
  const ergoHistory = buildSubstrateFederatedGreenfieldErgoHistoryV1({
    target: descriptor,
    genesisHeaderIdHex: externalErgo.genesis.headerIdHex,
    genesisHeight: externalErgo.genesis.height,
    setupAnchorHeaderIdHex: externalErgo.setupAnchor.headerIdHex,
    setupAnchorHeight: externalErgo.setupAnchor.height,
    greatestWorkHeadersManifest:
      bundle.files.ergoGreatestWorkHeadersManifest,
    transactionsManifest: bundle.files.ergoTransactionsManifest,
    utxoTransitionsManifest: bundle.files.ergoUtxoTransitionsManifest,
  });
  const externalRelayer = externalStatement.histories.relayer;
  const relayerClosure = buildSubstrateFederatedGreenfieldRelayerClosureV1({
    target: descriptor,
    gitCommitSha1Hex: externalRelayer.gitCommitSha1Hex,
    sourceArchive: bundle.files.relayerSourceArchive,
    packageLock: bundle.files.relayerPackageLock,
    runtimeEntrypointsManifest:
      bundle.files.relayerRuntimeEntrypointsManifest,
    buildArtifact: bundle.files.relayerBuildArtifact,
  });
  const statement = buildSubstrateFederatedGreenfieldLaunchStatementV1({
    activationGenerationIdHex:
      externalStatement.activationGenerationIdHex,
    target: descriptor,
    sourceHistory,
    ergoHistory,
    relayerClosure,
  });
  if (canonicalJson(statement) !== canonicalJson(externalStatement)) {
    throw new Error(
      'portable greenfield statement does not match the exact rebuilt artifact closure',
    );
  }
  const baseline = buildSubstrateFederatedGreenfieldLaunchBaselineV1({
    statement,
    signatures: bundle.packet.signatures,
  });
  const generation = buildSubstrateFederatedGreenfieldGenerationV1({
    launchBaseline: baseline,
    trackerRequest,
    trackerReceipt,
    familyTemplates,
    familyReceipt,
  });
  const historicalInputs = await parseHistoricalGenesisInputs(
    bundle.files.ergoUtxoTransitionsManifest,
    descriptor,
    ergoHistory.setupAnchor.height,
  );
  const identities = await materializePortableProvisioningIdentities(
    generation,
    historicalInputs,
  );
  const provisioning = deepFreeze({
    identityDigestHex: sha256CanonicalJson(
      identities,
      PROVISIONING_IDENTITY_DIGEST_DOMAIN,
    ),
    ...identities,
  });
  const binding = {
    schema: SUBSTRATE_FEDERATED_GREENFIELD_PORTABLE_REPLAY_REPORT_V1_SCHEMA,
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
      targetDescriptorDigestHex: descriptor.descriptorDigestHex,
      statementDigestHex: statement.statementDigestHex,
      attestationDigestHex: statement.attestationDigestHex,
      signatureSetDigestHex: baseline.signatureSetDigestHex,
      baselineDigestHex: baseline.baselineDigestHex,
      generationManifestDigestHex: generation.manifestDigestHex,
      activationGenerationIdHex:
        generation.generation.generationIdHex,
    },
    inputClosure: {
      sourceHistoryDigestHex: sourceHistory.historyDigestHex,
      ergoHistoryDigestHex: ergoHistory.historyDigestHex,
      relayerClosureDigestHex: relayerClosure.closureDigestHex,
      sourceManifestDigestsHex: [
        sourceHistory.manifests.finalizedBlocks.sha256Hex,
        sourceHistory.manifests.runtimeUpgrades.sha256Hex,
        sourceHistory.manifests.applicationDeployments.sha256Hex,
      ],
      ergoManifestDigestsHex: [
        ergoHistory.manifests.greatestWorkHeaders.sha256Hex,
        ergoHistory.manifests.transactions.sha256Hex,
        ergoHistory.manifests.utxoTransitions.sha256Hex,
      ],
      relayerArtifactDigestsHex: [
        relayerClosure.artifacts.sourceArchive.sha256Hex,
        relayerClosure.artifacts.packageLock.sha256Hex,
        relayerClosure.artifacts.runtimeEntrypoints.sha256Hex,
        relayerClosure.artifacts.buildArtifact.sha256Hex,
      ],
    },
    provisioning,
    checks: {
      exactRawArtifactsRehashed: true as const,
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
      explicitRequestBundleRead: true as const,
      operatorConfigurationFileRead: false as const,
      pinnedCompilerRuntimeMetadataRead: true as const,
      ambientEnvironmentAcceptedAsLaunchAuthority: false as const,
      networkAccessPerformed: false as const,
      runtimeDatabaseOpened: false as const,
      deploymentStateOpened: false as const,
      signerOrWalletMaterialRead: false as const,
      signedTransactionConstructed: false as const,
      reportContainsLocalPaths: false as const,
      freshProcessClaimedByReport: false as const,
    },
    boundaries: {
      sourceAttestationQuorumIsLaunchHistoryAuthority: true as const,
      sourceConsensusIndependentlyVerified: false as const,
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
  return deepFreeze({
    ...binding,
    reportDigestHex: sha256CanonicalJson(binding, REPORT_DIGEST_DOMAIN),
  });
}

function loadBundle(requestPath: string): Readonly<LoadedBundle> {
  const requestAbsolute = resolveExplicitRequestPath(requestPath);
  const requestBytes = readBoundedRegularFile(
    requestAbsolute,
    'portable greenfield replay request',
  );
  const request = parseRequest(requestBytes);
  const bundleRoot = realpathSync(dirname(requestAbsolute));
  const resolvedPaths = new Map<ArtifactPathKey, string>();
  const distinctPaths = new Set<string>();
  for (const key of ARTIFACT_PATH_KEYS) {
    const resolvedPath = resolveBundleFile(bundleRoot, request.files[key], key);
    const canonicalPath = realpathSync(resolvedPath);
    const pathIdentity = canonicalPathIdentity(canonicalPath);
    if (distinctPaths.has(pathIdentity)) {
      throw new Error('portable greenfield replay artifact paths must be distinct');
    }
    distinctPaths.add(pathIdentity);
    resolvedPaths.set(key, canonicalPath);
  }
  const files = Object.fromEntries(ARTIFACT_PATH_KEYS.map(key => [
    key,
    readBoundedRegularFile(
      resolvedPaths.get(key)!,
      `portable greenfield ${key} artifact`,
    ),
  ])) as Record<ArtifactPathKey, Buffer>;
  const packet = parseAttestationPacket(files.attestationPacket);
  return deepFreeze({ request, files, packet });
}

function parseRequest(
  bytes: Uint8Array,
): Readonly<SubstrateFederatedGreenfieldPortableReplayRequestV1> {
  const value = parseCanonicalJson(bytes, 'portable greenfield replay request');
  const record = exactRecord(value, [
    'schema',
    'version',
    'files',
  ], 'portable greenfield replay request');
  if (
    record.schema
      !== SUBSTRATE_FEDERATED_GREENFIELD_PORTABLE_REPLAY_REQUEST_V1_SCHEMA
    || record.version !== 1
  ) {
    throw new Error('portable greenfield replay request schema is unsupported');
  }
  const fileRecord = exactRecord(
    record.files,
    ARTIFACT_PATH_KEYS,
    'portable greenfield replay request files',
  );
  const files = Object.fromEntries(ARTIFACT_PATH_KEYS.map(key => {
    const value = fileRecord[key];
    if (typeof value !== 'string') {
      throw new Error(`portable greenfield ${key} path must be a string`);
    }
    return [key, safeRelativePath(value, key)];
  })) as Record<ArtifactPathKey, string>;
  for (const key of ARTIFACT_PATH_KEYS) {
    if (files[key] !== CANONICAL_ARTIFACT_PATHS[key]) {
      throw new Error(`portable greenfield ${key} path must remain canonical`);
    }
  }
  return deepFreeze({
    schema: SUBSTRATE_FEDERATED_GREENFIELD_PORTABLE_REPLAY_REQUEST_V1_SCHEMA,
    version: 1 as const,
    files,
  });
}

function parseAttestationPacket(
  bytes: Uint8Array,
): Readonly<SubstrateFederatedGreenfieldAttestationPacketV1> {
  const value = parseCanonicalJson(
    bytes,
    'portable greenfield attestation packet',
  );
  const record = exactRecord(value, [
    'schema',
    'version',
    'statement',
    'signatures',
  ], 'portable greenfield attestation packet');
  if (
    record.schema
      !== SUBSTRATE_FEDERATED_GREENFIELD_ATTESTATION_PACKET_V1_SCHEMA
    || record.version !== 1
  ) {
    throw new Error('portable greenfield attestation packet schema is unsupported');
  }
  const statementRecord = plainRecord(
    record.statement,
    'portable greenfield statement',
  );
  if (
    statementRecord.schema
      !== SUBSTRATE_FEDERATED_GREENFIELD_LAUNCH_STATEMENT_V1_SCHEMA
    || statementRecord.version !== 1
  ) {
    throw new Error('portable greenfield launch statement schema is unsupported');
  }
  const target = plainRecord(
    statementRecord.target,
    'portable greenfield target descriptor',
  );
  if (target.schema !== SUBSTRATE_FEDERATED_GREENFIELD_TARGET_DESCRIPTOR_V1_SCHEMA) {
    throw new Error('portable greenfield target descriptor schema is unsupported');
  }
  const histories = plainRecord(
    statementRecord.histories,
    'portable greenfield histories',
  );
  if (
    plainRecord(histories.source, 'portable greenfield source history').schema
      !== SUBSTRATE_FEDERATED_GREENFIELD_SOURCE_HISTORY_V1_SCHEMA
    || plainRecord(histories.ergo, 'portable greenfield Ergo history').schema
      !== SUBSTRATE_FEDERATED_GREENFIELD_ERGO_HISTORY_V1_SCHEMA
    || plainRecord(histories.relayer, 'portable greenfield relayer closure').schema
      !== SUBSTRATE_FEDERATED_GREENFIELD_RELAYER_CLOSURE_V1_SCHEMA
  ) {
    throw new Error('portable greenfield history schema is unsupported');
  }
  if (!Array.isArray(record.signatures)) {
    throw new Error('portable greenfield signatures must be an array');
  }
  const signatures = record.signatures.map((signature, index) => {
    const fields = exactRecord(signature, [
      'signerPublicKeyHex',
      'signatureHex',
    ], `portable greenfield signature ${index}`);
    if (
      typeof fields.signerPublicKeyHex !== 'string'
      || typeof fields.signatureHex !== 'string'
    ) {
      throw new Error(`portable greenfield signature ${index} fields must be strings`);
    }
    return {
      signerPublicKeyHex: fields.signerPublicKeyHex,
      signatureHex: fields.signatureHex,
    };
  });
  return deepFreeze({
    schema: SUBSTRATE_FEDERATED_GREENFIELD_ATTESTATION_PACKET_V1_SCHEMA,
    version: 1 as const,
    statement: record.statement as Readonly<
      SubstrateFederatedGreenfieldLaunchStatementV1
    >,
    signatures,
  });
}

async function parseHistoricalGenesisInputs(
  bytes: Uint8Array,
  descriptor: Readonly<ReturnType<
    typeof deriveSubstrateFederatedGreenfieldTargetDescriptorV1
  >>,
  setupAnchorHeight: number,
): Promise<Readonly<HistoricalGenesisInputsV1>> {
  const parsed = parseCanonicalJson(
    bytes,
    'portable greenfield Ergo UTXO history',
  );
  const record = exactRecord(parsed, [
    'schema',
    'version',
    'genesisInputs',
  ], 'portable greenfield Ergo UTXO history');
  if (
    record.schema !== SUBSTRATE_FEDERATED_GREENFIELD_ERGO_UTXO_HISTORY_V1_SCHEMA
    || record.version !== 1
  ) {
    throw new Error('portable greenfield Ergo UTXO history schema is unsupported');
  }
  const inputs = exactRecord(record.genesisInputs, [
    'tracker',
    'duplicatePrevention',
    'pooledReserve',
  ], 'portable greenfield historical genesis inputs');
  const normalized = await Promise.all([
    normalizeEip12Box(inputs.tracker, 'portable historical tracker input'),
    normalizeEip12Box(
      inputs.duplicatePrevention,
      'portable historical duplicate-prevention input',
    ),
    normalizeEip12Box(
      inputs.pooledReserve,
      'portable historical pooled-reserve input',
    ),
  ]);
  const result = {
    tracker: normalized[0]!,
    duplicatePrevention: normalized[1]!,
    pooledReserve: normalized[2]!,
  };
  const expected = descriptor.lineages;
  if (
    result.tracker.boxId !== expected.tracker.genesisInputBoxIdHex
    || result.duplicatePrevention.boxId
      !== expected.duplicatePrevention.genesisInputBoxIdHex
    || result.pooledReserve.boxId
      !== expected.pooledReserve.genesisInputBoxIdHex
  ) {
    throw new Error(
      'portable historical genesis inputs do not match the exact target descriptor',
    );
  }
  if (new Set(Object.values(result).map(box => box.boxId)).size !== 3) {
    throw new Error('portable historical genesis inputs must be pairwise distinct');
  }
  for (const [role, box] of Object.entries(result)) {
    if (
      box.assets.length !== 0
      || Object.keys(box.additionalRegisters).length !== 0
      || box.creationHeight > setupAnchorHeight
    ) {
      throw new Error(
        `portable historical ${role} input must be pure ERG, register-free, and not newer than the setup anchor`,
      );
    }
  }
  return deepFreeze(result);
}

async function materializePortableProvisioningIdentities(
  generation: Readonly<ReturnType<
    typeof buildSubstrateFederatedGreenfieldGenerationV1
  >>,
  inputs: Readonly<HistoricalGenesisInputsV1>,
): Promise<Readonly<{
  tracker: Readonly<PortableProvisioningIdentityV1>;
  duplicatePrevention: Readonly<PortableProvisioningIdentityV1>;
  pooledReserve: Readonly<PortableProvisioningIdentityV1>;
}>> {
  const payloads = generation.target.genesisPayloads;
  const creationHeight = generation.launchBaseline.ergoSetupAnchor.height;
  const [tracker, duplicatePrevention, pooledReserve] = await Promise.all([
    materializePortableIdentity(
      'tracker',
      inputs.tracker,
      payloads.tracker,
      creationHeight,
    ),
    materializePortableIdentity(
      'duplicate-prevention',
      inputs.duplicatePrevention,
      payloads.duplicatePrevention,
      creationHeight,
    ),
    materializePortableIdentity(
      'pooled-reserve',
      inputs.pooledReserve,
      payloads.pooledReserve,
      creationHeight,
    ),
  ]);
  return deepFreeze({ tracker, duplicatePrevention, pooledReserve });
}

async function materializePortableIdentity(
  role: PortableProvisioningIdentityV1['role'],
  genesisInput: Eip12Box,
  payload: Readonly<{
    role: string;
    valueNanoErg: string;
    ergoTreeHex: string;
    assets: readonly Readonly<{ tokenId: string; amount: string }>[];
    additionalRegisters: Readonly<Record<string, string>>;
  }>,
  creationHeight: number,
): Promise<Readonly<PortableProvisioningIdentityV1>> {
  if (
    payload.role !== role
    || payload.assets.length !== 1
    || payload.assets[0]!.amount !== '1'
  ) {
    throw new Error(`portable ${role} genesis payload shape drifted`);
  }
  const transaction = await materializeSubstrateFederatedSingletonIssuanceV1({
    label: `portable federated ${role} issuance`,
    genesisInput,
    expectedNftIdHex: payload.assets[0]!.tokenId,
    propositionHex: payload.ergoTreeHex,
    registers: payload.additionalRegisters,
    singletonValue: BigInt(payload.valueNanoErg),
    fee: BigInt(MINER_FEE),
    creationHeight,
  });
  return portableIdentity(role, genesisInput, transaction, creationHeight);
}

function portableIdentity(
  role: PortableProvisioningIdentityV1['role'],
  genesisInput: Eip12Box,
  transaction: Readonly<MaterializedUnsignedTransaction>,
  creationHeight: number,
): Readonly<PortableProvisioningIdentityV1> {
  const stateOutput = transaction.outputs[0]!;
  return deepFreeze({
    role,
    genesisInputBoxIdHex: genesisInput.boxId,
    unsignedTransactionIdHex: transaction.txId,
    stateOutputBoxIdHex: stateOutput.boxId,
    stateOutputIndex: 0 as const,
    creationHeight,
    unsignedTransactionBodyDigestHex: sha256CanonicalJson(
      transaction.eip12Tx,
      TRANSACTION_BODY_DIGEST_DOMAIN,
    ),
    materializedTransactionDigestHex: sha256CanonicalJson(
      transaction,
      MATERIALIZED_TRANSACTION_DIGEST_DOMAIN,
    ),
  });
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

function resolveExplicitRequestPath(value: string): string {
  if (typeof value !== 'string' || value.length === 0 || hasSensitivePath(value)) {
    throw new Error('portable greenfield replay requires a non-sensitive request path');
  }
  const absolute = resolve(value);
  const stat = safeLstat(absolute, 'portable greenfield replay request');
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('portable greenfield replay request must be a regular non-symlink file');
  }
  return absolute;
}

function resolveBundleFile(
  root: string,
  value: string,
  label: string,
): string {
  const normalized = safeRelativePath(value, label);
  const candidate = resolve(root, ...normalized.split('/'));
  const relativePath = relative(root, candidate);
  if (
    relativePath === ''
    || relativePath === '..'
    || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath)
  ) {
    throw new Error(`portable greenfield ${label} path escapes the bundle root`);
  }
  const stat = safeLstat(candidate, `portable greenfield ${label} artifact`);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`portable greenfield ${label} must be a regular non-symlink file`);
  }
  const canonical = realpathSync(candidate);
  const canonicalRelative = relative(root, canonical);
  if (
    canonicalRelative === '..'
    || canonicalRelative.startsWith(`..${sep}`)
    || isAbsolute(canonicalRelative)
  ) {
    throw new Error(`portable greenfield ${label} resolves outside the bundle root`);
  }
  return canonical;
}

function safeRelativePath(value: string, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 240
    || isAbsolute(value)
    || value.includes('\\')
    || value.includes('\0')
    || value.split('/').some(segment => segment === '' || segment === '.' || segment === '..')
    || !/^[A-Za-z0-9._/-]+$/.test(value)
    || hasSensitivePath(value)
  ) {
    throw new Error(`portable greenfield ${label} path is unsafe`);
  }
  return value;
}

function hasSensitivePath(value: string): boolean {
  return /(?:^|[\\/])(?:\.env(?:\.|$)|[^\\/]*(?:mnemonic|seed[-_ ]?phrase|private[-_ ]?key|wallet|deployed[-_ ]state|deployment[-_ ]state)[^\\/]*|[^\\/]+\.(?:sqlite(?:3)?|db|log))(?:[\\/]|$)/i.test(value);
}

function readBoundedRegularFile(path: string, label: string): Buffer {
  const beforeOpen = safeLstat(path, label);
  if (!beforeOpen.isFile() || beforeOpen.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY);
  } catch {
    throw new Error(`${label} could not be opened`);
  }
  try {
    const opened = fstatSync(descriptor);
    const afterOpen = safeLstat(path, label);
    assertStableRegularFile(beforeOpen, opened, afterOpen, label);
    if (opened.size <= 0 || opened.size > MAX_INPUT_BYTES) {
      throw new Error(`${label} size is outside the portable replay bound`);
    }
    let bytes: Buffer;
    try {
      bytes = readFileSync(descriptor);
    } catch {
      throw new Error(`${label} could not be read`);
    }
    const afterRead = fstatSync(descriptor);
    const finalPath = safeLstat(path, label);
    assertStableRegularFile(opened, afterRead, finalPath, label);
    if (
      bytes.length !== opened.size
      || afterRead.size !== opened.size
      || afterRead.mtimeMs !== opened.mtimeMs
    ) {
      throw new Error(`${label} changed while it was being read`);
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function assertStableRegularFile(
  expected: Stats,
  descriptor: Stats,
  currentPath: Stats,
  label: string,
): void {
  if (
    !descriptor.isFile()
    || !currentPath.isFile()
    || currentPath.isSymbolicLink()
    || !sameFileIdentity(expected, descriptor)
    || !sameFileIdentity(descriptor, currentPath)
  ) {
    throw new Error(`${label} identity changed while it was being opened`);
  }
}

function sameFileIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function canonicalPathIdentity(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

function normalizeTrustPins(
  input: Readonly<SubstrateFederatedGreenfieldPortableReplayTrustPinsV1>,
): Readonly<SubstrateFederatedGreenfieldPortableReplayReportV1['trustPins']> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('portable greenfield replay trust pins are required');
  }
  const expectedTargetDescriptorDigestHex = fixedDigestHex(
    input.expectedTargetDescriptorDigestHex,
    'expected target descriptor digest',
  );
  const expectedSourceAttestationKeySetDigestHex = fixedDigestHex(
    input.expectedSourceAttestationKeySetDigestHex,
    'expected source-attestation key-set digest',
  );
  const binding = {
    expectedTargetDescriptorDigestHex,
    expectedSourceAttestationKeySetDigestHex,
  };
  return deepFreeze({
    pinSetDigestHex: sha256CanonicalJson(binding, TRUST_PIN_SET_DIGEST_DOMAIN),
    ...binding,
  });
}

function assertTargetMatchesTrustPins(
  target: Readonly<{
    descriptorDigestHex: string;
    federation: Readonly<{ sourceAttestationKeySetDigestHex: string }>;
  }>,
  trustPins: Readonly<SubstrateFederatedGreenfieldPortableReplayReportV1['trustPins']>,
): void {
  if (
    target.descriptorDigestHex !== trustPins.expectedTargetDescriptorDigestHex
    || target.federation.sourceAttestationKeySetDigestHex
      !== trustPins.expectedSourceAttestationKeySetDigestHex
  ) {
    throw new Error('portable greenfield target does not match the explicit trust pins');
  }
}

function fixedDigestHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`portable greenfield ${label} must be 32-byte lowercase hex`);
  }
  return value;
}

function safeLstat(path: string, label: string): Stats {
  try {
    return lstatSync(path);
  } catch {
    throw new Error(`${label} is unavailable`);
  }
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

function exactRecord<K extends string>(
  value: unknown,
  keys: readonly K[],
  label: string,
): Record<K, unknown> {
  const record = plainRecord(value, label);
  const actual = Object.keys(record).sort(compareCodeUnits);
  const expected = [...keys].sort(compareCodeUnits);
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} fields are not exact`);
  }
  return record as Record<K, unknown>;
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
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
