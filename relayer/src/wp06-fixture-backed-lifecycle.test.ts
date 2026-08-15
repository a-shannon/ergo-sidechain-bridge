import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import { WP06_SOURCE_DERIVED_NEGATIVE_CASES } from './test-fixtures/wp06-source-derived-fixture.js';
import { AUTHENTICATED_SPV_TRACKER_NEGATIVE_CASES } from './scripts/spikes/spike13-authenticated-spv-tracker-vm.js';
import { AUTHENTICATED_SETTLEMENT_NEGATIVE_CASES } from './scripts/spikes/spike14-authenticated-settlement-full-tx-eval.js';
import {
  WP06_FIXTURE_LIFECYCLE_WORKER_SCHEMA,
  WP06_FIXTURE_LIFECYCLE_WORKER_SENTINEL,
  WP06_UNRESOLVED_CRITICAL_CASE,
  aggregateWp06FixtureLifecycleRuns,
  assertWp06FixtureLifecycleWorkerSummary,
  buildWp06FixtureLifecycleWorkerSummary,
  buildWp06SafeChildEnvironment,
  runWp06FixtureBackedLifecycle,
  runWp06ChildProcessWithLimits,
  type Wp06FixtureLifecycleWorkerSummary,
} from './test-fixtures/wp06-fixture-backed-lifecycle.js';

const H = {
  sidechain: '01'.repeat(32),
  block: '02'.repeat(32),
  root: '03'.repeat(32),
  checkpoint: '04'.repeat(32),
  proof: '05'.repeat(32),
  burn: '06'.repeat(32),
  extensionRoot: '07'.repeat(32),
  trackerKey: '08'.repeat(32),
  trackerValue: '09'.repeat(264),
  asset: '0a'.repeat(32),
  eventTransaction: '0b'.repeat(32),
  recipientTree: '10010100d17300',
  recipientHash: '0c'.repeat(32),
  vector: '0d'.repeat(32),
  anchor: '0e'.repeat(32),
  compiler: '0f'.repeat(32),
  baseline: '10'.repeat(32),
  trackerTree: '11'.repeat(32),
  unlockTree: '12'.repeat(32),
  dupTree: '13'.repeat(32),
  verifierExecutable: '14'.repeat(32),
  codecExecutable: '15'.repeat(32),
};

function workerSummary(): Wp06FixtureLifecycleWorkerSummary {
  return {
    schema: WP06_FIXTURE_LIFECYCLE_WORKER_SCHEMA,
    source: {
      sidechainIdHex: H.sidechain,
      sidechainHeight: '77',
      executionBlockHashHex: H.block,
      bridgeEventRootHex: H.root,
      checkpointCommitmentHex: H.checkpoint,
      aggregateFinalityProofDigestHex: H.proof,
      burnIdHex: H.burn,
      extensionKeyHex: '0401',
      extensionRootHex: H.extensionRoot,
      trackerKeyHex: H.trackerKey,
      trackerValueHex: H.trackerValue,
    },
    nativeExecutables: {
      verifierSha256Hex: H.verifierExecutable,
      codecSha256Hex: H.codecExecutable,
    },
    payout: {
      assetIdHex: H.asset,
      sidechainTransactionHashHex: H.eventTransaction,
      eventIndex: 4,
      recipientErgoTreeHex: H.recipientTree,
      recipientErgoTreeHashHex: H.recipientHash,
      amountNanoErg: '1000000',
    },
    duplicatePreventionKeyHex: H.burn,
    canonicalJvm: {
      vectorFileSha256Hex: H.vector,
      anchorIdHex: H.anchor,
      anchorHeight: 99_995,
      anchorExtensionRootHex: H.extensionRoot,
      compilerIdentityDigestHex: H.compiler,
      sourceBaselineDigestHex: H.baseline,
      treeSha256: {
        tracker: H.trackerTree,
        unlock: H.unlockTree,
        duplicatePrevention: H.dupTree,
      },
    },
    negativeCases: {
      sourceDerived: [...WP06_SOURCE_DERIVED_NEGATIVE_CASES],
      trackerAdmission: [...AUTHENTICATED_SPV_TRACKER_NEGATIVE_CASES],
      settlement: [...AUTHENTICATED_SETTLEMENT_NEGATIVE_CASES],
    },
    boundary: {
      sourceRecollected: true,
      serializedHandoffAuthorized: false,
      trackerJvmAccepted: true,
      settlementJvmAccepted: true,
      exactChainCandidateReconstructed: false,
      nodeStatefulAcceptanceVerified: false,
      r9FinalityAuthority: true,
      gate5Closed: false,
      submitOrBroadcastEnabled: false,
      unresolvedCriticalCase: WP06_UNRESOLVED_CRITICAL_CASE,
    },
  };
}

function sourceBoundResult(): any {
  const compilation = {
    compilerIdentityDigestHex: H.compiler,
    sourceBaselineDigestHex: H.baseline,
    treeSha256: {
      tracker: H.trackerTree,
      unlock: H.unlockTree,
      duplicatePrevention: H.dupTree,
    },
  };
  const report = (mode: 'tracker' | 'settlement') => ({
    mode,
    serializationRoundTrip: true,
    allInputsAccepted: true,
    nodeStatefulAcceptance: false,
    broadcastPerformed: false,
    gate5Closed: false,
    canonicalCompilation: structuredClone(compilation),
  });
  return {
    sourceToTrackerHandoff: {
      sourceBindings: {
        ...workerSummary().source,
        trackerAdmissionTransactionIdHex: 'aa'.repeat(32),
      },
      canonicalHeaderVector: {
        fileSha256Hex: H.vector,
        anchorIdHex: H.anchor,
        anchorHeight: 99_995,
        anchorExtensionRootHex: H.extensionRoot,
      },
      burnProofBundle: {
        proof: {
          bridgeEventRootHex: H.root,
          leaf: {
            sidechainIdHex: H.sidechain,
            sidechainBlockHashHex: H.block,
            burnIdHex: H.burn,
            assetIdHex: H.asset,
            sidechainTxHashHex: H.eventTransaction,
            eventIndex: 4,
            recipientErgoTreeHashHex: H.recipientHash,
            amountNanoErg: '1000000',
          },
        },
      },
      aggregateFinalityProof: {
        verifierProfileIdHex: H.verifierExecutable,
      },
      nativeBuildIdentity: {
        verifierExecutableSha256Hex: H.verifierExecutable,
        codecExecutableSha256Hex: H.codecExecutable,
      },
      targetBurn: {
        sidechainTxHashHex: H.eventTransaction,
        eventIndex: 4,
        recipientErgoTreeHex: H.recipientTree,
        recipientErgoTreeHashHex: H.recipientHash,
        amountNanoErg: '1000000',
      },
      sourceNegativeCases: [...WP06_SOURCE_DERIVED_NEGATIVE_CASES],
      negativeCases: [...AUTHENTICATED_SPV_TRACKER_NEGATIVE_CASES],
      trackerAdmissionJvmConformanceReport: report('tracker'),
      boundary: {
        sourceDerivedPublicFixture: true,
        sourceBoundPinnedJvmTrackerReplayVerified: true,
        r9FinalityAuthority: true,
        gate5Closed: false,
        submitOrBroadcastEnabled: false,
      },
    },
    recipientErgoTreeHex: H.recipientTree,
    payoutAmountNanoErg: '1000000',
    duplicatePreventionKeyHex: H.burn,
    trackerDataInputBoxId: 'bb'.repeat(32),
    signedTransaction: { id: 'cc'.repeat(32) },
    negativeCases: [...AUTHENTICATED_SETTLEMENT_NEGATIVE_CASES],
    jvmConformanceReport: report('settlement'),
    boundary: {
      sourceBoundPinnedJvmReplayVerified: true,
      nodeStatefulAcceptanceVerified: false,
      r9FinalityAuthority: true,
      gate5Closed: false,
      submitOrBroadcastEnabled: false,
    },
  };
}

describe('WP-06 fixture-backed lifecycle', () => {
  it('builds and validates a semantic-only worker summary', () => {
    const summary = buildWp06FixtureLifecycleWorkerSummary(sourceBoundResult());
    expect(() => assertWp06FixtureLifecycleWorkerSummary(summary)).not.toThrow();
    expect(summary).toEqual(workerSummary());
    expect(JSON.stringify(summary)).not.toMatch(/transactionId|boxId|signedTransaction|processId|\bpid\b/i);
  });

  it('rejects any changed negative-case matrix', () => {
    for (const key of ['sourceDerived', 'trackerAdmission', 'settlement'] as const) {
      const changed: any = structuredClone(workerSummary());
      changed.negativeCases[key][0] += ' changed';
      expect(() => assertWp06FixtureLifecycleWorkerSummary(changed), key).toThrow(/negative cases/i);
    }
  });

  it('rejects changed or additional boundary claims', () => {
    for (const key of Object.keys(workerSummary().boundary)) {
      const changed: any = structuredClone(workerSummary());
      changed.boundary[key] = changed.boundary[key] === true
        ? false
        : changed.boundary[key] === false
          ? true
          : 'resolved';
      expect(() => assertWp06FixtureLifecycleWorkerSummary(changed), key).toThrow();
    }
    const additional: any = structuredClone(workerSummary());
    additional.boundary.nodeAccepted = true;
    expect(() => assertWp06FixtureLifecycleWorkerSummary(additional)).toThrow(/allowlist/i);
  });

  it('accepts identical semantic summaries from two distinct process IDs', () => {
    const report = aggregateWp06FixtureLifecycleRuns([
      { pid: 1001, summary: workerSummary() },
      { pid: 1002, summary: structuredClone(workerSummary()) },
    ]);
    expect(report.lifecycle).toEqual({
      freshProcessRuns: 2,
      distinctFreshProcessesVerified: true,
      sourceRecollectedEachRun: true,
      semanticIdentityStableAcrossRestart: true,
      serializedHandoffAuthorizesSettlement: false,
      exactChainCandidateReconstructed: false,
      nodeStatefulAcceptanceVerified: false,
      r9FinalityAuthority: true,
      gate5Closed: false,
      submitOrBroadcastEnabled: false,
      unresolvedCriticalCases: [WP06_UNRESOLVED_CRITICAL_CASE],
    });
  });

  it('rejects process reuse and semantic drift', () => {
    expect(() => aggregateWp06FixtureLifecycleRuns([
      { pid: 1001, summary: workerSummary() },
      { pid: 1001, summary: workerSummary() },
    ])).toThrow(/distinct/i);

    const drifted = workerSummary();
    drifted.source.bridgeEventRootHex = 'ff'.repeat(32);
    expect(() => aggregateWp06FixtureLifecycleRuns([
      { pid: 1001, summary: workerSummary() },
      { pid: 1002, summary: drifted },
    ])).toThrow(/drifted.*\$\.source\.bridgeEventRootHex/i);
  });

  it('uses an injected runner twice and omits ephemeral process data from the report', async () => {
    let invocation = 0;
    const fixtureRoot = resolve('wp06-fixture-lifecycle-test');
    const nodeExecutable = resolve(fixtureRoot, 'node', 'node.exe');
    const tsxCli = resolve(fixtureRoot, 'relayer', 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const report = await runWp06FixtureBackedLifecycle({
      frontierSourcePath: resolve(fixtureRoot, 'frontier'),
      ergoSourcePath: resolve(fixtureRoot, 'ergo'),
      cargoExecutablePath: resolve(fixtureRoot, 'tools', 'cargo.exe'),
      rustcExecutablePath: resolve(fixtureRoot, 'tools', 'rustc.exe'),
      gitExecutablePath: resolve(fixtureRoot, 'tools', 'git.exe'),
    }, {
      relayerRoot: resolve(fixtureRoot, 'relayer'),
      processExecutablePath: nodeExecutable,
      tsxCliPath: tsxCli,
      workerScriptPath: resolve(fixtureRoot, 'relayer', 'src', 'scripts', 'spikes', 'spike17.ts'),
      environment: { PATH: resolve(fixtureRoot, 'safe-path'), UNLISTED_SETTING: 'excluded' },
      processRunner: async (command, args, options) => {
        invocation += 1;
        expect(command).toBe(nodeExecutable);
        expect(args[0]).toBe(tsxCli);
        expect(args).toContain('--worker');
        expect(options.env).toEqual({
          NO_COLOR: '1',
          PATH: resolve(fixtureRoot, 'safe-path'),
        });
        return {
          pid: 2000 + invocation,
          exitCode: 0,
          stdout: `noise\n${WP06_FIXTURE_LIFECYCLE_WORKER_SENTINEL}${JSON.stringify(workerSummary())}\n`,
          stderr: '',
        };
      },
    });
    expect(invocation).toBe(2);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/transactionId|boxId|signedTransaction|processId|\bpid\b/i);
    expect(serialized).not.toContain('C:\\');
  });

  it('copies only allowlisted environment variables', () => {
    expect(buildWp06SafeChildEnvironment({
      Path: 'C:\\tools',
      JAVA_HOME: 'C:\\java',
      NODE_OPTIONS: '--require unexpected.js',
      PRIVATE_TOKEN: 'secret',
    })).toEqual({
      NO_COLOR: '1',
      PATH: 'C:\\tools',
      JAVA_HOME: 'C:\\java',
    });
  });

  it('bounds actual child runtime and aggregate output through verified tree supervision', async () => {
    const options = {
      cwd: dirname(fileURLToPath(import.meta.url)),
      env: buildWp06SafeChildEnvironment(process.env),
    };
    const success = await runWp06ChildProcessWithLimits(
      process.execPath,
      ['-e', "process.stdout.write('ok'); process.stderr.write('warn');"],
      options,
      { timeoutMs: 5_000, maxOutputBytes: 1024 },
    );
    expect(success).toMatchObject({ exitCode: 0, stdout: 'ok', stderr: 'warn' });
    expect(success.pid).toBeGreaterThan(0);

    await expect(runWp06ChildProcessWithLimits(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000);'],
      options,
      { timeoutMs: 100, maxOutputBytes: 1024 },
    )).rejects.toThrow(/timed out/i);

    await expect(runWp06ChildProcessWithLimits(
      process.execPath,
      ['-e', "process.stdout.write('x'.repeat(4096)); setInterval(() => {}, 1000);"],
      options,
      { timeoutMs: 5_000, maxOutputBytes: 1024 },
    )).rejects.toThrow(/output exceeded the limit/i);
  }, 30_000);

  it('keeps the CLI source free of external-state routes and actions', () => {
    const cliPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      'scripts/spikes/spike17-wp06-fixture-backed-lifecycle.ts',
    );
    const source = readFileSync(cliPath, 'utf8');
    expect(source).not.toMatch(/\/transactions\/check/i);
    expect(source).not.toMatch(/\bsubmit\b/i);
    expect(source).not.toMatch(/\bbroadcast\b/i);
    expect(source).not.toMatch(/\bdeploy(?:ment)?\b/i);
    expect(source).not.toMatch(/better-sqlite3|\bsqlite\b|\/api\/[^'"\s]*(?:db|database)/i);
  });
});
