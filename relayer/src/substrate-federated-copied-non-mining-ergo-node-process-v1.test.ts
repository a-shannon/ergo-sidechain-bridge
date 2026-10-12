import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({ spawn: vi.fn(), spawnSync: vi.fn() }));
vi.mock('node:child_process', async original => ({
  ...await original<typeof import('node:child_process')>(),
  spawn: boundary.spawn, spawnSync: boundary.spawnSync,
}));

import {
  withSubstrateFederatedCopiedNonMiningErgoNodePairV1,
  assertSubstrateFederatedIsolatedDevnetOwnedReadOnlyTargetV1 as assertReadOnly,
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1 as assertExecution,
  assertSubstrateFederatedIsolatedDevnetOwnedCheckpointTargetV1 as assertCheckpoint,
  assertSubstrateFederatedIsolatedDevnetOwnedTrackerTransportTargetV1 as assertTracker,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_ACTION_COMPLETION_BUDGET_MS_V1 as budget,
  type SubstrateFederatedCopiedNonMiningErgoObservationLeaseV1 as Lease,
  type SubstrateFederatedCopiedNonMiningErgoNodePairV1Input as CopyInput,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import { copySubstrateFederatedTwoCycleNodeStateV1 as copy } from './substrate-federated-two-cycle-node-state-copy-v1.js';
import { deriveDevnetRewardErgoTreeHexForDelay } from './relayer-core/devnet-reward-consolidation.js';
import { prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1 } from './substrate-federated-two-cycle-copied-ergo-selection-v1.js';
import { extendedRootResult } from './test-support/substrate-federated-native-two-cycle-root-result.js';

class FakeChild extends EventEmitter {
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  stdout = { resume: vi.fn() };
  stderr = { resume: vi.fn() };
  constructor(readonly pid: number) { super(); }
  close(): void { this.exitCode = 0; this.emit('close', 0, null); }
  kill(signal: NodeJS.Signals): boolean { this.signalCode = signal; this.emit('close', null, signal); return true; }
}

const fixtures: string[] = [];
beforeEach(() => { boundary.spawn.mockReset(); boundary.spawnSync.mockReset(); });
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs();
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function fixture(initialHeight = 20) {
  const root = realpathSync.native(mkdtempSync(join(realpathSync.native(tmpdir()), 'copied-ergo-owner-test-')));
  fixtures.push(root);
  vi.stubEnv('TEMP', root); vi.stubEnv('TMP', root);
  const source = join(root, 'source');
  for (const role of ['primary', 'witness']) for (const tree of ['state', 'history']) {
    mkdirSync(join(source, role, tree), { recursive: true });
    writeFileSync(join(source, role, tree, 'synthetic.bin'), `${role}:${tree}:synthetic`);
  }
  const captured = join(root, 'captured');
  await copy({ kind: 'ergo', primaryRoot: join(source, 'primary'), witnessRoot: join(source, 'witness'),
    destinationDirectory: captured, assertSourcesQuiescent: () => undefined });
  const manifest = join(captured, 'manifest.json');
  const java = join(root, 'java.exe'); const jar = join(root, 'node.jar');
  writeFileSync(java, 'synthetic java bytes, never executed'); writeFileSync(jar, 'synthetic jar, never loaded');
  const processInput = { javaExecutablePath: java, expectedJavaExecutableSha256Hex: sha(readFileSync(java)),
    nodeAssemblyJarPath: jar, expectedNodeAssemblyJarSha256Hex: sha(readFileSync(jar)),
    buildIdentityDigestHex: '12'.repeat(32) };
  const key = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
  const binding = { miningTargetPublicKeyHex: key, p2pkErgoTreeHex: `0008cd${key}`,
    rewardInputErgoTrees: { delay1: deriveDevnetRewardErgoTreeHexForDelay(key, 1), delay720: deriveDevnetRewardErgoTreeHexForDelay(key, 720) },
    networkPrefix: 16 as const, primaryNodeOrigin: 'http://127.0.0.1:9051' as const,
    witnessNodeOrigin: 'http://127.0.0.1:9052' as const };
  const expected = { network: 'devnet' as const, fullHeight: initialHeight, indexedHeight: initialHeight, headerIdHex: '23'.repeat(32) };
  const input: CopyInput = { primaryRoot: join(captured, 'primary'), witnessRoot: join(captured, 'witness'),
    capturedManifestSha256Hex: sha(readFileSync(manifest)), expectedSnapshot: expected,
    assertSourcesQuiescent: vi.fn() };
  const children: FakeChild[] = [];
  const events: string[] = [];
  const live = () => children.filter(child => child.exitCode === null && child.signalCode === null);
  const listeners = () => live().flatMap(child => (child.pid === 41001 ? [9051, 9021] : [9052, 9022])
    .map(LocalPort => ({ LocalAddress: '127.0.0.1', LocalPort, OwningProcess: child.pid })));
  let runtime = '';
  boundary.spawn.mockImplementation((_exe: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => {
    const config = args[args.indexOf('--config') + 1]!;
    expect(config).toMatch(/(?:primary|witness)-non-mining\.conf$/);
    expect(readFileSync(config, 'utf8')).toContain('mining = false');
    expect(readFileSync(config, 'utf8')).not.toMatch(/testMnemonic|testKeysQty/);
    expect(Object.keys(options.env).some(name => /MNEMONIC|OWNED_MINING|MAXIMUM_MINING|REQUIRED_MINING/.test(name))).toBe(false);
    runtime = options.cwd;
    const child = new FakeChild(config.endsWith('primary-non-mining.conf') ? 41001 : 41002);
    children.push(child); events.push(`spawn:${child.pid}`); return child;
  });
  boundary.spawnSync.mockImplementation((_exe: string, args: string[]) => {
    const command = args.at(-1)!;
    const result = { status: 0, signal: null, error: undefined, stderr: '', stdout: '' };
    if (command.includes('Get-Process -Id')) return { ...result, stdout: java };
    if (command.includes('-LocalPort') || command.includes('-OwningProcess')) {
      return { ...result, stdout: JSON.stringify(listeners()) };
    }
    throw new Error('unexpected synthetic process metadata call');
  });
  const http = vi.fn(async (urlValue: string | URL, init?: RequestInit) => {
    const url = new URL(String(urlValue));
    const child = live().find(value => value.pid === (url.port === '9051' ? 41001 : 41002));
    if (!child) throw new Error('request without synthetic owned child');
    if (url.pathname === '/node/shutdown') {
      expect(init?.method).toBe('POST'); events.push(`stop:${child.pid}`); child.close();
      return new Response('', { status: 200 });
    }
    expect(init?.method).toBe('GET');
    const data = url.pathname === '/info' ? { network: 'devnet', fullHeight: expected.fullHeight }
      : url.pathname === '/blocks/lastHeaders/1' ? [{ id: expected.headerIdHex, height: expected.fullHeight }]
      : url.pathname === '/blockchain/indexedHeight' ? { fullHeight: expected.fullHeight, indexedHeight: expected.indexedHeight } : undefined;
    if (!data) throw new Error('unexpected synthetic HTTP path');
    return new Response(JSON.stringify(data));
  });
  vi.stubGlobal('fetch', http);
  return { root, captured, manifest, java, jar, processInput, binding, expected, input, children, events, http,
    runtime: () => runtime, live,
    run: <T>(action: (lease: Readonly<Lease>) => Promise<T>, override: CopyInput = input) =>
      withSubstrateFederatedCopiedNonMiningErgoNodePairV1(processInput, binding, override, action) };
}

describe('copied non-mining Ergo owner with synthetic process boundaries', () => {
  it('consumes a separately selected successful-root capture with the exact Ergo pin and expected tip', async () => {
    const f = await fixture(220);
    const root = extendedRootResult();
    const captureRoot = join(f.root, root.recoveryEvidence.buildDirectoryName, 'target',
      root.recoveryEvidence.directoryName);
    mkdirSync(captureRoot, { recursive: true });
    const ergoRoot = join(captureRoot, 'ergo');
    const copied = await copy({ kind: 'ergo', primaryRoot: f.input.primaryRoot,
      witnessRoot: f.input.witnessRoot, capturedManifestSha256Hex: f.input.capturedManifestSha256Hex,
      destinationDirectory: ergoRoot, assertSourcesQuiescent: f.input.assertSourcesQuiescent });
    const manifestText = JSON.stringify({
      schema: 'e2s.substrate-federated-two-cycle-recovery-capture.v1',
      kind: 'stopped-node-copy-and-sqlite-evidence',
      components: {
        ergo: { file: 'ergo/manifest.json', bytes: readFileSync(join(ergoRoot, 'manifest.json')).length,
          sha256Hex: sha(readFileSync(join(ergoRoot, 'manifest.json'))) },
        frontier: { file: 'frontier/manifest.json', bytes: 1, sha256Hex: '34'.repeat(32) },
        sqlite: { file: 'sqlite/manifest.json', bytes: 1, sha256Hex: '45'.repeat(32) },
      },
      summary: { ergoFiles: copied.files.length, frontierFiles: 1,
        nodeDatabaseBytes: copied.totalBytes + 1, sqliteDatabaseBytes: 1, trackerAdmissionAttempts: 2 },
      nodeConsistencyEstablished: false, freshRestartValidated: false, executionAuthorityRestored: false,
    });
    root.recoveryEvidence.manifestSha256Hex = sha(manifestText);
    Object.assign(root.secondCycle.confirmationExecution, { finalSnapshot: f.expected });
    const rootText = JSON.stringify(root);
    const selection = prepareSubstrateFederatedTwoCycleCopiedErgoSelectionV1({
      rootResultText: rootText, expectedRootResultSha256Hex: sha(rootText), captureManifestText: manifestText,
      buildParentDirectory: f.root, assertSourcesQuiescent: f.input.assertSourcesQuiescent,
    });
    expect(selection.ownerInput.capturedManifestSha256Hex).not.toBe(selection.aggregateManifestSha256Hex);
    const observed = await f.run(async lease => {
      expect(await lease.readExactSnapshots()).toEqual({ primary: f.expected, witness: f.expected });
      return 'selected synthetic tip';
    }, selection.ownerInput);
    expect(observed.value).toBe('selected synthetic tip');
    expect(observed.finalSnapshot).toEqual(f.expected);
    expect(f.live()).toHaveLength(0);
    expect(selection.successAuthenticated).toBe(false);
    expect(selection.recoveryAdmitted).toBe(false);
  });

  it('copies before launch, observes exactly, revokes its lease and stops both peers without deleting copies', async () => {
    const f = await fixture();
    const sourceBytes = readFileSync(f.manifest);
    let lease!: Readonly<Lease>;
    const result = await f.run(async value => {
      lease = value;
      expect(Object.keys(value).sort()).toEqual(['expectedSnapshot', 'readExactSnapshots']);
      expect(Object.isFrozen(value)).toBe(true);
      expect(await value.readExactSnapshots()).toEqual({ primary: f.expected, witness: f.expected });
      for (const guard of [assertReadOnly, assertExecution, assertCheckpoint, assertTracker]) {
        expect(() => guard(value as never)).toThrow();
      }
      return 'observed';
    });
    expect(result).toMatchObject({ value: 'observed', finalSnapshot: f.expected,
      capturedManifestSha256Hex: f.input.capturedManifestSha256Hex,
      nodeConsistencyEstablished: false, executionAuthorityRestored: false });
    expect(f.events).toEqual(['spawn:41001', 'spawn:41002', 'stop:41002', 'stop:41001']);
    expect(f.live()).toHaveLength(0);
    expect(readdirSync(result.runtimeDirectory).sort()).toEqual(['copied-state', 'logback.xml',
      'primary-jvm-temp', 'primary-non-mining.conf', 'witness-jvm-temp', 'witness-non-mining.conf']);
    expect(readFileSync(f.manifest)).toEqual(sourceBytes);
    const before = f.http.mock.calls.length;
    await expect(lease.readExactSnapshots()).rejects.toThrow(/revoked/);
    expect(f.http).toHaveBeenCalledTimes(before);
    expect(existsSync(result.runtimeDirectory)).toBe(true);
  });

  it.each(['network', 'index', 'zero', 'overflow', 'fraction', 'header', 'extra', 'accessor', 'proxy'] as const)(
    'refuses expected snapshot %s before any owned directory or process metadata call', async fault => {
      const f = await fixture();
      const snapshot: Record<string, unknown> = { ...f.expected };
      if (fault === 'network') snapshot.network = 'mainnet';
      if (fault === 'index') snapshot.indexedHeight = 19;
      if (fault === 'zero') snapshot.fullHeight = snapshot.indexedHeight = 0;
      if (fault === 'overflow') snapshot.fullHeight = snapshot.indexedHeight = 2_147_483_648;
      if (fault === 'fraction') snapshot.fullHeight = snapshot.indexedHeight = 20.5;
      if (fault === 'header') snapshot.headerIdHex = '23';
      if (fault === 'extra') snapshot.extra = false;
      const getter = vi.fn(() => 20);
      if (fault === 'accessor') Object.defineProperty(snapshot, 'fullHeight', { get: getter });
      const proxyGet = vi.fn();
      const value = fault === 'proxy' ? new Proxy(snapshot, { get: proxyGet }) : snapshot;
      const before = readdirSync(f.root);
      await expect(f.run(async () => undefined, { ...f.input, expectedSnapshot: value } as unknown as CopyInput)).rejects.toThrow();
      expect(getter).not.toHaveBeenCalled(); expect(proxyGet).not.toHaveBeenCalled();
      expect(readdirSync(f.root)).toEqual(before);
      expect(boundary.spawn).not.toHaveBeenCalled(); expect(boundary.spawnSync).not.toHaveBeenCalled();
    });

  it.each(['capture-byte', 'manifest-pin', 'jar-pin', 'port-owned'] as const)(
    'refuses %s with zero spawn', async fault => {
      const f = await fixture();
      if (fault === 'capture-byte') writeFileSync(join(f.input.primaryRoot, 'state', 'synthetic.bin'), 'changed');
      if (fault === 'manifest-pin') writeFileSync(f.manifest, `${readFileSync(f.manifest, 'utf8')} `);
      if (fault === 'jar-pin') writeFileSync(f.jar, 'changed');
      if (fault === 'port-owned') boundary.spawnSync.mockReturnValue({ status: 0, signal: null, error: undefined, stderr: '',
        stdout: JSON.stringify([{ LocalAddress: '127.0.0.1', LocalPort: 9051, OwningProcess: 999 }]) });
      const action = vi.fn();
      await expect(f.run(action)).rejects.toThrow();
      expect(action).not.toHaveBeenCalled(); expect(boundary.spawn).not.toHaveBeenCalled();
    });

  it.each(['source-manifest', 'output-byte', 'output-extra', 'config-byte', 'jar-byte'] as const)(
    'rechecks %s immediately before the first launch', async fault => {
      const f = await fixture();
      let calls = 0;
      await expect(f.run(async () => undefined, { ...f.input, assertSourcesQuiescent: () => {
        if (++calls !== 3) return;
        const runtime = join(f.root, readdirSync(f.root).find(name => name.startsWith('e2s-fed6g1di3b-ergo-'))!);
        if (fault === 'source-manifest') writeFileSync(f.manifest, `${readFileSync(f.manifest, 'utf8')} `);
        if (fault === 'output-byte') writeFileSync(join(runtime, 'copied-state', 'primary', 'state', 'synthetic.bin'), 'changed');
        if (fault === 'output-extra') writeFileSync(join(runtime, 'copied-state', 'primary', 'config.json'), '{}');
        if (fault === 'config-byte') writeFileSync(join(runtime, 'primary-non-mining.conf'), 'changed');
        if (fault === 'jar-byte') writeFileSync(f.jar, 'changed');
      } })).rejects.toThrow();
      expect(calls).toBe(3); expect(boundary.spawn).not.toHaveBeenCalled();
    });

  it.each([1, 2])('stops every already owned peer when startup %s fails', async at => {
    const f = await fixture();
    const ordinary = boundary.spawn.getMockImplementation()!;
    let calls = 0;
    const failure = new Error('synthetic startup refusal');
    boundary.spawn.mockImplementation((...args) => { if (++calls === at) throw failure; return ordinary(...args); });
    await expect(f.run(async () => undefined)).rejects.toBe(failure);
    expect(f.children).toHaveLength(at - 1); expect(f.live()).toHaveLength(0);
    expect(f.children.every(child => child.signalCode === 'SIGKILL')).toBe(true);
  });

  it('joins an unfinished callback and rejects its exact failure before stopping peers', async () => {
    const f = await fixture();
    const entered = deferred<void>(); const completion = deferred<void>();
    const failure = new Error('synthetic callback failure');
    const operation = f.run(async () => { entered.resolve(); await completion.promise; throw failure; });
    const refusal = expect(operation).rejects.toBe(failure);
    await entered.promise; expect(f.live()).toHaveLength(2); expect(f.events).toHaveLength(2);
    completion.resolve(); await refusal;
    expect(f.live()).toHaveLength(0);
  });

  it('joins callback completion before rejecting an unchanged completion-budget overrun', async () => {
    const f = await fixture(); const entered = deferred<void>(); const completion = deferred<void>();
    const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_000 + budget + 1);
    const operation = f.run(async () => { entered.resolve(); await completion.promise; return 'late'; });
    const refusal = expect(operation).rejects.toThrow(/completion budget/);
    await entered.promise; expect(f.live()).toHaveLength(2);
    completion.resolve(); await refusal; expect(clock).toHaveBeenCalledTimes(2);
    expect(f.live()).toHaveLength(0);
  });

  it('drains an ignored failing lease read and its delayed sibling before stop', async () => {
    const f = await fixture(); const delayed = deferred<Response>(); const entered = deferred<void>();
    const failure = new Error('synthetic first response failure');
    const ordinary = f.http.getMockImplementation()!;
    let lease!: Readonly<Lease>;
    const operation = f.run(async value => {
      lease = value;
      f.http.mockImplementation((url, init) => {
        const parsed = new URL(String(url));
        if (parsed.port === '9051' && parsed.pathname === '/info') return Promise.reject(failure);
        if (parsed.port === '9052' && parsed.pathname === '/blocks/lastHeaders/1') return delayed.promise;
        return ordinary(url, init);
      });
      void value.readExactSnapshots(); entered.resolve(); return 'ignored';
    });
    const refusal = expect(operation).rejects.toBe(failure);
    await entered.promise; await Promise.resolve();
    expect(f.live()).toHaveLength(2); expect(f.events).toHaveLength(2);
    delayed.resolve(new Response(JSON.stringify([{ id: f.expected.headerIdHex, height: 20 }])));
    await refusal; expect(f.live()).toHaveLength(0);
    await expect(lease.readExactSnapshots()).rejects.toThrow(/revoked/);
  });

  it('refuses a lease snapshot replacement and cannot hide it by catching the read', async () => {
    const f = await fixture(); const ordinary = f.http.getMockImplementation()!;
    await expect(f.run(async lease => {
      f.http.mockImplementation((url, init) => new URL(String(url)).pathname === '/blocks/lastHeaders/1'
        ? Promise.resolve(new Response(JSON.stringify([{ id: '45'.repeat(32), height: 20 }]))) : ordinary(url, init));
      await expect(lease.readExactSnapshots()).rejects.toThrow(/snapshot differs/);
      return 'caught';
    })).rejects.toThrow(/snapshot differs/);
    expect(f.live()).toHaveLength(0);
  });

  it.each(['image', 'listener', 'config', 'jar', 'snapshot'] as const)(
    'rechecks %s after the callback before returning observation success', async fault => {
      const f = await fixture();
      const metadata = boundary.spawnSync.getMockImplementation()!;
      const http = f.http.getMockImplementation()!;
      await expect(f.run(async () => {
        if (fault === 'image') {
          const other = join(f.root, 'same-bytes-other-image.exe'); writeFileSync(other, readFileSync(f.java));
          boundary.spawnSync.mockImplementation((exe, args: string[]) => {
            const result = metadata(exe, args);
            return args.at(-1)!.includes('Get-Process -Id') ? { ...result, stdout: other } : result;
          });
        }
        if (fault === 'listener') boundary.spawnSync.mockImplementation((exe, args: string[]) => {
          const result = metadata(exe, args);
          if (!args.at(-1)!.includes('-OwningProcess')) return result;
          const rows = JSON.parse(result.stdout) as { LocalAddress: string }[];
          rows[0]!.LocalAddress = '0.0.0.0'; return { ...result, stdout: JSON.stringify(rows) };
        });
        if (fault === 'config') writeFileSync(join(f.runtime(), 'primary-non-mining.conf'), 'changed');
        if (fault === 'jar') writeFileSync(f.jar, 'changed');
        if (fault === 'snapshot') {
          let primaryReads = 0;
          f.http.mockImplementation((url, init) => {
            const parsed = new URL(String(url));
            if (parsed.port === '9051' && parsed.pathname === '/blocks/lastHeaders/1' && ++primaryReads === 2) {
              return Promise.resolve(new Response(JSON.stringify([{ id: '45'.repeat(32), height: 20 }])));
            }
            return http(url, init);
          });
        }
        return 'callback complete';
      })).rejects.toThrow(fault === 'image' ? /image differs/ : fault === 'listener' ? /listener/
        : fault === 'snapshot' ? /snapshot differs/ : /changed/);
      expect(f.children).toHaveLength(2); expect(f.live()).toHaveLength(0);
      expect(existsSync(f.runtime())).toBe(true);
    });

  it.each([41001, 41002])('stops both available peers when readiness fails for child %s', async pid => {
    const f = await fixture(); const http = f.http.getMockImplementation()!;
    let injected = false;
    f.http.mockImplementation((url, init) => {
      const parsed = new URL(String(url));
      if (!injected && parsed.pathname === '/info' && parsed.port === (pid === 41001 ? '9051' : '9052')) {
        injected = true; f.children.find(child => child.pid === pid)!.close();
        return Promise.reject(new Error('synthetic readiness refusal'));
      }
      return http(url, init);
    });
    const action = vi.fn();
    await expect(f.run(action)).rejects.toThrow(/process exited/);
    expect(action).not.toHaveBeenCalled(); expect(f.live()).toHaveLength(0);
    expect(f.children).toHaveLength(pid === 41001 ? 1 : 2);
  });

  it('freezes input values and callbacks before the first asynchronous quiescence boundary', async () => {
    const f = await fixture();
    const originalPin = f.input.capturedManifestSha256Hex;
    const expected = { ...f.expected };
    const replacement = vi.fn(() => { throw new Error('replacement callback must not run'); });
    const input = { ...f.input, expectedSnapshot: expected, assertSourcesQuiescent: () => {
      Object.assign(input, { primaryRoot: 'replaced', capturedManifestSha256Hex: '0'.repeat(64),
        assertSourcesQuiescent: replacement });
      Object.assign(expected, { fullHeight: 21, indexedHeight: 21 });
      Object.assign(f.processInput, { nodeAssemblyJarPath: 'replaced' });
      Object.assign(f.binding, { primaryNodeOrigin: 'http://192.0.2.1:9051' });
    } };
    const result = await f.run(async lease => {
      expect(lease.expectedSnapshot).toEqual(f.expected);
      return 'frozen';
    }, input);
    expect(replacement).not.toHaveBeenCalled();
    expect(result.capturedManifestSha256Hex).toBe(originalPin);
    expect(result.finalSnapshot).toEqual(f.expected);
  });

  it('holds the owned lifetime when final port release cannot be established', async () => {
    const f = await fixture(); const finalInspection = deferred<void>();
    const metadata = boundary.spawnSync.getMockImplementation()!;
    const interval = vi.spyOn(globalThis, 'setInterval');
    boundary.spawnSync.mockImplementation((exe, args: string[]) => {
      if (args.at(-1)!.includes('-LocalPort') && f.children.length === 2 && f.live().length === 0) {
        finalInspection.resolve();
        return { status: 0, signal: null, error: undefined, stderr: '', stdout: JSON.stringify([
          { LocalAddress: '127.0.0.1', LocalPort: 9051, OwningProcess: 999 },
        ]) };
      }
      return metadata(exe, args);
    });
    let released = false;
    let lease!: Readonly<Lease>;
    const operation = f.run(async value => { lease = value; return 'observed'; });
    void operation.then(() => { released = true; }, () => { released = true; });
    try {
      await finalInspection.promise;
      await Promise.resolve();
      expect(f.live()).toHaveLength(0);
      expect(interval).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 60_000);
      expect(released).toBe(false);
      expect(existsSync(f.runtime())).toBe(true);
      await expect(lease.readExactSnapshots()).rejects.toThrow(/revoked/);
      expect(released).toBe(false);
    } finally {
      // Only this synthetic hold's timer is removed; the owner promise remains held.
      for (const result of interval.mock.results) if (result.type === 'return') clearInterval(result.value);
    }
  });
});
