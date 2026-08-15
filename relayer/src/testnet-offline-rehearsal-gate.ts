import { readFileSync, realpathSync } from 'fs';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'path';
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
import { validateReadOnlyNodeUrl } from './read-only-node-url.js';
import { validateTestnetWindowPrepReport } from './testnet-window-prep.js';

export type TestnetOfflineRehearsalGateStatus = 'PASS' | 'BLOCKED';
export type TestnetOfflineRehearsalStageName =
  | 'prebroadcast'
  | 'rehearsalPreflight'
  | 'windowPrep'
  | 'freshCheckpoint';
export type TestnetOfflineRehearsalArtifactInput = unknown;
export type TestnetOfflineRehearsalArtifactPathInput = string;

export interface TestnetOfflineRehearsalGateInput {
  prebroadcast?: TestnetOfflineRehearsalArtifactInput;
  rehearsalPreflight?: TestnetOfflineRehearsalArtifactInput;
  windowPrep?: TestnetOfflineRehearsalArtifactInput;
  freshCheckpoint?: TestnetOfflineRehearsalArtifactInput;
}

export interface TestnetOfflineRehearsalGatePathInput {
  prebroadcast?: TestnetOfflineRehearsalArtifactPathInput;
  rehearsalPreflight?: TestnetOfflineRehearsalArtifactPathInput;
  windowPrep?: TestnetOfflineRehearsalArtifactPathInput;
  freshCheckpoint?: TestnetOfflineRehearsalArtifactPathInput;
}

export interface TestnetOfflineRehearsalGateStage {
  name: TestnetOfflineRehearsalStageName;
  label: string;
  status?: string;
  passEquivalent: boolean;
  source: 'object' | 'path' | 'text' | 'missing';
  target?: string;
}

export interface TestnetOfflineRehearsalGateSourceBinding {
  source: 'path';
  target: string;
}

export type TestnetOfflineRehearsalGateSourceBindings =
  Partial<Record<TestnetOfflineRehearsalStageName, TestnetOfflineRehearsalGateSourceBinding>>;

export interface TestnetOfflineRehearsalGateTargetBindings {
  offlineGate?: string;
}

export interface TestnetOfflineRehearsalGateReport {
  status: TestnetOfflineRehearsalGateStatus;
  message: string;
  errors: string[];
  stages: TestnetOfflineRehearsalGateStage[];
  sourceBindings: TestnetOfflineRehearsalGateSourceBindings;
  targetBindings?: TestnetOfflineRehearsalGateTargetBindings;
  lines: string[];
}

export interface TestnetOfflineRehearsalGateReportValidation {
  errors: string[];
}

interface StageConfig {
  name: TestnetOfflineRehearsalStageName;
  label: string;
  passStatuses: Set<string>;
}

interface LoadedArtifact {
  artifact?: unknown;
  source: TestnetOfflineRehearsalGateStage['source'];
  label: string;
  target?: string;
  errors: string[];
}

interface StageEvaluation {
  stage: TestnetOfflineRehearsalGateStage;
  errors: string[];
}

const stageConfigs: StageConfig[] = [
  {
    name: 'prebroadcast',
    label: 'prebroadcast validate/doctor',
    passStatuses: new Set(['PASS']),
  },
  {
    name: 'rehearsalPreflight',
    label: 'rehearsal preflight',
    passStatuses: new Set(['PASS', 'GO']),
  },
  {
    name: 'windowPrep',
    label: 'testnet window prep',
    passStatuses: new Set(['PASS', 'CREATED']),
  },
  {
    name: 'freshCheckpoint',
    label: 'fresh testnet checkpoint',
    passStatuses: new Set(['CREATED']),
  },
];
const maxFreshCheckpointAgeMs = 15 * 60 * 1000;

const blockedRuntimePathFragments = [
  'deployed_state',
  '.runtime-backups',
  '.devnet-backups',
];
const blockedArtifactTargetLabel = '<blocked artifact target>';

export function gateTestnetOfflineRehearsalBundle(
  input: TestnetOfflineRehearsalGateInput,
): TestnetOfflineRehearsalGateReport {
  const loaded = stageConfigs
    .map(config => ({
    config,
    loaded: {
      artifact: input[config.name],
      source: input[config.name] === undefined ? 'missing' : sourceForArtifact(input[config.name]),
      label: config.label,
      errors: [],
      } satisfies LoadedArtifact,
    }));
  const evaluations = loaded.map(({ config, loaded: artifact }) => evaluateStage(config, artifact));
  return buildReport(evaluations, loaded.map(({ config, loaded: artifact }) => [config.name, artifact.artifact]));
}

export function readAndGateTestnetOfflineRehearsalBundle(
  input: TestnetOfflineRehearsalGatePathInput,
): TestnetOfflineRehearsalGateReport {
  const loaded = stageConfigs
    .map(config => ({
    config,
    loaded: loadArtifactPath(input[config.name], config),
    }));
  const evaluations = loaded.map(({ config, loaded: artifact }) => evaluateStage(config, artifact));
  return buildReport(evaluations, loaded.map(({ config, loaded: artifact }) => [config.name, artifact.artifact]));
}

export function validateTestnetOfflineRehearsalGateReport(
  report: unknown,
): TestnetOfflineRehearsalGateReportValidation {
  const errors: string[] = [];
  if (!isRecord(report) || Array.isArray(report)) {
    return { errors: ['offline-gate: structured offline gate JSON is required'] };
  }

  if (report.schemaVersion !== 1) {
    errors.push('offline-gate: schemaVersion must be 1');
  }
  if (report.status !== 'PASS') {
    errors.push('offline-gate: status must be PASS');
  }
  if (
    typeof report.message !== 'string' ||
    !/\btestnet offline rehearsal gate PASS\b/i.test(report.message)
  ) {
    errors.push('offline-gate: message must describe a PASS offline rehearsal gate');
  }
  if (!Array.isArray(report.errors)) {
    errors.push('offline-gate: errors must be an array');
  } else if (report.errors.length > 0) {
    errors.push('offline-gate: errors must be empty');
  }

  const stages = Array.isArray(report.stages) ? report.stages : undefined;
  if (!stages) {
    errors.push('offline-gate: stages must be an array');
  } else {
    errors.push(...validateOfflineGateReportStages(stages));
  }

  const sourceBindings = isRecord(report.sourceBindings) && !Array.isArray(report.sourceBindings)
    ? report.sourceBindings
    : undefined;
  if (!sourceBindings) {
    errors.push('offline-gate: sourceBindings must be present');
  } else if (stages) {
    if (containsForbiddenSourceBindingPayloadValue(sourceBindings)) {
      errors.push('offline-gate: sourceBindings must not serialize auth, secret, runtime, state, or database payloads');
    }
    errors.push(...validateOfflineGateSourceBindings(sourceBindings, stages));
  }

  const targetBindings = isRecord(report.targetBindings) && !Array.isArray(report.targetBindings)
    ? report.targetBindings
    : undefined;
  if (!targetBindings) {
    errors.push('offline-gate: targetBindings.offlineGate must cite a concrete .json artifact');
  } else if (!isConcreteEvidenceJsonTarget(String(targetBindings.offlineGate ?? ''))) {
    errors.push('offline-gate: targetBindings.offlineGate must cite a concrete .json artifact');
  }
  if (
    targetBindings &&
    typeof targetBindings.offlineGate === 'string' &&
    hasShellUnsafeTargetContent(targetBindings.offlineGate)
  ) {
    errors.push('offline-gate: targetBindings.offlineGate must not contain whitespace or shell metacharacters');
  }

  if (!Array.isArray(report.lines) || report.lines.some(line => typeof line !== 'string')) {
    errors.push('offline-gate: lines must be an array of strings');
  } else {
    const joinedLines = report.lines.join('\n');
    if (!/\boffline scope:\s*artifact validation only;\s*no broadcast command executed\b/i.test(joinedLines)) {
      errors.push('offline-gate: lines must preserve the no-broadcast offline scope');
    }
    if (!/\bproceed only to explicit live rehearsal approval collection\b/i.test(joinedLines)) {
      errors.push('offline-gate: lines must preserve the explicit live approval handoff');
    }
    if (hasUnresolvedEvidenceIssueMarker(joinedLines)) {
      errors.push('offline-gate: PASS report lines must not contain remaining issues');
    }
    if (report.lines.some(hasContradictoryValidationFailureMarker)) {
      errors.push('offline-gate: lines must not include contradictory failure markers');
    }
    if (report.lines.some(containsForbiddenSourceBindingPayloadString)) {
      errors.push('offline-gate: lines must not serialize auth, secret, runtime, state, or database payloads');
    }
  }

  return { errors };
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

function validateOfflineGateReportStages(stages: unknown[]): string[] {
  const errors: string[] = [];
  for (const config of stageConfigs) {
    const matches = stages.filter(stage =>
      isRecord(stage) &&
      !Array.isArray(stage) &&
      stage.name === config.name
    );
    if (matches.length === 0) {
      errors.push(`offline-gate: stage ${config.name} must be present`);
      continue;
    }
    if (matches.length > 1) {
      errors.push(`offline-gate: stage ${config.name} must be unique`);
      continue;
    }

    const stage = matches[0] as Record<string, unknown>;
    const normalizedStatus = typeof stage.status === 'string'
      ? stage.status.toUpperCase()
      : undefined;
    if (!normalizedStatus || !config.passStatuses.has(normalizedStatus)) {
      errors.push(`offline-gate: stage ${config.name} status must be PASS-equivalent`);
    }
    if (stage.passEquivalent !== true) {
      errors.push(`offline-gate: stage ${config.name} passEquivalent must be true`);
    }
    if (stage.source !== 'path') {
      errors.push(`offline-gate: stage ${config.name} source must be path`);
    }
    if (typeof stage.target !== 'string' || !isConcreteEvidenceJsonTarget(stage.target)) {
      errors.push(`offline-gate: stage ${config.name} target must cite a concrete .json artifact`);
    }
    if (typeof stage.target === 'string' && hasShellUnsafeTargetContent(stage.target)) {
      errors.push(`offline-gate: stage ${config.name} target must not contain whitespace or shell metacharacters`);
    }
  }

  const expectedNames = new Set(stageConfigs.map(config => config.name));
  for (const stage of stages) {
    if (!isRecord(stage) || Array.isArray(stage)) {
      errors.push('offline-gate: stages entries must be objects');
      continue;
    }
    if (typeof stage.name !== 'string' || !expectedNames.has(stage.name as TestnetOfflineRehearsalStageName)) {
      errors.push('offline-gate: stages must not contain unexpected entries');
    }
  }

  return errors;
}

function validateOfflineGateSourceBindings(
  sourceBindings: Record<string, unknown>,
  stages: unknown[],
): string[] {
  const errors: string[] = [];
  for (const config of stageConfigs) {
    const binding = sourceBindings[config.name];
    const stage = stages.find(candidate =>
      isRecord(candidate) &&
      !Array.isArray(candidate) &&
      candidate.name === config.name
    );
    if (!isRecord(binding) || Array.isArray(binding)) {
      errors.push(`offline-gate: sourceBindings.${config.name} must be present`);
      continue;
    }
    if (binding.source !== 'path') {
      errors.push(`offline-gate: sourceBindings.${config.name}.source must be path`);
    }
    if (typeof binding.target !== 'string' || !isConcreteEvidenceJsonTarget(binding.target)) {
      errors.push(`offline-gate: sourceBindings.${config.name}.target must cite a concrete .json artifact`);
    }
    if (typeof binding.target === 'string' && hasShellUnsafeTargetContent(binding.target)) {
      errors.push(
        `offline-gate: sourceBindings.${config.name}.target must not contain whitespace or shell metacharacters`,
      );
    }
    if (
      isRecord(stage) &&
      typeof stage.target === 'string' &&
      typeof binding.target === 'string' &&
      normalizeEvidenceJsonTarget(binding.target) !== normalizeEvidenceJsonTarget(stage.target)
    ) {
      errors.push(`offline-gate: sourceBindings.${config.name}.target must match stage target`);
    }
  }
  return errors;
}

function evaluateStage(config: StageConfig, loaded: LoadedArtifact): StageEvaluation {
  const baseStage: TestnetOfflineRehearsalGateStage = {
    name: config.name,
    label: config.label,
    source: loaded.source,
    target: loaded.target,
    status: undefined,
    passEquivalent: false,
  };

  if (loaded.errors.length > 0) {
    return { stage: baseStage, errors: loaded.errors };
  }

  if (loaded.artifact === undefined || loaded.artifact === null) {
    return {
      stage: baseStage,
      errors: [`${config.name}: required artifact is missing`],
    };
  }

  const status = extractStatus(loaded.artifact, config.name);
  const normalizedStatus = status?.toUpperCase();
  const passEquivalent = normalizedStatus ? config.passStatuses.has(normalizedStatus) : false;
  const stage = {
    ...baseStage,
    status,
    passEquivalent,
  };
  const errors = [
    ...(passEquivalent ? [] : [
      `${config.name}: status must be PASS-equivalent, got ${status ?? '<missing>'}`,
    ]),
    ...validateNoArtifactErrors(config.name, loaded.artifact),
    ...validateGenericArtifactLines(config.name, loaded.artifact),
    ...validateNoBroadcast(config.name, loaded.artifact),
    ...validateNoMainnet(config.name, loaded.artifact),
    ...(config.name === 'windowPrep' ? validateTestnetWindowPrepReport(loaded.artifact).errors : []),
    ...(config.name === 'freshCheckpoint' ? validateFreshCheckpointArtifact(loaded.artifact) : []),
  ];

  return { stage, errors };
}

function loadArtifactPath(
  target: string | undefined,
  config: StageConfig,
): LoadedArtifact {
  if (!target) {
    return {
      source: 'missing',
      label: config.label,
      errors: [`${config.name}: required artifact is missing`],
    };
  }

  const trimmedTarget = target.trim();
  const normalizedTarget = trimmedTarget.replace(/\\/g, '/');

  const pathErrors = validateSafeArtifactPath(config.name, trimmedTarget);
  if (pathErrors.length > 0) {
    const targetLabel = formatResolvedArtifactTargetLabel(trimmedTarget);
    return {
      source: 'path',
      label: targetLabel,
      target: targetLabel,
      errors: pathErrors,
    };
  }

  try {
    const text = readFileSync(trimmedTarget, 'utf8');
    if (extname(trimmedTarget).toLowerCase() === '.json') {
      return {
        artifact: JSON.parse(text),
        source: 'path',
        label: trimmedTarget,
        target: normalizedTarget,
        errors: [],
      };
    }

    return {
      artifact: text,
      source: 'path',
      label: trimmedTarget,
      target: normalizedTarget,
      errors: [],
    };
  } catch (err: any) {
    const targetLabel = formatResolvedArtifactTargetLabel(trimmedTarget);
    return {
      source: 'path',
      label: targetLabel,
      target: targetLabel === blockedArtifactTargetLabel ? targetLabel : normalizedTarget,
      errors: [`${config.name}: cannot read artifact ${targetLabel}`],
    };
  }
}

function validatePackageConsistency(
  artifactEntries: Array<[TestnetOfflineRehearsalStageName, unknown]>,
): string[] {
  const artifacts = new Map(artifactEntries);
  const prebroadcastPackages = extractPrebroadcastFingerprints(artifacts.get('prebroadcast'));
  const preflightPackages = extractPackageFingerprints('rehearsalPreflight', artifacts.get('rehearsalPreflight'));
  const windowPrepPackages = extractPackageFingerprints('windowPrep', artifacts.get('windowPrep'));
  const freshCheckpointPackages = artifacts.has('freshCheckpoint')
    ? extractFreshCheckpointFingerprints(artifacts.get('freshCheckpoint'))
    : { packages: [], errors: [] };
  const errors = [
    ...prebroadcastPackages.errors,
    ...preflightPackages.errors,
    ...windowPrepPackages.errors,
    ...freshCheckpointPackages.errors,
  ];
  if (errors.length > 0) return errors;
  if (prebroadcastPackages.packages.length !== preflightPackages.packages.length) {
    return [
      `offline package binding: prebroadcast linked JSON count ${prebroadcastPackages.packages.length} must match rehearsalPreflight package count ${preflightPackages.packages.length}`,
    ];
  }
  if (preflightPackages.packages.length !== windowPrepPackages.packages.length) {
    return [
      `offline package binding: rehearsalPreflight package count ${preflightPackages.packages.length} must match windowPrep package count ${windowPrepPackages.packages.length}`,
    ];
  }
  if (freshCheckpointPackages.packages.length > 0 && freshCheckpointPackages.packages.length !== preflightPackages.packages.length) {
    return [
      `offline package binding: freshCheckpoint package count ${freshCheckpointPackages.packages.length} must match rehearsalPreflight package count ${preflightPackages.packages.length}`,
    ];
  }

  for (let index = 0; index < preflightPackages.packages.length; index += 1) {
    const prebroadcast = prebroadcastPackages.packages[index];
    const preflight = preflightPackages.packages[index];
    const windowPrep = windowPrepPackages.packages[index];
    const freshCheckpoint = freshCheckpointPackages.packages[index];
    if (prebroadcast.command !== preflight.command) {
      errors.push(
        `offline package binding: prebroadcast linked JSON ${index + 1} command must match rehearsalPreflight package ${index + 1}`,
      );
    }
    if (prebroadcast.expectedTxId !== preflight.expectedTxId) {
      errors.push(
        `offline package binding: prebroadcast linked JSON ${index + 1} expectedTxId must match rehearsalPreflight package ${index + 1}`,
      );
    }
    for (const field of packageBindingFields) {
      if (preflight[field] !== windowPrep[field]) {
        errors.push(
          `offline package binding: rehearsalPreflight package ${index + 1} ${field} must match windowPrep package ${index + 1}`,
        );
      }
    }
    if (freshCheckpoint) {
      for (const field of freshCheckpointBindingFields) {
        if (freshCheckpoint[field] !== preflight[field]) {
          errors.push(
            `offline package binding: freshCheckpoint package ${index + 1} ${field} must match rehearsalPreflight package ${index + 1}`,
          );
        }
      }
    }
  }
  return [
    ...errors,
    ...validateFreshCheckpointWindowNetworkBinding(
      artifacts.get('windowPrep'),
      artifacts.get('freshCheckpoint'),
    ),
    ...validateFreshCheckpointWindowHeightBinding(
      artifacts.get('windowPrep'),
      artifacts.get('freshCheckpoint'),
    ),
  ];
}

interface PrebroadcastFingerprint {
  command: string;
  expectedTxId: string;
}

type PackageBindingField =
  | 'command'
  | 'mode'
  | 'expectedTxId'
  | 'burnTxHashes'
  | 'sidechainBlockHeights'
  | 'sidechainHeaderHashHexes'
  | 'ergoAnchorHeights'
  | 'bridgeEventRootHexes'
  | 'deployedStateHash';

type PackageFingerprint = Record<PackageBindingField, string>;
type FreshCheckpointBindingField =
  | 'expectedTxId'
  | 'burnTxHashes'
  | 'sidechainBlockHeights'
  | 'sidechainHeaderHashHexes'
  | 'ergoAnchorHeights'
  | 'bridgeEventRootHexes'
  | 'deployedStateHash';
type FreshCheckpointFingerprint = Record<FreshCheckpointBindingField, string>;

function validateFreshCheckpointWindowNetworkBinding(
  windowPrep: unknown,
  freshCheckpoint: unknown,
): string[] {
  if (!isRecord(windowPrep) || !isRecord(freshCheckpoint)) return [];
  const networkScope = isRecord(windowPrep.networkScope) ? windowPrep.networkScope : undefined;
  const checkpoint = isRecord(freshCheckpoint.checkpoint) ? freshCheckpoint.checkpoint : undefined;
  if (!networkScope || !checkpoint) return [];

  const windowErgoNetwork = normalizeString(networkScope.ergoNodeNetwork);
  const windowSidechainNetwork = normalizeString(networkScope.sidechainNetwork);
  const checkpointErgoNetwork = normalizeString(checkpoint.ergoNodeNetwork);
  const checkpointSidechainNetwork = normalizeString(checkpoint.sidechainNetwork);
  const errors: string[] = [];

  if (
    windowErgoNetwork !== undefined &&
    checkpointErgoNetwork !== windowErgoNetwork
  ) {
    errors.push(
      'offline window binding: freshCheckpoint ergoNodeNetwork must match windowPrep networkScope.ergoNodeNetwork',
    );
  }
  if (
    windowSidechainNetwork !== undefined &&
    checkpointSidechainNetwork !== windowSidechainNetwork
  ) {
    errors.push(
      'offline window binding: freshCheckpoint sidechainNetwork must match windowPrep networkScope.sidechainNetwork',
    );
  }

  return errors;
}

function validateFreshCheckpointWindowHeightBinding(
  windowPrep: unknown,
  freshCheckpoint: unknown,
): string[] {
  if (!isRecord(windowPrep) || !isRecord(freshCheckpoint)) return [];
  const heightBoundary = isRecord(windowPrep.heightBoundary) ? windowPrep.heightBoundary : undefined;
  const checkpoint = isRecord(freshCheckpoint.checkpoint) ? freshCheckpoint.checkpoint : undefined;
  if (!heightBoundary || !checkpoint) return [];

  const windowErgoHeight = normalizeNonNegativeSafeInteger(
    heightBoundary.currentErgoHeight,
  );
  const windowSidechainHeight = normalizeNonNegativeSafeInteger(
    heightBoundary.currentSidechainHeight,
  );
  const checkpointErgoHeight = normalizeNonNegativeSafeInteger(
    checkpoint.currentErgoHeight,
  );
  const checkpointSidechainHeight = normalizeNonNegativeSafeInteger(
    checkpoint.currentSidechainHeight,
  );
  const errors: string[] = [];

  if (
    windowErgoHeight !== undefined &&
    checkpointErgoHeight !== undefined &&
    checkpointErgoHeight < windowErgoHeight
  ) {
    errors.push(
      'offline window binding: freshCheckpoint currentErgoHeight must be greater than or equal to windowPrep currentErgoHeight',
    );
  }
  if (
    windowSidechainHeight !== undefined &&
    checkpointSidechainHeight !== undefined &&
    checkpointSidechainHeight < windowSidechainHeight
  ) {
    errors.push(
      'offline window binding: freshCheckpoint currentSidechainHeight must be greater than or equal to windowPrep currentSidechainHeight',
    );
  }

  return errors;
}

const packageBindingFields: PackageBindingField[] = [
  'command',
  'mode',
  'expectedTxId',
  'burnTxHashes',
  'sidechainBlockHeights',
  'sidechainHeaderHashHexes',
  'ergoAnchorHeights',
  'bridgeEventRootHexes',
  'deployedStateHash',
];

const freshCheckpointBindingFields: FreshCheckpointBindingField[] = [
  'expectedTxId',
  'burnTxHashes',
  'sidechainBlockHeights',
  'sidechainHeaderHashHexes',
  'ergoAnchorHeights',
  'bridgeEventRootHexes',
  'deployedStateHash',
];

function extractPackageFingerprints(
  stageName: 'rehearsalPreflight' | 'windowPrep',
  artifact: unknown,
): { packages: PackageFingerprint[]; errors: string[] } {
  if (!isRecord(artifact)) return { packages: [], errors: [`${stageName}: packages array is required`] };
  if (!Array.isArray(artifact.packages)) {
    return { packages: [], errors: [`${stageName}: packages array is required`] };
  }
  if (artifact.packages.length === 0) {
    return { packages: [], errors: [`${stageName}: packages array must not be empty`] };
  }

  const errors: string[] = [];
  const packages = artifact.packages.map((pkg, index) => {
    const normalized = normalizePackageFingerprint(pkg);
    if (!normalized) {
      errors.push(`${stageName}: packages[${index}] must include complete package binding fields`);
    }
    return normalized;
  });
  return {
    packages: packages.filter((pkg): pkg is PackageFingerprint => pkg !== undefined),
    errors,
  };
}

function extractPrebroadcastFingerprints(
  artifact: unknown,
): { packages: PrebroadcastFingerprint[]; errors: string[] } {
  const summaries = extractPrebroadcastLinkedAggregateSummaries(artifact);
  if (!summaries) {
    return {
      packages: [],
      errors: ['prebroadcast: linkedAggregateJsonSummaries array is required for offline package binding'],
    };
  }
  if (summaries.length === 0) {
    return {
      packages: [],
      errors: ['prebroadcast: linkedAggregateJsonSummaries array must not be empty'],
    };
  }

  const errors: string[] = [];
  const packages = summaries.map((summary, index) => {
    if (!isRecord(summary)) {
      errors.push(`prebroadcast: linkedAggregateJsonSummaries[${index}] must be an object`);
      return undefined;
    }
    const status = normalizeString(summary.status);
    const command = normalizeString(summary.command);
    const expectedTxId = normalizeHex32Value(summary.expectedTxId);
    if (status !== 'read' || command === undefined || expectedTxId === undefined) {
      errors.push(`prebroadcast: linkedAggregateJsonSummaries[${index}] must include READ command and expectedTxId`);
      return undefined;
    }
    return { command, expectedTxId };
  });

  return {
    packages: packages.filter((pkg): pkg is PrebroadcastFingerprint => pkg !== undefined),
    errors,
  };
}

function extractPrebroadcastLinkedAggregateSummaries(artifact: unknown): unknown[] | undefined {
  if (!isRecord(artifact)) return undefined;
  if (Array.isArray(artifact.linkedAggregateJsonSummaries)) return artifact.linkedAggregateJsonSummaries;
  if (!Array.isArray(artifact.reports)) return undefined;
  return artifact.reports.flatMap(report =>
    isRecord(report) && Array.isArray(report.linkedAggregateJsonSummaries)
      ? report.linkedAggregateJsonSummaries
      : [],
  );
}

function extractFreshCheckpointFingerprints(
  artifact: unknown,
): { packages: FreshCheckpointFingerprint[]; errors: string[] } {
  const stageErrors = validateFreshCheckpointArtifact(artifact);
  if (stageErrors.length > 0) return { packages: [], errors: stageErrors };
  if (!isRecord(artifact)) return { packages: [], errors: [] };
  const checkpoint = isRecord(artifact.checkpoint) ? artifact.checkpoint : undefined;
  if (!checkpoint) return { packages: [], errors: [] };

  const fingerprint = normalizeFreshCheckpointFingerprint(checkpoint);
  if (!fingerprint) {
    return {
      packages: [],
      errors: ['freshCheckpoint: checkpoint must include complete package binding fields'],
    };
  }
  return { packages: [fingerprint], errors: [] };
}

export function validateFreshCheckpointArtifact(artifact: unknown): string[] {
  if (!isRecord(artifact)) {
    return ['freshCheckpoint: structured checkpoint JSON is required'];
  }
  const status = normalizeString(artifact.status);
  const checkpoint = isRecord(artifact.checkpoint) ? artifact.checkpoint : undefined;
  const boundary = isRecord(artifact.boundary) ? artifact.boundary : undefined;
  const sourceBindings = isRecord(artifact.sourceBindings) ? artifact.sourceBindings : undefined;
  const errors = [
    ...(status === 'created' ? [] : ['freshCheckpoint: status must be CREATED']),
    ...(checkpoint ? [] : ['freshCheckpoint: checkpoint object is required']),
    ...(boundary ? validateFreshCheckpointBoundary(boundary) : ['freshCheckpoint: boundary object is required']),
  ];
  if (!checkpoint) return errors;

  const lifecycleStatus = normalizeString(checkpoint.lifecycleStatus);
  if (lifecycleStatus !== 'publication blocker') {
    errors.push('freshCheckpoint: checkpoint.lifecycleStatus must be publication blocker');
  }
  if (checkpoint.transactionCheckResult !== 'PASS') {
    errors.push('freshCheckpoint: checkpoint.transactionCheckResult must be PASS');
  }
  if (checkpoint.broadcast !== 'no') {
    errors.push('freshCheckpoint: checkpoint.broadcast must be no');
  }
  errors.push(...validateFreshCheckpointNetworkScope(checkpoint));
  if (sourceBindings && containsForbiddenSourceBindingPayloadValue(sourceBindings)) {
    errors.push('freshCheckpoint: sourceBindings must not serialize auth, secret, runtime, state, or database payloads');
  }
  if ('lines' in artifact) {
    if (!Array.isArray(artifact.lines) || artifact.lines.some(line => typeof line !== 'string')) {
      errors.push('freshCheckpoint: lines must be an array of strings when present');
    } else if (artifact.lines.some(hasContradictoryValidationFailureMarker)) {
      errors.push('freshCheckpoint: lines must not include contradictory failure markers');
    } else if (artifact.lines.some(hasUnresolvedEvidenceIssueMarker)) {
      errors.push('freshCheckpoint: lines must not include remaining issues');
    }
  }
  errors.push(...validateFreshCheckpointAggregateEvidenceBinding(checkpoint, sourceBindings));
  if (!normalizeFreshCheckpointFingerprint(checkpoint)) {
    errors.push('freshCheckpoint: checkpoint must include complete package binding fields');
  }
  errors.push(...validateFreshCheckpointHeightEvidence(checkpoint, sourceBindings));
  errors.push(...validateFreshCheckpointSingletonCheckpoint(checkpoint, sourceBindings));
  errors.push(...validateFreshCheckpointAnchorObservations(checkpoint, sourceBindings));
  return errors;
}

function validateFreshCheckpointNetworkScope(checkpoint: Record<string, unknown>): string[] {
  const ergoNodeNetwork = typeof checkpoint.ergoNodeNetwork === 'string'
    ? checkpoint.ergoNodeNetwork
    : '';
  const sidechainNetwork = typeof checkpoint.sidechainNetwork === 'string'
    ? checkpoint.sidechainNetwork
    : '';
  const errors: string[] = [];

  if (!identifiesPositiveTestnetNetwork(ergoNodeNetwork)) {
    errors.push('freshCheckpoint: checkpoint.ergoNodeNetwork must positively identify testnet');
  }
  if (!identifiesAllowedSidechainNetwork(sidechainNetwork)) {
    errors.push('freshCheckpoint: checkpoint.sidechainNetwork must identify patched-devnet, testnet, or non-mainnet');
  }

  return errors;
}

function validateFreshCheckpointAggregateEvidenceBinding(
  checkpoint: Record<string, unknown>,
  sourceBindings: Record<string, unknown> | undefined,
): string[] {
  const errors: string[] = [];
  const checkpointTarget = typeof checkpoint.aggregateEvidence === 'string'
    ? checkpoint.aggregateEvidence
    : undefined;
  const sourceTarget = sourceBindings && typeof sourceBindings.aggregateEvidence === 'string'
    ? sourceBindings.aggregateEvidence
    : undefined;

  if (!checkpointTarget || !isConcreteEvidenceJsonTarget(checkpointTarget)) {
    errors.push('freshCheckpoint: checkpoint.aggregateEvidence must cite a concrete non-template aggregate evidence JSON target');
  }
  if (!sourceTarget || !isConcreteEvidenceJsonTarget(sourceTarget)) {
    errors.push('freshCheckpoint: sourceBindings.aggregateEvidence must cite a concrete non-template aggregate evidence JSON target');
  }
  if (
    checkpointTarget &&
    sourceTarget &&
    normalizeEvidenceJsonTarget(checkpointTarget) !== normalizeEvidenceJsonTarget(sourceTarget)
  ) {
    errors.push('freshCheckpoint: sourceBindings.aggregateEvidence must match checkpoint.aggregateEvidence');
  }

  return errors;
}

function validateFreshCheckpointHeightEvidence(
  checkpoint: Record<string, unknown>,
  sourceBindings: Record<string, unknown> | undefined,
): string[] {
  const heightEvidence = isRecord(checkpoint.heightEvidence)
    ? checkpoint.heightEvidence
    : undefined;
  if (!heightEvidence) {
    return ['freshCheckpoint: checkpoint.heightEvidence is required'];
  }

  const currentErgoHeight = normalizeNonNegativeSafeInteger(checkpoint.currentErgoHeight);
  const currentSidechainHeight = normalizeNonNegativeSafeInteger(checkpoint.currentSidechainHeight);
  const ergoNodeHeight = normalizeNonNegativeSafeInteger(heightEvidence.ergoNodeHeight);
  const sidechainBlockHeight = normalizeNonNegativeSafeInteger(heightEvidence.sidechainBlockHeight);
  const sources = isRecord(heightEvidence.sources) ? heightEvidence.sources : undefined;
  const errors: string[] = [];

  if (!isIsoUtcTimestamp(String(heightEvidence.observedAt ?? ''))) {
    errors.push('freshCheckpoint: heightEvidence.observedAt must be an ISO UTC timestamp');
  } else {
    errors.push(...validateObservedAtFreshness(
      String(heightEvidence.observedAt),
      'freshCheckpoint: heightEvidence.observedAt',
    ));
  }
  if (currentErgoHeight === undefined) {
    errors.push('freshCheckpoint: checkpoint.currentErgoHeight must be a non-negative safe integer');
  }
  if (currentSidechainHeight === undefined) {
    errors.push('freshCheckpoint: checkpoint.currentSidechainHeight must be a non-negative safe integer');
  }
  if (ergoNodeHeight === undefined) {
    errors.push('freshCheckpoint: heightEvidence.ergoNodeHeight must be a non-negative safe integer');
  } else if (currentErgoHeight !== undefined && ergoNodeHeight !== currentErgoHeight) {
    errors.push('freshCheckpoint: heightEvidence.ergoNodeHeight must match checkpoint.currentErgoHeight');
  }
  if (sidechainBlockHeight === undefined) {
    errors.push('freshCheckpoint: heightEvidence.sidechainBlockHeight must be a non-negative safe integer');
  } else if (currentSidechainHeight !== undefined && sidechainBlockHeight !== currentSidechainHeight) {
    errors.push('freshCheckpoint: heightEvidence.sidechainBlockHeight must match checkpoint.currentSidechainHeight');
  }
  if (!sources) {
    errors.push('freshCheckpoint: heightEvidence.sources is required');
  } else {
    if (sources.ergo !== 'read-only-no-auth /info') {
      errors.push('freshCheckpoint: heightEvidence.sources.ergo must be read-only-no-auth /info');
    }
    if (sources.sidechain !== 'read-only EVM getBlockNumber') {
      errors.push('freshCheckpoint: heightEvidence.sources.sidechain must be read-only EVM getBlockNumber');
    }
  }
  if (heightEvidence.broadcastEnabled !== false) {
    errors.push('freshCheckpoint: heightEvidence.broadcastEnabled must be false');
  }

  const heightBindings = sourceBindings && isRecord(sourceBindings.heightEvidence)
    ? sourceBindings.heightEvidence
    : undefined;
  if (!heightBindings) {
    errors.push('freshCheckpoint: sourceBindings.heightEvidence is required');
  } else {
    const mode = heightBindings.mode;
    if (mode !== 'live-read-only-sources' && mode !== 'provided-json') {
      errors.push('freshCheckpoint: sourceBindings.heightEvidence.mode must be live-read-only-sources or provided-json');
    }
    if (mode === 'live-read-only-sources') {
      if (heightBindings.readOnlyErgoNodeClient !== true) {
        errors.push('freshCheckpoint: sourceBindings.heightEvidence.readOnlyErgoNodeClient must be true for live-read-only-sources');
      }
      if (heightBindings.readOnlySidechainRpcClient !== true) {
        errors.push('freshCheckpoint: sourceBindings.heightEvidence.readOnlySidechainRpcClient must be true for live-read-only-sources');
      }
      if (heightBindings.nodeAuthHeader !== 'not-used') {
        errors.push('freshCheckpoint: sourceBindings.heightEvidence.nodeAuthHeader must be not-used for live-read-only-sources');
      }
      errors.push(...validateReadOnlySourceBindingUrl(
        heightBindings.ergoNodeUrl,
        'freshCheckpoint: sourceBindings.heightEvidence.ergoNodeUrl',
      ));
      errors.push(...validateReadOnlySourceBindingUrl(
        heightBindings.sidechainRpcUrl,
        'freshCheckpoint: sourceBindings.heightEvidence.sidechainRpcUrl',
      ));
      errors.push(...validateStringArrayEntries(
        heightBindings.operations,
        'freshCheckpoint: sourceBindings.heightEvidence.operations',
      ));
      const operations = stringArrayValues(heightBindings.operations)
        .map(value => value.toLowerCase());
      if (
        !operations.some(operation => operation.includes('/info')) ||
        !operations.some(operation => operation.includes('getblocknumber'))
      ) {
        errors.push('freshCheckpoint: sourceBindings.heightEvidence.operations must cite /info and getBlockNumber for live-read-only-sources');
      }
    }
    if (mode === 'provided-json') {
      const target = typeof heightBindings.target === 'string' ? heightBindings.target : undefined;
      if (!target || !isConcreteEvidenceJsonTarget(target)) {
        errors.push('freshCheckpoint: sourceBindings.heightEvidence.target must cite a concrete non-template height evidence JSON target when mode is provided-json');
      }
      if (heightBindings.readOnlyErgoNodeClient !== false) {
        errors.push('freshCheckpoint: sourceBindings.heightEvidence.readOnlyErgoNodeClient must be false for provided-json');
      }
      if (heightBindings.readOnlySidechainRpcClient !== false) {
        errors.push('freshCheckpoint: sourceBindings.heightEvidence.readOnlySidechainRpcClient must be false for provided-json');
      }
      if (heightBindings.nodeAuthHeader !== 'not-applicable') {
        errors.push('freshCheckpoint: sourceBindings.heightEvidence.nodeAuthHeader must be not-applicable for provided-json');
      }
      if (Array.isArray(heightBindings.operations) && heightBindings.operations.length > 0) {
        errors.push('freshCheckpoint: sourceBindings.heightEvidence.operations must be empty for provided-json');
      }
    }
    if (heightBindings.observedAt !== heightEvidence.observedAt) {
      errors.push('freshCheckpoint: sourceBindings.heightEvidence.observedAt must match checkpoint.heightEvidence.observedAt');
    }
    if (normalizeNonNegativeSafeInteger(heightBindings.ergoNodeHeight) !== ergoNodeHeight) {
      errors.push('freshCheckpoint: sourceBindings.heightEvidence.ergoNodeHeight must match checkpoint.heightEvidence.ergoNodeHeight');
    }
    if (normalizeNonNegativeSafeInteger(heightBindings.sidechainBlockHeight) !== sidechainBlockHeight) {
      errors.push('freshCheckpoint: sourceBindings.heightEvidence.sidechainBlockHeight must match checkpoint.heightEvidence.sidechainBlockHeight');
    }
    if (heightBindings.broadcastEnabled !== false) {
      errors.push('freshCheckpoint: sourceBindings.heightEvidence.broadcastEnabled must be false');
    }
  }

  return errors;
}

function validateFreshCheckpointAnchorObservations(
  checkpoint: Record<string, unknown>,
  sourceBindings: Record<string, unknown> | undefined,
): string[] {
  const observations = Array.isArray(checkpoint.anchorObservations)
    ? checkpoint.anchorObservations
    : [];
  const ergoAnchorHeights = Array.isArray(checkpoint.ergoAnchorHeights)
    ? checkpoint.ergoAnchorHeights
    : [];
  const bridgeEventRootHexes = Array.isArray(checkpoint.bridgeEventRootHexes)
    ? checkpoint.bridgeEventRootHexes
    : [];
  const currentErgoHeight = normalizeNonNegativeSafeInteger(checkpoint.currentErgoHeight);
  const errors: string[] = [];
  if (currentErgoHeight === undefined) {
    errors.push('freshCheckpoint: checkpoint.currentErgoHeight must be a non-negative safe integer');
  }
  if (observations.length === 0) {
    errors.push('freshCheckpoint: checkpoint.anchorObservations is required');
  }
  if (observations.length !== bridgeEventRootHexes.length || observations.length !== ergoAnchorHeights.length) {
    errors.push('freshCheckpoint: anchor observation count must match aggregate bridgeEventRootHexes and Ergo anchor heights');
  }

  for (const [index, observation] of observations.entries()) {
    const prefix = `freshCheckpoint: anchor observation ${index + 1}`;
    if (!isRecord(observation)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    const expectedRoot = normalizeHex32Value(bridgeEventRootHexes[index]);
    const observedExpectedRoot = normalizeHex32Value(observation.expectedBridgeEventRootHex);
    const observedRoots = Array.isArray(observation.observedBridgeEventRootHexes)
      ? observation.observedBridgeEventRootHexes.map(normalizeHex32Value)
      : [];
    const observationAnchorHeight = typeof observation.ergoAnchorHeight === 'number' &&
      Number.isSafeInteger(observation.ergoAnchorHeight)
      ? observation.ergoAnchorHeight
      : undefined;
    if (observationAnchorHeight === undefined || observationAnchorHeight !== ergoAnchorHeights[index]) {
      errors.push(`${prefix} Ergo anchor height must match checkpoint.ergoAnchorHeights`);
    }
    if (!isIsoUtcTimestamp(String(observation.observedAt ?? ''))) {
      errors.push(`${prefix} observedAt must be an ISO UTC timestamp`);
    } else {
      errors.push(...validateObservedAtFreshness(
        String(observation.observedAt),
        `${prefix} observedAt`,
      ));
    }
    if (
      typeof observation.nodeHeight !== 'number' ||
      !Number.isSafeInteger(observation.nodeHeight) ||
      observation.nodeHeight < 0
    ) {
      errors.push(`${prefix} nodeHeight must be a non-negative safe integer`);
    } else {
      if (currentErgoHeight !== undefined && observation.nodeHeight !== currentErgoHeight) {
        errors.push(`${prefix} nodeHeight must match checkpoint.currentErgoHeight`);
      }
      if (observationAnchorHeight !== undefined && observation.nodeHeight < observationAnchorHeight) {
        errors.push(`${prefix} nodeHeight must be greater than or equal to Ergo anchor height`);
      }
    }
    if (!expectedRoot || !observedExpectedRoot || observedExpectedRoot !== expectedRoot) {
      errors.push(`${prefix} expected bridgeEventRootHex must match checkpoint.bridgeEventRootHexes`);
    }
    if (observation.matchingFieldFound !== true) {
      errors.push(`${prefix} must prove a matching 0x0401 field was found`);
    }
    if (
      typeof observation.fieldCount !== 'number' ||
      !Number.isSafeInteger(observation.fieldCount) ||
      observation.fieldCount < 1
    ) {
      errors.push(`${prefix} fieldCount must be a positive safe integer`);
    }
    if (
      observedRoots.length === 0 ||
      observedRoots.some(root => root === undefined) ||
      !observedRoots.includes(expectedRoot)
    ) {
      errors.push(`${prefix} observed bridge event roots must include checkpoint.bridgeEventRootHexes`);
    }
    const headerIds = Array.isArray(observation.headerIds) ? observation.headerIds : [];
    if (headerIds.length === 0 || headerIds.some(headerId => !normalizeHex32Value(headerId))) {
      errors.push(`${prefix} headerIds must include 32-byte Ergo header IDs`);
    }
  }

  const anchorBindings = sourceBindings && isRecord(sourceBindings.anchorObservations)
    ? sourceBindings.anchorObservations
    : undefined;
  if (!anchorBindings) {
    errors.push('freshCheckpoint: sourceBindings.anchorObservations is required');
  } else {
    if (anchorBindings.mode !== 'live-read-only-node') {
      errors.push('freshCheckpoint: sourceBindings.anchorObservations.mode must be live-read-only-node');
    }
    if (anchorBindings.readOnlyNodeClient !== true) {
      errors.push('freshCheckpoint: sourceBindings.anchorObservations.readOnlyNodeClient must be true');
    }
    if (anchorBindings.nodeAuthHeader !== 'not-used') {
      errors.push('freshCheckpoint: sourceBindings.anchorObservations.nodeAuthHeader must be not-used');
    }
    errors.push(...validateReadOnlySourceBindingUrl(
      anchorBindings.ergoNodeUrl,
      'freshCheckpoint: sourceBindings.anchorObservations.ergoNodeUrl',
    ));
    errors.push(...validateStringArrayEntries(
      anchorBindings.operations,
      'freshCheckpoint: sourceBindings.anchorObservations.operations',
    ));
    const operations = stringArrayValues(anchorBindings.operations)
      .map(value => value.toLowerCase());
    if (
      !operations.some(operation => operation.includes('/info')) ||
      !operations.some(operation => operation.includes('extension fields')) ||
      !operations.some(operation => operation.includes('0x0401'))
    ) {
      errors.push('freshCheckpoint: sourceBindings.anchorObservations.operations must cite /info, extension fields, and 0x0401 matching');
    }
    const bindingObservationCount = normalizeNonNegativeSafeInteger(anchorBindings.observationCount);
    if (bindingObservationCount !== observations.length) {
      errors.push('freshCheckpoint: sourceBindings.anchorObservations.observationCount must match checkpoint.anchorObservations');
    }
    if (normalizeNumberArray(anchorBindings.ergoAnchorHeights) !== normalizeNumberArray(ergoAnchorHeights)) {
      errors.push('freshCheckpoint: sourceBindings.anchorObservations.ergoAnchorHeights must match checkpoint.ergoAnchorHeights');
    }
    if (normalizeHex32Array(anchorBindings.bridgeEventRootHexes) !== normalizeHex32Array(bridgeEventRootHexes)) {
      errors.push('freshCheckpoint: sourceBindings.anchorObservations.bridgeEventRootHexes must match checkpoint.bridgeEventRootHexes');
    }
    const observationObservedAtValues = observations
      .filter(isRecord)
      .map(observation => String(observation.observedAt ?? ''));
    if (!stringArraysEqual(anchorBindings.observedAtValues, observationObservedAtValues)) {
      errors.push('freshCheckpoint: sourceBindings.anchorObservations.observedAtValues must match checkpoint.anchorObservations');
    }
    const observationNodeHeights = observations
      .filter(isRecord)
      .map(observation => observation.nodeHeight);
    if (normalizeNumberArray(anchorBindings.nodeHeights) !== normalizeNumberArray(observationNodeHeights)) {
      errors.push('freshCheckpoint: sourceBindings.anchorObservations.nodeHeights must match checkpoint.anchorObservations');
    }
  }

  return errors;
}

function validateFreshCheckpointSingletonCheckpoint(
  checkpoint: Record<string, unknown>,
  sourceBindings: Record<string, unknown> | undefined,
): string[] {
  const singletonCheckpoint = isRecord(checkpoint.singletonCheckpoint)
    ? checkpoint.singletonCheckpoint
    : undefined;
  if (!singletonCheckpoint) {
    return ['freshCheckpoint: checkpoint.singletonCheckpoint is required'];
  }
  const errors: string[] = [];
  const checkpointCurrentHeight = normalizeNonNegativeSafeInteger(checkpoint.currentErgoHeight);
  const singletonNodeHeight = normalizeNonNegativeSafeInteger(singletonCheckpoint.nodeHeight);
  const checkpointExpectedTxId = normalizeHex32Value(checkpoint.expectedTxId);
  const singletonExpectedTxId = normalizeHex32Value(singletonCheckpoint.expectedTxId);
  const singletonDeployedStateHash = normalizeHex32Value(singletonCheckpoint.deployedStateHash);
  const singletons = Array.isArray(singletonCheckpoint.singletons)
    ? singletonCheckpoint.singletons
    : [];
  if (!isIsoUtcTimestamp(String(singletonCheckpoint.observedAt ?? ''))) {
    errors.push('freshCheckpoint: singleton checkpoint observedAt must be an ISO UTC timestamp');
  } else {
    errors.push(...validateObservedAtFreshness(
      String(singletonCheckpoint.observedAt),
      'freshCheckpoint: singleton checkpoint observedAt',
    ));
  }
  if (!singletonExpectedTxId || singletonExpectedTxId !== checkpointExpectedTxId) {
    errors.push('freshCheckpoint: singleton checkpoint Expected transaction ID must match checkpoint.expectedTxId');
  }
  if (!/^[0-9a-f]{64}$/i.test(String(singletonCheckpoint.deployedStateHash ?? ''))) {
    errors.push('freshCheckpoint: singleton checkpoint deployed-state hash must be 32-byte hex');
  }
  if (singletonCheckpoint.expectedTxMempoolAbsent !== true) {
    errors.push('freshCheckpoint: singleton checkpoint must prove Expected transaction ID is absent from mempool');
  }
  if (singletonCheckpoint.expectedTxConfirmedAbsent !== true) {
    errors.push('freshCheckpoint: singleton checkpoint must prove Expected transaction ID is absent from confirmed chain');
  }
  if (!identifiesPositiveTestnetNetwork(String(singletonCheckpoint.nodeNetwork ?? ''))) {
    errors.push('freshCheckpoint: singleton checkpoint node network must positively identify testnet');
  }
  if (singletonNodeHeight === undefined) {
    errors.push('freshCheckpoint: singleton checkpoint nodeHeight must be a non-negative safe integer');
  } else if (checkpointCurrentHeight !== undefined && singletonNodeHeight !== checkpointCurrentHeight) {
    errors.push('freshCheckpoint: singleton checkpoint nodeHeight must match checkpoint.currentErgoHeight');
  }
  const singletonBindings = sourceBindings && isRecord(sourceBindings.singletonCheckpoint)
    ? sourceBindings.singletonCheckpoint
    : undefined;
  if (!singletonBindings) {
    errors.push('freshCheckpoint: sourceBindings.singletonCheckpoint is required');
  } else {
    const mode = singletonBindings.mode;
    if (mode !== 'live-read-only-node' && mode !== 'provided-json') {
      errors.push('freshCheckpoint: sourceBindings.singletonCheckpoint.mode must be live-read-only-node or provided-json');
    }
    if (mode === 'live-read-only-node') {
      if (singletonBindings.readOnlyNodeClient !== true) {
        errors.push('freshCheckpoint: sourceBindings.singletonCheckpoint.readOnlyNodeClient must be true for live-read-only-node');
      }
      if (singletonBindings.nodeAuthHeader !== 'not-used') {
        errors.push('freshCheckpoint: sourceBindings.singletonCheckpoint.nodeAuthHeader must be not-used for live-read-only-node');
      }
      errors.push(...validateReadOnlySourceBindingUrl(
        singletonBindings.ergoNodeUrl,
        'freshCheckpoint: sourceBindings.singletonCheckpoint.ergoNodeUrl',
      ));
      errors.push(...validateStringArrayEntries(
        singletonBindings.operations,
        'freshCheckpoint: sourceBindings.singletonCheckpoint.operations',
      ));
      const operations = stringArrayValues(singletonBindings.operations)
        .map(value => value.toLowerCase());
      if (
        !operations.some(operation => operation.includes('/info')) ||
        !operations.some(operation => operation.includes('singleton boxes')) ||
        !operations.some(operation => operation.includes('mempool') || operation.includes('unconfirmed')) ||
        !operations.some(operation => operation.includes('confirmed transaction'))
      ) {
        errors.push('freshCheckpoint: sourceBindings.singletonCheckpoint.operations must cite /info, singleton boxes, mempool/unconfirmed lookup, and confirmed transaction lookup for live-read-only-node');
      }
    }
    if (mode === 'provided-json') {
      const target = typeof singletonBindings.target === 'string' ? singletonBindings.target : undefined;
      if (!target || !isConcreteEvidenceJsonTarget(target)) {
        errors.push('freshCheckpoint: sourceBindings.singletonCheckpoint.target must cite a concrete non-template singleton checkpoint JSON target when mode is provided-json');
      }
      if (singletonBindings.readOnlyNodeClient !== false) {
        errors.push('freshCheckpoint: sourceBindings.singletonCheckpoint.readOnlyNodeClient must be false for provided-json');
      }
      if (singletonBindings.nodeAuthHeader !== 'not-applicable') {
        errors.push('freshCheckpoint: sourceBindings.singletonCheckpoint.nodeAuthHeader must be not-applicable for provided-json');
      }
      if (Array.isArray(singletonBindings.operations) && singletonBindings.operations.length > 0) {
        errors.push('freshCheckpoint: sourceBindings.singletonCheckpoint.operations must be empty for provided-json');
      }
    }
    if (singletonBindings.observedAt !== singletonCheckpoint.observedAt) {
      errors.push('freshCheckpoint: sourceBindings.singletonCheckpoint.observedAt must match checkpoint.singletonCheckpoint.observedAt');
    }
    if (normalizeNonNegativeSafeInteger(singletonBindings.nodeHeight) !== singletonNodeHeight) {
      errors.push('freshCheckpoint: sourceBindings.singletonCheckpoint.nodeHeight must match checkpoint.singletonCheckpoint.nodeHeight');
    }
    if (normalizeHex32Value(singletonBindings.expectedTxId) !== checkpointExpectedTxId) {
      errors.push('freshCheckpoint: sourceBindings.singletonCheckpoint.expectedTxId must match checkpoint.expectedTxId');
    }
    if (normalizeHex32Value(singletonBindings.deployedStateHash) !== singletonDeployedStateHash) {
      errors.push('freshCheckpoint: sourceBindings.singletonCheckpoint.deployedStateHash must match checkpoint.singletonCheckpoint.deployedStateHash');
    }
    if (normalizeNonNegativeSafeInteger(singletonBindings.singletonCount) !== singletons.length) {
      errors.push('freshCheckpoint: sourceBindings.singletonCheckpoint.singletonCount must match checkpoint.singletonCheckpoint.singletons');
    }
  }
  if (singletons.length === 0) {
    errors.push('freshCheckpoint: singleton checkpoint must include singleton observations');
  }
  const seenNftIds = new Set<string>();
  for (const [index, singleton] of singletons.entries()) {
    if (!isRecord(singleton)) {
      errors.push(`freshCheckpoint: singleton checkpoint observation ${index + 1} must be an object`);
      continue;
    }
    const nftId = normalizeHex32Value(singleton.nftId);
    if (!nftId) {
      errors.push(`freshCheckpoint: singleton checkpoint observation ${index + 1} NFT ID must be 32-byte hex`);
    } else if (seenNftIds.has(nftId)) {
      errors.push(`freshCheckpoint: singleton checkpoint observation ${index + 1} NFT ID must be unique`);
    } else {
      seenNftIds.add(nftId);
    }
    const observedBoxId = normalizeHex32Value(singleton.observedBoxId);
    const expectedBoxId = singleton.expectedBoxId === undefined
      ? undefined
      : normalizeHex32Value(singleton.expectedBoxId);
    if (!observedBoxId) {
      errors.push(`freshCheckpoint: singleton checkpoint observation ${index + 1} observed box ID must be 32-byte hex`);
    }
    if (singleton.expectedBoxId !== undefined && !expectedBoxId) {
      errors.push(`freshCheckpoint: singleton checkpoint observation ${index + 1} expected box ID must be 32-byte hex`);
    }
    if (observedBoxId && expectedBoxId && observedBoxId !== expectedBoxId) {
      errors.push(`freshCheckpoint: singleton checkpoint observation ${index + 1} observed box ID must match deployed_state`);
    }
    if (singleton.observedCount !== 1) {
      errors.push(`freshCheckpoint: singleton checkpoint observation ${index + 1} count must be exactly 1`);
    }
    if (String(singleton.expectedErgoTreeHex ?? '').toLowerCase() !== String(singleton.observedErgoTreeHex ?? '').toLowerCase()) {
      errors.push(`freshCheckpoint: singleton checkpoint observation ${index + 1} ErgoTree must match deployed_state`);
    }
  }
  return errors;
}

function validateFreshCheckpointBoundary(boundary: Record<string, unknown>): string[] {
  const requiredFalseFields = [
    'lifecyclePassAllowed',
    'broadcastAuthorized',
    'liveSubmitPerformed',
    'confirmationObserved',
    'reconciliationPerformed',
    'gate3ClosureAllowed',
    'productionReadyClaimAllowed',
    'testnetProductionCandidateClaimAllowed',
  ];
  return requiredFalseFields.flatMap(field =>
    boundary[field] === false
      ? []
      : [`freshCheckpoint: boundary.${field} must be false`],
  );
}

function normalizeEvidenceJsonTarget(target: string): string {
  return target.trim().replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function isConcreteEvidenceJsonTarget(target: string): boolean {
  const normalized = normalizeEvidenceJsonTarget(target);
  const name = basename(normalized);
  return (
    name.endsWith('.json') &&
    !hasShellUnsafeTargetContent(target) &&
    !isAbsolute(target) &&
    !/[<>]/.test(normalized) &&
    !normalized.includes('://') &&
    !hasNonConcreteEvidenceJsonTargetSegment(normalized) &&
    normalized !== blockedArtifactTargetLabel &&
    !isSensitiveArtifactTarget(normalized) &&
    !isRuntimeArtifactTarget(normalized)
  );
}

function hasNonConcreteEvidenceJsonTargetSegment(value: string): boolean {
  return (
    /\b(?:not[-_ ]completed|uncompleted)\b/i.test(value) ||
    value
      .split(/[\/]+/)
      .some(segment => isNonConcreteEvidenceJsonTargetSegment(segment))
  );
}

function isNonConcreteEvidenceJsonTargetSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.json$/i, '');
  return (
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example)[-_ ]*evidence(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example|template)(?:[-_.](?:offline|gate|prebroadcast|rehearsal|preflight|window|prep|fresh|checkpoint|source|binding|bindings|target|artifact|json|report|evidence|validation|validate|stage)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:offline|gate|prebroadcast|rehearsal|preflight|window|prep|fresh|checkpoint|source|binding|bindings|target|artifact|json|report|evidence|validation|validate|stage)(?:[-_.](?:sample|example|template)(?:[-_.]|$))/i.test(normalized)
  );
}

function hasShellUnsafeTargetContent(target: string): boolean {
  if (target !== target.trim()) return true;
  return !/^[A-Za-z0-9._/-]+$/.test(target.replace(/\\/g, '/'));
}

function containsForbiddenSourceBindingPayloadValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return containsForbiddenSourceBindingPayloadString(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsForbiddenSourceBindingPayloadValue);
  }
  if (isRecord(value)) {
    return Object.entries(value).some(([key, child]) =>
      isForbiddenSourceBindingPayloadKey(key) ||
      containsForbiddenSourceBindingPayloadValue(child),
    );
  }
  return false;
}

function isForbiddenSourceBindingPayloadKey(key: string): boolean {
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

function containsForbiddenSourceBindingPayloadString(value: string): boolean {
  const normalized = value.toLowerCase().replace(/\\/g, '/');
  return (
    /\b(?:authorization|bearer|api[-_ ]?key|auth[-_ ]?header|secret|password|credential)\b/i.test(value) ||
    /\b(?:runtime|state|database|db)\s*(?:path|file)\s*[:=]/i.test(value) ||
    isSharedSensitiveOrRuntimeArtifactReference(normalized)
  );
}

function isSharedSensitiveOrRuntimeArtifactReference(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(isSharedSensitiveOrRuntimeArtifactInspectionReference);
}

function isSharedSensitiveOrRuntimeArtifactInspectionReference(normalizedTarget: string): boolean {
  return (
    hasEvidenceLocalOnlyInspectionReference(normalizedTarget) ||
    hasArtifactEnvironmentTargetSegment(normalizedTarget) ||
    hasRuntimeDatabaseArtifactTargetSegment(normalizedTarget) ||
    isSensitiveArtifactTarget(normalizedTarget) ||
    isRuntimeArtifactTarget(normalizedTarget)
  );
}

function hasArtifactEnvironmentTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\/\s,;=()]+/)
    .some(segment => isEvidenceEnvironmentFileName(segment.replace(/[),;]+$/g, '')));
}

function hasRuntimeDatabaseArtifactTargetSegment(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\s,;=()]+/)
    .some(segment => isEvidenceRuntimeDatabaseTarget(segment.replace(/[),;]+$/g, '')));
}

function validateReadOnlySourceBindingUrl(value: unknown, label: string): string[] {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [`${label} must cite a concrete read-only http(s) URL`];
  }
  const normalized = value.trim().toLowerCase();
  if (/[<>]/.test(normalized) || /\b(?:template|example|sample|generic|placeholder|todo|tbd)\b/.test(normalized)) {
    return [`${label} must cite a concrete non-template read-only http(s) URL`];
  }
  return validateReadOnlyNodeUrl(value, label);
}

function normalizeFreshCheckpointFingerprint(value: Record<string, unknown>): FreshCheckpointFingerprint | undefined {
  const expectedTxId = normalizeHex32Value(value.expectedTxId);
  const burnTxHashes = normalizeHex32Array(value.burnTxHashes);
  const sidechainBlockHeights = normalizeNumberArray(value.sidechainBlockHeights);
  const sidechainHeaderHashHexes = normalizeHex32Array(value.sidechainHeaderHashHexes);
  const ergoAnchorHeights = normalizeNumberArray(value.ergoAnchorHeights);
  const bridgeEventRootHexes = normalizeHex32Array(value.bridgeEventRootHexes);
  const singletonCheckpoint = isRecord(value.singletonCheckpoint)
    ? value.singletonCheckpoint
    : undefined;
  const deployedStateHash = singletonCheckpoint
    ? normalizeHex32Value(singletonCheckpoint.deployedStateHash)
    : undefined;
  if (
    expectedTxId === undefined ||
    burnTxHashes === undefined ||
    sidechainBlockHeights === undefined ||
    sidechainHeaderHashHexes === undefined ||
    ergoAnchorHeights === undefined ||
    bridgeEventRootHexes === undefined ||
    deployedStateHash === undefined
  ) {
    return undefined;
  }
  return {
    expectedTxId,
    burnTxHashes,
    sidechainBlockHeights,
    sidechainHeaderHashHexes,
    ergoAnchorHeights,
    bridgeEventRootHexes,
    deployedStateHash,
  };
}

function normalizePackageFingerprint(value: unknown): PackageFingerprint | undefined {
  if (!isRecord(value)) return undefined;
  const command = normalizeString(value.command);
  const mode = normalizeString(value.mode);
  const expectedTxId = normalizeHex32Value(value.expectedTxId);
  const burnTxHashes = normalizeHex32Array(value.burnTxHashes);
  const sidechainBlockHeights = normalizeNumberArray(value.sidechainBlockHeights);
  const sidechainHeaderHashHexes = normalizeHex32Array(value.sidechainHeaderHashHexes);
  const ergoAnchorHeights = normalizeNumberArray(value.ergoAnchorHeights);
  const bridgeEventRootHexes = normalizeHex32Array(value.bridgeEventRootHexes);
  const deployedStateHash = normalizeHex32Value(value.deployedStateHash);
  if (
    command === undefined ||
    mode === undefined ||
    expectedTxId === undefined ||
    burnTxHashes === undefined ||
    sidechainBlockHeights === undefined ||
    sidechainHeaderHashHexes === undefined ||
    ergoAnchorHeights === undefined ||
    bridgeEventRootHexes === undefined ||
    deployedStateHash === undefined
  ) {
    return undefined;
  }
  return {
    command,
    mode,
    expectedTxId,
    burnTxHashes,
    sidechainBlockHeights,
    sidechainHeaderHashHexes,
    ergoAnchorHeights,
    bridgeEventRootHexes,
    deployedStateHash,
  };
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().toLowerCase()
    : undefined;
}

function normalizeHex32Value(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : undefined;
}

function normalizeHex32Array(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const normalized = value.map(normalizeHex32Value);
  return normalized.every((item): item is string => item !== undefined)
    ? normalized.join(',')
    : undefined;
}

function normalizeNumberArray(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const normalized = value.map(item => {
    if (!Number.isSafeInteger(item) || item < 0) return undefined;
    return String(item);
  });
  return normalized.every((item): item is string => item !== undefined)
    ? normalized.join(',')
    : undefined;
}

function stringArraysEqual(value: unknown, expected: string[]): boolean {
  if (!Array.isArray(value) || value.length !== expected.length) return false;
  return value.every((item, index) => String(item) === expected[index]);
}

function normalizeNonNegativeSafeInteger(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function validateSafeArtifactPath(stageName: TestnetOfflineRehearsalStageName, target: string): string[] {
  const normalizedTarget = target.toLowerCase().replace(/\\/g, '/');
  const name = basename(normalizedTarget);
  if (isSensitiveArtifactTarget(normalizedTarget)) {
    return [`${stageName}: refusing to read sensitive artifact path ${blockedArtifactTargetLabel}`];
  }
  if (isRuntimeArtifactTarget(normalizedTarget)) {
    return [`${stageName}: refusing to read runtime artifact path ${blockedArtifactTargetLabel}`];
  }
  if (/^file:\/\//i.test(target)) {
    return [`${stageName}: refusing to read local file URL artifact path ${blockedArtifactTargetLabel}`];
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) && !/^[a-z]:[\\/]/i.test(target)) {
    return [`${stageName}: refusing to read URI artifact path ${blockedArtifactTargetLabel}`];
  }
  if (isAbsolute(target)) {
    return [`${stageName}: refusing to read local absolute artifact path ${blockedArtifactTargetLabel}`];
  }
  if (name.length === 0) {
    return [`${stageName}: artifact path is empty`];
  }

  try {
    const bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
    const resolvedTarget = resolve(process.cwd(), target);
    if (!isInsidePath(resolvedTarget, bridgeRoot)) {
      return [`${stageName}: refusing to read artifact path outside the bridge repository`];
    }
    const resolved = realpathSync(resolvedTarget);
    if (!isInsidePath(resolved, bridgeRoot)) {
      return [`${stageName}: refusing to read artifact path outside the bridge repository`];
    }
    const normalizedResolved = resolved.toLowerCase().replace(/\\/g, '/');
    if (isSensitiveArtifactTarget(normalizedResolved)) {
      return [`${stageName}: refusing to read sensitive artifact path ${blockedArtifactTargetLabel}`];
    }
    return isRuntimeArtifactTarget(normalizedResolved)
      ? [`${stageName}: refusing to read runtime artifact path ${blockedArtifactTargetLabel}`]
      : [];
  } catch {
    const bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
    const resolvedTarget = resolve(process.cwd(), target);
    if (!isInsidePath(resolvedTarget, bridgeRoot)) {
      return [`${stageName}: refusing to read artifact path outside the bridge repository`];
    }
    const nearestExistingAncestor = realpathNearestExistingAncestor(resolvedTarget);
    if (!isInsidePath(nearestExistingAncestor, bridgeRoot)) {
      return [`${stageName}: refusing to read artifact path outside the bridge repository`];
    }
    return [];
  }
}

function formatArtifactTargetLabel(target: string): string {
  const normalizedTarget = target.toLowerCase().replace(/\\/g, '/');
  if (isSensitiveArtifactTarget(normalizedTarget) || isRuntimeArtifactTarget(normalizedTarget)) {
    return blockedArtifactTargetLabel;
  }
  if (/^file:\/\//i.test(target)) {
    return blockedArtifactTargetLabel;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) && !/^[a-z]:[\\/]/i.test(target)) {
    return blockedArtifactTargetLabel;
  }
  return isAbsolute(target) ? blockedArtifactTargetLabel : target;
}

function formatResolvedArtifactTargetLabel(target: string): string {
  const label = formatArtifactTargetLabel(target);
  if (label === blockedArtifactTargetLabel) {
    return label;
  }

  try {
    const bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
    const resolvedTarget = resolve(process.cwd(), target);
    if (!isInsidePath(resolvedTarget, bridgeRoot)) {
      return blockedArtifactTargetLabel;
    }
    const resolved = realpathSync(resolvedTarget);
    return isInsidePath(resolved, bridgeRoot) ? label : blockedArtifactTargetLabel;
  } catch {
    try {
      const bridgeRoot = realpathSync(resolve(process.cwd(), '..'));
      const resolvedTarget = resolve(process.cwd(), target);
      if (!isInsidePath(resolvedTarget, bridgeRoot)) {
        return blockedArtifactTargetLabel;
      }
      const nearestExistingAncestor = realpathNearestExistingAncestor(resolvedTarget);
      return isInsidePath(nearestExistingAncestor, bridgeRoot) ? label : blockedArtifactTargetLabel;
    } catch {
      return label;
    }
  }
}

function realpathNearestExistingAncestor(target: string): string {
  let cursor = target;
  while (true) {
    try {
      return realpathSync(cursor);
    } catch {
      const parent = dirname(cursor);
      if (parent === cursor) {
        throw new Error(`No existing ancestor for ${target}`);
      }
      cursor = parent;
    }
  }
}

function sourceForArtifact(artifact: unknown): TestnetOfflineRehearsalGateStage['source'] {
  return typeof artifact === 'string' ? 'text' : 'object';
}

function isSensitiveArtifactTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(isSensitiveArtifactInspectionTarget);
}

function isSensitiveArtifactInspectionTarget(normalizedTarget: string): boolean {
  const name = basename(normalizedTarget);
  return (
    hasArtifactEnvironmentTargetSegment(normalizedTarget) ||
    isEvidenceEnvironmentFileName(name) ||
    isEvidenceSecretOrRuntimeName(normalizedTarget)
  );
}

function isRuntimeArtifactTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(isRuntimeArtifactInspectionTarget);
}

function isRuntimeArtifactInspectionTarget(normalizedTarget: string): boolean {
  return (
    hasRuntimeDatabaseArtifactTargetSegment(normalizedTarget) ||
    blockedRuntimePathFragments.some(blocked => normalizedTarget.includes(blocked)) ||
    isEvidenceRuntimeDatabaseTarget(normalizedTarget)
  );
}

function isInsidePath(path: string, parent: string): boolean {
  const relativePath = relative(parent, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function extractStatus(artifact: unknown, stageName: TestnetOfflineRehearsalStageName): string | undefined {
  if (typeof artifact === 'string') {
    return extractTextStatus(artifact, stageName);
  }
  if (isRecord(artifact) && typeof artifact.status === 'string') {
    return artifact.status;
  }
  return undefined;
}

function extractTextStatus(text: string, stageName: TestnetOfflineRehearsalStageName): string | undefined {
  if (/\bBLOCKED\b/i.test(text)) return 'BLOCKED';
  if (/\bFAIL(?:ED)?\b/i.test(text)) return 'FAIL';
  if (/\bPASS\b/i.test(text)) return 'PASS';
  if (stageName === 'rehearsalPreflight' && /\btestnet rehearsal preflight GO\b/i.test(text)) return 'GO';
  if (stageName === 'windowPrep' && /\btestnet window prep CREATED\b/i.test(text)) return 'CREATED';
  return undefined;
}

function validateNoArtifactErrors(stageName: TestnetOfflineRehearsalStageName, artifact: unknown): string[] {
  if (!isRecord(artifact)) return [];
  if (!('errors' in artifact)) return [];
  const errors = artifact.errors;
  if (!Array.isArray(errors)) {
    return [`${stageName}: artifact errors must be an empty array when present`];
  }
  return errors.length > 0
    ? [`${stageName}: artifact contains ${errors.length} error(s)`]
    : [];
}

function validateGenericArtifactLines(stageName: TestnetOfflineRehearsalStageName, artifact: unknown): string[] {
  if (stageName === 'windowPrep' || stageName === 'freshCheckpoint') return [];
  if (!isRecord(artifact) || !('lines' in artifact)) return [];
  const lines = artifact.lines;
  if (!Array.isArray(lines) || lines.some(line => typeof line !== 'string')) {
    return [`${stageName}: artifact lines must be an array of strings when present`];
  }
  if (lines.some(hasContradictoryValidationFailureMarker)) {
    return [`${stageName}: artifact lines must not include contradictory failure markers`];
  }
  if (lines.some(hasUnresolvedEvidenceIssueMarker)) {
    return [`${stageName}: artifact lines must not include remaining issues`];
  }
  if (lines.some(containsForbiddenSourceBindingPayloadString)) {
    return [`${stageName}: artifact lines must not serialize auth, secret, runtime, state, or database payloads`];
  }
  return [];
}

function validateNoBroadcast(stageName: TestnetOfflineRehearsalStageName, artifact: unknown): string[] {
  return artifactIndicatesBroadcast(artifact)
    ? [`${stageName}: broadcast must be disabled`]
    : [];
}

function validateNoMainnet(stageName: TestnetOfflineRehearsalStageName, artifact: unknown): string[] {
  return artifactIndicatesMainnet(artifact)
    ? [`${stageName}: mainnet is forbidden for offline rehearsal gating`]
    : [];
}

function artifactIndicatesBroadcast(value: unknown): boolean {
  if (typeof value === 'string') {
    return (
      /\bBRIDGE_BROADCAST_ENABLED\s*(?:=|:|is)\s*true\b/i.test(value) ||
      /\bbroadcast\s+enabled\s*(?:=|:|is)?\s*(?:true|yes)\b/i.test(value) ||
      /\bbroadcast\s+(?:approved|allowed|certified|endorsed|recommended|accredited)\b/i.test(value) ||
      /\b(?:certif(?:y|ied|ies)|endorse(?:d|s)?|recommend(?:ed|s)?|accredit(?:ed|s)?)\s+(?:live\s+)?broadcast(?:\s+approval)?\b/i.test(value) ||
      /\blive\s+submit\s+performed\s*(?:=|:|is)?\s*yes\b/i.test(value) ||
      /\bsubmit\s+command\s+attempted\s*(?:=|:|is)?\s*yes\b/i.test(value) ||
      /\bmempool\s+transaction\s+observed\s*(?:=|:|is)?\s*yes\b/i.test(value) ||
      /\blive\s+broadcast\s+approval(?:\s+recorded)?\s*(?:=|:|is)?\s*(?:yes|approved|certified|endorsed|recommended|accredited)\b/i.test(value)
    );
  }
  if (Array.isArray(value)) {
    return value.some(artifactIndicatesBroadcast);
  }
  if (!isRecord(value)) return false;

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey === 'requiresexplicitlivebroadcastapproval' ||
      normalizedKey === 'requiredevidencebeforeuse' ||
      normalizedKey === 'forbiddenbeforeuse'
    ) {
      continue;
    }
    if (
      child === true &&
      (
        normalizedKey.includes('broadcast') ||
        normalizedKey.includes('submitcommandattempted') ||
        normalizedKey.includes('mempooltransactionobserved') ||
        normalizedKey.includes('livebroadcastapprovalrecorded')
      )
    ) {
      return true;
    }
    if (artifactIndicatesBroadcast(child)) return true;
  }
  return false;
}

function artifactIndicatesMainnet(value: unknown): boolean {
  if (typeof value === 'string') {
    return textIndicatesMainnetTarget(value);
  }
  if (Array.isArray(value)) {
    return value.some(artifactIndicatesMainnet);
  }
  if (!isRecord(value)) return false;

  return Object.entries(value).some(([key, child]) => {
    if (typeof child === 'string') {
      return fieldIndicatesMainnetTarget(key, child) || textIndicatesMainnetTarget(child);
    }
    return artifactIndicatesMainnet(child);
  });
}

function textIndicatesMainnetTarget(text: string): boolean {
  return text
    .split(/\r?\n/)
    .some(line => {
      const match = /^\s*-?\s*([^:]+):\s*(.+?)\s*$/.exec(line);
      if (!match) return /\b(?:target|network|environment)\b.{0,40}\bmain[- ]?net\b/i.test(stripNonMainnet(line));
      return fieldIndicatesMainnetTarget(match[1], match[2]);
    });
}

function fieldIndicatesMainnetTarget(key: string, value: string): boolean {
  const normalizedKey = key.toLowerCase();
  if (!/(network|environment|target|chain|scope)/i.test(normalizedKey)) return false;
  return /\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/i.test(stripNonMainnet(value));
}

function identifiesPositiveTestnetNetwork(value: string): boolean {
  return /\btest[- ]?net\b/i.test(value) && !hasForbiddenNetworkWording(value);
}

function identifiesAllowedSidechainNetwork(value: string): boolean {
  if (value.trim().length === 0 || hasForbiddenNetworkWording(value)) return false;
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

function stripNonMainnet(value: string): string {
  return value.replace(/\bnon[- ]?main[- ]?net\b/gi, '');
}

function isIsoUtcTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function validateObservedAtFreshness(observedAt: string, label: string): string[] {
  const observedMs = new Date(observedAt).valueOf();
  const nowMs = Date.now();
  if (observedMs > nowMs) {
    return [`${label} must not be in the future`];
  }
  return nowMs - observedMs <= maxFreshCheckpointAgeMs
    ? []
    : [`${label} must be no older than 15 minutes`];
}

function validateStringArrayEntries(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) return [];
  return value.some(item => typeof item !== 'string')
    ? [`${label} entries must be strings`]
    : [];
}

function stringArrayValues(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function buildReport(
  evaluations: StageEvaluation[],
  artifactEntries: Array<[TestnetOfflineRehearsalStageName, unknown]>,
): TestnetOfflineRehearsalGateReport {
  const stages = evaluations.map(evaluation => evaluation.stage);
  const stageErrors = evaluations.flatMap(evaluation => evaluation.errors);
  const errors = [
    ...stageErrors,
    ...(stageErrors.length === 0 ? validatePackageConsistency(artifactEntries) : []),
  ];
  const status: TestnetOfflineRehearsalGateStatus = errors.length === 0 ? 'PASS' : 'BLOCKED';
  const message = `testnet offline rehearsal gate ${status}${
    status === 'BLOCKED' ? `: ${errors.length} issue(s)` : ''
  }`;

  return {
    status,
    message,
    errors,
    stages,
    sourceBindings: buildSourceBindings(stages),
    lines: buildLines(message, stages, errors),
  };
}

function buildSourceBindings(
  stages: TestnetOfflineRehearsalGateStage[],
): TestnetOfflineRehearsalGateSourceBindings {
  const bindings: TestnetOfflineRehearsalGateSourceBindings = {};
  for (const stage of stages) {
    if (stage.source === 'path' && stage.target) {
      bindings[stage.name] = {
        source: 'path',
        target: stage.target,
      };
    }
  }
  return bindings;
}

function buildLines(
  message: string,
  stages: TestnetOfflineRehearsalGateStage[],
  errors: string[],
): string[] {
  const lines = [
    message,
    '- offline scope: artifact validation only; no broadcast command executed.',
    ...stages.map(stage =>
      `- ${stage.name}: ${stage.status ?? '<missing>'} (${stage.passEquivalent ? 'pass-equivalent' : 'blocked'})${stage.target ? ` target=${stage.target}` : ''}`,
    ),
  ];
  if (errors.length > 0) {
    lines.push('- Remaining issues:');
    lines.push(...errors.map(error => `  - ${error}`));
    lines.push('- Next safe step: fix offline bundle artifacts and keep broadcast disabled.');
  } else {
    lines.push('- Next safe step: proceed only to explicit live rehearsal approval collection; this gate does not authorize broadcast.');
  }
  return lines;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
