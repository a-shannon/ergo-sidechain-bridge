import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { dirname, win32 } from 'path';

import {
  normalizeExecutableSha256Hex,
  verifyExecutableSha256,
} from './native-executable-pin.js';

const MAX_TIMEOUT_MS = 300_000;
const MAX_REQUEST_BYTES = 32 * 1024 * 1024;
const MAX_STDOUT_BYTES = 16 * 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;
const MAX_TARGET_ARGUMENTS = 64;
const MAX_TARGET_ARGUMENT_BYTES = 8 * 1024;
const MAX_AUTHORITY_SYSTEM_DLLS = 128;
const MAX_AUTHORITY_DLL_NAME_BYTES = 128;
const BROKER_WALL_CLOCK_GRACE_MS = 10 * 60_000;

export interface NativeContainedProcessInput {
  launcherPath: string;
  launcherSha256Hex: string;
  targetPath: string;
  targetSha256Hex: string;
  targetArgs: readonly string[];
  policyNotBeforeUnixMs: number;
  policyExpiresAtUnixMs: number;
  timeoutMs: number;
  requestLimitBytes: number;
  stdoutLimitBytes: number;
  stderrLimitBytes: number;
  requestBytes: Buffer;
  authority?: NativeContainedAuthorityPolicy;
}

export interface NativeContainedAuthorityPolicy {
  profileDigestHex: string;
  policyDigestHex: string;
  policyEpoch: number;
  recordVersion?: 'v2';
  allowedSystemDlls: readonly string[];
}

export interface NativeContainedLauncherInvocationInput {
  launcherPath: string;
  targetPath: string;
  targetSha256Hex: string;
  targetArgs: readonly string[];
  policyNotBeforeUnixMs: number;
  policyExpiresAtUnixMs: number;
  timeoutMs: number;
  requestLimitBytes: number;
  stdoutLimitBytes: number;
  stderrLimitBytes: number;
  authority?: NativeContainedAuthorityPolicy;
}

export interface NativeContainedLauncherInvocation {
  executablePath: string;
  args: readonly string[];
}

export interface NativeContainedProcessResult {
  stdout: Buffer;
  boundary: {
    trustedLauncherInstallationRequired: true;
    launcherDigestMatchedBeforeAndAfter: true;
    brokerSelfImageBoundToAuthorityRecordV2: boolean;
    launcherInstallationActivationCampaignCompleted: false;
    launcherAtomicBootstrapProven: false;
    targetAtomicityDelegatedToBroker: true;
    targetAtomicityObservedByTypeScript: false;
    executionAdmissionGranted: false;
    gate5Closed: false;
    productionReady: false;
  };
}

export interface NativeContainedLauncherTransportInput {
  executablePath: string;
  args: string[];
  timeoutMs: number;
  stdoutLimitBytes: number;
  stderrLimitBytes: number;
  requestBytes: Buffer;
}

export function nativeContainedLauncherOuterDeadlineMs(timeoutMs: number): number {
  return boundedTimeout(timeoutMs) + BROKER_WALL_CLOCK_GRACE_MS;
}

export function normalizeImmutableNativeContainedLauncherPath(
  value: unknown,
  launcherSha256Hex: unknown,
): string {
  const path = localAbsoluteWindowsPath(
    value,
    'immutable native contained launcher',
  );
  const digest = normalizeExecutableSha256Hex(
    launcherSha256Hex,
    'immutable native contained launcher digest',
  ).slice(2);
  const match = /^([A-Z]:\\.+)\\E2SBridge\\NativeExecution\\v2\\Images\\([0-9a-f]{64})\\bridge-contained-launcher\.exe$/
    .exec(path);
  if (
    !match
    || match[2] !== digest
    || win32.normalize(path) !== path
  ) {
    throw new Error(
      'immutable native contained launcher path must use the canonical digest-addressed v2 installation suffix; the broker verifies the exact Program Files known folder',
    );
  }
  return path;
}

export function buildNativeContainedLauncherInvocation(
  input: NativeContainedLauncherInvocationInput,
): NativeContainedLauncherInvocation {
  const launcherPath = localAbsoluteWindowsPath(input.launcherPath, 'native contained launcher');
  const targetPath = localAbsoluteWindowsPath(input.targetPath, 'native contained target');
  const targetSha256Hex = normalizeExecutableSha256Hex(
    input.targetSha256Hex,
    'native contained target digest',
  );
  const policyNotBeforeUnixMs = boundedUnixTimestampMs(
    input.policyNotBeforeUnixMs,
    'native contained policy not-before timestamp',
  );
  const policyExpiresAtUnixMs = boundedUnixTimestampMs(
    input.policyExpiresAtUnixMs,
    'native contained policy expiry timestamp',
  );
  if (policyNotBeforeUnixMs >= policyExpiresAtUnixMs) {
    throw new Error('native contained policy window must have not-before before expiry');
  }
  const timeoutMs = boundedTimeout(input.timeoutMs);
  const requestLimitBytes = boundedByteLimit(
    input.requestLimitBytes,
    MAX_REQUEST_BYTES,
    'native contained request limit',
  );
  const stdoutLimitBytes = boundedByteLimit(
    input.stdoutLimitBytes,
    MAX_STDOUT_BYTES,
    'native contained stdout limit',
  );
  const stderrLimitBytes = boundedByteLimit(
    input.stderrLimitBytes,
    MAX_STDERR_BYTES,
    'native contained stderr limit',
  );
  const targetArgs = boundedArguments(
    input.targetArgs,
    MAX_TARGET_ARGUMENTS,
    MAX_TARGET_ARGUMENT_BYTES,
    'native contained target',
  );
  const authorityArgs = input.authority === undefined
    ? []
    : nativeContainedAuthorityArguments(input.authority);

  return Object.freeze({
    executablePath: launcherPath,
    args: Object.freeze([
      '--target',
      targetPath,
      '--sha256',
      targetSha256Hex,
      '--not-before-unix-ms',
      String(policyNotBeforeUnixMs),
      '--expires-at-unix-ms',
      String(policyExpiresAtUnixMs),
      '--timeout-ms',
      String(timeoutMs),
      '--request-limit',
      String(requestLimitBytes),
      '--stdout-limit',
      String(stdoutLimitBytes),
      '--stderr-limit',
      String(stderrLimitBytes),
      ...authorityArgs,
      '--',
      ...targetArgs,
    ]),
  });
}

export function classifyNativeContainedLauncherFailure(
  exitCode: number | null,
  signal: NodeJS.Signals | null,
  _stderr: Buffer,
): Error {
  const messages = new Map<number, string>([
    [20, 'native contained target validation failed'],
    [21, 'native contained target failed to start'],
    [22, 'native contained target timed out'],
    [23, 'native contained target stdout exceeded the limit'],
    [24, 'native contained target stderr exceeded the limit'],
    [25, 'native contained target rejected the request'],
    [26, 'native contained target process containment failed'],
    [27, 'native contained execution policy is outside its reviewed validity window'],
    [28, 'native contained authority policy validation failed'],
  ]);
  if (exitCode !== null) {
    return new Error(messages.get(exitCode) ?? 'native contained launcher failed');
  }
  return new Error(signal
    ? 'native contained launcher terminated unexpectedly'
    : 'native contained launcher failed');
}

function nativeContainedAuthorityArguments(
  input: NativeContainedAuthorityPolicy,
): string[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('native contained authority policy must be an object');
  }
  const keys = Object.keys(input).sort();
  const expectedKeys = [
    'allowedSystemDlls',
    'policyDigestHex',
    'policyEpoch',
    'profileDigestHex',
    ...(input.recordVersion === undefined ? [] : ['recordVersion']),
  ];
  expectedKeys.sort();
  if (
    keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error('native contained authority policy has an unexpected field');
  }
  const profileDigestHex = normalizeExecutableSha256Hex(
    input.profileDigestHex,
    'native contained authority profile digest',
  ).slice(2);
  const policyDigestHex = normalizeExecutableSha256Hex(
    input.policyDigestHex,
    'native contained authority policy digest',
  ).slice(2);
  if (!Number.isSafeInteger(input.policyEpoch) || input.policyEpoch <= 0) {
    throw new Error('native contained authority policy epoch must be a positive safe integer');
  }
  if (input.recordVersion !== undefined && input.recordVersion !== 'v2') {
    throw new Error('native contained authority record version is unsupported');
  }
  if (
    !Array.isArray(input.allowedSystemDlls)
    || input.allowedSystemDlls.length === 0
  ) {
    throw new Error('native contained authority system DLL allowlist must be non-empty');
  }
  if (input.allowedSystemDlls.length > MAX_AUTHORITY_SYSTEM_DLLS) {
    throw new Error(
      `native contained authority system DLL allowlist exceeds ${MAX_AUTHORITY_SYSTEM_DLLS} entries`,
    );
  }
  const allowedSystemDlls = input.allowedSystemDlls.map((value, index) => {
    if (
      typeof value !== 'string'
      || Buffer.byteLength(value, 'utf8') > MAX_AUTHORITY_DLL_NAME_BYTES
      || !/^[a-z0-9._-]+\.dll$/.test(value)
    ) {
      throw new Error(`native contained authority system DLL ${index} is invalid`);
    }
    if (index > 0 && input.allowedSystemDlls[index - 1] >= value) {
      throw new Error('native contained authority system DLL allowlist must be sorted and unique');
    }
    return value;
  });

  return [
    '--authority-profile-digest',
    profileDigestHex,
    '--authority-policy-digest',
    policyDigestHex,
    '--authority-policy-epoch',
    String(input.policyEpoch),
    ...(input.recordVersion === undefined
      ? []
      : ['--authority-record-version', input.recordVersion]),
    ...allowedSystemDlls.flatMap(value => ['--allowed-system-dll', value]),
  ];
}

export async function runNativeContainedProcess(
  input: NativeContainedProcessInput,
): Promise<NativeContainedProcessResult> {
  if (!Buffer.isBuffer(input.requestBytes)) {
    throw new Error('native contained request must be a Buffer');
  }
  const invocation = buildNativeContainedLauncherInvocation(input);
  if (input.requestBytes.length > input.requestLimitBytes) {
    throw new Error(`native contained request exceeds ${input.requestLimitBytes} bytes`);
  }
  const launcherDigest = normalizeExecutableSha256Hex(
    input.launcherSha256Hex,
    'trusted native contained launcher digest',
  );
  await verifyExecutableSha256(
    invocation.executablePath,
    launcherDigest,
    'native contained launcher',
  );

  const stdout = await executeNativeContainedLauncherTransport({
    executablePath: invocation.executablePath,
    args: [...invocation.args],
    timeoutMs: input.timeoutMs,
    stdoutLimitBytes: input.stdoutLimitBytes,
    stderrLimitBytes: input.stderrLimitBytes,
    requestBytes: input.requestBytes,
  });

  await verifyExecutableSha256(
    invocation.executablePath,
    launcherDigest,
    'native contained launcher',
  );
  return Object.freeze({
    stdout,
    boundary: Object.freeze({
      trustedLauncherInstallationRequired: true as const,
      launcherDigestMatchedBeforeAndAfter: true as const,
      brokerSelfImageBoundToAuthorityRecordV2:
        input.authority?.recordVersion === 'v2',
      launcherInstallationActivationCampaignCompleted: false as const,
      launcherAtomicBootstrapProven: false as const,
      targetAtomicityDelegatedToBroker: true as const,
      targetAtomicityObservedByTypeScript: false as const,
      executionAdmissionGranted: false as const,
      gate5Closed: false as const,
      productionReady: false as const,
    }),
  });
}

/** Process transport only. This function grants no pinning, containment, or admission claim. */
export async function executeNativeContainedLauncherTransport(
  input: NativeContainedLauncherTransportInput,
): Promise<Buffer> {
  const outerDeadlineMs = nativeContainedLauncherOuterDeadlineMs(input.timeoutMs);
  const stdoutLimitBytes = boundedByteLimit(
    input.stdoutLimitBytes,
    MAX_STDOUT_BYTES,
    'native contained stdout limit',
  );
  const stderrLimitBytes = boundedByteLimit(
    input.stderrLimitBytes,
    MAX_STDERR_BYTES,
    'native contained stderr limit',
  );
  return await new Promise<Buffer>((resolvePromise, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(input.executablePath, input.args, {
        cwd: dirname(input.executablePath),
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: minimalLauncherEnvironment(),
      });
    } catch {
      reject(new Error('native contained launcher failed to start'));
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let termination: 'watchdog' | 'stdout' | 'stderr' | null = null;
    let settled = false;
    let spawnFailed = false;
    let stdinFailed = false;
    const timer = setTimeout(
      () => terminate('watchdog'),
      outerDeadlineMs,
    );

    child.once('error', () => {
      spawnFailed = true;
    });
    child.stdin.once('error', () => {
      stdinFailed = true;
    });
    child.stdout.on('data', (chunk: Buffer) => {
      if (termination !== null) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > stdoutLimitBytes) {
        terminate('stdout');
        return;
      }
      stdoutChunks.push(Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (termination !== null) return;
      stderrBytes += chunk.length;
      if (stderrBytes > stderrLimitBytes) {
        terminate('stderr');
        return;
      }
      stderrChunks.push(Buffer.from(chunk));
    });
    child.once('close', (code, signal) => {
      if (termination === 'watchdog') {
        finish(new Error('native contained launcher exceeded its outer wall-clock deadline'));
      } else if (termination === 'stdout') {
        finish(new Error('native contained launcher stdout exceeded the reviewed limit'));
      } else if (termination === 'stderr') {
        finish(new Error('native contained launcher stderr exceeded the reviewed limit'));
      } else if (spawnFailed) {
        finish(new Error('native contained launcher failed to start'));
      } else if (stdinFailed) {
        finish(new Error('native contained launcher request write failed'));
      } else if (code !== 0) {
        finish(classifyNativeContainedLauncherFailure(
          code,
          signal,
          Buffer.concat(stderrChunks, stderrBytes),
        ));
      } else {
        finish(undefined, Buffer.concat(stdoutChunks, stdoutBytes));
      }
    });
    child.stdin.end(input.requestBytes);

    function terminate(reason: typeof termination): void {
      if (termination !== null) return;
      termination = reason;
      child.kill('SIGKILL');
    }

    function finish(error?: Error, output?: Buffer): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolvePromise(output ?? Buffer.alloc(0));
    }
  });
}

function localAbsoluteWindowsPath(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.includes('\0')
    || !win32.isAbsolute(value)
    || value.startsWith('\\\\')
    || !/^[A-Za-z]:[\\/]/.test(value)
    || value.slice(2).includes(':')
  ) {
    throw new Error(`${label} must be a local absolute Windows path`);
  }
  return value;
}

function boundedTimeout(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > MAX_TIMEOUT_MS) {
    throw new Error(`native contained timeout must be between 1 and ${MAX_TIMEOUT_MS} ms`);
  }
  return Number(value);
}

function boundedUnixTimestampMs(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function boundedByteLimit(value: unknown, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  if (Number(value) > maximum) {
    throw new Error(`${label} exceeds ${maximum} bytes`);
  }
  return Number(value);
}

function boundedArguments(
  values: readonly string[],
  maximumCount: number,
  maximumBytes: number,
  label: string,
): string[] {
  if (!Array.isArray(values) || values.length > maximumCount) {
    throw new Error(`${label} accepts at most ${maximumCount} arguments`);
  }
  let bytes = 0;
  return values.map((value, index) => {
    if (typeof value !== 'string' || value.includes('\0')) {
      throw new Error(`${label} argument ${index} is invalid`);
    }
    bytes += Buffer.byteLength(value, 'utf8');
    if (bytes > maximumBytes) {
      throw new Error(`${label} arguments exceed ${maximumBytes} bytes`);
    }
    return value;
  });
}

function minimalLauncherEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  return environment;
}
