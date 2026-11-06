import {
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
} from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalPathIdentity,
  isPathInside,
  readBoundedRegularFile,
  writeNewFile,
} from '../create-only-out-of-repository-artifact.js';
import {
  resolveBridgeRepositoryRootsFromCheckoutLayout,
} from '../bridge-repository-layout.js';
import {
  assertNoDuplicateJsonKeys,
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import { runBoundedProcess } from '../pinned-local-native-verifier-build.js';

const WORKER_TIMEOUT_MS = 90 * 60_000;
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_WORKER_OUTPUT_BYTES = 2 * 1024 * 1024;
const ROOT_RECEIPT_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-bootstrap-root.v1';
const ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_ROOT_V1';
const PROCESS_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PROCESS_RECEIPT_V1';
const BUILD_IDENTITY_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_ERGO_NODE_BUILD_V1';
const EXPECTED_STATIC_CALLBACK_MANIFEST_DIGEST_HEX =
  '5879db9176ef7d3216b513695abbe1d211469584ed65c478bbe2c0db19ed800f';

const CHILD_ENVIRONMENT_KEYS = Object.freeze([
  'WINDIR',
  'TEMP',
  'TMP',
  'PATHEXT',
  'USERPROFILE',
  'HOME',
  'LOCALAPPDATA',
  'APPDATA',
  'CARGO_HOME',
  'RUSTUP_HOME',
  'JAVA_HOME',
  'LIB',
  'LIBPATH',
  'INCLUDE',
] as const);

export interface SubstrateFederatedIsolatedDevnetBootstrapCommandV1Result {
  readonly status: 'isolated_no_submit_bootstrap_receipt_published';
  readonly receiptDigestHex: string;
}

export async function runSubstrateFederatedIsolatedDevnetBootstrapCommandFromArgumentsV1(
  argv: readonly string[],
): Promise<Readonly<SubstrateFederatedIsolatedDevnetBootstrapCommandV1Result>> {
  const args = parseArguments(argv);
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const relayerRoot = resolve(scriptDirectory, '..', '..');
  const inferredBridgeRoot = resolve(relayerRoot, '..');
  const { bridgeRoot, worktreeRoot } =
    resolveBridgeRepositoryRootsFromCheckoutLayout(inferredBridgeRoot);
  const request = readBoundedRegularFile(
    explicitExistingLocalNonSensitivePath(
      args.requestPath,
      'bootstrap request',
      'file',
    ),
    'bootstrap request',
    MAX_REQUEST_BYTES,
  );
  const outputPath = assertCreateOnlyOutput(
    args.outputPath,
    worktreeRoot,
  );
  if (
    canonicalPathIdentity(request.canonicalPath)
      === canonicalPathIdentity(outputPath)
  ) {
    throw new Error('bootstrap request and output must be distinct');
  }
  const workerPath = resolve(
    scriptDirectory,
    'run-substrate-federated-isolated-devnet-bootstrap-worker-v1.ts',
  );
  const result = await runBoundedProcess({
    executablePath: process.execPath,
    args: [
      'node_modules/tsx/dist/cli.mjs',
      workerPath,
      '--request',
      request.canonicalPath,
    ],
    cwd: relayerRoot,
    env: childEnvironment(),
    timeoutMs: WORKER_TIMEOUT_MS,
    terminationGraceMs: 30_000,
    maxOutputBytes: MAX_WORKER_OUTPUT_BYTES + 64 * 1024,
    maxStdoutBytes: MAX_WORKER_OUTPUT_BYTES,
    maxStderrBytes: 64 * 1024,
    label: 'isolated no-submit bootstrap worker',
  });
  if (result.stderr !== '') {
    throw new Error('isolated no-submit bootstrap worker emitted diagnostics');
  }
  const receipt = parseSanitizedRootReceipt(result.stdout);
  publishCreateOnlyReceipt(
    outputPath,
    Buffer.from(`${canonicalJson(receipt)}\n`, 'utf8'),
  );
  return Object.freeze({
    status: 'isolated_no_submit_bootstrap_receipt_published' as const,
    receiptDigestHex: receipt.receiptDigestHex as string,
  });
}

function parseArguments(argv: readonly string[]): Readonly<{
  requestPath: string;
  outputPath: string;
}> {
  if (
    argv.length !== 4
    || argv[0] !== '--request'
    || argv[1] === undefined
    || argv[1].length === 0
    || argv[1].startsWith('--')
    || argv[2] !== '--output'
    || argv[3] === undefined
    || argv[3].length === 0
    || argv[3].startsWith('--')
  ) {
    throw new Error('isolated no-submit bootstrap arguments are invalid');
  }
  return Object.freeze({ requestPath: argv[1], outputPath: argv[3] });
}

function parseSanitizedRootReceipt(stdout: string): Record<string, unknown> {
  assertNoDuplicateJsonKeys(stdout);
  const value = JSON.parse(stdout) as unknown;
  if (stdout !== `${canonicalJson(value)}\n`) {
    throw new Error('bootstrap worker output must be canonical JSON plus one LF');
  }
  const receipt = exactRecord(value, [
    'schema',
    'version',
    'status',
    'staticCallbackManifestDigestHex',
    'build',
    'process',
    'lifecycle',
    'checks',
    'boundaries',
    'receiptDigestHex',
  ], 'bootstrap root receipt');
  if (
    receipt.schema !== ROOT_RECEIPT_SCHEMA
    || receipt.version !== 1
    || receipt.status !== 'static_owned_node_no_submit_bootstrap_passed'
    || receipt.staticCallbackManifestDigestHex
      !== EXPECTED_STATIC_CALLBACK_MANIFEST_DIGEST_HEX
  ) {
    throw new Error('bootstrap root receipt identity is unsupported');
  }
  const buildIdentityDigestHex = assertExactBuildReceipt(receipt.build);
  const processBuildIdentityDigestHex = assertExactProcessReceipt(
    receipt.process,
  );
  if (processBuildIdentityDigestHex !== buildIdentityDigestHex) {
    throw new Error('bootstrap root build and process identities differ');
  }
  assertExactLifecycleReceipt(receipt.lifecycle);
  assertExpectedBooleanRecord(receipt.checks, {
    exactLockedPatchedNodeBuiltBeforeSignerCreation: true,
    staticLifecycleFunctionSelected: true,
    staticRuntimePortsBound: true,
    replacementCallbackAccepted: false,
    setupAndPacketSessionsOneShotWrapped: true,
    producerCompletionAwaitedBeforeTeardown: true,
    rootLevelTimeoutRaceAbsent: true,
    exactProcessReceiptNormalizedBeforeDigest: true,
    buildProcessAndLifecycleDigestsJoined: true,
    returnedValueContainsCapabilities: false,
  }, 'bootstrap root receipt checks');
  const boundaries = exactRecord(receipt.boundaries, [
    'localCompatibilityExecutionOnly',
    'transitiveProducerCancellationEstablished',
    'loadedBytesAttestedAgainstHostileSameUserProcess',
    'sourceConsensusIndependentlyAuthenticated',
    'ergoConsensusIndependentlyAuthenticated',
    'targetNodeAcceptanceEstablished',
    'submissionAuthorized',
    'broadcastAuthorized',
    'profileActivated',
    'fundsAuthorityEstablished',
    'gate5Closed',
    'trustlessStatusEstablished',
    'productionReadinessEstablished',
  ], 'bootstrap root receipt boundaries');
  if (
    boundaries.localCompatibilityExecutionOnly !== true
    || boundaries.transitiveProducerCancellationEstablished !== false
    || boundaries.loadedBytesAttestedAgainstHostileSameUserProcess !== false
    || boundaries.sourceConsensusIndependentlyAuthenticated !== false
    || boundaries.ergoConsensusIndependentlyAuthenticated !== false
    || boundaries.targetNodeAcceptanceEstablished !== false
    || boundaries.submissionAuthorized !== false
    || boundaries.broadcastAuthorized !== false
    || boundaries.profileActivated !== false
    || boundaries.fundsAuthorityEstablished !== false
    || boundaries.gate5Closed !== false
    || boundaries.trustlessStatusEstablished !== false
    || boundaries.productionReadinessEstablished !== false
  ) {
    throw new Error('bootstrap root receipt authority boundaries changed');
  }
  if (
    typeof receipt.receiptDigestHex !== 'string'
    || !/^[0-9a-f]{64}$/u.test(receipt.receiptDigestHex)
  ) {
    throw new Error('bootstrap root receipt digest is invalid');
  }
  const { receiptDigestHex, ...body } = receipt;
  if (
    sha256CanonicalJson(body, ROOT_RECEIPT_DIGEST_DOMAIN)
      !== receiptDigestHex
  ) {
    throw new Error('bootstrap root receipt digest does not match its body');
  }
  assertNoLocalPathValue(receipt);
  return receipt;
}

export function assertExactBuildReceipt(value: unknown): string {
  const build = exactRecord(value, [
    'schema',
    'version',
    'status',
    'source',
    'toolchain',
    'build',
    'checks',
    'buildIdentityDigestHex',
    'boundaries',
  ], 'bootstrap root build receipt');
  if (
    build.schema
      !== 'e2s.substrate-federated-isolated-devnet-ergo-node-build.v1'
    || build.version !== 1
    || build.status !== 'exact_locked_patched_node_built'
  ) {
    throw new Error('bootstrap root build receipt identity is unsupported');
  }
  const source = exactRecord(build.source, [
    'consensusSourceLockSha256Hex',
    'sourceBaselineDigestHex',
    'ergoNodeBaseCommit',
    'ergoPatchSha256Hex',
  ], 'bootstrap root build source');
  fixedHex(source.consensusSourceLockSha256Hex, 32, 'consensus source lock');
  fixedHex(source.sourceBaselineDigestHex, 32, 'source baseline digest');
  fixedHex(source.ergoNodeBaseCommit, 20, 'Ergo node base commit');
  fixedHex(source.ergoPatchSha256Hex, 32, 'Ergo patch digest');

  const toolchain = exactRecord(build.toolchain, [
    'platform',
    'gitVersion',
    'gitExecutableSha256Hex',
    'javaMajorVersion',
    'javaDistribution',
    'javaHomeSha256Hex',
    'javaExecutableSha256Hex',
    'sbtLauncherJarSha256Hex',
    'projectSbtVersion',
  ], 'bootstrap root build toolchain');
  if (
    toolchain.platform !== 'win32-x64'
    || toolchain.gitVersion !== '2.54.0.windows.1'
    || toolchain.javaMajorVersion !== 17
    || toolchain.javaDistribution !== 'Microsoft OpenJDK 17.0.19+10-LTS'
    || toolchain.projectSbtVersion !== '1.11.1'
  ) {
    throw new Error('bootstrap root build toolchain identity changed');
  }
  fixedHex(toolchain.gitExecutableSha256Hex, 32, 'Git executable digest');
  fixedHex(toolchain.javaHomeSha256Hex, 32, 'Java home digest');
  fixedHex(toolchain.javaExecutableSha256Hex, 32, 'Java executable digest');
  fixedHex(toolchain.sbtLauncherJarSha256Hex, 32, 'sbt launcher digest');

  const buildAction = exactRecord(build.build, [
    'invocation',
    'processRunner',
    'processRunnerSha256Hex',
    'timeoutMs',
    'terminationGraceMs',
    'maxOutputBytes',
    'artifactName',
    'artifactBytes',
    'artifactSha256Hex',
  ], 'bootstrap root build action');
  if (
    buildAction.invocation
      !== 'reviewed Windows Job Object -> java -jar <pinned-sbt-launcher> assembly'
    || buildAction.processRunner !== 'reviewed-windows-job-object-v1'
    || buildAction.timeoutMs !== 900_000
    || buildAction.terminationGraceMs !== 10_000
    || buildAction.maxOutputBytes !== 33_554_432
    || !safeArtifactName(buildAction.artifactName)
    || !positiveSafeInteger(buildAction.artifactBytes)
  ) {
    throw new Error('bootstrap root build action changed');
  }
  fixedHex(buildAction.processRunnerSha256Hex, 32, 'process runner digest');
  fixedHex(buildAction.artifactSha256Hex, 32, 'node artifact digest');
  assertExpectedBooleanRecord(build.checks, Object.fromEntries([
    'exactTrackedRuntimeLockConsumed',
    'exactConsensusSourceLockConsumed',
    'exactPatchedSourceValidatedBeforeBuild',
    'exactPatchedSourceRevalidatedAfterBuild',
    'completeJavaDistributionValidatedBeforeAndAfterBuild',
    'pinnedGitExecutableValidatedBeforeAndAfterBuild',
    'pinnedSbtLauncherValidatedBeforeAndAfterBuild',
    'reviewedWindowsJobObjectRunnerPinnedBeforeAndAfterBuild',
    'fixedJavaArgumentsLaunchedWithoutShell',
    'inheritedBuildEnvironmentMinimized',
    'preexistingAssemblyCandidatesRejected',
    'assemblyPathChainLinkFree',
    'buildProcessTimeBound',
    'buildProcessTreeTerminationBounded',
    'singleFreshAssemblySelected',
  ].map(key => [key, true])), 'bootstrap root build checks');
  const buildIdentityDigestHex = fixedHex(
    build.buildIdentityDigestHex,
    32,
    'build identity digest',
  );
  assertExpectedBooleanRecord(build.boundaries, {
    loadedBytesAttestedAgainstHostileSameUserProcess: false,
    dependencyCacheContentAttested: false,
    independentBuildAttestationVerified: false,
    targetNodeAcceptanceEstablished: false,
    submissionAuthorized: false,
    broadcastAuthorized: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
  }, 'bootstrap root build boundaries');
  const { buildIdentityDigestHex: _digest, ...identity } = build;
  if (
    sha256CanonicalJson(identity, BUILD_IDENTITY_DIGEST_DOMAIN)
      !== buildIdentityDigestHex
  ) {
    throw new Error('bootstrap root build identity digest does not match');
  }
  return buildIdentityDigestHex;
}

function assertExactProcessReceipt(value: unknown): string {
  const process = exactRecord(value, [
    'receiptDigestHex',
    'receipt',
  ], 'bootstrap root process');
  const receipt = exactRecord(process.receipt, [
    'schema',
    'version',
    'primaryNodeOrigin',
    'witnessNodeOrigin',
    'miningStoppedBeforeAction',
    'buildIdentityDigestHex',
    'executableIdentityDigestHex',
    'processBindingDigestHex',
    'finalSnapshot',
    'checks',
  ], 'bootstrap root process receipt');
  if (
    receipt.schema
      !== 'e2s.substrate-federated-isolated-devnet-ergo-node-process.v1'
    || receipt.version !== 1
    || receipt.primaryNodeOrigin !== 'http://127.0.0.1:9051'
    || receipt.witnessNodeOrigin !== 'http://127.0.0.1:9052'
    || receipt.miningStoppedBeforeAction !== true
  ) {
    throw new Error('bootstrap root process receipt identity changed');
  }
  const buildIdentityDigestHex = fixedHex(
    receipt.buildIdentityDigestHex,
    32,
    'process build identity digest',
  );
  fixedHex(receipt.executableIdentityDigestHex, 32, 'process executable digest');
  fixedHex(receipt.processBindingDigestHex, 32, 'process binding digest');
  const snapshot = exactRecord(receipt.finalSnapshot, [
    'network',
    'fullHeight',
    'indexedHeight',
    'headerIdHex',
  ], 'bootstrap root process snapshot');
  if (
    snapshot.network !== 'devnet'
    || !exactHeight(snapshot.fullHeight)
    || !exactHeight(snapshot.indexedHeight)
    || snapshot.fullHeight !== snapshot.indexedHeight
  ) {
    throw new Error('bootstrap root process snapshot changed');
  }
  fixedHex(snapshot.headerIdHex, 32, 'process header ID');
  assertExpectedBooleanRecord(receipt.checks, Object.fromEntries([
    'directJavaAssemblyLaunch',
    'javaImageAndPinnedFilesRechecked',
    'isolatedFreshRuntimeStateUsed',
    'setupSignerSecretNeverExposedToCompositionRoot',
    'setupSignerMiningCredentialConsumedOnce',
    'ephemeralPowSecretPassedOnlyViaProcessEnvironment',
    'ephemeralPowSecretDiscardedBeforeAction',
    'miningTargetBoundToSessionPublicKey',
    'miningPhaseStoppedBeforeTargetFreeze',
    'sameDataDirectoriesResumedNonMining',
    'managedActionCompletionJoinedBeforeCleanup',
    'managedActionOverrunRejectedAfterJoin',
    'unverifiedProcessTerminationFailsStop',
    'exactNonMiningSnapshotStableAcrossAction',
    'spawnedProcessListenersExclusivelyLoopbackOwned',
    'configurationAndArtifactRecheckedAfterAction',
  ].map(key => [key, true])), 'bootstrap root process checks');
  const processDigest = fixedHex(
    process.receiptDigestHex,
    32,
    'process receipt digest',
  );
  if (sha256CanonicalJson(receipt, PROCESS_RECEIPT_DIGEST_DOMAIN) !== processDigest) {
    throw new Error('bootstrap root process receipt digest does not match');
  }
  return buildIdentityDigestHex;
}

function assertExactLifecycleReceipt(value: unknown): void {
  const lifecycle = exactRecord(value, [
    'federationProfileIdHex',
    'sourceAttestationKeySetDigestHex',
    'ergoAdmissionKeySetDigestHex',
    'packetReceiptDigestHex',
    'setupCheckReceiptDigestHex',
  ], 'bootstrap root lifecycle');
  for (const [key, field] of Object.entries(lifecycle)) {
    fixedHex(field, 32, `bootstrap root lifecycle ${key}`);
  }
}

function assertExpectedBooleanRecord(
  value: unknown,
  expected: Readonly<Record<string, boolean>>,
  label: string,
): void {
  const record = exactRecord(value, Object.keys(expected), label);
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (record[key] !== expectedValue) throw new Error(`${label} changed`);
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)
  ) {
    throw new Error(`${label} must be ${bytes} lowercase hexadecimal bytes`);
  }
  return value;
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function exactHeight(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 8;
}

function safeArtifactName(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 255
    && /^[A-Za-z0-9._-]+$/u.test(value)
    && !hasSensitivePath(value);
}

function publishCreateOnlyReceipt(path: string, bytes: Uint8Array): void {
  const parentPath = dirname(path);
  const stagingDirectory = mkdtempSync(join(
    parentPath,
    '.e2s-bootstrap-receipt-',
  ));
  const stagingPath = join(stagingDirectory, 'receipt.json');
  let executionError: unknown;
  let finalReceiptCommitted = false;
  try {
    writeNewFile(
      stagingPath,
      bytes,
      'isolated no-submit bootstrap staged receipt',
    );
    const staged = lstatSync(stagingPath);
    if (
      !staged.isFile()
      || staged.isSymbolicLink()
      || staged.size !== bytes.byteLength
    ) {
      throw new Error('isolated no-submit bootstrap staged receipt changed');
    }
    linkSync(stagingPath, path);
    finalReceiptCommitted = true;
  } catch (error) {
    executionError = error;
    throw error;
  } finally {
    let cleanupError: unknown;
    try {
      if (existsSync(stagingPath)) unlinkSync(stagingPath);
    } catch (error) {
      cleanupError = error;
    }
    try {
      rmdirSync(stagingDirectory);
    } catch (error) {
      cleanupError ??= error;
    }
    if (
      !finalReceiptCommitted
      && executionError === undefined
      && cleanupError !== undefined
    ) {
      throw cleanupError;
    }
  }
}

function assertCreateOnlyOutput(value: string, worktreeRoot: string): string {
  const outputPath = explicitLocalNonSensitivePath(
    value,
    'bootstrap receipt output',
  );
  assertPathAbsent(outputPath, 'bootstrap receipt output');
  const parentPath = dirname(outputPath);
  const parent = lstatSync(parentPath);
  const canonicalParent = realpathSync(parentPath);
  if (
    !parent.isDirectory()
    || parent.isSymbolicLink()
    || canonicalPathIdentity(canonicalParent)
      !== canonicalPathIdentity(parentPath)
  ) {
    throw new Error('bootstrap receipt output parent must be one regular directory');
  }
  if (isPathInside(realpathSync(worktreeRoot), outputPath)) {
    throw new Error('bootstrap receipt output must remain outside the worktree');
  }
  return outputPath;
}

function childEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    Path: process.env.Path ?? process.env.PATH,
    SystemRoot: process.env.SystemRoot ?? process.env.SYSTEMROOT,
    ComSpec: process.env.ComSpec ?? process.env.COMSPEC,
  };
  for (const key of CHILD_ENVIRONMENT_KEYS) {
    const value = process.env[key];
    if (value !== undefined && value.length > 0) environment[key] = value;
  }
  return environment;
}

function explicitLocalNonSensitivePath(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\0')
    || !isAbsolute(value)
    || hasSensitivePath(value)
    || hasRemoteOrDeviceNamespace(value)
  ) {
    throw new Error(`${label} must be one local absolute non-sensitive path`);
  }
  const path = resolve(value);
  if (hasSensitivePath(path) || hasRemoteOrDeviceNamespace(path)) {
    throw new Error(`${label} must not use remote or device syntax`);
  }
  return path;
}

function explicitExistingLocalNonSensitivePath(
  value: unknown,
  label: string,
  kind: 'file' | 'directory',
): string {
  const path = explicitLocalNonSensitivePath(value, label);
  const status = lstatSync(path);
  const canonical = realpathSync(path);
  if (
    status.isSymbolicLink()
    || (kind === 'file' ? !status.isFile() : !status.isDirectory())
    || canonicalPathIdentity(canonical) !== canonicalPathIdentity(path)
    || hasSensitivePath(canonical)
    || hasRemoteOrDeviceNamespace(canonical)
  ) {
    throw new Error(`${label} must be one link-free non-sensitive ${kind}`);
  }
  return path;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  if (
    JSON.stringify(Object.keys(record).sort())
      !== JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} fields differ from V1`);
  }
  return record;
}

function assertNoLocalPathValue(value: unknown): void {
  const visit = (current: unknown): void => {
    if (
      typeof current === 'string'
      && (
        /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/u.test(current)
        || /^(?:\\\\|\/\/)/u.test(current)
      )
    ) {
      throw new Error('bootstrap root receipt must not contain local paths');
    }
    if (Array.isArray(current)) {
      current.forEach(visit);
    } else if (current !== null && typeof current === 'object') {
      Object.values(current).forEach(visit);
    }
  };
  visit(value);
}

function assertPathAbsent(path: string, label: string): void {
  try {
    lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`${label} must not already exist`);
}

function hasSensitivePath(value: string): boolean {
  return /(?:^|[\\/])(?:\.env(?:\.[^\\/]*)?|\.ssh|logs?|db|database|[^\\/]*(?:mnemonic|seed[-_ ]?phrase|private[-_ ]?key|api[-_ ]?key|credentials?|secret|wallet|keystore|keyring|deployed[-_ ]state|deployment[-_ ]state|runtime[-_ ]?(?:db|database|state))[^\\/]*|[^\\/]+\.(?:sqlite(?:3)?|db|log)(?:[.-][^\\/]*)?)(?:[\\/]|$)/iu.test(value);
}

function hasRemoteOrDeviceNamespace(value: string): boolean {
  return /^(?:\\\\|\/\/|\\[?.]\\|\\Device\\)/iu.test(value);
}

async function main(): Promise<void> {
  const result =
    await runSubstrateFederatedIsolatedDevnetBootstrapCommandFromArgumentsV1(
      process.argv.slice(2),
    );
  process.stdout.write(`${canonicalJson(result)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(() => {
    process.stderr.write('isolated no-submit bootstrap failed\n');
    process.exitCode = 1;
  });
}
