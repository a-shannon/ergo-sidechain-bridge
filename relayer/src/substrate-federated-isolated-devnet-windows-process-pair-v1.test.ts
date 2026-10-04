import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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
  parseSubstrateFederatedIsolatedDevnetWindowsNetstatV1 as parseNetstat,
  createSubstrateFederatedIsolatedDevnetErgoNodeProcessV1,
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1 as assertTarget,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_MANAGED_ACTION_COMPLETION_BUDGET_MS_V1 as completionBudgetMs,
} from './substrate-federated-isolated-devnet-ergo-node-process-v1.js';
import { deriveDevnetRewardErgoTreeHexForDelay } from './relayer-core/devnet-reward-consolidation.js';
import { projectOwnIsolatedErgoNodePostCallbackStageV1 as projectOwnerStage }
  from './substrate-federated-isolated-devnet-ergo-node-post-callback-stage-v1.js';
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
const rawResult = (stdout: string) => ({
  status: 0, signal: null, error: undefined, stderr: '', stdout,
});

const netstat = (rows: string[]) => [
  'Active Connections',
  '  Proto  Local Address          Foreign Address        State           PID',
  ...rows,
].join('\r\n');

describe('bounded netstat listener parser', () => {
  it('accepts localized headings, IPv4/IPv6 listeners and ignores strict UDP rows', () => {
    expect(parseNetstat([
      'Connexions actives',
      '  Proto  Adresse locale     Adresse distante       \uFFFDtat',
      '  TCP    0.0.0.0:9051       0.0.0.0:0       LISTENING       41001',
      '  TCP    [::]:9021           [::]:0           LISTENING       41001',
      '  TCP    [::1]:9052          [::1]:51200      ESTABLISHED     41002',
      '  UDP    0.0.0.0:5353        *:*                              41001',
      '  UDP    [::]:5353           *:*                              41002',
    ].join('\r\n'), [PRIMARY, WITNESS])).toEqual([
      { pid: PRIMARY, localAddress: '0.0.0.0', localPort: 9051 },
      { pid: PRIMARY, localAddress: '::', localPort: 9021 },
    ]);
  });

  it.each([
    'TCP 0.0.0.0:9051 0.0.0.0:0 LISTENING',
    'TCP 0.0.0.0:9051 0.0.0.0:0 UNKNOWN 41001',
    'TCP 0.0.0.0:9051 0.0.0.0:0 LISTENING 41001 extra',
    'TCP [broken:9051 0.0.0.0:0 LISTENING 41001',
    'TCP [not-an-ip]:9051 [::]:0 LISTENING 41001',
    'TCP ::1:9051 0.0.0.0:0 LISTENING 41001',
    'TCP 127.0.0.1:* 0.0.0.0:0 LISTENING 41001',
    'TCP [::1]:* 0.0.0.0:0 LISTENING 41001',
    'TCP 127.0.0.1:9051 *:443 LISTENING 41001',
    'TCP 127.0.0.1:9051 *:* LISTENING 41001',
    'TCP 192.0.2.1:443 *:* LISTENING 42000',
    'TCP 127.0.0.1:9051 0.0.0.0:* LISTENING 41001',
    'TCP 127.0.0.1:65536 0.0.0.0:0 LISTENING 41001',
    'TCP 127.0.0.1:9051 0.0.0.0:65536 LISTENING 41001',
    'TCP 127.0.0.1:9051 0.0.0.0:0 LISTENING 4294967296',
    'TCP 0.0.0.0:9051 0.0.0.0:0 LISTENING 41001\nMALFORMED ROW',
    'UDP 0.0.0.0:5353 *:*',
  ])('rejects malformed, unknown or truncated netstat rows', row => {
    expect(() => parseNetstat(netstat([row]), [PRIMARY, WITNESS])).toThrow();
  });

  it.each([
    ['Active Connections', 'Proto Local Address Foreign Address State PID'],
    ['Active Connections', 'Proto Local Address Foreign Address State'],
    ['Connexions actives', 'Proto Adresse locale Adresse distante État PID'],
    ['Connexions actives', 'Proto Adresse locale Adresse distante État'],
    ['Connexions actives', 'Proto Adresse locale Adresse distante \uFFFDtat PID'],
    ['Connexions actives', 'Proto Adresse locale Adresse distante \uFFFDtat'],
  ])('accepts the verified caption/header shape %# with exact PID data rows', (caption, header) => {
    expect(parseNetstat([
      caption, header, 'TCP 127.0.0.1:9051 0.0.0.0:0 LISTENING 41001',
    ].join('\r\n'), [PRIMARY])).toEqual([
      { pid: PRIMARY, localAddress: '127.0.0.1', localPort: 9051 },
    ]);
  });

  it.each([
    'Connexions actives',
    'Connexions actives\nProto Adresse locale Adresse distante',
    'Active Connections\nProto UNKNOWN PID',
    'Active Connections\nProto Local Address Foreign Address State PID EXTRA',
    'Active Connections\nProto Local Address Foreign Address State PID\nProto Local Address Foreign Address State PID',
    'Proto Local Address Foreign Address State PID',
    'TCP 127.0.0.1:9051 0.0.0.0:0 LISTENING 41001',
    netstat([]) + '\n' + ' '.repeat(256 * 1024),
  ])('rejects incomplete, unknown, duplicated or oversized captures %#', stdout => {
    expect(() => parseNetstat(stdout, [PRIMARY, WITNESS])).toThrow();
  });

  it('accepts a complete empty table but requires an actual header', () => {
    expect(parseNetstat(netstat([]), [PRIMARY, WITNESS])).toEqual([]);
  });

  it('ignores unrelated owners after strict row validation and preserves target rows', () => {
    expect(parseNetstat(netstat([
      'TCP 192.0.2.1:443 0.0.0.0:0 LISTENING 42000',
      'TCP 192.0.2.2:444 192.0.2.3:0 TIME_WAIT 0',
      'UDP 0.0.0.0:5353 203.0.113.1:443 42000',
      'TCP 0.0.0.0:9051 0.0.0.0:0 LISTENING 41001',
    ]), [PRIMARY, WITNESS])).toEqual([
      { pid: PRIMARY, localAddress: '0.0.0.0', localPort: 9051 },
    ]);
  });

  it('rejects invalid local ports, empty output and duplicate target rows by consumer policy', () => {
    expect(() => parseNetstat(netstat(['TCP 0.0.0.0:0 0.0.0.0:0 LISTENING 41001']), [PRIMARY, WITNESS])).toThrow();
    expect(() => parseNetstat('', [PRIMARY, WITNESS])).toThrow();
    expect(parseNetstat(netstat([
      'TCP 127.0.0.1:9051 0.0.0.0:0 LISTENING 41001',
      'TCP 127.0.0.1:9051 0.0.0.0:0 LISTENING 41001',
    ]), [PRIMARY, WITNESS])).toHaveLength(2);
  });

  it('accepts a Windows process ID above the TCP port range', () => {
    expect(parseNetstat(netstat([
      'TCP 127.0.0.1:9051 0.0.0.0:0 LISTENING 70000',
    ]), [70_000])).toEqual([
      { pid: 70_000, localAddress: '127.0.0.1', localPort: 9051 },
    ]);
  });

  it('rejects an unknown preamble even when a valid row follows', () => {
    expect(() => parseNetstat([
      'unexpected preamble 123',
      'Proto Local Address Foreign Address State PID',
      'TCP 127.0.0.1:9051 0.0.0.0:0 LISTENING 41001',
    ].join('\r\n'), [PRIMARY, WITNESS])).toThrow();
  });
});

beforeEach(() => boundary.spawnSync.mockReset().mockImplementation((_executable: string, args: string[]) =>
  args[0] === '-a' ? rawResult(netstat(listeners().map(row =>
    `TCP ${row.LocalAddress}:${row.LocalPort} 0.0.0.0:0 LISTENING ${row.OwningProcess}`)))
    : result({ images: images() })));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe.skipIf(process.platform !== 'win32')('fresh Windows process-pair observation', () => {
  it('maps both exact PIDs and all listener rows with two bounded reads', () => {
    const observed = observe(PRIMARY, WITNESS);
    expect(observed.primaryExecutablePath).toBe(realpathSync(process.execPath));
    expect(observed.witnessExecutablePath).toBe(realpathSync(process.execPath));
    expect(observed.listeners).toEqual(listeners().map(row => ({
      pid: row.OwningProcess, localAddress: row.LocalAddress, localPort: row.LocalPort,
    })));
    expect(Object.isFrozen(observed)).toBe(true);
    expect(Object.isFrozen(observed.listeners)).toBe(true);
    expect(observed.listeners.every(Object.isFrozen)).toBe(true);
    expect(boundary.spawnSync).toHaveBeenCalledTimes(2);
    const [executable, args, options] = boundary.spawnSync.mock.calls[0]!;
    expect(executable).toBe(join(process.env.SystemRoot!, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'));
    expect(args.slice(0, -1)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-Command']);
    expect(args.at(-1)).toContain('$pids=@(41001,41002)');
    expect(args.at(-1)).toContain('Get-Process -Id $pids -ErrorAction Stop');
    expect(options).toMatchObject({ encoding: 'utf8', timeout: 10_000, maxBuffer: 256 * 1024, windowsHide: true });
    const [netstatExecutable, netstatArgs, netstatOptions] = boundary.spawnSync.mock.calls[1]!;
    expect(netstatExecutable).toBe(join(process.env.SystemRoot!, 'System32', 'netstat.exe'));
    expect(netstatArgs).toEqual(['-a', '-n', '-o']);
    expect(netstatOptions).toMatchObject({ encoding: 'utf8', timeout: 10_000, maxBuffer: 256 * 1024, windowsHide: true });
  });

  it('does not cache an observation across successive assertions', () => {
    observe(PRIMARY, WITNESS);
    boundary.spawnSync.mockReturnValueOnce(result({ images: images() }));
    boundary.spawnSync.mockReturnValueOnce(rawResult(netstat([])));
    expect(observe(PRIMARY, WITNESS).listeners).toEqual([]);
    expect(boundary.spawnSync).toHaveBeenCalledTimes(4);
  });

  it('retains unexpected listener rows for the owner to reject instead of filtering them', () => {
    const extra = { LocalAddress: '0.0.0.0', LocalPort: 1234, OwningProcess: PRIMARY };
    boundary.spawnSync.mockReturnValueOnce(result({ images: images() }));
    boundary.spawnSync.mockReturnValueOnce(rawResult(netstat([
      ...listeners().map(row => `TCP ${row.LocalAddress}:${row.LocalPort} 0.0.0.0:0 LISTENING ${row.OwningProcess}`),
      `TCP ${extra.LocalAddress}:${extra.LocalPort} 0.0.0.0:0 LISTENING ${extra.OwningProcess}`,
    ])));
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
    null, [], {}, { images: [] }, { images: images()[0] },
    { images: [images()[0]] }, { images: [...images(), images()[0]] },
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
    { error: new Error('timeout') }, { status: 1 }, { status: null },
    { signal: 'SIGTERM' }, { stderr: 'inspection error' },
  ])('fails closed on subprocess failure %#', overrides => {
    boundary.spawnSync.mockReturnValueOnce({ ...result({ images: images(), listeners: listeners() }), ...overrides });
    expect(() => observe(PRIMARY, WITNESS)).toThrow('inspection failed');
  });

  it.each([
    { error: new Error('timeout') }, { error: new Error('ENOBUFS') },
    { status: 1 }, { status: null }, { signal: 'SIGTERM' }, { stderr: 'inspection error' },
  ])('fails closed on the second subprocess failure %#', overrides => {
    boundary.spawnSync.mockReturnValueOnce(result({ images: images() }));
    boundary.spawnSync.mockReturnValueOnce({ ...rawResult(netstat([])), ...overrides });
    expect(() => observe(PRIMARY, WITNESS)).toThrow('Windows netstat inspection failed');
    expect(boundary.spawnSync).toHaveBeenCalledTimes(2);
  });

  it.each(['unavailable', 'relative', 'missing', 'directory'] as const)(
    'rejects a %s netstat path before the second subprocess', fault => {
      const root = mkdtempSync(join(tmpdir(), 'fed-netstat-path-test-'));
      try {
        if (fault === 'directory') mkdirSync(join(root, 'System32', 'netstat.exe'), { recursive: true });
        boundary.spawnSync.mockImplementationOnce(() => {
          vi.stubEnv('SystemRoot', fault === 'unavailable' ? undefined : fault === 'relative' ? '.' : root);
          vi.stubEnv('WINDIR', undefined);
          return result({ images: images() });
        });
        expect(() => observe(PRIMARY, WITNESS)).toThrow(
          fault === 'unavailable' || fault === 'relative' ? 'SystemRoot is unavailable' : /file|regular|ENOENT/i,
        );
        expect(boundary.spawnSync).toHaveBeenCalledTimes(1);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

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
    'callback-return', 'completion-equality', 'completion-plus-one',
    'invalid-start-time', 'invalid-completion-time', 'backwards-completion-time',
    'primary-orderly-stop', 'witness-orderly-stop', 'post-stop-port',
    'primary-restart', 'witness-restart', 'primary-stable-snapshot', 'witness-stable-snapshot',
  ])('preserves per-assertion and post-callback checks: %s', async fault => {
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
    const launches: { role: 'primary' | 'witness'; mode: 'mining' | 'non-mining'; child: FakeChild }[] = [];
    const shutdownPids: number[] = [];
    const snapshotReads = new Map<number, number>();
    const lifecycleFault = [
      'callback-return', 'completion-equality', 'completion-plus-one',
      'invalid-start-time', 'invalid-completion-time', 'backwards-completion-time',
      'primary-orderly-stop', 'witness-orderly-stop', 'post-stop-port',
      'primary-restart', 'witness-restart', 'primary-stable-snapshot', 'witness-stable-snapshot',
    ].includes(fault);
    const liveLaunches = () => launches.filter(({ child }) => child.exitCode === null && child.signalCode === null);
    const liveListeners = () => liveLaunches().flatMap(({ role, child }) =>
      (role === 'primary' ? [9051, 9021] : [9052, 9022]).map(LocalPort => ({
        LocalAddress: '127.0.0.1', LocalPort, OwningProcess: child.pid,
      })));
    let logback = '';
    let injected = false;
    let callbackReturned = false;
    let portFaultInjected = false;
    boundary.spawn.mockReset().mockImplementation((_exe: string, args: string[]) => {
      const config = args[args.indexOf('--config') + 1]!;
      const role = config.endsWith('primary-mining.conf') || config.endsWith('primary-non-mining.conf') ? 'primary' : 'witness';
      const mode = config.endsWith('-non-mining.conf') ? 'non-mining' : 'mining';
      if (mode === 'non-mining' && fault === `${role}-restart`) {
        throw new Error(`fixture ${role} non-mining spawn failure`);
      }
      expect(liveLaunches().some(launch => launch.role === role)).toBe(false);
      const child = new FakeChild((role === 'primary' ? PRIMARY : WITNESS) + (mode === 'non-mining' ? 100 : 0));
      configs.push(config);
      logback = args.find(value => value.startsWith('-Dlogback.configurationFile='))!.split('=')[1]!;
      children.push(child);
      launches.push({ role, mode, child });
      return child;
    });
    boundary.spawnSync.mockImplementation((_exe: string, args: string[]) => {
      const command = args.at(-1)!;
      if (command.includes('-LocalPort')) {
        const rows = liveListeners();
        if (fault === 'post-stop-port' && callbackReturned && rows.length === 0 && !portFaultInjected) {
          portFaultInjected = true;
          rows.push({ LocalAddress: '127.0.0.1', LocalPort: 9051, OwningProcess: 42_000 });
        }
        return result(rows);
      }
      if (command.includes('$images=')) {
        return result({ images: liveLaunches().map(({ role, child }) => ({
          Id: child.pid, Path: injected && fault === `${role}-image` ? otherJava : java,
        })) });
      }
      if (args[0] === '-a') {
        const rows = liveListeners();
        if (injected) {
          const missing = ['missing-primary-rest', 'missing-primary-p2p', 'missing-witness-rest', 'missing-witness-p2p'].indexOf(fault);
          if (missing >= 0) rows.splice(missing, 1);
          if (fault === 'non-loopback') rows.push({ ...rows[0]!, LocalAddress: '0.0.0.0' });
          if (fault === 'extra-port') rows.push({ LocalAddress: '127.0.0.1', LocalPort: 1234, OwningProcess: PRIMARY });
          if (fault === 'foreign-owner') rows[0]!.OwningProcess = 42_000;
        }
        return rawResult(netstat(rows.map(row =>
          `TCP ${row.LocalAddress}:${row.LocalPort} 0.0.0.0:0 LISTENING ${row.OwningProcess}`)));
      }
      if (command.includes('Get-Process -Id')) {
        const pid = Number(/Get-Process -Id (\d+)/u.exec(command)![1]);
        expect(liveLaunches().some(launch => launch.child.pid === pid)).toBe(true);
        return { ...result(null), stdout: java };
      }
      if (command.includes('-OwningProcess')) return result(liveListeners());
      throw new Error('unexpected process inspection');
    });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const role = url.port === '9051' ? 'primary' : 'witness';
      const launch = liveLaunches().find(candidate => candidate.role === role);
      if (!launch) throw new Error('fixture request has no live process generation');
      if (url.pathname === '/node/shutdown' && init?.method === 'POST') {
        shutdownPids.push(launch.child.pid);
        if (callbackReturned && fault === `${role}-orderly-stop`) return new Response('', { status: 503 });
        setTimeout(() => launch.child.close(), 0);
        return new Response('', { status: 200 });
      }
      if (url.pathname === '/blocks/lastHeaders/1') {
        snapshotReads.set(launch.child.pid, (snapshotReads.get(launch.child.pid) ?? 0) + 1);
      }
      const changedSnapshot = launch.mode === 'non-mining' && fault === `${role}-stable-snapshot`
        && (snapshotReads.get(launch.child.pid) ?? 0) === 3;
      const data = url.pathname === '/info' ? { network: 'devnet', fullHeight: 10 }
        : url.pathname === '/blocks/lastHeaders/1' ? [{ id: (changedSnapshot ? '22' : '11').repeat(32), height: 10 }]
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
      expect(completionBudgetMs).toBe(4_680_000);
      const timing = fault === 'invalid-start-time' ? [NaN, 1_000]
        : fault === 'invalid-completion-time' ? [1_000, Infinity]
          : fault === 'backwards-completion-time' ? [1_000, 999]
            : [1_000, 1_000 + (fault === 'completion-equality' ? 4_680_000
              : fault === 'completion-plus-one' ? 4_680_001 : 0)];
      const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(timing[0]!).mockReturnValueOnce(timing[1]!);
      const value = Object.freeze({ callback: 'completed' });
      let retainedTarget: Parameters<typeof assertTarget>[0] | undefined;
      const execution = session.withMiningActiveExecutionTarget(async target => {
        retainedTarget = target;
        const before = boundary.spawnSync.mock.calls.length;
        expect(() => assertTarget(target)).not.toThrow();
        expect(boundary.spawnSync.mock.calls.length - before).toBe(2);
        injected = true;
        if (lifecycleFault) {
          callbackReturned = true;
          return value;
        }
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
      });
      if (!lifecycleFault) {
        await expect(execution).rejects.toThrow('fixture stop after deciding assertion');
      } else if (fault === 'callback-return' || fault === 'completion-equality') {
        const completed = await execution;
        expect(completed.value).toBe(value);
        expect(completed.receipt.initialSnapshot).toEqual({
          network: 'devnet', fullHeight: 10, indexedHeight: 10, headerIdHex: '11'.repeat(32),
        });
        expect(completed.receipt.finalSnapshot).toEqual(completed.receipt.initialSnapshot);
        expect(launches.map(({ role, mode, child }) => [role, mode, child.pid])).toEqual([
          ['primary', 'mining', PRIMARY], ['witness', 'mining', WITNESS],
          ['primary', 'non-mining', PRIMARY + 100], ['witness', 'non-mining', WITNESS + 100],
        ]);
        expect(snapshotReads.get(PRIMARY + 100)).toBe(3);
        expect(snapshotReads.get(WITNESS + 100)).toBe(3);
        expect(liveLaunches().map(({ child }) => child.pid)).toEqual([PRIMARY + 100, WITNESS + 100]);
      } else {
        const expected = fault === 'completion-plus-one' ? 'managed action exceeded its completion budget'
          : fault.includes('-time') ? 'managed-action timing is invalid'
            : fault.endsWith('-orderly-stop') ? `${fault.split('-')[0]} process did not stop orderly`
              : fault === 'post-stop-port' ? 'process port is already owned'
                : fault.endsWith('-restart') ? `fixture ${fault.split('-')[0]} non-mining spawn failure`
                  : `${fault.split('-')[0]} snapshot differs from the frozen target`;
        let rejected: unknown;
        await expect(execution.catch(error => { rejected = error; throw error; })).rejects.toThrow(expected);
        const ownerStage = fault.endsWith('-time') || fault === 'completion-plus-one'
          ? 'completion-check' : fault.endsWith('-orderly-stop') ? 'mining-shutdown'
            : fault === 'post-stop-port' ? 'ownership-recheck'
              : fault.endsWith('-restart') ? 'read-only-restart' : 'read-only-validation';
        expect(projectOwnerStage(rejected)).toBe(ownerStage);
        expect(liveLaunches()).toEqual([]);
      }
      if (lifecycleFault) {
        expect(callbackReturned).toBe(true);
        expect(clock).toHaveBeenCalledTimes(2);
        const rejectedTiming = fault === 'completion-plus-one' || fault.includes('-time');
        expect(shutdownPids).toEqual(rejectedTiming ? []
          : fault === 'primary-orderly-stop' ? [PRIMARY] : [PRIMARY, WITNESS]);
        expect(launches.filter(({ mode }) => mode === 'non-mining')).toHaveLength(
          rejectedTiming || fault.endsWith('-orderly-stop') || fault === 'post-stop-port' || fault === 'primary-restart' ? 0
            : fault === 'witness-restart' ? 1 : 2,
        );
        expect(() => assertTarget(retainedTarget!)).toThrow();
      }
    } finally {
      await session.stop();
      expect(children.every(child => child.exitCode !== null || child.signalCode !== null)).toBe(true);
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
