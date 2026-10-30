import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as signMessage,
} from 'node:crypto';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { decodePegInSourceIntentV2Hex } from './peg-in-causal-admission-v2.js';
import {
  derivePooledReserveMintReservationRuntimeProfileV4IdHex,
  type PooledReserveMintReservationRuntimeProfileV4,
} from './pooled-reserve-mint-reservation-runtime-profile-v4-codec.js';
import {
  FEDERATED_POOLED_RESERVE_SOURCE_KEY_SET_DIGEST_V1_HEX,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FEDERATION_EPOCH_V1,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_INNER_SCALE_BYTES_V1,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_OUTER_SCALE_BYTES_V4,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_PROFILE_ID_V1_HEX,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_SIGNER_PUBLIC_KEYS_V1_HEX,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_THRESHOLD_V1,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX,
  POOLED_RESERVE_MINT_RESERVATION_SOURCE_PROOF_FORMAT_VERSION_V4,
  buildFederatedPooledReserveSourceProofProfileV1,
  buildFederatedPooledReserveSourceProofResultFieldsForProfileV1,
  decodeFederatedPooledReserveSourceProofEnvelopeScaleForProfileV1Hex,
  decodeFederatedPooledReserveSourceProofEnvelopeScaleV1Hex,
  decodeFederatedPooledReserveSourceProofProfileScaleV1Hex,
  decodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex,
  decodePooledReserveMintReservationSourceProofEnvelopeV4ScaleHex,
  deriveFederatedPooledReserveSourceProofAttestationDigestV1Hex,
  deriveFederatedPooledReserveSourceProofResultIdForProfileV1Hex,
  encodeFederatedPooledReserveSourceProofProfileScaleV1Hex,
  encodeFederatedPooledReserveSourceProofEnvelopeScaleForProfileV1Hex,
  encodeFederatedPooledReserveSourceProofEnvelopeScaleV1Hex,
  encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex,
  encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleHex,
  verifyFederatedPooledReserveSourceProofSignaturesForProfileV1,
  verifyFederatedPooledReserveSourceProofReferenceConformanceV1,
  type FederatedPooledReserveSourceProofProfileV1Input,
  type FederatedPooledReserveSourceProofRequestV1,
  type FederatedPooledReserveSourceProofSignatureV1,
} from './substrate-federated-pooled-reserve-source-proof-v1.js';
import {
  createFederatedPooledReserveSourceProofV1Fixture,
  signFederatedPooledReserveSourceProofResultForProfileV1Fixture,
} from './substrate-federated-pooled-reserve-source-proof-v1.test-helper.js';
import {
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_PROFILE_ID_V1_HEX,
  FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_PROFILE_SCALE_V1_HEX,
} from './substrate-federated-pooled-reserve-source-proof-profile-v1-fixture.js';
import type {
  ValidityApplicationPooledReserveMintReservationStatementV4,
} from './validity-application-pooled-reserve-mint-reservation-v4.js';

const statementVector = JSON.parse(
  readFileSync(
    new URL(
      '../test-vectors/validity-application-pooled-reserve-mint-reservation-v4.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  readonly statement: ValidityApplicationPooledReserveMintReservationStatementV4;
  readonly expected: {
    readonly statementHex: string;
    readonly statementIdHex: string;
    readonly reservationKeyHex: string;
  };
};

const referenceSourceProofProfile = Object.freeze({
  federationEpoch:
    FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FEDERATION_EPOCH_V1,
  threshold: FEDERATED_POOLED_RESERVE_SOURCE_PROOF_THRESHOLD_V1,
  signerPublicKeysHex:
    FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_SIGNER_PUBLIC_KEYS_V1_HEX,
  maxValidityBlocks:
    FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
  verifierProfileIdHex:
    FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX,
}) satisfies FederatedPooledReserveSourceProofProfileV1Input;

describe('substrate federated pooled-reserve source proof V1', () => {
  it('reproduces the exact Rust profile, statement and nested SCALE envelopes', () => {
    const request = createRustInteropRequest();
    const fixture = createFederatedPooledReserveSourceProofV1Fixture({ request });
    const conformance = verifyFederatedPooledReserveSourceProofReferenceConformanceV1({
      request,
      sourceProofEnvelopeScaleHex: fixture.sourceProofEnvelopeScaleHex,
      currentNativeHeight: '2000',
    });

    expect(statementVector.expected.statementIdHex).toBe(
      '0xf3955d5bae27ce4eaad00d3299533e2b6a6450d9221033c439fe8444c09bbc38',
    );
    expect(statementVector.expected.reservationKeyHex).toBe(
      '0x117c1f7904522b0d05ce8603bf6637c161c192fe825687fda868bddd1774592b',
    );
    expect(FEDERATED_POOLED_RESERVE_SOURCE_PROOF_SYSTEM_ID_V1_HEX).toBe(
      '0x388fdd0319f21fe408f4b36014b357124a5c313baee25f37a6b7985bf041b723',
    );
    expect(FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX).toBe(
      '0x0be2efc7e753d2ac3d93a6c3968164568fa1053a47524b475728a56a1f4c813d',
    );
    expect(FEDERATED_POOLED_RESERVE_SOURCE_KEY_SET_DIGEST_V1_HEX).toBe(
      '0x7449f60b842b661156c4e51592d5300d3d580c910862f175151a1116820e3a02',
    );
    expect(FEDERATED_POOLED_RESERVE_SOURCE_PROOF_PROFILE_ID_V1_HEX).toBe(
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_PROFILE_ID_V1_HEX,
    );
    expect(
      buildFederatedPooledReserveSourceProofProfileV1(
        referenceSourceProofProfile,
      ).proofProfileIdHex,
    ).toBe(
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_PROFILE_ID_V1_HEX,
    );
    expect(
      encodeFederatedPooledReserveSourceProofProfileScaleV1Hex(
        referenceSourceProofProfile,
      ),
    ).toBe(
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_PROFILE_SCALE_V1_HEX,
    );
    expect(fixture.proofBytesScaleHex.length).toBe(
      2 + FEDERATED_POOLED_RESERVE_SOURCE_PROOF_INNER_SCALE_BYTES_V1 * 2,
    );
    expect(fixture.sourceProofEnvelopeScaleHex.length).toBe(
      2 + FEDERATED_POOLED_RESERVE_SOURCE_PROOF_OUTER_SCALE_BYTES_V4 * 2,
    );
    expect(
      encodeFederatedPooledReserveSourceProofEnvelopeScaleV1Hex(
        decodeFederatedPooledReserveSourceProofEnvelopeScaleV1Hex(
          fixture.proofBytesScaleHex,
        ),
      ),
    ).toBe(fixture.proofBytesScaleHex);
    expect(
      encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleHex(
        decodePooledReserveMintReservationSourceProofEnvelopeV4ScaleHex(
          fixture.sourceProofEnvelopeScaleHex,
        ),
      ),
    ).toBe(fixture.sourceProofEnvelopeScaleHex);
    expect(
      encodeFederatedPooledReserveSourceProofEnvelopeScaleForProfileV1Hex(
        referenceSourceProofProfile,
        request,
        { result: fixture.result, signatures: fixture.signatures },
      ),
    ).toBe(fixture.proofBytesScaleHex);
    expect(
      encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex(
        referenceSourceProofProfile,
        request,
        { result: fixture.result, signatures: fixture.signatures },
      ),
    ).toBe(fixture.sourceProofEnvelopeScaleHex);
    expect(conformance.runtimeProfileIdHex).toBe(
      derivePooledReserveMintReservationRuntimeProfileV4IdHex(
        request.runtimeProfile,
      ),
    );
    expect(conformance.runtimeProfileIdHex).toBe(
      '0x51bf6bb7f057e4cbd72d4b398e145efb90e2ee2e68c43b91824d718b5aadfc3e',
    );
    expect(conformance.requestDigestHex).toBe(
      '0x03f2f86a966a7d9df898f5f15bb3951863f3a7b4052b17ac62c6cfbd19f37ad5',
    );
    expect(conformance.proofResultIdHex).toBe(
      '0x47947d6c80c7da157fead8b9e1721e0f6affe5855ebdfb395a68efe9de42376a',
    );
    expect(conformance.signatureSetDigestHex).toBe(
      '0xf50d5628f905bb3d2f78c9c10ae32ab3db2869db89069f1bc10d13efcf6728d1',
    );
    expect(conformance.proofDigestHex).toBe(
      '0x583cc0bff03ca565cb9f6435ad202ce42c9e9470c1e04f5d993c1f6aa295a41f',
    );
    expect(conformance.statementIdHex).toBe(statementVector.expected.statementIdHex);
    expect(conformance.mintIdentityHex).toBe(
      statementVector.expected.reservationKeyHex,
    );
    expect(conformance.boundary).toMatchObject({
      exactRustProfileAndCodecVerified: true,
      exactThresholdSignatureSetVerified: true,
      publicReferenceSignerSetOnly: true,
      federatedSourceAttestationVerified: false,
      sourceAuthorityEstablished: false,
      runtimeActivationEligible: false,
      authorityConsumerEligible: false,
      sourceCanonicalityIndependentlyVerified: false,
      ergoPowAuthenticated: false,
      trustlessFinalityVerified: false,
      runtimeReservationWritten: false,
      mintExecuted: false,
      fundsAuthorityEstablished: false,
      gate5Closed: false,
      trustlessStatusEstablished: false,
      productionReadinessEstablished: false,
    });
    expect(Object.isFrozen(conformance)).toBe(true);
  });

  it('binds each canonical source-evidence object into the signed result', () => {
    const request = createRustInteropRequest();
    const fixture = createFederatedPooledReserveSourceProofV1Fixture({ request });
    const fields = [
      'sourceLockBoxCanonicalHex',
      'reserveTransitionTransactionCanonicalHex',
      'successorReserveBoxCanonicalHex',
      'inclusionProofCanonicalHex',
      'checkpointAncestryCanonicalHex',
      'finalityProofCanonicalHex',
      'verifierExecutableSha256Hex',
    ] as const;

    for (const field of fields) {
      const changed: FederatedPooledReserveSourceProofRequestV1 = {
        ...request,
        evidence: {
          ...request.evidence,
          [field]: mutateBytes(request.evidence[field]),
        },
      };
      expect(() =>
        verifyFederatedPooledReserveSourceProofReferenceConformanceV1({
          request: changed,
          sourceProofEnvelopeScaleHex: fixture.sourceProofEnvelopeScaleHex,
          currentNativeHeight: '2000',
        }),
      ).toThrow(/differs from the exact request/);
    }
  });

  it('rejects incomplete, duplicate, unordered, unknown and invalid signatures', () => {
    const request = createRustInteropRequest();
    const fixture = createFederatedPooledReserveSourceProofV1Fixture({ request });
    const encode = (
      signatures: readonly FederatedPooledReserveSourceProofSignatureV1[],
    ) => encodeFederatedPooledReserveSourceProofEnvelopeScaleV1Hex({
      result: fixture.result,
      signatures,
    });

    expect(() => encode(fixture.signatures.slice(0, 1))).toThrow(
      /exact threshold signature set/,
    );
    expect(() => encode([
      fixture.signatures[0]!,
      fixture.signatures[0]!,
    ])).toThrow(/not in canonical order/);
    expect(() => encode([
      fixture.signatures[1]!,
      fixture.signatures[0]!,
    ])).toThrow(/not in canonical order/);
    expect(() => encode([
      fixture.signatures[0]!,
      {
        ...fixture.signatures[1]!,
        signerPublicKeyHex: repeatHex('77', 32),
      },
    ])).toThrow(/not registered/);

    const invalidProofBytes = encode([
      fixture.signatures[0]!,
      {
        ...fixture.signatures[1]!,
        signatureHex: mutateBytes(fixture.signatures[1]!.signatureHex),
      },
    ]);
    const invalidOuter = encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleHex({
      formatVersion:
        POOLED_RESERVE_MINT_RESERVATION_SOURCE_PROOF_FORMAT_VERSION_V4,
      proofSystemIdHex:
        FEDERATED_POOLED_RESERVE_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
      proofProfileIdHex:
        FEDERATED_POOLED_RESERVE_SOURCE_PROOF_PROFILE_ID_V1_HEX,
      issuedAtNativeHeight: request.issuedAtNativeHeight,
      expiresAtNativeHeight: request.expiresAtNativeHeight,
      proofBytesHex: invalidProofBytes,
    });
    expect(() =>
      verifyFederatedPooledReserveSourceProofReferenceConformanceV1({
        request,
        sourceProofEnvelopeScaleHex: invalidOuter,
        currentNativeHeight: '2000',
      }),
    ).toThrow(/signature is invalid/);

    for (const signerIndexes of [[0, 2], [1, 2]] as const) {
      const alternate = createFederatedPooledReserveSourceProofV1Fixture({
        request,
        signerIndexes,
      });
      expect(() =>
        verifyFederatedPooledReserveSourceProofReferenceConformanceV1({
          request,
          sourceProofEnvelopeScaleHex: alternate.sourceProofEnvelopeScaleHex,
          currentNativeHeight: '2000',
        }),
      ).not.toThrow();
    }
  });

  it('rejects profile substitution, stale windows and non-canonical wire bytes', () => {
    const request = createRustInteropRequest();
    const fixture = createFederatedPooledReserveSourceProofV1Fixture({ request });
    const alteredProfile = {
      ...request.runtimeProfile,
      sourceProofSystemIdHex: repeatHex('91', 32),
    };
    expect(() =>
      createFederatedPooledReserveSourceProofV1Fixture({
        request: { ...request, runtimeProfile: alteredProfile },
      }),
    ).toThrow(/does not select the static federated/);

    for (const currentNativeHeight of ['1999', '2032']) {
      expect(() =>
        verifyFederatedPooledReserveSourceProofReferenceConformanceV1({
          request,
          sourceProofEnvelopeScaleHex: fixture.sourceProofEnvelopeScaleHex,
          currentNativeHeight,
        }),
      ).toThrow(/outside its bounded window/);
    }
    const overlong = createRustInteropRequest({
      expiresAtNativeHeight: '2065',
    });
    const overlongFixture =
      createFederatedPooledReserveSourceProofV1Fixture({ request: overlong });
    expect(() =>
      verifyFederatedPooledReserveSourceProofReferenceConformanceV1({
        request: overlong,
        sourceProofEnvelopeScaleHex: overlongFixture.sourceProofEnvelopeScaleHex,
        currentNativeHeight: '2000',
      }),
    ).toThrow(/outside its bounded window/);

    expect(() =>
      decodeFederatedPooledReserveSourceProofEnvelopeScaleV1Hex(
        `${fixture.proofBytesScaleHex}00`,
      ),
    ).toThrow(/540-byte data/);
    expect(() =>
      decodePooledReserveMintReservationSourceProofEnvelopeV4ScaleHex(
        `${fixture.sourceProofEnvelopeScaleHex}00`,
      ),
    ).toThrow(/623-byte data/);

    const outer = decodePooledReserveMintReservationSourceProofEnvelopeV4ScaleHex(
      fixture.sourceProofEnvelopeScaleHex,
    );
    for (const changed of [
      { ...outer, proofSystemIdHex: mutateBytes(outer.proofSystemIdHex) },
      { ...outer, proofProfileIdHex: mutateBytes(outer.proofProfileIdHex) },
      { ...outer, issuedAtNativeHeight: '2001' },
      { ...outer, expiresAtNativeHeight: '2031' },
    ]) {
      const changedHex =
        encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleHex(changed);
      expect(() =>
        verifyFederatedPooledReserveSourceProofReferenceConformanceV1({
          request,
          sourceProofEnvelopeScaleHex: changedHex,
          currentNativeHeight: '2000',
        }),
      ).toThrow(/outer proof does not bind the exact request/);
    }

    expect(() =>
      decodePooledReserveMintReservationSourceProofEnvelopeV4ScaleHex(
        replaceHexBytes(fixture.sourceProofEnvelopeScaleHex, 81, '7008'),
      ),
    ).toThrow(/not a two-byte encoding/);
    expect(() =>
      decodePooledReserveMintReservationSourceProofEnvelopeV4ScaleHex(
        replaceHexBytes(fixture.sourceProofEnvelopeScaleHex, 81, 'fd00'),
      ),
    ).toThrow(/not minimally encoded/);
  });

  it('binds a signed result and its SCALE envelopes to the selected profile', () => {
    const request = createRustInteropRequest();
    const fixture = createFederatedPooledReserveSourceProofV1Fixture({ request });
    const substitutedProfile = {
      federationEpoch:
        FEDERATED_POOLED_RESERVE_SOURCE_PROOF_FEDERATION_EPOCH_V1,
      threshold: FEDERATED_POOLED_RESERVE_SOURCE_PROOF_THRESHOLD_V1,
      signerPublicKeysHex:
        FEDERATED_POOLED_RESERVE_SOURCE_PROOF_REFERENCE_SIGNER_PUBLIC_KEYS_V1_HEX,
      maxValidityBlocks:
        FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1 + 1n,
      verifierProfileIdHex:
        FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX,
    };

    expect(() =>
      verifyFederatedPooledReserveSourceProofSignaturesForProfileV1(
        substitutedProfile,
        request,
        fixture.result,
        fixture.signatures,
      )).toThrow(/does not select the exact federated pooled-reserve proof profile/);
    expect(() =>
      deriveFederatedPooledReserveSourceProofResultIdForProfileV1Hex(
        substitutedProfile,
        request,
        fixture.result,
      )).toThrow(/does not select the exact federated pooled-reserve proof profile/);

    const selectedProfile =
      buildFederatedPooledReserveSourceProofProfileV1(substitutedProfile);
    const selectedRequest = {
      ...request,
      runtimeProfile: {
        ...request.runtimeProfile,
        sourceProofProfileIdHex: selectedProfile.proofProfileIdHex,
      },
    };
    const selectedResult =
      buildFederatedPooledReserveSourceProofResultFieldsForProfileV1(
        substitutedProfile,
        selectedRequest,
      );
    const selectedSignatures =
      signFederatedPooledReserveSourceProofResultForProfileV1Fixture({
        profile: substitutedProfile,
        request: selectedRequest,
        result: selectedResult,
      });
    const verified =
      verifyFederatedPooledReserveSourceProofSignaturesForProfileV1(
        substitutedProfile,
        selectedRequest,
        selectedResult,
        selectedSignatures,
      );

    expect(selectedProfile.proofProfileIdHex).not.toBe(
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_PROFILE_ID_V1_HEX,
    );
    expect(selectedResult.requestDigestHex).not.toBe(
      fixture.result.requestDigestHex,
    );
    expect(verified.resultIdHex).toBe(
      deriveFederatedPooledReserveSourceProofResultIdForProfileV1Hex(
        substitutedProfile,
        selectedRequest,
        selectedResult,
      ),
    );

    const selectedEnvelope = {
      result: selectedResult,
      signatures: selectedSignatures,
    };
    const selectedInnerScaleHex =
      encodeFederatedPooledReserveSourceProofEnvelopeScaleForProfileV1Hex(
        substitutedProfile,
        selectedRequest,
        selectedEnvelope,
      );
    const selectedOuterScaleHex =
      encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex(
        substitutedProfile,
        selectedRequest,
        selectedEnvelope,
      );
    const selectedOuterBytes = Buffer.from(
      selectedOuterScaleHex.slice(2),
      'hex',
    );
    const selectedProfileScaleHex =
      encodeFederatedPooledReserveSourceProofProfileScaleV1Hex(
        substitutedProfile,
      );
    const decodedSelectedInner =
      decodeFederatedPooledReserveSourceProofEnvelopeScaleForProfileV1Hex(
        substitutedProfile,
        selectedRequest,
        selectedInnerScaleHex,
      );
    const decodedSelectedOuter =
      decodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex(
        substitutedProfile,
        selectedRequest,
        selectedOuterScaleHex,
      );

    expect(
      decodeFederatedPooledReserveSourceProofProfileScaleV1Hex(
        selectedProfileScaleHex,
      ),
    ).toEqual({
      federationEpoch: BigInt(selectedProfile.federationEpoch),
      threshold: selectedProfile.threshold,
      signerPublicKeysHex: selectedProfile.signerPublicKeysHex,
      maxValidityBlocks: BigInt(selectedProfile.maxValidityBlocks),
      verifierProfileIdHex: selectedProfile.verifierProfileIdHex,
    });
    expect(
      encodeFederatedPooledReserveSourceProofEnvelopeScaleForProfileV1Hex(
        substitutedProfile,
        selectedRequest,
        decodedSelectedInner,
      ),
    ).toBe(selectedInnerScaleHex);
    expect(decodedSelectedInner.signatures).toEqual(selectedSignatures);
    expect(
      encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex(
        substitutedProfile,
        selectedRequest,
        decodedSelectedInner,
      ),
    ).toBe(selectedOuterScaleHex);
    expect(decodedSelectedOuter.proofSystemIdHex).toBe(
      selectedProfile.proofSystemIdHex,
    );
    expect(decodedSelectedOuter.proofProfileIdHex).toBe(
      selectedProfile.proofProfileIdHex,
    );
    expect(decodedSelectedOuter.issuedAtNativeHeight).toBe(
      BigInt(selectedRequest.issuedAtNativeHeight),
    );
    expect(decodedSelectedOuter.expiresAtNativeHeight).toBe(
      BigInt(selectedRequest.expiresAtNativeHeight),
    );
    expect(decodedSelectedOuter.proofBytesHex).toBe(selectedInnerScaleHex);
    expect(selectedInnerScaleHex.length).toBe(
      2 + FEDERATED_POOLED_RESERVE_SOURCE_PROOF_INNER_SCALE_BYTES_V1 * 2,
    );
    expect(selectedOuterScaleHex.length).toBe(
      2 + FEDERATED_POOLED_RESERVE_SOURCE_PROOF_OUTER_SCALE_BYTES_V4 * 2,
    );
    expect(selectedOuterScaleHex).not.toBe(fixture.sourceProofEnvelopeScaleHex);
    expect(selectedOuterBytes[0]).toBe(
      POOLED_RESERVE_MINT_RESERVATION_SOURCE_PROOF_FORMAT_VERSION_V4,
    );
    expect(`0x${selectedOuterBytes.subarray(1, 33).toString('hex')}`).toBe(
      selectedProfile.proofSystemIdHex,
    );
    expect(`0x${selectedOuterBytes.subarray(33, 65).toString('hex')}`).toBe(
      selectedProfile.proofProfileIdHex,
    );
    expect(`0x${selectedOuterBytes.subarray(83).toString('hex')}`).toBe(
      selectedInnerScaleHex,
    );

    expect(() =>
      encodeFederatedPooledReserveSourceProofEnvelopeScaleForProfileV1Hex(
        substitutedProfile,
        selectedRequest,
        {
          result: selectedResult,
          signatures: selectedSignatures.map((signature, index) =>
            index === 0
              ? { ...signature, signatureHex: mutateBytes(signature.signatureHex) }
              : signature),
        },
      )).toThrow(/signature is invalid/);
    expect(() =>
      encodeFederatedPooledReserveSourceProofEnvelopeScaleForProfileV1Hex(
        substitutedProfile,
        selectedRequest,
        { result: fixture.result, signatures: fixture.signatures },
      )).toThrow(/differs from the exact profile-bound request/);
    expect(() =>
      encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex(
        substitutedProfile,
        request,
        selectedEnvelope,
      )).toThrow(/does not select the exact federated pooled-reserve proof profile/);
    expect(() =>
      decodeFederatedPooledReserveSourceProofProfileScaleV1Hex(
        `${selectedProfileScaleHex}00`,
      )).toThrow(/profile SCALE is invalid/);
    expect(() =>
      decodeFederatedPooledReserveSourceProofEnvelopeScaleForProfileV1Hex(
        referenceSourceProofProfile,
        request,
        selectedInnerScaleHex,
      )).toThrow(/differs from the exact profile-bound request/);
    expect(() =>
      decodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex(
        referenceSourceProofProfile,
        request,
        selectedOuterScaleHex,
      )).toThrow(/outer proof does not bind the exact request/);
  });

  it('rejects every request-derived result field mutation before encoding', () => {
    const request = createRustInteropRequest();
    const result =
      buildFederatedPooledReserveSourceProofResultFieldsForProfileV1(
        referenceSourceProofProfile,
        request,
      );
    const fixture = createFederatedPooledReserveSourceProofV1Fixture({ request });
    const mutations = [
      ['sourceLockBoxCanonicalBlake2b256Hex',
        mutateBytes(result.sourceLockBoxCanonicalBlake2b256Hex)],
      ['reserveTransitionTransactionCanonicalBlake2b256Hex',
        mutateBytes(result.reserveTransitionTransactionCanonicalBlake2b256Hex)],
      ['successorReserveBoxCanonicalBlake2b256Hex',
        mutateBytes(result.successorReserveBoxCanonicalBlake2b256Hex)],
      ['inclusionProofBlake2b256Hex',
        mutateBytes(result.inclusionProofBlake2b256Hex)],
      ['checkpointAncestryBlake2b256Hex',
        mutateBytes(result.checkpointAncestryBlake2b256Hex)],
      ['finalityProofBlake2b256Hex',
        mutateBytes(result.finalityProofBlake2b256Hex)],
      ['verifierExecutableSha256Hex',
        mutateBytes(result.verifierExecutableSha256Hex)],
      ['issuedAtNativeHeight',
        (BigInt(result.issuedAtNativeHeight) + 1n).toString()],
      ['expiresAtNativeHeight',
        (BigInt(result.expiresAtNativeHeight) - 1n).toString()],
    ] as const;

    for (const [field, value] of mutations) {
      const mutatedResult = { ...result, [field]: value };
      expect(() =>
        deriveFederatedPooledReserveSourceProofResultIdForProfileV1Hex(
          referenceSourceProofProfile,
          request,
          mutatedResult,
        ), field).toThrow(/differs from the exact profile-bound request/);
      expect(() =>
        encodeFederatedPooledReserveSourceProofEnvelopeScaleForProfileV1Hex(
          referenceSourceProofProfile,
          request,
          { result: mutatedResult, signatures: fixture.signatures },
        ), field).toThrow(/differs from the exact profile-bound request/);
    }
  });

  it('encodes every allowed signature threshold with canonical SCALE widths', () => {
    const request = createRustInteropRequest();
    const signers = deterministicEd25519Signers(8);

    for (let threshold = 2; threshold <= 8; threshold += 1) {
      const profile = {
        federationEpoch: 100 + threshold,
        threshold,
        signerPublicKeysHex: signers.map(signer => signer.publicKeyHex),
        maxValidityBlocks:
          FEDERATED_POOLED_RESERVE_SOURCE_PROOF_MAX_VALIDITY_BLOCKS_V1,
        verifierProfileIdHex:
          FEDERATED_POOLED_RESERVE_SOURCE_PROOF_VERIFIER_PROFILE_ID_V1_HEX,
      };
      const normalizedProfile =
        buildFederatedPooledReserveSourceProofProfileV1(profile);
      const selectedRequest = {
        ...request,
        runtimeProfile: {
          ...request.runtimeProfile,
          sourceProofProfileIdHex: normalizedProfile.proofProfileIdHex,
        },
      };
      const result =
        buildFederatedPooledReserveSourceProofResultFieldsForProfileV1(
          profile,
          selectedRequest,
        );
      const resultIdHex =
        deriveFederatedPooledReserveSourceProofResultIdForProfileV1Hex(
          profile,
          selectedRequest,
          result,
        );
      const attestationDigest = Buffer.from(
        deriveFederatedPooledReserveSourceProofAttestationDigestV1Hex(
          resultIdHex,
        ).slice(2),
        'hex',
      );
      const signatures = signers.slice(0, threshold).map(signer => ({
        signerPublicKeyHex: signer.publicKeyHex,
        signatureHex: `0x${signMessage(
          null,
          attestationDigest,
          signer.privateKey,
        ).toString('hex')}`,
      }));
      const envelope = { result, signatures };
      const innerScaleHex =
        encodeFederatedPooledReserveSourceProofEnvelopeScaleForProfileV1Hex(
          profile,
          selectedRequest,
          envelope,
        );
      const outerScaleHex =
        encodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex(
          profile,
          selectedRequest,
          envelope,
        );
      const innerBytes = Buffer.from(innerScaleHex.slice(2), 'hex');
      const outerBytes = Buffer.from(outerScaleHex.slice(2), 'hex');
      const expectedInnerBytes = 347 + 1 + (threshold * 96);
      const profileScaleHex =
        encodeFederatedPooledReserveSourceProofProfileScaleV1Hex(profile);
      const decodedProfile =
        decodeFederatedPooledReserveSourceProofProfileScaleV1Hex(
          profileScaleHex,
        );
      const decodedInner =
        decodeFederatedPooledReserveSourceProofEnvelopeScaleForProfileV1Hex(
          profile,
          selectedRequest,
          innerScaleHex,
        );
      const decodedOuter =
        decodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex(
          profile,
          selectedRequest,
          outerScaleHex,
        );

      expect(innerBytes.length, `threshold ${threshold}`).toBe(
        expectedInnerBytes,
      );
      expect(innerBytes[347], `threshold ${threshold}`).toBe(threshold << 2);
      expect(outerBytes.length, `threshold ${threshold}`).toBe(
        83 + expectedInnerBytes,
      );
      expect(outerBytes.readUInt16LE(81), `threshold ${threshold}`).toBe(
        (expectedInnerBytes << 2) | 1,
      );
      expect(`0x${outerBytes.subarray(83).toString('hex')}`).toBe(
        innerScaleHex,
      );
      expect(
        encodeFederatedPooledReserveSourceProofProfileScaleV1Hex(
          decodedProfile,
        ),
        `profile threshold ${threshold}`,
      ).toBe(profileScaleHex);
      expect(
        encodeFederatedPooledReserveSourceProofEnvelopeScaleForProfileV1Hex(
          profile,
          selectedRequest,
          decodedInner,
        ),
        `inner threshold ${threshold}`,
      ).toBe(innerScaleHex);
      expect(decodedOuter.proofBytesHex, `outer threshold ${threshold}`)
        .toBe(innerScaleHex);
      expect(() =>
        decodeFederatedPooledReserveSourceProofProfileScaleV1Hex(
          `${profileScaleHex}00`,
        ),
      ).toThrow(/profile SCALE is invalid|trailing data/u);
      expect(() =>
        decodeFederatedPooledReserveSourceProofEnvelopeScaleForProfileV1Hex(
          profile,
          selectedRequest,
          `${innerScaleHex}00`,
        ),
      ).toThrow(/must contain exactly|lowercase 0x-prefixed|trailing data/u);
      expect(() =>
        decodePooledReserveMintReservationSourceProofEnvelopeV4ScaleForProfileV1Hex(
          profile,
          selectedRequest,
          `${outerScaleHex}00`,
        ),
      ).toThrow(/must contain exactly|lowercase 0x-prefixed|trailing data/u);
    }
  });
});

const TEST_ED25519_PKCS8_SEED_PREFIX = Buffer.from(
  '302e020100300506032b657004220420',
  'hex',
);

function deterministicEd25519Signers(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const privateKey = createPrivateKey({
      key: Buffer.concat([
        TEST_ED25519_PKCS8_SEED_PREFIX,
        Buffer.alloc(32, 0x51 + index),
      ]),
      format: 'der',
      type: 'pkcs8',
    });
    return {
      privateKey,
      publicKeyHex: `0x${createPublicKey(privateKey)
        .export({ format: 'der', type: 'spki' })
        .subarray(-32)
        .toString('hex')}`,
    };
  }).sort((left, right) => left.publicKeyHex.localeCompare(right.publicKeyHex));
}

function createRustInteropRequest(
  overrides: Partial<Pick<
    FederatedPooledReserveSourceProofRequestV1,
    'issuedAtNativeHeight' | 'expiresAtNativeHeight'
  >> = {},
): FederatedPooledReserveSourceProofRequestV1 {
  const statement = statementVector.statement;
  const sourceIntent = decodePegInSourceIntentV2Hex(statement.sourceIntentHex);
  const bridgeRuntimeCode = Buffer.from([0x60, 0x04, 0x60, 0x00, 0x55]);
  const tokenRuntimeCode = Buffer.from([0x60, 0x05, 0x60, 0x00, 0x55]);
  const runtimeProfile: PooledReserveMintReservationRuntimeProfileV4 = {
    formatVersion: 4,
    lineageProfileIdHex: statement.lineageProfileIdHex,
    sourceNetworkIdHex: sourceIntent.sourceNetworkIdHex,
    sidechainIdHex: sourceIntent.sidechainIdHex,
    bridgeAddressHex: sourceIntent.bridgeAddressHex,
    tokenAddressHex: sourceIntent.tokenAddressHex,
    bridgeRuntimeCodeSha256Hex: sha256Hex(bridgeRuntimeCode),
    bridgeRuntimeCodeBytes: bridgeRuntimeCode.length,
    tokenRuntimeCodeSha256Hex: sha256Hex(tokenRuntimeCode),
    tokenRuntimeCodeBytes: tokenRuntimeCode.length,
    settlementProfileIdHex: sourceIntent.settlementProfileIdHex,
    ergoDepositFinalityPolicyIdHex:
      statement.ergoDepositFinalityPolicyIdHex,
    sourceProofSystemIdHex:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_SYSTEM_ID_V1_HEX,
    sourceProofProfileIdHex:
      FEDERATED_POOLED_RESERVE_SOURCE_PROOF_PROFILE_ID_V1_HEX,
    activationHeight: '2000',
    maxPendingBlocks: 64,
  };
  return {
    runtimeProfile,
    statementHex: statementVector.expected.statementHex,
    evidence: {
      sourceLockBoxCanonicalHex: statement.sourceLockBoxIdHex,
      reserveTransitionTransactionCanonicalHex:
        statement.reserveTransitionTransactionIdHex,
      successorReserveBoxCanonicalHex: statement.successorReserveBoxIdHex,
      inclusionProofCanonicalHex: statement.inclusionHeaderIdHex,
      checkpointAncestryCanonicalHex: statement.targetHeaderIdHex,
      finalityProofCanonicalHex:
        `0x${statement.inclusionHeaderIdHex.slice(2)}${statement.targetHeaderIdHex.slice(2)}`,
      verifierExecutableSha256Hex: sha256Hex(
        Buffer.from(
          'federated-pooled-reserve-source-proof-test-fixture-v1',
          'ascii',
        ),
      ),
    },
    issuedAtNativeHeight: overrides.issuedAtNativeHeight ?? '2000',
    expiresAtNativeHeight: overrides.expiresAtNativeHeight ?? '2032',
  };
}

function sha256Hex(value: Uint8Array): string {
  return `0x${createHash('sha256').update(value).digest('hex')}`;
}

function mutateBytes(value: string): string {
  return `${value.slice(0, -2)}${value.endsWith('00') ? '01' : '00'}`;
}

function repeatHex(byte: string, count: number): string {
  return `0x${byte.repeat(count)}`;
}

function replaceHexBytes(value: string, offset: number, replacement: string): string {
  const start = 2 + offset * 2;
  return `${value.slice(0, start)}${replacement}${value.slice(start + replacement.length)}`;
}
