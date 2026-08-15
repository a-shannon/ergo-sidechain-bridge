import type { CommitteeGovernanceEvidenceValidation } from './committee-governance-evidence.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export type CommitteeGovernanceValidationReportResult = 'PASS' | 'BLOCKED';

export interface CommitteeGovernanceValidationIssueGroup {
  group: string;
  count: number;
  operatorMeaning: string;
}

export interface CommitteeGovernanceValidationReport {
  command: string;
  workingDirectory: string;
  validatedTarget: string;
  result: CommitteeGovernanceValidationReportResult;
  exitCode: number;
  structuralIssues: number;
  issueGroups: CommitteeGovernanceValidationIssueGroup[];
  structuralIssueExamples: string[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface CommitteeGovernanceValidationReportInput {
  command: string;
  workingDirectory: string;
  validatedTarget: string;
  readErrors?: string[];
  validation?: CommitteeGovernanceEvidenceValidation;
}

const ISSUE_GROUP_MEANINGS: Record<string, string> = {
  'Target access': 'The requested committee governance evidence target could not be read or accepted by the target guard',
  'Drill classification': 'Governance drill identity, release level, environment, broadcast mode, or committee threshold metadata is incomplete',
  Scope: 'One or more governed surfaces lacks completed authority-transition evidence',
  'Required commands': 'One or more required governance/check commands lacks command-specific completed output evidence',
  'Rotation plan': 'One or more key-rotation steps lacks linked evidence, identifiers, stop conditions, or disjoint old/new committee bindings',
  'Positive checks': 'One or more expected new-committee acceptance checks lacks completed evidence',
  'Negative checks': 'One or more rejection, broadcast-disabled, or wrong-network negative checks lacks completed evidence',
  'Publication rules': 'Governance-ready, release support, open blocker, release-note, checklist, or external review publication fields are incomplete',
  'Reviewer sign-off': 'Governance owner, security reviewer, or operator reviewer approval is incomplete or inconsistent',
  'Evidence hygiene': 'The evidence text has unresolved, duplicate, placeholder, or unsafe evidence markers',
  'Other structural issues': 'The validator returned structural issues outside the standard committee governance evidence groups',
};

export function buildCommitteeGovernanceValidationReport(
  input: CommitteeGovernanceValidationReportInput,
): CommitteeGovernanceValidationReport {
  const readErrors = input.readErrors ?? [];
  const validationErrors = input.validation?.errors ?? [];
  const errors = readErrors.length > 0 ? readErrors : validationErrors;
  const result = errors.length === 0 && input.validation?.status === 'PASS' ? 'PASS' : 'BLOCKED';

  return {
    command: sanitizeCommitteeGovernanceReportText(input.command),
    workingDirectory: sanitizeCommitteeGovernanceReportText(input.workingDirectory),
    validatedTarget: sanitizeCommitteeGovernanceReportText(input.validatedTarget),
    result,
    exitCode: result === 'PASS' ? 0 : 1,
    structuralIssues: errors.length,
    issueGroups: groupCommitteeGovernanceValidationIssues(errors),
    structuralIssueExamples: errors.slice(0, 14).map(sanitizeCommitteeGovernanceReportText),
    boundary: {
      'Evidence target read': readErrors.length === 0 ? 'yes' : 'no',
      'Committee governance validator completed': input.validation ? 'yes' : 'no',
      'Public claim authorization granted': 'no',
      'Release gate PASS claimed': 'no',
      'Gate 6 committee governance closure claimed': 'no',
      'Key rotation authorization granted': 'no',
      'Runtime database or deployment state opened': 'no',
      'Transaction broadcast, submit, deploy, rotate keys, reconcile, or state mutation performed': 'no',
    },
  };
}

export function formatCommitteeGovernanceValidationReportMarkdown(
  report: CommitteeGovernanceValidationReport,
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
    '# Committee Governance Evidence Validation Report',
    '',
    'This report records one committee governance validator result. It does not authorize public claims, release claims, publishing, deployment, key rotation, governance mutation, or transaction broadcast.',
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

export function groupCommitteeGovernanceValidationIssues(
  errors: string[],
): CommitteeGovernanceValidationIssueGroup[] {
  const counts = new Map<string, number>();
  for (const error of errors) {
    const group = classifyCommitteeGovernanceValidationIssue(error);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }

  return [...counts.entries()].map(([group, count]) => ({
    group,
    count,
    operatorMeaning: ISSUE_GROUP_MEANINGS[group] ?? ISSUE_GROUP_MEANINGS['Other structural issues'],
  }));
}

function classifyCommitteeGovernanceValidationIssue(error: string): string {
  if (/evidence target BLOCKED|could not be read|validator only accepts Markdown evidence files/i.test(error)) {
    return 'Target access';
  }
  if (/^Drill Classification:/i.test(error)) return 'Drill classification';
  if (/^Scope:/i.test(error)) return 'Scope';
  if (/^Required Commands:/i.test(error)) return 'Required commands';
  if (/^Rotation Plan:/i.test(error)) return 'Rotation plan';
  if (/^Positive Checks:/i.test(error)) return 'Positive checks';
  if (/^Negative Checks:/i.test(error)) return 'Negative checks';
  if (/^Publication Rules:/i.test(error)) return 'Publication rules';
  if (/^Reviewer Sign-Off:/i.test(error)) return 'Reviewer sign-off';
  if (/Evidence Hygiene|duplicate|required section|table not found|placeholder|unresolved/i.test(error)) {
    return 'Evidence hygiene';
  }
  return 'Other structural issues';
}

function sanitizeCommitteeGovernanceReportText(value: string): string {
  return sanitizeReportText(value);
}
