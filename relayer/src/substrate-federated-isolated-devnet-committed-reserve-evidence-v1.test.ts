import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertObservation: vi.fn(),
  assertObservationV2: vi.fn(),
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
  }),
);

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
  assertSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceReceiptV1Provenance,
  collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV1,
  consumeSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceForDraftV1,
  collectSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceV2 as collectV2,
  consumeSubstrateFederatedIsolatedDevnetCommittedReserveEvidenceForDraftV2 as consumeV2,
} from './substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js';
import { buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV2 as buildDraftV2 }
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

function v2Input() {
  mocks.packet = Object.freeze({ ...packet(), version: 2, familyCompiler: COMPILER_V2,
    sourceIntentHex: encodePegInSourceIntentV2Hex({
      formatVersion: 2, sourceNetworkIdHex: h32('01'), sidechainIdHex: h32('02'),
      bridgeAddressHex: `0x${'03'.repeat(20)}`, tokenAddressHex: `0x${'04'.repeat(20)}`,
      settlementProfileIdHex: h32('05'), admissionProfileIdHex: mocks.packet.familyIdHex,
      sourceAssetIdHex: h32('00'), amountNanoErg: '10000000', recipientAddressHex: `0x${'06'.repeat(20)}`,
    }),
  });
  const observed = { batch: BATCH as never, target: TARGET as never,
    candidate: CANDIDATE_V2 as never, committedVaultObservation: mocks.observation as never };
  return { ...observed, draft: buildDraftV2(observed) };
}

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
