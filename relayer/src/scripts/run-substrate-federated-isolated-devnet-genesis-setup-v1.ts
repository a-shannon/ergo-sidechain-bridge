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
  assertNoDuplicateJsonKeys,
  canonicalJson,
  sha256CanonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import { runBoundedProcess } from '../pinned-local-native-verifier-build.js';
import {
  assertExactBuildReceipt,
} from './run-substrate-federated-isolated-devnet-bootstrap-v1.js';

const WORKER_TIMEOUT_MS = 90 * 60_000;
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_WORKER_OUTPUT_BYTES = 2 * 1024 * 1024;
const ROOT_RECEIPT_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-genesis-setup-execution-root.v1';
const ROOT_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_EXECUTION_ROOT_V1';
const COMMAND_RECEIPT_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-genesis-setup-command-receipt.v1';
const COMMAND_RECEIPT_DIGEST_DOMAIN =
  'E2S_SUBSTRATE_FEDERATED_ISOLATED_DEVNET_GENESIS_SETUP_COMMAND_RECEIPT_V1';
const EXPECTED_STATIC_EXECUTION_MANIFEST_DIGEST_HEX =
  '429dda22a5e5e3c0b62a03bb3c8bd3eacb7339e6603bcf58f6d07ffbbb79adc5';
const ROLE_ORDER = Object.freeze([
  'tracker',
  'duplicatePrevention',
  'pooledReserve',
] as const);
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

export interface SubstrateFederatedIsolatedDevnetGenesisSetupCommandV1Result {
  readonly status: 'isolated_genesis_setup_execution_receipt_published';
  readonly receiptDigestHex: string;
}

export async function runSubstrateFederatedIsolatedDevnetGenesisSetupCommandFromArgumentsV1(
  argv: readonly string[],
): Promise<Readonly<SubstrateFederatedIsolatedDevnetGenesisSetupCommandV1Result>> {
  const args = parseArguments(argv);
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const relayerRoot = resolve(scriptDirectory, '..', '..');
  const bridgeRoot = resolve(relayerRoot, '..');
  const worktreeRoot = resolve(bridgeRoot, '..');
  const request = readBoundedRegularFile(
    explicitExistingLocalNonSensitivePath(
      args.requestPath,
      'genesis setup request',
      'file',
    ),
    'genesis setup request',
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
    throw new Error('genesis setup request and output must be distinct');
  }
  const workerPath = resolve(
    scriptDirectory,
    'run-substrate-federated-isolated-devnet-genesis-setup-worker-v1.ts',
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
    ],
    cwd: relayerRoot,
    env: childEnvironment(),
    timeoutMs: WORKER_TIMEOUT_MS,
    terminationGraceMs: 30_000,
    maxOutputBytes: MAX_WORKER_OUTPUT_BYTES + 64 * 1024,
    maxStdoutBytes: MAX_WORKER_OUTPUT_BYTES,
    maxStderrBytes: 64 * 1024,
    label: 'isolated genesis setup execution worker',
  });
  if (result.stderr !== '') {
    throw new Error('isolated genesis setup worker emitted diagnostics');
  }
  const executionReceipt = parseSanitizedExecutionReceipt(result.stdout);
  const receipt = buildCommandReceipt(
    commandRequestSha256Hex,
    executionReceipt,
  );
  publishCreateOnlyReceipt(
    outputPath,
    Buffer.from(`${canonicalJson(receipt)}\n`, 'utf8'),
  );
  return Object.freeze({
    status: 'isolated_genesis_setup_execution_receipt_published' as const,
    receiptDigestHex: receipt.receiptDigestHex as string,
  });
}

function buildCommandReceipt(
  commandRequestSha256Hex: string,
  executionReceipt: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const body = {
    schema: COMMAND_RECEIPT_SCHEMA,
    version: 1 as const,
    status: 'request_bound_local_genesis_setup_execution_completed' as const,
    commandRequestSha256Hex,
    executionReceipt,
    checks: {
      exactRequestBytesBoundAcrossParentAndWorker: true as const,
      executionReceiptValidatedBeforePublication: true as const,
      createOnlyPublicationUsed: true as const,
    },
    boundaries: {
      hostileSameUserProcessAttestationEstablished: false as const,
      independentExecutionAttestationEstablished: false as const,
      publicNetworkUsed: false as const,
      realFundsUsed: false as const,
      gate5Closed: false as const,
      trustlessStatusEstablished: false as const,
      productionReadinessEstablished: false as const,
    },
  };
  const receipt = {
    ...body,
    receiptDigestHex: sha256CanonicalJson(
      body,
      COMMAND_RECEIPT_DIGEST_DOMAIN,
    ),
  };
  assertNoLocalPathValue(receipt);
  return receipt;
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
    throw new Error('isolated genesis setup arguments are invalid');
  }
  return Object.freeze({ requestPath: argv[1], outputPath: argv[3] });
}

function parseSanitizedExecutionReceipt(
  stdout: string,
): Record<string, unknown> {
  assertNoDuplicateJsonKeys(stdout);
  const value = JSON.parse(stdout) as unknown;
  if (stdout !== `${canonicalJson(value)}\n`) {
    throw new Error(
      'genesis setup worker output must be canonical JSON plus one LF',
    );
  }
  const receipt = exactRecord(value, [
    'schema',
    'version',
    'status',
    'staticExecutionManifestDigestHex',
    'build',
    'process',
    'lifecycle',
    'transactions',
    'checks',
    'boundaries',
    'receiptDigestHex',
  ], 'genesis setup execution receipt');
  if (
    receipt.schema !== ROOT_RECEIPT_SCHEMA
    || receipt.version !== 1
    || receipt.status
      !== 'three_local_setup_transactions_canonically_confirmed'
    || receipt.staticExecutionManifestDigestHex
      !== EXPECTED_STATIC_EXECUTION_MANIFEST_DIGEST_HEX
  ) {
    throw new Error('genesis setup execution receipt identity is unsupported');
  }
  const process = assertExactSubstrateFederatedIsolatedDevnetSetupReceiptV1(
    receipt.build,
    receipt.process,
    receipt.lifecycle,
    receipt.transactions,
  );
  assertExpectedBooleanRecord(receipt.checks, {
    exactLockedPatchedNodeBuiltBeforeSignerCreation: true,
    staticExecutionModulesBound: true,
    replacementPortAccepted: false,
    exactCheckedCandidatesConsumedOnce: true,
    exactCanonicalRoleOrderEnforced: true,
    durableReservationPrecededTransport: true,
    predecessorConfirmationPrecededSuccessorAuthorization: true,
    allConfirmedAttemptsRevalidatedBeforeTeardown: true,
    temporaryJournalRemovedAfterResolution: true,
    returnedValueContainsCapabilities: false,
  }, 'genesis setup execution checks');
  assertExpectedBooleanRecord(receipt.boundaries, {
    localSyntheticCompatibilityOnly: true,
    localSetupTargetNodeAcceptanceEstablished: true,
    localSetupSubmissionExecuted: true,
    localSetupBroadcastExecuted: true,
    publicNetworkUsed: false,
    realFundsUsed: false,
    existingWalletMaterialUsed: false,
    processLossRecoveryEstablished: false,
    sourceConsensusIndependentlyAuthenticated: false,
    ergoConsensusIndependentlyAuthenticated: false,
    profileActivated: false,
    fundsAuthorityEstablished: false,
    gate5Closed: false,
    trustlessStatusEstablished: false,
    productionReadinessEstablished: false,
  }, 'genesis setup execution boundaries');
  const receiptDigestHex = fixedHex(
    receipt.receiptDigestHex,
    32,
    'genesis setup execution receipt digest',
  );
  const { receiptDigestHex: _digest, ...body } = receipt;
  if (
    sha256CanonicalJson(body, ROOT_RECEIPT_DIGEST_DOMAIN) !== receiptDigestHex
  ) {
    throw new Error('genesis setup execution receipt digest does not match');
  }
  assertNoLocalPathValue(receipt);
  return receipt;
}

export function assertExactSubstrateFederatedIsolatedDevnetSetupReceiptV1(
  buildValue: unknown,
  processValue: unknown,
  lifecycleValue: unknown,
  transactionsValue: unknown,
): Readonly<{
  buildIdentityDigestHex: string;
  processBindingDigestHex: string;
  executionTargetIdentityDigestHex: string;
  initialHeight: number;
  finalHeight: number;
}> {
  const buildIdentityDigestHex = assertExactBuildReceipt(buildValue);
  const process = assertExactExecutionProcessReceipt(processValue);
  if (process.buildIdentityDigestHex !== buildIdentityDigestHex) {
    throw new Error('genesis setup build and process identities differ');
  }
  assertExactLifecycleReceipt(
    lifecycleValue,
    process.executionTargetIdentityDigestHex,
  );
  assertExactTransactions(
    transactionsValue,
    process.initialHeight,
    process.finalHeight,
  );
  return Object.freeze({
    buildIdentityDigestHex,
    processBindingDigestHex: process.processBindingDigestHex,
    executionTargetIdentityDigestHex:
      process.executionTargetIdentityDigestHex,
    initialHeight: process.initialHeight,
    finalHeight: process.finalHeight,
  });
}

function assertExactExecutionProcessReceipt(value: unknown): Readonly<{
  buildIdentityDigestHex: string;
  processBindingDigestHex: string;
  executionTargetIdentityDigestHex: string;
  initialHeight: number;
  finalHeight: number;
}> {
  const receipt = exactRecord(value, [
    'schema',
    'version',
    'primaryNodeOrigin',
    'witnessNodeOrigin',
    'primaryMiningDuringAction',
    'witnessReadOnlyDuringAction',
    'buildIdentityDigestHex',
    'executableIdentityDigestHex',
    'processBindingDigestHex',
    'executionTargetIdentityDigestHex',
    'initialSnapshot',
    'finalSnapshot',
  ], 'genesis setup execution process receipt');
  if (
    receipt.schema
      !== 'e2s.substrate-federated-isolated-devnet-ergo-node-process.v1'
    || receipt.version !== 1
    || receipt.primaryNodeOrigin !== 'http://127.0.0.1:9051'
    || receipt.witnessNodeOrigin !== 'http://127.0.0.1:9052'
    || receipt.primaryMiningDuringAction !== true
    || receipt.witnessReadOnlyDuringAction !== true
  ) {
    throw new Error('genesis setup execution process identity changed');
  }
  const buildIdentityDigestHex = fixedHex(
    receipt.buildIdentityDigestHex,
    32,
    'genesis setup process build identity',
  );
  fixedHex(
    receipt.executableIdentityDigestHex,
    32,
    'genesis setup process executable identity',
  );
  const processBindingDigestHex = fixedHex(
    receipt.processBindingDigestHex,
    32,
    'genesis setup process binding',
  );
  const executionTargetIdentityDigestHex = fixedHex(
    receipt.executionTargetIdentityDigestHex,
    32,
    'genesis setup execution target identity',
  );
  const initialHeight = assertExactSnapshot(
    receipt.initialSnapshot,
    'initial',
  );
  const finalHeight = assertExactSnapshot(receipt.finalSnapshot, 'final');
  if (finalHeight <= initialHeight) {
    throw new Error('genesis setup execution process did not advance');
  }
  return Object.freeze({
    buildIdentityDigestHex,
    processBindingDigestHex,
    executionTargetIdentityDigestHex,
    initialHeight,
    finalHeight,
  });
}

function assertExactSnapshot(value: unknown, label: string): number {
  const snapshot = exactRecord(value, [
    'network',
    'fullHeight',
    'indexedHeight',
    'headerIdHex',
  ], `genesis setup ${label} snapshot`);
  if (
    snapshot.network !== 'devnet'
    || !positiveSafeInteger(snapshot.fullHeight)
    || snapshot.indexedHeight !== snapshot.fullHeight
  ) {
    throw new Error(`genesis setup ${label} snapshot changed`);
  }
  fixedHex(snapshot.headerIdHex, 32, `genesis setup ${label} header ID`);
  return snapshot.fullHeight as number;
}

function assertExactLifecycleReceipt(
  value: unknown,
  expectedExecutionTargetIdentityDigestHex: string,
): void {
  const lifecycle = exactRecord(value, [
    'federationProfileIdHex',
    'sourceAttestationKeySetDigestHex',
    'ergoAdmissionKeySetDigestHex',
    'packetReceiptDigestHex',
    'setupCheckReceiptDigestHex',
    'setupRequestDigestHex',
    'executionTargetIdentityDigestHex',
  ], 'genesis setup execution lifecycle');
  for (const [key, field] of Object.entries(lifecycle)) {
    fixedHex(field, 32, `genesis setup execution lifecycle ${key}`);
  }
  if (
    lifecycle.executionTargetIdentityDigestHex
      !== expectedExecutionTargetIdentityDigestHex
  ) {
    throw new Error('genesis setup lifecycle and process targets differ');
  }
}

function assertExactTransactions(
  value: unknown,
  initialHeight: number,
  finalHeight: number,
): void {
  if (!Array.isArray(value) || value.length !== ROLE_ORDER.length) {
    throw new Error('genesis setup execution transactions changed');
  }
  const transactionIds = new Set<string>();
  let predecessorHeight = initialHeight;
  for (let ordinal = 0; ordinal < ROLE_ORDER.length; ordinal += 1) {
    const transaction = exactRecord(value[ordinal], [
      'ordinal',
      'role',
      'expectedTxId',
      'transportStatus',
      'durableAttemptDigestHex',
      'journalDigestHex',
      'confirmationDigestHex',
      'confirmationHeight',
      'confirmationHeaderIdHex',
    ], `genesis setup execution transaction ${ordinal}`);
    if (
      transaction.ordinal !== ordinal
      || transaction.role !== ROLE_ORDER[ordinal]
      || !['accepted', 'ambiguous', 'reconciled'].includes(
        String(transaction.transportStatus),
      )
      || !positiveSafeInteger(transaction.confirmationHeight)
      || (transaction.confirmationHeight as number) <= predecessorHeight
      || (transaction.confirmationHeight as number) > finalHeight
    ) {
      throw new Error('genesis setup execution transaction changed');
    }
    predecessorHeight = transaction.confirmationHeight as number;
    const transactionId = fixedHex(
      transaction.expectedTxId,
      32,
      `genesis setup execution transaction ${ordinal} ID`,
    );
    if (transactionIds.has(transactionId)) {
      throw new Error('genesis setup transaction IDs must be distinct');
    }
    transactionIds.add(transactionId);
    for (const [key, field] of Object.entries(transaction)) {
      if (key.endsWith('DigestHex') || key === 'confirmationHeaderIdHex') {
        fixedHex(
          field,
          32,
          `genesis setup execution transaction ${ordinal} ${key}`,
        );
      }
    }
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

function publishCreateOnlyReceipt(path: string, bytes: Uint8Array): void {
  const parentPath = dirname(path);
  const stagingDirectory = mkdtempSync(join(
    parentPath,
    '.e2s-genesis-setup-receipt-',
  ));
  const stagingPath = join(stagingDirectory, 'receipt.json');
  let executionError: unknown;
  let finalReceiptCommitted = false;
  try {
    writeNewFile(stagingPath, bytes, 'isolated genesis setup staged receipt');
    const staged = lstatSync(stagingPath);
    if (
      !staged.isFile()
      || staged.isSymbolicLink()
      || staged.size !== bytes.byteLength
    ) {
      throw new Error('isolated genesis setup staged receipt changed');
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
    'genesis setup receipt output',
  );
  assertPathAbsent(outputPath, 'genesis setup receipt output');
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
      'genesis setup receipt output parent must be one regular directory',
    );
  }
  if (isPathInside(realpathSync(worktreeRoot), outputPath)) {
    throw new Error('genesis setup receipt output must remain outside the worktree');
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
      throw new Error('genesis setup receipt must not contain local paths');
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
    await runSubstrateFederatedIsolatedDevnetGenesisSetupCommandFromArgumentsV1(
      process.argv.slice(2),
    );
  process.stdout.write(`${canonicalJson(result)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(() => {
    process.stderr.write('isolated genesis setup execution failed\n');
    process.exitCode = 1;
  });
}
