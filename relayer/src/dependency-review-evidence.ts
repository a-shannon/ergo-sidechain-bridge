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

export type DependencyReviewStatus = 'pending' | 'linked' | 'blocker';
export type ReviewerDecision = 'approve' | 'block';

export interface DependencyCommandRow {
  command: string;
  evidence: string;
  status: string;
}

export interface DependencyScopeRow {
  dependency: string;
  source: string;
  reviewedRisk: string;
  evidence: string;
  status: string;
}

export interface VulnerabilityTriageRow {
  triageItem: string;
  toolOrReviewMethod: string;
  findings: string;
  evidence: string;
  status: string;
}

export interface UpgradeDecisionRow {
  decision: string;
  requiredEvidence: string;
  releaseAction: string;
  status: string;
}

export interface PublicationDecisionFields {
  releaseSupported: string;
  productionReadyClaimAllowed: string;
  testnetProductionCandidateClaimAllowed: string;
  criticalHighVulnerabilitiesOpen: string;
  upstreamSignerBlockerResolved: string;
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

export interface DependencyReviewClassificationFields {
  gitCommit: string;
  releaseLevel: string;
  environment: string;
  lockfilesReviewed: string;
  reviewer: string;
  date: string;
}

export interface DependencyReviewEvidenceValidation {
  status: 'PASS' | 'BLOCKED';
  commandRows: DependencyCommandRow[];
  scopeRows: DependencyScopeRow[];
  triageRows: VulnerabilityTriageRow[];
  upgradeRows: UpgradeDecisionRow[];
  classification: Partial<DependencyReviewClassificationFields>;
  publicationDecision: Partial<PublicationDecisionFields>;
  reviewerRows: ReviewerSignoffRow[];
  errors: string[];
  message: string;
}

interface ParsedRows<T> {
  rows: T[];
  errors: string[];
}

interface DependencyRiskExpectation {
  pattern: RegExp;
  message: string;
}

const REQUIRED_SECTIONS = [
  '## Review Classification',
  '## Required Commands',
  '## Dependency Scope',
  '## Vulnerability Triage',
  '## Upgrade And Pinning Decision',
  '## Publication Decision',
  '## Reviewer Sign-Off',
];

const REQUIRED_CLASSIFICATION_FIELDS = [
  'Review name',
  'Git commit',
  'Release level',
  'Environment',
  'Lockfiles reviewed',
  'Reviewer',
  'Date',
];

export const REQUIRED_DEPENDENCY_REVIEW_COMMANDS = [
  'npm ci',
  'npm run check',
  'npm run wasm:test',
  'npm audit --omit=dev',
  'cargo tree --locked',
];
const REQUIRED_COMMANDS = REQUIRED_DEPENDENCY_REVIEW_COMMANDS;

export const REQUIRED_DEPENDENCY_REVIEW_DEPENDENCIES = [
  'ergo-lib-wasm-nodejs',
  'sigma-rust ContextExtension serializer',
  '@fleet-sdk/core',
  '@fleet-sdk/common',
  '@fleet-sdk/wallet',
  'ergo_avltree_rust',
  'better-sqlite3',
  'blakejs',
  'ethers',
  'wasm-pack and Rust toolchain',
  'Node.js / npm lockfile',
];
const REQUIRED_DEPENDENCIES = REQUIRED_DEPENDENCY_REVIEW_DEPENDENCIES;

const REQUIRED_DEPENDENCY_EVIDENCE_MARKERS: Record<string, { pattern: RegExp; message: string }[]> = {
  'ergo-lib-wasm-nodejs': [
    {
      pattern: /ergo[- ]lib[- ]wasm[- ]nodejs|ergo[- ]lib|sigma[- ]rust/i,
      message: 'evidence must identify ergo-lib-wasm-nodejs signer dependency',
    },
  ],
  'sigma-rust ContextExtension serializer': [
    {
      pattern: /sigma[- ]rust|context[- ]extension|contextextension|serializer/i,
      message: 'evidence must identify sigma-rust ContextExtension serializer',
    },
  ],
  '@fleet-sdk/core': [
    {
      pattern: /fleet[- ]sdk[- ]core|@fleet[-/]sdk[-/]core/i,
      message: 'evidence must identify @fleet-sdk/core',
    },
  ],
  '@fleet-sdk/common': [
    {
      pattern: /fleet[- ]sdk[- ]common|@fleet[-/]sdk[-/]common/i,
      message: 'evidence must identify @fleet-sdk/common',
    },
  ],
  '@fleet-sdk/wallet': [
    {
      pattern: /fleet[- ]sdk[- ]wallet|@fleet[-/]sdk[-/]wallet/i,
      message: 'evidence must identify @fleet-sdk/wallet',
    },
  ],
  ergo_avltree_rust: [
    {
      pattern: /ergo[-_ ]avltree[-_ ]rust|avltree|avl/i,
      message: 'evidence must identify ergo_avltree_rust',
    },
  ],
  'better-sqlite3': [
    {
      pattern: /better[- ]sqlite3|sqlite/i,
      message: 'evidence must identify better-sqlite3',
    },
  ],
  blakejs: [
    {
      pattern: /blakejs|blake2b|commitment|proof[- ]root|hash/i,
      message: 'evidence must identify blakejs Blake2b hashing dependency',
    },
  ],
  ethers: [
    {
      pattern: /ethers|evm|event/i,
      message: 'evidence must identify ethers EVM dependency',
    },
  ],
  'wasm-pack and Rust toolchain': [
    {
      pattern: /wasm[- ]pack|rust[- ]toolchain|toolchain/i,
      message: 'evidence must identify wasm-pack or Rust toolchain',
    },
  ],
  'Node.js / npm lockfile': [
    {
      pattern: /node[- ]js|node\.js|npm[- ]lockfile|package[- ]lock|lockfile/i,
      message: 'evidence must identify Node.js/npm lockfile',
    },
  ],
};

export const REQUIRED_DEPENDENCY_REVIEW_TRIAGE_ITEMS = [
  'npm production dependencies',
  'npm dev and build toolchain',
  'Rust dependency tree',
  'Signer consensus dependency',
  'AVL proof dependency',
  'SQLite native dependency',
  'EVM event dependency',
  'Lockfile integrity',
];
const REQUIRED_TRIAGE_ITEMS = REQUIRED_DEPENDENCY_REVIEW_TRIAGE_ITEMS;

export const REQUIRED_DEPENDENCY_REVIEW_UPGRADE_DECISIONS = [
  'Signer dependency upgrade decision',
  'Fleet SDK upgrade decision',
  'AVL dependency upgrade decision',
  'SQLite dependency upgrade decision',
  'EVM dependency upgrade decision',
  'Toolchain pinning decision',
];
const REQUIRED_UPGRADE_DECISIONS = REQUIRED_DEPENDENCY_REVIEW_UPGRADE_DECISIONS;
const DEPENDENCY_UPGRADE_RELEASE_ACTION_EXPECTATIONS = new Map<string, RegExp>([
  [
    'Signer dependency upgrade decision',
    /\b(upstream|released|release|fail-closed|blocker|guard)\b/i,
  ],
  [
    'Fleet SDK upgrade decision',
    /\b(Fleet|API drift|transaction assembly|pinned|pin|upgrade)\b/i,
  ],
  [
    'AVL dependency upgrade decision',
    /\b(AVL|JVM|compatibility|proof|pinned|pin|upgrade)\b/i,
  ],
  [
    'SQLite dependency upgrade decision',
    /\b(SQLite|native|state recovery|backup|restore|pinned|pin|upgrade)\b/i,
  ],
  [
    'EVM dependency upgrade decision',
    /\b(EVM|event|receipt|log|parsing|pinned|pin|upgrade)\b/i,
  ],
  [
    'Toolchain pinning decision',
    /\b(toolchain|wasm-pack|Rust|reproducible|pinned|pin|upgrade)\b/i,
  ],
]);

const REQUIRED_PUBLICATION_DECISION_FIELDS = [
  'Release supported',
  'Production-ready claim allowed',
  'Testnet production-candidate claim allowed',
  'Critical/high vulnerabilities open',
  'Upstream signer blocker resolved',
  'Release notes updated',
  'Required release-note updates',
  'Required checklist updates',
  'Reviewer decision summary',
];

export const REQUIRED_DEPENDENCY_REVIEW_REVIEWER_ROLES = [
  'Dependency reviewer',
  'Security reviewer',
  'Maintainer',
];
const REQUIRED_REVIEWER_ROLES = REQUIRED_DEPENDENCY_REVIEW_REVIEWER_ROLES;

const ALLOWED_STATUSES = new Set<DependencyReviewStatus>(['pending', 'linked', 'blocker']);
const ALLOWED_RELEASE_LEVELS = new Set([
  'validated PoC',
  'institutional reference',
  'production deployment candidate',
]);
const ALLOWED_ENVIRONMENTS = new Set(['clean checkout', 'local offline', 'CI', 'staging', 'testnet']);
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
const SIGNER_UPSTREAM_RELEASE_PATTERN = /\b(upstream|released|release)\b/i;
const SIGNER_CONFORMANCE_PATTERN = /\b(validated|conformance|jvm|golden vectors?|transactions\/check|node check)\b/i;
const SIGNER_RELEASE_VERSION_PATTERN = /\bv?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/i;
const SIGNER_RELEASE_COMMIT_PATTERN = /\b[a-f0-9]{7,40}\b/i;
const SIGNER_LABELED_RELEASE_VERSION_PATTERN = /\b(?:tag|version)\s*[:=]\s*v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/i;
const SIGNER_LABELED_RELEASE_COMMIT_PATTERN = /\b(?:commit|sha)\s*[:=]\s*[a-f0-9]{7,40}\b/i;
const SIGNER_CONCRETE_CONFORMANCE_PATTERN = /\b(golden vectors?|transactions\/check|node check)\b/i;
const SIGNER_CONFORMANCE_RESULT_PATTERN =
  /\b(?:positive|passing|passed|validated|verified|matched|matching|agrees?|agreement|successful|live)\b.{0,80}\b(?:jvm|node|golden vectors?|transactions\/check|node check)\b|\b(?:jvm|node|golden vectors?|transactions\/check|node check)\b.{0,80}\b(?:positive|passing|passed|validated|verified|matched|matching|agrees?|agreement|successful|live)\b/i;
const SIGNER_NEGATED_CONFORMANCE_PATTERN =
  /\b(?:missing|absent|unavailable|unvalidated|unverified|not validated|not verified|not yet validated|not yet verified|not fully validated|not fully verified|partially validated|partially verified|without)\b.{0,80}\b(?:jvm|node|conformance|golden vectors?|transactions\/check)\b|\b(?:jvm|node|conformance|golden vectors?|transactions\/check)\b.{0,80}\b(?:missing|absent|unavailable|unvalidated|unverified|not validated|not verified|not yet validated|not yet verified|not fully validated|not fully verified|partially validated|partially verified|without)\b/i;
const SIGNER_FAIL_CLOSED_PATTERN = /\bfail-closed\b/i;
const SIGNER_CONTEXT_EXTENSION_PATTERN = /\b(context\s*extension|contextextension)\b/i;
const SIGNER_GUARD_BLOCKER_PATTERN = /\b(guard(?:ed)?|blocker|blocked)\b/i;
const PRODUCTION_CLAIMS_BLOCKED_PATTERN = /\b(production-ready claims?|production claims?|claims?)\b.*\b(blocked|disabled|not allowed|forbidden)\b/i;
const TESTNET_PRODUCTION_CANDIDATE_CLAIMS_BLOCKED_PATTERN =
  /\btestnet\s+production[- ]candidate\s+claims?\b.*\b(blocked|disabled|not allowed|forbidden)\b|\btestnet\s+production[- ]candidate\s+claim\s+allowed\s*=\s*no\b/i;
const SIGNER_FAIL_CLOSED_MIXED_WITH_UPSTREAM_PATTERN =
  /\bfail-closed\b|\bkeep pinned\b|\bblocker rationale\b|\bblocked until upstream\b/i;
const POSITIVE_CRITICAL_HIGH_FINDING_PATTERN =
  /\b(?:[1-9]\d*\s+(?:open\s+)?(?:critical|high|critical\s*\/\s*high)(?:\s+(?:findings?|vulnerabilit(?:y|ies)|issues?))?|(?:critical|high|critical\s*\/\s*high)(?:\s+(?:findings?|vulnerabilit(?:y|ies)|issues?))?\s*(?:open\s*)?[:=]?\s*[1-9]\d*)\b/i;
const REVIEWER_APPROVAL_VERB_PATTERN =
  '(?:approve|approved|approves|accept|accepted|accepts|allow|allowed|allows|support|supported|supports|permit|permitted|permits|clear|cleared|clears|enable|enabled|enables|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits)';
const REVIEWER_LOCAL_CONTEXT = '[^.;|\\r\\n]{0,100}';
const REVIEWER_DENIAL_OR_BOUNDARY_TERM_PATTERN =
  '(?:no|not|never|without|absence|absent|lack|lacks|lacking|but|however|though|although|except|unless)';
const REVIEWER_DENIAL_OR_BOUNDARY_PREFIX_PATTERN =
  /\b(?:no|not|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?\s+$/;
const REVIEWER_APPROVAL_CONNECTOR_PATTERN =
  `(?:\\s+(?!\\b${REVIEWER_DENIAL_OR_BOUNDARY_TERM_PATTERN}\\b)[a-z0-9/-]+){0,12}\\s+`;
const UNRESOLVED_SIGNER_BLOCKER_SUBJECT_PATTERN =
  '(?:(?:unresolved|open|remaining|outstanding|fail[- ]closed|not\\s+resolved)\\s+(?:upstream\\s+signer(?:\\s+(?:blocker|dependency))?|signer\\s+blocker|signer\\s+dependency|sigma[- ]rust)|(?:upstream\\s+signer(?:\\s+(?:blocker|dependency))?|signer\\s+blocker|signer\\s+dependency|sigma[- ]rust)\\s+(?:unresolved|open|remaining|outstanding|fail[- ]closed|not\\s+resolved))';
const OPEN_CRITICAL_HIGH_VULNERABILITY_SUBJECT_PATTERN =
  '(?:(?:[1-9]\\d*\\s+(?:open\\s+)?(?:critical\\s*\\/\\s*high|critical high|critical and high|critical or high|critical|high)\\s+(?:findings?|vulnerabilit(?:y|ies)|issues?))|(?:(?:open|unresolved|remaining|outstanding)\\s+(?:critical\\s*\\/\\s*high|critical high|critical and high|critical or high|critical|high)\\s+(?:findings?|vulnerabilit(?:y|ies)|issues?))|(?:(?:critical\\s*\\/\\s*high|critical high|critical and high|critical or high|critical|high)\\s+(?:findings?|vulnerabilit(?:y|ies)|issues?)\\s+(?:open|unresolved|remaining|outstanding)))';
const APPROVES_PRODUCTION_READY_DEPENDENCY_WORDING_PATTERN = new RegExp(
  `\\b${REVIEWER_APPROVAL_VERB_PATTERN}\\b${REVIEWER_LOCAL_CONTEXT}\\b(?:production[- ]ready|production\\s+readiness|ready[- ]for[- ]production|mainnet)\\b|` +
    `\\b(?:production[- ]ready|production\\s+readiness|ready[- ]for[- ]production|mainnet)\\b${REVIEWER_LOCAL_CONTEXT}\\b${REVIEWER_APPROVAL_VERB_PATTERN}\\b`,
  'i',
);
const DEPENDENCY_RISK_EXPECTATIONS = new Map<string, DependencyRiskExpectation>([
  ['ergo-lib-wasm-nodejs', {
    pattern: /\b(signer|context\s*extension|contextextension|serialization|consensus|sigma-rust|signed bytes)\b/i,
    message: 'signer, ContextExtension, serialization, or consensus risk',
  }],
  ['sigma-rust ContextExtension serializer', {
    pattern: /\b(context\s*extension|contextextension|serializer|serialization|signed bytes|tx id|consensus)\b/i,
    message: 'ContextExtension serialization, signed bytes, TX ID, or consensus risk',
  }],
  ['@fleet-sdk/core', {
    pattern: /\b(transaction assembly|assembly|api drift|builder|transaction)\b/i,
    message: 'transaction assembly or API drift risk',
  }],
  ['@fleet-sdk/common', {
    pattern: /\b(shared|helper|address|transaction)\b/i,
    message: 'shared helper, address, or transaction helper risk',
  }],
  ['@fleet-sdk/wallet', {
    pattern: /\b(wallet|fallback|signer|signing)\b/i,
    message: 'wallet helper, fallback, signer, or signing risk',
  }],
  ['ergo_avltree_rust', {
    pattern: /\b(avl|proof|jvm|scorex|verifier|compatibility)\b/i,
    message: 'AVL proof, JVM, Scorex, verifier, or compatibility risk',
  }],
  ['better-sqlite3', {
    pattern: /\b(sqlite|native|state|recovery|backup|restore)\b/i,
    message: 'SQLite native state, recovery, backup, or restore risk',
  }],
  ['blakejs', {
    pattern: /\b(blake2b|hash|hashing|commitment|proof[- ]root|root|spv|trustless burn)\b/i,
    message: 'Blake2b hashing, commitment, proof-root, SPV, or trustless burn risk',
  }],
  ['ethers', {
    pattern: /\b(evm|event|receipt|log|interpretation|parsing)\b/i,
    message: 'EVM event, receipt, log, interpretation, or parsing risk',
  }],
  ['wasm-pack and Rust toolchain', {
    pattern: /\b(wasm|toolchain|rust|wasm-pack|reproducible|build)\b/i,
    message: 'WASM, Rust, wasm-pack, toolchain, reproducible, or build risk',
  }],
  ['Node.js / npm lockfile', {
    pattern: /\b(lockfile|npm ci|install|reproducible|transitive|node\.js|npm)\b/i,
    message: 'lockfile, npm install, reproducibility, transitive, Node.js, or npm risk',
  }],
]);

export function hasCompletedDependencyCommandEvidence(command: string, evidence: string): boolean {
  return (
    hasCompletedDependencyEvidenceTarget(evidence) &&
    commandEvidenceIdentifiesCommand(command, evidence) &&
    hasInternallyPositiveDependencyCommandOutput(evidence)
  );
}

export function hasInternallyPositiveDependencyCommandOutput(evidence: string): boolean {
  return (
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(evidence) &&
    /\b(PASS|passed|success|successful|ok|exit code\s*0)\b/i.test(evidence) &&
    !hasAmbiguousDependencyExitCode(evidence) &&
    hasNoContradictoryDependencyEvidenceMarker(evidence)
  );
}

export function hasDependencyReviewScopeRiskFocus(dependency: string, reviewedRisk: string): boolean {
  const riskExpectation = DEPENDENCY_RISK_EXPECTATIONS.get(dependency);
  return riskExpectation ? riskExpectation.pattern.test(reviewedRisk) : false;
}

export function hasCompletedDependencyScopeEvidence(dependency: string, evidence: string): boolean {
  return (
    hasCompletedDependencyEvidenceTarget(evidence) &&
    hasNoContradictoryDependencyEvidenceMarker(evidence) &&
    (REQUIRED_DEPENDENCY_EVIDENCE_MARKERS[dependency] ?? []).every(marker => marker.pattern.test(evidence))
  );
}

export function hasDependencyTriageZeroCriticalHigh(findings: string): boolean {
  return !hasPositiveCriticalHighFinding(findings) && hasNoOpenCriticalHighFinding(findings);
}

export function hasCompletedDependencyEvidenceTarget(evidence: string): boolean {
  return hasCompletedEvidenceTarget(evidence);
}

export function hasCompletedDependencyReleaseNoteUpdateEvidence(evidence: string): boolean {
  return (
    hasCompletedDependencyEvidenceTarget(evidence) &&
    identifiesDependencyReleaseNoteEvidence(evidence) &&
    hasNoContradictoryDependencyEvidenceMarker(evidence)
  );
}

export function hasCompletedDependencyChecklistUpdateEvidence(evidence: string): boolean {
  return (
    hasCompletedDependencyEvidenceTarget(evidence) &&
    identifiesDependencyChecklistUpdateEvidence(evidence) &&
    hasNoContradictoryDependencyEvidenceMarker(evidence)
  );
}

export function hasDependencyUpgradeDecisionReleaseAction(decision: string, releaseAction: string): boolean {
  const releaseActionPattern = DEPENDENCY_UPGRADE_RELEASE_ACTION_EXPECTATIONS.get(decision);
  return releaseActionPattern ? releaseActionPattern.test(releaseAction) : false;
}

export function isActionableDependencyReviewerNote(value: string): boolean {
  return (
    hasNoContradictoryDependencyEvidenceMarker(value) &&
    /\b(accept|accepted|approve|approved|verify|verified|validate|validated|confirm|confirmed|pass|passed|block|blocked|fail|failed|resolve|resolved|pin|pinned|guard|guarded|match|matched|complete|completed)\b/i.test(value) &&
    /\b(dependency|sigma-rust|ergo-lib-wasm-nodejs|ContextExtension|serializer|Fleet|AVL|SQLite|EVM|lockfile|npm audit|cargo tree|critical|high|vulnerability|upstream|signer|fail-closed|toolchain|wasm-pack)\b/i.test(value)
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

export function parseDependencyScopeRows(markdown: string): DependencyScopeRow[] {
  return parseTableBetween(markdown, '## Dependency Scope', '## Vulnerability Triage').map(row => {
    if (row.length !== 5) throw new Error(`Malformed Dependency Scope row: ${row.join(' | ')}`);
    return {
      dependency: row[0],
      source: row[1],
      reviewedRisk: row[2],
      evidence: row[3],
      status: row[4],
    };
  });
}

export function validateDependencyReviewEvidence(markdown: string): DependencyReviewEvidenceValidation {
  const commands = parseRowsSafely(() => parseCommandRows(markdown));
  const scopes = parseRowsSafely(() => parseDependencyScopeRows(markdown));
  const triage = parseRowsSafely(() => parseTriageRows(markdown));
  const upgrades = parseRowsSafely(() => parseUpgradeRows(markdown));
  const reviewers = parseRowsSafely(() => parseReviewerRows(markdown));
  const classification = parseClassification(markdown);
  const publicationDecision = parsePublicationDecision(markdown);
  const commandRows = commands.rows;
  const scopeRows = scopes.rows;
  const triageRows = triage.rows;
  const upgradeRows = upgrades.rows;
  const reviewerRows = reviewers.rows;
  const errors = [
    ...validateEvidenceHygiene(markdown, 'Dependency Review Evidence'),
    ...validateRequiredSections(markdown),
    ...validateClassification(markdown),
    ...validatePublicationDecision(publicationDecision, markdown, upgradeRows),
    ...commands.errors,
    ...scopes.errors,
    ...triage.errors,
    ...upgrades.errors,
    ...reviewers.errors,
    ...validateCommandRows(commandRows),
    ...validateScopeRows(scopeRows),
    ...validateTriageRows(triageRows),
    ...validateUpgradeRows(upgradeRows),
    ...validateReviewerRows(reviewerRows),
    ...validateReviewerIdentityConsistency(markdown, reviewerRows),
    ...validateReviewerDateConsistency(markdown, reviewerRows),
  ];

  if (errors.length > 0) {
    return {
      status: 'BLOCKED',
      commandRows,
      scopeRows,
      triageRows,
      upgradeRows,
      classification,
      publicationDecision,
      reviewerRows,
      errors,
      message: `Dependency review evidence BLOCKED: ${errors.length} structural issue(s).`,
    };
  }

  return {
    status: 'PASS',
    commandRows,
    scopeRows,
    triageRows,
    upgradeRows,
    classification,
    publicationDecision,
    reviewerRows,
    errors: [],
    message: `Dependency review evidence PASS: ${scopeRows.length} dependency rows are linked.`,
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

function parseCommandRows(markdown: string): DependencyCommandRow[] {
  return parseTableBetween(markdown, '## Required Commands', '## Dependency Scope').map(row => {
    if (row.length !== 3) throw new Error(`Malformed Required Commands row: ${row.join(' | ')}`);
    return { command: row[0], evidence: row[1], status: row[2] };
  });
}

function parseTriageRows(markdown: string): VulnerabilityTriageRow[] {
  return parseTableBetween(markdown, '## Vulnerability Triage', '## Upgrade And Pinning Decision').map(row => {
    if (row.length !== 5) throw new Error(`Malformed Vulnerability Triage row: ${row.join(' | ')}`);
    return {
      triageItem: row[0],
      toolOrReviewMethod: row[1],
      findings: row[2],
      evidence: row[3],
      status: row[4],
    };
  });
}

function parseUpgradeRows(markdown: string): UpgradeDecisionRow[] {
  return parseTableBetween(markdown, '## Upgrade And Pinning Decision', '## Publication Decision').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Upgrade And Pinning Decision row: ${row.join(' | ')}`);
    return {
      decision: row[0],
      requiredEvidence: row[1],
      releaseAction: row[2],
      status: row[3],
    };
  });
}

function parsePublicationDecision(markdown: string): Partial<PublicationDecisionFields> {
  const fields = parseTwoColumnTable(sectionBetween(markdown, '## Publication Decision', '## Reviewer Sign-Off'));
  return {
    releaseSupported: fields.get('Release supported'),
    productionReadyClaimAllowed: fields.get('Production-ready claim allowed'),
    testnetProductionCandidateClaimAllowed: fields.get('Testnet production-candidate claim allowed'),
    criticalHighVulnerabilitiesOpen: fields.get('Critical/high vulnerabilities open'),
    upstreamSignerBlockerResolved: fields.get('Upstream signer blocker resolved'),
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

function parseClassification(markdown: string): Partial<DependencyReviewClassificationFields> {
  const fields = parseTwoColumnTable(sectionBetween(markdown, '## Review Classification', '## Required Commands'));
  return {
    gitCommit: fields.get('Git commit'),
    releaseLevel: fields.get('Release level'),
    environment: fields.get('Environment'),
    lockfilesReviewed: fields.get('Lockfiles reviewed'),
    reviewer: fields.get('Reviewer'),
    date: fields.get('Date'),
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
  const section = sectionBetween(markdown, '## Review Classification', '## Required Commands');
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
  validateAllowedField(errors, fields, 'Review Classification', 'Lockfiles reviewed', ALLOWED_YES_NO);
  validateGitCommitField(errors, fields, 'Review Classification', 'Git commit');
  validateIsoDateField(errors, fields, 'Review Classification', 'Date');
  if (fields.get('Release level') === 'production deployment candidate' && fields.get('Environment') !== 'testnet') {
    errors.push('Review Classification: production deployment candidate requires Environment testnet');
  }

  if (fields.get('Lockfiles reviewed') === 'no') {
    errors.push('Review Classification: lockfiles must be reviewed before dependency evidence can pass');
  }

  return errors;
}

function validatePublicationDecision(
  fields: Partial<PublicationDecisionFields>,
  markdown: string,
  upgradeRows: UpgradeDecisionRow[],
): string[] {
  const publicationSection = sectionBetween(markdown, '## Publication Decision', '## Reviewer Sign-Off');
  const rawFields = parseTwoColumnTable(publicationSection);
  const classification = parseTwoColumnTable(
    sectionBetween(markdown, '## Review Classification', '## Required Commands'),
  );
  const releaseLevel = classification.get('Release level') ?? '';
  const environment = classification.get('Environment') ?? '';
  const errors = validateDuplicateRequiredFields(
    'Publication Decision',
    parseTwoColumnFieldNames(publicationSection),
    REQUIRED_PUBLICATION_DECISION_FIELDS,
  );

  for (const field of REQUIRED_PUBLICATION_DECISION_FIELDS) {
    if (isBlank(rawFields.get(field) ?? '')) errors.push(`Publication Decision: ${field} is required`);
  }

  validateAllowedField(errors, rawFields, 'Publication Decision', 'Release supported', ALLOWED_RELEASE_SUPPORT);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Production-ready claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Testnet production-candidate claim allowed', ALLOWED_YES_NO);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Upstream signer blocker resolved', ALLOWED_YES_NO);
  validateAllowedField(errors, rawFields, 'Publication Decision', 'Release notes updated', ALLOWED_YES_NO);

  if (
    !isBlank(fields.criticalHighVulnerabilitiesOpen ?? '') &&
    !isExactZero(fields.criticalHighVulnerabilitiesOpen ?? '')
  ) {
    errors.push('Publication Decision: critical/high vulnerabilities open must be 0 before dependency review evidence can pass');
  }
  if (
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    !isActionableReviewerDecisionSummary(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must mention release support, upstream signer blocker handling, production-ready claim handling, testnet production-candidate claim handling, and critical/high vulnerabilities',
    );
  }
  if (!isBlank(fields.reviewerDecisionSummary ?? '') && approvesUnresolvedSignerBlocker(fields.reviewerDecisionSummary ?? '')) {
    errors.push('Publication Decision: Reviewer decision summary must not approve unresolved signer blockers');
  }
  if (!isBlank(fields.reviewerDecisionSummary ?? '') && approvesOpenCriticalHighVulnerability(fields.reviewerDecisionSummary ?? '')) {
    errors.push('Publication Decision: Reviewer decision summary must not approve open critical/high vulnerabilities');
  }
  if (!isBlank(fields.reviewerDecisionSummary ?? '') && leavesCriticalHighVulnerabilitiesOpen(fields.reviewerDecisionSummary ?? '')) {
    errors.push('Publication Decision: Reviewer decision summary must not leave critical/high vulnerabilities open');
  }
  if (!isBlank(fields.reviewerDecisionSummary ?? '') && approvesFailClosedSignerCandidate(fields.reviewerDecisionSummary ?? '')) {
    errors.push('Publication Decision: Reviewer decision summary must not approve fail-closed signer blocker as candidate support');
  }
  if (
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    hasContradictoryDependencyDecisionBinding(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push('Publication Decision: Reviewer decision summary must not include contradictory dependency decision bindings');
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
  errors.push(
    ...validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'Publication Decision: Reviewer decision summary',
      summary: fields.reviewerDecisionSummary ?? '',
      releaseSupported: fields.releaseSupported,
      productionReadyClaimAllowed: fields.productionReadyClaimAllowed,
      testnetProductionCandidateClaimAllowed: fields.testnetProductionCandidateClaimAllowed,
      requireNumericCriticalHighVulnerabilityClosure: true,
    }),
  );
  if (
    !isBlank(fields.reviewerDecisionSummary ?? '') &&
    usesNumericCriticalHighVulnerabilityClosure(fields.reviewerDecisionSummary ?? '') &&
    !hasExactCriticalHighVulnerabilitiesOpenBinding(fields.reviewerDecisionSummary ?? '')
  ) {
    errors.push(
      'Publication Decision: Reviewer decision summary must use exact Critical/high vulnerabilities open = 0',
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
  if (fields.releaseSupported === 'none') {
    errors.push('Publication Decision: Release supported must not be none before dependency review evidence can pass');
  }
  if (
    fields.releaseSupported !== 'none' &&
    releaseExceedsReviewLevel(fields.releaseSupported ?? '', releaseLevel)
  ) {
    errors.push('Publication Decision: Release supported must not exceed Review Classification release level');
  }
  if (releaseLevel === 'production deployment candidate' && fields.releaseSupported !== 'production deployment candidate') {
    errors.push(
      'Publication Decision: production deployment candidate dependency review requires exact Release supported = production deployment candidate',
    );
  }
  if (
    fields.releaseSupported === 'production deployment candidate' &&
    fields.upstreamSignerBlockerResolved !== 'yes'
  ) {
    errors.push(
      'Publication Decision: production deployment candidate support requires exact Upstream signer blocker resolved = yes',
    );
  }
  if (
    fields.releaseSupported === 'production deployment candidate' &&
    fields.testnetProductionCandidateClaimAllowed !== 'yes'
  ) {
    errors.push(
      'Publication Decision: production deployment candidate support requires exact Testnet production-candidate claim allowed = yes',
    );
  }
  if (fields.releaseSupported === 'production deployment candidate' && environment !== 'testnet') {
    errors.push('Publication Decision: production deployment candidate support requires exact Review Classification Environment = testnet');
  }
  if (
    fields.testnetProductionCandidateClaimAllowed === 'yes' &&
    fields.releaseSupported !== 'production deployment candidate'
  ) {
    errors.push('Publication Decision: testnet production-candidate claim requires production deployment candidate support');
  }
  if (
    fields.testnetProductionCandidateClaimAllowed === 'yes' &&
    fields.upstreamSignerBlockerResolved !== 'yes'
  ) {
    errors.push('Publication Decision: testnet production-candidate claim requires upstream signer blocker resolved');
  }
  if (fields.productionReadyClaimAllowed === 'yes') {
    errors.push('Publication Decision: Production-ready claim allowed must be no; mainnet production-ready claims are forbidden');
  }
  if (fields.productionReadyClaimAllowed === 'yes' && releaseLevel !== 'production deployment candidate') {
    errors.push('Publication Decision: production-ready claim requires production deployment candidate evidence');
  }
  if (fields.productionReadyClaimAllowed === 'yes' && fields.upstreamSignerBlockerResolved !== 'yes') {
    errors.push('Publication Decision: production-ready claim requires upstream signer blocker resolved');
  }
  if (fields.upstreamSignerBlockerResolved === 'yes') {
    const signerDecision = upgradeRows.find(row => row.decision === 'Signer dependency upgrade decision');
    if (signerDecision && hasFailClosedSignerBlockerWording(signerDecision.releaseAction)) {
      errors.push(
        'Publication Decision: upstream signer blocker resolved conflicts with fail-closed signer blocker wording',
      );
    }
    if (signerDecision && !identifiesSignerUpstreamResolution(signerDecision.releaseAction)) {
      errors.push(
        'Publication Decision: upstream signer blocker resolved requires signer release action to identify upstream release, concrete release identifier, and JVM/node golden-vector or /transactions/check evidence',
      );
    }
  }
  if (fields.releaseNotesUpdated === 'no') {
    errors.push('Publication Decision: release notes must be updated before dependency review evidence can pass');
  }
  if (!isBlank(fields.requiredReleaseNoteUpdates ?? '') && !hasEvidenceMarker(fields.requiredReleaseNoteUpdates ?? '')) {
    errors.push('Publication Decision: Required release-note updates must include a link, command, or artifact marker');
  } else if (!isBlank(fields.requiredReleaseNoteUpdates ?? '') && !hasCompletedDependencyEvidenceTarget(fields.requiredReleaseNoteUpdates ?? '')) {
    errors.push(
      'Publication Decision: Required release-note updates must include a completed dependency review release-note artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  }
  if (
    !isBlank(fields.requiredReleaseNoteUpdates ?? '') &&
    !identifiesDependencyReleaseNoteEvidence(fields.requiredReleaseNoteUpdates ?? '')
  ) {
    errors.push(
      'Publication Decision: Required release-note updates must identify completed dependency review release-note evidence',
    );
  }
  if (
    !isBlank(fields.requiredReleaseNoteUpdates ?? '') &&
    !hasNoContradictoryDependencyEvidenceMarker(fields.requiredReleaseNoteUpdates ?? '')
  ) {
    errors.push(
      'Publication Decision: Required release-note updates must not include contradictory dependency failure markers',
    );
  }
  if (
    !isBlank(fields.requiredReleaseNoteUpdates ?? '') &&
    containsMainnetProductionClaim(fields.requiredReleaseNoteUpdates ?? '')
  ) {
    errors.push('Publication Decision: Required release-note updates must not contain mainnet production claim wording');
  }
  if (
    !isBlank(fields.requiredReleaseNoteUpdates ?? '') &&
    containsProductionReadyClaim(fields.requiredReleaseNoteUpdates ?? '')
  ) {
    errors.push('Publication Decision: Required release-note updates must not contain production-ready claim wording');
  }
  if (
    !isBlank(fields.requiredReleaseNoteUpdates ?? '') &&
    usesNonExactCriticalHighVulnerabilityClosure(fields.requiredReleaseNoteUpdates ?? '')
  ) {
    errors.push(
      'Publication Decision: Required release-note updates must use exact numeric Critical/high vulnerabilities open = 0; textual or shorthand critical/high vulnerability terms are not accepted',
    );
  }
  validatePublicationUpdateDecisionBindings(
    errors,
    'Required release-note updates',
    fields.requiredReleaseNoteUpdates ?? '',
    fields,
  );
  if (!isBlank(fields.requiredChecklistUpdates ?? '') && !hasEvidenceMarker(fields.requiredChecklistUpdates ?? '')) {
    errors.push('Publication Decision: Required checklist updates must include a link, command, or artifact marker');
  } else if (!isBlank(fields.requiredChecklistUpdates ?? '') && !hasCompletedDependencyEvidenceTarget(fields.requiredChecklistUpdates ?? '')) {
    errors.push(
      'Publication Decision: Required checklist updates must include a completed dependency review checklist artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
    );
  }
  if (
    !isBlank(fields.requiredChecklistUpdates ?? '') &&
    !identifiesDependencyChecklistUpdateEvidence(fields.requiredChecklistUpdates ?? '')
  ) {
    errors.push(
      'Publication Decision: Required checklist updates must identify completed dependency review checklist update evidence',
    );
  }
  if (
    !isBlank(fields.requiredChecklistUpdates ?? '') &&
    !hasNoContradictoryDependencyEvidenceMarker(fields.requiredChecklistUpdates ?? '')
  ) {
    errors.push(
      'Publication Decision: Required checklist updates must not include contradictory dependency failure markers',
    );
  }
  if (
    !isBlank(fields.requiredChecklistUpdates ?? '') &&
    containsMainnetProductionClaim(fields.requiredChecklistUpdates ?? '')
  ) {
    errors.push('Publication Decision: Required checklist updates must not contain mainnet production claim wording');
  }
  if (
    !isBlank(fields.requiredChecklistUpdates ?? '') &&
    containsProductionReadyClaim(fields.requiredChecklistUpdates ?? '')
  ) {
    errors.push('Publication Decision: Required checklist updates must not contain production-ready claim wording');
  }
  if (
    !isBlank(fields.requiredChecklistUpdates ?? '') &&
    usesNonExactCriticalHighVulnerabilityClosure(fields.requiredChecklistUpdates ?? '')
  ) {
    errors.push(
      'Publication Decision: Required checklist updates must use exact numeric Critical/high vulnerabilities open = 0; textual or shorthand critical/high vulnerability terms are not accepted',
    );
  }
  validatePublicationUpdateDecisionBindings(
    errors,
    'Required checklist updates',
    fields.requiredChecklistUpdates ?? '',
    fields,
  );
  if (
    hasCompletedDependencyReleaseNoteUpdateEvidence(fields.requiredReleaseNoteUpdates ?? '') &&
    hasCompletedDependencyChecklistUpdateEvidence(fields.requiredChecklistUpdates ?? '') &&
    haveSharedConcreteDependencyEvidenceTarget(
      fields.requiredReleaseNoteUpdates ?? '',
      fields.requiredChecklistUpdates ?? '',
    )
  ) {
    errors.push(
      'Publication Decision: required release-note updates and required checklist updates must use distinct completed dependency review evidence targets',
    );
  }

  return errors;
}

function validatePublicationUpdateDecisionBindings(
  errors: string[],
  field: string,
  value: string,
  fields: Partial<PublicationDecisionFields>,
): void {
  if (isBlank(value)) return;

  if (hasContradictoryDependencyDecisionBinding(value)) {
    errors.push(`Publication Decision: ${field} must not include contradictory dependency decision bindings`);
  }
  if (
    !isBlank(fields.releaseSupported ?? '') &&
    fields.releaseSupported !== 'none' &&
    !hasExactReleaseSupportedBinding(value, fields.releaseSupported ?? '')
  ) {
    errors.push(`Publication Decision: ${field} must use exact Release supported = ${fields.releaseSupported}`);
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
    errors.push(`Publication Decision: ${field} must use exact Production-ready claim allowed = no`);
  }
  if (
    fields.criticalHighVulnerabilitiesOpen === '0' &&
    !hasExactCriticalHighVulnerabilitiesOpenBinding(value)
  ) {
    errors.push(`Publication Decision: ${field} must use exact Critical/high vulnerabilities open = 0`);
  }
  if (
    (fields.upstreamSignerBlockerResolved === 'yes' || fields.upstreamSignerBlockerResolved === 'no') &&
    !hasExactUpstreamSignerBlockerResolvedBinding(value, fields.upstreamSignerBlockerResolved)
  ) {
    errors.push(
      `Publication Decision: ${field} must use exact Upstream signer blocker resolved = ${fields.upstreamSignerBlockerResolved}`,
    );
  }
}

function releaseExceedsReviewLevel(releaseSupported: string, releaseLevel: string): boolean {
  const supportedRank = RELEASE_LEVEL_RANK.get(releaseSupported);
  const reviewRank = RELEASE_LEVEL_RANK.get(releaseLevel);
  if (supportedRank === undefined || reviewRank === undefined) return false;
  return supportedRank > reviewRank;
}

function validateCommandRows(rows: DependencyCommandRow[]): string[] {
  const errors = validateRequiredNames('Required Commands', rows.map(row => row.command), REQUIRED_COMMANDS);

  for (const row of rows) {
    if (!REQUIRED_COMMANDS.includes(row.command)) errors.push(`Required Commands: ${row.command}: unexpected command`);
    validateLinkedStatus(errors, 'Required Commands', row.command, row.status);
    if (row.status === 'linked' && !hasEvidenceMarker(row.evidence)) {
      errors.push(`Required Commands: ${row.command}: linked status requires an evidence marker`);
    } else if (row.status === 'linked' && !hasCompletedDependencyEvidenceTarget(row.evidence)) {
      errors.push(
        `Required Commands: ${row.command}: linked status requires a command-specific artifact marker or non-template evidence link; targetless command-output notes are not completed evidence`,
      );
    }
    if (row.status === 'linked' && !commandEvidenceIdentifiesCommand(row.command, row.evidence)) {
      errors.push(`Required Commands: ${row.command}: evidence must identify ${row.command} output`);
    }
    if (row.status === 'linked' && !hasNoContradictoryDependencyEvidenceMarker(row.evidence)) {
      errors.push(`Required Commands: ${row.command}: evidence must not include contradictory dependency failure markers`);
    }
    if (row.status === 'linked' && !hasInternallyPositiveDependencyCommandOutput(row.evidence)) {
      errors.push(`Required Commands: ${row.command}: evidence must contain internally positive dependency command output`);
    }
  }

  return errors;
}

function validateScopeRows(rows: DependencyScopeRow[]): string[] {
  const errors = validateRequiredNames('Dependency Scope', rows.map(row => row.dependency), REQUIRED_DEPENDENCIES);

  for (const row of rows) {
    if (!REQUIRED_DEPENDENCIES.includes(row.dependency)) {
      errors.push(`Dependency Scope: ${row.dependency}: unexpected dependency`);
    }
    validateLinkedStatus(errors, 'Dependency Scope', row.dependency, row.status);
    if (isBlank(row.source)) errors.push(`Dependency Scope: ${row.dependency}: source is required`);
    if (isBlank(row.reviewedRisk)) errors.push(`Dependency Scope: ${row.dependency}: reviewed risk is required`);
    const riskExpectation = DEPENDENCY_RISK_EXPECTATIONS.get(row.dependency);
    if (riskExpectation && !isBlank(row.reviewedRisk) && !hasDependencyReviewScopeRiskFocus(row.dependency, row.reviewedRisk)) {
      errors.push(`Dependency Scope: ${row.dependency}: reviewed risk must mention ${riskExpectation.message}`);
    }
    if (row.status === 'linked' && !hasEvidenceMarker(row.evidence)) {
      errors.push(`Dependency Scope: ${row.dependency}: linked status requires an evidence marker`);
    } else if (row.status === 'linked' && !hasCompletedDependencyEvidenceTarget(row.evidence)) {
      errors.push(
        `Dependency Scope: ${row.dependency}: linked status requires a dependency evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence`,
      );
    }
    if (row.status === 'linked') {
      for (const marker of REQUIRED_DEPENDENCY_EVIDENCE_MARKERS[row.dependency] ?? []) {
        if (!marker.pattern.test(row.evidence)) {
          errors.push(`Dependency Scope: ${row.dependency}: ${marker.message}`);
        }
      }
      if (!hasNoContradictoryDependencyEvidenceMarker(row.evidence)) {
        errors.push(`Dependency Scope: ${row.dependency}: evidence must not include contradictory dependency failure markers`);
      }
    }
  }

  return errors;
}

function validateTriageRows(rows: VulnerabilityTriageRow[]): string[] {
  const errors = validateRequiredNames('Vulnerability Triage', rows.map(row => row.triageItem), REQUIRED_TRIAGE_ITEMS);

  for (const row of rows) {
    if (!REQUIRED_TRIAGE_ITEMS.includes(row.triageItem)) {
      errors.push(`Vulnerability Triage: ${row.triageItem}: unexpected triage item`);
    }
    validateLinkedStatus(errors, 'Vulnerability Triage', row.triageItem, row.status);
    if (isBlank(row.toolOrReviewMethod)) errors.push(`Vulnerability Triage: ${row.triageItem}: tool or review method is required`);
    if (isBlank(row.findings)) errors.push(`Vulnerability Triage: ${row.triageItem}: findings are required`);
    if (row.status === 'linked' && !hasEvidenceMarker(row.evidence)) {
      errors.push(`Vulnerability Triage: ${row.triageItem}: linked status requires an evidence marker`);
    } else if (row.status === 'linked' && !hasCompletedDependencyEvidenceTarget(row.evidence)) {
      errors.push(
        `Vulnerability Triage: ${row.triageItem}: linked status requires a triage evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence`,
      );
    }
    if (row.status === 'linked') {
      if (!hasNoContradictoryDependencyEvidenceMarker(row.evidence)) {
        errors.push(`Vulnerability Triage: ${row.triageItem}: evidence must not include contradictory dependency failure markers`);
      }
      if (hasPositiveCriticalHighFinding(row.findings)) {
        errors.push(
          `Vulnerability Triage: ${row.triageItem}: linked status cannot include positive critical/high finding counts`,
        );
      } else if (!hasNoOpenCriticalHighFinding(row.findings)) {
        errors.push(`Vulnerability Triage: ${row.triageItem}: linked status requires explicit zero open critical/high findings`);
      }
    }
  }

  return errors;
}

function validateUpgradeRows(rows: UpgradeDecisionRow[]): string[] {
  const errors = validateRequiredNames('Upgrade And Pinning Decision', rows.map(row => row.decision), REQUIRED_UPGRADE_DECISIONS);

  for (const row of rows) {
    if (!REQUIRED_UPGRADE_DECISIONS.includes(row.decision)) {
      errors.push(`Upgrade And Pinning Decision: ${row.decision}: unexpected decision`);
    }
    validateLinkedStatus(errors, 'Upgrade And Pinning Decision', row.decision, row.status);
    if (row.status === 'linked' && !hasEvidenceMarker(row.requiredEvidence)) {
      errors.push(`Upgrade And Pinning Decision: ${row.decision}: linked status requires an evidence marker`);
    } else if (row.status === 'linked' && !hasCompletedDependencyEvidenceTarget(row.requiredEvidence)) {
      errors.push(
        `Upgrade And Pinning Decision: ${row.decision}: linked status requires an upgrade evidence artifact marker or non-template evidence link; targetless command-output notes are not completed evidence`,
      );
    }
    if (row.status === 'linked' && !hasNoContradictoryDependencyEvidenceMarker(row.requiredEvidence)) {
      errors.push(
        `Upgrade And Pinning Decision: ${row.decision}: required evidence must not include contradictory dependency failure markers`,
      );
    }
    if (isBlank(row.releaseAction)) {
      errors.push(`Upgrade And Pinning Decision: ${row.decision}: release action is required`);
    } else if (!hasDependencyUpgradeDecisionReleaseAction(row.decision, row.releaseAction)) {
      errors.push(`Upgrade And Pinning Decision: ${row.decision}: release action must identify the dependency-specific upgrade or pinning decision`);
    }
    if (
      row.decision === 'Signer dependency upgrade decision' &&
      identifiesSignerUpstreamResolution(row.releaseAction) &&
      hasFailClosedSignerBlockerWording(row.releaseAction)
    ) {
      errors.push(
        `Upgrade And Pinning Decision: ${row.decision}: upstream signer release action must not include fail-closed signer blocker wording`,
      );
    }
    if (
      row.decision === 'Signer dependency upgrade decision' &&
      identifiesSignerUpstreamResolution(row.releaseAction) &&
      !identifiesSignerUpstreamResolutionEvidence(row.requiredEvidence)
    ) {
      errors.push(
        `Upgrade And Pinning Decision: ${row.decision}: required evidence must link completed upstream signer release and JVM/node conformance evidence`,
      );
    }
    if (
      row.decision === 'Signer dependency upgrade decision' &&
      identifiesSignerUpstreamResolution(row.releaseAction) &&
      identifiesSignerUpstreamResolutionEvidence(row.requiredEvidence) &&
      !dependencyReviewSignerReleaseIdentifiersMatch(row.releaseAction, row.requiredEvidence)
    ) {
      errors.push(
        `Upgrade And Pinning Decision: ${row.decision}: release action release identifier must match required evidence release identifier`,
      );
    }
    if (
      row.decision === 'Signer dependency upgrade decision' &&
      identifiesIncompleteSignerFailClosedDecision(row.releaseAction)
    ) {
      errors.push(
        `Upgrade And Pinning Decision: ${row.decision}: fail-closed release action must state that testnet production-candidate claims remain blocked`,
      );
    }
    if (
      row.decision === 'Signer dependency upgrade decision' &&
      !isBlank(row.releaseAction) &&
      !identifiesSignerUpstreamResolution(row.releaseAction) &&
      !identifiesSignerFailClosedDecision(row.releaseAction) &&
      !identifiesIncompleteSignerFailClosedDecision(row.releaseAction)
    ) {
      errors.push(
        `Upgrade And Pinning Decision: ${row.decision}: release action must state either upstream signer release with a concrete release identifier and JVM/node golden-vector or /transactions/check evidence, or explicit fail-closed guard/blocker rationale with production-ready and testnet production-candidate claims blocked`,
      );
    }
    if (
      row.decision === 'Signer dependency upgrade decision' &&
      identifiesSignerFailClosedDecision(row.releaseAction) &&
      !identifiesSignerFailClosedGuardEvidence(row)
    ) {
      errors.push(
        `Upgrade And Pinning Decision: ${row.decision}: fail-closed release action must cite ContextExtension guard evidence and production-ready plus testnet production-candidate claim blocking evidence`,
      );
    }
  }

  return errors;
}

function validateReviewerRows(rows: ReviewerSignoffRow[]): string[] {
  const errors = validateRequiredNames('Reviewer Sign-Off', rows.map(row => row.role), REQUIRED_REVIEWER_ROLES);

  for (const row of rows) {
    if (!REQUIRED_REVIEWER_ROLES.includes(row.role)) errors.push(`Reviewer Sign-Off: ${row.role}: unexpected role`);
    if (isBlank(row.name)) errors.push(`Reviewer Sign-Off: ${row.role}: name is required`);
    if (!ALLOWED_REVIEWER_DECISIONS.has(row.decision as ReviewerDecision)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve or block`);
    } else if (row.decision !== 'approve') {
      errors.push(`Reviewer Sign-Off: ${row.role}: decision must be approve before dependency review evidence can pass`);
    }
    if (isBlank(row.date)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: Date must use YYYY-MM-DD`);
    }
    if (isBlank(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes are required`);
    } else if (!hasNoContradictoryDependencyEvidenceMarker(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not include contradictory dependency failure markers`);
    } else if (approvesUnresolvedSignerBlocker(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve unresolved signer blockers`);
    } else if (approvesOpenCriticalHighVulnerability(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve open critical/high vulnerabilities`);
    } else if (leavesCriticalHighVulnerabilitiesOpen(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not leave critical/high vulnerabilities open`);
    } else if (approvesProductionReadyDependencyWording(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not approve production-ready claim wording`);
    } else if (containsMainnetProductionClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not contain mainnet production claim wording`);
    } else if (containsProductionReadyClaim(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must not contain production-ready claim wording`);
    } else if (!isActionableDependencyReviewerNote(row.notes)) {
      errors.push(`Reviewer Sign-Off: ${row.role}: notes must state a concrete dependency-risk outcome`);
    }
  }

  return errors;
}

function validateReviewerIdentityConsistency(markdown: string, rows: ReviewerSignoffRow[]): string[] {
  const classification = parseTwoColumnTable(
    sectionBetween(markdown, '## Review Classification', '## Required Commands'),
  );
  const classifiedReviewer = classification.get('Reviewer')?.trim() ?? '';
  const dependencyReviewerSignoff = rows.find(row => row.role === 'Dependency reviewer')?.name.trim() ?? '';

  if (
    classifiedReviewer.length > 0 &&
    dependencyReviewerSignoff.length > 0 &&
    classifiedReviewer !== dependencyReviewerSignoff
  ) {
    return ['Reviewer Sign-Off: Dependency reviewer: name must match Review Classification Reviewer'];
  }

  return [];
}

function validateReviewerDateConsistency(markdown: string, rows: ReviewerSignoffRow[]): string[] {
  const classification = parseTwoColumnTable(
    sectionBetween(markdown, '## Review Classification', '## Required Commands'),
  );
  const classificationDate = classification.get('Date')?.trim() ?? '';
  if (!isIsoCalendarDate(classificationDate)) return [];

  return rows
    .filter(row => isIsoCalendarDate(row.date) && row.date < classificationDate)
    .map(row => `Reviewer Sign-Off: ${row.role}: Date must not be before Review Classification Date`);
}

function validateLinkedStatus(errors: string[], section: string, label: string, status: string): void {
  if (!ALLOWED_STATUSES.has(status as DependencyReviewStatus)) {
    errors.push(`${section}: ${label}: status must be pending, linked, or blocker`);
    return;
  }
  if (status !== 'linked') {
    errors.push(`${section}: ${label}: status must be linked before dependency review evidence can pass`);
  }
}


function isActionableReviewerDecisionSummary(value: string): boolean {
  const normalized = normalizeDecisionSummary(value);
  return (
    /\brelease supported\b/.test(normalized) &&
    /\bupstream signer blocker handling\b|\bsigner blocker handling\b|\bupstream signer blocker resolved\b|\bupstream signer blocker unresolved\b|\bfail closed guard\b|\bfail closed blocker\b/.test(normalized) &&
    /\bproduction ready claim handling\b/.test(normalized) &&
    /\btestnet production candidate claim handling\b/.test(normalized) &&
    /\bcritical high vulnerabilities\b|\bcritical and high vulnerabilities\b|\bcritical or high vulnerabilities\b/.test(normalized)
  );
}

function normalizeDecisionSummary(value: string): string {
  return normalizeEvidenceMarkerText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function criticalHighVulnerabilitySubjectPattern(): string {
  return '(?:critical high|critical and high|critical or high|critical|high)\\s+(?:findings?|vulnerabilit(?:y|ies)|issues?)';
}

function hasExactCriticalHighVulnerabilitiesOpenBinding(value: string): boolean {
  return /\bCritical\/high vulnerabilities open\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value);
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

function hasExactReleaseSupportedBinding(value: string, expected: string): boolean {
  return new RegExp(`\\bRelease supported\\s*=\\s*${escapeRegExp(expected)}\\s*(?:$|[.;,|)\\]\\r\\n])`, 'i').test(value);
}

function hasExactUpstreamSignerBlockerResolvedBinding(
  value: string,
  expected: 'yes' | 'no',
): boolean {
  return new RegExp(`\\bUpstream signer blocker resolved\\s*=\\s*${expected}\\s*(?:$|[.;,|)\\]\\r\\n])`, 'i').test(value);
}

function hasContradictoryDependencyDecisionBinding(value: string): boolean {
  return (
    hasMixedDependencyReleaseSupportBindings(value) ||
    hasOpposingDependencyBinaryDecisionBindings(value, 'Production-ready claim allowed') ||
    hasOpposingDependencyBinaryDecisionBindings(value, 'Testnet production-candidate claim allowed') ||
    hasOpposingDependencyBinaryDecisionBindings(value, 'Upstream signer blocker resolved') ||
    hasMixedDependencyZeroAndNonzeroBindings(value, 'Critical/high vulnerabilities open')
  );
}

function hasMixedDependencyReleaseSupportBindings(value: string): boolean {
  const values = exactDependencyDecisionBindingValues(
    value,
    'Release supported',
    'none|validated\\s+PoC|institutional\\s+reference|production\\s+deployment\\s+candidate',
  );
  return values.size > 1;
}

function hasOpposingDependencyBinaryDecisionBindings(value: string, field: string): boolean {
  const values = exactDependencyDecisionBindingValues(value, field, 'yes|no');
  return values.has('yes') && values.has('no');
}

function hasMixedDependencyZeroAndNonzeroBindings(value: string, field: string): boolean {
  const values = [...exactDependencyDecisionBindingValues(value, field, '\\d+')].map(Number);
  return values.some(count => count === 0) && values.some(count => count > 0);
}

function exactDependencyDecisionBindingValues(value: string, field: string, valuePattern: string): Set<string> {
  const pattern = new RegExp(
    `\\b${field.split(/[- ]+/).map(escapeRegExp).join('[- ]+')}\\s*=\\s*(${valuePattern})\\s*(?:$|[.;,|)\\]\\r\\n])`,
    'ig',
  );
  return new Set([...value.matchAll(pattern)].map(match => match[1].toLowerCase().replace(/\s+/g, ' ')));
}

function usesTextualCriticalHighVulnerabilityClosure(value: string): boolean {
  const normalized = normalizeDecisionSummary(value);
  const subject = criticalHighVulnerabilitySubjectPattern();
  const textualClosure = '(?:zero|none|no|closed|resolved|mitigated|n a)';
  return (
    new RegExp(`\\b${subject}\\s+(?:are\\s+)?(?:open\\s+)?${textualClosure}\\b`).test(normalized) ||
    new RegExp(`\\bopen\\s+${subject}\\s+${textualClosure}\\b`).test(normalized) ||
    new RegExp(`\\b${textualClosure}\\s+(?:open\\s+)?${subject}\\b`).test(normalized)
  );
}

function usesNumericCriticalHighVulnerabilityClosure(value: string): boolean {
  const normalized = normalizeDecisionSummary(value);
  const subject = criticalHighVulnerabilitySubjectPattern();
  return (
    new RegExp(`\\b${subject}\\s+(?:are\\s+)?open\\s+0\\b`).test(normalized) ||
    new RegExp(`\\bopen\\s+${subject}\\s+0\\b`).test(normalized) ||
    new RegExp(`\\b${subject}\\s+0\\b`).test(normalized) ||
    new RegExp(`\\b${subject}\\s+(?:closure|count|handling)\\s+0\\b`).test(normalized) ||
    new RegExp(`\\b0\\s+(?:open\\s+)?${subject}\\b`).test(normalized)
  );
}

function usesNonExactCriticalHighVulnerabilityClosure(value: string): boolean {
  return (
    (usesTextualCriticalHighVulnerabilityClosure(value) || usesNumericCriticalHighVulnerabilityClosure(value)) &&
    !hasExactCriticalHighVulnerabilitiesOpenBinding(value)
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
  const completedEvidenceText = dependencyCompletedEvidenceText(value);
  return !hasLocalOnlyEvidenceTarget(value) &&
    !hasSensitiveOrRuntimeDependencyReviewEvidenceTarget(value) &&
    !hasClaimEscalatingDependencyReviewEvidenceReference(value) &&
    (hasCompletedArtifactTarget(completedEvidenceText) || hasNonTemplateMarkdownLink(completedEvidenceText));
}

function findDependencyReviewValidationTargetBinding(value: string): RegExpExecArray | null {
  return /\b(?:validated target|validated input|dependency validate target|dependency review validation target)\b/i
    .exec(value);
}

function hasCompletedArtifactTarget(value: string): boolean {
  return extractArtifactTargets(value)
    .some(target =>
      !hasSensitiveOrRuntimeDependencyReviewEvidenceTarget(target) &&
      !hasClaimEscalatingDependencyReviewEvidenceTarget(target) &&
      !hasNonConcreteEvidenceTargetSegment(target)
    );
}

function extractArtifactTargets(value: string): string[] {
  return [...value.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+)/g)]
    .map(([, target]) => target.replace(/[.;]+$/g, ''));
}

function extractDependencyEvidenceTargets(value: string): string[] {
  return [
    ...extractArtifactTargets(value),
    ...[...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(([, target]) => target),
  ];
}

function extractCompletedDependencyEvidenceTargets(value: string): string[] {
  return extractDependencyEvidenceTargets(dependencyCompletedEvidenceText(value));
}

function dependencyCompletedEvidenceText(value: string): string {
  return value
    .split(/[;\n]+/)
    .map(segment => {
      const targetBinding = findDependencyReviewValidationTargetBinding(segment);
      return targetBinding
        ? segment.slice(0, targetBinding.index).trim()
        : segment.trim();
    })
    .filter(segment => segment.length > 0)
    .join('; ');
}

function normalizeDependencyEvidenceTarget(target: string): string {
  return target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').trim().toLowerCase();
}

function hasClaimEscalatingDependencyReviewEvidenceReference(value: string): boolean {
  return extractDependencyEvidenceTargets(value)
    .some(target => hasClaimEscalatingDependencyReviewEvidenceTarget(target));
}

function hasClaimEscalatingDependencyReviewEvidenceTarget(target: string): boolean {
  const claim = classifyPublicationClaimText(normalizeDependencyEvidenceTarget(target));
  return claim.hasProductionClaim;
}

function isConcreteDependencyEvidenceTarget(target: string): boolean {
  const normalized = normalizeDependencyEvidenceTarget(target);
  return !isLocalOnlyEvidenceTarget(normalized) &&
    !hasSensitiveOrRuntimeDependencyReviewEvidenceTarget(normalized) &&
    !hasClaimEscalatingDependencyReviewEvidenceTarget(normalized) &&
    !/-template\.md(?:[#?].*)?$/i.test(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized);
}

function hasSensitiveOrRuntimeDependencyReviewEvidenceTarget(target: string): boolean {
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized)
    .map(normalizeDependencyReviewEvidenceInspectionTarget)
    .some(isSensitiveOrRuntimeDependencyReviewEvidenceInspectionTarget);
}

function normalizeDependencyReviewEvidenceInspectionTarget(normalizedTarget: string): string {
  const artifactTarget = /^artifact:\/\/[a-z0-9][a-z0-9._-]*\/(.+)$/i.exec(normalizedTarget);
  return artifactTarget ? artifactTarget[1] : normalizedTarget;
}

function isSensitiveOrRuntimeDependencyReviewEvidenceInspectionTarget(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasDependencyReviewEnvironmentTargetSegment(normalizedTarget) ||
    hasDependencyReviewRuntimeDatabaseTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isDependencyReviewSecretOrRuntimeName(normalizedTarget) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
  );
}

function isDependencyReviewSecretOrRuntimeName(normalizedTarget: string): boolean {
  if (!isEvidenceSecretOrRuntimeName(normalizedTarget, { includeDeployedState: true })) return false;
  return (
    !hasDependencyReviewWalletPackageReference(normalizedTarget) ||
    hasExplicitDependencyReviewSecretOrRuntimeName(normalizedTarget)
  );
}

function hasDependencyReviewWalletPackageReference(normalizedTarget: string): boolean {
  return /(?:^|[/_. -])(?:@?fleet[-_/.]?sdk[-_/.]?wallet|node[-_ ]?wallet)(?:$|[/_. -])/.test(normalizedTarget);
}

function hasExplicitDependencyReviewSecretOrRuntimeName(normalizedTarget: string): boolean {
  return (
    normalizedTarget.includes('secrets.' + 'dlog') ||
    normalizedTarget.includes('runtime-state') ||
    normalizedTarget.includes('deployed_state.json') ||
    /(?:^|[/_. -])(?:secret|secrets|mnemonic|keystore|keyfile|private[-_ ]?key|signing[-_ ]?key|api[-_ ]?key|seed[-_ ]?phrase)(?:$|[/_. -])/.test(normalizedTarget)
  );
}

function hasDependencyReviewEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasDependencyReviewRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function haveSharedConcreteDependencyEvidenceTarget(left: string, right: string): boolean {
  const leftTargets = new Set(
    extractCompletedDependencyEvidenceTargets(left)
      .map(normalizeDependencyEvidenceTarget)
      .filter(isConcreteDependencyEvidenceTarget),
  );
  return extractCompletedDependencyEvidenceTargets(right)
    .map(normalizeDependencyEvidenceTarget)
    .filter(isConcreteDependencyEvidenceTarget)
    .some(target => leftTargets.has(target));
}

function identifiesDependencyReleaseNoteEvidence(value: string): boolean {
  return identifiesDependencyPublicationEvidenceKind(
    value,
    'completed dependency review release-note evidence',
  );
}

function identifiesDependencyChecklistUpdateEvidence(value: string): boolean {
  return identifiesDependencyPublicationEvidenceKind(
    value,
    'completed dependency review checklist update evidence',
  );
}

function identifiesDependencyPublicationEvidenceKind(value: string, evidenceKind: string): boolean {
  const normalizedKind = normalizeDependencyEvidenceKind(evidenceKind);
  return dependencyPublicationEvidenceTargetsIdentifyKind(value, normalizedKind) ||
    dependencyPublicationEvidenceKindTextSegments(value)
      .some(segment =>
        segment === normalizedKind ||
        segment.startsWith(`${normalizedKind} `)
      );
}

function dependencyPublicationEvidenceTargetsIdentifyKind(value: string, normalizedKind: string): boolean {
  const expectedSlug = normalizedKind.replace(/\s+/g, '-');
  return extractCompletedDependencyEvidenceTargets(value)
    .some(target => normalizeDependencyPublicationEvidenceTargetBasename(target) === expectedSlug);
}

function normalizeDependencyPublicationEvidenceTargetBasename(target: string): string {
  const normalizedTarget = normalizeDependencyEvidenceTarget(target).replace(/\\/g, '/');
  const basename = normalizedTarget.split('/').filter(Boolean).pop() ?? normalizedTarget;
  return normalizeDependencyEvidenceKind(basename.replace(/\.[a-z0-9]+$/i, '')).replace(/\s+/g, '-');
}

function dependencyPublicationEvidenceKindTextSegments(value: string): string[] {
  return value
    .split(/[;\n|]+/)
    .map(stripLeadingDependencyEvidenceTarget)
    .map(normalizeDependencyEvidenceKind)
    .filter(segment => segment.length > 0);
}

function stripLeadingDependencyEvidenceTarget(value: string): string {
  const trimmed = value.trim();
  const markdownMatch = /^\[[^\]]+\]\([^)]+\)/.exec(trimmed);
  if (markdownMatch) return trimmed.slice(markdownMatch[0].length).replace(/^[\s,.:;-]+/, '');

  const artifactMatch = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+/i.exec(trimmed);
  if (artifactMatch) return trimmed.slice(artifactMatch[0].length).replace(/^[\s,.:;-]+/, '');

  return trimmed;
}

function normalizeDependencyEvidenceKind(value: string): string {
  return normalizeEvidenceMarkerText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function identifiesSignerUpstreamResolution(value: string): boolean {
  return (
    SIGNER_UPSTREAM_RELEASE_PATTERN.test(value) &&
    SIGNER_CONFORMANCE_PATTERN.test(value) &&
    identifiesConcreteSignerReleaseIdentifier(value) &&
    identifiesConcreteSignerConformanceEvidence(value) &&
    !SIGNER_NEGATED_CONFORMANCE_PATTERN.test(value)
  );
}

function identifiesSignerUpstreamResolutionEvidence(value: string): boolean {
  return (
    hasCompletedDependencyEvidenceTarget(value) &&
    hasNoContradictoryDependencyEvidenceMarker(value) &&
    SIGNER_UPSTREAM_RELEASE_PATTERN.test(value) &&
    SIGNER_CONFORMANCE_PATTERN.test(value) &&
    identifiesConcreteSignerReleaseIdentifier(value) &&
    identifiesConcreteSignerConformanceEvidence(value) &&
    !SIGNER_NEGATED_CONFORMANCE_PATTERN.test(value)
  );
}

function identifiesConcreteSignerReleaseIdentifier(value: string): boolean {
  return (
    SIGNER_LABELED_RELEASE_VERSION_PATTERN.test(value) ||
    SIGNER_LABELED_RELEASE_COMMIT_PATTERN.test(value) ||
    SIGNER_RELEASE_VERSION_PATTERN.test(value) ||
    SIGNER_RELEASE_COMMIT_PATTERN.test(value)
  );
}

export function dependencyReviewSignerReleaseIdentifiersMatch(
  releaseAction: string,
  requiredEvidence: string,
): boolean {
  const actionIdentifiers = extractDependencyReviewSignerReleaseIdentifiers(releaseAction);
  const evidenceIdentifiers = new Set(extractDependencyReviewSignerReleaseIdentifiers(requiredEvidence));
  if (actionIdentifiers.length === 0 || evidenceIdentifiers.size === 0) return true;
  return actionIdentifiers.some(identifier => evidenceIdentifiers.has(identifier));
}

export function extractDependencyReviewSignerReleaseIdentifiers(value: string): string[] {
  const identifiers = new Set<string>();
  for (const match of value.matchAll(/\bv?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/g)) {
    identifiers.add(`version:${match[1].toLowerCase()}`);
  }
  for (const match of value.matchAll(/\b(?:commit|sha)\s*[:=]\s*([a-f0-9]{7,40})\b/gi)) {
    identifiers.add(`commit:${match[1].toLowerCase()}`);
  }
  for (const match of value.matchAll(/\b[a-f0-9]{7,40}\b/gi)) {
    identifiers.add(`commit:${match[0].toLowerCase()}`);
  }
  return [...identifiers];
}

function identifiesConcreteSignerConformanceEvidence(value: string): boolean {
  return SIGNER_CONCRETE_CONFORMANCE_PATTERN.test(value) && SIGNER_CONFORMANCE_RESULT_PATTERN.test(value);
}

function identifiesSignerFailClosedDecision(value: string): boolean {
  return (
    SIGNER_FAIL_CLOSED_PATTERN.test(value) &&
    SIGNER_GUARD_BLOCKER_PATTERN.test(value) &&
    PRODUCTION_CLAIMS_BLOCKED_PATTERN.test(value) &&
    TESTNET_PRODUCTION_CANDIDATE_CLAIMS_BLOCKED_PATTERN.test(value)
  );
}

function identifiesIncompleteSignerFailClosedDecision(value: string): boolean {
  return (
    SIGNER_FAIL_CLOSED_PATTERN.test(value) &&
    SIGNER_GUARD_BLOCKER_PATTERN.test(value) &&
    PRODUCTION_CLAIMS_BLOCKED_PATTERN.test(value) &&
    !TESTNET_PRODUCTION_CANDIDATE_CLAIMS_BLOCKED_PATTERN.test(value)
  );
}

function identifiesSignerFailClosedGuardEvidence(row: UpgradeDecisionRow): boolean {
  const combined = `${row.requiredEvidence} ${row.releaseAction}`;
  return (
    SIGNER_CONTEXT_EXTENSION_PATTERN.test(combined) &&
    SIGNER_GUARD_BLOCKER_PATTERN.test(combined) &&
    PRODUCTION_CLAIMS_BLOCKED_PATTERN.test(combined) &&
    TESTNET_PRODUCTION_CANDIDATE_CLAIMS_BLOCKED_PATTERN.test(combined) &&
    hasContextExtensionGuardEvidenceMarker(row)
  );
}

function hasFailClosedSignerBlockerWording(value: string): boolean {
  return SIGNER_FAIL_CLOSED_MIXED_WITH_UPSTREAM_PATTERN.test(value);
}

function hasContextExtensionGuardEvidenceMarker(row: UpgradeDecisionRow): boolean {
  return (
    (SIGNER_CONTEXT_EXTENSION_PATTERN.test(row.requiredEvidence) && hasInlineCompletedEvidenceMarker(row.requiredEvidence)) ||
    (SIGNER_CONTEXT_EXTENSION_PATTERN.test(row.releaseAction) && hasInlineCompletedEvidenceMarker(row.releaseAction))
  );
}

function hasInlineCompletedEvidenceMarker(value: string): boolean {
  return hasCompletedDependencyEvidenceTarget(value);
}

function hasNonTemplateMarkdownLink(value: string): boolean {
  const links = [...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
  return links.some(([, target]) => isConcreteDependencyEvidenceTarget(target));
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
    /(?:^|[\/_.-])template(?:[\/_.-](?:proof|evidence|artifact|target|log|run|check|update|dependency|review|command|scope|triage|vulnerability|vulnerabilities|audit|npm|cargo|rust|tree|lockfile|lockfiles|signer|fleet|sdk|ergo[-_.]?lib|sigma[-_.]?rust|context[-_.]?extension|serializer|avl|sqlite|evm|toolchain|upgrade|pinning|decision|release|checklist|guard|blocker)|$)/i.test(normalized) ||
    /(?:^|[\/_.-])sample(?:[\/_.-](?:proof|evidence|artifact|target|log|run|check|update|dependency|review|command|scope|triage|vulnerability|vulnerabilities|audit|npm|cargo|rust|tree|lockfile|lockfiles|signer|fleet|sdk|ergo[-_.]?lib|sigma[-_.]?rust|context[-_.]?extension|serializer|avl|sqlite|evm|toolchain|upgrade|pinning|decision|release|checklist|guard|blocker)|$)/i.test(normalized) ||
    /(?:^|[\/_.-])example(?:[\/_.-](?:proof|evidence|artifact|target|log|run|check|update|validator|dependency|review|command|scope|triage|vulnerability|vulnerabilities|audit|npm|cargo|rust|tree|lockfile|lockfiles|signer|fleet|sdk|ergo[-_.]?lib|sigma[-_.]?rust|context[-_.]?extension|serializer|avl|sqlite|evm|toolchain|upgrade|pinning|decision|release|checklist|guard|blocker)|$)/i.test(normalized) ||
    /(?:^|[\/_.-])(?:sample|example)[-_ ]*evidence(?:[\/_.-]|$)/i.test(normalized)
  );
}

function commandEvidenceIdentifiesCommand(command: string, evidence: string): boolean {
  return new RegExp(escapeRegExp(command), 'i').test(evidence) || commandSlugPattern(command).test(evidence);
}

export function hasNoContradictoryDependencyEvidenceMarker(value: string): boolean {
  return !hasContradictoryDependencyEvidenceMarker(value);
}

function hasContradictoryDependencyEvidenceMarker(value: string): boolean {
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

function hasAmbiguousDependencyExitCode(value: string): boolean {
  return /\bexit[- ]?code\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value);
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

function isExactZero(value: string): boolean {
  return value.trim() === '0';
}

function hasNoOpenCriticalHighFinding(value: string): boolean {
  if (hasAmbiguousCriticalHighFindingCount(value)) return false;
  return /\b(0|zero|none|no open|no known|closed|resolved)\b/i.test(value)
    && /\b(critical|high)\b/i.test(value);
}

function hasAmbiguousCriticalHighFindingCount(value: string): boolean {
  return (
    /\b(?:critical\s*\/\s*high|critical high|critical and high|critical or high|critical|high)(?:\s+(?:findings?|vulnerabilit(?:y|ies)|issues?))?\s*(?:open\s*)?(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value) ||
    /\b0\s*\/\s*\d+\s+(?:open\s+)?(?:critical\s*\/\s*high|critical high|critical and high|critical or high|critical|high)(?:\s+(?:findings?|vulnerabilit(?:y|ies)|issues?))?\b/i.test(value)
  );
}

function hasPositiveCriticalHighFinding(value: string): boolean {
  return POSITIVE_CRITICAL_HIGH_FINDING_PATTERN.test(value);
}

function approvesUnresolvedSignerBlocker(value: string): boolean {
  return normalizedDependencyReviewTextSegments(value).some(segment =>
    dependencyReviewTextApprovesSubject(segment, UNRESOLVED_SIGNER_BLOCKER_SUBJECT_PATTERN)
  );
}

function approvesOpenCriticalHighVulnerability(value: string): boolean {
  return normalizedDependencyReviewTextSegments(value).some(segment =>
    !dependencyReviewSegmentClosesOpenCriticalHighVulnerabilities(segment) &&
    dependencyReviewTextApprovesSubject(segment, OPEN_CRITICAL_HIGH_VULNERABILITY_SUBJECT_PATTERN)
  );
}

function leavesCriticalHighVulnerabilitiesOpen(value: string): boolean {
  const subject = criticalHighVulnerabilitySubjectPattern();
  const unresolvedState = '(?:pending|unresolved|outstanding|remaining|awaiting|waiting(?:\\s+(?:for|on))?|deferred)';
  return normalizedDependencyReviewTextSegments(value).some(segment => {
    if (dependencyReviewSegmentConfirmsNoOpenCriticalHighVulnerabilities(segment, subject)) return false;
    return (
      new RegExp(`\\b${subject}\\s+open\\s+(?!0\\b|none\\b|no\\b|closed\\b)\\S+\\b`).test(segment) ||
      new RegExp(`\\b${subject}\\s+(?:count|total)\\s+(?!0\\b|zero\\b|none\\b|no\\b|closed\\b|resolved\\b|mitigated\\b)\\S+\\s+${unresolvedState}\\b`).test(segment) ||
      new RegExp(`\\bopen\\s+${subject}\\b`).test(segment) ||
      new RegExp(`\\b${subject}\\s+${unresolvedState}\\b`).test(segment) ||
      new RegExp(`\\b${unresolvedState}\\s+${subject}\\b`).test(segment)
    );
  });
}

function approvesFailClosedSignerCandidate(value: string): boolean {
  const normalized = normalizeDecisionSummary(value);
  return (
    new RegExp(
      `\\b(?:fail\\s+closed|fail[- ]closed)\\s+(?:signer\\s+)?(?:guard|blocker)\\s+${REVIEWER_APPROVAL_VERB_PATTERN}\\s+(?:for\\s+)?(?:candidate|candidate support|testnet production candidate|production deployment candidate|release support)\\b`,
    ).test(normalized) ||
    new RegExp(
      `\\b(?:candidate|candidate support|testnet production candidate|production deployment candidate|release support)\\s+${REVIEWER_APPROVAL_VERB_PATTERN}\\s+(?:with|despite)\\s+(?:fail\\s+closed|fail[- ]closed)\\s+(?:signer\\s+)?(?:guard|blocker)\\b`,
    ).test(normalized) ||
    new RegExp(
      `\\b${REVIEWER_APPROVAL_VERB_PATTERN}\\s+(?:candidate|candidate support|testnet production candidate|production deployment candidate|release support)\\s+(?:with|despite)\\s+(?:fail\\s+closed|fail[- ]closed)\\s+(?:signer\\s+)?(?:guard|blocker)\\b`,
    ).test(normalized)
  );
}

function approvesProductionReadyDependencyWording(value: string): boolean {
  return APPROVES_PRODUCTION_READY_DEPENDENCY_WORDING_PATTERN.test(value);
}

function dependencyReviewSegmentClosesOpenCriticalHighVulnerabilities(segment: string): boolean {
  return /\b(?:0|zero|none|no)\s+(?:open\s+)?(?:critical high|critical and high|critical or high|critical|high)\s+(?:findings?|vulnerabilities|issues?)\b/.test(segment);
}

function dependencyReviewSegmentConfirmsNoOpenCriticalHighVulnerabilities(segment: string, subject: string): boolean {
  return (
    dependencyReviewSegmentClosesOpenCriticalHighVulnerabilities(segment) ||
    new RegExp(`\\b(?:without|absence|absent|lack|lacks|lacking)(?:\\s+of)?\\s+(?:open\\s+)?${subject}\\b`).test(segment) ||
    new RegExp(`\\b(?:open\\s+)?${subject}\\b(?:\\s+[a-z0-9]+){0,3}\\s+not\\s+${REVIEWER_APPROVAL_VERB_PATTERN}\\b`).test(segment)
  );
}

function dependencyReviewTextApprovesSubject(segment: string, subjectPattern: string): boolean {
  return [
    new RegExp(
      `\\b${REVIEWER_APPROVAL_VERB_PATTERN}\\b${REVIEWER_APPROVAL_CONNECTOR_PATTERN}(?:${subjectPattern})\\b`,
      'g',
    ),
    new RegExp(
      `\\b(?:${subjectPattern})\\b${REVIEWER_APPROVAL_CONNECTOR_PATTERN}${REVIEWER_APPROVAL_VERB_PATTERN}\\b`,
      'g',
    ),
  ].some(pattern => hasUnnegatedDependencyReviewApproval(segment, pattern));
}

function hasUnnegatedDependencyReviewApproval(segment: string, pattern: RegExp): boolean {
  for (const match of segment.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = segment.slice(Math.max(0, index - 32), index);
    if (!REVIEWER_DENIAL_OR_BOUNDARY_PREFIX_PATTERN.test(prefix)) return true;
  }
  return false;
}

function normalizedDependencyReviewTextSegments(value: string): string[] {
  return value
    .split(/[\n\r|;]+|[.]\s+/)
    .map(normalizeDecisionSummary)
    .filter(segment => segment.length > 0);
}

function containsMainnetProductionClaim(value: string): boolean {
  return classifyPublicationClaimText(value).hasMainnetProductionClaim;
}

function containsProductionReadyClaim(value: string): boolean {
  return classifyPublicationClaimText(value).hasProductionReadyClaim;
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}
