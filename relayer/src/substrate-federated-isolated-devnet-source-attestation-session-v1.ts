import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign,
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
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FEDERATION_EPOCH_V1,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX,
  buildFederatedPooledReserveSourceProofProfileV1,
  buildFederatedPooledReserveSourceProofResultFieldsForProfileV1,
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
  assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX,
  type SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1,
} from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetLaunchStatementV1Provenance,
  deriveSubstrateFederatedIsolatedDevnetLaunchAttestationDigestV1,
  type SubstrateFederatedIsolatedDevnetLaunchStatementV1,
  type SubstrateFederatedIsolatedDevnetLaunchSignatureV1,
  type SubstrateFederatedIsolatedDevnetTargetDescriptorV1,
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
const SESSIONS = new WeakSet<object>();
const V2_SESSIONS = new WeakSet<object>();
const MINT_SOURCE_PROOF_RECEIPTS = new WeakSet<object>();
const MINT_SOURCE_PROOF_V2_RECEIPTS = new WeakSet<object>();
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
    >,
  ) => readonly Readonly<SubstrateFederatedIsolatedDevnetLaunchSignatureV1>[];
  readonly produceSettlementFamilyMintSourceProof: (
    input: Readonly<
      ProduceSubstrateFederatedIsolatedDevnetMintSourceProofV2Input
    >,
  ) => Readonly<SubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2>;
  readonly dispose: () => void;
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
    Readonly<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1>;
  readonly evidence: Readonly<FederatedPooledReserveSourceProofEvidenceV1>;
  readonly issuedAtNativeHeight: string | number | bigint;
  readonly expiresAtNativeHeight: string | number | bigint;
}

export interface SubstrateFederatedIsolatedDevnetMintSourceProofReceiptV2 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_SOURCE_PROOF_V2_SCHEMA;
  readonly version: 2;
  readonly status: 'synthetic_federated_source_proof_produced';
  readonly sourceAttestationBindingDigestHex: string;
  readonly targetDescriptorDigestHex: string;
  readonly mintReservationDraftDigestHex: string;
  readonly mintReservationStatementIdHex: string;
  readonly mintIdentityHex: string;
  readonly settlementFamilyIdHex: string;
  readonly encodedSettlementFamilyProfileHex: string;
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
    readonly exactTargetDescriptorBound: true;
    readonly exactSettlementFamilyIdBound: true;
    readonly runtimeProfileDerivedFromExactSettlementFamily: true;
    readonly callerSuppliedRuntimeProfileAccepted: false;
    readonly exactSelectedProfileBound: true;
    readonly exactRequestResultBound: true;
    readonly exactThresholdSignatureSetVerified: true;
    readonly boundedValidityWindowVerified: true;
    readonly oneShotCapabilityConsumed: true;
  }>;
  readonly boundary:
    SubstrateFederatedIsolatedDevnetMintSourceProofReceiptV1['boundary'];
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
  let signedTarget:
    Readonly<SubstrateFederatedIsolatedDevnetTargetDescriptorV1> | undefined;
  let mintProofProduced = false;
  const session = Object.freeze({
    binding,
    signLaunchStatement: (
      statement: Readonly<
        SubstrateFederatedIsolatedDevnetLaunchStatementV1
      >,
    ) => {
      assertOpen(state);
      if (launchSigningStarted) {
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
          'evidence',
          'expiresAtNativeHeight',
          'issuedAtNativeHeight',
        ],
        'isolated-devnet settlement-family mint source-proof input',
      );
      const draft = proofInput.draft as Readonly<
        SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1
      >;
      assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1(
        draft,
      );
      const target = signedTarget;
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
        evidence: canonicalEvidence(proofInput.evidence),
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
          status: 'synthetic_federated_source_proof_produced' as const,
          sourceAttestationBindingDigestHex: binding.bindingDigestHex,
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
            oneShotCapabilityConsumed: true as const,
          },
          boundary: mintSourceProofBoundary(),
          limitations: [
            'Evidence bytes are caller supplied and only bound to the exact signed request in this slice.',
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
    dispose: () => {
      if (state === 'open') {
        signers = [];
        signedTarget = undefined;
        state = 'disposed';
      }
    },
  });
  V2_SESSIONS.add(session);
  return session;
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
  target: Readonly<SubstrateFederatedIsolatedDevnetTargetDescriptorV1>,
  draft: Readonly<
    SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1
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
