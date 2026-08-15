/**
 * Tests for batch-demo-preflight pure helpers.
 * No live node required — all pure function tests.
 */

import { describe, it, expect } from 'vitest';
import {
  asBoxArray,
  findPureErgBoxes,
  formatNanoErg,
  classifyLiquidityStatus,
  classifySigningReadiness,
  resolveSigningReadinessBatchClaims,
  hasFailure,
  formatPreflightReport,
  SETTLEMENT_VAR_COUNTS,
  DEFAULT_SIGNING_READINESS_BATCH_CLAIMS,
  type PreflightCheck,
} from './batch-demo-preflight.js';
import { MAX_SAFE_CONTEXT_EXTENSION_VARS } from './context-extension-guard.js';

// ─── asBoxArray ──────────────────────────────────────────────────────

describe('asBoxArray', () => {
  it('returns bare array as-is', () => {
    const arr = [{ boxId: 'a' }, { boxId: 'b' }];
    expect(asBoxArray(arr)).toEqual(arr);
  });

  it('unwraps { items: [...] } paginated response', () => {
    const resp = { items: [{ boxId: 'c' }], total: 1 };
    expect(asBoxArray(resp)).toEqual([{ boxId: 'c' }]);
  });

  it('returns empty array for null/undefined', () => {
    expect(asBoxArray(null)).toEqual([]);
    expect(asBoxArray(undefined)).toEqual([]);
  });

  it('returns empty array for unexpected shape', () => {
    expect(asBoxArray({ error: 'not found' })).toEqual([]);
    expect(asBoxArray('string')).toEqual([]);
  });
});

// ─── findPureErgBoxes ────────────────────────────────────────────────

describe('findPureErgBoxes', () => {
  it('keeps boxes with no assets', () => {
    const boxes = [
      { boxId: 'a', value: '100000000', assets: [] },
      { boxId: 'b', value: '50000000' },
    ];
    expect(findPureErgBoxes(boxes)).toHaveLength(2);
  });

  it('removes boxes with tokens', () => {
    const boxes = [
      { boxId: 'a', value: '100000000', assets: [{ tokenId: 'nft1', amount: 1 }] },
      { boxId: 'b', value: '50000000', assets: [] },
    ];
    const result = findPureErgBoxes(boxes);
    expect(result).toHaveLength(1);
    expect(result[0].boxId).toBe('b');
  });
});

// ─── formatNanoErg ───────────────────────────────────────────────────

describe('formatNanoErg', () => {
  it('formats whole ERG amounts', () => {
    expect(formatNanoErg(1_000_000_000n)).toBe('1.0 ERG');
  });

  it('formats fractional ERG amounts', () => {
    expect(formatNanoErg(100_000_000n)).toBe('0.1 ERG');
  });

  it('formats zero', () => {
    expect(formatNanoErg(0n)).toBe('0.0 ERG');
  });

  it('formats large amounts', () => {
    expect(formatNanoErg(123_456_789_000n)).toBe('123.456789 ERG');
  });

  it('trims trailing zeros in fractional part', () => {
    expect(formatNanoErg(1_500_000_000n)).toBe('1.5 ERG');
  });
});

// ─── classifyLiquidityStatus ─────────────────────────────────────────

describe('classifyLiquidityStatus', () => {
  const required = 100_000_000n; // 0.1 ERG

  it('FAIL when no boxes', () => {
    const result = classifyLiquidityStatus([], required);
    expect(result.status).toBe('FAIL');
    expect(result.totalNanoErg).toBe(0n);
    expect(result.boxCount).toBe(0);
  });

  it('WARN when total > 0 but largest < required', () => {
    const boxes = [
      { value: '50000000' }, // 0.05 ERG
      { value: '30000000' }, // 0.03 ERG
    ];
    const result = classifyLiquidityStatus(boxes, required);
    expect(result.status).toBe('WARN');
    expect(result.totalNanoErg).toBe(80_000_000n);
    expect(result.largestNanoErg).toBe(50_000_000n);
  });

  it('PASS when largest >= required', () => {
    const boxes = [
      { value: '200000000' }, // 0.2 ERG
    ];
    const result = classifyLiquidityStatus(boxes, required);
    expect(result.status).toBe('PASS');
    expect(result.totalNanoErg).toBe(200_000_000n);
    expect(result.largestNanoErg).toBe(200_000_000n);
    expect(result.boxCount).toBe(1);
  });
});

// ─── hasFailure ──────────────────────────────────────────────────────

describe('hasFailure', () => {
  it('returns false for all PASS/WARN', () => {
    const checks: PreflightCheck[] = [
      { name: 'a', status: 'PASS', message: 'ok' },
      { name: 'b', status: 'WARN', message: 'low' },
    ];
    expect(hasFailure(checks)).toBe(false);
  });

  it('returns true if any FAIL', () => {
    const checks: PreflightCheck[] = [
      { name: 'a', status: 'PASS', message: 'ok' },
      { name: 'b', status: 'FAIL', message: 'bad' },
    ];
    expect(hasFailure(checks)).toBe(true);
  });
});

// ─── formatPreflightReport ───────────────────────────────────────────

describe('formatPreflightReport', () => {
  it('includes header, each check, and footer', () => {
    const checks: PreflightCheck[] = [
      { name: 'Node', status: 'PASS', message: 'reachable' },
      { name: 'Liquidity', status: 'WARN', message: 'low' },
    ];
    const report = formatPreflightReport(checks);
    expect(report).toContain('Batch Demo Preflight');
    expect(report).toContain('[PASS] Node');
    expect(report).toContain('[WARN] Liquidity');
    expect(report).toContain('Preflight PASSED');
  });

  it('shows FAILED footer when any check fails', () => {
    const checks: PreflightCheck[] = [
      { name: 'Node', status: 'FAIL', message: 'unreachable' },
    ];
    const report = formatPreflightReport(checks);
    expect(report).toContain('Preflight FAILED');
  });
});

// ─── classifySigningReadiness (formula-only, no signing) ────────────

describe('classifySigningReadiness', () => {
  it('FAIL at current threshold: default max batch settlement paths exceed 4 Vars', () => {
    const result = classifySigningReadiness(MAX_SAFE_CONTEXT_EXTENSION_VARS);
    expect(result.status).toBe('FAIL');
    expect(result.name).toBe('Live settlement signing');
    expect(result.message).toContain('BLOCKED');
    expect(result.message).toContain('V1 unlock=8');
    expect(result.message).toContain(`batch DUP(N=${DEFAULT_SIGNING_READINESS_BATCH_CLAIMS})=22`);
    expect(result.message).toContain(`batch unlock(N=${DEFAULT_SIGNING_READINESS_BATCH_CLAIMS})=32`);
  });

  it('message says pending conformance, not permanent limit', () => {
    const result = classifySigningReadiness(MAX_SAFE_CONTEXT_EXTENSION_VARS, 2);
    expect(result.message).toContain('sigma-rust/JVM ContextExtension serialization conformance');
    expect(result.message).toContain('not a permanent ErgoScript limit');
  });

  it('message does not suggest JVM-order workaround', () => {
    const result = classifySigningReadiness(MAX_SAFE_CONTEXT_EXTENSION_VARS, 2);
    expect(result.message).not.toContain('sort');
    expect(result.message).not.toContain('HashMap');
    expect(result.message).not.toContain('workaround');
  });

  it('PASS at a hypothetical high threshold (e.g. upstream fix raises limit)', () => {
    const result = classifySigningReadiness(100, 10);
    expect(result.status).toBe('PASS');
    expect(result.message).toContain('Checked settlement paths up to batch N=10');
  });

  it('FAIL if configured batch max exceeds the patched guard threshold', () => {
    const result = classifySigningReadiness(128, 50);
    expect(result.status).toBe('FAIL');
    expect(result.message).toContain('batch unlock(N=50)=152');
  });

  it('Var count formulas match shard-router classification', () => {
    expect(SETTLEMENT_VAR_COUNTS.v1Unlock).toBe(8);
    expect(SETTLEMENT_VAR_COUNTS.batchDup(1)).toBe(4);
    expect(SETTLEMENT_VAR_COUNTS.batchDup(2)).toBe(6);
    expect(SETTLEMENT_VAR_COUNTS.batchDup(10)).toBe(22);
    expect(SETTLEMENT_VAR_COUNTS.batchUnlock(1)).toBe(5);
    expect(SETTLEMENT_VAR_COUNTS.batchUnlock(2)).toBe(8);
    expect(SETTLEMENT_VAR_COUNTS.batchUnlock(10)).toBe(32);
  });

  it('N=1 batch: V1 and batch unlock blocked, batch DUP at boundary', () => {
    const result = classifySigningReadiness(MAX_SAFE_CONTEXT_EXTENSION_VARS, 1);
    expect(result.status).toBe('FAIL');
    // V1 unlock=8 always blocked
    expect(result.message).toContain('V1 unlock=8');
    // batch DUP(N=1)=4 is exactly at threshold (not blocked)
    expect(result.message).not.toContain('batch DUP(N=1)');
    // batch unlock(N=1)=5 is blocked
    expect(result.message).toContain('batch unlock(N=1)=5');
  });
});

describe('resolveSigningReadinessBatchClaims', () => {
  it('uses configured positive integer claim count', () => {
    expect(resolveSigningReadinessBatchClaims('7')).toBe(7);
  });

  it('falls back to default when unset or invalid', () => {
    expect(resolveSigningReadinessBatchClaims(undefined)).toBe(DEFAULT_SIGNING_READINESS_BATCH_CLAIMS);
    expect(resolveSigningReadinessBatchClaims(null)).toBe(DEFAULT_SIGNING_READINESS_BATCH_CLAIMS);
    expect(resolveSigningReadinessBatchClaims('')).toBe(DEFAULT_SIGNING_READINESS_BATCH_CLAIMS);
    expect(resolveSigningReadinessBatchClaims('0')).toBe(DEFAULT_SIGNING_READINESS_BATCH_CLAIMS);
    expect(resolveSigningReadinessBatchClaims('-1')).toBe(DEFAULT_SIGNING_READINESS_BATCH_CLAIMS);
    expect(resolveSigningReadinessBatchClaims('not-a-number')).toBe(DEFAULT_SIGNING_READINESS_BATCH_CLAIMS);
  });

  it('supports an explicit fallback for tests or custom scripts', () => {
    expect(resolveSigningReadinessBatchClaims('0', 3)).toBe(3);
  });
});
