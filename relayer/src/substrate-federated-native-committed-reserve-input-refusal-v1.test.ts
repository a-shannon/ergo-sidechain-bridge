import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import { createNativeTwoCycleWorkerFailureDiagnosticV1 } from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';
import { createNativeTwoCycleWorkerRootPhaseV2 } from './substrate-federated-native-two-cycle-root-phase-diagnostic-v2.js';
import { createNativeTwoCycleWorkerCycleStepV1, createNativeTwoCycleParentCycleStepV1 }
  from './substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { createNativeTwoCycleWorkerCommittedReserveStageV1, createNativeTwoCycleParentCommittedReserveStageV1 }
  from './substrate-federated-native-committed-reserve-failure-v1.js';
import { createNativeTwoCycleWorkerCommittedReserveRevalidationV1, createNativeTwoCycleParentCommittedReserveRevalidationV1 }
  from './substrate-federated-native-committed-reserve-revalidation-v1.js';
import { createNativeTwoCycleWorkerCommittedReserveRevalidationOperationV1,
  createNativeTwoCycleParentCommittedReserveRevalidationOperationV1,
  NATIVE_COMMITTED_RESERVE_INPUT_REFUSAL_ROLES_V1,
  type NativeCommittedReserveInputRefusalV1, type NativeCommittedReserveRevalidationOperationV1 }
  from './substrate-federated-native-committed-reserve-revalidation-operation-v1.js';
import { createNativeTwoCycleWorkerCommittedReserveInputRefusalV1, parseNativeTwoCycleWorkerCommittedReserveInputRefusalV1,
  createNativeTwoCycleParentCommittedReserveInputRefusalV1, parseNativeTwoCycleParentCommittedReserveInputRefusalV1 }
  from './substrate-federated-native-committed-reserve-input-refusal-v1.js';

const bindings = { configSha256Hex: 'a'.repeat(64), expectedBridgeCommit: 'b'.repeat(40), pathIdentityDigestHex: 'c'.repeat(64) };
const terminal = 'd'.repeat(64);
const text = (value: unknown) => `${canonicalJson(value)}\n`;
const workerDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_COMMITTED_RESERVE_INPUT_REFUSAL_V1';
const parentDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_COMMITTED_RESERVE_INPUT_REFUSAL_V1';
const detail = { refusalCode: 'source-funding-present', nodeRole: 'primary' } as const;
const resign = (value: object, domain: string) => {
  const { receiptDigestHex: _ignored, ...body } = value as Record<string, unknown>;
  return text({ ...body, receiptDigestHex: sha256CanonicalJson(body, domain) });
};
function fixture(operation: NativeCommittedReserveRevalidationOperationV1 = 'input-observation-before-check',
  cycle: 'cycle-1' | 'cycle-2' = 'cycle-1', kind: 'genesis' | 'continuation' = 'continuation') {
  const failure = createNativeTwoCycleWorkerFailureDiagnosticV1(bindings, 'root-or-cleanup', new Error());
  const root = createNativeTwoCycleWorkerRootPhaseV2(bindings, { primaryPhase: cycle, cleanupErrorCount: 0, ergoNodeStartupPhase: null });
  const step = createNativeTwoCycleWorkerCycleStepV1(bindings, text(failure), text(root), { cycle, step: 'committed-reserve' });
  const parentStep = createNativeTwoCycleParentCycleStepV1(bindings, terminal, text(failure), text(root), text(step));
  const stage = createNativeTwoCycleWorkerCommittedReserveStageV1(bindings, text(failure), text(root), text(step), 'operational-revalidate', kind);
  const parentStage = createNativeTwoCycleParentCommittedReserveStageV1(bindings, terminal, text(failure), text(root), text(step), text(stage), text(parentStep));
  const base = { workerFailureText: text(failure), workerRootPhaseV2Text: text(root), workerCycleStepText: text(step), workerCommittedReserveStageText: text(stage) };
  const origin = createNativeTwoCycleWorkerCommittedReserveRevalidationV1(bindings, base, 'revalidator-call');
  const originLineage = { ...base, workerRevalidationText: text(origin), parentCycleStepText: text(parentStep), parentCommittedReserveStageText: text(parentStage) };
  const parentOrigin = createNativeTwoCycleParentCommittedReserveRevalidationV1(bindings, terminal, originLineage);
  const operationWorker = createNativeTwoCycleWorkerCommittedReserveRevalidationOperationV1(bindings, { ...base, workerRevalidationText: text(origin) }, operation);
  const operationLineage = { ...originLineage, parentRevalidationText: text(parentOrigin), workerRevalidationOperationText: text(operationWorker) };
  const operationParent = createNativeTwoCycleParentCommittedReserveRevalidationOperationV1(bindings, terminal, operationLineage);
  const workerLineage = { ...base, workerRevalidationText: text(origin), workerRevalidationOperationText: text(operationWorker) };
  const parentBase = { ...operationLineage, parentRevalidationOperationText: text(operationParent) };
  return { workerLineage, parentBase, operationWorker, operationParent };
}
function receipts() {
  const f = fixture(); const worker = createNativeTwoCycleWorkerCommittedReserveInputRefusalV1(bindings, f.workerLineage, detail);
  const lineage = { ...f.parentBase, workerInputRefusalText: text(worker) };
  const parent = createNativeTwoCycleParentCommittedReserveInputRefusalV1(bindings, terminal, lineage);
  return { ...f, worker, parent, lineage };
}
const sample = receipts();
const allowed = Object.entries(NATIVE_COMMITTED_RESERVE_INPUT_REFUSAL_ROLES_V1).flatMap(([refusalCode, roles]) =>
  roles.map(nodeRole => ({ refusalCode, nodeRole } as NativeCommittedReserveInputRefusalV1)));

describe('prospective committed reserve input refusal companions', () => {
  it.each(allowed)('composes actual old lineage for $refusalCode/$nodeRole', selected => {
    for (const cycle of ['cycle-1', 'cycle-2'] as const) for (const kind of ['genesis', 'continuation'] as const)
      for (const operation of ['input-observation-before-check', 'input-observation-after-check'] as const) {
        if (selected.refusalCode === 'check-ancestry-window-exceeded' && operation === 'input-observation-before-check') continue;
        const f = fixture(operation, cycle, kind); const oldBytes = text(f.operationWorker);
        const worker = createNativeTwoCycleWorkerCommittedReserveInputRefusalV1(bindings, f.workerLineage, selected);
        const lineage = { ...f.parentBase, workerInputRefusalText: text(worker) };
        const parent = createNativeTwoCycleParentCommittedReserveInputRefusalV1(bindings, terminal, lineage);
        expect(parseNativeTwoCycleWorkerCommittedReserveInputRefusalV1(text(worker), bindings, f.workerLineage)).toEqual(worker);
        expect(parseNativeTwoCycleParentCommittedReserveInputRefusalV1(text(parent), bindings, terminal, lineage)).toEqual(parent);
        expect(text(f.operationWorker)).toBe(oldBytes); expect(worker).toMatchObject(selected);
        expect(parent).toMatchObject({ ...selected, cycle, committedReserveKind: kind, revalidationOperation: operation,
          workerRevalidationOperationReceiptDigestHex: f.operationWorker.receiptDigestHex,
          parentRevalidationOperationReceiptDigestHex: f.operationParent.receiptDigestHex,
          workerInputRefusalReceiptDigestHex: worker.receiptDigestHex, failureReceiptDigestHex: terminal,
          operationCompletionEstablished: false, rootCleanupEstablished: false, rawCausePublished: false, executionAuthorityRestored: false });
        expect(Object.isFrozen(worker)).toBe(true); expect(Object.isFrozen(parent)).toBe(true);
      }
  });
  it.each(['ingress-binding', 'fresh-signed-check', 'post-check-observation-join', 'final-authorizer-binding'] as const)(
    'refuses non-observation operation %s', operation => {
      const f = fixture(operation); expect(() => createNativeTwoCycleWorkerCommittedReserveInputRefusalV1(bindings, f.workerLineage, detail)).toThrow();
    });
  it.each(['primary', 'witness'] as const)('rejects re-signed before-check ancestry refusal for %s at worker and parent', nodeRole => {
    const selected = { refusalCode: 'check-ancestry-window-exceeded', nodeRole } as const;
    expect(() => createNativeTwoCycleWorkerCommittedReserveInputRefusalV1(bindings, sample.workerLineage, selected)).toThrow();
    const workerText = resign({ ...sample.worker, ...selected }, workerDomain);
    expect(() => parseNativeTwoCycleWorkerCommittedReserveInputRefusalV1(workerText, bindings, sample.workerLineage)).toThrow();
    const lineage = { ...sample.lineage, workerInputRefusalText: workerText };
    expect(() => createNativeTwoCycleParentCommittedReserveInputRefusalV1(bindings, terminal, lineage)).toThrow();
    expect(() => parseNativeTwoCycleParentCommittedReserveInputRefusalV1(resign({ ...sample.parent, ...selected }, parentDomain),
      bindings, terminal, lineage)).toThrow();
  });
  it.each(Object.keys(NATIVE_COMMITTED_RESERVE_INPUT_REFUSAL_ROLES_V1).flatMap(refusalCode =>
    ['primary', 'witness', 'pair', 'session'].filter(role => !(NATIVE_COMMITTED_RESERVE_INPUT_REFUSAL_ROLES_V1[
      refusalCode as NativeCommittedReserveInputRefusalV1['refusalCode']] as readonly string[]).includes(role))
      .map(nodeRole => [refusalCode, nodeRole] as const)))('refuses wrong role %s/%s', (refusalCode, nodeRole) => {
      expect(() => createNativeTwoCycleWorkerCommittedReserveInputRefusalV1(bindings, sample.workerLineage,
        { refusalCode, nodeRole } as NativeCommittedReserveInputRefusalV1)).toThrow();
    });
  function replacement(key: string): unknown {
    if (key.endsWith('Established') || key === 'rawCausePublished' || key === 'executionAuthorityRestored') return true;
    if (key === 'version') return 2;
    if (key === 'expectedBridgeCommit') return 'e'.repeat(40);
    return key.endsWith('Hex') ? 'e'.repeat(64) : 'unsupported';
  }
  it.each(Object.keys(sample.worker))('isolates changed worker field %s after rehash', key => {
    const changed = { ...sample.worker, [key]: replacement(key) };
    const source = key === 'receiptDigestHex' ? text(changed) : resign(changed, workerDomain);
    expect(() => parseNativeTwoCycleWorkerCommittedReserveInputRefusalV1(source, bindings, sample.workerLineage)).toThrow();
  });
  it.each(Object.keys(sample.parent))('isolates changed parent field %s after rehash', key => {
    const changed = { ...sample.parent, [key]: replacement(key) };
    const source = key === 'receiptDigestHex' ? text(changed) : resign(changed, parentDomain);
    expect(() => parseNativeTwoCycleParentCommittedReserveInputRefusalV1(source, bindings, terminal, sample.lineage)).toThrow();
  });
  it.each(Object.keys(sample.lineage))('binds lineage component %s to its role', key => {
    expect(() => createNativeTwoCycleParentCommittedReserveInputRefusalV1(bindings, terminal,
      { ...sample.lineage, [key]: text(sample.parent) })).toThrow();
  });
  it('rejects valid alternate worker detail against unchanged parent ancestry', () => {
    const worker = createNativeTwoCycleWorkerCommittedReserveInputRefusalV1(bindings, sample.workerLineage,
      { refusalCode: 'transition-input-unavailable', nodeRole: 'witness' });
    expect(() => parseNativeTwoCycleParentCommittedReserveInputRefusalV1(text(sample.parent), bindings, terminal,
      { ...sample.lineage, workerInputRefusalText: text(worker) })).toThrow();
  });
  it.each(['terminal', 'bindings', 'cycle', 'kind', 'operation'] as const)('rejects independent ancestry %s', field => {
    if (field === 'terminal') expect(() => createNativeTwoCycleParentCommittedReserveInputRefusalV1(bindings, 'e'.repeat(64), sample.lineage)).toThrow();
    else if (field === 'bindings') expect(() => createNativeTwoCycleParentCommittedReserveInputRefusalV1({ ...bindings, configSha256Hex: 'e'.repeat(64) }, terminal, sample.lineage)).toThrow();
    else {
      const alternate = fixture(field === 'operation' ? 'input-observation-after-check' : 'input-observation-before-check',
        field === 'cycle' ? 'cycle-2' : 'cycle-1', field === 'kind' ? 'genesis' : 'continuation');
      expect(() => createNativeTwoCycleParentCommittedReserveInputRefusalV1(bindings, terminal,
        { ...sample.lineage, parentRevalidationOperationText: text(alternate.operationParent) })).toThrow();
    }
  });
  it.each(['duplicate', 'deep', 'oversize', 'BOM', 'invalid-Unicode', 'no-LF', 'CRLF', 'extra', 'missing', 'domain'] as const)(
    'refuses encoded %s at both boundaries', fault => {
      for (const [receipt, domain, parse] of [
        [sample.worker, workerDomain, (source: string) => parseNativeTwoCycleWorkerCommittedReserveInputRefusalV1(source, bindings, sample.workerLineage)],
        [sample.parent, parentDomain, (source: string) => parseNativeTwoCycleParentCommittedReserveInputRefusalV1(source, bindings, terminal, sample.lineage)],
      ] as const) {
        let source = text(receipt);
        if (fault === 'duplicate') source = source.replace('{', '{"version":1,');
        if (fault === 'deep') source = '['.repeat(65) + '0' + ']'.repeat(65);
        if (fault === 'oversize') source += ' '.repeat(16 * 1024);
        if (fault === 'BOM') source = '\ufeff' + source;
        if (fault === 'invalid-Unicode') source += '\ud800';
        if (fault === 'no-LF') source = source.trimEnd();
        if (fault === 'CRLF') source = source.replace(/\n$/, '\r\n');
        if (fault === 'extra') source = resign({ ...receipt, extra: 1 }, domain);
        if (fault === 'missing') { const changed = { ...receipt }; Reflect.deleteProperty(changed, 'nodeRole'); source = resign(changed, domain); }
        if (fault === 'domain') source = resign(receipt, 'OTHER');
        expect(() => parse(source)).toThrow();
      }
    });
  it.each(['bindings-proxy', 'lineage-proxy', 'lineage-getter', 'detail-proxy', 'detail-getter', 'detail-extra', 'detail-symbol', 'detail-hidden'] as const)(
    'refuses hostile %s without effects', fault => {
      let effects = 0; const traps = { ownKeys() { effects++; throw Error(); }, getPrototypeOf() { effects++; throw Error(); },
        get() { effects++; throw Error(); }, getOwnPropertyDescriptor() { effects++; throw Error(); } };
      let b = bindings; let l = sample.workerLineage; let d: object = { ...detail };
      if (fault === 'bindings-proxy') b = new Proxy(b, traps);
      if (fault === 'lineage-proxy') l = new Proxy(l, traps);
      if (fault === 'lineage-getter') { l = { ...l }; Object.defineProperty(l, 'workerFailureText', { get() { effects++; throw Error(); } }); }
      if (fault === 'detail-proxy') d = new Proxy(d, traps);
      if (fault === 'detail-getter') Object.defineProperty(d, 'nodeRole', { get() { effects++; throw Error(); } });
      if (fault === 'detail-extra') Object.assign(d, { extra: true });
      if (fault === 'detail-symbol') Object.assign(d, { [Symbol('extra')]: true });
      if (fault === 'detail-hidden') Object.defineProperty(d, 'nodeRole', { enumerable: false });
      expect(() => createNativeTwoCycleWorkerCommittedReserveInputRefusalV1(b, l, d as NativeCommittedReserveInputRefusalV1)).toThrow();
      expect(effects).toBe(0);
    });
});
