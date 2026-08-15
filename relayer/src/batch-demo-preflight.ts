/**
 * Batch Demo Preflight -- reusable pure helpers for environment readiness checks.
 *
 * These helpers normalize node API responses, classify liquidity status,
 * and format nanoERG values. They require no live node -- all pure functions.
 */

export type PreflightStatus = 'PASS' | 'WARN' | 'FAIL';

export interface PreflightCheck {
  name: string;
  status: PreflightStatus;
  message: string;
}

/**
 * Normalize paginated node API responses.
 * Some endpoints return `[...]`, others `{ items: [...] }`.
 */
export function asBoxArray(resp: unknown): any[] {
  if (Array.isArray(resp)) return resp;
  if (resp && typeof resp === 'object' && 'items' in resp && Array.isArray((resp as any).items)) {
    return (resp as any).items;
  }
  return [];
}

/**
 * Filter boxes to only pure-ERG (no tokens) boxes.
 */
export function findPureErgBoxes(boxes: any[]): any[] {
  return boxes.filter((b: any) => !b.assets || b.assets.length === 0);
}

/**
 * Format nanoERG as a human-readable ERG string.
 */
export function formatNanoErg(nanoErg: bigint): string {
  const whole = nanoErg / 1_000_000_000n;
  const frac = nanoErg % 1_000_000_000n;
  const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '') || '0';
  return `${whole}.${fracStr} ERG`;
}

/**
 * Classify liquidity readiness based on available pure-ERG boxes.
 */
export function classifyLiquidityStatus(
  pureErgBoxes: any[],
  requiredNanoErg: bigint,
): { status: PreflightStatus; totalNanoErg: bigint; largestNanoErg: bigint; boxCount: number } {
  const values = pureErgBoxes.map((b: any) => BigInt(b.value));
  const totalNanoErg = values.reduce((a, b) => a + b, 0n);
  const largestNanoErg = values.length > 0 ? values.reduce((a, b) => (a > b ? a : b), 0n) : 0n;

  let status: PreflightStatus;
  if (totalNanoErg === 0n) {
    status = 'FAIL';
  } else if (largestNanoErg < requiredNanoErg) {
    status = 'WARN';
  } else {
    status = 'PASS';
  }

  return { status, totalNanoErg, largestNanoErg, boxCount: pureErgBoxes.length };
}

/**
 * Check if the overall preflight has any critical failures.
 */
export function hasFailure(checks: PreflightCheck[]): boolean {
  return checks.some((c) => c.status === 'FAIL');
}

/**
 * Known context extension Var counts for each settlement input type.
 *
 * These are derived from the contract extension layouts, not from live
 * transactions. See aggregate-settlement-tx.ts (V1) and
 * aggregate-settlement-builder.ts (batch) for the builder code.
 */
export const SETTLEMENT_VAR_COUNTS = {
  v1Unlock: 8,
  batchDup: (n: number) => 2 + 2 * n,
  batchUnlock: (n: number) => 2 + 3 * n,
} as const;

export const DEFAULT_SIGNING_READINESS_BATCH_CLAIMS = 10;

export function resolveSigningReadinessBatchClaims(
  raw: string | null | undefined,
  fallback = DEFAULT_SIGNING_READINESS_BATCH_CLAIMS,
): number {
  const parsed = raw === null || raw === undefined || raw.trim() === ''
    ? Number.NaN
    : Number(raw);
  if (Number.isSafeInteger(parsed) && parsed >= 1) return parsed;
  return fallback;
}

/**
 * Classify live settlement signing readiness against the ContextExtension
 * guard threshold.
 *
 * This is a pure formula check -- no signing, no node calls. It reports
 * whether current V1/batch settlement paths would be blocked by the
 * ContextExtension safety guard at signing time.
 *
 * @param threshold -- current guard threshold (MAX_SAFE_CONTEXT_EXTENSION_VARS)
 * @param batchN -- configured max batch claim count (defaults to 10)
 */
export function classifySigningReadiness(
  threshold: number,
  batchN = DEFAULT_SIGNING_READINESS_BATCH_CLAIMS,
): PreflightCheck {
  const checkedBatchN = Number.isSafeInteger(batchN) && batchN >= 1
    ? batchN
    : DEFAULT_SIGNING_READINESS_BATCH_CLAIMS;
  const v1Blocked = SETTLEMENT_VAR_COUNTS.v1Unlock > threshold;
  const batchDupBlocked = SETTLEMENT_VAR_COUNTS.batchDup(checkedBatchN) > threshold;
  const batchUnlockBlocked = SETTLEMENT_VAR_COUNTS.batchUnlock(checkedBatchN) > threshold;
  const anyBlocked = v1Blocked || batchDupBlocked || batchUnlockBlocked;

  if (!anyBlocked) {
    return {
      name: 'Live settlement signing',
      status: 'PASS',
      message: `Checked settlement paths up to batch N=${checkedBatchN} have <=${threshold} Vars per input`,
    };
  }

  const blocked: string[] = [];
  if (v1Blocked) blocked.push(`V1 unlock=${SETTLEMENT_VAR_COUNTS.v1Unlock}`);
  if (batchDupBlocked) blocked.push(`batch DUP(N=${checkedBatchN})=${SETTLEMENT_VAR_COUNTS.batchDup(checkedBatchN)}`);
  if (batchUnlockBlocked) blocked.push(`batch unlock(N=${checkedBatchN})=${SETTLEMENT_VAR_COUNTS.batchUnlock(checkedBatchN)}`);

  return {
    name: 'Live settlement signing',
    status: 'FAIL',
    message:
      `BLOCKED -- ${blocked.join(', ')} exceed temporary ${threshold}-Var policy. ` +
      `Pending sigma-rust/JVM ContextExtension serialization conformance (not a permanent ErgoScript limit).`,
  };
}

/**
 * Format the preflight report for console output.
 */
export function formatPreflightReport(checks: PreflightCheck[], title = 'Batch Demo Preflight'): string {
  const lines = checks.map((c) => `  [${c.status}] ${c.name}: ${c.message}`);
  const header = `=== ${title} ===`;
  const footer = hasFailure(checks) ? 'Preflight FAILED -- resolve FAIL items before demo' : 'Preflight PASSED';
  return [header, ...lines, '', footer].join('\n');
}
