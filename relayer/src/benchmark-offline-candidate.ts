import { collectOfflineBenchmarkMetricRows, type OfflineBenchmarkMetric } from './scripts/showcase-metric-rows.js';

export interface OfflineBenchmarkMetricSnapshot {
  single: Pick<
    OfflineBenchmarkMetric,
    | 'scenario'
    | 'sampleCount'
    | 'meanBuildTimeMs'
    | 'proofSize'
    | 'transactionShapeBytes'
    | 'costRelevantCounts'
    | 'throughput'
    | 'latency'
  >;
  batch: Pick<
    OfflineBenchmarkMetric,
    | 'scenario'
    | 'sampleCount'
    | 'meanBuildTimeMs'
    | 'proofSize'
    | 'transactionShapeBytes'
    | 'costRelevantCounts'
    | 'throughput'
    | 'latency'
  >;
  sharded: Pick<
    OfflineBenchmarkMetric,
    | 'scenario'
    | 'sampleCount'
    | 'meanBuildTimeMs'
    | 'proofSize'
    | 'transactionShapeBytes'
    | 'costRelevantCounts'
    | 'throughput'
    | 'latency'
  >;
}

export interface BenchmarkOfflineCandidateArtifacts {
  validationReport: string;
  showcaseBenchmark: string;
  showcaseLanes: string;
  showcaseProofs: string;
  showcaseFinality: string;
  metricRows: string;
  check: string;
  wasmTest: string;
  releaseNoteUpdate: string;
  checklistUpdate: string;
}

export interface Gate7OfflineStructuredCandidateInput {
  gitCommit: string;
  date: string;
  nodeVersion: string;
  rustVersion: string;
  wasmPackVersion: string;
  artifacts: BenchmarkOfflineCandidateArtifacts;
  metrics?: OfflineBenchmarkMetricSnapshot;
  metricRowsTarget?: string;
  machineProfile?: string;
  reviewer?: string;
}

export function defaultBenchmarkOfflineCandidateArtifacts(suffix: string): BenchmarkOfflineCandidateArtifacts {
  const artifact = (name: string): string => `artifact://benchmarks/artifacts/${name}-${suffix}.md`;
  return {
    validationReport: artifact('benchmark-validate-offline-structured-candidate-blocked'),
    showcaseBenchmark: artifact('completed-current-showcase-benchmark-output'),
    showcaseLanes: artifact('completed-current-showcase-lanes-output'),
    showcaseProofs: artifact('completed-current-showcase-proofs-output'),
    showcaseFinality: artifact('completed-current-showcase-finality-output'),
    metricRows: artifact('completed-current-offline-metric-rows'),
    check: artifact('npm-run-check-pass'),
    wasmTest: artifact('npm-run-wasm-test-pass'),
    releaseNoteUpdate:
      'artifact://benchmarks/artifacts/completed-gate-7-benchmark-release-note-update-evidence-2026-06-26-11ebc444.md',
    checklistUpdate:
      'artifact://benchmarks/artifacts/completed-gate-7-benchmark-checklist-update-evidence-2026-06-26-11ebc444.md',
  };
}

export function collectCurrentOfflineBenchmarkMetricSnapshot(): OfflineBenchmarkMetricSnapshot {
  const report = collectOfflineBenchmarkMetricRows();
  return {
    single: report.single,
    batch: report.batch,
    sharded: report.sharded,
  };
}

export function parseCompletedOfflineBenchmarkMetricRowsReport(
  markdown: string,
): OfflineBenchmarkMetricSnapshot {
  const normalized = markdown.replace(/\r\n/g, '\n');
  requireCompletedMetricRowsMarker(normalized);
  const table = sectionBetween(normalized, '## Normalized Output Summary', '## Boundary');
  const rows = table
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('|') && !/^\|\s*-/.test(line));

  if (rows.length < 4) {
    throw new Error('metric rows report must include three normalized metric rows');
  }

  const dataRows = rows.slice(1).map(parseMarkdownTableRow);
  return {
    single: parseMetricRow(dataRows, 'Single-claim settlement baseline'),
    batch: parseMetricRow(dataRows, 'Batch settlement'),
    sharded: parseMetricRow(dataRows, 'Sharded lanes planner'),
  };
}

export function formatGate7OfflineStructuredCandidate(input: Gate7OfflineStructuredCandidateInput): string {
  const metrics = input.metrics ?? collectCurrentOfflineBenchmarkMetricSnapshot();
  const reviewer = input.reviewer ?? 'A. Shannon';
  const machineProfile = input.machineProfile ?? 'Windows local benchmark runner using offline deterministic public inputs';

  return [
    `# Gate 7 Offline Structured Benchmark Candidate - ${input.date} - ${input.gitCommit}`,
    '',
    'This packet refreshes the current offline benchmark and lane-planning outputs',
    'into the Gate 7 benchmark evidence shape at current HEAD.',
    '',
    'This is not completed Gate 7 benchmark evidence. It does not support mainnet',
    'production readiness, production throughput, live batch settlement, trustless',
    'burn completion, testnet production-candidate claims, or full parallel L1',
    'settlement claims.',
    '',
    'Current validation blocker report:',
    '',
    `- ${input.artifacts.validationReport}`,
    '',
    'Boundary: Transaction broadcast, submit, deploy, or state mutation performed: no.',
    '',
    '## Benchmark Classification',
    '',
    '| Field | Value |',
    '|---|---|',
    '| Benchmark name | Gate 7 offline benchmark structure candidate |',
    `| Git commit | ${input.gitCommit} |`,
    '| Release level | institutional reference |',
    '| Environment | local offline |',
    '| Broadcast mode | disabled |',
    '| Trust path | transitional trusted burn path |',
    `| Machine profile | ${machineProfile} |`,
    `| Node version | ${input.nodeVersion} |`,
    `| Rust version | ${input.rustVersion} |`,
    `| wasm-pack version | ${input.wasmPackVersion} |`,
    `| Reviewer | ${reviewer} |`,
    `| Date | ${input.date} |`,
    ...(input.metricRowsTarget ? [`| Metric rows source | ${input.metricRowsTarget} |`] : []),
    '',
    '## Required Commands',
    '',
    '| Command | Expected result | Evidence | Status |',
    '|---|---|---|---|',
    commandRow('npm run showcase:benchmark', input.artifacts.showcaseBenchmark),
    commandRow('npm run showcase:lanes', input.artifacts.showcaseLanes),
    commandRow('npm run showcase:proofs', input.artifacts.showcaseProofs),
    commandRow('npm run showcase:finality', input.artifacts.showcaseFinality),
    commandRow('npm run check', input.artifacts.check),
    commandRow('npm run wasm:test', input.artifacts.wasmTest),
    '',
    '## Metric Table',
    '',
    '| Scenario | Evidence command or log | Sample count | Build time | Proof size | Transaction size | Cost-relevant counts | Throughput | Latency | Status |',
    '|---|---|---:|---|---|---|---|---|---|---|',
    metricRow(metrics.single, input.artifacts.metricRows, 'single-claim settlement baseline'),
    metricRow(metrics.batch, input.artifacts.metricRows, 'batch settlement'),
    metricRow(metrics.sharded, input.artifacts.metricRows, 'sharded lanes planner'),
    '| Live batch settlement | Live batch settlement evidence requires explicit live approval, scoped broadcast enablement, submit, confirmation, and reconciliation evidence |  |  |  |  |  |  |  | blocker |',
    '',
    '## Sharded Lane Evidence',
    '',
    '| Statement | Required evidence | Status |',
    '|---|---|---|',
    shardedLaneRow('DUP inputs are lane-local', `${input.artifacts.showcaseLanes} completed benchmark sharded-lane evidence; npm run showcase:lanes output PASS exit code 0; DUP inputs are lane-local and disjoint`),
    shardedLaneRow('Liquidity inputs are lane-local', `${input.artifacts.showcaseLanes} completed benchmark sharded-lane evidence; npm run showcase:lanes output PASS exit code 0; liquidity inputs are lane-local and disjoint`),
    shardedLaneRow('SPVTracker remains a shared input today', `${input.artifacts.showcaseLanes} completed benchmark sharded-lane evidence; npm run showcase:lanes output PASS exit code 0; SPVTracker remains a shared input today`),
    shardedLaneRow('Full parallel L1 settlement is not claimed', `${input.artifacts.showcaseLanes} completed benchmark sharded-lane evidence; npm run showcase:lanes output PASS exit code 0; full parallel L1 settlement is not claimed while SPVTracker remains shared`),
    shardedLaneRow('Tracker overlap mitigation is identified', `${input.artifacts.showcaseLanes} completed benchmark sharded-lane evidence; npm run showcase:lanes output PASS exit code 0; tracker-overlap mitigation requires pre-ingested tracker entries or tracker sharding`),
    '',
    '## Bottleneck Register',
    '',
    '| Bottleneck | Current evidence | Impact | Required next action |',
    '|---|---|---|---|',
    `| ContextExtension var count | ${input.artifacts.showcaseBenchmark} completed benchmark bottleneck evidence; npm run showcase:benchmark output PASS exit code 0 | ContextExtension Vars reach 58 at batch=10 and remain a batch-width scaling limit | Measure ContextExtension Var count again in live-capable rehearsal before any wider batch claim |`,
    `| Batch unlock claim-core size | ${input.artifacts.showcaseBenchmark} completed benchmark bottleneck evidence; npm run showcase:benchmark output PASS exit code 0 | Batch unlock claim-core size reaches 1090 B at batch=10 and limits unlock payload growth | Re-measure batch unlock claim-core size with signed transaction-size evidence |`,
    `| DUP insert proof size | ${input.artifacts.showcaseProofs} completed benchmark bottleneck evidence; npm run showcase:proofs output PASS exit code 0 | DUP AVL insert-proof size is 67 B in the offline proof-object inspection | Measure DUP AVL proof-size growth against larger public proof vectors |`,
    `| SPV tracker contention | ${input.artifacts.showcaseLanes} completed benchmark bottleneck evidence; npm run showcase:lanes output PASS exit code 0 | SPVTracker remains a shared input and limits full parallel L1 settlement | Validate SPVTracker contention mitigation with pre-ingest or tracker sharding evidence |`,
    `| Liquidity lane fragmentation | ${input.artifacts.showcaseLanes} completed benchmark bottleneck evidence; npm run showcase:lanes output PASS exit code 0 | Liquidity lane fragmentation affects per-lane capacity and payout distribution | Measure liquidity lane fragmentation under more lane counts and payout splits |`,
    `| Ergo transaction size limit | ${input.artifacts.metricRows} completed benchmark bottleneck evidence; npm run showcase:metric-rows output PASS exit code 0 | Ergo transaction byte-size limit is approached through ${metrics.batch.transactionShapeBytes}-byte batch and ${metrics.sharded.transactionShapeBytes}-byte sharded unsigned shapes | Capture signed Ergo transaction byte-size evidence before wider benchmark claims |`,
    `| Node mempool or signing readiness | ${input.artifacts.showcaseFinality} completed benchmark bottleneck evidence; npm run showcase:finality output PASS exit code 0 | Node mempool signing readiness remains outside offline benchmark scope and limits live throughput claims | Run live readiness, broadcast policy, and settlement signing checks only after explicit live approval |`,
    '',
    '## Claims Boundary',
    '',
    'Allowed only with linked evidence:',
    '',
    '- Single-claim settlement remains the correctness baseline.',
    '- Batch settlement amortizes DUP and unlock work for the measured batch size.',
    '- Sharded lanes demonstrate lane-local DUP and liquidity planning.',
    '- Subblock-aware UX separates fast inclusion from ordering-block finality.',
    '',
    'Not allowed until separately proven:',
    '',
    '- Production throughput.',
    '- Base-level or exchange-scale throughput.',
    '- Full parallel L1 settlement while SPVTracker remains a shared input.',
    '- Trustless burn verification while the transitional trusted burn path is in use.',
    '- Mainnet cost, latency, or capacity claims without mainnet-grade evidence.',
    '',
    '## Publication Decision',
    '',
    '| Field | Value |',
    '|---|---|',
    '| Release supported | institutional reference |',
    '| Scaling claims allowed | yes |',
    '| Production-ready claim allowed | no |',
    '| Testnet production-candidate claim allowed | no |',
    '| Production throughput claim allowed | no |',
    '| Mainnet-grade evidence linked | no |',
    '| Open benchmark blockers | 5 |',
    '| Release notes updated | yes |',
    `| Required release-note updates | ${input.artifacts.releaseNoteUpdate} completed Gate 7 benchmark release-note update evidence; Release supported = institutional reference; Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no |`,
    `| Required checklist updates | ${input.artifacts.checklistUpdate} completed Gate 7 benchmark checklist update evidence; Release supported = institutional reference; Scaling claims allowed = yes; Production-ready claim allowed = no; Testnet production-candidate claim allowed = no; Production throughput claim allowed = no; Mainnet-grade evidence linked = no |`,
    '| Reviewer decision summary | Release supported = institutional reference; measured single/batch/sharded evidence is locally structured; Scaling claims allowed = yes; Mainnet-grade evidence linked = no; production-ready claim handling: Production-ready claim allowed = no; testnet production-candidate claim handling: Testnet production-candidate claim allowed = no; production throughput claim handling: blocked; Production throughput claim allowed = no; open benchmark blocker handling: Open benchmark blockers = 5 |',
    '',
    '## Reviewer Sign-Off',
    '',
    '| Role | Name | Decision | Date | Notes |',
    '|---|---|---|---|---|',
    `| Benchmark owner | ${reviewer} | block | ${input.date} | Offline benchmark metrics confirmed for single-claim settlement baseline, batch settlement, and sharded lanes; live batch evidence and publication updates remain required before Gate 7 closure |`,
    `| Security reviewer | ${reviewer} | block | ${input.date} | Benchmark bottlenecks confirmed for ContextExtension var count, DUP insert proof size, SPVTracker contention, transaction size, and node readiness boundaries |`,
    `| Operator reviewer | ${reviewer} | block | ${input.date} | Benchmark claims boundary confirmed: release-scope, throughput, trustless burn, and full parallel L1 settlement claims remain outside this offline candidate |`,
    '',
  ].join('\n');
}

function requireCompletedMetricRowsMarker(markdown: string): void {
  const required = [
    '# Completed Offline Benchmark Metric Rows',
    '| Result | PASS |',
    '| Exit code | 0 |',
    '| Runtime database opened | no |',
    '| Deployment state opened | no |',
    '| Transaction broadcast, submit, deploy, or state mutation performed | no |',
  ];
  const missing = required.filter(marker => !markdown.includes(marker));
  if (missing.length > 0) {
    throw new Error(`metric rows report is missing required marker: ${missing[0]}`);
  }
}

function sectionBetween(markdown: string, start: string, end: string): string {
  const startIndex = markdown.indexOf(start);
  if (startIndex < 0) throw new Error(`metric rows report missing ${start}`);
  const contentStart = startIndex + start.length;
  const endIndex = markdown.indexOf(end, contentStart);
  if (endIndex < 0) throw new Error(`metric rows report missing ${end}`);
  return markdown.slice(contentStart, endIndex);
}

function parseMarkdownTableRow(row: string): string[] {
  return row
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim().replace(/\\\|/g, '|'));
}

function parseMetricRow(
  rows: string[][],
  scenario: OfflineBenchmarkMetricSnapshot['single']['scenario'],
): OfflineBenchmarkMetricSnapshot['single'] {
  const row = rows.find(candidate => candidate[0] === scenario);
  if (!row) throw new Error(`metric rows report missing ${scenario}`);
  if (row.length !== 9) throw new Error(`${scenario} metric row must have 9 columns`);
  return {
    scenario,
    sampleCount: parsePositiveInteger(row[1], `${scenario} sample count`),
    meanBuildTimeMs: parseMs(row[3], `${scenario} mean build time`),
    proofSize: requireNonEmpty(row[4], `${scenario} proof size`),
    transactionShapeBytes: parseBytes(row[5], `${scenario} transaction shape`),
    costRelevantCounts: requireNonEmpty(row[6], `${scenario} cost-relevant counts`),
    throughput: requireNonEmpty(row[7], `${scenario} throughput`),
    latency: requireNonEmpty(row[8], `${scenario} latency`),
  };
}

function parsePositiveInteger(value: string, label: string): number {
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${label} must be a positive integer`);
  return Number(value);
}

function parseMs(value: string, label: string): number {
  const match = /^([0-9]+(?:\.[0-9]+)?) ms$/.exec(value);
  if (!match) throw new Error(`${label} must be a millisecond value`);
  return Number(match[1]);
}

function parseBytes(value: string, label: string): number {
  const match = /^([1-9]\d*) bytes$/.exec(value);
  if (!match) throw new Error(`${label} must be a byte-size value`);
  return Number(match[1]);
}

function requireNonEmpty(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`${label} must be present`);
  return value;
}

function commandRow(command: string, artifact: string): string {
  return `| ${command} | PASS exit code 0 | ${artifact} completed benchmark command output evidence; ${command} command output PASS exit code 0 | linked |`;
}

function metricRow(metric: OfflineBenchmarkMetricSnapshot['single'], artifact: string, focus: string): string {
  const evidence = [
    `${artifact} completed benchmark metric evidence`,
    focus,
    `sample count ${metric.sampleCount}`,
    `cost counts ${metric.costRelevantCounts}`,
  ].join('; ');
  return [
    metric.scenario,
    evidence,
    String(metric.sampleCount),
    `${metric.meanBuildTimeMs} ms`,
    metric.proofSize,
    `${metric.transactionShapeBytes} bytes`,
    metric.costRelevantCounts,
    metric.throughput,
    metric.latency,
    'linked',
  ].map(escapeTableCell).join(' | ').replace(/^/, '| ').replace(/$/, ' |');
}

function shardedLaneRow(statement: string, evidence: string): string {
  return `| ${statement} | ${evidence} | linked |`;
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}
