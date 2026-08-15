import type { SecurityReviewEvidenceValidation } from './security-review-evidence.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export type SecurityReviewValidationReportResult = 'PASS' | 'BLOCKED';

export interface SecurityReviewValidationIssueGroup {
  group: string;
  count: number;
  operatorMeaning: string;
}

export interface SecurityReviewValidationReport {
  command: string;
  workingDirectory: string;
  validatedTarget: string;
  result: SecurityReviewValidationReportResult;
  exitCode: number;
  structuralIssues: number;
  issueGroups: SecurityReviewValidationIssueGroup[];
  structuralIssueExamples: string[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface SecurityReviewValidationReportInput {
  command: string;
  workingDirectory: string;
  validatedTarget: string;
  readErrors?: string[];
  validation?: SecurityReviewEvidenceValidation;
}

const ISSUE_GROUP_MEANINGS: Record<string, string> = {
  'Target access': 'The requested independent security review evidence target could not be read or accepted by the target guard',
  'Review classification': 'Review identity, release level, reviewer independence, final decision, or review date is incomplete',
  'Required scope coverage': 'One or more required security review scope areas lacks covered linked evidence',
  'Required evidence package': 'One or more required review evidence packages is missing or not linked',
  'Finding disposition': 'Finding counts, critical/high closure, accepted risks, or publication blockers are incomplete',
  'Required negative review checks': 'One or more required negative checks lacks reviewer evidence or linked rejection coverage',
  'Publication decision': 'Release support, accepted-risk, critical/high, publication, or claim-boundary fields are incomplete',
  'Reviewer sign-off': 'Lead reviewer, security owner, maintainer, or operator reviewer approval is incomplete or inconsistent',
  'Evidence hygiene': 'The evidence text has unresolved, duplicate, placeholder, or unsafe evidence markers',
  'Other structural issues': 'The validator returned structural issues outside the standard security review evidence groups',
};

export function buildSecurityReviewValidationReport(
  input: SecurityReviewValidationReportInput,
): SecurityReviewValidationReport {
  const readErrors = input.readErrors ?? [];
  const validationErrors = input.validation?.errors ?? [];
  const errors = readErrors.length > 0 ? readErrors : validationErrors;
  const result = errors.length === 0 && input.validation?.status === 'PASS' ? 'PASS' : 'BLOCKED';

  return {
    command: sanitizeSecurityReviewReportText(input.command),
    workingDirectory: sanitizeSecurityReviewReportText(input.workingDirectory),
    validatedTarget: sanitizeSecurityReviewReportText(input.validatedTarget),
    result,
    exitCode: result === 'PASS' ? 0 : 1,
    structuralIssues: errors.length,
    issueGroups: groupSecurityReviewValidationIssues(errors),
    structuralIssueExamples: errors.slice(0, 14).map(sanitizeSecurityReviewReportText),
    boundary: {
      'Evidence target read': readErrors.length === 0 ? 'yes' : 'no',
      'Security review validator completed': input.validation ? 'yes' : 'no',
      'Public claim authorization granted': 'no',
      'Release gate PASS claimed': 'no',
      'Gate 4 independent review closure claimed': 'no',
      'Accepted-risk closure claimed': 'no',
      'Runtime database or deployment state opened': 'no',
      'Transaction broadcast, submit, deploy, audit approval, accepted-risk closure, or state mutation performed': 'no',
    },
  };
}

export function formatSecurityReviewValidationReportMarkdown(
  report: SecurityReviewValidationReport,
): string {
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
  const issueGroups =
    report.issueGroups.length > 0
      ? [
          '| Issue group | Count | Operator meaning |',
          '|---|---:|---|',
          ...report.issueGroups.map(issue => `| ${issue.group} | ${issue.count} | ${issue.operatorMeaning} |`),
        ].join('\n')
      : 'No structural issue groups were reported.';
  const examples =
    report.structuralIssueExamples.length > 0
      ? report.structuralIssueExamples.map(error => `- ${error}`).join('\n')
      : '- None.';
  const boundaryRows = Object.entries(report.boundary)
    .map(([field, value]) => `| ${field} | ${value} |`)
    .join('\n');

  return [
    '# Security Review Evidence Validation Report',
    '',
    'This report records one independent security review validator result. It does not authorize public claims, release claims, publishing, deployment, accepted-risk closure, review approval, or transaction broadcast.',
    '',
    '## Command Result',
    '',
    '| Field | Value |',
    '|---|---|',
    ...commandRows.map(([field, value]) => `| ${field} | ${value} |`),
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

export function groupSecurityReviewValidationIssues(
  errors: string[],
): SecurityReviewValidationIssueGroup[] {
  const counts = new Map<string, number>();
  for (const error of errors) {
    const group = classifySecurityReviewValidationIssue(error);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }

  return [...counts.entries()].map(([group, count]) => ({
    group,
    count,
    operatorMeaning: ISSUE_GROUP_MEANINGS[group] ?? ISSUE_GROUP_MEANINGS['Other structural issues'],
  }));
}

function classifySecurityReviewValidationIssue(error: string): string {
  if (/evidence target BLOCKED|could not be read|validator only accepts Markdown evidence files/i.test(error)) {
    return 'Target access';
  }
  if (/^Review Classification:/i.test(error)) return 'Review classification';
  if (/^Required Scope Coverage:/i.test(error)) return 'Required scope coverage';
  if (/^Required Evidence Package:/i.test(error)) return 'Required evidence package';
  if (/^Finding Disposition:/i.test(error)) return 'Finding disposition';
  if (/^Required Negative Review Checks:/i.test(error)) return 'Required negative review checks';
  if (/^Publication Decision:/i.test(error)) return 'Publication decision';
  if (/^Reviewer Sign-Off:/i.test(error)) return 'Reviewer sign-off';
  if (/Evidence Hygiene|duplicate|required section|table not found|placeholder|unresolved/i.test(error)) {
    return 'Evidence hygiene';
  }
  return 'Other structural issues';
}

function sanitizeSecurityReviewReportText(value: string): string {
  return sanitizeReportText(value);
}
