import { basename } from 'path';
import { preflightTestnetRehearsal, type TestnetRehearsalPreflightPackage } from './testnet-rehearsal-preflight.js';
import { formatBridgeEventRootCsv } from './bridge-event-root-evidence.js';
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
import { classifyPublicationClaimText } from './publication-claim-boundary.js';
import { LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE } from './legacy-aggregate-settlement-conservation.js';

export type TestnetWindowPrepStatus = 'CREATED' | 'BLOCKED';

export interface TestnetWindowPrepInput {
  prebroadcastTarget: string;
  approvalsPath: string;
  currentErgoHeight: string | number;
  currentSidechainHeight: string | number;
  currentDeployedStateHash: string;
  ergoNodeNetwork: string;
  sidechainNetwork: string;
  broadcastEnabled: boolean;
  now?: Date;
}

export interface TestnetWindowPrepTargetBindings {
  prebroadcast: string;
  approvals: string;
}

export interface TestnetWindowPrepNetworkScope {
  environment: 'testnet';
  ergoNodeNetwork: string;
  sidechainNetwork: string;
  broadcastEnabled: boolean;
}

export interface TestnetWindowPrepHeightBoundary {
  currentErgoHeight: string | number;
  currentSidechainHeight: string | number;
  maxPreflightErgoAnchorHeight: number | undefined;
  maxPreflightSidechainBlockHeight: number | undefined;
  currentDeployedStateHash: string;
  packageDeployedStateHash: string | undefined;
}

export interface TestnetWindowPrepGateBoundary {
  reportAuthorizesBroadcast: boolean;
  broadcastAuthorized: boolean;
  liveSubmitPerformed: boolean;
  confirmationObserved: boolean;
  reconciliationPerformed: boolean;
  gate3ClosureAllowed: boolean;
  productionReadyClaimAllowed: boolean;
  testnetProductionCandidateClaimAllowed: boolean;
}

export interface TestnetWindowPrepReportValidation {
  errors: string[];
}

export interface TestnetWindowPrepReport {
  status: TestnetWindowPrepStatus;
  executionStatus: 'QUARANTINED';
  message: string;
  errors: string[];
  packages: TestnetRehearsalPreflightPackage[];
  targetBindings: TestnetWindowPrepTargetBindings;
  networkScope: TestnetWindowPrepNetworkScope;
  heightBoundary: TestnetWindowPrepHeightBoundary;
  gateBoundary: TestnetWindowPrepGateBoundary;
  nextHandoff: TestnetWindowPrepNextHandoff;
  markdown?: string;
  lines: string[];
}

export interface TestnetWindowPrepNextHandoff {
  label: 'external-fee-profile-activation-prerequisites';
  phase: 'blocked-live-settlement';
  command: string;
  requiresExplicitLiveBroadcastApproval: false;
  broadcastCommand: false;
  reportAuthorizesBroadcast: false;
  requiredEvidenceBeforeUse: string[];
  forbiddenBeforeUse: string[];
}

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
const blockedWindowPrepTargetLabel = '<blocked window-prep target>';

export function prepareTestnetWindowPacket(input: TestnetWindowPrepInput): TestnetWindowPrepReport {
  const preflight = preflightTestnetRehearsal({
    prebroadcastTarget: input.prebroadcastTarget,
    approvalsPath: input.approvalsPath,
    now: input.now,
  });
  const packages = preflight.packages;
  const rawTargetBindings: TestnetWindowPrepTargetBindings = {
    prebroadcast: preflight.targetBindings.prebroadcast,
    approvals: preflight.targetBindings.approvals ?? input.approvalsPath,
  };
  const targetBindings = formatWindowPrepTargetBindings(rawTargetBindings);
  const displayInput: TestnetWindowPrepInput = {
    ...input,
    prebroadcastTarget: targetBindings.prebroadcast,
    approvalsPath: targetBindings.approvals,
  };
  const errors = [
    ...(preflight.status === 'BLOCKED' ? preflight.errors : []),
    ...validateGeneratedWindowPrepTargetBindings(rawTargetBindings),
    ...validateBroadcastDisabled(input.broadcastEnabled),
    ...validateNetworkScope(input.ergoNodeNetwork, input.sidechainNetwork),
    ...validateHeight('Current Ergo height', input.currentErgoHeight),
    ...validateHeight('Current sidechain height', input.currentSidechainHeight),
    ...validateCurrentHeightFloor(
      'Current Ergo height',
      input.currentErgoHeight,
      packages.flatMap(pkg => pkg.ergoAnchorHeights),
      'preflight Ergo anchor height',
    ),
    ...validateCurrentHeightFloor(
      'Current sidechain height',
      input.currentSidechainHeight,
      packages.flatMap(pkg => pkg.sidechainBlockHeights),
      'preflight sidechain block height',
    ),
    ...validateDeploymentStateHash(input.currentDeployedStateHash, packages),
  ];
  const structuredBoundary = buildStructuredBoundary(input, packages, targetBindings);

  if (errors.length > 0 || packages.length === 0) {
    const blockedErrors = packages.length === 0 && errors.length === 0
      ? ['Window preparation: at least one preflight package is required']
      : errors;
    const message = `testnet window prep BLOCKED: ${blockedErrors.length} issue(s)`;
    return {
      status: 'BLOCKED',
      executionStatus: 'QUARANTINED',
      message,
      errors: blockedErrors,
      packages,
      ...structuredBoundary,
      lines: buildLines({
        message,
        prebroadcastTarget: displayInput.prebroadcastTarget,
        approvalsPath: displayInput.approvalsPath,
        packages,
        errors: blockedErrors,
      }),
    };
  }

  const markdown = renderMarkdown(displayInput, packages);
  const message = 'testnet window prep CREATED - execution QUARANTINED';
  return {
    status: 'CREATED',
    executionStatus: 'QUARANTINED',
    message,
    errors: [],
    packages,
    ...structuredBoundary,
    markdown,
    lines: buildLines({
      message,
      prebroadcastTarget: displayInput.prebroadcastTarget,
      approvalsPath: displayInput.approvalsPath,
      packages,
      errors: [],
    }),
  };
}

export function validateTestnetWindowPrepReport(report: unknown): TestnetWindowPrepReportValidation {
  if (!isRecord(report)) {
    return { errors: ['window-prep: structured JSON report is required'] };
  }

  const packages = Array.isArray(report.packages) ? report.packages : undefined;
  const errors = [
    ...(report.schemaVersion === 1 ? [] : ['window-prep: schemaVersion must be 1']),
    ...(report.status === 'CREATED' ? [] : ['window-prep: status must be CREATED']),
    ...(report.executionStatus === 'QUARANTINED' ? [] : ['window-prep: executionStatus must be QUARANTINED']),
    ...(report.message === 'testnet window prep CREATED - execution QUARANTINED'
      ? []
      : ['window-prep: message must be testnet window prep CREATED - execution QUARANTINED']),
    ...validateWindowPrepErrorsField(report.errors),
    ...(packages ? validateWindowPrepPackages(packages) : [
      'window-prep: packages array is required',
      'windowPrep: packages array is required',
    ]),
    ...validateWindowPrepTargetBindings(report.targetBindings),
    ...validateWindowPrepNetworkScope(report.networkScope),
    ...validateWindowPrepHeightBoundary(report.heightBoundary, packages ?? []),
    ...validateWindowPrepGateBoundary(report.gateBoundary),
    ...validateWindowPrepNextHandoff(report.nextHandoff, report.targetBindings),
    ...validateWindowPrepTextEvidence(report),
  ];

  return { errors };
}

function buildStructuredBoundary(
  input: TestnetWindowPrepInput,
  packages: TestnetRehearsalPreflightPackage[],
  targetBindings: TestnetWindowPrepTargetBindings,
): Pick<TestnetWindowPrepReport, 'targetBindings' | 'networkScope' | 'heightBoundary' | 'gateBoundary' | 'nextHandoff'> {
  const currentErgoHeight = parseSafeHeight(input.currentErgoHeight);
  const currentSidechainHeight = parseSafeHeight(input.currentSidechainHeight);
  const packageDeployedStateHash = uniquePackageDeploymentStateHash(packages);
  return {
    targetBindings,
    networkScope: {
      environment: 'testnet',
      ergoNodeNetwork: input.ergoNodeNetwork,
      sidechainNetwork: input.sidechainNetwork,
      broadcastEnabled: input.broadcastEnabled,
    },
    heightBoundary: {
      currentErgoHeight: currentErgoHeight ?? input.currentErgoHeight,
      currentSidechainHeight: currentSidechainHeight ?? input.currentSidechainHeight,
      maxPreflightErgoAnchorHeight: maxHeight(packages.flatMap(pkg => pkg.ergoAnchorHeights)),
      maxPreflightSidechainBlockHeight: maxHeight(packages.flatMap(pkg => pkg.sidechainBlockHeights)),
      currentDeployedStateHash: normalizeHex32(input.currentDeployedStateHash) ?? input.currentDeployedStateHash,
      packageDeployedStateHash,
    },
    gateBoundary: buildClosedGateBoundary(),
    nextHandoff: buildNextHandoff(),
  };
}

function buildNextHandoff(): TestnetWindowPrepNextHandoff {
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

function buildClosedGateBoundary(): TestnetWindowPrepGateBoundary {
  return {
    reportAuthorizesBroadcast: false,
    broadcastAuthorized: false,
    liveSubmitPerformed: false,
    confirmationObserved: false,
    reconciliationPerformed: false,
    gate3ClosureAllowed: false,
    productionReadyClaimAllowed: false,
    testnetProductionCandidateClaimAllowed: false,
  };
}

function validateBroadcastDisabled(broadcastEnabled: boolean): string[] {
  return broadcastEnabled
    ? ['Broadcast policy: BRIDGE_BROADCAST_ENABLED must be false or unset for window preparation']
    : [];
}

function validateNetworkScope(ergoNodeNetwork: string, sidechainNetwork: string): string[] {
  const errors: string[] = [];
  if (!identifiesPositiveTestnetNetwork(ergoNodeNetwork)) {
    errors.push('Network scope: Ergo node network must positively identify testnet');
  }
  if (!identifiesAllowedSidechainNetwork(sidechainNetwork)) {
    errors.push('Network scope: Sidechain network must identify patched-devnet, testnet, or non-mainnet');
  }
  return errors;
}

function validateHeight(label: string, value: string | number): string[] {
  const parsed = parseSafeHeight(value);
  if (parsed !== undefined) return [];
  return /^\d+$/.test(String(value))
    ? [`${label}: must be a safe integer`]
    : [`${label}: must be a non-negative integer`];
}

function validateCurrentHeightFloor(
  label: string,
  currentHeight: string | number,
  packageHeights: number[],
  packageLabel: string,
): string[] {
  const parsed = parseSafeHeight(currentHeight);
  if (parsed === undefined || packageHeights.length === 0) return [];
  const requiredHeight = Math.max(...packageHeights);
  return parsed >= requiredHeight
    ? []
    : [`${label}: ${parsed} must be greater than or equal to ${packageLabel} ${requiredHeight}`];
}

function parseSafeHeight(value: string | number): number | undefined {
  const raw = String(value);
  if (!/^\d+$/.test(raw)) return undefined;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function validateDeploymentStateHash(
  currentDeployedStateHash: string,
  packages: TestnetRehearsalPreflightPackage[],
): string[] {
  const current = normalizeHex32(currentDeployedStateHash);
  if (!current) return ['Deployment state: current deployed_state hash must be 32-byte hex'];

  const packageHashes = [...new Set(packages
    .map(pkg => normalizeHex32(pkg.deployedStateHash ?? ''))
    .filter((hash): hash is string => hash !== undefined))];
  if (packages.length === 0) return [];
  if (packageHashes.length === 0) {
    return ['Deployment state: preflight package must include deployment-state hash for staleness check'];
  }
  if (packageHashes.length > 1) {
    return ['Deployment state: preflight packages must agree on deployment-state hash'];
  }
  if (packageHashes[0] !== current) {
    return [
      `Deployment state: current deployed_state hash ${current} does not match preflight/approval hash ${packageHashes[0]}`,
    ];
  }
  return [];
}

function validateWindowPrepErrorsField(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return ['window-prep: errors array is required'];
  }
  return value.length === 0
    ? []
    : ['window-prep: errors array must be empty'];
}

function validateWindowPrepPackages(packages: unknown[]): string[] {
  if (packages.length === 0) return ['window-prep: packages array must not be empty'];
  return packages.flatMap((pkg, index) => validateWindowPrepPackage(pkg, index));
}

function validateWindowPrepPackage(pkg: unknown, index: number): string[] {
  if (!isRecord(pkg)) return [`window-prep: packages[${index}] must be an object`];
  const errors: string[] = [];
  if (typeof pkg.target === 'string' && hasShellUnsafeTargetContent(pkg.target)) {
    errors.push(`window-prep: packages[${index}].target must not contain whitespace or shell metacharacters`);
  }
  if (!nonEmptyString(pkg.target)) errors.push(`window-prep: packages[${index}].target must be present`);
  if (!nonEmptyString(pkg.command)) errors.push(`window-prep: packages[${index}].command must be present`);
  if (!nonEmptyString(pkg.mode)) errors.push(`window-prep: packages[${index}].mode must be present`);
  if (!normalizeHex32Value(pkg.expectedTxId)) errors.push(`window-prep: packages[${index}].expectedTxId must be 32-byte hex`);
  if (!normalizeHex32Array(pkg.burnTxHashes)) errors.push(`window-prep: packages[${index}].burnTxHashes must be non-empty 32-byte hex array`);
  if (!normalizeNumberArray(pkg.ergoAnchorHeights)) errors.push(`window-prep: packages[${index}].ergoAnchorHeights must be non-empty safe integer array`);
  if (!normalizeNumberArray(pkg.sidechainBlockHeights)) errors.push(`window-prep: packages[${index}].sidechainBlockHeights must be non-empty safe integer array`);
  if (!normalizeHex32Array(pkg.sidechainHeaderHashHexes)) errors.push(`window-prep: packages[${index}].sidechainHeaderHashHexes must be non-empty 32-byte hex array`);
  if (!normalizeHex32Array(pkg.bridgeEventRootHexes)) errors.push(`window-prep: packages[${index}].bridgeEventRootHexes must be non-empty 32-byte hex array`);
  if (!normalizeHex32Value(pkg.deployedStateHash)) errors.push(`window-prep: packages[${index}].deployedStateHash must be 32-byte hex`);
  return errors;
}

function validateWindowPrepTargetBindings(value: unknown): string[] {
  if (!isRecord(value)) {
    return [
      'window-prep: targetBindings.prebroadcast must be present',
      'window-prep: targetBindings.approvals must be present',
    ];
  }
  const errors: string[] = [];
  if (!isSafeTargetBinding(value.prebroadcast)) {
    errors.push('window-prep: targetBindings.prebroadcast must be present');
  }
  if (!isSafeTargetBinding(value.approvals)) {
    errors.push('window-prep: targetBindings.approvals must be present');
  }
  return errors;
}

function formatWindowPrepTargetBindings(
  targetBindings: TestnetWindowPrepTargetBindings,
): TestnetWindowPrepTargetBindings {
  return {
    prebroadcast: formatWindowPrepTargetBinding(targetBindings.prebroadcast),
    approvals: formatWindowPrepTargetBinding(targetBindings.approvals),
  };
}

function formatWindowPrepTargetBinding(target: string): string {
  const trimmedTarget = target.trim();
  if (isBlockedOrPlaceholderTargetLabel(trimmedTarget)) return trimmedTarget;
  return hasShellUnsafeTargetContent(trimmedTarget) ? blockedWindowPrepTargetLabel : trimmedTarget;
}

function validateGeneratedWindowPrepTargetBindings(
  targetBindings: TestnetWindowPrepTargetBindings,
): string[] {
  return [
    ...validateGeneratedWindowPrepTargetBinding('targetBindings.prebroadcast', targetBindings.prebroadcast),
    ...validateGeneratedWindowPrepTargetBinding('targetBindings.approvals', targetBindings.approvals),
  ];
}

function validateGeneratedWindowPrepTargetBinding(label: string, target: string): string[] {
  const trimmedTarget = target.trim();
  if (isBlockedOrPlaceholderTargetLabel(trimmedTarget)) return [];
  return hasShellUnsafeTargetContent(trimmedTarget)
    ? [`Window preparation ${label}: ${blockedWindowPrepTargetLabel} must not contain whitespace or shell metacharacters`]
    : [];
}

function validateWindowPrepNetworkScope(value: unknown): string[] {
  if (!isRecord(value)) {
    return [
      'window-prep: networkScope.environment must be testnet',
      'window-prep: networkScope.broadcastEnabled must be false',
    ];
  }
  const errors: string[] = [];
  const ergoNodeNetwork = typeof value.ergoNodeNetwork === 'string' ? value.ergoNodeNetwork : '';
  const sidechainNetwork = typeof value.sidechainNetwork === 'string' ? value.sidechainNetwork : '';
  if (value.environment !== 'testnet') {
    errors.push('window-prep: networkScope.environment must be testnet');
  }
  if (!identifiesPositiveTestnetNetwork(ergoNodeNetwork)) {
    errors.push('window-prep: networkScope.ergoNodeNetwork must positively identify testnet');
  }
  if (!identifiesAllowedSidechainNetwork(sidechainNetwork)) {
    errors.push('window-prep: networkScope.sidechainNetwork must identify patched-devnet, testnet, or non-mainnet');
  }
  if (value.broadcastEnabled !== false) {
    errors.push('window-prep: networkScope.broadcastEnabled must be false');
  }
  return errors;
}

function validateWindowPrepHeightBoundary(value: unknown, packages: unknown[]): string[] {
  if (!isRecord(value)) {
    return [
      'window-prep: heightBoundary.currentErgoHeight must be a non-negative safe integer',
      'window-prep: heightBoundary.currentSidechainHeight must be a non-negative safe integer',
      'window-prep: heightBoundary.currentDeployedStateHash must match package deployedStateHash',
    ];
  }

  const currentErgoHeight = normalizeNonNegativeSafeInteger(value.currentErgoHeight);
  const currentSidechainHeight = normalizeNonNegativeSafeInteger(value.currentSidechainHeight);
  const maxPreflightErgoAnchorHeight = normalizeNonNegativeSafeInteger(value.maxPreflightErgoAnchorHeight);
  const maxPreflightSidechainBlockHeight = normalizeNonNegativeSafeInteger(value.maxPreflightSidechainBlockHeight);
  const packageErgoAnchorHeight = maxHeight(packages.flatMap(pkg =>
    isRecord(pkg) && Array.isArray(pkg.ergoAnchorHeights) ? pkg.ergoAnchorHeights : [],
  ));
  const packageSidechainBlockHeight = maxHeight(packages.flatMap(pkg =>
    isRecord(pkg) && Array.isArray(pkg.sidechainBlockHeights) ? pkg.sidechainBlockHeights : [],
  ));
  const packageDeployedStateHash = uniquePackageDeploymentStateHash(packages);
  const currentDeployedStateHash = normalizeHex32Value(value.currentDeployedStateHash);
  const boundaryPackageHash = normalizeHex32Value(value.packageDeployedStateHash);
  const errors: string[] = [];

  if (currentErgoHeight === undefined) {
    errors.push('window-prep: heightBoundary.currentErgoHeight must be a non-negative safe integer');
  }
  if (currentSidechainHeight === undefined) {
    errors.push('window-prep: heightBoundary.currentSidechainHeight must be a non-negative safe integer');
  }
  if (maxPreflightErgoAnchorHeight === undefined) {
    errors.push('window-prep: heightBoundary.maxPreflightErgoAnchorHeight must be a non-negative safe integer');
  } else if (packageErgoAnchorHeight === undefined || maxPreflightErgoAnchorHeight !== packageErgoAnchorHeight) {
    errors.push('window-prep: heightBoundary.maxPreflightErgoAnchorHeight must match package Ergo anchor height');
  }
  if (maxPreflightSidechainBlockHeight === undefined) {
    errors.push('window-prep: heightBoundary.maxPreflightSidechainBlockHeight must be a non-negative safe integer');
  } else if (
    packageSidechainBlockHeight === undefined ||
    maxPreflightSidechainBlockHeight !== packageSidechainBlockHeight
  ) {
    errors.push('window-prep: heightBoundary.maxPreflightSidechainBlockHeight must match package sidechain block height');
  }
  if (
    currentErgoHeight !== undefined &&
    maxPreflightErgoAnchorHeight !== undefined &&
    currentErgoHeight < maxPreflightErgoAnchorHeight
  ) {
    errors.push('window-prep: heightBoundary.currentErgoHeight must be greater than or equal to maxPreflightErgoAnchorHeight');
  }
  if (
    currentSidechainHeight !== undefined &&
    maxPreflightSidechainBlockHeight !== undefined &&
    currentSidechainHeight < maxPreflightSidechainBlockHeight
  ) {
    errors.push('window-prep: heightBoundary.currentSidechainHeight must be greater than or equal to maxPreflightSidechainBlockHeight');
  }
  if (!packageDeployedStateHash) {
    errors.push('window-prep: packages must agree on deployedStateHash');
  }
  if (boundaryPackageHash === undefined || boundaryPackageHash !== packageDeployedStateHash) {
    errors.push('window-prep: heightBoundary.packageDeployedStateHash must match package deployedStateHash');
  }
  if (currentDeployedStateHash === undefined || currentDeployedStateHash !== packageDeployedStateHash) {
    errors.push('window-prep: heightBoundary.currentDeployedStateHash must match package deployedStateHash');
  }
  return errors;
}

function validateWindowPrepGateBoundary(value: unknown): string[] {
  const requiredFalseFields: Array<keyof TestnetWindowPrepGateBoundary> = [
    'reportAuthorizesBroadcast',
    'broadcastAuthorized',
    'liveSubmitPerformed',
    'confirmationObserved',
    'reconciliationPerformed',
    'gate3ClosureAllowed',
    'productionReadyClaimAllowed',
    'testnetProductionCandidateClaimAllowed',
  ];
  if (!isRecord(value)) {
    return requiredFalseFields.map(field => `window-prep: gateBoundary.${field} must be false`);
  }
  return requiredFalseFields.flatMap(field =>
    value[field] === false
      ? []
      : [`window-prep: gateBoundary.${field} must be false`],
  );
}

function validateWindowPrepNextHandoff(value: unknown, _targetBindings: unknown): string[] {
  if (!isRecord(value)) {
    return ['window-prep: nextHandoff must be present'];
  }
  const errors: string[] = [];
  const expected = buildNextHandoff();
  if (value.label !== expected.label) {
    errors.push('window-prep: nextHandoff.label must be external-fee-profile-activation-prerequisites');
  }
  if (value.phase !== expected.phase) {
    errors.push('window-prep: nextHandoff.phase must be blocked-live-settlement');
  }
  if (value.command !== expected.command) {
    errors.push('window-prep: nextHandoff.command must be the standard legacy V1 quarantine status');
  }
  if (value.requiresExplicitLiveBroadcastApproval !== false) {
    errors.push('window-prep: nextHandoff must not require live broadcast approval');
  }
  if (value.broadcastCommand !== false) {
    errors.push('window-prep: nextHandoff.broadcastCommand must be false');
  }
  if (value.reportAuthorizesBroadcast !== false) {
    errors.push('window-prep: nextHandoff.reportAuthorizesBroadcast must be false');
  }
  if ('targetBindings' in value) {
    errors.push('window-prep: nextHandoff must not carry live execution target bindings');
  }
  if (!sameStringArray(value.requiredEvidenceBeforeUse, replacementProfileRequiredEvidence)) {
    errors.push('window-prep: nextHandoff.requiredEvidenceBeforeUse must list replacement-profile activation evidence');
  }
  if (!sameStringArray(value.forbiddenBeforeUse, legacyV1ForbiddenBeforeUse)) {
    errors.push('window-prep: nextHandoff.forbiddenBeforeUse must quarantine legacy V1 execution and claim escalation');
  }
  return errors;
}

function sameStringArray(value: unknown, expected: string[]): boolean {
  return Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index]);
}

function validateWindowPrepTextEvidence(report: Record<string, unknown>): string[] {
  const errors: string[] = [];
  if (!Array.isArray(report.lines) || !report.lines.every(line => typeof line === 'string')) {
    errors.push('window-prep: lines array is required');
  } else if (report.lines.some(hasContradictoryValidationFailureMarker)) {
    errors.push('window-prep: lines must not include contradictory failure markers');
  } else if (report.lines.some(hasUnresolvedEvidenceIssueMarker)) {
    errors.push('window-prep: lines must not include remaining issues');
  } else if (!report.lines.join('\n').toLowerCase().includes('does not authorize broadcast')) {
    errors.push('window-prep: lines must state that the report does not authorize broadcast');
  }
  if (typeof report.markdown !== 'string' || report.markdown.trim().length === 0) {
    errors.push('window-prep: markdown must be present');
  } else if (hasContradictoryValidationFailureMarker(report.markdown)) {
    errors.push('window-prep: markdown must not include contradictory failure markers');
  } else if (hasUnresolvedEvidenceIssueMarker(report.markdown)) {
    errors.push('window-prep: markdown must not include remaining issues');
  } else if (!report.markdown.toLowerCase().includes('does not authorize broadcast')) {
    errors.push('window-prep: markdown must state that the report does not authorize broadcast');
  }
  return errors;
}

function hasContradictoryValidationFailureMarker(segment: string): boolean {
  const normalized = normalizeEvidenceMarkerText(segment.replaceAll(
    legacyV1SubmissionStatus,
    'legacy V1 submission quarantine active',
  ));
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

function normalizeHex32(value: string): string | undefined {
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : undefined;
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

function renderMarkdown(input: TestnetWindowPrepInput, packages: TestnetRehearsalPreflightPackage[]): string {
  const date = (input.now ?? new Date()).toISOString().slice(0, 10);
  const selected = packages[0];
  return `# Testnet Live Window Preparation Packet

This packet was generated from matched pre-broadcast and approval evidence. It is read-only preparation evidence, does not authorize broadcast, does not submit transactions, and cannot close Gate 3 by itself.

## Window Scope

- Date: ${date}
- Environment: testnet
- Ergo node network: ${input.ergoNodeNetwork}
- Sidechain network: ${input.sidechainNetwork}
- Broadcast enabled: no
- Prebroadcast target: ${input.prebroadcastTarget}
- Approvals target: ${input.approvalsPath}
- Current Ergo height: ${input.currentErgoHeight}
- Current sidechain height: ${input.currentSidechainHeight}
- Max preflight Ergo anchor height: ${formatMaxHeight(packages.flatMap(pkg => pkg.ergoAnchorHeights))}
- Max preflight sidechain block height: ${formatMaxHeight(packages.flatMap(pkg => pkg.sidechainBlockHeights))}
- Current deployment-state hash: ${normalizeHex32(input.currentDeployedStateHash) ?? '<invalid>'}

## Prepared Settlement Package

- Package count: ${packages.length}
${packages.map(formatPackageMarkdown).join('\n')}
- Expected transaction ID: ${selected.expectedTxId}
- Ordered burn set: ${selected.burnTxHashes.join(',')}
- Preflight deployment-state hash: ${selected.deployedStateHash}

## Gate Boundary

- Gate 3 closure allowed: no
- Production-ready claim allowed: no
- Testnet production-candidate claim allowed: no
- Live submit performed: no
- Confirmation observed: no
- Reconciliation performed: no
- Legacy V1 settlement execution: quarantined.
- Next safe step: satisfy the separately versioned external-fee profile activation prerequisites before regenerating any live execution packet.

## Operator Handoff

- Next command label: external-fee-profile-activation-prerequisites
- Next command: ${buildNextHandoff().command}
- Requires explicit live broadcast approval: no; approval cannot override this quarantine
- Broadcast command: no
- Report authorizes broadcast: no
- Required evidence before use: ${replacementProfileRequiredEvidence.join('; ')}
- Forbidden before use: ${legacyV1ForbiddenBeforeUse.join('; ')}
`;
}

function formatPackageMarkdown(pkg: TestnetRehearsalPreflightPackage, index: number): string {
  return [
    `- Package ${index + 1} target: ${pkg.target}`,
    `- Package ${index + 1} command: ${pkg.command}`,
    `- Package ${index + 1} mode: ${pkg.mode}`,
    `- Package ${index + 1} Expected transaction ID: ${pkg.expectedTxId}`,
    `- Package ${index + 1} burnTxHashes: ${pkg.burnTxHashes.join(',')}`,
    `- Package ${index + 1} ergoAnchorHeights: ${pkg.ergoAnchorHeights.join(',')}`,
    `- Package ${index + 1} sidechainBlockHeights: ${pkg.sidechainBlockHeights.join(',')}`,
    `- Package ${index + 1} sidechainHeaderHashHexes: ${pkg.sidechainHeaderHashHexes.join(',')}`,
    `- Package ${index + 1} bridgeEventRoots: ${formatBridgeEventRootCsv(pkg.bridgeEventRootHexes)}`,
    `- Package ${index + 1} deployedStateHash: ${pkg.deployedStateHash}`,
  ].join('\n');
}

function formatMaxHeight(heights: number[]): string {
  return heights.length > 0 ? String(Math.max(...heights)) : '<missing>';
}

function maxHeight(heights: unknown[]): number | undefined {
  const normalized = heights.filter((height): height is number =>
    typeof height === 'number' && Number.isSafeInteger(height) && height >= 0,
  );
  return normalized.length > 0 ? Math.max(...normalized) : undefined;
}

function uniquePackageDeploymentStateHash(packages: unknown[]): string | undefined {
  const hashes = [...new Set(packages
    .map(pkg => isRecord(pkg) ? normalizeHex32Value(pkg.deployedStateHash) : undefined)
    .filter((hash): hash is string => hash !== undefined))];
  return hashes.length === 1 ? hashes[0] : undefined;
}

function normalizeHex32Value(value: unknown): string | undefined {
  return typeof value === 'string' ? normalizeHex32(value) : undefined;
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
  const normalized = value.map(normalizeNonNegativeSafeInteger);
  return normalized.every((item): item is number => item !== undefined)
    ? normalized
    : undefined;
}

function normalizeNonNegativeSafeInteger(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function isSafeTargetBinding(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().replace(/\\/g, '/').toLowerCase();
  return (
    normalized.length > 0 &&
    !hasShellUnsafeTargetContent(normalized) &&
    !normalized.includes('://') &&
    !normalized.includes('<') &&
    !normalized.includes('>') &&
    !isLocalOnlyTargetBinding(normalized) &&
    !isSharedSensitiveTargetBinding(normalized) &&
    !hasClaimEscalatingWindowPrepTarget(normalized) &&
    !hasNonConcreteWindowPrepTarget(normalized)
  );
}

function hasClaimEscalatingWindowPrepTarget(target: string): boolean {
  const normalizedTarget = target.split('#')[0].split('?')[0].replace(/[),;]+$/g, '').toLowerCase();
  const claim = classifyPublicationClaimText(normalizedTarget);
  return claim.hasProductionClaim;
}

function hasNonConcreteWindowPrepTarget(normalizedTarget: string): boolean {
  return normalizedTarget
    .split(/[\\/]+/)
    .some(segment => isNonConcreteWindowPrepTargetSegment(segment));
}

function isNonConcreteWindowPrepTargetSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  return (
    /[<>]/.test(segment) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example)[-_ ]*evidence(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:sample|example|template)(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|validator|prebroadcast|approval|approvals|window|prep|testnet)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:proof|evidence|artifact|target|log|run|check|update|validator|prebroadcast|approval|approvals|window|prep|testnet)(?:[-_.](?:sample|example|template)(?:[-_.]|$))/i.test(normalized)
  );
}

function isBlockedOrPlaceholderTargetLabel(target: string): boolean {
  return /^<[^<>]+>$/.test(target);
}

function hasShellUnsafeTargetContent(target: string): boolean {
  if (target !== target.trim()) return true;
  const normalized = target.replace(/\\/g, '/');
  if (/^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._/-]+$/i.test(normalized)) {
    return false;
  }
  return !/^[A-Za-z0-9._/-]+$/.test(normalized);
}

function isLocalOnlyTargetBinding(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(isLocalOnlyTargetBindingInspectionTarget);
}

function isLocalOnlyTargetBindingInspectionTarget(target: string): boolean {
  const normalizedTarget = target.replace(/\\/g, '/');
  return (
    hasEvidenceLocalOnlyInspectionReference(normalizedTarget) ||
    /^file:\/\//.test(normalizedTarget) ||
    /^[a-z]:\//.test(normalizedTarget) ||
    /^\/\/[^/]/.test(normalizedTarget) ||
    /^\/(?:users?|home|tmp|var|private|mnt|volumes|etc)(?:\/|$)/.test(normalizedTarget)
  );
}

function isSharedSensitiveTargetBinding(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(isSharedSensitiveTargetBindingInspectionTarget);
}

function isSharedSensitiveTargetBindingInspectionTarget(normalizedTarget: string): boolean {
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

function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function buildLines(input: {
  message: string;
  prebroadcastTarget: string;
  approvalsPath: string;
  packages: TestnetRehearsalPreflightPackage[];
  errors: string[];
}): string[] {
  const lines = [
    input.message,
    `- prebroadcast target: ${input.prebroadcastTarget}`,
    `- approvals target: ${input.approvalsPath}`,
    `- package count: ${input.packages.length}`,
    ...input.packages.map(pkg =>
      `- package mode=${pkg.mode} expectedTxId=${pkg.expectedTxId} ` +
      `burnTxHashes=${pkg.burnTxHashes.join(',')} ` +
      `ergoAnchorHeights=${pkg.ergoAnchorHeights.join(',')} ` +
      `sidechainBlockHeights=${pkg.sidechainBlockHeights.join(',')} ` +
      `sidechainHeaderHashHexes=${pkg.sidechainHeaderHashHexes.join(',')} ` +
      `deployedStateHash=${pkg.deployedStateHash}`,
    ),
    '- scope: read-only testnet live-window preparation; this report does not authorize broadcast.',
    `- next handoff: ${buildNextHandoff().command}`,
    '- next handoff requires a reviewed external-fee profile, exact target-node acceptance, funds-authority transition, legacy retirement, and replay-lineage evidence; broadcast command: no.',
  ];
  if (input.errors.length > 0) {
    lines.push('- Remaining issues:');
    lines.push(...input.errors.map(error => `  - ${error}`));
    lines.push('- Next safe step: fix blocked items and keep broadcast disabled.');
  } else {
    lines.push('- Next safe step: activate and review the replacement external-fee profile before regenerating any live execution packet.');
  }
  return lines;
}
