import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertObservation: vi.fn(),
  assertObservationV2: vi.fn(),
  assertNativeObservation: vi.fn(),
  assertNativePacket: vi.fn(),
  nativeMaterials: [] as Array<{ batch: object; target: object; packet: object; observation: object }>,
  setupActive: true,
  targetActive: true,
  drafts: new WeakSet<object>(),
  packet: undefined as any,
  observation: undefined as any,
}));

vi.mock(
  './substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js',
  () => ({
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_REQUIRED_SUCCESSOR_DEPTH_V1: 10,
    assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV1:
      mocks.assertObservation,
    assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV2:
      mocks.assertObservationV2,
    assertSubstrateFederatedNativeGenesisPegInCommittedVaultOutputObservationV1: mocks.assertNativeObservation,
  }),
);

vi.mock('./substrate-federated-isolated-devnet-peg-in-candidate-v2.js', () => ({
  assertSubstrateFederatedNativeGenesisPegInPacketV1: mocks.assertNativePacket,
}));

vi.mock(
  './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js',
  async importOriginal => ({
    ...await importOriginal<typeof import('./substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js')>(),
    assertSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1:
      vi.fn((value: unknown) => {
        if (value === null || typeof value !== 'object' || !mocks.drafts.has(value)) {
          throw new Error('mint-reservation draft lacks same-process provenance');
        }
      }),
  }),
);

import {
  assertSubstrateFederatedNativeGenesisCommittedReserveEvidenceReceiptV1Provenance as assertNativeReceipt,
  collectSubstrateFederatedNativeGenesisCommittedReserveEvidenceV1 as collectNative,
  consumeSubstrateFederatedNativeGenesisCommittedReserveEvidenceForDraftV1 as consumeNative,
  assertSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1Provenance,
  collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV1,
  consumeSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceForDraftV1,
  collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV2 as collectV2,
  consumeSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceForDraftV2 as consumeV2,
} from './substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js';
import { buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2 as buildDraftV2,
  buildSubstrateFederatedNativeGenesisPegInMintReservationDraftV1 as buildNativeDraft,
  type SubstrateFederatedNativeGenesisPegInMintReservationDraftV1Input }
  from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';
import { encodePegInSourceIntentV2Hex } from './peg-in-causal-admission-v2.js';

const h32 = (byte: string): string => `0x${byte.repeat(32)}`;
const BATCH = Object.freeze({ role: 'batch' });
const TARGET = Object.freeze({ role: 'target' });
const CANDIDATE = Object.freeze({ candidateDigestHex: h32('11') });
const CANDIDATE_V2 = Object.freeze({ version: 2, candidateDigestHex: h32('71') });
const COMPILER_V2 = Object.freeze({
  trackerRequestDigestHex: h32('72'), trackerReceiptDigestHex: h32('73'),
  familyRequestDigestHex: h32('74'), familyReceiptDigestHex: h32('75'),
  compilerLockDigestHex: h32('76'),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nativeMaterials = [];
  mocks.setupActive = true;
  mocks.targetActive = true;
  mocks.assertNativePacket.mockImplementation((packet, batch, target) => {
    if (!mocks.setupActive) throw new Error('native setup custody disposed');
    if (!mocks.targetActive) throw new Error('native target custody disposed');
    if (!mocks.nativeMaterials.some(value => value.packet === packet && value.batch === batch && value.target === target)) {
      throw new Error('native packet provenance missing');
    }
    return packet;
  });
  mocks.assertNativeObservation.mockImplementation((observation, target, batch, packet) => {
    if (!mocks.targetActive) throw new Error('native target custody disposed');
    if (!mocks.nativeMaterials.some(value => value.observation === observation && value.packet === packet
      && value.batch === batch && value.target === target)) throw new Error('native observation provenance missing');
    return packet;
  });
  mocks.drafts = new WeakSet<object>();
  mocks.packet = packet();
  mocks.observation = observation();
  mocks.assertObservationV2.mockImplementation((observed, batch, candidate, target) => {
    if (observed !== mocks.observation || batch !== BATCH || candidate !== CANDIDATE_V2 || target !== TARGET) {
      throw new Error('committed-vault V2 candidate provenance missing');
    }
    return mocks.packet;
  });
  mocks.assertObservation.mockImplementation(
    (observed, batch, candidate, target) => {
      if (
        observed !== mocks.observation
        || batch !== BATCH
        || candidate !== CANDIDATE
        || target !== TARGET
      ) {
        throw new Error('committed-vault candidate provenance missing');
      }
      return mocks.packet;
    },
  );
});

describe('isolated-devnet committed-reserve evidence collector V1', () => {
  it('derives every evidence field from the exact process-owned reserve transition', () => {
    const draft = mintDraft();
    const receipt = collect(draft);
    const sourceLock = decodeCanonicalObject(
      receipt.evidence.sourceLockBoxCanonicalHex,
    );
    const ancestry = decodeCanonicalObject(
      receipt.evidence.checkpointAncestryCanonicalHex,
    );
    const finality = decodeCanonicalObject(
      receipt.evidence.finalityProofCanonicalHex,
    );

    expect(receipt).toMatchObject({
      status: 'canonical_committed_reserve_evidence_collected',
      mintReservationDraftDigestHex: draft.draftDigestHex,
      candidateDigestHex: CANDIDATE.candidateDigestHex,
      committedVaultObservationDigestHex:
        mocks.observation.observationDigestHex,
      checks: {
        exactSameProcessDraftObservationAndCandidateBound: true,
        exactSourceLockAndReserveTransitionBound: true,
        exactStatementAndReserveLineageBound: true,
        exactInclusionAndCheckpointAncestryBound: true,
        collectorExecutableRevalidated: true,
        callerSuppliedEvidenceAccepted: false,
      },
      boundaries: {
        sourceEvidenceCollectionProvenanceEstablished: true,
        dualLoopbackObservationOnly: true,
        atomicCollectorSnapshotEstablished: false,
        exclusiveNonAdversarialSameUserExecutionRequired: true,
        sourceCanonicalityIndependentlyVerified: false,
        ergoPowAuthenticated: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
      },
    });
    expect(sourceLock).toMatchObject({
      schema: 'e2s.federated-source-lock-box-evidence.v1',
      box: { boxId: h32('21') },
    });
    expect(ancestry).toMatchObject({
      inclusionHeight: 500,
      targetHeight: 510,
      requiredSuccessorDepth: 10,
    });
    expect(ancestry.pathHeaderIdsHex).toHaveLength(11);
    expect(finality).toMatchObject({
      kind: 'federated_dual_rpc_depth_policy',
      trustModel: 'federated_non_trustless',
      ergoPowAuthenticated: false,
    });
    expect(receipt.evidence.verifierExecutableSha256Hex).toBe(
      receipt.collectorExecutableSha256Hex,
    );
    expect(
      consumeSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceForDraftV1(
        receipt,
        draft as never,
      ),
    ).toBe(receipt.evidence);
    expect(() =>
      consumeSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceForDraftV1(
        receipt,
        draft as never,
      )
    ).toThrow(/already consumed/u);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1Provenance(
        receipt,
      )
    ).not.toThrow();
  });

  it('rejects a missing retained transition input before producing evidence', () => {
    const valid = mocks.packet;
    mocks.packet = Object.freeze({
      ...valid,
      transactions: Object.freeze({
        reserveTransition: Object.freeze({
          ...valid.transactions.reserveTransition,
          eip12Tx: Object.freeze({
            ...valid.transactions.reserveTransition.eip12Tx,
            inputs: valid.transactions.reserveTransition.eip12Tx.inputs.slice(0, 2),
          }),
        }),
      }),
    });

    expect(() => collect(mintDraft())).toThrow(/retained transition inputs are incomplete/u);
  });

  it('rejects stale ancestry and reserve-lineage substitutions', () => {
    const stale = observation();
    mocks.observation = Object.freeze({
      ...stale,
      finalityTargetHeight: 509,
    });
    expect(() => collect(mintDraft())).toThrow(/checkpoint ancestry is stale/u);

    mocks.observation = observation();
    const valid = mocks.packet;
    mocks.packet = Object.freeze({
      ...valid,
      reserve: Object.freeze({
        ...valid.reserve,
        outputLiabilityNanoErg: '9999999',
      }),
    });
    expect(() => collect(mintDraft())).toThrow(/lineage differs/u);
  });

  it('compares the raw WASM reserve digest with the canonical V4 statement bytes', () => {
    const valid = mocks.packet;
    const draft = mintDraft();
    mocks.packet = Object.freeze({
      ...valid,
      reserve: Object.freeze({
        ...valid.reserve,
        outputDigestHex: valid.reserve.outputDigestHex.slice(2),
      }),
    });

    expect(() => collect(draft)).not.toThrow();

    const changedDigestDraft = mintDraft();
    mocks.packet = Object.freeze({
      ...mocks.packet,
      reserve: Object.freeze({
        ...mocks.packet.reserve,
        outputDigestHex: `02${mocks.packet.reserve.outputDigestHex.slice(2)}`,
      }),
    });
    expect(() => collect(changedDigestDraft)).toThrow(/lineage differs/u);
  });

  it('rejects copied receipts, cross-campaign drafts, and caller evidence fields', () => {
    const draft = mintDraft();
    const receipt = collect(draft);
    const otherDraft = mintDraft('ff');

    expect(() =>
      assertSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1Provenance(
        structuredClone(receipt),
      )
    ).toThrow(/lacks process provenance/u);
    expect(() =>
      consumeSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceForDraftV1(
        receipt,
        otherDraft as never,
      )
    ).toThrow(/different mint-reservation draft/u);
    expect(() => collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV1({
      draft,
      batch: BATCH as never,
      target: TARGET as never,
      candidate: CANDIDATE as never,
      committedVaultObservation: mocks.observation as never,
      evidence: Object.freeze({}) as never,
    } as never)).toThrow(/must contain exactly/u);
  });
});

function collect(draft: ReturnType<typeof mintDraft>) {
  return collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV1({
    draft: draft as never,
    batch: BATCH as never,
    target: TARGET as never,
    candidate: CANDIDATE as never,
    committedVaultObservation: mocks.observation as never,
  });
}

function prepareV2Packet() {
  mocks.packet = Object.freeze({ ...packet(), version: 2, familyCompiler: COMPILER_V2,
    sourceIntentHex: encodePegInSourceIntentV2Hex({
      formatVersion: 2, sourceNetworkIdHex: h32('01'), sidechainIdHex: h32('02'),
      bridgeAddressHex: `0x${'03'.repeat(20)}`, tokenAddressHex: `0x${'04'.repeat(20)}`,
      settlementProfileIdHex: h32('05'), admissionProfileIdHex: mocks.packet.familyIdHex,
      sourceAssetIdHex: h32('00'), amountNanoErg: '10000000', recipientAddressHex: `0x${'06'.repeat(20)}`,
    }),
  });
}

function v2Input() {
  prepareV2Packet();
  const observed = { batch: BATCH as never, target: TARGET as never,
    candidate: CANDIDATE_V2 as never, committedVaultObservation: mocks.observation as never };
  return { ...observed, draft: buildDraftV2(observed) };
}

function nativeInput(mutableLineage = false) {
  prepareV2Packet();
  const input = {
    batch: Object.freeze({ profile: 'fed-native-height-zero-v1',
      request: Object.freeze({ requestDigestHex: h32('81') }),
      receipt: Object.freeze({ receiptDigestHex: h32('82') }) }),
    target: Object.freeze({ ...TARGET }), packet: mutableLineage ? structuredClone(mocks.packet) : mocks.packet,
    committedVaultObservation: mutableLineage ? structuredClone(observation()) : observation(),
  } as unknown as SubstrateFederatedNativeGenesisPegInMintReservationDraftV1Input;
  mocks.nativeMaterials.push({ batch: input.batch, target: input.target, packet: input.packet,
    observation: input.committedVaultObservation });
  return { ...input, draft: buildNativeDraft(input) };
}

describe('native genesis committed-reserve evidence join', () => {
  it('collects unchanged evidence schemas and returns the exact bytes once from a real native draft', () => {
    const input = nativeInput();
    const receipt = collectNative(input);
    const legacyInput = { batch: BATCH as never, target: TARGET as never, candidate: CANDIDATE_V2 as never,
      committedVaultObservation: mocks.observation };
    const legacy = collectV2({ ...legacyInput, draft: buildDraftV2(legacyInput) });
    expect(receipt.schema).toBe('e2s.substrate-federated-native-genesis-committed-reserve-evidence.v1');
    expect(receipt.provenance).toBe(input.draft.provenance);
    expect(receipt).not.toHaveProperty('candidateDigestHex');
    expect(receipt.receiptDigestHex).not.toBe(legacy.receiptDigestHex);
    expect(receipt.evidence).toEqual(legacy.evidence);
    expect(receipt.evidenceDigestHex).toBe(legacy.evidenceDigestHex);
    expect(receipt.boundaries).toEqual(legacy.boundaries);
    expect(Object.isFrozen(receipt.evidence)).toBe(true);
    expect(decodeCanonicalObject(receipt.evidence.sourceLockBoxCanonicalHex).box).toEqual(input.packet.boxes.sourceLock);
    expect(decodeCanonicalObject(receipt.evidence.reserveTransitionTransactionCanonicalHex).transaction)
      .toEqual(input.packet.transactions.reserveTransition.eip12Tx);
    expect(decodeCanonicalObject(receipt.evidence.successorReserveBoxCanonicalHex).box)
      .toEqual(input.packet.boxes.reserveSuccessor);
    expect(decodeCanonicalObject(receipt.evidence.checkpointAncestryCanonicalHex).pathHeaderIdsHex)
      .toEqual(input.committedVaultObservation.finalityPathHeaderIdsHex);
    expect(() => assertNativeReceipt(receipt)).not.toThrow();
    expect(consumeNative(receipt, input.draft)).toBe(receipt.evidence);
    expect(() => consumeNative(receipt, input.draft)).toThrow(/already consumed/);
  });

  it.each(['batch', 'target', 'packet', 'committedVaultObservation', 'draft'] as const)(
    'rejects cloned %s at collection', field => {
      const input = nativeInput();
      expect(() => collectNative({ ...input, [field]: structuredClone(input[field]) })).toThrow(/original|provenance/);
    },
  );

  it.each(['batch', 'target', 'packet', 'committedVaultObservation', 'draft'] as const)(
    'rejects mixed original %s even with identical public bytes', field => {
      const first = nativeInput();
      const second = nativeInput();
      expect(first[field]).toEqual(second[field]);
      expect(first[field]).not.toBe(second[field]);
      expect(() => collectNative({ ...first, [field]: second[field] })).toThrow(/original|provenance/);
      expect(() => collectNative(first)).not.toThrow();
    },
  );

  it.each(['setup', 'target'] as const)('rejects disposed %s custody at collection and consumption', kind => {
    const input = nativeInput();
    const receipt = collectNative(input);
    if (kind === 'setup') mocks.setupActive = false;
    else mocks.targetActive = false;
    expect(() => collectNative(input)).toThrow(/disposed/);
    expect(() => assertNativeReceipt(receipt)).toThrow(/disposed/);
    expect(() => consumeNative(receipt, input.draft)).toThrow(/disposed/);
  });

  it.each(Object.keys(COMPILER_V2) as Array<keyof typeof COMPILER_V2>)(
    'rejects retained compiler drift at both boundaries: %s', field => {
      const input = nativeInput(true);
      const receipt = collectNative(input);
      const compiler = input.packet.familyCompiler as Record<string, string>;
      compiler[field] = h32('ff');
      expect(() => collectNative(input)).toThrow(/lineage changed/);
      expect(() => consumeNative(receipt, input.draft)).toThrow(/lineage changed/);
      compiler[field] = COMPILER_V2[field];
      expect(consumeNative(receipt, input.draft)).toBe(receipt.evidence);
    },
  );

  it.each([
    ['family', (p: any) => { p.familyIdHex = h32('ff'); }],
    ['source-lock', (p: any) => { p.boxes.sourceLock.boxId = h32('ff'); }],
    ['successor', (p: any) => { p.boxes.reserveSuccessor.boxId = h32('ff'); }],
    ['reserve-digest', (p: any) => { p.reserve.outputDigestHex = `0x01${'ff'.repeat(32)}`; }],
    ['liability', (p: any) => { p.reserve.outputLiabilityNanoErg = '10000001'; }],
    ['deposit-commitment', (p: any) => { p.depositCommitmentHex = h32('ff'); }],
    ['transaction-id', (p: any) => { p.transactions.reserveTransition.txId = h32('ff'); }],
    ['transaction-body', (p: any) => { p.transactions.reserveTransition.eip12Tx.inputs.pop(); }],
  ] as const)('rejects retained %s drift at collection and consumption', (_field, mutate) => {
    const input = nativeInput(true);
    const receipt = collectNative(input);
    mutate(input.packet);
    expect(() => collectNative(input)).toThrow(/lineage|admission/);
    expect(() => consumeNative(receipt, input.draft)).toThrow(/lineage|admission/);
  });

  it.each([
    ['transaction-id', (o: any) => { o.expectedTxId = h32('ff'); }],
    ['successor-id', (o: any) => { o.reserveSuccessorBoxIdHex = h32('ff'); }],
    ['inclusion-height', (o: any) => { o.confirmationHeight += 1; }],
    ['inclusion-header', (o: any) => { o.confirmationHeaderIdHex = h32('ff'); }],
    ['target-height', (o: any) => { o.finalityTargetHeight -= 1; }],
    ['target-header', (o: any) => { o.finalityTargetHeaderIdHex = h32('ff'); }],
    ['depth', (o: any) => { o.requiredSuccessorDepth -= 1; }],
    ['path-length', (o: any) => { o.finalityPathHeaderIdsHex.pop(); }],
    ['path-start', (o: any) => { o.finalityPathHeaderIdsHex[0] = h32('ff'); }],
    ['path-end', (o: any) => { o.finalityPathHeaderIdsHex[10] = h32('ff'); }],
    ['tip-height', (o: any) => { o.observedTipHeight = 509; }],
  ] as const)('rejects observed %s drift at collection and consumption', (_field, mutate) => {
    const input = nativeInput(true);
    const receipt = collectNative(input);
    mutate(input.committedVaultObservation);
    expect(() => collectNative(input)).toThrow(/lineage|ancestry|depth/);
    expect(() => consumeNative(receipt, input.draft)).toThrow(/lineage|ancestry|depth/);
  });

  it('rejects copied receipts, copied drafts and a second real identical draft without burning the receipt', () => {
    const input = nativeInput();
    const receipt = collectNative(input);
    const { draft: _draft, ...originals } = input;
    const otherDraft = buildNativeDraft(originals);
    expect(otherDraft).toEqual(input.draft);
    expect(() => consumeNative(receipt, otherDraft)).toThrow(/different mint-reservation draft/);
    expect(() => consumeNative(receipt, structuredClone(input.draft))).toThrow(/provenance/);
    expect(() => consumeNative(structuredClone(receipt), input.draft)).toThrow(/provenance/);
    expect(consumeNative(receipt, input.draft)).toBe(receipt.evidence);
  });

  it('rejects historical drafts and receipts in both directions', () => {
    const legacyV1Draft = mintDraft();
    const legacyV1Receipt = collect(legacyV1Draft);
    const legacyInput = v2Input();
    const legacyV2Receipt = collectV2(legacyInput);
    const input = nativeInput();
    const receipt = collectNative(input);
    for (const draft of [legacyV1Draft, legacyInput.draft]) {
      expect(() => collectNative({ ...input, draft: draft as never })).toThrow(/provenance/);
      expect(() => consumeNative(receipt, draft as never)).toThrow(/provenance/);
    }
    for (const oldReceipt of [legacyV1Receipt, legacyV2Receipt]) {
      expect(() => assertNativeReceipt(oldReceipt)).toThrow(/provenance/);
      expect(() => consumeNative(oldReceipt as never, input.draft)).toThrow(/provenance/);
    }
    expect(() => assertSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1Provenance(receipt))
      .toThrow(/provenance/);
    expect(() => consumeV2(receipt as never, input.draft as never)).toThrow(/provenance/);
    expect(() => consumeSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceForDraftV1(receipt as never, input.draft as never))
      .toThrow(/provenance/);
    expect(consumeNative(receipt, input.draft)).toBe(receipt.evidence);
  });

  it.each(['batch', 'target', 'packet', 'committedVaultObservation', 'draft'] as const)(
    'rejects %s getters before evaluating them', field => {
      const input = nativeInput();
      const getter = vi.fn(() => input[field]);
      Object.defineProperty(input, field, { enumerable: true, get: getter });
      expect(() => collectNative(input)).toThrow(/must contain exactly/);
      expect(getter).not.toHaveBeenCalled();
    },
  );

  it.each(['evidence', 'hidden', 'symbol', 'prototype'] as const)('rejects caller-supplied %s', fault => {
    const input = nativeInput();
    if (fault === 'evidence') Object.assign(input, { evidence: {} });
    if (fault === 'hidden') Object.defineProperty(input, 'extra', { value: true });
    if (fault === 'symbol') Object.defineProperty(input, Symbol('extra'), { value: true });
    if (fault === 'prototype') Object.setPrototypeOf(input, { inherited: true });
    expect(() => collectNative(input)).toThrow(/must contain exactly|own-data|plain object/);
  });
});

describe('isolated-devnet committed-reserve evidence collector V2', () => {
  it('collects generic V1 evidence from a real V2 draft and consumes it exactly once', () => {
    const input = v2Input();
    const receipt = collectV2(input);
    expect(receipt).toMatchObject({
      schema: 'e2s.substrate-federated-isolated-devnet-committed-reserve-evidence.v1', version: 1,
      mintReservationDraftDigestHex: input.draft.draftDigestHex,
      candidateDigestHex: CANDIDATE_V2.candidateDigestHex,
      boundaries: { mintAuthorized: false, fundsAuthorityEstablished: false, ergoPowAuthenticated: false },
    });
    expect(decodeCanonicalObject(receipt.evidence.sourceLockBoxCanonicalHex).box)
      .toEqual(mocks.packet.boxes.sourceLock);
    expect(decodeCanonicalObject(receipt.evidence.reserveTransitionTransactionCanonicalHex).transaction)
      .toEqual(mocks.packet.transactions.reserveTransition.eip12Tx);
    expect(consumeV2(receipt, input.draft)).toBe(receipt.evidence);
    expect(() => consumeV2(receipt, input.draft)).toThrow(/already consumed/);
  });

  it.each(Object.keys(COMPILER_V2) as Array<keyof typeof COMPILER_V2>)(
    'rejects isolated compiler lineage mismatch: %s', field => {
      const input = v2Input();
      mocks.packet = { ...mocks.packet, familyCompiler: { ...COMPILER_V2, [field]: h32('ff') } };
      expect(() => collectV2(input)).toThrow(/lineage|compiler/);
    },
  );

  it.each(['batch', 'target', 'candidate', 'committedVaultObservation', 'draft'] as const)(
    'rejects copied collection input %s', field => {
      const input = v2Input();
      expect(() => collectV2({ ...input, [field]: structuredClone(input[field]) } as never))
        .toThrow(/provenance/);
    },
  );

  it('rejects a different real draft with identical public bytes without consuming the owner receipt', () => {
    const input = v2Input();
    const receipt = collectV2(input);
    const other = buildDraftV2({ batch: input.batch, target: input.target, candidate: input.candidate,
      committedVaultObservation: input.committedVaultObservation });
    expect(other).toEqual(input.draft);
    expect(other).not.toBe(input.draft);
    expect(() => consumeV2(receipt, other)).toThrow(/different mint-reservation draft/);
    expect(consumeV2(receipt, input.draft)).toBe(receipt.evidence);
  });

  it.each(['copy', 'packet-replaced', 'candidate-revoked'] as const)(
    'revalidates retained receipt identity at consumption: %s', fault => {
      const input = v2Input();
      const receipt = collectV2(input);
      if (fault === 'packet-replaced') mocks.packet = { ...mocks.packet };
      if (fault === 'candidate-revoked') mocks.assertObservationV2.mockImplementation(() => {
        throw new Error('candidate provenance revoked');
      });
      expect(() => consumeV2(fault === 'copy' ? structuredClone(receipt) : receipt, input.draft))
        .toThrow(/provenance|changed/);
    },
  );

  it('rejects both cross-version collectors and consumers despite the shared receipt schema', () => {
    const legacyDraft = mintDraft();
    const legacyReceipt = collect(legacyDraft);
    const legacyPacket = mocks.packet;
    const input = v2Input();
    const receipt = collectV2(input);
    expect(() => collectV2({ ...input, draft: legacyDraft as never })).toThrow(/provenance|version/);
    expect(() => collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV1(input as never))
      .toThrow(/provenance|version/);
    expect(() => consumeSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceForDraftV1(receipt, input.draft as never))
      .toThrow(/provenance|version/);
    expect(() => consumeV2(receipt, legacyDraft as never)).toThrow(/provenance|version/);
    expect(consumeV2(receipt, input.draft)).toBe(receipt.evidence);
    mocks.packet = legacyPacket;
    expect(() => consumeV2(legacyReceipt, legacyDraft as never)).toThrow(/provenance|version/);
    expect(() => consumeV2(legacyReceipt, input.draft)).toThrow(/different|version|provenance/);
    expect(consumeSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceForDraftV1(legacyReceipt, legacyDraft as never))
      .toBe(legacyReceipt.evidence);
  });
});

describe.each([1, 2] as const)('collector V%s original input descriptors', version => {
  function validInput() {
    return version === 2 ? v2Input() : {
      draft: mintDraft(), batch: BATCH, target: TARGET, candidate: CANDIDATE,
      committedVaultObservation: mocks.observation,
    };
  }

  const collector = version === 2 ? collectV2 : collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV1;

  it.each(['batch', 'candidate', 'committedVaultObservation', 'draft', 'target'] as const)(
    'rejects the original %s getter without invoking it', field => {
      const input = validInput();
      const getter = vi.fn(() => input[field]);
      const supplied = { ...input };
      Object.defineProperty(supplied, field, { enumerable: true, get: getter });
      expect(() => collector(supplied as never)).toThrow(/must contain exactly|data fields/);
      expect(getter).not.toHaveBeenCalled();
    },
  );

  it('rejects an extra non-enumerable own property before snapshotting', () => {
    const input = validInput();
    Object.defineProperty(input, 'extra', { value: true, enumerable: false });
    expect(() => collector(input as never)).toThrow(/must contain exactly|data fields/);
  });

  it.each(['custom-prototype', 'null-prototype'] as const)('rejects %s input rather than laundering it through a spread', kind => {
    const input = Object.assign(Object.create(kind === 'null-prototype' ? null : { inherited: true }), validInput());
    expect(() => collector(input as never)).toThrow(/plain object/);
  });
});

function mintDraft(digestByte = '31') {
  const value = Object.freeze({
    draftDigestHex: h32(digestByte),
    statementIdHex: h32('32'),
    reservationKeyHex: h32('33'),
    provenance: Object.freeze({
      candidateDigestHex: CANDIDATE.candidateDigestHex,
      committedVaultObservationDigestHex:
        mocks.observation.observationDigestHex,
      familyCompilerBindingDigestHex: mocks.packet.familyCompiler.bindingDigestHex,
    }),
    statement: Object.freeze({
      lineageProfileIdHex: mocks.packet.familyIdHex,
      sourceLockBoxIdHex: mocks.packet.boxes.sourceLock.boxId,
      reserveTransitionTransactionIdHex:
        mocks.packet.transactions.reserveTransition.txId,
      successorReserveBoxIdHex: mocks.packet.boxes.reserveSuccessor.boxId,
      successorReserveDigestHex:
        `0x${mocks.packet.reserve.outputDigestHex.replace(/^0x/u, '')}`,
      successorReserveLiabilityNanoErg:
        digestByte === 'ff'
          ? mocks.packet.reserve.outputLiabilityNanoErg
          : '10000000',
      depositCommitmentHex: mocks.packet.depositCommitmentHex,
      inclusionHeaderIdHex: mocks.observation.confirmationHeaderIdHex,
      inclusionHeight: mocks.observation.confirmationHeight,
      targetHeaderIdHex: mocks.observation.finalityTargetHeaderIdHex,
      targetHeight: mocks.observation.finalityTargetHeight,
      requiredSuccessorDepth: mocks.observation.requiredSuccessorDepth,
      ergoDepositFinalityPolicyIdHex: h32('34'),
    }),
  });
  mocks.drafts.add(value);
  return value;
}

function observation() {
  const path = Array.from({ length: 11 }, (_, index) => h32(
    (0x40 + index).toString(16).padStart(2, '0'),
  ));
  return Object.freeze({
    expectedTxId: h32('22'),
    sourceLockBoxIdHex: h32('21'),
    reserveSuccessorBoxIdHex: h32('26'),
    confirmationHeight: 500,
    confirmationHeaderIdHex: path[0],
    confirmationObservationDigestHex: h32('51'),
    finalityTargetHeight: 510,
    finalityTargetHeaderIdHex: path.at(-1),
    requiredSuccessorDepth: 10,
    finalityPathHeaderIdsHex: Object.freeze(path),
    observedTipHeight: 512,
    observedTipHeaderIdHex: h32('52'),
    processBindingDigestHex: h32('53'),
    executionTargetIdentityDigestHex: h32('54'),
    primaryObservationDigestHex: h32('55'),
    witnessObservationDigestHex: h32('56'),
    observationDigestHex: h32('57'),
  });
}

function packet() {
  const reservePredecessor = box('20', '60', 0);
  const sourceLock = box('21', '61', 0);
  const transitionFeeFunding = box('23', '61', 1);
  const reserveSuccessor = box('26', '22', 0);
  return Object.freeze({
    familyIdHex: h32('10'),
    familyCompiler: Object.freeze({ bindingDigestHex: h32('12') }),
    depositCommitmentHex: h32('13'),
    reserve: Object.freeze({
      outputDigestHex: `0x01${'14'.repeat(32)}`,
      outputLiabilityNanoErg: '10000000',
    }),
    boxes: Object.freeze({
      sourceLock,
      reservePredecessor,
      transitionFeeFunding,
      reserveSuccessor,
    }),
    transactions: Object.freeze({
      reserveTransition: Object.freeze({
        txId: h32('22'),
        eip12Tx: Object.freeze({
          inputs: Object.freeze([
            Object.freeze({ ...reservePredecessor, extension: Object.freeze({}) }),
            Object.freeze({ ...sourceLock, extension: Object.freeze({}) }),
            Object.freeze({ ...transitionFeeFunding, extension: Object.freeze({}) }),
          ]),
          dataInputs: Object.freeze([]),
          outputs: Object.freeze([{
            value: reserveSuccessor.value,
            ergoTree: reserveSuccessor.ergoTree,
            assets: reserveSuccessor.assets,
            additionalRegisters: reserveSuccessor.additionalRegisters,
            creationHeight: reserveSuccessor.creationHeight,
          }]),
        }),
        outputs: Object.freeze([reserveSuccessor]),
      }),
    }),
  });
}

function box(idByte: string, txByte: string, index: number) {
  return Object.freeze({
    boxId: h32(idByte),
    value: '10000000',
    ergoTree: '0008cd02' + '11'.repeat(33),
    assets: Object.freeze([]),
    additionalRegisters: Object.freeze({}),
    creationHeight: 490,
    transactionId: h32(txByte),
    index,
  });
}

function decodeCanonicalObject(value: string): any {
  return JSON.parse(Buffer.from(value.slice(2), 'hex').toString('utf8'));
}
