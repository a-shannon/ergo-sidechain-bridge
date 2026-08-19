import {
  createPrivateKey,
  createPublicKey,
  sign as signMessage,
} from 'node:crypto';

import {
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_PROFILE_ID_V1_HEX,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_SIGNER_PUBLIC_KEYS_V1_HEX,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
  POOLED_RESERVE_MINT_RESERVATION_SOURCE_PROOF_FORMAT_VERSION_V4,
  buildFederatedPooledReserveSourceProofResultFieldsV1,
  deriveFederatedPooledReserveSourceProofAttestationDigestV1Hex,
  deriveFederatedPooledReserveSourceProofResultIdV1Hex,
  encodeFederatedPooledReserveSourceProofEnvelopeScaleV1Hex,
  encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleHex,
  type FederatedPooledReserveSourceProofRequestV1,
  type FederatedPooledReserveSourceProofResultFieldsV1,
  type FederatedPooledReserveSourceProofSignatureV1,
} from './substrate-federated-pooled-reserve-source-proof-v1.js';

const ED25519_PKCS8_SEED_PREFIX = Buffer.from(
  '302e020100300506032b657004220420',
  'hex',
);

const FIXTURE_SIGNERS = [0x42, 0x43, 0x41].map(seedByte => {
  const privateKey = createPrivateKey({
    key: Buffer.concat([
      ED25519_PKCS8_SEED_PREFIX,
      Buffer.alloc(32, seedByte),
    ]),
    format: 'der',
    type: 'pkcs8',
  });
  const publicKeyHex = `0x${createPublicKey(privateKey)
    .export({ format: 'der', type: 'spki' })
    .subarray(-32)
    .toString('hex')}`;
  return { privateKey, publicKeyHex };
});

for (const [index, signer] of FIXTURE_SIGNERS.entries()) {
  if (
    signer.publicKeyHex
    !== FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_SIGNER_PUBLIC_KEYS_V1_HEX[index]
  ) {
    throw new Error(
      'deterministic pooled-reserve source-proof signer differs from the Rust profile',
    );
  }
}

export function signFederatedPooledReserveSourceProofResultV1Fixture(
  result: FederatedPooledReserveSourceProofResultFieldsV1,
  signerIndexes: readonly number[] = [0, 1],
): readonly FederatedPooledReserveSourceProofSignatureV1[] {
  const resultIdHex =
    deriveFederatedPooledReserveSourceProofResultIdV1Hex(result);
  const attestationDigest = Buffer.from(
    deriveFederatedPooledReserveSourceProofAttestationDigestV1Hex(
      resultIdHex,
    ).slice(2),
    'hex',
  );
  return signerIndexes.map(index => {
    const signer = FIXTURE_SIGNERS[index];
    if (signer === undefined) {
      throw new Error(`unknown federated pooled-reserve fixture signer ${index}`);
    }
    return {
      signerPublicKeyHex: signer.publicKeyHex,
      signatureHex: `0x${signMessage(
        null,
        attestationDigest,
        signer.privateKey,
      ).toString('hex')}`,
    };
  });
}

export function createFederatedPooledReserveSourceProofV1Fixture(input: {
  readonly request: FederatedPooledReserveSourceProofRequestV1;
  readonly signerIndexes?: readonly number[];
}): Readonly<{
  result: Readonly<FederatedPooledReserveSourceProofResultFieldsV1>;
  signatures: readonly FederatedPooledReserveSourceProofSignatureV1[];
  proofBytesScaleHex: string;
  sourceProofEnvelopeScaleHex: string;
}> {
  const result = buildFederatedPooledReserveSourceProofResultFieldsV1(
    input.request,
  );
  const signatures = signFederatedPooledReserveSourceProofResultV1Fixture(
    result,
    input.signerIndexes,
  );
  const proofBytesScaleHex =
    encodeFederatedPooledReserveSourceProofEnvelopeScaleV1Hex({
      result,
      signatures,
    });
  const sourceProofEnvelopeScaleHex =
    encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleHex({
      formatVersion:
        POOLED_RESERVE_MINT_RESERVATION_SOURCE_PROOF_FORMAT_VERSION_V4,
      proofSystemIdHex:
        FEDERATED_POOLED_RESERVE_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
      proofProfileIdHex:
        FEDERATED_POOLED_RESERVE_SOURCE_PROOF_PROFILE_ID_V1_HEX,
      issuedAtNativeHeight: input.request.issuedAtNativeHeight,
      expiresAtNativeHeight: input.request.expiresAtNativeHeight,
      proofBytesHex: proofBytesScaleHex,
    });
  return {
    result,
    signatures,
    proofBytesScaleHex,
    sourceProofEnvelopeScaleHex,
  };
}
