import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

const EXPECTED_PROTOC_LOCK_SHA256 =
  'e0f4cc1a07296163b863fcea4a73c53ef820eb5861dee2d6c618eb58f64cef3c';
const VERSION_TIMEOUT_MS = 30_000;
const MAX_VERSION_OUTPUT_BYTES = 64 * 1024;

export interface SubstrateFederatedAuthoritySafePinnedProtocV1Observation {
  readonly executablePath: string;
  readonly platformKey: string;
  readonly version: string;
  readonly sha256Hex: string;
}

export function inspectSubstrateFederatedAuthoritySafePinnedProtocV1(
  input: Readonly<{
    bridgeRoot: string;
    cwd: string;
  }>,
): Readonly<SubstrateFederatedAuthoritySafePinnedProtocV1Observation> {
  const bridgeRoot = canonicalDirectory(input.bridgeRoot, 'bridge root');
  const cwd = canonicalDirectory(input.cwd, 'Protobuf compiler working directory');
  const executablePath = canonicalRegularFile(
    process.env.PROTOC,
    'PROTOC executable',
  );
  const lockPath = canonicalRegularFile(
    join(
      bridgeRoot,
      'sources',
      'substrate-federated-authority-safe-devnet-protoc-lock-v1.json',
    ),
    'authority-safe Frontier Protobuf compiler lock',
  );
  const lockBytes = exactFileBytes(
    lockPath,
    'authority-safe Frontier Protobuf compiler lock',
  );
  if (sha256(lockBytes) !== EXPECTED_PROTOC_LOCK_SHA256) {
    throw new Error('authority-safe Frontier Protobuf compiler lock differs from its pin');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(lockBytes.toString('utf8')) as unknown;
  } catch {
    throw new Error('authority-safe Frontier Protobuf compiler lock is invalid');
  }
  const versionResult = spawnSync(executablePath, ['--version'], {
    cwd,
    encoding: 'utf8',
    env: minimalToolEnvironment(),
    maxBuffer: MAX_VERSION_OUTPUT_BYTES,
    shell: false,
    timeout: VERSION_TIMEOUT_MS,
    windowsHide: true,
  });
  if (
    versionResult.error !== undefined
    || versionResult.status !== 0
    || versionResult.signal !== null
    || versionResult.stderr.trim() !== ''
  ) {
    throw new Error('authority-safe Frontier Protobuf compiler version check failed');
  }
  const observation = Object.freeze({
    executablePath,
    platformKey: `${process.platform}-${process.arch}`,
    version: versionResult.stdout.trim(),
    sha256Hex: sha256(exactFileBytes(executablePath, 'PROTOC executable')),
  });
  const errors = validateSubstrateFederatedAuthoritySafeProtocLockV1(
    parsed,
    observation,
  );
  if (errors.length > 0) {
    throw new Error('authority-safe Frontier Protobuf compiler differs from its pin');
  }
  return observation;
}

export function validateSubstrateFederatedAuthoritySafeProtocLockV1(
  value: unknown,
  observation: Readonly<
    Omit<SubstrateFederatedAuthoritySafePinnedProtocV1Observation, 'executablePath'>
  >,
): readonly string[] {
  const errors: string[] = [];
  const lock = record(value);
  if (lock === undefined) {
    return Object.freeze(['Protobuf compiler lock must be an object']);
  }
  exact(errors, lock.schemaVersion, 1, 'Protobuf compiler lock schemaVersion');
  exact(
    errors,
    lock.kind,
    'substrate-federated-authority-safe-devnet-protoc-lock',
    'Protobuf compiler lock kind',
  );
  const profile = record(record(lock.profiles)?.[observation.platformKey]);
  if (profile === undefined) {
    errors.push(`Protobuf compiler lock has no profile for ${observation.platformKey}`);
  } else {
    exact(errors, profile.version, observation.version, 'Protobuf compiler version');
    exact(errors, profile.sha256, observation.sha256Hex, 'Protobuf compiler SHA-256');
  }
  const boundaries = record(lock.boundaries);
  for (const field of [
    'explicitEnvironmentPathRequired',
    'absoluteToolPathRequired',
    'toolDigestRequired',
    'toolVersionRequired',
    'unsupportedPlatformsFailClosed',
    'localConformanceOnly',
  ]) {
    if (boundaries?.[field] !== true) {
      errors.push(`Protobuf compiler lock must require ${field}`);
    }
  }
  for (const field of [
    'completeBuildToolClosureVerifiedByThisLock',
    'dependencyCacheContentAttestedByThisLock',
    'independentBuildAttestationVerifiedByThisLock',
    'admissionEligible',
  ]) {
    if (boundaries?.[field] !== false) {
      errors.push(`Protobuf compiler lock must keep ${field} false`);
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
    throw new Error(`${label} must be one regular directory`);
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

function minimalToolEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['SystemRoot', 'WINDIR', 'SystemDrive', 'TEMP', 'TMP']) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  return environment;
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
