import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';

import {
  POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_FORMAT_VERSION,
  decodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
  derivePooledReserveMintReservationRuntimeProfileV4,
  derivePooledReserveMintReservationRuntimeProfileV4IdHex,
  encodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
  type PooledReserveMintReservationRuntimeProfileV4,
} from './pooled-reserve-mint-reservation-runtime-profile-v4-codec.js';
import { decodePegInSourceIntentV2Hex } from './peg-in-causal-admission-v2.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
  buildSubstrateFederatedCheckpointStatementV1,
  deriveSubstrateFederatedCheckpointAttestationDigestHex,
  type SubstrateFederatedCheckpointStatementV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FEDERATION_EPOCH_V1,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX,
  buildFederatedPooledReserveSourceProofProfileV1,
  buildFederatedPooledReserveSourceProofResultFieldsForProfileV1,
  decodeFederatedPooledReserveSourceProofProfileScaleV1Hex,
  decodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex,
  deriveFederatedPooledReserveSourceProofAttestationDigestV1Hex,
  deriveFederatedPooledReserveSourceProofRequestDigestForProfileV1Hex,
  deriveFederatedPooledReserveSourceProofResultIdForProfileV1Hex,
  encodeFederatedPooledReserveSourceProofProfileScaleV1Hex,
  encodeFederatedPooledReserveSourceProofEnvelopeScaleForProfileV1Hex,
  encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex,
  verifyFederatedPooledReserveSourceProofSignaturesForProfileV1,
  type FederatedPooledReserveSourceProofEvidenceV1,
  type FederatedPooledReserveSourceProofProfileV1,
  type FederatedPooledReserveSourceProofProfileV1Input,
  type FederatedPooledReserveSourceProofRequestV1,
  type FederatedPooledReserveSourceProofResultFieldsV1,
  type FederatedPooledReserveSourceProofSignatureVerificationV1,
} from './substrate-federated-pooled-reserve-source-proof-v1.js';
import {
  assertSubstrateFederatedNativeGenesisPegInMintReservationDraftV1,
  type SubstrateFederatedNativeGenesisPegInMintReservationDraftV1,
  type SubstrateFederatedNativeGenesisPegInMintReservationDraftV1Input,
  assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1,
  assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX,
  type SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1,
  type SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2,
} from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import {
  consumeSubstrateFederatedNativeGenesisCommittedReserveEvidenceForDraftV1,
  type SubstrateFederatedNativeGenesisCommittedReserveEvidenceReceiptV1,
  consumeSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceForDraftV1,
  consumeSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceForDraftV2,
  type SubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1,
} from './substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js';
import {
  getSubstrateFederatedNativeGenesisAttestationContextV1,
} from './substrate-federated-isolated-devnet-setup-check-execution-v2.js';
import {
  assertSubstrateFederatedIsolatedDevnetLaunchStatementV1Provenance,
  assertSubstrateFederatedIsolatedDevnetLaunchStatementProvenance,
  deriveSubstrateFederatedIsolatedDevnetLaunchAttestationDigestV1,
  deriveSubstrateFederatedIsolatedDevnetLaunchAttestationDigestV2,
  type SubstrateFederatedIsolatedDevnetLaunchStatementV1,
  type SubstrateFederatedIsolatedDevnetLaunchStatementV2,
  type SubstrateFederatedIsolatedDevnetLaunchSignatureV1,
  type SubstrateFederatedIsolatedDevnetTargetDescriptorV1,
  type SubstrateFederatedIsolatedDevnetTargetDescriptorV2,
} from './substrate-federated-isolated-devnet-launch-v1.js';
import {
  SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_SCHEMA,
  decodeSubstrateFederatedSettlementFamilyV1Profile,
  type SubstrateFederatedSettlementFamilyV1Profile,
} from './substrate-federated-settlement-family-v1.js';
import { sha256CanonicalJson } from './strict-json.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_SESSION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-source-attestation-session.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_SESSION_V2_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-source-attestation-session.v2' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_KEY_COUNT_V1 =
  3 as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD_V1 =
  2 as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_SOURCE_PROOF_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-mint-source-proof.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_SOURCE_PROOF_V2_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-mint-source-proof.v2' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_ATTESTATION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-checkpoint-attestation.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2 =
  '4' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_MAX_PENDING_BLOCKS_V2 =
  64 as const;

const BINDING_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_BINDING_V1';
const BINDING_V2_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_BINDING_V2';
const MINT_SOURCE_PROOF_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_SOURCE_PROOF_RECEIPT_V1';
const MINT_SOURCE_PROOF_RECEIPT_V2_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_SOURCE_PROOF_RECEIPT_V2';
const CHECKPOINT_ATTESTATION_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_ATTESTATION_RECEIPT_V1';
const CHECKPOINT_ATTESTATION_SIGNATURE_SET_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_ATTESTATION_SIGNATURE_SET_V1';
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const SESSIONS = new WeakSet<object>();
const V2_SESSIONS = new WeakSet<object>();
const V2_GENESIS_PROFILES = new WeakMap<object, () => Readonly<{
  checkpointProfile: ReturnType<typeof buildSubstrateFederatedCheckpointProfileV1>;
  mintProofProfile: Readonly<FederatedPooledReserveSourceProofProfileV1Input>;
}>>();
const MINT_SOURCE_PROOF_RECEIPTS = new WeakSet<object>();
const MINT_SOURCE_PROOF_V2_RECEIPTS = new WeakSet<object>();
const NATIVE_MINT_PROOF_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_GENESIS_MINT_SOURCE_PROOF_V1';
const NATIVE_MINT_PRODUCERS = new WeakMap<object, (
  input: Readonly<ProduceSubstrateFederatedNativeGenesisMintSourceProofV1Input>,
) => Readonly<SubstrateFederatedNativeGenesisMintSourceProofReceiptV1>>();
const NATIVE_MINT_RECEIPTS = new WeakMap<object, Readonly<{
  session: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2>;
  draft: Readonly<SubstrateFederatedNativeGenesisPegInMintReservationDraftV1>;
  assertCurrent: () => void;
  context: () => ReturnType<typeof getSubstrateFederatedNativeGenesisAttestationContextV1>;
}>>();
const NATIVE_CHECKPOINT_DOMAIN = 'E2S_SUBSTRATE_FEDERATED_NATIVE_GENESIS_CHECKPOINT_ATTESTATION_V1';
const NATIVE_CHECKPOINT_PRODUCERS = new WeakMap<object, (
  input: Readonly<ProduceSubstrateFederatedNativeGenesisCheckpointAttestationV1Input>,
) => Readonly<SubstrateFederatedNativeGenesisCheckpointAttestationReceiptV1>>();
const NATIVE_CHECKPOINT_RECEIPTS = new WeakMap<object, Readonly<{
  session: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2>;
  proof: Readonly<SubstrateFederatedNativeGenesisMintSourceProofReceiptV1>;
  assertCurrent: () => void;
}>>();
const CHECKPOINT_ATTESTATION_RECEIPTS = new WeakSet<object>();
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;

type SourceSigner = Readonly<{
  readonly privateKey: KeyObject;
  readonly publicKeyHex: string;
}>;

export interface CreateSubstrateFederatedIsolatedDevnetSourceAttestationSessionV1Input {
  readonly ergoAdmissionThreshold: number;
  readonly ergoAdmissionPublicKeysHex: readonly string[];
}

export interface SubstrateFederatedIsolatedDevnetSourceAttestationBindingV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_SESSION_V1_SCHEMA;
  readonly version: 1;
  readonly bindingDigestHex: string;
  readonly sourceAttestationThreshold:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD_V1;
  readonly sourceAttestationPublicKeysHex: readonly string[];
  readonly checkpointFederationProfileIdHex: string;
  readonly checkpointSourceAttestationKeySetDigestHex: string;
  readonly federatedMintProfile:
    Readonly<FederatedPooledReserveSourceProofProfileV1>;
  readonly federatedMintProfileScaleHex: string;
  readonly checks: Readonly<{
    readonly oneFreshPublicKeySetBindsBothDomains: true;
    readonly checkpointAndMintProfileDomainsRemainDistinct: true;
    readonly privateKeysExcludedFromBinding: true;
  }>;
  readonly boundaries: Readonly<{
    readonly processOwnedSyntheticCustodyOnly: true;
    readonly independentAttestorCustodyEstablished: false;
    readonly runtimeProviderCompiled: false;
    readonly runtimeProfileActivated: false;
    readonly sourceProofProduced: false;
    readonly mintReservationWritten: false;
    readonly mintExecuted: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetSourceAttestationSessionV1 {
  readonly binding:
    Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationBindingV1>;
  readonly signLaunchStatement: (
    statement: Readonly<
      SubstrateFederatedIsolatedDevnetLaunchStatementV1
    >,
  ) => readonly Readonly<SubstrateFederatedIsolatedDevnetLaunchSignatureV1>[];
  readonly produceMintSourceProof: (
    input: Readonly<
      ProduceSubstrateFederatedIsolatedDevnetMintSourceProofV1Input
    >,
  ) => Readonly<SubstrateFederatedIsolatedDevnetMintSourceProofReceiptV1>;
  readonly dispose: () => void;
}

export type SubstrateFederatedIsolatedDevnetSourceAttestationBindingV2 =
  Omit<
    SubstrateFederatedIsolatedDevnetSourceAttestationBindingV1,
    'schema' | 'version'
  > &
  Readonly<{
    readonly schema:
      typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_SESSION_V2_SCHEMA;
    readonly version: 2;
  }>;

export interface SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2 {
  readonly binding:
    Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationBindingV2>;
  readonly signLaunchStatement: (
    statement: Readonly<
      SubstrateFederatedIsolatedDevnetLaunchStatementV1
      | SubstrateFederatedIsolatedDevnetLaunchStatementV2
    >,
  ) => readonly Readonly<SubstrateFederatedIsolatedDevnetLaunchSignatureV1>[];
  readonly produceSettlementFamilyMintSourceProof: (
    input: Readonly<
      ProduceSubstrateFederatedIsolatedDevnetMintSourceProofV2Input
    >,
  ) => Readonly<SubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2>;
  readonly produceCheckpointAttestation: (
    input: Readonly<
      ProduceSubstrateFederatedIsolatedDevnetCheckpointAttestationV1Input
    >,
  ) => Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointAttestationReceiptV1
  >;
  readonly dispose: () => void;
}

export interface ProduceSubstrateFederatedIsolatedDevnetCheckpointAttestationV1Input {
  readonly sourceNativeBlockHeight: string | number | bigint;
  readonly sourceNativeBlockHashHex: string;
  readonly executionBlockHashHex: string;
  readonly bridgeEventRootHex: string;
  readonly burnLeafCount: number;
  readonly admissionValidFromErgoHeight: string | number | bigint;
  readonly admissionExpiresAtErgoHeight: string | number | bigint;
}

export interface SubstrateFederatedIsolatedDevnetCheckpointAttestationReceiptV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_ATTESTATION_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'synthetic_federated_checkpoint_attested';
  readonly sourceAttestationBindingDigestHex: string;
  readonly targetDescriptorDigestHex: string;
  readonly checkpointStatement:
    Readonly<SubstrateFederatedCheckpointStatementV1>;
  readonly attestationDigestHex: string;
  readonly signatures:
    readonly Readonly<SubstrateFederatedIsolatedDevnetLaunchSignatureV1>[];
  readonly signatureSetDigestHex: string;
  readonly checks: Readonly<{
    readonly exactLaunchTargetObjectBound: true;
    readonly exactCheckpointProfileRebuilt: true;
    readonly exactApplicationAndProfileIdentityBound: true;
    readonly exactDynamicCheckpointFieldsBound: true;
    readonly exactThresholdSignatureSetVerified: true;
    readonly boundedAdmissionHorizonVerified: true;
    readonly oneShotCapabilityConsumed: true;
  }>;
  readonly boundary: Readonly<{
    readonly processOwnedSyntheticCustodyOnly: true;
    readonly thresholdSourceAttestationVerified: true;
    readonly independentAttestorCustodyEstablished: false;
    readonly sourceConsensusIndependentlyVerified: false;
    readonly deterministicSourceFinalityEstablished: false;
    readonly mintBeforeCheckpointLifecycleEstablished: false;
    readonly ergoAnchorEstablished: false;
    readonly trackerAdmissionEstablished: false;
    readonly replayInsertionEstablished: false;
    readonly payoutAuthorized: false;
    readonly ergoTransactionSigningAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly limitations: readonly string[];
  readonly receiptDigestHex: string;
}

export interface ProduceSubstrateFederatedIsolatedDevnetMintSourceProofV1Input {
  readonly draft:
    Readonly<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1>;
  readonly runtimeProfileDerivation: Readonly<{
    readonly encodedLineageProfileHex: string;
    readonly bridgeRuntimeCodeSha256Hex: string;
    readonly bridgeRuntimeCodeBytes: number;
    readonly tokenRuntimeCodeSha256Hex: string;
    readonly tokenRuntimeCodeBytes: number;
    readonly maxPendingBlocks: number;
  }>;
  readonly evidence: Readonly<FederatedPooledReserveSourceProofEvidenceV1>;
  readonly issuedAtNativeHeight: string | number | bigint;
  readonly expiresAtNativeHeight: string | number | bigint;
}

export interface SubstrateFederatedIsolatedDevnetMintSourceProofReceiptV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_SOURCE_PROOF_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'synthetic_federated_source_proof_produced';
  readonly sourceAttestationBindingDigestHex: string;
  readonly mintReservationDraftDigestHex: string;
  readonly mintReservationStatementIdHex: string;
  readonly mintIdentityHex: string;
  readonly encodedLineageProfileHex: string;
  readonly runtimeProfileScaleHex: string;
  readonly runtimeProfileIdHex: string;
  readonly sourceProofProfileIdHex: string;
  readonly requestDigestHex: string;
  readonly request: Readonly<FederatedPooledReserveSourceProofRequestV1>;
  readonly result:
    Readonly<FederatedPooledReserveSourceProofResultFieldsV1>;
  readonly signatureVerification:
    Readonly<FederatedPooledReserveSourceProofSignatureVerificationV1>;
  readonly proofBytesScaleHex: string;
  readonly sourceProofEnvelopeScaleHex: string;
  readonly sourceProofEnvelopeSha256Hex: string;
  readonly checks: Readonly<{
    readonly exactSameProcessDraftBound: true;
    readonly exactLineageProfileIdBound: true;
    readonly runtimeProfileDerivedFromExactLineage: true;
    readonly callerSuppliedRuntimeProfileAccepted: false;
    readonly exactSelectedProfileBound: true;
    readonly exactRequestResultBound: true;
    readonly exactThresholdSignatureSetVerified: true;
    readonly boundedValidityWindowVerified: true;
    readonly oneShotCapabilityConsumed: true;
  }>;
  readonly boundary: Readonly<{
    readonly processOwnedSyntheticCustodyOnly: true;
    readonly evidenceBytesCallerSupplied: true;
    readonly sourceEvidenceCollectionProvenanceEstablished: false;
    readonly sourceCanonicalityIndependentlyVerified: false;
    readonly independentAttestorCustodyEstablished: false;
    readonly runtimeProviderCompiled: false;
    readonly runtimeProfileActivated: false;
    readonly runtimeReservationWritten: false;
    readonly mintExecuted: false;
    readonly ergoTransactionSigningAuthorized: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
    readonly trustlessStatusEstablished: false;
    readonly productionReadinessEstablished: false;
  }>;
  readonly limitations: readonly string[];
  readonly receiptDigestHex: string;
}

export interface ProduceSubstrateFederatedIsolatedDevnetMintSourceProofV2Input {
  readonly draft:
    Readonly<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1
      | SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2>;
  readonly evidenceReceipt:
    Readonly<SubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1>;
  readonly issuedAtNativeHeight: string | number | bigint;
  readonly expiresAtNativeHeight: string | number | bigint;
}

export interface ProduceSubstrateFederatedNativeGenesisCheckpointAttestationV1Input {
  readonly proof: Readonly<SubstrateFederatedNativeGenesisMintSourceProofReceiptV1>;
  readonly checkpoint: Readonly<ProduceSubstrateFederatedIsolatedDevnetCheckpointAttestationV1Input>;
}

/** Native setup provenance is separate from the historical LAB launch receipt. */
export interface SubstrateFederatedNativeGenesisCheckpointAttestationReceiptV1 {
  readonly schema: 'e2s.substrate-federated-native-genesis-checkpoint-attestation.v1';
  readonly version: 1;
  readonly sourceAttestationBindingDigestHex: string;
  readonly sourceProofReceiptDigestHex: string;
  readonly genesisJsonSha256Hex: string;
  readonly checkpointStatement: Readonly<SubstrateFederatedCheckpointStatementV1>;
  readonly attestationDigestHex: string;
  readonly signatures: readonly Readonly<SubstrateFederatedIsolatedDevnetLaunchSignatureV1>[];
  readonly signatureSetDigestHex: string;
  readonly receiptDigestHex: string;
  readonly sourceFinalityEstablished: false;
  readonly ergoPayoutAuthorized: false;
  readonly trustless: false;
}

export interface ProduceSubstrateFederatedNativeGenesisMintSourceProofV1Input {
  readonly draftInputs: Readonly<SubstrateFederatedNativeGenesisPegInMintReservationDraftV1Input>;
  readonly draft: Readonly<SubstrateFederatedNativeGenesisPegInMintReservationDraftV1>;
  readonly evidenceReceipt: Readonly<SubstrateFederatedNativeGenesisCommittedReserveEvidenceReceiptV1>;
  readonly issuedAtNativeHeight: string | number | bigint;
  readonly expiresAtNativeHeight: string | number | bigint;
}

export interface SubstrateFederatedNativeGenesisMintSourceProofReceiptV1 extends Pick<
  SubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2,
  'status' | 'sourceAttestationBindingDigestHex' | 'sourceEvidenceReceiptDigestHex'
  | 'mintReservationDraftDigestHex' | 'mintReservationStatementIdHex' | 'mintIdentityHex'
  | 'runtimeProfileScaleHex' | 'runtimeProfileIdHex' | 'sourceProofProfileIdHex'
  | 'sourceProofProfileScaleHex' | 'requestDigestHex' | 'request' | 'result'
  | 'signatureVerification' | 'proofBytesScaleHex' | 'sourceProofEnvelopeScaleHex'
  | 'sourceProofEnvelopeSha256Hex' | 'boundary' | 'receiptDigestHex'> {
  readonly schema: 'e2s.substrate-federated-native-genesis-mint-source-proof.v1';
  readonly version: 1;
  readonly provenance: SubstrateFederatedNativeGenesisPegInMintReservationDraftV1['provenance'];
  readonly genesisJsonSha256Hex: string;
  readonly checks: Readonly<{
    exactOriginalDraftInputsBound: true;
    exactRetainedGenesisProfileBound: true;
    heightZeroProfileRequired: true;
    exactSourceEvidenceReceiptBound: true;
    exactThresholdSignatureSetVerified: true;
    oneShotCapabilityConsumed: true;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_SOURCE_PROOF_V2_SCHEMA;
  readonly version: 2;
  readonly status: 'collected_federated_source_proof_produced';
  readonly sourceAttestationBindingDigestHex: string;
  readonly sourceEvidenceReceiptDigestHex: string;
  readonly targetDescriptorDigestHex: string;
  readonly mintReservationDraftDigestHex: string;
  readonly mintReservationStatementIdHex: string;
  readonly mintIdentityHex: string;
  readonly settlementFamilyIdHex: string;
  readonly encodedSettlementFamilyProfileHex: string;
  readonly runtimeProfileScaleHex: string;
  readonly runtimeProfileIdHex: string;
  readonly sourceProofProfileIdHex: string;
  readonly sourceProofProfileScaleHex: string;
  readonly requestDigestHex: string;
  readonly request: Readonly<FederatedPooledReserveSourceProofRequestV1>;
  readonly result:
    Readonly<FederatedPooledReserveSourceProofResultFieldsV1>;
  readonly signatureVerification:
    Readonly<FederatedPooledReserveSourceProofSignatureVerificationV1>;
  readonly proofBytesScaleHex: string;
  readonly sourceProofEnvelopeScaleHex: string;
  readonly sourceProofEnvelopeSha256Hex: string;
  readonly checks: Readonly<{
    readonly exactSameProcessDraftBound: true;
    readonly exactTargetDescriptorBound: true;
    readonly exactSettlementFamilyIdBound: true;
    readonly runtimeProfileDerivedFromExactSettlementFamily: true;
    readonly callerSuppliedRuntimeProfileAccepted: false;
    readonly exactSelectedProfileBound: true;
    readonly exactRequestResultBound: true;
    readonly exactThresholdSignatureSetVerified: true;
    readonly boundedValidityWindowVerified: true;
    readonly exactSourceEvidenceReceiptBound: true;
    readonly oneShotCapabilityConsumed: true;
  }>;
  readonly boundary: Readonly<
    Omit<
      SubstrateFederatedIsolatedDevnetMintSourceProofReceiptV1['boundary'],
      | 'evidenceBytesCallerSupplied'
      | 'sourceEvidenceCollectionProvenanceEstablished'
    > & {
      readonly evidenceBytesCallerSupplied: false;
      readonly sourceEvidenceCollectionProvenanceEstablished: true;
    }
  >;
  readonly limitations: readonly string[];
  readonly receiptDigestHex: string;
}

export function createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV1(
  input: Readonly<
    CreateSubstrateFederatedIsolatedDevnetSourceAttestationSessionV1Input
  >,
): Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV1> {
  const record = exactRecord(
    input,
    ['ergoAdmissionPublicKeysHex', 'ergoAdmissionThreshold'],
    'isolated-devnet source-attestation session input',
  );
  let signers = Array.from(
    {
      length:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_KEY_COUNT_V1,
    },
    sourceSigner,
  ).sort((left, right) => compareStrings(
    left.publicKeyHex,
    right.publicKeyHex,
  ));
  const checkpointProfile = buildSubstrateFederatedCheckpointProfileV1({
    federationEpoch:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FEDERATION_EPOCH_V1,
    maxAdmissionValidityBlocks:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
    sourceAttestationThreshold:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD_V1,
    sourceAttestationPublicKeysHex:
      signers.map(value => value.publicKeyHex),
    ergoAdmissionThreshold: record.ergoAdmissionThreshold as number,
    ergoAdmissionPublicKeysHex:
      record.ergoAdmissionPublicKeysHex as readonly string[],
  });
  const mintProfileInput = deepFreeze({
    federationEpoch:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FEDERATION_EPOCH_V1,
    threshold:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD_V1,
    signerPublicKeysHex:
      signers.map(value => `0x${value.publicKeyHex}`),
    maxValidityBlocks:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
    verifierProfileIdHex:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX,
  } satisfies FederatedPooledReserveSourceProofProfileV1Input);
  const federatedMintProfile =
    buildFederatedPooledReserveSourceProofProfileV1(mintProfileInput);
  if (
    checkpointProfile.sourceAttestationKeySetDigestHex
      === federatedMintProfile.sourceAttestationKeySetDigestHex
  ) {
    throw new Error('isolated-devnet source-attestation domains aliased');
  }
  const bindingBody = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_SESSION_V1_SCHEMA,
    version: 1 as const,
    sourceAttestationThreshold:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD_V1,
    sourceAttestationPublicKeysHex:
      checkpointProfile.sourceAttestationPublicKeysHex,
    checkpointFederationProfileIdHex: checkpointProfile.profileIdHex,
    checkpointSourceAttestationKeySetDigestHex:
      checkpointProfile.sourceAttestationKeySetDigestHex,
    federatedMintProfile,
    federatedMintProfileScaleHex:
      encodeFederatedPooledReserveSourceProofProfileScaleV1Hex(
        mintProfileInput,
      ),
    checks: {
      oneFreshPublicKeySetBindsBothDomains: true as const,
      checkpointAndMintProfileDomainsRemainDistinct: true as const,
      privateKeysExcludedFromBinding: true as const,
    },
    boundaries: falseBoundaries(),
  };
  const binding = deepFreeze({
    ...bindingBody,
    bindingDigestHex: sha256CanonicalJson(bindingBody, BINDING_DIGEST_DOMAIN),
  });
  let state: 'open' | 'disposed' = 'open';
  let launchSigned = false;
  let mintProofProduced = false;
  const session = Object.freeze({
    binding,
    signLaunchStatement: (
      statement: Readonly<
        SubstrateFederatedIsolatedDevnetLaunchStatementV1
      >,
    ) => {
      assertOpen(state);
      if (launchSigned) {
        throw new Error('isolated-devnet launch attestation is already signed');
      }
      assertSubstrateFederatedIsolatedDevnetLaunchStatementV1Provenance(
        statement,
      );
      const federation = statement.target.federation;
      if (
        federation.sourceAttestationKeySetDigestHex
          !== binding.checkpointSourceAttestationKeySetDigestHex
        || federation.sourceAttestationThreshold
          !== binding.sourceAttestationThreshold
        || federation.federationProfileIdHex
          !== binding.checkpointFederationProfileIdHex
        || !sameStrings(
          federation.sourceAttestationPublicKeysHex,
          binding.sourceAttestationPublicKeysHex,
        )
      ) {
        throw new Error('isolated-devnet launch statement targets a different profile');
      }
      const digestHex =
        deriveSubstrateFederatedIsolatedDevnetLaunchAttestationDigestV1({
          statementDigestHex: statement.statementDigestHex,
          sourceAttestationKeySetDigestHex:
            federation.sourceAttestationKeySetDigestHex,
          sourceAttestationThreshold: federation.sourceAttestationThreshold,
        });
      if (digestHex !== statement.attestationDigestHex) {
        throw new Error('isolated-devnet launch statement attestation digest drifted');
      }
      launchSigned = true;
      return signThreshold(signers, digestHex);
    },
    produceMintSourceProof: (
      input: Readonly<
        ProduceSubstrateFederatedIsolatedDevnetMintSourceProofV1Input
      >,
    ) => {
      assertOpen(state);
      if (mintProofProduced) {
        throw new Error(
          'isolated-devnet mint source-proof capability is already consumed',
        );
      }
      const record = exactRecord(
        input,
        [
          'draft',
          'evidence',
          'expiresAtNativeHeight',
          'issuedAtNativeHeight',
          'runtimeProfileDerivation',
        ],
        'isolated-devnet mint source-proof input',
      );
      const draft = record.draft as Readonly<
        SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1
      >;
      assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1(
        draft,
      );
      const runtimeProfileDerivation = deriveRuntimeProfileForDraft(
        record.runtimeProfileDerivation,
        draft.statement.lineageProfileIdHex,
      );
      const runtimeProfile = runtimeProfileDerivation.runtimeProfile;
      const runtimeProfileScaleHex =
        encodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
          runtimeProfile,
        );
      const issuedAtNativeHeight = uint64(
        record.issuedAtNativeHeight,
        'isolated-devnet source-proof issue height',
      );
      const expiresAtNativeHeight = uint64(
        record.expiresAtNativeHeight,
        'isolated-devnet source-proof expiry height',
      );
      assertMintSourceProofWindow(
        issuedAtNativeHeight,
        expiresAtNativeHeight,
        BigInt(runtimeProfile.activationHeight),
        BigInt(runtimeProfile.maxPendingBlocks),
        BigInt(federatedMintProfile.maxValidityBlocks),
      );
      const request = deepFreeze({
        runtimeProfile,
        statementHex: draft.statementHex,
        evidence: canonicalEvidence(record.evidence),
        issuedAtNativeHeight: issuedAtNativeHeight.toString(),
        expiresAtNativeHeight: expiresAtNativeHeight.toString(),
      } satisfies FederatedPooledReserveSourceProofRequestV1);
      const requestDigestHex =
        deriveFederatedPooledReserveSourceProofRequestDigestForProfileV1Hex(
          mintProfileInput,
          request,
        );
      const result =
        buildFederatedPooledReserveSourceProofResultFieldsForProfileV1(
          mintProfileInput,
          request,
        );
      if (result.requestDigestHex !== requestDigestHex) {
        throw new Error(
          'isolated-devnet mint source-proof request/result binding drifted',
        );
      }
      const resultIdHex =
        deriveFederatedPooledReserveSourceProofResultIdForProfileV1Hex(
          mintProfileInput,
          request,
          result,
        );
      const attestationDigestHex =
        deriveFederatedPooledReserveSourceProofAttestationDigestV1Hex(
          resultIdHex,
        );

      // Consume the capability before private-key use so no partial failure can
      // make the same session sign a second mint source proof.
      mintProofProduced = true;
      const signatures = deepFreeze(
        signThreshold(signers, attestationDigestHex).map(value => ({
          signerPublicKeyHex: `0x${value.signerPublicKeyHex}`,
          signatureHex: `0x${value.signatureHex}`,
        })),
      );
      const signatureVerification =
        verifyFederatedPooledReserveSourceProofSignaturesForProfileV1(
          mintProfileInput,
          request,
          result,
          signatures,
        );
      if (
        signatureVerification.resultIdHex !== resultIdHex
        || signatureVerification.attestationDigestHex
          !== attestationDigestHex
      ) {
        throw new Error(
          'isolated-devnet mint source-proof signature binding drifted',
        );
      }
      const envelope = deepFreeze({
        result,
        signatures: signatureVerification.signatures,
      });
      const proofBytesScaleHex =
        encodeFederatedPooledReserveSourceProofEnvelopeScaleForProfileV1Hex(
          mintProfileInput,
          request,
          envelope,
        );
      const sourceProofEnvelopeScaleHex =
        encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex(
          mintProfileInput,
          request,
          envelope,
        );
      const body = deepFreeze({
        schema:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_SOURCE_PROOF_V1_SCHEMA,
        version: 1 as const,
        status: 'synthetic_federated_source_proof_produced' as const,
        sourceAttestationBindingDigestHex: binding.bindingDigestHex,
        mintReservationDraftDigestHex: draft.draftDigestHex,
        mintReservationStatementIdHex: draft.statementIdHex,
        mintIdentityHex: draft.reservationKeyHex,
        encodedLineageProfileHex:
          runtimeProfileDerivation.encodedLineageProfileHex,
        runtimeProfileScaleHex,
        runtimeProfileIdHex:
          derivePooledReserveMintReservationRuntimeProfileV4IdHex(
            runtimeProfile,
          ),
        sourceProofProfileIdHex: federatedMintProfile.proofProfileIdHex,
        requestDigestHex,
        request,
        result,
        signatureVerification,
        proofBytesScaleHex,
        sourceProofEnvelopeScaleHex,
        sourceProofEnvelopeSha256Hex: createHash('sha256')
          .update(Buffer.from(sourceProofEnvelopeScaleHex.slice(2), 'hex'))
          .digest('hex'),
        checks: {
          exactSameProcessDraftBound: true as const,
          exactLineageProfileIdBound: true as const,
          runtimeProfileDerivedFromExactLineage: true as const,
          callerSuppliedRuntimeProfileAccepted: false as const,
          exactSelectedProfileBound: true as const,
          exactRequestResultBound: true as const,
          exactThresholdSignatureSetVerified: true as const,
          boundedValidityWindowVerified: true as const,
          oneShotCapabilityConsumed: true as const,
        },
        boundary: mintSourceProofBoundary(),
        limitations: [
          'Evidence bytes are caller supplied and only bound to the exact signed request in this slice.',
          'The attestors are process-owned synthetic LAB actors; the threshold remains the source authority.',
          'No runtime admission, mint, funds authority, Gate 5 closure, or trustless status is established.',
        ] as const,
      });
      const receipt = deepFreeze({
        ...body,
        receiptDigestHex: sha256CanonicalJson(
          body,
          MINT_SOURCE_PROOF_RECEIPT_DIGEST_DOMAIN,
        ),
      });
      MINT_SOURCE_PROOF_RECEIPTS.add(receipt);
      return receipt;
    },
    dispose: () => {
      if (state === 'open') {
        signers = [];
        state = 'disposed';
      }
    },
  });
  SESSIONS.add(session);
  return session;
}

export function createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2(
  input: Readonly<
    CreateSubstrateFederatedIsolatedDevnetSourceAttestationSessionV1Input
  >,
): Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2> {
  const record = exactRecord(
    input,
    ['ergoAdmissionPublicKeysHex', 'ergoAdmissionThreshold'],
    'isolated-devnet source-attestation session input',
  );
  let signers = Array.from(
    {
      length:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_KEY_COUNT_V1,
    },
    sourceSigner,
  ).sort((left, right) => compareStrings(
    left.publicKeyHex,
    right.publicKeyHex,
  ));
  const checkpointProfile = buildSubstrateFederatedCheckpointProfileV1({
    federationEpoch:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FEDERATION_EPOCH_V1,
    maxAdmissionValidityBlocks:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
    sourceAttestationThreshold:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD_V1,
    sourceAttestationPublicKeysHex:
      signers.map(value => value.publicKeyHex),
    ergoAdmissionThreshold: record.ergoAdmissionThreshold as number,
    ergoAdmissionPublicKeysHex:
      record.ergoAdmissionPublicKeysHex as readonly string[],
  });
  const mintProfileInput = deepFreeze({
    federationEpoch:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FEDERATION_EPOCH_V1,
    threshold:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD_V1,
    signerPublicKeysHex:
      signers.map(value => `0x${value.publicKeyHex}`),
    maxValidityBlocks:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
    verifierProfileIdHex:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX,
  } satisfies FederatedPooledReserveSourceProofProfileV1Input);
  const federatedMintProfile =
    buildFederatedPooledReserveSourceProofProfileV1(mintProfileInput);
  if (
    checkpointProfile.sourceAttestationKeySetDigestHex
      === federatedMintProfile.sourceAttestationKeySetDigestHex
  ) {
    throw new Error('isolated-devnet source-attestation domains aliased');
  }
  const bindingBody = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_SESSION_V2_SCHEMA,
    version: 2 as const,
    sourceAttestationThreshold:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD_V1,
    sourceAttestationPublicKeysHex:
      checkpointProfile.sourceAttestationPublicKeysHex,
    checkpointFederationProfileIdHex: checkpointProfile.profileIdHex,
    checkpointSourceAttestationKeySetDigestHex:
      checkpointProfile.sourceAttestationKeySetDigestHex,
    federatedMintProfile,
    federatedMintProfileScaleHex:
      encodeFederatedPooledReserveSourceProofProfileScaleV1Hex(
        mintProfileInput,
      ),
    checks: {
      oneFreshPublicKeySetBindsBothDomains: true as const,
      checkpointAndMintProfileDomainsRemainDistinct: true as const,
      privateKeysExcludedFromBinding: true as const,
    },
    boundaries: falseBoundaries(),
  };
  const binding = deepFreeze({
    ...bindingBody,
    bindingDigestHex: sha256CanonicalJson(
      bindingBody,
      BINDING_V2_DIGEST_DOMAIN,
    ),
  });
  let state: 'open' | 'disposed' = 'open';
  let launchSigningStarted = false;
  let nativeMintSigningStarted = false;
  let signedTarget:
    Readonly<SubstrateFederatedIsolatedDevnetTargetDescriptorV1
      | SubstrateFederatedIsolatedDevnetTargetDescriptorV2> | undefined;
  let mintProofProduced = false;
  let checkpointAttestationProduced = false;
  const session = Object.freeze({
    binding,
    signLaunchStatement: (
      statement: Readonly<
        SubstrateFederatedIsolatedDevnetLaunchStatementV1
        | SubstrateFederatedIsolatedDevnetLaunchStatementV2
      >,
    ) => {
      assertOpen(state);
      if (launchSigningStarted || nativeMintSigningStarted) {
        throw new Error('isolated-devnet launch attestation is already signed');
      }
      assertSubstrateFederatedIsolatedDevnetLaunchStatementProvenance(statement);
      const deriveDigest = statement.version === 2
        ? deriveSubstrateFederatedIsolatedDevnetLaunchAttestationDigestV2
        : deriveSubstrateFederatedIsolatedDevnetLaunchAttestationDigestV1;
      const federation = statement.target.federation;
      if (
        federation.sourceAttestationKeySetDigestHex
          !== binding.checkpointSourceAttestationKeySetDigestHex
        || federation.sourceAttestationThreshold
          !== binding.sourceAttestationThreshold
        || federation.federationProfileIdHex
          !== binding.checkpointFederationProfileIdHex
        || !sameStrings(
          federation.sourceAttestationPublicKeysHex,
          binding.sourceAttestationPublicKeysHex,
        )
      ) {
        throw new Error('isolated-devnet launch statement targets a different profile');
      }
      const digestHex =
        deriveDigest({
          statementDigestHex: statement.statementDigestHex,
          sourceAttestationKeySetDigestHex:
            federation.sourceAttestationKeySetDigestHex,
          sourceAttestationThreshold: federation.sourceAttestationThreshold,
        });
      if (digestHex !== statement.attestationDigestHex) {
        throw new Error('isolated-devnet launch statement attestation digest drifted');
      }
      launchSigningStarted = true;
      try {
        const signatures = signThreshold(signers, digestHex);
        signedTarget = statement.target;
        return signatures;
      } catch (error) {
        signers = [];
        state = 'disposed';
        throw error;
      }
    },
    produceSettlementFamilyMintSourceProof: (
      input: Readonly<
        ProduceSubstrateFederatedIsolatedDevnetMintSourceProofV2Input
      >,
    ) => {
      assertOpen(state);
      if (signedTarget === undefined) {
        throw new Error(
          'isolated-devnet mint source-proof requires one completed launch attestation',
        );
      }
      if (mintProofProduced) {
        throw new Error(
          'isolated-devnet mint source-proof capability is already consumed',
        );
      }
      const proofInput = exactRecord(
        input,
        [
          'draft',
          'evidenceReceipt',
          'expiresAtNativeHeight',
          'issuedAtNativeHeight',
        ],
        'isolated-devnet settlement-family mint source-proof input',
      );
      const draft = proofInput.draft;
      const evidenceReceipt = proofInput.evidenceReceipt as Readonly<
        SubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1
      >;
      const target = signedTarget;
      let evidence: Readonly<FederatedPooledReserveSourceProofEvidenceV1>;
      if (target.version === 2) {
        assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2(draft);
        const compiler = draft.provenance.familyCompiler;
        const exactCompilerBindings = [
          [compiler.trackerRequestDigestHex, target.compiler.trackerRequestDigestHex, 'tracker request'],
          [compiler.trackerReceiptDigestHex, target.compiler.trackerReceiptDigestHex, 'tracker receipt'],
          [compiler.familyRequestDigestHex, target.compiler.familyRequestDigestHex, 'family request'],
          [compiler.familyReceiptDigestHex, target.compiler.familyReceiptDigestHex, 'family receipt'],
          [compiler.compilerLockDigestHex, target.compiler.familyCompilerLockDigestHex, 'family compiler lock'],
        ] as const;
        for (const [actual, expected, label] of exactCompilerBindings) {
          if (fixedHex(actual, 32, label) !== fixedHex(expected, 32, label)) {
            throw new Error(`isolated-devnet mint source-proof ${label} compiler binding differs from signed target`);
          }
        }
        evidence = consumeSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceForDraftV2(
          evidenceReceipt, draft,
        );
      } else {
        assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1(draft);
        evidence = consumeSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceForDraftV1(
          evidenceReceipt, draft,
        );
      }
      const familyDerivation = deriveRuntimeProfileForSettlementFamily(
        target,
        draft,
        binding,
        federatedMintProfile,
      );
      const runtimeProfile = familyDerivation.runtimeProfile;
      const runtimeProfileScaleHex =
        encodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
          runtimeProfile,
        );
      const issuedAtNativeHeight = uint64(
        proofInput.issuedAtNativeHeight,
        'isolated-devnet source-proof issue height',
      );
      const expiresAtNativeHeight = uint64(
        proofInput.expiresAtNativeHeight,
        'isolated-devnet source-proof expiry height',
      );
      assertMintSourceProofWindow(
        issuedAtNativeHeight,
        expiresAtNativeHeight,
        BigInt(runtimeProfile.activationHeight),
        BigInt(runtimeProfile.maxPendingBlocks),
        BigInt(federatedMintProfile.maxValidityBlocks),
      );
      const request = deepFreeze({
        runtimeProfile,
        statementHex: draft.statementHex,
        evidence: canonicalEvidence(evidence),
        issuedAtNativeHeight: issuedAtNativeHeight.toString(),
        expiresAtNativeHeight: expiresAtNativeHeight.toString(),
      } satisfies FederatedPooledReserveSourceProofRequestV1);
      const requestDigestHex =
        deriveFederatedPooledReserveSourceProofRequestDigestForProfileV1Hex(
          mintProfileInput,
          request,
        );
      const result =
        buildFederatedPooledReserveSourceProofResultFieldsForProfileV1(
          mintProfileInput,
          request,
        );
      if (result.requestDigestHex !== requestDigestHex) {
        throw new Error(
          'isolated-devnet mint source-proof request/result binding drifted',
        );
      }
      const resultIdHex =
        deriveFederatedPooledReserveSourceProofResultIdForProfileV1Hex(
          mintProfileInput,
          request,
          result,
        );
      const attestationDigestHex =
        deriveFederatedPooledReserveSourceProofAttestationDigestV1Hex(
          resultIdHex,
        );

      mintProofProduced = true;
      try {
        const signatures = deepFreeze(
          signThreshold(signers, attestationDigestHex).map(value => ({
            signerPublicKeyHex: `0x${value.signerPublicKeyHex}`,
            signatureHex: `0x${value.signatureHex}`,
          })),
        );
        const signatureVerification =
          verifyFederatedPooledReserveSourceProofSignaturesForProfileV1(
            mintProfileInput,
            request,
            result,
            signatures,
          );
        if (
          signatureVerification.resultIdHex !== resultIdHex
          || signatureVerification.attestationDigestHex
            !== attestationDigestHex
        ) {
          throw new Error(
            'isolated-devnet mint source-proof signature binding drifted',
          );
        }
        const envelope = deepFreeze({
          result,
          signatures: signatureVerification.signatures,
        });
        const proofBytesScaleHex =
          encodeFederatedPooledReserveSourceProofEnvelopeScaleForProfileV1Hex(
            mintProfileInput,
            request,
            envelope,
          );
        const sourceProofEnvelopeScaleHex =
          encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex(
            mintProfileInput,
            request,
            envelope,
          );
        const body = deepFreeze({
          schema:
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_SOURCE_PROOF_V2_SCHEMA,
          version: 2 as const,
          status: 'collected_federated_source_proof_produced' as const,
          sourceAttestationBindingDigestHex: binding.bindingDigestHex,
          sourceEvidenceReceiptDigestHex: evidenceReceipt.receiptDigestHex,
          targetDescriptorDigestHex: target.descriptorDigestHex,
          mintReservationDraftDigestHex: draft.draftDigestHex,
          mintReservationStatementIdHex: draft.statementIdHex,
          mintIdentityHex: draft.reservationKeyHex,
          settlementFamilyIdHex:
            familyDerivation.settlementFamilyProfile.familyIdHex,
          encodedSettlementFamilyProfileHex:
            familyDerivation.settlementFamilyProfile.encodedProfileHex,
          runtimeProfileScaleHex,
          runtimeProfileIdHex:
            derivePooledReserveMintReservationRuntimeProfileV4IdHex(
              runtimeProfile,
            ),
          sourceProofProfileIdHex: federatedMintProfile.proofProfileIdHex,
          sourceProofProfileScaleHex:
            binding.federatedMintProfileScaleHex,
          requestDigestHex,
          request,
          result,
          signatureVerification,
          proofBytesScaleHex,
          sourceProofEnvelopeScaleHex,
          sourceProofEnvelopeSha256Hex: createHash('sha256')
            .update(Buffer.from(sourceProofEnvelopeScaleHex.slice(2), 'hex'))
            .digest('hex'),
          checks: {
            exactSameProcessDraftBound: true as const,
            exactTargetDescriptorBound: true as const,
            exactSettlementFamilyIdBound: true as const,
            runtimeProfileDerivedFromExactSettlementFamily: true as const,
            callerSuppliedRuntimeProfileAccepted: false as const,
            exactSelectedProfileBound: true as const,
            exactRequestResultBound: true as const,
            exactThresholdSignatureSetVerified: true as const,
            boundedValidityWindowVerified: true as const,
            exactSourceEvidenceReceiptBound: true as const,
            oneShotCapabilityConsumed: true as const,
          },
          boundary: mintSourceProofBoundaryV2(),
          limitations: [
            'Evidence bytes come from one process-proven committed-reserve collector receipt.',
            'The collector discloses dual-RPC depth policy evidence and does not authenticate Ergo proof of work.',
            'The attestors are process-owned synthetic LAB actors; the threshold remains the source authority.',
            'The settlement-family profile is packet-bound but is not activated by this receipt.',
            'No runtime reservation, mint, funds authority, Gate 5 closure, or trustless status is established.',
          ] as const,
        });
        const receipt = deepFreeze({
          ...body,
          receiptDigestHex: sha256CanonicalJson(
            body,
            MINT_SOURCE_PROOF_RECEIPT_V2_DIGEST_DOMAIN,
          ),
        });
        MINT_SOURCE_PROOF_V2_RECEIPTS.add(receipt);
        return receipt;
      } catch (error) {
        signers = [];
        state = 'disposed';
        throw error;
      }
    },
    produceCheckpointAttestation: (
      input: Readonly<
        ProduceSubstrateFederatedIsolatedDevnetCheckpointAttestationV1Input
      >,
    ) => {
      assertOpen(state);
      if (signedTarget === undefined) {
        throw new Error(
          'isolated-devnet checkpoint attestation requires one completed launch attestation',
        );
      }
      if (checkpointAttestationProduced) {
        throw new Error(
          'isolated-devnet checkpoint-attestation capability is already consumed',
        );
      }
      const checkpointInput = exactRecord(
        input,
        [
          'admissionExpiresAtErgoHeight',
          'admissionValidFromErgoHeight',
          'bridgeEventRootHex',
          'burnLeafCount',
          'executionBlockHashHex',
          'sourceNativeBlockHashHex',
          'sourceNativeBlockHeight',
        ],
        'isolated-devnet checkpoint-attestation input',
      );
      const target = signedTarget;
      const checkpointProfile = buildSubstrateFederatedCheckpointProfileV1({
        federationEpoch: target.federation.federationEpoch,
        maxAdmissionValidityBlocks:
          target.federation.maxAdmissionValidityBlocks,
        sourceAttestationThreshold:
          target.federation.sourceAttestationThreshold,
        sourceAttestationPublicKeysHex:
          target.federation.sourceAttestationPublicKeysHex,
        ergoAdmissionThreshold: target.federation.ergoAdmissionThreshold,
        ergoAdmissionPublicKeysHex:
          target.federation.ergoAdmissionPublicKeysHex,
      });
      if (
        checkpointProfile.profileIdHex
          !== binding.checkpointFederationProfileIdHex
        || checkpointProfile.sourceAttestationKeySetDigestHex
          !== binding.checkpointSourceAttestationKeySetDigestHex
        || checkpointProfile.profileIdHex
          !== target.federation.federationProfileIdHex
        || checkpointProfile.sourceAttestationKeySetDigestHex
          !== target.federation.sourceAttestationKeySetDigestHex
      ) {
        throw new Error(
          'isolated-devnet checkpoint profile differs from the launched target',
        );
      }
      const sourceNativeBlockHeight = uint64(
        checkpointInput.sourceNativeBlockHeight,
        'isolated-devnet checkpoint source native height',
      );
      if (sourceNativeBlockHeight === 0n) {
        throw new Error(
          'isolated-devnet checkpoint source native height must be positive',
        );
      }
      const admissionValidFromErgoHeight = uint64(
        checkpointInput.admissionValidFromErgoHeight,
        'isolated-devnet checkpoint admission valid-from height',
      );
      const admissionExpiresAtErgoHeight = uint64(
        checkpointInput.admissionExpiresAtErgoHeight,
        'isolated-devnet checkpoint admission expiry height',
      );
      const checkpointStatement =
        buildSubstrateFederatedCheckpointStatementV1({
          profile: checkpointProfile,
          sourceNetworkIdHex: target.sourceRuntime.sourceNetworkIdHex,
          sidechainIdHex: target.sourceRuntime.sidechainIdHex,
          sourceNativeBlockHeight,
          sourceNativeBlockHashHex: fixedHex(
            checkpointInput.sourceNativeBlockHashHex,
            32,
            'isolated-devnet checkpoint source native block hash',
          ),
          executionBlockHashHex: fixedHex(
            checkpointInput.executionBlockHashHex,
            32,
            'isolated-devnet checkpoint execution block hash',
          ),
          bridgeEventRootHex: fixedHex(
            checkpointInput.bridgeEventRootHex,
            32,
            'isolated-devnet checkpoint bridge event root',
          ),
          burnLeafCount: positiveUint32(
            checkpointInput.burnLeafCount,
            'isolated-devnet checkpoint burn leaf count',
          ),
          bridgeAddressHex: target.sourceRuntime.bridgeAddressHex,
          tokenAddressHex: target.sourceRuntime.tokenAddressHex,
          bridgeRuntimeCodeSha256Hex:
            target.sourceRuntime.bridgeRuntimeCodeSha256Hex,
          bridgeRuntimeCodeBytes:
            target.sourceRuntime.bridgeRuntimeCodeBytes,
          tokenRuntimeCodeSha256Hex:
            target.sourceRuntime.tokenRuntimeCodeSha256Hex,
          tokenRuntimeCodeBytes: target.sourceRuntime.tokenRuntimeCodeBytes,
          sourceRuntimeCodeSha256Hex:
            target.sourceRuntime.sourceRuntimeCodeSha256Hex,
          sourceRuntimeCodeBytes: target.sourceRuntime.sourceRuntimeCodeBytes,
          runtimeProfileIdHex: target.sourceRuntime.runtimeProfileIdHex,
          settlementProfileIdHex: target.profile.settlementProfileIdHex,
          admissionValidFromErgoHeight,
          admissionExpiresAtErgoHeight,
        });
      const attestationDigestHex =
        deriveSubstrateFederatedCheckpointAttestationDigestHex(
          checkpointStatement.encodedStatementHex,
        );

      checkpointAttestationProduced = true;
      try {
        const signatures = signThreshold(signers, attestationDigestHex);
        assertCheckpointAttestationSignatures(
          checkpointProfile.sourceAttestationPublicKeysHex,
          checkpointProfile.sourceAttestationThreshold,
          attestationDigestHex,
          signatures,
        );
        const body = deepFreeze({
          schema:
            SUBSTRATE_FEDERATED_ISOLATED_DEVNET_CHECKPOINT_ATTESTATION_V1_SCHEMA,
          version: 1 as const,
          status: 'synthetic_federated_checkpoint_attested' as const,
          sourceAttestationBindingDigestHex: binding.bindingDigestHex,
          targetDescriptorDigestHex: target.descriptorDigestHex,
          checkpointStatement,
          attestationDigestHex,
          signatures,
          signatureSetDigestHex: sha256CanonicalJson(
            signatures,
            CHECKPOINT_ATTESTATION_SIGNATURE_SET_DIGEST_DOMAIN,
          ),
          checks: {
            exactLaunchTargetObjectBound: true as const,
            exactCheckpointProfileRebuilt: true as const,
            exactApplicationAndProfileIdentityBound: true as const,
            exactDynamicCheckpointFieldsBound: true as const,
            exactThresholdSignatureSetVerified: true as const,
            boundedAdmissionHorizonVerified: true as const,
            oneShotCapabilityConsumed: true as const,
          },
          boundary: {
            processOwnedSyntheticCustodyOnly: true as const,
            thresholdSourceAttestationVerified: true as const,
            independentAttestorCustodyEstablished: false as const,
            sourceConsensusIndependentlyVerified: false as const,
            deterministicSourceFinalityEstablished: false as const,
            mintBeforeCheckpointLifecycleEstablished: false as const,
            ergoAnchorEstablished: false as const,
            trackerAdmissionEstablished: false as const,
            replayInsertionEstablished: false as const,
            payoutAuthorized: false as const,
            ergoTransactionSigningAuthorized: false as const,
            submissionAuthorized: false as const,
            broadcastAuthorized: false as const,
            fundsAuthorityEstablished: false as const,
            gate5Closed: false as const,
            trustlessStatusEstablished: false as const,
            productionReadinessEstablished: false as const,
          },
          limitations: [
            'The source-attestation keys are synthetic and share one process; this receipt proves the disclosed threshold policy decision only.',
            'The checkpoint statement is bound to the exact launched application/profile, but the dynamic burn fields require a separate process-proven producer join.',
            'The source-attestation session does not establish mint-before-checkpoint lifecycle ordering; a process-proven packet composition must impose it.',
            'No independent source consensus, deterministic finality, Ergo anchor, tracker admission, replay insertion, payout, funds authority, Gate 5 closure, trustless status, or production readiness is established.',
          ] as const,
        });
        const receipt = deepFreeze({
          ...body,
          receiptDigestHex: sha256CanonicalJson(
            body,
            CHECKPOINT_ATTESTATION_RECEIPT_DIGEST_DOMAIN,
          ),
        });
        CHECKPOINT_ATTESTATION_RECEIPTS.add(receipt);
        return receipt;
      } catch (error) {
        signers = [];
        signedTarget = undefined;
        state = 'disposed';
        throw error;
      }
    },
    dispose: () => {
      if (state === 'open') {
        signers = [];
        signedTarget = undefined;
        state = 'disposed';
      }
    },
  });
  V2_SESSIONS.add(session);
  V2_GENESIS_PROFILES.set(session, () => {
    assertOpen(state);
    if (launchSigningStarted) {
      throw new Error('isolated-devnet source-attestation session is already bound to a launch');
    }
    return Object.freeze({ checkpointProfile, mintProofProfile: mintProfileInput });
  });
  NATIVE_MINT_PRODUCERS.set(session, input => {
    assertOpen(state);
    if (launchSigningStarted) throw new Error('native mint proof cannot use a LAB launch session');
    if (mintProofProduced) throw new Error('native mint source-proof capability is already consumed');
    exactRecord(input, ['draftInputs', 'draft', 'evidenceReceipt', 'issuedAtNativeHeight', 'expiresAtNativeHeight'],
      'native mint source-proof input');
    if (Reflect.ownKeys(input).length !== 5) throw new Error('native mint proof requires exact own-data fields');
    assertSubstrateFederatedNativeGenesisPegInMintReservationDraftV1(input.draft, input.draftInputs);
    input = Object.freeze({ ...input, draftInputs: Object.freeze({ ...input.draftInputs }) });
    const { draft, draftInputs, evidenceReceipt } = input;
    const context = getSubstrateFederatedNativeGenesisAttestationContextV1(draftInputs.batch, draftInputs.target);
    const candidate = context.candidate;
    const runtimeProfile = decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(candidate.runtimeProfileScaleHex);
    const runtimeProfileIdHex = derivePooledReserveMintReservationRuntimeProfileV4IdHex(runtimeProfile);
    if (runtimeProfile.activationHeight !== '0'
      || runtimeProfileIdHex !== candidate.runtimeProfileIdHex
      || runtimeProfile.sourceProofProfileIdHex !== federatedMintProfile.proofProfileIdHex
      || runtimeProfile.sourceProofSystemIdHex !== federatedMintProfile.proofSystemIdHex
      || sha256CanonicalJson(context.checkpointProfile) !== sha256CanonicalJson(checkpointProfile)) {
      throw new Error('native mint proof requires the exact retained height-zero federation profile');
    }
    const issued = uint64(input.issuedAtNativeHeight, 'native source-proof issue height');
    const expires = uint64(input.expiresAtNativeHeight, 'native source-proof expiry height');
    assertMintSourceProofWindow(issued, expires, 0n, BigInt(runtimeProfile.maxPendingBlocks),
      BigInt(federatedMintProfile.maxValidityBlocks));
    const assertCurrent = () => {
      assertOpen(state);
      assertSubstrateFederatedNativeGenesisPegInMintReservationDraftV1(draft, draftInputs);
      const current = getSubstrateFederatedNativeGenesisAttestationContextV1(draftInputs.batch, draftInputs.target);
      if (current.candidate !== candidate
        || sha256CanonicalJson(current.checkpointProfile) !== sha256CanonicalJson(checkpointProfile)) {
        throw new Error('native mint proof retained genesis changed');
      }
    };
    // The native and LAB mint routes share one signing budget, but not a launch identity.
    nativeMintSigningStarted = true;
    mintProofProduced = true;
    try {
      const evidence = consumeSubstrateFederatedNativeGenesisCommittedReserveEvidenceForDraftV1(evidenceReceipt, draft);
      const request = deepFreeze({ runtimeProfile, statementHex: draft.statementHex,
        evidence: canonicalEvidence(evidence), issuedAtNativeHeight: issued.toString(),
        expiresAtNativeHeight: expires.toString() } satisfies FederatedPooledReserveSourceProofRequestV1);
      const requestDigestHex = deriveFederatedPooledReserveSourceProofRequestDigestForProfileV1Hex(mintProfileInput, request);
      const result = buildFederatedPooledReserveSourceProofResultFieldsForProfileV1(mintProfileInput, request);
      const resultIdHex = deriveFederatedPooledReserveSourceProofResultIdForProfileV1Hex(mintProfileInput, request, result);
      const attestationDigestHex = deriveFederatedPooledReserveSourceProofAttestationDigestV1Hex(resultIdHex);
      assertCurrent();
      const signatures = signThreshold(signers, attestationDigestHex).map(value => ({
        signerPublicKeyHex: `0x${value.signerPublicKeyHex}`, signatureHex: `0x${value.signatureHex}`,
      }));
      const signatureVerification = verifyFederatedPooledReserveSourceProofSignaturesForProfileV1(
        mintProfileInput, request, result, signatures);
      if (result.requestDigestHex !== requestDigestHex || signatureVerification.resultIdHex !== resultIdHex
        || signatureVerification.attestationDigestHex !== attestationDigestHex) {
        throw new Error('native mint proof request/result/signature binding changed');
      }
      const envelope = { result, signatures: signatureVerification.signatures };
      const proofBytesScaleHex = encodeFederatedPooledReserveSourceProofEnvelopeScaleForProfileV1Hex(
        mintProfileInput, request, envelope);
      const sourceProofEnvelopeScaleHex = encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex(
        mintProfileInput, request, envelope);
      assertCurrent();
      const body = deepFreeze({
        schema: 'e2s.substrate-federated-native-genesis-mint-source-proof.v1' as const,
        version: 1 as const, status: 'collected_federated_source_proof_produced' as const,
        sourceAttestationBindingDigestHex: binding.bindingDigestHex,
        sourceEvidenceReceiptDigestHex: evidenceReceipt.receiptDigestHex,
        mintReservationDraftDigestHex: draft.draftDigestHex,
        mintReservationStatementIdHex: draft.statementIdHex, mintIdentityHex: draft.reservationKeyHex,
        provenance: draft.provenance, genesisJsonSha256Hex: candidate.genesisJsonSha256Hex,
        runtimeProfileScaleHex: candidate.runtimeProfileScaleHex, runtimeProfileIdHex,
        sourceProofProfileIdHex: federatedMintProfile.proofProfileIdHex,
        sourceProofProfileScaleHex: binding.federatedMintProfileScaleHex,
        requestDigestHex, request, result, signatureVerification, proofBytesScaleHex, sourceProofEnvelopeScaleHex,
        sourceProofEnvelopeSha256Hex: createHash('sha256')
          .update(Buffer.from(sourceProofEnvelopeScaleHex.slice(2), 'hex')).digest('hex'),
        checks: { exactOriginalDraftInputsBound: true as const, exactRetainedGenesisProfileBound: true as const,
          heightZeroProfileRequired: true as const, exactSourceEvidenceReceiptBound: true as const,
          exactThresholdSignatureSetVerified: true as const, oneShotCapabilityConsumed: true as const },
        boundary: mintSourceProofBoundaryV2(),
      });
      const receipt = deepFreeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, NATIVE_MINT_PROOF_DOMAIN) });
      NATIVE_MINT_RECEIPTS.set(receipt, Object.freeze({ session, draft, assertCurrent,
        context: () => { assertCurrent(); return getSubstrateFederatedNativeGenesisAttestationContextV1(draftInputs.batch, draftInputs.target); } }));
      return receipt;
    } catch (error) {
      signers = [];
      state = 'disposed';
      throw error;
    }
  });
  NATIVE_CHECKPOINT_PRODUCERS.set(session, input => {
    const assertAvailable = () => {
      assertOpen(state);
      if (launchSigningStarted) throw new Error('native checkpoint cannot use a LAB launch session');
      if (checkpointAttestationProduced) throw new Error('native checkpoint-attestation capability is already consumed');
    };
    assertAvailable();
    exactRecord(input, ['proof', 'checkpoint'], 'native checkpoint input');
    if (Reflect.ownKeys(input).length !== 2) throw new Error('native checkpoint requires exact own-data fields');
    const { proof } = input;
    const retained = NATIVE_MINT_RECEIPTS.get(proof);
    if (!retained || retained.session !== session) throw new Error('native checkpoint requires the original session mint proof provenance');
    const fields = ['sourceNativeBlockHeight', 'sourceNativeBlockHashHex', 'executionBlockHashHex',
      'bridgeEventRootHex', 'burnLeafCount', 'admissionValidFromErgoHeight', 'admissionExpiresAtErgoHeight'];
    const raw = exactRecord(input.checkpoint, fields, 'native checkpoint fields');
    if (Reflect.ownKeys(raw).length !== fields.length) throw new Error('native checkpoint requires exact own-data fields');
    const checkpoint = Object.freeze({ ...raw });
    const context = retained.context();
    const app = context.application;
    const appDigest = sha256CanonicalJson(app);
    const assertCurrent = () => {
      assertSubstrateFederatedNativeGenesisMintSourceProofReceiptV1(proof, session, retained.draft);
      const current = retained.context();
      if (current.candidate !== context.candidate || sha256CanonicalJson(current.application) !== appDigest
        || sha256CanonicalJson(current.checkpointProfile) !== sha256CanonicalJson(checkpointProfile)) {
        throw new Error('native checkpoint retained application or federation changed');
      }
    };
    assertCurrent();
    const sourceNativeBlockHeight = uint64(checkpoint.sourceNativeBlockHeight, 'native checkpoint height');
    if (sourceNativeBlockHeight === 0n) throw new Error('native checkpoint height must be positive');
    const checkpointStatement = buildSubstrateFederatedCheckpointStatementV1({
      profile: checkpointProfile,
      sourceNetworkIdHex: app.sourceNetworkIdHex, sidechainIdHex: app.sidechainIdHex,
      sourceNativeBlockHeight,
      sourceNativeBlockHashHex: fixedHex(checkpoint.sourceNativeBlockHashHex, 32, 'native checkpoint block hash'),
      executionBlockHashHex: fixedHex(checkpoint.executionBlockHashHex, 32, 'native checkpoint execution hash'),
      bridgeEventRootHex: fixedHex(checkpoint.bridgeEventRootHex, 32, 'native checkpoint root'),
      burnLeafCount: positiveUint32(checkpoint.burnLeafCount, 'native checkpoint leaf count'),
      bridgeAddressHex: app.bridgeAddressHex, tokenAddressHex: app.tokenAddressHex,
      bridgeRuntimeCodeSha256Hex: app.bridgeRuntimeCodeSha256Hex, bridgeRuntimeCodeBytes: app.bridgeRuntimeCodeBytes,
      tokenRuntimeCodeSha256Hex: app.tokenRuntimeCodeSha256Hex, tokenRuntimeCodeBytes: app.tokenRuntimeCodeBytes,
      sourceRuntimeCodeSha256Hex: app.sourceRuntimeCodeSha256Hex, sourceRuntimeCodeBytes: app.sourceRuntimeCodeBytes,
      runtimeProfileIdHex: app.runtimeProfileIdHex, settlementProfileIdHex: app.settlementProfileIdHex,
      admissionValidFromErgoHeight: uint64(checkpoint.admissionValidFromErgoHeight, 'native checkpoint admission start'),
      admissionExpiresAtErgoHeight: uint64(checkpoint.admissionExpiresAtErgoHeight, 'native checkpoint admission expiry'),
    });
    const attestationDigestHex = deriveSubstrateFederatedCheckpointAttestationDigestHex(checkpointStatement.encodedStatementHex);
    // Input inspection and retained custody checks can reenter. Claim the shared slot last.
    assertCurrent();
    assertAvailable();
    checkpointAttestationProduced = true;
    try {
      const signatures = signThreshold(signers, attestationDigestHex);
      assertCheckpointAttestationSignatures(checkpointProfile.sourceAttestationPublicKeysHex,
        checkpointProfile.sourceAttestationThreshold, attestationDigestHex, signatures);
      assertCurrent();
      const body = deepFreeze({ schema: 'e2s.substrate-federated-native-genesis-checkpoint-attestation.v1' as const,
        version: 1 as const, sourceAttestationBindingDigestHex: binding.bindingDigestHex,
        sourceProofReceiptDigestHex: proof.receiptDigestHex, genesisJsonSha256Hex: context.candidate.genesisJsonSha256Hex,
        checkpointStatement, attestationDigestHex, signatures,
        signatureSetDigestHex: sha256CanonicalJson(signatures, CHECKPOINT_ATTESTATION_SIGNATURE_SET_DIGEST_DOMAIN),
        sourceFinalityEstablished: false as const, ergoPayoutAuthorized: false as const, trustless: false as const });
      const receipt = deepFreeze({ ...body, receiptDigestHex: sha256CanonicalJson(body, NATIVE_CHECKPOINT_DOMAIN) });
      NATIVE_CHECKPOINT_RECEIPTS.set(receipt, Object.freeze({ session, proof, assertCurrent }));
      return receipt;
    } catch (error) {
      signers = [];
      state = 'disposed';
      throw error;
    }
  });
  return session;
}

/** Synthetic quorum decision; the composition separately binds observed burn fields. */
export function produceSubstrateFederatedNativeGenesisCheckpointAttestationV1(
  session: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2>,
  input: Readonly<ProduceSubstrateFederatedNativeGenesisCheckpointAttestationV1Input>,
): Readonly<SubstrateFederatedNativeGenesisCheckpointAttestationReceiptV1> {
  assertSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2Provenance(session);
  return NATIVE_CHECKPOINT_PRODUCERS.get(session)!(input);
}

export function assertSubstrateFederatedNativeGenesisCheckpointAttestationV1(
  receipt: unknown,
  session: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2>,
  proof: Readonly<SubstrateFederatedNativeGenesisMintSourceProofReceiptV1>,
): asserts receipt is Readonly<SubstrateFederatedNativeGenesisCheckpointAttestationReceiptV1> {
  const retained = receipt !== null && typeof receipt === 'object' ? NATIVE_CHECKPOINT_RECEIPTS.get(receipt) : undefined;
  if (!retained || retained.session !== session || retained.proof !== proof) throw new Error('native checkpoint lacks exact provenance');
  retained.assertCurrent();
  const { receiptDigestHex, ...body } = receipt as SubstrateFederatedNativeGenesisCheckpointAttestationReceiptV1;
  if (receiptDigestHex !== sha256CanonicalJson(body, NATIVE_CHECKPOINT_DOMAIN)) throw new Error('native checkpoint receipt digest changed');
}

export function produceSubstrateFederatedNativeGenesisMintSourceProofV1(
  session: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2>,
  input: Readonly<ProduceSubstrateFederatedNativeGenesisMintSourceProofV1Input>,
): Readonly<SubstrateFederatedNativeGenesisMintSourceProofReceiptV1> {
  assertSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2Provenance(session);
  return NATIVE_MINT_PRODUCERS.get(session)!(input);
}

export function assertSubstrateFederatedNativeGenesisMintSourceProofReceiptV1(
  value: unknown,
  session: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2>,
  draft: Readonly<SubstrateFederatedNativeGenesisPegInMintReservationDraftV1>,
): asserts value is Readonly<SubstrateFederatedNativeGenesisMintSourceProofReceiptV1> {
  const retained = value !== null && typeof value === 'object' ? NATIVE_MINT_RECEIPTS.get(value) : undefined;
  if (retained === undefined || retained.session !== session || retained.draft !== draft) {
    throw new Error('native mint proof lacks exact session/draft provenance');
  }
  retained.assertCurrent();
  const { receiptDigestHex, ...body } = value as Readonly<SubstrateFederatedNativeGenesisMintSourceProofReceiptV1>;
  if (receiptDigestHex !== sha256CanonicalJson(body, NATIVE_MINT_PROOF_DOMAIN)) {
    throw new Error('native mint proof receipt digest changed');
  }
}

/** Public configuration only; requires retained custody not yet bound to a launch. */
export function readSubstrateFederatedGenesisProfilesFromSessionV2(
  session: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2>,
) {
  assertSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2Provenance(session);
  return V2_GENESIS_PROFILES.get(session)!();
}

export function assertSubstrateFederatedIsolatedDevnetSourceAttestationSessionV1Provenance(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetSourceAttestationSessionV1
> {
  if (
    value === null
    || typeof value !== 'object'
    || !SESSIONS.has(value)
  ) {
    throw new Error('isolated-devnet source-attestation session lacks provenance');
  }
}

export function assertSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2Provenance(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2
> {
  if (
    value === null
    || typeof value !== 'object'
    || !V2_SESSIONS.has(value)
  ) {
    throw new Error(
      'isolated-devnet source-attestation V2 session lacks provenance',
    );
  }
}

export function assertSubstrateFederatedIsolatedDevnetCheckpointAttestationReceiptV1Provenance(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetCheckpointAttestationReceiptV1
> {
  if (
    value === null
    || typeof value !== 'object'
    || !CHECKPOINT_ATTESTATION_RECEIPTS.has(value)
  ) {
    throw new Error(
      'isolated-devnet checkpoint-attestation receipt lacks process provenance',
    );
  }
  const receipt = value as Readonly<
    SubstrateFederatedIsolatedDevnetCheckpointAttestationReceiptV1
  >;
  const { receiptDigestHex, ...body } = receipt;
  if (
    sha256CanonicalJson(
      body,
      CHECKPOINT_ATTESTATION_RECEIPT_DIGEST_DOMAIN,
    ) !== receiptDigestHex
  ) {
    throw new Error(
      'isolated-devnet checkpoint-attestation receipt digest changed',
    );
  }
}

export function assertSubstrateFederatedIsolatedDevnetMintSourceProofReceiptV1Provenance(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetMintSourceProofReceiptV1
> {
  if (
    value === null
    || typeof value !== 'object'
    || !MINT_SOURCE_PROOF_RECEIPTS.has(value)
  ) {
    throw new Error(
      'isolated-devnet mint source-proof receipt lacks process provenance',
    );
  }
  const { receiptDigestHex, ...body } = value as Readonly<
    SubstrateFederatedIsolatedDevnetMintSourceProofReceiptV1
  >;
  if (
    receiptDigestHex
      !== sha256CanonicalJson(body, MINT_SOURCE_PROOF_RECEIPT_DIGEST_DOMAIN)
  ) {
    throw new Error('isolated-devnet mint source-proof receipt digest changed');
  }
}

export function assertSubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2Provenance(
  value: unknown,
): asserts value is Readonly<
  SubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2
> {
  if (
    value === null
    || typeof value !== 'object'
    || !MINT_SOURCE_PROOF_V2_RECEIPTS.has(value)
  ) {
    throw new Error(
      'isolated-devnet settlement-family mint source-proof receipt lacks process provenance',
    );
  }
  const { receiptDigestHex, ...body } = value as Readonly<
    SubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2
  >;
  if (
    receiptDigestHex
      !== sha256CanonicalJson(
        body,
        MINT_SOURCE_PROOF_RECEIPT_V2_DIGEST_DOMAIN,
      )
  ) {
    throw new Error(
      'isolated-devnet settlement-family mint source-proof receipt digest changed',
    );
  }
  const runtimeProfile =
    decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
      body.runtimeProfileScaleHex,
    );
  const sourceProofProfileInput =
    decodeFederatedPooledReserveSourceProofProfileScaleV1Hex(
      body.sourceProofProfileScaleHex,
    );
  const sourceProofProfile =
    buildFederatedPooledReserveSourceProofProfileV1(
      sourceProofProfileInput,
    );
  const sourceProofEnvelope =
    decodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex(
      sourceProofProfileInput,
      body.request,
      body.sourceProofEnvelopeScaleHex,
    );
  const sourceProofProfileIdHex = fixedHex(
    body.sourceProofProfileIdHex,
    32,
    'isolated-devnet source-proof profile ID',
  );
  if (
    derivePooledReserveMintReservationRuntimeProfileV4IdHex(runtimeProfile)
      !== fixedHex(
        body.runtimeProfileIdHex,
        32,
        'isolated-devnet runtime profile ID',
      )
    || fixedHex(
      runtimeProfile.sourceProofProfileIdHex,
      32,
      'isolated-devnet runtime source-proof profile ID',
    ) !== sourceProofProfileIdHex
    || fixedHex(
      runtimeProfile.sourceProofSystemIdHex,
      32,
      'isolated-devnet runtime source-proof system ID',
    ) !== fixedHex(
      sourceProofProfile.proofSystemIdHex,
      32,
      'isolated-devnet profile source-proof system ID',
    )
    || fixedHex(
      sourceProofProfile.proofProfileIdHex,
      32,
      'isolated-devnet decoded source-proof profile ID',
    ) !== sourceProofProfileIdHex
    || fixedHex(
      sourceProofEnvelope.proofProfileIdHex,
      32,
      'isolated-devnet envelope source-proof profile ID',
    ) !== sourceProofProfileIdHex
    || sourceProofEnvelope.issuedAtNativeHeight.toString()
      !== body.request.issuedAtNativeHeight.toString()
    || sourceProofEnvelope.expiresAtNativeHeight.toString()
      !== body.request.expiresAtNativeHeight.toString()
    || canonicalBytes(
      sourceProofEnvelope.proofBytesHex,
      'isolated-devnet source-proof envelope bytes',
    ) !== canonicalBytes(
      body.proofBytesScaleHex,
      'isolated-devnet source-proof receipt bytes',
    )
    || canonicalBytes(
      body.sourceProofProfileScaleHex,
      'isolated-devnet source-proof profile SCALE bytes',
    ) !== body.sourceProofProfileScaleHex
  ) {
    throw new Error(
      'isolated-devnet settlement-family mint source-proof profile binding changed',
    );
  }
}

function assertCheckpointAttestationSignatures(
  allowedPublicKeysHex: readonly string[],
  threshold: number,
  attestationDigestHex: string,
  signatures: readonly Readonly<
    SubstrateFederatedIsolatedDevnetLaunchSignatureV1
  >[],
): void {
  if (signatures.length !== threshold) {
    throw new Error(
      'isolated-devnet checkpoint attestation has the wrong signature count',
    );
  }
  const digest = Buffer.from(
    fixedHex(
      attestationDigestHex,
      32,
      'isolated-devnet checkpoint attestation digest',
    ).slice(2),
    'hex',
  );
  const seen = new Set<string>();
  for (const signature of signatures) {
    const publicKeyHex = fixedHex(
      signature.signerPublicKeyHex,
      32,
      'isolated-devnet checkpoint attestation public key',
    ).slice(2);
    const signatureHex = fixedHex(
      signature.signatureHex,
      64,
      'isolated-devnet checkpoint attestation signature',
    ).slice(2);
    if (
      seen.has(publicKeyHex)
      || !allowedPublicKeysHex.includes(publicKeyHex)
      || !verify(
        null,
        digest,
        createPublicKey({
          key: Buffer.concat([
            ED25519_SPKI_PREFIX,
            Buffer.from(publicKeyHex, 'hex'),
          ]),
          format: 'der',
          type: 'spki',
        }),
        Buffer.from(signatureHex, 'hex'),
      )
    ) {
      throw new Error(
        'isolated-devnet checkpoint attestation signature verification failed',
      );
    }
    seen.add(publicKeyHex);
  }
}

function signThreshold(
  signers: readonly SourceSigner[],
  digestHex: string,
): readonly Readonly<
  SubstrateFederatedIsolatedDevnetLaunchSignatureV1
>[] {
  const normalizedDigestHex = digestHex.startsWith('0x')
    ? digestHex.slice(2)
    : digestHex;
  if (
    signers.length
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_KEY_COUNT_V1
    || !/^[0-9a-f]{64}$/.test(normalizedDigestHex)
  ) {
    throw new Error('isolated-devnet source-attestation capability is invalid');
  }
  return deepFreeze(signers.slice(
    0,
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD_V1,
  ).map(value => ({
    signerPublicKeyHex: value.publicKeyHex,
    signatureHex: sign(
      null,
      Buffer.from(normalizedDigestHex, 'hex'),
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

function falseBoundaries() {
  return Object.freeze({
    processOwnedSyntheticCustodyOnly: true as const,
    independentAttestorCustodyEstablished: false as const,
    runtimeProviderCompiled: false as const,
    runtimeProfileActivated: false as const,
    sourceProofProduced: false as const,
    mintReservationWritten: false as const,
    mintExecuted: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
}

function mintSourceProofBoundary() {
  return Object.freeze({
    processOwnedSyntheticCustodyOnly: true as const,
    evidenceBytesCallerSupplied: true as const,
    sourceEvidenceCollectionProvenanceEstablished: false as const,
    sourceCanonicalityIndependentlyVerified: false as const,
    independentAttestorCustodyEstablished: false as const,
    runtimeProviderCompiled: false as const,
    runtimeProfileActivated: false as const,
    runtimeReservationWritten: false as const,
    mintExecuted: false as const,
    ergoTransactionSigningAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
}

function mintSourceProofBoundaryV2() {
  return Object.freeze({
    processOwnedSyntheticCustodyOnly: true as const,
    evidenceBytesCallerSupplied: false as const,
    sourceEvidenceCollectionProvenanceEstablished: true as const,
    sourceCanonicalityIndependentlyVerified: false as const,
    independentAttestorCustodyEstablished: false as const,
    runtimeProviderCompiled: false as const,
    runtimeProfileActivated: false as const,
    runtimeReservationWritten: false as const,
    mintExecuted: false as const,
    ergoTransactionSigningAuthorized: false as const,
    submissionAuthorized: false as const,
    broadcastAuthorized: false as const,
    fundsAuthorityEstablished: false as const,
    gate5Closed: false as const,
    trustlessStatusEstablished: false as const,
    productionReadinessEstablished: false as const,
  });
}

function canonicalEvidence(
  value: unknown,
): Readonly<FederatedPooledReserveSourceProofEvidenceV1> {
  const record = exactRecord(
    value,
    [
      'checkpointAncestryCanonicalHex',
      'finalityProofCanonicalHex',
      'inclusionProofCanonicalHex',
      'reserveTransitionTransactionCanonicalHex',
      'sourceLockBoxCanonicalHex',
      'successorReserveBoxCanonicalHex',
      'verifierExecutableSha256Hex',
    ],
    'isolated-devnet mint source-proof evidence',
  );
  return deepFreeze({
    sourceLockBoxCanonicalHex: canonicalBytes(
      record.sourceLockBoxCanonicalHex,
      'source-lock box evidence',
    ),
    reserveTransitionTransactionCanonicalHex: canonicalBytes(
      record.reserveTransitionTransactionCanonicalHex,
      'reserve-transition transaction evidence',
    ),
    successorReserveBoxCanonicalHex: canonicalBytes(
      record.successorReserveBoxCanonicalHex,
      'successor-reserve box evidence',
    ),
    inclusionProofCanonicalHex: canonicalBytes(
      record.inclusionProofCanonicalHex,
      'inclusion proof evidence',
    ),
    checkpointAncestryCanonicalHex: canonicalBytes(
      record.checkpointAncestryCanonicalHex,
      'checkpoint ancestry evidence',
    ),
    finalityProofCanonicalHex: canonicalBytes(
      record.finalityProofCanonicalHex,
      'finality proof evidence',
    ),
    verifierExecutableSha256Hex: fixedHex(
      record.verifierExecutableSha256Hex,
      32,
      'verifier executable SHA-256',
    ),
  });
}

function deriveRuntimeProfileForDraft(
  value: unknown,
  lineageProfileIdHex: string,
): Readonly<{
  encodedLineageProfileHex: string;
  runtimeProfile: Readonly<PooledReserveMintReservationRuntimeProfileV4>;
}> {
  const record = exactRecord(
    value,
    [
      'bridgeRuntimeCodeBytes',
      'bridgeRuntimeCodeSha256Hex',
      'encodedLineageProfileHex',
      'maxPendingBlocks',
      'tokenRuntimeCodeBytes',
      'tokenRuntimeCodeSha256Hex',
    ],
    'isolated-devnet runtime-profile derivation',
  );
  const encodedLineageProfileHex = canonicalBytes(
    record.encodedLineageProfileHex,
    'encoded pooled-reserve lineage profile',
  );
  const runtimeProfile =
    derivePooledReserveMintReservationRuntimeProfileV4({
      encodedLineageProfileHex,
      lineageProfileIdHex: fixedHex(
        lineageProfileIdHex,
        32,
        'mint-reservation draft lineage profile ID',
      ),
      bridgeRuntimeCodeSha256Hex: fixedHex(
        record.bridgeRuntimeCodeSha256Hex,
        32,
        'bridge runtime code SHA-256',
      ),
      bridgeRuntimeCodeBytes: positiveUint32(
        record.bridgeRuntimeCodeBytes,
        'bridge runtime code bytes',
      ),
      tokenRuntimeCodeSha256Hex: fixedHex(
        record.tokenRuntimeCodeSha256Hex,
        32,
        'token runtime code SHA-256',
      ),
      tokenRuntimeCodeBytes: positiveUint32(
        record.tokenRuntimeCodeBytes,
        'token runtime code bytes',
      ),
      maxPendingBlocks: positiveUint32(
        record.maxPendingBlocks,
        'maximum pending blocks',
      ),
    });
  return deepFreeze({ encodedLineageProfileHex, runtimeProfile });
}

function deriveRuntimeProfileForSettlementFamily(
  target: Readonly<SubstrateFederatedIsolatedDevnetTargetDescriptorV1
    | SubstrateFederatedIsolatedDevnetTargetDescriptorV2>,
  draft: Readonly<
    SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1
    | SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2
  >,
  binding: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationBindingV2>,
  federatedMintProfile: Readonly<FederatedPooledReserveSourceProofProfileV1>,
): Readonly<{
  settlementFamilyProfile:
    Readonly<SubstrateFederatedSettlementFamilyV1Profile>;
  runtimeProfile: Readonly<PooledReserveMintReservationRuntimeProfileV4>;
}> {
  const settlementFamilyProfile = deepFreeze({
    schema: SUBSTRATE_FEDERATED_SETTLEMENT_FAMILY_V1_SCHEMA,
    version: 1 as const,
    encodedProfileHex: target.profile.encodedProfileHex,
    familyIdHex: target.profile.familyIdHex,
    duplicatePreventionNftIdHex:
      target.lineages.duplicatePrevention.singletonTokenIdHex,
    pooledReserveNftIdHex:
      target.lineages.pooledReserve.singletonTokenIdHex,
  });
  const family = decodeSubstrateFederatedSettlementFamilyV1Profile(
    settlementFamilyProfile,
  );
  const sourceIntent = decodePegInSourceIntentV2Hex(
    draft.statement.sourceIntentHex,
  );
  const exactHexBindings = [
    [draft.statement.lineageProfileIdHex, settlementFamilyProfile.familyIdHex,
      32, 'settlement-family ID'],
    [sourceIntent.admissionProfileIdHex, settlementFamilyProfile.familyIdHex,
      32, 'source-intent admission profile ID'],
    [sourceIntent.sourceNetworkIdHex, family.sourceNetworkIdHex,
      32, 'source network ID'],
    [family.sourceNetworkIdHex, target.sourceRuntime.sourceNetworkIdHex,
      32, 'target source network ID'],
    [sourceIntent.sidechainIdHex, family.sidechainIdHex,
      32, 'sidechain ID'],
    [family.sidechainIdHex, target.sourceRuntime.sidechainIdHex,
      32, 'target sidechain ID'],
    [sourceIntent.bridgeAddressHex, family.bridgeAddressHex,
      20, 'bridge address'],
    [family.bridgeAddressHex, target.sourceRuntime.bridgeAddressHex,
      20, 'target bridge address'],
    [sourceIntent.tokenAddressHex, family.tokenAddressHex,
      20, 'token address'],
    [family.tokenAddressHex, target.sourceRuntime.tokenAddressHex,
      20, 'target token address'],
    [sourceIntent.settlementProfileIdHex, family.settlementProfileIdHex,
      32, 'settlement profile ID'],
    [family.runtimeProfileIdHex, target.sourceRuntime.runtimeProfileIdHex,
      32, 'runtime profile ID'],
    [family.settlementProfileIdHex, target.profile.settlementProfileIdHex,
      32, 'target settlement profile ID'],
    [draft.statement.ergoDepositFinalityPolicyIdHex,
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX,
      32, 'Ergo deposit finality-policy ID'],
    [family.federationProfileIdHex,
      binding.checkpointFederationProfileIdHex,
      32, 'checkpoint federation profile ID'],
    [family.federationProfileIdHex,
      target.federation.federationProfileIdHex,
      32, 'target federation profile ID'],
    [family.sourceAttestationKeySetDigestHex,
      binding.checkpointSourceAttestationKeySetDigestHex,
      32, 'checkpoint source-attestation key-set digest'],
    [family.sourceAttestationKeySetDigestHex,
      target.federation.sourceAttestationKeySetDigestHex,
      32, 'target source-attestation key-set digest'],
    [family.ergoAdmissionKeySetDigestHex,
      target.federation.ergoAdmissionKeySetDigestHex,
      32, 'Ergo admission key-set digest'],
    [family.trackerNftIdHex,
      target.lineages.tracker.singletonTokenIdHex,
      32, 'tracker singleton token ID'],
    [family.duplicatePreventionNftIdHex,
      target.lineages.duplicatePrevention.singletonTokenIdHex,
      32, 'duplicate-prevention singleton token ID'],
    [family.pooledReserveNftIdHex,
      target.lineages.pooledReserve.singletonTokenIdHex,
      32, 'pooled-reserve singleton token ID'],
  ] as const;
  for (const [actual, expected, bytes, label] of exactHexBindings) {
    if (fixedHex(actual, bytes, label) !== fixedHex(expected, bytes, label)) {
      throw new Error(
        `isolated-devnet settlement-family ${label} differs`,
      );
    }
  }
  if (
    family.sourceAttestationThreshold !== binding.sourceAttestationThreshold
    || family.ergoAdmissionThreshold
      !== target.federation.ergoAdmissionThreshold
    || family.federationEpoch !== federatedMintProfile.federationEpoch
    || family.federationEpoch !== target.federation.federationEpoch
  ) {
    throw new Error(
      'isolated-devnet settlement-family federation differs from the source-attestation session',
    );
  }
  const runtimeProfileScaleHex =
    encodePooledReserveMintReservationRuntimeProfileV4ScaleHex({
      formatVersion:
        POOLED_RESERVE_MINT_RESERVATION_RUNTIME_PROFILE_V4_FORMAT_VERSION,
      lineageProfileIdHex: fixedHex(
        settlementFamilyProfile.familyIdHex,
        32,
        'settlement-family ID',
      ),
      sourceNetworkIdHex: fixedHex(
        family.sourceNetworkIdHex,
        32,
        'source network ID',
      ),
      sidechainIdHex: fixedHex(
        family.sidechainIdHex,
        32,
        'sidechain ID',
      ),
      bridgeAddressHex: fixedHex(
        family.bridgeAddressHex,
        20,
        'bridge address',
      ),
      tokenAddressHex: fixedHex(
        family.tokenAddressHex,
        20,
        'token address',
      ),
      bridgeRuntimeCodeSha256Hex: fixedHex(
        target.sourceRuntime.bridgeRuntimeCodeSha256Hex,
        32,
        'bridge runtime code SHA-256',
      ),
      bridgeRuntimeCodeBytes: positiveUint32(
        target.sourceRuntime.bridgeRuntimeCodeBytes,
        'bridge runtime code bytes',
      ),
      tokenRuntimeCodeSha256Hex: fixedHex(
        target.sourceRuntime.tokenRuntimeCodeSha256Hex,
        32,
        'token runtime code SHA-256',
      ),
      tokenRuntimeCodeBytes: positiveUint32(
        target.sourceRuntime.tokenRuntimeCodeBytes,
        'token runtime code bytes',
      ),
      settlementProfileIdHex: fixedHex(
        family.settlementProfileIdHex,
        32,
        'settlement profile ID',
      ),
      ergoDepositFinalityPolicyIdHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX,
      sourceProofSystemIdHex: federatedMintProfile.proofSystemIdHex,
      sourceProofProfileIdHex: federatedMintProfile.proofProfileIdHex,
      activationHeight:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_RUNTIME_ACTIVATION_HEIGHT_V2,
      maxPendingBlocks:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_MAX_PENDING_BLOCKS_V2,
    });
  const runtimeProfile =
    decodePooledReserveMintReservationRuntimeProfileV4ScaleHex(
      runtimeProfileScaleHex,
    );
  return deepFreeze({ settlementFamilyProfile, runtimeProfile });
}

function assertMintSourceProofWindow(
  issuedAtNativeHeight: bigint,
  expiresAtNativeHeight: bigint,
  activationHeight: bigint,
  runtimeMaxPendingBlocks: bigint,
  sourceProofMaxValidityBlocks: bigint,
): void {
  const lifetime = expiresAtNativeHeight - issuedAtNativeHeight;
  if (
    issuedAtNativeHeight < activationHeight
    || expiresAtNativeHeight <= issuedAtNativeHeight
    || lifetime > runtimeMaxPendingBlocks
    || lifetime > sourceProofMaxValidityBlocks
  ) {
    throw new Error(
      'isolated-devnet mint source-proof window is outside the selected profile bounds',
    );
  }
}

function uint64(value: unknown, label: string): bigint {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a uint64`);
  }
  if (
    typeof value !== 'bigint'
    && typeof value !== 'number'
    && (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(value))
  ) {
    throw new Error(`${label} must be a uint64`);
  }
  const parsed = BigInt(value);
  if (parsed < 0n || parsed > UINT64_MAX) {
    throw new Error(`${label} must be a uint64`);
  }
  return parsed;
}

function canonicalBytes(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be non-empty canonical hexadecimal bytes`);
  }
  const normalized = value.toLowerCase().replace(/^0x/u, '');
  if (!/^(?:[0-9a-f]{2})+$/u.test(normalized)) {
    throw new Error(`${label} must be non-empty canonical hexadecimal bytes`);
  }
  return `0x${normalized}`;
}

function positiveUint32(value: unknown, label: string): number {
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value <= 0
    || value > 0xffff_ffff
  ) {
    throw new Error(`${label} must be a positive uint32`);
  }
  return value;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be ${bytes} canonical bytes`);
  }
  const normalized = value.toLowerCase().replace(/^0x/u, '');
  if (!new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(normalized)) {
    throw new Error(`${label} must be ${bytes} canonical bytes`);
  }
  return `0x${normalized}`;
}

function assertOpen(state: 'open' | 'disposed'): void {
  if (state !== 'open') {
    throw new Error('isolated-devnet source-attestation session is disposed');
  }
}

function exactRecord(
  value: unknown,
  expected: readonly string[],
  label: string,
): Record<string, unknown> {
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
  const fields = [...expected].sort(compareStrings);
  if (
    actual.length !== fields.length
    || actual.some((field, index) => field !== fields[index])
    || Object.values(descriptors).some(
      descriptor => !descriptor.enumerable || !('value' in descriptor),
    )
  ) {
    throw new Error(`${label} must contain exactly: ${fields.join(', ')}`);
  }
  return value as Record<string, unknown>;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}
