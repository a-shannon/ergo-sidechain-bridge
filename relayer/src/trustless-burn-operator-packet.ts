import type { TrustlessBurnPrerequisiteMap } from './trustless-burn-prerequisite-map.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export interface TrustlessBurnOperatorPacket {
  title: string;
  validatorCommit: string;
  candidateTarget: string;
  prerequisiteMapTarget: string;
  command: string;
  result: 'PASS' | 'BLOCKED';
  structuralIssues: number;
  anchoringIssueCount: number;
  trackerOrFinalityIssueCount: number;
  proofAcceptanceIssueCount: number;
  reviewerApprovalIssueCount: number;
  publicationBoundaryIssueCount: number;
  captureInputs: TrustlessBurnOperatorCaptureInput[];
  decisionQuestions: TrustlessBurnOperatorDecisionQuestion[];
  requiredOutputBindings: string[];
  completionChecklist: TrustlessBurnOperatorChecklistItem[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface TrustlessBurnOperatorCaptureInput {
  area: string;
  operatorMustCapture: string;
  evidenceToLink: string;
}

export interface TrustlessBurnOperatorDecisionQuestion {
  question: string;
  approvingAnswer: string;
  blockedAnswer: string;
}

export interface TrustlessBurnOperatorChecklistItem {
  item: string;
  validatorDependency: string;
}

export interface TrustlessBurnOperatorPacketInput {
  prerequisiteMap: TrustlessBurnPrerequisiteMap;
  prerequisiteMapTarget: string;
  command: string;
}

const REQUIRED_OUTPUT_BINDINGS = [
  'Trustless burn verification implemented = yes',
  'Transitional trusted burn path disabled = yes',
  'Critical/high findings open = 0',
  'Production-ready claim allowed = no',
  'Testnet production-candidate claim allowed = yes',
  'Release supported = production deployment candidate',
];

export function buildTrustlessBurnOperatorPacket(
  input: TrustlessBurnOperatorPacketInput,
): TrustlessBurnOperatorPacket {
  const issues = input.prerequisiteMap.issues.map(issue => issue.issue);
  return {
    title: `Gate 5 Trustless Burn Operator Packet - ${sanitize(input.prerequisiteMap.validatorCommit)}`,
    validatorCommit: sanitize(input.prerequisiteMap.validatorCommit),
    candidateTarget: sanitize(input.prerequisiteMap.candidateTarget),
    prerequisiteMapTarget: sanitize(input.prerequisiteMapTarget),
    command: sanitize(input.command),
    result: input.prerequisiteMap.result,
    structuralIssues: input.prerequisiteMap.structuralIssues,
    anchoringIssueCount: issues.filter(issue => /Ergo extension-section anchoring|anchor/i.test(issue)).length,
    trackerOrFinalityIssueCount: issues.filter(issue =>
      /Sidechain header\/finality verifier|SPV relay contract or tracker|SPV tracker|tracker/i.test(issue),
    ).length,
    proofAcceptanceIssueCount: issues.filter(issue =>
      /Burn inclusion proof|Burn proof binding|Positive Proof Acceptance|Local Proof Vector|DUP settlement binding/i.test(issue),
    ).length,
    reviewerApprovalIssueCount: issues.filter(issue => /Reviewer Sign-Off|Independent review/i.test(issue)).length,
    publicationBoundaryIssueCount: issues.filter(issue =>
      /Publication Decision|Reviewer decision summary|Trustless burn verification implemented|transitional trusted burn path|critical\/high/i.test(issue),
    ).length,
    captureInputs: buildCaptureInputs(input.prerequisiteMap),
    decisionQuestions: buildDecisionQuestions(),
    requiredOutputBindings: REQUIRED_OUTPUT_BINDINGS,
    completionChecklist: buildCompletionChecklist(),
    boundary: {
      'Planning output only': 'yes',
      'Derived from Gate 5 prerequisite map': 'yes',
      'Completed trustless burn evidence claimed': 'no',
      'Evidence row closure claimed': 'no',
      'Gate 5 trustless-burn closure claimed': 'no',
      'Settlement readiness claimed': 'no',
      'Release gate PASS claimed': 'no',
      'Public claim authorization granted': 'no',
      'Runtime database or deployment state opened': 'no',
      'Transaction broadcast, submit, deploy, reconcile, sign, or state mutation performed': 'no',
    },
  };
}

export function formatTrustlessBurnOperatorPacketMarkdown(report: TrustlessBurnOperatorPacket): string {
  return [
    `# ${escapeMarkdownText(report.title)}`,
    '',
    'This packet turns the current Gate 5 trustless-burn prerequisite map into',
    'operator capture inputs and review questions. It is not completed protocol',
    'evidence and does not authorize settlement, reconciliation, signing,',
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
      ['Anchoring issues', String(report.anchoringIssueCount)],
      ['Tracker/finality issues', String(report.trackerOrFinalityIssueCount)],
      ['Proof acceptance issues', String(report.proofAcceptanceIssueCount)],
      ['Reviewer approval issues', String(report.reviewerApprovalIssueCount)],
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

function buildCaptureInputs(prerequisiteMap: TrustlessBurnPrerequisiteMap): TrustlessBurnOperatorCaptureInput[] {
  const currentTargets = prerequisiteMap.currentEvidenceTargets;
  const proofVectorReportTarget = currentTargets.proofVectorReportTarget
    ?? 'a candidate-linked proof-vector validation report target accepted by the trustless-burn validator';
  return [
    {
      area: 'Proof-path identity',
      operatorMustCapture:
        'Sidechain commitment, bridgeEventRoot, burnId, burn amount, recipient ErgoTree hash, sidechain transaction and block hashes, event index, duplicate-prevention key, and non-empty inclusion path.',
      evidenceToLink:
        'Completed proof-path packet, proof-vector validation JSON report, and burn-proof rows that all bind the same identifiers.',
    },
    {
      area: 'Current proof-vector candidate baseline',
      operatorMustCapture:
        `Current Gate 5 candidate ${currentTargets.candidateTarget}, trustless-burn validator report ${currentTargets.validatorReportTarget}, and proof-vector validation report ${proofVectorReportTarget}.`,
      evidenceToLink:
        'Use these current targets as source-boundary proof-core and candidate-binding inputs only; they do not close Gate 5, prove anchoring or finality, authorize /transactions/check, settlement readiness, signing, submit, or broadcast.',
    },
    {
      area: 'Compact unsigned candidate',
      operatorMustCapture:
        'Completed trustless:unsigned-tx JSON evidence and trustless:unsigned-tx:validate report for the deterministic single-leaf candidate, including contextExtensionGuard = pass, transactionCheck = no, expectedTxId = no, signing = no, and submit = no.',
      evidenceToLink:
        'Terminal legacy V1 source-boundary evidence only; it remains no-check, no-sign, no-submit, and no-broadcast and cannot be promoted into a signed or node-backed packet.',
    },
    {
      area: 'Replacement-profile target-node acceptance',
      operatorMustCapture:
        'A separately versioned, reviewed, activated external-fee settlement profile with application-bound source finality, global DUP cutover lineage, exact chain-resident setup and admission UTXOs, and explicit non-mainnet signing/check approval.',
      evidenceToLink:
        'A replacement-profile target-node acceptance packet that binds the activated profile, application identity, finality proof, conservation equation, replay lineage, exact unsigned and signed transaction identities, stateful /transactions/check PASS, and no submit, reconciliation, deployment, or broadcast approval. The retired legacy V1 CLI cannot produce this evidence.',
    },
    {
      area: 'Extension anchoring',
      operatorMustCapture:
        'Sanitized public extension-observation JSON and a completed trustless:anchor-observe JSON report for the selected non-mainnet height window.',
      evidenceToLink:
        'Anchor observation report with LINKED status, 0x04xx key, bridgeEventRoot, anchor height, public source provenance, and no-claim boundary.',
    },
    {
      area: 'SPV tracker and finality',
      operatorMustCapture:
        'Sanitized public tracker history, expected sidechain entry, tracker digest, proof digest, and finality binding for the same bridgeEventRoot and anchor height.',
      evidenceToLink:
        'SPV tracker observation report plus observation reconciliation report matching anchor, tracker, proof-vector, and settlement-binding evidence.',
    },
    {
      area: 'Proof acceptance and DUP settlement',
      operatorMustCapture:
        'Positive proof acceptance and settlement assembly evidence proving the accepted burn ID is the DUP key and recipient/amount bindings survive payout assembly.',
      evidenceToLink:
        'Accepted burn proof evidence, DUP insert binding, payout recipient and amount binding, and negative rejection evidence for malformed or stale cases.',
    },
    {
      area: 'Independent review',
      operatorMustCapture:
        'Protocol, security, and operator review outcomes after finality, anchoring, proof format, DUP binding, fallback disablement, and no-broadcast boundaries are concrete.',
      evidenceToLink:
        'Independent review evidence plus reviewer sign-off rows with dates not before Evidence Classification Date.',
    },
    {
      area: 'Publication boundary',
      operatorMustCapture:
        'Release-note and checklist updates that keep production-ready/mainnet claims blocked while allowing only bounded testnet production-candidate support after Gate 5 closure.',
      evidenceToLink:
        'Publication decision rows and reviewer decision summary with exact release-support, implementation, fallback-disablement, and critical/high closure bindings.',
    },
  ];
}

function buildDecisionQuestions(): TrustlessBurnOperatorDecisionQuestion[] {
  return [
    {
      question: 'Can the next packet be a signed node-backed transaction check?',
      approvingAnswer:
        'Yes, only for a separately versioned and activated replacement profile after external-fee conservation, application-bound source finality, global DUP cutover lineage, exact chain-resident setup and admission UTXOs, and explicit scoped non-mainnet local-signing plus /transactions/check approval are all established, with no submit, deploy, reconcile, or broadcast.',
      blockedAnswer:
        'No for legacy V1, and no whenever only source-boundary code, unsigned candidates, or proof-vector evidence exists, the replacement profile is not activated, any conservation/finality/replay requirement is open, or explicit local-signing/check approval is absent.',
    },
    {
      question: 'Can the trustless proof path be treated as implemented?',
      approvingAnswer:
        'Yes, only when anchoring, sidechain finality, SPV tracker, burn inclusion, proof acceptance, and DUP settlement binding evidence are all linked and validator-accepted.',
      blockedAnswer:
        'No, if the packet only has local proof-vector, candidate settlement, source-boundary, or read-only observation evidence.',
    },
    {
      question: 'Can the transitional trusted burn path be disabled for the release scope?',
      approvingAnswer:
        'Yes, only after trustless proof settlement is implemented and reviewed, with exact Transitional trusted burn path disabled = yes in publication fields.',
      blockedAnswer:
        'No, if trusted fallback, oracle fallback, manual signer fallback, or ambiguous transition wording remains.',
    },
    {
      question: 'Can critical/high findings be set to zero?',
      approvingAnswer:
        'Yes, only with independent protocol/security review evidence proving no critical or high trustless-burn findings remain open.',
      blockedAnswer:
        'No, if findings are pending, prose-only, unreviewed, zero-like, or not tied to the Gate 5 proof path.',
    },
    {
      question: 'Can Gate 5 support testnet production-candidate wording?',
      approvingAnswer:
        'Yes, only after completed Gate 5 evidence passes validation with Production-ready claim allowed = no and Testnet production-candidate claim allowed = yes.',
      blockedAnswer:
        'No, if evidence approves production-ready, mainnet, settlement-readiness, or unqualified production wording.',
    },
  ];
}

function buildCompletionChecklist(): TrustlessBurnOperatorChecklistItem[] {
  return [
    {
      item: 'Link compact unsigned candidate validation as terminal legacy V1 diagnostic evidence.',
      validatorDependency: 'trustless:unsigned-tx:validate PASS with contextExtensionGuard = pass and no-check/no-sign/no-submit boundaries; this evidence cannot authorize or precede a legacy V1 signed node check.',
    },
    {
      item: 'Link replacement-profile target-node acceptance before treating node-backed check output as Gate 5 settlement-binding evidence.',
      validatorDependency: 'Separately versioned activated external-fee profile evidence with application-bound source finality, global DUP cutover lineage, exact chain-resident setup/admission UTXOs, stateful /transactions/check PASS, exact transaction identity, and no submit/reconcile/deploy/broadcast boundary escalation.',
    },
    {
      item: 'Link completed anchoring and SPV tracker observation reports for one shared bridgeEventRoot and anchor height.',
      validatorDependency: 'Required Components: Ergo extension-section anchoring and SPV relay contract or tracker.',
    },
    {
      item: 'Link proof acceptance and DUP settlement binding evidence.',
      validatorDependency: 'Required Components: Burn inclusion proof and DUP settlement binding; Positive Proof Acceptance.',
    },
    {
      item: 'Set trustless implementation, fallback-disablement, and critical/high fields to exact closure values only after evidence and review closure.',
      validatorDependency: 'Publication Decision fields and reviewer decision summary.',
    },
    {
      item: 'Record protocol, security, and operator approvals with concrete trustless-burn outcome notes.',
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
