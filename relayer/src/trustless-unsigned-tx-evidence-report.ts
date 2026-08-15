import type { TrustlessUnsignedTxEvidenceJsonValidation } from './aggregate-settlement-candidate-evidence-json.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export type TrustlessUnsignedTxValidationReportResult = 'PASS' | 'BLOCKED';

export interface TrustlessUnsignedTxValidationIssueGroup {
  group: string;
  count: number;
  operatorMeaning: string;
}

export interface TrustlessUnsignedTxValidationReport {
  command: string;
  workingDirectory: string;
  validatedTarget: string;
  result: TrustlessUnsignedTxValidationReportResult;
  exitCode: number;
  structuralIssues: number;
  issueGroups: TrustlessUnsignedTxValidationIssueGroup[];
  structuralIssueExamples: string[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface TrustlessUnsignedTxValidationReportInput {
  command: string;
  workingDirectory: string;
  validatedTarget: string;
  validation: TrustlessUnsignedTxEvidenceJsonValidation;
}

const ISSUE_GROUP_MEANINGS: Record<string, string> = {
  'Target access': 'The requested trustless unsigned transaction evidence target could not be read or accepted by the target guard',
  'Record kind': 'The JSON is not a trustless-single-leaf-unsigned-tx evidence record',
  'Boundary fields': 'One or more no-check, no-sign, no-submit, no-broadcast, or no-claim boundaries is weakened or missing',
  'Selected boxes': 'The selected tracker, DUP, or unlock box identifiers are missing, malformed, or reused',
  'Settlement shape': 'The prepared unsigned transaction shape does not match the V2 single-leaf source-boundary shape',
  'Context-extension guard': 'The context-extension guard status, offender list, or no-sign/no-broadcast decision is incomplete',
  'Trustless burn identity': 'The embedded burn identity, burnId derivation, recipient, amount, or claim binding is incomplete',
  'Evidence hygiene': 'The evidence contains unsupported fields, unsafe targets, or contradictory evidence semantics',
  'Other structural issues': 'The validator returned structural issues outside the standard trustless unsigned transaction groups',
};

export function buildTrustlessUnsignedTxValidationReport(
  input: TrustlessUnsignedTxValidationReportInput,
): TrustlessUnsignedTxValidationReport {
  const errors = input.validation.errors;
  const result = input.validation.status === 'PASS' ? 'PASS' : 'BLOCKED';

  return {
    command: sanitizeTrustlessUnsignedTxReportText(input.command),
    workingDirectory: sanitizeTrustlessUnsignedTxReportText(input.workingDirectory),
    validatedTarget: sanitizeTrustlessUnsignedTxReportText(input.validatedTarget),
    result,
    exitCode: result === 'PASS' ? 0 : 1,
    structuralIssues: errors.length,
    issueGroups: groupTrustlessUnsignedTxValidationIssues(errors),
    structuralIssueExamples: errors.slice(0, 12).map(sanitizeTrustlessUnsignedTxReportText),
    boundary: {
      'Evidence target read': errors.some(error =>
        /could not be read|could not be read or parsed|refusing to write|blocked evidence JSON target/i.test(error)
      )
        ? 'no'
        : 'yes',
      'Trustless unsigned TX validator completed': 'yes',
      'Gate 5 trustless burn closure claimed': 'no',
      'Pre-broadcast evidence claimed': 'no',
      'Transaction-check evidence claimed': 'no',
      'Expected transaction ID evidence claimed': 'no',
      'Signing authorization granted': 'no',
      'Settlement readiness claimed': 'no',
      'Public claim authorization granted': 'no',
      'Release gate PASS claimed': 'no',
      'Runtime database or deployment state opened': 'no',
      'Transaction broadcast, submit, deploy, reconcile, or state mutation performed': 'no',
    },
  };
}

export function formatTrustlessUnsignedTxValidationReportMarkdown(
  report: TrustlessUnsignedTxValidationReport,
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
    '# Trustless Unsigned Transaction Evidence Validation Report',
    '',
    'This report records one trustless single-leaf unsigned transaction evidence validator result. It does not authorize public claims, release claims, pre-broadcast evidence, transaction checks, expected transaction IDs, signing, settlement, reconciliation, or transaction broadcast.',
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

export function groupTrustlessUnsignedTxValidationIssues(
  errors: string[],
): TrustlessUnsignedTxValidationIssueGroup[] {
  const counts = new Map<string, number>();
  for (const error of errors) {
    const group = classifyTrustlessUnsignedTxValidationIssue(error);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }

  return [...counts.entries()].map(([group, count]) => ({
    group,
    count,
    operatorMeaning: ISSUE_GROUP_MEANINGS[group] ?? ISSUE_GROUP_MEANINGS['Other structural issues'],
  }));
}

function classifyTrustlessUnsignedTxValidationIssue(error: string): string {
  if (/could not be read|could not be read or parsed|refusing to write|blocked evidence JSON target/i.test(error)) {
    return 'Target access';
  }
  if (/evidenceKind|contractCompatibility|must not validate as/i.test(error)) return 'Record kind';
  if (/^boundary\.|broadcast must be no|stateTrackerMode must be read-only|unsupported evidence field/i.test(error)) {
    return 'Boundary fields';
  }
  if (/^selectedBoxes/i.test(error)) return 'Selected boxes';
  if (/^settlementShape/i.test(error)) return 'Settlement shape';
  if (/^contextExtensionGuard/i.test(error)) return 'Context-extension guard';
  if (/^claims|^payoutBinding|trustlessBurnDerivation|settlementIdentity|burnId|amountNanoErg|recipientErgoTreeHash/i.test(error)) {
    return 'Trustless burn identity';
  }
  if (/placeholder|unsafe|secret|runtime|duplicate|unsupported/i.test(error)) return 'Evidence hygiene';
  return 'Other structural issues';
}

function sanitizeTrustlessUnsignedTxReportText(value: string): string {
  return sanitizeReportText(value);
}
