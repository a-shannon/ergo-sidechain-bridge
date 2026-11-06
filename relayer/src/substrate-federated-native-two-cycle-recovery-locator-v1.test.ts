import { describe, expect, it, vi } from 'vitest';

import {
  canonicalJson,
  sha256CanonicalJson,
} from './ergo-settlement-core/strict-json.js';
import {
  createNativeTwoCycleParentRecoveryLocatorV1,
  createNativeTwoCycleWorkerRecoveryLocatorV1,
  parseNativeTwoCycleParentRecoveryLocatorV1,
  parseNativeTwoCycleWorkerRecoveryLocatorV1,
} from './substrate-federated-native-two-cycle-recovery-locator-v1.js';

const WORKER_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_RECOVERY_LOCATOR_V1';
const PARENT_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_RECOVERY_LOCATOR_V1';
const bindings = Object.freeze({
  configSha256Hex: '11'.repeat(32),
  bridgeCommit: '22'.repeat(20),
  bridgeTree: '33'.repeat(20),
  pathIdentityDigestHex: '44'.repeat(32),
  toolIdentityDigestHex: '55'.repeat(32),
  rootResultDigestHex: '66'.repeat(32),
});
const pointer = Object.freeze({
  buildDirectoryName: 'bridge-fed-genesis-Ab12Z9',
  directoryName: 'two-cycle-recovery-qR7tY2',
  manifestSha256Hex: '77'.repeat(32),
});
const terminalReceiptDigestHex = '88'.repeat(32);

describe('native two-cycle recovery locator V1', () => {
  it('creates a frozen path-free worker receipt with explicit nonclaims', () => {
    const worker = createNativeTwoCycleWorkerRecoveryLocatorV1(pointer, bindings);

    expect(worker).toEqual({
      schema: 'e2s.substrate-federated-native-two-cycle-worker-recovery-locator.v1',
      version: 1,
      status: 'root_recovery_locator_bound',
      ...bindings,
      locator: pointer,
      nodeConsistencyEstablished: false,
      freshRestartValidated: false,
      executionAuthorityRestored: false,
      receiptDigestHex: worker.receiptDigestHex,
    });
    expect(Object.isFrozen(worker)).toBe(true);
    expect(Object.isFrozen(worker.locator)).toBe(true);
    expect(Object.keys(worker.locator).sort()).toEqual([
      'buildDirectoryName', 'directoryName', 'manifestSha256Hex',
    ]);
    expect(canonicalJson(worker)).not.toMatch(/[A-Z]:[\\/]|(?:^|["'])\.\.[\\/]/u);
  });

  it('round-trips canonical worker and parent receipts with exact ancestry', () => {
    const worker = createNativeTwoCycleWorkerRecoveryLocatorV1(pointer, bindings);
    const workerText = encode(worker);
    const parsedWorker = parseNativeTwoCycleWorkerRecoveryLocatorV1(
      workerText,
      bindings,
    );
    const parent = createNativeTwoCycleParentRecoveryLocatorV1(
      workerText,
      bindings,
      terminalReceiptDigestHex,
    );
    const parsedParent = parseNativeTwoCycleParentRecoveryLocatorV1(
      encode(parent),
      bindings,
      terminalReceiptDigestHex,
      workerText,
    );

    expect(parsedWorker).toEqual(worker);
    expect(parsedParent).toEqual(parent);
    expect(parent.locator).toEqual(pointer);
    expect(parent.workerRecoveryLocatorReceiptDigestHex).toBe(worker.receiptDigestHex);
    expect(parent.terminalReceiptDigestHex).toBe(terminalReceiptDigestHex);
    expect(parent.nodeConsistencyEstablished).toBe(false);
    expect(parent.freshRestartValidated).toBe(false);
    expect(parent.executionAuthorityRestored).toBe(false);
    expect(Object.isFrozen(parent)).toBe(true);
    expect(Object.isFrozen(parent.locator)).toBe(true);
  });

  it('uses separate worker and parent digest domains', () => {
    const worker = createNativeTwoCycleWorkerRecoveryLocatorV1(pointer, bindings);
    const { receiptDigestHex: workerDigest, ...workerBody } = worker;
    const parent = createNativeTwoCycleParentRecoveryLocatorV1(
      encode(worker), bindings, terminalReceiptDigestHex,
    );
    const { receiptDigestHex: parentDigest, ...parentBody } = parent;

    expect(workerDigest).toBe(sha256CanonicalJson(workerBody, WORKER_DOMAIN));
    expect(workerDigest).not.toBe(sha256CanonicalJson(workerBody, PARENT_DOMAIN));
    expect(parentDigest).toBe(sha256CanonicalJson(parentBody, PARENT_DOMAIN));
    expect(parentDigest).not.toBe(sha256CanonicalJson(parentBody, WORKER_DOMAIN));
  });

  it.each([
    ['config digest', 'configSha256Hex', '90'.repeat(32)],
    ['bridge commit', 'bridgeCommit', '91'.repeat(20)],
    ['bridge tree', 'bridgeTree', '92'.repeat(20)],
    ['path identity', 'pathIdentityDigestHex', '93'.repeat(32)],
    ['tool identity', 'toolIdentityDigestHex', '94'.repeat(32)],
    ['root result', 'rootResultDigestHex', '95'.repeat(32)],
  ] as const)('rejects a recomputed foreign worker %s binding', (_label, field, value) => {
    const foreign = resignWorker(workerRecord(), { [field]: value });
    expect(() => parseNativeTwoCycleWorkerRecoveryLocatorV1(
      encode(foreign), bindings,
    )).toThrow(/bindings differ/iu);
  });

  it.each([
    ['config digest', { configSha256Hex: 'AA'.repeat(32) }],
    ['bridge commit', { bridgeCommit: 'a'.repeat(39) }],
    ['bridge tree', { bridgeTree: 'z'.repeat(40) }],
    ['path identity', { pathIdentityDigestHex: '0'.repeat(63) }],
    ['tool identity', { toolIdentityDigestHex: 'GG'.repeat(32) }],
    ['root result', { rootResultDigestHex: 'x'.repeat(64) }],
  ])('rejects malformed worker %s', (_label, mutation) => {
    expect(() => parseNativeTwoCycleWorkerRecoveryLocatorV1(
      encode(resignWorker(workerRecord(), mutation)), bindings,
    )).toThrow(/lowercase hex/iu);
  });

  it.each([
    ['schema', { schema: 'e2s.wrong' }],
    ['version', { version: 2 }],
    ['status', { status: 'recovery_complete' }],
    ['node consistency', { nodeConsistencyEstablished: true }],
    ['fresh restart', { freshRestartValidated: true }],
    ['execution authority', { executionAuthorityRestored: true }],
  ])('rejects a recomputed worker mutation to %s', (_label, mutation) => {
    expect(() => parseNativeTwoCycleWorkerRecoveryLocatorV1(
      encode(resignWorker(workerRecord(), mutation)), bindings,
    )).toThrow(/identity differs/iu);
  });

  it.each([
    ['build traversal', { buildDirectoryName: '../bridge-fed-genesis-Ab12Z9' }],
    ['build separator', { buildDirectoryName: 'bridge-fed-genesis-Ab1/9Z' }],
    ['capture traversal', { directoryName: '..\\two-cycle-recovery-qR7tY2' }],
    ['capture separator', { directoryName: 'two-cycle-recovery-qR7/tY' }],
    ['build suffix length', { buildDirectoryName: 'bridge-fed-genesis-Ab12Z' }],
    ['capture suffix alphabet', { directoryName: 'two-cycle-recovery-qR7t_2' }],
    ['manifest digest', { manifestSha256Hex: 'AA'.repeat(32) }],
  ])('rejects %s in the nested locator', (_label, mutation) => {
    const locator = { ...pointer, ...mutation };
    expect(() => parseNativeTwoCycleWorkerRecoveryLocatorV1(
      encode(resignWorker(workerRecord(), { locator })), bindings,
    )).toThrow();
  });

  it('rejects unknown or missing fields at either object level', () => {
    const worker = workerRecord();
    expect(() => parseNativeTwoCycleWorkerRecoveryLocatorV1(
      encode(resignWorker(worker, { rawManifest: {} })), bindings,
    )).toThrow(/fields differ/iu);
    expect(() => parseNativeTwoCycleWorkerRecoveryLocatorV1(
      encode(resignWorker(worker, { locator: { ...pointer, path: 'nested/private' } })), bindings,
    )).toThrow(/fields differ/iu);
    expect(() => parseNativeTwoCycleWorkerRecoveryLocatorV1(
      encode(resignWorkerWithout(worker, 'locator')), bindings,
    )).toThrow(/fields differ/iu);
  });

  it('rejects an incorrect digest and a digest made with the wrong domain', () => {
    const worker = workerRecord();
    const { receiptDigestHex: ignored, ...body } = worker;
    void ignored;
    expect(() => parseNativeTwoCycleWorkerRecoveryLocatorV1(
      encode({ ...worker, receiptDigestHex: '99'.repeat(32) }), bindings,
    )).toThrow(/digest differs/iu);
    expect(() => parseNativeTwoCycleWorkerRecoveryLocatorV1(
      encode({ ...body, receiptDigestHex: sha256CanonicalJson(body, PARENT_DOMAIN) }),
      bindings,
    )).toThrow(/digest differs/iu);
  });

  it('rejects direct-create accessors and proxies without invoking caller code', () => {
    const accessor = { ...pointer };
    const getter = vi.fn(() => { throw new Error('accessor executed'); });
    Object.defineProperty(accessor, 'directoryName', {
      enumerable: true,
      get: getter,
    });
    expect(() => createNativeTwoCycleWorkerRecoveryLocatorV1(
      accessor,
      bindings,
    )).toThrow(/data properties/iu);
    expect(getter).not.toHaveBeenCalled();

    const trap = vi.fn(() => { throw new Error('proxy trap executed'); });
    const proxy = new Proxy({ ...pointer }, {
      get: trap,
      getOwnPropertyDescriptor: trap,
      getPrototypeOf: trap,
      ownKeys: trap,
    });
    expect(() => createNativeTwoCycleWorkerRecoveryLocatorV1(
      proxy,
      bindings,
    )).toThrow(/plain data object/iu);
    expect(trap).not.toHaveBeenCalled();
  });

  it('rejects duplicate keys, noncanonical transport, and oversized text', () => {
    const worker = workerRecord();
    const canonical = canonicalJson(worker);
    expect(() => parseNativeTwoCycleWorkerRecoveryLocatorV1(
      `${canonical.replace('{', '{"schema":"duplicate",')}\n`, bindings,
    )).toThrow(/duplicate/iu);
    const nestedDuplicate = `${canonical.replace(
      '"locator":{',
      '"locator":{"directoryName":"duplicate",',
    )}\n`;
    expect(() => parseNativeTwoCycleWorkerRecoveryLocatorV1(
      nestedDuplicate, bindings,
    )).toThrow(/duplicate/iu);
    for (const text of [
      canonical,
      `${canonical}\r\n`,
      `${canonical}\n\n`,
      `${JSON.stringify(worker, null, 2)}\n`,
    ]) {
      expect(() => parseNativeTwoCycleWorkerRecoveryLocatorV1(
        text, bindings,
      )).toThrow(/canonical JSON/iu);
    }
    expect(() => parseNativeTwoCycleWorkerRecoveryLocatorV1(
      ' '.repeat(16 * 1024 + 1), bindings,
    )).toThrow(/16 KiB/iu);
  });

  it('rejects changed terminal and worker ancestry in a parent receipt', () => {
    const worker = workerRecord();
    const workerText = encode(worker);
    const parent = createNativeTwoCycleParentRecoveryLocatorV1(
      workerText, bindings, terminalReceiptDigestHex,
    );
    const otherWorker = createNativeTwoCycleWorkerRecoveryLocatorV1({
      ...pointer,
      directoryName: 'two-cycle-recovery-a1B2c3',
    }, bindings);

    expect(() => parseNativeTwoCycleParentRecoveryLocatorV1(
      encode(parent), bindings, '89'.repeat(32), workerText,
    )).toThrow(/terminal ancestry differs/iu);
    expect(() => parseNativeTwoCycleParentRecoveryLocatorV1(
      encode(parent), bindings, terminalReceiptDigestHex, encode(otherWorker),
    )).toThrow(/worker ancestry differs/iu);
  });

  it.each([
    ['terminal digest', { terminalReceiptDigestHex: '99'.repeat(32) }],
    ['worker digest', { workerRecoveryLocatorReceiptDigestHex: '99'.repeat(32) }],
    ['locator', { locator: { ...pointer, directoryName: 'two-cycle-recovery-a1B2c3' } }],
    ['nonclaim', { freshRestartValidated: true }],
    ['unknown field', { rawManifest: {} }],
  ])('rejects a recomputed parent mutation to %s', (_label, mutation) => {
    const workerText = encode(workerRecord());
    const parent = createNativeTwoCycleParentRecoveryLocatorV1(
      workerText, bindings, terminalReceiptDigestHex,
    );
    expect(() => parseNativeTwoCycleParentRecoveryLocatorV1(
      encode(resignParent(parent, mutation)),
      bindings,
      terminalReceiptDigestHex,
      workerText,
    )).toThrow();
  });

  it('rejects noncanonical parent bytes and malformed terminal digests', () => {
    const workerText = encode(workerRecord());
    const parent = createNativeTwoCycleParentRecoveryLocatorV1(
      workerText, bindings, terminalReceiptDigestHex,
    );
    expect(() => parseNativeTwoCycleParentRecoveryLocatorV1(
      canonicalJson(parent), bindings, terminalReceiptDigestHex, workerText,
    )).toThrow(/canonical JSON/iu);
    expect(() => createNativeTwoCycleParentRecoveryLocatorV1(
      workerText, bindings, 'AA'.repeat(32),
    )).toThrow(/lowercase hex/iu);
    expect(() => parseNativeTwoCycleParentRecoveryLocatorV1(
      encode(parent), bindings, '8'.repeat(63), workerText,
    )).toThrow(/lowercase hex/iu);
  });
});

function workerRecord() {
  return createNativeTwoCycleWorkerRecoveryLocatorV1(pointer, bindings);
}

function encode(value: unknown): string {
  return `${canonicalJson(value)}\n`;
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
  const { receiptDigestHex: ignored, ...body } = record;
  void ignored;
  return Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, WORKER_DOMAIN),
  });
}

function resignParent(
  parent: object,
  mutation: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const { receiptDigestHex: ignored, ...originalBody } = parent as Record<string, unknown>;
  void ignored;
  const body = { ...originalBody, ...mutation };
  return Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(body, PARENT_DOMAIN),
  });
}
