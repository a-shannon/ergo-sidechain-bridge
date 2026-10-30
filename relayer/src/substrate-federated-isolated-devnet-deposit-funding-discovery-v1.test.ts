import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ownedTarget = vi.hoisted(() => ({ assert: vi.fn() }));

vi.mock('./substrate-federated-isolated-devnet-ergo-node-process-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1:
    ownedTarget.assert,
}));

import {
  AuthenticatedSpvTrackerReadOnlyNodeClient,
} from './authenticated-spv-tracker-read-only-node-client.js';
import {
  deriveDevnetRewardErgoTreeHexForDelay,
} from './relayer-core/devnet-reward-consolidation.js';
import {
  assertSubstrateFederatedIsolatedDevnetOwnedDepositFundingDiscoveryV1,
  assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1,
  createSubstrateFederatedDepositFundingRequirementsV1,
  discoverSubstrateFederatedDepositFundingForOwnedExecutionTargetV1,
  discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1,
} from './substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js';
import {
  assertSubstrateFederatedDepositFundingV1Provenance,
  discoverSubstrateFederatedDepositFundingV1,
  normalizeSubstrateFederatedDepositFundingRequirementsV1,
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  type SubstrateFederatedDepositFundingRequirementsV1,
  type SubstrateFederatedRewardSignerBindingV1,
} from './substrate-federated-isolated-devnet-reward-input-discovery-v1.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

const GENESIS_HEADER_ID = '91'.repeat(32);
const TIP_HEADER_ID = '92'.repeat(32);
const PUBLIC_KEY_HEX = `02${'22'.repeat(32)}`;
const FUNDING_TREE = `0008cd${PUBLIC_KEY_HEX}`;
const BASE_INPUT: Eip12Box = {
  boxId: 'f057d5272aae6fe107221adf6338a8c0d738e2f0179379594b4b3aa925827782',
  value: '2000000000',
  ergoTree: FUNDING_TREE,
  assets: [],
  additionalRegisters: {},
  creationHeight: 80,
  transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};
const REQUIREMENTS = Object.freeze({
  sourceAmountNanoErg: '20000000',
  sourceLockCreationFeeNanoErg: '1100000',
  reserveTransitionFeeNanoErg: '1100000',
});
const TARGET_A = Object.freeze({ role: 'deposit-target-a' });
const TARGET_B = Object.freeze({ role: 'deposit-target-b' });
const BINDING_A = Object.freeze({
  processBindingDigestHex: '11'.repeat(32),
  executionTargetIdentityDigestHex: '22'.repeat(32),
});
const BINDING_B = Object.freeze({
  processBindingDigestHex: '33'.repeat(32),
  executionTargetIdentityDigestHex: '44'.repeat(32),
});

interface MockNodeState {
  network: string;
  tipHeight: number;
  tipHeaderIdHex: string;
  genesisHeaderIds: string[];
  headerIdsByHeight: Map<number, string[]>;
  headersById: Map<string, Record<string, unknown>>;
  boxesByAddress: Map<string, readonly Eip12Box[]>;
}

interface Candidate {
  readonly value: string;
  readonly creationHeight: number;
  readonly ergoTree?: string;
  readonly assets?: ReadonlyArray<Eip12Box['assets'][number]>;
  readonly additionalRegisters?: Eip12Box['additionalRegisters'];
}

type BoxReadHook = (input: Readonly<{
  source: string;
  address: string;
  readIndex: number;
  boxes: readonly Eip12Box[];
}>) => readonly Eip12Box[];

beforeEach(() => {
  ownedTarget.assert.mockReset();
  ownedTarget.assert.mockImplementation(value => {
    if (value === TARGET_A) return BINDING_A;
    if (value === TARGET_B) return BINDING_B;
    throw new Error('target provenance missing');
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('deposit funding requirements', () => {
  it('creates the exact frozen amount and two construction-fee requirements', () => {
    const requirements =
      createSubstrateFederatedDepositFundingRequirementsV1('20000000');
    expect(requirements).toEqual(REQUIREMENTS);
    expect(Object.isFrozen(requirements)).toBe(true);
  });

  it.each([
    ['non-string amount', { ...REQUIREMENTS, sourceAmountNanoErg: 20_000_000 }],
    ['non-canonical amount', { ...REQUIREMENTS, sourceAmountNanoErg: '020000000' }],
    ['below-minimum amount', { ...REQUIREMENTS, sourceAmountNanoErg: '999999' }],
    ['zero creation fee', { ...REQUIREMENTS, sourceLockCreationFeeNanoErg: '0' }],
    ['zero transition fee', { ...REQUIREMENTS, reserveTransitionFeeNanoErg: '0' }],
    ['extra field', { ...REQUIREMENTS, extra: '1' }],
    ['missing source amount', {
      sourceLockCreationFeeNanoErg: REQUIREMENTS.sourceLockCreationFeeNanoErg,
      reserveTransitionFeeNanoErg: REQUIREMENTS.reserveTransitionFeeNanoErg,
    }],
    ['missing creation fee', {
      sourceAmountNanoErg: REQUIREMENTS.sourceAmountNanoErg,
      reserveTransitionFeeNanoErg: REQUIREMENTS.reserveTransitionFeeNanoErg,
    }],
    ['missing transition fee', {
      sourceAmountNanoErg: REQUIREMENTS.sourceAmountNanoErg,
      sourceLockCreationFeeNanoErg: REQUIREMENTS.sourceLockCreationFeeNanoErg,
    }],
    ['non-plain prototype', Object.assign(Object.create({ marker: true }), REQUIREMENTS)],
    ['source amount exceeds Long', { ...REQUIREMENTS, sourceAmountNanoErg: '9223372036854775808' }],
    ['creation fee exceeds Long', { ...REQUIREMENTS, sourceLockCreationFeeNanoErg: '9223372036854775808' }],
    ['transition fee exceeds Long', { ...REQUIREMENTS, reserveTransitionFeeNanoErg: '9223372036854775808' }],
    ['summed Long overflow', {
      sourceAmountNanoErg: '9223372036854775807',
      sourceLockCreationFeeNanoErg: '1',
      reserveTransitionFeeNanoErg: '1',
    }],
  ])('rejects %s before node I/O', async (_name, malformed) => {
    const info = vi.spyOn(
      AuthenticatedSpvTrackerReadOnlyNodeClient.prototype,
      'getInfo',
    );
    await expect(discoverSubstrateFederatedDepositFundingV1(
      signer(),
      malformed as never,
    )).rejects.toThrow();
    expect(info).not.toHaveBeenCalled();
  });

  it('rejects accessor-backed requirements without invoking the getter', () => {
    const getter = vi.fn(() => '20000000');
    const value = {
      sourceLockCreationFeeNanoErg: '1100000',
      reserveTransitionFeeNanoErg: '1100000',
    } as Record<string, unknown>;
    Object.defineProperty(value, 'sourceAmountNanoErg', {
      enumerable: true,
      get: getter,
    });
    expect(() => normalizeSubstrateFederatedDepositFundingRequirementsV1(value))
      .toThrow(/data property/);
    expect(getter).not.toHaveBeenCalled();
  });
});

describe('snapshot-anchored deposit funding selection', () => {
  it.each([
    ['isolated zero inventory', [], 120, /usable mature/i],
    ['immature input', [{ value: '300000000', creationHeight: 119 }], 120, /usable mature/i],
    ['post-anchor input', [{ value: '300000000', creationHeight: 121 }], 120, /creation height exceeds/i],
    ['wrong reward tree', [{
      value: '300000000', creationHeight: 100, ergoTree: FUNDING_TREE,
    }], 120, /exact signer reward ErgoTree/i],
    ['token-bearing input', [{
      value: '300000000', creationHeight: 100,
      assets: [{ tokenId: BASE_INPUT.boxId, amount: '1' }],
    }], 120, /pure ERG/i],
    ['register-bearing input', [{
      value: '300000000', creationHeight: 100,
      additionalRegisters: { R4: `0e20${'55'.repeat(32)}` },
    }], 120, /additional registers/i],
    ['underfunded input', [{ value: '22199999', creationHeight: 100 }], 120, /usable mature/i],
    ['one-nanoERG dust change', [{ value: '22200001', creationHeight: 100 }], 120, /usable mature/i],
    ['minimum-change-minus-one input', [{ value: '23199999', creationHeight: 100 }], 120, /usable mature/i],
  ] as const)('rejects %s', async (_name, candidates, tipHeight, error) => {
    const boxes = await canonicalBoxes(candidates);
    installNodeMocks(nodeStates({ delay1: boxes, tipHeight }));
    await expect(discoverSubstrateFederatedDepositFundingV1(
      signer(),
      REQUIREMENTS,
    )).rejects.toThrow(error);
  });

  it.each([
    ['exact fit', '22200000'],
    ['minimum positive change', '23200000'],
  ])('accepts %s', async (_name, value) => {
    const boxes = await canonicalBoxes([{ value, creationHeight: 100 }]);
    installNodeMocks(nodeStates({ delay1: boxes }));
    const report = await discoverSubstrateFederatedDepositFundingV1(
      signer(),
      REQUIREMENTS,
    );
    expect(report.fundingInput).toStrictEqual(boxes[0]);
    expect(report.fundingBoxId).toBe(boxes[0]!.boxId);
    expect(report.requirements).toEqual(REQUIREMENTS);
    expect(Object.isFrozen(report.requirements)).toBe(true);
    expect(Object.values(report.authorization).every(value => value === false))
      .toBe(true);
    expect(() => assertSubstrateFederatedDepositFundingV1Provenance(report))
      .not.toThrow();
  });

  it.each([2, 3])(
    'selects deterministically from %i sufficient inputs across source permutations',
    async count => {
      const boxes = await canonicalBoxes([
        { value: '300000000', creationHeight: 102 },
        { value: '300000000', creationHeight: 100 },
        { value: '300000000', creationHeight: 101 },
      ].slice(0, count));
      const states = nodeStates({ delay1: [...boxes].reverse() });
      states.get(SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN)!
        .boxesByAddress.set('reward-delay-1', [...boxes]);
      installNodeMocks(states);
      const report = await discoverSubstrateFederatedDepositFundingV1(
        signer(),
        REQUIREMENTS,
      );
      const expected = [...boxes].sort((left, right) =>
        left.creationHeight - right.creationHeight
          || left.boxId.localeCompare(right.boxId))[0]!;
      expect(report.fundingInput).toStrictEqual(expected);
      expect(report.inventory.usableRewardBoxCount).toBe(count);
    },
  );

  it('rejects ambiguity when both reward-delay profiles qualify', async () => {
    const delay1 = await canonicalBoxes([
      { value: '300000000', creationHeight: 100 },
    ], 1);
    const delay720 = await canonicalBoxes([
      { value: '300000000', creationHeight: 100 },
    ], 720);
    installNodeMocks(nodeStates({ delay1, delay720, tipHeight: 1000 }));
    await expect(discoverSubstrateFederatedDepositFundingV1(
      signer(), REQUIREMENTS,
    )).rejects.toThrow(/ambiguous/i);
  });

  it('rejects permanent disagreement between the two fixed sources', async () => {
    vi.useFakeTimers();
    const boxes = await canonicalBoxes([
      { value: '300000000', creationHeight: 100 },
      { value: '300000000', creationHeight: 101 },
    ]);
    const states = nodeStates({ delay1: boxes.slice(0, 1) });
    states.get(SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN)!
      .boxesByAddress.set('reward-delay-1', boxes.slice(1));
    installNodeMocks(states);
    const pending = discoverSubstrateFederatedDepositFundingV1(
      signer(), REQUIREMENTS,
    );
    const assertion = expect(pending).rejects.toThrow(/observations disagree/i);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('rejects repeated inventory drift within one source observation', async () => {
    const boxes = await canonicalBoxes([
      { value: '300000000', creationHeight: 100 },
      { value: '300000000', creationHeight: 101 },
    ]);
    installNodeMocks(nodeStates({ delay1: boxes }), input =>
      input.source === SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN
        && input.address === 'reward-delay-1'
        && input.readIndex === 1
        ? input.boxes.slice(1)
        : input.boxes);
    await expect(discoverSubstrateFederatedDepositFundingV1(
      signer(), REQUIREMENTS,
    )).rejects.toThrow(/inventory changed during discovery/i);
  });

  it('rejects a copied discovery report outside its WeakSet provenance', async () => {
    const boxes = await canonicalBoxes([
      { value: '300000000', creationHeight: 100 },
    ]);
    installNodeMocks(nodeStates({ delay1: boxes }));
    const report = await discoverSubstrateFederatedDepositFundingV1(
      signer(), REQUIREMENTS,
    );
    expect(() => assertSubstrateFederatedDepositFundingV1Provenance({
      ...report,
    })).toThrow(/not produced in this process/i);
  });
});

describe('owned deposit funding provenance', () => {
  it('accepts an equal requirement clone and returns the exact report', async () => {
    const boxes = await canonicalBoxes([
      { value: '300000000', creationHeight: 100 },
    ]);
    installNodeMocks(nodeStates({ delay1: boxes }));
    const owned =
      await discoverSubstrateFederatedDepositFundingForOwnedExecutionTargetV1(
        signer(), TARGET_A as never, REQUIREMENTS,
      );
    expect(
      assertSubstrateFederatedIsolatedDevnetOwnedDepositFundingDiscoveryV1(
        owned,
        TARGET_A as never,
        { ...REQUIREMENTS },
      ),
    ).toBe(owned.observation);
    expect(ownedTarget.assert).toHaveBeenCalledTimes(3);
  });

  it.each([
    'sourceAmountNanoErg',
    'sourceLockCreationFeeNanoErg',
    'reserveTransitionFeeNanoErg',
  ] as const)('rejects an independent %s mismatch', async key => {
    const boxes = await canonicalBoxes([
      { value: '300000000', creationHeight: 100 },
    ]);
    installNodeMocks(nodeStates({ delay1: boxes }));
    const owned =
      await discoverSubstrateFederatedDepositFundingForOwnedExecutionTargetV1(
        signer(), TARGET_A as never, REQUIREMENTS,
      );
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetOwnedDepositFundingDiscoveryV1(
        owned,
        TARGET_A as never,
        { ...REQUIREMENTS, [key]: (BigInt(REQUIREMENTS[key]) + 1n).toString() },
      )
    ).toThrow(/request provenance/i);
  });

  it('rejects copied owned evidence and a target swap', async () => {
    const boxes = await canonicalBoxes([
      { value: '300000000', creationHeight: 100 },
    ]);
    installNodeMocks(nodeStates({ delay1: boxes }));
    const owned =
      await discoverSubstrateFederatedDepositFundingForOwnedExecutionTargetV1(
        signer(), TARGET_A as never, REQUIREMENTS,
      );
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetOwnedDepositFundingDiscoveryV1(
        { ...owned } as never,
        TARGET_A as never,
        REQUIREMENTS,
      )
    ).toThrow(/provenance/i);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetOwnedDepositFundingDiscoveryV1(
        owned,
        TARGET_B as never,
        REQUIREMENTS,
      )
    ).toThrow(/provenance/i);
  });

  it('rejects before/after target drift during discovery', async () => {
    const boxes = await canonicalBoxes([
      { value: '300000000', creationHeight: 100 },
    ]);
    installNodeMocks(nodeStates({ delay1: boxes }));
    ownedTarget.assert
      .mockReturnValueOnce(BINDING_A)
      .mockReturnValueOnce(BINDING_B);
    await expect(
      discoverSubstrateFederatedDepositFundingForOwnedExecutionTargetV1(
        signer(), TARGET_A as never, REQUIREMENTS,
      ),
    ).rejects.toThrow(/changed during discovery/i);
  });

  it('rejects current target-binding drift after discovery', async () => {
    const boxes = await canonicalBoxes([
      { value: '300000000', creationHeight: 100 },
    ]);
    installNodeMocks(nodeStates({ delay1: boxes }));
    const owned =
      await discoverSubstrateFederatedDepositFundingForOwnedExecutionTargetV1(
        signer(), TARGET_A as never, REQUIREMENTS,
      );
    ownedTarget.assert.mockReturnValue(BINDING_B);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetOwnedDepositFundingDiscoveryV1(
        owned, TARGET_A as never, REQUIREMENTS,
      )
    ).toThrow(/provenance/i);
  });

  it('keeps genesis and deposit owned provenance families disjoint', async () => {
    const boxes = await canonicalBoxes([
      { value: '300000000', creationHeight: 100 },
      { value: '300000000', creationHeight: 101 },
      { value: '300000000', creationHeight: 102 },
    ]);
    installNodeMocks(nodeStates({ delay1: boxes }));
    const genesis =
      await discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1(
        signer(), TARGET_A as never,
      );
    const deposit =
      await discoverSubstrateFederatedDepositFundingForOwnedExecutionTargetV1(
        signer(), TARGET_A as never, REQUIREMENTS,
      );
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetOwnedDepositFundingDiscoveryV1(
        genesis as never, TARGET_A as never, REQUIREMENTS,
      )
    ).toThrow(/provenance/i);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetOwnedRewardInputDiscoveryV1(
        deposit as never, TARGET_A as never,
      )
    ).toThrow(/provenance/i);
  });
});

function signer(): SubstrateFederatedRewardSignerBindingV1 {
  return {
    publicKeyHex: PUBLIC_KEY_HEX,
    p2pkErgoTreeHex: FUNDING_TREE,
    rewardInputErgoTrees: {
      delay1: deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 1),
      delay720: deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 720),
    },
    networkPrefix: 16,
  };
}

async function canonicalBoxes(
  candidates: readonly Candidate[],
  rewardDelayBlocks: 1 | 720 = 1,
): Promise<readonly Eip12Box[]> {
  const change = BigInt(BASE_INPUT.value)
    - candidates.reduce((sum, candidate) => sum + BigInt(candidate.value), 0n);
  expect(change).toBeGreaterThanOrEqual(0n);
  const rewardTree = deriveDevnetRewardErgoTreeHexForDelay(
    PUBLIC_KEY_HEX,
    rewardDelayBlocks,
  );
  const transaction = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [...candidates.map(candidate => ({
      value: candidate.value,
      ergoTree: candidate.ergoTree ?? rewardTree,
      assets: [...(candidate.assets ?? [])],
      additionalRegisters: candidate.additionalRegisters ?? {},
      creationHeight: candidate.creationHeight,
    })), ...(change === 0n ? [] : [{
      value: change.toString(),
      ergoTree: BASE_INPUT.ergoTree,
      assets: [],
      additionalRegisters: {},
      creationHeight: BASE_INPUT.creationHeight,
    }])],
  }, 'deposit funding discovery fixture');
  return transaction.outputs.slice(0, candidates.length);
}

function nodeStates(input: Readonly<{
  delay1?: readonly Eip12Box[];
  delay720?: readonly Eip12Box[];
  tipHeight?: number;
}>): Map<string, MockNodeState> {
  const create = (): MockNodeState => ({
    network: 'devnet',
    tipHeight: input.tipHeight ?? 120,
    tipHeaderIdHex: TIP_HEADER_ID,
    genesisHeaderIds: [GENESIS_HEADER_ID],
    headerIdsByHeight: new Map([
      [1, [GENESIS_HEADER_ID]],
      [119, ['93'.repeat(32)]],
      [input.tipHeight ?? 120, [TIP_HEADER_ID]],
    ]),
    headersById: new Map(),
    boxesByAddress: new Map([
      ['reward-delay-1', input.delay1 ?? []],
      ['reward-delay-720', input.delay720 ?? []],
    ]),
  });
  return new Map([
    [SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN, create()],
    [SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN, create()],
  ]);
}

function installNodeMocks(
  states: Map<string, MockNodeState>,
  readHook?: BoxReadHook,
): void {
  const readCounts = new Map<string, number>();
  const state = (client: AuthenticatedSpvTrackerReadOnlyNodeClient) => {
    const found = states.get(client.observationSourceId);
    if (!found) throw new Error(`unexpected source ${client.observationSourceId}`);
    return found;
  };
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getInfo')
    .mockImplementation(async function (this: AuthenticatedSpvTrackerReadOnlyNodeClient) {
      const current = state(this);
      return { network: current.network, fullHeight: current.tipHeight,
        bestFullHeaderId: current.tipHeaderIdHex };
    });
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getBestHeader')
    .mockImplementation(async function (this: AuthenticatedSpvTrackerReadOnlyNodeClient) {
      const current = state(this);
      return current.headersById.get(current.tipHeaderIdHex)
        ?? { id: current.tipHeaderIdHex, height: current.tipHeight,
          parentId: '90'.repeat(32) };
    });
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype,
    'getBlockHeaderIdsAtHeight').mockImplementation(async function (this: AuthenticatedSpvTrackerReadOnlyNodeClient, height) {
      const current = state(this);
      return [...(current.headerIdsByHeight.get(height)
        ?? (height === 1 ? current.genesisHeaderIds : []))];
    });
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype,
    'getBlockHeaderChainSlice').mockImplementation(async function (
      this: AuthenticatedSpvTrackerReadOnlyNodeClient,
      fromHeight,
      toHeight,
    ) {
      const current = state(this);
      return Array.from({ length: toHeight - fromHeight }, (_, index) => {
        const height = fromHeight + index + 1;
        const id = current.headerIdsByHeight.get(height)?.[0];
        if (id === undefined) throw new Error(`missing fixture header at ${height}`);
        return current.headersById.get(id)
          ?? { id, height, parentId: '90'.repeat(32) };
      });
    });
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype,
    'getBlockHeaderById').mockImplementation(async function (this: AuthenticatedSpvTrackerReadOnlyNodeClient, headerId) {
      return state(this).headersById.get(headerId) ?? null;
    });
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype,
    'getAddressForErgoTree').mockImplementation(async function (ergoTreeHex) {
      if (ergoTreeHex
        === deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 1)) {
        return 'reward-delay-1';
      }
      if (ergoTreeHex
        === deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 720)) {
        return 'reward-delay-720';
      }
      throw new Error('unexpected reward tree');
    });
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype,
    'getUnspentBoxesByAddressPage').mockImplementation(async function (
      this: AuthenticatedSpvTrackerReadOnlyNodeClient,
      address,
      page,
    ) {
      const boxes = state(this).boxesByAddress.get(address) ?? [];
      const key = `${this.observationSourceId}\0${address}`;
      const readIndex = readCounts.get(key) ?? 0;
      readCounts.set(key, readIndex + 1);
      const selected = readHook?.({
        source: this.observationSourceId,
        address,
        readIndex,
        boxes,
      }) ?? boxes;
      return [...selected].slice(page.offset, page.offset + page.limit);
    });
}
