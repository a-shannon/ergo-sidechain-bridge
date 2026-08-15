import { basename } from 'path';

import { REQUIRED_PENDING_EVIDENCE_ROWS } from './release-gate.js';
import { isIsoCalendarDate, validateIsoDateField } from './evidence-date.js';
import { isGitCommitSha, validateGitCommitField } from './evidence-git.js';
import {
  hasAbsoluteSecurityClaim,
  hasConditionalValidationApprovalMarker,
  hasStructuredValidationFailureMarker,
  normalizeEvidenceMarkerText,
  hasUnresolvedIssueMarker,
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
  CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR,
  MAINNET_PRODUCTION_CLAIM_ERROR,
  PRODUCTION_CLAIM_EVIDENCE_ERROR,
  PRODUCTION_CLAIM_WORDING,
  claimEvidenceIdentifiesClaim,
  hasCanonicalControlledTestnetProductionClaim,
  hasControlledTestnetProductionClaim,
  hasMainnetProductionClaim,
  hasNegatedAllowedClaimEvidenceLink,
  hasProductionClaim,
  hasProductionReadyClaim,
} from './publication-claim-boundary.js';

export type ReleaseEvidenceStatus = 'pending' | 'linked' | 'blocker';
export type ReleaseDecision = 'proposed' | 'blocked' | 'rejected';
export type SignoffDecision = 'approve' | 'block';

export interface ReleaseNotesClassification {
  releaseName: string;
  gitCommit: string;
  releaseLevel: string;
  decision: string;
  decisionOwner: string;
  decisionDate: string;
}

export interface RequiredEvidenceRow {
  evidenceClass: string;
  status: string;
  linkOrArtifact: string;
  publicationEffect: string;
}

export interface TrustAssumptionRow {
  assumption: string;
  currentStatus: string;
  evidence: string;
  releaseImpact: string;
}

export interface PublicationBlockerRow {
  gate: string;
  blocker: string;
  status: string;
  requiredResolution: string;
  scopedOut: string;
}

export interface AllowedClaimRow {
  claim: string;
  evidenceLink: string;
  allowedWording: string;
}

export interface OperatorImpactRow {
  area: string;
  requiredOperatorAction: string;
  stopCondition: string;
}

export interface ReleaseSignoffRow {
  role: string;
  name: string;
  decision: string;
  date: string;
  notes: string;
}

export interface ReleaseNotesValidation {
  status: 'PASS' | 'BLOCKED';
  classification: ReleaseNotesClassification;
  evidenceRows: RequiredEvidenceRow[];
  assumptionRows: TrustAssumptionRow[];
  blockerRows: PublicationBlockerRow[];
  claimRows: AllowedClaimRow[];
  operatorRows: OperatorImpactRow[];
  signoffRows: ReleaseSignoffRow[];
  errors: string[];
  message: string;
}

type ReleaseNotesRecoveryObserveKind =
  | 'failed-broadcast-phantom-avl'
  | 'reorged-burn-stale-singleton';

interface ParsedRows<T> {
  rows: T[];
  errors: string[];
}

const REQUIRED_SECTIONS = [
  '## Release Classification',
  '## Scope Statement',
  '## Required Evidence',
  '## Trust Assumptions',
  '## Publication Blockers',
  '## Allowed Claims',
  '## Disallowed Claims Check',
  '## Operator Impact',
  '## Sign-Off',
];

const REQUIRED_CLASSIFICATION_FIELDS = [
  'Release name',
  'Git commit',
  'Release level',
  'Decision',
  'Decision owner',
  'Decision date',
];

const REQUIRED_TABLE_HEADERS = [
  {
    section: 'Release Classification',
    startHeading: '## Release Classification',
    endHeading: '## Scope Statement',
    header: ['Field', 'Value'],
  },
  {
    section: 'Required Evidence',
    startHeading: '## Required Evidence',
    endHeading: '## Trust Assumptions',
    header: ['Evidence class', 'Status', 'Link or artifact', 'Publication effect'],
  },
  {
    section: 'Trust Assumptions',
    startHeading: '## Trust Assumptions',
    endHeading: '## Publication Blockers',
    header: ['Assumption', 'Current status', 'Evidence', 'Release impact'],
  },
  {
    section: 'Publication Blockers',
    startHeading: '## Publication Blockers',
    endHeading: '## Allowed Claims',
    header: ['Gate', 'Blocker', 'Status', 'Required resolution', 'Scoped out?'],
  },
  {
    section: 'Allowed Claims',
    startHeading: '## Allowed Claims',
    endHeading: '## Disallowed Claims Check',
    header: ['Claim', 'Evidence link', 'Allowed wording'],
  },
  {
    section: 'Operator Impact',
    startHeading: '## Operator Impact',
    endHeading: '## Sign-Off',
    header: ['Area', 'Required operator action', 'Stop condition'],
  },
  {
    section: 'Sign-Off',
    startHeading: '## Sign-Off',
    header: ['Role', 'Name', 'Decision', 'Date', 'Notes'],
  },
];

export const REQUIRED_EVIDENCE_CLASSES = [
  'Clean checkout CI',
  'Local devnet lifecycle rehearsal',
  'Testnet lifecycle rehearsal',
  'Failed broadcast phantom AVL recovery drill evidence',
  'Reorged burn and stale singleton recovery drill evidence',
  'ContextExtension signer resolution or guard',
  'Signer dependency conformance or fail-closed release decision evidence',
  'Broadcast gate evidence',
  'SQLite/AVL backup-restore evidence',
  'Operator readiness evidence',
  'Committee governance and key-rotation evidence',
  'Threat model and evidence matrix',
  'Dependency risk review evidence',
  'Independent security review',
  'Trustless burn verification evidence',
  'Single, batch, and sharded benchmark evidence',
  'External integration package review',
  'Technical addendum architecture manual',
];

const REQUIRED_EVIDENCE_CLASS_BY_BLOCKER = new Map<string, string>([
  ['Green CI on the final branch', 'Clean checkout CI'],
  ['Fresh local devnet lifecycle run', 'Local devnet lifecycle rehearsal'],
  ['Fresh Ergo testnet lifecycle run', 'Testnet lifecycle rehearsal'],
  ['Failed broadcast / phantom AVL recovery drill', 'Failed broadcast phantom AVL recovery drill evidence'],
  ['Reorged burn and stale singleton recovery drill', 'Reorged burn and stale singleton recovery drill evidence'],
  ['Backup-restore or reconstructibility drill', 'SQLite/AVL backup-restore evidence'],
  ['Independent security review report', 'Independent security review'],
  [
    'Signer dependency conformance or fail-closed release decision',
    'Signer dependency conformance or fail-closed release decision evidence',
  ],
  ['Trustless burn verification path', 'Trustless burn verification evidence'],
  ['Committee governance and key-rotation drill', 'Committee governance and key-rotation evidence'],
  ['Operator readiness evidence', 'Operator readiness evidence'],
  ['Single, batch, and sharded benchmark evidence', 'Single, batch, and sharded benchmark evidence'],
  ['External integration package review', 'External integration package review'],
  ['Technical addendum architecture manual', 'Technical addendum architecture manual'],
]);

const REQUIRED_RELEASE_EVIDENCE_FOCUS: Record<string, { pattern: RegExp; message: string }> = {
  'Clean checkout CI': {
    pattern: /clean[- ]checkout|npm[- ]ci|\bci\b|release[- ]gate|git[- ]hygiene/i,
    message: 'evidence must identify clean checkout CI',
  },
  'Local devnet lifecycle rehearsal': {
    pattern: /local[- ]devnet|devnet/i,
    message: 'evidence must identify local devnet lifecycle rehearsal',
  },
  'Testnet lifecycle rehearsal': {
    pattern: /testnet/i,
    message: 'evidence must identify testnet lifecycle rehearsal',
  },
  'Failed broadcast phantom AVL recovery drill evidence': {
    pattern: /failed[- ]broadcast|phantom|dup|avl[- ]history|avl/i,
    message: 'evidence must identify failed broadcast phantom AVL recovery drill',
  },
  'Reorged burn and stale singleton recovery drill evidence': {
    pattern: /reorg|reorged[- ]burn|stale[- ]singleton|singleton/i,
    message: 'evidence must identify reorged burn or stale singleton recovery drill',
  },
  'ContextExtension signer resolution or guard': {
    pattern: /contextextension|context[- ]extension|signer|guard/i,
    message: 'evidence must identify ContextExtension signer guard or resolution',
  },
  'Signer dependency conformance or fail-closed release decision evidence': {
    pattern: /signer[- ]dependency|ergo-lib-wasm-nodejs|sigma[- ]rust|jvm|transactions\/check|fail[- ]closed|upstream[- ]signer/i,
    message: 'evidence must identify signer dependency conformance or fail-closed release decision',
  },
  'Broadcast gate evidence': {
    pattern: /broadcast/i,
    message: 'evidence must identify broadcast gate evidence',
  },
  'SQLite/AVL backup-restore evidence': {
    pattern: /sqlite|avl|backup[- ]restore|backup|restore/i,
    message: 'evidence must identify SQLite/AVL backup-restore evidence',
  },
  'Operator readiness evidence': {
    pattern: /operator[- ]readiness|operator/i,
    message: 'evidence must identify operator readiness evidence',
  },
  'Committee governance and key-rotation evidence': {
    pattern: /committee|governance|key[- ]rotation|rotation/i,
    message: 'evidence must identify committee governance or key-rotation evidence',
  },
  'Threat model and evidence matrix': {
    pattern: /threat[- ]model|evidence[- ]matrix|security[- ]evidence[- ]matrix|matrix/i,
    message: 'evidence must identify threat model or evidence matrix',
  },
  'Dependency risk review evidence': {
    pattern: /dependency|risk[- ]review/i,
    message: 'evidence must identify dependency risk review evidence',
  },
  'Independent security review': {
    pattern: /independent[- ]security|security[- ]review/i,
    message: 'evidence must identify independent security review',
  },
  'Trustless burn verification evidence': {
    pattern: /trustless[- ]burn|burn[- ]verification|trustless/i,
    message: 'evidence must identify trustless burn verification evidence',
  },
  'Single, batch, and sharded benchmark evidence': {
    pattern: /benchmark|single|batch|sharded/i,
    message: 'evidence must identify single, batch, or sharded benchmark evidence',
  },
  'External integration package review': {
    pattern: /external[- ]integration|integration[- ]package|gate[- ]8|fresh[- ]reviewer/i,
    message: 'evidence must identify external integration package review',
  },
  'Technical addendum architecture manual': {
    pattern: /technical[- ]addendum|architecture[- ]manual|addendum:validate|gate[- ]2/i,
    message: 'evidence must identify the technical addendum architecture manual',
  },
};

export const REQUIRED_TRUST_ASSUMPTIONS = [
  'Trusted-oracle burn interpretation',
  'ContextExtension signer consensus',
  'Committee/governance and key rotation',
  'Explicit broadcast opt-in',
  'Local SQLite/AVL recovery',
  'External security review',
];

const REQUIRED_TRUST_ASSUMPTION_EVIDENCE_FOCUS: Record<string, { pattern: RegExp; message: string }> = {
  'Trusted-oracle burn interpretation': {
    pattern: /trusted[- ]oracle|oracle.*burn|burn[- ]interpretation|burn.*oracle/i,
    message: 'evidence must identify trusted-oracle burn interpretation',
  },
  'ContextExtension signer consensus': {
    pattern: /contextextension|context[- ]extension|signer[- ]consensus|signer/i,
    message: 'evidence must identify ContextExtension signer consensus',
  },
  'Committee/governance and key rotation': {
    pattern: /committee|governance|key[- ]rotation|rotation/i,
    message: 'evidence must identify committee governance or key rotation',
  },
  'Explicit broadcast opt-in': {
    pattern: /broadcast|opt[- ]in/i,
    message: 'evidence must identify explicit broadcast opt-in',
  },
  'Local SQLite/AVL recovery': {
    pattern: /sqlite|avl|recovery|backup[- ]restore/i,
    message: 'evidence must identify local SQLite/AVL recovery',
  },
  'External security review': {
    pattern: /external[- ]security|security[- ]review|independent[- ]security|external/i,
    message: 'evidence must identify external security review',
  },
};

const TESTNET_PRODUCTION_CANDIDATE_REQUIRED_EVIDENCE_CLASSES = [...REQUIRED_EVIDENCE_CLASSES];

const TESTNET_PRODUCTION_CANDIDATE_REQUIRED_PUBLICATION_BLOCKERS =
  REQUIRED_PENDING_EVIDENCE_ROWS.map(row => row.item);

export const REQUIRED_DISALLOWED_CLAIMS = [
  'No absolute security claim.',
  'No unqualified production-ready or production-readiness claim.',
  `No ${PRODUCTION_CLAIM_WORDING} claim unless the wording is the controlled ` +
    '`testnet production-candidate` or `production-grade testnet` public wording and all ' +
    'required testnet evidence gates are linked and checked; this exception does not allow ' +
    'production-ready, mainnet, go-live, general availability, generally available, or production launch wording.',
  'No forbidden mainnet-scoped claim: mainnet, main-net, main net, main network, or main chain paired with forbidden production-ready, production-candidate, go-live, general availability, generally available, or production launch wording; production-candidate language is testnet-only.',
  'No testnet production-candidate or production-grade testnet claim without linked final CI, local devnet, testnet lifecycle, recovery drills, backup-restore, ContextExtension signer guard, broadcast gate, signer conformance, operator readiness, governance/key-rotation, threat model, dependency risk, independent security review, trustless burn verification, benchmark, external integration evidence, technical addendum architecture manual evidence, and checked publication blockers.',
  'No throughput, latency, TPS, tx/s, transaction-per-second, or scaling claim without benchmark evidence.',
  'No trustless burn, burn verification, SPV, burn inclusion, phantom burn trust minimization, or sidechain commitment claim without linked trustless burn evidence.',
  'No trusted burn verification, trusted-oracle burn, or oracle-fallback completion claim without linked trustless burn evidence.',
  'No ContextExtension signer guard, fail-closed guard, or signer resolution claim without linked ContextExtension signer guard evidence.',
  'No signer dependency, ContextExtension, sigma-rust, or upstream signer claim without linked signer dependency evidence.',
  'No broadcast, broadcast gate, broadcast opt-in, or transaction broadcast claim without linked broadcast gate evidence.',
  'No dependency risk, dependency register, toolchain, lockfile, supply-chain, or vulnerability-triage claim without linked dependency risk review evidence.',
  'No threat model, evidence matrix, risk-class, attack-chain, or mitigation claim without linked threat-model/evidence-matrix evidence.',
  'No claim that trusted burn verification is solved until the SPV/burn inclusion proof path is linked.',
  'No committee governance, key-rotation, threshold, or multisig claim without linked committee governance evidence.',
  'No claim that committee governance is complete until key-rotation and incident drills are linked.',
  'No operator readiness, operationally-ready, ops-ready, runbook, incident, or monitoring claim without linked operator readiness evidence.',
  'No external integration, third-party integration, integrator-ready, partner-ready, safe-to-publish, publication-approved, release-candidate, fresh checkout, institutional-reference, public release, publication-ready, or private maintainer context claim without linked external integration evidence.',
  'No backup, restore, disaster recovery, state recovery, SQLite/WAL, or AVL rebuild claim without linked backup-restore evidence.',
  'No security review, audit, security assessment, penetration-test, finding disposition, or critical/high claim without linked independent security review evidence.',
  'No failed broadcast, phantom AVL, or phantom DUP claim without linked failed-broadcast recovery evidence.',
  'No reorged burn or stale singleton claim without linked reorg/stale-singleton recovery evidence.',
  'No clean checkout, CI, final branch, or workflow claim without linked clean-checkout evidence.',
  'No local devnet lifecycle claim without linked local devnet lifecycle evidence.',
  'No testnet lifecycle claim without completed live rehearsal evidence with `npm run rehearsal:validate` PASS output bound to the completed rehearsal target and linked `Ergo node network testnet` plus `Sidechain network` scope evidence.',
  'No peg-in, peg-out, end-to-end, round-trip, full-lifecycle, submit, confirmation, or reconciliation claim without linked local devnet lifecycle evidence or completed live testnet lifecycle evidence with `npm run rehearsal:validate` PASS output bound to the completed rehearsal target.',
];

export const REQUIRED_OPERATOR_AREAS = [
  'Deployment state',
  'Broadcast enablement',
  'SQLite/AVL backup restore',
  'Monitoring and alerting',
  'Incident response',
];

const REQUIRED_OPERATOR_IMPACT_FOCUS: Record<string, { pattern: RegExp; message: string }> = {
  'Deployment state': {
    pattern: /deployment|deployed|singleton|state/i,
    message: 'action or stop condition must mention deployment state',
  },
  'Broadcast enablement': {
    pattern: /broadcast|enable|disable/i,
    message: 'action or stop condition must mention broadcast enablement',
  },
  'SQLite/AVL backup restore': {
    pattern: /sqlite|avl|backup|restore/i,
    message: 'action or stop condition must mention SQLite, AVL, backup, or restore',
  },
  'Monitoring and alerting': {
    pattern: /monitor|alert|status/i,
    message: 'action or stop condition must mention monitoring, alerting, or status',
  },
  'Incident response': {
    pattern: /incident|response|triage/i,
    message: 'action or stop condition must mention incident response',
  },
};

export const REQUIRED_SIGNOFF_ROLES = [
  'Maintainer',
  'Security reviewer',
  'Operator reviewer',
];

const REQUIRED_SIGNOFF_NOTE_FOCUS: Record<string, { pattern: RegExp; message: string }> = {
  Maintainer: {
    pattern: /maintainer|release[- ]decision|scope|publication|blocker/i,
    message: 'notes must identify maintainer release decision, scope, publication, or blocker review',
  },
  'Security reviewer': {
    pattern: /security|trust[- ]assumption|claim|evidence|blocker/i,
    message: 'notes must identify security, trust-assumption, claim, evidence, or blocker review',
  },
  'Operator reviewer': {
    pattern: /operator|runbook|operator[- ]impact|readiness|incident/i,
    message: 'notes must identify operator impact, runbook, readiness, or incident review',
  },
};

const ALLOWED_RELEASE_LEVELS = new Set([
  'validated PoC',
  'institutional reference',
  'production deployment candidate',
]);
const ALLOWED_DECISIONS = new Set<ReleaseDecision>(['proposed', 'blocked', 'rejected']);
const ALLOWED_EVIDENCE_STATUSES = new Set<ReleaseEvidenceStatus>(['pending', 'linked', 'blocker']);
const ALLOWED_BLOCKER_STATUSES = new Set(['Pending evidence', 'Open blocker', 'Checked']);
const ALLOWED_SCOPED_OUT = new Set(['yes', 'no']);
const ALLOWED_SIGNOFF_DECISIONS = new Set<SignoffDecision>(['approve', 'block']);
const REQUIRED_PUBLICATION_BLOCKER_ITEMS = new Set(
  REQUIRED_PENDING_EVIDENCE_ROWS.map(row => row.item),
);
const REQUIRED_PUBLICATION_BLOCKER_BY_ITEM = new Map(
  REQUIRED_PENDING_EVIDENCE_ROWS.map(row => [row.item, row]),
);
const VALIDATED_POC_NON_SCOPABLE_BLOCKERS = new Set([
  'Green CI on the final branch',
  'Fresh local devnet lifecycle run',
]);
const INSTITUTIONAL_REFERENCE_SCOPABLE_BLOCKERS = new Set([
  'Trustless burn verification path',
  'Committee governance and key-rotation drill',
  'Single, batch, and sharded benchmark evidence',
]);

function parseMarkdownTableLine(line: string): string[] {
  const trimmed = line.trim();
  return trimmed
    .slice(1, -1)
    .split('|')
    .map(cell => cell.trim());
}

function parseMarkdownTableRows(table: string): string[][] {
  return table
    .split(/\r?\n/)
    .filter(line => line.startsWith('|'))
    .filter(line => !/^\|\s*-/.test(line))
    .slice(1)
    .map(parseMarkdownTableLine);
}

export function parseRequiredEvidenceRows(markdown: string): RequiredEvidenceRow[] {
  return parseTableBetween(markdown, '## Required Evidence', '## Trust Assumptions').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Required Evidence row: ${row.join(' | ')}`);
    return {
      evidenceClass: row[0],
      status: row[1],
      linkOrArtifact: row[2],
      publicationEffect: row[3],
    };
  });
}

export function validateReleaseNotes(markdown: string): ReleaseNotesValidation {
  const evidence = parseRowsSafely(() => parseRequiredEvidenceRows(markdown));
  const assumptions = parseRowsSafely(() => parseTrustAssumptionRows(markdown));
  const blockers = parseRowsSafely(() => parsePublicationBlockerRows(markdown));
  const claims = parseRowsSafely(() => parseAllowedClaimRows(markdown));
  const operators = parseRowsSafely(() => parseOperatorImpactRows(markdown));
  const signoffs = parseRowsSafely(() => parseSignoffRows(markdown));
  const evidenceRows = evidence.rows;
  const assumptionRows = assumptions.rows;
  const blockerRows = blockers.rows.filter(row => !isBlankPlaceholder(Object.values(row)));
  const claimRows = claims.rows.filter(row => !isBlankPlaceholder(Object.values(row)));
  const operatorRows = operators.rows;
  const signoffRows = signoffs.rows;
  const classificationFields = parseClassification(markdown);
  const classification = releaseNotesClassificationFromFields(classificationFields);
  const errors = [
    ...validateEvidenceHygiene(markdown, 'Release Notes'),
    ...validateRequiredSections(markdown),
    ...validateRequiredTableHeaders(markdown),
    ...validateClassificationFields(markdown),
    ...validateClassification(classificationFields),
    ...validateScopeStatement(markdown, classificationFields),
    ...evidence.errors,
    ...assumptions.errors,
    ...blockers.errors,
    ...claims.errors,
    ...operators.errors,
    ...signoffs.errors,
    ...validateEvidenceRows(evidenceRows, blockerRows, classificationFields),
    ...validateAssumptionRows(assumptionRows, classificationFields, evidenceRows, blockerRows),
    ...validateBlockerRows(blockerRows, evidenceRows, classificationFields),
    ...validateControlledTestnetProductionSurfaces(markdown, classificationFields, evidenceRows, blockerRows),
    ...validateClaimRows(claimRows, evidenceRows, blockerRows, classificationFields),
    ...validateDisallowedClaims(markdown),
    ...validateOperatorRows(operatorRows, classificationFields, evidenceRows, blockerRows),
    ...validateSignoffRows(signoffRows, classificationFields, evidenceRows, blockerRows),
  ];

  if (errors.length > 0) {
    return {
      status: 'BLOCKED',
      classification,
      evidenceRows,
      assumptionRows,
      blockerRows,
      claimRows,
      operatorRows,
      signoffRows,
      errors,
      message: `Release notes BLOCKED: ${errors.length} structural issue(s).`,
    };
  }

  return {
    status: 'PASS',
    classification,
    evidenceRows,
    assumptionRows,
    blockerRows,
    claimRows,
    operatorRows,
    signoffRows,
    errors: [],
    message: `Release notes PASS: ${evidenceRows.length} evidence rows are structured.`,
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

function parseClassification(markdown: string): Map<string, string> {
  return parseTwoColumnTable(sectionBetween(markdown, '## Release Classification', '## Scope Statement'));
}

function releaseNotesClassificationFromFields(fields: Map<string, string>): ReleaseNotesClassification {
  return {
    releaseName: fields.get('Release name') ?? '',
    gitCommit: fields.get('Git commit') ?? '',
    releaseLevel: fields.get('Release level') ?? '',
    decision: fields.get('Decision') ?? '',
    decisionOwner: fields.get('Decision owner') ?? '',
    decisionDate: fields.get('Decision date') ?? '',
  };
}

function parseTrustAssumptionRows(markdown: string): TrustAssumptionRow[] {
  return parseTableBetween(markdown, '## Trust Assumptions', '## Publication Blockers').map(row => {
    if (row.length !== 4) throw new Error(`Malformed Trust Assumptions row: ${row.join(' | ')}`);
    return {
      assumption: row[0],
      currentStatus: row[1],
      evidence: row[2],
      releaseImpact: row[3],
    };
  });
}

function parsePublicationBlockerRows(markdown: string): PublicationBlockerRow[] {
  return parseTableBetween(markdown, '## Publication Blockers', '## Allowed Claims').map(row => {
    if (row.length !== 5) throw new Error(`Malformed Publication Blockers row: ${row.join(' | ')}`);
    return {
      gate: row[0],
      blocker: row[1],
      status: row[2],
      requiredResolution: row[3],
      scopedOut: row[4],
    };
  });
}

function parseAllowedClaimRows(markdown: string): AllowedClaimRow[] {
  return parseTableBetween(markdown, '## Allowed Claims', '## Disallowed Claims Check').map(row => {
    if (row.length !== 3) throw new Error(`Malformed Allowed Claims row: ${row.join(' | ')}`);
    return {
      claim: row[0],
      evidenceLink: row[1],
      allowedWording: row[2],
    };
  });
}

function parseOperatorImpactRows(markdown: string): OperatorImpactRow[] {
  return parseTableBetween(markdown, '## Operator Impact', '## Sign-Off').map(row => {
    if (row.length !== 3) throw new Error(`Malformed Operator Impact row: ${row.join(' | ')}`);
    return {
      area: row[0],
      requiredOperatorAction: row[1],
      stopCondition: row[2],
    };
  });
}

function parseSignoffRows(markdown: string): ReleaseSignoffRow[] {
  return parseTableBetween(markdown, '## Sign-Off').map(row => {
    if (row.length !== 5) throw new Error(`Malformed Sign-Off row: ${row.join(' | ')}`);
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

function validateRequiredTableHeaders(markdown: string): string[] {
  const errors: string[] = [];

  for (const expected of REQUIRED_TABLE_HEADERS) {
    const section = sectionBetween(markdown, expected.startHeading, expected.endHeading);
    const headerLine = section
      .split(/\r?\n/)
      .find(line => line.trim().startsWith('|'));

    if (!headerLine) {
      errors.push(`${expected.section}: table not found`);
      continue;
    }

    const actual = parseMarkdownTableLine(headerLine);
    if (
      actual.length !== expected.header.length ||
      actual.some((cell, index) => cell !== expected.header[index])
    ) {
      errors.push(`${expected.section}: table header must be ${expected.header.join(' | ')}`);
    }
  }

  return errors;
}

function validateClassification(fields: Map<string, string>): string[] {
  const errors: string[] = [];
  const releaseName = fields.get('Release name') ?? '';
  const releaseLevel = fields.get('Release level') ?? '';

  for (const field of REQUIRED_CLASSIFICATION_FIELDS) {
    if (isBlank(fields.get(field) ?? '')) errors.push(`Release Classification: ${field} is required`);
  }

  validateAllowedField(errors, fields, 'Release Classification', 'Release level', ALLOWED_RELEASE_LEVELS);
  validateAllowedField(errors, fields, 'Release Classification', 'Decision', ALLOWED_DECISIONS);
  validateGitCommitField(errors, fields, 'Release Classification', 'Git commit');
  validateIsoDateField(errors, fields, 'Release Classification', 'Decision date');

  if (hasAbsoluteSecurityClaim(releaseName)) {
    errors.push('Release Classification: Release name: absolute security wording is not allowed in release notes');
  }
  if (hasMainnetProductionClaim(releaseName)) {
    errors.push(`Release Classification: Release name: ${MAINNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (hasProductionReadyClaim(releaseName)) {
    errors.push(`Release Classification: Release name: ${CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (
    releaseLevel === 'production deployment candidate' &&
    hasProductionClaim(releaseName) &&
    !hasControlledTestnetProductionClaim(releaseName)
  ) {
    errors.push(`Release Classification: Release name: ${CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (
    releaseLevel === 'production deployment candidate' &&
    hasControlledTestnetProductionClaim(releaseName) &&
    !hasCanonicalControlledTestnetProductionClaim(releaseName)
  ) {
    errors.push(`Release Classification: Release name: ${CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (releaseLevel !== 'production deployment candidate' && hasControlledTestnetProductionClaim(releaseName)) {
    errors.push(`Release Classification: Release name: ${PRODUCTION_CLAIM_EVIDENCE_ERROR}`);
  }
  if (releaseLevel !== 'production deployment candidate' && hasProductionClaim(releaseName)) {
    errors.push(`Release Classification: Release name: ${PRODUCTION_CLAIM_EVIDENCE_ERROR}`);
  }

  return errors;
}

function validateClassificationFields(markdown: string): string[] {
  return validateDuplicateRequiredFields(
    'Release Classification',
    parseTwoColumnFieldNames(sectionBetween(markdown, '## Release Classification', '## Scope Statement')),
    REQUIRED_CLASSIFICATION_FIELDS,
  );
}

function validateScopeStatement(markdown: string, classification: Map<string, string>): string[] {
  const errors: string[] = [];
  const releaseLevel = classification.get('Release level') ?? '';
  const scope = sectionBetween(markdown, '## Scope Statement', '## Required Evidence');
  const scopeWithoutRequiredNonProductionWording = scope.replace(
    'This release is not a production-ready bridge claim.',
    '',
  );
  const scopeForProductionClaimChecks = scopeWithoutRequiredNonProductionWording;

  if (hasAbsoluteSecurityClaim(scope)) {
    errors.push('Scope Statement: absolute security wording is not allowed in release notes');
  }

  if (hasMainnetProductionClaim(scopeForProductionClaimChecks)) {
    errors.push(`Scope Statement: ${MAINNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (hasProductionReadyClaim(scopeForProductionClaimChecks)) {
    errors.push(`Scope Statement: ${CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (
    releaseLevel === 'production deployment candidate' &&
    hasProductionClaim(scopeForProductionClaimChecks) &&
    !hasControlledTestnetProductionClaim(scopeForProductionClaimChecks)
  ) {
    errors.push(`Scope Statement: ${CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (
    releaseLevel === 'production deployment candidate' &&
    hasControlledTestnetProductionClaim(scopeForProductionClaimChecks) &&
    !hasCanonicalControlledTestnetProductionClaim(scopeForProductionClaimChecks)
  ) {
    errors.push(`Scope Statement: ${CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR}`);
  }

  if (releaseLevel === 'production deployment candidate' || isBlank(releaseLevel)) return errors;

  if (hasProductionClaim(scopeWithoutRequiredNonProductionWording)) {
    errors.push(`Scope Statement: ${PRODUCTION_CLAIM_EVIDENCE_ERROR}`);
  }

  if (!scope.includes('This release is not a production-ready bridge claim.')) {
    errors.push('Scope Statement: non-production release notes must include the required non-production wording');
  }
  return errors;
}

function validateControlledTestnetProductionSurfaces(
  markdown: string,
  classification: Map<string, string>,
  evidenceRows: RequiredEvidenceRow[],
  blockerRows: PublicationBlockerRow[],
): string[] {
  const releaseLevel = classification.get('Release level') ?? '';
  if (releaseLevel !== 'production deployment candidate') return [];

  const errors: string[] = [];
  const releaseName = classification.get('Release name') ?? '';
  const scope = sectionBetween(markdown, '## Scope Statement', '## Required Evidence').replace(
    'This release is not a production-ready bridge claim.',
    '',
  );

  if (hasControlledTestnetProductionClaim(releaseName)) {
    errors.push(...controlledTestnetProductionPrerequisiteErrors(
      'Release Classification: Release name',
      evidenceRows,
      blockerRows,
    ));
  }
  if (hasControlledTestnetProductionClaim(scope)) {
    errors.push(...controlledTestnetProductionPrerequisiteErrors(
      'Scope Statement',
      evidenceRows,
      blockerRows,
    ));
  }

  return errors;
}

function validateEvidenceRows(
  rows: RequiredEvidenceRow[],
  blockerRows: PublicationBlockerRow[],
  classification: Map<string, string>,
): string[] {
  const errors = validateRequiredNames('Required Evidence', rows.map(row => row.evidenceClass), REQUIRED_EVIDENCE_CLASSES);
  const releaseLevel = classification.get('Release level') ?? '';

  for (const row of rows) {
    if (!REQUIRED_EVIDENCE_CLASSES.includes(row.evidenceClass)) {
      errors.push(`Required Evidence: ${row.evidenceClass}: unexpected evidence class`);
    }
    if (!ALLOWED_EVIDENCE_STATUSES.has(row.status as ReleaseEvidenceStatus)) {
      errors.push(`Required Evidence: ${row.evidenceClass}: status must be pending, linked, or blocker`);
      continue;
    }
    if (row.status === 'linked' && !hasEvidenceMarker(row.linkOrArtifact)) {
      errors.push(`Required Evidence: ${row.evidenceClass}: linked status requires a link, command, or artifact marker`);
    }
    if (row.status === 'linked' && !hasCompletedReleaseNotesRowEvidenceMarker(row.linkOrArtifact)) {
      errors.push(
        `Required Evidence: ${row.evidenceClass}: linked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence`,
      );
    }
    if (!isBlank(row.linkOrArtifact) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.linkOrArtifact)) {
      errors.push(`Required Evidence: ${row.evidenceClass}: evidence must not include contradictory release-note failure markers`);
    }
    if (!isBlank(row.publicationEffect) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.publicationEffect)) {
      errors.push(`Required Evidence: ${row.evidenceClass}: publication effect must not include contradictory release-note failure markers`);
    }
    if (!isBlank(row.linkOrArtifact) && hasContradictoryReleaseNotesDecisionBinding(row.linkOrArtifact)) {
      errors.push(`Required Evidence: ${row.evidenceClass}: evidence must not include contradictory release-note decision bindings`);
    }
    if (!isBlank(row.publicationEffect) && hasContradictoryReleaseNotesDecisionBinding(row.publicationEffect)) {
      errors.push(`Required Evidence: ${row.evidenceClass}: publication effect must not include contradictory release-note decision bindings`);
    }
    if (!isBlank(row.linkOrArtifact)) {
      const evidenceFocus = REQUIRED_RELEASE_EVIDENCE_FOCUS[row.evidenceClass];
      if (evidenceFocus && !evidenceFocus.pattern.test(row.linkOrArtifact)) {
        errors.push(`Required Evidence: ${row.evidenceClass}: ${evidenceFocus.message}`);
      }
    }
    const requiredEvidenceClaimText = `${row.linkOrArtifact} ${row.publicationEffect}`;
    errors.push(...validateReleaseNoteProductionClaimBoundary(
      `Required Evidence: ${row.evidenceClass}`,
      requiredEvidenceClaimText,
      releaseLevel,
      rows,
      blockerRows,
    ));
    if (
      row.evidenceClass === 'Clean checkout CI' &&
      row.status === 'linked' &&
      !hasCleanCheckoutCiValidationOutputEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Clean checkout CI: linked evidence must mention ci:validate command output with exit code 0',
      );
    }
    if (
      row.evidenceClass === 'Clean checkout CI' &&
      row.status === 'linked' &&
      releaseLevel === 'production deployment candidate' &&
      !hasCleanCheckoutCiProductionCandidateDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Clean checkout CI: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, and Release gate structural issues = 0',
      );
    }
    if (
      row.evidenceClass === 'SQLite/AVL backup-restore evidence' &&
      row.status === 'linked' &&
      !hasBackupRestoreValidationOutputEvidence(row)
    ) {
      errors.push(
        'Required Evidence: SQLite/AVL backup-restore evidence: linked evidence must mention backup:validate command output with exit code 0',
      );
    }
    if (
      row.evidenceClass === 'SQLite/AVL backup-restore evidence' &&
      row.status === 'linked' &&
      releaseLevel === 'production deployment candidate' &&
      !hasBackupRestoreProductionCandidateDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: SQLite/AVL backup-restore evidence: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, and Testnet production-candidate claim allowed = yes',
      );
    }
    if (
      row.evidenceClass === 'ContextExtension signer resolution or guard' &&
      row.status === 'linked' &&
      !hasContextExtensionSignerBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: ContextExtension signer resolution or guard: linked evidence must mention fail-closed ContextExtension signer guard or upstream signer resolution boundary',
      );
    }
    if (
      row.evidenceClass === 'ContextExtension signer resolution or guard' &&
      row.status === 'linked' &&
      releaseLevel === 'production deployment candidate' &&
      !hasContextExtensionSignerProductionCandidateDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: ContextExtension signer resolution or guard: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, and ContextExtension signer guard or upstream signer resolution boundary',
      );
    }
    if (
      row.evidenceClass === 'Signer dependency conformance or fail-closed release decision evidence' &&
      row.status === 'linked' &&
      !hasSignerDependencyBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Signer dependency conformance or fail-closed release decision evidence: linked evidence must mention upstream signer conformance evidence or fail-closed signer release decision boundary',
      );
    }
    if (
      row.evidenceClass === 'Signer dependency conformance or fail-closed release decision evidence' &&
      row.status === 'linked' &&
      releaseLevel === 'production deployment candidate' &&
      !hasSignerDependencyProductionCandidateDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Signer dependency conformance or fail-closed release decision evidence: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, and upstream signer conformance evidence',
      );
    }
    if (
      row.evidenceClass === 'Broadcast gate evidence' &&
      row.status === 'linked' &&
      !hasBroadcastGateReadinessOutputEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Broadcast gate evidence: linked evidence must mention demo:readiness broadcast policy command output with exit code 0',
      );
    }
    if (
      row.evidenceClass === 'Broadcast gate evidence' &&
      row.status === 'linked' &&
      releaseLevel === 'production deployment candidate' &&
      !hasBroadcastGateProductionCandidateDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Broadcast gate evidence: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, and Broadcast remains opt-in = yes',
      );
    }
    if (
      row.evidenceClass === 'Operator readiness evidence' &&
      row.status === 'linked' &&
      !hasGate6OperatorCommandOutputEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Operator readiness evidence: linked evidence must mention command-specific operator command output with exit code 0',
      );
    }
    if (
      row.evidenceClass === 'Operator readiness evidence' &&
      row.status === 'linked' &&
      !hasGate6OperatorDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Operator readiness evidence: linked evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, Operator-ready claim allowed = yes, and Critical incidents open = 0',
      );
    }
    if (
      row.evidenceClass === 'Technical addendum architecture manual' &&
      row.status === 'linked' &&
      !hasGate2TechnicalAddendumValidationOutputEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Technical addendum architecture manual: linked evidence must mention addendum:validate command output with exit code 0',
      );
    }
    if (
      row.evidenceClass === 'Technical addendum architecture manual' &&
      row.status === 'linked' &&
      !hasGate2TechnicalAddendumClaimBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Technical addendum architecture manual: linked evidence must mention Release gate status = pass, release:gate PASS output with Structural issues = 0, Production-ready claim allowed = no, Mainnet deployment claim allowed = no, and Testnet production-candidate claim allowed = yes-after-release-gate-pass',
      );
    }
    if (
      row.evidenceClass === 'Technical addendum architecture manual' &&
      row.status === 'linked' &&
      releaseLevel === 'production deployment candidate' &&
      !hasGate2TechnicalAddendumProductionCandidateDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Technical addendum architecture manual: linked production-candidate evidence must mention Release supported = production deployment candidate, Release gate status = pass, release:gate PASS output with Structural issues = 0, Production-ready claim allowed = no, Mainnet deployment claim allowed = no, and Testnet production-candidate claim allowed = yes-after-release-gate-pass',
      );
    }
    if (
      row.evidenceClass === 'Committee governance and key-rotation evidence' &&
      row.status === 'linked' &&
      !hasGate6GovernanceCommandOutputEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Committee governance and key-rotation evidence: linked evidence must mention command-specific governance command output with exit code 0',
      );
    }
    if (
      row.evidenceClass === 'Committee governance and key-rotation evidence' &&
      row.status === 'linked' &&
      !hasGate6GovernanceDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Committee governance and key-rotation evidence: linked evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, Governance-ready claim allowed = yes, and Open governance blockers = 0',
      );
    }
    if (
      row.evidenceClass === 'Dependency risk review evidence' &&
      row.status === 'linked' &&
      !hasGate4DependencyRiskCommandOutputEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Dependency risk review evidence: linked evidence must mention dependency:validate command output with exit code 0',
      );
    }
    if (
      row.evidenceClass === 'Dependency risk review evidence' &&
      row.status === 'linked' &&
      !hasGate4DependencyRiskDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Dependency risk review evidence: linked evidence must mention Production-ready claim allowed = no and Critical/high vulnerabilities open = 0',
      );
    }
    if (
      row.evidenceClass === 'Dependency risk review evidence' &&
      row.status === 'linked' &&
      releaseLevel === 'production deployment candidate' &&
      !hasGate4DependencyRiskProductionCandidateDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Dependency risk review evidence: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, and Critical/high vulnerabilities open = 0',
      );
    }
    if (
      row.evidenceClass === 'Independent security review' &&
      row.status === 'linked' &&
      !hasGate4SecurityReviewCommandOutputEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Independent security review: linked evidence must mention security:validate command output with exit code 0',
      );
    }
    if (
      row.evidenceClass === 'Independent security review' &&
      row.status === 'linked' &&
      !hasGate4SecurityReviewDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Independent security review: linked evidence must mention Final decision = approve, Critical/high findings open = 0, Publication blockers = 0, and Production-ready claim allowed = no',
      );
    }
    if (
      row.evidenceClass === 'Independent security review' &&
      row.status === 'linked' &&
      releaseLevel === 'production deployment candidate' &&
      !hasGate4SecurityReviewProductionCandidateDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Independent security review: linked production-candidate evidence must mention Release supported = production deployment candidate, Final decision = approve, Critical/high findings open = 0, Publication blockers = 0, Production-ready claim allowed = no, and Testnet production-candidate claim allowed = yes',
      );
    }
    if (
      row.evidenceClass === 'Trustless burn verification evidence' &&
      row.status === 'linked' &&
      !hasGate5TrustlessBurnCommandOutputEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Trustless burn verification evidence: linked evidence must mention trustless:validate command output with exit code 0',
      );
    }
    if (
      row.evidenceClass === 'Trustless burn verification evidence' &&
      row.status === 'linked' &&
      !hasGate5TrustlessBurnDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Trustless burn verification evidence: linked evidence must mention Release supported = production deployment candidate, Trustless burn verification implemented = yes, Transitional trusted burn path disabled = yes, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, and Critical/high findings open = 0',
      );
    }
    if (
      row.evidenceClass === 'Single, batch, and sharded benchmark evidence' &&
      row.status === 'linked' &&
      !hasGate7BenchmarkCommandOutputEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Single, batch, and sharded benchmark evidence: linked evidence must mention command-specific benchmark command output with exit code 0',
      );
    }
    if (
      row.evidenceClass === 'Single, batch, and sharded benchmark evidence' &&
      row.status === 'linked' &&
      !hasGate7BenchmarkDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Single, batch, and sharded benchmark evidence: linked evidence must mention Release supported = production deployment candidate, Scaling claims allowed = yes, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, Production throughput claim allowed = no, Mainnet-grade evidence linked = no, and Open benchmark blockers = 0',
      );
    }
    if (
      row.evidenceClass === 'Threat model and evidence matrix' &&
      row.status === 'linked' &&
      !hasThreatModelValidationOutputEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Threat model and evidence matrix: linked evidence must mention threat-model:validate command output with exit code 0',
      );
    }
    if (
      releaseLevel === 'production deployment candidate' &&
      row.evidenceClass === 'Threat model and evidence matrix' &&
      row.status === 'linked' &&
      !hasThreatModelProductionCandidateDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Threat model and evidence matrix: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, and Testnet production-candidate claim allowed = yes',
      );
    }
    if (
      row.evidenceClass === 'External integration package review' &&
      row.status === 'linked' &&
      !hasGate8FreshReviewerAndPrivateContextEvidence(row)
    ) {
      errors.push(
        'Required Evidence: External integration package review: linked evidence must mention fresh reviewer and private maintainer context used = no',
      );
    }
    if (
      row.evidenceClass === 'External integration package review' &&
      row.status === 'linked' &&
      !hasGate8FreshCheckoutCommitEvidence(row, classification)
    ) {
      errors.push(
        `Required Evidence: External integration package review: linked evidence must mention fresh checkout commit identity matching Release Classification Git commit ${classification.get('Git commit') ?? ''}`,
      );
    }
    if (
      row.evidenceClass === 'External integration package review' &&
      row.status === 'linked' &&
      !hasGate8FreshCheckoutExitCodeEvidence(row)
    ) {
      errors.push(
        'Required Evidence: External integration package review: linked evidence must mention fresh-checkout command output with exit code 0',
      );
    }
    if (
      row.evidenceClass === 'External integration package review' &&
      row.status === 'linked' &&
      !hasGate8IntegrationValidationOutputEvidence(row)
    ) {
      errors.push(
        'Required Evidence: External integration package review: linked evidence must mention integration:validate command output with exit code 0',
      );
    }
    if (
      row.evidenceClass === 'External integration package review' &&
      row.status === 'linked' &&
      !hasGate8PublicationDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: External integration package review: linked evidence must mention Private maintainer context used = no, Public institutional-reference release allowed = yes, Production-ready claim allowed = no, and exact Testnet production-candidate claim allowed = yes or no',
      );
    }
    if (
      row.evidenceClass === 'External integration package review' &&
      row.status === 'linked' &&
      releaseLevel === 'production deployment candidate' &&
      !hasGate8ProductionCandidateDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: External integration package review: linked production-candidate evidence must mention Release supported = production deployment candidate, Private maintainer context used = no, Public institutional-reference release allowed = yes, Production-ready claim allowed = no, and Testnet production-candidate claim allowed = yes',
      );
    }
    if (
      row.evidenceClass === 'Testnet lifecycle rehearsal' &&
      row.status === 'linked' &&
      !hasErgoNodeNetworkTestnetEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Testnet lifecycle rehearsal: linked evidence must cite Ergo node network testnet',
      );
    }
    if (
      row.evidenceClass === 'Testnet lifecycle rehearsal' &&
      row.status === 'linked' &&
      !hasSidechainNetworkScopeEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Testnet lifecycle rehearsal: linked evidence must cite Sidechain network patched-devnet, testnet, or explicit non-mainnet sidechain network',
      );
    }
    if (
      row.evidenceClass === 'Testnet lifecycle rehearsal' &&
      row.status === 'linked' &&
      hasNegatedOrMixedTestnetNetworkEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Testnet lifecycle rehearsal: linked evidence must cite Ergo node network testnet without negated or mixed network wording',
      );
    }
    if (
      row.evidenceClass === 'Testnet lifecycle rehearsal' &&
      row.status === 'linked' &&
      hasPreBroadcastOnlyTestnetLifecycleEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Testnet lifecycle rehearsal: linked evidence must be completed live testnet lifecycle evidence, not prebroadcast-only evidence',
      );
    }
    if (
      releaseLevel === 'production deployment candidate' &&
      row.evidenceClass === 'Testnet lifecycle rehearsal' &&
      row.status === 'linked' &&
      !hasTestnetLifecycleProductionCandidateDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Testnet lifecycle rehearsal: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, Testnet production-candidate claim allowed = yes, Ergo node network testnet, and Sidechain network patched-devnet or another non-mainnet sidechain network',
      );
    }
    if (
      row.evidenceClass === 'Testnet lifecycle rehearsal' &&
      row.status === 'linked' &&
      !hasValidatedCompletedLiveRehearsalEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires completed live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
      );
    }
    if (
      row.evidenceClass === 'Testnet lifecycle rehearsal' &&
      row.status === 'linked' &&
      !hasValidatedLivePreflightEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires rehearsal:external-fee-live-preflight PASS output with structured JSON target binding, the same Expected transaction ID, and an activated external-fee settlement profile',
      );
    }
    if (
      row.evidenceClass === 'Testnet lifecycle rehearsal' &&
      row.status === 'linked' &&
      !hasValidatedAssemblyReportEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires rehearsal:assemble PASS output with structured assembly report JSON evidence',
      );
    }
    if (
      row.evidenceClass === 'Testnet lifecycle rehearsal' &&
      row.status === 'linked' &&
      !hasValidatedPostSubmitObserveEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires rehearsal:post-submit:observe PASS output with structured JSON output-shape binding',
      );
    }
    if (
      row.evidenceClass === 'Testnet lifecycle rehearsal' &&
      row.status === 'linked' &&
      !hasValidatedFreshCheckpointEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Testnet lifecycle rehearsal: linked evidence requires rehearsal:fresh-testnet-check PASS output with structured fresh checkpoint JSON provenance',
      );
    }
    if (
      row.evidenceClass === 'Failed broadcast phantom AVL recovery drill evidence' &&
      row.status === 'linked' &&
      !hasValidatedRecoveryObserveEvidence(row, 'failed-broadcast-phantom-avl')
    ) {
      errors.push(
        'Required Evidence: Failed broadcast phantom AVL recovery drill evidence: linked evidence requires recovery-observe JSON validation PASS output with failed-broadcast-phantom-avl observation JSON',
      );
    }
    if (
      releaseLevel === 'production deployment candidate' &&
      row.evidenceClass === 'Failed broadcast phantom AVL recovery drill evidence' &&
      row.status === 'linked' &&
      !hasRecoveryProductionCandidateDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Failed broadcast phantom AVL recovery drill evidence: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, and Testnet production-candidate claim allowed = yes',
      );
    }
    if (
      row.evidenceClass === 'Reorged burn and stale singleton recovery drill evidence' &&
      row.status === 'linked' &&
      !hasValidatedRecoveryObserveEvidence(row, 'reorged-burn-stale-singleton')
    ) {
      errors.push(
        'Required Evidence: Reorged burn and stale singleton recovery drill evidence: linked evidence requires recovery-observe JSON validation PASS output with reorged-burn-stale-singleton observation JSON',
      );
    }
    if (
      releaseLevel === 'production deployment candidate' &&
      row.evidenceClass === 'Reorged burn and stale singleton recovery drill evidence' &&
      row.status === 'linked' &&
      !hasRecoveryProductionCandidateDecisionBoundaryEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Reorged burn and stale singleton recovery drill evidence: linked production-candidate evidence must mention Release supported = production deployment candidate, Production-ready claim allowed = no, and Testnet production-candidate claim allowed = yes',
      );
    }
    if (
      releaseLevel === 'production deployment candidate' &&
      row.evidenceClass === 'Testnet lifecycle rehearsal' &&
      row.status === 'linked' &&
      !hasValidatedCompletedLiveRehearsalEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Testnet lifecycle rehearsal: production deployment candidate requires completed live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
      );
    }
    if (
      releaseLevel === 'production deployment candidate' &&
      row.evidenceClass === 'Testnet lifecycle rehearsal' &&
      row.status === 'linked' &&
      !hasValidatedLivePreflightEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Testnet lifecycle rehearsal: production deployment candidate requires rehearsal:external-fee-live-preflight PASS output with structured JSON target binding, the same Expected transaction ID, and an activated external-fee settlement profile',
      );
    }
    if (
      releaseLevel === 'production deployment candidate' &&
      row.evidenceClass === 'Testnet lifecycle rehearsal' &&
      row.status === 'linked' &&
      !hasValidatedAssemblyReportEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Testnet lifecycle rehearsal: production deployment candidate requires rehearsal:assemble PASS output with structured assembly report JSON evidence',
      );
    }
    if (
      releaseLevel === 'production deployment candidate' &&
      row.evidenceClass === 'Testnet lifecycle rehearsal' &&
      row.status === 'linked' &&
      !hasValidatedPostSubmitObserveEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Testnet lifecycle rehearsal: production deployment candidate requires rehearsal:post-submit:observe PASS output with structured JSON output-shape binding',
      );
    }
    if (
      releaseLevel === 'production deployment candidate' &&
      row.evidenceClass === 'Testnet lifecycle rehearsal' &&
      row.status === 'linked' &&
      !hasValidatedFreshCheckpointEvidence(row)
    ) {
      errors.push(
        'Required Evidence: Testnet lifecycle rehearsal: production deployment candidate requires rehearsal:fresh-testnet-check PASS output with structured fresh checkpoint JSON provenance',
      );
    }
    if (row.status !== 'linked' && isBlank(row.publicationEffect)) {
      errors.push(`Required Evidence: ${row.evidenceClass}: unresolved evidence requires publication effect`);
    }
    if (hasAbsoluteSecurityClaim(row.publicationEffect)) {
      errors.push(`Required Evidence: ${row.evidenceClass}: absolute security wording is not allowed in release notes`);
    }
    if (releaseLevel === 'production deployment candidate' && row.status !== 'linked') {
      errors.push(`Required Evidence: ${row.evidenceClass}: production deployment candidate requires linked evidence`);
    }
  }

  return errors;
}

function hasErgoNodeNetworkTestnetEvidence(row: RequiredEvidenceRow): boolean {
  return /\bErgo node network\b[^\n|]{0,80}\btest[- ]?net\b/i.test(row.publicationEffect);
}

function hasSidechainNetworkScopeEvidence(row: RequiredEvidenceRow): boolean {
  return /\bSidechain network\b[^\n|]{0,120}\b(?:patched[- ]?devnet|test[- ]?net|nonmainnet)\b/i.test(
    normalizedNetworkPublicationEffect(row),
  );
}

function hasNegatedOrMixedTestnetNetworkEvidence(row: RequiredEvidenceRow): boolean {
  return /\b(non[- ]?test[- ]?net|no\s+(?:(?:a|the)\s+)?test[- ]?net|without\s+(?:(?:a|the)\s+)?test[- ]?net|not[- ]test[- ]?net|not\s+(?:(?:a|the)\s+)?test[- ]?net|not\s+on\s+(?:the\s+)?test[- ]?net|not\s+using\s+test[- ]?net|not\s+connected\s+to\s+test[- ]?net|main[- ]?net|main\s+network|main[- ]chain|mainchain)\b/i.test(
    normalizedNetworkEvidenceText(row),
  );
}

function hasTestnetLifecycleProductionCandidateDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    hasExactProductionCandidateReleaseSupportedBinding(text) &&
    /\bproduction[- ]ready[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\btestnet[- ]production[- ]candidate[- ]claim[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    hasErgoNodeNetworkTestnetEvidence(row) &&
    hasSidechainNetworkScopeEvidence(row)
  );
}

function normalizedNetworkEvidenceText(row: RequiredEvidenceRow): string {
  return normalizeEvidenceMarkerText(`${row.linkOrArtifact} ${row.publicationEffect}`)
    .replace(/\bnon[- ]?main[- ]?net\b/gi, 'nonmainnet');
}

function normalizedNetworkPublicationEffect(row: RequiredEvidenceRow): string {
  return row.publicationEffect.replace(/\bnon[- ]?main[- ]?net\b/gi, 'nonmainnet');
}

function hasPreBroadcastOnlyTestnetLifecycleEvidence(row: RequiredEvidenceRow): boolean {
  const link = row.linkOrArtifact;
  const effect = row.publicationEffect;
  const text = `${link} ${effect}`;
  const lifecycleTextWithoutPreflight = text
    .split(/[;\n]+/)
    .map(segment => segment.trim())
    .filter(segment => !isRehearsalPreflightEvidenceSegment(segment))
    .join(' ');
  const linkWithoutPreflight = link
    .split(/[;\n]+/)
    .map(segment => segment.trim())
    .filter(segment => !isRehearsalPreflightEvidenceSegment(segment))
    .join(' ');
  return (
    extractCompletedEvidenceTargets(lifecycleTextWithoutPreflight)
      .map(normalizeCompletedEvidenceTarget)
      .some(target => /pre[-_\s]?broadcast/i.test(target)) ||
    /pre[-_\s]?broadcast/i.test(linkWithoutPreflight) ||
    /\bpre[-_\s]?broadcast\b(?:[-_\s]?only|\s+(?:dry[-_\s]?run|evidence|package))\b/i.test(effect) ||
    /\b(?:dry[-_\s]?run|evidence|package)\b.{0,80}\bpre[-_\s]?broadcast\b/i.test(effect)
  );
}

function hasValidatedCompletedLiveRehearsalEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  const completedLiveRehearsalTargets = extractCompletedLiveRehearsalTargets(text);
  if (completedLiveRehearsalTargets.length === 0) return false;

  const validationSegments = text
    .split(/[;\n]+/)
    .map(segment => segment.trim())
    .filter(isRehearsalValidationEvidenceSegment);
  if (validationSegments.length === 0) return false;

  const hasPositiveValidation = validationSegments.some(hasPositiveEvidenceSegment);
  if (!hasPositiveValidation) return false;
  if (!hasDistinctQualifiedRehearsalValidationOutputTarget(
    validationSegments,
    completedLiveRehearsalTargets,
  )) {
    return false;
  }
  if (!hasRequiredLiveRehearsalValidationFacts(validationSegments)) return false;

  return completedLiveRehearsalTargets.some(target => {
    const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const targetBinding = new RegExp(
      `\\b(?:validated target|validated input|rehearsal validate target|rehearsal validation target)\\b[^\\n.;|]*${escapedTarget}`,
      'i',
    );
    return validationSegments.some(segment => targetBinding.test(normalizeCompletedEvidenceTarget(segment)));
  });
}

function hasValidatedLivePreflightEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  const completedLiveRehearsalTargets = extractCompletedLiveRehearsalTargets(text);
  if (completedLiveRehearsalTargets.length === 0) return false;

  const livePreflightSegments = text
    .split(/[;\n]+/)
    .map(segment => segment.trim())
    .filter(isRehearsalLivePreflightEvidenceSegment);
  if (livePreflightSegments.length === 0) return false;

  const hasPositiveValidation = livePreflightSegments.some(hasPositiveEvidenceSegment);
  if (!hasPositiveValidation) return false;
  if (!hasDistinctQualifiedLivePreflightOutputTarget(livePreflightSegments)) return false;
  if (!hasRequiredLivePreflightFacts(livePreflightSegments)) return false;
  if (!hasLivePreflightExpectedTxBoundToValidation(text, livePreflightSegments)) return false;
  if (!hasLivePreflightTargetBoundToCompletedRehearsal(
    livePreflightSegments,
    completedLiveRehearsalTargets,
  )) {
    return false;
  }

  return true;
}

function hasValidatedAssemblyReportEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  const assemblySegments = text
    .split(/[;\n]+/)
    .map(segment => segment.trim())
    .filter(isRehearsalAssemblyEvidenceSegment);
  if (assemblySegments.length === 0) return false;

  const hasPositiveValidation = assemblySegments.some(hasPositiveEvidenceSegment);
  if (!hasPositiveValidation) return false;
  if (!hasDistinctQualifiedAssemblyReportOutputTarget(assemblySegments)) return false;
  if (!hasRequiredAssemblyReportFacts(assemblySegments)) return false;

  return true;
}

function hasValidatedPostSubmitObserveEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  const observeSegments = text
    .split(/[;\n]+/)
    .map(segment => segment.trim())
    .filter(isRehearsalPostSubmitObserveEvidenceSegment);
  if (observeSegments.length === 0) return false;

  const hasPositiveValidation = observeSegments.some(hasPositiveEvidenceSegment);
  if (!hasPositiveValidation) return false;
  if (!hasDistinctQualifiedPostSubmitObserveOutputTarget(observeSegments)) return false;
  if (!hasRequiredPostSubmitObserveFacts(observeSegments)) return false;

  const expectedTxIds = new Set(
    text
      .split(/[;\n]+/)
      .map(segment => segment.trim())
      .filter(segment =>
        isRehearsalValidationEvidenceSegment(segment) ||
        isRehearsalLivePreflightEvidenceSegment(segment)
      )
      .flatMap(extractExpectedTransactionIds),
  );
  const submittedTxIds = new Set(
    text
      .split(/[;\n]+/)
      .map(segment => segment.trim())
      .flatMap(extractSubmittedTransactionIds),
  );
  const observeTxIds = new Set([
    ...observeSegments.flatMap(extractExpectedTransactionIds),
    ...observeSegments.flatMap(extractSubmittedTransactionIds),
  ]);

  return [...observeTxIds].some(txId => expectedTxIds.has(txId) || submittedTxIds.has(txId));
}

function hasValidatedFreshCheckpointEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  const checkpointSegments = text
    .split(/[;\n]+/)
    .map(segment => segment.trim())
    .filter(isRehearsalFreshCheckpointEvidenceSegment);
  if (checkpointSegments.length === 0) return false;

  const hasPositiveValidation = checkpointSegments.some(hasPositiveEvidenceSegment);
  if (!hasPositiveValidation) return false;
  if (!hasDistinctQualifiedFreshCheckpointOutputTarget(checkpointSegments)) return false;
  if (!hasRequiredFreshCheckpointFacts(checkpointSegments)) return false;

  return true;
}

function hasValidatedRecoveryObserveEvidence(
  row: RequiredEvidenceRow,
  expectedKind: ReleaseNotesRecoveryObserveKind,
): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  const recoverySegments = releaseEvidenceSegments(text)
    .filter(segment => isRecoveryObserveEvidenceSegment(segment, expectedKind));
  if (recoverySegments.length === 0) return false;

  const observationSegments = recoverySegments
    .filter(segment => /\bnpm run rehearsal:recovery-observe(?:\s|$)/i.test(segment));
  const validationSegments = recoverySegments
    .filter(isRecoveryObserveValidationEvidenceSegment);
  if (observationSegments.length === 0 || validationSegments.length === 0) return false;

  const observationTargets = observationSegments
    .flatMap(segment => extractRecoveryObserveJsonTargets(recoveryObserveOutputEvidenceText(segment)))
    .map(normalizeCompletedEvidenceTarget);
  if (observationTargets.length === 0) return false;

  const validationTargets = validationSegments
    .flatMap(extractRecoveryObserveJsonTargets)
    .map(normalizeCompletedEvidenceTarget);
  if (!observationTargets.some(target => validationTargets.includes(target))) return false;

  return observationSegments.some(segment =>
    hasPositiveEvidenceSegment(segment) &&
    hasRecoveryObserveJsonReportEvidence(segment, expectedKind) &&
    hasRecoveryObserveSourceBindingEvidence(segment) &&
    hasRecoveryObserveBoundaryEvidence(segment) &&
    hasRequiredRecoveryObserveFacts(segment, expectedKind)
  );
}

function hasRecoveryProductionCandidateDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    hasExactProductionCandidateReleaseSupportedBinding(text) &&
    /\bproduction[- ]ready[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\btestnet[- ]production[- ]candidate[- ]claim[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(text)
  );
}

function extractCompletedLiveRehearsalTargets(text: string): string[] {
  return text
    .split(/[;\n]+/)
    .map(segment => segment.trim())
    .filter(segment =>
      !isRehearsalValidationEvidenceSegment(segment) &&
      !isRehearsalAssemblyEvidenceSegment(segment) &&
      !isRehearsalPreflightEvidenceSegment(segment) &&
      !isRehearsalPrepBundleEvidenceSegment(segment) &&
      !isRehearsalLivePreflightEvidenceSegment(segment) &&
      !isRehearsalFreshCheckpointEvidenceSegment(segment) &&
      !isRehearsalPostSubmitObserveEvidenceSegment(segment)
    )
    .flatMap(extractCompletedEvidenceTargets)
    .map(normalizeCompletedEvidenceTarget)
    .filter(target =>
      /\blive[- ]?rehearsals?\b/i.test(target) &&
      /\bcompleted\b/i.test(target) &&
      /\.md$/i.test(target) &&
      !/(template|validation|validate|log|transcript)/i.test(target)
    );
}

function hasDistinctQualifiedLivePreflightOutputTarget(livePreflightSegments: string[]): boolean {
  return livePreflightSegments
    .flatMap(segment => extractCompletedEvidenceTargets(livePreflightOutputEvidenceText(segment)))
    .map(normalizeCompletedEvidenceTarget)
    .some(target => /\b(?:live[-_ ]?preflight|preflight|validation|validate|log|transcript|ci|workflow)\b/i.test(target));
}

function hasRequiredLivePreflightFacts(livePreflightSegments: string[]): boolean {
  return livePreflightSegments.some(segment =>
    /\bExpected transaction ID\b.{0,120}(?:0x)?[0-9a-fA-F]{64}\b/i.test(segment) &&
    hasLivePreflightJsonReportEvidence(segment) &&
    /\bSettlement profile ID\s*=\s*authenticated-external-fee-v1\b/i.test(segment) &&
    /\bProfile activation status\s*=\s*ACTIVATED\b/i.test(segment) &&
    /\bEvidence purpose\s*=\s*gate3-lifecycle-closure\b/i.test(segment) &&
    /\bLegacy V1 transport\s*=\s*quarantined\b/i.test(segment) &&
    hasConcreteLivePreflightActivationEvidenceTarget(segment) &&
    /\bapprovals file\b/i.test(segment) &&
    /\breviewer approval evidence\b/i.test(segment) &&
    /\buser explicit live broadcast approval evidence\b/i.test(segment) &&
    /\bBRIDGE_BROADCAST_ENABLED\s*=\s*true\b/i.test(segment) &&
    /\bscoped\b.{0,80}\b(?:shell|scope)\b|\b(?:shell|scope)\b.{0,80}\bscoped\b/i.test(segment) &&
    /\bnpm run demo:readiness\b/i.test(segment) &&
    hasPositiveLabeledPassEvidence(segment, /\bBroadcast policy\b/i, 80) &&
    hasPositiveLabeledPassEvidence(segment, /\bLive settlement signing\b/i, 80) &&
    /\bNode URL\b.{0,80}\bhttps?:\/\/[^\s;)]+/i.test(segment) &&
    /\bErgo node network\b.{0,80}\btest[- ]?net\b/i.test(segment) &&
    /\bSidechain network\b.{0,120}\b(?:patched[- ]?devnet|test[- ]?net|non[- ]?main[- ]?net)\b/i.test(segment) &&
    !hasForbiddenLivePreflightNetworkFacts(segment)
  );
}

function hasLivePreflightJsonReportEvidence(segment: string): boolean {
  return (
    /(?:^|[\s;])--json-out\b.{0,180}(?:artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+|[^\s),;|]*external[-_ ]?fee[-_ ]?live[-_ ]?preflight\.json)\b/i.test(segment) &&
    /\bexternal[- ]fee live[- ]preflight JSON report\b.{0,120}\bcompleted structured evidence\b/i.test(segment)
  );
}

function hasForbiddenLivePreflightNetworkFacts(segment: string): boolean {
  const withoutNonMainnet = segment.replace(/\bnon[- ]?main[- ]?net\b/gi, '');
  return (
    /\b(?:Ergo node network|Sidechain network|network|environment)\b.{0,80}\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/i.test(withoutNonMainnet) ||
    /\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b.{0,80}\b(?:Ergo node network|Sidechain network|network|environment)\b/i.test(withoutNonMainnet) ||
    /\b(?:not on|not using|not connected to|without(?: the)?|no)\s+(?:the\s+)?test[- ]?net\b/i.test(segment) ||
    /\btest[- ]?net\b.{0,80}\b(?:not|missing|absent|unavailable|unconnected|disconnected)\b/i.test(segment)
  );
}

function hasConcreteLivePreflightActivationEvidenceTarget(segment: string): boolean {
  const match = /\bActivation evidence target\s*(?:=|:)\s*([^\s),;|]+)/i.exec(segment);
  return match !== null && isConcreteJsonEvidenceTarget(match[1]);
}

function isConcreteJsonEvidenceTarget(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = normalizeCompletedEvidenceTarget(value);
  const isSafeArtifactTarget = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._/-]+$/i.test(normalized);
  const isSafeRelativeTarget = /^[A-Za-z0-9._/-]+$/.test(normalized);
  return (
    /\.json$/i.test(normalized) &&
    (isSafeArtifactTarget || isSafeRelativeTarget) &&
    isCompletedEvidenceTarget(normalized)
  );
}

function hasDistinctQualifiedAssemblyReportOutputTarget(assemblySegments: string[]): boolean {
  return assemblySegments
    .flatMap(segment => extractCompletedEvidenceTargets(assemblyReportOutputEvidenceText(segment)))
    .map(normalizeCompletedEvidenceTarget)
    .some(target =>
      /\.json$/i.test(target) &&
      /\b(?:assembly|assemble|rehearsal[-_ ]?assembly)\b/i.test(target) &&
      !/(template|example|sample)/i.test(target)
    );
}

function hasRequiredAssemblyReportFacts(assemblySegments: string[]): boolean {
  return assemblySegments.some(hasAssemblyReportJsonEvidence);
}

function hasAssemblyReportJsonEvidence(segment: string): boolean {
  return (
    /(?:^|[\s;])--json-out\b.{0,180}(?:artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+|[^\s),;|]*assembly[-_ ]?report\.json|[^\s),;|]*rehearsal[-_ ]?assembly[-_ ]?report\.json)\b/i.test(segment) &&
    /\bassembly report JSON\b.{0,140}\bcompleted structured evidence\b/i.test(segment)
  );
}

function hasDistinctQualifiedPostSubmitObserveOutputTarget(observeSegments: string[]): boolean {
  return observeSegments
    .flatMap(segment => extractCompletedEvidenceTargets(postSubmitObserveOutputEvidenceText(segment)))
    .map(normalizeCompletedEvidenceTarget)
    .some(target => /\b(?:post[-_ ]?submit|observe|observation|log|transcript|ci|workflow)\b/i.test(target));
}

function hasDistinctQualifiedFreshCheckpointOutputTarget(checkpointSegments: string[]): boolean {
  return checkpointSegments
    .flatMap(segment => extractCompletedEvidenceTargets(freshCheckpointOutputEvidenceText(segment)))
    .map(normalizeCompletedEvidenceTarget)
    .some(target =>
      /\.json$/i.test(target) &&
      /\b(?:fresh[-_ ]?testnet[-_ ]?checkpoint|fresh[-_ ]?checkpoint|checkpoint)\b/i.test(target) &&
      !/(template|example|sample)/i.test(target)
    );
}

function hasRequiredFreshCheckpointFacts(checkpointSegments: string[]): boolean {
  return checkpointSegments.some(segment =>
    hasFreshCheckpointJsonReportEvidence(segment) &&
    hasFreshCheckpointSourceBindingEvidence(segment) &&
    hasFreshCheckpointIdentityAndFreshnessEvidence(segment) &&
    hasFreshCheckpointBoundaryEvidence(segment)
  );
}

function hasFreshCheckpointJsonReportEvidence(segment: string): boolean {
  return (
    /(?:^|[\s;])--json-out\b.{0,180}(?:artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+|[^\s),;|]*fresh[-_ ]?testnet[-_ ]?checkpoint\.json|[^\s),;|]*fresh[-_ ]?checkpoint\.json)\b/i.test(segment) &&
    /\bfresh checkpoint JSON report\b.{0,140}\bcompleted structured evidence\b/i.test(segment)
  );
}

function hasFreshCheckpointSourceBindingEvidence(segment: string): boolean {
  return (
    hasFreshCheckpointHeightSourceBindingEvidence(segment) &&
    hasFreshCheckpointSingletonSourceBindingEvidence(segment) &&
    hasFreshCheckpointAnchorSourceBindingEvidence(segment)
  );
}

function hasFreshCheckpointHeightSourceBindingEvidence(segment: string): boolean {
  const hasLiveReadOnlySources = (
    /\bsourceBindings\.heightEvidence\b(?=[^;]*\bmode\s+live-read-only-sources\b)(?=[^;]*\breadOnlyErgoNodeClient\s+true\b)(?=[^;]*\breadOnlySidechainRpcClient\s+true\b)(?=[^;]*\bnodeAuthHeader\s+not-used\b)(?=[^;]*\boperations\b[^;]*\/info\b)(?=[^;]*\boperations\b[^;]*getBlockNumber\b)/i
      .test(segment)
  );
  const hasProvidedJsonSource = (
    /\bsourceBindings\.heightEvidence\b(?=[^;]*\bmode\s+provided-json\b)(?=[^;]*\btarget\b[^;]*[^\s<>|;),]+\.json\b)(?=[^;]*\breadOnlyErgoNodeClient\s+false\b)(?=[^;]*\breadOnlySidechainRpcClient\s+false\b)(?=[^;]*\bnodeAuthHeader\s+not-applicable\b)/i
      .test(segment)
  );

  return (
    (hasLiveReadOnlySources || hasProvidedJsonSource) &&
    /\bsourceBindings\.heightEvidence\b(?=[^;]*\bbroadcastEnabled\s+false\b)/i.test(segment)
  );
}

function hasFreshCheckpointSingletonSourceBindingEvidence(segment: string): boolean {
  return (
    /\bsourceBindings\.singletonCheckpoint\b(?=[^;]*\bmode\s+live-read-only-node\b)(?=[^;]*\breadOnlyNodeClient\s+true\b)(?=[^;]*\bnodeAuthHeader\s+not-used\b)(?=[^;]*\boperations\b[^;]*\/info\b)(?=[^;]*\boperations\b[^;]*singleton boxes\b)(?=[^;]*\boperations\b[^;]*(?:mempool|unconfirmed)\b)(?=[^;]*\boperations\b[^;]*confirmed transaction\b)/i
      .test(segment) ||
    /\bsourceBindings\.singletonCheckpoint\b(?=[^;]*\bmode\s+provided-json\b)(?=[^;]*\btarget\b[^;]*[^\s<>|;),]+\.json\b)(?=[^;]*\breadOnlyNodeClient\s+false\b)(?=[^;]*\bnodeAuthHeader\s+not-applicable\b)/i
      .test(segment)
  );
}

function hasFreshCheckpointAnchorSourceBindingEvidence(segment: string): boolean {
  return /\bsourceBindings\.anchorObservations\b(?=[^;]*\bmode\s+live-read-only-node\b)(?=[^;]*\breadOnlyNodeClient\s+true\b)(?=[^;]*\bnodeAuthHeader\s+not-used\b)(?=[^;]*\boperations\b[^;]*\/info\b)(?=[^;]*\boperations\b[^;]*extension fields\b)(?=[^;]*\boperations\b[^;]*0x0401\b)/i
    .test(segment);
}

function hasFreshCheckpointIdentityAndFreshnessEvidence(segment: string): boolean {
  return (
    /\bFresh checkpoint Expected transaction ID\b.{0,120}(?:0x)?[0-9a-fA-F]{64}\b/i.test(segment) &&
    /\bFresh checkpoint deployed-state hash\b.{0,120}(?:0x)?[0-9a-fA-F]{64}\b/i.test(segment) &&
    /\bFresh checkpoint singleton freshness\b.{0,80}\bfresh\b/i.test(segment) &&
    /\bageSeconds\b\s*[0-9]+\b/i.test(segment) &&
    /\bmaxAgeSeconds\b\s*900\b/i.test(segment) &&
    /\bFresh checkpoint live anchor observations\b.{0,160}\/info-bound\b.{0,160}\bobservedAt\b.{0,160}\bnodeHeight\b.{0,160}\b0x0401\b.{0,160}\bbridgeEventRootHex\b/i.test(segment)
  );
}

function hasFreshCheckpointBoundaryEvidence(segment: string): boolean {
  return (
    /\bFresh checkpoint boundary\b/i.test(segment) &&
    /\bbroadcast\b.{0,40}\bfalse\b/i.test(segment) &&
    /\blive submit\b.{0,40}\bfalse\b/i.test(segment) &&
    /\bconfirmation\b.{0,40}\bfalse\b/i.test(segment) &&
    /\breconciliation\b.{0,40}\bfalse\b/i.test(segment) &&
    /\bGate 3 closure\b.{0,40}\bfalse\b/i.test(segment) &&
    /\bclaim escalation\b.{0,40}\bfalse\b/i.test(segment)
  );
}

function hasRequiredPostSubmitObserveFacts(observeSegments: string[]): boolean {
  return observeSegments.some(segment =>
    hasPostSubmitObserveJsonReportEvidence(segment) &&
    /\b(?:Expected|submitted) transaction ID\b.{0,120}(?:0x)?[0-9a-fA-F]{64}\b/i.test(segment) &&
    /\bSPV tracker successor output\b.{0,80}\bOUTPUTS\(0\)/i.test(segment) &&
    /\bAggregate DUP successor output\b.{0,80}\bOUTPUTS\(1\)/i.test(segment) &&
    /\bpositional recipient payout binding\b/i.test(segment) &&
    /\bcanonical miner fee output\b/i.test(segment)
  );
}

function hasPostSubmitObserveJsonReportEvidence(segment: string): boolean {
  return (
    /(?:^|[\s;])--json-out\b.{0,160}(?:artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+|[^\s),;|]*post[-_ ]?submit[-_ ]?observe\.json)\b/i.test(segment) &&
    /\bpost[- ]submit observe JSON report\b.{0,120}\bcompleted structured evidence\b/i.test(segment)
  );
}

function hasPositiveEvidenceSegment(segment: string): boolean {
  if (hasContradictoryValidationFailureMarker(segment)) return false;
  return (
    /\bPASS\b(?!\s*\/)/.test(segment) ||
    hasExactExitCodeZero(segment) ||
    /\b0\s+structural\s+issues?\b/i.test(segment) ||
    /\bno\s+structural\s+issues?\b/i.test(segment)
  );
}

function hasExactExitCodeZero(value: string): boolean {
  return /\bexit[- ]?code\s*(?:=|:)?\s*0\b(?!\s*\/)/i.test(value);
}

function hasPositiveLabeledPassEvidence(
  segment: string,
  labelPattern: RegExp,
  maxDistance: number,
): boolean {
  if (hasContradictoryValidationFailureMarker(segment)) return false;

  const labelBeforePass = new RegExp(`${labelPattern.source}.{0,${maxDistance}}\\bPASS\\b(?!\\s*\\/)`, labelPattern.flags);
  return labelBeforePass.test(segment);
}

function hasContradictoryValidationFailureMarker(segment: string): boolean {
  const normalized = normalizeReleaseNotesDecisionBindingText(segment);

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
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized)
  );
}

function hasNoContradictoryReleaseNotesEvidenceMarker(value: string): boolean {
  return !hasContradictoryReleaseNotesEvidenceMarker(value);
}

function hasContradictoryReleaseNotesEvidenceMarker(value: string): boolean {
  const normalized = normalizeReleaseNotesDecisionBindingText(value);
  return (
    /\b(?:status|result|validation|validator|command|run|outcome|output)\s*[:=]?\s*(?:FAIL(?:ED)?|BLOCKED|ERROR)\b/i.test(normalized) ||
    /\b(?:FAIL(?:ED)?|BLOCKED|ERROR)\b\s+(?:validation|validator|command|run|result|status|outcome|output)\b/i.test(normalized) ||
    hasUnresolvedIssueMarker(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized) ||
    hasConditionalValidationApprovalMarker(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\b[1-9]\d*\s+structural\s+issues?\b/i.test(normalized)
  );
}

const BINARY_RELEASE_NOTES_DECISION_FIELDS = [
  'Accepted risks reflected in release notes',
  'Governance-ready claim allowed',
  'Mainnet deployment claim allowed',
  'Mainnet-grade evidence linked',
  'Operator-ready claim allowed',
  'Private maintainer context used',
  'Production throughput claim allowed',
  'Production-ready claim allowed',
  'Public institutional-reference release allowed',
  'Scaling claims allowed',
  'Testnet production-candidate claim allowed',
  'Transitional trusted burn path disabled',
  'Trustless burn verification implemented',
  'Upstream signer blocker resolved',
];

const ZERO_COUNT_RELEASE_NOTES_DECISION_FIELDS = [
  'Critical incidents open',
  'Critical/high findings open',
  'Critical/high vulnerabilities open',
  'Open benchmark blockers',
  'Open governance blockers',
  'Publication blockers',
  'Release gate structural issues',
  'Structural issues',
];

function hasContradictoryReleaseNotesDecisionBinding(value: string): boolean {
  return (
    BINARY_RELEASE_NOTES_DECISION_FIELDS.some(field => hasOpposingBinaryDecisionBindings(value, field)) ||
    ZERO_COUNT_RELEASE_NOTES_DECISION_FIELDS.some(field => hasMixedZeroAndNonZeroDecisionBindings(value, field)) ||
    hasOpposingReleaseGateStatusBindings(value) ||
    hasOpposingFinalDecisionBindings(value) ||
    hasMixedReleaseSupportBindings(value)
  );
}

function hasOpposingBinaryDecisionBindings(value: string, field: string): boolean {
  const values = exactReleaseNotesDecisionBindingValues(value, field, 'yes|no');
  return values.has('yes') && values.has('no');
}

function hasMixedZeroAndNonZeroDecisionBindings(value: string, field: string): boolean {
  const values = [...exactReleaseNotesDecisionBindingValues(value, field, '\\d+')].map(Number);
  return values.some(count => count === 0) && values.some(count => count > 0);
}

function hasOpposingReleaseGateStatusBindings(value: string): boolean {
  const values = exactReleaseNotesDecisionBindingValues(value, 'Release gate status', 'pass|fail|failed|blocked');
  return values.has('pass') && (values.has('fail') || values.has('failed') || values.has('blocked'));
}

function hasOpposingFinalDecisionBindings(value: string): boolean {
  const values = exactReleaseNotesDecisionBindingValues(value, 'Final decision', 'approve|approved|reject|rejected|block|blocked');
  return (values.has('approve') || values.has('approved')) &&
    (values.has('reject') || values.has('rejected') || values.has('block') || values.has('blocked'));
}

function hasMixedReleaseSupportBindings(value: string): boolean {
  const values = exactReleaseNotesDecisionBindingValues(
    value,
    'Release supported',
    'production\\s+deployment\\s+candidate|institutional\\s+reference|validated\\s+poc|draft',
  );
  return values.size > 1;
}

function exactReleaseNotesDecisionBindingValues(value: string, field: string, valuePattern: string): Set<string> {
  const pattern = new RegExp(
    `\\b${releaseNotesDecisionFieldPattern(field)}\\s*=\\s*(${valuePattern})\\s*(?:$|[.;,|)\\]\\r\\n])`,
    'ig',
  );
  const normalized = normalizeReleaseNotesDecisionBindingText(value);
  return new Set([...normalized.matchAll(pattern)].map(match => match[1].toLowerCase().replace(/\s+/g, ' ')));
}

function releaseNotesDecisionFieldPattern(field: string): string {
  return field.split(/[- ]+/).map(escapeRegExp).join('[- ]+');
}

function normalizeReleaseNotesDecisionBindingText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\udb40[\udd00-\uddef]/g, '')
    .replace(/\u00ad/g, '-')
    .replace(/[\u200b\u2060\ufeff]/g, ' ')
    .replace(/[\u034f\u061c\u180e\u200c-\u200f\u202a-\u202e\u2061-\u206f\ufe00-\ufe0f]/g, '')
    .replace(/(?<=[A-Za-z0-9])[\u2010-\u2015\u2212\ufe58\ufe63\uff0d](?=[A-Za-z0-9])/g, '-');
}

function hasRecoveryObserveJsonReportEvidence(
  segment: string,
  expectedKind: ReleaseNotesRecoveryObserveKind,
): boolean {
  return (
    new RegExp(`(?:^|\\s)--kind\\s+${escapeRegExp(expectedKind)}\\b`, 'i').test(segment) &&
    /(?:^|[\s;])--json-out\b.{0,180}(?:artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+|[^\s),;|]*recovery[-_ ]?observe\.json)\b/i.test(segment) &&
    /\bstructured recovery observation PASS evidence\b.{0,160}\bcompleted observation artifact\b/i.test(segment)
  );
}

function hasRecoveryObserveSourceBindingEvidence(segment: string): boolean {
  return (
    /\bsourceBindings\.?node\b.{0,180}\bsourceType\b.{0,80}\blive-read-only-node\b/i.test(segment) &&
    /\bsourceBindings\.?node\b.{0,180}\breadOnly\b.{0,40}\btrue\b/i.test(segment) &&
    /\bsourceBindings\.?node\b.{0,180}\bnoAuthHeader\b.{0,40}\btrue\b/i.test(segment) &&
    /\bsourceBindings\.?state\b.{0,180}\bsourceType\b.{0,80}\bread-only-state-tracker\b/i.test(segment) &&
    /\bsourceBindings\.?state\b.{0,180}\breadOnly\b.{0,40}\btrue\b/i.test(segment) &&
    /\bsourceBindings\.?state\b.{0,180}\bruntimePathSerialized\b.{0,40}\bfalse\b/i.test(segment)
  );
}

function hasRecoveryObserveBoundaryEvidence(segment: string): boolean {
  return (
    /\bobservationBoundary\b/i.test(segment) &&
    /\bread[- ]only node\/state observation\b/i.test(segment) &&
    /\bsigning\b.{0,40}\bfalse\b/i.test(segment) &&
    /\bbroadcast\b.{0,40}\bfalse\b/i.test(segment) &&
    /\bsubmit\b.{0,40}\bfalse\b/i.test(segment) &&
    /\brepair\b.{0,40}\bfalse\b/i.test(segment) &&
    /\bstate mutation\b.{0,40}\bfalse\b/i.test(segment) &&
    /\breconciliation\b.{0,40}\bfalse\b/i.test(segment) &&
    /\bGate 3 closure\b.{0,40}\bfalse\b/i.test(segment) &&
    /\bclaim escalation\b.{0,40}\bfalse\b/i.test(segment)
  );
}

function hasRequiredRecoveryObserveFacts(
  segment: string,
  expectedKind: ReleaseNotesRecoveryObserveKind,
): boolean {
  if (expectedKind === 'failed-broadcast-phantom-avl') {
    return (
      /\bExpected transaction ID\b.{0,120}(?:0x)?[0-9a-fA-F]{64}\b/i.test(segment) &&
      /\bpeg-out burn TX ID\b.{0,120}(?:0x)?[0-9a-fA-F]{64}\b/i.test(segment) &&
      /\bno phantom AVL history\b/i.test(segment) &&
      /\bno phantom DUP history\b/i.test(segment) &&
      /\bno confirmed chain presence\b/i.test(segment) &&
      /\bno mempool presence\b/i.test(segment)
    );
  }

  return (
    /\bpeg-out burn TX ID\b.{0,120}(?:0x)?[0-9a-fA-F]{64}\b/i.test(segment) &&
    /\bsingleton inventory(?: identifier)?\b.{0,120}(?:0x)?[0-9a-fA-F]{64}\b/i.test(segment) &&
    (/\brecoverable\b.{0,80}\bstale singleton\b/i.test(segment) ||
      /\bstale singleton\b.{0,80}\brecoverable\b/i.test(segment))
  );
}

function hasLivePreflightExpectedTxBoundToValidation(
  text: string,
  livePreflightSegments: string[],
): boolean {
  const expectedTxIds = new Set(livePreflightSegments.flatMap(extractExpectedTransactionIds));
  if (expectedTxIds.size === 0) return false;

  const validationSubmittedTxIds = text
    .split(/[;\n]+/)
    .map(segment => segment.trim())
    .filter(isRehearsalValidationEvidenceSegment)
    .flatMap(extractSubmittedTransactionIds);
  return validationSubmittedTxIds.some(txId => expectedTxIds.has(txId));
}

function hasLivePreflightTargetBoundToCompletedRehearsal(
  livePreflightSegments: string[],
  completedLiveRehearsalTargets: string[],
): boolean {
  return completedLiveRehearsalTargets.some(target => {
    const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const targetBinding = new RegExp(
      `\\b(?:external-fee live-preflight target|live preflight target|live-preflight target|rehearsal live-preflight target)\\b[^\\n.;|]*${escapedTarget}`,
      'i',
    );
    return livePreflightSegments.some(segment =>
      targetBinding.test(normalizeCompletedEvidenceTarget(segment))
    );
  });
}

function isRehearsalLivePreflightEvidenceSegment(segment: string): boolean {
  return /\bnpm run rehearsal:external-fee-live-preflight\b.{0,160}\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i
    .test(segment);
}

function isRehearsalPreflightEvidenceSegment(segment: string): boolean {
  return /\bnpm run rehearsal:preflight\b.{0,180}\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i
    .test(segment);
}

function isRehearsalPostSubmitObserveEvidenceSegment(segment: string): boolean {
  return /\bnpm run rehearsal:post-submit:observe\b.{0,180}\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i
    .test(segment);
}

function isRehearsalPrepBundleEvidenceSegment(segment: string): boolean {
  return /\bnpm run rehearsal:prep-bundle\b.{0,180}\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i
    .test(segment);
}

function isRehearsalAssemblyEvidenceSegment(segment: string): boolean {
  return /\bnpm run rehearsal:assemble\b.{0,180}\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i
    .test(segment);
}

function isRehearsalFreshCheckpointEvidenceSegment(segment: string): boolean {
  return /\bnpm run rehearsal:fresh-testnet-check\b.{0,180}\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i
    .test(segment);
}

function isRecoveryObserveEvidenceSegment(
  segment: string,
  expectedKind: ReleaseNotesRecoveryObserveKind,
): boolean {
  return (
    /\bnpm run rehearsal:recovery-observe(?::validate)?\b/i.test(segment) ||
    /\brecovery-observe JSON validation PASS\b(?!\s*\/)/i.test(segment) ||
    /\bstructured recovery observation PASS evidence\b/i.test(segment)
  ) && (
    segment.includes(expectedKind) ||
    recoveryObserveKindAlias(expectedKind).test(segment)
  );
}

function isRecoveryObserveValidationEvidenceSegment(segment: string): boolean {
  return (
    /\bnpm run rehearsal:recovery-observe:validate\b/i.test(segment) &&
    /\brecovery-observe JSON validation PASS\b(?!\s*\/)/i.test(segment) &&
    hasPositiveEvidenceSegment(segment)
  );
}

function assemblyReportOutputEvidenceText(segment: string): string {
  const targetBinding = /\b(?:assembly report target|assembly target|rehearsal assembly target|validated target|validated input)\b/i
    .exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function livePreflightOutputEvidenceText(segment: string): string {
  const targetBinding = /\b(?:validated target|validated input|external-fee live-preflight target|live preflight target|live-preflight target|rehearsal live-preflight target)\b/i
    .exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function freshCheckpointOutputEvidenceText(segment: string): string {
  const targetBinding = /\b(?:fresh checkpoint target|fresh-checkpoint target|rehearsal fresh-checkpoint target|validated target|validated input)\b/i
    .exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function postSubmitObserveOutputEvidenceText(segment: string): string {
  const targetBinding = /\b(?:observed target|post-submit observe target|post submit observe target|rehearsal post-submit observe target)\b/i
    .exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function recoveryObserveOutputEvidenceText(segment: string): string {
  const targetBinding = /\b(?:recovery-observe validation target|validated target|validated input)\b/i
    .exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function extractRecoveryObserveJsonTargets(segment: string): string[] {
  return extractCompletedEvidenceTargets(segment)
    .map(normalizeCompletedEvidenceTarget)
    .filter(target =>
      /\.json$/i.test(target) &&
      /\b(?:recovery[-_ ]?observe|failed[-_ ]?broadcast|reorg|stale[-_ ]?singleton)\b/i.test(target) &&
      !/(template|example|sample)/i.test(target)
    );
}

function recoveryObserveKindAlias(kind: ReleaseNotesRecoveryObserveKind): RegExp {
  return kind === 'failed-broadcast-phantom-avl'
    ? /\bfailed[- ]broadcast\b|\bphantom AVL\b|\bphantom DUP\b/i
    : /\breorged?[- ]burn\b|\bstale singleton\b/i;
}

function releaseEvidenceSegments(text: string): string[] {
  return text
    .split(/[;\n]+/)
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0);
}

function extractExpectedTransactionIds(value: string): string[] {
  return [...value.matchAll(/\bExpected transaction ID\b.{0,120}(?:0x)?([0-9a-fA-F]{64})\b/gi)]
    .map(([, txId]) => txId.toLowerCase());
}

function extractSubmittedTransactionIds(value: string): string[] {
  return [...value.matchAll(/\bsubmitted transaction ID\b.{0,120}(?:0x)?([0-9a-fA-F]{64})\b/gi)]
    .map(([, txId]) => txId.toLowerCase());
}

function hasDistinctQualifiedRehearsalValidationOutputTarget(
  validationSegments: string[],
  completedLiveRehearsalTargets: string[],
): boolean {
  const completedTargetSet = new Set(completedLiveRehearsalTargets);
  return validationSegments
    .flatMap(segment => extractCompletedEvidenceTargets(rehearsalValidationOutputEvidenceText(segment)))
    .map(normalizeCompletedEvidenceTarget)
    .some(target =>
      !completedTargetSet.has(target) &&
      /\b(?:validate|validation|log|transcript|ci|workflow)\b/i.test(target)
    );
}

function isRehearsalValidationEvidenceSegment(segment: string): boolean {
  return /\bnpm run rehearsal:validate\b.{0,120}\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i
    .test(segment);
}

function rehearsalValidationOutputEvidenceText(segment: string): string {
  const targetBinding = /\b(?:validated target|validated input|rehearsal validate target|rehearsal validation target)\b/i
    .exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function extractKeyedPositiveInteger(segment: string, key: string): number | undefined {
  const match = new RegExp(`\\b${key}\\s*=\\s*([1-9][0-9]*)\\b`, 'i').exec(segment);
  if (!match) return undefined;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function hasRequiredLiveRehearsalValidationFacts(validationSegments: string[]): boolean {
  return validationSegments.some(segment => {
    const confirmationsRequired = extractKeyedPositiveInteger(segment, 'confirmationsRequired');
    const confirmationsObserved = extractKeyedPositiveInteger(segment, 'confirmationsObserved');

    return hasPositiveLabeledPassEvidence(segment, /\bconfirmation policy met\b/i, 80) &&
      confirmationsRequired !== undefined &&
      confirmationsObserved !== undefined &&
      confirmationsObserved >= confirmationsRequired &&
      /\bobserved confirmation count\b.{0,80}\b(?:>=|greater than or equal to)\b.{0,80}\brequired confirmation count\b/i.test(segment) &&
      /\bsubmitted transaction ID\b.{0,80}(?:0x)?[0-9a-fA-F]{64}\b/i.test(segment) &&
      /\bcompleted finality evidence\b.{0,120}(?:artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+|\[[^\]]+\]\([^)]+\))/i.test(segment);
  });
}

function controlledTestnetProductionPrerequisiteErrors(
  prefix: string,
  evidenceRows: RequiredEvidenceRow[],
  blockerRows: PublicationBlockerRow[],
): string[] {
  const errors: string[] = [];
  const missingEvidence = TESTNET_PRODUCTION_CANDIDATE_REQUIRED_EVIDENCE_CLASSES.filter(
    evidenceClass => !hasLinkedCompletedEvidence(evidenceRows, evidenceClass),
  );
  const missingBlockers = TESTNET_PRODUCTION_CANDIDATE_REQUIRED_PUBLICATION_BLOCKERS.filter(
    blocker => !hasCheckedPublicationBlocker(blockerRows, blocker),
  );

  if (missingEvidence.length > 0) {
    errors.push(
      `${prefix}: testnet production-candidate claims require linked evidence: ${missingEvidence.join(', ')}`,
    );
  }
  if (missingBlockers.length > 0) {
    errors.push(
      `${prefix}: testnet production-candidate claims require checked publication blockers: ${missingBlockers.join(', ')}`,
    );
  }
  if (!hasUpstreamSignerConformanceEvidence(evidenceRows)) {
    errors.push(`${prefix}: testnet production-candidate claims require upstream signer conformance evidence`);
  }

  return errors;
}

function hasGate8FreshReviewerAndPrivateContextEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    /fresh[- ]reviewer/i.test(text) &&
    (
      /\bprivate maintainer context used\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) ||
      /without private maintainer context|no private maintainer context/i.test(text)
    )
  );
}

function hasCleanCheckoutCiValidationOutputEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    /\bci:validate\b/i.test(text) &&
    /\bcommand[- ]?output\b/i.test(text) &&
    hasExactExitCodeZero(text)
  );
}

function hasCleanCheckoutCiProductionCandidateDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    hasExactProductionCandidateReleaseSupportedBinding(text) &&
    hasExactCleanCheckoutCiProductionReadyClaimDeniedBinding(text) &&
    hasExactCleanCheckoutCiTestnetProductionCandidateClaimAllowedBinding(text) &&
    hasExactCleanCheckoutCiReleaseGateStructuralIssuesBinding(text)
  );
}

function hasExactProductionCandidateReleaseSupportedBinding(value: string): boolean {
  return /\brelease[- ]supported\s*=\s*production deployment candidate\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactCleanCheckoutCiProductionReadyClaimDeniedBinding(value: string): boolean {
  return /\bproduction[- ]ready[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactCleanCheckoutCiTestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return /\btestnet[- ]production[- ]candidate[- ]claim[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactCleanCheckoutCiReleaseGateStructuralIssuesBinding(value: string): boolean {
  return /\brelease[- ]gate[- ]structural[- ]issues\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasBackupRestoreValidationOutputEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    /\bbackup:validate\b/i.test(text) &&
    /\bcommand[- ]?output\b/i.test(text) &&
    hasExactExitCodeZero(text)
  );
}

function hasBackupRestoreProductionCandidateDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    hasExactProductionCandidateReleaseSupportedBinding(text) &&
    /\bproduction[- ]ready[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\btestnet[- ]production[- ]candidate[- ]claim[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(text)
  );
}

function hasContextExtensionSignerBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  const identifiesContextExtension = /\bcontextextension\b|\bcontext[- ]extension\b/i.test(text);
  const preservesFailClosedGuard = /\bfail[- ]closed\b/i.test(text) && /\bguard\b/i.test(text);
  const identifiesUpstreamResolution = /\bupstream[- ]signer\b|\bupstream signer\b/i.test(text) &&
    /\bresolution\b|\bresolved\b|\bconformance\b/i.test(text);
  return identifiesContextExtension && (preservesFailClosedGuard || identifiesUpstreamResolution);
}

function hasContextExtensionSignerProductionCandidateDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    hasExactProductionCandidateReleaseSupportedBinding(text) &&
    /\bproduction[- ]ready[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\btestnet[- ]production[- ]candidate[- ]claim[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    hasContextExtensionSignerBoundaryEvidence(row)
  );
}

function hasSignerDependencyBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return hasPositiveSignerDependencyConformanceEvidence(text) || hasFailClosedSignerDependencyDecisionEvidence(text);
}

function hasSignerDependencyProductionCandidateDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    hasExactProductionCandidateReleaseSupportedBinding(text) &&
    /\bproduction[- ]ready[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\btestnet[- ]production[- ]candidate[- ]claim[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    hasPositiveSignerDependencyConformanceEvidence(text)
  );
}

function hasPositiveSignerDependencyConformanceEvidence(text: string): boolean {
  return !hasNegatedUpstreamSignerConformanceEvidence(text) &&
    hasResolvedUpstreamSignerBlocker(text) &&
    hasPositiveUpstreamSignerConformanceEvidence(text);
}

function hasFailClosedSignerDependencyDecisionEvidence(text: string): boolean {
  return (
    /\bfail[- ]closed\b/i.test(text) &&
    /\b(upstream[- ]signer|signer[- ]dependency|contextextension|context[- ]extension)\b/i.test(text) &&
    /production[- ]ready[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /upstream[- ]signer[- ]blocker[- ]resolved\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text)
  );
}

function hasBroadcastGateReadinessOutputEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    /\bdemo:readiness\b/i.test(text) &&
    /\bbroadcast policy\b/i.test(text) &&
    /\bcommand[- ]?output\b/i.test(text) &&
    hasExactExitCodeZero(text)
  );
}

function hasBroadcastGateProductionCandidateDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    hasExactProductionCandidateReleaseSupportedBinding(text) &&
    /\bproduction[- ]ready[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\btestnet[- ]production[- ]candidate[- ]claim[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\bbroadcast[- ]remains[- ]opt[- ]in\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(text)
  );
}

function hasGate6OperatorCommandOutputEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    /\boperator\b/i.test(text) &&
    /\bcommand[- ]specific\b/i.test(text) &&
    /\bcommand[- ]?output\b/i.test(text) &&
    hasExactExitCodeZero(text)
  );
}

function hasGate6OperatorDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    hasExactProductionCandidateReleaseSupportedBinding(text) &&
    /\bproduction[- ]ready[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    hasExactGate6OperatorReadinessTestnetProductionCandidateClaimAllowedBinding(text) &&
    hasExactGate6OperatorReadyClaimAllowedBinding(text) &&
    /\bcritical[- ]incidents[- ]open\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(text)
  );
}

function hasExactGate6OperatorReadyClaimAllowedBinding(value: string): boolean {
  return /\boperator[- ]ready[- ]claim[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactGate6OperatorReadinessTestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return /\btestnet[- ]production[- ]candidate[- ]claim[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasGate6GovernanceCommandOutputEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    /\bgovernance\b/i.test(text) &&
    /\bcommand[- ]specific\b/i.test(text) &&
    /\bcommand[- ]?output\b/i.test(text) &&
    hasExactExitCodeZero(text)
  );
}

function hasGate6GovernanceDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    hasExactProductionCandidateReleaseSupportedBinding(text) &&
    /\bproduction[- ]ready[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    hasExactGate6GovernanceTestnetProductionCandidateClaimAllowedBinding(text) &&
    hasExactGate6GovernanceReadyClaimAllowedBinding(text) &&
    /\bopen[- ]governance[- ]blockers\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(text)
  );
}

function hasExactGate6GovernanceReadyClaimAllowedBinding(value: string): boolean {
  return /\bgovernance[- ]ready[- ]claim[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactGate6GovernanceTestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return /\btestnet[- ]production[- ]candidate[- ]claim[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasGate4DependencyRiskCommandOutputEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    /\bdependency:validate\b/i.test(text) &&
    /\bcommand[- ]?output\b/i.test(text) &&
    hasExactExitCodeZero(text)
  );
}

function hasGate4DependencyRiskDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    hasExactGate4DependencyRiskProductionReadyClaimDeniedBinding(text) &&
    hasExactGate4DependencyRiskCriticalHighVulnerabilitiesOpenBinding(text)
  );
}

function hasGate4DependencyRiskProductionCandidateDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    hasExactProductionCandidateReleaseSupportedBinding(text) &&
    hasExactGate4DependencyRiskProductionReadyClaimDeniedBinding(text) &&
    hasExactGate4DependencyRiskTestnetProductionCandidateClaimAllowedBinding(text) &&
    hasExactGate4DependencyRiskCriticalHighVulnerabilitiesOpenBinding(text)
  );
}

function hasExactGate4DependencyRiskProductionReadyClaimDeniedBinding(value: string): boolean {
  return /\bproduction[- ]ready[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactGate4DependencyRiskTestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return /\btestnet[- ]production[- ]candidate[- ]claim[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactGate4DependencyRiskCriticalHighVulnerabilitiesOpenBinding(value: string): boolean {
  return /\bcritical\/high\s+vulnerabilities\s+open\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasGate4SecurityReviewCommandOutputEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    /\bsecurity:validate\b/i.test(text) &&
    /\bcommand[- ]?output\b/i.test(text) &&
    hasExactExitCodeZero(text)
  );
}

function hasGate4SecurityReviewDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    hasExactGate4SecurityReviewFinalDecisionApproveBinding(text) &&
    hasExactGate4SecurityReviewCriticalHighFindingsOpenBinding(text) &&
    hasExactGate4SecurityReviewPublicationBlockersBinding(text) &&
    hasExactGate4SecurityReviewProductionReadyClaimDeniedBinding(text)
  );
}

function hasGate4SecurityReviewProductionCandidateDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    hasExactProductionCandidateReleaseSupportedBinding(text) &&
    hasExactGate4SecurityReviewFinalDecisionApproveBinding(text) &&
    hasExactGate4SecurityReviewCriticalHighFindingsOpenBinding(text) &&
    hasExactGate4SecurityReviewPublicationBlockersBinding(text) &&
    hasExactGate4SecurityReviewProductionReadyClaimDeniedBinding(text) &&
    hasExactGate4SecurityReviewTestnetProductionCandidateClaimAllowedBinding(text)
  );
}

function hasExactGate4SecurityReviewFinalDecisionApproveBinding(value: string): boolean {
  return /\bfinal\s+decision\s*=\s*approve\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactGate4SecurityReviewCriticalHighFindingsOpenBinding(value: string): boolean {
  return /\bcritical\/high\s+findings\s+open\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactGate4SecurityReviewPublicationBlockersBinding(value: string): boolean {
  return /\bpublication[- ]blockers\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactGate4SecurityReviewProductionReadyClaimDeniedBinding(value: string): boolean {
  return /\bproduction[- ]ready[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactGate4SecurityReviewTestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return /\btestnet[- ]production[- ]candidate[- ]claim[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasGate2TechnicalAddendumValidationOutputEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    /\baddendum:validate\b/i.test(text) &&
    /\bcommand[- ]?output\b/i.test(text) &&
    hasExactExitCodeZero(text)
  );
}

function hasGate2TechnicalAddendumClaimBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    /\brelease[- ]gate[- ]status\s*=\s*pass\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\brelease:gate\b\s+pass\b(?!\s*\/)/i.test(text) &&
    /\bstructural[- ]issues\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /production[- ]ready[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /mainnet[- ]deployment[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /testnet[- ]production[- ]candidate[- ]claim[- ]allowed\s*=\s*yes-after-release-gate-pass\s*(?:$|[.;,|)\]\r\n])/i.test(text)
  );
}

function hasGate2TechnicalAddendumProductionCandidateDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return hasExactProductionCandidateReleaseSupportedBinding(text) && hasGate2TechnicalAddendumClaimBoundaryEvidence(row);
}

function hasGate5TrustlessBurnCommandOutputEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    /\btrustless:validate\b/i.test(text) &&
    /\bcommand[- ]?output\b/i.test(text) &&
    hasExactExitCodeZero(text)
  );
}

function hasGate5TrustlessBurnDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    hasExactProductionCandidateReleaseSupportedBinding(text) &&
    /\btrustless[- ]burn[- ]verification[- ]implemented\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\btransitional[- ]trusted[- ]burn[- ]path[- ]disabled\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\bproduction[- ]ready[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\btestnet[- ]production[- ]candidate[- ]claim[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\bcritical\/high\s+findings\s+open\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(text)
  );
}

function hasGate7BenchmarkCommandOutputEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    /\bbenchmark\b/i.test(text) &&
    /\bcommand[- ]specific\b/i.test(text) &&
    /\bcommand[- ]?output\b/i.test(text) &&
    hasExactExitCodeZero(text)
  );
}

function hasGate7BenchmarkDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    hasExactProductionCandidateReleaseSupportedBinding(text) &&
    /\bscaling[- ]claims[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\bproduction[- ]ready[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    hasExactGate7BenchmarkTestnetProductionCandidateClaimAllowedBinding(text) &&
    /\bproduction[- ]throughput[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\bmainnet[- ]grade[- ]evidence[- ]linked\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\bopen[- ]benchmark[- ]blockers\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(text)
  );
}

function hasExactGate7BenchmarkTestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return /\btestnet[- ]production[- ]candidate[- ]claim[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasThreatModelProductionCandidateDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    hasExactProductionCandidateReleaseSupportedBinding(text) &&
    /\bproduction[- ]ready[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\btestnet[- ]production[- ]candidate[- ]claim[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(text)
  );
}

function hasThreatModelValidationOutputEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    /\bthreat-model:validate\b/i.test(text) &&
    /\bcommand[- ]?output\b/i.test(text) &&
    hasExactExitCodeZero(text)
  );
}

function hasGate8FreshCheckoutCommitEvidence(
  row: RequiredEvidenceRow,
  classification: Map<string, string>,
): boolean {
  const releaseCommit = classification.get('Git commit')?.trim() ?? '';
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;

  if (!isGitCommitSha(releaseCommit)) return hasFreshCheckoutGitCommitEvidence(text);
  return hasFreshCheckoutGitCommitEvidence(text) && evidenceContainsCommit(text, releaseCommit);
}

function hasGate8FreshCheckoutExitCodeEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return text
    .split(/\b(?:npm\s+run\s+)?integration:validate\b/i)
    .some(scope =>
      /\bfresh[- ]checkout\b/i.test(scope) &&
      /\b(?:command[- ]?output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(scope) &&
      hasExactExitCodeZero(scope)
    );
}

function hasGate8IntegrationValidationOutputEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    /\bintegration:validate\b/i.test(text) &&
    /\bcommand[- ]?output\b/i.test(text) &&
    hasExactExitCodeZero(text)
  );
}

function hasGate8PublicationDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    /\bprivate[- ]maintainer[- ]context[- ]used\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\bpublic[- ]institutional[- ]reference[- ]release[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\bproduction[- ]ready[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    hasGate8TestnetProductionCandidateClaimAllowedBinding(text)
  );
}

function hasGate8ProductionCandidateDecisionBoundaryEvidence(row: RequiredEvidenceRow): boolean {
  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  return (
    hasExactProductionCandidateReleaseSupportedBinding(text) &&
    /\bprivate[- ]maintainer[- ]context[- ]used\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\bpublic[- ]institutional[- ]reference[- ]release[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    /\bproduction[- ]ready[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(text) &&
    hasGate8TestnetProductionCandidateClaimAllowedYesBinding(text)
  );
}

function hasGate8TestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return (
    /\btestnet[- ]production[- ]candidate[- ]claim[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value) ||
    /\btestnet[- ]production[- ]candidate[- ]claim[- ]allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value)
  );
}

function hasGate8TestnetProductionCandidateClaimAllowedYesBinding(value: string): boolean {
  return /\btestnet[- ]production[- ]candidate[- ]claim[- ]allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasFreshCheckoutGitCommitEvidence(value: string): boolean {
  return (
    /\bfresh[- ]checkout\b[^|\n]{0,120}\b(?:git[- ]?)?(?:commit|sha|head)\b[^|\n]{0,80}\b[a-f0-9]{7,40}\b/i.test(value) ||
    /\bfresh[- ]checkout\b[^|\n]{0,120}\b[a-f0-9]{7,40}\b[^|\n]{0,80}\b(?:git[- ]?)?(?:commit|sha|head)\b/i.test(value)
  );
}

function evidenceContainsCommit(value: string, expectedCommit: string): boolean {
  const expected = expectedCommit.toLowerCase();
  return [...value.matchAll(/\b[a-f0-9]{7,40}\b/gi)]
    .some(match => match[0].toLowerCase() === expected);
}

function validateAssumptionRows(
  rows: TrustAssumptionRow[],
  classification: Map<string, string>,
  evidenceRows: RequiredEvidenceRow[],
  blockerRows: PublicationBlockerRow[],
): string[] {
  const errors = validateRequiredNames('Trust Assumptions', rows.map(row => row.assumption), REQUIRED_TRUST_ASSUMPTIONS);
  const releaseLevel = classification.get('Release level') ?? '';

  for (const row of rows) {
    if (!REQUIRED_TRUST_ASSUMPTIONS.includes(row.assumption)) {
      errors.push(`Trust Assumptions: ${row.assumption}: unexpected assumption`);
    }
    if (isBlank(row.currentStatus)) errors.push(`Trust Assumptions: ${row.assumption}: current status is required`);
    if (!hasEvidenceMarker(row.evidence)) {
      errors.push(`Trust Assumptions: ${row.assumption}: evidence must be a link, command, or artifact marker`);
    } else if (!hasCompletedReleaseNotesRowEvidenceMarker(row.evidence)) {
      errors.push(
        `Trust Assumptions: ${row.assumption}: evidence must include a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence`,
      );
    }
    if (!isBlank(row.evidence) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.evidence)) {
      errors.push(`Trust Assumptions: ${row.assumption}: evidence must not include contradictory release-note failure markers`);
    }
    if (!isBlank(row.releaseImpact) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.releaseImpact)) {
      errors.push(`Trust Assumptions: ${row.assumption}: release impact must not include contradictory release-note failure markers`);
    }
    if (!isBlank(row.evidence) && hasContradictoryReleaseNotesDecisionBinding(row.evidence)) {
      errors.push(`Trust Assumptions: ${row.assumption}: evidence must not include contradictory release-note decision bindings`);
    }
    if (!isBlank(row.releaseImpact) && hasContradictoryReleaseNotesDecisionBinding(row.releaseImpact)) {
      errors.push(`Trust Assumptions: ${row.assumption}: release impact must not include contradictory release-note decision bindings`);
    }
    const evidenceFocus = REQUIRED_TRUST_ASSUMPTION_EVIDENCE_FOCUS[row.assumption];
    if (evidenceFocus && !evidenceFocus.pattern.test(row.evidence)) {
      errors.push(`Trust Assumptions: ${row.assumption}: ${evidenceFocus.message}`);
    }
    if (isBlank(row.releaseImpact)) errors.push(`Trust Assumptions: ${row.assumption}: release impact is required`);
    const claimText = `${row.currentStatus} ${row.releaseImpact}`;
    if (hasAbsoluteSecurityClaim(claimText)) {
      errors.push(`Trust Assumptions: ${row.assumption}: absolute security wording is not allowed in release notes`);
    }
    errors.push(...validateReleaseNoteProductionClaimBoundary(
      `Trust Assumptions: ${row.assumption}`,
      claimText,
      releaseLevel,
      evidenceRows,
      blockerRows,
    ));
  }

  return errors;
}

function validateBlockerRows(
  rows: PublicationBlockerRow[],
  evidenceRows: RequiredEvidenceRow[],
  classification: Map<string, string>,
): string[] {
  const errors: string[] = [];
  const releaseLevel = classification.get('Release level') ?? '';
  const decision = classification.get('Decision') ?? '';
  const evidenceByClass = new Map(evidenceRows.map(row => [row.evidenceClass, row]));

  if (releaseLevel !== 'production deployment candidate' && rows.length === 0) {
    errors.push('Publication Blockers: non-production release notes must copy unresolved checklist blockers');
  }
  errors.push(...validateRequiredBlockerRows(rows));

  for (const row of rows) {
    const isRequiredBlocker = REQUIRED_PUBLICATION_BLOCKER_ITEMS.has(row.blocker);
    const requiredBlocker = REQUIRED_PUBLICATION_BLOCKER_BY_ITEM.get(row.blocker);
    const hasRequiredResolutionMarker = hasEvidenceMarker(row.requiredResolution);
    const hasCompletedEvidence = hasCompletedReleaseNotesRowEvidenceMarker(row.requiredResolution);

    if (isBlank(row.gate)) errors.push('Publication Blockers: gate is required');
    if (isBlank(row.blocker)) errors.push(`Publication Blockers: ${row.gate || '<blank>'}: blocker is required`);
    if (!ALLOWED_BLOCKER_STATUSES.has(row.status)) {
      errors.push(`Publication Blockers: ${row.gate || '<blank>'}: status must be Pending evidence, Open blocker, or Checked`);
    }
    if (
      requiredBlocker &&
      ALLOWED_BLOCKER_STATUSES.has(row.status) &&
      row.status !== 'Checked' &&
      row.status !== requiredBlocker.unresolvedStatus
    ) {
      errors.push(
        `Publication Blockers: ${row.blocker}: unresolved required blocker row must use ${requiredBlocker.unresolvedStatus} status until checked`,
      );
    }
    if (isBlank(row.requiredResolution)) {
      errors.push(`Publication Blockers: ${row.gate || '<blank>'}: required resolution is required`);
    }
    if (!isBlank(row.requiredResolution) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.requiredResolution)) {
      errors.push(
        `Publication Blockers: ${row.blocker || '<blank>'}: required resolution must not include contradictory release-note failure markers`,
      );
    }
    if (!isBlank(row.requiredResolution) && hasContradictoryReleaseNotesDecisionBinding(row.requiredResolution)) {
      errors.push(
        `Publication Blockers: ${row.blocker || '<blank>'}: required resolution must not include contradictory release-note decision bindings`,
      );
    }
    errors.push(...validateReleaseNotePublicLabelClaimBoundary(
      `Publication Blockers: ${row.blocker || '<blank>'}: blocker name`,
      row.blocker,
    ));
    if (hasAbsoluteSecurityClaim(row.requiredResolution)) {
      errors.push(
        `Publication Blockers: ${row.blocker || '<blank>'}: absolute security wording is not allowed in release notes`,
      );
    }
    errors.push(...validateReleaseNoteProductionClaimBoundary(
      `Publication Blockers: ${row.blocker || '<blank>'}`,
      row.requiredResolution,
      releaseLevel,
      evidenceRows,
      rows,
      {
        allowControlledTestnetProductionClaim:
          row.blocker === 'Technical addendum architecture manual',
      },
    ));
    if (
      row.blocker === 'Trustless burn verification path' &&
      releaseNotesBlockerTextApprovesTrustedFallbackPath(row.requiredResolution)
    ) {
      errors.push(
        'Publication Blockers: Trustless burn verification path: required resolution must not approve trusted fallback paths',
      );
    }
    if (
      row.blocker === 'Committee governance and key-rotation drill' &&
      releaseNotesBlockerTextApprovesGovernanceFallback(row.requiredResolution)
    ) {
      errors.push(
        'Publication Blockers: Committee governance and key-rotation drill: required resolution must not approve single-signer governance or open governance blockers',
      );
    }
    if (
      row.blocker === 'Single, batch, and sharded benchmark evidence' &&
      releaseNotesBlockerTextApprovesBenchmarkClaims(row.requiredResolution)
    ) {
      errors.push(
        'Publication Blockers: Single, batch, and sharded benchmark evidence: required resolution must not approve production throughput or full parallel L1 settlement',
      );
    }
    if (
      row.blocker === 'External integration package review' &&
      releaseNotesBlockerTextApprovesExternalIntegrationClaimEscalation(row.requiredResolution)
    ) {
      errors.push(
        'Publication Blockers: External integration package review: required resolution must not approve mainnet release-readiness or production-ready wording',
      );
    }
    if (isRequiredBlocker && !hasRequiredResolutionMarker) {
      errors.push(
        `Publication Blockers: ${row.blocker || '<blank>'}: required blocker row requires a link, command, or artifact marker`,
      );
    } else if (!isRequiredBlocker && row.status !== 'Checked' && !hasRequiredResolutionMarker) {
      errors.push(
        `Publication Blockers: ${row.blocker || '<blank>'}: unresolved publication blocker requires a link, command, or artifact marker`,
      );
    } else if (row.status === 'Checked' && !hasRequiredResolutionMarker) {
      errors.push(
        `Publication Blockers: ${row.blocker || '<blank>'}: Checked status requires a link, command, or artifact marker`,
      );
    }
    if (row.status === 'Checked' && !hasCompletedEvidence) {
      errors.push(
        `Publication Blockers: ${row.blocker || '<blank>'}: Checked status requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence`,
      );
    }
    if (
      row.status === 'Checked' &&
      !isRequiredBlocker &&
      !hasStructuredCustomPublicationBlockerResolution(row.requiredResolution)
    ) {
      errors.push(
        `Publication Blockers: ${row.blocker || '<blank>'}: Checked custom publication blocker requires structured resolution evidence: validator output, release-notes blocker review with Publication blocker resolved = yes, or reviewer decision with Reviewer decision = approve and Publication blocker resolved = yes; target-only evidence is not enough`,
      );
    }
    const requiredEvidenceClass = REQUIRED_EVIDENCE_CLASS_BY_BLOCKER.get(row.blocker);
    if (
      row.status === 'Checked' &&
      requiredEvidenceClass &&
      evidenceByClass.get(requiredEvidenceClass)?.status !== 'linked'
    ) {
      errors.push(
        `Publication Blockers: ${row.blocker}: Checked blocker requires linked Required Evidence: ${requiredEvidenceClass}`,
      );
    }
    if (requiredBlocker) {
      const missingTerms = requiredBlocker.requiredResolutionTerms.filter(
        term => !containsTerm(row.requiredResolution, term),
      );
      if (missingTerms.length > 0) {
        errors.push(
          `Publication Blockers: ${row.blocker}: required blocker row resolution must mention row-specific evidence terms: ${missingTerms.join(', ')}`,
        );
      }
      errors.push(...validatePublicationUpdateEvidenceTargetSeparation(
        row,
        requiredBlocker.requiredResolutionTerms,
      ));
    }
    if (!ALLOWED_SCOPED_OUT.has(row.scopedOut)) {
      errors.push(`Publication Blockers: ${row.gate || '<blank>'}: scoped out must be yes or no`);
    }
    if (
      requiredBlocker &&
      releaseLevel === 'validated PoC' &&
      row.scopedOut === 'yes' &&
      VALIDATED_POC_NON_SCOPABLE_BLOCKERS.has(row.blocker)
    ) {
      errors.push(
        `Publication Blockers: ${row.blocker}: validated PoC release cannot scope out this required blocker`,
      );
    }
    if (
      requiredBlocker &&
      releaseLevel === 'institutional reference' &&
      row.scopedOut === 'yes' &&
      !INSTITUTIONAL_REFERENCE_SCOPABLE_BLOCKERS.has(row.blocker)
    ) {
      errors.push(
        `Publication Blockers: ${row.blocker}: institutional reference release cannot scope out this required blocker`,
      );
    }
    if (releaseLevel === 'production deployment candidate' && row.status !== 'Checked') {
      errors.push(
        `Publication Blockers: ${row.blocker || '<blank>'}: production deployment candidate requires Checked status`,
      );
    }
    if (releaseLevel === 'production deployment candidate' && row.scopedOut === 'yes') {
      errors.push(
        `Publication Blockers: ${row.blocker || '<blank>'}: production deployment candidate blockers cannot be scoped out`,
      );
    }
  }

  const unresolvedInScopeBlockers = rows.filter(row => row.status !== 'Checked' && row.scopedOut === 'no');
  if (unresolvedInScopeBlockers.length > 0 && decision !== 'blocked') {
    errors.push('Release Classification: Decision must be blocked while unscoped publication blockers remain');
  }

  return errors;
}

function validateRequiredBlockerRows(rows: PublicationBlockerRow[]): string[] {
  const errors: string[] = [];
  const byBlocker = new Map(rows.map(row => [row.blocker, row]));
  const countsByBlocker = new Map<string, number>();

  for (const row of rows) {
    countsByBlocker.set(row.blocker, (countsByBlocker.get(row.blocker) ?? 0) + 1);
  }

  for (const [blocker, count] of countsByBlocker) {
    if (count > 1) {
      errors.push(`Publication Blockers: ${blocker}: duplicate blocker row`);
    }
  }

  for (const required of REQUIRED_PENDING_EVIDENCE_ROWS) {
    const row = byBlocker.get(required.item);
    if (!row) {
      errors.push(`Publication Blockers: ${required.item}: missing required blocker row`);
      continue;
    }
    if (row.gate !== required.gate) {
      errors.push(`Publication Blockers: ${required.item}: expected ${required.gate} but found ${row.gate}`);
    }
  }

  return errors;
}

function validateClaimRows(
  rows: AllowedClaimRow[],
  evidenceRows: RequiredEvidenceRow[],
  blockerRows: PublicationBlockerRow[],
  classification: Map<string, string>,
): string[] {
  const errors: string[] = [];
  const releaseLevel = classification.get('Release level') ?? '';
  const benchmarkEvidenceLinked = hasLinkedCompletedEvidence(
    evidenceRows,
    'Single, batch, and sharded benchmark evidence',
  );
  const trustlessBurnEvidenceLinked = hasLinkedCompletedEvidence(
    evidenceRows,
    'Trustless burn verification evidence',
  );
  const committeeGovernanceEvidenceLinked = hasLinkedCompletedEvidence(
    evidenceRows,
    'Committee governance and key-rotation evidence',
  );
  const threatModelEvidenceLinked = hasLinkedCompletedEvidence(
    evidenceRows,
    'Threat model and evidence matrix',
  );
  const contextExtensionGuardEvidenceLinked = hasLinkedCompletedEvidence(
    evidenceRows,
    'ContextExtension signer resolution or guard',
  );
  const signerDependencyEvidenceLinked = hasLinkedCompletedEvidence(
    evidenceRows,
    'Signer dependency conformance or fail-closed release decision evidence',
  );
  const broadcastGateEvidenceLinked = hasLinkedCompletedEvidence(
    evidenceRows,
    'Broadcast gate evidence',
  );
  const dependencyRiskEvidenceLinked = hasLinkedCompletedEvidence(
    evidenceRows,
    'Dependency risk review evidence',
  );
  const operatorReadinessEvidenceLinked = hasLinkedCompletedEvidence(
    evidenceRows,
    'Operator readiness evidence',
  );
  const externalIntegrationEvidenceLinked = hasLinkedCompletedEvidence(
    evidenceRows,
    'External integration package review',
  );
  const externalIntegrationBlockerChecked = hasCheckedPublicationBlocker(
    blockerRows,
    'External integration package review',
  );
  const backupRestoreEvidenceLinked = hasLinkedCompletedEvidence(
    evidenceRows,
    'SQLite/AVL backup-restore evidence',
  );
  const independentSecurityReviewEvidenceLinked = hasLinkedCompletedEvidence(
    evidenceRows,
    'Independent security review',
  );
  const failedBroadcastRecoveryEvidenceLinked = hasLinkedCompletedEvidence(
    evidenceRows,
    'Failed broadcast phantom AVL recovery drill evidence',
  );
  const failedBroadcastRecoveryEvidenceValidated = hasValidatedRecoveryObserveEvidenceForClass(
    evidenceRows,
    'Failed broadcast phantom AVL recovery drill evidence',
    'failed-broadcast-phantom-avl',
  );
  const reorgedBurnRecoveryEvidenceLinked = hasLinkedCompletedEvidence(
    evidenceRows,
    'Reorged burn and stale singleton recovery drill evidence',
  );
  const reorgedBurnRecoveryEvidenceValidated = hasValidatedRecoveryObserveEvidenceForClass(
    evidenceRows,
    'Reorged burn and stale singleton recovery drill evidence',
    'reorged-burn-stale-singleton',
  );
  const cleanCheckoutEvidenceLinked = hasLinkedCompletedEvidence(
    evidenceRows,
    'Clean checkout CI',
  );
  const localDevnetLifecycleEvidenceLinked = hasLinkedCompletedEvidence(
    evidenceRows,
    'Local devnet lifecycle rehearsal',
  );
  const testnetLifecycleEvidenceValidated = hasValidatedCompletedLiveRehearsalEvidenceForClass(
    evidenceRows,
    'Testnet lifecycle rehearsal',
  );

  for (const row of rows) {
    if (isBlank(row.claim)) errors.push('Allowed Claims: claim is required');
    if (!hasEvidenceMarker(row.evidenceLink)) {
      errors.push(`Allowed Claims: ${row.claim || '<blank>'}: evidence link must be a link, command, or artifact marker`);
    } else if (!hasCompletedReleaseNotesRowEvidenceMarker(row.evidenceLink)) {
      errors.push(
        `Allowed Claims: ${row.claim || '<blank>'}: evidence link must include a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence`,
      );
    }
    if (!isBlank(row.evidenceLink) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.evidenceLink)) {
      errors.push(`Allowed Claims: ${row.claim || '<blank>'}: evidence link must not include contradictory release-note failure markers`);
    }
    if (!isBlank(row.allowedWording) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.allowedWording)) {
      errors.push(`Allowed Claims: ${row.claim || '<blank>'}: allowed wording must not include contradictory release-note failure markers`);
    }
    if (!isBlank(row.evidenceLink) && hasContradictoryReleaseNotesDecisionBinding(row.evidenceLink)) {
      errors.push(`Allowed Claims: ${row.claim || '<blank>'}: evidence link must not include contradictory release-note decision bindings`);
    }
    if (!isBlank(row.allowedWording) && hasContradictoryReleaseNotesDecisionBinding(row.allowedWording)) {
      errors.push(`Allowed Claims: ${row.claim || '<blank>'}: allowed wording must not include contradictory release-note decision bindings`);
    }
    if (!isBlank(row.claim) && !isBlank(row.evidenceLink) && !claimEvidenceIdentifiesClaim(row.claim, row.evidenceLink)) {
      errors.push(`Allowed Claims: ${row.claim}: evidence link must identify the allowed claim`);
    }
    if (
      !isBlank(row.claim) &&
      !isBlank(row.evidenceLink) &&
      hasNegatedAllowedClaimEvidenceLink(row.claim, row.evidenceLink)
    ) {
      errors.push(`Allowed Claims: ${row.claim}: evidence link must not negate the allowed claim`);
    }
    if (isBlank(row.allowedWording)) errors.push(`Allowed Claims: ${row.claim || '<blank>'}: allowed wording is required`);
    if (
      hasControlledTestnetProductionClaim(row.claim, row.evidenceLink, row.allowedWording) &&
      !hasCanonicalControlledTestnetProductionClaim(row.allowedWording)
    ) {
      errors.push(
        `Allowed Claims: ${row.claim || '<blank>'}: allowed wording must use testnet production-candidate or production-grade testnet wording`,
      );
    }
    if (hasAbsoluteSecurityClaim(row.claim, row.allowedWording)) {
      errors.push(`Allowed Claims: ${row.claim}: absolute security wording is not allowed in release notes`);
    }
    errors.push(...validateReleaseNoteProductionClaimBoundary(
      `Allowed Claims: ${row.claim || '<blank>'}`,
      [row.claim, row.evidenceLink, row.allowedWording].join(' '),
      releaseLevel,
      evidenceRows,
      blockerRows,
    ));
    if (hasBenchmarkClaim(row.claim, row.allowedWording) && !benchmarkEvidenceLinked) {
      errors.push(`Allowed Claims: ${row.claim}: throughput, latency, TPS, tx/s, transaction-per-second, or scaling wording requires linked benchmark evidence`);
    }
    if (hasTrustlessBurnClaim(row.claim, row.allowedWording) && !trustlessBurnEvidenceLinked) {
      errors.push(
        `Allowed Claims: ${row.claim}: trustless burn, burn verification, SPV, burn inclusion, phantom burn trust minimization, or sidechain commitment wording requires linked trustless burn evidence`,
      );
    }
    if (hasTrustedBurnCompletionClaim(row.claim, row.allowedWording) && !trustlessBurnEvidenceLinked) {
      errors.push(
        `Allowed Claims: ${row.claim}: trusted burn verification, trusted-oracle burn, or oracle-fallback completion wording requires linked trustless burn evidence`,
      );
    }
    if (hasCommitteeGovernanceClaim(row.claim, row.allowedWording) && !committeeGovernanceEvidenceLinked) {
      errors.push(
        `Allowed Claims: ${row.claim}: committee governance, key-rotation, threshold, or multisig wording requires linked committee governance evidence`,
      );
    }
    if (hasThreatModelClaim(row.claim, row.allowedWording) && !threatModelEvidenceLinked) {
      errors.push(
        `Allowed Claims: ${row.claim}: threat model, evidence matrix, risk-class, attack-chain, or mitigation wording requires linked threat-model/evidence-matrix evidence`,
      );
    }
    if (hasContextExtensionGuardClaim(row.claim, row.allowedWording) && !contextExtensionGuardEvidenceLinked) {
      errors.push(
        `Allowed Claims: ${row.claim}: ContextExtension signer guard, fail-closed guard, or signer resolution wording requires linked ContextExtension signer guard evidence`,
      );
    }
    if (hasSignerDependencyClaim(row.claim, row.allowedWording) && !signerDependencyEvidenceLinked) {
      errors.push(
        `Allowed Claims: ${row.claim}: signer dependency, ContextExtension, sigma-rust, or upstream signer wording requires linked signer dependency evidence`,
      );
    }
    if (hasBroadcastGateClaim(row.claim, row.allowedWording) && !broadcastGateEvidenceLinked) {
      errors.push(
        `Allowed Claims: ${row.claim}: broadcast, broadcast gate, broadcast opt-in, or transaction broadcast wording requires linked broadcast gate evidence`,
      );
    }
    if (hasDependencyRiskClaim(row.claim, row.allowedWording) && !dependencyRiskEvidenceLinked) {
      errors.push(
        `Allowed Claims: ${row.claim}: dependency risk, dependency register, toolchain, lockfile, supply-chain, or vulnerability-triage wording requires linked dependency risk review evidence`,
      );
    }
    if (hasOperatorReadinessClaim(row.claim, row.allowedWording) && !operatorReadinessEvidenceLinked) {
      errors.push(
        `Allowed Claims: ${row.claim}: operator readiness, operationally-ready, ops-ready, runbook, incident, or monitoring wording requires linked operator readiness evidence`,
      );
    }
    if (hasExternalIntegrationClaim(row.claim, row.allowedWording) && !externalIntegrationEvidenceLinked) {
      errors.push(
        `Allowed Claims: ${row.claim}: external integration, third-party integration, integrator-ready, partner-ready, safe-to-publish, publication-approved, release-candidate, fresh checkout, institutional-reference, public release, publication-ready, or private maintainer context wording requires linked external integration evidence`,
      );
    }
    if (
      hasExternalIntegrationClaim(row.claim, row.allowedWording) &&
      externalIntegrationEvidenceLinked &&
      !externalIntegrationBlockerChecked
    ) {
      errors.push(
        `Allowed Claims: ${row.claim}: external integration wording requires Gate 8 publication blocker Checked`,
      );
    }
    if (hasBackupRestoreClaim(row.claim, row.allowedWording) && !backupRestoreEvidenceLinked) {
      errors.push(
        `Allowed Claims: ${row.claim}: backup, restore, disaster recovery, state recovery, SQLite/WAL, or AVL rebuild wording requires linked backup-restore evidence`,
      );
    }
    if (hasSecurityReviewClaim(row.claim, row.allowedWording) && !independentSecurityReviewEvidenceLinked) {
      errors.push(
        `Allowed Claims: ${row.claim}: security review, audit, finding disposition, critical/high, assessment, or penetration-test wording requires linked independent security review evidence`,
      );
    }
    if (hasFailedBroadcastRecoveryClaim(row.claim, row.allowedWording) && !failedBroadcastRecoveryEvidenceLinked) {
      errors.push(
        `Allowed Claims: ${row.claim}: failed broadcast, phantom AVL, or phantom DUP wording requires linked failed-broadcast recovery evidence`,
      );
    }
    if (
      hasFailedBroadcastRecoveryClaim(row.claim, row.allowedWording) &&
      failedBroadcastRecoveryEvidenceLinked &&
      !failedBroadcastRecoveryEvidenceValidated
    ) {
      errors.push(
        `Allowed Claims: ${row.claim}: failed broadcast, phantom AVL, or phantom DUP wording requires linked failed-broadcast recovery evidence with validated recovery-observe JSON`,
      );
    }
    if (hasReorgedBurnRecoveryClaim(row.claim, row.allowedWording) && !reorgedBurnRecoveryEvidenceLinked) {
      errors.push(
        `Allowed Claims: ${row.claim}: reorged burn or stale singleton wording requires linked reorg/stale-singleton recovery evidence`,
      );
    }
    if (
      hasReorgedBurnRecoveryClaim(row.claim, row.allowedWording) &&
      reorgedBurnRecoveryEvidenceLinked &&
      !reorgedBurnRecoveryEvidenceValidated
    ) {
      errors.push(
        `Allowed Claims: ${row.claim}: reorged burn or stale singleton wording requires linked reorg/stale-singleton recovery evidence with validated recovery-observe JSON`,
      );
    }
    if (hasCleanCheckoutClaim(row.claim, row.allowedWording) && !cleanCheckoutEvidenceLinked) {
      errors.push(
        `Allowed Claims: ${row.claim}: clean checkout, CI, final branch, or workflow wording requires linked clean-checkout evidence`,
      );
    }
    if (hasLocalDevnetLifecycleClaim(row.claim, row.allowedWording) && !localDevnetLifecycleEvidenceLinked) {
      errors.push(
        `Allowed Claims: ${row.claim}: local devnet lifecycle wording requires linked local devnet lifecycle evidence`,
      );
    }
    if (hasTestnetLifecycleClaim(row.claim, row.allowedWording) && !testnetLifecycleEvidenceValidated) {
      errors.push(
        `Allowed Claims: ${row.claim}: testnet lifecycle wording requires completed live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target`,
      );
    }
    if (
      hasGenericLifecycleClaim(row.claim, row.allowedWording) &&
      !localDevnetLifecycleEvidenceLinked &&
      !testnetLifecycleEvidenceValidated
    ) {
      errors.push(
        `Allowed Claims: ${row.claim}: peg-in, peg-out, end-to-end, round-trip, full-lifecycle, submit, confirmation, or reconciliation wording requires linked local devnet lifecycle evidence or completed live testnet lifecycle evidence with rehearsal:validate PASS output bound to the completed rehearsal target`,
      );
    }
    if (
      hasGenericLifecycleClaim(row.claim, row.allowedWording) &&
      !hasLocalDevnetLifecycleClaim(row.claim, row.allowedWording) &&
      !hasTestnetLifecycleClaim(row.claim, row.allowedWording) &&
      (localDevnetLifecycleEvidenceLinked || testnetLifecycleEvidenceValidated) &&
      !(localDevnetLifecycleEvidenceLinked && testnetLifecycleEvidenceValidated)
    ) {
      errors.push(
        `Allowed Claims: ${row.claim}: generic lifecycle wording must be explicitly scoped to local devnet or testnet unless local devnet lifecycle evidence is linked and completed live testnet lifecycle evidence is validated`,
      );
    }
  }

  return errors;
}

function hasLinkedCompletedEvidence(rows: RequiredEvidenceRow[], evidenceClass: string): boolean {
  const row = rows.find(candidate => candidate.evidenceClass === evidenceClass);
  return row?.status === 'linked' && hasCompletedReleaseNotesRowEvidenceMarker(row.linkOrArtifact);
}

function hasValidatedCompletedLiveRehearsalEvidenceForClass(
  rows: RequiredEvidenceRow[],
  evidenceClass: string,
): boolean {
  const row = rows.find(candidate => candidate.evidenceClass === evidenceClass);
  return (
    row?.status === 'linked' &&
    hasValidatedCompletedLiveRehearsalEvidence(row) &&
    hasValidatedAssemblyReportEvidence(row) &&
    hasValidatedLivePreflightEvidence(row) &&
    hasValidatedFreshCheckpointEvidence(row) &&
    hasValidatedPostSubmitObserveEvidence(row)
  );
}

function hasValidatedRecoveryObserveEvidenceForClass(
  rows: RequiredEvidenceRow[],
  evidenceClass: string,
  expectedKind: ReleaseNotesRecoveryObserveKind,
): boolean {
  const row = rows.find(candidate => candidate.evidenceClass === evidenceClass);
  return row?.status === 'linked' && hasValidatedRecoveryObserveEvidence(row, expectedKind);
}

function hasCheckedPublicationBlocker(rows: PublicationBlockerRow[], blocker: string): boolean {
  return rows.some(row => row.blocker === blocker && row.status === 'Checked' && row.scopedOut === 'no');
}

function validateDisallowedClaims(markdown: string): string[] {
  const section = sectionBetween(markdown, '## Disallowed Claims Check', '## Operator Impact');
  const errors: string[] = [];

  for (const claim of REQUIRED_DISALLOWED_CLAIMS) {
    const escaped = escapeRegExp(claim);
    if (!new RegExp(`^- \\[x\\] ${escaped}$`, 'im').test(section)) {
      errors.push(`Disallowed Claims Check: "${claim}" must be checked`);
    }
  }

  return errors;
}

function validateOperatorRows(
  rows: OperatorImpactRow[],
  classification: Map<string, string>,
  evidenceRows: RequiredEvidenceRow[],
  blockerRows: PublicationBlockerRow[],
): string[] {
  const errors = validateRequiredNames('Operator Impact', rows.map(row => row.area), REQUIRED_OPERATOR_AREAS);
  const releaseLevel = classification.get('Release level') ?? '';

  for (const row of rows) {
    if (!REQUIRED_OPERATOR_AREAS.includes(row.area)) {
      errors.push(`Operator Impact: ${row.area}: unexpected area`);
    }
    if (isBlank(row.requiredOperatorAction)) {
      errors.push(`Operator Impact: ${row.area}: required operator action is required`);
    } else if (!isActionableOperatorAction(row.requiredOperatorAction)) {
      errors.push(
        `Operator Impact: ${row.area}: required operator action must reference a runbook, command, verification, monitoring, backup, or incident action`,
      );
    }
    if (!isBlank(row.requiredOperatorAction) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.requiredOperatorAction)) {
      errors.push(`Operator Impact: ${row.area}: required operator action must not include contradictory release-note failure markers`);
    }
    if (!isBlank(row.requiredOperatorAction) && hasContradictoryReleaseNotesDecisionBinding(row.requiredOperatorAction)) {
      errors.push(`Operator Impact: ${row.area}: required operator action must not include contradictory release-note decision bindings`);
    }
    if (isBlank(row.stopCondition)) {
      errors.push(`Operator Impact: ${row.area}: stop condition is required`);
    } else if (!isActionableStopCondition(row.stopCondition)) {
      errors.push(
        `Operator Impact: ${row.area}: stop condition must include actionable stop, block, fail, disable, pause, incident, mismatch, do-not, or refuse wording`,
      );
    }
    if (!isBlank(row.stopCondition) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.stopCondition)) {
      errors.push(`Operator Impact: ${row.area}: stop condition must not include contradictory release-note failure markers`);
    }
    if (!isBlank(row.stopCondition) && hasContradictoryReleaseNotesDecisionBinding(row.stopCondition)) {
      errors.push(`Operator Impact: ${row.area}: stop condition must not include contradictory release-note decision bindings`);
    }
    const impactFocus = REQUIRED_OPERATOR_IMPACT_FOCUS[row.area];
    if (
      impactFocus &&
      !isBlank(row.requiredOperatorAction) &&
      !isBlank(row.stopCondition) &&
      !impactFocus.pattern.test(`${row.requiredOperatorAction} ${row.stopCondition}`)
    ) {
      errors.push(`Operator Impact: ${row.area}: ${impactFocus.message}`);
    }
    const claimText = `${row.requiredOperatorAction} ${row.stopCondition}`;
    if (hasAbsoluteSecurityClaim(claimText)) {
      errors.push(`Operator Impact: ${row.area}: absolute security wording is not allowed in release notes`);
    }
    errors.push(...validateReleaseNoteProductionClaimBoundary(
      `Operator Impact: ${row.area}`,
      claimText,
      releaseLevel,
      evidenceRows,
      blockerRows,
    ));
  }

  return errors;
}

function validateSignoffRows(
  rows: ReleaseSignoffRow[],
  classification: Map<string, string>,
  evidenceRows: RequiredEvidenceRow[],
  blockerRows: PublicationBlockerRow[],
): string[] {
  const errors = validateRequiredNames('Sign-Off', rows.map(row => row.role), REQUIRED_SIGNOFF_ROLES);
  const decisionOwner = classification.get('Decision owner') ?? '';
  const decisionDate = classification.get('Decision date') ?? '';
  const releaseLevel = classification.get('Release level') ?? '';
  const maintainerSignoff = rows.find(row => row.role === 'Maintainer');

  for (const row of rows) {
    if (!REQUIRED_SIGNOFF_ROLES.includes(row.role)) {
      errors.push(`Sign-Off: ${row.role}: unexpected role`);
    }
    if (isBlank(row.name)) errors.push(`Sign-Off: ${row.role}: name is required`);
    if (!ALLOWED_SIGNOFF_DECISIONS.has(row.decision as SignoffDecision)) {
      errors.push(`Sign-Off: ${row.role}: decision must be approve or block`);
    } else if (row.decision !== 'approve') {
      errors.push(`Sign-Off: ${row.role}: decision must be approve before release notes can pass`);
    }
    if (isBlank(row.date)) {
      errors.push(`Sign-Off: ${row.role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      errors.push(`Sign-Off: ${row.role}: date must use YYYY-MM-DD`);
    } else if (isIsoCalendarDate(decisionDate) && row.date < decisionDate) {
      errors.push(`Sign-Off: ${row.role}: date must not be before Release Classification Decision date`);
    }
    if (isBlank(row.notes)) {
      errors.push(`Sign-Off: ${row.role}: notes are required`);
    } else if (!isActionableReleaseSignoffNote(row.notes)) {
      errors.push(`Sign-Off: ${row.role}: notes must state a concrete release-note claim-control outcome`);
    }
    if (!isBlank(row.notes) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.notes)) {
      errors.push(`Sign-Off: ${row.role}: notes must not include contradictory release-note failure markers`);
    }
    if (!isBlank(row.notes) && hasContradictoryReleaseNotesDecisionBinding(row.notes)) {
      errors.push(`Sign-Off: ${row.role}: notes must not include contradictory release-note decision bindings`);
    }
    if (hasAbsoluteSecurityClaim(row.notes)) {
      errors.push(`Sign-Off: ${row.role}: absolute security wording is not allowed in release notes`);
    }
    if (releaseNoteSignoffAdmitsPrivateMaintainerContext(row.notes)) {
      errors.push(`Sign-Off: ${row.role}: notes must not admit private maintainer context`);
    }
    errors.push(...validateReleaseNoteProductionClaimBoundary(
      `Sign-Off: ${row.role}`,
      row.notes,
      releaseLevel,
      evidenceRows,
      blockerRows,
    ));
    const noteFocus = REQUIRED_SIGNOFF_NOTE_FOCUS[row.role];
    if (noteFocus && !isBlank(row.notes) && !noteFocus.pattern.test(row.notes)) {
      errors.push(`Sign-Off: ${row.role}: ${noteFocus.message}`);
    }
  }

  if (
    maintainerSignoff &&
    !isBlank(maintainerSignoff.name) &&
    !isBlank(decisionOwner) &&
    maintainerSignoff.name.trim() !== decisionOwner.trim()
  ) {
    errors.push('Sign-Off: Maintainer: name must match Release Classification Decision owner');
  }

  return errors;
}

function releaseNoteSignoffAdmitsPrivateMaintainerContext(value: string): boolean {
  const approval = releaseNoteSignoffApprovalTerms();
  return releaseNoteSignoffSegments(value).some(segment => {
    if (releaseNoteSignoffConfirmsNoPrivateMaintainerContext(segment)) return false;
    return (
      /\bprivate maintainer context used yes\b/.test(segment) ||
      new RegExp(`\\bprivate (?:maintainer )?context\\b(?:\\s+[a-z0-9]+){0,3}\\s+${approval}\\b`).test(segment) ||
      new RegExp(`\\b${approval}\\b(?:\\s+[a-z0-9]+){0,2}\\s+private (?:maintainer )?context\\b`).test(segment) ||
      /\b(?:used|provided|required|needed|available|relied|relies)\s+private (?:maintainer )?context\b/.test(segment) ||
      /\bprivate (?:maintainer )?context\s+(?:was\s+)?(?:used|provided|required|needed|available|relied)\b/.test(segment)
    );
  });
}

function releaseNoteSignoffSegments(value: string): string[] {
  return value
    .split(/[.;|\r\n]+/)
    .map(segment => normalizeEvidenceMarkerText(segment).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(segment => segment.length > 0);
}

function releaseNoteSignoffConfirmsNoPrivateMaintainerContext(value: string): boolean {
  return (
    /\bprivate maintainer context used no\b/.test(value) ||
    /\bno private (?:maintainer )?context\b/.test(value) ||
    /\bwithout private (?:maintainer )?context\b/.test(value) ||
    /\bprivate (?:maintainer )?context (?:absent|not used|unused|blocked|forbidden|not allowed|denied)\b/.test(value)
  );
}

function releaseNoteSignoffApprovalTerms(): string {
  return '(?:accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|support|supported|supports|permit|permitted|permits|clear|cleared|clears|enable|enabled|enables|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits)';
}

function validateReleaseNoteProductionClaimBoundary(
  prefix: string,
  text: string,
  releaseLevel: string,
  evidenceRows: RequiredEvidenceRow[],
  blockerRows: PublicationBlockerRow[],
  options: { allowControlledTestnetProductionClaim?: boolean } = {},
): string[] {
  const errors: string[] = [];
  const claim = classifyPublicationClaimText(text);
  const uncheckedClaim = options.allowControlledTestnetProductionClaim
    ? classifyPublicationClaimText(stripControlledTestnetProductionClaimTerms(text))
    : claim;

  if (claim.hasMainnetProductionClaim) {
    errors.push(`${prefix}: ${MAINNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (claim.hasProductionReadyClaim) {
    errors.push(`${prefix}: ${CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (claim.hasControlledTestnetProductionClaim && !options.allowControlledTestnetProductionClaim) {
    if (releaseLevel !== 'production deployment candidate') {
      errors.push(`${prefix}: ${PRODUCTION_CLAIM_EVIDENCE_ERROR}`);
    } else {
      errors.push(...controlledTestnetProductionPrerequisiteErrors(prefix, evidenceRows, blockerRows));
    }
  }
  if (
    releaseLevel === 'production deployment candidate' &&
    uncheckedClaim.hasProductionClaim &&
    !uncheckedClaim.hasControlledTestnetProductionClaim
  ) {
    errors.push(`${prefix}: ${CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (releaseLevel !== 'production deployment candidate' && uncheckedClaim.hasProductionClaim) {
    errors.push(`${prefix}: ${PRODUCTION_CLAIM_EVIDENCE_ERROR}`);
  }

  return [...new Set(errors)];
}

function stripControlledTestnetProductionClaimTerms(value: string): string {
  return value
    .replace(/\btest[- ]?net[-\s]+production[- ]candidate\b/gi, '')
    .replace(/\bproduction[- ]candidate[-\s]+test[- ]?net\b/gi, '')
    .replace(/\bproduction[- ]grade[-\s]+test[- ]?net\b/gi, '')
    .replace(/\btest[- ]?net[-\s]+production[- ]grade\b/gi, '');
}

function validateReleaseNotePublicLabelClaimBoundary(prefix: string, text: string): string[] {
  const claim = classifyPublicationClaimText(text);
  const errors: string[] = [];

  if (claim.hasMainnetProductionClaim) {
    errors.push(`${prefix}: ${MAINNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (claim.hasProductionReadyClaim) {
    errors.push(`${prefix}: ${CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (claim.hasProductionClaim && !claim.hasMainnetProductionClaim && !claim.hasProductionReadyClaim) {
    errors.push(`${prefix}: ${PRODUCTION_CLAIM_EVIDENCE_ERROR}`);
  }

  return [...new Set(errors)];
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
    /(?:^|\s)artifact:\/\//.test(value)
  );
}

function hasCompletedEvidenceMarker(value: string): boolean {
  return !hasLocalOnlyEvidenceTarget(value) &&
    extractCompletedEvidenceTargets(value).some(isCompletedEvidenceTarget);
}

function hasCompletedReleaseNotesRowEvidenceMarker(value: string): boolean {
  return !hasLocalOnlyEvidenceTarget(value) &&
    extractCompletedReleaseNotesRowEvidenceTargets(value).some(isCompletedEvidenceTarget);
}

function hasStructuredCustomPublicationBlockerResolution(value: string): boolean {
  return releaseEvidenceSegments(value).some(segment => {
    if (!hasCompletedReleaseNotesRowEvidenceMarker(segment) || hasContradictoryReleaseNotesEvidenceMarker(segment)) {
      return false;
    }

    return (
      hasPositiveCustomPublicationBlockerValidatorOutput(segment) ||
      hasReleaseNotesPublicationBlockerReview(segment) ||
      hasReviewerPublicationBlockerDecision(segment)
    );
  });
}

function hasPositiveCustomPublicationBlockerValidatorOutput(segment: string): boolean {
  return (
    /\bnpm(?:\.cmd)?\s+run\s+[A-Za-z0-9:_-]*validate\b/i.test(segment) &&
    /\b(?:command output|output|log|transcript|validation output|validator output)\b/i.test(segment) &&
    hasPositiveEvidenceSegment(segment)
  );
}

function hasReleaseNotesPublicationBlockerReview(segment: string): boolean {
  return (
    /\brelease[- ]notes?\b/i.test(segment) &&
    /\bpublication blockers?\b/i.test(segment) &&
    /\b(?:review|validated|validation)\b/i.test(segment) &&
    hasStructuredPublicationBlockerResolution(segment)
  );
}

function hasReviewerPublicationBlockerDecision(segment: string): boolean {
  return (
    /\bpublication blockers?\b/i.test(segment) &&
    /\breviewer(?:\s+(?:decision|approval|sign[- ]off|review))?\b/i.test(segment) &&
    /\breviewer decision\s*=\s*approve[ \t]*(?:$|[.;,|)\]\r\n])/i.test(segment) &&
    hasStructuredPublicationBlockerResolution(segment)
  );
}

function hasStructuredPublicationBlockerResolution(segment: string): boolean {
  return /\bpublication blockers?\s+resolved\s*=\s*yes[ \t]*(?:$|[.;,|)\]\r\n])/i.test(segment);
}

function validatePublicationUpdateEvidenceTargetSeparation(
  row: PublicationBlockerRow,
  requiredResolutionTerms: readonly string[],
): string[] {
  if (!requiredResolutionTerms.some(isDistinctPublicationUpdateTargetRequiredTerm)) return [];

  const releaseNoteTerms = requiredResolutionTerms.filter(isReleaseNoteUpdateRequiredTerm);
  const checklistTerms = requiredResolutionTerms.filter(isChecklistUpdateRequiredTerm);
  if (releaseNoteTerms.length === 0 || checklistTerms.length === 0) return [];

  const releaseNoteTargets = extractCompletedPublicationUpdateTargets(row.requiredResolution, releaseNoteTerms);
  const checklistTargets = extractCompletedPublicationUpdateTargets(row.requiredResolution, checklistTerms);
  if (releaseNoteTargets.size === 0 || checklistTargets.size === 0) return [];

  const reusedTarget = [...releaseNoteTargets].some(target => checklistTargets.has(target));
  return reusedTarget
    ? [`Publication Blockers: ${row.blocker}: release-note/checklist publication-update evidence targets must be distinct`]
    : [];
}

function isReleaseNoteUpdateRequiredTerm(term: string): boolean {
  if (isDistinctPublicationUpdateTargetRequiredTerm(term)) return false;
  return /release-note update evidence|release-note updates/i.test(term);
}

function isChecklistUpdateRequiredTerm(term: string): boolean {
  if (isDistinctPublicationUpdateTargetRequiredTerm(term)) return false;
  return /checklist update evidence|checklist updates/i.test(term);
}

function isDistinctPublicationUpdateTargetRequiredTerm(term: string): boolean {
  if (/external review/i.test(term)) return false;
  return (
    /distinct completed/i.test(term) &&
    /update evidence targets/i.test(term) &&
    (/release-note\/checklist/i.test(term) || /checklist\/release-note/i.test(term))
  );
}

function extractCompletedPublicationUpdateTargets(value: string, terms: readonly string[]): Set<string> {
  const targets = new Set<string>();

  for (const term of terms) {
    for (const target of extractPublicationUpdateTargetsBoundToTerm(value, term)) {
      if (isCompletedEvidenceTarget(target)) targets.add(normalizeCompletedEvidenceTarget(target));
    }
  }

  return targets;
}

function extractPublicationUpdateTargetsBoundToTerm(value: string, term: string): string[] {
  const targetPattern = '(artifact:\\/\\/[A-Za-z0-9][A-Za-z0-9._-]*\\/[^\\s),;|]+|\\[[^\\]]+\\]\\([^)]+\\))';
  const termBeforeTarget = new RegExp(`${escapeRegExp(term)}[^;|\\n]{0,160}?${targetPattern}`, 'gi');
  const targets = [...value.matchAll(termBeforeTarget)]
    .map(([, target]) => releaseNotesTargetFromToken(target));

  for (const segment of releaseEvidenceSegments(value)) {
    if (!containsTerm(segment, term) || /\b(?:evidence\s+)?covering\b/i.test(segment)) continue;
    targets.push(...extractCompletedReleaseNotesRowEvidenceTargets(segment));
  }

  return targets;
}

function releaseNotesTargetFromToken(token: string): string {
  const markdownTarget = token.match(/^\[[^\]]+\]\(([^)]+)\)$/);
  return (markdownTarget?.[1] ?? token).trim();
}

function extractCompletedEvidenceTargets(value: string): string[] {
  return [
    ...[...value.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+)/g)].map(([, target]) => target),
    ...[...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(([, target]) => target.trim()),
  ];
}

function extractCompletedReleaseNotesRowEvidenceTargets(value: string): string[] {
  const bareTargets = [...value.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+)/g)]
    .filter(match => !hasReleaseNotesValidationTargetPrefix(value, match.index ?? 0))
    .map(([, target]) => target);
  const linkedTargets = [...value.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)]
    .filter(([, label]) => !isReleaseNotesValidationTargetBinding(label))
    .map(([, , target]) => target.trim());
  return [...bareTargets, ...linkedTargets];
}

function hasReleaseNotesValidationTargetPrefix(value: string, targetMatchIndex: number): boolean {
  return isReleaseNotesValidationTargetBinding(value.slice(Math.max(0, targetMatchIndex - 80), targetMatchIndex));
}

function isReleaseNotesValidationTargetBinding(value: string): boolean {
  return /\brelease[- ]notes?\s+(?:validate|validation)\s+target\b/i.test(value);
}

function isCompletedEvidenceTarget(target: string): boolean {
  const normalizedTarget = normalizeCompletedEvidenceTarget(target);
  return (
    !/-template\.md(?:[#?].*)?$/i.test(normalizedTarget) &&
    !/\b(?:not[-_ ]completed|uncompleted)\b/i.test(normalizedTarget) &&
    !hasForbiddenCompletedEvidenceTarget(normalizedTarget) &&
    !isLocalOnlyEvidenceTarget(normalizedTarget) &&
    !isSensitiveOrRuntimeReleaseNotesEvidenceTarget(normalizedTarget) &&
    !hasNonConcreteEvidenceTargetSegment(normalizedTarget)
  );
}

function normalizeCompletedEvidenceTarget(target: string): string {
  return target.trim().replace(/[),.;]+$/g, '').toLowerCase();
}

function hasLocalOnlyEvidenceTarget(value: string): boolean {
  const normalized = normalizeReleaseNotesLocalTargetInspectionValue(value);
  return evidenceTargetInspectionVariants(normalized).some(hasLocalOnlyEvidenceInspectionText);
}

function hasLocalOnlyEvidenceInspectionText(normalized: string): boolean {
  return hasEvidenceLocalOnlyInspectionReference(normalized);
}

function isLocalOnlyEvidenceTarget(value: string): boolean {
  const normalized = normalizeReleaseNotesLocalTargetInspectionValue(value);
  return evidenceTargetInspectionVariants(normalized).some(isLocalOnlyEvidenceInspectionTarget);
}

function normalizeReleaseNotesLocalTargetInspectionValue(value: string): string {
  return value
    .replace(/critical\/high findings open\s*=\s*0/gi, 'critical high findings open = 0')
    .replace(/\\/g, '/')
    .toLowerCase();
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

function isSensitiveOrRuntimeReleaseNotesEvidenceTarget(target: string): boolean {
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(isSensitiveOrRuntimeReleaseNotesEvidenceInspectionTarget);
}

function isSensitiveOrRuntimeReleaseNotesEvidenceInspectionTarget(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasReleaseNotesEnvironmentTargetSegment(normalizedTarget) ||
    hasReleaseNotesRuntimeDatabaseTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalizedTarget, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
  );
}

function hasReleaseNotesEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasReleaseNotesRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function hasForbiddenCompletedEvidenceTarget(target: string): boolean {
  const claim = classifyPublicationClaimText(target);
  return claim.hasProductionClaim;
}

function hasNonConcreteEvidenceTargetSegment(value: string): boolean {
  return normalizeCompletedEvidenceTarget(value)
    .split(/[\\/]+/)
    .some(segment => isNonConcreteEvidenceTargetSegment(segment));
}

function isNonConcreteEvidenceTargetSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])sample(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|release|note|notes|publication|blocker|blockers|required|allowed|claim|claims|trust|assumption|assumptions|checklist|gate|row|rows)|$)/i.test(normalized) ||
    /(?:^|[-_.])example(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|validator|release|note|notes|publication|blocker|blockers|required|allowed|claim|claims|trust|assumption|assumptions|checklist|gate|row|rows)|$)/i.test(normalized)
  );
}

function hasUpstreamSignerConformanceEvidence(rows: RequiredEvidenceRow[]): boolean {
  const row = rows.find(candidate => candidate.evidenceClass === 'Signer dependency conformance or fail-closed release decision evidence');
  if (row?.status !== 'linked' || !hasCompletedEvidenceMarker(row.linkOrArtifact)) return false;

  const text = `${row.linkOrArtifact} ${row.publicationEffect}`;
  if (hasNegatedUpstreamSignerConformanceEvidence(text)) return false;

  return hasResolvedUpstreamSignerBlocker(text) && hasPositiveUpstreamSignerConformanceEvidence(text);
}

function hasResolvedUpstreamSignerBlocker(text: string): boolean {
  return /upstream[- ]signer[- ]blocker[- ]resolved\s*=\s*yes/i.test(text);
}

function hasPositiveUpstreamSignerConformanceEvidence(text: string): boolean {
  const conformanceTarget =
    '(?:upstream[- ]signer[- ]release[- ]validation|jvm\\/node[- ]conformance|jvm[- ]node[- ]conformance|golden[- ]vectors|live\\s+\\/transactions\\/check)';
  const positiveEvidence = '(?:linked|validated|verified|passed|pass|positive|complete|completed|green)';

  return new RegExp(`${conformanceTarget}.{0,120}\\b${positiveEvidence}\\b`, 'i').test(text) ||
    new RegExp(`\\b${positiveEvidence}\\b.{0,120}${conformanceTarget}`, 'i').test(text);
}

function hasNegatedUpstreamSignerConformanceEvidence(text: string): boolean {
  const conformanceTarget =
    '(?:upstream[- ]signer|jvm\\/node|jvm[- ]node|conformance|golden[- ]vectors|transactions\\/check|release[- ]validation)';
  const negativeEvidence = '(?:missing|unavailable|unverified|not\\s+validated|not\\s+verified|not\\s+linked|absent|unresolved)';
  const qualifiedNegativeEvidence =
    '(?:not[-\\s]+yet[-\\s]+(?:validated|verified|linked)|not[-\\s]+fully[-\\s]+(?:validated|verified|linked)|not\\s+completely\\s+(?:validated|verified|linked)|partially\\s+(?:validated|verified|linked))';

  return /upstream[- ]signer[- ]blocker[- ]resolved\s*=\s*no/i.test(text) ||
    new RegExp(`${conformanceTarget}.{0,120}\\b${negativeEvidence}\\b`, 'i').test(text) ||
    new RegExp(`\\b${negativeEvidence}\\b.{0,120}${conformanceTarget}`, 'i').test(text) ||
    new RegExp(`${conformanceTarget}.{0,120}\\b${qualifiedNegativeEvidence}\\b`, 'i').test(text) ||
    new RegExp(`\\b${qualifiedNegativeEvidence}\\b.{0,120}${conformanceTarget}`, 'i').test(text);
}

function hasBenchmarkClaim(...values: string[]): boolean {
  return /\b(throughput|latency|scaling|scale|tps|tx\/s|transactions?\s+per\s+second|settlements\/s|settlements per second)\b/i.test(values.join(' '));
}

function hasTrustlessBurnClaim(...values: string[]): boolean {
  const text = values.join(' ');
  return (
    /\b(trustless[- ]burn|burn[- ]verification|burn[- ]inclusion|spv|sidechain[- ]commitment|commitment[- ]proof|burn[- ]proof)\b/i.test(text) ||
    /\bphantom[- ]burn\b.{0,60}\btrust[- ]minimi[sz]ation\b/i.test(text) ||
    /\btrust[- ]minimi[sz]ation\b.{0,60}\bphantom[- ]burn\b/i.test(text)
  );
}

function hasTrustedBurnCompletionClaim(...values: string[]): boolean {
  return /(trusted[- ]burn[- ]verification|trusted[- ]oracle[- ]burn|trusted[- ]oracle[- ]fallback|oracle[- ]burn|burn[- ]interpretation|trusted[- ]burn).{0,80}\b(solved|resolved|closed|complete|completed|removed|eliminated|no[- ]longer[- ]trusted|trustless)\b/i.test(
    values.join(' '),
  );
}

function releaseNotesBlockerTextApprovesTrustedFallbackPath(value: string): boolean {
  const subject =
    '(?:transitional trusted burn path(?: handling)?|trusted burn path(?: handling)?|trusted oracle fallback|oracle fallback|trusted fallback)';
  const approval =
    '(?:accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|enable|enabled|enables|support|supported|supports|permit|permitted|permits|clear|cleared|clears|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits|use as trustless|used as trustless|uses as trustless)';

  return releaseNotesBlockerTextApprovesSubject(value, subject, approval);
}

function releaseNotesBlockerTextApprovesGovernanceFallback(value: string): boolean {
  const subject =
    '(?:open governance blockers?|open governance blocker handling|governance blockers?|single signer (?:governance|authority|signer path|fallback)|single signer fallback|single signer)';
  const approval =
    '(?:accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|enable|enabled|enables|support|supported|supports|permit|permitted|permits|clear|cleared|clears|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits)';

  return releaseNotesBlockerTextApprovesSubject(value, subject, approval);
}

function releaseNotesBlockerTextApprovesBenchmarkClaims(value: string): boolean {
  const subject =
    '(?:production throughput claim handling|production throughput claims?|broader benchmark throughput|benchmark throughput|' +
    'production throughput(?:\\s+claim)?\\s+(?:allowed|handling|control)|full parallel l1 settlement(?:\\s+(?:claims?|claim handling))?)';
  const approval =
    '(?:yes|accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|enable|enabled|enables|support|supported|supports|permit|permitted|permits|clear|cleared|clears|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits)';

  return releaseNotesBlockerTextApprovesSubject(value, subject, approval);
}

function releaseNotesBlockerTextApprovesExternalIntegrationClaimEscalation(value: string): boolean {
  const subject =
    '(?:mainnet release readiness(?:\\s+claims?)?|production ready(?:\\s+(?:wording|claims?))?|' +
    'mainnet production(?:\\s+(?:wording|claims?))?)';
  const approval =
    '(?:accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|enable|enabled|enables|support|supported|supports|permit|permitted|permits|clear|cleared|clears|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits)';

  return releaseNotesBlockerTextApprovesSubject(value, subject, approval);
}

function releaseNotesBlockerTextApprovesSubject(value: string, subject: string, approval: string): boolean {
  return normalizeReleaseNotesBlockerSegments(value).some(segment => {
    const positiveSegment = stripReleaseNotesApprovalNegations(segment, subject, approval);
    const denialOrBoundaryTerm =
      '(?:but|however|though|although|except|unless|not|no|never|without|absence|absent|lack|lacks|lacking)';
    const subjectApprovalConnector =
      `(?:\\s+(?!\\b${denialOrBoundaryTerm}\\b)[a-z0-9]+){0,3}`;
    const approvalSubjectConnector =
      `(?:\\s+(?!\\b${denialOrBoundaryTerm}\\b)[a-z0-9]+){0,2}`;

    return [
      new RegExp(`\\b${subject}\\b${subjectApprovalConnector}\\s+${approval}\\b`, 'gi'),
      new RegExp(`\\b${approval}\\b${approvalSubjectConnector}\\s+${subject}\\b`, 'gi'),
    ].some(pattern => hasUnnegatedReleaseNotesBlockerApproval(positiveSegment, pattern));
  });
}

function hasUnnegatedReleaseNotesBlockerApproval(normalized: string, pattern: RegExp): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 32), index);
    if (!/\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?\s+$/.test(prefix)) return true;
  }
  return false;
}

function normalizeReleaseNotesBlockerSegments(value: string): string[] {
  return value
    .split(/[\n\r|;,]+|[.]\s+/)
    .map(segment => normalizeEvidenceMarkerText(segment).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(segment => segment.length > 0);
}

function stripReleaseNotesApprovalNegations(segment: string, subject: string, approval: string): string {
  return segment
    .replace(new RegExp(`\\b(?:do not|does not|must not|not to|never)\\s+${approval}\\b(?:\\s+[a-z0-9]+){0,2}\\s+${subject}\\b(?:\\s+wording)?`, 'gi'), ' ')
    .replace(new RegExp(`\\b${subject}\\b(?:\\s+[a-z0-9]+){0,2}\\s+(?:not|never)\\s+${approval}\\b`, 'gi'), ' ')
    .replace(new RegExp(`\\b${subject}\\b(?:\\s+[a-z0-9]+){0,2}\\s+${approval}\\b\\s+(?:no|false|0|blocked|forbidden|disabled|rejected|refused|not\\s+allowed)\\b`, 'gi'), ' ');
}

function hasCommitteeGovernanceClaim(...values: string[]): boolean {
  return /\b(committee|governance|key[- ]rotation|rotation[- ]drill|committee[- ]threshold|signing[- ]threshold|multisig|multi[- ]sig|atLeast)\b/i.test(
    values.join(' '),
  );
}

function hasThreatModelClaim(...values: string[]): boolean {
  return /\b(threat[- ]model|evidence[- ]matrix|security[- ]evidence[- ]matrix|risk[- ]class|attack[- ]chain|mitigation[- ]matrix|threat[- ]assumption|risk[- ]mitigation)\b/i.test(
    values.join(' '),
  );
}

function hasContextExtensionGuardClaim(...values: string[]): boolean {
  return /\b(context[- ]extension|ContextExtension|context[- ]extension[- ]guard|signer[- ]resolution|signer[- ]guard|guard[- ]fail[- ]closed|fail[- ]closed[- ]guard|fail[- ]closed[- ]signer|context[- ]extension[- ]consensus)\b/i.test(
    values.join(' '),
  );
}

function hasSignerDependencyClaim(...values: string[]): boolean {
  return /(signer[- ]dependency|context[- ]extension|ContextExtension|sigma[- ]rust|ergo-lib-wasm-nodejs|upstream[- ]signer|signer[- ]consensus|signer[- ]release|signer[- ]conformance|JVM\/node|transactions\/check|serializer|serialization|signer[^.]{0,40}fail[- ]closed|fail[- ]closed[^.]{0,40}signer)/i.test(
    values.join(' '),
  );
}

function hasBroadcastGateClaim(...values: string[]): boolean {
  return /\b(broadcast|broadcast[- ]gate|broadcast[- ]opt[- ]in|broadcast[- ]mode|broadcast[- ]policy|broadcast[- ]surface|transaction[- ]broadcast|node[- ]broadcast|sign[- ]and[- ]submit|submit[- ]transaction|transaction[- ]submit)\b|signAndSubmit/i.test(
    values.join(' '),
  );
}

function hasDependencyRiskClaim(...values: string[]): boolean {
  return /\b(dependency[- ]risk|dependency[- ]review|dependency[- ]register|risk[- ]register|dependency[- ]risk[- ]register|supply[- ]chain|toolchain[- ]pinning|toolchain[- ]risk|npm[- ]lockfile|package[- ]lock(?:\.json)?|cargo[- ]lock|lockfile[- ]review|vulnerability[- ]triage|vulnerability[- ]review|dependency[- ]scope)\b|Cargo\.lock/i.test(
    values.join(' '),
  );
}

function hasOperatorReadinessClaim(...values: string[]): boolean {
  return /\b(operator[- ]ready|operator[- ]readiness|operator[- ]impact|operator|operational[- ]readiness|operationally[- ]ready|operations[- ]ready|ops[- ]ready|runbook[- ]ready|runbook|incident[- ]response|incident[- ]drill|monitoring|alerting|stop[- ]condition|operable|external[- ]operator)\b/i.test(
    values.join(' '),
  );
}

function hasExternalIntegrationClaim(...values: string[]): boolean {
  return /\b(external[- ]integration|external[- ]reviewer|external[- ]team[- ]ready|third[- ]party[- ]integration|third[- ]party[- ]integrator|third[- ]party[- ]ready|integration[- ]package|integration[- ]review|integration[- ]ready|integrator[- ]ready|partner[- ]ready|partner[- ]integration|exchange[- ]integration|safe[- ]to[- ]publish|publish[- ]approved|publication[- ]approved|publication[- ]accepted|release[- ]candidate|release[- ]candidate[- ]ready|fresh[- ]checkout|private[- ]maintainer[- ]context|institutional[- ]reference|public[- ]institutional|public[- ]release|public[- ]pr|publication[- ]ready|publishable[- ]release|publicly[- ]releasable)\b/i.test(
    values.join(' '),
  );
}

function hasBackupRestoreClaim(...values: string[]): boolean {
  return /\b(sqlite\/avl|sqlite|wal|shm|backup[- ]restore|backup|restore|disaster[- ]recovery|recovery[- ]ready|state[- ]recovery|state[- ]rebuild|state[- ]reconstruction|recoverable[- ]state|reconstructibility|reconstructible|restored[- ]state|state[- ]consistency|local[- ]state|avl[- ]rebuild|avl[- ]reconstruction|dup[- ]rebuild|spv[- ]rebuild)\b/i.test(
    values.join(' '),
  );
}

function hasSecurityReviewClaim(...values: string[]): boolean {
  return /\b(security[- ]review|security[- ]reviewed|security[- ]assessment|security[- ]assessed|security[- ]assessment[- ]report|independent[- ]review|independent[- ]security|audit|audited|audit[- ]report|finding[- ]disposition|critical\/high|critical[- ]high|critical findings|high findings|penetration[- ]test|penetration[- ]testing|pentest|pen[- ]test)\b/i.test(
    values.join(' '),
  );
}

function hasFailedBroadcastRecoveryClaim(...values: string[]): boolean {
  return /\b(failed[- ]broadcast|broadcast[- ]failure|phantom[- ]avl|phantom[- ]dup|phantom[- ]history|no[- ]phantom)\b/i.test(
    values.join(' '),
  );
}

function hasReorgedBurnRecoveryClaim(...values: string[]): boolean {
  return /\b(reorged[- ]burn|burn[- ]reorg|reorg[- ]burn|stale[- ]singleton|stale[- ]singleton[- ]box|stale[- ]singleton[- ]boxes|singleton[- ]recovery)\b/i.test(
    values.join(' '),
  );
}

function hasCleanCheckoutClaim(...values: string[]): boolean {
  return /\b(clean[- ]checkout|green[- ]ci|ci[- ]green|final[- ]branch|workflow[- ]run|ci[- ]workflow|npm ci|npm run ci:validate)\b/i.test(
    values.join(' '),
  );
}

function hasLocalDevnetLifecycleClaim(...values: string[]): boolean {
  return /\b(local[- ]devnet|devnet[- ]lifecycle|fresh[- ]devnet|local[- ]lifecycle[- ]rehearsal)\b/i.test(
    values.join(' '),
  );
}

function hasTestnetLifecycleClaim(...values: string[]): boolean {
  return /\b(testnet[- ]lifecycle|fresh[- ]testnet|ergo[- ]testnet|testnet[- ]rehearsal)\b/i.test(
    values.join(' '),
  );
}

function hasGenericLifecycleClaim(...values: string[]): boolean {
  return /\b(peg[- ]in|peg[- ]out|end[- ]to[- ]end|e2e|round[- ]trip|full[- ]lifecycle|fresh[- ]lifecycle|lifecycle[- ]verified|lifecycle[- ]complete|lifecycle[- ]rehearsal|settlement[- ]check|settlement[- ]submit|submit\/confirmation|submit[- ]confirmation|confirmation\/reconciliation|confirmation[- ]reconciliation|reconciliation|clean[- ]deployment[- ]state|singleton[- ]inventory|contract[- ]ids)\b/i.test(
    values.join(' '),
  );
}

function isActionableOperatorAction(value: string): boolean {
  return /\b(runbook|command|verify|verification|check|monitor|backup|restore|incident|status|preflight|capture|enable|disable)\b/i.test(value);
}

function isActionableStopCondition(value: string): boolean {
  return /\b(stop|block|fail|disable|pause|incident|mismatch|do not|do-not|refuse)\b/i.test(value);
}

function isActionableReleaseSignoffNote(value: string): boolean {
  return (
    /\b(approve|approved|block|blocked|validate|validated|confirm|confirmed|accept|accepted|checked|reviewed)\b/i.test(value) &&
    /\b(release notes?|claim|blocker|evidence|trust assumption|operator impact|scope|production|gate|publication)\b/i.test(value)
  );
}

function isBlankPlaceholder(values: string[]): boolean {
  return values.every(value => isBlank(value) || value === 'yes / no');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase());
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}
