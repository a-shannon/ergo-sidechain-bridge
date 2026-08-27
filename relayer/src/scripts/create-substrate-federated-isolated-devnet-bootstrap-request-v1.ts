import { createHash } from 'node:crypto';
import {
  existsSync,
  linkSync,
  mkdtempSync,
  rmdirSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalPathIdentity,
  isPathInside,
  readBoundedRegularFile,
  writeNewFile,
} from '../create-only-out-of-repository-artifact.js';
import { canonicalJson } from '../ergo-settlement-core/strict-json.js';
import {
  assertCreateOnlyOutput,
} from './run-substrate-federated-isolated-devnet-peg-in-source-lock-execution-v1.js';
import {
  loadCanonicalBootstrapRequestBoundToSha256,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_COMMAND_REQUEST_V1_SCHEMA,
  type BootstrapCommandRequestV1,
} from './substrate-federated-isolated-devnet-bootstrap-request-v1.js';

const MAX_REQUEST_BYTES = 1024 * 1024;
const OUTPUT_LABEL = 'canonical isolated bootstrap request output';
const STAGING_PREFIX = '.e2s-bootstrap-request-v1-';

const ARGUMENTS = Object.freeze([
  '--git-executable',
  '--cargo-executable',
  '--rustc-executable',
  '--java-executable',
  '--sbt-launcher-jar',
  '--wasm-pack-executable',
  '--frontier-source',
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
  '--primary-rpc-url',
  '--witness-rpc-url',
  '--primary-p2p-port',
  '--witness-p2p-port',
  '--primary-prometheus-port',
  '--witness-prometheus-port',
  '--expected-native-genesis-hash',
  '--expected-node-name',
  '--expected-node-version',
  '--signed-legacy-owner-mint-transaction',
  '--ergo-source',
  '--expected-head',
  '--artifact-destination',
  '--output',
] as const);

type ArgumentName = typeof ARGUMENTS[number];

export interface SubstrateFederatedIsolatedDevnetBootstrapRequestCreationV1Result {
  readonly status: 'canonical_isolated_bootstrap_request_created';
  readonly requestSha256Hex: string;
  readonly expectedHeadCommitSha1Hex: string;
}

export function createSubstrateFederatedIsolatedDevnetBootstrapRequestFromArgumentsV1(
  argv: readonly string[],
): Readonly<SubstrateFederatedIsolatedDevnetBootstrapRequestCreationV1Result> {
  const args = parseArguments(argv);
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const relayerRoot = resolve(scriptDirectory, '..', '..');
  const bridgeRoot = resolve(relayerRoot, '..');
  const worktreeRoot = resolve(bridgeRoot, '..');
  const outputPath = assertCreateOnlyOutput(
    args.outputPath,
    worktreeRoot,
    OUTPUT_LABEL,
  );
  const bytes = Buffer.from(`${canonicalJson(args.request)}\n`, 'utf8');
  const requestSha256Hex = createHash('sha256').update(bytes).digest('hex');
  const parentPath = dirname(outputPath);
  const stagingDirectory = mkdtempSync(join(parentPath, STAGING_PREFIX));
  const stagingPath = join(stagingDirectory, 'request.json');
  let publicationCommitted = false;
  let executionError: unknown;
  try {
    writeNewFile(stagingPath, bytes, 'staged canonical bootstrap request');
    const loaded = loadCanonicalBootstrapRequestBoundToSha256(
      stagingPath,
      bridgeRoot,
      worktreeRoot,
      requestSha256Hex,
    );
    if (
      pathsOverlap(
        outputPath,
        loaded.lifecycle.relayerArtifacts.destinationDirectory,
      )
    ) {
      throw new Error(
        'canonical bootstrap request output and artifact destination must not overlap',
      );
    }
    const revalidatedOutputPath = assertCreateOnlyOutput(
      args.outputPath,
      worktreeRoot,
      OUTPUT_LABEL,
    );
    if (
      canonicalPathIdentity(revalidatedOutputPath)
        !== canonicalPathIdentity(outputPath)
    ) {
      throw new Error('canonical bootstrap request output identity changed');
    }
    linkSync(stagingPath, outputPath);
    publicationCommitted = true;
    const published = readBoundedRegularFile(
      outputPath,
      'published canonical bootstrap request',
      MAX_REQUEST_BYTES,
    );
    if (
      !Buffer.from(published.bytes).equals(bytes)
      || createHash('sha256').update(published.bytes).digest('hex')
        !== requestSha256Hex
    ) {
      throw new Error('published canonical bootstrap request bytes changed');
    }
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
      !publicationCommitted
      && executionError === undefined
      && cleanupError !== undefined
    ) {
      throw cleanupError;
    }
  }
  return Object.freeze({
    status: 'canonical_isolated_bootstrap_request_created' as const,
    requestSha256Hex,
    expectedHeadCommitSha1Hex: args.request.relayer.expectedHeadCommitSha1Hex,
  });
}

function parseArguments(argv: readonly string[]): Readonly<{
  request: Readonly<BootstrapCommandRequestV1>;
  outputPath: string;
}> {
  if (argv.length !== ARGUMENTS.length * 2) {
    throw new Error('canonical isolated bootstrap request arguments are invalid');
  }
  const values = {} as Record<ArgumentName, string>;
  for (const [index, name] of ARGUMENTS.entries()) {
    const suppliedName = argv[index * 2];
    const value = argv[index * 2 + 1];
    if (
      suppliedName !== name
      || value === undefined
      || value.length === 0
      || value.startsWith('--')
    ) {
      throw new Error('canonical isolated bootstrap request arguments are invalid');
    }
    values[name] = value;
  }
  if (!/^[0-9a-f]{40}$/u.test(values['--expected-head'])) {
    throw new Error('canonical isolated bootstrap request HEAD is invalid');
  }
  const request: BootstrapCommandRequestV1 = {
    schema:
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BOOTSTRAP_COMMAND_REQUEST_V1_SCHEMA,
    version: 1,
    toolchain: {
      gitExecutablePath: values['--git-executable'],
      cargoExecutablePath: values['--cargo-executable'],
      rustcExecutablePath: values['--rustc-executable'],
      javaExecutablePath: values['--java-executable'],
      sbtLauncherJarPath: values['--sbt-launcher-jar'],
      wasmPackExecutablePath: values['--wasm-pack-executable'],
    },
    sourceTarget: {
      frontierSourcePath: values['--frontier-source'],
      baseSpecPath: values['--base-spec'],
      expectedChainId: values['--expected-chain-id'],
      bridgeAddress: values['--bridge-address'],
      tokenAddress: values['--token-address'],
      bridgeOwnerAddress: values['--bridge-owner-address'],
      expectedBaseSpecSha256Hex: values['--expected-base-spec-sha256'],
      expectedFrontierCommit: values['--expected-frontier-commit'],
      expectedFrontierPatchSha256Hex:
        values['--expected-frontier-patch-sha256'],
      expectedRuntimeCodeSha256Hex: values['--expected-runtime-code-sha256'],
      expectedSudoAddress: values['--expected-sudo-address'],
      expectedFrontierBinaryVersion:
        values['--expected-frontier-binary-version'],
      primaryRpcUrl: values['--primary-rpc-url'],
      witnessRpcUrl: values['--witness-rpc-url'],
      primaryP2pPort: exactPort(values['--primary-p2p-port']),
      witnessP2pPort: exactPort(values['--witness-p2p-port']),
      primaryPrometheusPort: exactPort(values['--primary-prometheus-port']),
      witnessPrometheusPort: exactPort(values['--witness-prometheus-port']),
      expectedNativeGenesisHashHex:
        values['--expected-native-genesis-hash'],
      expectedNodeName: values['--expected-node-name'],
      expectedNodeVersion: values['--expected-node-version'],
      signedLegacyOwnerMintTransactionHex:
        values['--signed-legacy-owner-mint-transaction'],
    },
    ergoNode: {
      ergoSourcePath: values['--ergo-source'],
    },
    relayer: {
      expectedHeadCommitSha1Hex: values['--expected-head'],
      artifactDestinationDirectory: values['--artifact-destination'],
    },
  };
  return Object.freeze({ request: deepFreeze(request), outputPath: values['--output'] });
}

function exactPort(value: string): number {
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new Error('canonical isolated bootstrap request port is invalid');
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port > 65_535) {
    throw new Error('canonical isolated bootstrap request port is invalid');
  }
  return port;
}

function pathsOverlap(left: string, right: string): boolean {
  return canonicalPathIdentity(left) === canonicalPathIdentity(right)
    || isPathInside(left, right)
    || isPathInside(right, left);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

async function main(): Promise<void> {
  const result =
    createSubstrateFederatedIsolatedDevnetBootstrapRequestFromArgumentsV1(
      process.argv.slice(2),
    );
  process.stdout.write(`${canonicalJson(result)}\n`);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  main().catch(() => {
    process.stderr.write('canonical isolated bootstrap request creation failed\n');
    process.exitCode = 1;
  });
}
