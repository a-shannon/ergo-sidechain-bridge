import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import { createNativeTwoCycleWorkerFailureDiagnosticV1 }
  from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV2 }
  from './substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';
import { NATIVE_TWO_CYCLE_CYCLE_STEPS_V1 }
  from './substrate-federated-native-two-cycle-cycle-step-v1.js';
import { createNativeTwoCycleWorkerCycleStepV1, parseNativeTwoCycleWorkerCycleStepV1,
  createNativeTwoCycleParentCycleStepV1, parseNativeTwoCycleParentCycleStepV1 }
  from './substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';

const bindings = { configSha256Hex: 'a'.repeat(64), expectedBridgeCommit: 'b'.repeat(40),
  pathIdentityDigestHex: 'c'.repeat(64) };
const terminalDigest = 'd'.repeat(64);
const text = (value: unknown) => `${canonicalJson(value)}\n`;
function fixture(cycle: 'cycle-1' | 'cycle-2' = 'cycle-1') {
  const failure = createNativeTwoCycleWorkerFailureDiagnosticV1(bindings,
    'root-or-cleanup', new Error('private cause'));
  const root = createNativeTwoCycleWorkerRootPhaseV2(bindings,
    { primaryPhase: cycle, cleanupErrorCount: 1, ergoNodeStartupPhase: null });
  const worker = createNativeTwoCycleWorkerCycleStepV1(bindings, text(failure), text(root),
    { cycle, step: 'issuance-execution' });
  return { failure, root, worker };
}
function resign(record: Record<string, unknown>, domain: string) {
  const { receiptDigestHex: ignored, ...body } = record; void ignored;
  return { ...body, receiptDigestHex: sha256CanonicalJson(body, domain) };
}
const workerDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_CYCLE_STEP_V1';
const parentDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_CYCLE_STEP_V1';

describe('bounded native cycle step diagnostic lineage', () => {
  it.each(['cycle-1', 'cycle-2'] as const)('roundtrips %s and exact terminal ancestry', cycle => {
    const f = fixture(cycle);
    expect(parseNativeTwoCycleWorkerCycleStepV1(text(f.worker), bindings,
      text(f.failure), text(f.root))).toEqual(f.worker);
    const parent = createNativeTwoCycleParentCycleStepV1(bindings, terminalDigest,
      text(f.failure), text(f.root), text(f.worker));
    expect(parseNativeTwoCycleParentCycleStepV1(text(parent), bindings, terminalDigest,
      text(f.failure), text(f.root), text(f.worker))).toEqual(parent);
    expect(parent).toMatchObject({ cycle, step: 'issuance-execution',
      failureReceiptDigestHex: terminalDigest,
      workerFailureReceiptDigestHex: f.failure.receiptDigestHex,
      workerRootPhaseV2ReceiptDigestHex: f.root.receiptDigestHex,
      workerCycleStepReceiptDigestHex: f.worker.receiptDigestHex,
      operationCompletionEstablished: false, rootCleanupEstablished: false, rawCausePublished: false });
    expect(text(parent)).not.toMatch(/private|cause|[A-Za-z]:[\\/]/u);
  });
  it.each(NATIVE_TWO_CYCLE_CYCLE_STEPS_V1)('accepts allowlisted active operation %s', step => {
    const f = fixture();
    const worker = createNativeTwoCycleWorkerCycleStepV1(bindings, text(f.failure), text(f.root),
      { cycle: 'cycle-1', step });
    expect(parseNativeTwoCycleWorkerCycleStepV1(text(worker), bindings,
      text(f.failure), text(f.root)).step).toBe(step);
  });
  it.each(['schema', 'version', 'status', 'configSha256Hex', 'expectedBridgeCommit',
    'pathIdentityDigestHex', 'workerFailureReceiptDigestHex', 'workerRootPhaseV2ReceiptDigestHex',
    'cycle', 'step', 'operationCompletionEstablished', 'rootCleanupEstablished', 'rawCausePublished',
    'receiptDigestHex'] as const)('rejects independently changed worker %s after rehash', field => {
    const f = fixture();
    const replacement = field === 'cycle' ? 'cycle-2' : field === 'step' ? 'unknown'
      : field.endsWith('Hex') ? 'e'.repeat(64) : field === 'expectedBridgeCommit' ? 'e'.repeat(40)
        : field === 'version' ? 2 : field.endsWith('Established') || field === 'rawCausePublished' ? true : 'foreign';
    const changed = { ...f.worker, [field]: replacement };
    expect(() => parseNativeTwoCycleWorkerCycleStepV1(text(field === 'receiptDigestHex' ? changed
      : resign(changed, workerDomain)), bindings, text(f.failure), text(f.root))).toThrow();
  });
  it.each(['schema', 'version', 'status', 'configSha256Hex', 'expectedBridgeCommit',
    'pathIdentityDigestHex', 'failureReceiptDigestHex', 'workerFailureReceiptDigestHex',
    'workerRootPhaseV2ReceiptDigestHex', 'workerCycleStepReceiptDigestHex', 'cycle', 'step',
    'operationCompletionEstablished', 'rootCleanupEstablished', 'rawCausePublished', 'receiptDigestHex'] as const)(
    'rejects independently changed parent %s after rehash', field => {
      const f = fixture();
      const parent = createNativeTwoCycleParentCycleStepV1(bindings, terminalDigest,
        text(f.failure), text(f.root), text(f.worker));
      const changed = { ...parent, [field]: field === 'cycle' ? 'cycle-2' : field === 'step'
        ? 'tracker-check' : field.endsWith('Hex') ? 'e'.repeat(64) : 'foreign' };
      expect(() => parseNativeTwoCycleParentCycleStepV1(text(field === 'receiptDigestHex' ? changed
        : resign(changed, parentDomain)), bindings, terminalDigest,
      text(f.failure), text(f.root), text(f.worker))).toThrow();
    });
  it.each(['missing', 'extra', 'duplicate', 'whitespace', 'no newline', 'invalid', 'unicode bound',
    'wrong domain'] as const)('rejects malformed worker %s', mutation => {
    const f = fixture(); const { status: ignored, ...missing } = f.worker; void ignored;
    const candidate = mutation === 'missing' ? text(resign(missing, workerDomain))
      : mutation === 'extra' ? text(resign({ ...f.worker, extra: false }, workerDomain))
        : mutation === 'duplicate' ? text(f.worker).replace('"version":1', '"version":1,"version":1')
          : mutation === 'whitespace' ? ` ${text(f.worker)}` : mutation === 'no newline' ? canonicalJson(f.worker)
            : mutation === 'invalid' ? '{' : mutation === 'unicode bound' ? 'é'.repeat(8193)
              : text(resign({ ...f.worker }, parentDomain));
    expect(() => parseNativeTwoCycleWorkerCycleStepV1(candidate, bindings,
      text(f.failure), text(f.root))).toThrow(mutation === 'unicode bound' ? /bounded text/u : undefined);
  });
  it.each(['node-start', 'cleanup-only', 'cycle mismatch', 'worker stage', 'foreign ancestor',
    'ancestor digest', 'ancestor noncanonical'] as const)('rejects %s lineage', mutation => {
    const f = fixture();
    const root = createNativeTwoCycleWorkerRootPhaseV2(bindings, {
      primaryPhase: mutation === 'node-start' ? 'node-start' : mutation === 'cleanup-only' ? null
        : mutation === 'cycle mismatch' ? 'cycle-2' : 'cycle-1',
      cleanupErrorCount: 0, ergoNodeStartupPhase: null,
    });
    const failure = createNativeTwoCycleWorkerFailureDiagnosticV1(mutation === 'foreign ancestor'
      ? { ...bindings, configSha256Hex: 'e'.repeat(64) } : bindings,
    mutation === 'worker stage' ? 'pre-root' : 'root-or-cleanup', new Error('private'));
    const failureText = mutation === 'ancestor digest' ? text({ ...failure, receiptDigestHex: 'e'.repeat(64) })
      : mutation === 'ancestor noncanonical' ? ` ${text(failure)}` : text(failure);
    // Hold the other ancestor constant except for the one isolated phase mutation.
    const rootText = ['node-start', 'cleanup-only', 'cycle mismatch'].includes(mutation) ? text(root) : text(f.root);
    expect(() => parseNativeTwoCycleWorkerCycleStepV1(text(f.worker), bindings,
      failureText, rootText)).toThrow();
  });
  it('binds terminal digest and rejects extra projection fields before constructing a receipt', () => {
    const f = fixture(); const parent = createNativeTwoCycleParentCycleStepV1(bindings,
      terminalDigest, text(f.failure), text(f.root), text(f.worker));
    expect(() => parseNativeTwoCycleParentCycleStepV1(text(parent), bindings, 'e'.repeat(64),
      text(f.failure), text(f.root), text(f.worker))).toThrow();
    expect(() => createNativeTwoCycleWorkerCycleStepV1(bindings, text(f.failure), text(f.root),
      { cycle: 'cycle-1', step: 'issuance-execution', extra: true } as never)).toThrow(/fields/u);
  });
});
