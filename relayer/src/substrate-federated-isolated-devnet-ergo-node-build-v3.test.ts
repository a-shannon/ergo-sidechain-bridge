import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertSubstrateFederatedIsolatedDevnetErgoNodeBuildOutputReadyV3,
  assertSubstrateFederatedIsolatedDevnetWindowsJobProcessRunnerV3,
  buildSubstrateFederatedIsolatedDevnetErgoNodeV3,
  inspectSubstrateFederatedIsolatedDevnetErgoNodeBuildLockV3,
} from './substrate-federated-isolated-devnet-ergo-node-build-v3.js';

const bridgeRoot = resolve(import.meta.dirname, '..', '..');
const lockName = 'substrate-federated-isolated-devnet-node-build-lock-v3.json';
const temporaryDirectories: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'bridge-ergo-build-v3-'));
  temporaryDirectories.push(root);
  mkdirSync(join(root, 'sources'));
  return root;
}

function originalLock(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(bridgeRoot, 'sources', lockName), 'utf8')) as Record<string, unknown>;
}

function writeFixtureLock(root: string, lock: Record<string, unknown>): void {
  writeFileSync(join(root, 'sources', lockName), JSON.stringify(lock));
}

describe('isolated devnet Ergo node build V3 source boundary', () => {
  afterEach(() => {
    for (const root of temporaryDirectories.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts the exact V3 lock with file-repository override and unchanged bounded runner', () => {
    const lock = inspectSubstrateFederatedIsolatedDevnetErgoNodeBuildLockV3(bridgeRoot);
    expect(lock.schemaVersion).toBe(3);
    expect(lock.kind).toBe('substrate-federated-isolated-devnet-node-build-lock-v3');
    expect(lock.javaSystemProperties).toEqual([
      '-Dsbt.offline=true',
      '-Dsbt.server.autostart=false',
      '-Dsbt.override.build.repos=true',
      '-Djava.net.useSystemProxies=false',
    ]);
    expect(lock.coursierMode).toBe('offline');
    expect(lock.sbtLauncherRepositoriesFileTemplate).toBe(
      '[repositories]\n  bridge-maven-central-cache: {{MAVEN_CENTRAL_CACHE_URI}}\n  bridge-empty-offline: {{EMPTY_REPOSITORY_URI}}, bootOnly\n',
    );
    expect(lock.isolatedSbtStateDirectory).toBe('target/bridge-sbt-state-v3');
    expect(lock.buildProcessRunner).toBe('reviewed-windows-job-object-v1');
    expect(lock.buildTimeoutMs).toBe(900_000);
    expect(lock.buildTerminationGraceMs).toBe(10_000);
    expect(lock.buildMaxOutputBytes).toBe(33_554_432);
    expect(() => assertSubstrateFederatedIsolatedDevnetWindowsJobProcessRunnerV3(
      resolve(import.meta.dirname, 'scripts', 'windows-job-process.ps1'),
      lock.windowsJobProcessRunnerSha256Hex,
    )).not.toThrow();
  });

  it('rejects the historical false override rather than silently reusing the V1 lock', () => {
    const root = fixtureRoot();
    const lock = originalLock();
    lock.javaSystemProperties = [
      '-Dsbt.offline=true',
      '-Dsbt.server.autostart=false',
      '-Dsbt.override.build.repos=false',
      '-Djava.net.useSystemProxies=false',
    ];
    writeFixtureLock(root, lock);
    expect(() => inspectSubstrateFederatedIsolatedDevnetErgoNodeBuildLockV3(root))
      .toThrow(/constants differ from V3/);
  });

  it.each([
    ['online Coursier', 'coursierMode', 'online'],
    ['remote repositories', 'sbtLauncherRepositoriesFileTemplate', '[repositories]\n  remote: https://repo1.maven.org/maven2\n'],
    ['different dependency cache', 'hostCoursierCacheDirectoryRelativeToLocalAppData', 'Coursier/cache/unreviewed'],
  ])('rejects %s before any build', (_label, field, value) => {
    const root = fixtureRoot();
    const lock = originalLock();
    lock[field] = value;
    writeFixtureLock(root, lock);
    expect(() => inspectSubstrateFederatedIsolatedDevnetErgoNodeBuildLockV3(root))
      .toThrow(/constants differ from V3/);
  });

  it('rejects source-lock drift before Java or sbt is invoked', async () => {
    const root = fixtureRoot();
    writeFixtureLock(root, originalLock());
    writeFileSync(join(root, 'sources', 'consensus-source-lock.json'), '{}\n');
    const placeholder = join(root, 'placeholder.bin');
    writeFileSync(placeholder, 'placeholder');
    await expect(buildSubstrateFederatedIsolatedDevnetErgoNodeV3({
      worktreeRoot: root,
      bridgeRoot: root,
      ergoSourcePath: root,
      gitExecutablePath: placeholder,
      javaExecutablePath: placeholder,
      sbtLauncherJarPath: placeholder,
    })).rejects.toThrow(/consensus source lock differs from the node build lock/);
  });

  it('rejects a pre-existing assembly and isolated sbt state', () => {
    const root = fixtureRoot();
    writeFixtureLock(root, originalLock());
    const ergo = join(root, 'ergo');
    mkdirSync(ergo);
    expect(() => assertSubstrateFederatedIsolatedDevnetErgoNodeBuildOutputReadyV3(root, ergo))
      .not.toThrow();
    const assemblyDirectory = join(ergo, 'target', 'scala-2.12');
    mkdirSync(assemblyDirectory, { recursive: true });
    writeFileSync(join(assemblyDirectory, 'ergo-old.jar'), 'old');
    expect(() => assertSubstrateFederatedIsolatedDevnetErgoNodeBuildOutputReadyV3(root, ergo))
      .toThrow(/assembly-free output directory/);

    const secondErgo = join(root, 'second-ergo');
    mkdirSync(join(secondErgo, 'target', 'bridge-sbt-state-v3'), { recursive: true });
    expect(() => assertSubstrateFederatedIsolatedDevnetErgoNodeBuildOutputReadyV3(root, secondErgo))
      .toThrow(/isolated sbt state directory must not pre-exist/);
  });
});
