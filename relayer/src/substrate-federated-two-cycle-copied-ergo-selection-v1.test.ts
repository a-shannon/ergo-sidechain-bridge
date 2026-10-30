import { createHash } from 'node:crypto';
import { join, resolve, win32 } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { extendedRootResult } from './test-support/substrate-federated-native-two-cycle-root-result.js';
import { projectSubstrateFederatedNativeTwoCycleResultV1 } from './substrate-federated-native-two-cycle-invocation-v1.js';
import { prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1,
  type SubstrateFederatedTwoCycleCopiedErgoSelectionV1Input } from './substrate-federated-two-cycle-copied-ergo-selection-v1.js';
import type { SubstrateFederatedCopiedNonMiningErgoNodePairV1Input } from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';

const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const syntheticWindowsBuild = win32.resolve('C:', '/', 'build').replaceAll('\\', '/');
function fixture() {
  const root = extendedRootResult();
  const snapshot = { network: 'devnet', fullHeight: 220, indexedHeight: 220, headerIdHex: 'ab'.repeat(32) };
  const complete = { ...root, secondCycle: { ...root.secondCycle,
    confirmationExecution: { finalSnapshot: snapshot } } };
  const aggregate = {
    schema: 'e2s.substrate-federated-two-cycle-recovery-capture.v1',
    kind: 'stopped-node-copy-and-sqlite-evidence',
    components: {
      ergo: { file: 'ergo/manifest.json', bytes: 1200, sha256Hex: '11'.repeat(32) },
      frontier: { file: 'frontier/manifest.json', bytes: 1300, sha256Hex: '22'.repeat(32) },
      sqlite: { file: 'sqlite/manifest.json', bytes: 1400, sha256Hex: '33'.repeat(32) },
    },
    summary: { ergoFiles: 8, frontierFiles: 8, nodeDatabaseBytes: 2000,
      sqliteDatabaseBytes: 4096, trackerAdmissionAttempts: 2 },
    nodeConsistencyEstablished: false, freshRestartValidated: false, executionAuthorityRestored: false,
  };
  const guard = vi.fn(() => undefined);
  const input = (): SubstrateFederatedTwoCycleCopiedErgoSelectionV1Input => {
    const captureManifestText = `${JSON.stringify(aggregate, null, 2)}\n`;
    complete.recoveryEvidence.manifestSha256Hex = hash(captureManifestText);
    const rootResultText = `${JSON.stringify(complete, null, 2)}\n`;
    return { rootResultText, expectedRootResultSha256Hex: hash(rootResultText), captureManifestText,
      buildParentDirectory: resolve('synthetic-build-parent'), assertSourcesQuiescent: guard };
  };
  return { root: complete, aggregate, guard, input };
}
type Fixture = ReturnType<typeof fixture>;

describe('pure two-cycle copied Ergo selection', () => {
  it('composes the existing successful root fixture with the exact observation-only owner input type', () => {
    const f = fixture(); const input = f.input();
    const selection = prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1(input);
    const owner: Readonly<SubstrateFederatedCopiedNonMiningErgoNodePairV1Input> = selection.ownerInput;
    const base = join(input.buildParentDirectory, f.root.recoveryEvidence.buildDirectoryName, 'target',
      f.root.recoveryEvidence.directoryName, 'ergo');
    expect(owner).toEqual({ primaryRoot: join(base, 'primary'), witnessRoot: join(base, 'witness'),
      capturedManifestSha256Hex: f.aggregate.components.ergo.sha256Hex,
      assertSourcesQuiescent: f.guard, expectedSnapshot: f.root.secondCycle.confirmationExecution.finalSnapshot });
    expect(Object.keys(owner).sort()).toEqual(['assertSourcesQuiescent', 'capturedManifestSha256Hex',
      'expectedSnapshot', 'primaryRoot', 'witnessRoot']);
    expect(selection).toMatchObject({ rootRawSha256Hex: hash(input.rootResultText),
      aggregateManifestSha256Hex: hash(input.captureManifestText),
      legacyProjectedReceiptDigestHex: projectSubstrateFederatedNativeTwoCycleResultV1(f.root).receiptDigestHex,
      successAuthenticated: false, recoveryAdmitted: false, nodeConsistencyEstablished: false,
      executionAuthorityRestored: false });
    expect(Object.isFrozen(selection)).toBe(true); expect(Object.isFrozen(owner)).toBe(true);
    expect(Object.isFrozen(owner.expectedSnapshot)).toBe(true); expect(f.guard).not.toHaveBeenCalled();
    f.root.secondCycle.confirmationExecution.finalSnapshot.fullHeight++;
    expect(owner.expectedSnapshot.fullHeight).toBe(220);
  });

  it('binds raw whitespace and recovery pointer changes that the legacy projection does not bind', () => {
    const f = fixture(); const firstInput = f.input();
    const first = prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1(firstInput);
    expect(() => prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1({ ...firstInput,
      rootResultText: `${firstInput.rootResultText} ` })).toThrow(/raw SHA256/);
    f.root.recoveryEvidence.directoryName = 'two-cycle-recovery-Zz9876';
    const second = prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1(f.input());
    expect(second.rootRawSha256Hex).not.toBe(first.rootRawSha256Hex);
    expect(second.legacyProjectedReceiptDigestHex).toBe(first.legacyProjectedReceiptDigestHex);
    expect(second.ownerInput.primaryRoot).not.toBe(first.ownerInput.primaryRoot);
  });

  it.each(['projected-receipt', 'legacy-root', 'uppercase', 'short'] as const)('rejects selected raw pin %s', fault => {
    const f = fixture(); const input = f.input(); const projected = projectSubstrateFederatedNativeTwoCycleResultV1(f.root);
    const pin = fault === 'projected-receipt' ? projected.receiptDigestHex : fault === 'legacy-root'
      ? projected.rootResultDigestHex : fault === 'uppercase' ? 'AB'.repeat(32) : 'a'.repeat(63);
    expect(() => prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1({ ...input, expectedRootResultSha256Hex: pin })).toThrow();
  });

  it('rejects a projected-only result even when its own raw bytes have the selected SHA', () => {
    const f = fixture(); const input = f.input();
    const text = JSON.stringify(projectSubstrateFederatedNativeTwoCycleResultV1(f.root));
    expect(() => prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1({ ...input,
      rootResultText: text, expectedRootResultSha256Hex: hash(text) })).toThrow(/recovery evidence/);
  });

  const rootFaults: ReadonlyArray<readonly [string, (f: Fixture) => void]> = [
    ['one-cycle', f => { Object.assign(f.root, { completedCycles: 1 }); }],
    ['status', f => { f.root.status = 'failed'; }],
    ['payout-success', f => { f.root.canonicalPayoutEstablished = false; }],
    ['conservation', f => { f.root.secondCycle.mint.amountNanoErg = '1'; }],
    ['repeated-transaction', f => { f.root.secondCycle.pegIn.sourceLockTransactionIdHex = f.root.pegIn.sourceLockTransactionIdHex; }],
    ['build-locator', f => { f.root.recoveryEvidence.buildDirectoryName = '../bridge-fed-genesis-Ab3D4e'; }],
    ['capture-locator', f => { f.root.recoveryEvidence.directoryName += '\n'; }],
    ['extra-pointer', f => { Object.assign(f.root.recoveryEvidence, { extra: true }); }],
    ['snapshot-network', f => { f.root.secondCycle.confirmationExecution.finalSnapshot.network = 'mainnet'; }],
    ['snapshot-index', f => { f.root.secondCycle.confirmationExecution.finalSnapshot.indexedHeight--; }],
    ['snapshot-zero', f => { Object.assign(f.root.secondCycle.confirmationExecution.finalSnapshot, { fullHeight: 0, indexedHeight: 0 }); }],
    ['snapshot-overflow', f => { Object.assign(f.root.secondCycle.confirmationExecution.finalSnapshot,
      { fullHeight: 2_147_483_648, indexedHeight: 2_147_483_648 }); }],
    ['snapshot-fraction', f => { Object.assign(f.root.secondCycle.confirmationExecution.finalSnapshot, { fullHeight: 1.5, indexedHeight: 1.5 }); }],
    ['snapshot-header', f => { f.root.secondCycle.confirmationExecution.finalSnapshot.headerIdHex = 'AB'.repeat(32); }],
    ['snapshot-extra', f => { Object.assign(f.root.secondCycle.confirmationExecution.finalSnapshot, { extra: true }); }],
    ['snapshot-missing', f => { Reflect.deleteProperty(f.root.secondCycle.confirmationExecution.finalSnapshot, 'headerIdHex'); }],
  ];
  it.each(rootFaults)('rejects root %s after re-pinning its exact raw bytes', (_name, mutate) => {
    const f = fixture(); mutate(f);
    expect(() => prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1(f.input())).toThrow();
    expect(f.guard).not.toHaveBeenCalled();
  });

  const captureFaults: ReadonlyArray<readonly [string, (f: Fixture) => void]> = [
    ['schema', f => { f.aggregate.schema = 'other'; }],
    ['kind', f => { f.aggregate.kind = 'sqlite-evidence-only'; }],
    ['extra', f => { Object.assign(f.aggregate, { extra: true }); }],
    ['missing', f => { Reflect.deleteProperty(f.aggregate, 'summary'); }],
    ['consistency', f => { f.aggregate.nodeConsistencyEstablished = true; }],
    ['restart', f => { f.aggregate.freshRestartValidated = true; }],
    ['authority', f => { f.aggregate.executionAuthorityRestored = true; }],
    ['component-role', f => { f.aggregate.components.ergo = { ...f.aggregate.components.frontier }; }],
    ['component-extra', f => { Object.assign(f.aggregate.components, { extra: {} }); }],
    ['component-missing', f => { Reflect.deleteProperty(f.aggregate.components, 'sqlite'); }],
    ['file-path', f => { f.aggregate.components.ergo.file = 'ergo/../manifest.json'; }],
    ['file-extra', f => { Object.assign(f.aggregate.components.ergo, { extra: 1 }); }],
    ['file-zero', f => { f.aggregate.components.ergo.bytes = 0; }],
    ['file-bound', f => { f.aggregate.components.ergo.bytes = 16 * 1024 * 1024 + 1; }],
    ['file-type', f => { Object.assign(f.aggregate.components.ergo, { bytes: '1200' }); }],
    ['file-hash', f => { f.aggregate.components.ergo.sha256Hex = 'AA'.repeat(32); }],
    ['file-hash-LF', f => { f.aggregate.components.ergo.sha256Hex += '\n'; }],
    ['summary-extra', f => { Object.assign(f.aggregate.summary, { extra: false }); }],
    ['summary-zero', f => { f.aggregate.summary.ergoFiles = 0; }],
    ['summary-bound', f => { f.aggregate.summary.frontierFiles = 100_001; }],
    ['summary-node-bytes', f => { f.aggregate.summary.nodeDatabaseBytes = -1; }],
    ['summary-sqlite-bytes', f => { f.aggregate.summary.sqliteDatabaseBytes = 1024 ** 3 + 1; }],
    ['summary-attempts', f => { f.aggregate.summary.trackerAdmissionAttempts = 1; }],
  ];
  it.each(captureFaults)('rejects aggregate %s with both digests independently recomputed', (_name, mutate) => {
    const f = fixture(); mutate(f);
    expect(() => prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1(f.input())).toThrow();
  });

  it('refuses aggregate whitespace drift without accepting its unchanged pointer pin', () => {
    const f = fixture(); const input = f.input();
    expect(() => prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1({ ...input,
      captureManifestText: `${input.captureManifestText} ` })).toThrow(/aggregate manifest SHA256/);
  });

  it.each(['ergo', 'frontier', 'sqlite'] as const)('enforces source-supported %s component byte boundary', role => {
    const f = fixture(); const maximum = (role === 'ergo' ? 16 : 64) * 1024 * 1024;
    f.aggregate.components[role].bytes = maximum;
    expect(() => prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1(f.input())).not.toThrow();
    f.aggregate.components[role].bytes = maximum + 1;
    expect(() => prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1(f.input())).toThrow(/component bytes bound/);
  });

  it.each(['root-duplicate', 'capture-duplicate', 'root-depth', 'capture-depth', 'root-size',
    'capture-size', 'root-utf8-size', 'root-surrogate', 'root-bom'] as const)('refuses bounded strict JSON %s', fault => {
    const f = fixture(); const input = { ...f.input() };
    if (fault === 'root-duplicate') input.rootResultText = input.rootResultText.replace('{', '{"completedCycles":2,');
    if (fault === 'capture-duplicate') input.captureManifestText = input.captureManifestText.replace('{', '{"kind":"stopped-node-copy-and-sqlite-evidence",');
    if (fault === 'root-depth') input.rootResultText = '['.repeat(65) + '0' + ']'.repeat(65);
    if (fault === 'capture-depth') input.captureManifestText = '['.repeat(65) + '0' + ']'.repeat(65);
    if (fault === 'root-size') input.rootResultText = ' '.repeat(2 * 1024 * 1024 + 1);
    if (fault === 'capture-size') input.captureManifestText = ' '.repeat(16 * 1024 + 1);
    if (fault === 'root-utf8-size') input.rootResultText = 'é'.repeat(1024 * 1024 + 1);
    if (fault === 'root-surrogate') input.rootResultText += '\ud800';
    if (fault === 'root-bom') input.rootResultText = '\ufeff' + input.rootResultText;
    if (fault.startsWith('capture')) {
      const root = JSON.parse(input.rootResultText); root.recoveryEvidence.manifestSha256Hex = hash(input.captureManifestText);
      input.rootResultText = JSON.stringify(root);
    }
    input.expectedRootResultSha256Hex = hash(input.rootResultText);
    expect(() => prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1(input)).toThrow();
  });

  it.each(['relative', '//server/share/build', `\\\\?\\${syntheticWindowsBuild.replaceAll('/', '\\')}`,
    'C:build', `${syntheticWindowsBuild}/../other`, `${syntheticWindowsBuild}:stream`,
    `${syntheticWindowsBuild}\0`, `${syntheticWindowsBuild}/CON`, `${syntheticWindowsBuild}/trailing.`,
    `${syntheticWindowsBuild}//other`])('rejects lexical parent %s', path => {
    const f = fixture(); expect(() => prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1({ ...f.input(),
      buildParentDirectory: path })).toThrow(/build parent/);
  });

  it.each(['proxy', 'accessor', 'prototype', 'extra', 'symbol', 'nonenumerable', 'callback-proxy', 'callback-missing'] as const)(
    'rejects hostile or inexact input %s without invoking its hooks', fault => {
      const f = fixture(); let value: unknown = { ...f.input() }; const trap = vi.fn();
      if (fault === 'proxy') value = new Proxy(value as object, { get: trap, ownKeys: () => { trap(); return []; } });
      if (fault === 'accessor') Object.defineProperty(value, 'rootResultText', { get: trap });
      if (fault === 'prototype') Object.setPrototypeOf(value, { inherited: true });
      if (fault === 'extra') Object.assign(value as object, { extra: true });
      if (fault === 'symbol') Object.assign(value as object, { [Symbol('extra')]: true });
      if (fault === 'nonenumerable') Object.defineProperty(value, 'rootResultText', { enumerable: false });
      if (fault === 'callback-proxy') Object.assign(value as object, { assertSourcesQuiescent: new Proxy(f.guard, { apply: trap }) });
      if (fault === 'callback-missing') Object.assign(value as object, { assertSourcesQuiescent: undefined });
      expect(() => prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1(value as SubstrateFederatedTwoCycleCopiedErgoSelectionV1Input)).toThrow();
      expect(trap).not.toHaveBeenCalled(); expect(f.guard).not.toHaveBeenCalled();
    });
});
