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

export type CommitteeGovernanceEvidenceStatus = 'pending' | 'linked' | 'blocker';
export type ReviewerDecision = 'approve' | 'block';

export interface GovernanceScopeRow {
  surface: string;
  currentAuthority: string;
  targetAuthority: string;
  evidence: string;
  status: string;
}

export interface GovernanceCommandRow {
  command: string;
  evidence: string;
  status: string;
}

export interface RotationPlanRow {
  step: string;
  requiredEvidence: string;
  status: string;
  stopCondition: string;
}

export interface GovernancePositiveCheckRow {
  check: string;
  expectedResult: string;
  evidence: string;
  status: string;
}

export interface GovernanceNegativeCheckRow {
  check: string;
  expectedResult: string;
  evidence: string;
  status: string;
}

export interface ReviewerSignoffRow {
  role: string;
  name: string;
  decision: string;
  date: string;
  notes: string;
}

export interface GovernancePublicationDecisionFields {
  releaseSupported: string;
  productionReadyClaimAllowed: string;
  testnetProductionCandidateClaimAllowed: string;
  governanceReadyClaimAllowed: string;
  openGovernanceBlockers: string;
  releaseNotesUpdated: string;
  requiredReleaseNoteUpdates: string;
  requiredChecklistUpdates: string;
  externalReviewEvidence: string;
  reviewerDecisionSummary: string;
}

export interface GovernanceClassificationFields {
  drillName: string;
  gitCommit: string;
  releaseLevel: string;
  environment: string;
  broadcastMode: string;
  governanceModel: string;
  committeeThreshold: string;
  committeeMemberCount: string;
  reviewer: string;
  date: string;
}

export interface CommitteeGovernanceEvidenceValidation {
  status: 'PASS' | 'BLOCKED';
  scopeRows: GovernanceScopeRow[];
  commandRows: GovernanceCommandRow[];
  rotationRows: RotationPlanRow[];
  positiveRows: GovernancePositiveCheckRow[];
  negativeRows: GovernanceNegativeCheckRow[];
  classification: Partial<GovernanceClassificationFields>;
  publicationDecision: Partial<GovernancePublicationDecisionFields>;
  reviewerRows: ReviewerSignoffRow[];
  errors: string[];
  message: string;
}

interface ParsedRows<T> {
  rows: T[];
  errors: string[];
}

interface ScopeAuthorityExpectation {
  field: 'currentAuthority' | 'targetAuthority';
  pattern: RegExp;
  message: string;
  forbidden?: boolean;
}

const REQUIRED_SECTIONS = [
  '## Drill Classification',
  '## Scope',
  '## Required Commands',
  '## Rotation Plan',
  '## Positive Checks',
  '## Negative Checks',
  '## Publication Rules',
  '## Reviewer Sign-Off',
];

const REQUIRED_CLASSIFICATION_FIELDS = [
  'Drill name',
  'Git commit',
  'Release level',
  'Environment',
  'Broadcast mode',
  'Governance model',
  'Committee threshold',
  'Committee member count',
  'Reviewer',
  'Date',
];

export const REQUIRED_COMMITTEE_GOVERNANCE_SCOPE_SURFACES = [
  'SideChainState successor authorization',
  'DUP authorization',
  'Aggregate DUP authorization',
  'Batch DUP authorization',
  'MainChainLock normal path',
  'MainChainLock emergency escape path',
  'SPVTracker ingest authorization',
  'MCU Phase 2 path',
];

const REQUIRED_SCOPE_AUTHORITY_EXPECTATIONS: Record<string, ScopeAuthorityExpectation[]> = {
  'MainChainLock emergency escape path': [
    {
      field: 'currentAuthority',
      pattern: /permissionless/i,
      message: 'current authority must mention permissionless emergency escape',
    },
    {
      field: 'currentAuthority',
      pattern: /timeout/i,
      message: 'current authority must mention timeout semantics',
    },
    {
      field: 'targetAuthority',
      pattern: /unchanged/i,
      message: 'target authority must state unchanged emergency escape',
    },
    {
      field: 'targetAuthority',
      pattern: /committee|multisig|atLeast/i,
      message: 'target authority must not committee-gate emergency escape',
      forbidden: true,
    },
  ],
  'MCU Phase 2 path': [
    {
      field: 'currentAuthority',
      pattern: /permissionless/i,
      message: 'current authority must identify the legacy permissionless Phase 2 path',
    },
    {
      field: 'currentAuthority',
      pattern: /legacy|v1/i,
      message: 'current authority must identify the immutable legacy v1 scope',
    },
    {
      field: 'currentAuthority',
      pattern: /quarantin|disabled|inactive/i,
      message: 'current authority must state that legacy MCU creation and spend are quarantined or disabled',
    },
    {
      field: 'targetAuthority',
      pattern: /committee|multisig|atLeast/i,
      message: 'target authority must identify transitional committee authorization',
    },
    {
      field: 'targetAuthority',
      pattern: /Phase 011|Gate 5/i,
      message: 'target authority must identify Phase 011 or Gate 5 as the proof replacement',
    },
    {
      field: 'targetAuthority',
      pattern: /transitional|containment|temporary/i,
      message: 'target authority must limit committee authorization to transitional containment',
    },
  ],
};

export const REQUIRED_COMMITTEE_GOVERNANCE_COMMANDS = [
  'npm run contracts:check',
  'npm run check',
  'npm run wasm:test',
  'npm run demo:readiness',
  'npm run status',
  'spike010a-committee-guard-eval.ts',
];

export const REQUIRED_COMMITTEE_GOVERNANCE_ROTATION_STEPS = [
  'Identify old committee public keys',
  'Identify new committee public keys',
  'Validate threshold policy',
  'Simulate member loss or lost-key tolerance',
  'Compile affected contracts',
  'Evaluate old and new signer behavior',
  'Preserve singleton continuity',
  'Reconcile deployment state',
  'Verify rollback plan',
];

const REQUIRED_ROTATION_EVIDENCE_FOCUS: Record<string, { pattern: RegExp; message: string }[]> = {
  'Identify old committee public keys': [
    {
      pattern: /(old|previous)/i,
      message: 'must identify the old committee',
    },
    {
      pattern: /(public[- ]keys?|hashes?)/i,
      message: 'must use public keys or hashes only',
    },
  ],
  'Identify new committee public keys': [
    {
      pattern: /new/i,
      message: 'must identify the new committee',
    },
    {
      pattern: /(public[- ]keys?|hashes?)/i,
      message: 'must use public keys or hashes only',
    },
  ],
  'Validate threshold policy': [
    {
      pattern: /\bm\s*\/\s*n\b|\bthreshold\b/i,
      message: 'must identify m/n or threshold policy',
    },
    {
      pattern: /(quorum|lost[- ]key|member[- ]loss|tolerance)/i,
      message: 'must identify quorum or lost-key/member-loss tolerance',
    },
  ],
  'Simulate member loss or lost-key tolerance': [
    {
      pattern: /(member[- ]loss|lost[- ]key|tolerance)/i,
      message: 'must identify member-loss or lost-key tolerance',
    },
  ],
  'Compile affected contracts': [
    {
      pattern: /(contracts:check|contract[- ]compilation|contract[- ]compile|compilation output|compiled contracts?)/i,
      message: 'must identify contract compilation or contracts:check output',
    },
  ],
  'Evaluate old and new signer behavior': [
    {
      pattern: /(old|new)/i,
      message: 'must compare old and new signer behavior',
    },
    {
      pattern: /(signer|signing|guard)/i,
      message: 'must identify signer or signing guard behavior',
    },
  ],
  'Preserve singleton continuity': [
    {
      pattern: /(singleton|NFT|register|script|value)/i,
      message: 'must identify singleton continuity evidence',
    },
  ],
  'Reconcile deployment state': [
    {
      pattern: /(deployment[- ]state|network|singleton)/i,
      message: 'must identify deployment-state or network reconciliation',
    },
  ],
  'Verify rollback plan': [
    {
      pattern: /(rollback|previous[- ]authority|recovery)/i,
      message: 'must identify rollback or previous-authority recovery',
    },
  ],
};

export const REQUIRED_COMMITTEE_GOVERNANCE_NEGATIVE_CHECKS = [
  'Old single signer attempts signer-gated mutation after rotation',
  'Non-committee signer attempts signer-gated mutation',
  'Committee threshold below policy',
  'MCU references stale SCS NFT after SCS redeploy',
  'MCL emergency escape path is accidentally committee-gated',
  'Broadcast is enabled before readiness review',
  'Deployment state points to the wrong network',
];

const NEGATIVE_CHECKS_REQUIRING_SIGNER_IDENTIFIER = new Set([
  'Old single signer attempts signer-gated mutation after rotation',
  'Non-committee signer attempts signer-gated mutation',
]);

export const REQUIRED_COMMITTEE_GOVERNANCE_POSITIVE_CHECKS = [
  'New committee executes signer-gated mutation after rotation',
  'Threshold member-loss tolerance still executes signer-gated mutation',
];

const POSITIVE_CHECK_EXPECTED_RESULT_PATTERN = /\b(accepted|approved|passed|validated|verified|succeeded)\b/i;

const REQUIRED_POSITIVE_EVIDENCE_FOCUS: Record<string, { pattern: RegExp; message: string }[]> = {
  'New committee executes signer-gated mutation after rotation': [
    { pattern: /new[- ]committee|new committee/i, message: 'must identify new committee behavior' },
    { pattern: /(signer|signing|signer-gated)/i, message: 'must identify signer-gated mutation' },
    { pattern: /(accepted|approved|passed|validated|verified|succeeded)/i, message: 'must identify accepted mutation result' },
  ],
  'Threshold member-loss tolerance still executes signer-gated mutation': [
    { pattern: /(member[- ]loss|lost[- ]key|tolerance)/i, message: 'must identify member-loss or lost-key tolerance' },
    { pattern: /(threshold|quorum|m\/n)/i, message: 'must identify threshold quorum' },
    { pattern: /(signer|signing|signer-gated)/i, message: 'must identify signer-gated mutation' },
  ],
};

const REQUIRED_NEGATIVE_EVIDENCE_FOCUS: Record<string, { pattern: RegExp; message: string }[]> = {
  'Old single signer attempts signer-gated mutation after rotation': [
    { pattern: /(old|previous)/i, message: 'must identify old signer behavior' },
    { pattern: /(signer|signing|signer-gated)/i, message: 'must identify signer-gated mutation' },
  ],
  'Non-committee signer attempts signer-gated mutation': [
    { pattern: /non[- ]committee/i, message: 'must identify non-committee signer behavior' },
    { pattern: /(signer|signing|signer-gated)/i, message: 'must identify signer-gated mutation' },
  ],
  'Committee threshold below policy': [
    { pattern: /threshold/i, message: 'must identify threshold policy' },
    { pattern: /(below|weaker|policy)/i, message: 'must identify below-policy rejection' },
  ],
  'MCU references stale SCS NFT after SCS redeploy': [
    { pattern: /\bMCU\b/i, message: 'must identify MCU path' },
    { pattern: /(stale|SCS|NFT|redeploy)/i, message: 'must identify stale SCS NFT after redeploy' },
  ],
  'MCL emergency escape path is accidentally committee-gated': [
    { pattern: /\bMCL\b|MainChainLock/i, message: 'must identify MCL path' },
    { pattern: /(emergency|escape|committee-gated)/i, message: 'must identify emergency escape gating' },
  ],
  'Broadcast is enabled before readiness review': [
    { pattern: /broadcast/i, message: 'must identify broadcast enablement' },
    { pattern: /(readiness|review)/i, message: 'must identify readiness review' },
  ],
  'Deployment state points to the wrong network': [
    { pattern: /deployment[- ]state/i, message: 'must identify deployment state' },
    { pattern: /(wrong[- ]network|network)/i, message: 'must identify network mismatch' },
  ],
};

export const REQUIRED_COMMITTEE_GOVERNANCE_REVIEWER_ROLES = [
  'Governance owner',
  'Security reviewer',
  'Operator reviewer',
];

const REQUIRED_PUBLICATION_FIELDS = [
  'Release supported',
  'Production-ready claim allowed',
  'Testnet production-candidate claim allowed',
  'Governance-ready claim allowed',
  'Open governance blockers',
  'Release notes updated',
  'Required release-note updates',
  'Required checklist updates',
  'External review evidence',
  'Reviewer decision summary',
];

const ALLOWED_STATUSES = new Set<CommitteeGovernanceEvidenceStatus>(['pending', 'linked', 'blocker']);
const ALLOWED_RELEASE_LEVELS = new Set([
  'validated PoC',
  'institutional reference',
  'production deployment candidate',
]);
const ALLOWED_ENVIRONMENTS = new Set(['local offline', 'patched devnet', 'testnet', 'staging']);
const ALLOWED_BROADCAST_MODES = new Set(['disabled', 'dry-run', 'enabled']);
const ALLOWED_GOVERNANCE_MODELS = new Set([
  'single signer',
  'Phase 010a atLeast multisig',
  'Phase 010b governance',
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
const NEGATIVE_CHECK_EXPECTED_RESULT_PATTERN = /\b(rejected|blocked|refused|failed?)\b/i;
const CHECK_EXPECTED_RESULT_ALTERNATIVE_PATTERN =
  /\b(?:accepted|approved|passed|validated|verified|succeeded|rejected|blocked|refused|failed?)\b\s*\/\s*\b(?:accepted|approved|passed|validated|verified|succeeded|rejected|blocked|refused|failed?)\b/i;
const PUBLIC_COMMITTEE_IDENTIFIER_PATTERN =
  /(?:^|[^0-9a-fA-F])(?:0x)?([0-9a-fA-F]{66}|[0-9a-fA-F]{64})(?![0-9a-fA-F])/g;
const COMMITTEE_GOVERNANCE_RECONCILE_COMMAND = 'npm run governance:reconcile:validate';

export function hasCommitteeGovernancePositiveExpectedResult(value: string): boolean {
  return POSITIVE_CHECK_EXPECTED_RESULT_PATTERN.test(value) && !hasSlashDelimitedCheckExpectedResultAlternative(value);
}

export function hasCommitteeGovernanceNegativeExpectedResult(value: string): boolean {
  return NEGATIVE_CHECK_EXPECTED_RESULT_PATTERN.test(value) && !hasSlashDelimitedCheckExpectedResultAlternative(value);
}

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

export function parseGovernanceScopeRows(markdown: string): GovernanceScopeRow[] {
  return parseTableBetween(markdown, '## Scope', '## Required Commands').map(row => {
    if (row.length !== 5) throw new Error(`Malformed Scope row: ${row.join(' | ')}`);
    return {
      surface: row[0],
      currentAuthority: row[1],
      targetAuthority: row[2],
      evidence: row[3],
      status: row[4],
    };
  });
}

export function validateCommitteeGovernanceEvidence(markdown: string): CommitteeGovernanceEvidenceValidation {
  const scopes = parseRowsSafely(() => parseGovernanceScopeRows(markdown));
  const commands = parseRowsSafely(() => parseCommandRows(markdown));
  const rotations = parseRowsSafely(() => parseRotationRows(markdown));
  const positives = parseRowsSafely(() => parsePositiveRows(markdown));
  const negatives = parseRowsSafely(() => parseNegativeRows(markdown));
  const reviewers = parseRowsSafely(() => parseReviewerRows(markdown));
  const classification = parseClassification(markdown);
  const publicationDecision = parsePublicationRules(markdown);
  const scopeRows = scopes.rows;
  const commandRows = commands.rows;
  const rotationRows = rotations.rows;
  const positiveRows = positives.rows;
  const negativeRows = negatives.rows;
  const reviewerRows = reviewers.rows;
  const committeeThreshold = parseCommitteeThreshold(markdown);
  const committeeMemberCount = parseCommitteeMemberCount(markdown);
  const errors = [
    ...validateEvidenceHygiene(markdown, 'Committee Governance Evidence'),
    ...validateRequiredSections(markdown),
    ...validateClassification(markdown),
    ...scopes.errors,
    ...commands.errors,
    ...rotations.errors,
    ...positives.errors,
    ...negatives.errors,
    ...reviewers.errors,
    ...validateScopeRows(scopeRows),
    ...validateCommandRows(commandRows),
    ...validateRotationRows(rotationRows, committeeMemberCount),
    ...validatePositiveRows(positiveRows, committeeThreshold, extractNewCommitteeIdentifiers(rotationRows)),
    ...validateNegativeRows(negativeRows),
    ...validatePublicationRules(publicationDecision, markdown),
    ...validateReviewerRows(reviewerRows),
    ...validateReviewerIdentityConsistency(markdown, reviewerRows),
    ...validateReviewerDateConsistency(markdown, reviewerRows),
  ];

  if (errors.length > 0) {
    return {
      status: 'BLOCKED',
      scopeRows,
      commandRows,
      rotationRows,
      positiveRows,
      negativeRows,
      classification,
      publicationDecision,
      reviewerRows,
      errors,
      message: `Committee governance evidence BLOCKED: ${errors.length} structural issue(s).`,
    };
  }

  return {
    status: 'PASS',
    scopeRows,
    commandRows,
    rotationRows,
    positiveRows,
    negativeRows,
    classification,
    publicationDecision,
    reviewerRows,
    errors: [],
    message: `Committee governance evidence PASS: ${rotationRows.length} rotation rows and ${positiveRows.length} positive checks are linked.`,
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

function parseCommandRows(markdown: string): GovernanceCommandRow[] {
  return parseTableBetween(markdown, '## Required Commands', '## Rotation Plan').map(row => {
    if (row.length !== 3) throw new Error(`Malformed Required Commands row: ${row.join(' | ')}`);
    return {
      command: row[0],
      evidence: row[1],
      status: row[2],
    };
  });
}

function parseRotationRows(markdown: string): RotationPlanRow[] {
  return parseTableBetween(markdown, '## Rotation Plan', '## Positive Checks').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Rotation Plan row: ${row.join(' | ')}`);
    return {
      step: row[0],
      requiredEvidence: row[1],
      status: row[2],
      stopCondition: row[3],
    };
  });
}

function parsePositiveRows(markdown: string): GovernancePositiveCheckRow[] {
  return parseTableBetween(markdown, '## Positive Checks', '## Negative Checks').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Positive Checks row: ${row.join(' | ')}`);
    return {
      check: row[0],
      expectedResult: row[1],
      evidence: row[2],
      status: row[3],
    };
  });
}

function parseNegativeRows(markdown: string): GovernanceNegativeCheckRow[] {
  return parseTableBetween(markdown, '## Negative Checks', '## Publication Rules').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Negative Checks row: ${row.join(' | ')}`);
    return {
      check: row[0],
      expectedResult: row[1],
      evidence: row[2],
      status: row[3],
    };
  });
}

function parseClassification(markdown: string): Partial<GovernanceClassificationFields> {
  const fields = parseTwoColumnTable(sectionBetween(markdown, '## Drill Classification', '## Scope'));
  return {
    drillName: fields.get('Drill name'),
    gitCommit: fields.get('Git commit'),
    releaseLevel: fields.get('Release level'),
    environment: fields.get('Environment'),
    broadcastMode: fields.get('Broadcast mode'),
    governanceModel: fields.get('Governance model'),
    committeeThreshold: fields.get('Committee threshold'),
    committeeMemberCount: fields.get('Committee member count'),
    reviewer: fields.get('Reviewer'),
    date: fields.get('Date'),
  };
}

function parsePublicationRules(markdown: string): Partial<GovernancePublicationDecisionFields> {
  const fields = parseTwoColumnTable(sectionBetween(markdown, '## Publication Rules', '## Reviewer Sign-Off'));
  return {
    releaseSupported: fields.get('Release supported'),
    productionReadyClaimAllowed: fields.get('Production-ready claim allowed'),
    testnetProductionCandidateClaimAllowed: fields.get('Testnet production-candidate claim allowed'),
    governanceReadyClaimAllowed: fields.get('Governance-ready claim allowed'),
    openGovernanceBlockers: fields.get('Open governance blockers'),
    releaseNotesUpdated: fields.get('Release notes updated'),
    requiredReleaseNoteUpdates: fields.get('Required release-note updates'),
    requiredChecklistUpdates: fields.get('Required checklist updates'),
    externalReviewEvidence: fields.get('External review evidence'),
    reviewerDecisionSummary: fields.get('Reviewer decision summary'),
  };
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
  const section = sectionBetween(markdown, '## Drill Classification', '## Scope');
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
  validateAllowedField(errors, fields, 'Drill Classification', 'Governance model', ALLOWED_GOVERNANCE_MODELS);
  validateGitCommitField(errors, fields, 'Drill Classification', 'Git commit');
  validateIsoDateField(errors, fields, 'Drill Classification', 'Date');
  if (fields.get('Release level') === 'production deployment candidate' && fields.get('Environment') !== 'testnet') {
    errors.push('Drill Classification: production deployment candidate requires Environment testnet');
  }

  if (fields.get('Broadcast mode') === 'enabled') {
    errors.push('Drill Classification: Broadcast mode must not be enabled before Gate 6 governance evidence can pass');
  }

  if (fields.get('Governance model') === 'single signer') {
    errors.push('Drill Classification: Governance model must not be single signer before Gate 6 evidence can pass');
  }

  const thresholdValue = fields.get('Committee threshold') ?? '';
  const memberCountValue = fields.get('Committee member count') ?? '';
  const thresholdResult = parsePositiveSafeInteger(thresholdValue);
  const memberCountResult = parsePositiveSafeInteger(memberCountValue);
  const threshold = typeof thresholdResult === 'number' ? thresholdResult : null;
  const memberCount = typeof memberCountResult === 'number' ? memberCountResult : null;
  if (!isBlank(thresholdValue) && thresholdResult === 'invalid') {
    errors.push('Drill Classification: Committee threshold must be a positive integer');
  }
  if (!isBlank(thresholdValue) && thresholdResult === 'unsafe') {
    errors.push('Drill Classification: Committee threshold must be a safe integer');
  }
  if (!isBlank(memberCountValue) && memberCountResult === 'invalid') {
    errors.push('Drill Classification: Committee member count must be a positive integer');
  }
  if (!isBlank(memberCountValue) && memberCountResult === 'unsafe') {
    errors.push('Drill Classification: Committee member count must be a safe integer');
  }
  if (threshold !== null && threshold < 2) {
    errors.push('Drill Classification: Committee threshold must be at least 2 before Gate 6 evidence can pass');
  }
  if (memberCount !== null && memberCount < 3) {
    errors.push('Drill Classification: Committee member count must be at least 3 before Gate 6 evidence can pass');
  }
  if (threshold !== null && memberCount !== null && threshold > memberCount) {
    errors.push('Drill Classification: Committee threshold cannot exceed member count');
  } else if (threshold !== null && memberCount !== null && threshold >= memberCount) {
    errors.push('Drill Classification: Committee threshold must be lower than member count to prove member-loss tolerance');
  }

  return errors;
}

function validateScopeRows(rows: GovernanceScopeRow[]): string[] {
  const errors = validateRequiredNames('Scope', rows.map(row => row.surface), REQUIRED_COMMITTEE_GOVERNANCE_SCOPE_SURFACES);

  for (const row of rows) {
    if (!REQUIRED_COMMITTEE_GOVERNANCE_SCOPE_SURFACES.includes(row.surface)) {
      errors.push(`Scope: ${row.surface}: unexpected surface`);
    }
    validateLinkedStatus(errors, 'Scope', row.surface, row.status);
    if (isBlank(row.currentAuthority)) errors.push(`Scope: ${row.surface}: current authority is required`);
    if (isBlank(row.targetAuthority)) errors.push(`Scope: ${row.surface}: target authority is required`);
    for (const expectation of REQUIRED_SCOPE_AUTHORITY_EXPECTATIONS[row.surface] ?? []) {
      const value = row[expectation.field];
      const matches = expectation.pattern.test(value);
      if ((!expectation.forbidden && !matches) || (expectation.forbidden && matches)) {
        errors.push(`Scope: ${row.surface}: ${expectation.message}`);
      }
    }
    if (row.status === 'linked') {
      if (!hasEvidenceMarker(row.evidence)) {
        errors.push(`Scope: ${row.surface}: linked status requires an evidence marker`);
      } else if (!hasCompletedCommitteeGovernanceEvidenceTarget(row.evidence)) {
        errors.push(
          `Scope: ${row.surface}: linked status requires completed governance scope evidence, a non-template evidence link, or an artifact marker`,
        );
      } else if (!hasNoContradictoryCommitteeGovernanceEvidenceMarker(row.evidence)) {
        errors.push(`Scope: ${row.surface}: evidence must not include contradictory committee-governance failure markers`);
      }
    }
    if (row.status === 'linked' && leavesOpenGovernanceBlockers(row.evidence)) {
      errors.push(`Scope: ${row.surface}: evidence must not leave governance blockers open`);
    }
    if (row.status === 'linked' && approvesSingleSignerGovernance(row.evidence)) {
      errors.push(`Scope: ${row.surface}: evidence must not approve single-signer governance`);
    }
  }

  return errors;
}

function validateCommandRows(rows: GovernanceCommandRow[]): string[] {
  const errors = validateRequiredNames('Required Commands', rows.map(row => row.command), REQUIRED_COMMITTEE_GOVERNANCE_COMMANDS);

  for (const row of rows) {
    if (!REQUIRED_COMMITTEE_GOVERNANCE_COMMANDS.includes(row.command)) {
      errors.push(`Required Commands: ${row.command}: unexpected command`);
    }
    validateLinkedStatus(errors, 'Required Commands', row.command, row.status);
    if (row.status === 'linked') {
      if (!hasEvidenceMarker(row.evidence)) {
        errors.push(`Required Commands: ${row.command}: linked status requires an evidence marker`);
      } else if (!hasCompletedCommitteeGovernanceEvidenceTarget(row.evidence)) {
        errors.push(
          `Required Commands: ${row.command}: linked status requires completed command output, a non-template evidence link, or an artifact marker`,
        );
      }
      if (!commandEvidenceIdentifiesCommand(row.command, row.evidence)) {
        errors.push(`Required Commands: ${row.command}: evidence must identify ${row.command} output`);
      }
      if (!hasCommandOutputMarker(row.evidence)) {
        errors.push(`Required Commands: ${row.command}: evidence must include command-specific output`);
      } else if (!hasExplicitCommandExitCodeZero(row.evidence)) {
        errors.push(`Required Commands: ${row.command}: evidence command output must include exit code 0`);
      }
      if (!hasNoContradictoryCommitteeGovernanceEvidenceMarker(row.evidence)) {
        errors.push(`Required Commands: ${row.command}: evidence must not include contradictory committee-governance failure markers`);
      }
      if (hasContradictoryValidationFailureMarker(row.evidence)) {
        errors.push(`Required Commands: ${row.command}: evidence must contain internally positive governance command output`);
      }
      if (leavesOpenGovernanceBlockers(row.evidence)) {
        errors.push(`Required Commands: ${row.command}: evidence must not leave governance blockers open`);
      }
      if (approvesSingleSignerGovernance(row.evidence)) {
        errors.push(`Required Commands: ${row.command}: evidence must not approve single-signer governance`);
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

function validateRotationRows(rows: RotationPlanRow[], committeeMemberCount: number | null): string[] {
  const errors = validateRequiredNames('Rotation Plan', rows.map(row => row.step), REQUIRED_COMMITTEE_GOVERNANCE_ROTATION_STEPS);

  for (const row of rows) {
    if (!REQUIRED_COMMITTEE_GOVERNANCE_ROTATION_STEPS.includes(row.step)) {
      errors.push(`Rotation Plan: ${row.step}: unexpected step`);
    }
    validateLinkedStatus(errors, 'Rotation Plan', row.step, row.status);
    if (row.status === 'linked') {
      if (!hasEvidenceMarker(row.requiredEvidence)) {
        errors.push(`Rotation Plan: ${row.step}: linked status requires an evidence marker`);
      } else if (!hasCompletedCommitteeGovernanceEvidenceTarget(row.requiredEvidence)) {
        errors.push(
          `Rotation Plan: ${row.step}: linked status requires completed rotation evidence, a non-template evidence link, or an artifact marker`,
        );
      } else if (!hasNoContradictoryCommitteeGovernanceEvidenceMarker(row.requiredEvidence)) {
        errors.push(`Rotation Plan: ${row.step}: required evidence must not include contradictory committee-governance failure markers`);
      }
    }
    if (row.status === 'linked' && leavesOpenGovernanceBlockers(row.requiredEvidence)) {
      errors.push(`Rotation Plan: ${row.step}: required evidence must not leave governance blockers open`);
    }
    if (row.status === 'linked' && approvesSingleSignerGovernance(row.requiredEvidence)) {
      errors.push(`Rotation Plan: ${row.step}: required evidence must not approve single-signer governance`);
    }
    for (const marker of REQUIRED_ROTATION_EVIDENCE_FOCUS[row.step] ?? []) {
      if (!marker.pattern.test(row.requiredEvidence)) {
        errors.push(`Rotation Plan: ${row.step}: required evidence ${marker.message}`);
      }
    }
    if (row.status === 'linked' && row.step === 'Reconcile deployment state') {
      validateCommitteeGovernanceReconcileCommandOutput(
        errors,
        `Rotation Plan: ${row.step}: required evidence`,
        row.requiredEvidence,
      );
    }
    validateCommitteeIdentifierEvidence(errors, row, committeeMemberCount);
    if (isBlank(row.stopCondition)) {
      errors.push(`Rotation Plan: ${row.step}: stop condition is required`);
    } else if (!isActionableStopCondition(row.stopCondition)) {
      errors.push(
        `Rotation Plan: ${row.step}: stop condition must state an actionable stop, block, fail, pause, rollback, incident, or refusal condition`,
      );
    }
  }

  validateCommitteeRotationDisjointness(errors, rows);

  return errors;
}

function validateCommitteeIdentifierEvidence(
  errors: string[],
  row: RotationPlanRow,
  committeeMemberCount: number | null,
): void {
  if (row.step === 'Identify old committee public keys') {
    if (extractPublicCommitteeIdentifiers(row.requiredEvidence).length < 1) {
      errors.push(
        'Rotation Plan: Identify old committee public keys: required evidence must include at least one concrete public key/hash identifier',
      );
    }
    return;
  }

  if (row.step === 'Identify new committee public keys') {
    const minimumIdentifiers = committeeMemberCount ?? 1;
    if (extractPublicCommitteeIdentifiers(row.requiredEvidence).length < minimumIdentifiers) {
      errors.push(
        `Rotation Plan: Identify new committee public keys: required evidence must include at least ${minimumIdentifiers} concrete public key/hash identifier${minimumIdentifiers === 1 ? '' : 's'} matching Committee member count`,
      );
    }
  }
}

function validateCommitteeRotationDisjointness(errors: string[], rows: RotationPlanRow[]): void {
  const oldCommitteeIdentifiers = extractCommitteeIdentifiersForStep(rows, 'Identify old committee public keys');
  const newCommitteeIdentifiers = extractCommitteeIdentifiersForStep(rows, 'Identify new committee public keys');
  if (oldCommitteeIdentifiers.size === 0 || newCommitteeIdentifiers.size === 0) return;

  const reusesOldCommitteeIdentifier = [...newCommitteeIdentifiers].some(identifier =>
    oldCommitteeIdentifiers.has(identifier),
  );
  if (reusesOldCommitteeIdentifier) {
    errors.push(
      'Rotation Plan: Identify new committee public keys: must not reuse old committee public key/hash identifiers',
    );
  }
}

function validatePositiveRows(
  rows: GovernancePositiveCheckRow[],
  committeeThreshold: number | null,
  newCommitteeIdentifiers: Set<string>,
): string[] {
  const errors = validateRequiredNames('Positive Checks', rows.map(row => row.check), REQUIRED_COMMITTEE_GOVERNANCE_POSITIVE_CHECKS);

  for (const row of rows) {
    if (!REQUIRED_COMMITTEE_GOVERNANCE_POSITIVE_CHECKS.includes(row.check)) {
      errors.push(`Positive Checks: ${row.check}: unexpected check`);
    }
    validateLinkedStatus(errors, 'Positive Checks', row.check, row.status);
    if (isBlank(row.expectedResult)) {
      errors.push(`Positive Checks: ${row.check}: expected result is required`);
    }
    if (
      !isBlank(row.expectedResult) &&
      !hasCommitteeGovernancePositiveExpectedResult(row.expectedResult)
    ) {
      errors.push(
        `Positive Checks: ${row.check}: expected result must state accepted, approved, passed, validated, verified, or succeeded`,
      );
    }
    if (!isBlank(row.expectedResult) && hasSlashDelimitedCheckExpectedResultAlternative(row.expectedResult)) {
      errors.push(
        `Positive Checks: ${row.check}: expected result must use one exact positive outcome without slash-delimited alternatives`,
      );
    }
    if (row.status === 'linked') {
      if (!hasEvidenceMarker(row.evidence)) {
        errors.push(`Positive Checks: ${row.check}: linked status requires an evidence marker`);
      } else if (!hasCompletedCommitteeGovernanceEvidenceTarget(row.evidence)) {
        errors.push(
          `Positive Checks: ${row.check}: linked status requires completed positive-check evidence, a non-template evidence link, or an artifact marker`,
        );
      } else if (!hasNoContradictoryCommitteeGovernanceEvidenceMarker(row.evidence)) {
        errors.push(`Positive Checks: ${row.check}: evidence must not include contradictory committee-governance failure markers`);
      }
      if (leavesOpenGovernanceBlockers(row.evidence)) {
        errors.push(`Positive Checks: ${row.check}: evidence must not leave governance blockers open`);
      }
      if (approvesSingleSignerGovernance(row.evidence)) {
        errors.push(`Positive Checks: ${row.check}: evidence must not approve single-signer governance`);
      }
      for (const marker of REQUIRED_POSITIVE_EVIDENCE_FOCUS[row.check] ?? []) {
        if (!marker.pattern.test(row.evidence)) {
          errors.push(`Positive Checks: ${row.check}: evidence ${marker.message}`);
        }
      }
      if (committeeThreshold !== null) {
        const identifiers = extractPublicCommitteeIdentifiers(row.evidence);
        const identifierCount = identifiers.length;
        if (identifierCount < committeeThreshold) {
          errors.push(
            `Positive Checks: ${row.check}: evidence must include at least ${committeeThreshold} concrete public key/hash identifiers matching Committee threshold`,
          );
        }
        if (newCommitteeIdentifiers.size > 0) {
          const declaredNewCommitteeSignerCount = identifiers
            .filter(identifier => newCommitteeIdentifiers.has(identifier))
            .length;
          if (declaredNewCommitteeSignerCount < committeeThreshold) {
            errors.push(
              `Positive Checks: ${row.check}: evidence must include at least ${committeeThreshold} declared new committee public key/hash identifiers matching Committee threshold`,
            );
          }
        }
      }
    }
  }

  return errors;
}

function validateNegativeRows(rows: GovernanceNegativeCheckRow[]): string[] {
  const errors = validateRequiredNames('Negative Checks', rows.map(row => row.check), REQUIRED_COMMITTEE_GOVERNANCE_NEGATIVE_CHECKS);

  for (const row of rows) {
    if (!REQUIRED_COMMITTEE_GOVERNANCE_NEGATIVE_CHECKS.includes(row.check)) {
      errors.push(`Negative Checks: ${row.check}: unexpected check`);
    }
    validateLinkedStatus(errors, 'Negative Checks', row.check, row.status);
    if (isBlank(row.expectedResult)) {
      errors.push(`Negative Checks: ${row.check}: expected result is required`);
    }
    if (
      !isBlank(row.expectedResult) &&
      !hasCommitteeGovernanceNegativeExpectedResult(row.expectedResult)
    ) {
      errors.push(`Negative Checks: ${row.check}: expected result must state rejected, blocked, refused, or failed`);
    }
    if (!isBlank(row.expectedResult) && hasSlashDelimitedCheckExpectedResultAlternative(row.expectedResult)) {
      errors.push(
        `Negative Checks: ${row.check}: expected result must use one exact fail-closed outcome without slash-delimited alternatives`,
      );
    }
    if (row.status === 'linked') {
      if (!hasEvidenceMarker(row.evidence)) {
        errors.push(`Negative Checks: ${row.check}: linked status requires an evidence marker`);
      } else if (!hasCompletedCommitteeGovernanceEvidenceTarget(row.evidence)) {
        errors.push(
          `Negative Checks: ${row.check}: linked status requires completed negative-check evidence, a non-template evidence link, or an artifact marker`,
        );
      } else if (!hasNoContradictoryCommitteeGovernanceNegativeEvidenceMarker(row.evidence)) {
        errors.push(`Negative Checks: ${row.check}: evidence must not include contradictory committee-governance failure markers`);
      }
      if (leavesOpenGovernanceBlockers(row.evidence)) {
        errors.push(`Negative Checks: ${row.check}: evidence must not leave governance blockers open`);
      }
      if (approvesSingleSignerGovernance(row.evidence)) {
        errors.push(`Negative Checks: ${row.check}: evidence must not approve single-signer governance`);
      }
      for (const marker of REQUIRED_NEGATIVE_EVIDENCE_FOCUS[row.check] ?? []) {
        if (!marker.pattern.test(row.evidence)) {
          errors.push(`Negative Checks: ${row.check}: evidence ${marker.message}`);
        }
      }
      if (
        NEGATIVE_CHECKS_REQUIRING_SIGNER_IDENTIFIER.has(row.check) &&
        extractPublicCommitteeIdentifiers(row.evidence).length === 0
      ) {
        errors.push(
          `Negative Checks: ${row.check}: evidence must include a concrete public key/hash identifier for the rejected signer`,
        );
      }
      if (row.check === 'Deployment state points to the wrong network') {
        validateCommitteeGovernanceReconcileCommandOutput(
          errors,
          `Negative Checks: ${row.check}: evidence`,
          row.evidence,
        );
      }
    }
  }

  return errors;
}

function validateCommitteeGovernanceReconcileCommandOutput(
  errors: string[],
  prefix: string,
  evidence: string,
): void {
  if (!commandEvidenceIdentifiesCommand(COMMITTEE_GOVERNANCE_RECONCILE_COMMAND, evidence)) {
    errors.push(`${prefix} must identify ${COMMITTEE_GOVERNANCE_RECONCILE_COMMAND} output`);
  }
  if (!hasCommandOutputMarker(evidence)) {
    errors.push(`${prefix} must include sanitized reconciliation command output`);
  }
  if (!hasExplicitCommandExitCodeZero(evidence)) {
    errors.push(`${prefix} command output must include exit code 0`);
  }
}

function validatePublicationRules(
  fields: Partial<GovernancePublicationDecisionFields>,
  markdown: string,
): string[] {
  const section = sectionBetween(markdown, '## Publication Rules', '## Reviewer Sign-Off');
  const rawFields = parseTwoColumnTable(section);
  const errors = validateDuplicateRequiredFields(
    'Publication Rules',
    parseTwoColumnFieldNames(section),
    REQUIRED_PUBLICATION_FIELDS,
  );

  for (const field of REQUIRED_PUBLICATION_FIELDS) {
    if (isBlank(rawFields.get(field) ?? '')) errors.push(`Publication Rules: ${field} is required`);
  }

  validateAllowedField(errors, rawFields, 'Publication Rules', 'Release supported', ALLOWED_RELEASE_SUPPORT);
  validateAllowedField(errors, rawFields, 'Publication Rules', 'Production-ready claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, rawFields, 'Publication Rules', 'Testnet production-candidate claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, rawFields, 'Publication Rules', 'Governance-ready claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, rawFields, 'Publication Rules', 'Release notes updated', ALLOWED_YES_NO);

  const classification = parseTwoColumnTable(sectionBetween(markdown, '## Drill Classification', '## Scope'));
  const releaseLevel = classification.get('Release level') ?? '';
  const environment = classification.get('Environment') ?? '';
  if (fields.releaseSupported === 'none') {
    errors.push('Publication Rules: Release supported must not be none before committee governance evidence can pass');
  }
  if (
    fields.releaseSupported !== undefined &&
    fields.releaseSupported !== 'none' &&
    releaseExceedsClassificationLevel(fields.releaseSupported, releaseLevel)
  ) {
    errors.push('Publication Rules: Release supported must not exceed Drill Classification release level');
  }
  if (releaseLevel === 'production deployment candidate' && fields.releaseSupported !== 'production deployment candidate') {
    errors.push(
      'Publication Rules: production deployment candidate drill requires exact Release supported = production deployment candidate',
    );
  }
  if (fields.releaseSupported === 'production deployment candidate' && environment !== 'testnet') {
    errors.push('Publication Rules: production deployment candidate support requires exact Drill Classification Environment = testnet');
  }
  if (fields.governanceReadyClaimAllowed === 'no') {
    errors.push('Publication Rules: Governance-ready claim allowed must be yes before committee governance evidence can pass');
  }
  if (fields.productionReadyClaimAllowed === 'yes') {
    errors.push(
      'Publication Rules: Production-ready claim allowed must be no for Gate 6; use Testnet production-candidate claim allowed for testnet production-candidate support',
    );
  }
  if (
    fields.releaseSupported === 'production deployment candidate' &&
    fields.testnetProductionCandidateClaimAllowed !== 'yes'
  ) {
    errors.push(
      'Publication Rules: production deployment candidate support requires exact Testnet production-candidate claim allowed = yes',
    );
  }
  if (
    fields.testnetProductionCandidateClaimAllowed === 'yes' &&
    fields.releaseSupported !== 'production deployment candidate'
  ) {
    errors.push(
      'Publication Rules: Testnet production-candidate claim allowed requires production deployment candidate support',
    );
  }
  if (!isBlank(fields.openGovernanceBlockers ?? '') && !/^0$/.test(fields.openGovernanceBlockers ?? '')) {
    errors.push('Publication Rules: Open governance blockers must be 0 before committee governance evidence can pass');
  }
  if (fields.releaseNotesUpdated === 'no') {
    errors.push('Publication Rules: Release notes updated must be yes before committee governance evidence can pass');
  }
  if (
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !isActionableReviewerDecisionSummary(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Rules: Reviewer decision summary must mention release support, governance-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and open governance blocker handling',
    );
  }
  validateNoContradictoryGovernanceDecisionBindings(
    errors,
    'Reviewer decision summary',
    fields.reviewerDecisionSummary ?? '',
  );
  if (
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !hasExactGovernanceReadyClaimAllowedBinding(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push('Publication Rules: Reviewer decision summary must use exact Governance-ready claim allowed = yes');
  }
  if (
    fields.productionReadyClaimAllowed === 'no' &&
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !hasExactProductionReadyClaimDeniedBinding(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push('Publication Rules: Reviewer decision summary must use exact Production-ready claim allowed = no');
  }
  if (
    !isBlank(fields.releaseSupported ?? '') &&
    fields.releaseSupported !== 'none' &&
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !hasExactReleaseSupportedBinding(fields.reviewerDecisionSummary ?? '', fields.releaseSupported ?? '')
  ) {
    errors.push(
      `Publication Rules: Reviewer decision summary must use exact Release supported = ${fields.releaseSupported}`,
    );
  }
  if (
    (fields.testnetProductionCandidateClaimAllowed === 'yes' ||
      fields.testnetProductionCandidateClaimAllowed === 'no') &&
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !hasExactTestnetProductionCandidateClaimAllowedBinding(
      fields.reviewerDecisionSummary ?? '',
      fields.testnetProductionCandidateClaimAllowed,
    )
  ) {
    errors.push(
      `Publication Rules: Reviewer decision summary must use exact Testnet production-candidate claim allowed = ${fields.testnetProductionCandidateClaimAllowed}`,
    );
  }
  if (
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !hasExactOpenGovernanceBlockersBinding(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push('Publication Rules: Reviewer decision summary must use exact Open governance blockers = 0');
  }
  if (
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    (
      reviewerSummaryLeavesOpenGovernanceBlockers(fields.reviewerDecisionSummary ?? '') ||
      (
        mentionsOpenGovernanceBlockers(fields.reviewerDecisionSummary ?? '') &&
        !closesOpenGovernanceBlockersInReviewerSummary(fields.reviewerDecisionSummary ?? '')
      )
    )
  ) {
    errors.push('Publication Rules: Reviewer decision summary: open governance blockers must be 0');
  }
  if (approvesOpenGovernanceBlockers(fields.reviewerDecisionSummary ?? '')) {
    errors.push('Publication Rules: Reviewer decision summary must not approve open governance blockers');
  }
  if (approvesSingleSignerGovernance(fields.reviewerDecisionSummary ?? '')) {
    errors.push('Publication Rules: Reviewer decision summary must not approve single-signer governance');
  }
  errors.push(
    ...validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Rules: Reviewer decision summary',
      summary: fields.reviewerDecisionSummary ?? '',
      releaseSupported: fields.releaseSupported,
      productionReadyClaimAllowed: fields.productionReadyClaimAllowed,
      testnetProductionCandidateClaimAllowed: fields.testnetProductionCandidateClaimAllowed,
    }),
  );

  validatePublicationEvidenceMarker(
    errors,
    'Required release-note updates',
    fields.requiredReleaseNoteUpdates ?? '',
    'completed Gate 6 governance release-note update evidence',
  );
  validateNoContradictoryGovernanceDecisionBindings(
    errors,
    'Required release-note updates',
    fields.requiredReleaseNoteUpdates ?? '',
  );
  validatePublicationEvidenceMarker(
    errors,
    'Required checklist updates',
    fields.requiredChecklistUpdates ?? '',
    'completed Gate 6 governance checklist update evidence',
  );
  validateNoContradictoryGovernanceDecisionBindings(
    errors,
    'Required checklist updates',
    fields.requiredChecklistUpdates ?? '',
  );
  if (
    fields.governanceReadyClaimAllowed === 'yes' &&
    !isBlank(fields.requiredReleaseNoteUpdates ?? '') &&
    !hasExactGovernanceReadyClaimAllowedBinding(fields.requiredReleaseNoteUpdates ?? '')
  ) {
    errors.push('Publication Rules: Required release-note updates must use exact Governance-ready claim allowed = yes');
  }
  if (
    fields.governanceReadyClaimAllowed === 'yes' &&
    !isBlank(fields.requiredChecklistUpdates ?? '') &&
    !hasExactGovernanceReadyClaimAllowedBinding(fields.requiredChecklistUpdates ?? '')
  ) {
    errors.push('Publication Rules: Required checklist updates must use exact Governance-ready claim allowed = yes');
  }
  if (
    fields.governanceReadyClaimAllowed === 'yes' &&
    !isBlank(fields.externalReviewEvidence ?? '') &&
    !hasExactGovernanceReadyClaimAllowedBinding(fields.externalReviewEvidence ?? '')
  ) {
    errors.push('Publication Rules: External review evidence must use exact Governance-ready claim allowed = yes');
  }
  if (
    fields.productionReadyClaimAllowed === 'no' &&
    !isBlank(fields.requiredReleaseNoteUpdates ?? '') &&
    !hasExactProductionReadyClaimDeniedBinding(fields.requiredReleaseNoteUpdates ?? '')
  ) {
    errors.push('Publication Rules: Required release-note updates must use exact Production-ready claim allowed = no');
  }
  if (
    fields.productionReadyClaimAllowed === 'no' &&
    !isBlank(fields.requiredChecklistUpdates ?? '') &&
    !hasExactProductionReadyClaimDeniedBinding(fields.requiredChecklistUpdates ?? '')
  ) {
    errors.push('Publication Rules: Required checklist updates must use exact Production-ready claim allowed = no');
  }
  if (
    fields.productionReadyClaimAllowed === 'no' &&
    !isBlank(fields.externalReviewEvidence ?? '') &&
    !hasExactProductionReadyClaimDeniedBinding(fields.externalReviewEvidence ?? '')
  ) {
    errors.push('Publication Rules: External review evidence must use exact Production-ready claim allowed = no');
  }
  if (
    fields.releaseSupported === 'production deployment candidate' &&
    !isBlank(fields.requiredReleaseNoteUpdates ?? '') &&
    !hasExactProductionCandidateReleaseSupportedBinding(fields.requiredReleaseNoteUpdates ?? '')
  ) {
    errors.push(
      'Publication Rules: Required release-note updates must use exact Release supported = production deployment candidate',
    );
  }
  if (
    fields.releaseSupported === 'production deployment candidate' &&
    !isBlank(fields.requiredChecklistUpdates ?? '') &&
    !hasExactProductionCandidateReleaseSupportedBinding(fields.requiredChecklistUpdates ?? '')
  ) {
    errors.push(
      'Publication Rules: Required checklist updates must use exact Release supported = production deployment candidate',
    );
  }
  if (
    fields.releaseSupported === 'production deployment candidate' &&
    !isBlank(fields.externalReviewEvidence ?? '') &&
    !hasExactProductionCandidateReleaseSupportedBinding(fields.externalReviewEvidence ?? '')
  ) {
    errors.push(
      'Publication Rules: External review evidence must use exact Release supported = production deployment candidate',
    );
  }
  if (
    (fields.testnetProductionCandidateClaimAllowed === 'yes' ||
      fields.testnetProductionCandidateClaimAllowed === 'no') &&
    !isBlank(fields.requiredReleaseNoteUpdates ?? '') &&
    !hasExactTestnetProductionCandidateClaimAllowedBinding(
      fields.requiredReleaseNoteUpdates ?? '',
      fields.testnetProductionCandidateClaimAllowed,
    )
  ) {
    errors.push(
      `Publication Rules: Required release-note updates must use exact Testnet production-candidate claim allowed = ${fields.testnetProductionCandidateClaimAllowed}`,
    );
  }
  if (
    (fields.testnetProductionCandidateClaimAllowed === 'yes' ||
      fields.testnetProductionCandidateClaimAllowed === 'no') &&
    !isBlank(fields.requiredChecklistUpdates ?? '') &&
    !hasExactTestnetProductionCandidateClaimAllowedBinding(
      fields.requiredChecklistUpdates ?? '',
      fields.testnetProductionCandidateClaimAllowed,
    )
  ) {
    errors.push(
      `Publication Rules: Required checklist updates must use exact Testnet production-candidate claim allowed = ${fields.testnetProductionCandidateClaimAllowed}`,
    );
  }
  if (
    (fields.testnetProductionCandidateClaimAllowed === 'yes' ||
      fields.testnetProductionCandidateClaimAllowed === 'no') &&
    !isBlank(fields.externalReviewEvidence ?? '') &&
    !hasExactTestnetProductionCandidateClaimAllowedBinding(
      fields.externalReviewEvidence ?? '',
      fields.testnetProductionCandidateClaimAllowed,
    )
  ) {
    errors.push(
      `Publication Rules: External review evidence must use exact Testnet production-candidate claim allowed = ${fields.testnetProductionCandidateClaimAllowed}`,
    );
  }
  if (
    fields.openGovernanceBlockers === '0' &&
    !isBlank(fields.requiredReleaseNoteUpdates ?? '') &&
    !hasExactOpenGovernanceBlockersBinding(fields.requiredReleaseNoteUpdates ?? '')
  ) {
    errors.push(
      'Publication Rules: Required release-note updates must use exact numeric Open governance blockers = 0; textual or shorthand governance blocker terms are not accepted',
    );
  }
  if (
    fields.openGovernanceBlockers === '0' &&
    !isBlank(fields.requiredChecklistUpdates ?? '') &&
    !hasExactOpenGovernanceBlockersBinding(fields.requiredChecklistUpdates ?? '')
  ) {
    errors.push(
      'Publication Rules: Required checklist updates must use exact numeric Open governance blockers = 0; textual or shorthand governance blocker terms are not accepted',
    );
  }
  if (
    fields.openGovernanceBlockers === '0' &&
    !isBlank(fields.externalReviewEvidence ?? '') &&
    !hasExactOpenGovernanceBlockersBinding(fields.externalReviewEvidence ?? '')
  ) {
    errors.push(
      'Publication Rules: External review evidence must use exact numeric Open governance blockers = 0; textual or shorthand governance blocker terms are not accepted',
    );
  }
  validatePublicationEvidenceMarker(
    errors,
    'External review evidence',
    fields.externalReviewEvidence ?? '',
    'completed Gate 6 governance external review evidence',
  );
  validateNoContradictoryGovernanceDecisionBindings(
    errors,
    'External review evidence',
    fields.externalReviewEvidence ?? '',
  );
  if (
    hasCompletedCommitteeGovernanceReleaseNoteUpdateEvidence(fields.requiredReleaseNoteUpdates ?? '') &&
    hasCompletedCommitteeGovernanceChecklistUpdateEvidence(fields.requiredChecklistUpdates ?? '') &&
    haveSharedConcreteCommitteeGovernanceEvidenceTarget(
      fields.requiredReleaseNoteUpdates ?? '',
      fields.requiredChecklistUpdates ?? '',
    )
  ) {
    errors.push(
      'Publication Rules: Required release-note updates and Required checklist updates must use distinct completed Gate 6 governance evidence targets',
    );
  }
  if (
    hasCompletedCommitteeGovernanceExternalReviewEvidence(fields.externalReviewEvidence ?? '') &&
    (
      (
        hasCompletedCommitteeGovernanceReleaseNoteUpdateEvidence(fields.requiredReleaseNoteUpdates ?? '') &&
        haveSharedConcreteCommitteeGovernanceEvidenceTarget(
          fields.requiredReleaseNoteUpdates ?? '',
          fields.externalReviewEvidence ?? '',
        )
      ) ||
      (
        hasCompletedCommitteeGovernanceChecklistUpdateEvidence(fields.requiredChecklistUpdates ?? '') &&
        haveSharedConcreteCommitteeGovernanceEvidenceTarget(
          fields.requiredChecklistUpdates ?? '',
          fields.externalReviewEvidence ?? '',
        )
      )
    )
  ) {
    errors.push(
      'Publication Rules: External review evidence must use a distinct completed Gate 6 governance external review evidence target from Required release-note updates and Required checklist updates',
    );
  }

  return errors;
}

function validatePublicationEvidenceMarker(
  errors: string[],
  field: string,
  value: string,
  evidenceKind: string,
): void {
  if (isBlank(value)) return;
  if (!hasEvidenceMarker(value)) {
    errors.push(`Publication Rules: ${field} must include a link, command, or artifact marker`);
  } else if (!hasCompletedCommitteeGovernanceEvidenceTarget(value)) {
    errors.push(
      `Publication Rules: ${field} must include ${evidenceKind} with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence`,
    );
  }
  if (!identifiesPublicationEvidenceKind(value, evidenceKind)) {
    errors.push(`Publication Rules: ${field} must identify ${evidenceKind}`);
  }
  if (!hasNoContradictoryCommitteeGovernanceEvidenceMarker(value)) {
    errors.push(`Publication Rules: ${field} must not include contradictory committee-governance failure markers`);
  }
  if (containsMainnetProductionClaim(value)) {
    errors.push(`Publication Rules: ${field} must not contain mainnet production claim wording`);
  }
  if (containsProductionReadyClaim(value)) {
    errors.push(`Publication Rules: ${field} must not contain production-ready claim wording`);
  }
  if (leavesOpenGovernanceBlockers(value)) {
    errors.push(`Publication Rules: ${field} must not leave governance blockers open`);
  }
  if (usesNonExactGovernanceBlockerClosure(value)) {
    errors.push(
      `Publication Rules: ${field} must use exact numeric Open governance blockers = 0; textual or shorthand governance blocker terms are not accepted`,
    );
  }
  if (usesProseOnlyGovernanceReadyClaimClosure(value)) {
    errors.push(
      `Publication Rules: ${field} must use exact Governance-ready claim allowed = yes; prose-only governance-ready closure is not accepted`,
    );
  }
  if (approvesSingleSignerGovernance(value)) {
    errors.push(`Publication Rules: ${field} must not approve single-signer governance`);
  }
}

function validateNoContradictoryGovernanceDecisionBindings(
  errors: string[],
  field: string,
  value: string,
): void {
  if (isBlank(value)) return;
  if (hasContradictoryGovernanceDecisionBinding(value)) {
    errors.push(`Publication Rules: ${field} must not include contradictory governance decision bindings`);
  }
}

function validateReviewerRows(rows: ReviewerSignoffRow[]): string[] {
  const errors = validateRequiredNames('Reviewer Sign-Off', rows.map(row => row.role), REQUIRED_COMMITTEE_GOVERNANCE_REVIEWER_ROLES);

  for (const row of rows) {
    if (!REQUIRED_COMMITTEE_GOVERNANCE_REVIEWER_ROLES.includes(row.role)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: unexpected role`);
    }
    if (isBlank(row.name)) errors.push(`Reviewer Sign-Off: ${row.role}: name is required`);
    if (!ALLOWED_REVIEWER_DECISIONS.has(row.decision as ReviewerDecision)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve or block`);
    } else if (row.decision !== 'approve') {
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve before committee governance evidence can pass`);
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
    } else if (!hasNoContradictoryCommitteeGovernanceEvidenceMarker(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not include contradictory committee-governance failure markers`);
    } else if (hasContradictoryGovernanceDecisionBinding(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not include contradictory governance decision bindings`);
    } else if (approvesOpenGovernanceBlockers(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve open governance blockers`);
    } else if (leavesOpenGovernanceBlockers(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not leave governance blockers open`);
    } else if (approvesSingleSignerGovernance(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve single-signer governance`);
    } else if (!isActionableReviewerNote(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must state a concrete governance-readiness outcome`);
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
  const classification = parseTwoColumnTable(sectionBetween(markdown, '## Drill Classification', '## Scope'));
  const classifiedReviewer = classification.get('Reviewer')?.trim() ?? '';
  const governanceOwnerSignoff = rows.find(row => row.role === 'Governance owner')?.name.trim() ?? '';

  if (
    classifiedReviewer.length > 0 &&
    governanceOwnerSignoff.length > 0 &&
    classifiedReviewer !== governanceOwnerSignoff
  ) {
    return ['Reviewer Sign-Off: Governance owner: name must match Drill Classification Reviewer'];
  }

  return [];
}

function validateReviewerDateConsistency(markdown: string, rows: ReviewerSignoffRow[]): string[] {
  const classification = parseTwoColumnTable(sectionBetween(markdown, '## Drill Classification', '## Scope'));
  const classificationDate = classification.get('Date')?.trim() ?? '';
  if (!isIsoCalendarDate(classificationDate)) return [];

  return rows
    .filter(row => isIsoCalendarDate(row.date) && row.date < classificationDate)
    .map(row => `Reviewer Sign-Off: ${row.role}: Date must not be before Drill Classification Date`);
}

function validateLinkedStatus(errors: string[], section: string, label: string, status: string): void {
  if (!ALLOWED_STATUSES.has(status as CommitteeGovernanceEvidenceStatus)) {
    errors.push(`${section}: ${label}: status must be pending, linked, or blocker`);
    return;
  }
  if (status !== 'linked') {
    errors.push(`${section}: ${label}: status must be linked before committee governance evidence can pass`);
  }
}

function releaseExceedsClassificationLevel(releaseSupported: string, releaseLevel: string): boolean {
  const supportedRank = RELEASE_LEVEL_RANK.get(releaseSupported);
  const classificationRank = RELEASE_LEVEL_RANK.get(releaseLevel);
  if (supportedRank === undefined || classificationRank === undefined) return false;
  return supportedRank > classificationRank;
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
    /\bspike010a-committee-guard-eval\.ts\b/.test(value) ||
    /(?:^|\s)artifact:\/\//.test(value)
  );
}

function hasCompletedEvidenceMarker(value: string): boolean {
  return (
    hasCompletedArtifactTarget(value) ||
    hasNonTemplateMarkdownLink(value) ||
    hasCommandOutputMarker(value)
  );
}

function hasCompletedEvidenceTarget(value: string): boolean {
  const completedEvidenceText = committeeGovernanceCompletedEvidenceText(value);
  return !hasLocalOnlyEvidenceTarget(value) &&
    (hasCompletedArtifactTarget(completedEvidenceText) || hasNonTemplateMarkdownLink(completedEvidenceText));
}

export function hasCompletedCommitteeGovernanceEvidenceTarget(value: string): boolean {
  return hasCompletedEvidenceTarget(value);
}

export function hasCompletedCommitteeGovernanceReleaseNoteUpdateEvidence(value: string): boolean {
  return (
    hasCompletedCommitteeGovernanceEvidenceTarget(value) &&
    identifiesPublicationEvidenceKind(value, 'completed Gate 6 governance release-note update evidence') &&
    hasNoContradictoryCommitteeGovernanceEvidenceMarker(value)
  );
}

export function hasCompletedCommitteeGovernanceChecklistUpdateEvidence(value: string): boolean {
  return (
    hasCompletedCommitteeGovernanceEvidenceTarget(value) &&
    identifiesPublicationEvidenceKind(value, 'completed Gate 6 governance checklist update evidence') &&
    hasNoContradictoryCommitteeGovernanceEvidenceMarker(value)
  );
}

export function hasCompletedCommitteeGovernanceExternalReviewEvidence(value: string): boolean {
  return (
    hasCompletedCommitteeGovernanceEvidenceTarget(value) &&
    identifiesPublicationEvidenceKind(value, 'completed Gate 6 governance external review evidence') &&
    hasNoContradictoryCommitteeGovernanceEvidenceMarker(value)
  );
}

export function hasNoContradictoryCommitteeGovernanceEvidenceMarker(value: string): boolean {
  return !hasContradictoryValidationFailureMarker(value);
}

export function hasNoContradictoryCommitteeGovernanceNegativeEvidenceMarker(value: string): boolean {
  return !hasContradictoryNegativeEvidenceFailureMarker(value);
}

function hasSlashDelimitedCheckExpectedResultAlternative(value: string): boolean {
  return CHECK_EXPECTED_RESULT_ALTERNATIVE_PATTERN.test(value);
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

function extractCompletedCommitteeGovernanceEvidenceTargets(value: string): string[] {
  return extractEvidenceTargets(committeeGovernanceCompletedEvidenceText(value));
}

function committeeGovernanceCompletedEvidenceText(value: string): string {
  return value
    .split(/[;\n]+/)
    .map(segment => {
      const targetBinding = findCommitteeGovernanceValidationTargetBinding(segment);
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

function hasClaimEscalatingCommitteeGovernanceEvidenceTarget(target: string): boolean {
  const comparable = normalizeEvidenceKind(target);
  return (
    classifyPublicationClaimText(comparable).hasProductionClaim ||
    approvesOpenGovernanceBlockers(comparable) ||
    approvesSingleSignerGovernance(comparable)
  );
}

function isConcreteEvidenceTarget(target: string): boolean {
  const normalized = normalizeEvidenceTarget(target);
  if (normalized.length === 0) return false;
  if (hasClaimEscalatingCommitteeGovernanceEvidenceTarget(normalized)) return false;
  if (/^artifact:\/\//i.test(normalized)) return isConcreteArtifactTarget(normalized);
  if (isLocalOnlyEvidenceTarget(normalized)) return false;
  if (isSensitiveOrRuntimeCommitteeGovernanceEvidenceTarget(normalized)) return false;
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

function isSensitiveOrRuntimeCommitteeGovernanceEvidenceTarget(target: string): boolean {
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(isSensitiveOrRuntimeCommitteeGovernanceEvidenceInspectionTarget);
}

function isSensitiveOrRuntimeCommitteeGovernanceEvidenceInspectionTarget(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasCommitteeGovernanceEnvironmentTargetSegment(normalizedTarget) ||
    hasCommitteeGovernanceRuntimeDatabaseTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalizedTarget, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
  );
}

function hasCommitteeGovernanceEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasCommitteeGovernanceRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function haveSharedConcreteCommitteeGovernanceEvidenceTarget(left: string, right: string): boolean {
  const leftTargets = new Set(
    extractCompletedCommitteeGovernanceEvidenceTargets(left)
      .map(normalizeEvidenceTarget)
      .filter(isConcreteEvidenceTarget),
  );
  return extractCompletedCommitteeGovernanceEvidenceTargets(right)
    .map(normalizeEvidenceTarget)
    .filter(isConcreteEvidenceTarget)
    .some(target => leftTargets.has(target));
}

function identifiesPublicationEvidenceKind(value: string, evidenceKind: string): boolean {
  const normalizedKind = normalizeEvidenceKind(evidenceKind);
  return publicationEvidenceTargetsIdentifyKind(value, normalizedKind) ||
    publicationEvidenceKindTextSegments(value)
      .some(segment =>
        segment === normalizedKind ||
        segment.startsWith(`${normalizedKind} `)
      );
}

function publicationEvidenceTargetsIdentifyKind(value: string, normalizedKind: string): boolean {
  const expectedSlug = normalizedKind.replace(/\s+/g, '-');
  return extractEvidenceTargets(value)
    .some(target => normalizeEvidenceTargetBasename(target) === expectedSlug);
}

function normalizeEvidenceTargetBasename(target: string): string {
  const normalizedTarget = normalizeEvidenceTarget(target).replace(/\\/g, '/');
  const basename = normalizedTarget.split('/').filter(Boolean).pop() ?? normalizedTarget;
  return normalizeEvidenceKind(basename.replace(/\.[a-z0-9]+$/i, '')).replace(/\s+/g, '-');
}

function publicationEvidenceKindTextSegments(value: string): string[] {
  return value
    .split(/[;\n|]+/)
    .map(stripLeadingEvidenceTarget)
    .map(normalizeEvidenceKind)
    .filter(segment => segment.length > 0);
}

function stripLeadingEvidenceTarget(value: string): string {
  const trimmed = value.trim();
  const markdownMatch = /^\[[^\]]+\]\([^)]+\)/.exec(trimmed);
  if (markdownMatch) return trimmed.slice(markdownMatch[0].length).replace(/^[\s,.:;-]+/, '');

  const artifactMatch = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+/i.exec(trimmed);
  if (artifactMatch) return trimmed.slice(artifactMatch[0].length).replace(/^[\s,.:;-]+/, '');

  return trimmed;
}

function normalizeEvidenceKind(value: string): string {
  return normalizeEvidenceMarkerText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasContradictoryNegativeEvidenceFailureMarker(value: string): boolean {
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

function findCommitteeGovernanceValidationTargetBinding(value: string): RegExpExecArray | null {
  return /\b(?:validated[-_/\s]+target|validated[-_/\s]+input|governance[-_/\s]+validate[-_/\s]+target|governance[-_/\s]+validation[-_/\s]+target|committee[-_/\s]+governance[-_/\s]+validation[-_/\s]+target)\b/i
    .exec(value);
}

function hasNonTemplateMarkdownLink(value: string): boolean {
  const links = [...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
  return links.some(([, rawTarget]) => isConcreteEvidenceTarget(rawTarget));
}

function isConcreteArtifactTarget(target: string): boolean {
  const normalized = normalizeEvidenceTarget(target);
  if (hasClaimEscalatingCommitteeGovernanceEvidenceTarget(normalized)) return false;
  const match = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/(.+)$/i.exec(target.trim());
  if (match === null) return false;
  const path = match[1].split(/[?#]/, 1)[0];
  return path.split(/[\\/]+/).every(segment => !isNonConcreteArtifactSegment(segment));
}

function isNonConcreteArtifactSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /(?:^|[-_.])(?:not[-_]?completed|uncompleted)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])template(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|governance|committee|rotation|threshold|positive|negative|scope|command|release|checklist)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])sample(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|governance|committee|rotation|threshold|positive|negative|scope|command|release|checklist)|$)/i.test(normalized) ||
    /(?:^|[-_.])example(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|validator|governance|committee|rotation|threshold|positive|negative|scope|command|release|checklist)|$)/i.test(normalized)
  );
}

function hasCommandOutputMarker(value: string): boolean {
  return (
    (/\bnpm run [A-Za-z0-9:_-]+\b/.test(value) ||
      /\bspike010a-committee-guard-eval\.ts\b/.test(value)) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(value)
  );
}

function hasExplicitCommandExitCodeZero(value: string): boolean {
  return /\bexit[- ]?code\s*(?:=|:)?\s*0\b(?!\s*\/)/i.test(value);
}

function commandEvidenceIdentifiesCommand(command: string, evidence: string): boolean {
  return new RegExp(escapeRegExp(command), 'i').test(evidence) || commandSlugPattern(command).test(evidence);
}

function commandSlugPattern(command: string): RegExp {
  const slugPattern = command
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(escapeRegExp)
    .join('[-_ ]+');
  return new RegExp(`\\b${slugPattern}\\b`, 'i');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePositiveSafeInteger(value: string): number | 'invalid' | 'unsafe' {
  const normalized = value.trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) return 'invalid';
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) return 'unsafe';
  return parsed;
}

function parseCommitteeMemberCount(markdown: string): number | null {
  const classification = parseTwoColumnTable(sectionBetween(markdown, '## Drill Classification', '## Scope'));
  const parsed = parsePositiveSafeInteger(classification.get('Committee member count') ?? '');
  return typeof parsed === 'number' ? parsed : null;
}

function parseCommitteeThreshold(markdown: string): number | null {
  const classification = parseTwoColumnTable(sectionBetween(markdown, '## Drill Classification', '## Scope'));
  const parsed = parsePositiveSafeInteger(classification.get('Committee threshold') ?? '');
  return typeof parsed === 'number' ? parsed : null;
}

function extractPublicCommitteeIdentifiers(value: string): string[] {
  return [...new Set([...value.matchAll(PUBLIC_COMMITTEE_IDENTIFIER_PATTERN)].map(match => match[1].toLowerCase()))];
}

function extractCommitteeIdentifiersForStep(rows: RotationPlanRow[], step: string): Set<string> {
  const row = rows.find(rotation => rotation.step === step);
  return new Set(extractPublicCommitteeIdentifiers(row?.requiredEvidence ?? ''));
}

function extractNewCommitteeIdentifiers(rows: RotationPlanRow[]): Set<string> {
  return extractCommitteeIdentifiersForStep(rows, 'Identify new committee public keys');
}

function isActionableReviewerNote(value: string): boolean {
  return (
    hasNoContradictoryCommitteeGovernanceEvidenceMarker(value) &&
    /\b(accept|accepted|approve|approved|verify|verified|validate|validated|confirm|confirmed|pass|passed|fail|failed|block|blocked|reject|rejected|refuse|refused|complete|completed)\b/i.test(value) &&
    /\b(governance|rotation|committee|threshold|member[- ]loss|lost[- ]key|signer|negative check|singleton|deployment[- ]state|rollback|broadcast|gate 6)\b/i.test(value)
  );
}

function isActionableReviewerDecisionSummary(value: string): boolean {
  const normalized = normalizeEvidenceKind(value);
  return (
    /\brelease supported\b/i.test(normalized) &&
    /\bgovernance ready claim handling\b/i.test(normalized) &&
    /\bproduction ready claim handling\b/i.test(normalized) &&
    /\btestnet production candidate claim handling\b/i.test(normalized) &&
    /\bopen governance blocker handling\b|\bopen governance blockers\b|\bgovernance blockers\b/i.test(normalized)
  );
}

function mentionsOpenGovernanceBlockers(value: string): boolean {
  return /\bopen governance blocker handling\b|\bopen governance blockers?\b|\bgovernance blockers?\b/.test(
    normalizeEvidenceKind(value),
  );
}

function leavesOpenGovernanceBlockers(value: string): boolean {
  const normalized = normalizeEvidenceKind(value);
  return (
    hasAmbiguousOpenGovernanceBlockerCount(value) ||
    /\bopen governance blockers?\s+(?:are\s+)?(?:open|remaining|unresolved|outstanding|pending)\s+(?!0\b|zero\b|none\b|no\b|closed\b|resolved\b|mitigated\b)\S+\b/.test(normalized) ||
    /\bgovernance blockers?\s+(?:are\s+)?(?:open|remaining|unresolved|outstanding|pending)\s+(?!0\b|zero\b|none\b|no\b|closed\b|resolved\b|mitigated\b)\S+\b/.test(normalized) ||
    /\bopen governance blocker handling\s+(?!0\b|zero\b|none\b|no\b|closed\b|resolved\b|mitigated\b)\S+\b/.test(normalized) ||
    /\b(?:open\s+)?governance blockers?\s+(?:count|total|remaining)\s+(?!0\b|zero\b|none\b|no\b|closed\b|resolved\b|mitigated\b)\S+\b/.test(normalized) ||
    /\b(?:open|unresolved|outstanding|remaining|pending)\s+governance blockers?\s+(?!handling\b|are\b|is\b|not\b|never\b|without\b|absent\b|absence\b|lack\b|lacks\b|lacking\b|approved\b|accepted\b|rejected\b|refused\b|denied\b)(?!0\b|zero\b|none\b|no\b|closed\b|resolved\b|mitigated\b)\S+\b/.test(normalized)
  );
}

function hasAmbiguousOpenGovernanceBlockerCount(value: string): boolean {
  return /\b(?:open\s+)?governance blockers?\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value) ||
    /\bopen governance blocker handling\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value);
}

function usesTextualGovernanceBlockerClosure(value: string): boolean {
  const normalized = normalizeEvidenceKind(value);
  const textualClosure = '(?:zero|none|no|closed|resolved|mitigated)';
  return (
    new RegExp(`\\bopen governance blockers?\\s+(?:are\\s+)?${textualClosure}\\b`).test(normalized) ||
    new RegExp(`\\bgovernance blockers?\\s+(?:are\\s+)?(?:(?:open|remaining|unresolved|outstanding)\\s+)?${textualClosure}\\b`).test(normalized) ||
    new RegExp(`\\bopen governance blocker handling\\s+${textualClosure}\\b`).test(normalized) ||
    new RegExp(`\\b${textualClosure}\\s+open governance blockers?\\b`).test(normalized) ||
    new RegExp(`\\b${textualClosure}\\s+governance blockers?\\b`).test(normalized)
  );
}

function hasExactOpenGovernanceBlockersBinding(value: string): boolean {
  return /\bOpen governance blockers\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasContradictoryGovernanceDecisionBinding(value: string): boolean {
  return (
    hasMixedGovernanceDecisionBindings(
      value,
      'Release supported',
      'none|validated\\s+PoC|institutional\\s+reference|production\\s+deployment\\s+candidate',
    ) ||
    hasOpposingGovernanceDecisionBindings(value, 'Governance[-\\s]+ready claim allowed') ||
    hasOpposingGovernanceDecisionBindings(value, 'Production[-\\s]+ready claim allowed') ||
    hasOpposingGovernanceDecisionBindings(value, 'Testnet production[-\\s]+candidate claim allowed') ||
    hasMixedOpenGovernanceBlockerBindings(value)
  );
}

function hasMixedGovernanceDecisionBindings(
  value: string,
  fieldPattern: string,
  valuePattern: string,
): boolean {
  return exactGovernanceDecisionBindingValues(value, fieldPattern, valuePattern).size > 1;
}

function hasOpposingGovernanceDecisionBindings(value: string, fieldPattern: string): boolean {
  const values = exactGovernanceDecisionBindingValues(value, fieldPattern, 'yes|no');
  return values.has('yes') && values.has('no');
}

function hasMixedOpenGovernanceBlockerBindings(value: string): boolean {
  const values = exactGovernanceDecisionBindingValues(value, 'Open governance blockers', '\\d+');
  return values.has('0') && Array.from(values).some(count => count !== '0');
}

function exactGovernanceDecisionBindingValues(
  value: string,
  fieldPattern: string,
  valuePattern: string,
): Set<string> {
  const pattern = new RegExp(
    `\\b${fieldPattern}\\s*=\\s*(${valuePattern})\\s*(?:$|[.;,|)\\]\\r\\n])`,
    'ig',
  );
  return new Set(
    Array.from(value.matchAll(pattern), match => normalizeEvidenceKind(match[1] ?? '')),
  );
}

function usesNumericGovernanceBlockerClosure(value: string): boolean {
  const normalized = normalizeEvidenceKind(value);
  return (
    /\bopen governance blockers?\s+(?:are\s+)?0\b/.test(normalized) ||
    /\bgovernance blockers?\s+(?:are\s+)?0\b/.test(normalized) ||
    /\bopen governance blocker handling\s+0\b/.test(normalized) ||
    /\bgovernance blocker (?:closure|count|handling)\s+0\b/.test(normalized) ||
    /\b0\s+(?:open\s+)?governance blockers?\b/.test(normalized)
  );
}

function usesNonExactGovernanceBlockerClosure(value: string): boolean {
  return (
    (usesTextualGovernanceBlockerClosure(value) || usesNumericGovernanceBlockerClosure(value)) &&
    !hasExactOpenGovernanceBlockersBinding(value)
  );
}

function hasExactGovernanceReadyClaimAllowedBinding(value: string): boolean {
  return /\bGovernance-ready claim allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactProductionReadyClaimDeniedBinding(value: string): boolean {
  return /\bProduction-ready claim allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactProductionCandidateReleaseSupportedBinding(value: string): boolean {
  return hasExactReleaseSupportedBinding(value, 'production deployment candidate');
}

function hasExactReleaseSupportedBinding(value: string, expected: string): boolean {
  return new RegExp(`\\bRelease supported\\s*=\\s*${escapeRegExp(expected)}\\s*(?:$|[.;,|)\\]\\r\\n])`, 'i').test(value);
}

function hasExactTestnetProductionCandidateClaimAllowedBinding(
  value: string,
  expected: 'yes' | 'no',
): boolean {
  return new RegExp(`\\bTestnet production-candidate claim allowed\\s*=\\s*${expected}\\s*(?:$|[.;,|)\\]\\r\\n])`, 'i').test(value);
}

function usesProseOnlyGovernanceReadyClaimClosure(value: string): boolean {
  const normalized = normalizeEvidenceKind(value);
  return (
    (
      /\bgovernance ready claim handling\s+(?:allowed|approved|supported|accepted|cleared)\b/.test(normalized) ||
      /\bgovernance ready claims?\s+(?:are\s+|is\s+)?(?:allowed|approved|supported|accepted|cleared)\b/.test(normalized) ||
      /\bgovernance readiness\s+(?:is\s+|are\s+)?(?:allowed|approved|supported|accepted|cleared)\b/.test(normalized) ||
      /\b(?:allow|allowed|approve|approved|support|supported|accept|accepted|clear|cleared)\s+(?:governance ready claims?|governance readiness)\b/.test(normalized)
    ) &&
    !hasExactGovernanceReadyClaimAllowedBinding(value)
  );
}

function approvesOpenGovernanceBlockers(value: string): boolean {
  return normalizedCommitteeGovernanceTextSegments(value).some(normalized =>
    committeeGovernanceTextApprovesSubject(
      normalized,
      '(?:open governance blockers?|open governance blocker handling|governance blockers?)',
      committeeGovernanceApprovalTerms(),
    ),
  );
}

function approvesSingleSignerGovernance(value: string): boolean {
  return normalizedCommitteeGovernanceTextSegments(value).some(normalized =>
    committeeGovernanceTextApprovesSubject(
      normalized,
      '(?:single signer (?:governance|authority|signer path|fallback)|single signer)',
      committeeGovernanceApprovalTerms(),
    ),
  );
}

function committeeGovernanceApprovalTerms(): string {
  return '(?:accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|enable|enabled|enables|support|supported|supports|permit|permitted|permits|clear|cleared|clears|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits)';
}

function committeeGovernanceTextApprovesSubject(
  normalized: string,
  subject: string,
  approval: string,
): boolean {
  const approvalConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,3}';
  const approvalSubjectConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,1}';

  return [
    new RegExp(`\\b${subject}\\b${approvalConnector}\\s+${approval}\\b`, 'gi'),
    new RegExp(`\\b${approval}\\b${approvalSubjectConnector}\\s+${subject}\\b`, 'gi'),
  ].some(pattern => hasUnnegatedCommitteeGovernanceApproval(normalized, pattern));
}

function hasUnnegatedCommitteeGovernanceApproval(normalized: string, pattern: RegExp): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 32), index);
    if (!/\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?\s+$/.test(prefix)) return true;
  }
  return false;
}

function normalizedCommitteeGovernanceTextSegments(value: string): string[] {
  return value
    .split(/[\n\r|;]+|[.]\s+/)
    .map(normalizeEvidenceKind)
    .filter(segment => segment.length > 0);
}

function closesOpenGovernanceBlockersInReviewerSummary(value: string): boolean {
  const normalized = normalizeEvidenceKind(value);
  return (
    /\bopen governance blocker handling\s+0(?:\s+open\s+blockers?)?\b/.test(normalized) ||
    reviewerSummaryHasExactOpenGovernanceBlockerHandlingBinding(value)
  );
}

function reviewerSummaryLeavesOpenGovernanceBlockers(value: string): boolean {
  return value.split(/[\n\r|;]+|[.]\s+/).some(segment =>
    !reviewerSummaryHasExactOpenGovernanceBlockerHandlingBinding(segment) &&
    leavesOpenGovernanceBlockers(segment),
  );
}

function reviewerSummaryHasExactOpenGovernanceBlockerHandlingBinding(value: string): boolean {
  return value.split(/[\n\r|;]+|[.]\s+/).some(segment =>
    /\bopen governance blocker handling\b/i.test(segment) &&
    /\bOpen governance blockers\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(segment),
  );
}

function isActionableStopCondition(value: string): boolean {
  return /\b(stop|block|blocked|fail|fails|failed|pause|paused|abort|aborted|refuse|refused|incident|rollback|halt|disable|disabled|do not|escalate)\b/i.test(value);
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}
