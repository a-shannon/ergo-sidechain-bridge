import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import * as names from './scripts/bounded-vitest-name-shards.js';
import * as schedule from './scripts/bounded-vitest-schedule.js';

const runnerSource = readFileSync(path.join(
  path.dirname(fileURLToPath(import.meta.url)), 'scripts', 'run-bounded-vitest.ts',
), 'utf8');
const parentTarget = 'src/scripts/run-substrate-federated-native-two-cycle-v1.test.ts';
const fixtureRoot = path.resolve('/audit-relayer');
const inventory = [
  ...schedule.BOUNDED_VITEST_PRIORITY_TARGETS,
  'src/a-ordinary.test.ts',
  'src/adapters/federated-native-mint-execution-v1.test.ts',
  'src/release-gate.test.ts',
  'src/wp06-fixture-backed-lifecycle.test.ts',
  'src/z-ordinary.test.ts',
];
const listed = Array.from({ length: 341 }, (_, index) => ({
  name: `parent > case ${index} [x.y]`, file: path.resolve(fixtureRoot, parentTarget),
}));

interface ProbeOptions {
  source?: string;
  batchSize?: number;
  platform?: string;
  list?: unknown;
  listStatus?: number;
  listText?: string;
  shardStatus?: number | null;
  shardError?: Error;
  passedDrift?: number;
  failed?: number;
  badReport?: boolean;
}

function probe(options: ProbeOptions = {}) {
  const executed: string[] = [];
  const shardCalls: { target: string; args: string[]; command: string }[] = [];
  const listCalls: string[] = [];
  const platform = options.platform ?? process.platform;
  const directories = new Set(inventory.map(target => path.dirname(path.resolve(fixtureRoot, target))));
  const normalizeTarget = (value: string) => path.relative(fixtureRoot, value).split(path.sep).join('/');
  const processDouble = {
    platform, execPath: '/audit-node',
    env: { VITEST_BATCH_SIZE: String(options.batchSize ?? 1) },
    argv: ['node', 'runner'], cwd: () => fixtureRoot,
    stdout: { write() {} }, stderr: { write() {} },
    exit: (code: number) => { throw new Error(`exit:${code}`); },
  };
  const dependencies: Record<string, unknown> = {
    'node:path': path,
    './bounded-vitest-name-shards.js': names,
    './bounded-vitest-schedule.js': schedule,
    'node:fs': {
      existsSync: () => true,
      readdirSync: (directory: string) => [...new Set(inventory.flatMap(target => {
        const relative = path.relative(directory, path.resolve(fixtureRoot, target));
        return relative.startsWith('..') ? [] : [relative.split(path.sep)[0]];
      }))],
      statSync: (absolute: string) => ({ isDirectory: () => directories.has(absolute) }),
    },
    'node:child_process': {
      spawnSync: (command: string, args: string[]) => {
        if (args[1] === 'list') {
          listCalls.push(args[2]);
          const fixture = args[2] === parentTarget ? listed : [
            { name: 'mint > ordinary', file: path.resolve(fixtureRoot, args[2]) },
          ];
          return { status: options.listStatus ?? 0,
            stdout: options.listText ?? JSON.stringify(options.list ?? fixture), stderr: '' };
        }
        if (args.includes('--testNamePattern')) {
          const target = args[2];
          executed.push(target);
          shardCalls.push({ target, args, command });
          const pattern = new RegExp(args[args.indexOf('--testNamePattern') + 1]);
          const passed = target === parentTarget
            ? listed.filter(test => pattern.test(names.toVitestFilterName(test.name))).length
            : 1;
          return { status: options.shardStatus === undefined ? 0 : options.shardStatus,
            error: options.shardError, stderr: '',
            stdout: options.badReport ? 'not json' : JSON.stringify({
              numPassedTests: passed + (options.passedDrift ?? 0), numFailedTests: options.failed ?? 0,
            }) };
        }
        executed.push(...args.filter(arg => arg.endsWith('.test.ts')));
        return { status: 0, stdout: '', stderr: '' };
      },
    },
  };
  const code = ts.transpileModule(options.source ?? runnerSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  let error: string | undefined;
  try {
    new Function('require', 'exports', 'module', 'process', 'console', code)(
      (id: string) => { assert(id in dependencies); return dependencies[id]; },
      {}, { exports: {} }, processDouble, { log() {} },
    );
  } catch (failure) {
    error = failure instanceof Error ? failure.message : String(failure);
  }
  return { error, executed, shardCalls, listCalls };
}

describe('bounded Vitest runner composition', () => {
  it.each([1, 2, 50])('preserves every scheduled file in order with batch size %s', batchSize => {
    const result = probe({ batchSize });
    expect(result.error).toBeUndefined();
    const fileOrder = result.executed.filter((target, index) => result.executed[index - 1] !== target);
    expect(fileOrder).toEqual(schedule.buildBoundedVitestSchedule(inventory));
    expect(result.listCalls.filter(target => target === parentTarget)).toHaveLength(1);
    const calls = result.shardCalls.filter(call => call.target === parentTarget);
    expect(calls).toHaveLength(14);
    const patterns = calls.map(call => new RegExp(call.args[call.args.indexOf('--testNamePattern') + 1]));
    for (const test of listed) {
      expect(patterns.filter(pattern => pattern.test(names.toVitestFilterName(test.name)))).toHaveLength(1);
    }
    expect(patterns.map(pattern => listed.filter(test => pattern.test(names.toVitestFilterName(test.name))).length))
      .toEqual([...Array(13).fill(25), 16]);
  });

  it.each([['win32', '15000'], ['linux', '5000']])('preserves %s tool and timeout arguments', (platform, timeout) => {
    const result = probe({ platform });
    expect(result.error).toBeUndefined();
    for (const call of result.shardCalls) {
      expect(call.command).toBe('/audit-node');
      expect(call.args[0]).toBe(path.resolve(fixtureRoot, 'node_modules', 'vitest', 'vitest.mjs'));
      expect(call.args[call.args.indexOf('--testTimeout') + 1]).toBe(timeout);
      expect(call.args[call.args.indexOf('--reporter') + 1]).toBe('json');
    }
  });

  it.each<[string, ProbeOptions, RegExp]>([
    ['list exit', { listStatus: 1 }, /Vitest list failed/],
    ['invalid list JSON', { listText: 'bad' }, /invalid JSON/],
    ['empty list', { list: [] }, /at least one test/],
    ['duplicate name', { list: [listed[0], listed[0]] }, /duplicate test name/],
    ['foreign file', { list: [{ ...listed[0], file: path.resolve(fixtureRoot, 'src/foreign.test.ts') }] }, /foreign test file/],
    ['ambiguous names', { list: [
      { name: 'suite > test', file: listed[0].file }, { name: 'suite test', file: listed[0].file },
    ] }, /ambiguous/],
    ['nonzero exit with passed assertions', { shardStatus: 1 }, /exit:1/],
    ['missing exit status', { shardStatus: null }, /exit:1/],
    ['spawn error', { shardError: new Error('synthetic spawn refusal') }, /synthetic spawn refusal/],
    ['invalid report JSON', { badReport: true }, /invalid JSON/],
    ['missing passed case', { passedDrift: -1 }, /coverage mismatch/],
    ['failed case', { failed: 1 }, /coverage mismatch/],
  ])('refuses %s at its own predicate', (_label, options, expected) => {
    expect(probe(options).error).toMatch(expected);
  });
});
