import { randomUUID } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { basename, join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalPathIdentity,
  isPathInside,
  readBoundedRegularFile,
  writeNewFile,
} from '../create-only-out-of-repository-artifact.js';
import {
  acceptSubstrateFederatedAuthoritySafeDevnetV1,
} from '../substrate-federated-authority-safe-devnet-acceptance-v1.js';
import {
  collectSubstrateFederatedAuthoritySafeDevnetHistoryV1,
} from '../substrate-federated-authority-safe-devnet-history-v1.js';
import { canonicalJson } from '../strict-json.js';

const MAX_BASE_SPEC_BYTES = 16 * 1024 * 1024;

interface Arguments {
  readonly operation: 'accept' | 'history';
  readonly frontierSourcePath: string;
  readonly cargoExecutablePath: string;
  readonly rustcExecutablePath: string;
  readonly gitExecutablePath: string;
  readonly baseSpecPath: string;
  readonly expectedChainId: bigint;
  readonly bridgeAddress: string;
  readonly tokenAddress: string;
  readonly bridgeOwnerAddress: string;
  readonly expectedBaseSpecSha256Hex: string;
  readonly expectedFrontierCommit: string;
  readonly expectedFrontierPatchSha256Hex: string;
  readonly expectedRuntimeCodeSha256Hex: string;
  readonly expectedSudoAddress: string;
  readonly expectedFrontierBinaryVersion: string;
  readonly primaryRpcUrl: string;
  readonly witnessRpcUrl: string;
  readonly primaryP2pPort: number;
  readonly witnessP2pPort: number;
  readonly primaryPrometheusPort: number;
  readonly witnessPrometheusPort: number;
  readonly expectedNativeGenesisHashHex: string;
  readonly expectedNodeName: string;
  readonly expectedNodeVersion: string;
  readonly signedLegacyOwnerMintTransactionHex: string;
  readonly historyOutputDirectory?: string;
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const args = parseArguments(argv);
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const bridgeRoot = resolve(scriptDirectory, '..', '..', '..');
  const worktreeRoot = resolve(bridgeRoot, '..');
  const baseSpec = readBoundedRegularFile(
    resolve(args.baseSpecPath),
    'authority-safe base chain spec',
    MAX_BASE_SPEC_BYTES,
  );
  const acceptance = {
    worktreeRoot,
    bridgeRoot,
    frontierSourcePath: args.frontierSourcePath,
    cargoExecutablePath: args.cargoExecutablePath,
    rustcExecutablePath: args.rustcExecutablePath,
    gitExecutablePath: args.gitExecutablePath,
    baseSpecBytes: baseSpec.bytes,
    expectedChainId: args.expectedChainId,
    bridgeAddress: args.bridgeAddress,
    tokenAddress: args.tokenAddress,
    bridgeOwnerAddress: args.bridgeOwnerAddress,
    expectedBaseSpecSha256Hex: args.expectedBaseSpecSha256Hex,
    expectedFrontierCommit: args.expectedFrontierCommit,
    expectedFrontierPatchSha256Hex: args.expectedFrontierPatchSha256Hex,
    expectedRuntimeCodeSha256Hex: args.expectedRuntimeCodeSha256Hex,
    expectedSudoAddress: args.expectedSudoAddress,
    expectedFrontierBinaryVersion: args.expectedFrontierBinaryVersion,
    primaryRpcUrl: args.primaryRpcUrl,
    witnessRpcUrl: args.witnessRpcUrl,
    primaryP2pPort: args.primaryP2pPort,
    witnessP2pPort: args.witnessP2pPort,
    primaryPrometheusPort: args.primaryPrometheusPort,
    witnessPrometheusPort: args.witnessPrometheusPort,
    expectedNativeGenesisHashHex: args.expectedNativeGenesisHashHex,
    expectedNodeName: args.expectedNodeName,
    expectedNodeVersion: args.expectedNodeVersion,
    signedLegacyOwnerMintTransactionHex:
      args.signedLegacyOwnerMintTransactionHex,
  };
  if (args.historyOutputDirectory === undefined) {
    const result = await acceptSubstrateFederatedAuthoritySafeDevnetV1(
      acceptance,
    );
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const outputTarget = canonicalHistoryOutputTarget(
    args.historyOutputDirectory,
    worktreeRoot,
  );
  const history = await collectSubstrateFederatedAuthoritySafeDevnetHistoryV1({
    acceptance,
  });
  writeHistoryBundle(outputTarget, history);
  console.log(JSON.stringify(history.receipt, null, 2));
}

function writeHistoryBundle(
  target: Readonly<HistoryOutputTarget>,
  history: Awaited<
    ReturnType<typeof collectSubstrateFederatedAuthoritySafeDevnetHistoryV1>
  >,
): void {
  const stagingDirectory = join(
    target.parentDirectory,
    `.${basename(target.finalDirectory)}.partial-${randomUUID()}`,
  );
  mkdirSync(stagingDirectory, { mode: 0o700 });
  const stagingIdentity = lstatSync(stagingDirectory);
  let published = false;
  try {
    writeNewFile(
      join(stagingDirectory, 'acceptance.v1.json'),
      history.artifacts.acceptanceReport,
      'authority-safe acceptance report',
    );
    writeNewFile(
      join(stagingDirectory, 'reported-finalized-blocks.v1.json'),
      history.artifacts.reportedFinalizedBlocksManifest,
      'reported-finalized-block history',
    );
    writeNewFile(
      join(stagingDirectory, 'runtime-history.v1.json'),
      history.artifacts.runtimeHistoryManifest,
      'runtime history',
    );
    writeNewFile(
      join(stagingDirectory, 'application-history.v1.json'),
      history.artifacts.applicationHistoryManifest,
      'application history',
    );
    writeNewFile(
      join(stagingDirectory, 'history-receipt.v1.json'),
      Buffer.from(`${canonicalJson(history.receipt)}\n`, 'utf8'),
      'authority-safe history receipt',
    );
    assertSameDirectory(
      stagingDirectory,
      stagingIdentity,
      'staged history output',
    );
    assertSameDirectory(
      target.parentDirectory,
      target.parentIdentity,
      'history output parent',
    );
    assertPathAbsent(target.finalDirectory, 'history output directory');
    renameSync(stagingDirectory, target.finalDirectory);
    published = true;
    assertSameDirectory(
      target.finalDirectory,
      stagingIdentity,
      'published history output',
    );
  } catch (error) {
    if (published) throw error;
    try {
      removeStagingDirectory(target, stagingDirectory, stagingIdentity);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'history bundle construction and cleanup both failed',
      );
    }
    throw error;
  }
}

function parseArguments(argv: readonly string[]): Arguments {
  const values = new Map<string, string>();
  const allowed = new Set([
    '--operation',
    '--frontier-source',
    '--cargo',
    '--rustc',
    '--git',
    '--base-spec',
    '--expected-chain-id',
    '--bridge-address',
    '--token-address',
    '--bridge-owner-address',
    '--expected-base-spec-sha256',
    '--expected-frontier-commit',
    '--expected-frontier-patch-sha256',
    '--expected-runtime-code-sha256',
    '--expected-sudo-address',
    '--expected-frontier-binary-version',
    '--primary-rpc',
    '--witness-rpc',
    '--primary-p2p-port',
    '--witness-p2p-port',
    '--primary-prometheus-port',
    '--witness-prometheus-port',
    '--expected-genesis-hash',
    '--expected-node-name',
    '--expected-node-version',
    '--signed-owner-mint-transaction',
    '--history-output-directory',
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !allowed.has(key)) {
      throw new Error(
        `unknown authority-safe acceptance option: ${key ?? '<missing>'}`,
      );
    }
    if (!value || value.startsWith('--')) {
      throw new Error(`${key} requires one value`);
    }
    if (values.has(key)) throw new Error(`${key} must not be repeated`);
    values.set(key, value);
  }
  const chainId = required(values, '--expected-chain-id');
  if (!/^[1-9][0-9]*$/.test(chainId)) {
    throw new Error('--expected-chain-id must be a positive decimal integer');
  }
  const historyOutputDirectory = values.get('--history-output-directory');
  const requestedOperation = values.get('--operation');
  if (
    requestedOperation !== undefined
    && requestedOperation !== 'accept'
    && requestedOperation !== 'history'
  ) {
    throw new Error('--operation must be accept or history');
  }
  const operation = requestedOperation
    ?? (historyOutputDirectory === undefined ? 'accept' : 'history');
  if (operation === 'history' && historyOutputDirectory === undefined) {
    throw new Error(
      '--history-output-directory is required for the history operation',
    );
  }
  if (operation === 'accept' && historyOutputDirectory !== undefined) {
    throw new Error(
      '--history-output-directory is not valid for the accept operation',
    );
  }
  return {
    operation,
    frontierSourcePath: required(values, '--frontier-source'),
    cargoExecutablePath: required(values, '--cargo'),
    rustcExecutablePath: required(values, '--rustc'),
    gitExecutablePath: required(values, '--git'),
    baseSpecPath: required(values, '--base-spec'),
    expectedChainId: BigInt(chainId),
    bridgeAddress: required(values, '--bridge-address'),
    tokenAddress: required(values, '--token-address'),
    bridgeOwnerAddress: required(values, '--bridge-owner-address'),
    expectedBaseSpecSha256Hex: required(
      values,
      '--expected-base-spec-sha256',
    ),
    expectedFrontierCommit: required(values, '--expected-frontier-commit'),
    expectedFrontierPatchSha256Hex: required(
      values,
      '--expected-frontier-patch-sha256',
    ),
    expectedRuntimeCodeSha256Hex: required(
      values,
      '--expected-runtime-code-sha256',
    ),
    expectedSudoAddress: required(values, '--expected-sudo-address'),
    expectedFrontierBinaryVersion: required(
      values,
      '--expected-frontier-binary-version',
    ),
    primaryRpcUrl: required(values, '--primary-rpc'),
    witnessRpcUrl: required(values, '--witness-rpc'),
    primaryP2pPort: requiredPort(values, '--primary-p2p-port'),
    witnessP2pPort: requiredPort(values, '--witness-p2p-port'),
    primaryPrometheusPort: requiredPort(values, '--primary-prometheus-port'),
    witnessPrometheusPort: requiredPort(values, '--witness-prometheus-port'),
    expectedNativeGenesisHashHex: required(
      values,
      '--expected-genesis-hash',
    ),
    expectedNodeName: required(values, '--expected-node-name'),
    expectedNodeVersion: required(values, '--expected-node-version'),
    signedLegacyOwnerMintTransactionHex: required(
      values,
      '--signed-owner-mint-transaction',
    ),
    historyOutputDirectory,
  };
}

interface HistoryOutputTarget {
  readonly finalDirectory: string;
  readonly parentDirectory: string;
  readonly parentIdentity: Readonly<{ dev: number; ino: number }>;
}

function canonicalHistoryOutputTarget(
  value: string,
  worktreeRoot: string,
): Readonly<HistoryOutputTarget> {
  const requested = resolve(value);
  assertPathAbsent(requested, 'history output directory');
  const parentPath = dirname(requested);
  const stat = lstatSync(parentPath);
  const canonical = realpathSync(parentPath);
  if (
    !stat.isDirectory()
    || stat.isSymbolicLink()
    || canonicalPathIdentity(parentPath) !== canonicalPathIdentity(canonical)
  ) {
    throw new Error('history output parent must be one regular directory');
  }
  if (isPathInside(realpathSync(worktreeRoot), requested)) {
    throw new Error('history artifacts must remain outside the repository');
  }
  return Object.freeze({
    finalDirectory: requested,
    parentDirectory: canonical,
    parentIdentity: Object.freeze({ dev: stat.dev, ino: stat.ino }),
  });
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

function assertSameDirectory(
  path: string,
  expected: Readonly<{ dev: number; ino: number }>,
  label: string,
): void {
  const stat = lstatSync(path);
  if (
    !stat.isDirectory()
    || stat.isSymbolicLink()
    || stat.dev !== expected.dev
    || stat.ino !== expected.ino
    || canonicalPathIdentity(realpathSync(path))
      !== canonicalPathIdentity(path)
  ) {
    throw new Error(`${label} identity changed`);
  }
}

function removeStagingDirectory(
  target: Readonly<HistoryOutputTarget>,
  stagingDirectory: string,
  stagingIdentity: Readonly<{ dev: number; ino: number }>,
): void {
  assertSameDirectory(
    target.parentDirectory,
    target.parentIdentity,
    'history output parent during cleanup',
  );
  if (!isPathInside(target.parentDirectory, stagingDirectory)) {
    throw new Error('staged history output escaped its intended parent');
  }
  assertSameDirectory(
    stagingDirectory,
    stagingIdentity,
    'staged history output during cleanup',
  );
  rmSync(stagingDirectory, { recursive: true, force: false });
}

function required(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function requiredPort(values: ReadonlyMap<string, string>, key: string): number {
  const value = required(values, key);
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${key} must be a decimal TCP port`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > 65_535) {
    throw new Error(`${key} must be between 1 and 65535`);
  }
  return parsed;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
