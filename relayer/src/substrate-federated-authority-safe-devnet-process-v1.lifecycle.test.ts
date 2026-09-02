import type { ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Interface, keccak256 } from 'ethers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
  verifyExecutableSha256: vi.fn(),
}));

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>(
    'node:child_process',
  );
  return { ...actual, spawn: mocks.spawn, spawnSync: mocks.spawnSync };
});

vi.mock('./native-executable-pin.js', () => ({
  verifyExecutableSha256: mocks.verifyExecutableSha256,
}));

import {
  assertOwnedAuthoritySafeDevnetProcessV1Receipt,
  assertOwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt,
  assertOwnedAuthoritySafeDevnetRecoveryProcessV1Receipt,
  assertOwnedAuthoritySafeDevnetRecoveryTimelineV1Material,
  captureOwnedAuthoritySafeDevnetRecoveryTimelineV1,
  exerciseOwnedAuthoritySafeDevnetRecoveryLifecycleV1,
  withOwnedAuthoritySafeDevnetProcessesV1,
  type OwnedAuthoritySafeDevnetProcessV1Input,
} from './substrate-federated-authority-safe-devnet-process-v1.js';
import {
  assertFrontierBackingReadAgreementSourcesSealed,
  observeFrontierBackingReadAgreement,
} from './adapters/frontier-backing-read-agreement.js';
import {
  assertSubstrateFederatedDualNodeRecoveryDrillV1Receipt,
  runSubstrateFederatedDualNodeRecoveryDrillV1,
} from './apps/bridge-daemon/substrate-federated-dual-node-recovery-campaign-v1.js';

const CHAIN_SPEC_BYTES = Buffer.from(JSON.stringify({
  name: 'authority-safe-recovery',
  genesis: {
    runtimeGenesis: {
      patch: {
        manualSeal: { enable: true },
      },
    },
  },
}), 'utf8');
const PRIMARY_PEER_ID = '123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const WITNESS_PEER_ID = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ1';
const REPLACED_WITNESS_PEER_ID = '3456789ABCDEFGHJKLMNPQRSTUVWXYZ12';
const GENESIS_HASH = '00'.repeat(32);
const GENESIS_PARENT_HASH = 'ff'.repeat(32);
const BRIDGE_ADDRESS = `0x${'06'.repeat(20)}`;
const SERG_ADDRESS = `0x${'07'.repeat(20)}`;
const SIDECHAIN_ID = '08'.repeat(32);
const BRIDGE_RUNTIME_CODE = '0x6001';
const SERG_RUNTIME_CODE = '0x6002';
const BACKING_INTERFACE = new Interface([
  'function totalSERGSupply() view returns (uint256)',
  'function sergToken() view returns (address)',
  'function owner() view returns (address)',
]);
const PORTS = Object.freeze({
  primaryRpc: 19955,
  witnessRpc: 19956,
  primaryP2p: 30355,
  witnessP2p: 30356,
  primaryPrometheus: 19615,
  witnessPrometheus: 19616,
});
const TIP_SHAPE = Object.freeze({ height: true, blockHashHex: true });
const RECOVERY_RESULT_SHAPE = Object.freeze({
  process: {
    schema: true,
    version: true,
    nodeBinarySha256Hex: true,
    chainSpecSha256Hex: true,
    primaryPeerIdSha256Hex: true,
    witnessPeerIdSha256Hex: true,
    processBindingDigestHex: true,
    checks: {
      freshArchiveStateUsed: true,
      runningImageIdentityBoundForBothNodes: true,
      chainSpecFileRecheckedBeforeBothLaunchesAndAfterAction: true,
      rpcP2pAndPrometheusListenersOwnedBySpawnedProcesses: true,
      allListenersBoundToLoopback: true,
      exactMutualPeerIdentityObservedAtActionBoundaries: true,
      exactBinaryRecheckedAfterAction: true,
      bothProcessesStoppedAndListenersReleased: true,
    },
  },
  lifecycle: {
    schema: true,
    version: true,
    processBindingDigestHex: true,
    initialAgreement: TIP_SHAPE,
    lagRecovery: {
      before: TIP_SHAPE,
      primaryWhileWitnessStopped: TIP_SHAPE,
      recoveredAgreement: TIP_SHAPE,
      lagBlocks: true,
    },
    connectedRestart: {
      before: TIP_SHAPE,
      after: TIP_SHAPE,
      witnessPeerIdentityPreserved: true,
    },
    emptyTailReplacement: {
      finalizedAnchor: TIP_SHAPE,
      commonParent: TIP_SHAPE,
      abandonedTip: TIP_SHAPE,
      replacementAtAbandonedHeight: TIP_SHAPE,
      replacementTip: TIP_SHAPE,
    },
    checks: {
      exactConnectedBestTipAgreementObserved: true,
      deterministicWitnessLagAndRecoveryObserved: true,
      sameIdentityConnectedWitnessRestartObserved: true,
      transactionPoolEmptyBeforeEveryManualSeal: true,
      executionTransactionsAbsentForEveryCanonicalRecoveryBlock: true,
      manualSealPinnedForRecoveryLifecycle: true,
      grandpaVoterDisabledForRecoveryLifecycle: true,
      unfinalizedEmptyTailReplacementObserved: true,
      noProcessOrTransportCapabilityReturned: true,
    },
    boundaries: {
      independentAdministrationEstablished: true,
      sourceConsensusAuthenticated: true,
      sourceFinalityAuthenticated: true,
      transactionSubmissionAuthorized: true,
      mintAuthorized: true,
      payoutAuthorized: true,
      fundsAuthorityEstablished: true,
    },
  },
} as const);

interface ExactKeyShapeObject {
  readonly [key: string]: true | ExactKeyShapeObject;
}
type ExactKeyShape = true | ExactKeyShapeObject;

type FakeChild = ChildProcess & { alive: boolean; role: 'primary' | 'witness' };
interface FakeBlock {
  readonly hashHex: string;
  readonly parentHashHex: string;
  readonly height: number;
}

let children: FakeChild[];
let wrongListenerOwner: boolean;
let wrongListenerAddress: boolean;
let portProbeFailureAt: number | undefined;
let portProbeCommands: string[];
let wrongPeerIdentity: boolean;
let retainListenersAfterStop: boolean;
let witnessStartupFailure: boolean;
let stopFailureRole: FakeChild['role'] | undefined;
let pendingExtrinsics: boolean;
let manualSealRpcError: boolean;
let executionTransactions: boolean;
let restartPeerIdentity: boolean;
let wrongCreatedParent: boolean;
let canonicalReplacementDrift: boolean;
let finalizedHeadAdvances: boolean;
let runtimeDirectory: string;
let runningImagePath: string;
let blockCounter: number;
let primaryBestHashHex: string;
let witnessBestHashHex: string;
let abandonedHashHex: string | undefined;
let blocks: Map<string, FakeBlock>;
let rpcMethods: string[];
const temporaryDirectories: string[] = [];

describe.skipIf(process.platform !== 'win32')('owned authority-safe process lifecycle V1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    children = [];
    wrongListenerOwner = false;
    wrongListenerAddress = false;
    portProbeFailureAt = undefined;
    portProbeCommands = [];
    wrongPeerIdentity = false;
    retainListenersAfterStop = false;
    witnessStartupFailure = false;
    stopFailureRole = undefined;
    pendingExtrinsics = false;
    manualSealRpcError = false;
    executionTransactions = false;
    restartPeerIdentity = false;
    wrongCreatedParent = false;
    canonicalReplacementDrift = false;
    finalizedHeadAdvances = false;
    runtimeDirectory = '';
    runningImagePath = process.execPath;
    blockCounter = 0;
    primaryBestHashHex = GENESIS_HASH;
    witnessBestHashHex = GENESIS_HASH;
    abandonedHashHex = undefined;
    blocks = new Map([[GENESIS_HASH, {
      hashHex: GENESIS_HASH,
      parentHashHex: GENESIS_PARENT_HASH,
      height: 0,
    }]]);
    rpcMethods = [];
    mocks.verifyExecutableSha256.mockResolvedValue(undefined);
    mocks.spawn.mockImplementation((
      _path: string,
      args: readonly string[],
      options: Readonly<{ cwd?: string }>,
    ) => {
      runtimeDirectory = String(options.cwd ?? '');
      const role = args.includes('fed6g1c-primary') ? 'primary' : 'witness';
      const child = fakeChild(role, 41_001 + children.length);
      children.push(child);
      if (role === 'witness' && witnessStartupFailure) exitChild(child);
      return child;
    });
    mocks.spawnSync.mockImplementation((_path: string, args: readonly string[]) => {
      const command = String(args.at(-1) ?? '');
      if (command.includes('Get-Process -Id')) {
        return syncResult(runningImagePath);
      }
      if (command.includes('[System.Net.Sockets.TcpListener]')) {
        portProbeCommands.push(command);
        return portProbeCommands.length === portProbeFailureAt
          ? syncFailure('synthetic loopback bind rejection')
          : syncResult('');
      }
      const requestedPorts = command.match(/\$ports=@\(([^)]*)\)/)?.[1]
        ?.split(',')
        .map(value => Number(value.trim()))
        .filter(value => Number.isSafeInteger(value));
      const rows = listenerRows().filter(row =>
        requestedPorts === undefined || requestedPorts.includes(row.LocalPort),
      );
      return syncResult(JSON.stringify(rows));
    });
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        id?: number;
        method?: string;
        params?: readonly unknown[];
      };
      const role = String(_url).includes(String(PORTS.primaryRpc))
        ? 'primary'
        : 'witness';
      rpcMethods.push(String(body.method));
      if (body.method === 'system_localPeerId') {
        const witnessLaunchCount = children.filter(child => child.role === 'witness').length;
        const result = role === 'primary'
          ? PRIMARY_PEER_ID
          : restartPeerIdentity && witnessLaunchCount > 1
            ? REPLACED_WITNESS_PEER_ID
            : WITNESS_PEER_ID;
        return rpcResponse(result);
      }
      if (body.method === 'system_health') {
        return rpcResponse({ peers: 1, isSyncing: false, shouldHavePeers: true });
      }
      if (body.method === 'system_peers') {
        const expected = role === 'primary'
          ? WITNESS_PEER_ID
          : PRIMARY_PEER_ID;
        return rpcResponse([{ peerId: wrongPeerIdentity ? PRIMARY_PEER_ID : expected }]);
      }
      if (role === 'witness') syncWitness();
      if (body.method === 'chain_getHeader') {
        const requested = body.params?.[0];
        const hashHex = requested === undefined
          ? role === 'primary' ? primaryBestHashHex : witnessBestHashHex
          : rpcHash(requested);
        const block = blocks.get(hashHex);
        if (!block) return rpcResponse(null);
        return rpcResponse({
          parentHash: `0x${
            wrongCreatedParent && block.height > 0
              ? GENESIS_PARENT_HASH
              : block.parentHashHex
          }`,
          number: quantity(block.height),
          stateRoot: `0x${'aa'.repeat(32)}`,
          extrinsicsRoot: `0x${'bb'.repeat(32)}`,
          digest: { logs: [] },
        });
      }
      if (body.method === 'chain_getBlockHash') {
        const height = quantityNumber(body.params?.[0]);
        const bestHashHex = role === 'primary'
          ? primaryBestHashHex
          : witnessBestHashHex;
        if (
          canonicalReplacementDrift
          && height === 3
          && blockCounter >= 5
          && abandonedHashHex !== undefined
        ) {
          return rpcResponse(`0x${abandonedHashHex}`);
        }
        return rpcResponse(`0x${canonicalHashAt(bestHashHex, height)}`);
      }
      if (body.method === 'chain_getFinalizedHead') {
        return rpcResponse(`0x${
          finalizedHeadAdvances && blockCounter >= 5 && abandonedHashHex !== undefined
            ? abandonedHashHex
            : GENESIS_HASH
        }`);
      }
      if (body.method === 'eth_blockNumber') {
        const bestHashHex = role === 'primary'
          ? primaryBestHashHex
          : witnessBestHashHex;
        return rpcResponse(quantity(blocks.get(bestHashHex)!.height), body.id);
      }
      if (body.method === 'eth_getBlockByNumber') {
        const height = quantityNumber(body.params?.[0]);
        const bestHashHex = role === 'primary'
          ? primaryBestHashHex
          : witnessBestHashHex;
        const nativeHashHex = canonicalHashAt(bestHashHex, height);
        return rpcResponse({
          number: quantity(height),
          hash: `0x${evmHashForNative(nativeHashHex)}`,
          transactions: executionTransactions ? [`0x${'cc'.repeat(32)}`] : [],
        }, body.id);
      }
      if (body.method === 'eth_getLogs') {
        return rpcResponse([], body.id);
      }
      if (body.method === 'eth_chainId') {
        return rpcResponse(quantity(42), body.id);
      }
      if (body.method === 'eth_getCode') {
        const address = String(body.params?.[0]).toLowerCase();
        return rpcResponse(
          address === BRIDGE_ADDRESS ? BRIDGE_RUNTIME_CODE : SERG_RUNTIME_CODE,
          body.id,
        );
      }
      if (body.method === 'eth_call') {
        const call = body.params?.[0] as { data?: string } | undefined;
        if (call?.data === BACKING_INTERFACE.getFunction('totalSERGSupply')!.selector) {
          return rpcResponse(
            BACKING_INTERFACE.encodeFunctionResult('totalSERGSupply', [0n]),
            body.id,
          );
        }
        if (call?.data === BACKING_INTERFACE.getFunction('sergToken')!.selector) {
          return rpcResponse(
            BACKING_INTERFACE.encodeFunctionResult('sergToken', [SERG_ADDRESS]),
            body.id,
          );
        }
        if (call?.data === BACKING_INTERFACE.getFunction('owner')!.selector) {
          return rpcResponse(
            BACKING_INTERFACE.encodeFunctionResult('owner', [BRIDGE_ADDRESS]),
            body.id,
          );
        }
      }
      if (body.method === 'author_pendingExtrinsics') {
        return rpcResponse(pendingExtrinsics ? ['0xdead'] : []);
      }
      if (body.method === 'engine_createBlock') {
        if (manualSealRpcError) {
          return rpcErrorResponse(-32_010, 'manual seal rejected', body.id);
        }
        if (role !== 'primary') throw new Error('witness cannot seal blocks');
        const params = body.params ?? [];
        if (params[0] !== true || params[1] !== false) {
          throw new Error('unexpected manual-seal policy');
        }
        const parentHashHex = rpcHash(params[2]);
        const parent = blocks.get(parentHashHex);
        if (!parent) throw new Error('unknown manual-seal parent');
        blockCounter += 1;
        const hashHex = sha256(Buffer.from(
          `${blockCounter}:${parentHashHex}`,
          'utf8',
        ));
        const block = {
          hashHex,
          parentHashHex,
          height: parent.height + 1,
        };
        blocks.set(hashHex, block);
        if (blockCounter === 3) abandonedHashHex = hashHex;
        const currentBest = blocks.get(primaryBestHashHex)!;
        if (block.height > currentBest.height) primaryBestHashHex = hashHex;
        return rpcResponse({ hash: `0x${hashHex}`, aux: {}, proof_size: 0 });
      }
      throw new Error('unexpected lifecycle-test RPC method');
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const path of temporaryDirectories.splice(0)) {
      rmSync(path, { recursive: true, force: true });
    }
  });

  it('binds both running images and cleans both owned processes', async () => {
    const ownedInput = input();
    let callbackShape: Readonly<Record<string, unknown>> | undefined;
    const result = await withOwnedAuthoritySafeDevnetProcessesV1(
      ownedInput,
      async endpoints => {
        callbackShape = endpoints;
        return 'observed';
      },
    );

    expect(result.value).toBe('observed');
    expect(result.receipt.checks).toMatchObject({
      runningImageIdentityBoundForBothNodes: true,
      chainSpecFileRecheckedBeforeBothLaunchesAndAfterAction: true,
      allListenersBoundToLoopback: true,
      exactMutualPeerIdentityObservedAtActionBoundaries: true,
      bothProcessesStoppedAndListenersReleased: true,
    });
    const specPath = join(runtimeDirectory, 'authority-safe.json');
    expect(mocks.spawn.mock.calls.map(call => call[1])).toEqual([
      [
        '--chain', specPath,
        '--base-path', join(runtimeDirectory, 'primary'),
        '--listen-addr', `/ip4/127.0.0.1/tcp/${PORTS.primaryP2p}`,
        '--rpc-port', String(PORTS.primaryRpc),
        '--prometheus-port', String(PORTS.primaryPrometheus),
        '--no-telemetry',
        '--no-mdns',
        '--rpc-methods', 'unsafe',
        '--state-pruning', 'archive',
        '--blocks-pruning', 'archive',
        '--unsafe-force-node-key-generation',
        '--name', 'fed6g1c-primary',
        '--alice',
        '--force-authoring',
      ],
      [
        '--chain', specPath,
        '--base-path', join(runtimeDirectory, 'witness'),
        '--listen-addr', `/ip4/127.0.0.1/tcp/${PORTS.witnessP2p}`,
        '--rpc-port', String(PORTS.witnessRpc),
        '--prometheus-port', String(PORTS.witnessPrometheus),
        '--no-telemetry',
        '--no-mdns',
        '--rpc-methods', 'unsafe',
        '--state-pruning', 'archive',
        '--blocks-pruning', 'archive',
        '--unsafe-force-node-key-generation',
        '--name', 'fed6g1c-witness',
        '--bootnodes',
        `/ip4/127.0.0.1/tcp/${PORTS.primaryP2p}/p2p/${PRIMARY_PEER_ID}`,
      ],
    ]);
    expect(callbackShape).toEqual({
      primaryRpcUrl: `http://127.0.0.1:${PORTS.primaryRpc}`,
      witnessRpcUrl: `http://127.0.0.1:${PORTS.witnessRpc}`,
    });
    assertExactKeyShape(callbackShape, {
      primaryRpcUrl: true,
      witnessRpcUrl: true,
    });
    expect(Object.isFrozen(callbackShape)).toBe(true);
    expect(result.receipt.processBindingDigestHex).toBe(sha256Canonical({
      nodeBinarySha256Hex: ownedInput.expectedNodeBinarySha256Hex,
      chainSpecSha256Hex: ownedInput.expectedChainSpecSha256Hex,
      primaryRpcPort: PORTS.primaryRpc,
      witnessRpcPort: PORTS.witnessRpc,
      primaryP2pPort: PORTS.primaryP2p,
      witnessP2pPort: PORTS.witnessP2p,
      primaryPrometheusPort: PORTS.primaryPrometheus,
      witnessPrometheusPort: PORTS.witnessPrometheus,
      primaryP2pListenAddress: `/ip4/127.0.0.1/tcp/${PORTS.primaryP2p}`,
      witnessP2pListenAddress: `/ip4/127.0.0.1/tcp/${PORTS.witnessP2p}`,
      primaryPeerIdSha256Hex: sha256(Buffer.from(PRIMARY_PEER_ID, 'utf8')),
      witnessPeerIdSha256Hex: sha256(Buffer.from(WITNESS_PEER_ID, 'utf8')),
    }));
    expect(children.every(child => !child.alive)).toBe(true);
    expect(() => assertOwnedAuthoritySafeDevnetProcessV1Receipt(result.receipt)).not.toThrow();
    expect(() => assertOwnedAuthoritySafeDevnetRecoveryProcessV1Receipt(
      result.receipt,
    )).toThrow(/provenance/);
  });

  it('owns the finite agreement, lag, restart, and empty-tail replacement lifecycle', async () => {
    const result = await exerciseOwnedAuthoritySafeDevnetRecoveryLifecycleV1(
      input(),
    );

    expect(result.lifecycle.initialAgreement).toEqual({
      height: 0,
      blockHashHex: GENESIS_HASH,
    });
    expect(result.lifecycle.lagRecovery.before.height).toBe(0);
    expect(result.lifecycle.lagRecovery.primaryWhileWitnessStopped.height).toBe(2);
    expect(result.lifecycle.lagRecovery.recoveredAgreement).toEqual(
      result.lifecycle.lagRecovery.primaryWhileWitnessStopped,
    );
    expect(result.lifecycle.connectedRestart.before).toEqual(
      result.lifecycle.connectedRestart.after,
    );
    expect(result.lifecycle.emptyTailReplacement).toMatchObject({
      finalizedAnchor: { height: 0, blockHashHex: GENESIS_HASH },
      commonParent: { height: 2 },
      abandonedTip: { height: 3 },
      replacementAtAbandonedHeight: { height: 3 },
      replacementTip: { height: 4 },
    });
    expect(
      result.lifecycle.emptyTailReplacement.abandonedTip.blockHashHex,
    ).not.toBe(
      result.lifecycle.emptyTailReplacement
        .replacementAtAbandonedHeight.blockHashHex,
    );
    expect(result.lifecycle.boundaries).toEqual({
      independentAdministrationEstablished: false,
      sourceConsensusAuthenticated: false,
      sourceFinalityAuthenticated: false,
      transactionSubmissionAuthorized: false,
      mintAuthorized: false,
      payoutAuthorized: false,
      fundsAuthorityEstablished: false,
    });
    expect(result.lifecycle.processBindingDigestHex).toBe(
      result.process.processBindingDigestHex,
    );
    expect(Object.isFrozen(result.lifecycle)).toBe(true);
    expect(Object.isFrozen(result.lifecycle.emptyTailReplacement)).toBe(true);
    expect(() => assertOwnedAuthoritySafeDevnetProcessV1Receipt(
      result.process,
    )).toThrow(/provenance/);
    expect(() => assertOwnedAuthoritySafeDevnetRecoveryProcessV1Receipt(
      result.process,
    )).not.toThrow();
    expect(() => assertOwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt(
      result.lifecycle,
    )).not.toThrow();
    assertExactKeyShape(result, RECOVERY_RESULT_SHAPE);
    expect(rpcMethods.filter(method => method === 'engine_createBlock')).toHaveLength(5);
    expect(rpcMethods.filter(
      method => method === 'author_pendingExtrinsics',
    )).toHaveLength(5);
    expect(rpcMethods).not.toContain('author_submitExtrinsic');
    expect(mocks.spawn.mock.calls.every(call =>
      (call[1] as readonly string[]).includes('--no-grandpa'),
    )).toBe(true);
    expect(mocks.spawn.mock.calls.every(call => {
      const args = call[1] as readonly string[];
      const index = args.indexOf('--sealing');
      return index >= 0 && args[index + 1] === 'manual';
    })).toBe(true);
    const witnessChildren = children.filter(child => child.role === 'witness');
    expect(witnessChildren).toHaveLength(3);
    expect(portProbeCommands.slice(1)).toHaveLength(witnessChildren.length);
    expect(portProbeCommands.slice(1).every(command => command.includes(
      `@(${PORTS.witnessRpc},${PORTS.witnessP2p},${PORTS.witnessPrometheus})`,
    ))).toBe(true);
    expect(children.every(child => !child.alive)).toBe(true);
  });

  it('captures one sealed four-snapshot timeline and rejects an injected reader disagreement', async () => {
    const result = await captureOwnedAuthoritySafeDevnetRecoveryTimelineV1({
      process: input(),
      observation: {
        sidechainIdHex: SIDECHAIN_ID,
        expectedChainId: '42',
        bridgeAddress: BRIDGE_ADDRESS,
        expectedBridgeCodeHashHex: keccak256(BRIDGE_RUNTIME_CODE).slice(2),
        expectedSergAddress: SERG_ADDRESS,
        expectedSergCodeHashHex: keccak256(SERG_RUNTIME_CODE).slice(2),
      },
    });

    expect(() => assertOwnedAuthoritySafeDevnetRecoveryTimelineV1Material(result))
      .not.toThrow();
    expect(() => assertFrontierBackingReadAgreementSourcesSealed(result.sources))
      .not.toThrow();
    expect(result.receipt.checks).toEqual({
      fourSnapshotsCapturedInsideOneOwnedProcessLifetime: true,
      deterministicDualSourceDisagreementRejected: true,
      boundedReadSourcesSealedBeforeReturn: true,
      noProcessOrTransportCapabilityReturned: true,
    });
    expect(result.receipt.boundaries).toMatchObject({
      sameOwnedProcessLifetimeEstablished: true,
      independentAdministrationEstablished: false,
      sourceConsensusAuthenticated: false,
      sourceFinalityAuthenticated: false,
      fundsAuthorityEstablished: false,
    });
    expect(result.receipt.lifecycleDigestHex).toBe(
      sha256(Buffer.from(JSON.stringify(result.lifecycle), 'utf8')),
    );
    expect(result.snapshots.initial.pinnedHeight).toBe(0);
    expect(result.snapshots.lagRecovered.pinnedHeight).toBe(2);
    expect(result.snapshots.restarted.pinnedHeight).toBe(2);
    expect(result.snapshots.replacement.pinnedHeight).toBe(4);
    await expect(observeFrontierBackingReadAgreement({
      sources: result.sources,
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE_ADDRESS,
    })).rejects.toThrow(/sealed.*transport/i);
    expect(rpcMethods).not.toContain('author_submitExtrinsic');
    expect(children.every(child => !child.alive)).toBe(true);
  });

  it('deletes one physical database before composing the captured timeline', async () => {
    const receipt = await runSubstrateFederatedDualNodeRecoveryDrillV1({
      process: input(),
      observation: {
        sidechainIdHex: SIDECHAIN_ID,
        expectedChainId: '42',
        bridgeAddress: BRIDGE_ADDRESS,
        expectedBridgeCodeHashHex: keccak256(BRIDGE_RUNTIME_CODE).slice(2),
        expectedSergAddress: SERG_ADDRESS,
        expectedSergCodeHashHex: keccak256(SERG_RUNTIME_CODE).slice(2),
      },
    });

    expect(() => assertSubstrateFederatedDualNodeRecoveryDrillV1Receipt(receipt))
      .not.toThrow();
    expect(receipt.status).toBe('local_reconstructed_non_authorizing');
    expect(receipt.lifecycleDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.checks).toEqual({
      exactOwnedTimelineConsumed: true,
      deterministicDualSourceDisagreementRejected: true,
      fourSnapshotsCapturedInsideOneOwnedProcessLifetime: true,
      physicalEphemeralDatabaseDeletedAndRecreated: true,
      preDeletionSentinelAbsentAfterRecreation: true,
      promotedRecoveryCompositionConsumed: true,
      replacementDatabaseReopenedUnderContinuityHold: true,
      noProcessDatabaseOrTransportCapabilityReturned: true,
    });
    expect(receipt.boundaries).toMatchObject({
      sameOwnedProcessLifetimeEstablished: true,
      completeDatabaseDeletionObserved: true,
      sourceConsensusAuthenticated: false,
      sourceFinalityAuthenticated: false,
      lifecycleAuthorityRestored: false,
      fundsAuthorityEstablished: false,
    });
    expect(rpcMethods).not.toContain('author_submitExtrinsic');
    expect(children.every(child => !child.alive)).toBe(true);
  });

  it('rejects a nonempty transaction pool before any recovery block is sealed', async () => {
    pendingExtrinsics = true;
    await expect(
      exerciseOwnedAuthoritySafeDevnetRecoveryLifecycleV1(input()),
    ).rejects.toThrow(/transaction pool is not empty/);
    expect(rpcMethods).not.toContain('engine_createBlock');
    expect(children.every(child => !child.alive)).toBe(true);
  });

  it('rejects a recovery lifecycle whose genesis leaves manual sealing disabled', async () => {
    const chainSpecBytes = Buffer.from(JSON.stringify({
      genesis: {
        runtimeGenesis: {
          patch: {
            manualSeal: { enable: false },
          },
        },
      },
    }), 'utf8');
    await expect(
      exerciseOwnedAuthoritySafeDevnetRecoveryLifecycleV1({
        ...input(),
        chainSpecBytes,
        expectedChainSpecSha256Hex: sha256(chainSpecBytes),
      }),
    ).rejects.toThrow(/must enable manual sealing at genesis/);
    expect(children).toHaveLength(0);
  });

  it('reports a bounded manual-seal RPC failure before accepting a block', async () => {
    manualSealRpcError = true;
    await expect(
      exerciseOwnedAuthoritySafeDevnetRecoveryLifecycleV1(input()),
    ).rejects.toThrow(
      'startup RPC engine_createBlock failed: code -32010: manual seal rejected',
    );
    expect(children.every(child => !child.alive)).toBe(true);
  });

  it('rejects a canonical recovery block containing an execution transaction', async () => {
    executionTransactions = true;
    await expect(
      exerciseOwnedAuthoritySafeDevnetRecoveryLifecycleV1(input()),
    ).rejects.toThrow(/contains an execution transaction/);
    expect(children.every(child => !child.alive)).toBe(true);
  });

  it('rejects witness identity drift during the first recovery restart', async () => {
    restartPeerIdentity = true;
    await expect(
      exerciseOwnedAuthoritySafeDevnetRecoveryLifecycleV1(input()),
    ).rejects.toThrow(/peer identity changed during restart/);
    expect(children.every(child => !child.alive)).toBe(true);
  });

  it('rejects a manual-seal block whose header is not bound to the requested parent', async () => {
    wrongCreatedParent = true;
    await expect(
      exerciseOwnedAuthoritySafeDevnetRecoveryLifecycleV1(input()),
    ).rejects.toThrow(/block differs from its exact parent/);
    expect(children.every(child => !child.alive)).toBe(true);
  });

  it('rejects when the abandoned block remains canonical at its height', async () => {
    canonicalReplacementDrift = true;
    await expect(
      exerciseOwnedAuthoritySafeDevnetRecoveryLifecycleV1(input()),
    ).rejects.toThrow(/tail was not replaced/);
    expect(children.every(child => !child.alive)).toBe(true);
  });

  it('rejects when finality advances into the replaced tail', async () => {
    finalizedHeadAdvances = true;
    await expect(
      exerciseOwnedAuthoritySafeDevnetRecoveryLifecycleV1(input()),
    ).rejects.toThrow(/not demonstrably unfinalized/);
    expect(children.every(child => !child.alive)).toBe(true);
  });

  it('rejects a copied recovery lifecycle receipt', () => {
    expect(() => assertOwnedAuthoritySafeDevnetRecoveryProcessV1Receipt({
      schema: 'e2s.substrate-federated-owned-recovery-process.v1',
      version: 1,
    })).toThrow(/provenance/);
    expect(() => assertOwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt({
      schema: 'e2s.substrate-federated-owned-recovery-lifecycle.v1',
      version: 1,
    })).toThrow(/provenance/);
  });

  it('rejects a listener owned by a PID other than the spawned process', async () => {
    wrongListenerOwner = true;
    await expect(
      withOwnedAuthoritySafeDevnetProcessesV1(input(), async () => 'unreachable'),
    ).rejects.toThrow(/listener is not exclusively loopback-owned/);
    expect(children.every(child => !child.alive)).toBe(true);
  });

  it('rejects unowned ports that Windows refuses to bind', async () => {
    portProbeFailureAt = 1;
    await expect(
      withOwnedAuthoritySafeDevnetProcessesV1(input(), async () => 'unreachable'),
    ).rejects.toThrow(/port is not bindable on IPv4 loopback/);
    expect(portProbeCommands).toHaveLength(1);
    expect(portProbeCommands[0]).toContain(
      `@(${PORTS.primaryRpc},${PORTS.witnessRpc},${PORTS.primaryP2p},${PORTS.witnessP2p},${PORTS.primaryPrometheus},${PORTS.witnessPrometheus})`,
    );
    expect(portProbeCommands[0]).toMatch(/finally.*\.Stop\(\)/);
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(children).toHaveLength(0);
  });

  it('reprobes witness ports before launch and cleans up the primary on rejection', async () => {
    portProbeFailureAt = 2;
    await expect(
      withOwnedAuthoritySafeDevnetProcessesV1(input(), async () => 'unreachable'),
    ).rejects.toThrow(/port is not bindable on IPv4 loopback/);
    expect(portProbeCommands).toHaveLength(2);
    expect(portProbeCommands[1]).toContain(
      `@(${PORTS.witnessRpc},${PORTS.witnessP2p},${PORTS.witnessPrometheus})`,
    );
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(children).toHaveLength(1);
    expect(children[0]?.role).toBe('primary');
    expect(children[0]?.alive).toBe(false);
  });

  it('rejects a running process image from a different regular-file path', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'e2s-fed6g1c-wrong-image-'));
    temporaryDirectories.push(directory);
    runningImagePath = join(directory, 'wrong-image.exe');
    writeFileSync(runningImagePath, 'wrong image');
    await expect(
      withOwnedAuthoritySafeDevnetProcessesV1(input(), async () => 'unreachable'),
    ).rejects.toThrow(/process image path differs from the exact binary/);
    expect(children.every(child => !child.alive)).toBe(true);
  });

  it('rejects a running process image whose digest differs', async () => {
    mocks.verifyExecutableSha256.mockImplementation(async (_path, _digest, label) => {
      if (label.includes('running process image')) {
        throw new Error('running process image digest differs');
      }
    });
    await expect(
      withOwnedAuthoritySafeDevnetProcessesV1(input(), async () => 'unreachable'),
    ).rejects.toThrow(/running process image digest differs/);
    expect(children.every(child => !child.alive)).toBe(true);
  });

  it('rejects a listener exposed beyond IPv4 loopback', async () => {
    wrongListenerAddress = true;
    await expect(
      withOwnedAuthoritySafeDevnetProcessesV1(input(), async () => 'unreachable'),
    ).rejects.toThrow(/listener is not exclusively loopback-owned/);
    expect(children.every(child => !child.alive)).toBe(true);
  });

  it('rejects nodes that do not expose the exact reciprocal peer identities', async () => {
    wrongPeerIdentity = true;
    await expect(
      withOwnedAuthoritySafeDevnetProcessesV1(input(), async () => 'unreachable'),
    ).rejects.toThrow(/not connected to the exact peer identity/);
    expect(children.every(child => !child.alive)).toBe(true);
  });

  it('preserves an action failure after cleaning both processes', async () => {
    await expect(
      withOwnedAuthoritySafeDevnetProcessesV1(input(), async () => {
        throw new Error('synthetic action failure');
      }),
    ).rejects.toThrow(/synthetic action failure/);
    expect(children.every(child => !child.alive)).toBe(true);
  });

  it('preserves both action and cleanup failures', async () => {
    retainListenersAfterStop = true;
    let captured: unknown;
    try {
      await withOwnedAuthoritySafeDevnetProcessesV1(input(), async () => {
        throw new Error('synthetic action failure');
      });
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(AggregateError);
    expect((captured as AggregateError).errors.map(error => error.message)).toEqual([
      'synthetic action failure',
      expect.stringMatching(/process cleanup failed/),
    ]);
  });

  it('rejects chain-spec mutation during the owned action', async () => {
    await expect(
      withOwnedAuthoritySafeDevnetProcessesV1(input(), async () => {
        writeFileSync(join(runtimeDirectory, 'authority-safe.json'), 'changed');
        return 'unreachable';
      }),
    ).rejects.toThrow(/chain-spec file changed during target observation/);
    expect(children.every(child => !child.alive)).toBe(true);
  });

  it('rejects a node that exits during the owned action', async () => {
    await expect(
      withOwnedAuthoritySafeDevnetProcessesV1(input(), async () => {
        exitChild(children[0]!);
        return 'unreachable';
      }),
    ).rejects.toThrow(/primary process exited unexpectedly/);
  });

  it('rejects witness startup failure and still stops the primary', async () => {
    witnessStartupFailure = true;
    await expect(
      withOwnedAuthoritySafeDevnetProcessesV1(input(), async () => 'unreachable'),
    ).rejects.toThrow(/witness process exited unexpectedly/);
    expect(children[0]?.alive).toBe(false);
  });

  it('fails closed when an owned process cannot be stopped', async () => {
    stopFailureRole = 'witness';
    await expect(
      withOwnedAuthoritySafeDevnetProcessesV1(input(), async () => 'observed'),
    ).rejects.toThrow(/process cleanup failed/);
  });

  it('fails closed when listeners remain after process shutdown', async () => {
    retainListenersAfterStop = true;
    await expect(
      withOwnedAuthoritySafeDevnetProcessesV1(input(), async () => 'observed'),
    ).rejects.toThrow(/process cleanup failed/);
  });
});

function input(): OwnedAuthoritySafeDevnetProcessV1Input {
  return {
    nodeBinaryPath: process.execPath,
    expectedNodeBinarySha256Hex: sha256(readFileSync(process.execPath)),
    chainSpecBytes: CHAIN_SPEC_BYTES,
    expectedChainSpecSha256Hex: sha256(CHAIN_SPEC_BYTES),
    primaryRpcUrl: `http://127.0.0.1:${PORTS.primaryRpc}`,
    witnessRpcUrl: `http://127.0.0.1:${PORTS.witnessRpc}`,
    primaryP2pPort: PORTS.primaryP2p,
    witnessP2pPort: PORTS.witnessP2p,
    primaryPrometheusPort: PORTS.primaryPrometheus,
    witnessPrometheusPort: PORTS.witnessPrometheus,
  };
}

function fakeChild(role: FakeChild['role'], pid: number): FakeChild {
  const child = new EventEmitter() as FakeChild;
  Object.assign(child, {
    pid,
    exitCode: null,
    signalCode: null,
    alive: true,
    role,
    kill: vi.fn(() => {
      if (stopFailureRole === role) return false;
      exitChild(child, 'SIGKILL');
      return true;
    }),
  });
  return child;
}

function exitChild(child: FakeChild, signal: NodeJS.Signals | null = null): void {
  child.alive = false;
  Object.assign(child, {
    exitCode: signal === null ? 1 : null,
    signalCode: signal,
  });
  queueMicrotask(() => child.emit('close', child.exitCode, child.signalCode));
}

function listenerRows(): Array<{
  LocalAddress: string;
  LocalPort: number;
  OwningProcess: number;
}> {
  const rows: Array<{
    LocalAddress: string;
    LocalPort: number;
    OwningProcess: number;
  }> = [];
  for (const child of children) {
    if (!child.alive && !retainListenersAfterStop) continue;
    const ports = child.role === 'primary'
      ? [PORTS.primaryRpc, PORTS.primaryP2p, PORTS.primaryPrometheus]
      : [PORTS.witnessRpc, PORTS.witnessP2p, PORTS.witnessPrometheus];
    for (const localPort of ports) {
      rows.push({
        LocalAddress: '127.0.0.1',
        LocalPort: localPort,
        OwningProcess: child.pid!,
      });
      if (localPort === PORTS.primaryRpc || localPort === PORTS.witnessRpc) {
        rows.push({
          LocalAddress: '::1',
          LocalPort: localPort,
          OwningProcess: child.pid!,
        });
      }
    }
  }
  if (wrongListenerOwner && rows.length > 0) rows[0]!.OwningProcess = 49_999;
  if (wrongListenerAddress && rows.length > 0) rows[0]!.LocalAddress = '0.0.0.0';
  return rows;
}

function syncWitness(): void {
  if (!children.some(child => child.role === 'witness' && child.alive)) {
    throw new Error('witness chain RPC is unavailable while its process is stopped');
  }
  witnessBestHashHex = primaryBestHashHex;
}

function canonicalHashAt(bestHashHex: string, height: number): string {
  let current = blocks.get(bestHashHex);
  while (current && current.height > height) {
    current = blocks.get(current.parentHashHex);
  }
  if (!current || current.height !== height) {
    throw new Error('fake canonical height is unavailable');
  }
  return current.hashHex;
}

function rpcHash(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/i.test(value)) {
    throw new Error('fake RPC hash is malformed');
  }
  return value.slice(2).toLowerCase();
}

function evmHashForNative(nativeHashHex: string): string {
  return createHash('sha256')
    .update(Buffer.from(`evm:${nativeHashHex}`, 'utf8'))
    .digest('hex');
}

function quantityNumber(value: unknown): number {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error('fake RPC quantity is malformed');
  }
  return Number(BigInt(value));
}

function quantity(value: number): string {
  return `0x${value.toString(16)}`;
}

function syncResult(stdout: string) {
  return {
    pid: 99,
    output: [null, stdout, ''],
    stdout,
    stderr: '',
    status: 0,
    signal: null,
  };
}

function syncFailure(stderr: string) {
  return {
    pid: 99,
    output: [null, '', stderr],
    stdout: '',
    stderr,
    status: 1,
    signal: null,
  };
}

function rpcResponse(result: unknown, id = 1): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function rpcErrorResponse(code: number, message: string, id = 1): Response {
  return new Response(JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: { code, message },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function assertExactKeyShape(
  value: unknown,
  shape: ExactKeyShape,
  path = 'result',
): void {
  if (shape === true) {
    if (!['boolean', 'number', 'string'].includes(typeof value)) {
      throw new Error(`${path} is not an allowed receipt scalar`);
    }
    return;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} is not an exact receipt object`);
  }
  const record = value as Record<string, unknown>;
  if (Object.getPrototypeOf(record) !== Object.prototype) {
    throw new Error(`${path} has an unexpected receipt prototype`);
  }
  const ownKeys = Reflect.ownKeys(record);
  if (ownKeys.some(key => typeof key !== 'string')) {
    throw new Error(`${path} has a symbol capability key`);
  }
  const actualKeys = (ownKeys as string[]).sort();
  const expectedKeys = Object.keys(shape).sort();
  expect(actualKeys, `${path} keys`).toEqual(expectedKeys);
  for (const key of expectedKeys) {
    assertExactKeyShape(record[key], shape[key]!, `${path}.${key}`);
  }
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function sha256Canonical(value: unknown): string {
  return sha256(Buffer.from(JSON.stringify(value), 'utf8'));
}
