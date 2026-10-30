import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawnSync: vi.fn(), lstatSync: vi.fn(), realpathSync: vi.fn() }));
vi.mock('node:child_process', () => ({ spawnSync: mocks.spawnSync }));
vi.mock('node:fs', () => ({ lstatSync: mocks.lstatSync, realpathSync: mocks.realpathSync }));

import {
  observeWindowsTcpListenersV1 as observe,
  parseWindowsTcpListenerObservationV1 as parse,
} from './windows-tcp-listener-observation-v1.js';

const PORTS = [9955, 9956, 30355, 30356, 9615, 9616];
const capture = (rows: string[]) => [
  'Active Connections', 'Proto Local Address Foreign Address State PID', ...rows,
].join('\r\n');
const row = (port: number, address = '127.0.0.1', pid = 41001) =>
  `TCP ${address.includes(':') ? `[${address}]` : address}:${port} ${address.includes(':') ? '[::]:0' : '0.0.0.0:0'} LISTENING ${pid}`;

describe('port-complete Windows TCP listener parser V1', () => {
  it.each(PORTS)('retains all selected-port %s listeners irrespective of PID or wildcard', port => {
    const result = parse(capture([
      row(port), row(port, '127.0.0.1', 49999), row(port, '0.0.0.0', 49999),
      row(port, '::1'), row(port, '::', 49999),
      row(port, '127.0.0.1', 0xffff_ffff), row(443, '192.0.2.1', 42000),
      'TCP 127.0.0.1:9955 192.0.2.1:443 ESTABLISHED 41001',
      'UDP 0.0.0.0:9955 *:* 41001',
    ]), PORTS);
    expect(result).toEqual([
      { localAddress: '127.0.0.1', localPort: port, pid: 41001 },
      { localAddress: '127.0.0.1', localPort: port, pid: 49999 },
      { localAddress: '0.0.0.0', localPort: port, pid: 49999 },
      { localAddress: '::1', localPort: port, pid: 41001 },
      { localAddress: '::', localPort: port, pid: 49999 },
      { localAddress: '127.0.0.1', localPort: port, pid: 0xffff_ffff },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.every(Object.isFrozen)).toBe(true);
  });

  it.each([
    ['Active Connections', 'Proto Local Address Foreign Address State PID'],
    ['Active Connections', 'Proto Local Address Foreign Address State'],
    ['Connexions actives', 'Proto Adresse locale Adresse distante État PID'],
    ['Connexions actives', 'Proto Adresse locale Adresse distante État'],
    ['Connexions actives', 'Proto Adresse locale Adresse distante \uFFFDtat PID'],
    ['Connexions actives', 'Proto Adresse locale Adresse distante \uFFFDtat'],
  ])('accepts verified caption/header %s / %s', (caption, header) => {
    expect(parse([caption, header, row(9955)].join('\n'), PORTS)).toHaveLength(1);
    expect(parse([caption, header].join('\n'), PORTS)).toEqual([]);
  });

  it.each([
    '', 'Active Connections', 'Unknown Connections\nProto Local Address Foreign Address State PID',
    'Active Connections\nProto UNKNOWN PID',
    'Active Connections\nProto Local Address Foreign Address State PID EXTRA',
    capture([]) + '\nProto Local Address Foreign Address State PID',
    capture([row(9955)]) + '\nActive Connections',
    row(9955), capture([]) + '\n' + ' '.repeat(256 * 1024),
  ])('rejects missing, unknown, duplicated, misplaced or oversized framing %#', value => {
    expect(() => parse(value, PORTS)).toThrow();
  });

  it.each([
    'TCP 127.0.0.1:9955 0.0.0.0:0 LISTENING',
    'TCP 127.0.0.1:9955 0.0.0.0:0 LISTENING 41001 extra',
    'TCP [broken:443 0.0.0.0:0 LISTENING 42000',
    'TCP [not-an-ip]:443 [::]:0 LISTENING 42000',
    'TCP ::1:443 0.0.0.0:0 LISTENING 42000',
    'TCP 999.0.0.1:443 0.0.0.0:0 LISTENING 42000',
    'TCP localhost:443 0.0.0.0:0 LISTENING 42000',
    'TCP 127.0.0.1:* 0.0.0.0:0 LISTENING 42000',
    'TCP [::1]:* [::]:0 LISTENING 42000',
    'TCP 127.0.0.1:443 *:* LISTENING 42000',
    'TCP 127.0.0.1:443 *:443 LISTENING 42000',
    'TCP 127.0.0.1:443 0.0.0.0:* LISTENING 42000',
    'TCP 127.0.0.1:0 0.0.0.0:0 LISTENING 42000',
    'TCP 127.0.0.1:65536 0.0.0.0:0 LISTENING 42000',
    'TCP 127.0.0.1:443 0.0.0.0:65536 LISTENING 42000',
    'TCP 127.0.0.1:-1 0.0.0.0:0 LISTENING 42000',
    'TCP 127.0.0.1:443 0.0.0.0:0 UNKNOWN 42000',
    'TCP 127.0.0.1:443 0.0.0.0:0 LISTENING 4294967296',
    'TCP 127.0.0.1:443 0.0.0.0:0 LISTENING -1',
    'TCP 127.0.0.1:443 0.0.0.0:0 LISTENING 1.5',
    'TCP 127.0.0.1:443 0.0.0.0:0 LISTENING 1e2',
    'UDP 0.0.0.0:443 *:*', 'UDP 0.0.0.0:443 *:* 42000 extra',
    'UDP 0.0.0.0:443 *:443 42000', 'UDP 0.0.0.0:443 *:* bad',
    'UNKNOWN ROW',
  ])('rejects invalid rows even outside selected ports %#', invalid => {
    expect(() => parse(capture([row(9955), invalid]), PORTS)).toThrow();
  });

  it.each([null, {}, [], [0], [-1], [65536], [1.5], ['9955'], [NaN], new Array(1)])(
    'rejects invalid port input %#', ports => {
      expect(() => parse(capture([]), ports as number[])).toThrow(/ports/);
    },
  );

  it('rejects accessor or proxy port arrays without invoking their supplied behavior', () => {
    const getter = vi.fn(() => 9955);
    const ports = [9955];
    Object.defineProperty(ports, '0', { get: getter });
    expect(() => parse(capture([]), ports)).toThrow(/ports/);
    expect(getter).not.toHaveBeenCalled();
    const trap = vi.fn(() => { throw new Error('must not run'); });
    const proxy = new Proxy([9955], { get: trap, getOwnPropertyDescriptor: trap });
    expect(() => parse(capture([]), proxy)).toThrow(/ports/);
    expect(trap).not.toHaveBeenCalled();
    const plain = [9955];
    Object.assign(plain, { map: trap, some: trap, includes: trap, [Symbol.iterator]: trap });
    expect(parse(capture([row(9955)]), plain)).toHaveLength(1);
    expect(trap).not.toHaveBeenCalled();
  });
});

describe('fresh bounded Windows netstat subprocess V1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SystemRoot', 'C:/Windows');
    mocks.lstatSync.mockReturnValue({ isFile: () => true, isSymbolicLink: () => false });
    mocks.realpathSync.mockImplementation(path => path);
    mocks.spawnSync.mockReturnValue({ status: 0, signal: null, stdout: capture([row(9955)]), stderr: '' });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('uses verified fixed executable, minimal environment, hidden 30s bounded reads every call', () => {
    vi.stubEnv('UNRELATED_SECRET', 'not-forwarded');
    expect(observe(PORTS)).toHaveLength(1);
    mocks.spawnSync.mockReturnValueOnce({ status: 0, signal: null, stdout: capture([]), stderr: '' });
    expect(observe(PORTS)).toEqual([]);
    expect(mocks.spawnSync).toHaveBeenCalledTimes(2);
    const [path, args, options] = mocks.spawnSync.mock.calls[0]!;
    expect(path).toBe(resolve('C:/Windows', 'System32', 'netstat.exe'));
    expect(args).toEqual(['-a', '-n', '-o']);
    expect(options).toEqual({
      cwd: resolve('C:/Windows'), env: expect.any(Object), encoding: 'utf8',
      timeout: 30_000, maxBuffer: 256 * 1024, windowsHide: true,
    });
    expect(Object.keys(options.env).every(key => ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].includes(key))).toBe(true);
    expect(options.env).not.toHaveProperty('UNRELATED_SECRET');
  });

  it.each([
    { error: new Error('ETIMEDOUT') }, { error: new Error('ENOBUFS') },
    { signal: 'SIGTERM' }, { status: 1 }, { status: null },
    { stderr: 'access denied' }, { stderr: ' '.repeat(256 * 1024 + 1) },
    { stderr: null }, { stdout: '' }, { stdout: undefined },
    { stdout: capture([row(9955)]) + '\ntruncated' },
    { stdout: capture([]) + '\n' + ' '.repeat(256 * 1024) },
  ])('refuses failed, missing or malformed capture %#', fault => {
    mocks.spawnSync.mockReturnValue({ status: 0, signal: null, stdout: capture([row(9955)]), stderr: '', ...fault });
    expect(() => observe(PORTS)).toThrow();
  });

  it.each([
    { isFile: () => false, isSymbolicLink: () => false },
    { isFile: () => true, isSymbolicLink: () => true },
  ])('refuses nonregular executable before starting a subprocess %#', stat => {
    mocks.lstatSync.mockReturnValue(stat);
    expect(() => observe(PORTS)).toThrow(/regular file/);
    expect(mocks.spawnSync).not.toHaveBeenCalled();
  });

  it.each(['', 'relative'])('refuses invalid system root %#', root => {
    vi.stubEnv('SystemRoot', root);
    expect(() => observe(PORTS)).toThrow(/SystemRoot/);
    expect(mocks.spawnSync).not.toHaveBeenCalled();
  });

  it('refuses a literal NUL in the system root before touching the executable', () => {
    const originalEnvironment = process.env;
    try {
      process.env = { SystemRoot: 'C:/Windows\0bad' };
      expect(() => observe(PORTS)).toThrow(/SystemRoot/);
      expect(mocks.lstatSync).not.toHaveBeenCalled();
      expect(mocks.spawnSync).not.toHaveBeenCalled();
    } finally {
      process.env = originalEnvironment;
    }
  });

  it('refuses an otherwise valid selected listener with zero owning PID', () => {
    expect(() => parse(capture(['TCP 127.0.0.1:9955 0.0.0.0:0 LISTENING 0']), PORTS))
      .toThrow(/selected listener owning PID/);
  });

  it('refuses invalid ports before touching executable or subprocess', () => {
    expect(() => observe([0])).toThrow(/ports/);
    expect(mocks.lstatSync).not.toHaveBeenCalled();
    expect(mocks.spawnSync).not.toHaveBeenCalled();
  });
});
