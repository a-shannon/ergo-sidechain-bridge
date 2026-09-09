import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { appendFileSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({ spawnSync: vi.fn(), spawn: vi.fn() }));
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawnSync: boundary.spawnSync,
  spawn: boundary.spawn,
}));

import {
  observeSubstrateFederatedIsolatedDevnetWindowsProcessPairV1 as observe,
  createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1,
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1 as assertTarget,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import { deriveDevnetRewardErgoTreeHexForDelay } from './relayer-core/devnet-reward-consolidation.js';
import { issueSubstrateFederatedIsolatedDevnetMiningCredentialV1 } from './substrate-federated-isolated-devnet-mining-credential-v1.js';

const PRIMARY = 41_001;
const WITNESS = 41_002;
const images = () => [
  { Id: WITNESS, Path: process.execPath },
  { Id: PRIMARY, Path: process.execPath },
];
const listeners = () => [
  { LocalAddress: '127.0.0.1', LocalPort: 9051, OwningProcess: PRIMARY },
  { LocalAddress: '127.0.0.1', LocalPort: 9021, OwningProcess: PRIMARY },
  { LocalAddress: '127.0.0.1', LocalPort: 9052, OwningProcess: WITNESS },
  { LocalAddress: '127.0.0.1', LocalPort: 9022, OwningProcess: WITNESS },
];
const result = (value: unknown) => ({
  status: 0, signal: null, error: undefined, stderr: '', stdout: JSON.stringify(value),
});

beforeEach(() => boundary.spawnSync.mockReset().mockReturnValue(result({ images: images(), listeners: listeners() })));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.skipIf(process.platform !== 'win32')('fresh Windows process-pair observation', () => {
  it('maps both exact PIDs and all listener rows with one bounded invocation', () => {
    const observed = observe(PRIMARY, WITNESS);
    expect(observed.primaryExecutablePath).toBe(realpathSync(process.execPath));
    expect(observed.witnessExecutablePath).toBe(realpathSync(process.execPath));
    expect(observed.listeners).toEqual(listeners().map(row => ({
      pid: row.OwningProcess, localAddress: row.LocalAddress, localPort: row.LocalPort,
    })));
    expect(Object.isFrozen(observed)).toBe(true);
    expect(Object.isFrozen(observed.listeners)).toBe(true);
    expect(observed.listeners.every(Object.isFrozen)).toBe(true);
    expect(boundary.spawnSync).toHaveBeenCalledTimes(1);
    const [executable, args, options] = boundary.spawnSync.mock.calls[0]!;
    expect(executable).toBe(join(process.env.SystemRoot!, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'));
    expect(args.slice(0, -1)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-Command']);
    expect(args.at(-1)).toContain('$pids=@(41001,41002)');
    expect(args.at(-1)).toContain('Get-Process -Id $pids -ErrorAction Stop');
    expect(args.at(-1)).toContain('Get-NetTCPConnection -State Listen -OwningProcess $pids -ErrorAction Stop');
    expect(args.at(-1)).not.toContain('-LocalPort');
    expect(options).toMatchObject({ encoding: 'utf8', timeout: 10_000, maxBuffer: 256 * 1024, windowsHide: true });
  });

  it('does not cache an observation across successive assertions', () => {
    observe(PRIMARY, WITNESS);
    boundary.spawnSync.mockReturnValueOnce(result({ images: images(), listeners: [] }));
    expect(observe(PRIMARY, WITNESS).listeners).toEqual([]);
    expect(boundary.spawnSync).toHaveBeenCalledTimes(2);
  });

  it('retains unexpected listener rows for the owner to reject instead of filtering them', () => {
    const extra = { LocalAddress: '0.0.0.0', LocalPort: 1234, OwningProcess: PRIMARY };
    boundary.spawnSync.mockReturnValueOnce(result({ images: images(), listeners: [...listeners(), extra] }));
    expect(observe(PRIMARY, WITNESS).listeners.at(-1)).toEqual({ pid: PRIMARY, localAddress: '0.0.0.0', localPort: 1234 });
  });

  it.each([
    [PRIMARY, PRIMARY], [0, WITNESS], [-1, WITNESS], [1.5, WITNESS],
    [NaN, WITNESS], [Infinity, WITNESS], [0x1_0000_0000, WITNESS],
    [PRIMARY, 0], [PRIMARY, -1], [PRIMARY, 1.5], [PRIMARY, NaN],
  ])('rejects invalid or identical PIDs (%s, %s) without spawning', (primary, witness) => {
    expect(() => observe(primary, witness)).toThrow('two distinct process IDs');
    expect(boundary.spawnSync).not.toHaveBeenCalled();
  });

  it.each([
    null, [], {}, { images: images() }, { images: [], listeners: [] },
    { images: images()[0], listeners: [] }, { images: images(), listeners: {} },
    { images: [images()[0]], listeners: [] },
    { images: [...images(), images()[0]], listeners: [] },
  ])('rejects a malformed complete observation %#', value => {
    boundary.spawnSync.mockReturnValueOnce(result(value));
    expect(() => observe(PRIMARY, WITNESS)).toThrow('output is malformed');
  });

  it.each([
    null, [], {}, { Id: WITNESS, Path: process.execPath },
    { Id: 42_000, Path: process.execPath }, { Id: String(PRIMARY), Path: process.execPath },
    { Id: PRIMARY, Path: '' }, { Id: PRIMARY, Path: '  ' }, { Id: PRIMARY, Path: 5 },
  ])('rejects a missing, duplicate, foreign or malformed image row %#', row => {
    boundary.spawnSync.mockReturnValueOnce(result({ images: [images()[0], row], listeners: listeners() }));
    expect(() => observe(PRIMARY, WITNESS)).toThrow('image row is malformed');
  });

  it('rejects an image path that is not a regular file', () => {
    boundary.spawnSync.mockReturnValueOnce(result({ images: [images()[0], { Id: PRIMARY, Path: import.meta.dirname }], listeners: listeners() }));
    expect(() => observe(PRIMARY, WITNESS)).toThrow(/file|regular/i);
  });

  it.each([
    null, [], {},
    { LocalAddress: 1, LocalPort: 9051, OwningProcess: PRIMARY },
    { LocalAddress: '127.0.0.1', LocalPort: '9051', OwningProcess: PRIMARY },
    { LocalAddress: '127.0.0.1', LocalPort: 0, OwningProcess: PRIMARY },
    { LocalAddress: '127.0.0.1', LocalPort: 65_536, OwningProcess: PRIMARY },
    { LocalAddress: '127.0.0.1', LocalPort: 1.5, OwningProcess: PRIMARY },
    { LocalAddress: '127.0.0.1', LocalPort: 9051, OwningProcess: 42_000 },
    { LocalAddress: '127.0.0.1', LocalPort: 9051, OwningProcess: String(PRIMARY) },
  ])('rejects a malformed or foreign listener row %#', row => {
    boundary.spawnSync.mockReturnValueOnce(result({ images: images(), listeners: [row] }));
    expect(() => observe(PRIMARY, WITNESS)).toThrow('listener row is malformed');
  });

  it.each([
    { error: new Error('timeout') }, { status: 1 }, { status: null },
    { signal: 'SIGTERM' }, { stderr: 'inspection error' },
  ])('fails closed on subprocess failure %#', overrides => {
    boundary.spawnSync.mockReturnValueOnce({ ...result({ images: images(), listeners: listeners() }), ...overrides });
    expect(() => observe(PRIMARY, WITNESS)).toThrow('inspection failed');
  });

  it.each(['', '{', 'undefined'])('rejects invalid JSON %s', stdout => {
    boundary.spawnSync.mockReturnValueOnce({ ...result({}), stdout });
    expect(() => observe(PRIMARY, WITNESS)).toThrow();
  });

  it('keeps liveness, exact executable/file checks and PID-wide listener policy in the consumer', () => {
    const source = readFileSync(join(import.meta.dirname, 'substrate-federated-isolated-devnet-ergo-node-process-v1.ts'), 'utf8');
    const begin = source.indexOf("throw new Error('isolated Ergo execution processes are not active')");
    const end = source.indexOf('OWNED_EXECUTION_TARGET_BINDINGS.set', begin);
    const block = source.slice(begin, end);
    expect(block).toContain('assertLive(primary);');
    expect(block).toContain('assertLive(witness);');
    expect(block).toContain('processId(primary), processId(witness)');
    expect(block).toContain('assertOwnedNodeIdentity(input, runtime, primary, observed.primaryExecutablePath);');
    expect(block).toContain('assertOwnedNodeIdentity(input, runtime, witness, observed.witnessExecutablePath);');
    expect(block).toContain('assertOwnedListenerBindings(primary, witness, observed.listeners);');
    expect(block).toContain('recheckRuntimeFiles(input, runtime);');
  });
});

class FakeChild extends EventEmitter {
  stdout = { resume() {} };
  stderr = { resume() {} };
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  constructor(readonly pid: number) { super(); }
  kill(signal: NodeJS.Signals = 'SIGTERM') {
    this.signalCode = signal;
    queueMicrotask(() => this.emit('close', null, signal));
    return true;
  }
  close() {
    this.exitCode = 0;
    queueMicrotask(() => this.emit('close', 0, null));
  }
}

describe.skipIf(process.platform !== 'win32')('combined observation in the retained execution owner', () => {
  it.each([
    'none', 'primary-image', 'witness-image', 'primary-exit', 'witness-exit',
    'java-bytes', 'jar-bytes', 'primary-config', 'witness-config', 'logback',
    'inactive-primary-config', 'inactive-witness-config',
    'missing-primary-rest', 'missing-primary-p2p', 'missing-witness-rest', 'missing-witness-p2p',
    'non-loopback', 'extra-port', 'foreign-owner',
  ])('preserves per-assertion checks: %s', async fault => {
    const directory = mkdtempSync(join(tmpdir(), 'fed-process-pair-test-'));
    const java = join(directory, 'java.exe');
    const otherJava = join(directory, 'same-image-other-path.exe');
    const jar = join(directory, 'node.jar');
    writeFileSync(java, 'synthetic process image fixture');
    writeFileSync(otherJava, readFileSync(java));
    writeFileSync(jar, 'synthetic assembly fixture');
    const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
    const children: FakeChild[] = [];
    const configs: string[] = [];
    let logback = '';
    let injected = false;
    boundary.spawn.mockReset().mockImplementation((_exe: string, args: string[]) => {
      const child = new FakeChild(children.length === 0 ? PRIMARY : WITNESS);
      configs.push(args[args.indexOf('--config') + 1]!);
      logback = args.find(value => value.startsWith('-Dlogback.configurationFile='))!.split('=')[1]!;
      children.push(child);
      return child;
    });
    boundary.spawnSync.mockImplementation((_exe: string, args: string[]) => {
      const command = args.at(-1)!;
      if (command.includes('-LocalPort')) return { ...result([]) };
      if (command.includes('$images=')) {
        const rows = listeners();
        if (injected) {
          const missing = ['missing-primary-rest', 'missing-primary-p2p', 'missing-witness-rest', 'missing-witness-p2p'].indexOf(fault);
          if (missing >= 0) rows.splice(missing, 1);
          if (fault === 'non-loopback') rows.push({ ...rows[0]!, LocalAddress: '0.0.0.0' });
          if (fault === 'extra-port') rows.push({ LocalAddress: '127.0.0.1', LocalPort: 1234, OwningProcess: PRIMARY });
          if (fault === 'foreign-owner') rows[0]!.OwningProcess = 42_000;
        }
        return result({ images: [
          { Id: PRIMARY, Path: injected && fault === 'primary-image' ? otherJava : java },
          { Id: WITNESS, Path: injected && fault === 'witness-image' ? otherJava : java },
        ], listeners: rows });
      }
      if (command.includes('Get-Process -Id')) return { ...result(null), stdout: java };
      if (command.includes('-OwningProcess')) return result(listeners());
      throw new Error('unexpected process inspection');
    });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === '/node/shutdown' && init?.method === 'POST') {
        setTimeout(() => children[url.port === '9051' ? 0 : 1]?.close(), 0);
        return new Response('', { status: 200 });
      }
      const data = url.pathname === '/info' ? { network: 'devnet', fullHeight: 10 }
        : url.pathname === '/blocks/lastHeaders/1' ? [{ id: '11'.repeat(32), height: 10 }]
          : url.pathname === '/blockchain/indexedHeight' ? { fullHeight: 10, indexedHeight: 10 } : undefined;
      if (!data) throw new Error('unexpected fixture HTTP request');
      return new Response(JSON.stringify(data), { status: 200 });
    }));
    const key = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
    const session = createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1({
      javaExecutablePath: java, expectedJavaExecutableSha256Hex: sha(java),
      nodeAssemblyJarPath: jar, expectedNodeAssemblyJarSha256Hex: sha(jar),
      buildIdentityDigestHex: '11'.repeat(32),
    }, { miningTargetPublicKeyHex: key, p2pkErgoTreeHex: `0008cd${key}`,
      rewardInputErgoTrees: { delay1: deriveDevnetRewardErgoTreeHexForDelay(key, 1), delay720: deriveDevnetRewardErgoTreeHexForDelay(key, 720) },
      networkPrefix: 16, primaryNodeOrigin: 'http://127.0.0.1:9051', witnessNodeOrigin: 'http://127.0.0.1:9052',
    }, issueSubstrateFederatedIsolatedDevnetMiningCredentialV1('test test test test test test test test test test test junk', key));
    try {
      await session.startMining();
      await expect(session.withMiningActiveExecutionTarget(async target => {
        const before = boundary.spawnSync.mock.calls.length;
        expect(() => assertTarget(target)).not.toThrow();
        expect(boundary.spawnSync.mock.calls.length - before).toBe(1);
        injected = true;
        if (fault === 'primary-exit') children[0]!.exitCode = 1;
        if (fault === 'witness-exit') children[1]!.exitCode = 1;
        const changedFile = fault === 'java-bytes' ? java : fault === 'jar-bytes' ? jar
          : fault === 'primary-config' ? configs[0] : fault === 'witness-config' ? configs[1]
            : fault === 'logback' ? logback
              : fault === 'inactive-primary-config' ? join(dirname(configs[0]!), 'primary-non-mining.conf')
                : fault === 'inactive-witness-config' ? join(dirname(configs[1]!), 'witness-non-mining.conf') : undefined;
        if (changedFile) appendFileSync(changedFile, '\nchanged');
        if (fault === 'none') expect(() => assertTarget(target)).not.toThrow();
        else if (fault.endsWith('-image')) {
          expect(sha(otherJava)).toBe(sha(java));
          expect(() => assertTarget(target)).toThrow('process image differs from Java');
        } else if (fault === 'non-loopback') {
          expect(() => assertTarget(target)).toThrow('exposed an unexpected listener');
        } else expect(() => assertTarget(target)).toThrow();
        throw new Error('fixture stop after deciding assertion');
      })).rejects.toThrow('fixture stop after deciding assertion');
    } finally {
      await session.stop();
      expect(children.every(child => child.exitCode !== null || child.signalCode !== null)).toBe(true);
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
