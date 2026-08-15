import { Interface } from 'ethers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const processGuards = vi.hoisted(() => ({
  assertLifecycle: vi.fn(),
  assertProcess: vi.fn(),
}));

vi.mock(
  '../../substrate-federated-authority-safe-devnet-process-v1.js',
  async importOriginal => {
    const actual = await importOriginal<
      typeof import('../../substrate-federated-authority-safe-devnet-process-v1.js')
    >();
    return {
      ...actual,
      assertOwnedAuthoritySafeDevnetRecoveryLifecycleV1Receipt:
        processGuards.assertLifecycle,
      assertOwnedAuthoritySafeDevnetRecoveryProcessV1Receipt:
        processGuards.assertProcess,
    };
  },
);

import {
  createFrontierBackingReadAgreementSources,
  observeFrontierBackingReadAgreement,
  type FrontierBackingReadClient,
  type FrontierBackingReadAgreementSources,
} from '../../adapters/frontier-backing-read-agreement.js';
import { deriveTrustlessBurnIdHex } from '../../ergo-settlement-core/trustless-burn-id.js';
import {
  assertSubstrateFederatedDualNodeRecoveryCompositionV1Receipt,
  composeSubstrateFederatedDualNodeRecoveryV1,
  substrateFederatedDualNodeRecoveryLifecycleDigestV1,
} from './substrate-federated-dual-node-recovery-composition-v1.js';
import type {
  SubstrateFederatedDatabaseLossRecoveryStateV1,
} from './substrate-federated-database-loss-recovery-v1.js';

const BRIDGE = `0x${'11'.repeat(20)}`;
const USER = `0x${'12'.repeat(20)}`;
const SERG = `0x${'13'.repeat(20)}`;
const SERG_OWNER = `0x${'14'.repeat(20)}`;
const SIDECHAIN_ID = '15'.repeat(32);
const BRIDGE_CODE_HASH = '16'.repeat(32);
const SERG_CODE_HASH = '17'.repeat(32);
const PRIMARY_PEER_DIGEST = '18'.repeat(32);
const WITNESS_PEER_DIGEST = '19'.repeat(32);
const PROCESS_BINDING_DIGEST = '1a'.repeat(32);
const TRANSACTION_HASH = '1b'.repeat(32);
const RECIPIENT = `02${'1c'.repeat(32)}`;
const HASHES = Object.freeze({
  initial: '20'.repeat(32),
  burn: '21'.repeat(32),
  recovered: '22'.repeat(32),
  abandoned: '23'.repeat(32),
  replacementAtAbandonedHeight: '24'.repeat(32),
  replacement: '25'.repeat(32),
});
const LOG_INDEX = 3;
const AMOUNT = 25_000_000n;
const PEG_OUT_INTERFACE = new Interface([
  'event PegOut(address indexed user, uint256 amount, bytes ergoRecipientPubKey)',
]);

interface ExactKeyShapeObject {
  readonly [key: string]: true | ExactKeyShapeObject;
}
type ExactKeyShape = true | ExactKeyShapeObject;

const TIP_SHAPE = Object.freeze({ height: true, blockHashHex: true });
const RECEIPT_SHAPE = Object.freeze({
  schema: true,
  version: true,
  status: true,
  processBindingDigestHex: true,
  lifecycleDigestHex: true,
  sourceIdsHex: true,
  observationAgreementDigestsHex: true,
  recoveryPin: TIP_SHAPE,
  replacementObservationPin: TIP_SHAPE,
  recoveryInventoryDigestHex: true,
  observedBurnCount: true,
  timelineDigestHex: true,
  checks: {
    recoveryProcessProvenanceMatched: true,
    processIdentityBindingMatched: true,
    exactLifecyclePinsMatched: true,
    strictObservationOrderMatched: true,
    finalizedAnchorInventoryReconstructed: true,
    replacementObservedWithoutFinalityClaim: true,
    continuityHoldRetained: true,
    onlyInventoryAndHoldReconstructed: true,
    noProcessOrTransportCapabilityReturned: true,
  },
  boundaries: {
    sameOwnedProcessLifetimeEstablished: true,
    completeDatabaseDeletionObserved: true,
    independentAdministrationEstablished: true,
    sourceConsensusAuthenticated: true,
    sourceFinalityAuthenticated: true,
    localRecordAuthoritative: true,
    lifecycleAuthorityRestored: true,
    checkerAuthorityRestored: true,
    signingAuthorized: true,
    submissionAuthorized: true,
    transportAuthorized: true,
    broadcastAuthorized: true,
    mintAuthorized: true,
    payoutAuthorized: true,
    fundsAuthorityEstablished: true,
  },
} as const);

class TimelineClient implements FrontierBackingReadClient {
  tipHeight = 0;
  supplyOffset = 0n;

  async getCurrentBlockNumber(): Promise<number> {
    return this.tipHeight;
  }

  async getBlock(blockNumber: number) {
    const hash = blockHashAt(blockNumber);
    return hash === null ? null : { number: blockNumber, hash: `0x${hash}` };
  }

  async scanForPegOuts(fromBlock: number, toBlock: number) {
    if (fromBlock > 1 || toBlock < 1) return [];
    return [{
      user: USER,
      amount: AMOUNT,
      ergoRecipientAddress: RECIPIENT,
      sidechainTxHash: TRANSACTION_HASH,
      sidechainBlockNumber: 1,
      sidechainBlockHash: HASHES.burn,
      sidechainLogIndex: LOG_INDEX,
    }];
  }

  async getTransactionReceipt(transactionHash: string) {
    if (transactionHash.toLowerCase() !== `0x${TRANSACTION_HASH}`) return null;
    const encoded = PEG_OUT_INTERFACE.encodeEventLog(
      PEG_OUT_INTERFACE.getEvent('PegOut')!,
      [USER, AMOUNT, `0x${RECIPIENT}`],
    );
    return {
      status: 1,
      hash: `0x${TRANSACTION_HASH}`,
      blockNumber: 1,
      blockHash: `0x${HASHES.burn}`,
      logs: [{
        address: BRIDGE,
        topics: encoded.topics,
        data: encoded.data,
        transactionHash: `0x${TRANSACTION_HASH}`,
        blockNumber: 1,
        blockHash: `0x${HASHES.burn}`,
        index: LOG_INDEX,
      }],
    };
  }

  async getTotalSERGSupplyAtBlockHash(): Promise<bigint> {
    return 5_000_000_000n + this.supplyOffset;
  }

  async getRuntimeIdentityAtBlockHash() {
    return {
      chainId: '31337',
      bridgeCodeHashHex: BRIDGE_CODE_HASH,
      sergAddress: SERG,
      sergCodeHashHex: SERG_CODE_HASH,
      sergOwnerAddress: SERG_OWNER,
    };
  }
}

class FreshRecoveryState implements SubstrateFederatedDatabaseLossRecoveryStateV1 {
  readonly rows = new Map<string, Record<string, unknown>>();
  transactionCount = 0;
  authorityCount = 0;
  holdOpen = true;
  failInsert = false;

  runPegOutBackingInventoryTransaction<T>(operation: () => T): T {
    this.transactionCount += 1;
    return operation();
  }

  getPegOutByBurnId(burnIdHex: string): unknown {
    return this.rows.get(burnIdHex);
  }

  insertPegOut(
    sidechainTransactionHashHex: string,
    ergoRecipientAddress: string,
    amountNanoErg: bigint,
    sidechainBurnHeight: number,
    metadata: Readonly<{
      user: string;
      sidechainId: string;
      sidechainBlockHash: string;
      sidechainLogIndex: number;
    }>,
  ): void {
    if (this.failInsert) throw new Error('synthetic recovery persistence failure');
    const burnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex: metadata.sidechainId,
      sidechainTxHashHex: sidechainTransactionHashHex,
      eventIndex: metadata.sidechainLogIndex,
    });
    this.rows.set(burnIdHex, {
      burn_id: burnIdHex,
      sidechain_id: metadata.sidechainId,
      sidechain_burn_tx_hash: sidechainTransactionHashHex,
      sidechain_block_hash: metadata.sidechainBlockHash,
      sidechain_log_index: metadata.sidechainLogIndex,
      sidechain_burn_height: sidechainBurnHeight,
      amount_nanoerg: amountNanoErg.toString(),
      ergo_recipient_address: ergoRecipientAddress,
      user: metadata.user,
      status: 'detected',
    });
  }

  getPegInCircuitBreakerState() {
    return {
      open: this.holdOpen,
      continuityRecoveryRequired: this.holdOpen,
    };
  }

  getSettlementAuthorityInventoryCounts() {
    return {
      pegInEvents: this.authorityCount,
      pegInMintTransportAttempts: 0,
      aggregateSettlementAttempts: 0,
      authenticatedSettlementCandidates: 0,
      authenticatedSettlementExecutionReservations: 0,
      authenticatedSettlementSubmissionAttempts: 0,
      ergoOperationalTransactionAttempts: 0,
      pendingDupHeartbeats: 0,
    };
  }
}

describe('Substrate federated dual-node recovery composition V1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('joins exact lifecycle pins to fresh non-authorizing inventory recovery', async () => {
    const fixture = await timelineFixture();
    const state = new FreshRecoveryState();
    const receipt = await composeSubstrateFederatedDualNodeRecoveryV1({
      process: processReceipt(),
      lifecycle: lifecycleReceipt(),
      sources: fixture.sources,
      snapshots: fixture.snapshots,
      state,
    });

    expect(receipt.status).toBe('reconstructed_non_authorizing');
    expect(receipt.recoveryPin).toEqual({
      height: 1,
      blockHashHex: HASHES.burn,
    });
    expect(receipt.replacementObservationPin).toEqual({
      height: 5,
      blockHashHex: HASHES.replacement,
    });
    expect(receipt.observedBurnCount).toBe(1);
    expect(receipt.lifecycleDigestHex).toBe(
      substrateFederatedDualNodeRecoveryLifecycleDigestV1(lifecycleReceipt()),
    );
    expect(receipt.checks).toEqual({
      recoveryProcessProvenanceMatched: true,
      processIdentityBindingMatched: true,
      exactLifecyclePinsMatched: true,
      strictObservationOrderMatched: true,
      finalizedAnchorInventoryReconstructed: true,
      replacementObservedWithoutFinalityClaim: true,
      continuityHoldRetained: true,
      onlyInventoryAndHoldReconstructed: true,
      noProcessOrTransportCapabilityReturned: true,
    });
    expect(Object.values(receipt.boundaries).every(value => value === false))
      .toBe(true);
    expect(state.transactionCount).toBe(1);
    expect(state.rows.size).toBe(1);
    expect(processGuards.assertProcess).toHaveBeenCalledTimes(1);
    expect(processGuards.assertLifecycle).toHaveBeenCalledTimes(1);
    assertExactKeyShape(receipt, RECEIPT_SHAPE);
    expect(() => assertSubstrateFederatedDualNodeRecoveryCompositionV1Receipt(
      receipt,
    )).not.toThrow();
  });

  it('rejects a process/lifecycle digest mismatch before recovery mutation', async () => {
    const fixture = await timelineFixture();
    const state = new FreshRecoveryState();
    await expect(composeSubstrateFederatedDualNodeRecoveryV1({
      process: { ...processReceipt(), processBindingDigestHex: 'ff'.repeat(32) },
      lifecycle: lifecycleReceipt(),
      sources: fixture.sources,
      snapshots: fixture.snapshots,
      state,
    })).rejects.toThrow(/process binding/i);
    expect(state.transactionCount).toBe(0);
  });

  it('rejects source identities that differ from the owned peers', async () => {
    const fixture = await timelineFixture({
      primaryNodeIdentityDigestHex: 'fe'.repeat(32),
    });
    const state = new FreshRecoveryState();
    await expect(composeSubstrateFederatedDualNodeRecoveryV1({
      process: processReceipt(),
      lifecycle: lifecycleReceipt(),
      sources: fixture.sources,
      snapshots: fixture.snapshots,
      state,
    })).rejects.toThrow(/owned process identities/i);
    expect(state.transactionCount).toBe(0);
  });

  it('rejects copied or cross-pair snapshots before recovery mutation', async () => {
    const fixture = await timelineFixture();
    const other = await timelineFixture();
    const state = new FreshRecoveryState();
    await expect(composeSubstrateFederatedDualNodeRecoveryV1({
      process: processReceipt(),
      lifecycle: lifecycleReceipt(),
      sources: fixture.sources,
      snapshots: { ...fixture.snapshots, initial: { ...fixture.snapshots.initial } },
      state,
    })).rejects.toThrow(/provenance/i);
    await expect(composeSubstrateFederatedDualNodeRecoveryV1({
      process: processReceipt(),
      lifecycle: lifecycleReceipt(),
      sources: fixture.sources,
      snapshots: { ...fixture.snapshots, replacement: other.snapshots.replacement },
      state,
    })).rejects.toThrow(/provenance/i);
    expect(state.transactionCount).toBe(0);
  });

  it('rejects out-of-order and wrong-pin observations before persistence', async () => {
    const fixture = await timelineFixture();
    const state = new FreshRecoveryState();
    await expect(composeSubstrateFederatedDualNodeRecoveryV1({
      process: processReceipt(),
      lifecycle: lifecycleReceipt(),
      sources: fixture.sources,
      snapshots: {
        ...fixture.snapshots,
        initial: fixture.snapshots.lagRecovered,
        lagRecovered: fixture.snapshots.initial,
      },
      state,
    })).rejects.toThrow(/lifecycle pin/i);
    await expect(composeSubstrateFederatedDualNodeRecoveryV1({
      process: processReceipt(),
      lifecycle: lifecycleReceipt(),
      sources: fixture.sources,
      snapshots: {
        ...fixture.snapshots,
        replacement: fixture.snapshots.restarted,
      },
      state,
    })).rejects.toThrow(/lifecycle pin/i);
    expect(state.transactionCount).toBe(0);
  });

  it('rejects duplicate or swapped same-pin middle captures before persistence', async () => {
    const fixture = await timelineFixture();
    const state = new FreshRecoveryState();
    await expect(composeSubstrateFederatedDualNodeRecoveryV1({
      process: processReceipt(),
      lifecycle: lifecycleReceipt(),
      sources: fixture.sources,
      snapshots: {
        ...fixture.snapshots,
        lagRecovered: fixture.snapshots.restarted,
        restarted: fixture.snapshots.lagRecovered,
      },
      state,
    })).rejects.toThrow(/capture order/i);
    await expect(composeSubstrateFederatedDualNodeRecoveryV1({
      process: processReceipt(),
      lifecycle: lifecycleReceipt(),
      sources: fixture.sources,
      snapshots: {
        ...fixture.snapshots,
        restarted: fixture.snapshots.lagRecovered,
      },
      state,
    })).rejects.toThrow(/capture order/i);
    expect(state.transactionCount).toBe(0);
  });

  it('rejects source disagreement before a composable snapshot exists', async () => {
    const primary = new TimelineClient();
    const witness = new TimelineClient();
    primary.tipHeight = 5;
    witness.tipHeight = 5;
    witness.supplyOffset = 1n;
    const sources = sourcePair(primary, witness);
    await expect(observeFrontierBackingReadAgreement({
      sources,
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    })).rejects.toThrow(/disagree/i);
  });

  it('rejects closed holds, retained authority, and persistence failure', async () => {
    const fixture = await timelineFixture();
    for (const configure of [
      (state: FreshRecoveryState) => { state.holdOpen = false; },
      (state: FreshRecoveryState) => { state.authorityCount = 1; },
      (state: FreshRecoveryState) => { state.failInsert = true; },
    ]) {
      const state = new FreshRecoveryState();
      configure(state);
      await expect(composeSubstrateFederatedDualNodeRecoveryV1({
        process: processReceipt(),
        lifecycle: lifecycleReceipt(),
        sources: fixture.sources,
        snapshots: fixture.snapshots,
        state,
      })).rejects.toThrow();
    }
  });

  it('rejects copied composition receipts', () => {
    expect(() => assertSubstrateFederatedDualNodeRecoveryCompositionV1Receipt({
      schema: 'e2s.substrate-federated-dual-node-recovery-composition.v1',
      version: 1,
    })).toThrow(/provenance/i);
  });

  it.each([
    'initialAgreement',
    'lagRecovery.before',
    'lagRecovery.primaryWhileWitnessStopped',
    'lagRecovery.recoveredAgreement',
    'connectedRestart.before',
    'connectedRestart.after',
    'emptyTailReplacement.finalizedAnchor',
    'emptyTailReplacement.commonParent',
    'emptyTailReplacement.abandonedTip',
    'emptyTailReplacement.replacementAtAbandonedHeight',
    'emptyTailReplacement.replacementTip',
  ])('binds the complete lifecycle pin %s into its digest', path => {
    const baseline = lifecycleReceipt();
    const mutated = structuredClone(baseline) as Record<string, unknown>;
    const segments = path.split('.');
    let cursor = mutated;
    for (const segment of segments.slice(0, -1)) {
      cursor = cursor[segment] as Record<string, unknown>;
    }
    const leaf = cursor[segments.at(-1)!] as Record<string, unknown>;
    leaf.blockHashHex = 'fe'.repeat(32);

    expect(substrateFederatedDualNodeRecoveryLifecycleDigestV1(
      mutated as unknown as ReturnType<typeof lifecycleReceipt>,
    )).not.toBe(
      substrateFederatedDualNodeRecoveryLifecycleDigestV1(baseline),
    );
  });
});

async function timelineFixture(input: Readonly<{
  primaryNodeIdentityDigestHex?: string;
}> = {}) {
  const primary = new TimelineClient();
  const witness = new TimelineClient();
  const sources = sourcePair(primary, witness, input);
  const observeAt = async (height: number) => {
    primary.tipHeight = height;
    witness.tipHeight = height;
    return await observeFrontierBackingReadAgreement({
      sources,
      sidechainIdHex: SIDECHAIN_ID,
      bridgeAddress: BRIDGE,
    });
  };
  const initial = await observeAt(1);
  const lagRecovered = await observeAt(3);
  const restarted = await observeAt(3);
  const replacement = await observeAt(5);
  return Object.freeze({
    sources,
    snapshots: Object.freeze({ initial, lagRecovered, restarted, replacement }),
  });
}

function sourcePair(
  primary: FrontierBackingReadClient,
  witness: FrontierBackingReadClient,
  input: Readonly<{ primaryNodeIdentityDigestHex?: string }> = {},
): FrontierBackingReadAgreementSources {
  return createFrontierBackingReadAgreementSources({
    primaryClient: primary,
    primaryRpcUrl: 'http://127.0.0.1:19955',
    primaryNodeIdentityDigestHex:
      input.primaryNodeIdentityDigestHex ?? PRIMARY_PEER_DIGEST,
    primaryAdministrationIdentityDigestHex: '26'.repeat(32),
    witnessClient: witness,
    witnessRpcUrl: 'http://127.0.0.1:19956',
    witnessNodeIdentityDigestHex: WITNESS_PEER_DIGEST,
    witnessAdministrationIdentityDigestHex: '27'.repeat(32),
    expectedChainId: '31337',
    expectedBridgeAddress: BRIDGE,
    expectedBridgeCodeHashHex: BRIDGE_CODE_HASH,
    expectedSergAddress: SERG,
    expectedSergCodeHashHex: SERG_CODE_HASH,
  });
}

function processReceipt() {
  return Object.freeze({
    schema: 'e2s.substrate-federated-owned-recovery-process.v1',
    version: 1,
    nodeBinarySha256Hex: '28'.repeat(32),
    chainSpecSha256Hex: '29'.repeat(32),
    primaryPeerIdSha256Hex: PRIMARY_PEER_DIGEST,
    witnessPeerIdSha256Hex: WITNESS_PEER_DIGEST,
    processBindingDigestHex: PROCESS_BINDING_DIGEST,
    checks: Object.freeze({}),
  });
}

function lifecycleReceipt() {
  return Object.freeze({
    schema: 'e2s.substrate-federated-owned-recovery-lifecycle.v1',
    version: 1,
    processBindingDigestHex: PROCESS_BINDING_DIGEST,
    initialAgreement: tip(1, HASHES.burn),
    lagRecovery: Object.freeze({
      before: tip(1, HASHES.burn),
      primaryWhileWitnessStopped: tip(3, HASHES.recovered),
      recoveredAgreement: tip(3, HASHES.recovered),
      lagBlocks: 2,
    }),
    connectedRestart: Object.freeze({
      before: tip(3, HASHES.recovered),
      after: tip(3, HASHES.recovered),
      witnessPeerIdentityPreserved: true,
    }),
    emptyTailReplacement: Object.freeze({
      finalizedAnchor: tip(1, HASHES.burn),
      commonParent: tip(3, HASHES.recovered),
      abandonedTip: tip(4, HASHES.abandoned),
      replacementAtAbandonedHeight:
        tip(4, HASHES.replacementAtAbandonedHeight),
      replacementTip: tip(5, HASHES.replacement),
    }),
    checks: Object.freeze({}),
    boundaries: Object.freeze({}),
  });
}

function tip(height: number, blockHashHex: string) {
  return Object.freeze({ height, blockHashHex });
}

function blockHashAt(height: number): string | null {
  if (height === 0) return HASHES.initial;
  if (height === 1) return HASHES.burn;
  if (height === 3) return HASHES.recovered;
  if (height === 5) return HASHES.replacement;
  return null;
}

function assertExactKeyShape(
  value: unknown,
  shape: ExactKeyShape,
  path = 'receipt',
): void {
  if (shape === true) {
    if (Array.isArray(value)) {
      for (const [index, child] of value.entries()) {
        assertExactKeyShape(child, true, `${path}[${index}]`);
      }
      return;
    }
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
