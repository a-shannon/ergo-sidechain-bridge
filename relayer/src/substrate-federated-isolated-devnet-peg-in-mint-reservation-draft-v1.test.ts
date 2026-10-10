import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCommittedVaultForCandidate: vi.fn(),
  assertCommittedVaultForCandidateV2: vi.fn(),
  assertNativeObservation: vi.fn(),
  assertNativePacket: vi.fn(),
}));

vi.mock(
  './substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js',
  () => ({
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_REQUIRED_SUCCESSOR_DEPTH_V1: 10,
    assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV1:
      mocks.assertCommittedVaultForCandidate,
    assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV2:
      mocks.assertCommittedVaultForCandidateV2,
    assertSubstrateFederatedNativeGenesisPegInCommittedVaultOutputObservationV1: mocks.assertNativeObservation,
  }),
);

vi.mock('./substrate-federated-isolated-devnet-peg-in-candidate-v2.js', () => ({
  assertSubstrateFederatedNativeGenesisPegInPacketV1: mocks.assertNativePacket,
}));

import {
  encodePegInSourceIntentV2Hex,
} from './peg-in-causal-admission-v2.js';
import {
  buildSubstrateFederatedNativeGenesisPegInMintReservationDraftV1 as buildNativeDraft,
  assertSubstrateFederatedNativeGenesisPegInMintReservationDraftV1 as assertNativeDraft,
  assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1,
  buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1,
  buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2 as buildDraftV2,
  assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2 as assertDraftV2,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX,
} from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_IDENTITY_V4_HEX,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_ID_V4_HEX,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_V4_HEX,
} from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1-fixture.js';

const h32 = (byte: string): string => `0x${byte.repeat(32)}`;
const h20 = (byte: string): string => `0x${byte.repeat(20)}`;
const FAMILY_ID = h32('11');
const SIDECHAIN_ID = h32('23');
const BRIDGE_ADDRESS = '0x970951a12f975e6762482aca81e57d5a2a4e73f4';
const SERG_CONTRACT_ADDRESS = '0xc01ee7f10ea4af4673cfff62710e1d7792aba8f3';
const SOURCE_LOCK_ID = h32('12');
const TRANSITION_ID = h32('13');
const COMMITMENT = h32('14');
const SUCCESSOR_ID = h32('15');
const SUCCESSOR_DIGEST = `0x01${'16'.repeat(32)}`;
const INCLUSION_ID = h32('17');
const TARGET_ID = h32('18');
const SOURCE_INTENT_HEX = encodePegInSourceIntentV2Hex({
  formatVersion: 2,
  sourceNetworkIdHex: h32('21'),
  sidechainIdHex: SIDECHAIN_ID,
  bridgeAddressHex: BRIDGE_ADDRESS,
  tokenAddressHex: SERG_CONTRACT_ADDRESS,
  settlementProfileIdHex: h32('25'),
  admissionProfileIdHex: FAMILY_ID,
  sourceAssetIdHex: h32('00'),
  amountNanoErg: '10000000',
  recipientAddressHex: h20('26'),
});
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
const PACKET = Object.freeze({
  familyIdHex: FAMILY_ID,
  familyCompiler: Object.freeze({ bindingDigestHex: h32('33') }),
  sourceIntentHex: SOURCE_INTENT_HEX,
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

const COMPILER_V2 = Object.freeze({
  trackerRequestDigestHex: h32('41'), trackerReceiptDigestHex: h32('42'),
  familyRequestDigestHex: h32('43'), familyReceiptDigestHex: h32('44'),
  compilerLockDigestHex: h32('45'),
});
const CANDIDATE_V2 = Object.freeze({ version: 2, candidateDigestHex: h32('46') });
const PACKET_V2 = Object.freeze({ ...PACKET, version: 2, familyCompiler: COMPILER_V2 });
const draftV2Input = () => ({ batch: BATCH as never, target: TARGET as never,
  candidate: CANDIDATE_V2 as never, committedVaultObservation: OBSERVATION as never });
const NATIVE_BATCH = Object.freeze({ profile: 'fed-native-height-zero-v1',
  request: Object.freeze({ requestDigestHex: h32('51') }),
  receipt: Object.freeze({ receiptDigestHex: h32('52') }) });
const NATIVE_OBSERVATION = Object.freeze({ ...OBSERVATION,
  processBindingDigestHex: h32('53'), executionTargetIdentityDigestHex: h32('54') });
const nativeInput = () => ({ batch: NATIVE_BATCH as never, target: TARGET as never,
  packet: PACKET_V2 as never, committedVaultObservation: NATIVE_OBSERVATION as never });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertNativePacket.mockImplementation((packet, batch, target) => {
    if (packet !== PACKET_V2 || batch !== NATIVE_BATCH || target !== TARGET) {
      throw new Error('native packet provenance missing');
    }
    return packet;
  });
  mocks.assertNativeObservation.mockImplementation((observation, target, batch, packet) => {
    const assertedPacket = mocks.assertNativePacket(packet, batch, target);
    if (observation !== NATIVE_OBSERVATION || target !== TARGET || batch !== NATIVE_BATCH || packet !== PACKET_V2) {
      throw new Error('native observation provenance missing');
    }
    return assertedPacket;
  });
  mocks.assertCommittedVaultForCandidateV2.mockImplementation((observation, batch, candidate, target) => {
    if (observation !== OBSERVATION || batch !== BATCH || candidate !== CANDIDATE_V2 || target !== TARGET) {
      throw new Error('committed-vault V2 candidate provenance missing');
    }
    return PACKET_V2;
  });
  mocks.assertCommittedVaultForCandidate.mockImplementation(
    (observation, batch, candidate, target) => {
      if (
        observation !== OBSERVATION
        || batch !== BATCH
        || candidate !== CANDIDATE
        || target !== TARGET
      ) {
        throw new Error('committed-vault candidate provenance missing');
      }
      return PACKET;
    },
  );
});

describe('native genesis mint-reservation draft V1', () => {
  it('preserves canonical V4 bytes with a distinct native identity and all compiler bindings', () => {
    const input = nativeInput();
    const draft = buildNativeDraft(input);
    const legacy = buildDraftV2(draftV2Input());
    expect(draft.schema).toBe('e2s.substrate-federated-native-genesis-peg-in-mint-reservation-draft.v1');
    expect(draft.statementHex).toBe(SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_V4_HEX);
    expect(draft.statementIdHex).toBe(legacy.statementIdHex);
    expect(draft.reservationKeyHex).toBe(legacy.reservationKeyHex);
    expect(draft.boundary).toEqual(legacy.boundary);
    expect(draft.draftDigestHex).not.toBe(legacy.draftDigestHex);
    expect(draft.provenance).toMatchObject({ profile: 'fed-native-height-zero-v1',
      setupRequestDigestHex: NATIVE_BATCH.request.requestDigestHex,
      setupCheckReceiptDigestHex: NATIVE_BATCH.receipt.receiptDigestHex,
      committedVaultObservationDigestHex: NATIVE_OBSERVATION.observationDigestHex,
      familyCompiler: COMPILER_V2, exactSameProcessBatchPacketAndObservationBound: true });
    expect(draft.provenance).not.toHaveProperty('candidateDigestHex');
    expect(Object.isFrozen(draft.provenance.familyCompiler)).toBe(true);
    expect(() => assertNativeDraft(draft, input)).not.toThrow();
    expect(mocks.assertNativePacket).toHaveBeenCalledWith(PACKET_V2, NATIVE_BATCH, TARGET);
    expect(mocks.assertNativeObservation).toHaveBeenCalledWith(NATIVE_OBSERVATION, TARGET, NATIVE_BATCH, PACKET_V2);
  });

  it.each(['batch', 'target', 'packet', 'committedVaultObservation'] as const)(
    'rejects copied %s during construction and original-input revalidation', field => {
      const input = nativeInput();
      const draft = buildNativeDraft(input);
      const copied = { ...input, [field]: structuredClone(input[field]) };
      expect(() => buildNativeDraft(copied as never)).toThrow(/provenance/);
      expect(() => assertNativeDraft(draft, copied as never)).toThrow(/exact original/);
    },
  );

  it.each(['setup-custody', 'target-custody'] as const)('revalidates %s on every assertion', fault => {
    const draft = buildNativeDraft(nativeInput());
    const check = fault === 'setup-custody' ? mocks.assertNativePacket : mocks.assertNativeObservation;
    check.mockImplementation(() => { throw new Error(`${fault} disposed`); });
    expect(() => assertNativeDraft(draft)).toThrow(/disposed/);
  });

  it('rejects copied drafts and native/legacy cross-version provenance', () => {
    const draft = buildNativeDraft(nativeInput());
    const legacyV2 = buildDraftV2(draftV2Input());
    const legacyV1 = buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
      ...draftV2Input(), candidate: CANDIDATE as never });
    expect(() => assertNativeDraft(structuredClone(draft))).toThrow(/provenance/);
    for (const legacy of [legacyV1, legacyV2]) expect(() => assertNativeDraft(legacy)).toThrow(/provenance/);
    expect(() => assertDraftV2(draft)).toThrow(/provenance/);
    expect(() => assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1(draft)).toThrow(/provenance/);
  });

  it.each(['batch', 'target', 'packet', 'committedVaultObservation'] as const)(
    'rejects %s getters without invoking them', field => {
      const input = nativeInput();
      const getter = vi.fn(() => input[field]);
      Object.defineProperty(input, field, { enumerable: true, get: getter });
      expect(() => buildNativeDraft(input)).toThrow(/own-data fields/);
      expect(getter).not.toHaveBeenCalled();
    },
  );

  it.each(['symbol', 'hidden', 'prototype', 'null-prototype'] as const)('rejects %s input fields', fault => {
    const input = nativeInput();
    if (fault === 'symbol') Object.defineProperty(input, Symbol('extra'), { value: true });
    if (fault === 'hidden') Object.defineProperty(input, 'extra', { value: true });
    if (fault === 'prototype') Object.setPrototypeOf(input, { inherited: true });
    if (fault === 'null-prototype') Object.setPrototypeOf(input, null);
    expect(() => buildNativeDraft(input)).toThrow(/own-data fields/);
  });
});

describe('isolated devnet peg-in mint-reservation draft V1', () => {
  it('binds the exact committed reserve to one canonical non-authorizing V4 statement', () => {
    const draft = buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
      batch: BATCH as never,
      target: TARGET as never,
      candidate: CANDIDATE as never,
      committedVaultObservation: OBSERVATION as never,
    });

    expect(draft).toMatchObject({
      status: 'canonical_statement_waiting_for_source_proof',
      reservationKeyHex: draft.statement.mintIdentityHex,
      statement: {
        lineageProfileIdHex: FAMILY_ID,
        sourceIntentHex: SOURCE_INTENT_HEX,
        sourceLockBoxIdHex: SOURCE_LOCK_ID,
        reserveTransitionTransactionIdHex: TRANSITION_ID,
        depositCommitmentHex: COMMITMENT,
        successorReserveBoxIdHex: SUCCESSOR_ID,
        successorReserveDigestHex: SUCCESSOR_DIGEST,
        successorReserveLiabilityNanoErg: '10000000',
        ergoDepositFinalityPolicyIdHex:
          SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_FINALITY_POLICY_ID_V1_HEX,
        inclusionHeaderIdHex: INCLUSION_ID,
        inclusionHeight: 500,
        targetHeaderIdHex: TARGET_ID,
        targetHeight: 510,
        requiredSuccessorDepth: 10,
      },
      provenance: {
        candidateDigestHex: CANDIDATE.candidateDigestHex,
        committedVaultObservationDigestHex:
          OBSERVATION.observationDigestHex,
        familyCompilerBindingDigestHex:
          PACKET.familyCompiler.bindingDigestHex,
        exactSameProcessCandidateAndObservationBound: true,
      },
      boundary: {
        exactCommittedReserveBound: true,
        exactFinalityTargetBound: true,
        canonicalV4StatementConstructed: true,
        runtimeProfileBound: false,
        canonicalSourceProofEvidenceCollected: false,
        sourceProofRequestConstructed: false,
        sourceAttestationEstablished: false,
        runtimeReservationWritten: false,
        mintExecuted: false,
        signingAuthorized: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(draft.statementHex).toHaveLength(2 + 603 * 2);
    expect(draft.statementHex).toBe(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_V4_HEX,
    );
    expect(draft.statementIdHex).toBe(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_RESERVATION_STATEMENT_ID_V4_HEX,
    );
    expect(draft.reservationKeyHex).toBe(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_REFERENCE_MINT_IDENTITY_V4_HEX,
    );
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1(draft)
    ).not.toThrow();
  });

  it('rejects copied evidence, cross-candidate reuse, and copied drafts', () => {
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
        batch: BATCH as never,
        target: TARGET as never,
        candidate: CANDIDATE as never,
        committedVaultObservation: { ...OBSERVATION } as never,
      })
    ).toThrow(/provenance missing/);

    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
        batch: BATCH as never,
        target: TARGET as never,
        candidate: { ...CANDIDATE } as never,
        committedVaultObservation: OBSERVATION as never,
      })
    ).toThrow(/provenance missing/);

    const draft = buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
      batch: BATCH as never,
      target: TARGET as never,
      candidate: CANDIDATE as never,
      committedVaultObservation: OBSERVATION as never,
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
        ...draft,
      })
    ).toThrow(/same-process provenance/);
  });

  it('rejects a liability lower than the bound source amount', () => {
    mocks.assertCommittedVaultForCandidate.mockReturnValueOnce({
      ...PACKET,
      reserve: {
        ...PACKET.reserve,
        outputLiabilityNanoErg: '9999999',
      },
    });

    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
        batch: BATCH as never,
        target: TARGET as never,
        candidate: CANDIDATE as never,
        committedVaultObservation: OBSERVATION as never,
      })
    ).toThrow(/liability cannot be lower/);
  });
});

describe('isolated devnet peg-in mint-reservation draft V2', () => {
  it('retains all five compiler bindings without changing canonical V4 bytes or authority boundaries', () => {
    const draft = buildDraftV2(draftV2Input());
    const legacy = buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
      ...draftV2Input(), candidate: CANDIDATE as never,
    });
    expect(draft).toMatchObject({
      schema: 'e2s.substrate-federated-isolated-devnet-peg-in-mint-reservation-draft.v2', version: 2,
      provenance: { familyCompiler: COMPILER_V2, candidateDigestHex: CANDIDATE_V2.candidateDigestHex,
        committedVaultObservationDigestHex: OBSERVATION.observationDigestHex,
        exactSameProcessCandidateAndObservationBound: true },
    });
    expect(draft.provenance).not.toHaveProperty('familyCompilerBindingDigestHex');
    expect(draft.statementHex).toBe(legacy.statementHex);
    expect(draft.statementIdHex).toBe(legacy.statementIdHex);
    expect(draft.reservationKeyHex).toBe(legacy.reservationKeyHex);
    expect(draft.boundary).toEqual(legacy.boundary);
    expect(draft.draftDigestHex).not.toBe(legacy.draftDigestHex);
    expect(Object.isFrozen(draft.provenance.familyCompiler)).toBe(true);
    expect(() => assertDraftV2(draft)).not.toThrow();
  });

  it.each(Object.keys(COMPILER_V2) as Array<keyof typeof COMPILER_V2>)(
    'binds isolated compiler field %s into draft identity', field => {
      const original = buildDraftV2(draftV2Input());
      mocks.assertCommittedVaultForCandidateV2.mockReturnValueOnce({
        ...PACKET_V2, familyCompiler: { ...COMPILER_V2, [field]: h32('ff') },
      });
      const changed = buildDraftV2(draftV2Input());
      expect(changed.provenance.familyCompiler[field]).toBe(h32('ff'));
      expect(changed.draftDigestHex).not.toBe(original.draftDigestHex);
      expect(changed.statementHex).toBe(original.statementHex);
    },
  );

  it.each(['batch', 'target', 'candidate', 'committedVaultObservation'] as const)(
    'rejects copied %s identity', field => {
      const input = draftV2Input();
      expect(() => buildDraftV2({ ...input, [field]: { ...(input[field] as object) } } as never))
        .toThrow(/provenance/);
    },
  );

  it('rejects copied drafts and both cross-version provenance claims', () => {
    const current = buildDraftV2(draftV2Input());
    const legacy = buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
      ...draftV2Input(), candidate: CANDIDATE as never,
    });
    expect(() => assertDraftV2(structuredClone(current))).toThrow(/provenance/);
    expect(() => assertDraftV2(legacy)).toThrow(/provenance|version/);
    expect(() => assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1(current))
      .toThrow(/provenance|version/);
    expect(() => buildDraftV2({ ...draftV2Input(), candidate: CANDIDATE as never }))
      .toThrow(/provenance/);
    expect(() => buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1(draftV2Input()))
      .toThrow(/provenance/);
  });
});
