import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, statfsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { inspectConsensusSourceBaseline } from './consensus-source-baseline.js';
import { runBoundedProcess } from './pinned-local-native-verifier-build.js';
import { canonicalJson } from './strict-json.js';
import {
  buildSubstrateFederatedAuthoritySafeCargoEnvironmentV1,
  buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1,
  inspectSubstrateFederatedAuthoritySafePinnedToolchainV1,
} from './substrate-federated-authority-safe-devnet-build-environment-v1.js';
import {
  readSubstrateFederatedGenesisProfilesFromSessionV2,
  type SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2,
} from './substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import {
  buildFederatedPooledReserveSourceProofProfileV1,
  encodeFederatedPooledReserveSourceProofProfileScaleV1Hex,
} from './substrate-federated-pooled-reserve-source-proof-v1.js';

const BASE = '75329a2df49e2cc7981485392c31160929d1bd48';
const PATCHES = [
  ['0001-bridge-runtime-commitment.patch', 'bd8500696af4dd7b67dd99c9446f5ef2f23803e58f6669a5e80d8548124d7634'],
  ['0004-federated-genesis-initialization.patch', 'b3688c77c1a6a2b85b95367057572f053056fa11ee31ac291373571717dd7331'],
  ['0005-federated-genesis-node.patch', 'f1e11276188d32e3f94ddc542ce7dce911506eaf05751d152eb22a54b11d9b65'],
] as const;
const SOURCE_TREE = '0066f584c0eff7c31bce59adb89bbdb5b90a80fe';
const CARGO_ARGS = ['build', '--offline', '--locked', '-p', 'frontier-template-node',
  '--no-default-features', '--features', 'bridge-federated-v4-genesis-node'] as const;
const WASM_PATH = 'debug/wbuild/frontier-template-v4-fed-genesis-runtime/frontier_template_v4_fed_genesis_runtime.wasm';

export interface BuildSubstrateFederatedGenesisNodeV1Input {
  readonly bridgeRoot: string;
  readonly frontierSourcePath: string;
  readonly buildParentDirectory: string;
  readonly cargoHomeDirectory: string;
  readonly cargoExecutablePath: string;
  readonly rustcExecutablePath: string;
  readonly gitExecutablePath: string;
  readonly protocExecutablePath: string;
  readonly sourceSession: Readonly<SubstrateFederatedIsolatedDevnetSourceAttestationSessionV2>;
}

/** Build the dedicated FED node from an exact export and retained public custody.
 * Outputs stay local for the owning composition root; no node or transaction runs.
 */
export async function buildSubstrateFederatedGenesisNodeV1(input: BuildSubstrateFederatedGenesisNodeV1Input) {
  input = exactInput(input);
  const profiles = readSubstrateFederatedGenesisProfilesFromSessionV2(input.sourceSession);
  const mintProfile = buildFederatedPooledReserveSourceProofProfileV1(profiles.mintProofProfile);
  const profileScaleHex = encodeFederatedPooledReserveSourceProofProfileScaleV1Hex(profiles.mintProofProfile);
  const assertCustody = () => {
    const current = readSubstrateFederatedGenesisProfilesFromSessionV2(input.sourceSession);
    if (current.checkpointProfile !== profiles.checkpointProfile || current.mintProofProfile !== profiles.mintProofProfile) {
      throw new Error('FED build source custody changed');
    }
  };
  const bridgeRoot = directory(input.bridgeRoot);
  const repository = directory(input.frontierSourcePath);
  const parent = directory(input.buildParentDirectory);
  const cargoHomeDirectory = directory(input.cargoHomeDirectory);
  if ([bridgeRoot, repository, cargoHomeDirectory].some(root => isInside(root, parent))) {
    throw new Error('FED build output must be outside source and dependency roots');
  }
  requireHeadroom(parent);
  const cargoExecutablePath = regularFile(input.cargoExecutablePath);
  const rustcExecutablePath = regularFile(input.rustcExecutablePath);
  const gitExecutablePath = regularFile(input.gitExecutablePath);
  const protocExecutablePath = regularFile(input.protocExecutablePath);
  const protocSha256Hex = sha256(readFileSync(protocExecutablePath));
  const baselineInput = { worktreeRoot: bridgeRoot, bridgeRoot,
    requireFrontierCheckout: false, requireErgoCheckout: false, gitExecutablePath };
  const baseline = inspectConsensusSourceBaseline(baselineInput);
  if (baseline.status !== 'PASS') throw new Error('FED build canonical source locks failed');
  const verifyPatches = () => {
    for (const [file, expected] of PATCHES) {
      if (sha256(readFileSync(regularFile(join(bridgeRoot, 'sources/frontier', file)))) !== expected) {
        throw new Error('FED build patch differs from the reviewed source closure');
      }
    }
  };
  verifyPatches();
  const toolInput = { bridgeRoot, cargoExecutablePath, rustcExecutablePath, gitExecutablePath, cwd: repository };
  const toolchain = await inspectSubstrateFederatedAuthoritySafePinnedToolchainV1(toolInput);
  assertCustody();
  const root = mkdtempSync(join(parent, 'bridge-fed-genesis-'));
  const source = join(root, 'source');
  const target = join(root, 'target');
  const temporary = join(root, 'temp');
  mkdirSync(source);
  mkdirSync(target);
  mkdirSync(temporary);
  const gitEnvironment = { ...buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1(),
    GIT_INDEX_FILE: join(root, 'source.index') };
  const git = (args: string[]) => runBoundedProcess({ executablePath: gitExecutablePath,
    args: ['-c', 'core.autocrlf=false', ...args], cwd: repository, env: gitEnvironment,
    timeoutMs: 30_000, maxOutputBytes: 8 * 1024 * 1024, label: 'FED source export' });
  await git(['read-tree', BASE]);
  for (const [file] of PATCHES) {
    await git(['apply', '--cached', '--whitespace=nowarn', join(bridgeRoot, 'sources/frontier', file)]);
  }
  if ((await git(['write-tree'])).stdout.trim() !== SOURCE_TREE) {
    throw new Error('FED reconstructed source tree differs from the reviewed closure');
  }
  const entries = (await git(['ls-files', '--stage', '-z'])).stdout.split('\0').filter(Boolean).map(entry => {
    const parsed = /^(100644|100755) ([0-9a-f]{40}) 0\t([A-Za-z0-9_./-]+)$/.exec(entry);
    if (!parsed || parsed[3]!.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error('FED source tree has an unsupported entry');
    }
    return { blob: parsed[2]!, path: parsed[3]! };
  });
  if (entries.length === 0) throw new Error('FED source tree is empty');
  await git(['checkout-index', '--all', `--prefix=${source.replaceAll('\\', '/')}/`]);
  const verifySources = () => {
    for (const entry of entries) {
      const bytes = readFileSync(regularFile(join(source, entry.path)));
      const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if (blob !== entry.blob) throw new Error('FED exported source bytes changed');
    }
  };
  const verifyConfiguration = () => assertNoCargoConfiguration(cargoHomeDirectory, [
    source, temporary, dirname(join(target, WASM_PATH)),
    ...entries.map(entry => dirname(join(source, entry.path))),
  ]);
  verifySources();
  verifyPatches();
  assertCustody();
  const environment = buildSubstrateFederatedAuthoritySafeCargoEnvironmentV1({
    cargoTargetDirectory: target, cargoHomeDirectory, cargoExecutablePath,
    frontierSourcePath: source, gitExecutablePath, protocExecutablePath,
    rustcExecutablePath, rustTarget: toolchain.rustTarget,
  });
  // The pinned runtime build script requires canonical 0x-prefixed hex for both fields.
  environment.BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_SCALE_HEX = profileScaleHex;
  environment.BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_ID_HEX = mintProfile.proofProfileIdHex;
  // The pinned WASM toolchain probe starts nested Cargo in a temporary crate.
  environment.TEMP = temporary;
  environment.TMP = temporary;
  environment.TMPDIR = temporary;
  requireHeadroom(parent);
  verifyConfiguration();
  await runBoundedProcess({ executablePath: cargoExecutablePath, args: [...CARGO_ARGS],
    cwd: source, env: environment, timeoutMs: 90 * 60_000,
    maxOutputBytes: 32 * 1024 * 1024, label: 'FED genesis node build' });
  assertCustody();
  verifyConfiguration();
  verifySources();
  verifyPatches();
  if (inspectConsensusSourceBaseline(baselineInput).status !== 'PASS'
    || canonicalJson(await inspectSubstrateFederatedAuthoritySafePinnedToolchainV1(toolInput)) !== canonicalJson(toolchain)
    || sha256(readFileSync(regularFile(protocExecutablePath))) !== protocSha256Hex) {
    throw new Error('FED build source locks or tools changed during compilation');
  }
  assertCustody();
  const node = artifact(join(target, 'debug', process.platform === 'win32'
    ? 'frontier-template-node.exe' : 'frontier-template-node'), 1024 * 1024, 512 * 1024 * 1024);
  const wasm = artifact(join(target, WASM_PATH), 8, 16 * 1024 * 1024);
  if (!readFileSync(wasm.path).subarray(0, 8).equals(Buffer.from('0061736d01000000', 'hex'))) {
    throw new Error('FED selected runtime is not a WASM version-one module');
  }
  return Object.freeze({ sourceTreeId: SOURCE_TREE, sourceDirectory: source, targetDirectory: target,
    sourceProofProfileScaleHex: profileScaleHex, sourceProofProfileIdHex: mintProfile.proofProfileIdHex,
    node, wasm, toolchain, protocSha256Hex });
}

function exactInput(input: BuildSubstrateFederatedGenesisNodeV1Input): Readonly<BuildSubstrateFederatedGenesisNodeV1Input> {
  const keys = ['bridgeRoot', 'frontierSourcePath', 'buildParentDirectory', 'cargoHomeDirectory',
    'cargoExecutablePath', 'rustcExecutablePath', 'gitExecutablePath', 'protocExecutablePath', 'sourceSession'];
  if (input === null || typeof input !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw new Error('FED build requires exact data fields');
  }
  const fields = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(fields).length !== keys.length
    || keys.some(key => !fields[key]?.enumerable || !('value' in fields[key]!))) {
    throw new Error('FED build requires exact data fields');
  }
  return Object.freeze(Object.fromEntries(keys.map(key => [key, fields[key]!.value]))) as unknown as BuildSubstrateFederatedGenesisNodeV1Input;
}
function checkedPath(path: string): string {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) throw new Error('FED build needs an absolute local path');
  const full = resolve(path);
  let current = full;
  for (;;) {
    if (lstatSync(current).isSymbolicLink()) throw new Error('FED build paths cannot traverse links');
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return realpathSync(full);
}
function directory(path: string): string {
  const full = checkedPath(path);
  if (!lstatSync(full).isDirectory()) throw new Error('FED build directory required');
  return full;
}
function regularFile(path: string): string {
  const full = checkedPath(path);
  if (!lstatSync(full).isFile()) throw new Error('FED build regular file required');
  return full;
}
function isInside(root: string, path: string): boolean {
  const part = relative(root, path);
  return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`));
}
function requireHeadroom(path: string): void {
  const stats = statfsSync(path, { bigint: true });
  if (stats.bavail * stats.bsize < 10n * 1024n ** 3n) throw new Error('FED build requires at least 10 GiB free');
}
function assertNoCargoConfiguration(cargoHome: string, workingDirectories: string[]): void {
  const rejectConfiguration = (directory: string) => {
    const stat = lstatSync(directory, { throwIfNoEntry: false });
    if (stat !== undefined && (!stat.isDirectory() || stat.isSymbolicLink())) {
      throw new Error('FED build Cargo configuration directory must not be indirect');
    }
    for (const name of ['config', 'config.toml']) {
      if (lstatSync(join(directory, name), { throwIfNoEntry: false }) !== undefined) {
        throw new Error('FED build forbids Cargo configuration files');
      }
    }
  };
  rejectConfiguration(cargoHome);
  const visited = new Set<string>();
  for (let current of workingDirectories) {
    while (!visited.has(current)) {
      visited.add(current);
      rejectConfiguration(join(current, '.cargo'));
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
}
function artifact(path: string, min: number, max: number) {
  const full = regularFile(path);
  const size = lstatSync(full).size;
  if (size < min || size > max) throw new Error('FED build artifact size is outside bounds');
  const bytes = readFileSync(full);
  if (bytes.length !== size) throw new Error('FED build artifact changed while reading');
  return Object.freeze({ path: full, bytes: bytes.length, sha256Hex: sha256(bytes) });
}
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
