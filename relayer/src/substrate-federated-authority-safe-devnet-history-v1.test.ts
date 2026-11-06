import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AcceptSubstrateFederatedAuthoritySafeDevnetV1Input,
  SubstrateFederatedAuthoritySafeDevnetAcceptanceV1,
  SubstrateFederatedAuthoritySafeDevnetAcceptedActionContextV1,
  SubstrateFederatedAuthoritySafeDevnetReadOnlyRpcMethodV1,
  SubstrateFederatedAuthoritySafeDevnetReadOnlyRpcV1,
} from './substrate-federated-authority-safe-devnet-acceptance-v1.js';

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  acceptance: undefined as unknown as Readonly<
    SubstrateFederatedAuthoritySafeDevnetAcceptanceV1
  >,
  actionContext: undefined as unknown as Readonly<
    SubstrateFederatedAuthoritySafeDevnetAcceptedActionContextV1
  >,
  actionResults: new WeakSet<object>(),
}));

vi.mock(
  './substrate-federated-authority-safe-devnet-acceptance-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('./substrate-federated-authority-safe-devnet-acceptance-v1.js')
    >();
    return {
      ...actual,
      acceptSubstrateFederatedAuthoritySafeDevnetWithHistoryV1:
        mocks.accept,
      assertSubstrateFederatedAuthoritySafeDevnetAcceptedHistoryV1Provenance(
        value: unknown,
      ) {
        if (
          typeof value !== 'object'
          || value === null
          || !mocks.actionResults.has(value)
        ) {
          throw new Error('mock accepted-action provenance is missing');
        }
      },
      assertSubstrateFederatedAuthoritySafeDevnetAcceptanceV1Provenance(
        value: unknown,
      ) {
        if (value !== mocks.acceptance) {
          throw new Error('mock acceptance provenance is missing');
        }
      },
    };
  },
);

import {
  assertSubstrateFederatedAuthoritySafeDevnetHistoryV1Provenance,
  collectSubstrateFederatedAuthoritySafeDevnetHistoryV1,
  SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_REPORTED_FINALIZED_BLOCKS_V1_SCHEMA,
} from './substrate-federated-authority-safe-devnet-history-v1.js';
import {
  collectSubstrateFederatedAuthoritySafeDevnetHistoryActionV1,
} from './substrate-federated-authority-safe-devnet-history-action-v1.js';
import {
  createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1,
  projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1,
} from './relayer-core/substrate-federated-authority-safe-devnet-source-failure-phase-v1.js';

const BRIDGE_ADDRESS = `0x${'06'.repeat(20)}`;
const TOKEN_ADDRESS = `0x${'07'.repeat(20)}`;
const RUNTIME_CODE = '0x6001';
const BRIDGE_CODE = '0x6002';
const TOKEN_CODE = '0x6003';
const DRIFTED_CODE = '0x6004';
const NATIVE_HASHES = ['10', '11', '12'].map(hash);
const EXECUTION_HASHES = ['20', '21', '22'].map(hash);
const FINALIZED_HEAD_HASH = hash('13');
const ZERO_HASH = hash('00');

interface Scenario {
  readonly acceptedTipReplacement?: boolean;
  readonly genesisReplacement?: boolean;
  readonly finalizedHeadFork?: boolean;
  readonly parentBreak?: boolean;
  readonly prunedGenesis?: boolean;
  readonly stableRecheckDrift?: boolean;
  readonly tipCodeDrift?: boolean;
  readonly witnessInteriorDisagreement?: boolean;
}

let scenario: Scenario;
let codeCalls: Map<string, number>;
let rpcCalls: number;

describe('Substrate federated authority-safe devnet history V1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scenario = {};
    codeCalls = new Map();
    rpcCalls = 0;
    mocks.actionResults = new WeakSet<object>();
    mocks.acceptance = acceptance();
    mocks.actionContext = actionContext();
    mocks.accept.mockImplementation(async (_input: unknown) => {
      const value =
        await collectSubstrateFederatedAuthoritySafeDevnetHistoryActionV1(
          mocks.actionContext,
        );
      const result = Object.freeze({ acceptance: mocks.acceptance, value });
      mocks.actionResults.add(result);
      return result;
    });
  });

  it('collects one complete stable same-process interval without promoting authority', async () => {
    const history = await collectHistory();

    expect(history.receipt).toMatchObject({
      status: 'isolated_exact_target_history_collected',
      acceptanceDigestHex: '41'.repeat(32),
      target: {
        frontierCommit: '42'.repeat(20),
        generatedSpecSha256Hex: '44'.repeat(32),
        nativeGenesisHashHex: NATIVE_HASHES[0].slice(2),
        acceptedNativeTipHashHex: NATIVE_HASHES[2].slice(2),
        acceptedExecutionTipHashHex: EXECUTION_HASHES[2].slice(2),
        sourceRuntimeCodeSha256Hex: sha256Code(RUNTIME_CODE),
        bridgeRuntimeCodeSha256Hex: sha256Code(BRIDGE_CODE),
        tokenRuntimeCodeSha256Hex: sha256Code(TOKEN_CODE),
        binarySha256Hex: '49'.repeat(32),
        processBindingDigestHex: '4a'.repeat(32),
      },
      interval: {
        semantics: 'genesis-through-accepted-observation-tip-inclusive',
        observedTipHeight: '2',
        blockCount: 3,
      },
      checks: {
        exactAcceptedTargetIdentityRecheckedAtHistoryTip: true,
        bothOriginsMatchedEveryCollectedHeight: true,
        acceptedTipIsAncestorOfEachRpcReportedFinalizedHead: true,
        everyCollectedRowStableAfterCollection: true,
      },
      boundaries: {
        targetHistoryCollected: true,
        targetHistoryAuthenticated: false,
        sourceFinalityAuthenticated: false,
        isolatedDevnetTargetDescriptorProduced: false,
        isolatedDevnetLaunchStatementProduced: false,
        portableReplayCompleted: false,
        setupTransactionIdentitiesFrozen: false,
        submissionAuthorized: false,
        broadcastAuthorized: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect('targetDescriptor' in history).toBe(false);
    expect(JSON.parse(Buffer.from(
      history.artifacts.acceptanceReport,
    ).toString('utf8'))).toEqual(mocks.acceptance);
    const reported = JSON.parse(Buffer.from(
      history.artifacts.reportedFinalizedBlocksManifest,
    ).toString('utf8')) as Record<string, unknown>;
    expect(reported).toMatchObject({
      schema:
        SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_REPORTED_FINALIZED_BLOCKS_V1_SCHEMA,
      finalityAuthority: 'two-owned-node-rpc-reported',
      firstHeight: '0',
      lastHeight: '2',
      reportedFinality: [{
        role: 'primary',
        headHeight: '3',
        headNativeBlockHashHex: FINALIZED_HEAD_HASH.slice(2),
      }, {
        role: 'witness',
        headHeight: '3',
        headNativeBlockHashHex: FINALIZED_HEAD_HASH.slice(2),
      }],
    });
    expect(() =>
      assertSubstrateFederatedAuthoritySafeDevnetHistoryV1Provenance(history)
    ).not.toThrow();
    expect(() =>
      assertSubstrateFederatedAuthoritySafeDevnetHistoryV1Provenance({
        ...history,
      })
    ).toThrow(/provenance/);
  });

  it('forwards explicit source-acceptance build roots without promoting them into evidence', async () => {
    const buildWorkspace = Object.freeze({
      temporaryDirectoryRoot: 'D:/reviewed/frontier-builds',
      sharedCargoHomeRoot: 'D:/reviewed/frontier-cargo-cache',
    });

    const history = await collectHistory(buildWorkspace);

    expect(mocks.accept).toHaveBeenCalledWith(
      {},
      buildWorkspace,
    );
    expect(JSON.stringify(history.receipt)).not.toContain('D:/reviewed');
  });

  it('classifies post-acceptance provenance and materialization failures as source history', async () => {
    mocks.accept.mockResolvedValueOnce(Object.freeze({
      acceptance: mocks.acceptance,
      value: Object.freeze({}),
    }));

    let failure: unknown;
    try {
      await collectHistory();
    } catch (error) {
      failure = error;
    }

    expect(
      projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1(
        failure,
      ),
    ).toBe('source history rpc and finality');
  });

  it('preserves an earlier classified acceptance failure', async () => {
    const acceptanceFailure =
      createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1(
        'source target readiness and observation',
        new Error('synthetic private acceptance failure'),
      );
    mocks.accept.mockRejectedValueOnce(acceptanceFailure);

    let failure: unknown;
    try {
      await collectHistory();
    } catch (error) {
      failure = error;
    }

    expect(failure).toBe(acceptanceFailure);
    expect(
      projectSubstrateFederatedAuthoritySafeDevnetSourceFailurePhaseV1(
        failure,
      ),
    ).toBe('source target readiness and observation');
  });

  it.each([
    ['witness disagreement', { witnessInteriorDisagreement: true }, /origins disagree at height 1/],
    ['broken parent', { parentBreak: true }, /parent linkage failed at 1/],
    ['missing genesis archive state', { prunedGenesis: true }, /archive genesis state is unavailable/],
    ['accepted genesis replacement', { genesisReplacement: true }, /genesis differs/],
    ['accepted tip replacement', { acceptedTipReplacement: true }, /tip was replaced/],
    ['reported finalized-head fork', { finalizedHeadFork: true }, /not an ancestor/],
    ['tip code drift', { tipCodeDrift: true }, /tip code identity differs/],
    ['stable snapshot drift', { stableRecheckDrift: true }, /history changed at height 1/],
  ] as const)('rejects %s', async (_label, mutation, error) => {
    scenario = mutation;

    await expect(collectHistory()).rejects.toThrow(error);
  });

  it('rejects two aliases for one RPC origin before collecting history', async () => {
    mocks.actionContext = actionContext({ sameRpcIdentity: true });

    await expect(collectHistory()).rejects.toThrow(/origins must be distinct/);
    expect(rpcCalls).toBe(0);
  });

  it('rejects an accepted interval outside the bounded history profile', async () => {
    mocks.actionContext = actionContext({ nativeTipHeight: '257' });

    await expect(collectHistory()).rejects.toThrow(/257-block V1 bound/);
    expect(rpcCalls).toBe(0);
  });

  it('detects artifact mutation through the history provenance assertion', async () => {
    const history = await collectHistory();
    history.artifacts.runtimeHistoryManifest[0] ^= 1;

    expect(() =>
      assertSubstrateFederatedAuthoritySafeDevnetHistoryV1Provenance(history)
    ).toThrow(/runtime history artifact drifted/);
  });

  it('detects acceptance-report mutation through the history provenance assertion', async () => {
    const history = await collectHistory();
    history.artifacts.acceptanceReport[0] ^= 1;

    expect(() =>
      assertSubstrateFederatedAuthoritySafeDevnetHistoryV1Provenance(history)
    ).toThrow(/acceptance report artifact drifted/);
  });
});

async function collectHistory(
  sourceAcceptanceBuildWorkspace?: Readonly<{
    temporaryDirectoryRoot: string;
    sharedCargoHomeRoot: string;
  }>,
) {
  return await collectSubstrateFederatedAuthoritySafeDevnetHistoryV1(
    {
      acceptance: {} as AcceptSubstrateFederatedAuthoritySafeDevnetV1Input,
    },
    sourceAcceptanceBuildWorkspace,
  );
}

function acceptance(): Readonly<SubstrateFederatedAuthoritySafeDevnetAcceptanceV1> {
  return Object.freeze({
    acceptanceDigestHex: '41'.repeat(32),
    binary: Object.freeze({ sha256Hex: '49'.repeat(32) }),
    processes: Object.freeze({ processBindingDigestHex: '4a'.repeat(32) }),
  }) as unknown as Readonly<SubstrateFederatedAuthoritySafeDevnetAcceptanceV1>;
}

function actionContext(overrides: Readonly<{
  nativeTipHeight?: string;
  sameRpcIdentity?: boolean;
}> = {}): Readonly<SubstrateFederatedAuthoritySafeDevnetAcceptedActionContextV1> {
  return Object.freeze({
    primaryRpc: rpcPort('primary', '51'.repeat(32)),
    witnessRpc: rpcPort(
      'witness',
      (overrides.sameRpcIdentity ? '51' : '52').repeat(32),
    ),
    chain: Object.freeze({
      name: 'Authority-safe devnet',
      id: 'authority-safe-devnet',
      protocolId: 'authority-safe-devnet',
      chainId: '42',
      generatedSpecSha256Hex: '44'.repeat(32),
    }),
    source: Object.freeze({
      frontierCommit: '42'.repeat(20),
      frontierPatchSha256Hex: '43'.repeat(32),
      runtimeCodeBytes: codeBytes(RUNTIME_CODE).length,
      runtimeCodeSha256Hex: sha256Code(RUNTIME_CODE),
      storageLayoutDigestHex: '45'.repeat(32),
    }),
    application: Object.freeze({
      bridgeAddress: BRIDGE_ADDRESS,
      tokenAddress: TOKEN_ADDRESS,
      bridgeOwnerAddress: `0x${'08'.repeat(20)}`,
      bridgeRuntimeCodeBytes: codeBytes(BRIDGE_CODE).length,
      bridgeRuntimeCodeSha256Hex: sha256Code(BRIDGE_CODE),
      tokenRuntimeCodeBytes: codeBytes(TOKEN_CODE).length,
      tokenRuntimeCodeSha256Hex: sha256Code(TOKEN_CODE),
    }),
    observation: Object.freeze({
      nativeGenesisHashHex: NATIVE_HASHES[0],
      nativeTipHeight: overrides.nativeTipHeight ?? '2',
      nativeTipHashHex: NATIVE_HASHES[2],
      evmTipHashHex: EXECUTION_HASHES[2],
      observationDigestHex: '48'.repeat(32),
    }),
  });
}

function rpcPort(
  role: 'primary' | 'witness',
  endpointIdentityDigestHex: string,
): Readonly<SubstrateFederatedAuthoritySafeDevnetReadOnlyRpcV1> {
  return Object.freeze({
    role,
    endpointIdentityDigestHex,
    async request(
      method: SubstrateFederatedAuthoritySafeDevnetReadOnlyRpcMethodV1,
      params: readonly unknown[],
    ): Promise<unknown> {
      rpcCalls += 1;
      return rpcResult(role, method, params);
    },
  });
}

function rpcResult(
  role: 'primary' | 'witness',
  method: string,
  params: readonly unknown[],
): unknown {
  if (method === 'chain_getFinalizedHead') {
    return scenario.finalizedHeadFork ? hash('95') : FINALIZED_HEAD_HASH;
  }
  if (method === 'chain_getBlockHash') {
    const height = heightFromParameter(params[0]);
    if (height === 0 && scenario.genesisReplacement) return hash('90');
    if (height === 2 && scenario.acceptedTipReplacement) return hash('91');
    return NATIVE_HASHES[height];
  }
  if (method === 'chain_getHeader') {
    const height = nativeHeightFromHash(String(params[0]));
    return nativeHeader(height);
  }
  if (method === 'eth_getBlockByNumber') {
    const height = heightFromParameter(params[0]);
    const executionHash = role === 'witness'
      && height === 1
      && scenario.witnessInteriorDisagreement
      ? hash('92')
      : EXECUTION_HASHES[height];
    return {
      number: quantity(height),
      hash: executionHash,
      parentHash: height === 0
        ? ZERO_HASH
        : scenario.parentBreak && height === 1
          ? hash('93')
          : EXECUTION_HASHES[height - 1],
      transactions: [],
    };
  }
  if (method === 'state_getStorage') {
    expect(params[0]).toBe('0x3a636f6465');
    const height = nativeHeightFromHash(String(params[1]));
    return scenario.prunedGenesis && height === 0 ? '0x' : RUNTIME_CODE;
  }
  if (method === 'eth_getCode') {
    const address = String(params[0]);
    const height = heightFromParameter(params[1]);
    const key = `${role}:${address}:${height}`;
    const call = (codeCalls.get(key) ?? 0) + 1;
    codeCalls.set(key, call);
    if (address === BRIDGE_ADDRESS) {
      if (scenario.tipCodeDrift && height === 2) return DRIFTED_CODE;
      if (scenario.stableRecheckDrift && height === 1 && call > 1) {
        return DRIFTED_CODE;
      }
      return BRIDGE_CODE;
    }
    if (address === TOKEN_ADDRESS) return TOKEN_CODE;
  }
  throw new Error(`unexpected RPC call ${role} ${method}`);
}

function nativeHeader(height: number): Record<string, unknown> {
  return {
    number: quantity(height),
    parentHash: height === 0
      ? ZERO_HASH
      : scenario.parentBreak && height === 1
        ? hash('94')
        : scenario.genesisReplacement && height === 1
          ? hash('90')
          : NATIVE_HASHES[height - 1],
    stateRoot: hash(`3${height}`),
    extrinsicsRoot: hash(`4${height}`),
  };
}

function nativeHeightFromHash(value: string): number {
  if (scenario.genesisReplacement && value === hash('90')) return 0;
  if (value === FINALIZED_HEAD_HASH) return 3;
  if (scenario.finalizedHeadFork && value === hash('95')) return 2;
  const height = NATIVE_HASHES.indexOf(value);
  if (height < 0) throw new Error(`unknown native hash ${value}`);
  return height;
}

function heightFromParameter(value: unknown): number {
  if (value === 0) return 0;
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/.test(value)) {
    throw new Error('unexpected height parameter');
  }
  return Number(BigInt(value));
}

function quantity(value: number): string {
  return `0x${value.toString(16)}`;
}

function hash(byte: string): string {
  return `0x${byte.repeat(32)}`;
}

function codeBytes(value: string): Buffer {
  return Buffer.from(value.slice(2), 'hex');
}

function sha256Code(value: string): string {
  return createHash('sha256').update(codeBytes(value)).digest('hex');
}
