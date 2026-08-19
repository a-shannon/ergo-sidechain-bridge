import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertCandidate: vi.fn(),
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
