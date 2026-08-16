import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { readdirSync, readFileSync, realpathSync, statSync } from 'fs';
import { dirname, isAbsolute, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import {
  AUTHENTICATED_SPV_TRACKER_JVM_AVL_DIFFERENTIAL_RESULT_PREFIX,
  AUTHENTICATED_SPV_TRACKER_JVM_AVL_DIFFERENTIAL_RESULT_SCHEMA,
  buildAuthenticatedSpvTrackerJvmAvlDifferentialCorpus,
} from './authenticated-spv-tracker-jvm-avl-differential.js';
import { loadAuthenticatedV2CompilerLock } from './authenticated-v2-source-tree-conformance.js';
import { ORIGINAL_NODE_OPTIONS } from './test-node-env.js';

const BRIDGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HISTORICAL_RELAYER_PACKAGE_LOCK_SHA256 =
  'ec537e51164c2ae33ffb3e3d4fca407a22ef4d8f58d6fdb00d8c9696e148e230';
const PINNED_JVM_HOST = process.platform === 'win32'
  && process.arch === 'x64'
  && process.version === 'v24.14.0'
  && sha256File(resolve(BRIDGE_ROOT, 'relayer', 'package-lock.json'))
    === HISTORICAL_RELAYER_PACKAGE_LOCK_SHA256;
const VITEST_NODE_OPTIONS = '--no-deprecation';
const JVM_VERIFIER_ARTIFACT_SHA256 =
  '79838cdcedc62936acb11583946cad635b9f42fa967d39bb103742b9b6302944';
const FORBIDDEN_PARENT_OVERRIDES = [
  'NODE_COMPILE_CACHE',
  'NODE_EXTRA_CA_CERTS',
  'NODE_OPTIONS',
  'NODE_PATH',
  'TSX_TSCONFIG_PATH',
] as const;

function assertPinnedVitestParentEnvironment(
  env: NodeJS.ProcessEnv,
  originalNodeOptions: string | undefined,
): void {
  if (typeof originalNodeOptions === 'string' && originalNodeOptions.length > 0) {
    throw new Error('Vitest parent inherited forbidden NODE_OPTIONS');
  }
  for (const key of FORBIDDEN_PARENT_OVERRIDES) {
    const value = env[key];
    if (key === 'NODE_OPTIONS') {
      if (value !== VITEST_NODE_OPTIONS) {
        throw new Error('Vitest parent NODE_OPTIONS does not match the reviewed harness override');
      }
      continue;
    }
    if (typeof value === 'string' && value.length > 0) {
      throw new Error(`Vitest parent environment contains forbidden override ${key}`);
    }
  }
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function listRegularFiles(root: string, cursor: string = root): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(cursor, { withFileTypes: true })) {
    const path = resolve(cursor, entry.name);
    if (entry.isSymbolicLink()) throw new Error('pinned launcher package must not contain symbolic links');
    if (entry.isDirectory()) files.push(...listRegularFiles(root, path));
    else if (entry.isFile()) files.push(path);
    else throw new Error('pinned launcher package contains an unsupported filesystem entry');
  }
  return files;
}

function hashDirectoryFiles(root: string): string {
  const records = listRegularFiles(root)
    .map(path => `${relative(root, path).replace(/\\/g, '/')}:${sha256File(path)}`)
    .sort();
  if (records.length === 0) throw new Error('pinned launcher package is empty');
  return createHash('sha256').update(records.join('\n'), 'utf8').digest('hex');
}

function assertInside(path: string, root: string, label: string): void {
  const relativePath = relative(root, path);
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`${label} escapes its reviewed root`);
  }
}

function buildPinnedChildEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NO_COLOR: '1' };
  const pathValue = source.PATH ?? source.Path;
  if (pathValue) env.PATH = pathValue;
  for (const key of [
    'JAVA_HOME',
    'USERPROFILE',
    'HOME',
    'APPDATA',
    'LOCALAPPDATA',
    'TEMP',
    'TMP',
    'SystemRoot',
    'SYSTEMROOT',
    'PATHEXT',
  ]) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) env[key] = value;
  }
  return env;
}

function resolvePinnedJvmDifferentialLauncher(): {
  nodeExecutable: string;
  tsxCli: string;
  script: string;
  env: NodeJS.ProcessEnv;
  runtimeClasspathSha256: string;
} {
  assertPinnedVitestParentEnvironment(process.env, ORIGINAL_NODE_OPTIONS);
  const paths = loadAuthenticatedV2CompilerLock(BRIDGE_ROOT);
  if (paths.lock.forbiddenParentEnvironmentOverrides.join('\n') !== FORBIDDEN_PARENT_OVERRIDES.join('\n')) {
    throw new Error('compiler lock parent override set changed');
  }
  if (`${process.platform}-${process.arch}` !== paths.lock.platform) {
    throw new Error('parent platform does not match the compiler lock');
  }
  if (process.version !== `v${paths.lock.nodeVersion}`) {
    throw new Error('parent Node version does not match the compiler lock');
  }
  const nodeExecutable = realpathSync(process.execPath);
  if (sha256File(nodeExecutable) !== paths.lock.nodeExecutableSha256) {
    throw new Error('parent Node executable does not match the compiler lock');
  }
  const nodeModulesRoot = realpathSync(resolve(paths.relayerRoot, 'node_modules'));
  const verifiedRuntimePackages = new Map<string, string>();
  for (const entry of paths.lock.parentRuntimePackages) {
    const packageRoot = realpathSync(resolve(BRIDGE_ROOT, entry.path));
    assertInside(packageRoot, nodeModulesRoot, `parent runtime package ${entry.path}`);
    if (hashDirectoryFiles(packageRoot) !== entry.sha256) {
      throw new Error(`parent runtime package ${entry.path} does not match the compiler lock`);
    }
    verifiedRuntimePackages.set(entry.path, packageRoot);
  }
  const tsxRoot = verifiedRuntimePackages.get('relayer/node_modules/tsx');
  if (!tsxRoot) throw new Error('compiler lock does not contain the reviewed tsx package');
  const tsxCli = realpathSync(resolve(tsxRoot, 'dist', 'cli.mjs'));
  assertInside(tsxCli, tsxRoot, 'tsx CLI');
  if (!statSync(tsxCli).isFile()) throw new Error('tsx CLI is not a regular file');
  const script = realpathSync(resolve(
    paths.relayerRoot,
    'src',
    'scripts',
    'authenticated-spv-tracker-jvm-avl-differential.ts',
  ));
  assertInside(script, paths.relayerRoot, 'JVM differential script');
  if (!statSync(script).isFile()) throw new Error('JVM differential script is not a regular file');
  return {
    nodeExecutable,
    tsxCli,
    script,
    env: buildPinnedChildEnvironment(process.env),
    runtimeClasspathSha256: paths.lock.runtimeClasspathSha256,
  };
}

describe('authenticated SPV tracker JVM AVL differential corpus', () => {
  it('preserves the reviewed historical WASM/JVM lock independently', () => {
    const attributes = readFileSync(resolve(BRIDGE_ROOT, '.gitattributes'), 'utf8');
    expect(attributes).toContain(
      'sources/authenticated-spv-tracker-jvm-avl-wasm-lock-v1.json text eol=lf',
    );
    const historicalLockPath = resolve(
      BRIDGE_ROOT,
      'sources',
      'authenticated-spv-tracker-jvm-avl-wasm-lock-v1.json',
    );
    expect(sha256File(historicalLockPath)).toBe(
      'a1c52eef82974e8ca102b37ca84fe526ee464a623fb7583cf05cbd06a347f060',
    );
    const historicalLock = JSON.parse(readFileSync(historicalLockPath, 'utf8')) as {
      schema: string;
      sourceFiles: Array<{ path: string; sha256: string }>;
      runtimeArtifacts: Array<{ path: string; sha256: string }>;
    };
    expect(historicalLock.schema).toBe(
      'e2s.authenticated-spv-tracker-jvm-avl-wasm-lock.v1',
    );
    expect(historicalLock.sourceFiles.map(entry => entry.path)).toEqual([
      'wasm-avl/Cargo.toml',
      'wasm-avl/Cargo.lock',
      'wasm-avl/src/lib.rs',
    ]);
    expect(historicalLock.runtimeArtifacts).toEqual([
      {
        path: 'wasm-avl/pkg/bridge_avl.js',
        sha256: '98dbefbf0150b477c7af22d5f9cdfaf925cfb464da08e787b284e17d1a1fd13c',
      },
      {
        path: 'wasm-avl/pkg/bridge_avl_bg.wasm',
        sha256: 'e6fedc505a3904518ab2ff83a5ac6c4af72fb66fc163ff86768280d330a8d487',
      },
    ]);
  });

  it('fails closed on unreviewed parent runtime overrides', () => {
    expect(() => assertPinnedVitestParentEnvironment({
      NODE_OPTIONS: '--require unreviewed-loader.cjs --no-deprecation',
    }, undefined)).toThrow('NODE_OPTIONS does not match');
    expect(() => assertPinnedVitestParentEnvironment({
      NODE_OPTIONS: VITEST_NODE_OPTIONS,
    }, VITEST_NODE_OPTIONS)).toThrow('inherited forbidden NODE_OPTIONS');
    expect(() => assertPinnedVitestParentEnvironment({
      NODE_OPTIONS: VITEST_NODE_OPTIONS,
      NODE_PATH: 'unreviewed-modules',
    }, undefined)).toThrow('forbidden override NODE_PATH');
  });

  it('derives the reviewed cases from the versioned current-source WASM output', () => {
    const corpus = buildAuthenticatedSpvTrackerJvmAvlDifferentialCorpus({ bridgeRoot: BRIDGE_ROOT });
    expect(corpus.fixture.cases.map(entry => entry.caseId)).toEqual([
      'canonical-empty',
      'canonical-non-empty',
      'rotation-ll',
      'rotation-rr',
      'rotation-lr',
      'rotation-rl',
      'wrong-digest',
      'wrong-height',
      'wrong-key',
      'existing-key',
      'wrong-value',
      'truncated-proof',
      'trailing-direction-byte-00',
      'trailing-direction-byte-ff',
      'trailing-direction-bit',
      'noncanonical-balance-7f',
      'noncanonical-balance-fe',
    ]);
    expect(corpus.cases.map(entry => [entry.caseId, entry.wasmDisposition])).toEqual([
      ['canonical-empty', 'accept-exact'],
      ['canonical-non-empty', 'accept-exact'],
      ['rotation-ll', 'accept-exact'],
      ['rotation-rr', 'accept-exact'],
      ['rotation-lr', 'accept-exact'],
      ['rotation-rl', 'accept-exact'],
      ['wrong-digest', 'reject'],
      ['wrong-height', 'reject'],
      ['wrong-key', 'reject'],
      ['existing-key', 'reject'],
      ['wrong-value', 'accept-different'],
      ['truncated-proof', 'reject'],
      ['trailing-direction-byte-00', 'accept-exact'],
      ['trailing-direction-byte-ff', 'accept-exact'],
      ['trailing-direction-bit', 'accept-exact'],
      ['noncanonical-balance-7f', 'reject'],
      ['noncanonical-balance-fe', 'reject'],
    ]);
    expect(corpus.cases.map(entry => [entry.caseId, entry.expectedJvmDisposition])).toEqual([
      ['canonical-empty', 'accept-exact'],
      ['canonical-non-empty', 'accept-exact'],
      ['rotation-ll', 'accept-exact'],
      ['rotation-rr', 'accept-exact'],
      ['rotation-lr', 'accept-exact'],
      ['rotation-rl', 'accept-exact'],
      ['wrong-digest', 'reject'],
      ['wrong-height', 'accept-different'],
      ['wrong-key', 'reject'],
      ['existing-key', 'reject'],
      ['wrong-value', 'accept-different'],
      ['truncated-proof', 'reject'],
      ['trailing-direction-byte-00', 'accept-exact'],
      ['trailing-direction-byte-ff', 'accept-exact'],
      ['trailing-direction-bit', 'accept-exact'],
      ['noncanonical-balance-7f', 'reject'],
      ['noncanonical-balance-fe', 'reject'],
    ]);
    expect(corpus.cases.map(entry => [entry.caseId, entry.expectedJvmOutcome])).toEqual([
      ['canonical-empty', 'operation-accepted'],
      ['canonical-non-empty', 'operation-accepted'],
      ['rotation-ll', 'operation-accepted'],
      ['rotation-rr', 'operation-accepted'],
      ['rotation-lr', 'operation-accepted'],
      ['rotation-rl', 'operation-accepted'],
      ['wrong-digest', 'operation-rejected'],
      ['wrong-height', 'operation-accepted'],
      ['wrong-key', 'operation-rejected'],
      ['existing-key', 'operation-rejected'],
      ['wrong-value', 'operation-accepted'],
      ['truncated-proof', 'operation-rejected'],
      ['trailing-direction-byte-00', 'operation-accepted'],
      ['trailing-direction-byte-ff', 'operation-accepted'],
      ['trailing-direction-bit', 'operation-accepted'],
      ['noncanonical-balance-7f', 'operation-rejected'],
      ['noncanonical-balance-fe', 'operation-rejected'],
    ]);
    expect(corpus.fixture.boundaries).toEqual({
      nodeStatefulAcceptance: false,
      signingPerformed: false,
      submissionPerformed: false,
      broadcastPerformed: false,
      gate5Closed: false,
    });
    expect(corpus.cases.every(entry => entry.expectedSuccessorDigestHex.length === 66)).toBe(true);
    const wrongValue = corpus.cases.find(entry => entry.caseId === 'wrong-value');
    expect(wrongValue?.wasmSuccessorDigestHex).toMatch(/^[0-9a-f]{66}$/);
    expect(wrongValue?.wasmSuccessorDigestHex).not.toBe(wrongValue?.expectedSuccessorDigestHex);
    expect(corpus.wasmIdentity.wasmArtifactSha256Hex).toBe(
      'be1134ff4052496eac6903dbc9a40bb6d164786de09e8c98488a81eedc151867',
    );
    expect(corpus.wasmIdentity.wasmGlueSha256Hex).toBe(
      '98dbefbf0150b477c7af22d5f9cdfaf925cfb464da08e787b284e17d1a1fd13c',
    );
  });

  it.runIf(PINNED_JVM_HOST)(
    'executes the pinned JVM verifier and requires exact accepted digest parity',
    () => {
      const corpus = buildAuthenticatedSpvTrackerJvmAvlDifferentialCorpus({ bridgeRoot: BRIDGE_ROOT });
      const launcher = resolvePinnedJvmDifferentialLauncher();
      const output = execFileSync(launcher.nodeExecutable, [
        launcher.tsxCli,
        launcher.script,
        '--json',
      ], {
        cwd: resolve(BRIDGE_ROOT, 'relayer'),
        env: launcher.env,
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
        timeout: 180_000,
        windowsHide: true,
      });
      const lines = output.trim().split(/\r?\n/);
      expect(lines).toHaveLength(1);
      expect(lines[0].startsWith(
        AUTHENTICATED_SPV_TRACKER_JVM_AVL_DIFFERENTIAL_RESULT_PREFIX,
      )).toBe(true);
      const observed = JSON.parse(lines[0].slice(
        AUTHENTICATED_SPV_TRACKER_JVM_AVL_DIFFERENTIAL_RESULT_PREFIX.length,
      )) as unknown;
      expect(observed).toEqual({
        schema: AUTHENTICATED_SPV_TRACKER_JVM_AVL_DIFFERENTIAL_RESULT_SCHEMA,
        rows: corpus.cases.map(entry => ({
          caseId: entry.caseId,
          wasm: entry.wasmDisposition,
          jvm: entry.expectedJvmDisposition,
          expectedJvm: entry.expectedJvmDisposition,
          jvmOutcome: entry.expectedJvmOutcome,
          expectedJvmOutcome: entry.expectedJvmOutcome,
          exactAcceptedDigestParity: entry.wasmSuccessorDigestHex !== null
            && entry.expectedJvmDisposition !== 'reject'
            ? true
            : null,
        })),
        wasmIdentity: {
          lockSha256Hex: corpus.wasmIdentity.lockSha256Hex,
          wasmGlueSha256Hex: corpus.wasmIdentity.wasmGlueSha256Hex,
          wasmArtifactSha256Hex: corpus.wasmIdentity.wasmArtifactSha256Hex,
        },
        jvmIdentity: {
          verifierArtifactSha256Hex: JVM_VERIFIER_ARTIFACT_SHA256,
          runtimeClasspathSha256Hex: launcher.runtimeClasspathSha256,
        },
        reviewedDifferences: ['wrong-height'],
        boundaries: corpus.fixture.boundaries,
      });
    },
    180_000,
  );
});
