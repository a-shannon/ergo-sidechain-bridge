import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCandidate: vi.fn(),
  assertCandidateV2: vi.fn(),
  assertNativePacket: vi.fn(),
  assertConfirmation: vi.fn(),
  reobserveConfirmation: vi.fn(),
  assertTarget: vi.fn(),
  getBox: vi.fn(),
  getBestHeader: vi.fn(),
  getBlockHeaderById: vi.fn(),
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
    getBlockHeaderById(headerId: string) {
      return mocks.getBlockHeaderById(this.origin, headerId);
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
  encodePegInSourceIntentV2Hex,
} from './peg-in-causal-admission-v2.js';
import {
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1,
  observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1,
  observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV2,
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV2,
  observeSubstrateFederatedNativeGenesisPegInCommittedVaultOutputsV1,
  assertSubstrateFederatedNativeGenesisPegInCommittedVaultOutputObservationV1,
} from './substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js';
import {
  buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1,
} from './substrate-federated-isolated-devnet-peg-in-mint-reservation-draft-v1.js';

const hex = (byte: string): string => byte.repeat(32);
const PRIMARY = 'http://127.0.0.1:9051';
const WITNESS = 'http://127.0.0.1:9052';
const SOURCE_ID = hex('11');
const RESERVE_ID = hex('12');
const LOCK_ID = hex('13');
const FEE_ID = hex('14');
const SUCCESSOR_ID = hex('15');
const TX_ID = hex('16');
const GENESIS_ID = hex('17');
const CONFIRMATION_HEADER_ID = hex('18');
const OBSERVED_TIP_ID = hex('1c');
const FAMILY_ID = hex('31');
const DEPOSIT_COMMITMENT = hex('32');
const RESERVE_DIGEST = `01${hex('33')}`;
const SOURCE_INTENT_HEX = encodePegInSourceIntentV2Hex({
  formatVersion: 2,
  sourceNetworkIdHex: `0x${hex('34')}`,
  sidechainIdHex: `0x${hex('35')}`,
  bridgeAddressHex: `0x${'36'.repeat(20)}`,
  tokenAddressHex: `0x${'37'.repeat(20)}`,
  settlementProfileIdHex: `0x${hex('38')}`,
  admissionProfileIdHex: `0x${FAMILY_ID}`,
  sourceAssetIdHex: `0x${hex('00')}`,
  amountNanoErg: '10000',
  recipientAddressHex: `0x${'39'.repeat(20)}`,
});
const BINDING = Object.freeze({
  processBindingDigestHex: hex('19'),
  executionTargetIdentityDigestHex: hex('1a'),
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
const RESERVE_SUCCESSOR = Object.freeze({
  boxId: SUCCESSOR_ID,
  value: '10100',
  ergoTree: '10010100d17300',
  assets: Object.freeze([]),
  additionalRegisters: Object.freeze({}),
  creationHeight: 200,
  transactionId: TX_ID,
  index: 0,
});
const PACKET = Object.freeze({
  familyIdHex: FAMILY_ID,
  familyCompiler: Object.freeze({ bindingDigestHex: hex('3a') }),
  sourceIntentHex: SOURCE_INTENT_HEX,
  depositCommitmentHex: DEPOSIT_COMMITMENT,
  reserve: Object.freeze({
    outputDigestHex: RESERVE_DIGEST,
    outputLiabilityNanoErg: '10000',
  }),
  boxes: Object.freeze({
    sourceFundingInput: Object.freeze({ boxId: SOURCE_ID }),
    reservePredecessor: Object.freeze({ boxId: RESERVE_ID }),
    sourceLock: Object.freeze({ boxId: LOCK_ID }),
    transitionFeeFunding: Object.freeze({ boxId: FEE_ID }),
    reserveSuccessor: RESERVE_SUCCESSOR,
  }),
  transactions: Object.freeze({
    reserveTransition: Object.freeze({ txId: TX_ID }),
  }),
});
const CANDIDATE = Object.freeze({ candidateDigestHex: hex('3b') });
const CONFIRMATION = Object.freeze({
  status: 'confirmed' as const,
  expectedTxId: TX_ID,
  observedTxId: TX_ID,
  confirmations: 10,
  confirmationHeight: 200,
  observedAtHeight: 210,
  confirmationHeaderIdHex: CONFIRMATION_HEADER_ID,
  observationDigestHex: hex('1b'),
  observerArtifact: Object.freeze({ role: 'confirmation' }),
});
const REFRESHED_CONFIRMATION_HEADER_ID = hex('1f');
const REFRESHED_CONFIRMATION = Object.freeze({
  ...CONFIRMATION,
  confirmations: 10,
  confirmationHeight: 201,
  observedAtHeight: 211,
  confirmationHeaderIdHex: REFRESHED_CONFIRMATION_HEADER_ID,
  observationDigestHex: hex('20'),
  observerArtifact: Object.freeze({ role: 'refreshed-confirmation' }),
});
const FINAL_CONFIRMATION = Object.freeze({
  ...REFRESHED_CONFIRMATION,
  confirmations: 11,
  observedAtHeight: 212,
  observationDigestHex: hex('2a'),
  observerArtifact: Object.freeze({ role: 'final-confirmation' }),
});

function headerFixture(): Map<string, Readonly<{
  id: string;
  parentId: string;
  height: number;
}>> {
  const ids = new Map<number, string>();
  ids.set(201, REFRESHED_CONFIRMATION_HEADER_ID);
  for (let height = 202; height < 211; height += 1) {
    ids.set(height, (height - 120).toString(16).padStart(2, '0').repeat(32));
  }
  ids.set(211, OBSERVED_TIP_ID);
  const headers = new Map<string, Readonly<{
    id: string;
    parentId: string;
    height: number;
  }>>();
  for (let height = 201; height <= 211; height += 1) {
    const id = ids.get(height)!;
    headers.set(id, Object.freeze({
      id,
      parentId: height === 201 ? hex('30') : ids.get(height - 1)!,
      height,
    }));
  }
  for (const id of [hex('1d'), hex('21')]) {
    headers.set(id, Object.freeze({
      id,
      parentId: OBSERVED_TIP_ID,
      height: 212,
    }));
  }
  headers.set(hex('22'), Object.freeze({
    id: hex('22'),
    parentId: hex('21'),
    height: 213,
  }));
  headers.set(hex('1e'), Object.freeze({
    id: hex('1e'),
    parentId: ids.get(210)!,
    height: 211,
  }));
  return headers;
}

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
  mocks.reobserveConfirmation.mockImplementation(async input => {
    const prior = input.priorConfirmation;
    if (
      input.artifact !== prior.observerArtifact
      || input.expectedReconciliationIdentityDigestHex
        !== BINDING.executionTargetIdentityDigestHex
      || input.expectedTargetGenesisHeaderIdHex !== GENESIS_ID
      || input.expectedTxId !== TX_ID
      || input.priorConfirmation.confirmationHeaderIdHex
        !== prior.confirmationHeaderIdHex
    ) {
      throw new Error('confirmation reobservation binding changed');
    }
    if (prior.observerArtifact === CONFIRMATION.observerArtifact) {
      return REFRESHED_CONFIRMATION;
    }
    if (prior.observerArtifact === REFRESHED_CONFIRMATION.observerArtifact) {
      return FINAL_CONFIRMATION;
    }
    throw new Error('confirmation reobservation predecessor changed');
  });
  mocks.getBox.mockImplementation((_origin: string, boxId: string) => {
    if (boxId === SUCCESSOR_ID) return RESERVE_SUCCESSOR;
    if (
      boxId === SOURCE_ID
      || boxId === RESERVE_ID
      || boxId === LOCK_ID
      || boxId === FEE_ID
    ) {
      return null;
    }
    throw new Error('unexpected box');
  });
  mocks.getBestHeader.mockReturnValue({
    height: 211,
    id: OBSERVED_TIP_ID,
  });
  const headers = headerFixture();
  mocks.getBlockHeaderById.mockImplementation(
    (_origin: string, headerId: string) => headers.get(headerId) ?? null,
  );
});

describe('native committed-vault observation (mocked packet custody, box codec and nodes)', () => {
  const batch = Object.freeze({ ...BATCH, role: 'native' });
  const observe = observeSubstrateFederatedNativeGenesisPegInCommittedVaultOutputsV1;
  const assertBound = assertSubstrateFederatedNativeGenesisPegInCommittedVaultOutputObservationV1;
  const input = () => ({ target: TARGET as never, batch: batch as never,
    packet: PACKET as never, confirmation: REFRESHED_CONFIRMATION as never });
  const tip = (height: number, id: string) => ({ height, id });
  const stable = tip(211, OBSERVED_TIP_ID);
  const advanced = tip(212, hex('21'));
  const later = tip(213, hex('22'));
  function tipSequence(primary: typeof stable[], witness: typeof stable[] = [stable]) {
    const calls = new Map<string, number>();
    mocks.getBestHeader.mockImplementation((origin: string) => {
      const index = calls.get(origin) ?? 0;
      calls.set(origin, index + 1);
      const values = origin === PRIMARY ? primary : witness;
      return values[Math.min(index, values.length - 1)];
    });
  }
  function confirmationHeights(...heights: number[]) {
    let calls = 0;
    mocks.reobserveConfirmation.mockImplementation(async request => {
      expect(request.artifact).toBe(request.priorConfirmation.observerArtifact);
      expect(request.expectedTxId).toBe(TX_ID);
      expect(request.expectedTargetGenesisHeaderIdHex).toBe(GENESIS_ID);
      expect(request.expectedReconciliationIdentityDigestHex).toBe(BINDING.executionTargetIdentityDigestHex);
      return { ...REFRESHED_CONFIRMATION,
        observedAtHeight: heights[Math.min(calls++, heights.length - 1)] };
    });
  }
  beforeEach(() => {
    mocks.assertNativePacket.mockImplementation((suppliedPacket, suppliedBatch, target) => {
      if (suppliedPacket !== PACKET || suppliedBatch !== batch || target !== TARGET) {
        throw new Error('native packet provenance missing');
      }
      return PACKET;
    });
    mocks.assertConfirmation.mockImplementation((artifact, identity, genesis, txId, confirmation) => {
      if (artifact !== REFRESHED_CONFIRMATION.observerArtifact
        || identity !== BINDING.executionTargetIdentityDigestHex || genesis !== GENESIS_ID
        || txId !== TX_ID || confirmation.confirmationHeight !== 201
        || confirmation.confirmationHeaderIdHex !== REFRESHED_CONFIRMATION_HEADER_ID) {
        throw new Error('confirmation provenance missing');
      }
    });
    mocks.normalizeBox.mockImplementation(async value => value);
    confirmationHeights(211);
  });

  it('binds the original native packet and batch without a candidate or mint authority', async () => {
    const observation = await observe(input());
    expect(assertBound(observation, TARGET as never, batch as never, PACKET as never)).toBe(PACKET);
    expect(observation).toMatchObject({ expectedTxId: TX_ID,
      sourceFundingBoxIdHex: SOURCE_ID, reservePredecessorBoxIdHex: RESERVE_ID,
      sourceLockBoxIdHex: LOCK_ID, transitionFeeFundingBoxIdHex: FEE_ID,
      reserveSuccessorBoxIdHex: SUCCESSOR_ID, finalityTargetHeight: 211,
      finalityTargetHeaderIdHex: OBSERVED_TIP_ID, requiredSuccessorDepth: 10,
      boundaries: { mintAuthorized: false, fundsAuthorityEstablished: false, ergoPowAuthenticated: false } });
    expect(mocks.assertCandidate).not.toHaveBeenCalled();
    expect(mocks.assertCandidateV2).not.toHaveBeenCalled();
    expect(mocks.getBox).toHaveBeenCalledTimes(10);
  });

  it('retains identical legacy receipt bytes and digest for identical observations', async () => {
    const native = await observe(input());
    const legacy = await observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
      target: TARGET as never, batch: BATCH as never, candidate: CANDIDATE as never,
      confirmation: REFRESHED_CONFIRMATION as never,
    });
    expect(native).toEqual(legacy);
    expect(() => assertBound(legacy, TARGET as never, batch as never, PACKET as never))
      .toThrow(/packet and batch provenance/);
  });

  it.each(['packet', 'batch', 'target', 'confirmation'] as const)('rejects copied %s before node reads', async field => {
    const supplied = input();
    if (field === 'packet') supplied.packet = { ...PACKET } as never;
    if (field === 'batch') supplied.batch = { ...batch } as never;
    if (field === 'target') supplied.target = { ...TARGET } as never;
    if (field === 'confirmation') supplied.confirmation = {
      ...REFRESHED_CONFIRMATION, observerArtifact: { ...REFRESHED_CONFIRMATION.observerArtifact },
    } as never;
    await expect(observe(supplied)).rejects.toThrow(/provenance/);
    expect(mocks.getBestHeader).not.toHaveBeenCalled();
  });

  it.each(['packet', 'batch', 'target', 'observation'] as const)('rejects %s substitution at receipt consumption', async field => {
    const observation = await observe(input());
    expect(() => assertBound(field === 'observation' ? { ...observation } : observation,
      (field === 'target' ? { ...TARGET } : TARGET) as never,
      (field === 'batch' ? { ...batch } : batch) as never,
      (field === 'packet' ? { ...PACKET } : PACKET) as never)).toThrow(/provenance/);
  });

  it.each(['native', 'generic'] as const)('rechecks revoked custody at %s receipt consumption', async consumer => {
    const observation = await observe(input());
    mocks.assertNativePacket.mockImplementation(() => { throw new Error('custody revoked'); });
    expect(() => consumer === 'native'
      ? assertBound(observation, TARGET as never, batch as never, PACKET as never)
      : assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1(observation, TARGET as never))
      .toThrow(/custody revoked/);
  });

  it.each(['processBindingDigestHex', 'executionTargetIdentityDigestHex'] as const)(
    'rejects %s drift at receipt consumption', async field => {
      const observation = await observe(input());
      mocks.assertTarget.mockReturnValue({ ...BINDING, [field]: hex('ee') });
      expect(() => assertBound(observation, TARGET as never, batch as never, PACKET as never)).toThrow(/provenance/);
    },
  );

  it.each(['confirmation', 'tip', 'box', 'normalization', 'header'] as const)(
    'rejects custody revocation during asynchronous %s without another window', async phase => {
      const revoke = () => mocks.assertNativePacket.mockImplementation(() => { throw new Error('custody revoked'); });
      if (phase === 'confirmation') mocks.reobserveConfirmation.mockImplementationOnce(async () => { revoke(); return REFRESHED_CONFIRMATION; });
      if (phase === 'tip') mocks.getBestHeader.mockImplementationOnce(async () => { revoke(); return stable; });
      if (phase === 'box') mocks.getBox.mockImplementationOnce(async () => { revoke(); return null; });
      if (phase === 'normalization') mocks.normalizeBox.mockImplementationOnce(async value => { revoke(); return value; });
      if (phase === 'header') mocks.getBlockHeaderById.mockImplementationOnce(async (_origin, id) => { revoke(); return headerFixture().get(id); });
      await expect(observe(input())).rejects.toThrow(/custody revoked/);
      expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(1);
    },
  );

  it('retains the original tuple across async caller mutation', async () => {
    const supplied = input();
    mocks.normalizeBox.mockImplementationOnce(async value => {
      supplied.packet = { ...PACKET } as never;
      supplied.batch = { ...batch } as never;
      supplied.target = { ...TARGET } as never;
      return value;
    });
    const observation = await observe(supplied);
    expect(assertBound(observation, TARGET as never, batch as never, PACKET as never)).toBe(PACKET);
  });

  it.each([SOURCE_ID, RESERVE_ID, LOCK_ID, FEE_ID])('rejects unspent transition input %s without retry', async id => {
    mocks.getBox.mockImplementation((_origin, boxId) => boxId === id ? { boxId: id }
      : boxId === SUCCESSOR_ID ? RESERVE_SUCCESSOR : null);
    tipSequence([stable, advanced]);
    await expect(observe(input())).rejects.toThrow(/still reports a transition input/);
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['value', '10101'], ['assets', [{ tokenId: hex('ff'), amount: '1' }]],
    ['additionalRegisters', { R4: '0402' }], ['ergoTree', '10010100d17301'],
    ['boxId', hex('ff')], ['transactionId', hex('ff')], ['index', 1], ['creationHeight', 199],
  ])('rejects changed successor %s without retry', async (field, value) => {
    mocks.getBox.mockImplementation((_origin, boxId) => boxId === SUCCESSOR_ID
      ? { ...RESERVE_SUCCESSOR, [field as string]: value } : null);
    tipSequence([stable, advanced]);
    await expect(observe(input())).rejects.toThrow(/successor bytes changed/);
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(1);
  });

  it.each(['missing successor', 'RPC error', 'codec error', 'missing header', 'header identity'] as const)(
    'rejects %s without retry', async fault => {
      if (fault === 'missing successor') mocks.getBox.mockReturnValue(null);
      if (fault === 'RPC error') mocks.getBox.mockRejectedValue(new Error('RPC failed'));
      if (fault === 'codec error') mocks.normalizeBox.mockRejectedValue(new Error('codec failed'));
      if (fault === 'missing header') mocks.getBlockHeaderById.mockReturnValue(null);
      if (fault === 'header identity') mocks.getBlockHeaderById.mockReturnValue({ height: 211, id: hex('ff'), parentId: hex('aa') });
      await expect(observe(input())).rejects.toThrow(/unavailable|failed|identity changed/);
      expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['height', 'header', 'regression', 'unconfirmed'] as const)(
    'rejects initial refreshed confirmation %s conflict', async fault => {
      mocks.reobserveConfirmation.mockResolvedValue({ ...REFRESHED_CONFIRMATION,
        ...(fault === 'height' ? { confirmationHeight: 202 } : {}),
        ...(fault === 'header' ? { confirmationHeaderIdHex: hex('ff') } : {}),
        ...(fault === 'regression' ? { observedAtHeight: 210 } : {}),
        ...(fault === 'unconfirmed' ? { status: 'not_found', confirmationHeight: null, confirmationHeaderIdHex: null } : {}),
      });
      await expect(observe(input())).rejects.toThrow(/canonical inclusion changed or confirmation regressed/);
      expect(mocks.getBox).not.toHaveBeenCalled();
    },
  );

  it('rejects changed final canonical inclusion without retry', async () => {
    mocks.reobserveConfirmation.mockResolvedValueOnce(REFRESHED_CONFIRMATION)
      .mockResolvedValueOnce({ ...REFRESHED_CONFIRMATION, confirmationHeaderIdHex: hex('ff') });
    await expect(observe(input())).rejects.toThrow(/canonical inclusion changed/);
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(2);
  });

  it('accepts mining advance during output reads in the next bounded window', async () => {
    tipSequence([stable, advanced], [advanced]);
    confirmationHeights(211, 212);
    const observation = await observe(input());
    expect(observation.observedTipHeight).toBe(212);
    expect(observation.finalityTargetHeight).toBe(211);
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(3);
  });

  it('accepts mining advance between node output windows', async () => {
    tipSequence([stable, stable, advanced], [advanced]);
    confirmationHeights(211, 212);
    expect((await observe(input())).observedTipHeight).toBe(212);
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(4);
  });

  it('accepts mining advance during finality reads only after a fresh output window', async () => {
    tipSequence([stable, stable, stable, advanced], [stable, stable, advanced]);
    confirmationHeights(211, 211, 212);
    expect((await observe(input())).observedTipHeight).toBe(212);
    expect(mocks.getBox).toHaveBeenCalledTimes(20);
  });

  it('exhausts exactly three windows on continued mining advance', async () => {
    tipSequence([stable, advanced, advanced, later, later, tip(214, hex('23'))]);
    confirmationHeights(211, 212, 213);
    await expect(observe(input())).rejects.toThrow(/within three windows/);
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(3);
    expect(mocks.getBox).toHaveBeenCalledTimes(15);
  });

  it.each([
    ['within-window regression', [advanced, stable], [stable]],
    ['within-window replacement', [stable, tip(211, hex('1e'))], [stable]],
    ['cross-window regression', [stable, advanced, stable], [stable]],
    ['cross-window replacement', [stable, advanced, tip(212, hex('1d'))], [stable]],
    ['same-node reused id', [stable, tip(212, OBSERVED_TIP_ID)], [stable]],
    ['peer same-height conflict', [stable], [tip(211, hex('1e'))]],
    ['peer historical-height conflict', [stable, advanced, advanced], [tip(211, hex('1e'))]],
  ] as const)('rejects %s across observed windows', async (_name, primary, witness) => {
    tipSequence([...primary], [...witness]);
    await expect(observe(input())).rejects.toThrow(/regressed|replaced|conflicting header/);
  });

  it('rejects conflicting ancestry above the finality target from a previous window', async () => {
    tipSequence([stable, advanced, later], [later]);
    confirmationHeights(211, 213);
    const headers = headerFixture();
    mocks.getBlockHeaderById.mockImplementation((_origin, id) => id === hex('22')
      ? { ...headers.get(id), parentId: hex('1d') } : headers.get(id));
    await expect(observe(input())).rejects.toThrow(/conflicting header/);
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(2);
  });

  it('rejects a fork not descending from the exact inclusion', async () => {
    const headers = headerFixture();
    mocks.getBlockHeaderById.mockImplementation((_origin, id) => {
      if (id === hex('fe')) return { id, height: 201, parentId: hex('30') };
      const header = headers.get(id);
      return header?.height === 202 ? { ...header, parentId: hex('fe') } : header;
    });
    await expect(observe(input())).rejects.toThrow(/canonical inclusion/);
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(1);
  });

  it('rejects conflicting peer parent bytes even under an unchanged header id', async () => {
    const headers = headerFixture();
    mocks.getBlockHeaderById.mockImplementation((origin, id) => {
      const header = headers.get(id);
      return origin === WITNESS && header?.height === 201
        ? { ...header, parentId: hex('ff') } : header;
    });
    await expect(observe(input())).rejects.toThrow(/conflicting header/);
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['insufficient depth', 210, /exact finality target/],
    ['excessive tip lag', 276, /bounded tip window/],
  ] as const)('rejects %s without retry', async (_fault, height, message) => {
    mocks.getBestHeader.mockReturnValue(tip(height, hex('ab')));
    await expect(observe(input())).rejects.toThrow(message);
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(1);
    expect(mocks.getBlockHeaderById).not.toHaveBeenCalled();
  });

  it('rejects a packet-exact successor from a future height without retry', async () => {
    const successor = { ...RESERVE_SUCCESSOR, creationHeight: 220 };
    const packet = { ...PACKET, boxes: { ...PACKET.boxes, reserveSuccessor: successor } };
    mocks.assertNativePacket.mockImplementation((supplied, suppliedBatch, target) => {
      if (supplied !== packet || suppliedBatch !== batch || target !== TARGET) throw new Error('provenance');
      return packet;
    });
    mocks.getBox.mockImplementation((_origin, id) => id === SUCCESSOR_ID ? successor : null);
    tipSequence([stable, advanced]);
    await expect(observe({ ...input(), packet: packet as never })).rejects.toThrow(/creation height/);
    expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(1);
  });

  it.each(['processBindingDigestHex', 'executionTargetIdentityDigestHex'] as const)(
    'rejects %s drift during async normalization', async field => {
      mocks.normalizeBox.mockImplementationOnce(async value => {
        mocks.assertTarget.mockReturnValue({ ...BINDING, [field]: hex('ee') });
        return value;
      });
      await expect(observe(input())).rejects.toThrow(/target or packet changed/);
      expect(mocks.reobserveConfirmation).toHaveBeenCalledTimes(1);
    },
  );
});

describe('isolated committed-vault V2 candidate boundary (mocked provenance and node fields)', () => {
  const candidateV2 = Object.freeze({ ...CANDIDATE, version: 2 });
  const batchV3 = Object.freeze({ ...BATCH, version: 3 });
  const input = () => ({
    target: TARGET as never, batch: batchV3 as never,
    candidate: candidateV2 as never, confirmation: CONFIRMATION as never,
  });
  const observe = observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV2;
  const assertBound = assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationForCandidateV2;

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
      'e2s.substrate-federated-isolated-devnet-peg-in-committed-vault-output-observation.v1',
    );
    expect(() => assertBound(observation, batchV3 as never, candidateV2 as never, TARGET as never)).not.toThrow();
    expect(mocks.assertCandidate).not.toHaveBeenCalled();
    expect(mocks.assertCandidateV2).toHaveBeenCalledWith(candidateV2, batchV3, TARGET);
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
    await expect(observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1(input())).rejects.toThrow(/candidate provenance/);
    expect(mocks.assertCandidateV2).not.toHaveBeenCalled();
    expect(mocks.getBox).not.toHaveBeenCalled();
  });

  it.each(['candidate', 'batch', 'copied observation', 'V1 observation'] as const)(
    'rejects %s substitution even when packet bytes agree', async fault => {
      const observation = fault === 'V1 observation'
        ? await observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
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

describe('isolated committed-vault output observer V1', () => {
  it('requires both nodes to report every input spent and the exact successor unspent', async () => {
    const observation =
      await observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      });

    expect(observation).toMatchObject({
      status: 'exact_transition_inputs_spent_and_reserve_successor_unspent',
      expectedTxId: TX_ID,
      sourceFundingBoxIdHex: SOURCE_ID,
      reservePredecessorBoxIdHex: RESERVE_ID,
      sourceLockBoxIdHex: LOCK_ID,
      transitionFeeFundingBoxIdHex: FEE_ID,
      reserveSuccessorBoxIdHex: SUCCESSOR_ID,
      confirmationHeight: 201,
      confirmationHeaderIdHex: REFRESHED_CONFIRMATION_HEADER_ID,
      confirmationObservationDigestHex:
        FINAL_CONFIRMATION.observationDigestHex,
      finalityTargetHeight: 211,
      finalityTargetHeaderIdHex: OBSERVED_TIP_ID,
      requiredSuccessorDepth: 10,
      observedTipHeight: 211,
      observedTipHeaderIdHex: OBSERVED_TIP_ID,
      boundaries: {
        originalSourceFundingRemainsSpent: true,
        exactReservePredecessorSpent: true,
        exactSourceLockSpent: true,
        exactTransitionFeeFundingSpent: true,
        exactReserveSuccessorUnspent: true,
        sourceLockConsumptionEstablished: true,
        reserveLineageEstablished: true,
        depositCommitmentStateEstablished: true,
        exactRequiredDepthAncestryObserved: true,
        exactFinalityTargetSelected: true,
        ergoPowAuthenticated: false,
        mintAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
      },
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1(
        observation,
        TARGET as never,
      )
    ).not.toThrow();
  });

  it('joins the real observation provenance to one canonical mint-reservation draft', async () => {
    const observation =
      await observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      });
    const draft =
      buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        committedVaultObservation: observation,
      });

    expect(draft).toMatchObject({
      statement: {
        lineageProfileIdHex: `0x${FAMILY_ID}`,
        sourceLockBoxIdHex: `0x${LOCK_ID}`,
        reserveTransitionTransactionIdHex: `0x${TX_ID}`,
        depositCommitmentHex: `0x${DEPOSIT_COMMITMENT}`,
        successorReserveBoxIdHex: `0x${SUCCESSOR_ID}`,
        successorReserveDigestHex: `0x${RESERVE_DIGEST}`,
        inclusionHeaderIdHex: `0x${REFRESHED_CONFIRMATION_HEADER_ID}`,
        targetHeaderIdHex: `0x${OBSERVED_TIP_ID}`,
      },
      boundary: {
        runtimeProfileBound: false,
        sourceAttestationEstablished: false,
        runtimeReservationWritten: false,
        mintExecuted: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
      },
    });

    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        committedVaultObservation: { ...observation },
      })
    ).toThrow(/lacks provenance/);

    const foreignCandidate = { ...CANDIDATE };
    mocks.assertCandidate.mockReturnValueOnce(PACKET);
    expect(() =>
      buildSubstrateFederatedIsolatedDevnetPegInMintReservationDraftV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: foreignCandidate as never,
        committedVaultObservation: observation,
      })
    ).toThrow(/does not bind the exact candidate/);
  });

  it('rejects an unspent transition input and a changed reserve successor', async () => {
    mocks.getBox.mockImplementation((_origin: string, boxId: string) => {
      if (boxId === RESERVE_ID) return { boxId: RESERVE_ID };
      if (boxId === SUCCESSOR_ID) return RESERVE_SUCCESSOR;
      return null;
    });
    await expect(
      observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      }),
    ).rejects.toThrow(/still reports a transition input/);

    mocks.getBox.mockImplementation((origin: string, boxId: string) => {
      if (boxId !== SUCCESSOR_ID) return null;
      return origin === PRIMARY
        ? RESERVE_SUCCESSOR
        : { ...RESERVE_SUCCESSOR, value: '10099' };
    });
    await expect(
      observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      }),
    ).rejects.toThrow(/reserve successor bytes changed/);
  });

  it('retries an advancing tip and returns only the stable output view', async () => {
    const reads = new Map<string, number>();
    mocks.getBestHeader.mockImplementation((origin: string) => {
      const count = (reads.get(origin) ?? 0) + 1;
      reads.set(origin, count);
      return count === 1
        ? { height: 211, id: OBSERVED_TIP_ID }
        : { height: 212, id: hex('1d') };
    });

    const observation =
      await observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      });

    expect(observation).toMatchObject({
      observedTipHeight: 212,
      observedTipHeaderIdHex: hex('1d'),
    });
    expect(reads.get(PRIMARY)).toBe(6);
    expect(reads.get(WITNESS)).toBe(6);
  });

  it('rejects a stable replacement of the exact finality target after final confirmation', async () => {
    const oldTipId = hex('1d');
    const replacementTipId = hex('2c');
    const replacementTargetId = hex('2d');
    const headers = headerFixture();
    headers.set(replacementTargetId, Object.freeze({
      id: replacementTargetId,
      parentId: headers.get(OBSERVED_TIP_ID)!.parentId,
      height: 211,
    }));
    headers.set(replacementTipId, Object.freeze({
      id: replacementTipId,
      parentId: replacementTargetId,
      height: 212,
    }));
    mocks.getBlockHeaderById.mockImplementation(
      (_origin: string, headerId: string) => headers.get(headerId) ?? null,
    );
    const reads = new Map<string, number>();
    mocks.getBestHeader.mockImplementation((origin: string) => {
      const count = (reads.get(origin) ?? 0) + 1;
      reads.set(origin, count);
      return count <= 2
        ? { height: 212, id: oldTipId }
        : { height: 212, id: replacementTipId };
    });

    await expect(
      observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      }),
    ).rejects.toThrow(/finality target changed during observation/);
  });

  it('rejects stable but different primary and witness tips', async () => {
    mocks.getBestHeader.mockImplementation((origin: string) => ({
      height: 211,
      id: origin === PRIMARY ? OBSERVED_TIP_ID : hex('1e'),
    }));

    await expect(
      observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      }),
    ).rejects.toThrow(/output observations disagree/);
  });

  it('rejects a refreshed confirmation outside the stable output snapshot', async () => {
    mocks.reobserveConfirmation.mockResolvedValue({
      ...REFRESHED_CONFIRMATION,
      observedAtHeight: REFRESHED_CONFIRMATION.observedAtHeight + 1,
    });

    await expect(
      observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      }),
    ).rejects.toThrow(/initial confirmation snapshot is ahead of the stable output tip/);
  });

  it('rejects a shallow H2 re-inclusion after the supplied H1 was reorged', async () => {
    mocks.reobserveConfirmation
      .mockResolvedValueOnce(REFRESHED_CONFIRMATION)
      .mockResolvedValueOnce({
        ...FINAL_CONFIRMATION,
        status: 'pending',
        confirmations: 1,
        confirmationHeight: null,
        confirmationHeaderIdHex: null,
      });

    await expect(
      observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      }),
    ).rejects.toThrow(/requires final canonical confirmation/);
  });

  it('rejects inclusion identity drift across the output snapshot', async () => {
    mocks.reobserveConfirmation
      .mockResolvedValueOnce(REFRESHED_CONFIRMATION)
      .mockResolvedValueOnce({
        ...FINAL_CONFIRMATION,
        confirmationHeaderIdHex: hex('2b'),
      });

    await expect(
      observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      }),
    ).rejects.toThrow(/canonical inclusion changed/);
  });

  it('rejects a broken exact-depth parent chain', async () => {
    const headers = headerFixture();
    const target = headers.get(OBSERVED_TIP_ID)!;
    headers.set(OBSERVED_TIP_ID, {
      ...target,
      parentId: hex('ff'),
    });
    mocks.getBlockHeaderById.mockImplementation(
      (_origin: string, headerId: string) => headers.get(headerId) ?? null,
    );

    await expect(
      observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      }),
    ).rejects.toThrow(/finality header is unavailable/);
  });

  it('accepts a stable output view after the refreshed confirmation height', async () => {
    mocks.getBestHeader.mockReturnValue({ height: 212, id: hex('21') });

    const observation =
      await observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      });

    expect(observation).toMatchObject({
      confirmationHeight: 201,
      observedTipHeight: 212,
      observedTipHeaderIdHex: hex('21'),
    });
  });

  it('rejects an output snapshot that outruns the final confirmation', async () => {
    mocks.getBestHeader.mockReturnValue({ height: 213, id: hex('22') });

    await expect(
      observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      }),
    ).rejects.toThrow(/final confirmation snapshot is behind the stable output tip/);
  });

  it.each([
    ['regression', { height: 210, id: hex('22') }, /tip regressed/],
    ['same-height replacement', { height: 211, id: hex('23') }, /tip replaced or reused/],
    ['height-changing ID reuse', { height: 212, id: OBSERVED_TIP_ID }, /tip replaced or reused/],
  ] as const)('rejects a %s inside an output snapshot', async (_label, changedTip, error) => {
    let primaryReads = 0;
    mocks.getBestHeader.mockImplementation((origin: string) => {
      if (origin !== PRIMARY) return { height: 211, id: OBSERVED_TIP_ID };
      primaryReads += 1;
      return primaryReads === 1
        ? { height: 211, id: OBSERVED_TIP_ID }
        : changedTip;
    });

    await expect(
      observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      }),
    ).rejects.toThrow(error);
  });

  it('bounds retries when an output snapshot never stabilizes', async () => {
    const reads = new Map<string, number>();
    mocks.getBestHeader.mockImplementation((origin: string) => {
      const count = (reads.get(origin) ?? 0) + 1;
      reads.set(origin, count);
      return {
        height: 211 + count,
        id: (40 + count).toString(16).padStart(2, '0').repeat(32),
      };
    });

    await expect(
      observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      }),
    ).rejects.toThrow(/tip did not stabilize during output observation/);
    expect(reads.get(PRIMARY)).toBe(6);
  });

  it('rejects copied output evidence without process provenance', async () => {
    const observation =
      await observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
        target: TARGET as never,
        batch: BATCH as never,
        candidate: CANDIDATE as never,
        confirmation: CONFIRMATION as never,
      });

    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1(
        { ...observation },
        TARGET as never,
      )
    ).toThrow(/provenance/);
  });

  it('rejects output observation without exact canonical confirmation', async () => {
    await expect(
      observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
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
      observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1({
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
