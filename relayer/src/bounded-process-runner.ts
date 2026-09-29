import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOL_VERSION_TIMEOUT_MS = 10_000;
const PROCESS_TREE_TERMINATION_RETRY_MS = 1_000;
const POST_EXIT_CLOSE_TIMEOUT_MS = 1_000;
const DEFAULT_PROCESS_TREE_TERMINATION_GRACE_MS = 10_000;
const MAX_WINDOWS_PROCESS_TABLE_BYTES = 1024 * 1024;
const DESCENDANT_INSPECTION_PROBES = 20;
const DESCENDANT_INSPECTION_REQUIRED_EMPTY_PROBES = 2;
const DESCENDANT_INSPECTION_INTERVAL_MS = 250;
const WINDOWS_JOB_CANCELLATION_EXIT_CODE = 197;
const WINDOWS_JOB_TARGET_FAILURE_EXIT_CODE = 198;
const WINDOWS_JOB_CONTAINED_WRAPPER_FAILURE_EXIT_CODE = 199;
const WINDOWS_JOB_TARGET_TIMEOUT_EXIT_CODE = 200;
const WINDOWS_JOB_RUNNER_WATCHDOG_ALLOWANCE_MS = 45_000;
const MAX_NODE_TIMER_MS = 2_147_483_647;
const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const WINDOWS_JOB_PROCESS_RUNNER_PATH = resolve(
  MODULE_DIRECTORY,
  'scripts',
  'windows-job-process.ps1',
);
export interface BoundedProcessInput {
  executablePath: string;
  args: readonly string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  maxOutputBytes: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  terminationGraceMs?: number;
  label: string;
}

export interface BoundedProcessResult {
  pid: number;
  exitCode: 0;
  stdoutBytes: Buffer;
  stderrBytes: Buffer;
  stdout: string;
  stderr: string;
}

export class BoundedProcessExitError extends Error {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;

  constructor(input: Readonly<{
    label: string;
    exitCode: number;
    stdout: string;
    stderr: string;
  }>) {
    super(`${input.label} failed`);
    this.name = 'BoundedProcessExitError';
    this.exitCode = input.exitCode;
    this.stdout = input.stdout;
    this.stderr = input.stderr;
  }
}

interface BoundedProcessSpawnSpecification {
  executablePath: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export async function runBoundedNativeBuildProcess(
  input: BoundedProcessInput,
): Promise<void> {
  await runBoundedProcess(input);
}

export async function runBoundedProcess(
  input: BoundedProcessInput,
): Promise<BoundedProcessResult> {
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0) {
    throw new Error('bounded process timeout must be a positive safe integer');
  }
  const maxSupportedTimeoutMs = process.platform === 'win32'
    ? MAX_NODE_TIMER_MS - WINDOWS_JOB_RUNNER_WATCHDOG_ALLOWANCE_MS
    : MAX_NODE_TIMER_MS;
  if (input.timeoutMs > maxSupportedTimeoutMs) {
    throw new Error('bounded process timeout exceeds the supported timer range');
  }
  if (!Number.isSafeInteger(input.maxOutputBytes) || input.maxOutputBytes <= 0) {
    throw new Error('bounded process output limit must be a positive safe integer');
  }
  const maxStdoutBytes = input.maxStdoutBytes ?? input.maxOutputBytes;
  const maxStderrBytes = input.maxStderrBytes ?? input.maxOutputBytes;
  const terminationGraceMs = input.terminationGraceMs
    ?? DEFAULT_PROCESS_TREE_TERMINATION_GRACE_MS;
  for (const [label, value] of [
    ['stdout limit', maxStdoutBytes],
    ['stderr limit', maxStderrBytes],
    ['termination grace', terminationGraceMs],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`bounded process ${label} must be a positive safe integer`);
    }
  }

  return await new Promise<BoundedProcessResult>((resolvePromise, reject) => {
    let settled = false;
    let outputBytes = 0;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let completedExitCode = -1;
    let requestedFailure: Error | undefined;
    let terminationFailure: Error | undefined;
    let exitVerificationFailure: Error | undefined;
    let liveTreeTerminationConfirmed = false;
    let terminationRetry: NodeJS.Timeout | undefined;
    let terminationDeadline: NodeJS.Timeout | undefined;
    let postExitCloseTimer: NodeJS.Timeout | undefined;
    let terminationQuarantineHold: NodeJS.Timeout | undefined;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const spawnSpecification = buildBoundedProcessSpawnSpecification(input);
    const child = process.platform === 'win32'
      ? spawn(spawnSpecification.executablePath, spawnSpecification.args, {
          cwd: spawnSpecification.cwd,
          windowsHide: true,
          shell: false,
          detached: false,
          env: spawnSpecification.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
      : spawn(spawnSpecification.executablePath, spawnSpecification.args, {
          cwd: spawnSpecification.cwd,
          windowsHide: true,
          shell: false,
          detached: true,
          env: spawnSpecification.env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
    const watchdogTimeoutMs = process.platform === 'win32'
      ? input.timeoutMs + WINDOWS_JOB_RUNNER_WATCHDOG_ALLOWANCE_MS
      : input.timeoutMs;
    const timer = setTimeout(() => {
      requestTermination(new Error(`${input.label} timed out`));
    }, watchdogTimeoutMs);
    const consume = (
      chunks: Buffer[],
      channel: 'stdout' | 'stderr',
      channelLimit: number,
    ) => (chunk: Buffer): void => {
      const channelBytes = channel === 'stdout' ? stdoutBytes : stderrBytes;
      const remaining = Math.max(
        0,
        Math.min(input.maxOutputBytes - outputBytes, channelLimit - channelBytes),
      );
      if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
      outputBytes += chunk.length;
      if (channel === 'stdout') stdoutBytes += chunk.length;
      else stderrBytes += chunk.length;
      if (outputBytes > input.maxOutputBytes) {
        requestTermination(new Error(`${input.label} output exceeded the limit`));
      } else if (
        (channel === 'stdout' ? stdoutBytes : stderrBytes) > channelLimit
      ) {
        requestTermination(new Error(`${input.label} ${channel} exceeded the limit`));
      }
    };
    child.stdout.on('data', consume(stdoutChunks, 'stdout', maxStdoutBytes));
    child.stderr.on('data', consume(stderrChunks, 'stderr', maxStderrBytes));
    child.once('error', () => finish(new Error(`${input.label} failed to start`)));
    child.once('exit', code => {
      child.stdin?.destroy();
      if (
        process.platform === 'win32'
        && code === WINDOWS_JOB_TARGET_TIMEOUT_EXIT_CODE
        && !requestedFailure
      ) {
        requestedFailure = new Error(`${input.label} timed out`);
        clearTimeout(timer);
      }
      postExitCloseTimer = setTimeout(() => {
        postExitCloseTimer = undefined;
        stopTerminationRetry();
        holdCleanupAuthority();
      }, POST_EXIT_CLOSE_TIMEOUT_MS);
      if (process.platform === 'win32' && !requestedFailure) {
        exitVerificationFailure = confirmsWindowsJobContainment(code)
          ? undefined
          : new Error(
              'Windows Job Object runner did not confirm process-tree containment',
            );
        return;
      }
      if (process.platform === 'win32' && requestedFailure) {
        if (confirmsWindowsJobContainment(code)) {
          liveTreeTerminationConfirmed = true;
          terminationFailure = undefined;
          exitVerificationFailure = undefined;
          stopTerminationRetry();
        } else {
          exitVerificationFailure = new Error(
            'Windows Job Object runner did not confirm process-tree termination',
          );
        }
        return;
      }
      try {
        assertNoNativeBuildDescendants(child);
        exitVerificationFailure = undefined;
        if (requestedFailure) {
          // Stable absence after parent exit closes the race where an earlier
          // termination attempt reported failure after process exit already won.
          liveTreeTerminationConfirmed = true;
          terminationFailure = undefined;
          stopTerminationRetry();
        }
      } catch (error) {
        exitVerificationFailure = error instanceof Error
          ? error
          : new Error('native build descendant inspection failed');
      }
    });
    child.once('close', code => {
      completedExitCode = code ?? -1;
      if (postExitCloseTimer) {
        clearTimeout(postExitCloseTimer);
        postExitCloseTimer = undefined;
      }
      if (
        requestedFailure
        && process.platform === 'win32'
        && confirmsWindowsJobContainment(code)
      ) {
        liveTreeTerminationConfirmed = true;
        terminationFailure = undefined;
        exitVerificationFailure = undefined;
        stopTerminationRetry();
      }
      if (requestedFailure) {
        if (
          liveTreeTerminationConfirmed
          && !terminationFailure
          && !exitVerificationFailure
        ) {
          finish(requestedFailure);
        } else {
          stopTerminationRetry();
          holdCleanupAuthority();
        }
        return;
      }
      if (exitVerificationFailure) {
        stopTerminationRetry();
        holdCleanupAuthority();
        return;
      }
      if (code !== 0) {
        finish(new BoundedProcessExitError({
          label: input.label,
          exitCode: code ?? -1,
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
        }));
        return;
      }
      finish();
    });

    function requestTermination(error: Error): void {
      if (settled || requestedFailure) return;
      requestedFailure = error;
      clearTimeout(timer);
      attemptTermination();
      if (!liveTreeTerminationConfirmed) {
        terminationRetry = setInterval(() => {
          attemptTermination();
        }, PROCESS_TREE_TERMINATION_RETRY_MS);
      }
      terminationDeadline = setTimeout(() => {
        if (settled) return;
        terminationDeadline = undefined;
        holdCleanupAuthority();
      }, terminationGraceMs);
    }

    function attemptTermination(): void {
      try {
        if (process.platform === 'win32') {
          if (!child.stdin || child.stdin.destroyed || !child.stdin.writable) {
            throw new Error('Windows Job Object cancellation channel is unavailable');
          }
          if (!child.stdin.writableEnded) child.stdin.end();
          terminationFailure = undefined;
          return;
        }
        terminateNativeBuildProcessTree(child);
        liveTreeTerminationConfirmed = true;
        terminationFailure = undefined;
        if (terminationRetry) {
          clearInterval(terminationRetry);
          terminationRetry = undefined;
        }
      } catch (error) {
        terminationFailure = error instanceof Error
          ? error
          : new Error('native build process-tree termination failed');
      }
    }

    function stopTerminationRetry(): void {
      if (!terminationRetry) return;
      clearInterval(terminationRetry);
      terminationRetry = undefined;
    }

    function holdCleanupAuthority(): void {
      if (terminationQuarantineHold) return;
      // A pending Promise alone does not keep Node alive. Retain an explicit
      // handle so unverifiable process-tree termination fail-stops the host
      // instead of returning authority over its build/request directories.
      terminationQuarantineHold = setInterval(() => undefined, 60_000);
    }

    function finish(error?: Error): void {
      if (settled) return;
      clearTimeout(timer);
      stopTerminationRetry();
      if (terminationDeadline) clearTimeout(terminationDeadline);
      if (postExitCloseTimer) clearTimeout(postExitCloseTimer);
      if (terminationQuarantineHold) clearInterval(terminationQuarantineHold);
      if (error) {
        settled = true;
        reject(error);
        return;
      }
      if (!Number.isSafeInteger(child.pid) || !child.pid || completedExitCode !== 0) {
        settled = true;
        reject(new Error(`${input.label} did not expose a successful process identity`));
        return;
      }
      settled = true;
      const stdoutBuffer = Buffer.concat(stdoutChunks);
      const stderrBuffer = Buffer.concat(stderrChunks);
      resolvePromise({
        pid: child.pid,
        exitCode: 0,
        stdoutBytes: stdoutBuffer,
        stderrBytes: stderrBuffer,
        stdout: stdoutBuffer.toString('utf8'),
        stderr: stderrBuffer.toString('utf8'),
      });
    }
  });
}

function buildBoundedProcessSpawnSpecification(
  input: BoundedProcessInput,
): BoundedProcessSpawnSpecification {
  if (process.platform !== 'win32') {
    return {
      executablePath: input.executablePath,
      args: [...input.args],
      cwd: input.cwd,
      env: input.env,
    };
  }

  const systemRoot = input.env.SystemRoot ?? input.env.WINDIR;
  if (!systemRoot || !isAbsolute(systemRoot)) {
    throw new Error(`${input.label} Windows Job Object runner requires SystemRoot`);
  }
  if (!existsSync(WINDOWS_JOB_PROCESS_RUNNER_PATH)) {
    throw new Error(`${input.label} Windows Job Object runner is unavailable`);
  }
  const executablePath = requireProcessArgument(
    input.executablePath,
    `${input.label} executable path`,
  );
  const cwd = requireProcessArgument(input.cwd, `${input.label} working directory`);
  const args = input.args.map((arg, index) => requireProcessArgument(
    arg,
    `${input.label} argument ${index + 1}`,
  ));
  return {
    executablePath: resolve(
      systemRoot,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    ),
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      WINDOWS_JOB_PROCESS_RUNNER_PATH,
    ],
    cwd,
    env: {
      ...input.env,
      E2S_JOB_EXECUTABLE_B64: encodeWindowsJobValue(executablePath),
      E2S_JOB_ARGUMENTS_B64: encodeWindowsJobValue(JSON.stringify(args)),
      E2S_JOB_CWD_B64: encodeWindowsJobValue(cwd),
      E2S_JOB_TIMEOUT_MS_B64: encodeWindowsJobValue(String(input.timeoutMs)),
    },
  };
}

function requireProcessArgument(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new Error(`${label} must be a non-empty NUL-free string`);
  }
  return value;
}

function confirmsWindowsJobContainment(code: number | null): boolean {
  return code === 0
    || code === WINDOWS_JOB_CANCELLATION_EXIT_CODE
    || code === WINDOWS_JOB_TARGET_FAILURE_EXIT_CODE
    || code === WINDOWS_JOB_CONTAINED_WRAPPER_FAILURE_EXIT_CODE
    || code === WINDOWS_JOB_TARGET_TIMEOUT_EXIT_CODE;
}

function encodeWindowsJobValue(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

export function terminateNativeBuildProcessTree(
  child: ChildProcess,
): void {
  const pid = child.pid;
  if (!pid) throw new Error('native build parent PID is unavailable');
  if (child.exitCode !== null || child.signalCode !== null) {
    throw new Error('native build parent has already exited');
  }

  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (!systemRoot) {
      throw new Error('Windows process-tree termination is unavailable without SystemRoot');
    }
    if (terminateWindowsProcess(pid, systemRoot)) return;
    throw new Error('live Windows native build process-tree termination failed');
  }

  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    throw new Error('POSIX process-group termination could not be verified');
  }
}

// Once the parent exits, PID reuse makes descendant termination unsafe; inspect only.
export function assertNoNativeBuildDescendants(
  child: ChildProcess,
  options: {
    collectWindowsDescendants?: (rootPid: number, systemRoot: string) => number[];
  } = {},
): void {
  const pid = child.pid;
  if (!pid) throw new Error('native build parent PID is unavailable for descendant inspection');

  if (process.platform === 'win32') {
    const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
    if (!systemRoot) {
      throw new Error('cannot inspect native build descendants without SystemRoot');
    }
    const collectDescendants = options.collectWindowsDescendants
      ?? collectWindowsDescendantProcessIds;
    let descendants: number[] = [];
    let consecutiveEmptyProbes = 0;
    for (let probe = 0; probe < DESCENDANT_INSPECTION_PROBES; probe += 1) {
      try {
        descendants = collectDescendants(pid, systemRoot);
      } catch {
        throw new Error('cannot inspect native build descendants');
      }
      if (descendants.length === 0) consecutiveEmptyProbes += 1;
      else consecutiveEmptyProbes = 0;
      if (consecutiveEmptyProbes >= DESCENDANT_INSPECTION_REQUIRED_EMPTY_PROBES) return;
      if (probe + 1 < DESCENDANT_INSPECTION_PROBES) {
        sleepSynchronously(DESCENDANT_INSPECTION_INTERVAL_MS);
      }
    }
    throw new Error(
      descendants.length > 0
        ? 'native build descendants remain after the parent exited'
        : 'native build descendant absence could not be verified',
    );
  }

  try {
    process.kill(-pid, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
    throw new Error('cannot inspect native build process group');
  }
  throw new Error('native build process group remains after the parent exited');
}

function sleepSynchronously(milliseconds: number): void {
  const signal = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  Atomics.wait(signal, 0, 0, milliseconds);
}

function collectWindowsDescendantProcessIds(rootPid: number, systemRoot: string): number[] {
  const powershellPath = resolve(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  let output: string;
  try {
    output = execFileSync(powershellPath, [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "$ErrorActionPreference='Stop'; Get-CimInstance Win32_Process | " +
        "ForEach-Object { '{0},{1}' -f $_.ProcessId,$_.ParentProcessId }",
    ], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: TOOL_VERSION_TIMEOUT_MS,
      maxBuffer: MAX_WINDOWS_PROCESS_TABLE_BYTES,
      env: minimalToolEnvironment(),
    });
  } catch {
    throw new Error('Windows process-table snapshot failed');
  }

  const childrenByParent = new Map<number, number[]>();
  for (const line of output.split(/\r?\n/)) {
    const match = /^(\d+),(\d+)$/.exec(line.trim());
    if (!match) continue;
    const processId = Number(match[1]);
    const parentProcessId = Number(match[2]);
    if (!Number.isSafeInteger(processId) || processId <= 0) continue;
    if (!Number.isSafeInteger(parentProcessId) || parentProcessId <= 0) continue;
    const children = childrenByParent.get(parentProcessId) ?? [];
    children.push(processId);
    childrenByParent.set(parentProcessId, children);
  }

  const descendants: number[] = [];
  const seen = new Set<number>([rootPid]);
  const queue = [rootPid];
  while (queue.length > 0) {
    const parent = queue.shift()!;
    for (const childPid of childrenByParent.get(parent) ?? []) {
      if (seen.has(childPid)) continue;
      seen.add(childPid);
      descendants.push(childPid);
      queue.push(childPid);
    }
  }
  return descendants;
}

function terminateWindowsProcess(pid: number, systemRoot: string): boolean {
  try {
    execFileSync(resolve(systemRoot, 'System32', 'taskkill.exe'), [
      '/PID',
      String(pid),
      '/T',
      '/F',
    ], {
      windowsHide: true,
      timeout: TOOL_VERSION_TIMEOUT_MS,
      stdio: 'ignore',
      env: minimalToolEnvironment(),
    });
    return true;
  } catch {
    // A process may exit between the process-table snapshot and taskkill.
    return false;
  }
}

function minimalToolEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR']) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  return environment;
}
