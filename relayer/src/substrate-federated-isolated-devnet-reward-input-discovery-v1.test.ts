import { readFileSync } from 'node:fs';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AuthenticatedSpvTrackerReadOnlyNodeClient,
} from './authenticated-spv-tracker-read-only-node-client.js';
import {
  computeErgoHeaderId,
  type ErgoHeaderIdentityFields,
} from './ergo-settlement-core/ergo-header-id.js';
import {
  deriveDevnetRewardErgoTreeHexForDelay,
} from './relayer-core/devnet-reward-consolidation.js';
import {
  discoverSubstrateFederatedRewardInputsV1,
  discoverSubstrateFederatedRewardInputsV2,
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  type SubstrateFederatedRewardSignerBindingV1,
} from './substrate-federated-isolated-devnet-reward-input-discovery-v1.js';
import {
  createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2,
} from './substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

const GENESIS_HEADER_ID = '91'.repeat(32);
const TIP_HEADER_ID = '92'.repeat(32);
const PUBLIC_KEY_HEX = `02${'22'.repeat(32)}`;
const FUNDING_TREE = `0008cd02${'22'.repeat(32)}`;
const BASE_INPUT: Eip12Box = {
  boxId: '8f25f8b850290c20b9f3568eba3604bee2f4e2d7167c7ea68f2943997ea742a5',
  value: '300000000',
  ergoTree: FUNDING_TREE,
  assets: [],
  additionalRegisters: {},
  creationHeight: 110,
  transactionId: '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};

interface MockNodeState {
  network: string;
  tipHeight: number;
  tipHeaderIdHex: string;
  genesisHeaderIds: string[];
  headerIdsByHeight: Map<number, string[]>;
  headersById: Map<string, Record<string, unknown>>;
  boxesByAddress: Map<string, readonly Eip12Box[]>;
}

let delay1Boxes: readonly Eip12Box[];
let delay720Boxes: readonly Eip12Box[];

beforeAll(async () => {
  delay1Boxes = await rewardBoxes(
    deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 1),
  );
  delay720Boxes = await rewardBoxes(
    deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 720),
  );
});

afterEach(() => vi.restoreAllMocks());

describe('Substrate federated isolated-devnet reward input discovery V1', () => {
  it('consumes the exact public binding exposed by a fresh signer-first session', async () => {
    const session =
      await createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2();
    try {
      const boxes = await rewardBoxes(session.signer.rewardInputErgoTrees.delay1);
      installNodeMocks(
        nodeStates({ delay1: boxes }),
        session.signer.publicKeyHex,
      );

      const report = await discoverSubstrateFederatedRewardInputsV1(
        session.signer,
      );
      expect(report.signer).toMatchObject({
        publicKeyHex: session.signer.publicKeyHex,
        p2pkErgoTreeHex: session.signer.p2pkErgoTreeHex,
        rewardDelayBlocks: 1,
        rewardInputErgoTreeHex: session.signer.rewardInputErgoTrees.delay1,
      });
    } finally {
      session.dispose();
    }
  });

  it('selects three deterministic mature pure-ERG inputs agreed by both fixed nodes', async () => {
    const states = nodeStates({ delay1: delay1Boxes });
    states.get(SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN)!
      .boxesByAddress.set('reward-delay-1', [...delay1Boxes].reverse());
    installNodeMocks(states);

    const report = await discoverSubstrateFederatedRewardInputsV1(signer());
    const expected = [...delay1Boxes]
      .sort((left, right) => left.creationHeight - right.creationHeight
        || left.boxId.localeCompare(right.boxId))
      .slice(0, 3);

    expect(report).toMatchObject({
      status: 'agreed_non_authorizing_reward_inputs',
      sources: {
        primaryNodeOrigin: SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
        witnessNodeOrigin: SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
      },
      target: {
        network: 'devnet',
        genesisHeaderHeight: 1,
        genesisHeaderIdHex: GENESIS_HEADER_ID,
        tipHeight: 120,
        tipHeaderIdHex: TIP_HEADER_ID,
      },
      signer: {
        publicKeyHex: PUBLIC_KEY_HEX,
        p2pkErgoTreeHex: `0008cd${PUBLIC_KEY_HEX}`,
        rewardDelayBlocks: 1,
        rewardInputErgoTreeHex:
          deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 1),
        rewardAddress: 'reward-delay-1',
      },
      inventory: {
        observedRewardBoxCount: 4,
        matureRewardBoxCount: 4,
        usableRewardBoxCount: 4,
        requiredAgeBlocks: 2,
      },
      genesisBoxIds: {
        tracker: expected[0]!.boxId,
        duplicatePrevention: expected[1]!.boxId,
        pooledReserve: expected[2]!.boxId,
      },
    });
    expect(report.genesisInputs).toEqual({
      tracker: expected[0],
      duplicatePrevention: expected[1],
      pooledReserve: expected[2],
    });
    expect(report.reportDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(report.genesisInputs.tracker)).toBe(true);
    expect(Object.values(report.authorization).every(value => value === false)).toBe(true);
    expect(report.boundary).toEqual({
      fixedDualLoopbackOrigins: true,
      getOnlyNodeRequests: true,
      exactPublicSignerBinding: true,
      stableMatchingTargetSnapshot: true,
      exactCanonicalBoxIdsRecomputed: true,
      exactRewardTreeMatched: true,
      pairwiseDistinctPureErgRegisterFreeInputs: true,
      targetBinaryRevalidationRequired: true,
      signerOrWalletMaterialRead: false,
      sessionSignerProvenanceAuthenticated: false,
      tipAndUtxoObservedAtomically: false,
      nodeExecutableIdentityAuthenticated: false,
      independentNodeControlVerified: false,
      canonicalConsensusEstablished: false,
    });
  });

  it('fails closed when the two fixed nodes disagree on the reward inventory', async () => {
    const begin = vi.spyOn(
      AuthenticatedSpvTrackerReadOnlyNodeClient.prototype,
      'beginAuthenticatedTrackerReconstruction',
    );
    const end = vi.spyOn(
      AuthenticatedSpvTrackerReadOnlyNodeClient.prototype,
      'endAuthenticatedTrackerReconstruction',
    );
    const states = nodeStates({ delay1: delay1Boxes });
    states.get(SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN)!
      .boxesByAddress.set('reward-delay-1', delay1Boxes.slice(0, 3));
    installNodeMocks(states);

    await expect(discoverSubstrateFederatedRewardInputsV1(signer()))
      .rejects.toThrow(/observations disagree/i);
    expect(begin).toHaveBeenCalledTimes(2);
    expect(end).toHaveBeenCalledTimes(2);
  });

  it('rejects reward inventory drift while the header tip remains unchanged', async () => {
    const states = nodeStates({ delay1: delay1Boxes });
    installNodeMocks(states, PUBLIC_KEY_HEX, input => (
      input.source === SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN
      && input.address === 'reward-delay-1'
      && input.readIndex > 0
        ? input.boxes.slice(1)
        : input.boxes
    ));

    await expect(discoverSubstrateFederatedRewardInputsV1(signer()))
      .rejects.toThrow(/reward inventory changed during discovery/i);
  });

  it('keeps V1 strict when the target extends during discovery', async () => {
    const states = nodeStates({ delay1: delay1Boxes });
    installNodeMocks(states, PUBLIC_KEY_HEX, input => {
      const current = states.get(input.source)!;
      current.tipHeight = 121;
      current.tipHeaderIdHex = '33'.repeat(32);
      return input.boxes;
    });

    await expect(discoverSubstrateFederatedRewardInputsV1(signer()))
      .rejects.toThrow(/target changed during discovery/i);
  });

  it('V2 excludes validated post-anchor rewards across a canonical extension', async () => {
    const rewardTree = deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 1);
    const boxes = await rewardBoxesForCandidates(rewardTree, [
      { value: '75000000', creationHeight: 100 },
      { value: '75000000', creationHeight: 100 },
      { value: '75000000', creationHeight: 100 },
      { value: '75000000', creationHeight: 121 },
    ]);
    const states = nodeStates({ delay1: boxes });
    for (const current of states.values()) {
      current.headerIdsByHeight.set(120, ['44'.repeat(32), TIP_HEADER_ID]);
    }
    installNodeMocks(states, PUBLIC_KEY_HEX, input => {
      const current = states.get(input.source)!;
      if (current.tipHeight === 120) {
        appendHeader(current, TIP_HEADER_ID, 121, 'canonical-extension');
      }
      return input.boxes;
    });

    const report = await discoverSubstrateFederatedRewardInputsV2(signer());

    expect(report.target).toMatchObject({
      tipHeight: 120,
      tipHeaderIdHex: TIP_HEADER_ID,
    });
    expect(report.inventory).toMatchObject({
      anchorRewardBoxCount: 3,
      matureRewardBoxCount: 3,
      usableRewardBoxCount: 3,
    });
    expect(Object.values(report.genesisInputs).every(
      box => box.creationHeight === 100,
    )).toBe(true);
  });

  it.each([
    {
      name: 'same-height replacement',
      mutate: (state: MockNodeState) => {
        state.tipHeaderIdHex = '35'.repeat(32);
      },
    },
    {
      name: 'rollback below the anchor',
      mutate: (state: MockNodeState) => {
        state.tipHeight = 119;
        state.tipHeaderIdHex = '36'.repeat(32);
      },
    },
    {
      name: 'extension on a replacement parent',
      mutate: (state: MockNodeState) => {
        appendHeader(state, '37'.repeat(32), 121, 'replacement-extension');
      },
    },
  ])('V2 rejects $name', async ({ mutate }) => {
    const states = nodeStates({ delay1: delay1Boxes });
    installNodeMocks(states, PUBLIC_KEY_HEX, input => {
      const current = states.get(input.source)!;
      if (input.readIndex === 0) mutate(current);
      return input.boxes;
    });

    await expect(discoverSubstrateFederatedRewardInputsV2(signer()))
      .rejects.toThrow(/target changed during discovery/i);
  });

  it('rejects ambiguous active reward-delay profiles', async () => {
    installNodeMocks(nodeStates({
      delay1: delay1Boxes,
      delay720: delay720Boxes,
      tipHeight: 1_000,
    }));

    await expect(discoverSubstrateFederatedRewardInputsV1(signer()))
      .rejects.toThrow(/ambiguous reward-delay/i);
  });

  it('rejects an address inventory beyond the explicit pagination bound', async () => {
    const oversized = Array.from(
      { length: 4_097 },
      () => ({}) as Eip12Box,
    );
    installNodeMocks(nodeStates({ delay1: oversized }));

    await expect(discoverSubstrateFederatedRewardInputsV1(signer()))
      .rejects.toThrow(/4096-box bound/i);
  });

  it('skips older mature boxes that cannot fund the exact V1 issuance shape', async () => {
    const rewardTree = deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 1);
    const boxes = await rewardBoxesForCandidates(rewardTree, [
      { value: '11500000', creationHeight: 90 },
      { value: '11500000', creationHeight: 90 },
      { value: '11500000', creationHeight: 90 },
      { value: '88500000', creationHeight: 100 },
      { value: '88500000', creationHeight: 100 },
      { value: '88500000', creationHeight: 100 },
    ]);
    installNodeMocks(nodeStates({ delay1: boxes }));

    const report = await discoverSubstrateFederatedRewardInputsV1(signer());
    expect(report.inventory).toMatchObject({
      observedRewardBoxCount: 6,
      matureRewardBoxCount: 6,
      usableRewardBoxCount: 3,
    });
    expect(Object.values(report.genesisInputs).map(box => box.value))
      .toEqual(['88500000', '88500000', '88500000']);
  });

  it('rejects immature inputs and signer-tree drift before setup construction', async () => {
    installNodeMocks(nodeStates({ delay1: delay1Boxes, tipHeight: 101 }));
    await expect(discoverSubstrateFederatedRewardInputsV1(signer()))
      .rejects.toThrow(/three usable mature signer reward inputs/i);

    const exactSigner = signer();
    const drifted = {
      ...exactSigner,
      rewardInputErgoTrees: {
        ...exactSigner.rewardInputErgoTrees,
        delay1: `00${exactSigner.rewardInputErgoTrees.delay1}`,
      },
    };
    await expect(discoverSubstrateFederatedRewardInputsV1(drifted))
      .rejects.toThrow(/trees do not match/i);
  });

  it('isolates every reward-box predicate before selecting setup inputs', async () => {
    const rewardTree = deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 1);
    const cases = [
      {
        boxes: await rewardBoxes(rewardTree, { ergoTree: FUNDING_TREE }),
        error: /exact signer reward ErgoTree/i,
      },
      {
        boxes: await rewardBoxes(rewardTree, {
          assets: [{ tokenId: BASE_INPUT.boxId, amount: '1' }],
        }),
        error: /pure ERG only/i,
      },
      {
        boxes: await rewardBoxes(rewardTree, {
          additionalRegisters: { R4: '0e0101' },
        }),
        error: /additional registers/i,
      },
      {
        boxes: await rewardBoxes(rewardTree, { creationHeight: 121 }),
        error: /creation height exceeds/i,
      },
    ];

    for (const testCase of cases) {
      vi.restoreAllMocks();
      installNodeMocks(nodeStates({ delay1: testCase.boxes }));
      await expect(discoverSubstrateFederatedRewardInputsV1(signer()))
        .rejects.toThrow(testCase.error);
    }
  });

  it('keeps the discovery source credential-free and without transaction capabilities', () => {
    const source = readFileSync(new URL(
      './substrate-federated-isolated-devnet-reward-input-discovery-v1.ts',
      import.meta.url,
    ), 'utf8');
    expect(source).not.toContain('process.env');
    expect(source).not.toContain('api_key');
    expect(source).not.toContain('.post(');
    expect(source).not.toContain('Mnemonic');
    expect(source).not.toContain('submitTransaction');
    expect(source).not.toContain('checkTransaction');
  });
});

function signer(): SubstrateFederatedRewardSignerBindingV1 {
  return {
    publicKeyHex: PUBLIC_KEY_HEX,
    p2pkErgoTreeHex: `0008cd${PUBLIC_KEY_HEX}`,
    rewardInputErgoTrees: {
      delay1: deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 1),
      delay720: deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 720),
    },
    networkPrefix: 16,
  };
}

async function rewardBoxes(
  ergoTree: string,
  firstOutput: Readonly<{
    ergoTree?: string;
    assets?: Array<{ tokenId: string; amount: string }>;
    additionalRegisters?: Record<string, string>;
    creationHeight?: number;
  }> = {},
): Promise<readonly Eip12Box[]> {
  const materialized = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [
      { value: '50000000', ergoTree, creationHeight: 100, ...firstOutput },
      { value: '60000000', ergoTree, creationHeight: 100 },
      { value: '70000000', ergoTree, creationHeight: 100 },
      { value: '120000000', ergoTree, creationHeight: 100 },
    ],
  }, 'reward-input discovery fixture');
  return materialized.outputs;
}

async function rewardBoxesForCandidates(
  ergoTree: string,
  candidates: readonly Readonly<{
    value: string;
    creationHeight: number;
  }>[],
): Promise<readonly Eip12Box[]> {
  const materialized = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: candidates.map(candidate => ({
      value: candidate.value,
      ergoTree,
      creationHeight: candidate.creationHeight,
    })),
  }, 'reward-input funding-eligibility fixture');
  return materialized.outputs;
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

function appendHeader(
  state: MockNodeState,
  parentId: string,
  height: number,
  label: string,
): string {
  const identity: ErgoHeaderIdentityFields = {
    version: 2,
    parentId: Buffer.from(parentId, 'hex'),
    adProofsRoot: fixedBytes(`${label}-ad-${height}`, 32),
    stateRoot: fixedBytes(`${label}-state-${height}`, 33),
    transactionsRoot: fixedBytes(`${label}-transactions-${height}`, 32),
    timestamp: 1_730_000_000_000n + BigInt(height),
    nBits: 117_440_511,
    height,
    extensionHash: fixedBytes(`${label}-extension-${height}`, 32),
    votes: Buffer.alloc(3),
    unparsedBytes: Buffer.alloc(0),
    powSolution: {
      publicKey: Buffer.from(PUBLIC_KEY_HEX, 'hex'),
      nonce: Buffer.from(height.toString(16).padStart(16, '0'), 'hex'),
    },
  };
  const id = computeErgoHeaderId(identity).toString('hex');
  state.headersById.set(id, {
    id,
    parentId,
    height,
    version: identity.version,
    adProofsRoot: Buffer.from(identity.adProofsRoot).toString('hex'),
    stateRoot: Buffer.from(identity.stateRoot).toString('hex'),
    transactionsRoot: Buffer.from(identity.transactionsRoot).toString('hex'),
    timestamp: Number(identity.timestamp),
    nBits: identity.nBits,
    extensionHash: Buffer.from(identity.extensionHash).toString('hex'),
    powSolutions: {
      pk: PUBLIC_KEY_HEX,
      n: Buffer.from(identity.powSolution.nonce).toString('hex'),
    },
    votes: '000000',
  });
  state.tipHeight = height;
  state.tipHeaderIdHex = id;
  return id;
}

function fixedBytes(label: string, length: number): Buffer {
  const bytes = Buffer.alloc(length);
  const seed = Buffer.from(label, 'utf8');
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = seed[index % seed.length]!;
  }
  return bytes;
}

function installNodeMocks(
  states: Map<string, MockNodeState>,
  publicKeyHex = PUBLIC_KEY_HEX,
  inventoryOverride?: (input: Readonly<{
    source: string;
    address: string;
    readIndex: number;
    boxes: readonly Eip12Box[];
  }>) => readonly Eip12Box[],
): void {
  const readCounts = new Map<string, number>();
  const state = (client: AuthenticatedSpvTrackerReadOnlyNodeClient) => {
    const found = states.get(client.observationSourceId);
    if (!found) throw new Error(`unexpected source ${client.observationSourceId}`);
    return found;
  };
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getInfo')
    .mockImplementation(async function (
      this: AuthenticatedSpvTrackerReadOnlyNodeClient,
    ) {
      const current = state(this);
      return { network: current.network, fullHeight: current.tipHeight };
    });
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getBestHeader')
    .mockImplementation(async function (
      this: AuthenticatedSpvTrackerReadOnlyNodeClient,
    ) {
      const current = state(this);
      return { id: current.tipHeaderIdHex, height: current.tipHeight };
    });
  vi.spyOn(
    AuthenticatedSpvTrackerReadOnlyNodeClient.prototype,
    'getBlockHeaderIdsAtHeight',
  ).mockImplementation(async function (
    this: AuthenticatedSpvTrackerReadOnlyNodeClient,
    height,
  ) {
    const current = state(this);
    return [...(
      current.headerIdsByHeight.get(height)
      ?? (height === 1 ? current.genesisHeaderIds : [])
    )];
  });
  vi.spyOn(
    AuthenticatedSpvTrackerReadOnlyNodeClient.prototype,
    'getBlockHeaderById',
  ).mockImplementation(async function (
    this: AuthenticatedSpvTrackerReadOnlyNodeClient,
    headerId,
  ) {
    return state(this).headersById.get(headerId) ?? null;
  });
  vi.spyOn(
    AuthenticatedSpvTrackerReadOnlyNodeClient.prototype,
    'getAddressForErgoTree',
  ).mockImplementation(async function (
    this: AuthenticatedSpvTrackerReadOnlyNodeClient,
    ergoTreeHex,
  ) {
    if (ergoTreeHex === deriveDevnetRewardErgoTreeHexForDelay(publicKeyHex, 1)) {
      return 'reward-delay-1';
    }
    if (ergoTreeHex === deriveDevnetRewardErgoTreeHexForDelay(publicKeyHex, 720)) {
      return 'reward-delay-720';
    }
    throw new Error('unexpected reward tree');
  });
  vi.spyOn(
    AuthenticatedSpvTrackerReadOnlyNodeClient.prototype,
    'getUnspentBoxesByAddressPage',
  ).mockImplementation(async function (
    this: AuthenticatedSpvTrackerReadOnlyNodeClient,
    address,
    page,
  ) {
    const boxes = state(this).boxesByAddress.get(address) ?? [];
    const key = `${this.observationSourceId}\0${address}`;
    const readIndex = readCounts.get(key) ?? 0;
    readCounts.set(key, readIndex + 1);
    const selected = inventoryOverride?.({
      source: this.observationSourceId,
      address,
      readIndex,
      boxes,
    }) ?? boxes;
    return [...selected]
      .slice(page.offset, page.offset + page.limit);
  });
}
