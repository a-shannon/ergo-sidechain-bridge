import { isAbsolute } from 'node:path';

import {
  BoundedProcessExitError,
  runBoundedProcess,
} from '../pinned-local-native-verifier-build.js';

const REQUEST_ENVIRONMENT_KEY = 'E2S_NATIVE_TRACKER_MEMPOOL_PROCESS_REQUEST_B64';
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_ARGUMENTS = 64;
const MAX_TIMEOUT_MS = 30 * 60_000;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_TERMINATION_GRACE_MS = 60_000;

interface NativeTrackerMempoolProcessRequest {
  readonly executablePath: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly terminationGraceMs: number;
}

function parseRequest(): NativeTrackerMempoolProcessRequest {
  if (process.argv.length !== 2) {
    throw new Error('native tracker mempool process does not accept arguments');
  }
  const encoded = process.env[REQUEST_ENVIRONMENT_KEY];
  if (
    !encoded
    || encoded.length > Math.ceil(MAX_REQUEST_BYTES / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)
  ) {
    throw new Error('native tracker mempool process request is not canonical base64');
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_REQUEST_BYTES || bytes.toString('base64') !== encoded) {
    throw new Error('native tracker mempool process request exceeds its byte contract');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error('native tracker mempool process request is not strict UTF-8 JSON');
  }
  if (!isRecord(parsed)) {
    throw new Error('native tracker mempool process request must be an object');
  }
  const expectedKeys = [
    'args',
    'cwd',
    'executablePath',
    'maxOutputBytes',
    'terminationGraceMs',
    'timeoutMs',
  ];
  if (Object.keys(parsed).sort().join('\0') !== expectedKeys.join('\0')) {
    throw new Error('native tracker mempool process request fields do not match the contract');
  }
  const executablePath = requireAbsoluteString(parsed.executablePath, 'executable path');
  const cwd = requireAbsoluteString(parsed.cwd, 'working directory');
  if (
    !Array.isArray(parsed.args)
    || parsed.args.length === 0
    || parsed.args.length > MAX_ARGUMENTS
    || !parsed.args.every(argument => typeof argument === 'string' && argument.length > 0 && !argument.includes('\0'))
  ) {
    throw new Error('native tracker mempool process arguments do not match the contract');
  }
  return {
    executablePath,
    args: parsed.args,
    cwd,
    timeoutMs: requireBoundedInteger(parsed.timeoutMs, MAX_TIMEOUT_MS, 'timeout'),
    maxOutputBytes: requireBoundedInteger(parsed.maxOutputBytes, MAX_OUTPUT_BYTES, 'output limit'),
    terminationGraceMs: requireBoundedInteger(
      parsed.terminationGraceMs,
      MAX_TERMINATION_GRACE_MS,
      'termination grace',
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireAbsoluteString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !isAbsolute(value) || value.includes('\0')) {
    throw new Error(`native tracker mempool process ${label} must be absolute and NUL-free`);
  }
  return value;
}

function requireBoundedInteger(value: unknown, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0 || (value as number) > maximum) {
    throw new Error(`native tracker mempool process ${label} is outside its bound`);
  }
  return value as number;
}

async function main(): Promise<void> {
  const request = parseRequest();
  const childEnvironment = { ...process.env };
  delete childEnvironment[REQUEST_ENVIRONMENT_KEY];
  const result = await runBoundedProcess({
    ...request,
    env: childEnvironment,
    label: 'pinned native tracker mempool JVM',
  });
  if (result.stdoutBytes.length > 0) process.stdout.write(result.stdoutBytes);
  if (result.stderrBytes.length > 0) process.stderr.write(result.stderrBytes);
}

void main().catch((error: unknown) => {
  if (error instanceof BoundedProcessExitError) {
    if (error.stdout.length > 0) process.stdout.write(error.stdout);
    if (error.stderr.length > 0) process.stderr.write(error.stderr);
    process.stderr.write(`pinned native tracker mempool JVM failed with exit code ${error.exitCode}\n`);
  } else {
    process.stderr.write(`${error instanceof Error ? error.message : 'native tracker mempool process failed'}\n`);
  }
  process.exitCode = 1;
});
