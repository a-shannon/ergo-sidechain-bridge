import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import {
  buildExactTestNamePatterns,
  parseListedVitestTests,
} from './bounded-vitest-name-shards.js';

const DEFAULT_BATCH_SIZE = 1;
const DEFAULT_REPORTER = 'default';
const DEFAULT_TEST_TIMEOUT_MS = process.platform === 'win32'
  ? 15_000
  : 5_000;
interface ShardedTestTarget {
  envName:
    | 'ISOLATED_DEVNET_LAUNCH_TEST_SHARD'
    | 'RELEASE_GATE_TEST_SHARD'
    | 'RELEASE_NOTES_TEST_SHARD'
    | 'STATE_TRACKER_TEST_SHARD';
  shardCount: number;
}

const SHARDED_TEST_TARGETS = new Map<string, ShardedTestTarget>([
  [
    'src/substrate-federated-isolated-devnet-launch-v1.test.ts',
    { envName: 'ISOLATED_DEVNET_LAUNCH_TEST_SHARD', shardCount: 16 },
  ],
  [
    'src/release-gate.test.ts',
    { envName: 'RELEASE_GATE_TEST_SHARD', shardCount: 64 },
  ],
  [
    'src/release-notes-evidence.test.ts',
    { envName: 'RELEASE_NOTES_TEST_SHARD', shardCount: 8 },
  ],
  [
    'src/state-tracker.test.ts',
    { envName: 'STATE_TRACKER_TEST_SHARD', shardCount: 4 },
  ],
]);
const ISOLATED_TEST_TARGETS = new Set([
  'src/wp06-fixture-backed-lifecycle.test.ts',
]);
const NAME_SHARDED_TEST_TARGETS = new Map<string, number>([
  ['src/adapters/federated-native-mint-execution-v1.test.ts', 50],
]);

function collectTestFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const absolute = path.join(dir, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      files.push(...collectTestFiles(absolute));
      continue;
    }
    if (entry.endsWith('.test.ts')) {
      files.push(absolute);
    }
  }

  return files;
}

function toVitestTarget(file: string): string {
  return path.relative(process.cwd(), file).split(path.sep).join('/');
}

function parseBatchSize(): number {
  const raw = process.env.VITEST_BATCH_SIZE;
  if (!raw) {
    return DEFAULT_BATCH_SIZE;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new Error(`VITEST_BATCH_SIZE must be an integer from 1 to 50; got ${raw}`);
  }
  return parsed;
}

function parseResumeBoundary(args: string[]): string | undefined {
  if (process.env.VITEST_START_AFTER !== undefined) {
    throw new Error(
      'VITEST_START_AFTER is unsupported because inherited environment must not narrow audit tests; use --start-after',
    );
  }
  if (args.length === 0) return undefined;
  if (args.length !== 2 || args[0] !== '--start-after' || args[1].trim().length === 0) {
    throw new Error('bounded Vitest accepts only --start-after <exact-test-file>');
  }
  return args[1].trim().replace(/\\/g, '/');
}

function selectResumeSuffix(tests: string[], requested: string | undefined): string[] {
  if (!requested) return tests;
  const index = tests.findIndex(test => toVitestTarget(test) === requested);
  if (index < 0) {
    throw new Error(`--start-after must name an exact collected test file; got ${requested}`);
  }
  if (index === tests.length - 1) {
    throw new Error('--start-after must leave at least one collected test file to execute');
  }
  return tests.slice(index + 1);
}

const srcDir = path.join(process.cwd(), 'src');
const vitestBin =
  process.platform === 'win32'
    ? path.join(process.cwd(), 'node_modules', '.bin', 'vitest.cmd')
    : path.join(process.cwd(), 'node_modules', '.bin', 'vitest');
const vitestCli = path.join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');

if (!existsSync(vitestBin) || !existsSync(vitestCli)) {
  throw new Error(`Vitest binary or CLI not found at ${vitestBin} / ${vitestCli}`);
}

const collectedTests = collectTestFiles(srcDir).sort((left, right) =>
  toVitestTarget(left).localeCompare(toVitestTarget(right)),
);
const resumeBoundary = parseResumeBoundary(process.argv.slice(2));
const tests = selectResumeSuffix(collectedTests, resumeBoundary);
const batchSize = parseBatchSize();

console.log(
  `Running ${tests.length} of ${collectedTests.length} Vitest files in batches of ${batchSize}`
  + `${resumeBoundary ? ` after ${resumeBoundary}` : ''}.`,
);
console.log(`Default Vitest test timeout: ${DEFAULT_TEST_TIMEOUT_MS}ms.`);

function runVitestBatch(batch: string[], env: NodeJS.ProcessEnv = process.env): void {
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath && existsSync(npmExecPath) ? process.execPath : vitestBin;
  const vitestArgs = [
    '--run',
    ...batch,
    '--reporter',
    DEFAULT_REPORTER,
    '--testTimeout',
    String(DEFAULT_TEST_TIMEOUT_MS),
    ...(env.RELEASE_GATE_TEST_SHARD || env.RELEASE_NOTES_TEST_SHARD
      ? ['--hideSkippedTests']
      : []),
  ];
  const args =
    npmExecPath && existsSync(npmExecPath)
      ? [npmExecPath, 'test', '--', ...vitestArgs]
      : ['run', ...vitestArgs];

  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    shell: command === vitestBin && process.platform === 'win32',
    stdio: 'inherit',
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runVitestNameShard(target: string, pattern: string, expectedPassed: number): void {
  const result = spawnSync(process.execPath, [
    vitestCli,
    'run',
    target,
    '--testNamePattern',
    pattern,
    '--hideSkippedTests',
    '--testTimeout',
    String(DEFAULT_TEST_TIMEOUT_MS),
    '--reporter',
    'json',
  ], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stdout.write(result.stdout);
    process.exit(result.status ?? 1);
  }
  let report: unknown;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Vitest name shard returned invalid JSON for ${target}`);
  }
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error(`Vitest name shard returned an invalid report for ${target}`);
  }
  const { numPassedTests, numFailedTests } = report as Record<string, unknown>;
  if (numPassedTests !== expectedPassed || numFailedTests !== 0) {
    throw new Error(
      `Vitest name shard coverage mismatch for ${target}: expected ${expectedPassed} passed, got ${String(numPassedTests)} passed and ${String(numFailedTests)} failed`,
    );
  }
  console.log(`Vitest exact-name shard passed ${numPassedTests} tests.`);
}

function runNameShardedTest(target: string, maximumTestsPerShard: number): void {
  const listResult = spawnSync(process.execPath, [vitestCli, 'list', target, '--json'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (listResult.error) throw listResult.error;
  if (listResult.status !== 0) {
    throw new Error(`Vitest list failed for ${target} with exit code ${listResult.status ?? 1}`);
  }
  let listed: unknown;
  try {
    listed = JSON.parse(listResult.stdout);
  } catch {
    throw new Error(`Vitest list returned invalid JSON for ${target}`);
  }
  const tests = parseListedVitestTests(listed);
  const expectedFile = path.resolve(process.cwd(), target);
  const normalize = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value;
  if (tests.some(test => normalize(path.resolve(test.file)) !== normalize(expectedFile))) {
    throw new Error(`Vitest list returned a foreign test file for ${target}`);
  }
  const patterns = buildExactTestNamePatterns(tests, maximumTestsPerShard);
  for (let index = 0; index < patterns.length; index += 1) {
    console.log(`\nVitest exact-name shard ${index + 1}/${patterns.length}: ${target}`);
    const expectedPassed = Math.min(maximumTestsPerShard, tests.length - index * maximumTestsPerShard);
    runVitestNameShard(target, patterns[index]!, expectedPassed);
  }
}

function runTestShards(target: string, config: ShardedTestTarget): void {
  for (let shard = 1; shard <= config.shardCount; shard += 1) {
    console.log(
      `\nVitest shard ${shard}/${config.shardCount}: ${target}`,
    );
    runVitestBatch([target], {
      ...process.env,
      [config.envName]: `${shard}/${config.shardCount}`,
    });
  }
}

for (let index = 0; index < tests.length; index += batchSize) {
  const batch = tests.slice(index, index + batchSize).map(toVitestTarget);
  const batchNumber = Math.floor(index / batchSize) + 1;
  const batchCount = Math.ceil(tests.length / batchSize);
  console.log(`\nVitest batch ${batchNumber}/${batchCount}: ${batch.join(' ')}`);

  const isolatedTests = batch.filter(test => ISOLATED_TEST_TARGETS.has(test));
  const regularTests = batch.filter(test => !ISOLATED_TEST_TARGETS.has(test));
  const shardedTests = regularTests.filter(test => SHARDED_TEST_TARGETS.has(test));
  const nameShardedTests = regularTests.filter(test => NAME_SHARDED_TEST_TARGETS.has(test));
  const ordinaryTests = regularTests.filter(
    test => !SHARDED_TEST_TARGETS.has(test) && !NAME_SHARDED_TEST_TARGETS.has(test),
  );

  if (ordinaryTests.length > 0) {
    runVitestBatch(ordinaryTests);
  }
  for (const shardedTest of shardedTests) {
    runTestShards(shardedTest, SHARDED_TEST_TARGETS.get(shardedTest)!);
  }
  for (const nameShardedTest of nameShardedTests) {
    runNameShardedTest(nameShardedTest, NAME_SHARDED_TEST_TARGETS.get(nameShardedTest)!);
  }

  for (const isolatedTest of isolatedTests) {
    console.log(`\nVitest isolated target: ${isolatedTest}`);
    runVitestBatch([isolatedTest]);
  }
}

console.log(`Completed ${tests.length} Vitest files across ${Math.ceil(tests.length / batchSize)} batches.`);
