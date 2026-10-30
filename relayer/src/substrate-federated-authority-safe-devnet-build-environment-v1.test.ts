import { copyFileSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync,
  realpathSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, parse, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const toolMocks = vi.hoisted(() => ({ process: vi.fn(), validate: vi.fn() }));
vi.mock('./pinned-local-native-verifier-build.js', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  runBoundedProcess: toolMocks.process,
  validateNativeVerifierToolchainLock: toolMocks.validate,
}));

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, lstatSync: vi.fn(actual.lstatSync) };
});

import {
  assertSubstrateFederatedAuthoritySafeMsvcBuildHostV1,
  buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1 as minimalEnvironment,
  inspectSubstrateFederatedAuthoritySafePinnedToolchainV1 as inspectTools,
} from './substrate-federated-authority-safe-devnet-build-environment-v1.js';

const roots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.mocked(lstatSync).mockClear();
  for (const root of roots.splice(0)) {
    const canonical = realpathSync.native(root);
    const quarantine = join(parse(canonical).root, 'A EFFACER');
    const retained = join(quarantine, basename(canonical));
    if (!basename(canonical).startsWith('e2s-native-')
        || lstatSync(root).isSymbolicLink() || existsSync(retained)) {
      throw new Error('unsafe native helper fixture quarantine');
    }
    mkdirSync(quarantine, { recursive: true });
    if (lstatSync(quarantine).isSymbolicLink()
        || !lstatSync(quarantine).isDirectory()) throw new Error('indirect fixture quarantine');
    renameSync(canonical, retained);
    expect(existsSync(root)).toBe(false); expect(existsSync(retained)).toBe(true);
  }
});

describe.skipIf(process.platform !== 'win32')('Frontier native MSVC host preflight', () => {
  function fixture() {
    const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'e2s-native-msvc-host-')));
    roots.push(root);
    const linkerDirectory = join(root, 'tools');
    mkdirSync(linkerDirectory);
    writeFileSync(join(linkerDirectory, 'link.exe'), 'regular fixture file');
    return {
      root,
      linkerDirectory,
      environment: {
        LIB: 'fixture-lib',
        LIBPATH: 'fixture-libpath',
        INCLUDE: 'fixture-include',
        Path: linkerDirectory,
      },
    };
  }

  it('accepts the complete discovery shape', () => {
    const { environment } = fixture();
    expect(() => assertSubstrateFederatedAuthoritySafeMsvcBuildHostV1(
      environment,
    )).not.toThrow();
  });

  it.each(['LIB', 'LIBPATH', 'INCLUDE'] as const)(
    'rejects missing %s with the other MSVC inputs present', key => {
      const { environment } = fixture();
      expect(() => assertSubstrateFederatedAuthoritySafeMsvcBuildHostV1({
        ...environment,
        [key]: '',
      })).toThrow(new RegExp(`Visual Studio ${key} environment`, 'u'));
    },
  );

  it('rejects a PATH without a linker even when the variables are present', () => {
    const { root, environment } = fixture();
    expect(() => assertSubstrateFederatedAuthoritySafeMsvcBuildHostV1({
      ...environment,
      Path: root,
    })).toThrow(/regular MSVC linker/iu);
  });

  it('rejects an absent PATH', () => {
    const { environment } = fixture();
    expect(() => assertSubstrateFederatedAuthoritySafeMsvcBuildHostV1({
      ...environment,
      Path: undefined,
    })).toThrow(/regular MSVC linker/iu);
  });

  it('rejects a relative PATH entry', () => {
    const { environment } = fixture();
    expect(() => assertSubstrateFederatedAuthoritySafeMsvcBuildHostV1({
      ...environment,
      Path: 'tools',
    })).toThrow(/regular MSVC linker/iu);
  });

  it('rejects a NUL-containing PATH entry', () => {
    const { linkerDirectory, environment } = fixture();
    expect(() => assertSubstrateFederatedAuthoritySafeMsvcBuildHostV1({
      ...environment,
      Path: `${linkerDirectory}\0`,
    })).toThrow(/regular MSVC linker/iu);
  });

  it('rejects a directory named link.exe', () => {
    const { root, environment } = fixture();
    const other = join(root, 'not-a-linker');
    mkdirSync(join(other, 'link.exe'), { recursive: true });
    expect(() => assertSubstrateFederatedAuthoritySafeMsvcBuildHostV1({
      ...environment,
      Path: other,
    })).toThrow(/regular MSVC linker/iu);
  });

  it('rejects a symlink named link.exe', () => {
    const { linkerDirectory, environment } = fixture();
    vi.mocked(lstatSync).mockReturnValueOnce({
      isFile: () => true,
      isSymbolicLink: () => true,
    } as ReturnType<typeof lstatSync>);
    expect(() => assertSubstrateFederatedAuthoritySafeMsvcBuildHostV1({
      ...environment,
      Path: linkerDirectory,
    })).toThrow(/regular MSVC linker/iu);
  });
});

const stateKeys = ['APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP'] as const;

function stateFixture() {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'e2s-native-helper-state-')));
  roots.push(root);
  const directory = (name: string) => {
    const value = join(root, name); mkdirSync(value, { recursive: true }); return value;
  };
  for (const key of stateKeys) vi.stubEnv(key, directory(`helper-state/${key}`));
  const systemRoot = directory('windows');
  vi.stubEnv('SystemRoot', systemRoot); vi.stubEnv('WINDIR', systemRoot);
  vi.stubEnv('SystemDrive', parse(systemRoot).root.replace(/[\\/]+$/u, ''));
  const tools = directory('tools'); vi.stubEnv('PATH', tools);
  const bridgeRoot = directory('bridge'); directory('bridge/sources');
  const lock = join(bridgeRoot, 'sources/native-verifier-toolchain-lock.json');
  copyFileSync(resolve(import.meta.dirname, '../../sources/native-verifier-toolchain-lock.json'), lock);
  const parsed = JSON.parse(readFileSync(lock, 'utf8')) as { profiles: Record<string,
    Record<'cargo' | 'rustc' | 'git', { version: string }>> };
  const profile = parsed.profiles[`${process.platform}-${process.arch}`]!;
  const executable = (name: 'cargo' | 'rustc' | 'git') => {
    const value = join(tools, `${name}.exe`); writeFileSync(value, 'fixture tool bytes'); return value;
  };
  const input = { bridgeRoot, cwd: directory('frontier'),
    cargoExecutablePath: executable('cargo'), rustcExecutablePath: executable('rustc'),
    gitExecutablePath: executable('git') };
  toolMocks.process.mockImplementation(async ({ executablePath }: { executablePath: string }) => ({
    stdout: `${profile[basename(executablePath, '.exe') as 'cargo' | 'rustc' | 'git'].version}\n`,
    stderr: '', exitCode: 0,
  }));
  toolMocks.validate.mockReturnValue({ errors: [] });
  return { root, input, systemRoot, tools };
}

describe.skipIf(process.platform !== 'win32')('Windows helper state forwarding', () => {
  it('uses one exact state whitelist for all three pinned tool probes', async () => {
    const f = stateFixture();
    for (const key of ['HOME', 'USERPROFILE', 'GIT_CONFIG_GLOBAL', 'GIT_DIR', 'NODE_OPTIONS',
      'PSModulePath']) vi.stubEnv(key, 'untrusted-parent-value');
    vi.stubEnv('TMP', process.env.TEMP);
    const expected = {
      ...Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']
        .filter(key => process.env[key]).map(key => [key, process.env[key]])),
      SystemRoot: f.systemRoot, WINDIR: f.systemRoot,
      SystemDrive: parse(f.systemRoot).root.replace(/[\\/]+$/u, ''),
      APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA,
    };
    expect(minimalEnvironment()).toEqual(expected);
    await inspectTools(f.input);
    expect(toolMocks.process).toHaveBeenCalledTimes(3);
    const environments = toolMocks.process.mock.calls.map(([input]) => input.env);
    expect(new Set(environments).size).toBe(1);
    for (const [input] of toolMocks.process.mock.calls) {
      expect(input.env).toEqual(expected); expect(input.args).toEqual(['--version']);
      expect(input.cwd).toBe(f.input.cwd); expect(input.timeoutMs).toBe(30_000);
      expect(input.maxOutputBytes).toBe(64 * 1024);
    }
    expect(toolMocks.validate).toHaveBeenCalledTimes(1);
  });

  it.each(stateKeys.flatMap(key => ['absent', 'empty', 'relative', 'nul', 'remote', 'missing',
    'file', 'junction', 'ancestor-junction', 'frontier', 'frontier-ancestor', 'bridge']
    .map(fault => [key, fault] as const)))
  ('rejects %s %s before any tool child', async (key, fault) => {
    const f = stateFixture(); let value: string | undefined;
    if (fault === 'empty') value = '';
    else if (fault === 'relative') value = 'relative-helper-state';
    else if (fault === 'nul') value = `${process.env[key]}\0`;
    else if (fault === 'remote') value = '//untrusted/share/helper-state';
    else if (fault === 'missing') value = join(f.root, 'missing-state');
    else if (fault === 'file') {
      value = join(f.root, 'state-file'); writeFileSync(value, 'not a directory');
    } else if (fault === 'junction' || fault === 'ancestor-junction') {
      const target = join(f.root, 'state-target'); mkdirSync(target);
      const alias = join(f.root, 'state-alias'); symlinkSync(target, alias, 'junction');
      if (fault === 'ancestor-junction') {
        mkdirSync(join(target, 'child')); value = join(alias, 'child');
      } else value = alias;
    } else if (fault === 'frontier') value = f.input.cwd;
    else if (fault === 'frontier-ancestor') value = dirname(f.input.cwd);
    else if (fault === 'bridge') value = f.input.bridgeRoot;
    const nativeEnvironment = process.env;
    const environmentDescriptor = Object.getOwnPropertyDescriptor(process, 'env');
    if (!environmentDescriptor) throw new Error('process.env descriptor is unavailable');
    try {
      if (fault === 'nul') {
        const plainEnvironment: NodeJS.ProcessEnv = { ...nativeEnvironment };
        for (const alias of [...stateKeys, 'SystemDrive', 'SYSTEMDRIVE',
          'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'PATH', 'Path']) {
          const inherited = nativeEnvironment[alias];
          if (inherited !== undefined) plainEnvironment[alias] = inherited;
        }
        for (const required of [...stateKeys, 'SystemDrive', 'SystemRoot', 'PATH']) {
          expect(plainEnvironment[required]).toBe(nativeEnvironment[required]);
          expect(plainEnvironment[required]).toBeTypeOf('string');
          expect(plainEnvironment[required]).not.toBe('');
        }
        plainEnvironment[key] = value;
        Object.defineProperty(process, 'env', {
          ...environmentDescriptor, value: plainEnvironment,
        });
        expect(process.env[key]).toBe(value);
        expect(process.env[key]).toContain('\0');
      } else vi.stubEnv(key, value);
      if (fault === 'nul') {
        await expect(inspectTools(f.input)).rejects.toThrow(new RegExp(
          '^Windows helper ' + key + ' must be one local absolute directory$', 'u'));
      } else await expect(inspectTools(f.input)).rejects.toThrow();
      expect(toolMocks.process).not.toHaveBeenCalled();
      expect(toolMocks.validate).not.toHaveBeenCalled();
    } finally {
      if (fault === 'nul') {
        Object.defineProperty(process, 'env', environmentDescriptor);
        expect(process.env).toBe(nativeEnvironment);
      }
    }
  });

  it.each(stateKeys)('rejects public minimal-environment %s inside its current checkout', key => {
    stateFixture(); vi.stubEnv(key, process.cwd());
    expect(() => minimalEnvironment()).toThrow(/outside protected source/);
    expect(toolMocks.process).not.toHaveBeenCalled();
  });
});

it.skipIf(process.platform === 'win32')('preserves the non-Windows minimal environment', () => {
  for (const key of stateKeys) vi.stubEnv(key, 'not-a-directory');
  const expected = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']
    .filter(key => process.env[key]).map(key => [key, process.env[key]]));
  expect(minimalEnvironment()).toEqual(expected);
});
