import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { validateBenchmarkEvidence } from './benchmark-evidence.js';
import { validateCommitteeGovernanceEvidence } from './committee-governance-evidence.js';
import { readEvidenceMarkdownTarget } from './evidence-target-path.js';
import { sanitizeReportText } from './report-text-sanitizer.js';
import { validateSecurityReviewEvidence } from './security-review-evidence.js';
import { validateTrustlessBurnEvidence } from './trustless-burn-evidence.js';

export type ReadinessTriageLane =
  | 'security-review'
  | 'trustless-burn'
  | 'committee-governance'
  | 'benchmark';

export type ReadinessTriageStatus = 'PASS' | 'BLOCKED';

export type ReadinessTriageCategory =
  | 'target-access'
  | 'local-evidence'
  | 'node-backed-or-live-drill'
  | 'reviewer-or-external'
  | 'claim-or-publication-boundary'
  | 'other';

export type ReadinessTriageLocalClosureStatus =
  | 'complete'
  | 'local-evidence-work-available'
  | 'external-or-live-required'
  | 'manual-triage-required';

export interface ReadinessTriageTarget {
  lane: ReadinessTriageLane;
  target: string;
}

export interface ReadinessLaneValidationResult {
  lane: ReadinessTriageLane;
  target: string;
  label: string;
  status: ReadinessTriageStatus;
  validatorCompleted: boolean;
  errors: string[];
}

export interface ReadinessTriageIssue {
  lane: ReadinessTriageLane;
  target: string;
  category: ReadinessTriageCategory;
  issue: string;
}

export interface ReadinessTriageCategorySummary {
  category: ReadinessTriageCategory;
  count: number;
  meaning: string;
}

export interface ReadinessTriageLocalClosureSummary {
  status: ReadinessTriageLocalClosureStatus;
  localOnlyIssueCount: number;
  externalOrLiveIssueCount: number;
  manualTriageIssueCount: number;
  summary: string;
}

export interface ReadinessTriageReport {
  status: ReadinessTriageStatus;
  sourceCommit?: string;
  totalStructuralIssues: number;
  lanes: ReadinessLaneValidationResult[];
  issues: ReadinessTriageIssue[];
  categorySummaries: ReadinessTriageCategorySummary[];
  localClosure: ReadinessTriageLocalClosureSummary;
  boundary: Record<string, 'yes' | 'no'>;
}

export interface ReadinessTriageReportOptions {
  sourceCommit?: string;
}

export interface DefaultReadinessTriageDiscovery {
  targets: ReadinessTriageTarget[];
  errors: string[];
}

const CATEGORY_MEANINGS: Record<ReadinessTriageCategory, string> = {
  'target-access': 'The target path was rejected or could not be read by the evidence target guard',
  'local-evidence': 'Can usually move with offline command output, structured Markdown, or completed artifact links',
  'node-backed-or-live-drill': 'Needs a concrete non-mainnet node-backed/live drill or real target binding; do not infer it from offline text',
  'reviewer-or-external': 'Needs human reviewer approval, external review evidence, or independent decision material',
  'claim-or-publication-boundary': 'Claim and publication fields should only flip after the underlying evidence categories are resolved',
  other: 'The validator returned a blocker outside the standard triage categories',
};

const LANE_LABELS: Record<ReadinessTriageLane, string> = {
  'security-review': 'Gate 4 independent security review',
  'trustless-burn': 'Gate 5 trustless burn',
  'committee-governance': 'Gate 6 committee governance',
  benchmark: 'Gate 7 benchmark',
};

const DEFAULT_TARGET_SPECS: Array<{
  lane: ReadinessTriageLane;
  directory: string;
  patterns: RegExp[];
}> = [
  {
    lane: 'security-review',
    directory: 'security',
    patterns: [/^gate4-independent-security-review-blocker-map-\d{4}-\d{2}-\d{2}-[a-z0-9]+\.md$/],
  },
  {
    lane: 'trustless-burn',
    directory: 'trustless-burn',
    patterns: [/^gate5-trustless-burn-blocker-map-\d{4}-\d{2}-\d{2}-[a-z0-9]+\.md$/],
  },
  {
    lane: 'committee-governance',
    directory: 'governance',
    patterns: [/^phase010a-committee-governance-blocker-map-\d{4}-\d{2}-\d{2}-[a-z0-9]+\.md$/],
  },
  {
    lane: 'benchmark',
    directory: 'benchmarks',
    patterns: [
      /^gate7-offline-structured-candidate-\d{4}-\d{2}-\d{2}-[a-z0-9]+\.md$/,
      /^gate7-benchmark-blocker-map-\d{4}-\d{2}-\d{2}-[a-z0-9]+\.md$/,
    ],
  },
];

export function buildReadinessTriageReport(
  targets: ReadinessTriageTarget[],
  options: ReadinessTriageReportOptions = {},
): ReadinessTriageReport {
  return buildReadinessTriageReportFromResults(targets.map(validateReadinessTriageTarget), options);
}

export function discoverDefaultReadinessTriageTargets(
  evidenceRoot = '../evidence',
): DefaultReadinessTriageDiscovery {
  const targets: ReadinessTriageTarget[] = [];
  const errors: string[] = [];

  for (const spec of DEFAULT_TARGET_SPECS) {
    const discovery = discoverLatestTarget(evidenceRoot, spec.directory, spec.patterns);
    if (discovery.error) {
      errors.push(`${LANE_LABELS[spec.lane]}: ${discovery.error}`);
      continue;
    }
    if (!discovery.target) {
      errors.push(`${LANE_LABELS[spec.lane]}: default blocker map discovery returned no target`);
      continue;
    }
    targets.push({ lane: spec.lane, target: discovery.target });
  }

  return { targets, errors };
}

export function validateReadinessTriageTarget(
  target: ReadinessTriageTarget,
): ReadinessLaneValidationResult {
  const read = readEvidenceMarkdownTarget(target.target);
  if (read.errors.length > 0) {
    return {
      lane: target.lane,
      target: target.target,
      label: read.label,
      status: 'BLOCKED',
      validatorCompleted: false,
      errors: read.errors,
    };
  }

  const validation = validateLaneMarkdown(target.lane, read.markdown);
  return {
    lane: target.lane,
    target: target.target,
    label: read.label,
    status: validation.status,
    validatorCompleted: true,
    errors: validation.errors,
  };
}

export function buildReadinessTriageReportFromResults(
  lanes: ReadinessLaneValidationResult[],
  options: ReadinessTriageReportOptions = {},
): ReadinessTriageReport {
  const issues = lanes.flatMap(lane =>
    lane.errors.map(issue => ({
      lane: lane.lane,
      target: lane.target,
      category: classifyReadinessTriageIssue(issue),
      issue: sanitizeReadinessTriageText(issue),
    })),
  );
  const categorySummaries = summarizeReadinessTriageCategories(issues);
  const totalStructuralIssues = issues.length;
  const status =
    lanes.length > 0 && lanes.every(lane => lane.status === 'PASS') && totalStructuralIssues === 0
      ? 'PASS'
      : 'BLOCKED';
  const localClosure = summarizeLocalClosure(status, lanes, issues);

  return {
    status,
    ...(options.sourceCommit ? { sourceCommit: normalizeReadinessSourceCommit(options.sourceCommit) } : {}),
    totalStructuralIssues,
    lanes: lanes.map(lane => ({
      ...lane,
      target: sanitizeReadinessTriageText(lane.target),
      label: sanitizeReadinessTriageText(lane.label),
      errors: lane.errors.map(sanitizeReadinessTriageText),
    })),
    issues,
    categorySummaries,
    localClosure,
    boundary: {
      'Planning output only': 'yes',
      'Release gate PASS claimed': 'no',
      'Public claim authorization granted': 'no',
      'Evidence row closure claimed': 'no',
      'Runtime database or deployment state opened': 'no',
      'Transaction broadcast, deploy, key rotation, or state mutation performed': 'no',
    },
  };
}

export function formatReadinessTriageReportMarkdown(report: ReadinessTriageReport): string {
  const laneRows = report.lanes.map(lane =>
    `| ${LANE_LABELS[lane.lane]} | ${lane.target} | ${lane.status} | ${lane.errors.length} | ${lane.validatorCompleted ? 'yes' : 'no'} |`,
  );
  const categoryRows =
    report.categorySummaries.length > 0
      ? report.categorySummaries.map(summary =>
          `| ${formatCategoryLabel(summary.category)} | ${summary.count} | ${summary.meaning} |`,
        )
      : ['| None | 0 | No structural issues were reported |'];
  const issueRows =
    report.issues.length > 0
      ? report.issues.map(issue =>
          `| ${LANE_LABELS[issue.lane]} | ${formatCategoryLabel(issue.category)} | ${issue.issue} |`,
        )
      : ['| All lanes | None | No structural issues were reported |'];
  const boundaryRows = Object.entries(report.boundary).map(
    ([field, value]) => `| ${field} | ${value} |`,
  );
  const localClosureRows = [
    `| Status | ${formatLocalClosureStatusLabel(report.localClosure.status)} |`,
    `| Local-only issue count | ${report.localClosure.localOnlyIssueCount} |`,
    `| External/live/claim issue count | ${report.localClosure.externalOrLiveIssueCount} |`,
    `| Manual triage issue count | ${report.localClosure.manualTriageIssueCount} |`,
    `| Summary | ${report.localClosure.summary} |`,
  ];

  return [
    '# Bridge Readiness Evidence Triage',
    '',
    'This report is a planning aid. It does not close release evidence, authorize claims, publish, deploy, rotate keys, or broadcast transactions.',
    '',
    '## Summary',
    '',
    '| Field | Value |',
    '|---|---|',
    `| Result | ${report.status} |`,
    ...(report.sourceCommit ? [`| Source commit | ${sanitizeReadinessTriageText(report.sourceCommit)} |`] : []),
    `| Total structural issues | ${report.totalStructuralIssues} |`,
    `| Local-only closure status | ${formatLocalClosureStatusLabel(report.localClosure.status)} |`,
    '',
    '## Local Closure Status',
    '',
    '| Field | Value |',
    '|---|---|',
    ...localClosureRows,
    '',
    '## Lane Results',
    '',
    '| Lane | Target | Result | Structural issues | Validator completed |',
    '|---|---|---|---:|---|',
    ...laneRows,
    '',
    '## Actionability Buckets',
    '',
    '| Bucket | Count | Meaning |',
    '|---|---:|---|',
    ...categoryRows,
    '',
    '## Remaining Issues',
    '',
    '| Lane | Bucket | Issue |',
    '|---|---|---|',
    ...issueRows,
    '',
    '## Boundary',
    '',
    '| Boundary | Value |',
    '|---|---|',
    ...boundaryRows,
    '',
  ].join('\n');
}

export function classifyReadinessTriageIssue(issue: string): ReadinessTriageCategory {
  const normalized = issue.toLowerCase();
  const isSecurityReviewEvidenceIssue = /gate 4 evidence|security review evidence/.test(normalized);

  if (/evidence target blocked|could not be read|validator only accepts markdown|refusing to read/.test(normalized)) {
    return 'target-access';
  }
  if (
    isSecurityReviewEvidenceIssue &&
    /^required evidence package: (fresh local devnet rehearsal|fresh testnet rehearsal|failed broadcast \/ phantom avl drill|batch settlement check\/submit\/confirm rehearsal):/.test(
      normalized,
    )
  ) {
    return 'node-backed-or-live-drill';
  }
  if (
    isSecurityReviewEvidenceIssue &&
    /^(required scope coverage|finding disposition|required negative review checks):/.test(normalized)
  ) {
    return 'reviewer-or-external';
  }
  if (
    /reviewer|sign-off|signoff|external review|independent review|approval|approve|independent security|lead reviewer/.test(normalized)
  ) {
    return 'reviewer-or-external';
  }
  if (
    /live batch|live settlement|node-backed|node backed|signer behavior|signer-gated|deployment state|rollback|old committee public keys|new committee public keys|committee public keys|settlement tx|dup settlement|sidechain finality|sidechain header\/finality|ergo anchor|ergo extension-section anchoring|spv relay|burn inclusion proof|positive proof acceptance|valid burn proof acceptance|on-chain proof acceptance|broadcast-disabled|wrong network/.test(
      normalized,
    )
  ) {
    return 'node-backed-or-live-drill';
  }
  if (
    /release supported|claim allowed|production-ready|testnet production-candidate|mainnet|release notes|release-note|checklist|open .* blockers|publication blockers|publication decision|publication rules|critical\/high findings|release gate structural issues/.test(
      normalized,
    )
  ) {
    return 'claim-or-publication-boundary';
  }
  if (
    /required commands|metric table|required components|commitment format|burn proof binding|local proof vector|positive proof acceptance|negative tests|scope:|scope coverage|coverage must be covered|rotation plan|positive checks|negative checks|command output|completed evidence|must be linked|lacks linked|requires .* evidence|evidence artifact/.test(
      normalized,
    )
  ) {
    return 'local-evidence';
  }

  return 'other';
}

export function formatReadinessTriageText(report: ReadinessTriageReport): string {
  return [
    `Bridge readiness triage: ${report.status}`,
    ...(report.sourceCommit ? [`Source commit: ${sanitizeReadinessTriageText(report.sourceCommit)}`] : []),
    `Total structural issues: ${report.totalStructuralIssues}`,
    `Local-only closure status: ${formatLocalClosureStatusLabel(report.localClosure.status)}`,
    report.localClosure.summary,
    '',
    'Lane results:',
    ...report.lanes.map(
      lane => `- ${LANE_LABELS[lane.lane]}: ${lane.status}, ${lane.errors.length} structural issue(s)`,
    ),
    '',
    'Actionability buckets:',
    ...(report.categorySummaries.length > 0
      ? report.categorySummaries.map(summary =>
          `- ${formatCategoryLabel(summary.category)}: ${summary.count} (${summary.meaning})`,
        )
      : ['- None: 0']),
    '',
    'Run with --markdown to inspect individual issues.',
  ].join('\n');
}

function validateLaneMarkdown(
  lane: ReadinessTriageLane,
  markdown: string,
): { status: ReadinessTriageStatus; errors: string[] } {
  if (lane === 'security-review') {
    const validation = validateSecurityReviewEvidence(markdown);
    return { status: validation.status, errors: validation.errors };
  }
  if (lane === 'trustless-burn') {
    const validation = validateTrustlessBurnEvidence(markdown);
    return { status: validation.status, errors: validation.errors };
  }
  if (lane === 'committee-governance') {
    const validation = validateCommitteeGovernanceEvidence(markdown);
    return { status: validation.status, errors: validation.errors };
  }

  const validation = validateBenchmarkEvidence(markdown);
  return { status: validation.status, errors: validation.errors };
}

function discoverLatestTarget(
  evidenceRoot: string,
  directory: string,
  patterns: RegExp[],
): { target: string; error?: undefined } | { target?: undefined; error: string } {
  const directoryPath = join(evidenceRoot, directory);
  if (!existsSync(directoryPath)) {
    return { error: `default evidence directory is missing: ${normalizeTargetPath(directoryPath)}` };
  }

  const candidates = readdirSync(directoryPath, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .flatMap(entry => {
      const patternIndex = patterns.findIndex(pattern => pattern.test(entry.name));
      if (patternIndex < 0) return [];
      return [{
        name: entry.name,
        patternIndex,
        mtimeMs: statSync(join(directoryPath, entry.name)).mtimeMs,
      }];
    });

  if (candidates.length === 0) {
    return { error: `no default blocker map found in ${normalizeTargetPath(directoryPath)}` };
  }

  candidates.sort((left, right) =>
    left.patternIndex - right.patternIndex ||
    right.mtimeMs - left.mtimeMs ||
    right.name.localeCompare(left.name),
  );

  return {
    target: normalizeTargetPath(join(evidenceRoot, directory, candidates[0].name)),
  };
}

function summarizeReadinessTriageCategories(
  issues: ReadinessTriageIssue[],
): ReadinessTriageCategorySummary[] {
  const counts = new Map<ReadinessTriageCategory, number>();
  for (const issue of issues) {
    counts.set(issue.category, (counts.get(issue.category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([category, count]) => ({
      category,
      count,
      meaning: CATEGORY_MEANINGS[category],
    }));
}

function summarizeLocalClosure(
  status: ReadinessTriageStatus,
  lanes: ReadinessLaneValidationResult[],
  issues: ReadinessTriageIssue[],
): ReadinessTriageLocalClosureSummary {
  if (status === 'PASS') {
    return {
      status: 'complete',
      localOnlyIssueCount: 0,
      externalOrLiveIssueCount: 0,
      manualTriageIssueCount: 0,
      summary: 'Selected lanes have no structural issues; release-gate evidence closure still requires the full release gate.',
    };
  }

  if (lanes.length === 0) {
    return {
      status: 'manual-triage-required',
      localOnlyIssueCount: 0,
      externalOrLiveIssueCount: 0,
      manualTriageIssueCount: 1,
      summary: 'No readiness lanes were supplied; rerun readiness:triage with explicit targets or default discovery.',
    };
  }

  const localOnlyIssueCount = issues.filter(issue => isLocalOnlyClosureCategory(issue.category)).length;
  const manualTriageIssueCount = issues.filter(issue => issue.category === 'other').length;
  const externalOrLiveIssueCount = issues.length - localOnlyIssueCount - manualTriageIssueCount;

  if (manualTriageIssueCount > 0) {
    return {
      status: 'manual-triage-required',
      localOnlyIssueCount,
      externalOrLiveIssueCount,
      manualTriageIssueCount,
      summary: 'At least one blocker is outside the known actionability buckets; inspect it before choosing the next evidence slice.',
    };
  }

  if (localOnlyIssueCount > 0) {
    return {
      status: 'local-evidence-work-available',
      localOnlyIssueCount,
      externalOrLiveIssueCount,
      manualTriageIssueCount,
      summary: 'Local-only evidence work remains available; prefer completing those concrete command output or artifact-link gaps before live or reviewer-gated work.',
    };
  }

  return {
    status: 'external-or-live-required',
    localOnlyIssueCount,
    externalOrLiveIssueCount,
    manualTriageIssueCount,
    summary: 'No local-only closure candidates remain for the selected lanes; next progress requires non-mainnet/live evidence, external review, human approval, or claim fields that must wait for those blockers.',
  };
}

function isLocalOnlyClosureCategory(category: ReadinessTriageCategory): boolean {
  return category === 'target-access' || category === 'local-evidence';
}

function formatCategoryLabel(category: ReadinessTriageCategory): string {
  return category
    .split('-')
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function formatLocalClosureStatusLabel(status: ReadinessTriageLocalClosureStatus): string {
  return status
    .split('-')
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function sanitizeReadinessTriageText(value: string): string {
  return sanitizeReportText(value);
}

function normalizeReadinessSourceCommit(value: string): string {
  return sanitizeReadinessTriageText(value).toLowerCase();
}

function normalizeTargetPath(value: string): string {
  return value.replace(/\\/g, '/');
}
