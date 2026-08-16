import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENCODED_RUSTFLAGS_SEPARATOR = '\u001f';
const REVIEWED_WASM_PACK_VERSION = 'wasm-pack 0.14.0';
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
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'USERPROFILE',
] as const;

export interface WasmAvlBuildPlan {
  readonly executable: 'wasm-pack';
  readonly args: readonly ['build', '--target', 'nodejs'];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
}

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
  const matches = Object.entries(env).filter(([key]) => key.toUpperCase() === field);
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
  result.CARGO_TERM_COLOR = 'never';
  result.NO_COLOR = '1';
  result.RUSTUP_HOME = input.rustupHome;
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
    args: Object.freeze(['build', '--target', 'nodejs'] as const),
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

function main(): void {
  if (process.argv.length > 2) throw new Error('WASM AVL build accepts no arguments');
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const bridgeRoot = realpathSync(path.resolve(scriptDirectory, '..', '..', '..'));
  const plan = buildWasmAvlPlan({
    bridgeRoot,
    cargoHome: resolveWasmAvlCargoHome(),
    rustupHome: resolveWasmAvlRustupHome(),
  });
  const version = spawnSync(plan.executable, ['--version'], {
    cwd: plan.cwd,
    env: plan.env,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (version.error || version.status !== 0 || version.signal !== null) {
    throw new Error('WASM AVL wasm-pack version probe failed');
  }
  validateWasmPackVersion(version.stdout);
  const result = spawnSync(plan.executable, [...plan.args], {
    cwd: plan.cwd,
    env: plan.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal !== null) {
    throw new Error(`WASM AVL build failed with exit code ${String(result.status)}`);
  }
}

if (
  process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'WASM AVL build failed');
    process.exitCode = 1;
  }
}
