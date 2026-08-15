import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalPathIdentity,
  isPathInside,
  readBoundedRegularFile,
  writeNewFile,
} from '../create-only-out-of-repository-artifact.js';
import {
  buildSubstrateFederatedAuthoritySafeDevnetChainSpecV1,
} from '../substrate-federated-authority-safe-devnet-chain-spec-v1.js';

const MAX_BASE_SPEC_BYTES = 16 * 1024 * 1024;

interface Arguments {
  readonly baseSpecPath: string;
  readonly outputSpecPath: string;
  readonly expectedChainId: bigint;
  readonly bridgeAddress: string;
  readonly tokenAddress: string;
  readonly bridgeOwnerAddress: string;
  readonly expectedBaseSpecSha256Hex: string;
  readonly expectedFrontierCommit: string;
  readonly expectedFrontierPatchSha256Hex: string;
  readonly expectedRuntimeCodeSha256Hex: string;
  readonly expectedSudoAddress: string;
}

export function main(argv: readonly string[] = process.argv.slice(2)): void {
  const args = parseArguments(argv);
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const bridgeRoot = resolve(scriptDirectory, '..', '..', '..');
  const baseSpecPath = resolve(args.baseSpecPath);
  const outputSpecPath = resolve(args.outputSpecPath);
  const outputParent = dirname(outputSpecPath);
  const outputParentStat = lstatSync(outputParent);
  if (!outputParentStat.isDirectory() || outputParentStat.isSymbolicLink()) {
    throw new Error('output chain spec parent must be a regular directory');
  }
  const baseSpec = readBoundedRegularFile(
    baseSpecPath,
    'base chain spec',
    MAX_BASE_SPEC_BYTES,
  );
  const canonicalOutputSpecPath = resolve(
    realpathSync(outputParent),
    basename(outputSpecPath),
  );
  const canonicalBridgeRoot = realpathSync(bridgeRoot);
  if (
    canonicalPathIdentity(baseSpec.canonicalPath)
      === canonicalPathIdentity(canonicalOutputSpecPath)
  ) {
    throw new Error('base and output chain spec paths must be distinct');
  }
  if (isPathInside(canonicalBridgeRoot, canonicalOutputSpecPath)) {
    throw new Error('generated chain specs must remain outside the repository');
  }
  const result = buildSubstrateFederatedAuthoritySafeDevnetChainSpecV1({
    bridgeRoot,
    baseSpecBytes: baseSpec.bytes,
    expectedChainId: args.expectedChainId,
    bridgeAddress: args.bridgeAddress,
    tokenAddress: args.tokenAddress,
    bridgeOwnerAddress: args.bridgeOwnerAddress,
    expectedBaseSpecSha256Hex: args.expectedBaseSpecSha256Hex,
    expectedFrontierCommit: args.expectedFrontierCommit,
    expectedFrontierPatchSha256Hex:
      args.expectedFrontierPatchSha256Hex,
    expectedRuntimeCodeSha256Hex: args.expectedRuntimeCodeSha256Hex,
    expectedSudoAddress: args.expectedSudoAddress,
  });
  writeNewFile(
    canonicalOutputSpecPath,
    result.chainSpecBytes,
    'output chain spec',
  );
  console.log(JSON.stringify(result.report, null, 2));
}

function parseArguments(argv: readonly string[]): Arguments {
  const values = new Map<string, string>();
  const allowed = new Set([
    '--base-spec',
    '--output-spec',
    '--expected-chain-id',
    '--bridge-address',
    '--token-address',
    '--bridge-owner-address',
    '--expected-base-spec-sha256',
    '--expected-frontier-commit',
    '--expected-frontier-patch-sha256',
    '--expected-runtime-code-sha256',
    '--expected-sudo-address',
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !allowed.has(key)) {
      throw new Error(
        `unknown authority-safe chain spec option: ${key ?? '<missing>'}`,
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
  return {
    baseSpecPath: required(values, '--base-spec'),
    outputSpecPath: required(values, '--output-spec'),
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
  };
}

function required(values: ReadonlyMap<string, string>, key: string): string {
  const value = values.get(key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
