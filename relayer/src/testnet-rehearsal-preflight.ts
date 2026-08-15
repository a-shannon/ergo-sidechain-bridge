import { realpathSync } from 'fs';
import { basename, extname, isAbsolute, relative, resolve } from 'path';

import {
  loadHistoricalAggregateSettlementApprovals,
  type AggregateSettlementApprovalContext,
  type HistoricalAggregateSettlementApprovalLookup,
  type SingleAggregateSettlementApprovalMode,
} from './aggregate-settlement-approvals.js';
import {
  concreteBridgeEventRootsFromClaims,
  formatBridgeEventRootCsv,
} from './bridge-event-root-evidence.js';
import {
  formatAggregateSettlementEvidenceJsonPathLabel,
  validateAggregateSettlementPrebroadcastEvidenceRecord,
  type AggregateSettlementPrebroadcastEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import { readEvidenceMarkdownTarget } from './evidence-target-path.js';
import { classifyPublicationClaimText } from './publication-claim-boundary.js';
import {
  readLinkedAggregateSettlementEvidenceJsonRecords,
} from './testnet-prebroadcast-linked-json.js';
import { doctorTestnetPreBroadcastPackage } from './testnet-prebroadcast-package-doctor.js';
import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import {
  hasStructuredValidationFailureMarker,
  hasUnresolvedIssueMarker,
  normalizeEvidenceMarkerText,
} from './evidence-hygiene.js';
import { LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE } from './legacy-aggregate-settlement-conservation.js';

export type TestnetRehearsalPreflightStatus = 'GO' | 'BLOCKED';
export type TestnetRehearsalPreflightMode = SingleAggregateSettlementApprovalMode | 'batch';

export interface TestnetRehearsalPreflightInput {
  prebroadcastTarget: string;
  approvalsPath?: string;
  now?: Date;
}

export interface TestnetRehearsalPreflightPackage {
  target: string;
  command: string;
  mode: TestnetRehearsalPreflightMode;
  expectedTxId: string;
  burnTxHashes: string[];
  sidechainBlockHeights: number[];
  sidechainHeaderHashHexes: string[];
  ergoAnchorHeights: number[];
  bridgeEventRootHexes: string[];
  deployedStateHash?: string;
}

export interface TestnetRehearsalPreflightTargetBindings {
  prebroadcast: string;
  approvals?: string;
}

export interface TestnetRehearsalPreflightReport {
  status: TestnetRehearsalPreflightStatus;
  message: string;
  errors: string[];
  targetBindings: TestnetRehearsalPreflightTargetBindings;
  packages: TestnetRehearsalPreflightPackage[];
  lines: string[];
}

export interface TestnetRehearsalPreflightReportValidation {
  errors: string[];
}

const blockedApprovalTargetLabel = '<blocked approval target>';

export function preflightTestnetRehearsal(
  input: TestnetRehearsalPreflightInput,
): TestnetRehearsalPreflightReport {
  const now = input.now ?? new Date();
  const doctor = doctorTestnetPreBroadcastPackage(input.prebroadcastTarget);
  const approvalContext: ExtractedApprovalContext = doctor.status === 'PASS'
    ? extractPrebroadcastApprovalContext(input.prebroadcastTarget)
    : { errors: [] };
  const packages = doctor.status === 'PASS'
    ? extractPrebroadcastPackages(input.prebroadcastTarget, approvalContext.context)
    : [];
  const errors = [
    ...(doctor.status === 'BLOCKED' ? doctor.errors : []),
    ...packages.flatMap(pkg => pkg.errors),
    ...approvalContext.errors,
  ];
  const preflightPackages = packages.flatMap(pkg => (pkg.package ? [pkg.package] : []));

  let approvalMatchCount = 0;
  const approvalTarget = resolveApprovalTarget(input.approvalsPath);
  errors.push(...approvalTarget.errors);
  if (approvalTarget.path && preflightPackages.length > 0 && approvalContext.errors.length === 0) {
    try {
      const lookup = loadHistoricalAggregateSettlementApprovals(approvalTarget.path, now, approvalContext.context);
      const approvalErrors = validateApprovalMatches(lookup, preflightPackages, now);
      if (approvalErrors.length > 0) {
        errors.push(...approvalErrors);
      } else {
        approvalMatchCount = preflightPackages.length;
      }
    } catch (err: any) {
      errors.push(`Approvals: ${err?.message ?? String(err)}`);
    }
  }

  const status: TestnetRehearsalPreflightStatus =
    errors.length === 0 && preflightPackages.length > 0 ? 'GO' : 'BLOCKED';
  const message = `testnet rehearsal preflight ${status}${
    status === 'BLOCKED' ? `: ${errors.length} issue(s)` : ''
  }`;

  return {
    status,
    message,
    errors,
    targetBindings: {
      prebroadcast: doctor.label,
      approvals: approvalTarget.label,
    },
    packages: preflightPackages,
    lines: buildReportLines({
      message,
      doctorStatus: doctor.status,
      approvalLabel: approvalTarget.label,
      approvalMatchCount,
      packages: preflightPackages,
      errors,
    }),
  };
}

export function validateTestnetRehearsalPreflightReport(
  report: unknown,
): TestnetRehearsalPreflightReportValidation {
  if (!isRecord(report)) {
    return { errors: ['rehearsal-preflight: structured JSON report is required'] };
  }

  const packages = Array.isArray(report.packages) ? report.packages : undefined;
  const errors = [
    ...(report.schemaVersion === 1 ? [] : ['rehearsal-preflight: schemaVersion must be 1']),
    ...(report.status === 'GO' ? [] : ['rehearsal-preflight: status must be GO']),
    ...(report.message === 'testnet rehearsal preflight GO'
      ? []
      : ['rehearsal-preflight: message must be testnet rehearsal preflight GO']),
    ...validatePreflightErrorsField(report.errors),
    ...validatePreflightTargetBindings(report.targetBindings),
    ...(packages ? validatePreflightPackages(packages) : [
      'rehearsal-preflight: packages array is required',
    ]),
    ...validatePreflightTextEvidence(report.lines),
  ];
  return { errors };
}

function validatePreflightErrorsField(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return ['rehearsal-preflight: errors array is required'];
  }
  return value.length === 0
    ? []
    : ['rehearsal-preflight: errors array must be empty'];
}

function validatePreflightTargetBindings(value: unknown): string[] {
  if (!isRecord(value)) {
    return [
      'rehearsal-preflight: targetBindings.prebroadcast must be present',
      'rehearsal-preflight: targetBindings.approvals must be present',
    ];
  }
  const errors: string[] = [];
  if (typeof value.prebroadcast === 'string' && hasShellUnsafeTargetContent(value.prebroadcast)) {
    errors.push('rehearsal-preflight: targetBindings.prebroadcast must not contain whitespace or shell metacharacters');
  }
  if (typeof value.approvals === 'string' && hasShellUnsafeTargetContent(value.approvals)) {
    errors.push('rehearsal-preflight: targetBindings.approvals must not contain whitespace or shell metacharacters');
  }
  if (!isSafeEvidenceTarget(value.prebroadcast)) {
    errors.push('rehearsal-preflight: targetBindings.prebroadcast must be present');
  }
  if (!isSafeJsonEvidenceTarget(value.approvals)) {
    errors.push('rehearsal-preflight: targetBindings.approvals must be a JSON target');
  }
  return errors;
}

function validatePreflightPackages(packages: unknown[]): string[] {
  if (packages.length === 0) return ['rehearsal-preflight: packages array must not be empty'];
  return packages.flatMap((pkg, index) => validatePreflightPackage(pkg, index));
}

function validatePreflightPackage(pkg: unknown, index: number): string[] {
  if (!isRecord(pkg)) return [`rehearsal-preflight: packages[${index}] must be an object`];
  const errors: string[] = [];
  if (typeof pkg.target === 'string' && hasShellUnsafeTargetContent(pkg.target)) {
    errors.push(`rehearsal-preflight: packages[${index}].target must not contain whitespace or shell metacharacters`);
  }
  if (!isSafeJsonEvidenceTarget(pkg.target)) errors.push(`rehearsal-preflight: packages[${index}].target must be a JSON target`);
  if (typeof pkg.command !== 'string' || pkg.command.trim().length === 0) {
    errors.push(`rehearsal-preflight: packages[${index}].command must be present`);
  }
  if (!['single', 'single-with-ingest', 'batch'].includes(String(pkg.mode))) {
    errors.push(`rehearsal-preflight: packages[${index}].mode must be single, single-with-ingest, or batch`);
  }
  if (!normalizeHex32Value(pkg.expectedTxId)) {
    errors.push(`rehearsal-preflight: packages[${index}].expectedTxId must be 32-byte hex`);
  }
  if (!normalizeHex32Array(pkg.burnTxHashes)) {
    errors.push(`rehearsal-preflight: packages[${index}].burnTxHashes must be non-empty 32-byte hex array`);
  }
  if (!normalizeNumberArray(pkg.sidechainBlockHeights)) {
    errors.push(`rehearsal-preflight: packages[${index}].sidechainBlockHeights must be non-empty safe integer array`);
  }
  if (!normalizeHex32Array(pkg.sidechainHeaderHashHexes)) {
    errors.push(`rehearsal-preflight: packages[${index}].sidechainHeaderHashHexes must be non-empty 32-byte hex array`);
  }
  if (!normalizeNumberArray(pkg.ergoAnchorHeights)) {
    errors.push(`rehearsal-preflight: packages[${index}].ergoAnchorHeights must be non-empty safe integer array`);
  }
  if (!normalizeHex32Array(pkg.bridgeEventRootHexes)) {
    errors.push(`rehearsal-preflight: packages[${index}].bridgeEventRootHexes must be non-empty 32-byte hex array`);
  }
  if (!normalizeHex32Value(pkg.deployedStateHash)) {
    errors.push(`rehearsal-preflight: packages[${index}].deployedStateHash must be 32-byte hex`);
  }
  return errors;
}

function validatePreflightTextEvidence(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(line => typeof line === 'string')) {
    return ['rehearsal-preflight: lines array is required'];
  }
  const joined = value.join('\n');
  const errors: string[] = [];
  if (!/\bdoes not authorize broadcast or lift the legacy V1 submission quarantine\b/i.test(joined)) {
    errors.push('rehearsal-preflight: lines must preserve the no-broadcast legacy V1 quarantine boundary');
  }
  if (!joined.includes(`Legacy V1 submission quarantine: ${LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE}`)) {
    errors.push('rehearsal-preflight: lines must state the exact legacy V1 submission quarantine');
  }
  if (!/activate a reviewed, separately versioned external-fee settlement profile/i.test(joined)) {
    errors.push('rehearsal-preflight: lines must require the separately versioned external-fee settlement profile');
  }
  if (hasUnresolvedIssueMarker(normalizeEvidenceMarkerText(joined))) {
    errors.push('rehearsal-preflight: GO lines must not contain remaining issues');
  }
  if (value.some(hasContradictoryValidationFailureMarker)) {
    errors.push('rehearsal-preflight: lines must not include contradictory failure markers');
  }
  return errors;
}

function hasContradictoryValidationFailureMarker(segment: string): boolean {
  const normalized = normalizeEvidenceMarkerText(segment);
  return (
    /(?:^|[^A-Za-z0-9_-])FAIL(?:$|[^A-Za-z0-9_-])/i.test(normalized) ||
    /\b(?:status|result|validation|validator|command|outcome)\s*[:=]?\s*FAILED\b/i.test(normalized) ||
    /\bFAILED\b\s+(?:validation|validator|command|run|result|status)\b/i.test(normalized) ||
    /\bBLOCKED\b/i.test(normalized) ||
    /\bERROR\b/i.test(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\b[1-9]\d*\s+structural\s+issues?\b/i.test(normalized)
  );
}

interface ExtractedPackage {
  package?: TestnetRehearsalPreflightPackage;
  errors: string[];
}

function extractPrebroadcastPackages(
  markdownTarget: string,
  context?: AggregateSettlementApprovalContext,
): ExtractedPackage[] {
  const target = readEvidenceMarkdownTarget(markdownTarget);
  if (target.errors.length > 0) {
    return [{ errors: target.errors }];
  }

  const records = readLinkedAggregateSettlementEvidenceJsonRecords(markdownTarget, target.markdown);
  if (records.length === 0) {
    return [{ errors: ['Prebroadcast package: at least one linked aggregate settlement JSON record is required'] }];
  }

  return records.map((record): ExtractedPackage => {
    const label = formatAggregateSettlementEvidenceJsonPathLabel(record.target);
    if (record.readError) {
      return { errors: [`Linked aggregate settlement evidence ${label}: ${record.readError}`] };
    }

    const recordErrors = validateAggregateSettlementPrebroadcastEvidenceRecord(record.record);
    if (recordErrors.length > 0) {
      return { errors: recordErrors.map(error => `Linked aggregate settlement evidence ${label}: ${error}`) };
    }

    const aggregateRecord = record.record as AggregateSettlementPrebroadcastEvidenceRecord;
    const mode = modeForAggregateCommand(aggregateRecord.command);
    if (!mode) {
      return {
        errors: [
          `Linked aggregate settlement evidence ${label}: command must map to a daemon approval mode`,
        ],
      };
    }

    return {
      errors: [],
      package: {
        target: label,
        command: aggregateRecord.command,
        mode,
        expectedTxId: aggregateRecord.transactionCheck.expectedTxId.toLowerCase(),
        burnTxHashes: aggregateRecord.claims.map(claim => claim.burnTxHash.toLowerCase()),
        sidechainBlockHeights: aggregateRecord.claims.map(claim => claim.sidechainBlockHeight),
        sidechainHeaderHashHexes: aggregateRecord.claims
          .map(claim => claim.sidechainHeaderHashHex?.toLowerCase())
          .filter((hash): hash is string => hash !== undefined),
        ergoAnchorHeights: aggregateRecord.claims
          .map(claim => claim.ergoAnchorHeight)
          .filter((height): height is number => height !== undefined),
        bridgeEventRootHexes: concreteBridgeEventRootsFromClaims(aggregateRecord.claims),
        deployedStateHash: context?.deployedStateHash?.toLowerCase(),
      },
    };
  });
}

interface ExtractedApprovalContext {
  context?: AggregateSettlementApprovalContext;
  errors: string[];
}

function extractPrebroadcastApprovalContext(markdownTarget: string): ExtractedApprovalContext {
  const target = readEvidenceMarkdownTarget(markdownTarget);
  if (target.errors.length > 0) {
    return { errors: target.errors };
  }

  const scope = sectionBetween(target.markdown, '## Scope Statement', '## Required Command Artifacts');
  const commandArtifacts = sectionBetween(
    target.markdown,
    '## Required Command Artifacts',
    '## Dry-Run Settlement Shape',
  );
  const scopeFields = parseListFields(scope);
  const commandFields = parseListFields(commandArtifacts);
  const cleanDeploymentState = commandFields.get('Clean deployment state evidence') ?? '';
  const deployedStateHash = extractDeploymentStateHash(cleanDeploymentState);
  const context: AggregateSettlementApprovalContext = {
    environment: valueOrUndefined(scopeFields.get('Environment')),
    ergoNodeNetwork: valueOrUndefined(scopeFields.get('Ergo node network')),
    sidechainNetwork: valueOrUndefined(scopeFields.get('Sidechain network')),
    deployedStateHash,
  };
  const errors = [
    ...missingContextErrors(context),
    ...(deployedStateHash ? [] : [
      'Prebroadcast package: Clean deployment state evidence must include deployment-state hash for approvals binding',
    ]),
  ];

  return errors.length > 0 ? { errors } : { context, errors: [] };
}

function modeForAggregateCommand(command: string): TestnetRehearsalPreflightMode | null {
  if (command === 'check') return 'single';
  if (command === 'check-with-ingest' || command === 'check-anchored') return 'single-with-ingest';
  if (command === 'check-batch') return 'batch';
  return null;
}

function validateApprovalMatches(
  lookup: HistoricalAggregateSettlementApprovalLookup,
  packages: TestnetRehearsalPreflightPackage[],
  now: Date,
): string[] {
  const errors: string[] = [];
  for (const pkg of packages) {
    const approvedExpectedTxId = pkg.mode === 'batch'
      ? lookup.expectedTxIdForBatch(pkg.burnTxHashes, now)
      : lookup.expectedTxIdForSingle(pkg.burnTxHashes[0], pkg.mode, now);

    if (!approvedExpectedTxId) {
      errors.push(
        `Approvals: missing matching ${pkg.mode} approval for ${formatBurnSet(pkg.burnTxHashes)}`,
      );
      continue;
    }

    if (approvedExpectedTxId.toLowerCase() !== pkg.expectedTxId) {
      errors.push(
        `Approvals: ${pkg.mode} approval Expected transaction ID does not match prebroadcast package`,
      );
    }
  }
  return errors;
}

interface ResolvedApprovalTarget {
  path?: string;
  label: string;
  errors: string[];
}

function resolveApprovalTarget(target: string | undefined): ResolvedApprovalTarget {
  if (!target?.trim()) {
    return {
      label: '<missing approval target>',
      errors: ['Approvals: --approvals is required to prove daemon Expected transaction ID binding'],
    };
  }

  const trimmed = target.trim();
  const label = formatApprovalTargetLabel(trimmed);
  const errors = validateApprovalTarget(trimmed);
  if (errors.length > 0) return { label, errors };

  try {
    const bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
    const approvalPath = realpathSync(resolve(process.cwd(), trimmed));
    if (!isInsidePath(approvalPath, bridgeRoot)) {
      return {
        label: blockedApprovalTargetLabel,
        errors: [`Approvals: ${blockedApprovalTargetLabel} must resolve inside the bridge repository`],
      };
    }
    return { path: approvalPath, label, errors: [] };
  } catch {
    return {
      label,
      errors: [`Approvals: ${label} could not be resolved`],
    };
  }
}

function validateApprovalTarget(target: string): string[] {
  const label = formatApprovalTargetLabel(target);
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  const name = basename(normalized);
  const extension = extname(name);
  const errors: string[] = [];

  if (extension !== '.json') {
    errors.push(`Approvals: ${label} must be a JSON file`);
  }
  if (isLocalAbsoluteTarget(normalized) || isLocalFileUrl(normalized)) {
    errors.push(`Approvals: ${label} must be a relative path inside the bridge repository`);
  }
  if (hasUriSchemeTarget(normalized) && !isLocalAbsoluteTarget(normalized) && !isLocalFileUrl(normalized)) {
    errors.push(`Approvals: ${label} must not be a URI`);
  }
  if (escapesBridgeRoot(normalized)) {
    errors.push(`Approvals: ${label} must not escape the bridge repository`);
  }
  if (hasSensitiveApprovalEnvironmentTarget(normalized)) {
    errors.push(`Approvals: ${blockedApprovalTargetLabel} must not be an environment file`);
  }
  if (hasSensitiveApprovalRuntimeTarget(normalized)) {
    errors.push(`Approvals: ${blockedApprovalTargetLabel} must not be a secret-bearing or runtime-state path`);
  }
  return errors;
}

function formatApprovalTargetLabel(target: string): string {
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  if (
    isSensitiveApprovalTarget(normalized) ||
    hasUriSchemeTarget(normalized)
  ) {
    return blockedApprovalTargetLabel;
  }
  if (isLocalAbsoluteTarget(normalized) || isLocalFileUrl(normalized)) {
    return blockedApprovalTargetLabel;
  }
  if (escapesBridgeRoot(normalized)) {
    return blockedApprovalTargetLabel;
  }
  return target;
}

function isSensitiveApprovalTarget(normalized: string): boolean {
  return evidenceTargetInspectionVariants(normalized).some(isSensitiveApprovalInspectionTarget);
}

function hasSensitiveApprovalEnvironmentTarget(normalized: string): boolean {
  return evidenceTargetInspectionVariants(normalized).some(candidate => {
    const name = basename(candidate);
    return isEvidenceEnvironmentFileName(name) || hasEnvironmentTargetSegment(candidate);
  });
}

function hasSensitiveApprovalRuntimeTarget(normalized: string): boolean {
  return evidenceTargetInspectionVariants(normalized).some(candidate =>
    hasRuntimeDatabaseTargetSegment(candidate) ||
    isEvidenceSecretOrRuntimeName(candidate, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(candidate),
  );
}

function isSensitiveApprovalInspectionTarget(normalized: string): boolean {
  const name = basename(normalized);
  return (
    hasEnvironmentTargetSegment(normalized) ||
    hasRuntimeDatabaseTargetSegment(normalized) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalized, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalized)
  );
}

function hasEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function buildReportLines(input: {
  message: string;
  doctorStatus: 'PASS' | 'BLOCKED';
  approvalLabel: string;
  approvalMatchCount: number;
  packages: TestnetRehearsalPreflightPackage[];
  errors: string[];
}): string[] {
  const lines = [
    input.message,
    `- prebroadcast doctor: ${input.doctorStatus}`,
    `- linked aggregate package(s): ${input.packages.length}`,
    ...input.packages.map(formatPackageLine),
    `- approvals: ${input.approvalMatchCount} matched binding(s) from ${input.approvalLabel}`,
    '- scope: offline evidence validation; this preflight does not authorize broadcast or lift the legacy V1 submission quarantine.',
  ];

  if (input.errors.length > 0) {
    lines.push('- Remaining issues:');
    lines.push(...input.errors.map(error => `  - ${error}`));
    lines.push('- Next safe step: fix blocked items and keep broadcast disabled.');
  } else {
    lines.push(`- Legacy V1 submission quarantine: ${LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE}`);
    lines.push('- Next safe step: activate a reviewed, separately versioned external-fee settlement profile; approval does not lift this quarantine.');
  }

  return lines;
}

function formatPackageLine(pkg: TestnetRehearsalPreflightPackage): string {
  return (
    `- ${pkg.target}: command=${pkg.command} mode=${pkg.mode} ` +
    `expectedTxId=${pkg.expectedTxId} burnTxHashes=${formatBurnSet(pkg.burnTxHashes)} ` +
    `sidechainBlockHeights=${formatNumberSet(pkg.sidechainBlockHeights)} ` +
    `sidechainHeaderHashHexes=${pkg.sidechainHeaderHashHexes.join(',')} ` +
    `ergoAnchorHeights=${formatNumberSet(pkg.ergoAnchorHeights)} ` +
    `bridgeEventRoots=${formatBridgeEventRootCsv(pkg.bridgeEventRootHexes)}`
  );
}

function formatBurnSet(burnTxHashes: string[]): string {
  return burnTxHashes.join(',');
}

function formatNumberSet(values: number[]): string {
  return values.join(',');
}

function sectionBetween(markdown: string, startHeading: string, endHeading: string): string {
  const start = markdown.indexOf(startHeading);
  if (start < 0) return '';
  const bodyStart = start + startHeading.length;
  const end = markdown.indexOf(endHeading, bodyStart);
  return markdown.slice(bodyStart, end < 0 ? markdown.length : end);
}

function parseListFields(section: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of section.split(/\r?\n/)) {
    const match = /^-\s+(.+?):\s*(.*)$/.exec(line);
    if (match) {
      fields.set(match[1].trim(), match[2].trim());
    }
  }
  return fields;
}

function extractDeploymentStateHash(value: string): string | undefined {
  const match =
    /\bdeployment[- ]state (?:hash|digest)\s*(?:=|:|is)\s*(?:0x)?([0-9a-fA-F]{64})\b/i.exec(value);
  return match?.[1].toLowerCase();
}

function valueOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function missingContextErrors(context: AggregateSettlementApprovalContext): string[] {
  const missing: Array<[keyof AggregateSettlementApprovalContext, string]> = [
    ['environment', 'Environment'],
    ['ergoNodeNetwork', 'Ergo node network'],
    ['sidechainNetwork', 'Sidechain network'],
  ];
  return missing
    .filter(([key]) => context[key] === undefined)
    .map(([, label]) => `Prebroadcast package: Scope Statement ${label} is required for approvals binding`);
}

function isLocalAbsoluteTarget(normalized: string): boolean {
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith('/');
}

function isLocalFileUrl(normalized: string): boolean {
  return /^file:\/\/\/(?:[a-z]:|\/)/i.test(normalized);
}

function hasUriSchemeTarget(normalized: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(normalized);
}

function escapesBridgeRoot(normalized: string): boolean {
  if (isLocalAbsoluteTarget(normalized) || isLocalFileUrl(normalized) || hasUriSchemeTarget(normalized)) {
    return false;
  }

  let depthFromRelayer = 0;
  const parts = normalized.split('/').filter(part => part.length > 0 && part !== '.');
  for (const part of parts) {
    if (part === '..') {
      depthFromRelayer -= 1;
    } else {
      depthFromRelayer += 1;
    }

    if (depthFromRelayer < -1) {
      return true;
    }
  }

  return false;
}

function isInsidePath(path: string, parent: string): boolean {
  const relativePath = relative(parent, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeEvidenceTarget(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0 || /[<>]/.test(trimmed)) return false;
  if (isLocalOnlyEvidenceTarget(trimmed)) return false;
  if (hasClaimEscalatingRehearsalPreflightEvidenceTarget(trimmed)) return false;
  return !hasNonConcreteEvidenceTarget(trimmed);
}

function hasNonConcreteEvidenceTarget(value: string): boolean {
  return value
    .replace(/\\/g, '/')
    .split(/[\\/]+/)
    .some(segment => isNonConcreteEvidenceTargetSegment(segment));
}

function isNonConcreteEvidenceTargetSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /[<>]/.test(segment) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example)[-_ ]*evidence(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example|template)(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|validator|prebroadcast|approval|approvals|preflight|aggregate|json|package)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:proof|evidence|artifact|target|log|run|check|update|validator|prebroadcast|approval|approvals|preflight|aggregate|json|package)(?:[-_.](?:sample|example|template)(?:[-_.]|$))/i.test(normalized)
  );
}

function hasClaimEscalatingRehearsalPreflightEvidenceTarget(target: string): boolean {
  const normalizedTarget = target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').toLowerCase();
  const claim = classifyPublicationClaimText(normalizedTarget);
  return claim.hasProductionClaim;
}

function isSafeJsonEvidenceTarget(value: unknown): value is string {
  return isSafeEvidenceTarget(value) && /\.json(?:[#?].*)?$/i.test(value);
}

function hasShellUnsafeTargetContent(target: string): boolean {
  return /[\s;&|`$()[\]{}<>"'*!]/.test(target.trim().replace(/\\/g, '/'));
}

function isLocalOnlyEvidenceTarget(value: string): boolean {
  const normalized = value.trim().replace(/\\/g, '/').toLowerCase();
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

function normalizeHex32Value(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : undefined;
}

function normalizeHex32Array(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const normalized = value.map(normalizeHex32Value);
  return normalized.every((item): item is string => item !== undefined)
    ? normalized
    : undefined;
}

function normalizeNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const normalized = value.map(item => {
    if (typeof item !== 'number') return undefined;
    return Number.isSafeInteger(item) && item >= 0 ? item : undefined;
  });
  return normalized.every((item): item is number => item !== undefined)
    ? normalized
    : undefined;
}
