import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertObservation: vi.fn(),
  drafts: new WeakSet<object>(),
  packet: undefined as any,
  observation: undefined as any,
}));

vi.mock(
  './substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js',
  () => ({
    assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV1:
      mocks.assertObservation,
  }),
);

vi.mock(
  './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js',
  () => ({
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
} from './substrate-federated-isolated-devnet-committed-reserve-evidence-v1.js';

const h32 = (byte: string): string => `0x${byte.repeat(32)}`;
const BATCH = Object.freeze({ role: 'batch' });
const TARGET = Object.freeze({ role: 'target' });
const CANDIDATE = Object.freeze({ candidateDigestHex: h32('11') });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.drafts = new WeakSet<object>();
  mocks.packet = packet();
  mocks.observation = observation();
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
      successorReserveDigestHex: mocks.packet.reserve.outputDigestHex,
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
