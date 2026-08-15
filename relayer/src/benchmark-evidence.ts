import { basename } from 'path';

import { isIsoCalendarDate, validateIsoDateField } from './evidence-date.js';
import { validateGitCommitField } from './evidence-git.js';
import {
  hasStructuredValidationFailureMarker,
  hasUnresolvedIssueMarker,
  normalizeEvidenceMarkerText,
  validateEvidenceHygiene,
} from './evidence-hygiene.js';
import {
  validateDuplicateRequiredFields,
  validateRequiredNames,
} from './evidence-required-names.js';
import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import {
  classifyPublicationClaimText,
  validateReviewerDecisionSummaryClaimBoundary,
} from './publication-claim-boundary.js';

export type BenchmarkEvidenceStatus = 'pending' | 'linked' | 'blocker';
export type ReviewerDecision = 'approve' | 'block';

export interface BenchmarkMetricRow {
  scenario: string;
  evidenceCommandOrLog: string;
  sampleCount: string;
  buildTime: string;
  proofSize: string;
  transactionSize: string;
  costRelevantCounts: string;
  throughput: string;
  latency: string;
  status: string;
}

export interface BenchmarkCommandRow {
  command: string;
  expectedResult: string;
  evidence: string;
  status: string;
}

export interface ShardedLaneEvidenceRow {
  statement: string;
  requiredEvidence: string;
  status: string;
}

export interface BottleneckRow {
  bottleneck: string;
  currentEvidence: string;
  impact: string;
  requiredNextAction: string;
}

export interface BenchmarkPublicationDecisionFields {
  releaseSupported: string;
  scalingClaimsAllowed: string;
  productionReadyClaimAllowed: string;
  testnetProductionCandidateClaimAllowed: string;
  productionThroughputClaimAllowed: string;
  mainnetGradeEvidenceLinked: string;
  openBenchmarkBlockers: string;
  releaseNotesUpdated: string;
  requiredReleaseNoteUpdates: string;
  requiredChecklistUpdates: string;
  reviewerDecisionSummary: string;
}

export interface BenchmarkClassificationFields {
  benchmarkName: string;
  gitCommit: string;
  releaseLevel: string;
  environment: string;
  broadcastMode: string;
  trustPath: string;
  machineProfile: string;
  nodeVersion: string;
  rustVersion: string;
  wasmPackVersion: string;
  reviewer: string;
  date: string;
}

export interface BenchmarkClaimsBoundaryFields {
  allowedClaims: string[];
  blockedClaims: string[];
}

export interface ReviewerSignoffRow {
  role: string;
  name: string;
  decision: string;
  date: string;
  notes: string;
}

export interface BenchmarkEvidenceValidation {
  status: 'PASS' | 'BLOCKED';
  commandRows: BenchmarkCommandRow[];
  metricRows: BenchmarkMetricRow[];
  shardedLaneRows: ShardedLaneEvidenceRow[];
  bottleneckRows: BottleneckRow[];
  classification: Partial<BenchmarkClassificationFields>;
  claimsBoundary: BenchmarkClaimsBoundaryFields;
  publicationDecision: Partial<BenchmarkPublicationDecisionFields>;
  reviewerRows: ReviewerSignoffRow[];
  errors: string[];
  message: string;
}

const REQUIRED_SECTIONS = [
  '## Benchmark Classification',
  '## Required Commands',
  '## Metric Table',
  '## Sharded Lane Evidence',
  '## Bottleneck Register',
  '## Claims Boundary',
  '## Publication Decision',
  '## Reviewer Sign-Off',
];

const REQUIRED_CLASSIFICATION_FIELDS = [
  'Benchmark name',
  'Git commit',
  'Release level',
  'Environment',
  'Broadcast mode',
  'Trust path',
  'Machine profile',
  'Node version',
  'Rust version',
  'wasm-pack version',
  'Reviewer',
  'Date',
];

export const REQUIRED_BENCHMARK_COMMANDS = [
  'npm run showcase:benchmark',
  'npm run showcase:lanes',
  'npm run showcase:proofs',
  'npm run showcase:finality',
  'npm run check',
  'npm run wasm:test',
];

export const REQUIRED_BENCHMARK_METRIC_SCENARIOS = [
  'Single-claim settlement baseline',
  'Batch settlement',
  'Sharded lanes planner',
  'Live batch settlement',
];
const MIN_SAMPLE_COUNT = 3;
const REQUIRED_COST_COUNT_KEYS = ['inputs', 'outputs', 'vars', 'batch'];

const REQUIRED_METRIC_EVIDENCE_FOCUS: Record<string, { pattern: RegExp; message: string }> = {
  'Single-claim settlement baseline': {
    pattern: /single[- ]claim|single[- ]settlement|baseline/i,
    message: 'single-claim settlement baseline',
  },
  'Batch settlement': {
    pattern: /batch[- ]settlement|\bbatch\b(?!\s*=)/i,
    message: 'batch settlement',
  },
  'Sharded lanes planner': {
    pattern: /sharded[- ]lanes?|lane[- ]planner|shard/i,
    message: 'sharded lanes planner',
  },
  'Live batch settlement': {
    pattern: /live[- ]batch|batch[- ]settlement|submit|confirm|reconciliation|txid|transaction[- ]id/i,
    message: 'live batch settlement',
  },
};

export const REQUIRED_BENCHMARK_SHARDED_STATEMENTS = [
  'DUP inputs are lane-local',
  'Liquidity inputs are lane-local',
  'SPVTracker remains a shared input today',
  'Full parallel L1 settlement is not claimed',
  'Tracker overlap mitigation is identified',
];

const REQUIRED_SHARDED_EVIDENCE_FOCUS: Record<string, { pattern: RegExp; message: string }> = {
  'DUP inputs are lane-local': {
    pattern: /dup.*lane[- ]local|lane[- ]local.*dup|dup[- ]inputs/i,
    message: 'evidence must identify lane-local DUP inputs',
  },
  'Liquidity inputs are lane-local': {
    pattern: /liquidity.*lane[- ]local|lane[- ]local.*liquidity|liquidity[- ]inputs/i,
    message: 'evidence must identify lane-local liquidity inputs',
  },
  'SPVTracker remains a shared input today': {
    pattern: /spvtracker|spv[- ]tracker|shared[- ]input/i,
    message: 'evidence must identify shared SPVTracker input',
  },
  'Full parallel L1 settlement is not claimed': {
    pattern: /full[- ]parallel|parallel[- ]l1|not[- ]claimed|claim[- ]boundary/i,
    message: 'evidence must identify full-parallel L1 claim boundary',
  },
  'Tracker overlap mitigation is identified': {
    pattern: /tracker[- ]overlap|overlap[- ]mitigation|pre[- ]ingest|tracker[- ]sharding|mitigation/i,
    message: 'evidence must identify tracker overlap mitigation',
  },
};

export const REQUIRED_BENCHMARK_BOTTLENECKS = [
  'ContextExtension var count',
  'Batch unlock claim-core size',
  'DUP insert proof size',
  'SPV tracker contention',
  'Liquidity lane fragmentation',
  'Ergo transaction size limit',
  'Node mempool or signing readiness',
];

const REQUIRED_BOTTLENECK_FOCUS: Record<string, { pattern: RegExp; message: string }> = {
  'ContextExtension var count': {
    pattern: /\b(ContextExtension|Vars?)\b/i,
    message: 'ContextExtension Var count',
  },
  'Batch unlock claim-core size': {
    pattern: /\b(batch|unlock|claim[- ]core)\b/i,
    message: 'batch unlock claim-core size',
  },
  'DUP insert proof size': {
    pattern: /\b(DUP|AVL|insert[- ]proof|proof[- ]size)\b/i,
    message: 'DUP/AVL insert proof size',
  },
  'SPV tracker contention': {
    pattern: /\b(SPV|tracker|contention|shared[- ]input)\b/i,
    message: 'SPV tracker contention or shared input behavior',
  },
  'Liquidity lane fragmentation': {
    pattern: /\b(liquidity|lane|fragmentation)\b/i,
    message: 'liquidity lane fragmentation',
  },
  'Ergo transaction size limit': {
    pattern: /\b(Ergo|transaction|tx|size[- ]limit|byte[- ]limit)\b/i,
    message: 'Ergo transaction size limit',
  },
  'Node mempool or signing readiness': {
    pattern: /\b(node|mempool|signing|readiness|broadcast)\b/i,
    message: 'node mempool, signing, readiness, or broadcast behavior',
  },
};

export const REQUIRED_BENCHMARK_ALLOWED_CLAIMS = [
  'Single-claim settlement remains the correctness baseline',
  'Batch settlement amortizes DUP and unlock work for the measured batch size',
  'Sharded lanes demonstrate lane-local DUP and liquidity planning',
  'Subblock-aware UX separates fast inclusion from ordering-block finality',
];

export const REQUIRED_BENCHMARK_BLOCKED_CLAIMS = [
  'Production throughput',
  'Base-level or exchange-scale throughput',
  'Full parallel L1 settlement while SPVTracker remains a shared input',
  'Trustless burn verification while the transitional trusted burn path is in use',
  'Mainnet cost, latency, or capacity claims without mainnet-grade evidence',
];

export const REQUIRED_BENCHMARK_REVIEWER_ROLES = [
  'Benchmark owner',
  'Security reviewer',
  'Operator reviewer',
];

const REQUIRED_PUBLICATION_FIELDS = [
  'Release supported',
  'Scaling claims allowed',
  'Production-ready claim allowed',
  'Testnet production-candidate claim allowed',
  'Production throughput claim allowed',
  'Mainnet-grade evidence linked',
  'Open benchmark blockers',
  'Release notes updated',
  'Required release-note updates',
  'Required checklist updates',
  'Reviewer decision summary',
];

const ALLOWED_STATUSES = new Set<BenchmarkEvidenceStatus>(['pending', 'linked', 'blocker']);
const ALLOWED_RELEASE_LEVELS = new Set([
  'validated PoC',
  'institutional reference',
  'production deployment candidate',
]);
const ALLOWED_ENVIRONMENTS = new Set(['local offline', 'patched devnet', 'testnet', 'staging']);
const ALLOWED_BROADCAST_MODES = new Set(['disabled', 'dry-run', 'enabled']);
const ALLOWED_TRUST_PATHS = new Set([
  'transitional trusted burn path',
  'trustless burn proof path',
]);
const ALLOWED_RELEASE_SUPPORT = new Set([
  'none',
  'validated PoC',
  'institutional reference',
  'production deployment candidate',
]);
const RELEASE_LEVEL_RANK = new Map([
  ['validated PoC', 1],
  ['institutional reference', 2],
  ['production deployment candidate', 3],
]);
const ALLOWED_YES_NO = new Set(['yes', 'no']);
const ALLOWED_REVIEWER_DECISIONS = new Set<ReviewerDecision>(['approve', 'block']);
const HEX_32_BYTE_PATTERN = /(?:^|[^0-9a-fA-F])(?:0x)?([0-9a-fA-F]{64})(?![0-9a-fA-F])/g;
const LIVE_BATCH_EVIDENCE_PATTERN =
  /\bsettle:aggregate\b.*\b(submit|confirm|submit-with-ingest|confirm-with-ingest|submit-anchored|confirm-anchored)\b|\be2e:aggregate\b|artifact:\/\/.*\b(live|settlement|submit|confirm|reconciliation|txid)\b/i;
const REQUIRED_LIVE_BATCH_EVIDENCE_FOCUS = [
  {
    pattern: /\b(submit|submitted|submission|e2e:aggregate)\b/i,
    message: 'submit evidence',
  },
  {
    pattern: /\b(confirm|confirmed|confirmation|e2e:aggregate)\b/i,
    message: 'confirmation evidence',
  },
  {
    pattern: /\b(txid|tx id|transaction id|reconciliation|reconciled|e2e:aggregate)\b/i,
    message: 'transaction identity or reconciliation evidence',
  },
];
const USER_LIVE_BROADCAST_APPROVAL_PATTERN =
  /\b(?:user\s+explicit\s+live\s+broadcast\s+approval|explicit\s+user\s+live\s+broadcast\s+approval)\b/i;
const EXPECTED_TRANSACTION_ID_SEGMENT_PATTERN =
  /\bExpected transaction ID\b.{0,120}(?:0x)?[0-9a-fA-F]{64}\b/i;
const SCOPED_BROADCAST_ENABLED_PATTERN =
  /\bBRIDGE_BROADCAST_ENABLED=true\b.{0,120}\b(scoped|scope|limited\s+shell|shell)\b|\b(scoped|scope|limited\s+shell|shell)\b.{0,120}\bBRIDGE_BROADCAST_ENABLED=true\b/i;
const EXPECTED_TRANSACTION_ID_CAPTURE_PATTERN =
  /\bExpected transaction ID\b.{0,120}(?:0x)?([0-9a-fA-F]{64})/gi;
const LIVE_BATCH_SUBMITTED_TRANSACTION_ID_PATTERN =
  /\b(?:submitted(?:\s+(?:transaction\s+ID|tx\s*ID|txId))?|settlement\s+(?:transaction\s+ID|tx\s*ID|txId)|live\s+batch\s+(?:transaction\s+ID|tx\s*ID|txId)|tx\s*ID|txId)\b\s*(?:[:=]|is)?\s*(?:0x)?([0-9a-fA-F]{64})/gi;
const POST_ENABLE_READINESS_LABEL_PATTERN =
  /\b(?:npm run demo:readiness|post[-\s]?enable readiness)\b/i;
const BROADCAST_POLICY_LABEL_PATTERN = /\bBroadcast policy\b/i;
const LIVE_SETTLEMENT_SIGNING_LABEL_PATTERN = /\bLive settlement signing\b/i;
const CONTRADICTORY_READINESS_FAILURE_PATTERN =
  /\bFAIL(?:ED)?\b|\bBLOCKED\b|\bERROR\b|\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b|\berrors?\s*[:=]\s*(?!0\b)\d+\b|\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b|\b[1-9]\d*\s+structural\s+issues?\b/i;
const CONTRADICTORY_REVIEWER_NOTE_FAILURE_PATTERN =
  /\b(?:validation|validator|command|check|gate|release:gate|benchmark:validate)\b.{0,80}\b(?:FAIL(?:ED)?|BLOCKED|ERROR)\b|\b(?:FAIL(?:ED)?|BLOCKED|ERROR)\b.{0,80}\b(?:validation|validator|command|check|gate|release:gate|benchmark:validate)\b|\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b|\berrors?\s*[:=]\s*(?!0\b)\d+\b|\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b|\b[1-9]\d*\s+structural\s+issues?\b/i;
const BROADCAST_NETWORK_RECONFIRMATION_PATTERN =
  /\bbroadcast network reconfirmation\b|\bnetwork reconfirmation\b/i;

function hasPositiveReadinessPassEvidence(
  value: string,
  labelPattern: RegExp,
  maxDistance = 120,
): boolean {
  const normalizedValue = normalizeEvidenceMarkerText(value);
  const label = labelPattern.source;
  const patterns = [new RegExp(`${label}.{0,${maxDistance}}\\bPASS\\b`, 'gi')];

  return patterns.some(pattern =>
    [...normalizedValue.matchAll(pattern)].some(match => {
      const start = match.index ?? 0;
      const end = Math.min(normalizedValue.length, start + match[0].length + maxDistance);
      return !hasContradictoryBenchmarkEvidenceFailureMarker(normalizedValue.slice(start, end));
    })
  );
}

function parseMarkdownTableRows(table: string): string[][] {
  return table
    .split(/\r?\n/)
    .filter(line => line.startsWith('|'))
    .filter(line => !/^\|\s*-/.test(line))
    .slice(1)
    .map(line =>
      line
        .slice(1, -1)
        .split('|')
        .map(cell => cell.trim()),
    );
}

export function parseCommandRows(markdown: string): BenchmarkCommandRow[] {
  return parseTableBetween(markdown, '## Required Commands', '## Metric Table').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Required Commands row: ${row.join(' | ')}`);

    return {
      command: row[0],
      expectedResult: row[1],
      evidence: row[2],
      status: row[3],
    };
  });
}

export function parseMetricRows(markdown: string): BenchmarkMetricRow[] {
  return parseTableBetween(markdown, '## Metric Table', '## Sharded Lane Evidence').map(row => {
    if (row.length !== 10) throw new Error(`Malformed Metric Table row: ${row.join(' | ')}`);

    return {
      scenario: row[0],
      evidenceCommandOrLog: row[1],
      sampleCount: row[2],
      buildTime: row[3],
      proofSize: row[4],
      transactionSize: row[5],
      costRelevantCounts: row[6],
      throughput: row[7],
      latency: row[8],
      status: row[9],
    };
  });
}

export function validateBenchmarkEvidence(markdown: string): BenchmarkEvidenceValidation {
  const parseErrors: string[] = [];
  const commandRows = captureBenchmarkParse(parseErrors, () => parseCommandRows(markdown), []);
  const metricRows = captureBenchmarkParse(parseErrors, () => parseMetricRows(markdown), []);
  const shardedLaneRows = captureBenchmarkParse(parseErrors, () => parseShardedLaneRows(markdown), []);
  const bottleneckRows = captureBenchmarkParse(parseErrors, () => parseBottleneckRows(markdown), []);
  const reviewerRows = captureBenchmarkParse(parseErrors, () => parseReviewerRows(markdown), []);
  const classification = parseClassification(markdown);
  const classificationFields = classificationFieldsFromMap(classification);
  const claimsBoundary = parseClaimsBoundary(markdown);
  const publicationDecision = parsePublicationDecision(markdown);
  const errors = [
    ...parseErrors,
    ...validateEvidenceHygiene(markdown, 'Benchmark Evidence'),
    ...validateRequiredSections(markdown),
    ...validateClassificationFields(markdown),
    ...validateClassification(classification),
    ...validateCommandRows(commandRows),
    ...validateMetricRows(metricRows),
    ...validateLiveBatchScenario(metricRows, classification),
    ...validateShardedLaneRows(shardedLaneRows),
    ...validateBottleneckRows(bottleneckRows),
    ...validateClaimsBoundary(claimsBoundary),
    ...validatePublicationDecision(publicationDecision, markdown),
    ...validateReviewerRows(reviewerRows),
    ...validateReviewerIdentityConsistency(classification, reviewerRows),
    ...validateReviewerDateConsistency(classification, reviewerRows),
  ];

  if (errors.length > 0) {
    return {
      status: 'BLOCKED',
      commandRows,
      metricRows,
      shardedLaneRows,
      bottleneckRows,
      classification: classificationFields,
      claimsBoundary,
      publicationDecision,
      reviewerRows,
      errors,
      message: `Benchmark evidence BLOCKED: ${errors.length} structural issue(s).`,
    };
  }

  return {
    status: 'PASS',
    commandRows,
    metricRows,
    shardedLaneRows,
    bottleneckRows,
    classification: classificationFields,
    claimsBoundary,
    publicationDecision,
    reviewerRows,
    errors: [],
    message: `Benchmark evidence PASS: ${commandRows.length} command rows and ${metricRows.length} metric rows are structured.`,
  };
}

function captureBenchmarkParse<T>(errors: string[], parse: () => T, fallback: T): T {
  try {
    return parse();
  } catch (error) {
    errors.push(sanitizeBenchmarkParseError(error));
    return fallback;
  }
}

function sanitizeBenchmarkParseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const missingTable = /^##\s*([^:]+): table not found$/.exec(message);
  if (missingTable) return `${missingTable[1]}: table not found`;

  const malformedRow = /^Malformed ([^:]+) row:/.exec(message);
  if (malformedRow) return `${malformedRow[1]}: row has invalid column count`;

  return 'Benchmark evidence: malformed Markdown table';
}

function parseShardedLaneRows(markdown: string): ShardedLaneEvidenceRow[] {
  return parseTableBetween(markdown, '## Sharded Lane Evidence', '## Bottleneck Register').map(row => {
    if (row.length !== 3) throw new Error(`Malformed Sharded Lane Evidence row: ${row.join(' | ')}`);
    return { statement: row[0], requiredEvidence: row[1], status: row[2] };
  });
}

function parseBottleneckRows(markdown: string): BottleneckRow[] {
  return parseTableBetween(markdown, '## Bottleneck Register', '## Claims Boundary').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Bottleneck Register row: ${row.join(' | ')}`);
    return {
      bottleneck: row[0],
      currentEvidence: row[1],
      impact: row[2],
      requiredNextAction: row[3],
    };
  });
}

export function parseClaimsBoundary(markdown: string): BenchmarkClaimsBoundaryFields {
  const section = normalizeWhitespace(sectionBetween(markdown, '## Claims Boundary', '## Publication Decision'));
  return {
    allowedClaims: REQUIRED_BENCHMARK_ALLOWED_CLAIMS.filter(claim => section.includes(claim)),
    blockedClaims: REQUIRED_BENCHMARK_BLOCKED_CLAIMS.filter(claim => section.includes(claim)),
  };
}

function parsePublicationDecision(markdown: string): Partial<BenchmarkPublicationDecisionFields> {
  const fields = parseTwoColumnTable(sectionBetween(markdown, '## Publication Decision', '## Reviewer Sign-Off'));
  return {
    releaseSupported: fields.get('Release supported'),
    scalingClaimsAllowed: fields.get('Scaling claims allowed'),
    productionReadyClaimAllowed: fields.get('Production-ready claim allowed'),
    testnetProductionCandidateClaimAllowed: fields.get('Testnet production-candidate claim allowed'),
    productionThroughputClaimAllowed: fields.get('Production throughput claim allowed'),
    mainnetGradeEvidenceLinked: fields.get('Mainnet-grade evidence linked'),
    openBenchmarkBlockers: fields.get('Open benchmark blockers'),
    releaseNotesUpdated: fields.get('Release notes updated'),
    requiredReleaseNoteUpdates: fields.get('Required release-note updates'),
    requiredChecklistUpdates: fields.get('Required checklist updates'),
    reviewerDecisionSummary: fields.get('Reviewer decision summary'),
  };
}

function parseReviewerRows(markdown: string): ReviewerSignoffRow[] {
  return parseTableBetween(markdown, '## Reviewer Sign-Off').map(row => {
    if (row.length !== 5) throw new Error(`Malformed Reviewer Sign-Off row: ${row.join(' | ')}`);
    return { role: row[0], name: row[1], decision: row[2], date: row[3], notes: row[4] };
  });
}

function validateRequiredSections(markdown: string): string[] {
  const errors: string[] = [];
  let lastIndex = -1;

  for (const section of REQUIRED_SECTIONS) {
    const index = markdown.indexOf(section);
    if (index < 0) {
      errors.push(`${section}: missing required section`);
      continue;
    }
    if (index <= lastIndex) errors.push(`${section}: section appears out of order`);
    lastIndex = index;
  }

  return errors;
}

function parseClassification(markdown: string): Map<string, string> {
  return parseTwoColumnTable(sectionBetween(markdown, '## Benchmark Classification', '## Required Commands'));
}

function classificationFieldsFromMap(fields: Map<string, string>): Partial<BenchmarkClassificationFields> {
  return {
    benchmarkName: fields.get('Benchmark name'),
    gitCommit: fields.get('Git commit'),
    releaseLevel: fields.get('Release level'),
    environment: fields.get('Environment'),
    broadcastMode: fields.get('Broadcast mode'),
    trustPath: fields.get('Trust path'),
    machineProfile: fields.get('Machine profile'),
    nodeVersion: fields.get('Node version'),
    rustVersion: fields.get('Rust version'),
    wasmPackVersion: fields.get('wasm-pack version'),
    reviewer: fields.get('Reviewer'),
    date: fields.get('Date'),
  };
}

function validateClassification(fields: Map<string, string>): string[] {
  const errors: string[] = [];

  for (const field of REQUIRED_CLASSIFICATION_FIELDS) {
    if (isBlank(fields.get(field) ?? '')) errors.push(`Benchmark Classification: ${field} is required`);
  }

  validateAllowedField(errors, fields, 'Benchmark Classification', 'Release level', ALLOWED_RELEASE_LEVELS);
  validateAllowedField(errors, fields, 'Benchmark Classification', 'Environment', ALLOWED_ENVIRONMENTS);
  validateAllowedField(errors, fields, 'Benchmark Classification', 'Broadcast mode', ALLOWED_BROADCAST_MODES);
  validateAllowedField(errors, fields, 'Benchmark Classification', 'Trust path', ALLOWED_TRUST_PATHS);
  validateGitCommitField(errors, fields, 'Benchmark Classification', 'Git commit');
  validateIsoDateField(errors, fields, 'Benchmark Classification', 'Date');
  if (fields.get('Release level') === 'production deployment candidate' && fields.get('Environment') !== 'testnet') {
    errors.push('Benchmark Classification: production deployment candidate requires Environment testnet');
  }
  if (
    fields.get('Release level') === 'production deployment candidate' &&
    fields.get('Trust path') !== 'trustless burn proof path'
  ) {
    errors.push('Benchmark Classification: production deployment candidate requires Trust path trustless burn proof path');
  }

  return errors;
}

function validateClassificationFields(markdown: string): string[] {
  return validateDuplicateRequiredFields(
    'Benchmark Classification',
    parseTwoColumnFieldNames(sectionBetween(markdown, '## Benchmark Classification', '## Required Commands')),
    REQUIRED_CLASSIFICATION_FIELDS,
  );
}

function validateCommandRows(rows: BenchmarkCommandRow[]): string[] {
  const errors = validateRequiredNames(
    'Required Commands',
    rows.map(row => row.command),
    REQUIRED_BENCHMARK_COMMANDS,
  );

  for (const row of rows) {
    if (!REQUIRED_BENCHMARK_COMMANDS.includes(row.command)) {
      errors.push(`Required Commands: ${row.command}: unexpected command`);
    }
    if (!ALLOWED_STATUSES.has(row.status as BenchmarkEvidenceStatus)) {
      errors.push(`Required Commands: ${row.command}: status must be pending, linked, or blocker`);
      continue;
    }
    if (row.status !== 'linked') {
      errors.push(`Required Commands: ${row.command}: status must be linked before Gate 7 evidence can pass`);
      continue;
    }
    if (isBlank(row.expectedResult)) {
      errors.push(`Required Commands: ${row.command}: Expected result is required`);
    } else if (!hasPositiveBenchmarkCommandResult(row.expectedResult)) {
      errors.push(`Required Commands: ${row.command}: Expected result must indicate successful command completion`);
    } else if (!hasExplicitCommandExitCodeZero(row.expectedResult)) {
      errors.push(`Required Commands: ${row.command}: Expected result must include exit code 0`);
    }
    if (isBlank(row.evidence)) {
      errors.push(`Required Commands: ${row.command}: Evidence is required`);
      continue;
    }
    if (!hasEvidenceMarker(row.evidence)) {
      errors.push(`Required Commands: ${row.command}: linked status requires a command, link, or artifact marker`);
    } else if (!hasCompletedBenchmarkEvidenceTarget(row.evidence)) {
      errors.push(
        `Required Commands: ${row.command}: linked status requires a completed artifact target or non-template evidence link`,
      );
    } else if (!hasNoContradictoryBenchmarkEvidenceMarker(row.evidence)) {
      errors.push(`Required Commands: ${row.command}: evidence must not include contradictory benchmark failure markers`);
    }
    if (leavesOpenBenchmarkBlockers(row.evidence)) {
      errors.push(`Required Commands: ${row.command}: evidence must not leave benchmark blockers open`);
    }
    if (!benchmarkCommandEvidenceIdentifiesCommand(row.command, row.evidence)) {
      errors.push(`Required Commands: ${row.command}: evidence must identify ${row.command} output`);
    }
    if (!hasExplicitCommandExitCodeZero(row.evidence)) {
      errors.push(`Required Commands: ${row.command}: evidence must include command output with exit code 0`);
    }
    if (!hasInternallyPositiveBenchmarkCommandOutput(row.expectedResult, row.evidence)) {
      errors.push(`Required Commands: ${row.command}: evidence must show successful command output`);
    }
  }

  return errors;
}

function validateMetricRows(rows: BenchmarkMetricRow[]): string[] {
  const errors = validateRequiredNames('Metric Table', rows.map(row => row.scenario), REQUIRED_BENCHMARK_METRIC_SCENARIOS);
  const rowByScenario = new Map(rows.map(row => [row.scenario, row]));

  for (const row of rows) {
    if (!REQUIRED_BENCHMARK_METRIC_SCENARIOS.includes(row.scenario)) {
      errors.push(`Metric Table: ${row.scenario}: unexpected scenario`);
    }
    if (!ALLOWED_STATUSES.has(row.status as BenchmarkEvidenceStatus)) {
      errors.push(`Metric Table: ${row.scenario}: status must be pending, linked, or blocker`);
      continue;
    }
    if (row.status !== 'linked') {
      errors.push(`Metric Table: ${row.scenario}: status must be linked before Gate 7 evidence can pass`);
      continue;
    }
    if (row.status === 'linked') {
      for (const [label, value] of [
        ['Evidence command or log', row.evidenceCommandOrLog],
        ['Sample count', row.sampleCount],
        ['Build time', row.buildTime],
        ['Proof size', row.proofSize],
        ['Transaction size', row.transactionSize],
        ['Cost-relevant counts', row.costRelevantCounts],
        ['Throughput', row.throughput],
        ['Latency', row.latency],
      ] as const) {
        if (isBlank(value)) errors.push(`Metric Table: ${row.scenario}: linked status requires ${label}`);
      }
      validateSampleCount(errors, row.scenario, row.sampleCount);
      validateMetricSampleCountEvidence(errors, row.scenario, row.sampleCount, row.evidenceCommandOrLog);
      validateMetricMeasurement(errors, row.scenario, 'Build time', row.buildTime, /\d+(?:\.\d+)?\s*(?:ms|s)\b/i);
      validateMetricMeasurement(errors, row.scenario, 'Proof size', row.proofSize, /\d+(?:\.\d+)?\s*(?:bytes|b|kb|mb)\b/i);
      validateMetricMeasurement(errors, row.scenario, 'Transaction size', row.transactionSize, /\d+(?:\.\d+)?\s*(?:bytes|b|kb|mb)\b/i);
      validateMetricMeasurement(errors, row.scenario, 'Cost-relevant counts', row.costRelevantCounts, /\b(?:inputs|outputs|vars|batch|cost|jit|eval)\s*=\s*\d+/i);
      validateCostRelevantCounts(errors, row.scenario, row.costRelevantCounts);
      validateMetricCostRelevantCountEvidence(errors, row.scenario, row.costRelevantCounts, row.evidenceCommandOrLog);
      validateMetricMeasurement(errors, row.scenario, 'Throughput', row.throughput, /\d+(?:\.\d+)?.*(?:settlement|claim|batch|tx|block|minute|min|\/)/i);
      validateMetricMeasurement(errors, row.scenario, 'Latency', row.latency, /\d+(?:\.\d+)?.*(?:ms|s|sec|block|minute|min)/i);
    }
  }

  for (const scenario of REQUIRED_BENCHMARK_METRIC_SCENARIOS) {
    const row = rowByScenario.get(scenario);
    if (row && row.status === 'linked') {
      if (!hasEvidenceMarker(row.evidenceCommandOrLog)) {
        errors.push(`Metric Table: ${scenario}: linked status requires a command or artifact marker`);
      } else if (!hasCompletedBenchmarkEvidenceTarget(row.evidenceCommandOrLog)) {
        errors.push(
          `Metric Table: ${scenario}: linked status requires a completed artifact target or non-template evidence link`,
        );
      } else if (!hasNoContradictoryBenchmarkEvidenceMarker(row.evidenceCommandOrLog)) {
        errors.push(`Metric Table: ${scenario}: evidence must not include contradictory benchmark failure markers`);
      }
      if (leavesOpenBenchmarkBlockers(row.evidenceCommandOrLog)) {
        errors.push(`Metric Table: ${scenario}: evidence must not leave benchmark blockers open`);
      }
      const metricFocus = REQUIRED_METRIC_EVIDENCE_FOCUS[scenario];
      if (metricFocus && !metricFocus.pattern.test(row.evidenceCommandOrLog)) {
        errors.push(`Metric Table: ${scenario}: evidence must identify ${metricFocus.message}`);
      }
    }
  }

  return errors;
}

function validateLiveBatchScenario(rows: BenchmarkMetricRow[], classification: Map<string, string>): string[] {
  const liveBatch = rows.find(row => row.scenario === 'Live batch settlement');
  if (!liveBatch || liveBatch.status !== 'linked') return [];

  const errors: string[] = [];
  const environment = classification.get('Environment') ?? '';
  const broadcastMode = classification.get('Broadcast mode') ?? '';

  if (environment === 'local offline') {
    errors.push('Metric Table: Live batch settlement: linked status requires patched devnet, testnet, or staging environment');
  }
  if (broadcastMode !== 'enabled') {
    errors.push('Metric Table: Live batch settlement: linked status requires enabled broadcast mode');
  }
  if (!LIVE_BATCH_EVIDENCE_PATTERN.test(liveBatch.evidenceCommandOrLog)) {
    errors.push(
      'Metric Table: Live batch settlement: linked status requires live submit/confirm or e2e aggregate evidence, not offline showcase output',
    );
  }
  for (const focus of REQUIRED_LIVE_BATCH_EVIDENCE_FOCUS) {
    if (!focus.pattern.test(liveBatch.evidenceCommandOrLog)) {
      errors.push(`Metric Table: Live batch settlement: linked status requires ${focus.message}`);
    }
  }
  if (!hasUserLiveBroadcastApprovalBoundToExpectedTransactionId(liveBatch.evidenceCommandOrLog)) {
    errors.push(
      'Metric Table: Live batch settlement: linked status requires user explicit live broadcast approval evidence bound to Expected transaction ID',
    );
  }
  if (!SCOPED_BROADCAST_ENABLED_PATTERN.test(liveBatch.evidenceCommandOrLog)) {
    errors.push(
      'Metric Table: Live batch settlement: linked status requires scoped BRIDGE_BROADCAST_ENABLED=true evidence',
    );
  }
  const expectedTransactionIds = extractExpectedTransactionIds(liveBatch.evidenceCommandOrLog);
  if (expectedTransactionIds.length === 0) {
    errors.push(
      'Metric Table: Live batch settlement: linked status requires Expected transaction ID binding',
    );
  }
  if (!hasPositiveReadinessPassEvidence(liveBatch.evidenceCommandOrLog, POST_ENABLE_READINESS_LABEL_PATTERN)) {
    errors.push(
      'Metric Table: Live batch settlement: linked status requires post-enable demo:readiness PASS evidence',
    );
  }
  if (!hasPositiveReadinessPassEvidence(liveBatch.evidenceCommandOrLog, BROADCAST_POLICY_LABEL_PATTERN)) {
    errors.push(
      'Metric Table: Live batch settlement: linked status requires Broadcast policy PASS evidence',
    );
  }
  if (!hasPositiveReadinessPassEvidence(liveBatch.evidenceCommandOrLog, LIVE_SETTLEMENT_SIGNING_LABEL_PATTERN)) {
    errors.push(
      'Metric Table: Live batch settlement: linked status requires Live settlement signing PASS evidence',
    );
  }
  if (!BROADCAST_NETWORK_RECONFIRMATION_PATTERN.test(liveBatch.evidenceCommandOrLog)) {
    errors.push(
      'Metric Table: Live batch settlement: linked status requires broadcast network reconfirmation evidence',
    );
  }
  if (extractHex32Values(liveBatch.evidenceCommandOrLog).length === 0) {
    errors.push(
      'Metric Table: Live batch settlement: linked status requires a concrete 32-byte transaction ID or reconciliation digest',
    );
  }
  const expectedTransactionIdSet = new Set(expectedTransactionIds);
  const submittedTransactionIds = extractLiveBatchSubmittedTransactionIds(liveBatch.evidenceCommandOrLog);
  if (
    expectedTransactionIdSet.size > 0 &&
    (
      submittedTransactionIds.length === 0 ||
      submittedTransactionIds.some(transactionId => !expectedTransactionIdSet.has(transactionId))
    )
  ) {
    errors.push(
      'Metric Table: Live batch settlement: submitted transaction ID must match Expected transaction ID',
    );
  }

  return errors;
}

function validateMetricMeasurement(
  errors: string[],
  scenario: string,
  label: string,
  value: string,
  pattern: RegExp,
): void {
  if (!isBlank(value) && !pattern.test(value)) {
    errors.push(`Metric Table: ${scenario}: ${label} must include a measured numeric value and unit`);
    return;
  }

  if (!isBlank(value) && !hasPositiveMeasurement(value)) {
    errors.push(`Metric Table: ${scenario}: ${label} must include a positive measured numeric value and unit`);
  }
}

function validateSampleCount(errors: string[], scenario: string, value: string): void {
  if (isBlank(value)) return;
  const sampleCount = parsePositiveSafeIntegerText(value);
  if (sampleCount === 'invalid') {
    errors.push(`Metric Table: ${scenario}: Sample count must be a positive integer`);
    return;
  }
  if (sampleCount === 'unsafe') {
    errors.push(`Metric Table: ${scenario}: Sample count must be a safe integer`);
    return;
  }
  if (sampleCount < MIN_SAMPLE_COUNT) {
    errors.push(`Metric Table: ${scenario}: Sample count must be at least ${MIN_SAMPLE_COUNT}`);
  }
}

function validateMetricSampleCountEvidence(
  errors: string[],
  scenario: string,
  sampleCountValue: string,
  evidence: string,
): void {
  if (isBlank(evidence)) return;
  const sampleCount = parsePositiveSafeIntegerText(sampleCountValue);
  if (typeof sampleCount !== 'number') return;
  if (!metricEvidenceCitesSampleCount(evidence, sampleCount)) {
    errors.push(`Metric Table: ${scenario}: Evidence command or log must cite Sample count ${sampleCount}`);
  }
}

function validateMetricCostRelevantCountEvidence(
  errors: string[],
  scenario: string,
  costRelevantCountsValue: string,
  evidence: string,
): void {
  if (isBlank(evidence)) return;
  const costRelevantCounts = parseBenchmarkCostRelevantCountMap(costRelevantCountsValue);
  if (!costRelevantCounts) return;
  if (!metricEvidenceCitesCostRelevantCounts(evidence, costRelevantCounts)) {
    errors.push(
      `Metric Table: ${scenario}: Evidence command or log must cite Cost-relevant counts ${formatBenchmarkCostRelevantCounts(costRelevantCounts)}`,
    );
  }
}

function validateCostRelevantCounts(errors: string[], scenario: string, value: string): void {
  if (isBlank(value)) return;
  const countMatchesByKey = new Map(
    REQUIRED_COST_COUNT_KEYS.map(key => [
      key,
      [...value.matchAll(new RegExp(`\\b${key}\\s*=\\s*(-?\\d+)\\b`, 'gi'))],
    ]),
  );
  const missing = REQUIRED_COST_COUNT_KEYS.filter(key => (countMatchesByKey.get(key) ?? []).length === 0);
  if (missing.length > 0) {
    errors.push(
      `Metric Table: ${scenario}: Cost-relevant counts must include numeric ${missing.join(', ')} count(s)`,
    );
    return;
  }

  for (const key of REQUIRED_COST_COUNT_KEYS) {
    const matches = countMatchesByKey.get(key) ?? [];
    if (matches.length !== 1) {
      errors.push(
        `Metric Table: ${scenario}: Cost-relevant counts must include exactly one positive numeric ${key} count`,
      );
    }
  }

  const nonPositive = REQUIRED_COST_COUNT_KEYS.filter(key =>
    (countMatchesByKey.get(key) ?? []).some(match => parsePositiveSafeIntegerText(match[1]) === 'invalid'),
  );
  if (nonPositive.length > 0) {
    errors.push(
      `Metric Table: ${scenario}: Cost-relevant counts must include positive numeric ${nonPositive.join(', ')} count(s)`,
    );
  }
  const unsafe = REQUIRED_COST_COUNT_KEYS.filter(key =>
    (countMatchesByKey.get(key) ?? []).some(match => parsePositiveSafeIntegerText(match[1]) === 'unsafe'),
  );
  if (unsafe.length > 0) {
    errors.push(
      `Metric Table: ${scenario}: Cost-relevant counts must include safe integer numeric ${unsafe.join(', ')} count(s)`,
    );
  }
}

function validateShardedLaneRows(rows: ShardedLaneEvidenceRow[]): string[] {
  const errors = validateRequiredNames(
    'Sharded Lane Evidence',
    rows.map(row => row.statement),
    REQUIRED_BENCHMARK_SHARDED_STATEMENTS,
  );

  for (const row of rows) {
    if (!REQUIRED_BENCHMARK_SHARDED_STATEMENTS.includes(row.statement)) {
      errors.push(`Sharded Lane Evidence: ${row.statement}: unexpected statement`);
    }
    if (!ALLOWED_STATUSES.has(row.status as BenchmarkEvidenceStatus)) {
      errors.push(`Sharded Lane Evidence: ${row.statement}: status must be pending, linked, or blocker`);
      continue;
    }
    if (row.status !== 'linked') {
      errors.push(`Sharded Lane Evidence: ${row.statement}: status must be linked before Gate 7 evidence can pass`);
    }
    if (isBlank(row.requiredEvidence)) {
      errors.push(`Sharded Lane Evidence: ${row.statement}: required evidence is required`);
    }
    if (row.status === 'linked') {
      if (!hasEvidenceMarker(row.requiredEvidence)) {
        errors.push(`Sharded Lane Evidence: ${row.statement}: linked status requires a command, link, or artifact marker`);
      } else if (!hasCompletedBenchmarkEvidenceTarget(row.requiredEvidence)) {
        errors.push(
          `Sharded Lane Evidence: ${row.statement}: linked status requires a completed artifact target or non-template evidence link`,
        );
      } else if (!hasNoContradictoryBenchmarkEvidenceMarker(row.requiredEvidence)) {
        errors.push(`Sharded Lane Evidence: ${row.statement}: evidence must not include contradictory benchmark failure markers`);
      }
      if (leavesOpenBenchmarkBlockers(row.requiredEvidence)) {
        errors.push(`Sharded Lane Evidence: ${row.statement}: required evidence must not leave benchmark blockers open`);
      }
    }
    const evidenceFocus = REQUIRED_SHARDED_EVIDENCE_FOCUS[row.statement];
    if (evidenceFocus && !evidenceFocus.pattern.test(row.requiredEvidence)) {
      errors.push(`Sharded Lane Evidence: ${row.statement}: ${evidenceFocus.message}`);
    }
  }

  return errors;
}

function validateBottleneckRows(rows: BottleneckRow[]): string[] {
  const errors = validateRequiredNames(
    'Bottleneck Register',
    rows.map(row => row.bottleneck),
    REQUIRED_BENCHMARK_BOTTLENECKS,
  );

  for (const row of rows) {
    if (!REQUIRED_BENCHMARK_BOTTLENECKS.includes(row.bottleneck)) {
      errors.push(`Bottleneck Register: ${row.bottleneck}: unexpected bottleneck`);
    }
    for (const [label, value] of [
      ['Current evidence', row.currentEvidence],
      ['Impact', row.impact],
      ['Required next action', row.requiredNextAction],
    ] as const) {
      if (isBlank(value)) errors.push(`Bottleneck Register: ${row.bottleneck}: ${label} is required`);
    }
    if (!isBlank(row.currentEvidence)) {
      if (!hasEvidenceMarker(row.currentEvidence)) {
        errors.push(`Bottleneck Register: ${row.bottleneck}: Current evidence must include a command, link, or artifact marker`);
      } else if (!hasCompletedBenchmarkEvidenceTarget(row.currentEvidence)) {
        errors.push(
          `Bottleneck Register: ${row.bottleneck}: Current evidence must include a completed artifact target or non-template evidence link`,
        );
      } else if (!hasNoContradictoryBenchmarkEvidenceMarker(row.currentEvidence)) {
        errors.push(`Bottleneck Register: ${row.bottleneck}: Current evidence must not include contradictory benchmark failure markers`);
      }
      if (leavesOpenBenchmarkBlockers(row.currentEvidence)) {
        errors.push(`Bottleneck Register: ${row.bottleneck}: Current evidence must not leave benchmark blockers open`);
      }
    }
    const bottleneckFocus = REQUIRED_BOTTLENECK_FOCUS[row.bottleneck];
    const impactAndAction = `${row.impact} ${row.requiredNextAction}`;
    if (bottleneckFocus && !bottleneckFocus.pattern.test(impactAndAction)) {
      errors.push(
        `Bottleneck Register: ${row.bottleneck}: impact or next action must mention ${bottleneckFocus.message}`,
      );
    }
  }

  return errors;
}

function validateClaimsBoundary(claimsBoundary: BenchmarkClaimsBoundaryFields): string[] {
  const errors: string[] = [];

  for (const claim of REQUIRED_BENCHMARK_ALLOWED_CLAIMS) {
    if (!claimsBoundary.allowedClaims.includes(claim)) {
      errors.push(`Claims Boundary: missing allowed claim "${claim}"`);
    }
  }

  for (const claim of REQUIRED_BENCHMARK_BLOCKED_CLAIMS) {
    if (!claimsBoundary.blockedClaims.includes(claim)) {
      errors.push(`Claims Boundary: missing blocked claim "${claim}"`);
    }
  }

  return errors;
}

function validatePublicationDecision(
  fields: Partial<BenchmarkPublicationDecisionFields>,
  markdown: string,
): string[] {
  const section = sectionBetween(markdown, '## Publication Decision', '## Reviewer Sign-Off');
  const rawFields = parseTwoColumnTable(section);
  const errors = validateDuplicateRequiredFields(
    'Publication Decision',
    parseTwoColumnFieldNames(section),
    REQUIRED_PUBLICATION_FIELDS,
  );

  for (const field of REQUIRED_PUBLICATION_FIELDS) {
    if (isBlank(rawFields.get(field) ?? '')) errors.push(`Publication Decision: ${field} is required`);
  }

  validateAllowedField(errors, rawFields, 'Publication Decision', 'Release supported', ALLOWED_RELEASE_SUPPORT);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Scaling claims allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Production-ready claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Testnet production-candidate claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Production throughput claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Mainnet-grade evidence linked', ALLOWED_YES_NO);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Release notes updated', ALLOWED_YES_NO);

  const classification = parseTwoColumnTable(sectionBetween(markdown, '## Benchmark Classification', '## Required Commands'));
  const releaseLevel = classification.get('Release level') ?? '';
  const environment = classification.get('Environment') ?? '';
  if (fields.releaseSupported === 'none') {
    errors.push('Publication Decision: Release supported must not be none before benchmark evidence can pass');
  }
  if (
    fields.releaseSupported !== undefined &&
    fields.releaseSupported !== 'none' &&
    releaseExceedsClassificationLevel(fields.releaseSupported, releaseLevel)
  ) {
    errors.push('Publication Decision: Release supported must not exceed Benchmark Classification release level');
  }
  if (releaseLevel === 'production deployment candidate' && fields.releaseSupported !== 'production deployment candidate') {
    errors.push(
      'Publication Decision: production deployment candidate benchmark requires exact Release supported = production deployment candidate',
    );
  }
  if (fields.scalingClaimsAllowed === 'no') {
    errors.push('Publication Decision: Scaling claims allowed must be yes before Gate 7 evidence can pass');
  }
  if (fields.productionReadyClaimAllowed === 'yes') {
    errors.push('Publication Decision: Production-ready claim allowed must be no; mainnet production-ready claims are forbidden');
  }
  if (fields.productionReadyClaimAllowed === 'yes' && fields.releaseSupported !== 'production deployment candidate') {
    errors.push('Publication Decision: production-ready claim requires production deployment candidate support');
  }
  if (
    fields.releaseSupported === 'production deployment candidate' &&
    fields.testnetProductionCandidateClaimAllowed !== 'yes'
  ) {
    errors.push(
      'Publication Decision: production deployment candidate support requires exact Testnet production-candidate claim allowed = yes',
    );
  }
  if (fields.releaseSupported === 'production deployment candidate' && environment !== 'testnet') {
    errors.push('Publication Decision: production deployment candidate support requires exact Benchmark Classification Environment = testnet');
  }
  if (
    fields.testnetProductionCandidateClaimAllowed === 'yes' &&
    fields.releaseSupported !== 'production deployment candidate'
  ) {
    errors.push('Publication Decision: testnet production-candidate claim requires production deployment candidate support');
  }
  if (fields.productionThroughputClaimAllowed === 'yes') {
    errors.push(
      'Publication Decision: Production throughput claim allowed must be no; Gate 7 benchmark evidence only supports bounded measured scaling claims',
    );
  }
  if (fields.mainnetGradeEvidenceLinked === 'yes') {
    errors.push(
      'Publication Decision: Mainnet-grade evidence linked must be no; Gate 7 evidence must not imply mainnet cost, latency, or capacity support',
    );
  }
  if (!isBlank(fields.openBenchmarkBlockers ?? '') && !/^0$/.test(fields.openBenchmarkBlockers ?? '')) {
    errors.push('Publication Decision: Open benchmark blockers must be 0 before benchmark evidence can pass');
  }
  if (fields.releaseNotesUpdated === 'no') {
    errors.push('Publication Decision: Release notes updated must be yes before benchmark evidence can pass');
  }
  errors.push(
    ...validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary: fields.reviewerDecisionSummary ?? '',
      releaseSupported: fields.releaseSupported,
      productionReadyClaimAllowed: fields.productionReadyClaimAllowed,
      testnetProductionCandidateClaimAllowed: fields.testnetProductionCandidateClaimAllowed,
    }),
  );
  validateNoContradictoryBenchmarkDecisionBindings(
    errors,
    'Reviewer decision summary',
    fields.reviewerDecisionSummary ?? '',
  );
  if (
    !isBlank(fields.releaseSupported ?? '') &&
    fields.releaseSupported !== 'none' &&
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !hasExactReleaseSupportedBinding(fields.reviewerDecisionSummary ?? '', fields.releaseSupported ?? '')
  ) {
    errors.push(
      `Publication Decision: Reviewer decision summary must use exact Release supported = ${fields.releaseSupported}`,
    );
  }
  if (
    fields.scalingClaimsAllowed === 'yes' &&
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !hasExactScalingClaimsAllowedBinding(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must use exact Scaling claims allowed = yes',
    );
  }
  if (
    fields.mainnetGradeEvidenceLinked === 'no' &&
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !hasExactMainnetGradeEvidenceLinkedNoBinding(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must use exact Mainnet-grade evidence linked = no',
    );
  }
  if (
    fields.productionReadyClaimAllowed === 'no' &&
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !hasExactProductionReadyClaimDeniedBinding(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
  }
  if (
    (fields.testnetProductionCandidateClaimAllowed === 'yes' ||
      fields.testnetProductionCandidateClaimAllowed === 'no') &&
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !hasExactTestnetProductionCandidateClaimAllowedBinding(
      fields.reviewerDecisionSummary ?? '',
      fields.testnetProductionCandidateClaimAllowed,
    )
  ) {
    errors.push(
      `Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = ${fields.testnetProductionCandidateClaimAllowed}`,
    );
  }
  if (
    fields.productionThroughputClaimAllowed === 'no' &&
    !blocksProductionThroughputClaimInReviewerSummary(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary: production throughput claim handling must be blocked, forbidden, or not allowed',
    );
  }
  if (
    fields.productionThroughputClaimAllowed === 'no' &&
    blocksProductionThroughputClaimInReviewerSummary(fields.reviewerDecisionSummary ?? '') &&
    !hasExactProductionThroughputClaimBlockedBinding(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must use exact Production throughput claim allowed = no',
    );
  }
  if (approvesProductionThroughputClaim(fields.reviewerDecisionSummary ?? '')) {
    errors.push('Publication Decision: Reviewer decision summary must not approve production throughput claim wording');
  }
  if (approvesBaseOrExchangeScaleThroughputClaim(fields.reviewerDecisionSummary ?? '')) {
    errors.push(
      'Publication Decision: Reviewer decision summary must not approve base-level or exchange-scale throughput claim wording',
    );
  }
  if (
    openBenchmarkBlockersAreClosed(fields.openBenchmarkBlockers ?? '') &&
    !closesOpenBenchmarkBlockersInReviewerSummary(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary: open benchmark blocker handling must be 0',
    );
  }
  if (
    openBenchmarkBlockersAreClosed(fields.openBenchmarkBlockers ?? '') &&
    closesOpenBenchmarkBlockersInReviewerSummary(fields.reviewerDecisionSummary ?? '') &&
    !hasExactOpenBenchmarkBlockersBinding(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must use exact Open benchmark blockers = 0',
    );
  }
  if (approvesFullParallelL1SettlementClaim(fields.reviewerDecisionSummary ?? '')) {
    errors.push(
      'Publication Decision: Reviewer decision summary must not approve full parallel L1 settlement while SPVTracker remains shared',
    );
  }
  if (
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !isActionableReviewerDecisionSummary(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must mention release support, measured single/batch/sharded evidence, production-ready claim handling, testnet production-candidate claim handling, and production throughput claim handling',
    );
  }
  if (
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    (
      reviewerSummaryLeavesOpenBenchmarkBlockers(fields.reviewerDecisionSummary ?? '') ||
      (
        mentionsOpenBenchmarkBlockers(fields.reviewerDecisionSummary ?? '') &&
        !closesOpenBenchmarkBlockersInReviewerSummary(fields.reviewerDecisionSummary ?? '')
      )
    )
  ) {
    errors.push('Publication Decision: Reviewer decision summary: open benchmark blockers must be 0');
  }

  validatePublicationEvidenceMarker(
    errors,
    'Required release-note updates',
    fields.requiredReleaseNoteUpdates ?? '',
    'completed Gate 7 benchmark release-note update evidence',
  );
  validateNoContradictoryBenchmarkDecisionBindings(
    errors,
    'Required release-note updates',
    fields.requiredReleaseNoteUpdates ?? '',
  );
  validatePublicationEvidenceMarker(
    errors,
    'Required checklist updates',
    fields.requiredChecklistUpdates ?? '',
    'completed Gate 7 benchmark checklist update evidence',
  );
  validateNoContradictoryBenchmarkDecisionBindings(
    errors,
    'Required checklist updates',
    fields.requiredChecklistUpdates ?? '',
  );
  if (
    fields.releaseSupported === 'production deployment candidate' &&
    !isBlank(fields.requiredReleaseNoteUpdates ?? '') &&
    !hasExactProductionCandidateReleaseSupportedBinding(fields.requiredReleaseNoteUpdates ?? '')
  ) {
    errors.push(
      'Publication Decision: Required release-note updates must use exact Release supported = production deployment candidate',
    );
  }
  if (
    fields.releaseSupported === 'production deployment candidate' &&
    !isBlank(fields.requiredChecklistUpdates ?? '') &&
    !hasExactProductionCandidateReleaseSupportedBinding(fields.requiredChecklistUpdates ?? '')
  ) {
    errors.push(
      'Publication Decision: Required checklist updates must use exact Release supported = production deployment candidate',
    );
  }
  if (
    fields.scalingClaimsAllowed === 'yes' &&
    !isBlank(fields.requiredReleaseNoteUpdates ?? '') &&
    !hasExactScalingClaimsAllowedBinding(fields.requiredReleaseNoteUpdates ?? '')
  ) {
    errors.push('Publication Decision: Required release-note updates must use exact Scaling claims allowed = yes');
  }
  if (
    fields.scalingClaimsAllowed === 'yes' &&
    !isBlank(fields.requiredChecklistUpdates ?? '') &&
    !hasExactScalingClaimsAllowedBinding(fields.requiredChecklistUpdates ?? '')
  ) {
    errors.push('Publication Decision: Required checklist updates must use exact Scaling claims allowed = yes');
  }
  if (
    fields.productionReadyClaimAllowed === 'no' &&
    !isBlank(fields.requiredReleaseNoteUpdates ?? '') &&
    !hasExactProductionReadyClaimDeniedBinding(fields.requiredReleaseNoteUpdates ?? '')
  ) {
    errors.push(
      'Publication Decision: Required release-note updates must use exact Production-ready claim allowed = no',
    );
  }
  if (
    fields.productionReadyClaimAllowed === 'no' &&
    !isBlank(fields.requiredChecklistUpdates ?? '') &&
    !hasExactProductionReadyClaimDeniedBinding(fields.requiredChecklistUpdates ?? '')
  ) {
    errors.push(
      'Publication Decision: Required checklist updates must use exact Production-ready claim allowed = no',
    );
  }
  if (
    fields.productionThroughputClaimAllowed === 'no' &&
    !isBlank(fields.requiredReleaseNoteUpdates ?? '') &&
    !hasExactProductionThroughputClaimBlockedBinding(fields.requiredReleaseNoteUpdates ?? '')
  ) {
    errors.push('Publication Decision: Required release-note updates must use exact Production throughput claim allowed = no');
  }
  if (
    fields.productionThroughputClaimAllowed === 'no' &&
    !isBlank(fields.requiredChecklistUpdates ?? '') &&
    !hasExactProductionThroughputClaimBlockedBinding(fields.requiredChecklistUpdates ?? '')
  ) {
    errors.push('Publication Decision: Required checklist updates must use exact Production throughput claim allowed = no');
  }
  if (
    (fields.testnetProductionCandidateClaimAllowed === 'yes' ||
      fields.testnetProductionCandidateClaimAllowed === 'no') &&
    !isBlank(fields.requiredReleaseNoteUpdates ?? '') &&
    !hasExactTestnetProductionCandidateClaimAllowedBinding(
      fields.requiredReleaseNoteUpdates ?? '',
      fields.testnetProductionCandidateClaimAllowed,
    )
  ) {
    errors.push(
      `Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = ${fields.testnetProductionCandidateClaimAllowed}`,
    );
  }
  if (
    (fields.testnetProductionCandidateClaimAllowed === 'yes' ||
      fields.testnetProductionCandidateClaimAllowed === 'no') &&
    !isBlank(fields.requiredChecklistUpdates ?? '') &&
    !hasExactTestnetProductionCandidateClaimAllowedBinding(
      fields.requiredChecklistUpdates ?? '',
      fields.testnetProductionCandidateClaimAllowed,
    )
  ) {
    errors.push(
      `Publication Decision: Required checklist updates must use exact Testnet production-candidate claim allowed = ${fields.testnetProductionCandidateClaimAllowed}`,
    );
  }
  if (
    fields.mainnetGradeEvidenceLinked === 'no' &&
    !isBlank(fields.requiredReleaseNoteUpdates ?? '') &&
    !hasExactMainnetGradeEvidenceLinkedNoBinding(fields.requiredReleaseNoteUpdates ?? '')
  ) {
    errors.push(
      'Publication Decision: Required release-note updates must use exact Mainnet-grade evidence linked = no',
    );
  }
  if (
    fields.mainnetGradeEvidenceLinked === 'no' &&
    !isBlank(fields.requiredChecklistUpdates ?? '') &&
    !hasExactMainnetGradeEvidenceLinkedNoBinding(fields.requiredChecklistUpdates ?? '')
  ) {
    errors.push(
      'Publication Decision: Required checklist updates must use exact Mainnet-grade evidence linked = no',
    );
  }
  if (
    hasCompletedBenchmarkReleaseNoteUpdateEvidence(fields.requiredReleaseNoteUpdates ?? '') &&
    hasCompletedBenchmarkChecklistUpdateEvidence(fields.requiredChecklistUpdates ?? '') &&
    haveSharedConcreteBenchmarkEvidenceTarget(
      fields.requiredReleaseNoteUpdates ?? '',
      fields.requiredChecklistUpdates ?? '',
    )
  ) {
    errors.push(
      'Publication Decision: Required release-note updates and Required checklist updates must use distinct completed Gate 7 benchmark evidence targets',
    );
  }

  return errors;
}

function validatePublicationEvidenceMarker(
  errors: string[],
  field: string,
  value: string,
  evidenceKind: string,
): void {
  if (isBlank(value)) return;
  if (!identifiesBenchmarkPublicationEvidenceKind(value, evidenceKind)) {
    errors.push(`Publication Decision: ${field} must include ${evidenceKind}`);
  }
  if (!hasEvidenceMarker(value)) {
    errors.push(`Publication Decision: ${field} must include a link, command, or artifact marker`);
  } else if (!hasCompletedBenchmarkEvidenceTarget(value)) {
    errors.push(
      `Publication Decision: ${field} must include ${evidenceKind} with a completed artifact target or non-template evidence link`,
    );
  }
  if (!hasNoContradictoryBenchmarkEvidenceMarker(value)) {
    errors.push(`Publication Decision: ${field} must not include contradictory benchmark failure markers`);
  }
  if (leavesOpenBenchmarkBlockers(value)) {
    errors.push(`Publication Decision: ${field} must not leave benchmark blockers open`);
  }
  if (usesNonExactBenchmarkBlockerClosure(value)) {
    errors.push(
      `Publication Decision: ${field} must use exact numeric Open benchmark blockers = 0; textual or shorthand benchmark blocker terms are not accepted`,
    );
  }
  if (containsMainnetProductionClaim(value)) {
    errors.push(`Publication Decision: ${field} must not contain mainnet production claim wording`);
  }
  if (containsProductionReadyClaim(value)) {
    errors.push(`Publication Decision: ${field} must not contain production-ready claim wording`);
  }
  if (approvesProductionThroughputClaim(value)) {
    errors.push(`Publication Decision: ${field} must not approve production throughput claim wording`);
  }
  if (usesProseOnlyProductionThroughputClaimClosure(value)) {
    errors.push(
      `Publication Decision: ${field} must use exact Production throughput claim allowed = no; prose-only production-throughput closure is not accepted`,
    );
  }
  if (usesProseOnlyScalingClaimAllowance(value)) {
    errors.push(
      `Publication Decision: ${field} must use exact Scaling claims allowed = yes; prose-only scaling-claim allowance is not accepted`,
    );
  }
  if (approvesBaseOrExchangeScaleThroughputClaim(value)) {
    errors.push(`Publication Decision: ${field} must not approve base-level or exchange-scale throughput claim wording`);
  }
  if (approvesFullParallelL1SettlementClaim(value)) {
    errors.push(
      `Publication Decision: ${field} must not approve full parallel L1 settlement while SPVTracker remains shared`,
    );
  }
}

function validateNoContradictoryBenchmarkDecisionBindings(
  errors: string[],
  field: string,
  value: string,
): void {
  if (isBlank(value)) return;
  if (hasContradictoryBenchmarkDecisionBinding(value)) {
    errors.push(`Publication Decision: ${field} must not include contradictory benchmark decision bindings`);
  }
}

function validateReviewerRows(rows: ReviewerSignoffRow[]): string[] {
  const errors = validateRequiredNames(
    'Reviewer Sign-Off',
    rows.map(row => row.role),
    REQUIRED_BENCHMARK_REVIEWER_ROLES,
  );

  for (const row of rows) {
    if (!REQUIRED_BENCHMARK_REVIEWER_ROLES.includes(row.role)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: unexpected role`);
    }
    if (isBlank(row.name)) errors.push(`Reviewer Sign-Off: ${row.role}: name is required`);
    if (!ALLOWED_REVIEWER_DECISIONS.has(row.decision as ReviewerDecision)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve or block`);
    } else if (row.decision !== 'approve') {
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve before benchmark evidence can pass`);
    }
    if (isBlank(row.date)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: Date must use YYYY-MM-DD`);
    }
    if (isBlank(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes are required`);
    } else if (containsMainnetProductionClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not contain mainnet production claim wording`);
    } else if (containsProductionReadyClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not contain production-ready claim wording`);
    } else if (approvesProductionThroughputClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve production throughput claim wording`);
    } else if (approvesBaseOrExchangeScaleThroughputClaim(row.notes)) {
      errors.push(
        `Reviewer Sign-Off: ${row.role}: notes must not approve base-level or exchange-scale throughput claim wording`,
      );
    } else if (approvesFullParallelL1SettlementClaim(row.notes)) {
      errors.push(
        `Reviewer Sign-Off: ${row.role}: notes must not approve full parallel L1 settlement while SPVTracker remains shared`,
      );
    } else if (!hasNoContradictoryBenchmarkReviewerNoteMarker(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not include contradictory benchmark failure markers`);
    } else if (hasContradictoryBenchmarkDecisionBinding(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not include contradictory benchmark decision bindings`);
    } else if (leavesOpenBenchmarkBlockers(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not leave benchmark blockers open`);
    } else if (!isActionableReviewerNote(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must state a concrete benchmark outcome`);
    } else if (!isConcreteBenchmarkReviewerNote(row.notes)) {
      errors.push(
        `Reviewer Sign-Off: ${row.role}: notes must cite benchmark metrics, scaling limits, live batch evidence, or the claims boundary`,
      );
    }
  }

  return errors;
}

function containsMainnetProductionClaim(value: string): boolean {
  return classifyPublicationClaimText(value).hasMainnetProductionClaim;
}

function containsProductionReadyClaim(value: string): boolean {
  return classifyPublicationClaimText(value).hasProductionReadyClaim;
}

function approvesProductionThroughputClaim(value: string): boolean {
  return normalizeReviewerDecisionTextSegments(value).some(segment =>
    benchmarkClaimTextApprovesSubject(
      stripExactProductionThroughputClaimBlockedBinding(segment),
      '(?:production throughput claim handling|production throughput claims?|' +
        'production throughput(?:\\s+claim)?\\s+(?:allowed|handling|control))',
      benchmarkClaimApprovalTerms(),
    ),
  );
}

function stripExactProductionThroughputClaimBlockedBinding(normalized: string): string {
  return normalized.replace(/\bproduction throughput claim allowed no\b/g, ' ').replace(/\s+/g, ' ').trim();
}

function approvesBaseOrExchangeScaleThroughputClaim(value: string): boolean {
  return normalizeReviewerDecisionTextSegments(value).some(segment =>
    benchmarkClaimTextApprovesSubject(
      segment,
      '(?:base level throughput(?: claims?)?|exchange scale throughput(?: claims?)?|' +
        'base level (?:or|and) exchange scale throughput(?: claims?)?)',
      benchmarkClaimApprovalTerms(),
    ),
  );
}

function approvesFullParallelL1SettlementClaim(value: string): boolean {
  return normalizeReviewerDecisionTextSegments(value).some(segment =>
    benchmarkClaimTextApprovesSubject(
      segment,
      '(?:full parallel l1 settlement(?:\\s+(?:claims?|claim handling))?)',
      benchmarkClaimApprovalTerms(),
    ),
  );
}

function benchmarkClaimApprovalTerms(): string {
  return '(?:yes|accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|enable|enabled|enables|support|supported|supports|permit|permitted|permits|clear|cleared|clears|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits)';
}

function benchmarkClaimTextApprovesSubject(
  normalized: string,
  subject: string,
  approval: string,
): boolean {
  const approvalConnector =
    '(?:\\s+(?!\\b(?:but|however|though|although|except|unless|not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,2}';

  return [
    new RegExp(`\\b${subject}\\b\\s+${approval}\\b`, 'gi'),
    new RegExp(`\\b${subject}\\b\\s+(?:is|are|was|were|be|been|being|remain|remains)\\s+${approval}\\b`, 'gi'),
    new RegExp(`\\b${approval}\\b${approvalConnector}\\s+${subject}\\b`, 'gi'),
  ].some(pattern => hasUnnegatedBenchmarkClaimApproval(normalized, pattern));
}

function hasUnnegatedBenchmarkClaimApproval(normalized: string, pattern: RegExp): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 32), index);
    if (!/\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?(?:\s+benchmark)?\s+$/.test(prefix)) return true;
  }
  return false;
}

function validateReviewerIdentityConsistency(
  classification: Map<string, string>,
  rows: ReviewerSignoffRow[],
): string[] {
  const classifiedReviewer = classification.get('Reviewer')?.trim() ?? '';
  const benchmarkOwnerSignoff = rows.find(row => row.role === 'Benchmark owner')?.name.trim() ?? '';

  if (
    classifiedReviewer.length > 0 &&
    benchmarkOwnerSignoff.length > 0 &&
    classifiedReviewer !== benchmarkOwnerSignoff
  ) {
    return ['Reviewer Sign-Off: Benchmark owner: name must match Benchmark Classification Reviewer'];
  }

  return [];
}

function validateReviewerDateConsistency(
  classification: Map<string, string>,
  rows: ReviewerSignoffRow[],
): string[] {
  const classificationDate = classification.get('Date')?.trim() ?? '';
  if (!isIsoCalendarDate(classificationDate)) return [];

  return rows
    .filter(row => isIsoCalendarDate(row.date) && row.date < classificationDate)
    .map(row => `Reviewer Sign-Off: ${row.role}: Date must not be before Benchmark Classification Date`);
}


function isActionableReviewerNote(value: string): boolean {
  return (
    /\b(accept|accepted|approve|approved|verify|verified|validate|validated|confirm|confirmed|pass|passed|block|blocked|fail|failed|measure|measured|match|matched|complete|completed)\b/i.test(value) &&
    /\b(benchmark|metric|measurement|numeric|unit|throughput|latency|proof size|transaction size|cost|sharded|lane|bottleneck|scaling|ContextExtension|DUP|SPVTracker|liquidity|mempool|signing|live batch|claim boundary)\b/i.test(value)
  );
}

function isConcreteBenchmarkReviewerNote(value: string): boolean {
  return (
    /\bsingle[- ]claim\b|\bbatch[- ]settlement\b|\bsharded[- ]lanes?\b|\blive[- ]batch\b/i.test(value) ||
    /\bsample count\b|\bthroughput\b|\blatency\b|\bproof size\b|\btransaction size\b|\bcost[- ]relevant counts?\b|\bnumeric measurements?\b/i.test(value) ||
    /\bContextExtension\b|\bbatch unlock\b|\bclaim[- ]core\b|\bDUP\b|\bSPVTracker\b|\bliquidity\b|\btransaction size limit\b|\bmempool\b|\bsigning readiness\b/i.test(value) ||
    /\bclaims? boundary\b|\bproduction-ready claim handling\b|\bproduction throughput\b|\bmainnet-grade evidence\b|\bfull parallel L1\b|\btrustless burn verification\b/i.test(value)
  );
}

function isActionableReviewerDecisionSummary(value: string): boolean {
  const normalized = normalizeWhitespace(value);
  return (
    /\brelease supported\b/i.test(normalized) &&
    /\bmeasured\b/i.test(normalized) &&
    /\bsingle\b/i.test(normalized) &&
    /\bbatch\b/i.test(normalized) &&
    /\bsharded\b|\bsharded[- ]lane\b/i.test(normalized) &&
    /\bproduction-ready claim handling\b/i.test(normalized) &&
    /\btestnet[- ]production[- ]candidate claim handling\b/i.test(normalized) &&
    /\bproduction throughput claim handling\b/i.test(normalized)
  );
}

function blocksProductionThroughputClaimInReviewerSummary(value: string): boolean {
  const normalized = normalizeReviewerDecisionText(value);
  return (
    /\bproduction throughput claim handling\s+(?:blocked|forbidden|not allowed)\b/.test(normalized) ||
    /\bproduction throughput claims?\s+(?:remain\s+|are\s+|is\s+)?(?:blocked|forbidden|not allowed)\b/.test(normalized) ||
    /\bproduction throughput(?:\s+claim)?\s+(?:allowed|handling|control)\s+(?:blocked|forbidden|not allowed)\b/.test(normalized)
  );
}

function hasExactProductionThroughputClaimBlockedBinding(value: string): boolean {
  return /\bProduction throughput claim allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function usesProseOnlyProductionThroughputClaimClosure(value: string): boolean {
  return (
    blocksProductionThroughputClaimInReviewerSummary(value) &&
    !hasExactProductionThroughputClaimBlockedBinding(value)
  );
}

function hasExactScalingClaimsAllowedBinding(value: string): boolean {
  return /\bScaling claims allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactMainnetGradeEvidenceLinkedNoBinding(value: string): boolean {
  return /\bMainnet-grade evidence linked\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactTestnetProductionCandidateClaimAllowedBinding(
  value: string,
  expected: 'yes' | 'no',
): boolean {
  return new RegExp(`\\bTestnet production-candidate claim allowed\\s*=\\s*${expected}\\s*(?:$|[.;,|)\\]\\r\\n])`, 'i').test(value);
}

function hasExactProductionReadyClaimDeniedBinding(value: string): boolean {
  return /\bProduction-ready claim allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactProductionCandidateReleaseSupportedBinding(value: string): boolean {
  return hasExactReleaseSupportedBinding(value, 'production deployment candidate');
}

function hasExactReleaseSupportedBinding(value: string, expected: string): boolean {
  return new RegExp(`\\bRelease supported\\s*=\\s*${escapeRegExp(expected)}\\s*(?:$|[.;,|)\\]\\r\\n])`, 'i').test(value);
}

function approvesScalingClaimAllowance(value: string): boolean {
  return normalizeReviewerDecisionTextSegments(value).some(segment =>
    benchmarkClaimTextApprovesSubject(
      segment,
      '(?:scaling claims?|scaling claim handling|bounded measured scaling claims?)',
      benchmarkClaimApprovalTerms(),
    ),
  );
}

function usesProseOnlyScalingClaimAllowance(value: string): boolean {
  return approvesScalingClaimAllowance(value) && !hasExactScalingClaimsAllowedBinding(value);
}

function mentionsOpenBenchmarkBlockers(value: string): boolean {
  return /\bopen benchmark blockers?\b|\bbenchmark blockers?\b/.test(normalizeReviewerDecisionText(value));
}

function openBenchmarkBlockersAreClosed(value: string): boolean {
  return /^(0|none)$/i.test(value.trim());
}

function leavesOpenBenchmarkBlockers(value: string): boolean {
  const normalized = normalizeReviewerDecisionText(value);
  return (
    hasAmbiguousOpenBenchmarkBlockerCount(value) ||
    /\bopen benchmark blockers?\s+(?:are\s+)?(?:open|remaining|unresolved|outstanding|pending)\s+(?!0\b|zero\b|none\b|no\b|closed\b|resolved\b|mitigated\b)\S+\b/.test(normalized) ||
    /\bbenchmark blockers?\s+(?:are\s+)?(?:open|remaining|unresolved|outstanding|pending)\s+(?!0\b|zero\b|none\b|no\b|closed\b|resolved\b|mitigated\b)\S+\b/.test(normalized) ||
    /\bopen benchmark blocker handling\s+(?!0\b|zero\b|none\b|no\b|closed\b|resolved\b|mitigated\b)\S+\b/.test(normalized) ||
    /\b(?:open\s+)?benchmark blockers?\s+(?:count|total|remaining)\s+(?!0\b|zero\b|none\b|no\b|closed\b|resolved\b|mitigated\b)\S+\b/.test(normalized) ||
    /\b(?:open|unresolved|outstanding|remaining|pending)\s+benchmark blockers?\s+(?!handling\b|are\b|is\b|not\b|never\b|without\b|absent\b|absence\b|lack\b|lacks\b|lacking\b|approved\b|accepted\b|rejected\b|refused\b|denied\b)(?!0\b|zero\b|none\b|no\b|closed\b|resolved\b|mitigated\b)\S+\b/.test(normalized)
  );
}

function hasAmbiguousOpenBenchmarkBlockerCount(value: string): boolean {
  return /\b(?:open\s+)?benchmark blockers?\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value) ||
    /\bopen benchmark blocker handling\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value);
}

function usesTextualBenchmarkBlockerClosure(value: string): boolean {
  const normalized = normalizeReviewerDecisionText(value);
  const textualClosure = '(?:zero|none|no|closed|resolved|mitigated)';
  return (
    new RegExp(`\\bopen benchmark blockers?\\s+(?:are\\s+)?${textualClosure}\\b`).test(normalized) ||
    new RegExp(`\\bbenchmark blockers?\\s+(?:are\\s+)?(?:(?:open|remaining|unresolved|outstanding)\\s+)?${textualClosure}\\b`).test(normalized) ||
    new RegExp(`\\bopen benchmark blocker handling\\s+${textualClosure}\\b`).test(normalized) ||
    new RegExp(`\\b${textualClosure}\\s+(?:open\\s+)?benchmark blockers?\\b`).test(normalized)
  );
}

function hasExactOpenBenchmarkBlockersBinding(value: string): boolean {
  return /\bOpen benchmark blockers\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasContradictoryBenchmarkDecisionBinding(value: string): boolean {
  return (
    hasMixedBenchmarkDecisionBindings(
      value,
      'Release supported',
      'none|validated\\s+PoC|institutional\\s+reference|production\\s+deployment\\s+candidate',
    ) ||
    hasOpposingBenchmarkDecisionBindings(value, 'Scaling claims allowed') ||
    hasOpposingBenchmarkDecisionBindings(value, 'Production[-\\s]+ready claim allowed') ||
    hasOpposingBenchmarkDecisionBindings(value, 'Testnet production[-\\s]+candidate claim allowed') ||
    hasOpposingBenchmarkDecisionBindings(value, 'Production throughput claim allowed') ||
    hasOpposingBenchmarkDecisionBindings(value, 'Mainnet[-\\s]+grade evidence linked') ||
    hasMixedOpenBenchmarkBlockerBindings(value)
  );
}

function hasMixedBenchmarkDecisionBindings(
  value: string,
  fieldPattern: string,
  valuePattern: string,
): boolean {
  return exactBenchmarkDecisionBindingValues(value, fieldPattern, valuePattern).size > 1;
}

function hasOpposingBenchmarkDecisionBindings(value: string, fieldPattern: string): boolean {
  const values = exactBenchmarkDecisionBindingValues(value, fieldPattern, 'yes|no');
  return values.has('yes') && values.has('no');
}

function hasMixedOpenBenchmarkBlockerBindings(value: string): boolean {
  const values = exactBenchmarkDecisionBindingValues(value, 'Open benchmark blockers', '\\d+');
  return values.has('0') && Array.from(values).some(count => count !== '0');
}

function exactBenchmarkDecisionBindingValues(
  value: string,
  fieldPattern: string,
  valuePattern: string,
): Set<string> {
  const pattern = new RegExp(
    `\\b${fieldPattern}\\s*=\\s*(${valuePattern})\\s*(?:$|[.;,|)\\]\\r\\n])`,
    'ig',
  );
  return new Set(
    Array.from(value.matchAll(pattern), match => normalizeReviewerDecisionText(match[1] ?? '')),
  );
}

function usesNumericBenchmarkBlockerClosure(value: string): boolean {
  const normalized = normalizeReviewerDecisionText(value);
  return (
    /\bopen benchmark blockers?\s+(?:are\s+)?0\b/.test(normalized) ||
    /\bbenchmark blockers?\s+(?:are\s+)?0\b/.test(normalized) ||
    /\bopen benchmark blocker handling\s+0\b/.test(normalized) ||
    /\bbenchmark blocker (?:closure|count|handling)\s+0\b/.test(normalized) ||
    /\b0\s+(?:open\s+)?benchmark blockers?\b/.test(normalized)
  );
}

function usesNonExactBenchmarkBlockerClosure(value: string): boolean {
  return (
    (usesTextualBenchmarkBlockerClosure(value) || usesNumericBenchmarkBlockerClosure(value)) &&
    !hasExactOpenBenchmarkBlockersBinding(value)
  );
}

function closesOpenBenchmarkBlockersInReviewerSummary(value: string): boolean {
  const normalized = normalizeReviewerDecisionText(value);
  return (
    /\bopen benchmark blocker handling\s+0(?:\s+open\s+blockers?)?\b/.test(normalized) ||
    reviewerSummaryHasExactOpenBenchmarkBlockerHandlingBinding(value)
  );
}

function reviewerSummaryLeavesOpenBenchmarkBlockers(value: string): boolean {
  return value.split(/[\n\r|;]+|[.]\s+/).some(segment =>
    !reviewerSummaryHasExactOpenBenchmarkBlockerHandlingBinding(segment) &&
    leavesOpenBenchmarkBlockers(segment),
  );
}

function reviewerSummaryHasExactOpenBenchmarkBlockerHandlingBinding(value: string): boolean {
  return value.split(/[\n\r|;]+|[.]\s+/).some(segment =>
    /\bopen benchmark blocker handling\b/i.test(segment) &&
    /\bOpen benchmark blockers\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(segment),
  );
}

function normalizeReviewerDecisionText(value: string): string {
  return normalizeEvidenceMarkerText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeReviewerDecisionTextSegments(value: string): string[] {
  return value
    .split(/[\n\r|;]+|[.]\s+/)
    .map(segment => normalizeReviewerDecisionText(segment))
    .filter(segment => segment.length > 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function releaseExceedsClassificationLevel(releaseSupported: string, releaseLevel: string): boolean {
  const supportedRank = RELEASE_LEVEL_RANK.get(releaseSupported);
  const classificationRank = RELEASE_LEVEL_RANK.get(releaseLevel);
  if (supportedRank === undefined || classificationRank === undefined) return false;
  return supportedRank > classificationRank;
}

function validateAllowedField(
  errors: string[],
  fields: Map<string, string>,
  section: string,
  field: string,
  allowed: Set<string>,
): void {
  const value = fields.get(field) ?? '';
  if (!isBlank(value) && !allowed.has(value)) {
    errors.push(`${section}: ${field} must be one of ${[...allowed].join(', ')}`);
  }
}

function parseTableBetween(markdown: string, startHeading: string, endHeading?: string): string[][] {
  const section = sectionBetween(markdown, startHeading, endHeading);
  const firstTableLine = section.search(/^\|/m);
  if (firstTableLine < 0) throw new Error(`${startHeading}: table not found`);
  return parseMarkdownTableRows(section.slice(firstTableLine));
}

function parseTwoColumnFieldNames(section: string): string[] {
  return parseMarkdownTableRows(section)
    .filter(row => row.length >= 2)
    .map(row => row[0]);
}

function parseTwoColumnTable(section: string): Map<string, string> {
  const fields = new Map<string, string>();
  const rows = parseMarkdownTableRows(section);
  for (const row of rows) {
    if (row.length >= 2) fields.set(row[0], row[1]);
  }
  return fields;
}

function sectionBetween(markdown: string, startHeading: string, endHeading?: string): string {
  const start = markdown.indexOf(startHeading);
  if (start < 0) return '';

  const contentStart = start + startHeading.length;
  const end = endHeading ? markdown.indexOf(endHeading, contentStart) : markdown.length;
  return markdown.slice(contentStart, end < 0 ? markdown.length : end);
}

function hasEvidenceMarker(value: string): boolean {
  return /\bnpm run [A-Za-z0-9:_-]+\b/.test(value) || /\[[^\]]+\]\([^)]+\)/.test(value) || /^artifact:\/\//.test(value);
}

function hasCompletedEvidenceMarker(value: string): boolean {
  return hasCompletedArtifactTarget(value) || hasNonTemplateMarkdownLink(value);
}

export function hasCompletedBenchmarkCommandEvidence(row: BenchmarkCommandRow): boolean {
  return (
    REQUIRED_BENCHMARK_COMMANDS.includes(row.command) &&
    row.status === 'linked' &&
    !isGenericBenchmarkRowPayload(row.expectedResult) &&
    !isGenericBenchmarkRowPayload(row.evidence) &&
    hasEvidenceMarker(row.evidence) &&
    hasCompletedBenchmarkEvidenceTarget(row.evidence) &&
    hasNoContradictoryBenchmarkEvidenceMarker(row.evidence) &&
    benchmarkCommandEvidenceIdentifiesCommand(row.command, row.evidence) &&
    hasExplicitCommandExitCodeZero(row.expectedResult) &&
    hasExplicitCommandExitCodeZero(row.evidence) &&
    hasInternallyPositiveBenchmarkCommandOutput(row.expectedResult, row.evidence)
  );
}

export function hasCompletedBenchmarkMetricEvidence(row: BenchmarkMetricRow): boolean {
  const metricFocus = REQUIRED_METRIC_EVIDENCE_FOCUS[row.scenario];
  return (
    Boolean(metricFocus) &&
    !isGenericBenchmarkRowPayload(row.evidenceCommandOrLog) &&
    hasEvidenceMarker(row.evidenceCommandOrLog) &&
    hasCompletedBenchmarkEvidenceTarget(row.evidenceCommandOrLog) &&
    hasNoContradictoryBenchmarkEvidenceMarker(row.evidenceCommandOrLog) &&
    metricFocus.pattern.test(row.evidenceCommandOrLog) &&
    hasValidBenchmarkMetricMeasurements(row)
  );
}

export function hasCompletedBenchmarkShardedLaneEvidence(row: ShardedLaneEvidenceRow): boolean {
  const evidenceFocus = REQUIRED_SHARDED_EVIDENCE_FOCUS[row.statement];
  return (
    Boolean(evidenceFocus) &&
    !isGenericBenchmarkRowPayload(row.requiredEvidence) &&
    hasEvidenceMarker(row.requiredEvidence) &&
    hasCompletedBenchmarkEvidenceTarget(row.requiredEvidence) &&
    hasNoContradictoryBenchmarkEvidenceMarker(row.requiredEvidence) &&
    evidenceFocus.pattern.test(row.requiredEvidence)
  );
}

export function hasCompletedBenchmarkBottleneckEvidence(row: BottleneckRow): boolean {
  const bottleneckFocus = REQUIRED_BOTTLENECK_FOCUS[row.bottleneck];
  const impactAndAction = `${row.impact} ${row.requiredNextAction}`;
  return (
    Boolean(bottleneckFocus) &&
    !isGenericBenchmarkRowPayload(row.currentEvidence) &&
    !isGenericBenchmarkRowPayload(row.impact) &&
    !isGenericBenchmarkRowPayload(row.requiredNextAction) &&
    hasEvidenceMarker(row.currentEvidence) &&
    hasCompletedBenchmarkEvidenceTarget(row.currentEvidence) &&
    hasNoContradictoryBenchmarkEvidenceMarker(row.currentEvidence) &&
    bottleneckFocus.pattern.test(impactAndAction)
  );
}

function benchmarkCommandEvidenceIdentifiesCommand(command: string, evidence: string): boolean {
  const normalizedCommandPattern = escapeRegExp(command).replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${normalizedCommandPattern}\\b`, 'i').test(evidence);
}

function hasInternallyPositiveBenchmarkCommandOutput(expectedResult: string, evidence: string): boolean {
  return (
    hasPositiveBenchmarkCommandResult(expectedResult) &&
    hasPositiveBenchmarkCommandResult(evidence) &&
    /\b(command output|output|log|transcript|run|exit code|PASS|passed|success|successful|completed)\b/i
      .test(evidence)
  );
}

function hasExplicitCommandExitCodeZero(value: string): boolean {
  return /\bexit[- ]?code\s*(?:=|:)?\s*0\b(?!\s*\/)/i.test(normalizeWhitespace(value));
}

function hasPositiveBenchmarkCommandResult(value: string): boolean {
  const normalized = normalizeWhitespace(normalizeEvidenceMarkerText(value));
  return (
    normalized.length > 0 &&
    !hasContradictoryBenchmarkEvidenceFailureMarker(normalized) &&
    /\b(PASS|PASSED|SUCCESS|SUCCESSFUL|COMPLETED|OK|EXIT\s+CODE\s*0|0\s+STRUCTURAL\s+ISSUES?|0\s+FAILURES?)\b/i
      .test(normalized)
  );
}

export function hasCompletedBenchmarkEvidenceTarget(value: string): boolean {
  const completedEvidenceText = benchmarkCompletedEvidenceText(value);
  return !hasLocalOnlyEvidenceTarget(value) &&
    hasCompletedEvidenceMarker(completedEvidenceText);
}

export function hasCompletedBenchmarkReleaseNoteUpdateEvidence(value: string): boolean {
  return (
    hasCompletedBenchmarkEvidenceTarget(value) &&
    identifiesBenchmarkReleaseNoteUpdateEvidence(value) &&
    hasNoContradictoryBenchmarkEvidenceMarker(value)
  );
}

export function hasCompletedBenchmarkChecklistUpdateEvidence(value: string): boolean {
  return (
    hasCompletedBenchmarkEvidenceTarget(value) &&
    identifiesBenchmarkChecklistUpdateEvidence(value) &&
    hasNoContradictoryBenchmarkEvidenceMarker(value)
  );
}

export function hasNoContradictoryBenchmarkEvidenceMarker(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);
  return (
    !hasContradictoryBenchmarkEvidenceFailureMarker(normalized) &&
    !hasUnresolvedIssueMarker(normalized)
  );
}

function hasNoContradictoryBenchmarkReviewerNoteMarker(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);
  return !hasContradictoryBenchmarkReviewerFailureMarker(normalized) && !hasUnresolvedIssueMarker(normalized);
}

function hasContradictoryBenchmarkEvidenceFailureMarker(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);
  return CONTRADICTORY_READINESS_FAILURE_PATTERN.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized);
}

function hasContradictoryBenchmarkReviewerFailureMarker(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);
  return CONTRADICTORY_REVIEWER_NOTE_FAILURE_PATTERN.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized);
}

export function isActionableBenchmarkReviewerNote(value: string): boolean {
  return (
    !isGenericBenchmarkRowPayload(value) &&
    hasNoContradictoryBenchmarkReviewerNoteMarker(value) &&
    isActionableReviewerNote(value) &&
    isConcreteBenchmarkReviewerNote(value)
  );
}

function hasValidBenchmarkMetricMeasurements(row: BenchmarkMetricRow): boolean {
  return (
    hasValidSampleCount(row.sampleCount) &&
    hasBenchmarkMetricSampleCountEvidence(row) &&
    hasBenchmarkMetricCostRelevantCountEvidence(row) &&
    hasPositivePatternedMeasurement(row.buildTime, /\d+(?:\.\d+)?\s*(?:ms|s)\b/i) &&
    hasPositivePatternedMeasurement(row.proofSize, /\d+(?:\.\d+)?\s*(?:bytes|b|kb|mb)\b/i) &&
    hasPositivePatternedMeasurement(row.transactionSize, /\d+(?:\.\d+)?\s*(?:bytes|b|kb|mb)\b/i) &&
    hasPositivePatternedMeasurement(row.costRelevantCounts, /\b(?:inputs|outputs|vars|batch|cost|jit|eval)\s*=\s*\d+/i) &&
    hasValidBenchmarkCostRelevantCounts(row.costRelevantCounts) &&
    hasPositivePatternedMeasurement(row.throughput, /\d+(?:\.\d+)?.*(?:settlement|claim|batch|tx|block|minute|min|\/)/i) &&
    hasPositivePatternedMeasurement(row.latency, /\d+(?:\.\d+)?.*(?:ms|s|sec|block|minute|min)/i)
  );
}

function hasValidSampleCount(value: string): boolean {
  const sampleCount = parsePositiveSafeIntegerText(value);
  return typeof sampleCount === 'number' && sampleCount >= MIN_SAMPLE_COUNT;
}

function hasBenchmarkMetricSampleCountEvidence(row: BenchmarkMetricRow): boolean {
  const sampleCount = parsePositiveSafeIntegerText(row.sampleCount);
  return typeof sampleCount === 'number' &&
    metricEvidenceCitesSampleCount(row.evidenceCommandOrLog, sampleCount);
}

function hasBenchmarkMetricCostRelevantCountEvidence(row: BenchmarkMetricRow): boolean {
  const costRelevantCounts = parseBenchmarkCostRelevantCountMap(row.costRelevantCounts);
  return costRelevantCounts !== null &&
    metricEvidenceCitesCostRelevantCounts(row.evidenceCommandOrLog, costRelevantCounts);
}

function metricEvidenceCitesSampleCount(evidence: string, sampleCount: number): boolean {
  const normalized = normalizeWhitespace(evidence);
  const exactCount = escapeRegExp(String(sampleCount));
  return [
    new RegExp(`\\b(?:sample\\s*count|sampleCount|samples?|runs?)\\s*[:=]?\\s*${exactCount}\\b`, 'i'),
    new RegExp(`\\b${exactCount}\\s+(?:samples?|runs?)\\b`, 'i'),
  ].some(pattern => pattern.test(normalized));
}

function metricEvidenceCitesCostRelevantCounts(evidence: string, costRelevantCounts: Map<string, number>): boolean {
  const normalized = normalizeWhitespace(evidence);
  return REQUIRED_COST_COUNT_KEYS.every(key => {
    const count = costRelevantCounts.get(key);
    if (typeof count !== 'number') return false;
    return new RegExp(`\\b${key}\\s*[:=]\\s*${escapeRegExp(String(count))}\\b`, 'i').test(normalized);
  });
}

function hasPositivePatternedMeasurement(value: string, pattern: RegExp): boolean {
  return !isBlank(value) && pattern.test(value) && hasPositiveMeasurement(value);
}

function hasValidBenchmarkCostRelevantCounts(value: string): boolean {
  return parseBenchmarkCostRelevantCountMap(value) !== null;
}

function parseBenchmarkCostRelevantCountMap(value: string): Map<string, number> | null {
  const counts = new Map<string, number>();

  for (const key of REQUIRED_COST_COUNT_KEYS) {
    const matches = [...value.matchAll(new RegExp(`\\b${key}\\s*=\\s*(-?\\d+)\\b`, 'gi'))];
    if (matches.length !== 1) return null;
    const parsed = parsePositiveSafeIntegerText(matches[0][1]);
    if (typeof parsed !== 'number') return null;
    counts.set(key, parsed);
  }

  return counts;
}

function formatBenchmarkCostRelevantCounts(costRelevantCounts: Map<string, number>): string {
  return REQUIRED_COST_COUNT_KEYS
    .map(key => `${key}=${costRelevantCounts.get(key)}`)
    .join(' ');
}

function parsePositiveSafeIntegerText(value: string): number | 'invalid' | 'unsafe' {
  const normalized = value.trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) return 'invalid';
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) return 'unsafe';
  return parsed;
}

function isGenericBenchmarkRowPayload(value: string): boolean {
  return /^(pass|passed|approved|reviewed|linked|yes|no|n\/a)$/i.test(value.trim());
}

function hasCompletedArtifactTarget(value: string): boolean {
  return extractArtifactTargets(value).some(isConcreteArtifactTarget);
}

function findBenchmarkValidationTargetBinding(value: string): RegExpExecArray | null {
  return /\b(?:validated[-_/\s]+target|validated[-_/\s]+input|benchmark[-_/\s]+validate[-_/\s]+target|benchmark[-_/\s]+validation[-_/\s]+target)\b/i
    .exec(value);
}

function extractArtifactTargets(value: string): string[] {
  return [...value.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+)/g)]
    .map(([, target]) => target.replace(/[.;]+$/g, ''));
}

function extractEvidenceTargets(value: string): string[] {
  return [
    ...extractArtifactTargets(value),
    ...[...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(([, target]) => target),
  ];
}

function extractCompletedBenchmarkEvidenceTargets(value: string): string[] {
  return extractEvidenceTargets(benchmarkCompletedEvidenceText(value));
}

function benchmarkCompletedEvidenceText(value: string): string {
  return value
    .split(/[;\n]+/)
    .map(segment => {
      const targetBinding = findBenchmarkValidationTargetBinding(segment);
      return targetBinding
        ? segment.slice(0, targetBinding.index).trim()
        : segment.trim();
    })
    .filter(segment => segment.length > 0)
    .join('; ');
}

function normalizeEvidenceTarget(target: string): string {
  return target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').trim().toLowerCase();
}

function hasClaimEscalatingBenchmarkEvidenceTarget(target: string): boolean {
  const comparable = normalizeReviewerDecisionText(target);
  return (
    classifyPublicationClaimText(comparable).hasProductionClaim ||
    approvesProductionThroughputClaim(comparable) ||
    approvesBaseOrExchangeScaleThroughputClaim(comparable) ||
    approvesFullParallelL1SettlementClaim(comparable)
  );
}

function isConcreteEvidenceTarget(target: string): boolean {
  const normalized = normalizeEvidenceTarget(target);
  if (normalized.length === 0) return false;
  if (hasClaimEscalatingBenchmarkEvidenceTarget(normalized)) return false;
  if (/^artifact:\/\//i.test(normalized)) return isConcreteArtifactTarget(normalized);
  if (isLocalOnlyEvidenceTarget(normalized)) return false;
  if (isSensitiveOrRuntimeBenchmarkEvidenceTarget(normalized)) return false;
  return !/-template\.md(?:[#?].*)?$/i.test(normalized) &&
    normalized.split(/[\\/]+/).every(segment => !isNonConcreteArtifactSegment(segment));
}

function hasLocalOnlyEvidenceTarget(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(hasLocalOnlyEvidenceInspectionText);
}

function hasLocalOnlyEvidenceInspectionText(normalized: string): boolean {
  return hasEvidenceLocalOnlyInspectionReference(normalized);
}

function isLocalOnlyEvidenceTarget(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(isLocalOnlyEvidenceInspectionTarget);
}

function isLocalOnlyEvidenceInspectionTarget(normalized: string): boolean {
  return (
    hasEvidenceLocalOnlyInspectionReference(normalized) ||
    /^file:\/\//i.test(normalized) ||
    /^[a-z]:\//i.test(normalized) ||
    /^\/\/[^/]/.test(normalized) ||
    /^\/(?:users?|home|tmp|var|private|mnt|volumes|etc)(?:\/|$)/i.test(normalized)
  );
}

function isSensitiveOrRuntimeBenchmarkEvidenceTarget(target: string): boolean {
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(isSensitiveOrRuntimeBenchmarkEvidenceInspectionTarget);
}

function isSensitiveOrRuntimeBenchmarkEvidenceInspectionTarget(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasBenchmarkEnvironmentTargetSegment(normalizedTarget) ||
    hasBenchmarkRuntimeDatabaseTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalizedTarget, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
  );
}

function hasBenchmarkEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasBenchmarkRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function haveSharedConcreteBenchmarkEvidenceTarget(left: string, right: string): boolean {
  const leftTargets = new Set(
    extractCompletedBenchmarkEvidenceTargets(left)
      .map(normalizeEvidenceTarget)
      .filter(isConcreteEvidenceTarget),
  );
  return extractCompletedBenchmarkEvidenceTargets(right)
    .map(normalizeEvidenceTarget)
    .filter(isConcreteEvidenceTarget)
    .some(target => leftTargets.has(target));
}

function identifiesBenchmarkReleaseNoteUpdateEvidence(value: string): boolean {
  return identifiesBenchmarkPublicationEvidenceKind(value, 'completed Gate 7 benchmark release-note update evidence');
}

function identifiesBenchmarkChecklistUpdateEvidence(value: string): boolean {
  return identifiesBenchmarkPublicationEvidenceKind(value, 'completed Gate 7 benchmark checklist update evidence');
}

function identifiesBenchmarkPublicationEvidenceKind(value: string, evidenceKind: string): boolean {
  const normalizedKind = normalizeBenchmarkEvidenceKind(evidenceKind);
  return benchmarkPublicationEvidenceTargetsIdentifyKind(value, normalizedKind) ||
    benchmarkPublicationEvidenceKindTextSegments(value)
      .some(segment =>
        segment === normalizedKind ||
        segment.startsWith(`${normalizedKind} `)
      );
}

function benchmarkPublicationEvidenceTargetsIdentifyKind(value: string, normalizedKind: string): boolean {
  const expectedSlug = normalizedKind.replace(/\s+/g, '-');
  return extractCompletedBenchmarkEvidenceTargets(value)
    .some(target => normalizeBenchmarkPublicationEvidenceTargetBasename(target) === expectedSlug);
}

function normalizeBenchmarkPublicationEvidenceTargetBasename(target: string): string {
  const normalizedTarget = normalizeEvidenceTarget(target).replace(/\\/g, '/');
  const basename = normalizedTarget.split('/').filter(Boolean).pop() ?? normalizedTarget;
  return normalizeBenchmarkEvidenceKind(basename.replace(/\.[a-z0-9]+$/i, '')).replace(/\s+/g, '-');
}

function benchmarkPublicationEvidenceKindTextSegments(value: string): string[] {
  return value
    .split(/[;\n|]+/)
    .map(stripLeadingBenchmarkEvidenceTarget)
    .map(normalizeBenchmarkEvidenceKind)
    .filter(segment => segment.length > 0);
}

function stripLeadingBenchmarkEvidenceTarget(value: string): string {
  const trimmed = value.trim();
  const markdownMatch = /^\[[^\]]+\]\([^)]+\)/.exec(trimmed);
  if (markdownMatch) return trimmed.slice(markdownMatch[0].length).replace(/^[\s,.:;-]+/, '');

  const artifactMatch = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+/i.exec(trimmed);
  if (artifactMatch) return trimmed.slice(artifactMatch[0].length).replace(/^[\s,.:;-]+/, '');

  return trimmed;
}

function normalizeBenchmarkEvidenceKind(value: string): string {
  return normalizeEvidenceMarkerText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasNonTemplateMarkdownLink(value: string): boolean {
  const links = [...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
  return links.some(([, rawTarget]) => isConcreteEvidenceTarget(rawTarget));
}

function isConcreteArtifactTarget(target: string): boolean {
  const normalized = normalizeEvidenceTarget(target);
  if (hasClaimEscalatingBenchmarkEvidenceTarget(normalized)) return false;
  const match = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/(.+)$/i.exec(target.trim());
  if (match === null) return false;
  const path = match[1].split(/[?#]/, 1)[0];
  return path.split(/[\\/]+/).every(segment => !isNonConcreteArtifactSegment(segment));
}

function isNonConcreteArtifactSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /(?:^|[-_.])(?:not[-_]?completed|uncompleted)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])template(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|benchmark|metric|metrics|single|batch|settlement|sharded|lane|bottleneck|release|checklist)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])sample(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|benchmark|metric|metrics|single|batch|settlement|sharded|lane|bottleneck|release|checklist)|$)/i.test(normalized) ||
    /(?:^|[-_.])example(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|validator|benchmark|metric|metrics|single|batch|settlement|sharded|lane|bottleneck|release|checklist)|$)/i.test(normalized)
  );
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractHex32Values(value: string): string[] {
  return [...value.matchAll(HEX_32_BYTE_PATTERN)].map(match => match[1]);
}

function hasUserLiveBroadcastApprovalBoundToExpectedTransactionId(value: string): boolean {
  return evidenceSegments(value).some(segment =>
    USER_LIVE_BROADCAST_APPROVAL_PATTERN.test(segment) &&
    EXPECTED_TRANSACTION_ID_SEGMENT_PATTERN.test(segment)
  );
}

function evidenceSegments(value: string): string[] {
  return value
    .split(/[;\n]+/)
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0);
}

function extractExpectedTransactionIds(value: string): string[] {
  return [...value.matchAll(EXPECTED_TRANSACTION_ID_CAPTURE_PATTERN)].map(match => normalizeHex32Value(match[1]));
}

function extractLiveBatchSubmittedTransactionIds(value: string): string[] {
  return [...value.matchAll(LIVE_BATCH_SUBMITTED_TRANSACTION_ID_PATTERN)]
    .map(match => normalizeHex32Value(match[1]));
}

function normalizeHex32Value(value: string): string {
  return value.toLowerCase();
}

function hasPositiveMeasurement(value: string): boolean {
  return [...value.matchAll(/-?\d+(?:\.\d+)?/g)].some(match => Number(match[0]) > 0);
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}
