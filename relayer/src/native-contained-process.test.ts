import { createHash } from 'crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildNativeContainedLauncherInvocation,
  classifyNativeContainedLauncherFailure,
  executeNativeContainedLauncherTransport,
  nativeContainedLauncherOuterDeadlineMs,
  normalizeImmutableNativeContainedLauncherPath,
  runNativeContainedProcess,
} from './native-contained-process.js';

const HASH_A = `0x${'ab'.repeat(32)}`;
const POLICY_NOT_BEFORE_UNIX_MS = Date.parse('2026-07-12T12:00:00.000Z');
const POLICY_EXPIRES_AT_UNIX_MS = Date.parse('2026-07-13T12:00:00.000Z');
const tempDirectories: string[] = [];

function windowsTestPath(drive: string, ...segments: string[]): string {
  const separator = String.fromCharCode(92);
  return `${drive}:${separator}${segments.join(separator)}`;
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('native contained process adapter', () => {
  it('builds one exact broker invocation without issuing security claims', () => {
    const invocation = buildNativeContainedLauncherInvocation({
      launcherPath: 'C:\\trusted\\bridge-contained-launcher.exe',
      targetPath: 'C:\\artifacts\\bridge-checkpoint-verifier.exe',
      targetSha256Hex: HASH_A,
      targetArgs: ['--fixture', 'value with spaces', 'quote"and\\slash'],
      policyNotBeforeUnixMs: POLICY_NOT_BEFORE_UNIX_MS,
      policyExpiresAtUnixMs: POLICY_EXPIRES_AT_UNIX_MS,
      timeoutMs: 20_000,
      requestLimitBytes: 32 * 1024 * 1024,
      stdoutLimitBytes: 16 * 1024 * 1024,
      stderrLimitBytes: 64 * 1024,
    });

    expect(invocation).toEqual({
      executablePath: 'C:\\trusted\\bridge-contained-launcher.exe',
      args: [
        '--target',
        'C:\\artifacts\\bridge-checkpoint-verifier.exe',
        '--sha256',
        HASH_A,
        '--not-before-unix-ms',
        String(POLICY_NOT_BEFORE_UNIX_MS),
        '--expires-at-unix-ms',
        String(POLICY_EXPIRES_AT_UNIX_MS),
        '--timeout-ms',
        '20000',
        '--request-limit',
        String(32 * 1024 * 1024),
        '--stdout-limit',
        String(16 * 1024 * 1024),
        '--stderr-limit',
        String(64 * 1024),
        '--',
        '--fixture',
        'value with spaces',
        'quote"and\\slash',
      ],
    });
    expect(Object.isFrozen(invocation)).toBe(true);
    expect(Object.isFrozen(invocation.args)).toBe(true);
    expect(invocation).not.toHaveProperty('boundary');
  });

  it('binds authoritative launches to one epoch floor and exact DLL allowlist', () => {
    const invocation = buildNativeContainedLauncherInvocation({
      launcherPath: 'C:\\trusted\\bridge-contained-launcher.exe',
      targetPath: 'C:\\artifacts\\bridge-checkpoint-verifier.exe',
      targetSha256Hex: HASH_A,
      targetArgs: ['--trusted-anchor-digest', HASH_A],
      policyNotBeforeUnixMs: POLICY_NOT_BEFORE_UNIX_MS,
      policyExpiresAtUnixMs: POLICY_EXPIRES_AT_UNIX_MS,
      timeoutMs: 20_000,
      requestLimitBytes: 32 * 1024 * 1024,
      stdoutLimitBytes: 16 * 1024 * 1024,
      stderrLimitBytes: 64 * 1024,
      authority: {
        profileDigestHex: `0x${'11'.repeat(32)}`,
        policyDigestHex: `0x${'22'.repeat(32)}`,
        policyEpoch: 7,
        recordVersion: 'v2',
        allowedSystemDlls: ['advapi32.dll', 'kernel32.dll'],
      },
    });

    expect(invocation.args).toEqual(expect.arrayContaining([
      '--authority-profile-digest',
      '11'.repeat(32),
      '--authority-policy-digest',
      '22'.repeat(32),
      '--authority-policy-epoch',
      '7',
      '--authority-record-version',
      'v2',
      '--allowed-system-dll',
      'advapi32.dll',
      '--allowed-system-dll',
      'kernel32.dll',
    ]));
    expect(invocation.args.indexOf('--authority-profile-digest'))
      .toBeLessThan(invocation.args.indexOf('--'));
  });

  it('accepts only a canonical launcher-digest-addressed v2 path suffix', () => {
    const digest = `0x${'ab'.repeat(32)}`;
    const path = windowsTestPath(
      'D',
      'Relocated Programs',
      'E2SBridge',
      'NativeExecution',
      'v2',
      'Images',
      digest.slice(2),
      'bridge-contained-launcher.exe',
    );
    expect(normalizeImmutableNativeContainedLauncherPath(path, digest))
      .toBe(path);
    expect(() =>
      normalizeImmutableNativeContainedLauncherPath(
        windowsTestPath(
          'C',
          'Program Files',
          'E2SBridge',
          'NativeExecution',
          'v1',
          'bridge-contained-launcher.exe',
        ),
        digest,
      ),
    ).toThrow(/digest-addressed v2 installation suffix/i);
    expect(() =>
      normalizeImmutableNativeContainedLauncherPath(
        windowsTestPath(
          'C',
          'Program Files',
          'E2SBridge',
          'NativeExecution',
          'v2',
          'Images',
          'cd'.repeat(32),
          'bridge-contained-launcher.exe',
        ),
        digest,
      ),
    ).toThrow(/digest-addressed v2 installation suffix/i);
    expect(() =>
      normalizeImmutableNativeContainedLauncherPath(
        windowsTestPath(
          'C',
          'Program Files',
          '..',
          'Program Files',
          'E2SBridge',
          'NativeExecution',
          'v2',
          'Images',
          digest.slice(2),
          'bridge-contained-launcher.exe',
        ),
        digest,
      ),
    ).toThrow(/digest-addressed v2 installation suffix/i);
  });

  it.each([
    [[], /allowlist must be non-empty/],
    [['Kernel32.dll'], /system DLL 0 is invalid/],
    [['kernel32.dll', 'advapi32.dll'], /sorted and unique/],
    [['kernel32.dll', 'kernel32.dll'], /sorted and unique/],
  ])('rejects unsafe authoritative DLL allowlists', (allowedSystemDlls, error) => {
    expect(() => buildNativeContainedLauncherInvocation({
      launcherPath: 'C:\\trusted\\bridge-contained-launcher.exe',
      targetPath: 'C:\\artifacts\\bridge-checkpoint-verifier.exe',
      targetSha256Hex: HASH_A,
      targetArgs: [],
      policyNotBeforeUnixMs: POLICY_NOT_BEFORE_UNIX_MS,
      policyExpiresAtUnixMs: POLICY_EXPIRES_AT_UNIX_MS,
      timeoutMs: 1_000,
      requestLimitBytes: 1_024,
      stdoutLimitBytes: 1_024,
      stderrLimitBytes: 1_024,
      authority: {
        profileDigestHex: `0x${'11'.repeat(32)}`,
        policyDigestHex: `0x${'22'.repeat(32)}`,
        policyEpoch: 1,
        allowedSystemDlls,
      },
    })).toThrow(error);
  });

  it.each([
    ['relative launcher', '.\\launcher.exe', 'C:\\artifacts\\target.exe'],
    ['UNC launcher', '\\\\server\\share\\launcher.exe', 'C:\\artifacts\\target.exe'],
    ['device launcher', '\\\\?\\C:\\trusted\\launcher.exe', 'C:\\artifacts\\target.exe'],
    ['relative target', 'C:\\trusted\\launcher.exe', '.\\target.exe'],
    ['UNC target', 'C:\\trusted\\launcher.exe', '\\\\server\\share\\target.exe'],
    ['device target', 'C:\\trusted\\launcher.exe', '\\\\?\\C:\\artifacts\\target.exe'],
    ['ADS target', 'C:\\trusted\\launcher.exe', 'C:\\artifacts\\target.exe:payload'],
  ])('rejects %s paths before invoking the broker', (_label, launcherPath, targetPath) => {
    expect(() => buildNativeContainedLauncherInvocation({
      launcherPath,
      targetPath,
      targetSha256Hex: HASH_A,
      targetArgs: [],
      policyNotBeforeUnixMs: POLICY_NOT_BEFORE_UNIX_MS,
      policyExpiresAtUnixMs: POLICY_EXPIRES_AT_UNIX_MS,
      timeoutMs: 1_000,
      requestLimitBytes: 1_024,
      stdoutLimitBytes: 1_024,
      stderrLimitBytes: 1_024,
    })).toThrow(/local absolute Windows path/);
  });

  it('rejects unsafe limits and argument payloads before invoking the broker', () => {
    const base = {
      launcherPath: 'C:\\trusted\\launcher.exe',
      targetPath: 'C:\\artifacts\\target.exe',
      targetSha256Hex: HASH_A,
      targetArgs: [] as string[],
      policyNotBeforeUnixMs: POLICY_NOT_BEFORE_UNIX_MS,
      policyExpiresAtUnixMs: POLICY_EXPIRES_AT_UNIX_MS,
      timeoutMs: 1_000,
      requestLimitBytes: 1_024,
      stdoutLimitBytes: 1_024,
      stderrLimitBytes: 1_024,
    };
    expect(() => buildNativeContainedLauncherInvocation({
      ...base,
      timeoutMs: 300_001,
    })).toThrow('native contained timeout must be between 1 and 300000 ms');
    expect(() => buildNativeContainedLauncherInvocation({
      ...base,
      requestLimitBytes: 0,
    })).toThrow('native contained request limit must be a positive safe integer');
    expect(() => buildNativeContainedLauncherInvocation({
      ...base,
      policyExpiresAtUnixMs: POLICY_NOT_BEFORE_UNIX_MS,
    })).toThrow(/policy window.*before expiry/);
    expect(() => buildNativeContainedLauncherInvocation({
      ...base,
      targetArgs: ['unsafe\0argument'],
    })).toThrow('native contained target argument 0 is invalid');
    expect(() => buildNativeContainedLauncherInvocation({
      ...base,
      targetArgs: Array.from({ length: 65 }, () => 'arg'),
    })).toThrow('native contained target accepts at most 64 arguments');
    expect(() => buildNativeContainedLauncherInvocation({
      ...base,
      authority: {
        profileDigestHex: `0x${'11'.repeat(32)}`,
        policyDigestHex: `0x${'22'.repeat(32)}`,
        policyEpoch: 1,
        allowedSystemDlls: Array.from(
          { length: 129 },
          (_, index) => `library-${index.toString().padStart(3, '0')}.dll`,
        ),
      },
    })).toThrow(/allowlist exceeds 128 entries/);
    expect(nativeContainedLauncherOuterDeadlineMs(5_000)).toBe(605_000);
    expect(nativeContainedLauncherOuterDeadlineMs(300_000)).toBe(900_000);
  });

  it.each([
    [20, 'native contained target validation failed'],
    [21, 'native contained target failed to start'],
    [22, 'native contained target timed out'],
    [23, 'native contained target stdout exceeded the limit'],
    [24, 'native contained target stderr exceeded the limit'],
    [25, 'native contained target rejected the request'],
    [26, 'native contained target process containment failed'],
    [27, 'native contained execution policy is outside its reviewed validity window'],
    [28, 'native contained authority policy validation failed'],
    [99, 'native contained launcher failed'],
  ])('maps broker exit code %i without reflecting stderr', (exitCode, expected) => {
    const marker = Buffer.from('private child stderr must not escape');
    const error = classifyNativeContainedLauncherFailure(exitCode, null, marker);
    expect(error.message).toBe(expected);
    expect(error.message).not.toContain(marker.toString('utf8'));
  });

  it('transports exact bytes through a harmless process without issuing security claims', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'e2s-contained-adapter-'));
    tempDirectories.push(directory);
    const launcherPath = resolve(directory, 'fixture-launcher.js');
    writeFileSync(launcherPath, [
      "const chunks = [];",
      "process.stdin.on('data', chunk => chunks.push(chunk));",
      "process.stdin.on('end', () => process.stdout.write(Buffer.concat(chunks)));",
    ].join('\n'));
    const request = Buffer.from('bounded request bytes');

    const stdout = await executeNativeContainedLauncherTransport({
      executablePath: process.execPath,
      args: [launcherPath],
      timeoutMs: 5_000,
      stdoutLimitBytes: 1_024,
      stderrLimitBytes: 1_024,
      requestBytes: request,
    });

    expect(stdout).toEqual(request);
  });

  it('refuses oversized requests before starting the launcher', async () => {
    await expect(runNativeContainedProcess({
      launcherPath: process.execPath,
      launcherSha256Hex: sha256File(process.execPath),
      targetPath: resolve(tmpdir(), 'target.exe'),
      targetSha256Hex: HASH_A,
      targetArgs: [],
      policyNotBeforeUnixMs: POLICY_NOT_BEFORE_UNIX_MS,
      policyExpiresAtUnixMs: POLICY_EXPIRES_AT_UNIX_MS,
      timeoutMs: 5_000,
      requestLimitBytes: 3,
      stdoutLimitBytes: 1_024,
      stderrLimitBytes: 1_024,
      requestBytes: Buffer.from('four'),
    })).rejects.toThrow('native contained request exceeds 3 bytes');
  });

  it('does not reflect broker stderr when a contained target is rejected', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'e2s-contained-error-'));
    tempDirectories.push(directory);
    const launcherPath = resolve(directory, 'fixture-launcher.js');
    writeFileSync(launcherPath, [
      "process.stderr.write('private child diagnostic');",
      'process.exit(25);',
    ].join('\n'));

    await expect(executeNativeContainedLauncherTransport({
      executablePath: process.execPath,
      args: [launcherPath],
      timeoutMs: 5_000,
      stdoutLimitBytes: 1_024,
      stderrLimitBytes: 1_024,
      requestBytes: Buffer.from('request'),
    })).rejects.toThrow('native contained target rejected the request');

    try {
      await executeNativeContainedLauncherTransport({
        executablePath: process.execPath,
        args: [launcherPath],
        timeoutMs: 5_000,
        stdoutLimitBytes: 1_024,
        stderrLimitBytes: 1_024,
        requestBytes: Buffer.from('request'),
      });
      throw new Error('expected native contained broker rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain('private child diagnostic');
    }
  });
});

function sha256File(path: string): string {
  return `0x${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}
