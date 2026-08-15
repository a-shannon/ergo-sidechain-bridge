import type { RehearsalEvidenceValidation } from './rehearsal-evidence.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export type RehearsalValidationReportResult = 'PASS' | 'BLOCKED';

export interface RehearsalValidationIssueGroup {
  group: string;
  count: number;
  operatorMeaning: string;
}

export interface RehearsalValidationReport {
  command: string;
  workingDirectory: string;
  validatedTarget: string;
  result: RehearsalValidationReportResult;
  exitCode: number;
  structuralIssues: number;
  issueGroups: RehearsalValidationIssueGroup[];
  structuralIssueExamples: string[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface RehearsalValidationReportInput {
  command: string;
  workingDirectory: string;
  validatedTarget: string;
  readErrors?: string[];
  validation?: RehearsalEvidenceValidation;
  cliErrors?: string[];
}

const ISSUE_GROUP_MEANINGS: Record<string, string> = {
  'Target access': 'The requested live rehearsal evidence target could not be read or accepted by the target guard',
  'Transcript binding': 'The validator transcript artifact is missing, unsafe, non-concrete, or not distinct from the completed target',
  'Linked JSON evidence': 'One or more required linked JSON reports is missing, mismatched, invalid, or not concrete',
  'Session metadata': 'Session date, operator, reviewer, environment, commit, network, or broadcast mode metadata is incomplete',
  'Lifecycle rows': 'One or more lifecycle gate rows is missing, duplicated, malformed, or lacks row-specific evidence',
  'Preflight evidence': 'Clean deployment, ContextExtension guard, height, or broadcast-policy prerequisites are incomplete',
  'Dry-run settlement evidence': 'Dry-run transaction, approval, burn, anchor, or /transactions/check evidence is incomplete',
  'Rehearsal assembly': 'Assembly, live-preflight, fresh-checkpoint, or post-submit gate binding evidence is incomplete',
  'Submit and confirmation': 'Submit, submitted transaction ID, confirmation count, or finality evidence is incomplete',
  Reconciliation: 'Settlement successor, DUP/SPV tracker, payout, or burn reconciliation evidence is incomplete',
  'Rollback and cleanup': 'Rollback readiness, cleanup checks, or post-rehearsal stop conditions are incomplete',
  'Publication evidence': 'Release-note/checklist updates or production/testnet claim-boundary fields are incomplete',
  'Reviewer sign-off': 'Reviewer identity, dates, classification, blockers, or follow-up fields are incomplete',
  'Evidence hygiene': 'The evidence text has unresolved, duplicate, placeholder, or unsafe evidence markers',
  'Other structural issues': 'The validator returned structural issues outside the standard rehearsal evidence groups',
};

export function buildRehearsalValidationReport(
  input: RehearsalValidationReportInput,
): RehearsalValidationReport {
  const readErrors = input.readErrors ?? [];
  const cliErrors = input.cliErrors ?? [];
  const validationErrors = input.validation?.errors ?? [];
  const errors = readErrors.length > 0
    ? readErrors
    : [...validationErrors, ...cliErrors];
  const result = errors.length === 0 && input.validation?.status === 'PASS' ? 'PASS' : 'BLOCKED';

  return {
    command: sanitizeRehearsalReportText(input.command),
    workingDirectory: sanitizeRehearsalReportText(input.workingDirectory),
    validatedTarget: sanitizeRehearsalReportText(input.validatedTarget),
    result,
    exitCode: result === 'PASS' ? 0 : 1,
    structuralIssues: errors.length,
    issueGroups: groupRehearsalValidationIssues(errors),
    structuralIssueExamples: errors.slice(0, 14).map(sanitizeRehearsalReportText),
    boundary: {
      'Evidence target read': readErrors.length === 0 ? 'yes' : 'no',
      'Rehearsal validator completed': input.validation ? 'yes' : 'no',
      'Public claim authorization granted': 'no',
      'Release gate PASS claimed': 'no',
      'Gate 3 lifecycle closure claimed': 'no',
      'Live execution approval granted': 'no',
      'Runtime database or deployment state opened': 'no',
      'Transaction broadcast, submit, deploy, signing, runtime database access, or state mutation performed': 'no',
    },
  };
}

export function formatRehearsalValidationReportMarkdown(report: RehearsalValidationReport): string {
  const commandRows = [
    ['Command', report.command],
    ['Working directory', report.workingDirectory],
    ['Validated target', report.validatedTarget],
    ['Result', report.result],
    ['Exit code', String(report.exitCode)],
    ['Structural issues', String(report.structuralIssues)],
    ['Stack trace emitted', 'no'],
    ['Local path emitted', 'no'],
  ];
  const issueGroups = report.issueGroups.length > 0
    ? [
        '| Issue group | Count | Operator meaning |',
        '|---|---:|---|',
        ...report.issueGroups.map(issue =>
          `| ${escapeMarkdownTableCell(issue.group)} | ${issue.count} | ${escapeMarkdownTableCell(issue.operatorMeaning)} |`
        ),
      ].join('\n')
    : 'No structural issue groups were reported.';
  const examples = report.structuralIssueExamples.length > 0
    ? report.structuralIssueExamples.map(error => `- ${error}`).join('\n')
    : '- None.';
  const boundaryRows = Object.entries(report.boundary)
    .map(([field, value]) => `| ${field} | ${value} |`)
    .join('\n');

  return [
    '# Rehearsal Evidence Validation Report',
    '',
    'This report records one Gate 3 rehearsal validator result. It does not authorize public claims, release claims, publishing, deployment, live submit, or transaction broadcast.',
    '',
    '## Command Result',
    '',
    '| Field | Value |',
    '|---|---|',
    ...commandRows.map(([field, value]) => `| ${field} | ${escapeMarkdownTableCell(value)} |`),
    '',
    '## Issue Groups',
    '',
    issueGroups,
    '',
    '## Structural Issue Examples',
    '',
    examples,
    '',
    '## Boundary',
    '',
    '| Boundary | Value |',
    '|---|---|',
    boundaryRows,
    '',
  ].join('\n');
}

export function groupRehearsalValidationIssues(
  errors: string[],
): RehearsalValidationIssueGroup[] {
  const counts = new Map<string, number>();
  for (const error of errors) {
    const group = classifyRehearsalValidationIssue(error);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }

  return [...counts.entries()].map(([group, count]) => ({
    group,
    count,
    operatorMeaning: ISSUE_GROUP_MEANINGS[group] ?? ISSUE_GROUP_MEANINGS['Other structural issues'],
  }));
}

function classifyRehearsalValidationIssue(error: string): string {
  if (/evidence target BLOCKED|could not be read|validator only accepts Markdown evidence files/i.test(error)) {
    return 'Target access';
  }
  if (/--transcript|transcript/i.test(error)) return 'Transcript binding';
  if (/^Session Metadata:/i.test(error)) return 'Session metadata';
  if (/^Preflight Evidence:/i.test(error)) return 'Preflight evidence';
  if (/^Dry-Run Settlement Evidence:/i.test(error)) return 'Dry-run settlement evidence';
  if (/^Rehearsal Assembly Evidence:|^Post-Submit Gate Binding:/i.test(error)) return 'Rehearsal assembly';
  if (/^Submit And Confirmation Evidence:/i.test(error)) return 'Submit and confirmation';
  if (/^Reconciliation Evidence:/i.test(error)) return 'Reconciliation';
  if (/^Rollback And Cleanup:/i.test(error)) return 'Rollback and cleanup';
  if (/^Publication Evidence:/i.test(error)) return 'Publication evidence';
  if (/^Reviewer Sign-Off:/i.test(error)) return 'Reviewer sign-off';
  if (/^--(?:aggregate-prebroadcast|assembly-report|fresh-checkpoint|live-preflight|post-submit-observe|preflight|prep-bundle|recovery-observe|window-prep)-json\b/i.test(error)) {
    return 'Linked JSON evidence';
  }
  if (/\bJSON\b|target must match|source binding|artifactTargets\./i.test(error)) return 'Linked JSON evidence';
  if (/missing required lifecycle row|unexpected lifecycle row|status must be one of|requires an evidence artifact|requires a blocking note|requires next evidence|lifecycle row/i.test(error)) {
    return 'Lifecycle rows';
  }
  if (/Evidence Hygiene|duplicate|required section|table not found|placeholder|unresolved/i.test(error)) {
    return 'Evidence hygiene';
  }
  return 'Other structural issues';
}

function sanitizeRehearsalReportText(value: string): string {
  return sanitizeReportText(value);
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}
