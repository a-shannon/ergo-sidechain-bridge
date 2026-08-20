import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCommittedVaultForCandidate: vi.fn(),
}));

vi.mock(
  './substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js',
  () => ({
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_REQUIRED_SUCCESSOR_DEPTH_V1: 10,
    assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV1:
      mocks.assertCommittedVaultForCandidate,
  }),
);

import { encodePegInSourceIntentV2Hex } from './peg-in-causal-admission-v2.js';
import {
  decodePegInPooledReserveLineageProfileV4Hex,
  derivePegInPooledReserveLineageProfileV4IdHex,
  encodePegInPooledReserveLineageProfileV4Hex,
} from './peg-in-pooled-reserve-lineage-profile-v4.js';
import {
  derivePooledReserveMintReservationRuntimeProfileV4IdHex,
} from './pooled-reserve-mint-reservation-runtime-profile-v4-codec.js';
import {
  buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX,
  type SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1,
} from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import {
  verifyFederatedPooledReserveSourceProofSignaturesForProfileV1,
  type FederatedPooledReserveSourceProofProfileV1Input,
} from './substrate-federated-pooled-reserve-source-proof-v1.js';
import {
  assertSubstrateFederatedIsolatedDevnetMintSourceProofReceiptV1Provenance,
  createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV1,
  type SubstrateFederatedIsolatedDevnetSourceAttestationSessionV1,
} from './substrate-federated-isolated-devnet-source-attestation-session-v1.js';

const h32 = (byte: string): string => `0x${byte.repeat(32)}`;
const h20 = (byte: string): string => `0x${byte.repeat(20)}`;
const ERGO_ADMISSION_PUBLIC_KEY_HEX = `02${'11'.repeat(32)}`;
const SOURCE_LOCK_ID = h32('12');
const TRANSITION_ID = h32('13');
const COMMITMENT = h32('14');
const SUCCESSOR_ID = h32('15');
const SUCCESSOR_DIGEST = `0x01${'16'.repeat(32)}`;
const INCLUSION_ID = h32('17');
const TARGET_ID = h32('18');
const SOURCE_NETWORK_ID = h32('21');
const SIDECHAIN_ID = h32('22');
const BRIDGE_ADDRESS = h20('23');
const TOKEN_ADDRESS = h20('24');
const SETTLEMENT_PROFILE_ID = h32('25');
const RECIPIENT_ADDRESS = h20('26');
const BATCH = Object.freeze({ role: 'batch' });
const TARGET = Object.freeze({ role: 'target' });
const CANDIDATE = Object.freeze({ candidateDigestHex: h32('31') });
const OBSERVATION = Object.freeze({
  confirmationHeight: 500,
  confirmationHeaderIdHex: INCLUSION_ID,
  finalityTargetHeight: 510,
  finalityTargetHeaderIdHex: TARGET_ID,
  requiredSuccessorDepth: 10,
  observationDigestHex: h32('32'),
});
const EVIDENCE = Object.freeze({
  sourceLockBoxCanonicalHex: '0x0102',
  reserveTransitionTransactionCanonicalHex: '0x0304',
  successorReserveBoxCanonicalHex: '0x0506',
  inclusionProofCanonicalHex: '0x0708',
  checkpointAncestryCanonicalHex: '0x090a',
  finalityProofCanonicalHex: '0x0b0c',
  verifierExecutableSha256Hex: `0x${'0d'.repeat(32)}`,
});
const LINEAGE_BY_DRAFT = new WeakMap<object, string>();

let activePacket: object | undefined;

beforeEach(() => {
  activePacket = undefined;
  vi.clearAllMocks();
  mocks.assertCommittedVaultForCandidate.mockImplementation(
    (observation, batch, candidate, target) => {
      if (
        activePacket === undefined
        || observation !== OBSERVATION
        || batch !== BATCH
        || candidate !== CANDIDATE
        || target !== TARGET
      ) {
        throw new Error('committed-vault candidate provenance missing');
      }
      return activePacket;
    },
  );
});

describe('isolated-devnet synthetic FED-1 mint source-proof production', () => {
  it('joins a real same-process draft, exact lineage, profile, and one-shot signatures', () => {
    const session = sessionV1();
    const draft = draftV1(session);
    const input = proofInput(draft);

    const receipt = session.produceMintSourceProof(input);
    const outerBytes = Buffer.from(
      receipt.sourceProofEnvelopeScaleHex.slice(2),
      'hex',
    );

    expect(receipt).toMatchObject({
      status: 'synthetic_federated_source_proof_produced',
      sourceAttestationBindingDigestHex: session.binding.bindingDigestHex,
      mintReservationDraftDigestHex: draft.draftDigestHex,
      mintReservationStatementIdHex: draft.statementIdHex,
      mintIdentityHex: draft.reservationKeyHex,
      encodedLineageProfileHex: lineageHex(draft),
      runtimeProfileIdHex:
        derivePooledReserveMintReservationRuntimeProfileV4IdHex(
          receipt.request.runtimeProfile,
        ),
      sourceProofProfileIdHex:
        session.binding.federatedMintProfile.proofProfileIdHex,
      checks: {
        exactSameProcessDraftBound: true,
        exactLineageProfileIdBound: true,
        runtimeProfileDerivedFromExactLineage: true,
        callerSuppliedRuntimeProfileAccepted: false,
        exactSelectedProfileBound: true,
        exactRequestResultBound: true,
        exactThresholdSignatureSetVerified: true,
        boundedValidityWindowVerified: true,
        oneShotCapabilityConsumed: true,
      },
      boundary: {
        processOwnedSyntheticCustodyOnly: true,
        evidenceBytesCallerSupplied: true,
        sourceEvidenceCollectionProvenanceEstablished: false,
        sourceCanonicalityIndependentlyVerified: false,
        independentAttestorCustodyEstablished: false,
        runtimeProviderCompiled: false,
        runtimeProfileActivated: false,
        runtimeReservationWritten: false,
        mintExecuted: false,
        ergoTransactionSigningAuthorized: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(receipt.request.statementHex).toBe(draft.statementHex);
    expect(receipt.result.requestDigestHex).toBe(receipt.requestDigestHex);
    expect(receipt.signatureVerification.signatures).toHaveLength(2);
    expect(receipt.signatureVerification.signatures.map(value =>
      value.signerPublicKeyHex
    )).toEqual(
      session.binding.federatedMintProfile.signerPublicKeysHex.slice(0, 2),
    );
    expect(receipt.runtimeProfileScaleHex).toHaveLength(2 + 349 * 2);
    expect(receipt.sourceProofEnvelopeScaleHex).toHaveLength(2 + 623 * 2);
    expect(`0x${outerBytes.subarray(1, 33).toString('hex')}`).toBe(
      session.binding.federatedMintProfile.proofSystemIdHex,
    );
    expect(`0x${outerBytes.subarray(33, 65).toString('hex')}`).toBe(
      session.binding.federatedMintProfile.proofProfileIdHex,
    );
    expect(`0x${outerBytes.subarray(83).toString('hex')}`).toBe(
      receipt.proofBytesScaleHex,
    );
    expect(receipt).not.toHaveProperty('privateKey');
    expect(session).not.toHaveProperty('signMintResult');
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetMintSourceProofReceiptV1Provenance(
        receipt,
      )
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetMintSourceProofReceiptV1Provenance(
        structuredClone(receipt),
      )
    ).toThrow(/lacks process provenance/);
    expect(() => session.produceMintSourceProof(input))
      .toThrow(/already consumed/);

    session.dispose();
  });

  it('rejects copied drafts, cross-session profiles, and invalid windows before signing', () => {
    const draftSession = sessionV1();
    const draft = draftV1(draftSession);
    const foreignDraftSession = sessionV1();
    expect(() => foreignDraftSession.produceMintSourceProof({
      ...proofInput(draft),
      draft: structuredClone(draft),
    })).toThrow(/same-process provenance/);
    foreignDraftSession.dispose();

    const wrongProfileSession = sessionV1();
    expect(() => wrongProfileSession.produceMintSourceProof(
      proofInput(draft),
    )).toThrow(/does not select the exact federated pooled-reserve proof profile/);
    wrongProfileSession.dispose();

    for (const [issuedAtNativeHeight, expiresAtNativeHeight] of [
      ['1899', '1901'],
      ['2000', '2000'],
      ['2000', '2065'],
    ] as const) {
      const windowSession = sessionV1();
      const windowDraft = draftV1(windowSession);
      expect(() => windowSession.produceMintSourceProof({
        ...proofInput(windowDraft),
        issuedAtNativeHeight,
        expiresAtNativeHeight,
      })).toThrow(/outside the selected profile bounds/);
      windowSession.dispose();
    }

    const unsafeNumberSession = sessionV1();
    const unsafeNumberDraft = draftV1(unsafeNumberSession);
    expect(() => unsafeNumberSession.produceMintSourceProof({
      ...proofInput(unsafeNumberDraft),
      issuedAtNativeHeight: Number.MAX_SAFE_INTEGER + 1,
    })).toThrow(/must be a uint64/);
    unsafeNumberSession.dispose();
    draftSession.dispose();
  });

  it('rejects a lineage substitution before signing', () => {
    const session = sessionV1();
    const draft = draftV1(session);
    const input = proofInput(draft);
    const bytes = Buffer.from(
      input.runtimeProfileDerivation.encodedLineageProfileHex.slice(2),
      'hex',
    );
    bytes[10] ^= 0x01;

    expect(() => session.produceMintSourceProof({
      ...input,
      runtimeProfileDerivation: {
        ...input.runtimeProfileDerivation,
        encodedLineageProfileHex: `0x${bytes.toString('hex')}`,
      },
    })).toThrow(/lineage identity is inconsistent/);

    session.dispose();
  });

  it('makes every signed result fail against mutated request evidence', () => {
    const session = sessionV1();
    const draft = draftV1(session);
    const receipt = session.produceMintSourceProof(proofInput(draft));
    const mutatedRequest = {
      ...receipt.request,
      evidence: {
        ...receipt.request.evidence,
        sourceLockBoxCanonicalHex: '0xffff',
      },
    };

    expect(() =>
      verifyFederatedPooledReserveSourceProofSignaturesForProfileV1(
        profileInput(session),
        mutatedRequest,
        receipt.result,
        receipt.signatureVerification.signatures,
      )
    ).toThrow(/differs from the exact profile-bound request/);

    session.dispose();
  });

  it('loses the mint proof capability on disposal', () => {
    const session = sessionV1();
    const draft = draftV1(session);
    session.dispose();

    expect(() => session.produceMintSourceProof(proofInput(draft)))
      .toThrow(/disposed/);
  });
});

function sessionV1() {
  return createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV1({
    ergoAdmissionThreshold: 1,
    ergoAdmissionPublicKeysHex: [ERGO_ADMISSION_PUBLIC_KEY_HEX],
  });
}

function draftV1(
  session: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV1>,
): Readonly<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1> {
  const encodedLineageProfileHex =
    encodePegInPooledReserveLineageProfileV4Hex({
      formatVersion: 4,
      sourceNetworkIdHex: SOURCE_NETWORK_ID,
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddressHex: BRIDGE_ADDRESS,
      tokenAddressHex: TOKEN_ADDRESS,
      settlementAssetIdHex: h32('00'),
      settlementProfileIdHex: SETTLEMENT_PROFILE_ID,
      trackerGenesisInputBoxIdHex: h32('41'),
      duplicatePreventionGenesisInputBoxIdHex: h32('42'),
      settlementVaultGenesisInputBoxIdHex: h32('43'),
      sourceLockTemplateSha256Hex: h32('44'),
      validityTrackerTemplateSha256Hex: h32('45'),
      settlementVaultTemplateSha256Hex: h32('46'),
      duplicatePreventionTemplateSha256Hex: h32('47'),
      sidechainFinalityPolicyIdHex: h32('48'),
      ergoDepositFinalityPolicyIdHex:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX,
      proofSystemIdHex:
        session.binding.federatedMintProfile.proofSystemIdHex,
      proofProfileIdHex:
        session.binding.federatedMintProfile.proofProfileIdHex,
      sourceCommitmentPolicyIdHex: h32('49'),
      depositCommitmentStatePolicyIdHex: h32('4a'),
      profileRevision: 1,
      activationHeight: 1900,
    });
  const familyIdHex = derivePegInPooledReserveLineageProfileV4IdHex(
    decodePegInPooledReserveLineageProfileV4Hex(encodedLineageProfileHex),
  );
  const sourceIntentHex = encodePegInSourceIntentV2Hex({
    formatVersion: 2,
    sourceNetworkIdHex: SOURCE_NETWORK_ID,
    sidechainIdHex: SIDECHAIN_ID,
    bridgeAddressHex: BRIDGE_ADDRESS,
    tokenAddressHex: TOKEN_ADDRESS,
    settlementProfileIdHex: SETTLEMENT_PROFILE_ID,
    admissionProfileIdHex: familyIdHex,
    sourceAssetIdHex: h32('00'),
    amountNanoErg: '10000000',
    recipientAddressHex: RECIPIENT_ADDRESS,
  });
  activePacket = Object.freeze({
    familyIdHex,
    familyCompiler: Object.freeze({ bindingDigestHex: h32('33') }),
    sourceIntentHex,
    depositCommitmentHex: COMMITMENT,
    reserve: Object.freeze({
      outputDigestHex: SUCCESSOR_DIGEST,
      outputLiabilityNanoErg: '10000000',
    }),
    transactions: Object.freeze({
      reserveTransition: Object.freeze({ txId: TRANSITION_ID }),
    }),
    boxes: Object.freeze({
      sourceLock: Object.freeze({ boxId: SOURCE_LOCK_ID }),
      reserveSuccessor: Object.freeze({ boxId: SUCCESSOR_ID }),
    }),
  });
  const draft =
    buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
      batch: BATCH as never,
      target: TARGET as never,
      candidate: CANDIDATE as never,
      committedVaultObservation: OBSERVATION as never,
    });
  LINEAGE_BY_DRAFT.set(draft, encodedLineageProfileHex);
  return draft;
}

function proofInput(
  draft: Readonly<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1>,
) {
  return {
    draft,
    runtimeProfileDerivation: {
      encodedLineageProfileHex: lineageHex(draft),
      bridgeRuntimeCodeSha256Hex: h32('51'),
      bridgeRuntimeCodeBytes: 1,
      tokenRuntimeCodeSha256Hex: h32('52'),
      tokenRuntimeCodeBytes: 1,
      maxPendingBlocks: 64,
    },
    evidence: EVIDENCE,
    issuedAtNativeHeight: '2000',
    expiresAtNativeHeight: '2064',
  } as const;
}

function lineageHex(
  draft: Readonly<SubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1>,
): string {
  const value = LINEAGE_BY_DRAFT.get(draft);
  if (value === undefined) throw new Error('test lineage provenance missing');
  return value;
}

function profileInput(
  session: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV1>,
): Readonly<FederatedPooledReserveSourceProofProfileV1Input> {
  const profile = session.binding.federatedMintProfile;
  return Object.freeze({
    federationEpoch: profile.federationEpoch,
    threshold: profile.threshold,
    signerPublicKeysHex: profile.signerPublicKeysHex,
    maxValidityBlocks: profile.maxValidityBlocks,
    verifierProfileIdHex: profile.verifierProfileIdHex,
  });
}
