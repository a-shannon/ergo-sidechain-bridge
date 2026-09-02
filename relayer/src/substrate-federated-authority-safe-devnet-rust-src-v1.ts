import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import {
  EXPECTED_NATIVE_VERIFIER_TOOLCHAIN_LOCK_SHA256,
} from './pinned-local-native-verifier-build.js';

const EXPECTED_RUST_SRC_LOCK_SHA256 =
  '4a78bb1db71a387c6a22d32d6c59d2472a2e3251e2a2fa68e5b1756c5894bd69';
const LIBRARY_RELATIVE_PATH = 'lib/rustlib/src/rust/library';

export interface SubstrateFederatedAuthoritySafePinnedRustSrcV1Observation {
  readonly libraryPath: string;
  readonly cargoManifestPath: string;
  readonly cargoLockPath: string;
  readonly cargoManifestSha256Hex: string;
  readonly cargoLockSha256Hex: string;
  readonly rustSrcLockSha256Hex: string;
}

export function inspectSubstrateFederatedAuthoritySafePinnedRustSrcV1(
  input: Readonly<{
    bridgeRoot: string;
    rustcExecutablePath: string;
  }>,
): Readonly<SubstrateFederatedAuthoritySafePinnedRustSrcV1Observation> {
  const bridgeRoot = canonicalDirectory(input.bridgeRoot, 'bridge root');
  const rustcExecutablePath = canonicalRegularFile(
    input.rustcExecutablePath,
    'Rust compiler executable',
  );
  const libraryPath = canonicalDirectory(
    join(
      dirname(rustcExecutablePath),
      '..',
      'lib',
      'rustlib',
      'src',
      'rust',
      'library',
    ),
    'pinned Rust standard-library source',
  );
  const cargoManifestPath = canonicalRegularFile(
    join(libraryPath, 'Cargo.toml'),
    'pinned Rust standard-library Cargo manifest',
  );
  const cargoLockPath = canonicalRegularFile(
    join(libraryPath, 'Cargo.lock'),
    'pinned Rust standard-library Cargo lock',
  );
  const lockPath = canonicalRegularFile(
    join(
      bridgeRoot,
      'sources',
      'substrate-federated-authority-safe-devnet-rust-src-lock-v1.json',
    ),
    'authority-safe Frontier rust-src lock',
  );
  const lockBytes = exactFileBytes(
    lockPath,
    'authority-safe Frontier rust-src lock',
  );
  if (sha256(lockBytes) !== EXPECTED_RUST_SRC_LOCK_SHA256) {
    throw new Error('authority-safe Frontier rust-src lock differs from its pin');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(lockBytes.toString('utf8')) as unknown;
  } catch {
    throw new Error('authority-safe Frontier rust-src lock is invalid');
  }
  const observation = Object.freeze({
    libraryPath,
    cargoManifestPath,
    cargoLockPath,
    cargoManifestSha256Hex: sha256(exactFileBytes(
      cargoManifestPath,
      'pinned Rust standard-library Cargo manifest',
    )),
    cargoLockSha256Hex: sha256(exactFileBytes(
      cargoLockPath,
      'pinned Rust standard-library Cargo lock',
    )),
    rustSrcLockSha256Hex: EXPECTED_RUST_SRC_LOCK_SHA256,
  });
  const errors = validateSubstrateFederatedAuthoritySafeRustSrcLockV1(
    parsed,
    observation,
  );
  if (errors.length > 0) {
    throw new Error('authority-safe Frontier rust-src differs from its pin');
  }
  return observation;
}

export function validateSubstrateFederatedAuthoritySafeRustSrcLockV1(
  value: unknown,
  observation: Readonly<
    Pick<
      SubstrateFederatedAuthoritySafePinnedRustSrcV1Observation,
      'cargoManifestSha256Hex' | 'cargoLockSha256Hex'
    >
  >,
): readonly string[] {
  const errors: string[] = [];
  const lock = record(value);
  if (lock === undefined) {
    return Object.freeze(['rust-src lock must be an object']);
  }
  exact(errors, lock.schemaVersion, 1, 'rust-src lock schemaVersion');
  exact(
    errors,
    lock.kind,
    'substrate-federated-authority-safe-devnet-rust-src-lock',
    'rust-src lock kind',
  );
  exact(
    errors,
    lock.nativeVerifierToolchainLockSha256,
    EXPECTED_NATIVE_VERIFIER_TOOLCHAIN_LOCK_SHA256,
    'rust-src native toolchain binding',
  );
  exact(
    errors,
    lock.libraryRelativePath,
    LIBRARY_RELATIVE_PATH,
    'rust-src library relative path',
  );
  exact(
    errors,
    lock.cargoManifestSha256,
    observation.cargoManifestSha256Hex,
    'rust-src Cargo manifest SHA-256',
  );
  exact(
    errors,
    lock.cargoLockSha256,
    observation.cargoLockSha256Hex,
    'rust-src Cargo lock SHA-256',
  );
  const boundaries = record(lock.boundaries);
  for (const field of [
    'exactRustcLayoutRequired',
    'cargoManifestDigestRequired',
    'cargoLockDigestRequired',
    'beforeAfterObservationRequired',
    'localConformanceOnly',
  ]) {
    if (boundaries?.[field] !== true) {
      errors.push(`rust-src lock must require ${field}`);
    }
  }
  for (const field of [
    'completeBuildToolClosureVerifiedByThisLock',
    'dependencyCacheContentAttestedByThisLock',
    'independentBuildAttestationVerifiedByThisLock',
    'admissionEligible',
  ]) {
    if (boundaries?.[field] !== false) {
      errors.push(`rust-src lock must keep ${field} false`);
    }
  }
  return Object.freeze(errors);
}

function canonicalDirectory(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new Error(`${label} must be one absolute directory`);
  }
  try {
    const path = resolve(value);
    const status = lstatSync(path);
    if (!status.isDirectory() || status.isSymbolicLink()) throw new Error();
    return realpathSync(path);
  } catch {
    throw new Error(`${label} must be one absolute directory`);
  }
}

function canonicalRegularFile(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new Error(`${label} must be one explicit absolute regular file`);
  }
  try {
    const path = resolve(value);
    const status = lstatSync(path);
    if (!status.isFile() || status.isSymbolicLink()) throw new Error();
    return realpathSync(path);
  } catch {
    throw new Error(`${label} must be one explicit absolute regular file`);
  }
}

function exactFileBytes(path: string, label: string): Buffer {
  try {
    return readFileSync(path);
  } catch {
    throw new Error(`${label} could not be read`);
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function exact(
  errors: string[],
  actual: unknown,
  expected: unknown,
  label: string,
): void {
  if (actual !== expected) errors.push(`${label} differs from the observation`);
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
