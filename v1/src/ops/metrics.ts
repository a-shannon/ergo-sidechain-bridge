/**
 * Zero-dependency Prometheus v0.0.4 text exposition renderer for Bridge V1/V1.2
 * operational observability (solvency, storage rent, indexer lag, EVM state, and
 * isolated multi-host signer-node counters).
 */

export interface BridgeMetricsSnapshot {
  network: 'mainnet' | 'testnet';
  familyId: string;
  ergoFullHeight: number;
  ergoIndexedHeight: number;
  reserveErgNano: bigint;
  reserveLiabilityNano: bigint;
  reserveBufferNano: bigint;
  reserveAgeBlocks: number;
  dupAgeBlocks: number;
  trackerAgeBlocks: number;
  trackerLatestSourceHeight: bigint;
  trackerMode: 'FEDERATED' | 'EIP0045_STARK';
  trackerEpoch: bigint;
  trackerPendingUpgradeMode: number;
  evmRpcReachable: boolean;
  evmBlockNumber?: number;
  evmSergTotalSupplyNano?: bigint;
  evmPaused?: boolean;
  solvencyStatus: 'OK' | 'ALERT' | 'EVM_UNVERIFIED';
}

export type SignerMetricOutcome =
  | 'ok'
  | 'auth_rejected'
  | 'policy_rejected'
  | 'replay'
  | 'rate_limited'
  | 'error';

export interface SignerMetricsSnapshot {
  pubKeyHex: string;
  familyIdHex: string;
  tlsEnabled: boolean;
  mtlsRequired: boolean;
  activeSessions: number;
  seenNonces: number;
  uptimeSeconds: number;
  commitCounts: Record<SignerMetricOutcome, number>;
  signCounts: Record<SignerMetricOutcome, number>;
}

function escapeLabelValue(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function fmtLabels(labels: Record<string, string>): string {
  const parts = Object.entries(labels).map(([k, v]) => `${k}="${escapeLabelValue(v)}"`);
  return parts.length > 0 ? `{${parts.join(',')}}` : '';
}

function fmtNum(v: number | bigint): string {
  if (typeof v === 'bigint') return v.toString();
  if (!Number.isFinite(v)) return '0';
  return String(v);
}

export function renderBridgePrometheusMetrics(s: BridgeMetricsSnapshot): string {
  const baseLabels = {
    network: s.network,
    family_id: s.familyId.slice(0, 16),
  };
  const b = fmtLabels(baseLabels);
  const indexerLag = Math.max(0, s.ergoFullHeight - s.ergoIndexedHeight);

  const lines: string[] = [
    '# HELP bridge_up Whether the Bridge Web/Metrics telemetry collector responded successfully.',
    '# TYPE bridge_up gauge',
    `bridge_up${b} 1`,
    '# HELP bridge_ergo_full_height Current Ergo L1 full block height.',
    '# TYPE bridge_ergo_full_height gauge',
    `bridge_ergo_full_height${b} ${fmtNum(s.ergoFullHeight)}`,
    '# HELP bridge_ergo_indexed_height Current Ergo node extra-index height.',
    '# TYPE bridge_ergo_indexed_height gauge',
    `bridge_ergo_indexed_height${b} ${fmtNum(s.ergoIndexedHeight)}`,
    '# HELP bridge_ergo_indexer_lag_blocks Difference between fullHeight and indexedHeight.',
    '# TYPE bridge_ergo_indexer_lag_blocks gauge',
    `bridge_ergo_indexer_lag_blocks${b} ${fmtNum(indexerLag)}`,
    '# HELP bridge_reserve_erg_nano Live ERG balance locked in BridgeReserve (nanoERG).',
    '# TYPE bridge_reserve_erg_nano gauge',
    `bridge_reserve_erg_nano${b} ${fmtNum(s.reserveErgNano)}`,
    '# HELP bridge_reserve_liability_nano Live tracked BridgeReserve R6 liability (nanoERG).',
    '# TYPE bridge_reserve_liability_nano gauge',
    `bridge_reserve_liability_nano${b} ${fmtNum(s.reserveLiabilityNano)}`,
    '# HELP bridge_reserve_buffer_nano Excess ERG buffer in BridgeReserve (value - R6, nanoERG).',
    '# TYPE bridge_reserve_buffer_nano gauge',
    `bridge_reserve_buffer_nano${b} ${fmtNum(s.reserveBufferNano)}`,
    '# HELP bridge_reserve_age_blocks Age in blocks of the live BridgeReserve box (storage rent limit ~1,051,200).',
    '# TYPE bridge_reserve_age_blocks gauge',
    `bridge_reserve_age_blocks${b} ${fmtNum(s.reserveAgeBlocks)}`,
    '# HELP bridge_dup_age_blocks Age in blocks of the live BridgeDup box.',
    '# TYPE bridge_dup_age_blocks gauge',
    `bridge_dup_age_blocks${b} ${fmtNum(s.dupAgeBlocks)}`,
    '# HELP bridge_tracker_age_blocks Age in blocks of the live BridgeTracker box.',
    '# TYPE bridge_tracker_age_blocks gauge',
    `bridge_tracker_age_blocks${b} ${fmtNum(s.trackerAgeBlocks)}`,
    '# HELP bridge_tracker_latest_source_height Latest admitted Frontier sidechain block height in BridgeTracker R7.',
    '# TYPE bridge_tracker_latest_source_height gauge',
    `bridge_tracker_latest_source_height${b} ${fmtNum(s.trackerLatestSourceHeight)}`,
    '# HELP bridge_tracker_epoch Active committee epoch in BridgeTracker R9 (0 when graduated to EIP-0045 STARK).',
    '# TYPE bridge_tracker_epoch gauge',
    `bridge_tracker_epoch${b} ${fmtNum(s.trackerEpoch)}`,
    '# HELP bridge_tracker_pending_upgrade_mode Pending BridgeTracker upgrade mode (0=none, 1=rotate, 2=eip0045_stark).',
    '# TYPE bridge_tracker_pending_upgrade_mode gauge',
    `bridge_tracker_pending_upgrade_mode${b} ${fmtNum(s.trackerPendingUpgradeMode)}`,
    '# HELP bridge_tracker_mode Active BridgeTracker mode one-hot indicator.',
    '# TYPE bridge_tracker_mode gauge',
    `bridge_tracker_mode${fmtLabels({ ...baseLabels, mode: 'federated' })} ${s.trackerMode === 'FEDERATED' ? 1 : 0}`,
    `bridge_tracker_mode${fmtLabels({ ...baseLabels, mode: 'eip0045_stark' })} ${s.trackerMode === 'EIP0045_STARK' ? 1 : 0}`,
    '# HELP bridge_evm_rpc_reachable Whether the configured Frontier EVM RPC is reachable (1=yes, 0=no).',
    '# TYPE bridge_evm_rpc_reachable gauge',
    `bridge_evm_rpc_reachable${b} ${s.evmRpcReachable ? 1 : 0}`,
  ];

  if (s.evmRpcReachable && s.evmBlockNumber !== undefined) {
    lines.push(
      '# HELP bridge_evm_block_number Current Frontier EVM block number.',
      '# TYPE bridge_evm_block_number gauge',
      `bridge_evm_block_number${b} ${fmtNum(s.evmBlockNumber)}`,
    );
  }
  if (s.evmRpcReachable && s.evmSergTotalSupplyNano !== undefined) {
    lines.push(
      '# HELP bridge_evm_serg_supply_nano Live sERG totalSupply on Frontier EVM (nanoERG).',
      '# TYPE bridge_evm_serg_supply_nano gauge',
      `bridge_evm_serg_supply_nano${b} ${fmtNum(s.evmSergTotalSupplyNano)}`,
    );
  }
  if (s.evmRpcReachable && s.evmPaused !== undefined) {
    lines.push(
      '# HELP bridge_evm_paused Whether ErgoBridge.sol is currently paused (1=paused, 0=active).',
      '# TYPE bridge_evm_paused gauge',
      `bridge_evm_paused${b} ${s.evmPaused ? 1 : 0}`,
    );
  }

  lines.push(
    '# HELP bridge_solvency_status Tri-state solvency status one-hot gauge (ok, unverified, alert).',
    '# TYPE bridge_solvency_status gauge',
    `bridge_solvency_status${fmtLabels({ ...baseLabels, status: 'ok' })} ${s.solvencyStatus === 'OK' ? 1 : 0}`,
    `bridge_solvency_status${fmtLabels({ ...baseLabels, status: 'unverified' })} ${s.solvencyStatus === 'EVM_UNVERIFIED' ? 1 : 0}`,
    `bridge_solvency_status${fmtLabels({ ...baseLabels, status: 'alert' })} ${s.solvencyStatus === 'ALERT' ? 1 : 0}`,
    '# HELP bridge_solvency_alert Critical alert indicator (1 if reserve < liability or sERG supply > liability).',
    '# TYPE bridge_solvency_alert gauge',
    `bridge_solvency_alert${b} ${s.solvencyStatus === 'ALERT' ? 1 : 0}`,
  );

  return `${lines.join('\n')}\n`;
}

export function renderSignerPrometheusMetrics(s: SignerMetricsSnapshot): string {
  const baseLabels = {
    signer_pubkey: s.pubKeyHex.slice(0, 16),
    family_id: s.familyIdHex.slice(0, 16),
  };
  const b = fmtLabels(baseLabels);

  const lines: string[] = [
    '# HELP bridge_signer_up Whether this isolated committee signer-node is running.',
    '# TYPE bridge_signer_up gauge',
    `bridge_signer_up${b} 1`,
    '# HELP bridge_signer_tls_enabled Whether TLS is enabled on the main ceremony listener.',
    '# TYPE bridge_signer_tls_enabled gauge',
    `bridge_signer_tls_enabled${b} ${s.tlsEnabled ? 1 : 0}`,
    '# HELP bridge_signer_mtls_required Whether mutual TLS client certificates are required on the main ceremony listener.',
    '# TYPE bridge_signer_mtls_required gauge',
    `bridge_signer_mtls_required${b} ${s.mtlsRequired ? 1 : 0}`,
    '# HELP bridge_signer_active_sessions Number of currently open Round-1 Schnorr nonce sessions.',
    '# TYPE bridge_signer_active_sessions gauge',
    `bridge_signer_active_sessions${b} ${fmtNum(s.activeSessions)}`,
    '# HELP bridge_signer_seen_nonces Number of active entries in the HTTP anti-replay nonce cache.',
    '# TYPE bridge_signer_seen_nonces gauge',
    `bridge_signer_seen_nonces${b} ${fmtNum(s.seenNonces)}`,
    '# HELP bridge_signer_uptime_seconds Process uptime in seconds since signer-node start.',
    '# TYPE bridge_signer_uptime_seconds gauge',
    `bridge_signer_uptime_seconds${b} ${fmtNum(Math.max(0, Math.floor(s.uptimeSeconds)))}`,
    '# HELP bridge_signer_requests_total Total ceremony requests handled by endpoint and outcome.',
    '# TYPE bridge_signer_requests_total counter',
  ];

  const outcomes: SignerMetricOutcome[] = [
    'ok',
    'auth_rejected',
    'policy_rejected',
    'replay',
    'rate_limited',
    'error',
  ];
  for (const outcome of outcomes) {
    lines.push(
      `bridge_signer_requests_total${fmtLabels({ ...baseLabels, endpoint: 'commit', result: outcome })} ${fmtNum(s.commitCounts[outcome] ?? 0)}`,
    );
  }
  for (const outcome of outcomes) {
    lines.push(
      `bridge_signer_requests_total${fmtLabels({ ...baseLabels, endpoint: 'sign', result: outcome })} ${fmtNum(s.signCounts[outcome] ?? 0)}`,
    );
  }

  return `${lines.join('\n')}\n`;
}
