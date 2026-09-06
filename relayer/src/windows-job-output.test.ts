import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runBoundedProcess } from './pinned-local-native-verifier-build.js';

const bridgeRoot = resolve(import.meta.dirname, '..', '..');
const environment = { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR };

describe('Windows direct process output', () => {
  it('binds each target output pipe directly to the collector process', async () => {
    if (process.platform !== 'win32') return;
    const source = `
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class OutputPipeOrigin
{
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GetStdHandle(int identifier);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetNamedPipeServerProcessId(IntPtr pipe, out uint processId);
    public static string Inspect()
    {
        uint outputOwner;
        uint errorOwner;
        if (!GetNamedPipeServerProcessId(GetStdHandle(-11), out outputOwner)
            || !GetNamedPipeServerProcessId(GetStdHandle(-12), out errorOwner))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        return outputOwner + "," + errorOwner;
    }
}
`;
    const command = [
      "$ErrorActionPreference = 'Stop';",
      "$ProgressPreference = 'SilentlyContinue';",
      `Add-Type -TypeDefinition ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(source).toString('base64')}')));`,
      '[OutputPipeOrigin]::Inspect()',
    ].join(' ');
    const result = await runBoundedProcess({
      executablePath: resolve(process.env.SystemRoot!, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')],
      cwd: bridgeRoot,
      env: environment,
      timeoutMs: 10_000,
      maxOutputBytes: 8_192,
      label: 'target output pipe origin',
    });
    expect(result.stderr).toBe('');
    expect(result.stdout.trim().split(',').map(Number)).toEqual([process.pid, process.pid]);
    expect(result.pid).not.toBe(process.pid);
  }, 30_000);

  it('preserves both large binary channels without consuming cancellation input', async () => {
    const size = 2 * 1024 * 1024 + 37;
    const producer = [
      "const fs = require('fs');",
      "if (fs.readSync(0, Buffer.alloc(1), 0, 1, null) !== 0) throw new Error('target stdin is not EOF');",
      `const a = Buffer.alloc(${size}), b = Buffer.alloc(${size});`,
      'for (let i = 0; i < a.length; i++) { a[i] = i % 251; b[i] = (i * 31) % 256; }',
      'for (let offset = 0; offset < a.length; offset += 131072) {',
      '  for (const [fd, bytes] of [[1, a], [2, b]]) {',
      '    let position = offset; const end = Math.min(offset + 131072, bytes.length);',
      '    while (position < end) {',
      '      const n = fs.writeSync(fd, bytes, position, end - position);',
      "      if (n <= 0) throw new Error('producer made no progress');",
      '      position += n;',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const expectedOut = Buffer.alloc(size);
    const expectedError = Buffer.alloc(size);
    for (let index = 0; index < size; index += 1) {
      expectedOut[index] = index % 251;
      expectedError[index] = (index * 31) % 256;
    }
    const result = await runBoundedProcess({
      executablePath: process.execPath,
      args: ['-e', producer],
      cwd: bridgeRoot,
      env: environment,
      timeoutMs: 5_000,
      maxOutputBytes: 2 * size,
      label: 'exact simultaneous output',
    });
    for (const [actual, expected] of [[result.stdoutBytes, expectedOut], [result.stderrBytes, expectedError]]) {
      expect(actual!.length).toBe(size);
      expect(createHash('sha256').update(actual!).digest('hex'))
        .toBe(createHash('sha256').update(expected!).digest('hex'));
    }
  }, 20_000);

  it('rejects unavailable handles and owns only the inheritable duplicates', async () => {
    if (process.platform !== 'win32') return;
    const runner = readFileSync(resolve(import.meta.dirname, 'scripts/windows-job-process.ps1'), 'utf8');
    const source = runner.split("$jobRunnerSource = @'\n")[1]?.split("\n'@\n")[0];
    expect(source).toBeDefined();
    const harness = `
public static class OutputHandleMatrix
{
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GetStdHandle(int id);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetStdHandle(int id, IntPtr value);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr value);
    public static string Run()
    {
        var method = typeof(E2SWindowsJobProcess).GetMethod("DuplicateStandardOutput",
            System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.NonPublic);
        string result = "";
        foreach (int channel in new int[] { -11, -12 })
        {
            IntPtr original = GetStdHandle(channel);
            IntPtr duplicate = (IntPtr) method.Invoke(null, new object[] { channel });
            if (duplicate == original || duplicate == IntPtr.Zero || duplicate == new IntPtr(-1))
                throw new Exception("output not independently owned");
            if (!CloseHandle(duplicate) || GetStdHandle(channel) != original)
                throw new Exception("borrowed output changed");
            foreach (IntPtr invalid in new IntPtr[] { IntPtr.Zero, new IntPtr(-1), new IntPtr(1) })
            {
                bool rejected = false;
                try
                {
                    if (!SetStdHandle(channel, invalid)) throw new Exception("fixture setup failed");
                    try { method.Invoke(null, new object[] { channel }); }
                    catch (System.Reflection.TargetInvocationException error)
                    {
                        if (error.InnerException is IOException || error.InnerException is Win32Exception)
                            rejected = true;
                        else throw;
                    }
                }
                finally
                {
                    if (!SetStdHandle(channel, original)) throw new Exception("fixture restore failed");
                }
                if (!rejected) throw new Exception("invalid output accepted");
            }
            result += channel + ":owned-and-invalid-rejected;";
        }
        return result;
    }
}
`;
    const temporary = mkdtempSync(join(tmpdir(), 'e2s-output-handle-'));
    const scriptPath = join(temporary, 'matrix.ps1');
    const bytes = Buffer.from(`${source}\n${harness}`).toString('base64');
    writeFileSync(scriptPath, [
      "$ErrorActionPreference = 'Stop';",
      `Add-Type -TypeDefinition ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${bytes}')));`,
      '[OutputHandleMatrix]::Run()',
    ].join('\n'), { flag: 'wx' });
    try {
      const result = await runBoundedProcess({
        executablePath: resolve(process.env.SystemRoot!, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
        args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', scriptPath],
        cwd: bridgeRoot,
        env: environment,
        timeoutMs: 10_000,
        maxOutputBytes: 8_192,
        label: 'output handle matrix',
      });
      expect(result.stderr).toBe('');
      expect(result.stdout.trim()).toBe('-11:owned-and-invalid-rejected;-12:owned-and-invalid-rejected;');
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }, 30_000);
});
