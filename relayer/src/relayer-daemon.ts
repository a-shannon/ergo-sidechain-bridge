/**
 * Bridge Relayer Daemon v2 — guarded prototype event loop
 *
 * Watches both Ergo L1 and the Substrate sidechain for bridge events,
 * and processes them automatically:
 *
 *   A. Peg-In:  Detect deposits → recollect joined state → hold pending finality
 *   B. Peg-Out: Detect burns → authenticated candidate or fail-closed hold
 *   C. SCS Oracle: Reconcile historical updates and observe finality read-only
 *
 * Crash-safe: all state is persisted in SQLite. On restart, the daemon
 * rebuilds from the DB and continues where it left off.
 *
 * Production hardening (v2):
 *   - Structured JSON logging (--json flag)
 *   - Graceful shutdown with in-flight tick completion
 *   - Mempool-aware reconciliation for historical SCS attempts
 *   - Health tracking (consecutive errors, uptime)
 *
 * Usage:
 *   npx tsx src/relayer-daemon.ts           # human-readable logs
 *   npx tsx src/relayer-daemon.ts --json    # structured JSON logs
 */

import 'dotenv/config';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { ErgoClient } from './ergo-client.js';
import {
  loadReviewedPegInMintRuntimeIdentity,
  SidechainClient,
  ParsedPegOut,
} from './sidechain-client.js';
import { StateTracker, type PegOutEventLookup } from './state-tracker.js';
import {
  ERGO_CONFIG,
  getAggregateSettlementRecoverySourceIdentityConfig,
  getErgoReadQuorumSourceIdentityConfig,
  getSidechainBackingSourceIdentityConfig,
  loadDeployedState,
  OPERATOR_ALERT_CONFIG,
  PROTOCOL_PARAMS,
  SUBSTRATE_CONFIG,
  DeployedState,
} from './config.js';
import { AggregateSettlementService } from './aggregate-settlement-service.js';
import {
  createAuthenticatedSettlementPreparationFacade,
  type AuthenticatedSettlementPreparationFacade,
} from './authenticated-settlement-preparation-facade.js';
import {
  createAggregateSettlementErgoWitness,
  getActiveAggregateSettlementAttemptBurnTxHashes,
  recoverAggregateSettlementAttempts,
  type AggregateSettlementErgoWitness,
} from './aggregate-settlement-recovery.js';
import {
  runAuthenticatedSettlementCandidateReconciliation,
} from './apps/bridge-daemon/authenticated-settlement-candidate-reconciliation.js';
import {
  projectSubstrateFederatedDatabaseLossInventoryObservationV1,
  reconstructSubstrateFederatedDatabaseLossStateV1,
  type SubstrateFederatedDatabaseLossInventoryObservationV1,
} from './apps/bridge-daemon/substrate-federated-database-loss-recovery-v1.js';
import {
  ACTIVE_SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_PROFILE_V1,
} from './substrate-federated-daemon-scheduling-v1.js';
import {
  runSubstrateFederatedPreReleaseContainmentV1,
} from './substrate-federated-pre-release-containment-v1.js';
import {
  requireErgoReadQuorumDecisionObservation,
  runErgoReadQuorumGate,
} from './apps/bridge-daemon/ergo-read-quorum.js';
import {
  buildBridgeDaemonOperatorHealth,
  createBridgeDaemonOperatorHealthPolicy,
  operatorHealthStateFingerprint,
} from './apps/bridge-daemon/operator-health.js';
import {
  runBridgeDaemonOperatorAlerts,
} from './apps/bridge-daemon/operator-alerts.js';
import {
  SqliteOperatorAlertExternalOutbox,
} from './adapters/operator-alert-external-outbox.js';
import { deriveAnchoredTrackerIngest, findStableAnchorHeight, validatePersistedAnchor } from './aggregate-anchor.js';
import {
  classifyPegOutBurnForSettlement,
  verifyPegOutBurnReceipt,
} from './peg-out-burn-verifier.js';
import { assertObservationOnlyDaemonBroadcastDisabled } from './broadcast-policy.js';
import { assertLiveSettlementStartupReadiness } from './live-settlement-readiness.js';
import type { SpvTrackerEntry } from './spv-tracker.js';
import { nget } from './ergo-helpers.js';
import { reconcileHistoricalScsAttempts } from './historical-scs-reconciliation.js';
import {
  DUP_HEARTBEAT_OPERATION_PROFILE,
  SCS_ORACLE_UPDATE_OPERATION_PROFILE,
} from './relayer-core/ergo-operational-transaction-lifecycle.js';
import {
  ErgoReadQuorumSupervisor,
  type ErgoReadCycleDecision,
} from './relayer-core/ergo-read-quorum-supervisor.js';
import { persistPegOutObservationCursor } from './relayer-core/peg-out-observation-cursor.js';
import {
  projectCrossLedgerBackingAlarmFromTerminalLiabilityResolution,
  reconstructPegOutTerminalLiabilities,
} from './peg-out-terminal-liability-reconstruction.js';
import {
  assertCompleteSidechainBackingSnapshotProvenance,
  createCompleteSidechainBackingSnapshot,
  reconcileCompletePegOutBackingInventory,
  type CompletePegOutBackingInventoryResult,
  type CompleteSidechainBackingSnapshot,
} from './relayer-core/peg-out-backing-inventory.js';
import {
  BoundedHttpSubstrateRpcTransport,
  ReadOnlySubstrateFinalityRpc,
  requestSubstrateBlockHashAt,
  requestSubstrateFinalizedHeadHash,
  requestSubstrateHeaderObservation,
} from './substrate-finality-provider.js';
import {
  classifyLegacyPegIn,
  PegInIncidentPersistenceError,
  PegInTransitionCoordinator,
  resolveActivePegInDeployment,
  type ActivePegInDeployment,
} from './peg-in-transition.js';
import {
  verifyErgoBlockTransactionCommitment,
} from './adapters/ergo-block-transaction-commitment.js';
import {
  normalizeErgoEip12BoxSnapshot,
} from './adapters/ergo-committed-vault-current-state.js';
import {
  createPegOutBackingInventoryPersistence,
} from './adapters/peg-out-backing-inventory-state.js';
import {
  sumCanonicalCommittedVaultBackingV1,
} from './profiles/substrate-grandpa-v1/peg-in-committed-vault.js';
import {
  assertErgoReadQuorumAddressBoxSnapshotProvenance,
  createErgoReadQuorumSources,
  observeErgoReadQuorumAddressBoxes,
  observeErgoStorageRentParameters,
  type ErgoStorageRentParameterObservation,
  type ErgoReadQuorumSourcePair,
} from './adapters/ergo-read-quorum.js';
import {
  assertFrontierBackingReadAgreementProvenance,
  createFrontierBackingReadAgreementSources,
  observeFrontierBackingReadAgreement,
  revalidateFrontierBackingReadAgreementPin,
  type FrontierBackingReadAgreementSources,
  type FrontierBackingReadAgreementSnapshot,
} from './adapters/frontier-backing-read-agreement.js';
import {
  createBoundedFrontierBackingReadClient,
} from './adapters/bounded-frontier-backing-rpc.js';
import {
  assertStorageRentSurfaceTree,
} from './adapters/ergo-storage-rent-surface.js';
import {
  LEGACY_SPV_TRACKER_STORAGE_RENT_PROFILE,
  STORAGE_RENT_SURFACE_INVENTORY,
  projectStorageRent,
  serializedBoxSizeBytesFromHex,
  type StorageRentProjection,
} from './ergo-settlement-core/storage-rent-maintenance.js';
import {
  loadPegInRuntimeReconciliationFromEnvironment,
  type PegInRuntimeReconciliationPass,
} from './peg-in-runtime-reconciliation.js';
import { LEGACY_MCU_DISABLED_MESSAGE } from './legacy-peg-out-guard.js';
import { LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE } from './legacy-aggregate-settlement-conservation.js';
import { evaluateSidechainRollback } from './sidechain-rollback-guard.js';
import { collectFrontierBurnProofForPegOut } from './frontier-burn-proof-source.js';
import { FRONTIER_BRIDGE_EVENT_ROOT_MAX_BURNS } from './finalized-bridge-checkpoint.js';
import { recordNativeVerifiedAuthenticatedSettlementCandidate } from './authenticated-settlement-candidate.js';
import { deriveTrustlessBurnIdHex } from './trustless-burn-proof.js';
import {
  loadNativeCheckpointSettlementSourceFromEnvironment,
  type NativeCheckpointSettlementSource,
} from './native-checkpoint-settlement-source.js';
import {
  loadNativeVerifierExecutionAuthorityFromEnvironment,
} from './native-verifier-execution-authority.js';
import { bindNativeCheckpointToAuthenticatedSettlement } from './native-checkpoint-settlement-admission.js';
import {
  recollectAndRevalidateAuthenticatedSettlementCandidate,
  type RevalidatedAuthenticatedSettlementCandidate,
} from './authenticated-settlement-candidate-revalidation.js';
import {
  observeAuthenticatedSpvTrackerTipCurrentOnIndependentSources,
  reconstructAuthenticatedSpvTrackerHistoryFromIndependentSources,
} from './authenticated-spv-tracker-reconstruction.js';
import {
  createBoundedAuthenticatedSpvTrackerReadOnlySource,
  readMatchingAuthenticatedSpvTrackerNodeNetwork,
  type AuthenticatedSpvTrackerNodeSource,
} from './authenticated-spv-tracker-read-only-node-client.js';
import { canonicalNodeOrigin } from './ergo-node-endpoint-alignment.js';

const ERGO_OPERATIONAL_FINAL_CONFIRMATIONS = 10;
const STORAGE_RENT_MONITOR_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Structured Logger ───────────────────────────────────────────

const JSON_MODE = process.argv.includes('--json');

interface LogEntry {
  ts: string;
  level: 'info' | 'warn' | 'error';
  msg: string;
  [key: string]: unknown;
}

function log(level: LogEntry['level'], msg: string, data?: Record<string, unknown>): void {
  if (JSON_MODE) {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...data,
    };
    console.log(JSON.stringify(entry));
  } else {
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️ ' : '';
    const suffix = data ? ` ${JSON.stringify(data)}` : '';
    if (prefix) {
      console.log(`${prefix} ${msg}${suffix}`);
    } else {
      console.log(`${msg}${suffix}`);
    }
  }
}

function pegOutRowToParsed(row: any): ParsedPegOut {
  return {
    sidechainTxHash: row.sidechain_burn_tx_hash ?? row.sidechainBurnTxHash,
    ergoRecipientAddress: row.ergo_recipient_address ?? row.ergoRecipientAddress,
    amount: BigInt(row.amount_nanoerg ?? row.amountNanoErg ?? row.amount),
    user: row.user || '',
    sidechainBlockNumber: row.sidechain_burn_height ?? row.sidechainBurnHeight,
    sidechainBlockHash: row.sidechain_block_hash ?? row.sidechainBlockHash ?? undefined,
    sidechainLogIndex: row.sidechain_log_index ?? row.sidechainLogIndex ?? undefined,
  };
}

function pegOutRowLookup(row: any): PegOutEventLookup {
  const burnId = row.burn_id ?? row.burnId;
  if (burnId) return { burnId };
  const burnTxHash = row.sidechain_burn_tx_hash ?? row.sidechainBurnTxHash;
  const sidechainLogIndex = row.sidechain_log_index ?? row.sidechainLogIndex;
  return sidechainLogIndex === undefined || sidechainLogIndex === null
    ? burnTxHash
    : { burnTxHash, sidechainLogIndex };
}

function normalizeBurnTxHash(txHash: string): string {
  return (txHash.startsWith('0x') ? txHash.slice(2) : txHash).toLowerCase();
}

function assertFrontierBackingAgreementSnapshotJoin(
  snapshot: CompleteSidechainBackingSnapshot,
  agreement: Readonly<FrontierBackingReadAgreementSnapshot>,
): void {
  assertCompleteSidechainBackingSnapshotProvenance(snapshot);
  if (
    snapshot.pinnedHeight !== agreement.pinnedHeight
    || snapshot.pinnedBlockHashHex !== agreement.pinnedBlockHashHex
    || snapshot.totalSupplyNanoErg !== agreement.totalSupplyNanoErg
    || snapshot.inventory.scanFromHeight !== agreement.scanFromHeight
    || snapshot.inventory.observedCount !== agreement.observedPegOutCount
    || snapshot.inventory.entries.length !== agreement.pegOuts.length
  ) {
    throw new Error(
      'complete sidechain backing snapshot does not match its Frontier read agreement',
    );
  }
  for (let index = 0; index < agreement.pegOuts.length; index += 1) {
    const pegOut = agreement.pegOuts[index];
    const entry = snapshot.inventory.entries[index];
    const burnIdHex = deriveTrustlessBurnIdHex({
      sidechainIdHex: agreement.sidechainIdHex,
      sidechainTxHashHex: pegOut.sidechainTxHash,
      eventIndex: pegOut.sidechainLogIndex,
    });
    if (
      entry.burnIdHex !== burnIdHex
      || entry.sidechainIdHex !== agreement.sidechainIdHex
      || entry.sidechainTransactionHashHex !== pegOut.sidechainTxHash
      || entry.sidechainBlockHashHex !== pegOut.sidechainBlockHash
      || entry.sidechainLogIndex !== pegOut.sidechainLogIndex
      || entry.sidechainBurnHeight !== pegOut.sidechainBlockNumber
      || entry.amountNanoErg !== pegOut.amount
      || entry.ergoRecipientAddress !== pegOut.ergoRecipientAddress
      || entry.user !== pegOut.user
    ) {
      throw new Error(
        `complete sidechain backing entry ${index} does not match its Frontier read agreement`,
      );
    }
  }
}

function parseSubstrateHeaderHeight(value: string): number {
  if (!/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error('Substrate finalized header height must be canonical hex');
  }
  const height = Number.parseInt(value.slice(2), 16);
  if (!Number.isSafeInteger(height) || height < 0) {
    throw new Error('Substrate finalized header height exceeds the safe range');
  }
  return height;
}

// ─── Main Daemon ─────────────────────────────────────────────────

type AllowedErgoReadCycleDecision = Extract<
  ErgoReadCycleDecision,
  Readonly<{ decision: 'allow_read_cycle' }>
>;

class BridgeRelayerDaemon {
  private ergo: ErgoClient;
  private readonly storageRentErgo: ErgoClient;
  private readonly ergoReadQuorumSupervisor = new ErgoReadQuorumSupervisor({
    maxAgeMs: PROTOCOL_PARAMS.ergoReadQuorumMaxAgeMs,
  });
  private readonly ergoReadQuorumSources: ErgoReadQuorumSourcePair | null;
  private activeErgoReadCycleDecision: AllowedErgoReadCycleDecision | null = null;
  private aggregateSettlementRecoveryErgo: ErgoClient;
  private aggregateSettlementRecoveryWitness: AggregateSettlementErgoWitness | undefined;
  private authenticatedTrackerSources:
    readonly [AuthenticatedSpvTrackerNodeSource, AuthenticatedSpvTrackerNodeSource] | null;
  private sidechain: SidechainClient;
  private readonly sidechainBackingSources:
    FrontierBackingReadAgreementSources | null;
  private sidechainFinalityRpc: ReadOnlySubstrateFinalityRpc;
  private state: StateTracker;
  private readonly operatorAlertExternalOutbox:
    SqliteOperatorAlertExternalOutbox;
  private aggregateSettlement: AggregateSettlementService | null = null;
  private authenticatedSettlement: AuthenticatedSettlementPreparationFacade | null = null;
  private nativeCheckpointSettlementSource: NativeCheckpointSettlementSource | null = null;
  private authenticatedSettlementRevalidations = new Map<
    string,
    RevalidatedAuthenticatedSettlementCandidate
  >();
  private authenticatedTrackerHistoryReady = false;
  private authenticatedTrackerTipBoxId: string | null = null;
  private authenticatedTrackerTipDigestHex: string | null = null;
  private commitmentObservedAtMs: number | null = null;
  private commitmentObservedErgoHeight: number | null = null;
  private finalityObservedAtMs: number | null = null;
  private finalizedSidechainHeight: number | null = null;
  private finalityObservedSidechainHeight: number | null = null;
  private solvencyHealthState:
    'not_observed' | 'clear' | 'deficit' | 'unavailable' = 'not_observed';
  private solvencyObservedAtMs: number | null = null;
  private readonly operatorHealthPolicy =
    createBridgeDaemonOperatorHealthPolicy({
      pollingIntervalMs: PROTOCOL_PARAMS.pollingIntervalMs,
      ergoReadQuorumMaxAgeMs: PROTOCOL_PARAMS.ergoReadQuorumMaxAgeMs,
      commitmentMaxLagBlocks: 2,
      finalityMaxLagBlocks: PROTOCOL_PARAMS.confirmationDepth,
    });
  private lastOperatorHealthFingerprint: string | null = null;
  private deployed: DeployedState;
  private pegInDeployment: ActivePegInDeployment | null;
  private pegInCoordinator: PegInTransitionCoordinator | null = null;
  private pegInRuntimeReconciliation: PegInRuntimeReconciliationPass | null;
  private fundsReleaseHoldOpen = false;
  private fundsExecutionAuthorityHeld = false;
  // Exhaustively reconcile every mint-submitted row before the first lifecycle
  // selection after startup, and repeat the same barrier after an Ergo reorg.
  private pegInReorgReconciliationPending = true;
  private running = false;
  private tickInProgress = false;          // Guards graceful shutdown
  private cycleCount = 0;
  private startTime = Date.now();
  private consecutiveErrors = 0;
  private dupHeartbeatInFlight = false;
  // 🚨 CHAIN β DEFENSE: Track heights + header IDs for reorg detection
  // Header ID comparison catches same-height reorgs that height-only misses.
  private lastErgoHeight = 0;
  private lastErgoHeaderId: string | null = null;
  private lastSidechainHeight = 0;

  private stats = {
    pegInsProcessed: 0,
    pegOutsProcessed: 0,
    phase2Unlocks: 0,
    totalErrors: 0,
  };

  constructor() {
    this.deployed = loadDeployedState();
    this.ergo = new ErgoClient();
    this.storageRentErgo = new ErgoClient(
      ERGO_CONFIG.nodeUrl,
      {
        readOnly: true,
        direct: true,
        requestTimeoutMs: PROTOCOL_PARAMS.ergoReadQuorumMaxAgeMs,
        maxResponseBytes: STORAGE_RENT_MONITOR_MAX_RESPONSE_BYTES,
      },
    );
    const readQuorumConfig = getErgoReadQuorumSourceIdentityConfig();
    if (readQuorumConfig) {
      this.ergoReadQuorumSources = createErgoReadQuorumSources({
        primaryClient: new ErgoClient(
          ERGO_CONFIG.nodeUrl,
          {
            readOnly: true,
           direct: true,
           requestTimeoutMs: PROTOCOL_PARAMS.ergoReadQuorumMaxAgeMs,
            maxResponseBytes: STORAGE_RENT_MONITOR_MAX_RESPONSE_BYTES,
          },
        ),
        primaryNodeUrl: ERGO_CONFIG.nodeUrl,
        primaryNodeIdentityDigestHex:
          readQuorumConfig.primaryNodeIdentityDigestHex,
        primaryAdministrationIdentityDigestHex:
          readQuorumConfig.primaryAdministrationIdentityDigestHex,
        witnessClient: new ErgoClient(
          readQuorumConfig.witnessNodeUrl,
          {
            readOnly: true,
             direct: true,
             requestTimeoutMs: PROTOCOL_PARAMS.ergoReadQuorumMaxAgeMs,
              maxResponseBytes: STORAGE_RENT_MONITOR_MAX_RESPONSE_BYTES,
            },
        ),
        witnessNodeUrl: readQuorumConfig.witnessNodeUrl,
        witnessNodeIdentityDigestHex:
          readQuorumConfig.witnessNodeIdentityDigestHex,
        witnessAdministrationIdentityDigestHex:
          readQuorumConfig.witnessAdministrationIdentityDigestHex,
        maxProbeDurationMs: PROTOCOL_PARAMS.ergoReadQuorumMaxAgeMs,
      });
    } else {
      this.ergoReadQuorumSources = null;
    }
    this.aggregateSettlementRecoveryErgo = new ErgoClient(
      ERGO_CONFIG.nodeUrl,
      { readOnly: true, direct: true },
    );
    const aggregateSettlementWitnessNodeUrl = ERGO_CONFIG.aggregateSettlementWitnessNodeUrl;
    if (aggregateSettlementWitnessNodeUrl) {
      const sourceIdentity = getAggregateSettlementRecoverySourceIdentityConfig();
      if (!sourceIdentity) {
        throw new Error('aggregate settlement recovery witness source identities are unavailable');
      }
      const witnessErgo = new ErgoClient(
        aggregateSettlementWitnessNodeUrl,
        { readOnly: true, direct: true },
      );
      this.aggregateSettlementRecoveryWitness = createAggregateSettlementErgoWitness({
        primaryErgo: this.aggregateSettlementRecoveryErgo,
        primaryNodeUrl: ERGO_CONFIG.nodeUrl,
        primaryNodeIdentityDigestHex: sourceIdentity.primaryNodeIdentityDigestHex,
        primaryAdministrationIdentityDigestHex:
          sourceIdentity.primaryAdministrationIdentityDigestHex,
        witnessErgo,
        witnessNodeUrl: aggregateSettlementWitnessNodeUrl,
        witnessNodeIdentityDigestHex: sourceIdentity.witnessNodeIdentityDigestHex,
        witnessAdministrationIdentityDigestHex:
          sourceIdentity.witnessAdministrationIdentityDigestHex,
      });
    }
    const witnessNodeUrl = ERGO_CONFIG.authenticatedTrackerWitnessNodeUrl;
    if (witnessNodeUrl) {
      const primaryOrigin = canonicalNodeOrigin(ERGO_CONFIG.nodeUrl, 'ERGO_NODE_URL');
      const witnessOrigin = canonicalNodeOrigin(
        witnessNodeUrl,
        'ERGO_AUTHENTICATED_TRACKER_WITNESS_NODE_URL',
      );
      if (primaryOrigin === witnessOrigin) {
        throw new Error(
          'authenticated tracker primary and witness observations must use distinct node origins',
        );
      }
      this.authenticatedTrackerSources = [
        createBoundedAuthenticatedSpvTrackerReadOnlySource(ERGO_CONFIG.nodeUrl),
        createBoundedAuthenticatedSpvTrackerReadOnlySource(witnessNodeUrl),
      ];
    } else {
      this.authenticatedTrackerSources = null;
    }
    this.sidechain = new SidechainClient();
    const sidechainBackingConfig =
      getSidechainBackingSourceIdentityConfig();
    if (sidechainBackingConfig) {
      const solidity = this.deployed.solidity;
      if (
        !solidity?.bridgeAddress
        || !solidity.sergAddress
        || !solidity.evmChainId
      ) {
        throw new Error(
          'Frontier backing read agreement requires the reviewed runtime identity',
        );
      }
      const runtimeIdentity = loadReviewedPegInMintRuntimeIdentity(
        resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
      );
      this.sidechainBackingSources =
        createFrontierBackingReadAgreementSources({
          primaryClient: createBoundedFrontierBackingReadClient(
            SUBSTRATE_CONFIG.evmRpcUrl,
            solidity.bridgeAddress,
          ),
          primaryRpcUrl: SUBSTRATE_CONFIG.evmRpcUrl,
          primaryNodeIdentityDigestHex:
            sidechainBackingConfig.primaryNodeIdentityDigestHex,
          primaryAdministrationIdentityDigestHex:
            sidechainBackingConfig.primaryAdministrationIdentityDigestHex,
          witnessClient: createBoundedFrontierBackingReadClient(
            sidechainBackingConfig.witnessRpcUrl,
            solidity.bridgeAddress,
          ),
          witnessRpcUrl: sidechainBackingConfig.witnessRpcUrl,
          witnessNodeIdentityDigestHex:
            sidechainBackingConfig.witnessNodeIdentityDigestHex,
          witnessAdministrationIdentityDigestHex:
            sidechainBackingConfig.witnessAdministrationIdentityDigestHex,
          expectedChainId: solidity.evmChainId,
          expectedBridgeAddress: solidity.bridgeAddress,
          expectedBridgeCodeHashHex: runtimeIdentity.bridgeCodeHashHex,
          expectedSergAddress: solidity.sergAddress,
          expectedSergCodeHashHex: runtimeIdentity.sergCodeHashHex,
        });
    } else {
      this.sidechainBackingSources = null;
    }
    this.sidechainFinalityRpc = new ReadOnlySubstrateFinalityRpc(
      new BoundedHttpSubstrateRpcTransport(SUBSTRATE_CONFIG.evmRpcUrl),
    );
    this.state = new StateTracker();
    this.operatorAlertExternalOutbox =
      new SqliteOperatorAlertExternalOutbox(
        OPERATOR_ALERT_CONFIG.outboxDatabasePath,
      );
    this.fundsReleaseHoldOpen = this.state.getPegInCircuitBreakerState().open;
    this.pegInDeployment = resolveActivePegInDeployment(this.deployed);
    this.pegInRuntimeReconciliation = loadPegInRuntimeReconciliationFromEnvironment({
      stateTracker: this.state,
      deploymentBinding: this.pegInDeployment
        && this.deployed.solidity?.bridgeAddress
        && this.deployed.solidity.evmChainId
        && this.deployed.solidity.bridgeDeploymentBlock !== undefined
        ? {
          ...this.pegInDeployment,
          sidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex,
          bridgeAddress: this.deployed.solidity.bridgeAddress,
          frontierPrimaryRpcUrl: SUBSTRATE_CONFIG.evmRpcUrl,
          evmChainId: this.deployed.solidity.evmChainId,
          bridgeDeploymentBlock: this.deployed.solidity.bridgeDeploymentBlock,
          ergoCommitConfirmations: PROTOCOL_PARAMS.pegInCommitConfirmations,
          frontierRequiredConfirmations: PROTOCOL_PARAMS.confirmationDepth,
        }
        : null,
      environment: process.env,
    });
    const pegInSolidity = this.deployed.solidity;
    if (this.pegInDeployment && pegInSolidity?.evmChainId) {
      this.pegInCoordinator = new PegInTransitionCoordinator({
        ergo: this.ergo,
        sidechain: this.sidechain,
        state: this.state,
        vaultErgoTreeHex: this.pegInDeployment.vaultErgoTreeHex,
        commitConfirmations: PROTOCOL_PARAMS.pegInCommitConfirmations,
        verifyBlockTransactionCommitment:
          verifyErgoBlockTransactionCommitment,
        assertReadQuorumCurrent: boundary =>
          this.assertActiveErgoReadQuorumDecision(boundary),
      });
    }
    const authenticatedSettlementDeployed = Boolean(
      this.deployed.spvTrackerAuthenticated
      && this.deployed.doubleUnlockPreventionAuthenticated
      && this.deployed.mainChainAggregateUnlockAuthenticated,
    );
    if (authenticatedSettlementDeployed) {
      const nativeExecutionAuthority =
        loadNativeVerifierExecutionAuthorityFromEnvironment();
      this.nativeCheckpointSettlementSource =
        loadNativeCheckpointSettlementSourceFromEnvironment(
          process.env,
          nativeExecutionAuthority ?? undefined,
        );
    }
    if (PROTOCOL_PARAMS.aggregateSettlementEnabled || authenticatedSettlementDeployed) {
      const settlementService = new AggregateSettlementService({
        ergo: this.aggregateSettlementRecoveryErgo,
        state: this.state,
        deployed: this.deployed,
        sidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex,
        verifySidechainBurn: pegOut => this.verifySidechainBurnForSettlement(pegOut),
      });
      this.aggregateSettlement = PROTOCOL_PARAMS.aggregateSettlementEnabled
        ? settlementService
        : null;
      this.authenticatedSettlement = authenticatedSettlementDeployed
        ? createAuthenticatedSettlementPreparationFacade(settlementService)
        : null;
    }
  }

  private async waitForErgoReadQuorum(
    boundary: string,
  ): Promise<AllowedErgoReadCycleDecision> {
    for (;;) {
      const decision = await runErgoReadQuorumGate({
        supervisor: this.ergoReadQuorumSupervisor,
        sources: this.ergoReadQuorumSources,
        clock: Object.freeze({ now: () => Date.now() }),
      });
      if (decision.decision === 'allow_read_cycle') return decision;
      log(
        'error',
        'Ergo read quorum is unavailable; startup remains diagnostics-only',
        {
          boundary,
          state: decision.snapshot.state,
          reason: decision.snapshot.reason,
          consecutiveFailures: decision.snapshot.consecutiveFailures,
        },
      );
      this.emitOperatorHealthProjection('startup');
      await sleep(Math.max(1_000, PROTOCOL_PARAMS.pollingIntervalMs));
    }
  }

  private releaseFundsExecutionAuthority(): void {
    if (!this.fundsExecutionAuthorityHeld) return;
    this.fundsExecutionAuthorityHeld = false;
    this.state.releaseFundsExecutionAuthority();
  }

  private emitOperatorHealthProjection(
    source: 'startup' | 'cycle',
  ): void {
    try {
      const observedAtMs = Date.now();
      const readQuorumSnapshot =
        this.ergoReadQuorumSupervisor.peekSnapshot();
      const circuitBreaker = this.state.getPegInCircuitBreakerState();
      const projection = buildBridgeDaemonOperatorHealth({
        observedAtMs,
        policy: this.operatorHealthPolicy,
        state: this.state,
        signerAvailability: 'not_configured',
        readQuorumSnapshot,
        processFundsReleaseHoldOpen: this.fundsReleaseHoldOpen,
        circuitBreaker,
        solvency: {
          state: this.solvencyHealthState,
          observedAtMs: this.solvencyObservedAtMs,
        },
        commitment: {
          configured: Boolean(
            this.authenticatedSettlement
            && this.deployed.spvTrackerAuthenticated,
          ),
          ready: this.authenticatedTrackerHistoryReady,
          observedAtMs: this.commitmentObservedAtMs,
          observedErgoHeight: this.commitmentObservedErgoHeight,
          currentErgoHeight:
            readQuorumSnapshot.lastAcceptedObservation?.tipHeight
            ?? (this.lastErgoHeight > 0 ? this.lastErgoHeight : null),
        },
        finality: {
          observedAtMs: this.finalityObservedAtMs,
          finalizedSidechainHeight: this.finalizedSidechainHeight,
          currentSidechainHeight: this.finalityObservedSidechainHeight,
        },
        pegInReorgReconciliationPending:
          this.pegInReorgReconciliationPending,
      });
      const alertOutcome = runBridgeDaemonOperatorAlerts({
        projection,
        state: this.state,
        externalOutbox: this.operatorAlertExternalOutbox,
        nowMs: observedAtMs,
        writeLocalAlert: alert => {
          log(
            alert.transition === 'recovered'
              ? 'info'
              : alert.overall === 'held' ? 'error' : 'warn',
            'operator_alert',
            { source, alert },
          );
        },
      });
      if (
        alertOutcome === 'persistence_unavailable'
        || alertOutcome === 'state_conflict'
      ) {
        log('error', 'operator_alert_delivery_deferred', {
          source,
          outcome: alertOutcome,
        });
      }
      const fingerprint = operatorHealthStateFingerprint(projection);
      const periodicCycle = source === 'cycle' && this.cycleCount % 10 === 1;
      if (
        fingerprint === this.lastOperatorHealthFingerprint
        && !periodicCycle
      ) {
        return;
      }
      this.lastOperatorHealthFingerprint = fingerprint;
      log(
        projection.overall === 'held'
          ? 'error'
          : projection.overall === 'degraded'
            ? 'warn'
            : 'info',
        'operator_health',
        { source, health: projection },
      );
    } catch {
      log('error', 'operator_health_unavailable', {
        source,
        status: 'held',
      });
    }
  }

  private requireCurrentErgoReadQuorumDecision(
    decision: AllowedErgoReadCycleDecision,
    boundary: string,
  ): boolean {
    if (
      this.ergoReadQuorumSupervisor.isReadCycleDecisionCurrent(
        decision,
        Date.now(),
      )
    ) {
      return true;
    }
    log(
      'error',
      'Ergo read-quorum authorization expired; holding the remaining cycle fail-closed',
      { boundary },
    );
    return false;
  }

  private assertActiveErgoReadQuorumDecision(boundary: string): void {
    const decision = this.activeErgoReadCycleDecision;
    if (
      decision === null
      || !this.ergoReadQuorumSupervisor.isReadCycleDecisionCurrent(
        decision,
        Date.now(),
      )
    ) {
      throw new Error(
        `Ergo read-quorum authorization is unavailable at ${boundary}`,
      );
    }
  }

  async start(): Promise<void> {
    const broadcastReadiness = assertObservationOnlyDaemonBroadcastDisabled();
    const settlementReadiness = assertLiveSettlementStartupReadiness(PROTOCOL_PARAMS);

    log('info', '═══════════════════════════════════════════════════════════');
    log('info', '  Bridge Relayer Daemon v2 — Starting');
    log('info', '═══════════════════════════════════════════════════════════');

    log('info', `  ${broadcastReadiness.name}: ${broadcastReadiness.status} -- ${broadcastReadiness.message}`);
    log('info', `  ${settlementReadiness.name}: ${settlementReadiness.status} -- ${settlementReadiness.message}`);

    let startupReadQuorum = await this.waitForErgoReadQuorum(
      'sidechain initialization',
    );

    // Initialize sidechain connection only after the first dual-source probe.
    await this.sidechain.init();

    // Sidechain initialization can outlive the first lease. Re-probe before
    // establishing any mutable startup baseline or authority.
    startupReadQuorum = await this.waitForErgoReadQuorum(
      'startup reorg baseline',
    );
    const ergoHeight = startupReadQuorum.tip.height;
    const ergoHeaderId = startupReadQuorum.tip.headerIdHex;
    const sync = this.state.getSyncState();

    log('info', '  Ergo signer:        not configured (observation-only daemon)');
    log('info', `  Ergo height:        ${ergoHeight}`);
    log('info', `  Last synced Ergo:   ${sync.latestErgoHeight}`);
    log('info', `  Last synced SC:     ${sync.latestSidechainHeight}`);
    log('info', `  Poll interval:      ${PROTOCOL_PARAMS.pollingIntervalMs}ms`);
    log('info', `  Confirm depth:      ${PROTOCOL_PARAMS.confirmationDepth}`);
    log('info', `  Logging:            ${JSON_MODE ? 'JSON' : 'human-readable'}`);
    log('info', '═══════════════════════════════════════════════════════════\n');

    if (
      !this.requireCurrentErgoReadQuorumDecision(
        startupReadQuorum,
        'startup baseline mutation',
      )
    ) {
      throw new Error(
        'Ergo read-quorum authorization expired before startup baseline mutation',
      );
    }
    this.lastErgoHeight = ergoHeight;
    this.lastErgoHeaderId = ergoHeaderId;
    this.lastSidechainHeight = sync.latestSidechainHeight;
    this.state.acquireFundsExecutionAuthority();
    this.fundsExecutionAuthorityHeld = true;

    // 🚨 STARTUP RECONCILIATION: If the daemon was down during a reorg,
    // stale AVL keys may exist from Phase 1 TXs that were reorged away.
    // Run the MCU-verified reorg handler once to catch these.
    log('info', '  🔍 Startup MCU reconciliation...');
    try {
      if (
        !this.requireCurrentErgoReadQuorumDecision(
          startupReadQuorum,
          'startup reorg reconciliation',
        )
      ) {
        throw new Error(
          'Ergo read-quorum authorization expired before startup reorg reconciliation',
        );
      }
      await this.handleErgoReorg(ergoHeight);
    } catch (error) {
      this.releaseFundsExecutionAuthority();
      throw error;
    }

    this.running = true;

    // Graceful shutdown — waits for current tick to finish
    const shutdownHandler = async (signal: string) => {
      log('info', `\n⚡ ${signal} received — shutting down gracefully...`);
      this.running = false;

      // Wait for in-flight tick to finish (max 30s)
      const deadline = Date.now() + 30_000;
      while (this.tickInProgress && Date.now() < deadline) {
        await sleep(500);
      }

      if (this.tickInProgress) {
        log(
          'error',
          'Tick still in progress after 30s; retaining funds execution authority for reviewed recovery',
        );
        process.exit(1);
      }

      try {
        this.fundsExecutionAuthorityHeld = false;
        this.state.close();
        this.operatorAlertExternalOutbox.close();
      } catch (error: any) {
        log(
          'error',
          'State close retained funds execution authority for reviewed recovery',
          { error: error?.message ?? String(error) },
        );
        process.exit(1);
      }
      log('info', '🛑 Daemon stopped cleanly.', {
        uptime: `${Math.floor((Date.now() - this.startTime) / 1000)}s`,
        cycles: this.cycleCount,
        stats: this.stats,
      });
      process.exit(0);
    };

    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));

    // Main event loop
    while (this.running) {
      try {
        this.cycleCount++;
        this.tickInProgress = true;
        const start = Date.now();

        try {
          await this.tick();
        } finally {
          this.activeErgoReadCycleDecision = null;
          this.emitOperatorHealthProjection('cycle');
        }
        this.consecutiveErrors = 0;

        this.tickInProgress = false;
        const elapsed = Date.now() - start;
        const waitMs = Math.max(0, PROTOCOL_PARAMS.pollingIntervalMs - elapsed);
        if (waitMs > 0) await sleep(waitMs);
      } catch (err: any) {
        this.tickInProgress = false;
        this.consecutiveErrors++;
        this.stats.totalErrors++;

        // Exponential backoff: 10s, 20s, 40s... max 120s
        const backoff = Math.min(10_000 * Math.pow(2, this.consecutiveErrors - 1), 120_000);
        log('error', `Cycle ${this.cycleCount} error: ${err.message}`, {
          consecutiveErrors: this.consecutiveErrors,
          retryInMs: backoff,
        });
        await sleep(backoff);
      }
    }

    this.fundsExecutionAuthorityHeld = false;
    this.state.close();
    this.operatorAlertExternalOutbox.close();
    log('info', '\n🛑 Daemon stopped.');
  }

  /**
   * Re-check the sidechain burn receipt before aggregate settlement mutation.
   */
  private async verifySidechainBurnForSettlement(
    pegOut: ParsedPegOut,
  ): Promise<'confirmed' | 'reverted' | 'unknown'> {
    const bridgeAddress = this.deployed.solidity?.bridgeAddress;
    if (!bridgeAddress) {
      log('warn', 'Sidechain burn verification unavailable: deployed bridge address missing', {
        burnTx: pegOut.sidechainTxHash,
      });
      return 'unknown';
    }

    let receipt;
    try {
      receipt = await this.sidechain.getTransactionReceipt(pegOut.sidechainTxHash);
    } catch (err: any) {
      log('warn', `Sidechain burn verification unavailable: ${err.message}`, {
        burnTx: pegOut.sidechainTxHash,
      });
      return 'unknown';
    }

    if (!receipt) {
      const result = verifyPegOutBurnReceipt({
        pegOut,
        receipt,
        bridgeAddress,
        sidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex,
      });
      log('warn', 'Previously observed sidechain burn receipt disappeared', {
        burnTx: pegOut.sidechainTxHash,
      });
      return classifyPegOutBurnForSettlement(result);
    }

    let currentSidechainHeight: number;
    let canonicalBlockHash: string;
    try {
      currentSidechainHeight = await this.sidechain.getCurrentBlockNumber();
      const canonicalBlock = await this.sidechain.getBlock(receipt.blockNumber);
      if (!canonicalBlock?.hash) {
        log('warn', 'Sidechain burn verification unavailable: canonical block is unavailable', {
          burnTx: pegOut.sidechainTxHash,
          blockNumber: receipt.blockNumber,
        });
        return 'unknown';
      }
      canonicalBlockHash = canonicalBlock.hash;
    } catch (err: any) {
      log('warn', `Sidechain burn finality verification unavailable: ${err.message}`, {
        burnTx: pegOut.sidechainTxHash,
      });
      return 'unknown';
    }

    const result = verifyPegOutBurnReceipt({
      pegOut,
      receipt,
      bridgeAddress,
      canonicalBlockHash,
      sidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex,
      currentSidechainHeight,
      requiredSidechainConfirmations: PROTOCOL_PARAMS.confirmationDepth,
    });
    const status = classifyPegOutBurnForSettlement(result);
    if (status === 'confirmed') return status;

    log('warn', 'Sidechain burn verification failed', {
      burnTx: pegOut.sidechainTxHash,
      issues: result.errors,
      status,
    });
    return status;
  }

  private async recoverAggregateSettlementSubmissions(): Promise<void> {
    if (!this.aggregateSettlement) return;
    const result = await recoverAggregateSettlementAttempts({
      ergo: this.aggregateSettlementRecoveryErgo,
      witness: this.aggregateSettlementRecoveryWitness,
      state: this.state,
      log,
    });
    if (result.restoredBurns > 0 || result.missingPegOuts > 0) {
      log('info', 'Aggregate settlement journal recovery complete', { ...result });
    }
  }

  private async refreshAuthenticatedSpvTrackerHistory(): Promise<boolean> {
    const tracker = this.deployed.spvTrackerAuthenticated;
    if (!this.authenticatedSettlement || !tracker) return true;
    try {
      if (!this.authenticatedTrackerSources) {
        throw new Error(
          'authenticated tracker reconstruction requires ERGO_AUTHENTICATED_TRACKER_WITNESS_NODE_URL',
        );
      }
      if (!tracker.genesisBoxId) {
        throw new Error(
          'authenticated tracker reconstruction requires an immutable deployed genesisBoxId',
        );
      }
      const [primarySource, witnessSource] = this.authenticatedTrackerSources;
      const observedNetworkBefore = await readMatchingAuthenticatedSpvTrackerNodeNetwork(
        primarySource,
        witnessSource,
        this.deployed.network,
      );
      if (
        this.authenticatedTrackerHistoryReady
        && this.authenticatedTrackerTipBoxId
        && this.authenticatedTrackerTipDigestHex
      ) {
        const current =
          await observeAuthenticatedSpvTrackerTipCurrentOnIndependentSources({
            primarySource,
            witnessSource,
            trackerNftIdHex: tracker.nftId,
            trackerErgoTreeHex: tracker.ergoTreeHex,
            expectedSidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex,
            expectedTipBoxId: this.authenticatedTrackerTipBoxId,
            expectedTipDigestHex: this.authenticatedTrackerTipDigestHex,
          });
        if (current.current) {
          const observedNetworkAfter = await readMatchingAuthenticatedSpvTrackerNodeNetwork(
            primarySource,
            witnessSource,
            this.deployed.network,
          );
          if (observedNetworkBefore !== observedNetworkAfter) {
            throw new Error('Ergo node network identity changed during tracker tip revalidation');
          }
          this.commitmentObservedAtMs = Date.now();
          this.commitmentObservedErgoHeight = current.observedErgoHeight;
          return true;
        }
      }
      const reconstruction = await reconstructAuthenticatedSpvTrackerHistoryFromIndependentSources({
        primarySource,
        witnessSource,
        trackerNftIdHex: tracker.nftId,
        trackerErgoTreeHex: tracker.ergoTreeHex,
        expectedSidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex,
        expectedGenesisBoxIdHex: tracker.genesisBoxId,
      });
      const observedNetworkAfter = await readMatchingAuthenticatedSpvTrackerNodeNetwork(
        primarySource,
        witnessSource,
        this.deployed.network,
      );
      if (observedNetworkBefore !== observedNetworkAfter) {
        throw new Error('Ergo node network identity changed during tracker reconstruction');
      }
      const replacement = this.state.replaceAuthenticatedSpvTrackerHistory(reconstruction);
      this.authenticatedTrackerHistoryReady = true;
      this.authenticatedTrackerTipBoxId = reconstruction.tipBoxId;
      this.authenticatedTrackerTipDigestHex = reconstruction.tipDigestHex;
      this.commitmentObservedAtMs = Date.now();
      this.commitmentObservedErgoHeight = reconstruction.observedTip.height;
      if (replacement.changed) {
        this.authenticatedSettlementRevalidations.clear();
        log('info', 'Reconstructed authenticated tracker history from independent Ergo observations', {
          trackerTipBoxId: reconstruction.tipBoxId,
          entries: replacement.currentEntries,
          previousEntries: replacement.previousEntries,
          invalidatedCandidates: replacement.invalidatedCandidates,
          observedErgoTip: reconstruction.observedTip.height,
        });
      }
      return true;
    } catch (err: any) {
      this.authenticatedTrackerHistoryReady = false;
      this.authenticatedTrackerTipBoxId = null;
      this.authenticatedTrackerTipDigestHex = null;
      this.authenticatedSettlementRevalidations.clear();
      const errorMessage = String(err?.message ?? 'unknown reconstruction error')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 900) || 'unknown reconstruction error';
      const invalidatedCandidates = this.state.invalidateActiveAuthenticatedSettlementCandidates(
        `authenticated tracker chain reconstruction failed: ${errorMessage}`,
      );
      log('warn', 'Authenticated V2 settlement is fail-closed until tracker history reconstructs', {
        error: errorMessage,
        invalidatedCandidates,
      });
      return false;
    }
  }

  private async reconcileAuthenticatedSettlementCandidates(): Promise<void> {
    await runAuthenticatedSettlementCandidateReconciliation({
      state: this.state,
      ergo: this.ergo,
      revalidations: this.authenticatedSettlementRevalidations,
      observeBurn: pegOut => this.verifySidechainBurnForSettlement(pegOut),
      recollect: async (candidate, parsedPegOut) => {
        if (!this.authenticatedSettlement || !this.nativeCheckpointSettlementSource) {
          log('info', 'Authenticated V2 candidate waiting for restart-safe native revalidation', {
            candidateId: candidate.candidateId,
          });
          return null;
        }
        const trackerIdentity = this.state.getAuthenticatedSpvTrackerIdentityByHeight(
          parsedPegOut.sidechainBlockNumber,
          candidate.sidechainId,
        );
        const bridgeAddress = this.deployed.solidity?.bridgeAddress;
        if (!trackerIdentity || !bridgeAddress) {
          log('warn', 'Authenticated V2 candidate revalidation prerequisites are unavailable', {
            candidateId: candidate.candidateId,
            trackerIdentityAvailable: Boolean(trackerIdentity),
            bridgeAddressAvailable: Boolean(bridgeAddress),
          });
          return null;
        }
        return recollectAndRevalidateAuthenticatedSettlementCandidate({
          candidate,
          pegOut: parsedPegOut,
          trackerIdentity,
          trackerHistory: this.state.getAuthenticatedSpvTrackerHistory(candidate.sidechainId),
          sidechainIdHex: candidate.sidechainId,
          bridgeAddress,
          frontierProvider: this.sidechain.getFrontierBurnProofProvider(),
          nativeCheckpointSource: this.nativeCheckpointSettlementSource,
          settlementService: this.authenticatedSettlement,
        });
      },
      log,
    });
  }

  private async scheduleSubstrateFederatedCandidates(
    ergoHeight: number,
    ergoHeaderIdHex: string,
    completeInventory: Readonly<CompletePegOutBackingInventoryResult>,
  ): Promise<void> {
    const profile = ACTIVE_SUBSTRATE_FEDERATED_DAEMON_SCHEDULING_PROFILE_V1;
    if (profile === null) return;
    const lifecycle = await runSubstrateFederatedPreReleaseContainmentV1({
      profile,
      collectCycle: async () => {
        const sidechainFinalizedNativeBlockHashHex =
          await requestSubstrateFinalizedHeadHash(this.sidechainFinalityRpc);
        const sidechainFinalizedNativeHeader =
          await requestSubstrateHeaderObservation(
            this.sidechainFinalityRpc,
            sidechainFinalizedNativeBlockHashHex,
          );
        return {
          ergoHeight,
          ergoHeaderIdHex,
          sidechainFinalizedNativeHeight:
            Number(BigInt(sidechainFinalizedNativeHeader.number)),
          sidechainFinalizedNativeBlockHashHex,
          pegOutObservationComplete: true,
        };
      },
      ...(this.state.getPegInCircuitBreakerState().continuityRecoveryRequired
        ? {
            reconstructNonAuthorizingState: async cycle => {
              await reconstructSubstrateFederatedDatabaseLossStateV1({
                cycle: {
                  ...cycle,
                  sidechainFinalizedExecutionBlockHashHex:
                    completeInventory.pinnedBlockHashHex,
                },
                state: this.state,
                collectCompleteBurnInventory: async () => ({
                  scanFromHeight: completeInventory.scanFromHeight,
                  pinnedHeight: completeInventory.pinnedHeight,
                  pinnedBlockHashHex: completeInventory.pinnedBlockHashHex,
                  entries: completeInventory.entries,
                }),
              });
            },
          }
        : {}),
      record: observation => {
        log('info', 'Prepared non-authorizing federated bridge work', {
          profileId: observation.profileIdHex,
          familyId: observation.familyIdHex,
          mintCandidateId: observation.mintCandidateId,
          burnCandidateId: observation.burnCandidateId,
          settlementTransactionId:
            observation.settlementTransactionIdHex,
          mintObservationDigest:
            observation.mintObservationDigestHex,
          burnRevalidationDigest:
            observation.burnRevalidationDigestHex,
          localRecordAuthoritative: false,
          mintAuthorized: false,
          payoutAuthorized: false,
          broadcastAuthorized: false,
        });
      },
      incidents: {
        latchProcessHold: () => {
          this.fundsReleaseHoldOpen = true;
        },
        persistHold: incident => {
          this.state.holdFundsReleaseForOperatorReview(
            `${incident.reason}; failure digest ${incident.failureDigestHex}`,
          );
        },
      },
    });
    if (lifecycle.status === 'held_non_authorizing') {
      log('error', 'LOCAL FUNDS-RELEASE HOLD: federated lifecycle failed closed', {
        failureStage: lifecycle.incident.failureStage,
        failureDigest: lifecycle.incident.failureDigestHex,
      });
    }
  }

  private isFundsReleaseHeld(): boolean {
    if (this.fundsReleaseHoldOpen || this.pegInReorgReconciliationPending) {
      return true;
    }
    try {
      if (this.state.getPegInCircuitBreakerState().open) {
        this.fundsReleaseHoldOpen = true;
      }
    } catch (error) {
      this.fundsReleaseHoldOpen = true;
      log('error', 'LOCAL FUNDS-RELEASE HOLD: durable safety state is unreadable', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return this.fundsReleaseHoldOpen;
  }

  /**
   * Single tick of the event loop — runs all four watchers.
   */
  private async tick(): Promise<void> {
    const readQuorum = await runErgoReadQuorumGate({
      supervisor: this.ergoReadQuorumSupervisor,
      sources: this.ergoReadQuorumSources,
      clock: Object.freeze({ now: () => Date.now() }),
    });
    if (readQuorum.decision !== 'allow_read_cycle' || readQuorum.tip === null) {
      log(
        'error',
        'Ergo read quorum is unavailable; holding this cycle fail-closed',
        {
          state: readQuorum.snapshot.state,
          reason: readQuorum.snapshot.reason,
          consecutiveFailures: readQuorum.snapshot.consecutiveFailures,
        },
      );
      return;
    }
    this.activeErgoReadCycleDecision = readQuorum;
    const ergoHeight = readQuorum.tip.height;
    const currentErgoHeaderId = readQuorum.tip.headerIdHex;
    if (
      !this.requireCurrentErgoReadQuorumDecision(
        readQuorum,
        'sidechain tip observation',
      )
    ) return;
    const sidechainHeight = await this.sidechain.getCurrentBlockNumber();
    if (
      !this.requireCurrentErgoReadQuorumDecision(
        readQuorum,
        'reorg evaluation',
      )
    ) return;

    // ═══════════════════════════════════════════════════════════════
    //  🚨 CHAIN β DEFENSE: Reorg Detection
    //  Trigger conditions:
    //    1. Height DECREASE: classic reorg (chain tip rolled back)
    //    2. Header ID CHANGE at lastErgoHeight: same-height or
    //       advancing-height reorg (tip replaced without rollback)
    //  Both must be checked BEFORE processing any new events.
    // ═══════════════════════════════════════════════════════════════
    let ergoReorgDetected = false;
    let ergoReorgCheckUnavailable = false;

    if (this.lastErgoHeight > 0 && ergoHeight < this.lastErgoHeight) {
      log('error', `🚨🚨🚨 ERGO REORG (height drop): ${this.lastErgoHeight} → ${ergoHeight} (depth: ${this.lastErgoHeight - ergoHeight})`);
      ergoReorgDetected = true;
    } else if (this.lastErgoHeight > 0 && this.lastErgoHeaderId) {
      // Same-height or advancing reorg: verify the header at
      // lastErgoHeight hasn't been replaced by a competing chain.
      try {
        const currentHeaderAtLastHeight = this.lastErgoHeight === ergoHeight
          ? currentErgoHeaderId
          : await this.ergo.getBlockHeaderHash(this.lastErgoHeight);
        if (currentHeaderAtLastHeight !== this.lastErgoHeaderId) {
          log('error', `🚨🚨🚨 ERGO REORG (header changed at height ${this.lastErgoHeight}): ${this.lastErgoHeaderId.slice(0, 16)}... → ${currentHeaderAtLastHeight.slice(0, 16)}...`);
          ergoReorgDetected = true;
        }
      } catch (err: any) {
        log('warn', `Cannot verify header at height ${this.lastErgoHeight}: ${err.message}`);
        ergoReorgCheckUnavailable = true;
      }
    }

    if (ergoReorgCheckUnavailable) {
      log(
        'error',
        'Ergo reorg check is unavailable; preserving the prior baseline and holding this cycle fail-closed',
      );
      return;
    }

    if (ergoReorgDetected) {
      if (
        !this.requireCurrentErgoReadQuorumDecision(
          readQuorum,
          'Ergo reorg containment',
        )
      ) return;
      const invalidatedCandidates = this.state.invalidateActiveAuthenticatedSettlementCandidates(
        `Ergo reorg detected at observed height ${ergoHeight}; selected V2 inputs or anchor may be stale`,
      );
      this.authenticatedSettlementRevalidations.clear();
      if (invalidatedCandidates > 0) {
        log('warn', 'Invalidated authenticated settlement candidates after Ergo reorg', {
          invalidatedCandidates,
        });
      }
      if (
        !this.requireCurrentErgoReadQuorumDecision(
          readQuorum,
          'Ergo reorg reconciliation',
        )
      ) return;
      await this.handleErgoReorg(ergoHeight);
    } else if (this.pegInReorgReconciliationPending) {
      if (
        !this.requireCurrentErgoReadQuorumDecision(
          readQuorum,
          'pending peg-in reorg reconciliation',
        )
      ) return;
      this.pegInReorgReconciliationPending = !(
        await this.reconcilePegIns(ergoHeight, true)
      );
    }

    const sidechainRollback = evaluateSidechainRollback(
      this.lastSidechainHeight,
      sidechainHeight,
    );
    if (sidechainRollback.rollbackDetected) {
      if (
        !this.requireCurrentErgoReadQuorumDecision(
          readQuorum,
          'sidechain rollback containment',
        )
      ) return;
      log('error', `🚨🚨🚨 SIDECHAIN REORG DETECTED: ${this.lastSidechainHeight} → ${sidechainHeight} (depth: ${this.lastSidechainHeight - sidechainHeight})`);
      // Sidechain reorg: pause peg-out processing for one cycle. The retired
      // SCS mutation path cannot move state; observation waits for recovery.
      log('warn', '   ⏸️  Pausing peg-out processing until sidechain height recovers');
      const invalidatedCandidates = this.state.invalidateActiveAuthenticatedSettlementCandidates(
        `sidechain rollback below observed high-water height ${this.lastSidechainHeight}`,
      );
      this.authenticatedSettlementRevalidations.clear();
      if (invalidatedCandidates > 0) {
        log('warn', 'Invalidated authenticated settlement candidates after sidechain rollback', {
          invalidatedCandidates,
        });
      }
    }

    // Update tracking state for next tick
    if (
      !this.requireCurrentErgoReadQuorumDecision(
        readQuorum,
        'cycle baseline mutation',
      )
    ) return;
    this.lastErgoHeight = ergoHeight;
    this.lastErgoHeaderId = currentErgoHeaderId;
    this.lastSidechainHeight = sidechainRollback.highWaterHeight;

    // Log every 10th cycle to reduce noise
    if (this.cycleCount % 10 === 1) {
      log('info', `[${new Date().toISOString()}] cycle=${this.cycleCount} ergoH=${ergoHeight} scH=${sidechainHeight}`, {
        uptime: `${Math.floor((Date.now() - this.startTime) / 1000)}s`,
        stats: this.stats,
      });
    }

    // A. Peg-In: Detect MCL locks → mint sERG
    // Confirm any DUP heartbeat TXs before generating new AVL proofs.
    if (
      !this.requireCurrentErgoReadQuorumDecision(
        readQuorum,
        'DUP heartbeat confirmation',
      )
    ) return;
    await this.confirmPendingDupHeartbeats(ergoHeight);
    if (
      !this.requireCurrentErgoReadQuorumDecision(
        readQuorum,
        'aggregate settlement recovery',
      )
    ) return;
    await this.recoverAggregateSettlementSubmissions();
    if (
      !this.requireCurrentErgoReadQuorumDecision(
        readQuorum,
        'authenticated tracker reconstruction',
      )
    ) return;
    const authenticatedTrackerHistoryReady = await this.refreshAuthenticatedSpvTrackerHistory();
    if (authenticatedTrackerHistoryReady) {
      if (
        !this.requireCurrentErgoReadQuorumDecision(
          readQuorum,
          'authenticated settlement candidate reconciliation',
        )
      ) return;
      await this.reconcileAuthenticatedSettlementCandidates();
    }

    if (this.pegInReorgReconciliationPending) {
      log(
        'error',
        'Peg-in lifecycle selection held until every mint-submitted row is conclusively reconciled after startup or an Ergo reorg',
      );
    } else {
      if (
        !this.requireCurrentErgoReadQuorumDecision(
          readQuorum,
          'peg-in lifecycle selection',
        )
      ) return;
      await this.processPegIns(ergoHeight);
    }

    // B. Peg-Out: Detect burns -> authenticated candidate or fail-closed hold
    // The persisted scan cursor may advance only when this observation pass
    // completes. Otherwise a transient RPC failure could make the next tick
    // skip burns that already reduced sidechain supply.
    let completePegOutInventory:
      Readonly<CompletePegOutBackingInventoryResult> | null = null;
    const dupOperationalQuarantine =
      this.state.getQuarantinedErgoOperationalTransactionAttempts(
        DUP_HEARTBEAT_OPERATION_PROFILE,
      );
    if (dupOperationalQuarantine.length > 0) {
      log(
        'error',
        'DUP operational history is quarantined; peg-out processing remains fail-closed',
        { quarantinedAttempts: dupOperationalQuarantine.length },
      );
    } else if (this.dupHeartbeatInFlight) {
      log(
        'warn',
        'DUP operational state is awaiting final reconciliation; peg-out processing remains fail-closed',
      );
    } else if (sidechainRollback.pegOutProcessingAllowed) {
      if (
        !this.requireCurrentErgoReadQuorumDecision(
          readQuorum,
          'peg-out lifecycle selection',
        )
      ) return;
      completePegOutInventory = await this.processPegOuts(
        sidechainHeight,
        ergoHeight,
        readQuorum,
      );
      if (completePegOutInventory !== null) {
        await this.scheduleSubstrateFederatedCandidates(
          ergoHeight,
          currentErgoHeaderId,
          completePegOutInventory,
        );
      }
    }

    // C. Reconcile historical SCS updates and observe finality read-only.
    if (
      !this.requireCurrentErgoReadQuorumDecision(
        readQuorum,
        'SCS oracle lifecycle',
      )
    ) return;
    await this.updateSCSOracle(sidechainHeight, ergoHeight);

    // D. Phase 2: Check pending unlocks
    if (
      !this.requireCurrentErgoReadQuorumDecision(
        readQuorum,
        'phase-two unlock lifecycle',
      )
    ) return;
    await this.processPhase2Unlocks(ergoHeight);

    // E. Storage Rent: Monitor box ages (runs every 1000 cycles to reduce noise)
    if (this.cycleCount % 1000 === 0) {
      if (
        !this.requireCurrentErgoReadQuorumDecision(
          readQuorum,
          'storage-rent monitoring',
        )
      ) return;
      await this.storageRentCheck(readQuorum);
    }

    // F. MainChainLock fragmentation observation (runs every 500 cycles).
    // These source boxes expose only commit/refund transitions. A generic
    // consolidation transaction would bypass their contract-defined lifecycle.
    if (this.cycleCount % 500 === 0) {
      if (
        !this.requireCurrentErgoReadQuorumDecision(
          readQuorum,
          'MainChainLock fragmentation observation',
        )
      ) return;
      await this.observeMainChainLockFragmentation();
    }

    // G. 🚨 CHAIN θ DEFENSE: Reconcile peg-in states (every 100 cycles)
    // Verifies that peg-ins marked 'minted' in SQLite are actually confirmed
    // on the EVM. Catches phantom mints caused by EVM reorgs.
    if (this.cycleCount % 100 === 0) {
      if (
        !this.requireCurrentErgoReadQuorumDecision(
          readQuorum,
          'periodic peg-in reconciliation',
        )
      ) return;
      await this.reconcilePegIns(ergoHeight);
    }

    // Update sync state
    if (
      !this.requireCurrentErgoReadQuorumDecision(
        readQuorum,
        'sync-state mutation',
      )
    ) return;
    persistPegOutObservationCursor(this.state, {
      ergoHeight,
      observedSidechainHeight:
        completePegOutInventory?.pinnedHeight ?? sidechainHeight,
      observationComplete: completePegOutInventory !== null,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  A. PEG-IN: Detect MCL deposits → mint sERG
  // ═══════════════════════════════════════════════════════════════

  // 🚨 CHAIN ε DEFENSE: Minimum peg-in threshold.
  // Micro-deposits (< 0.01 ERG) cost more in consolidation sweep fees than they're
  // worth. An attacker creating thousands of micro-deposits drains the relayer's
  // hot wallet via sweep fees without locking meaningful TVL.
  static readonly MINIMUM_PEGIN_NANOERG = 10_000_000n; // 0.01 ERG

  private async processPegIns(ergoHeight: number): Promise<void> {
    const minConfirmations = PROTOCOL_PARAMS.pegInCommitConfirmations;
    const activeAddress = this.pegInDeployment?.lockAddress;
    const legacyAddresses = new Set<string>();
    if (!activeAddress) legacyAddresses.add(this.deployed.mainChainLock.address);
    for (const legacy of this.deployed.legacyMainChainLocks ?? []) {
      legacyAddresses.add(legacy.address);
    }
    for (const field of ['mainChainLock_v1_deprecated', 'mainChainLock_v2_deprecated']) {
      const address = (this.deployed as any)[field]?.address;
      if (address) legacyAddresses.add(address);
    }
    if (activeAddress) legacyAddresses.delete(activeAddress);

    const registerCandidates = async (
      address: string,
      classification: 'active_committed_vault' | 'legacy_unminted_refundable',
    ) => {
      const candidates = await this.ergo.scanForPegIns(address, minConfirmations, ergoHeight);
      for (const pegIn of candidates) {
        if (!pegIn.hasValidRegisters) {
          log('warn', `   Skipping malformed peg-in ${pegIn.boxId.slice(0, 16)}... (requires R4-R7)`);
          continue;
        }
        if (pegIn.amountNanoErg < BridgeRelayerDaemon.MINIMUM_PEGIN_NANOERG) {
          log('warn', `   Skipping micro peg-in ${pegIn.boxId.slice(0, 16)}...`);
          continue;
        }
        this.state.insertPegIn(
          pegIn.boxId,
          pegIn.targetEvmAddress,
          pegIn.amountNanoErg,
          pegIn.creationHeight,
          classification,
          pegIn.depositorErgoTreeHex,
        );
      }
    };

    if (activeAddress) {
      await registerCandidates(activeAddress, 'active_committed_vault');
    }
    for (const address of legacyAddresses) {
      await registerCandidates(address, 'legacy_unminted_refundable');
    }

    const reconciliationBoundary = await this.reconcilePegInsBeforeLifecycleSelection();
    if (!reconciliationBoundary.lifecycleSelectionAuthorized) return;

    // Immutable v1/v2 boxes are inventory only. They can never enter the new
    // mint path. A still-refundable box that was already minted opens the
    // circuit and requires explicit migration/incident handling.
    for (const pegIn of this.state.getPendingPegIns()) {
      if (
        pegIn.sourceClassification === 'active_committed_vault' ||
        pegIn.sourceClassification === 'legacy_already_consumed'
      ) {
        continue;
      }
      try {
        const sourceBox = await this.ergo.getBoxByIdOrNull(pegIn.ergoLockBoxId);
        const processed = await this.sidechain.isBoxProcessed(pegIn.ergoLockBoxId);
        const classification = classifyLegacyPegIn(!!sourceBox, processed);
        if (classification === 'legacy_minted_requires_migration') {
          this.fundsReleaseHoldOpen = true;
        }
        this.state.updatePegInClassification(pegIn.ergoLockBoxId, classification);
        if (classification === 'legacy_minted_requires_migration') {
          const reason = 'legacy peg-in is minted while its source remains refundable';
          this.state.markPegInIncident(pegIn.ergoLockBoxId, {
            kind: 'legacy_refundable_after_mint',
            reason,
          });
          log('error', `LOCAL FUNDS-RELEASE HOLD: ${reason}`, { boxId: pegIn.ergoLockBoxId });
        }
      } catch (err: any) {
        log('warn', `Legacy peg-in classification deferred: ${err.message}`, {
          boxId: pegIn.ergoLockBoxId,
        });
      }
    }

    if (!this.pegInCoordinator || !this.pegInDeployment) {
      if (this.cycleCount % 100 === 1) {
        log('warn', 'Peg-in minting disabled: committed-vault-v3 deployment metadata is absent');
      }
      return;
    }
    if (this.isFundsReleaseHeld()) {
      log('error', 'Peg-in processing halted by the local funds-release hold');
      return;
    }

    // Process historical rows sequentially so observation, reconciliation,
    // incident persistence, and restart behavior remain deterministic.
    for (const pegIn of this.state.getPendingPegIns()) {
      if (pegIn.sourceClassification !== 'active_committed_vault') continue;

      try {
        if (pegIn.status === 'detected' || pegIn.status === 'confirmed') {
          if (this.cycleCount % 100 === 1) {
            log('warn', 'Peg-in deposit remains refundable while authenticated V4 mint authority is unavailable', {
              boxId: pegIn.ergoLockBoxId,
            });
          }
          continue;
        }

        const result = await this.pegInCoordinator.advance(pegIn, ergoHeight);
        if (result.status === 'minted') {
          this.stats.pegInsProcessed++;
        } else if (result.status === 'incident') {
          this.fundsReleaseHoldOpen = true;
        }
        if (result.status !== 'pending') {
          log(
            result.status === 'invalid' || result.status === 'incident' ? 'error' : 'info',
            'Peg-in committed-vault transition result',
            { boxId: pegIn.ergoLockBoxId, ...result },
          );
        }
        if (result.status === 'incident') {
          break;
        }
      } catch (error) {
        if (error instanceof PegInIncidentPersistenceError) {
          this.fundsReleaseHoldOpen = true;
          log(
            'error',
            'LOCAL FUNDS-RELEASE HOLD: lifecycle incident persistence failed',
            {
              boxId: pegIn.ergoLockBoxId,
              error: error.message,
            },
          );
          break;
        }
        throw error;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  A.1 PEG-IN: Fresh joined recollection before lifecycle selection
  // ═══════════════════════════════════════════════════════════════

  private async reconcilePegInsBeforeLifecycleSelection(): Promise<{
    lifecycleSelectionAuthorized: boolean;
  }> {
    if (!this.pegInRuntimeReconciliation) {
      if (this.cycleCount % 100 === 1) {
        log(
          'warn',
          'Peg-in lifecycle selection disabled: runtime joined recollection is not configured',
        );
      }
      return { lifecycleSelectionAuthorized: false };
    }
    try {
      const report = await this.pegInRuntimeReconciliation.run();
      if (report.candidatesObserved > 0) {
        log('warn', 'Peg-in lifecycle rows placed under reconciliation hold', {
          candidatesObserved: report.candidatesObserved,
          journalEntriesAppended: report.journalEntriesAppended,
          joinedReconstructionDigestHex: report.joinedReconstructionDigestHex,
          nativeGrandpaFinalityAccepted: report.nativeGrandpaFinalityAccepted,
        });
      }
      return {
        lifecycleSelectionAuthorized: report.lifecycleSelectionAuthorized,
      };
    } catch (error) {
      log('error', 'Peg-in runtime reconciliation failed closed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { lifecycleSelectionAuthorized: false };
    }
  }

  //  B. PEG-OUT: Detect burns -> authenticated candidate or fail-closed hold
  private async processPegOuts(
    sidechainHeight: number,
    ergoHeight: number,
    readQuorumDecision: AllowedErgoReadCycleDecision,
  ): Promise<Readonly<CompletePegOutBackingInventoryResult> | null> {
    // Reconstruct the complete event inventory at the pinned block. The local
    // cursor remains retry/progress metadata only: using it as the scan start
    // would let a missing historical SQLite row remove a pending liability.
    let backingReadAgreement: Readonly<FrontierBackingReadAgreementSnapshot>;
    let backingInventoryObservation:
      Readonly<SubstrateFederatedDatabaseLossInventoryObservationV1>;
    try {
      if (!this.sidechainBackingSources) {
        throw new Error(
          'complete peg-out backing observation requires the configured Frontier witness',
        );
      }
      const bridgeAddress = this.deployed.solidity?.bridgeAddress;
      if (!bridgeAddress) {
        throw new Error(
          'complete peg-out backing observation requires the reviewed bridge address',
        );
      }
      backingReadAgreement = await observeFrontierBackingReadAgreement({
        sources: this.sidechainBackingSources,
        sidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex,
        bridgeAddress,
      });
      backingInventoryObservation =
        projectSubstrateFederatedDatabaseLossInventoryObservationV1({
          sources: this.sidechainBackingSources,
          snapshot: backingReadAgreement,
        });
    } catch (error) {
      this.holdFundsReleaseForUnavailableBackingAlarm(
        `complete peg-out backing observation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      log('warn', 'Peg-out backing observation failed; preserving the prior scan cursor', {
        fromBlock: 0,
        toBlock: sidechainHeight,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
    const backingPinnedHeight = backingInventoryObservation.pinnedHeight;
    const inventoryEntries = backingInventoryObservation.entries;

    let inventoryResult: CompletePegOutBackingInventoryResult;
    try {
      inventoryResult = reconcileCompletePegOutBackingInventory({
        entries: inventoryEntries,
        persistence: createPegOutBackingInventoryPersistence(this.state),
        scanFromHeight: backingInventoryObservation.scanFromHeight,
        pinnedHeight: backingInventoryObservation.pinnedHeight,
        pinnedBlockHashHex: backingInventoryObservation.pinnedBlockHashHex,
      });
    } catch (error) {
      this.holdFundsReleaseForUnavailableBackingAlarm(
        `complete peg-out inventory reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      log('error', 'Peg-out inventory reconciliation failed closed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
    const inventoryByBurnId = new Map(
      inventoryEntries.map(entry => [entry.burnIdHex, entry] as const),
    );
    for (const burnIdHex of inventoryResult.insertedBurnIds) {
      const entry = inventoryByBurnId.get(burnIdHex);
      if (!entry) {
        throw new Error(`inserted peg-out inventory identity ${burnIdHex} is unavailable`);
      }
      log('info', `\n🔥 PEG-OUT detected: ${entry.sidechainTransactionHashHex.slice(0, 18)}...`, {
        amount: Number(entry.amountNanoErg) / 1e9,
        user: entry.user,
        block: entry.sidechainBurnHeight,
      });
    }
    try {
      if (!this.sidechainBackingSources) {
        throw new Error('Frontier backing read-agreement sources are unavailable');
      }
      await revalidateFrontierBackingReadAgreementPin(
        this.sidechainBackingSources,
        backingReadAgreement,
      );
      assertFrontierBackingReadAgreementProvenance(
        this.sidechainBackingSources,
        backingReadAgreement,
      );
    } catch (error) {
      this.holdFundsReleaseForUnavailableBackingAlarm(
        `Frontier backing pin revalidation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      log('error', 'Peg-out backing pin changed before the backing decision', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
    const sidechainBackingSnapshot = createCompleteSidechainBackingSnapshot({
      inventory: inventoryResult,
      totalSupplyNanoErg: backingReadAgreement.totalSupplyNanoErg,
    });

    // The liability projection must consume the complete current burn scan.
    // Evaluating it before observation can let a supply-reducing burn hide an
    // existing backing deficit for the candidate selected in the same tick.
    if (!this.requireCurrentErgoReadQuorumDecision(
      readQuorumDecision,
      'solvency alarm evaluation',
    )) return null;
    await this.checkSolvencyInvariant(
      readQuorumDecision,
      sidechainBackingSnapshot,
      backingReadAgreement,
    );

    if (this.isFundsReleaseHeld()) {
      log(
        'error',
        'Peg-out settlement held locally; burn observations remain recorded but no value-release candidate may advance',
      );
      return inventoryResult;
    }

    // Evaluate at most one burn per cycle. Authenticated V2 may prepare a
    // non-signing candidate; every other new payout path remains held.
    const pendingPhase1 = this.state.getPendingPegOuts()
      .filter((po: any) => po.status === 'detected' || po.status === 'confirmed');

    const activeAggregateBurns = this.aggregateSettlement
      ? getActiveAggregateSettlementAttemptBurnTxHashes(
        this.state.getRecoverableAggregateSettlementAttempts(),
      )
      : new Set<string>();
    const eligiblePendingPhase1 = pendingPhase1.filter((po: any) => {
      const rowBurnTxHash = po.sidechain_burn_tx_hash ?? po.sidechainBurnTxHash;
      return !activeAggregateBurns.has(normalizeBurnTxHash(rowBurnTxHash));
    });
    if (pendingPhase1.length > eligiblePendingPhase1.length) {
      log('warn', 'Aggregate settlement journal holds pending peg-outs fail-closed', {
        heldPegOuts: pendingPhase1.length - eligiblePendingPhase1.length,
      });
    }

    if (eligiblePendingPhase1.length === 0) return inventoryResult;

    const activeAuthenticatedCandidates = this.state.getActiveAuthenticatedSettlementCandidates();
    if (activeAuthenticatedCandidates.length > 0) {
      log('info', 'Authenticated V2 candidate journal holds peg-outs fail-closed', {
        activeCandidates: activeAuthenticatedCandidates.length,
      });
      return inventoryResult;
    }

    // Pick the first pending peg-out for aggregate settlement or fail-closed
    // inactive-mode reporting, and keep it available to the catch handler.
    const pegOut = eligiblePendingPhase1[0] as any;
    const burnTxHash = pegOut.sidechain_burn_tx_hash ?? pegOut.sidechainBurnTxHash;
    const pegOutLookup = pegOutRowLookup(pegOut);

    try {
      if (this.authenticatedSettlement) {
        if (!(await this.refreshAuthenticatedSpvTrackerHistory())) {
          log('info', 'Authenticated V2 settlement waiting for chain-reconstructed tracker history', {
            burnTx: burnTxHash,
          });
          return inventoryResult;
        }
        const parsedPegOut = pegOutRowToParsed(pegOut);
        const trackerIdentity = this.state.getAuthenticatedSpvTrackerIdentityByHeight(
          parsedPegOut.sidechainBlockNumber,
          SUBSTRATE_CONFIG.spvSidechainIdHex,
        );
        if (!trackerIdentity) {
          log('info', 'Authenticated V2 settlement waiting for admitted 0x0401 tracker entry', {
            burnTx: burnTxHash,
            sidechainHeight: parsedPegOut.sidechainBlockNumber,
          });
          return inventoryResult;
        }
        if (!this.nativeCheckpointSettlementSource) {
          log('info', 'Authenticated V2 settlement waiting for native checkpoint verification configuration', {
            burnTx: burnTxHash,
            sidechainHeight: parsedPegOut.sidechainBlockNumber,
          });
          return inventoryResult;
        }
        const bridgeAddress = this.deployed.solidity?.bridgeAddress;
        if (!bridgeAddress) {
          throw new Error('authenticated V2 proof collection requires the deployed bridge address');
        }
        const finalityPackage = await this.nativeCheckpointSettlementSource.collectForSettlement({
          sidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex,
          sidechainHeight: parsedPegOut.sidechainBlockNumber,
        });
        const proofBundle = await collectFrontierBurnProofForPegOut({
          provider: this.sidechain.getFrontierBurnProofProvider(),
          pegOut: parsedPegOut,
          sidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex,
          bridgeAddress,
          maxBurns: FRONTIER_BRIDGE_EVENT_ROOT_MAX_BURNS,
        });
        const nativeAdmission = bindNativeCheckpointToAuthenticatedSettlement({
          checkpoint: finalityPackage.checkpoint,
          aggregateFinalityProof: finalityPackage.aggregateFinalityProof,
          expectedSidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex,
          pegOut: parsedPegOut,
          proofBundle,
          trackerIdentity,
          trackerHistory: this.state.getAuthenticatedSpvTrackerHistory(
            SUBSTRATE_CONFIG.spvSidechainIdHex,
          ),
        });
        const prepared = await this.authenticatedSettlement.prepareAuthenticatedSettlementUnsignedTx({
          pegOut: parsedPegOut,
          trackerIdentity,
          settlementIdentity: proofBundle.settlementIdentity,
          creationHeight: ergoHeight,
        });
        const preparedTrackerBoxId = String(prepared.trackerBox?.boxId ?? '').toLowerCase();
        const trackerStillCurrent = await this.refreshAuthenticatedSpvTrackerHistory();
        if (
          !trackerStillCurrent
          || !this.authenticatedTrackerTipBoxId
          || preparedTrackerBoxId !== this.authenticatedTrackerTipBoxId
        ) {
          log('info', 'Authenticated V2 candidate discarded after tracker tip changed during preparation', {
            burnTx: burnTxHash,
          });
          return inventoryResult;
        }
        const candidate = recordNativeVerifiedAuthenticatedSettlementCandidate({
          state: this.state,
          nativeAdmission,
          prepared,
          pegOut: parsedPegOut,
          trackerIdentity,
          observedSidechainTip: backingPinnedHeight,
          observedErgoTip: ergoHeight,
        });
        log('info', 'Prepared authenticated V2 settlement candidate without signing', {
          candidateId: candidate.candidateId,
          burnTx: burnTxHash,
          bridgeEventRoot: proofBundle.proof.bridgeEventRootHex,
          proofNodes: proofBundle.proof.proof.length,
          nativeConsensusBlockHash: nativeAdmission.nativeConsensusBlockHashHex,
          nativeFinalityHorizon: nativeAdmission.finalityHorizonHeight,
        });
        return inventoryResult;
      }

      // New V1 payout execution is absent. Keep the burn durable for a future
      // reviewed profile; the legacy service is historical reconciliation only.
      log('error', 'Peg-out held fail-closed because legacy aggregate payout execution is retired', {
        burnTx: burnTxHash,
        reason: LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE,
      });
      return inventoryResult;
    } catch (err: any) {
      // Keep the durable burn row retryable after an operational failure.
      log('error', `Peg-out processing failed; will retry next cycle: ${err.message}`, { burnTx: burnTxHash });
      this.state.updatePegOutStatus(pegOutLookup, 'detected');
      return inventoryResult;
    }
  }

  /**
   * Find and persist the anchor height for a peg-out's bridge event root.
   *
   * ANCHOR PERSISTENCE INVARIANT:
   * Once an anchor height is resolved for a peg-out, it is persisted in
   * peg_out_events.ergo_anchor_height. All subsequent retries reuse that
   * exact height, even if the lookback window has advanced past it.
   *
   * INVALIDATION POLICY:
   * The persisted anchor is cleared ONLY when the Ergo node extension
   * fields at that height are successfully read and the expected 0x0401
   * bridge event root is absent (genuine reorg). Transient RPC failures
   * (node timeout, restart, sidechain provider errors) do NOT clear the
   * anchor — we return null and retry on the next cycle.
   *
   * ANCHOR STABILITY INVARIANT:
   * We scan FORWARD (lowest height first) so the anchor height is
   * deterministic. Using the latest block caused non-deterministic AVL
   * proofs — "Script reduced to false" on input #0.
   */
  private async findAnchoredTrackerIngest(
    pegOut: ParsedPegOut,
    ergoHeight: number,
  ): Promise<SpvTrackerEntry | null> {
    const maxAnchorHeight = ergoHeight - PROTOCOL_PARAMS.aggregateAnchorMinConfirmations;
    if (maxAnchorHeight < 0) return null;

    const minAnchorHeight = Math.max(
      0,
      maxAnchorHeight - PROTOCOL_PARAMS.aggregateAnchorLookbackBlocks + 1,
    );

    const deps = {
      addressToTree: (address: string) => this.ergo.addressToTree(address),
      getSidechainExtensionFieldsAtHeight: (height: number) => this.ergo.getSidechainExtensionFieldsAtHeight(height),
      getSidechainBlockHash: async (blockNumber: number) => {
        const block = await this.sidechain.getBlock(blockNumber);
        if (!block?.hash) {
          throw new Error(`cannot resolve sidechain block ${blockNumber}`);
        }
        return block.hash;
      },
    };

    // Step 1: Check for a persisted anchor height from a previous cycle
    const persisted = this.state.getPersistedAnchorHeight(pegOut.sidechainTxHash);

    if (persisted !== null) {
      // Step 2: Validate the persisted anchor (Ergo-side only, no sidechain calls)
      const validation = await validatePersistedAnchor({
        pegOut,
        ergoAnchorHeight: persisted,
        deps,
      });

      if (validation === 'valid') {
        // Step 2a: Anchor is confirmed present — derive the full ingest
        try {
          return await deriveAnchoredTrackerIngest({
            pegOut,
            sidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex,
            ergoAnchorHeight: persisted,
            deps,
          });
        } catch {
          // Sidechain getBlock or other transient failure during ingest
          // derivation. The anchor itself is valid — retry next cycle.
          log('warn', `Anchor ${persisted} validated but ingest derivation failed for ${pegOut.sidechainTxHash} — retry next cycle`);
          return null;
        }
      }

      if (validation === 'invalid') {
        // Step 2b: Root positively absent at persisted height — reorg.
        // Clear and fall through to re-scan.
        log('warn', `Persisted anchor ${persisted} for ${pegOut.sidechainTxHash}: 0x0401 root absent — clearing (likely reorg)`);
        this.state.clearPersistedAnchorHeight(pegOut.sidechainTxHash);
      } else {
        // Step 2c: 'unavailable' — transient RPC failure.
        // Preserve the persisted anchor and retry next cycle.
        log('warn', `Cannot validate persisted anchor ${persisted} for ${pegOut.sidechainTxHash} (RPC unavailable) — retry next cycle`);
        return null;
      }
    }

    // Step 3: No persisted anchor (or it was cleared) — forward-scan
    const anchorHeight = await findStableAnchorHeight({
      pegOut,
      sidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex,
      minHeight: minAnchorHeight,
      maxHeight: maxAnchorHeight,
      deps,
    });

    if (anchorHeight === null) return null;

    // Step 4: Persist the resolved anchor immediately
    this.state.setPersistedAnchorHeight(pegOut.sidechainTxHash, anchorHeight);

    return deriveAnchoredTrackerIngest({
      pegOut,
      sidechainIdHex: SUBSTRATE_CONFIG.spvSidechainIdHex,
      ergoAnchorHeight: anchorHeight,
      deps,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  C. SCS ORACLE: Update SideChainState height
  // ═══════════════════════════════════════════════════════════════

  private async observeOperationalInclusion(
    transaction: any,
    currentHeight: number,
  ): Promise<Readonly<{
    confirmations: number;
    inclusionHeight: number | null;
    headerId: string | null;
  }>> {
    const confirmations = Number(transaction?.numConfirmations ?? 0);
    if (!Number.isSafeInteger(confirmations) || confirmations < 0) {
      throw new Error(
        'operational transaction has an invalid confirmation count',
      );
    }
    if (confirmations === 0) {
      return Object.freeze({
        confirmations,
        inclusionHeight: null,
        headerId: null,
      });
    }
    const inclusionHeight = Number(
      transaction.inclusionHeight
      ?? currentHeight - confirmations + 1,
    );
    if (!Number.isSafeInteger(inclusionHeight) || inclusionHeight < 0) {
      throw new Error('operational transaction has an invalid inclusion height');
    }
    const headerId = normalizeBurnTxHash(
      transaction.headerId
      ?? await this.ergo.getBlockHeaderHash(inclusionHeight),
    );
    return Object.freeze({ confirmations, inclusionHeight, headerId });
  }

  private async updateSCSOracle(sidechainHeight: number, ergoHeight: number): Promise<void> {
    try {
      const reconciliation = await reconcileHistoricalScsAttempts({
        currentHeight: ergoHeight,
        finalConfirmations: ERGO_OPERATIONAL_FINAL_CONFIRMATIONS,
        ports: {
          activeAttempts: () =>
            this.state.getActiveErgoOperationalTransactionAttempts(
              SCS_ORACLE_UPDATE_OPERATION_PROFILE,
            ),
          reconcilableAttempts: () =>
            this.state.getReconcilableErgoOperationalTransactionAttempts(
              SCS_ORACLE_UPDATE_OPERATION_PROFILE,
            ),
          getAttempt: expectedTxId =>
            this.state.getErgoOperationalTransactionAttempt(expectedTxId),
          getTransaction: expectedTxId =>
            this.ergo.getTransaction(expectedTxId),
          observeInclusion: transaction =>
            this.observeOperationalInclusion(transaction, ergoHeight),
          isSingletonInMempool: () =>
            this.isBoxInMempool(this.deployed.sideChainState.nftId),
          getSourceBox: sourceBoxId =>
            this.ergo.getBoxByIdOrNull(sourceBoxId),
          confirm: confirmation => {
            this.state.confirmErgoOperationalTransactionAttempt(confirmation);
          },
          abandon: (expectedTxId, reason) => {
            this.state.abandonErgoOperationalTransactionAttempt(
              expectedTxId,
              reason,
            );
          },
          log: (level, message) => log(level, message),
        },
      });
      if (reconciliation.reconciliationPending) return;
      const finalizedHeadHash = normalizeBurnTxHash(
        await requestSubstrateFinalizedHeadHash(this.sidechainFinalityRpc),
      );
      const finalizedHead = await requestSubstrateHeaderObservation(
        this.sidechainFinalityRpc,
        `0x${finalizedHeadHash}`,
      );
      const targetSidechainHeight = parseSubstrateHeaderHeight(
        finalizedHead.number,
      );
      const canonicalTargetHash = normalizeBurnTxHash(
        await requestSubstrateBlockHashAt(
          this.sidechainFinalityRpc,
          targetSidechainHeight,
        ),
      );
      if (canonicalTargetHash !== finalizedHeadHash) {
        throw new Error('finalized SCS target does not match the canonical block hash');
      }
      if (targetSidechainHeight > sidechainHeight) {
        throw new Error('finalized SCS target exceeds the observed EVM height');
      }
      this.finalityObservedAtMs = Date.now();
      this.finalizedSidechainHeight = targetSidechainHeight;
      this.finalityObservedSidechainHeight = sidechainHeight;

      if (this.cycleCount % 10 === 1) {
        log(
          'info',
          'SCS oracle mutation is retired; finalized sidechain state is observation-only',
          {
            finalizedSidechainHeight: targetSidechainHeight,
            observedSidechainHeight: sidechainHeight,
          },
        );
      }
    } catch (err: any) {
      // Non-fatal: historical reconciliation and finality observation retry.
      if (this.cycleCount % 10 === 1) {
        log('warn', `SCS reconciliation/observation skipped: ${err.message}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  D. SETTLEMENT CONFIRMATION + IMMUTABLE LEGACY MCU QUARANTINE
  // ═══════════════════════════════════════════════════════════════

  private async processPhase2Unlocks(ergoHeight: number): Promise<void> {
    if (this.aggregateSettlement) {
      // ── Single-claim aggregate confirmations ──────────────────
      const aggregatePending = this.state.getPendingPegOuts()
        .filter(po => po.status === 'aggregate_submitted');

      for (const pegOut of aggregatePending) {
        const row = pegOut as any;
        const settlementTxId = row.phase1_box_id ?? pegOut.phase1BoxId;
        if (!settlementTxId) continue;

        const parsedPegOut = pegOutRowToParsed(row);
        try {
          const hasTrackerIdentity = !!this.state.getSpvTrackerIdentityByHeight(
            parsedPegOut.sidechainBlockNumber,
            SUBSTRATE_CONFIG.spvSidechainIdHex,
          );
          const trackerIngest = hasTrackerIdentity
            ? null
            : await this.findAnchoredTrackerIngest(parsedPegOut, ergoHeight);

          if (!hasTrackerIdentity && !trackerIngest) {
            log('warn', 'Aggregate settlement confirmation waiting for anchored SPV entry', {
              burnTx: parsedPegOut.sidechainTxHash,
              settlementTxId,
            });
            continue;
          }

          const confirmed = await this.aggregateSettlement.confirmSingleClaimSettlement(
            parsedPegOut,
            settlementTxId,
            trackerIngest ?? undefined,
          );
          if (confirmed) {
            this.stats.phase2Unlocks++;
            log('info', `   ✅ Aggregate settlement confirmed: ${settlementTxId}`);
          }
        } catch (err: any) {
          log('warn', `Aggregate settlement confirmation deferred: ${err.message}`, {
            burnTx: parsedPegOut.sidechainTxHash,
            settlementTxId,
          });
        }
      }

      // ── Batch-submitted confirmations ─────────────────────────
      const batchPending = this.state.getPendingPegOuts()
        .filter(po => po.status === 'batch_submitted');

      // Group batch claims by their shared settlement TX ID.
      const batchGroups = new Map<string, ParsedPegOut[]>();
      for (const pegOut of batchPending) {
        const row = pegOut as any;
        const txId = row.phase1_box_id ?? pegOut.phase1BoxId;
        if (!txId) continue;
        let group = batchGroups.get(txId);
        if (!group) {
          group = [];
          batchGroups.set(txId, group);
        }
        group.push(pegOutRowToParsed(row));
      }

      for (const [settlementTxId, pegOuts] of batchGroups) {
        try {
          const confirmed = await this.aggregateSettlement.confirmBatchSettlement(
            pegOuts,
            settlementTxId,
          );
          if (confirmed) {
            this.stats.phase2Unlocks += pegOuts.length;
            log('info', `   ✅ Batch settlement confirmed: ${settlementTxId} (${pegOuts.length} claims)`);
          }
        } catch (err: any) {
          log('warn', `Batch settlement confirmation deferred: ${err.message}`, {
            settlementTxId,
            claimCount: pegOuts.length,
          });
        }
      }
    }

    const pendingPegOuts = this.state.getPendingPegOuts()
      .filter(po => po.status === 'phase1_created');

    if (pendingPegOuts.length === 0) return;

    // Legacy MCU boxes are immutable. Their v1 script can pay a beneficiary
    // from stale SCS height or after its Ergo timeout, so the daemon must never
    // spend one. Revalidate each associated burn only to improve incident
    // classification; confirmed burns remain quarantined as well.
    for (const pegOut of pendingPegOuts) {
      const row = pegOut as any;
      const parsed = pegOutRowToParsed(row);
      const burnTxHash = parsed.sidechainTxHash;
      const burnStatus = await this.verifySidechainBurnForSettlement(parsed);

      if (burnStatus === 'reverted') {
        this.state.markPegOutBurnRevertedAndInvalidateCandidates(
          parsed.sidechainLogIndex === undefined
            ? burnTxHash
            : { burnTxHash, sidechainLogIndex: parsed.sidechainLogIndex },
          'fresh sidechain burn verification invalidated the legacy settlement row',
        );
        log('error', 'Legacy MCU solvency incident: sidechain burn reverted', {
          burnTx: burnTxHash,
          phase1TxId: row.phase1_box_id ?? pegOut.phase1BoxId,
          action: 'inventory immutable MCU; no automated spend or migration',
        });
        continue;
      }

      if (this.cycleCount % 10 === 1) {
        log(burnStatus === 'confirmed' ? 'warn' : 'error',
          'Legacy MCU remains quarantined; daemon will not spend it', {
            burnTx: burnTxHash,
            phase1TxId: row.phase1_box_id ?? pegOut.phase1BoxId,
            burnStatus,
            reason: LEGACY_MCU_DISABLED_MESSAGE,
          });
      }
    }

    return;
  }
  // ═══════════════════════════════════════════════════════════════
  //  🚨 CHAIN β DEFENSE: Ergo Reorg Handler
  // ═══════════════════════════════════════════════════════════════

  /**
   * Handle an Ergo chain reorg by purging phantom AVL keys and
   * resetting affected peg-outs.
   *
   * When a reorg removes a confirmed Phase 1 TX:
   * 1. The MCU box disappears from the UTXO set
   * 2. The DUP on-chain tree does NOT contain the inserted key
   * 3. But our local SQLite avl_tree_history STILL HAS the key (phantom)
   * 4. All future Phase 1 proofs are computed against the wrong digest
   * 5. Every Phase 1 TX fails with "Script reduced to false"
   * 6. Bridge is PERMANENTLY DEAD
   *
   * This method prevents that by finding all peg-outs with committed
   * AVL keys (phase1_created OR burn_reverted) and handling each:
   *
   * - phase1_created: Purge AVL key + reset to 'detected' for retry
   * - burn_reverted:  Purge AVL key + clear Phase 1 artifacts, keep
   *   terminal status (do NOT reset to 'detected' — the sidechain
   *   burn was already invalidated, re-processing would be dangerous)
   */
  private async handleErgoReorg(newHeight: number): Promise<void> {
    await this.reconcileConfirmedOperationalTransactionsAfterReorg(newHeight);
    // A known Ergo reorg must inspect every mint-submitted peg-in before this
    // tick can select another lifecycle transition. The periodic cursor remains
    // bounded, while this exceptional path closes the whole post-submission set.
    this.pegInReorgReconciliationPending = !(
      await this.reconcilePegIns(newHeight, true)
    );
    const candidates = this.state.getPegOutsWithAvlKeysForReorg();

    if (candidates.length === 0) {
      log('info', '   ✅ No in-flight peg-outs with AVL keys to check');
      return;
    }

    let purgedCount = 0;

    for (const po of candidates) {
      // Clean RECOVERY: prefix to get the real Phase 1 TX ID
      const cleanTxId = po.phase1BoxId.startsWith('RECOVERY:')
        ? po.phase1BoxId.slice('RECOVERY:'.length)
        : po.phase1BoxId;

      // GUARD: Only process rows whose AVL key is actually committed
      // to avl_tree_history. A row can have pending_avl_key set
      // (from updatePegOutStatus) without insertAvlKey() having been
      // called yet — e.g. Phase 1 TX still in mempool, MCU not yet
      // seen in UTXO set. These rows have no AVL divergence risk.
      if (!po.pendingAvlKey || !this.state.hasAvlKey(po.pendingAvlKey)) {
        log('info', `   ⏭️ Phase 1 TX ${cleanTxId.slice(0, 16)}... — AVL key not committed locally, skip reorg check`);
        continue;
      }

      // The TRUE reorg witness: is the Phase 1 TX still canonical?
      // MCU box absent from UTXO set does NOT mean reorg — Phase 2
      // normally spends the MCU box. Only a non-canonical Phase 1 TX
      // proves the DUP on-chain tree never received this key.
      let phase1Canonical = false;
      try {
        const tx = await this.ergo.getTransaction(cleanTxId);
        phase1Canonical = !!tx;
      } catch (err: any) {
        // Network error — don't purge, retry next cycle
        log('warn', `   Cannot verify Phase 1 TX ${cleanTxId.slice(0, 16)}... — skipping: ${err.message}`);
        continue;
      }

      if (phase1Canonical) {
        // Phase 1 TX is still confirmed. The AVL key is real.
        // If status is phase1_created but the MCU is spent, an immutable v1
        // permissionless path may already have executed outside this daemon.
        log('info', `   ✅ Phase 1 TX ${cleanTxId.slice(0, 16)}... still canonical — AVL key valid`);
        continue;
      }

      // Phase 1 TX is no longer canonical → REORGED.
      // The DUP on-chain tree does NOT contain this key. Purge it.
      log('warn', `   🚨 Phase 1 TX ${cleanTxId.slice(0, 16)}... no longer canonical — reorged!`);

      // Purge the phantom AVL key (existence confirmed by guard above)
      this.state.removeAvlKey(po.pendingAvlKey);
      log('warn', `   🗑️ Purged phantom AVL key: ${po.pendingAvlKey.slice(0, 16)}...`);

      const pegOutLookup = po.burnId
        ? { burnId: po.burnId }
        : po.sidechainLogIndex === null
          ? po.burnTxHash
          : { burnTxHash: po.burnTxHash, sidechainLogIndex: po.sidechainLogIndex };

      // Status-specific handling
      if (po.status === 'phase1_created') {
        // Normal case: reset to 'detected' with FULL field clearing
        this.state.resetPegOutToDetected(pegOutLookup);
        log('warn', `   🔄 Reset peg-out ${po.burnTxHash.slice(0, 16)}... to 'detected' (Phase 1 reorged)`);
      } else if (po.status === 'burn_reverted') {
        // Terminal case: burn was already invalidated on sidechain.
        // Clear Phase 1 metadata but keep burn_reverted status.
        this.state.clearPhase1Artifacts(pegOutLookup);
        log('warn', `   🗑️ Cleared Phase 1 artifacts for ${po.burnTxHash.slice(0, 16)}... (Phase 1 reorged, burn_reverted — status preserved)`);
      }
      purgedCount++;
    }

    if (purgedCount > 0) {
      log('info', `   ✅ Reorg recovery: ${purgedCount}/${candidates.length} peg-out(s) purged`);
    } else {
      log('info', `   ✅ Reorg check: all ${candidates.length} Phase 1 TXs still canonical — no purge needed`);
    }
  }

  private async reconcileConfirmedOperationalTransactionsAfterReorg(
    currentHeight: number,
  ): Promise<void> {
    for (const operationProfile of [
      SCS_ORACLE_UPDATE_OPERATION_PROFILE,
      DUP_HEARTBEAT_OPERATION_PROFILE,
    ] as const) {
      const confirmed =
        this.state.getConfirmedErgoOperationalTransactionAttempts(
          operationProfile,
        );
      for (const attempt of confirmed) {
        if (
          operationProfile === DUP_HEARTBEAT_OPERATION_PROFILE
          && (
            !attempt.heartbeatKeyHex
            || !this.state.hasAvlKey(attempt.heartbeatKeyHex)
          )
        ) {
          this.state.quarantineErgoOperationalTransactionAttempt(
            attempt.expectedTxId,
            'confirmed DUP operational transaction lacks committed local AVL history',
          );
          continue;
        }
        let transaction: any | null;
        try {
          transaction = await this.ergo.getTransaction(attempt.expectedTxId);
        } catch (error: any) {
          log(
            'warn',
            `Cannot verify confirmed operational TX ${attempt.expectedTxId.slice(0, 16)}...: ${error.message}`,
          );
          continue;
        }
        if (transaction) {
          let inclusion: Readonly<{
            confirmations: number;
            inclusionHeight: number | null;
            headerId: string | null;
          }>;
          try {
            inclusion = await this.observeOperationalInclusion(
              transaction,
              currentHeight,
            );
          } catch (error: any) {
            log(
              'warn',
              `Cannot validate current inclusion for operational TX ${attempt.expectedTxId.slice(0, 16)}...: ${error.message}`,
            );
            continue;
          }
          if (
            inclusion.confirmations < ERGO_OPERATIONAL_FINAL_CONFIRMATIONS
            || inclusion.inclusionHeight === null
            || inclusion.headerId === null
          ) {
            this.state.reopenConfirmedErgoOperationalTransactionAttempt(
              attempt.expectedTxId,
            );
            log(
              'warn',
              `Operational TX ${attempt.expectedTxId.slice(0, 16)}... is canonical but must re-establish final confirmation depth`,
            );
            continue;
          }
          if (
            inclusion.inclusionHeight !== attempt.confirmationHeight
            || inclusion.headerId !== attempt.confirmationHeaderId
          ) {
            this.state.rebindConfirmedErgoOperationalTransactionAttempt({
              expectedTxId: attempt.expectedTxId,
              confirmationHeight: inclusion.inclusionHeight,
              confirmationHeaderId: inclusion.headerId,
            });
            log(
              'warn',
              `Operational TX ${attempt.expectedTxId.slice(0, 16)}... was re-included and rebound to its current canonical block`,
            );
          }
          continue;
        }

        if (
          attempt.confirmationHeight === null
          || attempt.confirmationHeaderId === null
        ) {
          this.state.quarantineErgoOperationalTransactionAttempt(
            attempt.expectedTxId,
            'confirmed operational transaction lacks an exact block identity',
          );
          continue;
        }
        if (
          currentHeight - attempt.confirmationHeight + 1
          < ERGO_OPERATIONAL_FINAL_CONFIRMATIONS
        ) {
          this.state.reopenConfirmedErgoOperationalTransactionAttempt(
            attempt.expectedTxId,
          );
          log(
            'warn',
            `Operational TX ${attempt.expectedTxId.slice(0, 16)}... lost required depth while its transaction lookup was unavailable`,
          );
          continue;
        }

        let canonicalHeaderId: string;
        try {
          canonicalHeaderId = normalizeBurnTxHash(
            await this.ergo.getBlockHeaderHash(attempt.confirmationHeight),
          );
        } catch (error: any) {
          log(
            'warn',
            `Cannot verify operational confirmation header ${attempt.confirmationHeight}: ${error.message}`,
          );
          continue;
        }
        if (canonicalHeaderId === attempt.confirmationHeaderId) {
          log(
            'warn',
            `Operational TX ${attempt.expectedTxId.slice(0, 16)}... is temporarily unavailable but its confirmation block remains canonical`,
          );
          continue;
        }

        this.state.reopenConfirmedErgoOperationalTransactionAttempt(
          attempt.expectedTxId,
        );
        log(
          'warn',
          `Confirmed operational TX ${attempt.expectedTxId.slice(0, 16)}... left its recorded block; exact inclusion must be re-established`,
        );
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  🚨 CHAIN θ DEFENSE: Peg-In Reconciliation
  // ═══════════════════════════════════════════════════════════════

  /**
   * Verify that peg-ins marked 'minted' in SQLite are actually confirmed
   * on the EVM. If an EVM reorg removed the mint TX, SQLite says 'minted'
   * but the user never received sERG → their ERG is trapped in MCL forever.
   *
   * This reconciliation check runs periodically and resets an EVM-absent mint
   * only to the retained consume-confirmed state, after two absence reads and
   * fresh unchanged Ergo commitment evidence.
   */
  private async reconcilePegIns(
    ergoHeight: number,
    reconcileAllMinted = false,
  ): Promise<boolean> {
    try {
      const batch = reconcileAllMinted
        ? this.state.getPegInsRequiringPostSubmissionReconciliation()
        : this.state.getPegInReconciliationBatch(50);
      if (batch.length === 0) return true;
      let allConclusive = true;
      for (const pi of batch) {
        let incidentPersistenceStarted = false;
        try {
          if (pi.sourceClassification === 'active_committed_vault') {
            if (!this.pegInCoordinator) {
              allConclusive = false;
              log(
                'warn',
                'Active minted peg-in reconciliation deferred because the committed-vault coordinator is unavailable',
                { boxId: pi.ergoLockBoxId },
              );
              continue;
            }
            const result = await this.pegInCoordinator.reconcileMinted(pi, ergoHeight);
            if (result.status === 'incident') {
              this.fundsReleaseHoldOpen = true;
              log('error', 'LOCAL FUNDS-RELEASE HOLD during minted reconciliation', {
                boxId: pi.ergoLockBoxId,
                reason: result.reason,
              });
            }
            if (result.status === 'pending' || result.status === 'uncertain') {
              allConclusive = false;
            }
            continue;
          }

          // Rows created before v3 have no committed-vault provenance. Classify
          // them explicitly; never reset them into the active mint queue.
          const sourceBox = await this.ergo.getBoxByIdOrNull(pi.ergoLockBoxId);
          const processed = await this.sidechain.isBoxProcessed(pi.ergoLockBoxId);
          const classification = classifyLegacyPegIn(!!sourceBox, processed);
          if (classification === 'legacy_minted_requires_migration') {
            this.fundsReleaseHoldOpen = true;
            incidentPersistenceStarted = true;
          }
          this.state.updatePegInClassification(pi.ergoLockBoxId, classification);
          if (classification === 'legacy_minted_requires_migration') {
            const reason = 'legacy minted peg-in still has a refundable source box';
            this.state.markPegInIncident(pi.ergoLockBoxId, {
              kind: 'legacy_refundable_after_mint',
              reason,
            });
            log('error', 'LOCAL FUNDS-RELEASE HOLD during legacy reconciliation', {
              boxId: pi.ergoLockBoxId,
              reason,
            });
          }
        } catch (err: any) {
          allConclusive = false;
          if (
            err instanceof PegInIncidentPersistenceError
            || incidentPersistenceStarted
          ) {
            this.fundsReleaseHoldOpen = true;
            log(
              'error',
              'LOCAL FUNDS-RELEASE HOLD: reconciliation incident persistence failed',
              {
                boxId: pi.ergoLockBoxId,
                error: err.message,
              },
            );
          } else {
            log('warn', 'Peg-in reconciliation deferred on RPC uncertainty', {
              boxId: pi.ergoLockBoxId,
              error: err.message,
            });
          }
        }
      }
      if (!reconcileAllMinted) {
        this.state.advancePegInReconciliationCursor(batch[batch.length - 1].id);
      }
      return allConclusive;
    } catch (err: any) {
      // Non-fatal — reconciliation can retry next cycle
      log('warn', `Reconciliation skipped: ${err.message}`);
      return false;
    }
  }
  // ═══════════════════════════════════════════════════════════════
  //  CONSERVATIVE BACKING ALARM
  // ═══════════════════════════════════════════════════════════════

  /**
   * Observe a conservative local backing alarm:
   *
   *   totalSupply(sERG) + pending canonical exits
   *     <= canonical non-refundable V2 vault
   *
   * Refundable staging is never eligible backing. A positive deficit is
   * actionable. The inverse is not a solvency proof because both chain
   * observations are local RPC snapshots.
   *
   * This opens the relayer's persistent local funds-release hold. It does not
   * invoke an on-chain pause or make SQLite a funds authority; reviewed
   * recovery authority remains necessary before local release can resume.
   */
  private async checkSolvencyInvariant(
    readQuorumDecision: AllowedErgoReadCycleDecision,
    sidechainBackingSnapshot: CompleteSidechainBackingSnapshot,
    backingReadAgreement: Readonly<FrontierBackingReadAgreementSnapshot>,
  ): Promise<void> {
    try {
      const ergoHeight = readQuorumDecision.tip.height;
      if (!this.sidechainBackingSources) {
        throw new Error('Frontier backing read-agreement sources are unavailable');
      }
      assertFrontierBackingReadAgreementProvenance(
        this.sidechainBackingSources,
        backingReadAgreement,
      );
      assertFrontierBackingAgreementSnapshotJoin(
        sidechainBackingSnapshot,
        backingReadAgreement,
      );
      if (!this.pegInDeployment) {
        throw new Error(
          `committed-vault-v3 backing profile unavailable at Ergo height ${ergoHeight}`,
        );
      }

      // Count only the canonical non-refundable V2 vault. Active staging and
      // immutable legacy lock boxes remain refundable and cannot back minted sERG.
      if (!this.ergoReadQuorumSources) {
        throw new Error('Ergo read quorum is unavailable for vault backing inventory');
      }
      const admittedObservation = requireErgoReadQuorumDecisionObservation(
        this.ergoReadQuorumSources,
        readQuorumDecision,
      );
      const vaultSnapshot = await observeErgoReadQuorumAddressBoxes(
        this.ergoReadQuorumSources,
        admittedObservation,
        this.pegInDeployment.vaultAddress,
      );
      assertErgoReadQuorumAddressBoxSnapshotProvenance(
        this.ergoReadQuorumSources,
        admittedObservation,
        vaultSnapshot,
      );
      if (!this.requireCurrentErgoReadQuorumDecision(
        readQuorumDecision,
        'quorum-bound vault backing inventory',
      )) {
        throw new Error('Ergo read-quorum authorization expired during vault inventory');
      }
      const canonicalVaultBoxes = await Promise.all(vaultSnapshot.boxes.map(
        async (box, index) => {
          const canonical = await normalizeErgoEip12BoxSnapshot(
            box,
            `backing alarm vault box ${index}`,
          );
          return Object.freeze({
            boxIdHex: canonical.boxId,
            valueNanoErg: BigInt(canonical.value),
            ergoTreeHex: canonical.ergoTree,
            tokenCount: canonical.assets.length,
            registers: canonical.additionalRegisters,
          });
        },
      ));
      const totalLockedNanoErg = sumCanonicalCommittedVaultBackingV1(
        canonicalVaultBoxes,
        this.pegInDeployment.vaultErgoTreeHex,
      );

      const activeAuthenticatedSettlementCandidates =
        this.state.getActiveAuthenticatedSettlementCandidates();
      const authenticatedSettlementBindings =
        activeAuthenticatedSettlementCandidates.map(candidate => {
          if (
            candidate.status !== 'prepared'
            && candidate.status !== 'check_passed'
          ) {
            throw new Error(
              `active authenticated settlement candidate ${candidate.candidateId} has invalid status ${candidate.status}`,
            );
          }
          return Object.freeze({
            candidateIdHex: candidate.candidateId,
            burnIdHex: candidate.burnId,
            sidechainTransactionHashHex: candidate.burnTxHash,
            expectedTransactionIdHex: candidate.checkExpectedTxId,
            status: candidate.status,
          });
        });
      const activeAuthenticatedCandidateIds = new Set(
        authenticatedSettlementBindings.map(binding => binding.candidateIdHex),
      );
      for (
        const attempt of
        this.state.getRecoverableAuthenticatedSettlementSubmissionAttempts()
      ) {
        if (!activeAuthenticatedCandidateIds.has(attempt.candidateId)) {
          throw new Error(
            `recoverable authenticated settlement attempt ${attempt.durableAttemptDigestHex} has no active candidate`,
          );
        }
      }

      const terminalLiabilityResolution =
        await reconstructPegOutTerminalLiabilities({
          observations: this.state.getOutstandingPegOutLiabilityObservations(),
          aggregateSettlementAttempts:
            this.state.getRecoverableAggregateSettlementAttempts(),
          authenticatedSettlementBindings,
          sidechainBackingSnapshot,
          authenticatedV2:
            this.authenticatedTrackerSources
            && this.deployed.doubleUnlockPreventionAuthenticated
            && this.aggregateSettlementRecoveryWitness
              ? {
                primarySource: this.authenticatedTrackerSources[0],
                witnessSource: this.authenticatedTrackerSources[1],
                duplicatePreventionNftIdHex:
                  this.deployed.doubleUnlockPreventionAuthenticated.nftId,
                duplicatePreventionErgoTreeHex:
                  this.deployed.doubleUnlockPreventionAuthenticated.ergoTreeHex,
                settlementObservationSources:
                  this.aggregateSettlementRecoveryWitness,
              }
              : null,
        });
      const projection =
        projectCrossLedgerBackingAlarmFromTerminalLiabilityResolution({
          sidechainBackingSnapshot,
          canonicalVaultBackingNanoErg: totalLockedNanoErg,
          resolution: terminalLiabilityResolution,
        });
      await revalidateFrontierBackingReadAgreementPin(
        this.sidechainBackingSources,
        backingReadAgreement,
      );
      assertFrontierBackingReadAgreementProvenance(
        this.sidechainBackingSources,
        backingReadAgreement,
      );
      if (!this.requireCurrentErgoReadQuorumDecision(
        readQuorumDecision,
        'quorum-bound backing alarm decision',
      )) {
        throw new Error('Ergo read-quorum authorization expired before backing decision');
      }

      // The consume-before-mint sequence removes the old timing excuse. Any
      // positive cross-ledger deficit is now a hold rather than an accepted
      // epsilon. Ambiguous in-flight settlement identities fail during the
      // branded liability reconstruction before they can reach the projector.
      if (projection.deficitNanoErg > 0n) {
        const deficit = projection.deficitNanoErg;
        this.fundsReleaseHoldOpen = true;
        this.solvencyHealthState = 'deficit';
        this.solvencyObservedAtMs = Date.now();
        const reason = [
          'cross-ledger backing deficit observed before peg-out candidate advancement',
          `supply=${projection.totalSupplyNanoErg}`,
          `pendingExit=${projection.pendingExitLiabilityNanoErg}`,
          `required=${projection.requiredBackingNanoErg}`,
          `counted=${projection.canonicalVaultBackingNanoErg}`,
          `deficit=${projection.deficitNanoErg}`,
        ].join('; ');
        // The shared restart-safe hold must exist before the incident journal
        // write. Otherwise an isolated journal failure could leave another
        // process able to authorize funds release from stale durable state.
        this.state.holdFundsReleaseForOperatorReview(reason);
        // Preserve the existing structured peg-in incident only when current
        // supply alone exceeds backing. The external hold reason above records
        // the complete cross-ledger projection without relabelling pending
        // exits as minted supply.
        if (
          sidechainBackingSnapshot.totalSupplyNanoErg
          > totalLockedNanoErg
        ) {
          try {
            this.state.recordPegInSolvencyDeficitIncident({
              ergoHeight,
              totalSupplyNanoErg:
                sidechainBackingSnapshot.totalSupplyNanoErg,
              totalLockedNanoErg,
            });
          } catch (error: any) {
            log(
              'error',
              `LOCAL FUNDS-RELEASE HOLD remains externally latched but the durable solvency incident could not be recorded: ${error.message}`,
            );
          }
        }
        log('error', `CROSS-LEDGER BACKING ALARM: observed liabilities exceed counted backing`);
        log('error', `   sERG supply:   ${Number(projection.totalSupplyNanoErg) / 1e9} ERG`);
        log('error', `   Pending exits: ${Number(projection.pendingExitLiabilityNanoErg) / 1e9} ERG`);
        log('error', `   Required:      ${Number(projection.requiredBackingNanoErg) / 1e9} ERG`);
        log('error', `   Locked ERG:    ${Number(totalLockedNanoErg) / 1e9} ERG`);
        log('error', `   DEFICIT:      ${Number(deficit) / 1e9} ERG UNBACKED`);
        log('error', `   Operator must investigate the observed deficit immediately`);
        log('error', `   Local funds-release hold opened; operator incident response is required`);
      } else {
        this.solvencyHealthState = 'clear';
        this.solvencyObservedAtMs = Date.now();
        if (this.cycleCount % 500 === 0) {
          // Log the alarm reading every 500 cycles without certifying solvency.
          log('info', `   Backing alarm clear (not a solvency certificate): liabilities=${Number(projection.requiredBackingNanoErg) / 1e9} <= counted=${Number(totalLockedNanoErg) / 1e9} ERG`);
        }
      }
    } catch (err: any) {
      // The alarm can retry next cycle, but unavailable backing evidence cannot
      // leave value release enabled.
      this.holdFundsReleaseForUnavailableBackingAlarm(
        `backing alarm unavailable: ${err.message}`,
      );
    }
  }

  private holdFundsReleaseForUnavailableBackingAlarm(reason: string): void {
    this.fundsReleaseHoldOpen = true;
    this.solvencyHealthState = 'unavailable';
    this.solvencyObservedAtMs = Date.now();
    try {
      this.state.holdFundsReleaseForOperatorReview(reason);
    } catch (holdError) {
      log('error', 'LOCAL FUNDS-RELEASE HOLD could not persist durably', {
        error: holdError instanceof Error ? holdError.message : String(holdError),
      });
      throw holdError;
    }
    log('error', 'LOCAL FUNDS-RELEASE HOLD: backing alarm unavailable', {
      error: reason,
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────

  /**
   * Check if a singleton box is currently being spent in the mempool.
   * This prevents "Double spending attempt" errors when a previous TX
   * is still in the mempool but our local tracking lost the reference.
   */
  private async isBoxInMempool(nftId: string): Promise<boolean> {
    try {
      // 1. Find the current confirmed box with this NFT
      const confirmed = await this.ergo.getBoxesByTokenId(nftId);
      if (confirmed.length === 0) return false;
      const boxId = confirmed[0].boxId;

      // 2. Check if any unconfirmed TX spends this box
      // 🚨 PAGINATION FIX (Finding #22): The default /transactions/unconfirmed
      // returns only ~50 TXs. On mainnet during high load, the mempool can
      // have 200+ TXs. Without pagination, a spending TX at position 51+
      // is invisible → daemon builds a conflicting TX → "Double spending attempt".
      const PAGE_SIZE = 100;
      let offset = 0;
      while (true) {
        const page = await nget(`/transactions/unconfirmed?limit=${PAGE_SIZE}&offset=${offset}`);
        if (!Array.isArray(page) || page.length === 0) break;

        for (const tx of page) {
          for (const inp of (tx.inputs || [])) {
            if (inp.boxId === boxId) {
              return true; // This box IS being spent by a mempool TX
            }
          }
        }
        if (page.length < PAGE_SIZE) break; // Last page
        offset += PAGE_SIZE;
      }
      return false;
    } catch {
      return false; // Unknown — assume not in mempool
    }
  }

  /**
   * Get all box IDs being spent by unconfirmed (mempool) transactions.
   * Used by retained construction and historical reconciliation paths.
   *
   * CRITICAL DETAILS:
   *   1. PAGINATION: The default /transactions/unconfirmed returns only ~50 TXs.
   *      On mainnet during high load (NFT drops, volatility), mempool can have 200+.
   *      We paginate with offset/limit to guarantee 100% coverage.
   *   2. INPUTS ONLY: We iterate tx.inputs (boxes being DESTROYED), NOT tx.dataInputs.
   *      DataInputs are read-only — multiple TXs can read the same dataInput in one block.
   *      Including dataInputs would falsely classify read-only singletons as spent.
   */
  private async getMempoolSpentBoxIds(): Promise<Set<string>> {
    const spent = new Set<string>();
    try {
      const PAGE_SIZE = 100;
      let offset = 0;
      while (true) {
        const page = await nget(`/transactions/unconfirmed?limit=${PAGE_SIZE}&offset=${offset}`);
        if (!Array.isArray(page) || page.length === 0) break;
        for (const tx of page) {
          // ONLY tx.inputs — NEVER tx.dataInputs (read-only, no spending conflict)
          for (const inp of (tx.inputs || [])) {
            spent.add(inp.boxId);
          }
        }
        if (page.length < PAGE_SIZE) break; // Last page
        offset += PAGE_SIZE;
      }
    } catch {
      // Ignore — return empty set (fail-open: daemon will retry next cycle)
    }
    return spent;
  }

  // ═══════════════════════════════════════════════════════════════
  //  E. STORAGE RENT: Keep-alive monitoring for 4-year UTXO expiration
  // ═══════════════════════════════════════════════════════════════

  /**
   * 🚨 STORAGE RENT BOMB DEFENSE:
   *
   * Ergo's unique state management (EIP-0017) charges "storage rent" on boxes
   * that remain unspent for ~4 years (1,051,200 blocks). Miners can legally
   * seize ERG from these boxes as compensation for disk space.
   *
   * THREE critical threats to the bridge:
   *
   *   1. SINGLETON EVAPORATION: If SCS or DUP singletons go 4 years without
   *      being spent, miners seize their ERG. If value drops below minBoxValue,
   *      the singleton is DESTROYED — along with its irreplaceable NFT.
   *      The bridge dies permanently.
   *
   *   2. TVL EROSION: MainChainLock boxes holding user deposits slowly lose
   *      value as storage rent drains them. sERG on the sidechain remains at
   *      full supply — the bridge becomes under-collateralized (insolvent).
   *
   *   3. BEAR MARKET COMPOUNDING: During extended inactivity (multi-year bear),
   *      ALL boxes age simultaneously toward the 4-year cliff.
   *
   * This monitor runs periodically and warns when boxes approach danger. No
   * automatic SCS or DUP maintenance mutation remains; any refresh requires a
   * separately reviewed contract-defined transition. MainChainLock TVL also
   * remains exposed during prolonged inactivity.
   */
  private async confirmPendingDupHeartbeats(ergoHeight: number): Promise<void> {
    this.dupHeartbeatInFlight = false;
    const legacyHeartbeats = this.state.getPendingDupHeartbeats();
    if (legacyHeartbeats.length > 0) {
      this.dupHeartbeatInFlight = true;
      log(
        'error',
        'Legacy DUP heartbeat rows lack exact block identity; automatic migration remains fail-closed',
        { pendingRows: legacyHeartbeats.length },
      );
    }
    const active = this.state.getActiveErgoOperationalTransactionAttempts(
      DUP_HEARTBEAT_OPERATION_PROFILE,
    );
    if (active.length > 1) {
      throw new Error('multiple active DUP heartbeat attempts violate the static profile');
    }
    const reconcilable =
      this.state.getReconcilableErgoOperationalTransactionAttempts(
        DUP_HEARTBEAT_OPERATION_PROFILE,
      );
    const absentAttemptIds: string[] = [];
    for (const snapshot of reconcilable) {
      const attempt = this.state.getErgoOperationalTransactionAttempt(
        snapshot.expectedTxId,
      );
      if (
        !attempt
        || !['pending', 'accepted', 'ambiguous', 'abandoned'].includes(
          attempt.status,
        )
      ) {
        continue;
      }
      let tx: any | null;
      try {
        tx = await this.ergo.getTransaction(attempt.expectedTxId);
      } catch (error: any) {
        this.dupHeartbeatInFlight = true;
        log(
          'warn',
          `Cannot reconcile DUP heartbeat ${attempt.expectedTxId.slice(0, 16)}...: ${error.message}`,
        );
        continue;
      }
      if (tx) {
        let confirmation: Readonly<{
          confirmations: number;
          inclusionHeight: number | null;
          headerId: string | null;
        }>;
        try {
          confirmation = await this.observeOperationalInclusion(
            tx,
            ergoHeight,
          );
        } catch (error: any) {
          this.dupHeartbeatInFlight = true;
          log(
            'warn',
            `Cannot validate DUP heartbeat inclusion ${attempt.expectedTxId.slice(0, 16)}...: ${error.message}`,
          );
          continue;
        }
        if (
          confirmation.confirmations < ERGO_OPERATIONAL_FINAL_CONFIRMATIONS
          || confirmation.inclusionHeight === null
          || confirmation.headerId === null
        ) {
          this.dupHeartbeatInFlight = true;
          continue;
        }
        if (!attempt.heartbeatKeyHex) {
          throw new Error('durable DUP heartbeat attempt has no bound key');
        }
        this.state.confirmErgoOperationalTransactionAttempt({
          expectedTxId: attempt.expectedTxId,
          confirmationHeight: confirmation.inclusionHeight,
          confirmationHeaderId: confirmation.headerId,
        });
        log(
          'info',
          `   DUP heartbeat AVL key committed: ${attempt.heartbeatKeyHex.slice(0, 16)}...`,
        );
        continue;
      }
      absentAttemptIds.push(attempt.expectedTxId);
    }
    for (const expectedTxId of absentAttemptIds) {
      const attempt = this.state.getErgoOperationalTransactionAttempt(
        expectedTxId,
      );
      if (!attempt || attempt.status === 'abandoned') continue;
      if (!['pending', 'accepted', 'ambiguous'].includes(attempt.status)) {
        continue;
      }
      let refreshedTx: any | null;
      try {
        refreshedTx = await this.ergo.getTransaction(attempt.expectedTxId);
      } catch (error: any) {
        this.dupHeartbeatInFlight = true;
        log(
          'warn',
          `Cannot revalidate absent DUP heartbeat ${attempt.expectedTxId.slice(0, 16)}...: ${error.message}`,
        );
        continue;
      }
      if (refreshedTx) {
        let confirmation: Readonly<{
          confirmations: number;
          inclusionHeight: number | null;
          headerId: string | null;
        }>;
        try {
          confirmation = await this.observeOperationalInclusion(
            refreshedTx,
            ergoHeight,
          );
        } catch (error: any) {
          this.dupHeartbeatInFlight = true;
          log(
            'warn',
            `Cannot validate refreshed DUP heartbeat ${attempt.expectedTxId.slice(0, 16)}...: ${error.message}`,
          );
          continue;
        }
        if (
          confirmation.confirmations < ERGO_OPERATIONAL_FINAL_CONFIRMATIONS
          || confirmation.inclusionHeight === null
          || confirmation.headerId === null
        ) {
          this.dupHeartbeatInFlight = true;
          continue;
        }
        if (!attempt.heartbeatKeyHex) {
          throw new Error('durable DUP heartbeat attempt has no bound key');
        }
        this.state.confirmErgoOperationalTransactionAttempt({
          expectedTxId: attempt.expectedTxId,
          confirmationHeight: confirmation.inclusionHeight,
          confirmationHeaderId: confirmation.headerId,
        });
        log(
          'info',
          `   DUP heartbeat AVL key committed after destructive revalidation: ${attempt.heartbeatKeyHex.slice(0, 16)}...`,
        );
        continue;
      }
      if (ergoHeight <= attempt.attemptedAtHeight + 10) {
        this.dupHeartbeatInFlight = true;
        continue;
      }
      if (await this.isBoxInMempool(this.deployed.doubleUnlockPrevention.nftId)) {
        this.dupHeartbeatInFlight = true;
        continue;
      }
      const sourceBox = await this.ergo.getBoxByIdOrNull(attempt.sourceBoxId);
      if (sourceBox) {
        this.state.abandonErgoOperationalTransactionAttempt(
          attempt.expectedTxId,
          'exact heartbeat transaction absent after ten blocks and source singleton remains unspent',
        );
        log(
          'warn',
          `DUP heartbeat ${attempt.expectedTxId.slice(0, 16)}... absent with its source unspent; retry allowed`,
        );
        continue;
      }
      this.dupHeartbeatInFlight = true;
      log(
        'error',
        `DUP heartbeat ${attempt.expectedTxId.slice(0, 16)}... has an unresolved source spend; retaining a fail-closed reconciliation hold`,
      );
    }
  }

  private async storageRentCheck(
    readQuorumDecision: AllowedErgoReadCycleDecision,
  ): Promise<void> {
    const ergoHeight = readQuorumDecision.tip.height;
    if (!this.ergoReadQuorumSources) {
      log('error', 'Storage-rent parameters unavailable: Ergo read quorum is not configured');
      return;
    }
    let parameters: ErgoStorageRentParameterObservation;
    try {
      const admittedObservation = requireErgoReadQuorumDecisionObservation(
        this.ergoReadQuorumSources,
        readQuorumDecision,
      );
      parameters = await observeErgoStorageRentParameters(
        this.ergoReadQuorumSources,
        admittedObservation,
      );
    } catch {
      log(
        'error',
        'Storage-rent parameters unavailable: configured readers did not reproduce the active parameter set',
      );
      return;
    }

    const inspectSingleton = async (
      label: string,
      surfaceId: string,
      nftId: string,
      configuredErgoTreeHex: string,
    ): Promise<void> => {
      try {
        const box = await this.storageRentErgo.findSingletonBox(nftId);
        const projection = await this.projectStorageRentBox(
          surfaceId,
          box,
          ergoHeight,
          parameters,
          configuredErgoTreeHex,
        );
        this.reportStorageRentProjection(label, projection);
      } catch {
        log('error', 'Storage-rent singleton observation unavailable', { surfaceId });
      }
    };

    await inspectSingleton(
      'SideChainState',
      'side-chain-state-v1',
      this.deployed.sideChainState.nftId,
      this.deployed.sideChainState.ergoTreeHex,
    );
    await inspectSingleton(
      'DoubleUnlockPrevention',
      'double-unlock-prevention-v1',
      this.deployed.doubleUnlockPrevention.nftId,
      this.deployed.doubleUnlockPrevention.ergoTreeHex,
    );
    if (this.deployed.spvTracker) {
      await inspectSingleton(
        'SPVTracker',
        LEGACY_SPV_TRACKER_STORAGE_RENT_PROFILE,
        this.deployed.spvTracker.nftId,
        this.deployed.spvTracker.ergoTreeHex,
      );
    }
    if (this.deployed.doubleUnlockPreventionAggregate) {
      await inspectSingleton(
        'DoubleUnlockPreventionAggregate',
        'double-unlock-prevention-aggregate-v1',
        this.deployed.doubleUnlockPreventionAggregate.nftId,
        this.deployed.doubleUnlockPreventionAggregate.ergoTreeHex,
      );
    }
    if (this.deployed.spvTrackerAuthenticated) {
      await inspectSingleton(
        'SPVTrackerAuthenticated',
        'substrate-grandpa-authenticated-spv-tracker-v2',
        this.deployed.spvTrackerAuthenticated.nftId,
        this.deployed.spvTrackerAuthenticated.ergoTreeHex,
      );
    }
    if (this.deployed.doubleUnlockPreventionAuthenticated) {
      await inspectSingleton(
        'DoubleUnlockPreventionAuthenticated',
        'double-unlock-prevention-authenticated-v2',
        this.deployed.doubleUnlockPreventionAuthenticated.nftId,
        this.deployed.doubleUnlockPreventionAuthenticated.ergoTreeHex,
      );
    }
    if (this.deployed.doubleUnlockPreventionAggregateBatch) {
      await inspectSingleton(
        'DoubleUnlockPreventionAggregateBatch',
        'double-unlock-prevention-aggregate-batch-v1',
        this.deployed.doubleUnlockPreventionAggregateBatch.nftId,
        this.deployed.doubleUnlockPreventionAggregateBatch.ergoTreeHex,
      );
    }

    try {
      const lockPage = await this.storageRentErgo.getUnspentBoxesByAddressPage(
        this.deployed.mainChainLock.address,
        {
          offset: 0,
          limit: 129,
          sortDirection: 'asc',
        },
      );
      const moreBoxesAvailable = lockPage.length > 128;
      const selected = lockPage.slice(0, 128);

      const reports: StorageRentProjection[] = [];
      let unavailable = 0;
      for (const box of selected) {
        try {
          reports.push(await this.projectStorageRentBox(
            'main-chain-lock-v1',
            box,
            ergoHeight,
            parameters,
            this.deployed.mainChainLock.ergoTreeHex,
          ));
        } catch {
          unavailable += 1;
        }
      }
      const risky = reports.filter(report => report.ageRisk !== 'fresh');
      if (risky.length > 0 || unavailable > 0 || moreBoxesAvailable) {
        const worst = [...risky].sort((left, right) => right.ageBlocks - left.ageBlocks)[0];
        log(
          worst?.ageRisk === 'rent_eligible' || risky.some(report => !report.feeCovered)
            ? 'error'
            : 'warn',
          'STORAGE_RENT MainChainLock inventory requires operator attention',
          {
            surfaceId: 'main-chain-lock-v1',
            observedBoxes: selected.length,
            moreBoxesAvailable,
            riskyBoxes: risky.length,
            unavailableBoxes: unavailable,
            oldestObservedAgeBlocks: worst?.ageBlocks ?? 0,
            oldestObservedStatus: worst?.ageRisk ?? 'fresh',
            neutralMaintenanceEligible: false,
            requiredTransition: 'contract-defined-commit-or-refund',
          },
        );
      }
    } catch {
      log('error', 'Storage-rent MainChainLock inventory unavailable');
    }
  }

  private async projectStorageRentBox(
    surfaceId: string,
    box: any,
    ergoHeight: number,
    parameters: ErgoStorageRentParameterObservation,
    configuredErgoTreeHex: string,
  ): Promise<StorageRentProjection> {
    assertStorageRentSurfaceTree({
      surfaceId,
      observedErgoTreeHex: box?.ergoTree,
      configuredErgoTreeHex,
    });
    const serializedBoxHex = await this.storageRentErgo.getBoxByIdBinary(
      String(box.boxId),
    );
    return projectStorageRent({
      surfaceId,
      currentHeight: ergoHeight,
      creationHeight: Number(box.creationHeight),
      serializedSizeBytes: serializedBoxSizeBytesFromHex(serializedBoxHex),
      valueNanoErg: box.value,
      storageFeeFactorNanoErgPerByte: parameters.storageFeeFactorNanoErgPerByte,
      parameterObservedAtHeight: parameters.expectedTipHeight,
      parameterSourceId: parameters.parameterSourceId,
    });
  }

  private reportStorageRentProjection(
    label: string,
    projection: StorageRentProjection,
  ): void {
    if (projection.ageRisk === 'fresh') return;
    const surface = STORAGE_RENT_SURFACE_INVENTORY.find(
      item => item.surfaceId === projection.surfaceId,
    );
    log(
      projection.ageRisk === 'rent_eligible' || !projection.feeCovered
        ? 'error'
        : 'warn',
      `STORAGE_RENT ${label} requires operator attention`,
      {
        surfaceId: projection.surfaceId,
        status: projection.ageRisk,
        ageBlocks: projection.ageBlocks,
        blocksUntilRentEligible: projection.blocksUntilRentEligible,
        serializedSizeBytes: projection.serializedSizeBytes,
        projectedStorageFeeNanoErg: projection.projectedStorageFeeNanoErg,
        feeCovered: projection.feeCovered,
        parameterObservedAtHeight: projection.parameterObservedAtHeight,
        neutralMaintenanceEligible: projection.neutralMaintenanceEligible,
        requiredTransition: projection.neutralMaintenanceEligible
          ? 'reviewed-no-ingest-transition-with-separate-authorization'
          : surface?.reason ?? 'reviewed-semantic-transition-required',
      },
    );
  }

  private async observeMainChainLockFragmentation(): Promise<void> {
    try {
      const lockBoxes = await this.storageRentErgo.getUnspentBoxesByAddressPage(
        this.deployed.mainChainLock.address,
        {
          offset: 0,
          limit: 10,
          sortDirection: 'asc',
        },
      );
      if (lockBoxes.length >= 10) {
        log('warn', 'MainChainLock fragmentation observed; generic consolidation remains disabled', {
          surfaceId: 'main-chain-lock-v1',
          boxCount: lockBoxes.length,
          allowedTransitions: 'contract-defined-commit-or-refund',
          signingPerformed: false,
          submissionPerformed: false,
          broadcastPerformed: false,
        });
      }
    } catch {
      log('error', 'MainChainLock fragmentation observation unavailable');
    }
  }
}

// ─── Entry Point ───────────────────────────────────────────────

const daemon = new BridgeRelayerDaemon();
daemon.start().catch(err => {
  log('error', 'Fatal error', { error: err.message, stack: err.stack });
  process.exit(1);
});
