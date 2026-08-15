import type { BenchmarkPrerequisiteMap } from './benchmark-prerequisite-map.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export interface BenchmarkLiveReviewPacket {
  title: string;
  validatorCommit: string;
  candidateTarget: string;
  prerequisiteMapTarget: string;
  command: string;
  result: 'PASS' | 'BLOCKED';
  structuralIssues: number;
  liveBatchIssueCount: number;
  reviewerApprovalIssueCount: number;
  publicationBoundaryIssueCount: number;
  reviewInputs: BenchmarkLiveReviewInput[];
  decisionQuestions: BenchmarkLiveDecisionQuestion[];
  requiredOutputBindings: string[];
  completionChecklist: BenchmarkLiveReviewChecklistItem[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface BenchmarkLiveReviewInput {
  area: string;
  reviewerMustConfirm: string;
  evidenceToInspect: string;
}

export interface BenchmarkLiveDecisionQuestion {
  question: string;
  approvingAnswer: string;
  blockedAnswer: string;
}

export interface BenchmarkLiveReviewChecklistItem {
  item: string;
  validatorDependency: string;
}

export interface BenchmarkLiveReviewPacketInput {
  prerequisiteMap: BenchmarkPrerequisiteMap;
  prerequisiteMapTarget: string;
  command: string;
}

const REQUIRED_OUTPUT_BINDINGS = [
  'Scaling claims allowed = yes',
  'Production-ready claim allowed = no',
  'Testnet production-candidate claim allowed = yes',
  'Production throughput claim allowed = no',
  'Mainnet-grade evidence linked = no',
  'Open benchmark blockers = 0',
  'Release notes updated = yes',
];

export function buildBenchmarkLiveReviewPacket(input: BenchmarkLiveReviewPacketInput): BenchmarkLiveReviewPacket {
  const issues = input.prerequisiteMap.issues.map(issue => issue.issue);
  return {
    title: `Gate 7 Live Benchmark Review Packet - ${sanitize(input.prerequisiteMap.validatorCommit)}`,
    validatorCommit: sanitize(input.prerequisiteMap.validatorCommit),
    candidateTarget: sanitize(input.prerequisiteMap.candidateTarget),
    prerequisiteMapTarget: sanitize(input.prerequisiteMapTarget),
    command: sanitize(input.command),
    result: input.prerequisiteMap.result,
    structuralIssues: input.prerequisiteMap.structuralIssues,
    liveBatchIssueCount: issues.filter(issue => /Live batch settlement/i.test(issue)).length,
    reviewerApprovalIssueCount: issues.filter(issue => /Reviewer Sign-Off/i.test(issue)).length,
    publicationBoundaryIssueCount: issues.filter(issue =>
      /Open benchmark blockers|Publication Decision|Reviewer decision summary/i.test(issue),
    ).length,
    reviewInputs: buildReviewInputs(),
    decisionQuestions: buildDecisionQuestions(),
    requiredOutputBindings: REQUIRED_OUTPUT_BINDINGS,
    completionChecklist: buildCompletionChecklist(),
    boundary: {
      'Planning output only': 'yes',
      'Derived from Gate 7 prerequisite map': 'yes',
      'Completed benchmark evidence claimed': 'no',
      'Evidence row closure claimed': 'no',
      'Gate 7 benchmark closure claimed': 'no',
      'Release gate PASS claimed': 'no',
      'Public claim authorization granted': 'no',
      'Live broadcast approval granted by this packet': 'no',
      'Production throughput claim authorized by this packet': 'no',
      'Runtime database or deployment state opened': 'no',
      'Transaction broadcast, submit, deploy, key rotation, or state mutation performed': 'no',
    },
  };
}

export function formatBenchmarkLiveReviewPacketMarkdown(report: BenchmarkLiveReviewPacket): string {
  return [
    `# ${escapeMarkdownText(report.title)}`,
    '',
    'This packet turns the current Gate 7 benchmark prerequisite map into live-run reviewer inputs and decision questions.',
    'It is not completed benchmark evidence and does not authorize live broadcast, release, production throughput, deployment, signing, settlement, or publication claims.',
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
      ['Live batch issues', String(report.liveBatchIssueCount)],
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

function buildReviewInputs(): BenchmarkLiveReviewInput[] {
  return [
    {
      area: 'Live approval scope',
      reviewerMustConfirm:
        'Explicit live broadcast approval is present, scoped to one Expected transaction ID, network, candidate, and batch window.',
      evidenceToInspect:
        'User approval packet plus expected transaction identity evidence before any enabled broadcast run.',
    },
    {
      area: 'Broadcast enablement boundary',
      reviewerMustConfirm:
        'BRIDGE_BROADCAST_ENABLED=true is scoped to the approved run only, with readiness, broadcast policy, and network reconfirmation outputs.',
      evidenceToInspect:
        'Scoped environment evidence, npm run demo:readiness PASS, broadcast policy PASS, and network reconfirmation artifacts.',
    },
    {
      area: 'Live settlement signing',
      reviewerMustConfirm:
        'Live settlement signing evidence uses the bridge sigma-rust WASM signer path and does not reintroduce node or Fleet prover signing for register-derived propositions.',
      evidenceToInspect:
        'Live settlement signing PASS evidence and signer-boundary notes.',
    },
    {
      area: 'Transaction identity and reconciliation',
      reviewerMustConfirm:
        'Submitted transaction ID, confirmation evidence, finality evidence, and reconciliation evidence all bind to the same Expected transaction ID.',
      evidenceToInspect:
        'Submit, confirmation, post-submit observation, finality, and reconciliation artifacts.',
    },
    {
      area: 'Metric and throughput boundary',
      reviewerMustConfirm:
        'Live metrics include positive throughput, latency, build time, proof size, transaction size, inputs, outputs, vars, and batch counts without approving production throughput.',
      evidenceToInspect:
        'Live batch metric row evidence and benchmark publication decision fields.',
    },
    {
      area: 'Claim boundary',
      reviewerMustConfirm:
        'Testnet production-candidate benchmark support remains bounded, while production-ready, production-throughput, and mainnet-grade claims stay blocked.',
      evidenceToInspect:
        'Publication decision, reviewer decision summary, release-note update evidence, and checklist update evidence.',
    },
  ];
}

function buildDecisionQuestions(): BenchmarkLiveDecisionQuestion[] {
  return [
    {
      question: 'Can the live batch settlement evidence be accepted?',
      approvingAnswer:
        'Yes, only with explicit approval, scoped broadcast enablement, readiness/policy/signing PASS, network reconfirmation, submit, confirmation, finality, and reconciliation evidence bound to the same Expected transaction ID.',
      blockedAnswer:
        'No, if approval is missing, the transaction identity is ambiguous, broadcast scope is broad, or readiness/signing evidence is contradicted.',
    },
    {
      question: 'Are all Gate 7 benchmark blockers closed?',
      approvingAnswer:
        'Yes, with exact Open benchmark blockers = 0 in publication fields and reviewer decision summary.',
      blockedAnswer:
        'No, if any blocker remains open or closure is expressed only with prose, shorthand, or zero-like wording.',
    },
    {
      question: 'Can testnet production-candidate benchmark support be allowed?',
      approvingAnswer:
        'Yes, only with exact Testnet production-candidate claim allowed = yes, Production-ready claim allowed = no, Production throughput claim allowed = no, and Mainnet-grade evidence linked = no.',
      blockedAnswer:
        'No, if the evidence approves production-ready, production-throughput, mainnet-grade, exchange-scale, or unqualified scaling claims.',
    },
    {
      question: 'Can Gate 7 reviewer sign-offs move to approve?',
      approvingAnswer:
        'Yes, after benchmark owner, security reviewer, and operator reviewer each approve with dates not before the benchmark classification date.',
      blockedAnswer:
        'No, if any reviewer blocks, omits a date, predates the classification, or leaves live-run or claim boundaries ambiguous.',
    },
  ];
}

function buildCompletionChecklist(): BenchmarkLiveReviewChecklistItem[] {
  return [
    {
      item: 'Link completed live batch settlement evidence.',
      validatorDependency: 'Metric Table: Live batch settlement.',
    },
    {
      item: 'Set publication and reviewer-summary fields to exact closure values only after live evidence acceptance.',
      validatorDependency: 'Publication Decision: open benchmark blocker fields.',
    },
    {
      item: 'Record benchmark owner approval after live metric and publication boundary closure.',
      validatorDependency: 'Reviewer Sign-Off: Benchmark owner.',
    },
    {
      item: 'Record security reviewer approval after broadcast, signing, and transaction-identity review.',
      validatorDependency: 'Reviewer Sign-Off: Security reviewer.',
    },
    {
      item: 'Record operator reviewer approval after submit, confirmation, finality, and reconciliation review.',
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
