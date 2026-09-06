import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCandidate: vi.fn(),
  assertCandidateV2: vi.fn(),
  assertConfirmation: vi.fn(),
  reobserveConfirmation: vi.fn(),
  assertTarget: vi.fn(),
  getBox: vi.fn(),
  getBestHeader: vi.fn(),
  normalizeBox: vi.fn(async value => value),
}));

vi.mock('./authenticated-spv-tracker-read-only-node-client.js', () => ({
  AuthenticatedSpvTrackerReadOnlyNodeClient: class {
    readonly origin: string;
    constructor(origin: string) {
      this.origin = origin;
    }
    getBoxByIdOrNull(boxId: string) {
      return mocks.getBox(this.origin, boxId);
    }
    getBestHeader() {
      return mocks.getBestHeader(this.origin);
    }
  },
}));
vi.mock('./substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1:
    mocks.assertTarget,
}));
vi.mock('./substrate-federated-isolated-devnet-peg-in-candidate-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV1:
    mocks.assertCandidate,
}));
vi.mock('./substrate-federated-isolated-devnet-peg-in-candidate-v2.js', () => ({
  assertSubstrateFederatedIsolatedDevnetPegInCandidateV2: mocks.assertCandidateV2,
}));
vi.mock('./substrate-federated-isolated-devnet-genesis-confirmation-observer-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1:
    mocks.assertConfirmation,
  reobserveSubstrateFederatedIsolatedDevnetGenesisConfirmationArtifactV1:
    mocks.reobserveConfirmation,
}));
vi.mock('./unsigned-ergo-transaction.js', () => ({
  normalizeEip12Box: mocks.normalizeBox,
}));

import {
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1,
  observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1,
  observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV2,
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationForCandidateV2,
} from './substrate-federated-isolated-devnet-peg-in-source-lock-output-observer-v1.js';

const hex = (byte: string): string => byte.repeat(32);
const PRIMARY = 'http://127.0.0.1:9051';
const WITNESS = 'http://127.0.0.1:9052';
const SOURCE_ID = hex('11');
const LOCK_ID = hex('12');
const FEE_ID = hex('13');
const TX_ID = hex('14');
const GENESIS_ID = hex('17');
const CONFIRMATION_HEADER_ID = hex('18');
const BINDING = Object.freeze({
  processBindingDigestHex: hex('15'),
  executionTargetIdentityDigestHex: hex('16'),
});
const TARGET = Object.freeze({
  primaryNodeOrigin: PRIMARY,
  witnessNodeOrigin: WITNESS,
  primaryMining: true,
  witnessReadOnly: true,
});
const BATCH = Object.freeze({
  request: Object.freeze({
    target: Object.freeze({ genesisHeaderIdHex: GENESIS_ID }),
  }),
});
const SOURCE_LOCK = Object.freeze({ boxId: LOCK_ID, value: '100' });
const TRANSITION_FEE = Object.freeze({ boxId: FEE_ID, value: '10' });
const PACKET = Object.freeze({
  boxes: Object.freeze({
    sourceFundingInput: Object.freeze({ boxId: SOURCE_ID }),
    sourceLock: SOURCE_LOCK,
    transitionFeeFunding: TRANSITION_FEE,
  }),
  transactions: Object.freeze({
    sourceLockCreation: Object.freeze({ txId: TX_ID }),
  }),
});
const CANDIDATE = Object.freeze({});
const CONFIRMATION = Object.freeze({
  status: 'confirmed' as const,
  expectedTxId: TX_ID,
  observedTxId: TX_ID,
  confirmations: 10,
  confirmationHeight: 200,
  observedAtHeight: 210,
  confirmationHeaderIdHex: CONFIRMATION_HEADER_ID,
  observationDigestHex: hex('19'),
  observerArtifact: Object.freeze({ role: 'confirmation' }),
});
const REFRESHED_CONFIRMATION = Object.freeze({
  ...CONFIRMATION,
  observationDigestHex: hex('1a'),
  observerArtifact: Object.freeze({ role: 'refreshed-confirmation' }),
});
const FINAL_CONFIRMATION = Object.freeze({
  ...REFRESHED_CONFIRMATION,
  confirmations: 11,
  observedAtHeight: 211,
  observationDigestHex: hex('1b'),
  observerArtifact: Object.freeze({ role: 'final-confirmation' }),
});
const STABLE_TIP = Object.freeze({ height: 211, id: hex('ab') });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertTarget.mockImplementation(value => {
    if (value !== TARGET) throw new Error('target provenance missing');
    return BINDING;
  });
  mocks.assertCandidate.mockImplementation((candidate, batch, target) => {
    if (candidate !== CANDIDATE || batch !== BATCH || target !== TARGET) {
      throw new Error('candidate provenance missing');
    }
    return PACKET;
  });
  mocks.assertConfirmation.mockImplementation(
    (artifact, identity, genesis, expectedTxId, confirmation) => {
      if (
        artifact !== CONFIRMATION.observerArtifact
        || identity !== BINDING.executionTargetIdentityDigestHex
        || genesis !== GENESIS_ID
        || expectedTxId !== TX_ID
        || confirmation.status !== 'confirmed'
        || confirmation.confirmationHeight !== 200
        || confirmation.confirmationHeaderIdHex !== CONFIRMATION_HEADER_ID
      ) {
        throw new Error('confirmation provenance missing');
      }
    },
  );
  mocks.reobserveConfirmation.mockReset().mockImplementation(async input => {
    if (input.artifact !== input.priorConfirmation.observerArtifact
      || input.expectedReconciliationIdentityDigestHex !== BINDING.executionTargetIdentityDigestHex
      || input.expectedTargetGenesisHeaderIdHex !== GENESIS_ID || input.expectedTxId !== TX_ID) {
      throw new Error('confirmation reobservation binding changed');
    }
    if (input.artifact === CONFIRMATION.observerArtifact) return REFRESHED_CONFIRMATION;
    if (input.artifact === REFRESHED_CONFIRMATION.observerArtifact) return FINAL_CONFIRMATION;
    throw new Error('confirmation reobservation predecessor changed');
  });
  mocks.getBestHeader.mockReset().mockReturnValue(STABLE_TIP);
  mocks.getBox.mockImplementation((_origin: string, boxId: string) => {
    if (boxId === SOURCE_ID) return null;
    if (boxId === LOCK_ID) return SOURCE_LOCK;
    if (boxId === FEE_ID) return TRANSITION_FEE;
    throw new Error('unexpected box');
  });
});

describe('isolated source-lock V2 candidate boundary (mocked provenance and node fields)', () => {
  const candidateV2 = Object.freeze({ ...CANDIDATE, version: 2 });
  const batchV3 = Object.freeze({ ...BATCH, version: 3 });
  const input = () => ({
    target: TARGET as never, batch: batchV3 as never,
    candidate: candidateV2 as never, confirmation: CONFIRMATION as never,
  });
  const observe = observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV2;
  const assertBound = assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationForCandidateV2;

  beforeEach(() => {
    mocks.assertCandidateV2.mockImplementation((candidate, batch, target) => {
      if (candidate !== candidateV2 || batch !== batchV3 || target !== TARGET) {
        throw new Error('V2 candidate provenance missing');
      }
      return PACKET;
    });
  });

  it('retains V1 observation semantics with an exact V2 candidate and V3 setup binding', async () => {
    const observation = await observe(input());
    expect(observation.version).toBe(1);
    expect(observation.schema).toBe(
      'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-output-observation.v1',
    );
    expect(() => assertBound(observation, batchV3 as never, candidateV2 as never, TARGET as never)).not.toThrow();
    expect(mocks.assertCandidate).not.toHaveBeenCalled();
    expect(mocks.assertCandidateV2).toHaveBeenCalledWith(candidateV2, batchV3, TARGET);
  });

  it('brackets every box read with canonical refreshes and all four node-head snapshots', async () => {
    const observation = await observe(input());
    expect(observation).toMatchObject({
      confirmationHeight: FINAL_CONFIRMATION.confirmationHeight,
      confirmationHeaderIdHex: FINAL_CONFIRMATION.confirmationHeaderIdHex,
      confirmationObservationDigestHex: FINAL_CONFIRMATION.observationDigestHex,
    });
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(2);
    expect(mocks.getBestHeader.mock.calls).toEqual([[PRIMARY], [WITNESS], [PRIMARY], [WITNESS]]);
    expect(mocks.getBox).toHaveBeenCalledTimes(6);
    const [initial, latest] = mocks.reobserveConfirmation.mock.invocationCallOrder;
    const [primaryBefore, witnessBefore, primaryAfter, witnessAfter] = mocks.getBestHeader.mock.invocationCallOrder;
    expect(initial).toBeLessThan(primaryBefore!);
    expect(primaryBefore).toBeLessThan(witnessBefore!);
    expect(witnessBefore).toBeLessThan(Math.min(...mocks.getBox.mock.invocationCallOrder));
    expect(Math.max(...mocks.getBox.mock.invocationCallOrder)).toBeLessThan(latest!);
    expect(latest).toBeLessThan(primaryAfter!);
    expect(primaryAfter).toBeLessThan(witnessAfter!);
  });

  it('accepts an already re-included initial refresh and returns the latest canonical fields', async () => {
    const initial = Object.freeze({ ...REFRESHED_CONFIRMATION,
      confirmationHeight: 201, confirmationHeaderIdHex: hex('cd'), confirmations: 9,
      observationDigestHex: hex('21'), observerArtifact: Object.freeze({ role: 're-included' }),
    });
    const latest = Object.freeze({ ...initial, confirmations: 10, observedAtHeight: STABLE_TIP.height,
      observationDigestHex: hex('22'), observerArtifact: Object.freeze({ role: 'latest-re-included' }),
    });
    mocks.reobserveConfirmation.mockResolvedValueOnce(initial).mockResolvedValueOnce(latest);
    const observation = await observe(input());
    expect(observation).toMatchObject({ confirmationHeight: 201, confirmationHeaderIdHex: hex('cd'),
      confirmationObservationDigestHex: latest.observationDigestHex });
    expect(mocks.reobserveConfirmation).toHaveBeenNthCalledWith(2, {
      artifact: initial.observerArtifact, priorConfirmation: initial,
      expectedReconciliationIdentityDigestHex: BINDING.executionTargetIdentityDigestHex,
      expectedTargetGenesisHeaderIdHex: GENESIS_ID, expectedTxId: TX_ID,
    });
    expect(() => assertBound(observation, batchV3 as never, candidateV2 as never, TARGET as never)).not.toThrow();
  });

  it.each([
    ['confirmationHeight', 201], ['confirmationHeaderIdHex', hex('cd')],
  ] as const)('rejects isolated %s re-inclusion during output reads', async (field, value) => {
    mocks.reobserveConfirmation.mockResolvedValueOnce(REFRESHED_CONFIRMATION)
      .mockResolvedValueOnce({ ...FINAL_CONFIRMATION, [field]: value });
    await expect(observe(input())).rejects.toThrow(/canonical inclusion changed during observation/);
    expect(mocks.getBox).toHaveBeenCalledTimes(6);
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(2);
  });

  it.each(['initial', 'final'] as const)('rejects a disappeared transaction at the %s canonical refresh', async phase => {
    const missing = Object.freeze({ ...FINAL_CONFIRMATION, status: 'not_found', observedTxId: null,
      confirmations: 0, confirmationHeight: null, confirmationHeaderIdHex: null });
    if (phase === 'final') mocks.reobserveConfirmation.mockResolvedValueOnce(REFRESHED_CONFIRMATION);
    mocks.reobserveConfirmation.mockResolvedValueOnce(missing);
    await expect(observe(input())).rejects.toThrow(/requires refreshed canonical confirmation/);
    expect(mocks.getBox).toHaveBeenCalledTimes(phase === 'initial' ? 0 : 6);
  });

  it.each([
    ['witness-before', 1, 'id', hex('cd')],
    ['primary-after replacement', 2, 'id', hex('cd')],
    ['witness-after replacement', 3, 'id', hex('cd')],
    ['primary-after height advance', 2, 'height', 212],
    ['witness-after height advance', 3, 'height', 212],
  ] as const)('rejects an isolated %s against the stable primary-before head', async (_label, ordinal, field, value) => {
    let reads = 0;
    mocks.getBestHeader.mockImplementation(() => reads++ === ordinal ? { ...STABLE_TIP, [field]: value } : STABLE_TIP);
    await expect(observe(input())).rejects.toThrow(/requires one stable dual-node tip/);
    expect(mocks.getBestHeader).toHaveBeenCalledTimes(4);
    expect(mocks.getBox).toHaveBeenCalledTimes(6);
  });

  it.each([
    ['initial ahead', 212, 211], ['final behind', 210, 210], ['final ahead', 210, 212],
  ] as const)('rejects the %s confirmation snapshot independently of inclusion and node-head agreement', async (_label, initialHeight, finalHeight) => {
    mocks.reobserveConfirmation
      .mockResolvedValueOnce({ ...REFRESHED_CONFIRMATION, observedAtHeight: initialHeight })
      .mockResolvedValueOnce({ ...FINAL_CONFIRMATION, observedAtHeight: finalHeight });
    await expect(observe(input())).rejects.toThrow(/confirmation snapshots differ from the stable output tip/);
    expect(mocks.getBestHeader).toHaveBeenCalledTimes(4);
    expect(mocks.getBox).toHaveBeenCalledTimes(6);
  });

  it.each([
    ['zero height', { ...STABLE_TIP, height: 0 }],
    ['fractional height', { ...STABLE_TIP, height: 211.5 }],
    ['unsafe height', { ...STABLE_TIP, height: Number.MAX_SAFE_INTEGER + 1 }],
    ['uppercase ID', { ...STABLE_TIP, id: STABLE_TIP.id.toUpperCase() }],
    ['short ID', { ...STABLE_TIP, id: 'ab' }],
  ] as const)('rejects a noncanonical %s before reading outputs', async (_label, tip) => {
    mocks.getBestHeader.mockReturnValueOnce(tip);
    await expect(observe(input())).rejects.toThrow(/requires a canonical positive-height tip/);
    expect(mocks.getBox).not.toHaveBeenCalled();
  });

  it.each(['V1 candidate', 'copied candidate', 'V1 setup', 'copied target'] as const)(
    'rejects %s at entry before reading node fields', async fault => {
      const supplied = input();
      if (fault === 'V1 candidate') supplied.candidate = CANDIDATE as never;
      if (fault === 'copied candidate') supplied.candidate = { ...candidateV2 } as never;
      if (fault === 'V1 setup') supplied.batch = BATCH as never;
      if (fault === 'copied target') supplied.target = { ...TARGET } as never;
      await expect(observe(supplied)).rejects.toThrow(/provenance/);
      expect(mocks.getBox).not.toHaveBeenCalled();
    },
  );

  it('keeps the old entrypoint strictly V1', async () => {
    await expect(observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1(input())).rejects.toThrow(/candidate provenance/);
    expect(mocks.assertCandidateV2).not.toHaveBeenCalled();
    expect(mocks.getBox).not.toHaveBeenCalled();
  });

  it.each(['candidate', 'batch', 'copied observation', 'V1 observation'] as const)(
    'rejects %s substitution even when packet bytes agree', async fault => {
      const observation = fault === 'V1 observation'
        ? await observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1({
          target: TARGET as never, batch: BATCH as never,
          candidate: CANDIDATE as never, confirmation: CONFIRMATION as never,
        })
        : await observe(input());
      const otherCandidate = Object.freeze({ ...candidateV2 });
      const otherBatch = Object.freeze({ ...batchV3 });
      // Model a separately valid identity with identical packet bytes.
      mocks.assertCandidateV2.mockImplementation((candidate, batch, target) => {
        if (![candidateV2, otherCandidate].includes(candidate)
          || ![batchV3, otherBatch].includes(batch) || target !== TARGET) {
          throw new Error('V2 candidate provenance missing');
        }
        return PACKET;
      });
      expect(() => assertBound(
        fault === 'copied observation' ? { ...observation } : observation,
        (fault === 'batch' ? otherBatch : batchV3) as never,
        (fault === 'candidate' ? otherCandidate : candidateV2) as never,
        TARGET as never,
      )).toThrow(/provenance|candidate|binding/);
    },
  );

  it.each(['processBindingDigestHex', 'executionTargetIdentityDigestHex'] as const)(
    'rejects %s drift during asynchronous output normalization', async field => {
      mocks.normalizeBox.mockImplementationOnce(async value => {
        mocks.assertTarget.mockReturnValue({ ...BINDING, [field]: hex('ee') });
        return value;
      });
      await expect(observe(input())).rejects.toThrow(/target changed|binding|provenance/);
    },
  );

  it.each(['processBindingDigestHex', 'executionTargetIdentityDigestHex'] as const)(
    'rejects %s drift when consuming a retained observation', async field => {
      const observation = await observe(input());
      mocks.assertTarget.mockReturnValue({ ...BINDING, [field]: hex('ee') });
      expect(() => assertBound(observation, batchV3 as never, candidateV2 as never, TARGET as never))
        .toThrow(/provenance|binding/);
    },
  );

  it('rechecks candidate provenance after asynchronous node reads', async () => {
    mocks.normalizeBox.mockImplementationOnce(async value => {
      mocks.assertCandidateV2.mockImplementation(() => { throw new Error('V2 candidate revoked after read'); });
      return value;
    });
    await expect(observe(input())).rejects.toThrow(/V2 candidate revoked after read/);
  });

  it('retains the original outer input tuple across asynchronous reads', async () => {
    const supplied = input();
    mocks.normalizeBox.mockImplementationOnce(async value => {
      supplied.candidate = { ...candidateV2 } as never;
      supplied.batch = { ...batchV3 } as never;
      supplied.target = { ...TARGET } as never;
      return value;
    });
    const observation = await observe(supplied);
    expect(() => assertBound(observation, batchV3 as never, candidateV2 as never, TARGET as never)).not.toThrow();
    for (const call of mocks.assertCandidateV2.mock.calls) {
      expect(call).toEqual([candidateV2, batchV3, TARGET]);
      expect(call[0]).toBe(candidateV2);
      expect(call[1]).toBe(batchV3);
      expect(call[2]).toBe(TARGET);
    }
  });

  it('reads getter-backed candidate and target slots once into the retained snapshot', async () => {
    let candidateReads = 0;
    let targetReads = 0;
    const supplied = {
      ...input(),
      get candidate() { return (++candidateReads === 1 ? candidateV2 : { ...candidateV2 }) as never; },
      get target() { return (++targetReads === 1 ? TARGET : { ...TARGET }) as never; },
    };
    const observation = await observe(supplied);
    expect(() => assertBound(observation, batchV3 as never, candidateV2 as never, TARGET as never)).not.toThrow();
    expect(candidateReads).toBe(1);
    expect(targetReads).toBe(1);
  });

  it('rejects a different packet returned by the post-read candidate guard', async () => {
    mocks.normalizeBox.mockImplementationOnce(async value => {
      mocks.assertCandidateV2.mockReturnValue({ ...PACKET });
      return value;
    });
    await expect(observe(input())).rejects.toThrow(/target changed/);
  });

  it('rejects copied canonical confirmation authority on the V2 route', async () => {
    await expect(observe({
      ...input(), confirmation: { ...CONFIRMATION, observerArtifact: { ...CONFIRMATION.observerArtifact } } as never,
    })).rejects.toThrow(/confirmation provenance/);
    expect(mocks.getBox).not.toHaveBeenCalled();
  });
});

describe('isolated source-lock output observer V1', () => {
  it('also rejects canonical inclusion disappearing during reads on the V1 route', async () => {
    mocks.reobserveConfirmation.mockResolvedValueOnce(REFRESHED_CONFIRMATION)
      .mockResolvedValueOnce({ ...FINAL_CONFIRMATION, status: 'not_found', observedTxId: null,
        confirmations: 0, confirmationHeight: null, confirmationHeaderIdHex: null });
    await expect(observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1({
      target: TARGET as never, batch: BATCH as never, candidate: CANDIDATE as never,
      confirmation: CONFIRMATION as never,
    })).rejects.toThrow(/requires refreshed canonical confirmation/);
    expect(mocks.getBox).toHaveBeenCalledTimes(6);
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(2);
  });

  it('requires both nodes to report the source spent and exact outputs unspent', async () => {
    const observation =
      await observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      });
    expect(observation).toMatchObject({
      status: 'exact_source_spent_and_refundable_outputs_unspent',
      expectedTxId: TX_ID,
      sourceFundingBoxIdHex: SOURCE_ID,
      sourceLockBoxIdHex: LOCK_ID,
      transitionFeeFundingBoxIdHex: FEE_ID,
      confirmationHeight: 200,
      confirmationHeaderIdHex: CONFIRMATION_HEADER_ID,
      boundaries: {
        sourceFundingSpent: true,
        sourceLockStillRefundable: true,
        sourceLockConsumptionEstablished: false,
        reserveLineageEstablished: false,
        mintAuthorized: false,
      },
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1(
        observation,
        TARGET as never,
      )
    ).not.toThrow();
  });

  it('rejects a still-unspent source and a single-node output mutation', async () => {
    mocks.getBox.mockImplementationOnce(() => ({ boxId: SOURCE_ID }));
    await expect(
      observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      }),
    ).rejects.toThrow(/still reports source funding/);

    mocks.getBox.mockImplementation((origin: string, boxId: string) => {
      if (boxId === SOURCE_ID) return null;
      if (boxId === LOCK_ID) {
        return origin === PRIMARY ? SOURCE_LOCK : { ...SOURCE_LOCK, value: '99' };
      }
      if (boxId === FEE_ID) return TRANSITION_FEE;
      return null;
    });
    await expect(
      observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      }),
    ).rejects.toThrow(/output bytes changed/);
  });

  it('rejects a copied observation without process provenance', async () => {
    const observation =
      await observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1(
        { ...observation },
        TARGET as never,
      )
    ).toThrow(/provenance/);
  });

  it('rejects output observation without exact canonical confirmation', async () => {
    await expect(
      observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: {
          ...CONFIRMATION,
          status: 'not_found',
          confirmations: 0,
          confirmationHeight: null,
          confirmationHeaderIdHex: null,
        } as never,
      }),
    ).rejects.toThrow(/requires confirmation/);

    await expect(
      observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: {
          ...CONFIRMATION,
          observerArtifact: { role: 'copied-confirmation' },
        } as never,
      }),
    ).rejects.toThrow(/confirmation provenance missing/);
  });
});
