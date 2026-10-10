import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { describe, expect, it } from 'vitest';

import {
  assertSubstrateFederatedGenesisObservationV1Provenance,
  buildSubstrateFederatedGenesisTargetProfileV1,
  observeSubstrateFederatedGenesisV1,
  type BuildSubstrateFederatedGenesisTargetProfileV1Input,
} from './substrate-federated-genesis-observation-v1.js';
import {
  materializeUnsignedTransaction,
  type Eip12Asset,
  type Eip12Box,
} from './unsigned-ergo-transaction.js';

const GENESIS_HEADER_ID = '91'.repeat(32);
const TIP_HEADER_ID = '92'.repeat(32);
const OBSERVED_AT = '2026-08-12T12:00:00.000Z';
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

interface GenesisFixture {
  readonly tracker: Eip12Box;
  readonly duplicatePrevention: Eip12Box;
  readonly pooledReserve: Eip12Box;
  readonly sigmaByBoxId: ReadonlyMap<string, string>;
}

interface NodeStateOptions {
  readonly network?: string;
  readonly fullHeights?: readonly number[];
  readonly tipIds?: readonly string[];
  readonly tipHeights?: readonly number[];
  readonly genesisIds?: readonly string[];
  readonly headerIdsByHeight?: ReadonlyMap<number, readonly string[]>;
  readonly boxes?: ReadonlyMap<string, unknown>;
  readonly boxJsonResponsesById?: ReadonlyMap<string, readonly (unknown | null)[]>;
  readonly sigmaByBoxId?: ReadonlyMap<string, string>;
  readonly missingBoxId?: string;
  readonly binaryOverride?: ReadonlyMap<string, unknown>;
  readonly responseDelayMs?: number;
}

interface NodeState {
  readonly network: string;
  readonly fullHeights: readonly number[];
  readonly tipIds: readonly string[];
  readonly tipHeights: readonly number[];
  readonly genesisIds: readonly string[];
  readonly headerIdsByHeight: ReadonlyMap<number, readonly string[]>;
  readonly boxes: ReadonlyMap<string, unknown>;
  readonly boxJsonResponsesById: ReadonlyMap<string, readonly (unknown | null)[]>;
  readonly sigmaByBoxId: ReadonlyMap<string, string>;
  readonly missingBoxId?: string;
  readonly binaryOverride: ReadonlyMap<string, unknown>;
  readonly responseDelayMs: number;
  readonly boxJsonReads: Map<string, number>;
  infoReads: number;
  tipReads: number;
  requestsCompleted: number;
}

interface NodePairContext {
  readonly primaryOrigin: string;
  readonly witnessOrigin: string;
  readonly primaryState: NodeState;
  readonly witnessState: NodeState;
}

async function genesisFixture(input: Readonly<{
  trackerAssets?: readonly Eip12Asset[];
  trackerRegisters?: Record<string, string>;
  trackerCreationHeight?: number;
}> = {}): Promise<GenesisFixture> {
  const materialized = await materializeUnsignedTransaction({
    inputs: [{ ...BASE_INPUT, extension: {} }],
    dataInputs: [],
    outputs: [
      {
        value: '50000000',
        ergoTree: FUNDING_TREE,
        assets: input.trackerAssets ? [...input.trackerAssets] : [],
        additionalRegisters: input.trackerRegisters ?? {},
        creationHeight: input.trackerCreationHeight ?? 110,
      },
      {
        value: '100000000',
        ergoTree: FUNDING_TREE,
        assets: [],
        additionalRegisters: {},
        creationHeight: 110,
      },
      {
        value: '150000000',
        ergoTree: FUNDING_TREE,
        assets: [],
        additionalRegisters: {},
        creationHeight: 110,
      },
    ],
  }, 'federated genesis observation fixture');
  const [tracker, duplicatePrevention, pooledReserve] = materialized.outputs;
  const sigmaByBoxId = new Map<string, string>();
  for (const box of materialized.outputs) sigmaByBoxId.set(box.boxId, await sigmaBytes(box));
  return { tracker, duplicatePrevention, pooledReserve, sigmaByBoxId };
}

async function sigmaBytes(box: Eip12Box): Promise<string> {
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  const parsed = wasm.ErgoBox.from_json(JSON.stringify(box));
  try {
    return Buffer.from(parsed.sigma_serialize_bytes()).toString('hex');
  } finally {
    parsed.free?.();
  }
}

function boxesById(fixture: GenesisFixture): ReadonlyMap<string, unknown> {
  return new Map([
    [fixture.tracker.boxId, fixture.tracker],
    [fixture.duplicatePrevention.boxId, fixture.duplicatePrevention],
    [fixture.pooledReserve.boxId, fixture.pooledReserve],
  ]);
}

function nodeState(
  fixture: GenesisFixture,
  options: NodeStateOptions = {},
): NodeState {
  return {
    network: options.network ?? 'devnet',
    fullHeights: options.fullHeights ?? [120, 120],
    tipIds: options.tipIds ?? [TIP_HEADER_ID, TIP_HEADER_ID],
    tipHeights: options.tipHeights ?? options.fullHeights ?? [120, 120],
    genesisIds: options.genesisIds ?? [GENESIS_HEADER_ID],
    headerIdsByHeight: options.headerIdsByHeight ?? new Map(),
    boxes: options.boxes ?? boxesById(fixture),
    boxJsonResponsesById: options.boxJsonResponsesById ?? new Map(),
    sigmaByBoxId: options.sigmaByBoxId ?? fixture.sigmaByBoxId,
    missingBoxId: options.missingBoxId,
    binaryOverride: options.binaryOverride ?? new Map(),
    responseDelayMs: options.responseDelayMs ?? 0,
    boxJsonReads: new Map(),
    infoReads: 0,
    tipReads: 0,
    requestsCompleted: 0,
  };
}

function nodeServer(state: NodeState): Server {
  return createServer(async (request, response) => {
    if (state.responseDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, state.responseDelayMs));
    }
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    try {
      if (path === '/info') {
        const index = Math.min(state.infoReads++, state.fullHeights.length - 1);
        return sendJson(response, 200, {
          network: state.network,
          fullHeight: state.fullHeights[index],
        });
      }
      if (path === '/blocks/lastHeaders/1') {
        const index = Math.min(state.tipReads++, state.tipIds.length - 1);
        return sendJson(response, 200, [{
          id: state.tipIds[index],
          height: state.tipHeights[Math.min(index, state.tipHeights.length - 1)],
        }]);
      }
      const headersAtHeight = path.match(/^\/blocks\/at\/(\d+)$/);
      if (headersAtHeight) {
        const height = Number(headersAtHeight[1]);
        const ids = height === 1
          ? state.genesisIds
          : state.headerIdsByHeight.get(height);
        return ids === undefined
          ? sendJson(response, 404, {})
          : sendJson(response, 200, ids);
      }
      const boxBinary = path.match(/^\/utxo\/byIdBinary\/([0-9a-f]{64})$/);
      if (boxBinary) {
        const boxId = boxBinary[1];
        if (boxId === state.missingBoxId) return sendJson(response, 404, {});
        if (state.binaryOverride.has(boxId)) {
          return sendJson(response, 200, state.binaryOverride.get(boxId));
        }
        const bytes = state.sigmaByBoxId.get(boxId);
        return bytes === undefined
          ? sendJson(response, 404, {})
          : sendJson(response, 200, { bytes });
      }
      const boxJson = path.match(/^\/utxo\/byId\/([0-9a-f]{64})$/);
      if (boxJson) {
        const boxId = boxJson[1];
        if (boxId === state.missingBoxId) return sendJson(response, 404, {});
        const sequence = state.boxJsonResponsesById.get(boxId);
        const readIndex = state.boxJsonReads.get(boxId) ?? 0;
        state.boxJsonReads.set(boxId, readIndex + 1);
        const box = sequence === undefined
          ? state.boxes.get(boxId)
          : sequence[Math.min(readIndex, sequence.length - 1)];
        return box === undefined
          || box === null
          ? sendJson(response, 404, {})
          : sendJson(response, 200, box);
      }
      return sendJson(response, 404, {});
    } finally {
      state.requestsCompleted += 1;
    }
  });
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
  });
}

async function withNodePair<T>(
  fixture: GenesisFixture,
  options: Readonly<{
    primary?: NodeStateOptions;
    witness?: NodeStateOptions;
  }>,
  run: (context: NodePairContext) => Promise<T>,
): Promise<T> {
  const primaryState = nodeState(fixture, options.primary);
  const witnessState = nodeState(fixture, options.witness);
  const primaryServer = nodeServer(primaryState);
  const witnessServer = nodeServer(witnessState);
  const [primaryOrigin, witnessOrigin] = await Promise.all([
    listen(primaryServer),
    listen(witnessServer),
  ]);
  try {
    return await run({ primaryOrigin, witnessOrigin, primaryState, witnessState });
  } finally {
    await Promise.all([close(primaryServer), close(witnessServer)]);
  }
}

function profileInput(
  fixture: GenesisFixture,
  origins: Readonly<{ primaryOrigin: string; witnessOrigin: string }> = {
    primaryOrigin: 'https://primary.example',
    witnessOrigin: 'https://witness.example',
  },
  overrides: Partial<BuildSubstrateFederatedGenesisTargetProfileV1Input> = {},
): BuildSubstrateFederatedGenesisTargetProfileV1Input {
  return {
    profileIdHex: '10'.repeat(32),
    environment: 'patched-devnet',
    expectedNetwork: 'devnet',
    expectedGenesisHeaderIdHex: GENESIS_HEADER_ID,
    primaryNodeOrigin: origins.primaryOrigin,
    primaryNodeIdentityDigestHex: '11'.repeat(32),
    primaryAdministrationIdentityDigestHex: '12'.repeat(32),
    witnessNodeOrigin: origins.witnessOrigin,
    witnessNodeIdentityDigestHex: '13'.repeat(32),
    witnessAdministrationIdentityDigestHex: '14'.repeat(32),
    trackerGenesisBoxIdHex: fixture.tracker.boxId,
    duplicatePreventionGenesisBoxIdHex: fixture.duplicatePrevention.boxId,
    pooledReserveGenesisBoxIdHex: fixture.pooledReserve.boxId,
    ...overrides,
  };
}

async function observe(
  fixture: GenesisFixture,
  options: Readonly<{
    primary?: NodeStateOptions;
    witness?: NodeStateOptions;
  }> = {},
) {
  return withNodePair(fixture, options, async context => {
    const profile = buildSubstrateFederatedGenesisTargetProfileV1(
      profileInput(fixture, context),
    );
    const report = await observeSubstrateFederatedGenesisV1(profile, {
      now: () => new Date(OBSERVED_AT),
    });
    return { profile, report, context };
  });
}

describe('Substrate federated genesis observation V1', () => {
  it('binds three canonical target boxes to matching stable non-mainnet sources', async () => {
    const fixture = await genesisFixture();
    const { profile, report } = await observe(fixture);
    assertSubstrateFederatedGenesisObservationV1Provenance(profile, report);

    expect(report).toMatchObject({
      status: 'AGREED',
      observedAt: OBSERVED_AT,
      profile: {
        profileIdHex: profile.profileIdHex,
        profileDigestHex: profile.profileDigestHex,
        environment: 'patched-devnet',
        expectedNetwork: 'devnet',
        expectedGenesisHeaderIdHex: GENESIS_HEADER_ID,
      },
      target: {
        network: 'devnet',
        genesisHeaderHeight: 1,
        genesisHeaderIdHex: GENESIS_HEADER_ID,
        tipHeight: 120,
        tipHeaderIdHex: TIP_HEADER_ID,
      },
      agreement: {
        exactJsonAndSigmaBoxesMatched: true,
        pairwiseDistinctPureErgRegisterFreeBoxes: true,
      },
    });
    expect(report.boundary).toEqual({
      readOnlyNodeRequestsOnly: true,
      apiKeyOrEnvironmentCredentialRead: false,
      runtimeDatabaseOpened: false,
      deploymentStateOpened: false,
      signerOrWalletMaterialRead: false,
      sourceControlledProfileApprovalAuthenticated: false,
      declaredSourceIdentitiesObservedFromNodes: false,
      independentNodeControlVerified: false,
      nodeAgreementProvesCanonicalConsensus: false,
      tipUtxoAtomicityProved: false,
      targetAcceptanceEstablished: false,
      revalidationRequiredBeforeMaterialization: true,
    });
    expect(report.authorization).toEqual({
      materialize: false,
      check: false,
      sign: false,
      submit: false,
      broadcast: false,
      deploy: false,
      activate: false,
      fundsAuthority: false,
      gate5Closed: false,
      productionReady: false,
    });
    expect(report.boxes.tracker.box).toEqual(fixture.tracker);
    expect(report.boxes.duplicatePrevention.box).toEqual(fixture.duplicatePrevention);
    expect(report.boxes.pooledReserve.box).toEqual(fixture.pooledReserve);
    expect(report.reportDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.boxes.tracker.box)).toBe(true);
  });

  it('rejects unsafe or ambiguous target profiles before any node read', async () => {
    const fixture = await genesisFixture();
    const base = profileInput(fixture);
    const invalid: Array<Partial<BuildSubstrateFederatedGenesisTargetProfileV1Input>> = [
      { primaryNodeOrigin: 'https://user:password@primary.example' },
      { primaryNodeOrigin: 'https://primary.example/path' },
      { primaryNodeOrigin: 'https://primary.example?query=1' },
      { primaryNodeOrigin: 'https://primary.example#fragment' },
      { witnessNodeOrigin: base.primaryNodeOrigin },
      { witnessNodeIdentityDigestHex: base.primaryNodeIdentityDigestHex },
      {
        witnessAdministrationIdentityDigestHex:
          base.primaryAdministrationIdentityDigestHex,
      },
      { environment: 'mainnet', expectedNetwork: 'mainnet' },
      { expectedNetwork: 'testnet' },
      { duplicatePreventionGenesisBoxIdHex: base.trackerGenesisBoxIdHex },
      { profileIdHex: 'AA'.repeat(32) },
    ];
    for (const mutation of invalid) {
      expect(() => buildSubstrateFederatedGenesisTargetProfileV1({
        ...base,
        ...mutation,
      })).toThrow();
    }
  });

  it('rejects cloned profiles and cloned observations', async () => {
    const fixture = await genesisFixture();
    await withNodePair(fixture, {}, async context => {
      const profile = buildSubstrateFederatedGenesisTargetProfileV1(
        profileInput(fixture, context),
      );
      await expect(observeSubstrateFederatedGenesisV1({ ...profile })).rejects
        .toThrow(/profile lacks same-process provenance/i);
      const report = await observeSubstrateFederatedGenesisV1(profile, {
        now: () => new Date(OBSERVED_AT),
      });
      expect(() => assertSubstrateFederatedGenesisObservationV1Provenance(
        profile,
        { ...report },
      )).toThrow(/same-process provenance/i);
    });
  });

  it('rejects network, genesis, tip, and node-info/header disagreement', async () => {
    const fixture = await genesisFixture();
    await expect(observe(fixture, { witness: { network: 'testnet' } }))
      .rejects.toThrow(/network does not match/i);
    await expect(observe(fixture, { witness: { genesisIds: ['93'.repeat(32)] } }))
      .rejects.toThrow(/genesis header does not match/i);
    await expect(observe(fixture, {
      witness: { genesisIds: [GENESIS_HEADER_ID, '93'.repeat(32)] },
    })).rejects.toThrow(/exactly one height-1 genesis/i);
    await expect(observe(fixture, {
      witness: { tipIds: [TIP_HEADER_ID, '94'.repeat(32)] },
    })).rejects.toThrow(/changed during genesis-box observation/i);
    await expect(observe(fixture, {
      witness: { tipIds: ['96'.repeat(32), '96'.repeat(32)] },
    })).rejects.toThrow(/target snapshots disagree/i);
  });

  it('retries one torn node-info and best-header snapshot before accepting an exact pair', async () => {
    const fixture = await genesisFixture();
    const { report, context } = await observe(fixture, {
      witness: {
        fullHeights: [119, 120, 120],
        tipHeights: [120, 120, 120],
        tipIds: [TIP_HEADER_ID, TIP_HEADER_ID, TIP_HEADER_ID],
      },
    });

    expect(report.target).toMatchObject({
      tipHeight: 120,
      tipHeaderIdHex: TIP_HEADER_ID,
    });
    expect(context.witnessState.infoReads).toBe(3);
    expect(context.witnessState.tipReads).toBe(3);
    expect(context.witnessState.requestsCompleted).toBe(14);
  });

  it('retries an advancing canonical tip and reports only a stable matching tip', async () => {
    const fixture = await genesisFixture();
    const nextTipHeaderId = '95'.repeat(32);
    const advancingNode = {
      fullHeights: [120, 121, 121, 121],
      tipHeights: [120, 121, 121, 121],
      tipIds: [TIP_HEADER_ID, nextTipHeaderId, nextTipHeaderId, nextTipHeaderId],
      headerIdsByHeight: new Map([[120, [TIP_HEADER_ID, '96'.repeat(32)]]]),
    } as const;
    const { report, context } = await observe(fixture, {
      primary: advancingNode,
      witness: advancingNode,
    });

    expect(report.target).toEqual({
      network: 'devnet',
      genesisHeaderHeight: 1,
      genesisHeaderIdHex: GENESIS_HEADER_ID,
      tipHeight: 121,
      tipHeaderIdHex: nextTipHeaderId,
    });
    expect(context.primaryState.requestsCompleted).toBe(25);
    expect(context.witnessState.requestsCompleted).toBe(25);
  });

  it('rejects tip regression and replacement of an advancing observation anchor', async () => {
    const fixture = await genesisFixture();
    await expect(observe(fixture, {
      witness: {
        fullHeights: [120, 119],
        tipHeights: [120, 119],
        tipIds: [TIP_HEADER_ID, '95'.repeat(32)],
      },
    })).rejects.toThrow(/height regressed during genesis-box observation/i);
    await expect(observe(fixture, {
      witness: {
        fullHeights: [120, 121],
        tipHeights: [120, 121],
        tipIds: [TIP_HEADER_ID, '95'.repeat(32)],
        headerIdsByHeight: new Map([[
          120,
          ['96'.repeat(32), TIP_HEADER_ID],
        ]]),
      },
    })).rejects.toThrow(/observation anchor left the best chain/i);
  });

  it('rejects a box that disappears before the advancing-tip retry completes', async () => {
    const fixture = await genesisFixture();
    await expect(observe(fixture, {
      witness: {
        fullHeights: [120, 121, 121, 121],
        tipHeights: [120, 121, 121, 121],
        tipIds: [
          TIP_HEADER_ID,
          '95'.repeat(32),
          '95'.repeat(32),
          '95'.repeat(32),
        ],
        headerIdsByHeight: new Map([[120, [TIP_HEADER_ID]]]),
        boxJsonResponsesById: new Map([[
          fixture.tracker.boxId,
          [fixture.tracker, null],
        ]]),
      },
    })).rejects.toThrow(/tracker genesis box is not present in the current UTXO view/i);
  });

  it('fails closed when canonical advancement exhausts the stable observation bound', async () => {
    const fixture = await genesisFixture();
    const tip121 = '95'.repeat(32);
    const tip122 = '96'.repeat(32);
    const tip123 = '97'.repeat(32);
    await expect(observe(fixture, {
      witness: {
        fullHeights: [120, 121, 121, 122, 122, 123],
        tipHeights: [120, 121, 121, 122, 122, 123],
        tipIds: [TIP_HEADER_ID, tip121, tip121, tip122, tip122, tip123],
        headerIdsByHeight: new Map([
          [120, [TIP_HEADER_ID]],
          [121, [tip121]],
          [122, [tip122]],
        ]),
      },
    })).rejects.toThrow(/stable Ergo genesis-box observation remained unavailable/i);
  });

  it('retries a lagging source pair until both stable observations match', async () => {
    const fixture = await genesisFixture();
    const nextTipHeaderId = '95'.repeat(32);
    const { report } = await observe(fixture, {
      primary: {
        fullHeights: [120, 120, 121, 121],
        tipHeights: [120, 120, 121, 121],
        tipIds: [TIP_HEADER_ID, TIP_HEADER_ID, nextTipHeaderId, nextTipHeaderId],
      },
      witness: {
        fullHeights: [120, 121, 121, 121],
        tipHeights: [120, 121, 121, 121],
        tipIds: [
          TIP_HEADER_ID,
          nextTipHeaderId,
          nextTipHeaderId,
          nextTipHeaderId,
        ],
        headerIdsByHeight: new Map([[120, [TIP_HEADER_ID]]]),
      },
    });

    expect(report.target).toMatchObject({
      tipHeight: 121,
      tipHeaderIdHex: nextTipHeaderId,
    });
  });

  it('fails closed when stable source tips remain persistently different', async () => {
    const fixture = await genesisFixture();
    await expect(observe(fixture, {
      primary: {
        fullHeights: [120],
        tipHeights: [120],
        tipIds: [TIP_HEADER_ID],
      },
      witness: {
        fullHeights: [121],
        tipHeights: [121],
        tipIds: ['95'.repeat(32)],
      },
    })).rejects.toThrow(/target snapshots disagree/i);
  });

  it('fails closed after the bounded node snapshot retry count is exhausted', async () => {
    const fixture = await genesisFixture();
    await withNodePair(fixture, {
      witness: { tipHeights: [119, 119, 119] },
    }, async context => {
      const profile = buildSubstrateFederatedGenesisTargetProfileV1(
        profileInput(fixture, context),
      );
      await expect(observeSubstrateFederatedGenesisV1(profile))
        .rejects.toThrow(/heights do not match after 3 bounded attempts/i);
      expect(context.witnessState.infoReads).toBe(3);
      expect(context.witnessState.tipReads).toBe(3);
    });
  });

  it('awaits both bounded source observations before returning a failure', async () => {
    const fixture = await genesisFixture();
    await withNodePair(fixture, {
      primary: { network: 'testnet' },
      witness: { responseDelayMs: 3 },
    }, async context => {
      const profile = buildSubstrateFederatedGenesisTargetProfileV1(
        profileInput(fixture, context),
      );
      await expect(observeSubstrateFederatedGenesisV1(profile))
        .rejects.toThrow(/network does not match/i);
      expect(context.witnessState.infoReads).toBe(2);
      expect(context.witnessState.tipReads).toBe(2);
      expect(context.witnessState.requestsCompleted).toBe(12);
    });
  });

  it('rejects missing, malformed, mismatched, token-bearing, registered, and future boxes', async () => {
    const fixture = await genesisFixture();
    await expect(observe(fixture, {
      witness: { missingBoxId: fixture.tracker.boxId },
    })).rejects.toThrow(/not present in the current UTXO view/i);
    await expect(observe(fixture, {
      witness: {
        boxes: new Map([
          ...boxesById(fixture),
          [fixture.tracker.boxId, { ...fixture.tracker, boxId: '97'.repeat(32) }],
        ]),
      },
    })).rejects.toThrow(/box id parsed from JSON|boxId does not match/i);
    await expect(observe(fixture, {
      witness: {
        binaryOverride: new Map([[fixture.tracker.boxId, {
          bytes: fixture.sigmaByBoxId.get(fixture.duplicatePrevention.boxId),
        }]]),
      },
    })).rejects.toThrow(/JSON and binary observations do not match/i);

    const tokenFixture = await genesisFixture({
      trackerAssets: [{ tokenId: BASE_INPUT.boxId, amount: '1' }],
    });
    await expect(observe(tokenFixture)).rejects.toThrow(/pure ERG only/i);
    const registeredFixture = await genesisFixture({ trackerRegisters: { R4: '0e0101' } });
    await expect(observe(registeredFixture)).rejects.toThrow(/additional registers/i);
    const futureFixture = await genesisFixture({ trackerCreationHeight: 121 });
    await expect(observe(futureFixture)).rejects.toThrow(/creation height exceeds/i);
  });

  it('rejects unavailable, malformed, trailing, and oversized Sigma data', async () => {
    const fixture = await genesisFixture();
    await expect(observe(fixture, {
      witness: {
        binaryOverride: new Map([[fixture.tracker.boxId, null]]),
      },
    })).rejects.toThrow(/binary is unavailable/i);
    await expect(observe(fixture, {
      witness: {
        binaryOverride: new Map([[fixture.tracker.boxId, { bytes: '00' }]]),
      },
    })).rejects.toThrow(/not a valid Sigma-serialized Ergo box/i);
    await expect(observe(fixture, {
      witness: {
        binaryOverride: new Map([[fixture.tracker.boxId, {
          bytes: `${fixture.sigmaByBoxId.get(fixture.tracker.boxId)}00`,
        }]]),
      },
    })).rejects.toThrow(/canonical Sigma serialization|valid Sigma-serialized/i);
    await expect(observe(fixture, {
      witness: {
        binaryOverride: new Map([[fixture.tracker.boxId, {
          bytes: '00'.repeat(1024 * 1024 + 1),
        }]]),
      },
    })).rejects.toThrow(/bounded canonical lowercase byte hex/i);
  });
});
