import type { TrustlessBurnEvidenceValidation } from './trustless-burn-evidence.js';
import type { TrustlessBurnValidationReport } from './trustless-burn-evidence-report.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export interface TrustlessBurnPrerequisiteMapIssue {
  issue: string;
  evidencePrerequisite: string;
}

export interface TrustlessBurnPrerequisiteMapStep {
  step: string;
  status: string;
  requiredOutput: string;
}

export interface TrustlessBurnObservationInputRequest {
  field: string;
  requiredBinding: string;
}

export interface TrustlessBurnCurrentEvidenceTargets {
  candidateTarget: string;
  validatorReportTarget: string;
  proofVectorReportTarget?: string;
}

export interface TrustlessBurnPrerequisiteMap {
  title: string;
  validatorCommit: string;
  candidateTarget: string;
  validatorReportTarget: string;
  currentEvidenceTargets: TrustlessBurnCurrentEvidenceTargets;
  command: string;
  workingDirectory: string;
  result: 'PASS' | 'BLOCKED';
  exitCode: number;
  structuralIssues: number;
  issues: TrustlessBurnPrerequisiteMapIssue[];
  anchorObservationInputRequest: TrustlessBurnObservationInputRequest[];
  spvTrackerObservationInputRequest: TrustlessBurnObservationInputRequest[];
  nextEvidenceSequence: TrustlessBurnPrerequisiteMapStep[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface TrustlessBurnPrerequisiteMapInput {
  validatorCommit: string;
  candidateTarget: string;
  validatorReportTarget: string;
  command: string;
  validationReport: TrustlessBurnValidationReport;
  validation?: TrustlessBurnEvidenceValidation;
  readErrors?: string[];
  cliErrors?: string[];
}

export function buildTrustlessBurnPrerequisiteMap(
  input: TrustlessBurnPrerequisiteMapInput,
): TrustlessBurnPrerequisiteMap {
  const readErrors = input.readErrors ?? [];
  const cliErrors = input.cliErrors ?? [];
  const validationErrors = input.validation?.errors ?? [];
  const errors = readErrors.length > 0 ? readErrors : [...validationErrors, ...cliErrors];
  const anchorBlocked = errors.some(issue => /Ergo extension-section anchoring|extension|anchor/i.test(issue));
  const spvBlocked = errors.some(issue => /SPV relay contract or tracker|SPV tracker|tracker/i.test(issue));
  const proofBlocked = errors.some(issue =>
    /Burn inclusion proof|Burn proof binding|Positive Proof Acceptance|Local Proof Vector|DUP settlement binding/i.test(issue),
  );
  const publicationBlocked = errors.some(issue =>
    /Publication Decision|Reviewer decision summary|Trustless burn verification implemented|transitional trusted burn path|critical\/high/i.test(issue),
  );
  const reviewerBlocked = errors.some(issue => /Reviewer Sign-Off/i.test(issue));

  return {
    title: `Gate 5 Trustless Burn Prerequisite Map - ${sanitize(input.validatorCommit)}`,
    validatorCommit: sanitize(input.validatorCommit),
    candidateTarget: sanitize(input.candidateTarget),
    validatorReportTarget: sanitize(input.validatorReportTarget),
    currentEvidenceTargets: buildCurrentEvidenceTargets(input),
    command: sanitize(input.command),
    workingDirectory: sanitize(input.validationReport.workingDirectory),
    result: input.validationReport.result,
    exitCode: input.validationReport.exitCode,
    structuralIssues: errors.length,
    issues: errors.map(issue => ({
      issue: sanitize(issue),
      evidencePrerequisite: prerequisiteForTrustlessBurnIssue(issue),
    })),
    anchorObservationInputRequest: buildAnchorObservationInputRequest(),
    spvTrackerObservationInputRequest: buildSpvTrackerObservationInputRequest(),
    nextEvidenceSequence: buildNextEvidenceSequence(input.validationReport, errors),
    boundary: {
      'Planning output only': 'yes',
      'Trustless burn validator completed': input.validation ? 'yes' : 'no',
      'Anchor observation request prepared': anchorBlocked ? 'yes' : 'no',
      'SPV tracker observation request prepared': spvBlocked ? 'yes' : 'no',
      'Proof acceptance prerequisites linked': proofBlocked ? 'no' : 'yes',
      'Publication closure prerequisites linked': publicationBlocked ? 'no' : 'yes',
      'Reviewer approval prerequisites linked': reviewerBlocked ? 'no' : 'yes',
      'Evidence row closure claimed': 'no',
      'Release gate PASS claimed': 'no',
      'Public claim authorization granted': 'no',
      'Gate 5 trustless-burn closure claimed': 'no',
      'Settlement readiness claimed': 'no',
      'Runtime database or deployment state opened': 'no',
      'Secret or environment file read': 'no',
      'Transaction broadcast, submit, deploy, reconcile, sign, or state mutation performed': 'no',
    },
  };
}

export function formatTrustlessBurnPrerequisiteMapMarkdown(
  report: TrustlessBurnPrerequisiteMap,
): string {
  const issueRows = report.issues.length > 0
    ? report.issues.map(issue => [issue.issue, issue.evidencePrerequisite])
    : [['No structural issues reported', 'No Gate 5 trustless-burn evidence prerequisite remains under the validator result.']];

  return [
    `# ${escapeMarkdownText(report.title)}`,
    '',
    'This packet records the current Gate 5 trustless-burn validator result for',
    'the selected blocker map and converts the remaining blockers into operator',
    'evidence prerequisites.',
    '',
    'It is not completed Gate 5 trustless-burn evidence. It does not support',
    'trustless-burn-complete, settlement-readiness, testnet production-candidate,',
    'production-ready, mainnet, deployment, signing, reconciliation, or broadcast',
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
    '## Current Evidence Targets',
    '',
    markdownTable([
      ['Target', 'Value'],
      ['Gate 5 candidate', report.currentEvidenceTargets.candidateTarget],
      ['Trustless-burn validator report', report.currentEvidenceTargets.validatorReportTarget],
      ['Proof-vector validation report', report.currentEvidenceTargets.proofVectorReportTarget ?? 'not linked by candidate validation'],
    ]),
    '',
    '## Exact Remaining Validator Issues',
    '',
    markdownTable([
      ['Issue', 'Evidence prerequisite'],
      ...issueRows,
    ]),
    '',
    '## Anchor Observation Input Request',
    '',
    'The sanitized public extension-observation JSON for `trustless:anchor-observe`',
    'must contain only public read-only extension data:',
    '',
    markdownTable([
      ['Field', 'Required binding'],
      ...report.anchorObservationInputRequest.map(row => [row.field, row.requiredBinding]),
    ]),
    '',
    'The anchor observation report must remain `LINKED`, read-only,',
    'public-observation-input only, and no-claiming. A linked anchor observation',
    'report is prerequisite evidence only; it does not complete sidechain finality,',
    'SPV tracker history, burn inclusion, proof acceptance, DUP settlement binding,',
    'Gate 5 closure, release-gate PASS, or publication claims.',
    '',
    '## SPV Tracker Observation Input Request',
    '',
    'The sanitized public observation JSON for `trustless:spv-tracker-observe` must',
    'contain:',
    '',
    markdownTable([
      ['Field', 'Required binding'],
      ...report.spvTrackerObservationInputRequest.map(row => [row.field, row.requiredBinding]),
    ]),
    '',
    'The observation report must remain `LINKED`, read-only, public-observation-input',
    'only, and no-claiming. A linked SPV tracker observation report is prerequisite',
    'evidence only; it does not complete burn inclusion, proof acceptance, DUP',
    'settlement binding, Gate 5 closure, release-gate PASS, or publication claims.',
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

function buildCurrentEvidenceTargets(
  input: TrustlessBurnPrerequisiteMapInput,
): TrustlessBurnCurrentEvidenceTargets {
  const targets: TrustlessBurnCurrentEvidenceTargets = {
    candidateTarget: sanitize(input.candidateTarget),
    validatorReportTarget: sanitize(input.validatorReportTarget),
  };
  const proofVectorReportTarget = input.validation?.localProofVectorReportTarget;
  if (proofVectorReportTarget) {
    targets.proofVectorReportTarget = sanitize(proofVectorReportTarget);
  }
  return targets;
}

function buildNextEvidenceSequence(
  validationReport: TrustlessBurnValidationReport,
  errors: string[],
): TrustlessBurnPrerequisiteMapStep[] {
  const anchorBlocked = errors.some(issue => /Ergo extension-section anchoring|extension|anchor/i.test(issue));
  const spvBlocked = errors.some(issue => /SPV relay contract or tracker|SPV tracker|tracker/i.test(issue));
  const proofBlocked = errors.some(issue =>
    /Burn inclusion proof|Burn proof binding|Positive Proof Acceptance|Local Proof Vector|DUP settlement binding/i.test(issue),
  );
  const finalityBlocked = errors.some(issue => /Sidechain header\/finality verifier|finality/i.test(issue));
  const reviewBlocked = errors.some(issue => /Independent review|Reviewer Sign-Off/i.test(issue));
  const publicationBlocked = errors.some(issue =>
    /Publication Decision|Reviewer decision summary|Trustless burn verification implemented|transitional trusted burn path|critical\/high/i.test(issue),
  );

  return [
    {
      step: 'Reconfirm current Gate 5 blocker map',
      status: 'complete',
      requiredOutput: `Validator report above: ${validationReport.result} with ${validationReport.structuralIssues} structural issue(s).`,
    },
    {
      step: 'Capture non-mainnet extension anchoring evidence',
      status: anchorBlocked ? 'blocked until approved node-backed/non-mainnet run exists' : 'complete',
      requiredOutput: anchorBlocked
        ? 'Sanitized public extension-observation JSON plus completed `npm run trustless:anchor-observe` JSON report for the selected bridge event root and non-mainnet height window.'
        : 'Extension anchoring evidence is linked and validator-accepted.',
    },
    {
      step: 'Capture sidechain finality and SPV tracker evidence',
      status: finalityBlocked || spvBlocked ? 'blocked until approved non-mainnet finality/tracker target exists' : 'complete',
      requiredOutput: finalityBlocked || spvBlocked
        ? 'Evidence binding sidechain headers, finality, commitment history, and tracker updates, including a linked `trustless:spv-tracker-observe` report for the SPV tracker path.'
        : 'Sidechain finality and SPV tracker evidence are linked and validator-accepted.',
    },
    {
      step: 'Capture proof acceptance and DUP settlement binding evidence',
      status: proofBlocked ? 'blocked until proof path and settlement drill are available' : 'complete',
      requiredOutput: proofBlocked
        ? 'Positive burn proof acceptance plus DUP insertion, payout recipient, and amount binding evidence.'
        : 'Proof acceptance and DUP settlement binding evidence are linked and validator-accepted.',
    },
    {
      step: 'Complete independent Gate 5 review',
      status: reviewBlocked ? 'reviewer/external dependency' : 'complete',
      requiredOutput: reviewBlocked
        ? 'Independent review evidence with critical/high findings closure and exact publication-boundary fields.'
        : 'Independent review and reviewer sign-off evidence are linked and validator-accepted.',
    },
    {
      step: 'Move publication fields to closure values',
      status: publicationBlocked ? 'blocked until implementation, component, proof-acceptance, settlement, and review evidence exist' : 'complete',
      requiredOutput: publicationBlocked
        ? 'Exact `Trustless burn verification implemented = yes`, `Transitional trusted burn path disabled = yes`, and `Critical/high findings open = 0` bindings only after blocker closure.'
        : 'Publication closure fields are linked and validator-accepted.',
    },
    {
      step: 'Approve Gate 5 reviewer sign-offs',
      status: reviewBlocked ? 'blocked until blocker closure is evidenced' : 'complete',
      requiredOutput: reviewBlocked
        ? 'Protocol, security, and operator approvals with concrete trustless-burn outcome notes.'
        : 'Protocol, security, and operator approvals are linked and validator-accepted.',
    },
  ];
}

export function prerequisiteForTrustlessBurnIssue(issue: string): string {
  if (/Trustless burn verification implemented/i.test(issue)) {
    return 'Completed trustless-burn implementation evidence after the proof path is wired through an Ergo-verifiable finality, anchoring, proof-acceptance, and DUP settlement path.';
  }
  if (/transitional trusted burn path/i.test(issue)) {
    return 'Evidence that the transitional trusted burn path is disabled or blocked for the release scope after trustless proof settlement is implemented and reviewed.';
  }
  if (/critical\/high findings/i.test(issue)) {
    return 'Independent security/protocol review evidence proving no critical or high trustless-burn findings remain open.';
  }
  if (/Reviewer decision summary/i.test(issue)) {
    return 'Reviewer decision summary covering release support, trustless burn implementation, production-ready handling, testnet production-candidate handling, transitional trusted burn path handling, and critical/high findings with exact bindings.';
  }
  if (/Ergo extension-section anchoring/i.test(issue)) {
    return 'Sanitized public extension-observation JSON plus completed `npm run trustless:anchor-observe` JSON report binding the Gate 5 bridgeEventRoot to the non-mainnet `0x04xx` anchor window.';
  }
  if (/Sidechain header\/finality verifier/i.test(issue)) {
    return 'Ergo-verifiable sidechain header or finality evidence proving the burn commitment cannot rely on local receipt-depth text alone.';
  }
  if (/SPV relay contract or tracker/i.test(issue)) {
    return 'Sanitized public SPV tracker observation JSON plus completed `npm run trustless:spv-tracker-observe` JSON report binding commitment history, finality, tracker key, value, and digest without private runtime state.';
  }
  if (/Burn inclusion proof/i.test(issue)) {
    return 'On-chain or equivalent non-mainnet proof-acceptance evidence that included burns are accepted and malformed or stale proofs are rejected.';
  }
  if (/DUP settlement binding/i.test(issue)) {
    return 'Evidence that the proved burn ID is the exact DUP key inserted by settlement and that payout recipient/amount bindings survive settlement assembly.';
  }
  if (/Positive Proof Acceptance/i.test(issue)) {
    return 'Positive proof-acceptance evidence for a valid burn proof against the anchored commitment and selected DUP settlement binding.';
  }
  if (/Local Proof Vector/i.test(issue)) {
    return 'Completed multi-leaf proof-vector JSON, proof-vector validation JSON report, and required fail-closed negative cases bound to the trustless-burn evidence rows.';
  }
  if (/Required Components: Independent review/i.test(issue)) {
    return 'Independent protocol/security/operator review evidence for finality, anchoring, proof format, DUP binding, fallback disablement, and claim boundaries.';
  }
  if (/Reviewer Sign-Off: Protocol reviewer/i.test(issue)) {
    return 'Protocol reviewer approval after component evidence, proof acceptance, and publication-boundary fields are complete.';
  }
  if (/Reviewer Sign-Off: Security reviewer/i.test(issue)) {
    return 'Security reviewer approval after independent review, fallback disablement, critical/high closure, and no-broadcast boundaries are complete.';
  }
  if (/Reviewer Sign-Off: Operator reviewer/i.test(issue)) {
    return 'Operator reviewer approval after non-mainnet drill evidence, fallback behavior, recovery boundaries, and no-broadcast rules are complete.';
  }
  if (/target|read|Markdown evidence files/i.test(issue)) {
    return 'Use a concrete public Markdown trustless-burn evidence target inside the bridge repository and keep environment files, runtime databases, local paths, and secret-bearing targets out of evidence input.';
  }
  return 'Manual Gate 5 trustless-burn evidence triage is required before any proof-complete, settlement-readiness, production-candidate, release, deployment, submit, or broadcast claim can be supported.';
}

function buildAnchorObservationInputRequest(): TrustlessBurnObservationInputRequest[] {
  return [
    {
      field: '`bridgeEventRoot` input',
      requiredBinding: 'The 32-byte bridge event root from the Gate 5 proof-path packet, passed as `<64hex>` or `0401:<64hex>`.',
    },
    {
      field: '`observations.heights[].height`',
      requiredBinding: 'Non-negative Ergo anchor heights in the non-mainnet scan window.',
    },
    {
      field: '`observations.heights[].fields[].key`',
      requiredBinding: 'The `0401` extension key, or another explicit `0x04xx` Gate 5 key when the evidence explains the key choice.',
    },
    {
      field: '`observations.heights[].fields[].value`',
      requiredBinding: 'A 32-byte public bridge event root value observed at that height.',
    },
    {
      field: '`observations.heights[].fields[].headerId`',
      requiredBinding: 'Optional public 32-byte header ID for provenance when available.',
    },
    {
      field: '`minHeight` / `maxHeight`',
      requiredBinding: 'The exact non-mainnet scan window used by `trustless:anchor-observe`.',
    },
    {
      field: '`observedAt`',
      requiredBinding: 'ISO UTC observation time recorded by the completed JSON report.',
    },
  ];
}

function buildSpvTrackerObservationInputRequest(): TrustlessBurnObservationInputRequest[] {
  return [
    {
      field: '`trackerDigestHex`',
      requiredBinding: '33-byte public SPV tracker AVL digest for the observed tracker history.',
    },
    {
      field: '`expectedEntry.sidechainIdHex`',
      requiredBinding: '32-byte sidechain ID matching the Gate 5 Commitment Format row.',
    },
    {
      field: '`expectedEntry.sidechainHeight`',
      requiredBinding: 'Non-negative sidechain height matching the Gate 5 Commitment Format row.',
    },
    {
      field: '`expectedEntry.sidechainHeaderHashHex`',
      requiredBinding: '32-byte sidechain header hash matching the Gate 5 Commitment Format row.',
    },
    {
      field: '`expectedEntry.bridgeEventRootHex`',
      requiredBinding: '32-byte bridge event root matching the Gate 5 Commitment Format row.',
    },
    {
      field: '`expectedEntry.ergoAnchorHeight`',
      requiredBinding: 'Non-negative Ergo anchor height matching the Gate 5 Commitment Format row.',
    },
    {
      field: '`sidechainFinality.sidechainBlockHeight`',
      requiredBinding: 'The same sidechain height as `expectedEntry.sidechainHeight`; finality evidence for any other block cannot support this commitment.',
    },
    {
      field: '`sidechainFinality.observedSidechainHeight` / `requiredConfirmations`',
      requiredBinding: 'Public non-mainnet sidechain height observation proving the commitment block meets the required finality depth.',
    },
    {
      field: '`sidechainFinality.finalityRule`',
      requiredBinding: 'The explicit finality-depth rule used by `trustless:spv-tracker-observe`; local receipt-depth text alone is not enough.',
    },
    {
      field: '`history`',
      requiredBinding: 'Public tracker history entries with 32-byte keys and 36-byte values sufficient for `trustless:spv-tracker-observe` to rebuild the digest and get-proof.',
    },
    {
      field: '`trackerBox`',
      requiredBinding: 'Optional sanitized tracker box ID and NFT ID; no private deployment-state file dump is allowed.',
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
