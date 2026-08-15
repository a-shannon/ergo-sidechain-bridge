import { createHash } from 'crypto';
import { readFileSync, realpathSync } from 'fs';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'path';

import { isIsoUtcTimestamp } from './evidence-date.js';
import {
  hasStructuredValidationFailureMarker,
  normalizeEvidenceMarkerText,
} from './evidence-hygiene.js';
import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import {
  validateAggregateSettlementPrebroadcastEvidenceRecord,
  type AggregateSettlementPrebroadcastEvidenceRecord,
} from './aggregate-settlement-evidence.js';
import { BATCH_UNLOCK_MAX_CLAIMS } from './aggregate-settlement-limits.js';
import { classifyPublicationClaimText } from './publication-claim-boundary.js';
import { canonicalNodeOrigin } from './ergo-node-endpoint-alignment.js';

export type SingleAggregateSettlementApprovalMode = 'single' | 'single-with-ingest';
export type AggregateSettlementApprovalMode = SingleAggregateSettlementApprovalMode | 'batch';

export interface HistoricalAggregateSettlementApprovalLookup {
  expectedTxIdForSingle(
    burnTxHash: string,
    mode: SingleAggregateSettlementApprovalMode,
    at?: Date,
  ): string | null;
  expectedTxIdForBatch(burnTxHashes: string[], at?: Date): string | null;
}

interface RawSingleApproval {
  mode: SingleAggregateSettlementApprovalMode;
  burnTxHash: string;
  expectedTxId: string;
  approvedAt: string;
  expiresAt: string;
  evidence: string;
  checkCommand: string;
  checkEvidence: string;
  checkEvidenceJson: string;
}

interface RawBatchApproval {
  mode: 'batch';
  burnTxHashes: string[];
  bridgeEventRootHexes: string[];
  expectedTxId: string;
  approvedAt: string;
  expiresAt: string;
  evidence: string;
  checkCommand: string;
  checkEvidence: string;
  checkEvidenceJson: string;
}

type RawApproval = RawSingleApproval | RawBatchApproval;

interface RawApprovalFile {
  version?: number;
  createdAt?: string;
  environment?: string;
  ergoNetwork?: string;
  ergoNodeNetwork?: string;
  ergoNodeUrl?: string;
  sidechainNetwork?: string;
  sidechainRpcUrl?: string;
  sidechainWsUrl?: string;
  deployedStateHash?: string;
  approvals?: RawApproval[];
}

export interface AggregateSettlementApprovalContext {
  environment?: string;
  ergoNodeNetwork?: string;
  ergoNodeUrl?: string;
  sidechainNetwork?: string;
  sidechainRpcUrl?: string;
  sidechainWsUrl?: string;
  deployedStateHash?: string;
  checkEvidenceBaseDir?: string;
}

export interface NormalizedSingleAggregateSettlementApproval {
  mode: SingleAggregateSettlementApprovalMode;
  burnTxHash: string;
  expectedTxId: string;
  approvedAt: string;
  expiresAt: string;
  evidence: string;
  checkCommand: string;
  checkEvidence: string;
  checkEvidenceJson: string;
  checkEvidenceJsonDigestHex?: string;
}

export interface NormalizedBatchAggregateSettlementApproval {
  mode: 'batch';
  burnTxHashes: string[];
  bridgeEventRootHexes: string[];
  expectedTxId: string;
  approvedAt: string;
  expiresAt: string;
  evidence: string;
  checkCommand: string;
  checkEvidence: string;
  checkEvidenceJson: string;
  checkEvidenceJsonDigestHex?: string;
}

export type NormalizedAggregateSettlementApproval =
  | NormalizedSingleAggregateSettlementApproval
  | NormalizedBatchAggregateSettlementApproval;

function normalizeHex32(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a 32-byte hex string`);
  }
  const clean = value.startsWith('0x') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`${label} must be a 32-byte hex string`);
  }
  return clean.toLowerCase();
}

function normalizeMode(value: unknown, index: number): AggregateSettlementApprovalMode {
  if (value === 'single' || value === 'single-with-ingest' || value === 'batch') {
    return value;
  }
  throw new Error(`approval[${index}].mode must be single, single-with-ingest, or batch`);
}

function normalizeHex32Array(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array of 32-byte hex strings`);
  }
  return value.map((item, index) => normalizeHex32(item, `${label}[${index}]`));
}

function normalizeEvidenceTarget(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must include a completed artifact marker or non-template evidence link`);
  }
  const trimmed = value.trim();
  const hasArtifact = /\bartifact:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+/.test(trimmed);
  const hasLink = /\bhttps?:\/\/[^\s)]+/.test(trimmed);
  const hasSensitiveTarget =
    hasSharedSensitiveTarget(trimmed) ||
    /\b[A-Za-z]:[\\/]/.test(trimmed) ||
    /\bhttps?:\/\/[^/\s)]+@/i.test(trimmed);
  if (
    (!hasArtifact && !hasLink) ||
    hasNonConcreteApprovalEvidenceTarget(trimmed) ||
    hasClaimEscalatingApprovalEvidenceTarget(trimmed) ||
    hasSensitiveTarget ||
    hasLocalOnlyEvidenceTarget(trimmed)
  ) {
    throw new Error(`${label} must include a completed artifact marker or non-template evidence link`);
  }
  return trimmed;
}

function hasLocalOnlyEvidenceTarget(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(hasLocalOnlyEvidenceInspectionText);
}

function hasLocalOnlyEvidenceInspectionText(normalized: string): boolean {
  return hasEvidenceLocalOnlyInspectionReference(normalized);
}

function normalizeCheckEvidenceJsonTarget(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a local relative aggregate prebroadcast JSON file`);
  }
  const trimmed = value.trim().replace(/\\/g, '/');
  const lower = trimmed.toLowerCase();
  const name = basename(lower);
  const parts = lower.split('/').filter(part => part.length > 0);
  if (
    extname(name) !== '.json' ||
    isAbsolute(trimmed) ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ||
    parts.includes('..') ||
    hasNonConcreteApprovalTargetSegment(trimmed) ||
    classifyPublicationClaimText(trimmed).hasProductionClaim ||
    hasLocalOnlyEvidenceTarget(lower) ||
    isSharedSensitiveFileTarget(lower)
  ) {
    throw new Error(`${label} must be a local relative aggregate prebroadcast JSON file`);
  }
  return trimmed;
}

function hasNonConcreteApprovalEvidenceTarget(value: string): boolean {
  return (
    /<[^>]+>|\{\{[^}]+\}\}/.test(value) ||
    extractApprovalEvidenceTargets(value).some(target => hasNonConcreteApprovalTargetSegment(target))
  );
}

function hasClaimEscalatingApprovalEvidenceTarget(value: string): boolean {
  return extractApprovalEvidenceTargets(value).some(target => {
    const normalizedTarget = target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').toLowerCase();
    const claim = classifyPublicationClaimText(normalizedTarget);
    return claim.hasProductionClaim;
  });
}

function extractApprovalEvidenceTargets(value: string): string[] {
  return [
    ...[...value.matchAll(/\bartifact:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+/g)].map(([target]) => target),
    ...[...value.matchAll(/\bhttps?:\/\/[^\s)]+/g)].map(([target]) => target),
  ];
}

function hasNonConcreteApprovalTargetSegment(value: string): boolean {
  return value
    .split('#')[0]
    .split('?')[0]
    .replace(/[),;]+$/g, '')
    .replace(/\\/g, '/')
    .toLowerCase()
    .split(/[\\/]+/)
    .some(segment => isNonConcreteApprovalTargetSegment(segment));
}

function isNonConcreteApprovalTargetSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /[<>]/.test(segment) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example)[-_ ]*evidence(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example|template)(?:[-_.](?:approval|approvals|operator|check|aggregate|prebroadcast|json|output|log|target|artifact|evidence|run|command)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:approval|approvals|operator|check|aggregate|prebroadcast|json|output|log|target|artifact|evidence|run|command)(?:[-_.](?:sample|example|template)(?:[-_.]|$))/i.test(normalized)
  );
}

function hasSharedSensitiveTarget(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  return (
    normalized.includes('file://') ||
    isSharedSensitiveFileTarget(normalized)
  );
}

function isSharedSensitiveFileTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(isSharedSensitiveInspectionTarget);
}

function isSharedSensitiveInspectionTarget(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasEnvironmentTargetSegment(normalizedTarget) ||
    hasRuntimeDatabaseTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalizedTarget, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
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

function normalizeNetwork(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must identify a non-mainnet network`);
  }
  const trimmed = value.trim();
  if (
    /\b(?:non[- ]?test[- ]?net|no|not|without|missing|absent|unavailable|unconnected|disconnected)\b.{0,80}\btest[- ]?net\b/i.test(trimmed) ||
    /\btest[- ]?net\b.{0,80}\b(?:not|missing|absent|unavailable|unconnected|disconnected)\b/i.test(trimmed) ||
    /\b(?:no|not|without|missing|lacks?|absent)\s+non[- ]?main[- ]?net\b/i.test(trimmed) ||
    /\bnon[- ]?main[- ]?net\s*[:=]\s*(?:no|false)\b/i.test(trimmed)
  ) {
    throw new Error(`${label} must identify a positive non-mainnet network`);
  }
  if (/\bmain[-\s]*(?:net|network|chain)\b/i.test(trimmed)) {
    throw new Error(`${label} must not identify mainnet, main network, or main chain`);
  }
  if (classifyPublicationClaimText(trimmed).hasProductionClaim) {
    throw new Error(`${label} must not include production claim wording`);
  }
  return trimmed;
}

function normalizeApprovalUrl(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-secret http(s) or ws(s) URL`);
  }
  const trimmed = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} must be a non-secret http(s) or ws(s) URL`);
  }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
    throw new Error(`${label} must use http(s) or ws(s)`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not include credentials`);
  }
  const normalized = parsed.toString();
  return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
}

function normalizeCheckCommand(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-broadcast aggregate settlement check command`);
  }
  const trimmed = value.trim();
  if (
    /[|&;<>()`$]/.test(trimmed) ||
    /\b(template|placeholder|todo|tbd|example|submit|confirm|trigger)\b/i.test(trimmed) ||
    /\b(?:BRIDGE_BROADCAST_ENABLED|AGGREGATE_SETTLEMENT_ENABLED)\s*=/i.test(trimmed) ||
    /<[^>]+>|\{\{[^}]+\}\}/.test(trimmed)
  ) {
    throw new Error(`${label} must be a non-broadcast aggregate settlement check command`);
  }
  const parts = trimmed.split(/\s+/);
  if (
    (parts[0] !== 'npm' && parts[0] !== 'npm.cmd') ||
    parts[1] !== 'run' ||
    parts[2] !== 'settle:aggregate' ||
    parts[3] !== '--' ||
    !['check', 'check-with-ingest', 'check-anchored', 'check-batch'].includes(parts[4]) ||
    parts.length < 6
  ) {
    throw new Error(`${label} must be a non-broadcast aggregate settlement check command`);
  }
  return trimmed;
}

function assertSingleCheckCommandMatchesBurn(
  checkCommand: string,
  burnTxHash: string,
  mode: SingleAggregateSettlementApprovalMode,
  index: number,
): void {
  const parts = checkCommand.split(/\s+/);
  if (parts[4] === 'check-batch') {
    throw new Error(`approval[${index}].checkCommand must not use check-batch for single approval mode`);
  }
  if (mode === 'single' && parts[4] !== 'check') {
    throw new Error(`approval[${index}].checkCommand must use check for single approval mode`);
  }
  if (mode === 'single-with-ingest' && parts[4] !== 'check-with-ingest' && parts[4] !== 'check-anchored') {
    throw new Error(
      `approval[${index}].checkCommand must use check-with-ingest or check-anchored for single-with-ingest approval mode`,
    );
  }
  const commandBurnTxHash = normalizeHex32(parts[5], `approval[${index}].checkCommand burnTxHash`);
  if (commandBurnTxHash !== burnTxHash) {
    throw new Error(`approval[${index}].checkCommand burnTxHash must match approval burnTxHash`);
  }
  if (parts[4] === 'check' && parts.length !== 6) {
    throw new Error(`approval[${index}].checkCommand check must include exactly one burnTxHash`);
  }
  if (parts[4] === 'check-with-ingest') {
    if (parts.length !== 9) {
      throw new Error(`approval[${index}].checkCommand check-with-ingest must include burnTxHash, sidechainHeaderHashHex, bridgeEventRootHex, and ergoAnchorHeight`);
    }
    normalizeHex32(parts[6], `approval[${index}].checkCommand sidechainHeaderHashHex`);
    normalizeHex32(parts[7], `approval[${index}].checkCommand bridgeEventRootHex`);
    normalizeNonNegativeSafeIntegerString(parts[8], `approval[${index}].checkCommand ergoAnchorHeight`);
  }
  if (parts[4] === 'check-anchored') {
    if (parts.length !== 7) {
      throw new Error(`approval[${index}].checkCommand check-anchored must include burnTxHash and ergoAnchorHeight`);
    }
    normalizeNonNegativeSafeIntegerString(parts[6], `approval[${index}].checkCommand ergoAnchorHeight`);
  }
}

function assertBatchCheckCommandMatchesOrderedBurns(
  checkCommand: string,
  burnTxHashes: string[],
  index: number,
): void {
  const parts = checkCommand.split(/\s+/);
  if (parts[4] !== 'check-batch') {
    throw new Error(`approval[${index}].checkCommand must use check-batch for batch approval mode`);
  }
  const commandBurnTxHashes = parts.slice(5).map((burnTxHash, burnIndex) =>
    normalizeHex32(burnTxHash, `approval[${index}].checkCommand burnTxHashes[${burnIndex}]`),
  );
  if (commandBurnTxHashes.length !== burnTxHashes.length) {
    throw new Error(`approval[${index}].checkCommand burnTxHashes must match approval burnTxHashes`);
  }
  for (let i = 0; i < burnTxHashes.length; i += 1) {
    if (commandBurnTxHashes[i] !== burnTxHashes[i]) {
      throw new Error(`approval[${index}].checkCommand burnTxHashes must match approval burnTxHashes in order`);
    }
  }
}

function assertEvidenceTextIncludes(
  value: string,
  label: string,
  required: Array<[string, string]>,
): void {
  const normalized = value.toLowerCase();
  for (const [description, term] of required) {
    if (!normalized.includes(term.toLowerCase())) {
      throw new Error(`${label} must cite ${description}`);
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertExactModeBinding(value: string, label: string, mode: string): void {
  const pattern = new RegExp(
    `(?:^|[\\s|,;([{])mode\\s*[:=]?\\s*${escapeRegExp(mode)}(?:$|[\\s|,;)\\]}])`,
    'i',
  );
  if (!pattern.test(value)) {
    throw new Error(`${label} must cite exact approval mode ${mode}`);
  }
}

function assertInternallyPositivePassEvidence(value: string, label: string): void {
  const normalized = normalizeEvidenceMarkerText(value);
  if (
    /\b(?:not|without|missing|lacks?|no)\s+PASS\b/i.test(normalized) ||
    /\bPASS\s*[:=]\s*(?:no|false)\b/i.test(normalized) ||
    /\bPASS\b.{0,40}\b(?:failed|blocked|missing|rejected)\b/i.test(normalized) ||
    /(?:^|[^A-Za-z0-9_-])FAIL(?:$|[^A-Za-z0-9_-])/i.test(normalized) ||
    /\b(?:FAILED|BLOCKED|ERROR)\b/i.test(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized)
  ) {
    throw new Error(`${label} must cite internally positive PASS check result`);
  }
}

function assertPositiveCheckCommandEvidence(value: string, label: string, checkCommand: string): void {
  const escapedCommand = escapeRegExp(checkCommand);
  const normalized = normalizeEvidenceMarkerText(value);
  if (
    !value.includes(checkCommand) ||
    new RegExp(`\\b(?:not|without|missing|lacks?|no)\\s+${escapedCommand}(?:$|[\\s|,;)\\]}])`, 'i').test(normalized)
  ) {
    throw new Error(`${label} must cite positive check command`);
  }
}

function assertPositiveOperatorApprovalEvidence(value: string, label: string): void {
  const normalized = normalizeEvidenceMarkerText(value);
  if (
    /\b(?:not|without|missing|lacks?)\s+approved\b/i.test(normalized) ||
    /\bapproval\b.{0,80}\b(?:denied|rejected|revoked|cancell?ed|blocked|failed)\b/i.test(normalized) ||
    /\b(?:denied|rejected|revoked|cancell?ed|blocked|failed)\b.{0,80}\bapproval\b/i.test(normalized) ||
    /\bapproval\s+(?:status|result|decision|outcome)\s*[:=]?\s*(?:denied|rejected|revoked|cancell?ed|blocked|failed|no|false)\b/i.test(normalized) ||
    /\b(?:operator\s+)?approval\s*[:=]\s*(?:no|false)\b/i.test(normalized)
  ) {
    throw new Error(`${label} must cite positive operator approval evidence`);
  }
}

function assertNoBroadcastPositiveEvidence(value: string, label: string): void {
  const normalized = normalizeEvidenceMarkerText(value);
  if (
    /\bBRIDGE_BROADCAST_ENABLED\s*=\s*true\b/i.test(normalized) ||
    /\bbroadcast\s+(?:enabled|approved|authorized|authorization)\b/i.test(normalized) ||
    /\bbroadcast\s+(?:status|mode|state)\s*[:=]?\s*(?:enabled|approved|authorized|true|yes)\b/i.test(normalized) ||
    /\bbroadcast\s*[:=]\s*(?:enabled|approved|authorized|true|yes)\b/i.test(normalized) ||
    /\b(?:enable|enabled|enabling|approve|approved|authorize|authorized)\s+broadcast\b/i.test(normalized) ||
    /\bnpm(?:\.cmd)?\s+run\s+settle:aggregate\s+--\s+submit\b/i.test(normalized) ||
    /\/transactions\/(?:send|broadcast)\b/i.test(normalized)
  ) {
    throw new Error(`${label} must not cite broadcast-enabled evidence`);
  }
}

function assertPositiveNonBroadcastScope(value: string, label: string): void {
  const normalized = normalizeEvidenceMarkerText(value);
  if (
    !/(?:^|[\s|,;([{])non-broadcast(?:$|[\s|,;)\]}])/i.test(normalized) ||
    /\b(?:not|without|missing|lacks?|no)\s+non-broadcast\b/i.test(normalized) ||
    /\bnon-broadcast\s*[:=]\s*(?:no|false)\b/i.test(normalized)
  ) {
    throw new Error(`${label} must cite positive non-broadcast scope`);
  }
}

function assertPositiveCompletedApprovalEvidenceTarget(value: string, label: string): void {
  const normalized = normalizeEvidenceMarkerText(value);
  if (
    !/(?:^|[\s|,;([{])completed\s+approval\s+evidence\s+target(?:$|[\s|,;)\]}])/i.test(normalized) ||
    /\b(?:not|without|missing|lacks?|no)\s+completed\s+approval\s+evidence\s+target\b/i.test(normalized) ||
    /\bcompleted\s+approval\s+evidence\s+target\s*[:=]\s*(?:no|false)\b/i.test(normalized)
  ) {
    throw new Error(`${label} must cite positive completed approval evidence target`);
  }
}

function assertApprovalEvidenceBindings(
  approval: NormalizedAggregateSettlementApproval,
  index: number,
): void {
  const burnTxHashes = approval.mode === 'batch' ? approval.burnTxHashes : [approval.burnTxHash];
  const burnSet = burnTxHashes.join(',');
  const baseTerms: Array<[string, string]> = [
    ['Expected transaction ID', approval.expectedTxId],
    ['non-broadcast approval scope', 'non-broadcast'],
    ['completed approval evidence target', 'completed approval evidence target'],
  ];
  assertEvidenceTextIncludes(
    approval.evidence,
    `approval[${index}].evidence`,
    [
      ...baseTerms,
      ...burnTxHashes.map((burnTxHash, burnIndex): [string, string] => [
        `burnTxHash ${burnIndex + 1}`,
        burnTxHash,
      ]),
      approval.mode === 'batch' ? ['ordered burn set', burnSet] : ['burnTxHash', burnTxHashes[0]],
    ],
  );
  assertExactModeBinding(approval.evidence, `approval[${index}].evidence`, approval.mode);
  assertPositiveOperatorApprovalEvidence(approval.evidence, `approval[${index}].evidence`);
  assertPositiveCompletedApprovalEvidenceTarget(approval.evidence, `approval[${index}].evidence`);
  assertPositiveNonBroadcastScope(approval.evidence, `approval[${index}].evidence`);
  assertNoBroadcastPositiveEvidence(approval.evidence, `approval[${index}].evidence`);
  assertEvidenceTextIncludes(
    approval.checkEvidence,
    `approval[${index}].checkEvidence`,
    [
      ['check command', approval.checkCommand],
      ['non-broadcast check scope', 'non-broadcast'],
      ['PASS check result', 'PASS'],
      ['Expected transaction ID', approval.expectedTxId],
      ...burnTxHashes.map((burnTxHash, burnIndex): [string, string] => [
        `burnTxHash ${burnIndex + 1}`,
        burnTxHash,
      ]),
      approval.mode === 'batch' ? ['ordered burn set', burnSet] : ['burnTxHash', burnTxHashes[0]],
    ],
  );
  assertPositiveCheckCommandEvidence(
    approval.checkEvidence,
    `approval[${index}].checkEvidence`,
    approval.checkCommand,
  );
  assertExactModeBinding(approval.checkEvidence, `approval[${index}].checkEvidence`, approval.mode);
  assertInternallyPositivePassEvidence(approval.checkEvidence, `approval[${index}].checkEvidence`);
  assertPositiveNonBroadcastScope(approval.checkEvidence, `approval[${index}].checkEvidence`);
  assertNoBroadcastPositiveEvidence(approval.checkEvidence, `approval[${index}].checkEvidence`);
}

function assertCheckEvidenceJsonBindings(
  approval: NormalizedAggregateSettlementApproval,
  index: number,
  baseDir: string | undefined,
  approvalNodeOrigin: string,
): string | undefined {
  if (baseDir === undefined) return undefined;

  const evidencePath = resolve(baseDir, approval.checkEvidenceJson);
  const relativePath = relative(baseDir, evidencePath);
  if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`approval[${index}].checkEvidenceJson must stay inside the approvals directory`);
  }

  let resolvedEvidencePath: string;
  try {
    const resolvedBaseDir = realpathSync(baseDir);
    resolvedEvidencePath = realpathSync(evidencePath);
    if (!isInsidePath(resolvedEvidencePath, resolvedBaseDir)) {
      throw new Error(`approval[${index}].checkEvidenceJson must stay inside the approvals directory`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('must stay inside')) {
      throw error;
    }
    throw new Error(`approval[${index}].checkEvidenceJson cannot be read as aggregate prebroadcast JSON`);
  }

  let rawText: string;
  let raw: unknown;
  try {
    rawText = readFileSync(resolvedEvidencePath, 'utf-8');
    raw = JSON.parse(rawText);
  } catch {
    throw new Error(`approval[${index}].checkEvidenceJson cannot be read as aggregate prebroadcast JSON`);
  }

  const recordErrors = validateAggregateSettlementPrebroadcastEvidenceRecord(raw);
  if (recordErrors.length > 0) {
    throw new Error(
      `approval[${index}].checkEvidenceJson aggregate prebroadcast JSON is invalid: ${recordErrors.join('; ')}`,
    );
  }
  const record = raw as AggregateSettlementPrebroadcastEvidenceRecord;
  if (record.transactionCheck.checkerIdentity.nodeOrigin !== approvalNodeOrigin) {
    throw new Error(
      `approval[${index}].checkEvidenceJson checker node origin must match approval-file ergoNodeUrl`,
    );
  }
  const parts = approval.checkCommand.split(/\s+/);
  const command = parts[4];
  if (record.command !== command) {
    throw new Error(`approval[${index}].checkEvidenceJson command must match approval checkCommand`);
  }
  const expectedTxId = record.transactionCheck.expectedTxId.toLowerCase();
  if (expectedTxId !== approval.expectedTxId) {
    throw new Error(`approval[${index}].checkEvidenceJson Expected transaction ID must match approval expectedTxId`);
  }

  const recordBurnTxHashes = record.claims.map(claim => normalizeHex32(claim.burnTxHash, `approval[${index}].checkEvidenceJson burnTxHash`));
  const approvalBurnTxHashes = approval.mode === 'batch' ? approval.burnTxHashes : [approval.burnTxHash];
  if (recordBurnTxHashes.length !== approvalBurnTxHashes.length) {
    throw new Error(`approval[${index}].checkEvidenceJson burnTxHashes must match approval burnTxHashes`);
  }
  for (let burnIndex = 0; burnIndex < approvalBurnTxHashes.length; burnIndex += 1) {
    if (recordBurnTxHashes[burnIndex] !== approvalBurnTxHashes[burnIndex]) {
      throw new Error(`approval[${index}].checkEvidenceJson burnTxHashes must match approval burnTxHashes in order`);
    }
  }

  if (command === 'check-batch' && approval.mode === 'batch') {
    const recordBridgeEventRootHexes = record.claims.map((claim, claimIndex) =>
      normalizeHex32(claim.bridgeEventRootHex, `approval[${index}].checkEvidenceJson bridgeEventRootHexes[${claimIndex}]`),
    );
    if (!sameOrderedValues(recordBridgeEventRootHexes, approval.bridgeEventRootHexes)) {
      throw new Error(
        `approval[${index}].checkEvidenceJson bridgeEventRootHexes must match approval bridgeEventRootHexes in order`,
      );
    }
  }

  if (command === 'check-with-ingest') {
    const claim = record.claims[0];
    if (claim.sidechainHeaderHashHex?.toLowerCase() !== parts[6]) {
      throw new Error(`approval[${index}].checkEvidenceJson sidechainHeaderHashHex must match approval checkCommand`);
    }
    if (claim.bridgeEventRootHex?.toLowerCase() !== parts[7]) {
      throw new Error(`approval[${index}].checkEvidenceJson bridgeEventRootHex must match approval checkCommand`);
    }
    if (String(claim.ergoAnchorHeight) !== parts[8]) {
      throw new Error(`approval[${index}].checkEvidenceJson ergoAnchorHeight must match approval checkCommand`);
    }
  }
  if (command === 'check-anchored' && String(record.claims[0].ergoAnchorHeight) !== parts[6]) {
    throw new Error(`approval[${index}].checkEvidenceJson ergoAnchorHeight must match approval checkCommand`);
  }
  return createHash('sha256').update(rawText, 'utf8').digest('hex');
}

function isInsidePath(path: string, parent: string): boolean {
  const relativePath = relative(parent, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function sameOrderedValues(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeIsoUtcTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be an ISO UTC timestamp`);
  }
  const trimmed = value.trim();
  if (!isIsoUtcTimestamp(trimmed)) {
    throw new Error(`${label} must be a valid ISO UTC timestamp`);
  }
  return trimmed;
}

function normalizeNonNegativeSafeIntegerString(value: unknown, label: string): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return parsed;
}

function normalizeApprovalMetadata(
  approval: Record<string, unknown>,
  index: number,
  now: Date,
): Pick<
  NormalizedSingleAggregateSettlementApproval,
  'approvedAt' | 'expiresAt' | 'evidence' | 'checkCommand' | 'checkEvidence' | 'checkEvidenceJson'
> {
  const approvedAt = normalizeIsoUtcTimestamp(approval.approvedAt, `approval[${index}].approvedAt`);
  const expiresAt = normalizeIsoUtcTimestamp(approval.expiresAt, `approval[${index}].expiresAt`);
  if (Date.parse(approvedAt) > now.getTime()) {
    throw new Error(`approval[${index}].approvedAt must not be in the future`);
  }
  if (Date.parse(expiresAt) <= now.getTime()) {
    throw new Error(`approval[${index}].expiresAt must be in the future`);
  }

  return {
    approvedAt,
    expiresAt,
    evidence: normalizeEvidenceTarget(approval.evidence, `approval[${index}].evidence`),
    checkCommand: normalizeCheckCommand(approval.checkCommand, `approval[${index}].checkCommand`),
    checkEvidence: normalizeEvidenceTarget(approval.checkEvidence, `approval[${index}].checkEvidence`),
    checkEvidenceJson: normalizeCheckEvidenceJsonTarget(
      approval.checkEvidenceJson,
      `approval[${index}].checkEvidenceJson`,
    ),
  };
}

function assertContextMatch(actual: string, expected: string | undefined, label: string): void {
  if (expected === undefined) return;
  if (actual !== expected) {
    throw new Error(`aggregate settlement approvals file ${label} must match runtime context`);
  }
}

function assertCaseInsensitiveContextMatch(actual: string, expected: string | undefined, label: string): void {
  if (expected === undefined) return;
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`aggregate settlement approvals file ${label} must match runtime context`);
  }
}

function normalizeApprovalFileMetadata(
  raw: RawApprovalFile,
  now: Date,
  context?: AggregateSettlementApprovalContext,
): { ergoNodeUrl: string } {
  const createdAt = normalizeIsoUtcTimestamp(raw.createdAt, 'aggregate settlement approvals file createdAt');
  if (Date.parse(createdAt) > now.getTime()) {
    throw new Error('aggregate settlement approvals file createdAt must not be in the future');
  }

  const environment = normalizeNetwork(raw.environment, 'aggregate settlement approvals file environment');
  const ergoNodeNetwork = normalizeNetwork(
    raw.ergoNodeNetwork ?? raw.ergoNetwork,
    'aggregate settlement approvals file ergoNodeNetwork',
  );
  const ergoNodeUrl = canonicalNodeOrigin(
    String(raw.ergoNodeUrl ?? ''),
    'aggregate settlement approvals file ergoNodeUrl',
  );
  const sidechainNetwork = normalizeNetwork(
    raw.sidechainNetwork,
    'aggregate settlement approvals file sidechainNetwork',
  );
  const sidechainRpcUrl = normalizeApprovalUrl(
    raw.sidechainRpcUrl,
    'aggregate settlement approvals file sidechainRpcUrl',
  );
  const sidechainWsUrl = normalizeApprovalUrl(
    raw.sidechainWsUrl,
    'aggregate settlement approvals file sidechainWsUrl',
  );
  const deployedStateHash = normalizeHex32(
    raw.deployedStateHash,
    'aggregate settlement approvals file deployedStateHash',
  );

  assertCaseInsensitiveContextMatch(environment, context?.environment, 'environment');
  assertCaseInsensitiveContextMatch(ergoNodeNetwork, context?.ergoNodeNetwork, 'ergoNodeNetwork');
  assertContextMatch(ergoNodeUrl, context?.ergoNodeUrl === undefined
    ? undefined
    : canonicalNodeOrigin(context.ergoNodeUrl, 'runtime context ergoNodeUrl'), 'ergoNodeUrl');
  assertCaseInsensitiveContextMatch(sidechainNetwork, context?.sidechainNetwork, 'sidechainNetwork');
  assertContextMatch(sidechainRpcUrl, context?.sidechainRpcUrl === undefined
    ? undefined
    : normalizeApprovalUrl(context.sidechainRpcUrl, 'runtime context sidechainRpcUrl'), 'sidechainRpcUrl');
  assertContextMatch(sidechainWsUrl, context?.sidechainWsUrl === undefined
    ? undefined
    : normalizeApprovalUrl(context.sidechainWsUrl, 'runtime context sidechainWsUrl'), 'sidechainWsUrl');
  assertContextMatch(deployedStateHash, context?.deployedStateHash === undefined
    ? undefined
    : normalizeHex32(context.deployedStateHash, 'runtime context deployedStateHash'), 'deployedStateHash');
  return { ergoNodeUrl };
}

function singleKey(mode: SingleAggregateSettlementApprovalMode, burnTxHash: string): string {
  return `${mode}:${burnTxHash}`;
}

function batchKey(burnTxHashes: string[]): string {
  return burnTxHashes.join(',');
}

function parseApproval(
  raw: unknown,
  index: number,
  now: Date,
  checkEvidenceBaseDir: string | undefined,
  approvalNodeOrigin: string,
): NormalizedAggregateSettlementApproval {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`approval[${index}] must be an object`);
  }
  const approval = raw as Record<string, unknown>;
  const mode = normalizeMode(approval.mode, index);
  const expectedTxId = normalizeHex32(approval.expectedTxId, `approval[${index}].expectedTxId`);
  const metadata = normalizeApprovalMetadata(approval, index, now);

  if (mode === 'batch') {
    if (!Array.isArray(approval.burnTxHashes) || approval.burnTxHashes.length < 2) {
      throw new Error(`approval[${index}].burnTxHashes must include at least two burn tx hashes`);
    }
    const burnTxHashes = approval.burnTxHashes.map((burnTxHash, burnIndex) =>
      normalizeHex32(burnTxHash, `approval[${index}].burnTxHashes[${burnIndex}]`),
    );
    if (burnTxHashes.length > BATCH_UNLOCK_MAX_CLAIMS) {
      throw new Error(`approval[${index}].burnTxHashes must include at most ${BATCH_UNLOCK_MAX_CLAIMS} burn tx hashes`);
    }
    if (new Set(burnTxHashes).size !== burnTxHashes.length) {
      throw new Error(`approval[${index}].burnTxHashes must not contain duplicates`);
    }
    const bridgeEventRootHexes = normalizeHex32Array(
      approval.bridgeEventRootHexes,
      `approval[${index}].bridgeEventRootHexes`,
    );
    if (bridgeEventRootHexes.length !== burnTxHashes.length) {
      throw new Error(`approval[${index}].bridgeEventRootHexes must include one root per burn tx hash`);
    }
    assertBatchCheckCommandMatchesOrderedBurns(metadata.checkCommand, burnTxHashes, index);
    const parsed = { mode, burnTxHashes, bridgeEventRootHexes, expectedTxId, ...metadata };
    assertApprovalEvidenceBindings(parsed, index);
    const checkEvidenceJsonDigestHex = assertCheckEvidenceJsonBindings(
      parsed,
      index,
      checkEvidenceBaseDir,
      approvalNodeOrigin,
    );
    return { ...parsed, checkEvidenceJsonDigestHex };
  }

  const burnTxHash = normalizeHex32(approval.burnTxHash, `approval[${index}].burnTxHash`);
  assertSingleCheckCommandMatchesBurn(metadata.checkCommand, burnTxHash, mode, index);
  const parsed = {
    mode,
    burnTxHash,
    expectedTxId,
    ...metadata,
  };
  assertApprovalEvidenceBindings(parsed, index);
  const checkEvidenceJsonDigestHex = assertCheckEvidenceJsonBindings(
    parsed,
    index,
    checkEvidenceBaseDir,
    approvalNodeOrigin,
  );
  return { ...parsed, checkEvidenceJsonDigestHex };
}

interface ParsedAggregateSettlementApprovalFile {
  approvals: NormalizedAggregateSettlementApproval[];
  metadata: { ergoNodeUrl: string };
}

function parseApprovalFile(
  text: string,
  now: Date,
  context?: AggregateSettlementApprovalContext,
): ParsedAggregateSettlementApprovalFile {
  let raw: RawApprovalFile;
  try {
    raw = JSON.parse(text) as RawApprovalFile;
  } catch {
    throw new Error('aggregate settlement approvals file must be valid JSON');
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('aggregate settlement approvals file must be a JSON object');
  }
  if (raw.version !== 2) {
    throw new Error('aggregate settlement approvals file version must be 2');
  }
  const metadata = normalizeApprovalFileMetadata(raw, now, context);
  if (!Array.isArray(raw.approvals)) {
    throw new Error('aggregate settlement approvals file must contain an approvals array');
  }
  if (raw.approvals.length === 0) {
    throw new Error('aggregate settlement approvals file must contain at least one approval');
  }

  return {
    approvals: raw.approvals.map((approval, index) =>
      parseApproval(approval, index, now, context?.checkEvidenceBaseDir, metadata.ergoNodeUrl),
    ),
    metadata,
  };
}

export function parseAggregateSettlementApprovalsText(
  text: string,
  now = new Date(),
  context?: AggregateSettlementApprovalContext,
): NormalizedAggregateSettlementApproval[] {
  return parseApprovalFile(text, now, context).approvals;
}

class StaticHistoricalAggregateSettlementApprovalLookup implements HistoricalAggregateSettlementApprovalLookup {
  private readonly singleApprovals = new Map<string, NormalizedSingleAggregateSettlementApproval>();
  private readonly batchApprovals = new Map<string, NormalizedBatchAggregateSettlementApproval>();
  private readonly now: () => Date;

  constructor(approvals: NormalizedAggregateSettlementApproval[]) {
    this.now = () => new Date();
    for (const approval of approvals) {
      if (!approval.checkEvidenceJsonDigestHex) {
        throw new Error('aggregate settlement approval lacks validated check evidence JSON provenance');
      }
      if (approval.mode === 'batch') {
        const key = batchKey(approval.burnTxHashes);
        if (this.batchApprovals.has(key)) {
          throw new Error('duplicate aggregate settlement batch approval');
        }
        this.batchApprovals.set(key, approval);
        continue;
      }

      const key = singleKey(approval.mode, approval.burnTxHash);
      if (this.singleApprovals.has(key)) {
        throw new Error(`duplicate aggregate settlement ${approval.mode} approval`);
      }
      this.singleApprovals.set(key, approval);
    }
  }

  expectedTxIdForSingle(
    burnTxHash: string,
    mode: SingleAggregateSettlementApprovalMode,
    at = this.now(),
  ): string | null {
    const normalizedBurnTxHash = normalizeHex32(burnTxHash, 'burnTxHash');
    const approval = this.singleApprovals.get(singleKey(mode, normalizedBurnTxHash));
    return approval && Date.parse(approval.expiresAt) > at.getTime()
      ? approval.expectedTxId
      : null;
  }

  expectedTxIdForBatch(burnTxHashes: string[], at = this.now()): string | null {
    if (burnTxHashes.length < 2) return null;
    const normalizedBurnTxHashes = burnTxHashes.map((burnTxHash, index) =>
      normalizeHex32(burnTxHash, `burnTxHashes[${index}]`),
    );
    const approval = this.batchApprovals.get(batchKey(normalizedBurnTxHashes));
    return approval && Date.parse(approval.expiresAt) > at.getTime()
      ? approval.expectedTxId
      : null;
  }
}

export function loadHistoricalAggregateSettlementApprovals(
  approvalsPath: string | undefined,
  now = new Date(),
  context?: AggregateSettlementApprovalContext,
): HistoricalAggregateSettlementApprovalLookup {
  if (!approvalsPath?.trim()) {
    throw new Error('legacy aggregate approval evidence path is required');
  }

  let text: string;
  try {
    text = readFileSync(approvalsPath, 'utf-8');
  } catch {
    throw new Error('aggregate settlement approvals file cannot be read');
  }
  const parsed = parseApprovalFile(text, now, {
    ...context,
    checkEvidenceBaseDir: dirname(resolve(approvalsPath)),
  });
  return new StaticHistoricalAggregateSettlementApprovalLookup(parsed.approvals);
}
