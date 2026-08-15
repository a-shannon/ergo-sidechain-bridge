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
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import {
  validateDuplicateRequiredFields,
  validateRequiredNames,
} from './evidence-required-names.js';
import {
  classifyPublicationClaimText,
  validateReviewerDecisionSummaryClaimBoundary,
} from './publication-claim-boundary.js';

export type SecurityReviewEvidenceStatus = 'pending' | 'linked' | 'blocker';
export type ReviewerDecision = 'approve' | 'block';

export interface ScopeCoverageRow {
  area: string;
  coverage: string;
  evidence: string;
  findingIds: string;
  riskFocus: string;
  status: string;
}

export interface ReviewEvidencePackageRow {
  evidence: string;
  status: string;
  linkOrArtifact: string;
  reviewerNote: string;
}

export interface FindingDispositionRow {
  findingClass: string;
  count: string;
  openCriticalHigh: string;
  closureEvidence: string;
  status: string;
}

export interface MissingSecurityReviewFindingIdClosureEvidence {
  area: string;
  findingIds: string[];
}

export interface NegativeReviewCheckRow {
  question: string;
  reviewerAnswer: string;
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

export interface SecurityReviewClassificationFields {
  reviewedCommit: string;
  releaseLevel: string;
  environment: string;
  reviewerOrganization: string;
  reviewerOrganizationType: string;
  leadReviewer: string;
  reviewerIndependence: string;
  reviewPeriod: string;
  finalDecision: string;
  date: string;
}

export interface SecurityReviewEvidenceValidation {
  status: 'PASS' | 'BLOCKED';
  classification: Partial<SecurityReviewClassificationFields>;
  publicationDecision: {
    releaseSupported?: string;
    productionReadyClaimAllowed?: string;
    testnetProductionCandidateClaimAllowed?: string;
    criticalHighFindingsOpen?: string;
    acceptedRisksReflectedInReleaseNotes?: string;
    requiredReleaseChecklistUpdates?: string;
    requiredReleaseNoteUpdates?: string;
    reviewerDecisionSummary?: string;
  };
  scopeRows: ScopeCoverageRow[];
  evidenceRows: ReviewEvidencePackageRow[];
  findingRows: FindingDispositionRow[];
  negativeRows: NegativeReviewCheckRow[];
  reviewerRows: ReviewerSignoffRow[];
  errors: string[];
  message: string;
}

interface ParsedRows<T> {
  rows: T[];
  errors: string[];
}

const REQUIRED_SECTIONS = [
  '## Review Classification',
  '## Required Scope Coverage',
  '## Required Evidence Package',
  '## Finding Disposition',
  '## Required Negative Review Checks',
  '## Publication Decision',
  '## Reviewer Sign-Off',
];

const REQUIRED_CLASSIFICATION_FIELDS = [
  'Review name',
  'Reviewed commit',
  'Release level',
  'Environment',
  'Reviewer organization',
  'Reviewer organization type',
  'Lead reviewer',
  'Reviewer independence',
  'Review period',
  'Final decision',
  'Date',
];
const ISO_DATE_RANGE_PATTERN = /^(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})$/;

export const REQUIRED_SECURITY_REVIEW_SCOPE_AREAS = [
  'ErgoScript contracts',
  'Relayer signing',
  'AVL proof generation',
  'Settlement reconciliation',
  'Sidechain finality and burn validity',
  'Operator recovery',
  'Dependency risk',
];
const REQUIRED_SCOPE_AREAS = REQUIRED_SECURITY_REVIEW_SCOPE_AREAS;

export const REQUIRED_SECURITY_REVIEW_EVIDENCE_ITEMS = [
  'Clean checkout CI run',
  '`npm run check` output',
  '`npm run wasm:test` output',
  'Fresh local devnet rehearsal',
  'Fresh testnet rehearsal',
  'Failed broadcast / phantom AVL drill',
  'SQLite/AVL backup-restore drill',
  'Batch settlement check/submit/confirm rehearsal',
  'Release notes draft',
];
const REQUIRED_EVIDENCE_ITEMS = REQUIRED_SECURITY_REVIEW_EVIDENCE_ITEMS;

const REQUIRED_EVIDENCE_ARTIFACT_FOCUS: Record<string, { pattern: RegExp; message: string }> = {
  'Clean checkout CI run': {
    pattern: /clean[- ]checkout|ci[- ]run|\bci\b|npm[- ]ci|final[- ]branch/i,
    message: 'evidence artifact must identify clean checkout CI evidence',
  },
  '`npm run check` output': {
    pattern: /npm[- ]run[- ]check|npm\s+run\s+check|check[- ]output|typecheck|vitest/i,
    message: 'evidence artifact must identify npm run check output',
  },
  '`npm run wasm:test` output': {
    pattern: /npm[- ]run[- ]wasm[-:]test|npm\s+run\s+wasm:test|wasm[-:]test|cargo[- ]test|wasm/i,
    message: 'evidence artifact must identify npm run wasm:test output',
  },
  'Fresh local devnet rehearsal': {
    pattern: /local[- ]devnet|devnet[- ]rehearsal|session[- ]metadata.*local[- ]devnet/i,
    message: 'evidence artifact must identify local devnet rehearsal',
  },
  'Fresh testnet rehearsal': {
    pattern: /testnet|session[- ]metadata.*testnet|ergo[- ]node[- ]network[- ]testnet/i,
    message: 'evidence artifact must identify testnet rehearsal',
  },
  'Failed broadcast / phantom AVL drill': {
    pattern: /failed[- ]broadcast|phantom[- ]AVL|phantom[- ]DUP|broadcast[- ]failure|reorg/i,
    message: 'evidence artifact must identify failed broadcast or phantom AVL drill',
  },
  'SQLite/AVL backup-restore drill': {
    pattern: /sqlite|avl|backup[- ]restore|backup|restore|reconstruct/i,
    message: 'evidence artifact must identify SQLite/AVL backup-restore drill',
  },
  'Batch settlement check/submit/confirm rehearsal': {
    pattern: /batch[- ]settlement|settlement[- ]check|check[- ]submit[- ]confirm|submit|confirm|reconciliation/i,
    message: 'evidence artifact must identify batch settlement check/submit/confirm rehearsal',
  },
  'Release notes draft': {
    pattern: /release[- ]notes|release[- ]note|release[- ]notes[- ]draft/i,
    message: 'evidence artifact must identify release notes draft',
  },
};

export const REQUIRED_SECURITY_REVIEW_FINDING_CLASSES = [
  'Critical findings',
  'High findings',
  'Medium findings',
  'Low findings',
  'Informational findings',
  'Accepted risks',
  'Publication blockers',
];
const REQUIRED_FINDING_CLASSES = REQUIRED_SECURITY_REVIEW_FINDING_CLASSES;

export const REQUIRED_SECURITY_REVIEW_NEGATIVE_QUESTIONS = [
  'Can a production path sign through the Ergo node wallet?',
  'Can default production/testnet mode sign an unsafe ContextExtension shape?',
  'Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?',
  'Can a failed broadcast or reorg insert a phantom DUP key?',
  'Can a batch settlement accept a wrong-recipient, low-value, or reused payout?',
  'Can a same-recipient batch collision pay fewer outputs than expected?',
  'Can stale SPV tracker or DUP history build against the wrong singleton digest?',
  'Can trusted burn interpretation be mistaken for trustless verification?',
  'Can an operator recover from SQLite loss without private maintainer context?',
];
const REQUIRED_NEGATIVE_QUESTIONS = REQUIRED_SECURITY_REVIEW_NEGATIVE_QUESTIONS;

const UNSAFE_NEGATIVE_ANSWER_PATTERN = /\b(no|cannot|can't|not possible|rejected|blocked)\b/i;
const RECOVERY_POSITIVE_ANSWER_PATTERN = /\b(yes|recoverable|can recover)\b/i;

const REQUIRED_SCOPE_RISK_FOCUS: Record<string, { pattern: RegExp; message: string }> = {
  'ErgoScript contracts': {
    pattern: /\b(HEIGHT|singleton|payout|box|NFT)\b/i,
    message: 'HEIGHT/singleton/payout or singleton-box invariants',
  },
  'Relayer signing': {
    pattern: /\b(node[- ]wallet|ContextExtension|broadcast|signing)\b/i,
    message: 'node-wallet, ContextExtension, broadcast, or signing controls',
  },
  'AVL proof generation': {
    pattern: /\b(AVL|batch|proof|concat|unified)\b/i,
    message: 'AVL batch proof generation and non-concatenation controls',
  },
  'Settlement reconciliation': {
    pattern: /\b(DUP|settlement|confirmation|reconciliation|reorg)\b/i,
    message: 'DUP settlement confirmation, reconciliation, or reorg behavior',
  },
  'Sidechain finality and burn validity': {
    pattern: /\b(finality|burn|SPV|trustless|trusted)\b/i,
    message: 'sidechain finality, burn validity, SPV, or trustless/trusted boundary',
  },
  'Operator recovery': {
    pattern: /\b(SQLite|backup|restore|reconstruct|runbook)\b/i,
    message: 'SQLite/AVL backup, restore, reconstructibility, or runbook evidence',
  },
  'Dependency risk': {
    pattern: /\b(sigma-rust|Fleet|dependency|lockfile|upgrade)\b/i,
    message: 'signer dependency, Fleet, lockfile, or upgrade risk',
  },
};

const REQUIRED_NEGATIVE_ANSWER_EXPECTATIONS: Record<string, { pattern: RegExp; message: string }> = {
  'Can a production path sign through the Ergo node wallet?': {
    pattern: UNSAFE_NEGATIVE_ANSWER_PATTERN,
    message: 'no/cannot/rejected/blocked for unsafe node-wallet signing',
  },
  'Can default production/testnet mode sign an unsafe ContextExtension shape?': {
    pattern: UNSAFE_NEGATIVE_ANSWER_PATTERN,
    message: 'no/cannot/rejected/blocked for unsafe ContextExtension signing',
  },
  'Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?': {
    pattern: UNSAFE_NEGATIVE_ANSWER_PATTERN,
    message: 'no/cannot/rejected/blocked for broadcast without explicit opt-in',
  },
  'Can a failed broadcast or reorg insert a phantom DUP key?': {
    pattern: UNSAFE_NEGATIVE_ANSWER_PATTERN,
    message: 'no/cannot/rejected/blocked for phantom DUP insertion',
  },
  'Can a batch settlement accept a wrong-recipient, low-value, or reused payout?': {
    pattern: UNSAFE_NEGATIVE_ANSWER_PATTERN,
    message: 'no/cannot/rejected/blocked for invalid batch payout acceptance',
  },
  'Can a same-recipient batch collision pay fewer outputs than expected?': {
    pattern: UNSAFE_NEGATIVE_ANSWER_PATTERN,
    message: 'no/cannot/rejected/blocked for same-recipient output loss',
  },
  'Can stale SPV tracker or DUP history build against the wrong singleton digest?': {
    pattern: UNSAFE_NEGATIVE_ANSWER_PATTERN,
    message: 'no/cannot/rejected/blocked for stale singleton digest usage',
  },
  'Can trusted burn interpretation be mistaken for trustless verification?': {
    pattern: UNSAFE_NEGATIVE_ANSWER_PATTERN,
    message: 'no/cannot/rejected/blocked for trusted burn being presented as trustless',
  },
  'Can an operator recover from SQLite loss without private maintainer context?': {
    pattern: RECOVERY_POSITIVE_ANSWER_PATTERN,
    message: 'yes/recoverable without private maintainer context',
  },
};

const REQUIRED_NEGATIVE_EVIDENCE_FOCUS: Record<string, { pattern: RegExp; message: string }> = {
  'Can a production path sign through the Ergo node wallet?': {
    pattern: /\b(node[- ]wallet|production[- ]path|sign(?:ing)?)\b/i,
    message: 'evidence must identify node-wallet production signing review evidence',
  },
  'Can default production/testnet mode sign an unsafe ContextExtension shape?': {
    pattern: /\b(ContextExtension|unsafe[- ]context|shape|production[- ]testnet)\b/i,
    message: 'evidence must identify unsafe ContextExtension signing review evidence',
  },
  'Can any settlement broadcast without `BRIDGE_BROADCAST_ENABLED=true`?': {
    pattern: /\b(BRIDGE_BROADCAST_ENABLED|broadcast|settlement)\b/i,
    message: 'evidence must identify broadcast opt-in review evidence',
  },
  'Can a failed broadcast or reorg insert a phantom DUP key?': {
    pattern: /\b(failed[- ]broadcast|reorg|phantom[- ]DUP|DUP[- ]key)\b/i,
    message: 'evidence must identify failed-broadcast or phantom-DUP review evidence',
  },
  'Can a batch settlement accept a wrong-recipient, low-value, or reused payout?': {
    pattern: /\b(batch[- ]settlement|wrong[- ]recipient|low[- ]value|reused[- ]payout|payout)\b/i,
    message: 'evidence must identify invalid batch payout review evidence',
  },
  'Can a same-recipient batch collision pay fewer outputs than expected?': {
    pattern: /\b(same[- ]recipient|batch[- ]collision|fewer[- ]outputs|expected[- ]outputs)\b/i,
    message: 'evidence must identify same-recipient batch collision review evidence',
  },
  'Can stale SPV tracker or DUP history build against the wrong singleton digest?': {
    pattern: /\b(stale[- ]SPV|SPV[- ]tracker|DUP[- ]history|singleton[- ]digest)\b/i,
    message: 'evidence must identify stale SPV/DUP singleton digest review evidence',
  },
  'Can trusted burn interpretation be mistaken for trustless verification?': {
    pattern: /\b(trusted[- ]burn|trustless|burn[- ]interpretation|verification)\b/i,
    message: 'evidence must identify trusted-burn versus trustless verification review evidence',
  },
  'Can an operator recover from SQLite loss without private maintainer context?': {
    pattern: /\b(SQLite|backup[- ]restore|runbook|private[- ]maintainer|recover(?:y|able)?)\b/i,
    message: 'evidence must identify SQLite recovery without private maintainer context evidence',
  },
};

const REQUIRED_PUBLICATION_DECISION_FIELDS = [
  'Release supported',
  'Production-ready claim allowed',
  'Testnet production-candidate claim allowed',
  'Critical/high findings open',
  'Accepted risks reflected in release notes',
  'Required release checklist updates',
  'Required release-note updates',
  'Reviewer decision summary',
];

export const REQUIRED_SECURITY_REVIEW_REVIEWER_ROLES = [
  'Lead reviewer',
  'Security owner',
  'Maintainer',
  'Operator reviewer',
];
const REQUIRED_REVIEWER_ROLES = REQUIRED_SECURITY_REVIEW_REVIEWER_ROLES;

const ALLOWED_STATUSES = new Set<SecurityReviewEvidenceStatus>(['pending', 'linked', 'blocker']);
const ALLOWED_RELEASE_LEVELS = new Set([
  'validated PoC',
  'institutional reference',
  'production deployment candidate',
]);
const ALLOWED_ENVIRONMENTS = new Set(['local offline', 'patched devnet', 'testnet', 'staging']);
const ALLOWED_FINAL_DECISIONS = new Set<ReviewerDecision>(['approve', 'block']);
const ALLOWED_INDEPENDENCE = new Set(['independent external']);
const ALLOWED_REVIEWER_ORGANIZATION_TYPES = new Set([
  'external audit firm',
  'independent security researcher',
  'exchange security team',
]);
const ALLOWED_SCOPE_COVERAGE = new Set(['covered']);
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
const ACTIONABLE_REVIEWER_NOTE_PATTERN =
  /\b(verified|accepted|passed?|blocked|failed?|matched|reconciled|no blocker|no critical|no high)\b/i;
const REVIEWER_NOTE_OUTCOME_ALTERNATIVE_PATTERN =
  /\b(?:verified|accepted|pass(?:ed)?|block(?:ed)?|fail(?:ed)?|matched|reconciled)\b\s*\/\s*\b(?:verified|accepted|pass(?:ed)?|block(?:ed)?|fail(?:ed)?|matched|reconciled)\b/i;
const COMPLETED_EVIDENCE_TARGET_MESSAGE =
  'must include a real artifact:// target or non-template evidence link';
const GENERIC_SECURITY_REVIEWER_ORGANIZATION_VALUES = new Set([
  'affiliation',
  'audit firm',
  'auditor',
  'exchange',
  'exchange security team',
  'external',
  'external audit firm',
  'external reviewer',
  'external security team',
  'independent',
  'independent external',
  'independent security researcher',
  'n/a',
  'none',
  'not applicable',
  'organization',
  'reviewer',
  'reviewer affiliation',
  'reviewer organization',
  'security reviewer',
  'security team',
  'tbd',
  'todo',
  'unknown',
]);

export function hasSecurityReviewScopeRiskFocus(area: string, riskFocus: string): boolean {
  const riskFocusExpectation = REQUIRED_SCOPE_RISK_FOCUS[area];
  return riskFocusExpectation ? riskFocusExpectation.pattern.test(riskFocus.trim()) : false;
}

export function hasSecurityReviewEvidenceArtifactFocus(evidence: string, linkOrArtifact: string): boolean {
  const artifactFocus = REQUIRED_EVIDENCE_ARTIFACT_FOCUS[evidence];
  return artifactFocus ? artifactFocus.pattern.test(linkOrArtifact.trim()) : false;
}

export function hasSecurityReviewExpectedNegativeAnswer(question: string, reviewerAnswer: string): boolean {
  const answerExpectation = REQUIRED_NEGATIVE_ANSWER_EXPECTATIONS[question];
  return answerExpectation ? answerExpectation.pattern.test(reviewerAnswer.trim()) : false;
}

export function hasSecurityReviewNegativeEvidenceFocus(question: string, evidence: string): boolean {
  const evidenceFocus = REQUIRED_NEGATIVE_EVIDENCE_FOCUS[question];
  return evidenceFocus ? evidenceFocus.pattern.test(evidence.trim()) : false;
}

export function hasActionableSecurityReviewEvidenceNote(reviewerNote: string): boolean {
  return (
    hasNoContradictorySecurityReviewEvidenceMarker(reviewerNote) &&
    !hasSlashDelimitedSecurityReviewReviewerOutcomeAlternative(reviewerNote) &&
    ACTIONABLE_REVIEWER_NOTE_PATTERN.test(reviewerNote)
  );
}

export function hasNoContradictorySecurityReviewEvidenceMarker(value: string): boolean {
  return !hasContradictorySecurityReviewEvidenceMarker(value);
}

export function hasCompletedSecurityReviewEvidenceTarget(value: string): boolean {
  const completedEvidenceText = securityReviewCompletedEvidenceText(value);
  return (
    hasCompletedEvidenceMarker(completedEvidenceText) &&
    !hasLocalOnlyEvidenceTarget(value)
  );
}

export function hasCompletedSecurityReviewChecklistUpdateEvidence(value: string): boolean {
  return (
    hasCompletedSecurityReviewEvidenceTarget(value) &&
    identifiesGate4ChecklistUpdateEvidence(value) &&
    /accepted-risk checklist updates/i.test(value) &&
    hasNoContradictorySecurityReviewEvidenceMarker(value)
  );
}

export function hasCompletedSecurityReviewReleaseNoteUpdateEvidence(value: string): boolean {
  return (
    hasCompletedSecurityReviewEvidenceTarget(value) &&
    identifiesGate4ReleaseNoteUpdateEvidence(value) &&
    /accepted-risk release-note updates/i.test(value) &&
    hasNoContradictorySecurityReviewEvidenceMarker(value)
  );
}

export function isActionableSecurityReviewOutcomeNote(value: string): boolean {
  return (
    hasNoContradictorySecurityReviewEvidenceMarker(value) &&
    /\b(accept|accepted|approve|approved|verify|verified|validate|validated|confirm|confirmed|pass|passed|block|blocked|fail|failed|close|closed|match|matched|reconcile|reconciled|complete|completed)\b/i.test(value) &&
    /\b(security review|independent review|Gate 4|scope coverage|evidence package|critical|high|finding|publication blocker|negative review|node-wallet|ContextExtension|broadcast|DUP|AVL|SPV|trustless burn|operator recovery|dependency risk|release notes|checklist)\b/i.test(value)
  );
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

export function parseScopeCoverageRows(markdown: string): ScopeCoverageRow[] {
  return parseTableBetween(markdown, '## Required Scope Coverage', '## Required Evidence Package').map(row => {
    if (row.length !== 6) throw new Error(`Malformed Required Scope Coverage row: ${row.join(' | ')}`);
    return {
      area: row[0],
      coverage: row[1],
      evidence: row[2],
      findingIds: row[3],
      riskFocus: row[4],
      status: row[5],
    };
  });
}

export function validateSecurityReviewEvidence(markdown: string): SecurityReviewEvidenceValidation {
  const classification = parseSecurityReviewClassification(markdown);
  const publicationDecision = parseSecurityReviewPublicationDecision(markdown);
  const scopes = parseRowsSafely(() => parseScopeCoverageRows(markdown));
  const evidence = parseRowsSafely(() => parseEvidencePackageRows(markdown));
  const findings = parseRowsSafely(() => parseFindingDispositionRows(markdown));
  const negatives = parseRowsSafely(() => parseNegativeReviewRows(markdown));
  const reviewers = parseRowsSafely(() => parseReviewerRows(markdown));
  const scopeRows = scopes.rows;
  const evidenceRows = evidence.rows;
  const findingRows = findings.rows;
  const negativeRows = negatives.rows;
  const reviewerRows = reviewers.rows;
  const errors = [
    ...validateEvidenceHygiene(markdown, 'Security Review Evidence'),
    ...validateRequiredSections(markdown),
    ...validateClassification(markdown),
    ...validatePublicationDecision(markdown),
    ...scopes.errors,
    ...evidence.errors,
    ...findings.errors,
    ...negatives.errors,
    ...reviewers.errors,
    ...validateScopeRows(scopeRows),
    ...validateEvidenceRows(evidenceRows),
    ...validateFindingRows(findingRows),
    ...validateScopeFindingIdClosureEvidence(scopeRows, findingRows),
    ...validateNegativeRows(negativeRows),
    ...validateReviewerRows(reviewerRows),
    ...validateReviewerIdentityConsistency(markdown, reviewerRows),
    ...validateReviewerDateConsistency(markdown, reviewerRows),
  ];

  if (errors.length > 0) {
    return {
      status: 'BLOCKED',
      classification,
      publicationDecision,
      scopeRows,
      evidenceRows,
      findingRows,
      negativeRows,
      reviewerRows,
      errors,
      message: `Security review evidence BLOCKED: ${errors.length} structural issue(s).`,
    };
  }

  return {
    status: 'PASS',
    classification,
    publicationDecision,
    scopeRows,
    evidenceRows,
    findingRows,
    negativeRows,
    reviewerRows,
    errors: [],
    message: `Security review evidence PASS: ${scopeRows.length} scope areas are linked.`,
  };
}

function parseSecurityReviewClassification(markdown: string): SecurityReviewEvidenceValidation['classification'] {
  const fields = parseTwoColumnTable(
    sectionBetween(markdown, '## Review Classification', '## Required Scope Coverage'),
  );
  return {
    reviewedCommit: fields.get('Reviewed commit'),
    releaseLevel: fields.get('Release level'),
    environment: fields.get('Environment'),
    reviewerOrganization: fields.get('Reviewer organization'),
    reviewerOrganizationType: fields.get('Reviewer organization type'),
    leadReviewer: fields.get('Lead reviewer'),
    reviewerIndependence: fields.get('Reviewer independence'),
    reviewPeriod: fields.get('Review period'),
    finalDecision: fields.get('Final decision'),
    date: fields.get('Date'),
  };
}

function parseSecurityReviewPublicationDecision(markdown: string): SecurityReviewEvidenceValidation['publicationDecision'] {
  const fields = parseTwoColumnTable(sectionBetween(markdown, '## Publication Decision', '## Reviewer Sign-Off'));
  return {
    releaseSupported: fields.get('Release supported'),
    productionReadyClaimAllowed: fields.get('Production-ready claim allowed'),
    testnetProductionCandidateClaimAllowed: fields.get('Testnet production-candidate claim allowed'),
    criticalHighFindingsOpen: fields.get('Critical/high findings open'),
    acceptedRisksReflectedInReleaseNotes: fields.get('Accepted risks reflected in release notes'),
    requiredReleaseChecklistUpdates: fields.get('Required release checklist updates'),
    requiredReleaseNoteUpdates: fields.get('Required release-note updates'),
    reviewerDecisionSummary: fields.get('Reviewer decision summary'),
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

function parseEvidencePackageRows(markdown: string): ReviewEvidencePackageRow[] {
  return parseTableBetween(markdown, '## Required Evidence Package', '## Finding Disposition').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Required Evidence Package row: ${row.join(' | ')}`);
    return {
      evidence: row[0],
      status: row[1],
      linkOrArtifact: row[2],
      reviewerNote: row[3],
    };
  });
}

function parseFindingDispositionRows(markdown: string): FindingDispositionRow[] {
  return parseTableBetween(markdown, '## Finding Disposition', '## Required Negative Review Checks').map(row => {
    if (row.length !== 5) throw new Error(`Malformed Finding Disposition row: ${row.join(' | ')}`);
    return {
      findingClass: row[0],
      count: row[1],
      openCriticalHigh: row[2],
      closureEvidence: row[3],
      status: row[4],
    };
  });
}

function parseNegativeReviewRows(markdown: string): NegativeReviewCheckRow[] {
  return parseTableBetween(markdown, '## Required Negative Review Checks', '## Publication Decision').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Required Negative Review Checks row: ${row.join(' | ')}`);
    return {
      question: row[0],
      reviewerAnswer: row[1],
      evidence: row[2],
      status: row[3],
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
  const section = sectionBetween(markdown, '## Review Classification', '## Required Scope Coverage');
  const fields = parseTwoColumnTable(section);
  const errors = validateDuplicateRequiredFields(
    'Review Classification',
    parseTwoColumnFieldNames(section),
    REQUIRED_CLASSIFICATION_FIELDS,
  );

  for (const field of REQUIRED_CLASSIFICATION_FIELDS) {
    if (isBlank(fields.get(field) ?? '')) errors.push(`Review Classification: ${field} is required`);
  }

  validateAllowedField(errors, fields, 'Review Classification', 'Release level', ALLOWED_RELEASE_LEVELS);
  validateAllowedField(errors, fields, 'Review Classification', 'Environment', ALLOWED_ENVIRONMENTS);
  validateAllowedField(
    errors,
    fields,
    'Review Classification',
    'Reviewer organization type',
    ALLOWED_REVIEWER_ORGANIZATION_TYPES,
  );
  validateAllowedField(errors, fields, 'Review Classification', 'Reviewer independence', ALLOWED_INDEPENDENCE);
  validateAllowedField(errors, fields, 'Review Classification', 'Final decision', ALLOWED_FINAL_DECISIONS);
  validateGitCommitField(errors, fields, 'Review Classification', 'Reviewed commit');
  validateIsoDateRangeField(errors, fields, 'Review Classification', 'Review period');
  validateIsoDateField(errors, fields, 'Review Classification', 'Date');
  validateReviewPeriodAgainstDate(errors, fields);
  if (fields.get('Final decision') === 'block') {
    errors.push('Review Classification: Final decision must be approve before security review evidence can pass');
  }
  if (fields.get('Release level') === 'production deployment candidate' && fields.get('Environment') !== 'testnet') {
    errors.push('Review Classification: production deployment candidate release level requires Environment testnet');
  }
  const reviewerOrganization = fields.get('Reviewer organization') ?? '';
  if (!isBlank(reviewerOrganization) && !isConcreteSecurityReviewerOrganization(reviewerOrganization)) {
    errors.push(
      'Review Classification: Reviewer organization must identify a concrete external security reviewer organization or affiliation',
    );
  }

  return errors;
}

function validateIsoDateRangeField(
  errors: string[],
  fields: Map<string, string>,
  section: string,
  field: string,
): void {
  const value = fields.get(field) ?? '';
  if (isBlank(value)) return;

  const match = ISO_DATE_RANGE_PATTERN.exec(value.trim());
  if (!match || !isIsoCalendarDate(match[1]) || !isIsoCalendarDate(match[2])) {
    errors.push(`${section}: ${field} must use YYYY-MM-DD to YYYY-MM-DD`);
    return;
  }
  if (match[1] > match[2]) {
    errors.push(`${section}: ${field} start date must not be after end date`);
  }
}

function validateReviewPeriodAgainstDate(errors: string[], fields: Map<string, string>): void {
  const reviewPeriod = fields.get('Review period') ?? '';
  const date = fields.get('Date') ?? '';
  const period = parseIsoDateRange(reviewPeriod);

  if (!period || !isIsoCalendarDate(date)) return;
  const [, endDate] = period;
  if (endDate > date) {
    errors.push('Review Classification: Review period end date must not be after Date');
  }
}

function parseIsoDateRange(value: string): [string, string] | undefined {
  const match = ISO_DATE_RANGE_PATTERN.exec(value.trim());
  if (!match || !isIsoCalendarDate(match[1]) || !isIsoCalendarDate(match[2])) return undefined;
  return [match[1], match[2]];
}

function validatePublicationDecision(markdown: string): string[] {
  const section = sectionBetween(markdown, '## Publication Decision', '## Reviewer Sign-Off');
  const fields = parseTwoColumnTable(section);
  const classification = parseTwoColumnTable(
    sectionBetween(markdown, '## Review Classification', '## Required Scope Coverage'),
  );
  const errors = validateDuplicateRequiredFields(
    'Publication Decision',
    parseTwoColumnFieldNames(section),
    REQUIRED_PUBLICATION_DECISION_FIELDS,
  );

  for (const field of REQUIRED_PUBLICATION_DECISION_FIELDS) {
    if (isBlank(fields.get(field) ?? '')) errors.push(`Publication Decision: ${field} is required`);
  }

  validateAllowedField(errors, fields, 'Publication Decision', 'Release supported', ALLOWED_RELEASE_SUPPORT);
  validateAllowedField(errors, fields, 'Publication Decision', 'Production-ready claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, fields, 'Publication Decision', 'Testnet production-candidate claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, fields, 'Publication Decision', 'Accepted risks reflected in release notes', ALLOWED_YES_NO);

  const releaseSupported = fields.get('Release supported') ?? '';
  const releaseLevel = classification.get('Release level') ?? '';
  const environment = classification.get('Environment') ?? '';
  const productionReadyAllowed = fields.get('Production-ready claim allowed') ?? '';
  const testnetProductionCandidateAllowed = fields.get('Testnet production-candidate claim allowed') ?? '';
  const acceptedRisksReflected = fields.get('Accepted risks reflected in release notes') ?? '';
  const checklistUpdates = fields.get('Required release checklist updates') ?? '';
  const releaseNoteUpdates = fields.get('Required release-note updates') ?? '';
  const requiresGate4PublicationUpdateEvidence =
    releaseSupported === 'production deployment candidate' || testnetProductionCandidateAllowed === 'yes';

  if (releaseSupported === 'none') {
    errors.push('Publication Decision: Release supported must not be none before review evidence can pass');
  }
  if (releaseSupported !== 'none' && releaseExceedsReviewLevel(releaseSupported, releaseLevel)) {
    errors.push('Publication Decision: Release supported must not exceed Review Classification release level');
  }
  if (releaseLevel === 'production deployment candidate' && releaseSupported !== 'production deployment candidate') {
    errors.push(
      'Publication Decision: production deployment candidate review requires exact Release supported = production deployment candidate',
    );
  }
  if (productionReadyAllowed === 'yes') {
    errors.push(
      'Publication Decision: Production-ready claim allowed must be no; security review can only support testnet production-candidate claims',
    );
  }
  if (testnetProductionCandidateAllowed === 'yes' && releaseSupported !== 'production deployment candidate') {
    errors.push('Publication Decision: testnet production-candidate claim requires production deployment candidate support');
  }
  if (releaseSupported === 'production deployment candidate' && testnetProductionCandidateAllowed !== 'yes') {
    errors.push('Publication Decision: production deployment candidate support requires exact Testnet production-candidate claim allowed = yes');
  }
  if (releaseSupported === 'production deployment candidate' && environment !== 'testnet') {
    errors.push('Publication Decision: production deployment candidate support requires exact Review Classification Environment = testnet');
  }
  if (acceptedRisksReflected === 'no') {
    errors.push('Publication Decision: accepted risks must be reflected in release notes before review evidence can pass');
  }
  if (!isBlank(checklistUpdates)) {
    if (!/accepted-risk checklist updates/i.test(checklistUpdates)) {
      errors.push('Publication Decision: Required release checklist updates must include accepted-risk checklist updates');
    }
    if (!hasEvidenceMarker(checklistUpdates)) {
      errors.push('Publication Decision: Required release checklist updates must include a link, command, or artifact marker');
    } else if (!hasCompletedSecurityReviewEvidenceTarget(checklistUpdates)) {
      errors.push(
        `Publication Decision: Required release checklist updates ${COMPLETED_EVIDENCE_TARGET_MESSAGE}`,
      );
    } else if (
      requiresGate4PublicationUpdateEvidence &&
      !identifiesGate4ChecklistUpdateEvidence(checklistUpdates)
    ) {
      errors.push(
        'Publication Decision: Required release checklist updates must identify completed Gate 4 checklist update evidence',
      );
    }
    if (!hasNoContradictorySecurityReviewEvidenceMarker(checklistUpdates)) {
      errors.push(
        'Publication Decision: Required release checklist updates must not include contradictory security-review failure markers',
      );
    }
    validateNoContradictorySecurityReviewDecisionBindings(
      errors,
      'Required release checklist updates',
      checklistUpdates,
    );
    if (containsMainnetProductionClaim(checklistUpdates)) {
      errors.push(
        'Publication Decision: Required release checklist updates must not contain mainnet production claim wording',
      );
    }
    if (containsProductionReadyClaim(checklistUpdates)) {
      errors.push(
        'Publication Decision: Required release checklist updates must not contain production-ready claim wording',
      );
    }
    if (securityReviewAdmitsPrivateMaintainerContext(checklistUpdates)) {
      errors.push('Publication Decision: Required release checklist updates must not admit private maintainer context');
    }
    if (
      productionReadyAllowed === 'no' &&
      !hasExactProductionReadyClaimDeniedBinding(checklistUpdates)
    ) {
      errors.push(
        'Publication Decision: Required release checklist updates must use exact Production-ready claim allowed = no',
      );
    }
    if (
      acceptedRisksReflected === 'yes' &&
      !hasExactAcceptedRisksReflectedBinding(checklistUpdates)
    ) {
      errors.push(
        'Publication Decision: Required release checklist updates must use exact Accepted risks reflected in release notes = yes',
      );
    }
    if (
      (testnetProductionCandidateAllowed === 'yes' || testnetProductionCandidateAllowed === 'no') &&
      !hasExactTestnetProductionCandidateClaimAllowedBinding(
        checklistUpdates,
        testnetProductionCandidateAllowed,
      )
    ) {
      errors.push(
        `Publication Decision: Required release checklist updates must use exact Testnet production-candidate claim allowed = ${testnetProductionCandidateAllowed}`,
      );
    }
    if (
      releaseSupported === 'production deployment candidate' &&
      !hasExactProductionCandidateReleaseSupportedBinding(checklistUpdates)
    ) {
      errors.push(
        'Publication Decision: Required release checklist updates must use exact Release supported = production deployment candidate',
      );
    }
    if (
      (requiresGate4PublicationUpdateEvidence && !hasExactSecurityBlockerClosureBindings(checklistUpdates)) ||
      usesNonExactSecurityBlockerClosure(checklistUpdates)
    ) {
      errors.push(
        'Publication Decision: Required release checklist updates must use exact numeric Critical/high findings open = 0 and Publication blockers = 0; textual or shorthand security blocker terms are not accepted',
      );
    }
  }
  if (!isBlank(releaseNoteUpdates)) {
    if (!/accepted-risk release-note updates/i.test(releaseNoteUpdates)) {
      errors.push('Publication Decision: Required release-note updates must include accepted-risk release-note updates');
    }
    if (!hasEvidenceMarker(releaseNoteUpdates)) {
      errors.push('Publication Decision: Required release-note updates must include a link, command, or artifact marker');
    } else if (!hasCompletedSecurityReviewEvidenceTarget(releaseNoteUpdates)) {
      errors.push(
        `Publication Decision: Required release-note updates ${COMPLETED_EVIDENCE_TARGET_MESSAGE}`,
      );
    } else if (
      requiresGate4PublicationUpdateEvidence &&
      !identifiesGate4ReleaseNoteUpdateEvidence(releaseNoteUpdates)
    ) {
      errors.push(
        'Publication Decision: Required release-note updates must identify completed Gate 4 release-note update evidence',
      );
    }
    if (!hasNoContradictorySecurityReviewEvidenceMarker(releaseNoteUpdates)) {
      errors.push(
        'Publication Decision: Required release-note updates must not include contradictory security-review failure markers',
      );
    }
    validateNoContradictorySecurityReviewDecisionBindings(
      errors,
      'Required release-note updates',
      releaseNoteUpdates,
    );
    if (containsMainnetProductionClaim(releaseNoteUpdates)) {
      errors.push(
        'Publication Decision: Required release-note updates must not contain mainnet production claim wording',
      );
    }
    if (containsProductionReadyClaim(releaseNoteUpdates)) {
      errors.push(
        'Publication Decision: Required release-note updates must not contain production-ready claim wording',
      );
    }
    if (securityReviewAdmitsPrivateMaintainerContext(releaseNoteUpdates)) {
      errors.push('Publication Decision: Required release-note updates must not admit private maintainer context');
    }
    if (
      productionReadyAllowed === 'no' &&
      !hasExactProductionReadyClaimDeniedBinding(releaseNoteUpdates)
    ) {
      errors.push(
        'Publication Decision: Required release-note updates must use exact Production-ready claim allowed = no',
      );
    }
    if (
      acceptedRisksReflected === 'yes' &&
      !hasExactAcceptedRisksReflectedBinding(releaseNoteUpdates)
    ) {
      errors.push(
        'Publication Decision: Required release-note updates must use exact Accepted risks reflected in release notes = yes',
      );
    }
    if (
      (testnetProductionCandidateAllowed === 'yes' || testnetProductionCandidateAllowed === 'no') &&
      !hasExactTestnetProductionCandidateClaimAllowedBinding(
        releaseNoteUpdates,
        testnetProductionCandidateAllowed,
      )
    ) {
      errors.push(
        `Publication Decision: Required release-note updates must use exact Testnet production-candidate claim allowed = ${testnetProductionCandidateAllowed}`,
      );
    }
    if (
      releaseSupported === 'production deployment candidate' &&
      !hasExactProductionCandidateReleaseSupportedBinding(releaseNoteUpdates)
    ) {
      errors.push(
        'Publication Decision: Required release-note updates must use exact Release supported = production deployment candidate',
      );
    }
    if (
      (requiresGate4PublicationUpdateEvidence && !hasExactSecurityBlockerClosureBindings(releaseNoteUpdates)) ||
      usesNonExactSecurityBlockerClosure(releaseNoteUpdates)
    ) {
      errors.push(
        'Publication Decision: Required release-note updates must use exact numeric Critical/high findings open = 0 and Publication blockers = 0; textual or shorthand security blocker terms are not accepted',
      );
    }
  }
  if (
    hasCompletedSecurityReviewChecklistUpdateEvidence(checklistUpdates) &&
    hasCompletedSecurityReviewReleaseNoteUpdateEvidence(releaseNoteUpdates) &&
    haveSharedConcreteEvidenceTarget(checklistUpdates, releaseNoteUpdates)
  ) {
    errors.push(
      'Publication Decision: required release checklist updates and required release-note updates must use distinct completed evidence targets',
    );
  }

  const openCriticalHigh = fields.get('Critical/high findings open') ?? '';
  if (!isBlank(openCriticalHigh) && !isExactZero(openCriticalHigh)) {
    errors.push('Publication Decision: critical/high findings open must be 0 before review evidence can pass');
  }

  const reviewerDecisionSummary = fields.get('Reviewer decision summary') ?? '';
  if (
    !isBlank(reviewerDecisionSummary) &&
    !(
      (/\brelease supported\b/i.test(reviewerDecisionSummary)) &&
      reviewerSummaryMentionsProductionReadyClaimHandling(reviewerDecisionSummary) &&
      reviewerSummaryMentionsTestnetProductionCandidateClaimHandling(reviewerDecisionSummary) &&
      /\bcritical\/high\b|\bcritical and high\b|\bcritical or high\b/i.test(reviewerDecisionSummary) &&
      /\baccepted risks?\b/i.test(reviewerDecisionSummary)
    )
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must mention release support, production-ready claim handling, testnet production-candidate claim handling, critical/high findings, and accepted risks',
    );
  }
  errors.push(
    ...validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary: reviewerDecisionSummary,
      releaseSupported,
      productionReadyClaimAllowed: productionReadyAllowed,
      testnetProductionCandidateClaimAllowed: testnetProductionCandidateAllowed,
      requireNumericCriticalHighFindingClosure: true,
    }),
  );
  validateNoContradictorySecurityReviewDecisionBindings(
    errors,
    'Reviewer decision summary',
    reviewerDecisionSummary,
  );
  if (
    !isBlank(releaseSupported) &&
    releaseSupported !== 'none' &&
    !isBlank(reviewerDecisionSummary) &&
    !reviewerSummaryHasExactReleaseSupportedBinding(reviewerDecisionSummary, releaseSupported)
  ) {
    errors.push(
      `Publication Decision: Reviewer decision summary must use exact Release supported = ${releaseSupported}`,
    );
  }
  if (
    productionReadyAllowed === 'no' &&
    !isBlank(reviewerDecisionSummary) &&
    !reviewerSummaryHasExactProductionReadyClaimDeniedBinding(reviewerDecisionSummary)
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
  }
  if (approvesOpenCriticalHighFindings(reviewerDecisionSummary)) {
    errors.push('Publication Decision: Reviewer decision summary must not approve open critical/high findings');
  }
  if (leavesCriticalHighFindingsOpen(reviewerDecisionSummary)) {
    errors.push('Publication Decision: Reviewer decision summary must not leave critical/high findings open');
  }
  if (
    !isBlank(reviewerDecisionSummary) &&
    !reviewerSummaryHasExactCriticalHighFindingsOpenBinding(reviewerDecisionSummary)
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must use exact Critical/high findings open = 0',
    );
  }
  if (approvesOpenPublicationBlockers(reviewerDecisionSummary)) {
    errors.push('Publication Decision: Reviewer decision summary must not approve open publication blockers');
  }
  if (leavesPublicationBlockersOpen(reviewerDecisionSummary)) {
    errors.push('Publication Decision: Reviewer decision summary must not leave publication blockers open');
  }
  if (approvesAcceptedRisksMissingReleaseArtifacts(reviewerDecisionSummary)) {
    errors.push(
      'Publication Decision: Reviewer decision summary must not approve accepted risks missing release artifacts',
    );
  }
  if (securityReviewAdmitsPrivateMaintainerContext(reviewerDecisionSummary)) {
    errors.push('Publication Decision: Reviewer decision summary must not admit private maintainer context');
  }
  if (
    acceptedRisksReflected === 'yes' &&
    !isBlank(reviewerDecisionSummary) &&
    !reviewerSummaryReflectsAcceptedRisksInReleaseNotes(reviewerDecisionSummary)
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary: accepted risks must be reflected in release notes',
    );
  } else if (
    acceptedRisksReflected === 'yes' &&
    !isBlank(reviewerDecisionSummary) &&
    !reviewerSummaryHasExactAcceptedRisksReflectedBinding(reviewerDecisionSummary)
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must use exact Accepted risks reflected in release notes = yes',
    );
  } else if (
    acceptedRisksReflected === 'yes' &&
    !isBlank(reviewerDecisionSummary) &&
    contradictsAcceptedRiskReflection(reviewerDecisionSummary)
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary: accepted risks must be reflected in release notes',
    );
  }
  if (
    (testnetProductionCandidateAllowed === 'yes' || testnetProductionCandidateAllowed === 'no') &&
    !isBlank(reviewerDecisionSummary) &&
    !reviewerSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(
      reviewerDecisionSummary,
      testnetProductionCandidateAllowed,
    )
  ) {
    errors.push(
      `Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = ${testnetProductionCandidateAllowed}`,
    );
  }

  return errors;
}

function validateNoContradictorySecurityReviewDecisionBindings(
  errors: string[],
  field: string,
  value: string,
): void {
  if (isBlank(value)) return;
  if (hasContradictorySecurityReviewDecisionBinding(value)) {
    errors.push(`Publication Decision: ${field} must not include contradictory security review decision bindings`);
  }
}

function contradictsAcceptedRiskReflection(value: string): boolean {
  const normalized = normalizeReviewerDecisionSummaryText(value);
  return (
    /\baccepted risks? (?:not reflected|not copied|not included|omitted|missing|unreflected)\b/.test(normalized) ||
    /\baccepted risks?.*\brelease notes?\b.*\b(?:not updated|missing|omitted)\b/.test(normalized)
  );
}

function reviewerSummaryReflectsAcceptedRisksInReleaseNotes(value: string): boolean {
  const normalized = normalizeReviewerDecisionSummaryText(value);
  return (
    /\baccepted risks?\s+(?:reflected|copied|included|covered|documented|updated)\s+(?:in|into|by|through)\s+(?:release notes?|release artifacts?|checklists?)\b/.test(normalized) ||
    /\b(?:release notes?|release artifacts?|checklists?)\s+(?:reflect|copy|include|cover|document|update)\s+accepted risks?\b/.test(normalized) ||
    /\baccepted risk\s+release note handling\s+(?:reflected|copied|included|covered|documented|updated)\b/.test(normalized)
  );
}

function reviewerSummaryHasExactAcceptedRisksReflectedBinding(value: string): boolean {
  return hasExactAcceptedRisksReflectedBinding(value);
}

function hasExactAcceptedRisksReflectedBinding(value: string): boolean {
  return /\bAccepted risks reflected in release notes\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasContradictorySecurityReviewDecisionBinding(value: string): boolean {
  return (
    hasMixedSecurityReviewDecisionBindings(
      value,
      'Release supported',
      'none|validated\\s+PoC|institutional\\s+reference|production\\s+deployment\\s+candidate',
    ) ||
    hasOpposingSecurityReviewDecisionBindings(value, 'Production[-\\s]+ready claim allowed') ||
    hasOpposingSecurityReviewDecisionBindings(value, 'Testnet production[-\\s]+candidate claim allowed') ||
    hasOpposingSecurityReviewDecisionBindings(value, 'Accepted risks reflected in release notes') ||
    hasMixedZeroAndNonzeroSecurityReviewDecisionBindings(value, 'Critical/high findings open') ||
    hasMixedZeroAndNonzeroSecurityReviewDecisionBindings(value, 'Publication blockers')
  );
}

function hasMixedSecurityReviewDecisionBindings(
  value: string,
  fieldPattern: string,
  valuePattern: string,
): boolean {
  return exactSecurityReviewDecisionBindingValues(value, fieldPattern, valuePattern).size > 1;
}

function hasOpposingSecurityReviewDecisionBindings(value: string, fieldPattern: string): boolean {
  const values = exactSecurityReviewDecisionBindingValues(value, fieldPattern, 'yes|no');
  return values.has('yes') && values.has('no');
}

function hasMixedZeroAndNonzeroSecurityReviewDecisionBindings(value: string, fieldPattern: string): boolean {
  const values = exactSecurityReviewDecisionBindingValues(value, fieldPattern, '\\d+');
  return values.has('0') && Array.from(values).some(count => count !== '0');
}

function exactSecurityReviewDecisionBindingValues(
  value: string,
  fieldPattern: string,
  valuePattern: string,
): Set<string> {
  const pattern = new RegExp(
    `\\b${fieldPattern}\\s*=\\s*(${valuePattern})\\s*(?:$|[.;,|)\\]\\r\\n])`,
    'ig',
  );
  return new Set(
    Array.from(value.matchAll(pattern), match => normalizeReviewerDecisionSummaryText(match[1] ?? '')),
  );
}

function reviewerSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(
  value: string,
  expected: 'yes' | 'no',
): boolean {
  return hasExactTestnetProductionCandidateClaimAllowedBinding(value, expected);
}

function hasExactTestnetProductionCandidateClaimAllowedBinding(
  value: string,
  expected: 'yes' | 'no',
): boolean {
  return new RegExp(`\\bTestnet production-candidate claim allowed\\s*=\\s*${expected}\\s*(?:$|[.;,|)\\]\\r\\n])`, 'i').test(value);
}

function reviewerSummaryHasExactReleaseSupportedBinding(value: string, expected: string): boolean {
  return hasExactReleaseSupportedBinding(value, expected);
}

function hasExactProductionCandidateReleaseSupportedBinding(value: string): boolean {
  return hasExactReleaseSupportedBinding(value, 'production deployment candidate');
}

function hasExactReleaseSupportedBinding(value: string, expected: string): boolean {
  return new RegExp(`\\bRelease supported\\s*=\\s*${escapeRegExp(expected)}\\s*(?:$|[.;,|)\\]\\r\\n])`, 'i').test(value);
}

function reviewerSummaryHasExactProductionReadyClaimDeniedBinding(value: string): boolean {
  return hasExactProductionReadyClaimDeniedBinding(value);
}

function hasExactProductionReadyClaimDeniedBinding(value: string): boolean {
  return /\bProduction-ready claim allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function reviewerSummaryHasExactCriticalHighFindingsOpenBinding(value: string): boolean {
  return /\bCritical\/high findings open\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function reviewerSummaryMentionsProductionReadyClaimHandling(value: string): boolean {
  const normalized = normalizeReviewerDecisionSummaryText(value);
  return /\bproduction ready claim handling\b/.test(normalized);
}

function reviewerSummaryMentionsTestnetProductionCandidateClaimHandling(value: string): boolean {
  const normalized = normalizeReviewerDecisionSummaryText(value);
  return /\btestnet production candidate claim handling\b/.test(normalized);
}

function leavesCriticalHighFindingsOpen(value: string): boolean {
  const subject = '(?:critical high|critical and high|critical or high|critical|high)\\s+findings?';
  const unresolvedState = '(?:pending|unresolved|outstanding|remaining|awaiting|waiting(?:\\s+(?:for|on))?|deferred)';
  return normalizeReviewerDecisionSummarySegments(value).some(segment => {
    if (confirmsNoOpenCriticalHighFindings(segment, subject)) return false;
    return (
      new RegExp(`\\b${subject}\\s+open\\s+(?!0\\b|none\\b|no\\b|closed\\b)\\S+\\b`).test(segment) ||
      new RegExp(`\\b${subject}\\s+(?:count|total)\\s+(?!0\\b|zero\\b|none\\b|no\\b|closed\\b|resolved\\b|mitigated\\b)\\S+\\s+${unresolvedState}\\b`).test(segment) ||
      new RegExp(`\\bopen\\s+${subject}\\b`).test(segment) ||
      new RegExp(`\\b${subject}\\s+${unresolvedState}\\b`).test(segment) ||
      new RegExp(`\\b${unresolvedState}\\s+${subject}\\b`).test(segment)
    );
  });
}

function leavesPublicationBlockersOpen(value: string): boolean {
  const subject = 'publication blockers?';
  const unresolvedState = '(?:pending|unresolved|outstanding|remaining|awaiting|waiting(?:\\s+(?:for|on))?|deferred)';
  return normalizeReviewerDecisionSummarySegments(value).some(segment => {
    if (confirmsNoOpenPublicationBlockers(segment, subject)) return false;
    return (
      new RegExp(`\\b${subject}\\s+open\\s+(?!0\\b|none\\b|no\\b|closed\\b)\\S+\\b`).test(segment) ||
      new RegExp(`\\bopen\\s+${subject}\\b`).test(segment) ||
      new RegExp(`\\b${subject}\\s+${unresolvedState}\\b`).test(segment) ||
      new RegExp(`\\b${unresolvedState}\\s+${subject}\\b`).test(segment)
    );
  });
}

function confirmsNoOpenCriticalHighFindings(segment: string, subject: string): boolean {
  const approval = securityReviewReviewerApprovalTerms();
  return (
    new RegExp(`\\b(?:no|none|zero|without|absence|absent|lack|lacks|lacking)(?:\\s+of)?\\s+(?:open\\s+)?${subject}\\b`).test(segment) ||
    new RegExp(`\\b(?:open\\s+)?${subject}\\b(?:\\s+[a-z0-9]+){0,3}\\s+not\\s+${approval}\\b`).test(segment)
  );
}

function confirmsNoOpenPublicationBlockers(segment: string, subject: string): boolean {
  const approval = securityReviewReviewerApprovalTerms();
  return (
    new RegExp(`\\b(?:no|none|zero|without|absence|absent|lack|lacks|lacking)(?:\\s+of)?\\s+(?:open\\s+)?${subject}\\b`).test(segment) ||
    new RegExp(`\\b(?:open\\s+)?${subject}\\b(?:\\s+[a-z0-9]+){0,3}\\s+not\\s+${approval}\\b`).test(segment)
  );
}

function hasExactSecurityBlockerClosureBindings(value: string): boolean {
  return (
    /\bCritical\/high findings open\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value) &&
    /\bPublication blockers\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value)
  );
}

function usesNumericSecurityBlockerClosure(value: string): boolean {
  const normalized = normalizeReviewerDecisionSummaryText(value);
  const numericClosure = '0';
  return (
    new RegExp(`\\b(?:critical high|critical and high|critical or high) findings?(?:\\s+open)?\\s+${numericClosure}\\b`).test(normalized) ||
    new RegExp(`\\bopen\\s+(?:critical high|critical and high|critical or high) findings?\\s+${numericClosure}\\b`).test(normalized) ||
    new RegExp(`\\b${numericClosure}\\s+(?:open\\s+)?(?:critical high|critical and high|critical or high) findings?\\b`).test(normalized) ||
    new RegExp(`\\bpublication blockers?(?:\\s+open)?\\s+${numericClosure}\\b`).test(normalized) ||
    new RegExp(`\\bopen publication blockers?\\s+${numericClosure}\\b`).test(normalized) ||
    new RegExp(`\\b${numericClosure}\\s+(?:open\\s+)?publication blockers?\\b`).test(normalized)
  );
}

function usesNonExactSecurityBlockerClosure(value: string): boolean {
  return (
    (usesTextualSecurityBlockerClosure(value) || usesNumericSecurityBlockerClosure(value)) &&
    !hasExactSecurityBlockerClosureBindings(value)
  );
}

function usesTextualSecurityBlockerClosure(value: string): boolean {
  const normalized = normalizeReviewerDecisionSummaryText(value);
  const textualClosure = '(?:zero|none|no|closed|resolved|mitigated)';
  return (
    new RegExp(`\\b(?:critical high|critical and high|critical or high) findings?(?:\\s+open)?\\s+${textualClosure}\\b`).test(normalized) ||
    new RegExp(`\\bopen\\s+(?:critical high|critical and high|critical or high) findings?\\s+${textualClosure}\\b`).test(normalized) ||
    new RegExp(`\\b${textualClosure}\\s+(?:open\\s+)?(?:critical high|critical and high|critical or high) findings?\\b`).test(normalized) ||
    new RegExp(`\\bpublication blockers?(?:\\s+open)?\\s+${textualClosure}\\b`).test(normalized) ||
    new RegExp(`\\bopen publication blockers?\\s+${textualClosure}\\b`).test(normalized) ||
    new RegExp(`\\b${textualClosure}\\s+(?:open\\s+)?publication blockers?\\b`).test(normalized)
  );
}

function normalizeReviewerDecisionSummaryText(value: string): string {
  return normalizeEvidenceMarkerText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function releaseExceedsReviewLevel(releaseSupported: string, releaseLevel: string): boolean {
  const supportedRank = RELEASE_LEVEL_RANK.get(releaseSupported);
  const reviewRank = RELEASE_LEVEL_RANK.get(releaseLevel);
  if (supportedRank === undefined || reviewRank === undefined) return false;
  return supportedRank > reviewRank;
}

function validateScopeRows(rows: ScopeCoverageRow[]): string[] {
  const errors = validateRequiredNames('Required Scope Coverage', rows.map(row => row.area), REQUIRED_SCOPE_AREAS);

  for (const row of rows) {
    if (!REQUIRED_SCOPE_AREAS.includes(row.area)) {
      errors.push(`Required Scope Coverage: ${row.area}: unexpected area`);
    }
    if (!ALLOWED_SCOPE_COVERAGE.has(row.coverage)) {
      errors.push(`Required Scope Coverage: ${row.area}: coverage must be covered before Gate 4 evidence can pass`);
    }
    validateLinkedStatus(errors, 'Required Scope Coverage', row.area, row.status);
    if (!hasEvidenceMarker(row.evidence)) {
      errors.push(`Required Scope Coverage: ${row.area}: evidence marker is required`);
    } else if (!hasCompletedSecurityReviewEvidenceTarget(row.evidence)) {
      errors.push(
        `Required Scope Coverage: ${row.area}: evidence ${COMPLETED_EVIDENCE_TARGET_MESSAGE}`,
      );
    } else if (!hasNoContradictorySecurityReviewEvidenceMarker(row.evidence)) {
      errors.push(`Required Scope Coverage: ${row.area}: evidence must not include contradictory security review failure markers`);
    } else if (securityReviewAdmitsPrivateMaintainerContext(row.evidence)) {
      errors.push(`Required Scope Coverage: ${row.area}: evidence must not admit private maintainer context`);
    }
    if (isBlank(row.findingIds)) {
      errors.push(`Required Scope Coverage: ${row.area}: finding IDs or none marker is required`);
    }
    if (isBlank(row.riskFocus)) {
      errors.push(`Required Scope Coverage: ${row.area}: risk focus is required`);
    } else if (securityReviewAdmitsPrivateMaintainerContext(row.riskFocus)) {
      errors.push(`Required Scope Coverage: ${row.area}: risk focus must not admit private maintainer context`);
    } else {
      const riskFocusExpectation = REQUIRED_SCOPE_RISK_FOCUS[row.area];
      if (riskFocusExpectation && !hasSecurityReviewScopeRiskFocus(row.area, row.riskFocus)) {
        errors.push(
          `Required Scope Coverage: ${row.area}: risk focus must mention ${riskFocusExpectation.message}`,
        );
      }
    }
  }

  return errors;
}

function validateEvidenceRows(rows: ReviewEvidencePackageRow[]): string[] {
  const errors = validateRequiredNames('Required Evidence Package', rows.map(row => row.evidence), REQUIRED_EVIDENCE_ITEMS);

  for (const row of rows) {
    if (!REQUIRED_EVIDENCE_ITEMS.includes(row.evidence)) {
      errors.push(`Required Evidence Package: ${row.evidence}: unexpected evidence item`);
    }
    validateLinkedStatus(errors, 'Required Evidence Package', row.evidence, row.status);
    if (!hasEvidenceMarker(row.linkOrArtifact)) {
      errors.push(`Required Evidence Package: ${row.evidence}: link or artifact marker is required`);
    } else if (!hasCompletedSecurityReviewEvidenceTarget(row.linkOrArtifact)) {
      errors.push(
        `Required Evidence Package: ${row.evidence}: link or artifact ${COMPLETED_EVIDENCE_TARGET_MESSAGE}`,
      );
    } else if (!hasNoContradictorySecurityReviewEvidenceMarker(row.linkOrArtifact)) {
      errors.push(`Required Evidence Package: ${row.evidence}: link or artifact must not include contradictory security review failure markers`);
    } else if (securityReviewAdmitsPrivateMaintainerContext(row.linkOrArtifact)) {
      errors.push(`Required Evidence Package: ${row.evidence}: link or artifact must not admit private maintainer context`);
    } else {
      const artifactFocus = REQUIRED_EVIDENCE_ARTIFACT_FOCUS[row.evidence];
      if (artifactFocus && !hasSecurityReviewEvidenceArtifactFocus(row.evidence, row.linkOrArtifact)) {
        errors.push(`Required Evidence Package: ${row.evidence}: ${artifactFocus.message}`);
      }
    }
    if (isBlank(row.reviewerNote)) {
      errors.push(`Required Evidence Package: ${row.evidence}: reviewer note is required`);
    } else if (securityReviewAdmitsPrivateMaintainerContext(row.reviewerNote)) {
      errors.push(`Required Evidence Package: ${row.evidence}: reviewer note must not admit private maintainer context`);
    } else if (hasSlashDelimitedSecurityReviewReviewerOutcomeAlternative(row.reviewerNote)) {
      errors.push(
        `Required Evidence Package: ${row.evidence}: reviewer note must use one concrete outcome without slash-delimited alternatives`,
      );
    } else if (!hasActionableSecurityReviewEvidenceNote(row.reviewerNote)) {
      errors.push(
        `Required Evidence Package: ${row.evidence}: reviewer note must state verified, accepted, pass/fail, blocker, match, or reconciliation outcome`,
      );
    } else if (leavesCriticalHighFindingsOpen(row.reviewerNote)) {
      errors.push(`Required Evidence Package: ${row.evidence}: reviewer note must not leave critical/high findings open`);
    }
  }

  return errors;
}

function validateFindingRows(rows: FindingDispositionRow[]): string[] {
  const errors = validateRequiredNames('Finding Disposition', rows.map(row => row.findingClass), REQUIRED_FINDING_CLASSES);

  for (const row of rows) {
    if (!REQUIRED_FINDING_CLASSES.includes(row.findingClass)) {
      errors.push(`Finding Disposition: ${row.findingClass}: unexpected finding class`);
    }
    validateLinkedStatus(errors, 'Finding Disposition', row.findingClass, row.status);
    if (isBlank(row.count)) errors.push(`Finding Disposition: ${row.findingClass}: count is required`);
    if (!isBlank(row.count) && !isStructuredFindingCount(row.count)) {
      errors.push(`Finding Disposition: ${row.findingClass}: count must be 0, none, no, or an integer`);
    }
    if (isUnsafeFindingCount(row.count)) {
      errors.push(`Finding Disposition: ${row.findingClass}: count must be a safe integer`);
    }
    if (isBlank(row.openCriticalHigh)) {
      errors.push(`Finding Disposition: ${row.findingClass}: open critical/high value is required`);
    } else if (!isExactZero(row.openCriticalHigh)) {
      errors.push(`Finding Disposition: ${row.findingClass}: open critical/high must be 0`);
    }
    if (!hasEvidenceMarker(row.closureEvidence)) {
      errors.push(`Finding Disposition: ${row.findingClass}: closure evidence marker is required`);
    } else if (!hasCompletedSecurityReviewEvidenceTarget(row.closureEvidence)) {
      errors.push(
        `Finding Disposition: ${row.findingClass}: closure evidence ${COMPLETED_EVIDENCE_TARGET_MESSAGE}`,
      );
    } else if (!hasNoContradictorySecurityReviewEvidenceMarker(row.closureEvidence)) {
      errors.push(`Finding Disposition: ${row.findingClass}: closure evidence must not include contradictory security review failure markers`);
    } else if (securityReviewAdmitsPrivateMaintainerContext(row.closureEvidence)) {
      errors.push(`Finding Disposition: ${row.findingClass}: closure evidence must not admit private maintainer context`);
    } else if (leavesCriticalHighFindingsOpen(row.closureEvidence)) {
      errors.push(`Finding Disposition: ${row.findingClass}: closure evidence must not leave critical/high findings open`);
    }
    if ((row.findingClass === 'Critical findings' || row.findingClass === 'High findings') && !isExactZero(row.openCriticalHigh)) {
      errors.push(`Finding Disposition: ${row.findingClass}: open critical/high must be 0 before review evidence can pass`);
    }
    if (row.findingClass === 'Publication blockers' && !isBlank(row.count) && !isExactZero(row.count)) {
      errors.push('Finding Disposition: Publication blockers: count must be 0 before review evidence can pass');
    }
  }

  return errors;
}

function validateScopeFindingIdClosureEvidence(
  scopeRows: ScopeCoverageRow[],
  findingRows: FindingDispositionRow[],
): string[] {
  return findMissingSecurityReviewFindingIdClosureEvidence(scopeRows, findingRows)
    .map(({ area, findingIds }) =>
      `Required Scope Coverage: ${area}: finding IDs ${findingIds.join(', ')} must be referenced by Finding Disposition closure evidence`,
    );
}

export function findMissingSecurityReviewFindingIdClosureEvidence(
  scopeRows: ScopeCoverageRow[],
  findingRows: FindingDispositionRow[],
): MissingSecurityReviewFindingIdClosureEvidence[] {
  return scopeRows
    .filter(row => row.status === 'linked')
    .map(row => ({
      area: row.area,
      findingIds: extractSecurityReviewFindingIds(row.findingIds)
        .filter(findingId => !findingIdHasClosureEvidence(findingId, findingRows)),
    }))
    .filter(result => result.findingIds.length > 0);
}

function validateNegativeRows(rows: NegativeReviewCheckRow[]): string[] {
  const errors = validateRequiredNames('Required Negative Review Checks', rows.map(row => row.question), REQUIRED_NEGATIVE_QUESTIONS);

  for (const row of rows) {
    if (!REQUIRED_NEGATIVE_QUESTIONS.includes(row.question)) {
      errors.push(`Required Negative Review Checks: ${row.question}: unexpected question`);
    }
    validateLinkedStatus(errors, 'Required Negative Review Checks', row.question, row.status);
    if (isBlank(row.reviewerAnswer)) {
      errors.push(`Required Negative Review Checks: ${row.question}: reviewer answer is required`);
    }
    const answerExpectation = REQUIRED_NEGATIVE_ANSWER_EXPECTATIONS[row.question];
    if (
      answerExpectation &&
      !isBlank(row.reviewerAnswer) &&
      !hasSecurityReviewExpectedNegativeAnswer(row.question, row.reviewerAnswer)
    ) {
      errors.push(
        `Required Negative Review Checks: ${row.question}: reviewer answer must state ${answerExpectation.message}`,
      );
    }
    if (securityReviewAdmitsPrivateMaintainerContext(row.reviewerAnswer)) {
      errors.push(`Required Negative Review Checks: ${row.question}: reviewer answer must not admit private maintainer context`);
    }
    if (!hasEvidenceMarker(row.evidence)) {
      errors.push(`Required Negative Review Checks: ${row.question}: evidence marker is required`);
    } else if (!hasCompletedSecurityReviewEvidenceTarget(row.evidence)) {
      errors.push(
        `Required Negative Review Checks: ${row.question}: evidence ${COMPLETED_EVIDENCE_TARGET_MESSAGE}`,
      );
    } else if (!hasNoContradictorySecurityReviewEvidenceMarker(row.evidence)) {
      errors.push(`Required Negative Review Checks: ${row.question}: evidence must not include contradictory security review failure markers`);
    } else if (securityReviewAdmitsPrivateMaintainerContext(row.evidence)) {
      errors.push(`Required Negative Review Checks: ${row.question}: evidence must not admit private maintainer context`);
    } else {
      const evidenceFocus = REQUIRED_NEGATIVE_EVIDENCE_FOCUS[row.question];
      if (evidenceFocus && !hasSecurityReviewNegativeEvidenceFocus(row.question, row.evidence)) {
        errors.push(`Required Negative Review Checks: ${row.question}: ${evidenceFocus.message}`);
      }
    }
  }

  return errors;
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
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve before security review evidence can pass`);
    }
    if (isBlank(row.date)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: Date must use YYYY-MM-DD`);
    }
    if (isBlank(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes are required`);
    } else if (!hasNoContradictorySecurityReviewEvidenceMarker(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not include contradictory security review failure markers`);
    } else if (containsMainnetProductionClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not contain mainnet production claim wording`);
    } else if (containsProductionReadyClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not contain production-ready claim wording`);
    } else if (approvesOpenPublicationBlockers(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve open publication blockers`);
    } else if (leavesPublicationBlockersOpen(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not leave publication blockers open`);
    } else if (approvesAcceptedRisksMissingReleaseArtifacts(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve accepted risks missing release artifacts`);
    } else if (securityReviewAdmitsPrivateMaintainerContext(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not admit private maintainer context`);
    } else if (!isActionableSecurityReviewOutcomeNote(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must state a concrete security-review outcome`);
    } else if (leavesCriticalHighFindingsOpen(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not leave critical/high findings open`);
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

function approvesOpenCriticalHighFindings(value: string): boolean {
  return normalizeReviewerDecisionSummarySegments(value).some(segment =>
    securityReviewTextApprovesSubject(
      segment,
      '(?:(?:critical high|critical and high|critical or high|critical|high)\\s+findings?\\s+open|' +
        'open\\s+(?:critical high|critical and high|critical or high|critical|high)\\s+findings?)',
      securityReviewReviewerApprovalTerms(),
    ),
  );
}

function approvesOpenPublicationBlockers(value: string): boolean {
  return normalizeReviewerDecisionSummarySegments(value).some(segment =>
    securityReviewTextApprovesSubject(
      segment,
      '(?:publication blockers?\\s+open|open publication blockers?)',
      securityReviewReviewerApprovalTerms(),
    ),
  );
}

function approvesAcceptedRisksMissingReleaseArtifacts(value: string): boolean {
  const subject =
    '(?:accepted risks?(?:\\s+[a-z0-9]+){0,2}\\s+' +
    '(?:not reflected|missing|absent|without|lack|lacks|lacking)(?:\\s+in)?(?:\\s+[a-z0-9]+){0,2}\\s+' +
    '(?:release notes?|release artifacts?|checklist))';
  return normalizeReviewerDecisionSummarySegments(value).some(segment =>
    securityReviewTextApprovesSubject(
      segment,
      subject,
      securityReviewReviewerApprovalTerms(),
    ),
  );
}

function securityReviewReviewerApprovalTerms(): string {
  return '(?:accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|enable|enabled|enables|support|supported|supports|permit|permitted|permits|clear|cleared|clears|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits)';
}

function securityReviewTextApprovesSubject(
  normalized: string,
  subject: string,
  approval: string,
): boolean {
  const subjectApprovalConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,3}';
  const approvalSubjectConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,2}';

  return [
    new RegExp(`\\b${subject}\\b${subjectApprovalConnector}\\s+${approval}\\b`, 'gi'),
    new RegExp(`\\b${approval}\\b${approvalSubjectConnector}\\s+${subject}\\b`, 'gi'),
  ].some(pattern => hasUnnegatedSecurityReviewApproval(normalized, pattern));
}

function hasUnnegatedSecurityReviewApproval(normalized: string, pattern: RegExp): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 32), index);
    if (!/\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?\s+$/.test(prefix)) return true;
  }
  return false;
}

function normalizeReviewerDecisionSummarySegments(value: string): string[] {
  return value
    .split(/[\n\r|;]+|[.]\s+/)
    .map(segment => normalizeReviewerDecisionSummaryText(segment))
    .filter(segment => segment.length > 0);
}

function securityReviewAdmitsPrivateMaintainerContext(value: string): boolean {
  if (/private maintainer context used\s*[:=]?\s*yes/i.test(value)) return true;
  const approval = securityReviewReviewerApprovalTerms();
  return securityReviewPrivateMaintainerContextSegments(value).some(segment => {
    if (securityReviewConfirmsNoPrivateMaintainerContext(segment)) return false;
    return (
      /\bprivate maintainer context used yes\b/.test(segment) ||
      new RegExp(`\\bprivate (?:maintainer )?context\\b(?:\\s+[a-z0-9]+){0,3}\\s+${approval}\\b`).test(segment) ||
      new RegExp(`\\b${approval}\\b(?:\\s+[a-z0-9]+){0,2}\\s+private (?:maintainer )?context\\b`).test(segment) ||
      /\b(?:used|provided|required|needed|available|relied|relies)\s+private (?:maintainer )?context\b/.test(segment) ||
      /\bprivate (?:maintainer )?context\s+(?:was\s+)?(?:used|provided|required|needed|available|relied)\b/.test(segment)
    );
  });
}

function securityReviewPrivateMaintainerContextSegments(value: string): string[] {
  return value
    .split(/[.;|\r\n]+/)
    .map(segment => normalizeEvidenceMarkerText(segment).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(segment => segment.length > 0);
}

function securityReviewConfirmsNoPrivateMaintainerContext(value: string): boolean {
  return (
    /\bprivate maintainer context used no\b/.test(value) ||
    /\bno private (?:maintainer )?context\b/.test(value) ||
    /\bwithout private (?:maintainer )?context\b/.test(value) ||
    /\bprivate (?:maintainer )?context (?:absent|not used|unused|blocked|forbidden|not allowed|denied)\b/.test(value)
  );
}

function validateReviewerIdentityConsistency(markdown: string, rows: ReviewerSignoffRow[]): string[] {
  const classification = parseTwoColumnTable(
    sectionBetween(markdown, '## Review Classification', '## Required Scope Coverage'),
  );
  const classifiedLeadReviewer = classification.get('Lead reviewer')?.trim() ?? '';
  const leadReviewerSignoff = rows.find(row => row.role === 'Lead reviewer')?.name.trim() ?? '';

  if (
    classifiedLeadReviewer.length > 0 &&
    leadReviewerSignoff.length > 0 &&
    classifiedLeadReviewer !== leadReviewerSignoff
  ) {
    return ['Reviewer Sign-Off: Lead reviewer: name must match Review Classification Lead reviewer'];
  }

  return [];
}

function validateReviewerDateConsistency(markdown: string, rows: ReviewerSignoffRow[]): string[] {
  const classification = parseTwoColumnTable(
    sectionBetween(markdown, '## Review Classification', '## Required Scope Coverage'),
  );
  const classificationDate = classification.get('Date')?.trim() ?? '';
  if (!isIsoCalendarDate(classificationDate)) return [];

  return rows
    .filter(row => isIsoCalendarDate(row.date) && row.date < classificationDate)
    .map(row => `Reviewer Sign-Off: ${row.role}: Date must not be before Review Classification Date`);
}

function validateLinkedStatus(errors: string[], section: string, label: string, status: string): void {
  if (!ALLOWED_STATUSES.has(status as SecurityReviewEvidenceStatus)) {
    errors.push(`${section}: ${label}: status must be pending, linked, or blocker`);
    return;
  }
  if (status !== 'linked') {
    errors.push(`${section}: ${label}: status must be linked before security review evidence can pass`);
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
    /^artifact:\/\//.test(value)
  );
}

function hasCompletedEvidenceMarker(value: string): boolean {
  return (
    hasCompletedArtifactTarget(value) ||
    hasNonTemplateMarkdownLink(value)
  );
}

function haveSharedConcreteEvidenceTarget(left: string, right: string): boolean {
  const leftTargets = new Set(concreteCompletedEvidenceTargets(left));
  return concreteCompletedEvidenceTargets(right).some(target => leftTargets.has(target));
}

function concreteCompletedEvidenceTargets(value: string): string[] {
  return concreteEvidenceTargets(securityReviewCompletedEvidenceText(value));
}

function concreteEvidenceTargets(value: string): string[] {
  return [...new Set(
    extractEvidenceTargets(value)
      .map(normalizeEvidenceTarget)
      .filter(isConcreteEvidenceTarget),
  )];
}

function extractEvidenceTargets(value: string): string[] {
  return [
    ...[...value.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+)/g)].map(([, target]) => target),
    ...[...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(([, target]) => target.trim()),
  ];
}

function normalizeEvidenceTarget(target: string): string {
  return target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').trim().toLowerCase();
}

function hasClaimEscalatingSecurityReviewEvidenceTarget(target: string): boolean {
  const comparable = normalizeSecurityReviewEvidenceTargetText(target);
  return (
    classifyPublicationClaimText(comparable).hasProductionClaim ||
    approvesOpenCriticalHighFindings(comparable) ||
    approvesOpenPublicationBlockers(comparable) ||
    approvesAcceptedRisksMissingReleaseArtifacts(comparable) ||
    securityReviewAdmitsPrivateMaintainerContext(comparable)
  );
}

function isConcreteEvidenceTarget(target: string): boolean {
  const normalized = normalizeEvidenceTarget(target);
  return (
    normalized.length > 0 &&
    !/-template\.md(?:[#?].*)?$/i.test(normalized) &&
    !isLocalOnlyEvidenceTarget(normalized) &&
    !isSensitiveOrRuntimeSecurityReviewEvidenceTarget(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized) &&
    !hasClaimEscalatingSecurityReviewEvidenceTarget(normalized)
  );
}

function normalizeSecurityReviewEvidenceTargetText(target: string): string {
  return normalizeEvidenceMarkerText(target).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function findSecurityReviewValidationTargetBinding(value: string): RegExpExecArray | null {
  return /\b(?:validated target|validated input|security validate target|security review validation target|independent security review validation target)\b/i
    .exec(value);
}

function securityReviewCompletedEvidenceText(value: string): string {
  return value
    .split(/[;\n]+/)
    .map(segment => {
      const targetBinding = findSecurityReviewValidationTargetBinding(segment);
      return targetBinding
        ? segment.slice(0, targetBinding.index).trim()
        : segment.trim();
    })
    .filter(segment => segment.length > 0)
    .join('; ');
}

function hasCompletedArtifactTarget(value: string): boolean {
  return [...value.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+)/g)]
    .some(([, target]) => isConcreteEvidenceTarget(target));
}

function hasNonTemplateMarkdownLink(value: string): boolean {
  const links = [...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
  return links.some(([, target]) => isConcreteEvidenceTarget(target));
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

function isSensitiveOrRuntimeSecurityReviewEvidenceTarget(target: string): boolean {
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized)
    .map(normalizeSecurityReviewEvidenceInspectionTarget)
    .some(isSensitiveOrRuntimeSecurityReviewEvidenceInspectionTarget);
}

function normalizeSecurityReviewEvidenceInspectionTarget(normalizedTarget: string): string {
  const artifactTarget = /^artifact:\/\/[a-z0-9][a-z0-9._-]*\/(.+)$/i.exec(normalizedTarget);
  return artifactTarget ? artifactTarget[1] : normalizedTarget;
}

function isSensitiveOrRuntimeSecurityReviewEvidenceInspectionTarget(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasSecurityReviewEnvironmentTargetSegment(normalizedTarget) ||
    hasSecurityReviewRuntimeDatabaseTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isSecurityReviewSecretOrRuntimeName(normalizedTarget) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
  );
}

function isSecurityReviewSecretOrRuntimeName(normalizedTarget: string): boolean {
  if (!isEvidenceSecretOrRuntimeName(normalizedTarget, { includeDeployedState: true })) return false;
  return (
    !hasSecurityReviewNodeWalletDomainReference(normalizedTarget) ||
    hasExplicitSecurityReviewSecretOrRuntimeName(normalizedTarget)
  );
}

function hasSecurityReviewNodeWalletDomainReference(normalizedTarget: string): boolean {
  return /(?:^|[/_. -])(?:ergo[-_ ]?)?node[-_ ]?wallet(?:$|[/_. -])/.test(normalizedTarget);
}

function hasExplicitSecurityReviewSecretOrRuntimeName(normalizedTarget: string): boolean {
  return (
    normalizedTarget.includes('secrets.' + 'dlog') ||
    normalizedTarget.includes('runtime-state') ||
    normalizedTarget.includes('deployed_state.json') ||
    /(?:^|[/_. -])(?:secret|secrets|mnemonic|keystore|keyfile|private[-_ ]?key|signing[-_ ]?key|api[-_ ]?key|seed[-_ ]?phrase)(?:$|[/_. -])/.test(normalizedTarget)
  );
}

function hasSecurityReviewEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasSecurityReviewRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function hasNonConcreteEvidenceTargetSegment(value: string): boolean {
  const normalized = value.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').toLowerCase();
  return (
    /(?:^|[\/_.-])(?:placeholder|generic|todo|tbd)(?:[\/_.-]|$)/i.test(normalized) ||
    /(?:^|[\/_.-])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[\/_.-]|$)/i.test(normalized) ||
    /(?:^|[\/_.-])(?:sample|example)[-_ ]*(?:evidence|security|review|scope|finding|findings|negative|check|release|checklist)(?:[\/_.-]|$)/i.test(normalized)
  );
}

function hasContradictorySecurityReviewEvidenceMarker(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);
  return (
    /\b(?:status|result|validation|validator|command|run|outcome)\s*[:=]?\s*(?:FAIL(?:ED)?|BLOCKED|ERROR)\b/i.test(normalized) ||
    /\b(?:FAIL(?:ED)?|BLOCKED|ERROR)\b\s+(?:validation|validator|command|run|result|status|outcome)\b/i.test(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasAmbiguousSecurityReviewResultCount(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasUnresolvedIssueMarker(normalized) ||
    /\b[1-9]\d*\s+structural\s+issues?\b/i.test(normalized)
  );
}

function hasSlashDelimitedSecurityReviewReviewerOutcomeAlternative(value: string): boolean {
  return REVIEWER_NOTE_OUTCOME_ALTERNATIVE_PATTERN.test(value);
}

function hasAmbiguousSecurityReviewResultCount(value: string): boolean {
  return /\b(?:errors?|structural\s+issues?)\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value);
}

function identifiesGate4ChecklistUpdateEvidence(value: string): boolean {
  return identifiesSecurityReviewPublicationEvidenceKind(
    value,
    'completed Gate 4 checklist update evidence',
  );
}

function identifiesGate4ReleaseNoteUpdateEvidence(value: string): boolean {
  return identifiesSecurityReviewPublicationEvidenceKind(
    value,
    'completed Gate 4 release-note update evidence',
  );
}

function identifiesSecurityReviewPublicationEvidenceKind(value: string, evidenceKind: string): boolean {
  const normalizedKind = normalizeSecurityReviewEvidenceKind(evidenceKind);
  return securityReviewPublicationEvidenceTargetsIdentifyKind(value, normalizedKind) ||
    securityReviewPublicationEvidenceKindTextSegments(value)
      .some(segment =>
        segment === normalizedKind ||
        segment.startsWith(`${normalizedKind} `)
      );
}

function securityReviewPublicationEvidenceTargetsIdentifyKind(value: string, normalizedKind: string): boolean {
  const expectedSlug = normalizedKind.replace(/\s+/g, '-');
  return extractEvidenceTargets(securityReviewCompletedEvidenceText(value))
    .some(target => normalizeSecurityReviewPublicationEvidenceTargetBasename(target) === expectedSlug);
}

function normalizeSecurityReviewPublicationEvidenceTargetBasename(target: string): string {
  const normalizedTarget = normalizeEvidenceTarget(target).replace(/\\/g, '/');
  const basename = normalizedTarget.split('/').filter(Boolean).pop() ?? normalizedTarget;
  return normalizeSecurityReviewEvidenceKind(basename.replace(/\.[a-z0-9]+$/i, '')).replace(/\s+/g, '-');
}

function securityReviewPublicationEvidenceKindTextSegments(value: string): string[] {
  return value
    .split(/[;\n|]+/)
    .map(stripLeadingSecurityReviewEvidenceTarget)
    .map(normalizeSecurityReviewEvidenceKind)
    .filter(segment => segment.length > 0);
}

function stripLeadingSecurityReviewEvidenceTarget(value: string): string {
  const trimmed = value.trim();
  const markdownMatch = /^\[[^\]]+\]\([^)]+\)/.exec(trimmed);
  if (markdownMatch) return trimmed.slice(markdownMatch[0].length).replace(/^[\s,.:;-]+/, '');

  const artifactMatch = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+/i.exec(trimmed);
  if (artifactMatch) return trimmed.slice(artifactMatch[0].length).replace(/^[\s,.:;-]+/, '');

  return trimmed;
}

function normalizeSecurityReviewEvidenceKind(value: string): string {
  return normalizeEvidenceMarkerText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function isZeroLike(value: string): boolean {
  return /^(0|none|no|n\/a)$/i.test(value.trim());
}

function isExactZero(value: string): boolean {
  return /^0$/.test(value.trim());
}

function isStructuredFindingCount(value: string): boolean {
  return /^(0|none|no|\d+)$/i.test(value.trim());
}

function isUnsafeFindingCount(value: string): boolean {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return false;
  return !Number.isSafeInteger(Number(normalized));
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

const NON_FINDING_ID_MARKERS = new Set([
  'none',
  'no',
  'n/a',
  'na',
  'not applicable',
  'no finding',
  'no findings',
  'none identified',
  'no linked findings',
]);

const FINDING_ID_STOP_WORDS = new Set([
  'and',
  'or',
  'finding',
  'findings',
  'id',
  'ids',
]);

function extractSecurityReviewFindingIds(value: string): string[] {
  const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();
  if (normalized.length === 0 || NON_FINDING_ID_MARKERS.has(normalized)) return [];
  return [...new Set(
    value
      .split(/[,;\s]+/)
      .map(part => part.replace(/^[()[\]{}<>:]+|[()[\]{}<>:]+$/g, '').trim())
      .filter(part => part.length > 0 && !FINDING_ID_STOP_WORDS.has(part.toLowerCase())),
  )];
}

function findingIdHasClosureEvidence(findingId: string, findingRows: FindingDispositionRow[]): boolean {
  return findingRows
    .filter(row => row.status === 'linked')
    .some(row => textContainsFindingId(row.closureEvidence, findingId));
}

function textContainsFindingId(value: string, findingId: string): boolean {
  const escaped = escapeRegExp(findingId);
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isConcreteSecurityReviewerOrganization(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return !GENERIC_SECURITY_REVIEWER_ORGANIZATION_VALUES.has(normalized);
}
