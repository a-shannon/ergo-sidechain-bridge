import type { SecurityReviewEvidenceValidation } from './security-review-evidence.js';
import type { SecurityReviewValidationReport } from './security-review-evidence-report.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export interface SecurityReviewPrerequisiteMapIssueGroup {
  group: string;
  count: number;
  externalReviewPrerequisite: string;
}

export interface SecurityReviewPrerequisiteMapStep {
  step: string;
  status: string;
  requiredOutput: string;
}

export interface SecurityReviewReviewerPacketInput {
  packet: string;
  requiredContent: string;
}

export interface SecurityReviewPrerequisiteMap {
  title: string;
  validatorCommit: string;
  candidateTarget: string;
  validatorReportTarget: string;
  command: string;
  workingDirectory: string;
  result: 'PASS' | 'BLOCKED';
  exitCode: number;
  structuralIssues: number;
  issueGroups: SecurityReviewPrerequisiteMapIssueGroup[];
  reviewerPacketInputs: SecurityReviewReviewerPacketInput[];
  nextEvidenceSequence: SecurityReviewPrerequisiteMapStep[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface SecurityReviewPrerequisiteMapInput {
  validatorCommit: string;
  candidateTarget: string;
  validatorReportTarget: string;
  command: string;
  validationReport: SecurityReviewValidationReport;
  validation?: SecurityReviewEvidenceValidation;
  readErrors?: string[];
}

export function buildSecurityReviewPrerequisiteMap(
  input: SecurityReviewPrerequisiteMapInput,
): SecurityReviewPrerequisiteMap {
  const readErrors = input.readErrors ?? [];
  const validationErrors = input.validation?.errors ?? [];
  const errors = readErrors.length > 0 ? readErrors : validationErrors;

  const groupNames = input.validationReport.issueGroups.map(group => group.group);
  const hasGroup = (pattern: RegExp): boolean => groupNames.some(group => pattern.test(group));

  return {
    title: `Gate 4 Independent Security Review Prerequisite Map - ${sanitize(input.validatorCommit)}`,
    validatorCommit: sanitize(input.validatorCommit),
    candidateTarget: sanitize(input.candidateTarget),
    validatorReportTarget: sanitize(input.validatorReportTarget),
    command: sanitize(input.command),
    workingDirectory: sanitize(input.validationReport.workingDirectory),
    result: input.validationReport.result,
    exitCode: input.validationReport.exitCode,
    structuralIssues: input.validationReport.structuralIssues,
    issueGroups: input.validationReport.issueGroups.map(group => ({
      group: sanitize(group.group),
      count: group.count,
      externalReviewPrerequisite: prerequisiteForSecurityReviewIssueGroup(group.group),
    })),
    reviewerPacketInputs: buildReviewerPacketInputs(),
    nextEvidenceSequence: buildNextEvidenceSequence(input.validationReport, errors),
    boundary: {
      'Planning output only': 'yes',
      'Security review validator completed': input.validation ? 'yes' : 'no',
      'External reviewer assigned': hasGroup(/Review classification/i) ? 'no' : 'yes',
      'Evidence row closure claimed': 'no',
      'Accepted-risk closure claimed': 'no',
      'Release gate PASS claimed': 'no',
      'Public claim authorization granted': 'no',
      'Gate 4 independent review closure claimed': 'no',
      'Required scope prerequisites linked': hasGroup(/Required scope coverage/i) ? 'no' : 'yes',
      'Evidence package prerequisites linked': hasGroup(/Required evidence package/i) ? 'no' : 'yes',
      'Finding disposition prerequisites linked': hasGroup(/Finding disposition/i) ? 'no' : 'yes',
      'Negative-check prerequisites linked': hasGroup(/Required negative review checks/i) ? 'no' : 'yes',
      'Reviewer approval prerequisites linked': hasGroup(/Reviewer sign-off/i) ? 'no' : 'yes',
      'Runtime database or deployment state opened': 'no',
      'Secret or environment file read': 'no',
      'Transaction broadcast, submit, deploy, reconcile, sign, audit approval, accepted-risk closure, or state mutation performed': 'no',
    },
  };
}

export function formatSecurityReviewPrerequisiteMapMarkdown(report: SecurityReviewPrerequisiteMap): string {
  const groupRows = report.issueGroups.length > 0
    ? report.issueGroups.map(group => [group.group, String(group.count), group.externalReviewPrerequisite])
    : [['No structural issue groups reported', '0', 'No Gate 4 independent-review prerequisite remains under the validator result.']];

  return [
    `# ${escapeMarkdownText(report.title)}`,
    '',
    'This packet records the current Gate 4 independent-security-review validator',
    'result and turns the remaining blockers into the next external-review evidence',
    'package.',
    '',
    'It is not completed independent security review evidence. It does not support',
    'security-review-complete, accepted-risk closure, testnet production-candidate,',
    'production-ready, mainnet, publication, deployment, signing, reconciliation, or',
    'broadcast claims.',
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
    '## Issue Groups',
    '',
    markdownTable([
      ['Issue group', 'Count', 'External-review prerequisite'],
      ...groupRows,
    ]),
    '',
    '## External Reviewer Packet Inputs',
    '',
    markdownTable([
      ['Packet', 'Required content'],
      ...report.reviewerPacketInputs.map(input => [input.packet, input.requiredContent]),
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

export function prerequisiteForSecurityReviewIssueGroup(group: string): string {
  if (/Review classification/i.test(group)) {
    return 'Assign a concrete independent reviewer, review period, testnet scope if production deployment candidate support is requested, and final decision only after review is complete.';
  }
  if (/Required scope coverage/i.test(group)) {
    return 'Reviewer must cover each required scope area with area-specific evidence and risk-focus notes.';
  }
  if (/Required evidence package/i.test(group)) {
    return 'Reviewer cannot close Gate 4 until missing lifecycle, recovery, batch settlement, release-note, command-output, and prerequisite evidence exists.';
  }
  if (/Finding disposition/i.test(group)) {
    return 'Every finding class, accepted-risk disposition, and publication blocker disposition needs linked completed evidence with exact counts.';
  }
  if (/Required negative review checks/i.test(group)) {
    return 'Reviewer must answer each negative-check question with question-specific evidence and linked rejection coverage.';
  }
  if (/Publication decision/i.test(group)) {
    return 'Keep release support, accepted-risk, critical/high, publication blocker, release-note, checklist, and claim-boundary fields blocked until review findings and accepted-risk artifacts are complete.';
  }
  if (/Reviewer sign-off/i.test(group)) {
    return 'Lead reviewer, security owner, maintainer, and operator reviewer approvals remain blocked until evidence, findings, publication updates, and claim boundaries are complete.';
  }
  if (/Target access/i.test(group)) {
    return 'Use a concrete public Markdown independent-security-review evidence target inside the bridge repository and keep local paths, environment files, runtime databases, and secret-bearing targets out of evidence input.';
  }
  if (/Evidence hygiene/i.test(group)) {
    return 'Remove unresolved, duplicate, placeholder, unsafe, validation-target-only, or contradictory evidence markers before any Gate 4 review closure can be claimed.';
  }
  return 'Manual Gate 4 independent security review triage is required before security-review, accepted-risk, testnet production-candidate, or publication claims can be supported.';
}

function buildReviewerPacketInputs(): SecurityReviewReviewerPacketInput[] {
  return [
    {
      packet: 'Classification packet',
      requiredContent:
        'Review name, reviewed commit, release level, environment, concrete external reviewer organization or affiliation, organization type, lead reviewer, independent-external status, ISO review period, ISO date, and final decision.',
    },
    {
      packet: 'Scope packet',
      requiredContent:
        'Area-specific review evidence for ErgoScript contracts, relayer signing, AVL proof generation, settlement reconciliation, sidechain finality and burn validity, operator recovery, and dependency risk.',
    },
    {
      packet: 'Command-evidence packet',
      requiredContent:
        'Completed clean-checkout evidence, npm run check output, and npm run wasm:test output reviewed by the external reviewer.',
    },
    {
      packet: 'Lifecycle packet',
      requiredContent:
        'Fresh local devnet, fresh testnet, failed-broadcast or phantom-AVL, and batch settlement check/submit/confirm evidence once those runs exist and are in scope.',
    },
    {
      packet: 'Recovery packet',
      requiredContent:
        'SQLite/AVL backup-restore evidence plus recovery runbook review proving no private maintainer context is required.',
    },
    {
      packet: 'Finding packet',
      requiredContent:
        'Critical, high, medium, low, informational, accepted-risk, and publication-blocker disposition evidence with exact counts and linked closure artifacts.',
    },
    {
      packet: 'Negative-check packet',
      requiredContent:
        'Question-specific evidence for node-wallet signing, unsafe ContextExtension shape, broadcast opt-in, phantom DUP, invalid payout, same-recipient collision, stale SPV/DUP singleton digest, trusted-burn versus trustless-verification confusion, and SQLite recovery without private maintainer context.',
    },
    {
      packet: 'Publication-update packet',
      requiredContent:
        'Completed Gate 4 accepted-risk checklist and release-note update evidence with exact `Production-ready claim allowed = no`, exact `Critical/high findings open = 0`, exact `Publication blockers = 0`, and accepted-risk reflection only after review closure.',
    },
    {
      packet: 'Sign-off packet',
      requiredContent:
        'Lead reviewer, security owner, maintainer, and operator reviewer approvals matching the review classification and not predating the review date.',
    },
  ];
}

function buildNextEvidenceSequence(
  validationReport: SecurityReviewValidationReport,
  errors: string[],
): SecurityReviewPrerequisiteMapStep[] {
  const hasIssue = (pattern: RegExp): boolean => errors.some(error => pattern.test(error));

  return [
    {
      step: 'Reconfirm current Gate 4 blocker map',
      status: 'complete',
      requiredOutput: `Validator report above: ${validationReport.result} on ${validationReport.structuralIssues} independent-review closure issue(s).`,
    },
    {
      step: 'Assign external reviewer',
      status: hasIssue(/^Review Classification:/i) ? 'external dependency' : 'complete',
      requiredOutput:
        'Concrete external reviewer organization or affiliation and lead reviewer for the Review Classification rows.',
    },
    {
      step: 'Assemble review evidence package',
      status: hasIssue(/^Required Evidence Package:/i) ? 'blocked until missing runtime evidence exists' : 'complete',
      requiredOutput:
        'Current completed CI, dependency, recovery, operator, and checklist evidence plus lifecycle, recovery-observe, batch settlement, Gate 5, Gate 6, Gate 7, and release-note evidence as applicable.',
    },
    {
      step: 'Complete scope and negative-check review',
      status: hasIssue(/^Required Scope Coverage:|^Required Negative Review Checks:/i) ? 'external dependency' : 'complete',
      requiredOutput:
        'Area-specific scope evidence and question-specific negative-check evidence with linked artifacts.',
    },
    {
      step: 'Record finding and accepted-risk disposition',
      status: hasIssue(/^Finding Disposition:|^Publication Decision:/i) ? 'external dependency' : 'complete',
      requiredOutput:
        'Linked finding-class disposition, accepted-risk disposition, accepted-risk checklist update, and accepted-risk release-note update evidence.',
    },
    {
      step: 'Approve review and sign-offs',
      status: hasIssue(/^Reviewer Sign-Off:|^Review Classification:/i) ? 'blocked until review package is complete' : 'complete',
      requiredOutput:
        'Final decision approve plus lead reviewer, security owner, maintainer, and operator reviewer approvals.',
    },
  ];
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
