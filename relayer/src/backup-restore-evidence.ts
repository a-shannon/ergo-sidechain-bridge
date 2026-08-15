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
} from './evidence-sensitive-target.js';
import { classifyPublicationClaimText } from './publication-claim-boundary.js';

export type BackupRestoreEvidenceStatus = 'pending' | 'linked' | 'blocker';
export type ReviewerDecision = 'approve' | 'block';

export interface RecoveryCommandRow {
  step: string;
  requiredEvidence: string;
  status: string;
}

export interface StateConsistencyRow {
  check: string;
  preBackupValue: string;
  restoredValue: string;
  evidence: string;
  status: string;
}

export interface ReconstructibilityBoundaryRow {
  boundary: string;
  requiredEvidence: string;
  status: string;
}

export interface StopConditionRow {
  stopCondition: string;
  requiredResolution: string;
  status: string;
}

export interface ReviewerSignoffRow {
  role: string;
  name: string;
  decision: string;
  date: string;
  notes: string;
}

export interface BackupRestoreClassificationFields {
  drillName?: string;
  gitCommit?: string;
  releaseLevel?: string;
  environment?: string;
  broadcastMode?: string;
  sourceState?: string;
  restoreTarget?: string;
  reviewer?: string;
  date?: string;
}

export interface BackupRestorePublicationEvidenceFields {
  releaseNotesUpdated?: string;
  requiredReleaseNoteUpdates?: string;
  pendingEvidenceRegisterUpdated?: string;
  requiredChecklistUpdates?: string;
  productionReadyClaimAllowed?: string;
  testnetProductionCandidateClaimAllowed?: string;
}

export interface BackupRestoreSnapshotProvenance {
  preBackupSnapshotTarget?: string;
  restoredSnapshotTarget?: string;
  comparisonOutputTarget?: string;
  restoredGeneratedAfterPreBackup: boolean;
  schemaVersionObserved: boolean;
  snapshotSchemaVersionsObserved: boolean;
}

export interface BackupRestoreEvidenceValidation {
  status: 'PASS' | 'BLOCKED';
  classification: BackupRestoreClassificationFields;
  commandRows: RecoveryCommandRow[];
  stateRows: StateConsistencyRow[];
  boundaryRows: ReconstructibilityBoundaryRow[];
  stopConditionRows: StopConditionRow[];
  publicationEvidence: BackupRestorePublicationEvidenceFields;
  snapshotProvenance: BackupRestoreSnapshotProvenance;
  reviewerRows: ReviewerSignoffRow[];
  errors: string[];
  message: string;
}

interface EvidenceFocus {
  pattern: RegExp;
  message: string;
}

interface StateValueFormat {
  pattern: RegExp;
  message: string;
}

interface StateSafeIntegerFormat {
  isUnsafe: (value: string) => boolean;
  message: string;
}

interface ParsedRows<T> {
  rows: T[];
  errors: string[];
}

const REQUIRED_SECTIONS = [
  '## Drill Classification',
  '## Required Commands',
  '## State Consistency Checks',
  '## Reconstructibility Boundaries',
  '## Stop Conditions',
  '## Publication Evidence',
  '## Reviewer Sign-Off',
];

const REQUIRED_CLASSIFICATION_FIELDS = [
  'Drill name',
  'Git commit',
  'Release level',
  'Environment',
  'Broadcast mode',
  'Source state',
  'Restore target',
  'Reviewer',
  'Date',
];

export const REQUIRED_BACKUP_RESTORE_COMMAND_STEPS = [
  'Stop daemon and disable broadcast',
  'Pre-backup status snapshot',
  'Backup SQLite database and WAL set',
  'Restore into isolated or reviewed target',
  'Post-restore status snapshot',
  'Rebuild DUP AVL digest',
  'Rebuild SPV tracker digest',
  'Compare pre-backup and restored state',
  'Git hygiene scan',
];
const REQUIRED_COMMAND_STEPS = REQUIRED_BACKUP_RESTORE_COMMAND_STEPS;

const REQUIRED_COMMAND_EVIDENCE_FOCUS: Record<string, EvidenceFocus[]> = {
  'Stop daemon and disable broadcast': [
    { pattern: /daemon/i, message: 'must identify daemon handling' },
    { pattern: /broadcast/i, message: 'must identify broadcast disablement' },
  ],
  'Pre-backup status snapshot': [
    { pattern: /pre[- ]?backup/i, message: 'must identify pre-backup timing' },
    { pattern: /(status|snapshot)/i, message: 'must identify status snapshot output' },
  ],
  'Backup SQLite database and WAL set': [
    { pattern: /SQLite/i, message: 'must identify SQLite backup' },
    { pattern: /WAL/i, message: 'must identify WAL handling' },
  ],
  'Restore into isolated or reviewed target': [
    { pattern: /restore/i, message: 'must identify restore execution' },
    { pattern: /(isolated|reviewed)/i, message: 'must identify isolated or reviewed target' },
  ],
  'Post-restore status snapshot': [
    { pattern: /post[- ]?restore/i, message: 'must identify post-restore timing' },
    { pattern: /(status|snapshot)/i, message: 'must identify status snapshot output' },
  ],
  'Rebuild DUP AVL digest': [
    { pattern: /DUP/i, message: 'must identify DUP rebuild' },
    { pattern: /AVL/i, message: 'must identify AVL rebuild' },
    { pattern: /digest/i, message: 'must identify digest output' },
  ],
  'Rebuild SPV tracker digest': [
    { pattern: /SPV/i, message: 'must identify SPV rebuild' },
    { pattern: /tracker/i, message: 'must identify tracker rebuild' },
    { pattern: /digest/i, message: 'must identify digest output' },
  ],
  'Compare pre-backup and restored state': [
    { pattern: /(compare|comparison)/i, message: 'must identify state comparison' },
    { pattern: /pre[- ]?backup/i, message: 'must identify pre-backup state' },
    { pattern: /restored/i, message: 'must identify restored state' },
    { pattern: /backup:compare|npm run backup:compare/i, message: 'must identify backup:compare output' },
    { pattern: /snapshot/i, message: 'must identify snapshot comparison' },
    {
      pattern: /pre[- ]?backup[^|\n;]*\.json/i,
      message: 'must identify pre-backup JSON snapshot artifact',
    },
    {
      pattern: /restored[^|\n;]*\.json/i,
      message: 'must identify restored JSON snapshot artifact',
    },
    {
      pattern: /distinct[^|\n;]*(?:pre[- ]?backup|restored)[^|\n;]*JSON|(?:pre[- ]?backup|restored)[^|\n;]*distinct[^|\n;]*JSON/i,
      message: 'must identify distinct pre-backup and restored JSON snapshot artifacts',
    },
    {
      pattern: /restored[^|\n;]*generatedAt[^|\n;]*after[^|\n;]*pre[- ]?backup|generatedAt[^|\n;]*restored[^|\n;]*after[^|\n;]*pre[- ]?backup/i,
      message: 'must identify restored snapshot generatedAt after pre-backup generatedAt',
    },
    { pattern: /schemaVersion/i, message: 'must identify snapshot schemaVersion validation' },
  ],
  'Git hygiene scan': [
    { pattern: /git status --short/i, message: 'must identify git status --short output' },
    { pattern: /git diff --check/i, message: 'must identify git diff --check output' },
    { pattern: /\b(no staged|not staged|none staged)\b.*\bruntime\b/i, message: 'must identify no staged runtime artifacts' },
  ],
};

export const REQUIRED_BACKUP_RESTORE_STATE_CHECKS = [
  'Peg-out status counts',
  'Pending reconciliation rows',
  'DUP AVL history count',
  'DUP rebuilt digest',
  'SPV tracker history count',
  'SPV rebuilt digest',
  'Persisted anchor heights',
  'Pending DUP heartbeats',
  'DUP singleton digest comparison or incident classification',
  'SPV tracker singleton digest comparison or incident classification',
  'Runtime artifact hygiene',
];
const REQUIRED_STATE_CHECKS = REQUIRED_BACKUP_RESTORE_STATE_CHECKS;

const BACKUP_COMPARE_STATE_CHECKS = new Set([
  'Peg-out status counts',
  'Pending reconciliation rows',
  'DUP AVL history count',
  'DUP rebuilt digest',
  'SPV tracker history count',
  'SPV rebuilt digest',
  'Persisted anchor heights',
  'Pending DUP heartbeats',
]);

const REQUIRED_STATE_EVIDENCE_FOCUS: Record<string, EvidenceFocus[]> = {
  'Peg-out status counts': [
    { pattern: /peg[- ]out/i, message: 'must identify peg-out rows' },
    { pattern: /status/i, message: 'must identify status values' },
    { pattern: /counts?/i, message: 'must identify counts' },
  ],
  'Pending reconciliation rows': [
    { pattern: /pending/i, message: 'must identify pending rows' },
    { pattern: /reconciliation/i, message: 'must identify reconciliation state' },
  ],
  'DUP AVL history count': [
    { pattern: /DUP/i, message: 'must identify DUP state' },
    { pattern: /AVL/i, message: 'must identify AVL history' },
    { pattern: /counts?/i, message: 'must identify counts' },
  ],
  'DUP rebuilt digest': [
    { pattern: /DUP/i, message: 'must identify DUP state' },
    { pattern: /\b(rebuild|rebuilt)\b/i, message: 'must identify rebuild output' },
    { pattern: /digest/i, message: 'must identify digest output' },
  ],
  'SPV tracker history count': [
    { pattern: /SPV/i, message: 'must identify SPV state' },
    { pattern: /tracker/i, message: 'must identify tracker history' },
    { pattern: /counts?/i, message: 'must identify counts' },
  ],
  'SPV rebuilt digest': [
    { pattern: /SPV/i, message: 'must identify SPV state' },
    { pattern: /\b(rebuild|rebuilt)\b/i, message: 'must identify rebuild output' },
    { pattern: /digest/i, message: 'must identify digest output' },
  ],
  'Persisted anchor heights': [
    { pattern: /persist/i, message: 'must identify persisted state' },
    { pattern: /anchor/i, message: 'must identify anchor heights' },
  ],
  'Pending DUP heartbeats': [
    { pattern: /pending/i, message: 'must identify pending rows' },
    { pattern: /DUP/i, message: 'must identify DUP heartbeats' },
    { pattern: /heartbeats?/i, message: 'must identify heartbeat records' },
  ],
  'DUP singleton digest comparison or incident classification': [
    { pattern: /DUP/i, message: 'must identify DUP singleton state' },
    { pattern: /singleton/i, message: 'must identify singleton state' },
    { pattern: /digest/i, message: 'must identify digest comparison' },
    { pattern: /(comparison|compare|incident|classification)/i, message: 'must identify comparison or incident classification' },
  ],
  'SPV tracker singleton digest comparison or incident classification': [
    { pattern: /SPV/i, message: 'must identify SPV tracker singleton state' },
    { pattern: /tracker/i, message: 'must identify SPV tracker singleton state' },
    { pattern: /singleton/i, message: 'must identify singleton state' },
    { pattern: /digest/i, message: 'must identify digest comparison' },
    { pattern: /(comparison|compare|incident|classification)/i, message: 'must identify comparison or incident classification' },
  ],
  'Runtime artifact hygiene': [
    { pattern: /runtime/i, message: 'must identify runtime artifacts' },
    { pattern: /(artifact|hygiene|git status|staged|backup)/i, message: 'must identify artifact hygiene or git status' },
  ],
};

const AVL_DIGEST_PATTERN = /^(?:0x)?[a-f0-9]{66}$/i;
const SINGLETON_DIGEST_OR_INCIDENT_PATTERN =
  /(?=.*\bsingleton\b)(?=.*\bdigest\b)(?:(?=.*(?:0x)?(?:[a-f0-9]{64}|[a-f0-9]{66})\b)(?=.*\bmatch(?:ed)?\b)|(?=.*\b(?:incident|classification|classified|mismatch)\b))/i;
const REQUIRED_STATE_VALUE_FORMATS: Record<string, StateValueFormat> = {
  'Peg-out status counts': {
    pattern: /^[A-Za-z][A-Za-z0-9_-]*=\d+(?:\s*,\s*[A-Za-z][A-Za-z0-9_-]*=\d+)*$/,
    message: 'must use status=count pairs',
  },
  'Pending reconciliation rows': {
    pattern: /^\d+$/,
    message: 'must be a numeric row count',
  },
  'DUP AVL history count': {
    pattern: /^\d+$/,
    message: 'must be a numeric history count',
  },
  'DUP rebuilt digest': {
    pattern: AVL_DIGEST_PATTERN,
    message: 'must be a 33-byte AVL digest',
  },
  'SPV tracker history count': {
    pattern: /^\d+$/,
    message: 'must be a numeric history count',
  },
  'SPV rebuilt digest': {
    pattern: AVL_DIGEST_PATTERN,
    message: 'must be a 33-byte AVL digest',
  },
  'Persisted anchor heights': {
    pattern: /^(?:none|\d+(?:\s*,\s*\d+)*)$/i,
    message: 'must be numeric anchor heights or none',
  },
  'Pending DUP heartbeats': {
    pattern: /^\d+$/,
    message: 'must be a numeric heartbeat count',
  },
  'DUP singleton digest comparison or incident classification': {
    pattern: SINGLETON_DIGEST_OR_INCIDENT_PATTERN,
    message: 'must include a concrete 32-byte singleton ID, 33-byte digest, or incident classification',
  },
  'SPV tracker singleton digest comparison or incident classification': {
    pattern: SINGLETON_DIGEST_OR_INCIDENT_PATTERN,
    message: 'must include a concrete 32-byte singleton ID, 33-byte digest, or incident classification',
  },
  'Runtime artifact hygiene': {
    pattern: /\b(clean|ignored|not staged|no staged|none)\b/i,
    message: 'must state clean, ignored, none, or not staged artifact hygiene',
  },
};

const REQUIRED_STATE_SAFE_INTEGER_FORMATS: Record<string, StateSafeIntegerFormat> = {
  'Peg-out status counts': {
    isUnsafe: hasUnsafeStatusCountPair,
    message: 'must use safe integer status=count pairs',
  },
  'Pending reconciliation rows': {
    isUnsafe: isUnsafeNonNegativeIntegerText,
    message: 'must be a safe integer row count',
  },
  'DUP AVL history count': {
    isUnsafe: isUnsafeNonNegativeIntegerText,
    message: 'must be a safe integer history count',
  },
  'SPV tracker history count': {
    isUnsafe: isUnsafeNonNegativeIntegerText,
    message: 'must be a safe integer history count',
  },
  'Persisted anchor heights': {
    isUnsafe: hasUnsafeAnchorHeightList,
    message: 'must be safe integer anchor heights or none',
  },
  'Pending DUP heartbeats': {
    isUnsafe: isUnsafeNonNegativeIntegerText,
    message: 'must be a safe integer heartbeat count',
  },
};

export const REQUIRED_BACKUP_RESTORE_BOUNDARIES = [
  'SQLite backup is local operator state, not consensus',
  'WAL and SHM are restored as matched set when present',
  'AVL histories are reconstructed from committed rows',
  'Digest mismatch triggers incident response',
  'Evidence excludes secrets and runtime databases',
];
const REQUIRED_BOUNDARIES = REQUIRED_BACKUP_RESTORE_BOUNDARIES;

export const REQUIRED_BACKUP_RESTORE_STOP_CONDITIONS = [
  'Daemon was running during backup without WAL files',
  'Restored DUP or SPV digest mismatches chain singleton',
  'Pending settlement may already have paid recipient',
  'Runtime backup files appear in git status',
  'Manual SQLite edit is proposed before chain-state classification',
];
const REQUIRED_STOP_CONDITIONS = REQUIRED_BACKUP_RESTORE_STOP_CONDITIONS;

const REQUIRED_STOP_CONDITION_RESOLUTION_FOCUS: Record<string, EvidenceFocus[]> = {
  'Daemon was running during backup without WAL files': [
    { pattern: /daemon/i, message: 'daemon state' },
    { pattern: /WAL/i, message: 'missing WAL handling' },
  ],
  'Restored DUP or SPV digest mismatches chain singleton': [
    { pattern: /\b(DUP|SPV)\b/i, message: 'DUP or SPV digest scope' },
    { pattern: /digest/i, message: 'digest mismatch evidence' },
    { pattern: /mismatch/i, message: 'mismatch classification' },
    { pattern: /singleton/i, message: 'chain singleton comparison' },
  ],
  'Pending settlement may already have paid recipient': [
    { pattern: /pending/i, message: 'pending settlement state' },
    { pattern: /settlement/i, message: 'settlement scope' },
    { pattern: /(paid|recipient)/i, message: 'paid-recipient risk' },
  ],
  'Runtime backup files appear in git status': [
    { pattern: /runtime/i, message: 'runtime backup files' },
    { pattern: /backup/i, message: 'backup artifact scope' },
    { pattern: /git[- ]status|git/i, message: 'git status evidence' },
  ],
  'Manual SQLite edit is proposed before chain-state classification': [
    { pattern: /manual/i, message: 'manual edit proposal' },
    { pattern: /SQLite/i, message: 'SQLite edit scope' },
    { pattern: /chain[- ]state/i, message: 'chain-state classification' },
    { pattern: /classification/i, message: 'classification requirement' },
  ],
};

export const REQUIRED_BACKUP_RESTORE_REVIEWER_ROLES = [
  'Restore operator',
  'Security reviewer',
  'Operator reviewer',
];
const REQUIRED_REVIEWER_ROLES = REQUIRED_BACKUP_RESTORE_REVIEWER_ROLES;

const REQUIRED_PUBLICATION_EVIDENCE_FIELDS = [
  'Release notes updated',
  'Required release-note updates',
  'Pending Evidence Register updated',
  'Required checklist updates',
  'Production-ready claim allowed by this drill',
  'Testnet production-candidate claim allowed by this drill',
];
const EXACT_PRODUCTION_READY_CLAIM_DENIAL_BY_DRILL =
  'Production-ready claim allowed by this drill: no';
const EXACT_TESTNET_PRODUCTION_CANDIDATE_CLAIM_DENIAL_BY_DRILL =
  'Testnet production-candidate claim allowed by this drill: no';

const ALLOWED_STATUSES = new Set<BackupRestoreEvidenceStatus>(['pending', 'linked', 'blocker']);
const ALLOWED_RELEASE_LEVELS = new Set([
  'validated PoC',
  'institutional reference',
  'production deployment candidate',
]);
const ALLOWED_ENVIRONMENTS = new Set([
  'local offline',
  'local devnet',
  'patched devnet',
  'testnet',
  'staging',
]);
const ALLOWED_BROADCAST_MODES = new Set(['disabled', 'dry-run']);
const ALLOWED_REVIEWER_DECISIONS = new Set<ReviewerDecision>(['approve', 'block']);
const REVIEWER_APPROVAL_VERB_PATTERN =
  '(?:accepted|accepts|accept|approved|approves|approve|allowed|allows|allow|enabled|enables|enable|supported|supports|support|permitted|permits|permit|cleared|clears|clear|granted|grants|grant|authori[sz]ed|authori[sz]es|authori[sz]e|certified|certifies|certify|endorsed|endorses|endorse|recommended|recommends|recommend|accredited|accredits|accredit)';
const REVIEWER_LOCAL_CONTEXT = '[^.;|\\r\\n]{0,100}';
const REVIEWER_BLOCKED_CONTEXT_PATTERN = /\b(blocked|forbidden|not allowed|disabled|rejected|refused|no|denied)\b/i;
const APPROVES_PRODUCTION_READY_BACKUP_RESTORE_CLAIM_PATTERN = new RegExp(
  `\\b${REVIEWER_APPROVAL_VERB_PATTERN}\\b${REVIEWER_LOCAL_CONTEXT}\\b(?:production[- ]ready|production\\s+readiness|prod[- ]ready|ready[- ]for[- ]production|mainnet)\\b|` +
    `\\b(?:production[- ]ready|production\\s+readiness|prod[- ]ready|ready[- ]for[- ]production|mainnet)\\b${REVIEWER_LOCAL_CONTEXT}\\b${REVIEWER_APPROVAL_VERB_PATTERN}\\b`,
  'i',
);
const RUNTIME_STATE_MUTATION_SUBJECT_PATTERN =
  '(?:runtime\\s+state\\s+mutation|runtime\\s+database\\s+mutation|mutat(?:e|ed|ion)\\s+runtime\\s+state|manual\\s+sqlite\\s+edit)';
const UNRESOLVED_BACKUP_RESTORE_MISMATCH_STATE_PATTERN =
  '(?:unresolved|open|remaining|outstanding|not\\s+resolved|awaiting|waiting(?:\\s+(?:for|on))?|deferred)';
const UNRESOLVED_BACKUP_RESTORE_MISMATCH_SUBJECT_PATTERN =
  `(?:${UNRESOLVED_BACKUP_RESTORE_MISMATCH_STATE_PATTERN}\\s+(?:backup\\s+restore|restore|state|snapshot|dup|spv|digest)?\\s*mismatch(?:es)?|(?:backup\\s+restore|restore|state|snapshot|dup|spv|digest)?\\s*mismatch(?:es)?\\s+${UNRESOLVED_BACKUP_RESTORE_MISMATCH_STATE_PATTERN})`;
const ACTIONABLE_STOP_CONDITION_PATTERN = /\b(stop|block|fail|disable|pause|incident|do not|refuse|runbook)\b/i;
const RESTORE_TARGET_PATTERN = /\b(isolated|reviewed)\b/i;
const LIVE_OR_RUNTIME_RESTORE_TARGET_PATTERN = /\b(live|runtime|production|relayer database|runtime database)\b/i;
const UNREVIEWED_RESTORE_TARGET_PATTERN = /\b(unreviewed|not reviewed|without review|no review)\b/i;

const REQUIRED_BOUNDARY_EVIDENCE_FOCUS: Record<string, EvidenceFocus[]> = {
  'SQLite backup is local operator state, not consensus': [
    { pattern: /SQLite|backup/i, message: 'SQLite backup scope' },
    { pattern: /local[- ]operator[- ]state/i, message: 'local operator state classification' },
    { pattern: /not[- ]consensus|non[- ]consensus/i, message: 'not-consensus classification' },
  ],
  'WAL and SHM are restored as matched set when present': [
    { pattern: /WAL/i, message: 'WAL handling' },
    { pattern: /SHM/i, message: 'SHM handling' },
    { pattern: /matched[- ]set|matched set|when present/i, message: 'matched-set handling when present' },
  ],
  'AVL histories are reconstructed from committed rows': [
    { pattern: /AVL/i, message: 'AVL history handling' },
    { pattern: /committed[- ]rows/i, message: 'committed-row source' },
    { pattern: /\b(reconstruct|reconstructed|rebuild|rebuilt)\b/i, message: 'reconstruction action' },
  ],
  'Digest mismatch triggers incident response': [
    { pattern: /digest/i, message: 'digest comparison' },
    { pattern: /mismatch/i, message: 'mismatch classification' },
    { pattern: /incident/i, message: 'incident response' },
  ],
  'Evidence excludes secrets and runtime databases': [
    { pattern: /\b(exclude|excludes|excluded|hygiene|redact|redacted)\b/i, message: 'exclusion or hygiene action' },
    { pattern: /secrets?|\.env|mnemonic|private/i, message: 'secret-material exclusion' },
    { pattern: /runtime[- ]databases?|SQLite|WAL|SHM/i, message: 'runtime-database exclusion' },
  ],
};

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

export function parseRecoveryCommandRows(markdown: string): RecoveryCommandRow[] {
  return parseTableBetween(markdown, '## Required Commands', '## State Consistency Checks').map(row => {
    if (row.length !== 3) throw new Error(`Malformed Required Commands row: ${row.join(' | ')}`);
    return {
      step: row[0],
      requiredEvidence: row[1],
      status: row[2],
    };
  });
}

export function validateBackupRestoreEvidence(markdown: string): BackupRestoreEvidenceValidation {
  const commands = parseRowsSafely(() => parseRecoveryCommandRows(markdown));
  const stateChecks = parseRowsSafely(() => parseStateConsistencyRows(markdown));
  const boundaries = parseRowsSafely(() => parseBoundaryRows(markdown));
  const stopConditions = parseRowsSafely(() => parseStopConditionRows(markdown));
  const reviewers = parseRowsSafely(() => parseReviewerRows(markdown));
  const classification = parseBackupRestoreClassification(markdown);
  const publicationEvidence = parseBackupRestorePublicationEvidence(markdown);
  const commandRows = commands.rows;
  const stateRows = stateChecks.rows;
  const boundaryRows = boundaries.rows;
  const stopConditionRows = stopConditions.rows;
  const reviewerRows = reviewers.rows;
  const snapshotProvenance = parseSnapshotProvenance(commandRows);
  const errors = [
    ...validateEvidenceHygiene(markdown, 'Backup Restore Evidence'),
    ...validateRequiredSections(markdown),
    ...validateClassification(markdown),
    ...commands.errors,
    ...stateChecks.errors,
    ...boundaries.errors,
    ...stopConditions.errors,
    ...reviewers.errors,
    ...validateCommandRows(commandRows),
    ...validateStateRows(stateRows),
    ...validateBoundaryRows(boundaryRows),
    ...validateStopConditionRows(stopConditionRows),
    ...validatePublicationEvidence(markdown),
    ...validateReviewerRows(reviewerRows),
    ...validateReviewerIdentityConsistency(markdown, reviewerRows),
    ...validateReviewerDateConsistency(markdown, reviewerRows),
  ];

  if (errors.length > 0) {
    return {
      status: 'BLOCKED',
      classification,
      commandRows,
      stateRows,
      boundaryRows,
      stopConditionRows,
      publicationEvidence,
      snapshotProvenance,
      reviewerRows,
      errors,
      message: `Backup-restore evidence BLOCKED: ${errors.length} structural issue(s).`,
    };
  }

  return {
    status: 'PASS',
    classification,
    commandRows,
    stateRows,
    boundaryRows,
    stopConditionRows,
    publicationEvidence,
    snapshotProvenance,
    reviewerRows,
    errors: [],
    message: `Backup-restore evidence PASS: ${stateRows.length} state consistency rows are linked.`,
  };
}

function parseBackupRestoreClassification(markdown: string): BackupRestoreClassificationFields {
  const fields = parseTwoColumnTable(sectionBetween(markdown, '## Drill Classification', '## Required Commands'));
  return {
    drillName: fields.get('Drill name'),
    gitCommit: fields.get('Git commit'),
    releaseLevel: fields.get('Release level'),
    environment: fields.get('Environment'),
    broadcastMode: fields.get('Broadcast mode'),
    sourceState: fields.get('Source state'),
    restoreTarget: fields.get('Restore target'),
    reviewer: fields.get('Reviewer'),
    date: fields.get('Date'),
  };
}

function parseBackupRestorePublicationEvidence(markdown: string): BackupRestorePublicationEvidenceFields {
  const fields = parseListFields(sectionBetween(markdown, '## Publication Evidence', '## Reviewer Sign-Off'));
  return {
    releaseNotesUpdated: fields.get('Release notes updated'),
    requiredReleaseNoteUpdates: fields.get('Required release-note updates'),
    pendingEvidenceRegisterUpdated: fields.get('Pending Evidence Register updated'),
    requiredChecklistUpdates: fields.get('Required checklist updates'),
    productionReadyClaimAllowed: fields.get('Production-ready claim allowed by this drill'),
    testnetProductionCandidateClaimAllowed: fields.get('Testnet production-candidate claim allowed by this drill'),
  };
}

function parseSnapshotProvenance(commandRows: RecoveryCommandRow[]): BackupRestoreSnapshotProvenance {
  const compareEvidence = commandRows.find(row => row.step === 'Compare pre-backup and restored state')?.requiredEvidence ?? '';
  const targets = extractCompletedEvidenceTargets(compareEvidence).map(normalizeCompletedEvidenceTarget);
  const preBackupSnapshotTarget = targets.find(target => /pre[-_ ]?backup[^/\\\s]*\.json$/i.test(target));
  const restoredSnapshotTarget = targets.find(target => /restored[^/\\\s]*\.json$/i.test(target));
  const comparisonOutputTarget = targets.find(target =>
    target !== preBackupSnapshotTarget &&
    target !== restoredSnapshotTarget &&
    /\b(?:backup[-_ ]?compare|compare|comparison)\b/i.test(target)
  );

  return {
    preBackupSnapshotTarget,
    restoredSnapshotTarget,
    comparisonOutputTarget,
    restoredGeneratedAfterPreBackup:
      /restored[^|\n;]*generatedAt[^|\n;]*after[^|\n;]*pre[- ]?backup|generatedAt[^|\n;]*restored[^|\n;]*after[^|\n;]*pre[- ]?backup/i
        .test(compareEvidence),
    schemaVersionObserved: /\bschemaVersion\b/i.test(compareEvidence),
    snapshotSchemaVersionsObserved: /\bsnapshotSchemaVersions\b/i.test(compareEvidence),
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

function parseStateConsistencyRows(markdown: string): StateConsistencyRow[] {
  return parseTableBetween(markdown, '## State Consistency Checks', '## Reconstructibility Boundaries').map(row => {
    if (row.length !== 5) throw new Error(`Malformed State Consistency Checks row: ${row.join(' | ')}`);
    return {
      check: row[0],
      preBackupValue: row[1],
      restoredValue: row[2],
      evidence: row[3],
      status: row[4],
    };
  });
}

function parseBoundaryRows(markdown: string): ReconstructibilityBoundaryRow[] {
  return parseTableBetween(markdown, '## Reconstructibility Boundaries', '## Stop Conditions').map(row => {
    if (row.length !== 3) throw new Error(`Malformed Reconstructibility Boundaries row: ${row.join(' | ')}`);
    return {
      boundary: row[0],
      requiredEvidence: row[1],
      status: row[2],
    };
  });
}

function parseStopConditionRows(markdown: string): StopConditionRow[] {
  return parseTableBetween(markdown, '## Stop Conditions', '## Publication Evidence').map(row => {
    if (row.length !== 3) throw new Error(`Malformed Stop Conditions row: ${row.join(' | ')}`);
    return {
      stopCondition: row[0],
      requiredResolution: row[1],
      status: row[2],
    };
  });
}

function parseReviewerRows(markdown: string): ReviewerSignoffRow[] {
  return parseTableBetween(markdown, '## Reviewer Sign-Off').map(row => {
    if (row.length !== 5) throw new Error(`Malformed Reviewer Sign-Off row: ${row.join(' | ')}`);
    return { role: row[0], name: row[1], decision: row[2], date: row[3], notes: row[4] };
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
  const section = sectionBetween(markdown, '## Drill Classification', '## Required Commands');
  const fields = parseTwoColumnTable(section);
  const errors = validateDuplicateRequiredFields(
    'Drill Classification',
    parseTwoColumnFieldNames(section),
    REQUIRED_CLASSIFICATION_FIELDS,
  );

  for (const field of REQUIRED_CLASSIFICATION_FIELDS) {
    if (isBlank(fields.get(field) ?? '')) errors.push(`Drill Classification: ${field} is required`);
  }

  validateAllowedField(errors, fields, 'Drill Classification', 'Release level', ALLOWED_RELEASE_LEVELS);
  validateAllowedField(errors, fields, 'Drill Classification', 'Environment', ALLOWED_ENVIRONMENTS);
  validateAllowedField(errors, fields, 'Drill Classification', 'Broadcast mode', ALLOWED_BROADCAST_MODES);
  validateGitCommitField(errors, fields, 'Drill Classification', 'Git commit');
  validateIsoDateField(errors, fields, 'Drill Classification', 'Date');
  if (fields.get('Release level') === 'production deployment candidate' && fields.get('Environment') !== 'testnet') {
    errors.push('Drill Classification: production deployment candidate requires Environment testnet');
  }
  const restoreTarget = fields.get('Restore target') ?? '';
  if (
    !isBlank(restoreTarget) &&
    (!RESTORE_TARGET_PATTERN.test(restoreTarget) || UNREVIEWED_RESTORE_TARGET_PATTERN.test(restoreTarget))
  ) {
    errors.push('Drill Classification: Restore target must state isolated or reviewed target');
  }
  if (!isBlank(restoreTarget) && /reviewed/i.test(restoreTarget) && !/isolated/i.test(restoreTarget)) {
    if (!hasEvidenceMarker(restoreTarget)) {
      errors.push('Drill Classification: reviewed restore target must include reviewer approval evidence');
    } else if (!hasCompletedEvidenceMarker(restoreTarget)) {
      errors.push(
        'Drill Classification: reviewed restore target must include completed reviewer approval evidence target, a non-template evidence link, or an artifact marker',
      );
    }
    if (!/reviewer approval/i.test(restoreTarget)) {
      errors.push('Drill Classification: reviewed restore target must mention reviewer approval');
    }
    if (!/rollback plan/i.test(restoreTarget)) {
      errors.push('Drill Classification: reviewed restore target must mention rollback plan');
    }
  }
  if (!isBlank(restoreTarget) && LIVE_OR_RUNTIME_RESTORE_TARGET_PATTERN.test(restoreTarget)) {
    if (!hasEvidenceMarker(restoreTarget)) {
      errors.push('Drill Classification: live or runtime restore target must include reviewer approval evidence');
    } else if (!hasCompletedEvidenceMarker(restoreTarget)) {
      errors.push(
        'Drill Classification: live or runtime restore target must include completed reviewer approval evidence target, a non-template evidence link, or an artifact marker',
      );
    }
    if (!/reviewer approval/i.test(restoreTarget)) {
      errors.push('Drill Classification: live or runtime restore target must mention reviewer approval');
    }
    if (!/rollback plan/i.test(restoreTarget)) {
      errors.push('Drill Classification: live or runtime restore target must mention rollback plan');
    }
  }

  return errors;
}

function validateCommandRows(rows: RecoveryCommandRow[]): string[] {
  const errors = validateRequiredNames('Required Commands', rows.map(row => row.step), REQUIRED_COMMAND_STEPS);

  for (const row of rows) {
    if (!REQUIRED_COMMAND_STEPS.includes(row.step)) {
      errors.push(`Required Commands: ${row.step}: unexpected step`);
    }
    validateLinkedStatus(errors, 'Required Commands', row.step, row.status);
    if (isBlank(row.requiredEvidence)) {
      errors.push(`Required Commands: ${row.step}: required evidence is required`);
    }
    if (row.status === 'linked' && !hasEvidenceMarker(row.requiredEvidence)) {
      errors.push(`Required Commands: ${row.step}: linked status requires an evidence marker`);
    }
    if (row.status === 'linked' && !hasCompletedBackupRestoreRowEvidenceMarker(row.requiredEvidence)) {
      errors.push(
        `Required Commands: ${row.step}: linked status requires completed command-output target, a non-template evidence link, or an artifact marker`,
      );
    }
    if (row.status === 'linked' && hasContradictoryBackupRestoreEvidenceMarker(row.requiredEvidence)) {
      errors.push(
        `Required Commands: ${row.step}: required evidence must not include contradictory backup-restore failure markers`,
      );
    }
    if (row.status === 'linked') {
      for (const marker of REQUIRED_COMMAND_EVIDENCE_FOCUS[row.step] ?? []) {
        if (!marker.pattern.test(row.requiredEvidence.trim())) {
          errors.push(`Required Commands: ${row.step}: required evidence ${marker.message}`);
        }
      }
    }
  }

  return errors;
}

export function hasCompletedBackupRestoreCommandEvidence(step: string, evidence: string): boolean {
  const focus = REQUIRED_COMMAND_EVIDENCE_FOCUS[step];
  return (
    Array.isArray(focus) &&
    !isGenericBackupRestoreRowPayload(evidence) &&
    hasNoContradictoryBackupRestoreEvidenceMarker(evidence) &&
    hasCompletedBackupRestoreRowEvidenceMarker(evidence) &&
    focus.every(marker => marker.pattern.test(evidence.trim()))
  );
}

function validateStateRows(rows: StateConsistencyRow[]): string[] {
  const errors = validateRequiredNames('State Consistency Checks', rows.map(row => row.check), REQUIRED_STATE_CHECKS);

  for (const row of rows) {
    if (!REQUIRED_STATE_CHECKS.includes(row.check)) {
      errors.push(`State Consistency Checks: ${row.check}: unexpected check`);
    }
    validateLinkedStatus(errors, 'State Consistency Checks', row.check, row.status);
    for (const [label, value] of [
      ['Pre-backup value', row.preBackupValue],
      ['Restored value', row.restoredValue],
      ['Evidence', row.evidence],
    ] as const) {
      if (isBlank(value)) errors.push(`State Consistency Checks: ${row.check}: ${label} is required`);
    }
    if (row.status === 'linked' && !hasEvidenceMarker(row.evidence)) {
      errors.push(`State Consistency Checks: ${row.check}: linked status requires an evidence marker`);
    }
    if (row.status === 'linked' && !hasCompletedBackupRestoreRowEvidenceMarker(row.evidence)) {
      errors.push(
        `State Consistency Checks: ${row.check}: linked status requires completed state evidence target, a non-template evidence link, or an artifact marker`,
      );
    }
    if (row.status === 'linked' && hasContradictoryBackupRestoreEvidenceMarker(row.evidence)) {
      errors.push(
        `State Consistency Checks: ${row.check}: evidence must not include contradictory backup-restore failure markers`,
      );
    }
    if (row.status === 'linked') {
      for (const marker of REQUIRED_STATE_EVIDENCE_FOCUS[row.check] ?? []) {
        if (!marker.pattern.test(row.evidence.trim())) {
          errors.push(`State Consistency Checks: ${row.check}: evidence ${marker.message}`);
        }
      }
    }
    if (row.status === 'linked' && BACKUP_COMPARE_STATE_CHECKS.has(row.check)) {
      if (!identifiesBackupCompareEvidence(row.evidence)) {
        errors.push(
          `State Consistency Checks: ${row.check}: evidence must identify backup:compare local snapshot comparison output`,
        );
      }
    }
    if (
      row.status === 'linked' &&
      !isBlank(row.preBackupValue) &&
      !isBlank(row.restoredValue) &&
      (!containsMeasuredValue(row.evidence, row.preBackupValue) ||
        !containsMeasuredValue(row.evidence, row.restoredValue))
    ) {
      errors.push(
        `State Consistency Checks: ${row.check}: evidence must cite the measured pre-backup/restored value`,
      );
    }
    if (
      row.status === 'linked' &&
      !isBlank(row.preBackupValue) &&
      !isBlank(row.restoredValue) &&
      row.preBackupValue !== row.restoredValue
    ) {
      errors.push(`State Consistency Checks: ${row.check}: restored value must match pre-backup value`);
    }
    if (row.status === 'linked') {
      const valueFormat = REQUIRED_STATE_VALUE_FORMATS[row.check];
      const safeIntegerFormat = REQUIRED_STATE_SAFE_INTEGER_FORMATS[row.check];
      if (valueFormat) {
        for (const [label, value] of [
          ['Pre-backup value', row.preBackupValue],
          ['Restored value', row.restoredValue],
        ] as const) {
          if (!isBlank(value) && !valueFormat.pattern.test(value.trim())) {
            errors.push(`State Consistency Checks: ${row.check}: ${label} ${valueFormat.message}`);
          }
          if (
            !isBlank(value) &&
            valueFormat.pattern.test(value.trim()) &&
            safeIntegerFormat?.isUnsafe(value.trim())
          ) {
            errors.push(`State Consistency Checks: ${row.check}: ${label} ${safeIntegerFormat.message}`);
          }
        }
      }
    }
  }

  return errors;
}

export function hasCompletedBackupRestoreStateEvidence(
  check: string,
  preBackupValue: string,
  restoredValue: string,
  evidence: string,
): boolean {
  const focus = REQUIRED_STATE_EVIDENCE_FOCUS[check];
  const valueFormat = REQUIRED_STATE_VALUE_FORMATS[check];
  return (
    Array.isArray(focus) &&
    !isGenericBackupRestoreRowPayload(evidence) &&
    hasNoContradictoryBackupRestoreEvidenceMarker(evidence) &&
    hasCompletedBackupRestoreRowEvidenceMarker(evidence) &&
    focus.every(marker => marker.pattern.test(evidence.trim())) &&
    (!BACKUP_COMPARE_STATE_CHECKS.has(check) || identifiesBackupCompareEvidence(evidence)) &&
    containsMeasuredValue(evidence, preBackupValue) &&
    containsMeasuredValue(evidence, restoredValue) &&
    (!valueFormat ||
      (valueFormat.pattern.test(preBackupValue.trim()) && valueFormat.pattern.test(restoredValue.trim()))) &&
    hasSafeIntegerStateValues(check, preBackupValue, restoredValue)
  );
}

function validateBoundaryRows(rows: ReconstructibilityBoundaryRow[]): string[] {
  const errors = validateRequiredNames('Reconstructibility Boundaries', rows.map(row => row.boundary), REQUIRED_BOUNDARIES);

  for (const row of rows) {
    if (!REQUIRED_BOUNDARIES.includes(row.boundary)) {
      errors.push(`Reconstructibility Boundaries: ${row.boundary}: unexpected boundary`);
    }
    validateLinkedStatus(errors, 'Reconstructibility Boundaries', row.boundary, row.status);
    if (isBlank(row.requiredEvidence)) {
      errors.push(`Reconstructibility Boundaries: ${row.boundary}: required evidence is required`);
    }
    if (row.status === 'linked' && !hasEvidenceMarker(row.requiredEvidence)) {
      errors.push(`Reconstructibility Boundaries: ${row.boundary}: linked status requires an evidence marker`);
    }
    if (row.status === 'linked' && !hasCompletedBackupRestoreRowEvidenceMarker(row.requiredEvidence)) {
      errors.push(
        `Reconstructibility Boundaries: ${row.boundary}: linked status requires completed boundary evidence target, a non-template evidence link, or an artifact marker`,
      );
    }
    if (row.status === 'linked' && hasContradictoryBackupRestoreEvidenceMarker(row.requiredEvidence)) {
      errors.push(
        `Reconstructibility Boundaries: ${row.boundary}: required evidence must not include contradictory backup-restore failure markers`,
      );
    }
    if (row.status === 'linked') {
      for (const marker of REQUIRED_BOUNDARY_EVIDENCE_FOCUS[row.boundary] ?? []) {
        if (!marker.pattern.test(row.requiredEvidence.trim())) {
          errors.push(
            `Reconstructibility Boundaries: ${row.boundary}: required evidence must mention ${marker.message}`,
          );
        }
      }
    }
  }

  return errors;
}

export function hasCompletedBackupRestoreBoundaryEvidence(boundary: string, evidence: string): boolean {
  const focus = REQUIRED_BOUNDARY_EVIDENCE_FOCUS[boundary];
  return (
    Array.isArray(focus) &&
    !isGenericBackupRestoreRowPayload(evidence) &&
    hasNoContradictoryBackupRestoreEvidenceMarker(evidence) &&
    hasCompletedBackupRestoreRowEvidenceMarker(evidence) &&
    focus.every(marker => marker.pattern.test(evidence.trim()))
  );
}

function validateStopConditionRows(rows: StopConditionRow[]): string[] {
  const errors = validateRequiredNames('Stop Conditions', rows.map(row => row.stopCondition), REQUIRED_STOP_CONDITIONS);

  for (const row of rows) {
    if (!REQUIRED_STOP_CONDITIONS.includes(row.stopCondition)) {
      errors.push(`Stop Conditions: ${row.stopCondition}: unexpected stop condition`);
    }
    validateLinkedStatus(errors, 'Stop Conditions', row.stopCondition, row.status);
    if (isBlank(row.requiredResolution)) {
      errors.push(`Stop Conditions: ${row.stopCondition}: required resolution is required`);
    }
    if (row.status === 'linked' && !hasEvidenceMarker(row.requiredResolution)) {
      errors.push(`Stop Conditions: ${row.stopCondition}: linked status requires an evidence marker`);
    }
    if (row.status === 'linked' && !hasCompletedBackupRestoreRowEvidenceMarker(row.requiredResolution)) {
      errors.push(
        `Stop Conditions: ${row.stopCondition}: linked status requires completed stop-condition evidence target, a non-template evidence link, or an artifact marker`,
      );
    }
    if (row.status === 'linked' && hasContradictoryBackupRestoreEvidenceMarker(row.requiredResolution)) {
      errors.push(
        `Stop Conditions: ${row.stopCondition}: required resolution must not include contradictory backup-restore failure markers`,
      );
    }
    if (
      row.status === 'linked' &&
      !isBlank(row.requiredResolution) &&
      !ACTIONABLE_STOP_CONDITION_PATTERN.test(row.requiredResolution)
    ) {
      errors.push(`Stop Conditions: ${row.stopCondition}: linked status requires an actionable stop resolution`);
    }
    if (row.status === 'linked') {
      for (const marker of REQUIRED_STOP_CONDITION_RESOLUTION_FOCUS[row.stopCondition] ?? []) {
        if (!marker.pattern.test(row.requiredResolution.trim())) {
          errors.push(`Stop Conditions: ${row.stopCondition}: required resolution must mention ${marker.message}`);
        }
      }
    }
  }

  return errors;
}

export function hasCompletedBackupRestoreStopConditionResolution(
  stopCondition: string,
  resolution: string,
): boolean {
  const focus = REQUIRED_STOP_CONDITION_RESOLUTION_FOCUS[stopCondition];
  return (
    Array.isArray(focus) &&
    !isGenericBackupRestoreRowPayload(resolution) &&
    hasNoContradictoryBackupRestoreEvidenceMarker(resolution) &&
    hasCompletedBackupRestoreRowEvidenceMarker(resolution) &&
    ACTIONABLE_STOP_CONDITION_PATTERN.test(resolution) &&
    focus.every(marker => marker.pattern.test(resolution.trim()))
  );
}

function validatePublicationEvidence(markdown: string): string[] {
  const section = sectionBetween(markdown, '## Publication Evidence', '## Reviewer Sign-Off');
  const fields = parseListFields(section);
  const errors = validateDuplicateRequiredListFields(
    'Publication Evidence',
    section,
    REQUIRED_PUBLICATION_EVIDENCE_FIELDS,
  );

  for (const field of REQUIRED_PUBLICATION_EVIDENCE_FIELDS) {
    if (isBlank(fields.get(field) ?? '')) errors.push(`Publication Evidence: ${field} is required`);
  }

  const releaseNotesUpdated = fields.get('Release notes updated') ?? '';
  if (!isBlank(releaseNotesUpdated) && releaseNotesUpdated !== 'yes') {
    errors.push('Publication Evidence: Release notes updated must be yes before backup-restore evidence can pass');
  }

  const registerUpdated = fields.get('Pending Evidence Register updated') ?? '';
  if (!isBlank(registerUpdated) && registerUpdated !== 'yes') {
    errors.push('Publication Evidence: Pending Evidence Register updated must be yes before backup-restore evidence can pass');
  }

  const productionReadyClaim = fields.get('Production-ready claim allowed by this drill') ?? '';
  if (!isBlank(productionReadyClaim) && productionReadyClaim !== 'no') {
    errors.push('Publication Evidence: Production-ready claim allowed by this drill must be no');
  }

  const testnetCandidateClaim = fields.get('Testnet production-candidate claim allowed by this drill') ?? '';
  if (!isBlank(testnetCandidateClaim) && testnetCandidateClaim !== 'no') {
    errors.push('Publication Evidence: Testnet production-candidate claim allowed by this drill must be no');
  }

  const releaseNoteUpdates = fields.get('Required release-note updates') ?? '';
  if (!identifiesBackupRestorePublicationEvidenceKind(
    releaseNoteUpdates,
    'completed Gate 3 backup-restore release-note update evidence',
  )) {
    errors.push(
      'Publication Evidence: Required release-note updates must include completed Gate 3 backup-restore release-note update evidence',
    );
  }
  if (!isBlank(releaseNoteUpdates) && !hasCompletedBackupRestoreRowEvidenceMarker(releaseNoteUpdates)) {
    errors.push(
      'Publication Evidence: Required release-note updates requires completed release-note update evidence target, a non-template evidence link, or an artifact marker',
    );
  }
  if (!isBlank(releaseNoteUpdates) && hasContradictoryBackupRestoreEvidenceMarker(releaseNoteUpdates)) {
    errors.push('Publication Evidence: Required release-note updates must not include contradictory backup-restore failure markers');
  }
  if (!isBlank(releaseNoteUpdates) && hasContradictoryBackupRestoreClaimDecisionBinding(releaseNoteUpdates)) {
    errors.push('Publication Evidence: Required release-note updates must not include contradictory backup-restore claim decision bindings');
  }
  if (!isBlank(releaseNoteUpdates) && containsMainnetProductionClaim(releaseNoteUpdates)) {
    errors.push('Publication Evidence: Required release-note updates must not contain mainnet production claim wording');
  }
  if (!isBlank(releaseNoteUpdates) && containsProductionReadyClaim(stripBackupRestoreExactClaimDenials(releaseNoteUpdates))) {
    errors.push('Publication Evidence: Required release-note updates must not contain production-ready claim wording');
  }
  errors.push(...validateBackupRestorePublicationUpdateClaimDenials(
    'Required release-note updates',
    releaseNoteUpdates,
  ));

  const checklistUpdates = fields.get('Required checklist updates') ?? '';
  if (!identifiesBackupRestorePublicationEvidenceKind(
    checklistUpdates,
    'completed Gate 3 backup-restore checklist update evidence',
  )) {
    errors.push(
      'Publication Evidence: Required checklist updates must include completed Gate 3 backup-restore checklist update evidence',
    );
  }
  if (!isBlank(checklistUpdates) && !hasCompletedBackupRestoreRowEvidenceMarker(checklistUpdates)) {
    errors.push(
      'Publication Evidence: Required checklist updates requires completed checklist update evidence target, a non-template evidence link, or an artifact marker',
    );
  }
  if (!isBlank(checklistUpdates) && hasContradictoryBackupRestoreEvidenceMarker(checklistUpdates)) {
    errors.push('Publication Evidence: Required checklist updates must not include contradictory backup-restore failure markers');
  }
  if (!isBlank(checklistUpdates) && hasContradictoryBackupRestoreClaimDecisionBinding(checklistUpdates)) {
    errors.push('Publication Evidence: Required checklist updates must not include contradictory backup-restore claim decision bindings');
  }
  if (!isBlank(checklistUpdates) && containsMainnetProductionClaim(checklistUpdates)) {
    errors.push('Publication Evidence: Required checklist updates must not contain mainnet production claim wording');
  }
  if (!isBlank(checklistUpdates) && containsProductionReadyClaim(stripBackupRestoreExactClaimDenials(checklistUpdates))) {
    errors.push('Publication Evidence: Required checklist updates must not contain production-ready claim wording');
  }
  errors.push(...validateBackupRestorePublicationUpdateClaimDenials(
    'Required checklist updates',
    checklistUpdates,
  ));
  if (
    !isBlank(releaseNoteUpdates) &&
    !isBlank(checklistUpdates) &&
    hasSharedCompletedEvidenceTarget(releaseNoteUpdates, checklistUpdates)
  ) {
    errors.push(
      'Publication Evidence: Required release-note and checklist updates must use distinct completed Gate 3 backup-restore publication evidence targets',
    );
  }

  return errors;
}

function validateBackupRestorePublicationUpdateClaimDenials(label: string, value: string): string[] {
  if (isBlank(value)) return [];
  const errors: string[] = [];
  if (!hasExactProductionReadyClaimDenialByDrill(value)) {
    errors.push(
      `Publication Evidence: ${label} must use exact ${EXACT_PRODUCTION_READY_CLAIM_DENIAL_BY_DRILL}`,
    );
  }
  if (!hasExactTestnetProductionCandidateClaimDenialByDrill(value)) {
    errors.push(
      `Publication Evidence: ${label} must use exact ${EXACT_TESTNET_PRODUCTION_CANDIDATE_CLAIM_DENIAL_BY_DRILL}`,
    );
  }
  return errors;
}

function stripBackupRestoreExactClaimDenials(value: string): string {
  return value
    .replace(/\bproduction-ready claim allowed by this drill:\s*no\s*(?=$|[.;,|)\]\r\n])/ig, '')
    .replace(/\btestnet production-candidate claim allowed by this drill:\s*no\s*(?=$|[.;,|)\]\r\n])/ig, '');
}

function hasExactProductionReadyClaimDenialByDrill(value: string): boolean {
  return /\bproduction-ready claim allowed by this drill:\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactTestnetProductionCandidateClaimDenialByDrill(value: string): boolean {
  return /\btestnet production-candidate claim allowed by this drill:\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

export function hasCompletedBackupRestoreReleaseNoteUpdateEvidence(value: string): boolean {
  return (
    !isGenericBackupRestoreRowPayload(value) &&
    hasNoContradictoryBackupRestoreEvidenceMarker(value) &&
    !hasContradictoryBackupRestoreClaimDecisionBinding(value) &&
    hasCompletedBackupRestoreRowEvidenceMarker(value) &&
    identifiesBackupRestorePublicationEvidenceKind(
      value,
      'completed Gate 3 backup-restore release-note update evidence',
    )
  );
}

export function hasCompletedBackupRestoreChecklistUpdateEvidence(value: string): boolean {
  return (
    !isGenericBackupRestoreRowPayload(value) &&
    hasNoContradictoryBackupRestoreEvidenceMarker(value) &&
    !hasContradictoryBackupRestoreClaimDecisionBinding(value) &&
    hasCompletedBackupRestoreRowEvidenceMarker(value) &&
    identifiesBackupRestorePublicationEvidenceKind(
      value,
      'completed Gate 3 backup-restore checklist update evidence',
    )
  );
}

function validateReviewerRows(rows: ReviewerSignoffRow[]): string[] {
  const errors = validateRequiredNames('Reviewer Sign-Off', rows.map(row => row.role), REQUIRED_REVIEWER_ROLES);

  for (const row of rows) {
    if (!REQUIRED_REVIEWER_ROLES.includes(row.role)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: unexpected role`);
    }
    if (isBlank(row.name)) errors.push(`Reviewer Sign-Off: ${row.role}: name is required`);
    if (!ALLOWED_REVIEWER_DECISIONS.has(row.decision as ReviewerDecision)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve or block`);
    } else if (row.decision !== 'approve') {
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve before backup-restore evidence can pass`);
    }
    if (isBlank(row.date)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: Date must use YYYY-MM-DD`);
    }
    if (isBlank(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes are required`);
    } else if (!hasNoContradictoryBackupRestoreEvidenceMarker(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not include contradictory backup-restore failure markers`);
    } else if (hasContradictoryBackupRestoreClaimDecisionBinding(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not include contradictory backup-restore claim decision bindings`);
    } else if (approvesProductionReadyBackupRestoreClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve production-ready claim wording`);
    } else if (containsMainnetProductionClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not contain mainnet production claim wording`);
    } else if (containsProductionReadyClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not contain production-ready claim wording`);
    } else if (approvesRuntimeStateMutation(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve runtime state mutation`);
    } else if (approvesUnreviewedLiveRuntimeRestore(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve unreviewed live/runtime restore target`);
    } else if (approvesStagedRuntimeArtifacts(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve staged runtime backup artifacts`);
    } else if (approvesUnresolvedBackupRestoreMismatch(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve unresolved backup-restore mismatches`);
    } else if (leavesBackupRestoreMismatchesOpen(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not leave unresolved backup-restore mismatches open`);
    } else if (!isActionableReviewerNote(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must state a concrete backup-restore outcome`);
    }
  }

  return errors;
}

export function isActionableBackupRestoreReviewerNote(value: string): boolean {
  return (
    !isGenericBackupRestoreRowPayload(value) &&
    hasNoContradictoryBackupRestoreEvidenceMarker(value) &&
    !hasContradictoryBackupRestoreClaimDecisionBinding(value) &&
    isActionableReviewerNote(value)
  );
}

export function hasNoContradictoryBackupRestoreEvidenceMarker(value: string): boolean {
  return !hasContradictoryBackupRestoreEvidenceMarker(value);
}

function approvesProductionReadyBackupRestoreClaim(value: string): boolean {
  return APPROVES_PRODUCTION_READY_BACKUP_RESTORE_CLAIM_PATTERN.test(value) && !REVIEWER_BLOCKED_CONTEXT_PATTERN.test(value);
}

function containsMainnetProductionClaim(value: string): boolean {
  return classifyPublicationClaimText(value).hasMainnetProductionClaim;
}

function containsProductionReadyClaim(value: string): boolean {
  return classifyPublicationClaimText(value).hasProductionReadyClaim;
}

function approvesRuntimeStateMutation(value: string): boolean {
  return normalizedBackupRestoreReviewerTextSegments(value).some(segment =>
    backupRestoreReviewerTextApprovesSubject(segment, RUNTIME_STATE_MUTATION_SUBJECT_PATTERN),
  );
}

function approvesUnreviewedLiveRuntimeRestore(value: string): boolean {
  const subject =
    '(?:(?:unreviewed|not reviewed|without review|no review)(?:\\s+[a-z0-9]+){0,3}\\s+' +
    '(?:live|runtime|production|relayer database|runtime database)(?:\\s+[a-z0-9]+){0,3}\\s+restore(?:\\s+target)?)';
  return normalizedBackupRestoreReviewerTextSegments(value).some(segment =>
    !REVIEWER_BLOCKED_CONTEXT_PATTERN.test(segment) &&
    backupRestoreReviewerTextApprovesSubject(segment, subject),
  );
}

function approvesStagedRuntimeArtifacts(value: string): boolean {
  const subject =
    '(?:runtime backup files(?:\\s+(?:in|from))?\\s+(?:git status|staged|status)|' +
    'staged(?:\\s+[a-z0-9]+){0,2}\\s+runtime(?:\\s+[a-z0-9]+){0,2}\\s+' +
    '(?:backup|backups|artifact|artifacts|database|sqlite))';
  return normalizedBackupRestoreReviewerTextSegments(value).some(segment =>
    !REVIEWER_BLOCKED_CONTEXT_PATTERN.test(segment) &&
    backupRestoreReviewerTextApprovesSubject(segment, subject),
  );
}

function backupRestoreReviewerTextApprovesSubject(
  normalized: string,
  subject: string,
): boolean {
  const approvalConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,3}';
  const approvalSubjectConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,1}';

  return [
    new RegExp(`\\b${subject}\\b${approvalConnector}\\s+${REVIEWER_APPROVAL_VERB_PATTERN}\\b`, 'gi'),
    new RegExp(`\\b${REVIEWER_APPROVAL_VERB_PATTERN}\\b${approvalSubjectConnector}\\s+${subject}\\b`, 'gi'),
  ].some(pattern => hasUnnegatedBackupRestoreReviewerApproval(normalized, pattern));
}

function hasUnnegatedBackupRestoreReviewerApproval(normalized: string, pattern: RegExp): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 32), index);
    if (!/\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?\s+$/.test(prefix)) return true;
  }
  return false;
}

function normalizedBackupRestoreReviewerTextSegments(value: string): string[] {
  return value
    .split(/[\n\r|;]+|[.]\s+/)
    .map(segment => normalizeEvidenceMarkerText(segment).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(segment => segment.length > 0);
}

function approvesUnresolvedBackupRestoreMismatch(value: string): boolean {
  return normalizedBackupRestoreReviewerTextSegments(value).some(segment =>
    backupRestoreReviewerTextApprovesSubject(segment, UNRESOLVED_BACKUP_RESTORE_MISMATCH_SUBJECT_PATTERN),
  );
}

function leavesBackupRestoreMismatchesOpen(value: string): boolean {
  const subject = UNRESOLVED_BACKUP_RESTORE_MISMATCH_SUBJECT_PATTERN;
  const closedState = '(?:closed|resolved|mitigated)';
  return normalizedBackupRestoreReviewerTextSegments(value).some(segment => {
    if (
      new RegExp(`\\b(?:no|not|never|without)\\s+${subject}\\b`).test(segment) ||
      new RegExp(`\\b(?:absence|lack|lacking)\\s+(?:of\\s+)?${subject}\\b`).test(segment) ||
      new RegExp(`\\bevidence\\s+lacks\\s+${subject}\\b`).test(segment) ||
      new RegExp(`\\b${subject}\\b(?:\\s+[a-z0-9]+){0,4}\\s+not\\s+${REVIEWER_APPROVAL_VERB_PATTERN}\\b`).test(segment) ||
      new RegExp(`\\b${subject}\\b(?:\\s+[a-z0-9]+){0,3}\\s+${closedState}\\b`).test(segment)
    ) {
      return false;
    }
    return new RegExp(`\\b${subject}\\b`).test(segment);
  });
}

function validateReviewerIdentityConsistency(markdown: string, rows: ReviewerSignoffRow[]): string[] {
  const classification = parseTwoColumnTable(
    sectionBetween(markdown, '## Drill Classification', '## Required Commands'),
  );
  const classifiedReviewer = classification.get('Reviewer')?.trim() ?? '';
  const restoreOperatorSignoff = rows.find(row => row.role === 'Restore operator')?.name.trim() ?? '';

  if (
    classifiedReviewer.length > 0 &&
    restoreOperatorSignoff.length > 0 &&
    classifiedReviewer !== restoreOperatorSignoff
  ) {
    return ['Reviewer Sign-Off: Restore operator: name must match Drill Classification Reviewer'];
  }

  return [];
}

function validateReviewerDateConsistency(markdown: string, rows: ReviewerSignoffRow[]): string[] {
  const classification = parseTwoColumnTable(
    sectionBetween(markdown, '## Drill Classification', '## Required Commands'),
  );
  const classificationDate = classification.get('Date')?.trim() ?? '';
  if (!isIsoCalendarDate(classificationDate)) return [];

  return rows
    .filter(row => isIsoCalendarDate(row.date) && row.date < classificationDate)
    .map(row => `Reviewer Sign-Off: ${row.role}: Date must not be before Drill Classification Date`);
}

function validateLinkedStatus(errors: string[], section: string, label: string, status: string): void {
  if (!ALLOWED_STATUSES.has(status as BackupRestoreEvidenceStatus)) {
    errors.push(`${section}: ${label}: status must be pending, linked, or blocker`);
    return;
  }
  if (status !== 'linked') {
    errors.push(`${section}: ${label}: status must be linked before backup-restore evidence can pass`);
  }
}

function hasSafeIntegerStateValues(check: string, ...values: string[]): boolean {
  const safeIntegerFormat = REQUIRED_STATE_SAFE_INTEGER_FORMATS[check];
  if (!safeIntegerFormat) return true;
  return values.every(value => !safeIntegerFormat.isUnsafe(value.trim()));
}

function hasUnsafeStatusCountPair(value: string): boolean {
  return value
    .split(',')
    .map(pair => pair.split('=')[1]?.trim() ?? '')
    .some(isUnsafeNonNegativeIntegerText);
}

function hasUnsafeAnchorHeightList(value: string): boolean {
  if (/^none$/i.test(value.trim())) return false;
  return value.split(',').map(height => height.trim()).some(isUnsafeNonNegativeIntegerText);
}

function isUnsafeNonNegativeIntegerText(value: string): boolean {
  return /^\d+$/.test(value) && !Number.isSafeInteger(Number(value));
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

function parseTableBetween(markdown: string, startHeading: string, endHeading?: string): string[][] {
  const section = sectionBetween(markdown, startHeading, endHeading);
  const firstTableLine = section.search(/^\|/m);
  if (firstTableLine < 0) throw new Error(`${startHeading}: table not found`);
  return parseMarkdownTableRows(section.slice(firstTableLine));
}

function parseTwoColumnFieldNames(section: string): string[] {
  return parseMarkdownTableRows(section)
    .filter(row => row.length >= 2)
    .map(row => row[0]);
}

function parseTwoColumnTable(section: string): Map<string, string> {
  const fields = new Map<string, string>();
  const rows = parseMarkdownTableRows(section);
  for (const row of rows) {
    if (row.length >= 2) fields.set(row[0], row[1]);
  }
  return fields;
}

function parseListFields(section: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const match of section.matchAll(/^- ([^:\n]+):[^\S\r\n]*(.*)$/gm)) {
    fields.set(match[1].trim(), match[2].trim());
  }
  return fields;
}

function validateDuplicateRequiredListFields(
  label: string,
  section: string,
  requiredFields: string[],
): string[] {
  const counts = new Map<string, number>();
  for (const match of section.matchAll(/^- ([^:\n]+):[^\S\r\n]*(.*)$/gm)) {
    const field = match[1].trim();
    counts.set(field, (counts.get(field) ?? 0) + 1);
  }

  const errors: string[] = [];
  for (const field of requiredFields) {
    if ((counts.get(field) ?? 0) > 1) {
      errors.push(`${label}: ${field}: duplicate required field`);
    }
  }
  return errors;
}

function sectionBetween(markdown: string, startHeading: string, endHeading?: string): string {
  const start = markdown.indexOf(startHeading);
  if (start < 0) return '';

  const contentStart = start + startHeading.length;
  const end = endHeading ? markdown.indexOf(endHeading, contentStart) : markdown.length;
  return markdown.slice(contentStart, end < 0 ? markdown.length : end);
}

function hasEvidenceMarker(value: string): boolean {
  return (
    /\[[^\]]+\]\([^)]+\)/.test(value) ||
    /\bnpm run [A-Za-z0-9:_-]+\b/.test(value) ||
    /\bgit status --short\b/.test(value) ||
    /^artifact:\/\//.test(value)
  );
}

function hasCompletedEvidenceMarker(value: string): boolean {
  const completedEvidenceText = backupRestoreCompletedEvidenceText(value);
  return !hasLocalOnlyEvidenceTarget(value) &&
    !hasRuntimeOrEnvironmentBackupRestoreEvidenceTarget(value) &&
    !hasClaimEscalatingBackupRestoreEvidenceReference(value) &&
    extractCompletedEvidenceTargets(completedEvidenceText).some(isCompletedEvidenceTarget);
}

function hasCompletedBackupRestoreRowEvidenceMarker(value: string): boolean {
  return hasCompletedEvidenceMarker(value);
}

function hasSharedCompletedEvidenceTarget(left: string, right: string): boolean {
  const leftTargets = new Set(
    extractCompletedEvidenceTargets(backupRestoreCompletedEvidenceText(left))
      .filter(isCompletedEvidenceTarget)
      .map(normalizeCompletedEvidenceTarget),
  );
  return extractCompletedEvidenceTargets(backupRestoreCompletedEvidenceText(right))
    .filter(isCompletedEvidenceTarget)
    .map(normalizeCompletedEvidenceTarget)
    .some(target => leftTargets.has(target));
}

function identifiesBackupRestorePublicationEvidenceKind(value: string, evidenceKind: string): boolean {
  const normalizedKind = normalizeBackupRestoreEvidenceKind(evidenceKind);
  return backupRestorePublicationEvidenceTargetsIdentifyKind(value, normalizedKind) ||
    backupRestorePublicationEvidenceKindTextSegments(value)
      .some(segment =>
        segment === normalizedKind ||
        segment.startsWith(`${normalizedKind} `)
      );
}

function backupRestorePublicationEvidenceTargetsIdentifyKind(value: string, normalizedKind: string): boolean {
  const expectedSlug = normalizedKind.replace(/\s+/g, '-');
  return extractCompletedEvidenceTargets(value)
    .some(target => normalizeBackupRestorePublicationEvidenceTargetBasename(target) === expectedSlug);
}

function normalizeBackupRestorePublicationEvidenceTargetBasename(target: string): string {
  const normalizedTarget = normalizeCompletedEvidenceTarget(target).replace(/\\/g, '/');
  const basename = normalizedTarget.split('/').filter(Boolean).pop() ?? normalizedTarget;
  return normalizeBackupRestoreEvidenceKind(basename.replace(/\.[a-z0-9]+$/i, '')).replace(/\s+/g, '-');
}

function backupRestorePublicationEvidenceKindTextSegments(value: string): string[] {
  return value
    .split(/[;\n|]+/)
    .map(stripLeadingBackupRestoreEvidenceTarget)
    .map(normalizeBackupRestoreEvidenceKind)
    .filter(segment => segment.length > 0);
}

function stripLeadingBackupRestoreEvidenceTarget(value: string): string {
  const trimmed = value.trim();
  const markdownMatch = /^\[[^\]]+\]\([^)]+\)/.exec(trimmed);
  if (markdownMatch) return trimmed.slice(markdownMatch[0].length).replace(/^[\s,.:;-]+/, '');

  const artifactMatch = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+/i.exec(trimmed);
  if (artifactMatch) return trimmed.slice(artifactMatch[0].length).replace(/^[\s,.:;-]+/, '');

  return trimmed;
}

function normalizeBackupRestoreEvidenceKind(value: string): string {
  return normalizeEvidenceMarkerText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function findBackupRestoreValidationTargetBinding(value: string): RegExpExecArray | null {
  return /\b(?:validated target|validated input|backup validate target|backup-restore validation target)\b/i
    .exec(value);
}

function identifiesBackupCompareEvidence(value: string): boolean {
  return (
    /(?:backup:compare|npm run backup:compare)/i.test(value) &&
    /snapshot/i.test(value) &&
    /(compare|comparison)/i.test(value)
  );
}

function containsMeasuredValue(evidence: string, measuredValue: string): boolean {
  const value = measuredValue.trim();
  if (value.length === 0) return false;

  const escapedValue = escapeRegExp(value).replace(/\s+/g, '\\s+');
  const prefix = /^[A-Za-z0-9]/.test(value) ? '(?:^|[^A-Za-z0-9])' : '';
  const suffix = /[A-Za-z0-9]$/.test(value) ? '(?:$|[^A-Za-z0-9])' : '';
  return new RegExp(`${prefix}${escapedValue}${suffix}`, 'i').test(evidence);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractCompletedEvidenceTargets(value: string): string[] {
  return [
    ...[...value.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+)/g)].map(([, target]) => target),
    ...[...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(([, target]) => target.trim()),
  ];
}

function backupRestoreCompletedEvidenceText(value: string): string {
  return value
    .split(/[;\n]+/)
    .map(segment => {
      const targetBinding = findBackupRestoreValidationTargetBinding(segment);
      return targetBinding
        ? segment.slice(0, targetBinding.index).trim()
        : segment.trim();
    })
    .filter(segment => segment.length > 0)
    .join('; ');
}

function isCompletedEvidenceTarget(target: string): boolean {
  const normalized = normalizeCompletedEvidenceTarget(target);
  return !/-template\.md(?:[#?].*)?$/i.test(normalized) &&
    !isLocalOnlyEvidenceTarget(normalized) &&
    !hasRuntimeOrEnvironmentBackupRestoreEvidenceTarget(normalized) &&
    !hasClaimEscalatingBackupRestoreEvidenceTarget(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized);
}

function normalizeCompletedEvidenceTarget(target: string): string {
  return target.split('#')[0].split('?')[0].trim().replace(/[),.;]+$/g, '').toLowerCase();
}

function hasClaimEscalatingBackupRestoreEvidenceReference(value: string): boolean {
  return extractCompletedEvidenceTargets(value)
    .some(target => hasClaimEscalatingBackupRestoreEvidenceTarget(target));
}

function hasClaimEscalatingBackupRestoreEvidenceTarget(target: string): boolean {
  const claim = classifyPublicationClaimText(normalizeCompletedEvidenceTarget(target));
  return claim.hasProductionClaim;
}

function hasRuntimeOrEnvironmentBackupRestoreEvidenceTarget(target: string): boolean {
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized)
    .map(normalizeBackupRestoreEvidenceInspectionTarget)
    .some(isRuntimeOrEnvironmentBackupRestoreEvidenceInspectionTarget);
}

function normalizeBackupRestoreEvidenceInspectionTarget(normalizedTarget: string): string {
  const artifactTarget = /^artifact:\/\/[a-z0-9][a-z0-9._-]*\/(.+)$/i.exec(normalizedTarget);
  return artifactTarget ? artifactTarget[1] : normalizedTarget;
}

function isRuntimeOrEnvironmentBackupRestoreEvidenceInspectionTarget(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasBackupRestoreEnvironmentTargetSegment(normalizedTarget) ||
    hasBackupRestoreRuntimeDatabaseTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
  );
}

function hasBackupRestoreEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasBackupRestoreRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
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

function hasNonConcreteEvidenceTargetSegment(value: string): boolean {
  return (
    /(?:^|[\/_.-])(?:placeholder|generic|todo|tbd)(?:[\/_.-]|$)/i.test(value) ||
    /(?:^|[\/_.-])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[\/_.-]|$)/i.test(value) ||
    /(?:^|[\/_.-])(?:sample|example)[-_ ]*evidence(?:[\/_.-]|$)/i.test(value) ||
    /(?:^|[\/_.-])(?:sample|example|template)[-_ ]*(?:backup|restore|state|snapshot|sqlite|wal|shm|avl|dup|spv|digest|daemon|broadcast|stop|condition|runtime|git|status|reconstructibility|boundary|command|release|note|notes|checklist|reviewer|approval)(?:[\/_.-]|$)/i.test(value)
  );
}

function isActionableReviewerNote(value: string): boolean {
  return (
    /\b(accept|accepted|approve|approved|verify|verified|validate|validated|confirm|confirmed|pass|passed|fail|failed|block|blocked|match|matched|reconcile|reconciled|complete|completed)\b/i.test(value) &&
    /\b(backup|restore|SQLite|WAL|SHM|AVL|DUP|SPV|digest|state|consistency|reconstructibility|stop condition|incident|runtime|hygiene|gate 3)\b/i.test(value)
  );
}

function hasContradictoryBackupRestoreEvidenceMarker(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);
  return (
    /\b(?:status|result|validation|validator|command|run|outcome)\s*[:=]?\s*(?:FAIL(?:ED)?|BLOCKED|ERROR)\b/i.test(normalized) ||
    /\b(?:FAIL(?:ED)?|BLOCKED|ERROR)\b\s+(?:validation|validator|command|run|result|status|outcome)\b/i.test(normalized) ||
    hasAmbiguousBackupRestoreExitCode(normalized) ||
    hasAmbiguousBackupRestoreResultCount(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasUnresolvedIssueMarker(normalized) ||
    /\b[1-9]\d*\s+structural\s+issues?\b/i.test(normalized)
  );
}

function hasContradictoryBackupRestoreClaimDecisionBinding(value: string): boolean {
  return (
    hasOpposingBackupRestoreClaimDecisionBinding(value, 'Production-ready claim allowed by this drill') ||
    hasOpposingBackupRestoreClaimDecisionBinding(value, 'Testnet production-candidate claim allowed by this drill')
  );
}

function hasOpposingBackupRestoreClaimDecisionBinding(value: string, field: string): boolean {
  const pattern = new RegExp(
    `\\b${field.split(/[- ]+/).map(escapeRegExp).join('[- ]+')}\\s*:\\s*(yes|no)\\s*(?:$|[.;,|)\\]\\r\\n])`,
    'ig',
  );
  const values = new Set([...value.matchAll(pattern)].map(match => match[1].toLowerCase()));
  return values.has('yes') && values.has('no');
}

function hasAmbiguousBackupRestoreExitCode(value: string): boolean {
  return /\bexit[- ]?code\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value);
}

function hasAmbiguousBackupRestoreResultCount(value: string): boolean {
  return /\b(?:errors?|structural\s+issues?)\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value);
}

function isGenericBackupRestoreRowPayload(value: string | undefined): boolean {
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0) return true;
  if (/^(pass|passed|approved|reviewed|linked|checked|yes|no|n\/a)$/i.test(trimmed)) return true;
  if (/completed[-_ ]?(pass|approved|reviewed|checked)|(?:pass|approved|reviewed|checked)\.md/i.test(trimmed)) {
    return true;
  }

  const residual = trimmed
    .replace(/artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+/g, '')
    .replace(/\[[^\]]+\]\([^)]+\)/g, '')
    .replace(/\b(completed|complete|pass|passed|approved|approve|reviewed|review|linked|checked|yes|no|n\/a)\b/gi, '')
    .replace(/[^A-Za-z0-9]+/g, '')
    .trim();
  return residual.length === 0;
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}
