import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';

import {
  derivePooledReserveMintReservationRuntimeProfileV4,
  derivePooledReserveMintReservationRuntimeProfileV4IdHex,
  encodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
  type PooledReserveMintReservationRuntimeProfileV4,
} from './pooled-reserve-mint-reservation-runtime-profile-v4-codec.js';
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
  type SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1,
} from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetLaunchStatementV1Provenance,
  deriveSubstrateFederatedIsolatedDevnetLaunchAttestationDigestV1,
  type SubstrateFederatedIsolatedDevnetLaunchStatementV1,
  type SubstrateFederatedIsolatedDevnetLaunchSignatureV1,
} from './substrate-federated-isolated-devnet-launch-v1.js';
import { sha256CanonicalJson } from './strict-json.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_SESSION_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-source-attestation-session.v1' as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_KEY_COUNT_V1 =
  3 as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_THRESHOLD_V1 =
  2 as const;
export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_SOURCE_PROOF_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-mint-source-proof.v1' as const;

const BINDING_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_ATTESTATION_BINDING_V1';
const MINT_SOURCE_PROOF_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MINT_SOURCE_PROOF_RECEIPT_V1';
const SESSIONS = new WeakSet<object>();
const MINT_SOURCE_PROOF_RECEIPTS = new WeakSet<object>();
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
