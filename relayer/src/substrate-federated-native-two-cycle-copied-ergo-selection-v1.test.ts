import { createHash } from 'node:crypto';
import { linkSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalJson, sha256CanonicalJson } from './strict-json.js';
import { extendedRootResult } from './test-support/substrate-federated-native-two-cycle-root-result.js';
import { projectSubstrateFederatedNativeTwoCycleResultV1 } from './substrate-federated-native-two-cycle-invocation-v1.js';
import { createNativeTwoCycleWorkerRecoveryLocatorV1, createNativeTwoCycleParentRecoveryLocatorV1 } from './substrate-federated-native-two-cycle-recovery-locator-v1.js';
import { createNativeTwoCycleWorkerCopiedErgoSelectionV1, parseNativeTwoCycleWorkerCopiedErgoSelectionV1,
  createNativeTwoCycleParentCopiedErgoSelectionV1, parseNativeTwoCycleParentCopiedErgoSelectionV1,
  readNativeTwoCycleCopiedErgoCaptureManifestV1, prepareNativeTwoCycleCopiedErgoOwnerInputV1,
  type NativeTwoCycleCopiedErgoOwnerInputPreparationV1 } from './substrate-federated-native-two-cycle-copied-ergo-selection-v1.js';

const text = (value: unknown) => `${canonicalJson(value)}\n`;
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const other = 'ef'.repeat(32);
const workerDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_WORKER_COPIED_ERGO_SELECTION_V1';
const parentDomain = 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_PARENT_COPIED_ERGO_SELECTION_V1';

describe('pure public parent to copied Ergo owner input', () => {
  function preparation() {
    const f = fixture(); let calls = 0;
    const assertSourcesQuiescent = () => { calls++; throw new Error('must not run during preparation'); };
    const parentSelectionText = text(f.parent);
    const input: NativeTwoCycleCopiedErgoOwnerInputPreparationV1 = {
      parentSelectionText, expectedParentSelectionSha256Hex: hash(parentSelectionText), expected: f.parentExpected,
      buildParentDirectory: resolve('synthetic-unmaterialized-owner-parent'), assertSourcesQuiescent,
    };
    return { f, input, calls: () => calls };
  }
  it('prepares exact frozen five-field owner input from public parent text without raw root or worker files', () => {
    const { f, input, calls } = preparation();
    const selected = prepareNativeTwoCycleCopiedErgoOwnerInputV1(input);
    const ergo = join(input.buildParentDirectory, f.parent.locator.buildDirectoryName, 'target', f.parent.locator.directoryName, 'ergo');
    expect(selected.ownerInput).toEqual({ primaryRoot: join(ergo, 'primary'), witnessRoot: join(ergo, 'witness'),
      capturedManifestSha256Hex: f.parent.ergoManifestSha256Hex, expectedSnapshot: f.parent.expectedSnapshot,
      assertSourcesQuiescent: input.assertSourcesQuiescent });
    expect(Object.keys(selected.ownerInput).sort()).toEqual(['assertSourcesQuiescent', 'capturedManifestSha256Hex',
      'expectedSnapshot', 'primaryRoot', 'witnessRoot']);
    expect(selected).toMatchObject({ schema: 'e2s.substrate-federated-native-two-cycle-copied-ergo-owner-input-selection.v1',
      version: 1, parentSelectionRawSha256Hex: hash(input.parentSelectionText), parentSelectionReceiptDigestHex: f.parent.receiptDigestHex,
      rootRawSha256Hex: f.parent.rootRawSha256Hex, legacyProjectedReceiptDigestHex: f.parent.projectedReceiptDigestHex,
      aggregateManifestSha256Hex: f.parent.locator.manifestSha256Hex, successAuthenticated: false, recoveryAdmitted: false,
      nodeConsistencyEstablished: false, freshRestartValidated: false, executionAuthorityRestored: false });
    expect(selected.ownerInput.assertSourcesQuiescent).toBe(input.assertSourcesQuiescent);
    expect(calls()).toBe(0);
    for (const value of [selected, selected.ownerInput, selected.ownerInput.expectedSnapshot]) expect(Object.isFrozen(value)).toBe(true);
    f.parentExpected.expectedSnapshot.fullHeight++;
    expect(selected.ownerInput.expectedSnapshot.fullHeight).toBe(220);
  });
  it('retains an asynchronous callback by reference without invoking it', () => {
    const { input } = preparation(); let calls = 0;
    const callback = async () => { calls++; };
    expect(prepareNativeTwoCycleCopiedErgoOwnerInputV1({ ...input, assertSourcesQuiescent: callback })
      .ownerInput.assertSourcesQuiescent).toBe(callback);
    expect(calls).toBe(0);
  });
  it.each(['wrong', 'uppercase', 'short', 'LF', 'receipt-digest'] as const)('rejects selected raw pin %s', fault => {
    const { f, input, calls } = preparation();
    const pin = fault === 'wrong' ? other : fault === 'uppercase' ? 'AB'.repeat(32) : fault === 'short' ? 'a'.repeat(63)
      : fault === 'LF' ? input.expectedParentSelectionSha256Hex + '\n' : f.parent.receiptDigestHex;
    expect(() => prepareNativeTwoCycleCopiedErgoOwnerInputV1({ ...input, expectedParentSelectionSha256Hex: pin })).toThrow();
    expect(calls()).toBe(0);
  });
  it.each(['stale-raw-pin', 're-pinned-noncanonical'] as const)('refuses changed parent bytes %s', fault => {
    const { input } = preparation(); const changed = input.parentSelectionText + ' ';
    expect(() => prepareNativeTwoCycleCopiedErgoOwnerInputV1({ ...input, parentSelectionText: changed,
      expectedParentSelectionSha256Hex: fault === 'stale-raw-pin' ? input.expectedParentSelectionSha256Hex : hash(changed) })).toThrow();
  });
  const ancestryFields = ['terminalReceiptDigestHex', 'parentRecoveryLocatorReceiptDigestHex', 'workerSelectionReceiptDigestHex',
    'workerRecoveryLocatorReceiptDigestHex', 'ergoManifestSha256Hex', 'rootRawSha256Hex', 'rootResultDigestHex',
    'projectedReceiptDigestHex', 'configSha256Hex'] as const;
  it.each(ancestryFields)('refuses independently changed parent %s with both hashes recomputed', field => {
    const { f, input, calls } = preparation(); const changed = resign({ ...f.parent, [field]: other }, parentDomain);
    expect(() => prepareNativeTwoCycleCopiedErgoOwnerInputV1({ ...input, parentSelectionText: changed,
      expectedParentSelectionSha256Hex: hash(changed) })).toThrow();
    expect(calls()).toBe(0);
  });
  it.each(['build', 'capture', 'aggregate', 'tip'] as const)('refuses independent selected %s drift after re-pinning', fault => {
    const { f, input } = preparation(); const changed = resign({ ...f.parent,
      ...(fault === 'tip' ? { expectedSnapshot: { ...f.parent.expectedSnapshot, headerIdHex: other } }
        : { locator: { ...f.parent.locator, ...(fault === 'build' ? { buildDirectoryName: 'bridge-fed-genesis-Zz9876' }
          : fault === 'capture' ? { directoryName: 'two-cycle-recovery-Zz9876' } : { manifestSha256Hex: other }) } }) }, parentDomain);
    expect(() => prepareNativeTwoCycleCopiedErgoOwnerInputV1({ ...input, parentSelectionText: changed,
      expectedParentSelectionSha256Hex: hash(changed) })).toThrow();
  });
  it.each(['relative', 'traversal', 'UNC', 'device', 'ADS', 'NUL'] as const)('refuses build parent %s lexically', fault => {
    const { input } = preparation(); const buildParentDirectory = fault === 'relative' ? 'relative/build'
      : fault === 'traversal' ? `${input.buildParentDirectory}/../other` : fault === 'UNC' ? '//server/share/build'
        : fault === 'device' ? '//?/C:/build' : fault === 'ADS' ? `${input.buildParentDirectory}:stream` : `${input.buildParentDirectory}\0`;
    expect(() => prepareNativeTwoCycleCopiedErgoOwnerInputV1({ ...input, buildParentDirectory })).toThrow();
  });
  it.each(['proxy', 'getter', 'symbol', 'nonenumerable', 'extra', 'missing', 'callback-proxy', 'callback-nonfunction',
    'expected-proxy', 'expected-getter', 'snapshot-proxy'] as const)('refuses hostile %s without hooks', fault => {
      const { input } = preparation(); let calls = 0; let changed: object = { ...input };
      const traps = { getPrototypeOf() { calls++; throw Error('trap'); }, ownKeys() { calls++; throw Error('trap'); },
        apply() { calls++; throw Error('trap'); } };
      if (fault === 'proxy') changed = new Proxy(changed, traps);
      if (fault === 'getter') Object.defineProperty(changed, 'parentSelectionText', { enumerable: true, get() { calls++; throw Error('getter'); } });
      if (fault === 'symbol') Object.assign(changed, { [Symbol('extra')]: true });
      if (fault === 'nonenumerable') Object.defineProperty(changed, 'expected', { enumerable: false });
      if (fault === 'extra') Object.assign(changed, { extra: true });
      if (fault === 'missing') Reflect.deleteProperty(changed, 'expected');
      if (fault === 'callback-proxy') Object.assign(changed, { assertSourcesQuiescent: new Proxy(input.assertSourcesQuiescent, traps) });
      if (fault === 'callback-nonfunction') Object.assign(changed, { assertSourcesQuiescent: {} });
      if (fault === 'expected-proxy') Object.assign(changed, { expected: new Proxy(input.expected, traps) });
      if (fault === 'expected-getter') { const expected = { ...input.expected }; Object.defineProperty(expected, 'bindings',
        { enumerable: true, get() { calls++; throw Error('getter'); } }); Object.assign(changed, { expected }); }
      if (fault === 'snapshot-proxy') Object.assign(changed, { expected: { ...input.expected,
        expectedSnapshot: new Proxy(input.expected.expectedSnapshot!, traps) } });
      expect(() => prepareNativeTwoCycleCopiedErgoOwnerInputV1(changed as NativeTwoCycleCopiedErgoOwnerInputPreparationV1)).toThrow();
      expect(calls).toBe(0);
    });
  it('retains false claims when no independently selected tip or raw root pin is available', () => {
    const { f, input } = preparation(); const { expectedSnapshot: _tip, rootRawSha256Hex: _raw, ...expected } = input.expected;
    const changed = resign({ ...f.parent, expectedSnapshot: { ...f.parent.expectedSnapshot, headerIdHex: other } }, parentDomain);
    const selected = prepareNativeTwoCycleCopiedErgoOwnerInputV1({ ...input, expected, parentSelectionText: changed,
      expectedParentSelectionSha256Hex: hash(changed) });
    expect(selected.ownerInput.expectedSnapshot.headerIdHex).toBe(other);
    expect(selected.successAuthenticated).toBe(false); expect(selected.recoveryAdmitted).toBe(false);
  });
});
function resign(value: object, domain: string): string {
  const { receiptDigestHex: _ignored, ...body } = value as Record<string, unknown>;
  return text({ ...body, receiptDigestHex: sha256CanonicalJson(body, domain) });
}
function fixture() {
  const root = extendedRootResult();
  const snapshot = { network: 'devnet' as const, fullHeight: 220, indexedHeight: 220, headerIdHex: 'ab'.repeat(32) };
  const complete = { ...root, secondCycle: { ...root.secondCycle, confirmationExecution: { finalSnapshot: snapshot } } };
  const aggregate = { schema: 'e2s.substrate-federated-two-cycle-recovery-capture.v1',
    kind: 'stopped-node-copy-and-sqlite-evidence', components: {
      ergo: { file: 'ergo/manifest.json', bytes: 1200, sha256Hex: '11'.repeat(32) },
      frontier: { file: 'frontier/manifest.json', bytes: 1300, sha256Hex: '22'.repeat(32) },
      sqlite: { file: 'sqlite/manifest.json', bytes: 1400, sha256Hex: '33'.repeat(32) },
    }, summary: { ergoFiles: 8, frontierFiles: 8, nodeDatabaseBytes: 2000, sqliteDatabaseBytes: 4096, trackerAdmissionAttempts: 2 },
    nodeConsistencyEstablished: false, freshRestartValidated: false, executionAuthorityRestored: false };
  const captureManifestText = `${JSON.stringify(aggregate, null, 2)}\n`;
  complete.recoveryEvidence.manifestSha256Hex = hash(captureManifestText);
  const rootResultText = text(complete);
  const projection = projectSubstrateFederatedNativeTwoCycleResultV1(complete);
  const legacyBindings = { configSha256Hex: '01'.repeat(32), bridgeCommit: '02'.repeat(20), bridgeTree: '03'.repeat(20),
    pathIdentityDigestHex: '04'.repeat(32), toolIdentityDigestHex: '05'.repeat(32), rootResultDigestHex: projection.rootResultDigestHex };
  const bindings = { ...legacyBindings, projectedReceiptDigestHex: projection.receiptDigestHex };
  const workerLocator = createNativeTwoCycleWorkerRecoveryLocatorV1(complete.recoveryEvidence, legacyBindings);
  const terminalReceiptDigestHex = '06'.repeat(32);
  const parentLocator = createNativeTwoCycleParentRecoveryLocatorV1(text(workerLocator), legacyBindings, terminalReceiptDigestHex);
  const input = { rootResultText, captureManifestText, buildParentDirectory: resolve('synthetic-build-parent'),
    workerRecoveryLocatorText: text(workerLocator), bindings };
  const expected = { bindings, locator: complete.recoveryEvidence, ergoManifestSha256Hex: aggregate.components.ergo.sha256Hex,
    workerRecoveryLocatorReceiptDigestHex: workerLocator.receiptDigestHex, rootRawSha256Hex: hash(rootResultText), expectedSnapshot: snapshot };
  const worker = createNativeTwoCycleWorkerCopiedErgoSelectionV1(input);
  const parentInput = { workerSelectionText: text(worker), workerRecoveryLocatorText: text(workerLocator),
    parentRecoveryLocatorText: text(parentLocator), terminalReceiptDigestHex, expected };
  const parent = createNativeTwoCycleParentCopiedErgoSelectionV1(parentInput);
  const parentExpected = { ...expected, terminalReceiptDigestHex, parentRecoveryLocatorReceiptDigestHex: parentLocator.receiptDigestHex,
    workerSelectionReceiptDigestHex: worker.receiptDigestHex };
  return { root: complete, aggregate, input, expected, parentExpected, worker, parent, parentInput, projection };
}
type Fixture = ReturnType<typeof fixture>;

describe('public copied Ergo selection companions', () => {
  it('derives a selection through the actual pure selector and old locator ancestry, without changing old result bytes', () => {
    const f = fixture(); const before = text(f.projection);
    expect(parseNativeTwoCycleWorkerCopiedErgoSelectionV1(text(f.worker), f.expected)).toEqual(f.worker);
    expect(parseNativeTwoCycleParentCopiedErgoSelectionV1(text(f.parent), f.parentExpected)).toEqual(f.parent);
    expect(text(projectSubstrateFederatedNativeTwoCycleResultV1(f.root))).toBe(before);
    expect(f.worker.rootRawSha256Hex).toBe(hash(f.input.rootResultText));
    expect(f.worker.rootRawSha256Hex).not.toBe(f.worker.rootResultDigestHex);
    expect(f.worker.expectedSnapshot).toEqual(f.expected.expectedSnapshot);
    for (const value of [f.worker, f.parent, f.worker.locator, f.parent.expectedSnapshot]) expect(Object.isFrozen(value)).toBe(true);
    for (const key of ['successAuthenticated', 'recoveryAdmitted', 'nodeConsistencyEstablished', 'freshRestartValidated', 'executionAuthorityRestored']) {
      expect((f.parent as unknown as Record<string, unknown>)[key]).toBe(false);
    }
    expect(text(f.parent)).not.toContain(f.input.buildParentDirectory);
  });

  const independentlyBoundFields = ['configSha256Hex', 'bridgeCommit', 'bridgeTree', 'pathIdentityDigestHex',
    'toolIdentityDigestHex', 'rootResultDigestHex', 'projectedReceiptDigestHex', 'rootRawSha256Hex',
    'ergoManifestSha256Hex', 'workerRecoveryLocatorReceiptDigestHex'] as const;
  it.each(independentlyBoundFields)('refuses independently changed %s after a valid new self digest', field => {
    const f = fixture(); const changed = field === 'bridgeCommit' || field === 'bridgeTree' ? 'ef'.repeat(20) : other;
    expect(() => parseNativeTwoCycleWorkerCopiedErgoSelectionV1(resign({ ...f.worker, [field]: changed }, workerDomain), f.expected)).toThrow();
    expect(() => parseNativeTwoCycleParentCopiedErgoSelectionV1(resign({ ...f.parent, [field]: changed }, parentDomain), f.parentExpected)).toThrow();
  });
  it.each([
    ['uppercase', 'AB'.repeat(32)], ['nonhex', 'gg'.repeat(32)],
    ['short', 'a'.repeat(63)], ['null', null], ['number', 7],
  ] as const)('refuses coordinated malformed component digest %s before correspondence', (_label, bad) => {
    const f = fixture();
    expect(() => parseNativeTwoCycleWorkerCopiedErgoSelectionV1(
      resign({ ...f.worker, ergoManifestSha256Hex: bad }, workerDomain),
      { ...f.expected, ergoManifestSha256Hex: bad } as unknown as typeof f.expected,
    )).toThrow(/digest differs/);
    expect(() => parseNativeTwoCycleParentCopiedErgoSelectionV1(
      resign({ ...f.parent, ergoManifestSha256Hex: bad }, parentDomain),
      { ...f.parentExpected, ergoManifestSha256Hex: bad } as unknown as typeof f.parentExpected,
    )).toThrow(/digest differs/);
  });
  it.each(['buildDirectoryName', 'directoryName', 'manifestSha256Hex'] as const)('refuses independently changed locator %s', field => {
    const f = fixture(); const changed = field === 'buildDirectoryName' ? 'bridge-fed-genesis-Zz9876'
      : field === 'directoryName' ? 'two-cycle-recovery-Zz9876' : other;
    const locator = { ...f.worker.locator, [field]: changed };
    expect(() => parseNativeTwoCycleWorkerCopiedErgoSelectionV1(resign({ ...f.worker, locator }, workerDomain), f.expected)).toThrow();
    expect(() => parseNativeTwoCycleParentCopiedErgoSelectionV1(resign({ ...f.parent, locator }, parentDomain), f.parentExpected)).toThrow();
  });
  it.each(['terminalReceiptDigestHex', 'parentRecoveryLocatorReceiptDigestHex', 'workerSelectionReceiptDigestHex'] as const)(
    'refuses independently changed parent ancestry %s', field => {
      const f = fixture(); expect(() => parseNativeTwoCycleParentCopiedErgoSelectionV1(
        resign({ ...f.parent, [field]: other }, parentDomain), f.parentExpected)).toThrow();
    });
  it.each(['successAuthenticated', 'recoveryAdmitted', 'nodeConsistencyEstablished', 'freshRestartValidated', 'executionAuthorityRestored'])(
    'refuses elevated %s even with a matching self digest', field => {
      const f = fixture();
      expect(() => parseNativeTwoCycleWorkerCopiedErgoSelectionV1(resign({ ...f.worker, [field]: true }, workerDomain), f.expected)).toThrow();
      expect(() => parseNativeTwoCycleParentCopiedErgoSelectionV1(resign({ ...f.parent, [field]: true }, parentDomain), f.parentExpected)).toThrow();
    });
  it.each(['network', 'height', 'index', 'header', 'extra'] as const)('refuses snapshot %s independently', fault => {
    const f = fixture(); const expectedSnapshot = { ...f.worker.expectedSnapshot,
      ...(fault === 'network' ? { network: 'mainnet' } : fault === 'height' ? { fullHeight: 221, indexedHeight: 221 }
        : fault === 'index' ? { indexedHeight: 219 } : fault === 'header' ? { headerIdHex: other } : { extra: 1 }) };
    expect(() => parseNativeTwoCycleWorkerCopiedErgoSelectionV1(resign({ ...f.worker, expectedSnapshot }, workerDomain), f.expected)).toThrow();
    expect(() => parseNativeTwoCycleParentCopiedErgoSelectionV1(resign({ ...f.parent, expectedSnapshot }, parentDomain), f.parentExpected)).toThrow();
  });
  it('does not represent self-hashes or opaque parent ancestry as authentication of a coordinated valid tip', () => {
    const f = fixture(); const { expectedSnapshot: _snapshot, rootRawSha256Hex: _root, ...expected } = f.parentExpected;
    const changed = resign({ ...f.parent, expectedSnapshot: { ...f.parent.expectedSnapshot, headerIdHex: other } }, parentDomain);
    expect(parseNativeTwoCycleParentCopiedErgoSelectionV1(changed, expected).successAuthenticated).toBe(false);
  });
  it.each(['root-projection', 'projected-receipt', 'worker-locator', 'parent-locator', 'terminal'] as const)('refuses creator ancestry %s', fault => {
    const f = fixture();
    if (fault === 'root-projection' || fault === 'projected-receipt') {
      expect(() => createNativeTwoCycleWorkerCopiedErgoSelectionV1({ ...f.input, bindings: { ...f.input.bindings,
        [fault === 'root-projection' ? 'rootResultDigestHex' : 'projectedReceiptDigestHex']: other } })).toThrow();
    } else if (fault === 'worker-locator') {
      expect(() => createNativeTwoCycleWorkerCopiedErgoSelectionV1({ ...f.input, workerRecoveryLocatorText: f.parentInput.parentRecoveryLocatorText })).toThrow();
    } else expect(() => createNativeTwoCycleParentCopiedErgoSelectionV1({ ...f.parentInput,
      ...(fault === 'parent-locator' ? { parentRecoveryLocatorText: f.input.workerRecoveryLocatorText } : { terminalReceiptDigestHex: other }) })).toThrow();
  });
  it.each(['status', 'snapshot', 'capture-pin', 'projected-only'] as const)('rejects creator source %s', fault => {
    const f = fixture(); const root = structuredClone(f.root);
    if (fault === 'status') root.status = 'failed';
    if (fault === 'snapshot') root.secondCycle.confirmationExecution.finalSnapshot.indexedHeight--;
    if (fault === 'capture-pin') root.recoveryEvidence.manifestSha256Hex = other;
    expect(() => createNativeTwoCycleWorkerCopiedErgoSelectionV1({ ...f.input,
      rootResultText: text(fault === 'projected-only' ? f.projection : root) })).toThrow();
  });
  it.each(['duplicate', 'deep', 'oversize', 'BOM', 'no-LF', 'CRLF', 'invalid-Unicode', 'wrong-domain', 'wrong-digest', 'extra', 'missing', 'schema', 'status', 'version'])(
    'refuses encoded %s at both boundaries', fault => {
      const f = fixture();
      for (const [receipt, domain, parseReceipt] of [
        [f.worker, workerDomain, (value: string) => parseNativeTwoCycleWorkerCopiedErgoSelectionV1(value, f.expected)],
        [f.parent, parentDomain, (value: string) => parseNativeTwoCycleParentCopiedErgoSelectionV1(value, f.parentExpected)],
      ] as const) {
        let source = text(receipt);
        if (fault === 'duplicate') source = source.replace('{', '{"version":1,');
        if (fault === 'deep') source = '['.repeat(65) + '0' + ']'.repeat(65);
        if (fault === 'oversize') source += ' '.repeat(16 * 1024);
        if (fault === 'BOM') source = '\ufeff' + source;
        if (fault === 'no-LF') source = source.trimEnd();
        if (fault === 'CRLF') source = source.replace(/\n$/, '\r\n');
        if (fault === 'invalid-Unicode') source += '\ud800';
        if (fault === 'wrong-domain') source = resign(receipt, 'OTHER');
        if (fault === 'wrong-digest') source = text({ ...receipt, receiptDigestHex: other });
        if (fault === 'extra') source = resign({ ...receipt, extra: 1 }, domain);
        if (fault === 'missing') { const body = { ...receipt }; Reflect.deleteProperty(body, 'rootRawSha256Hex'); source = resign(body, domain); }
        if (fault === 'schema' || fault === 'status' || fault === 'version') source = resign({ ...receipt, [fault]: fault === 'version' ? 2 : 'other' }, domain);
        expect(() => parseReceipt(source)).toThrow();
      }
    });
  it.each(['proxy', 'getter', 'nonenumerable', 'symbol', 'prototype'] as const)('refuses hostile input %s without executing it', fault => {
    const f = fixture(); let calls = 0; let input = { ...f.input };
    if (fault === 'proxy') input = new Proxy(input, { ownKeys() { calls++; throw Error('trap'); }, getPrototypeOf() { calls++; throw Error('trap'); } });
    if (fault === 'getter') Object.defineProperty(input, 'rootResultText', { enumerable: true, get() { calls++; throw Error('getter'); } });
    if (fault === 'nonenumerable') Object.defineProperty(input, 'rootResultText', { enumerable: false });
    if (fault === 'symbol') Object.assign(input, { [Symbol('extra')]: true });
    if (fault === 'prototype') Object.setPrototypeOf(input, { inherited: true });
    expect(() => createNativeTwoCycleWorkerCopiedErgoSelectionV1(input)).toThrow(); expect(calls).toBe(0);
  });
  it('rejects explicitly undefined optional expected pins', () => {
    const f = fixture();
    expect(() => parseNativeTwoCycleWorkerCopiedErgoSelectionV1(text(f.worker), { ...f.expected, rootRawSha256Hex: undefined })).toThrow();
    expect(() => parseNativeTwoCycleParentCopiedErgoSelectionV1(text(f.parent), { ...f.parentExpected, workerSelectionReceiptDigestHex: undefined })).toThrow();
  });
});

function diskFixture(content?: Buffer) {
  const f = fixture(); const parent = mkdtempSync(join(tmpdir(), 'bridge-public-selection-'));
  const capture = join(parent, f.expected.locator.buildDirectoryName, 'target', f.expected.locator.directoryName);
  mkdirSync(capture, { recursive: true }); const manifest = join(capture, 'manifest.json');
  const bytes = content ?? Buffer.from(f.input.captureManifestText); writeFileSync(manifest, bytes);
  return { ...f, buildParent: parent, capture, manifest, locator: { ...f.expected.locator, manifestSha256Hex: hash(bytes) } };
}

describe('fresh bounded aggregate reader', () => {
  it('derives the expected Ergo pin from the selected aggregate and preserves its exact text', () => {
    const f = diskFixture(); const result = readNativeTwoCycleCopiedErgoCaptureManifestV1(f.buildParent, f.locator);
    expect(result).toEqual({ captureManifestText: f.input.captureManifestText, ergoManifestSha256Hex: f.aggregate.components.ergo.sha256Hex });
    expect(Object.isFrozen(result)).toBe(true);
  });
  it.each(['changed-byte', 'hardlink', 'junction', 'directory', 'missing'] as const)('refuses filesystem %s', fault => {
    const f = diskFixture(); let parent = f.buildParent;
    if (fault === 'changed-byte') writeFileSync(f.manifest, f.input.captureManifestText + ' ');
    if (fault === 'hardlink') linkSync(f.manifest, join(f.capture, 'second-name.json'));
    if (fault === 'junction') { parent = join(f.buildParent, 'alias'); symlinkSync(f.buildParent, parent, 'junction'); }
    if (fault === 'directory') { parent = mkdtempSync(join(tmpdir(), 'bridge-public-selection-')); mkdirSync(join(parent, f.locator.buildDirectoryName, 'target', f.locator.directoryName, 'manifest.json'), { recursive: true }); }
    if (fault === 'missing') parent = join(f.buildParent, 'absent');
    expect(() => readNativeTwoCycleCopiedErgoCaptureManifestV1(parent, f.locator)).toThrow();
  });
  const faults: ReadonlyArray<readonly [string, (f: Fixture) => void]> = [
    ['schema', f => { f.aggregate.schema = 'other'; }], ['kind', f => { f.aggregate.kind = 'other'; }],
    ['false-claim', f => { f.aggregate.freshRestartValidated = true; }],
    ['component-role', f => { f.aggregate.components.ergo = { ...f.aggregate.components.frontier }; }],
    ['component-path', f => { f.aggregate.components.ergo.file = '../manifest.json'; }],
    ['component-bytes', f => { f.aggregate.components.ergo.bytes = 16 * 1024 * 1024 + 1; }],
    ['component-hash', f => { f.aggregate.components.ergo.sha256Hex += '\n'; }],
    ['component-extra', f => { Object.assign(f.aggregate.components.ergo, { extra: true }); }],
    ['component-missing', f => { Reflect.deleteProperty(f.aggregate.components, 'sqlite'); }],
    ['summary-count', f => { f.aggregate.summary.trackerAdmissionAttempts = 1; }],
    ['summary-bound', f => { f.aggregate.summary.ergoFiles = 100_001; }],
    ['summary-extra', f => { Object.assign(f.aggregate.summary, { extra: true }); }],
  ];
  it.each(faults)('refuses re-pinned aggregate %s', (_label, mutate) => {
    const f = fixture(); mutate(f); const d = diskFixture(Buffer.from(text(f.aggregate)));
    expect(() => readNativeTwoCycleCopiedErgoCaptureManifestV1(d.buildParent, d.locator)).toThrow();
  });
  it.each(['BOM', 'UTF8', 'duplicate', 'deep', 'oversize'] as const)('refuses re-pinned text %s', fault => {
    const f = fixture(); const bytes = fault === 'BOM' ? Buffer.from('\ufeff' + f.input.captureManifestText)
      : fault === 'UTF8' ? Buffer.from([0xc3, 0x28]) : fault === 'duplicate' ? Buffer.from(f.input.captureManifestText.replace('{', '{"kind":"other",'))
        : fault === 'deep' ? Buffer.from('['.repeat(65) + '0' + ']'.repeat(65)) : Buffer.alloc(64 * 1024 + 1, 32);
    const d = diskFixture(bytes); expect(() => readNativeTwoCycleCopiedErgoCaptureManifestV1(d.buildParent, d.locator)).toThrow();
  });
});
