import { createHash } from 'crypto';

import { Network } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import { describe, expect, it } from 'vitest';

import {
  CHECK_ONLY_COMMITTEE_PUBKEY_HEXES,
  createCommitteeConfig,
  injectCommitteePlaceholders,
} from './committee-config.js';
import {
  encodeCollByteRegister,
  encodeLongRegister,
  MINER_FEE,
} from './ergo-encoding.js';
import {
  assessPegInRouteObservation,
  PegInRouteObservationBlockedError,
  type PegInRouteObservationSource,
} from './peg-in-route-observation.js';
import {
  pegInRouteManifestDigestHex,
  sha256Utf8,
  type PegInRouteManifestV1,
} from './peg-in-route-manifest.js';

const ACTIVE_TREE = `1008cd02${'11'.repeat(32)}`;
const VAULT_TREE = `1008cd02${'22'.repeat(32)}`;
const LEGACY_TREE = `1008cd02${'33'.repeat(32)}`;
const DEPOSITOR_TREE = `1008cd02${'77'.repeat(32)}`;
const ACTIVE_ADDRESS = ErgoAddress.fromErgoTree(ACTIVE_TREE, Network.Testnet).toString();
const VAULT_ADDRESS = ErgoAddress.fromErgoTree(VAULT_TREE, Network.Testnet).toString();
const LEGACY_ADDRESS = ErgoAddress.fromErgoTree(LEGACY_TREE, Network.Testnet).toString();
const DEPOSIT_ID = '10'.repeat(32);
const DEPOSIT_TX_ID = '20'.repeat(32);
const COMMIT_TX_ID = '30'.repeat(32);
const VAULT_BOX_ID = '40'.repeat(32);
const TARGET_H160 = '50'.repeat(20);
const AMOUNT = 10_000_000n;
const HEADER_ID = '44'.repeat(32);
const COMMIT_BLOCK_ID = '45'.repeat(32);
const REFUND_BLOCK_ID = '46'.repeat(32);
const TRACKER_NFT_ID = 'aa'.repeat(32);
const DUP_NFT_ID = 'bb'.repeat(32);

const TEMPLATE_SOURCE = [
  '{',
  '  val vault = fromBase16("SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER")',
  '  val committee = Coll(COMMITTEE_SIGMAPROP_PLACEHOLDERS)',
  '  atLeast(COMMITTEE_THRESHOLD_PLACEHOLDER, committee)',
  '}',
].join('\n');
const VAULT_TEMPLATE_SOURCE = [
  '{',
  '  val tracker = fromBase16("TRACKER_NFT_ID_PLACEHOLDER")',
  '  val dup = fromBase16("DUP_NFT_ID_PLACEHOLDER")',
  '  sigmaProp(tracker != dup)',
  '}',
].join('\n');

function sha256HexBytes(hex: string): string {
  return createHash('sha256').update(Buffer.from(hex, 'hex')).digest('hex');
}

function resolvedSource(): string {
  return injectCommitteePlaceholders(
    TEMPLATE_SOURCE,
    createCommitteeConfig(CHECK_ONLY_COMMITTEE_PUBKEY_HEXES, '2'),
  ).replaceAll('SETTLEMENT_VAULT_ERGOTREE_HEX_PLACEHOLDER', VAULT_TREE);
}

function resolvedVaultSource(): string {
  return VAULT_TEMPLATE_SOURCE
    .replaceAll('TRACKER_NFT_ID_PLACEHOLDER', TRACKER_NFT_ID)
    .replaceAll('DUP_NFT_ID_PLACEHOLDER', DUP_NFT_ID);
}

function manifestFixture(): PegInRouteManifestV1 {
  return {
    schemaVersion: 'ergo.bridge.peg-in-route-manifest.v1',
    kind: 'committed-vault-route-manifest',
    manifestId: 'peg-in-route-v1-testnet',
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
        sourceRevision: '55'.repeat(20),
      },
      basis: [{
        reference: 'repository://docs/reviewed-peg-in-route.md',
        sha256Hex: '66'.repeat(32),
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
          templateSha256Hex: sha256Utf8(TEMPLATE_SOURCE),
          resolvedSha256Hex: sha256Utf8(resolvedSource()),
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
          templateSha256Hex: sha256Utf8(VAULT_TEMPLATE_SOURCE),
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

function depositRegisters(): Record<string, string> {
  return {
    R4: encodeCollByteRegister(Buffer.from(TARGET_H160, 'hex')),
    R5: encodeLongRegister(AMOUNT),
    R6: encodeCollByteRegister(Buffer.from(CHECK_ONLY_COMMITTEE_PUBKEY_HEXES[0], 'hex')),
    R7: encodeCollByteRegister(Buffer.from(DEPOSITOR_TREE, 'hex')),
  };
}

function vaultRegisters(depositId = DEPOSIT_ID): Record<string, string> {
  return {
    R4: encodeCollByteRegister(Buffer.from(depositId, 'hex')),
    R5: encodeCollByteRegister(Buffer.from(TARGET_H160, 'hex')),
    R6: encodeLongRegister(AMOUNT),
    R7: encodeCollByteRegister(Buffer.from(DEPOSITOR_TREE, 'hex')),
  };
}

function depositBox(overrides: Record<string, unknown> = {}): any {
  return {
    boxId: DEPOSIT_ID,
    transactionId: DEPOSIT_TX_ID,
    index: 0,
    creationHeight: 80,
    value: AMOUNT.toString(),
    ergoTree: ACTIVE_TREE,
    assets: [],
    additionalRegisters: depositRegisters(),
    spentTransactionId: COMMIT_TX_ID,
    ...overrides,
  };
}

function vaultBox(overrides: Record<string, unknown> = {}): any {
  return {
    boxId: VAULT_BOX_ID,
    transactionId: COMMIT_TX_ID,
    index: 0,
    creationHeight: 90,
    value: AMOUNT.toString(),
    ergoTree: VAULT_TREE,
    assets: [],
    additionalRegisters: vaultRegisters(),
    spentTransactionId: null,
    ...overrides,
  };
}

function commitTransaction(overrides: Record<string, unknown> = {}): any {
  return {
    id: COMMIT_TX_ID,
    inclusionHeight: 90,
    headerId: COMMIT_BLOCK_ID,
    inputs: [{ boxId: DEPOSIT_ID }],
    outputs: [{ ...vaultBox(), spentTransactionId: undefined }],
    ...overrides,
  };
}

function refundTransaction(outputOverrides: Record<string, unknown> = {}): any {
  return {
    id: COMMIT_TX_ID,
    inclusionHeight: 10_080,
    headerId: REFUND_BLOCK_ID,
    inputs: [{ boxId: DEPOSIT_ID }],
    outputs: [{
      boxId: '41'.repeat(32),
      transactionId: COMMIT_TX_ID,
      index: 0,
      creationHeight: 10_080,
      value: (AMOUNT - BigInt(MINER_FEE)).toString(),
      ergoTree: DEPOSITOR_TREE,
      assets: [],
      additionalRegisters: {},
      ...outputOverrides,
    }],
  };
}

interface SourceOptions {
  height?: number;
  activeHistory?: any[];
  activeCurrent?: any[];
  vaultHistory?: any[];
  vaultCurrent?: any[];
  legacyHistory?: any[];
  legacyCurrent?: any[];
  transaction?: any | null;
  compiledAddress?: string;
  compiledVaultAddress?: string;
  indexedHeight?: number;
  drift?: boolean;
}

class FakeSource implements PegInRouteObservationSource {
  readonly observationSourceId: string;
  private height: number;
  private bestHeaderCalls = 0;
  readonly started: boolean[] = [];

  constructor(id: string, readonly options: SourceOptions = {}) {
    this.observationSourceId = id;
    this.height = options.height ?? 100;
  }

  beginAuthenticatedTrackerReconstruction(): void {
    this.started.push(true);
  }

  endAuthenticatedTrackerReconstruction(): void {
    this.started.push(false);
  }

  async getInfo(): Promise<unknown> {
    return { network: 'testnet', fullHeight: this.height };
  }

  async getIndexedHeight(): Promise<unknown> {
    return {
      indexedHeight: this.options.indexedHeight ?? this.height,
      fullHeight: this.height,
    };
  }

  async getBestHeader(): Promise<unknown> {
    const height = this.height;
    const header = { id: height === 100 ? '70'.repeat(32) : '71'.repeat(32), height };
    if (this.options.drift && this.bestHeaderCalls === 0) this.height = 101;
    this.bestHeaderCalls += 1;
    return header;
  }

  async getBlockHeaderIdsAtHeight(height: number): Promise<string[]> {
    if (height === 10_080) return [REFUND_BLOCK_ID];
    if (height === 90 || height === 92) return [COMMIT_BLOCK_ID];
    return [HEADER_ID];
  }

  async getIndexedBoxesByAddress(address: string): Promise<unknown[]> {
    if (address === ACTIVE_ADDRESS) return structuredClone(this.options.activeHistory ?? [depositBox()]);
    if (address === VAULT_ADDRESS) return structuredClone(this.options.vaultHistory ?? [vaultBox()]);
    if (address === LEGACY_ADDRESS) return structuredClone(this.options.legacyHistory ?? []);
    throw new Error('unexpected address');
  }

  async getUnspentBoxesByAddress(address: string): Promise<unknown[]> {
    if (address === ACTIVE_ADDRESS) return structuredClone(this.options.activeCurrent ?? []);
    if (address === VAULT_ADDRESS) return structuredClone(this.options.vaultCurrent ?? [vaultBox()]);
    if (address === LEGACY_ADDRESS) return structuredClone(this.options.legacyCurrent ?? []);
    throw new Error('unexpected address');
  }

  async getTransaction(txId: string): Promise<unknown | null> {
    if (txId !== COMMIT_TX_ID) throw new Error('unexpected transaction');
    return structuredClone(this.options.transaction === undefined
      ? commitTransaction()
      : this.options.transaction);
  }

  async compileP2sAddress(source: string): Promise<string> {
    if (source === resolvedSource()) return this.options.compiledAddress ?? ACTIVE_ADDRESS;
    if (source === resolvedVaultSource()) {
      return this.options.compiledVaultAddress ?? VAULT_ADDRESS;
    }
    throw new Error('unexpected compile source');
  }
}

function input(
  primary: FakeSource,
  witness: FakeSource,
  manifest = manifestFixture(),
) {
  return {
    manifest,
    expectedManifestSha256Hex: pegInRouteManifestDigestHex(manifest),
    mainChainLockTemplateSource: TEMPLATE_SOURCE,
    settlementVaultTemplateSource: VAULT_TEMPLATE_SOURCE,
    primarySource: primary,
    witnessSource: witness,
    generatedAt: '2026-07-16T12:00:00.000Z',
  };
}

function twoSources(primaryOptions: SourceOptions = {}, witnessOptions = primaryOptions) {
  return [
    new FakeSource('http://127.0.0.1:9053', primaryOptions),
    new FakeSource('http://127.0.0.1:9054', witnessOptions),
  ] as const;
}

describe('peg-in route observation', () => {
  it('accepts one exact MCL-to-vault transition under two stable origins', async () => {
    const [primary, witness] = twoSources();
    const report = await assessPegInRouteObservation(input(primary, witness));
    expect(report.decision).toEqual(expect.objectContaining({
      classification: 'observation_condition_met_under_explicit_manifest',
      observationConditionMet: true,
      routeActivated: false,
      mintAuthorized: false,
      cutoverAuthorized: false,
    }));
    expect(report.summary).toEqual({
      activeDepositsObserved: 1,
      refundableDeposits: 0,
      pendingCommitDeposits: 0,
      committedDeposits: 1,
      refundedDeposits: 0,
      unresolvedDeposits: 0,
      legacyCurrentUtxos: 0,
    });
    expect(report.boundary).toEqual(expect.objectContaining({
      sidechainMintTimingVerified: false,
      manifestReviewApprovalBound: false,
      routingConfigurationAuthenticated: false,
      signingPerformed: false,
      broadcastPerformed: false,
      fundsAuthorityGranted: false,
    }));
    expect(primary.started).toEqual([true, false]);
    expect(witness.started).toEqual([true, false]);
  });

  it('retains but blocks an exact vault transition before the manifest confirmation depth', async () => {
    const options = { transaction: commitTransaction({ inclusionHeight: 92 }) };
    const [primary, witness] = twoSources(options);
    const report = await assessPegInRouteObservation(input(primary, witness));
    expect(report.summary.committedDeposits).toBe(0);
    expect(report.summary.pendingCommitDeposits).toBe(1);
    expect(report.summary.unresolvedDeposits).toBe(0);
    expect(report.networkObservation.primary.activeHistory[0]).toMatchObject({
      classification: 'commit_pending',
      transition: {
        inclusionHeight: 92,
        inclusionBlockIdHex: COMMIT_BLOCK_ID,
        confirmations: 9,
        vaultBoxIdHex: VAULT_BOX_ID,
      },
    });
    expect(report.decision.classification).toBe('blocked_commit_pending');
  });

  it('classifies only a timeout refund with exact output-zero transaction identity', async () => {
    const manifest = manifestFixture();
    manifest.network.anchorHeader.height = 10_091;
    const options = {
      height: 10_100,
      vaultHistory: [],
      vaultCurrent: [],
      transaction: refundTransaction(),
    };
    const [primary, witness] = twoSources(options);
    const report = await assessPegInRouteObservation(input(primary, witness, manifest));
    expect(report.summary.refundedDeposits).toBe(1);
    expect(report.summary.unresolvedDeposits).toBe(0);
    expect(report.decision.classification).toBe('blocked_no_committed_transition');

    const wrongIdentity = {
      ...options,
      transaction: refundTransaction({ transactionId: '42'.repeat(32) }),
    };
    const [primary2, witness2] = twoSources(wrongIdentity);
    await expect(assessPegInRouteObservation(input(primary2, witness2, manifest)))
      .rejects.toMatchObject({ classification: 'blocked_box_malformed' });

    for (const transaction of [
      { ...refundTransaction(), inclusionHeight: 10_079 },
      refundTransaction({ value: (AMOUNT - BigInt(MINER_FEE) - 1n).toString() }),
      refundTransaction({ ergoTree: ACTIVE_TREE }),
      refundTransaction({ assets: [{ tokenId: '45'.repeat(32), amount: '1' }] }),
    ]) {
      const [invalidPrimary, invalidWitness] = twoSources({ ...options, transaction });
      const blocked = await assessPegInRouteObservation(
        input(invalidPrimary, invalidWitness, manifest),
      );
      expect(blocked.summary.refundedDeposits).toBe(0);
      expect(blocked.summary.unresolvedDeposits).toBe(1);
      expect(blocked.decision.classification).toBe('blocked_transition_unresolved');
    }
  });

  it('rejects contradictory transaction aliases and output identities', async () => {
    for (const transaction of [
      commitTransaction({ txId: '43'.repeat(32) }),
      commitTransaction({ blockHeight: 91 }),
      commitTransaction({ blockId: REFUND_BLOCK_ID }),
      commitTransaction({
        outputs: [{
          ...vaultBox(),
          transactionId: '44'.repeat(32),
          spentTransactionId: undefined,
        }],
      }),
      commitTransaction({
        outputs: [{ ...vaultBox(), index: 1, spentTransactionId: undefined }],
      }),
    ]) {
      const [primary, witness] = twoSources({ transaction });
      await expect(assessPegInRouteObservation(input(primary, witness)))
        .rejects.toMatchObject({ classification: 'blocked_box_malformed' });
    }
  });

  it('blocks an empty active history instead of treating an empty route as proof', async () => {
    const options = { activeHistory: [], vaultHistory: [], vaultCurrent: [] };
    const [primary, witness] = twoSources(options);
    const report = await assessPegInRouteObservation(input(primary, witness));
    expect(report.decision.classification).toBe('blocked_no_active_route_history');
    expect(report.decision.blockers.map(blocker => blocker.code)).toContain(
      'blocked_no_committed_transition',
    );
  });

  it('blocks a route with only refundable deposits', async () => {
    const current = depositBox({ spentTransactionId: null });
    const options = {
      activeHistory: [current],
      activeCurrent: [current],
      vaultHistory: [],
      vaultCurrent: [],
    };
    const [primary, witness] = twoSources(options);
    const report = await assessPegInRouteObservation(input(primary, witness));
    expect(report.summary.refundableDeposits).toBe(1);
    expect(report.decision.classification).toBe('blocked_no_committed_transition');
  });

  it('blocks any current UTXO on a declared legacy refundable route', async () => {
    const legacy = {
      boxId: '81'.repeat(32),
      creationHeight: 70,
      ergoTree: LEGACY_TREE,
      spentTransactionId: null,
    };
    const options = { legacyHistory: [legacy], legacyCurrent: [legacy] };
    const [primary, witness] = twoSources(options);
    const report = await assessPegInRouteObservation(input(primary, witness));
    expect(report.summary.legacyCurrentUtxos).toBe(1);
    expect(report.decision.classification).toBe('blocked_legacy_mcl_utxo_present');
  });

  it('blocks a spent deposit that does not produce the exact output-zero vault', async () => {
    const wrong = commitTransaction({
      outputs: [{ ...vaultBox({ value: (AMOUNT - 1n).toString() }), spentTransactionId: undefined }],
    });
    const options = { transaction: wrong };
    const [primary, witness] = twoSources(options);
    const report = await assessPegInRouteObservation(input(primary, witness));
    expect(report.summary.unresolvedDeposits).toBe(1);
    expect(report.decision.classification).toBe('blocked_transition_unresolved');
  });

  it('blocks a spend whose reported inclusion block is not canonical at its height', async () => {
    const options = { transaction: commitTransaction({ headerId: REFUND_BLOCK_ID }) };
    const [primary, witness] = twoSources(options);
    const report = await assessPegInRouteObservation(input(primary, witness));
    expect(report.summary.unresolvedDeposits).toBe(1);
    expect(report.decision.classification).toBe('blocked_transition_unresolved');

    primary.getBlockHeaderIdsAtHeight = async height => height === 90
      ? [REFUND_BLOCK_ID, COMMIT_BLOCK_ID]
      : [HEADER_ID];
    witness.getBlockHeaderIdsAtHeight = async height => height === 90
      ? [REFUND_BLOCK_ID, COMMIT_BLOCK_ID]
      : [HEADER_ID];
    const ambiguous = await assessPegInRouteObservation(input(primary, witness));
    expect(ambiguous.summary.unresolvedDeposits).toBe(1);
    expect(ambiguous.decision.classification).toBe('blocked_transition_unresolved');
  });

  it('blocks malformed MCL registers and token-bearing deposits', async () => {
    const malformedRegisters = depositBox({
      additionalRegisters: { ...depositRegisters(), R7: undefined },
    });
    const [primary, witness] = twoSources({ activeHistory: [malformedRegisters] });
    await expect(assessPegInRouteObservation(input(primary, witness)))
      .rejects.toMatchObject({ classification: 'blocked_box_malformed' });

    const tokenBearing = depositBox({ assets: [{ tokenId: '90'.repeat(32), amount: '1' }] });
    const [primary2, witness2] = twoSources({ activeHistory: [tokenBearing] });
    await expect(assessPegInRouteObservation(input(primary2, witness2)))
      .rejects.toMatchObject({ classification: 'blocked_box_malformed' });
  });

  it('blocks two valid but different source observations', async () => {
    const refundable = depositBox({
      boxId: '91'.repeat(32),
      transactionId: '92'.repeat(32),
      spentTransactionId: null,
    });
    const witnessOptions = {
      activeHistory: [depositBox(), refundable],
      activeCurrent: [refundable],
    };
    const [primary, witness] = twoSources({}, witnessOptions);
    const report = await assessPegInRouteObservation(input(primary, witness));
    expect(report.decision.classification).toBe('blocked_source_disagreement');
    expect(report.networkObservation.exactObservationAgreement).toBe(false);
  });

  it('blocks a drifting source snapshot', async () => {
    const [primary, witness] = twoSources({ drift: true });
    const report = await assessPegInRouteObservation(input(primary, witness));
    expect(report.decision.classification).toBe('blocked_node_view_unstable');
  });

  it('rejects wrong compile identity, unsynchronized index, and duplicate source origin', async () => {
    const wrongCompile = ErgoAddress.fromErgoTree(LEGACY_TREE, Network.Testnet).toString();
    const [primary, witness] = twoSources({ compiledAddress: wrongCompile });
    await expect(assessPegInRouteObservation(input(primary, witness)))
      .rejects.toMatchObject({ classification: 'blocked_compile_identity' });

    const [primaryVault, witnessVault] = twoSources({ compiledVaultAddress: wrongCompile });
    await expect(assessPegInRouteObservation(input(primaryVault, witnessVault)))
      .rejects.toMatchObject({ classification: 'blocked_compile_identity' });

    const [primary2, witness2] = twoSources({ indexedHeight: 99 });
    await expect(assessPegInRouteObservation(input(primary2, witness2)))
      .rejects.toMatchObject({ classification: 'blocked_index_unsynchronized' });

    const sameA = new FakeSource('http://127.0.0.1:9053');
    const sameB = new FakeSource('http://127.0.0.1:9053/');
    await expect(assessPegInRouteObservation(input(sameA, sameB)))
      .rejects.toMatchObject({ classification: 'blocked_source_identity' });
  });

  it('rejects a caller digest mismatch without treating the digest as review approval', async () => {
    const [primary, witness] = twoSources();
    await expect(assessPegInRouteObservation({
      ...input(primary, witness),
      expectedManifestSha256Hex: 'ff'.repeat(32),
    })).rejects.toMatchObject({
      classification: 'blocked_manifest_digest_mismatch',
    });
  });

  it('preserves the non-authorizing error type for query failures', async () => {
    const [primary, witness] = twoSources();
    primary.getIndexedBoxesByAddress = async () => {
      throw new Error('offline');
    };
    await expect(assessPegInRouteObservation(input(primary, witness))).rejects.toBeInstanceOf(
      PegInRouteObservationBlockedError,
    );
    await expect(assessPegInRouteObservation(input(
      new FakeSource('http://127.0.0.1:9055', { transaction: null }),
      new FakeSource('http://127.0.0.1:9056', { transaction: null }),
    ))).resolves.toEqual(expect.objectContaining({
      decision: expect.objectContaining({ classification: 'blocked_transition_unresolved' }),
    }));
  });
});
