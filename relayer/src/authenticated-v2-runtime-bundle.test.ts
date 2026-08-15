import { createHash } from 'node:crypto';
import type { SpawnSyncReturns } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  AUTHENTICATED_V2_RUNTIME_BUNDLE_BUILD_PROFILE,
  AUTHENTICATED_V2_RUNTIME_BUNDLE_BUILD_PARENT_LOCK_SCHEMA,
  buildAuthenticatedV2RuntimeBundlePlan,
  hashAuthenticatedV2RuntimeBundlePackageLock,
  prepareAuthenticatedV2RuntimeBundle,
  validateAuthenticatedV2RuntimeBundleBuildParentLock,
  validatePinnedSbtLauncherBytes,
} from './authenticated-v2-runtime-bundle.js';

const BRIDGE_ROOT = path.resolve(process.cwd(), '..');
const TOOL_ROOT = path.join(BRIDGE_ROOT, 'relayer', 'tools', 'authenticated-v2-compiler');
const DRIVE_ROOT = path.parse(process.cwd()).root;
const JAVA_HOME = path.join(DRIVE_ROOT, 'synthetic-runtime', 'jdk');
const SCRATCH_ROOT = path.join(DRIVE_ROOT, 'synthetic-runtime', 'scratch');
const LAUNCHER_PATH = path.join(SCRATCH_ROOT, 'sbt-launch-1.11.1.jar');
const SYSTEM_ROOT = path.join(DRIVE_ROOT, 'Windows');

function successfulSpawn(): SpawnSyncReturns<Buffer> {
  return {
    pid: 1,
    output: [],
    stdout: Buffer.alloc(0),
    stderr: Buffer.alloc(0),
    status: 0,
    signal: null,
  };
}

describe('authenticated V2 runtime bundle preparation', () => {
  it('uses a separate exact parent lock for current bundle orchestration', () => {
    const lockPath = path.resolve(
      BRIDGE_ROOT,
      'sources',
      'authenticated-v2-runtime-bundle-build-lock-v2.json',
    );
    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as Record<string, unknown>;
    const validated = validateAuthenticatedV2RuntimeBundleBuildParentLock(lock);
    expect(validated.schema).toBe(
      AUTHENTICATED_V2_RUNTIME_BUNDLE_BUILD_PARENT_LOCK_SCHEMA,
    );
    expect(validated.nodeVersion).toBe('24.18.1');
    expect(
      hashAuthenticatedV2RuntimeBundlePackageLock(
        readFileSync(path.resolve(BRIDGE_ROOT, 'relayer', 'package-lock.json')),
      ),
    ).toBe(validated.relayerPackageLockSha256);
    expect(hashAuthenticatedV2RuntimeBundlePackageLock(Buffer.from('locked\r\nbytes\r\n'))).toBe(
      hashAuthenticatedV2RuntimeBundlePackageLock(Buffer.from('locked\nbytes\n')),
    );
    expect(() => hashAuthenticatedV2RuntimeBundlePackageLock(Buffer.from('locked\rbytes'))).toThrow(
      'unsupported carriage return',
    );
    expect(validated.parentRuntimePackages.map(entry => entry.path)).toEqual([
      'relayer/node_modules/tsx',
      'relayer/node_modules/esbuild',
      'relayer/node_modules/@esbuild/win32-x64',
    ]);
    expect(() => validateAuthenticatedV2RuntimeBundleBuildParentLock({
      ...lock,
      nodeVersion: '24.18.2',
    })).toThrow('Node version is unsupported');
    expect(() => validateAuthenticatedV2RuntimeBundleBuildParentLock({
      ...lock,
      parentRuntimePackages: validated.parentRuntimePackages.slice(0, 2),
    })).toThrow('package set is incomplete');
  });

  it('isolates every resolver and JVM configuration surface from the parent environment', () => {
    const plan = buildAuthenticatedV2RuntimeBundlePlan({
      toolRoot: TOOL_ROOT,
      javaHome: JAVA_HOME,
      launcherPath: LAUNCHER_PATH,
      scratchRoot: SCRATCH_ROOT,
      parentEnvironment: {
        SystemRoot: SYSTEM_ROOT,
        JAVA_OPTS: '-javaagent:unreviewed.jar',
        SBT_OPTS: '-Dunreviewed=true',
        COURSIER_CREDENTIALS: 'unreviewed',
        SBT_CREDENTIALS: 'unreviewed',
        PATHEXT: 'unreviewed',
        PATH: 'unreviewed',
      },
    });

    expect(plan.env.JAVA_HOME).toBe(path.resolve(JAVA_HOME));
    expect(plan.env.USERPROFILE).toBe(path.join(path.resolve(SCRATCH_ROOT), 'home'));
    expect(plan.env.COURSIER_CACHE).toBe(path.join(path.resolve(SCRATCH_ROOT), 'coursier'));
    expect(plan.env.JAVA_OPTS).toBeUndefined();
    expect(plan.env.SBT_OPTS).toBeUndefined();
    expect(plan.env.COURSIER_CREDENTIALS).toBeUndefined();
    expect(plan.env.SBT_CREDENTIALS).toBeUndefined();
    expect(plan.env.COMSPEC).toBeUndefined();
    expect(plan.env.PATHEXT).toBe('.COM;.EXE;.BAT;.CMD');
    expect(plan.env.PATH).not.toContain('unreviewed');
  });

  it('uses isolated sbt, boot, local-cache, Ivy, and Coursier directories', () => {
    const plan = buildAuthenticatedV2RuntimeBundlePlan({
      toolRoot: TOOL_ROOT,
      javaHome: JAVA_HOME,
      launcherPath: LAUNCHER_PATH,
      scratchRoot: SCRATCH_ROOT,
      parentEnvironment: { SystemRoot: SYSTEM_ROOT },
    });

    expect(plan.args).toEqual([
      '-Dfile.encoding=UTF-8',
      '-Dsbt.ci=true',
      '-Dsbt.io.virtual=false',
      '-Dsbt.log.noformat=true',
      '-Dsbt.server.autostart=false',
      '-Dsbt.supershell=false',
      `-Dsbt.global.base=${path.join(path.resolve(SCRATCH_ROOT), 'sbt-global')}`,
      `-Dsbt.boot.directory=${path.join(path.resolve(SCRATCH_ROOT), 'sbt-boot')}`,
      `-Dsbt.global.localcache=${path.join(path.resolve(SCRATCH_ROOT), 'sbt-cache')}`,
      `-Dsbt.ivy.home=${path.join(path.resolve(SCRATCH_ROOT), 'ivy')}`,
      '-jar',
      path.resolve(LAUNCHER_PATH),
      'clean',
      'runtimeBundle',
    ]);
    expect(plan.javaExecutable).toBe(path.join(path.resolve(JAVA_HOME), 'bin', 'java.exe'));
    expect(plan.isolatedDirectories).toContain(plan.env.COURSIER_CACHE);
  });

  it('rejects any launcher bytes outside the reviewed size and SHA-256', () => {
    const reviewed = Buffer.from('reviewed launcher');
    const reviewedSha256 = createHash('sha256').update(reviewed).digest('hex');

    expect(() => validatePinnedSbtLauncherBytes(
      reviewed,
      reviewedSha256,
      reviewed.length,
    )).not.toThrow();
    expect(() => validatePinnedSbtLauncherBytes(
      Buffer.from('mutated launcher'),
      reviewedSha256,
      reviewed.length,
    )).toThrow('pinned sbt launcher does not match the reviewed bytes');
  });

  it('validates the exact generated bundle before reporting success and always removes scratch state', async () => {
    const events: string[] = [];
    const removeScratchRoot = vi.fn(() => events.push('cleanup'));
    const launcherBytes = Buffer.from('reviewed launcher');
    const result = await prepareAuthenticatedV2RuntimeBundle(BRIDGE_ROOT, {
      resolveBuildInputs: () => ({
        toolRoot: TOOL_ROOT,
        runtimeBundlePath: path.join(TOOL_ROOT, 'target', 'locked-runtime'),
        runtimeBundleSha256: 'ab'.repeat(32),
        javaHome: JAVA_HOME,
      }),
      createScratchRoot: () => SCRATCH_ROOT,
      createDirectory: () => undefined,
      fetchLauncher: async () => {
        events.push('fetch-launcher');
        return launcherBytes;
      },
      validateLauncher: () => events.push('validate-launcher'),
      writeLauncher: () => events.push('write-launcher'),
      readLauncher: () => {
        events.push('read-launcher');
        return launcherBytes;
      },
      runSbt: (executable, args) => {
        expect(executable).toBe(path.join(path.resolve(JAVA_HOME), 'bin', 'java.exe'));
        expect(args).toContain(path.resolve(LAUNCHER_PATH));
        events.push('build');
        return successfulSpawn();
      },
      validateRuntimeBundle: () => {
        events.push('validate');
        return {
          runtimeBundlePath: path.join(TOOL_ROOT, 'target', 'locked-runtime'),
          runtimeBundleSha256: 'ab'.repeat(32),
        };
      },
      removeScratchRoot,
    });

    expect(events).toEqual([
      'fetch-launcher',
      'validate-launcher',
      'write-launcher',
      'build',
      'read-launcher',
      'validate-launcher',
      'validate',
      'cleanup',
    ]);
    expect(result).toEqual({
      profile: AUTHENTICATED_V2_RUNTIME_BUNDLE_BUILD_PROFILE,
      runtimeBundleSha256: 'ab'.repeat(32),
      isolatedBuild: true,
    });
    expect(removeScratchRoot).toHaveBeenCalledWith(SCRATCH_ROOT);
  });

  it('fails closed before bundle validation when the isolated build fails', async () => {
    const validateRuntimeBundle = vi.fn();
    const removeScratchRoot = vi.fn();
    const launcherBytes = Buffer.from('reviewed launcher');

    await expect(prepareAuthenticatedV2RuntimeBundle(BRIDGE_ROOT, {
      resolveBuildInputs: () => ({
        toolRoot: TOOL_ROOT,
        runtimeBundlePath: path.join(TOOL_ROOT, 'target', 'locked-runtime'),
        runtimeBundleSha256: 'ab'.repeat(32),
        javaHome: JAVA_HOME,
      }),
      createScratchRoot: () => SCRATCH_ROOT,
      createDirectory: () => undefined,
      fetchLauncher: async () => launcherBytes,
      validateLauncher: () => undefined,
      writeLauncher: () => undefined,
      readLauncher: () => launcherBytes,
      runSbt: () => ({
        ...successfulSpawn(),
        status: 1,
      }),
      validateRuntimeBundle,
      removeScratchRoot,
    })).rejects.toThrow('isolated runtime bundle build failed with exit code 1');
    expect(validateRuntimeBundle).not.toHaveBeenCalled();
    expect(removeScratchRoot).toHaveBeenCalledWith(SCRATCH_ROOT);
  });

  it('keeps the heavy clean-checkout gate separate from the ordinary edit loop', () => {
    const packageJson = JSON.parse(
      readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    const plan = readFileSync(
      path.resolve(BRIDGE_ROOT, 'phases', 'bridge-execution-plan.md'),
      'utf8',
    );
    const standaloneWorkflow = readFileSync(
      path.resolve(BRIDGE_ROOT, '.github', 'workflows', 'relayer-checks.yml'),
      'utf8',
    );
    const superprojectWorkflowPath = path.resolve(
      BRIDGE_ROOT,
      '..',
      '.github',
      'workflows',
      'bridge-consensus-sources.yml',
    );
    const attributes = readFileSync(path.resolve(BRIDGE_ROOT, '.gitattributes'), 'utf8');

    expect(packageJson.scripts['compiler:runtime-bundle']).toContain(
      'prepare-authenticated-v2-runtime-bundle.ts',
    );
    expect(packageJson.scripts['clean-checkout:solidity']).toBe(
      'npm --prefix ../solidity ci --ignore-scripts --include=dev',
    );
    expect(packageJson.scripts['check:clean-checkout']).toBe(
      'tsx src/scripts/check-clean-checkout.ts',
    );
    expect(packageJson.scripts.check).not.toContain('compiler:runtime-bundle');
    expect(plan).toContain('npm.cmd run check:clean-checkout');
    expect(
      standaloneWorkflow.match(/^\s+- "\.gitattributes"$/gm),
    ).toHaveLength(2);
    expect(
      standaloneWorkflow.match(/^\s+- "relayer\/\*\*"$/gm),
    ).toHaveLength(2);
    expect(standaloneWorkflow).toContain('npm ci --ignore-scripts --include=dev');
    expect(standaloneWorkflow).toContain('node-version: "24.18.1"');
    expect(standaloneWorkflow).toContain('& $npm run audit:alpha');

    if (existsSync(superprojectWorkflowPath)) {
      const superprojectWorkflow = readFileSync(superprojectWorkflowPath, 'utf8');
      expect(
        superprojectWorkflow.match(/relayer\/src\/authenticated-v2-runtime-bundle\*/g),
      ).toHaveLength(2);
      expect(
        superprojectWorkflow.match(
          /relayer\/src\/scripts\/prepare-authenticated-v2-runtime-bundle\.ts/g,
        ),
      ).toHaveLength(2);
      expect(
        superprojectWorkflow.match(/^\s+- "\.gitattributes"$/gm),
      ).toHaveLength(2);
      expect(
        superprojectWorkflow.match(
          /^\s+- "ergo-sidechain-bridge\/\.gitattributes"$/gm,
        ),
      ).toHaveLength(2);
      expect(superprojectWorkflow).toContain('npm ci --ignore-scripts --include=dev');
      expect(superprojectWorkflow).toContain('Setup runtime-bundle Node.js');
      expect(superprojectWorkflow).toContain('node-version: "24.18.1"');
      expect(superprojectWorkflow).toContain('Restore compiler Node.js');
    }
    expect(attributes).toContain(
      'sources/authenticated-v2-compiler-consensus-source-lock-v1.json text eol=lf',
    );
  });
});
