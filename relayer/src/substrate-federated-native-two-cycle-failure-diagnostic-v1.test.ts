import { describe, expect, it } from 'vitest';

import { canonicalJson, sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import {
  createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1,
} from './relayer-core/substrate-federated-authority-safe-devnet-source-failure-phase-v1.js';
import {
  createNativeTwoCycleParentFailureDiagnosticV1,
  createNativeTwoCycleWorkerFailureDiagnosticV1,
  parseNativeTwoCycleWorkerFailureDiagnosticV1,
} from './substrate-federated-native-two-cycle-failure-diagnostic-v1.js';

const WORKER_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_FAILURE_DIAGNOSTIC_V1';
const PARENT_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_FAILURE_DIAGNOSTIC_V1';
const bindings = Object.freeze({
  configSha256Hex: '11'.repeat(32),
  expectedBridgeCommit: '22'.repeat(20),
  pathIdentityDigestHex: '33'.repeat(32),
});

describe('native two-cycle failure diagnostic V1', () => {
  it('projects only the established source phase at the root-or-cleanup boundary', () => {
    const cause = createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1(
      'source target Frontier build',
      new Error('private raw cause'),
    );
    const diagnostic = createNativeTwoCycleWorkerFailureDiagnosticV1(
      bindings,
      'root-or-cleanup',
      cause,
    );
    const text = `${canonicalJson(diagnostic)}\n`;

    expect(parseNativeTwoCycleWorkerFailureDiagnosticV1(text, bindings))
      .toEqual(diagnostic);
    expect(diagnostic.sourceFailurePhase).toBe('source target Frontier build');
    expect(diagnostic.rootCleanupEstablished).toBe(false);
    expect(diagnostic.rawCausePublished).toBe(false);
    expect(text).not.toContain('private raw cause');
  });

  it.each([
    'pre-root',
    'projection',
    'post-root-identity',
    'transport-publication',
  ] as const)('does not project a source phase at %s', stage => {
    const cause = createSubstrateFederatedAuthoritySafeDevnetSourceFailureV1(
      'source target binary identity and version',
      new Error('not public'),
    );
    expect(createNativeTwoCycleWorkerFailureDiagnosticV1(
      bindings,
      stage,
      cause,
    ).sourceFailurePhase).toBeNull();
  });

  it('creates a separately bound parent sidecar from a validated worker diagnostic', () => {
    const worker = createNativeTwoCycleWorkerFailureDiagnosticV1(
      bindings,
      'projection',
      new Error('projection internals'),
    );
    const parent = createNativeTwoCycleParentFailureDiagnosticV1(
      bindings,
      '44'.repeat(32),
      worker,
    );

    expect(parent).toMatchObject({
      schema: 'e2s.substrate-federated-native-two-cycle-parent-failure-diagnostic.v1',
      status: 'worker_failure_diagnostic_validated',
      failureReceiptDigestHex: '44'.repeat(32),
      workerFailureReceiptDigestHex: worker.receiptDigestHex,
      stage: 'projection',
      sourceFailurePhase: null,
      rootCleanupEstablished: false,
      rawCausePublished: false,
    });
  });

  it.each([
    ['config SHA-256', 'configSha256Hex', '55'.repeat(32)],
    ['expected bridge commit', 'expectedBridgeCommit', '66'.repeat(20)],
    ['path identity digest', 'pathIdentityDigestHex', '77'.repeat(32)],
  ] as const)('rejects a recomputed foreign %s binding', (_label, field, value) => {
    const worker = createNativeTwoCycleWorkerFailureDiagnosticV1(
      bindings,
      'pre-root',
      new Error('hidden'),
    );
    const foreign = resignWorker(worker, { [field]: value });
    expect(() => parseNativeTwoCycleWorkerFailureDiagnosticV1(
      `${canonicalJson(foreign)}\n`,
      bindings,
    )).toThrow(/bindings differ/iu);
  });

  it.each([
    ['schema', { schema: 'e2s.wrong' }],
    ['version', { version: 2 }],
    ['status', { status: 'worker_succeeded' }],
  ])('rejects a recomputed foreign %s identity', (_label, mutation) => {
    const worker = workerDiagnostic();
    const changed = resignWorker(worker, mutation);
    expect(() => parseNativeTwoCycleWorkerFailureDiagnosticV1(
      `${canonicalJson(changed)}\n`,
      bindings,
    )).toThrow(/identity differs/iu);
  });

  it.each([
    ['schema', 'schema'],
    ['stage', 'stage'],
    ['receipt digest', 'receiptDigestHex'],
  ] as const)('rejects a missing %s field', (_label, field) => {
    const changed = resignWorkerWithout(workerDiagnostic(), field);
    expect(() => parseNativeTwoCycleWorkerFailureDiagnosticV1(
      `${canonicalJson(changed)}\n`,
      bindings,
    )).toThrow(/fields differ/iu);
  });

  it('rejects an extra field even with a recomputed digest', () => {
    const changed = resignWorker(workerDiagnostic(), { extra: true });
    expect(() => parseNativeTwoCycleWorkerFailureDiagnosticV1(
      `${canonicalJson(changed)}\n`,
      bindings,
    )).toThrow(/fields differ/iu);
  });

  it.each([
    ['root cleanup', { rootCleanupEstablished: true }],
    ['raw cause publication', { rawCausePublished: true }],
  ])('rejects a recomputed positive %s claim', (_label, mutation) => {
    const changed = resignWorker(workerDiagnostic(), mutation);
    expect(() => parseNativeTwoCycleWorkerFailureDiagnosticV1(
      `${canonicalJson(changed)}\n`,
      bindings,
    )).toThrow(/identity differs/iu);
  });

  it.each([
    ['unknown stage', { stage: 'unknown-stage' }, /stage is unsupported/iu],
    [
      'unknown source phase',
      { sourceFailurePhase: 'unknown source phase' },
      /source failure phase is unsupported/iu,
    ],
    [
      'source phase outside root-or-cleanup',
      { stage: 'projection', sourceFailurePhase: 'source target Frontier build' },
      /requires root-or-cleanup/iu,
    ],
  ])('rejects %s', (_label, mutation, expectedError) => {
    const changed = resignWorker(workerDiagnostic('root-or-cleanup'), mutation);
    expect(() => parseNativeTwoCycleWorkerFailureDiagnosticV1(
      `${canonicalJson(changed)}\n`,
      bindings,
    )).toThrow(expectedError);
  });

  it.each([
    ['config SHA-256', { configSha256Hex: 'AA'.repeat(32) }],
    ['expected bridge commit', { expectedBridgeCommit: '2'.repeat(39) }],
    ['path identity digest', { pathIdentityDigestHex: 'gg'.repeat(32) }],
  ])('rejects malformed %s hex with a recomputed digest', (_label, mutation) => {
    const changed = resignWorker(workerDiagnostic(), mutation);
    expect(() => parseNativeTwoCycleWorkerFailureDiagnosticV1(
      `${canonicalJson(changed)}\n`,
      bindings,
    )).toThrow(/lowercase hex/iu);
  });

  it('rejects a malformed worker receipt digest', () => {
    const worker = workerDiagnostic();
    expect(() => parseNativeTwoCycleWorkerFailureDiagnosticV1(
      `${canonicalJson({ ...worker, receiptDigestHex: '88'.repeat(31) })}\n`,
      bindings,
    )).toThrow(/receipt digest must be/iu);
  });

  it('rejects a validly shaped but incorrect worker receipt digest', () => {
    const worker = workerDiagnostic();
    expect(() => createNativeTwoCycleParentFailureDiagnosticV1(
      bindings,
      '44'.repeat(32),
      { ...worker, receiptDigestHex: '88'.repeat(32) },
    )).toThrow(/digest differs/iu);
  });

  it('rejects duplicate keys', () => {
    const worker = workerDiagnostic();
    const canonical = `${canonicalJson(worker)}\n`;
    const duplicate = canonical.replace(
      '{',
      '{"schema":"duplicate",',
    );
    expect(() => parseNativeTwoCycleWorkerFailureDiagnosticV1(
      duplicate,
      bindings,
    )).toThrow(/duplicate/iu);
  });

  it.each([
    ['pretty JSON without a terminal LF', (worker: object) => JSON.stringify(worker, null, 2)],
    ['canonical JSON without a terminal LF', (worker: object) => canonicalJson(worker)],
    ['canonical JSON with CRLF', (worker: object) => `${canonicalJson(worker)}\r\n`],
  ])('rejects %s', (_label, encode) => {
    expect(() => parseNativeTwoCycleWorkerFailureDiagnosticV1(
      encode(workerDiagnostic()),
      bindings,
    )).toThrow(/canonical JSON/iu);
  });

  it('rejects input larger than 16 KiB before parsing', () => {
    expect(() => parseNativeTwoCycleWorkerFailureDiagnosticV1(
      ' '.repeat(16 * 1024 + 1),
      bindings,
    )).toThrow(/16 KiB/iu);
  });

  it('uses the distinct parent diagnostic digest domain', () => {
    const parent = createNativeTwoCycleParentFailureDiagnosticV1(
      bindings,
      '44'.repeat(32),
      workerDiagnostic('projection'),
    );
    const { receiptDigestHex, ...body } = parent;
    expect(receiptDigestHex).toBe(sha256CanonicalJson(body, PARENT_DOMAIN));
    expect(receiptDigestHex).not.toBe(sha256CanonicalJson(body, WORKER_DOMAIN));
  });

  it('binds the parent digest to the authoritative failure receipt', () => {
    const worker = workerDiagnostic('projection');
    const first = createNativeTwoCycleParentFailureDiagnosticV1(
      bindings,
      '44'.repeat(32),
      worker,
    );
    const second = createNativeTwoCycleParentFailureDiagnosticV1(
      bindings,
      '45'.repeat(32),
      worker,
    );
    expect(second.receiptDigestHex).not.toBe(first.receiptDigestHex);
  });

  it('binds the parent digest to the invocation identity', () => {
    const otherBindings = Object.freeze({
      ...bindings,
      pathIdentityDigestHex: '99'.repeat(32),
    });
    const first = createNativeTwoCycleParentFailureDiagnosticV1(
      bindings,
      '44'.repeat(32),
      workerDiagnostic('projection'),
    );
    const second = createNativeTwoCycleParentFailureDiagnosticV1(
      otherBindings,
      '44'.repeat(32),
      createNativeTwoCycleWorkerFailureDiagnosticV1(
        otherBindings,
        'projection',
        new Error('hidden'),
      ),
    );
    expect(second.receiptDigestHex).not.toBe(first.receiptDigestHex);
  });

  it.each([
    ['short', 'aa'.repeat(31)],
    ['uppercase', 'AA'.repeat(32)],
    ['non-hex', 'zz'.repeat(32)],
  ])('rejects a %s parent failure receipt digest', (_label, digest) => {
    expect(() => createNativeTwoCycleParentFailureDiagnosticV1(
      bindings,
      digest,
      workerDiagnostic(),
    )).toThrow(/failure receipt digest must be/iu);
  });

  it('never reads or publishes raw cause properties', () => {
    const rawSecret = 'wallet-private-material-must-not-appear';
    const cause = new Error('safe placeholder');
    Object.defineProperty(cause, 'message', {
      configurable: true,
      get: () => { throw new Error(rawSecret); },
    });
    Object.defineProperty(cause, 'stack', {
      configurable: true,
      get: () => { throw new Error(rawSecret); },
    });

    const diagnostic = createNativeTwoCycleWorkerFailureDiagnosticV1(
      bindings,
      'root-or-cleanup',
      cause,
    );
    expect(canonicalJson(diagnostic)).not.toContain(rawSecret);
  });
});

function workerDiagnostic(stage: 'pre-root' | 'root-or-cleanup' | 'projection'
  | 'post-root-identity' | 'transport-publication' = 'pre-root') {
  return createNativeTwoCycleWorkerFailureDiagnosticV1(
    bindings,
    stage,
    new Error('hidden'),
  );
}

function resignWorker(
  worker: object,
  mutation: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const { receiptDigestHex: ignored, ...originalBody } = worker as Record<string, unknown>;
  void ignored;
  const body = { ...originalBody, ...mutation };
  return Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, WORKER_DOMAIN),
  });
}

function resignWorkerWithout(
  worker: object,
  field: string,
): Readonly<Record<string, unknown>> {
  const record = { ...worker as Record<string, unknown> };
  delete record[field];
  if (field === 'receiptDigestHex') return Object.freeze(record);
  const { receiptDigestHex: ignored, ...originalBody } = record;
  void ignored;
  const body = { ...originalBody };
  return Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, WORKER_DOMAIN),
  });
}
