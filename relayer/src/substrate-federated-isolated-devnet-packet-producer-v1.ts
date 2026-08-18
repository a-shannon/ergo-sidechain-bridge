import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';
import {
  lstatSync,
  readFileSync,
  realpathSync,
  type BigIntStats,
} from 'node:fs';
import { join } from 'node:path';

import {
  buildSubstrateFederatedCheckpointProfileV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from './strict-json.js';
import {
  assertSubstrateFederatedAuthoritySafeDevnetHistoryV1Provenance,
  type SubstrateFederatedAuthoritySafeDevnetHistoryV1,
} from './substrate-federated-authority-safe-devnet-history-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetContractArtifactsV1Provenance,
  collectSubstrateFederatedIsolatedDevnetContractArtifactsV1,
} from './substrate-federated-isolated-devnet-contract-artifacts-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1Provenance,
  assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2Provenance,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_ARTIFACTS_V1_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_ARTIFACTS_V2_SCHEMA,
  type SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1,
  type SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2,
} from './substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetErgoHistoryV1,
  buildSubstrateFederatedIsolatedDevnetLaunchBaselineV1,
  buildSubstrateFederatedIsolatedDevnetLaunchStatementV1,
  buildSubstrateFederatedIsolatedDevnetRelayerClosureV1,
  deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1,
  type SubstrateFederatedIsolatedDevnetLaunchSignatureV1,
} from './substrate-federated-isolated-devnet-launch-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ATTESTATION_PACKET_V1_SCHEMA,
  replaySubstrateFederatedIsolatedDevnetPortableV1,
  type ReplaySubstrateFederatedIsolatedDevnetPortableV1Input,
  type SubstrateFederatedIsolatedDevnetPortableReplayV1,
} from './substrate-federated-isolated-devnet-portable-replay-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance,
  type SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2,
} from './substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js';
import {
  produceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACT_FILES_V1,
  type ProduceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1Input,
  type SubstrateFederatedIsolatedDevnetRelayerArtifactIdentityV1,
} from './substrate-federated-isolated-devnet-relayer-artifacts-v1.js';
import {
  compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1,
} from './substrate-federated-settlement-family-jvm-compiler-v1.js';
import {
  compileSubstrateFederatedTrackerWithPinnedJvmV1,
} from './substrate-federated-tracker-jvm-compiler-v1.js';
import {
  buildSubstrateFederatedTrackerCompilerRequestV1,
} from './substrate-federated-tracker-compiler-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_PRODUCER_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-packet-producer.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_KEY_COUNT =
  3 as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD =
  2 as const;

const RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_PRODUCER_V1';
const SOURCE_NETWORK_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_NETWORK_ID_V1';
const SIDECHAIN_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SIDECHAIN_ID_V1';
const RUNTIME_PROFILE_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RUNTIME_PROFILE_ID_V1';
const SETTLEMENT_PROFILE_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SETTLEMENT_PROFILE_ID_V1';
const ACTIVATION_GENERATION_ID_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ACTIVATION_GENERATION_ID_V1';
const ARTIFACT_SET_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_ARTIFACT_SET_V1';
const FEDERATION_EPOCH = '1';
const MAX_ADMISSION_VALIDITY_BLOCKS = '64';
const ERGO_ADMISSION_THRESHOLD = 1 as const;
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const RESULTS = new WeakSet<object>();

type SourceSigner = Readonly<{
  readonly privateKey: KeyObject;
  readonly publicKeyHex: string;
}>;

interface ByteArtifactV1 {
  readonly sizeBytes: number;
  readonly sha256Hex: string;
}

export interface ProduceSubstrateFederatedIsolatedDevnetPacketV1Input {
  readonly sourceHistory:
    Readonly<SubstrateFederatedAuthoritySafeDevnetHistoryV1>;
  readonly ergoHistory:
    Readonly<
      | SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1
      | SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2
    >;
  readonly expectedProfilePins: Readonly<{
    readonly federationProfileIdHex: string;
    readonly sourceAttestationKeySetDigestHex: string;
    readonly ergoAdmissionKeySetDigestHex: string;
  }>;
  readonly relayerArtifacts:
    Readonly<ProduceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1Input>;
}

export interface SubstrateFederatedIsolatedDevnetPacketSignerBindingV1 {
  readonly sourceAttestationThreshold:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD;
  readonly sourceAttestationPublicKeysHex: readonly string[];
  readonly ergoAdmissionThreshold: typeof ERGO_ADMISSION_THRESHOLD;
  readonly ergoAdmissionPublicKeysHex: readonly string[];
}

export interface SubstrateFederatedIsolatedDevnetPacketV1 {
  readonly receipt: Readonly<{
    readonly schema:
      typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_PRODUCER_V1_SCHEMA;
    readonly version: 1;
    readonly status: 'process_owned_portable_packet_replayed';
    readonly receiptDigestHex: string;
    readonly targetDescriptorDigestHex: string;
    readonly sourceAttestationKeySetDigestHex: string;
    readonly statementDigestHex: string;
    readonly attestationDigestHex: string;
    readonly baselineDigestHex: string;
    readonly activationGenerationIdHex: string;
    readonly relayerArtifactSetDigestHex: string;
    readonly packetArtifactSetDigestHex: string;
    readonly replayReportDigestHex: string;
    readonly artifacts: Readonly<Record<string, Readonly<ByteArtifactV1>>>;
    readonly checks: Readonly<{
      readonly exactProcessOwnedSourceHistoryConsumed: true;
      readonly exactProcessOwnedErgoHistoryConsumed: true;
      readonly processOwnedSetupSignerBindingConsumed: true;
      readonly activeSetupSignerBindingRevalidatedAtProduction: true;
      readonly historyBytesSnapshottedBeforeAsynchronousWork: true;
      readonly exactReviewedContractTemplatesCollected: true;
      readonly exactPinnedJvmCompilerChainExecuted: true;
      readonly realRelayerArtifactProducerInvoked: true;
      readonly relayerArtifactFilesRehashedAfterPublication: true;
      readonly sourceAndProfileIdsDerivedInProcess: true;
      readonly predeclaredAuthorityProfilePinsMatched: true;
      readonly exactThresholdPacketSignedOnce: true;
      readonly trustPinsDerivedBeforePacketSerialization: true;
      readonly portableReplayConsumerCompleted: true;
    }>;
    readonly boundaries: Readonly<{
      readonly sourceAttestationKeysShareOneProcessCustody: true;
      readonly sourceAttestationPrivateKeysRetainedAfterPacket: false;
      readonly operationalSourceAttestationCapabilityEstablished: false;
      readonly packetEligibleForActivation: false;
      readonly independentAttestorCustodyEstablished: false;
      readonly sourceConsensusIndependentlyVerified: false;
      readonly ergoConsensusIndependentlyVerified: false;
      readonly nodeExecutableIdentityAuthenticated: false;
      readonly targetNodeAcceptanceEstablished: false;
      readonly setupTransactionConstructed: false;
      readonly setupTransactionSigned: false;
      readonly submissionAuthorityEstablished: false;
      readonly broadcastAuthorityEstablished: false;
      readonly profileActivated: false;
      readonly fundsAuthorityEstablished: false;
      readonly gate5Closed: false;
      readonly trustlessStatusEstablished: false;
      readonly productionReadinessEstablished: false;
    }>;
  }>;
  readonly portableReplayInput:
    Readonly<ReplaySubstrateFederatedIsolatedDevnetPortableV1Input>;
  readonly replay:
    Readonly<SubstrateFederatedIsolatedDevnetPortableReplayV1>;
}

export interface SubstrateFederatedIsolatedDevnetPacketSessionV1 {
  readonly signer:
    Readonly<SubstrateFederatedIsolatedDevnetPacketSignerBindingV1>;
  readonly dispose: () => void;
  readonly produce: (
    input: Readonly<ProduceSubstrateFederatedIsolatedDevnetPacketV1Input>,
  ) => Promise<Readonly<SubstrateFederatedIsolatedDevnetPacketV1>>;
}

/** Creates a one-use 2-of-3 source-attestation capability for one exact packet. */
export function createSubstrateFederatedIsolatedDevnetPacketSessionV1(
  ergoAdmissionSigner: Readonly<
    SubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2
  >,
): Readonly<SubstrateFederatedIsolatedDevnetPacketSessionV1> {
  assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(
    ergoAdmissionSigner,
  );
  let signers = Array.from(
    { length: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_KEY_COUNT },
    sourceSigner,
  ).sort((left, right) => compareStrings(
    left.publicKeyHex,
    right.publicKeyHex,
  ));
  const signer = deepFreeze({
    sourceAttestationThreshold:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD,
    sourceAttestationPublicKeysHex:
      signers.map(value => value.publicKeyHex),
    ergoAdmissionThreshold: ERGO_ADMISSION_THRESHOLD,
    ergoAdmissionPublicKeysHex: [ergoAdmissionSigner.publicKeyHex],
  });
  let state: 'open' | 'running' | 'closed' = 'open';
  return Object.freeze({
    signer,
    dispose: () => {
      if (state === 'running') {
        throw new Error('isolated packet session is running');
      }
      if (state === 'open') {
        signers = [];
        state = 'closed';
      }
    },
    produce: async (
      input: Readonly<ProduceSubstrateFederatedIsolatedDevnetPacketV1Input>,
    ) => {
      if (state !== 'open') {
        throw new Error('isolated packet session is already consumed or disposed');
      }
      state = 'running';
      try {
        assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(
          ergoAdmissionSigner,
        );
        return await producePacket(input, signers, signer);
      } finally {
        signers = [];
        state = 'closed';
      }
    },
  });
}

export function assertSubstrateFederatedIsolatedDevnetPacketV1Provenance(
  value: unknown,
): asserts value is Readonly<SubstrateFederatedIsolatedDevnetPacketV1> {
  if (value === null || typeof value !== 'object' || !RESULTS.has(value)) {
    throw new Error('isolated portable packet lacks process provenance');
  }
  const result = value as SubstrateFederatedIsolatedDevnetPacketV1;
  const { receiptDigestHex, ...body } = result.receipt;
  if (sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN) !== receiptDigestHex) {
    throw new Error('isolated portable packet receipt drifted');
  }
  const actualArtifacts = artifactBindings(
    result.portableReplayInput.artifacts as Readonly<Record<string, Uint8Array>>,
  );
  if (
    canonicalJson(actualArtifacts) !== canonicalJson(result.receipt.artifacts)
    || sha256CanonicalJson(actualArtifacts, ARTIFACT_SET_DIGEST_DOMAIN)
      !== result.receipt.packetArtifactSetDigestHex
    || result.portableReplayInput.trustPins.expectedTargetDescriptorDigestHex
      !== result.receipt.targetDescriptorDigestHex
    || result.portableReplayInput.trustPins
      .expectedSourceAttestationKeySetDigestHex
      !== result.receipt.sourceAttestationKeySetDigestHex
    || result.replay.reportDigestHex !== result.receipt.replayReportDigestHex
  ) {
    throw new Error('isolated portable packet content drifted');
  }
}

function assertAcceptedErgoHistoryProvenance(
  value: Readonly<
    | SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1
    | SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2
  >,
): void {
  if (
    value.receipt.schema
      === SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_ARTIFACTS_V1_SCHEMA
  ) {
    assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1Provenance(
      value,
    );
    return;
  }
  if (
    value.receipt.schema
      === SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HISTORY_ARTIFACTS_V2_SCHEMA
  ) {
    assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2Provenance(
      value,
    );
    return;
  }
  throw new Error('isolated Ergo history schema is unsupported');
}

async function producePacket(
  input: Readonly<ProduceSubstrateFederatedIsolatedDevnetPacketV1Input>,
  signers: readonly SourceSigner[],
  signerBinding:
    Readonly<SubstrateFederatedIsolatedDevnetPacketSignerBindingV1>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPacketV1>> {
  const captured = captureInput(input);
  assertSubstrateFederatedAuthoritySafeDevnetHistoryV1Provenance(
    captured.sourceHistory,
  );
  assertAcceptedErgoHistoryProvenance(captured.ergoHistory);
  const sourceArtifacts = snapshotSourceHistory(captured.sourceHistory);
  const ergoArtifacts = snapshotErgoHistory(captured.ergoHistory);
  const sourceReceipt = captured.sourceHistory.receipt;
  const ergoReceipt = captured.ergoHistory.receipt;

  const contracts =
    collectSubstrateFederatedIsolatedDevnetContractArtifactsV1();
  assertSubstrateFederatedIsolatedDevnetContractArtifactsV1Provenance(
    contracts,
  );
  const profile = buildSubstrateFederatedCheckpointProfileV1({
    federationEpoch: FEDERATION_EPOCH,
    maxAdmissionValidityBlocks: MAX_ADMISSION_VALIDITY_BLOCKS,
    sourceAttestationThreshold:
      signerBinding.sourceAttestationThreshold,
    sourceAttestationPublicKeysHex:
      signerBinding.sourceAttestationPublicKeysHex,
    ergoAdmissionThreshold: signerBinding.ergoAdmissionThreshold,
    ergoAdmissionPublicKeysHex: signerBinding.ergoAdmissionPublicKeysHex,
  });
  assertExpectedProfilePins(profile, captured.expectedProfilePins);
  const application = deriveApplicationBinding(sourceReceipt.target);
  const trackerRequest = buildSubstrateFederatedTrackerCompilerRequestV1({
    template: {
      relativePath: contracts.receipt.artifacts.tracker.relativePath,
      source: contracts.templates.tracker,
    },
    trackerGenesisInputBoxIdHex: ergoReceipt.genesisBoxIds.tracker,
    profile,
    application,
  });
  const trackerReceipt =
    await compileSubstrateFederatedTrackerWithPinnedJvmV1(trackerRequest);
  const familyTemplates = {
    duplicatePrevention: {
      relativePath:
        contracts.receipt.artifacts.duplicatePrevention.relativePath,
      source: contracts.templates.duplicatePrevention,
    },
    sourceLock: {
      relativePath: contracts.receipt.artifacts.sourceLock.relativePath,
      source: contracts.templates.sourceLock,
    },
    pooledReserve: {
      relativePath: contracts.receipt.artifacts.pooledReserve.relativePath,
      source: contracts.templates.pooledReserve,
    },
  };
  const familyReceipt =
    await compileSubstrateFederatedSettlementFamilyWithPinnedJvmV1({
      trackerRequest,
      trackerReceipt,
      templates: familyTemplates,
      duplicatePreventionGenesisInputBoxIdHex:
        ergoReceipt.genesisBoxIds.duplicatePrevention,
      pooledReserveGenesisInputBoxIdHex:
        ergoReceipt.genesisBoxIds.pooledReserve,
    });
  const historyBundle = {
    acceptanceReport: sourceArtifacts.acceptanceReport,
    reportedFinalizedBlocks: sourceArtifacts.reportedFinalizedBlocks,
    runtimeHistory: sourceArtifacts.runtimeHistory,
    applicationHistory: sourceArtifacts.applicationHistory,
    historyReceipt: sourceArtifacts.historyReceipt,
  };
  const target = deriveSubstrateFederatedIsolatedDevnetTargetDescriptorV1({
    trackerRequest,
    trackerReceipt,
    familyTemplates,
    familyReceipt,
    historyBundle,
    trustPins: {
      expectedAcceptanceDigestHex: sourceReceipt.acceptanceDigestHex,
      expectedHistoryDigestHex: sourceReceipt.historyDigestHex,
      expectedHistoryArtifacts: {
        acceptanceReportSha256Hex:
          sourceReceipt.artifacts.acceptanceReport.sha256Hex,
        reportedFinalizedBlocksSha256Hex:
          sourceReceipt.artifacts.reportedFinalizedBlocks.sha256Hex,
        runtimeHistorySha256Hex:
          sourceReceipt.artifacts.runtimeHistory.sha256Hex,
        applicationHistorySha256Hex:
          sourceReceipt.artifacts.applicationHistory.sha256Hex,
        historyReceiptSha256Hex: sha256(sourceArtifacts.historyReceipt),
      },
      expectedSourceNetworkIdHex: application.sourceNetworkIdHex,
      expectedSidechainIdHex: application.sidechainIdHex,
      expectedRuntimeProfileIdHex: application.runtimeProfileIdHex,
      expectedSettlementProfileIdHex:
        application.settlementProfileIdHex,
      expectedSourceAttestationKeySetDigestHex:
        profile.sourceAttestationKeySetDigestHex,
      expectedSourceAttestationThreshold:
        profile.sourceAttestationThreshold,
    },
  });
  assertGenesisInputsMatch(target.lineages, ergoReceipt.genesisBoxIds);
  const ergoHistory = buildSubstrateFederatedIsolatedDevnetErgoHistoryV1({
    target,
    genesisHeaderIdHex: ergoReceipt.target.genesisHeaderIdHex,
    genesisHeight: ergoReceipt.target.genesisHeight,
    setupAnchorHeaderIdHex: ergoReceipt.target.setupAnchorHeaderIdHex,
    setupAnchorHeight: ergoReceipt.target.setupAnchorHeight,
    greatestWorkHeadersManifest: ergoArtifacts.greatestWorkHeaders,
    transactionsManifest: ergoArtifacts.transactions,
    utxoTransitionsManifest: ergoArtifacts.utxoTransitions,
  });

  const relayerReceipt =
    await produceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1(
      captured.relayerArtifacts,
    );
  const relayerArtifactSetDigestHex = sha256(Buffer.from(
    canonicalJson(relayerReceipt.artifacts),
    'utf8',
  ));
  if (relayerReceipt.artifactSetDigestHex !== relayerArtifactSetDigestHex) {
    throw new Error('isolated relayer artifact-set digest drifted');
  }
  const relayerArtifacts = readRelayerArtifacts(
    captured.relayerArtifacts.destinationDirectory,
    relayerReceipt.artifacts,
  );
  const relayerClosure = buildSubstrateFederatedIsolatedDevnetRelayerClosureV1({
    target,
    gitCommitSha1Hex: relayerReceipt.headCommitSha1Hex,
    sourceArchive: relayerArtifacts.sourceArchive,
    packageLock: relayerArtifacts.packageLock,
    runtimeEntrypointsManifest: relayerArtifacts.runtimeEntrypoints,
    buildArtifact: relayerArtifacts.buildArtifact,
  });
  const activationGenerationIdHex = sha256CanonicalJson({
    targetDescriptorDigestHex: target.descriptorDigestHex,
    sourceHistoryDigestHex: sourceReceipt.historyDigestHex,
    ergoHistoryDigestHex: ergoHistory.historyDigestHex,
    relayerClosureDigestHex: relayerClosure.closureDigestHex,
  }, ACTIVATION_GENERATION_ID_DOMAIN);
  const statement = buildSubstrateFederatedIsolatedDevnetLaunchStatementV1({
    activationGenerationIdHex,
    target,
    ergoHistory,
    relayerClosure,
  });
  const signatures = signExactThreshold(
    signers,
    statement.attestationDigestHex,
  );
  const baseline = buildSubstrateFederatedIsolatedDevnetLaunchBaselineV1({
    statement,
    signatures,
  });
  const attestationPacket = Buffer.from(`${canonicalJson({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ATTESTATION_PACKET_V1_SCHEMA,
    version: 1,
    statement,
    signatures,
  })}\n`, 'utf8');
  const trustPins = Object.freeze({
    expectedTargetDescriptorDigestHex: target.descriptorDigestHex,
    expectedSourceAttestationKeySetDigestHex:
      profile.sourceAttestationKeySetDigestHex,
  });
  const artifacts = Object.freeze({
    trackerTemplate: Buffer.from(contracts.templates.tracker, 'utf8'),
    duplicatePreventionTemplate:
      Buffer.from(contracts.templates.duplicatePrevention, 'utf8'),
    sourceLockTemplate: Buffer.from(contracts.templates.sourceLock, 'utf8'),
    pooledReserveTemplate:
      Buffer.from(contracts.templates.pooledReserve, 'utf8'),
    sourceAcceptanceReport: sourceArtifacts.acceptanceReport,
    sourceReportedFinalizedBlocks: sourceArtifacts.reportedFinalizedBlocks,
    sourceRuntimeHistory: sourceArtifacts.runtimeHistory,
    sourceApplicationHistory: sourceArtifacts.applicationHistory,
    sourceHistoryReceipt: sourceArtifacts.historyReceipt,
    ergoGreatestWorkHeadersManifest: ergoArtifacts.greatestWorkHeaders,
    ergoTransactionsManifest: ergoArtifacts.transactions,
    ergoUtxoTransitionsManifest: ergoArtifacts.utxoTransitions,
    relayerSourceArchive: relayerArtifacts.sourceArchive,
    relayerPackageLock: relayerArtifacts.packageLock,
    relayerRuntimeEntrypointsManifest: relayerArtifacts.runtimeEntrypoints,
    relayerBuildArtifact: relayerArtifacts.buildArtifact,
    attestationPacket,
  });
  const portableReplayInput = Object.freeze({ artifacts, trustPins });
  const replay = await replaySubstrateFederatedIsolatedDevnetPortableV1(
    portableReplayInput,
  );
  if (
    replay.launch.targetDescriptorDigestHex !== target.descriptorDigestHex
    || replay.launch.statementDigestHex !== statement.statementDigestHex
    || replay.launch.attestationDigestHex !== statement.attestationDigestHex
    || replay.launch.baselineDigestHex !== baseline.baselineDigestHex
    || replay.launch.activationGenerationIdHex !== activationGenerationIdHex
  ) {
    throw new Error('isolated portable replay differs from the produced packet');
  }
  const artifactIdentities = artifactBindings(artifacts);
  const body = {
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PACKET_PRODUCER_V1_SCHEMA,
    version: 1 as const,
    status: 'process_owned_portable_packet_replayed' as const,
    targetDescriptorDigestHex: target.descriptorDigestHex,
    sourceAttestationKeySetDigestHex:
      profile.sourceAttestationKeySetDigestHex,
    statementDigestHex: statement.statementDigestHex,
    attestationDigestHex: statement.attestationDigestHex,
    baselineDigestHex: baseline.baselineDigestHex,
    activationGenerationIdHex,
    relayerArtifactSetDigestHex,
    packetArtifactSetDigestHex: sha256CanonicalJson(
      artifactIdentities,
      ARTIFACT_SET_DIGEST_DOMAIN,
    ),
    replayReportDigestHex: replay.reportDigestHex,
    artifacts: artifactIdentities,
    checks: {
      exactProcessOwnedSourceHistoryConsumed: true as const,
      exactProcessOwnedErgoHistoryConsumed: true as const,
      processOwnedSetupSignerBindingConsumed: true as const,
      activeSetupSignerBindingRevalidatedAtProduction: true as const,
      historyBytesSnapshottedBeforeAsynchronousWork: true as const,
      exactReviewedContractTemplatesCollected: true as const,
      exactPinnedJvmCompilerChainExecuted: true as const,
      realRelayerArtifactProducerInvoked: true as const,
      relayerArtifactFilesRehashedAfterPublication: true as const,
      sourceAndProfileIdsDerivedInProcess: true as const,
      predeclaredAuthorityProfilePinsMatched: true as const,
      exactThresholdPacketSignedOnce: true as const,
      trustPinsDerivedBeforePacketSerialization: true as const,
      portableReplayConsumerCompleted: true as const,
    },
    boundaries: falseBoundaries(),
  };
  const receipt = deepFreeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, RECEIPT_DIGEST_DOMAIN),
  });
  const result = Object.freeze({ receipt, portableReplayInput, replay });
  RESULTS.add(result);
  return result;
}

function captureInput(
  input: Readonly<ProduceSubstrateFederatedIsolatedDevnetPacketV1Input>,
): ProduceSubstrateFederatedIsolatedDevnetPacketV1Input {
  const record = exactDataRecord(input, [
    'sourceHistory',
    'ergoHistory',
    'expectedProfilePins',
    'relayerArtifacts',
  ], 'isolated portable packet input');
  const expectedProfilePins = exactDataRecord(record.expectedProfilePins, [
    'federationProfileIdHex',
    'sourceAttestationKeySetDigestHex',
    'ergoAdmissionKeySetDigestHex',
  ], 'isolated portable packet expected authority-profile pins');
  const relayerArtifacts = exactDataRecord(record.relayerArtifacts, [
    'bridgeRoot',
    'gitExecutable',
    'wasmPackExecutable',
    'expectedHeadCommitSha1Hex',
    'destinationDirectory',
  ], 'isolated portable packet relayer-artifact input');
  return Object.freeze({
    sourceHistory: record.sourceHistory as Readonly<
      SubstrateFederatedAuthoritySafeDevnetHistoryV1
    >,
    ergoHistory: record.ergoHistory as Readonly<
      | SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1
      | SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2
    >,
    expectedProfilePins: Object.freeze({
      federationProfileIdHex:
        expectedProfilePins.federationProfileIdHex as string,
      sourceAttestationKeySetDigestHex:
        expectedProfilePins.sourceAttestationKeySetDigestHex as string,
      ergoAdmissionKeySetDigestHex:
        expectedProfilePins.ergoAdmissionKeySetDigestHex as string,
    }),
    relayerArtifacts: Object.freeze({
      bridgeRoot: relayerArtifacts.bridgeRoot as string,
      gitExecutable: relayerArtifacts.gitExecutable as string,
      wasmPackExecutable: relayerArtifacts.wasmPackExecutable as string,
      expectedHeadCommitSha1Hex:
        relayerArtifacts.expectedHeadCommitSha1Hex as string,
      destinationDirectory:
        relayerArtifacts.destinationDirectory as string,
    }),
  });
}

function snapshotSourceHistory(
  history: Readonly<SubstrateFederatedAuthoritySafeDevnetHistoryV1>,
) {
  return Object.freeze({
    acceptanceReport: Buffer.from(history.artifacts.acceptanceReport),
    reportedFinalizedBlocks:
      Buffer.from(history.artifacts.reportedFinalizedBlocksManifest),
    runtimeHistory: Buffer.from(history.artifacts.runtimeHistoryManifest),
    applicationHistory:
      Buffer.from(history.artifacts.applicationHistoryManifest),
    historyReceipt: Buffer.from(`${canonicalJson(history.receipt)}\n`, 'utf8'),
  });
}

function snapshotErgoHistory(
  history: Readonly<
    | SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1
    | SubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2
  >,
) {
  return Object.freeze({
    greatestWorkHeaders:
      Buffer.from(history.artifacts.greatestWorkHeadersManifest, 'utf8'),
    transactions: Buffer.from(history.artifacts.transactionsManifest, 'utf8'),
    utxoTransitions:
      Buffer.from(history.artifacts.utxoTransitionsManifest, 'utf8'),
  });
}

function deriveApplicationBinding(
  target: Readonly<SubstrateFederatedAuthoritySafeDevnetHistoryV1['receipt']['target']>,
) {
  const sourceNetworkIdHex = sha256CanonicalJson({
    sourceNetworkScope: 'isolated-devnet',
    nativeGenesisHashHex: target.nativeGenesisHashHex,
    generatedSpecSha256Hex: target.generatedSpecSha256Hex,
  }, SOURCE_NETWORK_ID_DOMAIN);
  const sidechainIdHex = sha256CanonicalJson({
    sourceNetworkIdHex,
    bridgeAddressHex: target.bridgeAddressHex,
    tokenAddressHex: target.tokenAddressHex,
  }, SIDECHAIN_ID_DOMAIN);
  const runtimeProfileIdHex = sha256CanonicalJson({
    sourceRuntimeCodeSha256Hex: target.sourceRuntimeCodeSha256Hex,
    sourceRuntimeCodeBytes: target.sourceRuntimeCodeBytes,
    bridgeAddressHex: target.bridgeAddressHex,
    bridgeRuntimeCodeSha256Hex: target.bridgeRuntimeCodeSha256Hex,
    bridgeRuntimeCodeBytes: target.bridgeRuntimeCodeBytes,
    tokenAddressHex: target.tokenAddressHex,
    tokenRuntimeCodeSha256Hex: target.tokenRuntimeCodeSha256Hex,
    tokenRuntimeCodeBytes: target.tokenRuntimeCodeBytes,
  }, RUNTIME_PROFILE_ID_DOMAIN);
  const settlementProfileIdHex = sha256CanonicalJson({
    settlementNetworkId: 'ergo-testnet',
    sourceNetworkIdHex,
    sidechainIdHex,
    settlementFamily: 'substrate-federated-v1',
    settlementAsset: 'native-erg-v1',
  }, SETTLEMENT_PROFILE_ID_DOMAIN);
  return Object.freeze({
    sourceNetworkIdHex,
    sidechainIdHex,
    bridgeAddressHex: target.bridgeAddressHex,
    tokenAddressHex: target.tokenAddressHex,
    bridgeRuntimeCodeSha256Hex: target.bridgeRuntimeCodeSha256Hex,
    bridgeRuntimeCodeBytes: target.bridgeRuntimeCodeBytes,
    tokenRuntimeCodeSha256Hex: target.tokenRuntimeCodeSha256Hex,
    tokenRuntimeCodeBytes: target.tokenRuntimeCodeBytes,
    sourceRuntimeCodeSha256Hex: target.sourceRuntimeCodeSha256Hex,
    sourceRuntimeCodeBytes: target.sourceRuntimeCodeBytes,
    runtimeProfileIdHex,
    settlementProfileIdHex,
  });
}

function assertGenesisInputsMatch(
  lineages: Readonly<{
    readonly tracker: Readonly<{ readonly genesisInputBoxIdHex: string }>;
    readonly duplicatePrevention:
      Readonly<{ readonly genesisInputBoxIdHex: string }>;
    readonly pooledReserve:
      Readonly<{ readonly genesisInputBoxIdHex: string }>;
  }>,
  expected: Readonly<{
    readonly tracker: string;
    readonly duplicatePrevention: string;
    readonly pooledReserve: string;
  }>,
): void {
  if (
    lineages.tracker.genesisInputBoxIdHex !== expected.tracker
    || lineages.duplicatePrevention.genesisInputBoxIdHex
      !== expected.duplicatePrevention
    || lineages.pooledReserve.genesisInputBoxIdHex !== expected.pooledReserve
  ) {
    throw new Error('isolated portable packet compiler lineages differ from Ergo history');
  }
}

function assertExpectedProfilePins(
  profile: Readonly<ReturnType<typeof buildSubstrateFederatedCheckpointProfileV1>>,
  expected: Readonly<
    ProduceSubstrateFederatedIsolatedDevnetPacketV1Input['expectedProfilePins']
  >,
): void {
  const pairs = [
    [profile.profileIdHex, expected.federationProfileIdHex, 'federation profile'],
    [
      profile.sourceAttestationKeySetDigestHex,
      expected.sourceAttestationKeySetDigestHex,
      'source-attestation key set',
    ],
    [
      profile.ergoAdmissionKeySetDigestHex,
      expected.ergoAdmissionKeySetDigestHex,
      'Ergo-admission key set',
    ],
  ] as const;
  for (const [actual, pinned, label] of pairs) {
    if (actual !== pinned) {
      throw new Error(`isolated portable packet ${label} pin differs`);
    }
  }
}

function signExactThreshold(
  signers: readonly SourceSigner[],
  digestHex: string,
): readonly Readonly<SubstrateFederatedIsolatedDevnetLaunchSignatureV1>[] {
  if (
    signers.length
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_KEY_COUNT
  ) {
    throw new Error('isolated packet source-attestation capability is unavailable');
  }
  return deepFreeze(signers.slice(
    0,
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD,
  ).map(value => ({
    signerPublicKeyHex: value.publicKeyHex,
    signatureHex: sign(
      null,
      Buffer.from(digestHex, 'hex'),
      value.privateKey,
    ).toString('hex'),
  })));
}

function sourceSigner(): SourceSigner {
  const { privateKey } = generateKeyPairSync('ed25519');
  const publicKeyDer = createPublicKey(privateKey).export({
    format: 'der',
    type: 'spki',
  });
  return Object.freeze({
    privateKey,
    publicKeyHex: Buffer.from(publicKeyDer).subarray(-32).toString('hex'),
  });
}

function readRelayerArtifacts(
  destinationDirectory: string,
  identities: Readonly<Record<
    'sourceArchive' | 'packageLock' | 'runtimeEntrypoints' | 'buildArtifact',
    Readonly<SubstrateFederatedIsolatedDevnetRelayerArtifactIdentityV1>
  >>,
) {
  const read = (
    role: keyof typeof identities,
    expectedFile: string,
  ): Buffer => {
    const identity = identities[role];
    if (identity.file !== expectedFile) {
      throw new Error(`isolated relayer ${role} file identity drifted`);
    }
    const path = join(destinationDirectory, expectedFile);
    const before = lstatSync(path, { bigint: true });
    if (
      !isStableSingleLinkFile(before)
      || realpathSync(path) !== path
      || before.size !== BigInt(identity.sizeBytes)
      || before.size <= 0n
      || before.size > BigInt(MAX_ARTIFACT_BYTES)
    ) {
      throw new Error(`isolated relayer ${role} artifact is not stable`);
    }
    const bytes = readFileSync(path);
    const after = lstatSync(path, { bigint: true });
    if (
      !sameStableFile(before, after)
      || bytes.byteLength !== identity.sizeBytes
      || sha256(bytes) !== identity.sha256Hex
    ) {
      throw new Error(`isolated relayer ${role} artifact content drifted`);
    }
    return Buffer.from(bytes);
  };
  return Object.freeze({
    sourceArchive: read(
      'sourceArchive',
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACT_FILES_V1.sourceArchive,
    ),
    packageLock: read(
      'packageLock',
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACT_FILES_V1.packageLock,
    ),
    runtimeEntrypoints: read(
      'runtimeEntrypoints',
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACT_FILES_V1.runtimeEntrypoints,
    ),
    buildArtifact: read(
      'buildArtifact',
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_RELAYER_ARTIFACT_FILES_V1.buildArtifact,
    ),
  });
}

function artifactBindings(
  artifacts: Readonly<Record<string, Uint8Array>>,
): Readonly<Record<string, Readonly<ByteArtifactV1>>> {
  return deepFreeze(Object.fromEntries(Object.entries(artifacts).map(
    ([role, bytes]) => [role, {
      sizeBytes: bytes.byteLength,
      sha256Hex: sha256(bytes),
    }],
  )));
}

function exactDataRecord<K extends string>(
  value: unknown,
  keys: readonly K[],
  label: string,
): Record<K, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors).sort(compareStrings);
  const expected = [...keys].sort(compareStrings);
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly: ${expected.join(', ')}`);
  }
  const result = Object.create(null) as Record<K, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || !descriptor.enumerable
      || !('value' in descriptor)
    ) {
      throw new Error(`${label} fields must be enumerable data properties`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function isStableSingleLinkFile(stat: BigIntStats): boolean {
  return stat.isFile()
    && !stat.isSymbolicLink()
    && stat.nlink === 1n
    && stat.dev > 0n
    && stat.ino > 0n;
}

function sameStableFile(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function falseBoundaries() {
  return Object.freeze({
    sourceAttestationKeysShareOneProcessCustody: true as const,
    sourceAttestationPrivateKeysRetainedAfterPacket: false as const,
    operationalSourceAttestationCapabilityEstablished: false as const,
    packetEligibleForActivation: false as const,
    independentAttestorCustodyEstablished: false as const,
    sourceConsensusIndependentlyVerified: false as const,
    ergoConsensusIndependentlyVerified: false as const,
    nodeExecutableIdentityAuthenticated: false as const,
    targetNodeAcceptanceEstablished: false as const,
    setupTransactionConstructed: false as const,
    setupTransactionSigned: false as const,
    submissionAuthorityEstablished: false as const,
    broadcastAuthorityEstablished: false as const,
    profileActivated: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function compareStrings(left: string, right: string): number {
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
