import {
  lstatSync,
  mkdirSync,
  realpathSync,
} from 'node:fs';
import { delimiter, dirname, join, parse, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  validatePinnedAuthenticatedV2ParentRuntime,
} from '../authenticated-v2-source-tree-conformance.js';
import {
  canonicalPathIdentity,
  readBoundedRegularFile,
  writeNewFile,
} from '../create-only-out-of-repository-artifact.js';
import {
  assertNoDuplicateJsonKeys,
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import { runBoundedProcess } from '../pinned-local-native-verifier-build.js';
import {
  loadSubstrateFederatedNativeTwoCycleInvocationV1,
  validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1,
  type SubstrateFederatedNativeTwoCycleEnvironmentV1,
  type SubstrateFederatedNativeTwoCycleResultV1,
} from '../substrate-federated-native-two-cycle-invocation-v1.js';

const WORKER_TIMEOUT_MS = 4 * 60 * 60_000;
const WORKER_TERMINATION_GRACE_MS = 30_000;
const MAX_WORKER_STDOUT_BYTES = 1024;
const MAX_WORKER_STDERR_BYTES = 64 * 1024;
const MAX_WORKER_TRANSPORT_BYTES = 512 * 1024;
const WORKER_TRANSPORT_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-worker-transport.v1';
const START_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-start.v1';
const TERMINAL_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-terminal.v1';
const FAILURE_SCHEMA =
  'e2s.substrate-federated-native-two-cycle-failure.v1';
const TERMINAL_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_TERMINAL_V1';
const FAILURE_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_FAILURE_V1';

interface RunSubstrateFederatedNativeTwoCycleResult {
  readonly status: 'two_cycle_terminal_receipt_published';
  readonly attemptName: string;
  readonly receiptDigestHex: string;
}

export async function runSubstrateFederatedNativeTwoCycleFromArguments(
  argv: readonly string[],
): Promise<Readonly<RunSubstrateFederatedNativeTwoCycleResult>> {
  const configPath = parseArguments(argv);
  const initial = loadSubstrateFederatedNativeTwoCycleInvocationV1(configPath);
  const environmentBefore =
    await validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1(initial);
  const attemptPath = createAttemptDirectory(initial.attemptPath);
  const capturedConfigPath = join(attemptPath, 'config.json');
  const startPath = join(attemptPath, 'start.json');
  const resultPath = join(attemptPath, 'result.json');
  const failurePath = join(attemptPath, 'failure.json');
  const workerResultPath = join(attemptPath, 'worker-result.json');
  let startPublished = false;
  let terminalPublicationStarted = false;
  try {
    writeNewFile(
      capturedConfigPath,
      initial.configBytes,
      'native two-cycle captured config',
    );
    const captured = loadSubstrateFederatedNativeTwoCycleInvocationV1(
      capturedConfigPath,
      attemptPath,
    );
    assertSameCapture(initial, captured);
    const start = Object.freeze({
      schema: START_SCHEMA,
      version: 1 as const,
      status: 'two_cycle_invocation_started' as const,
      configSha256Hex: initial.configSha256Hex,
      expectedBridgeCommit: initial.config.expectedBridgeCommit,
      expectedBridgeTree: environmentBefore.repository.tree,
      pathIdentityDigestHex: initial.pathIdentityDigestHex,
      toolIdentityDigestHex: environmentBefore.toolIdentityDigestHex,
      checks: Object.freeze({
        exactCleanRepositoryValidated: true as const,
        pinnedParentRuntimeValidated: true as const,
        capturedConfigCreatedBeforeWorker: true as const,
        automaticRetryOrResumeEnabled: false as const,
      }),
      boundaries: Object.freeze({
        parentRuntimeAttestedBeforeInitialTsxLoad: false as const,
        exclusiveSameUserHostRequired: true as const,
        startWithoutTerminalIsAmbiguous: true as const,
      }),
    });
    writeNewFile(
      startPath,
      Buffer.from(`${canonicalJson(start)}\n`, 'utf8'),
      'native two-cycle start record',
    );
    startPublished = true;

    const runtimeImmediatelyBeforeLaunch =
      validatePinnedAuthenticatedV2ParentRuntime(initial.config.bridgeRoot);
    if (
      runtimeImmediatelyBeforeLaunch.nodeExecutableSha256
        !== environmentBefore.runtime.nodeExecutableSha256
      || runtimeImmediatelyBeforeLaunch.relayerPackageLockSha256
        !== environmentBefore.runtime.relayerPackageLockSha256
      || runtimeImmediatelyBeforeLaunch.gitExecutableSha256
        !== environmentBefore.runtime.gitExecutableSha256
    ) {
      throw new Error('parent runtime identity changed before worker launch');
    }
    const scriptDirectory = dirname(fileURLToPath(import.meta.url));
    const relayerRoot = resolve(scriptDirectory, '..', '..');
    const workerPath = resolve(
      scriptDirectory,
      'run-substrate-federated-native-two-cycle-worker-v1.ts',
    );
    const worker = await runBoundedProcess({
      executablePath: process.execPath,
      args: [
        ...process.execArgv,
        workerPath,
        '--config',
        capturedConfigPath,
        '--expected-config-sha256',
        initial.configSha256Hex,
        '--attempt',
        attemptPath,
      ],
      cwd: relayerRoot,
      env: childEnvironment(initial.config, runtimeImmediatelyBeforeLaunch.gitExecutablePath),
      timeoutMs: WORKER_TIMEOUT_MS,
      terminationGraceMs: WORKER_TERMINATION_GRACE_MS,
      maxOutputBytes: MAX_WORKER_STDOUT_BYTES + MAX_WORKER_STDERR_BYTES,
      maxStdoutBytes: MAX_WORKER_STDOUT_BYTES,
      maxStderrBytes: MAX_WORKER_STDERR_BYTES,
      label: 'native two-cycle worker',
    });
    if (worker.stdout !== '' || worker.stderr !== '') {
      throw new Error('native two-cycle worker emitted output');
    }
    const transport = readWorkerTransport(workerResultPath, initial.configSha256Hex);
    const environmentAfter =
      await validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1(captured);
    assertSameEnvironment(environmentBefore, environmentAfter);
    if (
      transport.bridgeCommit !== environmentAfter.repository.commit
      || transport.bridgeTree !== environmentAfter.repository.tree
      || transport.pathIdentityDigestHex !== captured.pathIdentityDigestHex
      || transport.toolIdentityDigestHex !== environmentAfter.toolIdentityDigestHex
    ) {
      throw new Error('native two-cycle worker transport identities differ');
    }
    const terminalBody = Object.freeze({
      schema: TERMINAL_SCHEMA,
      version: 1 as const,
      status: 'two_cycle_local_synthetic_execution_completed' as const,
      configSha256Hex: captured.configSha256Hex,
      bridgeCommit: environmentAfter.repository.commit,
      bridgeTree: environmentAfter.repository.tree,
      pathIdentityDigestHex: captured.pathIdentityDigestHex,
      toolIdentityDigestHex: environmentAfter.toolIdentityDigestHex,
      result: transport.result,
      checks: Object.freeze({
        startRecordedBeforeWorkerLaunch: true as const,
        workerExitedCleanlyWithoutOutput: true as const,
        workerTransportValidated: true as const,
        repositoryAndToolsRevalidatedAfterRootCleanup: true as const,
        terminalArtifactCreatedOnce: true as const,
      }),
      boundaries: Object.freeze({
        localSyntheticExecutionOnly: true as const,
        trustedHostAndCachesRequired: true as const,
        parentRuntimeAttestedBeforeInitialTsxLoad: false as const,
        independentOperatorCustodyEstablished: false as const,
        releaseReadinessEstablished: false as const,
        productionReadinessEstablished: false as const,
      }),
    });
    const terminal = Object.freeze({
      ...terminalBody,
      receiptDigestHex: sha256CanonicalJson(
        terminalBody,
        TERMINAL_DIGEST_DOMAIN,
      ),
    });
    terminalPublicationStarted = true;
    writeNewFile(
      resultPath,
      Buffer.from(`${canonicalJson(terminal)}\n`, 'utf8'),
      'native two-cycle terminal result',
    );
    return Object.freeze({
      status: 'two_cycle_terminal_receipt_published' as const,
      attemptName: initial.config.attemptName,
      receiptDigestHex: terminal.receiptDigestHex,
    });
  } catch (primaryFailure) {
    if (startPublished && !terminalPublicationStarted) {
      try {
        const postcheckPassed = await boundedPostcheck(initial, environmentBefore);
        const failureBody = Object.freeze({
          schema: FAILURE_SCHEMA,
          version: 1 as const,
          status: 'two_cycle_invocation_failed' as const,
          configSha256Hex: initial.configSha256Hex,
          expectedBridgeCommit: initial.config.expectedBridgeCommit,
          failureClass: classifyFailure(primaryFailure),
          checks: Object.freeze({
            startRecordPresent: true as const,
            automaticRetryOrResumeEnabled: false as const,
            postFailureIdentityCheckPassed: postcheckPassed,
          }),
          boundaries: Object.freeze({
            rootCleanupEstablishedByTimeout: false as const,
            startWithoutThisTerminalWouldBeAmbiguous: true as const,
            rawCausePublished: false as const,
          }),
        });
        const failure = Object.freeze({
          ...failureBody,
          receiptDigestHex: sha256CanonicalJson(
            failureBody,
            FAILURE_DIGEST_DOMAIN,
          ),
        });
        writeNewFile(
          failurePath,
          Buffer.from(`${canonicalJson(failure)}\n`, 'utf8'),
          'native two-cycle terminal failure',
        );
      } catch {
        // Preserve the original execution failure. A missing failure artifact
        // leaves the create-only start as a permanently ambiguous attempt.
      }
    }
    throw primaryFailure;
  }
}

function readWorkerTransport(
  path: string,
  expectedConfigSha256Hex: string,
): Readonly<{
  bridgeCommit: string;
  bridgeTree: string;
  pathIdentityDigestHex: string;
  toolIdentityDigestHex: string;
  result: Readonly<SubstrateFederatedNativeTwoCycleResultV1>;
}> {
  const loaded = readBoundedRegularFile(
    path,
    'native two-cycle worker transport',
    MAX_WORKER_TRANSPORT_BYTES,
  );
  const text = Buffer.from(loaded.bytes).toString('utf8');
  assertNoDuplicateJsonKeys(text);
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; }
  catch { throw new Error('native two-cycle worker transport is invalid JSON'); }
  if (text !== `${canonicalJson(parsed)}\n`) {
    throw new Error('native two-cycle worker transport must be canonical JSON plus one LF');
  }
  const transport = exactRecord(parsed, [
    'schema', 'version', 'status', 'configSha256Hex', 'bridgeCommit',
    'bridgeTree', 'pathIdentityDigestHex', 'toolIdentityDigestHex', 'result',
  ], 'native two-cycle worker transport');
  if (
    transport.schema !== WORKER_TRANSPORT_SCHEMA
    || transport.version !== 1
    || transport.status !== 'root_completed_and_cleaned'
    || transport.configSha256Hex !== expectedConfigSha256Hex
  ) throw new Error('native two-cycle worker transport identity differs');
  const result = validateProjectedResult(transport.result);
  return Object.freeze({
    bridgeCommit: lowerHex(transport.bridgeCommit, 20, 'worker bridge commit'),
    bridgeTree: lowerHex(transport.bridgeTree, 20, 'worker bridge tree'),
    pathIdentityDigestHex: lowerHex(
      transport.pathIdentityDigestHex,
      32,
      'worker path identity digest',
    ),
    toolIdentityDigestHex: lowerHex(
      transport.toolIdentityDigestHex,
      32,
      'worker tool identity digest',
    ),
    result,
  });
}

function validateProjectedResult(
  value: unknown,
): Readonly<SubstrateFederatedNativeTwoCycleResultV1> {
  const result = exactRecord(value, [
    'schema', 'version', 'status', 'rootResultDigestHex', 'genesis',
    'issuance', 'firstCycle', 'secondCycle', 'checks', 'boundaries',
    'receiptDigestHex',
  ], 'native two-cycle projected result');
  if (
    result.schema !== 'e2s.substrate-federated-native-two-cycle-result.v1'
    || result.version !== 1
    || result.status !== 'two_cycle_local_synthetic_execution_completed'
  ) throw new Error('native two-cycle projected result identity differs');
  lowerHex(result.rootResultDigestHex, 32, 'root result digest');
  const genesis = exactRecord(result.genesis, [
    'nativeGenesisHashHex', 'typedGenesisSha256Hex', 'rawSpecSha256Hex',
    'runtimeProfileIdHex', 'familyIdHex', 'sourceProofProfileIdHex',
    'nodeSha256Hex', 'wasmSha256Hex', 'operatorAddressHex',
    'storageKeysChecked',
  ], 'projected genesis');
  for (const key of [
    'nativeGenesisHashHex', 'typedGenesisSha256Hex', 'rawSpecSha256Hex',
    'runtimeProfileIdHex', 'familyIdHex', 'sourceProofProfileIdHex',
    'nodeSha256Hex', 'wasmSha256Hex',
  ]) flexibleHex(genesis[key], 32, `projected genesis ${key}`);
  flexibleHex(genesis.operatorAddressHex, 20, 'projected operator address');
  positiveSafeInteger(genesis.storageKeysChecked, 'projected storage key count');
  const issuance = exactRecord(result.issuance, [
    'inputBoxIds', 'transactionIds', 'confirmationHeights',
  ], 'projected issuance');
  const inputBoxIds = hexArray(issuance.inputBoxIds, 3, 'projected issuance inputs');
  const transactionIds = hexArray(
    issuance.transactionIds,
    3,
    'projected issuance transactions',
  );
  if (
    !Array.isArray(issuance.confirmationHeights)
    || issuance.confirmationHeights.length !== 3
    || issuance.confirmationHeights.some(value => !Number.isSafeInteger(value) || value <= 0)
    || inputBoxIds.length !== transactionIds.length
  ) throw new Error('projected issuance confirmation heights differ');
  const firstCycle = projectedCycle(result.firstCycle, 'projected first cycle');
  const secondCycle = projectedCycle(result.secondCycle, 'projected second cycle');
  if (
    firstCycle.mintIdentityHex === secondCycle.mintIdentityHex
    || firstCycle.trackerTransactionIdHex === secondCycle.trackerTransactionIdHex
    || firstCycle.payoutTransactionIdHex === secondCycle.payoutTransactionIdHex
    || firstCycle.amountNanoErg !== '20000000'
    || secondCycle.amountNanoErg !== firstCycle.amountNanoErg
    || firstCycle.burnGrossAmountNanoErg !== '15000000'
    || secondCycle.burnGrossAmountNanoErg !== firstCycle.burnGrossAmountNanoErg
    || firstCycle.burnNetAmountNanoErg !== '10000000'
    || secondCycle.burnNetAmountNanoErg !== firstCycle.burnNetAmountNanoErg
    || firstCycle.payoutAmountNanoErg !== firstCycle.burnNetAmountNanoErg
    || secondCycle.payoutAmountNanoErg !== secondCycle.burnNetAmountNanoErg
  ) throw new Error('projected two-cycle identities or conservation differ');
  const checks = exactRecord(result.checks, [
    'completedCycles', 'nativeAndErgoCleanupCompletedBeforeReturn',
    'cycleIdentitiesDistinct', 'createOnlyWorkerTransportRequired',
  ], 'projected result checks');
  if (
    checks.completedCycles !== 2
    || checks.nativeAndErgoCleanupCompletedBeforeReturn !== true
    || checks.cycleIdentitiesDistinct !== true
    || checks.createOnlyWorkerTransportRequired !== true
  ) throw new Error('projected two-cycle checks differ');
  const boundaries = exactRecord(result.boundaries, [
    'fixedSyntheticLoopbackProfile', 'trustedHostAndCachesRequired',
    'independentlyReproducibleBuildEstablished',
    'independentOperatorCustodyEstablished', 'publicNetworkUsed',
    'realFundsUsed', 'releaseReadinessEstablished',
    'productionReadinessEstablished',
  ], 'projected result boundaries');
  if (
    boundaries.fixedSyntheticLoopbackProfile !== true
    || boundaries.trustedHostAndCachesRequired !== true
    || boundaries.independentlyReproducibleBuildEstablished !== false
    || boundaries.independentOperatorCustodyEstablished !== false
    || boundaries.publicNetworkUsed !== false
    || boundaries.realFundsUsed !== false
    || boundaries.releaseReadinessEstablished !== false
    || boundaries.productionReadinessEstablished !== false
  ) throw new Error('projected two-cycle boundaries differ');
  const { receiptDigestHex, ...body } = result;
  if (
    lowerHex(receiptDigestHex, 32, 'projected result digest')
      !== sha256CanonicalJson(body, 'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_RESULT_V1')
  ) throw new Error('native two-cycle projected result digest differs');
  assertNoLocalPath(result);
  return result as unknown as Readonly<SubstrateFederatedNativeTwoCycleResultV1>;
}

function projectedCycle(
  value: unknown,
  label: string,
): Record<string, unknown> {
  const cycle = exactRecord(value, [
    'pegIn', 'mintIdentityHex', 'sourceProofReceiptDigestHex',
    'amountNanoErg', 'burnGrossAmountNanoErg', 'burnNetAmountNanoErg',
    'trackerTransactionIdHex', 'payoutTransactionIdHex',
    'payoutAmountNanoErg',
  ], label);
  const pegIn = exactRecord(cycle.pegIn, [
    'sourceLockTransactionIdHex', 'reserveTransitionTransactionIdHex',
    'sourceLockBoxIdHex', 'reserveSuccessorBoxIdHex', 'mintIdentityHex',
    'sourceProofReceiptDigestHex',
  ], `${label} peg-in`);
  for (const [key, field] of Object.entries(pegIn)) {
    flexibleHex(field, 32, `${label} peg-in ${key}`);
  }
  for (const key of [
    'mintIdentityHex', 'sourceProofReceiptDigestHex',
    'trackerTransactionIdHex', 'payoutTransactionIdHex',
  ]) flexibleHex(cycle[key], 32, `${label} ${key}`);
  if (
    cycle.mintIdentityHex !== pegIn.mintIdentityHex
    || cycle.sourceProofReceiptDigestHex !== pegIn.sourceProofReceiptDigestHex
  ) throw new Error(`${label} differs from its peg-in`);
  for (const key of [
    'amountNanoErg', 'burnGrossAmountNanoErg', 'burnNetAmountNanoErg',
    'payoutAmountNanoErg',
  ]) canonicalDecimal(cycle[key], `${label} ${key}`);
  return cycle;
}

function createAttemptDirectory(path: string): string {
  mkdirSync(path, { recursive: false, mode: 0o700 });
  const status = lstatSync(path);
  const canonical = realpathSync.native(path);
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || canonicalPathIdentity(canonical) !== canonicalPathIdentity(path)
  ) throw new Error('native two-cycle attempt directory identity changed');
  return canonical;
}

function assertSameCapture(
  first: Readonly<ReturnType<typeof loadSubstrateFederatedNativeTwoCycleInvocationV1>>,
  second: Readonly<ReturnType<typeof loadSubstrateFederatedNativeTwoCycleInvocationV1>>,
): void {
  if (
    first.configSha256Hex !== second.configSha256Hex
    || first.pathIdentityDigestHex !== second.pathIdentityDigestHex
    || canonicalJson(first.config) !== canonicalJson(second.config)
  ) throw new Error('captured native two-cycle invocation differs');
}

function assertSameEnvironment(
  first: Readonly<SubstrateFederatedNativeTwoCycleEnvironmentV1>,
  second: Readonly<SubstrateFederatedNativeTwoCycleEnvironmentV1>,
): void {
  if (
    first.repository.commit !== second.repository.commit
    || first.repository.tree !== second.repository.tree
    || first.toolIdentityDigestHex !== second.toolIdentityDigestHex
    || first.runtime.nodeExecutableSha256 !== second.runtime.nodeExecutableSha256
    || first.runtime.relayerPackageLockSha256 !== second.runtime.relayerPackageLockSha256
    || first.runtime.gitExecutableSha256 !== second.runtime.gitExecutableSha256
  ) throw new Error('native two-cycle repository or runtime identity changed');
}

async function boundedPostcheck(
  invocation: Readonly<ReturnType<typeof loadSubstrateFederatedNativeTwoCycleInvocationV1>>,
  before: Readonly<SubstrateFederatedNativeTwoCycleEnvironmentV1>,
): Promise<boolean> {
  try {
    const after =
      await validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1(
        loadSubstrateFederatedNativeTwoCycleInvocationV1(
          join(invocation.attemptPath, 'config.json'),
          invocation.attemptPath,
        ),
      );
    assertSameEnvironment(before, after);
    return true;
  } catch {
    return false;
  }
}

function parseArguments(argv: readonly string[]): string {
  if (
    argv.length !== 2
    || argv[0] !== '--config'
    || argv[1] === undefined
    || argv[1].length === 0
    || argv[1].startsWith('--')
  ) throw new Error('native two-cycle invocation arguments are invalid');
  return argv[1];
}

function childEnvironment(
  config: Readonly<ReturnType<typeof loadSubstrateFederatedNativeTwoCycleInvocationV1>>['config'],
  gitExecutablePath: string,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of [
    'PATHEXT',
    'ComSpec', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'HOME',
    'LOCALAPPDATA', 'APPDATA', 'RUSTUP_HOME', 'LIB',
    'LIBPATH', 'INCLUDE',
  ]) {
    const value = process.env[key];
    if (value !== undefined && value.length > 0) environment[key] = value;
  }
  const configuredSystemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? process.env.WINDIR;
  if (configuredSystemRoot === undefined) throw new Error('worker SystemRoot is required');
  const systemRoot = realpathSync.native(configuredSystemRoot);
  environment.SystemRoot = systemRoot;
  environment.WINDIR = systemRoot;
  environment.SystemDrive = parse(systemRoot).root.replace(/[\\/]+$/u, '');
  const inheritedPath = process.env.Path ?? process.env.PATH;
  environment.PATH = [dirname(gitExecutablePath), ...(inheritedPath ? [inheritedPath] : [])].join(delimiter);
  environment.JAVA_HOME = dirname(dirname(config.ergoJavaExecutablePath));
  environment.CARGO_HOME = config.frontierCargoHomeDirectory;
  return environment;
}

function classifyFailure(value: unknown): string {
  if (!(value instanceof Error)) return 'execution_failure';
  if (/timed out|termination|process tree/iu.test(value.message)) {
    return 'contained_process_failure';
  }
  if (/identity|changed|differs|checkout|runtime|tool|config/iu.test(value.message)) {
    return 'identity_validation_failure';
  }
  return 'execution_failure';
}

function exactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be one object`);
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== keys.length
    || keys.some(key => !Object.prototype.hasOwnProperty.call(record, key))
  ) throw new Error(`${label} fields differ from V1`);
  return record;
}

function lowerHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`, 'u').test(value)
  ) throw new Error(`${label} must be ${bytes} lowercase hexadecimal bytes`);
  return value;
}

function flexibleHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be hexadecimal`);
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  lowerHex(normalized, bytes, label);
  return value;
}

function hexArray(value: unknown, length: number, label: string): string[] {
  if (!Array.isArray(value) || value.length !== length) {
    throw new Error(`${label} must contain exactly ${length} values`);
  }
  const result = value.map((item, index) => lowerHex(item, 32, `${label} ${index}`));
  if (new Set(result).size !== result.length) throw new Error(`${label} must be distinct`);
  return result;
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function canonicalDecimal(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,30}$/u.test(value)) {
    throw new Error(`${label} must be a positive canonical decimal`);
  }
  return value;
}

function assertNoLocalPath(value: unknown): void {
  const visit = (current: unknown): void => {
    if (
      typeof current === 'string'
      && (/(?<![A-Za-z0-9])[A-Za-z]:[\\/]/u.test(current)
        || /^(?:\\\\|\/\/|\\[?.]\\|\\Device\\)/iu.test(current))
    ) throw new Error('native two-cycle terminal data must not contain local paths');
    if (Array.isArray(current)) current.forEach(visit);
    else if (current !== null && typeof current === 'object') {
      Object.values(current).forEach(visit);
    }
  };
  visit(value);
}

async function main(): Promise<void> {
  const result = await runSubstrateFederatedNativeTwoCycleFromArguments(
    process.argv.slice(2),
  );
  process.stdout.write(`${canonicalJson(result)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(() => {
    process.stderr.write('native two-cycle invocation failed\n');
    process.exitCode = 1;
  });
}
