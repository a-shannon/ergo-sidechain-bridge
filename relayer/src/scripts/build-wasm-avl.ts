import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import path, { delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runBoundedProcess } from '../bounded-process-runner.js';
import {
  runWasmAvlBuildPipelineV2,
  type WasmAvlBuildPipelinePlanV2,
  type WasmAvlBuildPipelineToolV2,
  type WasmAvlBuildPipelineToolsV2,
} from './build-wasm-avl-pipeline-v2.js';
import {
  validateWasmAvlBuildToolHashV2,
  type WasmAvlBuildToolNameV2,
} from '../substrate-federated-native-wasm-avl-build-tool-pins-v1.js';
import {
  assertSubstrateFederatedNativeWasmAvlPackageSmokeV1,
  fingerprintSubstrateFederatedNativeWasmAvlSourceV1,
  type SubstrateFederatedNativeWasmAvlPackageIdentityV1,
} from '../substrate-federated-native-wasm-avl-package-v1.js';

const ENCODED_RUSTFLAGS_SEPARATOR = '\u001f';
const REVIEWED_WASM_PACK_VERSION = 'wasm-pack 0.14.0';
const REVIEWED_WASM_BINDGEN_VERSION = 'wasm-bindgen 0.2.120';
const REVIEWED_RUST_VERSION = '1.97.1';
const REVIEWED_RUSTC_VERSION = 'rustc 1.97.1 (8bab26f4f 2026-07-14)';
const REVIEWED_CARGO_VERSION = 'cargo 1.97.1 (c980f4866 2026-06-30)';
const TOOL_PROBE_TIMEOUT_MS = 15_000;
const TOOL_PROBE_MAX_OUTPUT_BYTES = 16 * 1024;
const PROCESS_TERMINATION_GRACE_MS = 5_000;
const FORBIDDEN_PARENT_RUST_OVERRIDES = [
  'CARGO_BUILD_RUSTC',
  'CARGO_BUILD_RUSTC_WRAPPER',
  'CARGO_BUILD_RUSTC_WORKSPACE_WRAPPER',
  'CARGO_ENCODED_RUSTFLAGS',
  'RUSTC',
  'RUSTC_BOOTSTRAP',
  'RUSTC_WORKSPACE_WRAPPER',
  'RUSTC_WRAPPER',
  'RUSTDOC',
  'RUSTDOCFLAGS',
  'RUSTFLAGS',
  'RUSTUP_TOOLCHAIN',
] as const;
const ALLOWED_PARENT_ENVIRONMENT = [
  'APPDATA',
  'COMSPEC',
  'HOME',
  'LOCALAPPDATA',
  'PATH',
  'PATHEXT',
  'SystemRoot',
  'TEMP',
  'TMP',
  'USERPROFILE',
] as const;

export type WasmAvlBuildPlan = WasmAvlBuildPipelinePlanV2;

export interface WasmAvlBuildIdentityV2 extends SubstrateFederatedNativeWasmAvlPackageIdentityV1 {
  readonly wasmPackVersion: string;
  readonly wasmPackExecutableSha256Hex: string;
  readonly wasmBindgenVersion: string;
  readonly wasmBindgenExecutableSha256Hex: string;
  readonly rustcVersion: string;
  readonly rustcExecutableSha256Hex: string;
  readonly cargoVersion: string;
  readonly cargoExecutableSha256Hex: string;
}

export type { WasmAvlBuildToolNameV2 } from '../substrate-federated-native-wasm-avl-build-tool-pins-v1.js';
export { validateWasmAvlBuildToolHashV2 } from '../substrate-federated-native-wasm-avl-build-tool-pins-v1.js';

type ResolvedBuildTool = WasmAvlBuildPipelineToolV2;
type WasmAvlBuildTools = WasmAvlBuildPipelineToolsV2;

function normalizePath(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function assertSafeRemapSource(value: string, label: string): void {
  if (value.includes('=') || value.includes(ENCODED_RUSTFLAGS_SEPARATOR)) {
    throw new Error(`${label} contains an unsafe remap separator`);
  }
}

function requireCanonicalDirectory(value: string, label: string): string {
  if (!path.isAbsolute(value)) throw new Error(`${label} must be an absolute path`);
  const resolved = path.resolve(value);
  const metadata = lstatSync(resolved);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory`);
  }
  const canonical = realpathSync(resolved);
  if (normalizePath(canonical) !== normalizePath(resolved)) {
    throw new Error(`${label} must use its canonical path`);
  }
  assertSafeRemapSource(canonical, label);
  return canonical;
}

function environmentValue(
  env: NodeJS.ProcessEnv,
  field: string,
): string | undefined {
  const matches = Object.entries(env)
    .filter(([key]) => key.toUpperCase() === field.toUpperCase());
  if (matches.length > 1) throw new Error(`WASM AVL build has ambiguous ${field}`);
  const value = matches[0]?.[1];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function assertNoCargoConfiguration(bridgeRoot: string, cargoHome: string): void {
  const candidates = [
    path.resolve(cargoHome, 'config'),
    path.resolve(cargoHome, 'config.toml'),
  ];
  let cursor = path.resolve(bridgeRoot, 'wasm-avl');
  while (true) {
    candidates.push(
      path.resolve(cursor, '.cargo', 'config'),
      path.resolve(cursor, '.cargo', 'config.toml'),
    );
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  if (candidates.some(candidate => existsSync(candidate))) {
    throw new Error('WASM AVL build rejects external Cargo configuration');
  }
}

export function resolveWasmAvlCargoHome(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const configured = env.CARGO_HOME;
  const parent = platform === 'win32' ? env.USERPROFILE : env.HOME;
  const selected = configured ?? (parent ? path.resolve(parent, '.cargo') : undefined);
  if (!selected) throw new Error('WASM AVL build cannot resolve CARGO_HOME');
  return requireCanonicalDirectory(selected, 'WASM AVL CARGO_HOME');
}

export function resolveWasmAvlRustupHome(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const configured = env.RUSTUP_HOME;
  const parent = platform === 'win32' ? env.USERPROFILE : env.HOME;
  const selected = configured ?? (parent ? path.resolve(parent, '.rustup') : undefined);
  if (!selected) throw new Error('WASM AVL build cannot resolve RUSTUP_HOME');
  return requireCanonicalDirectory(selected, 'WASM AVL RUSTUP_HOME');
}

export function buildWasmAvlEnvironment(input: Readonly<{
  env: NodeJS.ProcessEnv;
  bridgeRoot: string;
  cargoHome: string;
  rustupHome: string;
}>): NodeJS.ProcessEnv {
  assertSafeRemapSource(input.bridgeRoot, 'WASM AVL bridge root');
  assertSafeRemapSource(input.cargoHome, 'WASM AVL CARGO_HOME');
  assertSafeRemapSource(input.rustupHome, 'WASM AVL RUSTUP_HOME');
  const inherited = new Map(
    Object.entries(input.env).map(([key, value]) => [key.toUpperCase(), value]),
  );
  for (const field of FORBIDDEN_PARENT_RUST_OVERRIDES) {
    const value = inherited.get(field);
    if (typeof value === 'string' && value.length > 0) {
      throw new Error(`WASM AVL build inherited forbidden override ${field}`);
    }
  }

  for (const [key, value] of inherited) {
    if (
      typeof value === 'string'
      && value.length > 0
      && (/^CARGO_(?:BUILD_TARGET|PROFILE_|TARGET_)/.test(key))
    ) {
      throw new Error(`WASM AVL build inherited forbidden override ${key}`);
    }
  }

  const result: NodeJS.ProcessEnv = {};
  for (const field of ALLOWED_PARENT_ENVIRONMENT) {
    const value = environmentValue(input.env, field);
    if (value) result[field] = value;
  }
  if (!result.PATH) throw new Error('WASM AVL build requires PATH');
  result.CARGO_HOME = input.cargoHome;
  result.CARGO_INCREMENTAL = '0';
  result.CARGO_NET_OFFLINE = 'true';
  result.CARGO_TERM_COLOR = 'never';
  result.NO_COLOR = '1';
  result.RUSTUP_AUTO_INSTALL = '0';
  result.RUSTUP_HOME = input.rustupHome;
  result.WASM_PACK_CACHE = path.resolve(input.bridgeRoot, 'wasm-avl', 'target', 'wasm-pack-cache');
  result.CARGO_ENCODED_RUSTFLAGS = [
    `--remap-path-prefix=${input.cargoHome}=/cargo-home`,
    `--remap-path-prefix=${input.bridgeRoot}=/bridge-source`,
  ].join(ENCODED_RUSTFLAGS_SEPARATOR);
  return result;
}

export function buildWasmAvlPlan(input: Readonly<{
  bridgeRoot: string;
  cargoHome: string;
  rustupHome: string;
  env?: NodeJS.ProcessEnv;
}>): Readonly<WasmAvlBuildPlan> {
  const bridgeRoot = requireCanonicalDirectory(input.bridgeRoot, 'WASM AVL bridge root');
  const cargoHome = requireCanonicalDirectory(input.cargoHome, 'WASM AVL CARGO_HOME');
  const rustupHome = requireCanonicalDirectory(input.rustupHome, 'WASM AVL RUSTUP_HOME');
  assertNoCargoConfiguration(bridgeRoot, cargoHome);
  return Object.freeze({
    executable: 'wasm-pack',
    args: Object.freeze([
      'build', '--target', 'nodejs', '--no-opt', '--mode', 'no-install',
    ] as const),
    cwd: realpathSync(path.resolve(bridgeRoot, 'wasm-avl')),
    env: buildWasmAvlEnvironment({
      env: input.env ?? process.env,
      bridgeRoot,
      cargoHome,
      rustupHome,
    }),
  });
}

export function validateWasmPackVersion(output: string): void {
  if (output.trim() !== REVIEWED_WASM_PACK_VERSION) {
    throw new Error(`WASM AVL build requires ${REVIEWED_WASM_PACK_VERSION}`);
  }
}

export function validateWasmBindgenVersion(output: string): void {
  if (output.trim() !== REVIEWED_WASM_BINDGEN_VERSION) {
    throw new Error(`WASM AVL build requires ${REVIEWED_WASM_BINDGEN_VERSION}`);
  }
}

export function validateWasmAvlRustToolchainVersions(
  rustcOutput: string,
  cargoOutput: string,
): void {
  if (rustcOutput.trim() !== REVIEWED_RUSTC_VERSION
    || cargoOutput.trim() !== REVIEWED_CARGO_VERSION) {
    throw new Error(`WASM AVL build requires Rust ${REVIEWED_RUST_VERSION}`);
  }
}

function validateReviewedBuildToolHashes(tools: Readonly<WasmAvlBuildTools>): void {
  for (const name of ['wasmPack', 'wasmBindgen', 'rustc', 'cargo'] as const) {
    validateWasmAvlBuildToolHashV2(name, tools[name].sha256Hex);
  }
}

function hashFile(pathname: string): string {
  return createHash('sha256').update(readFileSync(pathname)).digest('hex');
}

function resolveExecutablePath(name: string, env: NodeJS.ProcessEnv, cwd: string): string {
  const searchPath = environmentValue(env, 'PATH');
  if (!searchPath) throw new Error(`WASM AVL build cannot resolve ${name}`);
  const extensions = process.platform === 'win32'
    ? (environmentValue(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD')
      .split(';').filter(Boolean)
    : [''];
  const candidates = path.extname(name) ? [name] : extensions.map(extension => `${name}${extension}`);
  for (const entry of searchPath.split(delimiter)) {
    if (!entry) continue;
    for (const candidate of candidates) {
      const candidatePath = path.resolve(cwd, entry, candidate);
      if (!existsSync(candidatePath)) continue;
      try {
        const candidateMetadata = lstatSync(candidatePath);
        if (!candidateMetadata.isFile() || candidateMetadata.isSymbolicLink()) continue;
        const canonical = realpathSync(candidatePath);
        if (normalizePath(canonical) === normalizePath(candidatePath)) return canonical;
      } catch {
        // A stale PATH entry does not identify an executable.
      }
    }
  }
  throw new Error(`WASM AVL build cannot resolve ${name}`);
}

function requireCanonicalExecutable(value: string, label: string): string {
  if (!path.isAbsolute(value)) throw new Error(`WASM AVL ${label} path must be absolute`);
  const resolved = path.resolve(value);
  const metadata = lstatSync(resolved);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`WASM AVL ${label} must be a regular executable file`);
  }
  const canonical = realpathSync(resolved);
  if (normalizePath(canonical) !== normalizePath(resolved)) {
    throw new Error(`WASM AVL ${label} path must be canonical`);
  }
  return canonical;
}

async function runBuildTool(
  executablePath: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  timeoutMs: number,
  label: string,
  maxOutputBytes: number,
): Promise<Readonly<{ stdout: string; stderr: string }>> {
  const result = await runBoundedProcess({
    executablePath,
    args,
    cwd,
    env,
    timeoutMs,
    maxOutputBytes,
    terminationGraceMs: PROCESS_TERMINATION_GRACE_MS,
    label,
  });
  return Object.freeze({ stdout: result.stdout, stderr: result.stderr });
}

async function resolveRustTool(
  name: 'rustc' | 'cargo',
  rustupExecutablePath: string,
  rustupHome: string,
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<string> {
  const result = await runBuildTool(
    rustupExecutablePath,
    ['which', '--toolchain', REVIEWED_RUST_VERSION, name],
    env,
    cwd,
    TOOL_PROBE_TIMEOUT_MS,
    `WASM AVL rustup ${name} resolution`,
    TOOL_PROBE_MAX_OUTPUT_BYTES,
  );
  const lines = result.stdout.trim().split(/\r?\n/u);
  if (lines.length !== 1 || lines[0]!.trim() === '') {
    throw new Error(`WASM AVL rustup ${name} resolution was ambiguous`);
  }
  const executablePath = requireCanonicalExecutable(lines[0]!.trim(), `Rust ${name}`);
  const toolchainRoot = path.resolve(rustupHome, 'toolchains');
  const relative = path.relative(toolchainRoot, executablePath);
  const parts = relative.split(path.sep);
  if (
    path.isAbsolute(relative)
    || parts.length !== 3
    || !parts[0]!.startsWith(`${REVIEWED_RUST_VERSION}-`)
    || parts[1] !== 'bin'
    || path.basename(executablePath) !== `${name}${process.platform === 'win32' ? '.exe' : ''}`
  ) throw new Error(`WASM AVL rustup ${name} did not resolve inside the pinned toolchain`);
  return executablePath;
}

async function probeTool(
  executablePathInput: string,
  name: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
): Promise<ResolvedBuildTool> {
  const executablePath = requireCanonicalExecutable(executablePathInput, name);
  const hashBefore = hashFile(executablePath);
  const result = await runBuildTool(
    executablePath,
    args,
    env,
    cwd,
    TOOL_PROBE_TIMEOUT_MS,
    `WASM AVL ${name} version probe`,
    TOOL_PROBE_MAX_OUTPUT_BYTES,
  );
  const hashAfter = hashFile(executablePath);
  if (hashBefore !== hashAfter) throw new Error(`WASM AVL ${name} changed during its version probe`);
  return Object.freeze({
    path: executablePath,
    sha256Hex: hashAfter,
    version: result.stdout.trim(),
  });
}

async function inspectBuildTools(
  plan: Readonly<WasmAvlBuildPlan>,
  rustupHome: string,
  wasmBindgenExecutableInput?: string,
): Promise<Readonly<WasmAvlBuildTools>> {
  const wasmPackExecutable = resolveExecutablePath(plan.executable, plan.env, plan.cwd);
  const rustupExecutable = resolveExecutablePath('rustup', plan.env, plan.cwd);
  const wasmBindgenInput = wasmBindgenExecutableInput
    ?? environmentValue(process.env, 'WASM_BINDGEN_EXECUTABLE');
  const wasmBindgenExecutable = wasmBindgenInput
    ? requireCanonicalExecutable(wasmBindgenInput, 'wasm-bindgen')
    : resolveExecutablePath('wasm-bindgen', plan.env, plan.cwd);
  const [rustcExecutable, cargoExecutable] = await Promise.all([
    resolveRustTool('rustc', rustupExecutable, rustupHome, plan.env, plan.cwd),
    resolveRustTool('cargo', rustupExecutable, rustupHome, plan.env, plan.cwd),
  ]);
  const [wasmPack, wasmBindgen, rustc, cargo] = await Promise.all([
    probeTool(wasmPackExecutable, 'wasm-pack', ['--version'], plan.env, plan.cwd),
    probeTool(wasmBindgenExecutable, 'wasm-bindgen', ['--version'], plan.env, plan.cwd),
    probeTool(rustcExecutable, 'rustc', ['--version'], plan.env, plan.cwd),
    probeTool(cargoExecutable, 'cargo', ['--version'], plan.env, plan.cwd),
  ]);
  validateWasmPackVersion(wasmPack.version);
  validateWasmBindgenVersion(wasmBindgen.version);
  validateWasmAvlRustToolchainVersions(rustc.version, cargo.version);
  const tools = Object.freeze({ wasmPack, wasmBindgen, rustc, cargo });
  validateReviewedBuildToolHashes(tools);
  return tools;
}

/** Rebuild and return the current source, tool and generated-package identities. */
export async function buildWasmAvlPackageV2(
  bridgeRootInput: string,
  options: Readonly<{ quiet?: boolean; wasmBindgenExecutablePath?: string }> = {},
): Promise<Readonly<WasmAvlBuildIdentityV2>> {
  const bridgeRoot = requireCanonicalDirectory(bridgeRootInput, 'WASM AVL bridge root');
  const cargoHome = resolveWasmAvlCargoHome();
  const rustupHome = resolveWasmAvlRustupHome();
  const plan = buildWasmAvlPlan({
    bridgeRoot,
    cargoHome,
    rustupHome,
  });
  const pipeline = await runWasmAvlBuildPipelineV2(bridgeRoot, plan, {
    fingerprintSource: fingerprintSubstrateFederatedNativeWasmAvlSourceV1,
    inspectBuildTools: () => inspectBuildTools(
      plan,
      rustupHome,
      options.wasmBindgenExecutablePath,
    ),
    runBoundedProcess,
    assertPackageSmoke: assertSubstrateFederatedNativeWasmAvlPackageSmokeV1,
    emitBuildOutput: result => {
      if (options.quiet === true) return;
      if (result.stdout.length > 0) process.stdout.write(result.stdout);
      if (result.stderr.length > 0) process.stderr.write(result.stderr);
    },
  });
  const packageIdentity = pipeline.packageIdentity;
  const toolsAfter = pipeline.tools;
  return Object.freeze({
    ...packageIdentity,
    wasmPackVersion: toolsAfter.wasmPack.version,
    wasmPackExecutableSha256Hex: toolsAfter.wasmPack.sha256Hex,
    wasmBindgenVersion: toolsAfter.wasmBindgen.version,
    wasmBindgenExecutableSha256Hex: toolsAfter.wasmBindgen.sha256Hex,
    rustcVersion: toolsAfter.rustc.version,
    rustcExecutableSha256Hex: toolsAfter.rustc.sha256Hex,
    cargoVersion: toolsAfter.cargo.version,
    cargoExecutableSha256Hex: toolsAfter.cargo.sha256Hex,
  });
}

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error('WASM AVL build accepts no arguments');
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const bridgeRoot = realpathSync(path.resolve(scriptDirectory, '..', '..', '..'));
  await buildWasmAvlPackageV2(bridgeRoot);
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  void main().catch(error => {
    console.error(error instanceof Error ? error.message : 'WASM AVL build failed');
    process.exitCode = 1;
  });
}
