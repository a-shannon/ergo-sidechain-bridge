import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoundedProcessInput, BoundedProcessResult } from './bounded-process-runner.js';
import { prepareWindowsCSharpFixture } from './windows-csharp-fixture.test-helper.js';

const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('./bounded-process-runner.js', () => ({ runBoundedProcess: mocks.run }));

let directory: string;
let compilerPath: string;
const result: BoundedProcessResult = {
  pid: 123, exitCode: 0, stdout: '', stderr: '', stdoutBytes: Buffer.alloc(0), stderrBytes: Buffer.alloc(0),
};
const assembly = Buffer.from('MZsynthetic-boundary-fixture');
const source = 'public class Fixture {}';
function input() {
  return { source, directory, cwd: directory, env: { SystemRoot: directory } };
}
function produce(input: BoundedProcessInput) {
  writeFileSync(input.args[3].slice('/out:'.length), assembly, { flag: 'wx' });
  return Promise.resolve(result);
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "e2s-csharp-'fixture-"));
  compilerPath = resolve(directory, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
  mkdirSync(dirname(compilerPath), { recursive: true });
  writeFileSync(compilerPath, 'synthetic compiler identity', { flag: 'wx' });
  mocks.run.mockReset().mockImplementation(produce);
});
afterEach(() => { rmSync(directory, { recursive: true, force: true }); });

describe('fresh Windows C# fixture preparation boundaries', () => {
  it('binds only the selected source, compiler and output before loading', async () => {
    const fixture = await prepareWindowsCSharpFixture(input());
    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect(mocks.run.mock.calls[0][0]).toEqual({
      executablePath: compilerPath,
      args: ['/nologo', '/target:library', '/platform:anycpu', `/out:${join(directory, 'fixture.dll')}`, join(directory, 'fixture.cs')],
      cwd: directory, env: { SystemRoot: directory }, timeoutMs: 10_000,
      maxOutputBytes: 8_192, label: 'fresh C# output fixture compilation',
    });
    expect(readFileSync(join(directory, 'fixture.cs'), 'utf8')).toBe(source);
    expect(fixture.loadCommand()).toBe(`Add-Type -Path '${join(directory, 'fixture.dll').replace(/'/g, "''")}';`);
  });

  it('rejects an absent compiler before invoking a process', async () => {
    rmSync(compilerPath);
    await expect(prepareWindowsCSharpFixture(input())).rejects.toThrow();
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('binds an installed compiler with servicing hardlinks', async () => {
    linkSync(compilerPath, join(directory, 'compiler-alias.exe'));
    const fixture = await prepareWindowsCSharpFixture(input());
    expect(fixture.loadCommand()).toContain('fixture.dll');
    expect(mocks.run).toHaveBeenCalledTimes(1);
  });

  it('binds the default compiler configuration when present', async () => {
    const path = join(dirname(compilerPath), 'csc.rsp');
    writeFileSync(path, '/r:System.dll', { flag: 'wx' });
    const fixture = await prepareWindowsCSharpFixture(input());
    expect(fixture.loadCommand()).toContain('fixture.dll');
    expect(readFileSync(path, 'utf8')).toBe('/r:System.dll');
  });

  it.each(['created', 'changed', 'removed'])('rejects a configuration %s during compilation', async mutation => {
    const path = join(dirname(compilerPath), 'csc.rsp');
    if (mutation !== 'created') writeFileSync(path, '/r:System.dll', { flag: 'wx' });
    mocks.run.mockImplementation(async target => {
      await produce(target);
      if (mutation === 'removed') rmSync(path);
      else writeFileSync(path, '/r:Changed.dll');
      return result;
    });
    await expect(prepareWindowsCSharpFixture(input())).rejects.toThrow('compiler changed');
  });

  it.each(['created', 'changed', 'removed'])('refuses a configuration %s before loading', async mutation => {
    const path = join(dirname(compilerPath), 'csc.rsp');
    if (mutation !== 'created') writeFileSync(path, '/r:System.dll', { flag: 'wx' });
    const fixture = await prepareWindowsCSharpFixture(input());
    if (mutation === 'removed') rmSync(path);
    else writeFileSync(path, '/r:Changed.dll');
    expect(() => fixture.loadCommand()).toThrow('compiler changed');
  });

  it('rejects a relative system root', async () => {
    await expect(prepareWindowsCSharpFixture({ ...input(), env: { SystemRoot: 'relative' } })).rejects.toThrow('absolute');
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it.each(['', 'x'.repeat(1024 * 1024 + 1)])('rejects an empty or oversized source (%#)', async invalid => {
    await expect(prepareWindowsCSharpFixture({ ...input(), source: invalid })).rejects.toThrow('empty or oversized');
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it.each(['fixture.cs', 'fixture.dll'])('refuses occupied %s without replacing its bytes', async name => {
    const path = join(directory, name);
    writeFileSync(path, 'occupied', { flag: 'wx' });
    await expect(prepareWindowsCSharpFixture(input())).rejects.toThrow();
    expect(readFileSync(path, 'utf8')).toBe('occupied');
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('preserves the exact compiler failure', async () => {
    const failure = new Error('compiler failed');
    mocks.run.mockRejectedValue(failure);
    await expect(prepareWindowsCSharpFixture(input())).rejects.toBe(failure);
  });

  it('rejects a successful process without a produced assembly', async () => {
    mocks.run.mockResolvedValue(result);
    await expect(prepareWindowsCSharpFixture(input())).rejects.toThrow();
  });

  it('rejects a non-PE output', async () => {
    mocks.run.mockImplementation(async target => {
      await produce(target);
      writeFileSync(join(directory, 'fixture.dll'), 'invalid');
      return result;
    });
    await expect(prepareWindowsCSharpFixture(input())).rejects.toThrow('PE assembly');
  });

  it('rejects a hardlinked output', async () => {
    mocks.run.mockImplementation(async target => {
      await produce(target);
      linkSync(join(directory, 'fixture.dll'), join(directory, 'alias.dll'));
      return result;
    });
    await expect(prepareWindowsCSharpFixture(input())).rejects.toThrow('single-link');
  });

  it.each(['fixture.cs', 'compiler'])('rejects %s drift during compilation', async name => {
    mocks.run.mockImplementation(async target => {
      await produce(target);
      writeFileSync(name === 'compiler' ? compilerPath : join(directory, name), 'changed');
      return result;
    });
    await expect(prepareWindowsCSharpFixture(input())).rejects.toThrow('source or compiler changed');
  });

  it.each(['fixture.cs', 'fixture.dll', 'compiler'])('refuses %s drift before loading', async name => {
    const fixture = await prepareWindowsCSharpFixture(input());
    writeFileSync(name === 'compiler' ? compilerPath : join(directory, name), 'changed');
    expect(() => fixture.loadCommand()).toThrow('changed');
  });

  it('keeps malformed native source a real bounded compiler failure', async () => {
    if (process.platform !== 'win32') return;
    const actual = await vi.importActual<typeof import('./bounded-process-runner.js')>('./bounded-process-runner.js');
    mocks.run.mockImplementation(actual.runBoundedProcess);
    await expect(prepareWindowsCSharpFixture({
      ...input(), source: 'this is not C#', env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR },
    })).rejects.toMatchObject({ name: 'BoundedProcessExitError', exitCode: 198 });
  }, 30_000);

  it('keeps an invalid assembly a real target-load failure', async () => {
    if (process.platform !== 'win32') return;
    const fixture = await prepareWindowsCSharpFixture(input());
    const actual = await vi.importActual<typeof import('./bounded-process-runner.js')>('./bounded-process-runner.js');
    const command = `$ErrorActionPreference = 'Stop'; ${fixture.loadCommand()}`;
    await expect(actual.runBoundedProcess({
      executablePath: resolve(process.env.SystemRoot!, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')],
      cwd: directory, env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR },
      timeoutMs: 10_000, maxOutputBytes: 8_192, label: 'invalid C# fixture target load',
    })).rejects.toMatchObject({ name: 'BoundedProcessExitError', exitCode: 198 });
  }, 30_000);
});
