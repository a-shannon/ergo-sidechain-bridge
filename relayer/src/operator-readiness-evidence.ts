import { basename } from 'path';

import { isIsoCalendarDate, validateIsoDateField } from './evidence-date.js';
import { validateGitCommitField } from './evidence-git.js';
import {
  hasStructuredValidationFailureMarker,
  hasUnresolvedIssueMarker,
  normalizeEvidenceMarkerText,
  validateEvidenceHygiene,
} from './evidence-hygiene.js';
import {
  validateDuplicateRequiredFields,
  validateRequiredNames,
} from './evidence-required-names.js';
import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import {
  classifyPublicationClaimText,
  validateReviewerDecisionSummaryClaimBoundary,
} from './publication-claim-boundary.js';

export type OperatorEvidenceStatus = 'pending' | 'linked' | 'blocker';
export type ReviewerDecision = 'approve' | 'block';

export interface RunbookCoverageRow {
  runbook: string;
  requiredCheck: string;
  evidence: string;
  status: string;
}

export interface OperatorCommandRow {
  command: string;
  purpose: string;
  evidence: string;
  status: string;
}

export interface IncidentDrillRow {
  drill: string;
  expectedOutcome: string;
  evidence: string;
  status: string;
}

export interface OperationalDecisionRow {
  decision: string;
  requiredEvidence: string;
  stopCondition: string;
  status: string;
}

export interface ReviewerSignoffRow {
  role: string;
  name: string;
  decision: string;
  date: string;
  notes: string;
}

export interface OperatorReadinessClassificationFields {
  readinessName: string;
  gitCommit: string;
  releaseLevel: string;
  environment: string;
  broadcastMode: string;
  operatorType: string;
  reviewer: string;
  date: string;
}

export interface OperatorReadinessValidation {
  status: 'PASS' | 'BLOCKED';
  classification: Partial<OperatorReadinessClassificationFields>;
  publicationDecision: {
    releaseSupported?: string;
    productionReadyClaimAllowed?: string;
    testnetProductionCandidateClaimAllowed?: string;
    operatorReadyClaimAllowed?: string;
    criticalIncidentsOpen?: string;
    releaseNotesUpdated?: string;
    requiredReleaseNoteUpdates?: string;
    requiredChecklistUpdates?: string;
    reviewerDecisionSummary?: string;
  };
  runbookRows: RunbookCoverageRow[];
  commandRows: OperatorCommandRow[];
  drillRows: IncidentDrillRow[];
  decisionRows: OperationalDecisionRow[];
  reviewerRows: ReviewerSignoffRow[];
  errors: string[];
  message: string;
}

interface ParsedRows<T> {
  rows: T[];
  errors: string[];
}

const REQUIRED_SECTIONS = [
  '## Readiness Classification',
  '## Runbook Coverage',
  '## Required Commands',
  '## Incident And Recovery Drills',
  '## Operational Decisions',
  '## Publication Decision',
  '## Reviewer Sign-Off',
];

const REQUIRED_CLASSIFICATION_FIELDS = [
  'Readiness name',
  'Git commit',
  'Release level',
  'Environment',
  'Broadcast mode',
  'Operator type',
  'Reviewer',
  'Date',
];

export const REQUIRED_OPERATOR_READINESS_RUNBOOKS = [
  'Dry-run readiness',
  'Deployment and migration',
  'Broadcast enablement',
  'Daemon startup',
  'Settlement failure triage',
  'Reorg recovery',
  'Pause and resume',
  'Key rotation',
  'Storage-rent and liquidity maintenance',
  'Incident response',
  'Monitoring and alerting',
  'SQLite and AVL backup restore',
];

const REQUIRED_RUNBOOK_EVIDENCE_MARKERS: Record<string, { pattern: RegExp; message: string }[]> = {
  'Dry-run readiness': [
    {
      pattern: /dry[- ]run|readiness/i,
      message: 'evidence must identify dry-run readiness coverage',
    },
  ],
  'Deployment and migration': [
    {
      pattern: /deployment|deploy|migration/i,
      message: 'evidence must identify deployment or migration coverage',
    },
  ],
  'Broadcast enablement': [
    {
      pattern: /broadcast/i,
      message: 'evidence must identify broadcast enablement coverage',
    },
  ],
  'Daemon startup': [
    {
      pattern: /daemon|startup/i,
      message: 'evidence must identify daemon startup coverage',
    },
  ],
  'Settlement failure triage': [
    {
      pattern: /settlement|failure|triage/i,
      message: 'evidence must identify settlement failure triage coverage',
    },
  ],
  'Reorg recovery': [
    {
      pattern: /reorg|recovery/i,
      message: 'evidence must identify reorg recovery coverage',
    },
  ],
  'Pause and resume': [
    {
      pattern: /pause|resume/i,
      message: 'evidence must identify pause and resume coverage',
    },
  ],
  'Key rotation': [
    {
      pattern: /key|rotation|member/i,
      message: 'evidence must identify key rotation coverage',
    },
  ],
  'Storage-rent and liquidity maintenance': [
    {
      pattern: /storage[- ]rent|liquidity|maintenance/i,
      message: 'evidence must identify storage-rent or liquidity maintenance coverage',
    },
  ],
  'Incident response': [
    {
      pattern: /incident|response/i,
      message: 'evidence must identify incident response coverage',
    },
  ],
  'Monitoring and alerting': [
    {
      pattern: /monitoring|monitor|alerting|alert/i,
      message: 'evidence must identify monitoring or alerting coverage',
    },
  ],
  'SQLite and AVL backup restore': [
    {
      pattern: /(sqlite|avl).*?(backup|restore)|(backup|restore).*?(sqlite|avl)/i,
      message: 'evidence must identify SQLite/AVL backup restore coverage',
    },
  ],
};

export const REQUIRED_OPERATOR_READINESS_COMMANDS = [
  'npm run status',
  'npm run demo:readiness',
  'npm run release:gate',
  'npm run backup:validate',
  'npm run governance:validate',
  'npm run check',
  'npm run wasm:test',
  'git status --short',
];

const REQUIRED_COMMAND_EVIDENCE_MARKERS: Record<string, { pattern: RegExp; message: string }[]> = Object.fromEntries(
  REQUIRED_OPERATOR_READINESS_COMMANDS.map(command => [
    command,
    [
      {
        pattern: commandEvidencePattern(command),
        message: `evidence must identify ${command} output`,
      },
    ],
  ]),
);

const REQUIRED_COMMAND_PURPOSE_MARKERS: Record<string, { pattern: RegExp; message: string }> = {
  'npm run status': {
    pattern: /\b(status|state|health|snapshot|operator)\b/i,
    message: 'status, state, health, snapshot, or operator boundary',
  },
  'npm run demo:readiness': {
    pattern: /\b(readiness|dry[- ]run|signing|broadcast[- ]policy|policy)\b/i,
    message: 'readiness, dry-run, signing, or broadcast-policy boundary',
  },
  'npm run release:gate': {
    pattern: /\b(release[- ]gate|gate|blocked|structural|publication[- ]blocker)\b/i,
    message: 'release-gate, blocked, structural, or publication-blocker boundary',
  },
  'npm run backup:validate': {
    pattern: /\b(backup|restore|sqlite|avl|recovery|reconstruct)\b/i,
    message: 'backup, restore, SQLite, AVL, recovery, or reconstructibility boundary',
  },
  'npm run governance:validate': {
    pattern: /\b(governance|committee|key[- ]rotation|rotation|threshold|multisig)\b/i,
    message: 'governance, committee, key rotation, threshold, or multisig boundary',
  },
  'npm run check': {
    pattern: /\b(check|build|typecheck|test|verification|clean[- ]checkout)\b/i,
    message: 'check, build, typecheck, test, verification, or clean-checkout boundary',
  },
  'npm run wasm:test': {
    pattern: /\b(wasm|rust|cargo|avl|proof|test)\b/i,
    message: 'WASM, Rust, cargo, AVL, proof, or test boundary',
  },
  'git status --short': {
    pattern: /\b(git|status|hygiene|worktree|staged|tracked|runtime)\b/i,
    message: 'Git status, hygiene, worktree, staged/tracked, or runtime boundary',
  },
};

const UNSAFE_COMMAND_PURPOSE_PATTERN =
  /\b(mainnet|main network|mainchain|production[- ]ready|production ready|release approval|publication approval|broadcast approval|broadcast approved|broadcast authorization|broadcast enabled|BRIDGE_BROADCAST_ENABLED\s*=\s*true)\b/i;

export function hasOperatorReadinessCommandPurpose(command: string, purpose: string): boolean {
  const purposeExpectation = REQUIRED_COMMAND_PURPOSE_MARKERS[command];
  const normalizedPurpose = purpose.trim();
  return Boolean(
    purposeExpectation &&
    normalizedPurpose.length > 0 &&
    !UNSAFE_COMMAND_PURPOSE_PATTERN.test(normalizedPurpose) &&
    purposeExpectation.pattern.test(normalizedPurpose),
  );
}

export function operatorReadinessCommandPurposeExpectation(command: string): string {
  return REQUIRED_COMMAND_PURPOSE_MARKERS[command]?.message ?? 'command-specific operator boundary';
}

export const REQUIRED_OPERATOR_READINESS_DRILLS = [
  'Broadcast disabled by default',
  'Daemon refuses unsafe live settlement',
  'Failed settlement triage',
  'Reorg recovery',
  'Pause and resume',
  'SQLite and AVL backup restore',
  'Storage-rent and liquidity alert',
  'Incident response record',
  'Key rotation and member loss',
];

export const REQUIRED_OPERATOR_READINESS_OPERATIONAL_DECISIONS = [
  'External operator can find every runbook',
  'Stop conditions are executable',
  'Monitoring signals are actionable',
  'Incident escalation is actionable',
  'Backup restore evidence is linked',
  'Governance rotation evidence is linked',
  'Broadcast enablement remains opt-in',
];

const REQUIRED_OPERATIONAL_DECISION_EVIDENCE_MARKERS: Record<string, { pattern: RegExp; message: string }[]> = {
  'External operator can find every runbook': [
    {
      pattern: /external[- ]operator|runbooks?|operator[- ]runbooks?/i,
      message: 'evidence must identify external operator runbook discovery',
    },
  ],
  'Stop conditions are executable': [
    {
      pattern: /stop[- ]conditions?|executable|operator[- ]stop/i,
      message: 'evidence must identify executable stop conditions',
    },
  ],
  'Monitoring signals are actionable': [
    {
      pattern: /monitoring|signals?|alerts?|actionable/i,
      message: 'evidence must identify actionable monitoring signals',
    },
  ],
  'Incident escalation is actionable': [
    {
      pattern: /incident|escalation|escalate/i,
      message: 'evidence must identify incident escalation',
    },
  ],
  'Backup restore evidence is linked': [
    {
      pattern: /backup|restore|sqlite|avl/i,
      message: 'evidence must identify backup restore evidence',
    },
  ],
  'Governance rotation evidence is linked': [
    {
      pattern: /governance|rotation|key[- ]rotation|committee/i,
      message: 'evidence must identify governance rotation evidence',
    },
  ],
  'Broadcast enablement remains opt-in': [
    {
      pattern: /broadcast|opt[- ]in|BRIDGE_BROADCAST_ENABLED/i,
      message: 'evidence must identify broadcast opt-in evidence',
    },
  ],
};

const REQUIRED_PUBLICATION_FIELDS = [
  'Release supported',
  'Production-ready claim allowed',
  'Testnet production-candidate claim allowed',
  'Operator-ready claim allowed',
  'Critical incidents open',
  'Release notes updated',
  'Required release-note updates',
  'Required checklist updates',
  'Reviewer decision summary',
];

export const REQUIRED_OPERATOR_READINESS_REVIEWER_ROLES = [
  'Runbook operator',
  'Security reviewer',
  'Release owner',
];

const ALLOWED_STATUSES = new Set<OperatorEvidenceStatus>(['pending', 'linked', 'blocker']);
const ALLOWED_RELEASE_LEVELS = new Set([
  'validated PoC',
  'institutional reference',
  'production deployment candidate',
]);
const ALLOWED_ENVIRONMENTS = new Set([
  'local offline',
  'clean checkout',
  'patched devnet',
  'testnet',
  'staging',
]);
const ALLOWED_BROADCAST_MODES = new Set(['disabled', 'dry-run', 'enabled']);
const ALLOWED_OPERATOR_TYPES = new Set([
  'maintainer',
  'external operator',
  'exchange operations reviewer',
]);
const ALLOWED_RELEASE_SUPPORT = new Set([
  'none',
  'validated PoC',
  'institutional reference',
  'production deployment candidate',
]);
const RELEASE_LEVEL_RANK = new Map([
  ['validated PoC', 1],
  ['institutional reference', 2],
  ['production deployment candidate', 3],
]);
const ALLOWED_YES_NO = new Set(['yes', 'no']);
const ALLOWED_REVIEWER_DECISIONS = new Set<ReviewerDecision>(['approve', 'block']);

function parseMarkdownTableRows(table: string): string[][] {
  return table
    .split(/\r?\n/)
    .filter(line => line.startsWith('|'))
    .filter(line => !/^\|\s*-/.test(line))
    .slice(1)
    .map(line =>
      line
        .slice(1, -1)
        .split('|')
        .map(cell => cell.trim()),
    );
}

export function parseRunbookCoverageRows(markdown: string): RunbookCoverageRow[] {
  return parseTableBetween(markdown, '## Runbook Coverage', '## Required Commands').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Runbook Coverage row: ${row.join(' | ')}`);
    return {
      runbook: row[0],
      requiredCheck: row[1],
      evidence: row[2],
      status: row[3],
    };
  });
}

export function validateOperatorReadinessEvidence(markdown: string): OperatorReadinessValidation {
  const runbooks = parseRowsSafely(() => parseRunbookCoverageRows(markdown));
  const commands = parseRowsSafely(() => parseCommandRows(markdown));
  const drills = parseRowsSafely(() => parseDrillRows(markdown));
  const decisions = parseRowsSafely(() => parseDecisionRows(markdown));
  const reviewers = parseRowsSafely(() => parseReviewerRows(markdown));
  const runbookRows = runbooks.rows;
  const commandRows = commands.rows;
  const drillRows = drills.rows;
  const decisionRows = decisions.rows;
  const reviewerRows = reviewers.rows;
  const publication = parsePublicationDecision(markdown);
  const classification = parseTwoColumnTable(
    sectionBetween(markdown, '## Readiness Classification', '## Runbook Coverage'),
  );
  const validationClassification = {
    readinessName: classification.get('Readiness name'),
    gitCommit: classification.get('Git commit'),
    releaseLevel: classification.get('Release level'),
    environment: classification.get('Environment'),
    broadcastMode: classification.get('Broadcast mode'),
    operatorType: classification.get('Operator type'),
    reviewer: classification.get('Reviewer'),
    date: classification.get('Date'),
  };
  const validationPublicationDecision = {
    releaseSupported: publication.get('Release supported'),
    productionReadyClaimAllowed: publication.get('Production-ready claim allowed'),
    testnetProductionCandidateClaimAllowed: publication.get('Testnet production-candidate claim allowed'),
    operatorReadyClaimAllowed: publication.get('Operator-ready claim allowed'),
    criticalIncidentsOpen: publication.get('Critical incidents open'),
    releaseNotesUpdated: publication.get('Release notes updated'),
    requiredReleaseNoteUpdates: publication.get('Required release-note updates'),
    requiredChecklistUpdates: publication.get('Required checklist updates'),
    reviewerDecisionSummary: publication.get('Reviewer decision summary'),
  };
  const releaseLevel = classification.get('Release level') ?? '';
  const environment = classification.get('Environment') ?? '';
  const errors = [
    ...validateEvidenceHygiene(markdown, 'Operator Readiness Evidence'),
    ...validateRequiredSections(markdown),
    ...validateClassification(markdown),
    ...validatePublicationDecisionFields(markdown),
    ...runbooks.errors,
    ...commands.errors,
    ...drills.errors,
    ...decisions.errors,
    ...reviewers.errors,
    ...validateRunbookRows(runbookRows),
    ...validateCommandRows(commandRows),
    ...validateDrillRows(drillRows),
    ...validateDecisionRows(decisionRows),
    ...validatePublicationDecision(
      publication,
      {
        runbookRows,
        commandRows,
        drillRows,
        decisionRows,
      },
      releaseLevel,
      environment,
    ),
    ...validateReviewerRows(reviewerRows),
    ...validateReviewerIdentityConsistency(markdown, reviewerRows),
    ...validateReviewerDateConsistency(markdown, reviewerRows),
  ];

  if (errors.length > 0) {
    return {
      status: 'BLOCKED',
      classification: validationClassification,
      publicationDecision: validationPublicationDecision,
      runbookRows,
      commandRows,
      drillRows,
      decisionRows,
      reviewerRows,
      errors,
      message: `Operator readiness evidence BLOCKED: ${errors.length} structural issue(s).`,
    };
  }

  return {
    status: 'PASS',
    classification: validationClassification,
    publicationDecision: validationPublicationDecision,
    runbookRows,
    commandRows,
    drillRows,
    decisionRows,
    reviewerRows,
    errors: [],
    message: `Operator readiness evidence PASS: ${runbookRows.length} runbooks are linked.`,
  };
}

function parseRowsSafely<T>(parseRows: () => T[]): ParsedRows<T> {
  try {
    return { rows: parseRows(), errors: [] };
  } catch (error) {
    return {
      rows: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function parseCommandRows(markdown: string): OperatorCommandRow[] {
  return parseTableBetween(markdown, '## Required Commands', '## Incident And Recovery Drills').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Required Commands row: ${row.join(' | ')}`);
    return {
      command: row[0],
      purpose: row[1],
      evidence: row[2],
      status: row[3],
    };
  });
}

function parseDrillRows(markdown: string): IncidentDrillRow[] {
  return parseTableBetween(markdown, '## Incident And Recovery Drills', '## Operational Decisions').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Incident And Recovery Drills row: ${row.join(' | ')}`);
    return {
      drill: row[0],
      expectedOutcome: row[1],
      evidence: row[2],
      status: row[3],
    };
  });
}

function parseDecisionRows(markdown: string): OperationalDecisionRow[] {
  return parseTableBetween(markdown, '## Operational Decisions', '## Publication Decision').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Operational Decisions row: ${row.join(' | ')}`);
    return {
      decision: row[0],
      requiredEvidence: row[1],
      stopCondition: row[2],
      status: row[3],
    };
  });
}

function parseReviewerRows(markdown: string): ReviewerSignoffRow[] {
  return parseTableBetween(markdown, '## Reviewer Sign-Off').map(row => {
    if (row.length !== 5) throw new Error(`Malformed Reviewer Sign-Off row: ${row.join(' | ')}`);
    return {
      role: row[0],
      name: row[1],
      decision: row[2],
      date: row[3],
      notes: row[4],
    };
  });
}

function validateRequiredSections(markdown: string): string[] {
  const errors: string[] = [];
  let lastIndex = -1;

  for (const section of REQUIRED_SECTIONS) {
    const index = markdown.indexOf(section);
    if (index < 0) {
      errors.push(`${section}: missing required section`);
      continue;
    }
    if (index <= lastIndex) errors.push(`${section}: section appears out of order`);
    lastIndex = index;
  }

  return errors;
}

function validateClassification(markdown: string): string[] {
  const section = sectionBetween(markdown, '## Readiness Classification', '## Runbook Coverage');
  const fields = parseTwoColumnTable(section);
  const errors = validateDuplicateRequiredFields(
    'Readiness Classification',
    parseTwoColumnFieldNames(section),
    REQUIRED_CLASSIFICATION_FIELDS,
  );

  for (const field of REQUIRED_CLASSIFICATION_FIELDS) {
    if (isBlank(fields.get(field) ?? '')) errors.push(`Readiness Classification: ${field} is required`);
  }

  validateAllowedField(errors, fields, 'Readiness Classification', 'Release level', ALLOWED_RELEASE_LEVELS);
  validateAllowedField(errors, fields, 'Readiness Classification', 'Environment', ALLOWED_ENVIRONMENTS);
  validateAllowedField(errors, fields, 'Readiness Classification', 'Broadcast mode', ALLOWED_BROADCAST_MODES);
  validateAllowedField(errors, fields, 'Readiness Classification', 'Operator type', ALLOWED_OPERATOR_TYPES);
  validateGitCommitField(errors, fields, 'Readiness Classification', 'Git commit');
  validateIsoDateField(errors, fields, 'Readiness Classification', 'Date');
  if (fields.get('Broadcast mode') === 'enabled') {
    errors.push(
      'Readiness Classification: Broadcast mode must be disabled or dry-run before Gate 6 operator readiness evidence can pass',
    );
  }
  if (fields.get('Release level') === 'production deployment candidate' && fields.get('Environment') !== 'testnet') {
    errors.push('Readiness Classification: production deployment candidate requires Environment testnet');
  }

  return errors;
}

function validateRunbookRows(rows: RunbookCoverageRow[]): string[] {
  const errors = validateRequiredNames('Runbook Coverage', rows.map(row => row.runbook), REQUIRED_OPERATOR_READINESS_RUNBOOKS);

  for (const row of rows) {
    if (!REQUIRED_OPERATOR_READINESS_RUNBOOKS.includes(row.runbook)) {
      errors.push(`Runbook Coverage: ${row.runbook}: unexpected runbook`);
    }
    validateLinkedStatus(errors, 'Runbook Coverage', row.runbook, row.status);
    if (isBlank(row.requiredCheck)) errors.push(`Runbook Coverage: ${row.runbook}: required check is required`);
    if (isBlank(row.evidence)) errors.push(`Runbook Coverage: ${row.runbook}: evidence is required`);
    if (row.status === 'linked' && !hasEvidenceMarker(row.evidence)) {
      errors.push(`Runbook Coverage: ${row.runbook}: linked status requires an evidence marker`);
    }
    if (row.status === 'linked' && !hasCompletedOperatorReadinessEvidenceTarget(row.evidence)) {
      errors.push(
        `Runbook Coverage: ${row.runbook}: linked status requires completed runbook evidence, a non-template evidence link, or an artifact marker`,
      );
    }
    if (row.status === 'linked' && !hasNoContradictoryOperatorReadinessOperationalEvidenceMarker(row.evidence)) {
      errors.push(`Runbook Coverage: ${row.runbook}: evidence must not include contradictory operator-readiness failure markers`);
    }
    if (row.status === 'linked' && leavesCriticalIncidentsOpen(row.evidence)) {
      errors.push(`Runbook Coverage: ${row.runbook}: evidence must not leave critical incidents open`);
    }
    if (row.status === 'linked') {
      for (const marker of REQUIRED_RUNBOOK_EVIDENCE_MARKERS[row.runbook] ?? []) {
        if (!marker.pattern.test(row.evidence)) {
          errors.push(`Runbook Coverage: ${row.runbook}: ${marker.message}`);
        }
      }
    }
    if (row.status === 'linked' && !hasRunbookCheckEvidence(row.evidence)) {
      errors.push(`Runbook Coverage: ${row.runbook}: evidence must state stop-condition and verification-command checks`);
    }
    if (row.status === 'linked' && !isRunbookRequiredCheck(row.requiredCheck)) {
      errors.push(
        `Runbook Coverage: ${row.runbook}: linked status requires stop-condition and verification-command checks`,
      );
    }
  }

  return errors;
}

function validateCommandRows(rows: OperatorCommandRow[]): string[] {
  const errors = validateRequiredNames('Required Commands', rows.map(row => row.command), REQUIRED_OPERATOR_READINESS_COMMANDS);

  for (const row of rows) {
    if (!REQUIRED_OPERATOR_READINESS_COMMANDS.includes(row.command)) {
      errors.push(`Required Commands: ${row.command}: unexpected command`);
    }
    validateLinkedStatus(errors, 'Required Commands', row.command, row.status);
    if (isBlank(row.purpose)) {
      errors.push(`Required Commands: ${row.command}: purpose is required`);
    } else if (!hasOperatorReadinessCommandPurpose(row.command, row.purpose)) {
      errors.push(
        `Required Commands: ${row.command}: purpose must identify ${operatorReadinessCommandPurposeExpectation(row.command)} and must not approve mainnet, production-ready, release, publication, or broadcast enablement`,
      );
    }
    if (isBlank(row.evidence)) errors.push(`Required Commands: ${row.command}: evidence is required`);
    if (row.status === 'linked' && !hasEvidenceMarker(row.evidence)) {
      errors.push(`Required Commands: ${row.command}: linked status requires an evidence marker`);
    }
    if (row.status === 'linked' && !hasCompletedOperatorReadinessEvidenceTarget(row.evidence)) {
      errors.push(
        `Required Commands: ${row.command}: linked status requires a completed command artifact or non-template evidence link`,
      );
    }
    if (row.status === 'linked') {
      for (const marker of REQUIRED_COMMAND_EVIDENCE_MARKERS[row.command] ?? []) {
        if (!marker.pattern.test(row.evidence)) {
          errors.push(`Required Commands: ${row.command}: ${marker.message}`);
        }
      }
      if (!hasCommandOutputMarker(row.evidence)) {
        errors.push(`Required Commands: ${row.command}: evidence must include command-specific output`);
      } else if (!hasExplicitCommandExitCodeZero(row.evidence)) {
        errors.push(`Required Commands: ${row.command}: evidence command output must include exit code 0`);
      }
      if (!hasNoContradictoryOperatorReadinessOperationalEvidenceMarker(row.evidence)) {
        errors.push(`Required Commands: ${row.command}: evidence must not include contradictory operator-readiness failure markers`);
      }
      if (hasContradictoryValidationFailureMarker(row.evidence)) {
        errors.push(`Required Commands: ${row.command}: evidence must contain internally positive operator command output`);
      }
      if (leavesCriticalIncidentsOpen(row.evidence)) {
        errors.push(`Required Commands: ${row.command}: evidence must not leave critical incidents open`);
      }
    }
  }

  return errors;
}

function hasContradictoryValidationFailureMarker(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);
  return (
    /(?:^|[^A-Za-z0-9_-])FAIL(?:$|[^A-Za-z0-9_-])/i.test(normalized) ||
    /\b(?:status|result|validation|validator|command|outcome)\s*[:=]?\s*FAILED\b/i.test(normalized) ||
    /\bFAILED\b\s+(?:validation|validator|command|run|result|status)\b/i.test(normalized) ||
    /\bBLOCKED\b/i.test(normalized) ||
    /\bERROR\b/i.test(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized) ||
    hasUnresolvedIssueMarker(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\b[1-9]\d*\s+structural\s+issues?\b/i.test(normalized)
  );
}

function validateDrillRows(rows: IncidentDrillRow[]): string[] {
  const errors = validateRequiredNames('Incident And Recovery Drills', rows.map(row => row.drill), REQUIRED_OPERATOR_READINESS_DRILLS);

  for (const row of rows) {
    if (!REQUIRED_OPERATOR_READINESS_DRILLS.includes(row.drill)) {
      errors.push(`Incident And Recovery Drills: ${row.drill}: unexpected drill`);
    }
    validateLinkedStatus(errors, 'Incident And Recovery Drills', row.drill, row.status);
    if (isBlank(row.expectedOutcome)) {
      errors.push(`Incident And Recovery Drills: ${row.drill}: expected outcome is required`);
    }
    if (isBlank(row.evidence)) errors.push(`Incident And Recovery Drills: ${row.drill}: evidence is required`);
    if (row.status === 'linked' && !hasEvidenceMarker(row.evidence)) {
      errors.push(`Incident And Recovery Drills: ${row.drill}: linked status requires an evidence marker`);
    }
    if (row.status === 'linked' && !hasCompletedOperatorReadinessEvidenceTarget(row.evidence)) {
      errors.push(
        `Incident And Recovery Drills: ${row.drill}: linked status requires completed drill evidence, a non-template evidence link, or an artifact marker`,
      );
    }
    if (row.status === 'linked' && !hasNoContradictoryOperatorReadinessOperationalEvidenceMarker(row.evidence)) {
      errors.push(`Incident And Recovery Drills: ${row.drill}: evidence must not include contradictory operator-readiness failure markers`);
    }
    if (row.status === 'linked' && leavesCriticalIncidentsOpen(row.evidence)) {
      errors.push(`Incident And Recovery Drills: ${row.drill}: evidence must not leave critical incidents open`);
    }
    if (row.status === 'linked' && !isActionableDrillOutcome(row.expectedOutcome)) {
      errors.push(`Incident And Recovery Drills: ${row.drill}: linked status requires an actionable recovery outcome`);
    }
  }

  return errors;
}

function validateDecisionRows(rows: OperationalDecisionRow[]): string[] {
  const errors = validateRequiredNames('Operational Decisions', rows.map(row => row.decision), REQUIRED_OPERATOR_READINESS_OPERATIONAL_DECISIONS);

  for (const row of rows) {
    if (!REQUIRED_OPERATOR_READINESS_OPERATIONAL_DECISIONS.includes(row.decision)) {
      errors.push(`Operational Decisions: ${row.decision}: unexpected decision`);
    }
    validateLinkedStatus(errors, 'Operational Decisions', row.decision, row.status);
    if (isBlank(row.requiredEvidence)) {
      errors.push(`Operational Decisions: ${row.decision}: required evidence is required`);
    }
    if (isBlank(row.stopCondition)) {
      errors.push(`Operational Decisions: ${row.decision}: stop condition is required`);
    }
    if (row.status === 'linked' && !hasEvidenceMarker(row.requiredEvidence)) {
      errors.push(`Operational Decisions: ${row.decision}: linked status requires an evidence marker`);
    }
    if (row.status === 'linked' && !hasCompletedOperatorReadinessEvidenceTarget(row.requiredEvidence)) {
      errors.push(
        `Operational Decisions: ${row.decision}: linked status requires completed decision evidence, a non-template evidence link, or an artifact marker`,
      );
    }
    if (row.status === 'linked' && !hasNoContradictoryOperatorReadinessOperationalEvidenceMarker(row.requiredEvidence)) {
      errors.push(`Operational Decisions: ${row.decision}: required evidence must not include contradictory operator-readiness failure markers`);
    }
    if (row.status === 'linked' && leavesCriticalIncidentsOpen(row.requiredEvidence)) {
      errors.push(`Operational Decisions: ${row.decision}: required evidence must not leave critical incidents open`);
    }
    if (row.status === 'linked') {
      for (const marker of REQUIRED_OPERATIONAL_DECISION_EVIDENCE_MARKERS[row.decision] ?? []) {
        if (!marker.pattern.test(row.requiredEvidence)) {
          errors.push(`Operational Decisions: ${row.decision}: ${marker.message}`);
        }
      }
    }
    if (row.status === 'linked' && !isActionableStopCondition(row.stopCondition)) {
      errors.push(`Operational Decisions: ${row.decision}: linked status requires an actionable stop condition`);
    }
  }

  return errors;
}

function validatePublicationDecision(
  fields: Map<string, string>,
  evidence: {
    runbookRows: RunbookCoverageRow[];
    commandRows: OperatorCommandRow[];
    drillRows: IncidentDrillRow[];
    decisionRows: OperationalDecisionRow[];
  },
  releaseLevel: string,
  environment: string,
): string[] {
  const errors: string[] = [];

  for (const field of REQUIRED_PUBLICATION_FIELDS) {
    if (isBlank(fields.get(field) ?? '')) errors.push(`Publication Decision: ${field} is required`);
  }

  validateAllowedField(errors, fields, 'Publication Decision', 'Release supported', ALLOWED_RELEASE_SUPPORT);
  validateAllowedField(errors, fields, 'Publication Decision', 'Production-ready claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, fields, 'Publication Decision', 'Testnet production-candidate claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, fields, 'Publication Decision', 'Operator-ready claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, fields, 'Publication Decision', 'Release notes updated', ALLOWED_YES_NO);

  const releaseSupported = fields.get('Release supported') ?? '';
  const productionClaim = fields.get('Production-ready claim allowed') ?? '';
  const testnetProductionCandidateClaim = fields.get('Testnet production-candidate claim allowed') ?? '';
  const operatorClaim = fields.get('Operator-ready claim allowed') ?? '';
  const criticalIncidents = fields.get('Critical incidents open') ?? '';
  const releaseNotesUpdated = fields.get('Release notes updated') ?? '';
  const releaseNoteUpdates = fields.get('Required release-note updates') ?? '';
  const checklistUpdates = fields.get('Required checklist updates') ?? '';
  const reviewerDecisionSummary = fields.get('Reviewer decision summary') ?? '';

  if (productionClaim === 'yes') {
    errors.push('Publication Decision: Production-ready claim allowed must be no; mainnet production-ready claims are forbidden');
  }
  if (productionClaim === 'yes' && releaseSupported !== 'production deployment candidate') {
    errors.push('Publication Decision: production-ready claim requires production deployment candidate support');
  }
  if (releaseSupported === 'none') {
    errors.push('Publication Decision: Release supported must not be none before operator readiness can pass');
  }
  if (releaseSupported !== 'none' && releaseExceedsReadinessLevel(releaseSupported, releaseLevel)) {
    errors.push('Publication Decision: Release supported must not exceed Readiness Classification release level');
  }
  if (releaseLevel === 'production deployment candidate' && releaseSupported !== 'production deployment candidate') {
    errors.push(
      'Publication Decision: production deployment candidate operator readiness requires exact Release supported = production deployment candidate',
    );
  }
  if (releaseSupported === 'production deployment candidate' && environment !== 'testnet') {
    errors.push('Publication Decision: production deployment candidate support requires exact Readiness Classification Environment = testnet');
  }
  if (releaseSupported === 'production deployment candidate' && operatorClaim !== 'yes') {
    errors.push(
      'Publication Decision: production deployment candidate support requires exact Operator-ready claim allowed = yes',
    );
  }
  if (releaseSupported === 'production deployment candidate' && testnetProductionCandidateClaim !== 'yes') {
    errors.push(
      'Publication Decision: production deployment candidate support requires exact Testnet production-candidate claim allowed = yes',
    );
  }
  if (productionClaim === 'yes' && operatorClaim !== 'yes') {
    errors.push('Publication Decision: production-ready claim requires operator-ready claim allowed');
  }
  if (operatorClaim === 'yes' && releaseSupported === 'none') {
    errors.push('Publication Decision: operator-ready claim requires a supported release level');
  }
  if (!isBlank(criticalIncidents) && !/^0$/.test(criticalIncidents)) {
    errors.push('Publication Decision: Critical incidents open must be 0');
  }
  if (releaseNotesUpdated === 'no') {
    errors.push('Publication Decision: Release notes updated must be yes before operator readiness can pass');
  }
  if (!isBlank(releaseNoteUpdates) && !hasEvidenceMarker(releaseNoteUpdates)) {
    errors.push('Publication Decision: Required release-note updates must use an evidence marker');
  } else if (!isBlank(releaseNoteUpdates) && !hasCompletedOperatorReadinessEvidenceTarget(releaseNoteUpdates)) {
    errors.push(
      'Publication Decision: Required release-note updates must include a completed operator readiness release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  } else if (!isBlank(releaseNoteUpdates) && !identifiesOperatorReadinessReleaseNoteEvidence(releaseNoteUpdates)) {
    errors.push(
      'Publication Decision: Required release-note updates must identify completed operator-readiness release-note update evidence',
    );
  }
  if (!isBlank(releaseNoteUpdates) && !hasNoContradictoryOperatorReadinessEvidenceMarker(releaseNoteUpdates)) {
    errors.push(
      'Publication Decision: Required release-note updates must not include contradictory operator-readiness failure markers',
    );
  }
  if (!isBlank(releaseNoteUpdates) && hasContradictoryOperatorReadinessDecisionBinding(releaseNoteUpdates)) {
    errors.push(
      'Publication Decision: Required release-note updates must not include contradictory operator-readiness decision bindings',
    );
  }
  if (!isBlank(releaseNoteUpdates) && containsMainnetProductionClaim(releaseNoteUpdates)) {
    errors.push('Publication Decision: Required release-note updates must not contain mainnet production claim wording');
  }
  if (!isBlank(releaseNoteUpdates) && containsProductionReadyClaim(releaseNoteUpdates)) {
    errors.push('Publication Decision: Required release-note updates must not contain production-ready claim wording');
  }
  if (!isBlank(releaseNoteUpdates) && usesNonExactCriticalIncidentClosure(releaseNoteUpdates)) {
    errors.push(
      'Publication Decision: Required release-note updates must use exact numeric Critical incidents open = 0; textual or shorthand critical incident terms are not accepted',
    );
  }
  if (
    releaseSupported === 'production deployment candidate' &&
    !isBlank(releaseNoteUpdates) &&
    !hasExactProductionCandidateReleaseSupportedBinding(releaseNoteUpdates)
  ) {
    errors.push(
      'Publication Decision: Required release-note updates must use exact Release supported = production deployment candidate',
    );
  }
  if (operatorClaim === 'yes' && !isBlank(releaseNoteUpdates) && !hasExactOperatorReadyClaimAllowedBinding(releaseNoteUpdates)) {
    errors.push('Publication Decision: Required release-note updates must use exact Operator-ready claim allowed = yes');
  }
  if (
    productionClaim === 'no' &&
    !isBlank(releaseNoteUpdates) &&
    !hasExactProductionReadyClaimDeniedBinding(releaseNoteUpdates)
  ) {
    errors.push('Publication Decision: Required release-note updates must use exact Production-ready claim allowed = no');
  }
  if (
    (testnetProductionCandidateClaim === 'yes' || testnetProductionCandidateClaim === 'no') &&
    !isBlank(releaseNoteUpdates) &&
    !hasExactTestnetProductionCandidateClaimAllowedBinding(
      releaseNoteUpdates,
      testnetProductionCandidateClaim,
    )
  ) {
    errors.push(
      `Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = ${testnetProductionCandidateClaim}`,
    );
  }
  if (!isBlank(checklistUpdates) && !hasEvidenceMarker(checklistUpdates)) {
    errors.push('Publication Decision: Required checklist updates must use an evidence marker');
  } else if (!isBlank(checklistUpdates) && !hasCompletedOperatorReadinessEvidenceTarget(checklistUpdates)) {
    errors.push(
      'Publication Decision: Required checklist updates must include a completed operator readiness checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  } else if (!isBlank(checklistUpdates) && !identifiesOperatorReadinessChecklistEvidence(checklistUpdates)) {
    errors.push(
      'Publication Decision: Required checklist updates must identify completed operator-readiness checklist update evidence',
    );
  }
  if (!isBlank(checklistUpdates) && !hasNoContradictoryOperatorReadinessEvidenceMarker(checklistUpdates)) {
    errors.push(
      'Publication Decision: Required checklist updates must not include contradictory operator-readiness failure markers',
    );
  }
  if (!isBlank(checklistUpdates) && hasContradictoryOperatorReadinessDecisionBinding(checklistUpdates)) {
    errors.push(
      'Publication Decision: Required checklist updates must not include contradictory operator-readiness decision bindings',
    );
  }
  if (!isBlank(checklistUpdates) && containsMainnetProductionClaim(checklistUpdates)) {
    errors.push('Publication Decision: Required checklist updates must not contain mainnet production claim wording');
  }
  if (!isBlank(checklistUpdates) && containsProductionReadyClaim(checklistUpdates)) {
    errors.push('Publication Decision: Required checklist updates must not contain production-ready claim wording');
  }
  if (!isBlank(checklistUpdates) && usesNonExactCriticalIncidentClosure(checklistUpdates)) {
    errors.push(
      'Publication Decision: Required checklist updates must use exact numeric Critical incidents open = 0; textual or shorthand critical incident terms are not accepted',
    );
  }
  if (
    releaseSupported === 'production deployment candidate' &&
    !isBlank(checklistUpdates) &&
    !hasExactProductionCandidateReleaseSupportedBinding(checklistUpdates)
  ) {
    errors.push(
      'Publication Decision: Required checklist updates must use exact Release supported = production deployment candidate',
    );
  }
  if (operatorClaim === 'yes' && !isBlank(checklistUpdates) && !hasExactOperatorReadyClaimAllowedBinding(checklistUpdates)) {
    errors.push('Publication Decision: Required checklist updates must use exact Operator-ready claim allowed = yes');
  }
  if (
    productionClaim === 'no' &&
    !isBlank(checklistUpdates) &&
    !hasExactProductionReadyClaimDeniedBinding(checklistUpdates)
  ) {
    errors.push('Publication Decision: Required checklist updates must use exact Production-ready claim allowed = no');
  }
  if (
    (testnetProductionCandidateClaim === 'yes' || testnetProductionCandidateClaim === 'no') &&
    !isBlank(checklistUpdates) &&
    !hasExactTestnetProductionCandidateClaimAllowedBinding(
      checklistUpdates,
      testnetProductionCandidateClaim,
    )
  ) {
    errors.push(
      `Publication Decision: Required checklist updates must use exact Testnet production-candidate claim allowed = ${testnetProductionCandidateClaim}`,
    );
  }
  if (
    hasCompletedOperatorReadinessReleaseNoteUpdateEvidence(releaseNoteUpdates) &&
    hasCompletedOperatorReadinessChecklistUpdateEvidence(checklistUpdates) &&
    haveSharedConcreteOperatorReadinessEvidenceTarget(releaseNoteUpdates, checklistUpdates)
  ) {
    errors.push(
      'Publication Decision: Required release-note updates and Required checklist updates must use distinct completed operator-readiness evidence targets',
    );
  }
  if (operatorClaim === 'yes' && !allEvidenceLinked(evidence)) {
    errors.push('Publication Decision: operator-ready claim requires every evidence row to be linked');
  }
  if (!isBlank(reviewerDecisionSummary) && !isActionableReviewerDecisionSummary(reviewerDecisionSummary)) {
    errors.push(
      'Publication Decision: Reviewer decision summary must mention release support, operator-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and critical incidents',
    );
  }
  if (!isBlank(reviewerDecisionSummary) && hasContradictoryOperatorReadinessDecisionBinding(reviewerDecisionSummary)) {
    errors.push(
      'Publication Decision: Reviewer decision summary must not include contradictory operator-readiness decision bindings',
    );
  }
  if (
    operatorClaim === 'yes' &&
    !isBlank(reviewerDecisionSummary) &&
    !hasExactOperatorReadyClaimAllowedBinding(reviewerDecisionSummary)
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must use exact Operator-ready claim allowed = yes',
    );
  }
  if (
    productionClaim === 'no' &&
    !isBlank(reviewerDecisionSummary) &&
    !hasExactProductionReadyClaimDeniedBinding(reviewerDecisionSummary)
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
  }
  if (
    (testnetProductionCandidateClaim === 'yes' || testnetProductionCandidateClaim === 'no') &&
    !isBlank(reviewerDecisionSummary) &&
    !hasExactTestnetProductionCandidateClaimAllowedBinding(
      reviewerDecisionSummary,
      testnetProductionCandidateClaim,
    )
  ) {
    errors.push(
      `Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = ${testnetProductionCandidateClaim}`,
    );
  }
  if (
    !isBlank(releaseSupported) &&
    releaseSupported !== 'none' &&
    !isBlank(reviewerDecisionSummary) &&
    !hasExactReleaseSupportedBinding(reviewerDecisionSummary, releaseSupported)
  ) {
    errors.push(
      `Publication Decision: Reviewer decision summary must use exact Release supported = ${releaseSupported}`,
    );
  }
  if (
    !isBlank(reviewerDecisionSummary) &&
    mentionsCriticalIncidents(reviewerDecisionSummary) &&
    !closesCriticalIncidentsInReviewerSummary(reviewerDecisionSummary)
  ) {
    errors.push('Publication Decision: Reviewer decision summary: critical incidents must be numeric 0');
  }
  if (
    !isBlank(reviewerDecisionSummary) &&
    mentionsCriticalIncidents(reviewerDecisionSummary) &&
    closesCriticalIncidentsInReviewerSummary(reviewerDecisionSummary) &&
    !hasExactCriticalIncidentsOpenBinding(reviewerDecisionSummary)
  ) {
    errors.push('Publication Decision: Reviewer decision summary must use exact Critical incidents open = 0');
  }
  if (!isBlank(reviewerDecisionSummary) && approvesOpenCriticalIncidents(reviewerDecisionSummary)) {
    errors.push('Publication Decision: Reviewer decision summary must not approve open critical incidents');
  }
  if (!isBlank(reviewerDecisionSummary) && reviewerSummaryLeavesCriticalIncidentsOpen(reviewerDecisionSummary)) {
    errors.push('Publication Decision: Reviewer decision summary must not leave critical incidents open');
  }
  if (!isBlank(reviewerDecisionSummary) && approvesNonOptInBroadcastEnablement(reviewerDecisionSummary)) {
    errors.push('Publication Decision: Reviewer decision summary must not approve non-opt-in broadcast enablement');
  }
  errors.push(
    ...validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary: reviewerDecisionSummary,
      releaseSupported,
      productionReadyClaimAllowed: productionClaim,
      testnetProductionCandidateClaimAllowed: testnetProductionCandidateClaim,
    }),
  );
  return errors;
}

function releaseExceedsReadinessLevel(releaseSupported: string, releaseLevel: string): boolean {
  const supportedRank = RELEASE_LEVEL_RANK.get(releaseSupported);
  const readinessRank = RELEASE_LEVEL_RANK.get(releaseLevel);
  if (supportedRank === undefined || readinessRank === undefined) return false;
  return supportedRank > readinessRank;
}

function validatePublicationDecisionFields(markdown: string): string[] {
  return validateDuplicateRequiredFields(
    'Publication Decision',
    parseTwoColumnFieldNames(sectionBetween(markdown, '## Publication Decision', '## Reviewer Sign-Off')),
    REQUIRED_PUBLICATION_FIELDS,
  );
}

function validateReviewerRows(rows: ReviewerSignoffRow[]): string[] {
  const errors = validateRequiredNames('Reviewer Sign-Off', rows.map(row => row.role), REQUIRED_OPERATOR_READINESS_REVIEWER_ROLES);

  for (const row of rows) {
    if (!REQUIRED_OPERATOR_READINESS_REVIEWER_ROLES.includes(row.role)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: unexpected role`);
    }
    if (isBlank(row.name)) errors.push(`Reviewer Sign-Off: ${row.role}: name is required`);
    if (!ALLOWED_REVIEWER_DECISIONS.has(row.decision as ReviewerDecision)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve or block`);
    } else if (row.decision !== 'approve') {
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve before operator readiness can pass`);
    }
    if (isBlank(row.date)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: Date must use YYYY-MM-DD`);
    }
    if (isBlank(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes are required`);
    } else if (containsMainnetProductionClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not contain mainnet production claim wording`);
    } else if (containsProductionReadyClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not contain production-ready claim wording`);
    } else if (!hasNoContradictoryOperatorReadinessEvidenceMarker(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not include contradictory operator-readiness failure markers`);
    } else if (!isActionableReviewerNote(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must state a concrete operator-readiness outcome`);
    } else if (!isConcreteOperationalDecisionNote(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must cite a concrete operational decision or stop condition`);
    }
    if (!isBlank(row.notes) && approvesOpenCriticalIncidents(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve open critical incidents`);
    }
    if (!isBlank(row.notes) && approvesNonOptInBroadcastEnablement(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve non-opt-in broadcast enablement`);
    }
    if (!isBlank(row.notes) && leavesCriticalIncidentsOpen(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not leave critical incidents open`);
    }
  }

  return errors;
}

function containsMainnetProductionClaim(value: string): boolean {
  return classifyPublicationClaimText(value).hasMainnetProductionClaim;
}

function containsProductionReadyClaim(value: string): boolean {
  return classifyPublicationClaimText(value).hasProductionReadyClaim;
}

function validateReviewerIdentityConsistency(markdown: string, rows: ReviewerSignoffRow[]): string[] {
  const classification = parseTwoColumnTable(
    sectionBetween(markdown, '## Readiness Classification', '## Runbook Coverage'),
  );
  const classifiedReviewer = classification.get('Reviewer')?.trim() ?? '';
  const runbookOperatorSignoff = rows.find(row => row.role === 'Runbook operator')?.name.trim() ?? '';

  if (
    classifiedReviewer.length > 0 &&
    runbookOperatorSignoff.length > 0 &&
    classifiedReviewer !== runbookOperatorSignoff
  ) {
    return ['Reviewer Sign-Off: Runbook operator: name must match Readiness Classification Reviewer'];
  }

  return [];
}

function validateReviewerDateConsistency(markdown: string, rows: ReviewerSignoffRow[]): string[] {
  const classification = parseTwoColumnTable(
    sectionBetween(markdown, '## Readiness Classification', '## Runbook Coverage'),
  );
  const classificationDate = classification.get('Date')?.trim() ?? '';
  if (!isIsoCalendarDate(classificationDate)) return [];

  return rows
    .filter(row => isIsoCalendarDate(row.date) && row.date < classificationDate)
    .map(row => `Reviewer Sign-Off: ${row.role}: Date must not be before Readiness Classification Date`);
}

function validateLinkedStatus(errors: string[], section: string, label: string, status: string): void {
  if (!ALLOWED_STATUSES.has(status as OperatorEvidenceStatus)) {
    errors.push(`${section}: ${label}: status must be pending, linked, or blocker`);
    return;
  }
  if (status !== 'linked') {
    errors.push(`${section}: ${label}: status must be linked before operator readiness can pass`);
  }
}


function validateAllowedField(
  errors: string[],
  fields: Map<string, string>,
  section: string,
  field: string,
  allowed: Set<string>,
): void {
  const value = fields.get(field) ?? '';
  if (!isBlank(value) && !allowed.has(value)) {
    errors.push(`${section}: ${field} must be one of ${[...allowed].join(', ')}`);
  }
}

function parsePublicationDecision(markdown: string): Map<string, string> {
  return parseTwoColumnTable(sectionBetween(markdown, '## Publication Decision', '## Reviewer Sign-Off'));
}

function parseTableBetween(markdown: string, startHeading: string, endHeading?: string): string[][] {
  const section = sectionBetween(markdown, startHeading, endHeading);
  const firstTableLine = section.search(/^\|/m);
  if (firstTableLine < 0) throw new Error(`${startHeading}: table not found`);
  return parseMarkdownTableRows(section.slice(firstTableLine));
}

function sectionBetween(markdown: string, startHeading: string, endHeading?: string): string {
  const start = markdown.indexOf(startHeading);
  if (start < 0) return '';
  const afterStart = start + startHeading.length;
  const end = endHeading ? markdown.indexOf(endHeading, afterStart) : -1;
  return markdown.slice(afterStart, end >= 0 ? end : markdown.length);
}

function parseTwoColumnFieldNames(section: string): string[] {
  return parseMarkdownTableRows(section)
    .filter(row => row.length >= 2)
    .map(row => row[0]);
}

function parseTwoColumnTable(section: string): Map<string, string> {
  const firstTableLine = section.search(/^\|/m);
  if (firstTableLine < 0) return new Map();

  const rows = parseMarkdownTableRows(section.slice(firstTableLine));
  const fields = new Map<string, string>();
  for (const row of rows) {
    if (row.length >= 2) fields.set(row[0], row[1]);
  }
  return fields;
}

function hasEvidenceMarker(value: string): boolean {
  return /\[[^\]]+\]\([^)]+\)/.test(value)
    || /\bartifact:\/\//.test(value)
    || /\bnpm run [a-z0-9:_-]+/.test(value)
    || /\bgit status --short\b/.test(value);
}

function hasCompletedEvidenceMarker(value: string): boolean {
  return (
    hasCompletedArtifactTarget(value) ||
    hasNonTemplateMarkdownLink(value) ||
    hasCommandOutputMarker(value)
  );
}

function hasCompletedEvidenceTarget(value: string): boolean {
  const completedEvidenceText = operatorReadinessCompletedEvidenceText(value);
  return !hasLocalOnlyEvidenceTarget(value) &&
    !hasClaimEscalatingOperatorReadinessEvidenceReference(value) &&
    (hasCompletedArtifactTarget(completedEvidenceText) || hasNonTemplateMarkdownLink(completedEvidenceText));
}

export function hasCompletedOperatorReadinessEvidenceTarget(value: string): boolean {
  return hasCompletedEvidenceTarget(value);
}

export function hasCompletedOperatorReadinessReleaseNoteUpdateEvidence(value: string): boolean {
  return (
    hasCompletedOperatorReadinessEvidenceTarget(value) &&
    identifiesOperatorReadinessReleaseNoteEvidence(value) &&
    hasNoContradictoryOperatorReadinessEvidenceMarker(value)
  );
}

export function hasCompletedOperatorReadinessChecklistUpdateEvidence(value: string): boolean {
  return (
    hasCompletedOperatorReadinessEvidenceTarget(value) &&
    identifiesOperatorReadinessChecklistEvidence(value) &&
    hasNoContradictoryOperatorReadinessEvidenceMarker(value)
  );
}

export function hasNoContradictoryOperatorReadinessEvidenceMarker(value: string): boolean {
  return !hasContradictoryValidationFailureMarker(value);
}

export function hasNoContradictoryOperatorReadinessOperationalEvidenceMarker(value: string): boolean {
  return !hasContradictoryOperationalEvidenceFailureMarker(value);
}

function hasCompletedArtifactTarget(value: string): boolean {
  return extractArtifactTargets(value).some(isConcreteArtifactTarget);
}

function extractArtifactTargets(value: string): string[] {
  return [...value.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+)/g)]
    .map(([, target]) => target.replace(/[.;]+$/g, ''));
}

function extractEvidenceTargets(value: string): string[] {
  return [
    ...extractArtifactTargets(value),
    ...[...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(([, target]) => target),
  ];
}

function extractCompletedOperatorReadinessEvidenceTargets(value: string): string[] {
  return extractEvidenceTargets(operatorReadinessCompletedEvidenceText(value));
}

function operatorReadinessCompletedEvidenceText(value: string): string {
  return value
    .split(/[;\n]+/)
    .map(segment => {
      const targetBinding = findOperatorReadinessValidationTargetBinding(segment);
      return targetBinding
        ? segment.slice(0, targetBinding.index).trim()
        : segment.trim();
    })
    .filter(segment => segment.length > 0)
    .join('; ');
}

function normalizeEvidenceTarget(target: string): string {
  return target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').trim().toLowerCase();
}

function hasClaimEscalatingOperatorReadinessEvidenceReference(value: string): boolean {
  return extractEvidenceTargets(value)
    .some(target => hasClaimEscalatingOperatorReadinessEvidenceTarget(target));
}

function hasClaimEscalatingOperatorReadinessEvidenceTarget(target: string): boolean {
  const claim = classifyPublicationClaimText(normalizeEvidenceTarget(target));
  return claim.hasProductionClaim;
}

function isConcreteEvidenceTarget(target: string): boolean {
  const normalized = normalizeEvidenceTarget(target);
  if (normalized.length === 0) return false;
  if (hasClaimEscalatingOperatorReadinessEvidenceTarget(normalized)) return false;
  if (/^artifact:\/\//i.test(normalized)) return isConcreteArtifactTarget(normalized);
  if (isLocalOnlyEvidenceTarget(normalized)) return false;
  if (isSensitiveOrRuntimeOperatorReadinessEvidenceTarget(normalized)) return false;
  return !/-template\.md(?:[#?].*)?$/i.test(normalized) &&
    normalized.split(/[\\/]+/).every(segment => !isNonConcreteArtifactSegment(segment));
}

function hasLocalOnlyEvidenceTarget(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(hasLocalOnlyEvidenceInspectionText);
}

function hasLocalOnlyEvidenceInspectionText(normalized: string): boolean {
  return hasEvidenceLocalOnlyInspectionReference(normalized);
}

function isLocalOnlyEvidenceTarget(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(isLocalOnlyEvidenceInspectionTarget);
}

function isLocalOnlyEvidenceInspectionTarget(normalized: string): boolean {
  return (
    hasEvidenceLocalOnlyInspectionReference(normalized) ||
    /^file:\/\//i.test(normalized) ||
    /^[a-z]:\//i.test(normalized) ||
    /^\/\/[^/]/.test(normalized) ||
    /^\/(?:users?|home|tmp|var|private|mnt|volumes|etc)(?:\/|$)/i.test(normalized)
  );
}

function isSensitiveOrRuntimeOperatorReadinessEvidenceTarget(target: string): boolean {
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(isSensitiveOrRuntimeOperatorReadinessEvidenceInspectionTarget);
}

function isSensitiveOrRuntimeOperatorReadinessEvidenceInspectionTarget(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasOperatorReadinessEnvironmentTargetSegment(normalizedTarget) ||
    hasOperatorReadinessRuntimeDatabaseTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalizedTarget, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
  );
}

function hasOperatorReadinessEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasOperatorReadinessRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function haveSharedConcreteOperatorReadinessEvidenceTarget(left: string, right: string): boolean {
  const leftTargets = new Set(
    extractCompletedOperatorReadinessEvidenceTargets(left)
      .map(normalizeEvidenceTarget)
      .filter(isConcreteEvidenceTarget),
  );
  return extractCompletedOperatorReadinessEvidenceTargets(right)
    .map(normalizeEvidenceTarget)
    .filter(isConcreteEvidenceTarget)
    .some(target => leftTargets.has(target));
}

function identifiesOperatorReadinessReleaseNoteEvidence(value: string): boolean {
  return identifiesOperatorReadinessPublicationEvidenceKind(
    value,
    'completed operator readiness release-note update evidence',
  );
}

function identifiesOperatorReadinessChecklistEvidence(value: string): boolean {
  return identifiesOperatorReadinessPublicationEvidenceKind(
    value,
    'completed operator readiness checklist update evidence',
  );
}

function identifiesOperatorReadinessPublicationEvidenceKind(value: string, evidenceKind: string): boolean {
  const normalizedKind = normalizeOperatorReadinessEvidenceKind(evidenceKind);
  return operatorReadinessPublicationEvidenceTargetsIdentifyKind(value, normalizedKind) ||
    operatorReadinessPublicationEvidenceKindTextSegments(value)
      .some(segment =>
        segment === normalizedKind ||
        segment.startsWith(`${normalizedKind} `)
      );
}

function operatorReadinessPublicationEvidenceTargetsIdentifyKind(value: string, normalizedKind: string): boolean {
  const expectedSlug = normalizedKind.replace(/\s+/g, '-');
  return extractCompletedOperatorReadinessEvidenceTargets(value)
    .some(target => normalizeOperatorReadinessPublicationEvidenceTargetBasename(target) === expectedSlug);
}

function normalizeOperatorReadinessPublicationEvidenceTargetBasename(target: string): string {
  const normalizedTarget = normalizeEvidenceTarget(target).replace(/\\/g, '/');
  const basename = normalizedTarget.split('/').filter(Boolean).pop() ?? normalizedTarget;
  return normalizeOperatorReadinessEvidenceKind(basename.replace(/\.[a-z0-9]+$/i, '')).replace(/\s+/g, '-');
}

function operatorReadinessPublicationEvidenceKindTextSegments(value: string): string[] {
  return value
    .split(/[;\n|]+/)
    .map(stripLeadingOperatorReadinessEvidenceTarget)
    .map(normalizeOperatorReadinessEvidenceKind)
    .filter(segment => segment.length > 0);
}

function stripLeadingOperatorReadinessEvidenceTarget(value: string): string {
  const trimmed = value.trim();
  const markdownMatch = /^\[[^\]]+\]\([^)]+\)/.exec(trimmed);
  if (markdownMatch) return trimmed.slice(markdownMatch[0].length).replace(/^[\s,.:;-]+/, '');

  const artifactMatch = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+/i.exec(trimmed);
  if (artifactMatch) return trimmed.slice(artifactMatch[0].length).replace(/^[\s,.:;-]+/, '');

  return trimmed;
}

function normalizeOperatorReadinessEvidenceKind(value: string): string {
  return normalizeEvidenceMarkerText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasContradictoryOperationalEvidenceFailureMarker(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);
  return (
    /\b(?:status|result|validation|validator|command|outcome)\s*[:=]?\s*(?:FAIL(?:ED)?|BLOCKED|ERROR)\b/i.test(normalized) ||
    /\b(?:FAIL(?:ED)?|BLOCKED|ERROR)\b\s+(?:validation|validator|command|run|result|status|outcome)\b/i.test(normalized) ||
    /\bERROR\b/i.test(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized) ||
    hasUnresolvedIssueMarker(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\b[1-9]\d*\s+structural\s+issues?\b/i.test(normalized)
  );
}

function findOperatorReadinessValidationTargetBinding(value: string): RegExpExecArray | null {
  return /\b(?:validated target|validated input|operator validate target|operator readiness validation target)\b/i
    .exec(value);
}

function hasNonTemplateMarkdownLink(value: string): boolean {
  const links = [...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
  return links.some(([, rawTarget]) => isConcreteEvidenceTarget(rawTarget));
}

function isConcreteArtifactTarget(target: string): boolean {
  const match = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/(.+)$/i.exec(target.trim());
  if (match === null) return false;
  const path = match[1].split(/[?#]/, 1)[0];
  if (hasClaimEscalatingOperatorReadinessEvidenceTarget(path)) return false;
  return path.split(/[\\/]+/).every(segment => !isNonConcreteArtifactSegment(segment));
}

function isNonConcreteArtifactSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /(?:^|[-_.])(?:not[-_]?completed|uncompleted)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])template(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])sample(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|operator|readiness|runbook|command|drill|decision|release|checklist)|$)/i.test(normalized) ||
    /(?:^|[-_.])example(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|validator|operator|readiness|runbook|command|drill|decision|release|checklist)|$)/i.test(normalized)
  );
}

function hasCommandOutputMarker(value: string): boolean {
  return (
    /(?:\bnpm run [a-z0-9:_-]+\b|\bgit status --short\b)/.test(value) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(value)
  );
}

function hasExplicitCommandExitCodeZero(value: string): boolean {
  return /\bexit[- ]?code\s*(?:=|:)?\s*0\b(?!\s*\/)/i.test(value);
}

function commandEvidencePattern(command: string): RegExp {
  const exactCommand = escapeRegExp(command).replace(/\s+/g, '\\s+');
  const slug = command
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(escapeRegExp)
    .join('[-_ ]+');
  return new RegExp(`(?:\\b${exactCommand}\\b|\\b${slug}\\b)`, 'i');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function allEvidenceLinked(evidence: {
  runbookRows: RunbookCoverageRow[];
  commandRows: OperatorCommandRow[];
  drillRows: IncidentDrillRow[];
  decisionRows: OperationalDecisionRow[];
}): boolean {
  return [
    ...evidence.runbookRows,
    ...evidence.commandRows,
    ...evidence.drillRows,
    ...evidence.decisionRows,
  ].every(row => row.status === 'linked');
}

function isBlank(value: string): boolean {
  return value.trim() === '' || /^pending \/ linked \/ blocker$/.test(value.trim()) || /^yes \/ no$/.test(value.trim());
}

function isRunbookRequiredCheck(value: string): boolean {
  return /\bstop conditions?\b/i.test(value) && /\bverification commands?\b/i.test(value);
}

function hasRunbookCheckEvidence(value: string): boolean {
  return /\bstop[- ]conditions?\b/i.test(value) && /\bverification[- ]commands?\b/i.test(value);
}

function isActionableStopCondition(value: string): boolean {
  return /\b(stop|block|fail|disable|pause|incident|do not|refuse)\b/i.test(value);
}

function isActionableDrillOutcome(value: string): boolean {
  return /\b(stop|block|fail|disable|pause|incident|do not|refuse|recover|reconcile|restore|confirm|escalate)\b/i.test(value);
}

function isActionableReviewerNote(value: string): boolean {
  return (
    hasNoContradictoryOperatorReadinessEvidenceMarker(value) &&
    /\b(accept|accepted|approve|approved|verify|verified|validate|validated|confirm|confirmed|pass|passed|fail|failed|block|blocked|incident|reproduce|reproduced|complete|completed)\b/i.test(value) &&
    /\b(evidence|operator|readiness|runbook|command|drill|decision|stop condition|release|gate 6)\b/i.test(value)
  );
}

function isConcreteOperationalDecisionNote(value: string): boolean {
  return (
    /\bstop conditions?\b/i.test(value) ||
    hasExactOperationalDecisionReference(value)
  );
}

function hasExactOperationalDecisionReference(value: string): boolean {
  return REQUIRED_OPERATOR_READINESS_OPERATIONAL_DECISIONS.some(decision =>
    exactOperationalDecisionReferencePattern(decision).test(value)
  );
}

function exactOperationalDecisionReferencePattern(decision: string): RegExp {
  const exactDecision = escapeRegExp(decision).replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${exactDecision}\\s*(?:$|[.;,|)\\]\\r\\n])`, 'i');
}

function normalizeDecisionText(value: string): string {
  return normalizeEvidenceMarkerText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function isActionableReviewerDecisionSummary(value: string): boolean {
  const normalized = normalizeDecisionText(value);
  return (
    /\brelease supported\b/.test(normalized) &&
    /\boperator ready claim handling\b/.test(normalized) &&
    /\bproduction ready claim handling\b/.test(normalized) &&
    /\btestnet production candidate claim handling\b/.test(normalized) &&
    /\bcritical incidents?\b/.test(normalized)
  );
}

function mentionsCriticalIncidents(value: string): boolean {
  return /\bcritical incidents?\b/.test(normalizeDecisionText(value));
}

function leavesCriticalIncidentsOpen(value: string): boolean {
  const normalized = normalizeDecisionText(value);
  const unresolvedState = '(?:pending|unresolved|outstanding|remaining|awaiting|waiting(?:\\s+(?:for|on))?|deferred)';
  return hasAmbiguousCriticalIncidentCount(value) || [
    new RegExp(`\\bcritical incidents?\\s+(?:are\\s+)?(?:open|${unresolvedState})\\s+(?!0\\b|zero\\b|none\\b|no\\b|closed\\b|resolved\\b|mitigated\\b)\\S+\\b`, 'g'),
    new RegExp(`\\bcritical incidents?\\s+(?:count|total)\\s+(?!0\\b|zero\\b|none\\b|no\\b|closed\\b|resolved\\b|mitigated\\b)\\S+\\s+${unresolvedState}\\b`, 'g'),
    new RegExp(`\\b(?:open|${unresolvedState})\\s+critical incidents?\\b`, 'g'),
  ].some(pattern => hasUnnegatedCriticalIncidentsOpen(normalized, pattern));
}

function hasAmbiguousCriticalIncidentCount(value: string): boolean {
  return /\bcritical incidents?\s+open\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value) ||
    /\bopen critical incidents?\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value);
}

function hasUnnegatedCriticalIncidentsOpen(normalized: string, pattern: RegExp): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 48), index);
    if (!/\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?(?:\s+[a-z0-9]+){0,3}\s+$/.test(prefix)) {
      return true;
    }
  }
  return false;
}

function usesTextualCriticalIncidentClosure(value: string): boolean {
  const normalized = normalizeDecisionText(value);
  const textualClosure = '(?:zero|none|no|closed|resolved|mitigated)';
  return (
    new RegExp(`\\bcritical incidents?\\s+(?:are\\s+)?(?:open\\s+)?${textualClosure}\\b`).test(normalized) ||
    new RegExp(`\\bopen critical incidents?\\s+${textualClosure}\\b`).test(normalized) ||
    new RegExp(`\\b${textualClosure}\\s+(?:open\\s+)?critical incidents?\\b`).test(normalized)
  );
}

function hasExactCriticalIncidentsOpenBinding(value: string): boolean {
  return /\bCritical incidents open\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactOperatorReadyClaimAllowedBinding(value: string): boolean {
  return /\bOperator-ready claim allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactProductionReadyClaimDeniedBinding(value: string): boolean {
  return /\bProduction-ready claim allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactTestnetProductionCandidateClaimAllowedBinding(
  value: string,
  expected: 'yes' | 'no',
): boolean {
  return new RegExp(`\\bTestnet production-candidate claim allowed\\s*=\\s*${expected}\\s*(?:$|[.;,|)\\]\\r\\n])`, 'i').test(value);
}

function hasExactProductionCandidateReleaseSupportedBinding(value: string): boolean {
  return hasExactReleaseSupportedBinding(value, 'production deployment candidate');
}

function hasExactReleaseSupportedBinding(value: string, expected: string): boolean {
  return new RegExp(`\\bRelease supported\\s*=\\s*${escapeRegExp(expected)}\\s*(?:$|[.;,|)\\]\\r\\n])`, 'i').test(value);
}

function hasContradictoryOperatorReadinessDecisionBinding(value: string): boolean {
  return (
    hasMixedOperatorReadinessReleaseSupportBindings(value) ||
    hasOpposingOperatorReadinessBinaryDecisionBindings(value, 'Operator-ready claim allowed') ||
    hasOpposingOperatorReadinessBinaryDecisionBindings(value, 'Production-ready claim allowed') ||
    hasOpposingOperatorReadinessBinaryDecisionBindings(value, 'Testnet production-candidate claim allowed') ||
    hasMixedOperatorReadinessZeroAndNonzeroBindings(value, 'Critical incidents open')
  );
}

function hasMixedOperatorReadinessReleaseSupportBindings(value: string): boolean {
  const values = exactOperatorReadinessDecisionBindingValues(
    value,
    'Release supported',
    'none|validated\\s+PoC|institutional\\s+reference|production\\s+deployment\\s+candidate',
  );
  return values.size > 1;
}

function hasOpposingOperatorReadinessBinaryDecisionBindings(value: string, field: string): boolean {
  const values = exactOperatorReadinessDecisionBindingValues(value, field, 'yes|no');
  return values.has('yes') && values.has('no');
}

function hasMixedOperatorReadinessZeroAndNonzeroBindings(value: string, field: string): boolean {
  const values = [...exactOperatorReadinessDecisionBindingValues(value, field, '\\d+')].map(Number);
  return values.some(count => count === 0) && values.some(count => count > 0);
}

function exactOperatorReadinessDecisionBindingValues(value: string, field: string, valuePattern: string): Set<string> {
  const pattern = new RegExp(
    `\\b${field.split(/[- ]+/).map(escapeRegExp).join('[- ]+')}\\s*=\\s*(${valuePattern})\\s*(?:$|[.;,|)\\]\\r\\n])`,
    'ig',
  );
  return new Set([...value.matchAll(pattern)].map(match => match[1].toLowerCase().replace(/\s+/g, ' ')));
}

function usesNumericCriticalIncidentClosure(value: string): boolean {
  const normalized = normalizeDecisionText(value);
  return (
    /\bcritical incidents?\s+(?:are\s+)?open\s+0\b/.test(normalized) ||
    /\bopen critical incidents?\s+0\b/.test(normalized) ||
    /\bcritical incidents?\s+0\b/.test(normalized) ||
    /\bcritical incidents?\s+(?:closure|count|handling)\s+0\b/.test(normalized) ||
    /\b0\s+(?:open\s+)?critical incidents?\b/.test(normalized)
  );
}

function usesNonExactCriticalIncidentClosure(value: string): boolean {
  return (
    (usesTextualCriticalIncidentClosure(value) || usesNumericCriticalIncidentClosure(value)) &&
    !hasExactCriticalIncidentsOpenBinding(value)
  );
}

function approvesOpenCriticalIncidents(value: string): boolean {
  return normalizedOperatorReadinessTextSegments(value).some(normalized =>
    operatorReadinessTextApprovesSubject(
      normalized,
      '(?:critical incidents? open|open critical incidents?)',
      operatorReadinessApprovalTerms(),
    )
  );
}

function reviewerSummaryLeavesCriticalIncidentsOpen(value: string): boolean {
  const unresolvedState = '(?:pending|unresolved|outstanding|remaining|awaiting|waiting(?:\\s+(?:for|on))?|deferred)';
  return normalizedOperatorReadinessTextSegments(value).some(segment => {
    if (operatorReadinessSegmentConfirmsNoOpenCriticalIncidents(segment)) return false;
    return (
      new RegExp(`\\bcritical incidents?\\s+(?:are\\s+)?(?:open|${unresolvedState})\\b(?!\\s+(?:0|zero|none|no|closed|resolved|mitigated)\\b)`).test(segment) ||
      new RegExp(`\\bcritical incidents?\\s+(?:count|total)\\s+(?!0\\b|zero\\b|none\\b|no\\b|closed\\b|resolved\\b|mitigated\\b)\\S+\\s+${unresolvedState}\\b`).test(segment) ||
      new RegExp(`\\b(?:open|${unresolvedState})\\s+critical incidents?\\b`).test(segment)
    );
  });
}

function approvesNonOptInBroadcastEnablement(value: string): boolean {
  return normalizedOperatorReadinessTextSegments(value).some(normalized =>
    operatorReadinessTextApprovesSubject(
      normalized,
      '(?:broadcast enablement remains non opt in|non opt in broadcast(?: enablement)?|forced broadcast enablement)',
      operatorReadinessApprovalTerms(),
    )
  );
}

function operatorReadinessTextApprovesSubject(normalized: string, subject: string, approval: string): boolean {
  const approvalConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,3}';
  const approvalSubjectConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,2}';

  return [
    new RegExp(`\\b${subject}\\b${approvalConnector}\\s+${approval}\\b`, 'g'),
    new RegExp(`\\b${approval}\\b${approvalSubjectConnector}\\s+${subject}\\b`, 'g'),
  ].some(pattern => hasUnnegatedOperatorReadinessApproval(normalized, pattern));
}

function hasUnnegatedOperatorReadinessApproval(normalized: string, pattern: RegExp): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 32), index);
    if (!/\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?\s+$/.test(prefix)) return true;
  }
  return false;
}

function operatorReadinessApprovalTerms(): string {
  return '(?:accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|enable|enabled|enables|support|supported|supports|permit|permitted|permits|clear|cleared|clears|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits)';
}

function normalizedOperatorReadinessTextSegments(value: string): string[] {
  return value
    .split(/[\n\r|;]+|[.]\s+/)
    .map(normalizeDecisionText)
    .filter(segment => segment.length > 0);
}

function operatorReadinessSegmentConfirmsNoOpenCriticalIncidents(segment: string): boolean {
  const approval = operatorReadinessApprovalTerms();
  return (
    /\bcritical incidents?\s+open\s+0\b/.test(segment) ||
    /\b(?:0|zero|none|no)\s+(?:open\s+)?critical incidents?\b/.test(segment) ||
    /\b(?:without|absence|absent|lack|lacks|lacking)(?:\s+of)?\s+(?:open\s+)?critical incidents?\b/.test(segment) ||
    new RegExp(`\\b(?:open\\s+)?critical incidents?\\b(?:\\s+[a-z0-9]+){0,3}\\s+not\\s+${approval}\\b`).test(segment)
  );
}

function closesCriticalIncidentsInReviewerSummary(value: string): boolean {
  const normalized = normalizeDecisionText(value);
  return /\bcritical incidents?\s+open\s+0\b/.test(normalized);
}
