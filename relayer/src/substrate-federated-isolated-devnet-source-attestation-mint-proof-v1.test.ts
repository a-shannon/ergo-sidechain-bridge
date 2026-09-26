import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCommittedVaultForCandidate: vi.fn(),
  consumeCommittedReserveEvidenceForDraft: vi.fn(),
  failNextSignature: false,
  failNextVerification: false,
  launchStatements: new WeakSet<object>(),
  nativeDraftInputs: new WeakMap<object, Readonly<Record<string, object>>>(),
  nativeContexts: new WeakMap<object, Readonly<{ target: object; context: object }>>(),
  nativeRetainedTargets: new WeakMap<object, object>(),
  nativePacketProvenance: new WeakMap<object, Readonly<{
    batch: object;
    target: object;
    originalSetupTarget: object;
    previousPacket: object | null;
  }>>(),
  nativeTargets: new WeakMap<object, object>(),
  nativeSourceContexts: new WeakMap<object, Readonly<{
    candidate: Readonly<Record<string, unknown>>;
    application: Readonly<Record<string, unknown>>;
  }>>(),
  nativeEvidence: new WeakMap<object, Readonly<{ draft: object; evidence: object }>>(),
  consumedNativeEvidence: new WeakSet<object>(),
}));

vi.mock('node:crypto', async importOriginal => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    sign: vi.fn((...args: unknown[]) => {
      if (mocks.failNextSignature) {
        mocks.failNextSignature = false;
        throw new Error('injected source-attestation signature failure');
      }
      return (actual.sign as (...values: unknown[]) => Buffer)(...args);
    }),
    verify: vi.fn((...args: unknown[]) => {
      if (mocks.failNextVerification) {
        mocks.failNextVerification = false;
        return false;
      }
      return (actual.verify as (...values: unknown[]) => boolean)(...args);
    }),
  };
});

vi.mock(
  './substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js')
    >();
    return {
      ...actual,
      consumeSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceForDraftV1:
        mocks.consumeCommittedReserveEvidenceForDraft,
      consumeSubstrateFederatedNativeGenesisCommittedReserveEvidenceForDraftV1:
        vi.fn((receipt: object, draft: object) => {
          const retained = mocks.nativeEvidence.get(receipt);
          if (retained === undefined || retained.draft !== draft) {
            throw new Error('native committed-reserve evidence provenance missing');
          }
          if (mocks.consumedNativeEvidence.has(receipt)) {
            throw new Error('native committed-reserve evidence is already consumed');
          }
          mocks.consumedNativeEvidence.add(receipt);
          return retained.evidence;
        }),
    };
  },
);

vi.mock(
  './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js')
    >();
    return {
      ...actual,
      // Operation-lifetime tests double only the native same-process custody
      // boundary; the statement and all downstream codecs remain real.
      assertSubstrateFederatedNativeGenesisPegInMintReservationDraftV1:
        vi.fn((draft: object, input: Readonly<Record<string, object>>) => {
          const retained = mocks.nativeDraftInputs.get(draft);
          const fields = ['batch', 'target', 'packet', 'committedVaultObservation'];
          if (retained === undefined || Reflect.ownKeys(input).length !== fields.length
            || fields.some(field => input[field] !== retained[field])) {
            throw new Error('native mint-reservation draft lacks boundary provenance');
          }
        }),
    };
  },
);

vi.mock(
  './substrate-federated-isolated-devnet-setup-check-execution-v2.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-isolated-devnet-setup-check-execution-v2.js')
    >();
    return {
      ...actual,
      // The real setup execution composes this context in its own suite. Here
      // only the exact batch/target ownership boundary is doubled.
      getSubstrateFederatedNativeGenesisAttestationContextV1:
        vi.fn((batch: object, target: object) => {
          const retained = mocks.nativeContexts.get(batch);
          if (retained === undefined || retained.target !== target) {
            throw new Error('native attestation context lacks boundary provenance');
          }
          return retained.context;
        }),
      getSubstrateFederatedNativeGenesisRetainedAttestationContextV1:
        vi.fn((batch: object, target: object) => {
          const retained = mocks.nativeContexts.get(batch);
          if (retained === undefined || mocks.nativeRetainedTargets.get(batch) !== target) {
            throw new Error('native retained attestation context lacks boundary provenance');
          }
          return retained.context;
        }),
    };
  },
);

vi.mock(
  './substrate-federated-isolated-devnet-peg-in-candidate-v2.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-isolated-devnet-peg-in-candidate-v2.js')
    >();
    return {
      ...actual,
      getSubstrateFederatedNativeGenesisPegInAttestationProvenanceV1:
        vi.fn((packet: object, batch: object, target: object) => {
          const retained = mocks.nativePacketProvenance.get(packet);
          if (retained === undefined || retained.batch !== batch || retained.target !== target) {
            throw new Error('native FED peg-in packet lacks exact process provenance');
          }
          return Object.freeze({ originalSetupTarget: retained.originalSetupTarget,
            previousPacket: retained.previousPacket });
        }),
      assertSubstrateFederatedNativeGenesisPegInReadCustodyV1:
        vi.fn((packet: object, batch: object, target: object) => {
          const retained = mocks.nativePacketProvenance.get(packet);
          if (retained === undefined || retained.batch !== batch
            || retained.originalSetupTarget !== target || retained.previousPacket !== null) {
            throw new Error('native FED peg-in packet lacks exact retained read custody');
          }
          return packet;
        }),
    };
  },
);

vi.mock(
  './substrate-federated-isolated-devnet-launch-v1.js',
  async importOriginal => {
    const actual: typeof import('./substrate-federated-isolated-devnet-launch-v1.js') = await importOriginal<
      typeof import('./substrate-federated-isolated-devnet-launch-v1.js')
    >();
    return {
      ...actual,
      assertSubstrateFederatedIsolatedDevnetLaunchStatementV1Provenance:
        vi.fn((value: unknown) => {
          if (
            value === null
            || typeof value !== 'object'
            || !mocks.launchStatements.has(value)
          ) {
            throw new Error('launch statement lacks process provenance');
          }
        }),
      assertSubstrateFederatedIsolatedDevnetLaunchStatementProvenance:
        vi.fn((value: unknown) => {
          if (value === null || typeof value !== 'object'
            || !mocks.launchStatements.has(value)) {
            actual.assertSubstrateFederatedIsolatedDevnetLaunchStatementProvenance(value);
          }
        }),
    };
  },
);

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
  encodePooledReserveMintReservationRuntimeProfileV4ScaleHex,
} from './pooled-reserve-mint-reservation-runtime-profile-v4-codec.js';
import {
  buildSubstrateFederatedCheckpointProfileV1,
} from './profiles/substrate-federated-v1/checkpoint-statement.js';
import {
  buildSubstrateFederatedSettlementFamilyV1CompilerFixtureInput,
} from './substrate-federated-settlement-family-v1-fixture.js';
import {
  buildSubstrateFederatedSettlementFamilyV1CompilerRequest,
} from './substrate-federated-settlement-family-v1.js';
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
  assertSubstrateFederatedIsolatedDevnetCheckpointAttestationReceiptV1Provenance,
  assertSubstrateFederatedIsolatedDevnetMintSourceProofReceiptV1Provenance,
  assertSubstrateFederatedNativeGenesisCheckpointAttestationForOperationV1,
  assertSubstrateFederatedNativeGenesisContinuationMintSourceProofPairV1,
  assertSubstrateFederatedNativeGenesisMintSourceProofReceiptForOperationV1,
  assertSubstrateFederatedNativeGenesisSourceAttestationOperationV1,
  createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV1,
  createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2,
  createSubstrateFederatedNativeGenesisSourceAttestationOperationV1,
  produceSubstrateFederatedNativeGenesisCheckpointAttestationForOperationV1,
  readSubstrateFederatedGenesisProfilesFromSessionV2,
  produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1,
  produceSubstrateFederatedNativeGenesisMintSourceProofV1,
  type SubstrateFederatedIsolatedDevnetSourceAttestationSessionV1,
  type SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2,
} from './substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import {
  deriveSubstrateFederatedIsolatedDevnetLaunchAttestationDigestV1,
} from './substrate-federated-isolated-devnet-launch-v1.js';

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
const COMMITTED_RESERVE_EVIDENCE_RECEIPT = Object.freeze({
  receiptDigestHex: h32('0e'),
});
const LINEAGE_BY_DRAFT = new WeakMap<object, string>();

let activePacket: object | undefined;
let activeCommittedReserveDraft: object | undefined;

beforeEach(() => {
  activePacket = undefined;
  activeCommittedReserveDraft = undefined;
  mocks.failNextSignature = false;
  mocks.failNextVerification = false;
  mocks.launchStatements = new WeakSet<object>();
  mocks.nativeDraftInputs = new WeakMap<object, Readonly<Record<string, object>>>();
  mocks.nativeContexts = new WeakMap<object, Readonly<{ target: object; context: object }>>();
  mocks.nativeTargets = new WeakMap<object, object>();
  mocks.nativeSourceContexts = new WeakMap<object, Readonly<{
    candidate: Readonly<Record<string, unknown>>;
    application: Readonly<Record<string, unknown>>;
  }>>();
  mocks.nativeEvidence = new WeakMap<object, Readonly<{ draft: object; evidence: object }>>();
  mocks.consumedNativeEvidence = new WeakSet<object>();
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
  mocks.consumeCommittedReserveEvidenceForDraft.mockImplementation(
    (receipt, draft) => {
      if (
        receipt !== COMMITTED_RESERVE_EVIDENCE_RECEIPT
        || draft !== activeCommittedReserveDraft
      ) {
        throw new Error('committed-reserve evidence provenance missing');
      }
      return EVIDENCE;
    },
  );
});

describe('isolated-devnet synthetic FED-1 mint source-proof production', () => {
  it('rejects genesis profile reuse after the session has signed a launch', () => {
    const session = sessionV2();
    try {
      expect(() => readSubstrateFederatedGenesisProfilesFromSessionV2(session)).not.toThrow();
      signLaunch(session);
      expect(() => readSubstrateFederatedGenesisProfilesFromSessionV2(session)).toThrow(/already bound to a launch/);
    } finally {
      session.dispose();
    }
  });

  it('joins a real same-process draft, exact lineage, profile, and one-shot signatures', () => {
    const session = sessionV1();
    signLaunch(session);
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
    signLaunch(foreignDraftSession);
    expect(() => foreignDraftSession.produceMintSourceProof({
      ...proofInput(draft),
      draft: structuredClone(draft),
    })).toThrow(/same-process provenance/);
    foreignDraftSession.dispose();

    const wrongProfileSession = sessionV1();
    signLaunch(wrongProfileSession);
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
      signLaunch(windowSession);
      const windowDraft = draftV1(windowSession);
      expect(() => windowSession.produceMintSourceProof({
        ...proofInput(windowDraft),
        issuedAtNativeHeight,
        expiresAtNativeHeight,
      })).toThrow(/outside the selected profile bounds/);
      windowSession.dispose();
    }

    const unsafeNumberSession = sessionV1();
    signLaunch(unsafeNumberSession);
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
    signLaunch(session);
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
    signLaunch(session);
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

  it('rejects mint source-proof production before launch attestation', () => {
    const session = sessionV2();

    expect(() => session.produceSettlementFamilyMintSourceProof({} as never)).toThrow(
      /requires one completed launch attestation/u,
    );
    expect(() => session.produceCheckpointAttestation(checkpointInput())).toThrow(
      /requires one completed launch attestation/u,
    );
    session.dispose();
  });

  it('signs one exact profile-bound checkpoint without claiming source consensus', () => {
    const session = sessionV2();
    signLaunch(session);

    const receipt = session.produceCheckpointAttestation(checkpointInput());

    expect(receipt).toMatchObject({
      status: 'synthetic_federated_checkpoint_attested',
      sourceAttestationBindingDigestHex: session.binding.bindingDigestHex,
      targetDescriptorDigestHex: h32('60'),
      checkpointStatement: {
        sourceNetworkIdHex: SOURCE_NETWORK_ID.slice(2),
        sidechainIdHex: SIDECHAIN_ID.slice(2),
        sourceNativeBlockHeight: '7',
        sourceNativeBlockHashHex: '61'.repeat(32),
        executionBlockHashHex: '62'.repeat(32),
        bridgeEventRootHex: '63'.repeat(32),
        burnLeafCount: 1,
        bridgeAddressHex: BRIDGE_ADDRESS.slice(2),
        tokenAddressHex: TOKEN_ADDRESS.slice(2),
        settlementProfileIdHex: SETTLEMENT_PROFILE_ID.slice(2),
      },
      checks: {
        exactLaunchTargetObjectBound: true,
        exactCheckpointProfileRebuilt: true,
        exactApplicationAndProfileIdentityBound: true,
        exactDynamicCheckpointFieldsBound: true,
        exactThresholdSignatureSetVerified: true,
        boundedAdmissionHorizonVerified: true,
        oneShotCapabilityConsumed: true,
      },
      boundary: {
        processOwnedSyntheticCustodyOnly: true,
        thresholdSourceAttestationVerified: true,
        independentAttestorCustodyEstablished: false,
        sourceConsensusIndependentlyVerified: false,
        deterministicSourceFinalityEstablished: false,
        mintBeforeCheckpointLifecycleEstablished: false,
        trackerAdmissionEstablished: false,
        payoutAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(receipt.signatures).toHaveLength(2);
    expect(receipt.signatures.map(value => value.signerPublicKeyHex)).toEqual(
      session.binding.sourceAttestationPublicKeysHex.slice(0, 2),
    );
    expect(receipt.checkpointStatement.encodedStatementHex).toHaveLength(1024);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetCheckpointAttestationReceiptV1Provenance(
        receipt,
      )
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetCheckpointAttestationReceiptV1Provenance(
        structuredClone(receipt),
      )
    ).toThrow(/lacks process provenance/u);
    expect(() => session.produceCheckpointAttestation(checkpointInput()))
      .toThrow(/already consumed/u);

    session.dispose();
  });

  it('retains the exact launched profile and keys from mint proof through checkpoint', () => {
    const session = sessionV2();
    const target = signLaunch(session);
    const draft = draftV2(target);
    activeCommittedReserveDraft = draft;

    const mintReceipt = session.produceSettlementFamilyMintSourceProof({
      draft,
      evidenceReceipt: COMMITTED_RESERVE_EVIDENCE_RECEIPT as never,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });
    const checkpointReceipt =
      session.produceCheckpointAttestation(checkpointInput());

    expect(mintReceipt.targetDescriptorDigestHex).toBe(
      target.descriptorDigestHex,
    );
    expect(checkpointReceipt.targetDescriptorDigestHex).toBe(
      target.descriptorDigestHex,
    );
    expect(checkpointReceipt.checkpointStatement.federationProfileIdHex).toBe(
      session.binding.checkpointFederationProfileIdHex,
    );
    expect(checkpointReceipt.signatures.map(value => value.signerPublicKeyHex))
      .toEqual(mintReceipt.signatureVerification.signatures.map(value =>
        value.signerPublicKeyHex.slice(2)
      ));

    session.dispose();
  });

  it('rejects native proof signing once the same session attests a LAB launch', () => {
    const session = sessionV2();
    signLaunch(session);
    expect(() => produceSubstrateFederatedNativeGenesisMintSourceProofV1(session, {} as never)).toThrow(/LAB launch/);
    session.dispose();
  });

  it('scopes explicit native operations without reopening legacy or LAB authority', () => {
    const session = sessionV2();
    const first =
      createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session);
    try {
      expect(Object.keys(first)).toEqual(['dispose']);
      expect(Object.isFrozen(first)).toBe(true);
      expect(() =>
        createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session)
      ).toThrow(/already active/u);
      expect(() => session.signLaunchStatement({} as never))
        .toThrow(/already signed/u);
      expect(() => produceSubstrateFederatedNativeGenesisMintSourceProofV1(
        session,
        {} as never,
      )).toThrow(/bound to explicit operations/u);
      expect(() =>
        produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
          { ...first },
          {} as never,
        )
      ).toThrow(/lacks exact provenance/u);
    } finally {
      first.dispose();
    }

    const second =
      createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session);
    second.dispose();
    expect(() =>
      produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
        second,
        {} as never,
      )
    ).toThrow(/disposed/u);
    session.dispose();
  });

  it('asserts exact operation-parent provenance and current lifetime', () => {
    const session = sessionV2();
    const foreignSession = sessionV2();
    const operation =
      createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session);
    try {
      expect(() => assertSubstrateFederatedNativeGenesisSourceAttestationOperationV1(
        operation,
        session,
      )).not.toThrow();
      expect(() => assertSubstrateFederatedNativeGenesisSourceAttestationOperationV1(
        { ...operation },
        session,
      )).toThrow(/lacks exact provenance/u);
      expect(() => assertSubstrateFederatedNativeGenesisSourceAttestationOperationV1(
        operation,
        foreignSession,
      )).toThrow(/different parent session/u);
      operation.dispose();
      expect(() => assertSubstrateFederatedNativeGenesisSourceAttestationOperationV1(
        operation,
        session,
      )).toThrow(/operation is disposed/u);
    } finally {
      foreignSession.dispose();
      session.dispose();
    }
  });

  it('does not consume legacy authority or block LAB after malformed native input', () => {
    const session = sessionV2();
    try {
      expect(() => produceSubstrateFederatedNativeGenesisMintSourceProofV1(
        session,
        {} as never,
      )).toThrow(/input/u);
      expect(() => signLaunch(session)).not.toThrow();
      expect(() =>
        createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session)
      ).toThrow(/LAB launch/u);
    } finally {
      session.dispose();
    }
  });

  it('invalidates explicit operations when the parent custody is disposed', () => {
    const session = sessionV2();
    const operation =
      createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session);
    session.dispose();
    expect(() =>
      produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
        operation,
        {} as never,
      )
    ).toThrow(/session is disposed/u);
  });

  it('completes two sequential native operations while retaining the first receipts', () => {
    const session = sessionV2();
    try {
      const first = completeNativeOperation(session, 1);
      expect(() => assertSubstrateFederatedNativeGenesisMintSourceProofReceiptForOperationV1(
        first.proof,
        first.operation,
        first.fixture.draft as never,
      )).not.toThrow();
      expect(() => assertSubstrateFederatedNativeGenesisCheckpointAttestationForOperationV1(
        first.checkpoint,
        first.operation,
        first.proof,
      )).not.toThrow();
      expect(() => produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
        first.operation,
        first.fixture.input as never,
      )).toThrow(/already consumed/u);
      expect(() => produceSubstrateFederatedNativeGenesisCheckpointAttestationForOperationV1(
        first.operation,
        nativeCheckpointInput(first.proof, 1) as never,
      )).toThrow(/already consumed/u);

      const secondFixture = nativeOperationInput(session, 2);
      const secondOperation =
        createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session);
      expect(() => assertSubstrateFederatedNativeGenesisCheckpointAttestationForOperationV1(
        first.checkpoint,
        first.operation,
        first.proof,
      )).not.toThrow();
      const secondProof = produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
        secondOperation,
        secondFixture.input as never,
      );
      const secondCheckpoint =
        produceSubstrateFederatedNativeGenesisCheckpointAttestationForOperationV1(
          secondOperation,
          nativeCheckpointInput(secondProof, 2) as never,
        );
      const second = Object.freeze({
        fixture: secondFixture,
        operation: secondOperation,
        proof: secondProof,
        checkpoint: secondCheckpoint,
      });
      expect(second.proof.receiptDigestHex).not.toBe(first.proof.receiptDigestHex);
      expect(second.proof.mintIdentityHex).not.toBe(first.proof.mintIdentityHex);
      expect(second.checkpoint.receiptDigestHex).not.toBe(first.checkpoint.receiptDigestHex);
      expect(second.proof.sourceProofProfileIdHex).toBe(first.proof.sourceProofProfileIdHex);
      expect(second.proof.signatureVerification.signatures.map(value => value.signerPublicKeyHex))
        .toEqual(first.proof.signatureVerification.signatures.map(value => value.signerPublicKeyHex));
      expect(() => assertSubstrateFederatedNativeGenesisMintSourceProofReceiptForOperationV1(
        first.proof,
        first.operation,
        first.fixture.draft as never,
      )).not.toThrow();
      expect(() => assertSubstrateFederatedNativeGenesisCheckpointAttestationForOperationV1(
        first.checkpoint,
        first.operation,
        first.proof,
      )).not.toThrow();
      expect(() => assertSubstrateFederatedNativeGenesisMintSourceProofReceiptForOperationV1(
        first.proof,
        first.operation,
        second.fixture.draft as never,
      )).toThrow(/operation\/draft provenance/u);
      expect(() => assertSubstrateFederatedNativeGenesisCheckpointAttestationForOperationV1(
        first.checkpoint,
        first.operation,
        second.proof,
      )).toThrow(/operation provenance/u);
      second.operation.dispose();
      first.operation.dispose();
    } finally {
      session.dispose();
    }
  });

  it('pairs one live continuation proof with the exact completed original checkpoint and packet', () => {
    const session = sessionV2();
    try {
      const first = completeNativeOperation(session, 30);
      const currentFixture = nativeContinuationOperationInput(session, 31, first.fixture);
      const currentOperation =
        createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session);
      const currentProof = produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
        currentOperation,
        currentFixture.input as never,
      );
      const paired = assertSubstrateFederatedNativeGenesisContinuationMintSourceProofPairV1(
        currentProof,
        currentOperation,
        currentFixture.draft as never,
        first.checkpoint,
        first.operation,
        first.proof,
      );
      expect(paired.currentTarget).toBe(currentFixture.input.draftInputs.target);
      expect(paired.originalSetupTarget).toBe(first.fixture.input.draftInputs.target);
      expect(paired.candidate).toBe(mocks.nativeSourceContexts.get(session)!.candidate);
      expect(paired.application).toBe(mocks.nativeSourceContexts.get(session)!.application);
      expect(() => produceSubstrateFederatedNativeGenesisCheckpointAttestationForOperationV1(
        currentOperation,
        nativeCheckpointInput(currentProof, 31) as never,
      )).not.toThrow();
      currentOperation.dispose();
      first.operation.dispose();
    } finally {
      session.dispose();
    }
  });

  it.each([
    ['copied proof', 'proof'],
    ['foreign operation', 'operation'],
    ['foreign draft', 'draft'],
    ['copied checkpoint', 'checkpoint'],
  ] as const)('rejects a %s without weakening the paired continuation', (_label, fault) => {
    const session = sessionV2();
    try {
      const first = completeNativeOperation(session, 32);
      const currentFixture = nativeContinuationOperationInput(session, 33, first.fixture);
      const currentOperation =
        createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session);
      const currentProof = produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
        currentOperation,
        currentFixture.input as never,
      );
      expect(() => assertSubstrateFederatedNativeGenesisContinuationMintSourceProofPairV1(
        fault === 'proof' ? { ...currentProof } : currentProof,
        fault === 'operation' ? first.operation : currentOperation,
        fault === 'draft' ? first.fixture.draft as never : currentFixture.draft as never,
        fault === 'checkpoint' ? { ...first.checkpoint } : first.checkpoint,
        first.operation,
        first.proof,
      )).toThrow(/operation\/draft provenance|completed original checkpoint/u);
      expect(() => assertSubstrateFederatedNativeGenesisContinuationMintSourceProofPairV1(
        currentProof,
        currentOperation,
        currentFixture.draft as never,
        first.checkpoint,
        first.operation,
        first.proof,
      )).not.toThrow();
      currentOperation.dispose();
      first.operation.dispose();
    } finally {
      session.dispose();
    }
  });

  it('rejects wrong original and previous-packet ancestry without consuming a fresh operation', () => {
    const session = sessionV2();
    try {
      const first = completeNativeOperation(session, 34);
      const currentOperation =
        createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session);
      const wrongParent = nativeContinuationOperationInput(session, 35, first.fixture, {
        originalSetupTarget: Object.freeze({ role: 'foreign-original-target' }),
      });
      expect(() => produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
        currentOperation,
        wrongParent.input as never,
      )).toThrow(/different retained genesis or application/u);

      const wrongPacket = nativeContinuationOperationInput(session, 36, first.fixture, {
        previousPacket: Object.freeze({ role: 'foreign-previous-packet' }),
      });
      const currentProof = produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
        currentOperation,
        wrongPacket.input as never,
      );
      expect(() => assertSubstrateFederatedNativeGenesisContinuationMintSourceProofPairV1(
        currentProof,
        currentOperation,
        wrongPacket.draft as never,
        first.checkpoint,
        first.operation,
        first.proof,
      )).toThrow(/exact original packet lineage/u);
      currentOperation.dispose();
      first.operation.dispose();
    } finally {
      session.dispose();
    }
  });

  it.each(['previous', 'current', 'parent'] as const)(
    'rejects isolated %s custody disposal in a paired continuation', fault => {
    const session = sessionV2();
    try {
      const first = completeNativeOperation(session, 37);
      const currentFixture = nativeContinuationOperationInput(session, 38, first.fixture);
      const currentOperation =
        createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session);
      const currentProof = produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
        currentOperation,
        currentFixture.input as never,
      );
      if (fault === 'previous') first.operation.dispose();
      else if (fault === 'current') currentOperation.dispose();
      else session.dispose();
      expect(() => assertSubstrateFederatedNativeGenesisContinuationMintSourceProofPairV1(
        currentProof, currentOperation, currentFixture.draft as never,
        first.checkpoint, first.operation, first.proof,
      )).toThrow(/operation is disposed|session is disposed/u);
    } finally {
      session.dispose();
    }
  });

  it('rejects a live previous proof whose own checkpoint is not complete', () => {
    const incompleteSession = sessionV2();
    const currentSession = sessionV2();
    try {
      const incompleteFixture = nativeOperationInput(incompleteSession, 41);
      const incompleteOperation =
        createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(incompleteSession);
      const incompleteProof = produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
        incompleteOperation,
        incompleteFixture.input as never,
      );

      const completed = completeNativeOperation(currentSession, 42);
      const currentFixture = nativeContinuationOperationInput(currentSession, 43, completed.fixture);
      const currentOperation =
        createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(currentSession);
      const currentProof = produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
        currentOperation,
        currentFixture.input as never,
      );
      expect(() => assertSubstrateFederatedNativeGenesisContinuationMintSourceProofPairV1(
        currentProof,
        currentOperation,
        currentFixture.draft as never,
        completed.checkpoint,
        incompleteOperation,
        incompleteProof,
      )).toThrow(/completed original checkpoint/u);
      incompleteOperation.dispose();
      currentOperation.dispose();
      completed.operation.dispose();
    } finally {
      incompleteSession.dispose();
      currentSession.dispose();
    }
  });

  it('keeps the legacy route on the original full-action context and rejects continuation packets', () => {
    const session = sessionV2();
    try {
      const original = nativeOperationInput(session, 39);
      const continuation = nativeContinuationOperationInput(session, 40, original);
      expect(() => produceSubstrateFederatedNativeGenesisMintSourceProofV1(
        session,
        continuation.input as never,
      )).toThrow(/continuation source proof requires an explicit operation/u);
      expect(() => produceSubstrateFederatedNativeGenesisMintSourceProofV1(
        session,
        original.input as never,
      )).not.toThrow();
    } finally {
      session.dispose();
    }
  });

  it.each([
    ['target identity', { foreignTarget: true }],
    ['candidate identity', { cloneCandidate: true }],
    ['application identity', { cloneApplication: true }],
    ['genesis identity', { genesisJsonSha256Hex: '91'.repeat(32) }],
    ['source runtime', { sourceRuntimeCodeSha256Hex: 'a1'.repeat(32) }],
  ] as const)(
    'rejects a foreign %s without consuming the next operation',
    (_label, overrides) => {
      const session = sessionV2();
      try {
        const first = completeNativeOperation(session, 15);
        const operation =
          createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session);
        const foreignFixture = nativeOperationInput(session, 16, overrides);
        expect(() => produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
          operation,
          foreignFixture.input as never,
        )).toThrow(/different retained genesis or application/u);

        const validFixture = nativeOperationInput(session, 17);
        const proof = produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
          operation,
          validFixture.input as never,
        );
        expect(() => produceSubstrateFederatedNativeGenesisCheckpointAttestationForOperationV1(
          operation,
          nativeCheckpointInput(proof, 17) as never,
        )).not.toThrow();
        operation.dispose();
        first.operation.dispose();
      } finally {
        session.dispose();
      }
    },
  );

  it.each([
    ['genesis digest', 'candidate', 'genesisJsonSha256Hex', '92'.repeat(32)],
    ['source-runtime digest', 'application', 'sourceRuntimeCodeSha256Hex', 'a2'.repeat(32)],
  ] as const)(
    'rejects in-place %s drift without consuming the next operation',
    (_label, owner, field, changedValue) => {
      const session = sessionV2();
      try {
        // Deliberately mutable boundary double: production statement codecs,
        // receipt digests, signatures, and verification remain real.
        const first = completeNativeOperation(session, 22, {
          mutableSourceContext: true,
        });
        const retained = mocks.nativeSourceContexts.get(session)!;
        const mutableContext = retained[owner] as Record<string, unknown>;
        const originalValue = mutableContext[field];
        expect(Reflect.set(mutableContext, field, changedValue)).toBe(true);

        expect(() => assertSubstrateFederatedNativeGenesisMintSourceProofReceiptForOperationV1(
          first.proof,
          first.operation,
          first.fixture.draft as never,
        )).toThrow(/retained genesis or application changed|targets a different retained genesis or application/u);
        expect(() => assertSubstrateFederatedNativeGenesisCheckpointAttestationForOperationV1(
          first.checkpoint,
          first.operation,
          first.proof,
        )).toThrow(/retained genesis or application changed|targets a different retained genesis or application/u);

        const operation =
          createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session);
        const driftedFixture = nativeOperationInput(session, 23);
        expect(() => produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
          operation,
          driftedFixture.input as never,
        )).toThrow(/different retained genesis or application/u);

        expect(Reflect.set(mutableContext, field, originalValue)).toBe(true);
        const validFixture = nativeOperationInput(session, 24);
        const proof = produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
          operation,
          validFixture.input as never,
        );
        expect(() => produceSubstrateFederatedNativeGenesisCheckpointAttestationForOperationV1(
          operation,
          nativeCheckpointInput(proof, 24) as never,
        )).not.toThrow();
        operation.dispose();
        first.operation.dispose();
      } finally {
        session.dispose();
      }
    },
  );

  it('rejects a foreign proof without consuming the current operation', () => {
    const session = sessionV2();
    try {
      const first = completeNativeOperation(session, 3);
      const secondFixture = nativeOperationInput(session, 4);
      const secondOperation =
        createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session);
      expect(() => produceSubstrateFederatedNativeGenesisCheckpointAttestationForOperationV1(
        secondOperation,
        nativeCheckpointInput(first.proof, 4) as never,
      )).toThrow(/original operation mint proof provenance/u);
      const secondProof = produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
        secondOperation,
        secondFixture.input as never,
      );
      expect(() => produceSubstrateFederatedNativeGenesisCheckpointAttestationForOperationV1(
        secondOperation,
        nativeCheckpointInput(secondProof, 4) as never,
      )).not.toThrow();
      secondOperation.dispose();
      first.operation.dispose();
    } finally {
      session.dispose();
    }
  });

  it('rejects a duplicate mint identity across operations without consuming the new slot', () => {
    const session = sessionV2();
    try {
      const first = completeNativeOperation(session, 5);
      const secondOperation =
        createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session);
      expect(() => produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
        secondOperation,
        first.fixture.input as never,
      )).toThrow(/mint identity is already bound/u);
      const secondFixture = nativeOperationInput(session, 6);
      const secondProof = produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
        secondOperation,
        secondFixture.input as never,
      );
      expect(() => produceSubstrateFederatedNativeGenesisCheckpointAttestationForOperationV1(
        secondOperation,
        nativeCheckpointInput(secondProof, 6) as never,
      )).not.toThrow();
      secondOperation.dispose();
      first.operation.dispose();
    } finally {
      session.dispose();
    }
  });

  it('separates unused, midway, and completed operation disposal', () => {
    const completedSession = sessionV2();
    try {
      const completed = completeNativeOperation(completedSession, 7);
      completed.operation.dispose();
      expect(() => assertSubstrateFederatedNativeGenesisMintSourceProofReceiptForOperationV1(
        completed.proof,
        completed.operation,
        completed.fixture.draft as never,
      )).toThrow(/operation is disposed/u);
      const successor = completeNativeOperation(completedSession, 8);
      successor.operation.dispose();
    } finally {
      completedSession.dispose();
    }

    const midwaySession = sessionV2();
    const midwayFixture = nativeOperationInput(midwaySession, 9);
    const midwayOperation =
      createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(midwaySession);
    const midwayProof = produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
      midwayOperation,
      midwayFixture.input as never,
    );
    midwayOperation.dispose();
    expect(() => assertSubstrateFederatedNativeGenesisMintSourceProofReceiptForOperationV1(
      midwayProof,
      midwayOperation,
      midwayFixture.draft as never,
    )).toThrow(/session is disposed/u);
    expect(() =>
      createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(midwaySession)
    ).toThrow(/session is disposed/u);
  });

  it.each(['signature', 'verification'] as const)(
    'invalidates the parent after native mint %s failure',
    fault => {
      const session = sessionV2();
      const fixture = nativeOperationInput(session, fault === 'signature' ? 10 : 11);
      const operation =
        createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session);
      if (fault === 'signature') mocks.failNextSignature = true;
      else mocks.failNextVerification = true;
      expect(() => produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
        operation,
        fixture.input as never,
      )).toThrow(fault === 'signature' ? /injected.*failure/u : /signature/u);
      expect(() =>
        createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session)
      ).toThrow(/session is disposed/u);
    },
  );

  it.each(['signature', 'verification'] as const)(
    'invalidates the parent after native checkpoint %s failure',
    fault => {
      const session = sessionV2();
      const first = completeNativeOperation(session, fault === 'signature' ? 18 : 20);
      const fixture = nativeOperationInput(session, fault === 'signature' ? 19 : 21);
      const operation =
        createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session);
      const proof = produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
        operation,
        fixture.input as never,
      );
      if (fault === 'signature') mocks.failNextSignature = true;
      else mocks.failNextVerification = true;
      expect(() => produceSubstrateFederatedNativeGenesisCheckpointAttestationForOperationV1(
        operation,
        nativeCheckpointInput(proof, fault === 'signature' ? 19 : 21) as never,
      )).toThrow(fault === 'signature' ? /injected.*failure/u : /signature verification failed/u);
      expect(() => assertSubstrateFederatedNativeGenesisMintSourceProofReceiptForOperationV1(
        proof,
        operation,
        fixture.draft as never,
      )).toThrow(/session is disposed/u);
      expect(() => assertSubstrateFederatedNativeGenesisCheckpointAttestationForOperationV1(
        first.checkpoint,
        first.operation,
        first.proof,
      )).toThrow(/session is disposed/u);
    },
  );

  it('selects legacy native authority only after a valid proof reaches signing', () => {
    const session = sessionV2();
    try {
      const fixture = nativeOperationInput(session, 14);
      expect(() => produceSubstrateFederatedNativeGenesisMintSourceProofV1(
        session,
        fixture.input as never,
      )).not.toThrow();
      expect(() =>
        createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session)
      ).toThrow(/legacy one-shot authority/u);
      expect(() => signLaunch(session)).toThrow(/already signed/u);
    } finally {
      session.dispose();
    }
  });

  it('keeps mint and checkpoint one-shot capabilities order-independent at session level', () => {
    const session = sessionV2();
    const target = signLaunch(session);
    const checkpointReceipt =
      session.produceCheckpointAttestation(checkpointInput());
    const draft = draftV2(target);
    activeCommittedReserveDraft = draft;

    const mintReceipt = session.produceSettlementFamilyMintSourceProof({
      draft,
      evidenceReceipt: COMMITTED_RESERVE_EVIDENCE_RECEIPT as never,
      issuedAtNativeHeight: '4',
      expiresAtNativeHeight: '36',
    });

    expect(
      checkpointReceipt.boundary.mintBeforeCheckpointLifecycleEstablished,
    ).toBe(false);
    expect(mintReceipt.boundary.mintExecuted).toBe(false);
    expect(checkpointReceipt.boundary.fundsAuthorityEstablished).toBe(false);
    expect(mintReceipt.boundary.fundsAuthorityEstablished).toBe(false);

    session.dispose();
  });

  it('rejects malformed checkpoint fields before consuming the one-shot capability', () => {
    const session = sessionV2();
    signLaunch(session);

    expect(() => session.produceCheckpointAttestation({
      ...checkpointInput(),
      burnLeafCount: 0,
    })).toThrow(/positive uint32/u);
    expect(() => session.produceCheckpointAttestation({
      ...checkpointInput(),
      admissionExpiresAtErgoHeight: '2065',
    })).toThrow(/admission horizon/u);
    expect(() => session.produceCheckpointAttestation(checkpointInput()))
      .not.toThrow();

    session.dispose();
  });

  it('disposes every remaining signing capability when checkpoint signing fails', () => {
    const session = sessionV2();
    signLaunch(session);
    mocks.failNextSignature = true;

    expect(() => session.produceCheckpointAttestation(checkpointInput())).toThrow(
      /injected source-attestation signature failure/u,
    );
    expect(() => session.produceCheckpointAttestation(checkpointInput()))
      .toThrow(/disposed/u);
    expect(() =>
      session.produceSettlementFamilyMintSourceProof({} as never)
    ).toThrow(/disposed/u);
  });

  it('disposes every remaining capability when checkpoint signature verification fails', () => {
    const session = sessionV2();
    signLaunch(session);
    mocks.failNextVerification = true;

    expect(() => session.produceCheckpointAttestation(checkpointInput())).toThrow(
      /signature verification failed/u,
    );
    expect(() => session.produceCheckpointAttestation(checkpointInput()))
      .toThrow(/disposed/u);
    expect(() =>
      session.produceSettlementFamilyMintSourceProof({} as never)
    ).toThrow(/disposed/u);
  });

  it('disposes the signing capability when launch signing fails', () => {
    const session = sessionV2();
    mocks.failNextSignature = true;

    expect(() => signLaunch(session)).toThrow(
      /injected source-attestation signature failure/u,
    );
    expect(() => signLaunch(session)).toThrow(/disposed/u);
    expect(() =>
      session.produceSettlementFamilyMintSourceProof({} as never)
    ).toThrow(/disposed/u);
  });
});

function sessionV1() {
  return createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV1({
    ergoAdmissionThreshold: 1,
    ergoAdmissionPublicKeysHex: [ERGO_ADMISSION_PUBLIC_KEY_HEX],
  });
}

function sessionV2() {
  return createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2({
    ergoAdmissionThreshold: 1,
    ergoAdmissionPublicKeysHex: [ERGO_ADMISSION_PUBLIC_KEY_HEX],
  });
}

function signLaunch(
  session: Readonly<
    | SubstrateFederatedIsolatedDevnetSourceAttestationSessionV1
    | SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2
  >,
  signStatement = true,
): any {
  const statementDigestHex = 'f1'.repeat(32);
  const checkpointProfile = buildSubstrateFederatedCheckpointProfileV1({
    federationEpoch: session.binding.federatedMintProfile.federationEpoch,
    maxAdmissionValidityBlocks:
      session.binding.federatedMintProfile.maxValidityBlocks,
    sourceAttestationThreshold: session.binding.sourceAttestationThreshold,
    sourceAttestationPublicKeysHex:
      session.binding.sourceAttestationPublicKeysHex,
    ergoAdmissionThreshold: 1,
    ergoAdmissionPublicKeysHex: [ERGO_ADMISSION_PUBLIC_KEY_HEX],
  });
  const federation = Object.freeze({
    sourceAttestationKeySetDigestHex:
      session.binding.checkpointSourceAttestationKeySetDigestHex,
    sourceAttestationThreshold: session.binding.sourceAttestationThreshold,
    federationProfileIdHex: session.binding.checkpointFederationProfileIdHex,
    sourceAttestationPublicKeysHex:
      session.binding.sourceAttestationPublicKeysHex,
    federationEpoch: checkpointProfile.federationEpoch,
    maxAdmissionValidityBlocks:
      checkpointProfile.maxAdmissionValidityBlocks,
    ergoAdmissionThreshold: checkpointProfile.ergoAdmissionThreshold,
    ergoAdmissionPublicKeysHex:
      checkpointProfile.ergoAdmissionPublicKeysHex,
    ergoAdmissionKeySetDigestHex:
      checkpointProfile.ergoAdmissionKeySetDigestHex,
  });
  const familyInput =
    buildSubstrateFederatedSettlementFamilyV1CompilerFixtureInput();
  const familyRequest =
    buildSubstrateFederatedSettlementFamilyV1CompilerRequest({
      ...familyInput,
      tracker: {
        ...familyInput.tracker,
        sourceNetworkIdHex: SOURCE_NETWORK_ID,
        sidechainIdHex: SIDECHAIN_ID,
        bridgeAddressHex: BRIDGE_ADDRESS,
        tokenAddressHex: TOKEN_ADDRESS,
        runtimeProfileIdHex: h32('54'),
        settlementProfileIdHex: SETTLEMENT_PROFILE_ID,
        federationProfileIdHex: checkpointProfile.profileIdHex,
        sourceAttestationKeySetDigestHex:
          checkpointProfile.sourceAttestationKeySetDigestHex,
        sourceAttestationThreshold:
          checkpointProfile.sourceAttestationThreshold,
        ergoAdmissionKeySetDigestHex:
          checkpointProfile.ergoAdmissionKeySetDigestHex,
        ergoAdmissionThreshold: checkpointProfile.ergoAdmissionThreshold,
        federationEpoch: checkpointProfile.federationEpoch,
      },
    });
  const target = Object.freeze({
    descriptorDigestHex: h32('60'),
    profile: Object.freeze({
      familyIdHex: familyRequest.profile.familyIdHex,
      encodedProfileHex: familyRequest.profile.encodedProfileHex,
      settlementProfileIdHex: SETTLEMENT_PROFILE_ID,
    }),
    sourceRuntime: Object.freeze({
      sourceNetworkIdHex: SOURCE_NETWORK_ID,
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddressHex: BRIDGE_ADDRESS,
      tokenAddressHex: TOKEN_ADDRESS,
      bridgeRuntimeCodeSha256Hex: h32('51'),
      bridgeRuntimeCodeBytes: 100,
      tokenRuntimeCodeSha256Hex: h32('52'),
      tokenRuntimeCodeBytes: 200,
      sourceRuntimeCodeSha256Hex: h32('53'),
      sourceRuntimeCodeBytes: 300,
      runtimeProfileIdHex: h32('54'),
    }),
    federation,
    lineages: Object.freeze({
      tracker: Object.freeze({
        singletonTokenIdHex: familyRequest.tracker.trackerNftIdHex,
      }),
      duplicatePrevention: Object.freeze({
        singletonTokenIdHex:
          familyRequest.profile.duplicatePreventionNftIdHex,
      }),
      pooledReserve: Object.freeze({
        singletonTokenIdHex: familyRequest.profile.pooledReserveNftIdHex,
      }),
    }),
  });
  const statement = Object.freeze({
    statementDigestHex,
    attestationDigestHex:
      deriveSubstrateFederatedIsolatedDevnetLaunchAttestationDigestV1({
        statementDigestHex,
        sourceAttestationKeySetDigestHex:
          federation.sourceAttestationKeySetDigestHex,
        sourceAttestationThreshold: federation.sourceAttestationThreshold,
      }),
    target,
  });
  if (signStatement) {
    mocks.launchStatements.add(statement);
    session.signLaunchStatement(statement as never);
  }
  return target;
}

function checkpointInput() {
  return Object.freeze({
    sourceNativeBlockHeight: '7',
    sourceNativeBlockHashHex: h32('61'),
    executionBlockHashHex: h32('62'),
    bridgeEventRootHex: h32('63'),
    burnLeafCount: 1,
    admissionValidFromErgoHeight: '2000',
    admissionExpiresAtErgoHeight: '2064',
  });
}

function draftV2(target: any, variant = 0) {
  const variantHex = (base: number) => h32((base + variant).toString(16).padStart(2, '0'));
  const sourceLockId = variant === 0 ? SOURCE_LOCK_ID : variantHex(0x12);
  const transitionId = variant === 0 ? TRANSITION_ID : variantHex(0x13);
  const commitment = variant === 0 ? COMMITMENT : variantHex(0x14);
  const successorId = variant === 0 ? SUCCESSOR_ID : variantHex(0x15);
  const successorDigest = variant === 0 ? SUCCESSOR_DIGEST : `0x01${(0x16 + variant).toString(16).padStart(2, '0').repeat(32)}`;
  const sourceIntentHex = encodePegInSourceIntentV2Hex({
    formatVersion: 2,
    sourceNetworkIdHex: target.sourceRuntime.sourceNetworkIdHex,
    sidechainIdHex: target.sourceRuntime.sidechainIdHex,
    bridgeAddressHex: target.sourceRuntime.bridgeAddressHex,
    tokenAddressHex: target.sourceRuntime.tokenAddressHex,
    settlementProfileIdHex: target.profile.settlementProfileIdHex,
    admissionProfileIdHex: target.profile.familyIdHex,
    sourceAssetIdHex: h32('00'),
    amountNanoErg: '10000000',
    recipientAddressHex: RECIPIENT_ADDRESS,
  });
  activePacket = Object.freeze({
    familyIdHex: target.profile.familyIdHex,
    familyCompiler: Object.freeze({ bindingDigestHex: h32('33') }),
    sourceIntentHex,
    depositCommitmentHex: commitment,
    reserve: Object.freeze({
      outputDigestHex: successorDigest,
      outputLiabilityNanoErg: '10000000',
    }),
    transactions: Object.freeze({
      reserveTransition: Object.freeze({ txId: transitionId }),
    }),
    boxes: Object.freeze({
      sourceLock: Object.freeze({ boxId: sourceLockId }),
      reserveSuccessor: Object.freeze({ boxId: successorId }),
    }),
  });
  return buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
    batch: BATCH as never,
    target: TARGET as never,
    candidate: CANDIDATE as never,
    committedVaultObservation: OBSERVATION as never,
  });
}

/**
 * Boundary-double fixture for operation lifetime only. Draft/context/evidence
 * ownership is registered below; statement/profile codecs and signatures run
 * through the production implementations.
 */
function nativeOperationInput(
  session: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2>,
  variant: number,
  overrides: Readonly<{
    cloneApplication?: boolean;
    cloneCandidate?: boolean;
    foreignTarget?: boolean;
    genesisJsonSha256Hex?: string;
    mutableSourceContext?: boolean;
    sourceRuntimeCodeSha256Hex?: string;
  }> = {},
) {
  const profileTarget = signLaunch(session, false);
  const profiles = readSubstrateFederatedGenesisProfilesFromSessionV2(session);
  const prefixed = (value: string) => value.startsWith('0x') ? value : `0x${value}`;
  const unprefixed = (value: string) => value.replace(/^0x/, '');
  const runtimeProfile = Object.freeze({
    formatVersion: 4 as const,
    lineageProfileIdHex: prefixed(profileTarget.profile.familyIdHex),
    sourceNetworkIdHex: prefixed(profileTarget.sourceRuntime.sourceNetworkIdHex),
    sidechainIdHex: prefixed(profileTarget.sourceRuntime.sidechainIdHex),
    bridgeAddressHex: prefixed(profileTarget.sourceRuntime.bridgeAddressHex),
    tokenAddressHex: prefixed(profileTarget.sourceRuntime.tokenAddressHex),
    bridgeRuntimeCodeSha256Hex: prefixed(profileTarget.sourceRuntime.bridgeRuntimeCodeSha256Hex),
    bridgeRuntimeCodeBytes: profileTarget.sourceRuntime.bridgeRuntimeCodeBytes,
    tokenRuntimeCodeSha256Hex: prefixed(profileTarget.sourceRuntime.tokenRuntimeCodeSha256Hex),
    tokenRuntimeCodeBytes: profileTarget.sourceRuntime.tokenRuntimeCodeBytes,
    settlementProfileIdHex: prefixed(profileTarget.profile.settlementProfileIdHex),
    ergoDepositFinalityPolicyIdHex:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX,
    sourceProofSystemIdHex: session.binding.federatedMintProfile.proofSystemIdHex,
    sourceProofProfileIdHex: session.binding.federatedMintProfile.proofProfileIdHex,
    activationHeight: '0',
    maxPendingBlocks: 64,
  });
  const runtimeProfileScaleHex =
    encodePooledReserveMintReservationRuntimeProfileV4ScaleHex(runtimeProfile);
  const runtimeProfileIdHex =
    derivePooledReserveMintReservationRuntimeProfileV4IdHex(runtimeProfile);
  const draft = draftV2(profileTarget, variant);
  const batch = Object.freeze({ role: `native-operation-batch-${variant}` });
  let target = mocks.nativeTargets.get(session);
  if (target === undefined) {
    target = Object.freeze({ role: 'native-operation-target' });
    mocks.nativeTargets.set(session, target);
  }
  if (overrides.foreignTarget) {
    target = Object.freeze({ role: 'foreign-native-operation-target' });
  }
  const packet = Object.freeze({ role: `native-operation-packet-${variant}` });
  const committedVaultObservation = Object.freeze({
    role: `native-operation-observation-${variant}`,
  });
  const draftInputs = Object.freeze({ batch, target, packet, committedVaultObservation });
  mocks.nativeDraftInputs.set(draft, draftInputs);
  mocks.nativeRetainedTargets.set(batch, target);
  mocks.nativePacketProvenance.set(packet, Object.freeze({
    batch,
    target,
    originalSetupTarget: target,
    previousPacket: null,
  }));
  let retainedSourceContext = mocks.nativeSourceContexts.get(session);
  if (retainedSourceContext === undefined) {
    const candidate = {
      runtimeProfile,
      runtimeProfileScaleHex,
      runtimeProfileIdHex,
      genesisJsonSha256Hex: '90'.repeat(32),
    };
    const application = {
      sourceNetworkIdHex: unprefixed(runtimeProfile.sourceNetworkIdHex),
      sidechainIdHex: unprefixed(runtimeProfile.sidechainIdHex),
      bridgeAddressHex: unprefixed(runtimeProfile.bridgeAddressHex),
      tokenAddressHex: unprefixed(runtimeProfile.tokenAddressHex),
      bridgeRuntimeCodeSha256Hex: unprefixed(runtimeProfile.bridgeRuntimeCodeSha256Hex),
      bridgeRuntimeCodeBytes: runtimeProfile.bridgeRuntimeCodeBytes,
      tokenRuntimeCodeSha256Hex: unprefixed(runtimeProfile.tokenRuntimeCodeSha256Hex),
      tokenRuntimeCodeBytes: runtimeProfile.tokenRuntimeCodeBytes,
      sourceRuntimeCodeSha256Hex: 'a0'.repeat(32),
      sourceRuntimeCodeBytes: 300,
      runtimeProfileIdHex: unprefixed(runtimeProfileIdHex),
      settlementProfileIdHex: unprefixed(runtimeProfile.settlementProfileIdHex),
    };
    retainedSourceContext = Object.freeze({
      candidate: overrides.mutableSourceContext ? candidate : Object.freeze(candidate),
      application: overrides.mutableSourceContext ? application : Object.freeze(application),
    });
    mocks.nativeSourceContexts.set(session, retainedSourceContext);
  }
  const candidate = overrides.cloneCandidate || overrides.genesisJsonSha256Hex
    ? Object.freeze({
      ...retainedSourceContext.candidate,
      genesisJsonSha256Hex: overrides.genesisJsonSha256Hex
        ?? retainedSourceContext.candidate.genesisJsonSha256Hex,
    })
    : retainedSourceContext.candidate;
  const application = overrides.cloneApplication || overrides.sourceRuntimeCodeSha256Hex
    ? Object.freeze({
      ...retainedSourceContext.application,
      sourceRuntimeCodeSha256Hex: overrides.sourceRuntimeCodeSha256Hex
        ?? retainedSourceContext.application.sourceRuntimeCodeSha256Hex,
    })
    : retainedSourceContext.application;
  const context = Object.freeze({
    candidate,
    checkpointProfile: profiles.checkpointProfile,
    application,
  });
  mocks.nativeContexts.set(batch, Object.freeze({ target, context }));
  const evidenceReceipt = Object.freeze({
    receiptDigestHex: h32((0xb0 + variant).toString(16).padStart(2, '0')),
  });
  mocks.nativeEvidence.set(evidenceReceipt, Object.freeze({ draft, evidence: EVIDENCE }));
  return Object.freeze({
    draft,
    input: Object.freeze({
      draftInputs,
      draft,
      evidenceReceipt,
      issuedAtNativeHeight: '0',
      expiresAtNativeHeight: '32',
    }),
  });
}

function nativeCheckpointInput(proof: object, variant: number) {
  const byte = (base: number) => h32((base + variant).toString(16).padStart(2, '0'));
  return Object.freeze({
    proof,
    checkpoint: Object.freeze({
      sourceNativeBlockHeight: String(4 + variant),
      sourceNativeBlockHashHex: byte(0xc0),
      executionBlockHashHex: byte(0xc4),
      bridgeEventRootHex: byte(0xc8),
      burnLeafCount: 1 + variant,
      admissionValidFromErgoHeight: String(2000 + variant * 100),
      admissionExpiresAtErgoHeight: String(2064 + variant * 100),
    }),
  });
}

function nativeContinuationOperationInput(
  session: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2>,
  variant: number,
  previousFixture: ReturnType<typeof nativeOperationInput>,
  overrides: Readonly<{ originalSetupTarget?: object; previousPacket?: object }> = {},
) {
  const fixture = nativeOperationInput(session, variant, { foreignTarget: true });
  const { batch, target, packet } = fixture.input.draftInputs;
  const originalSetupTarget = overrides.originalSetupTarget
    ?? previousFixture.input.draftInputs.target;
  mocks.nativeRetainedTargets.set(batch, originalSetupTarget);
  mocks.nativePacketProvenance.set(packet, Object.freeze({
    batch,
    target,
    originalSetupTarget,
    previousPacket: overrides.previousPacket ?? previousFixture.input.draftInputs.packet,
  }));
  return fixture;
}

function completeNativeOperation(
  session: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2>,
  variant: number,
  overrides: Parameters<typeof nativeOperationInput>[2] = {},
) {
  const fixture = nativeOperationInput(session, variant, overrides);
  const operation =
    createSubstrateFederatedNativeGenesisSourceAttestationOperationV1(session);
  const proof = produceSubstrateFederatedNativeGenesisMintSourceProofForOperationV1(
    operation,
    fixture.input as never,
  );
  const checkpoint =
    produceSubstrateFederatedNativeGenesisCheckpointAttestationForOperationV1(
      operation,
      nativeCheckpointInput(proof, variant) as never,
    );
  return Object.freeze({ fixture, operation, proof, checkpoint });
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
