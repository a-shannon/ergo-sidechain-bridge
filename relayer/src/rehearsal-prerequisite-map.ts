import type { RehearsalEvidenceValidation } from './rehearsal-evidence.js';
import type { RehearsalValidationReport } from './rehearsal-evidence-report.js';
import { sanitizeReportText } from './report-text-sanitizer.js';

export interface RehearsalPrerequisiteMapIssue {
  issue: string;
  evidencePrerequisite: string;
}

export interface RehearsalPrerequisiteMapStep {
  step: string;
  status: string;
  requiredOutput: string;
}

export interface RehearsalPrerequisiteMap {
  title: string;
  validatorCommit: string;
  candidateTarget: string;
  validatorReportTarget: string;
  command: string;
  workingDirectory: string;
  result: 'PASS' | 'BLOCKED';
  exitCode: number;
  structuralIssues: number;
  issues: RehearsalPrerequisiteMapIssue[];
  nextEvidenceSequence: RehearsalPrerequisiteMapStep[];
  boundary: Record<string, 'yes' | 'no'>;
}

export interface RehearsalPrerequisiteMapInput {
  validatorCommit: string;
  candidateTarget: string;
  validatorReportTarget: string;
  command: string;
  validationReport: RehearsalValidationReport;
  validation?: RehearsalEvidenceValidation;
  readErrors?: string[];
  cliErrors?: string[];
}

export function buildRehearsalPrerequisiteMap(
  input: RehearsalPrerequisiteMapInput,
): RehearsalPrerequisiteMap {
  const readErrors = input.readErrors ?? [];
  const cliErrors = input.cliErrors ?? [];
  const validationErrors = input.validation?.errors ?? [];
  const errors = readErrors.length > 0 ? readErrors : [...validationErrors, ...cliErrors];

  return {
    title: `Gate 3 Rehearsal Prerequisite Map - ${sanitize(input.validatorCommit)}`,
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
      evidencePrerequisite: prerequisiteForRehearsalIssue(issue),
    })),
    nextEvidenceSequence: buildNextEvidenceSequence(input.validationReport, errors),
    boundary: {
      'Planning output only': 'yes',
      'Rehearsal validator completed': input.validation ? 'yes' : 'no',
      'Evidence row closure claimed': 'no',
      'Release gate PASS claimed': 'no',
      'Public claim authorization granted': 'no',
      'Gate 3 lifecycle closure claimed': 'no',
      'Completed local devnet lifecycle claimed': 'no',
      'Completed testnet lifecycle claimed': 'no',
      'Recovery drill closure claimed': 'no',
      'Live execution approval granted': 'no',
      'Runtime database or deployment state opened': 'no',
      'Transaction broadcast, submit, deploy, signing, runtime database access, or state mutation performed': 'no',
    },
  };
}

export function formatRehearsalPrerequisiteMapMarkdown(report: RehearsalPrerequisiteMap): string {
  const issueRows = report.issues.length > 0
    ? report.issues.map(issue => [issue.issue, issue.evidencePrerequisite])
    : [['No structural issues reported', 'No Gate 3 rehearsal evidence prerequisite remains under the validator result.']];

  return [
    `# ${escapeMarkdownText(report.title)}`,
    '',
    'This packet records the current Gate 3 rehearsal validator result for the',
    'selected live rehearsal candidate and converts the remaining blockers into',
    'operator evidence prerequisites.',
    '',
    'It is not completed Gate 3 lifecycle or recovery-drill evidence. It does not',
    'support live submit, confirmation, reconciliation, production-ready, mainnet,',
    'testnet production-candidate, deployment, signing, settlement, or broadcast claims.',
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
  validationReport: RehearsalValidationReport,
  errors: string[],
): RehearsalPrerequisiteMapStep[] {
  const metadataOrPreflightBlocked = errors.some(issue =>
    /^Session Metadata:|^Preflight Evidence:|^Evidence Hygiene:/i.test(issue),
  );
  const lifecycleBlocked = errors.some(issue =>
    /^Lifecycle Rows:|Fresh local devnet lifecycle|Fresh testnet lifecycle|Peg-in evidence|Peg-out burn evidence|Anchor evidence/i.test(issue),
  );
  const dryRunBlocked = errors.some(issue =>
    /^Dry-Run Settlement Evidence:|Settlement check evidence|Expected transaction ID|\/transactions\/check/i.test(issue),
  );
  const linkedJsonBlocked = errors.some(issue =>
    /^--(?:assembly-report|fresh-checkpoint|live-preflight|post-submit-observe|recovery-observe)-json\b|^Linked JSON Evidence:|JSON|source binding/i.test(issue),
  );
  const submitBlocked = errors.some(issue =>
    /^Submit And Confirmation Evidence:|Settlement submit evidence|submitted transaction ID|confirmation|finality/i.test(issue),
  );
  const reconciliationBlocked = errors.some(issue =>
    /^Reconciliation Evidence:|submitted DUP successor|SPV tracker successor|recipient payout|reconciliation/i.test(issue),
  );
  const recoveryBlocked = errors.some(issue =>
    /Failed broadcast|phantom AVL|Reorged burn|stale singleton|recovery-observe/i.test(issue),
  );
  const publicationOrReviewBlocked = errors.some(issue =>
    /^Publication Evidence:|^Reviewer Sign-Off:|Release notes updated|checklist update|Production-ready claim|Testnet production-candidate claim/i.test(issue),
  );

  return [
    {
      step: 'Reconfirm current rehearsal candidate',
      status: 'complete',
      requiredOutput: `Validator report above: ${validationReport.result} with ${validationReport.structuralIssues} structural issue(s).`,
    },
    {
      step: 'Complete session metadata, preflight, and clean deployment evidence',
      status: metadataOrPreflightBlocked ? 'operator evidence required' : 'complete',
      requiredOutput: metadataOrPreflightBlocked
        ? 'Completed Session Metadata, clean deployment-state evidence, deployment digest, contract IDs, singleton inventory, node/RPC heights, ContextExtension guard, sigma-rust/JVM coverage, and broadcast-disabled boundaries.'
        : 'Session metadata, preflight, and clean deployment evidence are linked and validator-accepted.',
    },
    {
      step: 'Capture unsigned legacy diagnostics and replacement-profile prerequisites',
      status: lifecycleBlocked || dryRunBlocked ? 'operator evidence required' : 'complete',
      requiredOutput: lifecycleBlocked || dryRunBlocked
        ? 'Peg-in, peg-out burn, anchor, and unsigned settlement-shape evidence plus external-fee profile activation, application-bound finality, global DUP cutover lineage, and target-node acceptance prerequisites. Legacy V1 check and approval evidence is historical only.'
        : 'Unsigned diagnostics and replacement-profile prerequisites are linked without claiming live lifecycle closure.',
    },
    {
      step: 'Bind required rehearsal JSON reports',
      status: linkedJsonBlocked ? 'operator evidence required' : 'complete',
      requiredOutput: linkedJsonBlocked
        ? 'Concrete distinct JSON targets for assembly, external-fee live-preflight, post-submit observation, fresh-checkpoint, and recovery-observe evidence where applicable.'
        : 'Linked rehearsal JSON reports are concrete and validator-accepted.',
    },
    {
      step: 'Submit, confirm, and reconcile only on the activated replacement profile',
      status: submitBlocked || reconciliationBlocked ? 'blocked until replacement-profile activation, target-node acceptance, explicit live-run approval, and completed runtime evidence exist' : 'complete',
      requiredOutput: submitBlocked || reconciliationBlocked
        ? 'Activated external-fee profile identity, application-bound source finality, global replay lineage, exact target-node accepted transaction identity, submitted transaction ID, confirmation/finality evidence, successor boxes, recipient payout, and burn-bound reconciliation.'
        : 'Replacement-profile submit, confirmation, and reconciliation evidence are linked and validator-accepted.',
    },
    {
      step: 'Capture recovery drill observations',
      status: recoveryBlocked ? 'blocked until read-only node/state observation targets exist' : 'complete',
      requiredOutput: recoveryBlocked
        ? 'Completed failed-broadcast/phantom-AVL and reorged-burn/stale-singleton recovery-observe JSON reports, validation transcripts, and assembled recovery rows with no repair, mutation, submit, or broadcast authorization.'
        : 'Recovery drill evidence is linked and validator-accepted.',
    },
    {
      step: 'Complete publication updates and reviewer sign-off',
      status: publicationOrReviewBlocked ? 'blocked until evidence closure is available' : 'complete',
      requiredOutput: publicationOrReviewBlocked
        ? 'Release-note and checklist update evidence, exact `Production-ready claim allowed by this rehearsal: no`, exact `Testnet production-candidate claim allowed by this rehearsal: no`, and reviewer sign-off with dates not before Session Metadata Date.'
        : 'Publication updates and reviewer sign-off are linked and validator-accepted.',
    },
  ];
}

export function prerequisiteForRehearsalIssue(issue: string): string {
  if (/^Session Metadata:/i.test(issue)) {
    return 'Complete the Session Metadata section with Date, Operator, Reviewer, Environment, Git commit, release level, non-mainnet network names, and broadcast-disabled start/end fields.';
  }
  if (/^Preflight Evidence:/i.test(issue)) {
    return 'Link command-specific preflight evidence for clean deployment state, deployment-state hash or digest, contract IDs, singleton inventory, node/RPC heights, ContextExtension guard, sigma-rust/JVM conformance, and broadcast policy output.';
  }
  if (/^Dry-Run Settlement Evidence:|Expected transaction ID|\/transactions\/check/i.test(issue)) {
    return 'Treat legacy V1 check and approval requirements as historical only. Capture unsigned prepare diagnostics now, and keep live settlement blocked until a separately versioned external-fee profile has application-bound finality, global DUP cutover lineage, exact chain-resident state, and profile-specific target-node acceptance.';
  }
  if (/^Submit And Confirmation Evidence:|submitted transaction ID|confirmation|finality/i.test(issue)) {
    return 'Legacy V1 cannot produce new submit evidence. For the activated external-fee replacement profile only, require target-node acceptance and explicit live-run approval before linking submitted transaction identity, confirmation counts, finality, and reconciliation.';
  }
  if (/Settlement submit evidence/i.test(issue)) {
    return 'Legacy V1 submit is retired. Link concrete submit evidence only for an activated replacement profile after target-node acceptance, explicit live-run approval, exact transaction identity binding, and preserved broadcast scope.';
  }
  if (/^Reconciliation Evidence:|submitted DUP successor|SPV tracker successor|recipient payout|reconciliation/i.test(issue)) {
    return 'Link post-submit reconciliation evidence for submitted DUP successor, SPV tracker successor, recipient payout box, successor values, and peg-out burn TX ID.';
  }
  if (/Failed broadcast|phantom AVL|recovery-observe/i.test(issue)) {
    return 'Capture failed-broadcast/phantom-AVL read-only recovery-observe JSON, validate it with `npm run rehearsal:recovery-observe:validate`, and assemble the recovery row without repair, state mutation, submit, or broadcast authorization.';
  }
  if (/Reorged burn|stale singleton/i.test(issue)) {
    return 'Capture reorged-burn/stale-singleton read-only recovery-observe JSON, validate it with `npm run rehearsal:recovery-observe:validate`, and assemble the recovery row with singleton inventory and burn bindings.';
  }
  if (/^Lifecycle Rows:|Fresh local devnet lifecycle|Fresh testnet lifecycle|Peg-in evidence|Peg-out burn evidence|Anchor evidence|Settlement check evidence/i.test(issue)) {
    return 'Populate each lifecycle row with a concrete completed evidence artifact, row-specific blocking note, and required next evidence for local devnet, testnet, peg-in, peg-out, anchor, settlement-check, submit, confirmation, reconciliation, recovery, and backup-restore rows.';
  }
  if (/^Publication Evidence:|Release notes updated|checklist update|Production-ready claim|Testnet production-candidate claim/i.test(issue)) {
    return 'Add completed Gate 3 release-note and checklist update evidence while keeping exact `Production-ready claim allowed by this rehearsal: no` and `Testnet production-candidate claim allowed by this rehearsal: no` bindings.';
  }
  if (/^Rollback And Cleanup:/i.test(issue)) {
    return 'Link rollback and cleanup evidence proving broadcast remains disabled in all shells, runtime state files are preserved but not staged, logs are archived, and any incident/regression follow-up is explicitly classified.';
  }
  if (/Backup-restore or reconstructibility evidence/i.test(issue)) {
    return 'Link completed backup-restore or reconstructibility evidence, or keep the row as a publication blocker with the next required recovery evidence clearly stated.';
  }
  if (/^Reviewer Sign-Off:/i.test(issue)) {
    return 'Reviewer sign-off must match Session Metadata reviewer, use a date not before the Session Metadata Date, and keep publication blockers, follow-up tests, and runbook changes explicit until evidence closure exists.';
  }
  if (/^--(?:assembly-report|fresh-checkpoint|live-preflight|post-submit-observe|recovery-observe)-json\b|JSON|target must match|source binding|artifactTargets\./i.test(issue)) {
    return 'Provide the concrete linked JSON report requested by the validator, ensure it is distinct from the completed Markdown target, and keep its source bindings aligned with the rehearsal evidence rows.';
  }
  if (/Evidence Hygiene|placeholder|unresolved|runtime database|deployment-state|diagnostic dump/i.test(issue)) {
    return 'Replace placeholders and unsafe evidence markers with concrete completed artifacts; do not link environment files, private deployment records, runtime databases, local paths, diagnostic dumps, or secret-bearing targets.';
  }
  if (/target|read|Markdown evidence files/i.test(issue)) {
    return 'Use a concrete public Markdown rehearsal evidence target inside the bridge repository and keep environment files, runtime databases, local paths, and secret-bearing targets out of evidence input.';
  }
  return 'Manual Gate 3 rehearsal evidence triage is required before any lifecycle, recovery, release, testnet production-candidate, deployment, submit, or broadcast claim can be supported.';
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
