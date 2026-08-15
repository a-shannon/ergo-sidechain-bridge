import type { SecurityReviewPrerequisiteMap } from './security-review-prerequisite-map.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export interface SecurityReviewExternalReviewPacket {
  title: string;
  validatorCommit: string;
  candidateTarget: string;
  prerequisiteMapTarget: string;
  command: string;
  result: 'PASS' | 'BLOCKED';
  structuralIssues: number;
  classificationIssueCount: number;
  scopeIssueCount: number;
  evidencePackageIssueCount: number;
  findingIssueCount: number;
  negativeCheckIssueCount: number;
  publicationBoundaryIssueCount: number;
  reviewerApprovalIssueCount: number;
  reviewInputs: SecurityReviewExternalReviewInput[];
  decisionQuestions: SecurityReviewExternalDecisionQuestion[];
  requiredOutputBindings: string[];
  completionChecklist: SecurityReviewExternalChecklistItem[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface SecurityReviewExternalReviewInput {
  area: string;
  reviewerMustConfirm: string;
  evidenceToInspect: string;
}

export interface SecurityReviewExternalDecisionQuestion {
  question: string;
  approvingAnswer: string;
  blockedAnswer: string;
}

export interface SecurityReviewExternalChecklistItem {
  item: string;
  validatorDependency: string;
}

export interface SecurityReviewExternalReviewPacketInput {
  prerequisiteMap: SecurityReviewPrerequisiteMap;
  prerequisiteMapTarget: string;
  command: string;
}

const REQUIRED_OUTPUT_BINDINGS = [
  'Final decision = approve',
  'Release supported = production deployment candidate',
  'Production-ready claim allowed = no',
  'Testnet production-candidate claim allowed = yes',
  'Critical/high findings open = 0',
  'Publication blockers = 0',
  'Accepted risks reflected in release notes = yes',
];

export function buildSecurityReviewExternalReviewPacket(
  input: SecurityReviewExternalReviewPacketInput,
): SecurityReviewExternalReviewPacket {
  const countFor = (pattern: RegExp): number =>
    input.prerequisiteMap.issueGroups
      .filter(group => pattern.test(group.group))
      .reduce((sum, group) => sum + group.count, 0);

  return {
    title: `Gate 4 Independent Security External Review Packet - ${sanitize(input.prerequisiteMap.validatorCommit)}`,
    validatorCommit: sanitize(input.prerequisiteMap.validatorCommit),
    candidateTarget: sanitize(input.prerequisiteMap.candidateTarget),
    prerequisiteMapTarget: sanitize(input.prerequisiteMapTarget),
    command: sanitize(input.command),
    result: input.prerequisiteMap.result,
    structuralIssues: input.prerequisiteMap.structuralIssues,
    classificationIssueCount: countFor(/Review classification/i),
    scopeIssueCount: countFor(/Required scope coverage/i),
    evidencePackageIssueCount: countFor(/Required evidence package/i),
    findingIssueCount: countFor(/Finding disposition/i),
    negativeCheckIssueCount: countFor(/Required negative review checks/i),
    publicationBoundaryIssueCount: countFor(/Publication decision/i),
    reviewerApprovalIssueCount: countFor(/Reviewer sign-off/i),
    reviewInputs: buildReviewInputs(),
    decisionQuestions: buildDecisionQuestions(),
    requiredOutputBindings: REQUIRED_OUTPUT_BINDINGS,
    completionChecklist: buildCompletionChecklist(),
    boundary: {
      'Planning output only': 'yes',
      'Derived from Gate 4 prerequisite map': 'yes',
      'Completed independent security review evidence claimed': 'no',
      'Evidence row closure claimed': 'no',
      'Gate 4 independent review closure claimed': 'no',
      'Accepted-risk closure claimed': 'no',
      'Release gate PASS claimed': 'no',
      'Public claim authorization granted': 'no',
      'Audit approval granted by this packet': 'no',
      'Production-ready claim authorized by this packet': 'no',
      'Runtime database or deployment state opened': 'no',
      'Secret or environment file read': 'no',
      'Transaction broadcast, submit, deploy, reconcile, sign, audit approval, accepted-risk closure, or state mutation performed': 'no',
    },
  };
}

export function formatSecurityReviewExternalReviewPacketMarkdown(
  report: SecurityReviewExternalReviewPacket,
): string {
  return [
    `# ${escapeMarkdownText(report.title)}`,
    '',
    'This packet turns the current Gate 4 independent-security-review prerequisite map into external reviewer inputs and decision questions.',
    'It is not completed security review evidence and does not authorize audit approval, accepted-risk closure, release, publication, deployment, signing, settlement, or broadcast.',
    '',
    '## Source Snapshot',
    '',
    markdownTable([
      ['Field', 'Value'],
      ['Validator commit', report.validatorCommit],
      ['Candidate target', report.candidateTarget],
      ['Prerequisite map', report.prerequisiteMapTarget],
      ['Command', `\`${report.command}\``],
      ['Current result', report.result],
      ['Structural issues', String(report.structuralIssues)],
      ['Classification issues', String(report.classificationIssueCount)],
      ['Scope issues', String(report.scopeIssueCount)],
      ['Evidence-package issues', String(report.evidencePackageIssueCount)],
      ['Finding issues', String(report.findingIssueCount)],
      ['Negative-check issues', String(report.negativeCheckIssueCount)],
      ['Publication-boundary issues', String(report.publicationBoundaryIssueCount)],
      ['Reviewer approval issues', String(report.reviewerApprovalIssueCount)],
    ]),
    '',
    '## Review Inputs',
    '',
    markdownTable([
      ['Area', 'Reviewer must confirm', 'Evidence to inspect'],
      ...report.reviewInputs.map(input => [
        input.area,
        input.reviewerMustConfirm,
        input.evidenceToInspect,
      ]),
    ]),
    '',
    '## Decision Questions',
    '',
    markdownTable([
      ['Question', 'Approving answer', 'Blocked answer'],
      ...report.decisionQuestions.map(question => [
        question.question,
        question.approvingAnswer,
        question.blockedAnswer,
      ]),
    ]),
    '',
    '## Required Output Bindings',
    '',
    ...report.requiredOutputBindings.map(binding => `- ${escapeMarkdownText(binding)}`),
    '',
    '## Completion Checklist',
    '',
    markdownTable([
      ['Item', 'Validator dependency'],
      ...report.completionChecklist.map(item => [
        item.item,
        item.validatorDependency,
      ]),
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

function buildReviewInputs(): SecurityReviewExternalReviewInput[] {
  return [
    {
      area: 'Reviewer independence and scope',
      reviewerMustConfirm:
        'The review is performed by a concrete independent external reviewer or organization and covers the requested release level and environment.',
      evidenceToInspect:
        'Review Classification rows, reviewer organization type, independence, review period, reviewed commit, and release scope.',
    },
    {
      area: 'Security scope coverage',
      reviewerMustConfirm:
        'Each required scope area has area-specific evidence and risk-focus notes, not generic reviewed wording.',
      evidenceToInspect:
        'Scope rows for ErgoScript contracts, relayer signing, AVL proof generation, settlement reconciliation, sidechain finality and burn validity, operator recovery, and dependency risk.',
    },
    {
      area: 'Evidence package completeness',
      reviewerMustConfirm:
        'The review package includes completed CI, check, wasm:test, lifecycle, recovery, batch-settlement, and release-note evidence where required.',
      evidenceToInspect:
        'Required Evidence Package rows and linked command or evidence artifacts.',
    },
    {
      area: 'Negative security checks',
      reviewerMustConfirm:
        'Each negative question has question-specific evidence covering signer path, unsafe ContextExtension, broadcast opt-in, phantom DUP, payout invalidity, singleton drift, trusted burn confusion, and recovery without private maintainer context.',
      evidenceToInspect:
        'Required Negative Review Checks rows and linked rejection/observation artifacts.',
    },
    {
      area: 'Findings and accepted risks',
      reviewerMustConfirm:
        'Critical/high findings are closed, publication blockers are zero, accepted risks are explicitly reflected in release-note and checklist artifacts, and no accepted risk is hidden in prose.',
      evidenceToInspect:
        'Finding Disposition rows, accepted-risk release-note evidence, accepted-risk checklist evidence, and publication decision rows.',
    },
    {
      area: 'Claim boundary',
      reviewerMustConfirm:
        'Production-ready and mainnet claims remain blocked; testnet production-candidate support is only allowed with complete Gate 4 evidence and exact closure fields.',
      evidenceToInspect:
        'Publication decision, reviewer decision summary, release-note update evidence, checklist update evidence, and reviewer sign-offs.',
    },
  ];
}

function buildDecisionQuestions(): SecurityReviewExternalDecisionQuestion[] {
  return [
    {
      question: 'Can the independent security review evidence be accepted?',
      approvingAnswer:
        'Yes, only with a concrete independent external reviewer, complete required scope coverage, complete evidence package, finding disposition, negative checks, publication updates, and matching reviewer sign-offs.',
      blockedAnswer:
        'No, if reviewer identity is generic, scope coverage is generic, evidence package rows are incomplete, or any blocker is closed only by prose.',
    },
    {
      question: 'Are critical/high findings and publication blockers closed?',
      approvingAnswer:
        'Yes, with exact Critical/high findings open = 0 and Publication blockers = 0 plus linked finding-class and accepted-risk evidence.',
      blockedAnswer:
        'No, if any finding, accepted risk, publication blocker, or update artifact remains open, missing, placeholder, or contradictory.',
    },
    {
      question: 'Can testnet production-candidate security support be allowed?',
      approvingAnswer:
        'Yes, only with exact Testnet production-candidate claim allowed = yes, Production-ready claim allowed = no, and Release supported = production deployment candidate after complete testnet-scoped review.',
      blockedAnswer:
        'No, if evidence approves production-ready, mainnet, broad public-release, or non-testnet security claims.',
    },
    {
      question: 'Can Gate 4 reviewer sign-offs move to approve?',
      approvingAnswer:
        'Yes, after lead reviewer, security owner, maintainer, and operator reviewer each approve with dates not before the review classification date.',
      blockedAnswer:
        'No, if any reviewer blocks, omits a date, predates classification, or leaves finding, accepted-risk, publication, or claim boundaries ambiguous.',
    },
  ];
}

function buildCompletionChecklist(): SecurityReviewExternalChecklistItem[] {
  return [
    {
      item: 'Assign and record the concrete independent reviewer identity and review period.',
      validatorDependency: 'Review Classification rows.',
    },
    {
      item: 'Link area-specific scope coverage and risk-focus evidence.',
      validatorDependency: 'Required Scope Coverage rows.',
    },
    {
      item: 'Link every required evidence-package artifact.',
      validatorDependency: 'Required Evidence Package rows.',
    },
    {
      item: 'Record finding dispositions, accepted risks, and publication blocker closure with exact counts.',
      validatorDependency: 'Finding Disposition rows.',
    },
    {
      item: 'Answer all negative security-review questions with question-specific evidence.',
      validatorDependency: 'Required Negative Review Checks rows.',
    },
    {
      item: 'Set publication decision fields only after review evidence is complete.',
      validatorDependency: 'Publication Decision rows and reviewer decision summary.',
    },
    {
      item: 'Record all reviewer sign-offs after review classification and evidence closure.',
      validatorDependency: 'Reviewer Sign-Off rows.',
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
