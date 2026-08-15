import { basename } from 'path';

import { isIsoCalendarDate, validateIsoDateField, validateIsoUtcTimestampField } from './evidence-date.js';
import { validateGitCommitField } from './evidence-git.js';
import {
  hasStructuredValidationFailureMarker,
  hasUnresolvedIssueMarker,
  normalizeEvidenceMarkerText,
  validateEvidenceHygiene,
} from './evidence-hygiene.js';
import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import {
  CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR,
  MAINNET_PRODUCTION_CLAIM_ERROR,
  classifyPublicationClaimText,
} from './publication-claim-boundary.js';
import { validateReadOnlyNodeUrl } from './read-only-node-url.js';
import {
  LEGACY_AGGREGATE_SETTLEMENT_PROFILE_ID,
  validateSettlementProfileBinding,
} from './gate3-settlement-profile.js';

export type RehearsalStatus =
  | 'pass'
  | 'fail'
  | 'inconclusive'
  | 'not applicable'
  | 'publication blocker';

export interface RehearsalEvidenceRow {
  releaseGate: string;
  status: string;
  evidenceArtifact: string;
  blockingNote: string;
  requiredNextEvidence: string;
}

export interface RehearsalSessionMetadata {
  date: string;
  operator: string;
  reviewer: string;
  environment: string;
  gitCommit: string;
  releaseLevel: string;
  ergoNodeNetwork: string;
  sidechainNetwork: string;
  broadcastModeAtStart: string;
  broadcastModeAtEnd: string;
  settlementProfileId?: string;
  profileActivationStatus?: string;
  evidencePurpose?: string;
  activationEvidenceTarget?: string;
  activationId?: string;
}

export interface RehearsalPublicationEvidence {
  releaseNotesUpdated: string;
  requiredReleaseNoteUpdates: string;
  pendingEvidenceRegisterUpdated: string;
  requiredChecklistUpdates: string;
  productionReadyClaimAllowed: string;
  testnetProductionCandidateClaimAllowed: string;
}

export interface RehearsalReviewerSignoff {
  classification: string;
  publicationBlockersDiscovered: string;
  followUpTestsRequired: string;
  followUpRunbookChangesRequired: string;
  reviewer: string;
  date: string;
}

export interface RehearsalEvidenceValidation {
  status: 'PASS' | 'BLOCKED';
  rows: RehearsalEvidenceRow[];
  sessionMetadata: RehearsalSessionMetadata;
  publicationEvidence: RehearsalPublicationEvidence;
  reviewerSignoff: RehearsalReviewerSignoff;
  errors: string[];
  message: string;
}

export const REHEARSAL_ALLOWED_STATUSES: RehearsalStatus[] = [
  'pass',
  'fail',
  'inconclusive',
  'not applicable',
  'publication blocker',
];

export const REQUIRED_REHEARSAL_GATES = [
  'Fresh local devnet lifecycle',
  'Fresh testnet lifecycle',
  'Peg-in evidence',
  'Peg-out burn evidence',
  'Anchor evidence',
  'Settlement check evidence',
  'Settlement submit evidence',
  'Confirmation evidence',
  'Reconciliation evidence',
  'Failed broadcast / phantom AVL evidence',
  'Reorged burn / stale singleton evidence',
  'Backup-restore or reconstructibility evidence',
];
const LIVE_OR_RECOVERY_PASS_GATES = new Set([
  'Settlement submit evidence',
  'Confirmation evidence',
  'Reconciliation evidence',
  'Failed broadcast / phantom AVL evidence',
  'Reorged burn / stale singleton evidence',
  'Backup-restore or reconstructibility evidence',
]);

interface EvidenceFocus {
  pattern: RegExp;
  message: string;
}

const REQUIRED_LIFECYCLE_EVIDENCE_FOCUS: Record<string, EvidenceFocus[]> = {
  'Fresh local devnet lifecycle': [
    { pattern: /local[- ]devnet|devnet/i, message: 'must identify local devnet lifecycle evidence' },
  ],
  'Fresh testnet lifecycle': [
    { pattern: /testnet/i, message: 'must identify testnet lifecycle evidence' },
  ],
  'Peg-in evidence': [
    { pattern: /peg[- ]in/i, message: 'must identify peg-in evidence' },
  ],
  'Peg-out burn evidence': [
    { pattern: /peg[- ]out/i, message: 'must identify peg-out evidence' },
    { pattern: /burn/i, message: 'must identify burn evidence' },
  ],
  'Anchor evidence': [
    { pattern: /anchor/i, message: 'must identify anchor evidence' },
  ],
  'Settlement check evidence': [
    { pattern: /settlement[- ]check|transactions[-/ ]check|\/transactions\/check/i, message: 'must identify settlement check evidence' },
  ],
  'Settlement submit evidence': [
    { pattern: /settlement[- ]submit|submit/i, message: 'must identify settlement submit evidence' },
  ],
  'Confirmation evidence': [
    { pattern: /confirmation|confirm/i, message: 'must identify confirmation evidence' },
  ],
  'Reconciliation evidence': [
    { pattern: /reconciliation|reconcile/i, message: 'must identify reconciliation evidence' },
  ],
  'Failed broadcast / phantom AVL evidence': [
    { pattern: /failed[- ]broadcast/i, message: 'must identify failed-broadcast evidence' },
    { pattern: /phantom[- ]avl/i, message: 'must identify phantom-AVL evidence' },
    {
      pattern: /no[- ]phantom[- ](?:dup|avl)|no.*(?:dup|avl).*history|(?:dup|avl).*history.*not.*(?:inserted|persisted|mutated)|local[- ]state[- ]unchanged/i,
      message: 'must identify that no phantom DUP/AVL history was inserted',
    },
  ],
  'Reorged burn / stale singleton evidence': [
    { pattern: /reorged[- ]burn|reorg/i, message: 'must identify reorged-burn evidence' },
    { pattern: /stale[- ]singleton/i, message: 'must identify stale-singleton evidence' },
    { pattern: /detect/i, message: 'must identify detection evidence' },
    { pattern: /recover/i, message: 'must identify recovery or recoverability evidence' },
  ],
  'Backup-restore or reconstructibility evidence': [
    { pattern: /backup[- ]restore/i, message: 'must identify backup-restore evidence' },
    { pattern: /reconstruct/i, message: 'must identify reconstructibility evidence' },
    { pattern: /Backup Restore Evidence Template/i, message: 'must identify the Backup Restore Evidence Template' },
    { pattern: /npm run backup:validate/i, message: 'must identify backup validation' },
  ],
};

const REQUIRED_SECTIONS = [
  '## Session Metadata',
  '## Lifecycle Gate Classification',
  '## Preflight Evidence',
  '## Dry-Run Settlement Evidence',
  '## Broadcast Enablement Evidence',
  '## Submit And Confirmation Evidence',
  '## Reconciliation Evidence',
  '## Rollback And Cleanup',
  '## Publication Evidence',
  '## Reviewer Sign-Off',
];

const REQUIRED_SESSION_FIELDS = [
  'Date',
  'Operator',
  'Reviewer',
  'Environment',
  'Git commit',
  'Release level being evaluated',
  'Ergo node network',
  'Sidechain network',
  'Broadcast mode at start',
  'Broadcast mode at end',
];

const REQUIRED_REVIEWER_SIGNOFF_FIELDS = [
  'Classification',
  'Publication blockers discovered',
  'Follow-up tests required',
  'Follow-up runbook changes required',
  'Reviewer',
  'Date',
];

const REQUIRED_PREFLIGHT_FIELDS = [
  'Clean-checkout checks passed',
  'ContextExtension guard result',
  'Broadcast policy result',
  'Deployed singleton status',
  'Liquidity status',
  'Current Ergo height',
  'Current sidechain height',
];

const REQUIRED_DRY_RUN_FIELDS = [
  'Peg-in event ID or TX ID',
  'Peg-out burn TX ID',
  'Sidechain block height',
  'Sidechain block hash',
  'Bridge event root',
  'Ergo anchor height',
  'Aggregate claim count',
  'Input count',
  'Output count',
  'ContextExtension key counts per input',
  '`/transactions/check` result',
  'Expected transaction ID',
  'Daemon approval evidence',
];

const REQUIRED_BROADCAST_ENABLEMENT_FIELDS = [
  'Reviewer approval recorded',
  'User approval recorded',
  '`BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell',
  'Readiness command re-run after enabling broadcast',
  'Broadcast policy reports `PASS`',
  'Live settlement readiness reports `PASS`',
  'Node URL and network re-confirmed',
];

const REQUIRED_SUBMIT_CONFIRMATION_FIELDS = [
  'Submitted transaction ID',
  'Submission timestamp',
  'First observed mempool height',
  'Confirmation height',
  'Confirmation count',
  'Settlement output box IDs',
  'DUP successor box ID',
  'SPV tracker successor box ID',
  'Recipient payout box ID',
  'Miner fee output',
];

const REQUIRED_RECONCILIATION_FIELDS = [
  'Peg-out status after reconciliation',
  'DUP history contains only confirmed keys',
  'SPV tracker digest matches confirmed successor',
  'No duplicate payout exists for the same burn',
  'Failed-event queue',
  'Manual repair performed',
];

const REQUIRED_ROLLBACK_FIELDS = [
  'Broadcast disabled in all shells',
  'Runtime state files preserved but not staged',
  'Logs archived',
  'Incident or regression issue opened if needed',
  'Regression test or runbook update needed',
];

const REQUIRED_PUBLICATION_EVIDENCE_FIELDS = [
  'Release notes updated',
  'Required release-note updates',
  'Pending Evidence Register updated',
  'Required checklist updates',
  'Production-ready claim allowed by this rehearsal',
  'Testnet production-candidate claim allowed by this rehearsal',
];

const REQUIRED_PUBLICATION_CLAIM_FIELDS = [
  'Production-ready claim allowed by this rehearsal',
  'Testnet production-candidate claim allowed by this rehearsal',
];

const EXACT_PRODUCTION_READY_CLAIM_DENIAL_BY_REHEARSAL =
  'Production-ready claim allowed by this rehearsal: no';
const EXACT_TESTNET_PRODUCTION_CANDIDATE_CLAIM_DENIAL_BY_REHEARSAL =
  'Testnet production-candidate claim allowed by this rehearsal: no';

const REQUIRED_FULL_LIFECYCLE_PASS_GATES = [
  'Peg-in evidence',
  'Peg-out burn evidence',
  'Anchor evidence',
  'Settlement check evidence',
  'Settlement submit evidence',
  'Confirmation evidence',
  'Reconciliation evidence',
];

const REQUIRED_PASS_DEPENDENCIES: Record<string, string[]> = {
  'Fresh local devnet lifecycle': REQUIRED_FULL_LIFECYCLE_PASS_GATES,
  'Fresh testnet lifecycle': REQUIRED_FULL_LIFECYCLE_PASS_GATES,
  'Settlement check evidence': ['Peg-out burn evidence', 'Anchor evidence'],
  'Settlement submit evidence': ['Settlement check evidence'],
  'Confirmation evidence': ['Settlement submit evidence'],
  'Reconciliation evidence': ['Confirmation evidence'],
};

const REQUIRED_PREFLIGHT_EVIDENCE_MARKER_FIELDS = [
  'ContextExtension guard result',
  'Broadcast policy result',
  'Deployed singleton status',
  'Liquidity status',
  'Current Ergo height',
  'Current sidechain height',
];

const REQUIRED_DRY_RUN_EVIDENCE_MARKER_FIELDS = [
  'Peg-in event ID or TX ID',
  'Peg-out burn TX ID',
  'Sidechain block hash',
  'Bridge event root',
  '`/transactions/check` result',
  'Expected transaction ID',
  'Daemon approval evidence',
];

const REQUIRED_BROADCAST_ENABLEMENT_EVIDENCE_MARKER_FIELDS = [
  'Reviewer approval recorded',
  'User approval recorded',
  '`BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell',
  'Readiness command re-run after enabling broadcast',
  'Broadcast policy reports `PASS`',
  'Live settlement readiness reports `PASS`',
  'Node URL and network re-confirmed',
];

const REQUIRED_SUBMIT_CONFIRMATION_EVIDENCE_MARKER_FIELDS = [
  'Submitted transaction ID',
  'Settlement output box IDs',
  'DUP successor box ID',
  'SPV tracker successor box ID',
  'Recipient payout box ID',
  'Miner fee output',
];

const REQUIRED_RECONCILIATION_EVIDENCE_MARKER_FIELDS = [
  'Peg-out status after reconciliation',
  'DUP history contains only confirmed keys',
  'SPV tracker digest matches confirmed successor',
  'No duplicate payout exists for the same burn',
  'Failed-event queue',
];

const REQUIRED_ROLLBACK_EVIDENCE_MARKER_FIELDS = [
  'Logs archived',
  'Incident or regression issue opened if needed',
];

const REQUIRED_PREFLIGHT_EXPECTATIONS = [
  {
    field: 'Clean-checkout checks passed',
    pattern: /^(yes|pass|passed)$/i,
    message: 'must be yes, pass, or passed',
  },
];

const REQUIRED_DRY_RUN_EXPECTATIONS = [
  {
    field: '`/transactions/check` result',
    pattern: /\b(pass|passed|ok)\b/i,
    message: 'must contain pass, passed, or ok',
  },
];

const REQUIRED_BROADCAST_ENABLEMENT_EXPECTATIONS = [
  {
    field: '`BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell',
    pattern: /\bBRIDGE_BROADCAST_ENABLED\s*=\s*true\b/i,
    message: 'must cite BRIDGE_BROADCAST_ENABLED=true',
  },
  {
    field: '`BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell',
    pattern: /\byes\b/i,
    message: 'must contain yes',
  },
  {
    field: '`BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell',
    pattern: /\bintended shell\b/i,
    message: 'must name the intended shell',
  },
  {
    field: '`BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell',
    pattern: /\b(only|scoped|no other shell)\b/i,
    message: 'must state the scope is limited',
  },
  {
    field: 'Readiness command re-run after enabling broadcast',
    pattern: /\bnpm run demo:readiness\b/i,
    message: 'must cite npm run demo:readiness',
  },
  {
    field: 'Readiness command re-run after enabling broadcast',
    pattern: /\bpass\b/i,
    message: 'must contain PASS',
  },
  {
    field: 'Broadcast policy reports `PASS`',
    pattern: /\bnpm run demo:readiness\b/i,
    message: 'must cite npm run demo:readiness',
  },
  {
    field: 'Broadcast policy reports `PASS`',
    pattern: /\bBroadcast policy\b/i,
    message: 'must cite Broadcast policy output',
  },
  {
    field: 'Broadcast policy reports `PASS`',
    pattern: /\bpass\b/i,
    message: 'must contain PASS',
  },
  {
    field: 'Live settlement readiness reports `PASS`',
    pattern: /\bnpm run demo:readiness\b/i,
    message: 'must cite npm run demo:readiness',
  },
  {
    field: 'Live settlement readiness reports `PASS`',
    pattern: /\bLive settlement signing\b/i,
    message: 'must cite Live settlement signing output',
  },
  {
    field: 'Live settlement readiness reports `PASS`',
    pattern: /\bpass\b/i,
    message: 'must contain PASS',
  },
];

const REQUIRED_RECONCILIATION_EXPECTATIONS = [
  {
    field: 'Peg-out status after reconciliation',
    pattern: /^(confirmed|settled)\b/i,
    message: 'must be confirmed or settled',
  },
  {
    field: 'DUP history contains only confirmed keys',
    pattern: /^yes\b/i,
    message: 'must be yes',
  },
  {
    field: 'SPV tracker digest matches confirmed successor',
    pattern: /^yes\b/i,
    message: 'must be yes',
  },
  {
    field: 'No duplicate payout exists for the same burn',
    pattern: /^yes\b/i,
    message: 'must be yes',
  },
  {
    field: 'Manual repair performed',
    pattern: /^(yes|no)\b/i,
    message: 'must be yes or no',
  },
];

const REQUIRED_ROLLBACK_EXPECTATIONS = [
  {
    field: 'Broadcast disabled in all shells',
    pattern: /^yes$/i,
    message: 'must be yes',
  },
  {
    field: 'Runtime state files preserved but not staged',
    pattern: /^yes$/i,
    message: 'must be yes',
  },
  {
    field: 'Regression test or runbook update needed',
    pattern: /^(yes|no)$/i,
    message: 'must be yes or no',
  },
];

const ALLOWED_ENVIRONMENTS = new Set(['local devnet', 'staging', 'testnet']);
const ALLOWED_RELEASE_LEVELS = new Set([
  'validated PoC',
  'institutional reference',
  'production deployment candidate',
]);
const FRESH_TESTNET_SIDECHAIN_NETWORK_SCOPE_ERROR =
  'Fresh testnet lifecycle: pass requires Session Metadata Sidechain network to identify patched-devnet, testnet, or an explicit non-mainnet sidechain network';
const FRESH_TESTNET_PREBROADCAST_PASS_EVIDENCE_ERROR =
  'Fresh testnet lifecycle: pass evidence must be completed live testnet lifecycle evidence, not pre-broadcast dry-run evidence';
const ALLOWED_BROADCAST_MODES = new Set(['disabled', 'enabled']);
const ALLOWED_SIGNOFF_CLASSIFICATIONS = new Set(['pass', 'fail', 'inconclusive']);
const ACTIONABLE_BLOCKING_NOTE_PATTERN =
  /\b(block|blocked|fail|failed|inconclusive|pending|missing|unavailable|mismatch|reorg|stale|phantom|not applicable|out of scope|scope|deferred|incident|testnet|broadcast|confirmation|reconciliation|backup|restore)\b/i;
const ACTIONABLE_NEXT_EVIDENCE_PATTERN =
  /\b(rerun|re-run|complete|capture|link|attach|validate|rehearsal|testnet|devnet|staging|backup|restore|runbook|incident|evidence|artifact|command|confirm|confirmation|reconcile|reconciliation)\b/i;
const COMPLETED_EVIDENCE_TARGET_REQUIREMENT =
  'must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence';
const REHEARSAL_VALIDATION_TARGET_BINDING =
  /\b(?:validated target|validated input|rehearsal validate target|rehearsal validation target)\b/i;
const HEX_32_BYTE_PATTERN = /(?:^|[^0-9a-fA-F])(?:0x)?([0-9a-fA-F]{64})(?![0-9a-fA-F])/g;
const HEX_32_BYTE_VALUE_PATTERN = '(?:0x)?[0-9a-fA-F]{64}';
const BROADCAST_DISABLED_POLICY_PATTERN =
  /(\bbroadcast\b.{0,80}\b(disabled|refus(?:ed|ing)|blocked)\b|\bBRIDGE_BROADCAST_ENABLED\b\s*(?:=|:|is)\s*(?:false|unset)\b|\brefusing to broadcast\b)/i;
const BROADCAST_ENABLED_INDICATOR_PATTERN =
  /\b(?:BRIDGE_BROADCAST_ENABLED\s*(?:=|:|is)\s*true|broadcast\s+(?:enabled|approved|allowed|certified|endorsed|recommended|accredited)|(?:certif(?:y|ied|ies)|endorse(?:d|s)?|recommend(?:ed|s)?|accredit(?:ed|s)?)\s+(?:live\s+)?broadcast(?:\s+approval)?|live broadcast approval\s+(?:recorded\s*)?(?:yes|approved|certified|endorsed|recommended|accredited)|submit command attempted\s*:\s*yes|mempool transaction observed\s*:\s*yes)\b/i;
const DEPLOYMENT_STATE_HASH_VALUE_PATTERN = new RegExp(
  `deployment[- ]state (?:hash|digest)\\s*(?:=|:|is)\\s*${HEX_32_BYTE_VALUE_PATTERN}\\b`,
  'i',
);
const CONTRACT_IDS_VALUE_PATTERN = new RegExp(
  `contract IDs?\\s*(?:=|:|include|includes)\\s*${HEX_32_BYTE_VALUE_PATTERN}\\b`,
  'i',
);
const SINGLETON_INVENTORY_VALUE_PATTERN = new RegExp(
  `singleton inventory\\s*(?:=|:|include|includes)\\s*${HEX_32_BYTE_VALUE_PATTERN}\\b`,
  'i',
);
const SINGLETON_INVENTORY_ID_CAPTURE_PATTERN =
  /singleton inventory\s*(?:=|:|include|includes)\s*(?:0x)?([0-9a-fA-F]{64})\b/i;
const MINER_FEE_NANOERG_KEY_PATTERN = /(?:^|[^A-Za-z0-9_-])feeNanoErg=/g;
const POSITIVE_MINER_FEE_NANOERG_PATTERN = /(?:^|[^A-Za-z0-9_-])feeNanoErg=([1-9][0-9]*)(?![A-Za-z0-9_-])/g;

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

export function parseLifecycleGateRows(markdown: string): RehearsalEvidenceRow[] {
  const tableStart = markdown.indexOf(
    '| Release gate | Status | Evidence artifact | Blocking note | Required next evidence |',
  );
  const tableEnd = markdown.indexOf('## Preflight Evidence');

  if (tableStart < 0 || tableEnd < 0 || tableEnd <= tableStart) {
    throw new Error('Lifecycle Gate Classification table not found before Preflight Evidence');
  }

  return parseMarkdownTableRows(markdown.slice(tableStart, tableEnd)).map(row => {
    if (row.length !== 5) {
      throw new Error(`Malformed Lifecycle Gate Classification row: ${row.join(' | ')}`);
    }

    return {
      releaseGate: row[0],
      status: row[1],
      evidenceArtifact: row[2],
      blockingNote: row[3],
      requiredNextEvidence: row[4],
    };
  });
}

function isBlank(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length === 0 || /\s\/\s/.test(trimmed);
}

function isAllowedStatus(status: string): status is RehearsalStatus {
  return (REHEARSAL_ALLOWED_STATUSES as string[]).includes(status);
}

function parseRehearsalSessionMetadata(markdown: string): RehearsalSessionMetadata {
  const fields = parseListFields(sectionBetween(markdown, '## Session Metadata', '## Lifecycle Gate Classification'));
  return {
    date: fields.get('Date') ?? '',
    operator: fields.get('Operator') ?? '',
    reviewer: fields.get('Reviewer') ?? '',
    environment: fields.get('Environment') ?? '',
    gitCommit: fields.get('Git commit') ?? '',
    releaseLevel: fields.get('Release level being evaluated') ?? '',
    ergoNodeNetwork: fields.get('Ergo node network') ?? '',
    sidechainNetwork: fields.get('Sidechain network') ?? '',
    broadcastModeAtStart: fields.get('Broadcast mode at start') ?? '',
    broadcastModeAtEnd: fields.get('Broadcast mode at end') ?? '',
    settlementProfileId: fields.get('Settlement profile ID') ?? '',
    profileActivationStatus: fields.get('Profile activation status') ?? '',
    evidencePurpose: fields.get('Evidence purpose') ?? '',
    activationEvidenceTarget: fields.get('Activation evidence target') ?? '',
    activationId: fields.get('Activation ID') ?? '',
  };
}

function parseRehearsalPublicationEvidence(markdown: string): RehearsalPublicationEvidence {
  const fields = parseListFields(sectionBetween(markdown, '## Publication Evidence', '## Reviewer Sign-Off'));
  return {
    releaseNotesUpdated: fields.get('Release notes updated') ?? '',
    requiredReleaseNoteUpdates: fields.get('Required release-note updates') ?? '',
    pendingEvidenceRegisterUpdated: fields.get('Pending Evidence Register updated') ?? '',
    requiredChecklistUpdates: fields.get('Required checklist updates') ?? '',
    productionReadyClaimAllowed: fields.get('Production-ready claim allowed by this rehearsal') ?? '',
    testnetProductionCandidateClaimAllowed:
      fields.get('Testnet production-candidate claim allowed by this rehearsal') ?? '',
  };
}

function parseRehearsalReviewerSignoff(markdown: string): RehearsalReviewerSignoff {
  const fields = parseListFields(sectionBetween(markdown, '## Reviewer Sign-Off'));
  return {
    classification: fields.get('Classification') ?? '',
    publicationBlockersDiscovered: fields.get('Publication blockers discovered') ?? '',
    followUpTestsRequired: fields.get('Follow-up tests required') ?? '',
    followUpRunbookChangesRequired: fields.get('Follow-up runbook changes required') ?? '',
    reviewer: fields.get('Reviewer') ?? '',
    date: fields.get('Date') ?? '',
  };
}

export function validateRehearsalEvidence(markdown: string): RehearsalEvidenceValidation {
  const rows = parseLifecycleGateRows(markdown);
  const sessionMetadata = parseRehearsalSessionMetadata(markdown);
  const publicationEvidence = parseRehearsalPublicationEvidence(markdown);
  const reviewerSignoff = parseRehearsalReviewerSignoff(markdown);
  const errors: string[] = [
    ...validateEvidenceHygiene(markdown, 'Rehearsal Evidence'),
    ...validateRequiredSections(markdown),
    ...validateSessionMetadata(markdown),
    ...validateReviewerSignoff(markdown),
    ...validateReviewerIdentityConsistency(markdown),
    ...validateReviewerSignoffDateOrder(markdown),
  ];
  const rowByGate = new Map(rows.map(row => [row.releaseGate, row]));
  errors.push(...validateDuplicateLifecycleRows(rows));

  for (const gate of REQUIRED_REHEARSAL_GATES) {
    if (!rowByGate.has(gate)) errors.push(`${gate}: missing required lifecycle row`);
  }

  errors.push(...validateLifecyclePassDependencies(rowByGate));
  errors.push(...validateLifecycleSessionConsistency(markdown, rowByGate));
  errors.push(...validateEvidenceSectionFields(markdown, rowByGate));

  for (const row of rows) {
    if (!REQUIRED_REHEARSAL_GATES.includes(row.releaseGate)) {
      errors.push(`${row.releaseGate}: unexpected lifecycle row`);
    }

    if (!isAllowedStatus(row.status)) {
      errors.push(
        `${row.releaseGate}: status must be one of ${REHEARSAL_ALLOWED_STATUSES.join(', ')}`,
      );
      continue;
    }

    validateLifecycleEvidenceFocus(row, errors);

    if (row.status === 'pass') {
      if (isBlank(row.evidenceArtifact)) {
        errors.push(`${row.releaseGate}: pass requires an evidence artifact`);
      }
      if (!isBlank(row.evidenceArtifact) && !hasEvidenceMarker(row.evidenceArtifact)) {
        errors.push(`${row.releaseGate}: pass evidence must be a link, command, or artifact marker`);
      }
      if (!isBlank(row.evidenceArtifact) && !hasCompletedLifecycleRowEvidenceTarget(row.evidenceArtifact)) {
        errors.push(`${row.releaseGate}: pass evidence ${COMPLETED_EVIDENCE_TARGET_REQUIREMENT}`);
      }
      validateLiveOrRecoveryPassEvidenceScope(row, errors);
      validateRecoveryPassValidationEvidence(row, errors);
      continue;
    }

    if (row.status === 'not applicable') {
      if (isBlank(row.blockingNote)) {
        errors.push(`${row.releaseGate}: not applicable requires a blocking note explaining scope`);
      } else if (!isActionableBlockingNote(row.blockingNote)) {
        errors.push(`${row.releaseGate}: not applicable blocking note must explain scope, blocker, missing evidence, incident, or deferred environment`);
      }
      continue;
    }

    if (isBlank(row.evidenceArtifact)) {
      errors.push(`${row.releaseGate}: ${row.status} requires an evidence artifact`);
    } else if (!hasEvidenceMarker(row.evidenceArtifact)) {
      errors.push(`${row.releaseGate}: ${row.status} evidence must be a link, command, or artifact marker`);
    } else if (!hasCompletedLifecycleRowEvidenceTarget(row.evidenceArtifact)) {
      errors.push(`${row.releaseGate}: ${row.status} evidence ${COMPLETED_EVIDENCE_TARGET_REQUIREMENT}`);
    }
    if (isBlank(row.blockingNote)) {
      errors.push(`${row.releaseGate}: ${row.status} requires a blocking note`);
    } else if (!isActionableBlockingNote(row.blockingNote)) {
      errors.push(`${row.releaseGate}: ${row.status} blocking note must explain blocker, failure, pending evidence, mismatch, incident, or recovery condition`);
    }
    if (isBlank(row.requiredNextEvidence)) {
      errors.push(`${row.releaseGate}: ${row.status} requires next evidence`);
    } else if (!isActionableNextEvidence(row.requiredNextEvidence)) {
      errors.push(`${row.releaseGate}: ${row.status} next evidence must state rerun, capture, link, validate, runbook, incident, confirmation, reconciliation, or restore action`);
    }
  }

  if (errors.length > 0) {
    return {
      status: 'BLOCKED',
      rows,
      sessionMetadata,
      publicationEvidence,
      reviewerSignoff,
      errors,
      message: `Rehearsal evidence BLOCKED: ${errors.length} structural issue(s).`,
    };
  }

  return {
    status: 'PASS',
    rows,
    sessionMetadata,
    publicationEvidence,
    reviewerSignoff,
    errors: [],
    message: `Rehearsal evidence PASS: ${rows.length} lifecycle rows are structured.`,
  };
}

export function formatRehearsalValidationTranscriptLines(
  label: string,
  markdown: string,
  result: RehearsalEvidenceValidation,
  transcriptTarget?: string,
): string[] {
  const lines = [`${label}: ${result.message}`];

  if (result.status === 'PASS') {
    lines.push(formatRehearsalValidationPassTranscript(label, markdown, transcriptTarget));
  } else {
    lines.push(...result.errors.map(error => `- ${error}`));
  }

  return lines;
}

function formatRehearsalValidationPassTranscript(
  label: string,
  markdown: string,
  transcriptTarget?: string,
): string {
  const outputTarget = transcriptTarget ? ` ${transcriptTarget}` : '';
  const baseLine = `npm run rehearsal:validate command output:${outputTarget} PASS exit code 0 validated target ${label}`;
  const finalityFacts = formatFreshTestnetFinalityTranscriptFacts(markdown);
  return finalityFacts ? `${baseLine} ${finalityFacts}` : baseLine;
}

function formatFreshTestnetFinalityTranscriptFacts(markdown: string): string | null {
  const rows = parseLifecycleGateRows(markdown);
  const freshTestnetRow = rows.find(row => row.releaseGate === 'Fresh testnet lifecycle');
  if (freshTestnetRow?.status !== 'pass') return null;

  const dryRunValues = parseListFields(sectionBetween(
    markdown,
    '## Dry-Run Settlement Evidence',
    '## Broadcast Enablement Evidence',
  ));
  const submitValues = parseListFields(sectionBetween(
    markdown,
    '## Submit And Confirmation Evidence',
    '## Reconciliation Evidence',
  ));
  const requiredConfirmations = parseNonNegativeInteger(
    submitValues.get('Required confirmation count') ?? '',
  );
  const observedConfirmations = parseNonNegativeInteger(
    submitValues.get('Confirmation count') ?? '',
  );
  const expectedTxId = extractSingleTxId(dryRunValues.get('Expected transaction ID') ?? '');
  const submittedTxId = extractSingleTxId(submitValues.get('Submitted transaction ID') ?? '');
  const finalityEvidenceTarget = extractCompletedEvidenceTargets(
    submitValues.get('Confirmation policy met') ?? '',
  )[0];

  if (
    requiredConfirmations === undefined ||
    observedConfirmations === undefined ||
    submittedTxId === undefined ||
    finalityEvidenceTarget === undefined
  ) {
    return null;
  }

  return (
    `confirmation policy met PASS confirmationsRequired=${requiredConfirmations} ` +
    `confirmationsObserved=${observedConfirmations} ` +
    `observed confirmation count greater than or equal to required confirmation count ` +
    (expectedTxId === undefined ? '' : `expected transaction ID ${expectedTxId} `) +
    `submitted transaction ID ${submittedTxId} completed finality evidence ${finalityEvidenceTarget}`
  );
}

function validateLiveOrRecoveryPassEvidenceScope(
  row: RehearsalEvidenceRow,
  errors: string[],
): void {
  if (
    LIVE_OR_RECOVERY_PASS_GATES.has(row.releaseGate) &&
    isPreBroadcastDryRunEvidence(row.evidenceArtifact)
  ) {
    errors.push(
      `${row.releaseGate}: pass evidence must be completed live/recovery evidence, not pre-broadcast dry-run evidence`,
    );
  }
}

function validateRecoveryPassValidationEvidence(
  row: RehearsalEvidenceRow,
  errors: string[],
): void {
  if (
    row.releaseGate === 'Failed broadcast / phantom AVL evidence' &&
    !/npm run rehearsal:validate/i.test(row.evidenceArtifact)
  ) {
    errors.push(
      `${row.releaseGate}: evidence artifact must identify rehearsal validation command evidence`,
    );
  }

  if (
    row.releaseGate === 'Reorged burn / stale singleton evidence' &&
    !/npm run rehearsal:validate|test artifact|test evidence|vitest|cargo test/i.test(row.evidenceArtifact)
  ) {
    errors.push(
      `${row.releaseGate}: evidence artifact must identify rehearsal validation or test artifact evidence`,
    );
  }
}

function validateLifecycleEvidenceFocus(row: RehearsalEvidenceRow, errors: string[]): void {
  if (isBlank(row.evidenceArtifact)) return;

  if (
    row.releaseGate === 'Fresh testnet lifecycle' &&
    !identifiesPositiveTestnetNetwork(row.evidenceArtifact)
  ) {
    errors.push(`${row.releaseGate}: evidence artifact must positively identify testnet lifecycle evidence`);
    return;
  }
  if (
    row.releaseGate === 'Fresh testnet lifecycle' &&
    !/\bErgo node network\b[^\n|]{0,80}\btest[- ]?net\b/i.test(row.evidenceArtifact)
  ) {
    errors.push(`${row.releaseGate}: evidence artifact must cite Ergo node network testnet`);
    return;
  }

  for (const focus of REQUIRED_LIFECYCLE_EVIDENCE_FOCUS[row.releaseGate] ?? []) {
    if (!focus.pattern.test(row.evidenceArtifact)) {
      errors.push(`${row.releaseGate}: evidence artifact ${focus.message}`);
    }
  }
}

export function hasCompletedLifecycleGateEvidenceArtifact(row: RehearsalEvidenceRow): boolean {
  return (
    !isGenericLifecycleEvidenceArtifact(row.evidenceArtifact) &&
    hasEvidenceMarker(row.evidenceArtifact) &&
    hasCompletedLifecycleRowEvidenceTarget(row.evidenceArtifact) &&
    /\bcompleted\b/i.test(row.evidenceArtifact) &&
    hasLifecycleEvidenceFocus(row)
  );
}

export function hasCompletedRehearsalReleaseNoteUpdateEvidence(value: string): boolean {
  return hasCompletedEvidenceTarget(value) &&
    identifiesRehearsalPublicationEvidenceKind(
      value,
      'completed Gate 3 rehearsal release-note update evidence',
    );
}

export function hasCompletedRehearsalChecklistUpdateEvidence(value: string): boolean {
  return hasCompletedEvidenceTarget(value) &&
    identifiesRehearsalPublicationEvidenceKind(
      value,
      'completed Gate 3 checklist update evidence',
    );
}

function hasLifecycleEvidenceFocus(row: RehearsalEvidenceRow): boolean {
  return (REQUIRED_LIFECYCLE_EVIDENCE_FOCUS[row.releaseGate] ?? [])
    .every(focus => focus.pattern.test(row.evidenceArtifact));
}

function isGenericLifecycleEvidenceArtifact(value: string): boolean {
  return /^(pass|passed|approved|reviewed|linked|checked|yes|no|n\/a)$/i
    .test(value.trim());
}

function validateLifecyclePassDependencies(
  rowByGate: Map<string, RehearsalEvidenceRow>,
): string[] {
  const errors: string[] = [];

  for (const [gate, dependencies] of Object.entries(REQUIRED_PASS_DEPENDENCIES)) {
    const row = rowByGate.get(gate);
    if (row?.status !== 'pass') continue;

    for (const dependency of dependencies) {
      const dependencyRow = rowByGate.get(dependency);
      if (dependencyRow?.status !== 'pass') {
        errors.push(`${gate}: pass requires ${dependency} to pass`);
      }
    }
  }

  return errors;
}

function validateLifecycleSessionConsistency(
  markdown: string,
  rowByGate: Map<string, RehearsalEvidenceRow>,
): string[] {
  const errors: string[] = [];
  const fields = parseListFields(sectionBetween(
    markdown,
    '## Session Metadata',
    '## Lifecycle Gate Classification',
  ));
  const environment = fields.get('Environment') ?? '';

  if (rowByGate.get('Fresh local devnet lifecycle')?.status === 'pass' && environment !== 'local devnet') {
    errors.push('Fresh local devnet lifecycle: pass requires Session Metadata Environment to be local devnet');
  }

  if (rowByGate.get('Fresh testnet lifecycle')?.status === 'pass') {
    if (environment !== 'testnet') {
      errors.push('Fresh testnet lifecycle: pass requires Session Metadata Environment to be testnet');
    }

    const ergoNodeNetwork = fields.get('Ergo node network') ?? '';
    if (!identifiesPositiveTestnetNetwork(ergoNodeNetwork)) {
      errors.push('Fresh testnet lifecycle: pass requires Session Metadata Ergo node network to identify testnet');
    }

    const sidechainNetwork = fields.get('Sidechain network') ?? '';
    if (!identifiesAllowedSidechainNetwork(sidechainNetwork)) {
      errors.push(FRESH_TESTNET_SIDECHAIN_NETWORK_SCOPE_ERROR);
    }
  }

  return errors;
}

function identifiesAllowedSidechainNetwork(value: string): boolean {
  if (isBlank(value) || hasForbiddenSidechainNetworkWording(value)) return false;

  return (
    /\bpatched[- ]?devnet\b/i.test(value) ||
    /\btest[- ]?net\b/i.test(value) ||
    /\bnon[- ]?main[- ]?net\b/i.test(value)
  );
}

function hasForbiddenSidechainNetworkWording(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);
  const valueWithoutNonMainnet = normalized.replace(/\bnon[- ]?main[- ]?net\b/gi, '');

  return (
    /\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/i.test(valueWithoutNonMainnet) ||
    /\b(?:non[- ]?test[- ]?net|no|not|without|missing|absent|unavailable|unconnected|disconnected)\b.{0,80}\btest[- ]?net\b/i.test(normalized) ||
    /\btest[- ]?net\b.{0,80}\b(?:not|missing|absent|unavailable|unconnected|disconnected)\b/i.test(normalized)
  );
}

function identifiesPositiveTestnetNetwork(value: string): boolean {
  return /\btest[- ]?net\b/i.test(value) && !hasForbiddenTestnetNetworkWording(value);
}

function hasForbiddenTestnetNetworkWording(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);
  return (
    /\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/i.test(normalized) ||
    /\b(?:non[- ]?test[- ]?net|no|not|without|missing|absent|unavailable|unconnected|disconnected)\b.{0,80}\btest[- ]?net\b/i.test(normalized) ||
    /\btest[- ]?net\b.{0,80}\b(?:not|missing|absent|unavailable|unconnected|disconnected)\b/i.test(normalized)
  );
}

function validateEvidenceSectionFields(
  markdown: string,
  rowByGate: Map<string, RehearsalEvidenceRow>,
): string[] {
  const errors = [
    ...validateRequiredListFields(
      markdown,
      'Preflight Evidence',
      '## Preflight Evidence',
      '## Dry-Run Settlement Evidence',
      REQUIRED_PREFLIGHT_FIELDS,
      REQUIRED_PREFLIGHT_EXPECTATIONS,
      REQUIRED_PREFLIGHT_EVIDENCE_MARKER_FIELDS,
    ),
    ...validateRequiredListFields(
      markdown,
      'Dry-Run Settlement Evidence',
      '## Dry-Run Settlement Evidence',
      '## Broadcast Enablement Evidence',
      REQUIRED_DRY_RUN_FIELDS,
      REQUIRED_DRY_RUN_EXPECTATIONS,
      REQUIRED_DRY_RUN_EVIDENCE_MARKER_FIELDS,
    ),
    ...validateDryRunTransactionsCheckPositiveEvidence(markdown),
    ...validateRequiredListFields(
      markdown,
      'Rollback And Cleanup',
      '## Rollback And Cleanup',
      '## Publication Evidence',
      REQUIRED_ROLLBACK_FIELDS,
      REQUIRED_ROLLBACK_EXPECTATIONS,
      REQUIRED_ROLLBACK_EVIDENCE_MARKER_FIELDS,
    ),
    ...validatePublicationEvidence(markdown),
    ...validateCleanDeploymentStateEvidence(markdown, rowByGate),
    ...validateContextExtensionGuardEvidence(markdown),
    ...validatePreflightBroadcastPolicyEvidence(markdown),
    ...validatePreflightNumericFields(markdown),
    ...validateDryRunNumericFields(markdown),
    ...validateDryRunHexIdentifiers(markdown),
    ...validateExpectedTransactionId(markdown),
    ...validateDaemonApprovalEvidence(markdown, rowByGate),
    ...validateDryRunLifecycleBindings(markdown, rowByGate),
    ...validateFreshTestnetLifecycleArtifactBindings(markdown, rowByGate),
    ...validateFreshTestnetAssemblyEvidence(markdown, rowByGate),
    ...validateFreshTestnetConfirmationPolicy(markdown, rowByGate),
    ...validateRecoveryDrillBindings(markdown, rowByGate),
  ];

  if (
    rowByGate.get('Settlement submit evidence')?.status === 'pass' ||
    rowByGate.get('Confirmation evidence')?.status === 'pass'
  ) {
    errors.push(
      ...validateRequiredListFields(
        markdown,
        'Broadcast Enablement Evidence',
        '## Broadcast Enablement Evidence',
        '## Submit And Confirmation Evidence',
        REQUIRED_BROADCAST_ENABLEMENT_FIELDS,
        REQUIRED_BROADCAST_ENABLEMENT_EXPECTATIONS,
        REQUIRED_BROADCAST_ENABLEMENT_EVIDENCE_MARKER_FIELDS,
      ),
      ...validateBroadcastReviewerApproval(markdown),
      ...validateBroadcastUserApproval(markdown),
      ...validateBroadcastNetworkReconfirmation(markdown),
      ...validateRequiredListFields(
        markdown,
        'Submit And Confirmation Evidence',
        '## Submit And Confirmation Evidence',
        '## Reconciliation Evidence',
        REQUIRED_SUBMIT_CONFIRMATION_FIELDS,
        [],
        REQUIRED_SUBMIT_CONFIRMATION_EVIDENCE_MARKER_FIELDS,
      ),
      ...validateIsoTimestampInSection(
        markdown,
        'Submit And Confirmation Evidence',
        '## Submit And Confirmation Evidence',
        '## Reconciliation Evidence',
        'Submission timestamp',
      ),
      ...validateSubmitConfirmationNumericConsistency(markdown),
      ...validateSubmittedTransactionMatchesDryRun(markdown),
      ...validateSubmitConfirmationLifecycleBindings(markdown, rowByGate),
      ...validateSubmitBoxIds(markdown),
      ...validateMinerFeeOutput(markdown),
    );
  }

  if (rowByGate.get('Reconciliation evidence')?.status === 'pass') {
    errors.push(
      ...validateRequiredListFields(
        markdown,
        'Reconciliation Evidence',
        '## Reconciliation Evidence',
        '## Rollback And Cleanup',
        REQUIRED_RECONCILIATION_FIELDS,
        REQUIRED_RECONCILIATION_EXPECTATIONS,
        REQUIRED_RECONCILIATION_EVIDENCE_MARKER_FIELDS,
      ),
      ...validateReconciliationBindings(markdown),
    );
  }

  return errors;
}

function validateBroadcastNetworkReconfirmation(markdown: string): string[] {
  const sessionFields = parseListFields(sectionBetween(
    markdown,
    '## Session Metadata',
    '## Lifecycle Gate Classification',
  ));
  const broadcastFields = parseListFields(sectionBetween(
    markdown,
    '## Broadcast Enablement Evidence',
    '## Submit And Confirmation Evidence',
  ));
  const ergoNetwork = sessionFields.get('Ergo node network')?.trim() ?? '';
  const sidechainNetwork = sessionFields.get('Sidechain network')?.trim() ?? '';
  const reconfirmed = broadcastFields.get('Node URL and network re-confirmed') ?? '';
  const errors: string[] = [];

  if (isBlank(reconfirmed)) return errors;
  if (!/\bNode URL\b/i.test(reconfirmed) || !/\bhttps?:\/\/[^\s;)]+/i.test(reconfirmed)) {
    errors.push(
      'Broadcast Enablement Evidence: Node URL and network re-confirmed must cite Node URL',
    );
  }
  if (
    !isBlank(ergoNetwork)
    && (
      !containsCaseInsensitive(reconfirmed, 'Ergo node network')
      || !containsCaseInsensitive(reconfirmed, ergoNetwork)
    )
  ) {
    errors.push(
      'Broadcast Enablement Evidence: Node URL and network re-confirmed must name Session Metadata Ergo node network',
    );
  }
  if (identifiesPositiveTestnetNetwork(ergoNetwork) && hasForbiddenTestnetNetworkWording(reconfirmed)) {
    errors.push(
      'Broadcast Enablement Evidence: Node URL and network re-confirmed must not include negated or mixed testnet network wording',
    );
  }
  if (
    !isBlank(sidechainNetwork)
    && (
      !containsCaseInsensitive(reconfirmed, 'Sidechain network')
      || !containsCaseInsensitive(reconfirmed, sidechainNetwork)
    )
  ) {
    errors.push(
      'Broadcast Enablement Evidence: Node URL and network re-confirmed must name Session Metadata Sidechain network',
    );
  }

  return errors;
}

function validateBroadcastReviewerApproval(markdown: string): string[] {
  const sessionFields = parseListFields(sectionBetween(
    markdown,
    '## Session Metadata',
    '## Lifecycle Gate Classification',
  ));
  const dryRunFields = parseListFields(sectionBetween(
    markdown,
    '## Dry-Run Settlement Evidence',
    '## Broadcast Enablement Evidence',
  ));
  const broadcastFields = parseListFields(sectionBetween(
    markdown,
    '## Broadcast Enablement Evidence',
    '## Submit And Confirmation Evidence',
  ));
  const reviewer = sessionFields.get('Reviewer')?.trim() ?? '';
  const expectedTxId = extractSingleTxId(dryRunFields.get('Expected transaction ID') ?? '');
  const approval = broadcastFields.get('Reviewer approval recorded') ?? '';
  const errors: string[] = [];

  if (isBlank(approval)) return errors;
  if (!isBlank(reviewer) && !containsExactReviewerIdentity(approval, reviewer)) {
    errors.push(
      'Broadcast Enablement Evidence: Reviewer approval recorded must name the Session Metadata Reviewer',
    );
  }
  if (!/\bexplicit\b.*\blive broadcast approval\b/i.test(approval)) {
    errors.push(
      'Broadcast Enablement Evidence: Reviewer approval recorded must state explicit live broadcast approval',
    );
  }
  if (hasNegatedLiveBroadcastApproval(approval)) {
    errors.push(
      'Broadcast Enablement Evidence: Reviewer approval recorded must not negate explicit live broadcast approval',
    );
  }
  if (expectedTxId !== undefined && !containsCaseInsensitive(approval, expectedTxId)) {
    errors.push(
      'Broadcast Enablement Evidence: Reviewer approval recorded must cite Expected transaction ID',
    );
  }

  return errors;
}

function validateBroadcastUserApproval(markdown: string): string[] {
  const dryRunFields = parseListFields(sectionBetween(
    markdown,
    '## Dry-Run Settlement Evidence',
    '## Broadcast Enablement Evidence',
  ));
  const broadcastFields = parseListFields(sectionBetween(
    markdown,
    '## Broadcast Enablement Evidence',
    '## Submit And Confirmation Evidence',
  ));
  const expectedTxId = extractSingleTxId(dryRunFields.get('Expected transaction ID') ?? '');
  const approval = broadcastFields.get('User approval recorded') ?? '';
  const errors: string[] = [];

  if (isBlank(approval)) return errors;
  if (!/\buser\b/i.test(approval)) {
    errors.push(
      'Broadcast Enablement Evidence: User approval recorded must identify user approval',
    );
  }
  if (!/\bexplicit\b.*\blive broadcast approval\b/i.test(approval)) {
    errors.push(
      'Broadcast Enablement Evidence: User approval recorded must state explicit live broadcast approval',
    );
  }
  if (hasNegatedLiveBroadcastApproval(approval)) {
    errors.push(
      'Broadcast Enablement Evidence: User approval recorded must not negate explicit live broadcast approval',
    );
  }
  if (expectedTxId !== undefined && !containsCaseInsensitive(approval, expectedTxId)) {
    errors.push(
      'Broadcast Enablement Evidence: User approval recorded must cite Expected transaction ID',
    );
  }

  return errors;
}

function hasNegatedLiveBroadcastApproval(value: string): boolean {
  return (
    /\b(?:no|not|without|missing|absent|denied|declined|rejected|revoked|unapproved)\b.{0,100}\b(?:explicit\s+)?live broadcast approval\b/i.test(value) ||
    /\b(?:did|does|do)\s+not\b.{0,100}\b(?:explicit\s+)?live broadcast approval\b/i.test(value) ||
    /\b(?:explicit\s+)?live broadcast approval\b.{0,100}\b(?:not|missing|absent|denied|declined|rejected|revoked|unapproved)\b/i.test(value)
  );
}

function containsExactReviewerIdentity(value: string, reviewer: string): boolean {
  const escaped = reviewer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`).test(value);
}

function containsCaseInsensitive(value: string, expected: string): boolean {
  return value.toLowerCase().includes(expected.toLowerCase());
}

function validateRequiredListFields(
  markdown: string,
  label: string,
  startHeading: string,
  endHeading: string,
  fields: string[],
  expectations: { field: string; pattern: RegExp; message: string }[] = [],
  evidenceMarkerFields: string[] = [],
): string[] {
  const values = parseListFields(sectionBetween(markdown, startHeading, endHeading));
  const errors: string[] = [];
  errors.push(
    ...validateDuplicateRequiredListFields(
      label,
      sectionBetween(markdown, startHeading, endHeading),
      fields,
    ),
  );

  for (const field of fields) {
    if (isBlank(values.get(field) ?? '')) errors.push(`${label}: ${field} is required`);
  }
  for (const expectation of expectations) {
    const value = values.get(expectation.field) ?? '';
    if (!isBlank(value) && !expectation.pattern.test(value.trim())) {
      errors.push(`${label}: ${expectation.field} ${expectation.message}`);
    }
  }
  for (const field of evidenceMarkerFields) {
    const value = values.get(field) ?? '';
    if (!isBlank(value) && !hasEvidenceMarker(value)) {
      errors.push(`${label}: ${field} must include a link, command, or artifact marker`);
    }
    if (!isBlank(value) && hasEvidenceMarker(value) && !hasCompletedEvidenceTarget(value)) {
      errors.push(`${label}: ${field} ${COMPLETED_EVIDENCE_TARGET_REQUIREMENT}`);
    }
  }

  return errors;
}

function validateDryRunTransactionsCheckPositiveEvidence(markdown: string): string[] {
  const values = parseListFields(sectionBetween(
    markdown,
    '## Dry-Run Settlement Evidence',
    '## Broadcast Enablement Evidence',
  ));
  const value = values.get('`/transactions/check` result') ?? '';
  if (isBlank(value) || !/\b(pass|passed|ok)\b/i.test(value)) return [];
  if (!hasContradictoryValidationFailureMarker(value)) return [];
  return [
    'Dry-Run Settlement Evidence: `/transactions/check` result must contain internally positive pass, passed, or ok evidence',
  ];
}

function validateCleanDeploymentStateEvidence(
  markdown: string,
  rowByGate: Map<string, RehearsalEvidenceRow>,
): string[] {
  const errors: string[] = [];
  const freshLifecyclePassed =
    rowByGate.get('Fresh local devnet lifecycle')?.status === 'pass' ||
    rowByGate.get('Fresh testnet lifecycle')?.status === 'pass';
  if (!freshLifecyclePassed) return errors;

  const values = parseListFields(sectionBetween(
    markdown,
    '## Preflight Evidence',
    '## Dry-Run Settlement Evidence',
  ));
  const value = values.get('Clean deployment state evidence') ?? '';
  if (isBlank(value)) {
    errors.push('Preflight Evidence: Clean deployment state evidence is required when a fresh lifecycle passes');
    return errors;
  }
  if (!hasEvidenceMarker(value)) {
    errors.push('Preflight Evidence: Clean deployment state evidence must include a link, command, or artifact marker');
  } else if (!hasCompletedEvidenceTarget(value)) {
    errors.push(
      `Preflight Evidence: Clean deployment state evidence ${COMPLETED_EVIDENCE_TARGET_REQUIREMENT}`,
    );
  }
  if (!/clean deployment state/i.test(value)) {
    errors.push('Preflight Evidence: Clean deployment state evidence must mention clean deployment state');
  }
  if (!/deployment[- ]state (hash|digest)/i.test(value)) {
    errors.push('Preflight Evidence: Clean deployment state evidence must mention deployment-state hash or digest');
  } else if (!DEPLOYMENT_STATE_HASH_VALUE_PATTERN.test(value)) {
    errors.push(
      'Preflight Evidence: Clean deployment state evidence must include a concrete 32-byte deployment-state hash or digest',
    );
  }
  if (!/contract IDs?/i.test(value)) {
    errors.push('Preflight Evidence: Clean deployment state evidence must mention contract IDs');
  } else if (!CONTRACT_IDS_VALUE_PATTERN.test(value)) {
    errors.push(
      'Preflight Evidence: Clean deployment state evidence must include at least one concrete 32-byte contract ID',
    );
  }
  if (!/singleton inventory/i.test(value)) {
    errors.push('Preflight Evidence: Clean deployment state evidence must mention singleton inventory');
  } else if (!SINGLETON_INVENTORY_VALUE_PATTERN.test(value)) {
    errors.push(
      'Preflight Evidence: Clean deployment state evidence must include at least one concrete 32-byte singleton inventory identifier',
    );
  }

  return errors;
}

function validateContextExtensionGuardEvidence(markdown: string): string[] {
  const values = parseListFields(sectionBetween(
    markdown,
    '## Preflight Evidence',
    '## Dry-Run Settlement Evidence',
  ));
  const value = values.get('ContextExtension guard result') ?? '';
  if (isBlank(value)) return [];

  const errors: string[] = [];
  if (!/\bContextExtension\b/i.test(value) || !/\bguard\b/i.test(value)) {
    errors.push('Preflight Evidence: ContextExtension guard result must identify the ContextExtension guard');
  }
  if (!/\bsigma[- ]?rust\b/i.test(value) || !/\bJVM\b/i.test(value)) {
    errors.push('Preflight Evidence: ContextExtension guard result must cite sigma-rust/JVM conformance coverage');
  }
  if (!/\bfail[- ]closed\b/i.test(value)) {
    errors.push('Preflight Evidence: ContextExtension guard result must cite fail-closed behavior');
  }

  return errors;
}

function validatePreflightBroadcastPolicyEvidence(markdown: string): string[] {
  const values = parseListFields(sectionBetween(
    markdown,
    '## Preflight Evidence',
    '## Dry-Run Settlement Evidence',
  ));
  const value = values.get('Broadcast policy result') ?? '';
  if (isBlank(value)) return [];

  const errors: string[] = [];
  if (!/\bbroadcast policy\b/i.test(value)) {
    errors.push('Preflight Evidence: Broadcast policy result must identify broadcast policy output');
  }
  if (!BROADCAST_DISABLED_POLICY_PATTERN.test(value)) {
    errors.push(
      'Preflight Evidence: Broadcast policy result must prove broadcast is disabled or refused before any live broadcast window',
    );
  }
  if (BROADCAST_ENABLED_INDICATOR_PATTERN.test(value)) {
    errors.push(
      'Preflight Evidence: Broadcast policy result must not include enabled or approved broadcast indicators before the live broadcast window',
    );
  }

  return errors;
}

function validatePublicationEvidence(markdown: string): string[] {
  const section = sectionBetween(markdown, '## Publication Evidence', '## Reviewer Sign-Off');
  const fields = parseListFields(section);
  const errors: string[] = [];
  errors.push(...validateDuplicateRequiredListFields('Publication Evidence', section, REQUIRED_PUBLICATION_EVIDENCE_FIELDS));
  errors.push(...validateDedicatedPublicationClaimFields(markdown));
  const publicationClaim = classifyPublicationClaimText(section);
  if (publicationClaim.hasMainnetProductionClaim) {
    errors.push(`Publication Evidence: ${MAINNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (publicationClaim.hasProductionReadyClaim) {
    errors.push(`Publication Evidence: ${CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (publicationClaim.hasProductionClaim) {
    errors.push(
      'Publication Evidence: production claim wording is not allowed in Gate 3 publication evidence; claim fields must remain no',
    );
  }

  for (const field of REQUIRED_PUBLICATION_EVIDENCE_FIELDS) {
    if (isBlank(fields.get(field) ?? '')) errors.push(`Publication Evidence: ${field} is required`);
  }

  const releaseNotesUpdated = fields.get('Release notes updated') ?? '';
  if (!isBlank(releaseNotesUpdated) && releaseNotesUpdated !== 'yes') {
    errors.push('Publication Evidence: Release notes updated must be yes before rehearsal evidence can pass');
  }

  const registerUpdated = fields.get('Pending Evidence Register updated') ?? '';
  if (!isBlank(registerUpdated) && registerUpdated !== 'yes') {
    errors.push('Publication Evidence: Pending Evidence Register updated must be yes before rehearsal evidence can pass');
  }

  const productionReadyClaim = fields.get('Production-ready claim allowed by this rehearsal') ?? '';
  if (!isBlank(productionReadyClaim) && productionReadyClaim !== 'no') {
    errors.push('Publication Evidence: Production-ready claim allowed by this rehearsal must be no');
  }

  const testnetProductionCandidateClaim =
    fields.get('Testnet production-candidate claim allowed by this rehearsal') ?? '';
  if (!isBlank(testnetProductionCandidateClaim) && testnetProductionCandidateClaim !== 'no') {
    errors.push(
      'Publication Evidence: Testnet production-candidate claim allowed by this rehearsal must be no',
    );
  }

  const releaseNoteUpdates = fields.get('Required release-note updates') ?? '';
  if (!identifiesRehearsalPublicationEvidenceKind(
    releaseNoteUpdates,
    'completed Gate 3 rehearsal release-note update evidence',
  )) {
    errors.push(
      'Publication Evidence: Required release-note updates must include completed Gate 3 rehearsal release-note update evidence',
    );
  }
  if (!isBlank(releaseNoteUpdates) && !hasCompletedEvidenceTarget(releaseNoteUpdates)) {
    errors.push(
      'Publication Evidence: Required release-note updates requires completed release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  }
  if (hasContradictoryValidationFailureMarker(releaseNoteUpdates)) {
    errors.push(
      'Publication Evidence: Required release-note updates must not include contradictory rehearsal failure markers',
    );
  }
  errors.push(...validateRehearsalPublicationUpdateClaimDenials(
    'Required release-note updates',
    releaseNoteUpdates,
  ));

  const checklistUpdates = fields.get('Required checklist updates') ?? '';
  if (!identifiesRehearsalPublicationEvidenceKind(
    checklistUpdates,
    'completed Gate 3 checklist update evidence',
  )) {
    errors.push(
      'Publication Evidence: Required checklist updates must include completed Gate 3 checklist update evidence',
    );
  }
  if (!isBlank(checklistUpdates) && !hasCompletedEvidenceTarget(checklistUpdates)) {
    errors.push(
      'Publication Evidence: Required checklist updates requires completed checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  }
  if (hasContradictoryValidationFailureMarker(checklistUpdates)) {
    errors.push(
      'Publication Evidence: Required checklist updates must not include contradictory rehearsal failure markers',
    );
  }
  errors.push(...validateRehearsalPublicationUpdateClaimDenials(
    'Required checklist updates',
    checklistUpdates,
  ));
  if (
    !isBlank(releaseNoteUpdates) &&
    !isBlank(checklistUpdates) &&
    hasSharedCompletedEvidenceTarget(releaseNoteUpdates, checklistUpdates)
  ) {
    errors.push(
      'Publication Evidence: Required release-note and checklist updates must use distinct completed Gate 3 publication evidence targets',
    );
  }

  return errors;
}

function validateRehearsalPublicationUpdateClaimDenials(label: string, value: string): string[] {
  if (isBlank(value)) return [];
  const errors: string[] = [];
  if (!hasExactProductionReadyClaimDenialByRehearsal(value)) {
    errors.push(
      `Publication Evidence: ${label} must use exact ${EXACT_PRODUCTION_READY_CLAIM_DENIAL_BY_REHEARSAL}`,
    );
  }
  if (!hasExactTestnetProductionCandidateClaimDenialByRehearsal(value)) {
    errors.push(
      `Publication Evidence: ${label} must use exact ${EXACT_TESTNET_PRODUCTION_CANDIDATE_CLAIM_DENIAL_BY_REHEARSAL}`,
    );
  }
  return errors;
}

function hasExactProductionReadyClaimDenialByRehearsal(value: string): boolean {
  return /\bproduction-ready claim allowed by this rehearsal:\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactTestnetProductionCandidateClaimDenialByRehearsal(value: string): boolean {
  return /\btestnet production-candidate claim allowed by this rehearsal:\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function validateDedicatedPublicationClaimFields(markdown: string): string[] {
  const errors: string[] = [];
  const markdownForClaimFieldCounting = stripSection(
    markdown,
    '## Post-Submit Gate Binding',
    '## Rollback And Cleanup',
  );

  for (const field of REQUIRED_PUBLICATION_CLAIM_FIELDS) {
    const escapedField = escapeRegExp(field);
    const dedicatedNoLinePattern = new RegExp(`^-\\s+${escapedField}\\s*:\\s*no\\s*$`, 'gm');
    const dedicatedFieldLinePattern = new RegExp(`^-\\s+${escapedField}\\s*:`, 'gm');
    const hiddenClaimMarkerPattern = new RegExp(`${escapedField}\\s*(?:=|:)\\s*(?!no\\b)[^\\r\\n]+`, 'i');
    const markdownWithoutDedicatedNoLines = markdownForClaimFieldCounting.replace(dedicatedNoLinePattern, '');
    const markdownWithoutAllowedClaimDenials = stripRehearsalExactClaimDenials(
      markdownWithoutDedicatedNoLines,
    );
    const dedicatedNoLineCount = [...markdownForClaimFieldCounting.matchAll(dedicatedNoLinePattern)].length;
    const dedicatedFieldLineCount = [...markdownForClaimFieldCounting.matchAll(dedicatedFieldLinePattern)].length;

    if (
      dedicatedFieldLineCount !== 1 ||
      dedicatedNoLineCount !== 1 ||
      hiddenClaimMarkerPattern.test(markdownWithoutAllowedClaimDenials)
    ) {
      errors.push(
        `Publication Evidence: ${field} must appear exactly once as a dedicated field with value no`,
      );
    }
  }

  return errors;
}

function stripRehearsalExactClaimDenials(value: string): string {
  return value
    .replace(/\bproduction-ready claim allowed by this rehearsal:\s*no\s*(?=$|[.;,|)\]\r\n])/ig, '')
    .replace(/\btestnet production-candidate claim allowed by this rehearsal:\s*no\s*(?=$|[.;,|)\]\r\n])/ig, '');
}

function stripSection(markdown: string, startHeading: string, endHeading: string): string {
  const start = markdown.indexOf(startHeading);
  if (start === -1) return markdown;
  const end = markdown.indexOf(endHeading, start + startHeading.length);
  if (end === -1) return `${markdown.slice(0, start)}\n`;
  return `${markdown.slice(0, start)}\n${markdown.slice(end)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateIsoTimestampInSection(
  markdown: string,
  label: string,
  startHeading: string,
  endHeading: string,
  field: string,
): string[] {
  const values = parseListFields(sectionBetween(markdown, startHeading, endHeading));
  const errors: string[] = [];
  validateIsoUtcTimestampField(errors, values, label, field);
  return errors;
}

function validateSubmitConfirmationNumericConsistency(markdown: string): string[] {
  const values = parseListFields(sectionBetween(
    markdown,
    '## Submit And Confirmation Evidence',
    '## Reconciliation Evidence',
  ));
  const errors: string[] = [];
  const mempoolHeight = parseNonNegativeInteger(values.get('First observed mempool height') ?? '');
  const confirmationHeight = parseNonNegativeInteger(values.get('Confirmation height') ?? '');
  const confirmationCount = parseNonNegativeInteger(values.get('Confirmation count') ?? '');

  if (mempoolHeight === undefined && !isBlank(values.get('First observed mempool height') ?? '')) {
    errors.push('Submit And Confirmation Evidence: First observed mempool height must be a non-negative integer');
  } else if (!isSafeParsedInteger(mempoolHeight)) {
    errors.push('Submit And Confirmation Evidence: First observed mempool height must be a safe integer');
  }
  if (confirmationHeight === undefined && !isBlank(values.get('Confirmation height') ?? '')) {
    errors.push('Submit And Confirmation Evidence: Confirmation height must be a non-negative integer');
  } else if (!isSafeParsedInteger(confirmationHeight)) {
    errors.push('Submit And Confirmation Evidence: Confirmation height must be a safe integer');
  }
  if (confirmationCount === undefined && !isBlank(values.get('Confirmation count') ?? '')) {
    errors.push('Submit And Confirmation Evidence: Confirmation count must be a non-negative integer');
  } else if (!isSafeParsedInteger(confirmationCount)) {
    errors.push('Submit And Confirmation Evidence: Confirmation count must be a safe integer');
  }
  if (
    mempoolHeight !== undefined &&
    confirmationHeight !== undefined &&
    confirmationHeight < mempoolHeight
  ) {
    errors.push('Submit And Confirmation Evidence: Confirmation height must be greater than or equal to first observed mempool height');
  }
  if (confirmationCount !== undefined && confirmationCount <= 0) {
    errors.push('Submit And Confirmation Evidence: Confirmation count must be greater than 0');
  }

  return errors;
}

function validateFreshTestnetConfirmationPolicy(
  markdown: string,
  rowByGate: Map<string, RehearsalEvidenceRow>,
): string[] {
  const row = rowByGate.get('Fresh testnet lifecycle');
  if (row?.status !== 'pass') return [];

  const values = parseListFields(sectionBetween(
    markdown,
    '## Submit And Confirmation Evidence',
    '## Reconciliation Evidence',
  ));
  const errors: string[] = [];
  const confirmationCountText = values.get('Confirmation count') ?? '';
  const requiredConfirmationCountText = values.get('Required confirmation count') ?? '';
  const confirmationPolicyMet = values.get('Confirmation policy met') ?? '';
  const confirmationCount = parseNonNegativeInteger(confirmationCountText);
  const requiredConfirmationCount = parseNonNegativeInteger(requiredConfirmationCountText);
  const submittedTxId = extractSingleTxId(values.get('Submitted transaction ID') ?? '');
  const policyRequired = extractKeyedNonNegativeInteger(confirmationPolicyMet, 'confirmationsRequired');
  const policyObserved = extractKeyedNonNegativeInteger(confirmationPolicyMet, 'confirmationsObserved');

  if (isBlank(requiredConfirmationCountText)) {
    errors.push('Submit And Confirmation Evidence: Required confirmation count is required for Fresh testnet lifecycle pass');
  } else if (requiredConfirmationCount === undefined || requiredConfirmationCount <= 0) {
    errors.push('Submit And Confirmation Evidence: Required confirmation count must be a positive integer');
  } else if (!isSafeParsedInteger(requiredConfirmationCount)) {
    errors.push('Submit And Confirmation Evidence: Required confirmation count must be a safe integer');
  }

  if (isBlank(confirmationPolicyMet)) {
    errors.push('Submit And Confirmation Evidence: Confirmation policy met is required for Fresh testnet lifecycle pass');
  } else if (!/^yes\b/i.test(confirmationPolicyMet.trim())) {
    errors.push('Submit And Confirmation Evidence: Confirmation policy met must be yes for Fresh testnet lifecycle pass');
  } else if (!hasCompletedEvidenceTarget(confirmationPolicyMet)) {
    errors.push('Submit And Confirmation Evidence: Confirmation policy met must include a completed artifact marker or non-template evidence link for Fresh testnet lifecycle pass');
  }
  if (!isBlank(confirmationPolicyMet) && !/\bfinality\b/i.test(confirmationPolicyMet)) {
    errors.push('Submit And Confirmation Evidence: Confirmation policy met must link completed finality evidence for Fresh testnet lifecycle pass');
  }
  if (!isBlank(confirmationPolicyMet) && policyRequired === undefined) {
    errors.push('Submit And Confirmation Evidence: Confirmation policy met must cite confirmationsRequired');
  } else if (
    policyRequired !== undefined &&
    requiredConfirmationCount !== undefined &&
    policyRequired !== requiredConfirmationCount
  ) {
    errors.push('Submit And Confirmation Evidence: Confirmation policy met confirmationsRequired must match Required confirmation count');
  }
  if (!isBlank(confirmationPolicyMet) && policyObserved === undefined) {
    errors.push('Submit And Confirmation Evidence: Confirmation policy met must cite confirmationsObserved');
  } else if (
    policyObserved !== undefined &&
    confirmationCount !== undefined &&
    policyObserved !== confirmationCount
  ) {
    errors.push('Submit And Confirmation Evidence: Confirmation policy met confirmationsObserved must match Confirmation count');
  }
  requireHexReference(
    errors,
    confirmationPolicyMet,
    submittedTxId,
    'Submit And Confirmation Evidence: Confirmation policy met must cite submitted transaction ID',
  );

  if (
    confirmationCount !== undefined &&
    requiredConfirmationCount !== undefined &&
    requiredConfirmationCount > 0 &&
    confirmationCount < requiredConfirmationCount
  ) {
    errors.push('Submit And Confirmation Evidence: Confirmation count must be greater than or equal to Required confirmation count for Fresh testnet lifecycle pass');
  }

  return errors;
}

function validateFreshTestnetAssemblyEvidence(
  markdown: string,
  rowByGate: Map<string, RehearsalEvidenceRow>,
): string[] {
  const row = rowByGate.get('Fresh testnet lifecycle');
  if (row?.status !== 'pass') return [];

  const assemblySection = sectionBetween(
    markdown,
    '## Rehearsal Assembly Evidence',
    '## Session Metadata',
  );
  if (isBlank(assemblySection)) {
    return ['Rehearsal Assembly Evidence: completed testnet lifecycle requires assembly provenance'];
  }

  const assemblyValues = parseListFields(assemblySection);
  const dryRunValues = parseListFields(sectionBetween(
    markdown,
    '## Dry-Run Settlement Evidence',
    '## Broadcast Enablement Evidence',
  ));
  const expectedTxId = extractSingleTxId(dryRunValues.get('Expected transaction ID') ?? '');
  const livePreflightExpectedTxId = extractSingleTxId(
    assemblyValues.get('Live-preflight Expected transaction ID') ?? '',
  );
  const errors: string[] = [];
  const assemblyStatus = assemblyValues.get('Assembly status') ?? '';
  const livePreflightArtifact = assemblyValues.get('Live-preflight artifact') ?? '';
  const postSubmitFragment = assemblyValues.get('Post-submit fragment') ?? '';
  const postSubmitSourceTarget = assemblyValues.get('Post-submit source target') ?? '';

  requireAssemblySourceTarget(
    errors,
    assemblyValues,
    'Draft source target',
    'Rehearsal Assembly Evidence: Draft source target must cite completed non-template source evidence',
  );
  requireAssemblySourceTarget(
    errors,
    assemblyValues,
    'Live-preflight source target',
    'Rehearsal Assembly Evidence: Live-preflight source target must cite completed non-template source evidence',
  );
  requireAssemblySourceTarget(
    errors,
    assemblyValues,
    'Post-submit source target',
    'Rehearsal Assembly Evidence: Post-submit source target must cite completed non-template source evidence',
  );
  requireAssemblySourceTarget(
    errors,
    assemblyValues,
    'Post-submit observe JSON report',
    'Rehearsal Assembly Evidence: Post-submit observe JSON report must cite completed non-template JSON evidence',
  );
  const postSubmitObserveJson = assemblyValues.get('Post-submit observe JSON report') ?? '';
  const postSubmitSourceTargets = extractCompletedEvidenceTargets(postSubmitSourceTarget)
    .map(normalizeEvidenceTarget);
  const postSubmitObserveJsonTargets = extractCompletedEvidenceTargets(postSubmitObserveJson)
    .map(normalizeEvidenceTarget)
    .filter(target => /\.json$/i.test(target));
  if (!postSubmitSourceTargets.some(target => /\.json$/i.test(target))) {
    errors.push(
      'Rehearsal Assembly Evidence: Post-submit source target must cite completed structured post-submit observe JSON evidence',
    );
  }
  if (
    postSubmitSourceTargets.length > 0 &&
    postSubmitObserveJsonTargets.length > 0 &&
    !postSubmitSourceTargets.some(target => postSubmitObserveJsonTargets.includes(target))
  ) {
    errors.push('Rehearsal Assembly Evidence: Post-submit source target must match Post-submit observe JSON report');
  }
  if (postSubmitObserveJsonTargets.length === 0) {
    errors.push('Rehearsal Assembly Evidence: Post-submit observe JSON report must cite a concrete non-template JSON report');
  }
  if (rowByGate.get('Failed broadcast / phantom AVL evidence')?.status === 'pass') {
    requireAssemblySourceTarget(
      errors,
      assemblyValues,
      'Failed-broadcast source target',
      'Rehearsal Assembly Evidence: Failed-broadcast source target must cite completed non-template source evidence',
    );
  }
  if (rowByGate.get('Reorged burn / stale singleton evidence')?.status === 'pass') {
    requireAssemblySourceTarget(
      errors,
      assemblyValues,
      'Reorg-recovery source target',
      'Rehearsal Assembly Evidence: Reorg-recovery source target must cite completed non-template source evidence',
    );
  }

  if (!/\bpost[- ]?submit evidence included\b/i.test(assemblyStatus)) {
    errors.push('Rehearsal Assembly Evidence: Assembly status must be post-submit evidence included for completed testnet lifecycle');
  }
  if (!/\bPASS\b/.test(livePreflightArtifact) || !hasCompletedEvidenceTarget(livePreflightArtifact)) {
    errors.push('Rehearsal Assembly Evidence: Live-preflight artifact must cite completed PASS output evidence');
  } else if (hasContradictoryValidationFailureMarker(livePreflightArtifact)) {
    errors.push('Rehearsal Assembly Evidence: Live-preflight artifact must cite internally positive PASS output evidence');
  }
  if (livePreflightExpectedTxId === undefined) {
    errors.push('Rehearsal Assembly Evidence: Live-preflight Expected transaction ID must include exactly one 32-byte hex transaction ID');
  } else if (expectedTxId !== undefined && livePreflightExpectedTxId !== expectedTxId) {
    errors.push('Rehearsal Assembly Evidence: Live-preflight Expected transaction ID must match Dry-Run Settlement Evidence Expected transaction ID');
  }
  if (!/^included\b/i.test(postSubmitFragment.trim())) {
    errors.push('Rehearsal Assembly Evidence: Post-submit fragment must be included for completed testnet lifecycle');
  }
  errors.push(...validatePostSubmitLivePreflightBinding(markdown, expectedTxId));
  errors.push(...validateFreshCheckpointAssemblyFields(assemblyValues, expectedTxId, markdown));

  return errors;
}

function validatePostSubmitLivePreflightBinding(markdown: string, expectedTxId: string | undefined): string[] {
  const errors: string[] = [];
  const gateBindingSection = sectionBetween(
    markdown,
    '## Post-Submit Gate Binding',
    '## Rollback And Cleanup',
  );
  const binding = parseListFields(gateBindingSection).get('Live-preflight JSON binding') ?? '';

  if (isBlank(binding)) {
    return ['Post-Submit Gate Binding: Live-preflight JSON binding is required for completed testnet lifecycle'];
  }
  if (!hasConcreteJsonEvidenceTarget(binding)) {
    errors.push('Post-Submit Gate Binding: Live-preflight JSON binding must cite a concrete non-template JSON report');
  }
  if (!/\bstatus\s+GO\b/i.test(binding)) {
    errors.push('Post-Submit Gate Binding: Live-preflight JSON binding must cite status GO');
  }
  if (expectedTxId && !binding.toLowerCase().includes(expectedTxId)) {
    errors.push('Post-Submit Gate Binding: Live-preflight JSON binding must cite Dry-Run Expected transaction ID');
  }
  if (!/\bpre-submit boundary preserved\b/i.test(binding)) {
    errors.push('Post-Submit Gate Binding: Live-preflight JSON binding must preserve the pre-submit boundary');
  }
  if (!/\bauthorization evidence linked\b/i.test(binding)) {
    errors.push('Post-Submit Gate Binding: Live-preflight JSON binding must cite linked authorization evidence');
  }
  return errors;
}

function validateFreshCheckpointAssemblyFields(
  assemblyValues: Map<string, string>,
  expectedTxId: string | undefined,
  markdown: string,
): string[] {
  const freshCheckpoint = assemblyValues.get('Fresh checkpoint') ?? '';
  if (!/^included\b/i.test(freshCheckpoint.trim())) return [];

  const errors: string[] = [];
  const freshCheckpointExpectedTxId = extractSingleTxId(
    assemblyValues.get('Fresh checkpoint Expected transaction ID') ?? '',
  );
  const preflightValues = parseListFields(sectionBetween(
    markdown,
    '## Preflight Evidence',
    '## Dry-Run Settlement Evidence',
  ));
  const dryRunValues = parseListFields(sectionBetween(
    markdown,
    '## Dry-Run Settlement Evidence',
    '## Broadcast Enablement Evidence',
  ));
  const deploymentStateHash = extractDeploymentStateHash(
    preflightValues.get('Clean deployment state evidence') ?? '',
  );
  const dryRunBridgeEventRoot = extractSingleTxId(dryRunValues.get('Bridge event root') ?? '');
  const freshCheckpointDeploymentStateHash = extractSingleTxId(
    assemblyValues.get('Fresh checkpoint deployed-state hash') ?? '',
  );
  const freshness = assemblyValues.get('Fresh checkpoint singleton freshness') ?? '';
  const anchorObservations = assemblyValues.get('Fresh checkpoint live anchor observations') ?? '';
  const sourceBindings = assemblyValues.get('Fresh checkpoint sourceBindings') ?? '';
  const heightBindingSegment = sourceBindingSegment(sourceBindings, 'height');
  const singletonBindingSegment = sourceBindingSegment(sourceBindings, 'singleton');
  const anchorBindingSegment = sourceBindingSegment(sourceBindings, 'anchor');
  const boundary = assemblyValues.get('Fresh checkpoint boundary') ?? '';

  requireAssemblySourceTarget(
    errors,
    assemblyValues,
    'Fresh checkpoint source target',
    'Rehearsal Assembly Evidence: Fresh checkpoint source target must cite completed non-template source evidence',
  );
  if (containsForbiddenFreshCheckpointSourceBindingPayload(sourceBindings)) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must not serialize auth, secret, runtime, state, or database payloads');
  }
  if (!/\bheight\s*=\s*(?:live-read-only-sources|provided-json)\b/i.test(sourceBindings)) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must prove height evidence source provenance');
  }
  if (
    /\bheight\s*=\s*provided-json\b/i.test(sourceBindings) &&
    !hasConcreteProvidedJsonSourceTarget(sourceBindings, 'height')
  ) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings provided-json height evidence source must cite a concrete non-template JSON target');
  }
  if (
    /\bheight\s*=\s*live-read-only-sources\b/i.test(sourceBindings) &&
    !/\bheight\s*=\s*live-read-only-sources\b[\s\S]*\breadOnlyErgoNodeClient\s*=\s*true\b[\s\S]*\breadOnlySidechainRpcClient\s*=\s*true\b/i.test(sourceBindings)
  ) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must prove read-only height evidence clients');
  }
  if (/\bheight\s*=\s*live-read-only-sources\b/i.test(sourceBindings)) {
    if (!hasReadOnlyUrlBinding(heightBindingSegment, 'ergoNodeUrl')) {
      errors.push('Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must cite read-only Ergo node URL for live height evidence');
    }
    if (!hasReadOnlyUrlBinding(heightBindingSegment, 'sidechainRpcUrl')) {
      errors.push('Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must cite read-only sidechain RPC URL for live height evidence');
    }
    if (!/\bnodeAuthHeader\s*=\s*not-used\b/i.test(heightBindingSegment)) {
      errors.push('Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must prove height evidence nodeAuthHeader=not-used');
    }
  }
  if (
    /\bheight\s*=\s*live-read-only-sources\b/i.test(sourceBindings) &&
    (
      !/\bheight\s*=\s*live-read-only-sources\b[^;]*\boperations\s*=[^;]*\/info\b/i.test(sourceBindings) ||
      !/\bheight\s*=\s*live-read-only-sources\b[^;]*\boperations\s*=[^;]*getBlockNumber\b/i.test(sourceBindings)
    )
  ) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must cite /info and getBlockNumber height evidence operations');
  }
  if (!/\bsingleton\s*=\s*(?:live-read-only-node|provided-json)\b/i.test(sourceBindings)) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must prove singleton source provenance');
  }
  if (
    /\bsingleton\s*=\s*provided-json\b/i.test(sourceBindings) &&
    !hasConcreteProvidedJsonSourceTarget(sourceBindings, 'singleton')
  ) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings provided-json singleton source must cite a concrete non-template JSON target');
  }
  if (/\bsingleton\s*=\s*live-read-only-node\b/i.test(sourceBindings)) {
    if (!hasReadOnlyUrlBinding(singletonBindingSegment, 'ergoNodeUrl')) {
      errors.push('Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must cite read-only Ergo node URL for live singleton evidence');
    }
    if (!/\bnodeAuthHeader\s*=\s*not-used\b/i.test(singletonBindingSegment)) {
      errors.push('Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must prove singleton nodeAuthHeader=not-used');
    }
  }
  if (!/\banchor\s*=\s*live-read-only-node\b/i.test(sourceBindings)) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must prove anchor live-read-only-node provenance');
  }
  if (!/\banchor\s*=\s*live-read-only-node\b[\s\S]*\breadOnlyNodeClient\s*=\s*true\b/i.test(sourceBindings)) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must prove read-only anchor observation');
  }
  if (/\banchor\s*=\s*live-read-only-node\b/i.test(sourceBindings)) {
    if (!hasReadOnlyUrlBinding(anchorBindingSegment, 'ergoNodeUrl')) {
      errors.push('Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must cite read-only Ergo node URL for live anchor evidence');
    }
    if (!/\bnodeAuthHeader\s*=\s*not-used\b/i.test(anchorBindingSegment)) {
      errors.push('Rehearsal Assembly Evidence: Fresh checkpoint sourceBindings must prove anchor nodeAuthHeader=not-used');
    }
  }
  if (!/\bpublication blocker\b/i.test(assemblyValues.get('Fresh checkpoint lifecycle status') ?? '')) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint lifecycle status must remain publication blocker');
  }
  if (freshCheckpointExpectedTxId === undefined) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint Expected transaction ID must include exactly one 32-byte hex transaction ID');
  } else if (expectedTxId !== undefined && freshCheckpointExpectedTxId !== expectedTxId) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint Expected transaction ID must match Dry-Run Settlement Evidence Expected transaction ID');
  }
  if (freshCheckpointDeploymentStateHash === undefined) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint deployed-state hash must include exactly one 32-byte hex deployment-state hash');
  } else if (deploymentStateHash !== undefined && freshCheckpointDeploymentStateHash !== deploymentStateHash) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint deployed-state hash must match Clean deployment state evidence');
  }
  if (!/\bfresh\b/i.test(freshness)) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint singleton freshness must be fresh');
  }
  if (extractKeyedNonNegativeInteger(freshness, 'ageSeconds') === undefined) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint singleton freshness must cite ageSeconds');
  }
  if (extractKeyedNonNegativeInteger(freshness, 'maxAgeSeconds') !== 900) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint singleton freshness must cite maxAgeSeconds=900');
  }
  if (!/\b(?:live-read-only-node|read-only)\b/i.test(anchorObservations)) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must cite read-only source binding');
  }
  if (!/\/info/i.test(anchorObservations)) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must cite /info source binding');
  }
  if (!/\bobservedAt\b/i.test(anchorObservations)) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must cite observedAt freshness evidence');
  }
  if (!/\bnodeHeight\b/i.test(anchorObservations)) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must cite nodeHeight freshness evidence');
  }
  if (extractKeyedNonNegativeInteger(anchorObservations, 'maxAgeSeconds') !== 900) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must cite maxAgeSeconds=900');
  }
  if (!/\b0x0401\b/i.test(anchorObservations)) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must cite 0x0401');
  }
  if (!/\bbridgeEventRootHex\b/i.test(anchorObservations)) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must cite bridgeEventRootHex');
  }
  if (!/\bmatched\b/i.test(anchorObservations) || /\bnot matched\b/i.test(anchorObservations)) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must prove matching anchor fields');
  }
  if (!/\beach Ergo anchor height\b/i.test(anchorObservations)) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must cover each Ergo anchor height');
  }
  const observedBridgeEventRoots = extractFreshCheckpointAnchorObservationRoots(anchorObservations);
  if (observedBridgeEventRoots.length === 0) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations must cite concrete observed bridgeEventRootHex roots');
  } else if (
    dryRunBridgeEventRoot !== undefined &&
    (observedBridgeEventRoots.length !== 1 || observedBridgeEventRoots[0] !== dryRunBridgeEventRoot)
  ) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint live anchor observations roots must exactly match Dry-Run Settlement Evidence Bridge event root');
  }
  if (!/\bdoes not authorize broadcast\b/i.test(boundary)) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint boundary must state it does not authorize broadcast');
  }
  if (!/\bclose Gate 3\b/i.test(boundary)) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint boundary must state it cannot close Gate 3');
  }
  if (!/\breplace live submit\/confirmation\/reconciliation\b/i.test(boundary)) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint boundary must state it cannot replace live submit/confirmation/reconciliation');
  }
  if (!/\bproduction-ready\/testnet production-candidate claims\b/i.test(boundary)) {
    errors.push('Rehearsal Assembly Evidence: Fresh checkpoint boundary must state it cannot support production-ready/testnet production-candidate claims');
  }

  return errors;
}

function requireAssemblySourceTarget(
  errors: string[],
  assemblyValues: Map<string, string>,
  field: string,
  message: string,
): void {
  if (!hasCompletedEvidenceTarget(assemblyValues.get(field) ?? '')) {
    errors.push(message);
  }
}

function hasConcreteProvidedJsonSourceTarget(sourceBindings: string, sourceName: 'height' | 'singleton'): boolean {
  const target = new RegExp(`\\b${sourceName}\\s*=\\s*provided-json\\b[^;]*\\btarget\\s*=\\s*([^\\s;]+)`, 'i')
    .exec(sourceBindings)?.[1];
  return target !== undefined && isConcreteJsonEvidenceTarget(target);
}

function sourceBindingSegment(sourceBindings: string, sourceName: 'height' | 'singleton' | 'anchor'): string {
  return sourceBindings
    .split(';')
    .find(segment => new RegExp(`\\b${sourceName}\\s*=`, 'i').test(segment)) ?? '';
}

function containsForbiddenFreshCheckpointSourceBindingPayload(value: string): boolean {
  const normalized = value.toLowerCase().replace(/\\/g, '/');
  return (
    /(?:^|[\s;,])(?:authheader|authorization|api[-_ ]?key|apikey|token|secret|password|credential|runtimepath|statepath|dbpath)\s*=/i.test(value) ||
    /\b(?:authorization|bearer|api[-_ ]?key|auth[-_ ]?header|secret|password|credential)\b/i.test(value) ||
    isSharedSensitiveOrRuntimeEvidenceText(normalized)
  );
}

function isSharedSensitiveOrRuntimeEvidenceText(normalized: string): boolean {
  return evidenceTargetInspectionVariants(normalized).some(isSharedSensitiveOrRuntimeEvidenceInspectionText);
}

function isSharedSensitiveOrRuntimeEvidenceInspectionText(normalized: string): boolean {
  const name = basename(normalized);
  return (
    hasEvidenceEnvironmentTargetSegment(normalized) ||
    hasRuntimeDatabaseTargetSegment(normalized) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalized, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalized)
  );
}

function hasEvidenceEnvironmentTargetSegment(normalized: string): boolean {
  return normalized
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasRuntimeDatabaseTargetSegment(normalized: string): boolean {
  return normalized
    .split(/[\s,;=()]+/)
    .some(segment => isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function hasReadOnlyUrlBinding(segment: string, fieldName: 'ergoNodeUrl' | 'sidechainRpcUrl'): boolean {
  const raw = new RegExp(`\\b${fieldName}\\s*=\\s*([^\\s;]+)`, 'i').exec(segment)?.[1];
  if (!raw) return false;
  const value = raw.replace(/[),;]+$/g, '');
  const normalized = value.trim().toLowerCase();
  if (/[<>]/.test(normalized) || /\b(?:template|example|sample|generic|placeholder|todo|tbd)\b/.test(normalized)) {
    return false;
  }
  return validateReadOnlyNodeUrl(value, `Fresh checkpoint ${fieldName}`).length === 0;
}

function isConcreteJsonEvidenceTarget(target: string): boolean {
  const normalizedTarget = target.trim().replace(/\\/g, '/').replace(/[),;]+$/g, '').toLowerCase();
  return (
    /^[^<>]+\.json$/.test(normalizedTarget) &&
    !normalizedTarget.startsWith('/') &&
    !/^[a-z]:\//.test(normalizedTarget) &&
    !normalizedTarget.includes('://') &&
    !hasNonConcreteJsonEvidenceTarget(normalizedTarget) &&
    !isSharedSensitiveOrRuntimeEvidenceText(normalizedTarget)
  );
}

function hasConcreteJsonEvidenceTarget(value: string): boolean {
  return extractJsonEvidenceTargetTokens(value).some(isConcreteJsonEvidenceTarget);
}

function extractJsonEvidenceTargetTokens(value: string): string[] {
  return [...value.matchAll(/\b[^\s<>),;]+\.json\b/gi)].map(([target]) => target);
}

function hasNonConcreteJsonEvidenceTarget(normalizedTarget: string): boolean {
  return normalizedTarget
    .replace(/\\/g, '/')
    .split(/[\\/]+/)
    .some(segment => isNonConcreteJsonEvidenceTargetSegment(segment));
}

function isNonConcreteJsonEvidenceTargetSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /[<>]/.test(segment) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example)[-_ ]*evidence(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example|template)(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|validator|json|report|lifecycle|live|preflight|rehearsal|post|submit|observe|fresh|checkpoint)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:proof|evidence|artifact|target|log|run|check|update|validator|json|report|lifecycle|live|preflight|rehearsal|post|submit|observe|fresh|checkpoint)(?:[-_.](?:sample|example|template)(?:[-_.]|$))/i.test(normalized)
  );
}

function extractFreshCheckpointAnchorObservationRoots(value: string): string[] {
  const rootsSegments = [...value.matchAll(/\broots?\s*=\s*([^;\n]+)/gi)]
    .map(match => match[1]);
  if (rootsSegments.length === 0) return [];
  return extractUniqueHex32Values(rootsSegments.join(','));
}

function extractDeploymentStateHash(value: string): string | undefined {
  return /deployment[- ]state (?:hash|digest)\s*(?:=|:|is)\s*(?:0x)?([0-9a-fA-F]{64})\b/i
    .exec(value)?.[1]?.toLowerCase();
}

function extractKeyedNonNegativeInteger(value: string, key: string): number | undefined {
  const match = new RegExp(`\\b${escapeRegExp(key)}\\s*=\\s*(\\d+)\\b`, 'i').exec(value);
  return match ? Number(match[1]) : undefined;
}

function validateExpectedTransactionId(markdown: string): string[] {
  const values = parseListFields(sectionBetween(
    markdown,
    '## Dry-Run Settlement Evidence',
    '## Broadcast Enablement Evidence',
  ));
  const expectedTxId = extractSingleTxId(values.get('Expected transaction ID') ?? '');
  if (expectedTxId === undefined && !isBlank(values.get('Expected transaction ID') ?? '')) {
    return ['Dry-Run Settlement Evidence: Expected transaction ID must include exactly one 32-byte hex transaction ID'];
  }
  return [];
}

function validateDaemonApprovalEvidence(
  markdown: string,
  rowByGate: Map<string, RehearsalEvidenceRow>,
): string[] {
  const values = parseListFields(sectionBetween(
    markdown,
    '## Dry-Run Settlement Evidence',
    '## Broadcast Enablement Evidence',
  ));
  const approval = values.get('Daemon approval evidence') ?? '';
  if (isBlank(approval)) return [];

  const expectedTxId = extractSingleTxId(values.get('Expected transaction ID') ?? '');
  const pegOutBurnTxId = extractSingleTxId(values.get('Peg-out burn TX ID') ?? '');
  const errors: string[] = [];
  const submitPassed =
    rowByGate.get('Settlement submit evidence')?.status === 'pass' ||
    rowByGate.get('Confirmation evidence')?.status === 'pass';

  if (/\bN\/A\b/i.test(approval)) {
    if (/\bexplicit CLI submit workflow\b/i.test(approval)) return errors;
    if (/\bdaemon submit not planned\b/i.test(approval) || /\bbroadcast not approved\b/i.test(approval)) {
      if (submitPassed) {
        errors.push(
          'Dry-Run Settlement Evidence: Daemon approval evidence cannot be daemon-submit-not-planned or broadcast-not-approved when submit or confirmation evidence passes',
        );
      }
      return errors;
    }
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence N/A must identify explicit CLI submit workflow or daemon submit not planned; broadcast not approved is legacy rehearsal-only wording',
    );
    return errors;
  }

  if (!/\bdistinct\b.{0,80}\brehearsal:preflight\b.{0,80}\b(?:transcript|report)\b/i.test(approval)) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite distinct rehearsal:preflight transcript/report',
    );
  }
  if (!/\bnpm(?:\.cmd)?\s+run\s+rehearsal:preflight\b/i.test(approval)) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite npm run rehearsal:preflight',
    );
  }
  if (!/--prebroadcast\b/i.test(approval) || !/--approvals\b/i.test(approval)) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite --prebroadcast and --approvals targets',
    );
  }
  if (!/\b(versioned\s+approval\s+file|AGGREGATE_SETTLEMENT_APPROVALS_PATH)\b/i.test(approval)) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite the versioned approval file',
    );
  }
  if (!/\b(?:version\s*2|v2)\b/i.test(approval)) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite approval file version 2',
    );
  }
  if (!/\bmode\b.{0,32}\b(single|single-with-ingest|batch)\b/i.test(approval)) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite mode single, single-with-ingest, or batch',
    );
  }
  if (!/\b(?:runtime\s+context|context\s+binding|runtime\s+binding)\b/i.test(approval)) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite runtime context binding',
    );
  }
  if (!/\bergoNodeUrl\b/i.test(approval) || !/\bsidechainRpcUrl\b/i.test(approval) || !/\bsidechainWsUrl\b/i.test(approval)) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite bound node and sidechain URLs',
    );
  }
  if (!/\bdeployedStateHash\b/i.test(approval)) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite deployedStateHash',
    );
  }
  if (!/\b(?:active\s+approval\s+window|approvedAt\b.{0,80}\bexpiresAt\b)\b/i.test(approval)) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite active approval window',
    );
  }
  if (!/\bnon-mainnet\b/i.test(approval)) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite non-mainnet networks',
    );
  }
  if (!/\bnpm(?:\.cmd)?\s+run\s+settle:aggregate\s+--\s+check(?:-with-ingest|-anchored|-batch)?\b/i.test(approval)) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite non-broadcast aggregate check command',
    );
  }
  if (/\bnpm(?:\.cmd)?\s+run\s+settle:aggregate\s+--\s+(?:submit|confirm|trigger)\b/i.test(approval)) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence must not cite broadcast-capable aggregate commands',
    );
  }
  const citesCheckEvidence = /\bcheckEvidence\b/i.test(approval);
  const citesTransactionsCheckPass = /\/transactions\/check\b.{0,80}\bPASS\b/i.test(approval);
  if (!citesCheckEvidence && !citesTransactionsCheckPass) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite checkEvidence or /transactions/check PASS evidence',
    );
  } else if (hasContradictoryValidationFailureMarker(approval)) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence checkEvidence or /transactions/check PASS evidence must be internally positive',
    );
  }
  if (expectedTxId !== undefined && !containsCaseInsensitive(approval, expectedTxId)) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite Expected transaction ID',
    );
  }
  if (pegOutBurnTxId !== undefined && !containsCaseInsensitive(approval, pegOutBurnTxId)) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence must cite peg-out burn TX ID or ordered batch burn set',
    );
  }
  if (/\bbatch\b/i.test(approval) && !/\bordered\b.{0,40}\bburn\b/i.test(approval)) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence for batch mode must cite ordered batch burn set',
    );
  }
  if (/\bmode\b.{0,32}\bbatch\b/i.test(approval) && !/\bnpm(?:\.cmd)?\s+run\s+settle:aggregate\s+--\s+check-batch\b/i.test(approval)) {
    errors.push(
      'Dry-Run Settlement Evidence: Daemon approval evidence for batch mode must cite check-batch command',
    );
  }

  return errors;
}

function validateDryRunHexIdentifiers(markdown: string): string[] {
  const values = parseListFields(sectionBetween(
    markdown,
    '## Dry-Run Settlement Evidence',
    '## Broadcast Enablement Evidence',
  ));
  const errors: string[] = [];

  for (const field of [
    'Peg-in event ID or TX ID',
    'Peg-out burn TX ID',
    'Sidechain block hash',
    'Bridge event root',
  ]) {
    validateExactlyOneHex32Field(
      errors,
      'Dry-Run Settlement Evidence',
      field,
      values.get(field) ?? '',
      '32-byte hex value',
    );
  }

  return errors;
}

function validateSubmittedTransactionMatchesDryRun(markdown: string): string[] {
  const dryRunValues = parseListFields(sectionBetween(
    markdown,
    '## Dry-Run Settlement Evidence',
    '## Broadcast Enablement Evidence',
  ));
  const submitValues = parseListFields(sectionBetween(
    markdown,
    '## Submit And Confirmation Evidence',
    '## Reconciliation Evidence',
  ));
  const errors: string[] = [];
  const expectedTxId = extractSingleTxId(dryRunValues.get('Expected transaction ID') ?? '');
  const submittedTxId = extractSingleTxId(submitValues.get('Submitted transaction ID') ?? '');

  if (submittedTxId === undefined && !isBlank(submitValues.get('Submitted transaction ID') ?? '')) {
    errors.push('Submit And Confirmation Evidence: Submitted transaction ID must include exactly one 32-byte hex transaction ID');
  }
  if (
    expectedTxId !== undefined &&
    submittedTxId !== undefined &&
    submittedTxId !== expectedTxId
  ) {
    errors.push('Submit And Confirmation Evidence: Submitted transaction ID must match Expected transaction ID');
  }

  return errors;
}

function validateDryRunLifecycleBindings(
  markdown: string,
  rowByGate: Map<string, RehearsalEvidenceRow>,
): string[] {
  const dryRunValues = parseListFields(sectionBetween(
    markdown,
    '## Dry-Run Settlement Evidence',
    '## Broadcast Enablement Evidence',
  ));
  const pegInEventId = extractSingleTxId(dryRunValues.get('Peg-in event ID or TX ID') ?? '');
  const pegOutBurnTxId = extractSingleTxId(dryRunValues.get('Peg-out burn TX ID') ?? '');
  const sidechainBlockHash = extractSingleTxId(dryRunValues.get('Sidechain block hash') ?? '');
  const bridgeEventRoot = extractSingleTxId(dryRunValues.get('Bridge event root') ?? '');
  const expectedTxId = extractSingleTxId(dryRunValues.get('Expected transaction ID') ?? '');
  const ergoAnchorHeight = parseNonNegativeInteger(dryRunValues.get('Ergo anchor height') ?? '');
  const errors: string[] = [];

  requireLifecycleHexReference(
    errors,
    rowByGate.get('Peg-in evidence'),
    pegInEventId,
    'Lifecycle Gate Classification: Peg-in evidence must cite peg-in event ID or TX ID',
  );
  requireLifecycleHexReference(
    errors,
    rowByGate.get('Peg-out burn evidence'),
    pegOutBurnTxId,
    'Lifecycle Gate Classification: Peg-out burn evidence must cite peg-out burn TX ID',
  );
  requireLifecycleHexReference(
    errors,
    rowByGate.get('Anchor evidence'),
    sidechainBlockHash,
    'Lifecycle Gate Classification: Anchor evidence must cite sidechain block hash',
  );
  requireLifecycleHexReference(
    errors,
    rowByGate.get('Anchor evidence'),
    bridgeEventRoot,
    'Lifecycle Gate Classification: Anchor evidence must cite bridge event root',
  );
  requireLifecycleTextReference(
    errors,
    rowByGate.get('Anchor evidence'),
    ergoAnchorHeight?.toString(),
    'Lifecycle Gate Classification: Anchor evidence must cite Ergo anchor height',
  );
  requireLifecycleHexReference(
    errors,
    rowByGate.get('Settlement check evidence'),
    expectedTxId,
    'Lifecycle Gate Classification: Settlement check evidence must cite Expected transaction ID',
  );

  return errors;
}

function validateSubmitConfirmationLifecycleBindings(
  markdown: string,
  rowByGate: Map<string, RehearsalEvidenceRow>,
): string[] {
  const submitValues = parseListFields(sectionBetween(
    markdown,
    '## Submit And Confirmation Evidence',
    '## Reconciliation Evidence',
  ));
  const submittedTxId = extractSingleTxId(submitValues.get('Submitted transaction ID') ?? '');
  const errors: string[] = [];

  requireLifecycleHexReference(
    errors,
    rowByGate.get('Settlement submit evidence'),
    submittedTxId,
    'Lifecycle Gate Classification: Settlement submit evidence must cite submitted transaction ID',
  );
  requireLifecycleHexReference(
    errors,
    rowByGate.get('Confirmation evidence'),
    submittedTxId,
    'Lifecycle Gate Classification: Confirmation evidence must cite submitted transaction ID',
  );

  return errors;
}

function validateFreshTestnetLifecycleArtifactBindings(
  markdown: string,
  rowByGate: Map<string, RehearsalEvidenceRow>,
): string[] {
  const row = rowByGate.get('Fresh testnet lifecycle');
  if (row?.status !== 'pass') return [];

  const dryRunValues = parseListFields(sectionBetween(
    markdown,
    '## Dry-Run Settlement Evidence',
    '## Broadcast Enablement Evidence',
  ));
  const submitValues = parseListFields(sectionBetween(
    markdown,
    '## Submit And Confirmation Evidence',
    '## Reconciliation Evidence',
  ));
  const pegInEventId = extractSingleTxId(dryRunValues.get('Peg-in event ID or TX ID') ?? '');
  const pegOutBurnTxId = extractSingleTxId(dryRunValues.get('Peg-out burn TX ID') ?? '');
  const sidechainBlockHash = extractSingleTxId(dryRunValues.get('Sidechain block hash') ?? '');
  const bridgeEventRoot = extractSingleTxId(dryRunValues.get('Bridge event root') ?? '');
  const expectedTxId = extractSingleTxId(dryRunValues.get('Expected transaction ID') ?? '');
  const submittedTxId = extractSingleTxId(submitValues.get('Submitted transaction ID') ?? '');
  const errors: string[] = [];

  if (isPreBroadcastDryRunEvidence(row.evidenceArtifact)) {
    errors.push(FRESH_TESTNET_PREBROADCAST_PASS_EVIDENCE_ERROR);
  }

  requireHexReference(
    errors,
    row.evidenceArtifact,
    pegInEventId,
    'Fresh testnet lifecycle: evidence artifact must cite peg-in event ID or TX ID',
  );
  requireHexReference(
    errors,
    row.evidenceArtifact,
    pegOutBurnTxId,
    'Fresh testnet lifecycle: evidence artifact must cite peg-out burn TX ID',
  );
  requireHexReference(
    errors,
    row.evidenceArtifact,
    sidechainBlockHash,
    'Fresh testnet lifecycle: evidence artifact must cite sidechain block hash',
  );
  requireHexReference(
    errors,
    row.evidenceArtifact,
    bridgeEventRoot,
    'Fresh testnet lifecycle: evidence artifact must cite bridge event root',
  );
  requireHexReference(
    errors,
    row.evidenceArtifact,
    expectedTxId,
    'Fresh testnet lifecycle: evidence artifact must cite Expected transaction ID',
  );
  requireHexReference(
    errors,
    row.evidenceArtifact,
    submittedTxId,
    'Fresh testnet lifecycle: evidence artifact must cite submitted transaction ID',
  );

  return errors;
}

function isPreBroadcastDryRunEvidence(value: string): boolean {
  return (
    /(?:^|\s)artifact:\/\/[^\s)]*pre[-_]?broadcast\b/i.test(value) ||
    /(?:^|\s)artifact:\/\/[^\s)]*(?:non[-_]?broadcast[-_]?dry[-_]?run|check[-_]?only|pre[-_]?submit)\b/i.test(value) ||
    /\bpre[-_\s]?broadcast\b.{0,80}\bdry[-_\s]?run\b/i.test(value) ||
    /\bdry[-_\s]?run\b.{0,80}\bpre[-_\s]?broadcast\b/i.test(value) ||
    /\bnon[-_\s]?broadcast\b.{0,80}\bdry[-_\s]?run\b/i.test(value) ||
    /\bdry[-_\s]?run\b.{0,80}\bnon[-_\s]?broadcast\b/i.test(value) ||
    /\bcheck[-_\s]?only\b.{0,80}\bdry[-_\s]?run\b/i.test(value) ||
    /\bdry[-_\s]?run\b.{0,80}\bcheck[-_\s]?only\b/i.test(value) ||
    /\bpre[-_\s]?submit\b.{0,80}\bdry[-_\s]?run\b/i.test(value) ||
    /\bdry[-_\s]?run\b.{0,80}\bpre[-_\s]?submit\b/i.test(value) ||
    /\bdry[-_\s]?run\b.{0,120}\bno\s+live\s+submit\b/i.test(value) ||
    /\bno\s+live\s+submit\b.{0,120}\bdry[-_\s]?run\b/i.test(value) ||
    /\bdry[-_\s]?run\b.{0,120}\bno\s+mempool\s+observ(?:ed|ation)\b/i.test(value) ||
    /\bno\s+mempool\s+observ(?:ed|ation)\b.{0,120}\bdry[-_\s]?run\b/i.test(value)
  );
}

function validateSubmitBoxIds(markdown: string): string[] {
  const values = parseListFields(sectionBetween(
    markdown,
    '## Submit And Confirmation Evidence',
    '## Reconciliation Evidence',
  ));
  const errors: string[] = [];

  validateOneOrMoreHex32Field(
    errors,
    'Submit And Confirmation Evidence',
    'Settlement output box IDs',
    values.get('Settlement output box IDs') ?? '',
  );
  validateOneOrMoreHex32Field(
    errors,
    'Submit And Confirmation Evidence',
    'Recipient payout box IDs',
    values.get('Recipient payout box IDs') ?? '',
  );
  for (const field of [
    'DUP successor box ID',
    'SPV tracker successor box ID',
    'Recipient payout box ID',
  ]) {
    validateExactlyOneHex32Field(
      errors,
      'Submit And Confirmation Evidence',
      field,
      values.get(field) ?? '',
      '32-byte hex box ID',
    );
  }
  const recipientPayoutBoxId = extractSingleTxId(values.get('Recipient payout box ID') ?? '');
  const settlementOutputBoxIds = extractUniqueHex32Values(values.get('Settlement output box IDs') ?? '');
  const dupSuccessorBoxId = extractSingleTxId(values.get('DUP successor box ID') ?? '');
  const spvTrackerSuccessorBoxId = extractSingleTxId(values.get('SPV tracker successor box ID') ?? '');
  const recipientPayoutBoxIds = !isBlank(values.get('Recipient payout box IDs') ?? '')
    ? extractUniqueHex32Values(values.get('Recipient payout box IDs') ?? '')
    : recipientPayoutBoxId === undefined
      ? []
      : [recipientPayoutBoxId];
  const dryRunValues = parseListFields(sectionBetween(
    markdown,
    '## Dry-Run Settlement Evidence',
    '## Broadcast Enablement Evidence',
  ));
  const burnTxIds = extractUniqueHex32Values(dryRunValues.get('Peg-out burn TX ID') ?? '');
  if (
    !isBlank(values.get('Recipient payout box IDs') ?? '') &&
    recipientPayoutBoxId !== undefined &&
    !recipientPayoutBoxIds.includes(recipientPayoutBoxId)
  ) {
    errors.push(
      'Submit And Confirmation Evidence: Recipient payout box IDs must include Recipient payout box ID',
    );
  }
  if (burnTxIds.length > 0 && recipientPayoutBoxIds.length > 0 && burnTxIds.length !== recipientPayoutBoxIds.length) {
    errors.push(
      'Submit And Confirmation Evidence: Peg-out burn TX ID count must match recipient payout box ID count',
    );
  }
  if (dupSuccessorBoxId !== undefined && !settlementOutputBoxIds.includes(dupSuccessorBoxId)) {
    errors.push(
      'Submit And Confirmation Evidence: Settlement output box IDs must include DUP successor box ID',
    );
  }
  if (spvTrackerSuccessorBoxId !== undefined && !settlementOutputBoxIds.includes(spvTrackerSuccessorBoxId)) {
    errors.push(
      'Submit And Confirmation Evidence: Settlement output box IDs must include SPV tracker successor box ID',
    );
  }
  if (recipientPayoutBoxIds.some(boxId => !settlementOutputBoxIds.includes(boxId))) {
    errors.push(
      'Submit And Confirmation Evidence: Settlement output box IDs must include every recipient payout box ID',
    );
  }

  return errors;
}

function validateMinerFeeOutput(markdown: string): string[] {
  const values = parseListFields(sectionBetween(
    markdown,
    '## Submit And Confirmation Evidence',
    '## Reconciliation Evidence',
  ));
  const minerFeeOutput = values.get('Miner fee output') ?? '';
  if (isBlank(minerFeeOutput)) return [];

  const keyMatches = [...minerFeeOutput.matchAll(MINER_FEE_NANOERG_KEY_PATTERN)];
  const positiveFeeMatches = [...minerFeeOutput.matchAll(POSITIVE_MINER_FEE_NANOERG_PATTERN)];
  if (keyMatches.length !== 1 || positiveFeeMatches.length !== 1) {
    return ['Submit And Confirmation Evidence: Miner fee output must include exactly one positive feeNanoErg amount'];
  }
  if (!Number.isSafeInteger(Number(positiveFeeMatches[0][1]))) {
    return ['Submit And Confirmation Evidence: Miner fee output feeNanoErg must be a positive safe integer'];
  }

  return [];
}

function validateReconciliationBindings(markdown: string): string[] {
  const dryRunValues = parseListFields(sectionBetween(
    markdown,
    '## Dry-Run Settlement Evidence',
    '## Broadcast Enablement Evidence',
  ));
  const submitValues = parseListFields(sectionBetween(
    markdown,
    '## Submit And Confirmation Evidence',
    '## Reconciliation Evidence',
  ));
  const reconciliationValues = parseListFields(sectionBetween(
    markdown,
    '## Reconciliation Evidence',
    '## Rollback And Cleanup',
  ));
  const errors: string[] = [];

  const expectedSubmittedTxId = extractSingleTxId(submitValues.get('Submitted transaction ID') ?? '');
  const expectedDupSuccessorBoxId = extractSingleTxId(submitValues.get('DUP successor box ID') ?? '');
  const expectedSpvSuccessorBoxId = extractSingleTxId(submitValues.get('SPV tracker successor box ID') ?? '');
  const expectedRecipientPayoutBoxId = extractSingleTxId(submitValues.get('Recipient payout box ID') ?? '');
  const expectedRecipientPayoutBoxIds = extractUniqueHex32Values(submitValues.get('Recipient payout box IDs') ?? '');
  const expectedPegOutBurnTxId = extractSingleTxId(dryRunValues.get('Peg-out burn TX ID') ?? '');

  requireHexReference(
    errors,
    reconciliationValues.get('Peg-out status after reconciliation') ?? '',
    expectedSubmittedTxId,
    'Reconciliation Evidence: Peg-out status after reconciliation must cite submitted transaction ID',
  );
  requireHexReference(
    errors,
    reconciliationValues.get('DUP history contains only confirmed keys') ?? '',
    expectedDupSuccessorBoxId,
    'Reconciliation Evidence: DUP history contains only confirmed keys must cite submitted DUP successor box ID',
  );
  requireHexReference(
    errors,
    reconciliationValues.get('SPV tracker digest matches confirmed successor') ?? '',
    expectedSpvSuccessorBoxId,
    'Reconciliation Evidence: SPV tracker digest matches confirmed successor must cite submitted SPV tracker successor box ID',
  );
  requireHexReference(
    errors,
    reconciliationValues.get('No duplicate payout exists for the same burn') ?? '',
    expectedPegOutBurnTxId,
    'Reconciliation Evidence: No duplicate payout exists for the same burn must cite peg-out burn TX ID',
  );
  requireHexReference(
    errors,
    reconciliationValues.get('No duplicate payout exists for the same burn') ?? '',
    expectedRecipientPayoutBoxId,
    'Reconciliation Evidence: No duplicate payout exists for the same burn must cite recipient payout box ID',
  );
  for (const recipientPayoutBoxId of expectedRecipientPayoutBoxIds) {
    requireHexReference(
      errors,
      reconciliationValues.get('No duplicate payout exists for the same burn') ?? '',
      recipientPayoutBoxId,
      'Reconciliation Evidence: No duplicate payout exists for the same burn must cite every recipient payout box ID',
    );
  }

  return errors;
}

function validateRecoveryDrillBindings(
  markdown: string,
  rowByGate: Map<string, RehearsalEvidenceRow>,
): string[] {
  const errors: string[] = [];
  const dryRunValues = parseListFields(sectionBetween(
    markdown,
    '## Dry-Run Settlement Evidence',
    '## Broadcast Enablement Evidence',
  ));
  const preflightValues = parseListFields(sectionBetween(
    markdown,
    '## Preflight Evidence',
    '## Dry-Run Settlement Evidence',
  ));
  const expectedTxId = extractSingleTxId(dryRunValues.get('Expected transaction ID') ?? '');
  const pegOutBurnTxId = extractSingleTxId(dryRunValues.get('Peg-out burn TX ID') ?? '');
  const singletonInventoryId = extractSingletonInventoryId(
    preflightValues.get('Clean deployment state evidence') ?? '',
  );

  const failedBroadcast = rowByGate.get('Failed broadcast / phantom AVL evidence');
  if (failedBroadcast?.status === 'pass') {
    requireHexReference(
      errors,
      failedBroadcast.evidenceArtifact,
      expectedTxId,
      'Failed broadcast / phantom AVL evidence: evidence artifact must cite Expected transaction ID',
    );
    requireHexReference(
      errors,
      failedBroadcast.evidenceArtifact,
      pegOutBurnTxId,
      'Failed broadcast / phantom AVL evidence: evidence artifact must cite peg-out burn TX ID',
    );
  }

  const reorgedBurn = rowByGate.get('Reorged burn / stale singleton evidence');
  if (reorgedBurn?.status === 'pass') {
    requireHexReference(
      errors,
      reorgedBurn.evidenceArtifact,
      pegOutBurnTxId,
      'Reorged burn / stale singleton evidence: evidence artifact must cite peg-out burn TX ID',
    );
    requireHexReference(
      errors,
      reorgedBurn.evidenceArtifact,
      singletonInventoryId,
      'Reorged burn / stale singleton evidence: evidence artifact must cite singleton inventory identifier',
    );
  }

  return errors;
}

function requireHexReference(
  errors: string[],
  value: string,
  expected: string | undefined,
  message: string,
): void {
  if (expected === undefined || isBlank(value)) return;
  if (!extractUniqueHex32Values(value).includes(expected.toLowerCase())) {
    errors.push(message);
  }
}

function requireLifecycleHexReference(
  errors: string[],
  row: RehearsalEvidenceRow | undefined,
  expected: string | undefined,
  message: string,
): void {
  if (row?.status === 'pass') {
    requireHexReference(errors, row.evidenceArtifact, expected, message);
  }
}

function requireLifecycleTextReference(
  errors: string[],
  row: RehearsalEvidenceRow | undefined,
  expected: string | undefined,
  message: string,
): void {
  if (row?.status !== 'pass' || expected === undefined || isBlank(row.evidenceArtifact)) return;
  if (!containsCaseInsensitive(row.evidenceArtifact, expected)) {
    errors.push(message);
  }
}

function extractSingletonInventoryId(value: string): string | undefined {
  return SINGLETON_INVENTORY_ID_CAPTURE_PATTERN.exec(value)?.[1]?.toLowerCase();
}

function validatePreflightNumericFields(markdown: string): string[] {
  const values = parseListFields(sectionBetween(
    markdown,
    '## Preflight Evidence',
    '## Dry-Run Settlement Evidence',
  ));
  const errors: string[] = [];

  for (const field of ['Current Ergo height', 'Current sidechain height']) {
    validateEvidenceBoundNonNegativeIntegerField(errors, 'Preflight Evidence', field, values.get(field) ?? '');
  }

  return errors;
}

function validateDryRunNumericFields(markdown: string): string[] {
  const preflightValues = parseListFields(sectionBetween(
    markdown,
    '## Preflight Evidence',
    '## Dry-Run Settlement Evidence',
  ));
  const values = parseListFields(sectionBetween(
    markdown,
    '## Dry-Run Settlement Evidence',
    '## Broadcast Enablement Evidence',
  ));
  const errors: string[] = [];

  for (const field of [
    'Sidechain block height',
    'Ergo anchor height',
    'Aggregate claim count',
    'Input count',
    'Output count',
  ]) {
    validateNonNegativeIntegerField(errors, 'Dry-Run Settlement Evidence', field, values.get(field) ?? '');
  }

  const inputCount = parseNonNegativeInteger(values.get('Input count') ?? '');
  const aggregateClaimCount = parseNonNegativeInteger(values.get('Aggregate claim count') ?? '');
  const outputCount = parseNonNegativeInteger(values.get('Output count') ?? '');
  const currentErgoHeight = parseEvidenceBoundNonNegativeInteger(preflightValues.get('Current Ergo height') ?? '');
  const currentSidechainHeight = parseEvidenceBoundNonNegativeInteger(preflightValues.get('Current sidechain height') ?? '');
  const ergoAnchorHeight = parseNonNegativeInteger(values.get('Ergo anchor height') ?? '');
  const sidechainBlockHeight = parseNonNegativeInteger(values.get('Sidechain block height') ?? '');
  const keyCounts = parseNonNegativeIntegerList(values.get('ContextExtension key counts per input') ?? '');
  for (const [field, count] of [
    ['Aggregate claim count', aggregateClaimCount],
    ['Input count', inputCount],
    ['Output count', outputCount],
  ] as const) {
    if (count !== undefined && count <= 0) {
      errors.push(`Dry-Run Settlement Evidence: ${field} must be greater than 0`);
    }
  }
  if (
    currentErgoHeight !== undefined &&
    ergoAnchorHeight !== undefined &&
    ergoAnchorHeight > currentErgoHeight
  ) {
    errors.push('Dry-Run Settlement Evidence: Ergo anchor height must not exceed Current Ergo height');
  }
  if (
    currentSidechainHeight !== undefined &&
    sidechainBlockHeight !== undefined &&
    sidechainBlockHeight > currentSidechainHeight
  ) {
    errors.push('Dry-Run Settlement Evidence: Sidechain block height must not exceed Current sidechain height');
  }
  if (keyCounts === undefined && !isBlank(values.get('ContextExtension key counts per input') ?? '')) {
    errors.push(
      'Dry-Run Settlement Evidence: ContextExtension key counts per input must be comma-separated non-negative integers',
    );
  } else if (keyCounts?.some(count => !Number.isSafeInteger(count))) {
    errors.push('Dry-Run Settlement Evidence: ContextExtension key counts per input must contain safe integers');
  }
  if (inputCount !== undefined && keyCounts !== undefined && keyCounts.length !== inputCount) {
    errors.push('Dry-Run Settlement Evidence: ContextExtension key count entries must match Input count');
  }

  return errors;
}

function validateNonNegativeIntegerField(
  errors: string[],
  section: string,
  field: string,
  value: string,
): void {
  if (isBlank(value)) return;
  const parsed = parseNonNegativeInteger(value);
  if (parsed === undefined) {
    errors.push(`${section}: ${field} must be a non-negative integer`);
  } else if (!Number.isSafeInteger(parsed)) {
    errors.push(`${section}: ${field} must be a safe integer`);
  }
}

function validateEvidenceBoundNonNegativeIntegerField(
  errors: string[],
  section: string,
  field: string,
  value: string,
): void {
  if (isBlank(value)) return;
  const parsed = parseEvidenceBoundNonNegativeInteger(value);
  if (parsed === undefined) {
    errors.push(`${section}: ${field} must be a non-negative integer`);
  } else if (!Number.isSafeInteger(parsed)) {
    errors.push(`${section}: ${field} must be a safe integer`);
  }
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
    if (index <= lastIndex) {
      errors.push(`${section}: section appears out of order`);
    }
    lastIndex = index;
  }

  return errors;
}

function validateSessionMetadata(markdown: string): string[] {
  const section = sectionBetween(markdown, '## Session Metadata', '## Lifecycle Gate Classification');
  const fields = parseListFields(section);
  const errors: string[] = [];
  errors.push(...validateDuplicateRequiredListFields('Session Metadata', section, REQUIRED_SESSION_FIELDS));

  for (const field of REQUIRED_SESSION_FIELDS) {
    if (isBlank(fields.get(field) ?? '')) errors.push(`Session Metadata: ${field} is required`);
  }
  validateGitCommitField(errors, fields, 'Session Metadata', 'Git commit');
  validateIsoDateField(errors, fields, 'Session Metadata', 'Date');

  const environment = fields.get('Environment') ?? '';
  if (!isBlank(environment) && !ALLOWED_ENVIRONMENTS.has(environment)) {
    errors.push(`Session Metadata: Environment must be one of ${[...ALLOWED_ENVIRONMENTS].join(', ')}`);
  }

  const releaseLevel = fields.get('Release level being evaluated') ?? '';
  if (!isBlank(releaseLevel) && !ALLOWED_RELEASE_LEVELS.has(releaseLevel)) {
    errors.push(
      `Session Metadata: Release level being evaluated must be one of ${[...ALLOWED_RELEASE_LEVELS].join(', ')}`,
    );
  }
  if (releaseLevel === 'production deployment candidate' && environment !== 'testnet') {
    errors.push('Session Metadata: production deployment candidate requires Environment testnet');
  }

  for (const field of ['Broadcast mode at start', 'Broadcast mode at end']) {
    const mode = fields.get(field) ?? '';
    if (isBlank(mode)) continue;
    if (!ALLOWED_BROADCAST_MODES.has(mode)) {
      errors.push(`Session Metadata: ${field} must be disabled or enabled`);
      continue;
    }
    if (mode !== 'disabled') {
      errors.push(`Session Metadata: ${field} must be disabled before rehearsal evidence can pass`);
    }
  }

  const profileFields = {
    settlementProfileId: fields.get('Settlement profile ID') ?? '',
    profileActivationStatus: fields.get('Profile activation status') ?? '',
    evidencePurpose: fields.get('Evidence purpose') ?? '',
    activationEvidenceTarget: fields.get('Activation evidence target') ?? '',
  };
  const activationId = fields.get('Activation ID') ?? '';
  const hasProfileBinding = [...Object.values(profileFields), activationId]
    .some(value => value.trim().length > 0);
  if (hasProfileBinding) {
    errors.push(...validateSettlementProfileBinding(profileFields, 'Session Metadata settlement profile'));
    if (profileFields.settlementProfileId === LEGACY_AGGREGATE_SETTLEMENT_PROFILE_ID) {
      if (activationId !== 'none') {
        errors.push('Session Metadata: Activation ID must be none for legacy-aggregate-v1');
      }
    } else if (!/^[a-f0-9]{64}$/i.test(activationId)) {
      errors.push('Session Metadata: Activation ID must be 32-byte hex for an activated settlement profile');
    }
  }

  return errors;
}

function validateReviewerSignoff(markdown: string): string[] {
  const section = sectionBetween(markdown, '## Reviewer Sign-Off');
  const signoffOnlySection = section.split(/\r?\n##\s+/)[0] ?? section;
  const fields = parseListFields(section);
  const errors: string[] = [];
  errors.push(...validateDuplicateRequiredListFields('Reviewer Sign-Off', section, REQUIRED_REVIEWER_SIGNOFF_FIELDS));

  const claim = classifyPublicationClaimText(signoffOnlySection);
  if (claim.hasMainnetProductionClaim) {
    errors.push('Reviewer Sign-Off: notes must not contain mainnet production claim wording');
  }
  if (claim.hasProductionReadyClaim) {
    errors.push('Reviewer Sign-Off: notes must not contain production-ready claim wording');
  }

  for (const field of REQUIRED_REVIEWER_SIGNOFF_FIELDS) {
    if (isBlank(fields.get(field) ?? '')) errors.push(`Reviewer Sign-Off: ${field} is required`);
  }
  validateIsoDateField(errors, fields, 'Reviewer Sign-Off', 'Date');

  const classification = fields.get('Classification') ?? '';
  if (!isBlank(classification) && !ALLOWED_SIGNOFF_CLASSIFICATIONS.has(classification)) {
    errors.push(
      `Reviewer Sign-Off: Classification must be one of ${[...ALLOWED_SIGNOFF_CLASSIFICATIONS].join(', ')}`,
    );
  } else if (!isBlank(classification) && classification !== 'pass') {
    errors.push('Reviewer Sign-Off: Classification must be pass before rehearsal evidence can pass');
  }

  if (classification === 'pass') {
    const publicationBlockers = fields.get('Publication blockers discovered') ?? '';
    const followupTests = fields.get('Follow-up tests required') ?? '';
    const followupRunbooks = fields.get('Follow-up runbook changes required') ?? '';

    if (!isBlank(publicationBlockers) && !isNoOpenItem(publicationBlockers)) {
      errors.push('Reviewer Sign-Off: Publication blockers discovered must be none, no, or 0 before rehearsal evidence can pass');
    }
    if (!isBlank(followupTests) && !isNoOpenItem(followupTests)) {
      errors.push('Reviewer Sign-Off: Follow-up tests required must be none, no, or 0 before rehearsal evidence can pass');
    }
    if (!isBlank(followupRunbooks) && !isNoOpenItem(followupRunbooks)) {
      errors.push('Reviewer Sign-Off: Follow-up runbook changes required must be none, no, or 0 before rehearsal evidence can pass');
    }
  }

  return errors;
}

function validateReviewerIdentityConsistency(markdown: string): string[] {
  const sessionFields = parseListFields(sectionBetween(markdown, '## Session Metadata', '## Lifecycle Gate Classification'));
  const signoffFields = parseListFields(sectionBetween(markdown, '## Reviewer Sign-Off'));
  const sessionReviewer = sessionFields.get('Reviewer')?.trim() ?? '';
  const signoffReviewer = signoffFields.get('Reviewer')?.trim() ?? '';

  if (
    !isBlank(sessionReviewer) &&
    !isBlank(signoffReviewer) &&
    sessionReviewer !== signoffReviewer
  ) {
    return ['Reviewer Sign-Off: Reviewer must match Session Metadata Reviewer'];
  }

  return [];
}

function validateReviewerSignoffDateOrder(markdown: string): string[] {
  const sessionFields = parseListFields(sectionBetween(markdown, '## Session Metadata', '## Lifecycle Gate Classification'));
  const signoffFields = parseListFields(sectionBetween(markdown, '## Reviewer Sign-Off'));
  const sessionDate = sessionFields.get('Date') ?? '';
  const signoffDate = signoffFields.get('Date') ?? '';

  if (!isIsoCalendarDate(sessionDate) || !isIsoCalendarDate(signoffDate)) return [];
  if (signoffDate < sessionDate) {
    return ['Reviewer Sign-Off: Date must not be before Session Metadata Date'];
  }
  return [];
}

function sectionBetween(markdown: string, startHeading: string, endHeading?: string): string {
  const start = markdown.indexOf(startHeading);
  if (start < 0) return '';

  const contentStart = start + startHeading.length;
  const end = endHeading ? markdown.indexOf(endHeading, contentStart) : markdown.length;
  return markdown.slice(contentStart, end < 0 ? markdown.length : end);
}

function parseListFields(section: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const match of section.matchAll(/^- ([^:\n]+):[^\S\r\n]*(.*)$/gm)) {
    fields.set(match[1].trim(), match[2].trim());
  }
  return fields;
}

function parseNonNegativeInteger(value: string): number | undefined {
  if (!/^\d+$/.test(value.trim())) return undefined;
  return Number(value.trim());
}

function parseEvidenceBoundNonNegativeInteger(value: string): number | undefined {
  const match = /^(\d+)(?:\s+.+)?$/.exec(value.trim());
  return match ? Number(match[1]) : undefined;
}

function parseNonNegativeIntegerList(value: string): number[] | undefined {
  const trimmed = value.trim();
  if (isBlank(trimmed)) return undefined;
  const parts = trimmed.split(',').map(part => part.trim());
  if (parts.length === 0 || parts.some(part => parseNonNegativeInteger(part) === undefined)) return undefined;
  return parts.map(part => Number(part));
}

function isSafeParsedInteger(value: number | undefined): boolean {
  return value === undefined || Number.isSafeInteger(value);
}

function extractSingleTxId(value: string): string | undefined {
  const uniqueMatches = extractUniqueHex32Values(value);
  return uniqueMatches.length === 1 ? uniqueMatches[0] : undefined;
}

function extractUniqueHex32Values(value: string): string[] {
  const matches = [...value.matchAll(HEX_32_BYTE_PATTERN)].map(match => match[1].toLowerCase());
  const uniqueMatches = [...new Set(matches)];
  return uniqueMatches;
}

function validateOneOrMoreHex32Field(
  errors: string[],
  section: string,
  field: string,
  value: string,
): void {
  if (!isBlank(value) && extractUniqueHex32Values(value).length === 0) {
    errors.push(`${section}: ${field} must include at least one 32-byte hex box ID`);
  }
}

function validateExactlyOneHex32Field(
  errors: string[],
  section: string,
  field: string,
  value: string,
  label: string,
): void {
  if (!isBlank(value) && extractUniqueHex32Values(value).length !== 1) {
    errors.push(`${section}: ${field} must include exactly one ${label}`);
  }
}

function validateDuplicateLifecycleRows(rows: RehearsalEvidenceRow[]): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.releaseGate, (counts.get(row.releaseGate) ?? 0) + 1);
  }

  const errors: string[] = [];
  for (const [gate, count] of counts) {
    if (gate.trim().length > 0 && count > 1) {
      errors.push(`${gate}: duplicate lifecycle row`);
    }
  }
  return errors;
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

function hasEvidenceMarker(value: string): boolean {
  return (
    /\[[^\]]+\]\([^)]+\)/.test(value) ||
    /\bnpm(?:\.cmd)?\s+run\s+[A-Za-z0-9:_-]+\b/.test(value) ||
    /(?:^|\s)artifact:\/\//.test(value)
  );
}

function hasContradictoryValidationFailureMarker(segment: string): boolean {
  const normalized = normalizeEvidenceMarkerText(segment);
  return (
    /(?:^|[^A-Za-z0-9_-])FAIL(?:$|[^A-Za-z0-9_-])/i.test(normalized) ||
    /\b(?:status|result|validation|validator|command|outcome)\s*[:=]?\s*FAILED\b/i.test(normalized) ||
    /\bFAILED\b\s+(?:validation|validator|command|run|result|status)\b/i.test(normalized) ||
    /\bBLOCKED\b/i.test(normalized) ||
    /\bERROR\b/i.test(normalized) ||
    hasUnresolvedIssueMarker(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\b[1-9]\d*\s+structural\s+issues?\b/i.test(normalized)
  );
}

function hasCompletedEvidenceTarget(value: string): boolean {
  const completedEvidenceText = rehearsalCompletedEvidenceText(value);
  return !hasLocalOnlyEvidenceTarget(value) &&
    !hasClaimEscalatingRehearsalEvidenceReference(value) &&
    (hasCompletedArtifactTarget(completedEvidenceText) || hasNonTemplateMarkdownLink(completedEvidenceText));
}

function hasCompletedLifecycleRowEvidenceTarget(value: string): boolean {
  return hasCompletedEvidenceTarget(rehearsalCompletedEvidenceText(value));
}

function rehearsalCompletedEvidenceText(value: string): string {
  return value
    .split(/[;\n]+/)
    .map(segment => {
      const validationCommand = /\bnpm run rehearsal:validate\b/i.exec(segment);
      const beforeValidationCommand = validationCommand
        ? segment.slice(0, validationCommand.index).trim()
        : segment.trim();
      const targetBinding = REHEARSAL_VALIDATION_TARGET_BINDING.exec(beforeValidationCommand);
      return targetBinding
        ? beforeValidationCommand.slice(0, targetBinding.index).trim()
        : beforeValidationCommand;
    })
    .filter(segment => segment.length > 0)
    .join('; ');
}

function extractCompletedEvidenceTargets(value: string): string[] {
  return extractEvidenceTargets(rehearsalCompletedEvidenceText(value)).filter(isCompletedEvidenceTarget);
}

function extractEvidenceTargets(value: string): string[] {
  return [
    ...extractArtifactTargets(value),
    ...[...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(([, target]) => target.trim()),
  ];
}

function hasSharedCompletedEvidenceTarget(left: string, right: string): boolean {
  const leftTargets = new Set(extractCompletedEvidenceTargets(left).map(normalizeEvidenceTarget));
  return extractCompletedEvidenceTargets(right)
    .map(normalizeEvidenceTarget)
    .some(target => leftTargets.has(target));
}

function identifiesRehearsalPublicationEvidenceKind(value: string, evidenceKind: string): boolean {
  const normalizedKind = normalizeRehearsalEvidenceKind(evidenceKind);
  return rehearsalPublicationEvidenceTargetsIdentifyKind(value, normalizedKind) ||
    rehearsalPublicationEvidenceKindTextSegments(value)
      .some(segment =>
        segment === normalizedKind ||
        segment.startsWith(`${normalizedKind} `)
      );
}

function rehearsalPublicationEvidenceTargetsIdentifyKind(value: string, normalizedKind: string): boolean {
  const expectedSlug = normalizedKind.replace(/\s+/g, '-');
  return extractCompletedEvidenceTargets(value)
    .some(target => normalizeRehearsalPublicationEvidenceTargetBasename(target) === expectedSlug);
}

function normalizeRehearsalPublicationEvidenceTargetBasename(target: string): string {
  const normalizedTarget = normalizeEvidenceTarget(target).replace(/\\/g, '/');
  const basename = normalizedTarget.split('/').filter(Boolean).pop() ?? normalizedTarget;
  return normalizeRehearsalEvidenceKind(basename.replace(/\.[a-z0-9]+$/i, '')).replace(/\s+/g, '-');
}

function rehearsalPublicationEvidenceKindTextSegments(value: string): string[] {
  return value
    .split(/[;\n|]+/)
    .map(stripLeadingRehearsalEvidenceTarget)
    .map(normalizeRehearsalEvidenceKind)
    .filter(segment => segment.length > 0);
}

function stripLeadingRehearsalEvidenceTarget(value: string): string {
  const trimmed = value.trim();
  const markdownMatch = /^\[[^\]]+\]\([^)]+\)/.exec(trimmed);
  if (markdownMatch) return trimmed.slice(markdownMatch[0].length).replace(/^[\s,.:;-]+/, '');

  const artifactMatch = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+/i.exec(trimmed);
  if (artifactMatch) return trimmed.slice(artifactMatch[0].length).replace(/^[\s,.:;-]+/, '');

  return trimmed;
}

function normalizeRehearsalEvidenceKind(value: string): string {
  return normalizeEvidenceMarkerText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasCompletedArtifactTarget(value: string): boolean {
  return extractArtifactTargets(value).some(isCompletedEvidenceTarget);
}

function extractArtifactTargets(value: string): string[] {
  return [...value.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+)/g)]
    .map(([, target]) => target);
}

function isCompletedEvidenceTarget(target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  return (
    !/-template\.[a-z0-9]+(?:[#?].*)?$/i.test(normalizedTarget) &&
    !/\b(?:not[-_ ]completed|uncompleted)\b/i.test(normalizedTarget) &&
    !isLocalOnlyEvidenceTarget(normalizedTarget) &&
    !isSharedSensitiveOrRuntimeEvidenceText(normalizedTarget) &&
    !hasClaimEscalatingRehearsalEvidenceTarget(normalizedTarget) &&
    !hasNonConcreteEvidenceTargetSegment(normalizedTarget)
  );
}

function normalizeEvidenceTarget(target: string): string {
  return target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').toLowerCase();
}

function hasClaimEscalatingRehearsalEvidenceReference(value: string): boolean {
  return extractEvidenceTargets(value)
    .some(target => hasClaimEscalatingRehearsalEvidenceTarget(target));
}

function hasClaimEscalatingRehearsalEvidenceTarget(target: string): boolean {
  const claim = classifyPublicationClaimText(normalizeEvidenceTarget(target));
  return claim.hasProductionClaim;
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
    /(?:^|[\/_.-])(?:generic|placeholder|todo|tbd)(?:[\/_.-]|$)/i.test(value) ||
    /(?:^|[\/_.-])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[\/_.-]|$)/i.test(value) ||
    /(?:^|[\/_.-])template(?:[\/_.-](?:proof|evidence|artifact|target|log|run|check|update|lifecycle|live|preflight|rehearsal|local|devnet|testnet|peg[-_.]?in|peg[-_.]?out|anchor|settlement|submit|submission|confirmation|reconciliation|context[-_.]?extension|guard|clean|deployment[-_.]?state|broadcast|policy|readiness|approval|approvals|scoped[-_.]?shell|network|reconfirmation|transaction|expected[-_.]?tx|dup|spv|avl|singleton|checkpoint|recovery|failed[-_.]?broadcast|reorg(?:ed)?|burn|stale|runtime|logs|cleanup)|$)/i.test(value) ||
    /(?:^|[\/_.-])sample(?:[\/_.-](?:proof|evidence|artifact|target|log|run|check|update|lifecycle|live|preflight|rehearsal|local|devnet|testnet|peg[-_.]?in|peg[-_.]?out|anchor|settlement|submit|submission|confirmation|reconciliation|context[-_.]?extension|guard|clean|deployment[-_.]?state|broadcast|policy|readiness|approval|approvals|scoped[-_.]?shell|network|reconfirmation|transaction|expected[-_.]?tx|dup|spv|avl|singleton|checkpoint|recovery|failed[-_.]?broadcast|reorg(?:ed)?|burn|stale|runtime|logs|cleanup)|$)/i.test(value) ||
    /(?:^|[\/_.-])example(?:[\/_.-](?:proof|evidence|artifact|target|log|run|check|update|validator|lifecycle|live|preflight|rehearsal|local|devnet|testnet|peg[-_.]?in|peg[-_.]?out|anchor|settlement|submit|submission|confirmation|reconciliation|context[-_.]?extension|guard|clean|deployment[-_.]?state|broadcast|policy|readiness|approval|approvals|scoped[-_.]?shell|network|reconfirmation|transaction|expected[-_.]?tx|dup|spv|avl|singleton|checkpoint|recovery|failed[-_.]?broadcast|reorg(?:ed)?|burn|stale|runtime|logs|cleanup)|$)/i.test(value)
  );
}

function hasNonTemplateMarkdownLink(value: string): boolean {
  const links = [...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
  return links.some(([, target]) => isCompletedEvidenceTarget(target.trim()));
}

function isActionableBlockingNote(value: string): boolean {
  return ACTIONABLE_BLOCKING_NOTE_PATTERN.test(value);
}

function isActionableNextEvidence(value: string): boolean {
  return ACTIONABLE_NEXT_EVIDENCE_PATTERN.test(value);
}

function isNoOpenItem(value: string): boolean {
  return /^(none|no|0|zero)$/i.test(value.trim());
}
