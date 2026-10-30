import { describe, expect, it } from 'vitest';

import {
  canonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  createNativeTwoCycleWorkerFailureDiagnosticV1,
} from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import {
  createNativeTwoCycleParentRootPhaseV2,
  createNativeTwoCycleWorkerRootPhaseV2,
  parseNativeTwoCycleWorkerRootPhaseV2,
} from './substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';

const bindings = Object.freeze({
  configSha256Hex: 'a'.repeat(64),
  expectedBridgeCommit: 'b'.repeat(40),
  pathIdentityDigestHex: 'c'.repeat(64),
});
const projection = Object.freeze({
  primaryPhase: 'node-start' as const,
  cleanupErrorCount: 1,
  ergoNodeStartupPhase: 'ergo node primary readiness' as const,
});

describe('native two-cycle root phase companion V2', () => {
  it('roundtrips bounded allowlisted startup detail without a cause or local path', () => {
    const worker = createNativeTwoCycleWorkerRootPhaseV2(bindings, projection);
    const text = `${canonicalJson(worker)}\n`;
    expect(parseNativeTwoCycleWorkerRootPhaseV2(text, bindings)).toEqual(worker);
    expect(text).not.toMatch(/private|[A-Za-z]:[\\/]/iu);
    expect(worker).toMatchObject({
      schema: 'e2s.substrate-federated-native-two-cycle-worker-root-phase.v2',
      version: 2, status: 'root_failed',
      ergoNodeStartupPhase: 'ergo node primary readiness',
      rootCleanupEstablished: false, rawCausePublished: false,
    });
  });

  it('binds the parent V2 receipt to the terminal failure and both V1/V2 worker receipts', () => {
    const worker = createNativeTwoCycleWorkerRootPhaseV2(bindings, projection);
    const failure = createNativeTwoCycleWorkerFailureDiagnosticV1(
      bindings, 'root-or-cleanup', new Error('private cause'),
    );
    const parent = createNativeTwoCycleParentRootPhaseV2(
      bindings, 'd'.repeat(64), `${canonicalJson(failure)}\n`, worker,
    );
    expect(parent).toMatchObject({
      schema: 'e2s.substrate-federated-native-two-cycle-parent-root-phase.v2',
      version: 2,
      failureReceiptDigestHex: 'd'.repeat(64),
      workerFailureReceiptDigestHex: failure.receiptDigestHex,
      workerRootPhaseV2ReceiptDigestHex: worker.receiptDigestHex,
      primaryPhase: 'node-start', cleanupErrorCount: 1,
      ergoNodeStartupPhase: 'ergo node primary readiness',
      rootCleanupEstablished: false, rawCausePublished: false,
    });
    expect(canonicalJson(parent)).not.toContain('private cause');
  });

  it.each([
    ['root phase', { ...projection, primaryPhase: 'unknown' }],
    ['startup phase', { ...projection, ergoNodeStartupPhase: 'ergo node startup not allowlisted' }],
    ['startup/root correlation', { ...projection, primaryPhase: 'ergo-build' }],
    ['cleanup count', { ...projection, cleanupErrorCount: 33 }],
  ] as const)('rejects invalid %s during creation', (_name, invalidProjection) => {
    expect(() => createNativeTwoCycleWorkerRootPhaseV2(
      bindings, invalidProjection as never,
    )).toThrow();
  });

  it('accepts node-start with absent detail and cleanup-only evidence without asserting cleanup', () => {
    const absent = createNativeTwoCycleWorkerRootPhaseV2(bindings, {
      primaryPhase: 'node-start', cleanupErrorCount: 0, ergoNodeStartupPhase: null,
    });
    expect(absent.ergoNodeStartupPhase).toBeNull();
    const cleanupOnly = createNativeTwoCycleWorkerRootPhaseV2(bindings, {
      primaryPhase: null, cleanupErrorCount: 2, ergoNodeStartupPhase: null,
    });
    expect(cleanupOnly).toMatchObject({
      primaryPhase: null, cleanupErrorCount: 2,
      ergoNodeStartupPhase: null, rootCleanupEstablished: false,
    });
  });

  it.each([
    ['foreign config', (worker: Record<string, unknown>) => ({
      ...worker, configSha256Hex: 'e'.repeat(64),
    })],
    ['foreign commit', (worker: Record<string, unknown>) => ({
      ...worker, expectedBridgeCommit: 'f'.repeat(40),
    })],
    ['foreign paths', (worker: Record<string, unknown>) => ({
      ...worker, pathIdentityDigestHex: '0'.repeat(64),
    })],
    ['unknown field', (worker: Record<string, unknown>) => ({ ...worker, privateCause: 'secret' })],
    ['schema', (worker: Record<string, unknown>) => ({ ...worker, schema: 'forged' })],
    ['version', (worker: Record<string, unknown>) => ({ ...worker, version: 1 })],
    ['phase correlation', (worker: Record<string, unknown>) => ({
      ...worker, primaryPhase: 'ergo-build',
    })],
    ['cleanup claim', (worker: Record<string, unknown>) => ({
      ...worker, rootCleanupEstablished: true,
    })],
    ['raw cause claim', (worker: Record<string, unknown>) => ({
      ...worker, rawCausePublished: true,
    })],
    ['digest', (worker: Record<string, unknown>) => ({
      ...worker, receiptDigestHex: '0'.repeat(64),
    })],
  ] as const)('rejects %s', (_name, mutate) => {
    const worker = createNativeTwoCycleWorkerRootPhaseV2(bindings, projection);
    expect(() => parseNativeTwoCycleWorkerRootPhaseV2(
      `${canonicalJson(mutate(worker as unknown as Record<string, unknown>))}\n`, bindings,
    )).toThrow();
  });

  it('rejects foreign bindings and non-root worker failure at the parent consumer', () => {
    const worker = createNativeTwoCycleWorkerRootPhaseV2(bindings, projection);
    const rootFailure = createNativeTwoCycleWorkerFailureDiagnosticV1(
      bindings, 'root-or-cleanup', new Error('private cause'),
    );
    expect(() => createNativeTwoCycleParentRootPhaseV2(
      { ...bindings, configSha256Hex: 'e'.repeat(64) },
      'd'.repeat(64), `${canonicalJson(rootFailure)}\n`, worker,
    )).toThrow(/bindings/u);
    const preRootFailure = createNativeTwoCycleWorkerFailureDiagnosticV1(
      bindings, 'pre-root', new Error('private cause'),
    );
    expect(() => createNativeTwoCycleParentRootPhaseV2(
      bindings, 'd'.repeat(64), `${canonicalJson(preRootFailure)}\n`, worker,
    )).toThrow(/root-or-cleanup/u);
  });

  it('rejects duplicate fields, noncanonical JSON, missing LF and oversized sidecars', () => {
    const worker = createNativeTwoCycleWorkerRootPhaseV2(bindings, projection);
    const text = canonicalJson(worker);
    expect(() => parseNativeTwoCycleWorkerRootPhaseV2(`${text}\n\n`, bindings)).toThrow();
    expect(() => parseNativeTwoCycleWorkerRootPhaseV2(text, bindings)).toThrow();
    expect(() => parseNativeTwoCycleWorkerRootPhaseV2(
      text.replace('{', '{"schema":"duplicate",') + '\n', bindings,
    )).toThrow();
    expect(() => parseNativeTwoCycleWorkerRootPhaseV2(
      'x'.repeat(16 * 1024 + 1), bindings,
    )).toThrow();
  });
});
