/**
 * Pure helpers for devnet funding preflight.
 *
 * Extracted for unit testing without I/O, process.exit(), or network calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FundingCheckResult {
  status: 'PASS' | 'WARN' | 'FAIL';
  label: string;
  detail: string;
}

// ---------------------------------------------------------------------------
// Constants - funding requirements derived from deploy script analysis
// ---------------------------------------------------------------------------

/**
 * Historical funding estimate retained for V1 demo compatibility diagnostics.
 * It is not a current deployment requirement and does not authorize recreating
 * any retired mint, aggregate deployment, signing, or settlement route.
 *
 * Breakdown (nanoERG):
 *   former generic deployment:
 *     4 singleton boxes (SCS, DUP, SPVTracker, AggDUP) @ 5M each   = 20M
 *     4 miner fees @ 1.1M each                                      =  4.4M
 *   former aggregate deployment:
 *     batch singleton 5M + fee 1.1M                                  =  6.1M
 *     liquidity box 10M + fee 1.1M                                   = 11.1M
 *   former e2e trigger (seedSergIfNeeded):
 *     MainChainLock seed (2 burns @ 10M each) + fees                 = 23.3M
 *   settlement:
 *     fee box for settlement TX                                      =  2.2M
 *   headroom for change dust, retries, and operational margin        = 33M
 *   -----------------------------------------------------------------------
 *   Total estimate                                                   = 100.1M
 *   Rounded up with safe margin                                      = 150M
 */
export const DEVNET_MIN_FUNDING_NANOERG = 150_000_000n; // 0.15 ERG

/**
 * Comfortable funding level - covers multiple retries and exploration.
 */
export const DEVNET_COMFORTABLE_FUNDING_NANOERG = 500_000_000n; // 0.5 ERG

// ---------------------------------------------------------------------------
// Pure classification
// ---------------------------------------------------------------------------

export function classifyFunding(
  balanceNanoErg: bigint,
  minRequired: bigint = DEVNET_MIN_FUNDING_NANOERG,
  comfortable: bigint = DEVNET_COMFORTABLE_FUNDING_NANOERG,
): FundingCheckResult {
  const balanceErg = formatErg(balanceNanoErg);
  const minErg = formatErg(minRequired);
  const comfortErg = formatErg(comfortable);

  if (balanceNanoErg >= comfortable) {
    return {
      status: 'PASS',
      label: 'Relayer funding',
      detail: `${balanceErg} ERG (>= ${comfortErg} comfortable minimum)`,
    };
  }
  if (balanceNanoErg >= minRequired) {
    return {
      status: 'PASS',
      label: 'Relayer funding',
      detail: `${balanceErg} ERG (>= ${minErg} minimum, below ${comfortErg} comfortable)`,
    };
  }
  return {
    status: 'WARN',
    label: 'Relayer funding',
    detail: `${balanceErg} ERG -- below ${minErg} minimum for e2e run`,
  };
}

/**
 * Classify deploy readiness based on P2PK balance vs reward balance.
 * Deploy scripts only consume P2PK boxes. Reward boxes must be consolidated first.
 */
export function classifyDeployReadiness(
  p2pkBalance: bigint,
  rewardBalance: bigint,
  comfortable: bigint = DEVNET_COMFORTABLE_FUNDING_NANOERG,
): FundingCheckResult {
  const p2pkErg = formatErg(p2pkBalance);
  const rewardErg = formatErg(rewardBalance);
  const comfortErg = formatErg(comfortable);

  if (p2pkBalance >= comfortable) {
    return {
      status: 'PASS',
      label: 'Deploy readiness',
      detail: `P2PK: ${p2pkErg} ERG (>= ${comfortErg}). Ready to deploy.`,
    };
  }
  if (rewardBalance > 0n) {
    return {
      status: 'WARN',
      label: 'Deploy readiness',
      detail: `P2PK: ${p2pkErg} ERG (below ${comfortErg}). Reward: ${rewardErg} ERG -- run demo:devnet:consolidate-rewards`,
    };
  }
  return {
    status: 'WARN',
    label: 'Deploy readiness',
    detail: `P2PK: ${p2pkErg} ERG, Reward: 0 ERG -- no controlled funds found`,
  };
}

export function classifyNodeOffline(url: string): FundingCheckResult {
  return {
    status: 'WARN',
    label: 'Relayer funding',
    detail: `node offline at ${url} -- cannot check balance`,
  };
}

export function classifySignerMissing(reason: string): FundingCheckResult {
  return {
    status: 'WARN',
    label: 'Relayer signer config',
    detail: reason,
  };
}

/**
 * Sum pure ERG value from a list of unspent boxes.
 * Only counts boxes without tokens (pure ERG UTXOs).
 * Token-bearing boxes are excluded because deployment builders
 * may not preserve unrelated tokens when spending funding boxes.
 */
export function sumPureErgBalance(boxes: Array<{ value: string | number | bigint; assets?: any[] }>): bigint {
  let total = 0n;
  for (const box of boxes) {
    if (box.assets && box.assets.length > 0) continue; // skip token boxes
    total += BigInt(box.value);
  }
  return total;
}

/**
 * Format nanoERG as human-readable ERG string.
 */
export function formatErg(nanoErg: bigint): string {
  const whole = nanoErg / 1_000_000_000n;
  const frac = nanoErg % 1_000_000_000n;
  const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '') || '0';
  return `${whole}.${fracStr}`;
}

/**
 * Format the funding report as plain ASCII.
 */
export function formatFundingReport(
  result: FundingCheckResult,
  address?: string,
  nodeUrl?: string,
): string {
  const lines: string[] = [];
  const SEP = '='.repeat(70);

  lines.push(SEP);
  lines.push('  Devnet Funding Preflight');
  lines.push(SEP);
  lines.push('');

  if (nodeUrl) {
    lines.push(`  Ergo node: ${nodeUrl}`);
  }
  if (address) {
    lines.push(`  Relayer address: ${address}`);
  }

  lines.push('');
  const prefix =
    result.status === 'FAIL' ? '  [FAIL]' :
    result.status === 'WARN' ? '  [WARN]' :
    '  [PASS]';
  lines.push(`${prefix} ${result.label}: ${result.detail}`);
  lines.push('');
  lines.push(`  Minimum required: ${formatErg(DEVNET_MIN_FUNDING_NANOERG)} ERG`);
  lines.push(`  Comfortable level: ${formatErg(DEVNET_COMFORTABLE_FUNDING_NANOERG)} ERG`);
  lines.push('');

  return lines.join('\n');
}
