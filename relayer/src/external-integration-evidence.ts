import { basename } from 'path';

import { isIsoCalendarDate, validateIsoDateField } from './evidence-date.js';
import { isGitCommitSha, validateGitCommitField } from './evidence-git.js';
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

export type IntegrationEvidenceStatus = 'pending' | 'linked' | 'blocker';
export type ReviewerDecision = 'approve' | 'block';

export interface RequiredEntryPointRow {
  entryPoint: string;
  requiredCheck: string;
  evidence: string;
  status: string;
}

export interface FreshCheckoutCommandRow {
  command: string;
  evidence: string;
  status: string;
}

export interface IntegrationDecisionRow {
  decision: string;
  requiredAnswer: string;
  evidence: string;
  status: string;
}

export interface NegativeReviewRow {
  misread: string;
  expectedCorrection: string;
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

export interface ExternalIntegrationClassificationFields {
  gitCommit: string;
  releaseLevel: string;
  reviewerType: string;
  reviewerOrganization: string;
  environmentUsed: string;
  broadcastMode: string;
  privateMaintainerContextUsed: string;
  leadReviewer: string;
  date: string;
}

export interface ExternalIntegrationPublicationDecisionFields {
  publicInstitutionalReferenceReleaseAllowed: string;
  productionReadyClaimAllowed: string;
  testnetProductionCandidateClaimAllowed: string;
  privateMaintainerContextUsed: string;
  releaseNotesUpdated: string;
  requiredReleaseNoteUpdates: string;
  requiredChecklistUpdates: string;
  reviewerDecisionSummary: string;
}

export interface ExternalIntegrationEvidenceValidation {
  status: 'PASS' | 'BLOCKED';
  entryPointRows: RequiredEntryPointRow[];
  freshCheckoutRows: FreshCheckoutCommandRow[];
  decisionRows: IntegrationDecisionRow[];
  negativeReviewRows: NegativeReviewRow[];
  classification: Partial<ExternalIntegrationClassificationFields>;
  publicationDecision: Partial<ExternalIntegrationPublicationDecisionFields>;
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
  '## Required Entry Points',
  '## Fresh Checkout Commands',
  '## Integration Decision Record',
  '## Negative Review Checks',
  '## Publication Rules',
  '## Reviewer Sign-Off',
];

const REQUIRED_CLASSIFICATION_FIELDS = [
  'Review name',
  'Git commit',
  'Release level',
  'Reviewer type',
  'Reviewer organization',
  'Lead reviewer',
  'Environment used',
  'Broadcast mode',
  'Private maintainer context used',
  'Date',
];

const REQUIRED_PUBLICATION_RULE_FIELDS = [
  'Public institutional-reference release allowed',
  'Production-ready claim allowed',
  'Testnet production-candidate claim allowed',
  'Private maintainer context used',
  'Release notes updated',
  'Required release-note updates',
  'Required checklist updates',
  'Reviewer decision summary',
];

export const REQUIRED_EXTERNAL_INTEGRATION_ENTRY_POINTS = [
  'README',
  'Objective',
  'Roadmap',
  'Release checklist',
  'Contract/API reference',
  'Integration checklist',
  'Developer walkthrough',
  'Showcase',
  'Runbooks',
];

export const REQUIRED_EXTERNAL_INTEGRATION_DECISIONS = [
  'Which trust model applies today?',
  'Which signer path is allowed?',
  'How is broadcast enabled?',
  'Which path is still trusted-oracle?',
  'Which sidechain commitment format is expected?',
  'How are duplicate burns rejected?',
  'How are batches bounded?',
  'Which contract and relayer assumptions are stable?',
  'What blocks scaling claims?',
  'How is recovery performed?',
];

export const REQUIRED_EXTERNAL_INTEGRATION_FRESH_CHECKOUT_COMMANDS = [
  'npm ci',
  'npm run check',
  'npm run wasm:test',
  'npm run showcase',
];

const REQUIRED_DECISION_ANSWERS = [
  {
    decision: 'Which trust model applies today?',
    pattern: /\b(single signer|committee|trustless proof|trust model)\b/i,
    message: 'must state single signer, committee, trustless proof path, or the current trust model',
  },
  {
    decision: 'Which signer path is allowed?',
    pattern: /\blocal WASM signer\b.*\b(node-wallet|node wallet)\b|\b(node-wallet|node wallet)\b.*\blocal WASM signer\b/i,
    message: 'must state local WASM signer and that node-wallet signing is not the production path',
  },
  {
    decision: 'How is broadcast enabled?',
    pattern: /\bBRIDGE_BROADCAST_ENABLED=true\b.*\breadiness\b|\breadiness\b.*\bBRIDGE_BROADCAST_ENABLED=true\b/i,
    message: 'must state BRIDGE_BROADCAST_ENABLED=true and readiness review',
  },
  {
    decision: 'Which path is still trusted-oracle?',
    pattern: /\bburn\b.*\b(Phase 011|trusted-oracle|trusted oracle)\b|\b(Phase 011|trusted-oracle|trusted oracle)\b.*\bburn\b/i,
    message: 'must state burn interpretation remains trusted-oracle until Phase 011 evidence',
  },
  {
    decision: 'Which sidechain commitment format is expected?',
    pattern: /\b0x04xx\b.*\b(patched-devnet|current|limit)\b|\b(patched-devnet|current|limit)\b.*\b0x04xx\b/i,
    message: 'must state 0x04xx and the current patched-devnet limit',
  },
  {
    decision: 'How are duplicate burns rejected?',
    pattern: /\bDUP\b.*\bAVL\b.*\bconfirmation\b|\bAVL\b.*\bDUP\b.*\bconfirmation\b/i,
    message: 'must state DUP AVL proof and confirmation-time reconciliation',
  },
  {
    decision: 'How are batches bounded?',
    pattern: /\bclaim-core\b.*\bcontext-extension\b.*\bunlock cap\b|\bcontext-extension\b.*\bclaim-core\b.*\bunlock cap\b/i,
    message: 'must state claim-core, context-extension, and unlock cap limits',
  },
  {
    decision: 'Which contract and relayer assumptions are stable?',
    pattern: /\b(registers?|Var slots?|transaction shapes?|integration invariants?)\b/i,
    message: 'must cite registers, Var slots, transaction shapes, or integration invariants',
  },
  {
    decision: 'What blocks scaling claims?',
    pattern: /\bbenchmark evidence\b.*\blive sharded\b|\blive sharded\b.*\bbenchmark evidence\b/i,
    message: 'must state missing completed benchmark evidence and live sharded settlement',
  },
  {
    decision: 'How is recovery performed?',
    pattern: /\brunbooks?\b.*\bSQLite\b.*\bAVL\b.*\brestore\b|\bSQLite\b.*\bAVL\b.*\brestore\b.*\brunbooks?\b/i,
    message: 'must state runbooks plus SQLite/AVL restore evidence',
  },
];

const REQUIRED_DECISION_EVIDENCE_MARKERS: Record<string, { pattern: RegExp; message: string }[]> = {
  'Which trust model applies today?': [
    {
      pattern: /trust[- ]model|single[- ]signer|committee|trustless[- ]proof/i,
      message: 'evidence must identify trust-model decision evidence',
    },
  ],
  'Which signer path is allowed?': [
    {
      pattern: /signer|signing[- ]path|local[- ]wasm|node[- ]wallet/i,
      message: 'evidence must identify signer-path decision evidence',
    },
  ],
  'How is broadcast enabled?': [
    {
      pattern: /broadcast|BRIDGE_BROADCAST_ENABLED|readiness/i,
      message: 'evidence must identify broadcast-enablement decision evidence',
    },
  ],
  'Which path is still trusted-oracle?': [
    {
      pattern: /trusted[- ]oracle|burn[- ]interpretation|phase[- ]011/i,
      message: 'evidence must identify trusted-oracle burn decision evidence',
    },
  ],
  'Which sidechain commitment format is expected?': [
    {
      pattern: /sidechain[- ]commitment|0x04xx|patched[- ]devnet/i,
      message: 'evidence must identify sidechain-commitment decision evidence',
    },
  ],
  'How are duplicate burns rejected?': [
    {
      pattern: /duplicate[- ]burn|DUP|AVL|confirmation/i,
      message: 'evidence must identify duplicate-burn rejection decision evidence',
    },
  ],
  'How are batches bounded?': [
    {
      pattern: /batch(?:es)?|claim[- ]core|context[- ]extension|unlock[- ]cap/i,
      message: 'evidence must identify batch-boundary decision evidence',
    },
  ],
  'Which contract and relayer assumptions are stable?': [
    {
      pattern: /contract|relayer|registers?|Var slots?|transaction shapes?|integration invariants?/i,
      message: 'evidence must identify contract/relayer assumptions decision evidence',
    },
  ],
  'What blocks scaling claims?': [
    {
      pattern: /scaling|benchmark|live[- ]sharded|sharded/i,
      message: 'evidence must identify scaling-claim blocker decision evidence',
    },
  ],
  'How is recovery performed?': [
    {
      pattern: /recovery|runbooks?|SQLite|AVL|restore/i,
      message: 'evidence must identify recovery decision evidence',
    },
  ],
};

export const REQUIRED_EXTERNAL_INTEGRATION_NEGATIVE_MISREADS = [
  'The bridge is production-ready today',
  'Testnet or patched-devnet success implies mainnet readiness',
  'Node-wallet signing is acceptable for production',
  'Broadcast can happen implicitly',
  'Current burn verification is trustless',
  'FROST is the current committee implementation',
  'Sharded lanes already prove full L1 parallel settlement',
  'Offline showcase output is live benchmark evidence',
];

const REQUIRED_NEGATIVE_CORRECTIONS = [
  {
    misread: 'The bridge is production-ready today',
    pattern: /\bblocked\b.*\bpending evidence\b|\bpending evidence\b.*\bblocked\b/i,
    message: 'must state that production readiness is blocked by pending evidence',
  },
  {
    misread: 'Testnet or patched-devnet success implies mainnet readiness',
    pattern: /^(?=.*\bmainnet\b)(?=.*\b(?:production-ready|production ready|production-readiness|production readiness|readiness)\b)(?=.*\b(?:forbidden|out of scope|blocked|not allowed)\b)(?=.*\b(?:testnet production-candidate|testnet production candidate)\b)(?=.*\b(?:testnet production-grade|testnet production grade|production-grade testnet|production grade testnet)\b)(?=.*\b(?:complete|full)\b.*\b(?:evidence|proofs?)\b).*$/i,
    message: 'must state that mainnet production-ready/readiness claims are forbidden or out of scope and only testnet production-candidate or production-grade testnet claims can be evaluated with complete evidence',
  },
  {
    misread: 'Node-wallet signing is acceptable for production',
    pattern: /\blocal WASM signing\b.*\b(node-wallet|node wallet)\b|\b(node-wallet|node wallet)\b.*\blocal WASM signing\b/i,
    message: 'must state that production signing uses local WASM signing and blocks node-wallet signing',
  },
  {
    misread: 'Broadcast can happen implicitly',
    pattern: /\bexplicit opt-in\b.*\breadiness\b|\breadiness\b.*\bexplicit opt-in\b/i,
    message: 'must state that broadcast requires explicit opt-in and readiness review',
  },
  {
    misread: 'Current burn verification is trustless',
    pattern: /\btrustless burn verification\b.*\bPhase 011\b|\bPhase 011\b.*\btrustless burn verification\b/i,
    message: 'must state that trustless burn verification remains Phase 011 evidence',
  },
  {
    misread: 'FROST is the current committee implementation',
    pattern: /\bPhase 010a\b.*atLeast\(\)|atLeast\(\).*FROST.*\bdeferred\b/i,
    message: 'must state that Phase 010a uses atLeast() and FROST is deferred',
  },
  {
    misread: 'Sharded lanes already prove full L1 parallel settlement',
    pattern: /\bSPVTracker\b.*\bshared input\b|\bpre-ingest\b|\btracker sharding\b/i,
    message: 'must state that SPVTracker remains shared until mitigation',
  },
  {
    misread: 'Offline showcase output is live benchmark evidence',
    pattern: /\blive\b.*\bbenchmark evidence\b|\blive lifecycle\b.*\blinked separately\b/i,
    message: 'must state that live lifecycle and benchmark evidence must be linked separately',
  },
];

const REQUIRED_NEGATIVE_EVIDENCE_MARKERS: Record<string, { pattern: RegExp; message: string }[]> = {
  'The bridge is production-ready today': [
    {
      pattern: /production[- ]ready|production[- ]readiness|pending[- ]evidence|release[- ]checklist/i,
      message: 'evidence must identify production-readiness blocker correction',
    },
  ],
  'Testnet or patched-devnet success implies mainnet readiness': [
    {
      pattern: /mainnet[- ]readiness|production[- ]deployment[- ]candidate|testnet|patched[- ]devnet/i,
      message: 'evidence must identify mainnet-readiness correction',
    },
  ],
  'Node-wallet signing is acceptable for production': [
    {
      pattern: /node[- ]wallet|local[- ]wasm[- ]signing|signing[- ]path/i,
      message: 'evidence must identify node-wallet signing correction',
    },
  ],
  'Broadcast can happen implicitly': [
    {
      pattern: /broadcast|explicit[- ]opt[- ]in|readiness/i,
      message: 'evidence must identify explicit broadcast opt-in correction',
    },
  ],
  'Current burn verification is trustless': [
    {
      pattern: /trustless[- ]burn|burn[- ]verification|phase[- ]011/i,
      message: 'evidence must identify trustless-burn boundary correction',
    },
  ],
  'FROST is the current committee implementation': [
    {
      pattern: /frost|atleast|phase[- ]010a|committee[- ]implementation/i,
      message: 'evidence must identify FROST deferral correction',
    },
  ],
  'Sharded lanes already prove full L1 parallel settlement': [
    {
      pattern: /sharded[- ]lanes|spvtracker|shared[- ]input|tracker[- ]sharding|pre[- ]ingest/i,
      message: 'evidence must identify sharded-lane settlement correction',
    },
  ],
  'Offline showcase output is live benchmark evidence': [
    {
      pattern: /offline[- ]showcase|live[- ]benchmark|benchmark[- ]evidence|live[- ]lifecycle/i,
      message: 'evidence must identify live benchmark evidence correction',
    },
  ],
};

export const REQUIRED_EXTERNAL_INTEGRATION_REVIEWER_ROLES = [
  'Integration reviewer',
  'Security reviewer',
  'Operator reviewer',
];

const ALLOWED_STATUSES = new Set<IntegrationEvidenceStatus>(['pending', 'linked', 'blocker']);
const ALLOWED_RELEASE_LEVELS = new Set([
  'validated PoC',
  'institutional reference',
  'production deployment candidate',
]);
const ALLOWED_REVIEWER_TYPES = new Set([
  'maintainer',
  'independent engineer',
  'exchange integration engineer',
]);
const PASSING_REVIEWER_TYPES = new Set([
  'independent engineer',
  'exchange integration engineer',
]);
const ALLOWED_ENVIRONMENTS = new Set(['clean checkout', 'local offline', 'patched devnet', 'testnet']);
const ALLOWED_BROADCAST_MODES = new Set(['disabled', 'dry-run', 'enabled']);
const ALLOWED_YES_NO = new Set(['yes', 'no']);
const ALLOWED_REVIEWER_DECISIONS = new Set<ReviewerDecision>(['approve', 'block']);
const EXTERNAL_INTEGRATION_APPROVAL_PATTERN =
  '(?:accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|support|supported|supports|permit|permitted|permits|clear|cleared|clears|enable|enabled|enables|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits)';
const PRIVATE_MAINTAINER_CONTEXT_APPROVAL_PATTERN = EXTERNAL_INTEGRATION_APPROVAL_PATTERN;
const GENERIC_REVIEWER_ORGANIZATION_VALUES = new Set([
  'affiliation',
  'exchange',
  'exchange integration engineer',
  'external',
  'external reviewer',
  'independent',
  'independent engineer',
  'internal',
  'internal team',
  'maintainer',
  'n/a',
  'none',
  'not applicable',
  'organization',
  'project team',
  'reviewer',
  'reviewer affiliation',
  'reviewer organization',
  'tbd',
  'todo',
  'unknown',
]);

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

export function parseEntryPointRows(markdown: string): RequiredEntryPointRow[] {
  return parseTableBetween(markdown, '## Required Entry Points', '## Fresh Checkout Commands').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Required Entry Points row: ${row.join(' | ')}`);
    return {
      entryPoint: row[0],
      requiredCheck: row[1],
      evidence: row[2],
      status: row[3],
    };
  });
}

export function parseFreshCheckoutCommandRows(markdown: string): FreshCheckoutCommandRow[] {
  return parseTableBetween(markdown, '## Fresh Checkout Commands', '## Integration Decision Record').map(row => {
    if (row.length !== 3) throw new Error(`Malformed Fresh Checkout Commands row: ${row.join(' | ')}`);
    return {
      command: row[0],
      evidence: row[1],
      status: row[2],
    };
  });
}

export function validateExternalIntegrationEvidence(markdown: string): ExternalIntegrationEvidenceValidation {
  const entryPoints = parseRowsSafely(() => parseEntryPointRows(markdown));
  const freshCheckout = parseRowsSafely(() => parseFreshCheckoutCommandRows(markdown));
  const decisions = parseRowsSafely(() => parseDecisionRows(markdown));
  const negatives = parseRowsSafely(() => parseNegativeReviewRows(markdown));
  const reviewers = parseRowsSafely(() => parseReviewerRows(markdown));
  const entryPointRows = entryPoints.rows;
  const freshCheckoutRows = freshCheckout.rows;
  const decisionRows = decisions.rows;
  const negativeReviewRows = negatives.rows;
  const reviewerRows = reviewers.rows;
  const reviewClassification = parseTwoColumnTable(sectionBetween(markdown, '## Review Classification', '## Required Entry Points'));
  const classification = parseClassification(markdown);
  const publicationDecision = parsePublicationRules(markdown);
  const reviewCommit = reviewClassification.get('Git commit')?.trim() ?? '';
  const errors = [
    ...validateEvidenceHygiene(markdown, 'External Integration Evidence'),
    ...validateRequiredSections(markdown),
    ...validateClassification(markdown),
    ...validateFreshCheckoutCommands(markdown),
    ...entryPoints.errors,
    ...freshCheckout.errors,
    ...decisions.errors,
    ...negatives.errors,
    ...reviewers.errors,
    ...validateEntryPointRows(entryPointRows),
    ...validateFreshCheckoutRows(freshCheckoutRows, reviewCommit),
    ...validateDecisionRows(decisionRows),
    ...validateNegativeReviewRows(negativeReviewRows),
    ...validatePublicationRules(markdown),
    ...validateReviewerRows(reviewerRows),
    ...validateReviewerIdentityConsistency(markdown, reviewerRows),
    ...validateReviewerDateConsistency(markdown, reviewerRows),
  ];

  if (errors.length > 0) {
    return {
      status: 'BLOCKED',
      entryPointRows,
      freshCheckoutRows,
      decisionRows,
      negativeReviewRows,
      classification,
      publicationDecision,
      reviewerRows,
      errors,
      message: `External integration evidence BLOCKED: ${errors.length} structural issue(s).`,
    };
  }

  return {
    status: 'PASS',
    entryPointRows,
    freshCheckoutRows,
    decisionRows,
    negativeReviewRows,
    classification,
    publicationDecision,
    reviewerRows,
    errors: [],
    message: `External integration evidence PASS: ${entryPointRows.length} entry points and ${freshCheckoutRows.length} fresh-checkout commands are linked.`,
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

function parseDecisionRows(markdown: string): IntegrationDecisionRow[] {
  return parseTableBetween(markdown, '## Integration Decision Record', '## Negative Review Checks').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Integration Decision Record row: ${row.join(' | ')}`);
    return {
      decision: row[0],
      requiredAnswer: row[1],
      evidence: row[2],
      status: row[3],
    };
  });
}

function parseNegativeReviewRows(markdown: string): NegativeReviewRow[] {
  return parseTableBetween(markdown, '## Negative Review Checks', '## Publication Rules').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Negative Review Checks row: ${row.join(' | ')}`);
    return {
      misread: row[0],
      expectedCorrection: row[1],
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

function parseClassification(markdown: string): Partial<ExternalIntegrationClassificationFields> {
  const fields = parseTwoColumnTable(sectionBetween(markdown, '## Review Classification', '## Required Entry Points'));
  return {
    gitCommit: fields.get('Git commit'),
    releaseLevel: fields.get('Release level'),
    reviewerType: fields.get('Reviewer type'),
    reviewerOrganization: fields.get('Reviewer organization'),
    environmentUsed: fields.get('Environment used'),
    broadcastMode: fields.get('Broadcast mode'),
    privateMaintainerContextUsed: fields.get('Private maintainer context used'),
    leadReviewer: fields.get('Lead reviewer'),
    date: fields.get('Date'),
  };
}

function parsePublicationRules(markdown: string): Partial<ExternalIntegrationPublicationDecisionFields> {
  const fields = parseTwoColumnTable(sectionBetween(markdown, '## Publication Rules', '## Reviewer Sign-Off'));
  return {
    publicInstitutionalReferenceReleaseAllowed: fields.get('Public institutional-reference release allowed'),
    productionReadyClaimAllowed: fields.get('Production-ready claim allowed'),
    testnetProductionCandidateClaimAllowed: fields.get('Testnet production-candidate claim allowed'),
    privateMaintainerContextUsed: fields.get('Private maintainer context used'),
    releaseNotesUpdated: fields.get('Release notes updated'),
    requiredReleaseNoteUpdates: fields.get('Required release-note updates'),
    requiredChecklistUpdates: fields.get('Required checklist updates'),
    reviewerDecisionSummary: fields.get('Reviewer decision summary'),
  };
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
  const section = sectionBetween(markdown, '## Review Classification', '## Required Entry Points');
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
  validateAllowedField(errors, fields, 'Review Classification', 'Reviewer type', ALLOWED_REVIEWER_TYPES);
  validateAllowedField(errors, fields, 'Review Classification', 'Environment used', ALLOWED_ENVIRONMENTS);
  validateAllowedField(errors, fields, 'Review Classification', 'Broadcast mode', ALLOWED_BROADCAST_MODES);
  validateAllowedField(errors, fields, 'Review Classification', 'Private maintainer context used', ALLOWED_YES_NO);
  validateGitCommitField(errors, fields, 'Review Classification', 'Git commit');
  validateIsoDateField(errors, fields, 'Review Classification', 'Date');
  const releaseLevel = fields.get('Release level') ?? '';
  const environmentUsed = fields.get('Environment used') ?? '';
  if (releaseLevel === 'production deployment candidate' && environmentUsed !== 'testnet') {
    errors.push(
      'Review Classification: production deployment candidate classification must be testnet-scoped for Gate 8 evidence',
    );
  }
  const broadcastMode = fields.get('Broadcast mode') ?? '';
  if (broadcastMode === 'enabled') {
    errors.push('Review Classification: Broadcast mode must be disabled or dry-run before Gate 8 evidence can pass');
  }
  const reviewerType = fields.get('Reviewer type') ?? '';
  if (
    !isBlank(reviewerType) &&
    ALLOWED_REVIEWER_TYPES.has(reviewerType) &&
    !PASSING_REVIEWER_TYPES.has(reviewerType)
  ) {
    errors.push(
      'Review Classification: Reviewer type must be independent engineer or exchange integration engineer before Gate 8 evidence can pass',
    );
  }
  const privateMaintainerContextUsed = fields.get('Private maintainer context used') ?? '';
  if (privateMaintainerContextUsed === 'yes') {
    errors.push(
      'Review Classification: Private maintainer context used must be no before Gate 8 evidence can pass',
    );
  }
  const reviewerOrganization = fields.get('Reviewer organization') ?? '';
  if (!isBlank(reviewerOrganization) && !isConcreteExternalIntegrationReviewerOrganization(reviewerOrganization)) {
    errors.push(
      'Review Classification: Reviewer organization must identify a concrete external organization or affiliation',
    );
  }

  return errors;
}

function validateFreshCheckoutCommands(markdown: string): string[] {
  const section = sectionBetween(markdown, '## Fresh Checkout Commands', '## Integration Decision Record');
  const errors: string[] = [];

  for (const command of REQUIRED_EXTERNAL_INTEGRATION_FRESH_CHECKOUT_COMMANDS) {
    if (!new RegExp(`\\b${escapeRegExp(command)}\\b`).test(section)) {
      errors.push(`Fresh Checkout Commands: missing required command ${command}`);
    }
  }

  if (!hasFreshCheckoutCompletedEvidence(section)) {
    errors.push(
      'Fresh Checkout Commands: section must include completed command output evidence, a non-template evidence link, or an artifact marker',
    );
  }

  return errors;
}

function validateEntryPointRows(rows: RequiredEntryPointRow[]): string[] {
  const errors = validateRequiredNames('Required Entry Points', rows.map(row => row.entryPoint), REQUIRED_EXTERNAL_INTEGRATION_ENTRY_POINTS);

  for (const row of rows) {
    if (!REQUIRED_EXTERNAL_INTEGRATION_ENTRY_POINTS.includes(row.entryPoint)) {
      errors.push(`Required Entry Points: ${row.entryPoint}: unexpected entry point`);
    }
    validateStatus(errors, 'Required Entry Points', row.entryPoint, row.status);
    if (isBlank(row.requiredCheck)) {
      errors.push(`Required Entry Points: ${row.entryPoint}: required check is required`);
    }
    if (!hasEvidenceMarker(row.evidence)) {
      errors.push(`Required Entry Points: ${row.entryPoint}: evidence link is required`);
    } else if (row.status === 'linked' && !hasCompletedExternalIntegrationEvidenceTarget(row.evidence)) {
      errors.push(
        `Required Entry Points: ${row.entryPoint}: linked status requires completed integration evidence with an artifact marker or non-template evidence link`,
      );
    }
    if (row.status === 'linked' && !hasCompletedEntryPointReviewEvidence(row.evidence)) {
      errors.push(
        `Required Entry Points: ${row.entryPoint}: linked status requires completed entry-point review evidence beyond the entrypoint document link`,
      );
    }
    if (row.status === 'linked' && !hasNoContradictoryExternalIntegrationReviewEvidenceMarker(row.evidence)) {
      errors.push(`Required Entry Points: ${row.entryPoint}: evidence must not include contradictory external-integration failure markers`);
    }
    if (row.status === 'linked' && admitsPrivateMaintainerContext(row.evidence)) {
      errors.push(`Required Entry Points: ${row.entryPoint}: evidence must not admit private maintainer context`);
    }
  }

  return errors;
}

function validateFreshCheckoutRows(rows: FreshCheckoutCommandRow[], reviewCommit: string): string[] {
  const errors = validateRequiredNames('Fresh Checkout Commands', rows.map(row => row.command), REQUIRED_EXTERNAL_INTEGRATION_FRESH_CHECKOUT_COMMANDS);

  for (const row of rows) {
    if (!REQUIRED_EXTERNAL_INTEGRATION_FRESH_CHECKOUT_COMMANDS.includes(row.command)) {
      errors.push(`Fresh Checkout Commands: ${row.command}: unexpected command`);
    }
    validateStatus(errors, 'Fresh Checkout Commands', row.command, row.status);
    if (row.status === 'linked' && !hasFreshCheckoutCompletedEvidence(row.evidence)) {
      errors.push(
        `Fresh Checkout Commands: ${row.command}: linked status requires an artifact marker or non-template evidence link for completed command output`,
      );
    }
    if (row.status === 'linked' && !freshCheckoutEvidenceIdentifiesCommand(row.command, row.evidence)) {
      errors.push(`Fresh Checkout Commands: ${row.command}: evidence must identify ${row.command} output`);
    }
    if (row.status === 'linked' && !hasFreshCheckoutContextEvidence(row.evidence)) {
      errors.push(`Fresh Checkout Commands: ${row.command}: evidence must identify fresh checkout or clean checkout context`);
    }
    if (row.status === 'linked' && !hasNoContradictoryExternalIntegrationReviewEvidenceMarker(row.evidence)) {
      errors.push(`Fresh Checkout Commands: ${row.command}: evidence must not include contradictory external-integration failure markers`);
    }
    if (row.status === 'linked' && !hasFreshCheckoutGitCommitEvidence(row.evidence)) {
      errors.push(`Fresh Checkout Commands: ${row.command}: evidence must identify the fresh checkout Git commit`);
    } else if (
      row.status === 'linked' &&
      isGitCommitSha(reviewCommit) &&
      !freshCheckoutEvidenceMatchesReviewCommit(row.evidence, reviewCommit)
    ) {
      errors.push(`Fresh Checkout Commands: ${row.command}: evidence must match Review Classification Git commit ${reviewCommit}`);
    }
    if (row.status === 'linked' && !hasExplicitCommandExitCodeZero(row.evidence)) {
      errors.push(
        `Fresh Checkout Commands: ${row.command}: evidence must include command output with exit code 0`,
      );
    } else if (row.status === 'linked' && hasContradictoryValidationFailureMarker(row.evidence)) {
      errors.push(
        `Fresh Checkout Commands: ${row.command}: evidence must contain internally positive command output with exit code 0`,
      );
    }
    if (row.status === 'linked' && admitsPrivateMaintainerContext(row.evidence)) {
      errors.push(`Fresh Checkout Commands: ${row.command}: evidence must not admit private maintainer context`);
    }
  }

  return errors;
}

function validateDecisionRows(rows: IntegrationDecisionRow[]): string[] {
  const errors = validateRequiredNames('Integration Decision Record', rows.map(row => row.decision), REQUIRED_EXTERNAL_INTEGRATION_DECISIONS);

  for (const row of rows) {
    if (!REQUIRED_EXTERNAL_INTEGRATION_DECISIONS.includes(row.decision)) {
      errors.push(`Integration Decision Record: ${row.decision}: unexpected decision`);
    }
    validateStatus(errors, 'Integration Decision Record', row.decision, row.status);
    if (isBlank(row.requiredAnswer)) {
      errors.push(`Integration Decision Record: ${row.decision}: required answer is required`);
    }
    const requiredAnswer = REQUIRED_DECISION_ANSWERS.find(answer => answer.decision === row.decision);
    if (
      requiredAnswer &&
      !isBlank(row.requiredAnswer) &&
      !requiredAnswer.pattern.test(row.requiredAnswer)
    ) {
      errors.push(`Integration Decision Record: ${row.decision}: required answer ${requiredAnswer.message}`);
    }
    if (row.status === 'linked' && !hasEvidenceMarker(row.evidence)) {
      errors.push(`Integration Decision Record: ${row.decision}: linked status requires evidence`);
    } else if (row.status === 'linked' && !hasCompletedExternalIntegrationEvidenceTarget(row.evidence)) {
      errors.push(
        `Integration Decision Record: ${row.decision}: linked status requires completed integration evidence with an artifact marker or non-template evidence link`,
      );
    }
    if (row.status === 'linked') {
      for (const marker of REQUIRED_DECISION_EVIDENCE_MARKERS[row.decision] ?? []) {
        if (!marker.pattern.test(row.evidence)) {
          errors.push(`Integration Decision Record: ${row.decision}: ${marker.message}`);
        }
      }
      if (!hasNoContradictoryExternalIntegrationReviewEvidenceMarker(row.evidence)) {
        errors.push(
          `Integration Decision Record: ${row.decision}: evidence must not include contradictory external-integration failure markers`,
        );
      }
      if (admitsPrivateMaintainerContext(row.evidence)) {
        errors.push(`Integration Decision Record: ${row.decision}: evidence must not admit private maintainer context`);
      }
    }
  }

  return errors;
}

export function hasExpectedExternalIntegrationDecisionAnswer(
  decision: string,
  requiredAnswer: string,
): boolean {
  const expectedAnswer = REQUIRED_DECISION_ANSWERS.find(answer => answer.decision === decision);
  return Boolean(
    expectedAnswer &&
    !isBlank(requiredAnswer) &&
    expectedAnswer.pattern.test(requiredAnswer),
  );
}

function validateNegativeReviewRows(rows: NegativeReviewRow[]): string[] {
  const errors = validateRequiredNames('Negative Review Checks', rows.map(row => row.misread), REQUIRED_EXTERNAL_INTEGRATION_NEGATIVE_MISREADS);

  for (const row of rows) {
    if (!REQUIRED_EXTERNAL_INTEGRATION_NEGATIVE_MISREADS.includes(row.misread)) {
      errors.push(`Negative Review Checks: ${row.misread}: unexpected misread`);
    }
    if (isBlank(row.expectedCorrection)) {
      errors.push(`Negative Review Checks: ${row.misread}: expected correction is required`);
    }
    const requiredCorrection = REQUIRED_NEGATIVE_CORRECTIONS.find(correction => correction.misread === row.misread);
    if (
      requiredCorrection &&
      !isBlank(row.expectedCorrection) &&
      !requiredCorrection.pattern.test(row.expectedCorrection)
    ) {
      errors.push(`Negative Review Checks: ${row.misread}: expected correction ${requiredCorrection.message}`);
    }
    validateStatus(errors, 'Negative Review Checks', row.misread, row.status);
    if (row.status === 'linked' && !hasEvidenceMarker(row.evidence)) {
      errors.push(`Negative Review Checks: ${row.misread}: linked status requires evidence`);
    } else if (row.status === 'linked' && !hasCompletedExternalIntegrationEvidenceTarget(row.evidence)) {
      errors.push(
        `Negative Review Checks: ${row.misread}: linked status requires completed correction evidence with an artifact marker or non-template evidence link`,
      );
    }
    if (row.status === 'linked') {
      for (const marker of REQUIRED_NEGATIVE_EVIDENCE_MARKERS[row.misread] ?? []) {
        if (!marker.pattern.test(row.evidence)) {
          errors.push(`Negative Review Checks: ${row.misread}: ${marker.message}`);
        }
      }
      if (!hasNoContradictoryExternalIntegrationReviewEvidenceMarker(row.evidence)) {
        errors.push(
          `Negative Review Checks: ${row.misread}: evidence must not include contradictory external-integration failure markers`,
        );
      }
      if (admitsPrivateMaintainerContext(row.evidence)) {
        errors.push(`Negative Review Checks: ${row.misread}: evidence must not admit private maintainer context`);
      }
    }
  }

  return errors;
}

export function hasExpectedExternalIntegrationNegativeCorrection(
  misread: string,
  expectedCorrection: string,
): boolean {
  const requiredCorrection = REQUIRED_NEGATIVE_CORRECTIONS.find(correction => correction.misread === misread);
  return Boolean(
    requiredCorrection &&
    !isBlank(expectedCorrection) &&
    requiredCorrection.pattern.test(expectedCorrection),
  );
}

function validatePublicationRules(markdown: string): string[] {
  const section = sectionBetween(markdown, '## Publication Rules', '## Reviewer Sign-Off');
  const classification = parseTwoColumnTable(sectionBetween(markdown, '## Review Classification', '## Required Entry Points'));
  const errors = validateDuplicateRequiredFields(
    'Publication Rules',
    parseTwoColumnFieldNames(section),
    REQUIRED_PUBLICATION_RULE_FIELDS,
  );

  if (!/^\|/m.test(section)) {
    errors.push('Publication Rules: table not found');
    return errors;
  }

  const fields = parseTwoColumnTable(section);

  for (const field of REQUIRED_PUBLICATION_RULE_FIELDS) {
    if (isBlank(fields.get(field) ?? '')) errors.push(`Publication Rules: ${field} is required`);
  }

  validateAllowedField(errors, fields, 'Publication Rules', 'Public institutional-reference release allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, fields, 'Publication Rules', 'Production-ready claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, fields, 'Publication Rules', 'Testnet production-candidate claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, fields, 'Publication Rules', 'Private maintainer context used', ALLOWED_YES_NO);
  validateAllowedField(errors, fields, 'Publication Rules', 'Release notes updated', ALLOWED_YES_NO);

  const releaseLevel = classification.get('Release level') ?? '';
  const environmentUsed = classification.get('Environment used') ?? '';
  const publicReleaseAllowed = fields.get('Public institutional-reference release allowed') ?? '';
  if (publicReleaseAllowed === 'no') {
    errors.push(
      'Publication Rules: Public institutional-reference release allowed must be yes before Gate 8 evidence can pass',
    );
  } else if (publicReleaseAllowed === 'yes' && releaseLevel === 'validated PoC') {
    errors.push(
      'Publication Rules: Public institutional-reference release allowed requires institutional reference or production deployment candidate release level',
    );
  }

  const productionReadyClaimAllowed = fields.get('Production-ready claim allowed') ?? '';
  if (productionReadyClaimAllowed === 'yes') {
    errors.push(
      'Publication Rules: external integration review cannot allow production-ready claims',
    );
  }
  const testnetProductionCandidateClaimAllowed =
    fields.get('Testnet production-candidate claim allowed') ?? '';
  if (releaseLevel === 'production deployment candidate' && testnetProductionCandidateClaimAllowed !== 'yes') {
    errors.push(
      'Publication Rules: Testnet production-candidate claim allowed must be yes for production deployment candidate evidence',
    );
  }
  if (testnetProductionCandidateClaimAllowed === 'yes' && releaseLevel !== 'production deployment candidate') {
    errors.push(
      'Publication Rules: Testnet production-candidate claim allowed = yes requires Release level = production deployment candidate',
    );
  }
  if (testnetProductionCandidateClaimAllowed === 'yes' && environmentUsed !== 'testnet') {
    errors.push(
      'Publication Rules: Testnet production-candidate claim allowed = yes requires Environment used = testnet',
    );
  }

  const publicationPrivateContext = fields.get('Private maintainer context used') ?? '';
  const classificationPrivateContext = classification.get('Private maintainer context used') ?? '';
  if (publicationPrivateContext === 'yes') {
    errors.push('Publication Rules: Private maintainer context used must be no before Gate 8 evidence can pass');
  }
  if (
    !isBlank(publicationPrivateContext) &&
    !isBlank(classificationPrivateContext) &&
    publicationPrivateContext !== classificationPrivateContext
  ) {
    errors.push('Publication Rules: Private maintainer context used must match Review Classification');
  }

  if (fields.get('Release notes updated') === 'no') {
    errors.push('Publication Rules: Release notes updated must be yes before Gate 8 evidence can pass');
  }

  const normalizedTestnetProductionCandidateClaimAllowed = normalizeYesNoClaimAllowance(
    testnetProductionCandidateClaimAllowed,
  );
  const requiresProductionCandidateReleaseSupport =
    releaseLevel === 'production deployment candidate';
  const releaseNoteUpdates = fields.get('Required release-note updates') ?? '';
  if (!identifiesExternalIntegrationPublicationEvidenceKind(
    releaseNoteUpdates,
    'completed Gate 8 integration release-note update evidence',
  )) {
    errors.push(
      'Publication Rules: Required release-note updates must include completed Gate 8 integration release-note update evidence',
    );
  }
  if (!isBlank(releaseNoteUpdates) && !hasCompletedExternalIntegrationEvidenceTarget(releaseNoteUpdates)) {
    errors.push(
      'Publication Rules: Required release-note updates requires completed release-note update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  }
  if (!isBlank(releaseNoteUpdates) && !hasNoContradictoryExternalIntegrationEvidenceMarker(releaseNoteUpdates)) {
    errors.push(
      'Publication Rules: Required release-note updates must not include contradictory external-integration failure markers',
    );
  }
  if (!isBlank(releaseNoteUpdates) && hasContradictoryGate8PublicationDecisionBinding(releaseNoteUpdates)) {
    errors.push(
      'Publication Rules: Required release-note updates must not include contradictory external-integration decision bindings',
    );
  }
  if (!isBlank(releaseNoteUpdates) && leavesPublicInstitutionalReferenceReleaseUnresolved(releaseNoteUpdates)) {
    errors.push(
      'Publication Rules: Required release-note updates must not leave public institutional-reference release unresolved',
    );
  }
  if (!isBlank(releaseNoteUpdates) && admitsPrivateMaintainerContext(releaseNoteUpdates)) {
    errors.push('Publication Rules: Required release-note updates must not admit private maintainer context');
  }
  if (!isBlank(releaseNoteUpdates) && usesProseOnlyPrivateContextDenial(releaseNoteUpdates)) {
    errors.push(
      'Publication Rules: Required release-note updates must use exact Private maintainer context used = no; prose-only private-context denial is not accepted',
    );
  }
  if (
    publicationPrivateContext === 'no' &&
    !isBlank(releaseNoteUpdates) &&
    !hasExactNoPrivateMaintainerContextBinding(releaseNoteUpdates)
  ) {
    errors.push(
      'Publication Rules: Required release-note updates must include exact Private maintainer context used = no',
    );
  }
  if (!isBlank(releaseNoteUpdates) && usesProseOnlyPublicInstitutionalReferenceReleaseApproval(releaseNoteUpdates)) {
    errors.push(
      'Publication Rules: Required release-note updates must use exact Public institutional-reference release allowed = yes; prose-only public release approval is not accepted',
    );
  }
  if (
    requiresProductionCandidateReleaseSupport &&
    !isBlank(releaseNoteUpdates) &&
    !hasExactReleaseSupportedProductionDeploymentCandidateBinding(releaseNoteUpdates)
  ) {
    errors.push(
      'Publication Rules: Required release-note updates must include exact Release supported = production deployment candidate',
    );
  }
  if (
    publicReleaseAllowed === 'yes' &&
    !isBlank(releaseNoteUpdates) &&
    !hasExactPublicInstitutionalReferenceReleaseAllowedBinding(releaseNoteUpdates)
  ) {
    errors.push(
      'Publication Rules: Required release-note updates must include exact Public institutional-reference release allowed = yes',
    );
  }
  if (
    productionReadyClaimAllowed === 'no' &&
    !isBlank(releaseNoteUpdates) &&
    !hasExactProductionReadyClaimDeniedBinding(releaseNoteUpdates)
  ) {
    errors.push(
      'Publication Rules: Required release-note updates must include exact Production-ready claim allowed = no',
    );
  }
  if (
    normalizedTestnetProductionCandidateClaimAllowed !== undefined &&
    !isBlank(releaseNoteUpdates) &&
    !hasExactTestnetProductionCandidateClaimAllowedBinding(
      releaseNoteUpdates,
      normalizedTestnetProductionCandidateClaimAllowed,
    )
  ) {
    errors.push(
      `Publication Rules: Required release-note updates must include exact Testnet production-candidate claim allowed = ${normalizedTestnetProductionCandidateClaimAllowed}`,
    );
  }
  if (!isBlank(releaseNoteUpdates) && containsMainnetProductionClaim(releaseNoteUpdates)) {
    errors.push('Publication Rules: Required release-note updates must not contain mainnet production claim wording');
  }
  if (!isBlank(releaseNoteUpdates) && containsProductionReadyClaim(releaseNoteUpdates)) {
    errors.push('Publication Rules: Required release-note updates must not contain production-ready claim wording');
  }

  const checklistUpdates = fields.get('Required checklist updates') ?? '';
  if (!identifiesExternalIntegrationPublicationEvidenceKind(
    checklistUpdates,
    'completed Gate 8 checklist update evidence',
  )) {
    errors.push(
      'Publication Rules: Required checklist updates must include completed Gate 8 checklist update evidence',
    );
  }
  if (!isBlank(checklistUpdates) && !hasCompletedExternalIntegrationEvidenceTarget(checklistUpdates)) {
    errors.push(
      'Publication Rules: Required checklist updates requires completed checklist update evidence with an artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  }
  if (!isBlank(checklistUpdates) && !hasNoContradictoryExternalIntegrationEvidenceMarker(checklistUpdates)) {
    errors.push(
      'Publication Rules: Required checklist updates must not include contradictory external-integration failure markers',
    );
  }
  if (!isBlank(checklistUpdates) && hasContradictoryGate8PublicationDecisionBinding(checklistUpdates)) {
    errors.push(
      'Publication Rules: Required checklist updates must not include contradictory external-integration decision bindings',
    );
  }
  if (!isBlank(checklistUpdates) && leavesPublicInstitutionalReferenceReleaseUnresolved(checklistUpdates)) {
    errors.push(
      'Publication Rules: Required checklist updates must not leave public institutional-reference release unresolved',
    );
  }
  if (!isBlank(checklistUpdates) && admitsPrivateMaintainerContext(checklistUpdates)) {
    errors.push('Publication Rules: Required checklist updates must not admit private maintainer context');
  }
  if (!isBlank(checklistUpdates) && usesProseOnlyPrivateContextDenial(checklistUpdates)) {
    errors.push(
      'Publication Rules: Required checklist updates must use exact Private maintainer context used = no; prose-only private-context denial is not accepted',
    );
  }
  if (
    publicationPrivateContext === 'no' &&
    !isBlank(checklistUpdates) &&
    !hasExactNoPrivateMaintainerContextBinding(checklistUpdates)
  ) {
    errors.push(
      'Publication Rules: Required checklist updates must include exact Private maintainer context used = no',
    );
  }
  if (!isBlank(checklistUpdates) && usesProseOnlyPublicInstitutionalReferenceReleaseApproval(checklistUpdates)) {
    errors.push(
      'Publication Rules: Required checklist updates must use exact Public institutional-reference release allowed = yes; prose-only public release approval is not accepted',
    );
  }
  if (
    requiresProductionCandidateReleaseSupport &&
    !isBlank(checklistUpdates) &&
    !hasExactReleaseSupportedProductionDeploymentCandidateBinding(checklistUpdates)
  ) {
    errors.push(
      'Publication Rules: Required checklist updates must include exact Release supported = production deployment candidate',
    );
  }
  if (
    publicReleaseAllowed === 'yes' &&
    !isBlank(checklistUpdates) &&
    !hasExactPublicInstitutionalReferenceReleaseAllowedBinding(checklistUpdates)
  ) {
    errors.push(
      'Publication Rules: Required checklist updates must include exact Public institutional-reference release allowed = yes',
    );
  }
  if (
    productionReadyClaimAllowed === 'no' &&
    !isBlank(checklistUpdates) &&
    !hasExactProductionReadyClaimDeniedBinding(checklistUpdates)
  ) {
    errors.push(
      'Publication Rules: Required checklist updates must include exact Production-ready claim allowed = no',
    );
  }
  if (
    normalizedTestnetProductionCandidateClaimAllowed !== undefined &&
    !isBlank(checklistUpdates) &&
    !hasExactTestnetProductionCandidateClaimAllowedBinding(
      checklistUpdates,
      normalizedTestnetProductionCandidateClaimAllowed,
    )
  ) {
    errors.push(
      `Publication Rules: Required checklist updates must include exact Testnet production-candidate claim allowed = ${normalizedTestnetProductionCandidateClaimAllowed}`,
    );
  }
  if (!isBlank(checklistUpdates) && containsMainnetProductionClaim(checklistUpdates)) {
    errors.push('Publication Rules: Required checklist updates must not contain mainnet production claim wording');
  }
  if (!isBlank(checklistUpdates) && containsProductionReadyClaim(checklistUpdates)) {
    errors.push('Publication Rules: Required checklist updates must not contain production-ready claim wording');
  }
  if (
    hasCompletedExternalIntegrationReleaseNoteUpdateEvidence(releaseNoteUpdates) &&
    hasCompletedExternalIntegrationChecklistUpdateEvidence(checklistUpdates) &&
    haveSharedConcreteExternalIntegrationEvidenceTarget(releaseNoteUpdates, checklistUpdates)
  ) {
    errors.push(
      'Publication Rules: Required release-note updates and Required checklist updates must use distinct completed Gate 8 integration evidence targets',
    );
  }

  const decisionSummary = fields.get('Reviewer decision summary') ?? '';
  errors.push(
    ...validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Rules: Reviewer decision summary',
      summary: decisionSummary,
      productionReadyClaimAllowed,
      testnetProductionCandidateClaimAllowed: normalizeYesNoClaimAllowance(testnetProductionCandidateClaimAllowed),
    }),
  );
  if (!isBlank(decisionSummary) && approvesMainnetReleaseReadinessOrProductionReadyWording(decisionSummary)) {
    errors.push(
      'Publication Rules: Reviewer decision summary must not approve mainnet release-readiness or production-ready wording',
    );
  }
  if (!isBlank(decisionSummary) && hasContradictoryGate8PublicationDecisionBinding(decisionSummary)) {
    errors.push(
      'Publication Rules: Reviewer decision summary must not include contradictory external-integration decision bindings',
    );
  }
  if (publicReleaseAllowed === 'yes' && !summaryAllowsPublicInstitutionalReferenceRelease(decisionSummary)) {
    errors.push(
      'Publication Rules: Reviewer decision summary must include public institutional-reference release allowed = yes',
    );
  }
  if (
    requiresProductionCandidateReleaseSupport &&
    !isBlank(decisionSummary) &&
    !hasExactReleaseSupportedProductionDeploymentCandidateBinding(decisionSummary)
  ) {
    errors.push(
      'Publication Rules: Reviewer decision summary must use exact Release supported = production deployment candidate',
    );
  }
  if (
    productionReadyClaimAllowed === 'no' &&
    !isBlank(decisionSummary) &&
    !hasExactProductionReadyClaimDeniedBinding(decisionSummary)
  ) {
    errors.push(
      'Publication Rules: Reviewer decision summary must use exact Production-ready claim allowed = no',
    );
  }
  if (
    normalizedTestnetProductionCandidateClaimAllowed !== undefined &&
    !hasExactTestnetProductionCandidateClaimAllowedBinding(
      decisionSummary,
      normalizedTestnetProductionCandidateClaimAllowed,
    )
  ) {
    errors.push(
      `Publication Rules: Reviewer decision summary must include Testnet production-candidate claim allowed = ${normalizedTestnetProductionCandidateClaimAllowed}`,
    );
  }
  if (
    !isBlank(decisionSummary) &&
    (
      admitsPrivateMaintainerContext(decisionSummary) ||
      (
        mentionsPrivateMaintainerContext(decisionSummary) &&
        !confirmsNoPrivateMaintainerContextInSummary(decisionSummary)
      )
    )
  ) {
    errors.push(
      'Publication Rules: Reviewer decision summary: private maintainer context must be absent or explicitly no',
    );
  }
  if (!isBlank(decisionSummary) && leavesPrivateMaintainerContextUnresolved(decisionSummary)) {
    errors.push(
      'Publication Rules: Reviewer decision summary must not leave private maintainer context unresolved',
    );
  }
  if (!isBlank(decisionSummary) && leavesPublicInstitutionalReferenceReleaseUnresolved(decisionSummary)) {
    errors.push(
      'Publication Rules: Reviewer decision summary must not leave public institutional-reference release unresolved',
    );
  }
  if (
    !isBlank(decisionSummary) &&
    mentionsPrivateMaintainerContext(decisionSummary) &&
    !hasExactNoPrivateMaintainerContextBinding(decisionSummary)
  ) {
    errors.push(
      'Publication Rules: Reviewer decision summary must use exact Private maintainer context used = no',
    );
  }
  if (
    !isBlank(decisionSummary) &&
    !(
      /\b(public institutional-reference release|institutional-reference release)\b/i.test(decisionSummary) &&
      summaryMentionsProductionReadyClaimHandling(decisionSummary) &&
      (
        normalizeYesNoClaimAllowance(testnetProductionCandidateClaimAllowed) === undefined ||
        summaryMentionsTestnetProductionCandidateClaimHandling(decisionSummary)
      ) &&
      /\b(allow|allowed|approve|approved|block|blocked|disallow|disallowed|not allowed)\b/i.test(decisionSummary)
    )
  ) {
    errors.push(
      'Publication Rules: Reviewer decision summary must mention public institutional-reference release, production-ready claim handling, and testnet production-candidate claim handling',
    );
  }

  return errors;
}

function normalizeYesNoClaimAllowance(value: string): 'yes' | 'no' | undefined {
  return value === 'yes' || value === 'no' ? value : undefined;
}

function summaryMentionsProductionReadyClaimHandling(value: string): boolean {
  const normalized = normalizeExternalIntegrationEvidenceKind(value);
  return /\bproduction ready claim handling\b/.test(normalized);
}

function summaryMentionsTestnetProductionCandidateClaimHandling(value: string): boolean {
  const normalized = normalizeExternalIntegrationEvidenceKind(value);
  return /\btestnet production candidate claim handling\b/.test(normalized);
}

function mentionsPrivateMaintainerContext(value: string): boolean {
  return /\bprivate (?:maintainer )?context\b/.test(normalizeExternalIntegrationEvidenceKind(value));
}

function confirmsNoPrivateMaintainerContextInSummary(value: string): boolean {
  const normalized = normalizeExternalIntegrationEvidenceKind(value);
  return (
    /\bprivate maintainer context used no\b/.test(normalized) ||
    /\bno private (?:maintainer )?context\b/.test(normalized) ||
    /\b(?:absent|absence of|lack of|lacking) private (?:maintainer )?context\b/.test(normalized) ||
    /\bevidence lacks private (?:maintainer )?context\b/.test(normalized) ||
    /\bwithout private (?:maintainer )?context\b/.test(normalized) ||
    /\b(?:not|never)\s+used\s+private (?:maintainer )?context\b/.test(normalized) ||
    /\bprivate (?:maintainer )?context (?:absent|not used|unused|blocked|forbidden|not allowed)\b/.test(normalized)
  );
}

function hasExactNoPrivateMaintainerContextBinding(value: string): boolean {
  return hasExactGate8PublicationBinding(value, 'Private maintainer context used', 'no');
}

function usesProseOnlyPrivateContextDenial(value: string): boolean {
  return (
    mentionsPrivateMaintainerContext(value) &&
    confirmsNoPrivateMaintainerContextInSummary(value) &&
    !hasExactNoPrivateMaintainerContextBinding(value)
  );
}

function mentionsPublicInstitutionalReferenceRelease(value: string): boolean {
  return /\b(?:public institutional reference release|institutional reference release)\b/.test(
    normalizeExternalIntegrationEvidenceKind(value),
  );
}

function hasExactPublicInstitutionalReferenceReleaseAllowedBinding(value: string): boolean {
  return hasExactGate8PublicationBinding(value, 'Public institutional-reference release allowed', 'yes');
}

function hasExactProductionReadyClaimDeniedBinding(value: string): boolean {
  return hasExactGate8PublicationBinding(value, 'Production-ready claim allowed', 'no');
}

function hasExactReleaseSupportedProductionDeploymentCandidateBinding(value: string): boolean {
  return hasExactGate8PublicationBinding(value, 'Release supported', 'production deployment candidate');
}

function hasExactTestnetProductionCandidateClaimAllowedBinding(
  value: string,
  expected: 'yes' | 'no',
): boolean {
  return hasExactGate8PublicationBinding(value, 'Testnet production-candidate claim allowed', expected);
}

function hasExactGate8PublicationBinding(value: string, field: string, expected: string): boolean {
  const nextGate8Field =
    '(?:Release supported|Private maintainer context used|Public institutional-reference release allowed|Production-ready claim allowed|Testnet production-candidate claim allowed)\\s*=';
  return new RegExp(
    `\\b${escapeRegExp(field)}\\s*=\\s*${escapeRegExp(expected)}\\s*(?=$|[.;,|)\\]\\r\\n]|${nextGate8Field})`,
    'i',
  ).test(value);
}

function hasContradictoryGate8PublicationDecisionBinding(value: string): boolean {
  return (
    hasOpposingGate8BinaryPublicationDecisionBindings(value, 'Private maintainer context used') ||
    hasOpposingGate8BinaryPublicationDecisionBindings(value, 'Public institutional-reference release allowed') ||
    hasOpposingGate8BinaryPublicationDecisionBindings(value, 'Production-ready claim allowed') ||
    hasOpposingGate8BinaryPublicationDecisionBindings(value, 'Testnet production-candidate claim allowed')
  );
}

function hasOpposingGate8BinaryPublicationDecisionBindings(value: string, field: string): boolean {
  const values = exactGate8PublicationDecisionBindingValues(value, field, 'yes|no');
  return values.has('yes') && values.has('no');
}

function exactGate8PublicationDecisionBindingValues(value: string, field: string, valuePattern: string): Set<string> {
  const pattern = new RegExp(
    `\\b${field.split(/[- ]+/).map(escapeRegExp).join('[- ]+')}\\s*=\\s*(${valuePattern})\\s*(?:$|[.;,|)\\]\\r\\n])`,
    'ig',
  );
  return new Set([...value.matchAll(pattern)].map(match => match[1].toLowerCase()));
}

function confirmsPublicInstitutionalReferenceReleaseApproval(value: string): boolean {
  const subject = '(?:public institutional reference release|institutional reference release)';
  const approval = EXTERNAL_INTEGRATION_APPROVAL_PATTERN;
  return normalizeExternalIntegrationEvidenceKindSegments(value).some(segment =>
    !claimEscalationApprovalIsNegated(segment, subject, approval) &&
    (
      new RegExp(`\\b${subject}\\b(?:\\s+[a-z0-9]+){0,3}\\s+(?:${approval}|yes)\\b`).test(segment) ||
      new RegExp(`\\b${approval}\\b(?:\\s+[a-z0-9]+){0,2}\\s+${subject}\\b`).test(segment) ||
      new RegExp(`\\b${subject}\\s+handling\\s+(?:allowed|yes)\\b`).test(segment)
    )
  );
}

function usesProseOnlyPublicInstitutionalReferenceReleaseApproval(value: string): boolean {
  return (
    mentionsPublicInstitutionalReferenceRelease(value) &&
    confirmsPublicInstitutionalReferenceReleaseApproval(value) &&
    !hasExactPublicInstitutionalReferenceReleaseAllowedBinding(value)
  );
}

function admitsPrivateMaintainerContext(value: string): boolean {
  const normalized = normalizeExternalIntegrationEvidenceKind(value);
  const approvalPattern = PRIVATE_MAINTAINER_CONTEXT_APPROVAL_PATTERN;
  return (
    /\bprivate (?:maintainer )?context used yes\b/.test(normalized) ||
    approvesPrivateMaintainerContext(value) ||
    (
      new RegExp(`\\b(?:used|provided|required|needed|available|relied|${approvalPattern})\\s+private (?:maintainer )?context\\b`).test(normalized) &&
      !confirmsNoPrivateMaintainerContextInSummary(value)
    ) ||
    (
      new RegExp(`\\bprivate (?:maintainer )?context\\s+(?:was\\s+)?(?:used|provided|required|needed|available|relied|${approvalPattern})\\b`).test(normalized) &&
      !confirmsNoPrivateMaintainerContextInSummary(value)
    ) ||
    (
      mentionsPrivateMaintainerContext(value) &&
      new RegExp(`\\b(?:yes|used|required|provided|needed|available|relied|${approvalPattern})\\b`).test(normalized) &&
      !confirmsNoPrivateMaintainerContextInSummary(value)
    )
  );
}

function leavesPrivateMaintainerContextUnresolved(value: string): boolean {
  const subject = 'private (?:maintainer )?context';
  const unresolvedState = '(?:open|pending|unresolved|outstanding|remaining|awaiting|waiting(?:\\s+(?:for|on))?|deferred)';

  return normalizeExternalIntegrationEvidenceKindSegments(value).some(segment => {
    if (!new RegExp(`\\b${subject}\\b`).test(segment)) return false;
    if (
      new RegExp(`\\b(?:no|none|zero)\\s+(?:${unresolvedState}\\s+)?${subject}\\b`).test(segment) ||
      new RegExp(`\\b(?:without|absence of|lack of|lacking)\\s+${subject}\\b`).test(segment) ||
      new RegExp(`\\b${subject}\\s+(?:absent|not used|unused|blocked|forbidden|not allowed)\\b`).test(segment)
    ) {
      return false;
    }

    return (
      new RegExp(`\\b${subject}\\s+(?:is\\s+|was\\s+|remain\\s+|remains\\s+)?${unresolvedState}\\b`).test(segment) ||
      new RegExp(`\\b${unresolvedState}\\s+${subject}\\b`).test(segment)
    );
  });
}

function leavesPublicInstitutionalReferenceReleaseUnresolved(value: string): boolean {
  const subject = '(?:public institutional reference release|institutional reference release)';
  const unresolvedState = '(?:open|pending|unresolved|outstanding|remaining|awaiting|waiting(?:\\s+(?:for|on))?|deferred)';

  return normalizeExternalIntegrationEvidenceKindSegments(value).some(segment => {
    if (!new RegExp(`\\b${subject}\\b`).test(segment)) return false;
    if (
      new RegExp(`\\b(?:no|none|zero)\\s+(?:${unresolvedState}\\s+)?${subject}\\b`).test(segment) ||
      new RegExp(`\\b(?:without|absence of|lack of|lacking)\\s+(?:${unresolvedState}\\s+)?${subject}\\b`).test(segment) ||
      new RegExp(`\\b${subject}\\s+(?:allowed|approved|accepted|complete|completed|closed|resolved|not\\s+${unresolvedState})\\b`).test(segment)
    ) {
      return false;
    }

    return (
      new RegExp(`\\b${subject}\\s+(?:is\\s+|was\\s+|remain\\s+|remains\\s+)?${unresolvedState}\\b`).test(segment) ||
      new RegExp(`\\b${unresolvedState}\\s+${subject}\\b`).test(segment)
    );
  });
}

function approvesPrivateMaintainerContext(value: string): boolean {
  const approvalPattern = PRIVATE_MAINTAINER_CONTEXT_APPROVAL_PATTERN;
  return normalizeExternalIntegrationEvidenceKindSegments(value).some(segment =>
    !privateMaintainerContextApprovalIsNegated(segment, approvalPattern) &&
    externalIntegrationTextApprovesSubject(segment, 'private (?:maintainer )?context', approvalPattern),
  );
}

function approvesMainnetReleaseReadinessOrProductionReadyWording(value: string): boolean {
  const subject =
    '(?:mainnet release readiness(?:\\s+claims?)?|production ready(?:\\s+(?:wording|claims?))?|' +
    'mainnet production(?:\\s+(?:wording|claims?|release))?)';
  const approval = EXTERNAL_INTEGRATION_APPROVAL_PATTERN;

  return normalizeExternalIntegrationEvidenceKindSegments(value).some(segment =>
    !claimEscalationApprovalIsNegated(segment, subject, approval) &&
    externalIntegrationTextApprovesSubject(segment, subject, approval),
  );
}

function externalIntegrationTextApprovesSubject(segment: string, subject: string, approval: string): boolean {
  const subjectApprovalConnector =
    '(?:\\s+(?!\\b(?:but|however|though|although|except|unless|not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,3}';
  const approvalSubjectConnector =
    '(?:\\s+(?!\\b(?:but|however|though|although|except|unless|not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,2}';

  return [
    new RegExp(`\\b${subject}\\b${subjectApprovalConnector}\\s+${approval}\\b`, 'g'),
    new RegExp(`\\b${approval}\\b${approvalSubjectConnector}\\s+${subject}\\b`, 'g'),
  ].some(pattern => hasUnnegatedExternalIntegrationApprovalMatch(segment, pattern));
}

function hasUnnegatedExternalIntegrationApprovalMatch(segment: string, pattern: RegExp): boolean {
  for (const match of segment.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = segment.slice(Math.max(0, index - 32), index);
    if (/\b(?:no|not|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?\s+$/.test(prefix)) continue;
    return true;
  }
  return false;
}

function privateMaintainerContextApprovalIsNegated(segment: string, approvalPattern: string): boolean {
  return (
    new RegExp(`\\bprivate (?:maintainer )?context\\b(?:\\s+[a-z0-9]+){0,3}\\s+(?:not|never)\\s+${approvalPattern}\\b`).test(segment) ||
    new RegExp(`\\b(?:not|never)\\s+${approvalPattern}\\b(?:\\s+[a-z0-9]+){0,2}\\s+private (?:maintainer )?context\\b`).test(segment)
  );
}

function claimEscalationApprovalIsNegated(segment: string, subject: string, approval: string): boolean {
  return (
    new RegExp(`\\b(?:do not|does not|must not|not to|never)\\s+${approval}\\b(?:\\s+[a-z0-9]+){0,2}\\s+${subject}\\b(?:\\s+wording)?`).test(segment) ||
    new RegExp(`\\b${subject}\\b(?:\\s+[a-z0-9]+){0,2}\\s+(?:not|never)\\s+${approval}\\b`).test(segment) ||
    new RegExp(`\\b${subject}\\b(?:\\s+[a-z0-9]+){0,2}\\s+${approval}\\b\\s+(?:no|false|0|blocked|forbidden|disabled|rejected|refused|not\\s+allowed)\\b`).test(segment)
  );
}

function summaryAllowsPublicInstitutionalReferenceRelease(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (
    /\b(?:public institutional reference release|institutional reference release)\s+(?:is\s+)?(?:blocked|block|disallowed|disallow|rejected|reject|refused|refuse|not allowed|forbidden)\b/.test(normalized) ||
    /\b(?:blocked|block|disallowed|disallow|rejected|reject|refused|refuse|not allowed|forbidden)\s+(?:public institutional reference release|institutional reference release)\b/.test(normalized)
  ) {
    return false;
  }

  return hasExactPublicInstitutionalReferenceReleaseAllowedBinding(value);
}

function validateReviewerRows(rows: ReviewerSignoffRow[]): string[] {
  const errors = validateRequiredNames('Reviewer Sign-Off', rows.map(row => row.role), REQUIRED_EXTERNAL_INTEGRATION_REVIEWER_ROLES);

  for (const row of rows) {
    if (!REQUIRED_EXTERNAL_INTEGRATION_REVIEWER_ROLES.includes(row.role)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: unexpected role`);
    }
    if (isBlank(row.name)) errors.push(`Reviewer Sign-Off: ${row.role}: name is required`);
    if (!ALLOWED_REVIEWER_DECISIONS.has(row.decision as ReviewerDecision)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve or block`);
    } else if (row.decision !== 'approve') {
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve before Gate 8 evidence can pass`);
    }
    if (isBlank(row.date)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: Date must use YYYY-MM-DD`);
    }
    if (isBlank(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes are required`);
    } else if (!hasNoContradictoryExternalIntegrationReviewEvidenceMarker(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not include contradictory external-integration failure markers`);
    } else if (leavesPrivateMaintainerContextUnresolved(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not leave private maintainer context unresolved`);
    } else if (leavesPublicInstitutionalReferenceReleaseUnresolved(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not leave public institutional-reference release unresolved`);
    } else if (admitsPrivateMaintainerContext(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not admit private maintainer context`);
    } else if (containsMainnetProductionClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not contain mainnet production claim wording`);
    } else if (containsProductionReadyClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not contain production-ready claim wording`);
    } else if (!isActionableReviewerNote(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must state a concrete external-integration outcome`);
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
  const classification = parseTwoColumnTable(sectionBetween(markdown, '## Review Classification', '## Required Entry Points'));
  const leadReviewer = classification.get('Lead reviewer')?.trim() ?? '';
  const integrationReviewer = rows.find(row => row.role === 'Integration reviewer')?.name.trim() ?? '';

  if (
    leadReviewer.length > 0 &&
    integrationReviewer.length > 0 &&
    leadReviewer !== integrationReviewer
  ) {
    return ['Reviewer Sign-Off: Integration reviewer: name must match Review Classification Lead reviewer'];
  }

  return [];
}

function validateReviewerDateConsistency(markdown: string, rows: ReviewerSignoffRow[]): string[] {
  const classification = parseTwoColumnTable(sectionBetween(markdown, '## Review Classification', '## Required Entry Points'));
  const classificationDate = classification.get('Date')?.trim() ?? '';
  if (!isIsoCalendarDate(classificationDate)) return [];

  return rows
    .filter(row => isIsoCalendarDate(row.date) && row.date < classificationDate)
    .map(row => `Reviewer Sign-Off: ${row.role}: Date must not be before Review Classification Date`);
}

function validateStatus(errors: string[], section: string, label: string, status: string): void {
  if (!ALLOWED_STATUSES.has(status as IntegrationEvidenceStatus)) {
    errors.push(`${section}: ${label}: status must be pending, linked, or blocker`);
    return;
  }
  if (status !== 'linked') {
    errors.push(`${section}: ${label}: status must be linked before Gate 8 evidence can pass`);
  }
}


function isActionableReviewerNote(value: string): boolean {
  return (
    hasNoContradictoryExternalIntegrationReviewEvidenceMarker(value) &&
    /\b(accept|accepted|approve|approved|verify|verified|validate|validated|confirm|confirmed|pass|passed|block|blocked|fail|failed|correct|corrected|trace|traced|reproduce|reproduced|complete|completed)\b/i.test(value) &&
    /\b(external integration|integration package|fresh checkout|entry point|decision record|negative review|misread|private maintainer context|release blocker|trust model|signer path|broadcast|trusted-oracle|trustless burn|FROST|sharded|SPVTracker|benchmark evidence|runbook|operator-ready)\b/i.test(value)
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
  return /\[[^\]]+\]\([^)]+\)/.test(value) || /\bnpm run [A-Za-z0-9:_-]+\b/.test(value) || /(?:^|\s)artifact:\/\//.test(value);
}

function hasCompletedEvidenceMarker(value: string): boolean {
  return (
    hasCompletedArtifactTarget(value) ||
    hasNonTemplateMarkdownLink(value) ||
    hasCommandOutputMarker(value)
  );
}

function hasNonTemplateMarkdownLink(value: string): boolean {
  const links = [...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
  return links.some(([, rawTarget]) => isConcreteEvidenceTarget(rawTarget));
}

function hasCommandOutputMarker(value: string): boolean {
  return (
    /\bnpm run [A-Za-z0-9:_-]+\b/.test(value) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(value)
  );
}

function hasFreshCheckoutCompletedEvidence(value: string): boolean {
  return hasCompletedExternalIntegrationEvidenceTarget(value);
}

function hasCompletedLinkedReviewEvidenceTarget(value: string): boolean {
  return hasCompletedArtifactTarget(value) || hasEvidenceReviewMarkdownLink(value);
}

export function hasCompletedExternalIntegrationEvidenceTarget(value: string): boolean {
  const completedEvidenceText = externalIntegrationCompletedEvidenceText(value);
  return !hasLocalOnlyEvidenceTarget(value) &&
    !hasClaimEscalatingExternalIntegrationEvidenceReference(value) &&
    hasCompletedLinkedReviewEvidenceTarget(completedEvidenceText);
}

export function hasCompletedExternalIntegrationReleaseNoteUpdateEvidence(value: string): boolean {
  return (
    hasCompletedExternalIntegrationEvidenceTarget(value) &&
    identifiesExternalIntegrationPublicationEvidenceKind(
      value,
      'completed Gate 8 integration release-note update evidence',
    ) &&
    hasNoContradictoryExternalIntegrationEvidenceMarker(value)
  );
}

export function hasCompletedExternalIntegrationChecklistUpdateEvidence(value: string): boolean {
  return (
    hasCompletedExternalIntegrationEvidenceTarget(value) &&
    identifiesExternalIntegrationPublicationEvidenceKind(
      value,
      'completed Gate 8 checklist update evidence',
    ) &&
    hasNoContradictoryExternalIntegrationEvidenceMarker(value)
  );
}

export function hasNoContradictoryExternalIntegrationEvidenceMarker(value: string): boolean {
  return !hasContradictoryValidationFailureMarker(value);
}

export function hasNoContradictoryExternalIntegrationReviewEvidenceMarker(value: string): boolean {
  return !hasContradictoryReviewEvidenceFailureMarker(value);
}

function identifiesExternalIntegrationPublicationEvidenceKind(value: string, evidenceKind: string): boolean {
  const normalizedKind = normalizeExternalIntegrationEvidenceKind(evidenceKind);
  return externalIntegrationPublicationEvidenceTargetsIdentifyKind(value, normalizedKind) ||
    externalIntegrationPublicationEvidenceKindTextSegments(value)
      .some(segment =>
        segment === normalizedKind ||
        segment.startsWith(`${normalizedKind} `)
      );
}

function externalIntegrationPublicationEvidenceTargetsIdentifyKind(value: string, normalizedKind: string): boolean {
  const expectedSlug = normalizedKind.replace(/\s+/g, '-');
  return extractExternalIntegrationEvidenceTargets(value)
    .some(target => normalizeExternalIntegrationEvidenceTargetBasename(target) === expectedSlug);
}

function normalizeExternalIntegrationEvidenceTargetBasename(target: string): string {
  const normalizedTarget = normalizeExternalIntegrationEvidenceTarget(target).replace(/\\/g, '/');
  const basename = normalizedTarget.split('/').filter(Boolean).pop() ?? normalizedTarget;
  return normalizeExternalIntegrationEvidenceKind(basename.replace(/\.[a-z0-9]+$/i, '')).replace(/\s+/g, '-');
}

function externalIntegrationPublicationEvidenceKindTextSegments(value: string): string[] {
  return value
    .split(/[;\n|]+/)
    .map(stripLeadingExternalIntegrationEvidenceTarget)
    .map(normalizeExternalIntegrationEvidenceKind)
    .filter(segment => segment.length > 0);
}

function stripLeadingExternalIntegrationEvidenceTarget(value: string): string {
  const trimmed = value.trim();
  const markdownMatch = /^\[[^\]]+\]\([^)]+\)/.exec(trimmed);
  if (markdownMatch) return trimmed.slice(markdownMatch[0].length).replace(/^[\s,.:;-]+/, '');

  const artifactMatch = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+/i.exec(trimmed);
  if (artifactMatch) return trimmed.slice(artifactMatch[0].length).replace(/^[\s,.:;-]+/, '');

  return trimmed;
}

function normalizeExternalIntegrationEvidenceKind(value: string): string {
  return normalizeEvidenceMarkerText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeExternalIntegrationEvidenceKindSegments(value: string): string[] {
  return value
    .split(/[\n\r|;]+|[.]\s+/)
    .map(normalizeExternalIntegrationEvidenceKind)
    .filter(segment => segment.length > 0);
}

function hasCompletedEntryPointReviewEvidence(value: string): boolean {
  return (
    hasEntryPointReviewMarker(value) &&
    hasNoPrivateContextMarker(value) &&
    hasCompletedExternalIntegrationEvidenceTarget(value)
  );
}

function findExternalIntegrationValidationTargetBinding(value: string): RegExpExecArray | null {
  return /\b(?:validated target|validated input|integration validate target|integration validation target|external integration validation target)\b/i
    .exec(value);
}

function hasCompletedArtifactTarget(value: string): boolean {
  return extractArtifactTargets(value).some(isConcreteArtifactTarget);
}

function extractArtifactTargets(value: string): string[] {
  return [...value.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+)/g)]
    .map(([, target]) => target.replace(/[.;]+$/g, ''));
}

function extractExternalIntegrationEvidenceTargets(value: string): string[] {
  return [
    ...extractArtifactTargets(value),
    ...[...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(([, target]) => target),
  ];
}

function extractCompletedExternalIntegrationEvidenceTargets(value: string): string[] {
  return extractExternalIntegrationEvidenceTargets(externalIntegrationCompletedEvidenceText(value));
}

function externalIntegrationCompletedEvidenceText(value: string): string {
  return value
    .split(/[;\n]+/)
    .map(segment => {
      const targetBinding = findExternalIntegrationValidationTargetBinding(segment);
      return targetBinding
        ? segment.slice(0, targetBinding.index).trim()
        : segment.trim();
    })
    .filter(segment => segment.length > 0)
    .join('; ');
}

function normalizeExternalIntegrationEvidenceTarget(target: string): string {
  return target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').trim().toLowerCase();
}

function hasClaimEscalatingExternalIntegrationEvidenceReference(value: string): boolean {
  return extractExternalIntegrationEvidenceTargets(value)
    .some(target => hasClaimEscalatingExternalIntegrationEvidenceTarget(target));
}

function hasClaimEscalatingExternalIntegrationEvidenceTarget(target: string): boolean {
  const comparable = normalizeExternalIntegrationEvidenceKind(target);
  return (
    approvesControlledTestnetProductionCandidateEvidenceTarget(comparable) ||
    approvesMainnetReleaseReadinessOrProductionReadyWording(comparable) ||
    admitsPrivateMaintainerContext(comparable)
  );
}

function approvesControlledTestnetProductionCandidateEvidenceTarget(value: string): boolean {
  if (!classifyPublicationClaimText(value).hasControlledTestnetProductionClaim) return false;
  return new RegExp(`\\b${EXTERNAL_INTEGRATION_APPROVAL_PATTERN}\\b`, 'i').test(value);
}

function haveSharedConcreteExternalIntegrationEvidenceTarget(left: string, right: string): boolean {
  const leftTargets = new Set(
    extractCompletedExternalIntegrationEvidenceTargets(left)
      .map(normalizeExternalIntegrationEvidenceTarget)
      .filter(isConcreteEvidenceTarget),
  );
  return extractCompletedExternalIntegrationEvidenceTargets(right)
    .map(normalizeExternalIntegrationEvidenceTarget)
    .filter(isConcreteEvidenceTarget)
    .some(target => leftTargets.has(target));
}

function hasEntryPointReviewMarker(value: string): boolean {
  return /\bentry[- ]?point\b/i.test(value) && /\breview\b/i.test(value);
}

function hasNoPrivateContextMarker(value: string): boolean {
  return /without private (?:maintainer )?context|no private (?:maintainer )?context|private maintainer context used\s*=\s*no/i.test(value);
}

function hasEvidenceReviewMarkdownLink(value: string): boolean {
  const links = [...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
  return links.some(([, rawTarget]) => {
    const target = rawTarget.trim();
    return (
      isConcreteEvidenceTarget(target) &&
      /\b(evidence|review|artifact|log|transcript)\b/i.test(target)
    );
  });
}

function isConcreteEvidenceTarget(target: string): boolean {
  const trimmed = target.trim();
  if (hasClaimEscalatingExternalIntegrationEvidenceTarget(trimmed)) return false;
  if (/^artifact:\/\//i.test(trimmed)) return isConcreteArtifactTarget(trimmed);
  const path = trimmed.split(/[?#]/, 1)[0];
  if (isLocalOnlyEvidenceTarget(path)) return false;
  if (isSensitiveOrRuntimeExternalIntegrationEvidenceTarget(path)) return false;
  return (
    !/-template\.md$/i.test(path) &&
    path.split(/[\\/]+/).every(segment => !isNonConcreteEvidenceSegment(segment))
  );
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

function isSensitiveOrRuntimeExternalIntegrationEvidenceTarget(target: string): boolean {
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(isSensitiveOrRuntimeExternalIntegrationEvidenceInspectionTarget);
}

function isSensitiveOrRuntimeExternalIntegrationEvidenceInspectionTarget(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasExternalIntegrationEnvironmentTargetSegment(normalizedTarget) ||
    hasExternalIntegrationRuntimeDatabaseTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalizedTarget, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
  );
}

function hasExternalIntegrationEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasExternalIntegrationRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function isConcreteArtifactTarget(target: string): boolean {
  const match = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/(.+)$/i.exec(target.trim());
  if (match === null) return false;
  const path = match[1].split(/[?#]/, 1)[0];
  if (hasClaimEscalatingExternalIntegrationEvidenceTarget(path)) return false;
  return path.split(/[\\/]+/).every(segment => !isNonConcreteEvidenceSegment(segment));
}

function isNonConcreteEvidenceSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /(?:^|[-_.])(?:not[-_]?completed|uncompleted)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])template(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])sample(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|integration|entry|entrypoint|fresh|checkout|decision|negative|review|release|checklist)|$)/i.test(normalized) ||
    /(?:^|[-_.])example(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|validator|integration|entry|entrypoint|fresh|checkout|decision|negative|review|release|checklist)|$)/i.test(normalized)
  );
}

function hasExplicitCommandExitCodeZero(value: string): boolean {
  return /\b(exit code|exit status|status|code)\s*(?:=|:)?\s*0(?=$|[\s,.;:|)\]])/i.test(value);
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

function hasContradictoryReviewEvidenceFailureMarker(value: string): boolean {
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

function freshCheckoutEvidenceIdentifiesCommand(command: string, evidence: string): boolean {
  const commandPattern = new RegExp(`\\b${escapeRegExp(command)}\\b`, 'i');
  return commandPattern.test(evidence) || commandSlugPattern(command).test(evidence);
}

function hasFreshCheckoutContextEvidence(evidence: string): boolean {
  return /\b(?:fresh|clean)[- ]checkout\b/i.test(evidence);
}

function hasFreshCheckoutGitCommitEvidence(evidence: string): boolean {
  return (
    /\b(?:git[- ]?)?(?:commit|sha|head)\b[^|\n]{0,80}\b[a-f0-9]{7,40}\b/i.test(evidence) ||
    /\b[a-f0-9]{7,40}\b[^|\n]{0,80}\b(?:git[- ]?)?(?:commit|sha|head)\b/i.test(evidence)
  );
}

function freshCheckoutEvidenceMatchesReviewCommit(evidence: string, reviewCommit: string): boolean {
  const expected = reviewCommit.toLowerCase();
  return [...evidence.matchAll(/\b[a-f0-9]{7,40}\b/gi)]
    .some(match => match[0].toLowerCase() === expected);
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

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

export function isConcreteExternalIntegrationReviewerOrganization(value: string | undefined): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return normalized.length > 0 && !GENERIC_REVIEWER_ORGANIZATION_VALUES.has(normalized);
}
