import { createHash } from 'node:crypto';
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
} from 'node:fs';
import { delimiter, dirname, isAbsolute, join, resolve, win32 } from 'node:path';
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
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import { runBoundedProcess } from '../pinned-local-native-verifier-build.js';
import {
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1,
} from '../relayer-core/substrate-federated-isolated-devnet-receipt-data-safety-v1.js';
import {
  parseSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1,
  type SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-receipt-v1.js';
import type {
  SubstrateFederatedIsolatedDevnetPegInPlanV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-receipt-v1.js';

const WORKER_TIMEOUT_MS = 90 * 60_000;
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_WORKER_OUTPUT_BYTES = 2 * 1024 * 1024;
const COMMAND_RECEIPT_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-execution-command-receipt.v1';
const COMMAND_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_EXECUTION_COMMAND_RECEIPT_V1';
const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
const CHILD_DIRECTORY_ENVIRONMENT_KEYS = Object.freeze([
  'USERPROFILE',
  'HOME',
  'LOCALAPPDATA',
  'APPDATA',
  'CARGO_HOME',
  'RUSTUP_HOME',
  'JAVA_HOME',
] as const);
const CHILD_PATH_LIST_ENVIRONMENT_KEYS = Object.freeze([
  'LIB',
  'LIBPATH',
  'INCLUDE',
] as const);

export interface SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCommandV1Result {
  readonly status: 'isolated_peg_in_source_lock_execution_receipt_published';
  readonly receiptDigestHex: string;
}

export async function runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCommandFromArgumentsV1(
  argv: readonly string[],
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCommandV1Result>> {
  const args = parseArguments(argv);
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const relayerRoot = resolve(scriptDirectory, '..', '..');
  const inferredBridgeRoot = resolve(relayerRoot, '..');
  const { bridgeRoot, worktreeRoot } =
    resolveBridgeRepositoryRootsFromCheckoutLayout(inferredBridgeRoot);
  const request = readBoundedRegularFile(
    explicitExistingLocalNonSensitivePath(
      args.requestPath,
      'peg-in source-lock execution request',
      'file',
    ),
    'peg-in source-lock execution request',
    MAX_REQUEST_BYTES,
  );
  const commandRequestSha256Hex = createHash('sha256')
    .update(request.bytes)
    .digest('hex');
  const outputPath = assertCreateOnlyOutput(args.outputPath, worktreeRoot);
  if (
    canonicalPathIdentity(request.canonicalPath)
      === canonicalPathIdentity(outputPath)
  ) {
    throw new Error(
      'peg-in source-lock execution request and output must be distinct',
    );
  }
  const workerPath = resolve(
    scriptDirectory,
    'run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-worker-v1.ts',
  );
  const result = await runBoundedProcess({
    executablePath: process.execPath,
    args: [
      'node_modules/tsx/dist/cli.mjs',
      workerPath,
      '--request',
      request.canonicalPath,
      '--expected-request-sha256',
      commandRequestSha256Hex,
      '--amount-nano-erg',
      args.pegIn.amountNanoErg,
      '--recipient-address-hex',
      args.pegIn.recipientAddressHex,
    ],
    cwd: relayerRoot,
    env: childEnvironment(worktreeRoot),
    timeoutMs: WORKER_TIMEOUT_MS,
    terminationGraceMs: 30_000,
    maxOutputBytes: MAX_WORKER_OUTPUT_BYTES + 64 * 1024,
    maxStdoutBytes: MAX_WORKER_OUTPUT_BYTES,
    maxStderrBytes: 64 * 1024,
    label: 'isolated peg-in source-lock execution worker',
  });
  if (result.stderr !== '') {
    throw new Error(
      'isolated peg-in source-lock execution worker emitted diagnostics',
    );
  }
  const executionReceipt =
    parseSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1(
      result.stdout,
      commandRequestSha256Hex,
      args.pegIn,
    );
  const receipt = buildCommandReceipt(
    commandRequestSha256Hex,
    args.pegIn,
    executionReceipt,
  );
  const revalidatedOutputPath = assertCreateOnlyOutput(
    args.outputPath,
    worktreeRoot,
  );
  if (
    canonicalPathIdentity(revalidatedOutputPath)
      !== canonicalPathIdentity(outputPath)
  ) {
    throw new Error('peg-in source-lock execution output identity changed');
  }
  publishCreateOnlyReceipt(
    revalidatedOutputPath,
    Buffer.from(`${canonicalJson(receipt)}\n`, 'utf8'),
  );
  return Object.freeze({
    status: 'isolated_peg_in_source_lock_execution_receipt_published' as const,
    receiptDigestHex: receipt.receiptDigestHex,
  });
}

function buildCommandReceipt(
  commandRequestSha256Hex: string,
  pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
  executionReceipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInSourceLockExecutionWorkerReceiptV1
  >,
) {
  const body = {
    schema: COMMAND_RECEIPT_SCHEMA,
    version: 1 as const,
    status: 'request_bound_local_peg_in_source_lock_execution_completed' as const,
    commandRequestSha256Hex,
    pegIn,
    executionReceipt,
    checks: {
      exactRequestBytesBoundAcrossParentAndWorker: true as const,
      exactPegInPlanBoundAcrossParentAndWorker: true as const,
      executionReceiptValidatedBeforePublication: true as const,
      workerExitedBeforePublication: true as const,
      outputConfinementRevalidatedImmediatelyBeforePublication: true as const,
      createOnlyPublicationUsed: true as const,
    },
    boundaries: {
      sourceLockCreationConfirmed: true as const,
      sourceLockStillRefundable: true as const,
      signedTransactionBytesReturnedOrPersisted: false as const,
      physicalSecretMemoryErasureEstablished: false as const,
      hostileSameUserProcessAttestationEstablished: false as const,
      independentExecutionAttestationEstablished: false as const,
      sourceLockConsumptionEstablished: false as const,
      reserveLineageEstablished: false as const,
      mintAuthorized: false as const,
      fundsAuthorityEstablished: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const receipt = Object.freeze({
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      COMMAND_RECEIPT_DIGEST_DOMAIN,
    ),
  });
  assertSubstrateFederatedIsolatedDevnetReceiptDataSafeV1(receipt);
  assertNoLocalPathValue(receipt);
  return receipt;
}

function parseArguments(argv: readonly string[]): Readonly<{
  requestPath: string;
  outputPath: string;
  pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>;
}> {
  if (
    argv.length !== 8
    || argv[0] !== '--request'
    || argv[1] === undefined
    || argv[1].length === 0
    || argv[1].startsWith('--')
    || argv[2] !== '--amount-nano-erg'
    || argv[3] === undefined
    || argv[4] !== '--recipient-address-hex'
    || argv[5] === undefined
    || argv[6] !== '--output'
    || argv[7] === undefined
    || argv[7].length === 0
    || argv[7].startsWith('--')
  ) {
    throw new Error(
      'isolated peg-in source-lock execution arguments are invalid',
    );
  }
  return Object.freeze({
    requestPath: argv[1],
    outputPath: argv[7],
    pegIn: normalizePegInPlan(argv[3], argv[5]),
  });
}

function normalizePegInPlan(
  amountNanoErg: string,
  recipientAddressHex: string,
): Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1> {
  if (
    !/^[1-9][0-9]*$/u.test(amountNanoErg)
    || BigInt(amountNanoErg) > ERGO_POSITIVE_LONG_MAX
    || !/^[0-9a-f]{40}$/u.test(recipientAddressHex)
    || /^0{40}$/u.test(recipientAddressHex)
  ) {
    throw new Error('isolated peg-in source-lock execution plan is invalid');
  }
  return Object.freeze({ amountNanoErg, recipientAddressHex });
}

export function publishCreateOnlyReceipt(
  path: string,
  bytes: Uint8Array,
  stagingPrefix = '.e2s-peg-in-source-lock-execution-receipt-',
  receiptLabel = 'isolated source-lock execution staged receipt',
): void {
  const parentPath = dirname(path);
  const stagingDirectory = mkdtempSync(join(parentPath, stagingPrefix));
  const stagingPath = join(stagingDirectory, 'receipt.json');
  let executionError: unknown;
  let finalReceiptCommitted = false;
  try {
    writeNewFile(
      stagingPath,
      bytes,
      receiptLabel,
    );
    const staged = lstatSync(stagingPath);
    if (
      !staged.isFile()
      || staged.isSymbolicLink()
      || staged.size !== bytes.byteLength
    ) {
      throw new Error('isolated source-lock execution staged receipt changed');
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

export function assertCreateOnlyOutput(
  value: string,
  worktreeRoot: string,
  label = 'peg-in source-lock execution receipt output',
): string {
  const outputPath = explicitLocalNonSensitivePath(
    value,
    label,
  );
  assertPathAbsent(outputPath, label);
  const parentPath = dirname(outputPath);
  const parent = lstatSync(parentPath);
  const canonicalParent = realpathSync(parentPath);
  if (
    !parent.isDirectory()
    || parent.isSymbolicLink()
    || canonicalPathIdentity(canonicalParent)
      !== canonicalPathIdentity(parentPath)
  ) {
    throw new Error(
      'peg-in source-lock execution output parent must be one regular directory',
    );
  }
  if (isPathInside(realpathSync(worktreeRoot), outputPath)) {
    throw new Error(
      'peg-in source-lock execution output must remain outside the worktree',
    );
  }
  return outputPath;
}

export function childEnvironment(
  worktreeRoot: string,
  options?: Readonly<{
    readonly cargoHomeDirectory?: string;
    readonly omitInheritedCargoHome?: boolean;
    readonly protocExecutablePath?: string;
  }>,
): NodeJS.ProcessEnv {
  if (
    options !== undefined
    && (
      options === null
      || typeof options !== 'object'
      || Array.isArray(options)
      || Object.keys(options).some(key => ![
        'cargoHomeDirectory',
        'omitInheritedCargoHome',
        'protocExecutablePath',
      ].includes(key))
      || (
        options.omitInheritedCargoHome !== undefined
        && typeof options.omitInheritedCargoHome !== 'boolean'
      )
      || (
        options.omitInheritedCargoHome === true
        && options.cargoHomeDirectory !== undefined
      )
    )
  ) {
    throw new Error('isolated worker environment options are invalid');
  }
  const canonicalWorktreeRoot = realpathSync(worktreeRoot);
  const cargoHomeOverride = options?.cargoHomeDirectory === undefined
    ? undefined
    : safeEnvironmentPath(
      options.cargoHomeDirectory,
      'CARGO_HOME override',
      'directory',
      canonicalWorktreeRoot,
    );
  const systemRoot = safeEnvironmentPath(
    process.env.SystemRoot ?? process.env.SYSTEMROOT
      ?? process.env.WINDIR,
    'SystemRoot',
    'directory',
    canonicalWorktreeRoot,
  );
  const systemDriveRoot = localWindowsDriveRoot(systemRoot, 'SystemRoot');
  const worktreeDriveRoot = localWindowsDriveRoot(
    canonicalWorktreeRoot,
    'worktree root',
  );
  const allowedDriveRoots = [systemDriveRoot, worktreeDriveRoot].filter(
    (root, index, roots) => roots.findIndex(candidate =>
      canonicalPathIdentity(candidate) === canonicalPathIdentity(root)
    ) === index,
  );
  const protocOverride = options?.protocExecutablePath === undefined
    ? undefined
    : safeEnvironmentPath(
      options.protocExecutablePath,
      'PROTOC override',
      'file',
      canonicalWorktreeRoot,
    );
  const systemDrive = systemDriveRoot.replace(/[\\/]+$/u, '');
  const comSpec = safeEnvironmentPath(
    process.env.ComSpec ?? process.env.COMSPEC,
    'ComSpec',
    'file',
    canonicalWorktreeRoot,
    [systemDriveRoot],
  );
  const runtimeRoot = safeEnvironmentPath(
    dirname(canonicalWorktreeRoot),
    'isolated worker runtime root',
    'directory',
    canonicalWorktreeRoot,
    [worktreeDriveRoot],
  );
  const environment: NodeJS.ProcessEnv = {
    Path: safeEnvironmentPathList(
      process.env.Path ?? process.env.PATH,
      'Path',
      canonicalWorktreeRoot,
      allowedDriveRoots,
    ),
    SystemRoot: systemRoot,
    SystemDrive: systemDrive,
    WINDIR: systemRoot,
    ComSpec: comSpec,
    TEMP: runtimeRoot,
    TMP: runtimeRoot,
  };
  const pathExt = process.env.PATHEXT;
  if (
    pathExt !== undefined
    && /^(?:\.[A-Za-z0-9]+)(?:;\.[A-Za-z0-9]+)*$/u.test(pathExt)
  ) {
    environment.PATHEXT = pathExt;
  }
  for (const key of CHILD_DIRECTORY_ENVIRONMENT_KEYS) {
    if (
      key === 'CARGO_HOME'
      && (
        cargoHomeOverride !== undefined
        || options?.omitInheritedCargoHome === true
      )
    ) continue;
    const value = process.env[key];
    if (value !== undefined && value.length > 0) {
      environment[key] = safeEnvironmentPath(
        value,
        key,
        'directory',
        canonicalWorktreeRoot,
        allowedDriveRoots,
      );
    }
  }
  if (cargoHomeOverride !== undefined) {
    environment.CARGO_HOME = cargoHomeOverride;
  }
  if (protocOverride !== undefined) {
    environment.PROTOC = protocOverride;
  }
  for (const key of CHILD_PATH_LIST_ENVIRONMENT_KEYS) {
    const value = process.env[key];
    if (value !== undefined && value.length > 0) {
      environment[key] = safeEnvironmentPathList(
        value,
        key,
        canonicalWorktreeRoot,
        allowedDriveRoots,
      );
    }
  }
  return environment;
}

function safeEnvironmentPath(
  value: unknown,
  label: string,
  kind: 'file' | 'directory',
  canonicalWorktreeRoot: string,
  allowedDriveRoots?: readonly string[],
): string {
  const path = explicitExistingLocalNonSensitivePath(value, label, kind);
  if (
    canonicalPathIdentity(path) === canonicalPathIdentity(canonicalWorktreeRoot)
    || isPathInside(canonicalWorktreeRoot, path)
  ) {
    throw new Error(`${label} must remain outside the worktree`);
  }
  if (
    allowedDriveRoots !== undefined
    && !environmentPathUsesAllowedLocalDrive(path, allowedDriveRoots)
  ) {
    throw new Error(`${label} must remain on an allowed local drive`);
  }
  return path;
}

function safeEnvironmentPathList(
  value: unknown,
  label: string,
  canonicalWorktreeRoot: string,
  allowedDriveRoots: readonly string[],
): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must contain local executable directories`);
  }
  const paths: string[] = [];
  for (const entry of value.split(delimiter)) {
    if (entry.length === 0) continue;
    if (
      !isAbsolute(entry)
      || hasSensitivePath(entry)
      || hasRemoteOrDeviceNamespace(entry)
    ) {
      throw new Error(`${label} contains an unsafe path`);
    }
    const lexicalPath = resolve(entry);
    if (
      label === 'Path'
      && (
        canonicalPathIdentity(lexicalPath)
          === canonicalPathIdentity(canonicalWorktreeRoot)
        || isPathInside(canonicalWorktreeRoot, lexicalPath)
      )
    ) {
      continue;
    }
    let path: string;
    try {
      path = explicitExistingLocalNonSensitivePath(
        entry,
        label,
        'directory',
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    if (
      canonicalPathIdentity(path) === canonicalPathIdentity(canonicalWorktreeRoot)
      || isPathInside(canonicalWorktreeRoot, path)
    ) {
      if (label === 'Path') continue;
      throw new Error(`${label} must remain outside the worktree`);
    }
    if (!environmentPathUsesAllowedLocalDrive(path, allowedDriveRoots)) {
      throw new Error(`${label} must remain on an allowed local drive`);
    }
    if (!paths.some(existing =>
      canonicalPathIdentity(existing) === canonicalPathIdentity(path)
    )) {
      paths.push(path);
    }
  }
  if (paths.length === 0) {
    throw new Error(`${label} must contain local executable directories`);
  }
  return paths.join(delimiter);
}

export function environmentPathUsesAllowedLocalDrive(
  path: string,
  allowedDriveRoots: readonly string[],
): boolean {
  const driveRoot = win32.parse(path).root;
  return isWindowsLocalDriveRoot(driveRoot) && allowedDriveRoots.some(root =>
    isWindowsLocalDriveRoot(root)
      && canonicalPathIdentity(root) === canonicalPathIdentity(driveRoot)
  );
}

function localWindowsDriveRoot(path: string, label: string): string {
  const driveRoot = win32.parse(path).root;
  if (!isWindowsLocalDriveRoot(driveRoot)) {
    throw new Error(`${label} must resolve to one local Windows drive`);
  }
  return driveRoot;
}

function isWindowsLocalDriveRoot(value: string): boolean {
  return /^[A-Za-z]:[\\/]$/u.test(value);
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

export function explicitExistingLocalNonSensitivePath(
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

export function assertNoLocalPathValue(
  value: unknown,
  label = 'peg-in source-lock execution receipt',
): void {
  const visit = (current: unknown): void => {
    if (
      typeof current === 'string'
      && (
        /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/u.test(current)
        || /^(?:\\\\|\/\/)/u.test(current)
      )
    ) {
      throw new Error(
        `${label} must not contain local paths`,
      );
    }
    if (Array.isArray(current)) current.forEach(visit);
    else if (current !== null && typeof current === 'object') {
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
    await runSubstrateFederatedIsolatedDevnetPegInSourceLockExecutionCommandFromArgumentsV1(
      process.argv.slice(2),
    );
  process.stdout.write(`${canonicalJson(result)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(() => {
    process.stderr.write('isolated peg-in source-lock execution failed\n');
    process.exitCode = 1;
  });
}
