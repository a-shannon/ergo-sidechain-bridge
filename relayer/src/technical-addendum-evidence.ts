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

export interface ArchitectureGateRow {
  gate: string;
  requiredEvidence: string;
  artifact: string;
  status: string;
  claimBoundary: string;
}

export interface ArchitectureDecisionRow {
  decision: string;
  requiredPosition: string;
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

export interface TechnicalAddendumClassificationFields {
  manualName: string;
  gitCommit: string;
  releaseLevel: string;
  environment: string;
  claimWording: string;
  architectureOwner: string;
  reviewer: string;
  date: string;
}

export interface TechnicalAddendumPublicationDecisionFields {
  manualUseStatus: string;
  releaseSupported: string;
  releaseGateStatus: string;
  productionReadyClaimAllowed: string;
  mainnetDeploymentClaimAllowed: string;
  testnetProductionCandidateClaimAllowed: string;
  releaseNotesUpdated: string;
  requiredReleaseNoteUpdates: string;
  requiredChecklistUpdates: string;
  reviewerDecisionSummary: string;
}

export interface TechnicalAddendumClaimBoundaryFields {
  productionReadyClaimsAllowed: string;
  mainnetDeploymentClaimsAllowed: string;
  testnetProductionCandidateWordingAllowed: string;
  productionGradeTestnetWordingAllowed: string;
  releaseGateRequiredBeforePublicClaim: string;
  evidenceCompletenessRequired: string;
}

export interface TechnicalAddendumEvidenceValidation {
  status: 'PASS' | 'BLOCKED';
  classification: Partial<TechnicalAddendumClassificationFields>;
  claimBoundary: Partial<TechnicalAddendumClaimBoundaryFields>;
  publicationDecision: Partial<TechnicalAddendumPublicationDecisionFields>;
  gateRows: ArchitectureGateRow[];
  decisionRows: ArchitectureDecisionRow[];
  reviewerRows: ReviewerSignoffRow[];
  errors: string[];
  message: string;
}

interface ParsedRows<T> {
  rows: T[];
  errors: string[];
}

const REQUIRED_SECTIONS = [
  '## Manual Classification',
  '## Architecture Scope',
  '## Claim Boundary',
  '## Evidence Gate Map',
  '## Architecture Decision Record',
  '## Security Boundary',
  '## Operational Boundary',
  '## Publication Decision',
  '## Reviewer Sign-Off',
];

const REQUIRED_CLASSIFICATION_FIELDS = [
  'Manual name',
  'Git commit',
  'Release level',
  'Environment',
  'Claim wording',
  'Architecture owner',
  'Reviewer',
  'Date',
];

const REQUIRED_CLAIM_BOUNDARY_FIELDS = [
  'Production-ready claims allowed',
  'Mainnet deployment claims allowed',
  'Testnet production-candidate wording allowed',
  'Production-grade testnet wording allowed',
  'Release gate required before public claim',
  'Evidence completeness required',
];

const REQUIRED_PUBLICATION_FIELDS = [
  'Manual use status',
  'Release supported',
  'Release gate status',
  'Production-ready claim allowed',
  'Mainnet deployment claim allowed',
  'Testnet production-candidate claim allowed',
  'Release notes updated',
  'Required release-note updates',
  'Required checklist updates',
  'Reviewer decision summary',
];

export const REQUIRED_TECHNICAL_ADDENDUM_GATE_ROWS = [
  'Clean checkout CI',
  'Fresh testnet lifecycle',
  'Upstream signer conformance',
  'Trustless burn verification',
  'Committee governance',
  'Operator readiness',
  'Benchmark and scaling evidence',
  'Independent security review',
  'External integration review',
  'Release notes',
];

export const REQUIRED_TECHNICAL_ADDENDUM_DECISIONS = [
  'What release level does this manual describe?',
  'Which signer path is allowed?',
  'What blocks mainnet production-ready claims?',
  'What must pass before testnet production-candidate wording?',
  'Which trustless-burn limitation remains?',
  'How is live broadcast authorized?',
  'How are recovery and rollback evidenced?',
  'How are benchmark and scaling claims bounded?',
];

export const REQUIRED_TECHNICAL_ADDENDUM_REVIEWER_ROLES = [
  'Architecture owner',
  'Security reviewer',
  'Operator reviewer',
];

export const TECHNICAL_ADDENDUM_RELEASE_GATE_DECISION =
  'What must pass before testnet production-candidate wording?';

const ALLOWED_RELEASE_LEVELS = ['validated PoC', 'institutional reference', 'production deployment candidate'];
const ALLOWED_ENVIRONMENTS = ['local devnet', 'patched devnet', 'testnet'];
const ALLOWED_MANUAL_USE = ['draft', 'validated internal reference', 'candidate claim support'];
const ALLOWED_RELEASE_GATE_STATUS = ['blocked', 'pass'];
const ALLOWED_RELEASE_SUPPORT = ['none', 'institutional reference', 'production deployment candidate'];
const ALLOWED_YES_NO = ['yes', 'no'];
const ALLOWED_TESTNET_CLAIM = ['no', 'yes-after-release-gate-pass'];

const TECHNICAL_ADDENDUM_GATE_EVIDENCE_PATTERNS: Record<string, RegExp> = {
  'Clean checkout CI': /\b(clean checkout|final branch|reproducib|CI)\b/i,
  'Fresh testnet lifecycle': /\b(fresh[- ]testnet|testnet[- ]lifecycle|live[- ]rehearsal|rehearsal)\b/i,
  'Upstream signer conformance': /\b(upstream signer|signer[- ]conformance|sigma-rust|ContextExtension|JVM[- ]node|fail-closed)\b/i,
  'Trustless burn verification': /\btrustless[- ]burn\b|\bburn verification\b/i,
  'Committee governance': /\b(committee|governance|key[- ]rotation)\b/i,
  'Operator readiness': /\b(operator|runbook|readiness)\b/i,
  'Benchmark and scaling evidence': /\b(benchmark|scaling|sharded|performance)\b/i,
  'Independent security review': /\b(independent[- ]security|security[- ]review)\b/i,
  'External integration review': /\b(external[- ]integration|integration[- ]review|fresh[- ]reviewer)\b/i,
  'Release notes': /\brelease[- ]notes?\b/i,
};

const TECHNICAL_ADDENDUM_DECISION_POSITION_PATTERNS: Record<string, RegExp> = {
  'What release level does this manual describe?': /\bproduction deployment candidate\b.{0,120}\b(testnet|testnet-scoped)\b|\b(testnet|testnet-scoped)\b.{0,120}\bproduction deployment candidate\b/i,
  'Which signer path is allowed?': /\b(ergo-lib-wasm-nodejs|sigma-rust|WASM)\b.{0,120}\bnode-wallet\b|\bnode-wallet\b.{0,120}\b(ergo-lib-wasm-nodejs|sigma-rust|WASM)\b/i,
  [REQUIRED_TECHNICAL_ADDENDUM_DECISIONS[2]]: /\bmainnet\b.{0,120}\b(blocked|forbidden|out of scope)\b|\bproduction-ready\b.{0,120}\b(blocked|forbidden|out of scope)\b/i,
  [TECHNICAL_ADDENDUM_RELEASE_GATE_DECISION]: /\brelease:gate\b.{0,120}\b(pass|completed evidence|all gates)\b/i,
  'Which trustless-burn limitation remains?': /\btrusted[- ]oracle\b|\btrustless burn\b.{0,80}\bPhase 011\b|\bPhase 011\b.{0,80}\btrustless burn\b/i,
  'How is live broadcast authorized?': /\bBRIDGE_BROADCAST_ENABLED\s*=\s*true\b.{0,120}\bapproval\b|\bapproval\b.{0,120}\bBRIDGE_BROADCAST_ENABLED\s*=\s*true\b/i,
  'How are recovery and rollback evidenced?': /\b(recovery|rollback|restore|reconstruct)\b.{0,160}\bevidence\b|\bevidence\b.{0,160}\b(recovery|rollback|restore|reconstruct)\b/i,
  'How are benchmark and scaling claims bounded?': /\b(benchmark|scaling|sharded|performance)\b.{0,160}\b(bound|claim|evidence)\b|\b(bound|claim|evidence)\b.{0,160}\b(benchmark|scaling|sharded|performance)\b/i,
};

const TECHNICAL_ADDENDUM_DECISION_EVIDENCE_PATTERNS: Record<string, RegExp> = {
  'What release level does this manual describe?': /\brelease[- ]level\b|\bproduction[- ]deployment[- ]candidate\b/i,
  'Which signer path is allowed?': /\bsigner[- ]path\b|\bergo-lib-wasm-nodejs\b|\bsigma-rust\b|\bnode-wallet\b/i,
  [REQUIRED_TECHNICAL_ADDENDUM_DECISIONS[2]]: /\bmainnet\b|\bproduction-ready\b|\bblocker\b/i,
  [TECHNICAL_ADDENDUM_RELEASE_GATE_DECISION]: /\brelease[-:]gate\b|\btestnet[- ]production[- ]candidate\b/i,
  'Which trustless-burn limitation remains?': /\btrustless[- ]burn\b|\btrusted[- ]oracle\b/i,
  'How is live broadcast authorized?': /\bbroadcast\b|\bBRIDGE_BROADCAST_ENABLED\b|\bauthori[sz]ation\b/i,
  'How are recovery and rollback evidenced?': /\brecovery\b|\brollback\b|\brestore\b|\breconstruct/i,
  'How are benchmark and scaling claims bounded?': /\bbenchmark\b|\bscaling\b|\bsharded\b|\bperformance\b/i,
};

export function validateTechnicalAddendumEvidence(markdown: string): TechnicalAddendumEvidenceValidation {
  const errors: string[] = [
    ...validateEvidenceHygiene(markdown, 'Technical Addendum Evidence'),
    ...validateRequiredSections(markdown),
  ];

  const classification = safeParseTwoColumnFields(
    errors,
    markdown,
    '## Manual Classification',
    '## Architecture Scope',
    REQUIRED_CLASSIFICATION_FIELDS,
  );
  const claimBoundary = safeParseTwoColumnFields(
    errors,
    markdown,
    '## Claim Boundary',
    '## Evidence Gate Map',
    REQUIRED_CLAIM_BOUNDARY_FIELDS,
  );
  const publicationDecision = safeParseTwoColumnFields(
    errors,
    markdown,
    '## Publication Decision',
    '## Reviewer Sign-Off',
    REQUIRED_PUBLICATION_FIELDS,
  );
  const gateRows = parseGateRows(errors, markdown);
  const decisionRows = parseDecisionRows(errors, markdown);
  const reviewerRows = parseReviewerRows(errors, markdown);

  errors.push(
    ...validateClassification(classification),
    ...validateClaimBoundary(claimBoundary),
    ...validateScopeAndBoundaries(markdown),
    ...validateGateRows(gateRows),
    ...validateDecisionRows(decisionRows),
    ...validatePublicationDecision(classification, publicationDecision),
    ...validateReviewerSignoff(classification, reviewerRows),
  );

  const status = errors.length === 0 ? 'PASS' : 'BLOCKED';
  return {
    status,
    classification: {
      manualName: classification.get('Manual name'),
      gitCommit: classification.get('Git commit'),
      releaseLevel: classification.get('Release level'),
      environment: classification.get('Environment'),
      claimWording: classification.get('Claim wording'),
      architectureOwner: classification.get('Architecture owner'),
      reviewer: classification.get('Reviewer'),
      date: classification.get('Date'),
    },
    claimBoundary: {
      productionReadyClaimsAllowed: claimBoundary.get('Production-ready claims allowed'),
      mainnetDeploymentClaimsAllowed: claimBoundary.get('Mainnet deployment claims allowed'),
      testnetProductionCandidateWordingAllowed: claimBoundary.get('Testnet production-candidate wording allowed'),
      productionGradeTestnetWordingAllowed: claimBoundary.get('Production-grade testnet wording allowed'),
      releaseGateRequiredBeforePublicClaim: claimBoundary.get('Release gate required before public claim'),
      evidenceCompletenessRequired: claimBoundary.get('Evidence completeness required'),
    },
    publicationDecision: {
      manualUseStatus: publicationDecision.get('Manual use status'),
      releaseSupported: publicationDecision.get('Release supported'),
      releaseGateStatus: publicationDecision.get('Release gate status'),
      productionReadyClaimAllowed: publicationDecision.get('Production-ready claim allowed'),
      mainnetDeploymentClaimAllowed: publicationDecision.get('Mainnet deployment claim allowed'),
      testnetProductionCandidateClaimAllowed: publicationDecision.get('Testnet production-candidate claim allowed'),
      releaseNotesUpdated: publicationDecision.get('Release notes updated'),
      requiredReleaseNoteUpdates: publicationDecision.get('Required release-note updates'),
      requiredChecklistUpdates: publicationDecision.get('Required checklist updates'),
      reviewerDecisionSummary: publicationDecision.get('Reviewer decision summary'),
    },
    gateRows,
    decisionRows,
    reviewerRows,
    errors,
    message: `Technical addendum evidence ${status}: ${errors.length} structural issue(s).`,
  };
}

function validateRequiredSections(markdown: string): string[] {
  return REQUIRED_SECTIONS
    .filter(section => !markdown.includes(section))
    .map(section => `${section}: section not found`);
}

function validateClassification(fields: Map<string, string>): string[] {
  const errors: string[] = [];
  validateAllowedField(errors, fields, 'Manual Classification', 'Release level', ALLOWED_RELEASE_LEVELS);
  validateAllowedField(errors, fields, 'Manual Classification', 'Environment', ALLOWED_ENVIRONMENTS);
  validateGitCommitField(errors, fields, 'Manual Classification', 'Git commit');
  validateIsoDateField(errors, fields, 'Manual Classification', 'Date');

  if (fields.get('Release level') === 'production deployment candidate' && fields.get('Environment') !== 'testnet') {
    errors.push('Manual Classification: production deployment candidate support requires Environment testnet');
  }
  if (!/\b(testnet production-candidate|production-grade testnet)\b/i.test(fields.get('Claim wording') ?? '')) {
    errors.push('Manual Classification: Claim wording must use controlled testnet production-candidate or production-grade testnet wording');
  }
  if (/\b(mainnet|production-ready|go-live|general availability|generally available|production launch)\b/i.test(fields.get('Claim wording') ?? '')) {
    errors.push('Manual Classification: Claim wording must not include mainnet, production-ready, go-live, general availability, generally available, or production launch wording');
  }

  return errors;
}

function validateClaimBoundary(fields: Map<string, string>): string[] {
  const errors: string[] = [];
  validateExactValue(errors, fields, 'Claim Boundary', 'Production-ready claims allowed', 'no');
  validateExactValue(errors, fields, 'Claim Boundary', 'Mainnet deployment claims allowed', 'no');
  validateExactValue(errors, fields, 'Claim Boundary', 'Release gate required before public claim', 'yes');
  validateExactValue(errors, fields, 'Claim Boundary', 'Evidence completeness required', 'yes');
  validateAllowedField(errors, fields, 'Claim Boundary', 'Testnet production-candidate wording allowed', ALLOWED_TESTNET_CLAIM);
  validateAllowedField(errors, fields, 'Claim Boundary', 'Production-grade testnet wording allowed', ALLOWED_TESTNET_CLAIM);
  return errors;
}

function validateScopeAndBoundaries(markdown: string): string[] {
  const errors: string[] = [];
  const scope = sectionBetween(markdown, '## Architecture Scope', '## Claim Boundary');
  const security = sectionBetween(markdown, '## Security Boundary', '## Operational Boundary');
  const operational = sectionBetween(markdown, '## Operational Boundary', '## Publication Decision');

  requireTerms(errors, 'Architecture Scope', scope, [
    'SCS',
    'MCL',
    'DUP',
    'SPVTracker',
    'aggregate settlement',
    'relayer',
  ]);
  requirePatterns(errors, 'Security Boundary', security, [
    { pattern: /\bergo-lib-wasm-nodejs\b/i, message: 'ergo-lib-wasm-nodejs' },
    { pattern: /\bsigma-rust\b/i, message: 'sigma-rust' },
    { pattern: /\bContextExtension guard\b/i, message: 'ContextExtension guard' },
    { pattern: /\bnode-wallet\b[\s\S]{0,100}\bnot\b[\s\S]{0,100}\bproduction path\b|\bnot\b[\s\S]{0,100}\bnode-wallet\b[\s\S]{0,100}\bproduction path\b/i, message: 'node-wallet is not the production path' },
    { pattern: /\bfail-closed\b/i, message: 'fail-closed' },
  ]);
  requirePatterns(errors, 'Operational Boundary', operational, [
    { pattern: /\bBRIDGE_BROADCAST_ENABLED\s*=\s*true\b/i, message: 'BRIDGE_BROADCAST_ENABLED=true' },
    { pattern: /\bexplicit\b[\s\S]{0,80}\bapproval\b/i, message: 'explicit approval' },
    { pattern: /\brelease:gate\b/i, message: 'release:gate' },
    { pattern: /\bno transaction broadcast\b|\bdoes not broadcast\b|\bno broadcast\b/i, message: 'no transaction broadcast' },
  ]);

  if (approvesNodeWalletProductionSignerPath(security)) {
    errors.push('Security Boundary: node-wallet must not be approved as the production signer path');
  }
  if (treatsBroadcastEnablementAsTransactionBroadcastApproval(operational)) {
    errors.push('Operational Boundary: BRIDGE_BROADCAST_ENABLED=true must not be treated as transaction broadcast approval');
  }
  if (allowsTestnetProductionCandidateClaimsBeforeReleaseGatePass(operational)) {
    errors.push('Operational Boundary: testnet production-candidate claims require release gate pass before public claim');
  }

  return errors;
}

function validateGateRows(rows: ArchitectureGateRow[]): string[] {
  const errors = validateRequiredNames('Evidence Gate Map', rows.map(row => row.gate), REQUIRED_TECHNICAL_ADDENDUM_GATE_ROWS);

  for (const row of rows) {
    if (!REQUIRED_TECHNICAL_ADDENDUM_GATE_ROWS.includes(row.gate)) errors.push(`Evidence Gate Map: ${row.gate}: unexpected gate`);
    if (!['linked', 'pass'].includes(row.status)) {
      errors.push(`Evidence Gate Map: ${row.gate}: status must be linked or pass`);
    }
    if (hasContradictoryTechnicalAddendumEvidenceMarker(row.requiredEvidence)) {
      errors.push(`Evidence Gate Map: ${row.gate}: Required evidence must not include contradictory technical addendum failure markers`);
    }
    if (!hasCompletedEvidenceTarget(row.artifact)) {
      errors.push(`Evidence Gate Map: ${row.gate}: Artifact must include completed evidence target or non-template evidence link`);
    }
    if (hasContradictoryTechnicalAddendumEvidenceMarker(row.artifact)) {
      errors.push(`Evidence Gate Map: ${row.gate}: Artifact must not include contradictory technical addendum failure markers`);
    }
    if (!/\b(no mainnet|mainnet blocked|production-ready blocked|testnet only|testnet-scoped)\b/i.test(row.claimBoundary)) {
      errors.push(`Evidence Gate Map: ${row.gate}: Claim boundary must state testnet-only or blocked mainnet/production-ready claims`);
    }
    if (hasContradictoryTechnicalAddendumEvidenceMarker(row.claimBoundary)) {
      errors.push(`Evidence Gate Map: ${row.gate}: Claim boundary must not include contradictory technical addendum failure markers`);
    }
  }

  return errors;
}

function validateDecisionRows(rows: ArchitectureDecisionRow[]): string[] {
  const errors = validateRequiredNames('Architecture Decision Record', rows.map(row => row.decision), REQUIRED_TECHNICAL_ADDENDUM_DECISIONS);

  for (const row of rows) {
    if (!REQUIRED_TECHNICAL_ADDENDUM_DECISIONS.includes(row.decision)) errors.push(`Architecture Decision Record: ${row.decision}: unexpected decision`);
    if (row.status !== 'linked') {
      errors.push(`Architecture Decision Record: ${row.decision}: status must be linked`);
    }
    if (hasContradictoryTechnicalAddendumEvidenceMarker(row.requiredPosition)) {
      errors.push(`Architecture Decision Record: ${row.decision}: Required position must not include contradictory technical addendum failure markers`);
    }
    if (
      row.decision === 'Which signer path is allowed?' &&
      approvesNodeWalletProductionSignerPath(row.requiredPosition)
    ) {
      errors.push(
        'Architecture Decision Record: Which signer path is allowed?: node-wallet must be explicitly excluded as the production signer path',
      );
    }
    if (
      row.decision === 'How is live broadcast authorized?' &&
      treatsBroadcastEnablementAsTransactionBroadcastApproval(row.requiredPosition)
    ) {
      errors.push(
        'Architecture Decision Record: How is live broadcast authorized?: BRIDGE_BROADCAST_ENABLED=true must not be treated as transaction broadcast approval',
      );
    }
    if (
      row.decision === TECHNICAL_ADDENDUM_RELEASE_GATE_DECISION &&
      allowsTestnetProductionCandidateClaimsBeforeReleaseGatePass(row.requiredPosition)
    ) {
      errors.push(
        'Architecture Decision Record: What must pass before testnet production-candidate wording?: testnet production-candidate claims require release gate pass before public claim',
      );
    }
    if (!hasCompletedEvidenceTarget(row.evidence)) {
      errors.push(`Architecture Decision Record: ${row.decision}: Evidence must include completed evidence target or non-template evidence link`);
    }
    if (!hasCompletedTechnicalAddendumDecisionEvidence(row.decision, row.evidence)) {
      errors.push(`Architecture Decision Record: ${row.decision}: Evidence must include decision-specific completed evidence`);
    }
    if (
      row.decision === TECHNICAL_ADDENDUM_RELEASE_GATE_DECISION &&
      !hasCompletedTechnicalAddendumReleaseGatePassEvidence(row.evidence)
    ) {
      errors.push(`Architecture Decision Record: ${row.decision}: Evidence must include concrete release:gate PASS output with Structural issues = 0`);
    }
    if (hasContradictoryTechnicalAddendumEvidenceMarker(row.evidence)) {
      errors.push(`Architecture Decision Record: ${row.decision}: Evidence must not include contradictory technical addendum failure markers`);
    }
  }

  const byDecision = new Map(rows.map(row => [row.decision, row.requiredPosition]));
  validatePosition(errors, byDecision, 'Which signer path is allowed?', /\b(ergo-lib-wasm-nodejs|sigma-rust|WASM)\b.{0,120}\bnode-wallet\b|\bnode-wallet\b.{0,120}\b(ergo-lib-wasm-nodejs|sigma-rust|WASM)\b/i, 'must mention WASM/sigma-rust signing and node-wallet exclusion');
  validatePosition(errors, byDecision, 'What blocks mainnet production-ready claims?', /\bmainnet\b.{0,120}\b(blocked|forbidden|out of scope)\b|\bproduction-ready\b.{0,120}\b(blocked|forbidden|out of scope)\b/i, 'must block mainnet production-ready claims');
  validatePosition(errors, byDecision, 'What must pass before testnet production-candidate wording?', /\brelease:gate\b.{0,120}\b(pass|completed evidence|all gates)\b/i, 'must require release:gate with completed evidence');
  validatePosition(errors, byDecision, 'Which trustless-burn limitation remains?', /\btrusted[- ]oracle\b|\btrustless burn\b.{0,80}\bPhase 011\b|\bPhase 011\b.{0,80}\btrustless burn\b/i, 'must preserve the trustless-burn limitation');
  validatePosition(errors, byDecision, 'How is live broadcast authorized?', /\bBRIDGE_BROADCAST_ENABLED\s*=\s*true\b.{0,120}\bapproval\b|\bapproval\b.{0,120}\bBRIDGE_BROADCAST_ENABLED\s*=\s*true\b/i, 'must require scoped approval for broadcast');
  return errors;
}

function validatePublicationDecision(
  classification: Map<string, string>,
  fields: Map<string, string>,
): string[] {
  const errors: string[] = [];
  validateAllowedField(errors, fields, 'Publication Decision', 'Manual use status', ALLOWED_MANUAL_USE);
  validateAllowedField(errors, fields, 'Publication Decision', 'Release supported', ALLOWED_RELEASE_SUPPORT);
  validateAllowedField(errors, fields, 'Publication Decision', 'Release gate status', ALLOWED_RELEASE_GATE_STATUS);
  validateExactValue(errors, fields, 'Publication Decision', 'Production-ready claim allowed', 'no');
  validateExactValue(errors, fields, 'Publication Decision', 'Mainnet deployment claim allowed', 'no');
  validateAllowedField(errors, fields, 'Publication Decision', 'Testnet production-candidate claim allowed', ALLOWED_TESTNET_CLAIM);
  validateAllowedField(errors, fields, 'Publication Decision', 'Release notes updated', ALLOWED_YES_NO);

  const releaseSupported = fields.get('Release supported') ?? '';
  const releaseLevel = classification.get('Release level') ?? '';
  if (releaseSupported === 'production deployment candidate') {
    if (releaseLevel !== 'production deployment candidate') {
      errors.push('Publication Decision: production deployment candidate support requires Manual Classification release level production deployment candidate');
    }
    if (classification.get('Environment') !== 'testnet') {
      errors.push('Publication Decision: production deployment candidate support requires Environment testnet');
    }
    if (fields.get('Manual use status') !== 'candidate claim support') {
      errors.push('Publication Decision: production deployment candidate support requires Manual use status candidate claim support');
    }
    validateExactValue(errors, fields, 'Publication Decision', 'Release gate status', 'pass');
    validateExactValue(errors, fields, 'Publication Decision', 'Testnet production-candidate claim allowed', 'yes-after-release-gate-pass');
    validateExactValue(errors, fields, 'Publication Decision', 'Release notes updated', 'yes');
  }

  validatePublicationEvidenceMarker(errors, fields, 'Required release-note updates', 'completed Phase 007 release-note update evidence');
  validatePublicationEvidenceMarker(errors, fields, 'Required checklist updates', 'completed Phase 007 checklist update evidence');
  validateNoContradictoryTechnicalAddendumDecisionBindings(
    errors,
    'Required release-note updates',
    fields.get('Required release-note updates') ?? '',
  );
  validateNoContradictoryTechnicalAddendumDecisionBindings(
    errors,
    'Required checklist updates',
    fields.get('Required checklist updates') ?? '',
  );
  if (
    hasCompletedTechnicalAddendumReleaseNoteUpdateEvidence(fields.get('Required release-note updates') ?? '') &&
    hasCompletedTechnicalAddendumChecklistUpdateEvidence(fields.get('Required checklist updates') ?? '') &&
    haveSharedConcretePublicationEvidenceTarget(
      fields.get('Required release-note updates') ?? '',
      fields.get('Required checklist updates') ?? '',
    )
  ) {
    errors.push(
      'Publication Decision: Required release-note updates and Required checklist updates must use distinct completed Phase 007 evidence targets',
    );
  }
  const reviewerDecisionSummary = fields.get('Reviewer decision summary') ?? '';
  validateNoContradictoryTechnicalAddendumDecisionBindings(errors, 'Reviewer decision summary', reviewerDecisionSummary);
  errors.push(...validateReviewerDecisionSummaryClaimBoundary({
    prefix: 'Publication Decision: Reviewer decision summary',
    summary: reviewerDecisionSummary,
    releaseSupported,
    productionReadyClaimAllowed: fields.get('Production-ready claim allowed') ?? '',
    testnetProductionCandidateClaimAllowed:
      fields.get('Testnet production-candidate claim allowed') === 'yes-after-release-gate-pass'
        ? 'yes'
        : fields.get('Testnet production-candidate claim allowed') ?? '',
  }));
  if (approvesNodeWalletProductionSignerPath(reviewerDecisionSummary)) {
    errors.push(
      'Publication Decision: Reviewer decision summary: node-wallet must not be approved as the production signer path',
    );
  }
  if (treatsBroadcastEnablementAsTransactionBroadcastApproval(reviewerDecisionSummary)) {
    errors.push(
      'Publication Decision: Reviewer decision summary: BRIDGE_BROADCAST_ENABLED=true must not be treated as transaction broadcast approval',
    );
  }
  if (allowsTestnetProductionCandidateClaimsBeforeReleaseGatePass(reviewerDecisionSummary)) {
    errors.push(
      'Publication Decision: Reviewer decision summary: testnet production-candidate claims require release gate pass before public claim',
    );
  }
  if (leavesTestnetProductionCandidateClaimApprovalPendingReleaseGatePass(reviewerDecisionSummary)) {
    errors.push(
      'Publication Decision: Reviewer decision summary must not leave testnet production-candidate claim approval pending release gate pass',
    );
  }
  if (!/\brelease supported\b/i.test(reviewerDecisionSummary)) {
    errors.push('Publication Decision: Reviewer decision summary must mention release supported');
  }
  if (
    releaseSupported === 'production deployment candidate' &&
    !hasExactReleaseSupportCandidateBinding(reviewerDecisionSummary)
  ) {
    errors.push('Publication Decision: Reviewer decision summary must use exact Release supported = production deployment candidate');
  }
  if (
    fields.get('Production-ready claim allowed') === 'no' &&
    !hasExactProductionReadyClaimDeniedBinding(reviewerDecisionSummary)
  ) {
    errors.push('Publication Decision: Reviewer decision summary must use exact Production-ready claim allowed = no');
  }
  if (
    fields.get('Testnet production-candidate claim allowed') === 'yes-after-release-gate-pass' &&
    !hasExactTestnetProductionCandidateClaimAllowanceBinding(reviewerDecisionSummary)
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must use exact Testnet production-candidate claim allowed = yes-after-release-gate-pass',
    );
  }
  if (!/\barchitecture manual\b/i.test(reviewerDecisionSummary)) {
    errors.push('Publication Decision: Reviewer decision summary must mention architecture manual evidence');
  }
  if (!mentionsTechnicalAddendumProductionReadyClaimHandling(reviewerDecisionSummary)) {
    errors.push('Publication Decision: Reviewer decision summary must mention production-ready claim handling');
  }
  if (!mentionsTechnicalAddendumTestnetProductionCandidateClaimHandling(reviewerDecisionSummary)) {
    errors.push('Publication Decision: Reviewer decision summary must mention testnet production-candidate claim handling');
  }

  return errors;
}

function mentionsTechnicalAddendumProductionReadyClaimHandling(value: string): boolean {
  return /\bproduction ready claim handling\b/.test(normalizeTechnicalAddendumEvidenceKind(value));
}

function mentionsTechnicalAddendumTestnetProductionCandidateClaimHandling(value: string): boolean {
  return /\btestnet production candidate claim handling\b/.test(normalizeTechnicalAddendumEvidenceKind(value));
}

function approvesNodeWalletProductionSignerPath(value: string): boolean {
  const approval = technicalAddendumApprovalTerms();
  const approvalConnector = technicalAddendumApprovalConnector(3);
  const nodeWalletProductionPathSubject =
    '(?:node wallet(?: signing)?(?:\\s+[a-z0-9]+){0,8}\\s+production (?:signer )?path|' +
    'production (?:signer )?path(?:\\s+[a-z0-9]+){0,8}\\s+node wallet)';
  return normalizeTechnicalAddendumEvidenceSegments(value).some(normalized => {
    if (/\bnode wallet(?: signing)?\s+is\s+not\s+(?:the\s+)?production (?:signer )?path\b/.test(normalized)) {
      return false;
    }
    return (
      /\bnode wallet(?: signing)?\b.{0,24}\bis\s+(?:the\s+)?production (?:signer )?path\b/.test(normalized) ||
      /\bproduction (?:signer )?path\b.{0,80}\b(?:is|uses)\b.{0,24}\bnode wallet\b/.test(normalized) ||
      [
        new RegExp(`\\b${nodeWalletProductionPathSubject}\\b${approvalConnector}\\s+${approval}\\b`, 'gi'),
        new RegExp(`\\b${approval}\\b${approvalConnector}\\s+${nodeWalletProductionPathSubject}\\b`, 'gi'),
      ].some(pattern => hasUnnegatedTechnicalAddendumApproval(normalized, pattern))
    );
  });
}

function treatsBroadcastEnablementAsTransactionBroadcastApproval(value: string): boolean {
  const approval = technicalAddendumApprovalTerms();
  const approvalConnector = technicalAddendumApprovalConnector(3);
  return normalizeTechnicalAddendumEvidenceSegments(value).some(normalized =>
    [
      new RegExp(`\\bbridge broadcast enabled true\\b.{0,80}\\b${approval}\\b.{0,80}\\b(?:transaction |live )?broadcast\\b`, 'gi'),
      new RegExp(`\\bbridge broadcast enabled true\\b.{0,80}\\b(?:transaction |live )?broadcast\\b${approvalConnector}\\s+${approval}\\b`, 'gi'),
      new RegExp(`\\b${approval}\\b${approvalConnector}\\s+bridge broadcast enabled true\\b.{0,80}\\b(?:transaction |live )?broadcast\\b`, 'gi'),
      new RegExp(`\\b(?:transaction |live )?broadcast\\b.{0,80}\\b${approval}\\b.{0,80}\\bbridge broadcast enabled true\\b`, 'gi'),
    ].some(pattern => hasUnnegatedTechnicalAddendumApproval(normalized, pattern)),
  );
}

function allowsTestnetProductionCandidateClaimsBeforeReleaseGatePass(value: string): boolean {
  const approval = technicalAddendumApprovalTerms();
  return normalizeTechnicalAddendumEvidenceSegments(value).some(normalized =>
    new RegExp(`\\btestnet production candidate claims?\\b.{0,80}\\b${approval}\\b.{0,80}\\b(?:before|without|no)\\b.{0,24}\\brelease gate pass\\b`, 'i').test(normalized) ||
    new RegExp(`\\b${approval}\\b.{0,80}\\btestnet production candidate claims?\\b.{0,80}\\b(?:before|without|no)\\b.{0,24}\\brelease gate pass\\b`, 'i').test(normalized) ||
    new RegExp(`\\b(?:before|without|no)\\b.{0,24}\\brelease gate pass\\b.{0,80}\\btestnet production candidate claims?\\b.{0,80}\\b${approval}\\b`, 'i').test(normalized),
  );
}

function leavesTestnetProductionCandidateClaimApprovalPendingReleaseGatePass(value: string): boolean {
  const subject = 'testnet production candidate claims?(?:\\s+(?:approval|allowance|handling|wording))?';
  const unresolvedState = '(?:pending|unresolved|open|outstanding|remaining|deferred|awaiting|waiting(?:\\s+(?:for|on))?)';

  return normalizeTechnicalAddendumEvidenceSegments(value).some(normalized => {
    if (
      new RegExp(`\\b${subject}\\b(?:\\s+[a-z0-9]+){0,8}\\s+(?:not|no|never)\\s+${unresolvedState}\\s+release gate(?: pass)?\\b`).test(normalized) ||
      new RegExp(`\\b(?:not|no|never)\\s+${unresolvedState}\\s+release gate(?: pass)?\\b(?:\\s+[a-z0-9]+){0,8}\\s+${subject}\\b`).test(normalized)
    ) {
      return false;
    }

    return (
      new RegExp(`\\b${subject}\\b(?:\\s+[a-z0-9]+){0,8}\\s+${unresolvedState}\\s+release gate(?: pass)?\\b`).test(normalized) ||
      new RegExp(`\\b${unresolvedState}\\s+release gate(?: pass)?\\b(?:\\s+[a-z0-9]+){0,8}\\s+${subject}\\b`).test(normalized) ||
      new RegExp(`\\brelease gate(?: pass)?\\b(?:\\s+[a-z0-9]+){0,8}\\s+${unresolvedState}\\b(?:\\s+[a-z0-9]+){0,8}\\s+${subject}\\b`).test(normalized)
    );
  });
}

function technicalAddendumApprovalTerms(): string {
  return '(?:accepted|accepts|accept|approved|approves|approve|allowed|allows|allow|enabled|enables|enable|supported|supports|support|permitted|permits|permit|cleared|clears|clear|granted|grants|grant|authori[sz]ed|authori[sz]es|authori[sz]e|certified|certifies|certify|endorsed|endorses|endorse|recommended|recommends|recommend|accredited|accredits|accredit)';
}

function technicalAddendumApprovalConnector(maxWords: number): string {
  return `(?:\\s+(?!\\b(?:${technicalAddendumNegatingApprovalTerms()})\\b)[a-z0-9]+){0,${maxWords}}`;
}

function hasUnnegatedTechnicalAddendumApproval(normalized: string, pattern: RegExp): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 32), index);
    if (!new RegExp(`\\b(?:${technicalAddendumNegatingApprovalTerms()})(?:\\s+of)?\\s+$`).test(prefix)) {
      return true;
    }
  }
  return false;
}

function technicalAddendumNegatingApprovalTerms(): string {
  return 'not|no|never|without|absence|absent|lack|lacks|lacking';
}

function validateReviewerSignoff(
  classification: Map<string, string>,
  rows: ReviewerSignoffRow[],
): string[] {
  const errors = validateRequiredNames('Reviewer Sign-Off', rows.map(row => row.role), REQUIRED_TECHNICAL_ADDENDUM_REVIEWER_ROLES);

  for (const row of rows) {
    if (!REQUIRED_TECHNICAL_ADDENDUM_REVIEWER_ROLES.includes(row.role)) errors.push(`Reviewer Sign-Off: ${row.role}: unexpected role`);
    if (isBlank(row.name)) errors.push(`Reviewer Sign-Off: ${row.role}: name is required`);
    if (!['approve', 'block'].includes(row.decision)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve or block`);
    }
    if (row.decision !== 'approve') {
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve before technical addendum evidence can pass`);
    }
    if (isBlank(row.date)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: Date must use YYYY-MM-DD`);
    }
    if (isBlank(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes are required`);
    } else if (hasContradictoryTechnicalAddendumEvidenceMarker(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not include contradictory technical addendum failure markers`);
    } else if (containsMainnetProductionClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not contain mainnet production claim wording`);
    } else if (containsProductionReadyClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not contain production-ready claim wording`);
    } else if (!/\b(architecture manual|testnet|release gate|claim boundary|approved|blocked mainnet)\b/i.test(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must state a concrete technical-addendum outcome`);
    }
    if (!isBlank(row.notes) && approvesNodeWalletProductionSignerPath(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve node-wallet as the production signer path`);
    }
    if (!isBlank(row.notes) && treatsBroadcastEnablementAsTransactionBroadcastApproval(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not treat BRIDGE_BROADCAST_ENABLED=true as transaction broadcast approval`);
    }
    if (!isBlank(row.notes) && allowsTestnetProductionCandidateClaimsBeforeReleaseGatePass(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must require release gate pass before testnet production-candidate claims`);
    }
    if (!isBlank(row.notes) && leavesTestnetProductionCandidateClaimApprovalPendingReleaseGatePass(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not leave testnet production-candidate claim approval pending release gate pass`);
    }
  }

  const owner = rows.find(row => row.role === 'Architecture owner');
  if (owner && classification.get('Architecture owner') && owner.name !== classification.get('Architecture owner')) {
    errors.push('Reviewer Sign-Off: Architecture owner: name must match Manual Classification Architecture owner');
  }

  const reviewDate = classification.get('Date') ?? '';
  if (isIsoCalendarDate(reviewDate)) {
    for (const row of rows) {
      if (isIsoCalendarDate(row.date) && row.date < reviewDate) {
        errors.push(`Reviewer Sign-Off: ${row.role}: Date must not be before Manual Classification Date`);
      }
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

function parseGateRows(errors: string[], markdown: string): ArchitectureGateRow[] {
  return safeParseRows(errors, markdown, '## Evidence Gate Map', '## Architecture Decision Record', row => {
    if (row.length !== 5) throw new Error(`Malformed Evidence Gate Map row: ${row.join(' | ')}`);
    const [gate, requiredEvidence, artifact, status, claimBoundary] = row;
    return { gate, requiredEvidence, artifact, status, claimBoundary };
  }).rows;
}

function parseDecisionRows(errors: string[], markdown: string): ArchitectureDecisionRow[] {
  return safeParseRows(errors, markdown, '## Architecture Decision Record', '## Security Boundary', row => {
    if (row.length !== 4) throw new Error(`Malformed Architecture Decision Record row: ${row.join(' | ')}`);
    const [decision, requiredPosition, evidence, status] = row;
    return { decision, requiredPosition, evidence, status };
  }).rows;
}

function parseReviewerRows(errors: string[], markdown: string): ReviewerSignoffRow[] {
  return safeParseRows(errors, markdown, '## Reviewer Sign-Off', undefined, row => {
    if (row.length !== 5) throw new Error(`Malformed Reviewer Sign-Off row: ${row.join(' | ')}`);
    const [role, name, decision, date, notes] = row;
    return { role, name, decision, date, notes };
  }).rows;
}

function safeParseRows<T>(
  errors: string[],
  markdown: string,
  startHeading: string,
  endHeading: string | undefined,
  parse: (row: string[]) => T,
): ParsedRows<T> {
  try {
    const rows = parseTableBetween(markdown, startHeading, endHeading).map(parse);
    return { rows, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    return { rows: [], errors: [message] };
  }
}

function safeParseTwoColumnFields(
  errors: string[],
  markdown: string,
  startHeading: string,
  endHeading: string,
  requiredFields: string[],
): Map<string, string> {
  const section = sectionBetween(markdown, startHeading, endHeading);
  const fields = parseTwoColumnTable(section);
  for (const field of requiredFields) {
    if (!fields.has(field)) {
      errors.push(`${headingLabel(startHeading)}: ${field}: missing required field`);
    } else if (isBlank(fields.get(field) ?? '')) {
      errors.push(`${headingLabel(startHeading)}: ${field} is required`);
    }
  }
  errors.push(
    ...validateDuplicateRequiredFields(headingLabel(startHeading), parseFieldNamesFromTable(section), requiredFields),
  );
  return fields;
}

function validateAllowedField(
  errors: string[],
  fields: Map<string, string>,
  section: string,
  field: string,
  allowed: string[],
): void {
  const value = fields.get(field) ?? '';
  if (value.trim().length > 0 && !allowed.includes(value)) {
    errors.push(`${section}: ${field} must be one of ${allowed.join(', ')}`);
  }
}

function validateExactValue(
  errors: string[],
  fields: Map<string, string>,
  section: string,
  field: string,
  expected: string,
): void {
  const value = fields.get(field) ?? '';
  if (value.trim().length > 0 && value !== expected) {
    errors.push(`${section}: ${field} must be ${expected}`);
  }
}

function validatePublicationEvidenceMarker(
  errors: string[],
  fields: Map<string, string>,
  field: string,
  evidenceKind: string,
): void {
  const value = fields.get(field) ?? '';
  if (!identifiesTechnicalAddendumPublicationEvidenceKind(value, evidenceKind)) {
    errors.push(`Publication Decision: ${field} must include ${evidenceKind}`);
  }
  if (!hasCompletedEvidenceTarget(value)) {
    errors.push(`Publication Decision: ${field} must include completed artifact target or non-template evidence link`);
  }
  if (hasContradictoryTechnicalAddendumEvidenceMarker(value)) {
    errors.push(`Publication Decision: ${field} must not include contradictory technical addendum failure markers`);
  }
  if (containsMainnetProductionClaim(value)) {
    errors.push(`Publication Decision: ${field} must not contain mainnet production claim wording`);
  }
  if (containsProductionReadyClaim(value)) {
    errors.push(`Publication Decision: ${field} must not contain production-ready claim wording`);
  }
  if (usesProseOnlyReleaseGateStatusPass(value)) {
    errors.push(
      `Publication Decision: ${field} must use exact Release gate status = pass; prose-only release-gate pass wording is not accepted`,
    );
  }
  if (usesProseOnlyTestnetProductionCandidateClaimAllowance(value)) {
    errors.push(
      `Publication Decision: ${field} must use exact Testnet production-candidate claim allowed = yes-after-release-gate-pass; prose-only testnet production-candidate claim wording is not accepted`,
    );
  }
}

function validateNoContradictoryTechnicalAddendumDecisionBindings(
  errors: string[],
  field: string,
  value: string,
): void {
  if (isBlank(value)) return;
  if (hasContradictoryTechnicalAddendumDecisionBinding(value)) {
    errors.push(`Publication Decision: ${field} must not include contradictory technical addendum decision bindings`);
  }
}

function validatePosition(
  errors: string[],
  rows: Map<string, string>,
  decision: string,
  pattern: RegExp,
  message: string,
): void {
  const value = rows.get(decision) ?? '';
  if (value.length > 0 && !pattern.test(value)) {
    errors.push(`Architecture Decision Record: ${decision}: ${message}`);
  }
}

function requireTerms(errors: string[], label: string, section: string, terms: string[]): void {
  for (const term of terms) {
    if (!section.toLowerCase().includes(term.toLowerCase())) {
      errors.push(`${label}: must mention ${term}`);
    }
  }
}

function requirePatterns(
  errors: string[],
  label: string,
  section: string,
  required: Array<{ pattern: RegExp; message: string }>,
): void {
  for (const { pattern, message } of required) {
    if (!pattern.test(section)) errors.push(`${label}: must mention ${message}`);
  }
}

function hasCompletedEvidenceTarget(value: string): boolean {
  const completedEvidenceText = technicalAddendumCompletedEvidenceText(value);
  return (
    !hasLocalOnlyEvidenceTarget(value) &&
    !hasClaimEscalatingTechnicalAddendumEvidenceReference(value) &&
    (
      [...completedEvidenceText.matchAll(/(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+)/g)]
        .some(([, target]) =>
          /(?:completed|pass|validated|evidence)/i.test(target) &&
          isConcreteEvidenceTarget(target),
        ) ||
      [...completedEvidenceText.matchAll(/\[([^\]]*(?:completed|evidence|validated|pass)[^\]]*)\]\(([^)]+)\)/gi)]
        .some(([, , rawTarget]) => {
          return isConcreteEvidenceTarget(rawTarget);
        })
    )
  );
}

function findTechnicalAddendumValidationTargetBinding(value: string): RegExpExecArray | null {
  return /\b(?:validated target|validated input|addendum validate target|addendum validation target|technical addendum validation target)\b/i
    .exec(value);
}

function technicalAddendumCompletedEvidenceText(value: string): string {
  return value
    .split(/[;\n]+/)
    .map(segment => {
      const targetBinding = findTechnicalAddendumValidationTargetBinding(segment);
      return targetBinding
        ? segment.slice(0, targetBinding.index).trim()
        : segment.trim();
    })
    .filter(segment => segment.length > 0)
    .join('; ');
}

function hasClaimEscalatingTechnicalAddendumEvidenceTarget(target: string): boolean {
  const comparable = normalizeTechnicalAddendumEvidenceKind(target);
  const claim = classifyPublicationClaimText(comparable);
  return (
    claim.hasMainnetProductionClaim ||
    claim.hasProductionReadyClaim ||
    approvesControlledTestnetProductionCandidateEvidenceTarget(comparable) ||
    approvesNodeWalletProductionSignerPath(comparable) ||
    treatsBroadcastEnablementAsTransactionBroadcastApproval(comparable) ||
    allowsTestnetProductionCandidateClaimsBeforeReleaseGatePass(comparable)
  );
}

function approvesControlledTestnetProductionCandidateEvidenceTarget(value: string): boolean {
  if (!classifyPublicationClaimText(value).hasControlledTestnetProductionClaim) return false;

  const approval = technicalAddendumApprovalTerms();
  return new RegExp(`\\b${approval}\\b`, 'i').test(value);
}

function hasClaimEscalatingTechnicalAddendumEvidenceReference(value: string): boolean {
  return extractPublicationEvidenceTargets(value)
    .some(target => hasClaimEscalatingTechnicalAddendumEvidenceTarget(target));
}

function isConcreteEvidenceTarget(target: string): boolean {
  const trimmed = target.trim().replace(/[),;|.]+$/g, '');
  const artifactMatch = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/(.+)$/i.exec(trimmed);
  const path = (artifactMatch?.[1] ?? trimmed).split('#')[0].split('?')[0];
  if (isLocalOnlyEvidenceTarget(path)) return false;
  if (isSensitiveOrRuntimeTechnicalAddendumEvidenceTarget(path)) return false;
  if (hasClaimEscalatingTechnicalAddendumEvidenceTarget(path)) return false;
  return (
    !/-template\.md$/i.test(path) &&
    path.split(/[\\/]+/).every(segment => !isNonConcreteEvidenceSegment(segment))
  );
}

function isSensitiveOrRuntimeTechnicalAddendumEvidenceTarget(target: string): boolean {
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(isSensitiveOrRuntimeTechnicalAddendumEvidenceInspectionTarget);
}

function isSensitiveOrRuntimeTechnicalAddendumEvidenceInspectionTarget(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasTechnicalAddendumEnvironmentTargetSegment(normalizedTarget) ||
    hasTechnicalAddendumRuntimeDatabaseTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalizedTarget, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
  );
}

function hasTechnicalAddendumEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasTechnicalAddendumRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
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

function isNonConcreteEvidenceSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /(?:^|[-_.])(?:not[-_]?completed|uncompleted)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])template(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|addendum|architecture|manual|gate|decision|phase|phase007|claim|boundary|signer|broadcast|release|checklist)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])sample(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|addendum|architecture|manual|gate|decision|phase|phase007|claim|boundary|signer|broadcast|release|checklist)|$)/i.test(normalized) ||
    /(?:^|[-_.])example(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|validator|addendum|architecture|manual|gate|decision|phase|phase007|claim|boundary|signer|broadcast|release|checklist)|$)/i.test(normalized)
  );
}

function haveSharedConcretePublicationEvidenceTarget(left: string, right: string): boolean {
  const leftTargets = new Set(
    extractCompletedTechnicalAddendumEvidenceTargets(left)
      .map(normalizePublicationEvidenceTarget)
      .filter(isConcreteEvidenceTarget),
  );
  return extractCompletedTechnicalAddendumEvidenceTargets(right)
    .map(normalizePublicationEvidenceTarget)
    .filter(isConcreteEvidenceTarget)
    .some(target => leftTargets.has(target));
}

function extractCompletedTechnicalAddendumEvidenceTargets(value: string): string[] {
  return extractPublicationEvidenceTargets(technicalAddendumCompletedEvidenceText(value));
}

function extractPublicationEvidenceTargets(value: string): string[] {
  return [
    ...[...value.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+)/g)]
      .map(([, target]) => target),
    ...[...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
      .map(([, target]) => target.trim()),
  ];
}

function normalizePublicationEvidenceTarget(target: string): string {
  return target.split('#')[0].split('?')[0].replace(/[),;|.]+$/g, '').trim().toLowerCase();
}

export function hasTechnicalAddendumGateRequiredEvidence(gate: string, requiredEvidence: string): boolean {
  return hasTechnicalAddendumRowPayload(requiredEvidence, TECHNICAL_ADDENDUM_GATE_EVIDENCE_PATTERNS[gate]);
}

export function hasCompletedTechnicalAddendumGateArtifact(gate: string, artifact: string): boolean {
  return (
    hasCompletedEvidenceTarget(artifact) &&
    hasNoContradictoryTechnicalAddendumEvidenceMarker(artifact) &&
    hasTechnicalAddendumRowPayload(artifact, TECHNICAL_ADDENDUM_GATE_EVIDENCE_PATTERNS[gate])
  );
}

export function hasTechnicalAddendumGateClaimBoundary(gate: string, claimBoundary: string): boolean {
  return (
    REQUIRED_TECHNICAL_ADDENDUM_GATE_ROWS.includes(gate) &&
    !isGenericTechnicalAddendumRowPayload(claimBoundary) &&
    /\b(no mainnet|mainnet blocked|production-ready blocked|testnet only|testnet-only|testnet-scoped)\b/i.test(claimBoundary)
  );
}

export function hasTechnicalAddendumDecisionRequiredPosition(decision: string, requiredPosition: string): boolean {
  return hasTechnicalAddendumRowPayload(requiredPosition, TECHNICAL_ADDENDUM_DECISION_POSITION_PATTERNS[decision]);
}

export function hasCompletedTechnicalAddendumDecisionEvidence(decision: string, evidence: string): boolean {
  return (
    hasCompletedEvidenceTarget(evidence) &&
    hasNoContradictoryTechnicalAddendumEvidenceMarker(evidence) &&
    hasTechnicalAddendumRowPayload(evidence, TECHNICAL_ADDENDUM_DECISION_EVIDENCE_PATTERNS[decision]) &&
    (
      decision !== TECHNICAL_ADDENDUM_RELEASE_GATE_DECISION ||
      hasCompletedTechnicalAddendumReleaseGatePassEvidence(evidence)
    )
  );
}

export function hasCompletedTechnicalAddendumReleaseGatePassEvidence(value: string): boolean {
  return (
    hasCompletedEvidenceTarget(value) &&
    hasNoContradictoryTechnicalAddendumEvidenceMarker(value) &&
    /\brelease:gate\b\s+(?:PASS|passed)\b(?!\s*\/)/i.test(value) &&
    /\bstructural\s+issues?\s*=\s*0\b/i.test(value)
  );
}

export function isActionableTechnicalAddendumReviewerNote(value: string): boolean {
  return (
    !isGenericTechnicalAddendumRowPayload(value) &&
    hasNoContradictoryTechnicalAddendumEvidenceMarker(value) &&
    /\b(architecture manual|testnet|release gate|claim boundary|blocked mainnet|no transaction broadcast|production-ready claims? blocked|mainnet.{0,40}production-ready)\b/i.test(value)
  );
}

export function hasCompletedTechnicalAddendumReleaseNoteUpdateEvidence(value: string): boolean {
  return (
    hasCompletedEvidenceTarget(value) &&
    identifiesTechnicalAddendumPublicationEvidenceKind(
      value,
      'completed Phase 007 release-note update evidence',
    ) &&
    hasNoContradictoryTechnicalAddendumEvidenceMarker(value)
  );
}

export function hasCompletedTechnicalAddendumChecklistUpdateEvidence(value: string): boolean {
  return (
    hasCompletedEvidenceTarget(value) &&
    identifiesTechnicalAddendumPublicationEvidenceKind(
      value,
      'completed Phase 007 checklist update evidence',
    ) &&
    hasNoContradictoryTechnicalAddendumEvidenceMarker(value)
  );
}

export function hasNoContradictoryTechnicalAddendumEvidenceMarker(value: string): boolean {
  return !hasContradictoryTechnicalAddendumEvidenceMarker(value);
}

function identifiesTechnicalAddendumPublicationEvidenceKind(value: string, evidenceKind: string): boolean {
  const normalizedKind = normalizeTechnicalAddendumEvidenceKind(evidenceKind);
  return technicalAddendumPublicationEvidenceTargetsIdentifyKind(value, normalizedKind) ||
    technicalAddendumPublicationEvidenceKindTextSegments(value)
      .some(segment =>
        segment === normalizedKind ||
        segment.startsWith(`${normalizedKind} `)
      );
}

function technicalAddendumPublicationEvidenceTargetsIdentifyKind(value: string, normalizedKind: string): boolean {
  const expectedSlug = normalizedKind.replace(/\s+/g, '-');
  return extractPublicationEvidenceTargets(value)
    .some(target => normalizePublicationEvidenceTargetBasename(target) === expectedSlug);
}

function normalizePublicationEvidenceTargetBasename(target: string): string {
  const normalizedTarget = normalizePublicationEvidenceTarget(target).replace(/\\/g, '/');
  const basename = normalizedTarget.split('/').filter(Boolean).pop() ?? normalizedTarget;
  return normalizeTechnicalAddendumEvidenceKind(basename.replace(/\.[a-z0-9]+$/i, '')).replace(/\s+/g, '-');
}

function technicalAddendumPublicationEvidenceKindTextSegments(value: string): string[] {
  return value
    .split(/[;\n|]+/)
    .map(stripLeadingTechnicalAddendumEvidenceTarget)
    .map(normalizeTechnicalAddendumEvidenceKind)
    .filter(segment => segment.length > 0);
}

function stripLeadingTechnicalAddendumEvidenceTarget(value: string): string {
  const trimmed = value.trim();
  const markdownMatch = /^\[[^\]]+\]\([^)]+\)/.exec(trimmed);
  if (markdownMatch) return trimmed.slice(markdownMatch[0].length).replace(/^[\s,.:;-]+/, '');

  const artifactMatch = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+/i.exec(trimmed);
  if (artifactMatch) return trimmed.slice(artifactMatch[0].length).replace(/^[\s,.:;-]+/, '');

  return trimmed;
}

function normalizeTechnicalAddendumEvidenceKind(value: string): string {
  return normalizeEvidenceMarkerText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeTechnicalAddendumEvidenceSegments(value: string): string[] {
  return value
    .split(/[\n\r|;]+|[.]\s+/)
    .map(segment => normalizeTechnicalAddendumEvidenceKind(segment))
    .filter(segment => segment.length > 0);
}

function hasExactReleaseGateStatusPassBinding(value: string): boolean {
  return hasExactTechnicalAddendumBinding(value, 'Release gate status', 'pass');
}

function hasExactReleaseSupportCandidateBinding(value: string): boolean {
  return hasExactTechnicalAddendumBinding(value, 'Release supported', 'production deployment candidate');
}

function hasExactProductionReadyClaimDeniedBinding(value: string): boolean {
  return hasExactTechnicalAddendumBinding(value, 'Production-ready claim allowed', 'no');
}

function mentionsReleaseGateStatusOrPass(value: string): boolean {
  return normalizeTechnicalAddendumEvidenceSegments(value).some(segment =>
    /\brelease gate status\b/.test(segment) ||
    /\brelease gate\b.{0,40}\b(pass|passed|passing)\b/.test(segment) ||
    /\b(pass|passed|passing)\b.{0,40}\brelease gate\b/.test(segment)
  );
}

function usesProseOnlyReleaseGateStatusPass(value: string): boolean {
  return mentionsReleaseGateStatusOrPass(value) && !hasExactReleaseGateStatusPassBinding(value);
}

function hasExactTestnetProductionCandidateClaimAllowanceBinding(value: string): boolean {
  return hasExactTechnicalAddendumBinding(
    value,
    'Testnet production-candidate claim allowed',
    'yes-after-release-gate-pass',
  );
}

function hasContradictoryTechnicalAddendumDecisionBinding(value: string): boolean {
  return (
    hasMixedTechnicalAddendumDecisionBindings(
      value,
      'Release supported',
      'none|validated\\s+PoC|institutional\\s+reference|production\\s+deployment\\s+candidate',
    ) ||
    hasMixedTechnicalAddendumDecisionBindings(value, 'Release gate status', 'pass|fail|blocked') ||
    hasOpposingTechnicalAddendumDecisionBindings(value, 'Production[-\\s]+ready claim allowed') ||
    hasOpposingTechnicalAddendumDecisionBindings(value, 'Mainnet deployment claim allowed') ||
    hasMixedTechnicalAddendumDecisionBindings(
      value,
      'Testnet production[-\\s]+candidate claim allowed',
      'yes-after-release-gate-pass|yes|no',
    )
  );
}

function hasMixedTechnicalAddendumDecisionBindings(
  value: string,
  fieldPattern: string,
  valuePattern: string,
): boolean {
  return exactTechnicalAddendumDecisionBindingValues(value, fieldPattern, valuePattern).size > 1;
}

function hasOpposingTechnicalAddendumDecisionBindings(value: string, fieldPattern: string): boolean {
  const values = exactTechnicalAddendumDecisionBindingValues(value, fieldPattern, 'yes|no');
  return values.has('yes') && values.has('no');
}

function exactTechnicalAddendumDecisionBindingValues(
  value: string,
  fieldPattern: string,
  valuePattern: string,
): Set<string> {
  const pattern = new RegExp(
    `\\b${fieldPattern}\\s*=\\s*(${valuePattern})\\s*(?:$|[.;,|)\\]\\r\\n])`,
    'ig',
  );
  return new Set(
    Array.from(value.matchAll(pattern), match => normalizeTechnicalAddendumEvidenceKind(match[1] ?? '')),
  );
}

function hasExactTechnicalAddendumBinding(value: string, field: string, expected: string): boolean {
  const fieldPattern = escapeRegExp(field).replace(/\s+/g, '\\s+');
  const expectedPattern = escapeRegExp(expected);
  return new RegExp(`\\b${fieldPattern}\\s*=\\s*${expectedPattern}\\s*(?:$|[.;,|)\\]\\r\\n])`, 'i')
    .test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionsTestnetProductionCandidateClaimAllowance(value: string): boolean {
  return normalizeTechnicalAddendumEvidenceSegments(value).some(segment =>
    /\btestnet production candidate claim allowed\b/.test(segment) ||
    /\btestnet production candidate\b.{0,80}\b(claim|claims|wording)\b.{0,80}\b(allow|allowed|approval|approved|support|supported|closure)\b/.test(segment) ||
    /\b(allow|allowed|approval|approved|support|supported|closure)\b.{0,80}\btestnet production candidate\b.{0,80}\b(claim|claims|wording)\b/.test(segment)
  );
}

function usesProseOnlyTestnetProductionCandidateClaimAllowance(value: string): boolean {
  return (
    mentionsTestnetProductionCandidateClaimAllowance(value) &&
    !hasExactTestnetProductionCandidateClaimAllowanceBinding(value)
  );
}

function hasTechnicalAddendumRowPayload(value: string, pattern: RegExp | undefined): boolean {
  if (!pattern) return false;
  return (
    !isGenericTechnicalAddendumRowPayload(value) &&
    hasNoContradictoryTechnicalAddendumEvidenceMarker(value) &&
    pattern.test(value)
  );
}

function isGenericTechnicalAddendumRowPayload(value: string): boolean {
  return /^(pass|passed|approved|reviewed|linked|yes|no|n\/a)$/i.test(value.trim());
}

function hasContradictoryTechnicalAddendumEvidenceMarker(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);
  return (
    /\b(?:status|result|validation|validator|command|run|outcome)\s*[:=]?\s*(?:FAIL(?:ED)?|BLOCKED|ERROR)\b/i.test(normalized) ||
    /\b(?:FAIL(?:ED)?|BLOCKED|ERROR)\b\s+(?:validation|validator|command|run|result|status|outcome)\b/i.test(normalized) ||
    hasAmbiguousTechnicalAddendumExitCode(normalized) ||
    hasAmbiguousTechnicalAddendumResultCount(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasUnresolvedIssueMarker(normalized) ||
    /\b[1-9]\d*\s+structural\s+issues?\b/i.test(normalized)
  );
}

function hasAmbiguousTechnicalAddendumExitCode(value: string): boolean {
  return /\bexit[- ]?code\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value);
}

function hasAmbiguousTechnicalAddendumResultCount(value: string): boolean {
  return /\b(?:errors?|structural\s+issues?)\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value);
}

function parseTableBetween(markdown: string, startHeading: string, endHeading?: string): string[][] {
  const section = endHeading
    ? sectionBetween(markdown, startHeading, endHeading)
    : sectionAfter(markdown, startHeading);
  const firstTableLine = section.search(/^\|/m);
  if (firstTableLine < 0) throw new Error(`${startHeading}: table not found`);
  return parseMarkdownTableRows(section.slice(firstTableLine));
}

function parseTwoColumnTable(section: string): Map<string, string> {
  return new Map(
    parseMarkdownTableRows(section)
      .filter(row => row.length >= 2)
      .map(row => [row[0], row[1]]),
  );
}

function parseFieldNamesFromTable(section: string): string[] {
  return parseMarkdownTableRows(section)
    .filter(row => row.length >= 1)
    .map(row => row[0]);
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

function sectionBetween(markdown: string, startHeading: string, endHeading: string): string {
  const start = markdown.indexOf(startHeading);
  if (start < 0) return '';
  const end = markdown.indexOf(endHeading, start + startHeading.length);
  return markdown.slice(start, end < 0 ? markdown.length : end);
}

function sectionAfter(markdown: string, startHeading: string): string {
  const start = markdown.indexOf(startHeading);
  return start < 0 ? '' : markdown.slice(start);
}

function headingLabel(heading: string): string {
  return heading.replace(/^#+\s*/, '');
}

function isBlank(value: string): boolean {
  return value.trim().length === 0 || /^<[^>]+>$/.test(value.trim());
}
