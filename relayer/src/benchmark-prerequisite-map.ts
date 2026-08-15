import type { BenchmarkEvidenceValidation } from './benchmark-evidence.js';
import type { BenchmarkValidationReport } from './benchmark-evidence-report.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export interface BenchmarkPrerequisiteMapIssue {
  issue: string;
  evidencePrerequisite: string;
}

export interface BenchmarkPrerequisiteMapStep {
  step: string;
  status: string;
  requiredOutput: string;
}

export interface BenchmarkPrerequisiteMap {
  title: string;
  validatorCommit: string;
  candidateTarget: string;
  validatorReportTarget: string;
  command: string;
  workingDirectory: string;
  result: 'PASS' | 'BLOCKED';
  exitCode: number;
  structuralIssues: number;
  issues: BenchmarkPrerequisiteMapIssue[];
  nextEvidenceSequence: BenchmarkPrerequisiteMapStep[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface BenchmarkPrerequisiteMapInput {
  validatorCommit: string;
  candidateTarget: string;
  validatorReportTarget: string;
  command: string;
  validationReport: BenchmarkValidationReport;
  validation?: BenchmarkEvidenceValidation;
  readErrors?: string[];
}

export function buildBenchmarkPrerequisiteMap(input: BenchmarkPrerequisiteMapInput): BenchmarkPrerequisiteMap {
  const readErrors = input.readErrors ?? [];
  const validationErrors = input.validation?.errors ?? [];
  const errors = readErrors.length > 0 ? readErrors : validationErrors;
  const liveBatchBlocked = errors.some(issue => /Live batch settlement/i.test(issue));
  const publicationBlocked = errors.some(issue => /Open benchmark blockers|Publication Decision|Reviewer decision summary/i.test(issue));
  const reviewerBlocked = errors.some(issue => /Reviewer Sign-Off/i.test(issue));

  return {
    title: `Gate 7 Live Batch Benchmark Prerequisite Map - ${sanitize(input.validatorCommit)}`,
    validatorCommit: sanitize(input.validatorCommit),
    candidateTarget: sanitize(input.candidateTarget),
    validatorReportTarget: sanitize(input.validatorReportTarget),
    command: sanitize(input.command),
    workingDirectory: sanitize(input.validationReport.workingDirectory),
    result: input.validationReport.result,
    exitCode: input.validationReport.exitCode,
    structuralIssues: errors.length,
    issues: errors.map(issue => ({
      issue: sanitize(issue),
      evidencePrerequisite: prerequisiteForBenchmarkIssue(issue),
    })),
    nextEvidenceSequence: buildNextEvidenceSequence(input.validationReport, errors),
    boundary: {
      'Planning output only': 'yes',
      'Benchmark validator completed': input.validation ? 'yes' : 'no',
      'Evidence row closure claimed': 'no',
      'Release gate PASS claimed': 'no',
      'Public claim authorization granted': 'no',
      'Gate 7 benchmark closure claimed': 'no',
      'Live batch evidence prerequisites linked': liveBatchBlocked ? 'no' : 'yes',
      'Publication closure prerequisites linked': publicationBlocked ? 'no' : 'yes',
      'Reviewer approval prerequisites linked': reviewerBlocked ? 'no' : 'yes',
      'Runtime database or deployment state opened': 'no',
      'Transaction broadcast, submit, deploy, key rotation, or state mutation performed': 'no',
    },
  };
}

export function formatBenchmarkPrerequisiteMapMarkdown(report: BenchmarkPrerequisiteMap): string {
  const issueRows = report.issues.length > 0
    ? report.issues.map(issue => [issue.issue, issue.evidencePrerequisite])
    : [['No structural issues reported', 'No Gate 7 benchmark evidence prerequisite remains under the validator result.']];

  return [
    `# ${escapeMarkdownText(report.title)}`,
    '',
    'This packet records the current Gate 7 benchmark validator result for the',
    'selected benchmark candidate and converts the remaining blockers into live',
    'batch and reviewer evidence prerequisites.',
    '',
    'It is not completed Gate 7 benchmark evidence. It does not support live',
    'settlement, production throughput, testnet production-candidate, mainnet,',
    'production-ready, trustless-burn-complete, or full parallel L1 settlement',
    'claims.',
    '',
    'No wallet recovery material, signing credential material, private deployment',
    'state, local runtime state, private database state, or live transaction evidence',
    'was read or used for this packet.',
    '',
    '## Validation Snapshot',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['Validator commit', report.validatorCommit],
      ['Candidate target', report.candidateTarget],
      ['Validator report', report.validatorReportTarget],
      ['Command', `\`${report.command}\``],
      ['Working directory', report.workingDirectory],
      ['Result', report.result],
      ['Exit code', String(report.exitCode)],
      ['Structural issues', String(report.structuralIssues)],
      ['Stack trace emitted', 'no'],
      ['Local path emitted', 'no'],
    ]),
    '',
    '## Exact Remaining Validator Issues',
    '',
    markdownTable([
      ['Issue', 'Evidence prerequisite'],
      ...issueRows,
    ]),
    '',
    '## Next Evidence Sequence',
    '',
    markdownTable([
      ['Step', 'Status under current authorization', 'Required output'],
      ...report.nextEvidenceSequence.map(row => [row.step, row.status, row.requiredOutput]),
    ]),
    '',
    '## Boundary',
    '',
    markdownTable([
      ['Boundary', 'Value'],
      ...Object.entries(report.boundary),
    ]),
    '',
  ].join('\n');
}

function buildNextEvidenceSequence(
  validationReport: BenchmarkValidationReport,
  errors: string[],
): BenchmarkPrerequisiteMapStep[] {
  const liveBatchBlocked = errors.some(issue => /Live batch settlement/i.test(issue));
  const publicationBlocked = errors.some(issue => /Open benchmark blockers|Publication Decision|Reviewer decision summary/i.test(issue));
  const reviewerBlocked = errors.some(issue => /Reviewer Sign-Off/i.test(issue));

  return [
    {
      step: 'Reconfirm current benchmark candidate',
      status: 'complete',
      requiredOutput: `Validator report above: ${validationReport.result} with ${validationReport.structuralIssues} structural issue(s).`,
    },
    {
      step: 'Collect live batch readiness and broadcast-boundary evidence',
      status: liveBatchBlocked ? 'blocked until explicit live-run approval' : 'complete',
      requiredOutput: liveBatchBlocked
        ? 'Readiness, broadcast policy, live settlement signing, scoped `BRIDGE_BROADCAST_ENABLED=true`, network reconfirmation, and explicit live broadcast approval bound to Expected transaction ID.'
        : 'Live batch readiness and broadcast-boundary evidence are linked in the validator result.',
    },
    {
      step: 'Submit, confirm, and reconcile live batch settlement',
      status: liveBatchBlocked ? 'blocked until explicit live-run approval' : 'complete',
      requiredOutput: liveBatchBlocked
        ? 'Submitted transaction ID, confirmation evidence, finality evidence, and reconciliation evidence that match the Expected transaction ID.'
        : 'Live submit, confirmation, finality, and reconciliation evidence are linked and validator-accepted.',
    },
    {
      step: 'Move benchmark publication fields to closure values',
      status: publicationBlocked ? 'blocked until live batch and reviewer evidence exists' : 'complete',
      requiredOutput: publicationBlocked
        ? 'Publication decision and reviewer summary with exact `Open benchmark blockers = 0`, bounded scaling support, and production throughput/mainnet claims still blocked.'
        : 'Publication-rule closure fields are linked and validator-accepted.',
    },
    {
      step: 'Approve Gate 7 reviewer sign-offs',
      status: reviewerBlocked ? 'blocked until blocker closure is evidenced' : 'complete',
      requiredOutput: reviewerBlocked
        ? 'Benchmark owner, security reviewer, and operator reviewer approvals with dates not before classification.'
        : 'Benchmark owner, security reviewer, and operator reviewer approvals are linked and validator-accepted.',
    },
  ];
}

export function prerequisiteForBenchmarkIssue(issue: string): string {
  if (/Metric Table:\s*Live batch settlement/i.test(issue)) {
    return 'Completed live batch settlement evidence with explicit live broadcast approval bound to Expected transaction ID, scoped `BRIDGE_BROADCAST_ENABLED=true` evidence, readiness/policy/signing PASS evidence, network reconfirmation, submitted transaction ID, confirmation, finality, and reconciliation evidence.';
  }
  if (/Open benchmark blockers must be 0/i.test(issue)) {
    return 'Gate 7 publication fields can only use exact `Open benchmark blockers = 0` after live batch evidence and reviewer approvals close the remaining benchmark blockers.';
  }
  if (/Reviewer decision summary: open benchmark blockers must be 0/i.test(issue)) {
    return 'Reviewer decision summary must preserve exact `Open benchmark blockers = 0`, not prose-only, zero-like, or shorthand closure wording.';
  }
  if (/Reviewer Sign-Off: Benchmark owner/i.test(issue)) {
    return 'Benchmark owner approval after live batch evidence, blocker closure, publication-update evidence, and bounded scaling claims are complete.';
  }
  if (/Reviewer Sign-Off: Security reviewer/i.test(issue)) {
    return 'Security approval after broadcast-boundary evidence, live settlement signing evidence, transaction identity checks, and production-throughput claim boundaries are complete.';
  }
  if (/Reviewer Sign-Off: Operator reviewer/i.test(issue)) {
    return 'Operator approval after live submit, confirmation, finality, reconciliation, rollback, and no-broadcast-boundary review are complete.';
  }
  if (/target|read|Markdown evidence files/i.test(issue)) {
    return 'Use a concrete public Markdown benchmark evidence target inside the bridge repository and keep environment files, runtime databases, local paths, and secret-bearing targets out of evidence input.';
  }
  return 'Manual Gate 7 benchmark evidence triage is required before any live settlement, scaling, production-candidate, throughput, or publication claim can be supported.';
}

function markdownTable(rows: string[][]): string {
  const [header, ...body] = rows;
  return [
    `| ${header.map(escapeMarkdownCell).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map(row => `| ${row.map(escapeMarkdownCell).join(' | ')} |`),
  ].join('\n');
}

function escapeMarkdownCell(value: string): string {
  return escapeMarkdownText(value).replace(/\n/g, '<br>').replace(/\|/g, '\\|');
}

function escapeMarkdownText(value: string): string {
  return sanitize(value);
}

function sanitize(value: string): string {
  return sanitizeReportText(value).trim();
}
