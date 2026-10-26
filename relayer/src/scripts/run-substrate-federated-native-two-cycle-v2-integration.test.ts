import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync,
  writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, parse, relative, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({ environment: vi.fn(), load: vi.fn(),
  root: vi.fn(), wasmPackageMatches: vi.fn(), buildReady: vi.fn(),
  runtime: vi.fn(), process: vi.fn(), wasmBuild: vi.fn() }));

vi.mock('../substrate-federated-native-two-cycle-invocation-v1.js', () => ({
  loadSubstrateFederatedNativeTwoCycleInvocationV1: mocked.load,
  validateSubstrateFederatedNativeTwoCycleInvocationEnvironmentV1: mocked.environment,
  projectSubstrateFederatedNativeTwoCycleResultV1: vi.fn(),
}));
vi.mock('../substrate-federated-native-wasm-avl-package-v1.js', () => ({
  assertSubstrateFederatedNativeWasmAvlPackageMatchesV1: mocked.wasmPackageMatches,
}));
vi.mock('../apps/bridge-daemon/substrate-federated-genesis-target-root-v1.js',
  () => ({ runSubstrateFederatedGenesisTargetRootV1: mocked.root }));
vi.mock('../authenticated-v2-runtime-bundle.js', () => ({
  validatePinnedFederatedCampaignParentRuntime: mocked.runtime,
}));
vi.mock('../pinned-local-native-verifier-build.js', () => ({
  runBoundedProcess: mocked.process,
}));
vi.mock('./build-wasm-avl.js', () => ({ buildWasmAvlPackageV2: mocked.wasmBuild }));
vi.mock('../substrate-federated-isolated-devnet-ergo-node-build-v1.js', () => ({
  assertSubstrateFederatedIsolatedDevnetErgoNodeBuildOutputReadyV1: mocked.buildReady,
}));

import { canonicalJson, sha256CanonicalJson }
  from '../ergo-settlement-core/strict-json.js';
import { tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2 }
  from '../substrate-federated-native-two-cycle-root-phase-v2.js';
import { tagNativeTwoCycleCycleStepFailureV1 }
  from '../substrate-federated-native-two-cycle-cycle-step-v1.js';
import { createNativeTwoCycleParentCycleStepV1 }
  from '../substrate-federated-native-two-cycle-cycle-step-diagnostic-v1.js';
import { parseNativeDepositFundingWorkerStageV2,
  parseNativeDepositFundingParentStageV2 }
  from '../substrate-federated-native-deposit-funding-stage-v2.js';
import { readOptionalNativeDepositFundingPublicStageV2 }
  from '../substrate-federated-native-deposit-funding-stage-v2-public-reader.js';
import { runSubstrateFederatedNativeTwoCycleWorkerFromArgumentsV2 }
  from './run-substrate-federated-native-two-cycle-worker-v2.js';
import { runSubstrateFederatedNativeTwoCycleFromArgumentsV2,
  tryPublishNativeDepositFundingParentStageV2 }
  from './run-substrate-federated-native-two-cycle-v2.js';

const FIXTURE_TMP = resolve(process.env.ERGO_BRIDGE_TEST_TMP_ROOT ?? tmpdir());
const bridgeRoot = resolve(import.meta.dirname, '..', '..', '..');
const text = (value: unknown) => `${canonicalJson(value)}\n`;

function environment() {
  return Object.freeze({
    repository: Object.freeze({ commit: '1'.repeat(40), tree: '4'.repeat(40),
      clean: true as const }),
    runtime: Object.freeze({ nodeVersion: '24.14.0',
      nodeExecutableSha256: '5'.repeat(64), gitVersion: '2.54.0.windows.1',
      gitExecutableSha256: '6'.repeat(64), gitExecutablePath: join(FIXTURE_TMP, 'git.exe'),
      relayerPackageLockSha256: '7'.repeat(64),
      parentRuntimePackagesValidated: true as const,
      loaderInvocationValidated: true as const,
      gitEnvironmentSanitized: true as const }),
    toolIdentityDigestHex: '8'.repeat(64),
  });
}

function wasmIdentity() {
  return Object.freeze({ sourceSha256Hex: 'a'.repeat(64),
    packageSha256Hex: 'b'.repeat(64), wasmPackVersion: 'wasm-pack 0.14.0',
    wasmPackExecutableSha256Hex:
      '6e569a9bea962dbdc3e30e9aef076b1d559f7819b1cbb7ffce85ece8a7e47da8',
    wasmBindgenVersion: 'wasm-bindgen 0.2.120',
    wasmBindgenExecutableSha256Hex:
      '9d669c8c13bb70a37c8518c9476f9b716c7fdf463daaa73742dffb486e7f802a',
    rustcVersion: 'rustc 1.97.1 (8bab26f4f 2026-07-14)',
    rustcExecutableSha256Hex:
      'cf79cfd77b0a144c56a0a6af6bf10bcdf095a73718cd4bf2b9d4fe2d2cbded55',
    cargoVersion: 'cargo 1.97.1 (c980f4866 2026-06-30)',
    cargoExecutableSha256Hex:
      'ddfbad20b31b918d3439d070945ec59bbfe037a6ec0ab5b584459e69c8b37d1b',
  });
}

function fixture(suite: string, name: string) {
  const attemptPath = join(suite, name);
  mkdirSync(attemptPath);
  const configPath = join(attemptPath, 'config.json');
  const configBytes = Buffer.from('{}\n', 'utf8');
  writeFileSync(configPath, configBytes, { flag: 'wx' });
  const ergoSourcePath = join(attemptPath, 'ergo-source');
  mkdirSync(ergoSourcePath);
  const loaded = Object.freeze({
    config: Object.freeze({
      schema: 'e2s.substrate-federated-native-two-cycle-invocation.v1',
      version: 1, profile: 'synthetic-loopback-two-cycle',
      expectedBridgeCommit: '1'.repeat(40), bridgeRoot,
      frontierBuildParentDirectory: join(suite, 'frontier-builds'),
      ergoSourcePath, ergoJavaExecutablePath: join(suite, 'jdk', 'bin', 'java.exe'),
      frontierCargoHomeDirectory: join(suite, 'cargo-home'),
      outputParentDirectory: suite, attemptName: name,
    }),
    configBytes, configSha256Hex: '2'.repeat(64), configCanonicalPath: configPath,
    worktreeRoot: bridgeRoot, attemptPath, pathIdentityDigestHex: '3'.repeat(64),
    rootInput: Object.freeze({ frontierBuild: Object.freeze({ source: 'frontier' }),
      ergoBuild: Object.freeze({ source: 'ergo', ergoSourcePath }) }),
  });
  writeFileSync(join(attemptPath, 'start.json'), text({
    schema: 'e2s.substrate-federated-native-two-cycle-start.v1', version: 1,
    status: 'two_cycle_invocation_started', configSha256Hex: loaded.configSha256Hex,
    expectedBridgeCommit: loaded.config.expectedBridgeCommit,
    expectedBridgeTree: environment().repository.tree,
    pathIdentityDigestHex: loaded.pathIdentityDigestHex,
    toolIdentityDigestHex: environment().toolIdentityDigestHex,
  }), { flag: 'wx' });
  writeFileSync(join(attemptPath, 'wasm-avl-package.json'), text({
    schema: 'e2s.substrate-federated-native-two-cycle-wasm-avl-package.v2',
    version: 1, status: 'source-and-tool-bound-package-built',
    bridgeCommit: environment().repository.commit,
    bridgeTree: environment().repository.tree, build: wasmIdentity(),
  }), { flag: 'wx' });
  const bindings = Object.freeze({ configSha256Hex: loaded.configSha256Hex,
    expectedBridgeCommit: loaded.config.expectedBridgeCommit,
    pathIdentityDigestHex: loaded.pathIdentityDigestHex });
  return { attemptPath, configPath, loaded, bindings,
    args: ['--config', configPath, '--expected-config-sha256',
      loaded.configSha256Hex, '--expected-wasm-avl-package-sha256',
      wasmIdentity().packageSha256Hex, '--attempt', attemptPath] };
}

function parentFixture(suite: string) {
  const attemptPath = join(suite, 'parent-attempt');
  const configPath = join(suite, 'parent-source-config.json');
  const configBytes = Buffer.from('{}\n', 'utf8');
  writeFileSync(configPath, configBytes, { flag: 'wx' });
  const ergoSourcePath = join(suite, 'parent-ergo-source');
  mkdirSync(ergoSourcePath);
  const loaded = Object.freeze({
    config: Object.freeze({
      schema: 'e2s.substrate-federated-native-two-cycle-invocation.v1',
      version: 1, profile: 'synthetic-loopback-two-cycle',
      expectedBridgeCommit: '1'.repeat(40), bridgeRoot,
      frontierBuildParentDirectory: join(suite, 'frontier-builds'),
      ergoSourcePath, ergoJavaExecutablePath: join(suite, 'jdk', 'bin', 'java.exe'),
      frontierCargoHomeDirectory: join(suite, 'cargo-home'),
      outputParentDirectory: suite, attemptName: 'parent-attempt',
    }),
    configBytes, configSha256Hex: '2'.repeat(64), configCanonicalPath: configPath,
    worktreeRoot: bridgeRoot, attemptPath, pathIdentityDigestHex: '3'.repeat(64),
    rootInput: Object.freeze({ frontierBuild: Object.freeze({ source: 'frontier' }),
      ergoBuild: Object.freeze({ source: 'ergo', ergoSourcePath }) }),
  });
  const bindings = Object.freeze({ configSha256Hex: loaded.configSha256Hex,
    expectedBridgeCommit: loaded.config.expectedBridgeCommit,
    pathIdentityDigestHex: loaded.pathIdentityDigestHex });
  return { attemptPath, configPath, configBytes, loaded, bindings };
}

function taggedDepositFailure(): Error {
  const error = new Error('synthetic private cause');
  tagSubstrateFederatedNativeTwoCycleRootFailurePhaseV2(error, 'cycle-1');
  tagNativeTwoCycleCycleStepFailureV1(error, 'cycle-1', 'deposit-funding');
  return error;
}

function entryExists(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error
        && error.code === 'ENOENT') return false;
    throw error;
  }
}

function quarantineSuite(suite: string): void {
  const source = resolve(suite);
  const quarantine = resolve(parse(source).root, 'A EFFACER');
  const destination = join(quarantine, `bridge-v2-join-${basename(source)}`);
  const relativeSource = relative(FIXTURE_TMP, source);
  if (relativeSource.startsWith('..') || relativeSource === ''
      || relativeSource.includes(':')
      || !lstatSync(FIXTURE_TMP).isDirectory() || lstatSync(FIXTURE_TMP).isSymbolicLink()
      || !lstatSync(source).isDirectory() || lstatSync(source).isSymbolicLink()) {
    throw new Error('synthetic V2 fixture quarantine boundary differs');
  }
  if (!entryExists(quarantine)) mkdirSync(quarantine);
  if (!lstatSync(quarantine).isDirectory()
      || lstatSync(quarantine).isSymbolicLink()
      || entryExists(destination)) {
    throw new Error('synthetic V2 fixture quarantine destination is occupied or indirect');
  }
  renameSync(source, destination);
  if (entryExists(source) || !lstatSync(destination).isDirectory()) {
    throw new Error('synthetic V2 fixture quarantine move failed');
  }
}

describe('actual V2 worker to parent public-file join', () => {
  it('joins actual worker-produced V1 and V2 ancestors, but omits a stale latch', async () => {
    if (process.platform !== 'win32' || process.arch !== 'x64') {
      throw new Error('native V2 worker test requires Windows x64');
    }
    const suite = mkdtempSync(join(FIXTURE_TMP, 'bridge-v2-public-join-'));
    try {
      for (const stale of [false, true]) {
        vi.resetAllMocks();
        const selected = fixture(suite, stale ? 'stale' : 'positive');
        mocked.load.mockReturnValue(selected.loaded);
        mocked.environment.mockResolvedValue(environment());
        mocked.wasmPackageMatches.mockImplementation(() => undefined);
        const primary = taggedDepositFailure();
        mocked.root.mockImplementationOnce((_input, observe) => {
          observe('cycle-1', 'owned-reward-input-discovery');
          if (stale) observe('cycle-1', null);
          throw primary;
        });
        await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArgumentsV2(
          selected.args)).rejects.toBe(primary);
        const read = (name: string) => readFileSync(join(selected.attemptPath, name), 'utf8');
        const workerFailureText = read('worker-failure.json');
        const workerRootText = read('worker-root-phase-v2.json');
        const workerStepText = read('worker-cycle-step.json');
        const workerV1 = [workerFailureText, workerRootText, workerStepText];
        expect(workerV1.every(value => value.endsWith('\n'))).toBe(true);
        expect(workerV1.join('')).not.toContain('synthetic private cause');
        const workerStagePath = join(selected.attemptPath,
          'worker-deposit-funding-stage-v2.json');
        expect(existsSync(workerStagePath)).toBe(!stale);
        const failureBody = {
          schema: 'e2s.substrate-federated-native-two-cycle-failure.v1',
          version: 1, status: 'two_cycle_invocation_failed',
          configSha256Hex: selected.bindings.configSha256Hex,
          expectedBridgeCommit: selected.bindings.expectedBridgeCommit,
          failureClass: 'execution_failure',
          checks: { startRecordPresent: true, automaticRetryOrResumeEnabled: false,
            postFailureIdentityCheckPassed: true },
          boundaries: { rootCleanupEstablishedByTimeout: false,
            startWithoutThisTerminalWouldBeAmbiguous: true, rawCausePublished: false },
        } as const;
        const failure = Object.freeze({ ...failureBody,
          receiptDigestHex: sha256CanonicalJson(failureBody,
            'E2S_SUBSTRATE_FEDERATED_NATIVE_TWO_CYCLE_FAILURE_V1') });
        const failureText = text(failure);
        writeFileSync(join(selected.attemptPath, 'failure.json'), failureText,
          { flag: 'wx' });
        const parentStep = createNativeTwoCycleParentCycleStepV1(selected.bindings,
          failure.receiptDigestHex, workerFailureText, workerRootText, workerStepText);
        const parentStepText = text(parentStep);
        writeFileSync(join(selected.attemptPath, 'failure-cycle-step.json'),
          parentStepText, { flag: 'wx' });
        const observed = tryPublishNativeDepositFundingParentStageV2(
          selected.attemptPath, selected.bindings, failure.receiptDigestHex);
        const parentStagePath = join(selected.attemptPath,
          'failure-deposit-funding-stage-v2.json');
        expect(existsSync(parentStagePath)).toBe(!stale);
        if (stale) expect(observed).toBeNull();
        else {
          const workerStageText = read('worker-deposit-funding-stage-v2.json');
          const workerStage = parseNativeDepositFundingWorkerStageV2(
            Buffer.from(workerStageText), selected.bindings,
            { workerFailureText, workerRootPhaseV2Text: workerRootText,
              workerCycleStepText: workerStepText },
            { cycle: 'cycle-1', lastEnteredStage: 'owned-reward-input-discovery' });
          expect(workerStage).toMatchObject({ cycle: 'cycle-1',
            lastEnteredStage: 'owned-reward-input-discovery',
            operationCompletionEstablished: false, rootCleanupEstablished: false,
            rawCausePublished: false, stageCauseEstablished: false,
            campaignAdmitted: false });
          const parentStage = parseNativeDepositFundingParentStageV2(
            readFileSync(parentStagePath), selected.bindings,
            failure.receiptDigestHex,
            { workerFailureText, workerRootPhaseV2Text: workerRootText,
              workerCycleStepText: workerStepText, parentCycleStepText: parentStepText,
              workerDepositFundingStageV2Text: workerStageText });
          expect(parentStage).toEqual(observed);
          expect(parentStage).toMatchObject({ cycle: 'cycle-1',
            step: 'deposit-funding',
            lastEnteredStage: 'owned-reward-input-discovery',
            workerFailureReceiptDigestHex: JSON.parse(workerFailureText).receiptDigestHex,
            workerRootPhaseV2ReceiptDigestHex: JSON.parse(workerRootText).receiptDigestHex,
            workerCycleStepReceiptDigestHex: JSON.parse(workerStepText).receiptDigestHex,
            parentCycleStepReceiptDigestHex: parentStep.receiptDigestHex,
            workerDepositFundingStageV2ReceiptDigestHex: workerStage.receiptDigestHex,
            operationCompletionEstablished: false, rootCleanupEstablished: false,
            rawCausePublished: false, stageCauseEstablished: false,
            campaignAdmitted: false });
        }
        expect(read('failure.json')).toBe(failureText);
        expect(read('failure-cycle-step.json')).toBe(parentStepText);
        expect(read('worker-failure.json')).toBe(workerFailureText);
        expect(read('worker-root-phase-v2.json')).toBe(workerRootText);
        expect(read('worker-cycle-step.json')).toBe(workerStepText);
        expect(existsSync(join(selected.attemptPath, 'result.json'))).toBe(false);
      }
    } finally { quarantineSuite(suite); }
  });

  it('runs the V2 parent failure branch with actual worker files across the mocked process edge', async () => {
    if (process.platform !== 'win32' || process.arch !== 'x64') {
      throw new Error('native V2 parent test requires Windows x64');
    }
    const suite = mkdtempSync(join(FIXTURE_TMP, 'bridge-v2-parent-join-'));
    try {
      vi.resetAllMocks();
      const selected = parentFixture(suite);
      mocked.load.mockReturnValue(selected.loaded);
      mocked.environment.mockResolvedValue(environment());
      mocked.runtime.mockReturnValue(environment().runtime);
      mocked.wasmBuild.mockResolvedValue(wasmIdentity());
      mocked.wasmPackageMatches.mockImplementation(() => undefined);
      mocked.buildReady.mockImplementation(() => undefined);
      const primary = taggedDepositFailure();
      mocked.root.mockImplementationOnce((_input: unknown,
        observe: (cycle: 'cycle-1', stage: 'owned-reward-input-discovery') => void) => {
        observe('cycle-1', 'owned-reward-input-discovery');
        throw primary;
      });
      let workerFiles: Record<string, string> = {};
      mocked.process.mockImplementationOnce(async (input: {
        args: string[]; timeoutMs: number; terminationGraceMs: number;
        maxOutputBytes: number; maxStdoutBytes: number; maxStderrBytes: number;
      }) => {
        expect(input.args.some(arg => basename(arg)
          === 'run-substrate-federated-native-two-cycle-worker-v2.ts')).toBe(true);
        expect(input.timeoutMs).toBe(4 * 60 * 60_000);
        expect(input.terminationGraceMs).toBe(30_000);
        expect(input.maxStdoutBytes).toBe(1024);
        expect(input.maxStderrBytes).toBe(64 * 1024);
        expect(input.maxOutputBytes).toBe(1024 + 64 * 1024);
        const argsAt = input.args.indexOf('--config');
        expect(argsAt).toBeGreaterThanOrEqual(0);
        await expect(runSubstrateFederatedNativeTwoCycleWorkerFromArgumentsV2(
          input.args.slice(argsAt))).rejects.toBe(primary);
        workerFiles = Object.fromEntries([
          'worker-failure.json', 'worker-root-phase-v2.json',
          'worker-cycle-step.json', 'worker-deposit-funding-stage-v2.json',
        ].map(name => [name,
          readFileSync(join(selected.attemptPath, name), 'utf8')]));
        throw primary;
      });
      await expect(runSubstrateFederatedNativeTwoCycleFromArgumentsV2([
        '--config', selected.configPath,
      ])).rejects.toBe(primary);
      expect(mocked.process).toHaveBeenCalledOnce();
      const read = (name: string) => readFileSync(join(selected.attemptPath, name), 'utf8');
      const observed = readOptionalNativeDepositFundingPublicStageV2(
        selected.attemptPath, selected.bindings);
      expect(observed.kind).toBe('validated');
      if (observed.kind !== 'validated') throw new Error('expected public V2 detail');
      expect(observed.stage).toMatchObject({
        cycle: 'cycle-1', step: 'deposit-funding',
        lastEnteredStage: 'owned-reward-input-discovery',
        operationCompletionEstablished: false, rootCleanupEstablished: false,
        rawCausePublished: false, stageCauseEstablished: false,
        campaignAdmitted: false,
      });
      expect(read('failure.json')).toContain('two_cycle_invocation_failed');
      expect(read('failure-cycle-step.json')).toContain('deposit-funding');
      for (const [name, bytes] of Object.entries(workerFiles)) expect(read(name)).toBe(bytes);
      expect(Object.values(workerFiles).join('') + read('failure.json')
        + read('failure-deposit-funding-stage-v2.json'))
        .not.toContain('synthetic private cause');
      expect(read('config.json')).toBe(selected.configBytes.toString('utf8'));
      expect(existsSync(join(selected.attemptPath, 'result.json'))).toBe(false);
    } finally { quarantineSuite(suite); }
  });
});
