/**
 * Relayer Configuration
 * 
 * All contract addresses, NFT IDs, and deployment metadata are loaded
 * from deployed_state.json after contract deployment.
 */

import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEPLOYED_STATE_FILE = resolve(__dirname, '../../contracts/deployed_state.json');

// Static Config

export const ERGO_CONFIG = {
  nodeUrl: process.env.ERGO_NODE_URL ?? 'http://127.0.0.1:9052',
  readQuorumWitnessNodeUrl: process.env.ERGO_READ_QUORUM_WITNESS_NODE_URL
    ?? process.env.ERGO_AGGREGATE_SETTLEMENT_WITNESS_NODE_URL
    ?? process.env.ERGO_AUTHENTICATED_TRACKER_WITNESS_NODE_URL,
  readQuorumPrimaryNodeIdentityDigestHex:
    process.env.ERGO_READ_QUORUM_PRIMARY_IDENTITY_DIGEST
    ?? process.env.ERGO_AGGREGATE_SETTLEMENT_PRIMARY_IDENTITY_DIGEST,
  readQuorumPrimaryAdministrationIdentityDigestHex:
    process.env.ERGO_READ_QUORUM_PRIMARY_ADMINISTRATION_DIGEST
    ?? process.env.ERGO_AGGREGATE_SETTLEMENT_PRIMARY_ADMINISTRATION_DIGEST,
  readQuorumWitnessNodeIdentityDigestHex:
    process.env.ERGO_READ_QUORUM_WITNESS_IDENTITY_DIGEST
    ?? process.env.ERGO_AGGREGATE_SETTLEMENT_WITNESS_IDENTITY_DIGEST,
  readQuorumWitnessAdministrationIdentityDigestHex:
    process.env.ERGO_READ_QUORUM_WITNESS_ADMINISTRATION_DIGEST
    ?? process.env.ERGO_AGGREGATE_SETTLEMENT_WITNESS_ADMINISTRATION_DIGEST,
  authenticatedTrackerWitnessNodeUrl: process.env.ERGO_AUTHENTICATED_TRACKER_WITNESS_NODE_URL,
  aggregateSettlementWitnessNodeUrl: process.env.ERGO_AGGREGATE_SETTLEMENT_WITNESS_NODE_URL
    ?? process.env.ERGO_AUTHENTICATED_TRACKER_WITNESS_NODE_URL,
  aggregateSettlementPrimaryNodeIdentityDigestHex:
    process.env.ERGO_AGGREGATE_SETTLEMENT_PRIMARY_IDENTITY_DIGEST,
  aggregateSettlementPrimaryAdministrationIdentityDigestHex:
    process.env.ERGO_AGGREGATE_SETTLEMENT_PRIMARY_ADMINISTRATION_DIGEST,
  aggregateSettlementWitnessNodeIdentityDigestHex:
    process.env.ERGO_AGGREGATE_SETTLEMENT_WITNESS_IDENTITY_DIGEST,
  aggregateSettlementWitnessAdministrationIdentityDigestHex:
    process.env.ERGO_AGGREGATE_SETTLEMENT_WITNESS_ADMINISTRATION_DIGEST,
  apiKey: process.env.ERGO_API_KEY ?? 'hello',
  explorerUrl: 'https://api-testnet.ergoplatform.com',
} as const;

export interface ErgoReadQuorumSourceIdentityConfig {
  witnessNodeUrl: string;
  primaryNodeIdentityDigestHex: string;
  primaryAdministrationIdentityDigestHex: string;
  witnessNodeIdentityDigestHex: string;
  witnessAdministrationIdentityDigestHex: string;
}

export function getErgoReadQuorumSourceIdentityConfig(
  input: {
    witnessNodeUrl?: string;
    primaryNodeIdentityDigestHex?: string;
    primaryAdministrationIdentityDigestHex?: string;
    witnessNodeIdentityDigestHex?: string;
    witnessAdministrationIdentityDigestHex?: string;
  } = {
    witnessNodeUrl: ERGO_CONFIG.readQuorumWitnessNodeUrl,
    primaryNodeIdentityDigestHex:
      ERGO_CONFIG.readQuorumPrimaryNodeIdentityDigestHex,
    primaryAdministrationIdentityDigestHex:
      ERGO_CONFIG.readQuorumPrimaryAdministrationIdentityDigestHex,
    witnessNodeIdentityDigestHex:
      ERGO_CONFIG.readQuorumWitnessNodeIdentityDigestHex,
    witnessAdministrationIdentityDigestHex:
      ERGO_CONFIG.readQuorumWitnessAdministrationIdentityDigestHex,
  },
): ErgoReadQuorumSourceIdentityConfig | null {
  if (!input.witnessNodeUrl) return null;
  const required = [
    ['ERGO_READ_QUORUM_PRIMARY_IDENTITY_DIGEST', input.primaryNodeIdentityDigestHex],
    [
      'ERGO_READ_QUORUM_PRIMARY_ADMINISTRATION_DIGEST',
      input.primaryAdministrationIdentityDigestHex,
    ],
    ['ERGO_READ_QUORUM_WITNESS_IDENTITY_DIGEST', input.witnessNodeIdentityDigestHex],
    [
      'ERGO_READ_QUORUM_WITNESS_ADMINISTRATION_DIGEST',
      input.witnessAdministrationIdentityDigestHex,
    ],
  ] as const;
  const missing = required
    .filter(([, value]) => typeof value !== 'string' || value.length === 0)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `Ergo read quorum requires pinned source identities: ${missing.join(', ')}`,
    );
  }
  return {
    witnessNodeUrl: input.witnessNodeUrl,
    primaryNodeIdentityDigestHex: input.primaryNodeIdentityDigestHex!,
    primaryAdministrationIdentityDigestHex:
      input.primaryAdministrationIdentityDigestHex!,
    witnessNodeIdentityDigestHex: input.witnessNodeIdentityDigestHex!,
    witnessAdministrationIdentityDigestHex:
      input.witnessAdministrationIdentityDigestHex!,
  };
}

export interface AggregateSettlementRecoverySourceIdentityConfig {
  primaryNodeIdentityDigestHex: string;
  primaryAdministrationIdentityDigestHex: string;
  witnessNodeIdentityDigestHex: string;
  witnessAdministrationIdentityDigestHex: string;
}

export function getAggregateSettlementRecoverySourceIdentityConfig(
  input: {
    witnessNodeUrl?: string;
    primaryNodeIdentityDigestHex?: string;
    primaryAdministrationIdentityDigestHex?: string;
    witnessNodeIdentityDigestHex?: string;
    witnessAdministrationIdentityDigestHex?: string;
  } = {
    witnessNodeUrl: ERGO_CONFIG.aggregateSettlementWitnessNodeUrl,
    primaryNodeIdentityDigestHex:
      ERGO_CONFIG.aggregateSettlementPrimaryNodeIdentityDigestHex,
    primaryAdministrationIdentityDigestHex:
      ERGO_CONFIG.aggregateSettlementPrimaryAdministrationIdentityDigestHex,
    witnessNodeIdentityDigestHex:
      ERGO_CONFIG.aggregateSettlementWitnessNodeIdentityDigestHex,
    witnessAdministrationIdentityDigestHex:
      ERGO_CONFIG.aggregateSettlementWitnessAdministrationIdentityDigestHex,
  },
): AggregateSettlementRecoverySourceIdentityConfig | null {
  if (!input.witnessNodeUrl) return null;
  const required = [
    [
      'ERGO_AGGREGATE_SETTLEMENT_PRIMARY_IDENTITY_DIGEST',
      input.primaryNodeIdentityDigestHex,
    ],
    [
      'ERGO_AGGREGATE_SETTLEMENT_PRIMARY_ADMINISTRATION_DIGEST',
      input.primaryAdministrationIdentityDigestHex,
    ],
    [
      'ERGO_AGGREGATE_SETTLEMENT_WITNESS_IDENTITY_DIGEST',
      input.witnessNodeIdentityDigestHex,
    ],
    [
      'ERGO_AGGREGATE_SETTLEMENT_WITNESS_ADMINISTRATION_DIGEST',
      input.witnessAdministrationIdentityDigestHex,
    ],
  ] as const;
  const missing = required
    .filter(([, value]) => typeof value !== 'string' || value.length === 0)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `aggregate settlement recovery witness requires pinned source identities: ${missing.join(', ')}`,
    );
  }
  return {
    primaryNodeIdentityDigestHex: input.primaryNodeIdentityDigestHex!,
    primaryAdministrationIdentityDigestHex: input.primaryAdministrationIdentityDigestHex!,
    witnessNodeIdentityDigestHex: input.witnessNodeIdentityDigestHex!,
    witnessAdministrationIdentityDigestHex: input.witnessAdministrationIdentityDigestHex!,
  };
}

export const SUBSTRATE_CONFIG = {
  network: process.env.SIDECHAIN_NETWORK ?? process.env.SUBSTRATE_NETWORK ?? 'patched-devnet',
  wsUrl: process.env.SUBSTRATE_WS_URL ?? 'ws://localhost:9945',
  evmRpcUrl: process.env.SUBSTRATE_EVM_URL ?? 'http://localhost:9945',
  backingWitnessEvmRpcUrl: process.env.SIDECHAIN_BACKING_WITNESS_RPC_URL,
  backingPrimaryNodeIdentityDigestHex:
    process.env.SIDECHAIN_BACKING_PRIMARY_IDENTITY_DIGEST,
  backingPrimaryAdministrationIdentityDigestHex:
    process.env.SIDECHAIN_BACKING_PRIMARY_ADMINISTRATION_DIGEST,
  backingWitnessNodeIdentityDigestHex:
    process.env.SIDECHAIN_BACKING_WITNESS_IDENTITY_DIGEST,
  backingWitnessAdministrationIdentityDigestHex:
    process.env.SIDECHAIN_BACKING_WITNESS_ADMINISTRATION_DIGEST,
  spvSidechainIdHex: process.env.SPV_SIDECHAIN_ID_HEX ?? '11'.repeat(32),
  // Alith dev account (pre-funded in Frontier dev chains)
  relayerPrivateKey: process.env.EVM_PRIVATE_KEY
    ?? '0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133',
} as const;

export interface SidechainBackingSourceIdentityConfig {
  witnessRpcUrl: string;
  primaryNodeIdentityDigestHex: string;
  primaryAdministrationIdentityDigestHex: string;
  witnessNodeIdentityDigestHex: string;
  witnessAdministrationIdentityDigestHex: string;
}

export function getSidechainBackingSourceIdentityConfig(
  input: {
    witnessRpcUrl?: string;
    primaryNodeIdentityDigestHex?: string;
    primaryAdministrationIdentityDigestHex?: string;
    witnessNodeIdentityDigestHex?: string;
    witnessAdministrationIdentityDigestHex?: string;
  } = {
    witnessRpcUrl: SUBSTRATE_CONFIG.backingWitnessEvmRpcUrl,
    primaryNodeIdentityDigestHex:
      SUBSTRATE_CONFIG.backingPrimaryNodeIdentityDigestHex,
    primaryAdministrationIdentityDigestHex:
      SUBSTRATE_CONFIG.backingPrimaryAdministrationIdentityDigestHex,
    witnessNodeIdentityDigestHex:
      SUBSTRATE_CONFIG.backingWitnessNodeIdentityDigestHex,
    witnessAdministrationIdentityDigestHex:
      SUBSTRATE_CONFIG.backingWitnessAdministrationIdentityDigestHex,
  },
): SidechainBackingSourceIdentityConfig | null {
  if (!input.witnessRpcUrl) return null;
  const required = [
    [
      'SIDECHAIN_BACKING_PRIMARY_IDENTITY_DIGEST',
      input.primaryNodeIdentityDigestHex,
    ],
    [
      'SIDECHAIN_BACKING_PRIMARY_ADMINISTRATION_DIGEST',
      input.primaryAdministrationIdentityDigestHex,
    ],
    [
      'SIDECHAIN_BACKING_WITNESS_IDENTITY_DIGEST',
      input.witnessNodeIdentityDigestHex,
    ],
    [
      'SIDECHAIN_BACKING_WITNESS_ADMINISTRATION_DIGEST',
      input.witnessAdministrationIdentityDigestHex,
    ],
  ] as const;
  const missing = required
    .filter(([, value]) => typeof value !== 'string' || value.length === 0)
    .map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `Frontier backing read agreement requires pinned source identities: ${missing.join(', ')}`,
    );
  }
  return {
    witnessRpcUrl: input.witnessRpcUrl,
    primaryNodeIdentityDigestHex: input.primaryNodeIdentityDigestHex!,
    primaryAdministrationIdentityDigestHex:
      input.primaryAdministrationIdentityDigestHex!,
    witnessNodeIdentityDigestHex: input.witnessNodeIdentityDigestHex!,
    witnessAdministrationIdentityDigestHex:
      input.witnessAdministrationIdentityDigestHex!,
  };
}

export const PROTOCOL_PARAMS = {
  /** Sidechain confirmations required before peg-out Phase 2 */
  confirmationDepth: parseInt(process.env.CONFIRMATION_DEPTH ?? '50', 10),
  /** Inclusive Ergo confirmations required for a committed peg-in vault output */
  pegInCommitConfirmations: Math.max(
    parseInt(process.env.PEG_IN_COMMIT_CONFIRMATIONS ?? '10', 10),
    10,
  ),
  /** Polling interval for new blocks (ms) */
  pollingIntervalMs: parseInt(process.env.POLLING_INTERVAL_MS ?? '5000', 10),
  /** Maximum age and wall-clock duration of an Ergo read-quorum probe. */
  ergoReadQuorumMaxAgeMs: Math.max(
    parseInt(process.env.ERGO_READ_QUORUM_MAX_AGE_MS ?? '30000', 10),
    1_000,
  ),
  /** Minimum lock amount (nanoERG) -- 0.01 ERG */
  minLockAmountNanoErg: 10_000_000n,
  /** Minimum ERG to keep in bridge boxes for storage rent */
  minBoxValueNanoErg: 2_000_000n,
  /** Standard miner fee (nanoERG) */
  minerFeeNanoErg: 1_100_000n,
  /** Require an explicit operator opt-in before any code path broadcasts Ergo transactions */
  broadcastEnabled: process.env.BRIDGE_BROADCAST_ENABLED === 'true',
  /** Retain historical aggregate confirmation/recovery and fail-closed burn holding */
  aggregateSettlementEnabled: process.env.AGGREGATE_SETTLEMENT_ENABLED === 'true',
  /** Retained batch diagnostic/demo shape flag; it cannot enable new V1 submission */
  aggregateBatchEnabled: process.env.AGGREGATE_BATCH_ENABLED === 'true',
  /** Maximum claims per batch settlement TX (hard cap: MainChainAggregateUnlockBatch.es = 10) */
  aggregateBatchMaxClaims: Math.min(
    parseInt(process.env.AGGREGATE_BATCH_MAX_CLAIMS ?? '10', 10),
    10,
  ),
  /** Minimum Ergo confirmations before a 0x0401 anchor can feed aggregate settlement */
  aggregateAnchorMinConfirmations: parseInt(process.env.AGGREGATE_ANCHOR_MIN_CONFIRMATIONS ?? '10', 10),
  /** Confirmed Ergo blocks to scan backwards for an aggregate 0x0401 anchor */
  aggregateAnchorLookbackBlocks: parseInt(process.env.AGGREGATE_ANCHOR_LOOKBACK_BLOCKS ?? '720', 10),
} as const;

export const OPERATOR_ALERT_CONFIG = {
  /** Non-authoritative queue; the retained current alert rebuilds after loss. */
  outboxDatabasePath:
    process.env.OPERATOR_ALERT_OUTBOX_DB_PATH
    ?? './operator-alert-outbox.sqlite',
} as const;

// Dynamic Config (from deployment)

export interface DeployedState {
  network: string;
  deployedAt: string;
  sideChainState: {
    nftId: string;
    boxId: string;
    txId?: string;
    address: string;
    ergoTreeHex: string;
  };
  doubleUnlockPrevention: {
    nftId: string;
    boxId: string;
    txId?: string;
    address: string;
    ergoTreeHex: string;
  };
  doubleUnlockPreventionAggregate?: {
    nftId: string;
    boxId: string;
    txId?: string;
    address: string;
    ergoTreeHex: string;
  };
  spvTracker?: {
    nftId: string;
    boxId: string;
    txId?: string;
    address: string;
    ergoTreeHex: string;
  };
  mainChainLock: {
    address: string;
    ergoTreeHex: string;
    /** Activates consume-before-mint only after a reviewed v3 deployment. */
    version?: 'committed-vault-v3';
    /** Compile-time V2 vault destination embedded in MainChainLock v3. */
    settlementVaultErgoTreeHex?: string;
  };
  /** Immutable prior MCL contracts retained only for classification/migration. */
  legacyMainChainLocks?: Array<{
    version: string;
    address: string;
    ergoTreeHex: string;
  }>;
  mainChainUnlock: {
    address: string;
    ergoTreeHex: string;
  };
  mainChainAggregateUnlock?: {
    address: string;
    ergoTreeHex: string;
  };
  /** Header-authenticated V2 tracker used as the settlement data input. */
  spvTrackerAuthenticated?: {
    nftId: string;
    /** Immutable setup-box identity used as the reconstruction root. */
    genesisBoxId?: string;
    /** Populated/current tracker box recorded by the deployment workflow. */
    boxId: string;
    txId?: string;
    address: string;
    ergoTreeHex: string;
  };
  /** Trustless single-leaf unlock contract for candidate V2 aggregate settlement */
  mainChainAggregateUnlockTrustless?: {
    address: string;
    ergoTreeHex: string;
  };
  /** V2 replay singleton bound to the authenticated settlement contract. */
  doubleUnlockPreventionAuthenticated?: {
    nftId: string;
    boxId: string;
    txId?: string;
    address: string;
    ergoTreeHex: string;
  };
  /** Settlement vault that consumes authenticated V2 checkpoint proofs. */
  mainChainAggregateUnlockAuthenticated?: {
    address: string;
    ergoTreeHex: string;
  };
  /** Batch DUP singleton for multi-claim settlement (Phase 011a Spike 11) */
  doubleUnlockPreventionAggregateBatch?: {
    nftId: string;
    boxId: string;
    txId?: string;
    address: string;
    ergoTreeHex: string;
  };
  /** Batch unlock contract for multi-claim settlement (Phase 011a Spike 11) */
  mainChainAggregateUnlockBatch?: {
    address: string;
    ergoTreeHex: string;
  };
  relayer: {
    address: string;
    publicKey: string;
  };
  committee?: {
    publicKeys: string[];
    primaryPublicKey: string;
    threshold: string;
  };
  solidity?: {
    sergAddress: string;
    bridgeAddress: string;
    /** Canonical decimal EVM chain ID observed by the deployment provider. */
    evmChainId?: string;
    /** Native Frontier block containing the ErgoBridge deployment transaction. */
    bridgeDeploymentBlock?: number;
  };
}

let _deployedState: DeployedState | null = null;

function readDeployedStateFile(): string {
  if (!existsSync(DEPLOYED_STATE_FILE)) {
    throw new Error(
      `deployed_state.json not found at ${DEPLOYED_STATE_FILE}. ` +
      'Provision an approved deployment profile before starting the daemon.'
    );
  }
  return readFileSync(DEPLOYED_STATE_FILE, 'utf-8');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`;
}

export function computeDeployedStateHash(): string {
  const parsed = JSON.parse(readDeployedStateFile()) as unknown;
  return createHash('sha256').update(canonicalJson(parsed)).digest('hex');
}

export function loadDeployedState(): DeployedState {
  if (_deployedState) return _deployedState;

  const raw = readDeployedStateFile();
  _deployedState = JSON.parse(raw) as DeployedState;
  console.log(`[OK] Loaded deployed state (network: ${_deployedState.network})`);
  return _deployedState;
}
