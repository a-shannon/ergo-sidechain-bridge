import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, parse, resolve } from 'node:path';

import {
  buildPinnedLocalNativeReproducibleRustFlags,
  EXPECTED_NATIVE_VERIFIER_TOOLCHAIN_LOCK_SHA256,
  runBoundedProcess,
  validateNativeVerifierToolchainLock,
  type NativeVerifierBuildToolObservation,
} from './pinned-local-native-verifier-build.js';

const SHORT_PROCESS_TIMEOUT_MS = 30_000;
const FRONTIER_BUILD_SPEC_STATUS =
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} Building chain spec$/;

export async function inspectSubstrateFederatedAuthoritySafePinnedToolchainV1(
  input: Readonly<{
    bridgeRoot: string;
    cargoExecutablePath: string;
    rustcExecutablePath: string;
    gitExecutablePath: string;
    cwd: string;
  }>,
): Promise<Readonly<NativeVerifierBuildToolObservation>> {
  const lockPath = canonicalRegularFile(
    join(input.bridgeRoot, 'sources', 'native-verifier-toolchain-lock.json'),
    'native verifier toolchain lock',
  );
  const lockBytes = readFileSync(lockPath);
  if (sha256(lockBytes) !== EXPECTED_NATIVE_VERIFIER_TOOLCHAIN_LOCK_SHA256) {
    throw new Error('native verifier toolchain lock differs from the compiled pin');
  }
  const parsed = JSON.parse(lockBytes.toString('utf8')) as unknown;
  const platformKey = `${process.platform}-${process.arch}`;
  const profile = record(record(record(parsed)?.profiles)?.[platformKey]);
  const rustTarget = boundedToken(profile?.rustTarget, 'pinned Rust target');
  const cargoProfile = requiredToolProfile(profile?.cargo, 'Cargo');
  const rustcProfile = requiredToolProfile(profile?.rustc, 'Rust compiler');
  const gitProfile = requiredToolProfile(profile?.git, 'Git');
  const environment = buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1();
  const observation = Object.freeze({
    platformKey,
    rustTarget,
    cargo: Object.freeze({
      version: await exactVersion({
        executablePath: input.cargoExecutablePath,
        cwd: input.cwd,
        environment,
        expected: cargoProfile.version,
        label: 'Cargo',
      }),
      sha256: sha256(readFileSync(input.cargoExecutablePath)),
    }),
    rustc: Object.freeze({
      version: await exactVersion({
        executablePath: input.rustcExecutablePath,
        cwd: input.cwd,
        environment,
        expected: rustcProfile.version,
        label: 'Rust compiler',
      }),
      sha256: sha256(readFileSync(input.rustcExecutablePath)),
    }),
    git: Object.freeze({
      version: await exactVersion({
        executablePath: input.gitExecutablePath,
        cwd: input.cwd,
        environment,
        expected: gitProfile.version,
        label: 'Git',
      }),
      sha256: sha256(readFileSync(input.gitExecutablePath)),
    }),
  });
  const validation = validateNativeVerifierToolchainLock(parsed, observation);
  if (validation.errors.length > 0) {
    throw new Error('native build tools differ from the pinned toolchain lock');
  }
  return observation;
}

export function buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1():
  NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  if (process.platform === 'win32') {
    const configuredSystemRoot = process.env.SystemRoot
      ?? process.env.SYSTEMROOT
      ?? process.env.WINDIR;
    if (configuredSystemRoot === undefined || !isAbsolute(configuredSystemRoot)) {
      throw new Error('SystemRoot must be one absolute Windows directory');
    }
    const canonicalSystemRoot = realpathSync(configuredSystemRoot);
    const expectedSystemDrive = parse(canonicalSystemRoot).root.replace(/[\\/]+$/u, '');
    const systemDrive = process.env.SystemDrive;
    if (systemDrive === undefined || !/^[A-Za-z]:$/u.test(systemDrive)) {
      throw new Error('SystemDrive must be one Windows drive designator');
    }
    if (systemDrive.toUpperCase() !== expectedSystemDrive.toUpperCase()) {
      throw new Error('SystemDrive must match the canonical SystemRoot drive');
    }
    environment.SystemRoot = canonicalSystemRoot;
    environment.WINDIR = canonicalSystemRoot;
    environment.SystemDrive = expectedSystemDrive;
  }
  return environment;
}

export function buildSubstrateFederatedAuthoritySafeCargoEnvironmentV1(
  input: Readonly<{
    cargoTargetDirectory: string;
    cargoHomeDirectory: string;
    cargoExecutablePath: string;
    frontierSourcePath: string;
    rustcExecutablePath: string;
    rustTarget: string;
  }>,
): NodeJS.ProcessEnv {
  const environment = buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1();
  const cargoToolDirectory = dirname(input.cargoExecutablePath);
  if (dirname(input.rustcExecutablePath) !== cargoToolDirectory) {
    throw new Error('Cargo and Rust compiler must come from one pinned toolchain directory');
  }
  const inheritedPath = process.env.Path ?? process.env.PATH ?? '';
  delete environment.PATH;
  delete environment.Path;
  environment[process.platform === 'win32' ? 'Path' : 'PATH'] =
    `${cargoToolDirectory}${delimiter}${inheritedPath}`;
  for (const key of ['USERPROFILE', 'HOME', 'RUSTUP_HOME']) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  if (process.platform === 'win32') {
    for (const key of ['LIB', 'LIBPATH', 'INCLUDE']) {
      if (process.env[key]) environment[key] = process.env[key];
    }
  }
  environment.CARGO_HOME = input.cargoHomeDirectory;
  environment.CARGO_TARGET_DIR = input.cargoTargetDirectory;
  environment.WASM_BUILD_WORKSPACE_HINT = input.frontierSourcePath;
  environment.CARGO_NET_OFFLINE = 'true';
  environment.CARGO_NET_GIT_FETCH_WITH_CLI = 'false';
  environment.CARGO_INCREMENTAL = '0';
  environment.CARGO_PROFILE_DEV_INCREMENTAL = 'false';
  environment.CARGO_PROFILE_DEV_DEBUG = '0';
  environment.CARGO_PROFILE_DEV_CODEGEN_UNITS = '1';
  environment.RUSTC = input.rustcExecutablePath;
  environment.RUSTC_WRAPPER = '';
  environment.RUSTC_WORKSPACE_WRAPPER = '';
  const userProfile = process.platform === 'win32'
    ? process.env.USERPROFILE
    : process.env.HOME;
  if (!userProfile) {
    throw new Error('user profile path is required for deterministic Wasm path remapping');
  }
  const remappedUserProfile = rustFlagPathToken(userProfile, 'user profile');
  const remappedBuildTarget = rustFlagPathToken(
    input.cargoTargetDirectory,
    'Cargo target',
  );
  const remappedFrontierSource = rustFlagPathToken(
    input.frontierSourcePath,
    'Frontier source',
  );
  environment.WASM_BUILD_RUSTFLAGS = [
    `--remap-path-prefix=${remappedUserProfile}=/e2s/user-profile`,
    `--remap-path-prefix=${remappedBuildTarget}=/e2s/build-target`,
    `--remap-path-prefix=${remappedFrontierSource}=/e2s/frontier-source`,
  ].join(' ');
  const nativeRustFlags = buildPinnedLocalNativeReproducibleRustFlags({
    frontierSourcePath: remappedFrontierSource,
    buildTargetPath: remappedBuildTarget,
    rustTarget: input.rustTarget,
  });
  environment[
    `CARGO_TARGET_${input.rustTarget.toUpperCase().replaceAll('-', '_')}_RUSTFLAGS`
  ] = nativeRustFlags.join(' ');
  return environment;
}

export function assertSubstrateFederatedAuthoritySafeBuildSpecStderrV1(
  stderr: string,
): void {
  const buildSpecStatus = stderr.trim();
  if (
    buildSpecStatus !== ''
    && !FRONTIER_BUILD_SPEC_STATUS.test(buildSpecStatus)
  ) {
    throw new Error('Frontier chain-spec acceptance wrote unexpected stderr');
  }
}

function canonicalRegularFile(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new Error(`${label} must be one local absolute path`);
  }
  const path = resolve(value);
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be one regular file`);
  }
  return realpathSync(path);
}

async function exactVersion(input: Readonly<{
  executablePath: string;
  cwd: string;
  environment: NodeJS.ProcessEnv;
  expected: string;
  label: string;
}>): Promise<string> {
  const result = await runBoundedProcess({
    executablePath: input.executablePath,
    args: ['--version'],
    cwd: input.cwd,
    env: input.environment,
    timeoutMs: SHORT_PROCESS_TIMEOUT_MS,
    maxOutputBytes: 64 * 1024,
    label: `${input.label} version`,
  });
  if (result.stderr.trim() !== '' || result.stdout.trim() !== input.expected) {
    throw new Error(`${input.label} version differs from the explicit pin`);
  }
  return input.expected;
}

function requiredToolProfile(
  value: unknown,
  label: string,
): Readonly<{ version: string; sha256: string }> {
  const profile = record(value);
  const version = boundedLine(profile?.version, `${label} lock version`);
  const sha256Hex = digest(profile?.sha256, `${label} lock SHA-256`);
  return Object.freeze({ version, sha256: sha256Hex });
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function rustFlagPathToken(value: string, label: string): string {
  if (/[\p{White_Space}\p{Cc}=]/u.test(value)) {
    throw new Error(
      `${label} path must not contain Unicode whitespace, control characters, or equals signs in Rust flags`,
    );
  }
  return value;
}

function boundedToken(value: unknown, label: string): string {
  const token = boundedLine(value, label);
  if (!/^[A-Za-z0-9_.-]+$/.test(token)) {
    throw new Error(`${label} must contain one canonical token`);
  }
  return token;
}

function boundedLine(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 256
    || /[\r\n\0]/.test(value)
  ) {
    throw new Error(`${label} must be one bounded line`);
  }
  return value;
}

function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be lowercase 32-byte hex`);
  }
  return value;
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
