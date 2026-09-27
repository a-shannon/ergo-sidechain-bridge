import { lstatSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, lstatSync: vi.fn(actual.lstatSync) };
});

import {
  assertSubstrateFederatedAuthoritySafeMsvcBuildHostV1,
} from './substrate-federated-authority-safe-devnet-build-environment-v1.js';

const roots: string[] = [];

afterEach(() => {
  vi.mocked(lstatSync).mockClear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(process.platform !== 'win32')('Frontier native MSVC host preflight', () => {
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'e2s-native-msvc-host-'));
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
