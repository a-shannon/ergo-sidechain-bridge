import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCandidate: vi.fn(),
  assertConfirmation: vi.fn(),
  assertTarget: vi.fn(),
  getBox: vi.fn(),
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
}));
vi.mock('./unsigned-ergo-transaction.js', () => ({
  normalizeEip12Box: mocks.normalizeBox,
}));

import {
  assertSubstrateFederatedIsolatedDevnetPegInSourceLockOutputObservationV1,
  observeSubstrateFederatedIsolatedDevnetPegInSourceLockOutputsV1,
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
  mocks.getBox.mockImplementation((_origin: string, boxId: string) => {
    if (boxId === SOURCE_ID) return null;
    if (boxId === LOCK_ID) return SOURCE_LOCK;
    if (boxId === FEE_ID) return TRANSITION_FEE;
    throw new Error('unexpected box');
  });
});

describe('isolated source-lock output observer V1', () => {
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
