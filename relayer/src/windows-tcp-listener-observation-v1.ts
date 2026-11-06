import { spawnSync } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { isIP } from 'node:net';
import { isAbsolute, resolve } from 'node:path';
import { types } from 'node:util';

const MAX_OUTPUT_BYTES = 256 * 1024;
const TCP_STATES = new Set([
  'CLOSED', 'CLOSE_WAIT', 'CLOSING', 'DELETE_TCB', 'ESTABLISHED',
  'FIN_WAIT_1', 'FIN_WAIT_2', 'LAST_ACK', 'LISTENING', 'SYN_RECEIVED',
  'SYN_SENT', 'TIME_WAIT',
]);

export interface WindowsTcpListenerObservationV1 {
  readonly pid: number;
  readonly localAddress: string;
  readonly localPort: number;
}

/** Fresh selected-port observations only; the caller owns process identity checks. */
export function observeWindowsTcpListenersV1(
  ports: readonly number[],
): readonly Readonly<WindowsTcpListenerObservationV1>[] {
  const selectedPorts = validatedPorts(ports);
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  if (!systemRoot || !isAbsolute(systemRoot) || systemRoot.includes('\0')) {
    throw new Error('Windows SystemRoot is unavailable for listener ownership');
  }
  const path = resolve(systemRoot, 'System32', 'netstat.exe');
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('Windows netstat executable must be one regular file');
  }
  const environment: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  const result = spawnSync(realpathSync(path), ['-a', '-n', '-o'], {
    cwd: resolve(systemRoot), env: environment, encoding: 'utf8',
    timeout: 30_000, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true,
  });
  if (
    result.error || result.signal !== null || result.status !== 0
    || typeof result.stderr !== 'string'
    || Buffer.byteLength(result.stderr, 'utf8') > MAX_OUTPUT_BYTES
    || result.stderr.trim() !== ''
  ) {
    throw new Error('Windows listener ownership inspection failed');
  }
  return parseWindowsTcpListenerObservationV1(result.stdout, selectedPorts);
}

/** Validate all rows before selecting ports; never filter by an expected PID. */
export function parseWindowsTcpListenerObservationV1(
  stdout: string,
  ports: readonly number[],
): readonly Readonly<WindowsTcpListenerObservationV1>[] {
  const selectedPorts = new Set(validatedPorts(ports));
  if (
    typeof stdout !== 'string' || Buffer.byteLength(stdout, 'utf8') === 0
    || Buffer.byteLength(stdout, 'utf8') > MAX_OUTPUT_BYTES
  ) {
    throw new Error('Windows netstat output is invalid');
  }
  const listeners: WindowsTcpListenerObservationV1[] = [];
  let dataStarted = false;
  let preambleSeen = false;
  let headerSeen = false;
  for (const rawLine of stdout.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line === '') continue;
    const fields = line.split(/\s+/u);
    const protocol = fields[0]?.toUpperCase();
    if (protocol !== 'TCP' && protocol !== 'UDP') {
      if (dataStarted) throw new Error('Windows netstat row is unknown or malformed');
      if (!preambleSeen) {
        if (!/^(?:Active Connections|Connexions actives)$/iu.test(line)) {
          throw new Error('Windows netstat caption is unknown');
        }
        preambleSeen = true;
      } else if (!headerSeen) {
        // Verified French OEM output may omit PID and decode its accent as U+FFFD.
        // Every data row still requires an explicit, strictly parsed PID.
        if (
          !/^Proto\s+Local Address\s+Foreign Address\s+State(?:\s+PID)?$/iu.test(line)
          && !/^Proto\s+Adresse locale\s+Adresse distante\s+(?:É|\uFFFD)tat(?:\s+PID)?$/iu.test(line)
        ) {
          throw new Error('Windows netstat header is malformed');
        }
        headerSeen = true;
      } else {
        throw new Error('Windows netstat header is duplicated');
      }
      continue;
    }
    if (!headerSeen) throw new Error('Windows netstat header is missing');
    dataStarted = true;
    if (fields.length !== (protocol === 'TCP' ? 5 : 4)) {
      throw new Error('Windows netstat row is truncated');
    }
    const local = parseEndpoint(fields[1]!, false);
    const foreign = parseEndpoint(fields[2]!, true);
    if (protocol === 'TCP' && foreign.address === '*') {
      throw new Error('Windows netstat TCP foreign endpoint is malformed');
    }
    const pidText = protocol === 'TCP' ? fields[4]! : fields[3]!;
    if (!/^\d+$/u.test(pidText)) throw new Error('Windows netstat owning PID is malformed');
    const pid = Number(pidText);
    if (!Number.isSafeInteger(pid) || pid < 0 || pid > 0xffff_ffff) {
      throw new Error('Windows netstat owning PID is malformed');
    }
    if (protocol === 'TCP') {
      const state = fields[3]!.toUpperCase();
      if (!TCP_STATES.has(state)) throw new Error('Windows netstat TCP state is unknown');
      if (state === 'LISTENING' && selectedPorts.has(local.port)) {
        if (pid === 0) throw new Error('Windows netstat selected listener owning PID is malformed');
        listeners.push(Object.freeze({ pid, localAddress: local.address, localPort: local.port }));
      }
    }
  }
  if (!preambleSeen || !headerSeen) throw new Error('Windows netstat header is missing');
  return Object.freeze(listeners);
}

function parseEndpoint(value: string, foreign: boolean): Readonly<{ address: string; port: number }> {
  let address: string;
  let portText: string;
  if (value.startsWith('[')) {
    const match = /^\[([^\]]+)\]:(\*|\d+)$/u.exec(value);
    if (!match) throw new Error('Windows netstat endpoint is malformed');
    address = match[1]!;
    portText = match[2]!;
    if (isIP(address) !== 6) throw new Error('Windows netstat IPv6 endpoint is malformed');
  } else {
    const separator = value.lastIndexOf(':');
    if (separator <= 0) throw new Error('Windows netstat endpoint is malformed');
    address = value.slice(0, separator);
    portText = value.slice(separator + 1);
    if (address !== '*' && isIP(address) !== 4) throw new Error('Windows netstat address is malformed');
  }
  if (address === '*' || portText === '*') {
    if (!foreign || address !== '*' || portText !== '*') {
      throw new Error('Windows netstat wildcard endpoint is malformed');
    }
    return Object.freeze({ address, port: -1 });
  }
  if (!/^\d+$/u.test(portText)) throw new Error('Windows netstat port is malformed');
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < (foreign ? 0 : 1) || port > 65_535) {
    throw new Error('Windows netstat port is malformed');
  }
  return Object.freeze({ address, port });
}

function validatedPorts(value: readonly number[]): number[] {
  if (types.isProxy(value) || !Array.isArray(value)) {
    throw new Error('Windows listener ports are invalid');
  }
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value as unknown;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 1 || length > 65_535) {
    throw new Error('Windows listener ports are invalid');
  }
  const ports: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    const port = descriptor?.value as unknown;
    if (
      !descriptor || !('value' in descriptor) || typeof port !== 'number'
      || !Number.isSafeInteger(port) || port < 1 || port > 65_535
    ) {
      throw new Error('Windows listener ports are invalid');
    }
    ports.push(port);
  }
  return ports;
}
