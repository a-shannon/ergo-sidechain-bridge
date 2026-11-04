import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(), exists: vi.fn(), exec: vi.fn(), kill: vi.fn(),
}));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn, execFileSync: mocks.exec }));
vi.mock('node:fs', () => ({ existsSync: mocks.exists }));

import { BoundedProcessExitError, runBoundedProcess } from './bounded-process-runner.js';

const nativeProcess = process;
class OwnedChild extends EventEmitter {
  pid = 31415;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = {
    destroyed: false, writable: true, writableEnded: false,
    end: vi.fn(() => { this.stdin.writableEnded = true; }),
    destroy: vi.fn(() => { this.stdin.destroyed = true; this.stdin.writable = false; }),
  };
}
let child: OwnedChild;

function input(signal?: AbortSignal) {
  return {
    executablePath: nativeProcess.execPath, args: [], cwd: resolve('.'),
    env: { SystemRoot: resolve('cancellation-fixture-system') },
    timeoutMs: 5000, terminationGraceMs: 1000, maxOutputBytes: 1024,
    label: 'owned cancellation fixture', signal,
  };
}
function watch(promise: ReturnType<typeof runBoundedProcess>) {
  let state = 'pending';
  let value: unknown;
  let error: unknown;
  const done = promise.then(v => { state = 'fulfilled'; value = v; }, e => {
    state = 'rejected'; error = e;
  });
  return { get state() { return state; }, async error() { await done; return error; },
    async value() { await done; return value; } };
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function exit(code: number) { child.exitCode = code; child.emit('exit', code, null); }
function close(code: number) { child.emit('close', code, null); }
function platform(value: 'win32' | 'linux') {
  vi.stubGlobal('process', { ...nativeProcess, platform: value, kill: mocks.kill });
}
function absentGroup() {
  const error = new Error('fixture process group absent') as NodeJS.ErrnoException;
  error.code = 'ESRCH';
  throw error;
}

beforeEach(() => {
  vi.useFakeTimers();
  child = new OwnedChild();
  mocks.spawn.mockReset().mockImplementation(() => child as unknown as ChildProcess);
  mocks.exists.mockReset().mockReturnValue(true);
  mocks.exec.mockReset().mockImplementation(() => { throw new Error('unexpected process query'); });
  mocks.kill.mockReset().mockImplementation(() => { throw new Error('unexpected PID termination'); });
  platform('win32');
});
afterEach(() => {
  // These are entirely mocked processes; clear only their simulated timers.
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('owned bounded-process cancellation', () => {
  it('rejects a pre-aborted signal without spawning', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(runBoundedProcess(input(controller.signal))).rejects.toThrow('aborted');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('rechecks abort after Windows preparation before spawning', async () => {
    const controller = new AbortController();
    mocks.exists.mockImplementationOnce(() => { controller.abort(); return true; });
    await expect(runBoundedProcess(input(controller.signal))).rejects.toThrow('aborted');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('closes the subscription race before spawning', async () => {
    const controller = new AbortController();
    const add = controller.signal.addEventListener.bind(controller.signal);
    vi.spyOn(controller.signal, 'addEventListener').mockImplementationOnce((...args) => {
      add(...args); controller.abort();
    });
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    await expect(runBoundedProcess(input(controller.signal))).rejects.toThrow('aborted');
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledOnce();
  });

  it('latches an abort during synchronous spawn until setup is ready', async () => {
    const controller = new AbortController();
    mocks.spawn.mockImplementationOnce(() => { controller.abort(); return child; });
    const observed = watch(runBoundedProcess(input(controller.signal)));
    expect(child.stdin.end).toHaveBeenCalledOnce();
    await flush(); expect(observed.state).toBe('pending');
    exit(197); close(197);
    expect(await observed.error()).toMatchObject({ message: 'owned cancellation fixture aborted' });
    expect(mocks.kill).not.toHaveBeenCalled();
  });

  it.each([0, 197, 198, 199, 200])(
    'rejects abort only after known Windows terminal %s and close', async (code) => {
      const controller = new AbortController();
      const removed = vi.spyOn(controller.signal, 'removeEventListener');
      const observed = watch(runBoundedProcess(input(controller.signal)));
      controller.abort();
      expect(child.stdin.end).toHaveBeenCalledOnce();
      exit(code); await flush();
      expect(observed.state).toBe('pending');
      expect(removed).not.toHaveBeenCalled();
      close(code);
      expect(await observed.error()).toMatchObject({ message: 'owned cancellation fixture aborted' });
      expect(removed).toHaveBeenCalledOnce();
      expect(mocks.kill).not.toHaveBeenCalled();
      expect(mocks.exec).not.toHaveBeenCalled();
    },
  );

  it('retains ownership and the listener while close is delayed', async () => {
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const observed = watch(runBoundedProcess(input(controller.signal)));
    controller.abort(); exit(197);
    await vi.advanceTimersByTimeAsync(2000);
    expect(observed.state).toBe('pending');
    expect(removed).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    close(197);
    expect(await observed.error()).toMatchObject({ message: 'owned cancellation fixture aborted' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retains unknown containment instead of returning cancellation authority', async () => {
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const observed = watch(runBoundedProcess(input(controller.signal)));
    controller.abort(); exit(13); close(13);
    await vi.advanceTimersByTimeAsync(2000);
    expect(observed.state).toBe('pending');
    expect(removed).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    expect(mocks.kill).not.toHaveBeenCalled();
  });

  it('rejects abort between a zero exit and close', async () => {
    const controller = new AbortController();
    const observed = watch(runBoundedProcess(input(controller.signal)));
    exit(0); controller.abort(); close(0);
    expect(await observed.error()).toMatchObject({ message: 'owned cancellation fixture aborted' });
    expect(mocks.kill).not.toHaveBeenCalled();
  });

  it('removes the listener after success and ignores a later abort', async () => {
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const observed = watch(runBoundedProcess(input(controller.signal)));
    child.stdout.emit('data', Buffer.from('exact output'));
    exit(0); close(0);
    expect(await observed.value()).toMatchObject({ exitCode: 0, stdout: 'exact output' });
    controller.abort();
    expect(removed).toHaveBeenCalledOnce();
    expect(child.stdin.end).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('removes the listener after a spawn error', async () => {
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const observed = watch(runBoundedProcess(input(controller.signal)));
    child.emit('error', new Error('fixture spawn failed'));
    expect(await observed.error()).toMatchObject({ message: 'owned cancellation fixture failed to start' });
    expect(removed).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves absent-signal exit errors and exact captured bytes', async () => {
    const observed = watch(runBoundedProcess(input()));
    child.stdout.emit('data', Buffer.from('out')); child.stderr.emit('data', Buffer.from('err'));
    exit(198); close(198);
    expect(await observed.error()).toBeInstanceOf(BoundedProcessExitError);
    expect(await observed.error()).toMatchObject({ exitCode: 198, stdout: 'out', stderr: 'err' });
  });

  it('keeps the first output-cap failure when cancellation follows it', async () => {
    const controller = new AbortController();
    const observed = watch(runBoundedProcess(input(controller.signal)));
    child.stdout.emit('data', Buffer.alloc(1025)); controller.abort(); exit(197); close(197);
    expect(await observed.error()).toMatchObject({ message: 'owned cancellation fixture output exceeded the limit' });
  });

  it('uses the existing POSIX group termination and verifies absence', async () => {
    platform('linux');
    mocks.kill.mockImplementation((_pid, signal) => signal === 0 ? absentGroup() : true);
    const controller = new AbortController();
    const observed = watch(runBoundedProcess(input(controller.signal)));
    controller.abort(); exit(0); close(0);
    expect(await observed.error()).toMatchObject({ message: 'owned cancellation fixture aborted' });
    expect(mocks.kill).toHaveBeenCalledWith(-child.pid, 'SIGKILL');
    expect(mocks.kill).toHaveBeenCalledWith(-child.pid, 0);
  });

  it('retains a POSIX termination failure with unverified group absence', async () => {
    platform('linux');
    const controller = new AbortController();
    const observed = watch(runBoundedProcess(input(controller.signal)));
    controller.abort(); exit(0); close(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(observed.state).toBe('pending');
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it('reinspects POSIX absence for abort after exit without killing the exited PID', async () => {
    platform('linux'); mocks.kill.mockImplementation(absentGroup);
    const controller = new AbortController();
    const observed = watch(runBoundedProcess(input(controller.signal)));
    exit(0); controller.abort(); close(0);
    expect(await observed.error()).toMatchObject({ message: 'owned cancellation fixture aborted' });
    expect(mocks.kill.mock.calls.every(([, signal]) => signal === 0)).toBe(true);
  });
});
