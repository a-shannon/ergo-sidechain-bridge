import { isDeepStrictEqual } from 'util';
import { dirname, isAbsolute, resolve } from 'path';
import { fileURLToPath } from 'url';

import { WP06_SOURCE_DERIVED_NEGATIVE_CASES } from './wp06-source-derived-fixture.js';
import { runBoundedProcess } from '../pinned-local-native-verifier-build.js';
import { AUTHENTICATED_SPV_TRACKER_NEGATIVE_CASES } from '../scripts/spikes/spike13-authenticated-spv-tracker-vm.js';
import {
  AUTHENTICATED_SETTLEMENT_NEGATIVE_CASES,
  type Wp06SourceBoundSettlementVmResult,
} from '../scripts/spikes/spike14-authenticated-settlement-full-tx-eval.js';

export const WP06_FIXTURE_LIFECYCLE_WORKER_SENTINEL =
  '@@WP06_FIXTURE_BACKED_LIFECYCLE_WORKER_V1@@';
export const WP06_FIXTURE_LIFECYCLE_WORKER_SCHEMA =
  'e2s.wp06-fixture-backed-lifecycle.worker.v1';
export const WP06_FIXTURE_LIFECYCLE_REPORT_SCHEMA =
  'e2s.wp06-fixture-backed-lifecycle.report.v1';
export const WP06_UNRESOLVED_CRITICAL_CASE = 'R9-authorized invented checkpoint';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DEFAULT_RELAYER_ROOT = resolve(MODULE_DIRECTORY, '..', '..');
const MAX_CHILD_OUTPUT_BYTES = 32 * 1024 * 1024;
const MAX_CHILD_RUNTIME_MS = 15 * 60_000;
const SAFE_CHILD_ENVIRONMENT_KEYS = Object.freeze([
  'SystemRoot',
  'WINDIR',
  'ComSpec',
  'PATH',
  'PATHEXT',
  'TEMP',
  'TMP',
  'JAVA_HOME',
  'CARGO_HOME',
  'RUSTUP_HOME',
  'USERPROFILE',
  'HOME',
  'LOCALAPPDATA',
  'APPDATA',
] as const);

export interface Wp06FixtureLifecyclePaths {
  frontierSourcePath: string;
  ergoSourcePath: string;
  cargoExecutablePath: string;
  rustcExecutablePath: string;
  gitExecutablePath: string;
}

export interface Wp06FixtureLifecycleWorkerSummary {
  schema: typeof WP06_FIXTURE_LIFECYCLE_WORKER_SCHEMA;
  source: {
    sidechainIdHex: string;
    sidechainHeight: string;
    executionBlockHashHex: string;
    bridgeEventRootHex: string;
    checkpointCommitmentHex: string;
    aggregateFinalityProofDigestHex: string;
    burnIdHex: string;
    extensionKeyHex: '0401';
    extensionRootHex: string;
    trackerKeyHex: string;
    trackerValueHex: string;
  };
  nativeExecutables: {
    verifierSha256Hex: string;
    codecSha256Hex: string;
  };
  payout: {
    assetIdHex: string;
    sidechainTransactionHashHex: string;
    eventIndex: number;
    recipientErgoTreeHex: string;
    recipientErgoTreeHashHex: string;
    amountNanoErg: string;
  };
  duplicatePreventionKeyHex: string;
  canonicalJvm: {
    vectorFileSha256Hex: string;
    anchorIdHex: string;
    anchorHeight: number;
    anchorExtensionRootHex: string;
    compilerIdentityDigestHex: string;
    sourceBaselineDigestHex: string;
    treeSha256: {
      tracker: string;
      unlock: string;
      duplicatePrevention: string;
    };
  };
  negativeCases: {
    sourceDerived: readonly string[];
    trackerAdmission: readonly string[];
    settlement: readonly string[];
  };
  boundary: {
    sourceRecollected: true;
    serializedHandoffAuthorized: false;
    trackerJvmAccepted: true;
    settlementJvmAccepted: true;
    exactChainCandidateReconstructed: false;
    nodeStatefulAcceptanceVerified: false;
    r9FinalityAuthority: true;
    gate5Closed: false;
    submitOrBroadcastEnabled: false;
    unresolvedCriticalCase: typeof WP06_UNRESOLVED_CRITICAL_CASE;
  };
}

export interface Wp06FixtureLifecycleReport {
  schema: typeof WP06_FIXTURE_LIFECYCLE_REPORT_SCHEMA;
  semanticSummary: Wp06FixtureLifecycleWorkerSummary;
  lifecycle: {
    freshProcessRuns: 2;
    distinctFreshProcessesVerified: true;
    sourceRecollectedEachRun: true;
    semanticIdentityStableAcrossRestart: true;
    serializedHandoffAuthorizesSettlement: false;
    exactChainCandidateReconstructed: false;
    nodeStatefulAcceptanceVerified: false;
    r9FinalityAuthority: true;
    gate5Closed: false;
    submitOrBroadcastEnabled: false;
    unresolvedCriticalCases: readonly [typeof WP06_UNRESOLVED_CRITICAL_CASE];
  };
}

export interface Wp06ChildProcessExecution {
  pid: number;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface Wp06ChildProcessOptions {
  cwd: string;
  env: Readonly<Record<string, string>>;
}

export type Wp06ProcessRunner = (
  command: string,
  args: readonly string[],
  options: Wp06ChildProcessOptions,
) => Promise<Wp06ChildProcessExecution>;

export interface Wp06FixtureLifecycleDependencies {
  processRunner?: Wp06ProcessRunner;
  environment?: NodeJS.ProcessEnv;
  processExecutablePath?: string;
  relayerRoot?: string;
  tsxCliPath?: string;
  workerScriptPath?: string;
}

export function buildWp06FixtureLifecycleWorkerSummary(
  result: Wp06SourceBoundSettlementVmResult,
): Wp06FixtureLifecycleWorkerSummary {
  const handoff = result?.sourceToTrackerHandoff;
  const sourceNegativeCases = handoff?.sourceNegativeCases;
  const source = handoff?.sourceBindings;
  const leaf = handoff?.burnProofBundle?.proof?.leaf;
  const targetBurn = handoff?.targetBurn;
  const trackerJvm = handoff?.trackerAdmissionJvmConformanceReport;
  const settlementJvm = result?.jvmConformanceReport;
  if (!handoff || !source || !leaf || !targetBurn || !trackerJvm || !settlementJvm) {
    throw new Error('WP-06 lifecycle result is missing semantic source or JVM evidence');
  }

  requireEqual(leaf.sidechainIdHex, source.sidechainIdHex, 'source sidechain');
  requireEqual(leaf.sidechainBlockHashHex, source.executionBlockHashHex, 'source block');
  requireEqual(handoff.burnProofBundle.proof.bridgeEventRootHex, source.bridgeEventRootHex, 'source root');
  requireEqual(leaf.burnIdHex, source.burnIdHex, 'source burn');
  requireEqual(targetBurn.sidechainTxHashHex, leaf.sidechainTxHashHex, 'payout event transaction');
  requireEqual(targetBurn.eventIndex, leaf.eventIndex, 'payout event index');
  requireEqual(targetBurn.recipientErgoTreeHashHex, leaf.recipientErgoTreeHashHex, 'payout recipient hash');
  requireEqual(targetBurn.amountNanoErg, leaf.amountNanoErg, 'payout amount');
  requireEqual(result.recipientErgoTreeHex, targetBurn.recipientErgoTreeHex, 'settlement recipient');
  requireEqual(result.payoutAmountNanoErg, leaf.amountNanoErg, 'settlement amount');
  requireEqual(result.duplicatePreventionKeyHex, source.burnIdHex, 'DUP key');
  requireEqual(source.extensionKeyHex, '0401', 'extension key');
  requireEqual(
    handoff.nativeBuildIdentity.verifierExecutableSha256Hex,
    handoff.aggregateFinalityProof.verifierProfileIdHex,
    'native verifier profile',
  );

  assertJvmStage(trackerJvm, 'tracker', 'tracker JVM');
  assertJvmStage(settlementJvm, 'settlement', 'settlement JVM');
  requireEqual(
    trackerJvm.canonicalCompilation.compilerIdentityDigestHex,
    settlementJvm.canonicalCompilation.compilerIdentityDigestHex,
    'compiler identity',
  );
  requireEqual(
    trackerJvm.canonicalCompilation.sourceBaselineDigestHex,
    settlementJvm.canonicalCompilation.sourceBaselineDigestHex,
    'source baseline',
  );
  for (const role of ['tracker', 'unlock', 'duplicatePrevention'] as const) {
    requireEqual(
      trackerJvm.canonicalCompilation.treeSha256[role],
      settlementJvm.canonicalCompilation.treeSha256[role],
      `${role} tree`,
    );
  }

  assertExactArray(
    sourceNegativeCases,
    WP06_SOURCE_DERIVED_NEGATIVE_CASES,
    'source-derived negative cases',
  );
  assertExactArray(
    handoff.negativeCases,
    AUTHENTICATED_SPV_TRACKER_NEGATIVE_CASES,
    'tracker negative cases',
  );
  assertExactArray(
    result.negativeCases,
    AUTHENTICATED_SETTLEMENT_NEGATIVE_CASES,
    'settlement negative cases',
  );
  assertResultBoundaries(result);

  const summary: Wp06FixtureLifecycleWorkerSummary = {
    schema: WP06_FIXTURE_LIFECYCLE_WORKER_SCHEMA,
    source: {
      sidechainIdHex: source.sidechainIdHex,
      sidechainHeight: source.sidechainHeight,
      executionBlockHashHex: source.executionBlockHashHex,
      bridgeEventRootHex: source.bridgeEventRootHex,
      checkpointCommitmentHex: source.checkpointCommitmentHex,
      aggregateFinalityProofDigestHex: source.aggregateFinalityProofDigestHex,
      burnIdHex: source.burnIdHex,
      extensionKeyHex: source.extensionKeyHex,
      extensionRootHex: source.extensionRootHex,
      trackerKeyHex: source.trackerKeyHex,
      trackerValueHex: source.trackerValueHex,
    },
    nativeExecutables: {
      verifierSha256Hex: handoff.nativeBuildIdentity.verifierExecutableSha256Hex,
      codecSha256Hex: handoff.nativeBuildIdentity.codecExecutableSha256Hex,
    },
    payout: {
      assetIdHex: leaf.assetIdHex,
      sidechainTransactionHashHex: leaf.sidechainTxHashHex,
      eventIndex: leaf.eventIndex,
      recipientErgoTreeHex: targetBurn.recipientErgoTreeHex,
      recipientErgoTreeHashHex: leaf.recipientErgoTreeHashHex,
      amountNanoErg: leaf.amountNanoErg,
    },
    duplicatePreventionKeyHex: result.duplicatePreventionKeyHex,
    canonicalJvm: {
      vectorFileSha256Hex: handoff.canonicalHeaderVector.fileSha256Hex,
      anchorIdHex: handoff.canonicalHeaderVector.anchorIdHex,
      anchorHeight: handoff.canonicalHeaderVector.anchorHeight,
      anchorExtensionRootHex: handoff.canonicalHeaderVector.anchorExtensionRootHex,
      compilerIdentityDigestHex: settlementJvm.canonicalCompilation.compilerIdentityDigestHex,
      sourceBaselineDigestHex: settlementJvm.canonicalCompilation.sourceBaselineDigestHex,
      treeSha256: {
        tracker: settlementJvm.canonicalCompilation.treeSha256.tracker,
        unlock: settlementJvm.canonicalCompilation.treeSha256.unlock,
        duplicatePrevention:
          settlementJvm.canonicalCompilation.treeSha256.duplicatePrevention,
      },
    },
    negativeCases: {
      sourceDerived: [...sourceNegativeCases],
      trackerAdmission: [...handoff.negativeCases],
      settlement: [...result.negativeCases],
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
  assertWp06FixtureLifecycleWorkerSummary(summary);
  return deepFreeze(summary);
}

export function assertWp06FixtureLifecycleWorkerSummary(
  value: unknown,
): asserts value is Wp06FixtureLifecycleWorkerSummary {
  const summary = exactRecord(value, 'worker summary', [
    'schema', 'source', 'nativeExecutables', 'payout', 'duplicatePreventionKeyHex', 'canonicalJvm',
    'negativeCases', 'boundary',
  ]);
  requireEqual(summary.schema, WP06_FIXTURE_LIFECYCLE_WORKER_SCHEMA, 'worker schema');

  const source = exactRecord(summary.source, 'source summary', [
    'sidechainIdHex', 'sidechainHeight', 'executionBlockHashHex', 'bridgeEventRootHex',
    'checkpointCommitmentHex', 'aggregateFinalityProofDigestHex', 'burnIdHex',
    'extensionKeyHex', 'extensionRootHex', 'trackerKeyHex', 'trackerValueHex',
  ]);
  fixedHex(source.sidechainIdHex, 32, 'source sidechain ID');
  decimalString(source.sidechainHeight, false, 'source sidechain height');
  fixedHex(source.executionBlockHashHex, 32, 'source block hash');
  fixedHex(source.bridgeEventRootHex, 32, 'source event root');
  fixedHex(source.checkpointCommitmentHex, 32, 'source checkpoint commitment');
  fixedHex(source.aggregateFinalityProofDigestHex, 32, 'source proof digest');
  fixedHex(source.burnIdHex, 32, 'source burn ID');
  requireEqual(source.extensionKeyHex, '0401', 'source extension key');
  fixedHex(source.extensionRootHex, 32, 'source extension root');
  fixedHex(source.trackerKeyHex, 32, 'source tracker key');
  fixedHex(source.trackerValueHex, 264, 'source tracker value');

  const nativeExecutables = exactRecord(summary.nativeExecutables, 'native executables', [
    'verifierSha256Hex', 'codecSha256Hex',
  ]);
  fixedHex(nativeExecutables.verifierSha256Hex, 32, 'native verifier executable digest');
  fixedHex(nativeExecutables.codecSha256Hex, 32, 'native codec executable digest');

  const payout = exactRecord(summary.payout, 'payout summary', [
    'assetIdHex', 'sidechainTransactionHashHex', 'eventIndex', 'recipientErgoTreeHex',
    'recipientErgoTreeHashHex', 'amountNanoErg',
  ]);
  fixedHex(payout.assetIdHex, 32, 'payout asset ID');
  fixedHex(payout.sidechainTransactionHashHex, 32, 'payout event transaction');
  safeInteger(payout.eventIndex, 'payout event index');
  nonEmptyHex(payout.recipientErgoTreeHex, 'payout recipient tree');
  fixedHex(payout.recipientErgoTreeHashHex, 32, 'payout recipient tree hash');
  decimalString(payout.amountNanoErg, true, 'payout amount');
  fixedHex(summary.duplicatePreventionKeyHex, 32, 'DUP key');

  const jvm = exactRecord(summary.canonicalJvm, 'canonical JVM summary', [
    'vectorFileSha256Hex', 'anchorIdHex', 'anchorHeight', 'anchorExtensionRootHex',
    'compilerIdentityDigestHex', 'sourceBaselineDigestHex', 'treeSha256',
  ]);
  fixedHex(jvm.vectorFileSha256Hex, 32, 'canonical JVM vector hash');
  fixedHex(jvm.anchorIdHex, 32, 'canonical JVM anchor ID');
  safeInteger(jvm.anchorHeight, 'canonical JVM anchor height');
  fixedHex(jvm.anchorExtensionRootHex, 32, 'canonical JVM anchor root');
  fixedHex(jvm.compilerIdentityDigestHex, 32, 'canonical JVM compiler identity');
  fixedHex(jvm.sourceBaselineDigestHex, 32, 'canonical JVM source baseline');
  const trees = exactRecord(jvm.treeSha256, 'canonical JVM tree hashes', [
    'tracker', 'unlock', 'duplicatePrevention',
  ]);
  fixedHex(trees.tracker, 32, 'tracker tree hash');
  fixedHex(trees.unlock, 32, 'unlock tree hash');
  fixedHex(trees.duplicatePrevention, 32, 'DUP tree hash');

  const negativeCases = exactRecord(summary.negativeCases, 'negative cases', [
    'sourceDerived', 'trackerAdmission', 'settlement',
  ]);
  assertExactArray(
    negativeCases.sourceDerived,
    WP06_SOURCE_DERIVED_NEGATIVE_CASES,
    'source-derived negative cases',
  );
  assertExactArray(
    negativeCases.trackerAdmission,
    AUTHENTICATED_SPV_TRACKER_NEGATIVE_CASES,
    'tracker negative cases',
  );
  assertExactArray(
    negativeCases.settlement,
    AUTHENTICATED_SETTLEMENT_NEGATIVE_CASES,
    'settlement negative cases',
  );

  const boundary = exactRecord(summary.boundary, 'worker boundary', [
    'sourceRecollected', 'serializedHandoffAuthorized', 'trackerJvmAccepted',
    'settlementJvmAccepted', 'exactChainCandidateReconstructed',
    'nodeStatefulAcceptanceVerified', 'r9FinalityAuthority', 'gate5Closed',
    'submitOrBroadcastEnabled', 'unresolvedCriticalCase',
  ]);
  requireEqual(boundary.sourceRecollected, true, 'source recollection boundary');
  requireEqual(boundary.serializedHandoffAuthorized, false, 'serialized handoff boundary');
  requireEqual(boundary.trackerJvmAccepted, true, 'tracker JVM boundary');
  requireEqual(boundary.settlementJvmAccepted, true, 'settlement JVM boundary');
  requireEqual(boundary.exactChainCandidateReconstructed, false, 'chain candidate boundary');
  requireEqual(boundary.nodeStatefulAcceptanceVerified, false, 'node stateful boundary');
  requireEqual(boundary.r9FinalityAuthority, true, 'R9 finality boundary');
  requireEqual(boundary.gate5Closed, false, 'Gate 5 boundary');
  requireEqual(boundary.submitOrBroadcastEnabled, false, 'external mutation boundary');
  requireEqual(
    boundary.unresolvedCriticalCase,
    WP06_UNRESOLVED_CRITICAL_CASE,
    'unresolved critical case',
  );
}

export function aggregateWp06FixtureLifecycleRuns(
  runs: readonly Readonly<{ pid: number; summary: unknown }>[],
): Wp06FixtureLifecycleReport {
  if (runs.length !== 2) throw new Error('WP-06 lifecycle requires exactly two fresh processes');
  for (const [index, run] of runs.entries()) {
    if (!Number.isSafeInteger(run.pid) || run.pid <= 0) {
      throw new Error(`WP-06 lifecycle process ${index + 1} did not expose a valid PID`);
    }
    assertWp06FixtureLifecycleWorkerSummary(run.summary);
  }
  if (runs[0].pid === runs[1].pid) {
    throw new Error('WP-06 lifecycle requires distinct child process IDs');
  }
  if (!isDeepStrictEqual(runs[0].summary, runs[1].summary)) {
    const differencePath = firstSemanticDifferencePath(runs[0].summary, runs[1].summary);
    throw new Error(
      `WP-06 lifecycle semantic identity drifted between fresh processes at ${differencePath}`,
    );
  }
  const semanticSummary = runs[0].summary;
  assertWp06FixtureLifecycleWorkerSummary(semanticSummary);
  const report: Wp06FixtureLifecycleReport = {
    schema: WP06_FIXTURE_LIFECYCLE_REPORT_SCHEMA,
    semanticSummary: structuredClone(semanticSummary),
    lifecycle: {
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
    },
  };
  assertWp06FixtureLifecycleReport(report);
  return deepFreeze(report);
}

export function assertWp06FixtureLifecycleReport(
  value: unknown,
): asserts value is Wp06FixtureLifecycleReport {
  const report = exactRecord(value, 'lifecycle report', [
    'schema', 'semanticSummary', 'lifecycle',
  ]);
  requireEqual(report.schema, WP06_FIXTURE_LIFECYCLE_REPORT_SCHEMA, 'report schema');
  assertWp06FixtureLifecycleWorkerSummary(report.semanticSummary);
  const lifecycle = exactRecord(report.lifecycle, 'lifecycle evidence', [
    'freshProcessRuns', 'distinctFreshProcessesVerified', 'sourceRecollectedEachRun',
    'semanticIdentityStableAcrossRestart', 'serializedHandoffAuthorizesSettlement',
    'exactChainCandidateReconstructed', 'nodeStatefulAcceptanceVerified',
    'r9FinalityAuthority', 'gate5Closed', 'submitOrBroadcastEnabled',
    'unresolvedCriticalCases',
  ]);
  requireEqual(lifecycle.freshProcessRuns, 2, 'fresh process count');
  requireEqual(lifecycle.distinctFreshProcessesVerified, true, 'distinct process evidence');
  requireEqual(lifecycle.sourceRecollectedEachRun, true, 'source recollection evidence');
  requireEqual(
    lifecycle.semanticIdentityStableAcrossRestart,
    true,
    'semantic stability evidence',
  );
  requireEqual(
    lifecycle.serializedHandoffAuthorizesSettlement,
    false,
    'serialized handoff lifecycle boundary',
  );
  requireEqual(
    lifecycle.exactChainCandidateReconstructed,
    false,
    'chain candidate lifecycle boundary',
  );
  requireEqual(
    lifecycle.nodeStatefulAcceptanceVerified,
    false,
    'node stateful lifecycle boundary',
  );
  requireEqual(lifecycle.r9FinalityAuthority, true, 'R9 lifecycle boundary');
  requireEqual(lifecycle.gate5Closed, false, 'Gate 5 lifecycle boundary');
  requireEqual(
    lifecycle.submitOrBroadcastEnabled,
    false,
    'external mutation lifecycle boundary',
  );
  assertExactArray(
    lifecycle.unresolvedCriticalCases,
    [WP06_UNRESOLVED_CRITICAL_CASE],
    'unresolved critical cases',
  );
}

export async function runWp06FixtureBackedLifecycle(
  input: Wp06FixtureLifecyclePaths,
  dependencies: Wp06FixtureLifecycleDependencies = {},
): Promise<Wp06FixtureLifecycleReport> {
  assertAbsoluteLifecyclePaths(input);
  const relayerRoot = dependencies.relayerRoot ?? DEFAULT_RELAYER_ROOT;
  const processExecutablePath = dependencies.processExecutablePath ?? process.execPath;
  const tsxCliPath = dependencies.tsxCliPath
    ?? resolve(relayerRoot, 'node_modules/tsx/dist/cli.mjs');
  const workerScriptPath = dependencies.workerScriptPath
    ?? resolve(relayerRoot, 'src/scripts/spikes/spike17-wp06-fixture-backed-lifecycle.ts');
  for (const [label, value] of [
    ['relayer root', relayerRoot],
    ['process executable', processExecutablePath],
    ['tsx CLI', tsxCliPath],
    ['worker script', workerScriptPath],
  ] as const) {
    if (!isAbsolute(value)) throw new Error(`WP-06 lifecycle ${label} must be absolute`);
  }

  const args = [
    tsxCliPath,
    workerScriptPath,
    '--worker',
    '--frontier-source', input.frontierSourcePath,
    '--ergo-source', input.ergoSourcePath,
    '--cargo', input.cargoExecutablePath,
    '--rustc', input.rustcExecutablePath,
    '--git', input.gitExecutablePath,
  ] as const;
  const options: Wp06ChildProcessOptions = {
    cwd: relayerRoot,
    env: buildWp06SafeChildEnvironment(dependencies.environment ?? process.env),
  };
  const runner = dependencies.processRunner ?? runWp06ChildProcess;
  const runs: Array<{ pid: number; summary: Wp06FixtureLifecycleWorkerSummary }> = [];
  for (let index = 0; index < 2; index += 1) {
    const execution = await runner(processExecutablePath, args, options);
    if (execution.exitCode !== 0) {
      throw new Error(`WP-06 lifecycle child ${index + 1} exited with code ${execution.exitCode}`);
    }
    runs.push({
      pid: execution.pid,
      summary: parseWp06FixtureLifecycleWorkerOutput(execution.stdout),
    });
  }
  return aggregateWp06FixtureLifecycleRuns(runs);
}

export function parseWp06FixtureLifecycleWorkerOutput(
  output: string,
): Wp06FixtureLifecycleWorkerSummary {
  const sentinelLines = output
    .split(/\r?\n/)
    .filter(line => line.startsWith(WP06_FIXTURE_LIFECYCLE_WORKER_SENTINEL));
  if (sentinelLines.length !== 1) {
    throw new Error('WP-06 lifecycle child must emit exactly one worker sentinel');
  }
  const payload = sentinelLines[0].slice(WP06_FIXTURE_LIFECYCLE_WORKER_SENTINEL.length);
  if (Buffer.byteLength(payload, 'utf8') > 1024 * 1024) {
    throw new Error('WP-06 lifecycle worker summary exceeds 1 MiB');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error('WP-06 lifecycle worker sentinel contains invalid JSON');
  }
  assertWp06FixtureLifecycleWorkerSummary(parsed);
  return deepFreeze(parsed);
}

export function buildWp06SafeChildEnvironment(
  source: NodeJS.ProcessEnv,
): Readonly<Record<string, string>> {
  const entries = Object.entries(source);
  const allowed: Record<string, string> = { NO_COLOR: '1' };
  for (const canonicalKey of SAFE_CHILD_ENVIRONMENT_KEYS) {
    const match = entries.find(([key, value]) =>
      key.toLowerCase() === canonicalKey.toLowerCase() && typeof value === 'string');
    if (match) allowed[canonicalKey] = match[1]!;
  }
  return Object.freeze(allowed);
}

export interface Wp06ChildProcessLimits {
  timeoutMs: number;
  maxOutputBytes: number;
}

export const runWp06ChildProcess: Wp06ProcessRunner = (
  command,
  args,
  options,
) => runWp06ChildProcessWithLimits(command, args, options, {
  timeoutMs: MAX_CHILD_RUNTIME_MS,
  maxOutputBytes: MAX_CHILD_OUTPUT_BYTES,
});

export async function runWp06ChildProcessWithLimits(
  command: string,
  args: readonly string[],
  options: Wp06ChildProcessOptions,
  limits: Wp06ChildProcessLimits,
): Promise<Wp06ChildProcessExecution> {
  const result = await runBoundedProcess({
    executablePath: command,
    args,
    cwd: options.cwd,
    env: { ...options.env },
    timeoutMs: limits.timeoutMs,
    maxOutputBytes: limits.maxOutputBytes,
    label: 'WP-06 lifecycle child',
  });
  return {
    pid: result.pid,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

export function assertAbsoluteLifecyclePaths(input: Wp06FixtureLifecyclePaths): void {
  for (const [label, value] of [
    ['Frontier source', input?.frontierSourcePath],
    ['Ergo source', input?.ergoSourcePath],
    ['Cargo executable', input?.cargoExecutablePath],
    ['rustc executable', input?.rustcExecutablePath],
    ['Git executable', input?.gitExecutablePath],
  ] as const) {
    if (typeof value !== 'string' || !isAbsolute(value)) {
      throw new Error(`${label} path must be absolute`);
    }
  }
}

function assertJvmStage(
  report: Wp06SourceBoundSettlementVmResult['jvmConformanceReport'],
  mode: 'tracker' | 'settlement',
  label: string,
): void {
  if (
    report.mode !== mode
    || report.serializationRoundTrip !== true
    || report.allInputsAccepted !== true
    || report.nodeStatefulAcceptance !== false
    || report.broadcastPerformed !== false
    || report.gate5Closed !== false
  ) {
    throw new Error(`${label} crossed its accepted offline boundary`);
  }
}

function assertResultBoundaries(result: Wp06SourceBoundSettlementVmResult): void {
  const handoff = result.sourceToTrackerHandoff;
  if (
    handoff.boundary.sourceDerivedPublicFixture !== true
    || handoff.boundary.sourceBoundPinnedJvmTrackerReplayVerified !== true
    || handoff.boundary.r9FinalityAuthority !== true
    || handoff.boundary.gate5Closed !== false
    || handoff.boundary.submitOrBroadcastEnabled !== false
    || result.boundary.sourceBoundPinnedJvmReplayVerified !== true
    || result.boundary.nodeStatefulAcceptanceVerified !== false
    || result.boundary.r9FinalityAuthority !== true
    || result.boundary.gate5Closed !== false
    || result.boundary.submitOrBroadcastEnabled !== false
  ) {
    throw new Error('WP-06 lifecycle result crossed its offline authority boundary');
  }
}

function exactRecord(
  value: unknown,
  label: string,
  expectedKeys: readonly string[],
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  const requiredKeys = [...expectedKeys].sort();
  if (!isDeepStrictEqual(actualKeys, requiredKeys)) {
    throw new Error(`${label} fields do not match the semantic allowlist`);
  }
  return record;
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)) {
    throw new Error(`${label} must be lowercase ${bytes}-byte hex`);
  }
  return value;
}

function nonEmptyHex(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{2})+$/.test(value)) {
    throw new Error(`${label} must be non-empty lowercase even-length hex`);
  }
  return value;
}

function decimalString(value: unknown, positive: boolean, label: string): string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical decimal string`);
  }
  if (positive && BigInt(value) <= 0n) throw new Error(`${label} must be positive`);
  return value;
}

function safeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return Number(value);
}

function assertExactArray(
  value: unknown,
  expected: readonly string[],
  label: string,
): asserts value is readonly string[] {
  if (!Array.isArray(value) || !isDeepStrictEqual(value, expected)) {
    throw new Error(`${label} must match the exact ordered matrix`);
  }
}

function requireEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label} drifted`);
}

function firstSemanticDifferencePath(left: unknown, right: unknown, path = '$'): string {
  if (isDeepStrictEqual(left, right)) return path;
  if (Array.isArray(left) && Array.isArray(right)) {
    const limit = Math.max(left.length, right.length);
    for (let index = 0; index < limit; index += 1) {
      if (!isDeepStrictEqual(left[index], right[index])) {
        return firstSemanticDifferencePath(left[index], right[index], `${path}[${index}]`);
      }
    }
  }
  if (
    typeof left === 'object'
    && left !== null
    && !Array.isArray(left)
    && typeof right === 'object'
    && right !== null
    && !Array.isArray(right)
  ) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].sort();
    for (const key of keys) {
      if (!isDeepStrictEqual(leftRecord[key], rightRecord[key])) {
        return firstSemanticDifferencePath(leftRecord[key], rightRecord[key], `${path}.${key}`);
      }
    }
  }
  return path;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}
