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
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  BoundedProcessExitError,
  runBoundedProcess,
} from './pinned-local-native-verifier-build.js';

import {
  assertSubstrateFederatedIsolatedDevnetErgoNodeAssemblyDirectoryReadyV1,
  assertSubstrateFederatedIsolatedDevnetErgoNodeBuildOutputReadyV1,
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
        '905a839ce4a5db0d7f5a578e5b2990cd2c2ca9e27467b6b9c2f11469b8f2f80e',
      ergoNodeBaseCommit: '2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1',
      ergoPatchSha256Hex:
        '31b27cf9acd7ad6d7c05282d964f51be15b5aa78767b354f8f29ee28d39ebf23',
      gitVersion: '2.54.0.windows.1',
      gitExecutableSha256Hex:
        '81ef35ae005ca9318018d18e3327578ce939fb99feaad6b2d7c8ab15f3de8db5',
      javaHomeSha256Hex:
        '43ddaddbc9c892eebb9017eaadd292a0198a3262941f061de61ab03db283dd7e',
      sbtLauncherJarSha256Hex:
        'b4c0c55d68f11b1510d884641cb1b1456191dac40ddc958bf86c825adc344e16',
      projectSbtVersion: '1.11.1',
      javaSystemProperties: [
        '-Dsbt.offline=true',
        '-Dsbt.server.autostart=false',
        '-Dsbt.override.build.repos=false',
        '-Djava.net.useSystemProxies=false',
      ],
      coursierMode: 'offline',
      sbtLauncherRepositoriesFileName: 'repositories',
      sbtLauncherRepositoriesFileTemplate:
        '[repositories]\n  bridge-maven-central-cache: {{MAVEN_CENTRAL_CACHE_URI}}\n  bridge-empty-offline: {{EMPTY_REPOSITORY_URI}}, bootOnly\n',
      sbtLauncherEmptyRepositoryDirectoryName:
        'sbt-launcher-empty-repository',
      hostSbtBootDirectoryRelativeToUserProfile: '.sbt/boot',
      hostCoursierCacheDirectoryRelativeToLocalAppData: 'Coursier/cache/v1',
      hostMavenCentralCacheDirectoryRelativeToCoursierCache:
        'https/repo1.maven.org/maven2',
      isolatedSbtStateDirectory: 'target/bridge-sbt-state-v1',
      buildProcessRunner: 'reviewed-windows-job-object-v1',
      windowsJobProcessRunnerSha256Hex:
        '47a08af66ef3134fefeee392e5578be9295e5171dca83c8861822d7e464ff627',
      buildTimeoutMs: 900_000,
      buildTerminationGraceMs: 10_000,
      buildMaxOutputBytes: 33_554_432,
    });
    expect(JSON.stringify(lock)).not.toMatch(/[A-Za-z]:[\\/]/u);
    expect(() => assertSubstrateFederatedIsolatedDevnetWindowsJobProcessRunnerV1(
      resolve(import.meta.dirname, 'scripts', 'windows-job-process.ps1'),
      lock.windowsJobProcessRunnerSha256Hex,
    )).not.toThrow();
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

  it('derives the assembly output directory from the exact build lock', () => {
    const source = ownedDirectory();
    const output = join(source, 'target', 'scala-2.12');
    mkdirSync(output, { recursive: true });
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetErgoNodeBuildOutputReadyV1(
        bridgeRoot,
        source,
      )
    ).not.toThrow();

    writeFileSync(join(output, 'ergo-stale.jar'), 'stale');
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetErgoNodeBuildOutputReadyV1(
        bridgeRoot,
        source,
      )
    ).toThrow(/assembly-free output directory/);

    const aliasedSource = ownedDirectory();
    const aliasTarget = ownedDirectory();
    mkdirSync(join(aliasTarget, 'scala-2.12'), { recursive: true });
    symlinkSync(
      aliasTarget,
      join(aliasedSource, 'target'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetErgoNodeBuildOutputReadyV1(
        bridgeRoot,
        aliasedSource,
      )
    ).toThrow(/path must not contain a symbolic link or junction/);

    const preexistingSbtStateSource = ownedDirectory();
    mkdirSync(
      join(preexistingSbtStateSource, 'target', 'bridge-sbt-state-v1'),
      { recursive: true },
    );
    expect(() =>
      assertSubstrateFederatedIsolatedDevnetErgoNodeBuildOutputReadyV1(
        bridgeRoot,
        preexistingSbtStateSource,
      )
    ).toThrow(/sbt state directory must not pre-exist/);
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

    canonical.buildMaxOutputBytes = 33_554_432;
    canonical.javaSystemProperties = [
      '-Dsbt.offline=false',
      '-Dsbt.server.autostart=false',
      '-Dsbt.override.build.repos=false',
      '-Djava.net.useSystemProxies=false',
    ];
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

    canonical.javaSystemProperties = [
      '-Dsbt.offline=true',
      '-Dsbt.server.autostart=false',
      '-Dsbt.override.build.repos=false',
      '-Djava.net.useSystemProxies=false',
    ];
    canonical.coursierMode = 'online';
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

    canonical.coursierMode = 'offline';
    canonical.sbtLauncherRepositoriesFileName = 'unreviewed-repositories';
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

    canonical.sbtLauncherRepositoriesFileName = 'repositories';
    canonical.sbtLauncherRepositoriesFileTemplate =
      '[repositories]\n  maven-central\n';
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

    canonical.sbtLauncherRepositoriesFileTemplate =
      '[repositories]\n  bridge-maven-central-cache: {{MAVEN_CENTRAL_CACHE_URI}}\n  bridge-empty-offline: {{EMPTY_REPOSITORY_URI}}, bootOnly\n';
    canonical.sbtLauncherEmptyRepositoryDirectoryName =
      'unreviewed-empty-repository';
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

    canonical.sbtLauncherEmptyRepositoryDirectoryName =
      'sbt-launcher-empty-repository';
    canonical.hostSbtBootDirectoryRelativeToUserProfile = '.sbt/unreviewed-boot';
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

    canonical.hostSbtBootDirectoryRelativeToUserProfile = '.sbt/boot';
    canonical.hostCoursierCacheDirectoryRelativeToLocalAppData =
      'Coursier/cache';
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

    canonical.hostCoursierCacheDirectoryRelativeToLocalAppData =
      'Coursier/cache/v1';
    canonical.hostMavenCentralCacheDirectoryRelativeToCoursierCache =
      'https/unreviewed.example/maven2';
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

    canonical.hostMavenCentralCacheDirectoryRelativeToCoursierCache =
      'https/repo1.maven.org/maven2';
    canonical.isolatedSbtStateDirectory = 'target/unreviewed-state';
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
    expect(source).toContain('...input.lock.javaSystemProperties');
    expect(source).toContain(
      '`-Dsbt.global.base=${runtime.sbtGlobalBaseDirectory}`',
    );
    expect(source).toContain('COURSIER_CACHE: input.hostCoursierCacheDirectory');
    expect(source).toContain('COURSIER_CONFIG_DIR: input.coursierConfigDirectory');
    expect(source).toContain("'-jar',");
    expect(source).toContain('COURSIER_MODE: coursierMode');
    expect(source).toContain('HOME: input.homeDirectory');
    expect(source).toContain('LOCALAPPDATA: input.localAppDataDirectory');
    expect(source).toContain('SCALA_CLI_CONFIG: input.scalaCliConfigPath');
    expect(source).toContain('USERPROFILE: input.homeDirectory');
    const jarArgumentIndex = source.indexOf("'-jar',");
    for (const argument of [
      '...input.lock.javaSystemProperties',
      '`-Djava.io.tmpdir=${runtime.tempDirectory}`',
      '`-Duser.home=${runtime.homeDirectory}`',
      '`-Dsbt.global.base=${runtime.sbtGlobalBaseDirectory}`',
      '`-Dsbt.global.localcache=${runtime.sbtGlobalLocalCacheDirectory}`',
      '`-Dsbt.boot.directory=${runtime.hostSbtBootDirectory}`',
      '`-Dsbt.ivy.home=${runtime.sbtIvyHomeDirectory}`',
      '`-Dsbt.repository.config=${runtime.sbtLauncherRepositoriesFilePath}`',
    ]) {
      expect(source.indexOf(argument)).toBeGreaterThan(-1);
      expect(source.indexOf(argument)).toBeLessThan(jarArgumentIndex);
    }
    expect(source).toContain(
      'PSModuleAnalysisCachePath: input.powerShellModuleAnalysisCachePath',
    );
    expect(source).not.toContain('...process.env');
    expect(source).not.toMatch(
      /\b(?:COURSIER_CREDENTIALS|COURSIER_REPOSITORIES|HTTP_PROXY|HTTPS_PROXY|JAVA_OPTS|JAVA_TOOL_OPTIONS|JDK_JAVA_OPTIONS|SBT_OPTS|_JAVA_OPTIONS)\b/u,
    );
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
  it.skipIf(!liveJava || !liveSbtLauncher)(
    'fails closed at the SBT launcher when its boot cache is empty',
    async () => {
      const root = ownedDirectory();
      const source = join(root, 'source');
      const isolated = join(root, 'isolated');
      const directories = {
        appData: join(isolated, 'appdata'),
        boot: join(isolated, 'boot'),
        cache: join(isolated, 'coursier-cache'),
        coursierConfig: join(isolated, 'coursier-config'),
        emptyRepository: join(isolated, 'sbt-launcher-empty-repository'),
        global: join(isolated, 'sbt-global'),
        home: join(isolated, 'home'),
        ivy: join(isolated, 'ivy'),
        localAppData: join(isolated, 'localappdata'),
        mavenCentralCache: join(isolated, 'maven-central-cache'),
        powerShellCache: join(isolated, 'powershell-cache'),
        sbtCache: join(isolated, 'sbt-cache'),
        temp: join(isolated, 'temp'),
      } as const;
      for (const path of [source, ...Object.values(directories)]) {
        mkdirSync(path, { recursive: true });
      }
      mkdirSync(join(source, 'project'));
      writeFileSync(
        join(source, 'project', 'build.properties'),
        'sbt.version=1.11.1',
      );
      const repositories = join(isolated, 'repositories');
      const mavenCentralCacheUri = pathToFileURL(
        `${directories.mavenCentralCache}${sep}`,
      ).href;
      const emptyRepositoryUri = pathToFileURL(
        `${directories.emptyRepository}${sep}`,
      ).href;
      writeFileSync(
        repositories,
        `[repositories]\n  bridge-maven-central-cache: ${mavenCentralCacheUri}\n  bridge-empty-offline: ${emptyRepositoryUri}, bootOnly\n`,
      );
      const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
      if (!systemRoot) throw new Error('SBT boot miss probe requires SystemRoot');

      const startedAt = Date.now();
      let failure: unknown;
      try {
        await runBoundedProcess({
          executablePath: liveJava!,
          args: [
            '-Dsbt.offline=true',
            '-Dsbt.server.autostart=false',
            '-Dsbt.override.build.repos=false',
            '-Djava.net.useSystemProxies=false',
            `-Djava.io.tmpdir=${directories.temp}`,
            `-Duser.home=${directories.home}`,
            `-Dsbt.global.base=${directories.global}`,
            `-Dsbt.global.localcache=${directories.sbtCache}`,
            `-Dsbt.boot.directory=${directories.boot}`,
            `-Dsbt.ivy.home=${directories.ivy}`,
            `-Dsbt.repository.config=${repositories}`,
            '-jar',
            liveSbtLauncher!,
            'about',
          ],
          cwd: source,
          env: {
            APPDATA: directories.appData,
            CI: 'true',
            COURSIER_CACHE: directories.cache,
            COURSIER_CONFIG_DIR: directories.coursierConfig,
            COURSIER_MODE: 'offline',
            HOME: directories.home,
            JAVA_HOME: dirname(dirname(liveJava!)),
            LOCALAPPDATA: directories.localAppData,
            NO_COLOR: '1',
            PATH: dirname(liveJava!),
            PSModuleAnalysisCachePath: join(
              directories.powerShellCache,
              'ModuleAnalysisCache',
            ),
            SCALA_CLI_CONFIG: join(isolated, 'scala-cli-config.json'),
            SystemRoot: systemRoot,
            TEMP: directories.temp,
            TMP: directories.temp,
            USERPROFILE: directories.home,
            WINDIR: systemRoot,
          },
          timeoutMs: 10_000,
          terminationGraceMs: 10_000,
          maxOutputBytes: 1_048_576,
          label: 'isolated SBT launcher boot-cache miss probe',
        });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(BoundedProcessExitError);
      const processFailure = failure as BoundedProcessExitError;
      const diagnostic = `${processFailure.stdout}\n${processFailure.stderr}`;
      expect(diagnostic).toContain('could not retrieve sbt 1.11.1');
      expect(diagnostic).toMatch(/not found: .*sbt-launcher-empty-repository/iu);
      expect(diagnostic).not.toMatch(/\bhttps?:\/\//iu);
      expect(Date.now() - startedAt).toBeLessThan(20_000);
    },
    30_000,
  );
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
