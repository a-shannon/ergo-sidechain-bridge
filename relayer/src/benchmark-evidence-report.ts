import type { BenchmarkEvidenceValidation } from './benchmark-evidence.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export type BenchmarkValidationReportResult = 'PASS' | 'BLOCKED';

export interface BenchmarkValidationIssueGroup {
  group: string;
  count: number;
  operatorMeaning: string;
}

export interface BenchmarkValidationReport {
  command: string;
  workingDirectory: string;
  validatedTarget: string;
  result: BenchmarkValidationReportResult;
  exitCode: number;
  structuralIssues: number;
  issueGroups: BenchmarkValidationIssueGroup[];
  structuralIssueExamples: string[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface BenchmarkValidationReportInput {
  command: string;
  workingDirectory: string;
  validatedTarget: string;
  readErrors?: string[];
  validation?: BenchmarkEvidenceValidation;
}

const ISSUE_GROUP_MEANINGS: Record<string, string> = {
  'Target access': 'The requested benchmark evidence target could not be read or accepted by the target guard',
  'Benchmark classification': 'Benchmark identity, commit, environment, trust path, or reproducibility metadata is incomplete',
  'Required commands': 'One or more required benchmark/check commands lacks command-specific completed output evidence',
  'Metric table': 'One or more metric rows lacks linked scenario evidence, measurements, or required cost counts',
  'Live batch settlement': 'Live batch evidence is still absent or incomplete and cannot be inferred from offline outputs',
  'Sharded lane evidence': 'One or more sharded-lane statements lacks statement-specific completed evidence',
  'Bottleneck register': 'One or more bottleneck rows lacks bottleneck-specific evidence, impact, or next action',
  'Claims boundary': 'Allowed and blocked benchmark claim arrays are incomplete or weakened',
  'Publication decision': 'Release-note/checklist updates, blocker closure, or claim-boundary decision fields are incomplete',
  'Reviewer sign-off': 'Benchmark owner, security reviewer, or operator reviewer approval is incomplete or inconsistent',
  'Evidence hygiene': 'The evidence text has unresolved, duplicate, placeholder, or unsafe evidence markers',
  'Other structural issues': 'The validator returned structural issues outside the standard benchmark evidence groups',
};

export function buildBenchmarkValidationReport(
  input: BenchmarkValidationReportInput,
): BenchmarkValidationReport {
  const readErrors = input.readErrors ?? [];
  const validationErrors = input.validation?.errors ?? [];
  const errors = readErrors.length > 0 ? readErrors : validationErrors;
  const result = errors.length === 0 && input.validation?.status === 'PASS' ? 'PASS' : 'BLOCKED';

  return {
    command: sanitizeBenchmarkReportText(input.command),
    workingDirectory: sanitizeBenchmarkReportText(input.workingDirectory),
    validatedTarget: sanitizeBenchmarkReportText(input.validatedTarget),
    result,
    exitCode: result === 'PASS' ? 0 : 1,
    structuralIssues: errors.length,
    issueGroups: groupBenchmarkValidationIssues(errors),
    structuralIssueExamples: errors.slice(0, 12).map(sanitizeBenchmarkReportText),
    boundary: {
      'Evidence target read': readErrors.length === 0 ? 'yes' : 'no',
      'Benchmark validator completed': input.validation ? 'yes' : 'no',
      'Public claim authorization granted': 'no',
      'Release gate PASS claimed': 'no',
      'Runtime database or deployment state opened': 'no',
      'Transaction broadcast, submit, deploy, or state mutation performed': 'no',
    },
  };
}

export function formatBenchmarkValidationReportMarkdown(report: BenchmarkValidationReport): string {
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
    '# Benchmark Evidence Validation Report',
    '',
    'This report records one benchmark validator result. It does not authorize public claims, release claims, publishing, deployment, or transaction broadcast.',
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

export function groupBenchmarkValidationIssues(errors: string[]): BenchmarkValidationIssueGroup[] {
  const counts = new Map<string, number>();
  for (const error of errors) {
    const group = classifyBenchmarkValidationIssue(error);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }

  return [...counts.entries()].map(([group, count]) => ({
    group,
    count,
    operatorMeaning: ISSUE_GROUP_MEANINGS[group] ?? ISSUE_GROUP_MEANINGS['Other structural issues'],
  }));
}

function classifyBenchmarkValidationIssue(error: string): string {
  if (/evidence target BLOCKED|could not be read|validator only accepts Markdown evidence files/i.test(error)) {
    return 'Target access';
  }
  if (/^Benchmark Classification:/i.test(error)) return 'Benchmark classification';
  if (/^Required Commands:/i.test(error)) return 'Required commands';
  if (/^Metric Table:\s*Live batch settlement:/i.test(error)) return 'Live batch settlement';
  if (/^Metric Table:/i.test(error)) return 'Metric table';
  if (/^Sharded Lane Evidence:/i.test(error)) return 'Sharded lane evidence';
  if (/^Bottleneck Register:/i.test(error)) return 'Bottleneck register';
  if (/^Claims Boundary:/i.test(error)) return 'Claims boundary';
  if (/^Publication Decision:/i.test(error)) return 'Publication decision';
  if (/^Reviewer Sign-Off:/i.test(error)) return 'Reviewer sign-off';
  if (/Evidence Hygiene|duplicate|required section|table not found|placeholder|unresolved/i.test(error)) {
    return 'Evidence hygiene';
  }
  return 'Other structural issues';
}

function sanitizeBenchmarkReportText(value: string): string {
  return sanitizeReportText(value);
}
