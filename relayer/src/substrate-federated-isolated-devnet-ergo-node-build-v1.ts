import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import {
  basename,
  dirname,
  relative,
  resolve,
} from 'node:path';

import {
  inspectConsensusSourceBaseline,
  type ConsensusSourceBaselineReport,
} from './consensus-source-baseline.js';
import { sha256CanonicalJson } from './ergo-settlement-core/strict-json.js';
import { runBoundedNativeBuildProcess } from './pinned-local-native-verifier-build.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_BUILD_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-ergo-node-build.v1' as const;

const BUILD_LOCK_PATH =
  'sources/substrate-federated-isolated-devnet-node-build-lock-v1.json';
const CONSENSUS_SOURCE_LOCK_PATH = 'sources/consensus-source-lock.json';
const PROJECT_SBT_VERSION_PATH = 'project/build.properties';
const SOURCE_BASELINE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_SOURCE_BASELINE_V1';
const BUILD_IDENTITY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_BUILD_V1';
const LOCKED_ASSEMBLY_NAME_PATTERN = '^ergo-.*\\.jar$';
const WINDOWS_JOB_PROCESS_RUNNER_PATH = resolve(
  import.meta.dirname,
  'scripts',
  'windows-job-process.ps1',
);
interface NodeBuildLockV1 {
  readonly schemaVersion: 1;
  readonly kind: 'substrate-federated-isolated-devnet-node-build-lock';
  readonly platform: 'win32-x64';
  readonly trustedHostModel: 'exclusive-same-user-process';
  readonly consensusSourceLockSha256: string;
  readonly ergoNodeBaseCommit: string;
  readonly ergoPatchSha256: string;
  readonly gitVersion: '2.54.0.windows.1';
  readonly gitExecutableSha256: string;
  readonly javaMajorVersion: 17;
  readonly javaDistribution: 'Microsoft OpenJDK 17.0.19+10-LTS';
  readonly javaHomeSha256: string;
  readonly sbtLauncherJarSha256: string;
  readonly projectSbtVersion: '1.11.1';
  readonly buildArguments: readonly ['assembly'];
  readonly buildProcessRunner: 'reviewed-windows-job-object-v1';
  readonly windowsJobProcessRunnerSha256: string;
  readonly buildTimeoutMs: 900_000;
  readonly buildTerminationGraceMs: 10_000;
  readonly buildMaxOutputBytes: 33_554_432;
  readonly assemblyDirectory: 'target/scala-2.12';
  readonly assemblyNamePattern: '^ergo-.*\\.jar$';
  readonly minimumAssemblyBytes: 33_554_432;
}

export interface BuildSubstrateFederatedIsolatedDevnetErgoNodeV1Input {
  readonly worktreeRoot: string;
  readonly bridgeRoot: string;
  readonly ergoSourcePath: string;
  readonly gitExecutablePath: string;
  readonly javaExecutablePath: string;
  readonly sbtLauncherJarPath: string;
}

export interface SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_BUILD_V1_SCHEMA;
  readonly version: 1;
  readonly status: 'exact_locked_patched_node_built';
  readonly source: Readonly<{
    readonly consensusSourceLockSha256Hex: string;
    readonly sourceBaselineDigestHex: string;
    readonly ergoNodeBaseCommit: string;
    readonly ergoPatchSha256Hex: string;
  }>;
  readonly toolchain: Readonly<{
    readonly platform: 'win32-x64';
    readonly gitVersion: '2.54.0.windows.1';
    readonly gitExecutableSha256Hex: string;
    readonly javaMajorVersion: 17;
    readonly javaDistribution: 'Microsoft OpenJDK 17.0.19+10-LTS';
    readonly javaHomeSha256Hex: string;
    readonly javaExecutableSha256Hex: string;
    readonly sbtLauncherJarSha256Hex: string;
    readonly projectSbtVersion: '1.11.1';
  }>;
  readonly build: Readonly<{
    readonly invocation:
      'reviewed Windows Job Object -> java -jar <pinned-sbt-launcher> assembly';
    readonly processRunner: NodeBuildLockV1['buildProcessRunner'];
    readonly processRunnerSha256Hex: string;
    readonly timeoutMs: 900_000;
    readonly terminationGraceMs: 10_000;
    readonly maxOutputBytes: 33_554_432;
    readonly artifactName: string;
    readonly artifactBytes: number;
    readonly artifactSha256Hex: string;
  }>;
  readonly checks: Readonly<{
    readonly exactTrackedRuntimeLockConsumed: true;
    readonly exactConsensusSourceLockConsumed: true;
    readonly exactPatchedSourceValidatedBeforeBuild: true;
    readonly exactPatchedSourceRevalidatedAfterBuild: true;
    readonly completeJavaDistributionValidatedBeforeAndAfterBuild: true;
    readonly pinnedGitExecutableValidatedBeforeAndAfterBuild: true;
    readonly pinnedSbtLauncherValidatedBeforeAndAfterBuild: true;
    readonly reviewedWindowsJobObjectRunnerPinnedBeforeAndAfterBuild: true;
    readonly fixedJavaArgumentsLaunchedWithoutShell: true;
    readonly inheritedBuildEnvironmentMinimized: true;
    readonly preexistingAssemblyCandidatesRejected: true;
    readonly assemblyPathChainLinkFree: true;
    readonly buildProcessTimeBound: true;
    readonly buildProcessTreeTerminationBounded: true;
    readonly singleFreshAssemblySelected: true;
  }>;
  readonly buildIdentityDigestHex: string;
  readonly boundaries: Readonly<{
    readonly loadedBytesAttestedAgainstHostileSameUserProcess: false;
    readonly dependencyCacheContentAttested: false;
    readonly independentBuildAttestationVerified: false;
    readonly targetNodeAcceptanceEstablished: false;
    readonly submissionAuthorized: false;
    readonly broadcastAuthorized: false;
    readonly fundsAuthorityEstablished: false;
    readonly gate5Closed: false;
  }>;
}

export interface SubstrateFederatedIsolatedDevnetErgoNodeBuildV1 {
  readonly receipt:
    Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1Receipt>;
  /** Internal handoff to the statically wired process adapter. Never serialize. */
  readonly javaExecutablePath: string;
  /** Internal handoff to the statically wired process adapter. Never serialize. */
  readonly nodeAssemblyJarPath: string;
}

export interface SubstrateFederatedIsolatedDevnetErgoNodeBuildLockV1View {
  readonly schemaVersion: 1;
  readonly kind: NodeBuildLockV1['kind'];
  readonly platform: NodeBuildLockV1['platform'];
  readonly consensusSourceLockSha256Hex: string;
  readonly ergoNodeBaseCommit: string;
  readonly ergoPatchSha256Hex: string;
  readonly gitExecutableSha256Hex: string;
  readonly javaHomeSha256Hex: string;
  readonly sbtLauncherJarSha256Hex: string;
  readonly projectSbtVersion: NodeBuildLockV1['projectSbtVersion'];
  readonly buildProcessRunner: NodeBuildLockV1['buildProcessRunner'];
  readonly windowsJobProcessRunnerSha256Hex: string;
  readonly buildTimeoutMs: NodeBuildLockV1['buildTimeoutMs'];
  readonly buildTerminationGraceMs: NodeBuildLockV1['buildTerminationGraceMs'];
  readonly buildMaxOutputBytes: NodeBuildLockV1['buildMaxOutputBytes'];
}

export function inspectSubstrateFederatedIsolatedDevnetErgoNodeBuildLockV1(
  bridgeRootValue: string,
): Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildLockV1View> {
  const bridgeRoot = canonicalDirectory(bridgeRootValue, 'bridge root');
  const lock = loadBuildLock(bridgeRoot);
  return Object.freeze({
    schemaVersion: 1 as const,
    kind: lock.kind,
    platform: lock.platform,
    consensusSourceLockSha256Hex: lock.consensusSourceLockSha256,
    ergoNodeBaseCommit: lock.ergoNodeBaseCommit,
    ergoPatchSha256Hex: lock.ergoPatchSha256,
    gitExecutableSha256Hex: lock.gitExecutableSha256,
    javaHomeSha256Hex: lock.javaHomeSha256,
    sbtLauncherJarSha256Hex: lock.sbtLauncherJarSha256,
    projectSbtVersion: lock.projectSbtVersion,
    buildProcessRunner: lock.buildProcessRunner,
    windowsJobProcessRunnerSha256Hex:
      lock.windowsJobProcessRunnerSha256,
    buildTimeoutMs: lock.buildTimeoutMs,
    buildTerminationGraceMs: lock.buildTerminationGraceMs,
    buildMaxOutputBytes: lock.buildMaxOutputBytes,
  });
}

/**
 * Builds the exact source-lock-defined patched Ergo node and returns one
 * process-only artifact handoff plus a path-free receipt. It does not start a
 * node, sign, submit, broadcast, or establish funds authority.
 */
export async function buildSubstrateFederatedIsolatedDevnetErgoNodeV1(
  inputValue: Readonly<BuildSubstrateFederatedIsolatedDevnetErgoNodeV1Input>,
): Promise<Readonly<SubstrateFederatedIsolatedDevnetErgoNodeBuildV1>> {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('isolated Ergo node build V1 requires Windows x64');
  }
  const input = normalizeInput(inputValue);
  const lock = loadBuildLock(input.bridgeRoot);
  const lockPath = resolveInside(
    input.bridgeRoot,
    BUILD_LOCK_PATH,
    'isolated Ergo node build lock',
  );
  const consensusSourceLockPath = resolveInside(
    input.bridgeRoot,
    CONSENSUS_SOURCE_LOCK_PATH,
    'consensus source lock',
  );
  const consensusSourceLockSha256 = fileSha256(consensusSourceLockPath);
  const buildLockSha256 = fileSha256(lockPath);
  if (consensusSourceLockSha256 !== lock.consensusSourceLockSha256) {
    throw new Error('consensus source lock differs from the node build lock');
  }

  const javaHome = canonicalJavaHome(input.javaExecutablePath);
  const javaHomeSha256 = hashDirectoryFiles(javaHome);
  if (javaHomeSha256 !== lock.javaHomeSha256) {
    throw new Error('complete Java distribution differs from the node build lock');
  }
  const javaExecutableSha256 = fileSha256(input.javaExecutablePath);
  assertFileDigest(
    input.gitExecutablePath,
    lock.gitExecutableSha256,
    'pinned Git executable',
  );
  assertFileDigest(
    input.sbtLauncherJarPath,
    lock.sbtLauncherJarSha256,
    'pinned sbt launcher',
  );
  assertSubstrateFederatedIsolatedDevnetWindowsJobProcessRunnerV1(
    WINDOWS_JOB_PROCESS_RUNNER_PATH,
    lock.windowsJobProcessRunnerSha256,
  );
  assertProjectSbtVersion(input.ergoSourcePath, lock.projectSbtVersion);

  const sourceBaselineBefore = exactSourceBaseline(input, lock);
  const sourceBaselineDigestHex = sourceBaselineDigest(sourceBaselineBefore);
  const assemblyDirectory = resolveUncreatedUnlinkedInside(
    input.ergoSourcePath,
    lock.assemblyDirectory,
    'Ergo assembly directory',
  );
  assertNoPreexistingAssemblyCandidates(assemblyDirectory, lock);

  await runPinnedBuild({ input, lock, javaHome });
  assertUnlinkedPathInside(
    input.ergoSourcePath,
    assemblyDirectory,
    'Ergo assembly directory',
  );
  const assembly = selectFreshAssembly(assemblyDirectory, lock);
  const artifactSha256Hex = fileSha256(assembly.path);

  const sourceBaselineAfter = exactSourceBaseline(input, lock);
  if (sourceBaselineDigest(sourceBaselineAfter) !== sourceBaselineDigestHex) {
    throw new Error('exact patched Ergo source identity changed during build');
  }
  if (hashDirectoryFiles(javaHome) !== lock.javaHomeSha256) {
    throw new Error('complete Java distribution changed during node build');
  }
  assertFileDigest(
    input.gitExecutablePath,
    lock.gitExecutableSha256,
    'pinned Git executable',
  );
  assertFileDigest(
    input.sbtLauncherJarPath,
    lock.sbtLauncherJarSha256,
    'pinned sbt launcher',
  );
  assertSubstrateFederatedIsolatedDevnetWindowsJobProcessRunnerV1(
    WINDOWS_JOB_PROCESS_RUNNER_PATH,
    lock.windowsJobProcessRunnerSha256,
  );
  if (
    fileSha256(lockPath) !== buildLockSha256
    || fileSha256(consensusSourceLockPath) !== consensusSourceLockSha256
  ) {
    throw new Error('node build lock inputs changed during build');
  }

  const identity = {
    schema: SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_BUILD_V1_SCHEMA,
    version: 1 as const,
    status: 'exact_locked_patched_node_built' as const,
    source: {
      consensusSourceLockSha256Hex: consensusSourceLockSha256,
      sourceBaselineDigestHex,
      ergoNodeBaseCommit: lock.ergoNodeBaseCommit,
      ergoPatchSha256Hex: lock.ergoPatchSha256,
    },
    toolchain: {
      platform: lock.platform,
      gitVersion: lock.gitVersion,
      gitExecutableSha256Hex: lock.gitExecutableSha256,
      javaMajorVersion: lock.javaMajorVersion,
      javaDistribution: lock.javaDistribution,
      javaHomeSha256Hex: lock.javaHomeSha256,
      javaExecutableSha256Hex: javaExecutableSha256,
      sbtLauncherJarSha256Hex: lock.sbtLauncherJarSha256,
      projectSbtVersion: lock.projectSbtVersion,
    },
    build: {
      invocation:
        'reviewed Windows Job Object -> java -jar <pinned-sbt-launcher> assembly' as const,
      processRunner: lock.buildProcessRunner,
      processRunnerSha256Hex: lock.windowsJobProcessRunnerSha256,
      timeoutMs: lock.buildTimeoutMs,
      terminationGraceMs: lock.buildTerminationGraceMs,
      maxOutputBytes: lock.buildMaxOutputBytes,
      artifactName: assembly.name,
      artifactBytes: assembly.bytes,
      artifactSha256Hex,
    },
    checks: {
      exactTrackedRuntimeLockConsumed: true as const,
      exactConsensusSourceLockConsumed: true as const,
      exactPatchedSourceValidatedBeforeBuild: true as const,
      exactPatchedSourceRevalidatedAfterBuild: true as const,
      completeJavaDistributionValidatedBeforeAndAfterBuild: true as const,
      pinnedGitExecutableValidatedBeforeAndAfterBuild: true as const,
      pinnedSbtLauncherValidatedBeforeAndAfterBuild: true as const,
      reviewedWindowsJobObjectRunnerPinnedBeforeAndAfterBuild: true as const,
      fixedJavaArgumentsLaunchedWithoutShell: true as const,
      inheritedBuildEnvironmentMinimized: true as const,
      preexistingAssemblyCandidatesRejected: true as const,
      assemblyPathChainLinkFree: true as const,
      buildProcessTimeBound: true as const,
      buildProcessTreeTerminationBounded: true as const,
      singleFreshAssemblySelected: true as const,
    },
    boundaries: {
      loadedBytesAttestedAgainstHostileSameUserProcess: false as const,
      dependencyCacheContentAttested: false as const,
      independentBuildAttestationVerified: false as const,
      targetNodeAcceptanceEstablished: false as const,
      submissionAuthorized: false as const,
      broadcastAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      gate5Closed: false as const,
    },
  };
  const receipt = Object.freeze({
    ...identity,
    buildIdentityDigestHex: sha256CanonicalJson(
      identity,
      BUILD_IDENTITY_DIGEST_DOMAIN,
    ),
  });
  return Object.freeze({
    receipt,
    javaExecutablePath: input.javaExecutablePath,
    nodeAssemblyJarPath: assembly.path,
  });
}

function normalizeInput(
  value: Readonly<BuildSubstrateFederatedIsolatedDevnetErgoNodeV1Input>,
): Readonly<BuildSubstrateFederatedIsolatedDevnetErgoNodeV1Input> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('isolated Ergo node build input must be an object');
  }
  return Object.freeze({
    worktreeRoot: canonicalDirectory(value.worktreeRoot, 'worktree root'),
    bridgeRoot: canonicalDirectory(value.bridgeRoot, 'bridge root'),
    ergoSourcePath: canonicalDirectory(value.ergoSourcePath, 'Ergo source'),
    gitExecutablePath: canonicalRegularFile(
      value.gitExecutablePath,
      'Git executable',
    ),
    javaExecutablePath: canonicalRegularFile(
      value.javaExecutablePath,
      'Java executable',
    ),
    sbtLauncherJarPath: canonicalRegularFile(
      value.sbtLauncherJarPath,
      'sbt launcher JAR',
    ),
  });
}

function loadBuildLock(bridgeRoot: string): Readonly<NodeBuildLockV1> {
  const path = resolveInside(
    bridgeRoot,
    BUILD_LOCK_PATH,
    'isolated Ergo node build lock',
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error('isolated Ergo node build lock is invalid JSON');
  }
  if (!isRecord(parsed)) {
    throw new Error('isolated Ergo node build lock must be an object');
  }
  const expectedKeys = [
    'assemblyDirectory',
    'assemblyNamePattern',
    'buildArguments',
    'buildMaxOutputBytes',
    'buildProcessRunner',
    'buildTerminationGraceMs',
    'buildTimeoutMs',
    'consensusSourceLockSha256',
    'ergoNodeBaseCommit',
    'ergoPatchSha256',
    'gitExecutableSha256',
    'gitVersion',
    'javaDistribution',
    'javaHomeSha256',
    'javaMajorVersion',
    'kind',
    'minimumAssemblyBytes',
    'platform',
    'projectSbtVersion',
    'sbtLauncherJarSha256',
    'schemaVersion',
    'trustedHostModel',
    'windowsJobProcessRunnerSha256',
  ].sort();
  if (JSON.stringify(Object.keys(parsed).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error('isolated Ergo node build lock fields differ from V1');
  }
  if (
    parsed.schemaVersion !== 1
    || parsed.kind !== 'substrate-federated-isolated-devnet-node-build-lock'
    || parsed.platform !== 'win32-x64'
    || parsed.trustedHostModel !== 'exclusive-same-user-process'
    || parsed.gitVersion !== '2.54.0.windows.1'
    || parsed.javaMajorVersion !== 17
    || parsed.javaDistribution !== 'Microsoft OpenJDK 17.0.19+10-LTS'
    || parsed.projectSbtVersion !== '1.11.1'
    || JSON.stringify(parsed.buildArguments) !== JSON.stringify(['assembly'])
    || parsed.buildProcessRunner !== 'reviewed-windows-job-object-v1'
    || parsed.buildTimeoutMs !== 900_000
    || parsed.buildTerminationGraceMs !== 10_000
    || parsed.buildMaxOutputBytes !== 33_554_432
    || parsed.assemblyDirectory !== 'target/scala-2.12'
    || parsed.assemblyNamePattern !== LOCKED_ASSEMBLY_NAME_PATTERN
    || parsed.minimumAssemblyBytes !== 33_554_432
  ) {
    throw new Error('isolated Ergo node build lock constants differ from V1');
  }
  for (const [field, bytes] of [
    ['consensusSourceLockSha256', 32],
    ['ergoNodeBaseCommit', 20],
    ['ergoPatchSha256', 32],
    ['gitExecutableSha256', 32],
    ['javaHomeSha256', 32],
    ['sbtLauncherJarSha256', 32],
    ['windowsJobProcessRunnerSha256', 32],
  ] as const) {
    fixedHex(parsed[field], bytes, `node build lock ${field}`);
  }
  return Object.freeze(parsed as unknown as NodeBuildLockV1);
}

function exactSourceBaseline(
  input: Readonly<BuildSubstrateFederatedIsolatedDevnetErgoNodeV1Input>,
  lock: Readonly<NodeBuildLockV1>,
): Readonly<ConsensusSourceBaselineReport> {
  const report = inspectConsensusSourceBaseline({
    worktreeRoot: input.worktreeRoot,
    bridgeRoot: input.bridgeRoot,
    ergoSourcePath: input.ergoSourcePath,
    requireFrontierCheckout: false,
    requireErgoCheckout: true,
    gitExecutablePath: input.gitExecutablePath,
  });
  if (
    report.status !== 'PASS'
    || report.errors.length !== 0
    || report.checks.lockBindingsValidated !== true
    || report.checks.ergoCheckoutValidated !== true
    || report.sourceIdentity.ergoBaseCommit !== lock.ergoNodeBaseCommit
    || report.sourceIdentity.ergoPatchSha256 !== lock.ergoPatchSha256
  ) {
    throw new Error('exact locked patched Ergo source baseline is not valid');
  }
  return report;
}

function sourceBaselineDigest(
  report: Readonly<ConsensusSourceBaselineReport>,
): string {
  return sha256CanonicalJson(report, SOURCE_BASELINE_DIGEST_DOMAIN);
}

async function runPinnedBuild(input: Readonly<{
  input: Readonly<BuildSubstrateFederatedIsolatedDevnetErgoNodeV1Input>;
  lock: Readonly<NodeBuildLockV1>;
  javaHome: string;
}>): Promise<void> {
  await runBoundedNativeBuildProcess({
    executablePath: input.input.javaExecutablePath,
    args: ['-jar', input.input.sbtLauncherJarPath, ...input.lock.buildArguments],
    cwd: input.input.ergoSourcePath,
    env: buildEnvironment(input.javaHome, input.input.javaExecutablePath),
    timeoutMs: input.lock.buildTimeoutMs,
    terminationGraceMs: input.lock.buildTerminationGraceMs,
    maxOutputBytes: input.lock.buildMaxOutputBytes,
    label: 'pinned Ergo node build',
  });
}

function buildEnvironment(
  javaHome: string,
  javaExecutablePath: string,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    JAVA_HOME: javaHome,
    PATH: dirname(javaExecutablePath),
  };
  for (const key of [
    'APPDATA',
    'HOME',
    'LOCALAPPDATA',
    'SystemRoot',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'WINDIR',
  ] as const) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
}

function assertNoPreexistingAssemblyCandidates(
  directory: string,
  lock: Readonly<Pick<NodeBuildLockV1, 'assemblyNamePattern'>>,
): void {
  if (!existsSync(directory)) return;
  const directoryStat = lstatSync(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error('pinned Ergo node assembly output must be a regular directory');
  }
  const pattern = new RegExp(lock.assemblyNamePattern, 'u');
  if (readdirSync(directory, { withFileTypes: true })
    .some(entry => pattern.test(entry.name))) {
    throw new Error(
      'pinned Ergo node build requires an assembly-free output directory',
    );
  }
}

export function assertSubstrateFederatedIsolatedDevnetErgoNodeAssemblyDirectoryReadyV1(
  directory: string,
): void {
  if (typeof directory !== 'string' || directory.includes('\0')) {
    throw new Error('pinned Ergo node assembly output directory is invalid');
  }
  assertNoPreexistingAssemblyCandidates(resolve(directory), {
    assemblyNamePattern: LOCKED_ASSEMBLY_NAME_PATTERN,
  });
}

export function assertSubstrateFederatedIsolatedDevnetWindowsJobProcessRunnerV1(
  runnerPath: string,
  expectedSha256Hex: string,
): void {
  const expected = fixedHex(
    expectedSha256Hex,
    32,
    'Windows Job Object process runner SHA-256',
  );
  assertFileDigest(
    canonicalRegularFile(runnerPath, 'Windows Job Object process runner'),
    expected,
    'Windows Job Object process runner',
  );
}

export function inspectSubstrateFederatedIsolatedDevnetErgoNodeAssemblyFileV1(
  pathValue: string,
): Readonly<{ path: string; bytes: number }> {
  const path = canonicalRegularFile(pathValue, 'pinned Ergo node assembly');
  const stat = lstatSync(path);
  if (stat.nlink !== 1) {
    throw new Error('pinned Ergo node assembly must have one filesystem link');
  }
  return Object.freeze({ path, bytes: stat.size });
}

function selectFreshAssembly(
  directory: string,
  lock: Readonly<NodeBuildLockV1>,
): Readonly<{ path: string; name: string; bytes: number }> {
  const candidates = assemblyCandidates(directory, lock);
  if (candidates.length !== 1) {
    throw new Error('pinned Ergo node build must produce exactly one fresh assembly');
  }
  return candidates[0]!;
}

function assemblyCandidates(
  directory: string,
  lock: Readonly<NodeBuildLockV1>,
): Array<{ path: string; name: string; bytes: number }> {
  if (!existsSync(directory) || !lstatSync(directory).isDirectory()) return [];
  const pattern = new RegExp(lock.assemblyNamePattern, 'u');
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => pattern.test(entry.name))
    .map(entry => {
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new Error('pinned Ergo node assembly must be a regular file');
      }
      const path = resolveInside(directory, entry.name, 'Ergo assembly candidate');
      const inspected =
        inspectSubstrateFederatedIsolatedDevnetErgoNodeAssemblyFileV1(path);
      return { path: inspected.path, name: entry.name, bytes: inspected.bytes };
    })
    .filter(entry => entry.bytes >= lock.minimumAssemblyBytes)
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
}

function assertProjectSbtVersion(sourcePath: string, expected: string): void {
  const path = resolveInside(
    sourcePath,
    PROJECT_SBT_VERSION_PATH,
    'Ergo project sbt version',
  );
  if (readFileSync(path, 'utf8').trim() !== `sbt.version=${expected}`) {
    throw new Error('Ergo project sbt version differs from the node build lock');
  }
}

function canonicalJavaHome(javaExecutablePath: string): string {
  if (basename(javaExecutablePath).toLowerCase() !== 'java.exe') {
    throw new Error('isolated Ergo node Java executable must be java.exe');
  }
  const bin = dirname(javaExecutablePath);
  if (basename(bin).toLowerCase() !== 'bin') {
    throw new Error('isolated Ergo node Java executable must be inside bin');
  }
  return canonicalDirectory(dirname(bin), 'Java home');
}

function canonicalDirectory(value: string, label: string): string {
  if (typeof value !== 'string' || value.includes('\0') || !existsSync(value)) {
    throw new Error(`${label} must be an existing directory`);
  }
  const path = realpathSync(value);
  if (!statSync(path).isDirectory()) {
    throw new Error(`${label} must be an existing directory`);
  }
  return path;
}

function canonicalRegularFile(value: string, label: string): string {
  if (typeof value !== 'string' || value.includes('\0') || !existsSync(value)) {
    throw new Error(`${label} must be an existing regular file`);
  }
  if (lstatSync(value).isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link`);
  }
  const path = realpathSync(value);
  if (!statSync(path).isFile()) {
    throw new Error(`${label} must be an existing regular file`);
  }
  return path;
}

function resolveInside(root: string, path: string, label: string): string {
  const target = resolveUncreatedInside(root, path, label);
  if (!existsSync(target) || lstatSync(target).isSymbolicLink()) {
    throw new Error(`${label} is missing or symbolic`);
  }
  return realpathSync(target);
}

function resolveUncreatedUnlinkedInside(
  root: string,
  path: string,
  label: string,
): string {
  const target = resolveUncreatedInside(root, path, label);
  assertUnlinkedPathInside(root, target, label);
  return target;
}

function resolveUncreatedInside(root: string, path: string, label: string): string {
  const target = resolve(root, path);
  const relativePath = relative(root, target);
  if (
    relativePath === ''
    || relativePath.startsWith('..')
    || resolve(root, relativePath) !== target
  ) {
    throw new Error(`${label} must remain inside its reviewed root`);
  }
  return target;
}

function assertUnlinkedPathInside(
  root: string,
  target: string,
  label: string,
): void {
  const canonicalRoot = realpathSync(root);
  const targetRelative = relative(canonicalRoot, target);
  if (
    targetRelative === ''
    || targetRelative.startsWith('..')
    || resolve(canonicalRoot, targetRelative) !== target
  ) {
    throw new Error(`${label} must remain inside its reviewed root`);
  }
  let cursor = canonicalRoot;
  for (const component of targetRelative.split(/[\\/]/u)) {
    cursor = resolve(cursor, component);
    if (!existsSync(cursor)) return;
    if (lstatSync(cursor).isSymbolicLink()) {
      throw new Error(`${label} path must not contain a symbolic link or junction`);
    }
    const canonicalCursor = realpathSync(cursor);
    const cursorRelative = relative(canonicalRoot, canonicalCursor);
    if (
      cursorRelative.startsWith('..')
      || normalizeWindowsPath(canonicalCursor) !== normalizeWindowsPath(cursor)
    ) {
      throw new Error(`${label} path must not contain a symbolic link or junction`);
    }
  }
}

function normalizeWindowsPath(value: string): string {
  return value.replace(/\\/gu, '/').toLowerCase();
}

function assertFileDigest(path: string, expected: string, label: string): void {
  if (fileSha256(path) !== expected) {
    throw new Error(`${label} differs from the node build lock`);
  }
}

function fileSha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function hashDirectoryFiles(root: string): string {
  const records = listAllRegularFiles(root)
    .map(path => `${relative(root, path).replace(/\\/gu, '/')}:${fileSha256(path)}`)
    .sort();
  if (records.length === 0) {
    throw new Error('locked directory contains no regular files');
  }
  return createHash('sha256').update(records.join('\n'), 'utf8').digest('hex');
}

function listAllRegularFiles(root: string, cursor: string = root): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(cursor, { withFileTypes: true })) {
    const path = resolve(cursor, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error('locked directory must not contain symbolic links');
    }
    if (entry.isDirectory()) files.push(...listAllRegularFiles(root, path));
    else if (entry.isFile()) files.push(path);
    else throw new Error('locked directory contains an unsupported entry');
  }
  return files;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)
  ) {
    throw new Error(`${label} must be ${bytes}-byte lowercase hexadecimal`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
