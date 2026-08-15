import { createHash } from 'crypto';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { Network } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { describe, expect, it, vi } from 'vitest';

import {
  CHECK_ONLY_COMMITTEE_PUBKEY_HEXES,
  createCommitteeConfig,
  injectCommitteePlaceholders,
} from './committee-config.js';
import { encodeCollByteRegister, encodeLongRegister } from './ergo-encoding.js';
import {
  PEG_IN_ROUTE_CACHE_RECOVERY_SCHEMA,
  assertPegInRouteCacheRecoveryReportProvenance,
  recoverPegInRouteCache,
} from './peg-in-route-cache-recovery.js';
import {
  reconstructPegInRouteFromDistinctSources,
  type PegInRouteReconstruction,
} from './peg-in-route-reconstruction.js';
import {
  pegInRouteManifestDigestHex,
  sha256Utf8,
  type PegInRouteManifestV1,
} from './peg-in-route-manifest.js';
import type { PegInRouteObservationSource } from './peg-in-route-observation.js';
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
const HISTORICAL_VAULT_BOX_ID = '59'.repeat(32);
const HEADER_ID = '55'.repeat(32);
const REORG_HEADER_ID = '56'.repeat(32);
const COMMIT_BLOCK_ID = '57'.repeat(32);
const LEGACY_BOX_ID_LOW = '5a'.repeat(32);
const LEGACY_BOX_ID_HIGH = '5b'.repeat(32);
const TARGET_H160 = '58'.repeat(20);
const AMOUNT = 10_000_000n;
const GENERATED_AT = '2026-07-16T12:00:00.000Z';
const TRACKER_NFT_ID = '61'.repeat(32);
const DUP_NFT_ID = '62'.repeat(32);

function commitmentVerification(height: number) {
  return {
    headerIdHex: COMMIT_BLOCK_ID,
    height,
    blockVersion: 2,
    transactionsRootHex: '5c'.repeat(32),
    transactionIdHex: COMMIT_TX_ID,
    transactionSigmaDigestHex: '5d'.repeat(32),
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

type RouteMode = 'committed' | 'refundable';

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
    manifestId: 'peg-in-route-recovery-testnet',
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
    spentTransactionId: mode === 'committed' ? COMMIT_TX_ID : null,
  };
}

function vaultBox(): any {
  return {
    boxId: VAULT_BOX_ID,
    transactionId: COMMIT_TX_ID,
    index: 0,
    creationHeight: 90,
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

function historicalVaultBox(): any {
  return {
    ...vaultBox(),
    boxId: HISTORICAL_VAULT_BOX_ID,
    transactionId: '5c'.repeat(32),
    creationHeight: 89,
    spentTransactionId: '5d'.repeat(32),
  };
}

function legacyBox(boxId: string, spentTransactionId: string): any {
  return {
    boxId,
    transactionId: '5e'.repeat(32),
    index: 0,
    creationHeight: 70,
    value: AMOUNT.toString(),
    ergoTree: LEGACY_TREE,
    assets: [],
    additionalRegisters: {},
    spentTransactionId,
  };
}

function commitTransaction(): any {
  const output = structuredClone(vaultBox());
  delete output.spentTransactionId;
  return {
    id: COMMIT_TX_ID,
    inclusionHeight: 90,
    headerId: COMMIT_BLOCK_ID,
    inputs: [{ boxId: DEPOSIT_ID }],
    outputs: [output],
  };
}

class FakeRouteSource implements PegInRouteObservationSource {
  readonly started = vi.fn();
  readonly ended = vi.fn();
  private bestHeaderCalls = 0;

  constructor(
    readonly observationSourceId: string,
    readonly mode: RouteMode,
    readonly drift = false,
    readonly multiBoxHistory = false,
  ) {}

  beginAuthenticatedTrackerReconstruction(): void {
    this.started();
  }

  endAuthenticatedTrackerReconstruction(): void {
    this.ended();
  }

  async getInfo(): Promise<unknown> {
    return { network: 'testnet', fullHeight: 100 };
  }

  async getIndexedHeight(): Promise<unknown> {
    return { indexedHeight: 100, fullHeight: 100 };
  }

  async getBestHeader(): Promise<unknown> {
    this.bestHeaderCalls += 1;
    if (this.drift && this.bestHeaderCalls > 1) {
      return { height: 101, id: REORG_HEADER_ID };
    }
    return { height: 100, id: HEADER_ID };
  }

  async getBlockHeaderIdsAtHeight(height: number): Promise<string[]> {
    if (height === 91) return [HEADER_ID];
    if (height === 90) return [COMMIT_BLOCK_ID];
    return [];
  }

  async getIndexedBoxesByAddress(address: string): Promise<unknown[]> {
    if (address === ACTIVE_ADDRESS) return [deposit(this.mode)];
    if (address === VAULT_ADDRESS) {
      if (this.mode !== 'committed') return [];
      return this.multiBoxHistory ? [historicalVaultBox(), vaultBox()] : [vaultBox()];
    }
    if (address === LEGACY_ADDRESS) {
      return this.multiBoxHistory
        ? [
            legacyBox(LEGACY_BOX_ID_HIGH, '5f'.repeat(32)),
            legacyBox(LEGACY_BOX_ID_LOW, '60'.repeat(32)),
          ]
        : [];
    }
    throw new Error(`unexpected address ${address}`);
  }

  async getUnspentBoxesByAddress(address: string): Promise<unknown[]> {
    if (address === ACTIVE_ADDRESS) {
      return this.mode === 'refundable' ? [deposit(this.mode)] : [];
    }
    if (address === VAULT_ADDRESS) return this.mode === 'committed' ? [vaultBox()] : [];
    if (address === LEGACY_ADDRESS) return [];
    throw new Error(`unexpected address ${address}`);
  }

  async getTransaction(txId: string): Promise<unknown | null> {
    return this.mode === 'committed' && txId === COMMIT_TX_ID
      ? commitTransaction()
      : null;
  }

  async compileP2sAddress(source: string): Promise<string> {
    if (source === resolvedMclSource()) return ACTIVE_ADDRESS;
    if (source === resolvedVaultSource()) return VAULT_ADDRESS;
    throw new Error('unexpected source template');
  }
}

function multiBoxRecoveryInput(tracker: StateTracker) {
  const input = recoveryInput(tracker);
  return {
    ...input,
    primarySource: new FakeRouteSource(
      'http://127.0.0.1:9053',
      'committed',
      false,
      true,
    ),
    witnessSource: new FakeRouteSource(
      'http://127.0.0.1:19053',
      'committed',
      false,
      true,
    ),
  };
}

function recoveryInput(
  tracker: StateTracker,
  primaryMode: RouteMode = 'committed',
  witnessMode: RouteMode = primaryMode,
  drift = false,
) {
  const routeManifest = manifest();
  return {
    stateTracker: tracker,
    manifest: routeManifest,
    expectedManifestSha256Hex: pegInRouteManifestDigestHex(routeManifest),
    mainChainLockTemplateSource: MCL_TEMPLATE,
    settlementVaultTemplateSource: VAULT_TEMPLATE,
    primarySource: new FakeRouteSource('http://127.0.0.1:9053', primaryMode, drift),
    witnessSource: new FakeRouteSource('http://127.0.0.1:19053', witnessMode),
    generatedAt: GENERATED_AT,
  };
}

function withTempDatabase(
  run: (directory: string, dbPath: string) => Promise<void> | void,
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'peg-in-route-recovery-'));
  const dbPath = join(directory, 'state.sqlite');
  return Promise.resolve().then(() => run(directory, dbPath)).finally(() => {
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });
}

describe('peg-in route cache recovery', () => {
  it('atomically persists a complete route view without changing lifecycle authority', async () => {
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
        const before = tracker.getPegInByBoxId(DEPOSIT_ID);

        const report = await recoverPegInRouteCache(recoveryInput(tracker));
        expect(report.schema).toBe(PEG_IN_ROUTE_CACHE_RECOVERY_SCHEMA);
        expect(report.replacement).toMatchObject({
          changed: true,
          currentDeposits: 1,
          currentVaultBoxes: 1,
          pegInLifecycleRowsCreatedOrChanged: 0,
        });
        expect(report.boundary).toMatchObject({
          mintEligibilityRestored: false,
          routeActivationOrCutoverAuthorized: false,
        });
        expect(tracker.getPegInByBoxId(DEPOSIT_ID)).toEqual(before);
        expect(tracker.getPegInRouteReconstructionSnapshot()).toMatchObject({
          state: {
            manifestId: 'peg-in-route-recovery-testnet',
            observationDigestHex: report.observationDigestHex,
            decision: { observationConditionMet: true },
          },
          activeHistory: [{
            boxIdHex: DEPOSIT_ID,
            classification: 'committed',
            transition: {
              inclusionBlockIdHex: COMMIT_BLOCK_ID,
              confirmations: 11,
              vaultBoxIdHex: VAULT_BOX_ID,
            },
          }],
          vaultCurrentBoxIdsHex: [VAULT_BOX_ID],
        });
        expect(() => assertPegInRouteCacheRecoveryReportProvenance(report)).not.toThrow();
        expect(() => assertPegInRouteCacheRecoveryReportProvenance(
          structuredClone(report),
        )).toThrow(/provenance/);
      } finally {
        tracker.close();
      }
    });
  });

  it('is idempotent and survives restart as cache-only state', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const first = new StateTracker(dbPath);
      const firstReport = await recoverPegInRouteCache(recoveryInput(first));
      const secondReport = await recoverPegInRouteCache(recoveryInput(first));
      expect(firstReport.replacement.changed).toBe(true);
      expect(secondReport.replacement.changed).toBe(false);
      first.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getPegInRouteReconstructionSnapshot()).toMatchObject({
          state: { reconstructionDigestHex: firstReport.reconstructionDigestHex },
          activeHistory: [{ boxIdHex: DEPOSIT_ID, classification: 'committed' }],
        });
        expect(reopened.getPendingPegIns()).toEqual([]);
        expect(reopened.getPegInsByStatus('minted')).toEqual([]);
      } finally {
        reopened.close();
      }
    });
  });

  it('canonicalizes reverse-ordered multi-box histories before persistence', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const first = new StateTracker(dbPath);
      const firstReport = await recoverPegInRouteCache(multiBoxRecoveryInput(first));
      expect(first.getPegInRouteReconstructionSnapshot()).toMatchObject({
        state: { reconstructionDigestHex: firstReport.reconstructionDigestHex },
        vaultHistoryBoxIdsHex: [VAULT_BOX_ID, HISTORICAL_VAULT_BOX_ID],
        legacyRoutes: [{
          historyBoxIdsHex: [LEGACY_BOX_ID_LOW, LEGACY_BOX_ID_HIGH],
          currentBoxIdsHex: [],
        }],
      });
      first.close();

      const reopened = new StateTracker(dbPath);
      try {
        expect(reopened.getPegInRouteReconstructionSnapshot()).toMatchObject({
          state: { reconstructionDigestHex: firstReport.reconstructionDigestHex },
          vaultHistoryBoxIdsHex: [VAULT_BOX_ID, HISTORICAL_VAULT_BOX_ID],
          legacyRoutes: [{
            historyBoxIdsHex: [LEGACY_BOX_ID_LOW, LEGACY_BOX_ID_HIGH],
          }],
        });
        const secondReport = await recoverPegInRouteCache(multiBoxRecoveryInput(reopened));
        expect(secondReport.replacement.changed).toBe(false);
        expect(secondReport.reconstructionDigestHex).toBe(firstReport.reconstructionDigestHex);
      } finally {
        reopened.close();
      }
    });
  });

  it('rebuilds only the route cache while complete database loss retains a recovery hold', async () => {
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
      beforeLoss.recordPegInMinted(DEPOSIT_ID, `0x${'65'.repeat(32)}`);
      beforeLoss.close();
      for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
        if (existsSync(path)) rmSync(path, { force: true });
      }

      const recovered = new StateTracker(dbPath);
      try {
        const report = await recoverPegInRouteCache(recoveryInput(recovered));
        expect(report.replacement.pegInLifecycleRowsCreatedOrChanged).toBe(0);
        expect(recovered.getPegInByBoxId(DEPOSIT_ID)).toBeUndefined();
        expect(recovered.getPegInsByStatus('minted')).toEqual([]);
        expect(recovered.getPendingPegIns()).toEqual([]);
        expect(recovered.getPegInCircuitBreakerState()).toMatchObject({
          open: true,
          incidentCount: 0,
          continuityStatus: 'recovery_required',
          continuityRecoveryRequired: true,
        });
        expect(recovered.getPegInRouteReconstructionSnapshot()?.activeHistory).toHaveLength(1);
      } finally {
        recovered.close();
      }
    });
  });

  it('replaces a committed view with a reorged refundable view without mint authority', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        const committed = await recoverPegInRouteCache(recoveryInput(tracker));
        const reorged = await recoverPegInRouteCache(
          recoveryInput(tracker, 'refundable'),
        );
        expect(committed.decision.observationConditionMet).toBe(true);
        expect(reorged.replacement.changed).toBe(true);
        expect(reorged.decision).toMatchObject({
          classification: 'blocked_no_committed_transition',
          observationConditionMet: false,
        });
        expect(tracker.getPegInRouteReconstructionSnapshot()).toMatchObject({
          activeHistory: [{
            boxIdHex: DEPOSIT_ID,
            classification: 'refundable',
            transition: null,
          }],
          activeCurrentBoxIdsHex: [DEPOSIT_ID],
          vaultHistoryBoxIdsHex: [],
        });
        expect(tracker.getPendingPegIns()).toEqual([]);
      } finally {
        tracker.close();
      }
    });
  });

  it('rejects source disagreement and out-of-order snapshots before persistence', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        await expect(recoverPegInRouteCache(
          recoveryInput(tracker, 'committed', 'refundable'),
        )).rejects.toThrow(/exact stable dual-source view/);
        expect(tracker.getPegInRouteReconstructionSnapshot()).toBeNull();

        await expect(recoverPegInRouteCache(
          recoveryInput(tracker, 'committed', 'committed', true),
        )).rejects.toThrow(/snapshot|height|stable/i);
        expect(tracker.getPegInRouteReconstructionSnapshot()).toBeNull();
      } finally {
        tracker.close();
      }
    });
  });

  it('rejects cloned reconstruction objects at the persistence boundary', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        const input = recoveryInput(tracker);
        const reconstruction = await reconstructPegInRouteFromDistinctSources(input);
        expect(() => tracker.replacePegInRouteReconstruction(
          structuredClone(reconstruction) as PegInRouteReconstruction,
        )).toThrow(/provenance/);
        expect(tracker.getPegInRouteReconstructionSnapshot()).toBeNull();
      } finally {
        tracker.close();
      }
    });
  });

  it('reads one SQLite generation when another connection replaces the cache mid-read', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const reader = new StateTracker(dbPath);
      const writer = new StateTracker(dbPath);
      try {
        const committed = await recoverPegInRouteCache(recoveryInput(reader));
        const refundable = await reconstructPegInRouteFromDistinctSources(
          recoveryInput(reader, 'refundable'),
        );
        const rawDb = (reader as unknown as { db: any }).db;
        const originalPrepare = rawDb.prepare.bind(rawDb);
        let replacementTriggered = false;
        rawDb.prepare = (sql: string) => {
          const statement = originalPrepare(sql);
          if (
            !replacementTriggered
            && sql.includes('FROM peg_in_route_reconstruction_state')
          ) {
            return new Proxy(statement, {
              get(target, property, receiver) {
                if (property !== 'get') return Reflect.get(target, property, receiver);
                return (...args: unknown[]) => {
                  const row = target.get(...args);
                  replacementTriggered = true;
                  writer.replacePegInRouteReconstruction(refundable);
                  return row;
                };
              },
            });
          }
          return statement;
        };
        let concurrentRead;
        try {
          concurrentRead = reader.getPegInRouteReconstructionSnapshot();
        } finally {
          rawDb.prepare = originalPrepare;
        }

        expect(replacementTriggered).toBe(true);
        expect(concurrentRead).toMatchObject({
          state: { reconstructionDigestHex: committed.reconstructionDigestHex },
          activeHistory: [{ classification: 'committed' }],
          vaultHistoryBoxIdsHex: [VAULT_BOX_ID],
        });
        expect(writer.getPegInRouteReconstructionSnapshot()).toMatchObject({
          activeHistory: [{ classification: 'refundable' }],
          vaultHistoryBoxIdsHex: [],
        });
      } finally {
        writer.close();
        reader.close();
      }
    });
  });

  it('rejects persisted cache semantics whose reconstruction digest is stale', async () => {
    await withTempDatabase(async (_directory, dbPath) => {
      const tracker = new StateTracker(dbPath);
      try {
        await recoverPegInRouteCache(recoveryInput(tracker));
        const rawDb = (tracker as unknown as { db: any }).db;
        rawDb.prepare(`
          UPDATE peg_in_route_reconstruction_state
          SET observation_digest = ?
          WHERE id = 1
        `).run('ff'.repeat(32));
        expect(() => tracker.getPegInRouteReconstructionSnapshot())
          .toThrow(/digest does not match cache semantics/);
      } finally {
        tracker.close();
      }
    });
  });
});
