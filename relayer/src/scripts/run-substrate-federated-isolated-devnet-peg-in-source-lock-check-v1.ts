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
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalPathIdentity,
  isPathInside,
  readBoundedRegularFile,
  writeNewFile,
} from '../create-only-out-of-repository-artifact.js';
import {
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import { runBoundedProcess } from '../pinned-local-native-verifier-build.js';
import {
  parseSubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1,
  type SubstrateFederatedIsolatedDevnetPegInPlanV1,
  type SubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-receipt-v1.js';

const WORKER_TIMEOUT_MS = 90 * 60_000;
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_WORKER_OUTPUT_BYTES = 512 * 1024;
const COMMAND_RECEIPT_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-peg-in-source-lock-check-command-receipt.v1';
const COMMAND_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PEG_IN_SOURCE_LOCK_CHECK_COMMAND_RECEIPT_V1';
const ERGO_POSITIVE_LONG_MAX = 0x7fff_ffff_ffff_ffffn;
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

export interface SubstrateFederatedIsolatedDevnetPegInSourceLockCheckCommandV1Result {
  readonly status: 'isolated_peg_in_source_lock_check_receipt_published';
  readonly receiptDigestHex: string;
}

export async function runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckCommandFromArgumentsV1(
  argv: readonly string[],
): Promise<Readonly<SubstrateFederatedIsolatedDevnetPegInSourceLockCheckCommandV1Result>> {
  const args = parseArguments(argv);
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const relayerRoot = resolve(scriptDirectory, '..', '..');
  const bridgeRoot = resolve(relayerRoot, '..');
  const worktreeRoot = resolve(bridgeRoot, '..');
  const request = readBoundedRegularFile(
    explicitExistingLocalNonSensitivePath(
      args.requestPath,
      'peg-in source-lock request',
      'file',
    ),
    'peg-in source-lock request',
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
    throw new Error('peg-in source-lock request and output must be distinct');
  }
  const workerPath = resolve(
    scriptDirectory,
    'run-substrate-federated-isolated-devnet-peg-in-source-lock-check-worker-v1.ts',
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
    env: childEnvironment(),
    timeoutMs: WORKER_TIMEOUT_MS,
    terminationGraceMs: 30_000,
    maxOutputBytes: MAX_WORKER_OUTPUT_BYTES + 64 * 1024,
    maxStdoutBytes: MAX_WORKER_OUTPUT_BYTES,
    maxStderrBytes: 64 * 1024,
    label: 'isolated peg-in source-lock check worker',
  });
  if (result.stderr !== '') {
    throw new Error('isolated peg-in source-lock worker emitted diagnostics');
  }
  const executionReceipt =
    parseSubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1(
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
    throw new Error('peg-in source-lock receipt output identity changed');
  }
  publishCreateOnlyReceipt(
    revalidatedOutputPath,
    Buffer.from(`${canonicalJson(receipt)}\n`, 'utf8'),
  );
  return Object.freeze({
    status: 'isolated_peg_in_source_lock_check_receipt_published' as const,
    receiptDigestHex: receipt.receiptDigestHex,
  });
}

function buildCommandReceipt(
  commandRequestSha256Hex: string,
  pegIn: Readonly<SubstrateFederatedIsolatedDevnetPegInPlanV1>,
  executionReceipt: Readonly<
    SubstrateFederatedIsolatedDevnetPegInSourceLockWorkerReceiptV1
  >,
) {
  const body = {
    schema: COMMAND_RECEIPT_SCHEMA,
    version: 1 as const,
    status: 'request_bound_local_peg_in_source_lock_check_completed' as const,
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
      signedTransactionBytesReturnedOrPersisted: false as const,
      physicalSecretMemoryErasureEstablished: false as const,
      hostileSameUserProcessAttestationEstablished: false as const,
      independentExecutionAttestationEstablished: false as const,
      valuePathSubmissionAuthorityEstablished: false as const,
      valuePathBroadcastAuthorityEstablished: false as const,
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
    throw new Error('isolated peg-in source-lock arguments are invalid');
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
    throw new Error('isolated peg-in source-lock plan is invalid');
  }
  return Object.freeze({ amountNanoErg, recipientAddressHex });
}

function publishCreateOnlyReceipt(path: string, bytes: Uint8Array): void {
  const parentPath = dirname(path);
  const stagingDirectory = mkdtempSync(join(
    parentPath,
    '.e2s-peg-in-source-lock-receipt-',
  ));
  const stagingPath = join(stagingDirectory, 'receipt.json');
  let executionError: unknown;
  let finalReceiptCommitted = false;
  try {
    writeNewFile(stagingPath, bytes, 'isolated source-lock staged receipt');
    const staged = lstatSync(stagingPath);
    if (
      !staged.isFile()
      || staged.isSymbolicLink()
      || staged.size !== bytes.byteLength
    ) {
      throw new Error('isolated source-lock staged receipt changed');
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
    'peg-in source-lock receipt output',
  );
  assertPathAbsent(outputPath, 'peg-in source-lock receipt output');
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
      'peg-in source-lock receipt output parent must be one regular directory',
    );
  }
  if (isPathInside(realpathSync(worktreeRoot), outputPath)) {
    throw new Error(
      'peg-in source-lock receipt output must remain outside the worktree',
    );
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

function assertNoLocalPathValue(value: unknown): void {
  const visit = (current: unknown): void => {
    if (
      typeof current === 'string'
      && (
        /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/u.test(current)
        || /^(?:\\\\|\/\/)/u.test(current)
      )
    ) {
      throw new Error('peg-in source-lock receipt must not contain local paths');
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
    await runSubstrateFederatedIsolatedDevnetPegInSourceLockCheckCommandFromArgumentsV1(
      process.argv.slice(2),
    );
  process.stdout.write(`${canonicalJson(result)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(() => {
    process.stderr.write('isolated peg-in source-lock check failed\n');
    process.exitCode = 1;
  });
}
