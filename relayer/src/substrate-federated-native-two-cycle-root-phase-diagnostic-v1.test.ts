import { describe, expect, it } from 'vitest';

import { canonicalJson } from './ergo-settlement-core/strict-json.js';
import { createNativeTwoCycleWorkerFailureDiagnosticV1 } from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import {
  createNativeTwoCycleParentRootPhaseV1,
  createNativeTwoCycleWorkerRootPhaseV1,
  parseNativeTwoCycleWorkerRootPhaseV1,
} from './substrate-federated-native-two-cycle-root-phase-diagnostic-v1.js';

const bindings = Object.freeze({
  configSha256Hex: 'a'.repeat(64),
  expectedBridgeCommit: 'b'.repeat(40),
  pathIdentityDigestHex: 'c'.repeat(64),
});
const projection = Object.freeze({ primaryPhase: 'ergo-build' as const, cleanupErrorCount: 1 });

describe('native two-cycle root phase companion V1', () => {
  it('roundtrips a bounded root phase without a cause or local path', () => {
    const worker = createNativeTwoCycleWorkerRootPhaseV1(bindings, projection);
    const text = `${canonicalJson(worker)}\n`;
    expect(parseNativeTwoCycleWorkerRootPhaseV1(text, bindings)).toEqual(worker);
    expect(text).not.toMatch(/private|[A-Za-z]:[\\/]/iu);
    expect(worker.rootCleanupEstablished).toBe(false);
    expect(worker.rawCausePublished).toBe(false);
  });

  it('binds the parent companion to both worker receipts and the terminal failure', () => {
    const worker = createNativeTwoCycleWorkerRootPhaseV1(bindings, projection);
    const failure = createNativeTwoCycleWorkerFailureDiagnosticV1(
      bindings, 'root-or-cleanup', new Error('private cause'),
    );
    const parent = createNativeTwoCycleParentRootPhaseV1(
      bindings, 'd'.repeat(64), `${canonicalJson(failure)}\n`, worker,
    );
    expect(parent).toMatchObject({
      failureReceiptDigestHex: 'd'.repeat(64),
      workerFailureReceiptDigestHex: failure.receiptDigestHex,
      workerRootPhaseReceiptDigestHex: worker.receiptDigestHex,
      primaryPhase: 'ergo-build', cleanupErrorCount: 1,
      rootCleanupEstablished: false, rawCausePublished: false,
    });
    expect(canonicalJson(parent)).not.toContain('private cause');
  });

  it('rejects a root companion without the existing root-or-cleanup worker stage', () => {
    const worker = createNativeTwoCycleWorkerRootPhaseV1(bindings, projection);
    const failure = createNativeTwoCycleWorkerFailureDiagnosticV1(
      bindings, 'pre-root', new Error('private cause'),
    );
    expect(() => createNativeTwoCycleParentRootPhaseV1(
      bindings, 'd'.repeat(64), `${canonicalJson(failure)}\n`, worker,
    )).toThrow(/root-or-cleanup/u);
  });

  it.each([
    ['digest', { receiptDigestHex: '0'.repeat(64) }],
    ['schema', { schema: 'forged' }],
    ['status', { status: 'forged' }],
    ['cleanup claim', { rootCleanupEstablished: true }],
    ['raw cause claim', { rawCausePublished: true }],
    ['foreign binding', { configSha256Hex: '0'.repeat(64) }],
    ['source phase', { sourceFailurePhase: 'forged' }],
  ] as const)('rejects a worker-failure record with mutated %s', (_name, mutation) => {
    const workerRoot = createNativeTwoCycleWorkerRootPhaseV1(bindings, projection);
    const workerFailure = createNativeTwoCycleWorkerFailureDiagnosticV1(
      bindings, 'root-or-cleanup', new Error('private cause'),
    );
    const forged = { ...workerFailure, ...mutation };
    expect(() => createNativeTwoCycleParentRootPhaseV1(
      bindings, 'd'.repeat(64), `${canonicalJson(forged)}\n`, workerRoot,
    )).toThrow();
  });

  it.each([
    ['foreign binding', (worker: Record<string, unknown>) => ({
      ...worker, configSha256Hex: 'e'.repeat(64),
    })],
    ['unknown field', (worker: Record<string, unknown>) => ({ ...worker, privateCause: 'secret' })],
    ['digest', (worker: Record<string, unknown>) => ({
      ...worker, receiptDigestHex: '0'.repeat(64),
    })],
    ['phase', (worker: Record<string, unknown>) => ({ ...worker, primaryPhase: 'unknown' })],
    ['cleanup claim', (worker: Record<string, unknown>) => ({
      ...worker, rootCleanupEstablished: true,
    })],
    ['counter', (worker: Record<string, unknown>) => ({
      ...worker, cleanupErrorCount: 33,
    })],
  ] as const)('rejects %s', (_name, mutate) => {
    const worker = createNativeTwoCycleWorkerRootPhaseV1(bindings, projection);
    expect(() => parseNativeTwoCycleWorkerRootPhaseV1(
      `${canonicalJson(mutate(worker as unknown as Record<string, unknown>))}\n`, bindings,
    )).toThrow();
  });

  it('rejects duplicate fields and noncanonical transport', () => {
    const worker = createNativeTwoCycleWorkerRootPhaseV1(bindings, projection);
    const text = canonicalJson(worker);
    expect(() => parseNativeTwoCycleWorkerRootPhaseV1(`${text}\n\n`, bindings)).toThrow();
    expect(() => parseNativeTwoCycleWorkerRootPhaseV1(
      text.replace('{', '{"schema":"duplicate",') + '\n', bindings,
    )).toThrow();
    expect(() => parseNativeTwoCycleWorkerRootPhaseV1(
      'x'.repeat(16 * 1024 + 1), bindings,
    )).toThrow();
  });

  it('accepts cleanup-only evidence without claiming root cleanup', () => {
    const worker = createNativeTwoCycleWorkerRootPhaseV1(bindings, {
      primaryPhase: null, cleanupErrorCount: 2,
    });
    expect(parseNativeTwoCycleWorkerRootPhaseV1(
      `${canonicalJson(worker)}\n`, bindings,
    ).cleanupErrorCount).toBe(2);
    const indeterminate = createNativeTwoCycleWorkerRootPhaseV1(bindings, {
      primaryPhase: null, cleanupErrorCount: 0,
    });
    expect(parseNativeTwoCycleWorkerRootPhaseV1(
      `${canonicalJson(indeterminate)}\n`, bindings,
    ).primaryPhase).toBeNull();
  });
});
