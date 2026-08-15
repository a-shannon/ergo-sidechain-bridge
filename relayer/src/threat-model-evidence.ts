import { basename } from 'path';

import { validateIsoDateField } from './evidence-date.js';
import { validateGitCommitField } from './evidence-git.js';
import {
  hasStructuredValidationFailureMarker,
  hasUnresolvedIssueMarker,
  normalizeEvidenceMarkerText,
  validateEvidenceHygiene,
} from './evidence-hygiene.js';
import { validateDuplicateRequiredFields } from './evidence-required-names.js';
import {
  evidenceTargetInspectionVariants,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';

export interface ThreatModelMatrixRow {
  area: string;
  currentClaim: string;
  evidence: string;
  status: string;
  missingBeforePublication: string;
}

export interface ThreatModelClassification {
  matrixName: string;
  gitCommit: string;
  reviewer: string;
  date: string;
}

export interface ThreatModelEvidenceValidation {
  status: 'PASS' | 'BLOCKED';
  classification?: ThreatModelClassification;
  matrixRows: ThreatModelMatrixRow[];
  errors: string[];
  message: string;
}

interface ParsedClassificationFields {
  fields: Map<string, string>;
  fieldNames: string[];
}

interface ParsedRows<T> {
  rows: T[];
  errors: string[];
}

export const THREAT_MODEL_ALLOWED_STATUSES = [
  'Covered locally',
  'Guarded',
  'Pending rehearsal',
  'Open blocker',
] as const;

const ALLOWED_STATUS_SET = new Set<string>(THREAT_MODEL_ALLOWED_STATUSES);

export const REQUIRED_THREAT_MODEL_MATRIX_AREAS = [
  'ContextExtension signer divergence',
  'Signer surface isolation',
  'Explicit broadcast opt-in',
  'Mempool-safe HEIGHT checks',
  'Mutable singleton continuity',
  'Unlock payout binding',
  'DUP duplicate prevention',
  'Batch settlement all-or-nothing reconciliation',
  'Unified batch AVL proof',
  'Anchor height determinism',
  'Clean checkout reproducibility',
  'Technical addendum claim boundary',
  'Local secret/doxxing hygiene',
  'Dependency risk register',
  'Phantom burn trust minimization',
  'Committee and key operations',
  'Independent review readiness',
  'Operational recovery',
  'Performance and scaling claims',
  'External integration readiness',
] as const;

const REQUIRED_SECTIONS = [
  '# Security Evidence Matrix',
  '## Status Legend',
  '## Evidence Table',
  '## Required Verification Commands',
];

const REQUIRED_CLASSIFICATION_FIELDS = [
  'Matrix name',
  'Git commit',
  'Reviewer',
  'Date',
];

const REQUIRED_HEADER = '| Area | Current claim | Evidence | Status | Missing before publication |';

export const REQUIRED_THREAT_MODEL_AREA_TERMS: Record<string, { field: keyof ThreatModelMatrixRow; terms: string[] }[]> = {
  'ContextExtension signer divergence': [
    { field: 'status', terms: ['Guarded'] },
    { field: 'missingBeforePublication', terms: ['Upstream sigma-rust release', 'node conformance'] },
  ],
  'Signer surface isolation': [
    { field: 'currentClaim', terms: ['node-wallet', 'Fleet Prover', 'local WASM'] },
    { field: 'evidence', terms: ['relayer/src/fleet-signer.test.ts'] },
  ],
  'Explicit broadcast opt-in': [
    { field: 'currentClaim', terms: ['approval-file', 'Expected transaction ID'] },
    { field: 'missingBeforePublication', terms: ['Live staging rehearsal'] },
  ],
  'Clean checkout reproducibility': [
    { field: 'missingBeforePublication', terms: ['npm run ci:validate', '--clean-checkout-evidence'] },
  ],
  'Technical addendum claim boundary': [
    { field: 'missingBeforePublication', terms: ['npm run addendum:validate', '--technical-addendum-evidence'] },
  ],
  'Dependency risk register': [
    { field: 'missingBeforePublication', terms: ['npm run dependency:validate', '--dependency-review-evidence'] },
  ],
  'Phantom burn trust minimization': [
    { field: 'status', terms: ['Open blocker'] },
    { field: 'currentClaim', terms: ['transitional', 'not L1-trustless'] },
    { field: 'evidence', terms: ['docs/aggregate-settlement-threat-model.md'] },
    { field: 'missingBeforePublication', terms: ['npm run trustless:validate', '--trustless-burn-evidence'] },
  ],
  'Committee and key operations': [
    { field: 'missingBeforePublication', terms: ['npm run governance:validate', '--governance-evidence'] },
  ],
  'Independent review readiness': [
    { field: 'missingBeforePublication', terms: ['npm run security:validate', '--security-review-evidence'] },
  ],
  'Operational recovery': [
    { field: 'missingBeforePublication', terms: ['npm run operator:validate', '--operator-readiness-evidence'] },
  ],
  'Performance and scaling claims': [
    { field: 'missingBeforePublication', terms: ['npm run benchmark:validate', '--benchmark-evidence'] },
  ],
  'External integration readiness': [
    { field: 'missingBeforePublication', terms: ['npm run integration:validate', '--integration-evidence'] },
  ],
};

export function validateThreatModelEvidence(markdown: string): ThreatModelEvidenceValidation {
  const parsedRows = parseRowsSafely(() => parseThreatModelMatrixRows(markdown));
  const parsedClassification = parseOptionalClassification(markdown);
  const classification = parsedClassification
    ? threatModelClassificationFromFields(parsedClassification.fields)
    : undefined;
  const matrixRows = parsedRows.rows;
  const errors = [
    ...validateEvidenceHygiene(markdown, 'Threat Model Evidence'),
    ...validateRequiredSections(markdown),
    ...validateOptionalClassification(parsedClassification),
    ...validateRequiredTableHeader(markdown),
    ...parsedRows.errors,
    ...validateMatrixRows(matrixRows),
    ...validateThreatModelClaimBoundaries(markdown),
  ];

  return {
    status: errors.length === 0 ? 'PASS' : 'BLOCKED',
    classification,
    matrixRows,
    errors,
    message: `Threat model evidence validation ${errors.length === 0 ? 'PASS' : 'BLOCKED'}: ${errors.length} structural issue(s).`,
  };
}

export function parseThreatModelMatrixRows(markdown: string): ThreatModelMatrixRow[] {
  const tableStart = markdown.indexOf(REQUIRED_HEADER);
  const tableEnd = markdown.indexOf('## Required Verification Commands');
  if (tableStart < 0 || tableEnd < 0 || tableEnd <= tableStart) {
    throw new Error('Evidence Table: missing security evidence matrix table');
  }

  return parseMarkdownTableRows(markdown.slice(tableStart, tableEnd)).map(row => {
    if (row.length !== 5) throw new Error(`Evidence Table: malformed matrix row: ${row.join(' | ')}`);
    return {
      area: row[0],
      currentClaim: row[1],
      evidence: row[2],
      status: row[3],
      missingBeforePublication: row[4],
    };
  });
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

function parseOptionalClassification(markdown: string): ParsedClassificationFields | undefined {
  if (!markdown.includes('## Matrix Classification')) return undefined;
  return parseTwoColumnTable(sectionBetween(markdown, '## Matrix Classification', '## Status Legend'));
}

function threatModelClassificationFromFields(fields: Map<string, string>): ThreatModelClassification {
  return {
    matrixName: fields.get('Matrix name') ?? '',
    gitCommit: fields.get('Git commit') ?? '',
    reviewer: fields.get('Reviewer') ?? '',
    date: fields.get('Date') ?? '',
  };
}

function validateOptionalClassification(parsed: ParsedClassificationFields | undefined): string[] {
  if (!parsed) return [];
  const errors: string[] = [];
  const { fields, fieldNames } = parsed;

  for (const field of REQUIRED_CLASSIFICATION_FIELDS) {
    if (isBlank(fields.get(field) ?? '')) errors.push(`Matrix Classification: ${field} is required`);
  }

  errors.push(...validateDuplicateRequiredFields(
    'Matrix Classification',
    fieldNames,
    REQUIRED_CLASSIFICATION_FIELDS,
  ));
  validateGitCommitField(errors, fields, 'Matrix Classification', 'Git commit');
  validateIsoDateField(errors, fields, 'Matrix Classification', 'Date');
  return errors;
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

function parseTwoColumnTable(table: string): ParsedClassificationFields {
  const fields = new Map<string, string>();
  const fieldNames: string[] = [];
  for (const row of parseMarkdownTableRows(table)) {
    if (row.length !== 2) throw new Error(`Matrix Classification: malformed row: ${row.join(' | ')}`);
    fieldNames.push(row[0]);
    fields.set(row[0], row[1]);
  }
  return { fields, fieldNames };
}

function sectionBetween(markdown: string, startHeading: string, endHeading?: string): string {
  const start = markdown.indexOf(startHeading);
  if (start < 0) return '';
  const afterStart = start + startHeading.length;
  if (!endHeading) return markdown.slice(afterStart);
  const end = markdown.indexOf(endHeading, afterStart);
  return end < 0 ? markdown.slice(afterStart) : markdown.slice(afterStart, end);
}

function validateRequiredSections(markdown: string): string[] {
  return REQUIRED_SECTIONS
    .filter(section => !markdown.includes(section))
    .map(section => `${section}: missing required section`);
}

function validateRequiredTableHeader(markdown: string): string[] {
  return markdown.includes(REQUIRED_HEADER)
    ? []
    : ['Evidence Table: missing required security evidence matrix header'];
}

function validateMatrixRows(rows: ThreatModelMatrixRow[]): string[] {
  const errors: string[] = [];
  const byArea = new Map<string, ThreatModelMatrixRow>();

  for (const row of rows) {
    if (byArea.has(row.area)) {
      errors.push(`Evidence Table: ${row.area}: duplicate matrix row`);
    }
    byArea.set(row.area, row);

    if (!ALLOWED_STATUS_SET.has(row.status)) {
      errors.push(`Evidence Table: ${row.area}: unsupported status ${row.status || '<blank>'}`);
    }
    if (!hasConcreteEvidenceReference(row.evidence)) {
      errors.push(`Evidence Table: ${row.area}: evidence must cite concrete repository evidence`);
    }
    if (isBlank(row.currentClaim)) {
      errors.push(`Evidence Table: ${row.area}: current claim is required`);
    }
    if (isBlank(row.missingBeforePublication)) {
      errors.push(`Evidence Table: ${row.area}: missing-before-publication boundary is required`);
    }
    for (const { field, value } of [
      { field: 'currentClaim', value: row.currentClaim },
      { field: 'evidence', value: row.evidence },
      { field: 'missingBeforePublication', value: row.missingBeforePublication },
    ]) {
      if (!isBlank(value) && hasContradictoryValidationFailureMarker(value)) {
        errors.push(
          `Evidence Table: ${row.area}: ${field} must not include contradictory validation failure markers`,
        );
      }
    }
  }

  const missingAreas = REQUIRED_THREAT_MODEL_MATRIX_AREAS.filter(area => !byArea.has(area));
  if (missingAreas.length > 0) {
    errors.push(`Evidence Table: missing required areas: ${missingAreas.join(', ')}`);
  }

  for (const [area, expectations] of Object.entries(REQUIRED_THREAT_MODEL_AREA_TERMS)) {
    const row = byArea.get(area);
    if (!row) continue;
    for (const expectation of expectations) {
      for (const term of expectation.terms) {
        if (!containsTerm(row[expectation.field], term)) {
          errors.push(`Evidence Table: ${area}: ${expectation.field} must include ${term}`);
        }
      }
    }
  }

  return errors;
}

function hasContradictoryValidationFailureMarker(segment: string): boolean {
  const normalized = normalizeEvidenceMarkerText(segment);
  return (
    hasUnresolvedIssueMarker(normalized) ||
    /(?:^|[^A-Za-z0-9_-])FAIL(?:$|[^A-Za-z0-9_-])/i.test(normalized) ||
    /\b(?:status|result|validation|validator|command|outcome)\s*[:=]?\s*FAILED\b/i.test(normalized) ||
    /\bFAILED\b\s+(?:validation|validator|command|run|result|status)\b/i.test(normalized) ||
    /\b(?:validation|validator|command|run|outcome|output)\s+(?:BLOCKED|ERROR)\b/i.test(normalized) ||
    /\b(?:BLOCKED|ERROR)\b\s+(?:validation|validator|command|run|result|status|outcome|output)\b/i.test(normalized) ||
    hasAmbiguousValidationExitCode(normalized) ||
    hasAmbiguousValidationResultCount(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\b[1-9]\d*\s+structural\s+issues?\b/i.test(normalized)
  );
}

function hasAmbiguousValidationExitCode(segment: string): boolean {
  return /\bexit[- ]?code\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(segment);
}

function hasAmbiguousValidationResultCount(segment: string): boolean {
  return /\b(?:errors?|structural\s+issues?)\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(segment);
}

function validateThreatModelClaimBoundaries(markdown: string): string[] {
  const errors: string[] = [];
  if (hasForbiddenClaimAllowance(markdown, 'Production-ready claim allowed')) {
    errors.push('Threat Model Evidence: production-ready claim allowance must remain no');
  }
  if (hasForbiddenClaimAllowance(markdown, 'Mainnet deployment claim allowed')) {
    errors.push('Threat Model Evidence: mainnet deployment claim allowance must remain no');
  }
  return errors;
}

function hasForbiddenClaimAllowance(markdown: string, field: string): boolean {
  const fieldPattern = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `\\b${fieldPattern}\\s*=\\s*(?:yes|yes\\s*(?:/|,|\\bor\\b)\\s*no|no\\s*(?:/|,|\\bor\\b)\\s*yes)\\b`,
    'i',
  )
    .test(markdown);
}

function hasConcreteEvidenceReference(value: string): boolean {
  return extractBacktickItems(value).some(isConcreteMatrixRepositoryEvidenceReference);
}

function isConcreteMatrixRepositoryEvidenceReference(item: string): boolean {
  const normalized = item.replace(/\\/g, '/').replace(/^\.\//, '');
  return (
    /^(\.github|docs|phases|relayer|wasm-avl)\//.test(normalized) &&
    normalized.toLowerCase() !== 'docs/security-evidence-matrix.md' &&
    !isSensitiveOrRuntimeThreatModelEvidenceTarget(normalized) &&
    !hasNonConcreteThreatModelEvidenceTargetSegment(normalized)
  );
}

function isSensitiveOrRuntimeThreatModelEvidenceTarget(target: string): boolean {
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(isSensitiveOrRuntimeThreatModelEvidenceInspectionTarget);
}

function isSensitiveOrRuntimeThreatModelEvidenceInspectionTarget(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasEvidenceEnvironmentTargetSegment(normalizedTarget) ||
    hasRuntimeDatabaseTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalizedTarget, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
  );
}

function hasEvidenceEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function extractBacktickItems(value: string): string[] {
  return [...value.matchAll(/`([^`]+)`/g)].map(([, item]) => item.trim());
}

function hasNonConcreteThreatModelEvidenceTargetSegment(value: string): boolean {
  return value
    .split('#')[0]
    .split('?')[0]
    .replace(/[),;]+$/g, '')
    .toLowerCase()
    .split(/[\\/]+/)
    .some(segment => isNonConcreteThreatModelEvidenceTargetSegment(segment));
}

function isNonConcreteThreatModelEvidenceTargetSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example)[-_ ]*evidence(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example|template)(?:[-_.](?:threat|model|matrix|risk|attack|chain|mitigation|security|review|claim|claims|boundary|boundaries|assumption|assumptions|guard|evidence|artifact|target|log|run|check|update|release|note|notes|checklist|gate|blocker|blockers|validator|validation|command|finding|findings|classification|status)|$)/i.test(normalized)
  );
}

function containsTerm(value: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}($|[^A-Za-z0-9])`, 'i').test(value);
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}
