import type { RehearsalPrerequisiteMap } from './rehearsal-prerequisite-map.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export interface RehearsalOperatorPacket {
  title: string;
  validatorCommit: string;
  candidateTarget: string;
  prerequisiteMapTarget: string;
  command: string;
  result: 'PASS' | 'BLOCKED';
  structuralIssues: number;
  localLifecycleIssueCount: number;
  liveSubmitIssueCount: number;
  recoveryIssueCount: number;
  publicationBoundaryIssueCount: number;
  captureInputs: RehearsalOperatorCaptureInput[];
  decisionQuestions: RehearsalOperatorDecisionQuestion[];
  requiredOutputBindings: string[];
  completionChecklist: RehearsalOperatorChecklistItem[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface RehearsalOperatorCaptureInput {
  area: string;
  operatorMustCapture: string;
  evidenceToLink: string;
}

export interface RehearsalOperatorDecisionQuestion {
  question: string;
  approvingAnswer: string;
  blockedAnswer: string;
}

export interface RehearsalOperatorChecklistItem {
  item: string;
  validatorDependency: string;
}

export interface RehearsalOperatorPacketInput {
  prerequisiteMap: RehearsalPrerequisiteMap;
  prerequisiteMapTarget: string;
  command: string;
}

const REQUIRED_OUTPUT_BINDINGS = [
  'Broadcast mode at start = disabled',
  'Broadcast mode at end = disabled',
  'Production-ready claim allowed by this rehearsal: no',
  'Testnet production-candidate claim allowed by this rehearsal: no',
  'rehearsal:validate PASS',
  'validated target = completed live rehearsal Markdown',
];

export function buildRehearsalOperatorPacket(
  input: RehearsalOperatorPacketInput,
): RehearsalOperatorPacket {
  const issues = input.prerequisiteMap.issues.map(issue => issue.issue);
  return {
    title: `Gate 3 Rehearsal Operator Packet - ${sanitize(input.prerequisiteMap.validatorCommit)}`,
    validatorCommit: sanitize(input.prerequisiteMap.validatorCommit),
    candidateTarget: sanitize(input.prerequisiteMap.candidateTarget),
    prerequisiteMapTarget: sanitize(input.prerequisiteMapTarget),
    command: sanitize(input.command),
    result: input.prerequisiteMap.result,
    structuralIssues: input.prerequisiteMap.structuralIssues,
    localLifecycleIssueCount: issues.filter(issue =>
      /Session Metadata|Preflight Evidence|Lifecycle Rows|Fresh local devnet|Dry-Run Settlement|Reconciliation/i.test(issue),
    ).length,
    liveSubmitIssueCount: issues.filter(issue =>
      /Submit And Confirmation|submitted transaction|confirmation|finality|live-preflight/i.test(issue),
    ).length,
    recoveryIssueCount: issues.filter(issue =>
      /Failed broadcast|phantom AVL|Reorged burn|stale singleton|recovery-observe/i.test(issue),
    ).length,
    publicationBoundaryIssueCount: issues.filter(issue =>
      /Publication Evidence|Reviewer Sign-Off|Production-ready claim|Testnet production-candidate claim|release-note|checklist/i.test(issue),
    ).length,
    captureInputs: buildCaptureInputs(),
    decisionQuestions: buildDecisionQuestions(),
    requiredOutputBindings: REQUIRED_OUTPUT_BINDINGS,
    completionChecklist: buildCompletionChecklist(),
    boundary: {
      'Planning output only': 'yes',
      'Derived from Gate 3 prerequisite map': 'yes',
      'Completed live rehearsal evidence claimed': 'no',
      'Evidence row closure claimed': 'no',
      'Gate 3 lifecycle closure claimed': 'no',
      'Release gate PASS claimed': 'no',
      'Public claim authorization granted': 'no',
      'Live execution approval granted': 'no',
      'Runtime database or deployment state opened': 'no',
      'Transaction broadcast, submit, deploy, signing, runtime database access, or state mutation performed': 'no',
    },
  };
}

export function formatRehearsalOperatorPacketMarkdown(report: RehearsalOperatorPacket): string {
  return [
    `# ${escapeMarkdownText(report.title)}`,
    '',
    'This packet turns the current Gate 3 rehearsal prerequisite map into',
    'operator capture inputs and review questions. It is not completed lifecycle',
    'or recovery evidence and does not authorize live submit, signing, settlement,',
    'deployment, public release, or broadcast claims.',
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
      ['Local lifecycle issues', String(report.localLifecycleIssueCount)],
      ['Live submit/confirmation issues', String(report.liveSubmitIssueCount)],
      ['Recovery drill issues', String(report.recoveryIssueCount)],
      ['Publication-boundary issues', String(report.publicationBoundaryIssueCount)],
    ]),
    '',
    '## Capture Inputs',
    '',
    markdownTable([
      ['Area', 'Operator must capture', 'Evidence to link'],
      ...report.captureInputs.map(input => [
        input.area,
        input.operatorMustCapture,
        input.evidenceToLink,
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

function buildCaptureInputs(): RehearsalOperatorCaptureInput[] {
  return [
    {
      area: 'Session and clean deployment',
      operatorMustCapture:
        'Session metadata, clean deployment-state digest, contract IDs, singleton inventory, node/RPC heights, and broadcast-disabled start/end state.',
      evidenceToLink:
        'Completed live rehearsal Markdown plus command-specific preflight artifacts for deployment, height, ContextExtension guard, and broadcast policy output.',
    },
    {
      area: 'Unsigned legacy diagnostic',
      operatorMustCapture:
        'Peg-in, peg-out burn, anchor, and deterministic unsigned settlement shape with no signature, node check, Expected transaction ID, authorization, submit, or broadcast.',
      evidenceToLink:
        'Unsigned prepare evidence with burn/order bindings, sidechain block hash, bridge event root, Ergo anchor height, and explicit non-authority boundaries.',
    },
    {
      area: 'Replacement-profile acceptance and future live lifecycle',
      operatorMustCapture:
        'First capture separately versioned external-fee profile activation, application-bound source finality, global DUP cutover lineage, exact chain-resident setup/admission state, and profile-specific target-node acceptance. Only then may a separately approved live lifecycle capture submission and confirmation.',
      evidenceToLink:
        'Replacement-profile activation and target-node acceptance packets, followed only when authorized by profile-specific preflight, submission, confirmation/finality, and reconciliation evidence.',
    },
    {
      area: 'Reconciliation',
      operatorMustCapture:
        'Submitted DUP successor, submitted SPV tracker successor, recipient payout box, successor values, and peg-out burn binding.',
      evidenceToLink:
        'Post-submit observe JSON plus reconciliation rows in the completed rehearsal Markdown.',
    },
    {
      area: 'Recovery drills',
      operatorMustCapture:
        'Failed-broadcast/phantom-AVL and reorged-burn/stale-singleton read-only observations without repair, mutation, submit, or broadcast.',
      evidenceToLink:
        'Recovery-observe JSON reports, validation transcripts, and assembled recovery row artifacts for both recovery kinds.',
    },
    {
      area: 'Publication and reviewer boundary',
      operatorMustCapture:
        'Release-note and checklist updates plus reviewer sign-off that keeps production-ready and testnet production-candidate claims blocked by the rehearsal itself.',
      evidenceToLink:
        'Completed Gate 3 publication update targets and reviewer sign-off dated not before Session Metadata Date.',
    },
  ];
}

function buildDecisionQuestions(): RehearsalOperatorDecisionQuestion[] {
  return [
    {
      question: 'Can the local devnet or testnet lifecycle row move to pass?',
      approvingAnswer:
        'Yes, only when all lifecycle rows, concrete evidence artifacts, linked JSON reports, and rehearsal validation transcript are complete and internally consistent.',
      blockedAnswer:
        'No, if any row remains publication blocker, uses placeholder evidence, lacks JSON binding, or omits required transaction, anchor, height, submit, confirmation, or reconciliation facts.',
    },
    {
      question: 'Can live submit or confirmation be treated as captured?',
      approvingAnswer:
        'Yes, only for the activated external-fee replacement profile after application-bound finality, global replay lineage, exact chain state, target-node acceptance, and explicit live-run approval are all established, with submitted transaction ID, confirmation/finality, and reconciliation matching the accepted transaction identity.',
      blockedAnswer:
        'No for legacy V1, and no if profile activation, finality, replay lineage, target-node acceptance, explicit approval, transaction identity, or confirmation evidence is incomplete.',
    },
    {
      question: 'Can recovery drill rows be accepted?',
      approvingAnswer:
        'Yes, only with validated read-only recovery-observe JSON and row artifacts for the required failed-broadcast and stale-singleton cases.',
      blockedAnswer:
        'No, if the observation reads a default runtime database, serializes private runtime paths, mutates state, repairs, submits, broadcasts, or omits validator PASS output.',
    },
    {
      question: 'Can the rehearsal support public claim escalation?',
      approvingAnswer:
        'No. Completed Gate 3 rehearsal evidence can support release-gate evaluation only while preserving production-ready and testnet production-candidate claim denials in this rehearsal packet.',
      blockedAnswer:
        'Blocked if the evidence approves production-ready, mainnet, unqualified release, or testnet production-candidate claims from the rehearsal itself.',
    },
  ];
}

function buildCompletionChecklist(): RehearsalOperatorChecklistItem[] {
  return [
    {
      item: 'Link a completed live rehearsal Markdown target and distinct rehearsal validation transcript.',
      validatorDependency: 'Transcript binding and lifecycle rows.',
    },
    {
      item: 'Link all required JSON reports consumed by rehearsal validation.',
      validatorDependency: 'Linked JSON evidence.',
    },
    {
      item: 'Capture replacement-profile activation and target-node acceptance before any new live lifecycle.',
      validatorDependency: 'External-fee conservation, application-bound finality, global replay lineage, exact chain state, and profile-specific acceptance evidence.',
    },
    {
      item: 'Link both recovery-observe JSON reports and assembled recovery rows when recovery rows are checked.',
      validatorDependency: 'Recovery drill lifecycle rows and recovery-observe JSON validation.',
    },
    {
      item: 'Record publication updates and reviewer sign-off with exact claim-boundary denials.',
      validatorDependency: 'Publication evidence and reviewer sign-off.',
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
