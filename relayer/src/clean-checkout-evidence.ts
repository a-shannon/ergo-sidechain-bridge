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
import {
  classifyPublicationClaimText,
  validateReviewerDecisionSummaryClaimBoundary,
} from './publication-claim-boundary.js';

export type CleanCheckoutEvidenceStatus = 'pending' | 'linked' | 'blocker';
export type ReviewerDecision = 'approve' | 'block';

export interface CleanCheckoutCommandRow {
  command: string;
  expectedResult: string;
  evidence: string;
  status: string;
}

export interface WorkflowEvidenceRow {
  requirement: string;
  workflowEvidence: string;
  status: string;
}

export interface ReproducibilityDecisionRow {
  decision: string;
  requiredEvidence: string;
  publicationImpact: string;
  status: string;
}

export interface CleanCheckoutRunClassification {
  evidenceName: string;
  gitCommit: string;
  branch: string;
  releaseLevel: string;
  ciProvider: string;
  workflow: string;
  nodeVersion: string;
  rustTarget: string;
  wasmPackVersion: string;
  reviewer: string;
  date: string;
}

export interface PublicationDecisionFields {
  cleanCheckoutCiGreen: string;
  releaseSupported: string;
  productionReadyClaimAllowed: string;
  testnetProductionCandidateClaimAllowed: string;
  releaseGateStructuralIssues: string;
  releaseNotesUpdated: string;
  requiredReleaseNoteUpdates: string;
  requiredChecklistUpdates: string;
  reviewerDecisionSummary: string;
}

export interface ReviewerSignoffRow {
  role: string;
  name: string;
  decision: string;
  date: string;
  notes: string;
}

export interface CleanCheckoutEvidenceValidation {
  status: 'PASS' | 'BLOCKED';
  classification: CleanCheckoutRunClassification;
  commandRows: CleanCheckoutCommandRow[];
  workflowRows: WorkflowEvidenceRow[];
  decisionRows: ReproducibilityDecisionRow[];
  publicationDecision: Partial<PublicationDecisionFields>;
  reviewerRows: ReviewerSignoffRow[];
  errors: string[];
  message: string;
}

interface ParsedRows<T> {
  rows: T[];
  errors: string[];
}

const REQUIRED_SECTIONS = [
  '## Run Classification',
  '## Required Commands',
  '## CI Workflow Evidence',
  '## Reproducibility Decisions',
  '## Publication Decision',
  '## Reviewer Sign-Off',
];

const REQUIRED_CLASSIFICATION_FIELDS = [
  'Evidence name',
  'Git commit',
  'Branch',
  'Release level',
  'CI provider',
  'Workflow',
  'Node version',
  'Rust target',
  'wasm-pack version',
  'Reviewer',
  'Date',
];

export const REQUIRED_CLEAN_CHECKOUT_COMMANDS = [
  'npm ci',
  'npm run check',
  'npm run wasm:test',
  'npm run release:gate',
  'git diff --check -- ergo-sidechain-bridge',
  'secret/local path diff scan',
  'git status --short',
];

const REQUIRED_COMMAND_EXPECTED_RESULTS: Record<string, { pattern: RegExp; message: string }> = {
  'npm ci': { pattern: /^(pass|passed|ok)$/i, message: 'pass, passed, or ok' },
  'npm run check': { pattern: /^(pass|passed|ok)$/i, message: 'pass, passed, or ok' },
  'npm run wasm:test': { pattern: /^(pass|passed|ok)$/i, message: 'pass, passed, or ok' },
  'git diff --check -- ergo-sidechain-bridge': {
    pattern: /^(pass|passed|ok)$/i,
    message: 'pass, passed, or ok',
  },
  'npm run release:gate': {
    pattern: /^(?=.*\b(blocked|block)\b)(?=.*\b(0|zero)\b)(?=.*\bstructural\b).+$/i,
    message: 'blocked with zero structural issues',
  },
  'secret/local path diff scan': {
    pattern: /^(?=.*\b(no|zero|0)\b)(?=.*\b(matches|findings|hits)\b).+$/i,
    message: 'no local path or secret marker matches',
  },
  'git status --short': {
    pattern: /^(clean|no output|empty|clean\/no output)$/i,
    message: 'clean/no output worktree status',
  },
};

const REVIEWER_APPROVAL_VERB_PATTERN =
  '(?:accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|enable|enabled|enables|support|supported|supports|permit|permitted|permits|clear|cleared|clears|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits)';
const REVIEWER_LOCAL_CONTEXT = '[^.;|\\r\\n]{0,100}';
const REVIEWER_DENIAL_OR_BOUNDARY_TERM_PATTERN =
  '(?:no|not|never|without|absence|absent|lack|lacks|lacking|but|however|though|although|except|unless)';
const REVIEWER_DENIAL_OR_BOUNDARY_PREFIX_PATTERN =
  /\b(?:no|not|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?\s+$/;
const REVIEWER_APPROVAL_CONNECTOR_PATTERN =
  `(?:\\s+(?!\\b${REVIEWER_DENIAL_OR_BOUNDARY_TERM_PATTERN}\\b)[a-z0-9/-]+){0,12}\\s+`;
const CLAIM_BLOCKED_PATTERN = /\b(blocked|forbidden|not allowed|disabled|rejected|refused|no)\b/i;
const RELEASE_GATE_ZERO_STRUCTURAL_ISSUES_PATTERN =
  /\b0\b.{0,40}\bstructural issues?\b|\bstructural issues?\b.{0,40}\b0\b/i;
const FAILED_CLEAN_CHECKOUT_CI_SUBJECT_PATTERN =
  '(?:(?:failed|failing|red|error)\\s+(?:clean checkout\\s+)?(?:ci|workflow)|(?:clean checkout\\s+)?(?:ci|workflow)\\s+(?:failed|failing|red|error))';
const APPROVES_PRODUCTION_READY_CLEAN_CHECKOUT_CLAIM_PATTERN = new RegExp(
  `\\b${REVIEWER_APPROVAL_VERB_PATTERN}\\b${REVIEWER_LOCAL_CONTEXT}\\b(?:production[- ]ready|production\\s+readiness|ready[- ]for[- ]production)\\b|` +
    `\\b(?:production[- ]ready|production\\s+readiness|ready[- ]for[- ]production)\\b${REVIEWER_LOCAL_CONTEXT}\\b${REVIEWER_APPROVAL_VERB_PATTERN}\\b`,
  'i',
);
const APPROVES_MAINNET_DEPLOYMENT_CLAIM_PATTERN = new RegExp(
  `\\b${REVIEWER_APPROVAL_VERB_PATTERN}\\b${REVIEWER_LOCAL_CONTEXT}\\b(?:mainnet|main\\s+network|main\\s+chain|mainchain)\\b|` +
    `\\b(?:mainnet|main\\s+network|main\\s+chain|mainchain)\\b${REVIEWER_LOCAL_CONTEXT}\\b${REVIEWER_APPROVAL_VERB_PATTERN}\\b`,
  'i',
);
const RELEASE_GATE_STRUCTURAL_ISSUES_SUBJECT_PATTERN =
  '(?:release gate\\s+)?structural issues?(?:\\s+[1-9]\\d*)?';

export const REQUIRED_CLEAN_CHECKOUT_WORKFLOW_REQUIREMENTS = [
  'Workflow file is tracked',
  'Node.js version is pinned',
  'npm cache uses relayer lockfile',
  'Rust wasm target is installed',
  'wasm-pack version is pinned',
  'npm ci runs before tests',
  'npm run check runs in CI',
  'npm run wasm:test runs in CI',
  'Final branch commit is identified',
];

export const REQUIRED_CLEAN_CHECKOUT_REPRODUCIBILITY_DECISIONS = [
  'Lockfile install is reproducible',
  'WASM AVL builds from tracked source',
  'TypeScript build is reproducible',
  'Relayer tests pass',
  'Rust WASM tests pass',
  'No local runtime state is staged',
  'No local path or secret marker is staged',
  'Release gate has zero structural issues',
];

const REQUIRED_DECISION_PUBLICATION_IMPACTS: Record<string, { pattern: RegExp; message: string }> = {
  'No local runtime state is staged': {
    pattern: /^(?=.*\b(public|publication|release)\b)(?=.*\b(blocked|blocker|blocks?)\b).+$/i,
    message: 'publication/release is blocked if local runtime state is staged',
  },
  'No local path or secret marker is staged': {
    pattern: /^(?=.*\b(public|publication|release)\b)(?=.*\b(blocked|blocker|blocks?)\b).+$/i,
    message: 'publication/release is blocked if local path or secret marker is staged',
  },
  'Release gate has zero structural issues': {
    pattern: /^(?=.*\b(public|publication|release)\b)(?=.*\b(blocked|blocker|blocks?)\b)(?=.*\b(0|zero)\b)(?=.*\bstructural\b).+$/i,
    message: 'publication/release is blocked unless release gate has zero structural issues',
  },
};

const REQUIRED_DECISION_EVIDENCE_MARKERS: Record<string, { pattern: RegExp; message: string }[]> = {
  'Lockfile install is reproducible': [
    {
      pattern: /lockfile|package[- ]lock|npm[- ]ci|npm ci/i,
      message: 'evidence must identify lockfile or npm ci reproducibility',
    },
  ],
  'WASM AVL builds from tracked source': [
    {
      pattern: /wasm|avl|wasm[- ]pack|tracked[- ]source/i,
      message: 'evidence must identify WASM AVL tracked-source build',
    },
  ],
  'TypeScript build is reproducible': [
    {
      pattern: /typescript|tsc|npm[- ]run[- ]check|npm run check/i,
      message: 'evidence must identify TypeScript build reproducibility',
    },
  ],
  'Relayer tests pass': [
    {
      pattern: /relayer|vitest|tests?/i,
      message: 'evidence must identify relayer test results',
    },
  ],
  'Rust WASM tests pass': [
    {
      pattern: /rust[- ]wasm|wasm[- ]test|wasm:test|cargo|rust/i,
      message: 'evidence must identify Rust WASM test results',
    },
  ],
  'No local runtime state is staged': [
    {
      pattern: /runtime[- ]state|git[- ]status|git status|worktree|sqlite/i,
      message: 'evidence must identify runtime-state or worktree-status hygiene',
    },
  ],
  'No local path or secret marker is staged': [
    {
      pattern: /local[- ]path|secret|hygiene|diff[- ]scan|marker/i,
      message: 'evidence must identify local-path or secret-marker scan',
    },
  ],
  'Release gate has zero structural issues': [
    {
      pattern: /release[- ]gate|release:gate|structural/i,
      message: 'evidence must identify release-gate structural issue output',
    },
  ],
};

const REQUIRED_PUBLICATION_DECISION_FIELDS = [
  'Clean checkout CI green',
  'Release supported',
  'Production-ready claim allowed',
  'Testnet production-candidate claim allowed',
  'Release gate structural issues',
  'Release notes updated',
  'Required release-note updates',
  'Required checklist updates',
  'Reviewer decision summary',
];

export const REQUIRED_CLEAN_CHECKOUT_REVIEWER_ROLES = [
  'CI reviewer',
  'Security reviewer',
  'Maintainer',
];

const ALLOWED_STATUSES = new Set<CleanCheckoutEvidenceStatus>(['pending', 'linked', 'blocker']);
const ALLOWED_RELEASE_LEVELS = new Set([
  'validated PoC',
  'institutional reference',
  'production deployment candidate',
]);
const ALLOWED_CI_PROVIDERS = new Set(['GitHub Actions', 'local clean checkout', 'external CI']);
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

export function parseCleanCheckoutCommandRows(markdown: string): CleanCheckoutCommandRow[] {
  return parseTableBetween(markdown, '## Required Commands', '## CI Workflow Evidence').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Required Commands row: ${row.join(' | ')}`);
    return {
      command: row[0],
      expectedResult: row[1],
      evidence: row[2],
      status: row[3],
    };
  });
}

export function validateCleanCheckoutEvidence(markdown: string): CleanCheckoutEvidenceValidation {
  const commands = parseRowsSafely(() => parseCleanCheckoutCommandRows(markdown));
  const workflows = parseRowsSafely(() => parseWorkflowRows(markdown));
  const decisions = parseRowsSafely(() => parseDecisionRows(markdown));
  const reviewers = parseRowsSafely(() => parseReviewerRows(markdown));
  const publicationDecision = parsePublicationDecision(markdown);
  const classification = parseRunClassification(markdown);
  const commandRows = commands.rows;
  const workflowRows = workflows.rows;
  const decisionRows = decisions.rows;
  const reviewerRows = reviewers.rows;
  const errors = [
    ...validateEvidenceHygiene(markdown, 'Clean Checkout Evidence'),
    ...validateRequiredSections(markdown),
    ...validateClassification(markdown),
    ...validatePublicationDecision(publicationDecision, markdown),
    ...commands.errors,
    ...workflows.errors,
    ...decisions.errors,
    ...reviewers.errors,
    ...validateCommandRows(commandRows),
    ...validateWorkflowRows(workflowRows),
    ...validateWorkflowFacts(markdown, workflowRows),
    ...validateFinalBranchCommitEvidence(markdown, workflowRows),
    ...validateDecisionRows(decisionRows),
    ...validateReviewerRows(reviewerRows),
    ...validateReviewerIdentityConsistency(markdown, reviewerRows),
    ...validateReviewerDateConsistency(markdown, reviewerRows),
  ];

  if (errors.length > 0) {
    return {
      status: 'BLOCKED',
      classification,
      commandRows,
      workflowRows,
      decisionRows,
      publicationDecision,
      reviewerRows,
      errors,
      message: `Clean checkout evidence BLOCKED: ${errors.length} structural issue(s).`,
    };
  }

  return {
    status: 'PASS',
    classification,
    commandRows,
    workflowRows,
    decisionRows,
    publicationDecision,
    reviewerRows,
    errors: [],
    message: `Clean checkout evidence PASS: ${commandRows.length} command rows are linked.`,
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

function parseWorkflowRows(markdown: string): WorkflowEvidenceRow[] {
  return parseTableBetween(markdown, '## CI Workflow Evidence', '## Reproducibility Decisions').map(row => {
    if (row.length !== 3) throw new Error(`Malformed CI Workflow Evidence row: ${row.join(' | ')}`);
    return { requirement: row[0], workflowEvidence: row[1], status: row[2] };
  });
}

function parseDecisionRows(markdown: string): ReproducibilityDecisionRow[] {
  return parseTableBetween(markdown, '## Reproducibility Decisions', '## Publication Decision').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Reproducibility Decisions row: ${row.join(' | ')}`);
    return {
      decision: row[0],
      requiredEvidence: row[1],
      publicationImpact: row[2],
      status: row[3],
    };
  });
}

function parsePublicationDecision(markdown: string): Partial<PublicationDecisionFields> {
  const fields = parseTwoColumnTable(sectionBetween(markdown, '## Publication Decision', '## Reviewer Sign-Off'));
  return {
    cleanCheckoutCiGreen: fields.get('Clean checkout CI green'),
    releaseSupported: fields.get('Release supported'),
    productionReadyClaimAllowed: fields.get('Production-ready claim allowed'),
    testnetProductionCandidateClaimAllowed: fields.get('Testnet production-candidate claim allowed'),
    releaseGateStructuralIssues: fields.get('Release gate structural issues'),
    releaseNotesUpdated: fields.get('Release notes updated'),
    requiredReleaseNoteUpdates: fields.get('Required release-note updates'),
    requiredChecklistUpdates: fields.get('Required checklist updates'),
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
  const section = sectionBetween(markdown, '## Run Classification', '## Required Commands');
  const fields = parseTwoColumnTable(section);
  const errors = validateDuplicateRequiredFields(
    'Run Classification',
    parseTwoColumnFieldNames(section),
    REQUIRED_CLASSIFICATION_FIELDS,
  );

  for (const field of REQUIRED_CLASSIFICATION_FIELDS) {
    if (isBlank(fields.get(field) ?? '')) errors.push(`Run Classification: ${field} is required`);
  }

  validateAllowedField(errors, fields, 'Run Classification', 'Release level', ALLOWED_RELEASE_LEVELS);
  validateAllowedField(errors, fields, 'Run Classification', 'CI provider', ALLOWED_CI_PROVIDERS);
  validateGitCommitField(errors, fields, 'Run Classification', 'Git commit');
  validateIsoDateField(errors, fields, 'Run Classification', 'Date');

  return errors;
}

function parseRunClassification(markdown: string): CleanCheckoutRunClassification {
  const fields = parseTwoColumnTable(sectionBetween(markdown, '## Run Classification', '## Required Commands'));
  return {
    evidenceName: fields.get('Evidence name') ?? '',
    gitCommit: fields.get('Git commit') ?? '',
    branch: fields.get('Branch') ?? '',
    releaseLevel: fields.get('Release level') ?? '',
    ciProvider: fields.get('CI provider') ?? '',
    workflow: fields.get('Workflow') ?? '',
    nodeVersion: fields.get('Node version') ?? '',
    rustTarget: fields.get('Rust target') ?? '',
    wasmPackVersion: fields.get('wasm-pack version') ?? '',
    reviewer: fields.get('Reviewer') ?? '',
    date: fields.get('Date') ?? '',
  };
}

function validatePublicationDecision(
  fields: Partial<PublicationDecisionFields>,
  markdown: string,
): string[] {
  const publicationSection = sectionBetween(markdown, '## Publication Decision', '## Reviewer Sign-Off');
  const rawFields = parseTwoColumnTable(publicationSection);
  const releaseLevel = parseTwoColumnTable(
    sectionBetween(markdown, '## Run Classification', '## Required Commands'),
  ).get('Release level') ?? '';
  const errors = validateDuplicateRequiredFields(
    'Publication Decision',
    parseTwoColumnFieldNames(publicationSection),
    REQUIRED_PUBLICATION_DECISION_FIELDS,
  );

  for (const field of REQUIRED_PUBLICATION_DECISION_FIELDS) {
    if (isBlank(rawFields.get(field) ?? '')) errors.push(`Publication Decision: ${field} is required`);
  }

  validateAllowedField(errors, rawFields, 'Publication Decision', 'Clean checkout CI green', ALLOWED_YES_NO);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Release supported', ALLOWED_RELEASE_SUPPORT);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Production-ready claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Testnet production-candidate claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Release notes updated', ALLOWED_YES_NO);

  if (fields.cleanCheckoutCiGreen === 'no') {
    errors.push('Publication Decision: clean checkout CI must be green before Gate 1 evidence can pass');
  }
  if (!isBlank(fields.releaseGateStructuralIssues ?? '') && !isExactZero(fields.releaseGateStructuralIssues ?? '')) {
    errors.push('Publication Decision: release gate structural issues must be 0 before Gate 1 evidence can pass');
  }
  if (
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !isActionableReviewerDecisionSummary(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must mention release support, clean checkout CI green, production-ready claim handling, testnet production-candidate claim handling, and release gate structural issues',
    );
  }
  if (
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    usesNumericReleaseGateStructuralIssueClosure(fields.reviewerDecisionSummary ?? '') &&
    !hasExactReleaseGateStructuralIssuesBinding(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must use exact Release gate structural issues = 0',
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
      `Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = ${fields.testnetProductionCandidateClaimAllowed}`,
    );
  }
  if (
    fields.productionReadyClaimAllowed === 'no' &&
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !hasExactProductionReadyClaimDeniedBinding(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
  }
  if (
    !isBlank(fields.releaseSupported ?? '') &&
    fields.releaseSupported !== 'none' &&
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !hasExactReleaseSupportedBinding(fields.reviewerDecisionSummary ?? '', fields.releaseSupported ?? '')
  ) {
    errors.push(
      `Publication Decision: Reviewer decision summary must use exact Release supported = ${fields.releaseSupported}`,
    );
  }
  if (!isBlank(fields.reviewerDecisionSummary ?? '') && approvesFailedCleanCheckoutCi(fields.reviewerDecisionSummary ?? '')) {
    errors.push('Publication Decision: Reviewer decision summary must not approve failed CI');
  }
  if (!isBlank(fields.reviewerDecisionSummary ?? '') && approvesReleaseGateStructuralIssues(fields.reviewerDecisionSummary ?? '')) {
    errors.push('Publication Decision: Reviewer decision summary must not approve release gate structural issues');
  }
  if (!isBlank(fields.reviewerDecisionSummary ?? '') && leavesReleaseGateStructuralIssuesOpen(fields.reviewerDecisionSummary ?? '')) {
    errors.push('Publication Decision: Reviewer decision summary must not leave release gate structural issues open');
  }
  if (
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    hasContradictoryCleanCheckoutDecisionBinding(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push('Publication Decision: Reviewer decision summary must not include contradictory clean-checkout decision bindings');
  }
  errors.push(
    ...validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary: fields.reviewerDecisionSummary ?? '',
      releaseSupported: fields.releaseSupported,
      productionReadyClaimAllowed: fields.productionReadyClaimAllowed,
      testnetProductionCandidateClaimAllowed: fields.testnetProductionCandidateClaimAllowed,
    }),
  );
  if (fields.releaseSupported === 'none') {
    errors.push('Publication Decision: Release supported must not be none before Gate 1 evidence can pass');
  }
  if (
    fields.releaseSupported !== 'none' &&
    releaseExceedsRunLevel(fields.releaseSupported ?? '', releaseLevel)
  ) {
    errors.push('Publication Decision: Release supported must not exceed Run Classification release level');
  }
  if (releaseLevel === 'production deployment candidate' && fields.releaseSupported !== 'production deployment candidate') {
    errors.push(
      'Publication Decision: production deployment candidate clean checkout requires exact Release supported = production deployment candidate',
    );
  }
  if (fields.productionReadyClaimAllowed === 'yes') {
    errors.push('Publication Decision: clean checkout evidence cannot allow production-ready claims');
  }
  if (
    fields.releaseSupported === 'production deployment candidate' &&
    fields.testnetProductionCandidateClaimAllowed !== 'yes'
  ) {
    errors.push('Publication Decision: production deployment candidate support requires exact Testnet production-candidate claim allowed = yes');
  }
  if (
    fields.testnetProductionCandidateClaimAllowed === 'yes' &&
    fields.releaseSupported !== 'production deployment candidate'
  ) {
    errors.push('Publication Decision: testnet production-candidate claim requires production deployment candidate support');
  }
  if (fields.releaseNotesUpdated === 'no') {
    errors.push('Publication Decision: release notes must be updated before Gate 1 evidence can pass');
  }
  validatePublicationUpdateEvidence(
    errors,
    'Required release-note updates',
    fields.requiredReleaseNoteUpdates ?? '',
    'completed Gate 1 release-note update evidence',
  );
  validatePublicationUpdateClaimBindings(
    errors,
    'Required release-note updates',
    fields.requiredReleaseNoteUpdates ?? '',
    fields,
  );
  validatePublicationUpdateEvidence(
    errors,
    'Required checklist updates',
    fields.requiredChecklistUpdates ?? '',
    'completed Gate 1 checklist update evidence',
  );
  validatePublicationUpdateClaimBindings(
    errors,
    'Required checklist updates',
    fields.requiredChecklistUpdates ?? '',
    fields,
  );
  if (
    hasCompletedCleanCheckoutReleaseNoteUpdateEvidence(fields.requiredReleaseNoteUpdates ?? '') &&
    hasCompletedCleanCheckoutChecklistUpdateEvidence(fields.requiredChecklistUpdates ?? '') &&
    haveSharedConcretePublicationEvidenceTarget(
      fields.requiredReleaseNoteUpdates ?? '',
      fields.requiredChecklistUpdates ?? '',
    )
  ) {
    errors.push(
      'Publication Decision: Required release-note updates and Required checklist updates must use distinct completed Gate 1 evidence targets',
    );
  }

  return errors;
}

function validatePublicationUpdateEvidence(
  errors: string[],
  field: string,
  value: string,
  evidenceKind: string,
): void {
  if (isBlank(value)) return;

  if (!hasEvidenceMarker(value)) {
    errors.push(`Publication Decision: ${field} must include a link, command, or artifact marker`);
    return;
  }
  if (!hasCompletedEvidenceTarget(value)) {
    errors.push(
      `Publication Decision: ${field} must include ${evidenceKind} with a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence`,
    );
  }
  if (!identifiesPublicationEvidenceKind(value, evidenceKind)) {
    errors.push(`Publication Decision: ${field} must identify ${evidenceKind}`);
  }
  if (!hasNoContradictoryCleanCheckoutEvidenceMarker(value)) {
    errors.push(`Publication Decision: ${field} must not include contradictory clean-checkout failure markers`);
  }
  if (hasContradictoryCleanCheckoutDecisionBinding(value)) {
    errors.push(`Publication Decision: ${field} must not include contradictory clean-checkout decision bindings`);
  }
  if (containsMainnetProductionClaim(value)) {
    errors.push(`Publication Decision: ${field} must not contain mainnet production claim wording`);
  }
  if (containsProductionReadyClaim(value)) {
    errors.push(`Publication Decision: ${field} must not contain production-ready claim wording`);
  }
  if (usesNonExactReleaseGateStructuralIssueClosure(value)) {
    errors.push(
      `Publication Decision: ${field} must use exact numeric Release gate structural issues = 0; textual or shorthand structural issue terms are not accepted`,
    );
  }
}

function validatePublicationUpdateClaimBindings(
  errors: string[],
  field: string,
  value: string,
  fields: Partial<PublicationDecisionFields>,
): void {
  if (isBlank(value)) return;

  if (
    fields.releaseSupported === 'production deployment candidate' &&
    !hasExactProductionCandidateReleaseSupportedBinding(value)
  ) {
    errors.push(
      `Publication Decision: ${field} must use exact Release supported = production deployment candidate`,
    );
  }
  if (
    (fields.testnetProductionCandidateClaimAllowed === 'yes' ||
      fields.testnetProductionCandidateClaimAllowed === 'no') &&
    !hasExactTestnetProductionCandidateClaimAllowedBinding(
      value,
      fields.testnetProductionCandidateClaimAllowed,
    )
  ) {
    errors.push(
      `Publication Decision: ${field} must use exact Testnet production-candidate claim allowed = ${fields.testnetProductionCandidateClaimAllowed}`,
    );
  }
  if (
    fields.productionReadyClaimAllowed === 'no' &&
    !hasExactProductionReadyClaimDeniedBinding(value)
  ) {
    errors.push(
      `Publication Decision: ${field} must use exact Production-ready claim allowed = no`,
    );
  }
  if (
    fields.releaseGateStructuralIssues === '0' &&
    !hasExactReleaseGateStructuralIssuesBinding(value)
  ) {
    errors.push(
      `Publication Decision: ${field} must use exact Release gate structural issues = 0`,
    );
  }
}

function releaseExceedsRunLevel(releaseSupported: string, releaseLevel: string): boolean {
  const supportedRank = RELEASE_LEVEL_RANK.get(releaseSupported);
  const runRank = RELEASE_LEVEL_RANK.get(releaseLevel);
  if (supportedRank === undefined || runRank === undefined) return false;
  return supportedRank > runRank;
}

function validateCommandRows(rows: CleanCheckoutCommandRow[]): string[] {
  const errors = validateRequiredNames('Required Commands', rows.map(row => row.command), REQUIRED_CLEAN_CHECKOUT_COMMANDS);

  for (const row of rows) {
    if (!REQUIRED_CLEAN_CHECKOUT_COMMANDS.includes(row.command)) errors.push(`Required Commands: ${row.command}: unexpected command`);
    validateLinkedStatus(errors, 'Required Commands', row.command, row.status);
    if (isBlank(row.expectedResult)) errors.push(`Required Commands: ${row.command}: expected result is required`);
    const expectedResult = REQUIRED_COMMAND_EXPECTED_RESULTS[row.command];
    if (
      expectedResult &&
      !isBlank(row.expectedResult) &&
      !expectedResult.pattern.test(row.expectedResult.trim())
    ) {
      errors.push(
        `Required Commands: ${row.command}: expected result must state ${expectedResult.message}`,
      );
    }
    if (row.status === 'linked' && !hasEvidenceMarker(row.evidence)) {
      errors.push(`Required Commands: ${row.command}: linked status requires an evidence marker`);
    }
    if (row.status === 'linked' && !hasCompletedEvidenceTarget(row.evidence)) {
      errors.push(
        `Required Commands: ${row.command}: linked status requires a completed artifact marker or non-template evidence link`,
      );
    }
    if (row.status === 'linked' && !commandEvidenceIdentifiesCommand(row.command, row.evidence)) {
      errors.push(`Required Commands: ${row.command}: evidence must identify ${row.command} output`);
    }
    if (
      row.status === 'linked' &&
      !hasNoContradictoryCleanCheckoutCommandEvidenceMarker(row.command, row.expectedResult, row.evidence)
    ) {
      if (isPassExpectedResult(row.expectedResult)) {
        errors.push(`Required Commands: ${row.command}: evidence must contain internally positive pass, passed, or ok output`);
      } else {
        errors.push(`Required Commands: ${row.command}: evidence must not include contradictory clean-checkout failure markers`);
      }
    }
  }

  return errors;
}

function validateWorkflowRows(rows: WorkflowEvidenceRow[]): string[] {
  const errors = validateRequiredNames('CI Workflow Evidence', rows.map(row => row.requirement), REQUIRED_CLEAN_CHECKOUT_WORKFLOW_REQUIREMENTS);

  for (const row of rows) {
    if (!REQUIRED_CLEAN_CHECKOUT_WORKFLOW_REQUIREMENTS.includes(row.requirement)) {
      errors.push(`CI Workflow Evidence: ${row.requirement}: unexpected requirement`);
    }
    validateLinkedStatus(errors, 'CI Workflow Evidence', row.requirement, row.status);
    if (row.status === 'linked' && !hasEvidenceMarker(row.workflowEvidence)) {
      errors.push(`CI Workflow Evidence: ${row.requirement}: linked status requires an evidence marker`);
    }
    if (row.status === 'linked' && !hasCompletedEvidenceTarget(row.workflowEvidence)) {
      errors.push(
        `CI Workflow Evidence: ${row.requirement}: linked status requires a completed artifact marker or non-template evidence link`,
      );
    }
    if (row.status === 'linked' && !hasNoContradictoryCleanCheckoutEvidenceMarker(row.workflowEvidence)) {
      errors.push(
        `CI Workflow Evidence: ${row.requirement}: workflow evidence must not include contradictory clean-checkout failure markers`,
      );
    }
  }

  return errors;
}

function validateWorkflowFacts(markdown: string, rows: WorkflowEvidenceRow[]): string[] {
  const errors: string[] = [];
  const classification = parseTwoColumnTable(sectionBetween(markdown, '## Run Classification', '## Required Commands'));
  const nodeVersion = classification.get('Node version') ?? '';
  const rustTarget = classification.get('Rust target') ?? '';
  const wasmPackVersion = classification.get('wasm-pack version') ?? '';

  for (const row of rows) {
    if (row.status !== 'linked') continue;
    const evidence = row.workflowEvidence;
    switch (row.requirement) {
      case 'Workflow file is tracked':
        if (!/\.github[\/\\]workflows[\/\\]relayer-checks\.yml|relayer-checks\.yml/i.test(evidence)) {
          errors.push('CI Workflow Evidence: Workflow file is tracked: workflow evidence must identify tracked relayer-checks workflow file');
        }
        break;
      case 'Node.js version is pinned':
        if (!/node(?:\.js)?/i.test(evidence) || (!isBlank(nodeVersion) && !new RegExp(`\\b${escapeRegExp(nodeVersion)}\\b`, 'i').test(evidence))) {
          errors.push('CI Workflow Evidence: Node.js version is pinned: workflow evidence must mention Run Classification Node version');
        }
        break;
      case 'npm cache uses relayer lockfile':
        if (!/cache/i.test(evidence) || !/(relayer[\/\\]package-lock\.json|package-lock\.json|lockfile)/i.test(evidence)) {
          errors.push('CI Workflow Evidence: npm cache uses relayer lockfile: workflow evidence must identify relayer package-lock cache key');
        }
        break;
      case 'Rust wasm target is installed':
        if (!isBlank(rustTarget) && !new RegExp(`\\b${escapeRegExp(rustTarget)}\\b`, 'i').test(evidence)) {
          errors.push('CI Workflow Evidence: Rust wasm target is installed: workflow evidence must mention Run Classification Rust target');
        }
        break;
      case 'wasm-pack version is pinned':
        if (!/wasm-pack/i.test(evidence) || (!isBlank(wasmPackVersion) && !new RegExp(`\\b${escapeRegExp(wasmPackVersion)}\\b`, 'i').test(evidence))) {
          errors.push('CI Workflow Evidence: wasm-pack version is pinned: workflow evidence must mention Run Classification wasm-pack version');
        }
        break;
      case 'npm ci runs before tests':
        if (!/npm ci/i.test(evidence) || !/\b(before|precedes|prior)\b/i.test(evidence)) {
          errors.push('CI Workflow Evidence: npm ci runs before tests: workflow evidence must show npm ci runs before tests');
        }
        break;
      case 'npm run check runs in CI':
        if (!/npm run check/i.test(evidence)) {
          errors.push('CI Workflow Evidence: npm run check runs in CI: workflow evidence must identify npm run check');
        }
        break;
      case 'npm run wasm:test runs in CI':
        if (!/npm run wasm:test/i.test(evidence)) {
          errors.push('CI Workflow Evidence: npm run wasm:test runs in CI: workflow evidence must identify npm run wasm:test');
        }
        break;
    }
  }

  return errors;
}

function validateFinalBranchCommitEvidence(markdown: string, rows: WorkflowEvidenceRow[]): string[] {
  const errors: string[] = [];
  const classification = parseTwoColumnTable(sectionBetween(markdown, '## Run Classification', '## Required Commands'));
  const branch = classification.get('Branch') ?? '';
  const commit = classification.get('Git commit') ?? '';
  const row = rows.find(candidate => candidate.requirement === 'Final branch commit is identified');
  if (!row || row.status !== 'linked') return errors;

  if (!isBlank(branch) && !row.workflowEvidence.includes(branch)) {
    errors.push('CI Workflow Evidence: Final branch commit is identified: workflow evidence must mention Run Classification Branch');
  }
  if (!isBlank(commit) && !new RegExp(`\\b${escapeRegExp(commit)}\\b`, 'i').test(row.workflowEvidence)) {
    errors.push('CI Workflow Evidence: Final branch commit is identified: workflow evidence must mention Run Classification Git commit');
  }

  return errors;
}

function validateDecisionRows(rows: ReproducibilityDecisionRow[]): string[] {
  const errors = validateRequiredNames('Reproducibility Decisions', rows.map(row => row.decision), REQUIRED_CLEAN_CHECKOUT_REPRODUCIBILITY_DECISIONS);

  for (const row of rows) {
    if (!REQUIRED_CLEAN_CHECKOUT_REPRODUCIBILITY_DECISIONS.includes(row.decision)) {
      errors.push(`Reproducibility Decisions: ${row.decision}: unexpected decision`);
    }
    validateLinkedStatus(errors, 'Reproducibility Decisions', row.decision, row.status);
    if (row.status === 'linked' && !hasEvidenceMarker(row.requiredEvidence)) {
      errors.push(`Reproducibility Decisions: ${row.decision}: linked status requires an evidence marker`);
    }
    if (row.status === 'linked' && !hasCompletedEvidenceTarget(row.requiredEvidence)) {
      errors.push(
        `Reproducibility Decisions: ${row.decision}: linked status requires a completed artifact marker or non-template evidence link`,
      );
    }
    if (row.status === 'linked') {
      for (const marker of REQUIRED_DECISION_EVIDENCE_MARKERS[row.decision] ?? []) {
        if (!marker.pattern.test(row.requiredEvidence)) {
          errors.push(`Reproducibility Decisions: ${row.decision}: ${marker.message}`);
        }
      }
      if (!hasNoContradictoryCleanCheckoutDecisionEvidenceMarker(row.decision, row.requiredEvidence)) {
        errors.push(
          `Reproducibility Decisions: ${row.decision}: required evidence must not include contradictory clean-checkout failure markers`,
        );
      }
    }
    if (isBlank(row.publicationImpact)) {
      errors.push(`Reproducibility Decisions: ${row.decision}: publication impact is required`);
    }
    const impactExpectation = REQUIRED_DECISION_PUBLICATION_IMPACTS[row.decision];
    if (
      impactExpectation &&
      !isBlank(row.publicationImpact) &&
      !impactExpectation.pattern.test(row.publicationImpact.trim())
    ) {
      errors.push(
        `Reproducibility Decisions: ${row.decision}: publication impact must state ${impactExpectation.message}`,
      );
    }
  }

  return errors;
}

function validateReviewerRows(rows: ReviewerSignoffRow[]): string[] {
  const errors = validateRequiredNames('Reviewer Sign-Off', rows.map(row => row.role), REQUIRED_CLEAN_CHECKOUT_REVIEWER_ROLES);

  for (const row of rows) {
    if (!REQUIRED_CLEAN_CHECKOUT_REVIEWER_ROLES.includes(row.role)) errors.push(`Reviewer Sign-Off: ${row.role}: unexpected role`);
    if (isBlank(row.name)) errors.push(`Reviewer Sign-Off: ${row.role}: name is required`);
    if (!ALLOWED_REVIEWER_DECISIONS.has(row.decision as ReviewerDecision)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve or block`);
    } else if (row.decision !== 'approve') {
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve before Gate 1 evidence can pass`);
    }
    if (isBlank(row.date)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: Date must use YYYY-MM-DD`);
    }
    if (isBlank(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes are required`);
    } else if (approvesFailedCleanCheckoutCi(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve failed CI`);
    } else if (!hasNoContradictoryCleanCheckoutReviewerNoteMarker(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not include contradictory clean-checkout failure markers`);
    } else if (approvesProductionReadyCleanCheckoutClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve production-ready claim wording`);
    } else if (approvesMainnetDeploymentClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve mainnet deployment claims`);
    } else if (containsMainnetProductionClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not contain mainnet production claim wording`);
    } else if (containsProductionReadyClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not contain production-ready claim wording`);
    } else if (approvesReleaseGateStructuralIssues(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve release gate structural issues`);
    } else if (leavesReleaseGateStructuralIssuesOpen(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not leave release gate structural issues open`);
    } else if (!isActionableReviewerNote(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must state a concrete clean-checkout outcome`);
    }
  }

  return errors;
}

function validateReviewerIdentityConsistency(markdown: string, rows: ReviewerSignoffRow[]): string[] {
  const classification = parseTwoColumnTable(
    sectionBetween(markdown, '## Run Classification', '## Required Commands'),
  );
  const classifiedReviewer = classification.get('Reviewer')?.trim() ?? '';
  const ciReviewerSignoff = rows.find(row => row.role === 'CI reviewer')?.name.trim() ?? '';

  if (
    classifiedReviewer.length > 0 &&
    ciReviewerSignoff.length > 0 &&
    classifiedReviewer !== ciReviewerSignoff
  ) {
    return ['Reviewer Sign-Off: CI reviewer: name must match Run Classification Reviewer'];
  }

  return [];
}

function validateReviewerDateConsistency(markdown: string, rows: ReviewerSignoffRow[]): string[] {
  const classification = parseTwoColumnTable(
    sectionBetween(markdown, '## Run Classification', '## Required Commands'),
  );
  const classificationDate = classification.get('Date')?.trim() ?? '';
  if (!isIsoCalendarDate(classificationDate)) return [];

  return rows
    .filter(row => isIsoCalendarDate(row.date) && row.date < classificationDate)
    .map(row => `Reviewer Sign-Off: ${row.role}: Date must not be before Run Classification Date`);
}

function validateLinkedStatus(errors: string[], section: string, label: string, status: string): void {
  if (!ALLOWED_STATUSES.has(status as CleanCheckoutEvidenceStatus)) {
    errors.push(`${section}: ${label}: status must be pending, linked, or blocker`);
    return;
  }
  if (status !== 'linked') {
    errors.push(`${section}: ${label}: status must be linked before Gate 1 evidence can pass`);
  }
}

export function hasCleanCheckoutCommandExpectedResult(command: string, expectedResult: string): boolean {
  const expectation = REQUIRED_COMMAND_EXPECTED_RESULTS[command];
  return Boolean(expectation) && expectation.pattern.test(expectedResult.trim());
}

export function hasCompletedCleanCheckoutCommandEvidence(command: string, evidence: string): boolean {
  return hasCompletedEvidenceTarget(evidence) && commandEvidenceIdentifiesCommand(command, evidence);
}

export function hasNoContradictoryCleanCheckoutCommandEvidenceMarker(
  command: string,
  expectedResult: string,
  evidence: string,
): boolean {
  if (command === 'npm run release:gate' && hasCleanCheckoutCommandExpectedResult(command, expectedResult)) {
    return !hasContradictoryCleanCheckoutReleaseGateZeroStructuralEvidenceMarker(evidence);
  }

  return !hasContradictoryValidationFailureMarker(evidence);
}

export function hasCompletedCleanCheckoutReleaseNoteUpdateEvidence(value: string): boolean {
  return (
    hasCompletedEvidenceTarget(value) &&
    identifiesPublicationEvidenceKind(value, 'completed Gate 1 release-note update evidence') &&
    hasNoContradictoryCleanCheckoutEvidenceMarker(value) &&
    !hasContradictoryCleanCheckoutDecisionBinding(value)
  );
}

export function hasCompletedCleanCheckoutChecklistUpdateEvidence(value: string): boolean {
  return (
    hasCompletedEvidenceTarget(value) &&
    identifiesPublicationEvidenceKind(value, 'completed Gate 1 checklist update evidence') &&
    hasNoContradictoryCleanCheckoutEvidenceMarker(value) &&
    !hasContradictoryCleanCheckoutDecisionBinding(value)
  );
}

export function hasNoContradictoryCleanCheckoutEvidenceMarker(value: string): boolean {
  return !hasContradictoryValidationFailureMarker(value);
}

export function hasNoContradictoryCleanCheckoutDecisionEvidenceMarker(decision: string, value: string): boolean {
  if (decision === 'Release gate has zero structural issues') {
    return !hasContradictoryCleanCheckoutReleaseGateZeroStructuralEvidenceMarker(value);
  }

  return hasNoContradictoryCleanCheckoutEvidenceMarker(value);
}

export function hasNoContradictoryCleanCheckoutReviewerNoteMarker(value: string): boolean {
  return !hasContradictoryCleanCheckoutReviewerNoteMarker(value);
}

function hasContradictoryCleanCheckoutDecisionBinding(value: string): boolean {
  return (
    hasMixedCleanCheckoutReleaseSupportBindings(value) ||
    hasOpposingCleanCheckoutBinaryDecisionBindings(value, 'Production-ready claim allowed') ||
    hasOpposingCleanCheckoutBinaryDecisionBindings(value, 'Testnet production-candidate claim allowed') ||
    hasMixedCleanCheckoutZeroAndNonzeroBindings(value, 'Release gate structural issues')
  );
}

function hasMixedCleanCheckoutReleaseSupportBindings(value: string): boolean {
  const values = exactCleanCheckoutDecisionBindingValues(
    value,
    'Release supported',
    'none|validated\\s+PoC|institutional\\s+reference|production\\s+deployment\\s+candidate',
  );
  return values.size > 1;
}

function hasOpposingCleanCheckoutBinaryDecisionBindings(value: string, field: string): boolean {
  const values = exactCleanCheckoutDecisionBindingValues(value, field, 'yes|no');
  return values.has('yes') && values.has('no');
}

function hasMixedCleanCheckoutZeroAndNonzeroBindings(value: string, field: string): boolean {
  const values = [...exactCleanCheckoutDecisionBindingValues(value, field, '\\d+')].map(Number);
  return values.some(count => count === 0) && values.some(count => count > 0);
}

function exactCleanCheckoutDecisionBindingValues(value: string, field: string, valuePattern: string): Set<string> {
  const pattern = new RegExp(
    `\\b${field.split(/[- ]+/).map(escapeRegExp).join('[- ]+')}\\s*=\\s*(${valuePattern})\\s*(?:$|[.;,|)\\]\\r\\n])`,
    'ig',
  );
  return new Set([...value.matchAll(pattern)].map(match => match[1].toLowerCase().replace(/\s+/g, ' ')));
}

function isPassExpectedResult(expectedResult: string): boolean {
  return /^(pass|passed|ok)$/i.test(expectedResult.trim());
}

function hasContradictoryValidationFailureMarker(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);
  return (
    /(?:^|[^A-Za-z0-9_-])FAIL(?:$|[^A-Za-z0-9_-])/i.test(normalized) ||
    /\b(?:status|result|validation|validator|command|outcome)\s*[:=]?\s*FAILED\b/i.test(normalized) ||
    /\bFAILED\b\s+(?:validation|validator|command|run|result|status)\b/i.test(normalized) ||
    /\bBLOCKED\b/i.test(normalized) ||
    /\bERROR\b/i.test(normalized) ||
    hasAmbiguousCleanCheckoutExitCode(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized) ||
    hasUnresolvedIssueMarker(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\b[1-9]\d*\s+structural\s+issues?\b/i.test(normalized)
  );
}

function hasContradictoryCleanCheckoutReleaseGateZeroStructuralEvidenceMarker(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);
  return (
    /(?:^|[^A-Za-z0-9_-])FAIL(?:$|[^A-Za-z0-9_-])/i.test(normalized) ||
    /\b(?:status|result|validation|validator|command|outcome)\s*[:=]?\s*FAILED\b/i.test(normalized) ||
    /\bFAILED\b\s+(?:validation|validator|command|run|result|status)\b/i.test(normalized) ||
    /\bERROR\b/i.test(normalized) ||
    hasAmbiguousCleanCheckoutExitCode(normalized) ||
    /\bexit\s+code\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized) ||
    hasUnresolvedIssueMarker(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\b[1-9]\d*\s+structural\s+issues?\b/i.test(normalized)
  );
}

function hasContradictoryCleanCheckoutReviewerNoteMarker(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);
  return (
    /(?:^|[^A-Za-z0-9_-])FAIL(?:$|[^A-Za-z0-9_-])/i.test(normalized) ||
    /\b(?:status|result|validation|validator|command|outcome|CI run|workflow run)\s*[:=]?\s*FAILED\b/i.test(normalized) ||
    /\bFAILED\b\s+(?:validation|validator|command|run|result|status|CI|workflow)\b/i.test(normalized) ||
    /\b(?:validation|validator|command|CI run|workflow run|npm run [^;|]+|release:gate|release gate)\b.{0,60}\bBLOCKED\b/i.test(normalized) ||
    /\bERROR\b/i.test(normalized) ||
    hasAmbiguousCleanCheckoutExitCode(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized) ||
    hasUnresolvedIssueMarker(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\b[1-9]\d*\s+structural\s+issues?\b/i.test(normalized)
  );
}

function hasAmbiguousCleanCheckoutExitCode(value: string): boolean {
  return /\bexit[- ]?code\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value);
}

export function hasCompletedCleanCheckoutWorkflowEvidence(
  requirement: string,
  workflowEvidence: string,
  classification: Partial<CleanCheckoutRunClassification> = {},
): boolean {
  if (
    !hasCompletedEvidenceTarget(workflowEvidence) ||
    !hasNoContradictoryCleanCheckoutEvidenceMarker(workflowEvidence)
  ) return false;

  switch (requirement) {
    case 'Workflow file is tracked':
      return /\.github[\/\\]workflows[\/\\]relayer-checks\.yml|relayer-checks\.yml/i.test(workflowEvidence);
    case 'Node.js version is pinned':
      return (
        /node(?:\.js)?/i.test(workflowEvidence) &&
        (isBlank(classification.nodeVersion ?? '') ||
          new RegExp(`\\b${escapeRegExp(classification.nodeVersion ?? '')}\\b`, 'i').test(workflowEvidence))
      );
    case 'npm cache uses relayer lockfile':
      return /cache/i.test(workflowEvidence) && /(relayer[\/\\]package-lock\.json|package-lock\.json|lockfile)/i.test(workflowEvidence);
    case 'Rust wasm target is installed':
      return (
        isBlank(classification.rustTarget ?? '') ||
        new RegExp(`\\b${escapeRegExp(classification.rustTarget ?? '')}\\b`, 'i').test(workflowEvidence)
      );
    case 'wasm-pack version is pinned':
      return (
        /wasm-pack/i.test(workflowEvidence) &&
        (isBlank(classification.wasmPackVersion ?? '') ||
          new RegExp(`\\b${escapeRegExp(classification.wasmPackVersion ?? '')}\\b`, 'i').test(workflowEvidence))
      );
    case 'npm ci runs before tests':
      return /npm ci/i.test(workflowEvidence) && /\b(before|precedes|prior)\b/i.test(workflowEvidence);
    case 'npm run check runs in CI':
      return /npm run check/i.test(workflowEvidence);
    case 'npm run wasm:test runs in CI':
      return /npm run wasm:test/i.test(workflowEvidence);
    case 'Final branch commit is identified':
      return (
        (isBlank(classification.branch ?? '') || workflowEvidence.includes(classification.branch ?? '')) &&
        (isBlank(classification.gitCommit ?? '') ||
          new RegExp(`\\b${escapeRegExp(classification.gitCommit ?? '')}\\b`, 'i').test(workflowEvidence))
      );
    default:
      return false;
  }
}

export function hasCompletedCleanCheckoutDecisionEvidence(decision: string, requiredEvidence: string): boolean {
  return (
    hasCompletedEvidenceTarget(requiredEvidence) &&
    hasNoContradictoryCleanCheckoutDecisionEvidenceMarker(decision, requiredEvidence) &&
    (REQUIRED_DECISION_EVIDENCE_MARKERS[decision] ?? []).every(marker => marker.pattern.test(requiredEvidence))
  );
}

export function hasCleanCheckoutDecisionPublicationImpact(decision: string, publicationImpact: string): boolean {
  const expectation = REQUIRED_DECISION_PUBLICATION_IMPACTS[decision];
  return expectation ? expectation.pattern.test(publicationImpact.trim()) : !isBlank(publicationImpact);
}

export function isActionableCleanCheckoutReviewerNote(value: string): boolean {
  return hasNoContradictoryCleanCheckoutReviewerNoteMarker(value) && isActionableReviewerNote(value);
}

function isActionableReviewerNote(value: string): boolean {
  return (
    /\b(accept|accepted|approve|approved|verify|verified|validate|validated|confirm|confirmed|pass|passed|green|block|blocked|fail|failed|match|matched|complete|completed)\b/i.test(value) &&
    /\b(clean checkout|CI|workflow|npm ci|lockfile|WASM|wasm-pack|TypeScript|relayer test|Rust WASM|release gate|structural issue|git diff|secret scan|local path|runtime state|worktree|final branch|reproducibility)\b/i.test(value)
  );
}

function approvesFailedCleanCheckoutCi(value: string): boolean {
  return cleanCheckoutReviewerTextSegments(value).some(segment =>
    cleanCheckoutTextApprovesSubject(segment, FAILED_CLEAN_CHECKOUT_CI_SUBJECT_PATTERN)
  );
}

function approvesProductionReadyCleanCheckoutClaim(value: string): boolean {
  return (
    APPROVES_PRODUCTION_READY_CLEAN_CHECKOUT_CLAIM_PATTERN.test(value) &&
    !CLAIM_BLOCKED_PATTERN.test(value)
  );
}

function approvesMainnetDeploymentClaim(value: string): boolean {
  return (
    APPROVES_MAINNET_DEPLOYMENT_CLAIM_PATTERN.test(value) &&
    !CLAIM_BLOCKED_PATTERN.test(value)
  );
}

function containsMainnetProductionClaim(value: string): boolean {
  return classifyPublicationClaimText(value).hasMainnetProductionClaim;
}

function containsProductionReadyClaim(value: string): boolean {
  return classifyPublicationClaimText(value).hasProductionReadyClaim;
}

function approvesReleaseGateStructuralIssues(value: string): boolean {
  return cleanCheckoutReviewerTextSegments(value).some(segment =>
    !RELEASE_GATE_ZERO_STRUCTURAL_ISSUES_PATTERN.test(segment) &&
    cleanCheckoutTextApprovesSubject(segment, RELEASE_GATE_STRUCTURAL_ISSUES_SUBJECT_PATTERN)
  );
}

function leavesReleaseGateStructuralIssuesOpen(value: string): boolean {
  const subject = structuralIssueSubjectPattern();
  const unresolvedState = '(?:open|remaining|unresolved|outstanding|pending|awaiting|waiting(?:\\s+(?:for|on))?|deferred)';
  const closedState = '(?:0|zero|none|no|closed|resolved|mitigated)';

  return cleanCheckoutReviewerTextSegments(value).some(segment => {
    const normalized = normalizeDecisionSummary(segment);
    if (
      new RegExp(`\\b${subject}\\s+(?:are\\s+|remain\\s+|remains\\s+)?${closedState}\\b`).test(normalized) ||
      new RegExp(`\\b${closedState}\\s+(?:${unresolvedState}\\s+)?${subject}\\b`).test(normalized) ||
      new RegExp(
        `\\b${unresolvedState}\\s+${subject}\\b(?:\\s+[a-z0-9/-]+){0,3}\\s+not\\s+${REVIEWER_APPROVAL_VERB_PATTERN}\\b`,
      ).test(normalized)
    ) {
      return false;
    }

    return (
      new RegExp(
        `\\b${subject}\\s+(?:are\\s+|remain\\s+|remains\\s+)?${unresolvedState}\\b(?!\\s+${closedState}\\b)`,
      ).test(normalized) ||
      new RegExp(`\\b${unresolvedState}\\s+${subject}\\b`).test(normalized)
    );
  });
}

function cleanCheckoutTextApprovesSubject(value: string, subjectPattern: string): boolean {
  const normalized = normalizeDecisionSummary(value);
  return [
    new RegExp(
      `\\b${REVIEWER_APPROVAL_VERB_PATTERN}\\b${REVIEWER_APPROVAL_CONNECTOR_PATTERN}(?:${subjectPattern})\\b`,
      'g',
    ),
    new RegExp(
      `\\b(?:${subjectPattern})\\b${REVIEWER_APPROVAL_CONNECTOR_PATTERN}${REVIEWER_APPROVAL_VERB_PATTERN}\\b`,
      'g',
    ),
  ].some(pattern => hasUnnegatedCleanCheckoutReviewerApproval(normalized, pattern));
}

function hasUnnegatedCleanCheckoutReviewerApproval(normalized: string, pattern: RegExp): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 32), index);
    if (!REVIEWER_DENIAL_OR_BOUNDARY_PREFIX_PATTERN.test(prefix)) return true;
  }
  return false;
}

function cleanCheckoutReviewerTextSegments(value: string): string[] {
  return value
    .split(/[\n\r|;]+|[.]\s+/)
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0);
}

function isActionableReviewerDecisionSummary(value: string): boolean {
  const normalized = normalizeDecisionSummary(value);
  return (
    /\brelease supported\b/.test(normalized) &&
    /\bclean checkout ci green\b|\bci green\b|\bclean checkout green\b/.test(normalized) &&
    /\bproduction ready claim handling\b/.test(normalized) &&
    /\btestnet production candidate claim handling\b/.test(normalized) &&
    hasExactReleaseGateStructuralIssuesBinding(value)
  );
}

function normalizeDecisionSummary(value: string): string {
  return normalizeEvidenceMarkerText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasExactReleaseGateStructuralIssuesBinding(value: string): boolean {
  return /\bRelease gate structural issues\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactProductionCandidateReleaseSupportedBinding(value: string): boolean {
  return hasExactReleaseSupportedBinding(value, 'production deployment candidate');
}

function hasExactReleaseSupportedBinding(value: string, expected: string): boolean {
  return new RegExp(`\\bRelease supported\\s*=\\s*${escapeRegExp(expected)}\\s*(?:$|[.;,|)\\]\\r\\n])`, 'i').test(value);
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

function structuralIssueSubjectPattern(): string {
  return '(?:release gate\\s+)?structural issues?';
}

function usesTextualReleaseGateStructuralIssueClosure(value: string): boolean {
  const normalized = normalizeDecisionSummary(value);
  const subject = structuralIssueSubjectPattern();
  const textualClosure = '(?:zero|none|no|closed|resolved|n a)';
  return (
    new RegExp(`\\b${subject}\\s+(?:are\\s+)?${textualClosure}\\b`).test(normalized) ||
    new RegExp(`\\b${textualClosure}\\s+${subject}\\b`).test(normalized)
  );
}

function usesNumericReleaseGateStructuralIssueClosure(value: string): boolean {
  const normalized = normalizeDecisionSummary(value);
  const subject = structuralIssueSubjectPattern();
  return (
    new RegExp(`\\b${subject}\\s+0\\b`).test(normalized) ||
    new RegExp(`\\b${subject}\\s+(?:closure|count|handling)\\s+0\\b`).test(normalized) ||
    new RegExp(`\\b0\\s+${subject}\\b`).test(normalized)
  );
}

function usesNonExactReleaseGateStructuralIssueClosure(value: string): boolean {
  return (
    (usesTextualReleaseGateStructuralIssueClosure(value) || usesNumericReleaseGateStructuralIssueClosure(value)) &&
    !hasExactReleaseGateStructuralIssuesBinding(value)
  );
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

function hasCompletedEvidenceTarget(value: string): boolean {
  const completedEvidenceText = cleanCheckoutCompletedEvidenceText(value);
  return (
    !hasLocalOnlyEvidenceTarget(value) &&
    !hasRuntimeOrEnvironmentCleanCheckoutEvidenceTarget(value) &&
    !hasClaimEscalatingCleanCheckoutEvidenceReference(value) &&
    (hasCompletedArtifactTarget(completedEvidenceText) || hasNonTemplateMarkdownLink(completedEvidenceText))
  );
}

function findCleanCheckoutValidationTargetBinding(value: string): RegExpExecArray | null {
  return /\b(?:validated target|validated input|ci validate target|clean checkout validation target)\b/i
    .exec(value);
}

function hasCompletedArtifactTarget(value: string): boolean {
  return [...value.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+)/g)]
    .some(([, target]) =>
      !hasRuntimeOrEnvironmentCleanCheckoutEvidenceTarget(target) &&
      !hasClaimEscalatingCleanCheckoutEvidenceTarget(target) &&
      !hasNonConcreteEvidenceTargetSegment(target)
    );
}

function haveSharedConcretePublicationEvidenceTarget(left: string, right: string): boolean {
  const leftTargets = new Set(
    extractCompletedCleanCheckoutEvidenceTargets(left)
      .map(normalizePublicationEvidenceTarget)
      .filter(isConcretePublicationEvidenceTarget),
  );
  return extractCompletedCleanCheckoutEvidenceTargets(right)
    .map(normalizePublicationEvidenceTarget)
    .filter(isConcretePublicationEvidenceTarget)
    .some(target => leftTargets.has(target));
}

function extractPublicationEvidenceTargets(value: string): string[] {
  return [
    ...[...value.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+)/g)]
      .map(([, target]) => target),
    ...[...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
      .map(([, target]) => target.trim()),
  ];
}

function extractCompletedCleanCheckoutEvidenceTargets(value: string): string[] {
  return extractPublicationEvidenceTargets(cleanCheckoutCompletedEvidenceText(value));
}

function cleanCheckoutCompletedEvidenceText(value: string): string {
  return value
    .split(/[;\n]+/)
    .map(segment => {
      const targetBinding = findCleanCheckoutValidationTargetBinding(segment);
      return targetBinding
        ? segment.slice(0, targetBinding.index).trim()
        : segment.trim();
    })
    .filter(segment => segment.length > 0)
    .join('; ');
}

function normalizePublicationEvidenceTarget(target: string): string {
  return target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').trim().toLowerCase();
}

function hasClaimEscalatingCleanCheckoutEvidenceReference(value: string): boolean {
  return extractPublicationEvidenceTargets(value)
    .some(target => hasClaimEscalatingCleanCheckoutEvidenceTarget(target));
}

function hasClaimEscalatingCleanCheckoutEvidenceTarget(target: string): boolean {
  const claim = classifyPublicationClaimText(normalizePublicationEvidenceTarget(target));
  return claim.hasProductionClaim;
}

function isConcretePublicationEvidenceTarget(target: string): boolean {
  return target.length > 0 &&
    !isLocalOnlyEvidenceTarget(target) &&
    !hasRuntimeOrEnvironmentCleanCheckoutEvidenceTarget(target) &&
    !hasClaimEscalatingCleanCheckoutEvidenceTarget(target) &&
    !hasNonConcreteEvidenceTargetSegment(target);
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
  return extractPublicationEvidenceTargets(value)
    .some(target => normalizePublicationEvidenceTargetBasename(target) === expectedSlug);
}

function normalizePublicationEvidenceTargetBasename(target: string): string {
  const normalizedTarget = normalizePublicationEvidenceTarget(target).replace(/\\/g, '/');
  const basename = normalizedTarget.split('/').filter(Boolean).pop() ?? normalizedTarget;
  return stripConcretePublicationEvidenceKindQualifier(
    normalizeEvidenceKind(basename.replace(/\.[a-z0-9]+$/i, '')).replace(/\s+/g, '-'),
  );
}

function stripConcretePublicationEvidenceKindQualifier(slug: string): string {
  return slug.replace(/^(?:sample-size-analysis|template-removal-audit)-/, '');
}

function publicationEvidenceKindTextSegments(value: string): string[] {
  return value
    .split(/[;\n|]+/)
    .map(stripLeadingPublicationEvidenceTarget)
    .map(normalizeEvidenceKind)
    .filter(segment => segment.length > 0);
}

function stripLeadingPublicationEvidenceTarget(value: string): string {
  const trimmed = value.trim();
  const markdownMatch = /^\[[^\]]+\]\([^)]+\)/.exec(trimmed);
  if (markdownMatch) return trimmed.slice(markdownMatch[0].length).replace(/^[\s,.:;-]+/, '');

  const artifactMatch = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+/i.exec(trimmed);
  if (artifactMatch) return trimmed.slice(artifactMatch[0].length).replace(/^[\s,.:;-]+/, '');

  return trimmed;
}

function normalizeEvidenceKind(value: string): string {
  return normalizeEvidenceMarkerText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasNonTemplateMarkdownLink(value: string): boolean {
  const links = [...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
  return links.some(([, target]) =>
    !isLocalOnlyEvidenceTarget(target) &&
    !hasRuntimeOrEnvironmentCleanCheckoutEvidenceTarget(target) &&
    !hasClaimEscalatingCleanCheckoutEvidenceTarget(target) &&
    !/-template\.md(?:[#?].*)?$/i.test(target.trim()) &&
    !hasNonConcreteEvidenceTargetSegment(target),
  );
}

function hasRuntimeOrEnvironmentCleanCheckoutEvidenceTarget(target: string): boolean {
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized)
    .map(normalizeCleanCheckoutEvidenceInspectionTarget)
    .some(isRuntimeOrEnvironmentCleanCheckoutEvidenceInspectionTarget);
}

function normalizeCleanCheckoutEvidenceInspectionTarget(normalizedTarget: string): string {
  const artifactTarget = /^artifact:\/\/[a-z0-9][a-z0-9._-]*\/(.+)$/i.exec(normalizedTarget);
  return artifactTarget ? artifactTarget[1] : normalizedTarget;
}

function isRuntimeOrEnvironmentCleanCheckoutEvidenceInspectionTarget(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasCleanCheckoutEnvironmentTargetSegment(normalizedTarget) ||
    hasCleanCheckoutRuntimeDatabaseTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
  );
}

function hasCleanCheckoutEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasCleanCheckoutRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
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
  const normalized = value.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').toLowerCase();
  return (
    /(?:^|[\/_.-])(?:placeholder|generic|todo|tbd)(?:[\/_.-]|$)/i.test(normalized) ||
    /(?:^|[\/_.-])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[\/_.-]|$)/i.test(normalized) ||
    /(?:^|[\/_.-])(?:sample|example)[-_ ]*evidence(?:[\/_.-]|$)/i.test(normalized) ||
    /(?:^|[\/_.-])(?:sample|example|template)[-_ ]*(?:clean|checkout|ci|workflow|command|decision|npm|wasm|rust|lockfile|release|note|notes|checklist|gate|branch|commit|structural)(?:[\/_.-]|$)/i.test(normalized)
  );
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

function isExactZero(value: string): boolean {
  return value.trim() === '0';
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
