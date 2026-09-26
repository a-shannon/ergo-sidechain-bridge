import {
  sha256CanonicalJson,
} from '../../ergo-settlement-core/strict-json.js';
import {
  assertReserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1ResultProvenance,
  substrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationDigestHexV1,
  substrateFederatedIsolatedDevnetTrackerAdmissionPersistenceStoreIdentityHexV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_V1_SCHEMA,
  type ReserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1Input,
  type ReserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1Result,
} from '../../state-tracker.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Provenance,
  type FrozenObservedAnchorTrackerCheckCampaignRootV7ProvenanceReceipt,
} from './substrate-federated-isolated-devnet-frozen-tracker-root-v7-provenance.js';
import {
  deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1,
} from '../../relayer-core/substrate-federated-isolated-devnet-checkpoint-extension-observation-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_OPERATION_PROFILE_V1 =
  Object.freeze({
    schema:
      'e2s.substrate-federated-isolated-devnet-tracker-admission-reservation-operation-profile.v1',
    version: 1 as const,
    sourceProfileFamily: 'substrate-frontier-federated-v1' as const,
    trackerProfileFamily: 'substrate-federated-v1' as const,
    target: 'isolated-local-devnet' as const,
    authorityScope: 'durable-reservation-only' as const,
    signedTransactionBytesPersisted: false as const,
    signingCapabilityExposed: false as const,
    submissionCapabilityExposed: false as const,
    broadcastCapabilityExposed: false as const,
  });

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_OPERATION_PROFILE_DIGEST_V1 =
  sha256CanonicalJson(
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_OPERATION_PROFILE_V1,
    'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_OPERATION_PROFILE_V1',
  );

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_AUTHORIZATION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-admission-reservation-authorization.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_DURABLE_RESERVATION_V1_SCHEMA =
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_V1_SCHEMA;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_DURABLE_RESERVATION_RECEIPT_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-tracker-admission-durable-reservation-receipt.v1' as const;

const AUTHORIZATION_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_AUTHORIZATION_V1';
const RESERVATION_IDENTITY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_IDENTITY_V1';
const SOURCE_PROFILE_BINDING_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_SOURCE_PROFILE_BINDING_V1';
const TRACKER_SETUP_BINDING_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_SETUP_BINDING_V1';
const CHECKPOINT_ANCHOR_BINDING_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_CHECKPOINT_ANCHOR_BINDING_V1';
const FROZEN_TARGET_BINDING_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_FROZEN_TARGET_BINDING_V1';
const TRACKER_CANDIDATE_BINDING_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_CANDIDATE_BINDING_V1';
const JVM_CHECK_BINDING_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_JVM_CHECK_BINDING_V1';
const CHECKER_IDENTITY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_CHECKER_IDENTITY_V1';
const SIGNER_IDENTITY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_SIGNER_IDENTITY_V1';
const ENCODED_STATEMENT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_ENCODED_STATEMENT_V1';
const DURABLE_RESERVATION_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_DURABLE_RESERVATION_RECEIPT_V1';

const CONSUMED_ROOT_RECEIPTS = new WeakSet<object>();
const AUTHORIZATIONS = new WeakMap<object, Readonly<{
  readonly rootReceiptDigestHex: string;
  readonly reservationIdentityHex: string;
  readonly authorizationDigestHex: string;
}>>();
const AUTHORIZATION_PERSISTENCE_STORES = new WeakMap<object, string>();
const DURABLE_RESERVATION_RECEIPTS = new WeakMap<object, Readonly<{
  readonly persistenceStoreIdentityHex: string;
  readonly reservationIdentityHex: string;
  readonly durableReservationDigestHex: string;
  readonly receiptDigestHex: string;
}>>();

export interface SubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_AUTHORIZATION_V1_SCHEMA;
  readonly version: 1;
  readonly status:
    'exact_frozen_tracker_check_authorized_for_durable_reservation';
  readonly operationProfileDigestHex: string;
  readonly rootReceiptDigestHex: string;
  readonly reservationIdentityHex: string;
  readonly sourceProfile: Readonly<{
    readonly statementVersion: 1;
    readonly hashAlgorithmId: 1;
    readonly finalityRuleId: 1;
    readonly flags: 0;
    readonly sourceNetworkIdHex: string;
    readonly sidechainIdHex: string;
    readonly sourceNativeBlockHeight: string;
    readonly sourceNativeBlockHashHex: string;
    readonly executionBlockHashHex: string;
    readonly bridgeEventRootHex: string;
    readonly burnLeafCount: number;
    readonly bridgeAddressHex: string;
    readonly tokenAddressHex: string;
    readonly bridgeRuntimeCodeSha256Hex: string;
    readonly bridgeRuntimeCodeBytes: number;
    readonly tokenRuntimeCodeSha256Hex: string;
    readonly tokenRuntimeCodeBytes: number;
    readonly sourceRuntimeCodeSha256Hex: string;
    readonly sourceRuntimeCodeBytes: number;
    readonly runtimeProfileIdHex: string;
    readonly settlementProfileIdHex: string;
    readonly federationProfileIdHex: string;
    readonly sourceAttestationKeySetDigestHex: string;
    readonly sourceAttestationThreshold: number;
    readonly ergoAdmissionKeySetDigestHex: string;
    readonly ergoAdmissionThreshold: number;
    readonly federationEpoch: string;
    readonly admissionValidFromErgoHeight: string;
    readonly admissionExpiresAtErgoHeight: string;
    readonly statementIdHex: string;
    readonly encodedStatementDigestHex: string;
    readonly targetDescriptorDigestHex: string;
    readonly packetReceiptDigestHex: string;
    readonly mintSourceProofReceiptDigestHex: string;
    readonly applicationRunnerReceiptDigestHex: string;
    readonly checkpointReceiptDigestHex: string;
    readonly burnIdHex: string;
  }>;
  readonly trackerSetup: Readonly<{
    readonly transactionIdHex: string;
    readonly outputBoxIdHex: string;
    readonly outputIndex: 0;
    readonly outputCreationHeight: number;
    readonly confirmationDigestHex: string;
    readonly confirmationHeight: number;
    readonly confirmationHeaderIdHex: string;
    readonly observedAtHeight: number;
  }>;
  readonly checkpointAnchor: Readonly<{
    readonly extensionKeyHex: '0401';
    readonly extensionValueHex: string;
    readonly anchorHeaderIdHex: string;
    readonly anchorHeight: number;
    readonly anchorExtensionRootHex: string;
    readonly initialObservationDigestHex: string;
    readonly frozenObservationDigestHex: string;
  }>;
  readonly frozenTarget: Readonly<{
    readonly targetGenesisHeaderIdHex: string;
    readonly processBindingDigestHex: string;
    readonly executionTargetIdentityDigestHex: string;
    readonly buildIdentityDigestHex: string;
    readonly executableIdentityDigestHex: string;
    readonly snapshotHeight: number;
    readonly snapshotHeaderIdHex: string;
    readonly snapshotDigestHex: string;
  }>;
  readonly trackerCandidate: Readonly<{
    readonly trustModel: 'federated_non_trustless';
    readonly contractIdHex: string;
    readonly trackerNftIdHex: string;
    readonly statementIdHex: string;
    readonly inputBoxIdHex: string;
    readonly trackerKeyHex: string;
    readonly trackerValueDigestHex: string;
    readonly inputDigestHex: string;
    readonly successorDigestHex: string;
    readonly currentErgoHeight: number;
    readonly anchorContextIndex: number;
    readonly contextExtensionDigestHex: string;
    readonly prooflessTransactionBytes: number;
    readonly unsignedTransactionIdHex: string;
  }>;
  readonly jvmCheck: Readonly<{
    readonly unsignedTransactionIdHex: string;
    readonly unsignedTransactionDigestHex: string;
    readonly checkedTransactionCanonicalJsonDigestHex: string;
    readonly checkedTransactionBytesDigestHex: string;
    readonly checkedTransactionBytesLength: number;
    readonly checkResponseDigestHex: string;
    readonly signerIdentityDigestHex: string;
    readonly checkerIdentityDigestHex: string;
    readonly stateContextTipHeight: number;
    readonly stateContextTipIdHex: string;
  }>;
  readonly bindings: Readonly<{
    readonly sourceProfileDigestHex: string;
    readonly trackerSetupDigestHex: string;
    readonly checkpointAnchorDigestHex: string;
    readonly frozenTargetDigestHex: string;
    readonly trackerCandidateDigestHex: string;
    readonly jvmCheckDigestHex: string;
  }>;
  readonly boundaries: Readonly<{
    readonly localIsolatedDevnetOnly: true;
    readonly exactProcessProvenRootConsumed: true;
    readonly structuralRevalidationCompleted: true;
    readonly reservationAuthorityEstablished: true;
    readonly durableReservationEstablished: false;
    readonly signedTransactionBytesPersisted: false;
    readonly signingCapabilityExposed: false;
    readonly deterministicSourceFinalityEstablished: false;
    readonly ergoPowAuthenticated: false;
    readonly profileActivated: false;
    readonly mintAuthorized: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly trackerAdmissionEstablished: false;
    readonly globalReplayInsertionEstablished: false;
    readonly payoutAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
  }>;
  readonly authorizationDigestHex: string;
}

export interface SubstrateFederatedIsolatedDevnetTrackerAdmissionReservationPersistencePortV1 {
  reserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1(
    input: Readonly<
      ReserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1Input
    >,
  ): Readonly<ReserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1Result>;
}

export interface SubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_DURABLE_RESERVATION_RECEIPT_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'exact_tracker_admission_reservation_persisted';
  readonly reservationIdentityHex: string;
  readonly durableReservationDigestHex: string;
  readonly operationProfileDigestHex: string;
  readonly authorizationDigestHex: string;
  readonly rootReceiptDigestHex: string;
  readonly bindings: Readonly<{
    readonly sourceProfileDigestHex: string;
    readonly trackerSetupDigestHex: string;
    readonly checkpointAnchorDigestHex: string;
    readonly frozenTargetDigestHex: string;
    readonly trackerCandidateDigestHex: string;
    readonly jvmCheckDigestHex: string;
    readonly statementIdHex: string;
    readonly trackerInputBoxIdHex: string;
    readonly unsignedTransactionIdHex: string;
    readonly anchorHeaderIdHex: string;
    readonly targetIdentityDigestHex: string;
  }>;
  readonly boundaries: Readonly<{
    readonly localIsolatedDevnetOnly: true;
    readonly exactAuthorizationConsumed: true;
    readonly durableReservationEstablished: true;
    readonly localDatabaseAuthoritative: false;
    readonly signedTransactionBytesPersisted: false;
    readonly signingCapabilityExposed: false;
    readonly deterministicSourceFinalityEstablished: false;
    readonly ergoPowAuthenticated: false;
    readonly profileActivated: false;
    readonly mintAuthorized: false;
    readonly submissionAuthorityEstablished: false;
    readonly broadcastAuthorityEstablished: false;
    readonly trackerAdmissionEstablished: false;
    readonly globalReplayInsertionEstablished: false;
    readonly payoutAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
    readonly publicNetworkUsed: false;
    readonly realFundsUsed: false;
    readonly existingWalletMaterialUsed: false;
  }>;
  readonly receiptDigestHex: string;
}

export function authorizeSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1(
  root: Readonly<
    FrozenObservedAnchorTrackerCheckCampaignRootV7ProvenanceReceipt
  >,
): Readonly<
  SubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1
> {
  assertSubstrateFederatedIsolatedDevnetPegInFrozenObservedAnchorTrackerCheckCampaignRootV7Provenance(
    root,
  );
  if (CONSUMED_ROOT_RECEIPTS.has(root)) {
    throw new Error(
      'isolated devnet frozen tracker-check root V7 was already consumed for reservation authorization',
    );
  }

  const application = root.application.applicationCheckpoint;
  const statement =
    application.checkpoint.checkpointAttestation.checkpointStatement;
  const setup = root.tracker.trackerSetup;
  const initialAnchor = root.checkpointAnchor.observation;
  const frozenObservation = root.tracker.observation;
  const frozenExecution = root.tracker.execution;
  const candidate = root.tracker.candidate;
  const check = root.tracker.check;
  const expectedCheckpointExtensionObservationDigestHex =
    deriveSubstrateFederatedIsolatedDevnetCheckpointExtensionObservationDigestFromAnchorV1(
      initialAnchor,
    );

  const bridgeEventRootHex = fixedHex(
    statement.bridgeEventRootHex,
    32,
    'checkpoint statement bridge event root',
  );
  const statementIdHex = fixedHex(
    statement.statementIdHex,
    32,
    'checkpoint statement ID',
  );
  const expectedExtensionValueHex = bridgeEventRootHex + statementIdHex;
  if (
    fixedHex(application.binding.bridgeEventRootHex, 32, 'application bridge event root')
      !== bridgeEventRootHex
    || fixedHex(candidate.statementIdHex, 32, 'tracker candidate statement ID')
      !== statementIdHex
    || fixedHex(check.statementIdHex, 32, 'tracker check statement ID')
      !== statementIdHex
    || fixedHex(initialAnchor.extensionValueHex, 64, 'initial checkpoint extension value')
      !== expectedExtensionValueHex
    || fixedHex(frozenObservation.extensionValueHex, 64, 'frozen checkpoint extension value')
      !== expectedExtensionValueHex
    || fixedHex(frozenExecution.extensionValueHex, 64, 'frozen execution extension value')
      !== expectedExtensionValueHex
  ) {
    throw new Error(
      'isolated devnet tracker reservation authorization checkpoint binding changed',
    );
  }

  if (
    initialAnchor.extensionKeyHex !== '0401'
    || frozenObservation.extensionKeyHex !== '0401'
    || frozenExecution.extensionKeyHex !== '0401'
    || setup.outputIndex !== 0
    || setup.outputCreationHeight < 0
    || setup.confirmationHeight < setup.outputCreationHeight
    || setup.observedAtHeight < setup.confirmationHeight
    || fixedHex(setup.outputBoxIdHex, 32, 'confirmed tracker setup output')
      !== fixedHex(candidate.inputBoxIdHex, 32, 'tracker candidate input')
    || fixedHex(setup.outputBoxIdHex, 32, 'confirmed tracker setup output')
      !== fixedHex(check.trackerInputBoxIdHex, 32, 'tracker check input')
    || fixedHex(candidate.unsignedTransactionIdHex, 32, 'tracker candidate transaction ID')
      !== fixedHex(check.unsignedTransactionIdHex, 32, 'checked unsigned transaction ID')
    || fixedHex(check.signedTransactionIdHex, 32, 'checked signed transaction ID')
      !== fixedHex(check.unsignedTransactionIdHex, 32, 'checked unsigned transaction ID')
    || fixedHex(initialAnchor.anchorHeaderIdHex, 32, 'initial anchor header ID')
      !== fixedHex(frozenObservation.anchorHeaderIdHex, 32, 'frozen anchor header ID')
    || initialAnchor.anchorHeight !== frozenObservation.anchorHeight
    || fixedHex(initialAnchor.anchorExtensionRootHex, 32, 'initial anchor extension root')
      !== fixedHex(frozenObservation.anchorExtensionRootHex, 32, 'frozen anchor extension root')
    || fixedHex(frozenObservation.anchorHeaderIdHex, 32, 'frozen anchor header ID')
      !== fixedHex(check.anchorHeaderIdHex, 32, 'checked anchor header ID')
    || frozenObservation.anchorHeight !== check.anchorHeight
    || frozenObservation.anchorContextIndex !== check.anchorContextIndex
    || frozenObservation.anchorContextIndex !== candidate.anchorContextIndex
    || frozenExecution.checkpointExtensionObservationDigestHex
      !== expectedCheckpointExtensionObservationDigestHex
    || frozenObservation.processBindingDigestHex
      !== frozenExecution.processBindingDigestHex
    || check.target.processBindingDigestHex
      !== frozenExecution.processBindingDigestHex
    || frozenObservation.executionTargetIdentityDigestHex
      !== frozenExecution.executionTargetIdentityDigestHex
    || check.target.executionTargetIdentityDigestHex
      !== frozenExecution.executionTargetIdentityDigestHex
    || frozenExecution.actionStartSnapshot.fullHeight
      !== frozenExecution.actionEndSnapshot.fullHeight
    || frozenExecution.actionStartSnapshot.indexedHeight
      !== frozenExecution.actionEndSnapshot.indexedHeight
    || frozenExecution.actionStartSnapshot.headerIdHex
      !== frozenExecution.actionEndSnapshot.headerIdHex
    || check.signer.stateContextTipHeight
      !== frozenExecution.actionEndSnapshot.fullHeight
    || check.signer.stateContextTipIdHex
      !== frozenExecution.actionEndSnapshot.headerIdHex
  ) {
    throw new Error(
      'isolated devnet tracker reservation authorization target or candidate binding changed',
    );
  }

  assertReservationOnlyBoundaries(root);

  const sourceProfile = Object.freeze({
    statementVersion: exactLiteral(statement.version, 1, 'checkpoint statement version'),
    hashAlgorithmId: exactLiteral(statement.hashAlgorithmId, 1, 'checkpoint hash algorithm'),
    finalityRuleId: exactLiteral(statement.finalityRuleId, 1, 'checkpoint finality rule'),
    flags: exactLiteral(statement.flags, 0, 'checkpoint statement flags'),
    sourceNetworkIdHex: fixedHex(statement.sourceNetworkIdHex, 32, 'source network ID'),
    sidechainIdHex: fixedHex(statement.sidechainIdHex, 32, 'sidechain ID'),
    sourceNativeBlockHeight: unsignedDecimal(statement.sourceNativeBlockHeight, 'source native block height'),
    sourceNativeBlockHashHex: fixedHex(statement.sourceNativeBlockHashHex, 32, 'source native block hash'),
    executionBlockHashHex: fixedHex(statement.executionBlockHashHex, 32, 'execution block hash'),
    bridgeEventRootHex,
    burnLeafCount: positiveInteger(statement.burnLeafCount, 'burn leaf count'),
    bridgeAddressHex: fixedHex(statement.bridgeAddressHex, 20, 'bridge address'),
    tokenAddressHex: fixedHex(statement.tokenAddressHex, 20, 'token address'),
    bridgeRuntimeCodeSha256Hex: fixedHex(statement.bridgeRuntimeCodeSha256Hex, 32, 'bridge runtime code digest'),
    bridgeRuntimeCodeBytes: positiveInteger(statement.bridgeRuntimeCodeBytes, 'bridge runtime code bytes'),
    tokenRuntimeCodeSha256Hex: fixedHex(statement.tokenRuntimeCodeSha256Hex, 32, 'token runtime code digest'),
    tokenRuntimeCodeBytes: positiveInteger(statement.tokenRuntimeCodeBytes, 'token runtime code bytes'),
    sourceRuntimeCodeSha256Hex: fixedHex(statement.sourceRuntimeCodeSha256Hex, 32, 'source runtime code digest'),
    sourceRuntimeCodeBytes: positiveInteger(statement.sourceRuntimeCodeBytes, 'source runtime code bytes'),
    runtimeProfileIdHex: fixedHex(statement.runtimeProfileIdHex, 32, 'runtime profile ID'),
    settlementProfileIdHex: fixedHex(statement.settlementProfileIdHex, 32, 'settlement profile ID'),
    federationProfileIdHex: fixedHex(statement.federationProfileIdHex, 32, 'federation profile ID'),
    sourceAttestationKeySetDigestHex: fixedHex(statement.sourceAttestationKeySetDigestHex, 32, 'source attestation key-set digest'),
    sourceAttestationThreshold: positiveInteger(statement.sourceAttestationThreshold, 'source attestation threshold'),
    ergoAdmissionKeySetDigestHex: fixedHex(statement.ergoAdmissionKeySetDigestHex, 32, 'Ergo admission key-set digest'),
    ergoAdmissionThreshold: positiveInteger(statement.ergoAdmissionThreshold, 'Ergo admission threshold'),
    federationEpoch: unsignedDecimal(statement.federationEpoch, 'federation epoch'),
    admissionValidFromErgoHeight: unsignedDecimal(statement.admissionValidFromErgoHeight, 'admission valid-from height'),
    admissionExpiresAtErgoHeight: unsignedDecimal(statement.admissionExpiresAtErgoHeight, 'admission expiry height'),
    statementIdHex,
    encodedStatementDigestHex: sha256CanonicalJson(
      canonicalEvenHex(statement.encodedStatementHex, 'encoded checkpoint statement'),
      ENCODED_STATEMENT_DIGEST_DOMAIN,
    ),
    targetDescriptorDigestHex: fixedHex(application.binding.targetDescriptorDigestHex, 32, 'target descriptor digest'),
    packetReceiptDigestHex: fixedHex(application.binding.packetReceiptDigestHex, 32, 'packet receipt digest'),
    mintSourceProofReceiptDigestHex: fixedHex(application.binding.mintSourceProofReceiptDigestHex, 32, 'mint source proof receipt digest'),
    applicationRunnerReceiptDigestHex: fixedHex(application.binding.applicationRunnerReceiptDigestHex, 32, 'application runner receipt digest'),
    checkpointReceiptDigestHex: fixedHex(application.binding.checkpointReceiptDigestHex, 32, 'checkpoint receipt digest'),
    burnIdHex: fixedHex(application.binding.burnIdHex, 32, 'burn ID'),
  });
  if (
    BigInt(sourceProfile.admissionExpiresAtErgoHeight)
      < BigInt(sourceProfile.admissionValidFromErgoHeight)
  ) {
    throw new Error('checkpoint admission window is inverted');
  }

  const trackerSetup = Object.freeze({
    transactionIdHex: fixedHex(setup.expectedTxId, 32, 'tracker setup transaction ID'),
    outputBoxIdHex: fixedHex(setup.outputBoxIdHex, 32, 'tracker setup output box ID'),
    outputIndex: 0 as const,
    outputCreationHeight: nonNegativeInteger(setup.outputCreationHeight, 'tracker setup output creation height'),
    confirmationDigestHex: fixedHex(setup.confirmationDigestHex, 32, 'tracker setup confirmation digest'),
    confirmationHeight: nonNegativeInteger(setup.confirmationHeight, 'tracker setup confirmation height'),
    confirmationHeaderIdHex: fixedHex(setup.confirmationHeaderIdHex, 32, 'tracker setup confirmation header ID'),
    observedAtHeight: nonNegativeInteger(setup.observedAtHeight, 'tracker setup observation height'),
  });
  const checkpointAnchor = Object.freeze({
    extensionKeyHex: '0401' as const,
    extensionValueHex: expectedExtensionValueHex,
    anchorHeaderIdHex: fixedHex(initialAnchor.anchorHeaderIdHex, 32, 'checkpoint anchor header ID'),
    anchorHeight: nonNegativeInteger(initialAnchor.anchorHeight, 'checkpoint anchor height'),
    anchorExtensionRootHex: fixedHex(initialAnchor.anchorExtensionRootHex, 32, 'checkpoint anchor extension root'),
    initialObservationDigestHex: fixedHex(initialAnchor.observationDigestHex, 32, 'checkpoint anchor observation digest'),
    frozenObservationDigestHex: fixedHex(frozenObservation.observationDigestHex, 32, 'frozen checkpoint observation digest'),
  });
  const frozenSnapshot = Object.freeze({
    fullHeight: nonNegativeInteger(frozenExecution.actionEndSnapshot.fullHeight, 'frozen snapshot height'),
    indexedHeight: nonNegativeInteger(frozenExecution.actionEndSnapshot.indexedHeight, 'frozen snapshot indexed height'),
    headerIdHex: fixedHex(frozenExecution.actionEndSnapshot.headerIdHex, 32, 'frozen snapshot header ID'),
  });
  const frozenTarget = Object.freeze({
    targetGenesisHeaderIdHex: fixedHex(frozenObservation.targetGenesisHeaderIdHex, 32, 'target genesis header ID'),
    processBindingDigestHex: fixedHex(frozenExecution.processBindingDigestHex, 32, 'process binding digest'),
    executionTargetIdentityDigestHex: fixedHex(frozenExecution.executionTargetIdentityDigestHex, 32, 'execution target identity digest'),
    buildIdentityDigestHex: fixedHex(frozenExecution.buildIdentityDigestHex, 32, 'build identity digest'),
    executableIdentityDigestHex: fixedHex(frozenExecution.executableIdentityDigestHex, 32, 'executable identity digest'),
    snapshotHeight: frozenSnapshot.fullHeight,
    snapshotHeaderIdHex: frozenSnapshot.headerIdHex,
    snapshotDigestHex: sha256CanonicalJson(
      frozenSnapshot,
      FROZEN_TARGET_BINDING_DIGEST_DOMAIN,
    ),
  });
  const trackerCandidate = Object.freeze({
    trustModel: exactLiteral(candidate.trustModel, 'federated_non_trustless', 'tracker trust model'),
    contractIdHex: fixedHex(candidate.contractIdHex, 32, 'tracker contract ID'),
    trackerNftIdHex: fixedHex(candidate.trackerNftIdHex, 32, 'tracker NFT ID'),
    statementIdHex,
    inputBoxIdHex: trackerSetup.outputBoxIdHex,
    trackerKeyHex: fixedHex(candidate.trackerKeyHex, 32, 'tracker key'),
    trackerValueDigestHex: sha256CanonicalJson(
      canonicalEvenHex(candidate.trackerValueHex, 'tracker value'),
      TRACKER_CANDIDATE_BINDING_DIGEST_DOMAIN,
    ),
    inputDigestHex: canonicalEvenHex(candidate.inputDigestHex, 'tracker input digest'),
    successorDigestHex: canonicalEvenHex(candidate.successorDigestHex, 'tracker successor digest'),
    currentErgoHeight: nonNegativeInteger(candidate.currentErgoHeight, 'tracker current Ergo height'),
    anchorContextIndex: nonNegativeInteger(candidate.anchorContextIndex, 'tracker anchor context index'),
    contextExtensionDigestHex: sha256CanonicalJson(
      canonicalEvenHex(candidate.contextExtensionSerializedHex, 'tracker context extension'),
      TRACKER_CANDIDATE_BINDING_DIGEST_DOMAIN,
    ),
    prooflessTransactionBytes: positiveInteger(candidate.prooflessTransactionBytes, 'proofless transaction bytes'),
    unsignedTransactionIdHex: fixedHex(candidate.unsignedTransactionIdHex, 32, 'tracker unsigned transaction ID'),
  });
  const signerIdentityDigestHex = sha256CanonicalJson({
    derivation: exactLiteral(check.signer.derivation, 'wasm-root', 'tracker signer derivation'),
    publicKeyHex: fixedHex(check.signer.publicKeyHex, 33, 'tracker signer public key'),
    p2pkErgoTreeHex: canonicalEvenHex(check.signer.p2pkErgoTreeHex, 'tracker signer P2PK ErgoTree'),
  }, SIGNER_IDENTITY_DIGEST_DOMAIN);
  const checkerIdentityDigestHex = sha256CanonicalJson({
    nodeOrigin: check.checker.nodeOrigin,
    path: exactLiteral(check.checker.path, '/transactions/check', 'tracker checker path'),
    method: exactLiteral(check.checker.method, 'POST', 'tracker checker method'),
    transportPolicy: exactLiteral(check.checker.transportPolicy, 'no-redirect-no-proxy', 'tracker checker transport policy'),
    executionTargetIdentityDigestHex: frozenTarget.executionTargetIdentityDigestHex,
  }, CHECKER_IDENTITY_DIGEST_DOMAIN);
  const jvmCheck = Object.freeze({
    unsignedTransactionIdHex: trackerCandidate.unsignedTransactionIdHex,
    unsignedTransactionDigestHex: fixedHex(check.unsignedTransactionDigestHex, 32, 'unsigned transaction digest'),
    checkedTransactionCanonicalJsonDigestHex: fixedHex(check.signedTransactionCanonicalJsonSha256Hex, 32, 'checked transaction canonical JSON digest'),
    checkedTransactionBytesDigestHex: fixedHex(check.signedTransactionBytesSha256Hex, 32, 'checked transaction bytes digest'),
    checkedTransactionBytesLength: positiveInteger(check.signedTransactionBytesLength, 'checked transaction bytes length'),
    checkResponseDigestHex: fixedHex(check.checkResponseSha256Hex, 32, 'JVM check response digest'),
    signerIdentityDigestHex,
    checkerIdentityDigestHex,
    stateContextTipHeight: nonNegativeInteger(check.signer.stateContextTipHeight, 'signer state-context tip height'),
    stateContextTipIdHex: fixedHex(check.signer.stateContextTipIdHex, 32, 'signer state-context tip ID'),
  });
  const bindings = Object.freeze({
    sourceProfileDigestHex: sha256CanonicalJson(sourceProfile, SOURCE_PROFILE_BINDING_DIGEST_DOMAIN),
    trackerSetupDigestHex: sha256CanonicalJson(trackerSetup, TRACKER_SETUP_BINDING_DIGEST_DOMAIN),
    checkpointAnchorDigestHex: sha256CanonicalJson(checkpointAnchor, CHECKPOINT_ANCHOR_BINDING_DIGEST_DOMAIN),
    frozenTargetDigestHex: sha256CanonicalJson(frozenTarget, FROZEN_TARGET_BINDING_DIGEST_DOMAIN),
    trackerCandidateDigestHex: sha256CanonicalJson(trackerCandidate, TRACKER_CANDIDATE_BINDING_DIGEST_DOMAIN),
    jvmCheckDigestHex: sha256CanonicalJson(jvmCheck, JVM_CHECK_BINDING_DIGEST_DOMAIN),
  });
  const reservationIdentityHex = sha256CanonicalJson({
    operationProfileDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_OPERATION_PROFILE_DIGEST_V1,
    rootReceiptDigestHex: fixedHex(root.receiptDigestHex, 32, 'root receipt digest'),
    bindings,
  }, RESERVATION_IDENTITY_DIGEST_DOMAIN);
  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_AUTHORIZATION_V1_SCHEMA,
    version: 1 as const,
    status:
      'exact_frozen_tracker_check_authorized_for_durable_reservation' as const,
    operationProfileDigestHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_OPERATION_PROFILE_DIGEST_V1,
    rootReceiptDigestHex: fixedHex(root.receiptDigestHex, 32, 'root receipt digest'),
    reservationIdentityHex,
    sourceProfile,
    trackerSetup,
    checkpointAnchor,
    frozenTarget,
    trackerCandidate,
    jvmCheck,
    bindings,
    boundaries: Object.freeze({
      localIsolatedDevnetOnly: true as const,
      exactProcessProvenRootConsumed: true as const,
      structuralRevalidationCompleted: true as const,
      reservationAuthorityEstablished: true as const,
      durableReservationEstablished: false as const,
      signedTransactionBytesPersisted: false as const,
      signingCapabilityExposed: false as const,
      deterministicSourceFinalityEstablished: false as const,
      ergoPowAuthenticated: false as const,
      profileActivated: false as const,
      mintAuthorized: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      trackerAdmissionEstablished: false as const,
      globalReplayInsertionEstablished: false as const,
      payoutAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
    }),
  };
  const authorization = deepFreeze({
    ...body,
    authorizationDigestHex: sha256CanonicalJson(
      body,
      AUTHORIZATION_DIGEST_DOMAIN,
    ),
  });
  CONSUMED_ROOT_RECEIPTS.add(root);
  AUTHORIZATIONS.set(authorization, Object.freeze({
    rootReceiptDigestHex: authorization.rootReceiptDigestHex,
    reservationIdentityHex: authorization.reservationIdentityHex,
    authorizationDigestHex: authorization.authorizationDigestHex,
  }));
  return authorization;
}

export function assertSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1Provenance(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1
> {
  if (
    value === null
    || typeof value !== 'object'
    || !Object.isFrozen(value)
  ) {
    throw new Error(
      'isolated devnet tracker reservation authorization lacks exact process provenance',
    );
  }
  const material = AUTHORIZATIONS.get(value);
  if (material === undefined) {
    throw new Error(
      'isolated devnet tracker reservation authorization lacks exact process provenance',
    );
  }
  const authorization = value as Readonly<
    SubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1
  >;
  const { authorizationDigestHex, ...body } = authorization;
  if (
    authorization.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_AUTHORIZATION_V1_SCHEMA
    || authorization.version !== 1
    || authorization.status
      !== 'exact_frozen_tracker_check_authorized_for_durable_reservation'
    || authorization.operationProfileDigestHex
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_RESERVATION_OPERATION_PROFILE_DIGEST_V1
    || authorization.rootReceiptDigestHex !== material.rootReceiptDigestHex
    || authorization.reservationIdentityHex !== material.reservationIdentityHex
    || authorizationDigestHex !== material.authorizationDigestHex
    || sha256CanonicalJson(body, AUTHORIZATION_DIGEST_DOMAIN)
      !== authorizationDigestHex
  ) {
    throw new Error(
      'isolated devnet tracker reservation authorization binding changed',
    );
  }
}

export function persistSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationV1(
  port: SubstrateFederatedIsolatedDevnetTrackerAdmissionReservationPersistencePortV1,
  authorization: Readonly<
    SubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1
  >,
): Readonly<
  SubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1
> {
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionReservationAuthorizationV1Provenance(
    authorization,
  );
  if (
    port === null
    || typeof port !== 'object'
    || typeof port
      .reserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1 !== 'function'
  ) {
    throw new Error(
      'isolated devnet tracker reservation persistence port is unavailable',
    );
  }
  const persistenceStoreIdentityHex =
    substrateFederatedIsolatedDevnetTrackerAdmissionPersistenceStoreIdentityHexV1(
      port,
    );
  const existingPersistenceStore = AUTHORIZATION_PERSISTENCE_STORES.get(
    authorization,
  );
  if (
    existingPersistenceStore !== undefined
    && existingPersistenceStore !== persistenceStoreIdentityHex
  ) {
    throw new Error(
      'isolated devnet tracker reservation authorization cannot fan out across persistence stores',
    );
  }
  if (existingPersistenceStore === undefined) {
    AUTHORIZATION_PERSISTENCE_STORES.set(
      authorization,
      persistenceStoreIdentityHex,
    );
  }

  const request: Readonly<
    ReserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1Input
  > = Object.freeze({
    reservationIdentityHex: fixedHex(
      authorization.reservationIdentityHex,
      32,
      'authorized tracker reservation identity',
    ),
    operationProfileDigestHex: fixedHex(
      authorization.operationProfileDigestHex,
      32,
      'authorized tracker reservation operation profile digest',
    ),
    rootReceiptDigestHex: fixedHex(
      authorization.rootReceiptDigestHex,
      32,
      'authorized tracker reservation root receipt digest',
    ),
    authorizationDigestHex: fixedHex(
      authorization.authorizationDigestHex,
      32,
      'authorized tracker reservation authorization digest',
    ),
    sourceProfileDigestHex: fixedHex(
      authorization.bindings.sourceProfileDigestHex,
      32,
      'authorized tracker reservation source profile digest',
    ),
    trackerSetupDigestHex: fixedHex(
      authorization.bindings.trackerSetupDigestHex,
      32,
      'authorized tracker reservation setup digest',
    ),
    checkpointAnchorDigestHex: fixedHex(
      authorization.bindings.checkpointAnchorDigestHex,
      32,
      'authorized tracker reservation checkpoint anchor digest',
    ),
    frozenTargetDigestHex: fixedHex(
      authorization.bindings.frozenTargetDigestHex,
      32,
      'authorized tracker reservation frozen target digest',
    ),
    trackerCandidateDigestHex: fixedHex(
      authorization.bindings.trackerCandidateDigestHex,
      32,
      'authorized tracker reservation candidate digest',
    ),
    jvmCheckDigestHex: fixedHex(
      authorization.bindings.jvmCheckDigestHex,
      32,
      'authorized tracker reservation JVM check digest',
    ),
    statementIdHex: fixedHex(
      authorization.sourceProfile.statementIdHex,
      32,
      'authorized tracker reservation statement ID',
    ),
    trackerInputBoxIdHex: fixedHex(
      authorization.trackerCandidate.inputBoxIdHex,
      32,
      'authorized tracker reservation input box ID',
    ),
    unsignedTransactionIdHex: fixedHex(
      authorization.trackerCandidate.unsignedTransactionIdHex,
      32,
      'authorized tracker reservation unsigned transaction ID',
    ),
    anchorHeaderIdHex: fixedHex(
      authorization.checkpointAnchor.anchorHeaderIdHex,
      32,
      'authorized tracker reservation anchor header ID',
    ),
    targetIdentityDigestHex: fixedHex(
      authorization.frozenTarget.executionTargetIdentityDigestHex,
      32,
      'authorized tracker reservation target identity digest',
    ),
  });
  const result =
    port.reserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1(request);
  assertReserveSubstrateFederatedIsolatedDevnetTrackerAdmissionV1ResultProvenance(
    result,
    port,
  );
  const reservation = result.reservation;
  if (
    reservation.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_DURABLE_RESERVATION_V1_SCHEMA
  ) {
    throw new Error(
      'isolated devnet tracker reservation persistence schema changed',
    );
  }
  for (const [field, expected] of Object.entries(request)) {
    const actual = fixedHex(
      (reservation as unknown as Record<string, unknown>)[field],
      32,
      `persisted tracker reservation ${field}`,
    );
    if (actual !== expected) {
      throw new Error(
        'isolated devnet tracker reservation persisted bindings changed',
      );
    }
  }
  const durableReservationDigestHex = fixedHex(
    reservation.durableReservationDigestHex,
    32,
    'persisted tracker durable reservation digest',
  );
  if (
    substrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationDigestHexV1(
      request,
    ) !== durableReservationDigestHex
  ) {
    throw new Error(
      'isolated devnet tracker durable reservation digest changed',
    );
  }
  if (
    typeof reservation.createdAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
      reservation.createdAt,
    )
  ) {
    throw new Error(
      'isolated devnet tracker reservation creation time is invalid',
    );
  }

  const body = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_DURABLE_RESERVATION_RECEIPT_V1_SCHEMA,
    version: 1 as const,
    status: 'exact_tracker_admission_reservation_persisted' as const,
    reservationIdentityHex: request.reservationIdentityHex,
    durableReservationDigestHex,
    operationProfileDigestHex: request.operationProfileDigestHex,
    authorizationDigestHex: request.authorizationDigestHex,
    rootReceiptDigestHex: request.rootReceiptDigestHex,
    bindings: Object.freeze({
      sourceProfileDigestHex: request.sourceProfileDigestHex,
      trackerSetupDigestHex: request.trackerSetupDigestHex,
      checkpointAnchorDigestHex: request.checkpointAnchorDigestHex,
      frozenTargetDigestHex: request.frozenTargetDigestHex,
      trackerCandidateDigestHex: request.trackerCandidateDigestHex,
      jvmCheckDigestHex: request.jvmCheckDigestHex,
      statementIdHex: request.statementIdHex,
      trackerInputBoxIdHex: request.trackerInputBoxIdHex,
      unsignedTransactionIdHex: request.unsignedTransactionIdHex,
      anchorHeaderIdHex: request.anchorHeaderIdHex,
      targetIdentityDigestHex: request.targetIdentityDigestHex,
    }),
    boundaries: Object.freeze({
      localIsolatedDevnetOnly: true as const,
      exactAuthorizationConsumed: true as const,
      durableReservationEstablished: true as const,
      localDatabaseAuthoritative: false as const,
      signedTransactionBytesPersisted: false as const,
      signingCapabilityExposed: false as const,
      deterministicSourceFinalityEstablished: false as const,
      ergoPowAuthenticated: false as const,
      profileActivated: false as const,
      mintAuthorized: false as const,
      submissionAuthorityEstablished: false as const,
      broadcastAuthorityEstablished: false as const,
      trackerAdmissionEstablished: false as const,
      globalReplayInsertionEstablished: false as const,
      payoutAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      existingWalletMaterialUsed: false as const,
    }),
  };
  const receipt = deepFreeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      DURABLE_RESERVATION_RECEIPT_DIGEST_DOMAIN,
    ),
  });
  DURABLE_RESERVATION_RECEIPTS.set(receipt, Object.freeze({
    persistenceStoreIdentityHex,
    reservationIdentityHex: receipt.reservationIdentityHex,
    durableReservationDigestHex: receipt.durableReservationDigestHex,
    receiptDigestHex: receipt.receiptDigestHex,
  }));
  return receipt;
}

export function assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1Provenance(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1
> {
  if (
    value === null
    || typeof value !== 'object'
    || !Object.isFrozen(value)
  ) {
    throw new Error(
      'isolated devnet tracker durable reservation receipt lacks exact process provenance',
    );
  }
  const material = DURABLE_RESERVATION_RECEIPTS.get(value);
  if (material === undefined) {
    throw new Error(
      'isolated devnet tracker durable reservation receipt lacks exact process provenance',
    );
  }
  const receipt = value as Readonly<
    SubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1
  >;
  const { receiptDigestHex, ...body } = receipt;
  if (
    receipt.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_TRACKER_ADMISSION_DURABLE_RESERVATION_RECEIPT_V1_SCHEMA
    || receipt.version !== 1
    || receipt.status !== 'exact_tracker_admission_reservation_persisted'
    || receipt.reservationIdentityHex !== material.reservationIdentityHex
    || receipt.durableReservationDigestHex
      !== material.durableReservationDigestHex
    || receiptDigestHex !== material.receiptDigestHex
    || sha256CanonicalJson(body, DURABLE_RESERVATION_RECEIPT_DIGEST_DOMAIN)
      !== receiptDigestHex
  ) {
    throw new Error(
      'isolated devnet tracker durable reservation receipt binding changed',
    );
  }
}

export function assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1PersistenceStore(
  value: unknown,
  persistenceStore: object,
): void {
  assertSubstrateFederatedIsolatedDevnetTrackerAdmissionDurableReservationReceiptV1Provenance(
    value,
  );
  const material = DURABLE_RESERVATION_RECEIPTS.get(value as object);
  const persistenceStoreIdentityHex =
    substrateFederatedIsolatedDevnetTrackerAdmissionPersistenceStoreIdentityHexV1(
      persistenceStore,
    );
  if (
    material === undefined
    || material.persistenceStoreIdentityHex !== persistenceStoreIdentityHex
  ) {
    throw new Error(
      'isolated devnet tracker durable reservation receipt persistence store changed',
    );
  }
}

function assertReservationOnlyBoundaries(
  root: Readonly<
    FrozenObservedAnchorTrackerCheckCampaignRootV7ProvenanceReceipt
  >,
): void {
  const rootBoundary = root.boundaries;
  const checkBoundary = root.tracker.check.boundaries;
  if (
    rootBoundary.localIsolatedDevnetOnly !== true
    || rootBoundary.signedTrackerBytesPersisted !== false
    || rootBoundary.deterministicSourceFinalityEstablished !== false
    || rootBoundary.ergoPowAuthenticated !== false
    || rootBoundary.profileActivated !== false
    || rootBoundary.mintAuthorized !== false
    || rootBoundary.publicNetworkUsed !== false
    || rootBoundary.realFundsUsed !== false
    || rootBoundary.existingWalletMaterialUsed !== false
    || rootBoundary.trackerAdmissionEstablished !== false
    || rootBoundary.globalReplayInsertionEstablished !== false
    || rootBoundary.payoutAuthorized !== false
    || rootBoundary.trackerSubmissionPerformed !== false
    || rootBoundary.trackerBroadcastPerformed !== false
    || rootBoundary.fundsAuthorityEstablished !== false
    || rootBoundary.gate5Closed !== false
    || rootBoundary.trustlessStatusEstablished !== false
    || rootBoundary.productionReadinessEstablished !== false
    || checkBoundary.signedTransactionBytesPersisted !== false
    || checkBoundary.submissionAuthorityEstablished !== false
    || checkBoundary.broadcastAuthorityEstablished !== false
    || checkBoundary.trackerAdmissionEstablished !== false
    || checkBoundary.replayProtectionEstablished !== false
    || checkBoundary.payoutEstablished !== false
    || checkBoundary.fundsAuthorityEstablished !== false
    || checkBoundary.gate5Closed !== false
    || checkBoundary.trustlessStatusEstablished !== false
    || checkBoundary.productionReadinessEstablished !== false
  ) {
    throw new Error(
      'isolated devnet tracker reservation authorization received authority-bearing evidence',
    );
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (clean.length !== bytes * 2 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be ${bytes} bytes of hex`);
  }
  return clean.toLowerCase();
}

function canonicalEvenHex(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be canonical even-length hex`);
  }
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${label} must be canonical even-length hex`);
  }
  return clean.toLowerCase();
}

function unsignedDecimal(value: unknown, label: string): string {
  const rendered = typeof value === 'bigint' ? value.toString() : String(value);
  if (!/^(?:0|[1-9][0-9]*)$/.test(rendered)) {
    throw new Error(`${label} must be a canonical unsigned decimal`);
  }
  return rendered;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function positiveInteger(value: unknown, label: string): number {
  const normalized = nonNegativeInteger(value, label);
  if (normalized === 0) {
    throw new Error(`${label} must be positive`);
  }
  return normalized;
}

function exactLiteral<T extends string | number>(
  value: unknown,
  expected: T,
  label: string,
): T {
  if (value !== expected) {
    throw new Error(`${label} must be ${String(expected)}`);
  }
  return expected;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const child of Object.values(value)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}
