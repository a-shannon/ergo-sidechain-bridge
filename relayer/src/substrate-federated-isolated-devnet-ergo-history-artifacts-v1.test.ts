import { readFileSync } from 'node:fs';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AuthenticatedSpvTrackerReadOnlyNodeClient,
} from './authenticated-spv-tracker-read-only-node-client.js';
import {
  computeErgoBlockTransactionsRoot,
} from './ergo-settlement-core/ergo-block-transactions-root.js';
import {
  computeErgoHeaderId,
  type ErgoHeaderIdentityFields,
} from './ergo-settlement-core/ergo-header-id.js';
import { canonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  deriveDevnetRewardErgoTreeHexForDelay,
} from './relayer-core/devnet-reward-consolidation.js';
import {
  assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1Provenance,
  assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2Provenance,
  collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1,
  collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HEADERS_V1_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_TRANSACTIONS_V1_SCHEMA,
} from './substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js';
import {
  discoverSubstrateFederatedRewardInputsV1,
  discoverSubstrateFederatedRewardInputsV2,
  SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
  SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
  type SubstrateFederatedRewardSignerBindingV1,
} from './substrate-federated-isolated-devnet-reward-input-discovery-v1.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_UTXO_HISTORY_V1_SCHEMA,
} from './substrate-federated-isolated-devnet-portable-replay-v1.js';
import {
  materializeUnsignedTransaction,
  type Eip12Box,
  type MaterializedUnsignedTransaction,
} from './unsigned-ergo-transaction.js';

const PUBLIC_KEY_HEX =
  '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const FUNDING_TREE = `0008cd${PUBLIC_KEY_HEX}`;
const REWARD_TREE = deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 1);
const BASE_INPUT: Eip12Box = {
  boxId: '9540cc03da4c636913bb235d71c3f69a64e79aa70f8edd55d57b66ac99a7f034',
  value: '300000000',
  ergoTree: FUNDING_TREE,
  assets: [],
  additionalRegisters: {},
  creationHeight: 1,
  transactionId:
    '950cd6f0a49a53a05d67908dcbc367273fea828c046d2ad58c0ee0c7f59e81ab',
  index: 0,
};

interface NodeHeader extends Record<string, unknown> {
  id: string;
  parentId: string;
  height: number;
}

interface NodeState {
  readonly headers: Map<string, NodeHeader>;
  bestHeaderId: string;
  readonly blocks: Map<string, Record<string, unknown>>;
  readonly transactions: Map<string, Record<string, unknown>>;
  readonly rewardBoxes: readonly Eip12Box[];
  readonly utxos: Map<string, Eip12Box>;
}

interface Fixture {
  readonly materialized: MaterializedUnsignedTransaction;
  readonly signedTransaction: Record<string, unknown>;
  readonly headers: readonly NodeHeader[];
  readonly block: Record<string, unknown>;
}

let fixture: Fixture;

beforeAll(async () => {
  fixture = await buildFixture();
});

afterEach(() => vi.restoreAllMocks());

describe('Substrate federated isolated-devnet Ergo history artifacts V1', () => {
  it('materializes canonical header, transaction and UTXO manifests from G1dH', async () => {
    installNodeMocks(nodeStates());
    const discovery = await discoverSubstrateFederatedRewardInputsV1(signer());
    const history =
      await collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1(
        discovery,
      );
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1Provenance(
        history,
      )).not.toThrow();
    expect(history.receipt).toMatchObject({
      status: 'matching_non_authorizing_ergo_history',
      rewardInputDiscoveryDigestHex: discovery.reportDigestHex,
      target: {
        network: 'devnet',
        genesisHeaderIdHex: fixture.headers[0]!.id,
        genesisHeight: 1,
        setupAnchorHeaderIdHex: fixture.headers[2]!.id,
        setupAnchorHeight: 3,
        headerCount: 3,
      },
      genesisBoxIds: discovery.genesisBoxIds,
    });
    expect(Object.values(history.receipt.authorization).every(
      value => value === false,
    )).toBe(true);
    expect(history.receipt.boundaries).toMatchObject({
      nodeReportedBestChainIsObservationOnly: true,
      headerDifficultyTransitionsAuthenticated: false,
      claimedProofOfWorkVerified: false,
      globallyGreatestWorkEstablished: false,
      ergoConsensusIndependentlyAuthenticated: false,
    });

    const headers = parseManifest(
      history.artifacts.greatestWorkHeadersManifest,
    ) as any;
    expect(headers.schema)
      .toBe(SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_HEADERS_V1_SCHEMA);
    expect(headers.headers).toHaveLength(3);
    expect(headers.headers.map((value: any) => value.headerIdHex))
      .toEqual(fixture.headers.map(value => value.id));
    expect(headers.headers.map((value: any) => value.version))
      .toEqual([1, 2, 2]);
    expect(headers.boundaries).toMatchObject({
      headerIdsAndParentsRecomputed: true,
      difficultyTransitionsAuthenticated: false,
      proofOfWorkVerified: false,
    });

    const transactions = parseManifest(
      history.artifacts.transactionsManifest,
    ) as any;
    expect(transactions.schema)
      .toBe(SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_TRANSACTIONS_V1_SCHEMA);
    expect(transactions.transactions).toHaveLength(1);
    expect(transactions.transactions[0]).toMatchObject({
      transactionIdHex: fixture.materialized.txId,
      inclusionHeaderIdHex: fixture.headers[1]!.id,
      inclusionHeight: 2,
      transactionIndex: 0,
      transactionCount: 1,
    });
    expect(transactions.selectedOutputs.map((value: any) => value.role))
      .toEqual(['tracker', 'duplicatePrevention', 'pooledReserve']);
    expect(transactions.selectedOutputs.map((value: any) => value.inclusionHeight))
      .toEqual([2, 2, 2]);
    expect(Object.values(discovery.genesisInputs).map(value => value.creationHeight))
      .toEqual([1, 1, 1]);

    const utxo = parseManifest(
      history.artifacts.utxoTransitionsManifest,
    ) as any;
    expect(utxo.schema)
      .toBe(SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_UTXO_HISTORY_V1_SCHEMA);
    expect(utxo.genesisInputs).toEqual(discovery.genesisInputs);
  });

  it('uses header-bound block bytes instead of enriched indexed inputs', async () => {
    const states = nodeStates();
    for (const state of states.values()) {
      const indexed = state.transactions.get(fixture.materialized.txId)!;
      const inputs = indexed.inputs as Array<Record<string, unknown>>;
      inputs[0] = {
        ...inputs[0],
        value: '9007199254740993',
        ergoTree: FUNDING_TREE,
      };
    }
    installNodeMocks(states);
    const discovery = await discoverSubstrateFederatedRewardInputsV1(signer());
    const history =
      await collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1(
        discovery,
      );
    const transactions = parseManifest(
      history.artifacts.transactionsManifest,
    ) as any;
    expect(transactions.transactions[0].signedTransaction.inputs[0])
      .not.toHaveProperty('value');
  });

  it('keeps V1 strict when the target extends during history collection', async () => {
    const states = nodeStates();
    installNodeMocks(states);
    const discovery = await discoverSubstrateFederatedRewardInputsV1(signer());
    for (const state of states.values()) {
      appendHeader(state, state.bestHeaderId, 'canonical-extension');
    }

    await expect(
      collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1(discovery),
    ).rejects.toThrow(/differs from reward-input discovery/i);
  });

  it('V2 keeps the discovery tip as the anchor across canonical extensions', async () => {
    const states = nodeStates();
    installNodeMocks(states);
    const discovery = await discoverSubstrateFederatedRewardInputsV2(signer());
    for (const state of states.values()) {
      appendHeader(state, state.bestHeaderId, 'canonical-extension');
    }

    const history =
      await collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2(
        discovery,
      );

    expect(history.receipt.target).toMatchObject({
      setupAnchorHeaderIdHex: discovery.target.tipHeaderIdHex,
      setupAnchorHeight: discovery.target.tipHeight,
      headerCount: discovery.target.tipHeight,
    });
    const headers = parseManifest(
      history.artifacts.greatestWorkHeadersManifest,
    ) as any;
    expect(headers.headers.map((value: any) => value.headerIdHex))
      .toEqual(fixture.headers.map(value => value.id));
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2Provenance(
        structuredClone(history),
      )
    ).toThrow(/lack process provenance/u);
  });

  it('V2 rejects a discovery tip that left the canonical best chain', async () => {
    const states = nodeStates();
    installNodeMocks(states);
    const discovery = await discoverSubstrateFederatedRewardInputsV2(signer());
    for (const state of states.values()) {
      const forkTip = appendHeader(
        state,
        fixture.headers[1]!.id,
        'replacement-height-3',
      );
      appendHeader(state, forkTip, 'replacement-height-4');
    }

    await expect(
      collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2(discovery),
    ).rejects.toThrow(/reward-discovery anchor is not canonical/i);
  });

  it('rejects a copied G1dH report before opening history sources', async () => {
    installNodeMocks(nodeStates());
    const discovery = await discoverSubstrateFederatedRewardInputsV1(signer());
    await expect(
      collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1(
        structuredClone(discovery),
      ),
    ).rejects.toThrow(/not produced in this process/i);
  });

  it('rejects a selected reward input absent from either current UTXO view', async () => {
    const states = nodeStates();
    installNodeMocks(states);
    const discovery = await discoverSubstrateFederatedRewardInputsV1(signer());
    states.get(SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN)!
      .utxos.delete(discovery.genesisBoxIds.tracker);
    await expect(
      collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1(discovery),
    ).rejects.toThrow(/tracker reward input is absent/i);
  });

  it('rejects canonical header-byte drift after reward discovery', async () => {
    const states = nodeStates();
    installNodeMocks(states);
    const discovery = await discoverSubstrateFederatedRewardInputsV1(signer());
    const witness = states.get(
      SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN,
    )!;
    const tip = witness.headers.get(witness.bestHeaderId)!;
    tip.parentId = 'ff'.repeat(32);
    await expect(
      collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1(discovery),
    ).rejects.toThrow(/claimed ID does not match/i);
  });

  it('rejects transaction bytes that no longer match the selected block root', async () => {
    const states = nodeStates();
    installNodeMocks(states);
    const discovery = await discoverSubstrateFederatedRewardInputsV1(signer());
    const primary = states.get(
      SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN,
    )!;
    const block = primary.blocks.get(fixture.headers[1]!.id)! as any;
    block.blockTransactions.transactions[0].outputs[0].value = '50000001';
    await expect(
      collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1(discovery),
    ).rejects.toThrow(
      /not canonical signed Ergo transaction JSON|canonical bytes do not match|transactions root/i,
    );
  });

  it('keeps canonical artifact text immutable across consumer byte mutation', async () => {
    installNodeMocks(nodeStates());
    const discovery = await discoverSubstrateFederatedRewardInputsV1(signer());
    const history =
      await collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1(
        discovery,
      );
    const consumerBytes = Buffer.from(
      history.artifacts.transactionsManifest,
      'utf8',
    );
    consumerBytes[0] ^= 0xff;
    expect(consumerBytes.toString('utf8'))
      .not.toBe(history.artifacts.transactionsManifest);
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV1Provenance(
        history,
      )).not.toThrow();
  });

  it('keeps the producer free of signing, checking and transaction transport', () => {
    const source = readFileSync(new URL(
      './substrate-federated-isolated-devnet-ergo-history-artifacts-v1.ts',
      import.meta.url,
    ), 'utf8');
    expect(source).not.toContain('process.env');
    expect(source).not.toContain('Mnemonic');
    expect(source).not.toContain('.post(');
    expect(source).not.toContain('/transactions/check');
    expect(source).not.toContain('submitTransaction');
  });
});

async function buildFixture(): Promise<Fixture> {
  const materialized = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [
      { value: '50000000', ergoTree: REWARD_TREE, creationHeight: 1 },
      { value: '60000000', ergoTree: REWARD_TREE, creationHeight: 1 },
      { value: '190000000', ergoTree: REWARD_TREE, creationHeight: 1 },
    ],
  }, 'isolated-devnet canonical Ergo history fixture');
  const signedTransaction = signedTransactionJson(materialized, 2);
  const transactionsRoot = computeErgoBlockTransactionsRoot({
    blockVersion: 2,
    transactions: [{
      transactionId: Buffer.from(materialized.txId, 'hex'),
      spendingProofs: [Buffer.alloc(0)],
    }],
  }).toString('hex');
  const headers: NodeHeader[] = [];
  let parentId = '00'.repeat(32);
  for (let height = 1; height <= 3; height += 1) {
    const identity: ErgoHeaderIdentityFields = {
      version: height === 1 ? 1 : 2,
      parentId: Buffer.from(parentId, 'hex'),
      adProofsRoot: fixedBytes(`ad-${height}`, 32),
      stateRoot: fixedBytes(`state-${height}`, 33),
      transactionsRoot: height === 2
        ? Buffer.from(transactionsRoot, 'hex')
        : fixedBytes(`transactions-${height}`, 32),
      timestamp: 1_720_000_000_000n + BigInt(height),
      nBits: 117_440_511,
      height,
      extensionHash: fixedBytes(`extension-${height}`, 32),
      votes: Buffer.alloc(3),
      unparsedBytes: Buffer.alloc(0),
      powSolution: {
        publicKey: Buffer.from(PUBLIC_KEY_HEX, 'hex'),
        nonce: Buffer.from(height.toString(16).padStart(16, '0'), 'hex'),
        ...(height === 1
          ? {
            oneTimePublicKey: Buffer.from(PUBLIC_KEY_HEX, 'hex'),
            distance: 0n,
          }
          : {}),
      },
    };
    const id = computeErgoHeaderId(identity).toString('hex');
    headers.push({
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
        w: PUBLIC_KEY_HEX,
        n: Buffer.from(identity.powSolution.nonce).toString('hex'),
        d: '0',
      },
      votes: '000000',
    });
    parentId = id;
  }
  const block = {
    header: structuredClone(headers[1]),
    blockTransactions: {
      headerId: headers[1]!.id,
      blockVersion: 2,
      transactions: [structuredClone(signedTransaction)],
    },
  };
  return { materialized, signedTransaction, headers, block };
}

function nodeStates(): Map<string, NodeState> {
  const create = (): NodeState => ({
    headers: new Map(fixture.headers.map(header => [
      header.id,
      structuredClone(header),
    ])),
    bestHeaderId: fixture.headers[2]!.id,
    blocks: new Map([[
      fixture.headers[1]!.id,
      structuredClone(fixture.block),
    ]]),
    transactions: new Map([[
      fixture.materialized.txId,
      structuredClone(fixture.signedTransaction),
    ]]),
    rewardBoxes: fixture.materialized.outputs.map(box => structuredClone(box)),
    utxos: new Map(fixture.materialized.outputs.map(box => [
      box.boxId,
      structuredClone(box),
    ])),
  });
  return new Map([
    [SUBSTRATE_FEDERATED_FIXED_PRIMARY_NODE_ORIGIN, create()],
    [SUBSTRATE_FEDERATED_FIXED_WITNESS_NODE_ORIGIN, create()],
  ]);
}

function appendHeader(
  state: NodeState,
  parentId: string,
  label: string,
): string {
  const parent = state.headers.get(parentId);
  if (parent === undefined) throw new Error('test header parent is unavailable');
  const height = parent.height + 1;
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
  state.headers.set(id, {
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
  state.bestHeaderId = id;
  return id;
}

function installNodeMocks(states: Map<string, NodeState>): void {
  const state = (client: AuthenticatedSpvTrackerReadOnlyNodeClient) => {
    const found = states.get(client.observationSourceId);
    if (found === undefined) throw new Error('unexpected fixed-node source');
    return found;
  };
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getInfo')
    .mockImplementation(async function (
      this: AuthenticatedSpvTrackerReadOnlyNodeClient,
    ) {
      const current = state(this);
      return {
        network: 'devnet',
        fullHeight: current.headers.get(current.bestHeaderId)!.height,
      };
    });
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getBestHeader')
    .mockImplementation(async function (
      this: AuthenticatedSpvTrackerReadOnlyNodeClient,
    ) {
      const current = state(this);
      return structuredClone(current.headers.get(current.bestHeaderId)!);
    });
  vi.spyOn(
    AuthenticatedSpvTrackerReadOnlyNodeClient.prototype,
    'getBlockHeaderIdsAtHeight',
  ).mockImplementation(async function (
    this: AuthenticatedSpvTrackerReadOnlyNodeClient,
    height,
  ) {
    const ids = [...state(this).headers.values()]
      .filter(header => header.height === height)
      .map(header => header.id);
    return ids;
  });
  vi.spyOn(
    AuthenticatedSpvTrackerReadOnlyNodeClient.prototype,
    'getBlockHeaderById',
  ).mockImplementation(async function (
    this: AuthenticatedSpvTrackerReadOnlyNodeClient,
    id,
  ) {
    const header = state(this).headers.get(id);
    return header === undefined ? null : structuredClone(header);
  });
  vi.spyOn(
    AuthenticatedSpvTrackerReadOnlyNodeClient.prototype,
    'getBlockByHeaderId',
  ).mockImplementation(async function (
    this: AuthenticatedSpvTrackerReadOnlyNodeClient,
    id,
  ) {
    const block = state(this).blocks.get(id);
    return block === undefined ? null : structuredClone(block);
  });
  vi.spyOn(AuthenticatedSpvTrackerReadOnlyNodeClient.prototype, 'getTransaction')
    .mockImplementation(async function (
      this: AuthenticatedSpvTrackerReadOnlyNodeClient,
      id,
    ) {
      const transaction = state(this).transactions.get(id);
      return transaction === undefined ? null : structuredClone(transaction);
    });
  vi.spyOn(
    AuthenticatedSpvTrackerReadOnlyNodeClient.prototype,
    'getBoxByIdOrNull',
  ).mockImplementation(async function (
    this: AuthenticatedSpvTrackerReadOnlyNodeClient,
    id,
  ) {
    const box = state(this).utxos.get(id);
    return box === undefined ? null : structuredClone(box);
  });
  vi.spyOn(
    AuthenticatedSpvTrackerReadOnlyNodeClient.prototype,
    'getAddressForErgoTree',
  ).mockImplementation(async (_tree) =>
    _tree === REWARD_TREE ? 'reward-delay-1' : 'reward-delay-720');
  vi.spyOn(
    AuthenticatedSpvTrackerReadOnlyNodeClient.prototype,
    'getUnspentBoxesByAddressPage',
  ).mockImplementation(async function (
    this: AuthenticatedSpvTrackerReadOnlyNodeClient,
    address,
    page,
  ) {
    const boxes = address === 'reward-delay-1' ? state(this).rewardBoxes : [];
    return boxes.slice(page.offset, page.offset + page.limit)
      .map(box => structuredClone(box));
  });
}

function signer(): SubstrateFederatedRewardSignerBindingV1 {
  return {
    publicKeyHex: PUBLIC_KEY_HEX,
    p2pkErgoTreeHex: FUNDING_TREE,
    rewardInputErgoTrees: {
      delay1: REWARD_TREE,
      delay720: deriveDevnetRewardErgoTreeHexForDelay(PUBLIC_KEY_HEX, 720),
    },
    networkPrefix: 16,
  };
}

function signedTransactionJson(
  transaction: MaterializedUnsignedTransaction,
  inclusionHeight: number,
): Record<string, unknown> {
  return {
    id: transaction.txId,
    inputs: transaction.eip12Tx.inputs.map(input => ({
      boxId: input.boxId,
      spendingProof: {
        proofBytes: '',
        extension: structuredClone(input.extension),
      },
    })),
    dataInputs: transaction.eip12Tx.dataInputs.map(input => ({
      boxId: input.boxId,
    })),
    outputs: structuredClone(transaction.outputs),
    inclusionHeight,
  };
}

function fixedBytes(label: string, bytes: number): Buffer {
  const value = Buffer.alloc(bytes);
  Buffer.from(label, 'utf8').copy(value);
  return value;
}

function parseManifest(text: string): unknown {
  const parsed = JSON.parse(text);
  expect(text).toBe(`${canonicalJson(parsed)}\n`);
  return parsed;
}
