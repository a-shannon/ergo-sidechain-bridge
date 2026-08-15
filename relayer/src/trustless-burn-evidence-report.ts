import type { TrustlessBurnEvidenceValidation } from './trustless-burn-evidence.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export type TrustlessBurnValidationReportResult = 'PASS' | 'BLOCKED';

export interface TrustlessBurnValidationIssueGroup {
  group: string;
  count: number;
  operatorMeaning: string;
}

export interface TrustlessBurnValidationReport {
  command: string;
  workingDirectory: string;
  validatedTarget: string;
  result: TrustlessBurnValidationReportResult;
  exitCode: number;
  structuralIssues: number;
  issueGroups: TrustlessBurnValidationIssueGroup[];
  structuralIssueExamples: string[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface TrustlessBurnValidationReportInput {
  command: string;
  workingDirectory: string;
  validatedTarget: string;
  readErrors?: string[];
  validation?: TrustlessBurnEvidenceValidation;
  cliErrors?: string[];
}

const ISSUE_GROUP_MEANINGS: Record<string, string> = {
  'Target access': 'The requested trustless-burn evidence target could not be read or accepted by the target guard',
  'Evidence classification': 'Evidence identity, commit, release level, environment, trust path, reviewer, or date is incomplete',
  'Required components': 'One or more required trustless-burn component rows is not linked as completed Gate 5 evidence',
  'Commitment format': 'Commitment fields, encodings, finality, anchoring, or completed commitment evidence are incomplete',
  'Burn proof binding': 'One or more burn proof fields lacks exact binding data or completed Gate 5 evidence',
  'Local proof vector': 'Local proof-vector evidence or proof-vector report linkage is incomplete or inconsistent',
  'Positive proof acceptance': 'Accepted proof execution evidence is incomplete or not linked',
  'Negative tests': 'One or more required negative trustless-burn rejection cases lacks completed evidence',
  'Publication decision': 'Gate 5 implementation, claim-boundary, release-note, checklist, or blocker-closure fields are incomplete',
  'Reviewer sign-off': 'Protocol, security, or operator reviewer approval is incomplete or inconsistent',
  'Evidence hygiene': 'The evidence text has unresolved, duplicate, placeholder, or unsafe evidence markers',
  'Other structural issues': 'The validator returned structural issues outside the standard trustless-burn evidence groups',
};

export function buildTrustlessBurnValidationReport(
  input: TrustlessBurnValidationReportInput,
): TrustlessBurnValidationReport {
  const readErrors = input.readErrors ?? [];
  const cliErrors = input.cliErrors ?? [];
  const validationErrors = input.validation?.errors ?? [];
  const errors = readErrors.length > 0 ? readErrors : [...validationErrors, ...cliErrors];
  const result = errors.length === 0 && input.validation?.status === 'PASS' ? 'PASS' : 'BLOCKED';

  return {
    command: sanitizeTrustlessBurnReportText(input.command),
    workingDirectory: sanitizeTrustlessBurnReportText(input.workingDirectory),
    validatedTarget: sanitizeTrustlessBurnReportText(input.validatedTarget),
    result,
    exitCode: result === 'PASS' ? 0 : 1,
    structuralIssues: errors.length,
    issueGroups: groupTrustlessBurnValidationIssues(errors),
    structuralIssueExamples: errors.slice(0, 14).map(sanitizeTrustlessBurnReportText),
    boundary: {
      'Evidence target read': readErrors.length === 0 ? 'yes' : 'no',
      'Trustless burn validator completed': input.validation ? 'yes' : 'no',
      'Public claim authorization granted': 'no',
      'Release gate PASS claimed': 'no',
      'Gate 5 trustless burn closure claimed': 'no',
      'Settlement readiness claimed': 'no',
      'Runtime database or deployment state opened': 'no',
      'Transaction broadcast, submit, deploy, reconcile, or state mutation performed': 'no',
    },
  };
}

export function formatTrustlessBurnValidationReportMarkdown(
  report: TrustlessBurnValidationReport,
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
  const issueGroups = report.issueGroups.length > 0
    ? [
        '| Issue group | Count | Operator meaning |',
        '|---|---:|---|',
        ...report.issueGroups.map(issue =>
          `| ${issue.group} | ${issue.count} | ${issue.operatorMeaning} |`
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
    '# Trustless Burn Evidence Validation Report',
    '',
    'This report records one trustless-burn validator result. It does not authorize public claims, release claims, publishing, deployment, settlement, reconciliation, or transaction broadcast.',
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

export function groupTrustlessBurnValidationIssues(errors: string[]): TrustlessBurnValidationIssueGroup[] {
  const counts = new Map<string, number>();
  for (const error of errors) {
    const group = classifyTrustlessBurnValidationIssue(error);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }

  return [...counts.entries()].map(([group, count]) => ({
    group,
    count,
    operatorMeaning: ISSUE_GROUP_MEANINGS[group] ?? ISSUE_GROUP_MEANINGS['Other structural issues'],
  }));
}

function classifyTrustlessBurnValidationIssue(error: string): string {
  if (/evidence target BLOCKED|could not be read|validator only accepts Markdown evidence files/i.test(error)) {
    return 'Target access';
  }
  if (/^Evidence Classification:/i.test(error)) return 'Evidence classification';
  if (/^Required Components:/i.test(error)) return 'Required components';
  if (/^Commitment Format:/i.test(error)) return 'Commitment format';
  if (/^Burn Proof Binding:/i.test(error)) return 'Burn proof binding';
  if (/^Local Proof Vector/i.test(error)) return 'Local proof vector';
  if (/^Positive Proof Acceptance:/i.test(error)) return 'Positive proof acceptance';
  if (/^Negative Tests:/i.test(error)) return 'Negative tests';
  if (/^Publication Decision:/i.test(error)) return 'Publication decision';
  if (/^Reviewer Sign-Off:/i.test(error)) return 'Reviewer sign-off';
  if (/Evidence Hygiene|duplicate|required section|table not found|placeholder|unresolved/i.test(error)) {
    return 'Evidence hygiene';
  }
  return 'Other structural issues';
}

function sanitizeTrustlessBurnReportText(value: string): string {
  return sanitizeReportText(value);
}
