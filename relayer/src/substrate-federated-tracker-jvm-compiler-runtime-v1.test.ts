import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fault = vi.hoisted(() => ({
  missingPath: '',
  changedPath: '',
  changedRead: 1,
  reads: 0,
  linkedPath: '',
  redirectedPath: '',
  mutation: vi.fn(() => { throw new Error('admission must be read-only'); }),
  execute: vi.fn(() => { throw new Error('admission must not execute a process'); }),
}));

vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  execFile: fault.execute,
}));

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: (path: string) => path !== fault.missingPath && actual.existsSync(path),
    readFileSync: (path: string, options?: unknown) => {
      if (path === fault.changedPath && ++fault.reads === fault.changedRead) {
        return Buffer.from('single changed read');
      }
      return actual.readFileSync(path, options as never);
    },
    lstatSync: (path: string) => path === fault.linkedPath
      ? { isSymbolicLink: () => true }
      : actual.lstatSync(path),
    realpathSync: (path: string) => path === fault.redirectedPath
      ? `${actual.realpathSync(path)}-alias`
      : actual.realpathSync(path),
    mkdirSync: fault.mutation,
    mkdtempSync: fault.mutation,
    cpSync: fault.mutation,
    chmodSync: fault.mutation,
    writeFileSync: fault.mutation,
    rmSync: fault.mutation,
  };
});

import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';
import {
  assertPinnedFederatedJvmCompilerRuntimeV1,
  validateSubstrateFederatedTrackerJvmCompilerLockV1,
} from './substrate-federated-tracker-jvm-compiler-v1.js';

const bridgeRoot = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
const lock = validateSubstrateFederatedTrackerJvmCompilerLockV1(JSON.parse(
  readFileSync(resolve(bridgeRoot, 'sources/substrate-federated-tracker-compiler-lock-v1.json'), 'utf8'),
));
const dependencyRoot = resolve(bridgeRoot, lock.dependencyRootPath);
const javaHome = process.env.JAVA_HOME;
if (!javaHome) throw new Error('the pinned compiler test requires its reviewed Java home');
const input = { bridgeRoot, javaHome };

beforeEach(() => {
  if (ORIGINAL_NODE_OPTIONS !== undefined || process.env.NODE_OPTIONS !== '--no-deprecation') {
    throw new Error('Vitest parent NODE_OPTIONS is not the reviewed harness value');
  }
  vi.stubEnv('NODE_OPTIONS', undefined);
  fault.missingPath = '';
  fault.changedPath = '';
  fault.changedRead = 1;
  fault.reads = 0;
  fault.linkedPath = '';
  fault.redirectedPath = '';
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  expect(fault.mutation).not.toHaveBeenCalled();
  expect(fault.execute).not.toHaveBeenCalled();
});

describe('FED compiler runtime admission', () => {
  it('checks actual pinned bytes with explicit Java and returns no receipt', () => {
    vi.stubEnv('JAVA_HOME', dependencyRoot);
    expect(assertPinnedFederatedJvmCompilerRuntimeV1(input)).toBeUndefined();
    expect(process.env.JAVA_HOME).toBe(dependencyRoot);
  });

  it('rejects another checkout and absent explicit roots without ambient fallback', () => {
    expect(() => assertPinnedFederatedJvmCompilerRuntimeV1({ ...input, bridgeRoot: dependencyRoot }))
      .toThrow(/bridge root differs from loaded source/u);
    expect(() => assertPinnedFederatedJvmCompilerRuntimeV1({ ...input, bridgeRoot: '' }))
      .toThrow(/requires a bridge root/u);
    expect(() => assertPinnedFederatedJvmCompilerRuntimeV1({ ...input, javaHome: '' }))
      .toThrow(/requires a Java home/u);
  });

  it('rejects a missing dependency root before compilation', () => {
    fault.missingPath = dependencyRoot;
    expect(() => assertPinnedFederatedJvmCompilerRuntimeV1(input))
      .toThrow(/dependency root is missing/u);
  });

  it.each(lock.dependencyClasspath)('rejects a missing JAR: $name', entry => {
    fault.missingPath = resolve(dependencyRoot, entry.name);
    expect(() => assertPinnedFederatedJvmCompilerRuntimeV1(input))
      .toThrow(/dependency does not match its direct pin/u);
  });

  it.each(lock.dependencyClasspath)('rejects a changed direct JAR pin: $name', entry => {
    fault.changedPath = resolve(dependencyRoot, entry.name);
    expect(() => assertPinnedFederatedJvmCompilerRuntimeV1(input))
      .toThrow(/dependency does not match its direct pin/u);
    expect(fault.reads).toBe(1);
  });

  it('checks the aggregate after all direct pins', () => {
    fault.changedPath = resolve(dependencyRoot, lock.dependencyClasspath[0].name);
    fault.changedRead = 2;
    expect(() => assertPinnedFederatedJvmCompilerRuntimeV1(input))
      .toThrow(/dependency classpath drifted/u);
    expect(fault.reads).toBe(2);
  });

  it.each(['dependency root', 'dependency JAR'])('rejects a linked %s', kind => {
    fault.linkedPath = kind === 'dependency root'
      ? dependencyRoot : resolve(dependencyRoot, lock.dependencyClasspath[0].name);
    expect(() => assertPinnedFederatedJvmCompilerRuntimeV1(input)).toThrow(
      kind === 'dependency root' ? /must be a real repository directory/u : /direct pin/u,
    );
  });

  it('rejects a redirected dependency directory', () => {
    fault.redirectedPath = dependencyRoot;
    expect(() => assertPinnedFederatedJvmCompilerRuntimeV1(input))
      .toThrow(/must be a real repository directory/u);
  });

  it('checks the actual parent Node executable', () => {
    fault.changedPath = realpathSync(process.execPath);
    expect(() => assertPinnedFederatedJvmCompilerRuntimeV1(input))
      .toThrow(/parent Node does not match its lock/u);
  });

  it.each(lock.forbiddenParentEnvironmentOverrides)('rejects parent override %s', name => {
    vi.stubEnv(name, 'unreviewed');
    expect(() => assertPinnedFederatedJvmCompilerRuntimeV1(input))
      .toThrow(`parent environment contains ${name}`);
  });

  it('checks the exact compiler source', () => {
    fault.changedPath = resolve(bridgeRoot, lock.toolPath);
    expect(() => assertPinnedFederatedJvmCompilerRuntimeV1(input))
      .toThrow(/source does not match its SHA-256 lock/u);
  });

  it('rejects a changed Java home independently of ambient Java', () => {
    expect(() => assertPinnedFederatedJvmCompilerRuntimeV1({ ...input, javaHome: dependencyRoot }))
      .toThrow(/Java home does not match its lock/u);
  });

  it.each(['java', 'javac'])('rechecks the %s executable after Java tree hashing', name => {
    fault.changedPath = realpathSync(resolve(javaHome, 'bin', `${name}.exe`));
    fault.changedRead = 2;
    expect(() => assertPinnedFederatedJvmCompilerRuntimeV1(input))
      .toThrow(`compiler ${name} executable drifted`);
    expect(fault.reads).toBe(2);
  });
});
