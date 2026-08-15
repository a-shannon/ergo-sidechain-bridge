import { readFileSync, realpathSync } from 'fs';
import { basename, extname, isAbsolute, relative, resolve } from 'path';

import { readEvidenceMarkdownTarget } from './evidence-target-path.js';
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
import { formatBridgeEventRootCsv } from './bridge-event-root-evidence.js';
import { validateFreshCheckpointArtifact } from './testnet-offline-rehearsal-gate.js';
import { buildTestnetRehearsalDraft } from './testnet-rehearsal-draft.js';
import {
  preflightTestnetRehearsal,
  type TestnetRehearsalPreflightPackage,
  type TestnetRehearsalPreflightStatus,
} from './testnet-rehearsal-preflight.js';
import { prepareTestnetWindowPacket, type TestnetWindowPrepStatus } from './testnet-window-prep.js';
import { classifyPublicationClaimText } from './publication-claim-boundary.js';
import { LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE } from './legacy-aggregate-settlement-conservation.js';

export interface TestnetRehearsalPrepBundleInput {
  prebroadcastTarget: string;
  approvalsPath: string;
  currentErgoHeight: string | number;
  currentSidechainHeight: string | number;
  currentDeployedStateHash: string;
  ergoNodeNetwork: string;
  sidechainNetwork: string;
  broadcastEnabled: boolean;
  doctorArtifact?: string;
  preflightArtifact?: string;
  windowPrepArtifact?: string;
  offlineGateArtifact?: string;
  freshCheckpointArtifact?: string;
  heightEvidenceArtifact?: string;
  failedBroadcast?: string;
  reorgRecovery?: string;
  operator?: string;
  reviewer?: string;
  gitCommit?: string;
  now?: Date;
}

export interface TestnetRehearsalPrepBundleReport {
  status: 'CREATED' | 'BLOCKED';
  executionStatus: 'QUARANTINED';
  message: string;
  errors: string[];
  packages: TestnetRehearsalPreflightPackage[];
  gateBoundary: TestnetRehearsalPrepBundleGateBoundary;
  artifactTargets: TestnetRehearsalPrepBundleArtifactTargets;
  sourceBindings: TestnetRehearsalPrepBundleSourceBindings;
  preparedCommands: TestnetRehearsalPrepBundlePreparedCommand[];
  nextHandoff: TestnetRehearsalPrepBundleNextHandoff;
  stageStatuses: TestnetRehearsalPrepBundleStageStatuses;
  recoveryRows: RecoveryRowSummary[];
  markdown?: string;
  lines: string[];
}

export interface TestnetRehearsalPrepBundleGateBoundary {
  gate3ClosureAllowed: false;
  productionReadyClaimAllowed: false;
  testnetProductionCandidateClaimAllowed: false;
  broadcastAuthorized: false;
  signingPerformed: false;
  liveSubmitPerformed: false;
  confirmationObserved: false;
  reconciliationPerformed: false;
  nodeMutationPerformed: false;
}

export interface TestnetRehearsalPrepBundleArtifactTargets {
  prebroadcast: string;
  approvals: string;
  doctor: string;
  preflight: string;
  windowPrep: string;
  offlineGate: string;
  freshCheckpoint?: string;
  heightEvidence?: string;
  failedBroadcast?: string;
  reorgRecovery?: string;
}

export interface TestnetRehearsalPrepBundleSourceBindings {
  freshCheckpoint: {
    source: 'prepared-command';
    commandLabel: 'fresh-testnet-check';
    target: string;
  };
  offlineGate: {
    source: 'prepared-command';
    commandLabel: 'offline-gate';
    target: string;
    inputs: {
      prebroadcast: string;
      rehearsalPreflight: string;
      windowPrep: string;
      freshCheckpoint: string;
    };
  };
}

export interface TestnetRehearsalPrepBundlePreparedCommand {
  label:
    | 'prebroadcast-doctor'
    | 'rehearsal-preflight'
    | 'testnet-window-prep'
    | 'fresh-testnet-check'
    | 'offline-gate'
    | 'live-rehearsal-draft'
    | 'legacy-v1-live-preflight-quarantine';
  phase: 'offline-preparation' | 'blocked-live-settlement';
  command: string;
  broadcastCommand: false;
  requiresExplicitLiveBroadcastApproval: boolean;
}

export interface TestnetRehearsalPrepBundleNextHandoff {
  label: 'external-fee-profile-activation-prerequisites';
  phase: 'blocked-live-settlement';
  command: string;
  requiresExplicitLiveBroadcastApproval: false;
  broadcastCommand: false;
  reportAuthorizesBroadcast: false;
  requiredEvidenceBeforeUse: string[];
  forbiddenBeforeUse: string[];
}

export interface TestnetRehearsalPrepBundleStageStatuses {
  preflight: TestnetRehearsalPreflightStatus;
  windowPrep: TestnetWindowPrepStatus;
  draft: 'CREATED' | 'BLOCKED';
  freshCheckpoint: 'LINKED' | 'BLOCKED' | 'NOT_PROVIDED';
  recoveryRows: 'PASS' | 'BLOCKED' | 'NOT_PROVIDED';
}

export interface RecoveryRowSummary {
  label: 'failed-broadcast' | 'reorg-recovery';
  target: string;
  gate: string;
  status: 'linked' | 'missing';
}

export interface TestnetRehearsalPrepBundleReportValidation {
  errors: string[];
}

type PrepBundleTargetSpec = [label: string, target: string | undefined, requiredExtension?: string];

const failedBroadcastGate = 'Failed broadcast / phantom AVL evidence';
const reorgRecoveryGate = 'Reorged burn / stale singleton evidence';
const blockedPrepBundleTargetLabel = '<blocked prep-bundle target>';
const aggregateCheckJsonPlaceholder = 'AGGREGATE_CHECK_JSON';
const draftLiveRehearsalPlaceholder = 'QUARANTINED_REHEARSAL_DRAFT_MD';
const freshCheckpointJsonPlaceholder = 'FRESH_TESTNET_CHECKPOINT_JSON';
const freshCheckpointMdPlaceholder = 'FRESH_TESTNET_CHECKPOINT_MD';
const testnetWindowPrepMdPlaceholder = 'TESTNET_WINDOW_PREP_MD';
const legacyV1SubmissionStatus = `BLOCKED: ${LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE}`;
const replacementProfileRequiredEvidence = [
  'reviewed separately versioned external-fee profile identity',
  'exact target-node acceptance evidence',
  'on-chain funds-authority transition evidence',
  'legacy route and vault retirement evidence',
  'cross-profile replay-lineage and cutover evidence',
];
const legacyV1ForbiddenBeforeUse = [
  'legacy V1 signing',
  'legacy V1 broadcast',
  'legacy V1 submit',
  'approval as funds authority',
  'diagnostic Expected transaction ID as funds authority',
  'Gate 3 closure',
  'claim escalation',
];
const gateBoundary: TestnetRehearsalPrepBundleGateBoundary = {
  gate3ClosureAllowed: false,
  productionReadyClaimAllowed: false,
  testnetProductionCandidateClaimAllowed: false,
  broadcastAuthorized: false,
  signingPerformed: false,
  liveSubmitPerformed: false,
  confirmationObserved: false,
  reconciliationPerformed: false,
  nodeMutationPerformed: false,
};
const expectedPreparedCommandLabels: TestnetRehearsalPrepBundlePreparedCommand['label'][] = [
  'prebroadcast-doctor',
  'rehearsal-preflight',
  'testnet-window-prep',
  'fresh-testnet-check',
  'offline-gate',
  'live-rehearsal-draft',
  'legacy-v1-live-preflight-quarantine',
];

export function validateTestnetRehearsalPrepBundleReport(
  report: unknown,
): TestnetRehearsalPrepBundleReportValidation {
  const errors: string[] = [];
  if (!isRecord(report)) {
    return { errors: ['prep bundle JSON must be an object'] };
  }

  if (report.schemaVersion !== 1) {
    errors.push('prep bundle JSON schemaVersion must be 1');
  }
  if (report.status !== 'CREATED') {
    errors.push('prep bundle JSON status must be CREATED');
  }
  if (report.executionStatus !== 'QUARANTINED') {
    errors.push('prep bundle JSON executionStatus must be QUARANTINED');
  }
  if (typeof report.message !== 'string' || !/\bprep bundle CREATED\b/i.test(report.message) || !/\bexecution QUARANTINED\b/i.test(report.message)) {
    errors.push('prep bundle JSON message must describe a CREATED bundle with execution QUARANTINED');
  }
  if (!Array.isArray(report.errors)) {
    errors.push('prep bundle JSON errors must be an array');
  } else if (report.errors.length > 0) {
    errors.push('prep bundle JSON errors must be empty');
  }
  if (!Array.isArray(report.packages) || report.packages.length === 0) {
    errors.push('prep bundle JSON packages must contain at least one prepared package');
  }
  if (typeof report.markdown !== 'string' || report.markdown.trim().length === 0) {
    errors.push('prep bundle JSON markdown must be present');
  } else if (hasContradictoryValidationFailureMarker(report.markdown)) {
    errors.push('prep bundle JSON markdown must not include contradictory failure markers');
  } else if (hasUnresolvedEvidenceIssueMarker(report.markdown)) {
    errors.push('prep bundle JSON markdown must not include remaining issues');
  } else if (containsForbiddenPrepBundleNarrativeText(report.markdown)) {
    errors.push('prep bundle JSON markdown must not serialize auth, secret, runtime, state, or database payloads');
  }
  if (!Array.isArray(report.lines) || report.lines.some(line => typeof line !== 'string')) {
    errors.push('prep bundle JSON lines must be an array of strings');
  } else if (report.lines.some(hasContradictoryValidationFailureMarker)) {
    errors.push('prep bundle JSON lines must not include contradictory failure markers');
  } else if (report.lines.some(hasUnresolvedEvidenceIssueMarker)) {
    errors.push('prep bundle JSON lines must not include remaining issues');
  } else if (report.lines.some(containsForbiddenPrepBundleNarrativeText)) {
    errors.push('prep bundle JSON lines must not serialize auth, secret, runtime, state, or database payloads');
  }

  errors.push(...validatePrepBundleReportGateBoundary(report.gateBoundary));
  errors.push(...validatePrepBundleReportArtifactTargets(report.artifactTargets));
  errors.push(...validatePrepBundleReportSourceBindings(report.sourceBindings, report.artifactTargets));
  errors.push(...validatePrepBundleReportPreparedCommands(
    report.preparedCommands,
    report.artifactTargets,
    report.packages,
  ));
  errors.push(...validatePrepBundleReportNextHandoff(
    report.nextHandoff,
    report.preparedCommands,
  ));
  errors.push(...validatePrepBundleReportStageStatuses(report.stageStatuses));
  errors.push(...validatePrepBundleReportRecoveryRows(report.recoveryRows));

  return { errors };
}

function validatePrepBundleReportGateBoundary(boundary: unknown): string[] {
  if (!isRecord(boundary)) {
    return ['prep bundle JSON gateBoundary must be present'];
  }

  const errors: string[] = [];
  for (const field of Object.keys(gateBoundary) as Array<keyof TestnetRehearsalPrepBundleGateBoundary>) {
    if (boundary[field] !== false) {
      errors.push(`prep bundle JSON gateBoundary.${field} must be false`);
    }
  }
  return errors;
}

function validatePrepBundleReportArtifactTargets(targets: unknown): string[] {
  if (!isRecord(targets)) {
    return ['prep bundle JSON artifactTargets must be present'];
  }

  const specs: PrepBundleTargetSpec[] = [
    ['artifactTargets.prebroadcast', getStringField(targets, 'prebroadcast')],
    ['artifactTargets.approvals', getStringField(targets, 'approvals'), '.json'],
    ['artifactTargets.doctor', getStringField(targets, 'doctor'), '.json'],
    ['artifactTargets.preflight', getStringField(targets, 'preflight'), '.json'],
    ['artifactTargets.windowPrep', getStringField(targets, 'windowPrep'), '.json'],
    ['artifactTargets.offlineGate', getStringField(targets, 'offlineGate'), '.json'],
    ['artifactTargets.freshCheckpoint', getStringField(targets, 'freshCheckpoint'), '.json'],
  ];
  const optionalSpecs: PrepBundleTargetSpec[] = [
    ['artifactTargets.heightEvidence', getStringField(targets, 'heightEvidence'), '.json'],
    ['artifactTargets.failedBroadcast', getStringField(targets, 'failedBroadcast')],
    ['artifactTargets.reorgRecovery', getStringField(targets, 'reorgRecovery')],
  ];

  return [
    ...specs.flatMap(([label, target, requiredExtension]) =>
      validateConcretePrepBundleReportTarget(label, target, requiredExtension),
    ),
    ...optionalSpecs.flatMap(([label, target, requiredExtension]) =>
      target ? validateConcretePrepBundleReportTarget(label, target, requiredExtension) : [],
    ),
    ...validateDistinctPrepBundleTargets([...specs, ...optionalSpecs]),
  ];
}

function validateConcretePrepBundleReportTarget(
  label: string,
  target: string | undefined,
  requiredExtension?: string,
): string[] {
  const publicLabel = `prep bundle JSON ${label}`;
  if (!target || target.trim().length === 0) {
    return [`${publicLabel} must be present`];
  }
  if (isPlaceholderTarget(target) || target === blockedPrepBundleTargetLabel) {
    return [`${publicLabel} must be a concrete non-sensitive preparation target`];
  }
  return validatePrepBundleTarget(label, target, requiredExtension)
    .map(error => `prep bundle JSON ${error}`);
}

function validatePrepBundleReportPreparedCommands(commands: unknown, targets: unknown, packages: unknown): string[] {
  if (!Array.isArray(commands)) {
    return ['prep bundle JSON preparedCommands must be an array'];
  }

  const errors: string[] = [];
  const artifactTargets = isRecord(targets) ? targets : undefined;
  const byLabel = new Map<string, Record<string, unknown>>();
  for (const command of commands) {
    if (!isRecord(command)) {
      errors.push('prep bundle JSON preparedCommands entries must be objects');
      continue;
    }
    const label = typeof command.label === 'string' ? command.label : '';
    if (!label) {
      errors.push('prep bundle JSON preparedCommands entry label must be present');
      continue;
    }
    if (byLabel.has(label)) {
      errors.push(`prep bundle JSON preparedCommands.${label} must be unique`);
      continue;
    }
    byLabel.set(label, command);
  }

  for (const label of expectedPreparedCommandLabels) {
    const command = byLabel.get(label);
    if (!command) {
      errors.push(`prep bundle JSON preparedCommands.${label} must be present`);
      continue;
    }
    errors.push(...validatePrepBundleReportPreparedCommand(label, command, artifactTargets, packages));
  }

  for (const label of byLabel.keys()) {
    if (!expectedPreparedCommandLabels.includes(label as TestnetRehearsalPrepBundlePreparedCommand['label'])) {
      errors.push(`prep bundle JSON preparedCommands.${label} is not an expected prepared command`);
    }
  }

  return errors;
}

function validatePrepBundleReportSourceBindings(bindings: unknown, targets: unknown): string[] {
  if (!isRecord(bindings)) {
    return ['prep bundle JSON sourceBindings must be present'];
  }
  if (!isRecord(targets)) return [];

  const errors: string[] = [];
  const artifact = (field: keyof TestnetRehearsalPrepBundleArtifactTargets): string | undefined =>
    getStringField(targets, field);
  const freshCheckpoint = isRecord(bindings.freshCheckpoint) ? bindings.freshCheckpoint : undefined;
  const offlineGate = isRecord(bindings.offlineGate) ? bindings.offlineGate : undefined;

  if (containsForbiddenPrepBundleSourceBindingValue(bindings)) {
    errors.push('prep bundle JSON sourceBindings must not serialize auth, secret, runtime, state, or database payloads');
  }

  if (!freshCheckpoint) {
    errors.push('prep bundle JSON sourceBindings.freshCheckpoint must be present');
  } else {
    errors.push(...validatePreparedSourceBinding(
      'sourceBindings.freshCheckpoint',
      freshCheckpoint,
      'fresh-testnet-check',
      artifact('freshCheckpoint'),
    ));
  }

  if (!offlineGate) {
    errors.push('prep bundle JSON sourceBindings.offlineGate must be present');
  } else {
    errors.push(...validatePreparedSourceBinding(
      'sourceBindings.offlineGate',
      offlineGate,
      'offline-gate',
      artifact('offlineGate'),
    ));
    const inputs = isRecord(offlineGate.inputs) ? offlineGate.inputs : undefined;
    if (!inputs) {
      errors.push('prep bundle JSON sourceBindings.offlineGate.inputs must be present');
    } else {
      errors.push(...validatePreparedSourceBindingInput(
        'sourceBindings.offlineGate.inputs.prebroadcast',
        getStringField(inputs, 'prebroadcast'),
        artifact('doctor'),
      ));
      errors.push(...validatePreparedSourceBindingInput(
        'sourceBindings.offlineGate.inputs.rehearsalPreflight',
        getStringField(inputs, 'rehearsalPreflight'),
        artifact('preflight'),
      ));
      errors.push(...validatePreparedSourceBindingInput(
        'sourceBindings.offlineGate.inputs.windowPrep',
        getStringField(inputs, 'windowPrep'),
        artifact('windowPrep'),
      ));
      errors.push(...validatePreparedSourceBindingInput(
        'sourceBindings.offlineGate.inputs.freshCheckpoint',
        getStringField(inputs, 'freshCheckpoint'),
        artifact('freshCheckpoint'),
      ));
    }
  }

  return errors;
}

function containsForbiddenPrepBundleSourceBindingValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return containsForbiddenPrepBundleSourceBindingString(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsForbiddenPrepBundleSourceBindingValue);
  }
  if (isRecord(value)) {
    return Object.entries(value).some(([key, child]) =>
      isForbiddenPrepBundleSourceBindingKey(key) ||
      containsForbiddenPrepBundleSourceBindingValue(child),
    );
  }
  return false;
}

function isForbiddenPrepBundleSourceBindingKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return [
    'authheader',
    'authorization',
    'apikey',
    'token',
    'accesstoken',
    'secret',
    'password',
    'credential',
    'runtimepath',
    'statepath',
    'dbpath',
    'databasepath',
    'localpath',
  ].includes(normalized);
}

function containsForbiddenPrepBundleSourceBindingString(value: string): boolean {
  const normalized = value.toLowerCase().replace(/\\/g, '/');
  return (
    /\b(?:authorization|bearer|api[-_ ]?key|auth[-_ ]?header|secret|password|credential)\b/i.test(value) ||
    /\b(?:runtime|state|database|db)\s*(?:path|file)\s*[:=]/i.test(value) ||
    isLocalOnlyPrepBundleSourceBindingReference(normalized) ||
    isSharedSensitiveOrRuntimePrepBundleReference(normalized)
  );
}

function containsForbiddenPrepBundleNarrativeText(value: string): boolean {
  const normalized = value.toLowerCase().replace(/\\/g, '/');
  return (
    /\b(?:authorization|bearer|api[-_ ]?key|auth[-_ ]?header|secret|password|credential)\b/i.test(value) ||
    /\b(?:runtime|state|database|db)\s*(?:path|file|source|target)\s*[:=]/i.test(value) ||
    /^file:\/\//i.test(normalized) ||
    /\bfile:\/\//i.test(normalized) ||
    /(?:^|[\s([<=])(?:[a-z]:\/|\/\/[^/\s]|\/(?:users?|home|tmp|var|private|mnt|volumes|etc)(?:\/|$))/i
      .test(normalized) ||
    hasPrepBundleEnvironmentTargetSegment(normalized) ||
    hasPrepBundleRuntimeDatabaseTargetSegment(normalized) ||
    isEvidenceSecretOrRuntimeName(normalized, { includeDeployedState: true })
  );
}

function isLocalOnlyPrepBundleSourceBindingReference(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(isLocalOnlyPrepBundleInspectionReference);
}

function isLocalOnlyPrepBundleInspectionReference(normalizedTarget: string): boolean {
  return (
    hasEvidenceLocalOnlyInspectionReference(normalizedTarget) ||
    /^file:\/\//.test(normalizedTarget) ||
    /^[a-z]:\//.test(normalizedTarget) ||
    /^\/\/[^/]/.test(normalizedTarget) ||
    /^\/(?:users?|home|tmp|var|private|mnt|volumes|etc)(?:\/|$)/.test(normalizedTarget)
  );
}

function isSharedSensitiveOrRuntimePrepBundleReference(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(isSharedSensitiveOrRuntimePrepBundleInspectionReference);
}

function isSharedSensitiveOrRuntimePrepBundleInspectionReference(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasPrepBundleEnvironmentTargetSegment(normalizedTarget) ||
    hasPrepBundleRuntimeDatabaseTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalizedTarget, { includeDeployedState: true }) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
  );
}

function hasPrepBundleEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasPrepBundleRuntimeDatabaseTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function validatePreparedSourceBinding(
  label: string,
  binding: Record<string, unknown>,
  commandLabel: TestnetRehearsalPrepBundlePreparedCommand['label'],
  expectedTarget: string | undefined,
): string[] {
  const errors: string[] = [];
  if (binding.source !== 'prepared-command') {
    errors.push(`prep bundle JSON ${label}.source must be prepared-command`);
  }
  if (binding.commandLabel !== commandLabel) {
    errors.push(`prep bundle JSON ${label}.commandLabel must be ${commandLabel}`);
  }
  errors.push(...validatePreparedSourceBindingInput(`${label}.target`, getStringField(binding, 'target'), expectedTarget));
  return errors;
}

function validatePreparedSourceBindingInput(
  label: string,
  target: string | undefined,
  expectedTarget: string | undefined,
): string[] {
  if (!expectedTarget) return [`prep bundle JSON ${label} cannot be validated without matching artifactTargets entry`];
  const targetErrors = validateConcretePrepBundleReportTarget(label, target, '.json');
  if (targetErrors.length > 0) return targetErrors;
  if (normalizeComparablePrepBundleTarget(target!) !== normalizeComparablePrepBundleTarget(expectedTarget)) {
    return [`prep bundle JSON ${label} must match artifactTargets.${artifactTargetLabelForSourceBinding(label)}`];
  }
  return [];
}

function artifactTargetLabelForSourceBinding(label: string): string {
  if (label.endsWith('.prebroadcast')) return 'doctor';
  if (label.endsWith('.rehearsalPreflight')) return 'preflight';
  if (label.endsWith('.windowPrep')) return 'windowPrep';
  if (label.endsWith('.offlineGate.target')) return 'offlineGate';
  if (label.includes('offlineGate') && label.endsWith('.target')) return 'offlineGate';
  if (label.includes('freshCheckpoint')) return 'freshCheckpoint';
  return 'target';
}

function validatePrepBundleReportPreparedCommand(
  label: TestnetRehearsalPrepBundlePreparedCommand['label'],
  command: Record<string, unknown>,
  artifactTargets: Record<string, unknown> | undefined,
  packages: unknown,
): string[] {
  const errors: string[] = [];
  const expectedPhase = label === 'legacy-v1-live-preflight-quarantine'
    ? 'blocked-live-settlement'
    : 'offline-preparation';
  const commandText = typeof command.command === 'string' ? command.command : '';

  if (command.phase !== expectedPhase) {
    errors.push(`prep bundle JSON preparedCommands.${label} phase must be ${expectedPhase}`);
  }
  if (command.broadcastCommand !== false) {
    errors.push(`prep bundle JSON preparedCommands.${label} broadcastCommand must be false`);
  }
  if (command.requiresExplicitLiveBroadcastApproval !== false) {
    errors.push(`prep bundle JSON preparedCommands.${label} must not require live broadcast approval`);
  }
  if (!commandText.trim()) {
    errors.push(`prep bundle JSON preparedCommands.${label} command must be present`);
  }
  if (prepBundleCommandHasSensitiveOrBroadcastContent(commandText)) {
    errors.push(`prep bundle JSON preparedCommands.${label} command must not expose secret, runtime, or broadcast material`);
  }
  errors.push(...validatePreparedCommandBinding(label, commandText, artifactTargets, packages));
  return errors;
}

function validatePrepBundleReportNextHandoff(
  value: unknown,
  preparedCommands: unknown,
): string[] {
  if (!isRecord(value)) {
    return ['prep bundle JSON nextHandoff must be present'];
  }
  const errors: string[] = [];
  const expected = buildNextHandoff();
  const quarantineCommand = Array.isArray(preparedCommands)
    ? preparedCommands.find(command => isRecord(command) && command.label === 'legacy-v1-live-preflight-quarantine')
    : undefined;
  const quarantineCommandText = isRecord(quarantineCommand) && typeof quarantineCommand.command === 'string'
    ? quarantineCommand.command
    : undefined;

  if (value.label !== expected.label) {
    errors.push('prep bundle JSON nextHandoff.label must be external-fee-profile-activation-prerequisites');
  }
  if (value.phase !== expected.phase) {
    errors.push('prep bundle JSON nextHandoff.phase must be blocked-live-settlement');
  }
  if (value.command !== expected.command) {
    errors.push('prep bundle JSON nextHandoff.command must be the standard legacy V1 quarantine status');
  }
  if (quarantineCommandText && value.command !== quarantineCommandText) {
    errors.push('prep bundle JSON nextHandoff.command must match preparedCommands.legacy-v1-live-preflight-quarantine');
  }
  if (value.requiresExplicitLiveBroadcastApproval !== false) {
    errors.push('prep bundle JSON nextHandoff must not require live broadcast approval');
  }
  if (value.broadcastCommand !== false) {
    errors.push('prep bundle JSON nextHandoff.broadcastCommand must be false');
  }
  if (value.reportAuthorizesBroadcast !== false) {
    errors.push('prep bundle JSON nextHandoff.reportAuthorizesBroadcast must be false');
  }
  if ('targetBindings' in value) {
    errors.push('prep bundle JSON nextHandoff must not carry live execution target bindings');
  }
  if (!sameStringArray(value.requiredEvidenceBeforeUse, replacementProfileRequiredEvidence)) {
    errors.push('prep bundle JSON nextHandoff.requiredEvidenceBeforeUse must list replacement-profile activation and cutover evidence');
  }
  if (!sameStringArray(value.forbiddenBeforeUse, legacyV1ForbiddenBeforeUse)) {
    errors.push('prep bundle JSON nextHandoff.forbiddenBeforeUse must preserve the legacy V1 authority and claim quarantine');
  }
  return errors;
}

function sameStringArray(value: unknown, expected: string[]): boolean {
  return Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index]);
}

function validatePreparedCommandBinding(
  label: TestnetRehearsalPrepBundlePreparedCommand['label'],
  commandText: string,
  artifactTargets: Record<string, unknown> | undefined,
  packages: unknown,
): string[] {
  if (!commandText.trim() || !artifactTargets) return [];

  const target = (field: keyof TestnetRehearsalPrepBundleArtifactTargets): string | undefined =>
    typeof artifactTargets[field] === 'string' ? artifactTargets[field] as string : undefined;

  if (label === 'prebroadcast-doctor') {
    return validateExactPreparedCommand(
      label,
      commandText,
      target('prebroadcast') && target('doctor')
        ? `npm run prebroadcast:doctor -- ${target('prebroadcast')} --json-out ${target('doctor')}`
        : undefined,
      'command must be "npm run prebroadcast:doctor -- <artifactTargets.prebroadcast> --json-out <artifactTargets.doctor>"',
    );
  }

  if (label === 'rehearsal-preflight') {
    return validateExactPreparedCommand(
      label,
      commandText,
      target('prebroadcast') && target('approvals') && target('preflight')
        ? `npm run rehearsal:preflight -- --prebroadcast ${target('prebroadcast')} --approvals ${target('approvals')} --json-out ${target('preflight')}`
        : undefined,
      'command must bind artifactTargets.prebroadcast, artifactTargets.approvals, and artifactTargets.preflight',
    );
  }

  if (label === 'testnet-window-prep') {
    return validateWindowPrepPreparedCommand(commandText, artifactTargets, packages);
  }

  if (label === 'fresh-testnet-check') {
    return validateFreshCheckpointPreparedCommand(commandText, artifactTargets, packages);
  }

  if (label === 'offline-gate') {
    return validateExactPreparedCommand(
      label,
      commandText,
      target('doctor') && target('preflight') && target('windowPrep') && target('freshCheckpoint') && target('offlineGate')
        ? `npm run rehearsal:offline-gate -- --prebroadcast ${target('doctor')} --preflight ${target('preflight')} --window-prep ${target('windowPrep')} --fresh-checkpoint ${target('freshCheckpoint')} --json-out ${target('offlineGate')}`
        : undefined,
      'command must bind artifactTargets.doctor, artifactTargets.preflight, artifactTargets.windowPrep, artifactTargets.freshCheckpoint, and artifactTargets.offlineGate',
    );
  }

  if (label === 'live-rehearsal-draft') {
    return validateExactPreparedCommand(
      label,
      commandText,
      target('prebroadcast') && target('approvals')
        ? `npm run rehearsal:draft -- --prebroadcast ${target('prebroadcast')} --approvals ${target('approvals')} --out ${draftLiveRehearsalPlaceholder}`
        : undefined,
      'command must bind artifactTargets.prebroadcast and artifactTargets.approvals',
    );
  }

  return validateExactPreparedCommand(
    label,
    commandText,
    legacyV1SubmissionStatus,
    'command must be the standard legacy V1 quarantine status',
  );
}

function validateExactPreparedCommand(
  label: TestnetRehearsalPrepBundlePreparedCommand['label'],
  actual: string,
  expected: string | undefined,
  message: string,
): string[] {
  if (!expected || actual === expected) return [];
  return [`prep bundle JSON preparedCommands.${label} ${message}`];
}

function validateWindowPrepPreparedCommand(
  commandText: string,
  artifactTargets: Record<string, unknown>,
  packages: unknown,
): string[] {
  const prebroadcast = getStringField(artifactTargets, 'prebroadcast');
  const approvals = getStringField(artifactTargets, 'approvals');
  const windowPrep = getStringField(artifactTargets, 'windowPrep');
  if (!prebroadcast || !approvals || !windowPrep) return [];

  const match = new RegExp(
    '^npm run rehearsal:testnet-window-prep -- --prebroadcast ' +
    `${escapeRegExp(prebroadcast)} --approvals ${escapeRegExp(approvals)} ` +
    '--current-ergo-height (\\d+) --current-sidechain-height (\\d+) ' +
    '--current-deployed-state-hash ([0-9a-fA-F]{64}|0x[0-9a-fA-F]{64}) ' +
    '--ergo-node-network (\\S+) --sidechain-network (\\S+) ' +
    `--out ${testnetWindowPrepMdPlaceholder} --json-out ${escapeRegExp(windowPrep)}$`,
  ).exec(commandText);

  if (!match) {
    return [
      'prep bundle JSON preparedCommands.testnet-window-prep command must bind artifactTargets.prebroadcast, artifactTargets.approvals, artifactTargets.windowPrep, safe heights, current deployed-state hash, testnet/non-mainnet network scope, and the standard output placeholder',
    ];
  }

  const [, currentErgoHeight, currentSidechainHeight, currentDeployedStateHash, ergoNodeNetwork, sidechainNetwork] = match;
  const normalizedCurrentDeployedStateHash = normalizePreparedCommandHash(currentDeployedStateHash);
  const packageDeployedStateHash = extractPreparedPackageDeployedStateHash(packages);
  const errors: string[] = [];
  if (parseSafeNonNegativeInteger(currentErgoHeight) === undefined) {
    errors.push('prep bundle JSON preparedCommands.testnet-window-prep command must use a safe --current-ergo-height');
  }
  if (parseSafeNonNegativeInteger(currentSidechainHeight) === undefined) {
    errors.push('prep bundle JSON preparedCommands.testnet-window-prep command must use a safe --current-sidechain-height');
  }
  if (!/^(?:0x)?[0-9a-fA-F]{64}$/.test(currentDeployedStateHash)) {
    errors.push('prep bundle JSON preparedCommands.testnet-window-prep command must use a 32-byte --current-deployed-state-hash');
  }
  if (packageDeployedStateHash && normalizedCurrentDeployedStateHash !== packageDeployedStateHash) {
    errors.push(
      'prep bundle JSON preparedCommands.testnet-window-prep command --current-deployed-state-hash must match prepared package deployedStateHash',
    );
  }
  if (ergoNodeNetwork !== 'testnet') {
    errors.push('prep bundle JSON preparedCommands.testnet-window-prep command must use --ergo-node-network testnet');
  }
  if (!identifiesAllowedPreparedSidechainNetwork(sidechainNetwork)) {
    errors.push(
      'prep bundle JSON preparedCommands.testnet-window-prep command must use --sidechain-network patched-devnet, testnet, or non-mainnet',
    );
  }
  return errors;
}

function validateFreshCheckpointPreparedCommand(
  commandText: string,
  artifactTargets: Record<string, unknown>,
  packages: unknown,
): string[] {
  const aggregateTarget = extractPreparedPackageAggregateTarget(packages);
  const freshCheckpoint = getStringField(artifactTargets, 'freshCheckpoint');
  const heightEvidence = getStringField(artifactTargets, 'heightEvidence');
  const packageDeployedStateHash = extractPreparedPackageDeployedStateHash(packages);
  const errors: string[] = [];

  if (!aggregateTarget) {
    errors.push('prep bundle JSON preparedCommands.fresh-testnet-check command requires exactly one prepared package aggregate evidence target');
  }
  if (!freshCheckpoint) {
    errors.push('prep bundle JSON preparedCommands.fresh-testnet-check command must bind artifactTargets.freshCheckpoint');
  }
  if (!aggregateTarget || !freshCheckpoint) return errors;

  const escapedAggregateTarget = escapeRegExp(aggregateTarget);
  const escapedFreshCheckpoint = escapeRegExp(freshCheckpoint);
  const explicitMatch = new RegExp(
    '^npm run rehearsal:fresh-testnet-check -- --aggregate-evidence ' +
    `${escapedAggregateTarget} --height-evidence (\\S+) ` +
    '--current-ergo-height (\\d+) --current-sidechain-height (\\d+) ' +
    '--current-deployed-state-hash ((?:0x)?[0-9a-fA-F]{64}) ' +
    '--ergo-node-network testnet --sidechain-network (\\S+) ' +
    `--out ${freshCheckpointMdPlaceholder} --json-out ${escapedFreshCheckpoint}$`,
  ).exec(commandText);
  const autoMatch = new RegExp(
    '^npm run rehearsal:fresh-testnet-check -- --aggregate-evidence ' +
    `${escapedAggregateTarget} --auto-heights ` +
    '--current-deployed-state-hash ((?:0x)?[0-9a-fA-F]{64}) ' +
    '--ergo-node-network testnet --sidechain-network (\\S+) ' +
    `--out ${freshCheckpointMdPlaceholder} --json-out ${escapedFreshCheckpoint}$`,
  ).exec(commandText);

  if (!explicitMatch && !autoMatch) {
    return [
      'prep bundle JSON preparedCommands.fresh-testnet-check command must bind package aggregate evidence, safe height evidence mode, testnet/non-mainnet network scope, and artifactTargets.freshCheckpoint',
    ];
  }

  const matchedDeployedStateHash = explicitMatch?.[4] ?? autoMatch?.[1];
  const normalizedMatchedDeployedStateHash = normalizePreparedCommandHash(matchedDeployedStateHash ?? '');
  if (!matchedDeployedStateHash || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(matchedDeployedStateHash)) {
    errors.push('prep bundle JSON preparedCommands.fresh-testnet-check command must use a 32-byte --current-deployed-state-hash');
  }
  if (packageDeployedStateHash && normalizedMatchedDeployedStateHash !== packageDeployedStateHash) {
    errors.push(
      'prep bundle JSON preparedCommands.fresh-testnet-check command --current-deployed-state-hash must match prepared package deployedStateHash',
    );
  }

  if (explicitMatch) {
    const [, commandHeightEvidence, currentErgoHeight, currentSidechainHeight, , sidechainNetwork] = explicitMatch;
    if (!heightEvidence) {
      errors.push('prep bundle JSON preparedCommands.fresh-testnet-check explicit height mode requires artifactTargets.heightEvidence');
    } else if (commandHeightEvidence !== heightEvidence) {
      errors.push('prep bundle JSON preparedCommands.fresh-testnet-check command must bind artifactTargets.heightEvidence');
    }
    if (parseSafeNonNegativeInteger(currentErgoHeight) === undefined) {
      errors.push('prep bundle JSON preparedCommands.fresh-testnet-check command must use a safe --current-ergo-height');
    }
    if (parseSafeNonNegativeInteger(currentSidechainHeight) === undefined) {
      errors.push('prep bundle JSON preparedCommands.fresh-testnet-check command must use a safe --current-sidechain-height');
    }
    if (!identifiesAllowedPreparedSidechainNetwork(sidechainNetwork)) {
      errors.push('prep bundle JSON preparedCommands.fresh-testnet-check command must use --sidechain-network patched-devnet, testnet, or non-mainnet');
    }
  }

  if (autoMatch) {
    const [, , sidechainNetwork] = autoMatch;
    if (heightEvidence) {
      errors.push('prep bundle JSON preparedCommands.fresh-testnet-check command must use --height-evidence when artifactTargets.heightEvidence is present');
    }
    if (!identifiesAllowedPreparedSidechainNetwork(sidechainNetwork)) {
      errors.push('prep bundle JSON preparedCommands.fresh-testnet-check command must use --sidechain-network patched-devnet, testnet, or non-mainnet');
    }
  }

  return errors;
}

function validatePrepBundleReportStageStatuses(statuses: unknown): string[] {
  if (!isRecord(statuses)) {
    return ['prep bundle JSON stageStatuses must be present'];
  }

  const errors: string[] = [];
  if (statuses.preflight !== 'GO') {
    errors.push('prep bundle JSON stageStatuses.preflight must be GO');
  }
  if (statuses.windowPrep !== 'CREATED') {
    errors.push('prep bundle JSON stageStatuses.windowPrep must be CREATED');
  }
  if (statuses.draft !== 'CREATED') {
    errors.push('prep bundle JSON stageStatuses.draft must be CREATED');
  }
  if (statuses.freshCheckpoint !== 'LINKED') {
    errors.push('prep bundle JSON stageStatuses.freshCheckpoint must be LINKED');
  }
  if (statuses.recoveryRows !== 'PASS' && statuses.recoveryRows !== 'NOT_PROVIDED') {
    errors.push('prep bundle JSON stageStatuses.recoveryRows must be PASS or NOT_PROVIDED');
  }
  return errors;
}

function validatePrepBundleReportRecoveryRows(rows: unknown): string[] {
  if (!Array.isArray(rows)) {
    return ['prep bundle JSON recoveryRows must be an array'];
  }
  return rows.flatMap((row, index) => {
    if (!isRecord(row)) {
      return [`prep bundle JSON recoveryRows[${index}] must be an object`];
    }
    const errors: string[] = [];
    if (row.status !== 'linked') {
      errors.push(`prep bundle JSON recoveryRows[${index}].status must be linked`);
    }
    if (typeof row.target !== 'string' || validateConcretePrepBundleReportTarget(`recoveryRows[${index}].target`, row.target).length > 0) {
      errors.push(`prep bundle JSON recoveryRows[${index}].target must be a concrete non-sensitive evidence target`);
    }
    return errors;
  });
}

export function buildTestnetRehearsalPrepBundle(
  input: TestnetRehearsalPrepBundleInput,
): TestnetRehearsalPrepBundleReport {
  const preflight = preflightTestnetRehearsal({
    prebroadcastTarget: input.prebroadcastTarget,
    approvalsPath: input.approvalsPath,
    now: input.now,
  });
  const displayInput: TestnetRehearsalPrepBundleInput = {
    ...input,
    prebroadcastTarget: formatPrepBundleTargetLabel(preflight.targetBindings.prebroadcast),
    approvalsPath: formatPrepBundleTargetLabel(preflight.targetBindings.approvals ?? input.approvalsPath),
  };
  const windowPrep = prepareTestnetWindowPacket({
    prebroadcastTarget: input.prebroadcastTarget,
    approvalsPath: input.approvalsPath,
    currentErgoHeight: input.currentErgoHeight,
    currentSidechainHeight: input.currentSidechainHeight,
    currentDeployedStateHash: input.currentDeployedStateHash,
    ergoNodeNetwork: input.ergoNodeNetwork,
    sidechainNetwork: input.sidechainNetwork,
    broadcastEnabled: input.broadcastEnabled,
    now: input.now,
  });
  const draft = buildTestnetRehearsalDraft({
    prebroadcastTarget: input.prebroadcastTarget,
    approvalsPath: input.approvalsPath,
    doctorArtifact: input.doctorArtifact,
    preflightArtifact: input.preflightArtifact,
    operator: input.operator,
    reviewer: input.reviewer,
    gitCommit: input.gitCommit,
    sidechainNetwork: input.sidechainNetwork,
    now: input.now,
  });
  const recoveryRows = [
    ...validateRecoveryRow(input.failedBroadcast, failedBroadcastGate, 'failed-broadcast'),
    ...validateRecoveryRow(input.reorgRecovery, reorgRecoveryGate, 'reorg-recovery'),
  ];
  const recoveryErrors = recoveryRows.flatMap(row => row.errors);
  const freshCheckpointErrors = validateFreshCheckpointReference(input.freshCheckpointArtifact);
  const summaries = recoveryRows.map(row => row.summary).filter((summary): summary is RecoveryRowSummary => summary !== undefined);
  const artifactTargets = buildArtifactTargets(displayInput);
  const sourceBindings = buildSourceBindings(artifactTargets);
  const preparedCommands = buildPreparedCommands(displayInput, artifactTargets, preflight.packages);
  const nextHandoff = buildNextHandoff();
  const stageStatuses: TestnetRehearsalPrepBundleStageStatuses = {
    preflight: preflight.status,
    windowPrep: windowPrep.status,
    draft: draft.status,
    freshCheckpoint: input.freshCheckpointArtifact
      ? freshCheckpointErrors.length === 0 ? 'LINKED' : 'BLOCKED'
      : 'NOT_PROVIDED',
    recoveryRows: recoveryRows.length === 0 ? 'NOT_PROVIDED' : recoveryErrors.length === 0 ? 'PASS' : 'BLOCKED',
  };
  const errors = [
    ...(preflight.status === 'BLOCKED' ? preflight.errors.map(error => `preflight: ${error}`) : []),
    ...(windowPrep.status === 'BLOCKED' ? windowPrep.errors.map(error => `window-prep: ${error}`) : []),
    ...(draft.status === 'BLOCKED' ? draft.errors.map(error => `draft: ${error}`) : []),
    ...recoveryErrors,
    ...freshCheckpointErrors,
    ...validateExposedPrepBundleTargets(input),
  ];

  if (errors.length > 0) {
    const message = `testnet rehearsal prep bundle BLOCKED: ${errors.length} issue(s)`;
    return {
      status: 'BLOCKED',
      executionStatus: 'QUARANTINED',
      message,
      errors,
      packages: preflight.packages,
      gateBoundary,
      artifactTargets,
      sourceBindings,
      preparedCommands,
      nextHandoff,
      stageStatuses,
      recoveryRows: summaries,
      lines: buildLines(message, displayInput, preflight.packages, summaries, errors),
    };
  }

  const message = 'testnet rehearsal prep bundle CREATED - execution QUARANTINED';
  return {
    status: 'CREATED',
    executionStatus: 'QUARANTINED',
    message,
    errors: [],
    packages: preflight.packages,
    gateBoundary,
    artifactTargets,
    sourceBindings,
    preparedCommands,
    nextHandoff,
    stageStatuses,
    recoveryRows: summaries,
    markdown: renderMarkdown(displayInput, preflight.packages, summaries, preparedCommands),
    lines: buildLines(message, displayInput, preflight.packages, summaries, []),
  };
}

function buildArtifactTargets(input: TestnetRehearsalPrepBundleInput): TestnetRehearsalPrepBundleArtifactTargets {
  return {
    prebroadcast: formatPrepBundleTargetLabel(input.prebroadcastTarget),
    approvals: formatPrepBundleTargetLabel(input.approvalsPath),
    doctor: formatPrepBundleTargetLabel(input.doctorArtifact ?? '<prebroadcast-doctor.json>'),
    preflight: formatPrepBundleTargetLabel(input.preflightArtifact ?? '<rehearsal-preflight.json>'),
    windowPrep: formatPrepBundleTargetLabel(input.windowPrepArtifact ?? '<testnet-window-prep.json>'),
    offlineGate: formatPrepBundleTargetLabel(input.offlineGateArtifact ?? '<offline-gate.json>'),
    ...(input.freshCheckpointArtifact ? {
      freshCheckpoint: formatFreshCheckpointTargetLabel(input.freshCheckpointArtifact),
    } : {}),
    ...(input.heightEvidenceArtifact ? {
      heightEvidence: formatPrepBundleTargetLabel(input.heightEvidenceArtifact),
    } : {}),
    ...(input.failedBroadcast ? { failedBroadcast: formatPrepBundleTargetLabel(input.failedBroadcast) } : {}),
    ...(input.reorgRecovery ? { reorgRecovery: formatPrepBundleTargetLabel(input.reorgRecovery) } : {}),
  };
}

function buildSourceBindings(
  targets: TestnetRehearsalPrepBundleArtifactTargets,
): TestnetRehearsalPrepBundleSourceBindings {
  const freshCheckpointTarget = targets.freshCheckpoint ?? freshCheckpointJsonPlaceholder;
  return {
    freshCheckpoint: {
      source: 'prepared-command',
      commandLabel: 'fresh-testnet-check',
      target: freshCheckpointTarget,
    },
    offlineGate: {
      source: 'prepared-command',
      commandLabel: 'offline-gate',
      target: targets.offlineGate,
      inputs: {
        prebroadcast: targets.doctor,
        rehearsalPreflight: targets.preflight,
        windowPrep: targets.windowPrep,
        freshCheckpoint: freshCheckpointTarget,
      },
    },
  };
}

function buildPreparedCommands(
  input: TestnetRehearsalPrepBundleInput,
  targets: TestnetRehearsalPrepBundleArtifactTargets,
  packages: TestnetRehearsalPreflightPackage[],
): TestnetRehearsalPrepBundlePreparedCommand[] {
  return [
    offlineCommand(
      'prebroadcast-doctor',
      `npm run prebroadcast:doctor -- ${targets.prebroadcast} --json-out ${targets.doctor}`,
    ),
    offlineCommand(
      'rehearsal-preflight',
      `npm run rehearsal:preflight -- --prebroadcast ${targets.prebroadcast} --approvals ${targets.approvals} --json-out ${targets.preflight}`,
    ),
    offlineCommand(
      'testnet-window-prep',
      `npm run rehearsal:testnet-window-prep -- --prebroadcast ${targets.prebroadcast} --approvals ${targets.approvals} --current-ergo-height ${input.currentErgoHeight} --current-sidechain-height ${input.currentSidechainHeight} --current-deployed-state-hash ${input.currentDeployedStateHash} --ergo-node-network testnet --sidechain-network ${input.sidechainNetwork} --out ${testnetWindowPrepMdPlaceholder} --json-out ${targets.windowPrep}`,
    ),
    offlineCommand(
      'fresh-testnet-check',
      buildFreshCheckpointPreparedCommand(input, targets, packages),
    ),
    offlineCommand(
      'offline-gate',
      `npm run rehearsal:offline-gate -- --prebroadcast ${targets.doctor} --preflight ${targets.preflight} --window-prep ${targets.windowPrep} --fresh-checkpoint ${targets.freshCheckpoint ?? freshCheckpointJsonPlaceholder} --json-out ${targets.offlineGate}`,
    ),
    offlineCommand(
      'live-rehearsal-draft',
      `npm run rehearsal:draft -- --prebroadcast ${targets.prebroadcast} --approvals ${targets.approvals} --out ${draftLiveRehearsalPlaceholder}`,
    ),
    {
      label: 'legacy-v1-live-preflight-quarantine',
      phase: 'blocked-live-settlement',
      command: legacyV1SubmissionStatus,
      broadcastCommand: false,
      requiresExplicitLiveBroadcastApproval: false,
    },
  ];
}

function buildNextHandoff(): TestnetRehearsalPrepBundleNextHandoff {
  return {
    label: 'external-fee-profile-activation-prerequisites',
    phase: 'blocked-live-settlement',
    command: legacyV1SubmissionStatus,
    requiresExplicitLiveBroadcastApproval: false,
    broadcastCommand: false,
    reportAuthorizesBroadcast: false,
    requiredEvidenceBeforeUse: [...replacementProfileRequiredEvidence],
    forbiddenBeforeUse: [...legacyV1ForbiddenBeforeUse],
  };
}

function offlineCommand(
  label: Exclude<TestnetRehearsalPrepBundlePreparedCommand['label'], 'legacy-v1-live-preflight-quarantine'>,
  command: string,
): TestnetRehearsalPrepBundlePreparedCommand {
  return {
    label,
    phase: 'offline-preparation',
    command,
    broadcastCommand: false,
    requiresExplicitLiveBroadcastApproval: false,
  };
}

function buildFreshCheckpointPreparedCommand(
  input: TestnetRehearsalPrepBundleInput,
  targets: TestnetRehearsalPrepBundleArtifactTargets,
  packages: TestnetRehearsalPreflightPackage[],
): string {
  const aggregateTarget = packages.length === 1 ? packages[0].target : aggregateCheckJsonPlaceholder;
  const freshCheckpointTarget = targets.freshCheckpoint ?? freshCheckpointJsonPlaceholder;
  const heightMode = targets.heightEvidence
    ? `--height-evidence ${targets.heightEvidence} --current-ergo-height ${input.currentErgoHeight} --current-sidechain-height ${input.currentSidechainHeight}`
    : '--auto-heights';
  return (
    `npm run rehearsal:fresh-testnet-check -- --aggregate-evidence ${aggregateTarget} ${heightMode} ` +
    `--current-deployed-state-hash ${input.currentDeployedStateHash} ` +
    `--ergo-node-network testnet --sidechain-network ${input.sidechainNetwork} ` +
    `--out ${freshCheckpointMdPlaceholder} --json-out ${freshCheckpointTarget}`
  );
}

function validateExposedPrepBundleTargets(input: TestnetRehearsalPrepBundleInput): string[] {
  const specs: PrepBundleTargetSpec[] = [
    ['artifactTargets.prebroadcast', input.prebroadcastTarget],
    ['artifactTargets.approvals', input.approvalsPath],
    ['artifactTargets.doctor', input.doctorArtifact, '.json'],
    ['artifactTargets.preflight', input.preflightArtifact, '.json'],
    ['artifactTargets.windowPrep', input.windowPrepArtifact, '.json'],
    ['artifactTargets.offlineGate', input.offlineGateArtifact, '.json'],
    ['artifactTargets.heightEvidence', input.heightEvidenceArtifact, '.json'],
    ['artifactTargets.failedBroadcast', input.failedBroadcast],
    ['artifactTargets.reorgRecovery', input.reorgRecovery],
  ];
  return [
    ...specs.flatMap(([label, target, requiredExtension]) =>
      validatePrepBundleTarget(label, target, requiredExtension),
    ),
    ...validateDistinctPrepBundleTargets([
      ...specs,
      ['artifactTargets.freshCheckpoint', input.freshCheckpointArtifact, '.json'],
    ]),
  ];
}

function validatePrepBundleTarget(
  label: string,
  target: string | undefined,
  requiredExtension?: string,
): string[] {
  const trimmedTarget = target?.trim() ?? '';
  if (!trimmedTarget || isPlaceholderTarget(trimmedTarget)) return [];
  const formatted = formatPrepBundleTargetLabel(trimmedTarget);
  const normalized = trimmedTarget.replace(/\\/g, '/').toLowerCase();
  const name = basename(normalized);
  const extension = extname(name);
  const errors: string[] = [];
  const isRuntimeDatabasePath = isEvidenceRuntimeDatabaseTarget(normalized);

  if (isLocalAbsoluteTarget(normalized) || isLocalFileUrl(normalized)) {
    errors.push(`${label}: ${formatted} must be a relative non-secret evidence target`);
  }
  if (hasUriSchemeTarget(normalized) && !isLocalAbsoluteTarget(normalized) && !isLocalFileUrl(normalized)) {
    errors.push(`${label}: ${formatted} must not be a URI`);
  }
  if (escapesBridgeRoot(normalized)) {
    errors.push(`${label}: ${formatted} must not escape the bridge repository`);
  }
  if (hasShellUnsafeTargetContent(trimmedTarget)) {
    errors.push(`${label}: ${formatted} must not contain whitespace or shell metacharacters`);
  }
  if (isEvidenceEnvironmentFileName(name)) {
    errors.push(`${label}: ${blockedPrepBundleTargetLabel} must not be an environment file`);
  }
  if (isRuntimeDatabasePath) {
    errors.push(`${label}: ${formatted} must not reference runtime database material`);
  }
  if (isEvidenceSecretOrRuntimeName(normalized, { includeDeployedState: true })) {
    errors.push(`${label}: ${blockedPrepBundleTargetLabel} must not reference secret-bearing or runtime-state material`);
  }
  if (isNonConcretePrepBundleTarget(normalized)) {
    errors.push(`${label}: ${formatted} must not be a template, placeholder, or non-concrete target`);
  }
  if (hasClaimEscalatingPrepBundleTarget(normalized)) {
    errors.push(`${label}: ${formatted} must not use production claim wording`);
  }
  if (requiredExtension && extension !== requiredExtension) {
    errors.push(`${label}: ${formatted} must be a ${requiredExtension} preparation artifact`);
  }
  return errors;
}

function hasClaimEscalatingPrepBundleTarget(target: string): boolean {
  const normalizedTarget = target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').toLowerCase();
  const claim = classifyPublicationClaimText(normalizedTarget);
  return claim.hasProductionClaim;
}

function formatPrepBundleTargetLabel(target: string): string {
  const trimmedTarget = target.trim();
  if (isPlaceholderTarget(trimmedTarget)) return trimmedTarget;
  const normalized = trimmedTarget.replace(/\\/g, '/').toLowerCase();
  const name = basename(normalized);
  const isRuntimeDatabasePath = isEvidenceRuntimeDatabaseTarget(normalized);
  const isSensitiveName =
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalized, { includeDeployedState: true });

  if (isSensitiveName) return blockedPrepBundleTargetLabel;
  if (hasUriSchemeTarget(normalized) && !isLocalAbsoluteTarget(normalized) && !isLocalFileUrl(normalized)) {
    return blockedPrepBundleTargetLabel;
  }
  if (escapesBridgeRoot(normalized)) return blockedPrepBundleTargetLabel;
  if (isLocalAbsoluteTarget(normalized) || isLocalFileUrl(normalized)) return blockedPrepBundleTargetLabel;
  if (hasShellUnsafeTargetContent(trimmedTarget)) return blockedPrepBundleTargetLabel;
  if (isRuntimeDatabasePath) return name;
  return trimmedTarget;
}

function formatFreshCheckpointTargetLabel(target: string | undefined): string {
  if (!target) return '<fresh-testnet-checkpoint.json>';
  const trimmedTarget = target.trim();
  const formatted = formatPrepBundleTargetLabel(trimmedTarget);
  if (formatted === blockedPrepBundleTargetLabel || isPlaceholderTarget(trimmedTarget)) return formatted;

  try {
    const bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
    const checkpointPath = realpathSync(resolve(process.cwd(), trimmedTarget));
    return isInsidePath(checkpointPath, bridgeRoot) ? formatted : blockedPrepBundleTargetLabel;
  } catch {
    return formatted;
  }
}

function validateDistinctPrepBundleTargets(
  specs: PrepBundleTargetSpec[],
): string[] {
  const seen = new Map<string, { label: string; target: string }>();
  const errors: string[] = [];

  for (const [label, target, requiredExtension] of specs) {
    if (!target || isPlaceholderTarget(target)) continue;
    if (validatePrepBundleTarget(label, target, requiredExtension).length > 0) continue;

    const comparable = normalizeComparablePrepBundleTarget(target);
    const previous = seen.get(comparable);
    if (previous) {
      errors.push(
        `artifactTargets must be distinct: ${previous.label} and ${label} both use ${formatPrepBundleTargetLabel(target)}`,
      );
    } else {
      seen.set(comparable, { label, target });
    }
  }

  return errors;
}

function normalizeComparablePrepBundleTarget(target: string): string {
  return target.trim().replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
}

function hasContradictoryValidationFailureMarker(segment: string): boolean {
  const withoutExpectedQuarantine = segment.split(legacyV1SubmissionStatus).join('LEGACY_V1_QUARANTINE');
  const normalized = normalizeEvidenceMarkerText(withoutExpectedQuarantine);
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

function isPlaceholderTarget(target: string): boolean {
  return /^<[^<>]+>$/.test(target.trim());
}

function isNonConcretePrepBundleTarget(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\\/]+/)
    .some(segment => isNonConcretePrepBundleTargetSegment(segment));
}

function isNonConcretePrepBundleTargetSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /[<>]/.test(segment) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example)[-_ ]*evidence(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example|template)(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|validator|prebroadcast|approval|approvals|doctor|preflight|window|prep|offline|gate|height|json|bundle)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:proof|evidence|artifact|target|log|run|check|update|validator|prebroadcast|approval|approvals|doctor|preflight|window|prep|offline|gate|height|json|bundle)(?:[-_.](?:sample|example|template)(?:[-_.]|$))/i.test(normalized)
  );
}

function validateRecoveryRow(
  target: string | undefined,
  gate: string,
  label: RecoveryRowSummary['label'],
): Array<{ summary?: RecoveryRowSummary; errors: string[] }> {
  if (!target) return [];
  const read = readEvidenceMarkdownTarget(target);
  if (read.errors.length > 0) {
    return [{ errors: read.errors.map(error => `${label}: ${error}`) }];
  }
  const row = extractLifecycleRow(read.markdown, gate);
  if (!row) {
    return [{ errors: [`${label}: ${gate} row is required`] }];
  }
  const errors: string[] = [];
  if (!isPassLifecycleRow(row, gate)) {
    errors.push(`${label}: ${gate} row status must be pass`);
  }
  if (!hasRecoveryObservationPassEvidence(row)) {
    errors.push(`${label}: ${gate} row must cite structured recovery observation PASS evidence`);
  }
  if (label === 'reorg-recovery') {
    if (!hasRecoveryValidationPassEvidence(row)) {
      errors.push(`${label}: ${gate} row must cite rehearsal:validate or test PASS evidence`);
    }
  } else if (!/\bnpm run rehearsal:validate command output:\s*PASS\b/i.test(row)) {
    errors.push(`${label}: ${gate} row must cite rehearsal:validate PASS evidence`);
  }
  if (hasRecoveryRowFailureMarker(row)) {
    errors.push(`${label}: ${gate} row must not contain BLOCKED/FAIL`);
  }
  if (recoveryRowEnablesBroadcast(row)) {
    errors.push(`${label}: ${gate} row must not enable broadcast`);
  }
  if (textIndicatesMainnetTarget(row)) {
    errors.push(`${label}: ${gate} row must not indicate mainnet`);
  }
  return [{
    errors,
    summary: errors.length === 0
      ? { label, target, gate, status: 'linked' }
      : undefined,
  }];
}

function hasRecoveryRowFailureMarker(row: string): boolean {
  return /\bBLOCKED\b|\bFAIL(?:ED)?\b(?![- ]broadcast)/i.test(normalizeEvidenceMarkerText(row));
}

function recoveryRowEnablesBroadcast(row: string): boolean {
  const normalized = normalizeEvidenceMarkerText(row);
  return (
    /\bBRIDGE_BROADCAST_ENABLED\s*(?:=|:|is)\s*true\b/i.test(normalized) ||
    /\bbroadcast\s+(?:approved|allowed|certified|endorsed|recommended|accredited)\b/i.test(normalized) ||
    /\b(?:certif(?:y|ied|ies)|endorse(?:d|s)?|recommend(?:ed|s)?|accredit(?:ed|s)?)\s+(?:live\s+)?broadcast(?:\s+approval)?\b/i.test(normalized) ||
    /\blive\s+broadcast\s+approval(?:\s+recorded)?\s*(?:=|:|is)?\s*(?:yes|approved|certified|endorsed|recommended|accredited)\b/i.test(normalized)
  );
}

function hasRecoveryObservationPassEvidence(row: string): boolean {
  return /\bstructured recovery observation PASS\b/i.test(row) &&
    /\bobservation\s+artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s<>|]+/i.test(row);
}

function hasRecoveryValidationPassEvidence(row: string): boolean {
  return (
    /\bnpm run rehearsal:validate command output:\s*PASS\b/i.test(row) ||
    /\b(?:test|vitest|CI|workflow) evidence command output:\s*PASS\b/i.test(row)
  );
}

function validateFreshCheckpointReference(target: string | undefined): string[] {
  if (!target) {
    return ['freshCheckpoint: fresh testnet checkpoint JSON artifact is required'];
  }
  const trimmedTarget = target.trim();
  if (isPlaceholderTarget(trimmedTarget)) {
    return ['freshCheckpoint: concrete checkpoint JSON target is required'];
  }

  const targetErrors = validatePrepBundleTarget('artifactTargets.freshCheckpoint', trimmedTarget);
  if (targetErrors.length > 0) return targetErrors;

  const label = formatFreshCheckpointTargetLabel(trimmedTarget);
  if (extname(trimmedTarget).toLowerCase() !== '.json') {
    return [`freshCheckpoint: ${label} must be a JSON checkpoint report`];
  }

  try {
    const bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
    const checkpointPath = realpathSync(resolve(process.cwd(), trimmedTarget));
    if (!isInsidePath(checkpointPath, bridgeRoot)) {
      return [`freshCheckpoint: ${blockedPrepBundleTargetLabel} must resolve inside the bridge repository`];
    }
    const artifact = JSON.parse(readFileSync(checkpointPath, 'utf8'));
    return validateFreshCheckpointArtifact(artifact);
  } catch {
    return [`freshCheckpoint: ${label} could not be read or parsed`];
  }
}

function extractLifecycleRow(markdown: string, gate: string): string | undefined {
  const rows = markdown
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('|') && line.endsWith('|') && line.split('|')[1]?.trim() === gate);
  return rows.length === 1 ? rows[0] : undefined;
}

function isPassLifecycleRow(row: string, gate: string): boolean {
  const cells = row.split('|').map(cell => cell.trim()).filter((_, index, all) => index > 0 && index < all.length - 1);
  return cells.length >= 3 && cells[0] === gate && cells[1].toLowerCase() === 'pass';
}

function renderMarkdown(
  input: TestnetRehearsalPrepBundleInput,
  packages: TestnetRehearsalPreflightPackage[],
  recoveryRows: RecoveryRowSummary[],
  preparedCommands: TestnetRehearsalPrepBundlePreparedCommand[],
): string {
  const nextHandoff = buildNextHandoff();
  const date = (input.now ?? new Date()).toISOString().slice(0, 10);
  return `# Testnet Rehearsal Preparation Bundle

This bundle was generated from matched pre-broadcast and live-window preparation inputs. It is read-only diagnostic evidence. Legacy V1 settlement remains quarantined, this bundle contains no executable live-preflight or submit handoff, and it cannot close Gate 3.

## Bundle Scope

- Date: ${date}
- Environment: testnet
- Ergo node network: ${input.ergoNodeNetwork}
- Sidechain network: ${input.sidechainNetwork}
- Broadcast enabled: no
- Prebroadcast target: ${input.prebroadcastTarget}
- Approvals target: ${input.approvalsPath}
- Current Ergo height: ${input.currentErgoHeight}
- Current sidechain height: ${input.currentSidechainHeight}
- Current deployment-state hash: ${input.currentDeployedStateHash.toLowerCase().replace(/^0x/, '')}
- Fresh checkpoint JSON target: ${formatFreshCheckpointTargetLabel(input.freshCheckpointArtifact)}
- Height evidence JSON target: ${input.heightEvidenceArtifact ? formatPrepBundleTargetLabel(input.heightEvidenceArtifact) : 'auto-heights read-only /info plus getBlockNumber'}

## Prepared Package Bindings

- Package count: ${packages.length}
${packages.map(formatPackageMarkdown).join('\n')}

## Prepared Artifact Commands

${preparedCommands.map(formatPreparedCommandMarkdown).join('\n')}

## Operator Handoff

- Next action label: ${nextHandoff.label}
- Current status: ${nextHandoff.command}
- Requires explicit live broadcast approval: no; approval cannot override this quarantine
- Broadcast command: no
- Report authorizes broadcast: no
- Required evidence before any replacement-profile live handoff: ${replacementProfileRequiredEvidence.join('; ')}
- Forbidden while legacy V1 remains selected: ${legacyV1ForbiddenBeforeUse.join('; ')}

## Optional Recovery Rows

${formatRecoveryRows(recoveryRows)}

## Gate Boundary

- Gate 3 closure allowed: no
- Production-ready claim allowed: no
- Testnet production-candidate claim allowed: no
- Live submit performed: no
- Confirmation observed: no
- Reconciliation performed: no
- Next safe step: activate a reviewed, separately versioned external-fee profile, prove target-node acceptance and funds authority, then retire every legacy funds route before generating any live-preflight handoff.
`;
}

function formatPreparedCommandMarkdown(command: TestnetRehearsalPrepBundlePreparedCommand): string {
  return `- ${command.label}: ${command.command} [broadcast command: no; requires explicit live broadcast approval: no]`;
}

function formatPackageMarkdown(pkg: TestnetRehearsalPreflightPackage, index: number): string {
  return [
    `- Package ${index + 1} target: ${pkg.target}`,
    `- Package ${index + 1} command: ${pkg.command}`,
    `- Package ${index + 1} mode: ${pkg.mode}`,
    `- Package ${index + 1} Expected transaction ID: ${pkg.expectedTxId}`,
    `- Package ${index + 1} burnTxHashes: ${pkg.burnTxHashes.join(',')}`,
    `- Package ${index + 1} sidechainBlockHeights: ${pkg.sidechainBlockHeights.join(',')}`,
    `- Package ${index + 1} ergoAnchorHeights: ${pkg.ergoAnchorHeights.join(',')}`,
    `- Package ${index + 1} bridgeEventRoots: ${formatBridgeEventRootCsv(pkg.bridgeEventRootHexes)}`,
    `- Package ${index + 1} deployedStateHash: ${pkg.deployedStateHash}`,
  ].join('\n');
}

function formatRecoveryRows(rows: RecoveryRowSummary[]): string {
  if (rows.length === 0) {
    return '- Recovery rows linked: no\n- Recovery rows remain optional preparation inputs and do not close Gate 3.';
  }
  return rows.map(row => `- ${row.gate}: ${row.status} ${formatPrepBundleTargetLabel(row.target)}`).join('\n');
}

function buildLines(
  message: string,
  input: TestnetRehearsalPrepBundleInput,
  packages: TestnetRehearsalPreflightPackage[],
  recoveryRows: RecoveryRowSummary[],
  errors: string[],
): string[] {
  const lines = [
    message,
    `- prebroadcast target: ${formatPrepBundleTargetLabel(input.prebroadcastTarget)}`,
    `- approvals target: ${formatPrepBundleTargetLabel(input.approvalsPath)}`,
    `- fresh checkpoint target: ${formatFreshCheckpointTargetLabel(input.freshCheckpointArtifact)}`,
    `- height evidence target: ${input.heightEvidenceArtifact ? formatPrepBundleTargetLabel(input.heightEvidenceArtifact) : 'auto-heights read-only /info plus getBlockNumber'}`,
    `- package count: ${packages.length}`,
    ...packages.map(pkg => `- package mode=${pkg.mode} expectedTxId=${pkg.expectedTxId} burnTxHashes=${pkg.burnTxHashes.join(',')}`),
    `- recovery rows linked: ${recoveryRows.length}`,
    '- scope: read-only testnet rehearsal preparation; no signing, submit, confirm, node mutation, or broadcast command executed.',
    `- next handoff: ${buildNextHandoff().command}`,
    '- next handoff cannot be generated until a reviewed external-fee profile, target-node acceptance, funds-authority transition, legacy-route retirement, and replay-safe cutover are complete; approval cannot override the quarantine.',
  ];
  if (errors.length > 0) {
    lines.push('- Remaining issues:');
    lines.push(...errors.map(error => `  - ${error}`));
    lines.push('- Next safe step: fix preparation artifacts and keep broadcast disabled.');
  } else {
    lines.push('- Next safe step: complete replacement-profile activation and permanent legacy-route retirement before generating a live-preflight handoff; this bundle does not authorize broadcast.');
  }
  return lines;
}

function textIndicatesMainnetTarget(text: string): boolean {
  return text
    .split(/\r?\n/)
    .some(line => {
      const match = /^\s*-?\s*([^:]+):\s*(.+?)\s*$/.exec(line);
      if (!match) return /\b(?:target|network|environment)\b.{0,40}\bmain[- ]?net\b/i.test(stripNonMainnet(line));
      const key = match[1].toLowerCase();
      return (
        /(network|environment|target|chain|scope)/i.test(key) &&
        /\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/i.test(stripNonMainnet(match[2]))
      );
    });
}

function stripNonMainnet(value: string): string {
  return value.replace(/\bnon[- ]?main[- ]?net\b/gi, '');
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

function getStringField(record: Record<string, unknown>, field: string): string | undefined {
  return typeof record[field] === 'string' ? record[field] : undefined;
}

function prepBundleCommandHasSensitiveOrBroadcastContent(command: string): boolean {
  const normalized = command.replace(/\\/g, '/').toLowerCase();
  return (
    containsForbiddenPrepBundleSourceBindingString(command) ||
    normalized.includes('bridge_broadcast_enabled=true') ||
    /^[a-z]:\//i.test(normalized) ||
    normalized.includes('file:///') ||
    /[<>|;]/.test(command) ||
    /\bnpm\s+run\s+settle:aggregate\s+--\s+submit\b/i.test(command) ||
    /\b(?:broadcast|submit)\s*=\s*true\b/i.test(command)
  );
}

function hasShellUnsafeTargetContent(target: string): boolean {
  return !/^[A-Za-z0-9._/-]+$/.test(target.replace(/\\/g, '/'));
}

function parseSafeNonNegativeInteger(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function identifiesAllowedPreparedSidechainNetwork(value: string): boolean {
  if (value.trim().length === 0) return false;
  const valueWithoutNonMainnet = value.replace(/\bnon[- ]?main[- ]?net\b/gi, '');
  if (/\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/i.test(valueWithoutNonMainnet)) {
    return false;
  }
  return (
    /\bpatched[- ]?devnet\b/i.test(value) ||
    /\btest[- ]?net\b/i.test(value) ||
    /\bnon[- ]?main[- ]?net\b/i.test(value)
  );
}

function extractPreparedPackageDeployedStateHash(packages: unknown): string | undefined {
  if (!Array.isArray(packages)) return undefined;
  const hashes = new Set<string>();
  for (const pkg of packages) {
    if (!isRecord(pkg) || typeof pkg.deployedStateHash !== 'string') continue;
    const normalized = normalizePreparedCommandHash(pkg.deployedStateHash);
    if (normalized) hashes.add(normalized);
  }
  return hashes.size === 1 ? [...hashes][0] : undefined;
}

function extractPreparedPackageAggregateTarget(packages: unknown): string | undefined {
  if (!Array.isArray(packages) || packages.length !== 1) return undefined;
  const [pkg] = packages;
  return isRecord(pkg) && typeof pkg.target === 'string' ? pkg.target : undefined;
}

function normalizePreparedCommandHash(value: string): string | undefined {
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
