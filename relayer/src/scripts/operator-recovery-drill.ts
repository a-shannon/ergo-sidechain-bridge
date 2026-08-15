import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Network } from '@fleet-sdk/common';
import { ErgoAddress } from '@fleet-sdk/core';
import {
  createMatchingAggregateSettlementErgoObservationSources,
  type AggregateSettlementErgoObservationClient,
} from '../adapters/aggregate-settlement-ergo-observation.js';
import {
  runAggregateSettlementRecovery,
} from '../apps/bridge-daemon/aggregate-settlement-recovery.js';
import {
  PegInPostMintIncidentPersistenceError,
  runPegInPostMintRecovery,
} from '../apps/bridge-daemon/peg-in-post-mint-recovery.js';
import {
  CHECK_ONLY_COMMITTEE_PUBKEY_HEXES,
  createCommitteeConfig,
  injectCommitteePlaceholders,
} from '../committee-config.js';
import {
  encodeCollByteRegister,
  encodeLongRegister,
} from '../ergo-encoding.js';
import {
  createPegInCommitmentReceipt,
  type PegInCommitmentVerification,
} from '../peg-in-commitment-receipt.js';
import {
  assertPegInRouteCacheRecoveryReportProvenance,
  recoverPegInRouteCache,
  type PegInRouteCacheRecoveryReport,
} from '../peg-in-route-cache-recovery.js';
import {
  pegInRouteManifestDigestHex,
  sha256Utf8,
  type PegInRouteManifestV1,
} from '../peg-in-route-manifest.js';
import type { PegInRouteObservationSource } from '../peg-in-route-observation.js';
import {
  StateTracker,
  type PegInEvent,
} from '../state-tracker.js';

export const OPERATOR_RECOVERY_DRILL_SCHEMA =
  'e2s.operator-recovery-drill.v1' as const;

const PEG_IN_POST_MINT_RECOVERY_DEPS = Object.freeze({
  assertRecoveryReportProvenance:
    assertPegInRouteCacheRecoveryReportProvenance,
});

const CASE_SET_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:operator-recovery-drill-case-set:v1';
const REPORT_DIGEST_DOMAIN =
  'ergo-sidechain-bridge:operator-recovery-drill-report:v1';

export const OPERATOR_RECOVERY_DRILL_EXPECTATIONS = Object.freeze([
  Object.freeze({
    id: 'H01_NORMAL_RESTART',
    expectedOutcome: 'canonical_restart_without_authority_restoration',
  }),
  Object.freeze({
    id: 'H02_DATABASE_LOSS',
    expectedOutcome: 'inventory_reconstructed_cache_only_while_funds_remain_held',
  }),
  Object.freeze({
    id: 'H03_STALE_OR_COPY',
    expectedOutcome: 'recovery_required_copy_held_and_newer_route_incident_persisted',
  }),
  Object.freeze({
    id: 'H04_DIVERGENT_RPC',
    expectedOutcome: 'source_disagreement_holds_read_cycle',
  }),
  Object.freeze({
    id: 'H05_EVENT_REORDER',
    expectedOutcome: 'out_of_order_inputs_rejected_before_authority',
  }),
  Object.freeze({
    id: 'H06_REORG_CONTAINMENT',
    expectedOutcome: 'source_incident_burn_terminal_and_pre_finality_rollback',
  }),
  Object.freeze({
    id: 'H07_PARTIAL_PERSISTENCE',
    expectedOutcome: 'incident_port_failure_retries_after_restart_without_authority',
  }),
] as const);

export const OPERATOR_RECOVERY_DRILL_ABSENT_CAPABILITIES = Object.freeze([
  'private-runtime-database-read',
  'environment-read',
  'deployment-state-read',
  'live-network',
  'checker',
  'signer',
  'broadcast-authorization',
  'execution-reservation',
  'submission',
  'broadcast',
  'hold-clear',
] as const);

export type OperatorRecoveryDrillCaseId =
  typeof OPERATOR_RECOVERY_DRILL_EXPECTATIONS[number]['id'];

export interface OperatorRecoveryDrillStageCounters {
  readonly reopen: number;
  readonly reconstruct: number;
  readonly candidateList: number;
  readonly pegOutLookup: number;
  readonly sourceObserve: number;
  readonly burnObserve: number;
  readonly ergoObserve: number;
  readonly recollect: number;
  readonly journalRead: number;
  readonly journalWriteAttempt: number;
  readonly journalWrite: number;
  readonly burnTransition: number;
  readonly incidentWriteAttempt: number;
  readonly incidentWrite: number;
  readonly rollbackWrite: number;
  readonly quarantineWrite: number;
  readonly holdInspect: number;
  readonly disagreement: number;
  readonly outOfOrderReject: number;
}

export interface OperatorRecoveryDrillTrappedCapabilityCounters {
  readonly transportReservation: number;
  readonly fundsAuthorityAcquire: number;
  readonly fundsReleaseAuthorize: number;
  readonly fundsTransportStart: number;
}

export interface OperatorRecoveryDrillCaseReport {
  readonly id: OperatorRecoveryDrillCaseId;
  readonly result: 'PASS';
  readonly expectedOutcome: string;
  readonly observedOutcome: string;
  readonly stages: OperatorRecoveryDrillStageCounters;
  readonly holds: readonly string[];
  readonly incidents: readonly string[];
  readonly journalOutcomes: readonly string[];
  readonly trappedCapabilities: OperatorRecoveryDrillTrappedCapabilityCounters;
}

export interface OperatorRecoveryDrillReport {
  readonly schema: typeof OPERATOR_RECOVERY_DRILL_SCHEMA;
  readonly result: 'PASS';
  readonly caseSetDigestHex: string;
  readonly reportDigestHex: string;
  readonly caseCount: 7;
  readonly networkConfigured: false;
  readonly privateRuntimeDatabaseRead: false;
  readonly ephemeralDatabaseUsed: true;
  readonly absentCapabilities: typeof OPERATOR_RECOVERY_DRILL_ABSENT_CAPABILITIES;
  readonly cases: readonly OperatorRecoveryDrillCaseReport[];
  readonly trappedCapabilityTotals: OperatorRecoveryDrillTrappedCapabilityCounters;
}

type MutableStages = { -readonly [Key in keyof OperatorRecoveryDrillStageCounters]: number };
type MutableTrapped = {
  -readonly [Key in keyof OperatorRecoveryDrillTrappedCapabilityCounters]: number
};
type TrappedKey = keyof OperatorRecoveryDrillTrappedCapabilityCounters;

const TRAPPED_KEYS = Object.freeze([
  'transportReservation',
  'fundsAuthorityAcquire',
  'fundsReleaseAuthorize',
  'fundsTransportStart',
] as const satisfies readonly TrappedKey[]);

const hex = (byte: string): string => byte.repeat(32);

function stages(): MutableStages {
  return {
    reopen: 0,
    reconstruct: 0,
    candidateList: 0,
    pegOutLookup: 0,
    sourceObserve: 0,
    burnObserve: 0,
    ergoObserve: 0,
    recollect: 0,
    journalRead: 0,
    journalWriteAttempt: 0,
    journalWrite: 0,
    burnTransition: 0,
    incidentWriteAttempt: 0,
    incidentWrite: 0,
    rollbackWrite: 0,
    quarantineWrite: 0,
    holdInspect: 0,
    disagreement: 0,
    outOfOrderReject: 0,
  };
}

function trappedCapabilityCounters(): MutableTrapped {
  return {
    transportReservation: 0,
    fundsAuthorityAcquire: 0,
    fundsReleaseAuthorize: 0,
    fundsTransportStart: 0,
  };
}

function deny(trapped: MutableTrapped, key: TrappedKey, label: string): never {
  trapped[key] += 1;
  throw new Error(`operator recovery drill reached forbidden capability: ${label}`);
}

function instrumentStateTracker(
  state: StateTracker,
  trapped: MutableTrapped,
): StateTracker {
  const traps = [
    ['acquireFundsExecutionAuthority', 'fundsAuthorityAcquire'],
    ['assertFundsReleaseAuthorized', 'fundsReleaseAuthorize'],
    ['startFundsReleaseTransport', 'fundsTransportStart'],
    ['startPendingAggregateSettlementSubmission', 'transportReservation'],
  ] as const;
  for (const [method, key] of traps) {
    Object.defineProperty(state, method, {
      configurable: true,
      value: () => deny(trapped, key, method),
    });
  }
  return state;
}

function freezeStages(value: MutableStages): OperatorRecoveryDrillStageCounters {
  return Object.freeze({ ...value });
}

function freezeTrappedCapabilities(
  value: MutableTrapped,
): OperatorRecoveryDrillTrappedCapabilityCounters {
  const reached = TRAPPED_KEYS.filter(key => value[key] !== 0);
  if (reached.length > 0) {
    throw new Error(`operator recovery drill reached forbidden capabilities: ${reached.join(', ')}`);
  }
  return Object.freeze({ ...value });
}

function sha256Domain(domain: string, value: unknown): string {
  return createHash('sha256')
    .update(`${domain}\0`, 'ascii')
    .update(JSON.stringify(value), 'utf8')
    .digest('hex');
}

function expectation(id: OperatorRecoveryDrillCaseId): string {
  const value = OPERATOR_RECOVERY_DRILL_EXPECTATIONS.find(row => row.id === id);
  if (!value) throw new Error(`operator recovery drill case is unregistered: ${id}`);
  return value.expectedOutcome;
}

function passCase(input: Readonly<{
  id: OperatorRecoveryDrillCaseId;
  observedOutcome: string;
  stages: MutableStages;
  trapped: MutableTrapped;
  holds?: readonly string[];
  incidents?: readonly string[];
  journalOutcomes?: readonly string[];
}>): OperatorRecoveryDrillCaseReport {
  const expectedOutcome = expectation(input.id);
  if (input.observedOutcome !== expectedOutcome) {
    throw new Error(`${input.id} observed ${input.observedOutcome}; expected ${expectedOutcome}`);
  }
  return Object.freeze({
    id: input.id,
    result: 'PASS',
    expectedOutcome,
    observedOutcome: input.observedOutcome,
    stages: freezeStages(input.stages),
    holds: Object.freeze([...(input.holds ?? [])]),
    incidents: Object.freeze([...(input.incidents ?? [])]),
    journalOutcomes: Object.freeze([...(input.journalOutcomes ?? [])]),
    trappedCapabilities: freezeTrappedCapabilities(input.trapped),
  });
}

async function withEphemeralDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = mkdtempSync(join(tmpdir(), 'bridge-recovery-drill-'));
  try {
    return await run(directory);
  } finally {
    rmSync(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  }
}

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
const TIP_HEADER_ID = '56'.repeat(32);
const COMMIT_BLOCK_ID = '57'.repeat(32);
const TARGET_H160 = '58'.repeat(20);
const LATER_TIP_HEADER_ID = '59'.repeat(32);
const AMOUNT = 10_000_000n;
const GENERATED_AT = '2026-07-31T12:00:00.000Z';
const TRACKER_NFT_ID = '61'.repeat(32);
const DUP_NFT_ID = '62'.repeat(32);

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
interface RouteTip {
  readonly height: number;
  readonly idHex: string;
}

const INITIAL_ROUTE_TIP = Object.freeze({
  height: 100,
  idHex: TIP_HEADER_ID,
});
const LATER_ROUTE_TIP = Object.freeze({
  height: 101,
  idHex: LATER_TIP_HEADER_ID,
});

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

function sha256HexBytes(value: string): string {
  return createHash('sha256').update(Buffer.from(value, 'hex')).digest('hex');
}

function routeManifest(): PegInRouteManifestV1 {
  return {
    schemaVersion: 'ergo.bridge.peg-in-route-manifest.v1',
    kind: 'committed-vault-route-manifest',
    manifestId: 'operator-recovery-drill-testnet',
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
      declaredLegacyCount: 0,
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
    legacyMainChainLocks: [],
  };
}

function commitmentVerification(height: number): PegInCommitmentVerification {
  return {
    headerIdHex: COMMIT_BLOCK_ID,
    height,
    blockVersion: 2,
    transactionsRootHex: '5c'.repeat(32),
    transactionIdHex: COMMIT_TX_ID,
    transactionSigmaDigestHex: '5d'.repeat(32),
    transactionIndex: 0,
    transactionCount: 1,
    headerIdMatchedCanonicalBytes: true,
    transactionsRootMatchedCanonicalHeaderBytes: true,
    transactionRootMatched: true,
  };
}

function commitmentConfirmation(height: number) {
  return {
    inclusionHeight: height,
    inclusionHeaderId: COMMIT_BLOCK_ID,
    verification: commitmentVerification(height),
  };
}

function routeDeposit(mode: RouteMode) {
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

function routeVaultBox() {
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

function routeCommitTransaction() {
  const output = structuredClone(routeVaultBox());
  delete (output as { spentTransactionId?: string | null }).spentTransactionId;
  return {
    id: COMMIT_TX_ID,
    inclusionHeight: 90,
    headerId: COMMIT_BLOCK_ID,
    inputs: [{ boxId: DEPOSIT_ID }],
    outputs: [output],
  };
}

class DrillRouteSource implements PegInRouteObservationSource {
  constructor(
    readonly observationSourceId: string,
    readonly mode: RouteMode,
    readonly tip: RouteTip,
  ) {}

  beginAuthenticatedTrackerReconstruction(): void {}
  endAuthenticatedTrackerReconstruction(): void {}

  async getInfo(): Promise<unknown> {
    return { network: 'testnet', fullHeight: this.tip.height };
  }

  async getIndexedHeight(): Promise<unknown> {
    return { indexedHeight: this.tip.height, fullHeight: this.tip.height };
  }

  async getBestHeader(): Promise<unknown> {
    return { height: this.tip.height, id: this.tip.idHex };
  }

  async getBlockHeaderIdsAtHeight(height: number): Promise<string[]> {
    if (height === 91) return [HEADER_ID];
    if (height === 90) return [COMMIT_BLOCK_ID];
    if (height === this.tip.height) return [this.tip.idHex];
    return [];
  }

  async getIndexedBoxesByAddress(address: string): Promise<unknown[]> {
    if (address === ACTIVE_ADDRESS) return [routeDeposit(this.mode)];
    if (address === VAULT_ADDRESS) return this.mode === 'committed' ? [routeVaultBox()] : [];
    if (address === LEGACY_ADDRESS) return [];
    throw new Error(`unexpected drill route address: ${address}`);
  }

  async getUnspentBoxesByAddress(address: string): Promise<unknown[]> {
    if (address === ACTIVE_ADDRESS) {
      return this.mode === 'refundable' ? [routeDeposit(this.mode)] : [];
    }
    if (address === VAULT_ADDRESS) return this.mode === 'committed' ? [routeVaultBox()] : [];
    if (address === LEGACY_ADDRESS) return [];
    throw new Error(`unexpected drill route address: ${address}`);
  }

  async getTransaction(transactionId: string): Promise<unknown | null> {
    return this.mode === 'committed' && transactionId === COMMIT_TX_ID
      ? routeCommitTransaction()
      : null;
  }

  async compileP2sAddress(source: string): Promise<string> {
    if (source === resolvedMclSource()) return ACTIVE_ADDRESS;
    if (source === resolvedVaultSource()) return VAULT_ADDRESS;
    throw new Error('unexpected drill route source template');
  }
}

async function recoverRoute(
  state: StateTracker,
  counter: MutableStages,
  primaryMode: RouteMode,
  witnessMode: RouteMode = primaryMode,
  tip: RouteTip = INITIAL_ROUTE_TIP,
): Promise<PegInRouteCacheRecoveryReport> {
  const manifest = routeManifest();
  counter.reconstruct += 1;
  counter.sourceObserve += 2;
  counter.journalWriteAttempt += 1;
  const report = await recoverPegInRouteCache({
    stateTracker: state,
    manifest,
    expectedManifestSha256Hex: pegInRouteManifestDigestHex(manifest),
    mainChainLockTemplateSource: MCL_TEMPLATE,
    settlementVaultTemplateSource: VAULT_TEMPLATE,
    primarySource: new DrillRouteSource(
      'http://127.0.0.1:19053',
      primaryMode,
      tip,
    ),
    witnessSource: new DrillRouteSource(
      'http://127.0.0.1:29053',
      witnessMode,
      tip,
    ),
    generatedAt: GENERATED_AT,
  });
  counter.journalWrite += 1;
  return report;
}

function seedMintedPegIn(state: StateTracker): PegInEvent {
  state.insertPegIn(
    DEPOSIT_ID,
    `0x${TARGET_H160}`,
    AMOUNT,
    80,
    'active_committed_vault',
    DEPOSITOR_TREE,
  );
  state.recordPegInConsumeSubmitted(DEPOSIT_ID, COMMIT_TX_ID);
  state.recordPegInConsumeConfirmed(
    DEPOSIT_ID,
    VAULT_BOX_ID,
    commitmentConfirmation(90),
  );
  state.beginPegInMint(DEPOSIT_ID);
  state.recordPegInMinted(DEPOSIT_ID, `0x${'65'.repeat(32)}`);
  const event = state.getPegInByBoxId(DEPOSIT_ID);
  if (!event || event.status !== 'minted') {
    throw new Error('operator recovery drill failed to seed exact minted peg-in lifecycle');
  }
  return event;
}

async function normalRestartCase(): Promise<OperatorRecoveryDrillCaseReport> {
  const counter = stages();
  const trapped = trappedCapabilityCounters();
  return withEphemeralDirectory(async directory => {
    const dbPath = join(directory, 'normal-restart.sqlite');
    const first = instrumentStateTracker(new StateTracker(dbPath), trapped);
    try {
      seedMintedPegIn(first);
      counter.journalWrite += 1;
      await recoverRoute(first, counter, 'committed');
    } finally {
      first.close();
    }

    counter.reopen += 1;
    const reopened = instrumentStateTracker(new StateTracker(dbPath), trapped);
    try {
      counter.journalRead += 1;
      const event = reopened.getPegInByBoxId(DEPOSIT_ID);
      if (!event) throw new Error('normal restart lost the exact peg-in journal row');
      const report = await recoverRoute(reopened, counter, 'committed');
      const result = runPegInPostMintRecovery(
        DEPOSIT_ID,
        report,
        reopened,
        PEG_IN_POST_MINT_RECOVERY_DEPS,
      );
      counter.holdInspect += 1;
      const hold = reopened.getPegInCircuitBreakerState();
      if (result.status !== 'canonical' || !hold.open || event.status !== 'minted') {
        throw new Error('normal restart changed the retained lifecycle or restored authority');
      }
      return passCase({
        id: 'H01_NORMAL_RESTART',
        observedOutcome: 'canonical_restart_without_authority_restoration',
        stages: counter,
        trapped,
        holds: ['ephemeral_database_continuity_requires_reviewed_recovery'],
        journalOutcomes: ['minted_lifecycle_retained', 'committed_route_canonical'],
      });
    } finally {
      reopened.close();
    }
  });
}

async function databaseLossCase(): Promise<OperatorRecoveryDrillCaseReport> {
  const counter = stages();
  const trapped = trappedCapabilityCounters();
  return withEphemeralDirectory(async directory => {
    const runtimeDirectory = join(directory, 'lost-runtime');
    mkdirSync(runtimeDirectory);
    const dbPath = join(runtimeDirectory, 'state.sqlite');
    const first = instrumentStateTracker(new StateTracker(dbPath), trapped);
    try {
      seedMintedPegIn(first);
      counter.journalWrite += 1;
      await recoverRoute(first, counter, 'committed');
      if (first.getPegInsByStatus('minted').length !== 1) {
        throw new Error('database-loss source did not contain retained lifecycle state');
      }
    } finally {
      first.close();
    }

    rmSync(runtimeDirectory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
    mkdirSync(runtimeDirectory);

    counter.reopen += 1;
    const replacement = instrumentStateTracker(new StateTracker(dbPath), trapped);
    try {
      await recoverRoute(replacement, counter, 'committed');
      if (
        replacement.getPendingPegIns().length !== 0
        || replacement.getPegInsByStatus('minted').length !== 0
        || replacement.getRecoverableAggregateSettlementAttempts().length !== 0
        || replacement.getActiveAuthenticatedSettlementCandidates().length !== 0
      ) {
        throw new Error('database-loss inventory reconstruction created lifecycle authority');
      }
    } finally {
      replacement.close();
    }

    counter.reopen += 1;
    const reopened = instrumentStateTracker(new StateTracker(dbPath), trapped);
    try {
      counter.journalRead += 1;
      counter.holdInspect += 1;
      const snapshot = reopened.getPegInRouteReconstructionSnapshot();
      const hold = reopened.getPegInCircuitBreakerState();
      if (
        snapshot?.activeHistory.length !== 1
        || snapshot.activeHistory[0].classification !== 'committed'
        || !hold.open
      ) {
        throw new Error('database-loss cache did not survive restart under a funds hold');
      }
      return passCase({
        id: 'H02_DATABASE_LOSS',
        observedOutcome: 'inventory_reconstructed_cache_only_while_funds_remain_held',
        stages: counter,
        trapped,
        holds: ['database_continuity_requires_reviewed_recovery'],
        journalOutcomes: ['route_inventory_only', 'no_lifecycle_authority'],
      });
    } finally {
      reopened.close();
    }
  });
}

async function staleOrCopiedCase(): Promise<OperatorRecoveryDrillCaseReport> {
  const counter = stages();
  const trapped = trappedCapabilityCounters();
  return withEphemeralDirectory(async directory => {
    const sourcePath = join(directory, 'source.sqlite');
    const copiedPath = join(directory, 'copied.sqlite');
    const source = instrumentStateTracker(new StateTracker(sourcePath), trapped);
    try {
      seedMintedPegIn(source);
      await recoverRoute(source, counter, 'committed');
      const sourceHold = source.getPegInCircuitBreakerState();
      if (!sourceHold.open || sourceHold.externalContinuityWitnessCurrent) {
        throw new Error('source database did not retain its recovery-required boundary');
      }
    } finally {
      source.close();
    }
    copyFileSync(sourcePath, copiedPath);

    counter.reopen += 1;
    const copied = instrumentStateTracker(new StateTracker(copiedPath), trapped);
    try {
      counter.holdInspect += 1;
      const copyHold = copied.getPegInCircuitBreakerState();
      if (!copyHold.open || copyHold.externalContinuityWitnessCurrent) {
        throw new Error('copied database unexpectedly retained continuity authority');
      }
      const report = await recoverRoute(
        copied,
        counter,
        'refundable',
        'refundable',
        LATER_ROUTE_TIP,
      );
      if (
        report.observedTip.height !== LATER_ROUTE_TIP.height
        || report.observedTip.idHex !== LATER_ROUTE_TIP.idHex
      ) {
        throw new Error('copied-state recovery did not use the later route snapshot');
      }
      counter.incidentWriteAttempt += 1;
      const recovered = runPegInPostMintRecovery(
        DEPOSIT_ID,
        report,
        copied,
        PEG_IN_POST_MINT_RECOVERY_DEPS,
      );
      counter.incidentWrite += 1;
      counter.journalWrite += 1;
      if (
        recovered.status !== 'incident'
        || copied.getPegInByBoxId(DEPOSIT_ID)?.status !== 'incident'
      ) {
        throw new Error('newer route reconstruction did not incident copied stale state');
      }
      return passCase({
        id: 'H03_STALE_OR_COPY',
        observedOutcome: 'recovery_required_copy_held_and_newer_route_incident_persisted',
        stages: counter,
        trapped,
        holds: ['copied_database_recovery_required', 'post_mint_source_restored'],
        incidents: ['refundable_source_restored'],
        journalOutcomes: [
          'copied_state_requires_reviewed_recovery',
          'later_route_incident_persisted',
        ],
      });
    } finally {
      copied.close();
    }
  });
}

async function divergentRpcCase(): Promise<OperatorRecoveryDrillCaseReport> {
  const counter = stages();
  const trapped = trappedCapabilityCounters();
  return withEphemeralDirectory(async directory => {
    const dbPath = join(directory, 'divergent-rpc.sqlite');
    const first = instrumentStateTracker(new StateTracker(dbPath), trapped);
    let rejected = false;
    try {
      try {
        await recoverRoute(first, counter, 'committed', 'refundable');
      } catch (error) {
        rejected = /exact stable dual-source view/i.test(
          error instanceof Error ? error.message : String(error),
        );
      }
      if (!rejected || first.getPegInRouteReconstructionSnapshot() !== null) {
        throw new Error('divergent route sources changed the local reconstruction cache');
      }
    } finally {
      first.close();
    }

    counter.disagreement += 1;
    counter.reopen += 1;
    const reopened = instrumentStateTracker(new StateTracker(dbPath), trapped);
    try {
      counter.holdInspect += 1;
      if (
        reopened.getPegInRouteReconstructionSnapshot() !== null
        || !reopened.getPegInCircuitBreakerState().open
      ) {
        throw new Error('RPC disagreement did not remain fail-closed after restart');
      }
      return passCase({
        id: 'H04_DIVERGENT_RPC',
        observedOutcome: 'source_disagreement_holds_read_cycle',
        stages: counter,
        trapped,
        holds: ['source_disagreement'],
        journalOutcomes: ['no_route_snapshot_persisted'],
      });
    } finally {
      reopened.close();
    }
  });
}

function requireRejected(
  action: () => void,
  label: string,
  expectedError: string,
): void {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === expectedError) return;
    throw new Error(
      `operator recovery drill rejected ${label} with ${JSON.stringify(message)}; expected ${JSON.stringify(expectedError)}`,
    );
  }
  throw new Error(`operator recovery drill accepted out-of-order transition: ${label}`);
}

async function eventReorderCase(): Promise<OperatorRecoveryDrillCaseReport> {
  const counter = stages();
  const trapped = trappedCapabilityCounters();
  return withEphemeralDirectory(async directory => {
    const dbPath = join(directory, 'event-reorder.sqlite');
    const burnTxHash = '71'.repeat(32);
    const first = instrumentStateTracker(new StateTracker(dbPath), trapped);
    try {
      first.insertPegIn(
        DEPOSIT_ID,
        `0x${TARGET_H160}`,
        AMOUNT,
        80,
        'active_committed_vault',
        DEPOSITOR_TREE,
      );
      requireRejected(
        () => first.recordPegInConsumeConfirmed(
          DEPOSIT_ID,
          VAULT_BOX_ID,
          commitmentConfirmation(90),
        ),
        'consume confirmation before submission',
        `Cannot confirm consume without a persisted commitment transaction: ${DEPOSIT_ID}`,
      );
      if (first.getPegInByBoxId(DEPOSIT_ID)?.status !== 'detected') {
        throw new Error('early consume confirmation changed the peg-in lifecycle');
      }
      counter.outOfOrderReject += 1;
      requireRejected(
        () => first.beginPegInMint(DEPOSIT_ID),
        'mint before commitment receipt',
        `Cannot mint peg-in before committed-vault confirmation: ${DEPOSIT_ID}`,
      );
      if (first.getPegInByBoxId(DEPOSIT_ID)?.status !== 'detected') {
        throw new Error('early mint changed the peg-in lifecycle');
      }
      counter.outOfOrderReject += 1;

      const unobservedCandidateBurn = '73'.repeat(32);
      const unobservedCandidateTxId = '74'.repeat(32);
      requireRejected(
        () => first.recordAggregateSettlementAttempt(
          'single',
          [unobservedCandidateBurn],
          unobservedCandidateTxId,
        ),
        'aggregate settlement candidate before burn observation',
        'legacy aggregate journal requires exactly one persisted burn event per transaction hash; found 0',
      );
      counter.candidateList += 1;
      if (first.getAggregateSettlementAttempt(unobservedCandidateTxId) !== null) {
        throw new Error('early aggregate candidate transition changed the settlement journal');
      }
      counter.outOfOrderReject += 1;

      first.insertPegOut(burnTxHash, `02${'72'.repeat(32)}`, 1_000_000n, 42);
      first.markPegOutBurnRevertedAndInvalidateCandidates(
        burnTxHash,
        'operator recovery drill observed burn reversion',
      );
      requireRejected(
        () => first.updatePegOutStatus(burnTxHash, 'confirmed'),
        'terminal burn reversion overwritten by late confirmation',
        'Cannot transition terminal burn_reverted peg-out to confirmed',
      );
      if (first.getPegOutByTxHash(burnTxHash)?.status !== 'burn_reverted') {
        throw new Error('late confirmation changed the terminal burn state');
      }
      counter.outOfOrderReject += 1;
      counter.journalWrite += 3;
    } finally {
      first.close();
    }

    counter.reopen += 1;
    const reopened = instrumentStateTracker(new StateTracker(dbPath), trapped);
    try {
      counter.journalRead += 2;
      counter.holdInspect += 1;
      if (
        reopened.getPegInByBoxId(DEPOSIT_ID)?.status !== 'detected'
        || reopened.getPegOutByTxHash(burnTxHash)?.status !== 'burn_reverted'
        || reopened.getRecoverableAggregateSettlementAttempts().length !== 0
        || reopened.getActiveAuthenticatedSettlementCandidates().length !== 0
        || !reopened.getPegInCircuitBreakerState().open
      ) {
        throw new Error('out-of-order lifecycle state changed after restart');
      }
      return passCase({
        id: 'H05_EVENT_REORDER',
        observedOutcome: 'out_of_order_inputs_rejected_before_authority',
        stages: counter,
        trapped,
        holds: ['terminal_burn_reversion_retained'],
        journalOutcomes: [
          'early_commit_confirmation_rejected',
          'early_mint_rejected',
          'early_aggregate_candidate_rejected',
          'late_burn_confirmation_rejected',
        ],
      });
    } finally {
      reopened.close();
    }
  });
}

interface ConfirmedAggregateFixture {
  readonly id: string;
  readonly transaction: Record<string, unknown>;
}

async function buildConfirmedAggregateFixture(): Promise<ConfirmedAggregateFixture> {
  const imported = await import('ergo-lib-wasm-nodejs');
  const wasm = imported.default ?? imported;
  const unsigned = wasm.UnsignedTransaction.from_json(JSON.stringify({
    inputs: [{ boxId: '81'.repeat(32), extension: {} }],
    dataInputs: [],
    outputs: [{
      value: '1000000',
      ergoTree: '10010100d17300',
      assets: [],
      additionalRegisters: {},
      creationHeight: 100,
    }],
  }));
  const transaction = wasm.Transaction.from_unsigned_tx(unsigned, [new Uint8Array()]);
  try {
    const canonical = transaction.to_js_eip12() as Record<string, unknown>;
    return Object.freeze({
      id: String(canonical.id).toLowerCase(),
      transaction: {
        ...canonical,
        inclusionHeight: 100,
        blockId: '82'.repeat(32),
      },
    });
  } finally {
    transaction.free?.();
  }
}

function aggregateObservationClient(
  counter: MutableStages,
  fixture: ConfirmedAggregateFixture,
  kind: 'confirmed' | 'absent',
  tipHeight: number,
): AggregateSettlementErgoObservationClient {
  return {
    getCurrentHeight: async () => {
      counter.ergoObserve += 1;
      return tipHeight;
    },
    getBlockHeaderHash: async height => {
      counter.ergoObserve += 1;
      if (height === 100) return '82'.repeat(32);
      if (height === tipHeight) return '83'.repeat(32);
      throw new Error(`unexpected aggregate drill header lookup: ${height}`);
    },
    getTransaction: async transactionId => {
      counter.ergoObserve += 1;
      if (transactionId !== fixture.id) {
        throw new Error('aggregate drill observed an unexpected transaction ID');
      }
      return kind === 'confirmed' ? structuredClone(fixture.transaction) : null;
    },
    hasUnconfirmedTransaction: async transactionId => {
      counter.ergoObserve += 1;
      if (transactionId !== fixture.id) {
        throw new Error('aggregate drill queried an unexpected mempool transaction ID');
      }
      return false;
    },
  };
}

function seedAggregateAttempt(
  state: StateTracker,
  burnTxHash: string,
  expectedTxId: string,
): void {
  state.insertPegOut(burnTxHash, `02${'84'.repeat(32)}`, 1_000_000n, 42);
  state.recordAggregateSettlementAttempt('single', [burnTxHash], expectedTxId);
}

async function reorgContainmentCase(): Promise<OperatorRecoveryDrillCaseReport> {
  const counter = stages();
  const trapped = trappedCapabilityCounters();
  return withEphemeralDirectory(async directory => {
    const dbPath = join(directory, 'reorg-containment.sqlite');
    const revertedBurn = '85'.repeat(32);
    const aggregateBurn = '86'.repeat(32);
    const fixture = await buildConfirmedAggregateFixture();
    const state = instrumentStateTracker(new StateTracker(dbPath), trapped);
    try {
      seedMintedPegIn(state);
      const route = await recoverRoute(state, counter, 'refundable');
      const event = state.getPegInByBoxId(DEPOSIT_ID);
      if (!event) throw new Error('reorg drill lost the minted peg-in row');
      counter.incidentWriteAttempt += 1;
      const pegIn = runPegInPostMintRecovery(
        DEPOSIT_ID,
        route,
        state,
        PEG_IN_POST_MINT_RECOVERY_DEPS,
      );
      counter.incidentWrite += 1;

      state.insertPegOut(revertedBurn, `02${'87'.repeat(32)}`, 1_000_001n, 43);
      counter.burnObserve += 1;
      const burn = state.markPegOutBurnRevertedAndInvalidateCandidates(
        revertedBurn,
        'operator recovery drill observed canonical burn disappearance',
      );
      counter.burnTransition += burn.pegOutTransitioned ? 1 : 0;

      seedAggregateAttempt(state, aggregateBurn, fixture.id);
      const shallow = await runAggregateSettlementRecovery({
        state,
        ergo: aggregateObservationClient(counter, fixture, 'confirmed', 108),
      });
      counter.journalWriteAttempt += 1;
      counter.journalWrite += 1;
      const submitted = state.getAggregateSettlementAttempt(fixture.id);
      if (
        shallow.restoredBurns !== 1
        || submitted?.status !== 'submitted'
        || submitted.ergoObservation?.status !== 'confirmed_pre_finality'
      ) {
        throw new Error('aggregate drill failed to persist pre-finality observation');
      }

      const primary = aggregateObservationClient(counter, fixture, 'absent', 109);
      const witness = aggregateObservationClient(counter, fixture, 'absent', 109);
      const sources = createMatchingAggregateSettlementErgoObservationSources({
        primaryErgo: primary,
        primaryNodeUrl: 'http://127.0.0.1:19252',
        primaryNodeIdentityDigestHex: '88'.repeat(32),
        primaryAdministrationIdentityDigestHex: '89'.repeat(32),
        witnessErgo: witness,
        witnessNodeUrl: 'http://127.0.0.1:29252',
        witnessNodeIdentityDigestHex: '8a'.repeat(32),
        witnessAdministrationIdentityDigestHex: '8b'.repeat(32),
      });
      const rollback = await runAggregateSettlementRecovery({
        state,
        ergo: sources.primarySource.ergo,
        witness: sources,
      });
      counter.journalWriteAttempt += 1;
      counter.journalWrite += 1;
      counter.rollbackWrite += rollback.rolledBackAttempts;
      if (
        pegIn.status !== 'incident'
        || state.getPegOutByTxHash(revertedBurn)?.status !== 'burn_reverted'
        || rollback.rolledBackAttempts !== 1
        || rollback.rolledBackBurns !== 1
        || rollback.quarantinedConfirmedAttempts !== 0
      ) {
        throw new Error('reorg containment did not persist every fail-closed transition');
      }
    } finally {
      state.close();
    }

    counter.reopen += 1;
    const reopened = instrumentStateTracker(new StateTracker(dbPath), trapped);
    try {
      counter.journalRead += 3;
      counter.holdInspect += 1;
      const aggregate = reopened.getAggregateSettlementAttempt(fixture.id);
      if (
        reopened.getPegInByBoxId(DEPOSIT_ID)?.status !== 'incident'
        || reopened.getPegOutByTxHash(revertedBurn)?.status !== 'burn_reverted'
        || reopened.getPegOutByTxHash(aggregateBurn)?.status !== 'detected'
        || aggregate?.status !== 'pending'
        || aggregate.ergoObservation?.status !== 'absent'
        || aggregate.ergoObservationSourceCount !== 2
        || !reopened.getPegInCircuitBreakerState().open
      ) {
        throw new Error('reorg containment did not survive restart');
      }
      return passCase({
        id: 'H06_REORG_CONTAINMENT',
        observedOutcome: 'source_incident_burn_terminal_and_pre_finality_rollback',
        stages: counter,
        trapped,
        holds: ['post_mint_source_restoration', 'burn_reversion', 'pre_finality_rollback'],
        incidents: ['refundable_source_restored'],
        journalOutcomes: ['burn_reverted', 'pre_finality_rollback'],
      });
    } finally {
      reopened.close();
    }
  });
}

function incidentPersistenceFailureState(
  state: StateTracker,
): Parameters<typeof runPegInPostMintRecovery>[2] {
  return Object.freeze({
    getPegInByBoxId: state.getPegInByBoxId.bind(state),
    getPegInRouteReconstructionSnapshot:
      state.getPegInRouteReconstructionSnapshot.bind(state),
    markPegInIncident: () => {
      throw new Error('operator recovery drill injected incident persistence failure');
    },
  });
}

async function partialPersistenceCase(): Promise<OperatorRecoveryDrillCaseReport> {
  const counter = stages();
  const trapped = trappedCapabilityCounters();
  return withEphemeralDirectory(async directory => {
    const dbPath = join(directory, 'partial-persistence.sqlite');
    let firstFailure = false;
    const first = instrumentStateTracker(new StateTracker(dbPath), trapped);
    try {
      seedMintedPegIn(first);
      const report = await recoverRoute(first, counter, 'refundable');
      counter.incidentWriteAttempt += 1;
      try {
        runPegInPostMintRecovery(
          DEPOSIT_ID,
          report,
          incidentPersistenceFailureState(first),
          PEG_IN_POST_MINT_RECOVERY_DEPS,
        );
      } catch (error) {
        firstFailure = error instanceof PegInPostMintIncidentPersistenceError;
      }
      if (
        !firstFailure
        || !first.getPegInCircuitBreakerState().open
        || first.getPegInByBoxId(DEPOSIT_ID)?.status !== 'minted'
      ) {
        throw new Error('incident persistence port failure did not retain lifecycle and hold');
      }
    } finally {
      first.close();
    }

    counter.reopen += 1;
    const retry = instrumentStateTracker(new StateTracker(dbPath), trapped);
    try {
      counter.holdInspect += 1;
      if (!retry.getPegInCircuitBreakerState().open) {
        throw new Error('partial incident persistence failure lost its external hold');
      }
      if (retry.getPegInByBoxId(DEPOSIT_ID)?.status !== 'minted') {
        throw new Error('partial incident persistence changed lifecycle before retry');
      }
      const report = await recoverRoute(retry, counter, 'refundable');
      counter.incidentWriteAttempt += 1;
      const result = runPegInPostMintRecovery(
        DEPOSIT_ID,
        report,
        retry,
        PEG_IN_POST_MINT_RECOVERY_DEPS,
      );
      counter.incidentWrite += 1;
      counter.journalWrite += 1;
      if (result.status !== 'incident') {
        throw new Error('partial incident persistence retry did not persist the incident');
      }
    } finally {
      retry.close();
    }

    counter.reopen += 1;
    const verified = instrumentStateTracker(new StateTracker(dbPath), trapped);
    try {
      counter.journalRead += 1;
      counter.holdInspect += 1;
      if (
        verified.getPegInByBoxId(DEPOSIT_ID)?.status !== 'incident'
        || !verified.getPegInCircuitBreakerState().open
      ) {
        throw new Error('retried incident did not survive the second restart');
      }
      return passCase({
        id: 'H07_PARTIAL_PERSISTENCE',
        observedOutcome: 'incident_port_failure_retries_after_restart_without_authority',
        stages: counter,
        trapped,
        holds: ['continuity_recovery_required'],
        incidents: ['refundable_source_restored'],
        journalOutcomes: ['first_write_failed', 'restart_write_applied'],
      });
    } finally {
      verified.close();
    }
  });
}

function totalTrappedCapabilities(
  cases: readonly OperatorRecoveryDrillCaseReport[],
): OperatorRecoveryDrillTrappedCapabilityCounters {
  const total = trappedCapabilityCounters();
  for (const report of cases) {
    for (const key of TRAPPED_KEYS) {
      total[key] += report.trappedCapabilities[key];
    }
  }
  return freezeTrappedCapabilities(total);
}

export async function runOperatorRecoveryDrill(): Promise<OperatorRecoveryDrillReport> {
  const cases = Object.freeze([
    await normalRestartCase(),
    await databaseLossCase(),
    await staleOrCopiedCase(),
    await divergentRpcCase(),
    await eventReorderCase(),
    await reorgContainmentCase(),
    await partialPersistenceCase(),
  ]);
  const expectedIds = OPERATOR_RECOVERY_DRILL_EXPECTATIONS.map(row => row.id);
  if (
    cases.length !== expectedIds.length
    || cases.some((value, index) => value.id !== expectedIds[index])
  ) {
    throw new Error('operator recovery drill case set or ordering drifted');
  }
  const caseSetDigestHex = sha256Domain(
    CASE_SET_DIGEST_DOMAIN,
    OPERATOR_RECOVERY_DRILL_EXPECTATIONS,
  );
  const reportDigestHex = sha256Domain(REPORT_DIGEST_DOMAIN, {
    schema: OPERATOR_RECOVERY_DRILL_SCHEMA,
    caseSetDigestHex,
    cases: cases.map(value => ({
      id: value.id,
      expectedOutcome: value.expectedOutcome,
      observedOutcome: value.observedOutcome,
      stages: value.stages,
      holds: value.holds,
      incidents: value.incidents,
      journalOutcomes: value.journalOutcomes,
      trappedCapabilities: value.trappedCapabilities,
    })),
  });
  return Object.freeze({
    schema: OPERATOR_RECOVERY_DRILL_SCHEMA,
    result: 'PASS',
    caseSetDigestHex,
    reportDigestHex,
    caseCount: 7,
    networkConfigured: false,
    privateRuntimeDatabaseRead: false,
    ephemeralDatabaseUsed: true,
    absentCapabilities: OPERATOR_RECOVERY_DRILL_ABSENT_CAPABILITIES,
    cases,
    trappedCapabilityTotals: totalTrappedCapabilities(cases),
  });
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  const report = await runOperatorRecoveryDrill();
  console.log(JSON.stringify(report, null, 2));
}
