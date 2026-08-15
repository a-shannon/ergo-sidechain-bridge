import type { CommitteeGovernanceEvidenceValidation } from './committee-governance-evidence.js';
import type { CommitteeGovernanceValidationReport } from './committee-governance-evidence-report.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export interface CommitteeGovernancePrerequisiteMapIssue {
  issue: string;
  evidencePrerequisite: string;
}

export interface CommitteeGovernancePrerequisiteMapNextStep {
  step: string;
  status: string;
  requiredOutput: string;
}

export interface CommitteeGovernancePrerequisiteMap {
  title: string;
  validatorCommit: string;
  candidateTarget: string;
  validatorReportTarget: string;
  command: string;
  workingDirectory: string;
  result: 'PASS' | 'BLOCKED';
  exitCode: number;
  structuralIssues: number;
  issues: CommitteeGovernancePrerequisiteMapIssue[];
  nextEvidenceSequence: CommitteeGovernancePrerequisiteMapNextStep[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface CommitteeGovernancePrerequisiteMapInput {
  validatorCommit: string;
  candidateTarget: string;
  validatorReportTarget: string;
  command: string;
  validationReport: CommitteeGovernanceValidationReport;
  validation?: CommitteeGovernanceEvidenceValidation;
  readErrors?: string[];
}

export function buildCommitteeGovernancePrerequisiteMap(
  input: CommitteeGovernancePrerequisiteMapInput,
): CommitteeGovernancePrerequisiteMap {
  const readErrors = input.readErrors ?? [];
  const validationErrors = input.validation?.errors ?? [];
  const errors = readErrors.length > 0 ? readErrors : validationErrors;
  const reconciliationBlocked = errors.some(issue => /Reconcile deployment state/i.test(issue));
  const wrongNetworkBlocked = errors.some(issue => /Deployment state points to the wrong network/i.test(issue));

  return {
    title: `Phase 010a Committee Governance Prerequisite Map - ${input.validatorCommit}`,
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
      evidencePrerequisite: prerequisiteForCommitteeGovernanceIssue(issue),
    })),
    nextEvidenceSequence: buildNextEvidenceSequence(input.validationReport, errors),
    boundary: {
      'Planning output only': 'yes',
      'Committee governance validator completed': input.validation ? 'yes' : 'no',
      'Evidence row closure claimed': 'no',
      'Release gate PASS claimed': 'no',
      'Public claim authorization granted': 'no',
      'Gate 6 committee governance closure claimed': 'no',
      'Local reconciliation prerequisites linked': !reconciliationBlocked && !wrongNetworkBlocked ? 'yes' : 'no',
      'Key rotation authorization granted': 'no',
      'Runtime database or deployment state opened': 'no',
      'Transaction broadcast, submit, deploy, rotate keys, reconcile, or state mutation performed': 'no',
    },
  };
}

export function formatCommitteeGovernancePrerequisiteMapMarkdown(
  report: CommitteeGovernancePrerequisiteMap,
): string {
  const issueRows = report.issues.length > 0
    ? report.issues.map(issue => [
        issue.issue,
        issue.evidencePrerequisite,
      ])
    : [['No structural issues reported', 'No Gate 6 evidence prerequisite remains under the validator result.']];

  return [
    `# ${escapeMarkdownText(report.title)}`,
    '',
    'This packet records the current Gate 6 committee governance validator result',
    'for the selected Phase 010a candidate and converts the remaining blockers',
    'into the next operator evidence prerequisites.',
    '',
    'It is not completed Gate 6 committee governance evidence. It does not support',
    'governance-ready, testnet production-candidate, production-ready, mainnet,',
    'deployment, key-rotation, signing, settlement, or broadcast claims.',
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
  validationReport: CommitteeGovernanceValidationReport,
  errors: string[],
): CommitteeGovernancePrerequisiteMapNextStep[] {
  const reconciliationBlocked = errors.some(issue => /Reconcile deployment state/i.test(issue));
  const wrongNetworkBlocked = errors.some(issue => /Deployment state points to the wrong network/i.test(issue));
  const externalReviewBlocked = errors.some(issue => /External review evidence/i.test(issue));
  const publicationBlocked = errors.some(issue =>
    /Release supported|Governance-ready claim allowed|Open governance blockers|Reviewer decision summary/i.test(issue),
  );
  const reviewerBlocked = errors.some(issue => /Reviewer Sign-Off/i.test(issue));

  return [
    {
      step: 'Reconfirm current committee governance candidate',
      status: 'complete',
      requiredOutput: `Validator report above: ${validationReport.result} with ${validationReport.structuralIssues} structural issue(s).`,
    },
    {
      step: 'Prepare sanitized deployment-state reconciliation evidence',
      status: reconciliationBlocked ? 'blocked until an approved non-private reconciliation target exists' : 'complete',
      requiredOutput: reconciliationBlocked
        ? 'Evidence binding network, singleton identity, previous authority, target committee authority, rollback state, and sanitized `npm run governance:reconcile:validate` output with `exit code 0`, without reading or publishing private deployment records.'
        : 'Linked sanitized reconciliation report records network, singleton identity, previous authority, target committee authority, rollback state, and sanitized `npm run governance:reconcile:validate` output with `exit code 0`, without reading or publishing private deployment records.',
    },
    {
      step: 'Capture wrong-network negative evidence',
      status: wrongNetworkBlocked ? 'blocked until reconciliation evidence is available' : 'complete',
      requiredOutput: wrongNetworkBlocked
        ? 'Completed negative evidence proving a mismatched deployment-state network blocks governance rotation and citing sanitized `npm run governance:reconcile:validate` output with `exit code 0`.'
        : 'Linked wrong-network negative report proves a mismatched deployment-state network blocks governance rotation and cites sanitized `npm run governance:reconcile:validate` output with `exit code 0`.',
    },
    {
      step: 'Complete external governance/key-rotation review',
      status: externalReviewBlocked ? 'reviewer/external dependency' : 'complete',
      requiredOutput: externalReviewBlocked
        ? 'Concrete external review evidence target with exact claim-boundary bindings.'
        : 'External review evidence is linked in the validator result.',
    },
    {
      step: 'Move publication fields to closure values',
      status: publicationBlocked ? 'blocked until external review and reviewer approvals exist' : 'complete',
      requiredOutput: publicationBlocked
        ? 'Publication rules and reviewer summary with exact `Release supported = production deployment candidate`, `Governance-ready claim allowed = yes`, and `Open governance blockers = 0` only after blocker closure.'
        : 'Publication-rule closure fields are linked and validator-accepted.',
    },
    {
      step: 'Approve Gate 6 reviewer sign-offs',
      status: reviewerBlocked ? 'blocked until blocker closure is evidenced' : 'complete',
      requiredOutput: reviewerBlocked
        ? 'Governance owner, security reviewer, and operator reviewer approvals with dates not before classification.'
        : 'Governance owner, security reviewer, and operator reviewer approvals are linked and validator-accepted.',
    },
  ];
}

export function prerequisiteForCommitteeGovernanceIssue(issue: string): string {
  if (/Reconcile deployment state/i.test(issue)) {
    return 'Sanitized non-mainnet deployment-state reconciliation evidence that binds network, singleton identity, old authority, new committee authority, rollback state, and `npm run governance:reconcile:validate` command output with `exit code 0` without exposing private deployment records.';
  }
  if (/Deployment state points to the wrong network/i.test(issue)) {
    return 'Wrong-network negative evidence proving governance rotation is blocked when the deployment-state network binding does not match the intended non-mainnet network, with linked `npm run governance:reconcile:validate` command output and `exit code 0`.';
  }
  if (/Release supported must not be none/i.test(issue)) {
    return 'Release-support field can only move from `none` after deployment-state reconciliation, wrong-network rejection, external review, and reviewer approvals are complete.';
  }
  if (/Governance-ready claim allowed must be yes/i.test(issue)) {
    return 'Governance-ready claim can only be allowed after all Gate 6 governance blockers are closed with completed evidence.';
  }
  if (/Open governance blockers must be 0/i.test(issue)) {
    return 'Publication rules must preserve `Open governance blockers = 0` only after the validator has no Gate 6 governance blockers.';
  }
  if (/Reviewer decision summary.*Governance-ready claim allowed = yes/i.test(issue)) {
    return 'Reviewer decision summary must include the exact `Governance-ready claim allowed = yes` binding only after closure evidence exists.';
  }
  if (/Reviewer decision summary.*Open governance blockers = 0|Reviewer decision summary: open governance blockers must be 0/i.test(issue)) {
    return 'Reviewer decision summary must report blocker closure with exact `Open governance blockers = 0`, not prose-only or shorthand closure language.';
  }
  if (/External review evidence/i.test(issue)) {
    return 'Completed external governance/key-rotation review evidence with a concrete evidence target distinct from release-note and checklist update evidence.';
  }
  if (/Reviewer Sign-Off: Governance owner/i.test(issue)) {
    return 'Governance owner approval after reconciliation, wrong-network rejection, external review, and publication-rule closure are evidenced.';
  }
  if (/Reviewer Sign-Off: Security reviewer/i.test(issue)) {
    return 'Security approval after signer behavior, singleton continuity, deployment-state reconciliation, wrong-network rejection, and no-broadcast boundaries are evidenced.';
  }
  if (/Reviewer Sign-Off: Operator reviewer/i.test(issue)) {
    return 'Operator approval after the non-mainnet key-rotation drill evidence, rollback evidence, and deployment-state reconciliation are complete.';
  }
  if (/target|read|Markdown evidence files/i.test(issue)) {
    return 'Use a concrete public Markdown evidence target inside the bridge repository and keep environment files, runtime databases, local paths, and secret-bearing targets out of evidence input.';
  }
  return 'Manual Gate 6 evidence triage is required for this validator issue before any governance-ready, release, key-rotation, deployment, or broadcast claim can be supported.';
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
