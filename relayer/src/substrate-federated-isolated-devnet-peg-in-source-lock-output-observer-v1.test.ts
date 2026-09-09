import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCandidate: vi.fn(),
  assertCandidateV2: vi.fn(),
  assertNativePacket: vi.fn(),
  assertReadCustody: vi.fn(),
  assertConfirmation: vi.fn(),
  reobserveConfirmation: vi.fn(),
  assertTarget: vi.fn(),
  getBox: vi.fn(),
  getBestHeader: vi.fn(),
  getHeaders: vi.fn(),
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
    getBlockHeaderIdsAtHeight(height: number) {
      return mocks.getHeaders(this.origin, height);
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
  assertSubstrateFederatedNativeGenesisPegInPacketV1: mocks.assertNativePacket,
  assertSubstrateFederatedNativeGenesisPegInReadCustodyV1: mocks.assertReadCustody,
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
  observeSubstrateFederatedNativeGenesisPegInSourceLockOutputsV1,
  assertSubstrateFederatedNativeGenesisPegInSourceLockOutputObservationV1,
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

describe('native source-lock output observation (mocked packet custody, confirmation, node and normalization)', () => {
  const batch = Object.freeze({ ...BATCH, profile: 'fed-native-height-zero-v1' });
  const lock = Object.freeze({ ...SOURCE_LOCK, creationHeight: 200, transactionId: TX_ID, index: 0,
    ergoTree: '10010100d17300', assets: [], additionalRegisters: {} });
  const fee = Object.freeze({ ...TRANSITION_FEE, creationHeight: 200, transactionId: TX_ID, index: 1,
    ergoTree: '10010100d17300', assets: [], additionalRegisters: {} });
  const packet = Object.freeze({ ...PACKET, boxes: Object.freeze({ ...PACKET.boxes,
    sourceLock: lock, transitionFeeFunding: fee }) });
  const input = () => ({ target: TARGET as never, batch: batch as never, packet: packet as never,
    confirmation: CONFIRMATION as never });
  const observe = observeSubstrateFederatedNativeGenesisPegInSourceLockOutputsV1;
  const assertBound = (observation: Awaited<ReturnType<typeof observe>>) =>
    assertSubstrateFederatedNativeGenesisPegInSourceLockOutputObservationV1(
      observation, TARGET as never, batch as never, packet as never);
  const exactBox = (_origin: string, id: string) => {
    if (id === SOURCE_ID) return null;
    if (id === LOCK_ID) return lock;
    if (id === FEE_ID) return fee;
    throw new Error('unexpected box');
  };
  const tipAt = (height: number) => ({ height, id: height.toString(16).padStart(64, '0') });
  const confirmationAt = (height: number) => Object.freeze({ ...FINAL_CONFIRMATION,
    confirmations: height - 200, observedAtHeight: height });
  const tips = (heights: number[]) => {
    mocks.getHeaders.mockImplementation((_origin, height) =>
      [height === 200 ? CONFIRMATION_HEADER_ID : tipAt(height).id]);
    let ordinal = 0;
    mocks.getBestHeader.mockImplementation(() => {
      const height = heights[ordinal++];
      if (height === undefined) throw new Error('unexpected extra tip read');
      return tipAt(height);
    });
  };

  beforeEach(() => {
    mocks.assertNativePacket.mockReset().mockImplementation((p, b, t) => {
      if (p !== packet || b !== batch || t !== TARGET) throw new Error('native packet provenance missing');
      return packet;
    });
    mocks.assertReadCustody.mockReset().mockImplementation((...args) => mocks.assertNativePacket(...args));
    mocks.getHeaders.mockReset().mockImplementation((_origin, height) =>
      [height === 200 ? CONFIRMATION_HEADER_ID : STABLE_TIP.id]);
    mocks.getBox.mockReset().mockImplementation(exactBox);
    mocks.normalizeBox.mockReset().mockImplementation(async value => value);
  });

  it('binds the exact confirmed funding spend and complete lock/fee boxes on both nodes without mint authority', async () => {
    const observation = await observe(input());
    expect(assertBound(observation)).toBe(packet);
    expect(observation).toMatchObject({ expectedTxId: TX_ID, sourceFundingBoxIdHex: SOURCE_ID,
      sourceLockBoxIdHex: LOCK_ID, transitionFeeFundingBoxIdHex: FEE_ID,
      confirmationHeight: 200, confirmationHeaderIdHex: CONFIRMATION_HEADER_ID,
      confirmationObservationDigestHex: FINAL_CONFIRMATION.observationDigestHex,
      boundaries: { sourceFundingSpent: true, sourceLockUnspentAndExact: true,
        transitionFeeFundingUnspentAndExact: true, sourceLockStillRefundable: true,
        sourceLockConsumptionEstablished: false, reserveLineageEstablished: false, mintAuthorized: false } });
    expect(mocks.getBox.mock.calls).toEqual([SOURCE_ID, LOCK_ID, FEE_ID].flatMap(id =>
      [PRIMARY, WITNESS].map(origin => [origin, id])));
    expect(mocks.assertConfirmation).toHaveBeenCalledWith(CONFIRMATION.observerArtifact,
      BINDING.executionTargetIdentityDigestHex, GENESIS_ID, TX_ID, expect.anything());
    expect(mocks.assertCandidate).not.toHaveBeenCalled();
    expect(mocks.assertCandidateV2).not.toHaveBeenCalled();
  });

  it('allows mining during closing confirmation while rebinding the captured output anchor', async () => {
    tips([211, 211, 211, 211, 212, 212, 212, 212]);
    mocks.reobserveConfirmation.mockResolvedValueOnce(confirmationAt(210))
      .mockResolvedValueOnce(confirmationAt(212));
    expect(assertBound(await observe(input()))).toBe(packet);
    expect(mocks.getHeaders.mock.calls).toEqual([
      [PRIMARY, 200], [WITNESS, 200], [PRIMARY, 211], [WITNESS, 211],
    ]);
    const calls = mocks.reobserveConfirmation.mock.invocationCallOrder;
    const tipCalls = mocks.getBestHeader.mock.invocationCallOrder;
    expect(calls[0]).toBeLessThan(tipCalls[0]!);
    expect(tipCalls[3]).toBeLessThan(calls[1]!);
    expect(calls[1]).toBeLessThan(tipCalls[4]!);
  });

  for (const node of [PRIMARY, WITNESS]) {
    for (const phase of ['inclusion', 'captured anchor'] as const) {
      it.each(['missing', 'replaced', 'ambiguous'] as const)(
        `rejects ${node} ${phase} when %s even if the older confirmation stays valid`, async fault => {
          const read = mocks.getHeaders.getMockImplementation()!;
          mocks.getHeaders.mockImplementation((origin, height) => {
            const ids = read(origin, height);
            return origin === node && height === (phase === 'inclusion' ? 200 : 211)
              ? fault === 'missing' ? [] : fault === 'replaced' ? [hex('ff')] : [...ids, ...ids] : ids;
          });
          await expect(observe(input())).rejects.toThrow(/output inclusion differs|captured output anchor changed/);
          expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(phase === 'inclusion' ? 1 : 2);
        });
    }
  }

  it('does not span full process assertions across the short output read window', async () => {
    let tipReads = 0;
    const read = mocks.getBestHeader.getMockImplementation()!;
    mocks.getBestHeader.mockImplementation((origin) => { tipReads++; return read(origin); });
    mocks.assertTarget.mockImplementation(value => {
      if (value !== TARGET) throw new Error('target provenance missing');
      if (tipReads > 0 && tipReads < 4) throw new Error('full process query inside output window');
      return BINDING;
    });
    expect(assertBound(await observe(input()))).toBe(packet);
    expect(mocks.assertReadCustody).toHaveBeenCalled();
  });

  it('drains the other node read before failing the native output group', async () => {
    let release!: () => void;
    const pending = new Promise<unknown>(resolve => { release = () => resolve(null); });
    let primaryStarted!: () => void;
    const started = new Promise<void>(resolve => { primaryStarted = resolve; });
    mocks.getBox.mockImplementation((origin, id) => {
      if (id === SOURCE_ID && origin === PRIMARY) { primaryStarted(); throw new Error('primary read failed'); }
      return id === SOURCE_ID && origin === WITNESS ? pending : exactBox(origin, id);
    });
    let settled = false;
    const run = observe(input()).finally(() => { settled = true; });
    const rejection = expect(run).rejects.toThrow('primary read failed');
    await started;
    await new Promise(resolve => setImmediate(resolve));
    try { expect(settled).toBe(false); } finally { release(); }
    await rejection;
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(1);
  });

  it('preserves the legacy format and digest for identical observation bytes', async () => {
    mocks.assertCandidate.mockReturnValue(packet);
    const native = await observe(input());
    const legacy = await observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1({
      target: TARGET as never, batch: BATCH as never, candidate: CANDIDATE as never,
      confirmation: CONFIRMATION as never });
    expect(native).toEqual(legacy);
    expect(() => assertBound(legacy)).toThrow(/provenance/);
  });

  it.each(['packet', 'batch', 'target'] as const)(
    'rejects copied %s at entry without node reads', async field => {
      const supplied = input();
      Object.assign(supplied, { [field]: { ...(supplied[field] as object) } });
      await expect(observe(supplied)).rejects.toThrow(/provenance/);
      expect(mocks.getBestHeader).not.toHaveBeenCalled();
      expect(mocks.getBox).not.toHaveBeenCalled();
    });

  it.each(['packet', 'batch', 'target', 'observation'] as const)(
    'rejects substituted %s when asserting a retained observation', async field => {
      const observation = await observe(input());
      expect(() => assertSubstrateFederatedNativeGenesisPegInSourceLockOutputObservationV1(
        field === 'observation' ? { ...observation } : observation,
        (field === 'target' ? { ...TARGET } : TARGET) as never,
        (field === 'batch' ? { ...batch } : batch) as never,
        (field === 'packet' ? { ...packet } : packet) as never,
      )).toThrow(/provenance/);
    });

  it.each([PRIMARY, WITNESS])('requires source funding to be consumed on %s', async origin => {
    mocks.getBox.mockImplementation((node, id) => node === origin && id === SOURCE_ID
      ? { boxId: SOURCE_ID } : exactBox(node, id));
    await expect(observe(input())).rejects.toThrow(/still reports source funding/);
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(1);
  });

  for (const origin of [PRIMARY, WITNESS]) {
    for (const id of [LOCK_ID, FEE_ID]) {
      it.each([
        ['absent', null], ['boxId', hex('fe')], ['value', '99'], ['ergoTree', '1000'],
        ['creationHeight', 199], ['transactionId', hex('fe')], ['index', 9],
        ['assets', [{ tokenId: hex('fe'), amount: '1' }]], ['additionalRegisters', { R4: '0402' }],
      ])(`rejects isolated %s mismatch for ${id.slice(0, 2)} on ${origin}`, async (field, value) => {
        mocks.getBox.mockImplementation((node, boxId) => {
          const exact = exactBox(node, boxId);
          return node === origin && boxId === id
            ? field === 'absent' ? null : { ...exact, [String(field)]: value } : exact;
        });
        await expect(observe(input())).rejects.toThrow(/unavailable|output bytes changed/);
        expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(1);
      });
    }
  }

  it.each(['pending', 'not_found'] as const)('never promotes %s from local fields or tip age', async status => {
    const supplied = { ...input(), confirmation: { ...CONFIRMATION, status,
      confirmations: status === 'pending' ? 1 : 0,
      confirmationHeight: null, confirmationHeaderIdHex: null } as never };
    mocks.getBestHeader.mockReturnValue(tipAt(100_000));
    await expect(observe(supplied)).rejects.toThrow(/requires confirmation/);
    expect(mocks.getBox).not.toHaveBeenCalled();
    expect(mocks.getBestHeader).not.toHaveBeenCalled();
  });

  it('rejects a locally confirmed claim with no canonical artifact authority', async () => {
    mocks.assertConfirmation.mockImplementation(() => { throw new Error('confirmation provenance missing'); });
    await expect(observe(input())).rejects.toThrow(/confirmation provenance/);
    expect(mocks.getBox).not.toHaveBeenCalled();
  });

  it('rejects a copied confirmation artifact despite identical confirmed fields', async () => {
    await expect(observe({ ...input(), confirmation: { ...CONFIRMATION,
      observerArtifact: { ...CONFIRMATION.observerArtifact } } as never })).rejects.toThrow(/confirmation provenance/);
    expect(mocks.getBestHeader).not.toHaveBeenCalled();
    expect(mocks.getBox).not.toHaveBeenCalled();
  });

  it.each(['initial', 'final'] as const)('rejects canonical disappearance on the %s refresh without retry', async phase => {
    if (phase === 'final') mocks.reobserveConfirmation.mockResolvedValueOnce(REFRESHED_CONFIRMATION);
    mocks.reobserveConfirmation.mockResolvedValueOnce({ ...FINAL_CONFIRMATION, status: 'not_found',
      confirmations: 0, confirmationHeight: null, confirmationHeaderIdHex: null });
    await expect(observe(input())).rejects.toThrow(/refreshed canonical confirmation/);
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(phase === 'initial' ? 1 : 2);
  });

  for (const phase of ['initial', 'final'] as const) {
    it.each([['confirmationHeight', 201], ['confirmationHeaderIdHex', hex('ff')]] as const)(
      `rejects %s re-inclusion at the ${phase} refresh`, async (field, value) => {
        if (phase === 'final') mocks.reobserveConfirmation.mockResolvedValueOnce(REFRESHED_CONFIRMATION);
        mocks.reobserveConfirmation.mockResolvedValueOnce({ ...FINAL_CONFIRMATION, [field]: value });
        await expect(observe(input())).rejects.toThrow(/canonical inclusion changed/);
        expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(phase === 'initial' ? 1 : 2);
      });
  }

  it.each(['initial pairing', 'output advance', 'third window'] as const)(
    'reobserves complete bounded windows after %s', async stage => {
      tips(stage === 'initial pairing' ? [212, 211, 212, 212, 212, 212, 212, 212, 212, 212]
        : stage === 'output advance' ? [211, 211, 212, 212, 212, 212, 212, 212, 212, 212, 212, 212]
          : [212, 211, 213, 212, 213, 213, 213, 213, 213, 213, 213, 213]);
      mocks.reobserveConfirmation.mockResolvedValue(confirmationAt(stage === 'third window' ? 213 : 212));
      if (stage === 'output advance') mocks.reobserveConfirmation.mockResolvedValueOnce(confirmationAt(211));
      const observation = await observe(input());
      expect(assertBound(observation)).toBe(packet);
      expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(stage === 'initial pairing' ? 3 : 4);
      expect(mocks.getBox).toHaveBeenCalledTimes(stage === 'output advance' ? 12 : 6);
    });

  it('stops after three height-mismatched windows with no box reads', async () => {
    tips([212, 211, 213, 212, 214, 213]);
    mocks.reobserveConfirmation.mockResolvedValue(confirmationAt(211));
    await expect(observe(input())).rejects.toThrow(/did not stabilize within three windows/);
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(3);
    expect(mocks.getBestHeader).toHaveBeenCalledTimes(6);
    expect(mocks.getBox).not.toHaveBeenCalled();
  });

  it.each([PRIMARY, WITNESS])('retains cross-node height identity when %s advances first', async leader => {
    let reads = 0;
    mocks.getBestHeader.mockImplementation(origin => {
      const window = Math.floor(reads++ / 2);
      if (window >= 2) return tipAt(214);
      const height = origin === leader ? 212 + window : 211 + window;
      return { ...tipAt(height), ...(origin !== leader && window === 1 ? { id: hex('ff') } : {}) };
    });
    mocks.reobserveConfirmation.mockResolvedValue(confirmationAt(211));
    await expect(observe(input())).rejects.toThrow(/tips disagree at a previously observed height/);
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(2);
    expect(mocks.getBestHeader).toHaveBeenCalledTimes(4);
    expect(mocks.getBox).not.toHaveBeenCalled();
  });

  it('stops after three output windows invalidated by mining without reusing box reads', async () => {
    tips([211, 211, 212, 212, 212, 212, 213, 213, 213, 213, 214, 214]);
    let refreshes = 0;
    mocks.reobserveConfirmation.mockImplementation(async () => confirmationAt(211 + Math.floor(++refreshes / 2)));
    await expect(observe(input())).rejects.toThrow(/did not stabilize within three windows/);
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(6);
    expect(mocks.getBestHeader).toHaveBeenCalledTimes(12);
    expect(mocks.getBox).toHaveBeenCalledTimes(18);
  });

  it('rejects native custody already disposed at entry', async () => {
    mocks.assertNativePacket.mockImplementation(() => { throw new Error('native custody disposed'); });
    await expect(observe(input())).rejects.toThrow('native custody disposed');
    expect(mocks.getBestHeader).not.toHaveBeenCalled();
    expect(mocks.reobserveConfirmation).not.toHaveBeenCalled();
  });

  it('rejects replacement packet identity returned after asynchronous reads', async () => {
    mocks.getBox.mockImplementationOnce(async () => {
      mocks.assertNativePacket.mockReturnValue({ ...packet });
      return null;
    });
    await expect(observe(input())).rejects.toThrow(/target or packet changed/);
    expect(mocks.getBox).toHaveBeenCalledTimes(1);
  });

  it.each(['sourceLock', 'transitionFeeFunding'] as const)(
    'rejects expected %s creation height beyond the stable output tip', async role => {
      const futureBox = { ...packet.boxes[role], creationHeight: 212 };
      const futurePacket = { ...packet, boxes: { ...packet.boxes, [role]: futureBox } };
      mocks.assertNativePacket.mockImplementation((p, b, t) => {
        if (p !== futurePacket || b !== batch || t !== TARGET) throw new Error('native packet provenance missing');
        return futurePacket;
      });
      mocks.getBox.mockImplementation((node, id) => id === futureBox.boxId ? futureBox : exactBox(node, id));
      await expect(observe({ ...input(), packet: futurePacket as never })).rejects.toThrow(/creation height exceeds/);
      expect(mocks.getBox).toHaveBeenCalledTimes(6);
    });

  for (const node of [PRIMARY, WITNESS]) {
    it.each(['regression', 'replacement'] as const)(`retains ${node} history across windows for %s`, async fault => {
      let reads = 0;
      mocks.getBestHeader.mockImplementation(origin => {
        const window = Math.floor(reads++ / 2);
        const height = origin === PRIMARY ? 212 : 211;
        if (window === 1 && origin === node) {
          return fault === 'regression' ? tipAt(height - 1) : { ...tipAt(height), id: hex('ff') };
        }
        return tipAt(height);
      });
      mocks.reobserveConfirmation.mockResolvedValue(confirmationAt(211));
      await expect(observe(input())).rejects.toThrow(/tip regressed or changed/);
      expect(mocks.getBox).not.toHaveBeenCalled();
    });
  }

  it.each([1, 2, 3])('rejects same-height replacement at tip ordinal %s', async ordinal => {
    let reads = 0;
    mocks.getBestHeader.mockImplementation(() => ({ ...STABLE_TIP, id: reads++ === ordinal ? hex('ff') : STABLE_TIP.id }));
    await expect(observe(input())).rejects.toThrow(/tip regressed or changed|tips disagree/);
  });

  it('does not reuse exact boxes from a window invalidated by advancing tips', async () => {
    tips([211, 211, 212, 212, 212, 212]);
    mocks.reobserveConfirmation.mockResolvedValue(confirmationAt(212));
    mocks.reobserveConfirmation.mockResolvedValueOnce(confirmationAt(211));
    let reads = 0;
    mocks.getBox.mockImplementation((origin, id) => ++reads > 6 && id === LOCK_ID ? null : exactBox(origin, id));
    await expect(observe(input())).rejects.toThrow(/output is unavailable/);
    expect(reads).toBe(12);
  });

  it.each(['initial ahead', 'final behind', 'final ahead'] as const)('rejects %s confirmation snapshots at a stable tip', async fault => {
    mocks.reobserveConfirmation.mockResolvedValueOnce(confirmationAt(fault === 'initial ahead' ? 212 : 210))
      .mockResolvedValueOnce(confirmationAt(fault === 'final behind' ? 210 : 212));
    await expect(observe(input())).rejects.toThrow(/confirmation snapshot|confirmation exceeds/);
    expect(mocks.getBestHeader).toHaveBeenCalledTimes(fault === 'initial ahead' ? 2 : fault === 'final behind' ? 4 : 6);
  });

  it('rejects canonical inclusion changing between catch-up windows', async () => {
    tips([212, 211]);
    mocks.reobserveConfirmation.mockResolvedValueOnce(confirmationAt(211))
      .mockResolvedValueOnce({ ...confirmationAt(212), confirmationHeaderIdHex: hex('ff') });
    await expect(observe(input())).rejects.toThrow(/canonical inclusion changed/);
    expect(mocks.getBox).not.toHaveBeenCalled();
  });

  it('rejects regressing confirmation observations between catch-up windows', async () => {
    tips([212, 211]);
    mocks.reobserveConfirmation.mockResolvedValueOnce(confirmationAt(212))
      .mockResolvedValueOnce(confirmationAt(211));
    await expect(observe(input())).rejects.toThrow(/confirmation regressed/);
  });

  it.each(['confirmation', 'tip', 'box', 'normalization'] as const)('does not catch and retry %s errors', async boundary => {
    const mock = boundary === 'confirmation' ? mocks.reobserveConfirmation
      : boundary === 'tip' ? mocks.getBestHeader : boundary === 'box' ? mocks.getBox : mocks.normalizeBox;
    mock.mockRejectedValueOnce(new Error('fixture read failed'));
    await expect(observe(input())).rejects.toThrow('fixture read failed');
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(1);
  });

  for (const boundary of ['confirmation', 'tip', 'box', 'normalization', 'header'] as const) {
    const count = { confirmation: 2, tip: 8, box: 6, normalization: 4, header: 4 }[boundary];
    for (let ordinal = 0; ordinal < count; ordinal++) {
      it(`reasserts native custody after ${boundary} await ${ordinal}`, async () => {
        const mock = boundary === 'confirmation' ? mocks.reobserveConfirmation
          : boundary === 'tip' ? mocks.getBestHeader : boundary === 'box' ? mocks.getBox
            : boundary === 'header' ? mocks.getHeaders : mocks.normalizeBox;
        const original = mock.getMockImplementation()!;
        let calls = 0;
        mock.mockImplementation(async (...args: unknown[]) => {
          const result = await (original as (...args: unknown[]) => unknown)(...args);
          if (calls++ === ordinal) mocks.assertNativePacket.mockImplementation(() => { throw new Error('native custody disposed'); });
          return result;
        });
        await expect(observe(input())).rejects.toThrow('native custody disposed');
        expect(mock).toHaveBeenCalledTimes(boundary === 'confirmation' ? ordinal + 1 : 2 * Math.ceil((ordinal + 1) / 2));
      });
    }
  }

  it.each(['native assertion', 'generic assertion'] as const)('rechecks retained custody on later %s', async consumer => {
    const observation = await observe(input());
    mocks.assertNativePacket.mockImplementation(() => { throw new Error('native custody disposed'); });
    expect(() => consumer === 'native assertion' ? assertBound(observation)
      : assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1(observation, TARGET as never))
      .toThrow('native custody disposed');
  });

  it('rejects changed packet identity returned by the retained callback', async () => {
    const observation = await observe(input());
    mocks.assertNativePacket.mockReturnValue({ ...packet });
    expect(() => assertBound(observation)).toThrow(/packet changed/);
  });

  it.each(['processBindingDigestHex', 'executionTargetIdentityDigestHex'] as const)(
    'rejects %s drift after a read and on later consumption', async field => {
      const observation = await observe(input());
      mocks.assertTarget.mockReturnValue({ ...BINDING, [field]: hex('ff') });
      expect(() => assertBound(observation)).toThrow(/provenance/);
      mocks.assertTarget.mockReturnValue(BINDING);
      mocks.getBox.mockImplementationOnce(async () => {
        mocks.assertTarget.mockReturnValue({ ...BINDING, [field]: hex('ff') });
        return null;
      });
      await expect(observe(input())).rejects.toThrow(/target or packet changed/);
    });

  it('retains the original outer tuple across asynchronous caller mutation', async () => {
    const supplied = input();
    mocks.normalizeBox.mockImplementationOnce(async value => {
      supplied.packet = { ...packet } as never;
      supplied.batch = { ...batch } as never;
      supplied.target = { ...TARGET } as never;
      supplied.confirmation = { ...CONFIRMATION, observerArtifact: { ...CONFIRMATION.observerArtifact } } as never;
      return value;
    });
    expect(assertBound(await observe(supplied))).toBe(packet);
    for (const call of mocks.assertNativePacket.mock.calls) {
      expect(call[0]).toBe(packet);
      expect(call[1]).toBe(batch);
      expect(call[2]).toBe(TARGET);
    }
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
