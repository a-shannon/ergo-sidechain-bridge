import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TextDecoder } from 'node:util';

import {
  canonicalPathIdentity,
  isPathInside,
  readBoundedRegularFile,
} from '../create-only-out-of-repository-artifact.js';
import {
  assertNoDuplicateJsonKeys,
  canonicalJson,
} from '../ergo-settlement-core/strict-json.js';
import {
  runSubstrateFederatedIsolatedDevnetBootstrapRootV1,
  type RunSubstrateFederatedIsolatedDevnetBootstrapRootV1Input,
  type SubstrateFederatedIsolatedDevnetBootstrapRootV1Receipt,
} from '../apps/bridge-daemon/substrate-federated-isolated-devnet-bootstrap-root-v1.js';

export const SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_COMMAND_REQUEST_V1_SCHEMA =
  'e2s.substrate-federated-isolated-devnet-bootstrap-command-request.v1' as const;

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_BASE_SPEC_BYTES = 16 * 1024 * 1024;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

interface BootstrapCommandRequestV1 {
  readonly schema:
    typeof SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_COMMAND_REQUEST_V1_SCHEMA;
  readonly version: 1;
  readonly toolchain: Readonly<{
    readonly gitExecutablePath: string;
    readonly cargoExecutablePath: string;
    readonly rustcExecutablePath: string;
    readonly javaExecutablePath: string;
    readonly sbtLauncherJarPath: string;
    readonly wasmPackExecutablePath: string;
  }>;
  readonly sourceTarget: Readonly<{
    readonly frontierSourcePath: string;
    readonly baseSpecPath: string;
    readonly expectedChainId: string;
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
  }>;
  readonly ergoNode: Readonly<{
    readonly ergoSourcePath: string;
  }>;
  readonly relayer: Readonly<{
    readonly expectedHeadCommitSha1Hex: string;
    readonly artifactDestinationDirectory: string;
  }>;
}

export async function runSubstrateFederatedIsolatedDevnetBootstrapWorkerFromArgumentsV1(
  argv: readonly string[],
): Promise<Readonly<SubstrateFederatedIsolatedDevnetBootstrapRootV1Receipt>> {
  if (
    argv.length !== 2
    || argv[0] !== '--request'
    || argv[1] === undefined
    || argv[1].length === 0
    || argv[1].startsWith('--')
  ) {
    throw new Error('isolated no-submit bootstrap worker arguments are invalid');
  }
  if (process.platform !== 'win32') {
    throw new Error('isolated no-submit bootstrap worker requires Windows');
  }
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const bridgeRoot = resolve(scriptDirectory, '..', '..', '..');
  const worktreeRoot = resolve(bridgeRoot, '..');
  const input = loadCanonicalBootstrapRequest(
    argv[1],
    bridgeRoot,
    worktreeRoot,
  );
  const result = await runSubstrateFederatedIsolatedDevnetBootstrapRootV1(input);
  return result.receipt;
}

function loadCanonicalBootstrapRequest(
  requestPath: string,
  bridgeRoot: string,
  worktreeRoot: string,
): Readonly<RunSubstrateFederatedIsolatedDevnetBootstrapRootV1Input> {
  const requestFile = readBoundedRegularFile(
    explicitExistingLocalNonSensitivePath(
      requestPath,
      'bootstrap request',
      'file',
    ),
    'bootstrap request',
    MAX_REQUEST_BYTES,
  );
  let source: string;
  try {
    source = UTF8_DECODER.decode(requestFile.bytes);
  } catch {
    throw new Error('bootstrap request must be valid UTF-8');
  }
  assertNoDuplicateJsonKeys(source);
  const parsed = JSON.parse(source) as unknown;
  if (source !== `${canonicalJson(parsed)}\n`) {
    throw new Error('bootstrap request must use canonical JSON plus one LF');
  }
  const request = parseBootstrapRequest(parsed);
  const artifactDestinationDirectory = assertCreateOnlyDestination(
    request.relayer.artifactDestinationDirectory,
    worktreeRoot,
    'relayer artifact destination',
  );
  const baseSpec = readBoundedRegularFile(
    request.sourceTarget.baseSpecPath,
    'authority-safe base chain spec',
    MAX_BASE_SPEC_BYTES,
  );
  const input: RunSubstrateFederatedIsolatedDevnetBootstrapRootV1Input = {
    build: {
      worktreeRoot,
      bridgeRoot,
      ergoSourcePath: request.ergoNode.ergoSourcePath,
      gitExecutablePath: request.toolchain.gitExecutablePath,
      javaExecutablePath: request.toolchain.javaExecutablePath,
      sbtLauncherJarPath: request.toolchain.sbtLauncherJarPath,
    },
    lifecycle: {
      sourceHistory: {
        acceptance: {
          worktreeRoot,
          bridgeRoot,
          frontierSourcePath: request.sourceTarget.frontierSourcePath,
          cargoExecutablePath: request.toolchain.cargoExecutablePath,
          rustcExecutablePath: request.toolchain.rustcExecutablePath,
          gitExecutablePath: request.toolchain.gitExecutablePath,
          baseSpecBytes: baseSpec.bytes,
          expectedChainId: BigInt(request.sourceTarget.expectedChainId),
          bridgeAddress: request.sourceTarget.bridgeAddress,
          tokenAddress: request.sourceTarget.tokenAddress,
          bridgeOwnerAddress: request.sourceTarget.bridgeOwnerAddress,
          expectedBaseSpecSha256Hex:
            request.sourceTarget.expectedBaseSpecSha256Hex,
          expectedFrontierCommit:
            request.sourceTarget.expectedFrontierCommit,
          expectedFrontierPatchSha256Hex:
            request.sourceTarget.expectedFrontierPatchSha256Hex,
          expectedRuntimeCodeSha256Hex:
            request.sourceTarget.expectedRuntimeCodeSha256Hex,
          expectedSudoAddress: request.sourceTarget.expectedSudoAddress,
          expectedFrontierBinaryVersion:
            request.sourceTarget.expectedFrontierBinaryVersion,
          primaryRpcUrl: request.sourceTarget.primaryRpcUrl,
          witnessRpcUrl: request.sourceTarget.witnessRpcUrl,
          primaryP2pPort: request.sourceTarget.primaryP2pPort,
          witnessP2pPort: request.sourceTarget.witnessP2pPort,
          primaryPrometheusPort:
            request.sourceTarget.primaryPrometheusPort,
          witnessPrometheusPort:
            request.sourceTarget.witnessPrometheusPort,
          expectedNativeGenesisHashHex:
            request.sourceTarget.expectedNativeGenesisHashHex,
          expectedNodeName: request.sourceTarget.expectedNodeName,
          expectedNodeVersion: request.sourceTarget.expectedNodeVersion,
          signedLegacyOwnerMintTransactionHex:
            request.sourceTarget.signedLegacyOwnerMintTransactionHex,
        },
      },
      relayerArtifacts: {
        bridgeRoot,
        gitExecutable: request.toolchain.gitExecutablePath,
        wasmPackExecutable: request.toolchain.wasmPackExecutablePath,
        expectedHeadCommitSha1Hex: request.relayer.expectedHeadCommitSha1Hex,
        destinationDirectory: artifactDestinationDirectory,
      },
    },
  };
  return Object.freeze(input);
}

function parseBootstrapRequest(value: unknown): Readonly<BootstrapCommandRequestV1> {
  const request = exactRecord(value, [
    'schema',
    'version',
    'toolchain',
    'sourceTarget',
    'ergoNode',
    'relayer',
  ], 'bootstrap request');
  if (
    request.schema
      !== SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_COMMAND_REQUEST_V1_SCHEMA
    || request.version !== 1
  ) {
    throw new Error('bootstrap request schema or version is unsupported');
  }
  const toolchain = exactRecord(request.toolchain, [
    'gitExecutablePath',
    'cargoExecutablePath',
    'rustcExecutablePath',
    'javaExecutablePath',
    'sbtLauncherJarPath',
    'wasmPackExecutablePath',
  ], 'bootstrap toolchain');
  const sourceTarget = exactRecord(request.sourceTarget, [
    'frontierSourcePath',
    'baseSpecPath',
    'expectedChainId',
    'bridgeAddress',
    'tokenAddress',
    'bridgeOwnerAddress',
    'expectedBaseSpecSha256Hex',
    'expectedFrontierCommit',
    'expectedFrontierPatchSha256Hex',
    'expectedRuntimeCodeSha256Hex',
    'expectedSudoAddress',
    'expectedFrontierBinaryVersion',
    'primaryRpcUrl',
    'witnessRpcUrl',
    'primaryP2pPort',
    'witnessP2pPort',
    'primaryPrometheusPort',
    'witnessPrometheusPort',
    'expectedNativeGenesisHashHex',
    'expectedNodeName',
    'expectedNodeVersion',
    'signedLegacyOwnerMintTransactionHex',
  ], 'bootstrap source target');
  const ergoNode = exactRecord(request.ergoNode, [
    'ergoSourcePath',
  ], 'bootstrap Ergo node');
  const relayer = exactRecord(request.relayer, [
    'expectedHeadCommitSha1Hex',
    'artifactDestinationDirectory',
  ], 'bootstrap relayer');
  const expectedChainId = requiredString(
    sourceTarget.expectedChainId,
    'source target chain ID',
  );
  if (!/^[1-9][0-9]*$/u.test(expectedChainId)) {
    throw new Error('source target chain ID must be a positive decimal integer');
  }
  return Object.freeze({
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_COMMAND_REQUEST_V1_SCHEMA,
    version: 1 as const,
    toolchain: Object.freeze({
      gitExecutablePath: explicitExistingLocalNonSensitivePath(
        toolchain.gitExecutablePath,
        'Git executable',
        'file',
      ),
      cargoExecutablePath: explicitExistingLocalNonSensitivePath(
        toolchain.cargoExecutablePath,
        'Cargo executable',
        'file',
      ),
      rustcExecutablePath: explicitExistingLocalNonSensitivePath(
        toolchain.rustcExecutablePath,
        'Rust compiler executable',
        'file',
      ),
      javaExecutablePath: explicitExistingLocalNonSensitivePath(
        toolchain.javaExecutablePath,
        'Java executable',
        'file',
      ),
      sbtLauncherJarPath: explicitExistingLocalNonSensitivePath(
        toolchain.sbtLauncherJarPath,
        'sbt launcher',
        'file',
      ),
      wasmPackExecutablePath: explicitExistingLocalNonSensitivePath(
        toolchain.wasmPackExecutablePath,
        'wasm-pack executable',
        'file',
      ),
    }),
    sourceTarget: Object.freeze({
      frontierSourcePath: explicitExistingLocalNonSensitivePath(
        sourceTarget.frontierSourcePath,
        'Frontier source',
        'directory',
      ),
      baseSpecPath: explicitExistingLocalNonSensitivePath(
        sourceTarget.baseSpecPath,
        'base chain spec',
        'file',
      ),
      expectedChainId,
      bridgeAddress: requiredString(sourceTarget.bridgeAddress, 'bridge address'),
      tokenAddress: requiredString(sourceTarget.tokenAddress, 'token address'),
      bridgeOwnerAddress: requiredString(
        sourceTarget.bridgeOwnerAddress,
        'bridge owner address',
      ),
      expectedBaseSpecSha256Hex: requiredString(
        sourceTarget.expectedBaseSpecSha256Hex,
        'base spec digest',
      ),
      expectedFrontierCommit: requiredString(
        sourceTarget.expectedFrontierCommit,
        'Frontier commit',
      ),
      expectedFrontierPatchSha256Hex: requiredString(
        sourceTarget.expectedFrontierPatchSha256Hex,
        'Frontier patch digest',
      ),
      expectedRuntimeCodeSha256Hex: requiredString(
        sourceTarget.expectedRuntimeCodeSha256Hex,
        'runtime code digest',
      ),
      expectedSudoAddress: requiredString(
        sourceTarget.expectedSudoAddress,
        'Sudo address',
      ),
      expectedFrontierBinaryVersion: requiredString(
        sourceTarget.expectedFrontierBinaryVersion,
        'Frontier binary version',
      ),
      primaryRpcUrl: requiredString(
        sourceTarget.primaryRpcUrl,
        'primary source RPC',
      ),
      witnessRpcUrl: requiredString(
        sourceTarget.witnessRpcUrl,
        'witness source RPC',
      ),
      primaryP2pPort: exactPort(sourceTarget.primaryP2pPort, 'primary P2P port'),
      witnessP2pPort: exactPort(sourceTarget.witnessP2pPort, 'witness P2P port'),
      primaryPrometheusPort: exactPort(
        sourceTarget.primaryPrometheusPort,
        'primary Prometheus port',
      ),
      witnessPrometheusPort: exactPort(
        sourceTarget.witnessPrometheusPort,
        'witness Prometheus port',
      ),
      expectedNativeGenesisHashHex: requiredString(
        sourceTarget.expectedNativeGenesisHashHex,
        'native genesis hash',
      ),
      expectedNodeName: requiredString(
        sourceTarget.expectedNodeName,
        'source node name',
      ),
      expectedNodeVersion: requiredString(
        sourceTarget.expectedNodeVersion,
        'source node version',
      ),
      signedLegacyOwnerMintTransactionHex: requiredString(
        sourceTarget.signedLegacyOwnerMintTransactionHex,
        'legacy owner-mint rejection transaction',
      ),
    }),
    ergoNode: Object.freeze({
      ergoSourcePath: explicitExistingLocalNonSensitivePath(
        ergoNode.ergoSourcePath,
        'Ergo source',
        'directory',
      ),
    }),
    relayer: Object.freeze({
      expectedHeadCommitSha1Hex: requiredString(
        relayer.expectedHeadCommitSha1Hex,
        'expected bridge HEAD',
      ),
      artifactDestinationDirectory: explicitLocalNonSensitivePath(
        relayer.artifactDestinationDirectory,
        'relayer artifact destination',
      ),
    }),
  });
}

function assertCreateOnlyDestination(
  value: string,
  worktreeRoot: string,
  label: string,
): string {
  const destination = explicitLocalNonSensitivePath(value, label);
  assertPathAbsent(destination, label);
  const parentPath = dirname(destination);
  const parent = lstatSync(parentPath);
  const canonicalParent = realpathSync(parentPath);
  if (
    !parent.isDirectory()
    || parent.isSymbolicLink()
    || canonicalPathIdentity(canonicalParent)
      !== canonicalPathIdentity(parentPath)
  ) {
    throw new Error(`${label} parent must be one regular directory`);
  }
  if (isPathInside(realpathSync(worktreeRoot), destination)) {
    throw new Error(`${label} must remain outside the worktree`);
  }
  return destination;
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

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function exactPort(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 65_535) {
    throw new Error(`${label} must be an integer from 1 through 65535`);
  }
  return value as number;
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
  const receipt =
    await runSubstrateFederatedIsolatedDevnetBootstrapWorkerFromArgumentsV1(
      process.argv.slice(2),
    );
  process.stdout.write(`${canonicalJson(receipt)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(() => {
    process.stderr.write('isolated no-submit bootstrap worker failed\n');
    process.exitCode = 1;
  });
}
