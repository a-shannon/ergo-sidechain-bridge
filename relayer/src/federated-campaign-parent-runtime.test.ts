import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  bytes: new Map<string, Buffer>(),
  directories: new Map<string, { name: string; isFile: () => boolean;
    isDirectory: () => boolean; isSymbolicLink: () => boolean }[]>(),
  missing: new Set<string>(),
  links: new Set<string>(),
  git: vi.fn(),
}));

vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  execFileSync: fixture.git,
}));
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const isVirtual = (name: string) => fixture.bytes.has(name) || fixture.directories.has(name);
  return {
    ...actual,
    readFileSync: (name: string, options?: unknown) => {
      const bytes = fixture.bytes.get(String(name));
      if (!bytes) return actual.readFileSync(name, options as never);
      return typeof options === 'string' ? bytes.toString(options as BufferEncoding) : bytes;
    },
    realpathSync: (name: string) => {
      if (fixture.missing.has(name)) throw new Error('fixture missing path');
      return isVirtual(name) ? name : actual.realpathSync(name);
    },
    existsSync: (name: string) => !fixture.missing.has(name)
      && (isVirtual(name) || actual.existsSync(name)),
    statSync: (name: string) => isVirtual(name) ? {
      isFile: () => fixture.bytes.has(name),
      isDirectory: () => fixture.directories.has(name),
    } : actual.statSync(name),
    lstatSync: (name: string) => fixture.links.has(name) ? {
      isSymbolicLink: () => true,
    } : actual.lstatSync(name),
    readdirSync: (name: string, options?: unknown) => fixture.directories.get(name)
      ?? actual.readdirSync(name, options as never),
  };
});

import {
  validateAuthenticatedV2RuntimeBundleBuildParent,
  validatePinnedFederatedCampaignParentRuntime,
} from './authenticated-v2-runtime-bundle.js';
import {
  resolveAuthenticatedV2CompilerRuntimeBuildInputs,
  validatePinnedAuthenticatedV2CompilerHost,
} from './authenticated-v2-source-tree-conformance.js';

const root = path.resolve(process.cwd(), '..');
const compilerLockPath = path.join(root, 'sources', 'authenticated-v2-compiler-lock.json');
const loaderLockPath = path.join(root, 'sources', 'authenticated-v2-runtime-bundle-build-lock-v2.json');
const originalCompiler = JSON.parse(readFileSync(compilerLockPath, 'utf8'));
const originalLoader = JSON.parse(readFileSync(loaderLockPath, 'utf8'));
const tools = path.join(root, 'synthetic-parent-tools');
const node = path.join(tools, 'node.exe');
const git = path.join(tools, 'git.exe');
const properties = ['version', 'execPath', 'execArgv', 'platform', 'arch'] as const;
const descriptors = Object.fromEntries(properties.map(key => [key, Object.getOwnPropertyDescriptor(process, key)!]));
const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const argv = () => ['--require', path.join(root, 'relayer/node_modules/tsx/dist/preflight.cjs'),
  '--import', pathToFileURL(path.join(root, 'relayer/node_modules/tsx/dist/loader.mjs')).href];
const replaceProperty = (name: typeof properties[number], value: unknown) =>
  Object.defineProperty(process, name, { ...descriptors[name], value });
const writeJson = (name: string, value: unknown) => fixture.bytes.set(name, Buffer.from(JSON.stringify(value)));

beforeEach(() => {
  fixture.bytes.clear();
  fixture.directories.clear();
  fixture.missing.clear();
  fixture.links.clear();
  fixture.git.mockReset().mockReturnValue(`git version ${originalCompiler.gitVersion}\n`);
  const compiler = structuredClone(originalCompiler);
  const loader = structuredClone(originalLoader);
  fixture.bytes.set(node, Buffer.from('synthetic pinned Node'));
  fixture.bytes.set(git, Buffer.from('synthetic pinned Git'));
  compiler.nodeExecutableSha256 = sha(fixture.bytes.get(node)!);
  compiler.gitExecutableSha256 = sha(fixture.bytes.get(git)!);
  loader.nodeExecutableSha256 = sha(fixture.bytes.get(node)!);
  for (const entry of loader.parentRuntimePackages) {
    const directory = path.join(root, entry.path);
    fixture.directories.set(directory, [{ name: 'package.js', isFile: () => true,
      isDirectory: () => false, isSymbolicLink: () => false }]);
    const bytes = Buffer.from(`synthetic ${entry.path}`);
    fixture.bytes.set(path.join(directory, 'package.js'), bytes);
    entry.sha256 = sha(`package.js:${sha(bytes)}`);
  }
  writeJson(compilerLockPath, compiler);
  writeJson(loaderLockPath, loader);
  replaceProperty('version', 'v24.14.0');
  replaceProperty('execPath', node);
  replaceProperty('execArgv', argv());
  replaceProperty('platform', 'win32');
  replaceProperty('arch', 'x64');
  vi.stubEnv('PATH', tools);
  for (const name of loader.forbiddenParentEnvironmentOverrides) vi.stubEnv(name, '');
});
afterEach(() => {
  for (const key of properties) Object.defineProperty(process, key, descriptors[key]);
  vi.unstubAllEnvs();
});

describe('fixed FED campaign host and loader composition', () => {
  it('joins the compiler Node and Git to current packages without claiming bundle-build Node', () => {
    const runtime = validatePinnedFederatedCampaignParentRuntime(root);
    expect(runtime).toEqual({ nodeVersion: '24.14.0', nodeExecutableSha256: sha(fixture.bytes.get(node)!),
      gitVersion: originalCompiler.gitVersion, gitExecutableSha256: sha(fixture.bytes.get(git)!),
      gitExecutablePath: git, gitEnvironmentSanitized: true,
      relayerPackageLockSha256: originalLoader.relayerPackageLockSha256,
      parentRuntimePackagesValidated: true, loaderInvocationValidated: true });
    expect(Object.isFrozen(runtime)).toBe(true);
    expect(fixture.git).toHaveBeenCalledWith(git, ['--version'], expect.objectContaining({
      env: { PATH: tools, SystemRoot: process.env.SystemRoot, SYSTEMROOT: process.env.SYSTEMROOT },
    }));
    expect(validatePinnedAuthenticatedV2CompilerHost(root)).not.toHaveProperty('loaderInvocationValidated');
  });

  it('keeps both historical full validators on their own runtime requirements', () => {
    expect(() => resolveAuthenticatedV2CompilerRuntimeBuildInputs(root)).toThrow('package lock does not match the compiler lock');
    expect(() => validateAuthenticatedV2RuntimeBundleBuildParent(root)).toThrow('Node version does not match');
    replaceProperty('version', 'v24.18.1');
    expect(validateAuthenticatedV2RuntimeBundleBuildParent(root).nodeVersion).toBe('24.18.1');
    expect(() => validatePinnedFederatedCampaignParentRuntime(root)).toThrow('Node version does not match the compiler lock');
    expect(() => resolveAuthenticatedV2CompilerRuntimeBuildInputs(root)).toThrow('Node version does not match the compiler lock');
  });

  it('rejects a different Node executable even at the required version', () => {
    fixture.bytes.set(node, Buffer.from('foreign Node'));
    expect(() => validatePinnedFederatedCampaignParentRuntime(root)).toThrow('Node executable does not match');
    expect(fixture.git).not.toHaveBeenCalled();
  });
  it('rejects a different platform before inspecting Git', () => {
    replaceProperty('arch', 'arm64');
    expect(() => validatePinnedFederatedCampaignParentRuntime(root)).toThrow('platform does not match');
    expect(fixture.git).not.toHaveBeenCalled();
  });
  it.each(originalLoader.forbiddenParentEnvironmentOverrides as string[])('rejects override %s', name => {
    vi.stubEnv(name, 'unreviewed');
    expect(() => validatePinnedFederatedCampaignParentRuntime(root)).toThrow('forbidden environment override');
    expect(fixture.git).not.toHaveBeenCalled();
  });
  it('rejects package-lock drift before inspecting Git', () => {
    fixture.bytes.set(path.join(root, 'relayer/package-lock.json'), Buffer.from('{}'));
    expect(() => validatePinnedFederatedCampaignParentRuntime(root)).toThrow('package lock does not match');
    expect(fixture.git).not.toHaveBeenCalled();
  });
  it.each((originalLoader.parentRuntimePackages as { path: string }[]).flatMap(entry =>
    ['missing', 'changed', 'linked'].map(kind => [entry.path, kind] as const)))(
    'rejects package %s when %s', (name, kind) => {
      const directory = path.join(root, name);
      if (kind === 'missing') fixture.missing.add(directory);
      if (kind === 'changed') fixture.bytes.set(path.join(directory, 'package.js'), Buffer.from('changed package'));
      if (kind === 'linked') fixture.links.add(directory);
      expect(() => validatePinnedFederatedCampaignParentRuntime(root)).toThrow(
        kind === 'missing' ? 'fixture missing path' : 'does not match the lock',
      );
      expect(fixture.git).not.toHaveBeenCalled();
    },
  );
  it('rejects an aliased node_modules root', () => {
    fixture.links.add(path.join(root, 'relayer/node_modules'));
    expect(() => validatePinnedFederatedCampaignParentRuntime(root)).toThrow('must not be an alias');
    expect(fixture.git).not.toHaveBeenCalled();
  });
  it('rejects a linked file inside an otherwise pinned package', () => {
    fixture.directories.get(path.join(root, originalLoader.parentRuntimePackages[0].path))![0]!.isSymbolicLink = () => true;
    expect(() => validatePinnedFederatedCampaignParentRuntime(root)).toThrow('must not contain symbolic links');
    expect(fixture.git).not.toHaveBeenCalled();
  });
  it.each([0, 1, 2, 3])('rejects substitution of loader argument %i', index => {
    const changed = argv();
    changed[index] = 'unreviewed';
    replaceProperty('execArgv', changed);
    expect(() => validatePinnedFederatedCampaignParentRuntime(root)).toThrow('tsx invocation does not match');
    expect(fixture.git).not.toHaveBeenCalled();
  });
  it('rejects extra loader arguments', () => {
    replaceProperty('execArgv', [...argv(), '--eval']);
    expect(() => validatePinnedFederatedCampaignParentRuntime(root)).toThrow('tsx invocation does not match');
  });
  it.each(['missing', 'hash', 'version'])('rejects Git %s drift', kind => {
    if (kind === 'missing') fixture.missing.add(git);
    if (kind === 'hash') fixture.bytes.set(git, Buffer.from('foreign Git'));
    if (kind === 'version') fixture.git.mockReturnValue('git version foreign');
    expect(() => validatePinnedFederatedCampaignParentRuntime(root)).toThrow('no Git executable matches');
    if (kind !== 'version') expect(fixture.git).not.toHaveBeenCalled();
  });
  it.each(['buildPath', 'sbtPropertiesPath', 'toolPath'])('retains compiler project binding for %s', field => {
    fixture.bytes.set(path.join(root, originalCompiler[field]), Buffer.from('changed compiler source'));
    expect(() => validatePinnedFederatedCampaignParentRuntime(root)).toThrow('SHA-256');
    expect(fixture.git).not.toHaveBeenCalled();
  });
  it('retains the historical compiler consensus binding', () => {
    fixture.bytes.set(path.join(root, 'sources/authenticated-v2-compiler-consensus-source-lock-v1.json'), Buffer.from('{}'));
    expect(() => validatePinnedFederatedCampaignParentRuntime(root)).toThrow('historical compiler consensus source lock does not match');
    expect(fixture.git).not.toHaveBeenCalled();
  });
});
