import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCandidate: vi.fn(),
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
  assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1,
  observeSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputsV1,
} from './substrate-federated-isolated-devnet-peg-in-committed-vault-output-observer-v1.js';

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
const CANDIDATE = Object.freeze({});
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
        mintAuthorized: false,
      },
    });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetPegInCommittedVaultOutputObservationV1(
        observation,
        TARGET as never,
      )
    ).not.toThrow();
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
    expect(reads.get(PRIMARY)).toBe(4);
    expect(reads.get(WITNESS)).toBe(4);
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
