import { createHash } from 'crypto';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join } from 'path';

import { Network } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { ethers } from 'ethers';
import { describe, expect, it } from 'vitest';

import {
  CHECK_ONLY_COMMITTEE_PUBKEY_HEXES,
  createCommitteeConfig,
  injectCommitteePlaceholders,
} from './committee-config.js';
import { encodeCollByteRegister, encodeLongRegister } from './ergo-encoding.js';
import type {
  AssessPegInRouteObservationInput,
  PegInRouteObservationSource,
} from './peg-in-route-observation.js';
import {
  pegInRouteManifestDigestHex,
  sha256Utf8,
  type PegInRouteManifestV1,
} from './peg-in-route-manifest.js';
import {
  reconstructPegInRouteFromDistinctSources,
  type PegInRouteReconstruction,
} from './peg-in-route-reconstruction.js';
import {
  assertPegInJoinedCacheRecoveryReportProvenance,
  recoverPegInJoinedCache,
} from './peg-in-joined-cache-recovery.js';
import { PegInRuntimeReconciliationPass } from './peg-in-runtime-reconciliation.js';
import {
  FRONTIER_PEG_IN_EVENT_ABI,
  MAX_PEG_IN_SIDECHAIN_EVENTS,
  PEG_IN_SIDECHAIN_PROFILE_SCHEMA,
  assertPegInSidechainReconstructionProvenance,
  createReadOnlyFrontierPegInSource,
  pegInSidechainReconstructionDigestHex,
  reconstructPegInSidechainHistory,
  validatePegInSidechainReconstructionStructure,
  type PegInSidechainBlockIdentity,
  type PegInSidechainLogFilter,
  type PegInSidechainObservationSource,
  type PegInSidechainProfileV1,
} from './peg-in-sidechain-reconstruction.js';
import { StateTracker } from './state-tracker.js';

const ACTIVE_TREE = `1008cd02${'11'.repeat(32)}`;
const VAULT_TREE = `1008cd02${'22'.repeat(32)}`;
const LEGACY_TREE = `1008cd02${'33'.repeat(32)}`;
const DEPOSITOR_TREE = `1008cd02${'44'.repeat(32)}`;
const ACTIVE_ADDRESS = ErgoAddress.fromErgoTree(ACTIVE_TREE, Network.Testnet).toString();
const VAULT_ADDRESS = ErgoAddress.fromErgoTree(VAULT_TREE, Network.Testnet).toString();
const LEGACY_ADDRESS = ErgoAddress.fromErgoTree(LEGACY_TREE, Network.Testnet).toString();
const DEPOSIT_ID = '51'.repeat(32);
const DEPOSIT_TX_ID = '52'.repeat(32);
const COMMIT_TX_ID = '53'.repeat(32);
const VAULT_BOX_ID = '54'.repeat(32);
const HEADER_ID = '55'.repeat(32);
const REORG_HEADER_ID = '56'.repeat(32);
const COMMIT_BLOCK_ID = '57'.repeat(32);
const TARGET_H160 = '58'.repeat(20);
const PENDING_COMMIT_BLOCK_ID = '59'.repeat(32);
const LEGACY_BOX_ID = '5a'.repeat(32);
const SIDECHAIN_ID = '71'.repeat(32);
const BRIDGE_ADDRESS = `0x${'72'.repeat(20)}`;
const OTHER_ADDRESS = `0x${'73'.repeat(20)}`;
const TIP_HASH = '74'.repeat(32);
const DRIFT_TIP_HASH = '75'.repeat(32);
const EVENT_BLOCK_HASH = '76'.repeat(32);
const NONCANONICAL_EVENT_BLOCK_HASH = '77'.repeat(32);
const EVENT_TX_HASH = '78'.repeat(32);
const SECOND_EVENT_TX_HASH = '79'.repeat(32);
const UNKNOWN_BOX_ID = '7a'.repeat(32);
const AMOUNT = 10_000_000n;
const ROUTE_OBSERVED_AT = '2026-07-16T12:00:00.000Z';
const SIDECHAIN_OBSERVED_AT = '2026-07-16T12:05:00.000Z';
const TRACKER_NFT_ID = '61'.repeat(32);
const DUP_NFT_ID = '62'.repeat(32);
const eventInterface = new ethers.Interface([FRONTIER_PEG_IN_EVENT_ABI]);

function commitmentVerification(height: number) {
  return {
    headerIdHex: COMMIT_BLOCK_ID,
    height,
    blockVersion: 2,
    transactionsRootHex: '7b'.repeat(32),
    transactionIdHex: COMMIT_TX_ID,
    transactionSigmaDigestHex: '7c'.repeat(32),
    transactionIndex: 0,
    transactionCount: 1,
    headerIdMatchedCanonicalBytes: true as const,
    transactionsRootMatchedCanonicalHeaderBytes: true as const,
    transactionRootMatched: true as const,
  };
}

function commitmentConfirmation(height: number) {
  return {
    inclusionHeight: height,
    inclusionHeaderId: COMMIT_BLOCK_ID,
    verification: commitmentVerification(height),
  };
}

const MCL_TEMPLATE = [
  '{',
  '  val vault = fromBase16("SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER")',
  '  val committee = Coll(COMMITTEE_SIGMAPROP_PLACEHOLDERS)',
  '  atLeast(COMMITTEE_THRESHOLD_PLACEHOLDER, committee)',
  '}',
].join('\n');
const VAULT_TEMPLATE = [
  '{',
  '  val tracker = fromBase16("TRACKER_NFT_ID_PLACEHOLDER")',
  '  val dup = fromBase16("DUP_NFT_ID_PLACEHOLDER")',
  '  sigmaProp(tracker != dup)',
  '}',
].join('\n');

type RouteMode = 'committed' | 'commit_pending' | 'refundable';

interface RouteSourceOptions {
  mode: RouteMode;
  legacyHistory?: boolean;
  drift?: boolean;
}

interface EventSpec {
  boxIdHex: string;
  recipientAddress: string;
  amount: bigint;
  transactionHashHex: string;
  blockNumber: number;
  blockHashHex: string;
  logIndex: number;
  address?: string;
  removed?: boolean;
  receiptStatus?: number;
  receiptLogData?: string;
  rawTopics?: readonly string[];
}

interface FrontierState {
  events: EventSpec[];
  processedBoxIds: Set<string>;
  tipHeight?: number;
  tipHashHex?: string;
  chainId?: bigint;
  drift?: boolean;
  driftAfterBlockNumberCall?: number;
  abaEventBlock?: boolean;
  noncanonicalEventBlock?: boolean;
}

function resolvedMclSource(): string {
  return injectCommitteePlaceholders(
    MCL_TEMPLATE,
    createCommitteeConfig(CHECK_ONLY_COMMITTEE_PUBKEY_HEXES, '2'),
  ).replaceAll('SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER', VAULT_TREE);
}

function resolvedVaultSource(): string {
  return VAULT_TEMPLATE
    .replaceAll('TRACKER_NFT_ID_PLACEHOLDER', TRACKER_NFT_ID)
    .replaceAll('DUP_NFT_ID_PLACEHOLDER', DUP_NFT_ID);
}

function sha256HexBytes(hex: string): string {
  return createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');
}

function manifest(): PegInRouteManifestV1 {
  return {
    schemaVersion: 'ergo.bridge.peg-in-route-manifest.v1',
    kind: 'committed-vault-route-manifest',
    manifestId: 'peg-in-sidechain-reconstruction-testnet',
    network: {
      id: 'ergo-testnet',
      nodeInfoNetwork: 'testnet',
      addressNetworkPrefix: 16,
      p2sAddressHeader: 19,
      anchorHeader: {
        height: 91,
        idHex: HEADER_ID,
        minimumDepth: 10,
        maximumAgeBlocks: 720,
      },
    },
    coverage: {
      mode: 'complete_active_and_historical_main-chain-lock_route_set',
      declaredLegacyCount: 1,
      cutoff: {
        event: 'committed_vault_v3_route_declared',
        sourceRevision: '63'.repeat(20),
      },
      basis: [{
        reference: 'repository://docs/reviewed-peg-in-route.md',
        sha256Hex: '64'.repeat(32),
      }],
    },
    route: {
      profile: 'committed-vault-v3',
      commitConfirmations: 10,
      committee: {
        publicKeysHex: [...CHECK_ONLY_COMMITTEE_PUBKEY_HEXES],
        threshold: 2,
      },
      mainChainLock: {
        scriptRole: 'refundable-deposit-staging',
        address: ACTIVE_ADDRESS,
        ergoTreeHex: ACTIVE_TREE,
        ergoTreeSha256Hex: sha256HexBytes(ACTIVE_TREE),
        source: {
          reference: 'contracts/MainChainLock.es',
          templateSha256Hex: sha256Utf8(MCL_TEMPLATE),
          resolvedSha256Hex: sha256Utf8(resolvedMclSource()),
        },
      },
      settlementVault: {
        scriptRole: 'configured-settlement-vault',
        profileId: 'main-chain-aggregate-unlock-trustless-v1-compatibility',
        address: VAULT_ADDRESS,
        ergoTreeHex: VAULT_TREE,
        ergoTreeSha256Hex: sha256HexBytes(VAULT_TREE),
        source: {
          reference: 'contracts/MainChainAggregateUnlockTrustless.es',
          templateSha256Hex: sha256Utf8(VAULT_TEMPLATE),
          resolvedSha256Hex: sha256Utf8(resolvedVaultSource()),
          trackerNftIdHex: TRACKER_NFT_ID,
          duplicatePreventionNftIdHex: DUP_NFT_ID,
        },
      },
    },
    legacyMainChainLocks: [{
      ordinal: 0,
      scriptRole: 'legacy-refundable-deposit-staging',
      version: 'legacy-v2',
      address: LEGACY_ADDRESS,
      ergoTreeHex: LEGACY_TREE,
      ergoTreeSha256Hex: sha256HexBytes(LEGACY_TREE),
    }],
  };
}

function deposit(mode: RouteMode): any {
  return {
    boxId: DEPOSIT_ID,
    transactionId: DEPOSIT_TX_ID,
    index: 0,
    creationHeight: 80,
    value: AMOUNT.toString(),
    ergoTree: ACTIVE_TREE,
    assets: [],
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(TARGET_H160, 'hex')),
      R5: encodeLongRegister(AMOUNT),
      R6: encodeCollByteRegister(Buffer.from(CHECK_ONLY_COMMITTEE_PUBKEY_HEXES[0], 'hex')),
      R7: encodeCollByteRegister(Buffer.from(DEPOSITOR_TREE, 'hex')),
    },
    spentTransactionId: mode === 'refundable' ? null : COMMIT_TX_ID,
  };
}

function vaultBox(mode: RouteMode): any {
  const creationHeight = mode === 'commit_pending' ? 98 : 90;
  return {
    boxId: VAULT_BOX_ID,
    transactionId: COMMIT_TX_ID,
    index: 0,
    creationHeight,
    value: AMOUNT.toString(),
    ergoTree: VAULT_TREE,
    assets: [],
    additionalRegisters: {
      R4: encodeCollByteRegister(Buffer.from(DEPOSIT_ID, 'hex')),
      R5: encodeCollByteRegister(Buffer.from(TARGET_H160, 'hex')),
      R6: encodeLongRegister(AMOUNT),
      R7: encodeCollByteRegister(Buffer.from(DEPOSITOR_TREE, 'hex')),
    },
    spentTransactionId: null,
  };
}

function legacyBox(): any {
  return {
    boxId: LEGACY_BOX_ID,
    transactionId: '5b'.repeat(32),
    index: 0,
    creationHeight: 70,
    value: AMOUNT.toString(),
    ergoTree: LEGACY_TREE,
    assets: [],
    additionalRegisters: {},
    spentTransactionId: '5c'.repeat(32),
  };
}

function commitTransaction(mode: RouteMode): any {
  const output = structuredClone(vaultBox(mode));
  delete output.spentTransactionId;
  return {
    id: COMMIT_TX_ID,
    inclusionHeight: output.creationHeight,
    headerId: mode === 'commit_pending' ? PENDING_COMMIT_BLOCK_ID : COMMIT_BLOCK_ID,
    inputs: [{ boxId: DEPOSIT_ID }],
    outputs: [output],
  };
}

class FakeRouteSource implements PegInRouteObservationSource {
  private bestHeaderCalls = 0;

  constructor(
    readonly observationSourceId: string,
    private readonly options: RouteSourceOptions,
  ) {}

  async getInfo(): Promise<unknown> {
    return { network: 'testnet', fullHeight: 100 };
  }

  async getIndexedHeight(): Promise<unknown> {
    return { indexedHeight: 100, fullHeight: 100 };
  }

  async getBestHeader(): Promise<unknown> {
    this.bestHeaderCalls += 1;
    if (this.options.drift && this.bestHeaderCalls > 1) {
      return { height: 101, id: REORG_HEADER_ID };
    }
    return { height: 100, id: HEADER_ID };
  }

  async getBlockHeaderIdsAtHeight(height: number): Promise<string[]> {
    if (height === 91) return [HEADER_ID];
    if (height === 90) return [COMMIT_BLOCK_ID];
    if (height === 98) return [PENDING_COMMIT_BLOCK_ID];
    return [];
  }

  async getIndexedBoxesByAddress(address: string): Promise<unknown[]> {
    if (address === ACTIVE_ADDRESS) return [deposit(this.options.mode)];
    if (address === VAULT_ADDRESS) {
      return this.options.mode === 'refundable' ? [] : [vaultBox(this.options.mode)];
    }
    if (address === LEGACY_ADDRESS) {
      return this.options.legacyHistory ? [legacyBox()] : [];
    }
    throw new Error(`unexpected address ${address}`);
  }

  async getUnspentBoxesByAddress(address: string): Promise<unknown[]> {
    if (address === ACTIVE_ADDRESS) {
      return this.options.mode === 'refundable' ? [deposit(this.options.mode)] : [];
    }
    if (address === VAULT_ADDRESS) {
      return this.options.mode === 'refundable' ? [] : [vaultBox(this.options.mode)];
    }
    if (address === LEGACY_ADDRESS) return [];
    throw new Error(`unexpected address ${address}`);
  }

  async getTransaction(txId: string): Promise<unknown | null> {
    return this.options.mode !== 'refundable' && txId === COMMIT_TX_ID
      ? commitTransaction(this.options.mode)
      : null;
  }

  async compileP2sAddress(source: string): Promise<string> {
    if (source === resolvedMclSource()) return ACTIVE_ADDRESS;
    if (source === resolvedVaultSource()) return VAULT_ADDRESS;
    throw new Error('unexpected source template');
  }
}

function profile(overrides: Partial<PegInSidechainProfileV1> = {}): PegInSidechainProfileV1 {
  return {
    schema: PEG_IN_SIDECHAIN_PROFILE_SCHEMA,
    sidechainIdHex: SIDECHAIN_ID,
    evmChainId: '1337',
    bridgeAddress: BRIDGE_ADDRESS,
    deploymentBlock: 100,
    requiredConfirmations: 3,
    maxEvents: 100,
    ...overrides,
  };
}

function event(overrides: Partial<EventSpec> = {}): EventSpec {
  return {
    boxIdHex: DEPOSIT_ID,
    recipientAddress: `0x${TARGET_H160}`,
    amount: AMOUNT,
    transactionHashHex: EVENT_TX_HASH,
    blockNumber: 118,
    blockHashHex: EVENT_BLOCK_HASH,
    logIndex: 0,
    ...overrides,
  };
}

function rawEventLog(spec: EventSpec): Record<string, unknown> {
  const encoded = eventInterface.encodeEventLog(
    eventInterface.getEvent('PegIn')!,
    [spec.recipientAddress, spec.amount, `0x${spec.boxIdHex}`],
  );
  return {
    address: spec.address ?? BRIDGE_ADDRESS,
    topics: spec.rawTopics ?? encoded.topics,
    data: encoded.data,
    transactionHash: `0x${spec.transactionHashHex}`,
    blockNumber: spec.blockNumber,
    blockHash: `0x${spec.blockHashHex}`,
    index: spec.logIndex,
    removed: spec.removed ?? false,
  };
}

class FakeFrontierSource implements PegInSidechainObservationSource {
  readonly logFilters: PegInSidechainLogFilter[] = [];
  readonly processedQueries: Array<{
    bridgeAddress: string;
    ergoBoxIdHex: string;
    block: PegInSidechainBlockIdentity;
  }> = [];
  private blockNumberCalls = 0;
  private readonly eventBlockCalls = new Map<number, number>();

  constructor(
    readonly observationSourceId: string,
    private readonly state: FrontierState,
  ) {}

  async getChainId(): Promise<unknown> {
    return this.state.chainId ?? 1337n;
  }

  async getBlockNumber(): Promise<unknown> {
    this.blockNumberCalls += 1;
    const tipHeight = this.state.tipHeight ?? 120;
    const driftAfter = this.state.driftAfterBlockNumberCall
      ?? (this.state.drift ? 1 : Number.MAX_SAFE_INTEGER);
    return this.blockNumberCalls > driftAfter ? tipHeight + 1 : tipHeight;
  }

  async getBlock(blockNumber: number): Promise<unknown | null> {
    const tipHeight = this.state.tipHeight ?? 120;
    if (blockNumber === tipHeight) {
      return { number: blockNumber, hash: `0x${this.state.tipHashHex ?? TIP_HASH}` };
    }
    if (
      blockNumber === tipHeight + 1
      && (this.state.drift || this.state.driftAfterBlockNumberCall !== undefined)
    ) {
      return { number: blockNumber, hash: `0x${DRIFT_TIP_HASH}` };
    }
    const matching = this.state.events.find(candidate => candidate.blockNumber === blockNumber);
    if (matching) {
      const calls = (this.eventBlockCalls.get(blockNumber) ?? 0) + 1;
      this.eventBlockCalls.set(blockNumber, calls);
      return {
        number: blockNumber,
        hash: `0x${this.state.noncanonicalEventBlock
          || (this.state.abaEventBlock && calls > 1)
          ? NONCANONICAL_EVENT_BLOCK_HASH
          : matching.blockHashHex}`,
      };
    }
    return null;
  }

  async getLogs(filter: PegInSidechainLogFilter): Promise<unknown[]> {
    this.logFilters.push(filter);
    return this.state.events.map(rawEventLog);
  }

  async getTransactionReceipt(transactionHash: string): Promise<unknown | null> {
    const clean = transactionHash.slice(2).toLowerCase();
    const matching = this.state.events.find(candidate => candidate.transactionHashHex === clean);
    if (!matching) return null;
    const receiptLog = rawEventLog(matching);
    if (matching.receiptLogData !== undefined) receiptLog.data = matching.receiptLogData;
    return {
      status: matching.receiptStatus ?? 1,
      transactionHash,
      blockNumber: matching.blockNumber,
      blockHash: `0x${matching.blockHashHex}`,
      logs: [receiptLog],
    };
  }

  async getProcessedPegIn(
    bridgeAddress: string,
    ergoBoxIdHex: string,
    block: PegInSidechainBlockIdentity,
  ): Promise<unknown> {
    this.processedQueries.push({ bridgeAddress, ergoBoxIdHex, block });
    return this.state.processedBoxIds.has(ergoBoxIdHex);
  }
}

function routeObservationInput(
  mode: RouteMode = 'committed',
  legacyHistory = false,
): AssessPegInRouteObservationInput {
  const routeManifest = manifest();
  return {
    manifest: routeManifest,
    expectedManifestSha256Hex: pegInRouteManifestDigestHex(routeManifest),
    mainChainLockTemplateSource: MCL_TEMPLATE,
    settlementVaultTemplateSource: VAULT_TEMPLATE,
    primarySource: new FakeRouteSource('http://127.0.0.1:9053', { mode, legacyHistory }),
    witnessSource: new FakeRouteSource('http://127.0.0.1:19053', { mode, legacyHistory }),
    generatedAt: ROUTE_OBSERVED_AT,
  };
}

async function route(
  mode: RouteMode = 'committed',
  legacyHistory = false,
): Promise<PegInRouteReconstruction> {
  return reconstructPegInRouteFromDistinctSources(
    routeObservationInput(mode, legacyHistory),
  );
}

function routeReobservationInputLike(
  current: PegInRouteReconstruction,
): AssessPegInRouteObservationInput {
  const classification = current.activeHistory[0]?.classification;
  const mode: RouteMode = classification === 'refundable'
    ? 'refundable'
    : classification === 'commit_pending'
      ? 'commit_pending'
      : 'committed';
  return routeObservationInput(
    mode,
    current.legacyRoutes.some(legacy => legacy.historyBoxIdsHex.length > 0),
  );
}

function frontierPair(state: FrontierState): [FakeFrontierSource, FakeFrontierSource] {
  return [
    new FakeFrontierSource('http://127.0.0.1:9944', structuredClone(state)),
    new FakeFrontierSource('http://127.0.0.1:19944', structuredClone(state)),
  ];
}

async function reconstruct(
  ergoRoute: PegInRouteReconstruction,
  state: FrontierState,
  ergoRouteReobservationInput: AssessPegInRouteObservationInput = (
    routeReobservationInputLike(ergoRoute)
  ),
) {
  const [primarySource, witnessSource] = frontierPair(state);
  const reconstruction = await reconstructPegInSidechainHistory({
    profile: profile(),
    ergoRoute,
    primarySource,
    witnessSource,
    ergoRouteReobservationInput,
    observedAt: SIDECHAIN_OBSERVED_AT,
  });
  return { reconstruction, primarySource, witnessSource };
}

function joinedRecoveryInput(
  stateTracker: StateTracker,
  mode: RouteMode = 'committed',
  frontierState: FrontierState = {
    events: [event()],
    processedBoxIds: new Set([DEPOSIT_ID]),
  },
  legacyHistory = false,
) {
  const [primaryFrontierSource, witnessFrontierSource] = frontierPair(frontierState);
  return {
    stateTracker,
    ergoRouteObservation: routeObservationInput(mode, legacyHistory),
    profile: profile(),
    primaryFrontierSource,
    witnessFrontierSource,
    observedAt: SIDECHAIN_OBSERVED_AT,
  };
}

async function withTempDatabase(
  run: (directory: string, dbPath: string) => Promise<void>,
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'peg-in-joined-cache-'));
  const dbPath = join(directory, 'state.sqlite');
  try {
    await run(directory, dbPath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('peg-in sidechain reconstruction', () => {
  it('sends ordered stability reads without provider caching or batching', async () => {
    let blockNumberRequests = 0;
    let sawBatch = false;
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', chunk => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as
          | { id: unknown; method: string }
          | Array<{ id: unknown; method: string }>;
        sawBatch ||= Array.isArray(payload);
        const requests = Array.isArray(payload) ? payload : [payload];
        const responses = requests.map(rpc => {
          if (rpc.method === 'eth_chainId') {
            return { jsonrpc: '2.0', id: rpc.id, result: '0x539' };
          }
          if (rpc.method === 'eth_blockNumber') {
            blockNumberRequests += 1;
            return {
              jsonrpc: '2.0',
              id: rpc.id,
              result: `0x${blockNumberRequests.toString(16)}`,
            };
          }
          return {
            jsonrpc: '2.0',
            id: rpc.id,
            error: { code: -32601, message: 'unsupported test method' },
          };
        });
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(Array.isArray(payload) ? responses : responses[0]));
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    const source = createReadOnlyFrontierPegInSource(
      `http://127.0.0.1:${address.port}`,
    );
    try {
      const heights = await Promise.all([
        source.getBlockNumber(),
        source.getBlockNumber(),
      ]);
      expect(heights.sort()).toEqual([1, 2]);
      expect(blockNumberRequests).toBe(2);
      expect(sawBatch).toBe(false);
    } finally {
      source.destroy?.();
      await new Promise<void>((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      });
    }
  });

  it('exposes only read methods on the concrete Frontier adapter', () => {
    const source = createReadOnlyFrontierPegInSource('http://127.0.0.1:9944');
    try {
      expect(Object.keys(source).sort()).toEqual([
        'destroy',
        'getBlock',
        'getBlockNumber',
        'getChainId',
        'getLogs',
        'getProcessedPegIn',
        'getTransactionReceipt',
        'observationSourceId',
      ]);
      expect(source).not.toHaveProperty('wallet');
      expect(source).not.toHaveProperty('signer');
      expect(source).not.toHaveProperty('sendTransaction');
    } finally {
      source.destroy?.();
    }
  });

  it('reconstructs a committed, unminted deposit without creating mint authority', async () => {
    const { reconstruction, primarySource } = await reconstruct(await route(), {
      events: [],
      processedBoxIds: new Set(),
    });

    expect(reconstruction.decision).toEqual({
      classification: 'reconstruction_consistent',
      exactCrossChainHistoryAgreement: true,
    });
    expect(reconstruction.entries).toContainEqual(expect.objectContaining({
      ergoBoxIdHex: DEPOSIT_ID,
      routeClassification: 'committed',
      processedAtObservedTip: false,
      state: 'committed_unminted',
      event: null,
    }));
    expect(reconstruction.boundary).toEqual({
      readOnlyObservation: true,
      localOrPersistedStateDoesNotAuthorizeMint: true,
      ergoRouteReobservedAfterFrontier: true,
      frontierTipsRecheckedAfterErgo: true,
      processedBooleanAloneDoesNotProveMint: true,
      confirmationDepthDoesNotProveGrandpaFinality: true,
      distinctOriginsDoNotProveIndependentOperationOrConsensus: true,
      noCheckerSignerSubmitterOrBroadcastCapability: true,
    });
    expect(primarySource.processedQueries).toEqual([
      {
        bridgeAddress: BRIDGE_ADDRESS,
        ergoBoxIdHex: DEPOSIT_ID,
        block: { height: 120, idHex: TIP_HASH },
      },
      {
        bridgeAddress: BRIDGE_ADDRESS,
        ergoBoxIdHex: DEPOSIT_ID,
        block: { height: 120, idHex: TIP_HASH },
      },
    ]);
    expect(primarySource.logFilters).toEqual([{
      address: BRIDGE_ADDRESS,
      fromBlock: 100,
      toBlock: 120,
      topics: [ethers.id('PegIn(address,uint256,bytes32)').toLowerCase()],
    }]);
    expect(pegInSidechainReconstructionDigestHex({
      schema: reconstruction.schema,
      profile: reconstruction.profile,
      ergoRouteReconstructionDigestHex: reconstruction.ergoRouteReconstructionDigestHex,
      frontierViewDigestHex: reconstruction.frontierViewDigestHex,
      frontierSourceIds: reconstruction.frontierSourceIds,
      observedTip: reconstruction.observedTip,
      entries: reconstruction.entries,
      issues: reconstruction.issues,
      decision: reconstruction.decision,
      boundary: reconstruction.boundary,
    })).toBe(reconstruction.reconstructionDigestHex);
    expect(() => assertPegInSidechainReconstructionProvenance(reconstruction)).not.toThrow();
  });

  it('binds one successful canonical event and block-pinned processed state to the Ergo route', async () => {
    const { reconstruction } = await reconstruct(await route(), {
      events: [event()],
      processedBoxIds: new Set([DEPOSIT_ID]),
    });

    expect(reconstruction.issues).toEqual([]);
    expect(reconstruction.entries).toContainEqual(expect.objectContaining({
      ergoBoxIdHex: DEPOSIT_ID,
      state: 'mint_confirmed_by_depth',
      processedAtObservedTip: true,
      event: {
        ergoBoxIdHex: DEPOSIT_ID,
        recipientAddress: `0x${TARGET_H160}`,
        amountNanoErg: AMOUNT.toString(),
        transactionHashHex: EVENT_TX_HASH,
        blockNumber: 118,
        blockHashHex: EVENT_BLOCK_HASH,
        logIndex: 0,
        confirmations: 3,
        confirmationStatus: 'confirmed_by_depth',
      },
    }));
  });

  it('retains a shallow event as depth-pending without claiming GRANDPA finality', async () => {
    const { reconstruction } = await reconstruct(await route(), {
      events: [event({ blockNumber: 120, blockHashHex: TIP_HASH })],
      processedBoxIds: new Set([DEPOSIT_ID]),
    });

    expect(reconstruction.entries).toContainEqual(expect.objectContaining({
      state: 'mint_pending',
      event: expect.objectContaining({
        confirmations: 1,
        confirmationStatus: 'pending',
      }),
    }));
    expect(reconstruction.boundary.confirmationDepthDoesNotProveGrandpaFinality).toBe(true);
  });

  it('blocks processed state that has no canonical event', async () => {
    const { reconstruction } = await reconstruct(await route(), {
      events: [],
      processedBoxIds: new Set([DEPOSIT_ID]),
    });

    expect(reconstruction.decision.classification).toBe('blocked_inconsistent_mint_history');
    expect(reconstruction.entries[0].state).toBe('invalid_processed_state_without_event');
    expect(reconstruction.issues).toContainEqual(expect.objectContaining({
      code: 'processed_state_without_event',
      ergoBoxIdHex: DEPOSIT_ID,
    }));
  });

  it('blocks an event that is not reflected in processed state', async () => {
    const { reconstruction } = await reconstruct(await route(), {
      events: [event()],
      processedBoxIds: new Set(),
    });

    expect(reconstruction.entries[0].state).toBe('invalid_event_without_processed_state');
    expect(reconstruction.issues).toContainEqual(expect.objectContaining({
      code: 'event_without_processed_state',
    }));
  });

  it.each([
    ['recipient', event({ recipientAddress: OTHER_ADDRESS })],
    ['amount', event({ amount: AMOUNT + 1n })],
  ])('blocks a canonical event with the wrong %s binding', async (_field, wrongEvent) => {
    const { reconstruction } = await reconstruct(await route(), {
      events: [wrongEvent],
      processedBoxIds: new Set([DEPOSIT_ID]),
    });

    expect(reconstruction.entries[0].state).toBe('invalid_event_semantics');
    expect(reconstruction.issues).toContainEqual(expect.objectContaining({
      code: 'event_semantics_mismatch',
    }));
  });

  it.each(['refundable', 'commit_pending'] as const)(
    'blocks a mint observed while the Ergo route is %s',
    async mode => {
      const { reconstruction } = await reconstruct(await route(mode), {
        events: [event()],
        processedBoxIds: new Set([DEPOSIT_ID]),
      });

      expect(reconstruction.entries[0].state).toBe('invalid_mint_without_committed_vault');
      expect(reconstruction.issues).toContainEqual(expect.objectContaining({
        code: 'mint_without_committed_vault',
      }));
    },
  );

  it('blocks legacy mint history whose original recipient and amount cannot be reconstructed', async () => {
    const legacyEvent = event({
      boxIdHex: LEGACY_BOX_ID,
      transactionHashHex: SECOND_EVENT_TX_HASH,
    });
    const { reconstruction } = await reconstruct(await route('committed', true), {
      events: [legacyEvent],
      processedBoxIds: new Set([LEGACY_BOX_ID]),
    });

    expect(reconstruction.entries).toContainEqual(expect.objectContaining({
      ergoBoxIdHex: LEGACY_BOX_ID,
      routeKind: 'legacy',
      state: 'legacy_mint_observed_unverifiable',
    }));
    expect(reconstruction.issues).toContainEqual(expect.objectContaining({
      code: 'legacy_mint_semantics_unverifiable',
      ergoBoxIdHex: LEGACY_BOX_ID,
    }));
  });

  it('labels both legacy event/mapping disagreement directions as invalid states', async () => {
    const legacyRoute = await route('committed', true);
    const processedWithoutEvent = await reconstruct(legacyRoute, {
      events: [],
      processedBoxIds: new Set([LEGACY_BOX_ID]),
    });
    expect(processedWithoutEvent.reconstruction.entries).toContainEqual(expect.objectContaining({
      ergoBoxIdHex: LEGACY_BOX_ID,
      state: 'legacy_invalid_processed_state_without_event',
    }));

    const eventWithoutProcessed = await reconstruct(legacyRoute, {
      events: [event({
        boxIdHex: LEGACY_BOX_ID,
        transactionHashHex: SECOND_EVENT_TX_HASH,
      })],
      processedBoxIds: new Set(),
    });
    expect(eventWithoutProcessed.reconstruction.entries).toContainEqual(expect.objectContaining({
      ergoBoxIdHex: LEGACY_BOX_ID,
      state: 'legacy_invalid_event_without_processed_state',
    }));
  });

  it('blocks an event outside the complete manifest-bound Ergo route history', async () => {
    const { reconstruction } = await reconstruct(await route(), {
      events: [event({ boxIdHex: UNKNOWN_BOX_ID })],
      processedBoxIds: new Set([UNKNOWN_BOX_ID]),
    });

    expect(reconstruction.issues).toContainEqual(expect.objectContaining({
      code: 'unknown_peg_in_event',
      ergoBoxIdHex: UNKNOWN_BOX_ID,
    }));
    expect(reconstruction.decision.classification).toBe('blocked_inconsistent_mint_history');
  });

  it.each([
    ['another contract', { events: [event({ address: OTHER_ADDRESS })], processedBoxIds: new Set([DEPOSIT_ID]) }],
    ['a reverted receipt', { events: [event({ receiptStatus: 0 })], processedBoxIds: new Set([DEPOSIT_ID]) }],
    ['a noncanonical event block', {
      events: [event()],
      processedBoxIds: new Set([DEPOSIT_ID]),
      noncanonicalEventBlock: true,
    }],
    ['a receipt log mismatch', {
      events: [event({ receiptLogData: `0x${'00'.repeat(64)}` })],
      processedBoxIds: new Set([DEPOSIT_ID]),
    }],
    ['a removed log', {
      events: [event({ removed: true })],
      processedBoxIds: new Set([DEPOSIT_ID]),
    }],
    ['the wrong event topic', {
      events: [event({
        rawTopics: [`0x${'ff'.repeat(32)}`, `0x${'00'.repeat(12)}${TARGET_H160}`],
      })],
      processedBoxIds: new Set([DEPOSIT_ID]),
    }],
    ['a malformed indexed recipient', {
      events: [event({
        rawTopics: [
          ethers.id('PegIn(address,uint256,bytes32)').toLowerCase(),
          `0x${'ff'.repeat(12)}${TARGET_H160}`,
        ],
      })],
      processedBoxIds: new Set([DEPOSIT_ID]),
    }],
    ['the wrong EVM chain', {
      events: [],
      processedBoxIds: new Set(),
      chainId: 1338n,
    }],
  ] satisfies Array<[string, FrontierState]>)(
    'rejects %s before constructing a cross-chain view',
    async (_case, state) => {
      await expect(reconstruct(await route(), state)).rejects.toThrow();
    },
  );

  it('rejects duplicate canonical mint events for one Ergo deposit', async () => {
    await expect(reconstruct(await route(), {
      events: [event(), event({
        transactionHashHex: SECOND_EVENT_TX_HASH,
        logIndex: 1,
      })],
      processedBoxIds: new Set([DEPOSIT_ID]),
    })).rejects.toThrow('duplicate canonical PegIn events');
  });

  it('rejects exact-view disagreement between distinct Frontier sources', async () => {
    const ergoRoute = await route();
    const primarySource = new FakeFrontierSource('http://127.0.0.1:9944', {
      events: [event()],
      processedBoxIds: new Set([DEPOSIT_ID]),
    });
    const witnessSource = new FakeFrontierSource('http://127.0.0.1:19944', {
      events: [event({ amount: AMOUNT + 1n })],
      processedBoxIds: new Set([DEPOSIT_ID]),
    });

    await expect(reconstructPegInSidechainHistory({
      profile: profile(),
      ergoRoute,
      primarySource,
      witnessSource,
      ergoRouteReobservationInput: routeReobservationInputLike(ergoRoute),
      observedAt: SIDECHAIN_OBSERVED_AT,
    })).rejects.toThrow('sources disagree');
  });

  it('rejects a same-observation tip change', async () => {
    await expect(reconstruct(await route(), {
      events: [],
      processedBoxIds: new Set(),
      drift: true,
    })).rejects.toThrow('canonical tip changed');
  });

  it('rejects an A-to-B-to-A event-block view before recording the original tip', async () => {
    await expect(reconstruct(await route(), {
      events: [event()],
      processedBoxIds: new Set([DEPOSIT_ID]),
      abaEventBlock: true,
    })).rejects.toThrow('block is not canonical at its height');
  });

  it('rejects Frontier tip drift during the final Ergo route re-observation', async () => {
    await expect(reconstruct(await route(), {
      events: [],
      processedBoxIds: new Set(),
      driftAfterBlockNumberCall: 3,
    })).rejects.toThrow('changed during final Ergo route re-observation');
  });

  it('rejects a changed or precomputed Ergo route after Frontier reconstruction', async () => {
    const committedRoute = await route();
    await expect(reconstruct(
      committedRoute,
      { events: [], processedBoxIds: new Set() },
      routeObservationInput('refundable'),
    )).rejects.toThrow('Ergo peg-in route changed during Frontier reconstruction');
    const precomputedRoute = await route();
    await expect(reconstruct(
      committedRoute,
      { events: [], processedBoxIds: new Set() },
      precomputedRoute as unknown as AssessPegInRouteObservationInput,
    )).rejects.toThrow();
  });

  it('rejects cloned route and sidechain reconstruction objects without provenance', async () => {
    const ergoRoute = await route();
    const [primarySource, witnessSource] = frontierPair({
      events: [],
      processedBoxIds: new Set(),
    });
    await expect(reconstructPegInSidechainHistory({
      profile: profile(),
      ergoRoute: structuredClone(ergoRoute),
      primarySource,
      witnessSource,
      ergoRouteReobservationInput: routeReobservationInputLike(ergoRoute),
      observedAt: SIDECHAIN_OBSERVED_AT,
    })).rejects.toThrow('route reconstruction provenance is missing');

    const { reconstruction } = await reconstruct(ergoRoute, {
      events: [],
      processedBoxIds: new Set(),
    });
    expect(() => assertPegInSidechainReconstructionProvenance(
      structuredClone(reconstruction),
    )).toThrow('sidechain reconstruction provenance is missing');
  });

  it('rejects an unbounded event profile before making source observations', async () => {
    const ergoRoute = await route();
    const [primarySource, witnessSource] = frontierPair({
      events: [],
      processedBoxIds: new Set(),
    });
    await expect(reconstructPegInSidechainHistory({
      profile: profile({ maxEvents: MAX_PEG_IN_SIDECHAIN_EVENTS + 1 }),
      ergoRoute,
      primarySource,
      witnessSource,
      ergoRouteReobservationInput: routeReobservationInputLike(ergoRoute),
      observedAt: SIDECHAIN_OBSERVED_AT,
    })).rejects.toThrow(`maxEvents must not exceed ${MAX_PEG_IN_SIDECHAIN_EVENTS}`);
    expect(primarySource.processedQueries).toHaveLength(0);
  });
});

describe('joined peg-in cache recovery', () => {
  it('persists one complete non-authorizing view idempotently across restart', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      let firstDigest: string;
      try {
        const first = await recoverPegInJoinedCache(joinedRecoveryInput(tracker));
        assertPegInJoinedCacheRecoveryReportProvenance(first);
        firstDigest = first.reconstructionDigestHex;
        expect(first.replacement).toMatchObject({
          changed: true,
          previousEntries: 0,
          currentEntries: 1,
          pegInLifecycleRowsCreatedOrChanged: 0,
          settlementAuthorityRowsCreatedOrChanged: 0,
        });
        expect(tracker.getPegInJoinedReconstructionSnapshot()).toMatchObject({
          route: {
            activeHistory: [{ classification: 'committed' }],
            vaultHistoryBoxIdsHex: [VAULT_BOX_ID],
          },
          sidechain: {
            reconstructionDigestHex: firstDigest,
            entries: [{ state: 'mint_confirmed_by_depth' }],
            issues: [],
          },
        });
        expect(tracker.getPegInByBoxId(DEPOSIT_ID)).toBeUndefined();

        const second = await recoverPegInJoinedCache(joinedRecoveryInput(tracker));
        expect(second.replacement.changed).toBe(false);
        expect(second.reconstructionDigestHex).toBe(firstDigest);
      } finally {
        tracker.close();
      }

      const restarted = new StateTracker(dbPath);
      try {
        const snapshot = restarted.getPegInJoinedReconstructionSnapshot();
        expect(snapshot?.sidechain.reconstructionDigestHex).toBe(firstDigest!);
        expect(() => assertPegInSidechainReconstructionProvenance(snapshot!.sidechain))
          .toThrow('sidechain reconstruction provenance is missing');
        expect(restarted.getPendingPegIns()).toEqual([]);
      } finally {
        restarted.close();
      }
    });
  });

  it('preserves an existing minted lifecycle byte-for-byte', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        tracker.insertPegIn(
          DEPOSIT_ID,
          `0x${TARGET_H160}`,
          AMOUNT,
          80,
          'active_committed_vault',
          DEPOSITOR_TREE,
        );
        tracker.recordPegInConsumeSubmitted(DEPOSIT_ID, COMMIT_TX_ID);
        tracker.recordPegInConsumeConfirmed(
          DEPOSIT_ID,
          VAULT_BOX_ID,
          commitmentConfirmation(90),
        );
        tracker.beginPegInMint(DEPOSIT_ID);
        tracker.recordPegInMinted(DEPOSIT_ID, `0x${EVENT_TX_HASH}`);
        const before = tracker.getPegInByBoxId(DEPOSIT_ID);

        const report = await recoverPegInJoinedCache(joinedRecoveryInput(tracker));
        expect(report.replacement.pegInLifecycleRowsCreatedOrChanged).toBe(0);
        expect(tracker.getPegInByBoxId(DEPOSIT_ID)).toEqual(before);
      } finally {
        tracker.close();
      }
    });

  });

  it('detects and rolls back an authority mutation caused during cache replacement', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        const rawDb = (tracker as unknown as { db: any }).db;
        rawDb.exec(`
          CREATE TRIGGER mutate_peg_in_authority
          AFTER INSERT ON peg_in_sidechain_reconstruction_state
          BEGIN
            INSERT INTO peg_in_events (
              ergo_lock_box_id, target_evm_address, amount_nanoerg,
              ergo_lock_height, source_classification
            ) VALUES (
              '${'8a'.repeat(32)}', '0x${'8b'.repeat(20)}', '1', 1, 'unknown'
            );
          END
        `);
        await expect(recoverPegInJoinedCache(joinedRecoveryInput(tracker)))
          .rejects.toThrow('changed lifecycle authority');
        expect(tracker.getPendingPegIns()).toEqual([]);
        expect(tracker.getPegInJoinedReconstructionSnapshot()).toBeNull();
        expect(tracker.getPegInRouteReconstructionSnapshot()).toBeNull();
      } finally {
        tracker.close();
      }
    });

  });

  it('invalidates the joined view when the Ergo route changes independently', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        await recoverPegInJoinedCache(joinedRecoveryInput(tracker));
        const changedRoute = await route('refundable');
        const replacement = tracker.replacePegInRouteReconstruction(changedRoute);
        expect(replacement.changed).toBe(true);
        expect(tracker.getPegInJoinedReconstructionSnapshot()).toBeNull();
        expect(tracker.getPegInRouteReconstructionSnapshot()).toMatchObject({
          activeHistory: [{ classification: 'refundable' }],
        });
      } finally {
        tracker.close();
      }
    });
  });

  it('rolls back independent route invalidation when settlement authority changes', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        const original = await recoverPegInJoinedCache(joinedRecoveryInput(tracker));
        const rawDb = (tracker as unknown as { db: any }).db;
        rawDb.exec(`
          CREATE TRIGGER mutate_settlement_authority
          AFTER DELETE ON peg_in_sidechain_reconstruction_state
          BEGIN
            INSERT INTO aggregate_settlement_attempts (
              mode, expected_tx_id, burn_tx_hashes_json
            ) VALUES (
              'single', '${'8c'.repeat(32)}', '["${'8d'.repeat(32)}"]'
            );
          END
        `);
        const changedRoute = await route('refundable');

        expect(() => tracker.replacePegInRouteReconstruction(changedRoute))
          .toThrow('changed lifecycle authority');
        expect(rawDb.prepare('SELECT COUNT(*) AS count FROM aggregate_settlement_attempts')
          .get()).toEqual({ count: 0 });
        expect(tracker.getPegInJoinedReconstructionSnapshot()).toMatchObject({
          route: { activeHistory: [{ classification: 'committed' }] },
          sidechain: { reconstructionDigestHex: original.reconstructionDigestHex },
        });
      } finally {
        tracker.close();
      }
    });
  });

  it('restores only joined inventory after complete database loss', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const beforeLoss = new StateTracker(dbPath);
      beforeLoss.insertPegIn(
        DEPOSIT_ID,
        `0x${TARGET_H160}`,
        AMOUNT,
        80,
        'active_committed_vault',
        DEPOSITOR_TREE,
      );
      beforeLoss.recordPegInConsumeSubmitted(DEPOSIT_ID, COMMIT_TX_ID);
      beforeLoss.recordPegInConsumeConfirmed(
        DEPOSIT_ID,
        VAULT_BOX_ID,
        commitmentConfirmation(90),
      );
      beforeLoss.beginPegInMint(DEPOSIT_ID);
      beforeLoss.recordPegInMinted(DEPOSIT_ID, `0x${EVENT_TX_HASH}`);
      beforeLoss.close();
      for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
        if (existsSync(path)) rmSync(path, { force: true });
      }

      const recovered = new StateTracker(dbPath);
      try {
        const report = await recoverPegInJoinedCache(joinedRecoveryInput(recovered));
        expect(report.replacement.pegInLifecycleRowsCreatedOrChanged).toBe(0);
        expect(recovered.getPegInByBoxId(DEPOSIT_ID)).toBeUndefined();
        expect(recovered.getPegInsByStatus('minted')).toEqual([]);
        expect(recovered.getPegInJoinedReconstructionSnapshot()?.sidechain.entries)
          .toMatchObject([{ state: 'mint_confirmed_by_depth' }]);
        expect(recovered.getPegInCircuitBreakerState()).toMatchObject({
          open: true,
          incidentCount: 0,
          continuityStatus: 'recovery_required',
          continuityRecoveryRequired: true,
        });
      } finally {
        recovered.close();
      }
    });
  });

  it('rolls back both caches when a later joined write fails', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        const original = await recoverPegInJoinedCache(joinedRecoveryInput(tracker));
        const changedRoute = await route('refundable');
        const { reconstruction: changedSidechain } = await reconstruct(changedRoute, {
          events: [],
          processedBoxIds: new Set(),
        });
        const rawDb = (tracker as unknown as { db: any }).db;
        rawDb.exec(`
          CREATE TRIGGER fail_joined_cache_entry
          BEFORE INSERT ON peg_in_sidechain_reconstruction_entries
          BEGIN
            SELECT RAISE(ABORT, 'forced joined cache failure');
          END
        `);

        expect(() => tracker.replacePegInJoinedReconstruction({
          routeReconstruction: changedRoute,
          sidechainReconstruction: changedSidechain,
        })).toThrow('forced joined cache failure');
        expect(tracker.getPegInJoinedReconstructionSnapshot()).toMatchObject({
          route: { activeHistory: [{ classification: 'committed' }] },
          sidechain: {
            reconstructionDigestHex: original.reconstructionDigestHex,
            entries: [{ state: 'mint_confirmed_by_depth' }],
          },
        });
      } finally {
        tracker.close();
      }
    });
  });

  it('reads one SQLite generation while another connection replaces the cache', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const reader = new StateTracker(dbPath);
      const writer = new StateTracker(dbPath);
      try {
        const original = await recoverPegInJoinedCache(joinedRecoveryInput(reader));
        const changedRoute = await route();
        const { reconstruction: changedSidechain } = await reconstruct(changedRoute, {
          events: [],
          processedBoxIds: new Set(),
        });
        const rawDb = (reader as unknown as { db: any }).db;
        const originalPrepare = rawDb.prepare.bind(rawDb);
        let replacementTriggered = false;
        rawDb.prepare = (sql: string) => {
          const statement = originalPrepare(sql);
          if (
            !replacementTriggered
            && sql.includes('FROM peg_in_sidechain_reconstruction_state')
          ) {
            return new Proxy(statement, {
              get(target, property, receiver) {
                if (property !== 'get') return Reflect.get(target, property, receiver);
                return (...args: unknown[]) => {
                  const row = target.get(...args);
                  replacementTriggered = true;
                  writer.replacePegInJoinedReconstruction({
                    routeReconstruction: changedRoute,
                    sidechainReconstruction: changedSidechain,
                  });
                  return row;
                };
              },
            });
          }
          return statement;
        };
        let concurrentRead;
        try {
          concurrentRead = reader.getPegInJoinedReconstructionSnapshot();
        } finally {
          rawDb.prepare = originalPrepare;
        }

        expect(replacementTriggered).toBe(true);
        expect(concurrentRead?.sidechain).toMatchObject({
          reconstructionDigestHex: original.reconstructionDigestHex,
          entries: [{ state: 'mint_confirmed_by_depth' }],
        });
        expect(writer.getPegInJoinedReconstructionSnapshot()?.sidechain)
          .toMatchObject({ entries: [{ state: 'committed_unminted' }] });
      } finally {
        writer.close();
        reader.close();
      }
    });
  });

  it('rejects tampered cache semantics and cloned write provenance', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        const ergoRoute = await route();
        const { reconstruction } = await reconstruct(ergoRoute, {
          events: [event()],
          processedBoxIds: new Set([DEPOSIT_ID]),
        });
        expect(validatePegInSidechainReconstructionStructure(
          structuredClone(reconstruction),
        ).reconstructionDigestHex).toBe(reconstruction.reconstructionDigestHex);
        const refundableRoute = await route('refundable');
        const { reconstruction: invalidMint } = await reconstruct(refundableRoute, {
          events: [event()],
          processedBoxIds: new Set([DEPOSIT_ID]),
        });
        const rewritten = structuredClone(invalidMint) as any;
        rewritten.issues = [];
        rewritten.decision = {
          classification: 'reconstruction_consistent',
          exactCrossChainHistoryAgreement: true,
        };
        const {
          observedAt: _observedAt,
          reconstructionDigestHex: _oldDigest,
          ...rewrittenSemantic
        } = rewritten;
        rewritten.reconstructionDigestHex = pegInSidechainReconstructionDigestHex(
          rewrittenSemantic,
        );
        expect(() => validatePegInSidechainReconstructionStructure(rewritten))
          .toThrow('must retain issue mint_without_committed_vault');
        expect(() => tracker.replacePegInJoinedReconstruction({
          routeReconstruction: structuredClone(ergoRoute),
          sidechainReconstruction: reconstruction,
        })).toThrow('route reconstruction provenance is missing');
        expect(() => tracker.replacePegInJoinedReconstruction({
          routeReconstruction: ergoRoute,
          sidechainReconstruction: structuredClone(reconstruction),
        })).toThrow('sidechain reconstruction provenance is missing');
        expect(() => tracker.replacePegInJoinedReconstruction({
          routeReconstruction: refundableRoute,
          sidechainReconstruction: reconstruction,
        })).toThrow('binds another Ergo route');

        tracker.replacePegInJoinedReconstruction({
          routeReconstruction: ergoRoute,
          sidechainReconstruction: reconstruction,
        });
        const rawDb = (tracker as unknown as { db: any }).db;
        rawDb.prepare(`
          UPDATE peg_in_sidechain_reconstruction_state
          SET frontier_view_digest = ?
          WHERE id = 1
        `).run('ff'.repeat(32));
        expect(() => tracker.getPegInJoinedReconstructionSnapshot())
          .toThrow(/digest does not match its semantics/);
      } finally {
        tracker.close();
      }
    });
  });

  it('supports read-only restart inspection but rejects replacement', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const writer = new StateTracker(dbPath);
      const ergoRoute = await route();
      const { reconstruction } = await reconstruct(ergoRoute, {
        events: [event()],
        processedBoxIds: new Set([DEPOSIT_ID]),
      });
      writer.replacePegInJoinedReconstruction({
        routeReconstruction: ergoRoute,
        sidechainReconstruction: reconstruction,
      });
      writer.close();

      const reader = new StateTracker(dbPath, { readOnly: true });
      try {
        expect(reader.getPegInJoinedReconstructionSnapshot()?.sidechain)
          .toMatchObject({ entries: [{ state: 'mint_confirmed_by_depth' }] });
        expect(() => reader.replacePegInJoinedReconstruction({
          routeReconstruction: ergoRoute,
          sidechainReconstruction: reconstruction,
        })).toThrow(/read-only/i);
      } finally {
        reader.close();
      }
    });
  });
});

function insertCommittedPegInLifecycle(tracker: StateTracker): void {
  tracker.insertPegIn(
    DEPOSIT_ID,
    `0x${TARGET_H160}`,
    AMOUNT,
    80,
    'active_committed_vault',
    DEPOSITOR_TREE,
  );
  tracker.recordPegInConsumeSubmitted(DEPOSIT_ID, COMMIT_TX_ID);
  tracker.recordPegInConsumeConfirmed(
    DEPOSIT_ID,
    VAULT_BOX_ID,
    commitmentConfirmation(90),
  );
}

describe('joined peg-in reconciliation journal', () => {
  it('places an existing committed lifecycle under an idempotent restart-safe defer hold', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      let lifecycleDigestHex: string;
      let joinedReconstructionDigestHex: string;
      try {
        insertCommittedPegInLifecycle(tracker);
        const recovered = await recoverPegInJoinedCache(joinedRecoveryInput(
          tracker,
          'committed',
          { events: [], processedBoxIds: new Set() },
        ));
        lifecycleDigestHex = tracker.getPegInLifecycleDigest(DEPOSIT_ID)!;
        joinedReconstructionDigestHex = recovered.reconstructionDigestHex;
        expect(tracker.getPendingPegIns()).toHaveLength(1);

        const first = tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: lifecycleDigestHex,
          expectedJoinedReconstructionDigestHex: joinedReconstructionDigestHex,
        });
        expect(first).toMatchObject({
          appended: true,
          lifecycleRowsCreatedOrChanged: 0,
          settlementAuthorityRowsCreatedOrChanged: 0,
          observation: {
            lifecycleStatus: 'consume_confirmed',
            joinedEntryState: 'committed_unminted',
            disposition: 'deferred',
            reason: 'native_grandpa_finality_unavailable',
          },
        });
        expect(tracker.getPendingPegIns()).toEqual([]);
        expect(tracker.getPegInByBoxId(DEPOSIT_ID)?.status).toBe('consume_confirmed');
        expect(() => tracker.beginPegInMint(DEPOSIT_ID))
          .toThrow('reconciliation hold blocks lifecycle authority changes');
        const rawDb = (tracker as unknown as { db: any }).db;
        for (const [column, replacement] of [
          ['commit_inclusion_header_id', REORG_HEADER_ID],
          ['commit_verification_receipt_json', '{}'],
          ['commit_verification_receipt_digest', '00'.repeat(32)],
        ]) {
          expect(() => rawDb.prepare(`
            UPDATE peg_in_events
            SET ${column} = ?
            WHERE ergo_lock_box_id = ?
          `).run(replacement, DEPOSIT_ID))
            .toThrow('reconciliation hold blocks lifecycle authority changes');
        }

        const replay = tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: lifecycleDigestHex,
          expectedJoinedReconstructionDigestHex: joinedReconstructionDigestHex,
        });
        expect(replay.appended).toBe(false);
        expect(replay.observation.id).toBe(first.observation.id);
        expect(tracker.getPegInReconciliationJournal(DEPOSIT_ID)).toHaveLength(1);
      } finally {
        tracker.close();
      }

      const restarted = new StateTracker(dbPath);
      try {
        expect(restarted.getPegInReconciliationHold(DEPOSIT_ID)).toMatchObject({
          lifecycleDigestHex: lifecycleDigestHex!,
          joinedReconstructionDigestHex: joinedReconstructionDigestHex!,
          disposition: 'deferred',
        });
        expect(restarted.getPendingPegIns()).toEqual([]);
        expect(restarted.getPegInByBoxId(DEPOSIT_ID)?.status).toBe('consume_confirmed');
      } finally {
        restarted.close();
      }
    });
  });

  it('defers a byte-bound observed mint without treating depth as GRANDPA finality', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        insertCommittedPegInLifecycle(tracker);
        tracker.beginPegInMint(DEPOSIT_ID);
        tracker.recordPegInMinted(DEPOSIT_ID, `0x${EVENT_TX_HASH}`);
        const recovered = await recoverPegInJoinedCache(joinedRecoveryInput(tracker));
        const result = tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: tracker.getPegInLifecycleDigest(DEPOSIT_ID)!,
          expectedJoinedReconstructionDigestHex: recovered.reconstructionDigestHex,
        });
        expect(result.observation).toMatchObject({
          lifecycleStatus: 'minted',
          joinedEntryState: 'mint_confirmed_by_depth',
          joinedEventTransactionHashHex: EVENT_TX_HASH,
          disposition: 'deferred',
          reason: 'native_grandpa_finality_unavailable',
        });
        expect(tracker.getPegInByBoxId(DEPOSIT_ID)?.sidechainMintTxHash)
          .toBe(`0x${EVENT_TX_HASH}`);
      } finally {
        tracker.close();
      }
    });
  });

  it('quarantines a local mint that is absent from the joined Frontier history', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        insertCommittedPegInLifecycle(tracker);
        tracker.beginPegInMint(DEPOSIT_ID);
        tracker.recordPegInMinted(DEPOSIT_ID, `0x${EVENT_TX_HASH}`);
        const recovered = await recoverPegInJoinedCache(joinedRecoveryInput(
          tracker,
          'committed',
          { events: [], processedBoxIds: new Set() },
        ));
        const result = tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: tracker.getPegInLifecycleDigest(DEPOSIT_ID)!,
          expectedJoinedReconstructionDigestHex: recovered.reconstructionDigestHex,
        });
        expect(result.observation).toMatchObject({
          disposition: 'quarantined',
          reason: 'local_mint_not_observed',
        });
        expect(tracker.getPegInByBoxId(DEPOSIT_ID)?.status).toBe('minted');
      } finally {
        tracker.close();
      }
    });
  });

  it('distinguishes an invalid target entry from unrelated joined-view inconsistency', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        insertCommittedPegInLifecycle(tracker);
        const invalidTarget = await recoverPegInJoinedCache(joinedRecoveryInput(
          tracker,
          'committed',
          { events: [], processedBoxIds: new Set([DEPOSIT_ID]) },
        ));
        const invalid = tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: tracker.getPegInLifecycleDigest(DEPOSIT_ID)!,
          expectedJoinedReconstructionDigestHex: invalidTarget.reconstructionDigestHex,
        });
        expect(invalid.observation).toMatchObject({
          joinedEntryState: 'invalid_processed_state_without_event',
          disposition: 'quarantined',
          reason: 'joined_entry_invalid',
        });
      } finally {
        tracker.close();
      }
    });

    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        insertCommittedPegInLifecycle(tracker);
        const inconsistent = await recoverPegInJoinedCache(joinedRecoveryInput(
          tracker,
          'committed',
          {
            events: [
              event(),
              event({
                boxIdHex: UNKNOWN_BOX_ID,
                transactionHashHex: SECOND_EVENT_TX_HASH,
                logIndex: 1,
              }),
            ],
            processedBoxIds: new Set([DEPOSIT_ID, UNKNOWN_BOX_ID]),
          },
        ));
        const result = tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: tracker.getPegInLifecycleDigest(DEPOSIT_ID)!,
          expectedJoinedReconstructionDigestHex: inconsistent.reconstructionDigestHex,
        });
        expect(result.observation).toMatchObject({
          joinedEntryState: 'mint_confirmed_by_depth',
          disposition: 'quarantined',
          reason: 'joined_reconstruction_inconsistent',
        });
      } finally {
        tracker.close();
      }
    });
  });

  it('quarantines an existing lifecycle row missing from the joined cache', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        tracker.insertPegIn(
          UNKNOWN_BOX_ID,
          `0x${TARGET_H160}`,
          AMOUNT,
          81,
          'active_committed_vault',
          DEPOSITOR_TREE,
        );
        const recovered = await recoverPegInJoinedCache(joinedRecoveryInput(tracker));
        const result = tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: UNKNOWN_BOX_ID,
          expectedLifecycleDigestHex: tracker.getPegInLifecycleDigest(UNKNOWN_BOX_ID)!,
          expectedJoinedReconstructionDigestHex: recovered.reconstructionDigestHex,
        });
        expect(result.observation).toMatchObject({
          joinedEntryState: null,
          disposition: 'quarantined',
          reason: 'joined_entry_missing',
        });
      } finally {
        tracker.close();
      }
    });
  });

  it('quarantines route-kind, lifecycle-stage, and committed-vault mismatches', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        tracker.insertPegIn(
          DEPOSIT_ID,
          `0x${TARGET_H160}`,
          AMOUNT,
          80,
          'legacy_unminted_refundable',
          DEPOSITOR_TREE,
        );
        const recovered = await recoverPegInJoinedCache(joinedRecoveryInput(tracker));
        const result = tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: tracker.getPegInLifecycleDigest(DEPOSIT_ID)!,
          expectedJoinedReconstructionDigestHex: recovered.reconstructionDigestHex,
        });
        expect(result.observation).toMatchObject({
          disposition: 'quarantined',
          reason: 'source_classification_mismatch',
        });
      } finally {
        tracker.close();
      }
    });

    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        tracker.insertPegIn(
          DEPOSIT_ID,
          `0x${TARGET_H160}`,
          AMOUNT,
          80,
          'active_committed_vault',
          DEPOSITOR_TREE,
        );
        const recovered = await recoverPegInJoinedCache(joinedRecoveryInput(tracker));
        const result = tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: tracker.getPegInLifecycleDigest(DEPOSIT_ID)!,
          expectedJoinedReconstructionDigestHex: recovered.reconstructionDigestHex,
        });
        expect(result.observation).toMatchObject({
          lifecycleStatus: 'detected',
          disposition: 'quarantined',
          reason: 'source_classification_mismatch',
        });
      } finally {
        tracker.close();
      }
    });

    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        insertCommittedPegInLifecycle(tracker);
        const recovered = await recoverPegInJoinedCache(joinedRecoveryInput(
          tracker,
          'refundable',
          { events: [], processedBoxIds: new Set() },
        ));
        const result = tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: tracker.getPegInLifecycleDigest(DEPOSIT_ID)!,
          expectedJoinedReconstructionDigestHex: recovered.reconstructionDigestHex,
        });
        expect(result.observation).toMatchObject({
          joinedEntryState: 'refundable_unminted',
          disposition: 'quarantined',
          reason: 'committed_vault_not_observed',
        });
      } finally {
        tracker.close();
      }
    });

    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        tracker.insertPegIn(
          LEGACY_BOX_ID,
          `0x${TARGET_H160}`,
          AMOUNT,
          70,
          'legacy_already_consumed',
          DEPOSITOR_TREE,
        );
        const recovered = await recoverPegInJoinedCache(joinedRecoveryInput(
          tracker,
          'committed',
          { events: [], processedBoxIds: new Set() },
          true,
        ));
        const result = tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: LEGACY_BOX_ID,
          expectedLifecycleDigestHex: tracker.getPegInLifecycleDigest(LEGACY_BOX_ID)!,
          expectedJoinedReconstructionDigestHex: recovered.reconstructionDigestHex,
        });
        expect(result.observation).toMatchObject({
          joinedEntryState: 'legacy_unminted',
          disposition: 'quarantined',
          reason: 'source_classification_mismatch',
        });
      } finally {
        tracker.close();
      }
    });
  });

  it('quarantines event and local mint identity mismatches independently', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        tracker.insertPegIn(
          DEPOSIT_ID,
          OTHER_ADDRESS,
          AMOUNT,
          80,
          'active_committed_vault',
          DEPOSITOR_TREE,
        );
        tracker.recordPegInConsumeSubmitted(DEPOSIT_ID, COMMIT_TX_ID);
        tracker.recordPegInConsumeConfirmed(
          DEPOSIT_ID,
          VAULT_BOX_ID,
          commitmentConfirmation(90),
        );
        const recovered = await recoverPegInJoinedCache(joinedRecoveryInput(tracker));
        const result = tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: tracker.getPegInLifecycleDigest(DEPOSIT_ID)!,
          expectedJoinedReconstructionDigestHex: recovered.reconstructionDigestHex,
        });
        expect(result.observation).toMatchObject({
          disposition: 'quarantined',
          reason: 'event_binding_mismatch',
        });
      } finally {
        tracker.close();
      }
    });

    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        insertCommittedPegInLifecycle(tracker);
        const rawDb = (tracker as unknown as { db: any }).db;
        rawDb.prepare(`
          UPDATE peg_in_events SET status = 'minted' WHERE ergo_lock_box_id = ?
        `).run(DEPOSIT_ID);
        const recovered = await recoverPegInJoinedCache(joinedRecoveryInput(tracker));
        const result = tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: tracker.getPegInLifecycleDigest(DEPOSIT_ID)!,
          expectedJoinedReconstructionDigestHex: recovered.reconstructionDigestHex,
        });
        expect(result.observation).toMatchObject({
          disposition: 'quarantined',
          reason: 'local_mint_identity_missing',
        });
      } finally {
        tracker.close();
      }
    });

    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        insertCommittedPegInLifecycle(tracker);
        tracker.beginPegInMint(DEPOSIT_ID);
        tracker.recordPegInMinted(DEPOSIT_ID, `0x${'8e'.repeat(32)}`);
        const recovered = await recoverPegInJoinedCache(joinedRecoveryInput(tracker));
        const result = tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: tracker.getPegInLifecycleDigest(DEPOSIT_ID)!,
          expectedJoinedReconstructionDigestHex: recovered.reconstructionDigestHex,
        });
        expect(result.observation).toMatchObject({
          disposition: 'quarantined',
          reason: 'local_mint_identity_mismatch',
        });
      } finally {
        tracker.close();
      }
    });
  });

  it('allows terminal incident handling under hold but never lifecycle promotion', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        insertCommittedPegInLifecycle(tracker);
        const recovered = await recoverPegInJoinedCache(joinedRecoveryInput(
          tracker,
          'committed',
          { events: [], processedBoxIds: new Set() },
        ));
        tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: tracker.getPegInLifecycleDigest(DEPOSIT_ID)!,
          expectedJoinedReconstructionDigestHex: recovered.reconstructionDigestHex,
        });

        expect(() => tracker.recordPegInMinted(DEPOSIT_ID, `0x${EVENT_TX_HASH}`))
          .toThrow('reconciliation hold blocks lifecycle authority changes');
        tracker.markPegInIncident(DEPOSIT_ID, 'manual review required under reconciliation hold');
        expect(tracker.getPegInByBoxId(DEPOSIT_ID)?.status).toBe('incident');

        const terminal = tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: tracker.getPegInLifecycleDigest(DEPOSIT_ID)!,
          expectedJoinedReconstructionDigestHex: recovered.reconstructionDigestHex,
        });
        expect(terminal.observation).toMatchObject({
          lifecycleStatus: 'incident',
          disposition: 'quarantined',
          reason: 'local_lifecycle_terminal',
        });
        expect(tracker.getPegInReconciliationJournal(DEPOSIT_ID)).toHaveLength(2);
        expect(tracker.getPendingPegIns()).toEqual([]);
      } finally {
        tracker.close();
      }
    });
  });

  it('rejects missing lifecycle rows and stale lifecycle or joined-cache generations', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        const noLifecycle = await recoverPegInJoinedCache(joinedRecoveryInput(tracker));
        expect(() => tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: '11'.repeat(32),
          expectedJoinedReconstructionDigestHex: noLifecycle.reconstructionDigestHex,
        })).toThrow('requires an existing lifecycle row');
        expect(tracker.getPegInReconciliationJournal(DEPOSIT_ID)).toEqual([]);

        insertCommittedPegInLifecycle(tracker);
        const lifecycleDigestHex = tracker.getPegInLifecycleDigest(DEPOSIT_ID)!;
        tracker.beginPegInMint(DEPOSIT_ID);
        expect(() => tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: lifecycleDigestHex,
          expectedJoinedReconstructionDigestHex: noLifecycle.reconstructionDigestHex,
        })).toThrow('lifecycle changed before joined reconciliation');
        expect(tracker.getPegInReconciliationJournal(DEPOSIT_ID)).toEqual([]);

        const currentLifecycleDigestHex = tracker.getPegInLifecycleDigest(DEPOSIT_ID)!;
        const changedCache = await recoverPegInJoinedCache(joinedRecoveryInput(
          tracker,
          'committed',
          { events: [], processedBoxIds: new Set() },
        ));
        expect(changedCache.reconstructionDigestHex).not.toBe(noLifecycle.reconstructionDigestHex);
        expect(() => tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: currentLifecycleDigestHex,
          expectedJoinedReconstructionDigestHex: noLifecycle.reconstructionDigestHex,
        })).toThrow('reconstruction changed before reconciliation');
        expect(tracker.getPegInReconciliationJournal(DEPOSIT_ID)).toEqual([]);
      } finally {
        tracker.close();
      }
    });
  });

  it('keeps an append-only history while advancing from defer to quarantine', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        insertCommittedPegInLifecycle(tracker);
        const firstCache = await recoverPegInJoinedCache(joinedRecoveryInput(
          tracker,
          'committed',
          { events: [], processedBoxIds: new Set() },
        ));
        const lifecycleDigestHex = tracker.getPegInLifecycleDigest(DEPOSIT_ID)!;
        const first = tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: lifecycleDigestHex,
          expectedJoinedReconstructionDigestHex: firstCache.reconstructionDigestHex,
        });

        const secondCache = await recoverPegInJoinedCache(joinedRecoveryInput(tracker));
        const second = tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: lifecycleDigestHex,
          expectedJoinedReconstructionDigestHex: secondCache.reconstructionDigestHex,
        });
        expect(second.observation).toMatchObject({
          disposition: 'quarantined',
          reason: 'unexpected_frontier_mint',
        });
        expect(second.observation.id).toBeGreaterThan(first.observation.id);
        expect(tracker.getPegInReconciliationJournal(DEPOSIT_ID).map(entry => entry.id))
          .toEqual([first.observation.id, second.observation.id]);
        expect(tracker.getPegInReconciliationHold(DEPOSIT_ID)?.id)
          .toBe(second.observation.id);

        const rawDb = (tracker as unknown as { db: any }).db;
        expect(rawDb.pragma('recursive_triggers', { simple: true })).toBe(1);
        expect(() => rawDb.prepare(`
          UPDATE peg_in_reconciliation_journal SET reason = reason WHERE id = ?
        `).run(first.observation.id)).toThrow('append-only');
        expect(() => rawDb.prepare(`
          DELETE FROM peg_in_reconciliation_journal WHERE id = ?
        `).run(first.observation.id)).toThrow('append-only');
        expect(() => rawDb.prepare(`
          DELETE FROM peg_in_reconciliation_state WHERE peg_in_id = ?
        `).run(first.observation.pegInId)).toThrow('cannot be cleared');
        expect(() => rawDb.prepare(`
          INSERT OR REPLACE INTO peg_in_reconciliation_journal
          SELECT * FROM peg_in_reconciliation_journal WHERE id = ?
        `).run(first.observation.id)).toThrow('append-only');
        expect(() => rawDb.prepare(`
          INSERT OR REPLACE INTO peg_in_reconciliation_state (
            peg_in_id, latest_journal_id
          ) VALUES (?, ?)
        `).run(first.observation.pegInId, first.observation.id))
          .toThrow('cannot be cleared');
        expect(() => rawDb.prepare(`
          UPDATE peg_in_events SET ergo_lock_box_id = ? WHERE id = ?
        `).run('ab'.repeat(32), first.observation.pegInId))
          .toThrow('blocks lifecycle authority changes');
        expect(tracker.getPegInByBoxId(DEPOSIT_ID)?.id).toBe(first.observation.pegInId);
      } finally {
        tracker.close();
      }
    });
  });

  it('rolls back journal and lifecycle when a trigger attempts to create authority', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        insertCommittedPegInLifecycle(tracker);
        const recovered = await recoverPegInJoinedCache(joinedRecoveryInput(
          tracker,
          'committed',
          { events: [], processedBoxIds: new Set() },
        ));
        const lifecycleDigestHex = tracker.getPegInLifecycleDigest(DEPOSIT_ID)!;
        const rawDb = (tracker as unknown as { db: any }).db;
        rawDb.exec(`
          CREATE TRIGGER mutate_peg_in_during_reconciliation
          AFTER INSERT ON peg_in_reconciliation_journal
          BEGIN
            UPDATE peg_in_events
            SET status = 'minted', sidechain_mint_tx_hash = '${'8e'.repeat(32)}'
            WHERE id = NEW.peg_in_id;
          END
        `);

        expect(() => tracker.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: lifecycleDigestHex,
          expectedJoinedReconstructionDigestHex: recovered.reconstructionDigestHex,
        })).toThrow('changed lifecycle authority');
        expect(tracker.getPegInByBoxId(DEPOSIT_ID)).toMatchObject({
          status: 'consume_confirmed',
          sidechainMintTxHash: null,
        });
        expect(tracker.getPegInReconciliationJournal(DEPOSIT_ID)).toEqual([]);
        expect(tracker.getPegInReconciliationHold(DEPOSIT_ID)).toBeNull();
      } finally {
        tracker.close();
      }
    });
  });

  it('allows read-only journal inspection but no reconciliation mutation', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const writer = new StateTracker(dbPath);
      insertCommittedPegInLifecycle(writer);
      const recovered = await recoverPegInJoinedCache(joinedRecoveryInput(
        writer,
        'committed',
        { events: [], processedBoxIds: new Set() },
      ));
      const lifecycleDigestHex = writer.getPegInLifecycleDigest(DEPOSIT_ID)!;
      writer.recordPegInReconciliationFromJoinedCache({
        ergoLockBoxId: DEPOSIT_ID,
        expectedLifecycleDigestHex: lifecycleDigestHex,
        expectedJoinedReconstructionDigestHex: recovered.reconstructionDigestHex,
      });
      writer.close();

      const reader = new StateTracker(dbPath, { readOnly: true });
      try {
        expect(reader.getPegInReconciliationJournal(DEPOSIT_ID)).toHaveLength(1);
        expect(reader.getPegInReconciliationHold(DEPOSIT_ID)?.disposition).toBe('deferred');
        expect(() => reader.recordPegInReconciliationFromJoinedCache({
          ergoLockBoxId: DEPOSIT_ID,
          expectedLifecycleDigestHex: lifecycleDigestHex,
          expectedJoinedReconstructionDigestHex: recovered.reconstructionDigestHex,
        })).toThrow(/read-only/i);
      } finally {
        reader.close();
      }
    });
  });
});

describe('runtime joined peg-in reconciliation', () => {
  it('revisits held rows after joined-history drift without releasing authority', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        insertCommittedPegInLifecycle(tracker);
        const initial = new PegInRuntimeReconciliationPass(
          tracker,
          () => recoverPegInJoinedCache(joinedRecoveryInput(
            tracker,
            'committed',
            { events: [], processedBoxIds: new Set() },
          )),
        );
        const first = await initial.run();
        expect(first).toMatchObject({
          status: 'holds_recorded',
          candidatesObserved: 1,
          remainingCandidates: false,
          lifecycleSelectionAuthorized: false,
        });
        expect(tracker.getPegInReconciliationHold(DEPOSIT_ID)).toMatchObject({
          disposition: 'deferred',
          reason: 'native_grandpa_finality_unavailable',
        });

        const unchanged = await initial.run();
        expect(unchanged).toMatchObject({
          status: 'holds_current',
          candidatesObserved: 0,
          lifecycleSelectionAuthorized: false,
        });
        expect(tracker.getPegInReconciliationJournal(DEPOSIT_ID)).toHaveLength(1);

        const drifted = new PegInRuntimeReconciliationPass(
          tracker,
          () => recoverPegInJoinedCache(joinedRecoveryInput(tracker)),
        );
        const second = await drifted.run();
        expect(second).toMatchObject({
          status: 'holds_recorded',
          candidatesObserved: 1,
          lifecycleSelectionAuthorized: false,
        });
        expect(tracker.getPegInReconciliationJournal(DEPOSIT_ID)).toHaveLength(2);
        expect(tracker.getPegInReconciliationHold(DEPOSIT_ID)).toMatchObject({
          disposition: 'quarantined',
          reason: 'unexpected_frontier_mint',
        });
        expect(tracker.getPendingPegIns()).toEqual([]);
      } finally {
        tracker.close();
      }
    });
  });

  it('rejects a lifecycle changed after page selection using the selected-row digest', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        tracker.insertPegIn(
          DEPOSIT_ID,
          `0x${TARGET_H160}`,
          AMOUNT,
          80,
          'active_committed_vault',
          DEPOSITOR_TREE,
        );
        const originalSelect = tracker.getPegInRuntimeReconciliationCandidates.bind(tracker);
        tracker.getPegInRuntimeReconciliationCandidates = (digest, maxRows) => {
          const page = originalSelect(digest, maxRows);
          tracker.recordPegInConsumeSubmitted(DEPOSIT_ID, COMMIT_TX_ID);
          return page;
        };
        const pass = new PegInRuntimeReconciliationPass(
          tracker,
          () => recoverPegInJoinedCache(joinedRecoveryInput(
            tracker,
            'committed',
            { events: [], processedBoxIds: new Set() },
          )),
        );

        await expect(pass.run()).rejects.toThrow(
          'peg-in lifecycle changed before joined reconciliation',
        );
        expect(tracker.getPegInByBoxId(DEPOSIT_ID)?.status).toBe('consume_submitted');
        expect(tracker.getPegInReconciliationJournal(DEPOSIT_ID)).toEqual([]);
        expect(tracker.getPegInReconciliationHold(DEPOSIT_ID)).toBeNull();
      } finally {
        tracker.close();
      }
    });
  });
});
