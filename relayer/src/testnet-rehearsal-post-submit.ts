import { basename } from 'path';

import {
  evidenceTargetInspectionVariants,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import {
  hasStructuredValidationFailureMarker,
  normalizeEvidenceMarkerText,
} from './evidence-hygiene.js';
import { classifyPublicationClaimText } from './publication-claim-boundary.js';
import { validateLivePreflightJsonReport } from './testnet-rehearsal-live-preflight.js';

export interface TestnetRehearsalPostSubmitInput {
  expectedTxId: string;
  submittedTxId: string;
  burnTxIds: string[];
  sourceBindings?: TestnetRehearsalPostSubmitSourceBindings;
  submissionArtifact: string;
  confirmationArtifact: string;
  finalityEvidenceArtifact: string;
  reconciliationArtifact: string;
  submissionTimestamp: string;
  firstObservedMempoolHeight: string | number;
  confirmationHeight: string | number;
  confirmationCount: string | number;
  confirmationsRequired: string | number;
  settlementOutputBoxIds: string[];
  dupSuccessorBoxId: string;
  spvTrackerSuccessorBoxId: string;
  recipientPayoutBoxId: string;
  recipientPayoutBoxIds?: string[];
  aggregateUnlockChange?: {
    outputIndex: number;
    boxId: string;
    ergoTreeHex: string;
    valueNanoErg: string | number | bigint;
    tokenless: true;
  };
  feeNanoErg: string | number | bigint;
  pegOutStatus: 'confirmed' | 'settled';
  failedEventQueue: string;
  manualRepairPerformed: 'yes' | 'no';
  livePreflightReport?: unknown;
  livePreflightReportTarget?: string;
}

export interface TestnetRehearsalPostSubmitReport {
  status: 'BLOCKED';
  message: string;
  errors: string[];
  markdown?: never;
  lines: string[];
  observation?: never;
  sourceBindings?: TestnetRehearsalPostSubmitSourceBindings;
}

export type TestnetRehearsalPostSubmitStateSourceTargetClass =
  | 'operator-provided-state-db';

export interface TestnetRehearsalPostSubmitSourceBindings {
  node: {
    sourceType: 'live-read-only-node';
    readOnly: true;
    noAuthHeader: true;
    ergoNodeUrl: string;
    observedAt: string;
    nodeHeight: number;
    nodeNetwork: string;
    expectedTxId: string;
    submittedTxId: string;
    operations: string[];
  };
  state: {
    sourceType: 'read-only-state-tracker';
    readOnly: true;
    runtimePathSerialized: false;
    targetClass: TestnetRehearsalPostSubmitStateSourceTargetClass;
    burnOrder: string[];
    operations: string[];
  };
}

interface NormalizedPostSubmitFacts {
  expectedTxId: string;
  submittedTxId: string;
  burnTxIds: string[];
  submissionTimestamp: string;
  firstObservedMempoolHeight: number;
  confirmationHeight: number;
  confirmationCount: number;
  confirmationsRequired: number;
  settlementOutputBoxIds: string[];
  dupSuccessorBoxId: string;
  spvTrackerSuccessorBoxId: string;
  recipientPayoutBoxId: string;
  recipientPayoutBoxIds: string[];
  aggregateUnlockChange?: {
    outputIndex: number;
    boxId: string;
    ergoTreeHex: string;
    valueNanoErg: string;
    tokenless: true;
  };
  feeNanoErg: string;
}

const ARTIFACT_TARGET_PATTERN = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s<>]+$/;
const ISO_SECONDS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
export const LEGACY_V1_POST_SUBMIT_QUARANTINE =
  'Legacy V1 post-submit production is retired; only separately versioned historical observation and reconciliation may consume an already submitted transaction';

export function buildTestnetRehearsalPostSubmitEvidence(
  input: TestnetRehearsalPostSubmitInput,
): TestnetRehearsalPostSubmitReport {
  const errors: string[] = [];
  const facts = normalizePostSubmitFacts(input, errors);

  validateArtifactTarget(errors, 'submission artifact', input.submissionArtifact);
  validateArtifactTarget(errors, 'confirmation artifact', input.confirmationArtifact);
  validateArtifactTarget(errors, 'finality evidence artifact', input.finalityEvidenceArtifact);
  validateArtifactTarget(errors, 'reconciliation artifact', input.reconciliationArtifact);
  validateDistinctArtifactTargets(errors, [
    ['submission artifact', input.submissionArtifact],
    ['confirmation artifact', input.confirmationArtifact],
    ['finality evidence artifact', input.finalityEvidenceArtifact],
    ['reconciliation artifact', input.reconciliationArtifact],
  ]);

  if (facts.expectedTxId && facts.submittedTxId && facts.expectedTxId !== facts.submittedTxId) {
    errors.push('Submitted transaction ID must match Expected transaction ID');
  }
  if (facts.burnTxIds.length === 0) {
    errors.push('At least one peg-out burn TX ID is required');
  }
  if (facts.confirmationHeight < facts.firstObservedMempoolHeight) {
    errors.push('Confirmation height must be greater than or equal to first observed mempool height');
  }
  if (facts.confirmationCount <= 0) {
    errors.push('Confirmation count must be greater than 0');
  }
  if (facts.confirmationsRequired <= 0) {
    errors.push('Required confirmation count must be greater than 0');
  }
  if (facts.confirmationCount < facts.confirmationsRequired) {
    errors.push('Observed confirmation count must be greater than or equal to required confirmation count');
  }
  validateLivePreflightReportTarget(errors, input.livePreflightReportTarget);
  validateLivePreflightReportBinding(errors, facts.expectedTxId, facts.burnTxIds, input.livePreflightReport);
  errors.push(LEGACY_V1_POST_SUBMIT_QUARANTINE);

  return {
    status: 'BLOCKED',
    message: `testnet rehearsal post-submit evidence BLOCKED: ${errors.length} issue(s)`,
    errors,
    lines: [
      `testnet rehearsal post-submit evidence BLOCKED: ${errors.length} issue(s)`,
      '- Boundary: the legacy producer cannot create positive post-submit evidence.',
      ...errors.map(error => `  - ${error}`),
    ],
  };
}

function normalizePostSubmitFacts(
  input: TestnetRehearsalPostSubmitInput,
  errors: string[],
): NormalizedPostSubmitFacts {
  const expectedTxId = normalizeFixedHex(errors, input.expectedTxId, 32, 'Expected transaction ID');
  const submittedTxId = normalizeFixedHex(errors, input.submittedTxId, 32, 'Submitted transaction ID');
  const burnTxIds = input.burnTxIds.map((burnTxId, index) =>
    normalizeFixedHex(errors, burnTxId, 32, `Peg-out burn TX ID ${index + 1}`),
  ).filter(value => value.length > 0);
  const settlementOutputBoxIds = input.settlementOutputBoxIds.map((boxId, index) =>
    normalizeFixedHex(errors, boxId, 32, `Settlement output box ID ${index + 1}`),
  ).filter(value => value.length > 0);
  const dupSuccessorBoxId = normalizeFixedHex(errors, input.dupSuccessorBoxId, 32, 'DUP successor box ID');
  const spvTrackerSuccessorBoxId =
    normalizeFixedHex(errors, input.spvTrackerSuccessorBoxId, 32, 'SPV tracker successor box ID');
  const rawRecipientPayoutBoxIds =
    input.recipientPayoutBoxIds && input.recipientPayoutBoxIds.length > 0
      ? input.recipientPayoutBoxIds
      : [input.recipientPayoutBoxId];
  const recipientPayoutBoxId =
    normalizeFixedHex(errors, input.recipientPayoutBoxId, 32, 'Recipient payout box ID');
  const recipientPayoutBoxIds = rawRecipientPayoutBoxIds.map((boxId, index) =>
    normalizeFixedHex(errors, boxId, 32, `Recipient payout box ID ${index + 1}`),
  ).filter(value => value.length > 0);
  const aggregateUnlockChange = normalizeAggregateUnlockChange(input.aggregateUnlockChange, errors);
  const firstObservedMempoolHeight =
    normalizeNonNegativeInteger(errors, input.firstObservedMempoolHeight, 'First observed mempool height');
  const confirmationHeight = normalizeNonNegativeInteger(errors, input.confirmationHeight, 'Confirmation height');
  const confirmationCount = normalizeNonNegativeInteger(errors, input.confirmationCount, 'Confirmation count');
  const confirmationsRequired =
    normalizeNonNegativeInteger(errors, input.confirmationsRequired, 'Required confirmation count');
  const feeNanoErg = normalizePositiveSafeIntegerString(errors, input.feeNanoErg, 'Miner fee output feeNanoErg');

  if (!ISO_SECONDS_PATTERN.test(input.submissionTimestamp)) {
    errors.push('Submission timestamp must use YYYY-MM-DDTHH:mm:ssZ');
  }
  if (settlementOutputBoxIds.length === 0) {
    errors.push('At least one settlement output box ID is required');
  }
  if (new Set(burnTxIds).size !== burnTxIds.length) {
    errors.push('Peg-out burn TX IDs must be unique');
  }
  if (recipientPayoutBoxIds.length === 0) {
    errors.push('At least one recipient payout box ID is required');
  }
  if (new Set(recipientPayoutBoxIds).size !== recipientPayoutBoxIds.length) {
    errors.push('Recipient payout box IDs must be unique');
  }
  if (burnTxIds.length > 0 && recipientPayoutBoxIds.length > 0 && burnTxIds.length !== recipientPayoutBoxIds.length) {
    errors.push('Peg-out burn TX ID count must match recipient payout box ID count');
  }
  if (
    recipientPayoutBoxId &&
    recipientPayoutBoxIds.length > 0 &&
    recipientPayoutBoxIds[0] !== recipientPayoutBoxId
  ) {
    errors.push('Recipient payout box ID must match the first recipient payout box IDs entry');
  }
  const settlementOutputBoxIdSet = new Set(settlementOutputBoxIds);
  if (dupSuccessorBoxId && !settlementOutputBoxIdSet.has(dupSuccessorBoxId)) {
    errors.push('Settlement output box IDs must include DUP successor box ID');
  }
  if (spvTrackerSuccessorBoxId && !settlementOutputBoxIdSet.has(spvTrackerSuccessorBoxId)) {
    errors.push('Settlement output box IDs must include SPV tracker successor box ID');
  }
  if (recipientPayoutBoxIds.some(boxId => !settlementOutputBoxIdSet.has(boxId))) {
    errors.push('Settlement output box IDs must include every recipient payout box ID');
  }
  if (settlementOutputBoxIds.length > 0 && burnTxIds.length > 0) {
    const minimumOutputCount = burnTxIds.length + 3;
    if (settlementOutputBoxIds.length < minimumOutputCount) {
      errors.push('Settlement output box IDs must include SPV, DUP, every payout, and final miner fee outputs');
    }
    if (spvTrackerSuccessorBoxId && settlementOutputBoxIds[0] !== spvTrackerSuccessorBoxId) {
      errors.push('SPV tracker successor box ID must be settlement output 1 / OUTPUTS(0)');
    }
    if (dupSuccessorBoxId && settlementOutputBoxIds[1] !== dupSuccessorBoxId) {
      errors.push('DUP successor box ID must be settlement output 2 / OUTPUTS(1)');
    }
    recipientPayoutBoxIds.forEach((boxId, index) => {
      if (settlementOutputBoxIds[2 + index] !== boxId) {
        errors.push(`Recipient payout box ID ${index + 1} must be settlement output ${3 + index} / OUTPUTS(${2 + index})`);
      }
    });
    const noChangeOutputCount = burnTxIds.length + 3;
    const withChangeOutputCount = burnTxIds.length + 4;
    const expectedChangeIndex = 2 + burnTxIds.length;
    if (settlementOutputBoxIds.length > noChangeOutputCount && !aggregateUnlockChange) {
      errors.push('Aggregate unlock change output must be explicitly bound when present');
    }
    if (settlementOutputBoxIds.length > withChangeOutputCount) {
      errors.push('Settlement output box IDs must contain at most one aggregate unlock change output');
    }
    if (aggregateUnlockChange) {
      if (aggregateUnlockChange.outputIndex !== expectedChangeIndex) {
        errors.push(`Aggregate unlock change output must be settlement output ${expectedChangeIndex + 1} / OUTPUTS(${expectedChangeIndex})`);
      }
      if (settlementOutputBoxIds.length !== withChangeOutputCount) {
        errors.push('Aggregate unlock change output requires exactly one change output before the final miner fee');
      }
      if (settlementOutputBoxIds[aggregateUnlockChange.outputIndex] !== aggregateUnlockChange.boxId) {
        errors.push('Aggregate unlock change output box ID must match settlement output vector');
      }
    }
  }

  return {
    expectedTxId,
    submittedTxId,
    burnTxIds,
    submissionTimestamp: input.submissionTimestamp,
    firstObservedMempoolHeight,
    confirmationHeight,
    confirmationCount,
    confirmationsRequired,
    settlementOutputBoxIds,
    dupSuccessorBoxId,
    spvTrackerSuccessorBoxId,
    recipientPayoutBoxId,
    recipientPayoutBoxIds,
    aggregateUnlockChange,
    feeNanoErg,
  };
}

function normalizeAggregateUnlockChange(
  change: TestnetRehearsalPostSubmitInput['aggregateUnlockChange'],
  errors: string[],
): NormalizedPostSubmitFacts['aggregateUnlockChange'] {
  if (!change) return undefined;
  const boxId = normalizeFixedHex(errors, change.boxId, 32, 'Aggregate unlock change output box ID');
  const ergoTreeHex = normalizeHex(errors, change.ergoTreeHex, 'Aggregate unlock change output ErgoTree');
  const valueNanoErg = normalizePositiveIntegerString(
    errors,
    change.valueNanoErg,
    'Aggregate unlock change output valueNanoErg',
  );
  if (!Number.isSafeInteger(change.outputIndex) || change.outputIndex < 0) {
    errors.push('Aggregate unlock change output index must be a non-negative safe integer');
  }
  if (change.tokenless !== true) {
    errors.push('Aggregate unlock change output must be tokenless');
  }
  if (
    !boxId ||
    !ergoTreeHex ||
    !valueNanoErg ||
    !Number.isSafeInteger(change.outputIndex) ||
    change.outputIndex < 0 ||
    change.tokenless !== true
  ) {
    return undefined;
  }
  return {
    outputIndex: change.outputIndex,
    boxId,
    ergoTreeHex,
    valueNanoErg,
    tokenless: true,
  };
}

function validateLivePreflightReportTarget(errors: string[], target: string | undefined): void {
  if (!target) {
    errors.push('Live-preflight report target is required');
    return;
  }

  const normalized = target.replace(/\\/g, '/').toLowerCase();
  if (!normalized.endsWith('.json')) {
    errors.push('Live-preflight report target must be a JSON evidence file');
  }
  if (
    hasNonConcretePostSubmitEvidenceTargetSegment(normalized) ||
    hasClaimEscalatingPostSubmitEvidenceTarget(normalized)
  ) {
    errors.push('Live-preflight report target must not be a template, placeholder, or non-concrete target');
  }
  if (normalized.includes('://')) {
    errors.push('Live-preflight report target must be a local repository-relative JSON target');
  }
  if (hasShellUnsafeTargetContent(target)) {
    errors.push('Live-preflight report target must not contain whitespace or shell metacharacters');
  }
  if (isLocalRuntimeOrSecretTarget(normalized)) {
    errors.push('Live-preflight report target must not reference local runtime or secret-bearing material');
  }
}

function validateLivePreflightReportBinding(
  errors: string[],
  expectedTxId: string,
  burnTxIds: string[],
  report: unknown,
): void {
  if (report === undefined) {
    errors.push('Live-preflight report is required');
    return;
  }
  if (!isRecord(report)) {
    errors.push('Live-preflight report must be a structured JSON object');
    return;
  }

  errors.push(...validateLivePreflightJsonReport(report).map(formatLivePreflightReportValidationError));

  const reportExpectedTxId = typeof report.expectedTxId === 'string'
    ? report.expectedTxId.toLowerCase().replace(/^0x/, '')
    : undefined;
  if (reportExpectedTxId && reportExpectedTxId !== expectedTxId) {
    errors.push('Live-preflight report Expected transaction ID must match post-submit Expected transaction ID');
  }
  const approvedBurnTxIds = extractLivePreflightApprovedBurnTxIds(report);
  if (
    approvedBurnTxIds &&
    (approvedBurnTxIds.length !== burnTxIds.length ||
      approvedBurnTxIds.some((burnTxId, index) => burnTxId !== burnTxIds[index]))
  ) {
    errors.push('Live-preflight report approvalBinding.burnTxHashes must match post-submit peg-out burn TX IDs in order');
  }

  const lines = Array.isArray(report.lines) ? report.lines.filter((line): line is string => typeof line === 'string') : [];
  const transcriptLine = lines.find(line => /npm run rehearsal:live-preflight command output:/i.test(line));
  if (!transcriptLine || !/\bPASS\b/.test(transcriptLine) || !transcriptLine.includes(expectedTxId)) {
    errors.push('Live-preflight report lines must include PASS transcript output bound to Expected transaction ID');
  } else if (hasContradictoryValidationFailureMarker(transcriptLine)) {
    errors.push('Live-preflight report lines must include internally positive PASS transcript output bound to Expected transaction ID');
  }
}

function hasContradictoryValidationFailureMarker(segment: string): boolean {
  const normalized = normalizeEvidenceMarkerText(segment);
  return (
    /(?:^|[^A-Za-z0-9_-])FAIL(?:$|[^A-Za-z0-9_-])/i.test(normalized) ||
    /(?:^|[^A-Za-z0-9_-])FAILED(?:$|[^A-Za-z0-9_-])/i.test(normalized) ||
    /\b(?:status|result|validation|validator|command|outcome)\s*[:=]?\s*FAILED\b/i.test(normalized) ||
    /\bFAILED\b\s+(?:validation|validator|command|run|result|status)\b/i.test(normalized) ||
    /\bBLOCKED\b/i.test(normalized) ||
    /\bERROR\b/i.test(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized)
  );
}

function extractLivePreflightApprovedBurnTxIds(report: Record<string, unknown>): string[] | undefined {
  const approvalBinding = isRecord(report.approvalBinding) ? report.approvalBinding : undefined;
  if (!approvalBinding || !Array.isArray(approvalBinding.burnTxHashes)) return undefined;
  const burnTxHashes = approvalBinding.burnTxHashes.map(value =>
    typeof value === 'string' ? value.trim().toLowerCase().replace(/^0x/, '') : '',
  );
  if (burnTxHashes.some(value => !/^[0-9a-f]{64}$/.test(value))) return undefined;
  return burnTxHashes;
}

function formatLivePreflightReportValidationError(error: string): string {
  const prefix = 'live-preflight: JSON report ';
  if (error.startsWith(prefix)) {
    return `Live-preflight report ${error.slice(prefix.length)}`;
  }
  return error;
}

function hasShellUnsafeTargetContent(target: string): boolean {
  return !/^[A-Za-z0-9._/-]+$/.test(target.replace(/\\/g, '/'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateArtifactTarget(errors: string[], label: string, target: string): void {
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  if (!ARTIFACT_TARGET_PATTERN.test(target)) {
    errors.push(`${label} must be a completed artifact:// target`);
  }
  if (
    hasNonConcretePostSubmitEvidenceTargetSegment(normalized) ||
    hasClaimEscalatingPostSubmitEvidenceTarget(normalized)
  ) {
    errors.push(`${label} must not be a template, placeholder, or non-concrete target`);
  }
  if (isLocalRuntimeOrSecretTarget(normalized)) {
    errors.push(`${label} must not reference local runtime or secret-bearing material`);
  }
}

function hasClaimEscalatingPostSubmitEvidenceTarget(target: string): boolean {
  const normalizedTarget = target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').toLowerCase();
  const claim = classifyPublicationClaimText(normalizedTarget);
  return claim.hasProductionClaim;
}

function isLocalRuntimeOrSecretTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(isLocalRuntimeOrSecretInspectionTarget);
}

function hasNonConcretePostSubmitEvidenceTargetSegment(value: string): boolean {
  return value
    .split('#')[0]
    .split('?')[0]
    .replace(/[),;]+$/g, '')
    .toLowerCase()
    .split(/[\\/]+/)
    .some(segment => isNonConcretePostSubmitEvidenceTargetSegment(segment));
}

function isNonConcretePostSubmitEvidenceTargetSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /[<>]/.test(segment) ||
    /(?:^|[-_.])(?:not[-_]?completed|uncompleted)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example)[-_ ]*evidence(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example|template)(?:[-_.](?:post|submit|submission|confirmation|confirm|finality|reconciliation|reconcile|live|preflight|report|observe|observation|artifact|target|log|run|check|row|evidence)|$)/i.test(normalized)
  );
}

function isLocalRuntimeOrSecretInspectionTarget(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasLocalOnlyInspectionReference(normalizedTarget) ||
    /^file:\/\//i.test(normalizedTarget) ||
    /^[a-z]:\//i.test(normalizedTarget) ||
    /^\/\/[^/]/.test(normalizedTarget) ||
    /^\/(?:users?|home|tmp|var|private|mnt|volumes|etc)(?:\/|$)/i.test(normalizedTarget) ||
    hasEnvironmentTargetSegment(normalizedTarget) ||
    hasRuntimeDatabaseTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalizedTarget, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
  );
}

function hasLocalOnlyInspectionReference(normalizedTarget: string): boolean {
  return /(?:^|[\s([<=])(?:file:\/\/|[a-z]:\/|\/\/[^/\s]|\/(?:users?|home|tmp|var|private|mnt|volumes|etc)(?:\/|$))/i
    .test(normalizedTarget);
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

function validateDistinctArtifactTargets(
  errors: string[],
  targets: Array<[label: string, target: string]>,
): void {
  const seen = new Map<string, string>();

  for (const [label, target] of targets) {
    const normalized = target.replace(/\\/g, '/').toLowerCase();
    if (validateArtifactTargetSilently(target).length > 0) continue;

    const previousLabel = seen.get(normalized);
    if (previousLabel) {
      errors.push(`Post-submit artifact targets must be distinct: ${previousLabel} and ${label} reuse the same evidence target`);
    } else {
      seen.set(normalized, label);
    }
  }
}

function validateArtifactTargetSilently(target: string): string[] {
  const errors: string[] = [];
  validateArtifactTarget(errors, 'artifact', target);
  return errors;
}

function normalizeFixedHex(
  errors: string[],
  value: string,
  expectedBytes: number,
  label: string,
): string {
  const clean = value?.startsWith('0x') ? value.slice(2) : value;
  if (!clean || !/^[0-9a-fA-F]+$/.test(clean)) {
    errors.push(`${label} must be hex`);
    return '';
  }
  if (clean.length !== expectedBytes * 2) {
    errors.push(`${label} must be ${expectedBytes} bytes`);
    return '';
  }
  return clean.toLowerCase();
}

function normalizeHex(errors: string[], value: string, label: string): string {
  const clean = value?.startsWith('0x') ? value.slice(2) : value;
  if (!clean || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    errors.push(`${label} must be hex`);
    return '';
  }
  return clean.toLowerCase();
}

function normalizeNonNegativeInteger(
  errors: string[],
  value: string | number,
  label: string,
): number {
  const raw = String(value);
  if (!/^\d+$/.test(raw)) {
    errors.push(`${label} must be a non-negative integer`);
    return 0;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) {
    errors.push(`${label} must be a safe integer`);
    return 0;
  }
  return parsed;
}

function normalizePositiveIntegerString(
  errors: string[],
  value: string | number | bigint,
  label: string,
): string {
  const raw = String(value);
  if (!/^[1-9]\d*$/.test(raw)) {
    errors.push(`${label} must be a positive integer`);
    return '';
  }
  return raw;
}

function normalizePositiveSafeIntegerString(
  errors: string[],
  value: string | number | bigint,
  label: string,
): string {
  const raw = normalizePositiveIntegerString(errors, value, label);
  if (!raw) return '';
  if (!Number.isSafeInteger(Number(raw))) {
    errors.push(`${label} must be a positive safe integer`);
    return '';
  }
  return raw;
}
