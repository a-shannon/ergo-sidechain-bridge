import { basename } from 'path';

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
import type { TestnetRecoveryDrillKind } from './testnet-recovery-drill-evidence.js';

export interface RecoveryObserveJsonValidation {
  errors: string[];
  kind?: TestnetRecoveryDrillKind;
}

const RECOVERY_KINDS = new Set<TestnetRecoveryDrillKind>([
  'failed-broadcast-phantom-avl',
  'reorged-burn-stale-singleton',
]);

export function validateRecoveryObserveJsonReport(
  report: unknown,
  expectedKind?: TestnetRecoveryDrillKind,
): RecoveryObserveJsonValidation {
  const errors: string[] = [];

  if (!isRecord(report)) {
    return { errors: ['recovery-observe: JSON report must be an object'] };
  }

  if (report.schemaVersion !== 1) {
    errors.push('recovery-observe: JSON report schemaVersion must be 1');
  }
  if (report.status !== 'PASS') {
    errors.push('recovery-observe: JSON report status must be PASS');
  }
  if (!Array.isArray(report.errors)) {
    errors.push('recovery-observe: JSON report errors must be an array');
  } else if (report.errors.length > 0) {
    errors.push('recovery-observe: JSON report errors must be empty');
  }
  if (typeof report.message !== 'string' || !hasPositiveValidationResult(report.message)) {
    errors.push('recovery-observe: JSON report message must identify internally positive PASS status');
  }
  const lines = report.lines;
  if (!isNonEmptyStringArray(lines)) {
    errors.push('recovery-observe: JSON report lines must be a non-empty transcript array');
  } else {
    if (!lines.some(hasPositiveValidationResult)) {
      errors.push('recovery-observe: JSON report lines must include internally positive PASS output');
    }
    if (lines.some(hasContradictoryValidationFailureMarker)) {
      errors.push('recovery-observe: JSON report lines must not include contradictory failure markers');
    }
    if (lines.some(hasUnresolvedEvidenceIssueMarker)) {
      errors.push('recovery-observe: JSON report lines must not include remaining issues');
    }
    if (lines.some(containsForbiddenTranscriptLine)) {
      errors.push('recovery-observe: JSON report lines must not serialize URLs, local paths, runtime files, or secret-bearing material');
    }
  }
  if (!isIsoUtcTimestamp(report.observedAt)) {
    errors.push('recovery-observe: JSON report observedAt must be an ISO UTC timestamp');
  }

  const kind = normalizeKind(report.kind);
  if (!kind) {
    errors.push('recovery-observe: JSON report kind must be a supported recovery observation kind');
  } else if (expectedKind && kind !== expectedKind) {
    errors.push('recovery-observe: JSON report kind must match the requested recovery observation kind');
  }

  const pegOutBurnTxId = normalizeHex32Value(report.pegOutBurnTxId);
  const expectedTxId = normalizeHex32Value(report.expectedTxId);
  const singletonInventoryId = normalizeHex32Value(report.singletonInventoryId);
  if (!pegOutBurnTxId) {
    errors.push('recovery-observe: JSON report pegOutBurnTxId must be 32-byte hex');
  }
  if (kind === 'failed-broadcast-phantom-avl') {
    if (!expectedTxId) {
      errors.push('recovery-observe: failed-broadcast report expectedTxId must be 32-byte hex');
    }
    if (report.singletonInventoryId !== undefined) {
      errors.push('recovery-observe: failed-broadcast report must not include singletonInventoryId');
    }
  }
  if (kind === 'reorged-burn-stale-singleton') {
    if (!singletonInventoryId) {
      errors.push('recovery-observe: reorg report singletonInventoryId must be 32-byte hex');
    }
    if (report.expectedTxId !== undefined) {
      errors.push('recovery-observe: reorg report must not include expectedTxId');
    }
  }
  if (isNonEmptyStringArray(lines)) {
    errors.push(...validateTranscriptIdentity(lines, kind, pegOutBurnTxId, expectedTxId, singletonInventoryId));
  }

  errors.push(...validateObservationBoundary(report.observationBoundary));
  errors.push(...validateNodeObservation(kind, report.node, expectedTxId, report.observedAt));
  errors.push(...validateStateObservation(kind, report.state, pegOutBurnTxId, expectedTxId, singletonInventoryId));
  errors.push(...validateSourceBindings(report.sourceBindings, report.node));

  return { errors, ...(kind ? { kind } : {}) };
}

function validateObservationBoundary(value: unknown): string[] {
  const errors: string[] = [];
  const boundary = isRecord(value) ? value : undefined;
  if (!boundary) {
    return ['recovery-observe: observationBoundary object is required'];
  }
  if (boundary.readOnlyObservationOnly !== true) {
    errors.push('recovery-observe: observationBoundary.readOnlyObservationOnly must be true');
  }
  if (boundary.nodeQueryPerformed !== true) {
    errors.push('recovery-observe: observationBoundary.nodeQueryPerformed must be true');
  }
  if (boundary.stateReadPerformed !== true) {
    errors.push('recovery-observe: observationBoundary.stateReadPerformed must be true');
  }

  const falseFields = [
    'signingPerformed',
    'broadcastAuthorized',
    'liveSubmitPerformed',
    'confirmationObserved',
    'nodeMutationPerformed',
    'repairPerformed',
    'stateMutationPerformed',
    'reconciliationPerformed',
    'gate3ClosureAllowed',
    'productionReadyClaimAllowed',
    'testnetProductionCandidateClaimAllowed',
  ] as const;
  for (const field of falseFields) {
    if (boundary[field] !== false) {
      errors.push(`recovery-observe: observationBoundary.${field} must be false`);
    }
  }

  return errors;
}

function validateNodeObservation(
  kind: TestnetRecoveryDrillKind | undefined,
  value: unknown,
  expectedTxId: string | undefined,
  reportObservedAt: unknown,
): string[] {
  const errors: string[] = [];
  const node = isRecord(value) ? value : undefined;
  if (!node) {
    return ['recovery-observe: node observation object is required'];
  }

  if (!isIsoUtcTimestamp(node.observedAt)) {
    errors.push('recovery-observe: node.observedAt must be an ISO UTC timestamp');
  }
  if (isIsoUtcTimestamp(reportObservedAt) && node.observedAt !== reportObservedAt) {
    errors.push('recovery-observe: node.observedAt must match the top-level observedAt');
  }
  if (!isNonNegativeSafeInteger(node.nodeHeight)) {
    errors.push('recovery-observe: node.nodeHeight must be a non-negative safe integer');
  }
  if (typeof node.nodeNetwork !== 'string' || !identifiesPositiveTestnetNetwork(node.nodeNetwork)) {
    errors.push('recovery-observe: node.nodeNetwork must positively identify testnet');
  }

  if (kind === 'failed-broadcast-phantom-avl') {
    if (!expectedTxId || normalizeHex32Value(node.expectedTxId) !== expectedTxId) {
      errors.push('recovery-observe: node.expectedTxId must match the top-level expectedTxId');
    }
    if (node.confirmedChain !== false) {
      errors.push('recovery-observe: failed-broadcast node observation must prove expectedTxId is absent from confirmed chain');
    }
    if (node.mempool !== false) {
      errors.push('recovery-observe: failed-broadcast node observation must prove expectedTxId is absent from mempool');
    }
  }

  return errors;
}

function validateStateObservation(
  kind: TestnetRecoveryDrillKind | undefined,
  value: unknown,
  pegOutBurnTxId: string | undefined,
  expectedTxId: string | undefined,
  singletonInventoryId: string | undefined,
): string[] {
  const errors: string[] = [];
  const state = isRecord(value) ? value : undefined;
  if (!state) {
    return ['recovery-observe: state observation object is required'];
  }

  if (state.pendingDupHeartbeatForTx !== false) {
    errors.push('recovery-observe: state.pendingDupHeartbeatForTx must be false');
  }
  if (typeof state.avlKeyPresent !== 'boolean') {
    errors.push('recovery-observe: state.avlKeyPresent must be boolean');
  }

  const aggregateAttempt = isRecord(state.aggregateAttempt) ? state.aggregateAttempt : undefined;
  if (aggregateAttempt) {
    if (aggregateAttempt.status === 'confirmed') {
      errors.push('recovery-observe: aggregateAttempt status must not be confirmed');
    }
    if (expectedTxId && normalizeHex32Value(aggregateAttempt.expectedTxId) !== expectedTxId) {
      errors.push('recovery-observe: aggregateAttempt.expectedTxId must match the top-level expectedTxId');
    }
    if (
      pegOutBurnTxId &&
      Array.isArray(aggregateAttempt.burnTxHashes) &&
      !aggregateAttempt.burnTxHashes.some(value => normalizeHex32Value(value) === pegOutBurnTxId)
    ) {
      errors.push('recovery-observe: aggregateAttempt.burnTxHashes must include pegOutBurnTxId');
    }
  }

  const pegOut = isRecord(state.pegOut) ? state.pegOut : undefined;
  if (pegOut) {
    if (pegOutBurnTxId && normalizeHex32Value(pegOut.burnTxHash) !== pegOutBurnTxId) {
      errors.push('recovery-observe: pegOut.burnTxHash must match the top-level pegOutBurnTxId');
    }
    for (const field of ['phase1BoxId', 'phase2UnlockTxId', 'pendingAvlKey'] as const) {
      if (pegOut[field] !== null && pegOut[field] !== undefined && !normalizeHex32Value(pegOut[field])) {
        errors.push(`recovery-observe: pegOut.${field} must be null or 32-byte hex`);
      }
    }
  }

  if (kind === 'failed-broadcast-phantom-avl') {
    if (!aggregateAttempt) {
      errors.push('recovery-observe: failed-broadcast state must include aggregateAttempt for expectedTxId');
    } else {
      if (expectedTxId && normalizeHex32Value(aggregateAttempt.expectedTxId) !== expectedTxId) {
        errors.push('recovery-observe: failed-broadcast aggregateAttempt.expectedTxId must match expectedTxId');
      }
      const submittedTxId = aggregateAttempt.submittedTxId;
      const submittedTxIdHex = normalizeHex32Value(submittedTxId);
      const status = String(aggregateAttempt.status);
      if (
        submittedTxId !== null &&
        submittedTxId !== undefined &&
        expectedTxId &&
        submittedTxIdHex !== expectedTxId
      ) {
        errors.push('recovery-observe: failed-broadcast aggregateAttempt.submittedTxId must be null or match expectedTxId');
      }
      if (status === 'submitted' && (!expectedTxId || submittedTxIdHex !== expectedTxId)) {
        errors.push('recovery-observe: failed-broadcast submitted aggregateAttempt must include submittedTxId matching expectedTxId');
      }
      if (
        (status === 'pending' || status === 'abandoned') &&
        submittedTxId !== null &&
        submittedTxId !== undefined
      ) {
        errors.push('recovery-observe: failed-broadcast pending or abandoned aggregateAttempt must not include submittedTxId');
      }
      if (
        !Array.isArray(aggregateAttempt.burnTxHashes) ||
        !pegOutBurnTxId ||
        !aggregateAttempt.burnTxHashes.some(value => normalizeHex32Value(value) === pegOutBurnTxId)
      ) {
        errors.push('recovery-observe: failed-broadcast aggregateAttempt.burnTxHashes must include pegOutBurnTxId');
      }
      if (!['pending', 'submitted', 'abandoned'].includes(status)) {
        errors.push('recovery-observe: failed-broadcast aggregateAttempt status must be pending, submitted, or abandoned');
      }
    }
    if (!pegOut) {
      errors.push('recovery-observe: failed-broadcast state must include pegOut for pegOutBurnTxId');
    }
    if (state.avlKeyPresent !== false) {
      errors.push('recovery-observe: failed-broadcast state must prove no DUP AVL key was inserted');
    }
    if (pegOut && ['phase2_unlocked', 'failed'].includes(String(pegOut.status))) {
      errors.push('recovery-observe: failed-broadcast pegOut status must not be terminal or reconciled');
    }
  }

  if (kind === 'reorged-burn-stale-singleton') {
    if (singletonInventoryId && state.spvTrackerKeyPresent !== true) {
      errors.push('recovery-observe: reorg state must prove the singleton inventory key is present before recovery');
    }
    const candidate = isRecord(state.reorgCandidate) ? state.reorgCandidate : undefined;
    if (!candidate) {
      errors.push('recovery-observe: reorg state must identify a recoverable stale singleton candidate');
    } else {
      if (pegOutBurnTxId && normalizeHex32Value(candidate.burnTxHash) !== pegOutBurnTxId) {
        errors.push('recovery-observe: reorg candidate burnTxHash must match pegOutBurnTxId');
      }
      if (!normalizeHex32Value(candidate.pendingAvlKey)) {
        errors.push('recovery-observe: reorg candidate pendingAvlKey must be 32-byte hex');
      }
      if (!normalizeHex32Value(candidate.phase1BoxId)) {
        errors.push('recovery-observe: reorg candidate phase1BoxId must be 32-byte hex');
      }
      if (!['phase1_created', 'burn_reverted'].includes(String(candidate.status))) {
        errors.push('recovery-observe: reorg candidate status must be phase1_created or burn_reverted');
      }
    }
  }

  return errors;
}

function validateSourceBindings(value: unknown, nodeValue: unknown): string[] {
  const errors: string[] = [];
  const bindings = isRecord(value) ? value : undefined;
  if (!bindings) {
    return ['recovery-observe: sourceBindings object is required'];
  }

  const nodeBinding = isRecord(bindings.node) ? bindings.node : undefined;
  const node = isRecord(nodeValue) ? nodeValue : undefined;
  if (!nodeBinding) {
    errors.push('recovery-observe: sourceBindings.node object is required');
  } else {
    if (nodeBinding.sourceType !== 'live-read-only-node') {
      errors.push('recovery-observe: sourceBindings.node.sourceType must be live-read-only-node');
    }
    if (nodeBinding.readOnly !== true) {
      errors.push('recovery-observe: sourceBindings.node.readOnly must be true');
    }
    if (nodeBinding.noAuthHeader !== true) {
      errors.push('recovery-observe: sourceBindings.node.noAuthHeader must be true');
    }
    if (!isIsoUtcTimestamp(nodeBinding.observedAt)) {
      errors.push('recovery-observe: sourceBindings.node.observedAt must be an ISO UTC timestamp');
    }
    if (!isNonNegativeSafeInteger(nodeBinding.nodeHeight)) {
      errors.push('recovery-observe: sourceBindings.node.nodeHeight must be a non-negative safe integer');
    }
    if (typeof nodeBinding.nodeNetwork !== 'string' || !identifiesPositiveTestnetNetwork(nodeBinding.nodeNetwork)) {
      errors.push('recovery-observe: sourceBindings.node.nodeNetwork must positively identify testnet');
    }
    if (node) {
      if (nodeBinding.observedAt !== node.observedAt) {
        errors.push('recovery-observe: sourceBindings.node.observedAt must match node.observedAt');
      }
      if (nodeBinding.nodeHeight !== node.nodeHeight) {
        errors.push('recovery-observe: sourceBindings.node.nodeHeight must match node.nodeHeight');
      }
      if (nodeBinding.nodeNetwork !== node.nodeNetwork) {
        errors.push('recovery-observe: sourceBindings.node.nodeNetwork must match node.nodeNetwork');
      }
    }
    if (containsForbiddenSourceBindingValue(nodeBinding)) {
      errors.push('recovery-observe: sourceBindings.node must not serialize URLs, local paths, runtime files, or secret-bearing material');
    }
    if (operationsContainUnsafeMarker(nodeBinding.operations)) {
      errors.push('recovery-observe: sourceBindings.node.operations must not include signing, submission, broadcast, repair, reconciliation, or mutation operations');
    }
  }

  const stateBinding = isRecord(bindings.state) ? bindings.state : undefined;
  if (!stateBinding) {
    errors.push('recovery-observe: sourceBindings.state object is required');
  } else {
    if (stateBinding.sourceType !== 'read-only-state-tracker') {
      errors.push('recovery-observe: sourceBindings.state.sourceType must be read-only-state-tracker');
    }
    if (stateBinding.readOnly !== true) {
      errors.push('recovery-observe: sourceBindings.state.readOnly must be true');
    }
    if (stateBinding.runtimePathSerialized !== false) {
      errors.push('recovery-observe: sourceBindings.state.runtimePathSerialized must be false');
    }
    if (stateBinding.targetClass !== 'operator-provided-state-db') {
      errors.push('recovery-observe: sourceBindings.state.targetClass must be operator-provided-state-db');
    }
    if (containsForbiddenSourceBindingValue(stateBinding)) {
      errors.push('recovery-observe: sourceBindings.state must not serialize URLs, local paths, runtime files, or secret-bearing material');
    }
    if (operationsContainUnsafeMarker(stateBinding.operations)) {
      errors.push('recovery-observe: sourceBindings.state.operations must not include signing, submission, broadcast, repair, reconciliation, or mutation operations');
    }
  }

  return errors;
}

function validateTranscriptIdentity(
  lines: string[],
  kind: TestnetRecoveryDrillKind | undefined,
  pegOutBurnTxId: string | undefined,
  expectedTxId: string | undefined,
  singletonInventoryId: string | undefined,
): string[] {
  const errors: string[] = [];
  const transcript = normalizeEvidenceMarkerText(lines.join('\n')).toLowerCase();
  if (kind && !transcript.includes(kind)) {
    errors.push('recovery-observe: JSON report lines must bind the recovery observation kind');
  }
  if (pegOutBurnTxId && !transcript.includes(pegOutBurnTxId)) {
    errors.push('recovery-observe: JSON report lines must bind pegOutBurnTxId');
  }
  if (kind === 'failed-broadcast-phantom-avl' && expectedTxId && !transcript.includes(expectedTxId)) {
    errors.push('recovery-observe: JSON report lines must bind expectedTxId');
  }
  if (kind === 'reorged-burn-stale-singleton' && singletonInventoryId && !transcript.includes(singletonInventoryId)) {
    errors.push('recovery-observe: JSON report lines must bind singletonInventoryId');
  }
  return errors;
}

function normalizeKind(value: unknown): TestnetRecoveryDrillKind | undefined {
  return typeof value === 'string' && RECOVERY_KINDS.has(value as TestnetRecoveryDrillKind)
    ? value as TestnetRecoveryDrillKind
    : undefined;
}

function normalizeHex32Value(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : undefined;
}

function isIsoUtcTimestamp(value: unknown): boolean {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function isNonNegativeSafeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every(item => typeof item === 'string' && item.trim().length > 0);
}

function identifiesPositiveTestnetNetwork(value: string): boolean {
  const normalized = value.toLowerCase();
  return /\btestnet\b/.test(normalized) &&
    !/\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/.test(stripNonMainnet(normalized)) &&
    !/\b(?:not|no|without)\s+(?:on\s+|using\s+|connected\s+to\s+|the\s+)?testnet\b/.test(normalized);
}

function stripNonMainnet(value: string): string {
  return value.replace(/\bnon[- ]?main[- ]?net\b/gi, '');
}

function containsForbiddenSourceBindingValue(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().replace(/\\/g, '/');
    return (
      normalized.includes('://') ||
      normalized.includes('/') ||
      isLocalRuntimeOrSecretTarget(normalized) ||
      /\b(?:authorization|bearer|api[-_ ]?key|auth[-_ ]?header|secret|token|password|credential)\b/i.test(normalized) ||
      /^[a-z]:\//i.test(normalized)
    );
  }
  if (Array.isArray(value)) {
    return value.some(containsForbiddenSourceBindingValue);
  }
  if (isRecord(value)) {
    return Object.entries(value).some(([key, child]) =>
      /^(?:authheader|authorization|apikey|token|secret|password|credential|runtimepath|statepath|dbpath)$/i.test(key.replace(/[-_\s]/g, '')) ||
      containsForbiddenSourceBindingValue(child),
    );
  }
  return false;
}

function containsForbiddenTranscriptLine(value: string): boolean {
  const normalized = value.toLowerCase().replace(/\\/g, '/');
  return (
    /\b[a-z][a-z0-9+.-]*:\/\//i.test(normalized) ||
    hasEvidenceLocalOnlyInspectionReference(normalized) ||
    hasEnvironmentTargetSegment(normalized) ||
    hasRuntimeDatabaseTargetSegment(normalized) ||
    isEvidenceSecretOrRuntimeName(normalized, { includeDeployedState: true }) ||
    isLocalRuntimeOrSecretTarget(normalized)
  );
}

function operationsContainUnsafeMarker(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some(item =>
    typeof item === 'string' &&
    /\b(?:broadcast(?:ed|ing|s)?|submit(?:ted|ting|s)?|submission|sign(?:ed|ing|s|ature)?|send(?:ing|s)?|spend(?:ing|s)?|mutat(?:e|ed|es|ing|ion)|write(?:s|n|ing)?|post(?:ed|ing)?|put|delete|patch|repair(?:ed|ing)?|reconcile(?:d|s|ing|iation)?|state\s*(?:update|mutation)|node\s*mutation)\b/i.test(item),
  );
}

function isLocalRuntimeOrSecretTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(isLocalRuntimeOrSecretInspectionTarget);
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

function hasPositiveValidationResult(segment: string): boolean {
  if (hasContradictoryValidationFailureMarker(segment)) return false;
  return (
    /\bPASS\b/.test(segment) ||
    /\bexit\s+code\s*0\b/i.test(segment) ||
    /\bno\s+structural\s+issues?\b/i.test(segment) ||
    /\b0\s+structural\s+issues?\b/i.test(segment)
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
