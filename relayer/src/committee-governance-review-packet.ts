import type {
  CommitteeGovernancePrerequisiteMap,
} from './committee-governance-prerequisite-map.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export interface CommitteeGovernanceReviewPacket {
  title: string;
  validatorCommit: string;
  candidateTarget: string;
  prerequisiteMapTarget: string;
  command: string;
  result: 'PASS' | 'BLOCKED';
  structuralIssues: number;
  externalReviewRequired: boolean;
  reviewerApprovalIssueCount: number;
  publicationBoundaryIssueCount: number;
  reviewInputs: CommitteeGovernanceReviewInput[];
  decisionQuestions: CommitteeGovernanceDecisionQuestion[];
  requiredOutputBindings: string[];
  completionChecklist: CommitteeGovernanceReviewChecklistItem[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface CommitteeGovernanceReviewInput {
  area: string;
  reviewerMustConfirm: string;
  evidenceToInspect: string;
}

export interface CommitteeGovernanceDecisionQuestion {
  question: string;
  approvingAnswer: string;
  blockedAnswer: string;
}

export interface CommitteeGovernanceReviewChecklistItem {
  item: string;
  validatorDependency: string;
}

export interface CommitteeGovernanceReviewPacketInput {
  prerequisiteMap: CommitteeGovernancePrerequisiteMap;
  prerequisiteMapTarget: string;
  command: string;
}

const REQUIRED_OUTPUT_BINDINGS = [
  'Release supported = production deployment candidate',
  'Governance-ready claim allowed = yes',
  'Production-ready claim allowed = no',
  'Testnet production-candidate claim allowed = yes',
  'Open governance blockers = 0',
  'Release notes updated = yes',
];

export function buildCommitteeGovernanceReviewPacket(
  input: CommitteeGovernanceReviewPacketInput,
): CommitteeGovernanceReviewPacket {
  const issues = input.prerequisiteMap.issues.map(issue => issue.issue);
  return {
    title: `Gate 6 External Governance Review Packet - ${sanitize(input.prerequisiteMap.validatorCommit)}`,
    validatorCommit: sanitize(input.prerequisiteMap.validatorCommit),
    candidateTarget: sanitize(input.prerequisiteMap.candidateTarget),
    prerequisiteMapTarget: sanitize(input.prerequisiteMapTarget),
    command: sanitize(input.command),
    result: input.prerequisiteMap.result,
    structuralIssues: input.prerequisiteMap.structuralIssues,
    externalReviewRequired: issues.some(issue => /External review evidence/i.test(issue)),
    reviewerApprovalIssueCount: issues.filter(issue => /Reviewer Sign-Off/i.test(issue)).length,
    publicationBoundaryIssueCount: issues.filter(issue =>
      /Release supported|Governance-ready claim allowed|Open governance blockers|Reviewer decision summary/i.test(issue),
    ).length,
    reviewInputs: buildReviewInputs(),
    decisionQuestions: buildDecisionQuestions(),
    requiredOutputBindings: REQUIRED_OUTPUT_BINDINGS,
    completionChecklist: buildCompletionChecklist(),
    boundary: {
      'Planning output only': 'yes',
      'Derived from Gate 6 prerequisite map': 'yes',
      'Completed external review evidence claimed': 'no',
      'Evidence row closure claimed': 'no',
      'Gate 6 committee governance closure claimed': 'no',
      'Release gate PASS claimed': 'no',
      'Public claim authorization granted': 'no',
      'Governance-ready claim authorized by this packet': 'no',
      'Key rotation authorization granted': 'no',
      'Runtime database or deployment state opened': 'no',
      'Transaction broadcast, submit, deploy, rotate keys, reconcile, or state mutation performed': 'no',
    },
  };
}

export function formatCommitteeGovernanceReviewPacketMarkdown(
  report: CommitteeGovernanceReviewPacket,
): string {
  return [
    `# ${escapeMarkdownText(report.title)}`,
    '',
    'This packet turns the current Gate 6 committee governance prerequisite map into external reviewer inputs and decision questions.',
    'It is not completed committee governance evidence and does not authorize governance-ready, release, deployment, key-rotation, signing, settlement, or broadcast claims.',
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
      ['External review required', report.externalReviewRequired ? 'yes' : 'no'],
      ['Reviewer approval issues', String(report.reviewerApprovalIssueCount)],
      ['Publication-boundary issues', String(report.publicationBoundaryIssueCount)],
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

function buildReviewInputs(): CommitteeGovernanceReviewInput[] {
  return [
    {
      area: 'Governance model and threshold',
      reviewerMustConfirm:
        'Committee or multisig governance is used, threshold is at least 2, member count is at least 3, and threshold is lower than member count.',
      evidenceToInspect:
        'Completed committee classification plus scope evidence naming old and new committee public key or hash identifiers.',
    },
    {
      area: 'Deployment-state reconciliation',
      reviewerMustConfirm:
        'Sanitized reconciliation binds network, sidechain id, singleton identity, previous authority, target committee authority, and rollback state.',
      evidenceToInspect:
        'Completed reconciliation report and command output for npm run governance:reconcile:validate with exit code 0.',
    },
    {
      area: 'Wrong-network rejection',
      reviewerMustConfirm:
        'A mismatched deployment-state network blocks the rotation path before any key-rotation, deploy, submit, or broadcast step.',
      evidenceToInspect:
        'Completed wrong-network negative evidence and sanitized governance:reconcile:validate command output with exit code 0.',
    },
    {
      area: 'Signer and key-rotation safety',
      reviewerMustConfirm:
        'Old and new committee identifiers are disjoint, signer threshold behavior is bounded, rollback or stop conditions are actionable, and no single-signer fallback is approved.',
      evidenceToInspect:
        'Rotation, positive-check, negative-check, member-loss, singleton continuity, and emergency-boundary evidence rows.',
    },
    {
      area: 'No-broadcast boundary',
      reviewerMustConfirm:
        'Broadcast mode is disabled or dry-run, and the evidence did not sign, rotate keys, mutate deployment state, deploy, submit, or broadcast.',
      evidenceToInspect:
        'Command-specific output evidence plus reviewer notes and boundary rows.',
    },
    {
      area: 'External review target',
      reviewerMustConfirm:
        'Completed external governance/key-rotation review evidence is concrete, distinct from release-note and checklist update evidence, and includes exact claim-boundary bindings.',
      evidenceToInspect:
        'External review evidence target linked from the Gate 6 publication rules.',
    },
  ];
}

function buildDecisionQuestions(): CommitteeGovernanceDecisionQuestion[] {
  return [
    {
      question: 'Can the external governance/key-rotation review target be accepted?',
      approvingAnswer:
        'Yes, with a concrete completed external review evidence target that includes the exact required claim-boundary bindings.',
      blockedAnswer:
        'No, if the target is missing, generic, reused as publication-update evidence, or lacks exact claim-boundary bindings.',
    },
    {
      question: 'Are all Gate 6 governance blockers closed?',
      approvingAnswer:
        'Yes, with exact Open governance blockers = 0 in publication fields and reviewer decision summary.',
      blockedAnswer:
        'No, if any blocker remains open or closure is expressed only with prose, shorthand, or zero-like wording.',
    },
    {
      question: 'Can the governance-ready claim be allowed for the testnet candidate boundary?',
      approvingAnswer:
        'Yes, only with exact Governance-ready claim allowed = yes, Testnet production-candidate claim allowed = yes, and Production-ready claim allowed = no.',
      blockedAnswer:
        'No, if the evidence approves mainnet, production-ready, single-signer fallback, or unqualified release wording.',
    },
    {
      question: 'Can Gate 6 reviewer sign-offs move to approve?',
      approvingAnswer:
        'Yes, after governance owner, security reviewer, and operator reviewer each approve with dates not before the drill classification date.',
      blockedAnswer:
        'No, if any reviewer blocks, omits a date, predates the classification, or leaves claim/key-rotation boundaries ambiguous.',
    },
  ];
}

function buildCompletionChecklist(): CommitteeGovernanceReviewChecklistItem[] {
  return [
    {
      item: 'Link completed external governance/key-rotation review evidence.',
      validatorDependency: 'Publication Rules: External review evidence.',
    },
    {
      item: 'Set publication and reviewer-summary fields to exact closure values only after reviewer acceptance.',
      validatorDependency: 'Publication Rules: release support, governance-ready claim, and open blocker fields.',
    },
    {
      item: 'Record governance owner approval after evidence closure.',
      validatorDependency: 'Reviewer Sign-Off: Governance owner.',
    },
    {
      item: 'Record security reviewer approval after signer, singleton, wrong-network, and no-broadcast checks.',
      validatorDependency: 'Reviewer Sign-Off: Security reviewer.',
    },
    {
      item: 'Record operator reviewer approval after drill and rollback evidence review.',
      validatorDependency: 'Reviewer Sign-Off: Operator reviewer.',
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
