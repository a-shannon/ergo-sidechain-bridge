import { createHash } from 'crypto';
import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import { isIsoCalendarDate } from './evidence-date.js';

export const LEGACY_AGGREGATE_SETTLEMENT_PROFILE_ID = 'legacy-aggregate-v1' as const;
export const AUTHENTICATED_EXTERNAL_FEE_SETTLEMENT_PROFILE_ID =
  'authenticated-external-fee-v1' as const;

export const HISTORICAL_SETTLEMENT_EVIDENCE_PURPOSE = 'historical-diagnostics' as const;
export const GATE3_SETTLEMENT_EVIDENCE_PURPOSE = 'gate3-lifecycle-closure' as const;

export interface Gate3SettlementProfileBinding {
  settlementProfileId: string;
  profileActivationStatus: string;
  evidencePurpose: string;
  activationEvidenceTarget: string;
}

export interface SettlementProfileActivationEvidenceTargets {
  targetNodeAcceptance: string;
  fundsAuthorityTransition: string;
  legacyRouteRetirement: string;
  crossProfileReplayLineage: string;
}

export const SETTLEMENT_PROFILE_AUTHORITY_EVIDENCE_ROLES = [
  'targetNodeAcceptance',
  'fundsAuthorityTransition',
  'legacyRouteRetirement',
  'crossProfileReplayLineage',
] as const;

export type SettlementProfileAuthorityEvidenceRole =
  typeof SETTLEMENT_PROFILE_AUTHORITY_EVIDENCE_ROLES[number];

export type SettlementProfileActivationEvidenceIds = Record<
  SettlementProfileAuthorityEvidenceRole,
  string
>;

export interface SettlementProfileAuthorityEvidenceReport {
  schemaVersion: number;
  status: string;
  role: string;
  producerId: string;
  generatedAt: string;
  environment: string;
  ergoNodeNetwork: string;
  sidechainNetwork: string;
  gitCommit: string;
  settlementProfileId: string;
  evidenceTarget: string;
  evidenceId: string;
  bindings: Record<string, string | number>;
  decision: Record<string, boolean>;
}

export type SettlementProfileAuthorityEvidenceReports = Record<
  SettlementProfileAuthorityEvidenceRole,
  SettlementProfileAuthorityEvidenceReport
>;

export interface SettlementProfileActivationAuthorityBoundary {
  targetNodeAccepted: boolean;
  fundsAuthorityTransitionComplete: boolean;
  legacyFundsRoutesRetired: boolean;
  crossProfileReplayLineagePreserved: boolean;
  gate3ClosedByThisEvidence: boolean;
  productionReadyClaimAllowed: boolean;
  mainnetProductionClaimAllowed: boolean;
}

export interface SettlementProfileActivationReviewer {
  decision: string;
  reviewer: string;
  date: string;
}

export interface SettlementProfileActivationEvidenceReport {
  schemaVersion: number;
  status: string;
  generatedAt: string;
  environment: string;
  ergoNodeNetwork: string;
  sidechainNetwork: string;
  gitCommit: string;
  activationId: string;
  settlementProfile: Gate3SettlementProfileBinding;
  evidenceTargets: SettlementProfileActivationEvidenceTargets;
  evidenceIds: SettlementProfileActivationEvidenceIds;
  authorityBoundary: SettlementProfileActivationAuthorityBoundary;
  reviewer: SettlementProfileActivationReviewer;
}

export interface SettlementProfileActivationEvidenceValidation {
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  settlementProfile?: Gate3SettlementProfileBinding;
  environment?: string;
  ergoNodeNetwork?: string;
  sidechainNetwork?: string;
  gitCommit?: string;
  activationId?: string;
  evidenceTargets?: SettlementProfileActivationEvidenceTargets;
  evidenceIds?: SettlementProfileActivationEvidenceIds;
  authorityEvidence?: SettlementProfileAuthorityEvidenceReports;
  authorityBoundary?: SettlementProfileActivationAuthorityBoundary;
  reviewer?: SettlementProfileActivationReviewer;
}

const historicalLegacyBinding: Gate3SettlementProfileBinding = Object.freeze({
  settlementProfileId: LEGACY_AGGREGATE_SETTLEMENT_PROFILE_ID,
  profileActivationStatus: 'QUARANTINED',
  evidencePurpose: HISTORICAL_SETTLEMENT_EVIDENCE_PURPOSE,
  activationEvidenceTarget: 'none',
});

const requiredAuthorityBoundary: SettlementProfileActivationAuthorityBoundary = Object.freeze({
  targetNodeAccepted: true,
  fundsAuthorityTransitionComplete: true,
  legacyFundsRoutesRetired: true,
  crossProfileReplayLineagePreserved: true,
  gate3ClosedByThisEvidence: false,
  productionReadyClaimAllowed: false,
  mainnetProductionClaimAllowed: false,
});

const forbiddenEvidenceTargetName = /(?:^|[-_.\/])(template|example|sample|generic|placeholder|todo|tbd)(?:[-_.\/]|$)/i;

type AuthorityEvidenceBindingRule =
  | { kind: 'hex'; bytes: number }
  | { kind: 'identity' }
  | { kind: 'exact'; value: string }
  | { kind: 'integer'; minimum: number };

const authorityEvidenceProfiles: Record<SettlementProfileAuthorityEvidenceRole, {
  producerId: string;
  bindings: Record<string, AuthorityEvidenceBindingRule>;
  decision: Record<string, boolean>;
}> = Object.freeze({
  targetNodeAcceptance: {
    producerId: 'e2s.gate3-target-node-acceptance.v1',
    bindings: {
      unsignedTransactionId: { kind: 'hex', bytes: 32 },
      nodeResponseDigest: { kind: 'hex', bytes: 32 },
      nodeVersion: { kind: 'identity' },
      acceptanceEndpoint: { kind: 'exact', value: '/transactions/check' },
      acceptedAtHeight: { kind: 'integer', minimum: 0 },
      contractProfileDigest: { kind: 'hex', bytes: 32 },
    },
    decision: {
      exactProfileTransactionAccepted: true,
      targetNodeAccepted: true,
      noSubmissionPerformed: true,
      fundsAuthorityGrantedByThisEvidence: false,
    },
  },
  fundsAuthorityTransition: {
    producerId: 'e2s.gate3-funds-authority-transition.v1',
    bindings: {
      activationTransactionId: { kind: 'hex', bytes: 32 },
      activationBlockId: { kind: 'hex', bytes: 32 },
      activatedContractProfileDigest: { kind: 'hex', bytes: 32 },
      mintAuthorityIdentityDigest: { kind: 'hex', bytes: 32 },
      payoutAuthorityIdentityDigest: { kind: 'hex', bytes: 32 },
    },
    decision: {
      mintAuthorityTransitionComplete: true,
      payoutAuthorityTransitionComplete: true,
      legacyMintAuthorityDisabled: true,
      legacyPayoutAuthorityDisabled: true,
    },
  },
  legacyRouteRetirement: {
    producerId: 'e2s.gate3-legacy-route-retirement.v1',
    bindings: {
      retirementRegistryDigest: { kind: 'hex', bytes: 32 },
      legacyRouteInventoryDigest: { kind: 'hex', bytes: 32 },
      replacementProfileDigest: { kind: 'hex', bytes: 32 },
      retiredRouteCount: { kind: 'integer', minimum: 0 },
    },
    decision: {
      daemonRouteRetired: true,
      cliRouteRetired: true,
      programmaticRouteRetired: true,
      legacyOnChainFundsRouteRetired: true,
    },
  },
  crossProfileReplayLineage: {
    producerId: 'e2s.gate3-cross-profile-replay-lineage.v1',
    bindings: {
      sourceReplayDigest: { kind: 'hex', bytes: 33 },
      activatedReplayDigest: { kind: 'hex', bytes: 33 },
      lineageManifestDigest: { kind: 'hex', bytes: 32 },
      replacementProfileDigest: { kind: 'hex', bytes: 32 },
      coveredBurnIdCount: { kind: 'integer', minimum: 0 },
    },
    decision: {
      allFundedLegacyProfilesCovered: true,
      replaySetImportedOrFrozen: true,
      oldReplayRoutesFrozen: true,
      duplicateAcrossProfilesRejected: true,
    },
  },
});

export function legacyGate3SettlementProfileBinding(): Gate3SettlementProfileBinding {
  return { ...historicalLegacyBinding };
}

export function validateSettlementProfileBinding(
  value: unknown,
  prefix = 'settlementProfile',
): string[] {
  if (!isRecord(value)) return [`${prefix} must be an object`];

  const binding = toSettlementProfileBinding(value);
  const errors: string[] = [];
  for (const field of [
    'settlementProfileId',
    'profileActivationStatus',
    'evidencePurpose',
    'activationEvidenceTarget',
  ] as const) {
    if (binding[field].trim().length === 0) errors.push(`${prefix}.${field} is required`);
  }

  if (binding.settlementProfileId === LEGACY_AGGREGATE_SETTLEMENT_PROFILE_ID) {
    if (binding.profileActivationStatus !== 'QUARANTINED') {
      errors.push(`${prefix}.profileActivationStatus must be QUARANTINED for legacy-aggregate-v1`);
    }
    if (binding.evidencePurpose !== HISTORICAL_SETTLEMENT_EVIDENCE_PURPOSE) {
      errors.push(`${prefix}.evidencePurpose must be historical-diagnostics for legacy-aggregate-v1`);
    }
    if (binding.activationEvidenceTarget !== 'none') {
      errors.push(`${prefix}.activationEvidenceTarget must be none for legacy-aggregate-v1`);
    }
    return errors;
  }

  if (binding.settlementProfileId !== AUTHENTICATED_EXTERNAL_FEE_SETTLEMENT_PROFILE_ID) {
    errors.push(`${prefix}.settlementProfileId is not a registered Gate 3 settlement profile`);
    return errors;
  }
  if (binding.profileActivationStatus !== 'ACTIVATED') {
    errors.push(`${prefix}.profileActivationStatus must be ACTIVATED for Gate 3 lifecycle closure`);
  }
  if (binding.evidencePurpose !== GATE3_SETTLEMENT_EVIDENCE_PURPOSE) {
    errors.push(`${prefix}.evidencePurpose must be gate3-lifecycle-closure for an activated profile`);
  }
  if (!isConcreteCompletedJsonEvidenceTarget(binding.activationEvidenceTarget)) {
    errors.push(`${prefix}.activationEvidenceTarget must cite concrete completed activation evidence`);
  }
  return errors;
}

export function validateGate3ClosureProfileBinding(
  value: unknown,
  activationValidationTarget: string | undefined,
  prefix = 'settlementProfile',
): string[] {
  const errors = validateSettlementProfileBinding(value, prefix);
  if (!isRecord(value)) return errors;

  const binding = toSettlementProfileBinding(value);
  if (
    binding.settlementProfileId !== AUTHENTICATED_EXTERNAL_FEE_SETTLEMENT_PROFILE_ID ||
    binding.profileActivationStatus !== 'ACTIVATED' ||
    binding.evidencePurpose !== GATE3_SETTLEMENT_EVIDENCE_PURPOSE
  ) {
    errors.push(
      `${prefix} must bind authenticated-external-fee-v1, ACTIVATED, and gate3-lifecycle-closure`,
    );
  }
  if (
    typeof activationValidationTarget !== 'string' ||
    normalizeEvidenceTarget(binding.activationEvidenceTarget) !==
      normalizeEvidenceTarget(activationValidationTarget)
  ) {
    errors.push(`${prefix}.activationEvidenceTarget must match the validated activation evidence target`);
  }
  return unique(errors);
}

export function validateSettlementProfileActivationEvidence(
  value: unknown,
  authorityEvidenceInput?: unknown,
): SettlementProfileActivationEvidenceValidation {
  if (!isRecord(value)) {
    return {
      status: 'BLOCKED',
      errors: ['settlement profile activation evidence must be an object'],
    };
  }

  const errors: string[] = [];
  if (!hasExactKeys(value, [
    'schemaVersion',
    'status',
    'generatedAt',
    'environment',
    'ergoNodeNetwork',
    'sidechainNetwork',
    'gitCommit',
    'activationId',
    'settlementProfile',
    'evidenceTargets',
    'evidenceIds',
    'authorityBoundary',
    'reviewer',
  ])) {
    errors.push('settlement profile activation evidence must expose exactly the registered fields');
  }
  if (value.schemaVersion !== 1) errors.push('settlement profile activation evidence schemaVersion must be 1');
  if (value.status !== 'PASS') errors.push('settlement profile activation evidence status must be PASS');

  const generatedAt = stringValue(value.generatedAt);
  const environment = stringValue(value.environment);
  const ergoNodeNetwork = stringValue(value.ergoNodeNetwork);
  const sidechainNetwork = stringValue(value.sidechainNetwork);
  const gitCommit = stringValue(value.gitCommit);
  const activationId = stringValue(value.activationId).toLowerCase();
  const settlementProfile = isRecord(value.settlementProfile)
    ? toSettlementProfileBinding(value.settlementProfile)
    : undefined;
  if (
    isRecord(value.settlementProfile) &&
    !hasExactKeys(value.settlementProfile, [
      'settlementProfileId',
      'profileActivationStatus',
      'evidencePurpose',
      'activationEvidenceTarget',
    ])
  ) {
    errors.push('settlement profile activation evidence settlementProfile must expose exactly the registered fields');
  }
  if (!isIsoUtcTimestamp(generatedAt)) {
    errors.push('settlement profile activation evidence generatedAt must be an ISO UTC timestamp');
  }
  if (environment !== 'local devnet' && environment !== 'testnet') {
    errors.push('settlement profile activation evidence environment must be local devnet or testnet');
  }
  if (isPlaceholderIdentity(ergoNodeNetwork)) {
    errors.push('settlement profile activation evidence ergoNodeNetwork must identify a concrete network');
  }
  if (isPlaceholderIdentity(sidechainNetwork)) {
    errors.push('settlement profile activation evidence sidechainNetwork must identify a concrete network');
  }
  if (!/^[a-f0-9]{7,40}$/i.test(gitCommit)) {
    errors.push('settlement profile activation evidence gitCommit must be a 7-40 character hex commit');
  }

  errors.push(...validateGate3ClosureProfileBinding(
    value.settlementProfile,
    settlementProfile
      ? settlementProfile.activationEvidenceTarget
      : undefined,
    'settlement profile activation evidence settlementProfile',
  ));

  const evidenceTargets = parseEvidenceTargets(value.evidenceTargets);
  if (!evidenceTargets) {
    errors.push('settlement profile activation evidence evidenceTargets must expose all authority targets');
  } else {
    for (const [field, target] of Object.entries(evidenceTargets)) {
      if (!isConcreteCompletedJsonEvidenceTarget(target)) {
        errors.push(`settlement profile activation evidence evidenceTargets.${field} must cite concrete completed evidence`);
      }
    }
    if (new Set(Object.values(evidenceTargets).map(normalizeEvidenceTarget)).size !== 4) {
      errors.push('settlement profile activation evidence authority targets must be distinct');
    }
    const activationEvidenceTarget = isRecord(value.settlementProfile)
      ? normalizeEvidenceTarget(stringValue(value.settlementProfile.activationEvidenceTarget))
      : '';
    if (
      activationEvidenceTarget.length > 0 &&
      Object.values(evidenceTargets)
        .map(normalizeEvidenceTarget)
        .includes(activationEvidenceTarget)
    ) {
      errors.push('settlement profile activation evidence authority targets must be distinct from the activation report target');
    }
  }

  const evidenceIds = parseEvidenceIds(value.evidenceIds);
  if (!evidenceIds) {
    errors.push('settlement profile activation evidence evidenceIds must expose four 32-byte authority evidence IDs');
  }

  const authorityEvidenceValidation = validateAuthorityEvidenceReports(
    authorityEvidenceInput,
    {
      generatedAt,
      environment,
      ergoNodeNetwork,
      sidechainNetwork,
      gitCommit,
      settlementProfileId: settlementProfile?.settlementProfileId ?? '',
      evidenceTargets,
      evidenceIds,
    },
  );
  errors.push(...authorityEvidenceValidation.errors);

  const authorityBoundary = parseAuthorityBoundary(value.authorityBoundary);
  if (!authorityBoundary) {
    errors.push('settlement profile activation evidence authorityBoundary must expose every required boolean');
  } else {
    for (const [field, expected] of Object.entries(requiredAuthorityBoundary)) {
      if (authorityBoundary[field as keyof SettlementProfileActivationAuthorityBoundary] !== expected) {
        errors.push(`settlement profile activation evidence authorityBoundary.${field} must be ${expected}`);
      }
    }
  }

  const reviewer = parseReviewer(value.reviewer);
  if (!reviewer) {
    errors.push('settlement profile activation evidence reviewer must expose decision, reviewer, and date');
  } else {
    if (reviewer.decision !== 'APPROVE') {
      errors.push('settlement profile activation evidence reviewer.decision must be APPROVE');
    }
    if (isPlaceholderIdentity(reviewer.reviewer)) {
      errors.push('settlement profile activation evidence reviewer.reviewer must identify a concrete reviewer');
    }
    if (!isIsoCalendarDate(reviewer.date)) {
      errors.push('settlement profile activation evidence reviewer.date must be an ISO calendar date');
    } else if (isIsoUtcTimestamp(generatedAt) && reviewer.date < generatedAt.slice(0, 10)) {
      errors.push('settlement profile activation evidence reviewer.date must not predate the activation evidence');
    }
  }

  if (!/^[a-f0-9]{64}$/.test(activationId)) {
    errors.push('settlement profile activation evidence activationId must be 32-byte hex');
  } else if (
    settlementProfile &&
    evidenceTargets &&
    evidenceIds &&
    authorityBoundary &&
    reviewer &&
    generatedAt.length > 0 &&
    environment.length > 0 &&
    ergoNodeNetwork.length > 0 &&
    sidechainNetwork.length > 0 &&
    gitCommit.length > 0 &&
    activationId !== computeSettlementProfileActivationId({
      settlementProfile,
      generatedAt,
      environment,
      ergoNodeNetwork,
      sidechainNetwork,
      gitCommit,
      evidenceTargets,
      evidenceIds,
      authorityBoundary,
      reviewer,
    })
  ) {
    errors.push('settlement profile activation evidence activationId must match the canonical activation fields');
  }

  return {
    status: errors.length === 0 ? 'PASS' : 'BLOCKED',
    errors,
    settlementProfile,
    environment,
    ergoNodeNetwork,
    sidechainNetwork,
    gitCommit,
    activationId,
    evidenceTargets,
    evidenceIds,
    authorityEvidence: authorityEvidenceValidation.reports,
    authorityBoundary,
    reviewer,
  };
}

export function computeSettlementProfileActivationId(input: {
  settlementProfile: Gate3SettlementProfileBinding;
  generatedAt: string;
  environment: string;
  ergoNodeNetwork: string;
  sidechainNetwork: string;
  gitCommit: string;
  evidenceTargets: SettlementProfileActivationEvidenceTargets;
  evidenceIds: SettlementProfileActivationEvidenceIds;
  authorityBoundary: SettlementProfileActivationAuthorityBoundary;
  reviewer: SettlementProfileActivationReviewer;
}): string {
  const canonicalFields = [
    'e2s.gate3-settlement-profile-activation.v1',
    input.settlementProfile.settlementProfileId.trim(),
    input.settlementProfile.profileActivationStatus.trim(),
    input.settlementProfile.evidencePurpose.trim(),
    normalizeEvidenceTarget(input.settlementProfile.activationEvidenceTarget),
    input.generatedAt.trim(),
    input.environment.trim(),
    input.ergoNodeNetwork.trim(),
    input.sidechainNetwork.trim(),
    input.gitCommit.trim().toLowerCase(),
    normalizeEvidenceTarget(input.evidenceTargets.targetNodeAcceptance),
    normalizeEvidenceTarget(input.evidenceTargets.fundsAuthorityTransition),
    normalizeEvidenceTarget(input.evidenceTargets.legacyRouteRetirement),
    normalizeEvidenceTarget(input.evidenceTargets.crossProfileReplayLineage),
    input.evidenceIds.targetNodeAcceptance.toLowerCase(),
    input.evidenceIds.fundsAuthorityTransition.toLowerCase(),
    input.evidenceIds.legacyRouteRetirement.toLowerCase(),
    input.evidenceIds.crossProfileReplayLineage.toLowerCase(),
    input.authorityBoundary.targetNodeAccepted,
    input.authorityBoundary.fundsAuthorityTransitionComplete,
    input.authorityBoundary.legacyFundsRoutesRetired,
    input.authorityBoundary.crossProfileReplayLineagePreserved,
    input.authorityBoundary.gate3ClosedByThisEvidence,
    input.authorityBoundary.productionReadyClaimAllowed,
    input.authorityBoundary.mainnetProductionClaimAllowed,
    input.reviewer.decision.trim(),
    input.reviewer.reviewer.trim(),
    input.reviewer.date.trim(),
  ];
  return createHash('sha256').update(JSON.stringify(canonicalFields), 'utf8').digest('hex');
}

export function computeSettlementProfileAuthorityEvidenceId(input: {
  role: SettlementProfileAuthorityEvidenceRole;
  producerId: string;
  generatedAt: string;
  environment: string;
  ergoNodeNetwork: string;
  sidechainNetwork: string;
  gitCommit: string;
  settlementProfileId: string;
  evidenceTarget: string;
  bindings: Record<string, string | number>;
  decision: Record<string, boolean>;
}): string {
  const profile = authorityEvidenceProfiles[input.role];
  const canonicalFields = [
    'e2s.gate3-settlement-profile-authority-evidence.v1',
    input.role,
    input.producerId.trim(),
    input.generatedAt.trim(),
    input.environment.trim(),
    input.ergoNodeNetwork.trim(),
    input.sidechainNetwork.trim(),
    input.gitCommit.trim().toLowerCase(),
    input.settlementProfileId.trim(),
    normalizeEvidenceTarget(input.evidenceTarget),
    ...Object.keys(profile.bindings).map(field => [field, input.bindings[field]]),
    ...Object.keys(profile.decision).map(field => [field, input.decision[field]]),
  ];
  return createHash('sha256').update(JSON.stringify(canonicalFields), 'utf8').digest('hex');
}

interface AuthorityEvidenceValidationContext {
  generatedAt: string;
  environment: string;
  ergoNodeNetwork: string;
  sidechainNetwork: string;
  gitCommit: string;
  settlementProfileId: string;
  evidenceTargets?: SettlementProfileActivationEvidenceTargets;
  evidenceIds?: SettlementProfileActivationEvidenceIds;
}

function validateAuthorityEvidenceReports(
  value: unknown,
  context: AuthorityEvidenceValidationContext,
): { errors: string[]; reports?: SettlementProfileAuthorityEvidenceReports } {
  if (!isRecord(value)) {
    return {
      errors: ['settlement profile activation evidence must include separately supplied structured authority evidence'],
    };
  }

  const errors: string[] = [];
  const parsedReports: Partial<SettlementProfileAuthorityEvidenceReports> = {};
  if (!hasExactKeys(value, SETTLEMENT_PROFILE_AUTHORITY_EVIDENCE_ROLES)) {
    errors.push('settlement profile activation authority evidence must expose exactly the four registered roles');
  }

  for (const role of SETTLEMENT_PROFILE_AUTHORITY_EVIDENCE_ROLES) {
    const raw = value[role];
    const prefix = `settlement profile activation authority evidence ${role}`;
    if (!isRecord(raw)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (!hasExactKeys(raw, [
      'schemaVersion',
      'status',
      'role',
      'producerId',
      'generatedAt',
      'environment',
      'ergoNodeNetwork',
      'sidechainNetwork',
      'gitCommit',
      'settlementProfileId',
      'evidenceTarget',
      'evidenceId',
      'bindings',
      'decision',
    ])) {
      errors.push(`${prefix} must expose exactly the registered fields`);
    }

    const profile = authorityEvidenceProfiles[role];
    const report: SettlementProfileAuthorityEvidenceReport = {
      schemaVersion: typeof raw.schemaVersion === 'number' ? raw.schemaVersion : Number.NaN,
      status: stringValue(raw.status),
      role: stringValue(raw.role),
      producerId: stringValue(raw.producerId),
      generatedAt: stringValue(raw.generatedAt),
      environment: stringValue(raw.environment),
      ergoNodeNetwork: stringValue(raw.ergoNodeNetwork),
      sidechainNetwork: stringValue(raw.sidechainNetwork),
      gitCommit: stringValue(raw.gitCommit),
      settlementProfileId: stringValue(raw.settlementProfileId),
      evidenceTarget: stringValue(raw.evidenceTarget),
      evidenceId: stringValue(raw.evidenceId).toLowerCase(),
      bindings: parseAuthorityBindingRecord(raw.bindings),
      decision: parseBooleanRecord(raw.decision),
    };
    parsedReports[role] = report;

    if (report.schemaVersion !== 1) errors.push(`${prefix}.schemaVersion must be 1`);
    if (report.status !== 'PASS') errors.push(`${prefix}.status must be PASS`);
    if (report.role !== role) errors.push(`${prefix}.role must be ${role}`);
    if (report.producerId !== profile.producerId) {
      errors.push(`${prefix}.producerId must be ${profile.producerId}`);
    }
    if (!isIsoUtcTimestamp(report.generatedAt)) {
      errors.push(`${prefix}.generatedAt must be an ISO UTC timestamp`);
    } else if (
      isIsoUtcTimestamp(context.generatedAt) &&
      Date.parse(report.generatedAt) > Date.parse(context.generatedAt)
    ) {
      errors.push(`${prefix}.generatedAt must not be after the activation report`);
    }
    for (const [field, expected] of [
      ['environment', context.environment],
      ['ergoNodeNetwork', context.ergoNodeNetwork],
      ['sidechainNetwork', context.sidechainNetwork],
      ['gitCommit', context.gitCommit],
      ['settlementProfileId', context.settlementProfileId],
    ] as const) {
      if (report[field] !== expected) errors.push(`${prefix}.${field} must match the activation report`);
    }
    const expectedTarget = context.evidenceTargets?.[role] ?? '';
    if (normalizeEvidenceTarget(report.evidenceTarget) !== normalizeEvidenceTarget(expectedTarget)) {
      errors.push(`${prefix}.evidenceTarget must match the activation report`);
    }
    if (!hasExactBooleanDecision(report.decision, profile.decision)) {
      errors.push(`${prefix}.decision must expose the exact required authority facts`);
    }
    if (!isRecord(raw.decision) || !hasExactKeys(raw.decision, Object.keys(profile.decision))) {
      errors.push(`${prefix}.decision must not omit or add authority facts`);
    }
    if (!hasExactAuthorityBindings(report.bindings, profile.bindings)) {
      errors.push(`${prefix}.bindings must expose concrete values for every required identity`);
    }
    if (!isRecord(raw.bindings) || !hasExactKeys(raw.bindings, Object.keys(profile.bindings))) {
      errors.push(`${prefix}.bindings must not omit or add identity fields`);
    }
    const computedEvidenceId = computeSettlementProfileAuthorityEvidenceId({
      role,
      producerId: report.producerId,
      generatedAt: report.generatedAt,
      environment: report.environment,
      ergoNodeNetwork: report.ergoNodeNetwork,
      sidechainNetwork: report.sidechainNetwork,
      gitCommit: report.gitCommit,
      settlementProfileId: report.settlementProfileId,
      evidenceTarget: report.evidenceTarget,
      bindings: report.bindings,
      decision: report.decision,
    });
    if (!/^[a-f0-9]{64}$/.test(report.evidenceId) || report.evidenceId !== computedEvidenceId) {
      errors.push(`${prefix}.evidenceId must match the canonical structured evidence`);
    }
    if (report.evidenceId !== (context.evidenceIds?.[role] ?? '').toLowerCase()) {
      errors.push(`${prefix}.evidenceId must match the activation report evidenceIds.${role}`);
    }
  }

  const completeReports = SETTLEMENT_PROFILE_AUTHORITY_EVIDENCE_ROLES.every(
    role => parsedReports[role] !== undefined,
  )
    ? parsedReports as SettlementProfileAuthorityEvidenceReports
    : undefined;
  if (completeReports) {
    const replacementProfileDigests = [
      completeReports.targetNodeAcceptance.bindings.contractProfileDigest,
      completeReports.fundsAuthorityTransition.bindings.activatedContractProfileDigest,
      completeReports.legacyRouteRetirement.bindings.replacementProfileDigest,
      completeReports.crossProfileReplayLineage.bindings.replacementProfileDigest,
    ];
    if (new Set(replacementProfileDigests).size !== 1) {
      errors.push('settlement profile activation authority evidence must bind one exact replacement contract profile digest');
    }
  }

  return {
    errors,
    reports: completeReports,
  };
}

function parseEvidenceTargets(value: unknown): SettlementProfileActivationEvidenceTargets | undefined {
  if (!isRecord(value) || !hasExactKeys(value, SETTLEMENT_PROFILE_AUTHORITY_EVIDENCE_ROLES)) return undefined;
  const result: SettlementProfileActivationEvidenceTargets = {
    targetNodeAcceptance: stringValue(value.targetNodeAcceptance),
    fundsAuthorityTransition: stringValue(value.fundsAuthorityTransition),
    legacyRouteRetirement: stringValue(value.legacyRouteRetirement),
    crossProfileReplayLineage: stringValue(value.crossProfileReplayLineage),
  };
  return Object.values(result).every(target => target.length > 0) ? result : undefined;
}

function parseEvidenceIds(value: unknown): SettlementProfileActivationEvidenceIds | undefined {
  if (!isRecord(value) || !hasExactKeys(value, SETTLEMENT_PROFILE_AUTHORITY_EVIDENCE_ROLES)) return undefined;
  const ids = Object.fromEntries(SETTLEMENT_PROFILE_AUTHORITY_EVIDENCE_ROLES.map(role => [
    role,
    stringValue(value[role]).toLowerCase(),
  ])) as SettlementProfileActivationEvidenceIds;
  return Object.values(ids).every(id => /^[a-f0-9]{64}$/.test(id)) ? ids : undefined;
}

function parseBooleanRecord(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'),
  );
}

function parseAuthorityBindingRecord(value: unknown): Record<string, string | number> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(
    (entry): entry is [string, string | number] =>
      typeof entry[1] === 'string' ||
      (typeof entry[1] === 'number' && Number.isFinite(entry[1])),
  ));
}

function hasExactAuthorityBindings(
  value: Record<string, string | number>,
  rules: Record<string, AuthorityEvidenceBindingRule>,
): boolean {
  if (!hasExactKeys(value, Object.keys(rules))) return false;
  return Object.entries(rules).every(([field, rule]) => {
    const candidate = value[field];
    switch (rule.kind) {
      case 'hex':
        return typeof candidate === 'string' &&
          new RegExp(`^[a-f0-9]{${rule.bytes * 2}}$`).test(candidate) &&
          !/^0+$/.test(candidate);
      case 'identity':
        return typeof candidate === 'string' &&
          /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(candidate) &&
          !isPlaceholderIdentity(candidate);
      case 'exact':
        return candidate === rule.value;
      case 'integer':
        return typeof candidate === 'number' &&
          Number.isSafeInteger(candidate) &&
          candidate >= rule.minimum;
      default:
        return false;
    }
  });
}

function hasExactBooleanDecision(
  value: Record<string, boolean>,
  expected: Record<string, boolean>,
): boolean {
  return hasExactKeys(value, Object.keys(expected)) &&
    Object.entries(expected).every(([field, expectedValue]) => value[field] === expectedValue);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((field, index) => field === sortedExpected[index]);
}

function parseAuthorityBoundary(
  value: unknown,
): SettlementProfileActivationAuthorityBoundary | undefined {
  if (!isRecord(value)) return undefined;
  const fields = Object.keys(requiredAuthorityBoundary) as Array<keyof SettlementProfileActivationAuthorityBoundary>;
  if (!hasExactKeys(value, fields) || fields.some(field => typeof value[field] !== 'boolean')) return undefined;
  return Object.fromEntries(fields.map(field => [field, value[field]])) as unknown as SettlementProfileActivationAuthorityBoundary;
}

function parseReviewer(value: unknown): SettlementProfileActivationReviewer | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['decision', 'reviewer', 'date'])) return undefined;
  const result = {
    decision: stringValue(value.decision),
    reviewer: stringValue(value.reviewer),
    date: stringValue(value.date),
  };
  return Object.values(result).every(field => field.length > 0) ? result : undefined;
}

function toSettlementProfileBinding(value: Record<string, unknown>): Gate3SettlementProfileBinding {
  return {
    settlementProfileId: stringValue(value.settlementProfileId),
    profileActivationStatus: stringValue(value.profileActivationStatus),
    evidencePurpose: stringValue(value.evidencePurpose),
    activationEvidenceTarget: stringValue(value.activationEvidenceTarget),
  };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoUtcTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, millisecondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(millisecondText ?? '0');
  if (year < 1000 || hour > 23 || minute > 59 || second > 59) return false;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second &&
    date.getUTCMilliseconds() === millisecond;
}

function isPlaceholderIdentity(value: string): boolean {
  return value.length === 0 || /^(?:none|n\/a|na|unknown|tbd|todo|reviewer|operator)$/i.test(value) || /[<>]/.test(value);
}

function isConcreteCompletedEvidenceTarget(value: string): boolean {
  const target = normalizeEvidenceTarget(value);
  return (
    (
      isSafeArtifactEvidenceTarget(target) ||
      isSafeRepositoryEvidenceTarget(target)
    ) &&
    /(?:^|[-_.\/])completed(?:[-_.\/]|$)/i.test(target) &&
    !forbiddenEvidenceTargetName.test(target) &&
    !isSensitiveOrLocalEvidenceTarget(target)
  );
}

function isConcreteCompletedJsonEvidenceTarget(value: string): boolean {
  return isConcreteCompletedEvidenceTarget(value) && /\.json$/i.test(normalizeEvidenceTarget(value));
}

function isSafeArtifactEvidenceTarget(target: string): boolean {
  const match = /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/([^\s<>]+)$/i.exec(target);
  if (!match) return false;
  return match[1]
    .split('/')
    .every(segment => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment) && segment !== '.' && segment !== '..');
}

function isSafeRepositoryEvidenceTarget(target: string): boolean {
  if (!/^(?:\.\.\/)?evidence\//.test(target) || !/\.(?:json|md)$/.test(target)) return false;
  const segments = target.split('/');
  const evidenceIndex = segments[0] === '..' ? 1 : 0;
  if (segments[evidenceIndex] !== 'evidence') return false;
  return segments
    .slice(evidenceIndex + 1)
    .every(segment => segment.length > 0 && segment !== '.' && segment !== '..');
}

function normalizeEvidenceTarget(value: string): string {
  const trimmed = value.trim();
  const markdownMatch = trimmed.match(/^\[[^\]]+\]\(([^)]+)\)$/);
  const normalized = (markdownMatch?.[1] ?? trimmed).trim().replace(/\\/g, '/');
  const artifactMatch = /^artifact:\/\/([^/]+)\/(.+)$/i.exec(normalized);
  return artifactMatch
    ? `artifact://${artifactMatch[1].toLowerCase()}/${artifactMatch[2]}`
    : normalized;
}

function isSensitiveOrLocalEvidenceTarget(target: string): boolean {
  return evidenceTargetInspectionVariants(target).some(candidate => {
    const segments = candidate.split(/[\/\s,;=()]+/).filter(Boolean);
    return (
      hasEvidenceLocalOnlyInspectionReference(candidate) ||
      isEvidenceRuntimeDatabaseTarget(candidate) ||
      isEvidenceSecretOrRuntimeName(candidate, { includeDeployedState: true }) ||
      segments.some(segment =>
        isEvidenceEnvironmentFileName(segment) ||
        isEvidenceRuntimeDatabaseTarget(segment) ||
        isEvidenceSecretOrRuntimeName(segment, { includeDeployedState: true }),
      )
    );
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
