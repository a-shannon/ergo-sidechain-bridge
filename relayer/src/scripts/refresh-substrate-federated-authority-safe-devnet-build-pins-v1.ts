import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  canonicalPathIdentity,
  isPathInside,
  readBoundedRegularFile,
  writeNewFile,
} from '../create-only-out-of-repository-artifact.js';
import { discoverBridgeRepositoryRoot } from '../bridge-repository-layout.js';
import {
  refreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1,
  SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_BUILD_PINS_V1_FILES,
} from '../substrate-federated-authority-safe-devnet-build-pins-v1.js';

const MAX_BASE_SPEC_BYTES = 16 * 1024 * 1024;
const MAX_REPORT_BYTES = 1024 * 1024;

interface Arguments {
  readonly frontierSourcePath: string;
  readonly cargoExecutablePath: string;
  readonly rustcExecutablePath: string;
  readonly gitExecutablePath: string;
  readonly expectedFrontierCommit: string;
  readonly expectedFrontierPatchSha256Hex: string;
  readonly expectedFrontierBinaryVersion: string;
  readonly temporaryDirectoryRoot: string;
  readonly sharedCargoHomeRoot: string;
  readonly outputDirectory: string;
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const args = parseArguments(argv);
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const bridgeRoot = realpathSync(resolve(scriptDirectory, '..', '..', '..'));
  const worktreeRoot = realpathSync(discoverBridgeRepositoryRoot(bridgeRoot));
  const output = resolveOutputDirectory(args.outputDirectory, worktreeRoot);
  const result = await refreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1({
    worktreeRoot,
    bridgeRoot,
    frontierSourcePath: args.frontierSourcePath,
    cargoExecutablePath: args.cargoExecutablePath,
    rustcExecutablePath: args.rustcExecutablePath,
    gitExecutablePath: args.gitExecutablePath,
    expectedFrontierCommit: args.expectedFrontierCommit,
    expectedFrontierPatchSha256Hex: args.expectedFrontierPatchSha256Hex,
    expectedFrontierBinaryVersion: args.expectedFrontierBinaryVersion,
    temporaryDirectoryRoot: args.temporaryDirectoryRoot,
    sharedCargoHomeRoot: args.sharedCargoHomeRoot,
  });
  const reportBytes = Buffer.from(
    `${JSON.stringify(result.report, null, 2)}\n`,
    'utf8',
  );
  publishOutputDirectory(
    output,
    Buffer.from(result.baseSpecBytes),
    reportBytes,
  );
  console.log(JSON.stringify(result.report, null, 2));
}

function parseArguments(argv: readonly string[]): Arguments {
  const values = new Map<string, string>();
  const allowed = new Set([
    '--frontier-source',
    '--cargo',
    '--rustc',
    '--git',
    '--expected-frontier-commit',
    '--expected-frontier-patch-sha256',
    '--expected-frontier-binary-version',
    '--temporary-root',
    '--shared-cargo-home',
    '--output-directory',
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !allowed.has(key)) {
      throw new Error(`unknown build-pin refresh option: ${key ?? '<missing>'}`);
    }
    if (!value || value.startsWith('--')) {
      throw new Error(`${key} requires one value`);
    }
    if (values.has(key)) throw new Error(`${key} must not be repeated`);
    values.set(key, value);
  }
  return {
    frontierSourcePath: absolutePath(
      required(values, '--frontier-source'),
      '--frontier-source',
    ),
    cargoExecutablePath: absolutePath(required(values, '--cargo'), '--cargo'),
    rustcExecutablePath: absolutePath(required(values, '--rustc'), '--rustc'),
    gitExecutablePath: absolutePath(required(values, '--git'), '--git'),
    expectedFrontierCommit: required(values, '--expected-frontier-commit'),
    expectedFrontierPatchSha256Hex: required(
      values,
      '--expected-frontier-patch-sha256',
    ),
    expectedFrontierBinaryVersion: required(
      values,
      '--expected-frontier-binary-version',
    ),
    temporaryDirectoryRoot: absolutePath(
      required(values, '--temporary-root'),
      '--temporary-root',
    ),
    sharedCargoHomeRoot: absolutePath(
      required(values, '--shared-cargo-home'),
      '--shared-cargo-home',
    ),
    outputDirectory: absolutePath(
      required(values, '--output-directory'),
      '--output-directory',
    ),
  };
}

function resolveOutputDirectory(
  value: string,
  worktreeRoot: string,
): Readonly<{
  finalDirectory: string;
  parentDirectory: string;
}> {
  if (existsSync(value)) {
    throw new Error('build-pin output directory must not already exist');
  }
  const parentDirectory = canonicalDirectory(
    dirname(value),
    'build-pin output parent',
  );
  const finalDirectory = join(parentDirectory, basename(value));
  if (isPathInside(worktreeRoot, finalDirectory)) {
    throw new Error('build-pin outputs must remain outside the Git worktree');
  }
  if (/\.partial(?:-|$)/iu.test(basename(finalDirectory))) {
    throw new Error('build-pin output directory must not use a transient name');
  }
  return Object.freeze({ finalDirectory, parentDirectory });
}

function publishOutputDirectory(
  output: Readonly<{ finalDirectory: string; parentDirectory: string }>,
  baseSpecBytes: Buffer,
  reportBytes: Buffer,
): void {
  if (existsSync(output.finalDirectory)) {
    throw new Error('build-pin output directory must not already exist');
  }
  mkdirSync(output.finalDirectory, { mode: 0o700 });
  const publishedDirectory = realpathSync(output.finalDirectory);
  if (
    canonicalPathIdentity(publishedDirectory)
    !== canonicalPathIdentity(output.finalDirectory)
  ) {
    throw new Error('published build-pin output directory identity changed');
  }

  // Once visible, a failed directory remains quarantined. Cleanup could delete
  // entries concurrently added by a different actor.
  writeNewFile(
    join(
      publishedDirectory,
      SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_BUILD_PINS_V1_FILES.baseSpec,
    ),
    baseSpecBytes,
    'Frontier base-spec pin',
  );
  writeNewFile(
    join(
      publishedDirectory,
      SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_BUILD_PINS_V1_FILES.report,
    ),
    reportBytes,
    'Frontier build-pin report',
  );
  const publishedBaseSpec = readBoundedRegularFile(
    join(
      publishedDirectory,
      SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_BUILD_PINS_V1_FILES.baseSpec,
    ),
    'published Frontier base-spec pin',
    MAX_BASE_SPEC_BYTES,
  ).bytes;
  const publishedReport = readBoundedRegularFile(
    join(
      publishedDirectory,
      SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_BUILD_PINS_V1_FILES.report,
    ),
    'published Frontier build-pin report',
    MAX_REPORT_BYTES,
  ).bytes;
  if (
    !Buffer.from(publishedBaseSpec).equals(baseSpecBytes)
    || !Buffer.from(publishedReport).equals(reportBytes)
    || readdirSync(publishedDirectory).sort().join('\0')
      !== Object.values(
        SUBSTRATE_FEDERATED_AUTHORITY_SAFE_DEVNET_BUILD_PINS_V1_FILES,
      ).sort().join('\0')
  ) {
    throw new Error('published build-pin output changed during publication');
  }
}

function canonicalDirectory(value: string, label: string): string {
  const resolved = resolve(value);
  const stat = lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular directory`);
  }
  return realpathSync(resolved);
}

function absolutePath(value: string, label: string): string {
  if (!isAbsolute(value) || value.includes('\0')) {
    throw new Error(`${label} must be one absolute path`);
  }
  return resolve(value);
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
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
