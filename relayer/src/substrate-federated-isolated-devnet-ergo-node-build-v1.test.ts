import { createHash } from 'node:crypto';
import {
  linkSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertSubstrateFederatedIsolatedDevnetErgoNodeAssemblyDirectoryReadyV1,
  assertSubstrateFederatedIsolatedDevnetWindowsJobProcessRunnerV1,
  buildSubstrateFederatedIsolatedDevnetErgoNodeV1,
  inspectSubstrateFederatedIsolatedDevnetErgoNodeAssemblyFileV1,
  inspectSubstrateFederatedIsolatedDevnetErgoNodeBuildLockV1,
} from './substrate-federated-isolated-devnet-ergo-node-build-v1.js';

const bridgeRoot = resolve(import.meta.dirname, '..', '..');
const temporaryDirectories: string[] = [];

describe('isolated devnet Ergo node build V1', () => {
  afterEach(() => {
    for (const path of temporaryDirectories.splice(0)) {
      rmSync(path, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  it('loads the exact path-free Windows build lock', () => {
    const lock = inspectSubstrateFederatedIsolatedDevnetErgoNodeBuildLockV1(
      bridgeRoot,
    );
    expect(lock).toEqual({
      schemaVersion: 1,
      kind: 'substrate-federated-isolated-devnet-node-build-lock',
      platform: 'win32-x64',
      consensusSourceLockSha256Hex:
        '7599111d2129ee5177dda236ef96e8beb1b1e33b42745d9607cb525c0a7795c8',
      ergoNodeBaseCommit: '2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1',
      ergoPatchSha256Hex:
        '31b27cf9acd7ad6d7c05282d964f51be15b5aa78767b354f8f29ee28d39ebf23',
      gitExecutableSha256Hex:
        '81ef35ae005ca9318018d18e3327578ce939fb99feaad6b2d7c8ab15f3de8db5',
      javaHomeSha256Hex:
        '43ddaddbc9c892eebb9017eaadd292a0198a3262941f061de61ab03db283dd7e',
      sbtLauncherJarSha256Hex:
        'b4c0c55d68f11b1510d884641cb1b1456191dac40ddc958bf86c825adc344e16',
      projectSbtVersion: '1.11.1',
      buildProcessRunner: 'reviewed-windows-job-object-v1',
      windowsJobProcessRunnerSha256Hex:
        'c7ab6ff55e275eb4e1298b1bcc6ce57d1e7cb7b0f0eb4c47f41c61f3895f9f6e',
      buildTimeoutMs: 900_000,
      buildTerminationGraceMs: 10_000,
      buildMaxOutputBytes: 33_554_432,
    });
    expect(JSON.stringify(lock)).not.toMatch(/[A-Za-z]:[\\/]/u);
  });

  it('rejects every pre-existing assembly name regardless of entry type or size', () => {
    const regularOutput = ownedAssemblyDirectory();
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetErgoNodeAssemblyDirectoryReadyV1(
        regularOutput,
      )
    ).not.toThrow();
    writeFileSync(join(regularOutput, 'ergo-undersized.jar'), 'x');
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetErgoNodeAssemblyDirectoryReadyV1(
        regularOutput,
      )
    ).toThrow(/assembly-free output directory/);

    const hardlinkOutput = ownedAssemblyDirectory();
    const hardlinkSource = join(ownedDirectory(), 'outside.jar');
    writeFileSync(hardlinkSource, 'hardlink target');
    linkSync(hardlinkSource, join(hardlinkOutput, 'ergo-hardlink.jar'));
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetErgoNodeAssemblyDirectoryReadyV1(
        hardlinkOutput,
      )
    ).toThrow(/assembly-free output directory/);

    const directoryOutput = ownedAssemblyDirectory();
    mkdirSync(join(directoryOutput, 'ergo-directory.jar'));
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetErgoNodeAssemblyDirectoryReadyV1(
        directoryOutput,
      )
    ).toThrow(/assembly-free output directory/);

    const aliasOutput = ownedAssemblyDirectory();
    const aliasTarget = ownedDirectory();
    symlinkSync(
      aliasTarget,
      join(aliasOutput, 'ergo-alias.jar'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetErgoNodeAssemblyDirectoryReadyV1(
        aliasOutput,
      )
    ).toThrow(/assembly-free output directory/);
  });

  it('rejects runner digest drift and post-build multi-link assemblies', () => {
    const root = ownedDirectory();
    const runner = join(root, 'windows-job-process.ps1');
    writeFileSync(runner, 'reviewed runner');
    const runnerDigest = createHash('sha256')
      .update(readFileSync(runner))
      .digest('hex');
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetWindowsJobProcessRunnerV1(
        runner,
        runnerDigest,
      )
    ).not.toThrow();
    writeFileSync(runner, 'drifted runner');
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetWindowsJobProcessRunnerV1(
        runner,
        runnerDigest,
      )
    ).toThrow(/differs from the node build lock/);

    const assembly = join(root, 'ergo-built.jar');
    const assemblyAlias = join(root, 'assembly-alias.jar');
    writeFileSync(assembly, 'assembly');
    expect(inspectSubstrateFederatedIsolatedDevnetErgoNodeAssemblyFileV1(assembly))
      .toMatchObject({ bytes: 8 });
    linkSync(assembly, assemblyAlias);
    expect(() =>
      inspectSubstrateFederatedIsolatedDevnetErgoNodeAssemblyFileV1(assembly)
    ).toThrow(/one filesystem link/);
  });

  it('rejects unknown lock fields and malformed pins', () => {
    const root = ownedDirectory();
    const sources = join(root, 'sources');
    mkdirSync(sources);
    const canonical = JSON.parse(readFileSync(
      join(
        bridgeRoot,
        'sources',
        'substrate-federated-isolated-devnet-node-build-lock-v1.json',
      ),
      'utf8',
    )) as Record<string, unknown>;
    const canonicalPatchSha256 = canonical.ergoPatchSha256;
    canonical.extraAuthority = true;
    writeFileSync(
      join(
        sources,
        'substrate-federated-isolated-devnet-node-build-lock-v1.json',
      ),
      JSON.stringify(canonical),
    );
    expect(() =>
      inspectSubstrateFederatedIsolatedDevnetErgoNodeBuildLockV1(root)
    ).toThrow(/fields differ/);

    delete canonical.extraAuthority;
    canonical.ergoPatchSha256 = '00';
    writeFileSync(
      join(
        sources,
        'substrate-federated-isolated-devnet-node-build-lock-v1.json',
      ),
      JSON.stringify(canonical),
    );
    expect(() =>
      inspectSubstrateFederatedIsolatedDevnetErgoNodeBuildLockV1(root)
    ).toThrow(/32-byte lowercase hexadecimal/);

    canonical.ergoPatchSha256 = canonicalPatchSha256;
    canonical.buildMaxOutputBytes = 16_777_216;
    writeFileSync(
      join(
        sources,
        'substrate-federated-isolated-devnet-node-build-lock-v1.json',
      ),
      JSON.stringify(canonical),
    );
    expect(() =>
      inspectSubstrateFederatedIsolatedDevnetErgoNodeBuildLockV1(root)
    ).toThrow(/constants differ/);
  });

  it('keeps the concrete builder shell-free and capability-free', () => {
    const source = readFileSync(
      join(
        import.meta.dirname,
        'substrate-federated-isolated-devnet-ergo-node-build-v1.ts',
      ),
      'utf8',
    );
    expect(source).toContain('runBoundedNativeBuildProcess({');
    expect(source).toContain("args: ['-jar', input.input.sbtLauncherJarPath");
    expect(source).toContain('buildProcessTimeBound: true');
    expect(source).toContain('buildProcessTreeTerminationBounded: true');
    expect(source).toContain('reviewedWindowsJobObjectRunnerPinnedBeforeAndAfterBuild: true');
    expect(source).toContain('assertNoPreexistingAssemblyCandidates');
    expect(source).toContain('assertUnlinkedPathInside');
    expect(source).not.toContain('rmSync');
    expect(source).not.toContain('sanitizedDiagnostic');
    expect(source).not.toMatch(
      /from\s+['"][^'"]*(?:submit|broadcast)|broadcastTransaction\(|node-wallet|readFileSync\([^)]*\.env/iu,
    );
  });

  const liveJava = process.env.G1DI3B_JAVA_PATH;
  const liveSbtLauncher = process.env.G1DI3B_SBT_LAUNCHER_JAR_PATH;
  const liveGit = process.env.G1DI3B_GIT_PATH;
  const liveSource = process.env.G1DI3B_ERGO_SOURCE_PATH;
  const liveWorktree = process.env.G1DI3B_WORKTREE_ROOT;
  it.skipIf(
    !liveJava || !liveSbtLauncher || !liveGit || !liveSource || !liveWorktree,
  )('builds the exact locked patched node without starting it', async () => {
    const result = await buildSubstrateFederatedIsolatedDevnetErgoNodeV1({
      worktreeRoot: liveWorktree!,
      bridgeRoot,
      ergoSourcePath: liveSource!,
      gitExecutablePath: liveGit!,
      javaExecutablePath: liveJava!,
      sbtLauncherJarPath: liveSbtLauncher!,
    });
    expect(result.receipt.status).toBe('exact_locked_patched_node_built');
    expect(result.receipt.build.artifactBytes).toBeGreaterThan(33_554_432);
    expect(result.receipt.boundaries.dependencyCacheContentAttested).toBe(false);
    expect(result.receipt.boundaries.independentBuildAttestationVerified)
      .toBe(false);
    expect(result.receipt.boundaries.broadcastAuthorized).toBe(false);
    expect(JSON.stringify(result.receipt)).not.toMatch(/[A-Za-z]:[\\/]/u);
  }, 1_000_000);
});

function ownedDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), 'e2s-fed6g1di3b-build-test-'));
  temporaryDirectories.push(path);
  return path;
}

function ownedAssemblyDirectory(): string {
  const root = ownedDirectory();
  const output = join(root, 'target');
  mkdirSync(output);
  return output;
}
