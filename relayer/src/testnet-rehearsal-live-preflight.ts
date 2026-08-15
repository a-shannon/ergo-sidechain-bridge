import { readFileSync, realpathSync } from 'fs';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'path';

import {
  type AggregateSettlementApprovalContext,
  parseAggregateSettlementApprovalsText,
  type NormalizedAggregateSettlementApproval,
  type SingleAggregateSettlementApprovalMode,
} from './aggregate-settlement-approvals.js';
import { BATCH_UNLOCK_MAX_CLAIMS } from './aggregate-settlement-limits.js';
import { LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE } from './legacy-aggregate-settlement-conservation.js';
import {
  extractBridgeEventRootHexes,
  sameOrderedBridgeEventRoots,
} from './bridge-event-root-evidence.js';
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
import { readEvidenceMarkdownTarget } from './evidence-target-path.js';
import { classifyPublicationClaimText } from './publication-claim-boundary.js';
import {
  HISTORICAL_SETTLEMENT_EVIDENCE_PURPOSE,
  LEGACY_AGGREGATE_SETTLEMENT_PROFILE_ID,
  type Gate3SettlementProfileBinding,
} from './gate3-settlement-profile.js';

export const LEGACY_V1_LIVE_PREFLIGHT_PROFILE =
  'e2s.legacy-v1-live-preflight-quarantine.v1' as const;
export const LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE =
  'Legacy V1 live-preflight is quarantined: historical approval and check evidence cannot authorize signing, submission, broadcast, or Gate 3 closure';

export type TestnetRehearsalLivePreflightStatus = 'BLOCKED';

export interface TestnetRehearsalLivePreflightInput {
  rehearsalTarget: string;
  approvalsTarget: string;
  transcriptTarget: string;
  runtimeBroadcastEnabled?: boolean;
  now?: Date;
}

export interface TestnetRehearsalLivePreflightReport {
  profile: typeof LEGACY_V1_LIVE_PREFLIGHT_PROFILE;
  settlementProfile: Gate3SettlementProfileBinding;
  status: TestnetRehearsalLivePreflightStatus;
  message: string;
  target: string;
  approvalsTarget: string;
  transcriptTarget: string;
  runtimeBroadcastEnabled: boolean;
  targetBindings: TestnetRehearsalLivePreflightTargetBindings;
  preSubmitBoundary: TestnetRehearsalLivePreflightBoundary;
  authorizationEvidence: TestnetRehearsalLivePreflightAuthorizationEvidence;
  approvalBinding?: TestnetRehearsalLivePreflightApprovalBindingEvidence;
  expectedTxId?: string;
  errors: string[];
  lines: string[];
}

export interface TestnetRehearsalLivePreflightTargetBindings {
  rehearsal: string;
  approvals: string;
  transcript: string;
}

export interface TestnetRehearsalLivePreflightBoundary {
  reportAuthorizesBroadcast: false;
  liveSubmitPerformed: false;
  confirmationObserved: false;
  reconciliationPerformed: false;
  gate3ClosureAllowed: false;
  productionReadyClaimAllowed: false;
  testnetProductionCandidateClaimAllowed: false;
}

export interface TestnetRehearsalLivePreflightAuthorizationEvidence {
  reviewerApproval: 'linked' | 'blocked';
  userApproval: 'linked' | 'blocked';
  scopedBroadcastShell: 'linked' | 'blocked';
  readinessAfterEnable: 'linked' | 'blocked';
  broadcastPolicyPass: 'linked' | 'blocked';
  liveSettlementReadinessPass: 'linked' | 'blocked';
  networkReconfirmation: 'linked' | 'blocked';
  approvalJsonBinding: 'matched' | 'blocked';
  releaseGateTranscriptLine: 'emitted' | 'blocked';
}

export interface TestnetRehearsalLivePreflightApprovalBindingEvidence {
  command: 'check' | 'check-with-ingest' | 'check-anchored' | 'check-batch';
  mode: SingleAggregateSettlementApprovalMode | 'batch';
  expectedTxId: string;
  burnTxHashes: string[];
  bridgeEventRootHexes?: string[];
  sidechainHeaderHashHex?: string;
  bridgeEventRootHex?: string;
  ergoAnchorHeight?: number;
  environment?: string;
  ergoNodeNetwork?: string;
  sidechainNetwork?: string;
  deployedStateHash?: string;
}

interface FieldExpectation {
  field: string;
  pattern: RegExp;
  message: string;
}

const requiredSections = [
  '## Session Metadata',
  '## Dry-Run Settlement Evidence',
  '## Broadcast Enablement Evidence',
  '## Submit And Confirmation Evidence',
];

const requiredBroadcastFields = [
  'Reviewer approval recorded',
  'User approval recorded',
  '`BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell',
  'Readiness command re-run after enabling broadcast',
  'Broadcast policy reports `PASS`',
  'Live settlement readiness reports `PASS`',
  'Node URL and network re-confirmed',
];

const broadcastExpectations: FieldExpectation[] = [
  {
    field: '`BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell',
    pattern: /\bBRIDGE_BROADCAST_ENABLED\s*=\s*true\b/i,
    message: 'must cite BRIDGE_BROADCAST_ENABLED=true',
  },
  {
    field: '`BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell',
    pattern: /\byes\b/i,
    message: 'must contain yes',
  },
  {
    field: '`BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell',
    pattern: /\bintended shell\b/i,
    message: 'must name the intended shell',
  },
  {
    field: '`BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell',
    pattern: /\b(only|scoped|limited|no other shell)\b/i,
    message: 'must state the scope is limited',
  },
  {
    field: 'Readiness command re-run after enabling broadcast',
    pattern: /\bnpm run demo:readiness\b/i,
    message: 'must cite npm run demo:readiness',
  },
  {
    field: 'Readiness command re-run after enabling broadcast',
    pattern: /\bpass\b/i,
    message: 'must contain PASS',
  },
  {
    field: 'Broadcast policy reports `PASS`',
    pattern: /\bnpm run demo:readiness\b/i,
    message: 'must cite npm run demo:readiness',
  },
  {
    field: 'Broadcast policy reports `PASS`',
    pattern: /\bBroadcast policy\b/i,
    message: 'must cite Broadcast policy output',
  },
  {
    field: 'Broadcast policy reports `PASS`',
    pattern: /\bpass\b/i,
    message: 'must contain PASS',
  },
  {
    field: 'Live settlement readiness reports `PASS`',
    pattern: /\bnpm run demo:readiness\b/i,
    message: 'must cite npm run demo:readiness',
  },
  {
    field: 'Live settlement readiness reports `PASS`',
    pattern: /\bLive settlement signing\b/i,
    message: 'must cite Live settlement signing output',
  },
  {
    field: 'Live settlement readiness reports `PASS`',
    pattern: /\bpass\b/i,
    message: 'must contain PASS',
  },
];

const hex32Pattern = /(?:^|[^0-9a-fA-F])(?:0x)?([0-9a-fA-F]{64})(?![0-9a-fA-F])/g;
const completedEvidenceTargetRequirement =
  'must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence';
const blockedTargetLabel = '<blocked evidence target>';
const blockedApprovalTargetLabel = '<blocked approval target>';
const preSubmitBoundary: TestnetRehearsalLivePreflightBoundary = {
  reportAuthorizesBroadcast: false,
  liveSubmitPerformed: false,
  confirmationObserved: false,
  reconciliationPerformed: false,
  gate3ClosureAllowed: false,
  productionReadyClaimAllowed: false,
  testnetProductionCandidateClaimAllowed: false,
};

export function preflightTestnetRehearsalLive(
  input: TestnetRehearsalLivePreflightInput,
): TestnetRehearsalLivePreflightReport {
  const now = input.now ?? new Date();
  const target = readEvidenceMarkdownTarget(input.rehearsalTarget);
  const approvalTarget = resolveApprovalTarget(input.approvalsTarget);
  const approvalsTarget = approvalTarget.label;
  const transcriptTarget = formatEvidenceLabel(input.transcriptTarget);
  const runtimeBroadcastEnabled = input.runtimeBroadcastEnabled === true;
  const errors = [
    LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE,
    ...validateRuntimeBroadcastDisabled(runtimeBroadcastEnabled),
    ...target.errors,
    ...approvalTarget.errors,
    ...validateOutputTarget(input.rehearsalTarget, 'Rehearsal target', '--rehearsal'),
    ...validateOutputTarget(input.transcriptTarget, 'Transcript target', '--transcript'),
    ...validateDistinctEvidenceTargets(input),
  ];
  let expectedTxId: string | undefined;
  let approvalBindingEvidence: TestnetRehearsalLivePreflightApprovalBindingEvidence | undefined;

  if (target.errors.length === 0) {
    const sessionFields = parseSessionFields(target.markdown);
    const broadcastFields = parseBroadcastFields(target.markdown);
    expectedTxId = extractExpectedTxId(target.markdown, errors);
    errors.push(...validateRequiredSections(target.markdown));
    errors.push(...validateSessionNetworkScope(sessionFields));
    errors.push(...validatePreSubmitClaimBoundary(target.markdown));
    errors.push(...validateBroadcastEnablement(target.markdown, broadcastFields, sessionFields, expectedTxId));
    const approvalBinding = extractApprovalBinding(target.markdown, sessionFields, broadcastFields, expectedTxId);
    errors.push(...approvalBinding.errors);
    if (approvalBinding.binding) {
      approvalBindingEvidence = toApprovalBindingEvidence(approvalBinding.binding);
    }
    if (approvalTarget.path && approvalBinding.binding) {
      errors.push(...validateApprovalBinding(approvalTarget.path, approvalBinding.binding, now));
    }
  }

  const status: TestnetRehearsalLivePreflightStatus = 'BLOCKED';
  const message = `testnet rehearsal live preflight BLOCKED: ${errors.length} issue(s)`;
  const authorizationEvidence = buildBlockedAuthorizationEvidence();

  return {
    profile: LEGACY_V1_LIVE_PREFLIGHT_PROFILE,
    settlementProfile: {
      settlementProfileId: LEGACY_AGGREGATE_SETTLEMENT_PROFILE_ID,
      profileActivationStatus: 'QUARANTINED',
      evidencePurpose: HISTORICAL_SETTLEMENT_EVIDENCE_PURPOSE,
      activationEvidenceTarget: 'none',
    },
    status,
    message,
    target: target.label,
    approvalsTarget,
    transcriptTarget,
    runtimeBroadcastEnabled,
    targetBindings: {
      rehearsal: target.label,
      approvals: approvalsTarget,
      transcript: transcriptTarget,
    },
    preSubmitBoundary,
    authorizationEvidence,
    approvalBinding: approvalBindingEvidence,
    expectedTxId,
    errors,
    lines: buildReportLines({
      message,
      target: target.label,
      approvalsTarget,
      transcriptTarget,
      runtimeBroadcastEnabled,
      expectedTxId,
      errors,
    }),
  };
}

export function validateLivePreflightJsonReport(report: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(report)) {
    return ['live-preflight: JSON report must be an object'];
  }
  errors.push(LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE);
  if (report.profile !== LEGACY_V1_LIVE_PREFLIGHT_PROFILE) {
    errors.push(
      `live-preflight: JSON report profile must be ${LEGACY_V1_LIVE_PREFLIGHT_PROFILE}; a replacement settlement profile requires a separately versioned validator`,
    );
  }
  if (report.schemaVersion !== 1) {
    errors.push('live-preflight: JSON report schemaVersion must be 1');
  }
  if (report.status !== 'GO') {
    errors.push('live-preflight: JSON report status must be GO');
  }
  if (!Array.isArray(report.errors)) {
    errors.push('live-preflight: JSON report errors must be an array');
  } else if (report.errors.length > 0) {
    errors.push('live-preflight: JSON report errors must be empty');
  }
  if (!Array.isArray(report.lines) || report.lines.some(line => typeof line !== 'string')) {
    errors.push('live-preflight: JSON report lines must be an array of strings');
  } else if (report.lines.some(hasContradictoryValidationFailureMarker)) {
    errors.push('live-preflight: JSON report lines must not include contradictory failure markers');
  } else if (report.lines.some(hasUnresolvedEvidenceIssueMarker)) {
    errors.push('live-preflight: JSON report lines must not include remaining issues');
  }
  if (report.runtimeBroadcastEnabled !== false) {
    errors.push('live-preflight: JSON report runtimeBroadcastEnabled must be false');
  }
  if (typeof report.expectedTxId !== 'string' || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(report.expectedTxId)) {
    errors.push('live-preflight: JSON report expectedTxId must be 32-byte hex');
  }

  const targetBindings = isRecord(report.targetBindings) ? report.targetBindings : undefined;
  const targetBindingValues: Partial<Record<keyof TestnetRehearsalLivePreflightTargetBindings, string>> = {};
  for (const field of ['rehearsal', 'approvals', 'transcript'] as const) {
    if (!targetBindings || typeof targetBindings[field] !== 'string' || targetBindings[field].trim().length === 0) {
      errors.push(`live-preflight: JSON report targetBindings.${field} must be present`);
    } else {
      targetBindingValues[field] = targetBindings[field].trim();
    }
  }
  for (const field of ['rehearsal', 'approvals', 'transcript'] as const) {
    const target = targetBindingValues[field];
    if (target && hasShellUnsafeTargetContent(target)) {
      errors.push(`live-preflight: JSON report targetBindings.${field} must not contain whitespace or shell metacharacters`);
    }
  }
  if (targetBindingValues.rehearsal && !isConcreteEvidenceTarget(targetBindingValues.rehearsal)) {
    errors.push('live-preflight: JSON report targetBindings.rehearsal must cite a concrete completed rehearsal target');
  }
  if (targetBindingValues.approvals && !isConcreteJsonEvidenceTarget(targetBindingValues.approvals)) {
    errors.push('live-preflight: JSON report targetBindings.approvals must cite a concrete non-template JSON approvals target');
  }
  if (targetBindingValues.transcript && !isConcreteEvidenceTarget(targetBindingValues.transcript)) {
    errors.push('live-preflight: JSON report targetBindings.transcript must cite a concrete non-template transcript target');
  }

  const preSubmitBoundary = isRecord(report.preSubmitBoundary) ? report.preSubmitBoundary : undefined;
  for (const field of [
    'reportAuthorizesBroadcast',
    'liveSubmitPerformed',
    'confirmationObserved',
    'reconciliationPerformed',
    'gate3ClosureAllowed',
    'productionReadyClaimAllowed',
    'testnetProductionCandidateClaimAllowed',
  ] as const) {
    if (!preSubmitBoundary || preSubmitBoundary[field] !== false) {
      errors.push(`live-preflight: JSON report preSubmitBoundary.${field} must be false`);
    }
  }

  const authorizationEvidence = isRecord(report.authorizationEvidence) ? report.authorizationEvidence : undefined;
  for (const field of [
    'reviewerApproval',
    'userApproval',
    'scopedBroadcastShell',
    'readinessAfterEnable',
    'broadcastPolicyPass',
    'liveSettlementReadinessPass',
    'networkReconfirmation',
  ] as const) {
    if (!authorizationEvidence || authorizationEvidence[field] !== 'linked') {
      errors.push(`live-preflight: JSON report authorizationEvidence.${field} must be linked`);
    }
  }
  if (!authorizationEvidence || authorizationEvidence.approvalJsonBinding !== 'matched') {
    errors.push('live-preflight: JSON report authorizationEvidence.approvalJsonBinding must be matched');
  }
  if (!authorizationEvidence || authorizationEvidence.releaseGateTranscriptLine !== 'emitted') {
    errors.push('live-preflight: JSON report authorizationEvidence.releaseGateTranscriptLine must be emitted');
  }

  errors.push(...validateApprovalBindingEvidence(report.approvalBinding, report.expectedTxId));

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

function hasUnresolvedEvidenceIssueMarker(segment: string): boolean {
  return hasUnresolvedIssueMarker(normalizeEvidenceMarkerText(segment));
}

function validateApprovalBindingEvidence(value: unknown, reportExpectedTxId: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return ['live-preflight: JSON report approvalBinding must be present'];
  }

  const command = typeof value.command === 'string' ? value.command : undefined;
  const mode = typeof value.mode === 'string' ? value.mode : undefined;
  const expectedTxId = normalizeHex32Value(value.expectedTxId);
  const burnTxHashes = normalizeHex32ArrayValue(value.burnTxHashes);
  const bridgeEventRootHexes = normalizeHex32ArrayValue(value.bridgeEventRootHexes);

  if (!['check', 'check-with-ingest', 'check-anchored', 'check-batch'].includes(command ?? '')) {
    errors.push('live-preflight: JSON report approvalBinding.command must be a supported aggregate check command');
  }
  if (!['single', 'single-with-ingest', 'batch'].includes(mode ?? '')) {
    errors.push('live-preflight: JSON report approvalBinding.mode must be single, single-with-ingest, or batch');
  }
  if (expectedTxId === undefined) {
    errors.push('live-preflight: JSON report approvalBinding.expectedTxId must be 32-byte hex');
  } else if (typeof reportExpectedTxId === 'string' && expectedTxId !== normalizeHex32Value(reportExpectedTxId)) {
    errors.push('live-preflight: JSON report approvalBinding.expectedTxId must match expectedTxId');
  }
  if (burnTxHashes === undefined) {
    errors.push('live-preflight: JSON report approvalBinding.burnTxHashes must be a non-empty 32-byte hex array');
  } else if (hasDuplicateHex32Values(burnTxHashes)) {
    errors.push('live-preflight: JSON report approvalBinding.burnTxHashes must not contain duplicates');
  }

  if (command === 'check-batch') {
    if (mode !== 'batch') {
      errors.push('live-preflight: JSON report approvalBinding.mode must be batch for check-batch');
    }
    if ((burnTxHashes?.length ?? 0) < 2) {
      errors.push('live-preflight: JSON report approvalBinding.burnTxHashes must include at least two burns for check-batch');
    }
    if ((burnTxHashes?.length ?? 0) > BATCH_UNLOCK_MAX_CLAIMS) {
      errors.push(
        `live-preflight: JSON report approvalBinding.burnTxHashes must not exceed batch unlock cap (${BATCH_UNLOCK_MAX_CLAIMS} claims)`,
      );
    }
    if (bridgeEventRootHexes === undefined || bridgeEventRootHexes.length !== burnTxHashes?.length) {
      errors.push('live-preflight: JSON report approvalBinding.bridgeEventRootHexes must include one ordered root per batch burn');
    }
  } else if (command === 'check-with-ingest') {
    if (mode !== 'single-with-ingest') {
      errors.push('live-preflight: JSON report approvalBinding.mode must be single-with-ingest for check-with-ingest');
    }
    if ((burnTxHashes?.length ?? 0) !== 1) {
      errors.push('live-preflight: JSON report approvalBinding.burnTxHashes must include exactly one burn for check-with-ingest');
    }
    const bridgeEventRootHex = normalizeHex32Value(value.bridgeEventRootHex);
    if (normalizeHex32Value(value.sidechainHeaderHashHex) === undefined) {
      errors.push('live-preflight: JSON report approvalBinding.sidechainHeaderHashHex must be 32-byte hex for check-with-ingest');
    }
    if (bridgeEventRootHex === undefined) {
      errors.push('live-preflight: JSON report approvalBinding.bridgeEventRootHex must be 32-byte hex for check-with-ingest');
    }
    if (bridgeEventRootHexes === undefined || bridgeEventRootHexes.length !== 1 || bridgeEventRootHexes[0] !== bridgeEventRootHex) {
      errors.push('live-preflight: JSON report approvalBinding.bridgeEventRootHexes must match bridgeEventRootHex for check-with-ingest');
    }
    if (!isNonNegativeSafeInteger(value.ergoAnchorHeight)) {
      errors.push('live-preflight: JSON report approvalBinding.ergoAnchorHeight must be a non-negative integer for check-with-ingest');
    }
  } else if (command === 'check-anchored') {
    if (mode !== 'single-with-ingest') {
      errors.push('live-preflight: JSON report approvalBinding.mode must be single-with-ingest for check-anchored');
    }
    if ((burnTxHashes?.length ?? 0) !== 1) {
      errors.push('live-preflight: JSON report approvalBinding.burnTxHashes must include exactly one burn for check-anchored');
    }
    if (!isNonNegativeSafeInteger(value.ergoAnchorHeight)) {
      errors.push('live-preflight: JSON report approvalBinding.ergoAnchorHeight must be a non-negative integer for check-anchored');
    }
  } else if (command === 'check') {
    if (mode !== 'single') {
      errors.push('live-preflight: JSON report approvalBinding.mode must be single for check');
    }
    if ((burnTxHashes?.length ?? 0) !== 1) {
      errors.push('live-preflight: JSON report approvalBinding.burnTxHashes must include exactly one burn for check');
    }
  }

  if (value.deployedStateHash !== undefined && normalizeHex32Value(value.deployedStateHash) === undefined) {
    errors.push('live-preflight: JSON report approvalBinding.deployedStateHash must be 32-byte hex when present');
  }
  if (value.environment !== undefined && typeof value.environment !== 'string') {
    errors.push('live-preflight: JSON report approvalBinding.environment must be a string when present');
  }
  if (value.ergoNodeNetwork !== undefined && typeof value.ergoNodeNetwork !== 'string') {
    errors.push('live-preflight: JSON report approvalBinding.ergoNodeNetwork must be a string when present');
  }
  if (value.sidechainNetwork !== undefined && typeof value.sidechainNetwork !== 'string') {
    errors.push('live-preflight: JSON report approvalBinding.sidechainNetwork must be a string when present');
  }

  return errors;
}

function validatePreSubmitClaimBoundary(markdown: string): string[] {
  const errors: string[] = [];
  const lifecycleSection = sectionBetween(
    markdown,
    '## Lifecycle Gate Classification',
    '## Preflight Evidence',
  );
  const publicationFields = parseListFields(sectionBetween(
    markdown,
    '## Publication Evidence',
    '## Reviewer Sign-Off',
  ));
  const preSubmitBlockedLifecycleRows = [
    'Fresh testnet lifecycle',
    'Settlement submit evidence',
    'Confirmation evidence',
    'Reconciliation evidence',
  ];

  for (const gate of preSubmitBlockedLifecycleRows) {
    const row = extractLifecycleRow(lifecycleSection, gate);
    if (row && lifecycleRowStatus(row) === 'pass') {
      errors.push(`Pre-submit boundary: ${gate} must not be pass before live submit evidence is assembled`);
    }
  }

  for (const [field, message] of [
    ['Production-ready claim allowed by this rehearsal', 'Production-ready claim allowed by this rehearsal must be no'],
    ['Testnet production-candidate claim allowed by this rehearsal', 'Testnet production-candidate claim allowed by this rehearsal must be no'],
  ] as const) {
    const value = publicationFields.get(field);
    if (value !== undefined && !/^no\b/i.test(value.trim())) {
      errors.push(`Pre-submit boundary: ${message}`);
    }
  }

  return errors;
}

function validateRuntimeBroadcastDisabled(runtimeBroadcastEnabled: boolean): string[] {
  return runtimeBroadcastEnabled
    ? ['Runtime broadcast policy: BRIDGE_BROADCAST_ENABLED must be false or unset while running rehearsal:live-preflight']
    : [];
}

function extractLifecycleRow(markdown: string, gate: string): string | undefined {
  const rows = markdown
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('|') && line.endsWith('|') && line.split('|')[1]?.trim() === gate);
  return rows.length === 1 ? rows[0] : undefined;
}

function lifecycleRowStatus(row: string): string | undefined {
  const cells = row.split('|').map(cell => cell.trim()).filter((_, index, all) => index > 0 && index < all.length - 1);
  return cells[1]?.toLowerCase();
}

function buildBlockedAuthorizationEvidence(): TestnetRehearsalLivePreflightAuthorizationEvidence {
  return {
    reviewerApproval: 'blocked',
    userApproval: 'blocked',
    scopedBroadcastShell: 'blocked',
    readinessAfterEnable: 'blocked',
    broadcastPolicyPass: 'blocked',
    liveSettlementReadinessPass: 'blocked',
    networkReconfirmation: 'blocked',
    approvalJsonBinding: 'blocked',
    releaseGateTranscriptLine: 'blocked',
  };
}

type LiveApprovalMode = SingleAggregateSettlementApprovalMode | 'batch';

interface LiveApprovalBinding {
  command: LiveAggregateCheckCommand['command'];
  mode: LiveApprovalMode;
  burnTxHashes: string[];
  sidechainHeaderHashHex?: string;
  bridgeEventRootHex?: string;
  bridgeEventRootHexes?: string[];
  ergoAnchorHeight?: number;
  expectedTxId: string;
  context: AggregateSettlementApprovalContext;
}

type LiveAggregateCheckCommand =
  | {
    command: 'check';
    mode: 'single';
    burnTxHashes: string[];
  }
  | {
    command: 'check-with-ingest';
    mode: 'single-with-ingest';
    burnTxHashes: string[];
    sidechainHeaderHashHex: string;
    bridgeEventRootHex: string;
    ergoAnchorHeight: number;
  }
  | {
    command: 'check-anchored';
    mode: 'single-with-ingest';
    burnTxHashes: string[];
    ergoAnchorHeight: number;
  }
  | {
    command: 'check-batch';
    mode: 'batch';
    burnTxHashes: string[];
  };

function extractExpectedTxId(markdown: string, errors: string[]): string | undefined {
  const dryRunFields = parseListFields(sectionBetween(
    markdown,
    '## Dry-Run Settlement Evidence',
    '## Broadcast Enablement Evidence',
  ));
  const value = dryRunFields.get('Expected transaction ID') ?? '';
  if (isBlank(value)) {
    errors.push('Dry-Run Settlement Evidence: Expected transaction ID is required');
    return undefined;
  }

  const expectedTxId = extractSingleTxId(value);
  if (expectedTxId === undefined) {
    errors.push('Dry-Run Settlement Evidence: Expected transaction ID must include exactly one 32-byte hex transaction ID');
  }
  return expectedTxId;
}

function validateRequiredSections(markdown: string): string[] {
  const errors: string[] = [];
  let lastIndex = -1;

  for (const section of requiredSections) {
    const index = markdown.indexOf(section);
    if (index < 0) {
      errors.push(`${section}: missing required section`);
      continue;
    }
    if (index <= lastIndex) {
      errors.push(`${section}: section appears out of order`);
    }
    lastIndex = index;
  }

  return errors;
}

function parseSessionFields(markdown: string): Map<string, string> {
  return parseListFields(sectionBetween(
    markdown,
    '## Session Metadata',
    '## Lifecycle Gate Classification',
  ));
}

function parseBroadcastFields(markdown: string): Map<string, string> {
  return parseListFields(sectionBetween(
    markdown,
    '## Broadcast Enablement Evidence',
    '## Submit And Confirmation Evidence',
  ));
}

function validateSessionNetworkScope(sessionFields: Map<string, string>): string[] {
  const errors: string[] = [];
  const environment = sessionFields.get('Environment') ?? '';
  const ergoNetwork = sessionFields.get('Ergo node network') ?? '';
  const sidechainNetwork = sessionFields.get('Sidechain network') ?? '';

  if (environment !== 'testnet') {
    errors.push('Session Metadata: Environment must be testnet for live rehearsal preflight');
  }
  if (!identifiesPositiveTestnetNetwork(ergoNetwork)) {
    errors.push('Session Metadata: Ergo node network must positively identify testnet');
  }
  if (!identifiesAllowedSidechainNetwork(sidechainNetwork)) {
    errors.push('Session Metadata: Sidechain network must identify patched-devnet, testnet, or non-mainnet');
  }

  return errors;
}

function validateBroadcastEnablement(
  markdown: string,
  fields: Map<string, string>,
  sessionFields: Map<string, string>,
  expectedTxId: string | undefined,
): string[] {
  const section = sectionBetween(
    markdown,
    '## Broadcast Enablement Evidence',
    '## Submit And Confirmation Evidence',
  );
  const errors: string[] = [];

  errors.push(...validateDuplicateRequiredListFields('Broadcast Enablement Evidence', section, requiredBroadcastFields));

  for (const field of requiredBroadcastFields) {
    if (isBlank(fields.get(field) ?? '')) {
      errors.push(`Broadcast Enablement Evidence: ${field} is required`);
    }
  }
  for (const expectation of broadcastExpectations) {
    const value = fields.get(expectation.field) ?? '';
    if (!isBlank(value) && !expectation.pattern.test(value.trim())) {
      errors.push(`Broadcast Enablement Evidence: ${expectation.field} ${expectation.message}`);
    }
  }
  for (const field of requiredBroadcastFields) {
    const value = fields.get(field) ?? '';
    if (!isBlank(value) && !hasEvidenceMarker(value)) {
      errors.push(`Broadcast Enablement Evidence: ${field} must include a link, command, or artifact marker`);
    }
    if (!isBlank(value) && hasEvidenceMarker(value) && !hasCompletedEvidenceTarget(value)) {
      errors.push(`Broadcast Enablement Evidence: ${field} ${completedEvidenceTargetRequirement}`);
    }
  }

  errors.push(...validateReviewerApproval(markdown, fields, expectedTxId));
  errors.push(...validateUserApproval(fields, expectedTxId));
  errors.push(...validateNetworkReconfirmation(sessionFields, fields));

  return errors;
}

function validateReviewerApproval(
  markdown: string,
  broadcastFields: Map<string, string>,
  expectedTxId: string | undefined,
): string[] {
  const sessionFields = parseListFields(sectionBetween(
    markdown,
    '## Session Metadata',
    '## Lifecycle Gate Classification',
  ));
  const reviewer = sessionFields.get('Reviewer')?.trim() ?? '';
  const approval = broadcastFields.get('Reviewer approval recorded') ?? '';
  const errors: string[] = [];

  if (isBlank(approval)) return errors;
  if (!isBlank(reviewer) && !containsExactIdentity(approval, reviewer)) {
    errors.push(
      'Broadcast Enablement Evidence: Reviewer approval recorded must name the Session Metadata Reviewer',
    );
  }
  if (!/\bexplicit\b.*\blive broadcast approval\b/i.test(approval)) {
    errors.push(
      'Broadcast Enablement Evidence: Reviewer approval recorded must state explicit live broadcast approval',
    );
  }
  if (hasNegatedLiveBroadcastApproval(approval)) {
    errors.push(
      'Broadcast Enablement Evidence: Reviewer approval recorded must not negate explicit live broadcast approval',
    );
  }
  if (expectedTxId !== undefined && !containsCaseInsensitive(approval, expectedTxId)) {
    errors.push(
      'Broadcast Enablement Evidence: Reviewer approval recorded must cite Expected transaction ID',
    );
  }

  return errors;
}

function validateUserApproval(
  broadcastFields: Map<string, string>,
  expectedTxId: string | undefined,
): string[] {
  const approval = broadcastFields.get('User approval recorded') ?? '';
  const errors: string[] = [];

  if (isBlank(approval)) return errors;
  if (!/\buser\b/i.test(approval)) {
    errors.push('Broadcast Enablement Evidence: User approval recorded must identify user approval');
  }
  if (!/\bexplicit\b.*\blive broadcast approval\b/i.test(approval)) {
    errors.push(
      'Broadcast Enablement Evidence: User approval recorded must state explicit live broadcast approval',
    );
  }
  if (hasNegatedLiveBroadcastApproval(approval)) {
    errors.push(
      'Broadcast Enablement Evidence: User approval recorded must not negate explicit live broadcast approval',
    );
  }
  if (expectedTxId !== undefined && !containsCaseInsensitive(approval, expectedTxId)) {
    errors.push('Broadcast Enablement Evidence: User approval recorded must cite Expected transaction ID');
  }

  return errors;
}

function validateNetworkReconfirmation(
  sessionFields: Map<string, string>,
  broadcastFields: Map<string, string>,
): string[] {
  const ergoNetwork = sessionFields.get('Ergo node network')?.trim() ?? '';
  const sidechainNetwork = sessionFields.get('Sidechain network')?.trim() ?? '';
  const reconfirmed = broadcastFields.get('Node URL and network re-confirmed') ?? '';
  const errors: string[] = [];
  const nodeUrl = extractNodeUrl(reconfirmed);

  if (isBlank(reconfirmed)) return errors;
  if (!/\bNode URL\b/i.test(reconfirmed) || nodeUrl === undefined) {
    errors.push('Broadcast Enablement Evidence: Node URL and network re-confirmed must cite Node URL');
  }
  if (nodeUrl !== undefined && /https?:\/\/[^/\s;)]+@/i.test(nodeUrl)) {
    errors.push('Broadcast Enablement Evidence: Node URL and network re-confirmed must not include URL credentials');
  }
  if (
    !isBlank(ergoNetwork) &&
    (!containsCaseInsensitive(reconfirmed, 'Ergo node network') ||
      !containsCaseInsensitive(reconfirmed, ergoNetwork))
  ) {
    errors.push(
      'Broadcast Enablement Evidence: Node URL and network re-confirmed must name Session Metadata Ergo node network',
    );
  }
  if (
    !isBlank(sidechainNetwork) &&
    (!containsCaseInsensitive(reconfirmed, 'Sidechain network') ||
      !containsCaseInsensitive(reconfirmed, sidechainNetwork))
  ) {
    errors.push(
      'Broadcast Enablement Evidence: Node URL and network re-confirmed must name Session Metadata Sidechain network',
    );
  }
  if (
    hasForbiddenNetworkWording(reconfirmed) ||
    hasForbiddenNetworkWording(ergoNetwork) ||
    hasForbiddenNetworkWording(sidechainNetwork)
  ) {
    errors.push(
      'Broadcast Enablement Evidence: Node URL and network re-confirmed must not include mainnet or negated testnet network wording',
    );
  }

  return errors;
}

function extractApprovalBinding(
  markdown: string,
  sessionFields: Map<string, string>,
  broadcastFields: Map<string, string>,
  expectedTxId: string | undefined,
): { binding?: LiveApprovalBinding; errors: string[] } {
  const dryRunFields = parseListFields(sectionBetween(
    markdown,
    '## Dry-Run Settlement Evidence',
    '## Broadcast Enablement Evidence',
  ));
  const preflightFields = parseListFields(sectionBetween(
    markdown,
    '## Preflight Evidence',
    '## Dry-Run Settlement Evidence',
  ));
  const approvalEvidence = dryRunFields.get('Daemon approval evidence') ?? '';
  const errors: string[] = [];
  const command = extractAggregateCheckCommand(approvalEvidence);
  const bridgeEventRootHexes = extractDryRunBridgeEventRoots(dryRunFields, command, errors);
  const deployedStateHash = extractDeploymentStateHash(
    preflightFields.get('Clean deployment state evidence') ?? '',
  );
  const ergoNodeUrl = extractKeyedUrl(approvalEvidence, 'ergoNodeUrl') ??
    extractNodeUrl(broadcastFields.get('Node URL and network re-confirmed') ?? '');
  const sidechainRpcUrl = extractKeyedUrl(approvalEvidence, 'sidechainRpcUrl');
  const sidechainWsUrl = extractKeyedUrl(approvalEvidence, 'sidechainWsUrl');

  if (expectedTxId === undefined) {
    errors.push('Approvals: Expected transaction ID is required for approvals binding');
  }
  if (deployedStateHash === undefined) {
    errors.push('Approvals: Clean deployment state evidence must include deployment-state hash for approvals binding');
  }
  if (command === undefined) {
    errors.push('Approvals: Daemon approval evidence must cite a non-broadcast aggregate check command');
  }
  if (ergoNodeUrl === undefined) {
    errors.push('Approvals: Daemon approval evidence or network reconfirmation must cite ergoNodeUrl for approvals binding');
  }
  if (sidechainRpcUrl === undefined || sidechainWsUrl === undefined) {
    errors.push('Approvals: Daemon approval evidence must cite sidechainRpcUrl and sidechainWsUrl for approvals binding');
  }
  if (
    command?.command === 'check-with-ingest' &&
    bridgeEventRootHexes !== undefined &&
    command.bridgeEventRootHex !== bridgeEventRootHexes[0]
  ) {
    errors.push(
      'Approvals: Daemon approval evidence bridgeEventRootHex must match Dry-Run Settlement Evidence Bridge event root',
    );
  }

  if (
    expectedTxId === undefined ||
    deployedStateHash === undefined ||
    command === undefined ||
    ((command.command === 'check-with-ingest' || command.command === 'check-batch') &&
      bridgeEventRootHexes === undefined) ||
    ergoNodeUrl === undefined ||
    sidechainRpcUrl === undefined ||
    sidechainWsUrl === undefined
  ) {
    return { errors };
  }

  return {
    errors,
    binding: {
      command: command.command,
      mode: command.mode,
      burnTxHashes: command.burnTxHashes,
      sidechainHeaderHashHex: command.command === 'check-with-ingest' ? command.sidechainHeaderHashHex : undefined,
      bridgeEventRootHex: command.command === 'check-with-ingest' ? command.bridgeEventRootHex : undefined,
      bridgeEventRootHexes,
      ergoAnchorHeight:
        command.command === 'check-with-ingest' || command.command === 'check-anchored'
          ? command.ergoAnchorHeight
          : undefined,
      expectedTxId,
      context: {
        environment: valueOrUndefined(sessionFields.get('Environment')),
        ergoNodeNetwork: valueOrUndefined(sessionFields.get('Ergo node network')),
        ergoNodeUrl,
        sidechainNetwork: valueOrUndefined(sessionFields.get('Sidechain network')),
        sidechainRpcUrl,
        sidechainWsUrl,
        deployedStateHash,
      },
    },
  };
}

function validateApprovalBinding(
  approvalsPath: string,
  binding: LiveApprovalBinding,
  now: Date,
): string[] {
  const errors: string[] = [];
  try {
    const approvals = loadLivePreflightApprovals(approvalsPath, now, binding.context);
    const approval = approvals.find(candidate => approvalCommandMatchesLiveBinding(candidate, binding));
    if (!approval) {
      errors.push(missingLiveApprovalMessage(binding));
    } else if (approval.expectedTxId.toLowerCase() !== binding.expectedTxId) {
      errors.push('Approvals: approval Expected transaction ID does not match live-preflight rehearsal');
    } else if (!approvalBridgeRootsMatchLiveBinding(approval, binding)) {
      errors.push(approvalBridgeRootsMismatchMessage(binding));
    }
  } catch (err: any) {
    errors.push(`Approvals: ${err?.message ?? String(err)}`);
  }
  return errors;
}

function loadLivePreflightApprovals(
  approvalsPath: string,
  now: Date,
  context: AggregateSettlementApprovalContext,
): NormalizedAggregateSettlementApproval[] {
  let text: string;
  try {
    text = readFileSync(approvalsPath, 'utf-8');
  } catch {
    throw new Error('aggregate settlement approvals file cannot be read');
  }

  return parseAggregateSettlementApprovalsText(text, now, {
    ...context,
    checkEvidenceBaseDir: dirname(resolve(approvalsPath)),
  });
}

function approvalCommandMatchesLiveBinding(
  approval: NormalizedAggregateSettlementApproval,
  binding: LiveApprovalBinding,
): boolean {
  if (approval.mode !== binding.mode) return false;

  const command = extractAggregateCheckCommand(approval.checkCommand);
  if (command?.command !== binding.command) return false;
  if (!sameOrderedHexValues(command.burnTxHashes, binding.burnTxHashes)) return false;

  if (command.command === 'check-with-ingest') {
    return (
      command.sidechainHeaderHashHex === binding.sidechainHeaderHashHex &&
      command.bridgeEventRootHex === binding.bridgeEventRootHex &&
      command.ergoAnchorHeight === binding.ergoAnchorHeight
    );
  }
  if (command.command === 'check-anchored') {
    return command.ergoAnchorHeight === binding.ergoAnchorHeight;
  }

  return true;
}

function approvalBridgeRootsMatchLiveBinding(
  approval: NormalizedAggregateSettlementApproval,
  binding: LiveApprovalBinding,
): boolean {
  if (binding.command !== 'check-batch') return true;
  return approval.mode === 'batch' &&
    binding.bridgeEventRootHexes !== undefined &&
    sameOrderedBridgeEventRoots(approval.bridgeEventRootHexes, binding.bridgeEventRootHexes);
}

function approvalBridgeRootsMismatchMessage(binding: LiveApprovalBinding): string {
  if (binding.command === 'check-batch') {
    return 'Approvals: approval check-batch bridgeEventRootHexes must match Dry-Run Settlement Evidence Bridge event roots in order';
  }
  return 'Approvals: approval bridgeEventRootHexes must match live-preflight evidence';
}

function toApprovalBindingEvidence(binding: LiveApprovalBinding): TestnetRehearsalLivePreflightApprovalBindingEvidence {
  return {
    command: binding.command,
    mode: binding.mode,
    expectedTxId: binding.expectedTxId,
    burnTxHashes: binding.burnTxHashes,
    bridgeEventRootHexes: binding.bridgeEventRootHexes,
    sidechainHeaderHashHex: binding.sidechainHeaderHashHex,
    bridgeEventRootHex: binding.bridgeEventRootHex,
    ergoAnchorHeight: binding.ergoAnchorHeight,
    environment: binding.context.environment,
    ergoNodeNetwork: binding.context.ergoNodeNetwork,
    sidechainNetwork: binding.context.sidechainNetwork,
    deployedStateHash: binding.context.deployedStateHash,
  };
}

function missingLiveApprovalMessage(binding: LiveApprovalBinding): string {
  if (binding.command === 'check-with-ingest') {
    return 'Approvals: approval check-with-ingest command must match live-preflight daemon approval evidence';
  }
  if (binding.command === 'check-anchored') {
    return 'Approvals: approval check-anchored command must match live-preflight daemon approval evidence';
  }
  return `Approvals: missing matching ${binding.mode} approval for ${binding.burnTxHashes.join(',')}`;
}

function sameOrderedHexValues(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function extractAggregateCheckCommand(
  value: string,
): LiveAggregateCheckCommand | undefined {
  const parts = value.split(/\s+/).map(part => part.replace(/^[`"'(]+|[`"',;).]+$/g, ''));
  for (let index = 0; index < parts.length - 5; index += 1) {
    if (
      parts[index] !== 'npm' &&
      parts[index] !== 'npm.cmd'
    ) {
      continue;
    }
    if (parts[index + 1] !== 'run' || parts[index + 2] !== 'settle:aggregate' || parts[index + 3] !== '--') {
      continue;
    }

    const command = parts[index + 4];
    if (command === 'check-batch') {
      const burnTxHashes = collectHexTokens(parts, index + 5);
      return burnTxHashes.length >= 2 ? { command, mode: 'batch', burnTxHashes } : undefined;
    }
    if (command === 'check') {
      const burnTxHash = normalizeHexToken(parts[index + 5]);
      return burnTxHash ? { command, mode: 'single', burnTxHashes: [burnTxHash] } : undefined;
    }
    if (command === 'check-with-ingest') {
      const burnTxHash = normalizeHexToken(parts[index + 5]);
      const sidechainHeaderHashHex = normalizeHexToken(parts[index + 6]);
      const bridgeEventRootHex = normalizeHexToken(parts[index + 7]);
      const ergoAnchorHeight = normalizeNonNegativeSafeIntegerToken(parts[index + 8]);
      return burnTxHash && sidechainHeaderHashHex && bridgeEventRootHex && ergoAnchorHeight !== undefined
        ? {
          command,
          mode: 'single-with-ingest',
          burnTxHashes: [burnTxHash],
          sidechainHeaderHashHex,
          bridgeEventRootHex,
          ergoAnchorHeight,
        }
        : undefined;
    }
    if (command === 'check-anchored') {
      const burnTxHash = normalizeHexToken(parts[index + 5]);
      const ergoAnchorHeight = normalizeNonNegativeSafeIntegerToken(parts[index + 6]);
      return burnTxHash && ergoAnchorHeight !== undefined
        ? { command, mode: 'single-with-ingest', burnTxHashes: [burnTxHash], ergoAnchorHeight }
        : undefined;
    }
  }
  return undefined;
}

function extractDryRunBridgeEventRoots(
  dryRunFields: Map<string, string>,
  command: LiveAggregateCheckCommand | undefined,
  errors: string[],
): string[] | undefined {
  if (command?.command !== 'check-with-ingest' && command?.command !== 'check-batch') return undefined;

  if (command.command === 'check-batch') {
    const value = dryRunFields.get('Bridge event roots') ?? '';
    if (isBlank(value)) {
      errors.push(
        'Dry-Run Settlement Evidence: Bridge event roots are required for check-batch approvals binding',
      );
      return undefined;
    }

    const roots = extractBridgeEventRootHexes(value);
    if (roots.length !== command.burnTxHashes.length) {
      errors.push(
        'Dry-Run Settlement Evidence: Bridge event roots must include exactly one 32-byte hex root for each ordered batch burn',
      );
      return undefined;
    }
    return roots;
  }

  const value = dryRunFields.get('Bridge event root') ?? '';
  if (isBlank(value)) {
    errors.push(
      'Dry-Run Settlement Evidence: Bridge event root is required for check-with-ingest approvals binding',
    );
    return undefined;
  }

  const bridgeEventRoot = extractSingleTxId(value);
  if (bridgeEventRoot === undefined) {
    errors.push(
      'Dry-Run Settlement Evidence: Bridge event root must include exactly one 32-byte hex root',
    );
  }
  return bridgeEventRoot === undefined ? undefined : [bridgeEventRoot];
}

function collectHexTokens(parts: string[], startIndex: number): string[] {
  const values: string[] = [];
  for (let index = startIndex; index < parts.length; index += 1) {
    const normalized = normalizeHexToken(parts[index]);
    if (!normalized) break;
    values.push(normalized);
  }
  return values;
}

function normalizeHexToken(value: string | undefined): string | undefined {
  const clean = value?.replace(/^[`"'(]+|[`"',;).]+$/g, '').replace(/^0x/i, '');
  return clean && /^[0-9a-fA-F]{64}$/.test(clean) ? clean.toLowerCase() : undefined;
}

function normalizeHex32Value(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim().replace(/^0x/i, '');
  return /^[0-9a-fA-F]{64}$/.test(clean) ? clean.toLowerCase() : undefined;
}

function normalizeHex32ArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const normalized = value.map(normalizeHex32Value);
  return normalized.every((item): item is string => item !== undefined) ? normalized : undefined;
}

function hasDuplicateHex32Values(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

function isNonNegativeSafeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function normalizeNonNegativeSafeIntegerToken(value: string | undefined): number | undefined {
  const clean = value?.replace(/^[`"'(]+|[`"',;).]+$/g, '');
  if (!clean || !/^\d+$/.test(clean)) return undefined;
  const parsed = Number(clean);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function extractDeploymentStateHash(value: string): string | undefined {
  const match =
    /\b(?:deployment[- ]state|deployedStateHash)\s*(?:hash|digest)?\s*(?:=|:|is)?\s*(?:0x)?([0-9a-fA-F]{64})\b/i.exec(value);
  return match?.[1].toLowerCase();
}

function extractKeyedUrl(value: string, key: string): string | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escapedKey}\\s*(?:=|:)?\\s*((?:https?|wss?)://[^\\s;,)]*)`, 'i').exec(value)?.[1];
}

function valueOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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
  for (const match of section.matchAll(/^- ([^:\n]+):[^\S\r\n]*(.*)$/gm)) {
    fields.set(match[1].trim(), match[2].trim());
  }
  return fields;
}

function isBlank(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length === 0 || /\s\/\s/.test(trimmed);
}

function extractSingleTxId(value: string): string | undefined {
  const matches = [...value.matchAll(hex32Pattern)].map(match => match[1].toLowerCase());
  const uniqueMatches = [...new Set(matches)];
  return uniqueMatches.length === 1 ? uniqueMatches[0] : undefined;
}

function containsCaseInsensitive(value: string, expected: string): boolean {
  return value.toLowerCase().includes(expected.toLowerCase());
}

function containsExactIdentity(value: string, identity: string): boolean {
  const escaped = identity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`).test(value);
}

function hasNegatedLiveBroadcastApproval(value: string): boolean {
  return (
    /\b(?:no|not|without|missing|absent|denied|declined|rejected|revoked|unapproved)\b.{0,100}\b(?:explicit\s+)?live broadcast approval\b/i.test(value) ||
    /\b(?:did|does|do)\s+not\b.{0,100}\b(?:explicit\s+)?live broadcast approval\b/i.test(value) ||
    /\b(?:explicit\s+)?live broadcast approval\b.{0,100}\b(?:not|missing|absent|denied|declined|rejected|revoked|unapproved)\b/i.test(value)
  );
}

function identifiesPositiveTestnetNetwork(value: string): boolean {
  return /\btest[- ]?net\b/i.test(value) && !hasForbiddenNetworkWording(value);
}

function identifiesAllowedSidechainNetwork(value: string): boolean {
  if (isBlank(value) || hasForbiddenNetworkWording(value)) return false;
  return (
    /\bpatched[- ]?devnet\b/i.test(value) ||
    /\btest[- ]?net\b/i.test(value) ||
    /\bnon[- ]?main[- ]?net\b/i.test(value)
  );
}

function hasForbiddenNetworkWording(value: string): boolean {
  const valueWithoutNonMainnet = value.replace(/\bnon[- ]?main[- ]?net\b/gi, '');
  return (
    /\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/i.test(valueWithoutNonMainnet) ||
    /\b(?:non[- ]?test[- ]?net|no|not|without|missing|absent|unavailable|unconnected|disconnected)\b.{0,80}\btest[- ]?net\b/i.test(value) ||
    /\btest[- ]?net\b.{0,80}\b(?:not|missing|absent|unavailable|unconnected|disconnected)\b/i.test(value)
  );
}

function extractNodeUrl(value: string): string | undefined {
  return /\bhttps?:\/\/[^\s;)]+/i.exec(value)?.[0];
}

function formatEvidenceLabel(target: string): string {
  const trimmedTarget = target.trim();
  const normalized = trimmedTarget.replace(/\\/g, '/').toLowerCase();
  if (isSensitiveApprovalTarget(normalized)) return blockedTargetLabel;
  if (isLocalAbsoluteTarget(normalized) || isLocalFileUrl(normalized)) return blockedTargetLabel;
  if (escapesRelayerRoot(normalized)) return blockedTargetLabel;
  return trimmedTarget;
}

interface ResolvedApprovalTarget {
  path?: string;
  label: string;
  errors: string[];
}

function resolveApprovalTarget(target: string): ResolvedApprovalTarget {
  const trimmed = target.trim();
  const label = trimmed ? formatApprovalTargetLabel(trimmed) : '<missing approval target>';
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
  const label = target ? formatApprovalTargetLabel(target) : '<missing approval target>';
  const normalized = target.replace(/\\/g, '/').toLowerCase();
  const name = basename(normalized);
  const extension = extname(name);
  const errors: string[] = [];

  if (isBlank(target)) {
    errors.push('Approvals: --approvals is required to prove live-preflight approval binding');
    return errors;
  }
  if (hasPlaceholderTarget(target)) {
    errors.push('Approvals: --approvals must not be a template, placeholder, or non-concrete target');
  }
  if (extension !== '.json') {
    errors.push(`Approvals: ${label} must be a JSON file`);
  }
  if (isLocalAbsoluteTarget(normalized) || isLocalFileUrl(normalized)) {
    errors.push(`Approvals: ${label} must be a relative path inside the bridge repository`);
  }
  if (hasUriSchemeTarget(normalized) && !isLocalAbsoluteTarget(normalized) && !isLocalFileUrl(normalized)) {
    errors.push(`Approvals: ${label} must not be a URI because live-preflight must load the approval JSON`);
  }
  if (escapesRelayerRoot(normalized)) {
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
    hasUriSchemeTarget(normalized) ||
    isLocalAbsoluteTarget(normalized) ||
    isLocalFileUrl(normalized)
  ) {
    return blockedApprovalTargetLabel;
  }
  if (escapesRelayerRoot(normalized)) {
    return blockedApprovalTargetLabel;
  }
  return target;
}

function validateOutputTarget(target: string, labelPrefix: string, argName: string): string[] {
  const trimmedTarget = target.trim();
  const label = formatEvidenceLabel(trimmedTarget);
  const normalized = trimmedTarget.replace(/\\/g, '/').toLowerCase();
  const errors: string[] = [];

  if (isBlank(target)) {
    errors.push(`${labelPrefix}: ${argName} is required`);
  }
  if (hasPlaceholderTarget(trimmedTarget)) {
    errors.push(`${labelPrefix}: ${argName} must not be a template, placeholder, or non-concrete target`);
  }
  if (isLocalAbsoluteTarget(normalized)) {
    errors.push(`${label}: refusing to print local absolute evidence paths`);
  }
  if (isLocalFileUrl(normalized)) {
    errors.push(`${label}: refusing to print local file URLs as evidence`);
  }
  if (/https?:\/\/[^/\s;)]+@/i.test(trimmedTarget)) {
    errors.push(`${label}: refusing to print credential-bearing evidence URLs`);
  }
  if (escapesRelayerRoot(normalized)) {
    errors.push(`${label}: refusing evidence paths outside the bridge repository`);
  }
  if (isSensitiveApprovalTarget(normalized)) {
    errors.push(`${label}: refusing secret-bearing or runtime-state evidence targets`);
  }
  if (labelPrefix === 'Approvals target' && !isJsonTarget(normalized)) {
    errors.push(`${labelPrefix}: ${argName} must identify an aggregate approvals JSON file target`);
  }
  if (labelPrefix === 'Transcript target' && !hasCompletedEvidenceTarget(trimmedTarget)) {
    errors.push(`${labelPrefix}: ${argName} must be a completed artifact target or non-template evidence link`);
  }

  return errors;
}

function validateDistinctEvidenceTargets(input: TestnetRehearsalLivePreflightInput): string[] {
  const errors: string[] = [];
  const rehearsal = normalizeComparableTarget(input.rehearsalTarget);
  const approvals = normalizeComparableTarget(input.approvalsTarget);
  const transcript = normalizeComparableTarget(input.transcriptTarget);

  if (approvals === rehearsal) {
    errors.push('Approvals target must be distinct from rehearsal target');
  }
  if (transcript === rehearsal) {
    errors.push('Transcript target must be distinct from rehearsal target');
  }
  if (transcript === approvals) {
    errors.push('Transcript target must be distinct from approvals target');
  }

  return errors;
}

function normalizeComparableTarget(target: string): string {
  const unwrappedTarget = target.trim().replace(/^\[[^\]]+\]\(([^)]+)\)$/, '$1');
  return unwrappedTarget
    .split('#')[0]
    .split('?')[0]
    .replace(/[),;]+$/g, '')
    .replace(/\\/g, '/')
    .toLowerCase();
}

function isJsonTarget(normalized: string): boolean {
  return normalized.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').endsWith('.json');
}

function hasPlaceholderTarget(target: string): boolean {
  return (
    /<[^>]+>|\{\{[^}]+\}}/.test(target) ||
    hasNonConcreteEvidenceTargetSegment(target)
  );
}

function isConcreteEvidenceTarget(target: string): boolean {
  const normalized = target.trim().replace(/\\/g, '/').toLowerCase();
  return (
    normalized.length > 0 &&
    !hasPlaceholderTarget(target) &&
    !isLocalAbsoluteTarget(normalized) &&
    !isLocalFileUrl(normalized) &&
    !escapesRelayerRoot(normalized) &&
    !isSensitiveApprovalTarget(normalized) &&
    !hasClaimEscalatingLivePreflightEvidenceTarget(normalized) &&
    !/https?:\/\/[^/\s;)]+@/i.test(target)
  );
}

function isConcreteJsonEvidenceTarget(target: string): boolean {
  return isConcreteEvidenceTarget(target) && isJsonTarget(target.trim().replace(/\\/g, '/').toLowerCase());
}

function hasShellUnsafeTargetContent(target: string): boolean {
  const normalized = target.trim().replace(/\\/g, '/');
  if (/^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._/-]+$/i.test(normalized)) {
    return false;
  }
  return !/^[A-Za-z0-9._/-]+$/.test(normalized);
}

function hasNonConcreteEvidenceTargetSegment(value: string): boolean {
  return value
    .trim()
    .replace(/\\/g, '/')
    .toLowerCase()
    .split(/[\\/]+/)
    .some(segment => isNonConcreteEvidenceTargetSegment(segment));
}

function isNonConcreteEvidenceTargetSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /(?:^|[-_.])(?:not[-_]?completed|uncompleted)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])template(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|live|preflight|rehearsal|approval|approvals)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])sample(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|live|preflight|rehearsal|approval|approvals)|$)/i.test(normalized) ||
    /(?:^|[-_.])example(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|validator|live|preflight|rehearsal|approval|approvals)|$)/i.test(normalized)
  );
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
  const name = normalized.split('/').filter(Boolean).at(-1) ?? '';
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

function isLocalAbsoluteTarget(normalized: string): boolean {
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith('/');
}

function isLocalFileUrl(normalized: string): boolean {
  return /^file:\/\/\/(?:[a-z]:|\/)/i.test(normalized);
}

function hasUriSchemeTarget(normalized: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(normalized);
}

function escapesRelayerRoot(normalized: string): boolean {
  if (hasUriSchemeTarget(normalized) || isLocalAbsoluteTarget(normalized)) {
    return false;
  }

  let depthFromRelayer = 0;
  const parts = normalized.split('/').filter(part => part.length > 0 && part !== '.');
  for (const part of parts) {
    depthFromRelayer += part === '..' ? -1 : 1;
    if (depthFromRelayer < -1) return true;
  }
  return false;
}

function isInsidePath(path: string, parent: string): boolean {
  const relativePath = relative(parent, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function validateDuplicateRequiredListFields(
  label: string,
  section: string,
  requiredFields: string[],
): string[] {
  const counts = new Map<string, number>();
  for (const match of section.matchAll(/^- ([^:\n]+):[^\S\r\n]*(.*)$/gm)) {
    const field = match[1].trim();
    counts.set(field, (counts.get(field) ?? 0) + 1);
  }

  const errors: string[] = [];
  for (const field of requiredFields) {
    if ((counts.get(field) ?? 0) > 1) {
      errors.push(`${label}: ${field}: duplicate required field`);
    }
  }
  return errors;
}

function hasEvidenceMarker(value: string): boolean {
  return (
    /\[[^\]]+\]\([^)]+\)/.test(value) ||
    /\bnpm(?:\.cmd)?\s+run\s+[A-Za-z0-9:_-]+\b/.test(value) ||
    /(?:^|\s)artifact:\/\//.test(value)
  );
}

function hasCompletedEvidenceTarget(value: string): boolean {
  return !hasLocalOnlyEvidenceTarget(value) &&
    !hasClaimEscalatingLivePreflightEvidenceReference(value) &&
    (hasCompletedArtifactTarget(value) || hasNonTemplateMarkdownLink(value));
}

function hasCompletedArtifactTarget(value: string): boolean {
  return extractArtifactTargets(value).some(isCompletedEvidenceTarget);
}

function extractArtifactTargets(value: string): string[] {
  return [...value.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+)/g)]
    .map(([, target]) => target);
}

function extractEvidenceTargets(value: string): string[] {
  return [
    ...extractArtifactTargets(value),
    ...[...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(([, target]) => target.trim()),
  ];
}

function hasNonTemplateMarkdownLink(value: string): boolean {
  const links = [...value.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
  return links.some(([, target]) => isCompletedEvidenceTarget(target.trim()));
}

function isCompletedEvidenceTarget(target: string): boolean {
  const normalizedTarget = target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').toLowerCase();
  return (
    !isLocalOnlyEvidenceTarget(normalizedTarget) &&
    !hasClaimEscalatingLivePreflightEvidenceTarget(normalizedTarget) &&
    !/-template\.md(?:[#?].*)?$/i.test(normalizedTarget) &&
    !/\b(?:not[-_ ]completed|uncompleted)\b/i.test(normalizedTarget) &&
    !hasNonConcreteEvidenceTargetSegment(normalizedTarget)
  );
}

function hasClaimEscalatingLivePreflightEvidenceReference(value: string): boolean {
  return extractEvidenceTargets(value)
    .some(target => hasClaimEscalatingLivePreflightEvidenceTarget(target));
}

function hasClaimEscalatingLivePreflightEvidenceTarget(target: string): boolean {
  const normalizedTarget = target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').toLowerCase();
  const claim = classifyPublicationClaimText(normalizedTarget);
  return claim.hasProductionClaim;
}

function hasLocalOnlyEvidenceTarget(value: string): boolean {
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(hasLocalOnlyEvidenceInspectionText);
}

function hasLocalOnlyEvidenceInspectionText(normalized: string): boolean {
  return hasEvidenceLocalOnlyInspectionReference(normalized);
}

function isLocalOnlyEvidenceTarget(value: string): boolean {
  const normalized = value.replace(/\\/g, '/');
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

function buildReportLines(input: {
  message: string;
  target: string;
  approvalsTarget: string;
  transcriptTarget: string;
  runtimeBroadcastEnabled: boolean;
  expectedTxId?: string;
  errors: string[];
}): string[] {
  const lines = [
    input.message,
    `- rehearsal target: ${input.target}`,
    `- approvals target: ${input.approvalsTarget}`,
    `- transcript target: ${input.transcriptTarget}`,
    `- runtime BRIDGE_BROADCAST_ENABLED: ${input.runtimeBroadcastEnabled ? 'enabled' : 'disabled'}`,
    `- Expected transaction ID: ${input.expectedTxId ?? '<missing>'}`,
    '- scope: offline Markdown-only evidence validation; this report does not authorize broadcast or lift the legacy V1 submission quarantine.',
  ];

  lines.push('- Remaining issues:');
  lines.push(...input.errors.map(error => `  - ${error}`));
  lines.push(`- Legacy V1 submission quarantine: ${LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE}`);
  lines.push('- Next safe step: activate a reviewed, separately versioned external-fee settlement profile with its own live-preflight schema; historical approval evidence cannot lift this quarantine.');

  return lines;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
