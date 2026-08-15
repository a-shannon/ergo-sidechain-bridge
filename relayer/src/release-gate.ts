import { createHash } from 'crypto';
import { basename } from 'path';

import {
  hasAbsoluteSecurityClaim,
  hasConditionalValidationApprovalMarker,
  hasStructuredValidationFailureMarker,
  normalizeEvidenceMarkerText,
  hasUnresolvedIssueMarker,
  validateEvidenceHygiene,
} from './evidence-hygiene.js';
import { isIsoCalendarDate } from './evidence-date.js';
import { validateDuplicateRequiredFields } from './evidence-required-names.js';
import { BATCH_UNLOCK_MAX_CLAIMS } from './aggregate-settlement-limits.js';
import {
  evidenceTargetInspectionVariants,
  hasEvidenceLocalOnlyInspectionReference,
  isEvidenceEnvironmentFileName,
  isEvidenceRuntimeDatabaseTarget,
  isEvidenceSecretOrRuntimeName,
} from './evidence-sensitive-target.js';
import {
  hasCleanCheckoutCommandExpectedResult,
  hasCleanCheckoutDecisionPublicationImpact,
  hasCompletedCleanCheckoutChecklistUpdateEvidence,
  hasCompletedCleanCheckoutCommandEvidence,
  hasCompletedCleanCheckoutDecisionEvidence,
  hasCompletedCleanCheckoutReleaseNoteUpdateEvidence,
  hasCompletedCleanCheckoutWorkflowEvidence,
  hasNoContradictoryCleanCheckoutCommandEvidenceMarker,
  hasNoContradictoryCleanCheckoutDecisionEvidenceMarker,
  hasNoContradictoryCleanCheckoutEvidenceMarker,
  hasNoContradictoryCleanCheckoutReviewerNoteMarker,
  isActionableCleanCheckoutReviewerNote,
  REQUIRED_CLEAN_CHECKOUT_COMMANDS,
  REQUIRED_CLEAN_CHECKOUT_REPRODUCIBILITY_DECISIONS,
  REQUIRED_CLEAN_CHECKOUT_REVIEWER_ROLES,
  REQUIRED_CLEAN_CHECKOUT_WORKFLOW_REQUIREMENTS,
} from './clean-checkout-evidence.js';
import {
  hasCompletedTechnicalAddendumChecklistUpdateEvidence,
  hasCompletedTechnicalAddendumDecisionEvidence,
  hasCompletedTechnicalAddendumGateArtifact,
  hasCompletedTechnicalAddendumReleaseGatePassEvidence,
  hasCompletedTechnicalAddendumReleaseNoteUpdateEvidence,
  hasTechnicalAddendumDecisionRequiredPosition,
  hasTechnicalAddendumGateClaimBoundary,
  hasTechnicalAddendumGateRequiredEvidence,
  isActionableTechnicalAddendumReviewerNote,
  TECHNICAL_ADDENDUM_RELEASE_GATE_DECISION,
  REQUIRED_TECHNICAL_ADDENDUM_DECISIONS,
  REQUIRED_TECHNICAL_ADDENDUM_GATE_ROWS,
  REQUIRED_TECHNICAL_ADDENDUM_REVIEWER_ROLES,
} from './technical-addendum-evidence.js';
import {
  hasCompletedBackupRestoreBoundaryEvidence,
  hasCompletedBackupRestoreChecklistUpdateEvidence,
  hasCompletedBackupRestoreCommandEvidence,
  hasCompletedBackupRestoreReleaseNoteUpdateEvidence,
  hasCompletedBackupRestoreStateEvidence,
  hasCompletedBackupRestoreStopConditionResolution,
  hasNoContradictoryBackupRestoreEvidenceMarker,
  isActionableBackupRestoreReviewerNote,
  REQUIRED_BACKUP_RESTORE_BOUNDARIES,
  REQUIRED_BACKUP_RESTORE_COMMAND_STEPS,
  REQUIRED_BACKUP_RESTORE_REVIEWER_ROLES,
  REQUIRED_BACKUP_RESTORE_STATE_CHECKS,
  REQUIRED_BACKUP_RESTORE_STOP_CONDITIONS,
} from './backup-restore-evidence.js';
import {
  hasCompletedDependencyChecklistUpdateEvidence,
  hasCompletedDependencyCommandEvidence,
  hasCompletedDependencyEvidenceTarget,
  hasCompletedDependencyReleaseNoteUpdateEvidence,
  hasCompletedDependencyScopeEvidence,
  dependencyReviewSignerReleaseIdentifiersMatch,
  hasDependencyReviewScopeRiskFocus,
  hasDependencyTriageZeroCriticalHigh,
  hasDependencyUpgradeDecisionReleaseAction,
  hasInternallyPositiveDependencyCommandOutput,
  hasNoContradictoryDependencyEvidenceMarker,
  isActionableDependencyReviewerNote,
  REQUIRED_DEPENDENCY_REVIEW_COMMANDS,
  REQUIRED_DEPENDENCY_REVIEW_DEPENDENCIES,
  REQUIRED_DEPENDENCY_REVIEW_REVIEWER_ROLES,
  REQUIRED_DEPENDENCY_REVIEW_TRIAGE_ITEMS,
  REQUIRED_DEPENDENCY_REVIEW_UPGRADE_DECISIONS,
} from './dependency-review-evidence.js';
import {
  hasActionableSecurityReviewEvidenceNote,
  hasCompletedSecurityReviewEvidenceTarget,
  hasCompletedSecurityReviewChecklistUpdateEvidence,
  hasCompletedSecurityReviewReleaseNoteUpdateEvidence,
  hasSecurityReviewEvidenceArtifactFocus,
  hasSecurityReviewExpectedNegativeAnswer,
  findMissingSecurityReviewFindingIdClosureEvidence,
  isConcreteSecurityReviewerOrganization,
  hasSecurityReviewNegativeEvidenceFocus,
  hasNoContradictorySecurityReviewEvidenceMarker,
  hasSecurityReviewScopeRiskFocus,
  isActionableSecurityReviewOutcomeNote,
  REQUIRED_SECURITY_REVIEW_EVIDENCE_ITEMS,
  REQUIRED_SECURITY_REVIEW_FINDING_CLASSES,
  REQUIRED_SECURITY_REVIEW_NEGATIVE_QUESTIONS,
  REQUIRED_SECURITY_REVIEW_REVIEWER_ROLES,
  REQUIRED_SECURITY_REVIEW_SCOPE_AREAS,
} from './security-review-evidence.js';
import {
  hasCompletedOperatorReadinessChecklistUpdateEvidence,
  hasCompletedOperatorReadinessEvidenceTarget,
  hasCompletedOperatorReadinessReleaseNoteUpdateEvidence,
  hasNoContradictoryOperatorReadinessEvidenceMarker,
  hasNoContradictoryOperatorReadinessOperationalEvidenceMarker,
  hasOperatorReadinessCommandPurpose,
  REQUIRED_OPERATOR_READINESS_COMMANDS,
  REQUIRED_OPERATOR_READINESS_DRILLS,
  REQUIRED_OPERATOR_READINESS_OPERATIONAL_DECISIONS,
  REQUIRED_OPERATOR_READINESS_REVIEWER_ROLES,
  REQUIRED_OPERATOR_READINESS_RUNBOOKS,
} from './operator-readiness-evidence.js';
import {
  hasCompletedCommitteeGovernanceChecklistUpdateEvidence,
  hasCompletedCommitteeGovernanceEvidenceTarget,
  hasCompletedCommitteeGovernanceExternalReviewEvidence,
  hasCompletedCommitteeGovernanceReleaseNoteUpdateEvidence,
  hasCommitteeGovernanceNegativeExpectedResult,
  hasCommitteeGovernancePositiveExpectedResult,
  hasNoContradictoryCommitteeGovernanceEvidenceMarker,
  hasNoContradictoryCommitteeGovernanceNegativeEvidenceMarker,
  REQUIRED_COMMITTEE_GOVERNANCE_COMMANDS,
  REQUIRED_COMMITTEE_GOVERNANCE_NEGATIVE_CHECKS,
  REQUIRED_COMMITTEE_GOVERNANCE_POSITIVE_CHECKS,
  REQUIRED_COMMITTEE_GOVERNANCE_REVIEWER_ROLES,
  REQUIRED_COMMITTEE_GOVERNANCE_ROTATION_STEPS,
  REQUIRED_COMMITTEE_GOVERNANCE_SCOPE_SURFACES,
} from './committee-governance-evidence.js';
import {
  hasCompletedBenchmarkChecklistUpdateEvidence,
  hasCompletedBenchmarkBottleneckEvidence,
  hasCompletedBenchmarkCommandEvidence,
  hasCompletedBenchmarkEvidenceTarget,
  hasCompletedBenchmarkMetricEvidence,
  hasCompletedBenchmarkReleaseNoteUpdateEvidence,
  hasCompletedBenchmarkShardedLaneEvidence,
  isActionableBenchmarkReviewerNote,
  REQUIRED_BENCHMARK_ALLOWED_CLAIMS,
  REQUIRED_BENCHMARK_BOTTLENECKS,
  REQUIRED_BENCHMARK_BLOCKED_CLAIMS,
  REQUIRED_BENCHMARK_COMMANDS,
  REQUIRED_BENCHMARK_METRIC_SCENARIOS,
  REQUIRED_BENCHMARK_REVIEWER_ROLES,
  REQUIRED_BENCHMARK_SHARDED_STATEMENTS,
} from './benchmark-evidence.js';
import {
  hasCompletedExternalIntegrationChecklistUpdateEvidence,
  hasCompletedExternalIntegrationEvidenceTarget,
  hasCompletedExternalIntegrationReleaseNoteUpdateEvidence,
  hasExpectedExternalIntegrationDecisionAnswer,
  hasExpectedExternalIntegrationNegativeCorrection,
  hasNoContradictoryExternalIntegrationReviewEvidenceMarker,
  isConcreteExternalIntegrationReviewerOrganization,
  REQUIRED_EXTERNAL_INTEGRATION_DECISIONS,
  REQUIRED_EXTERNAL_INTEGRATION_ENTRY_POINTS,
  REQUIRED_EXTERNAL_INTEGRATION_FRESH_CHECKOUT_COMMANDS,
  REQUIRED_EXTERNAL_INTEGRATION_NEGATIVE_MISREADS,
  REQUIRED_EXTERNAL_INTEGRATION_REVIEWER_ROLES,
} from './external-integration-evidence.js';
import {
  hasCompletedTrustlessBurnChecklistUpdateEvidence,
  hasCompletedTrustlessBurnEvidenceTarget,
  hasCompletedTrustlessBurnReleaseNoteUpdateEvidence,
  hasTrustlessBurnCommitmentFieldEncoding,
  hasTrustlessBurnComponentProperty,
  hasTrustlessBurnNegativeProofEvidence,
  hasTrustlessBurnPositiveProofEvidence,
  hasTrustlessBurnProofBinding,
  isActionableTrustlessBurnReviewerNote,
  REQUIRED_TRUSTLESS_BURN_COMMITMENT_FIELDS,
  REQUIRED_TRUSTLESS_BURN_COMPONENTS,
  REQUIRED_TRUSTLESS_BURN_NEGATIVE_CHECKS,
  REQUIRED_TRUSTLESS_BURN_POSITIVE_CHECKS,
  REQUIRED_TRUSTLESS_BURN_PROOF_FIELDS,
  REQUIRED_TRUSTLESS_BURN_REVIEWER_ROLES,
  validateTrustlessBurnLocalProofCoreNegativeRowBindings,
} from './trustless-burn-evidence.js';
import {
  classifyPublicationClaimText,
  CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR,
  MAINNET_PRODUCTION_CLAIM_ERROR,
  PRODUCTION_CLAIM_EVIDENCE_ERROR,
  PRODUCTION_CLAIM_WORDING,
  hasNegatedAllowedClaimEvidenceLink,
  validateReviewerDecisionSummaryClaimBoundary,
} from './publication-claim-boundary.js';
import {
  hasCompletedRehearsalChecklistUpdateEvidence,
  hasCompletedLifecycleGateEvidenceArtifact,
  hasCompletedRehearsalReleaseNoteUpdateEvidence,
  REQUIRED_REHEARSAL_GATES,
  type RehearsalEvidenceRow,
  type RehearsalPublicationEvidence,
  type RehearsalReviewerSignoff,
  type RehearsalSessionMetadata,
} from './rehearsal-evidence.js';
import { validateReadOnlyNodeUrl } from './read-only-node-url.js';
import {
  validateGate3ClosureProfileBinding,
  validateSettlementProfileActivationEvidence,
} from './gate3-settlement-profile.js';
import type {
  AggregateSettlementPrebroadcastClaimEvidence,
} from './aggregate-settlement-evidence.js';
import type {
  BackupRestoreClassificationFields,
  BackupRestorePublicationEvidenceFields,
  BackupRestoreSnapshotProvenance,
  RecoveryCommandRow,
  ReconstructibilityBoundaryRow,
  ReviewerSignoffRow,
  StateConsistencyRow,
  StopConditionRow,
} from './backup-restore-evidence.js';
import type {
  CleanCheckoutCommandRow,
  CleanCheckoutRunClassification,
  ReproducibilityDecisionRow,
  ReviewerSignoffRow as CleanCheckoutReviewerSignoffRow,
  WorkflowEvidenceRow,
} from './clean-checkout-evidence.js';
import type {
  ArchitectureDecisionRow,
  ArchitectureGateRow,
  TechnicalAddendumClaimBoundaryFields,
  ReviewerSignoffRow as TechnicalAddendumReviewerSignoffRow,
} from './technical-addendum-evidence.js';
import type {
  AllowedClaimRow,
  OperatorImpactRow,
  PublicationBlockerRow,
  ReleaseNotesClassification,
  ReleaseSignoffRow,
  RequiredEvidenceRow,
  TrustAssumptionRow,
} from './release-notes-evidence.js';
import type {
  DependencyReviewClassificationFields,
  DependencyCommandRow,
  DependencyScopeRow,
  ReviewerSignoffRow as DependencyReviewReviewerSignoffRow,
  UpgradeDecisionRow,
  VulnerabilityTriageRow,
} from './dependency-review-evidence.js';
import type {
  FindingDispositionRow,
  NegativeReviewCheckRow,
  ReviewEvidencePackageRow,
  ReviewerSignoffRow as SecurityReviewReviewerSignoffRow,
  SecurityReviewClassificationFields,
  ScopeCoverageRow,
} from './security-review-evidence.js';
import type {
  IncidentDrillRow,
  OperationalDecisionRow,
  OperatorReadinessClassificationFields,
  OperatorCommandRow,
  ReviewerSignoffRow as OperatorReadinessReviewerSignoffRow,
  RunbookCoverageRow,
} from './operator-readiness-evidence.js';
import type {
  GovernanceCommandRow,
  GovernanceClassificationFields,
  GovernanceNegativeCheckRow,
  GovernancePositiveCheckRow,
  GovernanceScopeRow,
  ReviewerSignoffRow as CommitteeGovernanceReviewerSignoffRow,
  RotationPlanRow,
} from './committee-governance-evidence.js';
import type {
  BenchmarkClaimsBoundaryFields,
  BenchmarkClassificationFields,
  BenchmarkCommandRow,
  BenchmarkMetricRow,
  BottleneckRow,
  ReviewerSignoffRow as BenchmarkReviewerSignoffRow,
  ShardedLaneEvidenceRow,
} from './benchmark-evidence.js';
import type {
  FreshCheckoutCommandRow,
  IntegrationDecisionRow,
  NegativeReviewRow,
  RequiredEntryPointRow,
  ReviewerSignoffRow as ExternalIntegrationReviewerSignoffRow,
} from './external-integration-evidence.js';
import type {
  TechnicalAddendumClassificationFields,
} from './technical-addendum-evidence.js';
import type {
  BurnProofBindingRow,
  CommitmentFormatRow,
  NegativeProofRow,
  PositiveProofRow,
  RequiredComponentRow,
  ReviewerSignoffRow as TrustlessBurnReviewerSignoffRow,
  TrustlessBurnClassificationFields,
  TrustlessBurnLocalProofVector,
} from './trustless-burn-evidence.js';
import {
  REQUIRED_THREAT_MODEL_AREA_TERMS,
  REQUIRED_THREAT_MODEL_MATRIX_AREAS,
  THREAT_MODEL_ALLOWED_STATUSES,
  type ThreatModelClassification,
  type ThreatModelMatrixRow,
} from './threat-model-evidence.js';
import type { TestnetRecoveryDrillKind } from './testnet-recovery-drill-evidence.js';
import { LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE } from './legacy-aggregate-settlement-conservation.js';

export type ReleaseEvidenceStatus = 'Checked' | 'Pending evidence' | 'Open blocker';

export interface PendingEvidenceRow {
  gate: string;
  item: string;
  status: string;
  publicationEffect: string;
  requiredResolution: string;
}

export interface ReleaseDecisionFields {
  proposedReleaseLevel: string;
  finalDecision: string;
  publicReleaseAllowed: string;
  productionReadyClaimsAllowed: string;
  testnetProductionCandidateClaimsAllowed: string;
  unresolvedPublicationBlockers: string;
  releaseNotesStatus: string;
  releaseNotesArtifact: string;
}

interface RequiredPendingEvidenceRow {
  gate: string;
  item: string;
  unresolvedStatus: Exclude<ReleaseEvidenceStatus, 'Checked'>;
  requiredResolutionTerms: string[];
}

export interface ReleaseGateResult {
  status: 'PASS' | 'BLOCKED';
  blockers: PendingEvidenceRow[];
  decision: Partial<ReleaseDecisionFields>;
  issues: string[];
  rowCount: number;
  message: string;
}

export interface ReleaseNotesValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  classification?: ReleaseNotesClassification;
  evidenceRows?: RequiredEvidenceRow[];
  assumptionRows?: TrustAssumptionRow[];
  blockerRows?: PublicationBlockerRow[];
  claimRows?: AllowedClaimRow[];
  operatorRows?: OperatorImpactRow[];
  signoffRows?: ReleaseSignoffRow[];
}

export interface ThreatModelEvidenceValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  classification?: ThreatModelClassification;
  matrixRows?: ThreatModelMatrixRow[];
}

const REQUIRED_RELEASE_NOTES_EVIDENCE_CLASSES = [
  'Clean checkout CI',
  'Local devnet lifecycle rehearsal',
  'Testnet lifecycle rehearsal',
  'Failed broadcast phantom AVL recovery drill evidence',
  'Reorged burn and stale singleton recovery drill evidence',
  'ContextExtension signer resolution or guard',
  'Signer dependency conformance or fail-closed release decision evidence',
  'Broadcast gate evidence',
  'SQLite/AVL backup-restore evidence',
  'Operator readiness evidence',
  'Committee governance and key-rotation evidence',
  'Threat model and evidence matrix',
  'Dependency risk review evidence',
  'Independent security review',
  'Trustless burn verification evidence',
  'Single, batch, and sharded benchmark evidence',
  'External integration package review',
  'Technical addendum architecture manual',
] as const;

const REQUIRED_RELEASE_NOTES_TRUST_ASSUMPTIONS = [
  'Trusted-oracle burn interpretation',
  'ContextExtension signer consensus',
  'Committee/governance and key rotation',
  'Explicit broadcast opt-in',
  'Local SQLite/AVL recovery',
  'External security review',
] as const;

const REQUIRED_RELEASE_NOTES_CLAIM_BOUNDARIES = [
  'No absolute security claim.',
  'No unqualified production-ready or production-readiness claim.',
  `No ${PRODUCTION_CLAIM_WORDING} claim unless the wording is the controlled ` +
    '`testnet production-candidate` or `production-grade testnet` public wording and all ' +
    'required testnet evidence gates are linked and checked; this exception does not allow ' +
    'production-ready, mainnet, go-live, general availability, generally available, or production launch wording.',
  'No forbidden mainnet-scoped claim: mainnet, main-net, main net, main network, or main chain paired with forbidden production-ready, production-candidate, go-live, general availability, generally available, or production launch wording; production-candidate language is testnet-only.',
  'No testnet production-candidate or production-grade testnet claim without linked final CI, local devnet, testnet lifecycle, recovery drills, backup-restore, ContextExtension signer guard, broadcast gate, signer conformance, operator readiness, governance/key-rotation, threat model, dependency risk, independent security review, trustless burn verification, benchmark, external integration evidence, technical addendum architecture manual evidence, and checked publication blockers.',
  'No throughput, latency, TPS, tx/s, transaction-per-second, or scaling claim without benchmark evidence.',
  'No trustless burn, burn verification, SPV, burn inclusion, phantom burn trust minimization, or sidechain commitment claim without linked trustless burn evidence.',
  'No trusted burn verification, trusted-oracle burn, or oracle-fallback completion claim without linked trustless burn evidence.',
  'No ContextExtension signer guard, fail-closed guard, or signer resolution claim without linked ContextExtension signer guard evidence.',
  'No signer dependency, ContextExtension, sigma-rust, or upstream signer claim without linked signer dependency evidence.',
  'No broadcast, broadcast gate, broadcast opt-in, or transaction broadcast claim without linked broadcast gate evidence.',
  'No dependency risk, dependency register, toolchain, lockfile, supply-chain, or vulnerability-triage claim without linked dependency risk review evidence.',
  'No threat model, evidence matrix, risk-class, attack-chain, or mitigation claim without linked threat-model/evidence-matrix evidence.',
  'No claim that trusted burn verification is solved until the SPV/burn inclusion proof path is linked.',
  'No committee governance, key-rotation, threshold, or multisig claim without linked committee governance evidence.',
  'No claim that committee governance is complete until key-rotation and incident drills are linked.',
  'No operator readiness, operationally-ready, ops-ready, runbook, incident, or monitoring claim without linked operator readiness evidence.',
  'No external integration, third-party integration, integrator-ready, partner-ready, safe-to-publish, publication-approved, release-candidate, fresh checkout, institutional-reference, public release, publication-ready, or private maintainer context claim without linked external integration evidence.',
  'No backup, restore, disaster recovery, state recovery, SQLite/WAL, or AVL rebuild claim without linked backup-restore evidence.',
  'No security review, audit, security assessment, penetration-test, finding disposition, or critical/high claim without linked independent security review evidence.',
  'No failed broadcast, phantom AVL, or phantom DUP claim without linked failed-broadcast recovery evidence.',
  'No reorged burn or stale singleton claim without linked reorg/stale-singleton recovery evidence.',
  'No clean checkout, CI, final branch, or workflow claim without linked clean-checkout evidence.',
  'No local devnet lifecycle claim without linked local devnet lifecycle evidence.',
  'No testnet lifecycle claim without completed live rehearsal evidence with `npm run rehearsal:validate` PASS output bound to the completed rehearsal target and linked `Ergo node network testnet` plus `Sidechain network` scope evidence.',
  'No peg-in, peg-out, end-to-end, round-trip, full-lifecycle, submit, confirmation, or reconciliation claim without linked local devnet lifecycle evidence or completed live testnet lifecycle evidence with `npm run rehearsal:validate` PASS output bound to the completed rehearsal target.',
] as const;

const REQUIRED_RELEASE_NOTES_OPERATOR_AREAS = [
  'Deployment state',
  'Broadcast enablement',
  'SQLite/AVL backup restore',
  'Monitoring and alerting',
  'Incident response',
] as const;

const REQUIRED_RELEASE_NOTES_SIGNOFF_ROLES = [
  'Maintainer',
  'Security reviewer',
  'Operator reviewer',
] as const;

const GENERIC_RELEASE_NOTES_ROW_TOKENS = new Set([
  'claim',
  'claims',
  'completed',
  'evidence',
  'gate',
  'linked',
  'notes',
  'publication',
  'release',
  'required',
  'review',
  'reviewed',
  'row',
  'rows',
]);

export interface PostSubmitObserveJsonValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  expectedTxId?: string;
  submittedTxId?: string;
  burnOrder?: unknown[];
  livePreflightBinding?: Record<string, unknown>;
  confirmation?: Record<string, unknown>;
  boundaries?: Record<string, unknown>;
  sourceBindings?: Record<string, unknown>;
  observation?: Record<string, unknown>;
}

export interface AssemblyReportJsonValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  expectedTxId?: string;
  submittedTxId?: string;
  targetBindings?: Record<string, unknown>;
  rehearsalValidation?: Record<string, unknown>;
  markdown?: string;
}

export interface LivePreflightJsonValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  settlementProfile?: Record<string, unknown>;
  expectedTxId?: string;
  runtimeBroadcastEnabled?: unknown;
  targetBindings?: Record<string, unknown>;
  preSubmitBoundary?: Record<string, unknown>;
  authorizationEvidence?: Record<string, unknown>;
  approvalBinding?: Record<string, unknown>;
}

export interface FreshCheckpointJsonValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  expectedTxId?: string;
  checkpoint?: Record<string, unknown>;
  boundary?: Record<string, unknown>;
  sourceBindings?: Record<string, unknown>;
}

export interface LiveRehearsalEvidenceValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  rows?: RehearsalEvidenceRow[];
  sessionMetadata?: unknown;
  publicationEvidence?: unknown;
  reviewerSignoff?: unknown;
}

export interface SettlementProfileActivationJsonValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  report?: unknown;
  authorityEvidence?: unknown;
}

export interface AggregatePrebroadcastJsonValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  generatedAt?: string;
  command?: string;
  stateTrackerMode?: unknown;
  broadcast?: unknown;
  transactionCheck?: Record<string, unknown>;
  expectedTxId?: string;
  claimCount?: unknown;
  claims?: AggregateSettlementPrebroadcastClaimEvidence[];
  settlementShape?: Record<string, unknown>;
  sourceBindings?: Record<string, unknown>;
}

export interface RehearsalPreflightJsonValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  reportStatus?: unknown;
  targetBindings?: Record<string, unknown>;
  packages?: unknown[];
  lines?: string[];
}

export interface WindowPrepJsonValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  reportStatus?: unknown;
  executionStatus?: unknown;
  targetBindings?: Record<string, unknown>;
  packages?: unknown[];
  networkScope?: Record<string, unknown>;
  heightBoundary?: Record<string, unknown>;
  gateBoundary?: Record<string, unknown>;
  nextHandoff?: Record<string, unknown>;
  markdown?: string;
  lines?: string[];
}

export interface PrepBundleJsonValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  executionStatus?: unknown;
  gateBoundary?: Record<string, unknown>;
  artifactTargets?: Record<string, unknown>;
  sourceBindings?: Record<string, unknown>;
  preparedCommands?: unknown[];
  nextHandoff?: Record<string, unknown>;
  stageStatuses?: Record<string, unknown>;
}

export interface OfflineGateJsonValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  stages?: unknown[];
  targetBindings?: Record<string, unknown>;
  sourceBindings?: Record<string, unknown>;
  lines?: string[];
}

export interface RecoveryObserveJsonValidationInput {
  target: string;
  kind?: TestnetRecoveryDrillKind;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  pegOutBurnTxId?: string;
  expectedTxId?: string;
  singletonInventoryId?: string;
  observationBoundary?: Record<string, unknown>;
  sourceBindings?: Record<string, unknown>;
}

export interface BackupRestoreEvidenceValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  classification?: BackupRestoreClassificationFields;
  commandRows?: RecoveryCommandRow[];
  stateRows?: StateConsistencyRow[];
  boundaryRows?: ReconstructibilityBoundaryRow[];
  stopConditionRows?: StopConditionRow[];
  publicationEvidence?: BackupRestorePublicationEvidenceFields;
  snapshotProvenance?: BackupRestoreSnapshotProvenance;
  reviewerRows?: ReviewerSignoffRow[];
}

export interface DependencyReviewEvidenceValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  classification?: Partial<DependencyReviewClassificationFields>;
  publicationDecision?: {
    releaseSupported?: string;
    productionReadyClaimAllowed?: string;
    testnetProductionCandidateClaimAllowed?: string;
    criticalHighVulnerabilitiesOpen?: string;
    upstreamSignerBlockerResolved?: string;
    releaseNotesUpdated?: string;
    requiredReleaseNoteUpdates?: string;
    requiredChecklistUpdates?: string;
    reviewerDecisionSummary?: string;
  };
  commandRows?: DependencyCommandRow[];
  scopeRows?: DependencyScopeRow[];
  triageRows?: VulnerabilityTriageRow[];
  upgradeRows?: UpgradeDecisionRow[];
  reviewerRows?: DependencyReviewReviewerSignoffRow[];
}

export interface SecurityReviewEvidenceValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  classification?: Partial<SecurityReviewClassificationFields>;
  publicationDecision?: {
    releaseSupported?: string;
    productionReadyClaimAllowed?: string;
    testnetProductionCandidateClaimAllowed?: string;
    criticalHighFindingsOpen?: string;
    acceptedRisksReflectedInReleaseNotes?: string;
    requiredReleaseChecklistUpdates?: string;
    requiredReleaseNoteUpdates?: string;
    reviewerDecisionSummary?: string;
  };
  scopeRows?: ScopeCoverageRow[];
  evidenceRows?: ReviewEvidencePackageRow[];
  findingRows?: FindingDispositionRow[];
  negativeRows?: NegativeReviewCheckRow[];
  reviewerRows?: SecurityReviewReviewerSignoffRow[];
}

export interface CleanCheckoutEvidenceValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  classification?: CleanCheckoutRunClassification;
  publicationDecision?: {
    cleanCheckoutCiGreen?: string;
    releaseSupported?: string;
    productionReadyClaimAllowed?: string;
    testnetProductionCandidateClaimAllowed?: string;
    releaseGateStructuralIssues?: string;
    releaseNotesUpdated?: string;
    requiredReleaseNoteUpdates?: string;
    requiredChecklistUpdates?: string;
    reviewerDecisionSummary?: string;
  };
  commandRows?: CleanCheckoutCommandRow[];
  workflowRows?: WorkflowEvidenceRow[];
  decisionRows?: ReproducibilityDecisionRow[];
  reviewerRows?: CleanCheckoutReviewerSignoffRow[];
}

export interface TrustlessBurnEvidenceValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  classification?: Partial<TrustlessBurnClassificationFields>;
  publicationDecision?: {
    trustlessBurnVerificationImplemented?: string;
    productionReadyClaimAllowed?: string;
    testnetProductionCandidateClaimAllowed?: string;
    transitionalTrustedBurnPathDisabled?: string;
    criticalHighFindingsOpen?: string;
    releaseNotesUpdated?: string;
    requiredReleaseChecklistUpdates?: string;
    requiredReleaseNoteUpdates?: string;
    reviewerDecisionSummary?: string;
  };
  componentRows?: RequiredComponentRow[];
  commitmentRows?: CommitmentFormatRow[];
  burnProofRows?: BurnProofBindingRow[];
  localProofVector?: TrustlessBurnLocalProofVector;
  localProofVectorReportTarget?: string;
  positiveRows?: PositiveProofRow[];
  negativeRows?: NegativeProofRow[];
  reviewerRows?: TrustlessBurnReviewerSignoffRow[];
}

export interface BenchmarkEvidenceValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  classification?: Partial<BenchmarkClassificationFields>;
  publicationDecision?: {
    releaseSupported?: string;
    scalingClaimsAllowed?: string;
    productionReadyClaimAllowed?: string;
    testnetProductionCandidateClaimAllowed?: string;
    productionThroughputClaimAllowed?: string;
    mainnetGradeEvidenceLinked?: string;
    openBenchmarkBlockers?: string;
    releaseNotesUpdated?: string;
    requiredReleaseNoteUpdates?: string;
    requiredChecklistUpdates?: string;
    reviewerDecisionSummary?: string;
  };
  commandRows?: BenchmarkCommandRow[];
  metricRows?: BenchmarkMetricRow[];
  shardedLaneRows?: ShardedLaneEvidenceRow[];
  bottleneckRows?: BottleneckRow[];
  claimsBoundary?: BenchmarkClaimsBoundaryFields;
  reviewerRows?: BenchmarkReviewerSignoffRow[];
}

export interface OperatorReadinessEvidenceValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  classification?: Partial<OperatorReadinessClassificationFields>;
  publicationDecision?: {
    releaseSupported?: string;
    productionReadyClaimAllowed?: string;
    testnetProductionCandidateClaimAllowed?: string;
    operatorReadyClaimAllowed?: string;
    criticalIncidentsOpen?: string;
    releaseNotesUpdated?: string;
    requiredReleaseNoteUpdates?: string;
    requiredChecklistUpdates?: string;
    reviewerDecisionSummary?: string;
  };
  runbookRows?: RunbookCoverageRow[];
  commandRows?: OperatorCommandRow[];
  drillRows?: IncidentDrillRow[];
  decisionRows?: OperationalDecisionRow[];
  reviewerRows?: OperatorReadinessReviewerSignoffRow[];
}

export interface CommitteeGovernanceEvidenceValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  classification?: Partial<GovernanceClassificationFields>;
  publicationDecision?: {
    releaseSupported?: string;
    productionReadyClaimAllowed?: string;
    testnetProductionCandidateClaimAllowed?: string;
    governanceReadyClaimAllowed?: string;
    openGovernanceBlockers?: string;
    releaseNotesUpdated?: string;
    requiredReleaseNoteUpdates?: string;
    requiredChecklistUpdates?: string;
    externalReviewEvidence?: string;
    reviewerDecisionSummary?: string;
  };
  scopeRows?: GovernanceScopeRow[];
  commandRows?: GovernanceCommandRow[];
  rotationRows?: RotationPlanRow[];
  positiveRows?: GovernancePositiveCheckRow[];
  negativeRows?: GovernanceNegativeCheckRow[];
  reviewerRows?: CommitteeGovernanceReviewerSignoffRow[];
}

export interface ExternalIntegrationEvidenceValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  classification?: {
    releaseLevel?: string;
    reviewerType?: string;
    reviewerOrganization?: string;
    gitCommit?: string;
    environmentUsed?: string;
    broadcastMode?: string;
    privateMaintainerContextUsed?: string;
    leadReviewer?: string;
    date?: string;
  };
  publicationDecision?: {
    publicInstitutionalReferenceReleaseAllowed?: string;
    productionReadyClaimAllowed?: string;
    testnetProductionCandidateClaimAllowed?: string;
    privateMaintainerContextUsed?: string;
    releaseNotesUpdated?: string;
    requiredReleaseNoteUpdates?: string;
    requiredChecklistUpdates?: string;
    reviewerDecisionSummary?: string;
  };
  entryPointRows?: RequiredEntryPointRow[];
  freshCheckoutRows?: FreshCheckoutCommandRow[];
  decisionRows?: IntegrationDecisionRow[];
  negativeReviewRows?: NegativeReviewRow[];
  reviewerRows?: ExternalIntegrationReviewerSignoffRow[];
}

export interface TechnicalAddendumEvidenceValidationInput {
  target: string;
  status: 'PASS' | 'BLOCKED';
  errors: string[];
  classification?: Partial<TechnicalAddendumClassificationFields>;
  claimBoundary?: Partial<TechnicalAddendumClaimBoundaryFields>;
  publicationDecision?: {
    manualUseStatus?: string;
    releaseSupported?: string;
    releaseGateStatus?: string;
    productionReadyClaimAllowed?: string;
    mainnetDeploymentClaimAllowed?: string;
    testnetProductionCandidateClaimAllowed?: string;
    releaseNotesUpdated?: string;
    requiredReleaseNoteUpdates?: string;
    requiredChecklistUpdates?: string;
    reviewerDecisionSummary?: string;
  };
  gateRows?: ArchitectureGateRow[];
  decisionRows?: ArchitectureDecisionRow[];
  reviewerRows?: TechnicalAddendumReviewerSignoffRow[];
}

export interface ReleaseGateEvaluationOptions {
  localLiveRehearsalEvidenceValidation?: LiveRehearsalEvidenceValidationInput;
  liveRehearsalEvidenceValidation?: LiveRehearsalEvidenceValidationInput;
  localSettlementProfileActivationJsonValidation?: SettlementProfileActivationJsonValidationInput;
  settlementProfileActivationJsonValidation?: SettlementProfileActivationJsonValidationInput;
  aggregatePrebroadcastJsonValidation?: AggregatePrebroadcastJsonValidationInput;
  freshCheckpointJsonValidation?: FreshCheckpointJsonValidationInput;
  livePreflightJsonValidation?: LivePreflightJsonValidationInput;
  postSubmitObserveJsonValidation?: PostSubmitObserveJsonValidationInput;
  assemblyReportJsonValidation?: AssemblyReportJsonValidationInput;
  windowPrepJsonValidation?: WindowPrepJsonValidationInput;
  prepBundleJsonValidation?: PrepBundleJsonValidationInput;
  offlineGateJsonValidation?: OfflineGateJsonValidationInput;
  recoveryObserveJsonValidations?: RecoveryObserveJsonValidationInput[];
  backupRestoreEvidenceValidation?: BackupRestoreEvidenceValidationInput;
  cleanCheckoutEvidenceValidation?: CleanCheckoutEvidenceValidationInput;
  dependencyReviewEvidenceValidation?: DependencyReviewEvidenceValidationInput;
  securityReviewEvidenceValidation?: SecurityReviewEvidenceValidationInput;
  trustlessBurnEvidenceValidation?: TrustlessBurnEvidenceValidationInput;
  benchmarkEvidenceValidation?: BenchmarkEvidenceValidationInput;
  operatorReadinessEvidenceValidation?: OperatorReadinessEvidenceValidationInput;
  committeeGovernanceEvidenceValidation?: CommitteeGovernanceEvidenceValidationInput;
  externalIntegrationEvidenceValidation?: ExternalIntegrationEvidenceValidationInput;
  technicalAddendumEvidenceValidation?: TechnicalAddendumEvidenceValidationInput;
  releaseNotesValidation?: ReleaseNotesValidationInput;
  threatModelEvidenceValidation?: ThreatModelEvidenceValidationInput;
}

const NON_BROADCAST_AGGREGATE_CHECK_COMMANDS = new Set([
  'check',
  'check-batch',
  'check-with-ingest',
  'check-anchored',
]);

const ANCHORED_AGGREGATE_CHECK_COMMANDS = new Set([
  'check-batch',
  'check-with-ingest',
  'check-anchored',
]);

const TESTNET_REHEARSAL_LIVE_PREFLIGHT_EVIDENCE_TERMS = [
  'rehearsal:external-fee-live-preflight producer',
  'distinct rehearsal:external-fee-live-preflight transcript/report',
  'rehearsal:external-fee-live-preflight PASS output',
  'external-fee live-preflight input target',
  'external-fee live-preflight approvals file target',
  'external-fee live-preflight target binding names the completed live rehearsal target',
  'Settlement profile ID = authenticated-external-fee-v1',
  'Profile activation status = ACTIVATED',
  'Evidence purpose = gate3-lifecycle-closure',
  'Legacy V1 transport = quarantined',
  'Activation evidence target',
  'same Expected transaction ID',
  'reviewer approval evidence',
  'user explicit live broadcast approval evidence',
  'scoped shell evidence',
  'scoped BRIDGE_BROADCAST_ENABLED=true evidence',
  'post-enable demo:readiness PASS evidence',
  'Broadcast policy PASS evidence',
  'Live settlement signing PASS evidence',
  'broadcast network reconfirmation evidence',
  'Node URL',
  'Ergo node network testnet',
  'Sidechain network non-mainnet',
];

const LIVE_PREFLIGHT_FALSE_BOUNDARY_FIELDS = [
  'reportAuthorizesBroadcast',
  'liveSubmitPerformed',
  'confirmationObserved',
  'reconciliationPerformed',
  'gate3ClosureAllowed',
  'productionReadyClaimAllowed',
  'testnetProductionCandidateClaimAllowed',
] as const;

const LIVE_PREFLIGHT_LINKED_AUTHORIZATION_FIELDS = [
  'reviewerApproval',
  'userApproval',
  'scopedBroadcastShell',
  'readinessAfterEnable',
  'broadcastPolicyPass',
  'liveSettlementReadinessPass',
  'networkReconfirmation',
] as const;

const POST_SUBMIT_FALSE_BOUNDARY_FIELDS = [
  'signs',
  'submits',
  'confirms',
  'reconciles',
  'authorizesBroadcast',
  'gate3ClosureAllowed',
  'productionReadyClaimAllowed',
  'testnetProductionCandidateClaimAllowed',
] as const;

const PREP_BUNDLE_FALSE_GATE_BOUNDARY_FIELDS = [
  'gate3ClosureAllowed',
  'productionReadyClaimAllowed',
  'testnetProductionCandidateClaimAllowed',
  'broadcastAuthorized',
  'signingPerformed',
  'liveSubmitPerformed',
  'confirmationObserved',
  'reconciliationPerformed',
  'nodeMutationPerformed',
] as const;

const PREP_BUNDLE_PREPARED_COMMAND_LABELS = [
  'prebroadcast-doctor',
  'rehearsal-preflight',
  'testnet-window-prep',
  'fresh-testnet-check',
  'offline-gate',
  'live-rehearsal-draft',
  'legacy-v1-live-preflight-quarantine',
] as const;

const PREP_BUNDLE_NEXT_HANDOFF_REQUIRED_EVIDENCE = [
  'reviewed separately versioned external-fee profile identity',
  'exact target-node acceptance evidence',
  'on-chain funds-authority transition evidence',
  'legacy route and vault retirement evidence',
  'cross-profile replay-lineage and cutover evidence',
] as const;

const PREP_BUNDLE_NEXT_HANDOFF_FORBIDDEN_BEFORE_USE = [
  'legacy V1 signing',
  'legacy V1 broadcast',
  'legacy V1 submit',
  'approval as funds authority',
  'diagnostic Expected transaction ID as funds authority',
  'Gate 3 closure',
  'claim escalation',
] as const;
const LEGACY_V1_SUBMISSION_STATUS = `BLOCKED: ${LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE}`;

const RECOVERY_OBSERVE_FALSE_BOUNDARY_FIELDS = [
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

const TESTNET_REHEARSAL_ASSEMBLY_EVIDENCE_TERMS = [
  'Rehearsal Assembly Evidence',
  'structured assembly report JSON target binding',
  'Assembly status: post-submit evidence included',
  'completed Draft source target',
  'completed External-fee live-preflight source target',
  'completed Post-submit source target',
  'recovery source targets when recovery rows pass',
  '`External-fee live-preflight artifact` completed PASS output',
  'matching External-fee live-preflight Expected transaction ID',
  'Post-submit fragment: included',
  'Post-submit observe JSON report completed structured evidence',
  'Post-submit External-fee live-preflight JSON binding status GO with runtimeBroadcastEnabled false and pre-submit boundary preserved',
  'Fresh checkpoint source target',
  'Fresh checkpoint sourceBindings prove height evidence source provenance with live read-only `/info` plus `getBlockNumber` and concrete read-only `ergoNodeUrl`/`sidechainRpcUrl` endpoint bindings, or a concrete provided-json target; singleton source provenance with concrete read-only `ergoNodeUrl` binding for live mode or concrete provided-json target when used; and anchor `live-read-only-node` provenance with concrete read-only `ergoNodeUrl` binding',
  'Fresh checkpoint lifecycle status remains publication blocker',
  'Fresh checkpoint Expected transaction ID matches dry-run',
  'Fresh checkpoint deployed-state hash matches clean deployment state',
  'Fresh checkpoint singleton freshness fresh ageSeconds and maxAgeSeconds 900',
  'Fresh checkpoint live anchor observations prove /info-bound observedAt/nodeHeight freshness and 0x0401 bridgeEventRootHex at each Ergo anchor height',
  'Fresh checkpoint boundary does not authorize broadcast, close Gate 3, replace live submit/confirmation/reconciliation, or support release claim escalation',
];

const TESTNET_REHEARSAL_POST_SUBMIT_OBSERVE_EVIDENCE_TERMS = [
  'npm run rehearsal:post-submit:observe',
  'distinct rehearsal:post-submit:observe transcript/report',
  'rehearsal:post-submit:observe PASS output',
  'rehearsal:post-submit:observe --json-out structured report',
  'post-submit observe JSON report completed structured evidence',
  'same submitted/Expected transaction ID',
  'SPV tracker successor output OUTPUTS(0)',
  'Aggregate DUP successor output OUTPUTS(1)',
  'positional recipient payout binding',
  'canonical miner fee output',
];

const TESTNET_RECOVERY_OBSERVE_JSON_EVIDENCE_TERMS = [
  'npm run rehearsal:recovery-observe',
  'npm run rehearsal:recovery-observe:validate',
  'recovery-observe JSON validation PASS',
  'structured recovery observation PASS evidence',
  'completed observation artifact',
  'sourceBindings',
  'live-read-only-node source',
  'read-only state-tracker source',
  'runtime path not serialized',
  '`observationBoundary` with read-only node/state observation',
  'signing/broadcast/submit/repair/state mutation/reconciliation/Gate 3 closure/claim escalation all false',
];

const RECOVERY_OBSERVE_ROW_KINDS: Record<string, TestnetRecoveryDrillKind> = {
  'Failed broadcast / phantom AVL recovery drill': 'failed-broadcast-phantom-avl',
  'Reorged burn and stale singleton recovery drill': 'reorged-burn-stale-singleton',
};
const SUPPORTED_RECOVERY_OBSERVE_KINDS = new Set<TestnetRecoveryDrillKind>(
  Object.values(RECOVERY_OBSERVE_ROW_KINDS),
);

export const REQUIRED_PENDING_EVIDENCE_ROWS: RequiredPendingEvidenceRow[] = [
  {
    gate: 'Gate 1',
    item: 'Green CI on the final branch',
    unresolvedStatus: 'Pending evidence',
    requiredResolutionTerms: [
      'Clean Checkout Evidence Template',
      'npm run ci:validate',
      'completed clean checkout evidence',
      'clean checkout validation target',
      'command-specific clean-checkout output evidence',
      'npm ci',
      'npm run check',
      'npm run wasm:test',
      'Release gate structural issues = 0',
      'git hygiene',
      'CI workflow evidence',
      'workflow fact-specific evidence',
      'final branch commit identity',
      'distinct completed evidence targets across linked command/workflow/decision rows',
      'CI reviewer sign-off matches run classification',
      'CI reviewer sign-off date is not before run classification Date',
      'Production-ready claim allowed = no',
      'publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked',
      'production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
      'reviewer decision summary',
      'release support with exact `Release supported = production deployment candidate`',
      'clean checkout CI green',
      'production-ready claim handling with exact `Production-ready claim allowed = no`',
      'internally non-contradictory clean checkout reviewer notes',
      'completed Gate 1 release-note update evidence',
      'completed Gate 1 checklist update evidence',
      'distinct completed Gate 1 release-note/checklist update evidence targets',
      'internally non-contradictory Gate 1 publication-update evidence',
    ],
  },
  {
    gate: 'Gate 2',
    item: 'Technical addendum architecture manual',
    unresolvedStatus: 'Pending evidence',
    requiredResolutionTerms: [
      'Testnet Production-Candidate Architecture Manual Template',
      'npm run addendum:validate',
      'completed technical addendum evidence',
      'technical addendum validation target',
      'release level',
      'Environment testnet',
      'structured Manual Classification with non-empty manual name',
      '7-40 character Git commit',
      'controlled testnet or production-grade testnet claim wording',
      'non-empty Architecture owner',
      'non-empty Reviewer',
      'ISO Date',
      'testnet production-candidate',
      'production-grade testnet',
      'release:gate',
      'Manual use status = candidate claim support',
      'Release gate status = pass',
      'concrete `release:gate PASS` output with Structural issues = 0 in the architecture decision evidence for testnet production-candidate wording',
      'Production-ready claim allowed = no',
      'Mainnet deployment claim allowed = no',
      'Testnet production-candidate claim allowed = yes-after-release-gate-pass',
      'architecture manual evidence',
      'structured gate-map rows',
      'gate-specific evidence',
      'completed artifact evidence',
      'bounded claim boundaries',
      'distinct completed evidence targets across linked or passed gate-map and architecture-decision rows',
      'architecture-decision rows with decision-specific positions and completed evidence',
      'actionable reviewer notes that keep claim, signer, and broadcast boundaries',
      'Architecture owner sign-off matching Manual Classification Architecture owner',
      'Security reviewer sign-off matching Manual Classification Reviewer',
      'reviewer sign-off dates not before Manual Classification Date',
      'internally non-contradictory technical addendum reviewer notes',
      'reviewer decision summary',
      'release support with exact `Release supported = production deployment candidate`',
      'production-ready claim handling',
      'testnet production-candidate claim handling',
      'signer path',
      'ergo-lib-wasm-nodejs',
      'sigma-rust',
      'node-wallet is not the production path',
      'BRIDGE_BROADCAST_ENABLED=true',
      'no transaction broadcast',
      'completed Phase 007 release-note update evidence',
      'completed Phase 007 checklist update evidence',
      'distinct completed Phase 007 release-note/checklist update evidence targets',
      'internally non-contradictory Phase 007 publication-update evidence',
    ],
  },
  {
    gate: 'Gate 3',
    item: 'Fresh local devnet lifecycle run',
    unresolvedStatus: 'Pending evidence',
    requiredResolutionTerms: [
      'Live Rehearsal Evidence Template',
      'peg-in',
      'peg-out',
      'anchor',
      'settlement check',
      'submit',
      'confirmation',
      'reconciliation',
      'Session Metadata Environment local devnet',
      'ContextExtension guard result identifies ContextExtension guard',
      'sigma-rust/JVM conformance coverage',
      'fail-closed behavior',
      'clean deployment state evidence',
      'deployment-state hash',
      'contract IDs',
      'singleton inventory',
      'concrete 32-byte deployment-state hash or digest',
      'concrete 32-byte contract ID',
      'concrete 32-byte singleton inventory identifier',
      'Current Ergo height starts with non-negative integer',
      'Current Ergo height includes completed node/RPC height artifact marker or non-template evidence link',
      'Current sidechain height starts with non-negative integer',
      'Current sidechain height includes completed node/RPC height artifact marker or non-template evidence link',
      'npm run rehearsal:validate',
      'reviewer sign-off matches session metadata',
      'reviewer sign-off date is not before session metadata Date',
      'Broadcast mode at start disabled',
      'Broadcast mode at end disabled',
      'Broadcast disabled in all shells',
      'broadcast reviewer approval names Session Metadata Reviewer',
      'explicit live broadcast approval',
      'user explicit live broadcast approval',
      'broadcast reviewer approval cites Expected transaction ID',
      '`BRIDGE_BROADCAST_ENABLED=true` scoped-shell evidence',
      'scoped-shell evidence cites BRIDGE_BROADCAST_ENABLED=true',
      'intended shell scope is limited',
      'readiness command output evidence',
      'broadcast policy output evidence',
      'Broadcast policy output',
      'live settlement readiness output evidence',
      'Live settlement signing output',
      '`npm run demo:readiness` output evidence',
      'broadcast network reconfirmation cites Node URL',
      'broadcast network reconfirmation names Session Metadata Ergo node network',
      'broadcast network reconfirmation names Session Metadata Sidechain network',
      'peg-in evidence cites peg-in event ID or TX ID',
      'peg-out burn evidence cites peg-out burn TX ID',
      'anchor evidence cites sidechain block hash',
      'anchor evidence cites bridge event root',
      'anchor evidence cites Ergo anchor height',
      '`/transactions/check` PASS output evidence',
      'settlement check evidence cites Expected transaction ID',
      'positive miner feeNanoErg amount',
      'settlement submit evidence cites submitted transaction ID',
      'confirmation evidence cites submitted transaction ID',
      'reconciliation evidence cites submitted successor and burn values',
      'submitted DUP successor box ID',
      'submitted SPV tracker successor box ID',
      'recipient payout box ID',
      'reconciliation evidence cites peg-out burn TX ID',
      'production-ready claim handling with exact `Production-ready claim allowed by this rehearsal: no`',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this rehearsal: no`',
      'completed Gate 3 rehearsal release-note update evidence',
      'completed Gate 3 checklist update evidence',
      'distinct completed Gate 3 rehearsal release-note/checklist update evidence targets',
    ],
  },
  {
    gate: 'Gate 3',
    item: 'Fresh Ergo testnet lifecycle run',
    unresolvedStatus: 'Pending evidence',
    requiredResolutionTerms: [
      'Live Rehearsal Evidence Template',
      'testnet',
      'Session Metadata Environment testnet',
      ...TESTNET_REHEARSAL_ASSEMBLY_EVIDENCE_TERMS,
      'Session Metadata Ergo node network testnet',
      'Session Metadata Ergo node network testnet with no negated, `mainnet`, `main network`, `main chain`, or `mainchain` wording',
      'not on testnet',
      'not on the testnet',
      'not using testnet',
      'not connected to testnet',
      'no testnet',
      'without testnet',
      'without the testnet',
      'Session Metadata Sidechain network identifies patched-devnet, testnet, or explicit non-mainnet sidechain network',
      'Sidechain network values must not contain `mainnet`, `main network`, `main chain`, `mainchain`, or negated testnet wording',
      'ContextExtension guard result identifies ContextExtension guard',
      'sigma-rust/JVM conformance coverage',
      'fail-closed behavior',
      'Fresh testnet lifecycle artifact cites peg-in event ID or TX ID',
      'Fresh testnet lifecycle artifact cites peg-out burn TX ID',
      'Fresh testnet lifecycle artifact cites sidechain block hash',
      'Fresh testnet lifecycle artifact cites bridge event root',
      'Fresh testnet lifecycle artifact cites Expected transaction ID',
      'Fresh testnet lifecycle artifact cites submitted transaction ID',
      'Fresh testnet lifecycle artifact cites singleton checkpoint observedAt ISO UTC',
      'Fresh testnet lifecycle artifact cites singleton checkpoint maxAgeSeconds 900',
      'Fresh testnet lifecycle artifact cites singleton checkpoint ageSeconds',
      'Fresh testnet lifecycle artifact cites singleton checkpoint freshness fresh',
      'clean deployment state evidence',
      'deployment-state hash',
      'contract IDs',
      'singleton inventory',
      'concrete 32-byte deployment-state hash or digest',
      'concrete 32-byte contract ID',
      'concrete 32-byte singleton inventory identifier',
      'Current Ergo height starts with non-negative integer',
      'Current Ergo height includes completed node/RPC height artifact marker or non-template evidence link',
      'Current sidechain height starts with non-negative integer',
      'Current sidechain height includes completed node/RPC height artifact marker or non-template evidence link',
      'npm run rehearsal:validate',
      'reviewer sign-off matches session metadata',
      'reviewer sign-off date is not before session metadata Date',
      'Broadcast mode at start disabled',
      'Broadcast mode at end disabled',
      'Broadcast disabled in all shells',
      'broadcast reviewer approval names Session Metadata Reviewer',
      'explicit live broadcast approval',
      'user explicit live broadcast approval',
      'broadcast reviewer approval cites Expected transaction ID',
      '`BRIDGE_BROADCAST_ENABLED=true` scoped-shell evidence',
      'scoped-shell evidence cites BRIDGE_BROADCAST_ENABLED=true',
      'intended shell scope is limited',
      'readiness command output evidence',
      'broadcast policy output evidence',
      'Broadcast policy output',
      'live settlement readiness output evidence',
      'Live settlement signing output',
      '`npm run demo:readiness` output evidence',
      'broadcast network reconfirmation cites Node URL',
      'broadcast network reconfirmation names Session Metadata Ergo node network',
      'broadcast network reconfirmation names Session Metadata Sidechain network',
      'peg-in evidence cites peg-in event ID or TX ID',
      'peg-out burn evidence cites peg-out burn TX ID',
      'anchor evidence cites sidechain block hash',
      'anchor evidence cites bridge event root',
      'anchor evidence cites Ergo anchor height',
      '`/transactions/check` PASS output evidence',
      'settlement check evidence cites Expected transaction ID',
      ...TESTNET_REHEARSAL_LIVE_PREFLIGHT_EVIDENCE_TERMS,
      'positive miner feeNanoErg amount',
      'settlement submit evidence cites submitted transaction ID',
      'confirmation evidence cites submitted transaction ID',
      'required confirmation count',
      'confirmation policy met',
      'confirmation policy met cites confirmationsRequired',
      'confirmation policy met cites confirmationsObserved',
      'confirmation policy met cites submitted transaction ID',
      'observed confirmation count greater than or equal to required confirmation count',
      'confirmation policy met links completed finality evidence',
      ...TESTNET_REHEARSAL_POST_SUBMIT_OBSERVE_EVIDENCE_TERMS,
      'reconciliation evidence cites submitted successor and burn values',
      'submitted DUP successor box ID',
      'submitted SPV tracker successor box ID',
      'recipient payout box ID',
      'reconciliation evidence cites peg-out burn TX ID',
      'production-ready claim handling with exact `Production-ready claim allowed by this rehearsal: no`',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this rehearsal: no`',
      'completed Gate 3 rehearsal release-note update evidence',
      'completed Gate 3 checklist update evidence',
      'distinct completed Gate 3 rehearsal release-note/checklist update evidence targets',
    ],
  },
  {
    gate: 'Gate 3',
    item: 'Failed broadcast / phantom AVL recovery drill',
    unresolvedStatus: 'Pending evidence',
    requiredResolutionTerms: [
      'Live Rehearsal Evidence Template',
      'failed broadcast',
      'phantom DUP',
      'AVL history',
      'does not insert phantom DUP or AVL history',
      'failed-broadcast evidence cites Expected transaction ID',
      'failed-broadcast evidence cites peg-out burn TX ID',
      'failed-broadcast evidence includes aggregate settlement attempt bound to Expected transaction ID',
      'failed-broadcast evidence includes peg-out state bound to peg-out burn TX ID',
      ...TESTNET_RECOVERY_OBSERVE_JSON_EVIDENCE_TERMS,
      'npm run rehearsal:validate',
      'reviewer sign-off matches session metadata',
      'reviewer sign-off date is not before session metadata Date',
      'Broadcast mode at start disabled',
      'Broadcast mode at end disabled',
      'Broadcast disabled in all shells',
      'production-ready claim handling with exact `Production-ready claim allowed by this rehearsal: no`',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this rehearsal: no`',
      'completed Gate 3 rehearsal release-note update evidence',
      'completed Gate 3 checklist update evidence',
      'distinct completed Gate 3 rehearsal release-note/checklist update evidence targets',
    ],
  },
  {
    gate: 'Gate 3',
    item: 'Reorged burn and stale singleton recovery drill',
    unresolvedStatus: 'Pending evidence',
    requiredResolutionTerms: [
      'Live Rehearsal Evidence Template',
      'reorged burns',
      'stale singleton boxes',
      'detected',
      'recoverable',
      'reorged-burn evidence cites peg-out burn TX ID',
      'stale-singleton evidence cites singleton inventory identifier',
      ...TESTNET_RECOVERY_OBSERVE_JSON_EVIDENCE_TERMS,
      'npm run rehearsal:validate',
      'reviewer sign-off matches session metadata',
      'reviewer sign-off date is not before session metadata Date',
      'Broadcast mode at start disabled',
      'Broadcast mode at end disabled',
      'Broadcast disabled in all shells',
      'production-ready claim handling with exact `Production-ready claim allowed by this rehearsal: no`',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this rehearsal: no`',
      'completed Gate 3 rehearsal release-note update evidence',
      'completed Gate 3 checklist update evidence',
      'distinct completed Gate 3 rehearsal release-note/checklist update evidence targets',
    ],
  },
  {
    gate: 'Gate 3',
    item: 'Backup-restore or reconstructibility drill',
    unresolvedStatus: 'Pending evidence',
    requiredResolutionTerms: [
      'Backup Restore Evidence Template',
      'npm run backup:validate',
      'SQLite restore',
      'command-specific evidence',
      'local SQLite snapshots',
      'npm run backup:snapshot',
      'local snapshot comparison',
      'npm run backup:compare',
      'distinct pre-backup and restored JSON artifacts',
      'restored snapshot generated after pre-backup snapshot',
      'backup:snapshot schema metadata',
      'schemaVersion',
      'snapshotSchemaVersions',
      'measured snapshot value formats',
      'snapshot evidenceRows match measured values',
      'state-specific consistency evidence',
      'state evidence cites measured pre-backup/restored values',
      'restore target isolation or reviewer approval',
      'reviewer approval evidence',
      'completed reviewer approval evidence',
      'live or runtime restore target review evidence',
      'rollback plan evidence',
      'DUP AVL rebuild',
      'SPV tracker rebuild',
      'anchor preservation',
      'DUP singleton digest comparison or incident classification',
      'SPV tracker singleton digest comparison or incident classification',
      'concrete DUP singleton ID or digest',
      'concrete SPV tracker singleton ID or digest',
      'boundary-specific reconstructibility evidence',
      'boundary-specific reconstructibility checks',
      'stop-condition classifications',
      'condition-specific stop-condition evidence',
      'reviewer sign-off',
      'internally non-contradictory reviewer notes',
      'restore operator sign-off matches drill classification',
      'restore operator sign-off date is not before drill classification Date',
      'production-ready claim handling with exact `Production-ready claim allowed by this drill: no`',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this drill: no`',
      'completed Gate 3 backup-restore release-note update evidence',
      'completed Gate 3 backup-restore checklist update evidence',
      'distinct completed Gate 3 backup-restore release-note/checklist update evidence targets',
      'backup-restore git hygiene evidence',
      'git hygiene',
      'git status --short',
      'git diff --check',
      'no staged runtime artifacts',
    ],
  },
  {
    gate: 'Gate 4',
    item: 'Independent security review report',
    unresolvedStatus: 'Pending evidence',
    requiredResolutionTerms: [
      'Independent Security Review Evidence Template',
      'npm run security:validate',
      'completed independent security review evidence',
      'security review validation target',
      'required scope coverage',
      'required evidence package',
      'item-specific evidence-package artifact links',
      'finding disposition',
      'required negative review checks',
      'question-specific negative-check evidence',
      'distinct completed evidence targets across linked scope, evidence-package, finding, and negative-check rows',
      'contracts',
      'relayer signing',
      'AVL proof generation',
      'sidechain finality',
      'operator recovery',
      'dependency risk',
      'external reviewer organization type',
      'specific external security reviewer organization or affiliation',
      'ISO review period',
      'final security decision handling with exact `Final decision = approve`',
      'critical/high finding closure with exact `Critical/high findings open = 0`',
      'publication blocker closure with exact `Publication blockers = 0`',
      'Production-ready claim allowed = no',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
      'production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`',
      'production deployment candidate support requires exact `Environment` value `testnet`',
      'accepted-risk release-note handling with exact `Accepted risks reflected in release notes = yes`',
      'accepted-risk checklist updates',
      'accepted-risk release-note updates',
      'completed Gate 4 accepted-risk checklist update evidence',
      'completed Gate 4 accepted-risk release-note update evidence',
      'distinct completed Gate 4 accepted-risk checklist/release-note update evidence targets',
      'publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked',
      'reviewer decision summary',
      'release support with exact `Release supported = production deployment candidate`',
      'production-ready claim handling with exact `Production-ready claim allowed = no`',
      'critical/high findings',
      'accepted risks',
      'area-specific risk-focus notes',
      'lead reviewer binding',
      'reviewer notes that keep finding and accepted-risk boundaries',
      'internally non-contradictory security reviewer notes',
      'internally non-contradictory security publication-update evidence',
      'lead reviewer sign-off matches classification',
      'lead reviewer sign-off date is not before review classification Date',
    ],
  },
  {
    gate: 'Gate 4',
    item: 'Signer dependency conformance or fail-closed release decision',
    unresolvedStatus: 'Open blocker',
    requiredResolutionTerms: [
      'Dependency Review Evidence Template',
      'npm run dependency:validate',
      'completed dependency review evidence',
      'dependency review validation target',
      'Dependency Risk Register',
      'ergo-lib-wasm-nodejs',
      'sigma-rust ContextExtension serializer',
      'upstream signer release',
      'upstream signer release validation',
      'concrete upstream release identifier',
      'JVM/node conformance evidence',
      'fail-closed guard/blocker rationale',
      'explicit fail-closed guard/blocker release-action evidence',
      'completed ContextExtension guard evidence',
      'JVM golden vectors',
      'positive JVM golden vectors',
      'live /transactions/check',
      'production-ready claims blocked',
      'production-ready claims blocked until upstream signer release is validated',
      'testnet production-candidate claims blocked until upstream signer release is validated',
      'production deployment candidate support requires exact `Upstream signer blocker resolved = yes` and exact `Testnet production-candidate claim allowed = yes`',
      'production deployment candidate support requires exact `Environment` value `testnet`',
      'Production-ready claim allowed = no',
      'publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = no`',
      'Critical/high vulnerabilities open = 0',
      'upstream signer blocker handling with exact `Upstream signer blocker resolved = no`',
      'Release notes updated = yes',
      'reviewer decision summary',
      'release support with exact `Release supported = institutional reference`',
      'production-ready claim handling with exact `Production-ready claim allowed = no`',
      'critical/high vulnerabilities',
      'critical/high vulnerability closure',
      'vulnerability triage',
      'no positive critical/high finding counts',
      'internally non-contradictory linked dependency scope, vulnerability triage, and upgrade evidence',
      'dependency reviewer notes that keep signer and vulnerability boundaries',
      'internally non-contradictory dependency reviewer notes',
      'dependency reviewer sign-off matches classification',
      'dependency reviewer sign-off date is not before review classification Date',
      'completed dependency-review release-note update evidence',
      'completed dependency review checklist update evidence',
      'distinct completed dependency-review release-note/checklist update evidence targets',
      'internally non-contradictory dependency publication-update evidence',
    ],
  },
  {
    gate: 'Gate 5',
    item: 'Trustless burn verification path',
    unresolvedStatus: 'Open blocker',
    requiredResolutionTerms: [
      'Trustless Burn Verification Evidence Template',
      'npm run trustless:validate',
      'completed trustless burn evidence',
      'trustless burn validation target',
      'sidechain commitment',
      'SPV relay',
      'burn inclusion proof',
      'DUP binding',
      'Local Proof Vector evidence validated by `trustless-burn-proof.ts`',
      'linked completed `Proof-vector validation report` JSON target consumed by `npm run trustless:validate`',
      'Proof-vector validation report target is not reused as completed row or publication-update evidence',
      'structured fail-closed local negative cases in the checked proof vector',
      'local proof-core negative rows citing matching `negativeCase` names and observed proof-core rejection strings',
      'positive proof acceptance evidence',
      'instance-specific positive proof evidence',
      'positive proof instance values match commitment and burn binding rows',
      'bridgeEventRoot',
      'broadcast mode disabled or dry-run',
      'concrete 32-byte commitment and burn identifiers',
      'numeric heights and indices',
      'positive amountNanoErg burn amount',
      'component-specific trustless properties',
      'distinct completed evidence targets across linked component/commitment/burn-proof/positive/negative rows',
      'completed row evidence that is not a `trustless burn validation target` / `validated target` binding',
      'internally non-contradictory component, commitment, burn-proof, positive-proof, negative-test, publication-update, and reviewer row payloads',
      'negative tests',
      'instance-specific negative proof evidence',
      'concrete 32-byte rejected proof or burn identifiers',
      'unfinalized sidechain block rejection',
      'independent review',
      'reviewer notes that keep claim/protocol boundaries and do not approve trusted fallback wording',
      'reviewer decision summary',
      'release support with exact `Release supported = production deployment candidate`',
      'trustless burn implementation handling with exact `Trustless burn verification implemented = yes`',
      'Production-ready claim allowed = no',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
      'production-ready claim handling with exact `Production-ready claim allowed = no`',
      'transitional trusted burn path handling with exact `Transitional trusted burn path disabled = yes`',
      'critical/high finding closure with exact `Critical/high findings open = 0`',
      'protocol reviewer sign-off matches evidence classification',
      'protocol reviewer sign-off date is not before evidence classification Date',
      'production deployment candidate evidence requires exact `Testnet production-candidate claim allowed = yes`',
      'mandatory transitional-path publication-update binding',
      'publication-update fields must include exact `Trustless burn verification implemented = yes` when trustless burn verification is implemented',
      'publication-update fields must include exact `Release supported = production deployment candidate` when Gate 5 `Release level = production deployment candidate`',
      'publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked',
      'publication-update fields must include exact `Testnet production-candidate claim allowed = yes` when the testnet candidate claim is allowed',
      'publication-update fields must include exact `Transitional trusted burn path disabled = yes` when Gate 5 `Transitional trusted burn path disabled = yes`',
      'publication-update fields must include exact `Critical/high findings open = 0` when Gate 5 `Critical/high findings open = 0`',
      'Release notes updated = yes',
      'completed Gate 5 release-note update evidence',
      'completed Gate 5 checklist update evidence',
      'distinct completed Gate 5 checklist/release-note update evidence targets',
    ],
  },
  {
    gate: 'Gate 6',
    item: 'Committee governance and key-rotation drill',
    unresolvedStatus: 'Open blocker',
    requiredResolutionTerms: [
      'Committee Governance Evidence Template',
      'npm run governance:validate',
      'completed committee governance evidence',
      'governance validation target',
      'governance',
      'key rotation',
      'command-specific governance command evidence',
      'internally positive command output',
      'concrete public key/hash identifiers',
      'disjoint old/new committee identifiers',
      'committee threshold policy',
      'distinct completed evidence targets across linked scope, command, rotation, positive, and negative rows',
      'step-specific rotation evidence',
      'step-specific rotation facts',
      'positive new-committee operation evidence',
      'threshold-specific positive signer identifiers',
      'declared new-committee positive signer identifiers',
      'negative signer identifiers',
      'actionable stop conditions',
      'member-loss',
      'incident drills',
      'structured Drill Classification with 7-40 character Git commit',
      'Release level = production deployment candidate',
      'Environment = testnet',
      'broadcast mode disabled or dry-run',
      'governance model identifying committee or multisig governance',
      'threshold at least 2',
      'member count at least 3',
      'threshold lower than member count',
      'non-empty reviewer',
      'ISO Date',
      'enabled broadcast mode blocked for Gate 6',
      'production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`',
      'production deployment candidate support requires exact `Environment` value `testnet`',
      'Production-ready claim allowed = no',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
      'governance-ready claim handling with exact `Governance-ready claim allowed = yes`',
      'open governance blocker handling with exact `Open governance blockers = 0`',
      'Release notes updated = yes',
      'reviewer decision summary',
      'release support with exact `Release supported = production deployment candidate`',
      'production-ready claim handling with exact `Production-ready claim allowed = no`',
      'single-signer governance not approved in reviewer summary',
      'actionable reviewer notes that keep governance boundaries and do not approve open blockers or single-signer fallback',
      'internally non-contradictory governance reviewer notes',
      'governance owner sign-off matches drill classification',
      'governance owner sign-off date is not before drill classification Date',
      'completed Gate 6 governance release-note update evidence',
      'completed Gate 6 governance checklist update evidence',
      'distinct completed Gate 6 governance release-note/checklist update evidence targets',
      'internally non-contradictory governance publication-update evidence',
      'completed Gate 6 governance external review evidence',
      'external review evidence must include exact `Governance-ready claim allowed = yes` binding',
      'external review evidence must include exact `Release supported = production deployment candidate` binding',
      'external review evidence must include exact `Testnet production-candidate claim allowed = yes` binding',
      'distinct completed Gate 6 governance external review evidence target from release-note/checklist update evidence targets',
    ],
  },
  {
    gate: 'Gate 6',
    item: 'Operator readiness evidence',
    unresolvedStatus: 'Pending evidence',
    requiredResolutionTerms: [
      'Operator Readiness Evidence Template',
      'npm run operator:validate',
      'completed operator readiness evidence',
      'operator readiness validation target',
      'linked runbook coverage',
      'runbook evidence cells state stop-condition and verification-command checks',
      'command-specific operator command evidence',
      'internally positive command output',
      'recovery drills',
      'operational decisions',
      'decision-specific operational evidence',
      'actionable stop conditions',
      'distinct completed evidence targets across linked runbook, command, drill, and decision rows',
      'completed row evidence that is not an `operator readiness validation target` / `validated target` binding',
      'structured Readiness Classification with 7-40 character Git commit',
      'Release level = production deployment candidate',
      'Environment = testnet',
      'broadcast mode disabled or dry-run',
      'Operator type = external operator or exchange operations reviewer',
      'non-empty reviewer',
      'ISO Date',
      'enabled broadcast mode blocked for Gate 6 operator readiness evidence',
      'release support with exact `Release supported = production deployment candidate`',
      'production deployment candidate support requires exact `Operator-ready claim allowed = yes` and exact `Testnet production-candidate claim allowed = yes`',
      'production deployment candidate support requires exact `Environment` value `testnet`',
      'Production-ready claim allowed = no',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
      'operator-ready claim handling with exact `Operator-ready claim allowed = yes`',
      'publication-update fields must include exact `Production-ready claim allowed = no` when production-ready claims are blocked',
      'critical incident closure with exact `Critical incidents open = 0`',
      'Release notes updated = yes',
      'reviewer decision summary',
      'production-ready claim handling with exact `Production-ready claim allowed = no`',
      'critical incidents',
      'actionable reviewer notes that keep operator boundaries and do not approve open critical incidents or non-opt-in broadcast enablement',
      'internally non-contradictory operator reviewer notes',
      'runbook operator sign-off matches readiness classification',
      'runbook operator sign-off date is not before readiness classification Date',
      'completed operator-readiness release-note update evidence',
      'completed operator-readiness checklist update evidence',
      'distinct completed operator-readiness release-note/checklist update evidence targets',
      'internally non-contradictory operator-readiness publication-update evidence',
    ],
  },
  {
    gate: 'Gate 7',
    item: 'Single, batch, and sharded benchmark evidence',
    unresolvedStatus: 'Pending evidence',
    requiredResolutionTerms: [
      'Performance Benchmark Evidence Template',
      'npm run benchmark:validate',
      'completed benchmark evidence',
      'benchmark validation target',
      'command-specific benchmark command output evidence',
      'single settlement',
      'batch settlement',
      'sharded lanes',
      'positive numeric benchmark measurements',
      'positive cost-relevant counts',
      'exactly one positive cost count per key',
      'scenario-specific metric evidence',
      'scenario-specific single/batch/sharded metric evidence',
      'distinct completed evidence targets across linked command/metric/sharded-lane/bottleneck rows',
      'live batch evidence',
      'user explicit live broadcast approval evidence',
      'Expected transaction ID binding',
      'scoped BRIDGE_BROADCAST_ENABLED=true evidence',
      'post-enable demo:readiness PASS evidence',
      'Broadcast policy PASS evidence',
      'Live settlement signing PASS evidence',
      'broadcast network reconfirmation evidence',
      'concrete 32-byte live batch transaction identifier',
      'submitted live-batch transaction ID matching Expected transaction ID',
      'sharded-lane evidence',
      'statement-specific sharded-lane evidence',
      'structured Benchmark Classification with 7-40 character Git commit',
      'Benchmark Classification Environment testnet',
      'Trust path trustless burn proof path',
      'benchmark environment metadata',
      'non-empty reviewer',
      'ISO Date',
      'structured benchmark claims boundary arrays with all required allowed and blocked claims',
      'sample counts bound by metric evidence',
      'cost-relevant counts bound by metric evidence',
      'concrete bottleneck scaling limits',
      'bottleneck-specific completed evidence with impact and next action',
      'production deployment candidate support requires exact `Testnet production-candidate claim allowed = yes`',
      'production deployment candidate support requires exact `Environment` value `testnet`',
      'linked Live batch settlement evidence requires Broadcast mode enabled with approval/boundary evidence',
      'production-ready benchmark claims are always blocked for mainnet',
      'production throughput claims remain blocked for Gate 7 evidence',
      'full parallel L1 settlement not approved while SPVTracker remains shared',
      'scaling-claim allowance with exact `Scaling claims allowed = yes`',
      'Production-ready claim allowed = no',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
      'production throughput claim handling with exact `Production throughput claim allowed = no`',
      'exact `Mainnet-grade evidence linked = no`',
      'open benchmark blocker handling with exact `Open benchmark blockers = 0`',
      'Release notes updated = yes',
      'reviewer decision summary',
      'release support with exact `Release supported = production deployment candidate`',
      'measured single/batch/sharded evidence',
      'production-ready claim handling with exact `Production-ready claim allowed = no`',
      'actionable benchmark reviewer notes that keep the publication claim boundary and do not approve broader benchmark throughput or full parallel L1 settlement wording',
      'benchmark owner sign-off matches benchmark classification',
      'benchmark owner sign-off date is not before benchmark classification Date',
      'internally non-contradictory benchmark reviewer notes',
      'completed Gate 7 benchmark release-note update evidence',
      'completed Gate 7 benchmark checklist update evidence',
      'distinct completed Gate 7 benchmark release-note/checklist update evidence targets',
      'internally non-contradictory benchmark command, metric, sharded-lane, bottleneck, live-readiness, and publication-update evidence',
    ],
  },
  {
    gate: 'Gate 8',
    item: 'External integration package review',
    unresolvedStatus: 'Pending evidence',
    requiredResolutionTerms: [
      'External Integration Review Template',
      'npm run integration:validate',
      'fresh reviewer',
      'required entry points',
      'completed external integration evidence',
      'integration validation target',
      'completed entry-point review evidence beyond document links',
      'distinct completed evidence targets across linked entry-point, fresh-checkout, decision, and negative-review rows',
      'integration decision record',
      'decision-specific evidence',
      'negative review checks',
      'per-command fresh checkout command output evidence',
      'per-command fresh checkout exit code 0 output evidence',
      'per-command fresh or clean checkout context evidence',
      'per-command fresh checkout commit identity',
      'docs',
      'without private maintainer context',
      'reviewer organization',
      'specific reviewer organization or affiliation',
      'Private maintainer context used = no',
      'broadcast mode disabled or dry-run',
      'enabled broadcast mode blocked for Gate 8',
      'production deployment candidate classification requires Environment used = testnet',
      'public institutional-reference release decision',
      'Public institutional-reference release allowed = yes',
      'public institutional-reference release handling with exact `Public institutional-reference release allowed = yes`',
      'production-ready claim handling with exact `Production-ready claim allowed = no`',
      'Production-ready claim allowed = no',
      'Testnet production-candidate claim allowed',
      'Testnet production-candidate claim allowed = no for institutional-reference reviews or yes only for testnet-scoped production deployment candidate reviews',
      'blocked or allowed testnet production-candidate claim handling bound to that field',
      'reviewer decision summary',
      'reviewer notes that do not approve production-ready or mainnet production wording',
      'internally non-contradictory external integration reviewer notes',
      'mainnet release-readiness claims remain forbidden or out of scope',
      'only testnet production-candidate or production-grade testnet claims can be evaluated with complete evidence',
      'integration reviewer sign-off matches review classification',
      'integration reviewer sign-off date is not before review classification Date',
      'completed Gate 8 integration release-note update evidence',
      'completed Gate 8 checklist update evidence',
      'distinct completed Gate 8 integration release-note/checklist update evidence targets',
      'internally non-contradictory linked entry-point, decision, negative-review, fresh-checkout, and publication-update evidence',
    ],
  },
];

const REQUIRED_PENDING_EVIDENCE_BY_ITEM = new Map(
  REQUIRED_PENDING_EVIDENCE_ROWS.map(row => [row.item, row]),
);

const ALLOWED_STATUSES = new Set<ReleaseEvidenceStatus>([
  'Checked',
  'Pending evidence',
  'Open blocker',
]);
const REQUIRED_RELEASE_DECISION_FIELDS = [
  'Proposed release level',
  'Final decision',
  'Public release allowed',
  'Production-ready claims allowed',
  'Testnet production-candidate claims allowed',
  'Unresolved publication blockers',
  'Release notes status',
  'Release notes artifact',
];
const REQUIRED_RELEASE_DECISION_HEADER = ['Field', 'Value'];
const ALLOWED_RELEASE_LEVELS = new Set([
  'blocked',
  'validated PoC',
  'institutional reference',
  'production deployment candidate',
]);
const ALLOWED_FINAL_DECISIONS = new Set(['blocked', 'proposed', 'approved']);
const ALLOWED_YES_NO = new Set(['yes', 'no']);
const ALLOWED_RELEASE_NOTES_STATUS = new Set(['not ready', 'drafted', 'validated', 'linked']);

function parseMarkdownTableLine(line: string): string[] {
  const trimmed = line.trim();
  return trimmed
    .slice(1, -1)
    .split('|')
    .map(cell => cell.trim());
}

function parseMarkdownTableRows(table: string): string[][] {
  return table
    .split(/\r?\n/)
    .filter(line => line.startsWith('|'))
    .filter(line => !/^\|\s*-/.test(line))
    .slice(1)
    .map(parseMarkdownTableLine);
}

export function parsePendingEvidenceRegister(markdown: string): PendingEvidenceRow[] {
  const tableStart = markdown.indexOf(
    '| Gate | Pending evidence or blocker | Status | Publication effect | Required resolution |',
  );
  const tableEnd = markdown.indexOf('## Release Decision');

  if (tableStart < 0 || tableEnd < 0 || tableEnd <= tableStart) {
    throw new Error('Pending Evidence Register table not found before Release Decision');
  }

  return parseMarkdownTableRows(markdown.slice(tableStart, tableEnd)).map(row => {
    if (row.length !== 5) {
      throw new Error(`Malformed Pending Evidence Register row: ${row.join(' | ')}`);
    }

    return {
      gate: row[0],
      item: row[1],
      status: row[2],
      publicationEffect: row[3],
      requiredResolution: row[4],
    };
  });
}

export function parseReleaseDecision(markdown: string): Partial<ReleaseDecisionFields> {
  const fields = parseTwoColumnTable(sectionBetween(markdown, '## Release Decision', 'Executable local guard:'));
  return {
    proposedReleaseLevel: fields.get('Proposed release level'),
    finalDecision: fields.get('Final decision'),
    publicReleaseAllowed: fields.get('Public release allowed'),
    productionReadyClaimsAllowed: fields.get('Production-ready claims allowed'),
    testnetProductionCandidateClaimsAllowed: fields.get('Testnet production-candidate claims allowed'),
    unresolvedPublicationBlockers: fields.get('Unresolved publication blockers'),
    releaseNotesStatus: fields.get('Release notes status'),
    releaseNotesArtifact: fields.get('Release notes artifact'),
  };
}

export function evaluateReleaseGate(markdown: string, options: ReleaseGateEvaluationOptions = {}): ReleaseGateResult {
  const rows = parsePendingEvidenceRegister(markdown);
  const blockers = rows.filter(row => {
    const unresolved = row.status !== 'Checked';
    const blocksPublication = /\bPublication blocker\b/.test(row.publicationEffect);
    return unresolved && blocksPublication;
  });
  const decision = parseReleaseDecision(markdown);
  const issues = [
    ...validateReleaseGateEvidenceTargetSet(options),
    ...validateReleaseGateValidationOutputTargetSet(rows, decision),
    ...validateRecoveryObserveJsonValidationSet(options),
    ...validateRequiredPendingEvidenceRows(rows),
    ...rows.flatMap(row => validatePendingEvidenceRow(row, options)),
    ...validateReleaseDecision(markdown, decision, blockers, rows, options),
  ];

  if (blockers.length > 0 || issues.length > 0) {
    return {
      status: 'BLOCKED',
      blockers,
      decision,
      issues,
      rowCount: rows.length,
      message:
        `Release gate BLOCKED: ${blockers.length}/${rows.length} pending evidence rows ` +
        `still block publication; ${issues.length} structural issue(s).`,
    };
  }

  return {
    status: 'PASS',
    blockers: [],
    decision,
    issues: [],
    rowCount: rows.length,
    message: `Release gate PASS: ${rows.length} pending evidence rows are resolved; Structural issues = 0.`,
  };
}

function validatePendingEvidenceRow(row: PendingEvidenceRow, options: ReleaseGateEvaluationOptions): string[] {
  const issues: string[] = [];
  const requiredBlocker = REQUIRED_PENDING_EVIDENCE_BY_ITEM.get(row.item);
  const isRequiredBlocker = requiredBlocker !== undefined;
  const blocksPublication = /\bPublication blocker\b/.test(row.publicationEffect);
  const hasRequiredResolutionMarker = hasEvidenceMarker(row.requiredResolution);
  const hasCompletedEvidence = hasCompletedEvidenceMarker(row.requiredResolution);

  if (!ALLOWED_STATUSES.has(row.status as ReleaseEvidenceStatus)) {
    issues.push(`${row.gate}: ${row.item}: unknown status "${row.status}"`);
  }

  for (const [label, value] of [
    ['gate', row.gate],
    ['item', row.item],
    ['status', row.status],
    ['publication effect', row.publicationEffect],
    ['required resolution', row.requiredResolution],
  ] as const) {
    if (value.trim().length === 0) {
      issues.push(`${row.gate}: ${row.item}: empty ${label}`);
    }
  }

  if (hasAbsoluteSecurityClaim(row.publicationEffect)) {
    issues.push(`${row.gate}: ${row.item}: publication effect must not include absolute security wording`);
  }
  if (hasAbsoluteSecurityClaim(row.requiredResolution)) {
    issues.push(`${row.gate}: ${row.item}: required resolution must not include absolute security wording`);
  }
  issues.push(
    ...validateEvidenceHygiene(row.publicationEffect, `${row.gate}: ${row.item}: publication effect`),
  );
  issues.push(
    ...validateReleaseGatePublicationClaimBoundary(
      `${row.gate}: ${row.item}: publication effect`,
      row.publicationEffect,
    ),
  );
  if (row.status === 'Checked' && hasProductionReadyClaimAllowedYes(row.publicationEffect)) {
    issues.push(`${row.gate}: ${row.item}: Checked publication effect must not include production-ready claim allowed = yes`);
  }
  if (row.status === 'Checked' && hasProductionReadyClaimAllowedYes(row.requiredResolution)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence must not include production-ready claim allowed = yes`);
  }

  issues.push(
    ...validateEvidenceHygiene(row.requiredResolution, `${row.gate}: ${row.item}: required resolution`),
  );
  issues.push(
    ...validateReleaseGatePublicationClaimBoundary(
      `${row.gate}: ${row.item}: required resolution`,
      row.requiredResolution,
      {
        allowControlledTestnetProductionClaim:
          row.item === 'Technical addendum architecture manual',
      },
    ),
  );

  if (isRequiredBlocker && !blocksPublication) {
    issues.push(`${row.gate}: ${row.item}: required blocker row must keep a Publication blocker effect`);
  }

  if (
    requiredBlocker &&
    ALLOWED_STATUSES.has(row.status as ReleaseEvidenceStatus) &&
    row.status !== 'Checked' &&
    row.status !== requiredBlocker.unresolvedStatus
  ) {
    issues.push(
      `${row.gate}: ${row.item}: unresolved required blocker row must use ${requiredBlocker.unresolvedStatus} status until checked`,
    );
  }

  if (isRequiredBlocker && !hasRequiredResolutionMarker) {
    issues.push(`${row.gate}: ${row.item}: required blocker row requires a link, command, or artifact marker`);
  }

  if (blocksPublication && row.status !== 'Checked' && !isRequiredBlocker && !hasRequiredResolutionMarker) {
    issues.push(`${row.gate}: ${row.item}: unresolved publication blocker requires a link, command, or artifact marker`);
  }

  if (requiredBlocker) {
    const missingTerms = requiredBlocker.requiredResolutionTerms.filter(
      term => !containsTerm(row.requiredResolution, term),
    );
    if (missingTerms.length > 0) {
      issues.push(
        `${row.gate}: ${row.item}: required blocker row resolution must mention row-specific evidence terms: ${missingTerms.join(', ')}`,
      );
    }
  }

  if (row.status === 'Checked' && blocksPublication && !isRequiredBlocker) {
    if (!hasRequiredResolutionMarker) {
      issues.push(`${row.gate}: ${row.item}: Checked publication blocker requires a link, command, or artifact marker`);
    }
  }

  if (row.status === 'Checked' && blocksPublication && !hasCompletedEvidence) {
    issues.push(
      `${row.gate}: ${row.item}: Checked publication blocker requires a completed evidence link, command-output target, or artifact marker; template links and targetless command-output notes are not evidence`,
    );
  }

  if (
    row.status === 'Checked' &&
    blocksPublication &&
    !isRequiredBlocker &&
    !hasStructuredCustomPublicationBlockerResolution(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked custom publication blocker requires structured resolution evidence: validator output, release-notes blocker review with Publication blocker resolved = yes, or reviewer decision with Reviewer decision = approve and Publication blocker resolved = yes; target-only evidence is not enough`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Green CI on the final branch' &&
    !hasValidatedCleanCheckoutEvidence(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must include ci:validate PASS output with linked completed clean checkout evidence`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Green CI on the final branch'
  ) {
    issues.push(...validateCheckedCleanCheckoutEvidence(row, options));
  }

  const expectedRecoveryObserveKind = RECOVERY_OBSERVE_ROW_KINDS[row.item];
  if (
    row.status === 'Checked' &&
    expectedRecoveryObserveKind &&
    !hasValidatedRecoveryObserveEvidence(row.requiredResolution, expectedRecoveryObserveKind)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must include recovery-observe JSON validation PASS output with linked ${expectedRecoveryObserveKind} recovery observe JSON`,
    );
  }

  if (row.status === 'Checked' && expectedRecoveryObserveKind) {
    issues.push(...validateCheckedRecoveryObserveJson(row, expectedRecoveryObserveKind, options));
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Fresh local devnet lifecycle run' &&
    !hasValidatedCompletedLiveRehearsalEvidence(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must include completed local live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Fresh local devnet lifecycle run'
  ) {
    issues.push(...validateCheckedLiveRehearsalEvidence(
      row,
      options.localLiveRehearsalEvidenceValidation,
      options,
      'Fresh local devnet lifecycle',
      'local live rehearsal',
    ));
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Fresh Ergo testnet lifecycle run' &&
    hasPreBroadcastOnlyTestnetLifecycleEvidence(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must be completed live testnet lifecycle evidence, not pre-broadcast dry-run evidence`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Fresh Ergo testnet lifecycle run' &&
    hasForbiddenTestnetLifecycleEvidenceNetworkFacts(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must not include mainnet or negated testnet network facts`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Fresh Ergo testnet lifecycle run' &&
    !hasValidatedCompletedLiveRehearsalEvidence(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must include completed live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Fresh Ergo testnet lifecycle run'
  ) {
    issues.push(...validateCheckedLiveRehearsalEvidence(
      row,
      options.liveRehearsalEvidenceValidation,
      options,
      'Fresh testnet lifecycle',
    ));
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Fresh Ergo testnet lifecycle run' &&
    !hasValidatedAssemblyReportEvidence(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must include rehearsal:assemble PASS output with linked assembly report JSON`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Fresh Ergo testnet lifecycle run'
  ) {
    issues.push(...validateCheckedAssemblyReportJson(row, options));
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Fresh Ergo testnet lifecycle run' &&
    !hasValidatedLivePreflightEvidence(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must include rehearsal:external-fee-live-preflight PASS output bound to the same Expected transaction ID and activated settlement profile`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Fresh Ergo testnet lifecycle run'
  ) {
    issues.push(...validateCheckedLivePreflightJson(row, options));
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Fresh Ergo testnet lifecycle run' &&
    !hasValidatedFreshCheckpointEvidence(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must include rehearsal:fresh-testnet-check PASS output with linked fresh checkpoint JSON`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Fresh Ergo testnet lifecycle run'
  ) {
    issues.push(...validateCheckedFreshCheckpointJson(row, options));
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Fresh Ergo testnet lifecycle run' &&
    !hasValidatedPostSubmitObserveEvidence(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must include rehearsal:post-submit:observe PASS output with structured JSON output-shape binding`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Fresh Ergo testnet lifecycle run'
  ) {
    issues.push(...validateCheckedPostSubmitObserveJson(row, options));
    issues.push(...validateCheckedTestnetLifecycleJsonConsistency(row, options));
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Backup-restore or reconstructibility drill' &&
    !hasValidatedBackupRestoreEvidence(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must include backup:validate PASS output with linked completed backup-restore evidence`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Backup-restore or reconstructibility drill'
  ) {
    issues.push(...validateCheckedBackupRestoreEvidence(row, options));
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Signer dependency conformance or fail-closed release decision' &&
    !hasValidatedDependencyReviewEvidence(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must include dependency:validate PASS output with linked completed dependency review evidence`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Signer dependency conformance or fail-closed release decision'
  ) {
    issues.push(...validateCheckedDependencyReviewEvidence(row, options));
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Independent security review report' &&
    !hasValidatedSecurityReviewEvidence(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must include security:validate PASS output with linked completed independent security review evidence`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Independent security review report'
  ) {
    issues.push(...validateCheckedSecurityReviewEvidence(row, options));
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Trustless burn verification path' &&
    !hasValidatedTrustlessBurnEvidence(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must include trustless:validate PASS output with linked completed trustless burn evidence`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Trustless burn verification path'
  ) {
    issues.push(...validateCheckedTrustlessBurnEvidence(row, options));
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Single, batch, and sharded benchmark evidence' &&
    !hasValidatedBenchmarkEvidence(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must include benchmark:validate PASS output with linked completed benchmark evidence`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Single, batch, and sharded benchmark evidence'
  ) {
    issues.push(...validateCheckedBenchmarkEvidence(row, options));
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Committee governance and key-rotation drill' &&
    !hasValidatedCommitteeGovernanceEvidence(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must include governance:validate PASS output with linked completed committee governance evidence`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Committee governance and key-rotation drill'
  ) {
    issues.push(...validateCheckedCommitteeGovernanceEvidence(row, options));
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Operator readiness evidence' &&
    !hasValidatedOperatorReadinessEvidence(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must include operator:validate PASS output with linked completed operator readiness evidence`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Operator readiness evidence'
  ) {
    issues.push(...validateCheckedOperatorReadinessEvidence(row, options));
  }

  if (
    row.status === 'Checked' &&
    row.item === 'External integration package review' &&
    externalIntegrationTextApprovesClaimEscalation(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: required resolution must not approve mainnet release-readiness or production-ready wording`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'External integration package review' &&
    !hasValidatedExternalIntegrationEvidence(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must include integration:validate PASS output with linked completed external integration evidence`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'External integration package review'
  ) {
    issues.push(...validateCheckedExternalIntegrationEvidence(row, options));
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Technical addendum architecture manual' &&
    !hasValidatedTechnicalAddendumEvidence(row.requiredResolution)
  ) {
    issues.push(
      `${row.gate}: ${row.item}: Checked evidence must include addendum:validate PASS output with linked completed technical addendum evidence`,
    );
  }

  if (
    row.status === 'Checked' &&
    row.item === 'Technical addendum architecture manual'
  ) {
    issues.push(...validateCheckedTechnicalAddendumEvidence(row, options));
  }

  return issues;
}

function validateCheckedTestnetLifecycleJsonConsistency(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  return validateTestnetLifecycleJsonConsistency(`${row.gate}: ${row.item}`, options);
}

function validateTestnetLifecycleJsonConsistency(
  prefix: string,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const freshCheckpoint = options.freshCheckpointJsonValidation;
  const livePreflight = options.livePreflightJsonValidation;
  const postSubmitObserve = options.postSubmitObserveJsonValidation;
  const assemblyReport = options.assemblyReportJsonValidation;
  if (!freshCheckpoint || !livePreflight || !postSubmitObserve || !assemblyReport) return [];

  const freshExpectedTxId = normalizeTxId(freshCheckpoint.expectedTxId);
  const liveExpectedTxId = normalizeTxId(livePreflight.expectedTxId);
  const observeExpectedTxId = normalizeTxId(postSubmitObserve.expectedTxId);
  const observeSubmittedTxId = normalizeTxId(postSubmitObserve.submittedTxId);
  const assemblyExpectedTxId = normalizeTxId(assemblyReport.expectedTxId);
  const assemblySubmittedTxId = normalizeTxId(assemblyReport.submittedTxId);
  const issues: string[] = [];

  if (!freshExpectedTxId) {
    issues.push(`${prefix}: actual fresh checkpoint JSON validation must expose expectedTxId`);
  }
  if (!liveExpectedTxId) {
    issues.push(`${prefix}: actual external-fee live-preflight JSON validation must expose expectedTxId`);
  }
  if (!observeExpectedTxId) {
    issues.push(`${prefix}: actual post-submit observe JSON validation must expose expectedTxId`);
  }
  if (!observeSubmittedTxId) {
    issues.push(`${prefix}: actual post-submit observe JSON validation must expose submittedTxId`);
  }
  if (!assemblyExpectedTxId) {
    issues.push(`${prefix}: actual assembly report JSON validation must expose expectedTxId`);
  }
  if (!assemblySubmittedTxId) {
    issues.push(`${prefix}: actual assembly report JSON validation must expose submittedTxId`);
  }

  const expectedTxIds = [freshExpectedTxId, liveExpectedTxId, observeExpectedTxId, assemblyExpectedTxId]
    .filter((value): value is string => value !== undefined);
  if (new Set(expectedTxIds).size > 1) {
    issues.push(`${prefix}: actual lifecycle JSON validations must share the same Expected transaction ID`);
  }
  if (observeExpectedTxId && observeSubmittedTxId && observeSubmittedTxId !== observeExpectedTxId) {
    issues.push(`${prefix}: actual post-submit observe JSON validation submittedTxId must match Expected transaction ID`);
  }
  if (assemblyExpectedTxId && assemblySubmittedTxId && assemblySubmittedTxId !== assemblyExpectedTxId) {
    issues.push(`${prefix}: actual assembly report JSON validation submittedTxId must match Expected transaction ID`);
  }

  const livePreflightApprovalBinding = isRecord(livePreflight.approvalBinding)
    ? livePreflight.approvalBinding
    : undefined;
  const livePreflightApprovedBurns = normalizeTxIdArray(livePreflightApprovalBinding?.burnTxHashes);
  if (livePreflightApprovedBurns && hasDuplicateValues(livePreflightApprovedBurns)) {
    issues.push(`${prefix}: actual external-fee live-preflight JSON validation approvalBinding.burnTxHashes must not contain duplicates`);
  }
  return issues;
}

function validateCheckedLiveRehearsalEvidence(
  row: PendingEvidenceRow,
  validation: LiveRehearsalEvidenceValidationInput | undefined,
  options: ReleaseGateEvaluationOptions,
  expectedGate: string,
  evidenceLabel = 'live rehearsal',
): string[] {
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual ${evidenceLabel} evidence validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual ${evidenceLabel} evidence validation to pass`);
  }
  if (!isValidatedCompletedLiveRehearsalEvidenceTargetLinked(row.requiredResolution, validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual ${evidenceLabel} evidence validation target must match a linked completed live rehearsal document`,
    );
  }
  if (!hasPassingRehearsalGate(validation, expectedGate)) {
    issues.push(
      `${row.gate}: ${row.item}: actual ${evidenceLabel} evidence validation must expose ${expectedGate} row status pass`,
    );
  }
  issues.push(...validateLiveRehearsalStructuredRows(
    validation,
    `${row.gate}: ${row.item}: actual ${evidenceLabel} evidence validation`,
  ));
  issues.push(...validateLiveRehearsalStructuredFields(
    validation,
    `${row.gate}: ${row.item}: actual ${evidenceLabel} evidence validation`,
    expectedGate,
    options,
  ));
  return issues;
}

function validateLiveRehearsalStructuredRows(
  validation: LiveRehearsalEvidenceValidationInput,
  prefix: string,
): string[] {
  const rows = validation.rows;
  if (!Array.isArray(rows)) {
    return [`${prefix} must expose all structured lifecycle rows`];
  }

  const rowObjects = structuredRowObjects(rows);
  const issues = validateStructuredRowObjects(`${prefix}: rows`, rows);
  const byGate = new Map<string, RehearsalEvidenceRow>();
  const duplicates = new Set<string>();
  for (const row of rowObjects) {
    const gate = typeof row.releaseGate === 'string' ? row.releaseGate.trim() : '';
    if (gate.length === 0) continue;
    if (byGate.has(gate)) duplicates.add(gate);
    byGate.set(gate, row);
  }

  const missing = REQUIRED_REHEARSAL_GATES.filter(gate => !byGate.has(gate));
  if (missing.length > 0) {
    return [
      ...issues,
      `${prefix} must expose all structured lifecycle rows`,
    ];
  }

  for (const gate of duplicates) {
    issues.push(`${prefix}: ${gate}: duplicate lifecycle row`);
  }

  for (const gate of REQUIRED_REHEARSAL_GATES) {
    const row = byGate.get(gate)!;
    if (isBlankValue(row.status)) {
      issues.push(`${prefix}: ${gate}: status is required`);
    }
    if (isBlankValue(row.evidenceArtifact)) {
      issues.push(`${prefix}: ${gate}: evidenceArtifact is required`);
    }
    if (row.status === 'pass' && !hasCompletedEvidenceMarker(row.evidenceArtifact)) {
      issues.push(`${prefix}: ${gate}: pass evidenceArtifact must include completed evidence`);
    }
    if (row.status === 'pass' && !hasCompletedLifecycleGateEvidenceArtifact(row)) {
      issues.push(`${prefix}: ${gate} requires gate-specific completed lifecycle evidence artifact`);
    }
    if (row.status === 'pass' && hasContradictoryLifecycleEvidenceMarker(row.evidenceArtifact)) {
      issues.push(`${prefix}: ${gate}: pass evidenceArtifact must not mix completed/PASS evidence with failure markers`);
    }
    if (row.status !== 'pass' && row.status !== 'not applicable') {
      if (isBlankValue(row.blockingNote)) {
        issues.push(`${prefix}: ${gate}: non-passing row must include a blockingNote`);
      }
      if (isBlankValue(row.requiredNextEvidence)) {
        issues.push(`${prefix}: ${gate}: non-passing row must include requiredNextEvidence`);
      }
    }
  }

  return issues;
}

function validateLiveRehearsalStructuredFields(
  validation: LiveRehearsalEvidenceValidationInput,
  prefix: string,
  expectedGate: string,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const rawSessionMetadata = validation.sessionMetadata;
  const rawPublicationEvidence = validation.publicationEvidence;
  const rawReviewerSignoff = validation.reviewerSignoff;
  if (!rawSessionMetadata || !rawPublicationEvidence || !rawReviewerSignoff) {
    return [
      `${prefix} must expose structured session metadata, publication evidence, and reviewer sign-off fields`,
    ];
  }

  const sessionMetadata = normalizeLiveRehearsalSessionMetadata(rawSessionMetadata);
  const publicationEvidence = normalizeLiveRehearsalPublicationEvidence(rawPublicationEvidence);
  const reviewerSignoff = normalizeLiveRehearsalReviewerSignoff(rawReviewerSignoff);
  const issues: string[] = [];
  const requiredSessionFields: Array<[keyof RehearsalSessionMetadata, string]> = [
    ['date', 'sessionMetadata.date'],
    ['operator', 'sessionMetadata.operator'],
    ['reviewer', 'sessionMetadata.reviewer'],
    ['environment', 'sessionMetadata.environment'],
    ['gitCommit', 'sessionMetadata.gitCommit'],
    ['releaseLevel', 'sessionMetadata.releaseLevel'],
    ['ergoNodeNetwork', 'sessionMetadata.ergoNodeNetwork'],
    ['sidechainNetwork', 'sessionMetadata.sidechainNetwork'],
    ['broadcastModeAtStart', 'sessionMetadata.broadcastModeAtStart'],
    ['broadcastModeAtEnd', 'sessionMetadata.broadcastModeAtEnd'],
  ];
  for (const [field, label] of requiredSessionFields) {
    if (isBlankValue(sessionMetadata[field])) {
      issues.push(`${prefix}: ${label} is required`);
    }
  }

  if (!isBlankValue(sessionMetadata.date) && !isIsoCalendarDate(sessionMetadata.date.trim())) {
    issues.push(`${prefix}: sessionMetadata.date must be an ISO calendar date`);
  }
  if (!isBlankValue(sessionMetadata.gitCommit) && !/^[a-f0-9]{7,40}$/i.test(sessionMetadata.gitCommit.trim())) {
    issues.push(`${prefix}: sessionMetadata.gitCommit must be a 7-40 character hex commit`);
  }

  const expectedEnvironment = expectedGate === 'Fresh local devnet lifecycle'
    ? 'local devnet'
    : expectedGate === 'Fresh testnet lifecycle'
      ? 'testnet'
      : undefined;
  if (expectedEnvironment && sessionMetadata.environment !== expectedEnvironment) {
    issues.push(`${prefix}: sessionMetadata.environment must be ${expectedEnvironment}`);
  }
  if (expectedGate === 'Fresh testnet lifecycle') {
    if (!identifiesPositiveTestnetNetwork(sessionMetadata.ergoNodeNetwork)) {
      issues.push(`${prefix}: sessionMetadata.ergoNodeNetwork must positively identify testnet`);
    }
    if (!identifiesAllowedSidechainNetwork(sessionMetadata.sidechainNetwork)) {
      issues.push(`${prefix}: sessionMetadata.sidechainNetwork must identify patched-devnet, testnet, or non-mainnet`);
    }
  }
  if (expectedGate === 'Fresh local devnet lifecycle') {
    if (!identifiesPositiveLocalDevnetNetwork(sessionMetadata.ergoNodeNetwork)) {
      issues.push(`${prefix}: sessionMetadata.ergoNodeNetwork must positively identify a local non-mainnet devnet`);
    }
    if (!identifiesPositiveLocalDevnetNetwork(sessionMetadata.sidechainNetwork)) {
      issues.push(`${prefix}: sessionMetadata.sidechainNetwork must positively identify a local non-mainnet devnet`);
    }
  }
  if (sessionMetadata.releaseLevel === 'production deployment candidate' && sessionMetadata.environment !== 'testnet') {
    issues.push(`${prefix}: sessionMetadata.releaseLevel production deployment candidate requires testnet environment`);
  }
  if (sessionMetadata.broadcastModeAtStart !== 'disabled') {
    issues.push(`${prefix}: sessionMetadata.broadcastModeAtStart must be disabled`);
  }
  if (sessionMetadata.broadcastModeAtEnd !== 'disabled') {
    issues.push(`${prefix}: sessionMetadata.broadcastModeAtEnd must be disabled`);
  }
  issues.push(...validateGate3SettlementProfileActivation(
    sessionMetadata,
    expectedEnvironment === 'local devnet'
      ? options.localSettlementProfileActivationJsonValidation
      : options.settlementProfileActivationJsonValidation,
    expectedEnvironment,
    prefix,
    options.cleanCheckoutEvidenceValidation,
  ));

  const requiredPublicationFields: Array<[keyof RehearsalPublicationEvidence, string]> = [
    ['releaseNotesUpdated', 'publicationEvidence.releaseNotesUpdated'],
    ['requiredReleaseNoteUpdates', 'publicationEvidence.requiredReleaseNoteUpdates'],
    ['pendingEvidenceRegisterUpdated', 'publicationEvidence.pendingEvidenceRegisterUpdated'],
    ['requiredChecklistUpdates', 'publicationEvidence.requiredChecklistUpdates'],
    ['productionReadyClaimAllowed', 'publicationEvidence.productionReadyClaimAllowed'],
    ['testnetProductionCandidateClaimAllowed', 'publicationEvidence.testnetProductionCandidateClaimAllowed'],
  ];
  for (const [field, label] of requiredPublicationFields) {
    if (isBlankValue(publicationEvidence[field])) {
      issues.push(`${prefix}: ${label} is required`);
    }
  }
  if (publicationEvidence.releaseNotesUpdated !== 'yes') {
    issues.push(`${prefix}: publicationEvidence.releaseNotesUpdated must be yes`);
  }
  if (!hasCompletedRehearsalReleaseNoteUpdateEvidence(publicationEvidence.requiredReleaseNoteUpdates)) {
    issues.push(`${prefix}: publicationEvidence.requiredReleaseNoteUpdates must include completed Gate 3 rehearsal release-note update evidence`);
  }
  if (publicationEvidence.pendingEvidenceRegisterUpdated !== 'yes') {
    issues.push(`${prefix}: publicationEvidence.pendingEvidenceRegisterUpdated must be yes`);
  }
  if (!hasCompletedRehearsalChecklistUpdateEvidence(publicationEvidence.requiredChecklistUpdates)) {
    issues.push(`${prefix}: publicationEvidence.requiredChecklistUpdates must include completed Gate 3 checklist update evidence`);
  }
  issues.push(
    ...validateRehearsalPublicationUpdateBoundary(
      `${prefix}: publicationEvidence.requiredReleaseNoteUpdates`,
      publicationEvidence.requiredReleaseNoteUpdates,
    ),
  );
  issues.push(
    ...validateRehearsalPublicationUpdateBoundary(
      `${prefix}: publicationEvidence.requiredChecklistUpdates`,
      publicationEvidence.requiredChecklistUpdates,
    ),
  );
  if (
    hasSharedCompletedEvidenceTarget(
      publicationEvidence.requiredReleaseNoteUpdates,
      publicationEvidence.requiredChecklistUpdates,
    )
  ) {
    issues.push(
      `${prefix}: publicationEvidence release-note and checklist updates must use distinct completed Gate 3 publication evidence targets`,
    );
  }
  if (publicationEvidence.productionReadyClaimAllowed !== 'no') {
    issues.push(`${prefix}: publicationEvidence.productionReadyClaimAllowed must remain no`);
  }
  if (publicationEvidence.testnetProductionCandidateClaimAllowed !== 'no') {
    issues.push(`${prefix}: publicationEvidence.testnetProductionCandidateClaimAllowed must remain no`);
  }

  const requiredReviewerFields: Array<[keyof RehearsalReviewerSignoff, string]> = [
    ['classification', 'reviewerSignoff.classification'],
    ['publicationBlockersDiscovered', 'reviewerSignoff.publicationBlockersDiscovered'],
    ['followUpTestsRequired', 'reviewerSignoff.followUpTestsRequired'],
    ['followUpRunbookChangesRequired', 'reviewerSignoff.followUpRunbookChangesRequired'],
    ['reviewer', 'reviewerSignoff.reviewer'],
    ['date', 'reviewerSignoff.date'],
  ];
  for (const [field, label] of requiredReviewerFields) {
    if (isBlankValue(reviewerSignoff[field])) {
      issues.push(`${prefix}: ${label} is required`);
    }
  }
  if (reviewerSignoff.classification !== 'pass') {
    issues.push(`${prefix}: reviewerSignoff.classification must be pass`);
  }
  if (!isNoOpenRehearsalItem(reviewerSignoff.publicationBlockersDiscovered)) {
    issues.push(`${prefix}: reviewerSignoff.publicationBlockersDiscovered must be none, no, or 0`);
  }
  if (!isNoOpenRehearsalItem(reviewerSignoff.followUpTestsRequired)) {
    issues.push(`${prefix}: reviewerSignoff.followUpTestsRequired must be none, no, or 0`);
  }
  if (!isNoOpenRehearsalItem(reviewerSignoff.followUpRunbookChangesRequired)) {
    issues.push(`${prefix}: reviewerSignoff.followUpRunbookChangesRequired must be none, no, or 0`);
  }
  if (!isBlankValue(sessionMetadata.reviewer) && reviewerSignoff.reviewer !== sessionMetadata.reviewer) {
    issues.push(`${prefix}: reviewerSignoff.reviewer must match sessionMetadata.reviewer`);
  }
  if (!isBlankValue(reviewerSignoff.date) && !isIsoCalendarDate(reviewerSignoff.date.trim())) {
    issues.push(`${prefix}: reviewerSignoff.date must be an ISO calendar date`);
  }
  const sessionDate = typeof sessionMetadata.date === 'string' ? sessionMetadata.date.trim() : '';
  const reviewerDate = typeof reviewerSignoff.date === 'string' ? reviewerSignoff.date.trim() : '';
  if (isIsoCalendarDate(sessionDate) && isIsoCalendarDate(reviewerDate) && reviewerDate < sessionDate) {
    issues.push(`${prefix}: reviewerSignoff.date must not be before sessionMetadata.date`);
  }

  return issues;
}

function validateRehearsalPublicationUpdateBoundary(label: string, text: string): string[] {
  const issues = [
    ...validateReleaseGatePublicationClaimBoundary(label, text),
  ];

  if (!rehearsalPublicationUpdateHasExactProductionReadyClaimDeniedBinding(text)) {
    issues.push(`${label} must use exact Production-ready claim allowed by this rehearsal: no`);
  }
  if (!rehearsalPublicationUpdateHasExactTestnetProductionCandidateClaimDeniedBinding(text)) {
    issues.push(`${label} must use exact Testnet production-candidate claim allowed by this rehearsal: no`);
  }
  if (rehearsalPublicationUpdateAllowsTestnetProductionCandidateClaims(text)) {
    issues.push(`${label} must not allow testnet production-candidate claims`);
  }
  if (rehearsalPublicationUpdateAllowsProductionReadyClaims(text)) {
    issues.push(`${label} must not allow production-ready claims`);
  }
  if (hasContradictoryValidationFailureMarker(text)) {
    issues.push(`${label} must not mix completed/PASS evidence with failure markers`);
  }
  if (hasContradictoryReleaseNotesDecisionBinding(text)) {
    issues.push(`${label} must not include contradictory release-note decision bindings`);
  }

  return [...new Set(issues)];
}

function rehearsalPublicationUpdateHasExactProductionReadyClaimDeniedBinding(value: string): boolean {
  return /\bProduction-ready claim allowed by this rehearsal:\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function rehearsalPublicationUpdateHasExactTestnetProductionCandidateClaimDeniedBinding(value: string): boolean {
  return /\bTestnet production-candidate claim allowed by this rehearsal:\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function rehearsalPublicationUpdateAllowsTestnetProductionCandidateClaims(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /testnet production-candidate claim allowed by this rehearsal\s*[:=]\s*(?:yes|true|1)\b/i.test(value) ||
    /\btestnet production candidate claims\s+(?:approved|allowed|supported|permitted)\b/i.test(normalized) ||
    /\btestnet production candidate claim support\s+(?:approved|allowed|supported|permitted|yes|true|1)\b/i.test(normalized)
  );
}

function rehearsalPublicationUpdateAllowsProductionReadyClaims(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /production-ready claim allowed by this rehearsal\s*[:=]\s*(?:yes|true|1)\b/i.test(value) ||
    /\bproduction ready claims\s+(?:approved|allowed|supported|permitted)\b/i.test(normalized) ||
    /\bproduction ready claim support\s+(?:approved|allowed|supported|permitted|yes|true|1)\b/i.test(normalized)
  );
}

function isNoOpenRehearsalItem(value: string): boolean {
  return /^(?:none|no|0)$/i.test(value.trim());
}

function normalizeLiveRehearsalSessionMetadata(
  fields: unknown,
): RehearsalSessionMetadata {
  const record = isRecord(fields) ? fields : {};
  return {
    date: rehearsalStringField(record.date),
    operator: rehearsalStringField(record.operator),
    reviewer: rehearsalStringField(record.reviewer),
    environment: rehearsalStringField(record.environment),
    gitCommit: rehearsalStringField(record.gitCommit),
    releaseLevel: rehearsalStringField(record.releaseLevel),
    ergoNodeNetwork: rehearsalStringField(record.ergoNodeNetwork),
    sidechainNetwork: rehearsalStringField(record.sidechainNetwork),
    broadcastModeAtStart: rehearsalStringField(record.broadcastModeAtStart),
    broadcastModeAtEnd: rehearsalStringField(record.broadcastModeAtEnd),
    settlementProfileId: rehearsalStringField(record.settlementProfileId),
    profileActivationStatus: rehearsalStringField(record.profileActivationStatus),
    evidencePurpose: rehearsalStringField(record.evidencePurpose),
    activationEvidenceTarget: rehearsalStringField(record.activationEvidenceTarget),
    activationId: rehearsalStringField(record.activationId),
  };
}

function validateGate3SettlementProfileActivation(
  sessionMetadata: RehearsalSessionMetadata,
  validation: SettlementProfileActivationJsonValidationInput | undefined,
  expectedEnvironment: string | undefined,
  prefix: string,
  cleanCheckoutValidation: CleanCheckoutEvidenceValidationInput | undefined,
): string[] {
  const cleanCheckoutGitCommit = cleanCheckoutValidation?.classification?.gitCommit;
  const binding = {
    settlementProfileId: sessionMetadata.settlementProfileId ?? '',
    profileActivationStatus: sessionMetadata.profileActivationStatus ?? '',
    evidencePurpose: sessionMetadata.evidencePurpose ?? '',
    activationEvidenceTarget: sessionMetadata.activationEvidenceTarget ?? '',
  };
  const issues = validateGate3ClosureProfileBinding(
    binding,
    validation?.target,
    `${prefix}: sessionMetadata.settlementProfile`,
  );
  if (!validation) {
    issues.push(`${prefix}: Gate 3 lifecycle pass requires actual settlement profile activation JSON validation input`);
    return [...new Set(issues)];
  }
  if (!validationPassed(validation)) {
    issues.push(`${prefix}: settlement profile activation JSON validation must pass`);
  }
  if (validation.report === undefined) {
    issues.push(`${prefix}: settlement profile activation JSON validation must expose the structured activation report`);
    return [...new Set(issues)];
  }

  const reportValidation = validateSettlementProfileActivationEvidence(
    validation.report,
    validation.authorityEvidence,
  );
  issues.push(...reportValidation.errors.map(error => `${prefix}: ${error}`));
  issues.push(...validateGate3ClosureProfileBinding(
    reportValidation.settlementProfile,
    validation.target,
    `${prefix}: activationReport.settlementProfile`,
  ));
  if (
    reportValidation.settlementProfile &&
    (
      reportValidation.settlementProfile.settlementProfileId !== binding.settlementProfileId ||
      reportValidation.settlementProfile.profileActivationStatus !== binding.profileActivationStatus ||
      reportValidation.settlementProfile.evidencePurpose !== binding.evidencePurpose
    )
  ) {
    issues.push(`${prefix}: session settlement profile must match the validated activation report`);
  }
  if ((sessionMetadata.activationId ?? '') !== reportValidation.activationId) {
    issues.push(`${prefix}: sessionMetadata.activationId must match the validated activation report`);
  }
  if (expectedEnvironment && reportValidation.environment !== expectedEnvironment) {
    issues.push(`${prefix}: activation report environment must match ${expectedEnvironment}`);
  }
  if (reportValidation.environment !== sessionMetadata.environment) {
    issues.push(`${prefix}: activation report environment must match sessionMetadata.environment`);
  }
  if (reportValidation.ergoNodeNetwork !== sessionMetadata.ergoNodeNetwork) {
    issues.push(`${prefix}: activation report ergoNodeNetwork must match sessionMetadata.ergoNodeNetwork`);
  }
  if (reportValidation.sidechainNetwork !== sessionMetadata.sidechainNetwork) {
    issues.push(`${prefix}: activation report sidechainNetwork must match sessionMetadata.sidechainNetwork`);
  }
  if (reportValidation.gitCommit !== sessionMetadata.gitCommit) {
    issues.push(`${prefix}: activation report gitCommit must match sessionMetadata.gitCommit`);
  }
  if (!isCleanCheckoutRunClassificationGitCommit(cleanCheckoutGitCommit)) {
    issues.push(`${prefix}: activation report requires validated clean checkout Git commit`);
  } else if (normalizeGitCommit(reportValidation.gitCommit) !== normalizeGitCommit(cleanCheckoutGitCommit)) {
    issues.push(`${prefix}: activation report gitCommit must match clean checkout Git commit ${cleanCheckoutGitCommit?.trim()}`);
  }
  if (!cleanCheckoutValidation || !validationPassed(cleanCheckoutValidation)) {
    issues.push(`${prefix}: activation report requires clean checkout evidence validation PASS`);
  }
  return [...new Set(issues)];
}

function normalizeLiveRehearsalPublicationEvidence(
  fields: unknown,
): RehearsalPublicationEvidence {
  const record = isRecord(fields) ? fields : {};
  return {
    releaseNotesUpdated: rehearsalStringField(record.releaseNotesUpdated),
    requiredReleaseNoteUpdates: rehearsalStringField(record.requiredReleaseNoteUpdates),
    pendingEvidenceRegisterUpdated: rehearsalStringField(record.pendingEvidenceRegisterUpdated),
    requiredChecklistUpdates: rehearsalStringField(record.requiredChecklistUpdates),
    productionReadyClaimAllowed: rehearsalStringField(record.productionReadyClaimAllowed),
    testnetProductionCandidateClaimAllowed: rehearsalStringField(record.testnetProductionCandidateClaimAllowed),
  };
}

function normalizeLiveRehearsalReviewerSignoff(
  fields: unknown,
): RehearsalReviewerSignoff {
  const record = isRecord(fields) ? fields : {};
  return {
    classification: rehearsalStringField(record.classification),
    publicationBlockersDiscovered: rehearsalStringField(record.publicationBlockersDiscovered),
    followUpTestsRequired: rehearsalStringField(record.followUpTestsRequired),
    followUpRunbookChangesRequired: rehearsalStringField(record.followUpRunbookChangesRequired),
    reviewer: rehearsalStringField(record.reviewer),
    date: rehearsalStringField(record.date),
  };
}

function rehearsalStringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function hasContradictoryLifecycleEvidenceMarker(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value);

  return (
    /\b(?:status|result|validation|validator|command|run|outcome|output)\s*[:=]?\s*(?:FAIL(?:ED)?|BLOCKED|ERROR)\b/i.test(normalized) ||
    /\b(?:FAIL(?:ED)?|BLOCKED|ERROR)\b\s+(?:validation|validator|command|run|result|status|outcome|output)\b/i.test(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\b[1-9]\d*\s+structural\s+issues?\b/i.test(normalized)
  );
}

function validateCheckedAggregatePrebroadcastJson(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.aggregatePrebroadcastJsonValidation;
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual aggregate prebroadcast JSON validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual aggregate prebroadcast JSON validation to pass`);
  }
  if (!isConcreteJsonEvidenceTarget(validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual aggregate prebroadcast JSON validation target must cite a concrete non-template aggregate JSON target`,
    );
  }
  if (!isValidatedAggregatePrebroadcastJsonTargetLinked(row.requiredResolution, validation.target, options)) {
    issues.push(
      `${row.gate}: ${row.item}: actual aggregate prebroadcast JSON validation target must match fresh-checkpoint aggregateEvidence provenance`,
    );
  }
  issues.push(...validateAggregatePrebroadcastStructuredSummary(
    validation,
    `${row.gate}: ${row.item}: actual aggregate prebroadcast JSON validation`,
    options,
  ));
  return issues;
}

function validateAggregatePrebroadcastStructuredSummary(
  validation: AggregatePrebroadcastJsonValidationInput,
  prefix: string,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const claims = Array.isArray(validation.claims) ? validation.claims : undefined;
  const settlementShape = isRecord(validation.settlementShape) ? validation.settlementShape : undefined;
  const transactionCheck = isRecord(validation.transactionCheck) ? validation.transactionCheck : undefined;
  const sourceBindings = isRecord(validation.sourceBindings) ? validation.sourceBindings : undefined;
  if (!transactionCheck || !claims || !settlementShape || !sourceBindings) {
    return [
      `${prefix} must expose structured transactionCheck, claim, settlement-shape, and source-binding provenance`,
    ];
  }

  const claimObjects = structuredRowObjects(claims);
  const issues = validateStructuredRowObjects(`${prefix} claims`, claims);
  if (!isIsoUtcTimestamp(validation.generatedAt)) {
    issues.push(`${prefix} generatedAt must be an ISO UTC timestamp`);
  }
  if (!isNonBroadcastAggregateCheckCommand(validation.command)) {
    issues.push(`${prefix} command must be a non-broadcast aggregate check command`);
  }
  if (validation.stateTrackerMode !== 'read-only') {
    issues.push(`${prefix} stateTrackerMode must be read-only`);
  }
  if (validation.broadcast !== 'no') {
    issues.push(`${prefix} broadcast must be no`);
  }
  validateAggregatePrebroadcastSourceBindings(sourceBindings, prefix, issues);
  if (transactionCheck.endpoint !== '/transactions/check') {
    issues.push(`${prefix} transactionCheck.endpoint must be /transactions/check`);
  }
  if (transactionCheck.result !== 'PASS') {
    issues.push(`${prefix} transactionCheck.result must be PASS`);
  }
  if (!isAggregateTransactionCheckNodeResponseKind(transactionCheck.nodeResponseKind)) {
    issues.push(`${prefix} transactionCheck.nodeResponseKind must identify the observed /transactions/check response kind`);
  }
  if (!normalizeTxId(transactionCheck.nodeResponseDigest)) {
    issues.push(`${prefix} transactionCheck.nodeResponseDigest must be a concrete 32-byte response digest`);
  }
  if (!Object.prototype.hasOwnProperty.call(transactionCheck, 'nodeResponse') ||
      transactionCheck.nodeResponse === null ||
      transactionCheck.nodeResponse === undefined) {
    issues.push(`${prefix} transactionCheck.nodeResponse must expose the observed /transactions/check response`);
  } else {
    const actualKind = classifyAggregateTransactionCheckNodeResponse(transactionCheck.nodeResponse);
    if (!actualKind) {
      issues.push(`${prefix} transactionCheck.nodeResponse must expose a JSON response value`);
    } else {
      if (isAggregateTransactionCheckNodeResponseKind(transactionCheck.nodeResponseKind) &&
          transactionCheck.nodeResponseKind !== actualKind) {
        issues.push(`${prefix} transactionCheck.nodeResponseKind must match the observed /transactions/check response`);
      }
      if (normalizeTxId(transactionCheck.nodeResponseDigest) &&
          String(transactionCheck.nodeResponseDigest).toLowerCase() !==
            digestAggregateTransactionCheckNodeResponse(transactionCheck.nodeResponse)) {
        issues.push(`${prefix} transactionCheck.nodeResponseDigest must match the observed /transactions/check response`);
      }
      if (hasContradictoryAggregateTransactionCheckNodeResponse(transactionCheck.nodeResponse)) {
        issues.push(`${prefix} transactionCheck.nodeResponse must not include contradictory failure markers`);
      }
    }
  }

  const transactionCheckExpectedTxId = normalizeTxId(transactionCheck.expectedTxId);
  const expectedTxId = normalizeTxId(validation.expectedTxId);
  if (!transactionCheckExpectedTxId) {
    issues.push(`${prefix} transactionCheck.expectedTxId must be a concrete 32-byte transaction ID`);
  }
  if (!expectedTxId) {
    issues.push(`${prefix} expectedTxId must be exposed as a concrete 32-byte transaction ID`);
  }
  if (transactionCheckExpectedTxId && expectedTxId && transactionCheckExpectedTxId !== expectedTxId) {
    issues.push(`${prefix} expectedTxId must match transactionCheck.expectedTxId`);
  }

  if (!isPositiveIntegerValue(validation.claimCount)) {
    issues.push(`${prefix} claimCount must be a positive integer`);
  } else if (validation.claimCount !== claimObjects.length) {
    issues.push(`${prefix} claimCount must match claims.length`);
  }
  if (claimObjects.length === 0) {
    issues.push(`${prefix} claims must not be empty`);
  }
  if (validation.command === 'check-batch' && claimObjects.length < 2) {
    issues.push(`${prefix} check-batch evidence must expose at least two claims`);
  }
  if (validation.command === 'check-batch' && claimObjects.length > BATCH_UNLOCK_MAX_CLAIMS) {
    issues.push(
      `${prefix} check-batch evidence must not exceed batch unlock cap (${BATCH_UNLOCK_MAX_CLAIMS} claims)`,
    );
  }
  if (
    typeof validation.command === 'string' &&
    validation.command !== 'check-batch' &&
    isNonBroadcastAggregateCheckCommand(validation.command) &&
    claimObjects.length !== 1
  ) {
    issues.push(`${prefix} ${validation.command} evidence must expose exactly one claim`);
  }

  const seenBurnTxHashes = new Set<string>();
  for (const [index, claim] of claimObjects.entries()) {
    const label = `${prefix} claims[${index}]`;
    const burnTxHash = normalizeTxId(claim.burnTxHash);
    if (!burnTxHash) {
      issues.push(`${label}.burnTxHash must be a concrete 32-byte transaction ID`);
    } else if (seenBurnTxHashes.has(burnTxHash)) {
      issues.push(`${label}.burnTxHash must be unique`);
    } else {
      seenBurnTxHashes.add(burnTxHash);
    }
    if (!isNonNegativeSafeIntegerValue(claim.sidechainBlockHeight)) {
      issues.push(`${label}.sidechainBlockHeight must be a non-negative integer`);
    }
    if (
      requiresAnchoredAggregateClaim(validation.command) &&
      !normalizeTxId(claim.sidechainHeaderHashHex)
    ) {
      issues.push(`${label}.sidechainHeaderHashHex must be a concrete 32-byte value`);
    }
    if (
      requiresAnchoredAggregateClaim(validation.command) &&
      !normalizeTxId(claim.bridgeEventRootHex)
    ) {
      issues.push(`${label}.bridgeEventRootHex must be a concrete 32-byte value`);
    }
    if (
      requiresAnchoredAggregateClaim(validation.command) &&
      !isNonNegativeSafeIntegerValue(claim.ergoAnchorHeight)
    ) {
      issues.push(`${label}.ergoAnchorHeight must be a non-negative integer`);
    }
  }

  if (!isPositiveIntegerValue(settlementShape.inputCount)) {
    issues.push(`${prefix} settlementShape.inputCount must be a positive integer`);
  }
  if (!isPositiveIntegerValue(settlementShape.outputCount)) {
    issues.push(`${prefix} settlementShape.outputCount must be a positive integer`);
  }
  if (
    !Array.isArray(settlementShape.contextExtensionKeyCounts) ||
    settlementShape.contextExtensionKeyCounts.length === 0 ||
    !settlementShape.contextExtensionKeyCounts.every(isNonNegativeSafeIntegerValue)
  ) {
    issues.push(`${prefix} settlementShape.contextExtensionKeyCounts must be non-empty non-negative integer counts`);
  }
  if (
    typeof settlementShape.contextExtensionKeyCountsCsv !== 'string' ||
    settlementShape.contextExtensionKeyCountsCsv.trim().length === 0
  ) {
    issues.push(`${prefix} settlementShape.contextExtensionKeyCountsCsv must be present`);
  } else if (
    Array.isArray(settlementShape.contextExtensionKeyCounts) &&
    settlementShape.contextExtensionKeyCounts.every(isNonNegativeSafeIntegerValue) &&
    settlementShape.contextExtensionKeyCountsCsv !== settlementShape.contextExtensionKeyCounts.join(',')
  ) {
    issues.push(`${prefix} settlementShape.contextExtensionKeyCountsCsv must match contextExtensionKeyCounts`);
  }

  const freshCheckpointExpectedTxId = normalizeTxId(options.freshCheckpointJsonValidation?.expectedTxId);
  if (expectedTxId && freshCheckpointExpectedTxId && expectedTxId !== freshCheckpointExpectedTxId) {
    issues.push(`${prefix} expectedTxId must match actual fresh checkpoint Expected transaction ID`);
  }
  const livePreflightExpectedTxId = normalizeTxId(options.livePreflightJsonValidation?.expectedTxId);
  if (expectedTxId && livePreflightExpectedTxId && expectedTxId !== livePreflightExpectedTxId) {
    issues.push(`${prefix} expectedTxId must match actual live-preflight Expected transaction ID`);
  }
  const freshCheckpointSourceBindings = isRecord(options.freshCheckpointJsonValidation?.sourceBindings)
    ? options.freshCheckpointJsonValidation.sourceBindings
    : undefined;
  const freshCheckpointAggregateEvidence =
    typeof freshCheckpointSourceBindings?.aggregateEvidence === 'string'
      ? freshCheckpointSourceBindings.aggregateEvidence
      : undefined;
  if (!freshCheckpointAggregateEvidence || !isConcreteJsonEvidenceTarget(freshCheckpointAggregateEvidence)) {
    issues.push(`${prefix} fresh-checkpoint sourceBindings.aggregateEvidence must cite a concrete aggregate evidence JSON target`);
  } else if (
    normalizeEvidenceTarget(freshCheckpointAggregateEvidence) !== normalizeEvidenceTarget(validation.target)
  ) {
    issues.push(`${prefix} target must match fresh-checkpoint aggregateEvidence provenance`);
  }

  return issues;
}

function validateAggregatePrebroadcastSourceBindings(
  sourceBindings: Record<string, unknown>,
  prefix: string,
  issues: string[],
): void {
  const state = isRecord(sourceBindings.state) ? sourceBindings.state : undefined;
  if (!state) {
    issues.push(`${prefix} sourceBindings.state must prove explicit read-only operator state DB provenance`);
  } else {
    if (state.sourceType !== 'read-only-state-tracker') {
      issues.push(`${prefix} sourceBindings.state.sourceType must be read-only-state-tracker`);
    }
    if (state.input !== '--state-db') {
      issues.push(`${prefix} sourceBindings.state.input must be --state-db`);
    }
    if (state.readOnly !== true) {
      issues.push(`${prefix} sourceBindings.state.readOnly must be true`);
    }
    if (state.targetClass !== 'operator-provided-state-db') {
      issues.push(`${prefix} sourceBindings.state.targetClass must be operator-provided-state-db`);
    }
    if (state.runtimePathSerialized !== false) {
      issues.push(`${prefix} sourceBindings.state.runtimePathSerialized must be false`);
    }
    if (state.defaultFallbackUsed !== false) {
      issues.push(`${prefix} sourceBindings.state.defaultFallbackUsed must be false`);
    }
    if (!isExactStringArray(state.operations, ['read-only peg-out state lookup'])) {
      issues.push(`${prefix} sourceBindings.state.operations must list read-only peg-out state lookup`);
    }
  }

  const deployedState = isRecord(sourceBindings.deployedState)
    ? sourceBindings.deployedState
    : undefined;
  if (!deployedState) {
    issues.push(`${prefix} sourceBindings.deployedState must prove explicit sanitized deployed-state JSON provenance`);
  } else {
    if (deployedState.sourceType !== 'sanitized-deployed-state-json') {
      issues.push(`${prefix} sourceBindings.deployedState.sourceType must be sanitized-deployed-state-json`);
    }
    if (deployedState.input !== '--deployed-state-json') {
      issues.push(`${prefix} sourceBindings.deployedState.input must be --deployed-state-json`);
    }
    if (deployedState.targetClass !== 'operator-provided-deployed-state-json') {
      issues.push(
        `${prefix} sourceBindings.deployedState.targetClass must be operator-provided-deployed-state-json`,
      );
    }
    if (deployedState.runtimePathSerialized !== false) {
      issues.push(`${prefix} sourceBindings.deployedState.runtimePathSerialized must be false`);
    }
    if (deployedState.defaultLoaderUsed !== false) {
      issues.push(`${prefix} sourceBindings.deployedState.defaultLoaderUsed must be false`);
    }
    if (!isExactStringArray(deployedState.operations, ['read-only sanitized deployed-state load'])) {
      issues.push(`${prefix} sourceBindings.deployedState.operations must list read-only sanitized deployed-state load`);
    }
  }
}

function isExactStringArray(value: unknown, expected: string[]): boolean {
  return Array.isArray(value) &&
    value.length === expected.length &&
    expected.every((item, index) => value[index] === item);
}

function isAggregateTransactionCheckNodeResponseKind(value: unknown): boolean {
  return value === 'empty-string' ||
    value === 'string' ||
    value === 'object' ||
    value === 'array' ||
    value === 'number' ||
    value === 'boolean';
}

function classifyAggregateTransactionCheckNodeResponse(value: unknown): string | undefined {
  if (value === '') return 'empty-string';
  if (Array.isArray(value)) return 'array';
  if (value && typeof value === 'object') return 'object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return undefined;
}

function digestAggregateTransactionCheckNodeResponse(value: unknown): string {
  return createHash('sha256')
    .update(stableAggregateJsonStringify(value))
    .digest('hex');
}

function hasContradictoryAggregateTransactionCheckNodeResponse(value: unknown): boolean {
  const normalized = normalizeEvidenceMarkerText(stableAggregateJsonStringify(value));
  return (
    /(?:^|[^A-Za-z0-9_-])FAIL(?:$|[^A-Za-z0-9_-])/i.test(normalized) ||
    /\b(?:FAILED|BLOCKED|ERROR)\b/i.test(normalized) ||
    /\bexit\s*code\b\s*["']?\s*[:=]?\s*["']?(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\b\s*["']?\s*[:=]?\s*["']?(?!0\b)\d+\b/i.test(normalized)
  );
}

function stableAggregateJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalAggregateJson(value));
}

function canonicalAggregateJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalAggregateJson);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map(key => [key, canonicalAggregateJson(record[key])]),
    );
  }
  return value;
}

function validateCheckedAssemblyReportJson(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.assemblyReportJsonValidation;
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual assembly report JSON validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual assembly report JSON validation to pass`);
  }
  if (!isValidatedAssemblyReportJsonTargetLinked(row.requiredResolution, validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual assembly report JSON validation target must match a linked completed assembly report JSON`,
    );
  }
  issues.push(...validateAssemblyReportStructuredSummary(
    validation,
    `${row.gate}: ${row.item}: actual assembly report JSON validation`,
    options,
  ));
  return issues;
}

function validateAssemblyReportStructuredSummary(
  validation: AssemblyReportJsonValidationInput,
  prefix: string,
  options: ReleaseGateEvaluationOptions,
): string[] {
  if (
    !validation.targetBindings ||
    !validation.rehearsalValidation ||
    typeof validation.markdown !== 'string' ||
    validation.markdown.trim().length === 0
  ) {
    return [
      `${prefix} must expose structured targetBindings, rehearsalValidation, and markdown provenance`,
    ];
  }

  const issues: string[] = [];
  const targetBindings = validation.targetBindings;
  for (const field of ['draft', 'livePreflight', 'postSubmitObserveJson', 'freshCheckpoint'] as const) {
    const value = targetBindings[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      issues.push(`${prefix}: targetBindings.${field} must be present`);
    }
  }
  if (
    typeof targetBindings.draft === 'string' &&
    targetBindings.draft.trim().length > 0 &&
    !isConcreteAssemblyDraftSourceTarget(targetBindings.draft)
  ) {
    issues.push(`${prefix}: targetBindings.draft must cite a concrete draft Markdown source target`);
  }

  issues.push(...validateAssemblyReportTargetBinding(
    prefix,
    'livePreflight',
    targetBindings.livePreflight,
    options.livePreflightJsonValidation?.target,
  ));
  issues.push(...validateAssemblyReportTargetBinding(
    prefix,
    'postSubmitObserveJson',
    targetBindings.postSubmitObserveJson,
    options.postSubmitObserveJsonValidation?.target,
  ));
  issues.push(...validateAssemblyReportTargetBinding(
    prefix,
    'freshCheckpoint',
    targetBindings.freshCheckpoint,
    options.freshCheckpointJsonValidation?.target,
  ));

  const rehearsalValidation = validation.rehearsalValidation;
  if (rehearsalValidation.status !== 'PASS') {
    issues.push(`${prefix}: rehearsalValidation.status must be PASS`);
  }
  if (!Array.isArray(rehearsalValidation.errors)) {
    issues.push(`${prefix}: rehearsalValidation.errors must be an array`);
  } else if (validationErrors(rehearsalValidation).length > 0) {
    issues.push(`${prefix}: rehearsalValidation.errors must be empty`);
  }
  const rehearsalValidationTarget = rehearsalValidation.target;
  if (
    typeof rehearsalValidationTarget !== 'string' ||
    rehearsalValidationTarget.trim().length === 0 ||
    !isConcreteEvidenceTarget(rehearsalValidationTarget) ||
    (
      options.liveRehearsalEvidenceValidation &&
      normalizeEvidenceTarget(rehearsalValidationTarget) !==
        normalizeEvidenceTarget(options.liveRehearsalEvidenceValidation.target)
    )
  ) {
    issues.push(`${prefix}: rehearsalValidation.target must match actual live rehearsal evidence validation target`);
  }
  issues.push(...validateAssemblyReportRehearsalValidationRows(validation, prefix));
  issues.push(...validateAssemblyReportRehearsalValidationFields(validation, prefix, options));

  const markdown = validation.markdown;
  if (hasContradictoryValidationFailureMarker(markdown)) {
    issues.push(`${prefix}: markdown provenance must not mix included/completed evidence with failure markers`);
  }
  if (!/\bAssembly status:\s*post-submit evidence included\b/i.test(markdown)) {
    issues.push(`${prefix}: markdown must prove post-submit evidence included`);
  }
  if (!/\bPost-submit fragment:\s*included\b/i.test(markdown)) {
    issues.push(`${prefix}: markdown must prove post-submit fragment included`);
  }
  if (!/\bFresh checkpoint lifecycle status:\s*publication blocker\b/i.test(markdown)) {
    issues.push(`${prefix}: markdown must preserve fresh checkpoint publication-blocker status`);
  }

  return issues;
}

function validateAssemblyReportRehearsalValidationRows(
  validation: AssemblyReportJsonValidationInput,
  prefix: string,
): string[] {
  const rehearsalValidation = isRecord(validation.rehearsalValidation)
    ? validation.rehearsalValidation
    : undefined;
  const rows = rehearsalValidation?.rows;
  if (!Array.isArray(rows)) {
    return [`${prefix}: rehearsalValidation must expose all structured lifecycle rows`];
  }
  return validateLiveRehearsalStructuredRows(
    {
      target: typeof rehearsalValidation?.target === 'string' ? rehearsalValidation.target : validation.target,
      status: 'PASS',
      errors: [],
      rows: rows as RehearsalEvidenceRow[],
    },
    `${prefix}: rehearsalValidation`,
  );
}

function validateAssemblyReportRehearsalValidationFields(
  validation: AssemblyReportJsonValidationInput,
  prefix: string,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const rehearsalValidation = isRecord(validation.rehearsalValidation)
    ? validation.rehearsalValidation
    : undefined;
  return validateLiveRehearsalStructuredFields(
    {
      target: typeof rehearsalValidation?.target === 'string' ? rehearsalValidation.target : validation.target,
      status: 'PASS',
      errors: [],
      sessionMetadata: rehearsalValidation?.sessionMetadata,
      publicationEvidence: rehearsalValidation?.publicationEvidence,
      reviewerSignoff: rehearsalValidation?.reviewerSignoff,
    },
    `${prefix}: rehearsalValidation`,
    'Fresh testnet lifecycle',
    options,
  );
}

function validateAssemblyReportTargetBinding(
  prefix: string,
  field: string,
  actual: unknown,
  expected?: string,
): string[] {
  if (typeof expected !== 'string' || expected.trim().length === 0) return [];
  if (typeof actual !== 'string' || actual.trim().length === 0) return [];
  if (normalizeEvidenceTarget(actual) === normalizeEvidenceTarget(expected)) return [];
  return [`${prefix}: targetBindings.${field} must match actual ${field} validation target`];
}

function isConcreteAssemblyDraftSourceTarget(target: string): boolean {
  const normalized = normalizeEvidenceTarget(target);
  return (
    normalized.length > 0 &&
    isMarkdownEvidenceTarget(normalized) &&
    /\bdraft\b/i.test(normalized) &&
    !/[<>]/.test(normalized) &&
    !/(?:template|example|sample|generic|placeholder|todo|tbd|validation|validate|log|transcript)/i.test(normalized)
  );
}

function validateCheckedPrepBundleJson(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.prepBundleJsonValidation;
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual prep-bundle JSON validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual prep-bundle JSON validation to pass`);
  }
  if (!isConcreteJsonEvidenceTarget(validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual prep-bundle JSON validation target must cite a concrete non-template prep-bundle JSON target`,
    );
  }
  if (!isValidatedPrepBundleJsonTargetLinked(row.requiredResolution, validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual prep-bundle JSON validation target must match a linked completed prep-bundle JSON report`,
    );
  }
  issues.push(...validatePrepBundleProvenanceSummary(
    validation,
    options,
    `${row.gate}: ${row.item}: actual prep-bundle JSON validation`,
  ));
  return issues;
}

function validateCheckedOfflineGateJson(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.offlineGateJsonValidation;
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual offline-gate JSON validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual offline-gate JSON validation to pass`);
  }
  if (!isValidatedOfflineGateJsonTargetLinked(row.requiredResolution, validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual offline-gate JSON validation target must match a linked completed offline-gate JSON report`,
    );
  }
  issues.push(...validateOfflineGateProvenanceSummary(
    validation,
    options,
    `${row.gate}: ${row.item}: actual offline-gate JSON validation`,
  ));
  return issues;
}

function validateCheckedWindowPrepJson(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.windowPrepJsonValidation;
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual testnet window-prep JSON validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual testnet window-prep JSON validation to pass`);
  }
  if (!isConcreteJsonEvidenceTarget(validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual testnet window-prep JSON validation target must cite a concrete non-template window-prep JSON target`,
    );
  }
  issues.push(...validateWindowPrepStructuredSummary(
    validation,
    options,
    `${row.gate}: ${row.item}: actual testnet window-prep JSON validation`,
  ));
  return issues;
}

function validateCheckedRecoveryObserveJson(
  row: PendingEvidenceRow,
  expectedKind: TestnetRecoveryDrillKind,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = findRecoveryObserveJsonValidation(options, expectedKind, row.requiredResolution);
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual ${expectedKind} recovery-observe JSON validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual ${expectedKind} recovery-observe JSON validation to pass`);
  }
  if (validation.kind !== expectedKind) {
    issues.push(`${row.gate}: ${row.item}: actual recovery-observe JSON validation kind must be ${expectedKind}`);
  }
  if (!isValidatedRecoveryObserveJsonTargetLinked(row.requiredResolution, validation.target, expectedKind)) {
    issues.push(
      `${row.gate}: ${row.item}: actual recovery-observe JSON validation target must match a linked completed ${expectedKind} recovery observe JSON report`,
    );
  }
  issues.push(...validateRecoveryObserveProvenanceSummary(
    validation,
    expectedKind,
    `${row.gate}: ${row.item}: actual recovery-observe JSON validation`,
  ));
  return issues;
}

function validateCheckedCleanCheckoutEvidence(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.cleanCheckoutEvidenceValidation;
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual clean checkout evidence validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual clean checkout evidence validation to pass`);
  }
  const evidencePayload = checkedEvidencePayload(row.requiredResolution);
  if (!isValidatedCleanCheckoutEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual clean checkout evidence validation target must match a linked completed clean checkout evidence document`,
    );
  }
  issues.push(...validateCleanCheckoutRunClassification(
    validation.classification,
    `${row.gate}: ${row.item}: Checked evidence`,
  ));
  issues.push(...validateCleanCheckoutPublicationDecision(
    validation.publicationDecision ?? {},
    `${row.gate}: ${row.item}: Checked evidence`,
  ));
  if (validationPassed(validation)) {
    issues.push(...validateCleanCheckoutStructuredSummary(
      validation,
      `${row.gate}: ${row.item}: actual clean checkout evidence validation`,
    ));
  }
  return issues;
}

function validateCheckedBackupRestoreEvidence(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.backupRestoreEvidenceValidation;
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual backup-restore evidence validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual backup-restore evidence validation to pass`);
  }
  const evidencePayload = checkedEvidencePayload(row.requiredResolution);
  if (!isValidatedBackupRestoreEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual backup-restore evidence validation target must match a linked completed backup-restore evidence document`,
    );
  }
  if (backupRestoreSupportsProductionCandidate(validation.classification)) {
    issues.push(...validateBackupRestoreDrillClassification(
      validation.classification,
      `${row.gate}: ${row.item}: Checked evidence`,
      options.cleanCheckoutEvidenceValidation?.classification?.gitCommit,
    ));
  } else {
    issues.push(...validateBackupRestoreFailClosedInstitutionalFields(
      validation,
      `${row.gate}: ${row.item}: Checked evidence`,
    ));
  }
  issues.push(...validateBackupRestoreStructuredSummary(
    validation,
    `${row.gate}: ${row.item}: actual backup-restore evidence validation`,
  ));
  return issues;
}

function validateCheckedDependencyReviewEvidence(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.dependencyReviewEvidenceValidation;
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual dependency review evidence validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual dependency review evidence validation to pass`);
  }
  const evidencePayload = checkedEvidencePayload(row.requiredResolution);
  if (!isValidatedDependencyReviewEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual dependency review evidence validation target must match a linked completed dependency review evidence document`,
    );
  }
  if (dependencyReviewSupportsProductionCandidate(validation.publicationDecision)) {
    issues.push(...validateDependencyReviewProductionCandidateFields(
      validation,
      `${row.gate}: ${row.item}: Checked evidence`,
      options.cleanCheckoutEvidenceValidation?.classification?.gitCommit,
    ));
  } else {
    issues.push(...validateDependencyReviewFailClosedInstitutionalFields(
      validation,
      `${row.gate}: ${row.item}: Checked evidence`,
    ));
  }
  if (validationPassed(validation)) {
    issues.push(...validateDependencyReviewStructuredSummary(
      validation,
      `${row.gate}: ${row.item}: actual dependency review evidence validation`,
    ));
  }
  return issues;
}

function validateCheckedSecurityReviewEvidence(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.securityReviewEvidenceValidation;
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual independent security review evidence validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual independent security review evidence validation to pass`);
  }
  const evidencePayload = checkedEvidencePayload(row.requiredResolution);
  if (!isValidatedSecurityReviewEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual independent security review evidence validation target must match a linked completed independent security review evidence document`,
    );
  }
  issues.push(...validateSecurityReviewProductionCandidateFields(
    validation,
    `${row.gate}: ${row.item}: Checked evidence`,
    options.cleanCheckoutEvidenceValidation?.classification?.gitCommit,
  ));
  if (validationPassed(validation)) {
    issues.push(...validateSecurityReviewStructuredSummary(
      validation,
      `${row.gate}: ${row.item}: actual independent security review evidence validation`,
    ));
  }
  return issues;
}

function validateCheckedTechnicalAddendumEvidence(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.technicalAddendumEvidenceValidation;
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual technical addendum evidence validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual technical addendum evidence validation to pass`);
  }
  const evidencePayload = checkedEvidencePayload(row.requiredResolution);
  if (!isValidatedTechnicalAddendumEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual technical addendum evidence validation target must match a linked completed technical addendum document`,
    );
  }
  issues.push(...validateTechnicalAddendumStructuredFields(
    validation,
    `${row.gate}: ${row.item}: actual technical addendum evidence validation`,
    options.cleanCheckoutEvidenceValidation?.classification?.gitCommit,
  ));
  if (validationPassed(validation)) {
    issues.push(...validateTechnicalAddendumStructuredSummary(
      validation,
      `${row.gate}: ${row.item}: actual technical addendum evidence validation`,
    ));
  }
  return issues;
}

function validateCheckedTrustlessBurnEvidence(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.trustlessBurnEvidenceValidation;
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual trustless burn evidence validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual trustless burn evidence validation to pass`);
  }
  const evidencePayload = checkedEvidencePayload(row.requiredResolution);
  if (!isValidatedTrustlessBurnEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual trustless burn evidence validation target must match a linked completed trustless burn evidence document`,
    );
  }
  issues.push(...validateTrustlessBurnProductionCandidateFields(
    validation,
    `${row.gate}: ${row.item}: Checked evidence`,
    options.cleanCheckoutEvidenceValidation?.classification?.gitCommit,
  ));
  if (validationPassed(validation)) {
    issues.push(...validateTrustlessBurnStructuredSummary(
      validation,
      `${row.gate}: ${row.item}: actual trustless burn evidence validation`,
    ));
  }
  return issues;
}

function validateCheckedBenchmarkEvidence(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.benchmarkEvidenceValidation;
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual benchmark evidence validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual benchmark evidence validation to pass`);
  }
  const evidencePayload = checkedEvidencePayload(row.requiredResolution);
  if (!isValidatedBenchmarkEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual benchmark evidence validation target must match a linked completed benchmark evidence document`,
    );
  }
  issues.push(...validateBenchmarkProductionCandidateFields(
    validation,
    `${row.gate}: ${row.item}: Checked evidence`,
    options.cleanCheckoutEvidenceValidation?.classification?.gitCommit,
  ));
  if (validationPassed(validation)) {
    issues.push(...validateBenchmarkStructuredSummary(
      validation,
      `${row.gate}: ${row.item}: actual benchmark evidence validation`,
      options,
    ));
  }
  return issues;
}

function validateCheckedCommitteeGovernanceEvidence(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.committeeGovernanceEvidenceValidation;
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual committee governance evidence validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual committee governance evidence validation to pass`);
  }
  const evidencePayload = checkedEvidencePayload(row.requiredResolution);
  if (!isValidatedCommitteeGovernanceEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual committee governance evidence validation target must match a linked completed committee governance evidence document`,
    );
  }
  issues.push(...validateCommitteeGovernanceProductionCandidateFields(
    validation,
    `${row.gate}: ${row.item}: Checked evidence`,
    options.cleanCheckoutEvidenceValidation?.classification?.gitCommit,
  ));
  if (validationPassed(validation)) {
    issues.push(...validateCommitteeGovernanceStructuredSummary(
      validation,
      `${row.gate}: ${row.item}: actual committee governance evidence validation`,
    ));
  }
  return issues;
}

function validateCheckedOperatorReadinessEvidence(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.operatorReadinessEvidenceValidation;
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual operator readiness evidence validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual operator readiness evidence validation to pass`);
  }
  const evidencePayload = checkedEvidencePayload(row.requiredResolution);
  if (!isValidatedOperatorReadinessEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual operator readiness evidence validation target must match a linked completed operator readiness evidence document`,
    );
  }
  issues.push(...validateOperatorReadinessProductionCandidateFields(
    validation,
    `${row.gate}: ${row.item}: Checked evidence`,
    options.cleanCheckoutEvidenceValidation?.classification?.gitCommit,
  ));
  if (validationPassed(validation)) {
    issues.push(...validateOperatorReadinessStructuredSummary(
      validation,
      `${row.gate}: ${row.item}: actual operator readiness evidence validation`,
    ));
  }
  return issues;
}

function validateCheckedExternalIntegrationEvidence(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.externalIntegrationEvidenceValidation;
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual external integration evidence validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual external integration evidence validation to pass`);
  }
  const evidencePayload = checkedEvidencePayload(row.requiredResolution);
  if (!isValidatedExternalIntegrationEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual external integration evidence validation target must match a linked completed external integration evidence document`,
    );
  }
  issues.push(...validateExternalIntegrationInstitutionalReferenceFields(
    validation,
    `${row.gate}: ${row.item}: Checked evidence`,
    options.cleanCheckoutEvidenceValidation?.classification?.gitCommit,
  ));
  if (validationPassed(validation)) {
    issues.push(...validateExternalIntegrationStructuredSummary(
      validation,
      `${row.gate}: ${row.item}: actual external integration evidence validation`,
    ));
  }
  return issues;
}

function validateBackupRestoreStructuredSummary(
  validation: BackupRestoreEvidenceValidationInput,
  prefix: string,
): string[] {
  if (
    !Array.isArray(validation.commandRows) ||
    !Array.isArray(validation.stateRows) ||
    !Array.isArray(validation.boundaryRows) ||
    !Array.isArray(validation.stopConditionRows) ||
    !Array.isArray(validation.reviewerRows) ||
    !validation.publicationEvidence ||
    !validation.snapshotProvenance
  ) {
    return [
      `${prefix} must expose structured command, state, boundary, stop-condition, reviewer, and publication evidence rows`,
    ];
  }

  const backupRestoreEvidenceTargets = new Map<string, string>();
  const commandRowObjects = structuredRowObjects(validation.commandRows);
  const stateRowObjects = structuredRowObjects(validation.stateRows);
  const boundaryRowObjects = structuredRowObjects(validation.boundaryRows);
  const stopConditionRowObjects = structuredRowObjects(validation.stopConditionRows);
  const reviewerRowObjects = structuredRowObjects(validation.reviewerRows);
  const publicationRows = backupRestorePublicationEvidenceRows(validation.publicationEvidence);

  const issues = [
    ...validateStructuredRowObjects(`${prefix}: commandRows`, validation.commandRows),
    ...validateStructuredRowObjects(`${prefix}: stateRows`, validation.stateRows),
    ...validateStructuredRowObjects(`${prefix}: boundaryRows`, validation.boundaryRows),
    ...validateStructuredRowObjects(`${prefix}: stopConditionRows`, validation.stopConditionRows),
    ...validateStructuredRowObjects(`${prefix}: reviewerRows`, validation.reviewerRows),
    ...validateRequiredLinkedRows(
      `${prefix}: commandRows`,
      commandRowObjects,
      'step',
      REQUIRED_BACKUP_RESTORE_COMMAND_STEPS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: stateRows`,
      stateRowObjects,
      'check',
      REQUIRED_BACKUP_RESTORE_STATE_CHECKS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: boundaryRows`,
      boundaryRowObjects,
      'boundary',
      REQUIRED_BACKUP_RESTORE_BOUNDARIES,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: stopConditionRows`,
      stopConditionRowObjects,
      'stopCondition',
      REQUIRED_BACKUP_RESTORE_STOP_CONDITIONS,
    ),
    ...validateBackupRestoreCommandEvidenceRows(prefix, commandRowObjects),
    ...validateBackupRestoreStateEvidenceRows(prefix, stateRowObjects),
    ...validateBackupRestoreBoundaryEvidenceRows(prefix, boundaryRowObjects),
    ...validateBackupRestoreStopConditionEvidenceRows(prefix, stopConditionRowObjects),
    ...validateRequiredReviewerRows(
      prefix,
      reviewerRowObjects,
      validation.classification?.reviewer,
      validation.classification?.date,
    ),
    ...validateBackupRestoreStateConsistency(prefix, stateRowObjects),
    ...validateBackupRestorePublicationEvidence(prefix, validation.publicationEvidence),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: commandRows`,
      commandRowObjects,
      'step',
      'requiredEvidence',
      backupRestoreEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: stateRows`,
      stateRowObjects,
      'check',
      'evidence',
      backupRestoreEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: boundaryRows`,
      boundaryRowObjects,
      'boundary',
      'requiredEvidence',
      backupRestoreEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: stopConditionRows`,
      stopConditionRowObjects,
      'stopCondition',
      'requiredResolution',
      backupRestoreEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: publicationEvidence`,
      publicationRows,
      'name',
      'evidence',
      backupRestoreEvidenceTargets,
    ),
    ...validateBackupRestoreSnapshotProvenance(prefix, validation.snapshotProvenance),
  ];

  return issues;
}

function backupRestorePublicationEvidenceRows(
  publicationEvidence: BackupRestorePublicationEvidenceFields,
): { name: string; evidence: string; status: string }[] {
  return [
    {
      name: 'Required release-note updates',
      evidence: publicationEvidence.requiredReleaseNoteUpdates ?? '',
      status: 'linked',
    },
    {
      name: 'Required checklist updates',
      evidence: publicationEvidence.requiredChecklistUpdates ?? '',
      status: 'linked',
    },
  ];
}

function validateRequiredLinkedRows<T extends { status: string }>(
  prefix: string,
  rows: T[],
  nameKey: keyof T,
  requiredNames: readonly string[],
): string[] {
  const issues: string[] = [];
  issues.push(...validateDuplicateStructuredRows(prefix, rows, nameKey));
  const rowsByName = new Map<string, T>(
    rows.map(row => {
      const name = row[nameKey];
      return [typeof name === 'string' ? name : '', row] as const;
    }),
  );
  const missing = requiredNames.filter(name => !rowsByName.has(name));
  if (missing.length > 0) {
    issues.push(`${prefix} must include required linked rows: ${missing.join(', ')}`);
  }
  for (const name of requiredNames) {
    const row = rowsByName.get(name);
    if (!row) continue;
    if (row.status !== 'linked') {
      issues.push(`${prefix}: ${name}: status must be linked`);
    }
  }
  return issues;
}

function validateStructuredRowObjects(
  prefix: string,
  rows: unknown[],
): string[] {
  const issues: string[] = [];
  for (const [index, row] of rows.entries()) {
    if (!isRecord(row)) {
      issues.push(`${prefix}: entry ${index} must be an object`);
    }
  }
  return issues;
}

function structuredRowObjects<T>(rows: T[]): T[] {
  return rows.filter(row => isRecord(row));
}

function validateDuplicateStructuredRows<T>(
  prefix: string,
  rows: T[],
  nameKey: keyof T,
): string[] {
  return findDuplicateStringValues(rows, nameKey).map(
    name => `${prefix}: ${name}: duplicate required row`,
  );
}

function validateDistinctStructuredEvidenceTargets<T extends { status: string }>(
  prefix: string,
  rows: T[],
  nameKey: keyof T,
  evidenceKey: keyof T,
  seenTargets = new Map<string, string>(),
  evidenceStatuses: ReadonlySet<string> = new Set(['linked']),
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => evidenceStatuses.has(candidate.status))) {
    const name = row[nameKey];
    const evidence = row[evidenceKey];
    if (typeof name !== 'string' || typeof evidence !== 'string') continue;
    const label = name.trim();
    if (label.length === 0) continue;

    const targets = [...new Set(
      extractEvidenceTargets(evidence)
        .map(normalizeEvidenceTarget)
        .filter(target => isConcreteEvidenceTarget(target)),
    )];
    for (const target of targets) {
      const previous = seenTargets.get(target);
      if (previous && previous !== label) {
        issues.push(`${prefix} evidence target ${target} is reused by ${previous} and ${label}`);
        continue;
      }
      seenTargets.set(target, label);
    }
  }
  return issues;
}

function findDuplicateStringValues<T>(
  rows: T[],
  nameKey: keyof T,
): string[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[nameKey];
    if (typeof value !== 'string') continue;
    const name = value.trim();
    if (name.length === 0) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
}

function validateBackupRestoreCommandEvidenceRows(
  prefix: string,
  rows: RecoveryCommandRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (!hasNoContradictoryBackupRestoreEvidenceMarker(row.requiredEvidence ?? '')) {
      issues.push(
        `${prefix}: commandRows: ${row.step} must not include contradictory backup-restore failure markers`,
      );
    }
    if (!hasCompletedBackupRestoreCommandEvidence(row.step, row.requiredEvidence)) {
      issues.push(
        `${prefix}: commandRows: ${row.step} requires command-specific completed backup-restore command evidence`,
      );
    }
  }
  return issues;
}

function validateBackupRestoreStateEvidenceRows(
  prefix: string,
  rows: StateConsistencyRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (!hasNoContradictoryBackupRestoreEvidenceMarker(row.evidence ?? '')) {
      issues.push(
        `${prefix}: stateRows: ${row.check} must not include contradictory backup-restore failure markers`,
      );
    }
    if (!hasCompletedBackupRestoreStateEvidence(
      row.check,
      row.preBackupValue,
      row.restoredValue,
      row.evidence,
    )) {
      issues.push(
        `${prefix}: stateRows: ${row.check} requires state-specific completed backup-restore evidence with measured pre-backup/restored values`,
      );
    }
  }
  return issues;
}

function validateBackupRestoreBoundaryEvidenceRows(
  prefix: string,
  rows: ReconstructibilityBoundaryRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (!hasNoContradictoryBackupRestoreEvidenceMarker(row.requiredEvidence ?? '')) {
      issues.push(
        `${prefix}: boundaryRows: ${row.boundary} must not include contradictory backup-restore failure markers`,
      );
    }
    if (!hasCompletedBackupRestoreBoundaryEvidence(row.boundary, row.requiredEvidence)) {
      issues.push(
        `${prefix}: boundaryRows: ${row.boundary} requires boundary-specific completed backup-restore evidence`,
      );
    }
  }
  return issues;
}

function validateBackupRestoreStopConditionEvidenceRows(
  prefix: string,
  rows: StopConditionRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (!hasNoContradictoryBackupRestoreEvidenceMarker(row.requiredResolution ?? '')) {
      issues.push(
        `${prefix}: stopConditionRows: ${row.stopCondition} must not include contradictory backup-restore failure markers`,
      );
    }
    if (!hasCompletedBackupRestoreStopConditionResolution(row.stopCondition, row.requiredResolution)) {
      issues.push(
        `${prefix}: stopConditionRows: ${row.stopCondition} requires condition-specific completed backup-restore stop-condition evidence`,
      );
    }
  }
  return issues;
}

function validateRequiredReviewerRows(
  prefix: string,
  rows: ReviewerSignoffRow[],
  classificationReviewer?: string,
  classificationDate?: string,
): string[] {
  const issues: string[] = [];
  issues.push(...validateDuplicateStructuredRows(`${prefix}: reviewerRows`, rows, 'role'));
  const normalizedClassificationDate = classificationDate?.trim() ?? '';
  const classificationDateIsValid = isIsoCalendarDate(normalizedClassificationDate);
  if (normalizedClassificationDate.length > 0 && !classificationDateIsValid) {
    issues.push(`${prefix}: reviewerRows require Drill Classification Date to use YYYY-MM-DD`);
  }
  const rowsByRole = new Map(rows.map(row => [row.role, row]));
  const missing = REQUIRED_BACKUP_RESTORE_REVIEWER_ROLES.filter(role => !rowsByRole.has(role));
  if (missing.length > 0) {
    issues.push(`${prefix}: reviewerRows must include required reviewer roles: ${missing.join(', ')}`);
  }
  for (const role of REQUIRED_BACKUP_RESTORE_REVIEWER_ROLES) {
    const row = rowsByRole.get(role);
    if (!row) continue;
    if (row.decision !== 'approve') {
      issues.push(`${prefix}: reviewerRows: ${role}: decision must be approve`);
    }
    if (role === 'Restore operator' && classificationReviewer && row.name !== classificationReviewer) {
      issues.push(`${prefix}: reviewerRows: ${role}: name must match Drill Classification Reviewer`);
    }
    if (isBlankValue(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must use YYYY-MM-DD`);
    } else if (classificationDateIsValid && row.date < normalizedClassificationDate) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must not be before Drill Classification Date`);
    }
    if (!isActionableBackupRestoreReviewerNote(row.notes ?? '')) {
      issues.push(`${prefix}: reviewerRows: ${role} requires actionable backup-restore outcome notes`);
    }
    issues.push(...validateBackupRestoreReviewerNoteClaimBoundary(prefix, row));
  }
  return issues;
}

function validateBackupRestoreReviewerNoteClaimBoundary(
  prefix: string,
  row: ReviewerSignoffRow,
): string[] {
  const notes = row.notes ?? '';
  if (notes.trim().length === 0) return [];

  const claim = classifyPublicationClaimText(notes);
  const issues: string[] = [];
  if (claim.hasMainnetProductionClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain mainnet production claim wording`);
  }
  if (claim.hasProductionReadyClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain production-ready claim wording`);
  }
  if (backupRestoreReviewerNoteApprovesTestnetCandidateClaim(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve testnet production-candidate claim wording`);
  }
  if (backupRestoreReviewerNoteApprovesRuntimeStateMutation(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve runtime state mutation`);
  }
  if (backupRestoreReviewerNoteApprovesUnreviewedLiveRuntimeRestore(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve unreviewed live/runtime restore target`);
  }
  if (backupRestoreReviewerNoteApprovesStagedRuntimeArtifacts(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve staged runtime backup artifacts`);
  }
  if (backupRestoreReviewerNoteApprovesUnresolvedMismatch(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve unresolved backup-restore mismatches`);
  }
  if (!hasNoContradictoryBackupRestoreEvidenceMarker(notes)) {
    issues.push(
      `${prefix}: reviewerRows: ${row.role} notes must not include contradictory backup-restore failure markers`,
    );
  }
  return issues;
}

function backupRestoreReviewerNoteApprovesTestnetCandidateClaim(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  const approval = backupRestoreReviewerApprovalTermsForReleaseGate();
  return (
    new RegExp(`\\btestnet production candidate\\b(?:\\s+[a-z0-9]+){0,8}\\s+\\b${approval}\\b`, 'i')
      .test(normalized) ||
    new RegExp(`\\b${approval}\\b(?:\\s+[a-z0-9]+){0,8}\\s+\\btestnet production candidate\\b`, 'i')
      .test(normalized)
  );
}

function backupRestoreReviewerNoteApprovesRuntimeStateMutation(value: string): boolean {
  return normalizeDecisionSummarySegmentsForReleaseGate(value).some(normalized =>
    backupRestoreReviewerTextApprovesSubject(
      normalized,
      '(?:runtime\\s+state\\s+mutation|runtime\\s+database\\s+mutation|mutat(?:e|ed|ion)\\s+runtime\\s+state|manual\\s+sqlite\\s+edit)',
      backupRestoreReviewerApprovalTermsForReleaseGate(),
    ),
  );
}

function backupRestoreReviewerNoteApprovesUnreviewedLiveRuntimeRestore(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  const approval = backupRestoreReviewerApprovalTermsForReleaseGate();
  return (
    new RegExp(
      `\\b(?:unreviewed|not reviewed|without review|no review)\\b.{0,80}\\b` +
        `(?:live|runtime|production|relayer database|runtime database)\\b.{0,80}\\brestore\\b.{0,80}\\b${approval}\\b`,
      'i',
    ).test(normalized) ||
    new RegExp(
      `\\b${approval}\\b.{0,80}\\b(?:unreviewed|not reviewed|without review|no review)\\b.{0,80}\\b` +
        `(?:live|runtime|production|relayer database|runtime database)\\b.{0,80}\\brestore\\b`,
      'i',
    ).test(normalized)
  );
}

function backupRestoreReviewerNoteApprovesUnresolvedMismatch(value: string): boolean {
  return normalizeDecisionSummarySegmentsForReleaseGate(value).some(normalized =>
    backupRestoreReviewerTextApprovesSubject(
      normalized,
      '(?:(?:unresolved|open|remaining|outstanding|not\\s+resolved)\\s+' +
        '(?:backup\\s+restore|restore|state|snapshot|dup|spv|digest)?\\s*mismatch(?:es)?|' +
        '(?:backup\\s+restore|restore|state|snapshot|dup|spv|digest)?\\s*mismatch(?:es)?\\s+' +
        '(?:unresolved|open|remaining|outstanding|not\\s+resolved))',
      backupRestoreReviewerApprovalTermsForReleaseGate(),
    ),
  );
}

function backupRestoreReviewerNoteApprovesStagedRuntimeArtifacts(value: string): boolean {
  return normalizeDecisionSummarySegmentsForReleaseGate(value).some(normalized =>
    backupRestoreReviewerTextApprovesSubject(
      normalized,
      '(?:runtime backup files(?:\\s+(?:in|from))?\\s+(?:git status|staged|status)|' +
        'staged(?:\\s+[a-z0-9]+){0,2}\\s+runtime(?:\\s+[a-z0-9]+){0,2}\\s+' +
        '(?:backup|backups|artifact|artifacts|database|sqlite))',
      backupRestoreReviewerApprovalTermsForReleaseGate(),
    ),
  );
}

function backupRestoreReviewerApprovalTermsForReleaseGate(): string {
  return '(?:accepted|accepts|accept|approved|approves|approve|allowed|allows|allow|enabled|enables|enable|supported|supports|support|permitted|permits|permit|cleared|clears|clear|granted|grants|grant|authori[sz]ed|authori[sz]es|authori[sz]e|certified|certifies|certify|endorsed|endorses|endorse|recommended|recommends|recommend|accredited|accredits|accredit)';
}

function backupRestoreReviewerBlockedContextForReleaseGate(value: string): boolean {
  return /\b(blocked|forbidden|not allowed|disabled|rejected|refused|no|denied)\b/i.test(value);
}

function backupRestoreReviewerTextApprovesSubject(
  normalized: string,
  subject: string,
  approval: string,
): boolean {
  const approvalConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,3}';
  const approvalSubjectConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,1}';

  return [
    new RegExp(`\\b${subject}\\b${approvalConnector}\\s+${approval}\\b`, 'gi'),
    new RegExp(`\\b${approval}\\b${approvalSubjectConnector}\\s+${subject}\\b`, 'gi'),
  ].some(pattern => hasUnnegatedBackupRestoreReviewerApprovalForReleaseGate(normalized, pattern));
}

function hasUnnegatedBackupRestoreReviewerApprovalForReleaseGate(normalized: string, pattern: RegExp): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 32), index);
    if (!/\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?\s+$/.test(prefix)) return true;
  }
  return false;
}

function validateCleanCheckoutStructuredSummary(
  validation: CleanCheckoutEvidenceValidationInput,
  prefix: string,
): string[] {
  const commandRows = validation.commandRows;
  const workflowRows = validation.workflowRows;
  const decisionRows = validation.decisionRows;
  const reviewerRows = validation.reviewerRows;

  if (
    !Array.isArray(commandRows) ||
    !Array.isArray(workflowRows) ||
    !Array.isArray(decisionRows) ||
    !Array.isArray(reviewerRows)
  ) {
    return [
      `${prefix} must expose structured command, workflow, decision, reviewer rows`,
    ];
  }

  const commandRowObjects = structuredRowObjects(commandRows);
  const workflowRowObjects = structuredRowObjects(workflowRows);
  const decisionRowObjects = structuredRowObjects(decisionRows);
  const reviewerRowObjects = structuredRowObjects(reviewerRows);
  const cleanCheckoutEvidenceTargets = new Map<string, string>();

  return [
    ...validateStructuredRowObjects(`${prefix}: commandRows`, commandRows),
    ...validateStructuredRowObjects(`${prefix}: workflowRows`, workflowRows),
    ...validateStructuredRowObjects(`${prefix}: decisionRows`, decisionRows),
    ...validateStructuredRowObjects(`${prefix}: reviewerRows`, reviewerRows),
    ...validateRequiredLinkedRows(
      `${prefix}: commandRows`,
      commandRowObjects,
      'command',
      REQUIRED_CLEAN_CHECKOUT_COMMANDS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: workflowRows`,
      workflowRowObjects,
      'requirement',
      REQUIRED_CLEAN_CHECKOUT_WORKFLOW_REQUIREMENTS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: decisionRows`,
      decisionRowObjects,
      'decision',
      REQUIRED_CLEAN_CHECKOUT_REPRODUCIBILITY_DECISIONS,
    ),
    ...validateCleanCheckoutCommandEvidenceRows(prefix, commandRowObjects),
    ...validateCleanCheckoutWorkflowEvidenceRows(prefix, workflowRowObjects, validation.classification),
    ...validateCleanCheckoutDecisionEvidenceRows(prefix, decisionRowObjects),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: commandRows`,
      commandRowObjects,
      'command',
      'evidence',
      cleanCheckoutEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: workflowRows`,
      workflowRowObjects,
      'requirement',
      'workflowEvidence',
      cleanCheckoutEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: decisionRows`,
      decisionRowObjects,
      'decision',
      'requiredEvidence',
      cleanCheckoutEvidenceTargets,
    ),
    ...validateRequiredCleanCheckoutReviewerRows(
      prefix,
      reviewerRowObjects,
      validation.classification?.reviewer,
      validation.classification?.date,
    ),
  ];
}

function validateCleanCheckoutCommandEvidenceRows(
  prefix: string,
  rows: CleanCheckoutCommandRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    const hasNoContradictoryMarkers = hasNoContradictoryCleanCheckoutCommandEvidenceMarker(
      row.command,
      row.expectedResult,
      row.evidence,
    );
    if (!hasNoContradictoryMarkers) {
      issues.push(
        `${prefix}: commandRows: ${row.command} must not include contradictory clean-checkout failure markers`,
      );
    }
    if (!hasNoContradictoryMarkers) {
      issues.push(
        `${prefix}: commandRows: ${row.command} requires internally positive clean-checkout output evidence`,
      );
    } else if (
      !hasCleanCheckoutCommandExpectedResult(row.command, row.expectedResult) ||
      !hasCompletedCleanCheckoutCommandEvidence(row.command, row.evidence)
    ) {
      issues.push(
        `${prefix}: commandRows: ${row.command} requires command-specific completed clean-checkout output evidence`,
      );
    }
  }
  return issues;
}

function isCleanCheckoutPassExpectedResult(expectedResult: string): boolean {
  return /^(pass|passed|ok)$/i.test(expectedResult.trim());
}

function validateCleanCheckoutWorkflowEvidenceRows(
  prefix: string,
  rows: WorkflowEvidenceRow[],
  classification?: CleanCheckoutRunClassification,
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (!hasNoContradictoryCleanCheckoutEvidenceMarker(row.workflowEvidence)) {
      issues.push(
        `${prefix}: workflowRows: ${row.requirement} must not include contradictory clean-checkout failure markers`,
      );
    }
    if (!hasCompletedCleanCheckoutWorkflowEvidence(row.requirement, row.workflowEvidence, classification)) {
      issues.push(
        `${prefix}: workflowRows: ${row.requirement} requires completed workflow evidence with workflow-specific facts`,
      );
    }
  }
  return issues;
}

function validateCleanCheckoutDecisionEvidenceRows(
  prefix: string,
  rows: ReproducibilityDecisionRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (!hasNoContradictoryCleanCheckoutDecisionEvidenceMarker(row.decision, row.requiredEvidence)) {
      issues.push(
        `${prefix}: decisionRows: ${row.decision} must not include contradictory clean-checkout failure markers`,
      );
    }
    if (
      !hasCompletedCleanCheckoutDecisionEvidence(row.decision, row.requiredEvidence) ||
      !hasCleanCheckoutDecisionPublicationImpact(row.decision, row.publicationImpact)
    ) {
      issues.push(
        `${prefix}: decisionRows: ${row.decision} requires completed reproducibility evidence and decision-specific publication impact`,
      );
    }
  }
  return issues;
}

function validateRequiredCleanCheckoutReviewerRows(
  prefix: string,
  rows: CleanCheckoutReviewerSignoffRow[],
  classificationReviewer?: string,
  classificationDate?: string,
): string[] {
  const issues: string[] = [];
  issues.push(...validateDuplicateStructuredRows(`${prefix}: reviewerRows`, rows, 'role'));
  const normalizedClassificationDate = classificationDate?.trim() ?? '';
  const classificationDateIsValid = isIsoCalendarDate(normalizedClassificationDate);
  if (normalizedClassificationDate.length > 0 && !classificationDateIsValid) {
    issues.push(`${prefix}: reviewerRows require Run Classification Date to use YYYY-MM-DD`);
  }
  const rowsByRole = new Map(rows.map(row => [row.role, row]));
  const missing = REQUIRED_CLEAN_CHECKOUT_REVIEWER_ROLES.filter(role => !rowsByRole.has(role));
  if (missing.length > 0) {
    issues.push(`${prefix}: reviewerRows must include required reviewer roles: ${missing.join(', ')}`);
  }
  for (const role of REQUIRED_CLEAN_CHECKOUT_REVIEWER_ROLES) {
    const row = rowsByRole.get(role);
    if (!row) continue;
    if (row.decision !== 'approve') {
      issues.push(`${prefix}: reviewerRows: ${role}: decision must be approve`);
    }
    if (role === 'CI reviewer' && classificationReviewer && row.name !== classificationReviewer) {
      issues.push(`${prefix}: reviewerRows: ${role}: name must match Run Classification Reviewer`);
    }
    if (isBlankValue(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must use YYYY-MM-DD`);
    } else if (classificationDateIsValid && row.date < normalizedClassificationDate) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must not be before Run Classification Date`);
    }
    if (!isActionableCleanCheckoutReviewerNote(row.notes ?? '')) {
      issues.push(`${prefix}: reviewerRows: ${role} requires actionable clean-checkout outcome notes`);
    }
    issues.push(...validateCleanCheckoutReviewerNoteClaimBoundary(prefix, row));
  }
  return issues;
}

function validateCleanCheckoutReviewerNoteClaimBoundary(
  prefix: string,
  row: CleanCheckoutReviewerSignoffRow,
): string[] {
  const notes = row.notes ?? '';
  if (notes.trim().length === 0) return [];

  const claim = classifyPublicationClaimText(notes);
  const issues: string[] = [];
  if (claim.hasMainnetProductionClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain mainnet production claim wording`);
  }
  if (claim.hasProductionReadyClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain production-ready claim wording`);
  }
  if (cleanCheckoutReviewerNoteApprovesFailedCi(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve failed CI`);
  }
  if (cleanCheckoutReviewerNoteApprovesNonZeroStructuralIssues(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve non-zero structural issues`);
  }
  if (!hasNoContradictoryCleanCheckoutReviewerNoteMarker(notes)) {
    issues.push(
      `${prefix}: reviewerRows: ${row.role} notes must not include contradictory clean-checkout failure markers`,
    );
  }
  return issues;
}

function cleanCheckoutReviewerNoteApprovesFailedCi(value: string): boolean {
  const approval = cleanCheckoutReviewerApprovalTermsForReleaseGate();
  const subject =
    '(?:(?:failed|failing|red|blocked|error)\\s+(?:clean checkout\\s+)?(?:ci|workflow)|(?:clean checkout\\s+)?(?:ci|workflow)\\s+(?:failed|failing|red|blocked|error))';
  return releaseGateReviewerTextSegments(value).some(segment =>
    releaseGateReviewerTextApprovesSubject(segment, subject, approval)
  );
}

function cleanCheckoutReviewerNoteApprovesNonZeroStructuralIssues(value: string): boolean {
  const approval = cleanCheckoutReviewerApprovalTermsForReleaseGate();
  const subject =
    '(?:(?:release gate\\s+)?structural issues?\\s+(?!0\\b)\\d+|non\\s+zero\\s+(?:release gate\\s+)?structural issues?)';
  return releaseGateReviewerTextSegments(value).some(segment =>
    releaseGateReviewerTextApprovesSubject(segment, subject, approval)
  );
}

function cleanCheckoutReviewerApprovalTermsForReleaseGate(): string {
  return '(?:accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|enable|enabled|enables|support|supported|supports|permit|permitted|permits|clear|cleared|clears|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits)';
}

function releaseGateReviewerTextApprovesSubject(
  segment: string,
  subjectPattern: string,
  approvalPattern: string,
): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(segment);
  const denialOrBoundaryTerm =
    '(?:no|not|never|without|absence|absent|lack|lacks|lacking|but|however|though|although|except|unless)';
  const denialOrBoundaryPrefix =
    /\b(?:no|not|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?\s+$/;
  const approvalConnector = `(?:\\s+(?!\\b${denialOrBoundaryTerm}\\b)[a-z0-9/-]+){0,12}\\s+`;
  return [
    new RegExp(`\\b${approvalPattern}\\b${approvalConnector}(?:${subjectPattern})\\b`, 'g'),
    new RegExp(`\\b(?:${subjectPattern})\\b${approvalConnector}${approvalPattern}\\b`, 'g'),
  ].some(pattern => {
    for (const match of normalized.matchAll(pattern)) {
      const index = match.index ?? 0;
      const prefix = normalized.slice(Math.max(0, index - 32), index);
      if (!denialOrBoundaryPrefix.test(prefix)) return true;
    }
    return false;
  });
}

function releaseGateReviewerTextSegments(value: string): string[] {
  return value
    .split(/[\n\r|;]+|[.]\s+/)
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0);
}

function validateDependencyReviewStructuredSummary(
  validation: DependencyReviewEvidenceValidationInput,
  prefix: string,
): string[] {
  const commandRows = validation.commandRows;
  const scopeRows = validation.scopeRows;
  const triageRows = validation.triageRows;
  const upgradeRows = validation.upgradeRows;
  const reviewerRows = validation.reviewerRows;

  if (
    !Array.isArray(commandRows) ||
    !Array.isArray(scopeRows) ||
    !Array.isArray(triageRows) ||
    !Array.isArray(upgradeRows) ||
    !Array.isArray(reviewerRows)
  ) {
    return [
      `${prefix} must expose structured command, scope, triage, upgrade, reviewer rows`,
    ];
  }

  const commandRowObjects = structuredRowObjects(commandRows);
  const scopeRowObjects = structuredRowObjects(scopeRows);
  const triageRowObjects = structuredRowObjects(triageRows);
  const upgradeRowObjects = structuredRowObjects(upgradeRows);
  const reviewerRowObjects = structuredRowObjects(reviewerRows);
  const dependencyReviewEvidenceTargets = new Map<string, string>();

  return [
    ...validateStructuredRowObjects(`${prefix}: commandRows`, commandRows),
    ...validateStructuredRowObjects(`${prefix}: scopeRows`, scopeRows),
    ...validateStructuredRowObjects(`${prefix}: triageRows`, triageRows),
    ...validateStructuredRowObjects(`${prefix}: upgradeRows`, upgradeRows),
    ...validateStructuredRowObjects(`${prefix}: reviewerRows`, reviewerRows),
    ...validateRequiredLinkedRows(
      `${prefix}: commandRows`,
      commandRowObjects,
      'command',
      REQUIRED_DEPENDENCY_REVIEW_COMMANDS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: scopeRows`,
      scopeRowObjects,
      'dependency',
      REQUIRED_DEPENDENCY_REVIEW_DEPENDENCIES,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: triageRows`,
      triageRowObjects,
      'triageItem',
      REQUIRED_DEPENDENCY_REVIEW_TRIAGE_ITEMS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: upgradeRows`,
      upgradeRowObjects,
      'decision',
      REQUIRED_DEPENDENCY_REVIEW_UPGRADE_DECISIONS,
    ),
    ...validateDependencyReviewCommandEvidenceRows(prefix, commandRowObjects),
    ...validateDependencyReviewScopeEvidenceRows(prefix, scopeRowObjects),
    ...validateDependencyReviewTriageEvidenceRows(prefix, triageRowObjects),
    ...validateDependencyReviewUpgradeEvidenceRows(prefix, upgradeRowObjects),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: commandRows`,
      commandRowObjects,
      'command',
      'evidence',
      dependencyReviewEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: scopeRows`,
      scopeRowObjects,
      'dependency',
      'evidence',
      dependencyReviewEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: triageRows`,
      triageRowObjects,
      'triageItem',
      'evidence',
      dependencyReviewEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: upgradeRows`,
      upgradeRowObjects,
      'decision',
      'requiredEvidence',
      dependencyReviewEvidenceTargets,
    ),
    ...validateRequiredDependencyReviewReviewerRows(
      prefix,
      reviewerRowObjects,
      validation.classification?.reviewer,
      validation.classification?.date,
    ),
    ...validateDependencyReviewTriageFindings(prefix, triageRowObjects),
    ...validateDependencyReviewSignerConformance(prefix, validation, upgradeRowObjects),
  ];
}

function validateDependencyReviewCommandEvidenceRows(
  prefix: string,
  rows: DependencyCommandRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (!hasNoContradictoryDependencyEvidenceMarker(row.evidence ?? '')) {
      issues.push(
        `${prefix}: commandRows: ${row.command} must not include contradictory dependency failure markers`,
      );
    }
    if (!hasInternallyPositiveDependencyCommandOutput(row.evidence)) {
      issues.push(
        `${prefix}: commandRows: ${row.command} requires internally positive dependency command output evidence`,
      );
    }
    if (!hasCompletedDependencyCommandEvidence(row.command, row.evidence)) {
      issues.push(
        `${prefix}: commandRows: ${row.command} requires command-specific completed dependency command output evidence`,
      );
    }
  }
  return issues;
}

function validateDependencyReviewScopeEvidenceRows(
  prefix: string,
  rows: DependencyScopeRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (!hasNoContradictoryDependencyEvidenceMarker(row.evidence ?? '')) {
      issues.push(
        `${prefix}: scopeRows: ${row.dependency} must not include contradictory dependency failure markers`,
      );
    }
    if (
      row.source.trim().length === 0 ||
      !hasDependencyReviewScopeRiskFocus(row.dependency, row.reviewedRisk) ||
      !hasCompletedDependencyScopeEvidence(row.dependency, row.evidence)
    ) {
      issues.push(
        `${prefix}: scopeRows: ${row.dependency} requires dependency-specific source, risk, and completed evidence`,
      );
    }
  }
  return issues;
}

function validateDependencyReviewTriageEvidenceRows(
  prefix: string,
  rows: VulnerabilityTriageRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (!hasNoContradictoryDependencyEvidenceMarker(row.evidence ?? '')) {
      issues.push(
        `${prefix}: triageRows: ${row.triageItem} must not include contradictory dependency failure markers`,
      );
    }
    if (
      row.toolOrReviewMethod.trim().length === 0 ||
      !hasCompletedDependencyEvidenceTarget(row.evidence) ||
      !hasNoContradictoryDependencyEvidenceMarker(row.evidence) ||
      !hasDependencyTriageZeroCriticalHigh(row.findings)
    ) {
      issues.push(
        `${prefix}: triageRows: ${row.triageItem} requires completed triage evidence and explicit zero critical/high findings`,
      );
    }
  }
  return issues;
}

function validateDependencyReviewUpgradeEvidenceRows(
  prefix: string,
  rows: UpgradeDecisionRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (!hasNoContradictoryDependencyEvidenceMarker(row.requiredEvidence ?? '')) {
      issues.push(
        `${prefix}: upgradeRows: ${row.decision} must not include contradictory dependency failure markers`,
      );
    }
    if (
      !hasCompletedDependencyEvidenceTarget(row.requiredEvidence) ||
      !hasNoContradictoryDependencyEvidenceMarker(row.requiredEvidence) ||
      !hasDependencyUpgradeDecisionReleaseAction(row.decision, row.releaseAction)
    ) {
      issues.push(
        `${prefix}: upgradeRows: ${row.decision} requires completed upgrade evidence and decision-specific release action`,
      );
    }
  }
  return issues;
}

function validateRequiredDependencyReviewReviewerRows(
  prefix: string,
  rows: DependencyReviewReviewerSignoffRow[],
  classificationReviewer?: string,
  classificationDate?: string,
): string[] {
  const issues: string[] = [];
  issues.push(...validateDuplicateStructuredRows(`${prefix}: reviewerRows`, rows, 'role'));
  const normalizedClassificationDate = classificationDate?.trim() ?? '';
  const classificationDateIsValid = isIsoCalendarDate(normalizedClassificationDate);
  if (normalizedClassificationDate.length > 0 && !classificationDateIsValid) {
    issues.push(`${prefix}: reviewerRows require Review Classification Date to use YYYY-MM-DD`);
  }
  const rowsByRole = new Map(rows.map(row => [row.role, row]));
  const missing = REQUIRED_DEPENDENCY_REVIEW_REVIEWER_ROLES.filter(role => !rowsByRole.has(role));
  if (missing.length > 0) {
    issues.push(`${prefix}: reviewerRows must include required reviewer roles: ${missing.join(', ')}`);
  }
  for (const role of REQUIRED_DEPENDENCY_REVIEW_REVIEWER_ROLES) {
    const row = rowsByRole.get(role);
    if (!row) continue;
    if (row.decision !== 'approve') {
      issues.push(`${prefix}: reviewerRows: ${role}: decision must be approve`);
    }
    if (role === 'Dependency reviewer' && classificationReviewer && row.name !== classificationReviewer) {
      issues.push(`${prefix}: reviewerRows: ${role}: name must match Review Classification Reviewer`);
    }
    if (isBlankValue(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must use YYYY-MM-DD`);
    } else if (classificationDateIsValid && row.date < normalizedClassificationDate) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must not be before Review Classification Date`);
    }
    if (!isActionableDependencyReviewerNote(row.notes ?? '')) {
      issues.push(`${prefix}: reviewerRows: ${role} requires actionable dependency-risk outcome notes`);
    }
    issues.push(...validateDependencyReviewReviewerNoteClaimBoundary(prefix, row));
  }
  return issues;
}

function validateDependencyReviewReviewerNoteClaimBoundary(
  prefix: string,
  row: DependencyReviewReviewerSignoffRow,
): string[] {
  const notes = row.notes ?? '';
  if (notes.trim().length === 0) return [];

  const claim = classifyPublicationClaimText(notes);
  const issues: string[] = [];
  if (claim.hasMainnetProductionClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain mainnet production claim wording`);
  }
  if (claim.hasProductionReadyClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain production-ready claim wording`);
  }
  if (!hasNoContradictoryDependencyEvidenceMarker(notes)) {
    issues.push(
      `${prefix}: reviewerRows: ${row.role} notes must not include contradictory dependency failure markers`,
    );
  }
  if (dependencyReviewerNoteApprovesUnresolvedSignerBlocker(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve unresolved upstream signer blocker`);
  }
  if (dependencyReviewerNoteApprovesOpenCriticalHighVulnerabilities(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve open critical/high vulnerabilities`);
  }
  if (dependencyReviewerNoteApprovesFailClosedSignerCandidate(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve fail-closed signer blocker as candidate support`);
  }
  return issues;
}

function dependencyReviewerNoteApprovesUnresolvedSignerBlocker(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  const approval = dependencyReviewerApprovalTerms();
  return [
    new RegExp(`\\bupstream signer blocker\\s+(?:unresolved|open|active|remaining|not resolved)\\s+${approval}\\b`, 'g'),
    new RegExp(`\\bsigner blocker\\s+(?:unresolved|open|active|remaining|not resolved)\\s+${approval}\\b`, 'g'),
    new RegExp(`\\b${approval}\\s+(?:with\\s+)?(?:unresolved|open|active|remaining)\\s+(?:upstream\\s+)?signer blocker\\b`, 'g'),
  ].some(pattern => hasUnnegatedDependencyReviewerApproval(normalized, pattern));
}

function dependencyReviewerNoteApprovesOpenCriticalHighVulnerabilities(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  const approval = dependencyReviewerApprovalTerms();
  return [
    new RegExp(`\\b(?:critical high|critical and high|critical or high|critical|high)\\s+vulnerabilities?\\s+open\\s+${approval}\\b`, 'g'),
    new RegExp(`\\bopen\\s+(?:critical high|critical and high|critical or high|critical|high)\\s+vulnerabilities?\\s+${approval}\\b`, 'g'),
    new RegExp(`\\b${approval}\\s+open\\s+(?:critical high|critical and high|critical or high|critical|high)\\s+vulnerabilities?\\b`, 'g'),
  ].some(pattern => hasUnnegatedDependencyReviewerApproval(normalized, pattern));
}

function dependencyReviewerNoteApprovesFailClosedSignerCandidate(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  const approval = dependencyReviewerApprovalTerms();
  return [
    new RegExp(`\\bfail closed\\s+(?:signer\\s+)?(?:guard|blocker)\\s+${approval}\\s+(?:for\\s+)?(?:candidate|candidate support|testnet production candidate|production deployment candidate|release support)\\b`, 'g'),
    new RegExp(`\\b(?:candidate|candidate support|testnet production candidate|production deployment candidate|release support)\\s+${approval}\\s+(?:with|despite)\\s+fail closed\\s+(?:signer\\s+)?(?:guard|blocker)\\b`, 'g'),
    new RegExp(`\\b${approval}\\s+(?:candidate|candidate support|testnet production candidate|production deployment candidate|release support)\\s+(?:with|despite)\\s+fail closed\\s+(?:signer\\s+)?(?:guard|blocker)\\b`, 'g'),
  ].some(pattern => hasUnnegatedDependencyReviewerApproval(normalized, pattern));
}

function hasUnnegatedDependencyReviewerApproval(normalized: string, pattern: RegExp): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 32), index);
    if (!/\b(?:no|not|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?\s+$/.test(prefix)) {
      return true;
    }
  }
  return false;
}

function dependencyReviewerApprovalTerms(): string {
  return '(?:accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|enable|enabled|enables|support|supported|supports|permit|permitted|permits|clear|cleared|clears|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits)';
}

function validateDependencyReviewTriageFindings(
  prefix: string,
  rows: VulnerabilityTriageRow[],
): string[] {
  return rows
    .filter(row => row.status === 'linked')
    .filter(row => !dependencyTriageFindingsStateZeroCriticalHigh(row.findings))
    .map(row => `${prefix}: triageRows: ${row.triageItem}: findings must state zero open critical/high vulnerabilities`);
}

function validateDependencyReviewSignerConformance(
  prefix: string,
  validation: DependencyReviewEvidenceValidationInput,
  upgradeRows: UpgradeDecisionRow[],
): string[] {
  const issues: string[] = [];
  const signerDecision = upgradeRows.find(row => row.decision === 'Signer dependency upgrade decision');
  if (!signerDecision) return issues;

  const publicationDecision = validation.publicationDecision ?? {};
  const candidateClaimAllowed = dependencyReviewSupportsProductionCandidate(publicationDecision);
  if (candidateClaimAllowed) {
    if (!identifiesDependencyReviewSignerUpstreamResolution(signerDecision.releaseAction)) {
      issues.push(
        `${prefix}: upgradeRows Signer dependency upgrade decision release action must identify upstream release, concrete release identifier, and JVM/node conformance evidence`,
      );
    }
    if (!hasDependencyReviewSignerUpstreamEvidence(signerDecision.requiredEvidence)) {
      issues.push(
        `${prefix}: upgradeRows Signer dependency upgrade decision requiredEvidence must link completed upstream signer release and JVM/node conformance evidence`,
      );
    }
    if (
      identifiesDependencyReviewSignerUpstreamResolution(signerDecision.releaseAction) &&
      hasDependencyReviewSignerUpstreamEvidence(signerDecision.requiredEvidence) &&
      !dependencyReviewSignerReleaseIdentifiersMatch(signerDecision.releaseAction, signerDecision.requiredEvidence)
    ) {
      issues.push(
        `${prefix}: upgradeRows Signer dependency upgrade decision release action release identifier must match required evidence release identifier`,
      );
    }
    if (hasFailClosedSignerBlockerWording(signerDecision.releaseAction)) {
      issues.push(`${prefix}: upgradeRows Signer dependency upgrade decision must not use fail-closed wording when candidate claim is allowed`);
    }
  } else {
    if (!hasDependencyReviewFailClosedSignerAction(signerDecision.releaseAction)) {
      issues.push(
        `${prefix}: upgradeRows Signer dependency upgrade decision release action must state explicit fail-closed guard/blocker rationale with production-ready and testnet production-candidate claims blocked`,
      );
    }
    if (!hasDependencyReviewFailClosedSignerEvidence(signerDecision.requiredEvidence, signerDecision.releaseAction)) {
      issues.push(
        `${prefix}: upgradeRows Signer dependency upgrade decision requiredEvidence must link completed ContextExtension guard evidence for fail-closed signer handling`,
      );
    }
  }

  if (!isExactZeroEvidenceValue(publicationDecision.criticalHighVulnerabilitiesOpen ?? '')) {
    issues.push(`${prefix}: publicationDecision Critical/high vulnerabilities open must be 0`);
  }

  return issues;
}

function dependencyTriageFindingsStateZeroCriticalHigh(value: string): boolean {
  const normalized = value.toLowerCase();
  if (dependencyTriageFindingsHaveAmbiguousCriticalHighCount(normalized)) return false;
  return (
    /\b(?:no|zero|0)\s+open\s+(?:critical|high|critical\s*\/\s*high)\b/.test(normalized) ||
    /\b(?:critical|high|critical\s*\/\s*high)\s+(?:vulnerabilities?|findings?|issues?)?\s*(?:open\s*)?[:=]?\s*0\b/.test(normalized) ||
    /\b0\s+open\s+(?:critical|high|critical\s*\/\s*high)\b/.test(normalized)
  );
}

function dependencyTriageFindingsHaveAmbiguousCriticalHighCount(value: string): boolean {
  return (
    /\b(?:critical\s*\/\s*high|critical high|critical and high|critical or high|critical|high)(?:\s+(?:vulnerabilities?|findings?|issues?))?\s*(?:open\s*)?(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value) ||
    /\b0\s*\/\s*\d+\s+(?:open\s+)?(?:critical\s*\/\s*high|critical high|critical and high|critical or high|critical|high)(?:\s+(?:vulnerabilities?|findings?|issues?))?\b/i.test(value)
  );
}

function validateSecurityReviewStructuredSummary(
  validation: SecurityReviewEvidenceValidationInput,
  prefix: string,
): string[] {
  const scopeRows = validation.scopeRows;
  const evidenceRows = validation.evidenceRows;
  const findingRows = validation.findingRows;
  const negativeRows = validation.negativeRows;
  const reviewerRows = validation.reviewerRows;

  if (
    !Array.isArray(scopeRows) ||
    !Array.isArray(evidenceRows) ||
    !Array.isArray(findingRows) ||
    !Array.isArray(negativeRows) ||
    !Array.isArray(reviewerRows)
  ) {
    return [
      `${prefix} must expose structured scope, evidence, finding, negative, reviewer rows`,
    ];
  }

  const scopeRowObjects = structuredRowObjects(scopeRows);
  const evidenceRowObjects = structuredRowObjects(evidenceRows);
  const findingRowObjects = structuredRowObjects(findingRows);
  const negativeRowObjects = structuredRowObjects(negativeRows);
  const reviewerRowObjects = structuredRowObjects(reviewerRows);
  const securityReviewEvidenceTargets = new Map<string, string>();

  return [
    ...validateStructuredRowObjects(`${prefix}: scopeRows`, scopeRows),
    ...validateStructuredRowObjects(`${prefix}: evidenceRows`, evidenceRows),
    ...validateStructuredRowObjects(`${prefix}: findingRows`, findingRows),
    ...validateStructuredRowObjects(`${prefix}: negativeRows`, negativeRows),
    ...validateStructuredRowObjects(`${prefix}: reviewerRows`, reviewerRows),
    ...validateRequiredLinkedRows(
      `${prefix}: scopeRows`,
      scopeRowObjects,
      'area',
      REQUIRED_SECURITY_REVIEW_SCOPE_AREAS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: evidenceRows`,
      evidenceRowObjects,
      'evidence',
      REQUIRED_SECURITY_REVIEW_EVIDENCE_ITEMS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: findingRows`,
      findingRowObjects,
      'findingClass',
      REQUIRED_SECURITY_REVIEW_FINDING_CLASSES,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: negativeRows`,
      negativeRowObjects,
      'question',
      REQUIRED_SECURITY_REVIEW_NEGATIVE_QUESTIONS,
    ),
    ...validateSecurityReviewScopeEvidenceRows(prefix, scopeRowObjects),
    ...validateSecurityReviewEvidencePackageRows(prefix, evidenceRowObjects),
    ...validateSecurityReviewFindingDisposition(prefix, findingRowObjects),
    ...validateSecurityReviewFindingEvidenceRows(prefix, findingRowObjects),
    ...validateSecurityReviewScopeFindingIdClosureEvidence(prefix, scopeRowObjects, findingRowObjects),
    ...validateSecurityReviewNegativeEvidenceRows(prefix, negativeRowObjects),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: scopeRows`,
      scopeRowObjects,
      'area',
      'evidence',
      securityReviewEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: evidenceRows`,
      evidenceRowObjects,
      'evidence',
      'linkOrArtifact',
      securityReviewEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: findingRows`,
      findingRowObjects,
      'findingClass',
      'closureEvidence',
      securityReviewEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: negativeRows`,
      negativeRowObjects,
      'question',
      'evidence',
      securityReviewEvidenceTargets,
    ),
    ...validateRequiredSecurityReviewReviewerRows(
      prefix,
      reviewerRowObjects,
      validation.classification?.leadReviewer,
      validation.classification?.date,
    ),
  ];
}

function validateSecurityReviewScopeEvidenceRows(
  prefix: string,
  rows: ScopeCoverageRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (!hasNoContradictorySecurityReviewEvidenceMarker(row.evidence ?? '')) {
      issues.push(
        `${prefix}: scopeRows: ${row.area} must not include contradictory security review failure markers`,
      );
    }
    if (
      row.coverage !== 'covered' ||
      !hasCompletedSecurityReviewEvidenceTarget(row.evidence) ||
      !hasNoContradictorySecurityReviewEvidenceMarker(row.evidence) ||
      !securityReviewTextIdentifies(row.area, row.evidence) ||
      row.findingIds.trim().length === 0 ||
      !hasSecurityReviewScopeRiskFocus(row.area, row.riskFocus)
    ) {
      issues.push(
        `${prefix}: scopeRows: ${row.area} requires completed area-specific scope evidence and risk-focus notes`,
      );
    }
  }
  return issues;
}

function validateSecurityReviewEvidencePackageRows(
  prefix: string,
  rows: ReviewEvidencePackageRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (!hasNoContradictorySecurityReviewEvidenceMarker(row.linkOrArtifact ?? '')) {
      issues.push(
        `${prefix}: evidenceRows: ${row.evidence} must not include contradictory security review failure markers`,
      );
    }
    if (
      !hasCompletedSecurityReviewEvidenceTarget(row.linkOrArtifact) ||
      !hasNoContradictorySecurityReviewEvidenceMarker(row.linkOrArtifact) ||
      !hasSecurityReviewEvidenceArtifactFocus(row.evidence, row.linkOrArtifact) ||
      !hasActionableSecurityReviewEvidenceNote(row.reviewerNote)
    ) {
      issues.push(
        `${prefix}: evidenceRows: ${row.evidence} requires item-specific completed evidence-package artifact and actionable reviewer note`,
      );
    }
  }
  return issues;
}

function validateRequiredSecurityReviewReviewerRows(
  prefix: string,
  rows: SecurityReviewReviewerSignoffRow[],
  leadReviewer?: string,
  classificationDate?: string,
): string[] {
  const issues: string[] = [];
  issues.push(...validateDuplicateStructuredRows(`${prefix}: reviewerRows`, rows, 'role'));
  const normalizedClassificationDate = classificationDate?.trim() ?? '';
  const classificationDateIsValid = isIsoCalendarDate(normalizedClassificationDate);
  if (normalizedClassificationDate.length > 0 && !classificationDateIsValid) {
    issues.push(`${prefix}: reviewerRows require Review Classification Date to use YYYY-MM-DD`);
  }
  const rowsByRole = new Map(rows.map(row => [row.role, row]));
  const missing = REQUIRED_SECURITY_REVIEW_REVIEWER_ROLES.filter(role => !rowsByRole.has(role));
  if (missing.length > 0) {
    issues.push(`${prefix}: reviewerRows must include required reviewer roles: ${missing.join(', ')}`);
  }
  for (const role of REQUIRED_SECURITY_REVIEW_REVIEWER_ROLES) {
    const row = rowsByRole.get(role);
    if (!row) continue;
    if (row.decision !== 'approve') {
      issues.push(`${prefix}: reviewerRows: ${role}: decision must be approve`);
    }
    if (role === 'Lead reviewer' && leadReviewer && row.name !== leadReviewer) {
      issues.push(`${prefix}: reviewerRows: ${role}: name must match Review Classification Lead reviewer`);
    }
    if (isBlankValue(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must use YYYY-MM-DD`);
    } else if (classificationDateIsValid && row.date < normalizedClassificationDate) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must not be before Review Classification Date`);
    }
    if (!isActionableSecurityReviewOutcomeNote(row.notes ?? '')) {
      issues.push(`${prefix}: reviewerRows: ${role} requires actionable security-review outcome notes`);
    }
    issues.push(...validateSecurityReviewReviewerNoteClaimBoundary(prefix, row));
  }
  return issues;
}

function validateSecurityReviewReviewerNoteClaimBoundary(
  prefix: string,
  row: SecurityReviewReviewerSignoffRow,
): string[] {
  const notes = row.notes ?? '';
  if (notes.trim().length === 0) return [];

  const claim = classifyPublicationClaimText(notes);
  const issues: string[] = [];
  if (claim.hasMainnetProductionClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain mainnet production claim wording`);
  }
  if (claim.hasProductionReadyClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain production-ready claim wording`);
  }
  if (!hasNoContradictorySecurityReviewEvidenceMarker(notes)) {
    issues.push(
      `${prefix}: reviewerRows: ${row.role} notes must not include contradictory security review failure markers`,
    );
  }
  if (securityReviewerNoteApprovesOpenCriticalHighFindings(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve open critical/high findings`);
  }
  if (securityReviewerNoteApprovesOpenPublicationBlockers(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve open publication blockers`);
  }
  if (securityReviewerNoteApprovesAcceptedRisksMissingReleaseArtifacts(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve accepted risks missing release artifacts`);
  }
  return issues;
}

function securityReviewerNoteApprovesOpenCriticalHighFindings(value: string): boolean {
  return normalizeDecisionSummarySegmentsForReleaseGate(value).some(segment =>
    securityReviewerTextApprovesSubjectForReleaseGate(
      segment,
      '(?:(?:critical high|critical and high|critical or high|critical|high)\\s+findings?\\s+open|' +
        'open\\s+(?:critical high|critical and high|critical or high|critical|high)\\s+findings?)',
      securityReviewerApprovalTermsForReleaseGate(),
    ),
  );
}

function securityReviewerNoteApprovesOpenPublicationBlockers(value: string): boolean {
  return normalizeDecisionSummarySegmentsForReleaseGate(value).some(segment =>
    securityReviewerTextApprovesSubjectForReleaseGate(
      segment,
      '(?:publication blockers?\\s+open|open publication blockers?)',
      securityReviewerApprovalTermsForReleaseGate(),
    ),
  );
}

function securityReviewerNoteApprovesAcceptedRisksMissingReleaseArtifacts(value: string): boolean {
  const subject =
    '(?:accepted risks?(?:\\s+[a-z0-9]+){0,2}\\s+' +
    '(?:not reflected|missing|absent|without|lack|lacks|lacking)(?:\\s+in)?(?:\\s+[a-z0-9]+){0,2}\\s+' +
    '(?:release notes?|release artifacts?|checklist))';
  return normalizeDecisionSummarySegmentsForReleaseGate(value).some(segment =>
    securityReviewerTextApprovesSubjectForReleaseGate(
      segment,
      subject,
      securityReviewerApprovalTermsForReleaseGate(),
    ),
  );
}

function securityReviewerApprovalTermsForReleaseGate(): string {
  return '(?:accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|enable|enabled|enables|support|supported|supports|permit|permitted|permits|clear|cleared|clears|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits)';
}

function securityReviewerTextApprovesSubjectForReleaseGate(
  normalized: string,
  subject: string,
  approval: string,
): boolean {
  const subjectApprovalConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,3}';
  const approvalSubjectConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,2}';

  return [
    new RegExp(`\\b${subject}\\b${subjectApprovalConnector}\\s+${approval}\\b`, 'gi'),
    new RegExp(`\\b${approval}\\b${approvalSubjectConnector}\\s+${subject}\\b`, 'gi'),
  ].some(pattern => hasUnnegatedSecurityReviewerApprovalForReleaseGate(normalized, pattern));
}

function hasUnnegatedSecurityReviewerApprovalForReleaseGate(
  normalized: string,
  pattern: RegExp,
): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 32), index);
    if (!/\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?\s+$/.test(prefix)) return true;
  }
  return false;
}

function validateSecurityReviewFindingDisposition(
  prefix: string,
  rows: FindingDispositionRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (!isExactZeroEvidenceValue(row.openCriticalHigh)) {
      issues.push(`${prefix}: findingRows: ${row.findingClass}: open critical/high must be 0`);
    }
    if (row.findingClass === 'Publication blockers' && !isExactZeroEvidenceValue(row.count)) {
      issues.push(`${prefix}: findingRows: Publication blockers count must be 0`);
    }
  }
  return issues;
}

function validateSecurityReviewFindingEvidenceRows(
  prefix: string,
  rows: FindingDispositionRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (!hasNoContradictorySecurityReviewEvidenceMarker(row.closureEvidence ?? '')) {
      issues.push(
        `${prefix}: findingRows: ${row.findingClass} must not include contradictory security review failure markers`,
      );
    }
    if (
      !hasCompletedSecurityReviewEvidenceTarget(row.closureEvidence) ||
      !hasNoContradictorySecurityReviewEvidenceMarker(row.closureEvidence) ||
      !securityReviewTextIdentifies(row.findingClass, row.closureEvidence)
    ) {
      issues.push(`${prefix}: findingRows: ${row.findingClass} requires completed closure evidence`);
    }
  }
  return issues;
}

function validateSecurityReviewScopeFindingIdClosureEvidence(
  prefix: string,
  scopeRows: ScopeCoverageRow[],
  findingRows: FindingDispositionRow[],
): string[] {
  return findMissingSecurityReviewFindingIdClosureEvidence(scopeRows, findingRows)
    .map(({ area, findingIds }) =>
      `${prefix}: scopeRows: ${area} finding IDs ${findingIds.join(', ')} must be referenced by findingRows closure evidence`,
    );
}

function validateSecurityReviewNegativeEvidenceRows(
  prefix: string,
  rows: NegativeReviewCheckRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (!hasNoContradictorySecurityReviewEvidenceMarker(row.evidence ?? '')) {
      issues.push(
        `${prefix}: negativeRows: ${row.question} must not include contradictory security review failure markers`,
      );
    }
    if (
      !hasSecurityReviewExpectedNegativeAnswer(row.question, row.reviewerAnswer) ||
      !hasCompletedSecurityReviewEvidenceTarget(row.evidence) ||
      !hasNoContradictorySecurityReviewEvidenceMarker(row.evidence) ||
      !hasSecurityReviewNegativeEvidenceFocus(row.question, row.evidence)
    ) {
      issues.push(
        `${prefix}: negativeRows: ${row.question} requires expected reviewer answer and question-specific negative-check evidence`,
      );
    }
  }
  return issues;
}

function securityReviewTextIdentifies(label: string, value: string): boolean {
  const exactValue = escapeRegExp(label).replace(/\s+/g, '\\s+');
  const slug = label
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(escapeRegExp)
    .join('[-_ ]+');
  return new RegExp(`(?:\\b${exactValue}\\b|\\b${slug}\\b)`, 'i').test(value);
}

function validateCommitteeGovernanceStructuredSummary(
  validation: CommitteeGovernanceEvidenceValidationInput,
  prefix: string,
): string[] {
  const scopeRows = validation.scopeRows;
  const commandRows = validation.commandRows;
  const rotationRows = validation.rotationRows;
  const positiveRows = validation.positiveRows;
  const negativeRows = validation.negativeRows;
  const reviewerRows = validation.reviewerRows;

  if (
    !Array.isArray(scopeRows) ||
    !Array.isArray(commandRows) ||
    !Array.isArray(rotationRows) ||
    !Array.isArray(positiveRows) ||
    !Array.isArray(negativeRows) ||
    !Array.isArray(reviewerRows)
  ) {
    return [
      `${prefix} must expose structured scope, command, rotation, positive, negative, reviewer rows`,
    ];
  }

  const scopeRowObjects = structuredRowObjects(scopeRows);
  const commandRowObjects = structuredRowObjects(commandRows);
  const rotationRowObjects = structuredRowObjects(rotationRows);
  const positiveRowObjects = structuredRowObjects(positiveRows);
  const negativeRowObjects = structuredRowObjects(negativeRows);
  const reviewerRowObjects = structuredRowObjects(reviewerRows);
  const committeeGovernanceEvidenceTargets = new Map<string, string>();

  return [
    ...validateStructuredRowObjects(`${prefix}: scopeRows`, scopeRows),
    ...validateStructuredRowObjects(`${prefix}: commandRows`, commandRows),
    ...validateStructuredRowObjects(`${prefix}: rotationRows`, rotationRows),
    ...validateStructuredRowObjects(`${prefix}: positiveRows`, positiveRows),
    ...validateStructuredRowObjects(`${prefix}: negativeRows`, negativeRows),
    ...validateStructuredRowObjects(`${prefix}: reviewerRows`, reviewerRows),
    ...validateRequiredLinkedRows(
      `${prefix}: scopeRows`,
      scopeRowObjects,
      'surface',
      REQUIRED_COMMITTEE_GOVERNANCE_SCOPE_SURFACES,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: commandRows`,
      commandRowObjects,
      'command',
      REQUIRED_COMMITTEE_GOVERNANCE_COMMANDS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: rotationRows`,
      rotationRowObjects,
      'step',
      REQUIRED_COMMITTEE_GOVERNANCE_ROTATION_STEPS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: positiveRows`,
      positiveRowObjects,
      'check',
      REQUIRED_COMMITTEE_GOVERNANCE_POSITIVE_CHECKS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: negativeRows`,
      negativeRowObjects,
      'check',
      REQUIRED_COMMITTEE_GOVERNANCE_NEGATIVE_CHECKS,
    ),
    ...validateCommitteeGovernanceScopeEvidenceRows(prefix, scopeRowObjects),
    ...validateCommitteeGovernanceCommandEvidenceRows(prefix, commandRowObjects),
    ...validateCommitteeGovernanceRotationEvidenceRows(prefix, rotationRowObjects),
    ...validateCommitteeGovernancePositiveEvidenceRows(
      prefix,
      positiveRowObjects,
      rotationRowObjects,
      validation.classification?.committeeThreshold,
    ),
    ...validateCommitteeGovernanceNegativeEvidenceRows(prefix, negativeRowObjects),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: scopeRows`,
      scopeRowObjects,
      'surface',
      'evidence',
      committeeGovernanceEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: commandRows`,
      commandRowObjects,
      'command',
      'evidence',
      committeeGovernanceEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: rotationRows`,
      rotationRowObjects,
      'step',
      'requiredEvidence',
      committeeGovernanceEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: positiveRows`,
      positiveRowObjects,
      'check',
      'evidence',
      committeeGovernanceEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: negativeRows`,
      negativeRowObjects,
      'check',
      'evidence',
      committeeGovernanceEvidenceTargets,
    ),
    ...validateRequiredCommitteeGovernanceReviewerRows(
      prefix,
      reviewerRowObjects,
      validation.classification?.reviewer,
      validation.classification?.date,
    ),
  ];
}

function validateCommitteeGovernanceScopeEvidenceRows(
  prefix: string,
  rows: GovernanceScopeRow[],
): string[] {
  const issues: string[] = [];
  const rowsBySurface = new Map(rows.map(row => [row.surface, row]));
  for (const surface of REQUIRED_COMMITTEE_GOVERNANCE_SCOPE_SURFACES) {
    const row = rowsBySurface.get(surface);
    if (!row || row.status !== 'linked') continue;
    const evidence = row.evidence ?? '';
    if (hasContradictoryStructuredValidationFailureMarker(evidence)) {
      issues.push(`${prefix}: scopeRows: ${surface} must not include contradictory committee-governance failure markers`);
    }
    if (committeeGovernancePublicationEvidenceLeavesOpenBlockers(evidence)) {
      issues.push(`${prefix}: scopeRows: ${surface} must not leave governance blockers open`);
    }
    if (!hasCompletedCommitteeGovernanceScopeEvidence(evidence)) {
      issues.push(`${prefix}: scopeRows: ${surface} requires completed governance scope evidence`);
    }
    if (surface === 'MainChainLock emergency escape path' && !hasMainChainLockEmergencyAuthorityBoundary(row)) {
      issues.push(`${prefix}: scopeRows: ${surface} requires permissionless timeout authority to remain unchanged`);
    }
    if (surface === 'MCU Phase 2 path' && !hasMcuPhase2AuthorityBoundary(row)) {
      issues.push(`${prefix}: scopeRows: ${surface} must quarantine legacy v1 permissionless settlement and identify transitional committee authorization pending Gate 5 / Phase 011`);
    }
  }
  return issues;
}

function validateCommitteeGovernanceCommandEvidenceRows(
  prefix: string,
  rows: GovernanceCommandRow[],
): string[] {
  const issues: string[] = [];
  const rowsByCommand = new Map(rows.map(row => [row.command, row]));
  for (const command of REQUIRED_COMMITTEE_GOVERNANCE_COMMANDS) {
    const row = rowsByCommand.get(command);
    if (!row || row.status !== 'linked') continue;
    const evidence = row.evidence ?? '';
    const hasContradictoryMarkers = hasContradictoryValidationFailureMarker(evidence);
    const leavesGovernanceBlockersOpen = committeeGovernancePublicationEvidenceLeavesOpenBlockers(evidence);
    if (hasContradictoryMarkers) {
      issues.push(`${prefix}: commandRows: ${command} must not include contradictory committee-governance failure markers`);
      issues.push(`${prefix}: commandRows: ${command} requires internally positive governance command output evidence`);
    }
    if (leavesGovernanceBlockersOpen) {
      issues.push(`${prefix}: commandRows: ${command} must not leave governance blockers open`);
    } else if (!hasContradictoryMarkers && !hasCompletedCommitteeGovernanceCommandEvidence(command, evidence)) {
      issues.push(`${prefix}: commandRows: ${command} requires command-specific completed governance command output evidence`);
    }
  }
  return issues;
}

function validateCommitteeGovernanceRotationEvidenceRows(
  prefix: string,
  rows: RotationPlanRow[],
): string[] {
  const issues: string[] = [];
  const rowsByStep = new Map(rows.map(row => [row.step, row]));
  for (const step of REQUIRED_COMMITTEE_GOVERNANCE_ROTATION_STEPS) {
    const row = rowsByStep.get(step);
    if (!row || row.status !== 'linked') continue;
    const requiredEvidence = row.requiredEvidence ?? '';
    if (hasContradictoryStructuredValidationFailureMarker(requiredEvidence)) {
      issues.push(`${prefix}: rotationRows: ${step} must not include contradictory committee-governance failure markers`);
    }
    if (committeeGovernancePublicationEvidenceLeavesOpenBlockers(requiredEvidence)) {
      issues.push(`${prefix}: rotationRows: ${step} must not leave governance blockers open`);
    }
    if (!hasCommitteeGovernanceStepSpecificRotationEvidence(step, requiredEvidence)) {
      issues.push(`${prefix}: rotationRows: ${step} requires step-specific completed rotation evidence`);
    }
    if (!isActionableCommitteeGovernanceStopCondition(row.stopCondition ?? '')) {
      issues.push(`${prefix}: rotationRows: ${step} requires actionable stop condition`);
    }
  }

  const oldIdentifiers = governanceCommitteeIdentifiersForStep(rows, 'Identify old committee public keys');
  const newIdentifiers = governanceCommitteeIdentifiersForStep(rows, 'Identify new committee public keys');
  if (oldIdentifiers.size === 0) {
    issues.push(`${prefix}: rotationRows: Identify old committee public keys requires concrete old public key/hash identifier`);
  }
  if (newIdentifiers.size === 0) {
    issues.push(`${prefix}: rotationRows: Identify new committee public keys requires concrete new public key/hash identifiers`);
  }
  if ([...newIdentifiers].some(identifier => oldIdentifiers.has(identifier))) {
    issues.push(`${prefix}: rotationRows: Identify new committee public keys must not reuse old committee public key/hash identifiers`);
  }

  return issues;
}

function validateCommitteeGovernancePositiveEvidenceRows(
  prefix: string,
  rows: GovernancePositiveCheckRow[],
  rotationRows: RotationPlanRow[],
  committeeThreshold?: string,
): string[] {
  const issues: string[] = [];
  const threshold = parseCommitteeGovernancePositiveInteger(committeeThreshold ?? '');
  const requiredSignerCount = threshold ?? 1;
  const newIdentifiers = governanceCommitteeIdentifiersForStep(rotationRows, 'Identify new committee public keys');
  const rowsByCheck = new Map(rows.map(row => [row.check, row]));
  for (const check of REQUIRED_COMMITTEE_GOVERNANCE_POSITIVE_CHECKS) {
    const row = rowsByCheck.get(check);
    if (!row || row.status !== 'linked') continue;
    const evidence = row.evidence ?? '';
    if (!hasCommitteeGovernancePositiveExpectedResult(row.expectedResult ?? '')) {
      issues.push(`${prefix}: positiveRows: ${check} requires bounded success expected result`);
    }
    if (hasContradictoryStructuredValidationFailureMarker(evidence)) {
      issues.push(`${prefix}: positiveRows: ${check} must not include contradictory committee-governance failure markers`);
    }
    if (committeeGovernancePublicationEvidenceLeavesOpenBlockers(evidence)) {
      issues.push(`${prefix}: positiveRows: ${check} must not leave governance blockers open`);
    }
    const identifiers = extractGovernancePublicIdentifiers(evidence);
    const declaredNewSignerCount = identifiers.filter(identifier => newIdentifiers.has(identifier)).length;
    if (
      !hasCommitteeGovernancePositiveEvidence(check, evidence) ||
      identifiers.length < requiredSignerCount ||
      (newIdentifiers.size > 0 && declaredNewSignerCount < requiredSignerCount)
    ) {
      issues.push(
        `${prefix}: positiveRows: ${check} requires threshold-specific positive signer evidence from declared new committee`,
      );
    }
  }
  return issues;
}

function validateCommitteeGovernanceNegativeEvidenceRows(
  prefix: string,
  rows: GovernanceNegativeCheckRow[],
): string[] {
  const issues: string[] = [];
  const rowsByCheck = new Map(rows.map(row => [row.check, row]));
  for (const check of REQUIRED_COMMITTEE_GOVERNANCE_NEGATIVE_CHECKS) {
    const row = rowsByCheck.get(check);
    if (!row || row.status !== 'linked') continue;
    const evidence = row.evidence ?? '';
    if (!hasCommitteeGovernanceNegativeExpectedResult(row.expectedResult ?? '')) {
      issues.push(`${prefix}: negativeRows: ${check} requires fail-closed expected result`);
    }
    if (!hasNoContradictoryCommitteeGovernanceNegativeEvidenceMarker(evidence)) {
      issues.push(`${prefix}: negativeRows: ${check} must not include contradictory committee-governance failure markers`);
    }
    if (committeeGovernancePublicationEvidenceLeavesOpenBlockers(evidence)) {
      issues.push(`${prefix}: negativeRows: ${check} must not leave governance blockers open`);
    }
    if (!hasCommitteeGovernanceNegativeEvidence(check, evidence)) {
      issues.push(`${prefix}: negativeRows: ${check} requires negative-check evidence`);
    }
    if (committeeGovernanceNegativeCheckRequiresSignerIdentifier(check) &&
      extractGovernancePublicIdentifiers(evidence).length === 0
    ) {
      issues.push(`${prefix}: negativeRows: ${check} requires negative-check evidence with rejected signer identifier`);
    }
  }
  return issues;
}

function validateRequiredCommitteeGovernanceReviewerRows(
  prefix: string,
  rows: CommitteeGovernanceReviewerSignoffRow[],
  reviewer?: string,
  classificationDate?: string,
): string[] {
  const issues: string[] = [];
  issues.push(...validateDuplicateStructuredRows(`${prefix}: reviewerRows`, rows, 'role'));
  const normalizedClassificationDate = classificationDate?.trim() ?? '';
  const classificationDateIsValid = isIsoCalendarDate(normalizedClassificationDate);
  if (normalizedClassificationDate.length > 0 && !classificationDateIsValid) {
    issues.push(`${prefix}: reviewerRows require Drill Classification Date to use YYYY-MM-DD`);
  }
  const rowsByRole = new Map(rows.map(row => [row.role, row]));
  const missing = REQUIRED_COMMITTEE_GOVERNANCE_REVIEWER_ROLES.filter(role => !rowsByRole.has(role));
  if (missing.length > 0) {
    issues.push(`${prefix}: reviewerRows must include required reviewer roles: ${missing.join(', ')}`);
  }
  for (const role of REQUIRED_COMMITTEE_GOVERNANCE_REVIEWER_ROLES) {
    const row = rowsByRole.get(role);
    if (!row) continue;
    if (row.decision !== 'approve') {
      issues.push(`${prefix}: reviewerRows: ${role}: decision must be approve`);
    }
    if (role === 'Governance owner' && reviewer && row.name !== reviewer) {
      issues.push(`${prefix}: reviewerRows: ${role}: name must match Drill Classification Reviewer`);
    }
    if (isBlankValue(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must use YYYY-MM-DD`);
    } else if (classificationDateIsValid && row.date < normalizedClassificationDate) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must not be before Drill Classification Date`);
    }
    if (!isActionableCommitteeGovernanceReviewerNote(row.notes ?? '')) {
      issues.push(`${prefix}: reviewerRows: ${role} requires actionable governance-readiness outcome notes`);
    }
    issues.push(...validateCommitteeGovernanceReviewerNoteClaimBoundary(prefix, row));
  }
  return issues;
}

function validateCommitteeGovernanceReviewerNoteClaimBoundary(
  prefix: string,
  row: CommitteeGovernanceReviewerSignoffRow,
): string[] {
  const notes = row.notes ?? '';
  if (notes.trim().length === 0) return [];

  const claim = classifyPublicationClaimText(notes);
  const issues: string[] = [];
  if (claim.hasMainnetProductionClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain mainnet production claim wording`);
  }
  if (claim.hasProductionReadyClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain production-ready claim wording`);
  }
  if (committeeGovernanceReviewerNoteApprovesOpenBlockers(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve open governance blockers`);
  }
  if (committeeGovernanceReviewerNoteApprovesSingleSigner(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve single-signer governance`);
  }
  if (hasContradictoryStructuredValidationFailureMarker(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not include contradictory committee-governance failure markers`);
  }
  return issues;
}

function committeeGovernanceReviewerNoteApprovesOpenBlockers(value: string): boolean {
  return normalizeDecisionSummarySegmentsForReleaseGate(value).some(normalized =>
    committeeGovernanceReviewerTextApprovesSubject(
      normalized,
      '(?:open governance blockers?|open governance blocker handling|governance blockers?)',
      committeeGovernanceReviewerApprovalTerms(),
    ),
  );
}

function committeeGovernanceReviewerNoteApprovesSingleSigner(value: string): boolean {
  return normalizeDecisionSummarySegmentsForReleaseGate(value).some(normalized =>
    committeeGovernanceReviewerTextApprovesSubject(
      normalized,
      '(?:single signer (?:governance|authority|signer path|fallback)|single signer)',
      committeeGovernanceReviewerApprovalTerms(),
    ),
  );
}

function committeeGovernanceReviewerApprovalTerms(): string {
  return '(?:accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|enable|enabled|enables|support|supported|supports|permit|permitted|permits|clear|cleared|clears|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits)';
}

function committeeGovernanceReviewerTextApprovesSubject(
  normalized: string,
  subject: string,
  approval: string,
): boolean {
  const approvalConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,3}';
  const approvalSubjectConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,1}';

  return [
    new RegExp(`\\b${subject}\\b${approvalConnector}\\s+${approval}\\b`, 'gi'),
    new RegExp(`\\b${approval}\\b${approvalSubjectConnector}\\s+${subject}\\b`, 'gi'),
  ].some(pattern => hasUnnegatedCommitteeGovernanceReviewerApproval(normalized, pattern));
}

function hasUnnegatedCommitteeGovernanceReviewerApproval(normalized: string, pattern: RegExp): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 32), index);
    if (!/\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?\s+$/.test(prefix)) return true;
  }
  return false;
}

function hasCompletedCommitteeGovernanceScopeEvidence(value: string): boolean {
  return (
    hasCompletedCommitteeGovernanceEvidenceTarget(value) &&
    hasNoContradictoryCommitteeGovernanceEvidenceMarker(value) &&
    /\b(governance|scope|authority)\b/i.test(value)
  );
}

function hasMainChainLockEmergencyAuthorityBoundary(row: GovernanceScopeRow): boolean {
  return (
    /permissionless/i.test(row.currentAuthority ?? '') &&
    /timeout/i.test(row.currentAuthority ?? '') &&
    /unchanged/i.test(row.targetAuthority ?? '') &&
    !/committee|multisig|atLeast/i.test(row.targetAuthority ?? '')
  );
}

function hasMcuPhase2AuthorityBoundary(row: GovernanceScopeRow): boolean {
  return (
    /permissionless/i.test(row.currentAuthority ?? '') &&
    /legacy|v1/i.test(row.currentAuthority ?? '') &&
    /quarantin|disabled|inactive/i.test(row.currentAuthority ?? '') &&
    /committee|multisig|atLeast/i.test(row.targetAuthority ?? '') &&
    /Phase 011|Gate 5/i.test(row.targetAuthority ?? '') &&
    /transitional|containment|temporary/i.test(row.targetAuthority ?? '')
  );
}

function hasCompletedCommitteeGovernanceCommandEvidence(command: string, value: string): boolean {
  return (
    hasCompletedCommitteeGovernanceEvidenceTarget(value) &&
    hasNoContradictoryCommitteeGovernanceEvidenceMarker(value) &&
    committeeGovernanceCommandEvidenceIdentifiesCommand(command, value) &&
    hasCommitteeGovernanceCommandOutputMarker(value) &&
    hasExplicitCommandExitCodeZero(value)
  );
}

function hasCommitteeGovernanceCommandOutputMarker(value: string): boolean {
  return (
    (/\bnpm run [A-Za-z0-9:_-]+\b/.test(value) ||
      /\bspike010a-committee-guard-eval\.ts\b/.test(value)) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(value)
  );
}

function hasExplicitCommandExitCodeZero(value: string): boolean {
  return /\bexit[- ]?code\s*(?:=|:)?\s*0\b(?!\s*\/)/i.test(value);
}

function committeeGovernanceCommandEvidenceIdentifiesCommand(command: string, evidence: string): boolean {
  return new RegExp(escapeRegExp(command), 'i').test(evidence) ||
    committeeGovernanceCommandSlugPattern(command).test(evidence);
}

function committeeGovernanceCommandSlugPattern(command: string): RegExp {
  const slugPattern = command
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(escapeRegExp)
    .join('[-_ ]+');
  return new RegExp(`\\b${slugPattern}\\b`, 'i');
}

function hasCommitteeGovernanceStepSpecificRotationEvidence(step: string, value: string): boolean {
  return hasCompletedCommitteeGovernanceEvidenceTarget(value) &&
    hasNoContradictoryCommitteeGovernanceEvidenceMarker(value) &&
    committeeGovernanceRotationEvidencePattern(step).test(value);
}

function committeeGovernanceRotationEvidencePattern(step: string): RegExp {
  switch (step) {
    case 'Identify old committee public keys':
      return /(old|previous).*(public[- ]keys?|hashes?)|(public[- ]keys?|hashes?).*(old|previous)/i;
    case 'Identify new committee public keys':
      return /new.*(public[- ]keys?|hashes?)|(public[- ]keys?|hashes?).*new/i;
    case 'Validate threshold policy':
      return /\bm\s*\/\s*n\b|threshold.*(quorum|lost[- ]key|member[- ]loss|tolerance)|(quorum|lost[- ]key|member[- ]loss|tolerance).*threshold/i;
    case 'Simulate member loss or lost-key tolerance':
      return /member[- ]loss|lost[- ]key|tolerance/i;
    case 'Compile affected contracts':
      return /contracts:check|contract[- ]compilation|contract[- ]compile|compilation output|compiled contracts?/i;
    case 'Evaluate old and new signer behavior':
      return /(old|new).*(signer|signing|guard)|(signer|signing|guard).*(old|new)/i;
    case 'Preserve singleton continuity':
      return /singleton|NFT|register|script|value/i;
    case 'Reconcile deployment state':
      return /deployment[- ]state|network|singleton/i;
    case 'Verify rollback plan':
      return /rollback|previous[- ]authority|recovery/i;
    default:
      return /a^/;
  }
}

function isActionableCommitteeGovernanceStopCondition(value: string): boolean {
  return /\b(stop|block|blocked|fail|fails|failed|pause|paused|abort|aborted|refuse|refused|incident|rollback|halt|disable|disabled|do not|escalate)\b/i
    .test(value);
}

function governanceCommitteeIdentifiersForStep(rows: RotationPlanRow[], step: string): Set<string> {
  const row = rows.find(candidate => candidate.step === step);
  return new Set(extractGovernancePublicIdentifiers(row?.requiredEvidence ?? ''));
}

function hasCommitteeGovernancePositiveEvidence(check: string, value: string): boolean {
  return hasCompletedCommitteeGovernanceEvidenceTarget(value) &&
    hasNoContradictoryCommitteeGovernanceEvidenceMarker(value) &&
    committeeGovernancePositiveEvidencePattern(check).test(value);
}

function committeeGovernancePositiveEvidencePattern(check: string): RegExp {
  switch (check) {
    case 'New committee executes signer-gated mutation after rotation':
      return /new[- ]committee|new committee/i;
    case 'Threshold member-loss tolerance still executes signer-gated mutation':
      return /(member[- ]loss|lost[- ]key|tolerance).*(threshold|quorum|m\/n)|(threshold|quorum|m\/n).*(member[- ]loss|lost[- ]key|tolerance)/i;
    default:
      return /a^/;
  }
}

function hasCommitteeGovernanceNegativeEvidence(check: string, value: string): boolean {
  return hasCompletedCommitteeGovernanceEvidenceTarget(value) &&
    hasNoContradictoryCommitteeGovernanceNegativeEvidenceMarker(value) &&
    committeeGovernanceNegativeEvidencePattern(check).test(value);
}

function committeeGovernanceNegativeEvidencePattern(check: string): RegExp {
  switch (check) {
    case 'Old single signer attempts signer-gated mutation after rotation':
      return /(old|previous).*(signer|signing|signer-gated)|(signer|signing|signer-gated).*(old|previous)/i;
    case 'Non-committee signer attempts signer-gated mutation':
      return /non[- ]committee.*(signer|signing|signer-gated)|(signer|signing|signer-gated).*non[- ]committee/i;
    case 'Committee threshold below policy':
      return /threshold.*(below|weaker|policy)|(below|weaker|policy).*threshold/i;
    case 'MCU references stale SCS NFT after SCS redeploy':
      return /\bMCU\b.*(stale|SCS|NFT|redeploy)|(stale|SCS|NFT|redeploy).*\bMCU\b/i;
    case 'MCL emergency escape path is accidentally committee-gated':
      return /(\bMCL\b|MainChainLock).*(emergency|escape|committee-gated)|(emergency|escape|committee-gated).*(\bMCL\b|MainChainLock)/i;
    case 'Broadcast is enabled before readiness review':
      return /broadcast.*(readiness|review)|(readiness|review).*broadcast/i;
    case 'Deployment state points to the wrong network':
      return /deployment[- ]state.*(wrong[- ]network|network)|(wrong[- ]network|network).*deployment[- ]state/i;
    default:
      return /a^/;
  }
}

function committeeGovernanceNegativeCheckRequiresSignerIdentifier(check: string): boolean {
  return check === 'Old single signer attempts signer-gated mutation after rotation' ||
    check === 'Non-committee signer attempts signer-gated mutation';
}

function extractGovernancePublicIdentifiers(value: string): string[] {
  return [...new Set([...value.matchAll(/\b(?:0x)?([0-9a-fA-F]{64})\b/g)]
    .map(match => match[1].toLowerCase()))];
}

function parseCommitteeGovernancePositiveInteger(value: string): number | null {
  if (!/^[1-9][0-9]*$/.test(value.trim())) return null;
  return Number(value);
}

function isActionableCommitteeGovernanceReviewerNote(value: string): boolean {
  return (
    hasNoContradictoryCommitteeGovernanceEvidenceMarker(value) &&
    /\b(accept|accepted|approve|approved|verify|verified|validate|validated|confirm|confirmed|pass|passed|fail|failed|block|blocked|reject|rejected|refuse|refused|complete|completed)\b/i.test(value) &&
    /\b(governance|rotation|committee|threshold|member[- ]loss|lost[- ]key|signer|negative check|singleton|deployment[- ]state|rollback|broadcast|gate 6)\b/i.test(value)
  );
}

function validateOperatorReadinessStructuredSummary(
  validation: OperatorReadinessEvidenceValidationInput,
  prefix: string,
): string[] {
  const runbookRows = validation.runbookRows;
  const commandRows = validation.commandRows;
  const drillRows = validation.drillRows;
  const decisionRows = validation.decisionRows;
  const reviewerRows = validation.reviewerRows;

  if (
    !Array.isArray(runbookRows) ||
    !Array.isArray(commandRows) ||
    !Array.isArray(drillRows) ||
    !Array.isArray(decisionRows) ||
    !Array.isArray(reviewerRows)
  ) {
    return [
      `${prefix} must expose structured runbook, command, drill, decision, reviewer rows`,
    ];
  }

  const runbookRowObjects = structuredRowObjects(runbookRows);
  const commandRowObjects = structuredRowObjects(commandRows);
  const drillRowObjects = structuredRowObjects(drillRows);
  const decisionRowObjects = structuredRowObjects(decisionRows);
  const reviewerRowObjects = structuredRowObjects(reviewerRows);
  const operatorReadinessEvidenceTargets = new Map<string, string>();

  return [
    ...validateStructuredRowObjects(`${prefix}: runbookRows`, runbookRows),
    ...validateStructuredRowObjects(`${prefix}: commandRows`, commandRows),
    ...validateStructuredRowObjects(`${prefix}: drillRows`, drillRows),
    ...validateStructuredRowObjects(`${prefix}: decisionRows`, decisionRows),
    ...validateStructuredRowObjects(`${prefix}: reviewerRows`, reviewerRows),
    ...validateRequiredLinkedRows(
      `${prefix}: runbookRows`,
      runbookRowObjects,
      'runbook',
      REQUIRED_OPERATOR_READINESS_RUNBOOKS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: commandRows`,
      commandRowObjects,
      'command',
      REQUIRED_OPERATOR_READINESS_COMMANDS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: drillRows`,
      drillRowObjects,
      'drill',
      REQUIRED_OPERATOR_READINESS_DRILLS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: decisionRows`,
      decisionRowObjects,
      'decision',
      REQUIRED_OPERATOR_READINESS_OPERATIONAL_DECISIONS,
    ),
    ...validateOperatorReadinessRunbookEvidenceRows(prefix, runbookRowObjects),
    ...validateOperatorReadinessCommandEvidenceRows(prefix, commandRowObjects),
    ...validateOperatorReadinessDrillEvidenceRows(prefix, drillRowObjects),
    ...validateOperatorReadinessDecisionEvidenceRows(prefix, decisionRowObjects),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: runbookRows`,
      runbookRowObjects,
      'runbook',
      'evidence',
      operatorReadinessEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: commandRows`,
      commandRowObjects,
      'command',
      'evidence',
      operatorReadinessEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: drillRows`,
      drillRowObjects,
      'drill',
      'evidence',
      operatorReadinessEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: decisionRows`,
      decisionRowObjects,
      'decision',
      'requiredEvidence',
      operatorReadinessEvidenceTargets,
    ),
    ...validateRequiredOperatorReadinessReviewerRows(
      prefix,
      reviewerRowObjects,
      validation.classification?.reviewer,
      validation.classification?.date,
    ),
  ];
}

function validateOperatorReadinessRunbookEvidenceRows(
  prefix: string,
  rows: RunbookCoverageRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    const evidence = row.evidence ?? '';
    if (!hasNoContradictoryOperatorReadinessOperationalEvidenceMarker(evidence)) {
      issues.push(
        `${prefix}: runbookRows: ${row.runbook} must not include contradictory operator-readiness failure markers`,
      );
    }
    if (operatorReadinessPublicationEvidenceLeavesCriticalIncidentsOpen(evidence)) {
      issues.push(`${prefix}: runbookRows: ${row.runbook} must not leave critical incidents open`);
    }
    if (!hasCompletedOperatorRunbookEvidence(row)) {
      issues.push(
        `${prefix}: runbookRows: ${row.runbook} requires completed runbook evidence with stop-condition and verification-command checks`,
      );
    }
  }
  return issues;
}

function validateOperatorReadinessCommandEvidenceRows(
  prefix: string,
  rows: OperatorCommandRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    const evidence = row.evidence ?? '';
    if (!hasOperatorReadinessCommandPurpose(row.command, row.purpose ?? '')) {
      issues.push(
        `${prefix}: commandRows: ${row.command} requires bounded command purpose`,
      );
    }
    if (!hasNoContradictoryOperatorReadinessOperationalEvidenceMarker(evidence)) {
      issues.push(
        `${prefix}: commandRows: ${row.command} must not include contradictory operator-readiness failure markers`,
      );
    }
    if (operatorReadinessPublicationEvidenceLeavesCriticalIncidentsOpen(evidence)) {
      issues.push(`${prefix}: commandRows: ${row.command} must not leave critical incidents open`);
    }
    if (hasContradictoryValidationFailureMarker(evidence)) {
      issues.push(
        `${prefix}: commandRows: ${row.command} requires internally positive operator command output evidence`,
      );
    } else if (!hasCompletedOperatorCommandEvidence(row)) {
      issues.push(
        `${prefix}: commandRows: ${row.command} requires command-specific completed operator command output evidence`,
      );
    }
  }
  return issues;
}

function validateOperatorReadinessDrillEvidenceRows(
  prefix: string,
  rows: IncidentDrillRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    const evidence = row.evidence ?? '';
    if (!hasNoContradictoryOperatorReadinessOperationalEvidenceMarker(evidence)) {
      issues.push(
        `${prefix}: drillRows: ${row.drill} must not include contradictory operator-readiness failure markers`,
      );
    }
    if (operatorReadinessPublicationEvidenceLeavesCriticalIncidentsOpen(evidence)) {
      issues.push(`${prefix}: drillRows: ${row.drill} must not leave critical incidents open`);
    }
    if (!hasCompletedOperatorDrillEvidence(row)) {
      issues.push(
        `${prefix}: drillRows: ${row.drill} requires completed drill evidence with actionable recovery outcome`,
      );
    }
  }
  return issues;
}

function validateOperatorReadinessDecisionEvidenceRows(
  prefix: string,
  rows: OperationalDecisionRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    const evidence = row.requiredEvidence ?? '';
    if (!hasNoContradictoryOperatorReadinessOperationalEvidenceMarker(evidence)) {
      issues.push(
        `${prefix}: decisionRows: ${row.decision} must not include contradictory operator-readiness failure markers`,
      );
    }
    if (operatorReadinessPublicationEvidenceLeavesCriticalIncidentsOpen(evidence)) {
      issues.push(`${prefix}: decisionRows: ${row.decision} must not leave critical incidents open`);
    }
    if (!hasCompletedOperatorDecisionEvidence(row)) {
      issues.push(
        `${prefix}: decisionRows: ${row.decision} requires decision-specific completed evidence with actionable stop condition`,
      );
    }
  }
  return issues;
}

function hasCompletedOperatorRunbookEvidence(row: RunbookCoverageRow): boolean {
  return (
    hasCompletedOperatorReadinessEvidenceTarget(row.evidence) &&
    hasNoContradictoryOperatorReadinessOperationalEvidenceMarker(row.evidence) &&
    hasOperatorReadinessRunbookEvidenceFocus(row.runbook, row.evidence) &&
    hasOperatorRunbookCheckEvidence(row.evidence) &&
    isOperatorRunbookRequiredCheck(row.requiredCheck)
  );
}

function hasCompletedOperatorCommandEvidence(row: OperatorCommandRow): boolean {
  return (
    hasCompletedOperatorReadinessEvidenceTarget(row.evidence) &&
    operatorReadinessCommandEvidencePattern(row.command).test(row.evidence) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(row.evidence) &&
    hasExplicitCommandExitCodeZero(row.evidence)
  );
}

function hasCompletedOperatorDrillEvidence(row: IncidentDrillRow): boolean {
  return (
    hasCompletedOperatorReadinessEvidenceTarget(row.evidence) &&
    hasNoContradictoryOperatorReadinessOperationalEvidenceMarker(row.evidence) &&
    operatorReadinessCommandEvidencePattern(row.drill).test(row.evidence) &&
    isActionableOperatorDrillOutcome(row.expectedOutcome)
  );
}

function hasCompletedOperatorDecisionEvidence(row: OperationalDecisionRow): boolean {
  return (
    hasCompletedOperatorReadinessEvidenceTarget(row.requiredEvidence) &&
    hasNoContradictoryOperatorReadinessOperationalEvidenceMarker(row.requiredEvidence) &&
    hasOperatorReadinessDecisionEvidenceFocus(row.decision, row.requiredEvidence) &&
    isActionableOperatorStopCondition(row.stopCondition)
  );
}

function hasOperatorReadinessRunbookEvidenceFocus(runbook: string, evidence: string): boolean {
  return operatorReadinessEvidencePatternFor(runbook, {
    'Dry-run readiness': /dry[- ]run|readiness/i,
    'Deployment and migration': /deployment|deploy|migration/i,
    'Broadcast enablement': /broadcast/i,
    'Daemon startup': /daemon|startup/i,
    'Settlement failure triage': /settlement|failure|triage/i,
    'Reorg recovery': /reorg|recovery/i,
    'Pause and resume': /pause|resume/i,
    'Key rotation': /key|rotation|member/i,
    'Storage-rent and liquidity maintenance': /storage[- ]rent|liquidity|maintenance/i,
    'Incident response': /incident|response/i,
    'Monitoring and alerting': /monitoring|monitor|alerting|alert/i,
    'SQLite and AVL backup restore': /(sqlite|avl).*?(backup|restore)|(backup|restore).*?(sqlite|avl)/i,
  }).test(evidence);
}

function hasOperatorReadinessDecisionEvidenceFocus(decision: string, evidence: string): boolean {
  return operatorReadinessEvidencePatternFor(decision, {
    'External operator can find every runbook': /external[- ]operator|runbooks?|operator[- ]runbooks?/i,
    'Stop conditions are executable': /stop[- ]conditions?|executable|operator[- ]stop/i,
    'Monitoring signals are actionable': /monitoring|signals?|alerts?|actionable/i,
    'Incident escalation is actionable': /incident|escalation|escalate/i,
    'Backup restore evidence is linked': /backup|restore|sqlite|avl/i,
    'Governance rotation evidence is linked': /governance|rotation|key[- ]rotation|committee/i,
    'Broadcast enablement remains opt-in': /broadcast|opt[- ]in|BRIDGE_BROADCAST_ENABLED/i,
  }).test(evidence);
}

function operatorReadinessEvidencePatternFor(
  key: string,
  patterns: Record<string, RegExp>,
): RegExp {
  return patterns[key] ?? operatorReadinessCommandEvidencePattern(key);
}

function operatorReadinessCommandEvidencePattern(value: string): RegExp {
  const exactValue = escapeRegExp(value).replace(/\s+/g, '\\s+');
  const slug = value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(escapeRegExp)
    .join('[-_ ]+');
  return new RegExp(`(?:\\b${exactValue}\\b|\\b${slug}\\b)`, 'i');
}

function isOperatorRunbookRequiredCheck(value: string): boolean {
  return /\bstop[- ]?conditions?\b/i.test(value) && /\bverification[- ]?commands?\b/i.test(value);
}

function hasOperatorRunbookCheckEvidence(value: string): boolean {
  return /\bstop[- ]conditions?\b/i.test(value) && /\bverification[- ]commands?\b/i.test(value);
}

function isActionableOperatorStopCondition(value: string): boolean {
  return /\b(stop|block|fail|disable|pause|incident|do not|refuse)\b/i.test(value);
}

function isActionableOperatorDrillOutcome(value: string): boolean {
  return /\b(stop|block|fail|disable|pause|incident|do not|refuse|recover|reconcile|restore|confirm|escalate)\b/i
    .test(value);
}

function isActionableOperatorReviewerNote(value: string): boolean {
  return (
    hasNoContradictoryOperatorReadinessEvidenceMarker(value) &&
    /\b(accept|accepted|approve|approved|verify|verified|validate|validated|confirm|confirmed|pass|passed|fail|failed|block|blocked|incident|reproduce|reproduced|complete|completed)\b/i
      .test(value) &&
    /\b(evidence|operator|readiness|runbook|command|drill|decision|stop condition|release|gate 6)\b/i
      .test(value) &&
    (
      /\bstop[- ]?conditions?\b/i.test(value) ||
      hasExactOperatorReadinessDecisionReference(value)
    )
  );
}

function hasExactOperatorReadinessDecisionReference(value: string): boolean {
  return REQUIRED_OPERATOR_READINESS_OPERATIONAL_DECISIONS.some(decision =>
    exactOperatorReadinessDecisionReferencePattern(decision).test(value)
  );
}

function exactOperatorReadinessDecisionReferencePattern(decision: string): RegExp {
  const exactDecision = escapeRegExp(decision).replace(/\s+/g, '\\s+');
  return new RegExp(`\\b${exactDecision}\\s*(?:$|[.;,|)\\]\\r\\n])`, 'i');
}

function validateRequiredOperatorReadinessReviewerRows(
  prefix: string,
  rows: OperatorReadinessReviewerSignoffRow[],
  classificationReviewer?: string,
  classificationDate?: string,
): string[] {
  const issues: string[] = [];
  issues.push(...validateDuplicateStructuredRows(`${prefix}: reviewerRows`, rows, 'role'));
  const normalizedClassificationDate = classificationDate?.trim() ?? '';
  const classificationDateIsValid = isIsoCalendarDate(normalizedClassificationDate);
  if (normalizedClassificationDate.length > 0 && !classificationDateIsValid) {
    issues.push(`${prefix}: reviewerRows require Readiness Classification Date to use YYYY-MM-DD`);
  }
  const rowsByRole = new Map(rows.map(row => [row.role, row]));
  const missing = REQUIRED_OPERATOR_READINESS_REVIEWER_ROLES.filter(role => !rowsByRole.has(role));
  if (missing.length > 0) {
    issues.push(`${prefix}: reviewerRows must include required reviewer roles: ${missing.join(', ')}`);
  }
  for (const role of REQUIRED_OPERATOR_READINESS_REVIEWER_ROLES) {
    const row = rowsByRole.get(role);
    if (!row) continue;
    if (row.decision !== 'approve') {
      issues.push(`${prefix}: reviewerRows: ${role}: decision must be approve`);
    }
    if (role === 'Runbook operator' && classificationReviewer && row.name !== classificationReviewer) {
      issues.push(`${prefix}: reviewerRows: ${role}: name must match Readiness Classification Reviewer`);
    }
    if (isBlankValue(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must use YYYY-MM-DD`);
    } else if (classificationDateIsValid && row.date < normalizedClassificationDate) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must not be before Readiness Classification Date`);
    }
    if (!isActionableOperatorReviewerNote(row.notes)) {
      issues.push(`${prefix}: reviewerRows: ${role} requires actionable operator-readiness outcome notes`);
    }
    issues.push(...validateOperatorReadinessReviewerNoteClaimBoundary(prefix, row));
  }
  return issues;
}

function validateOperatorReadinessReviewerNoteClaimBoundary(
  prefix: string,
  row: OperatorReadinessReviewerSignoffRow,
): string[] {
  const notes = row.notes ?? '';
  if (notes.trim().length === 0) return [];

  const claim = classifyPublicationClaimText(notes);
  const issues: string[] = [];
  if (claim.hasMainnetProductionClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain mainnet production claim wording`);
  }
  if (claim.hasProductionReadyClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain production-ready claim wording`);
  }
  if (operatorReadinessReviewerNoteApprovesOpenCriticalIncidents(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve open critical incidents`);
  }
  if (operatorReadinessReviewerNoteApprovesNonOptInBroadcast(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve non-opt-in broadcast enablement`);
  }
  if (operatorReadinessPublicationEvidenceLeavesCriticalIncidentsOpen(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not leave critical incidents open`);
  }
  if (!hasNoContradictoryOperatorReadinessEvidenceMarker(notes)) {
    issues.push(
      `${prefix}: reviewerRows: ${row.role} notes must not include contradictory operator-readiness failure markers`,
    );
  }
  return issues;
}

function operatorReadinessReviewerNoteApprovesOpenCriticalIncidents(value: string): boolean {
  return normalizeDecisionSummarySegmentsForReleaseGate(value).some(normalized =>
    operatorReadinessReviewerTextApprovesSubject(
      normalized,
      '(?:critical incidents? open|open critical incidents?)',
      operatorReadinessReviewerApprovalTerms(),
    )
  );
}

function operatorReadinessReviewerNoteApprovesNonOptInBroadcast(value: string): boolean {
  return normalizeDecisionSummarySegmentsForReleaseGate(value).some(normalized =>
    operatorReadinessReviewerTextApprovesSubject(
      normalized,
      '(?:broadcast enablement remains non opt in|non opt in broadcast(?: enablement)?|forced broadcast enablement)',
      operatorReadinessReviewerApprovalTerms(),
    )
  );
}

function operatorReadinessReviewerTextApprovesSubject(
  normalized: string,
  subject: string,
  approval: string,
): boolean {
  const approvalConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,3}';
  const approvalSubjectConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,2}';

  return [
    new RegExp(`\\b${subject}\\b${approvalConnector}\\s+${approval}\\b`, 'gi'),
    new RegExp(`\\b${approval}\\b${approvalSubjectConnector}\\s+${subject}\\b`, 'gi'),
  ].some(pattern => hasUnnegatedOperatorReadinessReviewerApproval(normalized, pattern));
}

function hasUnnegatedOperatorReadinessReviewerApproval(normalized: string, pattern: RegExp): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 32), index);
    if (!/\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?\s+$/.test(prefix)) return true;
  }
  return false;
}

function operatorReadinessReviewerApprovalTerms(): string {
  return '(?:accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|enable|enabled|enables|support|supported|supports|permit|permitted|permits|clear|cleared|clears|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits)';
}

function validateBenchmarkStructuredSummary(
  validation: BenchmarkEvidenceValidationInput,
  prefix: string,
  options?: ReleaseGateEvaluationOptions,
): string[] {
  const commandRows = validation.commandRows;
  const metricRows = validation.metricRows;
  const shardedLaneRows = validation.shardedLaneRows;
  const bottleneckRows = validation.bottleneckRows;
  const claimsBoundary = validation.claimsBoundary;
  const reviewerRows = validation.reviewerRows;

  if (
    !Array.isArray(commandRows) ||
    !Array.isArray(metricRows) ||
    !Array.isArray(shardedLaneRows) ||
    !Array.isArray(bottleneckRows) ||
    !Array.isArray(reviewerRows)
  ) {
    return [
      `${prefix} must expose structured command, metric, sharded-lane, bottleneck, reviewer rows`,
    ];
  }
  if (!isBenchmarkClaimsBoundaryFields(claimsBoundary)) {
    return [
      `${prefix} must expose structured claims boundary`,
    ];
  }

  const commandRowObjects = structuredRowObjects(commandRows);
  const metricRowObjects = structuredRowObjects(metricRows);
  const shardedLaneRowObjects = structuredRowObjects(shardedLaneRows);
  const bottleneckRowObjects = structuredRowObjects(bottleneckRows);
  const reviewerRowObjects = structuredRowObjects(reviewerRows);
  const benchmarkEvidenceTargets = new Map<string, string>();

  return [
    ...validateStructuredRowObjects(`${prefix}: commandRows`, commandRows),
    ...validateStructuredRowObjects(`${prefix}: metricRows`, metricRows),
    ...validateStructuredRowObjects(`${prefix}: shardedLaneRows`, shardedLaneRows),
    ...validateStructuredRowObjects(`${prefix}: bottleneckRows`, bottleneckRows),
    ...validateStructuredRowObjects(`${prefix}: reviewerRows`, reviewerRows),
    ...validateRequiredLinkedRows(
      `${prefix}: commandRows`,
      commandRowObjects,
      'command',
      REQUIRED_BENCHMARK_COMMANDS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: metricRows`,
      metricRowObjects,
      'scenario',
      REQUIRED_BENCHMARK_METRIC_SCENARIOS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: shardedLaneRows`,
      shardedLaneRowObjects,
      'statement',
      REQUIRED_BENCHMARK_SHARDED_STATEMENTS,
    ),
    ...validateBenchmarkCommandEvidenceRows(prefix, commandRowObjects),
    ...validateBenchmarkMetricEvidenceRows(prefix, metricRowObjects),
    ...validateBenchmarkShardedLaneEvidenceRows(prefix, shardedLaneRowObjects),
    ...validateRequiredBenchmarkBottleneckRows(prefix, bottleneckRowObjects),
    ...validateBenchmarkBottleneckEvidenceRows(prefix, bottleneckRowObjects),
    ...validateBenchmarkClaimsBoundary(prefix, claimsBoundary),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: commandRows`,
      commandRowObjects,
      'command',
      'evidence',
      benchmarkEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: metricRows`,
      metricRowObjects,
      'scenario',
      'evidenceCommandOrLog',
      benchmarkEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: shardedLaneRows`,
      shardedLaneRowObjects,
      'statement',
      'requiredEvidence',
      benchmarkEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: bottleneckRows`,
      bottleneckRowObjects.map(row => ({ ...row, status: 'linked' })),
      'bottleneck',
      'currentEvidence',
      benchmarkEvidenceTargets,
    ),
    ...validateRequiredBenchmarkReviewerRows(
      prefix,
      reviewerRowObjects,
      validation.classification?.reviewer,
      validation.classification?.date,
    ),
    ...validateBenchmarkLiveBatchSettlementRow(validation, prefix, metricRowObjects, options),
  ];
}

function isBenchmarkClaimsBoundaryFields(
  value: BenchmarkClaimsBoundaryFields | undefined,
): value is BenchmarkClaimsBoundaryFields {
  return (
    !!value &&
    Array.isArray(value.allowedClaims) &&
    Array.isArray(value.blockedClaims)
  );
}

function validateBenchmarkClaimsBoundary(
  prefix: string,
  claimsBoundary: BenchmarkClaimsBoundaryFields,
): string[] {
  const issues: string[] = [];
  for (const claim of REQUIRED_BENCHMARK_ALLOWED_CLAIMS) {
    if (!claimsBoundary.allowedClaims.includes(claim)) {
      issues.push(`${prefix}: claimsBoundary: missing allowed claim "${claim}"`);
    }
  }
  for (const claim of REQUIRED_BENCHMARK_BLOCKED_CLAIMS) {
    if (!claimsBoundary.blockedClaims.includes(claim)) {
      issues.push(`${prefix}: claimsBoundary: missing blocked claim "${claim}"`);
    }
  }
  return issues;
}

function validateBenchmarkCommandEvidenceRows(
  prefix: string,
  rows: BenchmarkCommandRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    const evidence = row.evidence ?? '';
    if (hasContradictoryStructuredValidationFailureMarker(evidence)) {
      issues.push(
        `${prefix}: commandRows: ${row.command} must not include contradictory benchmark failure markers`,
      );
    }
    if (benchmarkPublicationEvidenceLeavesOpenBlockers(evidence)) {
      issues.push(`${prefix}: commandRows: ${row.command} must not leave benchmark blockers open`);
    }
    if (!hasCompletedBenchmarkCommandEvidence(row)) {
      issues.push(
        `${prefix}: commandRows: ${row.command} requires command-specific completed benchmark command output evidence`,
      );
    }
  }
  return issues;
}

function validateBenchmarkMetricEvidenceRows(
  prefix: string,
  rows: BenchmarkMetricRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    const evidence = row.evidenceCommandOrLog ?? '';
    if (hasContradictoryStructuredValidationFailureMarker(evidence)) {
      issues.push(
        `${prefix}: metricRows: ${row.scenario} must not include contradictory benchmark failure markers`,
      );
    }
    if (benchmarkPublicationEvidenceLeavesOpenBlockers(evidence)) {
      issues.push(`${prefix}: metricRows: ${row.scenario} must not leave benchmark blockers open`);
    }
    if (!hasCompletedBenchmarkMetricEvidence(row)) {
      issues.push(
        `${prefix}: metricRows: ${row.scenario} requires scenario-specific completed benchmark evidence and positive measurements`,
      );
    }
  }
  return issues;
}

function validateBenchmarkShardedLaneEvidenceRows(
  prefix: string,
  rows: ShardedLaneEvidenceRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    const evidence = row.requiredEvidence ?? '';
    if (hasContradictoryStructuredValidationFailureMarker(evidence)) {
      issues.push(
        `${prefix}: shardedLaneRows: ${row.statement} must not include contradictory benchmark failure markers`,
      );
    }
    if (benchmarkPublicationEvidenceLeavesOpenBlockers(evidence)) {
      issues.push(`${prefix}: shardedLaneRows: ${row.statement} must not leave benchmark blockers open`);
    }
    if (!hasCompletedBenchmarkShardedLaneEvidence(row)) {
      issues.push(
        `${prefix}: shardedLaneRows: ${row.statement} requires statement-specific completed sharded-lane evidence`,
      );
    }
  }
  return issues;
}

function validateBenchmarkBottleneckEvidenceRows(
  prefix: string,
  rows: BottleneckRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows) {
    const evidence = row.currentEvidence ?? '';
    if (hasContradictoryStructuredValidationFailureMarker(evidence)) {
      issues.push(
        `${prefix}: bottleneckRows: ${row.bottleneck} must not include contradictory benchmark failure markers`,
      );
    }
    if (benchmarkPublicationEvidenceLeavesOpenBlockers(evidence)) {
      issues.push(`${prefix}: bottleneckRows: ${row.bottleneck} must not leave benchmark blockers open`);
    }
    if (!hasCompletedBenchmarkBottleneckEvidence(row)) {
      issues.push(
        `${prefix}: bottleneckRows: ${row.bottleneck} requires bottleneck-specific completed evidence, impact, and next action`,
      );
    }
  }
  return issues;
}

function validateBenchmarkLiveBatchSettlementRow(
  validation: BenchmarkEvidenceValidationInput,
  prefix: string,
  metricRows: BenchmarkMetricRow[],
  options?: ReleaseGateEvaluationOptions,
): string[] {
  const liveBatchRow = metricRows.find(row => row.scenario === 'Live batch settlement');
  if (!liveBatchRow || liveBatchRow.status !== 'linked') return [];

  const issues: string[] = [];
  const evidence = liveBatchRow.evidenceCommandOrLog ?? '';
  if (validation.classification?.broadcastMode !== 'enabled') {
    issues.push(`${prefix}: metricRows: Live batch settlement requires classified Broadcast mode = enabled`);
  }
  if (!hasCompletedBenchmarkEvidenceTarget(evidence)) {
    issues.push(`${prefix}: metricRows: Live batch settlement requires completed live batch evidence target`);
  }
  if (!hasLiveBatchSubmitConfirmAndIdentityEvidence(evidence)) {
    issues.push(`${prefix}: metricRows: Live batch settlement requires submit, confirmation, and transaction identity evidence`);
  }
  if (!hasUserBroadcastApprovalBoundToExpectedTxId(evidence)) {
    issues.push(`${prefix}: metricRows: Live batch settlement requires user explicit live broadcast approval evidence bound to Expected transaction ID`);
  }
  if (!hasScopedBroadcastEnablementEvidence(evidence)) {
    issues.push(`${prefix}: metricRows: Live batch settlement requires scoped BRIDGE_BROADCAST_ENABLED=true evidence`);
  }
  if (!hasBenchmarkLiveReadinessPassEvidence(evidence)) {
    issues.push(`${prefix}: metricRows: Live batch settlement requires post-enable demo:readiness, Broadcast policy, and Live settlement signing PASS evidence`);
  }
  if (!/\bbroadcast network reconfirmation\b|\bnetwork reconfirmation\b/i.test(evidence)) {
    issues.push(`${prefix}: metricRows: Live batch settlement requires broadcast network reconfirmation evidence`);
  }
  issues.push(...validateBenchmarkLiveBatchLifecycleBinding(prefix, evidence, options));

  return issues;
}

function validateBenchmarkLiveBatchLifecycleBinding(
  prefix: string,
  evidence: string,
  options?: ReleaseGateEvaluationOptions,
): string[] {
  const issues: string[] = [];
  const benchmarkExpectedTxIds = new Set(extractExpectedTransactionIds(evidence));
  const benchmarkTransactionIds = new Set(extractBenchmarkLiveBatchTransactionIds(evidence));
  const livePreflightExpectedTxId = normalizeTxId(options?.livePreflightJsonValidation?.expectedTxId);
  const postSubmitSubmittedTxId = normalizeTxId(options?.postSubmitObserveJsonValidation?.submittedTxId);

  if (livePreflightExpectedTxId && !benchmarkExpectedTxIds.has(livePreflightExpectedTxId)) {
    issues.push(
      `${prefix}: metricRows: Live batch settlement Expected transaction ID must match actual live-preflight Expected transaction ID`,
    );
  }
  if (postSubmitSubmittedTxId && !benchmarkTransactionIds.has(postSubmitSubmittedTxId)) {
    issues.push(
      `${prefix}: metricRows: Live batch settlement submitted transaction identity must match actual post-submit observed submitted transaction ID`,
    );
  }

  return issues;
}

function extractBenchmarkLiveBatchTransactionIds(value: string): string[] {
  return [...value.matchAll(
    /\b(?:Expected\s+transaction\s+ID|submitted\s+transaction\s+ID|transaction\s+ID|txid|tx\s+id)\b.{0,120}(?:0x)?([0-9a-fA-F]{64})\b/gi,
  )].map(([, txId]) => txId.toLowerCase());
}

function hasConcreteCompletedEvidenceTarget(value: string): boolean {
  return extractEvidenceTargets(value).some(target =>
    isConcreteArtifactEvidenceTarget(target) ||
    (isMarkdownEvidenceTarget(target) && isConcreteEvidenceTarget(target))
  );
}

function hasLiveBatchSubmitConfirmAndIdentityEvidence(value: string): boolean {
  return (
    /\b(submit|submitted|submission|e2e:aggregate)\b/i.test(value) &&
    /\b(confirm|confirmed|confirmation|e2e:aggregate)\b/i.test(value) &&
    (
      /\b(txid|tx id|transaction id|transaction identifier|reconciliation|reconciled|e2e:aggregate)\b/i.test(value) ||
      /(?:0x)?[0-9a-fA-F]{64}/.test(value)
    )
  );
}

function hasUserBroadcastApprovalBoundToExpectedTxId(value: string): boolean {
  return evidenceSegments(value).some(segment =>
    /\b(?:user\s+explicit\s+live\s+broadcast\s+approval|explicit\s+user\s+live\s+broadcast\s+approval)\b/i
      .test(segment) &&
    /\bExpected transaction ID\b.{0,160}(?:0x)?[0-9a-fA-F]{64}\b/i.test(segment)
  );
}

function hasScopedBroadcastEnablementEvidence(value: string): boolean {
  return (
    /\bBRIDGE_BROADCAST_ENABLED\s*=\s*true\b.{0,160}\b(scoped|scope|limited\s+shell|shell)\b/i
      .test(value) ||
    /\b(scoped|scope|limited\s+shell|shell)\b.{0,160}\bBRIDGE_BROADCAST_ENABLED\s*=\s*true\b/i
      .test(value)
  );
}

function hasBenchmarkLiveReadinessPassEvidence(value: string): boolean {
  return (
    hasPositiveLabeledPassEvidence(value, /\b(?:npm run demo:readiness|post[-\s]?enable readiness)\b/i, 160) &&
    hasPositiveLabeledPassEvidence(value, /\bBroadcast policy\b/i, 160) &&
    hasPositiveLabeledPassEvidence(value, /\bLive settlement signing\b/i, 160)
  );
}

function hasPositiveLabeledPassEvidence(
  value: string,
  labelPattern: RegExp,
  maxDistance: number,
): boolean {
  const label = labelPattern.source;
  const patterns = [new RegExp(`${label}.{0,${maxDistance}}\\bPASS\\b(?!\\s*\\/)`, 'gi')];

  return patterns.some(pattern =>
    [...value.matchAll(pattern)].some(match =>
      !hasContradictoryValidationFailureMarker(match[0])
    )
  );
}

function validateRequiredBenchmarkBottleneckRows(
  prefix: string,
  rows: BottleneckRow[],
): string[] {
  const issues: string[] = [];
  issues.push(...validateDuplicateStructuredRows(`${prefix}: bottleneckRows`, rows, 'bottleneck'));
  const rowsByBottleneck = new Map(rows.map(row => [row.bottleneck, row]));
  const missing = REQUIRED_BENCHMARK_BOTTLENECKS.filter(bottleneck => !rowsByBottleneck.has(bottleneck));
  if (missing.length > 0) {
    issues.push(`${prefix}: bottleneckRows must include required bottlenecks: ${missing.join(', ')}`);
  }
  for (const bottleneck of REQUIRED_BENCHMARK_BOTTLENECKS) {
    const row = rowsByBottleneck.get(bottleneck);
    if (!row) continue;
    if (
      row.currentEvidence.trim().length === 0 ||
      row.impact.trim().length === 0 ||
      row.requiredNextAction.trim().length === 0
    ) {
      issues.push(`${prefix}: bottleneckRows: ${bottleneck}: currentEvidence, impact, and requiredNextAction are required`);
    }
  }
  return issues;
}

function validateRequiredBenchmarkReviewerRows(
  prefix: string,
  rows: BenchmarkReviewerSignoffRow[],
  reviewer?: string,
  classificationDate?: string,
): string[] {
  const issues: string[] = [];
  issues.push(...validateDuplicateStructuredRows(`${prefix}: reviewerRows`, rows, 'role'));
  const normalizedClassificationDate = classificationDate?.trim() ?? '';
  const classificationDateIsValid = isIsoCalendarDate(normalizedClassificationDate);
  if (normalizedClassificationDate.length > 0 && !classificationDateIsValid) {
    issues.push(`${prefix}: reviewerRows require Benchmark Classification Date to use YYYY-MM-DD`);
  }
  const rowsByRole = new Map(rows.map(row => [row.role, row]));
  const missing = REQUIRED_BENCHMARK_REVIEWER_ROLES.filter(role => !rowsByRole.has(role));
  if (missing.length > 0) {
    issues.push(`${prefix}: reviewerRows must include required reviewer roles: ${missing.join(', ')}`);
  }
  for (const role of REQUIRED_BENCHMARK_REVIEWER_ROLES) {
    const row = rowsByRole.get(role);
    if (!row) continue;
    if (row.decision !== 'approve') {
      issues.push(`${prefix}: reviewerRows: ${role}: decision must be approve`);
    }
    if (role === 'Benchmark owner' && reviewer && row.name !== reviewer) {
      issues.push(`${prefix}: reviewerRows: ${role}: name must match Benchmark Classification Reviewer`);
    }
    if (isBlankValue(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must use YYYY-MM-DD`);
    } else if (classificationDateIsValid && row.date < normalizedClassificationDate) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must not be before Benchmark Classification Date`);
    }
    if (!isActionableBenchmarkReviewerNote(row.notes ?? '')) {
      issues.push(`${prefix}: reviewerRows: ${role} requires actionable benchmark outcome notes`);
    }
    issues.push(...validateBenchmarkReviewerNoteClaimBoundary(prefix, row));
  }
  return issues;
}

function validateBenchmarkReviewerNoteClaimBoundary(
  prefix: string,
  row: BenchmarkReviewerSignoffRow,
): string[] {
  const notes = row.notes ?? '';
  if (notes.trim().length === 0) return [];

  const claim = classifyPublicationClaimText(notes);
  const issues: string[] = [];
  if (claim.hasMainnetProductionClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain mainnet production claim wording`);
  }
  if (claim.hasProductionReadyClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain production-ready claim wording`);
  }
  if (benchmarkReviewerNoteApprovesProductionThroughput(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve production throughput claim wording`);
  }
  if (benchmarkReviewerNoteApprovesFullParallelL1Settlement(notes)) {
    issues.push(
      `${prefix}: reviewerRows: ${row.role} notes must not approve full parallel L1 settlement while SPVTracker remains shared`,
    );
  }
  if (hasContradictoryStructuredValidationFailureMarker(notes)) {
    issues.push(
      `${prefix}: reviewerRows: ${row.role} notes must not include contradictory benchmark failure markers`,
    );
  }
  if (benchmarkPublicationEvidenceLeavesOpenBlockers(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not leave benchmark blockers open`);
  }
  return issues;
}

function benchmarkReviewerNoteApprovesProductionThroughput(value: string): boolean {
  return normalizeDecisionSummarySegmentsForReleaseGate(value).some(normalized =>
    benchmarkClaimTextApprovesSubjectForReleaseGate(
      stripExactBenchmarkProductionThroughputClaimDenial(normalized),
      '(?:production throughput claim handling|production throughput claims?|' +
        'production throughput(?:\\s+claim)?\\s+(?:allowed|handling|control))',
      benchmarkClaimApprovalTermsForReleaseGate(),
    ),
  );
}

function benchmarkReviewerNoteApprovesFullParallelL1Settlement(value: string): boolean {
  return normalizeDecisionSummarySegmentsForReleaseGate(value).some(normalized =>
    benchmarkClaimTextApprovesSubjectForReleaseGate(
      normalized,
      '(?:full parallel l1 settlement(?:\\s+(?:claims?|claim handling))?)',
      benchmarkClaimApprovalTermsForReleaseGate(),
    ),
  );
}

function benchmarkClaimApprovalTermsForReleaseGate(): string {
  return '(?:yes|accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|enable|enabled|enables|support|supported|supports|permit|permitted|permits|clear|cleared|clears|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits)';
}

function benchmarkClaimTextApprovesSubjectForReleaseGate(
  normalized: string,
  subject: string,
  approval: string,
): boolean {
  const approvalConnector =
    '(?:\\s+(?!\\b(?:but|however|though|although|except|unless|not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,2}';

  return [
    new RegExp(`\\b${subject}\\b\\s+${approval}\\b`, 'gi'),
    new RegExp(`\\b${subject}\\b\\s+(?:is|are|was|were|be|been|being|remain|remains)\\s+${approval}\\b`, 'gi'),
    new RegExp(`\\b${approval}\\b${approvalConnector}\\s+${subject}\\b`, 'gi'),
  ].some(pattern => hasUnnegatedBenchmarkClaimApprovalForReleaseGate(normalized, pattern));
}

function hasUnnegatedBenchmarkClaimApprovalForReleaseGate(normalized: string, pattern: RegExp): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 32), index);
    if (!/\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?(?:\s+benchmark)?\s+$/.test(prefix)) return true;
  }
  return false;
}

function validateExternalIntegrationStructuredSummary(
  validation: ExternalIntegrationEvidenceValidationInput,
  prefix: string,
): string[] {
  const entryPointRows = validation.entryPointRows;
  const freshCheckoutRows = validation.freshCheckoutRows;
  const decisionRows = validation.decisionRows;
  const negativeReviewRows = validation.negativeReviewRows;
  const reviewerRows = validation.reviewerRows;

  if (
    !Array.isArray(entryPointRows) ||
    !Array.isArray(freshCheckoutRows) ||
    !Array.isArray(decisionRows) ||
    !Array.isArray(negativeReviewRows) ||
    !Array.isArray(reviewerRows)
  ) {
    return [
      `${prefix} must expose structured entry-point, fresh-checkout, decision, negative, reviewer rows`,
    ];
  }

  const entryPointRowObjects = structuredRowObjects(entryPointRows);
  const freshCheckoutRowObjects = structuredRowObjects(freshCheckoutRows);
  const decisionRowObjects = structuredRowObjects(decisionRows);
  const negativeReviewRowObjects = structuredRowObjects(negativeReviewRows);
  const reviewerRowObjects = structuredRowObjects(reviewerRows);
  const externalIntegrationEvidenceTargets = new Map<string, string>();

  return [
    ...validateStructuredRowObjects(`${prefix}: entryPointRows`, entryPointRows),
    ...validateStructuredRowObjects(`${prefix}: freshCheckoutRows`, freshCheckoutRows),
    ...validateStructuredRowObjects(`${prefix}: decisionRows`, decisionRows),
    ...validateStructuredRowObjects(`${prefix}: negativeReviewRows`, negativeReviewRows),
    ...validateStructuredRowObjects(`${prefix}: reviewerRows`, reviewerRows),
    ...validateRequiredLinkedRows(
      `${prefix}: entryPointRows`,
      entryPointRowObjects,
      'entryPoint',
      REQUIRED_EXTERNAL_INTEGRATION_ENTRY_POINTS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: freshCheckoutRows`,
      freshCheckoutRowObjects,
      'command',
      REQUIRED_EXTERNAL_INTEGRATION_FRESH_CHECKOUT_COMMANDS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: decisionRows`,
      decisionRowObjects,
      'decision',
      REQUIRED_EXTERNAL_INTEGRATION_DECISIONS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: negativeReviewRows`,
      negativeReviewRowObjects,
      'misread',
      REQUIRED_EXTERNAL_INTEGRATION_NEGATIVE_MISREADS,
    ),
    ...validateExternalIntegrationEntryPointEvidenceRows(prefix, entryPointRowObjects),
    ...validateExternalIntegrationFreshCheckoutEvidenceRows(
      prefix,
      freshCheckoutRowObjects,
      validation.classification?.gitCommit,
    ),
    ...validateExternalIntegrationDecisionEvidenceRows(prefix, decisionRowObjects),
    ...validateExternalIntegrationNegativeReviewEvidenceRows(prefix, negativeReviewRowObjects),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: entryPointRows`,
      entryPointRowObjects,
      'entryPoint',
      'evidence',
      externalIntegrationEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: freshCheckoutRows`,
      freshCheckoutRowObjects,
      'command',
      'evidence',
      externalIntegrationEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: decisionRows`,
      decisionRowObjects,
      'decision',
      'evidence',
      externalIntegrationEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: negativeReviewRows`,
      negativeReviewRowObjects,
      'misread',
      'evidence',
      externalIntegrationEvidenceTargets,
    ),
    ...validateRequiredExternalIntegrationReviewerRows(
      prefix,
      reviewerRowObjects,
      validation.classification?.leadReviewer,
      validation.classification?.date,
    ),
  ];
}

function validateExternalIntegrationEntryPointEvidenceRows(
  prefix: string,
  rows: RequiredEntryPointRow[],
): string[] {
  const issues: string[] = [];
  const rowsByEntryPoint = new Map(rows.map(row => [row.entryPoint, row]));
  for (const entryPoint of REQUIRED_EXTERNAL_INTEGRATION_ENTRY_POINTS) {
    const row = rowsByEntryPoint.get(entryPoint);
    if (!row || row.status !== 'linked') continue;
    if (!hasNoContradictoryExternalIntegrationReviewEvidenceMarker(row.evidence ?? '')) {
      issues.push(
        `${prefix}: entryPointRows: ${entryPoint} must not include contradictory external-integration failure markers`,
      );
    }
    if (!hasCompletedExternalIntegrationEntryPointReviewEvidence(row.evidence ?? '')) {
      issues.push(
        `${prefix}: entryPointRows: ${entryPoint} requires completed entry-point review evidence beyond document links`,
      );
    }
  }
  return issues;
}

function validateExternalIntegrationFreshCheckoutEvidenceRows(
  prefix: string,
  rows: FreshCheckoutCommandRow[],
  reviewGitCommit?: string,
): string[] {
  const issues: string[] = [];
  const rowsByCommand = new Map(rows.map(row => [row.command, row]));
  for (const command of REQUIRED_EXTERNAL_INTEGRATION_FRESH_CHECKOUT_COMMANDS) {
    const row = rowsByCommand.get(command);
    if (!row || row.status !== 'linked') continue;
    const evidence = row.evidence ?? '';
    if (!hasNoContradictoryExternalIntegrationReviewEvidenceMarker(evidence)) {
      issues.push(
        `${prefix}: freshCheckoutRows: ${command} must not include contradictory external-integration failure markers`,
      );
    }
    if (hasContradictoryValidationFailureMarker(evidence)) {
      issues.push(
        `${prefix}: freshCheckoutRows: ${command} requires internally positive fresh-checkout command output evidence with commit identity`,
      );
    } else if (!hasSuccessfulExternalIntegrationFreshCheckoutEvidence(command, evidence)) {
      issues.push(
        `${prefix}: freshCheckoutRows: ${command} requires fresh-checkout command output evidence with exit code 0 and commit identity`,
      );
    } else if (!hasExternalIntegrationExpectedGitCommitEvidence(evidence, reviewGitCommit)) {
      issues.push(
        `${prefix}: freshCheckoutRows: ${command} requires fresh-checkout command output evidence to match Review Classification Git commit`,
      );
    }
  }
  return issues;
}

function validateExternalIntegrationDecisionEvidenceRows(
  prefix: string,
  rows: IntegrationDecisionRow[],
): string[] {
  const issues: string[] = [];
  const rowsByDecision = new Map(rows.map(row => [row.decision, row]));
  for (const decision of REQUIRED_EXTERNAL_INTEGRATION_DECISIONS) {
    const row = rowsByDecision.get(decision);
    if (!row || row.status !== 'linked') continue;
    if (!hasExpectedExternalIntegrationDecisionAnswer(decision, row.requiredAnswer ?? '')) {
      issues.push(
        `${prefix}: decisionRows: ${decision} requires bounded required answer`,
      );
    }
    if (!hasNoContradictoryExternalIntegrationReviewEvidenceMarker(row.evidence ?? '')) {
      issues.push(
        `${prefix}: decisionRows: ${decision} must not include contradictory external-integration failure markers`,
      );
    }
    if (!hasExternalIntegrationDecisionSpecificEvidence(decision, row.evidence ?? '')) {
      issues.push(
        `${prefix}: decisionRows: ${decision} requires decision-specific completed evidence`,
      );
    }
  }
  return issues;
}

function validateExternalIntegrationNegativeReviewEvidenceRows(
  prefix: string,
  rows: NegativeReviewRow[],
): string[] {
  const issues: string[] = [];
  const rowsByMisread = new Map(rows.map(row => [row.misread, row]));
  for (const misread of REQUIRED_EXTERNAL_INTEGRATION_NEGATIVE_MISREADS) {
    const row = rowsByMisread.get(misread);
    if (!row || row.status !== 'linked') continue;
    if (!hasExpectedExternalIntegrationNegativeCorrection(misread, row.expectedCorrection ?? '')) {
      issues.push(
        `${prefix}: negativeReviewRows: ${misread} requires expected correction text`,
      );
    }
    if (!hasNoContradictoryExternalIntegrationReviewEvidenceMarker(row.evidence ?? '')) {
      issues.push(
        `${prefix}: negativeReviewRows: ${misread} must not include contradictory external-integration failure markers`,
      );
    }
    if (!hasExternalIntegrationNegativeReviewCorrectionEvidence(misread, row.evidence ?? '')) {
      issues.push(
        `${prefix}: negativeReviewRows: ${misread} requires negative-review correction evidence`,
      );
    }
  }
  return issues;
}

function validateRequiredExternalIntegrationReviewerRows(
  prefix: string,
  rows: ExternalIntegrationReviewerSignoffRow[],
  leadReviewer?: string,
  classificationDate?: string,
): string[] {
  const issues: string[] = [];
  issues.push(...validateDuplicateStructuredRows(`${prefix}: reviewerRows`, rows, 'role'));
  const normalizedClassificationDate = classificationDate?.trim() ?? '';
  const classificationDateIsValid = isIsoCalendarDate(normalizedClassificationDate);
  if (normalizedClassificationDate.length > 0 && !classificationDateIsValid) {
    issues.push(`${prefix}: reviewerRows require Review Classification Date to use YYYY-MM-DD`);
  }
  const rowsByRole = new Map(rows.map(row => [row.role, row]));
  const missing = REQUIRED_EXTERNAL_INTEGRATION_REVIEWER_ROLES.filter(role => !rowsByRole.has(role));
  if (missing.length > 0) {
    issues.push(`${prefix}: reviewerRows must include required reviewer roles: ${missing.join(', ')}`);
  }
  for (const role of REQUIRED_EXTERNAL_INTEGRATION_REVIEWER_ROLES) {
    const row = rowsByRole.get(role);
    if (!row) continue;
    if (row.decision !== 'approve') {
      issues.push(`${prefix}: reviewerRows: ${role}: decision must be approve`);
    }
    if (role === 'Integration reviewer' && leadReviewer && row.name !== leadReviewer) {
      issues.push(`${prefix}: reviewerRows: ${role}: name must match Review Classification Lead reviewer`);
    }
    if (isBlankValue(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must use YYYY-MM-DD`);
    } else if (classificationDateIsValid && row.date < normalizedClassificationDate) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must not be before Review Classification Date`);
    }
    if (!isActionableExternalIntegrationReviewerNote(row.notes ?? '')) {
      issues.push(`${prefix}: reviewerRows: ${role} requires actionable external-integration outcome notes`);
    }
    issues.push(...validateExternalIntegrationReviewerNoteClaimBoundary(prefix, row));
  }
  return issues;
}

function validateExternalIntegrationReviewerNoteClaimBoundary(
  prefix: string,
  row: ExternalIntegrationReviewerSignoffRow,
): string[] {
  const notes = row.notes ?? '';
  if (notes.trim().length === 0) return [];

  const claim = classifyPublicationClaimText(notes);
  const issues: string[] = [];
  if (claim.hasMainnetProductionClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain mainnet production claim wording`);
  }
  if (claim.hasProductionReadyClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain production-ready claim wording`);
  }
  if (externalIntegrationReviewerNoteAdmitsPrivateMaintainerContext(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not admit private maintainer context`);
  }
  if (!hasNoContradictoryExternalIntegrationReviewEvidenceMarker(notes)) {
    issues.push(
      `${prefix}: reviewerRows: ${row.role} notes must not include contradictory external-integration failure markers`,
    );
  }
  return issues;
}

function externalIntegrationReviewerNoteAdmitsPrivateMaintainerContext(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  const approval = externalIntegrationReviewerApprovalTermsForReleaseGate();
  return (
    /\bprivate (?:maintainer )?context used yes\b/.test(normalized) ||
    externalIntegrationReviewerNoteApprovesPrivateMaintainerContext(value) ||
    (
      new RegExp(`\\b(?:used|provided|required|needed|available|relied|${approval})\\s+private (?:maintainer )?context\\b`, 'i').test(normalized) &&
      !externalIntegrationReviewerNoteConfirmsNoPrivateMaintainerContext(value)
    ) ||
    (
      new RegExp(`\\bprivate (?:maintainer )?context\\s+(?:was\\s+)?(?:used|provided|required|needed|available|relied|${approval})\\b`, 'i').test(normalized) &&
      !externalIntegrationReviewerNoteConfirmsNoPrivateMaintainerContext(value)
    ) ||
    (
      /\bprivate (?:maintainer )?context\b/.test(normalized) &&
      new RegExp(`\\b(?:yes|used|required|provided|needed|available|relied|${approval})\\b`, 'i').test(normalized) &&
      !externalIntegrationReviewerNoteConfirmsNoPrivateMaintainerContext(value)
    )
  );
}

function externalIntegrationReviewerNoteApprovesPrivateMaintainerContext(value: string): boolean {
  const approval = externalIntegrationReviewerApprovalTermsForReleaseGate();
  return normalizeDecisionSummarySegmentsForReleaseGate(value).some(segment =>
    !externalIntegrationReviewerNoteApprovalIsNegated(segment, approval) &&
    externalIntegrationReviewerTextApprovesSubjectForReleaseGate(
      segment,
      'private (?:maintainer )?context',
      approval,
    ),
  );
}

function externalIntegrationTextApprovesClaimEscalation(value: string): boolean {
  const approval = externalIntegrationReviewerApprovalTermsForReleaseGate();
  const subject =
    '(?:mainnet release readiness(?:\\s+claims?)?|production ready(?:\\s+(?:wording|claims?))?|' +
    'mainnet production(?:\\s+(?:wording|claims?))?)';

  return normalizeDecisionSummarySegmentsForReleaseGate(value).some(segment =>
    !externalIntegrationReviewerNoteClaimEscalationApprovalIsNegated(segment, subject, approval) &&
    externalIntegrationReviewerTextApprovesSubjectForReleaseGate(segment, subject, approval),
  );
}

function externalIntegrationReviewerTextApprovesSubjectForReleaseGate(
  segment: string,
  subject: string,
  approval: string,
): boolean {
  const subjectApprovalConnector =
    '(?:\\s+(?!\\b(?:but|however|though|although|except|unless|not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,3}';
  const approvalSubjectConnector =
    '(?:\\s+(?!\\b(?:but|however|though|although|except|unless|not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,2}';

  return [
    new RegExp(`\\b${subject}\\b${subjectApprovalConnector}\\s+${approval}\\b`, 'gi'),
    new RegExp(`\\b${approval}\\b${approvalSubjectConnector}\\s+${subject}\\b`, 'gi'),
  ].some(pattern => hasUnnegatedExternalIntegrationReviewerApprovalMatchForReleaseGate(segment, pattern));
}

function hasUnnegatedExternalIntegrationReviewerApprovalMatchForReleaseGate(
  segment: string,
  pattern: RegExp,
): boolean {
  for (const match of segment.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = segment.slice(Math.max(0, index - 32), index);
    if (/\b(?:no|not|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?\s+$/i.test(prefix)) continue;
    return true;
  }
  return false;
}

function externalIntegrationReviewerNoteApprovalIsNegated(segment: string, approval: string): boolean {
  return (
    new RegExp(`\\bprivate (?:maintainer )?context\\b(?:\\s+[a-z0-9]+){0,3}\\s+(?:not|never)\\s+${approval}\\b`, 'i').test(segment) ||
    new RegExp(`\\b(?:not|never)\\s+${approval}\\b(?:\\s+[a-z0-9]+){0,2}\\s+private (?:maintainer )?context\\b`, 'i').test(segment)
  );
}

function externalIntegrationReviewerNoteClaimEscalationApprovalIsNegated(
  segment: string,
  subject: string,
  approval: string,
): boolean {
  return (
    new RegExp(`\\b(?:do not|does not|must not|not to|never)\\s+${approval}\\b(?:\\s+[a-z0-9]+){0,2}\\s+${subject}\\b(?:\\s+wording)?`, 'i').test(segment) ||
    new RegExp(`\\b${subject}\\b(?:\\s+[a-z0-9]+){0,2}\\s+(?:not|never)\\s+${approval}\\b`, 'i').test(segment) ||
    new RegExp(`\\b${subject}\\b(?:\\s+[a-z0-9]+){0,2}\\s+${approval}\\b\\s+(?:no|false|0|blocked|forbidden|disabled|rejected|refused|not\\s+allowed)\\b`, 'i').test(segment)
  );
}

function externalIntegrationReviewerNoteConfirmsNoPrivateMaintainerContext(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\bprivate maintainer context used no\b/.test(normalized) ||
    /\bno private (?:maintainer )?context\b/.test(normalized) ||
    /\b(?:absent|absence of|lack of|lacking) private (?:maintainer )?context\b/.test(normalized) ||
    /\bevidence lacks private (?:maintainer )?context\b/.test(normalized) ||
    /\bwithout private (?:maintainer )?context\b/.test(normalized) ||
    /\b(?:not|never)\s+used\s+private (?:maintainer )?context\b/.test(normalized) ||
    /\bprivate (?:maintainer )?context (?:absent|not used|unused|blocked|forbidden|not allowed)\b/.test(normalized)
  );
}

function externalIntegrationReviewerApprovalTermsForReleaseGate(): string {
  return '(?:accept|accepted|accepts|approve|approved|approves|allow|allowed|allows|support|supported|supports|permit|permitted|permits|clear|cleared|clears|enable|enabled|enables|grant|granted|grants|authori[sz]e|authori[sz]ed|authori[sz]es|certify|certified|certifies|endorse|endorsed|endorses|recommend|recommended|recommends|accredit|accredited|accredits)';
}

function hasCompletedExternalIntegrationEntryPointReviewEvidence(value: string): boolean {
  return (
    hasCompletedExternalIntegrationEvidenceTarget(value) &&
    hasNoContradictoryExternalIntegrationReviewEvidenceMarker(value) &&
    /\bentry[- ]?point\b/i.test(value) &&
    /\breview\b/i.test(value) &&
    (
      /without private (?:maintainer )?context|no private (?:maintainer )?context/i.test(value) ||
      hasExactExternalIntegrationPrivateMaintainerContextUsedNoBinding(value)
    )
  );
}

function hasSuccessfulExternalIntegrationFreshCheckoutEvidence(command: string, value: string): boolean {
  return (
    hasCompletedExternalIntegrationEvidenceTarget(value) &&
    externalIntegrationCommandEvidenceIdentifiesCommand(command, value) &&
    /\b(?:fresh|clean)[- ]checkout\b/i.test(value) &&
    hasExternalIntegrationGitCommitEvidence(value) &&
    hasExactZeroExitStatusEvidence(value)
  );
}

function hasExactZeroExitStatusEvidence(value: string): boolean {
  return /\b(?:exit[- ]?code|exit[- ]?status|status|code)\s*(?:=|:)?\s*0\b(?!\s*\/)/i.test(value);
}

function externalIntegrationCommandEvidenceIdentifiesCommand(command: string, evidence: string): boolean {
  return new RegExp(`\\b${escapeRegExp(command)}\\b`, 'i').test(evidence) ||
    externalIntegrationCommandSlugPattern(command).test(evidence);
}

function externalIntegrationCommandSlugPattern(command: string): RegExp {
  const slugPattern = command
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(escapeRegExp)
    .join('[-_ ]+');
  return new RegExp(`\\b${slugPattern}\\b`, 'i');
}

function hasExternalIntegrationGitCommitEvidence(value: string): boolean {
  return (
    /\b(?:git[- ]?)?(?:commit|sha|head)\b[^|\n]{0,80}\b[a-f0-9]{7,40}\b/i.test(value) ||
    /\b[a-f0-9]{7,40}\b[^|\n]{0,80}\b(?:git[- ]?)?(?:commit|sha|head)\b/i.test(value)
  );
}

function hasExternalIntegrationExpectedGitCommitEvidence(
  value: string,
  expectedGitCommit?: string,
): boolean {
  const normalizedCommit = expectedGitCommit?.trim() ?? '';
  if (normalizedCommit.length === 0) return true;
  return new RegExp(`\\b${escapeRegExp(normalizedCommit)}\\b`, 'i').test(value);
}

function hasExternalIntegrationDecisionSpecificEvidence(decision: string, value: string): boolean {
  return hasCompletedExternalIntegrationEvidenceTarget(value) &&
    hasNoContradictoryExternalIntegrationReviewEvidenceMarker(value) &&
    externalIntegrationDecisionEvidencePattern(decision).test(value);
}

function externalIntegrationDecisionEvidencePattern(decision: string): RegExp {
  switch (decision) {
    case 'Which trust model applies today?':
      return /trust[- ]model|single[- ]signer|committee|trustless[- ]proof/i;
    case 'Which signer path is allowed?':
      return /signer|signing[- ]path|local[- ]wasm|node[- ]wallet/i;
    case 'How is broadcast enabled?':
      return /broadcast|BRIDGE_BROADCAST_ENABLED|readiness/i;
    case 'Which path is still trusted-oracle?':
      return /trusted[- ]oracle|burn[- ]interpretation|phase[- ]011/i;
    case 'Which sidechain commitment format is expected?':
      return /sidechain[- ]commitment|0x04xx|patched[- ]devnet/i;
    case 'How are duplicate burns rejected?':
      return /duplicate[- ]burn|DUP|AVL|confirmation/i;
    case 'How are batches bounded?':
      return /batch(?:es)?|claim[- ]core|context[- ]extension|unlock[- ]cap/i;
    case 'Which contract and relayer assumptions are stable?':
      return /contract|relayer|registers?|Var slots?|transaction shapes?|integration invariants?/i;
    case 'What blocks scaling claims?':
      return /scaling|benchmark|live[- ]sharded|sharded/i;
    case 'How is recovery performed?':
      return /recovery|runbooks?|SQLite|AVL|restore/i;
    default:
      return /a^/;
  }
}

function hasExternalIntegrationNegativeReviewCorrectionEvidence(misread: string, value: string): boolean {
  return (
    hasCompletedExternalIntegrationEvidenceTarget(value) &&
    hasNoContradictoryExternalIntegrationReviewEvidenceMarker(value) &&
    /\bnegative[- ]review\b/i.test(value) &&
    externalIntegrationNegativeReviewEvidencePattern(misread).test(value)
  );
}

function externalIntegrationNegativeReviewEvidencePattern(misread: string): RegExp {
  switch (misread) {
    case 'The bridge is production-ready today':
      return /production[- ]ready|pending evidence|blocked/i;
    case 'Testnet or patched-devnet success implies mainnet readiness':
      return /mainnet|testnet production[- ]candidate|production[- ]grade testnet/i;
    case 'Node-wallet signing is acceptable for production':
      return /node[- ]wallet|local[- ]wasm|signing/i;
    case 'Broadcast can happen implicitly':
      return /broadcast|explicit opt[- ]in|readiness/i;
    case 'Current burn verification is trustless':
      return /trustless(?: burn)?|burn verification|phase[- ]011/i;
    case 'FROST is the current committee implementation':
      return /FROST|atLeast|phase[- ]010a/i;
    case 'Sharded lanes already prove full L1 parallel settlement':
      return /sharded|L1 parallel|settlement|benchmark/i;
    case 'Offline showcase output is live benchmark evidence':
      return /offline showcase|live benchmark|benchmark evidence/i;
    default:
      return /a^/;
  }
}

function isActionableExternalIntegrationReviewerNote(value: string): boolean {
  return (
    hasNoContradictoryExternalIntegrationReviewEvidenceMarker(value) &&
    /\b(accept|accepted|approve|approved|verify|verified|validate|validated|confirm|confirmed|pass|passed|block|blocked|fail|failed|correct|corrected|trace|traced|reproduce|reproduced|complete|completed)\b/i.test(value) &&
    /\b(external integration|integration package|fresh checkout|entry point|decision record|negative review|misread|private maintainer context|release blocker|trust model|signer path|broadcast|trusted-oracle|trustless burn|FROST|sharded|SPVTracker|benchmark evidence|runbook|operator-ready)\b/i.test(value)
  );
}

function validateTrustlessBurnStructuredSummary(
  validation: TrustlessBurnEvidenceValidationInput,
  prefix: string,
): string[] {
  const componentRows = validation.componentRows;
  const commitmentRows = validation.commitmentRows;
  const burnProofRows = validation.burnProofRows;
  const positiveRows = validation.positiveRows;
  const negativeRows = validation.negativeRows;
  const reviewerRows = validation.reviewerRows;

  if (
    !Array.isArray(componentRows) ||
    !Array.isArray(commitmentRows) ||
    !Array.isArray(burnProofRows) ||
    !Array.isArray(positiveRows) ||
    !Array.isArray(negativeRows) ||
    !Array.isArray(reviewerRows)
  ) {
    return [
      `${prefix} must expose structured component, commitment, burn-proof, positive, negative, reviewer evidence rows`,
    ];
  }

  const componentRowObjects = structuredRowObjects(componentRows);
  const commitmentRowObjects = structuredRowObjects(commitmentRows);
  const burnProofRowObjects = structuredRowObjects(burnProofRows);
  const positiveRowObjects = structuredRowObjects(positiveRows);
  const negativeRowObjects = structuredRowObjects(negativeRows);
  const reviewerRowObjects = structuredRowObjects(reviewerRows);
  const trustlessBurnEvidenceTargets = new Map<string, string>();

  return [
    ...validateStructuredRowObjects(`${prefix}: componentRows`, componentRows),
    ...validateStructuredRowObjects(`${prefix}: commitmentRows`, commitmentRows),
    ...validateStructuredRowObjects(`${prefix}: burnProofRows`, burnProofRows),
    ...validateStructuredRowObjects(`${prefix}: positiveRows`, positiveRows),
    ...validateStructuredRowObjects(`${prefix}: negativeRows`, negativeRows),
    ...validateStructuredRowObjects(`${prefix}: reviewerRows`, reviewerRows),
    ...validateRequiredLinkedRows(
      `${prefix}: componentRows`,
      componentRowObjects,
      'component',
      REQUIRED_TRUSTLESS_BURN_COMPONENTS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: commitmentRows`,
      commitmentRowObjects,
      'field',
      REQUIRED_TRUSTLESS_BURN_COMMITMENT_FIELDS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: burnProofRows`,
      burnProofRowObjects,
      'field',
      REQUIRED_TRUSTLESS_BURN_PROOF_FIELDS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: positiveRows`,
      positiveRowObjects,
      'check',
      REQUIRED_TRUSTLESS_BURN_POSITIVE_CHECKS,
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: negativeRows`,
      negativeRowObjects,
      'check',
      REQUIRED_TRUSTLESS_BURN_NEGATIVE_CHECKS,
    ),
    ...validateTrustlessBurnComponentEvidenceRows(prefix, componentRowObjects),
    ...validateTrustlessBurnCommitmentEvidenceRows(prefix, commitmentRowObjects),
    ...validateTrustlessBurnProofEvidenceRows(prefix, burnProofRowObjects),
    ...validateTrustlessBurnPositiveEvidenceRows(prefix, positiveRowObjects),
    ...validateTrustlessBurnNegativeEvidenceRows(prefix, negativeRowObjects, validation.localProofVector),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: componentRows`,
      componentRowObjects,
      'component',
      'evidence',
      trustlessBurnEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: commitmentRows`,
      commitmentRowObjects,
      'field',
      'evidence',
      trustlessBurnEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: burnProofRows`,
      burnProofRowObjects,
      'field',
      'evidence',
      trustlessBurnEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: positiveRows`,
      positiveRowObjects,
      'check',
      'evidence',
      trustlessBurnEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: negativeRows`,
      negativeRowObjects,
      'check',
      'evidence',
      trustlessBurnEvidenceTargets,
    ),
    ...validateRequiredTrustlessBurnReviewerRows(
      prefix,
      reviewerRowObjects,
      validation.classification?.reviewer,
      validation.classification?.date,
    ),
    ...validateTrustlessBurnProofVectorReportTarget(
      prefix,
      validation.localProofVectorReportTarget,
      trustlessBurnEvidenceTargets,
      validation.publicationDecision,
    ),
    ...validateTrustlessBurnLocalProofVectorBinding(
      prefix,
      validation.localProofVector,
      commitmentRowObjects,
      burnProofRowObjects,
    ),
    ...validateTrustlessBurnConcreteInstanceRows(prefix, commitmentRowObjects, burnProofRowObjects),
    ...validateTrustlessBurnPositiveProofInstanceBinding(
      prefix,
      positiveRowObjects,
      commitmentRowObjects,
      burnProofRowObjects,
    ),
  ];
}

function validateTrustlessBurnProofVectorReportTarget(
  prefix: string,
  reportTarget: string | undefined,
  completedEvidenceTargets: Map<string, string>,
  publicationDecision: TrustlessBurnEvidenceValidationInput['publicationDecision'],
): string[] {
  const issues: string[] = [];
  if (typeof reportTarget !== 'string' || reportTarget.trim().length === 0) {
    return [`${prefix} must expose a linked Proof-vector validation report target`];
  }
  if (!/\.json(?:[\s),.;]|$)/i.test(reportTarget)) {
    issues.push(`${prefix} Proof-vector validation report target must reference JSON evidence`);
  }
  const normalizedReportTarget = normalizeEvidenceTarget(reportTarget);
  if (!isCompletedJsonEvidenceTarget(normalizedReportTarget)) {
    issues.push(`${prefix} Proof-vector validation report target must reference completed JSON evidence`);
  }
  if (normalizedReportTarget.length === 0 || !isConcreteEvidenceTarget(normalizedReportTarget)) {
    return issues;
  }

  const completedRowLabel = completedEvidenceTargets.get(normalizedReportTarget);
  if (completedRowLabel) {
    issues.push(
      `${prefix} Proof-vector validation report target ${normalizedReportTarget} ` +
      `is reused as completed row evidence by ${completedRowLabel}`,
    );
  }
  for (const label of trustlessBurnPublicationUpdateLabelsForTarget(
    publicationDecision,
    normalizedReportTarget,
  )) {
    issues.push(
      `${prefix} Proof-vector validation report target ${normalizedReportTarget} ` +
      `is reused as publication-update evidence by ${label}`,
    );
  }
  return issues;
}

function isCompletedJsonEvidenceTarget(target: string): boolean {
  return (
    /\.json$/i.test(target) &&
    isConcreteEvidenceTarget(target) &&
    /(?:^|[\/_.-])completed(?:[\/_.-]|$)/i.test(target)
  );
}

function trustlessBurnPublicationUpdateLabelsForTarget(
  publicationDecision: TrustlessBurnEvidenceValidationInput['publicationDecision'],
  reportTarget: string,
): string[] {
  if (!publicationDecision) return [];
  return [
    {
      label: 'Required release checklist updates',
      evidence: publicationDecision.requiredReleaseChecklistUpdates,
    },
    {
      label: 'Required release-note updates',
      evidence: publicationDecision.requiredReleaseNoteUpdates,
    },
  ].filter(({ evidence }) =>
    typeof evidence === 'string' &&
    extractEvidenceTargets(evidence)
      .map(normalizeEvidenceTarget)
      .filter(isConcreteEvidenceTarget)
      .includes(reportTarget),
  ).map(({ label }) => label);
}

function validateTrustlessBurnComponentEvidenceRows(
  prefix: string,
  rows: RequiredComponentRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (
      !hasTrustlessBurnComponentProperty(row.component, row.requiredProperty) ||
      !hasCompletedTrustlessBurnEvidenceTarget(row.evidence)
    ) {
      issues.push(
        `${prefix}: componentRows: ${row.component} requires component-specific trustless property and completed component evidence`,
      );
    }
  }
  return issues;
}

function validateTrustlessBurnCommitmentEvidenceRows(
  prefix: string,
  rows: CommitmentFormatRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (
      !hasTrustlessBurnCommitmentFieldEncoding(row.field, row.valueOrEncoding) ||
      !hasCompletedTrustlessBurnEvidenceTarget(row.evidence)
    ) {
      issues.push(
        `${prefix}: commitmentRows: ${row.field} requires completed commitment evidence and field-specific encoding`,
      );
    }
  }
  return issues;
}

function validateTrustlessBurnProofEvidenceRows(
  prefix: string,
  rows: BurnProofBindingRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (
      !hasTrustlessBurnProofBinding(row.field, row.bindingRule) ||
      !hasCompletedTrustlessBurnEvidenceTarget(row.evidence)
    ) {
      issues.push(
        `${prefix}: burnProofRows: ${row.field} requires completed burn-proof evidence and field-specific binding`,
      );
    }
  }
  return issues;
}

function validateTrustlessBurnPositiveEvidenceRows(
  prefix: string,
  rows: PositiveProofRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (!hasTrustlessBurnPositiveProofEvidence(row.check, row.expectedResult, row.evidence)) {
      issues.push(
        `${prefix}: positiveRows: ${row.check} requires positive-proof-specific completed acceptance evidence`,
      );
    }
  }
  return issues;
}

function validateTrustlessBurnNegativeEvidenceRows(
  prefix: string,
  rows: NegativeProofRow[],
  localProofVector?: TrustlessBurnLocalProofVector,
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (!hasTrustlessBurnNegativeProofEvidence(row.check, row.expectedResult, row.evidence)) {
      issues.push(
        `${prefix}: negativeRows: ${row.check} requires negative-test-specific completed rejection evidence`,
      );
    }
  }
  issues.push(
    ...validateTrustlessBurnLocalProofCoreNegativeRowBindings(rows, localProofVector).map(issue => `${prefix}: ${issue}`),
  );
  return issues;
}

function validateTrustlessBurnLocalProofVectorBinding(
  prefix: string,
  localProofVector: TrustlessBurnLocalProofVector | undefined,
  commitmentRows: CommitmentFormatRow[],
  burnProofRows: BurnProofBindingRow[],
): string[] {
  if (!isRecord(localProofVector)) {
    return [
      `${prefix} must expose structured local proof vector bound to commitment and burn-proof rows`,
    ];
  }

  const issues: string[] = [];
  const leaf = isRecord(localProofVector.leaf) ? localProofVector.leaf : undefined;
  if (!leaf) {
    issues.push(`${prefix} localProofVector.leaf must be an object`);
  }
  if (!Array.isArray(localProofVector.proof)) {
    issues.push(`${prefix} localProofVector.proof must be an array`);
  } else {
    issues.push(...validateTrustlessBurnLocalProofNodes(prefix, localProofVector.proof));
  }
  if (!Array.isArray(localProofVector.negativeCases) || localProofVector.negativeCases.length === 0) {
    issues.push(`${prefix} localProofVector.negativeCases must expose local proof-core negative cases`);
  } else {
    for (const [index, negativeCase] of localProofVector.negativeCases.entries()) {
      if (!isRecord(negativeCase)) {
        issues.push(`${prefix} localProofVector.negativeCases[${index}] must be a structured object`);
      }
    }
    const negativeCaseObjects = structuredRowObjects(localProofVector.negativeCases);
    const negativeCaseNames = new Set(
      negativeCaseObjects
        .map(candidate => typeof candidate?.name === 'string' ? candidate.name.trim() : '')
        .filter(name => name.length > 0),
    );
    const requiredLocalNegativeCases = [
      'wrong-sidechain-id',
      'wrong-burn-id',
      'wrong-event-index',
      'wrong-recipient',
      'wrong-amount',
      'wrong-duplicate-prevention-key',
      'wrong-bridge-event-root',
      'malformed-inclusion-path',
    ];
    const missing = requiredLocalNegativeCases.filter(name => !negativeCaseNames.has(name));
    if (missing.length > 0) {
      issues.push(`${prefix} localProofVector.negativeCases must include local proof-core negative cases: ${missing.join(', ')}`);
    }
  }

  const bridgeEventRoot = trustlessBurnConcreteHexValue(commitmentRows, 'bridgeEventRoot', 'valueOrEncoding');
  const sidechainId = trustlessBurnConcreteHexValue(commitmentRows, 'sidechainId', 'valueOrEncoding');
  const burnId = trustlessBurnConcreteHexValue(burnProofRows, 'burnId', 'bindingRule');
  const sidechainBlockHash = trustlessBurnConcreteHexValue(burnProofRows, 'sidechainBlockHash', 'bindingRule');
  const sidechainTxHash = trustlessBurnConcreteHexValue(burnProofRows, 'sidechainTxHash', 'bindingRule');
  const duplicatePreventionKey = trustlessBurnConcreteHexValue(burnProofRows, 'duplicatePreventionKey', 'bindingRule');
  const recipient = trustlessBurnConcreteHexValue(burnProofRows, 'recipientErgoTreeHash', 'bindingRule');
  const amount = trustlessBurnConcretePositiveIntegerValue(burnProofRows, 'amountNanoErg');
  const eventIndex = trustlessBurnConcreteNonNegativeIntegerValue(burnProofRows, 'eventIndex');

  issues.push(
    ...validateTrustlessBurnLocalProofHexBinding(
      prefix,
      'localProofVector.bridgeEventRootHex',
      localProofVector.bridgeEventRootHex,
      bridgeEventRoot,
      'commitmentRows bridgeEventRoot',
    ),
    ...validateTrustlessBurnLocalProofHexBinding(
      prefix,
      'localProofVector.duplicatePreventionKeyHex',
      localProofVector.duplicatePreventionKeyHex,
      duplicatePreventionKey,
      'burnProofRows duplicatePreventionKey',
    ),
    ...validateTrustlessBurnLocalProofHexBinding(
      prefix,
      'localProofVector.recipientErgoTreeHashHex',
      localProofVector.recipientErgoTreeHashHex,
      recipient,
      'burnProofRows recipientErgoTreeHash',
    ),
    ...validateTrustlessBurnLocalProofHexBinding(
      prefix,
      'localProofVector.leaf.sidechainIdHex',
      leaf?.sidechainIdHex,
      sidechainId,
      'commitmentRows sidechainId',
    ),
    ...validateTrustlessBurnLocalProofHexBinding(
      prefix,
      'localProofVector.leaf.sidechainBlockHashHex',
      leaf?.sidechainBlockHashHex,
      sidechainBlockHash,
      'burnProofRows sidechainBlockHash',
    ),
    ...validateTrustlessBurnLocalProofHexBinding(
      prefix,
      'localProofVector.leaf.burnIdHex',
      leaf?.burnIdHex,
      burnId,
      'burnProofRows burnId',
    ),
    ...validateTrustlessBurnLocalProofHexBinding(
      prefix,
      'localProofVector.leaf.sidechainTxHashHex',
      leaf?.sidechainTxHashHex,
      sidechainTxHash,
      'burnProofRows sidechainTxHash',
    ),
    ...validateTrustlessBurnLocalProofHexBinding(
      prefix,
      'localProofVector.leaf.recipientErgoTreeHashHex',
      leaf?.recipientErgoTreeHashHex,
      recipient,
      'burnProofRows recipientErgoTreeHash',
    ),
  );

  const vectorAmount = normalizeTrustlessBurnPositiveIntegerValue(localProofVector.amountNanoErg);
  const leafAmount = normalizeTrustlessBurnPositiveIntegerValue(leaf?.amountNanoErg);
  if (!vectorAmount || !amount || vectorAmount !== amount) {
    issues.push(`${prefix} localProofVector.amountNanoErg must match burnProofRows amountNanoErg`);
  }
  if (!leafAmount || !amount || leafAmount !== amount) {
    issues.push(`${prefix} localProofVector.leaf.amountNanoErg must match burnProofRows amountNanoErg`);
  }

  const leafEventIndex = normalizeTrustlessBurnNonNegativeIntegerValue(leaf?.eventIndex);
  if (!leafEventIndex || !eventIndex || leafEventIndex !== eventIndex) {
    issues.push(`${prefix} localProofVector.leaf.eventIndex must match burnProofRows eventIndex`);
  }

  return issues;
}

function validateTrustlessBurnLocalProofNodes(
  prefix: string,
  proof: unknown[],
): string[] {
  const issues: string[] = [];
  if (proof.length === 0) {
    issues.push(`${prefix} localProofVector.proof must include at least one inclusion proof node`);
    return issues;
  }

  for (let index = 0; index < proof.length; index += 1) {
    const step = proof[index];
    if (!isRecord(step)) {
      issues.push(`${prefix} localProofVector.proof[${index}] must be a structured inclusion proof node`);
      continue;
    }
    if (step.side !== 'left' && step.side !== 'right') {
      issues.push(`${prefix} localProofVector.proof[${index}].side must be left or right`);
    }
    if (!normalizeTrustlessBurnHex32Value(step.hashHex)) {
      issues.push(`${prefix} localProofVector.proof[${index}].hashHex must be a 32-byte hex sibling hash`);
    }
  }
  return issues;
}

function validateTrustlessBurnLocalProofHexBinding(
  prefix: string,
  field: string,
  actualValue: unknown,
  expectedValue: string | null,
  expectedLabel: string,
): string[] {
  const normalizedActual = normalizeTrustlessBurnHex32Value(actualValue);
  if (!normalizedActual || !expectedValue || normalizedActual !== expectedValue) {
    return [`${prefix} ${field} must match ${expectedLabel}`];
  }
  return [];
}

function normalizeTrustlessBurnHex32Value(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

const TRUSTLESS_BURN_UINT64_MAX = 0xffff_ffff_ffff_ffffn;

function normalizeTrustlessBurnPositiveIntegerValue(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  if (typeof value === 'bigint') {
    return value > 0n && value <= TRUSTLESS_BURN_UINT64_MAX ? value.toString() : null;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return isTrustlessBurnPositiveUint64Text(normalized) ? normalized : null;
}

function isTrustlessBurnPositiveUint64Text(value: string): boolean {
  return /^(?!0+$)\d+$/.test(value) && BigInt(value) <= TRUSTLESS_BURN_UINT64_MAX;
}

function normalizeTrustlessBurnNonNegativeIntegerValue(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }
  if (typeof value === 'bigint') {
    return value >= 0n ? value.toString() : null;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^(?:0|[1-9]\d*)$/.test(normalized) ? normalized : null;
}

function validateRequiredTrustlessBurnReviewerRows(
  prefix: string,
  rows: TrustlessBurnReviewerSignoffRow[],
  classificationReviewer?: string,
  classificationDate?: string,
): string[] {
  const issues: string[] = [];
  issues.push(...validateDuplicateStructuredRows(`${prefix}: reviewerRows`, rows, 'role'));
  const normalizedClassificationDate = classificationDate?.trim() ?? '';
  const classificationDateIsValid = isIsoCalendarDate(normalizedClassificationDate);
  if (normalizedClassificationDate.length > 0 && !classificationDateIsValid) {
    issues.push(`${prefix}: reviewerRows require Evidence Classification Date to use YYYY-MM-DD`);
  }
  const rowsByRole = new Map(rows.map(row => [row.role, row]));
  const missing = REQUIRED_TRUSTLESS_BURN_REVIEWER_ROLES.filter(role => !rowsByRole.has(role));
  if (missing.length > 0) {
    issues.push(`${prefix}: reviewerRows must include required reviewer roles: ${missing.join(', ')}`);
  }
  for (const role of REQUIRED_TRUSTLESS_BURN_REVIEWER_ROLES) {
    const row = rowsByRole.get(role);
    if (!row) continue;
    if (row.decision !== 'approve') {
      issues.push(`${prefix}: reviewerRows: ${role}: decision must be approve`);
    }
    if (role === 'Protocol reviewer' && classificationReviewer && row.name !== classificationReviewer) {
      issues.push(`${prefix}: reviewerRows: ${role}: name must match Evidence Classification Reviewer`);
    }
    if (isBlankValue(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must use YYYY-MM-DD`);
    } else if (classificationDateIsValid && row.date < normalizedClassificationDate) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must not be before Evidence Classification Date`);
    }
    if (!isActionableTrustlessBurnReviewerNote(row.notes ?? '')) {
      issues.push(`${prefix}: reviewerRows: ${role} requires actionable trustless-burn outcome notes`);
    }
    issues.push(...validateTrustlessBurnReviewerNoteClaimBoundary(prefix, row));
  }
  return issues;
}

function validateTrustlessBurnReviewerNoteClaimBoundary(
  prefix: string,
  row: TrustlessBurnReviewerSignoffRow,
): string[] {
  const notes = row.notes ?? '';
  if (notes.trim().length === 0) return [];

  const claim = classifyPublicationClaimText(notes);
  const issues: string[] = [];
  if (claim.hasMainnetProductionClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain mainnet production claim wording`);
  }
  if (claim.hasProductionReadyClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain production-ready claim wording`);
  }
  if (trustlessBurnReviewerNoteApprovesTransitionalTrustedPath(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve transitional trusted burn path wording`);
  }
  if (trustlessBurnReviewerNoteApprovesTrustedOracleFallback(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve trusted-oracle fallback wording`);
  }
  return issues;
}

function trustlessBurnReviewerNoteApprovesTransitionalTrustedPath(value: string): boolean {
  return normalizeDecisionSummarySegmentsForReleaseGate(value).some(normalized =>
    trustlessBurnReviewerTextApprovesSubject(
      normalized,
      '(?:transitional trusted burn path handling)',
      '(?:yes|allowed|approved|enabled|accepted|supported|permitted|cleared|granted|authori[sz]ed|certified|endorsed|recommended|accredited|allows|approves|enables|accepts|supports|permits|clears|grants|authori[sz]es|certifies|endorses|recommends|accredits|clear|grant|certify|endorse|recommend|accredit|use as trustless|used as trustless|uses as trustless)',
    ) ||
    trustlessBurnReviewerTextApprovesSubject(
      normalized,
      '(?:transitional trusted burn path|trusted burn path)',
      '(?:allowed|approved|enabled|accepted|supported|permitted|cleared|granted|authori[sz]ed|certified|endorsed|recommended|accredited|allows|approves|enables|accepts|supports|permits|clears|grants|authori[sz]es|certifies|endorses|recommends|accredits|clear|grant|certify|endorse|recommend|accredit|use as trustless|used as trustless|uses as trustless)',
    ),
  );
}

function trustlessBurnReviewerNoteApprovesTrustedOracleFallback(value: string): boolean {
  return normalizeDecisionSummarySegmentsForReleaseGate(value).some(normalized =>
    trustlessBurnReviewerTextApprovesSubject(
      normalized,
      '(?:trusted oracle fallback presented as trustless|trusted oracle fallback|oracle fallback|trusted fallback)',
      '(?:allowed|approved|enabled|accepted|supported|permitted|cleared|granted|authori[sz]ed|certified|endorsed|recommended|accredited|allows|approves|enables|accepts|supports|permits|clears|grants|authori[sz]es|certifies|endorses|recommends|accredits|clear|grant|certify|endorse|recommend|accredit|use as trustless|used as trustless|uses as trustless)',
    ),
  );
}

function normalizeDecisionSummarySegmentsForReleaseGate(value: string): string[] {
  return value
    .split(/[\n\r|;]+|[.]\s+/)
    .map(normalizeDecisionSummaryForReleaseGate)
    .filter(segment => segment.length > 0);
}

function trustlessBurnReviewerTextApprovesSubject(
  normalized: string,
  subject: string,
  approval: string,
): boolean {
  const approvalConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,3}';
  const approvalSubjectConnector =
    '(?:\\s+(?!\\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)\\b)[a-z0-9]+){0,1}';

  return [
    new RegExp(`\\b${subject}\\b${approvalConnector}\\s+${approval}\\b`, 'gi'),
    new RegExp(`\\b${approval}\\b${approvalSubjectConnector}\\s+${subject}\\b`, 'gi'),
  ].some(pattern => hasUnnegatedTrustlessBurnReviewerApproval(normalized, pattern));
}

function hasUnnegatedTrustlessBurnReviewerApproval(normalized: string, pattern: RegExp): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 32), index);
    if (!/\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?\s+$/.test(prefix)) return true;
  }
  return false;
}

function validateTrustlessBurnConcreteInstanceRows(
  prefix: string,
  commitmentRows: CommitmentFormatRow[],
  burnProofRows: BurnProofBindingRow[],
): string[] {
  const issues: string[] = [];
  const concreteHexRows: Array<[string, string, string | null]> = [
    ['commitmentRows', 'sidechainId', trustlessBurnConcreteHexValue(commitmentRows, 'sidechainId', 'valueOrEncoding')],
    ['commitmentRows', 'bridgeEventRoot', trustlessBurnConcreteHexValue(commitmentRows, 'bridgeEventRoot', 'valueOrEncoding')],
    ['burnProofRows', 'burnId', trustlessBurnConcreteHexValue(burnProofRows, 'burnId', 'bindingRule')],
    [
      'burnProofRows',
      'recipientErgoTreeHash',
      trustlessBurnConcreteHexValue(burnProofRows, 'recipientErgoTreeHash', 'bindingRule'),
    ],
  ];

  for (const [rowGroup, field, value] of concreteHexRows) {
    if (!value) {
      issues.push(`${prefix}: ${rowGroup} ${field} must expose concrete 32-byte value`);
    }
  }

  if (!trustlessBurnConcretePositiveIntegerValue(burnProofRows, 'amountNanoErg')) {
    issues.push(`${prefix}: burnProofRows amountNanoErg must expose positive uint64 amountNanoErg`);
  }

  return issues;
}

function validateTrustlessBurnPositiveProofInstanceBinding(
  prefix: string,
  positiveRows: PositiveProofRow[],
  commitmentRows: CommitmentFormatRow[],
  burnProofRows: BurnProofBindingRow[],
): string[] {
  const row = positiveRows.find(candidate => candidate.check === 'Valid burn proof acceptance');
  if (!row || row.status !== 'linked') return [];

  const issues: string[] = [];
  const bridgeEventRoot = trustlessBurnConcreteHexValue(commitmentRows, 'bridgeEventRoot', 'valueOrEncoding');
  const burnId = trustlessBurnConcreteHexValue(burnProofRows, 'burnId', 'bindingRule');
  const recipient = trustlessBurnConcreteHexValue(burnProofRows, 'recipientErgoTreeHash', 'bindingRule');
  const amount = trustlessBurnConcretePositiveIntegerValue(burnProofRows, 'amountNanoErg');

  if (bridgeEventRoot && !trustlessBurnEvidenceContainsHex32(row.evidence, bridgeEventRoot)) {
    issues.push(`${prefix}: positiveRows Valid burn proof acceptance evidence must match commitmentRows bridgeEventRoot`);
  }
  if (burnId && !trustlessBurnEvidenceContainsHex32(row.evidence, burnId)) {
    issues.push(`${prefix}: positiveRows Valid burn proof acceptance evidence must match burnProofRows burnId`);
  }
  if (recipient && !trustlessBurnEvidenceContainsHex32(row.evidence, recipient)) {
    issues.push(
      `${prefix}: positiveRows Valid burn proof acceptance evidence must match burnProofRows recipientErgoTreeHash`,
    );
  }
  if (amount && !new RegExp(`\\b${escapeRegExp(amount)}\\b`).test(row.evidence)) {
    issues.push(`${prefix}: positiveRows Valid burn proof acceptance evidence must match burnProofRows amountNanoErg`);
  }

  return issues;
}

function trustlessBurnConcreteHexValue(
  rows: Array<CommitmentFormatRow | BurnProofBindingRow>,
  field: string,
  valueKey: 'valueOrEncoding' | 'bindingRule',
): string | null {
  const row = rows.find(candidate => candidate.field === field);
  if (!row) return null;
  const value = valueKey === 'valueOrEncoding'
    ? (row as CommitmentFormatRow).valueOrEncoding
    : (row as BurnProofBindingRow).bindingRule;
  const values = extractTrustlessBurnHex32Values(value);
  return values.length === 1 ? values[0].toLowerCase() : null;
}

function trustlessBurnConcretePositiveIntegerValue(
  rows: BurnProofBindingRow[],
  field: string,
): string | null {
  const row = rows.find(candidate => candidate.field === field);
  if (!row) return null;
  const values = row.bindingRule.match(/\b\d+\b/g) ?? [];
  if (values.length !== 1) return null;
  const [value] = values;
  return isTrustlessBurnPositiveUint64Text(value) ? value : null;
}

function trustlessBurnConcreteNonNegativeIntegerValue(
  rows: BurnProofBindingRow[],
  field: string,
): string | null {
  const row = rows.find(candidate => candidate.field === field);
  if (!row) return null;
  const values = row.bindingRule.match(/\b\d+\b/g) ?? [];
  if (values.length !== 1) return null;
  const [value] = values;
  return /^(?:0|[1-9]\d*)$/.test(value) ? value : null;
}

function trustlessBurnEvidenceContainsHex32(evidence: string, expected: string): boolean {
  return extractTrustlessBurnHex32Values(evidence)
    .some(value => value.toLowerCase() === expected.toLowerCase());
}

function extractTrustlessBurnHex32Values(value: string): string[] {
  return [...value.matchAll(/(?:^|[^0-9a-fA-F])(?:0x)?([0-9a-fA-F]{64})(?![0-9a-fA-F])/g)]
    .map(match => match[1]);
}

function validateBackupRestoreStateConsistency(
  prefix: string,
  rows: StateConsistencyRow[],
): string[] {
  return rows
    .filter(row => row.status === 'linked' && row.preBackupValue !== row.restoredValue)
    .map(row => `${prefix}: stateRows: ${row.check}: restored value must match pre-backup value`);
}

function validateBackupRestorePublicationEvidence(
  prefix: string,
  publicationEvidence: BackupRestorePublicationEvidenceFields,
): string[] {
  const issues: string[] = [];
  if (publicationEvidence.releaseNotesUpdated !== 'yes') {
    issues.push(`${prefix}: publicationEvidence Release notes updated must be yes`);
  }
  if (publicationEvidence.pendingEvidenceRegisterUpdated !== 'yes') {
    issues.push(`${prefix}: publicationEvidence Pending Evidence Register updated must be yes`);
  }
  if (publicationEvidence.productionReadyClaimAllowed !== 'no') {
    issues.push(`${prefix}: publicationEvidence Production-ready claim allowed by this drill must be no`);
  }
  if (publicationEvidence.testnetProductionCandidateClaimAllowed !== 'no') {
    issues.push(`${prefix}: publicationEvidence Testnet production-candidate claim allowed by this drill must be no`);
  }
  if (!hasCompletedBackupRestoreReleaseNoteUpdateEvidence(
    publicationEvidence.requiredReleaseNoteUpdates ?? '',
  )) {
    issues.push(
      `${prefix}: publicationEvidence Required release-note updates requires completed Gate 3 backup-restore release-note update evidence target`,
    );
  }
  if (!hasCompletedBackupRestoreChecklistUpdateEvidence(
    publicationEvidence.requiredChecklistUpdates ?? '',
  )) {
    issues.push(
      `${prefix}: publicationEvidence Required checklist updates requires completed Gate 3 backup-restore checklist update evidence target`,
    );
  }
  issues.push(
    ...validateBackupRestorePublicationUpdateBoundary(
      `${prefix}: publicationEvidence Required release-note updates`,
      publicationEvidence.requiredReleaseNoteUpdates ?? '',
    ),
  );
  issues.push(
    ...validateBackupRestorePublicationUpdateBoundary(
      `${prefix}: publicationEvidence Required checklist updates`,
      publicationEvidence.requiredChecklistUpdates ?? '',
    ),
  );
  return issues;
}

function validateBackupRestorePublicationUpdateBoundary(label: string, text: string): string[] {
  const claimBoundaryText = stripBackupRestoreExactClaimDenials(text);
  const issues = [
    ...validateReleaseGatePublicationClaimBoundary(label, claimBoundaryText),
  ];

  if (!hasExactBackupRestoreProductionReadyClaimDenialByDrill(text)) {
    issues.push(`${label} must use exact Production-ready claim allowed by this drill: no`);
  }
  if (!hasExactBackupRestoreTestnetProductionCandidateClaimDenialByDrill(text)) {
    issues.push(`${label} must use exact Testnet production-candidate claim allowed by this drill: no`);
  }
  if (backupRestorePublicationUpdateAllowsTestnetProductionCandidateClaims(claimBoundaryText)) {
    issues.push(`${label} must not allow testnet production-candidate claims`);
  }
  if (backupRestorePublicationUpdateAllowsProductionReadyClaims(claimBoundaryText)) {
    issues.push(`${label} must not allow production-ready claims`);
  }
  if (hasContradictoryValidationFailureMarker(text)) {
    issues.push(`${label} must not mix completed/PASS evidence with failure markers`);
  }
  if (hasContradictoryReleaseNotesDecisionBinding(text)) {
    issues.push(`${label} must not include contradictory release-note decision bindings`);
  }

  return [...new Set(issues)];
}

function stripBackupRestoreExactClaimDenials(value: string): string {
  return value
    .replace(/\bproduction-ready claim allowed by this drill:\s*no\s*(?=$|[.;,|)\]\r\n])/ig, '')
    .replace(/\btestnet production-candidate claim allowed by this drill:\s*no\s*(?=$|[.;,|)\]\r\n])/ig, '');
}

function hasExactBackupRestoreProductionReadyClaimDenialByDrill(value: string): boolean {
  return /\bproduction-ready claim allowed by this drill:\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactBackupRestoreTestnetProductionCandidateClaimDenialByDrill(value: string): boolean {
  return /\btestnet production-candidate claim allowed by this drill:\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function backupRestorePublicationUpdateAllowsTestnetProductionCandidateClaims(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /testnet production-candidate claim allowed by this drill\s*[:=]\s*(?:yes|true|1)\b/i.test(value) ||
    /\btestnet production candidate claims?\s+(?:approved|allowed|supported|permitted)\b/i.test(normalized) ||
    /\btestnet production candidate claim support\s+(?:approved|allowed|supported|permitted|yes|true|1)\b/i.test(normalized)
  );
}

function backupRestorePublicationUpdateAllowsProductionReadyClaims(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /production-ready claim allowed by this drill\s*[:=]\s*(?:yes|true|1)\b/i.test(value) ||
    /\bproduction ready claims?\s+(?:approved|allowed|supported|permitted)\b/i.test(normalized) ||
    /\bproduction ready claim support\s+(?:approved|allowed|supported|permitted|yes|true|1)\b/i.test(normalized)
  );
}

function validateBackupRestoreSnapshotProvenance(
  prefix: string,
  snapshotProvenance: BackupRestoreSnapshotProvenance,
): string[] {
  const issues: string[] = [];
  const pre = normalizeEvidenceTargetValue(snapshotProvenance.preBackupSnapshotTarget);
  const restored = normalizeEvidenceTargetValue(snapshotProvenance.restoredSnapshotTarget);
  if (
    !isConcreteJsonEvidenceTarget(snapshotProvenance.preBackupSnapshotTarget) ||
    !isConcreteJsonEvidenceTarget(snapshotProvenance.restoredSnapshotTarget) ||
    pre === restored
  ) {
    issues.push(`${prefix}: snapshotProvenance must expose distinct concrete pre-backup and restored snapshot JSON targets`);
  }
  if (!isConcreteJsonEvidenceTarget(snapshotProvenance.comparisonOutputTarget)) {
    issues.push(`${prefix}: snapshotProvenance must expose concrete backup:compare output JSON target`);
  }
  if (snapshotProvenance.restoredGeneratedAfterPreBackup !== true) {
    issues.push(`${prefix}: snapshotProvenance must prove restored generatedAt after pre-backup generatedAt`);
  }
  if (snapshotProvenance.schemaVersionObserved !== true) {
    issues.push(`${prefix}: snapshotProvenance must expose schemaVersion validation`);
  }
  if (snapshotProvenance.snapshotSchemaVersionsObserved !== true) {
    issues.push(`${prefix}: snapshotProvenance must expose snapshotSchemaVersions validation`);
  }
  return issues;
}

function validateTechnicalAddendumStructuredFields(
  validation: TechnicalAddendumEvidenceValidationInput,
  prefix: string,
  cleanCheckoutGitCommit?: string,
): string[] {
  const classification = validation.classification ?? {};
  const publicationDecision = validation.publicationDecision ?? {};
  if (
    !classification.releaseLevel ||
    !classification.environment ||
    !classification.claimWording ||
    !publicationDecision.releaseSupported ||
    !publicationDecision.releaseGateStatus ||
    !publicationDecision.productionReadyClaimAllowed ||
    !publicationDecision.mainnetDeploymentClaimAllowed ||
    !publicationDecision.testnetProductionCandidateClaimAllowed ||
    !publicationDecision.releaseNotesUpdated
  ) {
    return [
      `${prefix} must expose release level, environment, claim wording, and publication decision fields`,
    ];
  }
  const issues = validateTechnicalAddendumProductionCandidateFields(
    classification,
    publicationDecision,
    `${prefix}: checked claim boundary`,
    cleanCheckoutGitCommit,
  );
  issues.push(...validateTechnicalAddendumClaimBoundaryFields(
    validation,
    `${prefix}: checked claim boundary`,
  ));
  return issues;
}

function validateTechnicalAddendumClaimBoundaryFields(
  validation: TechnicalAddendumEvidenceValidationInput,
  prefix: string,
): string[] {
  const claimBoundary = validation.claimBoundary ?? {};
  if (
    !claimBoundary.productionReadyClaimsAllowed ||
    !claimBoundary.mainnetDeploymentClaimsAllowed ||
    !claimBoundary.testnetProductionCandidateWordingAllowed ||
    !claimBoundary.productionGradeTestnetWordingAllowed ||
    !claimBoundary.releaseGateRequiredBeforePublicClaim ||
    !claimBoundary.evidenceCompletenessRequired
  ) {
    return [
      `${prefix} requires validated technical addendum structured Claim Boundary fields`,
    ];
  }

  const issues: string[] = [];
  if (claimBoundary.productionReadyClaimsAllowed !== 'no') {
    issues.push(`${prefix} requires validated technical addendum Production-ready claims allowed = no`);
  }
  if (claimBoundary.mainnetDeploymentClaimsAllowed !== 'no') {
    issues.push(`${prefix} requires validated technical addendum Mainnet deployment claims allowed = no`);
  }
  if (claimBoundary.testnetProductionCandidateWordingAllowed !== 'yes-after-release-gate-pass') {
    issues.push(
      `${prefix} requires validated technical addendum Testnet production-candidate wording allowed = yes-after-release-gate-pass`,
    );
  }
  if (claimBoundary.productionGradeTestnetWordingAllowed !== 'yes-after-release-gate-pass') {
    issues.push(
      `${prefix} requires validated technical addendum Production-grade testnet wording allowed = yes-after-release-gate-pass`,
    );
  }
  if (claimBoundary.releaseGateRequiredBeforePublicClaim !== 'yes') {
    issues.push(`${prefix} requires validated technical addendum Release gate required before public claim = yes`);
  }
  if (claimBoundary.evidenceCompletenessRequired !== 'yes') {
    issues.push(`${prefix} requires validated technical addendum Evidence completeness required = yes`);
  }
  return issues;
}

function validateTechnicalAddendumStructuredSummary(
  validation: TechnicalAddendumEvidenceValidationInput,
  prefix: string,
): string[] {
  const gateRows = validation.gateRows;
  const decisionRows = validation.decisionRows;
  const reviewerRows = validation.reviewerRows;

  if (
    !Array.isArray(gateRows) ||
    !Array.isArray(decisionRows) ||
    !Array.isArray(reviewerRows)
  ) {
    return [
      `${prefix} must expose structured gate, decision, reviewer rows`,
    ];
  }

  const gateRowObjects = structuredRowObjects(gateRows);
  const decisionRowObjects = structuredRowObjects(decisionRows);
  const reviewerRowObjects = structuredRowObjects(reviewerRows);
  const technicalAddendumEvidenceTargets = new Map<string, string>();

  return [
    ...validateStructuredRowObjects(`${prefix}: gateRows`, gateRows),
    ...validateStructuredRowObjects(`${prefix}: decisionRows`, decisionRows),
    ...validateStructuredRowObjects(`${prefix}: reviewerRows`, reviewerRows),
    ...validateRequiredStatusRows(
      `${prefix}: gateRows`,
      gateRowObjects,
      'gate',
      REQUIRED_TECHNICAL_ADDENDUM_GATE_ROWS,
      new Set(['linked', 'pass']),
      'linked or pass',
    ),
    ...validateRequiredLinkedRows(
      `${prefix}: decisionRows`,
      decisionRowObjects,
      'decision',
      REQUIRED_TECHNICAL_ADDENDUM_DECISIONS,
    ),
    ...validateTechnicalAddendumGateEvidenceRows(prefix, gateRowObjects),
    ...validateTechnicalAddendumDecisionEvidenceRows(prefix, decisionRowObjects),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: gateRows`,
      gateRowObjects,
      'gate',
      'artifact',
      technicalAddendumEvidenceTargets,
      new Set(['linked', 'pass']),
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: decisionRows`,
      decisionRowObjects,
      'decision',
      'evidence',
      technicalAddendumEvidenceTargets,
    ),
    ...validateRequiredTechnicalAddendumReviewerRows(
      prefix,
      reviewerRowObjects,
      validation.classification?.architectureOwner,
      validation.classification?.reviewer,
      validation.classification?.date,
    ),
  ];
}

function validateTechnicalAddendumGateEvidenceRows(
  prefix: string,
  rows: ArchitectureGateRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked' || candidate.status === 'pass')) {
    if (hasContradictoryStructuredValidationFailureMarker(
      `${row.requiredEvidence ?? ''} ${row.artifact ?? ''} ${row.claimBoundary ?? ''}`,
    )) {
      issues.push(`${prefix}: gateRows: ${row.gate} must not include contradictory validation failure markers`);
    }
    if (
      !hasTechnicalAddendumGateRequiredEvidence(row.gate, row.requiredEvidence) ||
      !hasCompletedTechnicalAddendumGateArtifact(row.gate, row.artifact) ||
      !hasTechnicalAddendumGateClaimBoundary(row.gate, row.claimBoundary)
    ) {
      issues.push(
        `${prefix}: gateRows: ${row.gate} requires gate-specific required evidence, completed artifact evidence, and claim boundary`,
      );
    }
  }
  return issues;
}

function validateTechnicalAddendumDecisionEvidenceRows(
  prefix: string,
  rows: ArchitectureDecisionRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (hasContradictoryStructuredValidationFailureMarker(
      `${row.requiredPosition ?? ''} ${row.evidence ?? ''}`,
    )) {
      issues.push(`${prefix}: decisionRows: ${row.decision} must not include contradictory validation failure markers`);
    }
    if (
      !hasTechnicalAddendumDecisionRequiredPosition(row.decision, row.requiredPosition) ||
      !hasCompletedTechnicalAddendumDecisionEvidence(row.decision, row.evidence)
    ) {
      issues.push(
        `${prefix}: decisionRows: ${row.decision} requires decision-specific position and completed evidence`,
      );
    }
    if (
      row.decision === TECHNICAL_ADDENDUM_RELEASE_GATE_DECISION &&
      !hasCompletedTechnicalAddendumReleaseGatePassEvidence(row.evidence)
    ) {
      issues.push(
        `${prefix}: decisionRows: ${row.decision} requires concrete release:gate PASS output with Structural issues = 0`,
      );
    }
  }
  return issues;
}

function validateRequiredStatusRows<T extends { status: string }>(
  prefix: string,
  rows: T[],
  nameKey: keyof T,
  requiredNames: readonly string[],
  allowedStatuses: ReadonlySet<string>,
  statusDescription: string,
): string[] {
  const issues: string[] = [];
  issues.push(...validateDuplicateStructuredRows(prefix, rows, nameKey));
  const rowsByName = new Map<string, T>(
    rows.map(row => {
      const name = row[nameKey];
      return [typeof name === 'string' ? name : '', row] as const;
    }),
  );
  const missing = requiredNames.filter(name => !rowsByName.has(name));
  if (missing.length > 0) {
    issues.push(`${prefix} must include required rows: ${missing.join(', ')}`);
  }
  for (const name of requiredNames) {
    const row = rowsByName.get(name);
    if (!row) continue;
    if (!allowedStatuses.has(row.status)) {
      issues.push(`${prefix}: ${name}: status must be ${statusDescription}`);
    }
  }
  return issues;
}

function validateRequiredTechnicalAddendumReviewerRows(
  prefix: string,
  rows: TechnicalAddendumReviewerSignoffRow[],
  architectureOwner?: string,
  reviewer?: string,
  classificationDate?: string,
): string[] {
  const issues: string[] = [];
  issues.push(...validateDuplicateStructuredRows(`${prefix}: reviewerRows`, rows, 'role'));
  const normalizedClassificationDate = classificationDate?.trim() ?? '';
  const classificationDateIsValid = isIsoCalendarDate(normalizedClassificationDate);
  if (normalizedClassificationDate.length > 0 && !classificationDateIsValid) {
    issues.push(`${prefix}: reviewerRows require Manual Classification Date to use YYYY-MM-DD`);
  }
  const rowsByRole = new Map(rows.map(row => [row.role, row]));
  const missing = REQUIRED_TECHNICAL_ADDENDUM_REVIEWER_ROLES.filter(role => !rowsByRole.has(role));
  if (missing.length > 0) {
    issues.push(`${prefix}: reviewerRows must include required reviewer roles: ${missing.join(', ')}`);
  }
  for (const role of REQUIRED_TECHNICAL_ADDENDUM_REVIEWER_ROLES) {
    const row = rowsByRole.get(role);
    if (!row) continue;
    if (row.decision !== 'approve') {
      issues.push(`${prefix}: reviewerRows: ${role}: decision must be approve`);
    }
    if (role === 'Architecture owner' && architectureOwner && row.name !== architectureOwner) {
      issues.push(`${prefix}: reviewerRows: ${role}: name must match Manual Classification Architecture owner`);
    }
    if (role === 'Security reviewer' && reviewer && row.name !== reviewer) {
      issues.push(`${prefix}: reviewerRows: ${role}: name must match Manual Classification Reviewer`);
    }
    if (isBlankValue(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must use YYYY-MM-DD`);
    } else if (classificationDateIsValid && row.date < normalizedClassificationDate) {
      issues.push(`${prefix}: reviewerRows: ${role}: date must not be before Manual Classification Date`);
    }
    if (!isActionableTechnicalAddendumReviewerNote(row.notes ?? '')) {
      issues.push(`${prefix}: reviewerRows: ${role} requires actionable technical-addendum outcome notes`);
    }
    issues.push(...validateTechnicalAddendumReviewerNoteClaimBoundary(prefix, row));
  }
  return issues;
}

function validateTechnicalAddendumReviewerNoteClaimBoundary(
  prefix: string,
  row: TechnicalAddendumReviewerSignoffRow,
): string[] {
  const notes = row.notes ?? '';
  if (notes.trim().length === 0) return [];

  const claim = classifyPublicationClaimText(notes);
  const issues: string[] = [];
  if (claim.hasMainnetProductionClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain mainnet production claim wording`);
  }
  if (claim.hasProductionReadyClaim) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not contain production-ready claim wording`);
  }
  if (technicalAddendumReviewerNoteApprovesNodeWalletProductionPath(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve node-wallet production path`);
  }
  if (technicalAddendumReviewerNoteApprovesUnscopedBroadcastEnablement(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not approve unscoped broadcast enablement`);
  }
  if (technicalAddendumReviewerNoteAllowsTestnetClaimsBeforeReleaseGatePass(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must require release gate pass before testnet production-candidate claims`);
  }
  if (hasContradictoryStructuredValidationFailureMarker(notes)) {
    issues.push(`${prefix}: reviewerRows: ${row.role} notes must not include contradictory validation failure markers`);
  }
  return issues;
}

function hasContradictoryStructuredValidationFailureMarker(segment: string): boolean {
  const normalized = normalizeEvidenceMarkerText(segment);

  return (
    hasUnresolvedIssueMarker(normalized) ||
    /(?:^|[^A-Za-z0-9_-])FAIL(?:$|[^A-Za-z0-9_-])/i.test(normalized) ||
    /\b(?:status|result|validation|validator|command|outcome)\s*[:=]?\s*FAILED\b/i.test(normalized) ||
    /\bFAILED\b\s+(?:validation|validator|command|run|result|status)\b/i.test(normalized) ||
    /\b(?:validation|validator|command|run|outcome|output)\s+(?:BLOCKED|ERROR)\b/i.test(normalized) ||
    /\b(?:BLOCKED|ERROR)\b\s+(?:validation|validator|command|run|result|status|outcome|output)\b/i.test(normalized) ||
    hasAmbiguousStructuredValidationExitCode(normalized) ||
    hasAmbiguousStructuredValidationResultCount(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\b[1-9]\d*\s+structural\s+issues?\b/i.test(normalized)
  );
}

function hasAmbiguousStructuredValidationExitCode(segment: string): boolean {
  return /\bexit[- ]?code\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(segment);
}

function hasAmbiguousStructuredValidationResultCount(segment: string): boolean {
  return /\b(?:errors?|structural\s+issues?)\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(segment);
}

function technicalAddendumReviewerNoteApprovesNodeWalletProductionPath(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  const approval = technicalAddendumReviewerApprovalTermsForReleaseGate();
  const approvalConnector = technicalAddendumReviewerApprovalConnectorForReleaseGate(3);
  const nodeWalletProductionPathSubject =
    '(?:node wallet(?: signing)?(?:\\s+[a-z0-9]+){0,8}\\s+production (?:signer )?path|' +
    'production (?:signer )?path(?:\\s+[a-z0-9]+){0,8}\\s+node wallet)';
  return [
    new RegExp(`\\b${nodeWalletProductionPathSubject}\\b${approvalConnector}\\s+${approval}\\b`, 'gi'),
    new RegExp(`\\b${approval}\\b${approvalConnector}\\s+${nodeWalletProductionPathSubject}\\b`, 'gi'),
  ].some(pattern => hasUnnegatedTechnicalAddendumReviewerApproval(normalized, pattern));
}

function technicalAddendumReviewerNoteApprovesUnscopedBroadcastEnablement(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  const approval = technicalAddendumReviewerApprovalTermsForReleaseGate();
  const approvalConnector = technicalAddendumReviewerApprovalConnectorForReleaseGate(3);
  const subjectConnector = technicalAddendumReviewerApprovalConnectorForReleaseGate(8);
  const broadcastSubject = '(?:bridge broadcast enabled true|broadcast)';
  const scopedBroadcastSubject =
    `(?:${broadcastSubject}${subjectConnector}\\s+(?:unscoped|non scoped|without scope|without scoped approval|global|default)|` +
    `(?:unscoped|non scoped|without scope|without scoped approval|global|default)${subjectConnector}\\s+${broadcastSubject})`;
  return (
    [
      new RegExp(`\\b${scopedBroadcastSubject}\\b${approvalConnector}\\s+${approval}\\b`, 'gi'),
      new RegExp(`\\b${approval}\\b${approvalConnector}\\s+${scopedBroadcastSubject}\\b`, 'gi'),
    ].some(pattern => hasUnnegatedTechnicalAddendumReviewerApproval(normalized, pattern))
  );
}

function technicalAddendumReviewerNoteAllowsTestnetClaimsBeforeReleaseGatePass(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  const approval = technicalAddendumReviewerApprovalTermsForReleaseGate();
  return (
    new RegExp(`\\btestnet production candidate claims?\\b.{0,80}\\b${approval}\\b.{0,80}\\b(?:before|without|no)\\b.{0,24}\\brelease gate pass\\b`, 'i').test(normalized) ||
    new RegExp(`\\b${approval}\\b.{0,80}\\btestnet production candidate claims?\\b.{0,80}\\b(?:before|without|no)\\b.{0,24}\\brelease gate pass\\b`, 'i').test(normalized) ||
    new RegExp(`\\b(?:before|without|no)\\b.{0,24}\\brelease gate pass\\b.{0,80}\\btestnet production candidate claims?\\b.{0,80}\\b${approval}\\b`, 'i').test(normalized)
  );
}

function technicalAddendumReviewerApprovalTermsForReleaseGate(): string {
  return '(?:accepted|accepts|accept|approved|approves|approve|allowed|allows|allow|enabled|enables|enable|supported|supports|support|permitted|permits|permit|cleared|clears|clear|granted|grants|grant|authori[sz]ed|authori[sz]es|authori[sz]e|certified|certifies|certify|endorsed|endorses|endorse|recommended|recommends|recommend|accredited|accredits|accredit)';
}

function technicalAddendumReviewerApprovalConnectorForReleaseGate(maxWords: number): string {
  return `(?:\\s+(?!\\b(?:${technicalAddendumReviewerNegatingApprovalTermsForReleaseGate()})\\b)[a-z0-9]+){0,${maxWords}}`;
}

function hasUnnegatedTechnicalAddendumReviewerApproval(normalized: string, pattern: RegExp): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 32), index);
    if (!new RegExp(`\\b(?:${technicalAddendumReviewerNegatingApprovalTermsForReleaseGate()})(?:\\s+of)?\\s+$`).test(prefix)) {
      return true;
    }
  }
  return false;
}

function technicalAddendumReviewerNegatingApprovalTermsForReleaseGate(): string {
  return 'not|no|never|without|absence|absent|lack|lacks|lacking';
}

export function validateReleaseNotesStructuredSummary(
  validation: ReleaseNotesValidationInput,
  prefix: string,
): string[] {
  const evidenceRows = validation.evidenceRows;
  const assumptionRows = validation.assumptionRows;
  const blockerRows = validation.blockerRows;
  const claimRows = validation.claimRows;
  const operatorRows = validation.operatorRows;
  const signoffRows = validation.signoffRows;

  if (
    !Array.isArray(evidenceRows) ||
    !Array.isArray(assumptionRows) ||
    !Array.isArray(blockerRows) ||
    !Array.isArray(claimRows) ||
    !Array.isArray(operatorRows) ||
    !Array.isArray(signoffRows)
  ) {
    return [
      `${prefix} must expose structured evidence, assumption, blocker, claim, operator, sign-off rows`,
    ];
  }

  const evidenceRowObjects = structuredRowObjects(evidenceRows);
  const assumptionRowObjects = structuredRowObjects(assumptionRows);
  const blockerRowObjects = structuredRowObjects(blockerRows);
  const claimRowObjects = structuredRowObjects(claimRows);
  const operatorRowObjects = structuredRowObjects(operatorRows);
  const signoffRowObjects = structuredRowObjects(signoffRows);
  const releaseNotesEvidenceTargets = new Map<string, string>();

  const issues = [
    ...validateStructuredRowObjects(`${prefix}: evidenceRows`, evidenceRows),
    ...validateStructuredRowObjects(`${prefix}: assumptionRows`, assumptionRows),
    ...validateStructuredRowObjects(`${prefix}: blockerRows`, blockerRows),
    ...validateStructuredRowObjects(`${prefix}: claimRows`, claimRows),
    ...validateStructuredRowObjects(`${prefix}: operatorRows`, operatorRows),
    ...validateStructuredRowObjects(`${prefix}: signoffRows`, signoffRows),
    ...validateRequiredLinkedRows(
      `${prefix}: evidenceRows`,
      evidenceRowObjects,
      'evidenceClass',
      REQUIRED_RELEASE_NOTES_EVIDENCE_CLASSES,
    ),
    ...validateReleaseNotesEvidenceRowPayloads(prefix, evidenceRowObjects),
    ...validateRequiredNamedRows(
      `${prefix}: assumptionRows`,
      assumptionRowObjects,
      'assumption',
      REQUIRED_RELEASE_NOTES_TRUST_ASSUMPTIONS,
    ),
    ...validateReleaseNotesAssumptionRowPayloads(prefix, assumptionRowObjects),
    ...validateRequiredStatusRows(
      `${prefix}: blockerRows`,
      blockerRowObjects,
      'blocker',
      REQUIRED_PENDING_EVIDENCE_ROWS.map(row => row.item),
      new Set(['Checked']),
      'Checked',
    ),
    ...validateReleaseNotesBlockerRowPayloads(prefix, blockerRowObjects),
    ...validateRequiredNamedRows(
      `${prefix}: claimRows`,
      claimRowObjects,
      'claim',
      REQUIRED_RELEASE_NOTES_CLAIM_BOUNDARIES,
    ),
    ...validateReleaseNotesClaimRowPayloads(prefix, claimRowObjects),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: evidenceRows`,
      evidenceRowObjects,
      'evidenceClass',
      'linkOrArtifact',
      releaseNotesEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: assumptionRows`,
      releaseNotesAssumptionEvidenceTargetRows(assumptionRowObjects),
      'name',
      'evidence',
      releaseNotesEvidenceTargets,
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: blockerRows`,
      releaseNotesBlockerEvidenceTargetRows(blockerRowObjects),
      'name',
      'evidence',
      releaseNotesEvidenceTargets,
      new Set(['Checked']),
    ),
    ...validateDistinctStructuredEvidenceTargets(
      `${prefix}: claimRows`,
      releaseNotesClaimEvidenceTargetRows(claimRowObjects),
      'name',
      'evidence',
      releaseNotesEvidenceTargets,
    ),
    ...validateRequiredNamedRows(
      `${prefix}: operatorRows`,
      operatorRowObjects,
      'area',
      REQUIRED_RELEASE_NOTES_OPERATOR_AREAS,
    ),
    ...validateReleaseNotesOperatorRowPayloads(prefix, operatorRowObjects),
    ...validateReleaseNotesOperatorRowClaimBoundaries(
      prefix,
      operatorRowObjects,
      validation.classification?.releaseLevel,
    ),
    ...validateRequiredReleaseNotesSignoffRows(
      prefix,
      signoffRowObjects,
      validation.classification?.decisionOwner,
      validation.classification?.decisionDate,
      validation.classification?.releaseLevel,
    ),
  ];

  if (claimRowObjects.length === 0) {
    issues.push(`${prefix}: claimRows must include controlled claim-boundary rows`);
  }
  for (const row of assumptionRowObjects) {
    if (isBlankValue(row.evidence)) {
      issues.push(`${prefix}: assumptionRows: ${row.assumption}: evidence is required`);
    }
  }
  for (const row of blockerRowObjects) {
    if (row.scopedOut !== 'no') {
      issues.push(`${prefix}: blockerRows: ${row.blocker}: scopedOut must be no for production deployment candidate evidence`);
    }
  }
  for (const row of claimRowObjects) {
    if (isBlankValue(row.evidenceLink) || isBlankValue(row.allowedWording)) {
      issues.push(`${prefix}: claimRows: ${row.claim}: evidenceLink and allowedWording are required`);
    }
  }
  for (const row of operatorRowObjects) {
    if (isBlankValue(row.requiredOperatorAction) || isBlankValue(row.stopCondition)) {
      issues.push(`${prefix}: operatorRows: ${row.area}: action and stop condition are required`);
    }
  }
  return issues;
}

function validateThreatModelStructuredSummary(
  validation: ThreatModelEvidenceValidationInput,
  prefix: string,
): string[] {
  const rows = validation.matrixRows;
  if (!Array.isArray(rows)) {
    return [`${prefix} must expose structured security evidence matrix rows`];
  }

  const rowObjects = structuredRowObjects(rows);
  const allowedStatuses = new Set<string>(THREAT_MODEL_ALLOWED_STATUSES);
  const byArea = new Map<string, ThreatModelMatrixRow>();
  const issues = [
    ...validateStructuredRowObjects(`${prefix}: matrixRows`, rows),
    ...validateRequiredNamedRows(
      `${prefix}: matrixRows`,
      rowObjects,
      'area',
      REQUIRED_THREAT_MODEL_MATRIX_AREAS,
    ),
    ...validateDuplicateStructuredRows(`${prefix}: matrixRows`, rowObjects, 'area'),
  ];

  for (const row of rowObjects) {
    byArea.set(row.area, row);
    if (!allowedStatuses.has(row.status)) {
      issues.push(`${prefix}: matrixRows: ${row.area}: status must be a recognized matrix status`);
    }
    if (isBlankValue(row.currentClaim)) {
      issues.push(`${prefix}: matrixRows: ${row.area}: currentClaim is required`);
    }
    if (!hasConcreteThreatModelMatrixEvidence(row.evidence)) {
      issues.push(`${prefix}: matrixRows: ${row.area}: evidence must cite concrete repository evidence`);
    }
    if (isBlankValue(row.missingBeforePublication)) {
      issues.push(`${prefix}: matrixRows: ${row.area}: missingBeforePublication is required`);
    }
    for (const { field, value } of [
      { field: 'currentClaim', value: row.currentClaim },
      { field: 'evidence', value: row.evidence },
      { field: 'missingBeforePublication', value: row.missingBeforePublication },
    ] as const) {
      if (!isBlankValue(value) && hasContradictoryStructuredValidationFailureMarker(value)) {
        issues.push(`${prefix}: matrixRows: ${row.area}: ${field} must not include contradictory validation failure markers`);
      }
    }
  }

  for (const [area, expectations] of Object.entries(REQUIRED_THREAT_MODEL_AREA_TERMS)) {
    const row = byArea.get(area);
    if (!row) continue;
    for (const expectation of expectations) {
      for (const term of expectation.terms) {
        if (!containsTerm(row[expectation.field], term)) {
          issues.push(`${prefix}: matrixRows: ${area}: ${expectation.field} must include ${term}`);
        }
      }
    }
  }

  const phantomBurn = byArea.get('Phantom burn trust minimization');
  if (phantomBurn) {
    if (phantomBurn.status !== 'Open blocker') {
      issues.push(`${prefix}: matrixRows: Phantom burn trust minimization status must remain Open blocker`);
    }
    if (
      !containsTerm(phantomBurn.currentClaim, 'transitional') ||
      !containsTerm(phantomBurn.currentClaim, 'not L1-trustless')
    ) {
      issues.push(`${prefix}: matrixRows: Phantom burn trust minimization must preserve the transitional non-L1-trustless boundary`);
    }
    if (
      !containsTerm(phantomBurn.missingBeforePublication, 'npm run trustless:validate') ||
      !containsTerm(phantomBurn.missingBeforePublication, '--trustless-burn-evidence')
    ) {
      issues.push(`${prefix}: matrixRows: Phantom burn trust minimization must bind trustless validator and release-gate evidence consumption`);
    }
  }

  const signerSurface = byArea.get('Signer surface isolation');
  if (
    signerSurface &&
    (
      !containsTerm(signerSurface.currentClaim, 'node-wallet') ||
      !containsTerm(signerSurface.currentClaim, 'Fleet Prover') ||
      !containsTerm(signerSurface.currentClaim, 'local WASM')
    )
  ) {
    issues.push(`${prefix}: matrixRows: Signer surface isolation must preserve node-wallet, Fleet Prover, and local WASM boundaries`);
  }

  const broadcast = byArea.get('Explicit broadcast opt-in');
  if (
    broadcast &&
    (
      !containsTerm(broadcast.currentClaim, 'approval-file') ||
      !containsTerm(broadcast.currentClaim, 'Expected transaction ID')
    )
  ) {
    issues.push(`${prefix}: matrixRows: Explicit broadcast opt-in must preserve approval-file and Expected transaction ID binding`);
  }

  return issues;
}

function releaseNotesAssumptionEvidenceTargetRows(
  rows: TrustAssumptionRow[],
): { name: string; evidence: string; status: string }[] {
  return rows.map(row => ({
    name: row.assumption,
    evidence: row.evidence,
    status: 'linked',
  }));
}

function releaseNotesBlockerEvidenceTargetRows(
  rows: PublicationBlockerRow[],
): { name: string; evidence: string; status: string }[] {
  return rows.map(row => ({
    name: row.blocker,
    evidence: row.requiredResolution,
    status: row.status,
  }));
}

function releaseNotesClaimEvidenceTargetRows(
  rows: AllowedClaimRow[],
): { name: string; evidence: string; status: string }[] {
  return rows.map(row => ({
    name: row.claim,
    evidence: row.evidenceLink,
    status: 'linked',
  }));
}

function validateReleaseNotesEvidenceRowPayloads(
  prefix: string,
  rows: RequiredEvidenceRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'linked')) {
    if (!isBlankValue(row.linkOrArtifact) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.linkOrArtifact)) {
      issues.push(`${prefix}: evidenceRows: ${row.evidenceClass}: evidence must not include contradictory release-note failure markers`);
    }
    if (!isBlankValue(row.publicationEffect) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.publicationEffect)) {
      issues.push(`${prefix}: evidenceRows: ${row.evidenceClass}: publication effect must not include contradictory release-note failure markers`);
    }
    if (
      !hasCompletedReleaseNotesRowEvidence(row.linkOrArtifact, row.evidenceClass) ||
      !hasConcreteReleaseNotesPublicationEffect(row.publicationEffect)
    ) {
      issues.push(
        `${prefix}: evidenceRows: ${row.evidenceClass} requires completed evidence-specific release-note artifact and publication effect`,
      );
    }
  }
  return issues;
}

function validateReleaseNotesAssumptionRowPayloads(
  prefix: string,
  rows: TrustAssumptionRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows) {
    if (!isBlankValue(row.evidence) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.evidence)) {
      issues.push(`${prefix}: assumptionRows: ${row.assumption}: evidence must not include contradictory release-note failure markers`);
    }
    if (!isBlankValue(row.releaseImpact) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.releaseImpact)) {
      issues.push(`${prefix}: assumptionRows: ${row.assumption}: release impact must not include contradictory release-note failure markers`);
    }
    if (
      !hasCompletedReleaseNotesRowEvidence(row.evidence, row.assumption) ||
      !hasConcreteReleaseNotesImpact(row.releaseImpact, row.assumption)
    ) {
      issues.push(
        `${prefix}: assumptionRows: ${row.assumption} requires assumption-specific evidence and release impact`,
      );
    }
  }
  return issues;
}

function validateReleaseNotesBlockerRowPayloads(
  prefix: string,
  rows: PublicationBlockerRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows.filter(candidate => candidate.status === 'Checked')) {
    if (!isBlankValue(row.requiredResolution) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.requiredResolution)) {
      issues.push(`${prefix}: blockerRows: ${row.blocker}: required resolution must not include contradictory release-note failure markers`);
    }
    if (!hasCompletedReleaseNotesRowEvidence(row.requiredResolution, row.blocker)) {
      issues.push(
        `${prefix}: blockerRows: ${row.blocker} requires completed blocker-specific resolution evidence`,
      );
    }
    const requiredBlocker = REQUIRED_PENDING_EVIDENCE_BY_ITEM.get(row.blocker);
    if (requiredBlocker) {
      const missingTerms = requiredBlocker.requiredResolutionTerms.filter(
        term => !containsTerm(row.requiredResolution, term),
      );
      if (missingTerms.length > 0) {
        issues.push(
          `${prefix}: blockerRows: ${row.blocker} requires row-specific publication blocker resolution terms`,
        );
      }
    } else if (!hasStructuredCustomPublicationBlockerResolution(row.requiredResolution)) {
      issues.push(
        `${prefix}: blockerRows: ${row.blocker} requires structured custom publication blocker resolution evidence`,
      );
    }
  }
  return issues;
}

function validateReleaseNotesClaimRowPayloads(
  prefix: string,
  rows: AllowedClaimRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows) {
    if (!isBlankValue(row.evidenceLink) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.evidenceLink)) {
      issues.push(`${prefix}: claimRows: ${row.claim}: evidence link must not include contradictory release-note failure markers`);
    }
    if (!isBlankValue(row.allowedWording) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.allowedWording)) {
      issues.push(`${prefix}: claimRows: ${row.claim}: allowed wording must not include contradictory release-note failure markers`);
    }
    if (hasNegatedAllowedClaimEvidenceLink(row.claim, row.evidenceLink)) {
      issues.push(
        `${prefix}: claimRows: ${row.claim} evidence link must not negate the allowed claim`,
      );
    }
    if (
      !hasCompletedReleaseNotesRowEvidence(row.evidenceLink, row.claim) ||
      !hasBoundedReleaseNotesAllowedWording(row.allowedWording)
    ) {
      issues.push(
        `${prefix}: claimRows: ${row.claim} requires claim-specific evidence link and bounded allowed wording`,
      );
    }
  }
  return issues;
}

function validateReleaseNotesOperatorRowPayloads(
  prefix: string,
  rows: OperatorImpactRow[],
): string[] {
  const issues: string[] = [];
  for (const row of rows) {
    if (!isBlankValue(row.requiredOperatorAction) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.requiredOperatorAction)) {
      issues.push(`${prefix}: operatorRows: ${row.area}: required operator action must not include contradictory release-note failure markers`);
    }
    if (!isBlankValue(row.stopCondition) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.stopCondition)) {
      issues.push(`${prefix}: operatorRows: ${row.area}: stop condition must not include contradictory release-note failure markers`);
    }
    const actionAndStopCondition = `${row.requiredOperatorAction} ${row.stopCondition}`;
    if (
      !hasActionableReleaseNotesOperatorAction(row.requiredOperatorAction) ||
      !hasActionableReleaseNotesStopCondition(row.stopCondition) ||
      !hasRowSpecificReleaseNotesPayload(actionAndStopCondition, row.area)
    ) {
      issues.push(
        `${prefix}: operatorRows: ${row.area} requires actionable operator action and stop condition`,
      );
    }
  }
  return issues;
}

function validateReleaseNotesOperatorRowClaimBoundaries(
  prefix: string,
  rows: OperatorImpactRow[],
  releaseLevel?: string,
): string[] {
  const issues: string[] = [];
  for (const row of rows) {
    const label = `${prefix}: operatorRows: ${row.area}`;
    const actionAndStopCondition = `${row.requiredOperatorAction} ${row.stopCondition}`;
    if (hasAbsoluteSecurityClaim(actionAndStopCondition)) {
      issues.push(`${label}: absolute security wording is not allowed in release notes`);
    }
    issues.push(...validateReleaseNotesStructuredRowPublicationClaimBoundary(
      label,
      actionAndStopCondition,
      releaseLevel,
    ));
  }
  return [...new Set(issues)];
}

function validateReleaseNotesStructuredRowPublicationClaimBoundary(
  label: string,
  text: string,
  releaseLevel?: string,
): string[] {
  const claim = classifyPublicationClaimText(text);
  const issues: string[] = [];
  const isProductionDeploymentCandidate = releaseLevel === 'production deployment candidate';

  if (claim.hasMainnetProductionClaim) {
    issues.push(`${label}: ${MAINNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (claim.hasProductionReadyClaim) {
    issues.push(`${label}: ${CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (claim.hasControlledTestnetProductionClaim && !isProductionDeploymentCandidate) {
    issues.push(`${label}: ${PRODUCTION_CLAIM_EVIDENCE_ERROR}`);
  }
  if (
    isProductionDeploymentCandidate &&
    claim.hasProductionClaim &&
    !claim.hasControlledTestnetProductionClaim &&
    !claim.hasMainnetProductionClaim &&
    !claim.hasProductionReadyClaim
  ) {
    issues.push(`${label}: ${CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (
    !isProductionDeploymentCandidate &&
    claim.hasProductionClaim &&
    !claim.hasMainnetProductionClaim &&
    !claim.hasProductionReadyClaim
  ) {
    issues.push(`${label}: ${PRODUCTION_CLAIM_EVIDENCE_ERROR}`);
  }

  return [...new Set(issues)];
}

function hasNoContradictoryReleaseNotesEvidenceMarker(value: string): boolean {
  return !hasContradictoryReleaseNotesEvidenceMarker(value);
}

function hasContradictoryReleaseNotesEvidenceMarker(value: string): boolean {
  const normalized = normalizeReleaseNotesDecisionBindingText(value);
  return (
    /\b(?:status|result|validation|validator|command|run|outcome|output)\s*[:=]?\s*(?:FAIL(?:ED)?|BLOCKED|ERROR)\b/i.test(normalized) ||
    /\b(?:FAIL(?:ED)?|BLOCKED|ERROR)\b\s+(?:validation|validator|command|run|result|status|outcome|output)\b/i.test(normalized) ||
    hasUnresolvedIssueMarker(normalized) ||
    /\bexit\s+code\s*[:=]?\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\berrors?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    hasStructuredValidationFailureMarker(normalized) ||
    hasConditionalValidationApprovalMarker(normalized) ||
    /\bstructural\s+issues?\s*[:=]\s*(?!0\b)\d+\b/i.test(normalized) ||
    /\b[1-9]\d*\s+structural\s+issues?\b/i.test(normalized)
  );
}

function hasCompletedReleaseNotesRowEvidence(value: string | undefined, rowName: string): boolean {
  return (
    !isGenericReleaseNotesRowPayload(value) &&
    hasNoContradictoryReleaseNotesEvidenceMarker(value ?? '') &&
    hasEvidenceMarker(value ?? '') &&
    hasCompletedReleaseNotesRowEvidenceMarker(value ?? '') &&
    /\bcompleted\b/i.test(value ?? '') &&
    hasRowSpecificReleaseNotesPayload(value ?? '', rowName)
  );
}

function hasCompletedReleaseNotesRowEvidenceMarker(value: string): boolean {
  return extractCompletedReleaseNotesRowEvidenceTargets(value).some(isCompletedEvidenceTarget);
}

function hasConcreteThreatModelMatrixEvidence(value: string): boolean {
  return [...value.matchAll(/`([^`]+)`/g)]
    .map(([, target]) => target.trim())
    .some(isConcreteThreatModelMatrixRepositoryEvidenceReference);
}

function isConcreteThreatModelMatrixRepositoryEvidenceReference(target: string): boolean {
  const normalized = target.replace(/\\/g, '/').replace(/^\.\//, '');
  return (
    /^(\.github|docs|phases|relayer|wasm-avl)\//.test(normalized) &&
    normalized.toLowerCase() !== 'docs/security-evidence-matrix.md' &&
    !isSharedSensitiveOrRuntimeEvidenceTarget(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized)
  );
}

function extractCompletedReleaseNotesRowEvidenceTargets(value: string): string[] {
  const bareTargets = [...value.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+)/g)]
    .filter(match => !hasReleaseNotesValidationTargetPrefix(value, match.index ?? 0))
    .map(([, target]) => target);
  const linkedTargets = [...value.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)]
    .filter(([, label]) => !isReleaseNotesValidationTargetBinding(label))
    .map(([, , target]) => target.trim());
  return [...bareTargets, ...linkedTargets];
}

function hasReleaseNotesValidationTargetPrefix(value: string, targetMatchIndex: number): boolean {
  return isReleaseNotesValidationTargetBinding(value.slice(Math.max(0, targetMatchIndex - 80), targetMatchIndex));
}

function isReleaseNotesValidationTargetBinding(value: string): boolean {
  return /\brelease[- ]notes?\s+(?:validate|validation)\s+target\b/i.test(value);
}

function hasConcreteReleaseNotesPublicationEffect(value: string | undefined): boolean {
  return (
    !isGenericReleaseNotesRowPayload(value) &&
    hasNoContradictoryReleaseNotesEvidenceMarker(value ?? '') &&
    /\b(release|publication|claim|block|blocks|candidate|gate|scope|operator|security|trust|ready)\b/i
      .test(value ?? '')
  );
}

function hasConcreteReleaseNotesImpact(value: string | undefined, rowName: string): boolean {
  return (
    !isGenericReleaseNotesRowPayload(value) &&
    hasNoContradictoryReleaseNotesEvidenceMarker(value ?? '') &&
    /\b(assumption|documented|limit|limits|release|publication|claim|scope|block|operator|security|trust)\b/i
      .test(value ?? '') &&
    hasRowSpecificReleaseNotesPayload(value ?? '', rowName)
  );
}

function hasBoundedReleaseNotesAllowedWording(value: string | undefined): boolean {
  return (
    !isGenericReleaseNotesRowPayload(value) &&
    hasNoContradictoryReleaseNotesEvidenceMarker(value ?? '') &&
    /\b(testnet production-candidate|production-grade testnet|only|unless|without|blocked|forbidden|disallowed|not allowed|no\b)\b/i
      .test(value ?? '')
  );
}

function hasActionableReleaseNotesOperatorAction(value: string | undefined): boolean {
  return (
    !isGenericReleaseNotesRowPayload(value) &&
    hasNoContradictoryReleaseNotesEvidenceMarker(value ?? '') &&
    /\b(runbook|command|verify|verification|check|monitor|backup|restore|incident|status|preflight|capture|enable|disable|action)\b/i
      .test(value ?? '')
  );
}

function hasActionableReleaseNotesStopCondition(value: string | undefined): boolean {
  return (
    !isGenericReleaseNotesRowPayload(value) &&
    hasNoContradictoryReleaseNotesEvidenceMarker(value ?? '') &&
    /\b(stop|block|fail|disable|pause|incident|mismatch|do not|do-not|refuse|missing|stale)\b/i
      .test(value ?? '')
  );
}

function hasActionableReleaseNotesSignoffNote(value: string | undefined, role: string): boolean {
  const roleFocus = role === 'Maintainer'
    ? /\b(maintainer|release decision|scope|publication|blocker)\b/i
    : role === 'Security reviewer'
      ? /\b(security|trust assumption|claim|evidence|blocker)\b/i
      : /\b(operator|runbook|operator impact|readiness|incident)\b/i;
  return (
    !isGenericReleaseNotesRowPayload(value) &&
    hasNoContradictoryReleaseNotesEvidenceMarker(value ?? '') &&
    /\b(approve|approved|block|blocked|validate|validated|confirm|confirmed|accept|accepted|checked|reviewed)\b/i
      .test(value ?? '') &&
    /\b(release notes?|claim|blocker|evidence|trust assumption|operator impact|scope|production|gate|publication)\b/i
      .test(value ?? '') &&
    roleFocus.test(value ?? '')
  );
}

function hasRowSpecificReleaseNotesPayload(value: string, rowName: string): boolean {
  const valueTokens = new Set(significantReleaseNotesRowTokens(value));
  const rowTokens = significantReleaseNotesRowTokens(rowName);
  return rowTokens.length === 0 || rowTokens.some(token => valueTokens.has(token));
}

function significantReleaseNotesRowTokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(normalizeReleaseNotesRowToken)
    .filter(token =>
      token.length >= 3 &&
      !GENERIC_RELEASE_NOTES_ROW_TOKENS.has(token) &&
      !/^[0-9]+$/.test(token)
    );
}

function normalizeReleaseNotesRowToken(token: string): string {
  if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function isGenericReleaseNotesRowPayload(value: string | undefined): boolean {
  return /^(pass|passed|approved|reviewed|linked|checked|yes|no|n\/a|documented)$/i
    .test((value ?? '').trim());
}

function validateRequiredNamedRows<T>(
  prefix: string,
  rows: T[],
  nameKey: keyof T,
  requiredNames: readonly string[],
): string[] {
  const issues: string[] = [];
  issues.push(...validateDuplicateStructuredRows(prefix, rows, nameKey));
  const rowsByName = new Map<string, T>(
    rows.map(row => {
      const name = row[nameKey];
      return [typeof name === 'string' ? name : '', row] as const;
    }),
  );
  const missing = requiredNames.filter(name => !rowsByName.has(name));
  if (missing.length > 0) {
    issues.push(`${prefix} must include required rows: ${missing.join(', ')}`);
  }
  return issues;
}

function isBlankValue(value: string | undefined): boolean {
  return typeof value !== 'string' || value.trim().length === 0;
}

function isDisabledOrDryRunBroadcastMode(value: string | undefined): boolean {
  return value === 'disabled' || value === 'dry-run';
}

function validateBackupRestoreDrillClassification(
  classification: BackupRestoreClassificationFields | undefined,
  prefix: string,
  cleanCheckoutGitCommit?: string,
): string[] {
  const issues: string[] = [];
  if (!classification || isBlankValue(classification.drillName)) {
    issues.push(`${prefix} requires validated backup-restore Drill Classification Drill name`);
  }
  if (!isBackupRestoreClassificationGitCommit(classification?.gitCommit)) {
    issues.push(`${prefix} requires validated backup-restore Drill Classification Git commit`);
  } else if (
    isCleanCheckoutRunClassificationGitCommit(cleanCheckoutGitCommit) &&
    normalizeGitCommit(classification?.gitCommit) !== normalizeGitCommit(cleanCheckoutGitCommit)
  ) {
    issues.push(
      `${prefix} requires backup-restore Git commit to match clean checkout Git commit ${cleanCheckoutGitCommit?.trim()}`,
    );
  }
  if (classification?.releaseLevel !== 'production deployment candidate') {
    issues.push(`${prefix} requires validated backup-restore Drill Classification Release level = production deployment candidate`);
  }
  if (classification?.environment !== 'testnet') {
    issues.push(`${prefix} requires validated backup-restore Drill Classification Environment = testnet`);
  }
  if (!isDisabledOrDryRunBroadcastMode(classification?.broadcastMode)) {
    issues.push(`${prefix} requires validated backup-restore Drill Classification Broadcast mode disabled or dry-run`);
  }
  if (isBlankValue(classification?.sourceState)) {
    issues.push(`${prefix} requires validated backup-restore Drill Classification Source state`);
  }
  if (!hasBackupRestoreRestoreTargetClassificationEvidence(classification?.restoreTarget)) {
    issues.push(`${prefix} requires validated backup-restore Drill Classification Restore target with isolated or reviewed target evidence`);
  }
  if (isBlankValue(classification?.reviewer)) {
    issues.push(`${prefix} requires validated backup-restore Drill Classification Reviewer`);
  }
  if (!isIsoCalendarDate(classification?.date?.trim() ?? '')) {
    issues.push(`${prefix} requires validated backup-restore Drill Classification Date to use YYYY-MM-DD`);
  }
  return issues;
}

function validateBackupRestoreFailClosedInstitutionalFields(
  validation: BackupRestoreEvidenceValidationInput,
  prefix: string,
): string[] {
  const issues: string[] = [];
  const classification = validation.classification ?? {};
  if (!classification.drillName || isBlankValue(classification.drillName)) {
    issues.push(`${prefix} requires validated backup-restore Drill Classification Drill name`);
  }
  if (!isBackupRestoreClassificationGitCommit(classification.gitCommit)) {
    issues.push(`${prefix} requires validated backup-restore Drill Classification Git commit`);
  }
  if (classification.releaseLevel !== 'institutional reference') {
    issues.push(`${prefix} requires validated backup-restore Drill Classification Release level = institutional reference`);
  }
  if (!['local offline', 'local devnet', 'patched devnet', 'staging'].includes(classification.environment ?? '')) {
    issues.push(`${prefix} requires validated backup-restore Drill Classification Environment to remain local offline, local devnet, patched devnet, or staging`);
  }
  if (!isDisabledOrDryRunBroadcastMode(classification.broadcastMode)) {
    issues.push(`${prefix} requires validated backup-restore Drill Classification Broadcast mode disabled or dry-run`);
  }
  if (isBlankValue(classification.sourceState)) {
    issues.push(`${prefix} requires validated backup-restore Drill Classification Source state`);
  }
  if (!hasBackupRestoreRestoreTargetClassificationEvidence(classification.restoreTarget)) {
    issues.push(`${prefix} requires validated backup-restore Drill Classification Restore target with isolated or reviewed target evidence`);
  }
  if (isBlankValue(classification.reviewer)) {
    issues.push(`${prefix} requires validated backup-restore Drill Classification Reviewer`);
  }
  if (!isIsoCalendarDate(classification.date?.trim() ?? '')) {
    issues.push(`${prefix} requires validated backup-restore Drill Classification Date to use YYYY-MM-DD`);
  }

  const publicationEvidence = validation.publicationEvidence ?? {};
  if (publicationEvidence.productionReadyClaimAllowed !== 'no') {
    issues.push(`${prefix} requires backup-restore Production-ready claim allowed by this drill = no`);
  }
  if (publicationEvidence.testnetProductionCandidateClaimAllowed !== 'no') {
    issues.push(`${prefix} requires backup-restore Testnet production-candidate claim allowed by this drill = no`);
  }

  return issues;
}

function backupRestoreSupportsProductionCandidate(
  classification: BackupRestoreClassificationFields | undefined,
): boolean {
  return classification?.releaseLevel === 'production deployment candidate';
}

function isBackupRestoreClassificationGitCommit(value: string | undefined): boolean {
  return /^[a-f0-9]{7,40}$/i.test(value?.trim() ?? '');
}

function hasBackupRestoreRestoreTargetClassificationEvidence(value: string | undefined): boolean {
  const restoreTarget = value?.trim() ?? '';
  if (restoreTarget.length === 0) return false;
  if (!/\b(isolated|reviewed)\b/i.test(restoreTarget)) return false;
  if (/\b(unreviewed|not reviewed|without review|no review)\b/i.test(restoreTarget)) return false;
  if (!/\b(reviewed|live|runtime|production|relayer database|runtime database)\b/i.test(restoreTarget)) {
    return true;
  }
  return (
    /reviewer approval/i.test(restoreTarget) &&
    /rollback plan/i.test(restoreTarget) &&
    extractEvidenceTargets(restoreTarget).some(isConcreteEvidenceTarget)
  );
}

function validateRequiredReleaseNotesSignoffRows(
  prefix: string,
  rows: ReleaseSignoffRow[],
  decisionOwner?: string,
  decisionDate?: string,
  releaseLevel?: string,
): string[] {
  const issues: string[] = [];
  issues.push(...validateDuplicateStructuredRows(`${prefix}: signoffRows`, rows, 'role'));
  const normalizedDecisionDate = decisionDate?.trim() ?? '';
  const decisionDateIsValid = isIsoCalendarDate(normalizedDecisionDate);
  if (normalizedDecisionDate.length > 0 && !decisionDateIsValid) {
    issues.push(`${prefix}: signoffRows require Release Classification Decision date to use YYYY-MM-DD`);
  }
  const rowsByRole = new Map(rows.map(row => [row.role, row]));
  const missing = REQUIRED_RELEASE_NOTES_SIGNOFF_ROLES.filter(role => !rowsByRole.has(role));
  if (missing.length > 0) {
    issues.push(`${prefix}: signoffRows must include required sign-off roles: ${missing.join(', ')}`);
  }
  for (const role of REQUIRED_RELEASE_NOTES_SIGNOFF_ROLES) {
    const row = rowsByRole.get(role);
    if (!row) continue;
    if (row.decision !== 'approve') {
      issues.push(`${prefix}: signoffRows: ${role}: decision must be approve`);
    }
    if (role === 'Maintainer' && decisionOwner && row.name !== decisionOwner) {
      issues.push(`${prefix}: signoffRows: ${role}: name must match Release Classification Decision owner`);
    }
    if (isBlankValue(row.date)) {
      issues.push(`${prefix}: signoffRows: ${role}: date is required`);
    } else if (!isIsoCalendarDate(row.date)) {
      issues.push(`${prefix}: signoffRows: ${role}: date must use YYYY-MM-DD`);
    } else if (decisionDateIsValid && row.date < normalizedDecisionDate) {
      issues.push(`${prefix}: signoffRows: ${role}: date must not be before Release Classification Decision date`);
    }
    if (!isBlankValue(row.notes) && !hasNoContradictoryReleaseNotesEvidenceMarker(row.notes)) {
      issues.push(`${prefix}: signoffRows: ${role}: notes must not include contradictory release-note failure markers`);
    }
    if (!hasActionableReleaseNotesSignoffNote(row.notes, role)) {
      issues.push(`${prefix}: signoffRows: ${role} requires actionable release-note sign-off notes`);
    }
    issues.push(...validateReleaseNotesSignoffNoteClaimBoundary(prefix, row, releaseLevel));
  }
  return issues;
}

function validateReleaseNotesSignoffNoteClaimBoundary(
  prefix: string,
  row: ReleaseSignoffRow,
  releaseLevel?: string,
): string[] {
  const notes = row.notes ?? '';
  if (notes.trim().length === 0) return [];

  const claim = classifyPublicationClaimText(notes);
  const issues: string[] = [];
  const isProductionDeploymentCandidate = releaseLevel === 'production deployment candidate';
  if (hasAbsoluteSecurityClaim(notes)) {
    issues.push(`${prefix}: signoffRows: ${row.role}: absolute security wording is not allowed in release notes`);
  }
  if (claim.hasMainnetProductionClaim) {
    issues.push(`${prefix}: signoffRows: ${row.role} notes must not contain mainnet production claim wording`);
  }
  if (claim.hasProductionReadyClaim) {
    issues.push(`${prefix}: signoffRows: ${row.role} notes must not contain production-ready claim wording`);
  }
  if (claim.hasControlledTestnetProductionClaim && !isProductionDeploymentCandidate) {
    issues.push(`${prefix}: signoffRows: ${row.role}: ${PRODUCTION_CLAIM_EVIDENCE_ERROR}`);
  }
  if (
    isProductionDeploymentCandidate &&
    claim.hasProductionClaim &&
    !claim.hasControlledTestnetProductionClaim &&
    !claim.hasMainnetProductionClaim &&
    !claim.hasProductionReadyClaim
  ) {
    issues.push(`${prefix}: signoffRows: ${row.role}: ${CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (
    !isProductionDeploymentCandidate &&
    claim.hasProductionClaim &&
    !claim.hasMainnetProductionClaim &&
    !claim.hasProductionReadyClaim
  ) {
    issues.push(`${prefix}: signoffRows: ${row.role}: ${PRODUCTION_CLAIM_EVIDENCE_ERROR}`);
  }
  return [...new Set(issues)];
}

function validateTechnicalAddendumProductionCandidateFields(
  classification: NonNullable<TechnicalAddendumEvidenceValidationInput['classification']>,
  publicationDecision: NonNullable<TechnicalAddendumEvidenceValidationInput['publicationDecision']>,
  prefix: string,
  cleanCheckoutGitCommit?: string,
): string[] {
  const issues: string[] = [];
  if (classification.releaseLevel !== 'production deployment candidate') {
    issues.push(`${prefix} requires validated technical addendum Release level = production deployment candidate`);
  }
  if (classification.environment !== 'testnet') {
    issues.push(`${prefix} requires validated technical addendum Environment = testnet`);
  }
  if (
    classification.claimWording !== 'testnet production-candidate' &&
    classification.claimWording !== 'production-grade testnet'
  ) {
    issues.push(`${prefix} requires validated technical addendum controlled testnet claim wording`);
  }
  if (isBlankValue(classification.manualName)) {
    issues.push(`${prefix} requires validated technical addendum Manual Classification Manual name`);
  }
  if (!isTechnicalAddendumClassificationGitCommit(classification.gitCommit)) {
    issues.push(`${prefix} requires validated technical addendum Manual Classification Git commit`);
  } else if (
    isCleanCheckoutRunClassificationGitCommit(cleanCheckoutGitCommit) &&
    normalizeGitCommit(classification.gitCommit) !== normalizeGitCommit(cleanCheckoutGitCommit)
  ) {
    issues.push(
      `${prefix} requires technical addendum Git commit to match clean checkout Git commit ${cleanCheckoutGitCommit?.trim()}`,
    );
  }
  if (isBlankValue(classification.architectureOwner)) {
    issues.push(`${prefix} requires validated technical addendum Manual Classification Architecture owner`);
  }
  if (isBlankValue(classification.reviewer)) {
    issues.push(`${prefix} requires validated technical addendum Manual Classification Reviewer`);
  }
  if (!isIsoCalendarDate(classification.date?.trim() ?? '')) {
    issues.push(`${prefix} requires validated technical addendum Manual Classification Date to use YYYY-MM-DD`);
  }
  if (publicationDecision.releaseSupported !== 'production deployment candidate') {
    issues.push(`${prefix} requires validated technical addendum Release supported = production deployment candidate`);
  }
  if (publicationDecision.manualUseStatus !== 'candidate claim support') {
    issues.push(`${prefix} requires validated technical addendum Manual use status = candidate claim support`);
  }
  if (publicationDecision.releaseGateStatus !== 'pass') {
    issues.push(`${prefix} requires validated technical addendum Release gate status = pass`);
  }
  if (publicationDecision.productionReadyClaimAllowed !== 'no') {
    issues.push(`${prefix} requires validated technical addendum Production-ready claim allowed = no`);
  }
  if (publicationDecision.mainnetDeploymentClaimAllowed !== 'no') {
    issues.push(`${prefix} requires validated technical addendum Mainnet deployment claim allowed = no`);
  }
  if (publicationDecision.testnetProductionCandidateClaimAllowed !== 'yes-after-release-gate-pass') {
    issues.push(`${prefix} requires validated technical addendum Testnet production-candidate claim allowed = yes-after-release-gate-pass`);
  }
  if (publicationDecision.releaseNotesUpdated !== 'yes') {
    issues.push(`${prefix} requires validated technical addendum Release notes updated = yes`);
  }
  if (!hasCompletedTechnicalAddendumReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '')) {
    issues.push(`${prefix} requires completed Phase 007 release-note update evidence`);
  }
  if (!hasCompletedTechnicalAddendumChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '')) {
    issues.push(`${prefix} requires completed Phase 007 checklist update evidence`);
  }
  issues.push(
    ...validateTechnicalAddendumPublicationUpdateBoundary(
      `${prefix}: Phase 007 release-note update evidence`,
      publicationDecision.requiredReleaseNoteUpdates ?? '',
    ),
  );
  issues.push(
    ...validateTechnicalAddendumPublicationUpdateBoundary(
      `${prefix}: Phase 007 checklist update evidence`,
      publicationDecision.requiredChecklistUpdates ?? '',
    ),
  );
  if (
    hasCompletedTechnicalAddendumReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '') &&
    hasCompletedTechnicalAddendumChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '') &&
    haveSharedConcreteEvidenceTarget(
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      publicationDecision.requiredChecklistUpdates ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires distinct completed Phase 007 release-note and checklist update evidence targets`,
    );
  }
  if (!technicalAddendumReviewerDecisionSummaryIsBounded(publicationDecision)) {
    issues.push(
      `${prefix} requires validated technical addendum Reviewer decision summary to bind release support, architecture manual evidence, production-ready claim handling, and testnet production-candidate claim handling`,
    );
  }
  if (
    publicationDecision.releaseSupported === 'production deployment candidate' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !technicalAddendumReviewerDecisionSummaryHasExactReleaseSupportedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated technical addendum Reviewer decision summary to use exact Release supported = production deployment candidate`,
    );
  }
  if (
    publicationDecision.productionReadyClaimAllowed === 'no' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !technicalAddendumReviewerDecisionSummaryHasExactProductionReadyClaimDeniedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated technical addendum Reviewer decision summary to use exact Production-ready claim allowed = no`,
    );
  }
  if (
    publicationDecision.testnetProductionCandidateClaimAllowed === 'yes-after-release-gate-pass' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !technicalAddendumReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated technical addendum Reviewer decision summary to use exact Testnet production-candidate claim allowed = yes-after-release-gate-pass`,
    );
  }
  if (technicalAddendumReviewerNoteApprovesNodeWalletProductionPath(publicationDecision.reviewerDecisionSummary ?? '')) {
    issues.push(
      `${prefix} requires validated technical addendum Reviewer decision summary not to approve node-wallet production path`,
    );
  }
  if (technicalAddendumReviewerNoteApprovesUnscopedBroadcastEnablement(publicationDecision.reviewerDecisionSummary ?? '')) {
    issues.push(
      `${prefix} requires validated technical addendum Reviewer decision summary not to approve unscoped broadcast enablement`,
    );
  }
  if (technicalAddendumReviewerNoteAllowsTestnetClaimsBeforeReleaseGatePass(publicationDecision.reviewerDecisionSummary ?? '')) {
    issues.push(
      `${prefix} requires validated technical addendum Reviewer decision summary to require release gate pass before testnet production-candidate claims`,
    );
  }
  return issues;
}

function isTechnicalAddendumClassificationGitCommit(value: string | undefined): boolean {
  return /^[a-f0-9]{7,40}$/i.test(value?.trim() ?? '');
}

function validateTechnicalAddendumPublicationUpdateBoundary(label: string, text: string): string[] {
  const issues = [
    ...validateReleaseGatePublicationClaimBoundary(label, text),
  ];

  if (technicalAddendumReviewerNoteApprovesNodeWalletProductionPath(text)) {
    issues.push(`${label} must not approve node-wallet production path`);
  }
  if (technicalAddendumReviewerNoteApprovesUnscopedBroadcastEnablement(text)) {
    issues.push(`${label} must not approve unscoped broadcast enablement`);
  }
  if (technicalAddendumReviewerNoteAllowsTestnetClaimsBeforeReleaseGatePass(text)) {
    issues.push(`${label} must require release gate pass before testnet production-candidate claims`);
  }
  if (technicalAddendumPublicationUpdateDeniesTestnetProductionCandidateSupport(text)) {
    issues.push(`${label} must not deny testnet production-candidate claim support`);
  }
  if (hasContradictoryValidationFailureMarker(text)) {
    issues.push(`${label} must not mix completed/PASS evidence with failure markers`);
  }
  if (hasContradictoryReleaseNotesDecisionBinding(text)) {
    issues.push(`${label} must not include contradictory release-note decision bindings`);
  }

  return [...new Set(issues)];
}

function technicalAddendumPublicationUpdateDeniesTestnetProductionCandidateSupport(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\btestnet production candidate claim allowed\s+(?:no|false|0|blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\btestnet production candidate claim support\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\btestnet production candidate claims?\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized)
  );
}

function technicalAddendumReviewerDecisionSummaryIsBounded(
  publicationDecision: NonNullable<TechnicalAddendumEvidenceValidationInput['publicationDecision']>,
): boolean {
  const summary = publicationDecision.reviewerDecisionSummary ?? '';
  const normalized = normalizeDecisionSummaryForReleaseGate(summary);
  const testnetProductionCandidateClaimAllowed =
    publicationDecision.testnetProductionCandidateClaimAllowed === 'yes-after-release-gate-pass'
      ? 'yes'
      : publicationDecision.testnetProductionCandidateClaimAllowed;
  return (
    /\brelease supported\b/.test(normalized) &&
    /\barchitecture manual\b/.test(normalized) &&
    /\bproduction ready claim handling\b/.test(normalized) &&
    /\btestnet production candidate claim handling\b/.test(normalized) &&
    validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'technical addendum Reviewer decision summary',
      summary,
      releaseSupported: publicationDecision.releaseSupported,
      productionReadyClaimAllowed: publicationDecision.productionReadyClaimAllowed,
      testnetProductionCandidateClaimAllowed,
    }).length === 0
  );
}

function technicalAddendumReviewerDecisionSummaryHasExactReleaseSupportedBinding(value: string): boolean {
  return /\bRelease supported\s*=\s*production deployment candidate\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function technicalAddendumReviewerDecisionSummaryHasExactProductionReadyClaimDeniedBinding(value: string): boolean {
  return /\bProduction-ready claim allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function technicalAddendumReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(
  value: string,
): boolean {
  return /\bTestnet production-candidate claim allowed\s*=\s*yes-after-release-gate-pass\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function normalizeEvidenceTargetValue(value?: string): string | undefined {
  return value ? normalizeEvidenceTarget(value) : undefined;
}

function validateCheckedFreshCheckpointJson(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.freshCheckpointJsonValidation;
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual fresh checkpoint JSON validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual fresh checkpoint JSON validation to pass`);
  }
  if (!isValidatedFreshCheckpointJsonTargetLinked(row.requiredResolution, validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual fresh checkpoint JSON validation target must match a linked completed fresh checkpoint JSON report`,
    );
  }
  issues.push(...validateFreshCheckpointProvenanceSummary(
    validation,
    `${row.gate}: ${row.item}: actual fresh checkpoint JSON validation`,
  ));
  return issues;
}

function validateCheckedLivePreflightJson(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.livePreflightJsonValidation;
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual external-fee live-preflight JSON validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual external-fee live-preflight JSON validation to pass`);
  }
  if (!isValidatedLivePreflightJsonTargetLinked(row.requiredResolution, validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual external-fee live-preflight JSON validation target must match a linked completed external-fee live-preflight JSON report`,
    );
  }
  issues.push(...validateLivePreflightProvenanceSummary(
    validation,
    options,
    `${row.gate}: ${row.item}: actual external-fee live-preflight JSON validation`,
  ));
  return issues;
}

function validateCheckedPostSubmitObserveJson(
  row: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.postSubmitObserveJsonValidation;
  if (!validation) {
    return [
      `${row.gate}: ${row.item}: Checked evidence requires actual post-submit observe JSON validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(`${row.gate}: ${row.item}: Checked evidence requires actual post-submit observe JSON validation to pass`);
  }
  if (!isValidatedPostSubmitObserveJsonTargetLinked(row.requiredResolution, validation.target)) {
    issues.push(
      `${row.gate}: ${row.item}: actual post-submit observe JSON validation target must match a linked completed post-submit observe JSON report`,
    );
  }
  issues.push(...validatePostSubmitObserveProvenanceSummary(
    validation,
    options,
    `${row.gate}: ${row.item}: actual post-submit observe JSON validation`,
  ));
  return issues;
}

function hasProductionReadyClaimAllowedYes(text: string): boolean {
  return /\bproduction-ready claims? allowed(?: by this [^:|.;]+)?\s*(?:=|:)\s*yes\b/i.test(text);
}

function normalizeTxId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : undefined;
}

function normalizeTxIdArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value.map(item => normalizeTxId(item));
  return normalized.every((item): item is string => item !== undefined)
    ? normalized
    : undefined;
}

function sameOrderedValues(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function hasDuplicateValues(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

function isPositiveIntegerValue(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isPositiveIntegerLike(value: unknown): boolean {
  return isPositiveIntegerValue(value) ||
    (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim()));
}

function isPositiveSafeIntegerLike(value: unknown): boolean {
  if (isPositiveIntegerValue(value)) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return /^[1-9]\d*$/.test(normalized) && Number.isSafeInteger(Number(normalized));
}

function isNonNegativeSafeIntegerValue(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNonBroadcastAggregateCheckCommand(value: unknown): value is string {
  return typeof value === 'string' && NON_BROADCAST_AGGREGATE_CHECK_COMMANDS.has(value);
}

function requiresAnchoredAggregateClaim(command: unknown): boolean {
  return typeof command === 'string' && ANCHORED_AGGREGATE_CHECK_COMMANDS.has(command);
}

function isIsoUtcTimestamp(value: unknown): boolean {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}

function identifiesPositiveTestnetNetwork(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = value.toLowerCase();
  const withoutNonMainnet = normalized.replace(/\bnon[- ]?main[- ]?net\b/gi, '');
  return /\btestnet\b/.test(normalized) &&
    !/\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/.test(withoutNonMainnet) &&
    !/\b(?:not|no|without)\s+(?:on\s+|using\s+|connected\s+to\s+|the\s+)?testnet\b/.test(normalized);
}

function containsForbiddenRecoverySourceBindingValue(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().replace(/\\/g, '/');
    return (
      normalized.includes('://') ||
      normalized.includes('/') ||
      isSharedSensitiveOrRuntimeEvidenceTarget(normalized) ||
      /\b(?:authorization|bearer|api[-_ ]?key|auth[-_ ]?header|secret|token|password|credential)\b/i.test(normalized) ||
      /^[a-z]:\//i.test(normalized)
    );
  }
  if (Array.isArray(value)) {
    return value.some(containsForbiddenRecoverySourceBindingValue);
  }
  if (isRecord(value)) {
    return Object.entries(value).some(([key, child]) =>
      /^(?:authheader|authorization|apikey|token|secret|password|credential|runtimepath|statepath|dbpath)$/i.test(key.replace(/[-_\s]/g, '')) ||
      containsForbiddenRecoverySourceBindingValue(child),
    );
  }
  return false;
}

function validateReleaseDecision(
  markdown: string,
  fields: Partial<ReleaseDecisionFields>,
  blockers: PendingEvidenceRow[],
  rows: PendingEvidenceRow[],
  options: ReleaseGateEvaluationOptions,
): string[] {
  const section = sectionBetween(markdown, '## Release Decision', 'Executable local guard:');
  const issues = validateDuplicateRequiredFields(
    'Release Decision',
    parseTwoColumnFieldNames(section),
    REQUIRED_RELEASE_DECISION_FIELDS,
  );

  if (!hasMarkdownTable(section)) {
    issues.push('Release Decision: decision table not found');
    return issues;
  }

  const header = parseFirstMarkdownTableHeader(section);
  if (
    header.length !== REQUIRED_RELEASE_DECISION_HEADER.length ||
    header.some((cell, index) => cell !== REQUIRED_RELEASE_DECISION_HEADER[index])
  ) {
    issues.push(`Release Decision: table header must be ${REQUIRED_RELEASE_DECISION_HEADER.join(' | ')}`);
  }

  const rawFields = parseTwoColumnTable(section);
  for (const field of REQUIRED_RELEASE_DECISION_FIELDS) {
    if ((rawFields.get(field) ?? '').trim().length === 0) {
      issues.push(`Release Decision: ${field} is required`);
    }
  }

  validateAllowedField(issues, rawFields, 'Release Decision', 'Proposed release level', ALLOWED_RELEASE_LEVELS);
  validateAllowedField(issues, rawFields, 'Release Decision', 'Final decision', ALLOWED_FINAL_DECISIONS);
  validateAllowedField(issues, rawFields, 'Release Decision', 'Public release allowed', ALLOWED_YES_NO);
  validateAllowedField(issues, rawFields, 'Release Decision', 'Production-ready claims allowed', ALLOWED_YES_NO);
  validateAllowedField(issues, rawFields, 'Release Decision', 'Testnet production-candidate claims allowed', ALLOWED_YES_NO);
  validateAllowedField(issues, rawFields, 'Release Decision', 'Release notes status', ALLOWED_RELEASE_NOTES_STATUS);

  issues.push(
    ...validateEvidenceHygiene(fields.releaseNotesArtifact ?? '', 'Release Decision: Release notes artifact'),
  );
  issues.push(
    ...validateReleaseGatePublicationClaimBoundary(
      'Release Decision: Release notes artifact',
      fields.releaseNotesArtifact ?? '',
      {
        allowControlledTestnetProductionClaim:
          fields.testnetProductionCandidateClaimsAllowed === 'yes' &&
          fields.proposedReleaseLevel === 'production deployment candidate',
      },
    ),
  );

  const declaredBlockers = fields.unresolvedPublicationBlockers ?? '';
  if (!/^\d+$/.test(declaredBlockers.trim())) {
    issues.push('Release Decision: Unresolved publication blockers must be a non-negative integer');
  } else if (Number(declaredBlockers) !== blockers.length) {
    issues.push(
      `Release Decision: Unresolved publication blockers must match unresolved publication blocker count ${blockers.length}`,
    );
  }

  if (blockers.length > 0) {
    if (fields.proposedReleaseLevel !== 'blocked') {
      issues.push('Release Decision: Proposed release level must be blocked while publication blockers remain');
    }
    if (fields.finalDecision !== 'blocked') {
      issues.push('Release Decision: Final decision must be blocked while publication blockers remain');
    }
    if (fields.publicReleaseAllowed !== 'no') {
      issues.push('Release Decision: Public release allowed must be no while publication blockers remain');
    }
    if (fields.testnetProductionCandidateClaimsAllowed !== 'no') {
      issues.push(
        'Release Decision: Testnet production-candidate claims allowed must be no while publication blockers remain',
      );
    }
  }

  const productionBlockers = blockers.filter(row => /\bproduction-ready\b/i.test(row.publicationEffect));
  if (productionBlockers.length > 0 && fields.productionReadyClaimsAllowed !== 'no') {
    issues.push('Release Decision: Production-ready claims allowed must be no while production blockers remain');
  }
  if (fields.productionReadyClaimsAllowed === 'yes') {
    issues.push(
      'Release Decision: Production-ready claims allowed must remain no; only testnet production-candidate claims can be evaluated',
    );
  }
  if (
    fields.productionReadyClaimsAllowed === 'yes' &&
    fields.proposedReleaseLevel !== 'production deployment candidate'
  ) {
    issues.push('Release Decision: Production-ready claims allowed requires production deployment candidate release level');
  }
  if (
    fields.testnetProductionCandidateClaimsAllowed === 'yes' &&
    fields.proposedReleaseLevel !== 'production deployment candidate'
  ) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires production deployment candidate release level',
    );
  }
  if (
    fields.testnetProductionCandidateClaimsAllowed === 'yes' &&
    fields.finalDecision !== 'approved'
  ) {
    issues.push('Release Decision: Testnet production-candidate claims allowed requires approved final decision');
  }
  if (
    fields.testnetProductionCandidateClaimsAllowed === 'yes' &&
    fields.releaseNotesStatus !== 'linked'
  ) {
    issues.push('Release Decision: Testnet production-candidate claims allowed requires linked release notes');
  }
  if (
    fields.testnetProductionCandidateClaimsAllowed === 'yes' &&
    fields.releaseNotesStatus === 'linked' &&
    !hasProductionDeploymentCandidateReleaseNotesEvidence(fields.releaseNotesArtifact ?? '')
  ) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires completed production deployment candidate release notes evidence',
    );
  }
  if (fields.testnetProductionCandidateClaimsAllowed === 'yes') {
    issues.push(...validateTestnetProductionCandidateClaimRows(rows, options));
    issues.push(...validateLinkedLiveRehearsalEvidence(rows, options));
    issues.push(...validateLinkedRecoveryObserveJson(rows, options));
    issues.push(...validateLinkedBackupRestoreEvidence(rows, options));
    issues.push(...validateLinkedAssemblyReportJson(rows, options));
    issues.push(...validateLinkedFreshCheckpointJson(rows, options));
    issues.push(...validateLinkedLivePreflightJson(rows, options));
    issues.push(...validateLinkedPostSubmitObserveJson(rows, options));
    issues.push(...validateTestnetLifecycleJsonConsistency('Release Decision', options));
    issues.push(...validateLinkedReleaseNotesDocument(fields, options));
  }
  if (fields.publicReleaseAllowed === 'yes' && fields.finalDecision !== 'approved') {
    issues.push('Release Decision: Public release allowed requires approved final decision');
  }
  if (fields.publicReleaseAllowed === 'yes' && fields.releaseNotesStatus !== 'linked') {
    issues.push('Release Decision: Public release allowed requires linked release notes');
  }
  if (
    fields.publicReleaseAllowed === 'yes' &&
    fields.releaseNotesStatus === 'linked' &&
    fields.testnetProductionCandidateClaimsAllowed !== 'yes'
  ) {
    issues.push(...validateLinkedReleaseNotesDocument(fields, options, 'Public release allowed'));
  }
  if (
    fields.finalDecision === 'approved' &&
    fields.releaseNotesStatus === 'linked' &&
    fields.publicReleaseAllowed !== 'yes' &&
    fields.testnetProductionCandidateClaimsAllowed !== 'yes'
  ) {
    issues.push(...validateApprovedLinkedReleaseNotesDocument(fields, options));
  }
  if (
    fields.releaseNotesStatus === 'linked' &&
    !hasCompletedEvidenceMarker(fields.releaseNotesArtifact ?? '')
  ) {
    issues.push('Release Decision: linked release notes require a completed release notes artifact');
  }
  if (
    fields.releaseNotesStatus === 'linked' &&
    !hasCompletedReleaseNotesDocumentArtifact(fields.releaseNotesArtifact ?? '')
  ) {
    issues.push('Release Decision: linked release notes require a completed release notes document artifact');
  }
  if (
    fields.releaseNotesStatus === 'linked' &&
    hasCompletedReleaseNotesTemplateArtifact(fields.releaseNotesArtifact ?? '')
  ) {
    issues.push(
      'Release Decision: linked release notes require a completed non-template release notes document artifact',
    );
  }
  if (
    fields.releaseNotesStatus === 'linked' &&
    hasCompletedReleaseNotesDocumentArtifact(fields.releaseNotesArtifact ?? '') &&
    !hasCompletedMarkdownReleaseNotesDocumentArtifact(fields.releaseNotesArtifact ?? '')
  ) {
    issues.push(
      'Release Decision: linked release notes require a completed Markdown release notes document artifact',
    );
  }
  if (
    fields.releaseNotesStatus === 'linked' &&
    !hasReleaseNotesValidationEvidence(fields.releaseNotesArtifact ?? '')
  ) {
    issues.push('Release Decision: linked release notes require release-notes:validate output evidence');
  }
  if (
    fields.releaseNotesStatus === 'linked' &&
    hasReleaseNotesValidationEvidence(fields.releaseNotesArtifact ?? '') &&
    !hasReleaseNotesValidationTargetBinding(fields.releaseNotesArtifact ?? '')
  ) {
    issues.push(
      'Release Decision: release-notes:validate output must identify the completed release notes document target',
    );
  }
  if (
    fields.releaseNotesStatus === 'linked' &&
    hasReleaseNotesValidationEvidence(fields.releaseNotesArtifact ?? '') &&
    !hasDistinctReleaseNotesValidationOutputTarget(fields.releaseNotesArtifact ?? '')
  ) {
    issues.push(
      'Release Decision: release-notes:validate output evidence must be distinct from the completed release notes document',
    );
  }
  if (
    fields.releaseNotesStatus === 'linked' &&
    hasReleaseNotesValidationEvidence(fields.releaseNotesArtifact ?? '') &&
    !hasQualifiedReleaseNotesValidationOutputTarget(fields.releaseNotesArtifact ?? '')
  ) {
    issues.push(
      'Release Decision: release-notes:validate output evidence must cite a validation log, transcript, CI run, or workflow artifact',
    );
  }
  if (
    fields.releaseNotesStatus === 'linked' &&
    hasReleaseNotesValidationEvidence(fields.releaseNotesArtifact ?? '') &&
    !hasPositiveReleaseNotesValidationResult(fields.releaseNotesArtifact ?? '')
  ) {
    issues.push(
      'Release Decision: release-notes:validate output evidence must identify a positive validation result',
    );
  }
  if (fields.finalDecision === 'approved' && fields.proposedReleaseLevel === 'blocked') {
    issues.push('Release Decision: approved releases require a non-blocked proposed release level');
  }

  if (
    blockers.length === 0 &&
    fields.finalDecision === 'approved' &&
    !new Set(['validated', 'linked']).has(fields.releaseNotesStatus ?? '')
  ) {
    issues.push('Release Decision: approved releases require validated or linked release notes');
  }

  return issues;
}

function validateReleaseGatePublicationClaimBoundary(
  label: string,
  text: string,
  options: { allowControlledTestnetProductionClaim?: boolean } = {},
): string[] {
  const claim = classifyPublicationClaimText(text);
  const issues: string[] = [];

  if (claim.hasMainnetProductionClaim) {
    issues.push(`${label}: ${MAINNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (claim.hasProductionReadyClaim) {
    issues.push(`${label}: ${CONTROLLED_TESTNET_PRODUCTION_CLAIM_ERROR}`);
  }
  if (claim.hasControlledTestnetProductionClaim && !options.allowControlledTestnetProductionClaim) {
    issues.push(`${label}: ${PRODUCTION_CLAIM_EVIDENCE_ERROR}`);
  }
  if (!claim.hasControlledTestnetProductionClaim && claim.hasProductionClaim) {
    issues.push(`${label}: ${PRODUCTION_CLAIM_EVIDENCE_ERROR}`);
  }

  return [...new Set(issues)];
}

function recoveryObserveJsonValidationArray(
  options: ReleaseGateEvaluationOptions,
): unknown[] {
  const validations: unknown = options.recoveryObserveJsonValidations;
  return Array.isArray(validations) ? validations : [];
}

function recoveryObserveJsonValidationEntries(
  options: ReleaseGateEvaluationOptions,
): Array<[number, RecoveryObserveJsonValidationInput]> {
  const entries: Array<[number, RecoveryObserveJsonValidationInput]> = [];
  for (const [index, validation] of recoveryObserveJsonValidationArray(options).entries()) {
    if (!isRecord(validation)) continue;
    entries.push([index, validation as unknown as RecoveryObserveJsonValidationInput]);
  }
  return entries;
}

function findRecoveryObserveJsonValidation(
  options: ReleaseGateEvaluationOptions,
  expectedKind: TestnetRecoveryDrillKind,
  requiredResolution?: string,
): RecoveryObserveJsonValidationInput | undefined {
  const validations = recoveryObserveJsonValidationEntries(options).map(([, validation]) => validation);
  return validations.find(validation => validation.kind === expectedKind) ??
    validations.find(validation =>
      requiredResolution !== undefined &&
      isValidatedRecoveryObserveJsonTargetLinked(requiredResolution, validation.target, expectedKind)
    );
}

function validateRecoveryObserveJsonValidationSet(
  options: ReleaseGateEvaluationOptions,
): string[] {
  const rawValidations: unknown = options.recoveryObserveJsonValidations;
  const issues: string[] = [];
  const seenKinds = new Set<TestnetRecoveryDrillKind>();
  const seenTargets = new Set<string>();

  if (rawValidations !== undefined && !Array.isArray(rawValidations)) {
    issues.push('Recovery observe JSON validations must be an array');
    return issues;
  }

  for (const [index, rawValidation] of recoveryObserveJsonValidationArray(options).entries()) {
    if (!isRecord(rawValidation)) {
      issues.push(`Recovery observe JSON validation: entry ${index} must be an object`);
      continue;
    }
    const validation = rawValidation as unknown as RecoveryObserveJsonValidationInput;

    if (validation.kind === undefined) {
      issues.push(
        `Recovery observe JSON validation: ${validation.target} must expose a recovery kind`,
      );
    } else if (!SUPPORTED_RECOVERY_OBSERVE_KINDS.has(validation.kind)) {
      issues.push(
        `Recovery observe JSON validation: ${validation.target} must expose a supported recovery kind`,
      );
    } else {
      if (seenKinds.has(validation.kind)) {
        issues.push(
          `Recovery observe JSON validation: ${validation.kind} must be provided at most once`,
        );
      }
      seenKinds.add(validation.kind);
    }

    const target = normalizeEvidenceTarget(validation.target);
    if (target.length === 0) continue;
    if (seenTargets.has(target)) {
      issues.push(
        `Recovery observe JSON validation: ${validation.target} must be provided at most once`,
      );
    }
    seenTargets.add(target);
  }

  return [...new Set(issues)];
}

function validateReleaseGateEvidenceTargetSet(
  options: ReleaseGateEvaluationOptions,
): string[] {
  const entries: Array<[string, { target?: unknown } | undefined]> = [
    ['localLiveRehearsalEvidenceValidation', options.localLiveRehearsalEvidenceValidation],
    ['liveRehearsalEvidenceValidation', options.liveRehearsalEvidenceValidation],
    ['localSettlementProfileActivationJsonValidation', options.localSettlementProfileActivationJsonValidation],
    ['settlementProfileActivationJsonValidation', options.settlementProfileActivationJsonValidation],
    ['freshCheckpointJsonValidation', options.freshCheckpointJsonValidation],
    ['livePreflightJsonValidation', options.livePreflightJsonValidation],
    ['postSubmitObserveJsonValidation', options.postSubmitObserveJsonValidation],
    ['assemblyReportJsonValidation', options.assemblyReportJsonValidation],
    ['backupRestoreEvidenceValidation', options.backupRestoreEvidenceValidation],
    ['cleanCheckoutEvidenceValidation', options.cleanCheckoutEvidenceValidation],
    ['dependencyReviewEvidenceValidation', options.dependencyReviewEvidenceValidation],
    ['securityReviewEvidenceValidation', options.securityReviewEvidenceValidation],
    ['trustlessBurnEvidenceValidation', options.trustlessBurnEvidenceValidation],
    ['benchmarkEvidenceValidation', options.benchmarkEvidenceValidation],
    ['operatorReadinessEvidenceValidation', options.operatorReadinessEvidenceValidation],
    ['committeeGovernanceEvidenceValidation', options.committeeGovernanceEvidenceValidation],
    ['externalIntegrationEvidenceValidation', options.externalIntegrationEvidenceValidation],
    ['technicalAddendumEvidenceValidation', options.technicalAddendumEvidenceValidation],
    ['releaseNotesValidation', options.releaseNotesValidation],
    ['threatModelEvidenceValidation', options.threatModelEvidenceValidation],
  ];
  for (const [index, validation] of recoveryObserveJsonValidationEntries(options)) {
    const label = typeof validation.kind === 'string' && validation.kind.length > 0
      ? `recoveryObserveJsonValidations[${validation.kind}]`
      : `recoveryObserveJsonValidations[${index}]`;
    entries.push([label, validation]);
  }

  const issues: string[] = [];
  const seenTargets = new Map<string, string>();

  for (const [label, validation] of entries) {
    const target = validation?.target;
    if (!validation) continue;
    if (typeof target !== 'string' || target.trim().length === 0) {
      issues.push(`Release gate evidence target: ${label} must expose a non-empty validation target`);
      continue;
    }
    const normalized = normalizeEvidenceTarget(target);
    if (normalized.length === 0) continue;
    const previous = seenTargets.get(normalized);
    if (previous) {
      issues.push(`Release gate evidence target: ${target} is reused by ${previous} and ${label}`);
      continue;
    }
    seenTargets.set(normalized, label);
  }

  return [...new Set(issues)];
}

function validateReleaseGateValidationOutputTargetSet(
  rows: PendingEvidenceRow[],
  decision: Partial<ReleaseDecisionFields>,
): string[] {
  const issues: string[] = [];
  const seenTargets = new Map<string, string>();
  const rememberTarget = (target: string, label: string): void => {
    const normalizedTarget = normalizeEvidenceTarget(target);
    const previous = seenTargets.get(normalizedTarget);
    if (previous && previous !== label) {
      issues.push(`Release gate validation output target: ${normalizedTarget} is reused by ${previous} and ${label}`);
      return;
    }
    seenTargets.set(normalizedTarget, label);
  };

  for (const row of rows) {
    if (row.status !== 'Checked') continue;
    const label = `${row.gate}: ${row.item}`;
    const rowTargets = new Set<string>();
    for (const segment of evidenceSegments(row.requiredResolution)) {
      if (!isReleaseGateValidationOutputSegment(segment)) continue;
      for (const target of extractReleaseGateValidationOutputTargets(segment)) {
        const normalizedTarget = normalizeEvidenceTarget(target);
        if (rowTargets.has(normalizedTarget)) {
          issues.push(`Release gate validation output target: ${normalizedTarget} is reused within ${label}`);
          continue;
        }
        rowTargets.add(normalizedTarget);
      }
    }

    for (const target of rowTargets) {
      rememberTarget(target, label);
    }
  }

  for (const target of extractReleaseDecisionValidationOutputTargets(decision)) {
    rememberTarget(target, 'Release Decision: Release notes artifact');
  }

  return [...new Set(issues)];
}

function isReleaseGateValidationOutputSegment(segment: string): boolean {
  return /\bnpm run\b/i.test(segment) &&
    /\b[a-z0-9:-]*validate\b/i.test(segment) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(segment);
}

function extractReleaseGateValidationOutputTargets(segment: string): string[] {
  const targetBinding = /\b(?:validated target|validated input|ci validate target|clean checkout validation target|backup validate target|backup-restore validation target|dependency validate target|dependency review validation target|security validate target|security review validation target|trustless validate target|trustless burn validation target|benchmark validate target|benchmark validation target|governance validate target|governance validation target|operator validate target|operator readiness validation target|integration validate target|integration validation target|addendum validate target|technical addendum validation target|release-notes validation target|release notes validation target|recovery-observe JSON validation target|recovery-observe validation target|recovery observe validation target|rehearsal validate target|rehearsal validation target)\b/i
    .exec(segment);
  const outputText = targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
  return extractEvidenceTargets(outputText)
    .map(normalizeEvidenceTarget)
    .filter(isConcreteQualifiedValidationOutputTarget);
}

function extractReleaseDecisionValidationOutputTargets(
  decision: Partial<ReleaseDecisionFields>,
): string[] {
  return extractReleaseNotesValidationOutputTargets(decision.releaseNotesArtifact ?? '')
    .map(normalizeEvidenceTarget)
    .filter(isConcreteQualifiedValidationOutputTarget);
}

function validateLinkedPostSubmitObserveJson(
  rows: PendingEvidenceRow[],
  options: ReleaseGateEvaluationOptions,
): string[] {
  const issues: string[] = [];
  const validation = options.postSubmitObserveJsonValidation;
  const row = rows.find(candidate => candidate.item === 'Fresh Ergo testnet lifecycle run');

  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual post-submit observe JSON validation input',
    ];
  }

  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual post-submit observe JSON validation to pass',
    );
  }

  if (!row || !isValidatedPostSubmitObserveJsonTargetLinked(row.requiredResolution, validation.target)) {
    issues.push(
      'Release Decision: actual post-submit observe JSON validation target must match a linked completed post-submit observe JSON report',
    );
  }
  issues.push(...validatePostSubmitObserveProvenanceSummary(
    validation,
    options,
    'Release Decision: actual post-submit observe JSON validation',
  ));

  return issues;
}

function validateLinkedAssemblyReportJson(
  rows: PendingEvidenceRow[],
  options: ReleaseGateEvaluationOptions,
): string[] {
  const issues: string[] = [];
  const validation = options.assemblyReportJsonValidation;
  const row = rows.find(candidate => candidate.item === 'Fresh Ergo testnet lifecycle run');

  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual assembly report JSON validation input',
    ];
  }

  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual assembly report JSON validation to pass',
    );
  }

  if (!row || !isValidatedAssemblyReportJsonTargetLinked(row.requiredResolution, validation.target)) {
    issues.push(
      'Release Decision: actual assembly report JSON validation target must match a linked completed assembly report JSON',
    );
  }
  issues.push(...validateAssemblyReportStructuredSummary(
    validation,
    'Release Decision: actual assembly report JSON validation',
    options,
  ));

  return issues;
}

function validateLinkedLiveRehearsalEvidence(
  rows: PendingEvidenceRow[],
  options: ReleaseGateEvaluationOptions,
): string[] {
  const issues: string[] = [];
  const validation = options.liveRehearsalEvidenceValidation;
  const row = rows.find(candidate => candidate.item === 'Fresh Ergo testnet lifecycle run');

  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual live rehearsal evidence validation input',
    ];
  }

  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual live rehearsal evidence validation to pass',
    );
  }

  if (!row || !isValidatedCompletedLiveRehearsalEvidenceTargetLinked(row.requiredResolution, validation.target)) {
    issues.push(
      'Release Decision: actual live rehearsal evidence validation target must match a linked completed live rehearsal document',
    );
  }

  if (!hasPassingRehearsalGate(validation, 'Fresh testnet lifecycle')) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires validated live rehearsal Fresh testnet lifecycle row to pass',
    );
  }
  issues.push(...validateLiveRehearsalStructuredRows(
    validation,
    'Release Decision: actual live rehearsal evidence validation',
  ));
  issues.push(...validateLiveRehearsalStructuredFields(
    validation,
    'Release Decision: actual live rehearsal evidence validation',
    'Fresh testnet lifecycle',
    options,
  ));

  return issues;
}

function validateLinkedAggregatePrebroadcastJson(
  rows: PendingEvidenceRow[],
  options: ReleaseGateEvaluationOptions,
): string[] {
  const issues: string[] = [];
  const validation = options.aggregatePrebroadcastJsonValidation;
  const row = rows.find(candidate => candidate.item === 'Fresh Ergo testnet lifecycle run');

  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual aggregate prebroadcast JSON validation input',
    ];
  }

  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual aggregate prebroadcast JSON validation to pass',
    );
  }
  if (!row || !isValidatedAggregatePrebroadcastJsonTargetLinked(row.requiredResolution, validation.target, options)) {
    issues.push(
      'Release Decision: actual aggregate prebroadcast JSON validation target must match fresh-checkpoint aggregateEvidence provenance',
    );
  }
  issues.push(...validateAggregatePrebroadcastStructuredSummary(
    validation,
    'Release Decision: actual aggregate prebroadcast JSON validation',
    options,
  ));

  return issues;
}

function validateLinkedPrepBundleJson(
  rows: PendingEvidenceRow[],
  options: ReleaseGateEvaluationOptions,
): string[] {
  const issues: string[] = [];
  const validation = options.prepBundleJsonValidation;
  const row = rows.find(candidate => candidate.item === 'Fresh Ergo testnet lifecycle run');

  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual prep-bundle JSON validation input',
    ];
  }

  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual prep-bundle JSON validation to pass',
    );
  }

  if (!isConcreteJsonEvidenceTarget(validation.target)) {
    issues.push(
      'Release Decision: actual prep-bundle JSON validation target must cite a concrete non-template prep-bundle JSON target',
    );
  }

  if (!row || !isValidatedPrepBundleJsonTargetLinked(row.requiredResolution, validation.target)) {
    issues.push(
      'Release Decision: actual prep-bundle JSON validation target must match a linked completed prep-bundle JSON report',
    );
  }
  issues.push(...validatePrepBundleProvenanceSummary(
    validation,
    options,
    'Release Decision: actual prep-bundle JSON validation',
  ));

  return issues;
}

function validateLinkedOfflineGateJson(
  rows: PendingEvidenceRow[],
  options: ReleaseGateEvaluationOptions,
): string[] {
  const issues: string[] = [];
  const validation = options.offlineGateJsonValidation;
  const row = rows.find(candidate => candidate.item === 'Fresh Ergo testnet lifecycle run');

  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual offline-gate JSON validation input',
    ];
  }

  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual offline-gate JSON validation to pass',
    );
  }

  if (!row || !isValidatedOfflineGateJsonTargetLinked(row.requiredResolution, validation.target)) {
    issues.push(
      'Release Decision: actual offline-gate JSON validation target must match a linked completed offline-gate JSON report',
    );
  }
  issues.push(...validateOfflineGateProvenanceSummary(
    validation,
    options,
    'Release Decision: actual offline-gate JSON validation',
  ));

  return issues;
}

function validateLinkedWindowPrepJson(
  _rows: PendingEvidenceRow[],
  options: ReleaseGateEvaluationOptions,
): string[] {
  const issues: string[] = [];
  const validation = options.windowPrepJsonValidation;

  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual testnet window-prep JSON validation input',
    ];
  }

  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual testnet window-prep JSON validation to pass',
    );
  }
  if (!isConcreteJsonEvidenceTarget(validation.target)) {
    issues.push(
      'Release Decision: actual testnet window-prep JSON validation target must cite a concrete non-template window-prep JSON target',
    );
  }
  issues.push(...validateWindowPrepStructuredSummary(
    validation,
    options,
    'Release Decision: actual testnet window-prep JSON validation',
  ));
  return issues;
}

function validateLinkedRecoveryObserveJson(
  rows: PendingEvidenceRow[],
  options: ReleaseGateEvaluationOptions,
): string[] {
  const issues: string[] = [];

  for (const [item, expectedKind] of Object.entries(RECOVERY_OBSERVE_ROW_KINDS)) {
    const row = rows.find(candidate => candidate.item === item);
    const validation = findRecoveryObserveJsonValidation(options, expectedKind, row?.requiredResolution);

    if (!validation) {
      issues.push(
        `Release Decision: Testnet production-candidate claims allowed requires actual ${expectedKind} recovery-observe JSON validation input`,
      );
      continue;
    }

    if (!validationPassed(validation)) {
      issues.push(
        `Release Decision: Testnet production-candidate claims allowed requires actual ${expectedKind} recovery-observe JSON validation to pass`,
      );
    }

    if (validation.kind !== expectedKind) {
      issues.push(
        `Release Decision: actual recovery-observe JSON validation kind must be ${expectedKind}`,
      );
    }

    if (!row || !isValidatedRecoveryObserveJsonTargetLinked(row.requiredResolution, validation.target, expectedKind)) {
      issues.push(
        `Release Decision: actual recovery-observe JSON validation target must match a linked completed ${expectedKind} recovery observe JSON report`,
      );
    }
    issues.push(...validateRecoveryObserveProvenanceSummary(
      validation,
      expectedKind,
      'Release Decision: actual recovery-observe JSON validation',
    ));
  }

  return issues;
}

function validateLinkedBackupRestoreEvidence(
  rows: PendingEvidenceRow[],
  options: ReleaseGateEvaluationOptions,
): string[] {
  const issues: string[] = [];
  const validation = options.backupRestoreEvidenceValidation;
  const row = rows.find(candidate => candidate.item === 'Backup-restore or reconstructibility drill');

  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual backup-restore evidence validation input',
    ];
  }

  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual backup-restore evidence validation to pass',
    );
  }

  const evidencePayload = row ? checkedEvidencePayload(row.requiredResolution) : '';
  if (!row || !isValidatedBackupRestoreEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      'Release Decision: actual backup-restore evidence validation target must match a linked completed backup-restore evidence document',
    );
  }

  issues.push(...validateBackupRestoreDrillClassification(
    validation.classification,
    'Release Decision: actual backup-restore evidence validation',
    options.cleanCheckoutEvidenceValidation?.classification?.gitCommit,
  ));
  issues.push(...validateBackupRestoreStructuredSummary(
    validation,
    'Release Decision: actual backup-restore evidence validation',
  ));

  return issues;
}

function validateLinkedTechnicalAddendumEvidence(
  rows: PendingEvidenceRow[],
  options: ReleaseGateEvaluationOptions,
): string[] {
  const issues: string[] = [];
  const validation = options.technicalAddendumEvidenceValidation;
  const row = rows.find(candidate => candidate.item === 'Technical addendum architecture manual');

  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual technical addendum evidence validation input',
    ];
  }

  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual technical addendum evidence validation to pass',
    );
  }

  const evidencePayload = row ? checkedEvidencePayload(row.requiredResolution) : '';
  if (!row || !isValidatedTechnicalAddendumEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      'Release Decision: actual technical addendum evidence validation target must match a linked completed technical addendum document',
    );
  }

  issues.push(...validateTechnicalAddendumProductionCandidateFields(
    validation.classification ?? {},
    validation.publicationDecision ?? {},
    'Release Decision: Testnet production-candidate claims allowed',
    options.cleanCheckoutEvidenceValidation?.classification?.gitCommit,
  ));
  issues.push(...validateTechnicalAddendumClaimBoundaryFields(
    validation,
    'Release Decision: Testnet production-candidate claims allowed',
  ));
  if (validationPassed(validation)) {
    issues.push(...validateTechnicalAddendumStructuredSummary(
      validation,
      'Release Decision: actual technical addendum evidence validation',
    ));
  }

  return issues;
}

function validateLinkedLivePreflightJson(
  rows: PendingEvidenceRow[],
  options: ReleaseGateEvaluationOptions,
): string[] {
  const issues: string[] = [];
  const validation = options.livePreflightJsonValidation;
  const row = rows.find(candidate => candidate.item === 'Fresh Ergo testnet lifecycle run');

  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual external-fee live-preflight JSON validation input',
    ];
  }

  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual external-fee live-preflight JSON validation to pass',
    );
  }

  if (!row || !isValidatedLivePreflightJsonTargetLinked(row.requiredResolution, validation.target)) {
    issues.push(
      'Release Decision: actual external-fee live-preflight JSON validation target must match a linked completed external-fee live-preflight JSON report',
    );
  }
  issues.push(...validateLivePreflightProvenanceSummary(
    validation,
    options,
    'Release Decision: actual external-fee live-preflight JSON validation',
  ));

  return issues;
}

function validateLinkedFreshCheckpointJson(
  rows: PendingEvidenceRow[],
  options: ReleaseGateEvaluationOptions,
): string[] {
  const issues: string[] = [];
  const validation = options.freshCheckpointJsonValidation;
  const row = rows.find(candidate => candidate.item === 'Fresh Ergo testnet lifecycle run');

  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual fresh checkpoint JSON validation input',
    ];
  }

  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual fresh checkpoint JSON validation to pass',
    );
  }

  if (!row || !isValidatedFreshCheckpointJsonTargetLinked(row.requiredResolution, validation.target)) {
    issues.push(
      'Release Decision: actual fresh checkpoint JSON validation target must match a linked completed fresh checkpoint JSON report',
    );
  }
  issues.push(...validateFreshCheckpointProvenanceSummary(
    validation,
    'Release Decision: actual fresh checkpoint JSON validation',
  ));

  return issues;
}

function validateFreshCheckpointProvenanceSummary(
  validation: FreshCheckpointJsonValidationInput,
  prefix: string,
): string[] {
  const sourceBindings = isRecord(validation.sourceBindings)
    ? validation.sourceBindings
    : undefined;
  const issues: string[] = [];
  const checkpoint = isRecord(validation.checkpoint) ? validation.checkpoint : undefined;
  const boundary = isRecord(validation.boundary) ? validation.boundary : undefined;

  if (!checkpoint || !boundary) {
    issues.push(`${prefix} must expose structured checkpoint and boundary provenance`);
  } else {
    issues.push(...validateFreshCheckpointStructuredCheckpoint(
      checkpoint,
      validation,
      sourceBindings,
      prefix,
    ));
    issues.push(...validateFreshCheckpointBoundarySummary(boundary, prefix));
  }

  if (sourceBindings && containsForbiddenSourceBindingPayloadValue(sourceBindings)) {
    issues.push(`${prefix} sourceBindings must not serialize auth, secret, runtime, state, or database payloads`);
  }
  issues.push(...validateFreshCheckpointAggregateSourceBinding(sourceBindings?.aggregateEvidence, prefix));
  issues.push(...validateFreshCheckpointHeightEvidenceSourceBinding(sourceBindings?.heightEvidence, prefix));
  issues.push(...validateFreshCheckpointSingletonSourceBinding(sourceBindings?.singletonCheckpoint, prefix));
  issues.push(...validateFreshCheckpointAnchorSourceBinding(sourceBindings?.anchorObservations, prefix));
  return issues;
}

function validateFreshCheckpointStructuredCheckpoint(
  checkpoint: Record<string, unknown>,
  validation: FreshCheckpointJsonValidationInput,
  sourceBindings: Record<string, unknown> | undefined,
  prefix: string,
): string[] {
  const issues: string[] = [];

  if (checkpoint.lifecycleGate !== 'Fresh testnet lifecycle') {
    issues.push(`${prefix} checkpoint.lifecycleGate must be Fresh testnet lifecycle`);
  }
  if (checkpoint.lifecycleStatus !== 'publication blocker') {
    issues.push(`${prefix} checkpoint.lifecycleStatus must remain publication blocker`);
  }
  if (checkpoint.transactionCheckResult !== 'PASS') {
    issues.push(`${prefix} checkpoint.transactionCheckResult must be PASS`);
  }
  if (checkpoint.broadcast !== 'no') {
    issues.push(`${prefix} checkpoint.broadcast must be no`);
  }

  const checkpointExpectedTxId = normalizeTxId(checkpoint.expectedTxId);
  const validationExpectedTxId = normalizeTxId(validation.expectedTxId);
  if (!checkpointExpectedTxId) {
    issues.push(`${prefix} checkpoint.expectedTxId must be a concrete 32-byte transaction ID`);
  }
  if (checkpointExpectedTxId && validationExpectedTxId && checkpointExpectedTxId !== validationExpectedTxId) {
    issues.push(`${prefix} checkpoint.expectedTxId must match actual fresh checkpoint expectedTxId`);
  }

  const aggregateEvidence = typeof checkpoint.aggregateEvidence === 'string'
    ? checkpoint.aggregateEvidence
    : undefined;
  const sourceAggregateEvidence = typeof sourceBindings?.aggregateEvidence === 'string'
    ? sourceBindings.aggregateEvidence
    : undefined;
  if (!aggregateEvidence || !isConcreteJsonEvidenceTarget(aggregateEvidence)) {
    issues.push(`${prefix} checkpoint.aggregateEvidence must cite a concrete non-template aggregate JSON target`);
  }
  if (
    aggregateEvidence &&
    sourceAggregateEvidence &&
    isConcreteJsonEvidenceTarget(sourceAggregateEvidence) &&
    normalizeEvidenceTarget(aggregateEvidence) !== normalizeEvidenceTarget(sourceAggregateEvidence)
  ) {
    issues.push(`${prefix} checkpoint.aggregateEvidence must match sourceBindings.aggregateEvidence`);
  }

  issues.push(...validateFreshCheckpointFreshnessSummary(
    checkpoint.singletonObservationFreshness,
    prefix,
  ));
  issues.push(...validateFreshCheckpointHeightEvidenceSummary(
    checkpoint.heightEvidence,
    prefix,
  ));
  issues.push(...validateFreshCheckpointAnchorObservationSummary(
    checkpoint.anchorObservations,
    checkpoint.ergoAnchorHeights,
    checkpoint.bridgeEventRootHexes,
    prefix,
  ));

  return issues;
}

function validateFreshCheckpointFreshnessSummary(
  freshness: unknown,
  prefix: string,
): string[] {
  if (!isRecord(freshness)) {
    return [`${prefix} checkpoint.singletonObservationFreshness must expose fresh observation age provenance`];
  }

  const issues: string[] = [];
  if (freshness.status !== 'fresh') {
    issues.push(`${prefix} checkpoint.singletonObservationFreshness.status must be fresh`);
  }
  if (freshness.maxAgeSeconds !== 900) {
    issues.push(`${prefix} checkpoint.singletonObservationFreshness.maxAgeSeconds must be 900`);
  }
  if (freshness.maxAgeMinutes !== 15) {
    issues.push(`${prefix} checkpoint.singletonObservationFreshness.maxAgeMinutes must be 15`);
  }
  if (!isNonNegativeSafeIntegerValue(freshness.ageSeconds)) {
    issues.push(`${prefix} checkpoint.singletonObservationFreshness.ageSeconds must be a non-negative integer`);
  }
  if (!isNonNegativeSafeIntegerValue(freshness.ageMs)) {
    issues.push(`${prefix} checkpoint.singletonObservationFreshness.ageMs must be a non-negative integer`);
  }
  if (!isIsoUtcTimestamp(freshness.observedAt)) {
    issues.push(`${prefix} checkpoint.singletonObservationFreshness.observedAt must be an ISO UTC timestamp`);
  }
  if (!isIsoUtcTimestamp(freshness.checkedAt)) {
    issues.push(`${prefix} checkpoint.singletonObservationFreshness.checkedAt must be an ISO UTC timestamp`);
  }
  return issues;
}

function validateFreshCheckpointHeightEvidenceSummary(
  heightEvidence: unknown,
  prefix: string,
): string[] {
  if (!isRecord(heightEvidence)) {
    return [`${prefix} checkpoint.heightEvidence must expose non-broadcast height provenance`];
  }

  const issues: string[] = [];
  if (!isIsoUtcTimestamp(heightEvidence.observedAt)) {
    issues.push(`${prefix} checkpoint.heightEvidence.observedAt must be an ISO UTC timestamp`);
  }
  if (!isNonNegativeSafeIntegerValue(heightEvidence.ergoNodeHeight)) {
    issues.push(`${prefix} checkpoint.heightEvidence.ergoNodeHeight must be a non-negative integer`);
  }
  if (!isNonNegativeSafeIntegerValue(heightEvidence.sidechainBlockHeight)) {
    issues.push(`${prefix} checkpoint.heightEvidence.sidechainBlockHeight must be a non-negative integer`);
  }
  if (heightEvidence.broadcastEnabled !== false) {
    issues.push(`${prefix} checkpoint.heightEvidence.broadcastEnabled must be false`);
  }
  return issues;
}

function validateFreshCheckpointAnchorObservationSummary(
  anchorObservationsValue: unknown,
  ergoAnchorHeightsValue: unknown,
  bridgeEventRootHexesValue: unknown,
  prefix: string,
): string[] {
  const anchorObservations = Array.isArray(anchorObservationsValue)
    ? anchorObservationsValue
    : undefined;
  const ergoAnchorHeights = nonNegativeIntegerArrayValues(ergoAnchorHeightsValue);
  const bridgeEventRootHexes = normalizeTxIdArray(bridgeEventRootHexesValue);
  const issues: string[] = [];

  if (!anchorObservations || anchorObservations.length === 0) {
    issues.push(`${prefix} checkpoint.anchorObservations must expose non-empty live anchor observations`);
  }
  if (!ergoAnchorHeights || ergoAnchorHeights.length === 0) {
    issues.push(`${prefix} checkpoint.ergoAnchorHeights must expose non-empty non-negative integer heights`);
  }
  if (!bridgeEventRootHexes || bridgeEventRootHexes.length === 0) {
    issues.push(`${prefix} checkpoint.bridgeEventRootHexes must expose non-empty 32-byte roots`);
  }
  if (!anchorObservations || !ergoAnchorHeights || !bridgeEventRootHexes) {
    return issues;
  }

  if (anchorObservations.length !== ergoAnchorHeights.length) {
    issues.push(`${prefix} checkpoint.anchorObservations length must match checkpoint.ergoAnchorHeights length`);
  }
  if (anchorObservations.length !== bridgeEventRootHexes.length) {
    issues.push(`${prefix} checkpoint.anchorObservations length must match checkpoint.bridgeEventRootHexes length`);
  }

  for (const [index, observationValue] of anchorObservations.entries()) {
    const label = `${prefix} checkpoint.anchorObservations[${index}]`;
    if (!isRecord(observationValue)) {
      issues.push(`${label} must be a structured anchor observation`);
      continue;
    }
    if (observationValue.matchingFieldFound !== true) {
      issues.push(`${label}.matchingFieldFound must be true`);
    }
    if (!isIsoUtcTimestamp(observationValue.observedAt)) {
      issues.push(`${label}.observedAt must be an ISO UTC timestamp`);
    }
    const rawNodeHeight = observationValue.nodeHeight;
    const nodeHeight = isNonNegativeSafeIntegerValue(rawNodeHeight) && typeof rawNodeHeight === 'number'
      ? rawNodeHeight
      : undefined;
    if (nodeHeight === undefined) {
      issues.push(`${label}.nodeHeight must be a non-negative integer`);
    }

    const expectedHeight = ergoAnchorHeights[index];
    if (expectedHeight !== undefined) {
      if (observationValue.ergoAnchorHeight !== expectedHeight) {
        issues.push(`${label}.ergoAnchorHeight must match checkpoint.ergoAnchorHeights[${index}]`);
      }
      if (nodeHeight !== undefined && nodeHeight < expectedHeight) {
        issues.push(`${label}.nodeHeight must be greater than or equal to ergoAnchorHeight`);
      }
    }

    const expectedRoot = bridgeEventRootHexes[index];
    const observationExpectedRoot = normalizeTxId(observationValue.expectedBridgeEventRootHex);
    if (expectedRoot !== undefined && observationExpectedRoot !== expectedRoot) {
      issues.push(`${label}.expectedBridgeEventRootHex must match checkpoint.bridgeEventRootHexes[${index}]`);
    }
    const observedRoots = normalizeTxIdArray(observationValue.observedBridgeEventRootHexes);
    if (!observedRoots || observedRoots.length === 0) {
      issues.push(`${label}.observedBridgeEventRootHexes must expose observed 32-byte roots`);
    } else if (expectedRoot !== undefined && !observedRoots.includes(expectedRoot)) {
      issues.push(`${label}.observedBridgeEventRootHexes must include checkpoint.bridgeEventRootHexes[${index}]`);
    }
  }

  return issues;
}

function validateFreshCheckpointBoundarySummary(
  boundary: Record<string, unknown>,
  prefix: string,
): string[] {
  const issues: string[] = [];
  for (const field of FRESH_CHECKPOINT_FALSE_BOUNDARY_FIELDS) {
    if (boundary[field] !== false) {
      issues.push(`${prefix} boundary.${field} must be false`);
    }
  }
  return issues;
}

const FRESH_CHECKPOINT_FALSE_BOUNDARY_FIELDS = [
  'lifecyclePassAllowed',
  'broadcastAuthorized',
  'liveSubmitPerformed',
  'confirmationObserved',
  'reconciliationPerformed',
  'gate3ClosureAllowed',
  'productionReadyClaimAllowed',
  'testnetProductionCandidateClaimAllowed',
] as const;

function nonNegativeIntegerArrayValues(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.every(isNonNegativeSafeIntegerValue)
    ? value
    : undefined;
}

function validateFreshCheckpointAggregateSourceBinding(
  binding: unknown,
  prefix: string,
): string[] {
  return isConcreteJsonEvidenceTarget(binding)
    ? []
    : [`${prefix} sourceBindings.aggregateEvidence must cite a concrete non-template aggregate JSON target`];
}

function hasCommandSpecificLivePreflightApprovalBinding(
  approvalBinding: Record<string, unknown>,
): boolean {
  const command = typeof approvalBinding.command === 'string'
    ? approvalBinding.command
    : undefined;
  const mode = typeof approvalBinding.mode === 'string'
    ? approvalBinding.mode
    : undefined;
  const burnTxHashes = normalizeTxIdArray(approvalBinding.burnTxHashes);

  if (!NON_BROADCAST_AGGREGATE_CHECK_COMMANDS.has(command ?? '')) {
    return false;
  }
  if (!['single', 'single-with-ingest', 'batch'].includes(mode ?? '')) {
    return false;
  }

  if (command === 'check') {
    return mode === 'single' && burnTxHashes?.length === 1;
  }

  if (command === 'check-batch') {
    const bridgeEventRootHexes = normalizeTxIdArray(approvalBinding.bridgeEventRootHexes);
    return mode === 'batch' &&
      (burnTxHashes?.length ?? 0) >= 2 &&
      (burnTxHashes?.length ?? 0) <= BATCH_UNLOCK_MAX_CLAIMS &&
      burnTxHashes !== undefined &&
      !hasDuplicateValues(burnTxHashes) &&
      bridgeEventRootHexes !== undefined &&
      bridgeEventRootHexes.length === burnTxHashes?.length;
  }

  if (command === 'check-with-ingest') {
    const sidechainHeaderHashHex = normalizeTxId(approvalBinding.sidechainHeaderHashHex);
    const bridgeEventRootHex = normalizeTxId(approvalBinding.bridgeEventRootHex);
    const bridgeEventRootHexes = normalizeTxIdArray(approvalBinding.bridgeEventRootHexes);
    return mode === 'single-with-ingest' &&
      burnTxHashes?.length === 1 &&
      sidechainHeaderHashHex !== undefined &&
      bridgeEventRootHex !== undefined &&
      bridgeEventRootHexes !== undefined &&
      bridgeEventRootHexes.length === 1 &&
      bridgeEventRootHexes[0] === bridgeEventRootHex &&
      isNonNegativeSafeIntegerValue(approvalBinding.ergoAnchorHeight);
  }

  if (command === 'check-anchored') {
    return mode === 'single-with-ingest' &&
      burnTxHashes?.length === 1 &&
      isNonNegativeSafeIntegerValue(approvalBinding.ergoAnchorHeight);
  }

  return false;
}

function validateLivePreflightSettlementProfileBinding(
  validation: LivePreflightJsonValidationInput,
  options: ReleaseGateEvaluationOptions,
  prefix: string,
): string[] {
  const issues = validateGate3ClosureProfileBinding(
    validation.settlementProfile,
    options.settlementProfileActivationJsonValidation?.target,
    prefix,
  );
  const activation = options.settlementProfileActivationJsonValidation;
  if (!activation) {
    issues.push(`${prefix} requires actual settlement profile activation JSON validation input`);
    return [...new Set(issues)];
  }
  if (!validationPassed(activation)) {
    issues.push(`${prefix} requires settlement profile activation JSON validation PASS`);
  }
  if (activation.report === undefined) {
    issues.push(`${prefix} requires the structured settlement profile activation report`);
    return [...new Set(issues)];
  }

  const activationValidation = validateSettlementProfileActivationEvidence(
    activation.report,
    activation.authorityEvidence,
  );
  issues.push(...activationValidation.errors.map(error => `${prefix}: ${error}`));
  if (
    isRecord(validation.settlementProfile) &&
    activationValidation.settlementProfile &&
    !sameSettlementProfileBinding(validation.settlementProfile, activationValidation.settlementProfile)
  ) {
    issues.push(`${prefix} must match the validated activation report settlement profile`);
  }
  return [...new Set(issues)];
}

function sameSettlementProfileBinding(
  left: {
    settlementProfileId?: unknown;
    profileActivationStatus?: unknown;
    evidencePurpose?: unknown;
    activationEvidenceTarget?: unknown;
  },
  right: {
    settlementProfileId?: unknown;
    profileActivationStatus?: unknown;
    evidencePurpose?: unknown;
    activationEvidenceTarget?: unknown;
  },
): boolean {
  return left.settlementProfileId === right.settlementProfileId &&
    left.profileActivationStatus === right.profileActivationStatus &&
    left.evidencePurpose === right.evidencePurpose &&
    normalizeEvidenceTarget(String(left.activationEvidenceTarget ?? '')) ===
      normalizeEvidenceTarget(String(right.activationEvidenceTarget ?? ''));
}

function validateLivePreflightProvenanceSummary(
  validation: LivePreflightJsonValidationInput,
  options: ReleaseGateEvaluationOptions,
  prefix: string,
): string[] {
  const issues: string[] = [];

  issues.push(...validateLivePreflightSettlementProfileBinding(
    validation,
    options,
    `${prefix} settlementProfile`,
  ));

  if (validation.runtimeBroadcastEnabled !== false) {
    issues.push(`${prefix} runtimeBroadcastEnabled must be false`);
  }

  const targetBindings = isRecord(validation.targetBindings)
    ? validation.targetBindings
    : undefined;
  if (!targetBindings) {
    issues.push(`${prefix} must expose targetBindings provenance`);
  }

  const rehearsalTarget = typeof targetBindings?.rehearsal === 'string'
    ? targetBindings.rehearsal
    : undefined;
  if (!rehearsalTarget || !isConcreteEvidenceTarget(rehearsalTarget)) {
    issues.push(`${prefix} targetBindings.rehearsal must cite a concrete completed rehearsal target`);
  } else if (
    options.liveRehearsalEvidenceValidation &&
    normalizeEvidenceTarget(rehearsalTarget) !==
      normalizeEvidenceTarget(options.liveRehearsalEvidenceValidation.target)
  ) {
    issues.push(`${prefix} targetBindings.rehearsal must match actual live rehearsal evidence validation target`);
  }

  const approvalsTarget = typeof targetBindings?.approvals === 'string'
    ? targetBindings.approvals
    : undefined;
  if (!approvalsTarget || !isConcreteJsonEvidenceTarget(approvalsTarget)) {
    issues.push(`${prefix} targetBindings.approvals must cite a concrete non-template JSON approvals target`);
  }

  const transcriptTarget = typeof targetBindings?.transcript === 'string'
    ? targetBindings.transcript
    : undefined;
  if (!transcriptTarget || !isConcreteEvidenceTarget(transcriptTarget)) {
    issues.push(`${prefix} targetBindings.transcript must cite a concrete non-template transcript target`);
  }

  const preSubmitBoundary = isRecord(validation.preSubmitBoundary)
    ? validation.preSubmitBoundary
    : undefined;
  for (const field of LIVE_PREFLIGHT_FALSE_BOUNDARY_FIELDS) {
    if (!preSubmitBoundary || preSubmitBoundary[field] !== false) {
      issues.push(`${prefix} preSubmitBoundary.${field} must be false`);
    }
  }

  const authorizationEvidence = isRecord(validation.authorizationEvidence)
    ? validation.authorizationEvidence
    : undefined;
  for (const field of LIVE_PREFLIGHT_LINKED_AUTHORIZATION_FIELDS) {
    if (!authorizationEvidence || authorizationEvidence[field] !== 'linked') {
      issues.push(`${prefix} authorizationEvidence.${field} must be linked`);
    }
  }
  if (!authorizationEvidence || authorizationEvidence.approvalJsonBinding !== 'matched') {
    issues.push(`${prefix} authorizationEvidence.approvalJsonBinding must be matched`);
  }
  if (!authorizationEvidence || authorizationEvidence.releaseGateTranscriptLine !== 'emitted') {
    issues.push(`${prefix} authorizationEvidence.releaseGateTranscriptLine must be emitted`);
  }

  const approvalBinding = isRecord(validation.approvalBinding)
    ? validation.approvalBinding
    : undefined;
  if (!approvalBinding) {
    issues.push(`${prefix} approvalBinding must be present`);
  } else {
    const boundExpectedTxId = normalizeTxId(approvalBinding.expectedTxId);
    if (!boundExpectedTxId) {
      issues.push(`${prefix} approvalBinding.expectedTxId must be 32-byte hex`);
    } else if (
      validation.expectedTxId &&
      boundExpectedTxId !== normalizeTxId(validation.expectedTxId)
    ) {
      issues.push(`${prefix} approvalBinding.expectedTxId must match Expected transaction ID`);
    }
    const approvedBurnTxHashes = normalizeTxIdArray(approvalBinding.burnTxHashes);
    if (!approvedBurnTxHashes || approvedBurnTxHashes.length === 0) {
      issues.push(`${prefix} approvalBinding.burnTxHashes must expose the approved burn set`);
    } else if (hasDuplicateValues(approvedBurnTxHashes)) {
      issues.push(`${prefix} approvalBinding.burnTxHashes must not contain duplicates`);
    }
    if (
      approvalBinding.command === 'check-batch' &&
      approvedBurnTxHashes &&
      approvedBurnTxHashes.length > BATCH_UNLOCK_MAX_CLAIMS
    ) {
      issues.push(
        `${prefix} approvalBinding.burnTxHashes must not exceed batch unlock cap (${BATCH_UNLOCK_MAX_CLAIMS} claims)`,
      );
    }
    if (!hasCommandSpecificLivePreflightApprovalBinding(approvalBinding)) {
      issues.push(`${prefix} approvalBinding must expose command, mode, and command-specific root/anchor binding`);
    }
  }

  return issues;
}

function validatePostSubmitObserveProvenanceSummary(
  validation: PostSubmitObserveJsonValidationInput,
  options: ReleaseGateEvaluationOptions,
  prefix: string,
): string[] {
  const issues: string[] = [];
  const livePreflightBinding = isRecord(validation.livePreflightBinding)
    ? validation.livePreflightBinding
    : undefined;
  if (!livePreflightBinding) {
    issues.push(`${prefix} must expose livePreflightBinding provenance`);
  } else {
    const livePreflightTarget = typeof livePreflightBinding.target === 'string'
      ? livePreflightBinding.target
      : undefined;
    if (!livePreflightTarget || !isConcreteJsonEvidenceTarget(livePreflightTarget)) {
      issues.push(`${prefix} livePreflightBinding.target must cite a concrete non-template JSON report`);
    } else if (
      options.livePreflightJsonValidation &&
      normalizeEvidenceTarget(livePreflightTarget) !==
        normalizeEvidenceTarget(options.livePreflightJsonValidation.target)
    ) {
      issues.push(`${prefix} livePreflightBinding.target must match actual external-fee live-preflight JSON validation target`);
    }
    if (livePreflightBinding.status !== 'GO') {
      issues.push(`${prefix} livePreflightBinding.status must be GO`);
    }
    const boundExpectedTxId = normalizeTxId(livePreflightBinding.expectedTxId);
    const expectedTxId = normalizeTxId(validation.expectedTxId);
    if (!boundExpectedTxId || !expectedTxId || boundExpectedTxId !== expectedTxId) {
      issues.push(`${prefix} livePreflightBinding.expectedTxId must match Expected transaction ID`);
    }
    const approvedBurnTxHashes = normalizeTxIdArray(livePreflightBinding.approvedBurnTxHashes);
    const burnOrder = normalizeTxIdArray(validation.burnOrder);
    if (!approvedBurnTxHashes || !burnOrder || !sameOrderedValues(approvedBurnTxHashes, burnOrder)) {
      issues.push(`${prefix} livePreflightBinding.approvedBurnTxHashes must match burnOrder`);
    }
    if (approvedBurnTxHashes && hasDuplicateValues(approvedBurnTxHashes)) {
      issues.push(`${prefix} livePreflightBinding.approvedBurnTxHashes must not contain duplicates`);
    }
    if (burnOrder && hasDuplicateValues(burnOrder)) {
      issues.push(`${prefix} burnOrder must not contain duplicates`);
    }
    const livePreflightApprovalBinding = isRecord(options.livePreflightJsonValidation?.approvalBinding)
      ? options.livePreflightJsonValidation.approvalBinding
      : undefined;
    const livePreflightApprovedBurns = normalizeTxIdArray(livePreflightApprovalBinding?.burnTxHashes);
    if (
      approvedBurnTxHashes &&
      livePreflightApprovedBurns &&
      !sameOrderedValues(approvedBurnTxHashes, livePreflightApprovedBurns)
    ) {
      issues.push(`${prefix} livePreflightBinding.approvedBurnTxHashes must match actual live-preflight approvalBinding.burnTxHashes`);
    }
    if (livePreflightBinding.runtimeBroadcastEnabled !== false) {
      issues.push(`${prefix} livePreflightBinding.runtimeBroadcastEnabled must be false`);
    }
    if (livePreflightBinding.preSubmitBoundaryPreserved !== true) {
      issues.push(`${prefix} livePreflightBinding.preSubmitBoundaryPreserved must be true`);
    }
    if (livePreflightBinding.authorizationEvidenceLinked !== true) {
      issues.push(`${prefix} livePreflightBinding.authorizationEvidenceLinked must be true`);
    }
    const boundSettlementProfile = isRecord(livePreflightBinding.settlementProfile)
      ? livePreflightBinding.settlementProfile
      : undefined;
    issues.push(...validateGate3ClosureProfileBinding(
      boundSettlementProfile,
      options.settlementProfileActivationJsonValidation?.target,
      `${prefix} livePreflightBinding.settlementProfile`,
    ));
    const livePreflightSettlementProfile = isRecord(options.livePreflightJsonValidation?.settlementProfile)
      ? options.livePreflightJsonValidation.settlementProfile
      : undefined;
    if (
      boundSettlementProfile &&
      livePreflightSettlementProfile &&
      !sameSettlementProfileBinding(boundSettlementProfile, livePreflightSettlementProfile)
    ) {
      issues.push(
        `${prefix} livePreflightBinding.settlementProfile must match actual live-preflight settlementProfile`,
      );
    }
  }

  const confirmation = isRecord(validation.confirmation)
    ? validation.confirmation
    : undefined;
  if (
    !confirmation ||
    !isPositiveIntegerValue(confirmation.count) ||
    !isPositiveIntegerValue(confirmation.required) ||
    confirmation.policyMet !== true ||
    Number(confirmation.count) < Number(confirmation.required)
  ) {
    issues.push(`${prefix} confirmation policy must be met`);
  }
  if (!isConcreteArtifactEvidenceTarget(confirmation?.finalityEvidenceArtifact)) {
    issues.push(`${prefix} confirmation.finalityEvidenceArtifact must cite a completed artifact target`);
  }

  const boundaries = isRecord(validation.boundaries)
    ? validation.boundaries
    : undefined;
  if (!boundaries || boundaries.readOnlyObservation !== true) {
    issues.push(`${prefix} boundaries.readOnlyObservation must be true`);
  }
  for (const field of POST_SUBMIT_FALSE_BOUNDARY_FIELDS) {
    if (!boundaries || boundaries[field] !== false) {
      issues.push(`${prefix} boundaries.${field} must be false`);
    }
  }
  issues.push(...validatePostSubmitObserveSourceBindings(validation, prefix));
  issues.push(...validatePostSubmitObservationOutputShape(validation, prefix));

  return issues;
}

function validatePostSubmitObserveSourceBindings(
  validation: PostSubmitObserveJsonValidationInput,
  prefix: string,
): string[] {
  const issues: string[] = [];
  const sourceBindings = isRecord(validation.sourceBindings)
    ? validation.sourceBindings
    : undefined;
  const nodeBinding = isRecord(sourceBindings?.node)
    ? sourceBindings.node
    : undefined;
  if (!isValidPostSubmitObserveNodeSourceBinding(validation, nodeBinding)) {
    issues.push(`${prefix} sourceBindings.node must prove live-read-only-node read-only provenance`);
  }
  if (nodeBinding) {
    issues.push(...validateStringArrayEntries(
      nodeBinding.operations,
      `${prefix} sourceBindings.node.operations`,
    ));
  }
  if (nodeBinding && stringArrayValues(nodeBinding.operations).some(hasUnsafeFreshCheckpointOperationMarker)) {
    issues.push(`${prefix} sourceBindings.node.operations must not include signing, submission, broadcast, reconciliation, or mutation operations`);
  }

  const stateBinding = isRecord(sourceBindings?.state)
    ? sourceBindings.state
    : undefined;
  if (!isValidPostSubmitObserveStateSourceBinding(validation, stateBinding)) {
    issues.push(`${prefix} sourceBindings.state must prove read-only-state-tracker operator-provided-state-db provenance without serialized runtime paths`);
  }
  if (stateBinding) {
    issues.push(...validateStringArrayEntries(
      stateBinding.operations,
      `${prefix} sourceBindings.state.operations`,
    ));
  }
  if (stateBinding && stringArrayValues(stateBinding.operations).some(hasUnsafeFreshCheckpointOperationMarker)) {
    issues.push(`${prefix} sourceBindings.state.operations must not include signing, submission, broadcast, reconciliation, or mutation operations`);
  }

  return issues;
}

function isValidPostSubmitObserveNodeSourceBinding(
  validation: PostSubmitObserveJsonValidationInput,
  binding: Record<string, unknown> | undefined,
): boolean {
  if (!binding) return false;
  const boundExpectedTxId = normalizeTxId(binding.expectedTxId);
  const boundSubmittedTxId = normalizeTxId(binding.submittedTxId);
  const expectedTxId = normalizeTxId(validation.expectedTxId);
  const submittedTxId = normalizeTxId(validation.submittedTxId);
  return (
    binding.sourceType === 'live-read-only-node' &&
    binding.readOnly === true &&
    binding.noAuthHeader === true &&
    validateFreshCheckpointReadOnlyUrlBinding(
      binding.ergoNodeUrl,
      'post-submit observe sourceBindings.node.ergoNodeUrl',
    ).length === 0 &&
    isIsoUtcTimestamp(binding.observedAt) &&
    isNonNegativeSafeIntegerValue(binding.nodeHeight) &&
    identifiesPositiveTestnetNetwork(binding.nodeNetwork) &&
    boundExpectedTxId !== undefined &&
    expectedTxId !== undefined &&
    boundExpectedTxId === expectedTxId &&
    boundSubmittedTxId !== undefined &&
    submittedTxId !== undefined &&
    boundSubmittedTxId === submittedTxId &&
    hasPostSubmitObserveNodeReadOnlyOperations(binding.operations) &&
    !containsForbiddenPostSubmitObserveNodeBindingValue(binding)
  );
}

function isValidPostSubmitObserveStateSourceBinding(
  validation: PostSubmitObserveJsonValidationInput,
  binding: Record<string, unknown> | undefined,
): boolean {
  if (!binding) return false;
  const boundBurnOrder = normalizeTxIdArray(binding.burnOrder);
  const burnOrder = normalizeTxIdArray(validation.burnOrder);
  return (
    binding.sourceType === 'read-only-state-tracker' &&
    binding.readOnly === true &&
    binding.runtimePathSerialized === false &&
    binding.targetClass === 'operator-provided-state-db' &&
    boundBurnOrder !== undefined &&
    burnOrder !== undefined &&
    sameOrderedValues(boundBurnOrder, burnOrder) &&
    hasPostSubmitObserveStateReadOnlyOperations(binding.operations) &&
    !containsForbiddenPostSubmitObserveStateBindingValue(binding)
  );
}

function hasPostSubmitObserveNodeReadOnlyOperations(value: unknown): boolean {
  const operations = stringArrayValues(value).map(item => item.toLowerCase());
  return operations.some(item => /\bread[- ]only\b/.test(item) && /\/info\b/.test(item)) &&
    operations.some(item => /\bread[- ]only\b/.test(item) && /\btransaction\b/.test(item));
}

function hasPostSubmitObserveStateReadOnlyOperations(value: unknown): boolean {
  return stringArrayValues(value)
    .some(item => /\bread[- ]only\b/i.test(item) && /\bpeg[- ]out\b/i.test(item) && /\bstate\b/i.test(item));
}

function containsForbiddenPostSubmitObserveNodeBindingValue(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().replace(/\\/g, '/');
    return (
      isSharedSensitiveOrRuntimeEvidenceTarget(normalized) ||
      /\b(?:authorization|bearer|api[-_ ]?key|auth[-_ ]?header|secret|token|password|credential)\b/i.test(normalized) ||
      /^[a-z]:\//i.test(normalized)
    );
  }
  if (Array.isArray(value)) {
    return value.some(containsForbiddenPostSubmitObserveNodeBindingValue);
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([key]) => key !== 'ergoNodeUrl' && key !== 'noAuthHeader')
      .some(([key, child]) =>
        /^(?:authheader|authorization|apikey|token|secret|password|credential)$/i.test(key.replace(/[-_\s]/g, '')) ||
        containsForbiddenPostSubmitObserveNodeBindingValue(child),
      );
  }
  return false;
}

function containsForbiddenPostSubmitObserveStateBindingValue(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().replace(/\\/g, '/');
    return (
      isSharedSensitiveOrRuntimeEvidenceTarget(normalized) ||
      /\b(?:authorization|bearer|api[-_ ]?key|auth[-_ ]?header|secret|token|password|credential)\b/i.test(normalized) ||
      /^[a-z]:\//i.test(normalized)
    );
  }
  if (Array.isArray(value)) {
    return value.some(containsForbiddenPostSubmitObserveStateBindingValue);
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .filter(([key]) => key !== 'targetClass')
      .some(([key, child]) =>
        /^(?:authheader|authorization|apikey|token|secret|password|credential|runtimepath|statepath|dbpath)$/i.test(key.replace(/[-_\s]/g, '')) ||
        containsForbiddenPostSubmitObserveStateBindingValue(child),
      );
  }
  return false;
}

function validatePostSubmitObservationOutputShape(
  validation: PostSubmitObserveJsonValidationInput,
  prefix: string,
): string[] {
  const observation = isRecord(validation.observation)
    ? validation.observation
    : undefined;
  if (!observation) {
    return [`${prefix} must expose structured observation output shape`];
  }

  const issues: string[] = [];
  const txBinding = isRecord(observation.txBinding)
    ? observation.txBinding
    : undefined;
  const expectedTxId = normalizeTxId(validation.expectedTxId);
  const submittedTxId = normalizeTxId(validation.submittedTxId);
  const boundExpectedTxId = normalizeTxId(txBinding?.expectedTxId);
  const boundSubmittedTxId = normalizeTxId(txBinding?.submittedTxId);
  if (!boundExpectedTxId || !expectedTxId || boundExpectedTxId !== expectedTxId) {
    issues.push(`${prefix} observation.txBinding.expectedTxId must match Expected transaction ID`);
  }
  if (!boundSubmittedTxId || !submittedTxId || boundSubmittedTxId !== submittedTxId) {
    issues.push(`${prefix} observation.txBinding.submittedTxId must match submitted transaction ID`);
  }
  if (txBinding?.idsMatch !== true || (boundExpectedTxId && boundSubmittedTxId && boundExpectedTxId !== boundSubmittedTxId)) {
    issues.push(`${prefix} observation.txBinding must prove matching expected/submitted IDs`);
  }

  const observationConfirmation = isRecord(observation.confirmation)
    ? observation.confirmation
    : undefined;
  const rootConfirmation = isRecord(validation.confirmation)
    ? validation.confirmation
    : undefined;
  if (
    !observationConfirmation ||
    !isPositiveIntegerValue(observationConfirmation.count) ||
    !isPositiveIntegerValue(observationConfirmation.required) ||
    observationConfirmation.policyMet !== true ||
    Number(observationConfirmation.count) < Number(observationConfirmation.required)
  ) {
    issues.push(`${prefix} observation.confirmation policy must be met`);
  }
  if (!isConcreteArtifactEvidenceTarget(observationConfirmation?.finalityEvidenceArtifact)) {
    issues.push(`${prefix} observation.confirmation.finalityEvidenceArtifact must cite a completed artifact target`);
  }
  if (
    observationConfirmation &&
    rootConfirmation &&
    !postSubmitConfirmationsMatch(observationConfirmation, rootConfirmation)
  ) {
    issues.push(`${prefix} observation.confirmation must match root confirmation`);
  }

  const observationBoundaries = isRecord(observation.boundaries)
    ? observation.boundaries
    : undefined;
  const rootBoundaries = isRecord(validation.boundaries)
    ? validation.boundaries
    : undefined;
  if (!observationBoundaries || observationBoundaries.readOnlyObservation !== true) {
    issues.push(`${prefix} observation.boundaries.readOnlyObservation must be true`);
  }
  for (const field of POST_SUBMIT_FALSE_BOUNDARY_FIELDS) {
    if (!observationBoundaries || observationBoundaries[field] !== false) {
      issues.push(`${prefix} observation.boundaries.${field} must be false`);
    }
  }
  if (
    observationBoundaries &&
    rootBoundaries &&
    !postSubmitBoundariesMatch(observationBoundaries, rootBoundaries)
  ) {
    issues.push(`${prefix} observation.boundaries must match root boundaries`);
  }

  const burnOrder = normalizeTxIdArray(observation.burnOrder);
  const topLevelBurnOrder = normalizeTxIdArray(validation.burnOrder);
  if (!burnOrder || burnOrder.length === 0) {
    issues.push(`${prefix} observation.burnOrder must expose the submitted burn order`);
  } else if (hasDuplicateValues(burnOrder)) {
    issues.push(`${prefix} observation.burnOrder must not contain duplicates`);
  } else if (topLevelBurnOrder && !sameOrderedValues(burnOrder, topLevelBurnOrder)) {
    issues.push(`${prefix} observation.burnOrder must match top-level burnOrder`);
  }

  const observationLivePreflightBinding = isRecord(observation.livePreflightBinding)
    ? observation.livePreflightBinding
    : undefined;
  const rootLivePreflightBinding = isRecord(validation.livePreflightBinding)
    ? validation.livePreflightBinding
    : undefined;
  if (!observationLivePreflightBinding) {
    issues.push(`${prefix} observation.livePreflightBinding must be present`);
  } else {
    const observationTarget = typeof observationLivePreflightBinding.target === 'string'
      ? observationLivePreflightBinding.target
      : undefined;
    const rootTarget = typeof rootLivePreflightBinding?.target === 'string'
      ? rootLivePreflightBinding.target
      : undefined;
    if (
      !observationTarget ||
      !rootTarget ||
      normalizeEvidenceTarget(observationTarget) !== normalizeEvidenceTarget(rootTarget)
    ) {
      issues.push(`${prefix} observation.livePreflightBinding.target must match root livePreflightBinding.target`);
    }
    if (observationLivePreflightBinding.status !== 'GO') {
      issues.push(`${prefix} observation.livePreflightBinding.status must be GO`);
    }
    const observationBoundExpectedTxId = normalizeTxId(observationLivePreflightBinding.expectedTxId);
    if (!observationBoundExpectedTxId || !expectedTxId || observationBoundExpectedTxId !== expectedTxId) {
      issues.push(`${prefix} observation.livePreflightBinding.expectedTxId must match Expected transaction ID`);
    }
    const observationApprovedBurnTxHashes = normalizeTxIdArray(observationLivePreflightBinding.approvedBurnTxHashes);
    const rootApprovedBurnTxHashes = normalizeTxIdArray(rootLivePreflightBinding?.approvedBurnTxHashes);
    if (!observationApprovedBurnTxHashes || !burnOrder || !sameOrderedValues(observationApprovedBurnTxHashes, burnOrder)) {
      issues.push(`${prefix} observation.livePreflightBinding.approvedBurnTxHashes must match observation.burnOrder`);
    }
    if (observationApprovedBurnTxHashes && hasDuplicateValues(observationApprovedBurnTxHashes)) {
      issues.push(`${prefix} observation.livePreflightBinding.approvedBurnTxHashes must not contain duplicates`);
    }
    if (
      observationApprovedBurnTxHashes &&
      rootApprovedBurnTxHashes &&
      !sameOrderedValues(observationApprovedBurnTxHashes, rootApprovedBurnTxHashes)
    ) {
      issues.push(`${prefix} observation.livePreflightBinding.approvedBurnTxHashes must match root livePreflightBinding.approvedBurnTxHashes`);
    }
    if (observationLivePreflightBinding.runtimeBroadcastEnabled !== false) {
      issues.push(`${prefix} observation.livePreflightBinding.runtimeBroadcastEnabled must be false`);
    }
    if (observationLivePreflightBinding.preSubmitBoundaryPreserved !== true) {
      issues.push(`${prefix} observation.livePreflightBinding.preSubmitBoundaryPreserved must be true`);
    }
    if (observationLivePreflightBinding.authorizationEvidenceLinked !== true) {
      issues.push(`${prefix} observation.livePreflightBinding.authorizationEvidenceLinked must be true`);
    }
  }

  const settlementOutputs = isRecord(observation.settlementOutputs)
    ? observation.settlementOutputs
    : undefined;
  const settlementOutputBoxIds = normalizeTxIdArray(settlementOutputs?.boxIds);
  if (
    !settlementOutputs ||
    !isPositiveIntegerValue(settlementOutputs.outputCount) ||
    !settlementOutputBoxIds ||
    settlementOutputs.outputCount !== settlementOutputBoxIds.length
  ) {
    issues.push(`${prefix} observation.settlementOutputs must expose outputCount matching concrete boxIds`);
  } else if (burnOrder && settlementOutputBoxIds.length < burnOrder.length + 3) {
    issues.push(`${prefix} observation.settlementOutputs must include SPV, DUP, every payout, and miner fee outputs`);
  } else if (hasDuplicateValues(settlementOutputBoxIds)) {
    issues.push(`${prefix} observation.settlementOutputs.boxIds must not contain duplicates`);
  }

  const successors = isRecord(observation.successors)
    ? observation.successors
    : undefined;
  const spvTracker = isRecord(successors?.spvTracker)
    ? successors.spvTracker
    : undefined;
  const aggregateDup = isRecord(successors?.aggregateDup)
    ? successors.aggregateDup
    : undefined;
  const spvTrackerBoxId = normalizeTxId(spvTracker?.boxId);
  const aggregateDupBoxId = normalizeTxId(aggregateDup?.boxId);
  if (spvTracker?.outputIndex !== 0 || !spvTrackerBoxId) {
    issues.push(`${prefix} observation.successors.spvTracker must bind OUTPUTS(0)`);
  } else if (settlementOutputBoxIds && settlementOutputBoxIds[0] !== spvTrackerBoxId) {
    issues.push(`${prefix} observation.settlementOutputs.boxIds[0] must match SPV tracker successor`);
  }
  if (aggregateDup?.outputIndex !== 1 || !aggregateDupBoxId) {
    issues.push(`${prefix} observation.successors.aggregateDup must bind OUTPUTS(1)`);
  } else if (settlementOutputBoxIds && settlementOutputBoxIds[1] !== aggregateDupBoxId) {
    issues.push(`${prefix} observation.settlementOutputs.boxIds[1] must match aggregate DUP successor`);
  }

  const recipientPayouts = Array.isArray(observation.recipientPayouts)
    ? observation.recipientPayouts
    : undefined;
  const payoutOutputIndices: number[] = [];
  if (!recipientPayouts || recipientPayouts.length === 0) {
    issues.push(`${prefix} observation.recipientPayouts must be non-empty`);
  } else if (burnOrder && recipientPayouts.length !== burnOrder.length) {
    issues.push(`${prefix} observation.recipientPayouts length must match burnOrder length`);
  } else {
    recipientPayouts.forEach((payout, index) => {
      const record = isRecord(payout) ? payout : undefined;
      const burnTxId = normalizeTxId(record?.burnTxId);
      const payoutBoxId = normalizeTxId(record?.boxId);
      if (!record) {
        issues.push(`${prefix} observation.recipientPayouts[${index}] must be an object`);
        return;
      }
      if (!burnTxId || (burnOrder && burnTxId !== burnOrder[index])) {
        issues.push(`${prefix} observation.recipientPayouts[${index}].burnTxId must match burnOrder[${index}]`);
      }
      if (record.outputIndex !== 2 + index) {
        issues.push(`${prefix} observation.recipientPayouts[${index}].outputIndex must bind OUTPUTS(${2 + index})`);
      } else {
        payoutOutputIndices.push(record.outputIndex);
      }
      if (!payoutBoxId) {
        issues.push(`${prefix} observation.recipientPayouts[${index}].boxId must be a concrete box ID`);
      } else if (settlementOutputBoxIds && settlementOutputBoxIds[2 + index] !== payoutBoxId) {
        issues.push(`${prefix} observation.settlementOutputs.boxIds[${2 + index}] must match recipientPayouts[${index}].boxId`);
      }
    });
  }

  const aggregateUnlockChange = isRecord(observation.aggregateUnlockChange)
    ? observation.aggregateUnlockChange
    : undefined;
  if (settlementOutputBoxIds && burnOrder) {
    const noChangeOutputCount = burnOrder.length + 3;
    const withChangeOutputCount = burnOrder.length + 4;
    const changeIndex = 2 + burnOrder.length;
    if (settlementOutputBoxIds.length > noChangeOutputCount && !aggregateUnlockChange) {
      issues.push(`${prefix} observation.aggregateUnlockChange must bind the change output when present`);
    }
    if (settlementOutputBoxIds.length > withChangeOutputCount) {
      issues.push(`${prefix} observation.settlementOutputs must contain at most one aggregate unlock change output`);
    }
    if (aggregateUnlockChange) {
      const changeBoxId = normalizeTxId(aggregateUnlockChange.boxId);
      if (
        aggregateUnlockChange.outputIndex !== changeIndex ||
        !changeBoxId ||
        settlementOutputBoxIds[changeIndex] !== changeBoxId
      ) {
        issues.push(`${prefix} observation.aggregateUnlockChange must bind OUTPUTS(${changeIndex})`);
      }
      if (typeof aggregateUnlockChange.ergoTreeHex !== 'string' || !/^(?:0x)?[0-9a-f]+$/i.test(aggregateUnlockChange.ergoTreeHex)) {
        issues.push(`${prefix} observation.aggregateUnlockChange.ergoTreeHex must be hex`);
      }
      if (!isPositiveSafeIntegerLike(aggregateUnlockChange.valueNanoErg)) {
        issues.push(`${prefix} observation.aggregateUnlockChange.valueNanoErg must be a positive safe integer`);
      }
      if (aggregateUnlockChange.tokenless !== true) {
        issues.push(`${prefix} observation.aggregateUnlockChange.tokenless must be true`);
      }
    }
  }

  const minerFee = isRecord(observation.minerFee)
    ? observation.minerFee
    : undefined;
  const minerFeeBoxId = normalizeTxId(minerFee?.boxId);
  if (!minerFee || typeof minerFee.outputIndex !== 'number' || !minerFeeBoxId || !isPositiveSafeIntegerLike(minerFee.feeNanoErg)) {
    issues.push(`${prefix} observation.minerFee must bind final miner fee output boxId and feeNanoErg`);
  } else if (settlementOutputBoxIds) {
    const finalOutputIndex = settlementOutputBoxIds.length - 1;
    const maxPayoutOutputIndex = payoutOutputIndices.length > 0 ? Math.max(...payoutOutputIndices) : 1;
    if (minerFee.outputIndex !== finalOutputIndex || minerFee.outputIndex <= maxPayoutOutputIndex) {
      issues.push(`${prefix} observation.minerFee.outputIndex must bind the final output after payouts`);
    }
    if (settlementOutputBoxIds[finalOutputIndex] !== minerFeeBoxId) {
      issues.push(`${prefix} observation.minerFee.boxId must match the final settlement output`);
    }
  }

  return issues;
}

function postSubmitConfirmationsMatch(
  observationConfirmation: Record<string, unknown>,
  rootConfirmation: Record<string, unknown>,
): boolean {
  return observationConfirmation.policyMet === rootConfirmation.policyMet &&
    observationConfirmation.count === rootConfirmation.count &&
    observationConfirmation.required === rootConfirmation.required &&
    normalizeEvidenceTarget(String(observationConfirmation.finalityEvidenceArtifact ?? '')) ===
      normalizeEvidenceTarget(String(rootConfirmation.finalityEvidenceArtifact ?? ''));
}

function postSubmitBoundariesMatch(
  observationBoundaries: Record<string, unknown>,
  rootBoundaries: Record<string, unknown>,
): boolean {
  return observationBoundaries.readOnlyObservation === rootBoundaries.readOnlyObservation &&
    POST_SUBMIT_FALSE_BOUNDARY_FIELDS.every(field =>
      observationBoundaries[field] === rootBoundaries[field],
    );
}

function validateRecoveryObserveProvenanceSummary(
  validation: RecoveryObserveJsonValidationInput,
  expectedKind: TestnetRecoveryDrillKind,
  prefix: string,
): string[] {
  const issues: string[] = [];

  if (!normalizeTxId(validation.pegOutBurnTxId)) {
    issues.push(`${prefix} pegOutBurnTxId must be 32-byte hex`);
  }
  if (expectedKind === 'failed-broadcast-phantom-avl') {
    if (!normalizeTxId(validation.expectedTxId)) {
      issues.push(`${prefix} expectedTxId must be 32-byte hex for failed-broadcast-phantom-avl recovery`);
    }
    if (validation.singletonInventoryId !== undefined) {
      issues.push(`${prefix} singletonInventoryId must be absent for failed-broadcast-phantom-avl recovery`);
    }
  }
  if (expectedKind === 'reorged-burn-stale-singleton') {
    if (!normalizeTxId(validation.singletonInventoryId)) {
      issues.push(`${prefix} singletonInventoryId must be 32-byte hex for reorged-burn-stale-singleton recovery`);
    }
    if (validation.expectedTxId !== undefined) {
      issues.push(`${prefix} expectedTxId must be absent for reorged-burn-stale-singleton recovery`);
    }
  }

  const boundary = isRecord(validation.observationBoundary)
    ? validation.observationBoundary
    : undefined;
  if (!boundary) {
    issues.push(`${prefix} must expose observationBoundary provenance`);
  } else {
    if (boundary.readOnlyObservationOnly !== true) {
      issues.push(`${prefix} observationBoundary.readOnlyObservationOnly must be true`);
    }
    if (boundary.nodeQueryPerformed !== true) {
      issues.push(`${prefix} observationBoundary.nodeQueryPerformed must be true`);
    }
    if (boundary.stateReadPerformed !== true) {
      issues.push(`${prefix} observationBoundary.stateReadPerformed must be true`);
    }
    for (const field of RECOVERY_OBSERVE_FALSE_BOUNDARY_FIELDS) {
      if (boundary[field] !== false) {
        issues.push(`${prefix} observationBoundary.${field} must be false`);
      }
    }
  }

  const sourceBindings = isRecord(validation.sourceBindings)
    ? validation.sourceBindings
    : undefined;
  const nodeBinding = isRecord(sourceBindings?.node)
    ? sourceBindings.node
    : undefined;
  if (
    !nodeBinding ||
    nodeBinding.sourceType !== 'live-read-only-node' ||
    nodeBinding.readOnly !== true ||
    nodeBinding.noAuthHeader !== true ||
    !isIsoUtcTimestamp(nodeBinding.observedAt) ||
    !isNonNegativeSafeIntegerValue(nodeBinding.nodeHeight) ||
    !identifiesPositiveTestnetNetwork(nodeBinding.nodeNetwork) ||
    containsForbiddenRecoverySourceBindingValue(nodeBinding)
  ) {
    issues.push(`${prefix} sourceBindings.node must prove live-read-only-node read-only provenance`);
  }

  const stateBinding = isRecord(sourceBindings?.state)
    ? sourceBindings.state
    : undefined;
  if (
    !stateBinding ||
    stateBinding.sourceType !== 'read-only-state-tracker' ||
    stateBinding.readOnly !== true ||
    stateBinding.runtimePathSerialized !== false ||
    stateBinding.targetClass !== 'operator-provided-state-db' ||
    containsForbiddenRecoverySourceBindingValue(stateBinding)
  ) {
    issues.push(`${prefix} sourceBindings.state must prove read-only-state-tracker operator-provided-state-db provenance without serialized runtime paths`);
  }

  return issues;
}

function validateOfflineGateProvenanceSummary(
  validation: OfflineGateJsonValidationInput,
  options: ReleaseGateEvaluationOptions,
  prefix: string,
): string[] {
  const issues: string[] = [];
  const targetBindings = isRecord(validation.targetBindings)
    ? validation.targetBindings
    : undefined;
  const offlineGateTarget = typeof targetBindings?.offlineGate === 'string'
    ? targetBindings.offlineGate
    : undefined;
  if (
    !offlineGateTarget ||
    !isConcreteJsonEvidenceTarget(offlineGateTarget) ||
    normalizeEvidenceTarget(offlineGateTarget) !== normalizeEvidenceTarget(validation.target)
  ) {
    issues.push(`${prefix} targetBindings.offlineGate must match the validated offline-gate JSON target`);
  }
  if (hasShellUnsafeTargetContent(offlineGateTarget)) {
    issues.push(`${prefix} targetBindings.offlineGate must not contain whitespace or shell metacharacters`);
  }

  const sourceBindings = isRecord(validation.sourceBindings)
    ? validation.sourceBindings
    : undefined;
  if (sourceBindings && containsForbiddenSourceBindingPayloadValue(sourceBindings)) {
    issues.push(`${prefix} sourceBindings must not serialize auth, secret, runtime, state, or database payloads`);
  }
  issues.push(...validateOfflineGateStageAndLineSummary(
    validation,
    sourceBindings,
    prefix,
  ));

  const requiredBindings = [
    'prebroadcast',
    'rehearsalPreflight',
    'windowPrep',
    'freshCheckpoint',
  ];
  for (const bindingName of requiredBindings) {
    const binding = sourceBindings?.[bindingName];
    if (!isRecord(binding)) {
      issues.push(`${prefix} must expose sourceBindings.${bindingName} provenance`);
      continue;
    }
    if (binding.source !== 'path') {
      issues.push(`${prefix} sourceBindings.${bindingName}.source must be path`);
    }
    if (!isConcreteJsonEvidenceTarget(binding.target)) {
      issues.push(`${prefix} sourceBindings.${bindingName}.target must cite a concrete non-template JSON target`);
    }
    if (hasShellUnsafeTargetContent(binding.target)) {
      issues.push(`${prefix} sourceBindings.${bindingName}.target must not contain whitespace or shell metacharacters`);
    }
  }

  const freshCheckpointBinding = isRecord(sourceBindings?.freshCheckpoint)
    ? sourceBindings.freshCheckpoint
    : undefined;
  const boundFreshCheckpointTarget = typeof freshCheckpointBinding?.target === 'string'
    ? freshCheckpointBinding.target
    : undefined;
  const actualFreshCheckpointTarget = options.freshCheckpointJsonValidation?.target;
  if (
    boundFreshCheckpointTarget &&
    actualFreshCheckpointTarget &&
    normalizeEvidenceTarget(boundFreshCheckpointTarget) !== normalizeEvidenceTarget(actualFreshCheckpointTarget)
  ) {
    issues.push(`${prefix} sourceBindings.freshCheckpoint.target must match actual fresh checkpoint JSON validation target`);
  }

  const prebroadcastBinding = isRecord(sourceBindings?.prebroadcast)
    ? sourceBindings.prebroadcast
    : undefined;
  const boundPrebroadcastTarget = typeof prebroadcastBinding?.target === 'string'
    ? prebroadcastBinding.target
    : undefined;
  const prepSourceBindings = isRecord(options.prepBundleJsonValidation?.sourceBindings)
    ? options.prepBundleJsonValidation.sourceBindings
    : undefined;
  const prepOfflineGateBinding = isRecord(prepSourceBindings?.offlineGate)
    ? prepSourceBindings.offlineGate
    : undefined;
  const prepOfflineGateInputs = isRecord(prepOfflineGateBinding?.inputs)
    ? prepOfflineGateBinding.inputs
    : undefined;
  const prepPrebroadcastTarget = typeof prepOfflineGateInputs?.prebroadcast === 'string'
    ? prepOfflineGateInputs.prebroadcast
    : undefined;
  if (
    boundPrebroadcastTarget &&
    prepPrebroadcastTarget &&
    normalizeEvidenceTarget(boundPrebroadcastTarget) !== normalizeEvidenceTarget(prepPrebroadcastTarget)
  ) {
    issues.push(`${prefix} sourceBindings.prebroadcast.target must match actual prep-bundle sourceBindings.offlineGate.inputs.prebroadcast`);
  }

  return issues;
}

function validateOfflineGateStageAndLineSummary(
  validation: OfflineGateJsonValidationInput,
  sourceBindings: Record<string, unknown> | undefined,
  prefix: string,
): string[] {
  const stages = Array.isArray(validation.stages) ? validation.stages : undefined;
  const lines = stringArrayValues(validation.lines);
  if (!stages || lines.length === 0) {
    return [`${prefix} must expose structured stages and no-broadcast lines provenance`];
  }

  const issues: string[] = [];
  for (const stage of stages) {
    if (!isRecord(stage)) {
      issues.push(`${prefix} stages entries must be structured objects`);
      continue;
    }
    if (
      typeof stage.name !== 'string' ||
      !OFFLINE_GATE_REQUIRED_STAGE_CONFIGS.some(config => config.name === stage.name)
    ) {
      issues.push(`${prefix} stages must not contain unexpected entries`);
    }
  }

  for (const config of OFFLINE_GATE_REQUIRED_STAGE_CONFIGS) {
    const matches = stages.filter(stage => isRecord(stage) && stage.name === config.name);
    if (matches.length === 0) {
      issues.push(`${prefix} stages.${config.name} must be present`);
      continue;
    }
    if (matches.length > 1) {
      issues.push(`${prefix} stages.${config.name} must be unique`);
    }

    const stage = matches[0];
    if (!isRecord(stage)) continue;
    const status = typeof stage.status === 'string'
      ? stage.status.trim().toUpperCase()
      : undefined;
    if (!status || !config.passStatuses.includes(status)) {
      issues.push(`${prefix} stages.${config.name}.status must be PASS-equivalent`);
    }
    if (stage.passEquivalent !== true) {
      issues.push(`${prefix} stages.${config.name}.passEquivalent must be true`);
    }
    if (stage.source !== 'path') {
      issues.push(`${prefix} stages.${config.name}.source must be path`);
    }
    const stageTarget = typeof stage.target === 'string' ? stage.target : undefined;
    if (!isConcreteJsonEvidenceTarget(stageTarget)) {
      issues.push(`${prefix} stages.${config.name}.target must cite a concrete non-template JSON target`);
    }
    if (hasShellUnsafeTargetContent(stageTarget)) {
      issues.push(`${prefix} stages.${config.name}.target must not contain whitespace or shell metacharacters`);
    }

    const bindingValue = sourceBindings?.[config.name];
    const binding = isRecord(bindingValue)
      ? bindingValue
      : undefined;
    const bindingTarget = typeof binding?.target === 'string'
      ? binding.target
      : undefined;
    if (
      stageTarget &&
      bindingTarget &&
      isConcreteJsonEvidenceTarget(stageTarget) &&
      isConcreteJsonEvidenceTarget(bindingTarget) &&
      normalizeEvidenceTarget(stageTarget) !== normalizeEvidenceTarget(bindingTarget)
    ) {
      issues.push(`${prefix} stages.${config.name}.target must match sourceBindings.${config.name}.target`);
    }
  }

  const joinedLines = lines.join('\n');
  const normalizedJoinedLines = normalizeEvidenceMarkerText(joinedLines);
  if (!/\boffline scope:\s*artifact validation only;\s*no broadcast command executed\b/i.test(joinedLines)) {
    issues.push(`${prefix} lines must preserve the no-broadcast offline scope`);
  }
  if (!/\bproceed only to explicit live rehearsal approval collection\b/i.test(joinedLines)) {
    issues.push(`${prefix} lines must preserve the explicit live approval handoff`);
  }
  if (hasUnresolvedIssueMarker(normalizedJoinedLines)) {
    issues.push(`${prefix} PASS lines must not contain remaining issues`);
  }
  return issues;
}

const OFFLINE_GATE_REQUIRED_STAGE_CONFIGS: ReadonlyArray<{
  name: string;
  passStatuses: readonly string[];
}> = [
  {
    name: 'prebroadcast',
    passStatuses: ['PASS'],
  },
  {
    name: 'rehearsalPreflight',
    passStatuses: ['PASS', 'GO'],
  },
  {
    name: 'windowPrep',
    passStatuses: ['PASS', 'CREATED'],
  },
  {
    name: 'freshCheckpoint',
    passStatuses: ['CREATED'],
  },
] as const;

function validatePrepBundleProvenanceSummary(
  validation: PrepBundleJsonValidationInput,
  options: ReleaseGateEvaluationOptions,
  prefix: string,
): string[] {
  const issues: string[] = [];
  if (validation.executionStatus !== 'QUARANTINED') {
    issues.push(`${prefix} executionStatus must be QUARANTINED`);
  }
  const artifactTargets = isRecord(validation.artifactTargets)
    ? validation.artifactTargets
    : undefined;
  if (!artifactTargets) {
    issues.push(`${prefix} must expose artifactTargets provenance`);
  }

  const prebroadcastTarget = typeof artifactTargets?.prebroadcast === 'string'
    ? artifactTargets.prebroadcast
    : undefined;
  if (typeof prebroadcastTarget !== 'string' || !isConcreteEvidenceTarget(prebroadcastTarget)) {
    issues.push(`${prefix} artifactTargets.prebroadcast must cite a concrete non-template prebroadcast evidence target`);
  }

  const approvalsTarget = typeof artifactTargets?.approvals === 'string'
    ? artifactTargets.approvals
    : undefined;
  if (typeof approvalsTarget !== 'string' || !isConcreteJsonEvidenceTarget(approvalsTarget)) {
    issues.push(`${prefix} artifactTargets.approvals must cite a concrete non-template JSON approvals target`);
  }

  issues.push(...validateDistinctPrepBundleArtifactTargets(artifactTargets, prefix));

  const sourceBindings = isRecord(validation.sourceBindings)
    ? validation.sourceBindings
    : undefined;
  if (!sourceBindings) {
    issues.push(`${prefix} must expose sourceBindings provenance`);
  } else if (containsForbiddenSourceBindingPayloadValue(sourceBindings)) {
    issues.push(`${prefix} sourceBindings must not serialize auth, secret, runtime, state, or database payloads`);
  }

  const freshCheckpointTarget = typeof artifactTargets?.freshCheckpoint === 'string'
    ? artifactTargets.freshCheckpoint
    : undefined;
  const hasConcreteFreshCheckpointTarget = typeof freshCheckpointTarget === 'string' &&
    isConcreteJsonEvidenceTarget(freshCheckpointTarget);
  if (!hasConcreteFreshCheckpointTarget) {
    issues.push(`${prefix} artifactTargets.freshCheckpoint must cite a concrete non-template JSON target`);
  } else if (
    options.freshCheckpointJsonValidation &&
    normalizeEvidenceTarget(freshCheckpointTarget) !==
      normalizeEvidenceTarget(options.freshCheckpointJsonValidation.target)
  ) {
    issues.push(`${prefix} artifactTargets.freshCheckpoint must match actual fresh checkpoint JSON validation target`);
  }

  const offlineGateTarget = typeof artifactTargets?.offlineGate === 'string'
    ? artifactTargets.offlineGate
    : undefined;
  const hasConcreteOfflineGateTarget = typeof offlineGateTarget === 'string' &&
    isConcreteJsonEvidenceTarget(offlineGateTarget);
  if (!hasConcreteOfflineGateTarget) {
    issues.push(`${prefix} artifactTargets.offlineGate must cite a concrete non-template JSON target`);
  } else if (
    options.offlineGateJsonValidation &&
    normalizeEvidenceTarget(offlineGateTarget) !==
      normalizeEvidenceTarget(options.offlineGateJsonValidation.target)
  ) {
    issues.push(`${prefix} artifactTargets.offlineGate must match actual offline-gate JSON validation target`);
  }

  const doctorTarget = typeof artifactTargets?.doctor === 'string'
    ? artifactTargets.doctor
    : undefined;
  if (typeof doctorTarget !== 'string' || !isConcreteJsonEvidenceTarget(doctorTarget)) {
    issues.push(`${prefix} artifactTargets.doctor must cite a concrete non-template JSON target`);
  }

  const preflightTarget = typeof artifactTargets?.preflight === 'string'
    ? artifactTargets.preflight
    : undefined;
  if (typeof preflightTarget !== 'string' || !isConcreteJsonEvidenceTarget(preflightTarget)) {
    issues.push(`${prefix} artifactTargets.preflight must cite a concrete non-template JSON target`);
  }

  const windowPrepTarget = typeof artifactTargets?.windowPrep === 'string'
    ? artifactTargets.windowPrep
    : undefined;
  if (typeof windowPrepTarget !== 'string' || !isConcreteJsonEvidenceTarget(windowPrepTarget)) {
    issues.push(`${prefix} artifactTargets.windowPrep must cite a concrete non-template JSON target`);
  }

  issues.push(...validatePrepBundlePreparedSourceBinding(
    sourceBindings?.freshCheckpoint,
    'freshCheckpoint',
    'fresh-testnet-check',
    freshCheckpointTarget,
    prefix,
  ));
  issues.push(...validatePrepBundlePreparedSourceBinding(
    sourceBindings?.offlineGate,
    'offlineGate',
    'offline-gate',
    offlineGateTarget,
    prefix,
  ));
  if (isRecord(sourceBindings?.offlineGate)) {
    const offlineInputs = isRecord(sourceBindings.offlineGate.inputs)
      ? sourceBindings.offlineGate.inputs
      : undefined;
    if (!offlineInputs) {
      issues.push(`${prefix} sourceBindings.offlineGate.inputs must be present`);
    } else {
      issues.push(...validatePrepBundleInputBinding(
        offlineInputs.prebroadcast,
        doctorTarget,
        'prebroadcast',
        prefix,
        'doctor',
      ));
      issues.push(...validatePrepBundleInputBinding(
        offlineInputs.rehearsalPreflight,
        preflightTarget,
        'rehearsalPreflight',
        prefix,
        'preflight',
      ));
      issues.push(...validatePrepBundleInputBinding(
        offlineInputs.windowPrep,
        windowPrepTarget,
        'windowPrep',
        prefix,
        'windowPrep',
      ));
      issues.push(...validatePrepBundleInputBinding(
        offlineInputs.freshCheckpoint,
        freshCheckpointTarget,
        'freshCheckpoint',
        prefix,
      ));
    }
  }

  issues.push(...validatePrepBundleGateBoundary(validation.gateBoundary, prefix));
  issues.push(...validatePrepBundlePreparedCommands(validation.preparedCommands, prefix));
  issues.push(...validatePrepBundleNextHandoff(
    validation.nextHandoff,
    validation.preparedCommands,
    prefix,
  ));
  issues.push(...validatePrepBundleStageStatuses(validation.stageStatuses, prefix));

  return issues;
}

function validateDistinctPrepBundleArtifactTargets(
  artifactTargets: Record<string, unknown> | undefined,
  prefix: string,
): string[] {
  if (!artifactTargets) return [];

  const issues: string[] = [];
  const seenTargets = new Map<string, string>();
  const fields = [
    'prebroadcast',
    'approvals',
    'doctor',
    'preflight',
    'windowPrep',
    'offlineGate',
    'freshCheckpoint',
  ] as const;

  for (const field of fields) {
    const target = artifactTargets[field];
    if (typeof target !== 'string' || !isConcreteEvidenceTarget(target)) continue;

    const normalized = normalizeEvidenceTarget(target);
    const previous = seenTargets.get(normalized);
    if (previous) {
      issues.push(`${prefix} artifactTargets target ${target} is reused by ${previous} and ${field}`);
      continue;
    }
    seenTargets.set(normalized, field);
  }

  return issues;
}

function validatePrepBundleGateBoundary(
  boundary: unknown,
  prefix: string,
): string[] {
  if (!isRecord(boundary)) {
    return [`${prefix} must expose gateBoundary provenance`];
  }

  const issues: string[] = [];
  for (const field of PREP_BUNDLE_FALSE_GATE_BOUNDARY_FIELDS) {
    if (boundary[field] !== false) {
      issues.push(`${prefix} gateBoundary.${field} must be false`);
    }
  }
  return issues;
}

function validatePrepBundlePreparedCommands(
  commands: unknown,
  prefix: string,
): string[] {
  if (!Array.isArray(commands)) {
    return [`${prefix} must expose preparedCommands provenance`];
  }

  const issues: string[] = [];
  const byLabel = new Map<string, Record<string, unknown>>();
  for (const command of commands) {
    if (!isRecord(command)) {
      issues.push(`${prefix} preparedCommands entries must be objects`);
      continue;
    }
    const label = typeof command.label === 'string' ? command.label : '';
    if (label.length === 0) {
      issues.push(`${prefix} preparedCommands entry label must be present`);
      continue;
    }
    if (byLabel.has(label)) {
      issues.push(`${prefix} preparedCommands.${label} must be unique`);
      continue;
    }
    byLabel.set(label, command);
  }

  for (const label of PREP_BUNDLE_PREPARED_COMMAND_LABELS) {
    const command = byLabel.get(label);
    if (!command) {
      issues.push(`${prefix} preparedCommands.${label} must be present`);
      continue;
    }
    issues.push(...validatePrepBundlePreparedCommand(label, command, prefix));
  }
  for (const label of byLabel.keys()) {
    if (!PREP_BUNDLE_PREPARED_COMMAND_LABELS.includes(label as typeof PREP_BUNDLE_PREPARED_COMMAND_LABELS[number])) {
      issues.push(`${prefix} preparedCommands.${label} is not an expected prepared command`);
    }
  }
  return issues;
}

function validatePrepBundlePreparedCommand(
  label: typeof PREP_BUNDLE_PREPARED_COMMAND_LABELS[number],
  command: Record<string, unknown>,
  prefix: string,
): string[] {
  const issues: string[] = [];
  const expectedPhase = label === 'legacy-v1-live-preflight-quarantine'
    ? 'blocked-live-settlement'
    : 'offline-preparation';
  if (command.phase !== expectedPhase) {
    issues.push(`${prefix} preparedCommands.${label}.phase must be ${expectedPhase}`);
  }
  if (command.broadcastCommand !== false) {
    issues.push(`${prefix} preparedCommands.${label}.broadcastCommand must be false`);
  }
  if (command.requiresExplicitLiveBroadcastApproval !== false) {
    issues.push(`${prefix} preparedCommands.${label} must not require live broadcast approval`);
  }

  const commandText = typeof command.command === 'string' ? command.command : '';
  if (commandText.trim().length === 0) {
    issues.push(`${prefix} preparedCommands.${label}.command must be present`);
  }
  if (/\b(?:BRIDGE_BROADCAST_ENABLED\s*=\s*true|live-submit|settlement:submit|aggregate:submit|submit-batch)\b/i.test(commandText)) {
    issues.push(`${prefix} preparedCommands.${label}.command must remain non-broadcast preparation only`);
  }
  if (label === 'legacy-v1-live-preflight-quarantine' && commandText !== LEGACY_V1_SUBMISSION_STATUS) {
    issues.push(`${prefix} preparedCommands.${label}.command must be the standard legacy V1 quarantine status`);
  }
  return issues;
}

function identifiesPositiveLocalDevnetNetwork(value: unknown): boolean {
  if (typeof value !== 'string' || hasForbiddenNetworkWording(value)) return false;
  return /\b(?:local|patched[- ]?devnet|devnet|non[- ]?main[- ]?net)\b/i.test(value);
}

function validatePrepBundleNextHandoff(
  nextHandoff: unknown,
  preparedCommands: unknown,
  prefix: string,
): string[] {
  if (!isRecord(nextHandoff)) {
    return [`${prefix} must expose nextHandoff provenance`];
  }

  const issues: string[] = [];
  if (nextHandoff.label !== 'external-fee-profile-activation-prerequisites') {
    issues.push(`${prefix} nextHandoff.label must be external-fee-profile-activation-prerequisites`);
  }
  if (nextHandoff.phase !== 'blocked-live-settlement') {
    issues.push(`${prefix} nextHandoff.phase must be blocked-live-settlement`);
  }
  if (nextHandoff.requiresExplicitLiveBroadcastApproval !== false) {
    issues.push(`${prefix} nextHandoff must not require live broadcast approval`);
  }
  if (nextHandoff.broadcastCommand !== false) {
    issues.push(`${prefix} nextHandoff.broadcastCommand must be false`);
  }
  if (nextHandoff.reportAuthorizesBroadcast !== false) {
    issues.push(`${prefix} nextHandoff.reportAuthorizesBroadcast must be false`);
  }

  const quarantineCommand = Array.isArray(preparedCommands)
    ? preparedCommands.find(command =>
      isRecord(command) &&
      command.label === 'legacy-v1-live-preflight-quarantine' &&
      typeof command.command === 'string')
    : undefined;
  if (
    isRecord(quarantineCommand) &&
    typeof quarantineCommand.command === 'string' &&
    nextHandoff.command !== quarantineCommand.command
  ) {
    issues.push(`${prefix} nextHandoff.command must match preparedCommands.legacy-v1-live-preflight-quarantine`);
  }

  if ('targetBindings' in nextHandoff) {
    issues.push(`${prefix} nextHandoff must not carry live execution target bindings`);
  }

  if (!sameStringArray(nextHandoff.requiredEvidenceBeforeUse, PREP_BUNDLE_NEXT_HANDOFF_REQUIRED_EVIDENCE)) {
    issues.push(`${prefix} nextHandoff.requiredEvidenceBeforeUse must list replacement-profile activation evidence`);
  }
  if (!sameStringArray(nextHandoff.forbiddenBeforeUse, PREP_BUNDLE_NEXT_HANDOFF_FORBIDDEN_BEFORE_USE)) {
    issues.push(`${prefix} nextHandoff.forbiddenBeforeUse must quarantine legacy V1 execution and claim escalation`);
  }
  return issues;
}

function validatePrepBundleStageStatuses(
  stageStatuses: unknown,
  prefix: string,
): string[] {
  if (!isRecord(stageStatuses)) {
    return [`${prefix} must expose stageStatuses provenance`];
  }

  const issues: string[] = [];
  if (stageStatuses.preflight !== 'GO') {
    issues.push(`${prefix} stageStatuses.preflight must be GO`);
  }
  if (stageStatuses.windowPrep !== 'CREATED') {
    issues.push(`${prefix} stageStatuses.windowPrep must be CREATED`);
  }
  if (stageStatuses.draft !== 'CREATED') {
    issues.push(`${prefix} stageStatuses.draft must be CREATED`);
  }
  if (stageStatuses.freshCheckpoint !== 'LINKED') {
    issues.push(`${prefix} stageStatuses.freshCheckpoint must be LINKED`);
  }
  if (stageStatuses.recoveryRows !== 'PASS' && stageStatuses.recoveryRows !== 'NOT_PROVIDED') {
    issues.push(`${prefix} stageStatuses.recoveryRows must be PASS or NOT_PROVIDED`);
  }
  return issues;
}

function sameStringArray(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index]);
}

function validatePrepBundlePreparedSourceBinding(
  binding: unknown,
  bindingName: 'freshCheckpoint' | 'offlineGate',
  commandLabel: 'fresh-testnet-check' | 'offline-gate',
  expectedTarget: string | undefined,
  prefix: string,
): string[] {
  const issues: string[] = [];
  if (!isRecord(binding)) {
    return [`${prefix} must expose sourceBindings.${bindingName} provenance`];
  }
  if (binding.source !== 'prepared-command') {
    issues.push(`${prefix} sourceBindings.${bindingName}.source must be prepared-command`);
  }
  if (binding.commandLabel !== commandLabel) {
    issues.push(`${prefix} sourceBindings.${bindingName}.commandLabel must be ${commandLabel}`);
  }
  const target = typeof binding.target === 'string' ? binding.target : undefined;
  if (typeof target !== 'string' || !isConcreteJsonEvidenceTarget(target)) {
    issues.push(`${prefix} sourceBindings.${bindingName}.target must cite a concrete non-template JSON target`);
  } else if (
    expectedTarget &&
    normalizeEvidenceTarget(target) !== normalizeEvidenceTarget(expectedTarget)
  ) {
    issues.push(`${prefix} sourceBindings.${bindingName}.target must match artifactTargets.${bindingName}`);
  }
  return issues;
}

function validatePrepBundleInputBinding(
  target: unknown,
  expectedTarget: string | undefined,
  inputName: string,
  prefix: string,
  expectedArtifactName = inputName,
): string[] {
  if (typeof target !== 'string' || !isConcreteJsonEvidenceTarget(target)) {
    return [`${prefix} sourceBindings.offlineGate.inputs.${inputName} must cite a concrete non-template JSON target`];
  }
  if (
    expectedTarget &&
    normalizeEvidenceTarget(target) !== normalizeEvidenceTarget(expectedTarget)
  ) {
    return [`${prefix} sourceBindings.offlineGate.inputs.${inputName} must match artifactTargets.${expectedArtifactName}`];
  }
  return [];
}

function validateWindowPrepStructuredSummary(
  validation: WindowPrepJsonValidationInput,
  options: ReleaseGateEvaluationOptions,
  prefix: string,
): string[] {
  const targetBindings = isRecord(validation.targetBindings)
    ? validation.targetBindings
    : undefined;
  const packages = Array.isArray(validation.packages) ? validation.packages : undefined;
  const networkScope = isRecord(validation.networkScope)
    ? validation.networkScope
    : undefined;
  const heightBoundary = isRecord(validation.heightBoundary)
    ? validation.heightBoundary
    : undefined;
  const gateBoundary = isRecord(validation.gateBoundary)
    ? validation.gateBoundary
    : undefined;
  const nextHandoff = isRecord(validation.nextHandoff)
    ? validation.nextHandoff
    : undefined;
  const lines = stringArrayValues(validation.lines);

  if (
    !targetBindings ||
    !packages ||
    packages.length === 0 ||
    !networkScope ||
    !heightBoundary ||
    !gateBoundary ||
    !nextHandoff ||
    lines.length === 0
  ) {
    return [
      `${prefix} must expose structured targetBindings, packages, networkScope, heightBoundary, gateBoundary, nextHandoff, and no-broadcast lines provenance`,
    ];
  }

  const issues: string[] = [];
  if (validation.reportStatus !== 'CREATED') {
    issues.push(`${prefix} reportStatus must be CREATED`);
  }
  if (validation.executionStatus !== 'QUARANTINED') {
    issues.push(`${prefix} executionStatus must be QUARANTINED`);
  }

  issues.push(...validateConcretePreflightTargetBinding(
    targetBindings.prebroadcast,
    `${prefix} targetBindings.prebroadcast`,
  ));
  issues.push(...validateConcreteJsonTargetBinding(
    targetBindings.approvals,
    `${prefix} targetBindings.approvals`,
  ));
  issues.push(...validatePreflightPackageRows(packages, `${prefix} packages`));
  issues.push(...validateWindowPrepBindingsAgainstLifecycle(validation, options, prefix));
  issues.push(...validateWindowPrepNetworkScopeSummary(networkScope, prefix));
  issues.push(...validateWindowPrepHeightBoundarySummary(heightBoundary, packages, prefix));
  issues.push(...validateWindowPrepGateBoundarySummary(gateBoundary, prefix));
  issues.push(...validateWindowPrepNextHandoffSummary(nextHandoff, targetBindings, prefix));

  const joinedLines = lines.join('\n');
  if (!/\bdoes not authorize broadcast\b/i.test(joinedLines)) {
    issues.push(`${prefix} lines must preserve the no-broadcast window-prep boundary`);
  }
  if (
    typeof validation.markdown === 'string' &&
    validation.markdown.trim().length > 0 &&
    !/\bdoes not authorize broadcast\b/i.test(validation.markdown)
  ) {
    issues.push(`${prefix} markdown must preserve the no-broadcast window-prep boundary`);
  }
  return issues;
}

function validateWindowPrepBindingsAgainstLifecycle(
  validation: WindowPrepJsonValidationInput,
  options: ReleaseGateEvaluationOptions,
  prefix: string,
): string[] {
  const issues: string[] = [];
  const prepArtifactTargets = isRecord(options.prepBundleJsonValidation?.artifactTargets)
    ? options.prepBundleJsonValidation.artifactTargets
    : undefined;
  const prepSourceBindings = isRecord(options.prepBundleJsonValidation?.sourceBindings)
    ? options.prepBundleJsonValidation.sourceBindings
    : undefined;
  const offlineSourceBindings = isRecord(options.offlineGateJsonValidation?.sourceBindings)
    ? options.offlineGateJsonValidation.sourceBindings
    : undefined;
  const offlineStages = Array.isArray(options.offlineGateJsonValidation?.stages)
    ? options.offlineGateJsonValidation.stages
    : undefined;
  const targetBindings = isRecord(validation.targetBindings)
    ? validation.targetBindings
    : undefined;
  issues.push(...validateTargetMatchIfPresent(
    validation.target,
    prepArtifactTargets?.windowPrep,
    `${prefix} target must match actual prep-bundle artifactTargets.windowPrep`,
  ));
  const offlineInputs = isRecord(prepSourceBindings?.offlineGate)
    ? (isRecord(prepSourceBindings.offlineGate.inputs) ? prepSourceBindings.offlineGate.inputs : undefined)
    : undefined;
  issues.push(...validateTargetMatchIfPresent(
    validation.target,
    offlineInputs?.windowPrep,
    `${prefix} target must match actual prep-bundle sourceBindings.offlineGate.inputs.windowPrep`,
  ));
  issues.push(...validateTargetMatchIfPresent(
    validation.target,
    isRecord(offlineSourceBindings?.windowPrep)
      ? offlineSourceBindings.windowPrep.target
      : undefined,
    `${prefix} target must match actual offline-gate sourceBindings.windowPrep.target`,
  ));
  const offlineStageTarget = offlineStages
    ?.find(stage => isRecord(stage) && stage.name === 'windowPrep');
  issues.push(...validateTargetMatchIfPresent(
    validation.target,
    isRecord(offlineStageTarget) ? offlineStageTarget.target : undefined,
    `${prefix} target must match actual offline-gate stages.windowPrep.target`,
  ));
  issues.push(...validateTargetMatchIfPresent(
    targetBindings?.prebroadcast,
    prepArtifactTargets?.prebroadcast,
    `${prefix} targetBindings.prebroadcast must match actual prep-bundle artifactTargets.prebroadcast`,
  ));
  issues.push(...validateTargetMatchIfPresent(
    targetBindings?.approvals,
    prepArtifactTargets?.approvals,
    `${prefix} targetBindings.approvals must match actual prep-bundle artifactTargets.approvals`,
  ));
  issues.push(...validatePreflightPackageLifecycleBinding(validation.packages, options, prefix));
  return issues;
}

function validatePreflightPackageRows(packages: unknown[], prefix: string): string[] {
  const issues: string[] = [];
  for (const [index, pkg] of packages.entries()) {
    if (!isRecord(pkg)) {
      issues.push(`${prefix}[${index}] must be a structured object`);
      continue;
    }
    if (!isConcreteJsonEvidenceTarget(pkg.target)) {
      issues.push(`${prefix}[${index}].target must cite a concrete non-template aggregate JSON target`);
    }
    if (typeof pkg.command !== 'string' || pkg.command.trim().length === 0) {
      issues.push(`${prefix}[${index}].command must be present`);
    }
    if (!['single', 'single-with-ingest', 'batch'].includes(String(pkg.mode))) {
      issues.push(`${prefix}[${index}].mode must be single, single-with-ingest, or batch`);
    }
    if (!normalizeTxId(pkg.expectedTxId)) {
      issues.push(`${prefix}[${index}].expectedTxId must be a 32-byte hex transaction ID`);
    }
    if (!normalizeTxIdArray(pkg.burnTxHashes)) {
      issues.push(`${prefix}[${index}].burnTxHashes must be a non-empty 32-byte hex array`);
    }
    if (!normalizeTxIdArray(pkg.sidechainHeaderHashHexes)) {
      issues.push(`${prefix}[${index}].sidechainHeaderHashHexes must be a non-empty 32-byte hex array`);
    }
    if (!normalizeTxIdArray(pkg.bridgeEventRootHexes)) {
      issues.push(`${prefix}[${index}].bridgeEventRootHexes must be a non-empty 32-byte hex array`);
    }
    if (!isNonEmptySafeIntegerArray(pkg.ergoAnchorHeights)) {
      issues.push(`${prefix}[${index}].ergoAnchorHeights must be a non-empty safe integer array`);
    }
    if (!isNonEmptySafeIntegerArray(pkg.sidechainBlockHeights)) {
      issues.push(`${prefix}[${index}].sidechainBlockHeights must be a non-empty safe integer array`);
    }
    if (!normalizeTxId(pkg.deployedStateHash)) {
      issues.push(`${prefix}[${index}].deployedStateHash must be a 32-byte deployment-state hash`);
    }
  }
  return issues;
}

function validatePreflightPackageLifecycleBinding(
  packages: unknown[] | undefined,
  options: ReleaseGateEvaluationOptions,
  prefix: string,
): string[] {
  if (!Array.isArray(packages) || packages.length === 0) return [];
  const structuredPackages = packages.filter(isRecord);
  const packageExpectedTxIds = structuredPackages
    .map(pkg => normalizeTxId(pkg.expectedTxId))
    .filter((value): value is string => value !== undefined);
  const packageBurnSets = structuredPackages
    .map(pkg => normalizeTxIdArray(pkg.burnTxHashes))
    .filter((value): value is string[] => value !== undefined);
  const packageSidechainHeaderHashSets = structuredPackages
    .map(pkg => normalizeTxIdArray(pkg.sidechainHeaderHashHexes))
    .filter((value): value is string[] => value !== undefined);
  const packageBridgeEventRootSets = structuredPackages
    .map(pkg => normalizeTxIdArray(pkg.bridgeEventRootHexes))
    .filter((value): value is string[] => value !== undefined);
  const packageErgoAnchorHeightSets = structuredPackages
    .map(pkg => normalizeNonNegativeSafeIntegerArray(pkg.ergoAnchorHeights))
    .filter((value): value is number[] => value !== undefined);
  const packageSidechainBlockHeightSets = structuredPackages
    .map(pkg => normalizeNonNegativeSafeIntegerArray(pkg.sidechainBlockHeights))
    .filter((value): value is number[] => value !== undefined);

  const issues: string[] = [];
  const aggregateExpectedTxId = normalizeTxId(options.aggregatePrebroadcastJsonValidation?.expectedTxId);
  const liveExpectedTxId = normalizeTxId(options.livePreflightJsonValidation?.expectedTxId);
  if (aggregateExpectedTxId && !packageExpectedTxIds.includes(aggregateExpectedTxId)) {
    issues.push(`${prefix} packages must include actual aggregate prebroadcast Expected transaction ID`);
  }
  if (liveExpectedTxId && !packageExpectedTxIds.includes(liveExpectedTxId)) {
    issues.push(`${prefix} packages must include actual live-preflight Expected transaction ID`);
  }

  const aggregateClaims = Array.isArray(options.aggregatePrebroadcastJsonValidation?.claims)
    ? structuredRowObjects(options.aggregatePrebroadcastJsonValidation.claims)
    : undefined;
  const aggregateBurnSet = normalizeTxIdArray(
    aggregateClaims?.map(claim => claim.burnTxHash),
  );
  const aggregateSidechainHeaderHashes = normalizeTxIdArray(
    aggregateClaims?.map(claim => claim.sidechainHeaderHashHex),
  );
  const aggregateBridgeEventRoots = normalizeTxIdArray(
    aggregateClaims?.map(claim => claim.bridgeEventRootHex),
  );
  const aggregateErgoAnchorHeights = normalizeAggregateClaimIntegerArray(
    aggregateClaims?.map(claim => claim.ergoAnchorHeight),
  );
  const aggregateSidechainBlockHeights = normalizeAggregateClaimIntegerArray(
    aggregateClaims?.map(claim => claim.sidechainBlockHeight),
  );
  const liveApprovalBinding = isRecord(options.livePreflightJsonValidation?.approvalBinding)
    ? options.livePreflightJsonValidation.approvalBinding
    : undefined;
  const liveBurnSet = normalizeTxIdArray(liveApprovalBinding?.burnTxHashes);
  if (aggregateBurnSet && !packageBurnSets.some(burnSet => sameStringArray(burnSet, aggregateBurnSet))) {
    issues.push(`${prefix} packages burnTxHashes must match actual aggregate prebroadcast claim order`);
  }
  if (
    aggregateSidechainHeaderHashes &&
    !packageSidechainHeaderHashSets.some(headerSet => sameOrderedValues(headerSet, aggregateSidechainHeaderHashes))
  ) {
    issues.push(`${prefix} packages sidechainHeaderHashHexes must match actual aggregate prebroadcast claim order`);
  }
  if (
    aggregateBridgeEventRoots &&
    !packageBridgeEventRootSets.some(rootSet => sameOrderedValues(rootSet, aggregateBridgeEventRoots))
  ) {
    issues.push(`${prefix} packages bridgeEventRootHexes must match actual aggregate prebroadcast claim order`);
  }
  if (
    aggregateErgoAnchorHeights &&
    !packageErgoAnchorHeightSets.some(heightSet => sameOrderedNumberValues(heightSet, aggregateErgoAnchorHeights))
  ) {
    issues.push(`${prefix} packages ergoAnchorHeights must match actual aggregate prebroadcast claim order`);
  }
  if (
    aggregateSidechainBlockHeights &&
    !packageSidechainBlockHeightSets.some(heightSet => sameOrderedNumberValues(heightSet, aggregateSidechainBlockHeights))
  ) {
    issues.push(`${prefix} packages sidechainBlockHeights must match actual aggregate prebroadcast claim order`);
  }
  if (liveBurnSet && !packageBurnSets.some(burnSet => sameStringArray(burnSet, liveBurnSet))) {
    issues.push(`${prefix} packages burnTxHashes must match actual live-preflight approval burn set`);
  }
  return issues;
}

function validateWindowPrepNetworkScopeSummary(
  networkScope: Record<string, unknown>,
  prefix: string,
): string[] {
  const issues: string[] = [];
  const ergoNodeNetwork = typeof networkScope.ergoNodeNetwork === 'string'
    ? networkScope.ergoNodeNetwork
    : '';
  const sidechainNetwork = typeof networkScope.sidechainNetwork === 'string'
    ? networkScope.sidechainNetwork
    : '';
  if (networkScope.environment !== 'testnet') {
    issues.push(`${prefix} networkScope.environment must be testnet`);
  }
  if (!identifiesPositiveTestnetNetworkForWindowPrep(ergoNodeNetwork)) {
    issues.push(`${prefix} networkScope.ergoNodeNetwork must positively identify testnet`);
  }
  if (!identifiesAllowedSidechainNetwork(sidechainNetwork)) {
    issues.push(`${prefix} networkScope.sidechainNetwork must identify patched-devnet, testnet, or non-mainnet`);
  }
  if (networkScope.broadcastEnabled !== false) {
    issues.push(`${prefix} networkScope.broadcastEnabled must be false`);
  }
  return issues;
}

function validateWindowPrepHeightBoundarySummary(
  heightBoundary: Record<string, unknown>,
  packages: unknown[],
  prefix: string,
): string[] {
  const issues: string[] = [];
  const currentErgoHeight = normalizeNonNegativeSafeInteger(heightBoundary.currentErgoHeight);
  const currentSidechainHeight = normalizeNonNegativeSafeInteger(heightBoundary.currentSidechainHeight);
  const maxPreflightErgoAnchorHeight = normalizeNonNegativeSafeInteger(heightBoundary.maxPreflightErgoAnchorHeight);
  const maxPreflightSidechainBlockHeight = normalizeNonNegativeSafeInteger(heightBoundary.maxPreflightSidechainBlockHeight);
  const packageErgoAnchorHeight = maxSafeIntegerFromPackages(packages, 'ergoAnchorHeights');
  const packageSidechainBlockHeight = maxSafeIntegerFromPackages(packages, 'sidechainBlockHeights');
  const currentDeployedStateHash = normalizeTxId(heightBoundary.currentDeployedStateHash);
  const boundaryPackageHash = normalizeTxId(heightBoundary.packageDeployedStateHash);
  const packageHashes = [...new Set(packages
    .filter(isRecord)
    .map(pkg => normalizeTxId(pkg.deployedStateHash))
    .filter((value): value is string => value !== undefined))];
  const packageHash = packageHashes.length === 1 ? packageHashes[0] : undefined;

  if (currentErgoHeight === undefined) {
    issues.push(`${prefix} heightBoundary.currentErgoHeight must be a non-negative safe integer`);
  }
  if (currentSidechainHeight === undefined) {
    issues.push(`${prefix} heightBoundary.currentSidechainHeight must be a non-negative safe integer`);
  }
  if (maxPreflightErgoAnchorHeight === undefined) {
    issues.push(`${prefix} heightBoundary.maxPreflightErgoAnchorHeight must be a non-negative safe integer`);
  } else if (packageErgoAnchorHeight === undefined || maxPreflightErgoAnchorHeight !== packageErgoAnchorHeight) {
    issues.push(`${prefix} heightBoundary.maxPreflightErgoAnchorHeight must match package Ergo anchor height`);
  }
  if (maxPreflightSidechainBlockHeight === undefined) {
    issues.push(`${prefix} heightBoundary.maxPreflightSidechainBlockHeight must be a non-negative safe integer`);
  } else if (
    packageSidechainBlockHeight === undefined ||
    maxPreflightSidechainBlockHeight !== packageSidechainBlockHeight
  ) {
    issues.push(`${prefix} heightBoundary.maxPreflightSidechainBlockHeight must match package sidechain block height`);
  }
  if (
    currentErgoHeight !== undefined &&
    maxPreflightErgoAnchorHeight !== undefined &&
    currentErgoHeight < maxPreflightErgoAnchorHeight
  ) {
    issues.push(`${prefix} heightBoundary.currentErgoHeight must be greater than or equal to maxPreflightErgoAnchorHeight`);
  }
  if (
    currentSidechainHeight !== undefined &&
    maxPreflightSidechainBlockHeight !== undefined &&
    currentSidechainHeight < maxPreflightSidechainBlockHeight
  ) {
    issues.push(`${prefix} heightBoundary.currentSidechainHeight must be greater than or equal to maxPreflightSidechainBlockHeight`);
  }
  if (!packageHash) {
    issues.push(`${prefix} packages must agree on deployedStateHash`);
  }
  if (!boundaryPackageHash || boundaryPackageHash !== packageHash) {
    issues.push(`${prefix} heightBoundary.packageDeployedStateHash must match package deployedStateHash`);
  }
  if (!currentDeployedStateHash || currentDeployedStateHash !== packageHash) {
    issues.push(`${prefix} heightBoundary.currentDeployedStateHash must match package deployedStateHash`);
  }
  return issues;
}

function validateWindowPrepGateBoundarySummary(
  gateBoundary: Record<string, unknown>,
  prefix: string,
): string[] {
  const requiredFalseFields = [
    'reportAuthorizesBroadcast',
    'broadcastAuthorized',
    'liveSubmitPerformed',
    'confirmationObserved',
    'reconciliationPerformed',
    'gate3ClosureAllowed',
    'productionReadyClaimAllowed',
    'testnetProductionCandidateClaimAllowed',
  ] as const;
  return requiredFalseFields.flatMap(field =>
    gateBoundary[field] === false
      ? []
      : [`${prefix} gateBoundary.${field} must be false`],
  );
}

function validateWindowPrepNextHandoffSummary(
  nextHandoff: Record<string, unknown>,
  _targetBindings: Record<string, unknown>,
  prefix: string,
): string[] {
  const issues: string[] = [];
  if (nextHandoff.label !== 'external-fee-profile-activation-prerequisites') {
    issues.push(`${prefix} nextHandoff.label must be external-fee-profile-activation-prerequisites`);
  }
  if (nextHandoff.phase !== 'blocked-live-settlement') {
    issues.push(`${prefix} nextHandoff.phase must be blocked-live-settlement`);
  }
  if (nextHandoff.requiresExplicitLiveBroadcastApproval !== false) {
    issues.push(`${prefix} nextHandoff must not require live broadcast approval`);
  }
  if (nextHandoff.broadcastCommand !== false) {
    issues.push(`${prefix} nextHandoff.broadcastCommand must be false`);
  }
  if (nextHandoff.reportAuthorizesBroadcast !== false) {
    issues.push(`${prefix} nextHandoff.reportAuthorizesBroadcast must be false`);
  }

  if (nextHandoff.command !== LEGACY_V1_SUBMISSION_STATUS) {
    issues.push(`${prefix} nextHandoff.command must be the standard legacy V1 quarantine status`);
  }
  if ('targetBindings' in nextHandoff) {
    issues.push(`${prefix} nextHandoff must not carry live execution target bindings`);
  }
  if (!sameStringArray(nextHandoff.requiredEvidenceBeforeUse, PREP_BUNDLE_NEXT_HANDOFF_REQUIRED_EVIDENCE)) {
    issues.push(`${prefix} nextHandoff.requiredEvidenceBeforeUse must list replacement-profile activation evidence`);
  }
  if (!sameStringArray(nextHandoff.forbiddenBeforeUse, PREP_BUNDLE_NEXT_HANDOFF_FORBIDDEN_BEFORE_USE)) {
    issues.push(`${prefix} nextHandoff.forbiddenBeforeUse must quarantine legacy V1 execution and claim escalation`);
  }
  return issues;
}

function validateConcretePreflightTargetBinding(value: unknown, label: string): string[] {
  return isConcreteEvidenceTarget(value)
    ? []
    : [`${label} must cite a concrete non-template evidence target`];
}

function validateConcreteJsonTargetBinding(value: unknown, label: string): string[] {
  return isConcreteJsonEvidenceTarget(value)
    ? []
    : [`${label} must cite a concrete non-template JSON target`];
}

function validateTargetMatchIfPresent(
  actual: unknown,
  expected: unknown,
  message: string,
): string[] {
  if (typeof actual !== 'string' || typeof expected !== 'string') return [];
  return normalizeEvidenceTarget(actual) === normalizeEvidenceTarget(expected)
    ? []
    : [message];
}

function isNonEmptySafeIntegerArray(value: unknown): boolean {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every(item => normalizeNonNegativeSafeInteger(item) !== undefined);
}

function normalizeNonNegativeSafeIntegerArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const values = value.map(normalizeNonNegativeSafeInteger);
  return values.every((item): item is number => item !== undefined)
    ? values
    : undefined;
}

function normalizeAggregateClaimIntegerArray(value: unknown[] | undefined): number[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const values = value.map(normalizeNonNegativeSafeInteger);
  return values.every((item): item is number => item !== undefined)
    ? values
    : undefined;
}

function sameOrderedNumberValues(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeNonNegativeSafeInteger(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const raw = String(value);
  if (!/^\d+$/.test(raw)) return undefined;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function maxSafeIntegerFromPackages(
  packages: unknown[],
  field: 'ergoAnchorHeights' | 'sidechainBlockHeights',
): number | undefined {
  const values = packages
    .filter(isRecord)
    .flatMap(pkg => Array.isArray(pkg[field]) ? pkg[field] : [])
    .map(normalizeNonNegativeSafeInteger)
    .filter((value): value is number => value !== undefined);
  return values.length > 0 ? Math.max(...values) : undefined;
}

function identifiesPositiveTestnetNetworkForWindowPrep(value: string): boolean {
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
  const normalized = normalizeEvidenceMarkerText(value);
  const valueWithoutNonMainnet = normalized.replace(/\bnon[- ]?main[- ]?net\b/gi, '');
  return (
    /\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/i.test(valueWithoutNonMainnet) ||
    /\b(?:non[- ]?test[- ]?net|no|not|without|missing|absent|unavailable|unconnected|disconnected)\b.{0,80}\btest[- ]?net\b/i.test(normalized) ||
    /\btest[- ]?net\b.{0,80}\b(?:not|missing|absent|unavailable|unconnected|disconnected)\b/i.test(normalized)
  );
}

function validateFreshCheckpointHeightEvidenceSourceBinding(
  binding: unknown,
  prefix: string,
): string[] {
  if (!isRecord(binding)) {
    return [`${prefix} must expose sourceBindings.heightEvidence provenance`];
  }

  const issues: string[] = [];
  const mode = binding.mode;
  if (mode !== 'live-read-only-sources' && mode !== 'provided-json') {
    issues.push(`${prefix} sourceBindings.heightEvidence.mode must be live-read-only-sources or provided-json`);
  }
  if (mode === 'live-read-only-sources') {
    if (binding.readOnlyErgoNodeClient !== true) {
      issues.push(`${prefix} sourceBindings.heightEvidence.readOnlyErgoNodeClient must be true`);
    }
    if (binding.readOnlySidechainRpcClient !== true) {
      issues.push(`${prefix} sourceBindings.heightEvidence.readOnlySidechainRpcClient must be true`);
    }
    if (binding.nodeAuthHeader !== 'not-used') {
      issues.push(`${prefix} sourceBindings.heightEvidence.nodeAuthHeader must be not-used`);
    }
    issues.push(...validateFreshCheckpointReadOnlyUrlBinding(
      binding.ergoNodeUrl,
      `${prefix} sourceBindings.heightEvidence.ergoNodeUrl`,
    ));
    issues.push(...validateFreshCheckpointReadOnlyUrlBinding(
      binding.sidechainRpcUrl,
      `${prefix} sourceBindings.heightEvidence.sidechainRpcUrl`,
    ));
    const operations = stringArrayValues(binding.operations).map(value => value.toLowerCase());
    if (
      !operations.some(operation => operation.includes('/info')) ||
      !operations.some(operation => operation.includes('getblocknumber'))
    ) {
      issues.push(`${prefix} sourceBindings.heightEvidence.operations must cite /info and getBlockNumber`);
    }
    issues.push(...validateFreshCheckpointReadOnlyOperations(
      binding.operations,
      `${prefix} sourceBindings.heightEvidence.operations`,
    ));
  }
  if (mode === 'provided-json') {
    if (!isConcreteJsonEvidenceTarget(binding.target)) {
      issues.push(`${prefix} sourceBindings.heightEvidence.target must cite a concrete non-template height evidence JSON target`);
    }
    if (binding.readOnlyErgoNodeClient !== false) {
      issues.push(`${prefix} sourceBindings.heightEvidence.readOnlyErgoNodeClient must be false for provided-json`);
    }
    if (binding.readOnlySidechainRpcClient !== false) {
      issues.push(`${prefix} sourceBindings.heightEvidence.readOnlySidechainRpcClient must be false for provided-json`);
    }
    if (binding.nodeAuthHeader !== 'not-applicable') {
      issues.push(`${prefix} sourceBindings.heightEvidence.nodeAuthHeader must be not-applicable for provided-json`);
    }
    if (stringArrayValues(binding.operations).length > 0) {
      issues.push(`${prefix} sourceBindings.heightEvidence.operations must be empty for provided-json`);
    }
  }
  if (binding.broadcastEnabled !== false) {
    issues.push(`${prefix} sourceBindings.heightEvidence.broadcastEnabled must be false`);
  }
  return issues;
}

function validateFreshCheckpointSingletonSourceBinding(
  binding: unknown,
  prefix: string,
): string[] {
  if (!isRecord(binding)) {
    return [`${prefix} must expose sourceBindings.singletonCheckpoint provenance`];
  }

  const issues: string[] = [];
  const mode = binding.mode;
  if (mode !== 'live-read-only-node' && mode !== 'provided-json') {
    issues.push(`${prefix} sourceBindings.singletonCheckpoint.mode must be live-read-only-node or provided-json`);
  }
  if (mode === 'live-read-only-node') {
    if (binding.readOnlyNodeClient !== true) {
      issues.push(`${prefix} sourceBindings.singletonCheckpoint.readOnlyNodeClient must be true`);
    }
    if (binding.nodeAuthHeader !== 'not-used') {
      issues.push(`${prefix} sourceBindings.singletonCheckpoint.nodeAuthHeader must be not-used`);
    }
    issues.push(...validateFreshCheckpointReadOnlyUrlBinding(
      binding.ergoNodeUrl,
      `${prefix} sourceBindings.singletonCheckpoint.ergoNodeUrl`,
    ));
    const operations = stringArrayValues(binding.operations).map(value => value.toLowerCase());
    if (
      !operations.some(operation => operation.includes('/info')) ||
      !operations.some(operation => operation.includes('singleton boxes')) ||
      !operations.some(operation => operation.includes('mempool') || operation.includes('unconfirmed')) ||
      !operations.some(operation => operation.includes('confirmed transaction'))
    ) {
      issues.push(`${prefix} sourceBindings.singletonCheckpoint.operations must cite /info, singleton boxes, mempool/unconfirmed lookup, and confirmed transaction lookup`);
    }
    issues.push(...validateFreshCheckpointReadOnlyOperations(
      binding.operations,
      `${prefix} sourceBindings.singletonCheckpoint.operations`,
    ));
  }
  if (mode === 'provided-json') {
    if (!isConcreteJsonEvidenceTarget(binding.target)) {
      issues.push(`${prefix} sourceBindings.singletonCheckpoint.target must cite a concrete non-template singleton checkpoint JSON target`);
    }
    if (binding.readOnlyNodeClient !== false) {
      issues.push(`${prefix} sourceBindings.singletonCheckpoint.readOnlyNodeClient must be false for provided-json`);
    }
    if (binding.nodeAuthHeader !== 'not-applicable') {
      issues.push(`${prefix} sourceBindings.singletonCheckpoint.nodeAuthHeader must be not-applicable for provided-json`);
    }
    if (stringArrayValues(binding.operations).length > 0) {
      issues.push(`${prefix} sourceBindings.singletonCheckpoint.operations must be empty for provided-json`);
    }
  }
  return issues;
}

function validateFreshCheckpointAnchorSourceBinding(
  binding: unknown,
  prefix: string,
): string[] {
  if (!isRecord(binding)) {
    return [`${prefix} must expose sourceBindings.anchorObservations provenance`];
  }

  const issues: string[] = [];
  if (binding.mode !== 'live-read-only-node') {
    issues.push(`${prefix} sourceBindings.anchorObservations.mode must be live-read-only-node`);
  }
  if (binding.readOnlyNodeClient !== true) {
    issues.push(`${prefix} sourceBindings.anchorObservations.readOnlyNodeClient must be true`);
  }
  if (binding.nodeAuthHeader !== 'not-used') {
    issues.push(`${prefix} sourceBindings.anchorObservations.nodeAuthHeader must be not-used`);
  }
  issues.push(...validateFreshCheckpointReadOnlyUrlBinding(
    binding.ergoNodeUrl,
    `${prefix} sourceBindings.anchorObservations.ergoNodeUrl`,
  ));
  const operations = stringArrayValues(binding.operations).map(value => value.toLowerCase());
  if (
    !operations.some(operation => operation.includes('/info')) ||
    !operations.some(operation => operation.includes('extension fields')) ||
    !operations.some(operation => operation.includes('0x0401'))
  ) {
    issues.push(`${prefix} sourceBindings.anchorObservations.operations must cite /info, extension fields, and 0x0401 matching`);
  }
  issues.push(...validateFreshCheckpointReadOnlyOperations(
    binding.operations,
    `${prefix} sourceBindings.anchorObservations.operations`,
  ));
  return issues;
}

function validateFreshCheckpointReadOnlyOperations(value: unknown, label: string): string[] {
  const issues = validateStringArrayEntries(value, label);
  if (stringArrayValues(value).some(hasUnsafeFreshCheckpointOperationMarker)) {
    issues.push(`${label} must not include signing, submission, broadcast, or mutation operations`);
  }
  return issues;
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
    isSharedSensitiveOrRuntimeEvidenceTarget(normalized)
  );
}

function isSharedSensitiveOrRuntimeEvidenceTarget(normalizedTarget: string): boolean {
  return evidenceTargetInspectionVariants(normalizedTarget).some(isSharedSensitiveOrRuntimeEvidenceInspectionTarget);
}

function isSharedSensitiveOrRuntimeEvidenceInspectionTarget(normalizedTarget: string): boolean {
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

function validateStringArrayEntries(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) return [];
  return value.some(item => typeof item !== 'string')
    ? [`${label} entries must be strings`]
    : [];
}

function hasUnsafeFreshCheckpointOperationMarker(value: string): boolean {
  return /\b(?:broadcast(?:ed|ing|s)?|submit(?:ted|ting|s)?|submission|sign(?:ed|ing|s|ature)?|send(?:ing|s)?|spend(?:ing|s)?|mutat(?:e|ed|es|ing|ion)|write(?:s|n|ing)?|post(?:ed|ing)?|put|delete|patch|repair(?:ed|ing)?|reconcile(?:d|s|ing|iation)?|state\s*(?:update|mutation)|node\s*mutation)\b/i.test(
    normalizeEvidenceMarkerText(value),
  );
}

function isConcreteJsonEvidenceTarget(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = normalizeEvidenceTarget(value);
  return (
    normalized.length > 0 &&
    /\.json$/i.test(normalized) &&
    !hasShellUnsafeTargetContent(value) &&
    isCompletedEvidenceTarget(normalized) &&
    !isLocalOnlyEvidenceTarget(normalized) &&
    !/[<>]/.test(normalized) &&
    !/(template|example|sample)/i.test(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized) &&
    !isSharedSensitiveOrRuntimeEvidenceTarget(normalized)
  );
}

function hasShellUnsafeTargetContent(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value !== value.trim()) return true;
  const normalized = value.replace(/\\/g, '/');
  if (/^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._/-]+$/i.test(normalized)) {
    return false;
  }
  return !/^[A-Za-z0-9._/-]+$/.test(normalized);
}

function isConcreteEvidenceTarget(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const normalized = normalizeEvidenceTarget(value);
  return (
    normalized.length > 0 &&
    isCompletedEvidenceTarget(normalized) &&
    !isLocalOnlyEvidenceTarget(normalized) &&
    !/[<>]/.test(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized)
  );
}

function isConcreteArtifactEvidenceTarget(value: unknown): boolean {
  return typeof value === 'string' &&
    /^artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s<>]+$/i.test(value) &&
    isConcreteEvidenceTarget(value);
}

function hasNonConcreteEvidenceTargetSegment(value: string): boolean {
  const normalized = normalizeEvidenceTarget(value);
  return normalized
    .split(/[\\/]+/)
    .some(segment => isNonConcreteEvidenceTargetSegment(segment));
}

function isLocalOnlyEvidenceTarget(value: string): boolean {
  const normalized = normalizeEvidenceTarget(value).replace(/\\/g, '/');
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

function isNonConcreteEvidenceTargetSegment(segment: string): boolean {
  const normalized = segment.toLowerCase().replace(/\.[a-z0-9]+$/i, '');
  if (
    /(?:^|[-_.])(?:sample|example|template)(?:[-_.](?:backup|restore|snapshot|state|wal|shm|digest|stop|condition|reconstructibility|boundaries)|$)/i.test(normalized)
  ) {
    return true;
  }
  if (
    /(?:^|[-_.])(?:sample|example|template)(?:[-_.](?:clean|checkout|ci|workflow|command|decision|npm|wasm|rust|lockfile|release|note|notes|checklist|gate|branch|commit|structural|threat|model|matrix|risk|attack|chain|mitigation|claim|claims|boundary|boundaries|classification)|$)/i.test(normalized)
  ) {
    return true;
  }
  return (
    /(?:^|[-_.])(?:not[-_]?completed|uncompleted)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])template(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|benchmark|metric|metrics|single|batch|settlement|sharded|lane|bottleneck|pre[-_.]?broadcast|non[-_.]?broadcast|release|note|notes|publication|blocker|blockers|required|allowed|checklist|security|review|scope|finding|findings|negative|operator|readiness|runbook|command|drill|decision|integration|entry|entrypoint|fresh|checkout|governance|committee|rotation|threshold|positive|trust|assumption|assumptions|trustless|burn|commitment|component|local|vector|report|spv|dup|avl|inclusion|addendum|architecture|manual|gate|phase|phase007|claim|claims|boundary|signer|signing|broadcast|policy|status|context[-_.]?extension|guard|deployment[-_.]?state|height|ergo|sidechain|transaction|transactions|expected[-_.]?tx|approval|approvals|daemon|aggregate|package|mempool|runtime|dry[-_.]?run|shape|signoff|network|reconfirmation|scoped[-_.]?shell|lifecycle|live|preflight|rehearsal|devnet|testnet|peg[-_.]?in|peg[-_.]?out|anchor|submit|submission|confirmation|reconciliation|clean|singleton|checkpoint|recovery|failed[-_.]?broadcast|reorg(?:ed)?|stale|logs|cleanup|dependency|dependencies|triage|vulnerability|vulnerabilities|audit|npm|cargo|rust|tree|lockfile|lockfiles|fleet|sdk|ergo[-_.]?lib|sigma[-_.]?rust|serializer|sqlite|evm|toolchain|upgrade|pinning)|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:placeholder|generic|todo|tbd)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])(?:fixture|mock|dummy|fake|stub|testdata|synthetic|simulated)(?:[-_.]|$)/i.test(normalized) ||
    /(?:^|[-_.])sample(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|benchmark|metric|metrics|single|batch|settlement|sharded|lane|bottleneck|pre[-_.]?broadcast|non[-_.]?broadcast|release|note|notes|publication|blocker|blockers|required|allowed|checklist|security|review|scope|finding|findings|negative|operator|readiness|runbook|command|drill|decision|integration|entry|entrypoint|fresh|checkout|governance|committee|rotation|threshold|positive|trust|assumption|assumptions|trustless|burn|commitment|component|local|vector|report|spv|dup|avl|inclusion|addendum|architecture|manual|gate|phase|phase007|claim|claims|boundary|signer|signing|broadcast|policy|status|context[-_.]?extension|guard|deployment[-_.]?state|height|ergo|sidechain|transaction|transactions|expected[-_.]?tx|approval|approvals|daemon|aggregate|package|mempool|runtime|dry[-_.]?run|shape|signoff|network|reconfirmation|scoped[-_.]?shell|lifecycle|live|preflight|rehearsal|devnet|testnet|peg[-_.]?in|peg[-_.]?out|anchor|submit|submission|confirmation|reconciliation|clean|singleton|checkpoint|recovery|failed[-_.]?broadcast|reorg(?:ed)?|stale|logs|cleanup|dependency|dependencies|triage|vulnerability|vulnerabilities|audit|npm|cargo|rust|tree|lockfile|lockfiles|fleet|sdk|ergo[-_.]?lib|sigma[-_.]?rust|serializer|sqlite|evm|toolchain|upgrade|pinning)|$)/i.test(normalized) ||
    /(?:^|[-_.])example(?:[-_.](?:proof|evidence|artifact|target|log|run|check|update|validator|benchmark|metric|metrics|single|batch|settlement|sharded|lane|bottleneck|pre[-_.]?broadcast|non[-_.]?broadcast|release|note|notes|publication|blocker|blockers|required|allowed|checklist|security|review|scope|finding|findings|negative|operator|readiness|runbook|command|drill|decision|integration|entry|entrypoint|fresh|checkout|governance|committee|rotation|threshold|positive|trust|assumption|assumptions|trustless|burn|commitment|component|local|vector|report|spv|dup|avl|inclusion|addendum|architecture|manual|gate|phase|phase007|claim|claims|boundary|signer|signing|broadcast|policy|status|context[-_.]?extension|guard|deployment[-_.]?state|height|ergo|sidechain|transaction|transactions|expected[-_.]?tx|approval|approvals|daemon|aggregate|package|mempool|runtime|dry[-_.]?run|shape|signoff|network|reconfirmation|scoped[-_.]?shell|lifecycle|live|preflight|rehearsal|devnet|testnet|peg[-_.]?in|peg[-_.]?out|anchor|submit|submission|confirmation|reconciliation|clean|singleton|checkpoint|recovery|failed[-_.]?broadcast|reorg(?:ed)?|stale|logs|cleanup|dependency|dependencies|triage|vulnerability|vulnerabilities|audit|npm|cargo|rust|tree|lockfile|lockfiles|fleet|sdk|ergo[-_.]?lib|sigma[-_.]?rust|serializer|sqlite|evm|toolchain|upgrade|pinning)|$)/i.test(normalized)
  );
}

function validateFreshCheckpointReadOnlyUrlBinding(value: unknown, label: string): string[] {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [`${label} must cite a concrete read-only http(s) URL`];
  }
  const normalized = value.trim().toLowerCase();
  if (/[<>]/.test(normalized) || /\b(?:template|example|sample|generic|placeholder|todo|tbd)\b/.test(normalized)) {
    return [`${label} must cite a concrete non-template read-only http(s) URL`];
  }
  return validateReadOnlyNodeUrl(value, label);
}

function stringArrayValues(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item)) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidatedAssemblyReportJsonTargetLinked(requiredResolution: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (!isConcreteJsonEvidenceTarget(target)) return false;
  const payload = checkedEvidencePayload(requiredResolution);
  return evidenceSegments(payload)
    .filter(isRehearsalAssemblyEvidenceSegment)
    .flatMap(segment => extractEvidenceTargets(assemblyReportOutputEvidenceText(segment)))
    .map(normalizeEvidenceTarget)
    .filter(candidate => isConcreteJsonEvidenceTarget(candidate))
    .includes(normalizedTarget);
}

function isValidatedPrepBundleJsonTargetLinked(requiredResolution: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (!isConcreteJsonEvidenceTarget(target)) return false;
  const payload = checkedEvidencePayload(requiredResolution);
  return evidenceSegments(payload)
    .filter(isRehearsalPrepBundleEvidenceSegment)
    .flatMap(segment => extractEvidenceTargets(prepBundleOutputEvidenceText(segment)))
    .map(normalizeEvidenceTarget)
    .filter(candidate => isConcreteJsonEvidenceTarget(candidate))
    .includes(normalizedTarget);
}

function isValidatedOfflineGateJsonTargetLinked(requiredResolution: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (!isConcreteJsonEvidenceTarget(target)) return false;
  const payload = checkedEvidencePayload(requiredResolution);
  return evidenceSegments(payload)
    .filter(isRehearsalOfflineGateEvidenceSegment)
    .flatMap(segment => extractEvidenceTargets(offlineGateOutputEvidenceText(segment)))
    .map(normalizeEvidenceTarget)
    .filter(candidate => isConcreteJsonEvidenceTarget(candidate))
    .includes(normalizedTarget);
}

function isValidatedRecoveryObserveJsonTargetLinked(
  requiredResolution: string,
  target: string,
  expectedKind: TestnetRecoveryDrillKind,
): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (!isConcreteJsonEvidenceTarget(target)) return false;
  const payload = checkedEvidencePayload(requiredResolution);
  const completedTargets = extractCompletedRecoveryObserveJsonTargets(payload, expectedKind)
    .map(normalizeEvidenceTarget)
    .filter(candidate => isConcreteJsonEvidenceTarget(candidate));
  if (!completedTargets.includes(normalizedTarget)) return false;

  return recoveryObserveValidationEvidenceSegments(payload, expectedKind).some(segment =>
    hasPositiveRecoveryObserveValidationResult(segment) &&
    hasRecoveryObserveValidationTargetBinding(segment, normalizedTarget)
  );
}

function isValidatedAggregatePrebroadcastJsonTargetLinked(
  requiredResolution: string,
  target: string,
  options: ReleaseGateEvaluationOptions,
): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (!isConcreteJsonEvidenceTarget(target)) return false;

  const sourceBindings = isRecord(options.freshCheckpointJsonValidation?.sourceBindings)
    ? options.freshCheckpointJsonValidation.sourceBindings
    : undefined;
  const freshCheckpointAggregateEvidence =
    typeof sourceBindings?.aggregateEvidence === 'string'
      ? sourceBindings.aggregateEvidence
      : undefined;
  if (
    freshCheckpointAggregateEvidence &&
    normalizeEvidenceTarget(freshCheckpointAggregateEvidence) === normalizedTarget &&
    isConcreteJsonEvidenceTarget(freshCheckpointAggregateEvidence)
  ) {
    return true;
  }

  return evidenceSegments(checkedEvidencePayload(requiredResolution))
    .filter(isAggregatePrebroadcastJsonEvidenceSegment)
    .flatMap(extractAggregatePrebroadcastJsonTargets)
    .map(normalizeEvidenceTarget)
    .filter(candidate => isConcreteJsonEvidenceTarget(candidate))
    .includes(normalizedTarget);
}

function isValidatedBackupRestoreEvidenceTargetLinked(requiredResolution: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (normalizedTarget.length === 0 || !isMarkdownEvidenceTarget(normalizedTarget)) return false;
  const payload = checkedEvidencePayload(requiredResolution);
  const completedTargets = extractCompletedBackupRestoreEvidenceTargets(payload)
    .map(normalizeEvidenceTarget);
  if (!completedTargets.includes(normalizedTarget)) return false;

  return backupRestoreValidationSegments(payload).some(segment => {
    const escapedTarget = escapeRegExp(normalizedTarget);
    const targetBinding = new RegExp(
      `\\b(?:validated target|validated input|backup validate target|backup-restore validation target)\\b[^\\n.;|]*${escapedTarget}`,
      'i',
    );
    return (
      targetBinding.test(segment) &&
      hasPositiveBackupRestoreValidationResult(segment) &&
      hasDistinctQualifiedBackupRestoreValidationOutputTarget(segment, normalizedTarget)
    );
  });
}

function isValidatedDependencyReviewEvidenceTargetLinked(requiredResolution: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (normalizedTarget.length === 0 || !isMarkdownEvidenceTarget(normalizedTarget)) return false;
  const completedTargets = extractCompletedDependencyReviewEvidenceTargets(requiredResolution)
    .map(normalizeEvidenceTarget);
  if (!completedTargets.includes(normalizedTarget)) return false;

  return dependencyReviewValidationSegments(requiredResolution).some(segment => {
    const escapedTarget = escapeRegExp(normalizedTarget);
    const targetBinding = new RegExp(
      `\\b(?:validated target|validated input|dependency validate target|dependency review validation target)\\b[^\\n.;|]*${escapedTarget}`,
      'i',
    );
    return (
      targetBinding.test(segment) &&
      hasPositiveDependencyReviewValidationResult(segment) &&
      hasDistinctQualifiedDependencyReviewValidationOutputTarget(segment, normalizedTarget)
    );
  });
}

function isValidatedCleanCheckoutEvidenceTargetLinked(requiredResolution: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (normalizedTarget.length === 0 || !isMarkdownEvidenceTarget(normalizedTarget)) return false;
  const completedTargets = extractCompletedCleanCheckoutEvidenceTargets(requiredResolution)
    .map(normalizeEvidenceTarget);
  if (!completedTargets.includes(normalizedTarget)) return false;

  return cleanCheckoutValidationSegments(requiredResolution).some(segment => {
    return (
      hasCleanCheckoutValidationTargetBinding(segment, normalizedTarget) &&
      hasPositiveCleanCheckoutValidationResult(segment) &&
      hasDistinctQualifiedCleanCheckoutValidationOutputTarget(segment, normalizedTarget)
    );
  });
}

function isValidatedSecurityReviewEvidenceTargetLinked(requiredResolution: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (normalizedTarget.length === 0 || !isMarkdownEvidenceTarget(normalizedTarget)) return false;
  const completedTargets = extractCompletedSecurityReviewEvidenceTargets(requiredResolution)
    .map(normalizeEvidenceTarget);
  if (!completedTargets.includes(normalizedTarget)) return false;

  return securityReviewValidationSegments(requiredResolution).some(segment => {
    const escapedTarget = escapeRegExp(normalizedTarget);
    const targetBinding = new RegExp(
      `\\b(?:validated target|validated input|security validate target|security review validation target)\\b[^\\n.;|]*${escapedTarget}`,
      'i',
    );
    return (
      targetBinding.test(segment) &&
      hasPositiveSecurityReviewValidationResult(segment) &&
      hasDistinctQualifiedSecurityReviewValidationOutputTarget(segment, normalizedTarget)
    );
  });
}

function isValidatedTrustlessBurnEvidenceTargetLinked(requiredResolution: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (normalizedTarget.length === 0 || !isMarkdownEvidenceTarget(normalizedTarget)) return false;
  const completedTargets = extractCompletedTrustlessBurnEvidenceTargets(requiredResolution)
    .map(normalizeEvidenceTarget);
  if (!completedTargets.includes(normalizedTarget)) return false;

  return trustlessBurnValidationSegments(requiredResolution).some(segment => {
    const escapedTarget = escapeRegExp(normalizedTarget);
    const targetBinding = new RegExp(
      `\\b(?:validated target|validated input|trustless validate target|trustless burn validation target)\\b[^\\n.;|]*${escapedTarget}`,
      'i',
    );
    return (
      targetBinding.test(segment) &&
      hasPositiveTrustlessBurnValidationResult(segment) &&
      hasDistinctQualifiedTrustlessBurnValidationOutputTarget(segment, normalizedTarget)
    );
  });
}

function isValidatedBenchmarkEvidenceTargetLinked(requiredResolution: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (normalizedTarget.length === 0 || !isMarkdownEvidenceTarget(normalizedTarget)) return false;
  const completedTargets = extractCompletedBenchmarkEvidenceTargets(requiredResolution)
    .map(normalizeEvidenceTarget);
  if (!completedTargets.includes(normalizedTarget)) return false;

  return benchmarkValidationSegments(requiredResolution).some(segment => {
    const escapedTarget = escapeRegExp(normalizedTarget);
    const targetBinding = new RegExp(
      `\\b(?:validated target|validated input|benchmark validate target|benchmark validation target)\\b[^\\n.;|]*${escapedTarget}`,
      'i',
    );
    return (
      targetBinding.test(segment) &&
      hasPositiveBenchmarkValidationResult(segment) &&
      hasDistinctQualifiedBenchmarkValidationOutputTarget(segment, normalizedTarget)
    );
  });
}

function isValidatedCommitteeGovernanceEvidenceTargetLinked(requiredResolution: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (normalizedTarget.length === 0 || !isMarkdownEvidenceTarget(normalizedTarget)) return false;
  const completedTargets = extractCompletedCommitteeGovernanceEvidenceTargets(requiredResolution)
    .map(normalizeEvidenceTarget);
  if (!completedTargets.includes(normalizedTarget)) return false;

  return committeeGovernanceValidationSegments(requiredResolution).some(segment => {
    const escapedTarget = escapeRegExp(normalizedTarget);
    const targetBinding = new RegExp(
      `\\b(?:validated target|validated input|governance validate target|governance validation target|committee governance validation target)\\b[^\\n.;|]*${escapedTarget}`,
      'i',
    );
    return (
      targetBinding.test(segment) &&
      hasPositiveCommitteeGovernanceValidationResult(segment) &&
      hasDistinctQualifiedCommitteeGovernanceValidationOutputTarget(segment, normalizedTarget)
    );
  });
}

function isValidatedOperatorReadinessEvidenceTargetLinked(requiredResolution: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (normalizedTarget.length === 0 || !isMarkdownEvidenceTarget(normalizedTarget)) return false;
  const completedTargets = extractCompletedOperatorReadinessEvidenceTargets(requiredResolution)
    .map(normalizeEvidenceTarget);
  if (!completedTargets.includes(normalizedTarget)) return false;

  return operatorReadinessValidationSegments(requiredResolution).some(segment => {
    const escapedTarget = escapeRegExp(normalizedTarget);
    const targetBinding = new RegExp(
      `\\b(?:validated target|validated input|operator validate target|operator readiness validation target)\\b[^\\n.;|]*${escapedTarget}`,
      'i',
    );
    return (
      targetBinding.test(segment) &&
      hasPositiveOperatorReadinessValidationResult(segment) &&
      hasDistinctQualifiedOperatorReadinessValidationOutputTarget(segment, normalizedTarget)
    );
  });
}

function isValidatedExternalIntegrationEvidenceTargetLinked(requiredResolution: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (normalizedTarget.length === 0 || !isMarkdownEvidenceTarget(normalizedTarget)) return false;
  const completedTargets = extractCompletedExternalIntegrationEvidenceTargets(requiredResolution)
    .map(normalizeEvidenceTarget);
  if (!completedTargets.includes(normalizedTarget)) return false;

  return externalIntegrationValidationSegments(requiredResolution).some(segment => {
    const escapedTarget = escapeRegExp(normalizedTarget);
    const targetBinding = new RegExp(
      `\\b(?:validated target|validated input|integration validate target|integration validation target|external integration validation target)\\b[^\\n.;|]*${escapedTarget}`,
      'i',
    );
    return (
      targetBinding.test(segment) &&
      hasPositiveExternalIntegrationValidationResult(segment) &&
      hasDistinctQualifiedExternalIntegrationValidationOutputTarget(segment, normalizedTarget)
    );
  });
}

function isValidatedTechnicalAddendumEvidenceTargetLinked(requiredResolution: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (
    normalizedTarget.length === 0 ||
    !isMarkdownEvidenceTarget(normalizedTarget) ||
    !isCompletedTechnicalAddendumEvidenceTarget(normalizedTarget)
  ) {
    return false;
  }
  const hasCompletedDocumentTargetOutsideValidation = extractCompletedTechnicalAddendumEvidenceTargets(requiredResolution)
    .map(normalizeEvidenceTarget)
    .includes(normalizedTarget);
  if (!hasCompletedDocumentTargetOutsideValidation) return false;

  return technicalAddendumValidationSegments(requiredResolution).some(segment => {
    const hasTargetBinding =
      /\b(?:validated target|validated input|addendum validate target|addendum validation target|technical addendum validation target)\b/i
        .test(segment) &&
      segment.toLowerCase().includes(normalizedTarget);
    return (
      hasTargetBinding &&
      hasPositiveTechnicalAddendumValidationResult(segment) &&
      hasDistinctQualifiedTechnicalAddendumValidationOutputTarget(segment, normalizedTarget)
    );
  });
}

function isValidatedThreatModelEvidenceTargetLinked(requiredResolution: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (
    normalizedTarget.length === 0 ||
    !isMarkdownEvidenceTarget(normalizedTarget) ||
    !isCompletedThreatModelEvidenceTarget(normalizedTarget)
  ) {
    return false;
  }

  const completedTargets = extractCompletedThreatModelEvidenceTargets(requiredResolution)
    .map(normalizeEvidenceTarget);
  if (!completedTargets.includes(normalizedTarget)) return false;

  return threatModelValidationSegments(requiredResolution).some(segment => {
    return (
      hasThreatModelValidationTargetBinding(segment, normalizedTarget) &&
      hasPositiveThreatModelValidationResult(segment) &&
      hasDistinctQualifiedThreatModelValidationOutputTarget(segment, normalizedTarget)
    );
  });
}

function isValidatedFreshCheckpointJsonTargetLinked(requiredResolution: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (!isConcreteJsonEvidenceTarget(target)) return false;
  const payload = checkedEvidencePayload(requiredResolution);
  return evidenceSegments(payload)
    .filter(isFreshCheckpointEvidenceSegment)
    .flatMap(segment => extractEvidenceTargets(freshCheckpointOutputEvidenceText(segment)))
    .map(normalizeEvidenceTarget)
    .filter(candidate => isConcreteJsonEvidenceTarget(candidate))
    .includes(normalizedTarget);
}

function isValidatedLivePreflightJsonTargetLinked(requiredResolution: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (!isConcreteJsonEvidenceTarget(target)) return false;
  const payload = checkedEvidencePayload(requiredResolution);
  return evidenceSegments(payload)
    .filter(isRehearsalLivePreflightEvidenceSegment)
    .flatMap(segment => extractEvidenceTargets(livePreflightOutputEvidenceText(segment)))
    .map(normalizeEvidenceTarget)
    .filter(candidate => isConcreteJsonEvidenceTarget(candidate))
    .includes(normalizedTarget);
}

function isValidatedPostSubmitObserveJsonTargetLinked(requiredResolution: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (!isConcreteJsonEvidenceTarget(target)) return false;
  const payload = checkedEvidencePayload(requiredResolution);
  return evidenceSegments(payload)
    .filter(isRehearsalPostSubmitObserveEvidenceSegment)
    .flatMap(segment => extractEvidenceTargets(postSubmitObserveOutputEvidenceText(segment)))
    .map(normalizeEvidenceTarget)
    .filter(candidate => isConcreteJsonEvidenceTarget(candidate))
    .includes(normalizedTarget);
}

const TESTNET_PRODUCTION_CANDIDATE_REQUIRED_CLAIM_ROW_TERMS: Array<{
  item: string;
  terms: string[];
}> = [
  {
    item: 'Green CI on the final branch',
    terms: [
      'release support with exact `Release supported = production deployment candidate`',
      'clean checkout CI green',
      'production-ready claim handling with exact `Production-ready claim allowed = no`',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
      'Release gate structural issues = 0',
    ],
  },
  {
    item: 'Fresh local devnet lifecycle run',
    terms: [
      'production-ready claim handling with exact `Production-ready claim allowed by this rehearsal: no`',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this rehearsal: no`',
    ],
  },
  {
    item: 'Fresh Ergo testnet lifecycle run',
    terms: [
      'Session Metadata Ergo node network testnet',
      'production-ready claim handling with exact `Production-ready claim allowed by this rehearsal: no`',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this rehearsal: no`',
    ],
  },
  {
    item: 'Failed broadcast / phantom AVL recovery drill',
    terms: [
      'production-ready claim handling with exact `Production-ready claim allowed by this rehearsal: no`',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this rehearsal: no`',
    ],
  },
  {
    item: 'Reorged burn and stale singleton recovery drill',
    terms: [
      'production-ready claim handling with exact `Production-ready claim allowed by this rehearsal: no`',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this rehearsal: no`',
    ],
  },
  {
    item: 'Backup-restore or reconstructibility drill',
    terms: [
      'production-ready claim handling with exact `Production-ready claim allowed by this drill: no`',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed by this drill: no`',
    ],
  },
  {
    item: 'Independent security review report',
    terms: [
      'release support with exact `Release supported = production deployment candidate`',
      'final security decision handling with exact `Final decision = approve`',
      'critical/high finding closure with exact `Critical/high findings open = 0`',
      'publication blocker closure with exact `Publication blockers = 0`',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
      'production-ready claim handling with exact `Production-ready claim allowed = no`',
      'production deployment candidate support requires exact `Environment` value `testnet`',
      'accepted-risk release-note handling with exact `Accepted risks reflected in release notes = yes`',
    ],
  },
  {
    item: 'Trustless burn verification path',
    terms: [
      'release support with exact `Release supported = production deployment candidate`',
      'trustless burn implementation handling with exact `Trustless burn verification implemented = yes`',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
      'production-ready claim handling with exact `Production-ready claim allowed = no`',
      'transitional trusted burn path handling with exact `Transitional trusted burn path disabled = yes`',
      'critical/high finding closure with exact `Critical/high findings open = 0`',
    ],
  },
  {
    item: 'Committee governance and key-rotation drill',
    terms: [
      'release support with exact `Release supported = production deployment candidate`',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
      'governance-ready claim handling with exact `Governance-ready claim allowed = yes`',
      'production-ready claim handling with exact `Production-ready claim allowed = no`',
      'open governance blocker handling with exact `Open governance blockers = 0`',
    ],
  },
  {
    item: 'Operator readiness evidence',
    terms: [
      'release support with exact `Release supported = production deployment candidate`',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
      'operator-ready claim handling with exact `Operator-ready claim allowed = yes`',
      'production-ready claim handling with exact `Production-ready claim allowed = no`',
      'critical incident closure with exact `Critical incidents open = 0`',
    ],
  },
  {
    item: 'Single, batch, and sharded benchmark evidence',
    terms: [
      'release support with exact `Release supported = production deployment candidate`',
      'measured single/batch/sharded evidence',
      'scaling-claim allowance with exact `Scaling claims allowed = yes`',
      'production-ready claim handling with exact `Production-ready claim allowed = no`',
      'testnet production-candidate claim handling with exact `Testnet production-candidate claim allowed = yes`',
      'production throughput claim handling with exact `Production throughput claim allowed = no`',
      'exact `Mainnet-grade evidence linked = no`',
      'open benchmark blocker handling with exact `Open benchmark blockers = 0`',
    ],
  },
  {
    item: 'External integration package review',
    terms: [
      'production deployment candidate classification requires Environment used = testnet',
      'fresh reviewer',
      'Private maintainer context used = no',
      'per-command fresh checkout commit identity',
      'public institutional-reference release handling with exact `Public institutional-reference release allowed = yes`',
      'production-ready claim handling with exact `Production-ready claim allowed = no`',
      'blocked or allowed testnet production-candidate claim handling bound to that field',
    ],
  },
  {
    item: 'Technical addendum architecture manual',
    terms: [
      'Release gate status = pass',
      'Testnet production-candidate claim allowed = yes-after-release-gate-pass',
      'Production-ready claim allowed = no',
      'Mainnet deployment claim allowed = no',
      'architecture manual evidence',
    ],
  },
];

const TESTNET_PRODUCTION_CANDIDATE_CONFLICT_TERMS: Array<{
  item: string;
  conflicts: Array<{ pattern: RegExp; message: string }>;
}> = [
  {
    item: 'Fresh local devnet lifecycle run',
    conflicts: [
      {
        pattern: /testnet production-candidate claim allowed by this rehearsal\s*:\s*yes/i,
        message: 'Testnet production-candidate claim allowed by this rehearsal: yes',
      },
      {
        pattern: /production-ready claim allowed by this rehearsal\s*:\s*yes/i,
        message: 'Production-ready claim allowed by this rehearsal: yes',
      },
    ],
  },
  {
    item: 'Fresh Ergo testnet lifecycle run',
    conflicts: [
      {
        pattern: /testnet production-candidate claim allowed by this rehearsal\s*:\s*yes/i,
        message: 'Testnet production-candidate claim allowed by this rehearsal: yes',
      },
      {
        pattern: /production-ready claim allowed by this rehearsal\s*:\s*yes/i,
        message: 'Production-ready claim allowed by this rehearsal: yes',
      },
    ],
  },
  {
    item: 'Backup-restore or reconstructibility drill',
    conflicts: [
      {
        pattern: /testnet production-candidate claim allowed by this drill\s*:\s*yes/i,
        message: 'Testnet production-candidate claim allowed by this drill: yes',
      },
      {
        pattern: /production-ready claim allowed by this drill\s*:\s*yes/i,
        message: 'Production-ready claim allowed by this drill: yes',
      },
    ],
  },
  {
    item: 'Independent security review report',
    conflicts: [
      { pattern: /final decision\s*=\s*(?:reject|rejected|block|blocked)/i, message: 'Final decision is not approve' },
      { pattern: /critical\/high findings open\s*=\s*[1-9]\d*/i, message: 'Critical/high findings open is greater than 0' },
      { pattern: /testnet production-candidate claim allowed\s*=\s*no/i, message: 'Testnet production-candidate claim allowed = no' },
    ],
  },
  {
    item: 'Trustless burn verification path',
    conflicts: [
      { pattern: /trustless burn verification implemented\s*=\s*no/i, message: 'Trustless burn verification implemented = no' },
      { pattern: /transitional trusted burn path disabled\s*=\s*no/i, message: 'Transitional trusted burn path disabled = no' },
      { pattern: /critical\/high findings open\s*=\s*[1-9]\d*/i, message: 'Critical/high findings open is greater than 0' },
      { pattern: /testnet production-candidate claim allowed\s*=\s*no/i, message: 'Testnet production-candidate claim allowed = no' },
    ],
  },
  {
    item: 'Committee governance and key-rotation drill',
    conflicts: [
      { pattern: /governance-ready claim allowed\s*=\s*no/i, message: 'Governance-ready claim allowed = no' },
      { pattern: /open governance blockers\s*=\s*[1-9]\d*/i, message: 'Open governance blockers is greater than 0' },
      { pattern: /testnet production-candidate claim allowed\s*=\s*no/i, message: 'Testnet production-candidate claim allowed = no' },
    ],
  },
  {
    item: 'Operator readiness evidence',
    conflicts: [
      { pattern: /operator-ready claim allowed\s*=\s*no/i, message: 'Operator-ready claim allowed = no' },
      { pattern: /critical incidents open\s*=\s*[1-9]\d*/i, message: 'Critical incidents open is greater than 0' },
      { pattern: /testnet production-candidate claim allowed\s*=\s*no/i, message: 'Testnet production-candidate claim allowed = no' },
    ],
  },
  {
    item: 'External integration package review',
    conflicts: [
      { pattern: /private maintainer context used\s*=\s*yes/i, message: 'Private maintainer context used = yes' },
      { pattern: /environment used\s*=\s*mainnet/i, message: 'Environment used = mainnet' },
    ],
  },
  {
    item: 'Technical addendum architecture manual',
    conflicts: [
      { pattern: /release gate status\s*=\s*blocked/i, message: 'Release gate status = blocked' },
      { pattern: /production-ready claim allowed\s*=\s*yes/i, message: 'Production-ready claim allowed = yes' },
      { pattern: /mainnet deployment claim allowed\s*=\s*yes/i, message: 'Mainnet deployment claim allowed = yes' },
    ],
  },
];

function validateTestnetProductionCandidateClaimRows(
  rows: PendingEvidenceRow[],
  options: ReleaseGateEvaluationOptions,
): string[] {
  const issues: string[] = [];
  const byItem = new Map(rows.map(row => [row.item, row]));
  const cleanCheckout = byItem.get('Green CI on the final branch');
  const securityReview = byItem.get('Independent security review report');
  const trustlessBurn = byItem.get('Trustless burn verification path');
  const signer = byItem.get('Signer dependency conformance or fail-closed release decision');
  const benchmark = byItem.get('Single, batch, and sharded benchmark evidence');
  const committeeGovernance = byItem.get('Committee governance and key-rotation drill');
  const operatorReadiness = byItem.get('Operator readiness evidence');
  const externalIntegration = byItem.get('External integration package review');
  const technicalAddendum = byItem.get('Technical addendum architecture manual');

  for (const required of TESTNET_PRODUCTION_CANDIDATE_REQUIRED_CLAIM_ROW_TERMS) {
    const row = byItem.get(required.item);
    if (!row) {
      issues.push(
        `Release Decision: Testnet production-candidate claims allowed requires ${required.item} evidence`,
      );
      continue;
    }
    if (row.status !== 'Checked') {
      issues.push(
        `Release Decision: Testnet production-candidate claims allowed requires ${required.item} to be checked`,
      );
      continue;
    }

    const missingTerms = required.terms.filter(term => !containsTerm(row.requiredResolution, term));
    if (missingTerms.length > 0) {
      issues.push(
        `Release Decision: Testnet production-candidate claims allowed requires ${required.item} row to include: ${missingTerms.join(', ')}`,
      );
    }

    const conflictTerms = TESTNET_PRODUCTION_CANDIDATE_CONFLICT_TERMS.find(
      candidate => candidate.item === required.item,
    );
    const conflicts = conflictTerms?.conflicts
      .filter(conflict => conflict.pattern.test(row.requiredResolution))
      .map(conflict => conflict.message) ?? [];
    if (conflicts.length > 0) {
      issues.push(
        `Release Decision: Testnet production-candidate claims allowed conflicts with ${required.item} row: ${conflicts.join(', ')}`,
      );
    }
  }

  if (cleanCheckout) {
    issues.push(...validateLinkedCleanCheckoutEvidence(cleanCheckout, options));
  }

  const testnetLifecycle = byItem.get('Fresh Ergo testnet lifecycle run');
  if (
    testnetLifecycle?.status === 'Checked' &&
    !hasValidatedCompletedLiveRehearsalEvidence(testnetLifecycle.requiredResolution)
  ) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires Fresh Ergo testnet lifecycle run to include completed live rehearsal evidence with rehearsal:validate PASS output bound to the completed rehearsal target',
    );
  }
  if (
    testnetLifecycle?.status === 'Checked' &&
    !hasValidatedLivePreflightEvidence(testnetLifecycle.requiredResolution)
  ) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires Fresh Ergo testnet lifecycle run to include rehearsal:external-fee-live-preflight PASS output bound to the same Expected transaction ID and activated settlement profile',
    );
  }
  if (
    testnetLifecycle?.status === 'Checked' &&
    !hasValidatedFreshCheckpointEvidence(testnetLifecycle.requiredResolution)
  ) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires Fresh Ergo testnet lifecycle run to include rehearsal:fresh-testnet-check PASS output with linked fresh checkpoint JSON',
    );
  }
  if (
    testnetLifecycle?.status === 'Checked' &&
    !hasValidatedPostSubmitObserveEvidence(testnetLifecycle.requiredResolution)
  ) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires Fresh Ergo testnet lifecycle run to include rehearsal:post-submit:observe PASS output with structured JSON output-shape binding',
    );
  }

  if (!securityReview) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires independent security review evidence',
    );
  } else {
    issues.push(...validateLinkedSecurityReviewEvidence(securityReview, options));
  }

  if (!trustlessBurn) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires trustless burn verification evidence',
    );
  } else {
    issues.push(...validateLinkedTrustlessBurnEvidence(trustlessBurn, options));
  }

  if (!signer) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires signer dependency evidence',
    );
  } else {
    const text = checkedEvidencePayload(signer.requiredResolution);
    if (
      !containsTerm(text, 'Release supported = production deployment candidate') ||
      !containsTerm(text, 'Upstream signer blocker resolved = yes') ||
      !containsTerm(text, 'Testnet production-candidate claim allowed = yes')
    ) {
      issues.push(
        'Release Decision: Testnet production-candidate claims allowed requires signer dependency evidence to resolve the upstream signer blocker',
      );
    }
    if (
      containsTerm(text, 'Release supported = institutional reference') ||
      containsTerm(text, 'Upstream signer blocker resolved = no') ||
      containsTerm(text, 'Testnet production-candidate claim allowed = no')
    ) {
      issues.push(
        'Release Decision: Testnet production-candidate claims allowed conflicts with fail-closed signer dependency evidence',
      );
    }
    if (hasFailClosedSignerBlockerWording(stripEvidenceTargets(text))) {
      issues.push(
        'Release Decision: Testnet production-candidate claims allowed conflicts with fail-closed signer blocker wording',
      );
    }
    issues.push(...validateLinkedDependencyReviewEvidence(signer, options));
  }

  if (!benchmark) {
    issues.push('Release Decision: Testnet production-candidate claims allowed requires benchmark evidence');
  } else {
    issues.push(...validateLinkedBenchmarkEvidence(benchmark, options));
  }

  if (!committeeGovernance) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires committee governance evidence',
    );
  } else {
    issues.push(...validateLinkedCommitteeGovernanceEvidence(committeeGovernance, options));
  }

  if (!operatorReadiness) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires operator readiness evidence',
    );
  } else {
    issues.push(...validateLinkedOperatorReadinessEvidence(operatorReadiness, options));
  }

  if (!externalIntegration) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires external integration evidence',
    );
  } else {
    issues.push(...validateLinkedExternalIntegrationEvidence(externalIntegration, options));
  }

  if (!technicalAddendum) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires technical addendum architecture manual evidence',
    );
  } else {
    issues.push(...validateLinkedTechnicalAddendumEvidence([technicalAddendum], options));
  }

  return issues;
}

function validateLinkedCleanCheckoutEvidence(
  cleanCheckout: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.cleanCheckoutEvidenceValidation;
  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual clean checkout evidence validation input',
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual clean checkout evidence validation to pass',
    );
  }
  const evidencePayload = checkedEvidencePayload(cleanCheckout.requiredResolution);
  if (!isValidatedCleanCheckoutEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires Gate 1 row to link a completed clean checkout artifact with ci:validate output',
    );
  }

  issues.push(...validateCleanCheckoutRunClassification(
    validation.classification,
    'Release Decision: Testnet production-candidate claims allowed',
  ));
  issues.push(...validateCleanCheckoutPublicationDecision(
    validation.publicationDecision ?? {},
    'Release Decision: Testnet production-candidate claims allowed',
  ));
  if (validationPassed(validation)) {
    issues.push(...validateCleanCheckoutStructuredSummary(
      validation,
      'Release Decision: actual clean checkout evidence validation',
    ));
  }

  return issues;
}

function validateCleanCheckoutRunClassification(
  classification: CleanCheckoutRunClassification | undefined,
  prefix: string,
): string[] {
  const issues: string[] = [];
  if (!classification || isBlankValue(classification.evidenceName)) {
    issues.push(`${prefix} requires validated clean checkout Run Classification Evidence name`);
  }
  if (!isCleanCheckoutRunClassificationGitCommit(classification?.gitCommit)) {
    issues.push(`${prefix} requires validated clean checkout Run Classification Git commit`);
  }
  if (isBlankValue(classification?.branch)) {
    issues.push(`${prefix} requires validated clean checkout Run Classification Branch`);
  }
  if (classification?.releaseLevel !== 'production deployment candidate') {
    issues.push(`${prefix} requires validated clean checkout Run Classification Release level = production deployment candidate`);
  }
  if (!isAllowedCleanCheckoutCiProvider(classification?.ciProvider)) {
    issues.push(`${prefix} requires validated clean checkout Run Classification CI provider`);
  }
  if (isBlankValue(classification?.workflow)) {
    issues.push(`${prefix} requires validated clean checkout Run Classification Workflow`);
  }
  if (isBlankValue(classification?.nodeVersion)) {
    issues.push(`${prefix} requires validated clean checkout Run Classification Node version`);
  }
  if (isBlankValue(classification?.rustTarget)) {
    issues.push(`${prefix} requires validated clean checkout Run Classification Rust target`);
  }
  if (isBlankValue(classification?.wasmPackVersion)) {
    issues.push(`${prefix} requires validated clean checkout Run Classification wasm-pack version`);
  }
  if (isBlankValue(classification?.reviewer)) {
    issues.push(`${prefix} requires validated clean checkout Run Classification Reviewer`);
  }
  if (!isIsoCalendarDate(classification?.date?.trim() ?? '')) {
    issues.push(`${prefix} requires validated clean checkout Run Classification Date to use YYYY-MM-DD`);
  }
  return issues;
}

function isCleanCheckoutRunClassificationGitCommit(value: string | undefined): boolean {
  return /^[a-f0-9]{7,40}$/i.test(value?.trim() ?? '');
}

function normalizeGitCommit(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function validationErrors(validation: { errors?: unknown }): unknown[] {
  return Array.isArray(validation.errors) ? validation.errors : ['missing errors array'];
}

function validationPassed(validation: { status?: unknown; errors?: unknown }): boolean {
  return validation.status === 'PASS' && validationErrors(validation).length === 0;
}

function isAllowedCleanCheckoutCiProvider(value: string | undefined): boolean {
  return value === 'GitHub Actions' || value === 'local clean checkout' || value === 'external CI';
}

function validateCleanCheckoutPublicationDecision(
  publicationDecision: NonNullable<CleanCheckoutEvidenceValidationInput['publicationDecision']>,
  prefix: string,
): string[] {
  const issues: string[] = [];
  if (publicationDecision.cleanCheckoutCiGreen !== 'yes') {
    issues.push(`${prefix} requires validated clean checkout CI green = yes`);
  }
  if (publicationDecision.releaseSupported !== 'production deployment candidate') {
    issues.push(`${prefix} requires validated clean checkout Release supported = production deployment candidate`);
  }
  if (publicationDecision.productionReadyClaimAllowed !== 'no') {
    issues.push(`${prefix} requires validated clean checkout Production-ready claim allowed = no`);
  }
  if (publicationDecision.testnetProductionCandidateClaimAllowed !== 'yes') {
    issues.push(`${prefix} requires validated clean checkout Testnet production-candidate claim allowed = yes`);
  }
  if (!isExactZeroEvidenceValue(publicationDecision.releaseGateStructuralIssues ?? '')) {
    issues.push(`${prefix} requires validated clean checkout Release gate structural issues = 0`);
  }
  if (publicationDecision.releaseNotesUpdated !== 'yes') {
    issues.push(`${prefix} requires validated clean checkout Release notes updated = yes`);
  }
  if (!hasCompletedCleanCheckoutReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '')) {
    issues.push(`${prefix} requires completed Gate 1 release-note update evidence`);
  }
  if (!hasCompletedCleanCheckoutChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '')) {
    issues.push(`${prefix} requires completed Gate 1 checklist update evidence`);
  }
  const cleanCheckoutPublicationUpdateExactBindingRequirements = {
    requireExactReleaseSupportedProductionDeploymentCandidate:
      publicationDecision.releaseSupported === 'production deployment candidate',
    requireExactTestnetProductionCandidateClaimAllowed:
      publicationDecision.testnetProductionCandidateClaimAllowed === 'yes',
    requireExactProductionReadyClaimDenied:
      publicationDecision.productionReadyClaimAllowed === 'no',
    requireExactReleaseGateStructuralIssues:
      isExactZeroEvidenceValue(publicationDecision.releaseGateStructuralIssues ?? ''),
  };
  issues.push(
    ...validateCleanCheckoutPublicationUpdateBoundary(
      `${prefix}: Gate 1 release-note update evidence`,
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      cleanCheckoutPublicationUpdateExactBindingRequirements,
    ),
  );
  issues.push(
    ...validateCleanCheckoutPublicationUpdateBoundary(
      `${prefix}: Gate 1 checklist update evidence`,
      publicationDecision.requiredChecklistUpdates ?? '',
      cleanCheckoutPublicationUpdateExactBindingRequirements,
    ),
  );
  if (
    hasCompletedCleanCheckoutReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '') &&
    hasCompletedCleanCheckoutChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '') &&
    haveSharedConcreteEvidenceTarget(
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      publicationDecision.requiredChecklistUpdates ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires distinct completed Gate 1 release-note and checklist update evidence targets`,
    );
  }
  if (!cleanCheckoutReviewerDecisionSummaryIsBounded(publicationDecision)) {
    issues.push(
      `${prefix} requires validated clean checkout Reviewer decision summary to bind release support, clean checkout CI green, production-ready claim handling, testnet production-candidate claim handling, and release gate structural issues`,
    );
  }
  if (
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    reviewerDecisionSummaryBindsZeroStructuralIssues(publicationDecision.reviewerDecisionSummary ?? '') &&
    !cleanCheckoutReviewerDecisionSummaryHasExactReleaseGateStructuralIssuesBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated clean checkout Reviewer decision summary to use exact Release gate structural issues = 0`,
    );
  }
  if (
    publicationDecision.testnetProductionCandidateClaimAllowed === 'yes' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !cleanCheckoutReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated clean checkout Reviewer decision summary to use exact Testnet production-candidate claim allowed = yes`,
    );
  }
  if (cleanCheckoutReviewerNoteApprovesFailedCi(publicationDecision.reviewerDecisionSummary ?? '')) {
    issues.push(
      `${prefix} requires validated clean checkout Reviewer decision summary not to approve failed CI`,
    );
  }
  if (cleanCheckoutReviewerNoteApprovesNonZeroStructuralIssues(publicationDecision.reviewerDecisionSummary ?? '')) {
    issues.push(
      `${prefix} requires validated clean checkout Reviewer decision summary not to approve non-zero structural issues`,
    );
  }
  return issues;
}

interface CleanCheckoutPublicationUpdateExactBindingRequirements {
  requireExactReleaseSupportedProductionDeploymentCandidate: boolean;
  requireExactTestnetProductionCandidateClaimAllowed: boolean;
  requireExactProductionReadyClaimDenied: boolean;
  requireExactReleaseGateStructuralIssues: boolean;
}

function validateCleanCheckoutPublicationUpdateBoundary(
  label: string,
  text: string,
  exactBindingRequirements: CleanCheckoutPublicationUpdateExactBindingRequirements,
): string[] {
  const issues = [
    ...validateReleaseGatePublicationClaimBoundary(label, text),
  ];

  if (
    exactBindingRequirements.requireExactReleaseSupportedProductionDeploymentCandidate &&
    !hasExactCleanCheckoutReleaseSupportedProductionDeploymentCandidateBinding(text)
  ) {
    issues.push(`${label} must use exact Release supported = production deployment candidate`);
  }
  if (
    exactBindingRequirements.requireExactTestnetProductionCandidateClaimAllowed &&
    !hasExactCleanCheckoutTestnetProductionCandidateClaimAllowedBinding(text)
  ) {
    issues.push(`${label} must use exact Testnet production-candidate claim allowed = yes`);
  }
  if (
    exactBindingRequirements.requireExactProductionReadyClaimDenied &&
    !hasExactCleanCheckoutProductionReadyClaimDeniedBinding(text)
  ) {
    issues.push(`${label} must use exact Production-ready claim allowed = no`);
  }
  if (
    exactBindingRequirements.requireExactReleaseGateStructuralIssues &&
    !hasExactCleanCheckoutReleaseGateStructuralIssuesBinding(text)
  ) {
    issues.push(`${label} must use exact Release gate structural issues = 0`);
  }
  if (cleanCheckoutReviewerNoteApprovesFailedCi(text)) {
    issues.push(`${label} must not approve failed CI`);
  }
  if (cleanCheckoutReviewerNoteApprovesNonZeroStructuralIssues(text)) {
    issues.push(`${label} must not approve non-zero structural issues`);
  }
  if (cleanCheckoutPublicationUpdateDeniesTestnetProductionCandidateSupport(text)) {
    issues.push(`${label} must not deny testnet production-candidate claim support`);
  }
  if (hasContradictoryValidationFailureMarker(text)) {
    issues.push(`${label} must not mix completed/PASS evidence with failure markers`);
  }
  if (hasContradictoryReleaseNotesDecisionBinding(text)) {
    issues.push(`${label} must not include contradictory release-note decision bindings`);
  }

  return [...new Set(issues)];
}

function cleanCheckoutPublicationUpdateDeniesTestnetProductionCandidateSupport(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\btestnet production candidate claim allowed\s+(?:no|false|0|blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\btestnet production candidate claim support\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\btestnet production candidate claims?\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized)
  );
}

function cleanCheckoutReviewerDecisionSummaryIsBounded(
  publicationDecision: NonNullable<CleanCheckoutEvidenceValidationInput['publicationDecision']>,
): boolean {
  const summary = publicationDecision.reviewerDecisionSummary ?? '';
  const normalized = normalizeDecisionSummaryForReleaseGate(summary);
  return (
    /\brelease supported\b/.test(normalized) &&
    /\bclean checkout ci green\b|\bci green\b|\bclean checkout green\b/.test(normalized) &&
    /\bproduction ready claim handling\b/.test(normalized) &&
    /\btestnet production candidate claim handling\b/.test(normalized) &&
    (
      publicationDecision.testnetProductionCandidateClaimAllowed !== 'yes' ||
      cleanCheckoutReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(summary)
    ) &&
    cleanCheckoutReviewerDecisionSummaryHasExactReleaseGateStructuralIssuesBinding(summary) &&
    validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'clean checkout Reviewer decision summary',
      summary,
      releaseSupported: publicationDecision.releaseSupported,
      productionReadyClaimAllowed: publicationDecision.productionReadyClaimAllowed,
      testnetProductionCandidateClaimAllowed: publicationDecision.testnetProductionCandidateClaimAllowed,
    }).length === 0
  );
}

function cleanCheckoutReviewerDecisionSummaryHasExactReleaseGateStructuralIssuesBinding(value: string): boolean {
  return hasExactCleanCheckoutReleaseGateStructuralIssuesBinding(value);
}

function cleanCheckoutReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return hasExactCleanCheckoutTestnetProductionCandidateClaimAllowedBinding(value);
}

function hasExactCleanCheckoutReleaseSupportedProductionDeploymentCandidateBinding(value: string): boolean {
  return /\bRelease supported\s*=\s*production deployment candidate\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactCleanCheckoutTestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return /\bTestnet production-candidate claim allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactCleanCheckoutProductionReadyClaimDeniedBinding(value: string): boolean {
  return /\bProduction-ready claim allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactCleanCheckoutReleaseGateStructuralIssuesBinding(value: string): boolean {
  return /\bRelease gate structural issues\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function reviewerDecisionSummaryBindsZeroStructuralIssues(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\b0\b.{0,40}\bstructural issues?\b/.test(normalized) ||
    /\bstructural issues?\b.{0,40}\b0\b/.test(normalized)
  );
}

function validateLinkedDependencyReviewEvidence(
  signer: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.dependencyReviewEvidenceValidation;
  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual dependency review evidence validation input',
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual dependency review evidence validation to pass',
    );
  }
  const evidencePayload = checkedEvidencePayload(signer.requiredResolution);
  if (!isValidatedDependencyReviewEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires signer dependency evidence to link a completed dependency review artifact with dependency:validate output',
    );
  }

  issues.push(...validateDependencyReviewProductionCandidateFields(
    validation,
    'Release Decision: Testnet production-candidate claims allowed',
    options.cleanCheckoutEvidenceValidation?.classification?.gitCommit,
  ));
  if (validationPassed(validation)) {
    issues.push(...validateDependencyReviewStructuredSummary(
      validation,
      'Release Decision: actual dependency review evidence validation',
    ));
  }

  return issues;
}

function validateDependencyReviewProductionCandidateFields(
  validation: DependencyReviewEvidenceValidationInput,
  prefix: string,
  cleanCheckoutGitCommit?: string,
): string[] {
  const issues: string[] = [];
  const classification = validation.classification ?? {};
  if (classification.releaseLevel !== 'production deployment candidate') {
    issues.push(
      `${prefix} requires validated dependency review Review Classification Release level = production deployment candidate`,
    );
  }
  if (classification.environment !== 'testnet') {
    issues.push(
      `${prefix} requires validated dependency review Review Classification Environment = testnet`,
    );
  }
  if (classification.lockfilesReviewed !== 'yes') {
    issues.push(
      `${prefix} requires validated dependency review Review Classification Lockfiles reviewed = yes`,
    );
  }
  if (!isDependencyReviewClassificationGitCommit(classification.gitCommit)) {
    issues.push(
      `${prefix} requires validated dependency review Review Classification Git commit`,
    );
  } else if (
    isCleanCheckoutRunClassificationGitCommit(cleanCheckoutGitCommit) &&
    normalizeGitCommit(classification.gitCommit) !== normalizeGitCommit(cleanCheckoutGitCommit)
  ) {
    issues.push(
      `${prefix} requires dependency review Git commit to match clean checkout Git commit ${cleanCheckoutGitCommit?.trim()}`,
    );
  }
  if (isBlankValue(classification.reviewer)) {
    issues.push(
      `${prefix} requires validated dependency review Review Classification Reviewer`,
    );
  }
  if (!isIsoCalendarDate(classification.date?.trim() ?? '')) {
    issues.push(
      `${prefix} requires validated dependency review Review Classification Date to use YYYY-MM-DD`,
    );
  }

  const publicationDecision = validation.publicationDecision ?? {};
  if (publicationDecision.releaseSupported !== 'production deployment candidate') {
    issues.push(
      `${prefix} requires validated dependency review Release supported = production deployment candidate`,
    );
  }
  if (publicationDecision.productionReadyClaimAllowed !== 'no') {
    issues.push(
      `${prefix} requires validated dependency review Production-ready claim allowed = no`,
    );
  }
  if (publicationDecision.testnetProductionCandidateClaimAllowed !== 'yes') {
    issues.push(
      `${prefix} requires validated dependency review Testnet production-candidate claim allowed = yes`,
    );
  }
  if (publicationDecision.upstreamSignerBlockerResolved !== 'yes') {
    issues.push(
      `${prefix} requires validated dependency review Upstream signer blocker resolved = yes`,
    );
  }
  if (!isExactZeroEvidenceValue(publicationDecision.criticalHighVulnerabilitiesOpen ?? '')) {
    issues.push(
      `${prefix} requires validated dependency review Critical/high vulnerabilities open = 0`,
    );
  }
  if (publicationDecision.releaseNotesUpdated !== 'yes') {
    issues.push(
      `${prefix} requires validated dependency review Release notes updated = yes`,
    );
  }
  if (!hasCompletedDependencyReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '')) {
    issues.push(
      `${prefix} requires completed dependency-review release-note update evidence`,
    );
  }
  if (!hasCompletedDependencyChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '')) {
    issues.push(
      `${prefix} requires completed dependency review checklist update evidence`,
    );
  }
  const dependencyReviewPublicationUpdateExactBindingRequirements = {
    requireExactReleaseSupportedProductionDeploymentCandidate:
      publicationDecision.releaseSupported === 'production deployment candidate',
    requireExactTestnetProductionCandidateClaimAllowed:
      publicationDecision.testnetProductionCandidateClaimAllowed === 'yes',
    requireExactProductionReadyClaimDenied:
      publicationDecision.productionReadyClaimAllowed === 'no',
    requireExactUpstreamSignerBlockerResolved:
      publicationDecision.upstreamSignerBlockerResolved === 'yes',
    requireExactCriticalHighVulnerabilitiesOpen:
      isExactZeroEvidenceValue(publicationDecision.criticalHighVulnerabilitiesOpen ?? ''),
  };
  issues.push(
    ...validateDependencyReviewPublicationUpdateBoundary(
      `${prefix}: dependency-review release-note update evidence`,
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      {
        ...dependencyReviewPublicationUpdateExactBindingRequirements,
        upstreamSignerBlockerMustBeResolved: true,
        criticalHighVulnerabilitiesMustBeClosed: true,
        testnetProductionCandidateSupportRequired: true,
      },
    ),
  );
  issues.push(
    ...validateDependencyReviewPublicationUpdateBoundary(
      `${prefix}: dependency-review checklist update evidence`,
      publicationDecision.requiredChecklistUpdates ?? '',
      {
        ...dependencyReviewPublicationUpdateExactBindingRequirements,
        upstreamSignerBlockerMustBeResolved: true,
        criticalHighVulnerabilitiesMustBeClosed: true,
        testnetProductionCandidateSupportRequired: true,
      },
    ),
  );
  if (
    hasCompletedDependencyReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '') &&
    hasCompletedDependencyChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '') &&
    haveSharedConcreteEvidenceTarget(
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      publicationDecision.requiredChecklistUpdates ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires distinct completed dependency-review release-note and checklist update evidence targets`,
    );
  }
  if (!dependencyReviewerDecisionSummaryIsBounded(publicationDecision)) {
    issues.push(
      `${prefix} requires validated dependency review Reviewer decision summary to bind release support, upstream signer blocker handling, production-ready claim handling, testnet production-candidate claim handling, and critical/high vulnerability closure`,
    );
  }
  if (
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    publicationDecision.releaseSupported === 'production deployment candidate' &&
    !dependencyReviewerDecisionSummaryHasExactReleaseSupportedProductionDeploymentCandidateBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated dependency review Reviewer decision summary to use exact Release supported = production deployment candidate`,
    );
  }
  if (
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    publicationDecision.productionReadyClaimAllowed === 'no' &&
    !dependencyReviewerDecisionSummaryHasExactProductionReadyClaimDeniedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated dependency review Reviewer decision summary to use exact Production-ready claim allowed = no`,
    );
  }
  if (
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    dependencyReviewerDecisionSummaryClosesCriticalHighVulnerabilities(publicationDecision.reviewerDecisionSummary ?? '') &&
    !dependencyReviewerDecisionSummaryHasExactCriticalHighVulnerabilitiesOpenBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated dependency review Reviewer decision summary to use exact Critical/high vulnerabilities open = 0`,
    );
  }
  if (
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    publicationDecision.upstreamSignerBlockerResolved === 'yes' &&
    !dependencyReviewerDecisionSummaryHasExactUpstreamSignerBlockerResolvedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated dependency review Reviewer decision summary to use exact Upstream signer blocker resolved = yes`,
    );
  }
  issues.push(...validateDependencyReviewerDecisionSummaryTestnetClaimBinding(
    prefix,
    publicationDecision,
  ));
  issues.push(...validateDependencyReviewDecisionSummaryBlockerApprovals(
    prefix,
    publicationDecision.reviewerDecisionSummary ?? '',
  ));

  const upgradeRows = Array.isArray(validation.upgradeRows)
    ? structuredRowObjects(validation.upgradeRows)
    : undefined;
  const signerDecision = upgradeRows?.find(
    row => row.decision === 'Signer dependency upgrade decision',
  );
  if (!signerDecision) {
    issues.push(
      `${prefix} requires validated dependency review signer upgrade decision`,
    );
  } else {
    if (!identifiesDependencyReviewSignerUpstreamResolution(signerDecision.releaseAction)) {
      issues.push(
        `${prefix} requires validated dependency review signer action to identify upstream release, concrete release identifier, and JVM/node conformance evidence`,
      );
    }
    if (hasFailClosedSignerBlockerWording(signerDecision.releaseAction)) {
      issues.push(
        `${prefix} conflicts with fail-closed signer blocker wording`,
      );
    }
  }

  return issues;
}

function validateDependencyReviewFailClosedInstitutionalFields(
  validation: DependencyReviewEvidenceValidationInput,
  prefix: string,
): string[] {
  const issues: string[] = [];
  const classification = validation.classification ?? {};
  if (classification.releaseLevel !== 'institutional reference') {
    issues.push(
      `${prefix} requires validated dependency review Review Classification Release level = institutional reference`,
    );
  }
  if (classification.environment !== 'clean checkout') {
    issues.push(
      `${prefix} requires validated dependency review Review Classification Environment = clean checkout`,
    );
  }
  if (classification.lockfilesReviewed !== 'yes') {
    issues.push(
      `${prefix} requires validated dependency review Review Classification Lockfiles reviewed = yes`,
    );
  }
  if (!isDependencyReviewClassificationGitCommit(classification.gitCommit)) {
    issues.push(
      `${prefix} requires validated dependency review Review Classification Git commit`,
    );
  }
  if (isBlankValue(classification.reviewer)) {
    issues.push(
      `${prefix} requires validated dependency review Review Classification Reviewer`,
    );
  }
  if (!isIsoCalendarDate(classification.date?.trim() ?? '')) {
    issues.push(
      `${prefix} requires validated dependency review Review Classification Date to use YYYY-MM-DD`,
    );
  }

  const publicationDecision = validation.publicationDecision ?? {};
  if (publicationDecision.releaseSupported !== 'institutional reference') {
    issues.push(
      `${prefix} requires validated dependency review Release supported = institutional reference`,
    );
  }
  if (publicationDecision.productionReadyClaimAllowed !== 'no') {
    issues.push(
      `${prefix} requires validated dependency review Production-ready claim allowed = no`,
    );
  }
  if (publicationDecision.testnetProductionCandidateClaimAllowed !== 'no') {
    issues.push(
      `${prefix} requires validated dependency review Testnet production-candidate claim allowed = no`,
    );
  }
  if (publicationDecision.upstreamSignerBlockerResolved !== 'no') {
    issues.push(
      `${prefix} requires validated dependency review Upstream signer blocker resolved = no`,
    );
  }
  if (!isExactZeroEvidenceValue(publicationDecision.criticalHighVulnerabilitiesOpen ?? '')) {
    issues.push(
      `${prefix} requires validated dependency review Critical/high vulnerabilities open = 0`,
    );
  }
  if (publicationDecision.releaseNotesUpdated !== 'yes') {
    issues.push(
      `${prefix} requires validated dependency review Release notes updated = yes`,
    );
  }
  if (!hasCompletedDependencyReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '')) {
    issues.push(
      `${prefix} requires completed dependency-review release-note update evidence`,
    );
  }
  if (!hasCompletedDependencyChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '')) {
    issues.push(
      `${prefix} requires completed dependency review checklist update evidence`,
    );
  }
  issues.push(
    ...validateDependencyReviewPublicationUpdateBoundary(
      `${prefix}: dependency-review release-note update evidence`,
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      {
        criticalHighVulnerabilitiesMustBeClosed: true,
        requireExactProductionReadyClaimDenied:
          publicationDecision.productionReadyClaimAllowed === 'no',
      },
    ),
  );
  issues.push(
    ...validateDependencyReviewPublicationUpdateBoundary(
      `${prefix}: dependency-review checklist update evidence`,
      publicationDecision.requiredChecklistUpdates ?? '',
      {
        criticalHighVulnerabilitiesMustBeClosed: true,
        requireExactProductionReadyClaimDenied:
          publicationDecision.productionReadyClaimAllowed === 'no',
      },
    ),
  );
  if (
    hasCompletedDependencyReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '') &&
    hasCompletedDependencyChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '') &&
    haveSharedConcreteEvidenceTarget(
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      publicationDecision.requiredChecklistUpdates ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires distinct completed dependency-review release-note and checklist update evidence targets`,
    );
  }
  if (!dependencyReviewerDecisionSummaryIsBounded(publicationDecision)) {
    issues.push(
      `${prefix} requires validated dependency review Reviewer decision summary to bind release support, upstream signer blocker handling, production-ready claim handling, testnet production-candidate claim handling, and critical/high vulnerability closure`,
    );
  }
  if (
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    dependencyReviewerDecisionSummaryClosesCriticalHighVulnerabilities(publicationDecision.reviewerDecisionSummary ?? '') &&
    !dependencyReviewerDecisionSummaryHasExactCriticalHighVulnerabilitiesOpenBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated dependency review Reviewer decision summary to use exact Critical/high vulnerabilities open = 0`,
    );
  }
  issues.push(...validateDependencyReviewerDecisionSummaryTestnetClaimBinding(
    prefix,
    publicationDecision,
  ));
  issues.push(...validateDependencyReviewDecisionSummaryBlockerApprovals(
    prefix,
    publicationDecision.reviewerDecisionSummary ?? '',
  ));

  const upgradeRows = Array.isArray(validation.upgradeRows)
    ? structuredRowObjects(validation.upgradeRows)
    : undefined;
  const signerDecision = upgradeRows?.find(
    row => row.decision === 'Signer dependency upgrade decision',
  );
  if (!signerDecision) {
    issues.push(
      `${prefix} requires validated dependency review signer upgrade decision`,
    );
  } else {
    if (!hasDependencyReviewFailClosedSignerAction(signerDecision.releaseAction)) {
      issues.push(
        `${prefix} requires validated dependency review signer action to keep signer fail-closed and block production-ready plus testnet production-candidate claims`,
      );
    }
    if (!hasDependencyReviewFailClosedSignerEvidence(signerDecision.requiredEvidence, signerDecision.releaseAction)) {
      issues.push(
        `${prefix} requires completed ContextExtension guard evidence for fail-closed signer decision`,
      );
    }
  }

  return issues;
}

function dependencyReviewSupportsProductionCandidate(
  publicationDecision: DependencyReviewEvidenceValidationInput['publicationDecision'] | undefined,
): boolean {
  return (
    publicationDecision?.releaseSupported === 'production deployment candidate' ||
    publicationDecision?.testnetProductionCandidateClaimAllowed === 'yes' ||
    publicationDecision?.upstreamSignerBlockerResolved === 'yes'
  );
}

function validateDependencyReviewPublicationUpdateBoundary(
  label: string,
  text: string,
  options: DependencyReviewPublicationUpdateBoundaryOptions = {},
): string[] {
  const issues = [
    ...validateReleaseGatePublicationClaimBoundary(label, text),
  ];

  if (
    options.requireExactReleaseSupportedProductionDeploymentCandidate &&
    !dependencyReviewPublicationUpdateHasExactReleaseSupportedProductionDeploymentCandidateBinding(text)
  ) {
    issues.push(`${label} must use exact Release supported = production deployment candidate`);
  }
  if (
    options.requireExactTestnetProductionCandidateClaimAllowed &&
    !dependencyReviewPublicationUpdateHasExactTestnetProductionCandidateClaimAllowedBinding(text)
  ) {
    issues.push(`${label} must use exact Testnet production-candidate claim allowed = yes`);
  }
  if (
    options.requireExactProductionReadyClaimDenied &&
    !dependencyReviewPublicationUpdateHasExactProductionReadyClaimDeniedBinding(text)
  ) {
    issues.push(`${label} must use exact Production-ready claim allowed = no`);
  }
  if (
    options.requireExactUpstreamSignerBlockerResolved &&
    !dependencyReviewPublicationUpdateHasExactUpstreamSignerBlockerResolvedBinding(text)
  ) {
    issues.push(`${label} must use exact Upstream signer blocker resolved = yes`);
  }
  if (
    options.requireExactCriticalHighVulnerabilitiesOpen &&
    !dependencyReviewPublicationUpdateHasExactCriticalHighVulnerabilitiesOpenBinding(text)
  ) {
    issues.push(`${label} must use exact Critical/high vulnerabilities open = 0`);
  }
  if (dependencyReviewerNoteApprovesUnresolvedSignerBlocker(text)) {
    issues.push(`${label} must not approve unresolved upstream signer blocker`);
  }
  if (
    options.upstreamSignerBlockerMustBeResolved &&
    dependencyReviewPublicationUpdateLeavesUpstreamSignerBlockerUnresolved(text)
  ) {
    issues.push(`${label} must not leave upstream signer blocker unresolved`);
  }
  if (dependencyReviewerNoteApprovesOpenCriticalHighVulnerabilities(text)) {
    issues.push(`${label} must not approve open critical/high vulnerabilities`);
  }
  if (
    options.criticalHighVulnerabilitiesMustBeClosed &&
    dependencyReviewPublicationEvidenceLeavesCriticalHighVulnerabilitiesOpen(text)
  ) {
    issues.push(`${label} must not leave critical/high vulnerabilities open`);
  }
  if (
    options.testnetProductionCandidateSupportRequired &&
    dependencyReviewPublicationUpdateDeniesTestnetProductionCandidateSupport(text)
  ) {
    issues.push(`${label} must not deny testnet production-candidate claim support`);
  }
  if (dependencyReviewerNoteApprovesFailClosedSignerCandidate(text)) {
    issues.push(`${label} must not approve fail-closed signer blocker as candidate support`);
  }
  if (hasContradictoryValidationFailureMarker(text)) {
    issues.push(`${label} must not mix completed/PASS evidence with failure markers`);
  }
  if (hasContradictoryReleaseNotesDecisionBinding(text)) {
    issues.push(`${label} must not include contradictory release-note decision bindings`);
  }

  return [...new Set(issues)];
}

interface DependencyReviewPublicationUpdateBoundaryOptions {
  upstreamSignerBlockerMustBeResolved?: boolean;
  criticalHighVulnerabilitiesMustBeClosed?: boolean;
  testnetProductionCandidateSupportRequired?: boolean;
  requireExactReleaseSupportedProductionDeploymentCandidate?: boolean;
  requireExactTestnetProductionCandidateClaimAllowed?: boolean;
  requireExactProductionReadyClaimDenied?: boolean;
  requireExactUpstreamSignerBlockerResolved?: boolean;
  requireExactCriticalHighVulnerabilitiesOpen?: boolean;
}

function dependencyReviewPublicationUpdateHasExactReleaseSupportedProductionDeploymentCandidateBinding(
  value: string,
): boolean {
  return /\bRelease supported\s*=\s*production deployment candidate\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function dependencyReviewPublicationUpdateHasExactTestnetProductionCandidateClaimAllowedBinding(
  value: string,
): boolean {
  return dependencyReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(value, 'yes');
}

function dependencyReviewPublicationUpdateHasExactProductionReadyClaimDeniedBinding(value: string): boolean {
  return /\bProduction-ready claim allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function dependencyReviewPublicationUpdateHasExactUpstreamSignerBlockerResolvedBinding(
  value: string,
): boolean {
  return /\bUpstream signer blocker resolved\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function dependencyReviewPublicationUpdateHasExactCriticalHighVulnerabilitiesOpenBinding(
  value: string,
): boolean {
  return dependencyReviewerDecisionSummaryHasExactCriticalHighVulnerabilitiesOpenBinding(value);
}

function dependencyReviewPublicationUpdateLeavesUpstreamSignerBlockerUnresolved(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\bupstream signer blocker resolved (?:no|false|0|blocked|denied|unresolved|open|active|remaining|not resolved)\b/i.test(normalized) ||
    /\bupstream signer blocker (?:unresolved|open|active|remaining|outstanding|not resolved|remains open|still open)\b/i.test(normalized) ||
    /\bsigner blocker (?:unresolved|open|active|remaining|outstanding|not resolved|remains open|still open)\b/i.test(normalized)
  );
}

function dependencyReviewPublicationUpdateDeniesTestnetProductionCandidateSupport(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\btestnet production candidate claim allowed\s+(?:no|false|0|blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\btestnet production candidate claim support\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\btestnet production candidate claims?\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized)
  );
}

function dependencyReviewPublicationEvidenceLeavesCriticalHighVulnerabilitiesOpen(
  value: string,
): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\b(?:critical high|critical and high|critical or high|critical|high) vulnerabilities?\s+open\s+(?:[1-9]\d*)\b/i.test(normalized) ||
    /\bopen (?:critical high|critical and high|critical or high|critical|high) vulnerabilities?\s+(?:[1-9]\d*)\b/i.test(normalized) ||
    /\b(?:critical high|critical and high|critical or high|critical|high) vulnerabilities?\s+(?:remain|remains|still|are still|left)\s+(?:open|unresolved|outstanding)\b/i.test(normalized) ||
    /\b(?:critical high|critical and high|critical or high|critical|high) vulnerabilities?\s+(?:are\s+)?(?:open|remaining|unresolved|outstanding)\b(?!\s+0\b)/i.test(normalized) ||
    /\bopen (?:critical high|critical and high|critical or high|critical|high) vulnerabilities?\s+(?!0\b)\S+\b/i.test(normalized)
  );
}

function isDependencyReviewClassificationGitCommit(value: string | undefined): boolean {
  return /^[a-f0-9]{7,40}$/i.test(value?.trim() ?? '');
}

function dependencyReviewerDecisionSummaryIsBounded(
  publicationDecision: NonNullable<DependencyReviewEvidenceValidationInput['publicationDecision']>,
): boolean {
  const summary = publicationDecision.reviewerDecisionSummary ?? '';
  const normalized = normalizeDecisionSummaryForReleaseGate(summary);
  return (
    /\brelease supported\b/.test(normalized) &&
    /\bupstream signer blocker handling\b|\bsigner blocker handling\b|\bupstream signer blocker resolved\b|\bupstream signer blocker unresolved\b|\bfail closed guard\b|\bfail closed blocker\b/.test(normalized) &&
    /\bproduction ready claim handling\b/.test(normalized) &&
    /\btestnet production candidate claim handling\b/.test(normalized) &&
    /\bcritical high vulnerabilities\b|\bcritical and high vulnerabilities\b|\bcritical or high vulnerabilities\b/.test(normalized) &&
    dependencyReviewerDecisionSummaryClosesCriticalHighVulnerabilities(summary) &&
    (
      publicationDecision.releaseSupported !== 'production deployment candidate' ||
      dependencyReviewerDecisionSummaryHasExactReleaseSupportedProductionDeploymentCandidateBinding(summary)
    ) &&
    dependencyReviewerDecisionSummaryHasExactProductionReadyClaimDeniedBinding(summary) &&
    dependencyReviewerDecisionSummaryHasExactCriticalHighVulnerabilitiesOpenBinding(summary) &&
    (
      publicationDecision.upstreamSignerBlockerResolved !== 'yes' ||
      dependencyReviewerDecisionSummaryHasExactUpstreamSignerBlockerResolvedBinding(summary)
    ) &&
    dependencyReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(
      summary,
      publicationDecision.testnetProductionCandidateClaimAllowed,
    ) &&
    validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'dependency review Reviewer decision summary',
      summary,
      releaseSupported: publicationDecision.releaseSupported,
      productionReadyClaimAllowed: publicationDecision.productionReadyClaimAllowed,
      testnetProductionCandidateClaimAllowed: publicationDecision.testnetProductionCandidateClaimAllowed,
      requireNumericCriticalHighVulnerabilityClosure: true,
    }).length === 0
  );
}

function dependencyReviewerDecisionSummaryClosesCriticalHighVulnerabilities(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\bcritical high vulnerabilities?\s+open\s+0\b/i.test(normalized) ||
    /\bcritical and high vulnerabilities?\s+open\s+0\b/i.test(normalized) ||
    /\bcritical or high vulnerabilities?\s+open\s+0\b/i.test(normalized)
  );
}

function dependencyReviewerDecisionSummaryHasExactProductionReadyClaimDeniedBinding(value: string): boolean {
  return dependencyReviewPublicationUpdateHasExactProductionReadyClaimDeniedBinding(value);
}

function dependencyReviewerDecisionSummaryHasExactReleaseSupportedProductionDeploymentCandidateBinding(
  value: string,
): boolean {
  return dependencyReviewPublicationUpdateHasExactReleaseSupportedProductionDeploymentCandidateBinding(value);
}

function dependencyReviewerDecisionSummaryHasExactUpstreamSignerBlockerResolvedBinding(value: string): boolean {
  return dependencyReviewPublicationUpdateHasExactUpstreamSignerBlockerResolvedBinding(value);
}

function dependencyReviewerDecisionSummaryHasExactCriticalHighVulnerabilitiesOpenBinding(value: string): boolean {
  return /\bCritical\/high vulnerabilities open\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function validateDependencyReviewerDecisionSummaryTestnetClaimBinding(
  prefix: string,
  publicationDecision: NonNullable<DependencyReviewEvidenceValidationInput['publicationDecision']>,
): string[] {
  const testnetClaimAllowed = publicationDecision.testnetProductionCandidateClaimAllowed;
  if (testnetClaimAllowed !== 'yes' && testnetClaimAllowed !== 'no') return [];
  if (isBlankValue(publicationDecision.reviewerDecisionSummary)) return [];
  if (
    dependencyReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
      testnetClaimAllowed,
    )
  ) {
    return [];
  }
  return [
    `${prefix} requires validated dependency review Reviewer decision summary to use exact Testnet production-candidate claim allowed = ${testnetClaimAllowed}`,
  ];
}

function dependencyReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(
  value: string,
  expected: unknown,
): boolean {
  if (expected !== 'yes' && expected !== 'no') return false;
  return new RegExp(`\\bTestnet production-candidate claim allowed\\s*=\\s*${expected}\\s*(?:$|[.;,|)\\]\\r\\n])`, 'i').test(value);
}

function validateDependencyReviewDecisionSummaryBlockerApprovals(
  prefix: string,
  summary: string,
): string[] {
  const issues: string[] = [];
  if (dependencyReviewerNoteApprovesUnresolvedSignerBlocker(summary)) {
    issues.push(
      `${prefix} requires validated dependency review Reviewer decision summary not to approve unresolved upstream signer blocker`,
    );
  }
  if (dependencyReviewerNoteApprovesOpenCriticalHighVulnerabilities(summary)) {
    issues.push(
      `${prefix} requires validated dependency review Reviewer decision summary not to approve open critical/high vulnerabilities`,
    );
  }
  if (dependencyReviewerNoteApprovesFailClosedSignerCandidate(summary)) {
    issues.push(
      `${prefix} requires validated dependency review Reviewer decision summary not to approve fail-closed signer blocker as candidate support`,
    );
  }
  return issues;
}

function validateLinkedSecurityReviewEvidence(
  securityReview: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.securityReviewEvidenceValidation;
  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual independent security review evidence validation input',
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual independent security review evidence validation to pass',
    );
  }
  const evidencePayload = checkedEvidencePayload(securityReview.requiredResolution);
  if (!isValidatedSecurityReviewEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires independent security review row to link a completed security review artifact with security:validate output',
    );
  }

  issues.push(...validateSecurityReviewProductionCandidateFields(
    validation,
    'Release Decision: Testnet production-candidate claims allowed',
    options.cleanCheckoutEvidenceValidation?.classification?.gitCommit,
  ));
  if (validationPassed(validation)) {
    issues.push(...validateSecurityReviewStructuredSummary(
      validation,
      'Release Decision: actual independent security review evidence validation',
    ));
  }

  return issues;
}

function validateSecurityReviewProductionCandidateFields(
  validation: SecurityReviewEvidenceValidationInput,
  prefix: string,
  cleanCheckoutGitCommit?: string,
): string[] {
  const issues: string[] = [];
  const classification = validation.classification ?? {};
  if (classification.releaseLevel !== 'production deployment candidate') {
    issues.push(
      `${prefix} requires validated security review Release level = production deployment candidate`,
    );
  }
  if (classification.environment !== 'testnet') {
    issues.push(
      `${prefix} requires validated security review Environment = testnet`,
    );
  }
  if (!isSecurityReviewClassificationReviewedCommit(classification.reviewedCommit)) {
    issues.push(
      `${prefix} requires validated security review Review Classification Reviewed commit`,
    );
  } else if (
    isCleanCheckoutRunClassificationGitCommit(cleanCheckoutGitCommit) &&
    normalizeGitCommit(classification.reviewedCommit) !== normalizeGitCommit(cleanCheckoutGitCommit)
  ) {
    issues.push(
      `${prefix} requires security review Reviewed commit to match clean checkout Git commit ${cleanCheckoutGitCommit?.trim()}`,
    );
  }
  if (
    isBlankValue(classification.reviewerOrganization) ||
    !isConcreteSecurityReviewerOrganization(classification.reviewerOrganization ?? '')
  ) {
    issues.push(
      `${prefix} requires validated security review Review Classification Reviewer organization to identify a concrete external security reviewer organization or affiliation`,
    );
  }
  if (!isAllowedSecurityReviewerOrganizationType(classification.reviewerOrganizationType)) {
    issues.push(
      `${prefix} requires validated security review Review Classification Reviewer organization type = external audit firm, independent security researcher, or exchange security team`,
    );
  }
  if (classification.reviewerIndependence !== 'independent external') {
    issues.push(
      `${prefix} requires validated security review Review Classification Reviewer independence = independent external`,
    );
  }
  if (isBlankValue(classification.leadReviewer)) {
    issues.push(
      `${prefix} requires validated security review Review Classification Lead reviewer`,
    );
  }
  const reviewPeriod = parseSecurityReviewClassificationPeriod(classification.reviewPeriod);
  if (!reviewPeriod) {
    issues.push(
      `${prefix} requires validated security review Review Classification Review period to use YYYY-MM-DD to YYYY-MM-DD`,
    );
  }
  const normalizedClassificationDate = classification.date?.trim() ?? '';
  if (!isIsoCalendarDate(normalizedClassificationDate)) {
    issues.push(
      `${prefix} requires validated security review Review Classification Date to use YYYY-MM-DD`,
    );
  } else if (reviewPeriod && reviewPeriod.end > normalizedClassificationDate) {
    issues.push(
      `${prefix} requires validated security review Review Classification Review period end date to be on or before Date`,
    );
  }
  if (classification.finalDecision !== 'approve') {
    issues.push(
      `${prefix} requires validated security review Final decision = approve`,
    );
  }

  const publicationDecision = validation.publicationDecision ?? {};
  if (publicationDecision.releaseSupported !== 'production deployment candidate') {
    issues.push(
      `${prefix} requires validated security review Release supported = production deployment candidate`,
    );
  }
  if (publicationDecision.productionReadyClaimAllowed !== 'no') {
    issues.push(
      `${prefix} requires validated security review Production-ready claim allowed = no`,
    );
  }
  if (publicationDecision.testnetProductionCandidateClaimAllowed !== 'yes') {
    issues.push(
      `${prefix} requires validated security review Testnet production-candidate claim allowed = yes`,
    );
  }
  if (!isExactZeroEvidenceValue(publicationDecision.criticalHighFindingsOpen ?? '')) {
    issues.push(
      `${prefix} requires validated security review Critical/high findings open = 0`,
    );
  }
  if (publicationDecision.acceptedRisksReflectedInReleaseNotes !== 'yes') {
    issues.push(
      `${prefix} requires validated security review Accepted risks reflected in release notes = yes`,
    );
  }
  if (!hasCompletedSecurityReviewChecklistUpdateEvidence(publicationDecision.requiredReleaseChecklistUpdates ?? '')) {
    issues.push(
      `${prefix} requires completed Gate 4 accepted-risk checklist update evidence`,
    );
  }
  if (!hasCompletedSecurityReviewReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '')) {
    issues.push(
      `${prefix} requires completed Gate 4 accepted-risk release-note update evidence`,
    );
  }
  const requiresGate4SecurityReviewPublicationUpdateEvidence =
    publicationDecision.releaseSupported === 'production deployment candidate' ||
    publicationDecision.testnetProductionCandidateClaimAllowed === 'yes';
  const securityReviewPublicationUpdateExactBindingRequirements = {
    requireExactReleaseSupportedProductionDeploymentCandidate:
      publicationDecision.releaseSupported === 'production deployment candidate',
    requireExactProductionReadyClaimAllowedNo:
      publicationDecision.productionReadyClaimAllowed === 'no',
    requireExactTestnetProductionCandidateClaimAllowed:
      publicationDecision.testnetProductionCandidateClaimAllowed === 'yes',
    requireExactCriticalHighFindingsOpen:
      isExactZeroEvidenceValue(publicationDecision.criticalHighFindingsOpen ?? ''),
    requireExactPublicationBlockers: requiresGate4SecurityReviewPublicationUpdateEvidence,
    requireExactAcceptedRisksReflected:
      publicationDecision.acceptedRisksReflectedInReleaseNotes === 'yes',
  };
  issues.push(
    ...validateSecurityReviewPublicationUpdateBoundary(
      `${prefix}: Gate 4 accepted-risk checklist update evidence`,
      publicationDecision.requiredReleaseChecklistUpdates ?? '',
      securityReviewPublicationUpdateExactBindingRequirements,
    ),
  );
  issues.push(
    ...validateSecurityReviewPublicationUpdateBoundary(
      `${prefix}: Gate 4 accepted-risk release-note update evidence`,
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      securityReviewPublicationUpdateExactBindingRequirements,
    ),
  );
  if (
    hasCompletedSecurityReviewChecklistUpdateEvidence(publicationDecision.requiredReleaseChecklistUpdates ?? '') &&
    hasCompletedSecurityReviewReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '') &&
    haveSharedConcreteEvidenceTarget(
      publicationDecision.requiredReleaseChecklistUpdates ?? '',
      publicationDecision.requiredReleaseNoteUpdates ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires distinct completed Gate 4 accepted-risk checklist and release-note update evidence targets`,
    );
  }
  if (!securityReviewerDecisionSummaryIsBounded(publicationDecision)) {
    issues.push(
      `${prefix} requires validated security review Reviewer decision summary to bind release support, production-ready claim handling, testnet production-candidate claim handling, critical/high finding closure, and accepted-risk release-note handling`,
    );
  }
  if (
    publicationDecision.releaseSupported === 'production deployment candidate' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !securityReviewerDecisionSummaryHasExactReleaseSupportedProductionDeploymentCandidateBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated security review Reviewer decision summary to use exact Release supported = production deployment candidate`,
    );
  }
  if (
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !securityReviewerDecisionSummaryHasExactProductionReadyClaimDeniedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated security review Reviewer decision summary to use exact Production-ready claim allowed = no`,
    );
  }
  if (
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !securityReviewerDecisionSummaryHasExactAcceptedRisksReflectedBinding(publicationDecision.reviewerDecisionSummary ?? '')
  ) {
    issues.push(
      `${prefix} requires validated security review Reviewer decision summary to use exact Accepted risks reflected in release notes = yes`,
    );
  }
  if (
    isExactZeroEvidenceValue(publicationDecision.criticalHighFindingsOpen ?? '') &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !securityReviewerDecisionSummaryHasExactCriticalHighFindingsOpenBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated security review Reviewer decision summary to use exact Critical/high findings open = 0`,
    );
  }
  if (
    publicationDecision.testnetProductionCandidateClaimAllowed === 'yes' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !securityReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated security review Reviewer decision summary to use exact Testnet production-candidate claim allowed = yes`,
    );
  }
  if (securityReviewerNoteApprovesOpenCriticalHighFindings(publicationDecision.reviewerDecisionSummary ?? '')) {
    issues.push(
      `${prefix} requires validated security review Reviewer decision summary not to approve open critical/high findings`,
    );
  }
  if (securityReviewerNoteApprovesOpenPublicationBlockers(publicationDecision.reviewerDecisionSummary ?? '')) {
    issues.push(
      `${prefix} requires validated security review Reviewer decision summary not to approve open publication blockers`,
    );
  }
  if (
    securityReviewerNoteApprovesAcceptedRisksMissingReleaseArtifacts(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated security review Reviewer decision summary not to approve accepted risks missing release artifacts`,
    );
  }

  return issues;
}

const SECURITY_REVIEWER_ORGANIZATION_TYPES = new Set([
  'external audit firm',
  'independent security researcher',
  'exchange security team',
]);

function isSecurityReviewClassificationReviewedCommit(value: string | undefined): boolean {
  return /^[a-f0-9]{7,40}$/i.test(value?.trim() ?? '');
}

function isAllowedSecurityReviewerOrganizationType(value: string | undefined): boolean {
  return SECURITY_REVIEWER_ORGANIZATION_TYPES.has(value?.trim() ?? '');
}

interface SecurityReviewPublicationUpdateExactBindingRequirements {
  requireExactReleaseSupportedProductionDeploymentCandidate: boolean;
  requireExactProductionReadyClaimAllowedNo: boolean;
  requireExactTestnetProductionCandidateClaimAllowed: boolean;
  requireExactCriticalHighFindingsOpen: boolean;
  requireExactPublicationBlockers: boolean;
  requireExactAcceptedRisksReflected: boolean;
}

function validateSecurityReviewPublicationUpdateBoundary(
  label: string,
  text: string,
  exactBindingRequirements: SecurityReviewPublicationUpdateExactBindingRequirements,
): string[] {
  const issues = [
    ...validateReleaseGatePublicationClaimBoundary(label, text),
  ];

  if (
    exactBindingRequirements.requireExactReleaseSupportedProductionDeploymentCandidate &&
    !hasExactSecurityReviewReleaseSupportedProductionDeploymentCandidateBinding(text)
  ) {
    issues.push(`${label} must use exact Release supported = production deployment candidate`);
  }
  if (
    exactBindingRequirements.requireExactProductionReadyClaimAllowedNo &&
    !hasExactSecurityReviewProductionReadyClaimDeniedBinding(text)
  ) {
    issues.push(`${label} must use exact Production-ready claim allowed = no`);
  }
  if (
    exactBindingRequirements.requireExactTestnetProductionCandidateClaimAllowed &&
    !hasExactSecurityReviewTestnetProductionCandidateClaimAllowedBinding(text)
  ) {
    issues.push(`${label} must use exact Testnet production-candidate claim allowed = yes`);
  }
  if (
    exactBindingRequirements.requireExactCriticalHighFindingsOpen &&
    !hasExactCriticalHighFindingsOpenBinding(text)
  ) {
    issues.push(`${label} must use exact Critical/high findings open = 0`);
  }
  if (
    exactBindingRequirements.requireExactPublicationBlockers &&
    !hasExactSecurityReviewPublicationBlockersBinding(text)
  ) {
    issues.push(`${label} must use exact Publication blockers = 0`);
  }
  if (
    exactBindingRequirements.requireExactAcceptedRisksReflected &&
    !hasExactSecurityReviewAcceptedRisksReflectedBinding(text)
  ) {
    issues.push(`${label} must use exact Accepted risks reflected in release notes = yes`);
  }
  if (securityReviewPublicationUpdateAdmitsPrivateMaintainerContext(text)) {
    issues.push(`${label} must not admit private maintainer context`);
  }
  if (securityReviewPublicationEvidenceLeavesCriticalHighFindingsOpen(text)) {
    issues.push(`${label} must not leave critical/high findings open`);
  }
  if (securityReviewPublicationEvidenceLeavesPublicationBlockersOpen(text)) {
    issues.push(`${label} must not leave security publication blockers open`);
  }
  if (securityReviewPublicationUpdateDeniesTestnetProductionCandidateSupport(text)) {
    issues.push(`${label} must not deny testnet production-candidate claim support`);
  }
  if (securityReviewerNoteApprovesAcceptedRisksMissingReleaseArtifacts(text)) {
    issues.push(`${label} must not approve accepted risks missing release artifacts`);
  }
  if (hasContradictoryValidationFailureMarker(text)) {
    issues.push(`${label} must not mix completed/PASS evidence with failure markers`);
  }
  if (hasContradictoryReleaseNotesDecisionBinding(text)) {
    issues.push(`${label} must not include contradictory release-note decision bindings`);
  }

  return [...new Set(issues)];
}

function securityReviewPublicationUpdateAdmitsPrivateMaintainerContext(value: string): boolean {
  if (/private maintainer context used\s*[:=]?\s*yes/i.test(value)) return true;
  return externalIntegrationReviewerNoteAdmitsPrivateMaintainerContext(value);
}

function securityReviewPublicationEvidenceLeavesCriticalHighFindingsOpen(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\b(?:critical high|critical and high|critical or high|critical|high) findings?\s+open\s+(?:[1-9]\d*)\b/i.test(normalized) ||
    /\bopen (?:critical high|critical and high|critical or high|critical|high) findings?\s+(?:[1-9]\d*)\b/i.test(normalized) ||
    /\b(?:critical high|critical and high|critical or high|critical|high) findings?\s+(?:are\s+)?(?:open|remaining|unresolved|outstanding)\s+(?!0\b)\S+\b/i.test(normalized) ||
    /\bopen (?:critical high|critical and high|critical or high|critical|high) findings?\s+(?!0\b)\S+\b/i.test(normalized)
  );
}

function securityReviewPublicationEvidenceLeavesPublicationBlockersOpen(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\bpublication blockers?\s+(?:[1-9]\d*)\b/i.test(normalized) ||
    /\bpublication blockers?\s+(?:are\s+)?(?:open|remaining|unresolved|outstanding)\s+(?!0\b)\S+\b/i.test(normalized) ||
    /\bopen publication blockers?\s+(?!(?:are\s+)?0\b)\S+\b/i.test(normalized)
  );
}

function securityReviewPublicationUpdateDeniesTestnetProductionCandidateSupport(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\btestnet production candidate claim allowed\s+(?:no|false|0|blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\btestnet production candidate claims?\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized)
  );
}

function parseSecurityReviewClassificationPeriod(
  value: string | undefined,
): { start: string; end: string } | undefined {
  const match = (value?.trim() ?? '').match(/^(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})$/);
  if (!match) return undefined;
  const [, start, end] = match;
  if (!isIsoCalendarDate(start) || !isIsoCalendarDate(end) || start > end) return undefined;
  return { start, end };
}

function securityReviewerDecisionSummaryIsBounded(
  publicationDecision: NonNullable<SecurityReviewEvidenceValidationInput['publicationDecision']>,
): boolean {
  const summary = publicationDecision.reviewerDecisionSummary ?? '';
  const normalized = normalizeDecisionSummaryForReleaseGate(summary);
  return (
    /\brelease supported\b/.test(normalized) &&
    /\bproduction ready claim handling\b/.test(normalized) &&
    securityReviewerDecisionSummaryHasExactProductionReadyClaimDeniedBinding(summary) &&
    /\btestnet production candidate claim handling\b/.test(normalized) &&
    /\bcritical high findings\b|\bcritical and high findings\b|\bcritical or high findings\b/.test(normalized) &&
    securityReviewerDecisionSummaryClosesCriticalHighFindings(summary) &&
    /\baccepted risks?\b/.test(normalized) &&
    securityReviewerDecisionSummaryReflectsAcceptedRisks(summary) &&
    securityReviewerDecisionSummaryHasExactAcceptedRisksReflectedBinding(summary) &&
    (
      publicationDecision.testnetProductionCandidateClaimAllowed !== 'yes' ||
      securityReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(summary)
    ) &&
    validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'security review Reviewer decision summary',
      summary,
      releaseSupported: publicationDecision.releaseSupported,
      productionReadyClaimAllowed: publicationDecision.productionReadyClaimAllowed,
      testnetProductionCandidateClaimAllowed: publicationDecision.testnetProductionCandidateClaimAllowed,
      requireNumericCriticalHighFindingClosure: true,
    }).length === 0
  );
}

function securityReviewerDecisionSummaryClosesCriticalHighFindings(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\bcritical high findings?\s+open\s+0\b/i.test(normalized) ||
    /\bcritical and high findings?\s+open\s+0\b/i.test(normalized) ||
    /\bcritical or high findings?\s+open\s+0\b/i.test(normalized)
  );
}

function securityReviewerDecisionSummaryReflectsAcceptedRisks(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\baccepted risks?\s+(?:reflected|copied|included|covered|documented|updated)\s+(?:in|into|by|through)\s+(?:release notes?|release artifacts?|checklists?)\b/i.test(normalized) ||
    /\b(?:release notes?|release artifacts?|checklists?)\s+(?:reflect|copy|include|cover|document|update)\s+accepted risks?\b/i.test(normalized) ||
    /\baccepted risk\s+release note handling\s+(?:reflected|copied|included|covered|documented|updated)\b/i.test(normalized)
  );
}

function securityReviewerDecisionSummaryHasExactAcceptedRisksReflectedBinding(value: string): boolean {
  return hasExactSecurityReviewAcceptedRisksReflectedBinding(value);
}

function securityReviewerDecisionSummaryHasExactReleaseSupportedProductionDeploymentCandidateBinding(
  value: string,
): boolean {
  return hasExactSecurityReviewReleaseSupportedProductionDeploymentCandidateBinding(value);
}

function securityReviewerDecisionSummaryHasExactProductionReadyClaimDeniedBinding(value: string): boolean {
  return hasExactSecurityReviewProductionReadyClaimDeniedBinding(value);
}

function securityReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return hasExactSecurityReviewTestnetProductionCandidateClaimAllowedBinding(value);
}

function securityReviewerDecisionSummaryHasExactCriticalHighFindingsOpenBinding(value: string): boolean {
  return hasExactCriticalHighFindingsOpenBinding(value);
}

function hasExactSecurityReviewReleaseSupportedProductionDeploymentCandidateBinding(value: string): boolean {
  return /\bRelease supported\s*=\s*production deployment candidate\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactSecurityReviewProductionReadyClaimDeniedBinding(value: string): boolean {
  return /\bProduction-ready claim allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactSecurityReviewTestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return /\bTestnet production-candidate claim allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactSecurityReviewPublicationBlockersBinding(value: string): boolean {
  return /\bPublication blockers\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactSecurityReviewAcceptedRisksReflectedBinding(value: string): boolean {
  return /\bAccepted risks reflected in release notes\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function haveSharedConcreteEvidenceTarget(left: string, right: string): boolean {
  const leftTargets = new Set(
    extractEvidenceTargets(left)
      .map(normalizeEvidenceTarget)
      .filter(isConcreteEvidenceTarget),
  );
  return extractEvidenceTargets(right)
    .map(normalizeEvidenceTarget)
    .filter(isConcreteEvidenceTarget)
    .some(target => leftTargets.has(target));
}

function haveSharedCompletedCommitteeGovernanceEvidenceTarget(left: string, right: string): boolean {
  const leftTargets = new Set(
    extractCompletedCommitteeGovernanceEvidenceTargets(left)
      .map(normalizeEvidenceTarget)
      .filter(isConcreteEvidenceTarget),
  );
  return extractCompletedCommitteeGovernanceEvidenceTargets(right)
    .map(normalizeEvidenceTarget)
    .filter(isConcreteEvidenceTarget)
    .some(target => leftTargets.has(target));
}

function validateLinkedTrustlessBurnEvidence(
  trustlessBurn: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.trustlessBurnEvidenceValidation;
  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual trustless burn evidence validation input',
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual trustless burn evidence validation to pass',
    );
  }
  const evidencePayload = checkedEvidencePayload(trustlessBurn.requiredResolution);
  if (!isValidatedTrustlessBurnEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires trustless burn row to link a completed trustless burn artifact with trustless:validate output',
    );
  }

  issues.push(...validateTrustlessBurnProductionCandidateFields(
    validation,
    'Release Decision: Testnet production-candidate claims allowed',
    options.cleanCheckoutEvidenceValidation?.classification?.gitCommit,
  ));
  if (validationPassed(validation)) {
    issues.push(...validateTrustlessBurnStructuredSummary(
      validation,
      'Release Decision: actual trustless burn evidence validation',
    ));
  }

  return issues;
}

function validateTrustlessBurnProductionCandidateFields(
  validation: TrustlessBurnEvidenceValidationInput,
  prefix: string,
  cleanCheckoutGitCommit?: string,
): string[] {
  const issues: string[] = [];
  const classification = validation.classification ?? {};
  if (classification.releaseLevel !== 'production deployment candidate') {
    issues.push(
      `${prefix} requires validated trustless burn Release level = production deployment candidate`,
    );
  }
  if (classification.environment !== 'testnet') {
    issues.push(
      `${prefix} requires validated trustless burn Environment = testnet`,
    );
  }
  if (classification.trustPath !== 'trustless burn proof path') {
    issues.push(
      `${prefix} requires validated trustless burn Trust path = trustless burn proof path`,
    );
  }
  if (!isTrustlessBurnClassificationGitCommit(classification.gitCommit)) {
    issues.push(
      `${prefix} requires validated trustless burn Evidence Classification Git commit`,
    );
  } else if (
    isCleanCheckoutRunClassificationGitCommit(cleanCheckoutGitCommit) &&
    normalizeGitCommit(classification.gitCommit) !== normalizeGitCommit(cleanCheckoutGitCommit)
  ) {
    issues.push(
      `${prefix} requires trustless burn Git commit to match clean checkout Git commit ${cleanCheckoutGitCommit?.trim()}`,
    );
  }
  if (isBlankValue(classification.reviewer)) {
    issues.push(
      `${prefix} requires validated trustless burn Evidence Classification Reviewer`,
    );
  }
  if (!isIsoCalendarDate(classification.date?.trim() ?? '')) {
    issues.push(
      `${prefix} requires validated trustless burn Evidence Classification Date to use YYYY-MM-DD`,
    );
  }
  if (!isDisabledOrDryRunBroadcastMode(classification.broadcastMode)) {
    issues.push(
      `${prefix} requires validated trustless burn Broadcast mode disabled or dry-run`,
    );
  }

  const publicationDecision = validation.publicationDecision ?? {};
  if (publicationDecision.trustlessBurnVerificationImplemented !== 'yes') {
    issues.push(
      `${prefix} requires validated trustless burn Trustless burn verification implemented = yes`,
    );
  }
  if (publicationDecision.productionReadyClaimAllowed !== 'no') {
    issues.push(
      `${prefix} requires validated trustless burn Production-ready claim allowed = no`,
    );
  }
  if (publicationDecision.testnetProductionCandidateClaimAllowed !== 'yes') {
    issues.push(
      `${prefix} requires validated trustless burn Testnet production-candidate claim allowed = yes`,
    );
  }
  if (publicationDecision.transitionalTrustedBurnPathDisabled !== 'yes') {
    issues.push(
      `${prefix} requires validated trustless burn Transitional trusted burn path disabled = yes`,
    );
  }
  if (!isExactZeroEvidenceValue(publicationDecision.criticalHighFindingsOpen ?? '')) {
    issues.push(
      `${prefix} requires validated trustless burn Critical/high findings open = 0`,
    );
  }
  if (publicationDecision.releaseNotesUpdated !== 'yes') {
    issues.push(
      `${prefix} requires validated trustless burn Release notes updated = yes`,
    );
  }
  if (!hasCompletedTrustlessBurnChecklistUpdateEvidence(publicationDecision.requiredReleaseChecklistUpdates ?? '')) {
    issues.push(
      `${prefix} requires completed Gate 5 checklist update evidence`,
    );
  }
  if (!hasCompletedTrustlessBurnReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '')) {
    issues.push(
      `${prefix} requires completed Gate 5 release-note update evidence`,
    );
  }
  issues.push(
    ...validateTrustlessBurnPublicationUpdateBoundary(
      `${prefix}: Gate 5 checklist update evidence`,
      publicationDecision.requiredReleaseChecklistUpdates ?? '',
      {
        requireExactTrustlessBurnVerificationImplemented:
          publicationDecision.trustlessBurnVerificationImplemented === 'yes',
        requireExactReleaseSupportedProductionDeploymentCandidate:
          classification.releaseLevel === 'production deployment candidate',
        requireExactProductionReadyClaimAllowedNo:
          publicationDecision.productionReadyClaimAllowed === 'no',
        requireExactTestnetProductionCandidateClaimAllowed:
          publicationDecision.testnetProductionCandidateClaimAllowed === 'yes',
        requireExactTransitionalTrustedBurnPathDisabled:
          publicationDecision.transitionalTrustedBurnPathDisabled === 'yes',
        requireExactCriticalHighFindingsOpen:
          isExactZeroEvidenceValue(publicationDecision.criticalHighFindingsOpen ?? ''),
      },
    ),
  );
  issues.push(
    ...validateTrustlessBurnPublicationUpdateBoundary(
      `${prefix}: Gate 5 release-note update evidence`,
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      {
        requireExactTrustlessBurnVerificationImplemented:
          publicationDecision.trustlessBurnVerificationImplemented === 'yes',
        requireExactReleaseSupportedProductionDeploymentCandidate:
          classification.releaseLevel === 'production deployment candidate',
        requireExactProductionReadyClaimAllowedNo:
          publicationDecision.productionReadyClaimAllowed === 'no',
        requireExactTestnetProductionCandidateClaimAllowed:
          publicationDecision.testnetProductionCandidateClaimAllowed === 'yes',
        requireExactTransitionalTrustedBurnPathDisabled:
          publicationDecision.transitionalTrustedBurnPathDisabled === 'yes',
        requireExactCriticalHighFindingsOpen:
          isExactZeroEvidenceValue(publicationDecision.criticalHighFindingsOpen ?? ''),
      },
    ),
  );
  if (
    hasCompletedTrustlessBurnChecklistUpdateEvidence(publicationDecision.requiredReleaseChecklistUpdates ?? '') &&
    hasCompletedTrustlessBurnReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '') &&
    haveSharedConcreteEvidenceTarget(
      publicationDecision.requiredReleaseChecklistUpdates ?? '',
      publicationDecision.requiredReleaseNoteUpdates ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires distinct completed Gate 5 checklist and release-note update evidence targets`,
    );
  }
  if (!trustlessBurnReviewerDecisionSummaryIsBounded(validation)) {
    issues.push(
      `${prefix} requires validated trustless burn Reviewer decision summary to bind release support, trustless burn verification, production-ready claim handling, testnet production-candidate claim handling, transitional trusted burn path disabled handling, and critical/high finding closure`,
    );
  }
  if (
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !trustlessBurnReviewerDecisionSummaryHasExactTrustlessBurnVerificationImplementedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated trustless burn Reviewer decision summary to use exact Trustless burn verification implemented = yes`,
    );
  }
  if (
    classification.releaseLevel === 'production deployment candidate' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !trustlessBurnReviewerDecisionSummaryHasExactReleaseSupportedProductionDeploymentCandidateBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated trustless burn Reviewer decision summary to use exact Release supported = production deployment candidate`,
    );
  }
  if (
    publicationDecision.productionReadyClaimAllowed === 'no' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !trustlessBurnReviewerDecisionSummaryHasExactProductionReadyClaimDeniedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated trustless burn Reviewer decision summary to use exact Production-ready claim allowed = no`,
    );
  }
  if (
    publicationDecision.testnetProductionCandidateClaimAllowed === 'yes' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !trustlessBurnReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated trustless burn Reviewer decision summary to use exact Testnet production-candidate claim allowed = yes`,
    );
  }
  if (
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    trustlessBurnReviewerDecisionSummaryDisablesTransitionalPath(
      publicationDecision.reviewerDecisionSummary ?? '',
    ) &&
    !trustlessBurnReviewerDecisionSummaryHasExactTransitionalTrustedBurnPathDisabledBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated trustless burn Reviewer decision summary to use exact Transitional trusted burn path disabled = yes`,
    );
  }
  if (
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    trustlessBurnReviewerDecisionSummaryClosesCriticalHighFindings(
      publicationDecision.reviewerDecisionSummary ?? '',
    ) &&
    !trustlessBurnReviewerDecisionSummaryHasExactCriticalHighFindingsOpenBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated trustless burn Reviewer decision summary to use exact Critical/high findings open = 0`,
    );
  }
  issues.push(...validateTrustlessBurnReviewerDecisionSummaryFallbackApprovals(
    publicationDecision.reviewerDecisionSummary ?? '',
    prefix,
  ));

  return issues;
}

function isTrustlessBurnClassificationGitCommit(value: string | undefined): boolean {
  return /^[a-f0-9]{7,40}$/i.test(value?.trim() ?? '');
}

interface TrustlessBurnPublicationUpdateExactBindingRequirements {
  requireExactTrustlessBurnVerificationImplemented: boolean;
  requireExactReleaseSupportedProductionDeploymentCandidate: boolean;
  requireExactProductionReadyClaimAllowedNo: boolean;
  requireExactTestnetProductionCandidateClaimAllowed: boolean;
  requireExactTransitionalTrustedBurnPathDisabled: boolean;
  requireExactCriticalHighFindingsOpen: boolean;
}

function validateTrustlessBurnPublicationUpdateBoundary(
  label: string,
  text: string,
  exactBindingRequirements: TrustlessBurnPublicationUpdateExactBindingRequirements,
): string[] {
  const issues = [
    ...validateReleaseGatePublicationClaimBoundary(label, text),
  ];

  if (
    exactBindingRequirements.requireExactTrustlessBurnVerificationImplemented &&
    !hasExactTrustlessBurnVerificationImplementedBinding(text)
  ) {
    issues.push(`${label} must use exact Trustless burn verification implemented = yes`);
  }
  if (
    exactBindingRequirements.requireExactReleaseSupportedProductionDeploymentCandidate &&
    !hasExactTrustlessBurnReleaseSupportedProductionDeploymentCandidateBinding(text)
  ) {
    issues.push(`${label} must use exact Release supported = production deployment candidate`);
  }
  if (
    exactBindingRequirements.requireExactProductionReadyClaimAllowedNo &&
    !hasExactTrustlessBurnProductionReadyClaimDeniedBinding(text)
  ) {
    issues.push(`${label} must use exact Production-ready claim allowed = no`);
  }
  if (
    exactBindingRequirements.requireExactTestnetProductionCandidateClaimAllowed &&
    !hasExactTrustlessBurnTestnetProductionCandidateClaimAllowedBinding(text)
  ) {
    issues.push(`${label} must use exact Testnet production-candidate claim allowed = yes`);
  }
  if (trustlessBurnReviewerNoteApprovesTransitionalTrustedPath(text)) {
    issues.push(`${label} must not approve transitional trusted burn path wording`);
  }
  if (trustlessBurnReviewerNoteApprovesTrustedOracleFallback(text)) {
    issues.push(`${label} must not approve trusted-oracle fallback wording`);
  }
  if (trustlessBurnPublicationEvidenceLeavesVerificationUnimplemented(text)) {
    issues.push(`${label} must not leave trustless burn verification unimplemented`);
  }
  if (trustlessBurnPublicationEvidenceLeavesTransitionalTrustedPathEnabled(text)) {
    issues.push(`${label} must not leave transitional trusted burn path enabled`);
  }
  if (
    exactBindingRequirements.requireExactTransitionalTrustedBurnPathDisabled &&
    !hasExactTransitionalTrustedBurnPathDisabledBinding(text)
  ) {
    issues.push(`${label} must use exact Transitional trusted burn path disabled = yes`);
  }
  if (trustlessBurnPublicationEvidenceLeavesCriticalHighFindingsOpen(text)) {
    issues.push(`${label} must not leave critical/high findings open`);
  }
  if (
    exactBindingRequirements.requireExactCriticalHighFindingsOpen &&
    !hasExactCriticalHighFindingsOpenBinding(text)
  ) {
    issues.push(`${label} must use exact Critical/high findings open = 0`);
  }
  if (trustlessBurnPublicationUpdateDeniesTestnetProductionCandidateSupport(text)) {
    issues.push(`${label} must not deny testnet production-candidate claim support`);
  }
  if (hasContradictoryValidationFailureMarker(text)) {
    issues.push(`${label} must not mix completed/PASS evidence with failure markers`);
  }
  if (hasContradictoryReleaseNotesDecisionBinding(text)) {
    issues.push(`${label} must not include contradictory release-note decision bindings`);
  }

  return [...new Set(issues)];
}

function trustlessBurnPublicationUpdateDeniesTestnetProductionCandidateSupport(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\btestnet production candidate claim allowed\s+(?:no|false|0|blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\btestnet production candidate claim support\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\btestnet production candidate claims?\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized)
  );
}

function trustlessBurnPublicationEvidenceLeavesVerificationUnimplemented(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\btrustless burn verification implemented\s+(?:no|false|0)\b/i.test(normalized) ||
    /\btrustless burn verification\s+(?:not implemented|unimplemented|missing|absent|incomplete)\b/i.test(normalized) ||
    /\btrustless burn proof path\s+(?:not implemented|unimplemented|missing|absent|incomplete)\b/i.test(normalized)
  );
}

function trustlessBurnPublicationEvidenceLeavesTransitionalTrustedPathEnabled(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\btransitional trusted burn path disabled\s+(?:no|false|0)\b/i.test(normalized) ||
    /\btransitional trusted burn path\s+(?:enabled|active|remaining|unresolved|outstanding)\b/i.test(normalized) ||
    /\btrusted burn path\s+(?:enabled|active|remaining|unresolved|outstanding)\b/i.test(normalized)
  );
}

function trustlessBurnPublicationEvidenceLeavesCriticalHighFindingsOpen(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\b(?:critical high|critical and high|critical or high|critical|high) findings?\s+open\s+(?:[1-9]\d*)\b/i.test(normalized) ||
    /\bopen (?:critical high|critical and high|critical or high|critical|high) findings?\s+(?:[1-9]\d*)\b/i.test(normalized) ||
    /\b(?:critical high|critical and high|critical or high|critical|high) findings?\s+(?:are\s+)?(?:open|remaining|unresolved|outstanding)\s+(?!0\b)\S+\b/i.test(normalized) ||
    /\bopen (?:critical high|critical and high|critical or high|critical|high) findings?\s+(?!0\b)\S+\b/i.test(normalized)
  );
}

function trustlessBurnReviewerDecisionSummaryIsBounded(
  validation: TrustlessBurnEvidenceValidationInput,
): boolean {
  const publicationDecision = validation.publicationDecision ?? {};
  const summary = publicationDecision.reviewerDecisionSummary ?? '';
  const normalized = normalizeDecisionSummaryForReleaseGate(summary);
  return (
    /\brelease supported\b/i.test(normalized) &&
    /\btrustless burn verification implemented\b|\btrustless burn verification implementation\b|\btrustless burn implemented\b/i.test(normalized) &&
    trustlessBurnReviewerDecisionSummaryHasExactTrustlessBurnVerificationImplementedBinding(summary) &&
    /\bproduction ready claim handling\b/i.test(normalized) &&
    /\btestnet production candidate claim handling\b/i.test(normalized) &&
    (
      publicationDecision.testnetProductionCandidateClaimAllowed !== 'yes' ||
      trustlessBurnReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(summary)
    ) &&
    /\btransitional trusted burn path handling\b/i.test(normalized) &&
    trustlessBurnReviewerDecisionSummaryHasExactTransitionalTrustedBurnPathDisabledBinding(summary) &&
    /\bcritical high findings\b|\bcritical and high findings\b|\bcritical or high findings\b/i.test(normalized) &&
    trustlessBurnReviewerDecisionSummaryHasExactCriticalHighFindingsOpenBinding(summary) &&
    !trustlessBurnReviewerDecisionSummaryApprovesTrustedFallbackPath(summary) &&
    validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'trustless burn Reviewer decision summary',
      summary,
      releaseSupported: validation.classification?.releaseLevel,
      releaseSupportFieldLabel: 'Release level',
      productionReadyClaimAllowed: publicationDecision.productionReadyClaimAllowed,
      testnetProductionCandidateClaimAllowed: publicationDecision.testnetProductionCandidateClaimAllowed,
      requireNumericCriticalHighFindingClosure: true,
    }).length === 0
  );
}

function trustlessBurnReviewerDecisionSummaryApprovesTrustedFallbackPath(summary: string): boolean {
  return (
    trustlessBurnReviewerNoteApprovesTransitionalTrustedPath(summary) ||
    trustlessBurnReviewerNoteApprovesTrustedOracleFallback(summary)
  );
}

function validateTrustlessBurnReviewerDecisionSummaryFallbackApprovals(summary: string, prefix: string): string[] {
  const issues: string[] = [];
  if (trustlessBurnReviewerNoteApprovesTransitionalTrustedPath(summary)) {
    issues.push(
      `${prefix} requires validated trustless burn Reviewer decision summary not to approve transitional trusted burn path wording`,
    );
  }
  if (trustlessBurnReviewerNoteApprovesTrustedOracleFallback(summary)) {
    issues.push(
      `${prefix} requires validated trustless burn Reviewer decision summary not to approve trusted-oracle fallback wording`,
    );
  }
  return issues;
}

function trustlessBurnReviewerDecisionSummaryHasExactTransitionalTrustedBurnPathDisabledBinding(value: string): boolean {
  return hasExactTransitionalTrustedBurnPathDisabledBinding(value);
}

function hasExactTrustlessBurnVerificationImplementedBinding(value: string): boolean {
  return /\bTrustless burn verification implemented\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactTrustlessBurnReleaseSupportedProductionDeploymentCandidateBinding(value: string): boolean {
  return /\bRelease supported\s*=\s*production deployment candidate\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactTrustlessBurnProductionReadyClaimDeniedBinding(value: string): boolean {
  return /\bProduction-ready claim allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactTrustlessBurnTestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return /\bTestnet production-candidate claim allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactTransitionalTrustedBurnPathDisabledBinding(value: string): boolean {
  return /\bTransitional trusted burn path disabled\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactCriticalHighFindingsOpenBinding(value: string): boolean {
  return /\bCritical\/high findings open\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function trustlessBurnReviewerDecisionSummaryHasExactTrustlessBurnVerificationImplementedBinding(value: string): boolean {
  return hasExactTrustlessBurnVerificationImplementedBinding(value);
}

function trustlessBurnReviewerDecisionSummaryHasExactReleaseSupportedProductionDeploymentCandidateBinding(
  value: string,
): boolean {
  return hasExactTrustlessBurnReleaseSupportedProductionDeploymentCandidateBinding(value);
}

function trustlessBurnReviewerDecisionSummaryHasExactProductionReadyClaimDeniedBinding(value: string): boolean {
  return hasExactTrustlessBurnProductionReadyClaimDeniedBinding(value);
}

function trustlessBurnReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return hasExactTrustlessBurnTestnetProductionCandidateClaimAllowedBinding(value);
}

function trustlessBurnReviewerDecisionSummaryHasExactCriticalHighFindingsOpenBinding(value: string): boolean {
  return hasExactCriticalHighFindingsOpenBinding(value);
}

function trustlessBurnReviewerDecisionSummaryDisablesTransitionalPath(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    trustlessBurnReviewerDecisionSummaryHasExactTransitionalTrustedBurnPathDisabledBinding(value) ||
    /\btransitional trusted burn path handling\s+(?:disabled|blocked|not allowed)\b/i.test(normalized)
  );
}

function trustlessBurnReviewerDecisionSummaryClosesCriticalHighFindings(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    trustlessBurnReviewerDecisionSummaryHasExactCriticalHighFindingsOpenBinding(value) ||
    /\bcritical high findings?\s+open\s+0\b/i.test(normalized) ||
    /\bcritical and high findings?\s+open\s+0\b/i.test(normalized) ||
    /\bcritical or high findings?\s+open\s+0\b/i.test(normalized)
  );
}

function normalizeDecisionSummaryForReleaseGate(value: string): string {
  return normalizeEvidenceMarkerText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function validateLinkedBenchmarkEvidence(
  benchmark: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.benchmarkEvidenceValidation;
  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual benchmark evidence validation input',
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual benchmark evidence validation to pass',
    );
  }
  const evidencePayload = checkedEvidencePayload(benchmark.requiredResolution);
  if (!isValidatedBenchmarkEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires benchmark row to link a completed benchmark artifact with benchmark:validate output',
    );
  }

  issues.push(...validateBenchmarkProductionCandidateFields(
    validation,
    'Release Decision: Testnet production-candidate claims allowed',
    options.cleanCheckoutEvidenceValidation?.classification?.gitCommit,
  ));
  if (validationPassed(validation)) {
    issues.push(...validateBenchmarkStructuredSummary(
      validation,
      'Release Decision: actual benchmark evidence validation',
      options,
    ));
  }

  return issues;
}

function validateBenchmarkProductionCandidateFields(
  validation: BenchmarkEvidenceValidationInput,
  prefix: string,
  cleanCheckoutGitCommit?: string,
): string[] {
  const issues: string[] = [];
  const classification = validation.classification ?? {};
  if (classification.releaseLevel !== 'production deployment candidate') {
    issues.push(
      `${prefix} requires validated benchmark Release level = production deployment candidate`,
    );
  }
  if (classification.environment !== 'testnet') {
    issues.push(
      `${prefix} requires validated benchmark Environment = testnet`,
    );
  }
  if (classification.broadcastMode !== 'enabled') {
    issues.push(
      `${prefix} requires validated benchmark live batch Broadcast mode = enabled`,
    );
  }
  if (!isBenchmarkClassificationGitCommit(classification.gitCommit)) {
    issues.push(
      `${prefix} requires validated benchmark Benchmark Classification Git commit`,
    );
  } else if (
    isCleanCheckoutRunClassificationGitCommit(cleanCheckoutGitCommit) &&
    normalizeGitCommit(classification.gitCommit) !== normalizeGitCommit(cleanCheckoutGitCommit)
  ) {
    issues.push(
      `${prefix} requires benchmark Git commit to match clean checkout Git commit ${cleanCheckoutGitCommit?.trim()}`,
    );
  }
  if (classification.trustPath !== 'trustless burn proof path') {
    issues.push(
      `${prefix} requires validated benchmark Trust path = trustless burn proof path`,
    );
  }
  if (!hasBenchmarkReproducibleMachineToolchainMetadata(classification)) {
    issues.push(
      `${prefix} requires validated benchmark reproducible machine/toolchain metadata`,
    );
  }
  if (isBlankValue(classification.reviewer)) {
    issues.push(
      `${prefix} requires validated benchmark Benchmark Classification Reviewer`,
    );
  }
  if (!isIsoCalendarDate(classification.date?.trim() ?? '')) {
    issues.push(
      `${prefix} requires validated benchmark Benchmark Classification Date to use YYYY-MM-DD`,
    );
  }

  const publicationDecision = validation.publicationDecision ?? {};
  if (publicationDecision.releaseSupported !== 'production deployment candidate') {
    issues.push(
      `${prefix} requires validated benchmark Release supported = production deployment candidate`,
    );
  }
  if (publicationDecision.scalingClaimsAllowed !== 'yes') {
    issues.push(
      `${prefix} requires validated benchmark Scaling claims allowed = yes`,
    );
  }
  if (publicationDecision.productionReadyClaimAllowed !== 'no') {
    issues.push(
      `${prefix} requires validated benchmark Production-ready claim allowed = no`,
    );
  }
  if (publicationDecision.testnetProductionCandidateClaimAllowed !== 'yes') {
    issues.push(
      `${prefix} requires validated benchmark Testnet production-candidate claim allowed = yes`,
    );
  }
  if (publicationDecision.productionThroughputClaimAllowed !== 'no') {
    issues.push(
      `${prefix} requires validated benchmark Production throughput claim allowed = no`,
    );
  }
  if (publicationDecision.mainnetGradeEvidenceLinked !== 'no') {
    issues.push(
      `${prefix} requires validated benchmark Mainnet-grade evidence linked = no`,
    );
  }
  if (!isExactZeroEvidenceValue(publicationDecision.openBenchmarkBlockers ?? '')) {
    issues.push(
      `${prefix} requires validated benchmark Open benchmark blockers = 0`,
    );
  }
  if (publicationDecision.releaseNotesUpdated !== 'yes') {
    issues.push(
      `${prefix} requires validated benchmark Release notes updated = yes`,
    );
  }
  if (!hasCompletedBenchmarkReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '')) {
    issues.push(
      `${prefix} requires completed Gate 7 benchmark release-note update evidence`,
    );
  }
  if (!hasCompletedBenchmarkChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '')) {
    issues.push(
      `${prefix} requires completed Gate 7 benchmark checklist update evidence`,
    );
  }
  issues.push(
    ...validateBenchmarkPublicationUpdateClaimBoundary(
      `${prefix}: Gate 7 benchmark release-note update evidence`,
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      {
        requireExactReleaseSupported:
          publicationDecision.releaseSupported === 'production deployment candidate',
        requireExactScalingClaimsAllowed:
          publicationDecision.scalingClaimsAllowed === 'yes',
        requireExactProductionReadyClaimAllowedNo:
          publicationDecision.productionReadyClaimAllowed === 'no',
        requireExactTestnetProductionCandidateClaimAllowed:
          publicationDecision.testnetProductionCandidateClaimAllowed === 'yes',
        requireExactProductionThroughputClaimAllowed:
          publicationDecision.productionThroughputClaimAllowed === 'no',
        requireExactMainnetGradeEvidenceLinkedNo:
          publicationDecision.mainnetGradeEvidenceLinked === 'no',
        requireExactOpenBenchmarkBlockers:
          isExactZeroEvidenceValue(publicationDecision.openBenchmarkBlockers ?? ''),
      },
    ),
  );
  issues.push(
    ...validateBenchmarkPublicationUpdateClaimBoundary(
      `${prefix}: Gate 7 benchmark checklist update evidence`,
      publicationDecision.requiredChecklistUpdates ?? '',
      {
        requireExactReleaseSupported:
          publicationDecision.releaseSupported === 'production deployment candidate',
        requireExactScalingClaimsAllowed:
          publicationDecision.scalingClaimsAllowed === 'yes',
        requireExactProductionReadyClaimAllowedNo:
          publicationDecision.productionReadyClaimAllowed === 'no',
        requireExactTestnetProductionCandidateClaimAllowed:
          publicationDecision.testnetProductionCandidateClaimAllowed === 'yes',
        requireExactProductionThroughputClaimAllowed:
          publicationDecision.productionThroughputClaimAllowed === 'no',
        requireExactMainnetGradeEvidenceLinkedNo:
          publicationDecision.mainnetGradeEvidenceLinked === 'no',
        requireExactOpenBenchmarkBlockers:
          isExactZeroEvidenceValue(publicationDecision.openBenchmarkBlockers ?? ''),
      },
    ),
  );
  if (
    hasCompletedBenchmarkReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '') &&
    hasCompletedBenchmarkChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '') &&
    haveSharedConcreteEvidenceTarget(
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      publicationDecision.requiredChecklistUpdates ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires distinct completed Gate 7 benchmark release-note and checklist update evidence targets`,
    );
  }
  if (!benchmarkReviewerDecisionSummaryIsBounded(publicationDecision)) {
    issues.push(
      `${prefix} requires validated benchmark Reviewer decision summary to bind release support, measured single/batch/sharded evidence, production-ready claim handling, testnet production-candidate claim handling, production throughput claim handling, and open benchmark blocker handling`,
    );
  }
  if (
    publicationDecision.releaseSupported === 'production deployment candidate' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !benchmarkReviewerDecisionSummaryHasExactReleaseSupportedBinding(publicationDecision.reviewerDecisionSummary ?? '')
  ) {
    issues.push(
      `${prefix} requires validated benchmark Reviewer decision summary to use exact Release supported = production deployment candidate`,
    );
  }
  if (
    publicationDecision.scalingClaimsAllowed === 'yes' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !benchmarkReviewerDecisionSummaryHasExactScalingClaimsAllowedBinding(publicationDecision.reviewerDecisionSummary ?? '')
  ) {
    issues.push(
      `${prefix} requires validated benchmark Reviewer decision summary to use exact Scaling claims allowed = yes`,
    );
  }
  if (
    publicationDecision.mainnetGradeEvidenceLinked === 'no' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !benchmarkReviewerDecisionSummaryHasExactMainnetGradeEvidenceLinkedNoBinding(publicationDecision.reviewerDecisionSummary ?? '')
  ) {
    issues.push(
      `${prefix} requires validated benchmark Reviewer decision summary to use exact Mainnet-grade evidence linked = no`,
    );
  }
  if (
    publicationDecision.productionReadyClaimAllowed === 'no' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !benchmarkReviewerDecisionSummaryHasExactProductionReadyClaimDeniedBinding(publicationDecision.reviewerDecisionSummary ?? '')
  ) {
    issues.push(
      `${prefix} requires validated benchmark Reviewer decision summary to use exact Production-ready claim allowed = no`,
    );
  }
  if (
    publicationDecision.testnetProductionCandidateClaimAllowed === 'yes' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !benchmarkReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated benchmark Reviewer decision summary to use exact Testnet production-candidate claim allowed = yes`,
    );
  }
  if (
    benchmarkReviewerDecisionSummaryClosesOpenBenchmarkBlockers(publicationDecision.reviewerDecisionSummary ?? '') &&
    !benchmarkReviewerDecisionSummaryHasExactOpenBenchmarkBlockersBinding(publicationDecision.reviewerDecisionSummary ?? '')
  ) {
    issues.push(
      `${prefix} requires validated benchmark Reviewer decision summary to use exact Open benchmark blockers = 0`,
    );
  }
  if (
    benchmarkReviewerDecisionSummaryBlocksProductionThroughput(
      publicationDecision.reviewerDecisionSummary ?? '',
      publicationDecision.productionThroughputClaimAllowed,
    ) &&
    !benchmarkReviewerDecisionSummaryHasExactProductionThroughputClaimBlockedBinding(publicationDecision.reviewerDecisionSummary ?? '')
  ) {
    issues.push(
      `${prefix} requires validated benchmark Reviewer decision summary to use exact Production throughput claim allowed = no`,
    );
  }
  if (benchmarkReviewerDecisionSummaryApprovesProductionThroughput(publicationDecision.reviewerDecisionSummary ?? '')) {
    issues.push(
      `${prefix} requires validated benchmark Reviewer decision summary not to approve production throughput claim wording`,
    );
  }
  if (benchmarkReviewerDecisionSummaryApprovesFullParallelL1Settlement(publicationDecision.reviewerDecisionSummary ?? '')) {
    issues.push(
      `${prefix} requires validated benchmark Reviewer decision summary not to approve full parallel L1 settlement while SPVTracker remains shared`,
    );
  }

  return issues;
}

function isBenchmarkClassificationGitCommit(value: string | undefined): boolean {
  return /^[a-f0-9]{7,40}$/i.test(value?.trim() ?? '');
}

function hasBenchmarkReproducibleMachineToolchainMetadata(
  classification: Partial<BenchmarkClassificationFields>,
): boolean {
  return [
    classification.machineProfile,
    classification.nodeVersion,
    classification.rustVersion,
    classification.wasmPackVersion,
  ].every(value => !isBlankValue(value));
}

interface BenchmarkPublicationUpdateExactBindingRequirements {
  requireExactReleaseSupported: boolean;
  requireExactScalingClaimsAllowed: boolean;
  requireExactProductionReadyClaimAllowedNo: boolean;
  requireExactTestnetProductionCandidateClaimAllowed: boolean;
  requireExactProductionThroughputClaimAllowed: boolean;
  requireExactMainnetGradeEvidenceLinkedNo: boolean;
  requireExactOpenBenchmarkBlockers: boolean;
}

function validateBenchmarkPublicationUpdateClaimBoundary(
  label: string,
  text: string,
  exactBindingRequirements: BenchmarkPublicationUpdateExactBindingRequirements,
): string[] {
  const issues = [
    ...validateReleaseGatePublicationClaimBoundary(label, text),
  ];

  if (
    exactBindingRequirements.requireExactReleaseSupported &&
    !hasExactBenchmarkReleaseSupportedBinding(text)
  ) {
    issues.push(`${label} must use exact Release supported = production deployment candidate`);
  }
  if (
    exactBindingRequirements.requireExactScalingClaimsAllowed &&
    !hasExactBenchmarkScalingClaimsAllowedBinding(text)
  ) {
    issues.push(`${label} must use exact Scaling claims allowed = yes`);
  }
  if (
    exactBindingRequirements.requireExactProductionReadyClaimAllowedNo &&
    !hasExactBenchmarkProductionReadyClaimDeniedBinding(text)
  ) {
    issues.push(`${label} must use exact Production-ready claim allowed = no`);
  }
  if (
    exactBindingRequirements.requireExactTestnetProductionCandidateClaimAllowed &&
    !hasExactBenchmarkTestnetProductionCandidateClaimAllowedBinding(text)
  ) {
    issues.push(`${label} must use exact Testnet production-candidate claim allowed = yes`);
  }
  if (
    exactBindingRequirements.requireExactProductionThroughputClaimAllowed &&
    !hasExactBenchmarkProductionThroughputClaimBlockedBinding(text)
  ) {
    issues.push(`${label} must use exact Production throughput claim allowed = no`);
  }
  if (
    exactBindingRequirements.requireExactMainnetGradeEvidenceLinkedNo &&
    !hasExactBenchmarkMainnetGradeEvidenceLinkedNoBinding(text)
  ) {
    issues.push(`${label} must use exact Mainnet-grade evidence linked = no`);
  }
  if (benchmarkReviewerDecisionSummaryApprovesProductionThroughput(text)) {
    issues.push(`${label} must not approve production throughput claim wording`);
  }
  if (benchmarkReviewerDecisionSummaryApprovesFullParallelL1Settlement(text)) {
    issues.push(
      `${label} must not approve full parallel L1 settlement while SPVTracker remains shared`,
    );
  }
  if (benchmarkPublicationEvidenceDeniesScalingClaims(text)) {
    issues.push(`${label} must not deny scaling claim support`);
  }
  if (benchmarkPublicationEvidenceClaimsMainnetGradeEvidence(text)) {
    issues.push(`${label} must not claim mainnet-grade evidence`);
  }
  if (benchmarkPublicationEvidenceLeavesOpenBlockers(text)) {
    issues.push(`${label} must not leave benchmark blockers open`);
  }
  if (
    exactBindingRequirements.requireExactOpenBenchmarkBlockers &&
    !hasExactOpenBenchmarkBlockersBinding(text)
  ) {
    issues.push(`${label} must use exact Open benchmark blockers = 0`);
  }
  if (benchmarkPublicationEvidenceDeniesTestnetProductionCandidateSupport(text)) {
    issues.push(`${label} must not deny testnet production-candidate claim support`);
  }
  if (hasContradictoryValidationFailureMarker(text)) {
    issues.push(`${label} must not mix completed/PASS evidence with failure markers`);
  }
  if (hasContradictoryReleaseNotesDecisionBinding(text)) {
    issues.push(`${label} must not include contradictory release-note decision bindings`);
  }

  return [...new Set(issues)];
}

function benchmarkPublicationEvidenceDeniesTestnetProductionCandidateSupport(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\btestnet production candidate claim allowed\s+(?:no|false|0|blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\btestnet production candidate claim support\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\btestnet production candidate claims?\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized)
  );
}

function benchmarkPublicationEvidenceDeniesScalingClaims(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\bscaling claims? allowed\s+(?:no|false|0|blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\bscaling claims?\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized)
  );
}

function benchmarkPublicationEvidenceClaimsMainnetGradeEvidence(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\bmainnet grade evidence linked\s+(?:yes|true|1)\b/i.test(normalized) ||
    /\bmainnet grade evidence\s+(?:linked|available|complete|completed|provided)\b(?!\s+(?:no|false|0|blocked|denied|disallowed|forbidden|not allowed)\b)/i.test(normalized)
  );
}

function benchmarkPublicationEvidenceLeavesOpenBlockers(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    hasAmbiguousBenchmarkOpenBlockerCount(value) ||
    /\bopen benchmark blockers?\s+(?:[1-9]\d*)\b/i.test(normalized) ||
    /\bopen benchmark blockers?\s+(?!(?:are\s+)?0\b)\S+\b/i.test(normalized) ||
    /\bopen benchmark blockers?\s+(?:are\s+)?(?:open|remaining|unresolved|outstanding)\s+(?!0\b)\S+\b/i.test(normalized) ||
    /\bopen benchmark blocker handling\s+(?!0\b)\S+\b/i.test(normalized) ||
    /\bbenchmark blockers?\s+(?:are\s+)?(?:open|remaining|unresolved|outstanding)\s+(?!0\b)\S+\b/i.test(normalized)
  );
}

function hasAmbiguousBenchmarkOpenBlockerCount(value: string): boolean {
  return (
    /\b(?:open\s+)?benchmark blockers?\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value) ||
    /\bopen benchmark blocker handling\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value)
  );
}

function benchmarkReviewerDecisionSummaryIsBounded(
  publicationDecision: NonNullable<BenchmarkEvidenceValidationInput['publicationDecision']>,
): boolean {
  const summary = publicationDecision.reviewerDecisionSummary ?? '';
  const normalized = normalizeDecisionSummaryForReleaseGate(summary);
  return (
    benchmarkReviewerDecisionSummaryHasExactReleaseSupportedBinding(summary) &&
    /\bmeasured single batch sharded evidence\b/i.test(normalized) &&
    /\bproduction ready claim handling\b/i.test(normalized) &&
    /\btestnet production candidate claim handling\b/i.test(normalized) &&
    /\bproduction throughput claim handling\b/i.test(normalized) &&
    benchmarkReviewerDecisionSummaryHasExactScalingClaimsAllowedBinding(summary) &&
    benchmarkReviewerDecisionSummaryHasExactMainnetGradeEvidenceLinkedNoBinding(summary) &&
    (
      publicationDecision.testnetProductionCandidateClaimAllowed !== 'yes' ||
      benchmarkReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(summary)
    ) &&
    benchmarkReviewerDecisionSummaryBlocksProductionThroughput(summary, publicationDecision.productionThroughputClaimAllowed) &&
    benchmarkReviewerDecisionSummaryHasExactProductionThroughputClaimBlockedBinding(summary) &&
    /\bopen benchmark blocker handling\b|\bopen benchmark blockers\b|\bbenchmark blockers\b/i.test(normalized) &&
    benchmarkReviewerDecisionSummaryClosesOpenBenchmarkBlockers(summary) &&
    hasExactOpenBenchmarkBlockersBinding(summary) &&
    validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'benchmark Reviewer decision summary',
      summary,
      releaseSupported: publicationDecision.releaseSupported,
      productionReadyClaimAllowed: publicationDecision.productionReadyClaimAllowed,
      testnetProductionCandidateClaimAllowed: publicationDecision.testnetProductionCandidateClaimAllowed,
    }).length === 0
  );
}

function benchmarkReviewerDecisionSummaryHasExactReleaseSupportedBinding(value: string): boolean {
  return hasExactBenchmarkReleaseSupportedBinding(value);
}

function benchmarkReviewerDecisionSummaryHasExactScalingClaimsAllowedBinding(value: string): boolean {
  return hasExactBenchmarkScalingClaimsAllowedBinding(value);
}

function benchmarkReviewerDecisionSummaryHasExactMainnetGradeEvidenceLinkedNoBinding(value: string): boolean {
  return hasExactBenchmarkMainnetGradeEvidenceLinkedNoBinding(value);
}

function benchmarkReviewerDecisionSummaryHasExactProductionReadyClaimDeniedBinding(value: string): boolean {
  return hasExactBenchmarkProductionReadyClaimDeniedBinding(value);
}

function benchmarkReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return hasExactBenchmarkTestnetProductionCandidateClaimAllowedBinding(value);
}

function benchmarkReviewerDecisionSummaryBlocksProductionThroughput(
  value: string,
  productionThroughputClaimAllowed?: string,
): boolean {
  if (productionThroughputClaimAllowed !== 'no') return false;
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\bproduction throughput claim handling\s+(?:blocked|forbidden|not allowed)\b/i.test(normalized) ||
    /\bproduction throughput claims?\s+(?:remain\s+|are\s+|is\s+)?(?:blocked|forbidden|not allowed)\b/i.test(normalized) ||
    /\bproduction throughput(?:\s+claim)?\s+(?:allowed|handling|control)\s+(?:blocked|forbidden|not allowed)\b/i.test(normalized)
  );
}

function benchmarkReviewerDecisionSummaryHasExactProductionThroughputClaimBlockedBinding(value: string): boolean {
  return hasExactBenchmarkProductionThroughputClaimBlockedBinding(value);
}

function benchmarkReviewerDecisionSummaryApprovesProductionThroughput(value: string): boolean {
  return normalizeDecisionSummarySegmentsForReleaseGate(value).some(normalized =>
    benchmarkClaimTextApprovesSubjectForReleaseGate(
      stripExactBenchmarkProductionThroughputClaimDenial(normalized),
      '(?:production throughput claim handling|production throughput claims?|' +
        'production throughput(?:\\s+claim)?\\s+(?:allowed|handling|control))',
      benchmarkClaimApprovalTermsForReleaseGate(),
    ),
  );
}

function stripExactBenchmarkProductionThroughputClaimDenial(normalized: string): string {
  return normalized.replace(/\bproduction throughput claim allowed no\b/gi, ' ').replace(/\s+/g, ' ').trim();
}

function benchmarkReviewerDecisionSummaryApprovesFullParallelL1Settlement(value: string): boolean {
  return normalizeDecisionSummarySegmentsForReleaseGate(value).some(normalized =>
    benchmarkClaimTextApprovesSubjectForReleaseGate(
      normalized,
      '(?:full parallel l1 settlement(?:\\s+(?:claims?|claim handling))?)',
      benchmarkClaimApprovalTermsForReleaseGate(),
    ),
  );
}

function benchmarkReviewerDecisionSummaryClosesOpenBenchmarkBlockers(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return /\bopen benchmark blocker handling\s+0(?:\s+open\s+blockers?)?\b/i.test(normalized);
}

function benchmarkReviewerDecisionSummaryHasExactOpenBenchmarkBlockersBinding(value: string): boolean {
  return hasExactOpenBenchmarkBlockersBinding(value);
}

function hasExactOpenBenchmarkBlockersBinding(value: string): boolean {
  return /\bOpen benchmark blockers\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactBenchmarkReleaseSupportedBinding(value: string): boolean {
  return /\bRelease supported\s*=\s*production deployment candidate\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactBenchmarkScalingClaimsAllowedBinding(value: string): boolean {
  return /\bScaling claims allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactBenchmarkProductionReadyClaimDeniedBinding(value: string): boolean {
  return /\bProduction-ready claim allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactBenchmarkTestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return /\bTestnet production-candidate claim allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactBenchmarkProductionThroughputClaimBlockedBinding(value: string): boolean {
  return /\bProduction throughput claim allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactBenchmarkMainnetGradeEvidenceLinkedNoBinding(value: string): boolean {
  return /\bMainnet-grade evidence linked\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

const BINARY_RELEASE_NOTES_DECISION_FIELDS = [
  'Accepted risks reflected in release notes',
  'Governance-ready claim allowed',
  'Mainnet deployment claim allowed',
  'Mainnet-grade evidence linked',
  'Operator-ready claim allowed',
  'Private maintainer context used',
  'Production throughput claim allowed',
  'Production-ready claim allowed',
  'Public institutional-reference release allowed',
  'Scaling claims allowed',
  'Testnet production-candidate claim allowed',
  'Transitional trusted burn path disabled',
  'Trustless burn verification implemented',
  'Upstream signer blocker resolved',
];

const ZERO_COUNT_RELEASE_NOTES_DECISION_FIELDS = [
  'Critical incidents open',
  'Critical/high findings open',
  'Critical/high vulnerabilities open',
  'Open benchmark blockers',
  'Open governance blockers',
  'Publication blockers',
  'Release gate structural issues',
  'Structural issues',
];

function hasContradictoryReleaseNotesDecisionBinding(value: string): boolean {
  return (
    BINARY_RELEASE_NOTES_DECISION_FIELDS.some(field => hasOpposingBinaryDecisionBindings(value, field)) ||
    ZERO_COUNT_RELEASE_NOTES_DECISION_FIELDS.some(field => hasMixedZeroAndNonZeroDecisionBindings(value, field)) ||
    hasOpposingReleaseGateStatusBindings(value) ||
    hasOpposingFinalDecisionBindings(value) ||
    hasMixedReleaseSupportBindings(value)
  );
}

function hasOpposingBinaryDecisionBindings(value: string, field: string): boolean {
  const values = exactReleaseNotesDecisionBindingValues(value, field, 'yes|no');
  return values.has('yes') && values.has('no');
}

function hasMixedZeroAndNonZeroDecisionBindings(value: string, field: string): boolean {
  const values = [...exactReleaseNotesDecisionBindingValues(value, field, '\\d+')].map(Number);
  return values.some(count => count === 0) && values.some(count => count > 0);
}

function hasOpposingReleaseGateStatusBindings(value: string): boolean {
  const values = exactReleaseNotesDecisionBindingValues(value, 'Release gate status', 'pass|fail|failed|blocked');
  return values.has('pass') && (values.has('fail') || values.has('failed') || values.has('blocked'));
}

function hasOpposingFinalDecisionBindings(value: string): boolean {
  const values = exactReleaseNotesDecisionBindingValues(value, 'Final decision', 'approve|approved|reject|rejected|block|blocked');
  return (values.has('approve') || values.has('approved')) &&
    (values.has('reject') || values.has('rejected') || values.has('block') || values.has('blocked'));
}

function hasMixedReleaseSupportBindings(value: string): boolean {
  const values = exactReleaseNotesDecisionBindingValues(
    value,
    'Release supported',
    'production\\s+deployment\\s+candidate|institutional\\s+reference|validated\\s+poc|draft',
  );
  return values.size > 1;
}

function exactReleaseNotesDecisionBindingValues(value: string, field: string, valuePattern: string): Set<string> {
  const pattern = new RegExp(
    `\\b${releaseNotesDecisionFieldPattern(field)}\\s*=\\s*(${valuePattern})\\s*(?:$|[.;,|)\\]\\r\\n])`,
    'ig',
  );
  const normalized = normalizeReleaseNotesDecisionBindingText(value);
  return new Set([...normalized.matchAll(pattern)].map(match => match[1].toLowerCase().replace(/\s+/g, ' ')));
}

function releaseNotesDecisionFieldPattern(field: string): string {
  return field.split(/[- ]+/).map(escapeRegExp).join('[- ]+');
}

function normalizeReleaseNotesDecisionBindingText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\udb40[\udd00-\uddef]/g, '')
    .replace(/\u00ad/g, '-')
    .replace(/[\u200b\u2060\ufeff]/g, ' ')
    .replace(/[\u034f\u061c\u180e\u200c-\u200f\u202a-\u202e\u2061-\u206f\ufe00-\ufe0f]/g, '')
    .replace(/(?<=[A-Za-z0-9])[\u2010-\u2015\u2212\ufe58\ufe63\uff0d](?=[A-Za-z0-9])/g, '-');
}

function validateLinkedCommitteeGovernanceEvidence(
  committeeGovernance: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.committeeGovernanceEvidenceValidation;
  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual committee governance evidence validation input',
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual committee governance evidence validation to pass',
    );
  }
  const evidencePayload = checkedEvidencePayload(committeeGovernance.requiredResolution);
  if (!isValidatedCommitteeGovernanceEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires committee governance row to link a completed committee governance artifact with governance:validate output',
    );
  }

  issues.push(...validateCommitteeGovernanceProductionCandidateFields(
    validation,
    'Release Decision: Testnet production-candidate claims allowed',
    options.cleanCheckoutEvidenceValidation?.classification?.gitCommit,
  ));
  if (validationPassed(validation)) {
    issues.push(...validateCommitteeGovernanceStructuredSummary(
      validation,
      'Release Decision: actual committee governance evidence validation',
    ));
  }

  return issues;
}

function validateCommitteeGovernanceProductionCandidateFields(
  validation: CommitteeGovernanceEvidenceValidationInput,
  prefix: string,
  cleanCheckoutGitCommit?: string,
): string[] {
  const issues: string[] = [];
  const classification = validation.classification ?? {};
  if (classification.releaseLevel !== 'production deployment candidate') {
    issues.push(
      `${prefix} requires validated committee governance Release level = production deployment candidate`,
    );
  }
  if (classification.environment !== 'testnet') {
    issues.push(
      `${prefix} requires validated committee governance Environment = testnet`,
    );
  }
  if (!isDisabledOrDryRunBroadcastMode(classification.broadcastMode)) {
    issues.push(
      `${prefix} requires validated committee governance Broadcast mode disabled or dry-run`,
    );
  }
  if (!isCommitteeGovernanceClassificationGitCommit(classification.gitCommit)) {
    issues.push(
      `${prefix} requires validated committee governance Drill Classification Git commit`,
    );
  } else if (
    isCleanCheckoutRunClassificationGitCommit(cleanCheckoutGitCommit) &&
    normalizeGitCommit(classification.gitCommit) !== normalizeGitCommit(cleanCheckoutGitCommit)
  ) {
    issues.push(
      `${prefix} requires committee governance Git commit to match clean checkout Git commit ${cleanCheckoutGitCommit?.trim()}`,
    );
  }
  if (!isCommitteeGovernanceModel(classification.governanceModel)) {
    issues.push(
      `${prefix} requires validated committee governance Drill Classification Governance model to identify multisig committee governance`,
    );
  }
  const committeeThreshold = parseCommitteeGovernancePositiveInteger(classification.committeeThreshold ?? '');
  const committeeMemberCount = parseCommitteeGovernancePositiveInteger(classification.committeeMemberCount ?? '');
  if (
    committeeThreshold === null ||
    committeeMemberCount === null ||
    committeeThreshold < 2 ||
    committeeMemberCount < 3 ||
    committeeThreshold >= committeeMemberCount
  ) {
    issues.push(
      `${prefix} requires validated committee governance Drill Classification Committee threshold/member count with threshold >= 2, member count >= 3, and threshold lower than member count`,
    );
  }
  if (isBlankValue(classification.reviewer)) {
    issues.push(
      `${prefix} requires validated committee governance Drill Classification Reviewer`,
    );
  }
  if (!isIsoCalendarDate(classification.date?.trim() ?? '')) {
    issues.push(
      `${prefix} requires validated committee governance Drill Classification Date to use YYYY-MM-DD`,
    );
  }

  const publicationDecision = validation.publicationDecision ?? {};
  if (publicationDecision.releaseSupported !== 'production deployment candidate') {
    issues.push(
      `${prefix} requires validated committee governance Release supported = production deployment candidate`,
    );
  }
  if (publicationDecision.productionReadyClaimAllowed !== 'no') {
    issues.push(
      `${prefix} requires validated committee governance Production-ready claim allowed = no`,
    );
  }
  if (publicationDecision.testnetProductionCandidateClaimAllowed !== 'yes') {
    issues.push(
      `${prefix} requires validated committee governance Testnet production-candidate claim allowed = yes`,
    );
  }
  if (publicationDecision.governanceReadyClaimAllowed !== 'yes') {
    issues.push(
      `${prefix} requires validated committee governance Governance-ready claim allowed = yes`,
    );
  }
  if (!isExactZeroEvidenceValue(publicationDecision.openGovernanceBlockers ?? '')) {
    issues.push(
      `${prefix} requires validated committee governance Open governance blockers = 0`,
    );
  }
  if (publicationDecision.releaseNotesUpdated !== 'yes') {
    issues.push(
      `${prefix} requires validated committee governance Release notes updated = yes`,
    );
  }
  if (!hasCompletedCommitteeGovernanceReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '')) {
    issues.push(
      `${prefix} requires completed Gate 6 governance release-note update evidence`,
    );
  }
  if (!hasCompletedCommitteeGovernanceChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '')) {
    issues.push(
      `${prefix} requires completed Gate 6 governance checklist update evidence`,
    );
  }
  if (!hasCompletedCommitteeGovernanceExternalReviewEvidence(publicationDecision.externalReviewEvidence ?? '')) {
    issues.push(
      `${prefix} requires completed Gate 6 governance external review evidence`,
    );
  }
  issues.push(
    ...validateCommitteeGovernancePublicationEvidenceBoundary(
      `${prefix}: Gate 6 governance release-note update evidence`,
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      {
        requireExactReleaseSupportedProductionCandidate:
          publicationDecision.releaseSupported === 'production deployment candidate',
        requireExactTestnetProductionCandidateClaimAllowed:
          publicationDecision.testnetProductionCandidateClaimAllowed === 'yes',
        requireExactGovernanceReadyClaimAllowed:
          publicationDecision.governanceReadyClaimAllowed === 'yes',
        requireExactProductionReadyClaimAllowedNo:
          publicationDecision.productionReadyClaimAllowed === 'no',
        requireExactOpenGovernanceBlockers:
          isExactZeroEvidenceValue(publicationDecision.openGovernanceBlockers ?? ''),
      },
    ),
  );
  issues.push(
    ...validateCommitteeGovernancePublicationEvidenceBoundary(
      `${prefix}: Gate 6 governance checklist update evidence`,
      publicationDecision.requiredChecklistUpdates ?? '',
      {
        requireExactReleaseSupportedProductionCandidate:
          publicationDecision.releaseSupported === 'production deployment candidate',
        requireExactTestnetProductionCandidateClaimAllowed:
          publicationDecision.testnetProductionCandidateClaimAllowed === 'yes',
        requireExactGovernanceReadyClaimAllowed:
          publicationDecision.governanceReadyClaimAllowed === 'yes',
        requireExactProductionReadyClaimAllowedNo:
          publicationDecision.productionReadyClaimAllowed === 'no',
        requireExactOpenGovernanceBlockers:
          isExactZeroEvidenceValue(publicationDecision.openGovernanceBlockers ?? ''),
      },
    ),
  );
  issues.push(
    ...validateCommitteeGovernancePublicationEvidenceBoundary(
      `${prefix}: Gate 6 governance external review evidence`,
      publicationDecision.externalReviewEvidence ?? '',
      {
        requireExactReleaseSupportedProductionCandidate:
          publicationDecision.releaseSupported === 'production deployment candidate',
        requireExactTestnetProductionCandidateClaimAllowed:
          publicationDecision.testnetProductionCandidateClaimAllowed === 'yes',
        requireExactGovernanceReadyClaimAllowed:
          publicationDecision.governanceReadyClaimAllowed === 'yes',
        requireExactProductionReadyClaimAllowedNo:
          publicationDecision.productionReadyClaimAllowed === 'no',
        requireExactOpenGovernanceBlockers:
          isExactZeroEvidenceValue(publicationDecision.openGovernanceBlockers ?? ''),
      },
    ),
  );
  if (
    hasCompletedCommitteeGovernanceReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '') &&
    hasCompletedCommitteeGovernanceChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '') &&
    haveSharedConcreteEvidenceTarget(
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      publicationDecision.requiredChecklistUpdates ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires distinct completed Gate 6 governance release-note and checklist update evidence targets`,
    );
  }
  if (
    hasCompletedCommitteeGovernanceExternalReviewEvidence(publicationDecision.externalReviewEvidence ?? '') &&
    (
      (
        hasCompletedCommitteeGovernanceReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '') &&
        haveSharedCompletedCommitteeGovernanceEvidenceTarget(
          publicationDecision.requiredReleaseNoteUpdates ?? '',
          publicationDecision.externalReviewEvidence ?? '',
        )
      ) ||
      (
        hasCompletedCommitteeGovernanceChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '') &&
        haveSharedCompletedCommitteeGovernanceEvidenceTarget(
          publicationDecision.requiredChecklistUpdates ?? '',
          publicationDecision.externalReviewEvidence ?? '',
        )
      )
    )
  ) {
    issues.push(
      `${prefix} requires distinct completed Gate 6 governance external review evidence target from release-note and checklist update evidence targets`,
    );
  }
  if (!committeeGovernanceReviewerDecisionSummaryIsBounded(publicationDecision)) {
    issues.push(
      `${prefix} requires validated committee governance Reviewer decision summary to bind release support, governance-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and open governance blocker handling`,
    );
  }
  if (
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !committeeGovernanceReviewerDecisionSummaryHasExactReleaseSupportedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated committee governance Reviewer decision summary to use exact Release supported = production deployment candidate`,
    );
  }
  if (
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !committeeGovernanceReviewerDecisionSummaryHasExactGovernanceReadyBinding(publicationDecision.reviewerDecisionSummary ?? '')
  ) {
    issues.push(
      `${prefix} requires validated committee governance Reviewer decision summary to use exact Governance-ready claim allowed = yes`,
    );
  }
  if (
    publicationDecision.productionReadyClaimAllowed === 'no' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !committeeGovernanceReviewerDecisionSummaryHasExactProductionReadyClaimDeniedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated committee governance Reviewer decision summary to use exact Production-ready claim allowed = no`,
    );
  }
  if (
    publicationDecision.testnetProductionCandidateClaimAllowed === 'yes' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !committeeGovernanceReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated committee governance Reviewer decision summary to use exact Testnet production-candidate claim allowed = yes`,
    );
  }
  if (
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !committeeGovernanceReviewerDecisionSummaryHasExactOpenBlockersBinding(publicationDecision.reviewerDecisionSummary ?? '')
  ) {
    issues.push(
      `${prefix} requires validated committee governance Reviewer decision summary to use exact Open governance blockers = 0`,
    );
  }
  if (committeeGovernanceReviewerNoteApprovesSingleSigner(publicationDecision.reviewerDecisionSummary ?? '')) {
    issues.push(
      `${prefix} requires validated committee governance Reviewer decision summary not to approve single-signer governance`,
    );
  }
  if (committeeGovernanceReviewerNoteApprovesOpenBlockers(publicationDecision.reviewerDecisionSummary ?? '')) {
    issues.push(
      `${prefix} requires validated committee governance Reviewer decision summary not to approve open governance blockers`,
    );
  }

  return issues;
}

function isCommitteeGovernanceClassificationGitCommit(value: string | undefined): boolean {
  return /^[a-f0-9]{7,40}$/i.test(value?.trim() ?? '');
}

function isCommitteeGovernanceModel(value: string | undefined): boolean {
  const normalized = value?.trim() ?? '';
  return (
    normalized.length > 0 &&
    !/\bsingle[- ]signer\b/i.test(normalized) &&
    /\b(committee|multisig|atLeast|threshold|m\s*\/\s*n)\b/i.test(normalized)
  );
}

interface CommitteeGovernancePublicationEvidenceExactBindingRequirements {
  requireExactReleaseSupportedProductionCandidate: boolean;
  requireExactTestnetProductionCandidateClaimAllowed: boolean;
  requireExactGovernanceReadyClaimAllowed: boolean;
  requireExactProductionReadyClaimAllowedNo: boolean;
  requireExactOpenGovernanceBlockers: boolean;
}

function validateCommitteeGovernancePublicationEvidenceBoundary(
  label: string,
  text: string,
  exactBindingRequirements: CommitteeGovernancePublicationEvidenceExactBindingRequirements,
): string[] {
  const issues = [
    ...validateReleaseGatePublicationClaimBoundary(label, text),
  ];

  if (
    exactBindingRequirements.requireExactReleaseSupportedProductionCandidate &&
    !hasExactCommitteeGovernanceReleaseSupportedBinding(text)
  ) {
    issues.push(`${label} must use exact Release supported = production deployment candidate`);
  }
  if (
    exactBindingRequirements.requireExactTestnetProductionCandidateClaimAllowed &&
    !hasExactCommitteeGovernanceTestnetProductionCandidateClaimAllowedBinding(text)
  ) {
    issues.push(`${label} must use exact Testnet production-candidate claim allowed = yes`);
  }
  if (
    exactBindingRequirements.requireExactGovernanceReadyClaimAllowed &&
    !hasExactGovernanceReadyClaimAllowedBinding(text)
  ) {
    issues.push(`${label} must use exact Governance-ready claim allowed = yes`);
  }
  if (
    exactBindingRequirements.requireExactProductionReadyClaimAllowedNo &&
    !hasExactCommitteeGovernanceProductionReadyClaimDeniedBinding(text)
  ) {
    issues.push(`${label} must use exact Production-ready claim allowed = no`);
  }
  if (committeeGovernancePublicationEvidenceLeavesOpenBlockers(text)) {
    issues.push(`${label} must not leave governance blockers open`);
  }
  if (
    exactBindingRequirements.requireExactOpenGovernanceBlockers &&
    !hasExactOpenGovernanceBlockersBinding(text)
  ) {
    issues.push(`${label} must use exact Open governance blockers = 0`);
  }
  if (committeeGovernancePublicationEvidenceDeniesGovernanceReadyClaim(text)) {
    issues.push(`${label} must not deny governance-ready claim support`);
  }
  if (committeeGovernancePublicationEvidenceDeniesTestnetProductionCandidateSupport(text)) {
    issues.push(`${label} must not deny testnet production-candidate claim support`);
  }
  if (committeeGovernanceReviewerNoteApprovesSingleSigner(text)) {
    issues.push(`${label} must not approve single-signer governance`);
  }
  if (hasContradictoryValidationFailureMarker(text)) {
    issues.push(`${label} must not mix completed/PASS evidence with failure markers`);
  }
  if (hasContradictoryReleaseNotesDecisionBinding(text)) {
    issues.push(`${label} must not include contradictory release-note decision bindings`);
  }

  return [...new Set(issues)];
}

function committeeGovernancePublicationEvidenceDeniesGovernanceReadyClaim(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\bgovernance ready claim allowed\s+(?:no|false|0|blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\bgovernance ready claims?\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized)
  );
}

function committeeGovernancePublicationEvidenceDeniesTestnetProductionCandidateSupport(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\btestnet production candidate claim allowed\s+(?:no|false|0|blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\btestnet production candidate claim support\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\btestnet production candidate claims?\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized)
  );
}

function committeeGovernancePublicationEvidenceLeavesOpenBlockers(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    hasAmbiguousCommitteeGovernanceOpenBlockerCount(value) ||
    /\bopen governance blockers?\s+(?:[1-9]\d*)\b/i.test(normalized) ||
    /\bopen governance blockers?\s+(?!(?:are\s+)?0\b)\S+\b/i.test(normalized) ||
    /\bopen governance blockers?\s+(?:are\s+)?(?:open|remaining|unresolved|outstanding)\s+(?!0\b)\S+\b/i.test(normalized) ||
    /\bopen governance blocker handling\s+(?!0\b)\S+\b/i.test(normalized) ||
    /\bgovernance blockers?\s+(?:are\s+)?(?:open|remaining|unresolved|outstanding)\s+(?!0\b)\S+\b/i.test(normalized)
  );
}

function hasAmbiguousCommitteeGovernanceOpenBlockerCount(value: string): boolean {
  return /\b(?:open\s+)?governance blockers?\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value) ||
    /\bopen governance blocker handling\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value);
}

function committeeGovernanceReviewerDecisionSummaryIsBounded(
  publicationDecision: NonNullable<CommitteeGovernanceEvidenceValidationInput['publicationDecision']>,
): boolean {
  const summary = publicationDecision.reviewerDecisionSummary ?? '';
  const normalized = normalizeDecisionSummaryForReleaseGate(summary);
  return (
    /\brelease supported\b/i.test(normalized) &&
    /\bgovernance ready claim handling\b/i.test(normalized) &&
    /\bproduction ready claim handling\b/i.test(normalized) &&
    /\btestnet production candidate claim handling\b/i.test(normalized) &&
    /\bopen governance blocker handling\b|\bopen governance blockers\b|\bgovernance blockers\b/i.test(normalized) &&
    reviewerDecisionSummaryClosesOpenGovernanceBlockers(summary) &&
    committeeGovernanceReviewerDecisionSummaryHasExactReleaseSupportedBinding(summary) &&
    committeeGovernanceReviewerDecisionSummaryHasExactGovernanceReadyBinding(summary) &&
    (
      publicationDecision.testnetProductionCandidateClaimAllowed !== 'yes' ||
      committeeGovernanceReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(summary)
    ) &&
    hasExactOpenGovernanceBlockersBinding(summary) &&
    validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'committee governance Reviewer decision summary',
      summary,
      releaseSupported: publicationDecision.releaseSupported,
      productionReadyClaimAllowed: publicationDecision.productionReadyClaimAllowed,
      testnetProductionCandidateClaimAllowed: publicationDecision.testnetProductionCandidateClaimAllowed,
    }).length === 0
  );
}

function reviewerDecisionSummaryClosesOpenGovernanceBlockers(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\bopen governance blocker handling\s+0(?:\s+open\s+blockers?)?\b/i.test(normalized) ||
    reviewerSummaryHasExactOpenGovernanceBlockerHandlingBinding(value)
  );
}

function reviewerSummaryHasExactOpenGovernanceBlockerHandlingBinding(value: string): boolean {
  return value.split(/[\n\r|;]+|[.]\s+/).some(segment =>
    /\bopen governance blocker handling\b/i.test(segment) &&
    /\bOpen governance blockers\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(segment),
  );
}

function committeeGovernanceReviewerDecisionSummaryHasExactReleaseSupportedBinding(value: string): boolean {
  return hasExactCommitteeGovernanceReleaseSupportedBinding(value);
}

function committeeGovernanceReviewerDecisionSummaryHasExactGovernanceReadyBinding(value: string): boolean {
  return hasExactGovernanceReadyClaimAllowedBinding(value);
}

function committeeGovernanceReviewerDecisionSummaryHasExactProductionReadyClaimDeniedBinding(value: string): boolean {
  return hasExactCommitteeGovernanceProductionReadyClaimDeniedBinding(value);
}

function committeeGovernanceReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return hasExactCommitteeGovernanceTestnetProductionCandidateClaimAllowedBinding(value);
}

function committeeGovernanceReviewerDecisionSummaryHasExactOpenBlockersBinding(value: string): boolean {
  return hasExactOpenGovernanceBlockersBinding(value);
}

function hasExactOpenGovernanceBlockersBinding(value: string): boolean {
  return /\bOpen governance blockers\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactGovernanceReadyClaimAllowedBinding(value: string): boolean {
  return /\bGovernance-ready claim allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactCommitteeGovernanceReleaseSupportedBinding(value: string): boolean {
  return /\bRelease supported\s*=\s*production deployment candidate\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactCommitteeGovernanceProductionReadyClaimDeniedBinding(value: string): boolean {
  return /\bProduction-ready claim allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactCommitteeGovernanceTestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return /\bTestnet production-candidate claim allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function validateLinkedOperatorReadinessEvidence(
  operatorReadiness: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.operatorReadinessEvidenceValidation;
  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual operator readiness evidence validation input',
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual operator readiness evidence validation to pass',
    );
  }
  const evidencePayload = checkedEvidencePayload(operatorReadiness.requiredResolution);
  if (!isValidatedOperatorReadinessEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires operator readiness row to link a completed operator readiness artifact with operator:validate output',
    );
  }

  issues.push(...validateOperatorReadinessProductionCandidateFields(
    validation,
    'Release Decision: Testnet production-candidate claims allowed',
    options.cleanCheckoutEvidenceValidation?.classification?.gitCommit,
  ));
  if (validationPassed(validation)) {
    issues.push(...validateOperatorReadinessStructuredSummary(
      validation,
      'Release Decision: actual operator readiness evidence validation',
    ));
  }

  return issues;
}

function validateOperatorReadinessProductionCandidateFields(
  validation: OperatorReadinessEvidenceValidationInput,
  prefix: string,
  cleanCheckoutGitCommit?: string,
): string[] {
  const issues: string[] = [];
  const classification = validation.classification ?? {};
  if (classification.releaseLevel !== 'production deployment candidate') {
    issues.push(
      `${prefix} requires validated operator readiness Release level = production deployment candidate`,
    );
  }
  if (classification.environment !== 'testnet') {
    issues.push(
      `${prefix} requires validated operator readiness Environment = testnet`,
    );
  }
  if (!isDisabledOrDryRunBroadcastMode(classification.broadcastMode)) {
    issues.push(
      `${prefix} requires validated operator readiness Broadcast mode disabled or dry-run`,
    );
  }
  if (!isOperatorReadinessClassificationGitCommit(classification.gitCommit)) {
    issues.push(
      `${prefix} requires validated operator readiness Readiness Classification Git commit`,
    );
  } else if (
    isCleanCheckoutRunClassificationGitCommit(cleanCheckoutGitCommit) &&
    normalizeGitCommit(classification.gitCommit) !== normalizeGitCommit(cleanCheckoutGitCommit)
  ) {
    issues.push(
      `${prefix} requires operator readiness Git commit to match clean checkout Git commit ${cleanCheckoutGitCommit?.trim()}`,
    );
  }
  if (!isAllowedOperatorReadinessType(classification.operatorType)) {
    issues.push(
      `${prefix} requires validated operator readiness Readiness Classification Operator type`,
    );
  }
  if (isBlankValue(classification.reviewer)) {
    issues.push(
      `${prefix} requires validated operator readiness Readiness Classification Reviewer`,
    );
  }
  if (!isIsoCalendarDate(classification.date?.trim() ?? '')) {
    issues.push(
      `${prefix} requires validated operator readiness Readiness Classification Date to use YYYY-MM-DD`,
    );
  }

  const publicationDecision = validation.publicationDecision ?? {};
  if (publicationDecision.releaseSupported !== 'production deployment candidate') {
    issues.push(
      `${prefix} requires validated operator readiness Release supported = production deployment candidate`,
    );
  }
  if (publicationDecision.productionReadyClaimAllowed !== 'no') {
    issues.push(
      `${prefix} requires validated operator readiness Production-ready claim allowed = no`,
    );
  }
  if (publicationDecision.testnetProductionCandidateClaimAllowed !== 'yes') {
    issues.push(
      `${prefix} requires validated operator readiness Testnet production-candidate claim allowed = yes`,
    );
  }
  if (publicationDecision.operatorReadyClaimAllowed !== 'yes') {
    issues.push(
      `${prefix} requires validated operator readiness Operator-ready claim allowed = yes`,
    );
  }
  if (!isExactZeroEvidenceValue(publicationDecision.criticalIncidentsOpen ?? '')) {
    issues.push(
      `${prefix} requires validated operator readiness Critical incidents open = 0`,
    );
  }
  if (publicationDecision.releaseNotesUpdated !== 'yes') {
    issues.push(
      `${prefix} requires validated operator readiness Release notes updated = yes`,
    );
  }
  if (!hasCompletedOperatorReadinessReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '')) {
    issues.push(
      `${prefix} requires completed operator-readiness release-note update evidence`,
    );
  }
  if (!hasCompletedOperatorReadinessChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '')) {
    issues.push(
      `${prefix} requires completed operator-readiness checklist update evidence`,
    );
  }
  issues.push(
    ...validateOperatorReadinessPublicationUpdateBoundary(
      `${prefix}: operator-readiness release-note update evidence`,
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      {
        requireExactOperatorReadyClaimAllowed:
          publicationDecision.operatorReadyClaimAllowed === 'yes',
        requireExactReleaseSupportedProductionDeploymentCandidate:
          publicationDecision.releaseSupported === 'production deployment candidate',
        requireExactProductionReadyClaimAllowedNo:
          publicationDecision.productionReadyClaimAllowed === 'no',
        requireExactTestnetProductionCandidateClaimAllowed:
          publicationDecision.testnetProductionCandidateClaimAllowed === 'yes',
        requireExactCriticalIncidentsOpen:
          isExactZeroEvidenceValue(publicationDecision.criticalIncidentsOpen ?? ''),
      },
    ),
  );
  issues.push(
    ...validateOperatorReadinessPublicationUpdateBoundary(
      `${prefix}: operator-readiness checklist update evidence`,
      publicationDecision.requiredChecklistUpdates ?? '',
      {
        requireExactOperatorReadyClaimAllowed:
          publicationDecision.operatorReadyClaimAllowed === 'yes',
        requireExactReleaseSupportedProductionDeploymentCandidate:
          publicationDecision.releaseSupported === 'production deployment candidate',
        requireExactProductionReadyClaimAllowedNo:
          publicationDecision.productionReadyClaimAllowed === 'no',
        requireExactTestnetProductionCandidateClaimAllowed:
          publicationDecision.testnetProductionCandidateClaimAllowed === 'yes',
        requireExactCriticalIncidentsOpen:
          isExactZeroEvidenceValue(publicationDecision.criticalIncidentsOpen ?? ''),
      },
    ),
  );
  if (
    hasCompletedOperatorReadinessReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '') &&
    hasCompletedOperatorReadinessChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '') &&
    haveSharedConcreteEvidenceTarget(
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      publicationDecision.requiredChecklistUpdates ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires distinct completed operator-readiness release-note and checklist update evidence targets`,
    );
  }
  if (!operatorReadinessReviewerDecisionSummaryIsBounded(publicationDecision)) {
    issues.push(
      `${prefix} requires validated operator readiness Reviewer decision summary to bind release support, operator-ready claim handling, production-ready claim handling, testnet production-candidate claim handling, and critical incidents`,
    );
  }
  if (
    publicationDecision.releaseSupported === 'production deployment candidate' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !operatorReadinessReviewerDecisionSummaryHasExactReleaseSupportedProductionDeploymentCandidateBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated operator readiness Reviewer decision summary to use exact Release supported = production deployment candidate`,
    );
  }
  if (
    publicationDecision.operatorReadyClaimAllowed === 'yes' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !operatorReadinessReviewerDecisionSummaryHasExactOperatorReadyClaimAllowedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated operator readiness Reviewer decision summary to use exact Operator-ready claim allowed = yes`,
    );
  }
  if (
    publicationDecision.productionReadyClaimAllowed === 'no' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !operatorReadinessReviewerDecisionSummaryHasExactProductionReadyClaimDeniedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated operator readiness Reviewer decision summary to use exact Production-ready claim allowed = no`,
    );
  }
  if (
    publicationDecision.testnetProductionCandidateClaimAllowed === 'yes' &&
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    !operatorReadinessReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated operator readiness Reviewer decision summary to use exact Testnet production-candidate claim allowed = yes`,
    );
  }
  if (
    !isBlankValue(publicationDecision.reviewerDecisionSummary) &&
    reviewerDecisionSummaryClosesCriticalIncidents(publicationDecision.reviewerDecisionSummary ?? '') &&
    !operatorReadinessReviewerDecisionSummaryHasExactCriticalIncidentsOpenBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires validated operator readiness Reviewer decision summary to use exact Critical incidents open = 0`,
    );
  }
  if (operatorReadinessReviewerNoteApprovesOpenCriticalIncidents(publicationDecision.reviewerDecisionSummary ?? '')) {
    issues.push(
      `${prefix} requires validated operator readiness Reviewer decision summary not to approve open critical incidents`,
    );
  }
  if (operatorReadinessReviewerNoteApprovesNonOptInBroadcast(publicationDecision.reviewerDecisionSummary ?? '')) {
    issues.push(
      `${prefix} requires validated operator readiness Reviewer decision summary not to approve non-opt-in broadcast enablement`,
    );
  }

  return issues;
}

interface OperatorReadinessPublicationUpdateExactBindingRequirements {
  requireExactOperatorReadyClaimAllowed: boolean;
  requireExactReleaseSupportedProductionDeploymentCandidate: boolean;
  requireExactProductionReadyClaimAllowedNo: boolean;
  requireExactTestnetProductionCandidateClaimAllowed: boolean;
  requireExactCriticalIncidentsOpen: boolean;
}

function validateOperatorReadinessPublicationUpdateBoundary(
  label: string,
  text: string,
  exactBindingRequirements: OperatorReadinessPublicationUpdateExactBindingRequirements,
): string[] {
  const issues = [
    ...validateReleaseGatePublicationClaimBoundary(label, text),
  ];

  if (
    exactBindingRequirements.requireExactOperatorReadyClaimAllowed &&
    !hasExactOperatorReadyClaimAllowedBinding(text)
  ) {
    issues.push(`${label} must use exact Operator-ready claim allowed = yes`);
  }
  if (
    exactBindingRequirements.requireExactReleaseSupportedProductionDeploymentCandidate &&
    !hasExactOperatorReadinessReleaseSupportedProductionDeploymentCandidateBinding(text)
  ) {
    issues.push(`${label} must use exact Release supported = production deployment candidate`);
  }
  if (
    exactBindingRequirements.requireExactProductionReadyClaimAllowedNo &&
    !hasExactOperatorReadinessProductionReadyClaimDeniedBinding(text)
  ) {
    issues.push(`${label} must use exact Production-ready claim allowed = no`);
  }
  if (
    exactBindingRequirements.requireExactTestnetProductionCandidateClaimAllowed &&
    !hasExactOperatorReadinessTestnetProductionCandidateClaimAllowedBinding(text)
  ) {
    issues.push(`${label} must use exact Testnet production-candidate claim allowed = yes`);
  }
  if (
    exactBindingRequirements.requireExactCriticalIncidentsOpen &&
    !hasExactCriticalIncidentsOpenBinding(text)
  ) {
    issues.push(`${label} must use exact Critical incidents open = 0`);
  }
  if (operatorReadinessReviewerNoteApprovesOpenCriticalIncidents(text)) {
    issues.push(`${label} must not approve open critical incidents`);
  }
  if (operatorReadinessReviewerNoteApprovesNonOptInBroadcast(text)) {
    issues.push(`${label} must not approve non-opt-in broadcast enablement`);
  }
  if (operatorReadinessPublicationEvidenceDeniesOperatorReadyClaim(text)) {
    issues.push(`${label} must not deny operator-ready claim support`);
  }
  if (operatorReadinessPublicationEvidenceDeniesTestnetProductionCandidateSupport(text)) {
    issues.push(`${label} must not deny testnet production-candidate claim support`);
  }
  if (operatorReadinessPublicationEvidenceLeavesCriticalIncidentsOpen(text)) {
    issues.push(`${label} must not leave critical incidents open`);
  }
  if (hasContradictoryValidationFailureMarker(text)) {
    issues.push(`${label} must not mix completed/PASS evidence with failure markers`);
  }
  if (hasContradictoryReleaseNotesDecisionBinding(text)) {
    issues.push(`${label} must not include contradictory release-note decision bindings`);
  }

  return [...new Set(issues)];
}

function operatorReadinessPublicationEvidenceDeniesOperatorReadyClaim(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\boperator ready claim allowed\s+(?:no|false|0|blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\boperator ready claims?\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized)
  );
}

function operatorReadinessPublicationEvidenceDeniesTestnetProductionCandidateSupport(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\btestnet production candidate claim allowed\s+(?:no|false|0|blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\btestnet production candidate claim support\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\btestnet production candidate claims?\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized)
  );
}

function operatorReadinessPublicationEvidenceLeavesCriticalIncidentsOpen(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return hasAmbiguousOperatorCriticalIncidentCount(value) || [
    /\bcritical incidents?\s+open\s+(?:[1-9]\d*)\b/gi,
    /\bopen critical incidents?\s+(?:[1-9]\d*)\b/gi,
    /\bcritical incidents?\s+open\s+(?!(?:are\s+)?0\b)\S+\b/gi,
    /\bcritical incidents?\s+(?:are\s+)?(?:open|remaining|unresolved|outstanding)\s+(?!0\b)\S+\b/gi,
    /\bopen critical incidents?\s+(?!(?:are\s+)?0\b)\S+\b/gi,
  ].some(pattern => hasUnnegatedOperatorCriticalIncidentsOpen(normalized, pattern));
}

function hasAmbiguousOperatorCriticalIncidentCount(value: string): boolean {
  return (
    /\bcritical incidents?\s+open\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value) ||
    /\bopen critical incidents?\s*(?:=|:)?\s*0\s*\/\s*\d+\b/i.test(value)
  );
}

function hasUnnegatedOperatorCriticalIncidentsOpen(normalized: string, pattern: RegExp): boolean {
  for (const match of normalized.matchAll(pattern)) {
    const index = match.index ?? 0;
    const prefix = normalized.slice(Math.max(0, index - 48), index);
    if (!/\b(?:not|no|never|without|absence|absent|lack|lacks|lacking)(?:\s+of)?(?:\s+[a-z0-9]+){0,3}\s+$/.test(prefix)) {
      return true;
    }
  }
  return false;
}

const OPERATOR_READINESS_TYPES = new Set([
  'external operator',
  'exchange operations reviewer',
]);

function isOperatorReadinessClassificationGitCommit(value: string | undefined): boolean {
  return /^[a-f0-9]{7,40}$/i.test(value?.trim() ?? '');
}

function isAllowedOperatorReadinessType(value: string | undefined): boolean {
  return OPERATOR_READINESS_TYPES.has(value?.trim() ?? '');
}

function operatorReadinessReviewerDecisionSummaryIsBounded(
  publicationDecision: NonNullable<OperatorReadinessEvidenceValidationInput['publicationDecision']>,
): boolean {
  const summary = publicationDecision.reviewerDecisionSummary ?? '';
  const normalized = normalizeDecisionSummaryForReleaseGate(summary);
  return (
    /\brelease supported\b/i.test(normalized) &&
    /\boperator ready claim handling\b/i.test(normalized) &&
    operatorReadinessReviewerDecisionSummaryHasExactOperatorReadyClaimAllowedBinding(summary) &&
    /\bproduction ready claim handling\b/i.test(normalized) &&
    /\btestnet production candidate claim handling\b/i.test(normalized) &&
    operatorReadinessReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(summary) &&
    /\bcritical incidents?\b/i.test(normalized) &&
    reviewerDecisionSummaryClosesCriticalIncidents(summary) &&
    operatorReadinessReviewerDecisionSummaryHasExactCriticalIncidentsOpenBinding(summary) &&
    validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'operator readiness Reviewer decision summary',
      summary,
      releaseSupported: publicationDecision.releaseSupported,
      productionReadyClaimAllowed: publicationDecision.productionReadyClaimAllowed,
      testnetProductionCandidateClaimAllowed: publicationDecision.testnetProductionCandidateClaimAllowed,
    }).length === 0
  );
}

function operatorReadinessReviewerDecisionSummaryHasExactReleaseSupportedProductionDeploymentCandidateBinding(value: string): boolean {
  return hasExactOperatorReadinessReleaseSupportedProductionDeploymentCandidateBinding(value);
}

function operatorReadinessReviewerDecisionSummaryHasExactOperatorReadyClaimAllowedBinding(value: string): boolean {
  return hasExactOperatorReadyClaimAllowedBinding(value);
}

function operatorReadinessReviewerDecisionSummaryHasExactProductionReadyClaimDeniedBinding(value: string): boolean {
  return hasExactOperatorReadinessProductionReadyClaimDeniedBinding(value);
}

function operatorReadinessReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return hasExactOperatorReadinessTestnetProductionCandidateClaimAllowedBinding(value);
}

function operatorReadinessReviewerDecisionSummaryHasExactCriticalIncidentsOpenBinding(value: string): boolean {
  return hasExactCriticalIncidentsOpenBinding(value);
}

function reviewerDecisionSummaryClosesCriticalIncidents(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return /\bcritical incidents?\s+open\s+0\b/i.test(normalized);
}

function hasExactOperatorReadyClaimAllowedBinding(value: string): boolean {
  return /\bOperator-ready claim allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactOperatorReadinessReleaseSupportedProductionDeploymentCandidateBinding(value: string): boolean {
  return /\bRelease supported\s*=\s*production deployment candidate\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactOperatorReadinessTestnetProductionCandidateClaimAllowedBinding(value: string): boolean {
  return /\bTestnet production-candidate claim allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactOperatorReadinessProductionReadyClaimDeniedBinding(value: string): boolean {
  return /\bProduction-ready claim allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactCriticalIncidentsOpenBinding(value: string): boolean {
  return /\bCritical incidents open\s*=\s*0\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function validateLinkedExternalIntegrationEvidence(
  externalIntegration: PendingEvidenceRow,
  options: ReleaseGateEvaluationOptions,
): string[] {
  const validation = options.externalIntegrationEvidenceValidation;
  if (!validation) {
    return [
      'Release Decision: Testnet production-candidate claims allowed requires actual external integration evidence validation input',
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires actual external integration evidence validation to pass',
    );
  }
  const evidencePayload = checkedEvidencePayload(externalIntegration.requiredResolution);
  if (!isValidatedExternalIntegrationEvidenceTargetLinked(evidencePayload, validation.target)) {
    issues.push(
      'Release Decision: Testnet production-candidate claims allowed requires external integration row to link a completed external integration artifact with integration:validate output',
    );
  }

  issues.push(...validateExternalIntegrationProductionCandidateFields(
    validation,
    'Release Decision: Testnet production-candidate claims allowed',
    options.cleanCheckoutEvidenceValidation?.classification?.gitCommit,
  ));
  if (validationPassed(validation)) {
    issues.push(...validateExternalIntegrationStructuredSummary(
      validation,
      'Release Decision: actual external integration evidence validation',
    ));
  }

  return issues;
}

function validateExternalIntegrationProductionCandidateFields(
  validation: ExternalIntegrationEvidenceValidationInput,
  prefix: string,
  cleanCheckoutGitCommit?: string,
): string[] {
  const issues: string[] = [];
  const classification = validation.classification ?? {};
  if (classification.releaseLevel !== 'production deployment candidate') {
    issues.push(
      `${prefix} requires validated external integration Release level = production deployment candidate`,
    );
  }
  if (
    classification.reviewerType !== 'independent engineer' &&
    classification.reviewerType !== 'exchange integration engineer'
  ) {
    issues.push(
      `${prefix} requires validated external integration Reviewer type = independent engineer or exchange integration engineer`,
    );
  }
  if (!isConcreteExternalIntegrationReviewerOrganization(classification.reviewerOrganization)) {
    issues.push(
      `${prefix} requires validated external integration Reviewer organization to identify a concrete external organization or affiliation`,
    );
  }
  issues.push(...validateExternalIntegrationClassificationProvenanceFields(
    prefix,
    classification,
    cleanCheckoutGitCommit,
  ));
  if (classification.environmentUsed !== 'testnet') {
    issues.push(
      `${prefix} requires validated external integration Environment used = testnet`,
    );
  }
  if (!isDisabledOrDryRunBroadcastMode(classification.broadcastMode)) {
    issues.push(
      `${prefix} requires validated external integration Broadcast mode disabled or dry-run`,
    );
  }
  if (classification.privateMaintainerContextUsed !== 'no') {
    issues.push(
      `${prefix} requires validated external integration Private maintainer context used = no`,
    );
  }

  const publicationDecision = validation.publicationDecision ?? {};
  if (publicationDecision.publicInstitutionalReferenceReleaseAllowed !== 'yes') {
    issues.push(
      `${prefix} requires validated external integration Public institutional-reference release allowed = yes`,
    );
  }
  if (publicationDecision.productionReadyClaimAllowed !== 'no') {
    issues.push(
      `${prefix} requires validated external integration Production-ready claim allowed = no`,
    );
  }
  if (publicationDecision.testnetProductionCandidateClaimAllowed !== 'yes') {
    issues.push(
      `${prefix} requires validated external integration Testnet production-candidate claim allowed = yes`,
    );
  }
  if (publicationDecision.privateMaintainerContextUsed !== 'no') {
    issues.push(
      `${prefix} requires validated external integration Private maintainer context used = no`,
    );
  }
  if (publicationDecision.releaseNotesUpdated !== 'yes') {
    issues.push(
      `${prefix} requires validated external integration Release notes updated = yes`,
    );
  }
  if (!hasCompletedExternalIntegrationReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '')) {
    issues.push(
      `${prefix} requires completed Gate 8 integration release-note update evidence`,
    );
  }
  if (!hasCompletedExternalIntegrationChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '')) {
    issues.push(
      `${prefix} requires completed Gate 8 checklist update evidence`,
    );
  }
  const externalIntegrationPublicationUpdateExactBindingRequirements = {
    requireExactReleaseSupportedProductionDeploymentCandidate:
      classification.releaseLevel === 'production deployment candidate',
    requireExactPublicInstitutionalReferenceReleaseAllowed:
      publicationDecision.publicInstitutionalReferenceReleaseAllowed === 'yes',
    requireExactPrivateMaintainerContextUsedNo:
      publicationDecision.privateMaintainerContextUsed === 'no',
    requireExactProductionReadyClaimAllowedNo:
      publicationDecision.productionReadyClaimAllowed === 'no',
    exactTestnetProductionCandidateClaimAllowed: normalizeExternalIntegrationYesNoClaimAllowance(
      publicationDecision.testnetProductionCandidateClaimAllowed,
    ),
  };
  issues.push(
    ...validateExternalIntegrationPublicationUpdateBoundary(
      `${prefix}: Gate 8 integration release-note update evidence`,
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      externalIntegrationPublicationUpdateExactBindingRequirements,
    ),
  );
  issues.push(
    ...validateExternalIntegrationPublicationUpdateBoundary(
      `${prefix}: Gate 8 checklist update evidence`,
      publicationDecision.requiredChecklistUpdates ?? '',
      externalIntegrationPublicationUpdateExactBindingRequirements,
    ),
  );
  if (
    hasCompletedExternalIntegrationReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '') &&
    hasCompletedExternalIntegrationChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '') &&
    haveSharedConcreteEvidenceTarget(
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      publicationDecision.requiredChecklistUpdates ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires distinct completed Gate 8 integration release-note and checklist update evidence targets`,
    );
  }
  if (!externalIntegrationReviewerDecisionSummaryIsBounded(publicationDecision)) {
    issues.push(
      `${prefix} requires validated external integration Reviewer decision summary to bind public institutional-reference release handling, production-ready claim handling, and testnet production-candidate claim handling`,
    );
  }
  issues.push(...validateExternalIntegrationReviewerDecisionSummaryTestnetClaimBinding(
    prefix,
    publicationDecision,
  ));
  issues.push(...validateExternalIntegrationReviewerDecisionSummaryReleaseSupport(
    prefix,
    publicationDecision,
  ));
  issues.push(...validateExternalIntegrationReviewerDecisionSummaryProductionReadyClaimDenial(
    prefix,
    publicationDecision,
  ));
  issues.push(...validateExternalIntegrationReviewerDecisionSummaryPrivateContext(
    prefix,
    publicationDecision,
  ));

  return issues;
}

function validateExternalIntegrationInstitutionalReferenceFields(
  validation: ExternalIntegrationEvidenceValidationInput,
  prefix: string,
  cleanCheckoutGitCommit?: string,
): string[] {
  const issues: string[] = [];
  const classification = validation.classification ?? {};
  if (
    classification.releaseLevel !== 'institutional reference' &&
    classification.releaseLevel !== 'production deployment candidate'
  ) {
    issues.push(
      `${prefix} requires validated external integration Release level = institutional reference or production deployment candidate`,
    );
  }
  if (
    classification.reviewerType !== 'independent engineer' &&
    classification.reviewerType !== 'exchange integration engineer'
  ) {
    issues.push(
      `${prefix} requires validated external integration Reviewer type = independent engineer or exchange integration engineer`,
    );
  }
  if (!isConcreteExternalIntegrationReviewerOrganization(classification.reviewerOrganization)) {
    issues.push(
      `${prefix} requires validated external integration Reviewer organization to identify a concrete external organization or affiliation`,
    );
  }
  issues.push(...validateExternalIntegrationClassificationProvenanceFields(
    prefix,
    classification,
    cleanCheckoutGitCommit,
  ));
  if (classification.releaseLevel === 'production deployment candidate' && classification.environmentUsed !== 'testnet') {
    issues.push(
      `${prefix} requires production deployment candidate external integration Environment used = testnet`,
    );
  }
  if (!isDisabledOrDryRunBroadcastMode(classification.broadcastMode)) {
    issues.push(
      `${prefix} requires validated external integration Broadcast mode disabled or dry-run`,
    );
  }
  if (classification.privateMaintainerContextUsed !== 'no') {
    issues.push(
      `${prefix} requires validated external integration Private maintainer context used = no`,
    );
  }

  const publicationDecision = validation.publicationDecision ?? {};
  if (publicationDecision.publicInstitutionalReferenceReleaseAllowed !== 'yes') {
    issues.push(
      `${prefix} requires validated external integration Public institutional-reference release allowed = yes`,
    );
  }
  if (publicationDecision.productionReadyClaimAllowed !== 'no') {
    issues.push(
      `${prefix} requires validated external integration Production-ready claim allowed = no`,
    );
  }
  if (
    classification.releaseLevel === 'institutional reference' &&
    publicationDecision.testnetProductionCandidateClaimAllowed !== 'no'
  ) {
    issues.push(
      `${prefix} requires validated external integration Testnet production-candidate claim allowed = yes only with Release level = production deployment candidate`,
    );
  }
  if (
    classification.releaseLevel === 'production deployment candidate' &&
    publicationDecision.testnetProductionCandidateClaimAllowed !== 'yes'
  ) {
    issues.push(
      `${prefix} requires production deployment candidate external integration Testnet production-candidate claim allowed = yes`,
    );
  }
  if (
    publicationDecision.testnetProductionCandidateClaimAllowed === 'yes' &&
    classification.environmentUsed !== 'testnet'
  ) {
    issues.push(
      `${prefix} requires validated external integration Testnet production-candidate claim allowed = yes only with Environment used = testnet`,
    );
  }
  if (publicationDecision.privateMaintainerContextUsed !== 'no') {
    issues.push(
      `${prefix} requires validated external integration Private maintainer context used = no`,
    );
  }
  if (publicationDecision.releaseNotesUpdated !== 'yes') {
    issues.push(
      `${prefix} requires validated external integration Release notes updated = yes`,
    );
  }
  if (!hasCompletedExternalIntegrationReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '')) {
    issues.push(
      `${prefix} requires completed Gate 8 integration release-note update evidence`,
    );
  }
  if (!hasCompletedExternalIntegrationChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '')) {
    issues.push(
      `${prefix} requires completed Gate 8 checklist update evidence`,
    );
  }
  const externalIntegrationPublicationUpdateExactBindingRequirements = {
    requireExactReleaseSupportedProductionDeploymentCandidate:
      classification.releaseLevel === 'production deployment candidate',
    requireExactPublicInstitutionalReferenceReleaseAllowed:
      publicationDecision.publicInstitutionalReferenceReleaseAllowed === 'yes',
    requireExactPrivateMaintainerContextUsedNo:
      publicationDecision.privateMaintainerContextUsed === 'no',
    requireExactProductionReadyClaimAllowedNo:
      publicationDecision.productionReadyClaimAllowed === 'no',
    exactTestnetProductionCandidateClaimAllowed: normalizeExternalIntegrationYesNoClaimAllowance(
      publicationDecision.testnetProductionCandidateClaimAllowed,
    ),
  };
  issues.push(
    ...validateExternalIntegrationPublicationUpdateBoundary(
      `${prefix}: Gate 8 integration release-note update evidence`,
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      externalIntegrationPublicationUpdateExactBindingRequirements,
    ),
  );
  issues.push(
    ...validateExternalIntegrationPublicationUpdateBoundary(
      `${prefix}: Gate 8 checklist update evidence`,
      publicationDecision.requiredChecklistUpdates ?? '',
      externalIntegrationPublicationUpdateExactBindingRequirements,
    ),
  );
  if (
    hasCompletedExternalIntegrationReleaseNoteUpdateEvidence(publicationDecision.requiredReleaseNoteUpdates ?? '') &&
    hasCompletedExternalIntegrationChecklistUpdateEvidence(publicationDecision.requiredChecklistUpdates ?? '') &&
    haveSharedConcreteEvidenceTarget(
      publicationDecision.requiredReleaseNoteUpdates ?? '',
      publicationDecision.requiredChecklistUpdates ?? '',
    )
  ) {
    issues.push(
      `${prefix} requires distinct completed Gate 8 integration release-note and checklist update evidence targets`,
    );
  }
  if (!externalIntegrationReviewerDecisionSummaryIsBounded(publicationDecision)) {
    issues.push(
      `${prefix} requires validated external integration Reviewer decision summary to bind public institutional-reference release handling, production-ready claim handling, and testnet production-candidate claim handling`,
    );
  }
  issues.push(...validateExternalIntegrationReviewerDecisionSummaryTestnetClaimBinding(
    prefix,
    publicationDecision,
  ));
  issues.push(...validateExternalIntegrationReviewerDecisionSummaryReleaseSupport(
    prefix,
    publicationDecision,
  ));
  issues.push(...validateExternalIntegrationReviewerDecisionSummaryProductionReadyClaimDenial(
    prefix,
    publicationDecision,
  ));
  issues.push(...validateExternalIntegrationReviewerDecisionSummaryPrivateContext(
    prefix,
    publicationDecision,
  ));

  return issues;
}

function validateExternalIntegrationClassificationProvenanceFields(
  prefix: string,
  classification: NonNullable<ExternalIntegrationEvidenceValidationInput['classification']>,
  cleanCheckoutGitCommit?: string,
): string[] {
  const issues: string[] = [];
  if (!isExternalIntegrationClassificationGitCommit(classification.gitCommit)) {
    issues.push(
      `${prefix} requires validated external integration Review Classification Git commit`,
    );
  } else if (
    isCleanCheckoutRunClassificationGitCommit(cleanCheckoutGitCommit) &&
    normalizeGitCommit(classification.gitCommit) !== normalizeGitCommit(cleanCheckoutGitCommit)
  ) {
    issues.push(
      `${prefix} requires external integration Git commit to match clean checkout Git commit ${cleanCheckoutGitCommit?.trim()}`,
    );
  }
  if (!isIsoCalendarDate(classification.date?.trim() ?? '')) {
    issues.push(
      `${prefix} requires validated external integration Review Classification Date to use YYYY-MM-DD`,
    );
  }
  if (isBlankValue(classification.leadReviewer)) {
    issues.push(
      `${prefix} requires validated external integration Review Classification Lead reviewer`,
    );
  }
  return issues;
}

function isExternalIntegrationClassificationGitCommit(value: string | undefined): boolean {
  return /^[a-f0-9]{7,40}$/i.test(value?.trim() ?? '');
}

function externalIntegrationReviewerDecisionSummaryIsBounded(
  publicationDecision: NonNullable<ExternalIntegrationEvidenceValidationInput['publicationDecision']>,
): boolean {
  const summary = publicationDecision.reviewerDecisionSummary ?? '';
  const normalized = normalizeDecisionSummaryForReleaseGate(summary);
  const testnetProductionCandidateClaimAllowed = normalizeExternalIntegrationYesNoClaimAllowance(
    publicationDecision.testnetProductionCandidateClaimAllowed,
  );
  const hasProductionReadyClaimBoundary =
    /\bproduction ready claim handling\b/i.test(normalized) &&
    (
      /\b(?:block|blocked|disallow|disallowed|not allowed|forbidden)\b/i.test(normalized) ||
      hasExactExternalIntegrationProductionReadyClaimDeniedBinding(summary)
    );
  return (
    externalIntegrationSummaryHasExactPublicInstitutionalReferenceReleaseAllowedBinding(summary) &&
    hasProductionReadyClaimBoundary &&
    (
      testnetProductionCandidateClaimAllowed === undefined ||
      (
        /\btestnet production candidate claim handling\b/i.test(normalized) &&
        (
          externalIntegrationReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(
            summary,
            testnetProductionCandidateClaimAllowed,
          )
        )
      )
    ) &&
    !externalIntegrationReviewerNoteAdmitsPrivateMaintainerContext(summary) &&
    validateReviewerDecisionSummaryClaimBoundary({
      prefix: 'external integration Reviewer decision summary',
      summary,
      productionReadyClaimAllowed: publicationDecision.productionReadyClaimAllowed,
      testnetProductionCandidateClaimAllowed,
    }).length === 0
  );
}

function externalIntegrationSummaryHasExactPublicInstitutionalReferenceReleaseAllowedBinding(value: string): boolean {
  return hasExactExternalIntegrationPublicInstitutionalReferenceReleaseAllowedBinding(value);
}

function validateExternalIntegrationReviewerDecisionSummaryTestnetClaimBinding(
  prefix: string,
  publicationDecision: NonNullable<ExternalIntegrationEvidenceValidationInput['publicationDecision']>,
): string[] {
  const testnetClaimAllowed = normalizeExternalIntegrationYesNoClaimAllowance(
    publicationDecision.testnetProductionCandidateClaimAllowed,
  );
  if (
    testnetClaimAllowed === undefined ||
    externalIntegrationReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
      testnetClaimAllowed,
    )
  ) {
    return [];
  }
  return [
    `${prefix} requires validated external integration Reviewer decision summary to use exact Testnet production-candidate claim allowed = ${testnetClaimAllowed}`,
  ];
}

function validateExternalIntegrationReviewerDecisionSummaryReleaseSupport(
  prefix: string,
  publicationDecision: NonNullable<ExternalIntegrationEvidenceValidationInput['publicationDecision']>,
): string[] {
  if (
    publicationDecision.testnetProductionCandidateClaimAllowed !== 'yes' ||
    hasExactExternalIntegrationReleaseSupportedProductionDeploymentCandidateBinding(
      publicationDecision.reviewerDecisionSummary ?? '',
    )
  ) {
    return [];
  }
  return [
    `${prefix} requires validated external integration Reviewer decision summary to use exact Release supported = production deployment candidate`,
  ];
}

function validateExternalIntegrationReviewerDecisionSummaryProductionReadyClaimDenial(
  prefix: string,
  publicationDecision: NonNullable<ExternalIntegrationEvidenceValidationInput['publicationDecision']>,
): string[] {
  if (
    publicationDecision.productionReadyClaimAllowed !== 'no' ||
    isBlankValue(publicationDecision.reviewerDecisionSummary) ||
    hasExactExternalIntegrationProductionReadyClaimDeniedBinding(publicationDecision.reviewerDecisionSummary ?? '')
  ) {
    return [];
  }
  return [
    `${prefix} requires validated external integration Reviewer decision summary to use exact Production-ready claim allowed = no`,
  ];
}

function externalIntegrationReviewerDecisionSummaryHasExactTestnetProductionCandidateClaimAllowedBinding(
  value: string,
  expected: 'yes' | 'no',
): boolean {
  return hasExactExternalIntegrationTestnetProductionCandidateClaimAllowedBinding(value, expected);
}

function hasExactExternalIntegrationPublicInstitutionalReferenceReleaseAllowedBinding(value: string): boolean {
  return /\bpublic institutional-reference release allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactExternalIntegrationPrivateMaintainerContextUsedNoBinding(value: string): boolean {
  return /\bprivate maintainer context used\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactExternalIntegrationProductionReadyClaimDeniedBinding(value: string): boolean {
  return /\bproduction-ready claim allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactExternalIntegrationReleaseSupportedProductionDeploymentCandidateBinding(value: string): boolean {
  return /\brelease supported\s*=\s*production deployment candidate\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function hasExactExternalIntegrationTestnetProductionCandidateClaimAllowedBinding(
  value: string,
  expected: 'yes' | 'no',
): boolean {
  if (expected === 'yes') {
    return /\btestnet production-candidate claim allowed\s*=\s*yes\s*(?:$|[.;,|)\]\r\n])/i.test(value);
  }
  return /\btestnet production-candidate claim allowed\s*=\s*no\s*(?:$|[.;,|)\]\r\n])/i.test(value);
}

function normalizeExternalIntegrationYesNoClaimAllowance(value: string | undefined): 'yes' | 'no' | undefined {
  return value === 'yes' || value === 'no' ? value : undefined;
}

interface ExternalIntegrationPublicationUpdateExactBindingRequirements {
  requireExactReleaseSupportedProductionDeploymentCandidate: boolean;
  requireExactPublicInstitutionalReferenceReleaseAllowed: boolean;
  requireExactPrivateMaintainerContextUsedNo: boolean;
  requireExactProductionReadyClaimAllowedNo: boolean;
  exactTestnetProductionCandidateClaimAllowed?: 'yes' | 'no';
}

function validateExternalIntegrationPublicationUpdateBoundary(
  label: string,
  text: string,
  exactBindingRequirements: ExternalIntegrationPublicationUpdateExactBindingRequirements,
): string[] {
  const issues = [
    ...validateReleaseGatePublicationClaimBoundary(label, text),
  ];

  if (
    exactBindingRequirements.requireExactReleaseSupportedProductionDeploymentCandidate &&
    !hasExactExternalIntegrationReleaseSupportedProductionDeploymentCandidateBinding(text)
  ) {
    issues.push(`${label} must use exact Release supported = production deployment candidate`);
  }
  if (
    exactBindingRequirements.requireExactPublicInstitutionalReferenceReleaseAllowed &&
    !hasExactExternalIntegrationPublicInstitutionalReferenceReleaseAllowedBinding(text)
  ) {
    issues.push(`${label} must use exact Public institutional-reference release allowed = yes`);
  }
  if (
    exactBindingRequirements.requireExactPrivateMaintainerContextUsedNo &&
    !hasExactExternalIntegrationPrivateMaintainerContextUsedNoBinding(text)
  ) {
    issues.push(`${label} must use exact Private maintainer context used = no`);
  }
  if (
    exactBindingRequirements.requireExactProductionReadyClaimAllowedNo &&
    !hasExactExternalIntegrationProductionReadyClaimDeniedBinding(text)
  ) {
    issues.push(`${label} must use exact Production-ready claim allowed = no`);
  }
  if (
    exactBindingRequirements.exactTestnetProductionCandidateClaimAllowed &&
    !hasExactExternalIntegrationTestnetProductionCandidateClaimAllowedBinding(
      text,
      exactBindingRequirements.exactTestnetProductionCandidateClaimAllowed,
    )
  ) {
    issues.push(
      `${label} must use exact Testnet production-candidate claim allowed = ${exactBindingRequirements.exactTestnetProductionCandidateClaimAllowed}`,
    );
  }
  if (externalIntegrationReviewerNoteAdmitsPrivateMaintainerContext(text)) {
    issues.push(`${label} must not admit private maintainer context`);
  }
  if (externalIntegrationPublicationUpdateDeniesPublicInstitutionalReferenceSupport(text)) {
    issues.push(`${label} must not deny public institutional-reference release support`);
  }
  if (
    exactBindingRequirements.exactTestnetProductionCandidateClaimAllowed !== 'no' &&
    externalIntegrationPublicationUpdateDeniesTestnetProductionCandidateSupport(text)
  ) {
    issues.push(`${label} must not deny testnet production-candidate claim support`);
  }
  if (hasContradictoryValidationFailureMarker(text)) {
    issues.push(`${label} must not mix completed/PASS evidence with failure markers`);
  }
  if (hasContradictoryReleaseNotesDecisionBinding(text)) {
    issues.push(`${label} must not include contradictory release-note decision bindings`);
  }

  return [...new Set(issues)];
}

function externalIntegrationPublicationUpdateDeniesPublicInstitutionalReferenceSupport(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\bpublic institutional reference release allowed\s+(?:no|false|0|blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\bpublic institutional reference release\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized)
  );
}

function externalIntegrationPublicationUpdateDeniesTestnetProductionCandidateSupport(value: string): boolean {
  const normalized = normalizeDecisionSummaryForReleaseGate(value);
  return (
    /\btestnet production candidate claim allowed\s+(?:no|false|0|blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\btestnet production candidate claim support\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized) ||
    /\btestnet production candidate claims?\s+(?:blocked|denied|disallowed|forbidden|not allowed)\b/i.test(normalized)
  );
}

function validateExternalIntegrationReviewerDecisionSummaryPrivateContext(
  prefix: string,
  publicationDecision: NonNullable<ExternalIntegrationEvidenceValidationInput['publicationDecision']>,
): string[] {
  const issues: string[] = [];
  const summary = publicationDecision.reviewerDecisionSummary ?? '';
  if (externalIntegrationReviewerNoteAdmitsPrivateMaintainerContext(summary)) {
    issues.push(
      `${prefix} requires validated external integration Reviewer decision summary not to admit private maintainer context`,
    );
  }
  if (
    (
      publicationDecision.privateMaintainerContextUsed === 'no' ||
      externalIntegrationReviewerNoteMentionsPrivateMaintainerContext(summary)
    ) &&
    !hasExactExternalIntegrationPrivateMaintainerContextUsedNoBinding(summary)
  ) {
    issues.push(
      `${prefix} requires validated external integration Reviewer decision summary to use exact Private maintainer context used = no`,
    );
  }
  return issues;
}

function externalIntegrationReviewerNoteMentionsPrivateMaintainerContext(value: string): boolean {
  return /\bprivate (?:maintainer )?context\b/.test(normalizeDecisionSummaryForReleaseGate(value));
}

function validateApprovedLinkedReleaseNotesDocument(
  fields: Partial<ReleaseDecisionFields>,
  options: ReleaseGateEvaluationOptions,
): string[] {
  if (!options.releaseNotesValidation) {
    return [
      'Release Decision: linked release notes require actual release notes validation input with structured evidence, assumption, blocker, claim, operator, sign-off rows',
    ];
  }
  return validateLinkedReleaseNotesDocument(fields, options, 'linked release notes');
}

function validateLinkedReleaseNotesDocument(
  fields: Partial<ReleaseDecisionFields>,
  options: ReleaseGateEvaluationOptions,
  context = 'Testnet production-candidate claims allowed',
): string[] {
  const issues: string[] = [];
  const validation = options.releaseNotesValidation;
  const releaseNotesArtifact = fields.releaseNotesArtifact ?? '';

  if (!validation) {
    return [
      `Release Decision: ${context} requires actual release notes validation input`,
    ];
  }

  if (!validationPassed(validation)) {
    issues.push(
      `Release Decision: ${context} requires actual release notes validation to pass`,
    );
  }

  if (!isValidatedReleaseNotesTargetLinked(releaseNotesArtifact, validation.target)) {
    issues.push(
      'Release Decision: actual release notes validation target must match a linked completed release notes document',
    );
  }
  issues.push(...validateReleaseNotesClassificationBinding(validation, fields, options, context));
  if (validationPassed(validation)) {
    issues.push(...validateReleaseNotesStructuredSummary(
      validation,
      'Release Decision: actual release notes validation',
    ));
    issues.push(...validateLinkedThreatModelEvidence(validation, options, context));
  }

  return issues;
}

function validateLinkedThreatModelEvidence(
  releaseNotesValidation: ReleaseNotesValidationInput,
  options: ReleaseGateEvaluationOptions,
  context: string,
): string[] {
  const validation = options.threatModelEvidenceValidation;
  const releaseNotesEvidenceRows = Array.isArray(releaseNotesValidation.evidenceRows)
    ? structuredRowObjects(releaseNotesValidation.evidenceRows)
    : [];
  const threatModelRow = releaseNotesEvidenceRows.find(
    row => row.evidenceClass === 'Threat model and evidence matrix',
  );

  if (!validation) {
    return [
      `Release Decision: ${context} requires actual threat-model/evidence-matrix validation input`,
    ];
  }

  const issues: string[] = [];
  if (!validationPassed(validation)) {
    issues.push(
      `Release Decision: ${context} requires actual threat-model/evidence-matrix validation to pass`,
    );
  }
  if (
    !threatModelRow ||
    !isValidatedThreatModelEvidenceTargetLinked(threatModelRow.linkOrArtifact, validation.target)
  ) {
    issues.push(
      'Release Decision: actual threat-model/evidence-matrix validation target must match linked completed threat-model/evidence-matrix evidence',
    );
  }
  issues.push(...validateThreatModelClassificationBinding(validation, options, context));
  if (validationPassed(validation)) {
    issues.push(...validateThreatModelStructuredSummary(
      validation,
      'Release Decision: actual threat-model/evidence-matrix validation',
    ));
  }

  return issues;
}

function validateThreatModelClassificationBinding(
  validation: ThreatModelEvidenceValidationInput,
  options: ReleaseGateEvaluationOptions,
  context: string,
): string[] {
  const classification = validation.classification;
  const gitCommit = classification?.gitCommit?.trim() ?? '';
  const cleanCheckoutGitCommit =
    options.cleanCheckoutEvidenceValidation?.classification?.gitCommit?.trim() ?? '';
  const issues: string[] = [];

  if (!classification) {
    return [
      `Release Decision: ${context} requires actual threat-model/evidence-matrix classification fields`,
    ];
  }
  if (isBlankValue(classification.matrixName)) {
    issues.push(`Release Decision: ${context} requires actual threat-model/evidence-matrix classification Matrix name`);
  }
  if (gitCommit.length === 0) {
    issues.push(`Release Decision: ${context} requires actual threat-model/evidence-matrix classification Git commit`);
  } else if (!/^[a-f0-9]{7,40}$/i.test(gitCommit)) {
    issues.push(`Release Decision: ${context} requires actual threat-model/evidence-matrix classification Git commit to be a 7-40 character hex commit`);
  }
  if (isBlankValue(classification.reviewer)) {
    issues.push(`Release Decision: ${context} requires actual threat-model/evidence-matrix classification Reviewer`);
  }
  if (!isIsoCalendarDate(classification.date?.trim() ?? '')) {
    issues.push(`Release Decision: ${context} requires actual threat-model/evidence-matrix classification Date to use YYYY-MM-DD`);
  }
  if (cleanCheckoutGitCommit.length === 0) {
    issues.push(`Release Decision: ${context} requires actual clean checkout run classification Git commit`);
  } else if (gitCommit.length > 0 && gitCommit !== cleanCheckoutGitCommit) {
    issues.push(
      `Release Decision: ${context} requires threat-model/evidence-matrix Git commit to match clean checkout Git commit ${cleanCheckoutGitCommit}`,
    );
  }

  return issues;
}

function validateReleaseNotesClassificationBinding(
  validation: ReleaseNotesValidationInput,
  fields: Partial<ReleaseDecisionFields>,
  options: ReleaseGateEvaluationOptions,
  context: string,
): string[] {
  const releaseLevel = validation.classification?.releaseLevel?.trim() ?? '';
  const releaseName = validation.classification?.releaseName?.trim() ?? '';
  const releaseNotesGitCommit = validation.classification?.gitCommit?.trim() ?? '';
  const decision = validation.classification?.decision?.trim() ?? '';
  const decisionOwner = validation.classification?.decisionOwner?.trim() ?? '';
  const decisionDate = validation.classification?.decisionDate?.trim() ?? '';
  const expectedReleaseLevel = fields.proposedReleaseLevel?.trim() ?? '';
  const cleanCheckoutGitCommit =
    options.cleanCheckoutEvidenceValidation?.classification?.gitCommit?.trim() ?? '';
  const issues: string[] = [];

  if (releaseName.length === 0) {
    issues.push(
      `Release Decision: ${context} requires actual release notes classification Release name`,
    );
  }
  if (releaseLevel.length === 0) {
    issues.push(
      `Release Decision: ${context} requires actual release notes classification release level`,
    );
  } else if (expectedReleaseLevel.length > 0 && releaseLevel !== expectedReleaseLevel) {
    issues.push(
      `Release Decision: ${context} requires actual release notes Release level = ${expectedReleaseLevel}`,
    );
  }
  if (!isAllowedReleaseNotesClassificationDecision(decision)) {
    issues.push(
      `Release Decision: ${context} requires actual release notes classification Decision`,
    );
  } else if (fields.finalDecision === 'approved' && decision !== 'proposed') {
    issues.push(
      `Release Decision: ${context} requires actual release notes classification Decision = proposed for approved release`,
    );
  }
  if (decisionOwner.length === 0) {
    issues.push(
      `Release Decision: ${context} requires actual release notes classification Decision owner`,
    );
  }
  if (!isIsoCalendarDate(decisionDate)) {
    issues.push(
      `Release Decision: ${context} requires actual release notes classification Decision date to use YYYY-MM-DD`,
    );
  }
  if (releaseNotesGitCommit.length === 0) {
    issues.push(
      `Release Decision: ${context} requires actual release notes classification Git commit`,
    );
  }
  if (cleanCheckoutGitCommit.length === 0) {
    issues.push(
      `Release Decision: ${context} requires actual clean checkout run classification Git commit`,
    );
  } else if (releaseNotesGitCommit.length > 0 && releaseNotesGitCommit !== cleanCheckoutGitCommit) {
    issues.push(
      `Release Decision: ${context} requires release notes Git commit to match clean checkout Git commit ${cleanCheckoutGitCommit}`,
    );
  }
  return issues;
}

const RELEASE_NOTES_CLASSIFICATION_DECISIONS = new Set(['proposed', 'blocked', 'rejected']);

function isAllowedReleaseNotesClassificationDecision(value: string): boolean {
  return RELEASE_NOTES_CLASSIFICATION_DECISIONS.has(value);
}

function isValidatedReleaseNotesTargetLinked(releaseNotesArtifact: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (normalizedTarget.length === 0) return false;
  return extractCompletedReleaseNotesDocumentTargets(releaseNotesArtifact)
    .map(normalizeEvidenceTarget)
    .includes(normalizedTarget);
}

function validateRequiredPendingEvidenceRows(rows: PendingEvidenceRow[]): string[] {
  const issues: string[] = [];
  const byItem = new Map(rows.map(row => [row.item, row]));
  const countsByItem = new Map<string, number>();

  for (const row of rows) {
    countsByItem.set(row.item, (countsByItem.get(row.item) ?? 0) + 1);
  }

  for (const [item, count] of countsByItem) {
    if (count > 1) {
      issues.push(`Pending Evidence Register: ${item}: duplicate blocker row`);
    }
  }

  for (const required of REQUIRED_PENDING_EVIDENCE_ROWS) {
    const row = byItem.get(required.item);
    if (!row) {
      issues.push(`Pending Evidence Register: ${required.item}: missing required blocker row`);
      continue;
    }
    if (row.gate !== required.gate) {
      issues.push(`Pending Evidence Register: ${required.item}: expected ${required.gate} but found ${row.gate}`);
    }
  }

  return issues;
}

function validateAllowedField(
  issues: string[],
  fields: Map<string, string>,
  section: string,
  field: string,
  allowed: Set<string>,
): void {
  const value = fields.get(field) ?? '';
  if (value.trim().length > 0 && !allowed.has(value)) {
    issues.push(`${section}: ${field} must be one of ${[...allowed].join(', ')}`);
  }
}

function parseTwoColumnFieldNames(section: string): string[] {
  return parseMarkdownTableRows(section)
    .filter(row => row.length >= 2)
    .map(row => row[0]);
}

function parseFirstMarkdownTableHeader(section: string): string[] {
  const headerLine = section
    .split(/\r?\n/)
    .find(line => line.trim().startsWith('|'));
  return headerLine ? parseMarkdownTableLine(headerLine) : [];
}

function parseTwoColumnTable(section: string): Map<string, string> {
  const fields = new Map<string, string>();
  const rows = parseMarkdownTableRows(section);
  for (const row of rows) {
    if (row.length >= 2) fields.set(row[0], row[1]);
  }
  return fields;
}

function sectionBetween(markdown: string, startHeading: string, endMarker?: string): string {
  const start = markdown.indexOf(startHeading);
  if (start < 0) return '';

  const contentStart = start + startHeading.length;
  const end = endMarker ? markdown.indexOf(endMarker, contentStart) : markdown.length;
  return markdown.slice(contentStart, end < 0 ? markdown.length : end);
}

function hasMarkdownTable(section: string): boolean {
  return /^\|/m.test(section);
}

function hasEvidenceMarker(text: string): boolean {
  return (
    /\[[^\]]+\]\([^)]+\)/.test(text) ||
    /\bnpm run [A-Za-z0-9:_-]+\b/.test(text) ||
    /(?:^|\s)artifact:\/\//.test(text)
  );
}

function hasCompletedEvidenceMarker(text: string): boolean {
  return !hasLocalOnlyEvidenceTarget(text) && extractEvidenceTargets(text).some(isCompletedEvidenceTarget);
}

function hasSharedCompletedEvidenceTarget(left: string, right: string): boolean {
  const leftTargets = new Set(
    extractEvidenceTargets(left)
      .filter(isCompletedEvidenceTarget)
      .map(normalizeEvidenceTarget),
  );
  return extractEvidenceTargets(right)
    .filter(isCompletedEvidenceTarget)
    .map(normalizeEvidenceTarget)
    .some(target => leftTargets.has(target));
}

function hasStructuredCustomPublicationBlockerResolution(text: string): boolean {
  return evidenceSegments(checkedEvidencePayload(text)).some(segment => {
    if (!hasCompletedEvidenceMarker(segment) || hasContradictoryValidationFailureMarker(segment)) {
      return false;
    }

    return (
      hasPositiveCustomValidatorOutput(segment) ||
      hasReleaseNotesPublicationBlockerReview(segment) ||
      hasReviewerPublicationBlockerDecision(segment)
    );
  });
}

function hasPositiveCustomValidatorOutput(segment: string): boolean {
  return (
    /\bnpm(?:\.cmd)?\s+run\s+[A-Za-z0-9:_-]*validate\b/i.test(segment) &&
    /\b(?:command output|output|log|transcript|validation output|validator output)\b/i.test(segment) &&
    hasPositiveValidationResult(segment) &&
    extractEvidenceTargets(segment).some(isConcreteQualifiedValidationOutputTarget)
  );
}

function hasReleaseNotesPublicationBlockerReview(segment: string): boolean {
  return (
    /\brelease[- ]notes?\b/i.test(segment) &&
    /\bpublication blockers?\b/i.test(segment) &&
    /\b(?:review|validated|validation)\b/i.test(segment) &&
    hasStructuredPublicationBlockerResolution(segment)
  );
}

function hasReviewerPublicationBlockerDecision(segment: string): boolean {
  return (
    /\bpublication blockers?\b/i.test(segment) &&
    /\breviewer(?:\s+(?:decision|approval|sign[- ]off|review))?\b/i.test(segment) &&
    /\breviewer decision\s*=\s*approve[ \t]*(?:$|[.;,|)\]\r\n])/i.test(segment) &&
    hasStructuredPublicationBlockerResolution(segment)
  );
}

function hasStructuredPublicationBlockerResolution(segment: string): boolean {
  return /\bpublication blockers?\s+resolved\s*=\s*yes[ \t]*(?:$|[.;,|)\]\r\n])/i.test(segment);
}

function hasReleaseNotesValidationEvidence(text: string): boolean {
  return (
    /\bnpm run release-notes:validate\b/.test(text) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(text)
  );
}

function hasCompletedReleaseNotesDocumentArtifact(text: string): boolean {
  return extractCompletedReleaseNotesDocumentTargets(text).length > 0;
}

function hasProductionDeploymentCandidateReleaseNotesEvidence(text: string): boolean {
  return nonValidationEvidenceSegments(text).some(segment => {
    const completedReleaseNotesTargets = extractEvidenceTargets(segment)
      .filter(isCompletedReleaseNotesDocumentTarget);
    return (
      completedReleaseNotesTargets.length > 0 &&
      (
        hasProductionDeploymentCandidateReleaseNotesMarker(segment) ||
        completedReleaseNotesTargets.some(hasProductionDeploymentCandidateReleaseNotesMarker)
      )
    );
  });
}

function hasCompletedMarkdownReleaseNotesDocumentArtifact(text: string): boolean {
  return extractCompletedReleaseNotesDocumentTargets(text).some(isMarkdownEvidenceTarget);
}

function hasCompletedReleaseNotesTemplateArtifact(text: string): boolean {
  return extractEvidenceTargets(text).some(target => {
    const normalized = normalizeEvidenceTarget(target);
    return (
      normalized.includes('release-notes') &&
      hasAffirmativeCompletedMarker(target) &&
      /-template\.md$/i.test(normalized)
    );
  });
}

function isCompletedReleaseNotesDocumentTarget(target: string): boolean {
  const normalized = target.toLowerCase();
  return (
    normalized.includes('release-notes') &&
    hasAffirmativeCompletedMarker(target) &&
    !/-template\.md(?:[#?].*)?$/i.test(normalized) &&
    !/(validation|validate|log|transcript)/.test(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized)
  );
}

function isCompletedBackupRestoreEvidenceTarget(target: string): boolean {
  const normalized = target.toLowerCase();
  return (
    (
      normalized.includes('backup-restore') ||
      (normalized.includes('backup') && normalized.includes('restore')) ||
      (normalized.includes('recovery') && normalized.includes('restore'))
    ) &&
    isMarkdownEvidenceTarget(normalized) &&
    hasAffirmativeCompletedMarker(target) &&
    !/-template\.md(?:[#?].*)?$/i.test(normalized) &&
    !/(validation|validate|log|transcript)/.test(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized)
  );
}

function isCompletedDependencyReviewEvidenceTarget(target: string): boolean {
  const normalized = target.toLowerCase();
  return (
    (normalized.includes('dependency-review') || normalized.includes('dependency')) &&
    isMarkdownEvidenceTarget(normalized) &&
    hasAffirmativeCompletedMarker(target) &&
    !/-template\.md(?:[#?].*)?$/i.test(normalized) &&
    !/(validation|validate|log|transcript)/.test(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized)
  );
}

function isCompletedCleanCheckoutEvidenceTarget(target: string): boolean {
  const normalized = target.toLowerCase();
  return (
    normalized.includes('clean') &&
    normalized.includes('checkout') &&
    isMarkdownEvidenceTarget(normalized) &&
    hasAffirmativeCompletedMarker(target) &&
    !/-template\.md(?:[#?].*)?$/i.test(normalized) &&
    !/(validation|validate|log|transcript)/.test(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized)
  );
}

function isCompletedSecurityReviewEvidenceTarget(target: string): boolean {
  const normalized = target.toLowerCase();
  return (
    (normalized.includes('security-review') || normalized.includes('security')) &&
    isMarkdownEvidenceTarget(normalized) &&
    hasAffirmativeCompletedMarker(target) &&
    !/-template\.md(?:[#?].*)?$/i.test(normalized) &&
    !/(validation|validate|log|transcript)/.test(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized)
  );
}

function isCompletedTrustlessBurnEvidenceTarget(target: string): boolean {
  const normalized = target.toLowerCase();
  return (
    normalized.includes('trustless') &&
    normalized.includes('burn') &&
    isMarkdownEvidenceTarget(normalized) &&
    hasAffirmativeCompletedMarker(target) &&
    !/-template\.md(?:[#?].*)?$/i.test(normalized) &&
    !/(validation|validate|log|transcript)/.test(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized)
  );
}

function isCompletedBenchmarkEvidenceTarget(target: string): boolean {
  const normalized = target.toLowerCase();
  return (
    normalized.includes('benchmark') &&
    isMarkdownEvidenceTarget(normalized) &&
    hasAffirmativeCompletedMarker(target) &&
    !/-template\.md(?:[#?].*)?$/i.test(normalized) &&
    !/(validation|validate|log|transcript)/.test(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized)
  );
}

function isCompletedCommitteeGovernanceEvidenceTarget(target: string): boolean {
  const normalized = target.toLowerCase();
  return (
    normalized.includes('governance') &&
    isMarkdownEvidenceTarget(normalized) &&
    hasAffirmativeCompletedMarker(target) &&
    !/-template\.md(?:[#?].*)?$/i.test(normalized) &&
    !/(validation|validate|log|transcript)/.test(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized)
  );
}

function isCompletedOperatorReadinessEvidenceTarget(target: string): boolean {
  const normalized = target.toLowerCase();
  return (
    normalized.includes('operator') &&
    normalized.includes('readiness') &&
    isMarkdownEvidenceTarget(normalized) &&
    hasAffirmativeCompletedMarker(target) &&
    !/-template\.md(?:[#?].*)?$/i.test(normalized) &&
    !/(validation|validate|log|transcript)/.test(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized)
  );
}

function isCompletedExternalIntegrationEvidenceTarget(target: string): boolean {
  const normalized = target.toLowerCase();
  return (
    normalized.includes('integration') &&
    isMarkdownEvidenceTarget(normalized) &&
    hasAffirmativeCompletedMarker(target) &&
    !/-template\.md(?:[#?].*)?$/i.test(normalized) &&
    !/(validation|validate|log|transcript)/.test(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized)
  );
}

function isCompletedTechnicalAddendumEvidenceTarget(target: string): boolean {
  const normalized = target.toLowerCase();
  return (
    (
      normalized.includes('technical-addendum') ||
      (normalized.includes('technical') && normalized.includes('addendum')) ||
      (normalized.includes('architecture') && normalized.includes('manual'))
    ) &&
    isMarkdownEvidenceTarget(normalized) &&
    hasAffirmativeCompletedMarker(target) &&
    !/-template\.md(?:[#?].*)?$/i.test(normalized) &&
    !/(validation|validate|log|transcript)/.test(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized)
  );
}

function isCompletedThreatModelEvidenceTarget(target: string): boolean {
  const normalized = target.toLowerCase();
  const basename = targetBasename(normalized);
  return (
    (
      basename === 'security-evidence-matrix.md' ||
      basename === 'aggregate-settlement-threat-model.md' ||
      normalized.includes('threat-model-evidence') ||
      (normalized.includes('threat') && normalized.includes('matrix'))
    ) &&
    isMarkdownEvidenceTarget(normalized) &&
    !/-template\.md(?:[#?].*)?$/i.test(normalized) &&
    !/(validation|validate|log|transcript)/.test(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized)
  );
}

function hasDistinctQualifiedDependencyReviewValidationOutputTarget(
  segment: string,
  completedTarget: string,
): boolean {
  return extractEvidenceTargets(dependencyReviewValidationOutputEvidenceText(segment))
    .map(normalizeEvidenceTarget)
    .some(target => isDistinctQualifiedValidationOutputTarget(target, completedTarget));
}

function hasDistinctQualifiedBackupRestoreValidationOutputTarget(
  segment: string,
  completedTarget: string,
): boolean {
  return extractEvidenceTargets(backupRestoreValidationOutputEvidenceText(segment))
    .map(normalizeEvidenceTarget)
    .some(target => isDistinctQualifiedValidationOutputTarget(target, completedTarget));
}

function hasDistinctQualifiedCleanCheckoutValidationOutputTarget(
  segment: string,
  completedTarget: string,
): boolean {
  return extractEvidenceTargets(cleanCheckoutValidationOutputEvidenceText(segment))
    .map(normalizeEvidenceTarget)
    .some(target => isDistinctQualifiedValidationOutputTarget(target, completedTarget));
}

function hasDistinctQualifiedSecurityReviewValidationOutputTarget(
  segment: string,
  completedTarget: string,
): boolean {
  return extractEvidenceTargets(securityReviewValidationOutputEvidenceText(segment))
    .map(normalizeEvidenceTarget)
    .some(target => isDistinctQualifiedValidationOutputTarget(target, completedTarget));
}

function hasDistinctQualifiedTrustlessBurnValidationOutputTarget(
  segment: string,
  completedTarget: string,
): boolean {
  return extractEvidenceTargets(trustlessBurnValidationOutputEvidenceText(segment))
    .map(normalizeEvidenceTarget)
    .some(target => isDistinctQualifiedValidationOutputTarget(target, completedTarget));
}

function hasDistinctQualifiedBenchmarkValidationOutputTarget(
  segment: string,
  completedTarget: string,
): boolean {
  return extractEvidenceTargets(benchmarkValidationOutputEvidenceText(segment))
    .map(normalizeEvidenceTarget)
    .some(target => isDistinctQualifiedValidationOutputTarget(target, completedTarget));
}

function hasDistinctQualifiedCommitteeGovernanceValidationOutputTarget(
  segment: string,
  completedTarget: string,
): boolean {
  return extractEvidenceTargets(committeeGovernanceValidationOutputEvidenceText(segment))
    .map(normalizeEvidenceTarget)
    .some(target => isDistinctQualifiedValidationOutputTarget(target, completedTarget));
}

function hasDistinctQualifiedOperatorReadinessValidationOutputTarget(
  segment: string,
  completedTarget: string,
): boolean {
  return extractEvidenceTargets(operatorReadinessValidationOutputEvidenceText(segment))
    .map(normalizeEvidenceTarget)
    .some(target => isDistinctQualifiedValidationOutputTarget(target, completedTarget));
}

function hasDistinctQualifiedExternalIntegrationValidationOutputTarget(
  segment: string,
  completedTarget: string,
): boolean {
  return extractEvidenceTargets(externalIntegrationValidationOutputEvidenceText(segment))
    .map(normalizeEvidenceTarget)
    .some(target => isDistinctQualifiedValidationOutputTarget(target, completedTarget));
}

function hasDistinctQualifiedTechnicalAddendumValidationOutputTarget(
  segment: string,
  completedTarget: string,
): boolean {
  return extractEvidenceTargets(technicalAddendumValidationOutputEvidenceText(segment))
    .map(normalizeEvidenceTarget)
    .some(target => isDistinctQualifiedValidationOutputTarget(target, completedTarget));
}

function hasDistinctQualifiedThreatModelValidationOutputTarget(
  segment: string,
  completedTarget: string,
): boolean {
  return extractEvidenceTargets(threatModelValidationOutputEvidenceText(segment))
    .map(normalizeEvidenceTarget)
    .some(target => isDistinctQualifiedValidationOutputTarget(target, completedTarget));
}

function isDistinctQualifiedValidationOutputTarget(target: string, completedTarget: string): boolean {
  return target !== completedTarget && isConcreteQualifiedValidationOutputTarget(target);
}

function isConcreteQualifiedValidationOutputTarget(target: string): boolean {
  const normalized = normalizeEvidenceTarget(target);
  return (
    normalized.length > 0 &&
    !/[<>]/.test(normalized) &&
    !hasNonConcreteEvidenceTargetSegment(normalized) &&
    /\b(?:validate|validation|log|transcript|ci|workflow)\b/i.test(normalized)
  );
}

function hasContradictoryValidationFailureMarker(segment: string): boolean {
  const normalized = normalizeEvidenceMarkerText(segment);
  return (
    hasUnresolvedIssueMarker(normalized) ||
    /\bFAIL\b/i.test(normalized) ||
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

function hasPositiveValidationResult(segment: string): boolean {
  if (hasContradictoryValidationFailureMarker(segment)) return false;
  return (
    /\bPASS\b(?!\s*\/)/.test(segment) ||
    hasExactZeroExitStatusEvidence(segment) ||
    /\bno\s+structural\s+issues?\b/i.test(segment) ||
    /\b0\s+structural\s+issues?\b/i.test(segment)
  );
}

function hasPositiveDependencyReviewValidationResult(segment: string): boolean {
  return hasPositiveValidationResult(segment);
}

function hasPositiveBackupRestoreValidationResult(segment: string): boolean {
  return hasPositiveDependencyReviewValidationResult(segment);
}

function hasPositiveCleanCheckoutValidationResult(segment: string): boolean {
  return hasPositiveDependencyReviewValidationResult(segment);
}

function hasPositiveSecurityReviewValidationResult(segment: string): boolean {
  return hasPositiveDependencyReviewValidationResult(segment);
}

function hasPositiveTrustlessBurnValidationResult(segment: string): boolean {
  return hasPositiveDependencyReviewValidationResult(segment);
}

function hasPositiveBenchmarkValidationResult(segment: string): boolean {
  return hasPositiveDependencyReviewValidationResult(segment);
}

function hasPositiveCommitteeGovernanceValidationResult(segment: string): boolean {
  return hasPositiveDependencyReviewValidationResult(segment);
}

function hasPositiveOperatorReadinessValidationResult(segment: string): boolean {
  return hasPositiveDependencyReviewValidationResult(segment);
}

function hasPositiveExternalIntegrationValidationResult(segment: string): boolean {
  return hasPositiveDependencyReviewValidationResult(segment);
}

function hasPositiveTechnicalAddendumValidationResult(segment: string): boolean {
  return hasPositiveDependencyReviewValidationResult(segment);
}

function hasPositiveThreatModelValidationResult(segment: string): boolean {
  return hasPositiveDependencyReviewValidationResult(segment);
}

function identifiesDependencyReviewSignerUpstreamResolution(value: string): boolean {
  return (
    /\b(upstream|released|release)\b/i.test(value) &&
    identifiesConcreteDependencyReviewSignerRelease(value) &&
    identifiesConcreteDependencyReviewSignerConformance(value) &&
    !hasNegatedDependencyReviewSignerConformance(value)
  );
}

function hasDependencyReviewSignerUpstreamEvidence(value: string): boolean {
  return (
    hasCompletedDependencyEvidenceTarget(value) &&
    hasNoContradictoryDependencyEvidenceMarker(value) &&
    /\b(upstream|released|release)\b/i.test(value) &&
    identifiesConcreteDependencyReviewSignerRelease(value) &&
    identifiesConcreteDependencyReviewSignerConformance(value) &&
    !hasNegatedDependencyReviewSignerConformance(value)
  );
}

function hasDependencyReviewFailClosedSignerAction(value: string): boolean {
  return (
    hasFailClosedSignerBlockerWording(value) &&
    /\bContextExtension\b/i.test(value) &&
    /\bproduction[- ]ready claims?\s+blocked\b/i.test(value) &&
    /\btestnet production[- ]candidate claims?\s+blocked\b/i.test(value)
  );
}

function hasDependencyReviewFailClosedSignerEvidence(
  requiredEvidence: string,
  releaseAction: string,
): boolean {
  const combined = `${requiredEvidence} ${releaseAction}`;
  return (
    hasCompletedDependencyEvidenceTarget(requiredEvidence) &&
    hasNoContradictoryDependencyEvidenceMarker(requiredEvidence) &&
    /\bContextExtension\b/i.test(combined) &&
    /\b(?:guard|blocker|fail[- ]closed)\b/i.test(combined) &&
    /\bproduction[- ]ready claims?\s+blocked\b/i.test(combined) &&
    /\btestnet production[- ]candidate claims?\s+blocked\b/i.test(combined)
  );
}

function identifiesConcreteDependencyReviewSignerRelease(value: string): boolean {
  return (
    /\b(?:tag|version)\s*[:=]\s*v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/i.test(value) ||
    /\b(?:commit|sha)\s*[:=]\s*[a-f0-9]{7,40}\b/i.test(value) ||
    /\bv?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?\b/i.test(value) ||
    /\b[a-f0-9]{7,40}\b/i.test(value)
  );
}

function identifiesConcreteDependencyReviewSignerConformance(value: string): boolean {
  return (
    /\b(golden vectors?|transactions\/check|node check)\b/i.test(value) &&
    (
      /\b(?:positive|passing|passed|validated|verified|matched|matching|agrees?|agreement|successful|live)\b.{0,80}\b(?:jvm|node|golden vectors?|transactions\/check|node check)\b/i.test(value) ||
      /\b(?:jvm|node|golden vectors?|transactions\/check|node check)\b.{0,80}\b(?:positive|passing|passed|validated|verified|matched|matching|agrees?|agreement|successful|live)\b/i.test(value)
    )
  );
}

function hasNegatedDependencyReviewSignerConformance(value: string): boolean {
  return (
    /\b(?:missing|absent|unavailable|unvalidated|unverified|not validated|not verified|not yet validated|not yet verified|not fully validated|not fully verified|partially validated|partially verified|without)\b.{0,80}\b(?:jvm|node|conformance|golden vectors?|transactions\/check)\b/i.test(value) ||
    /\b(?:jvm|node|conformance|golden vectors?|transactions\/check)\b.{0,80}\b(?:missing|absent|unavailable|unvalidated|unverified|not validated|not verified|not yet validated|not yet verified|not fully validated|not fully verified|partially validated|partially verified|without)\b/i.test(value)
  );
}

function isExactZeroEvidenceValue(value: string): boolean {
  return value.trim() === '0';
}

function hasFailClosedSignerBlockerWording(value: string): boolean {
  return /\bfail-closed\b|\bkeep pinned\b|\bblocker rationale\b|\bblocked until upstream\b/i.test(value);
}

function stripEvidenceTargets(value: string): string {
  return value
    .replace(/(?:^|\s)artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+/g, ' ')
    .replace(/\[[^\]]+\]\([^)]+\)/g, ' ');
}

function hasAffirmativeCompletedMarker(target: string): boolean {
  const basename = targetBasename(target).replace(/\.[^.]+$/, '');
  const tokens = basename.split(/[^a-z0-9]+/i).filter(Boolean).map(token => token.toLowerCase());
  return tokens.some((token, index) =>
    token === 'completed' &&
    tokens[index - 1] !== 'not' &&
    tokens[index - 1] !== 'un',
  );
}

function hasProductionDeploymentCandidateReleaseNotesMarker(value: string): boolean {
  const normalized = normalizeEvidenceMarkerText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  return (
    /\bproduction\s+deployment\s+candidate\b/.test(normalized) &&
    /\brelease\s+notes\b/.test(normalized) &&
    !hasNegatedProductionDeploymentCandidateReleaseNotesMarker(normalized)
  );
}

function hasNegatedProductionDeploymentCandidateReleaseNotesMarker(normalized: string): boolean {
  return (
    /\b(?:not|no|without|non)\s+(?:a\s+|the\s+)?production\s+deployment\s+candidate\s+release\s+notes?\b/.test(normalized) ||
    /\brelease\s+notes?\s+(?:are\s+|is\s+|were\s+|was\s+)?(?:not|no|without|non)\s+(?:a\s+|the\s+)?production\s+deployment\s+candidate\b/.test(normalized)
  );
}

function hasReleaseNotesValidationTargetBinding(text: string): boolean {
  const validationSegments = validationEvidenceSegments(text);
  return extractCompletedReleaseNotesDocumentTargets(text)
    .map(normalizeEvidenceTarget)
    .some(target => {
      if (target.length === 0) return false;
      const escapedTarget = escapeRegExp(target);
      const targetBinding = new RegExp(
        `\\b(?:validated target|validated input|release-notes validate target|release-notes validation target)\\b[^\\n.;|]*${escapedTarget}`,
        'i',
      );
      return validationSegments.some(segment => targetBinding.test(segment));
    });
}

function hasDistinctReleaseNotesValidationOutputTarget(text: string): boolean {
  const completedTargets = new Set(
    extractCompletedReleaseNotesDocumentTargets(text).map(normalizeEvidenceTarget),
  );
  return extractReleaseNotesValidationOutputTargets(text)
    .map(normalizeEvidenceTarget)
    .some(target => !completedTargets.has(target) && isConcreteQualifiedValidationOutputTarget(target));
}

function hasQualifiedReleaseNotesValidationOutputTarget(text: string): boolean {
  return extractReleaseNotesValidationOutputTargets(text)
    .map(normalizeEvidenceTarget)
    .some(isConcreteQualifiedValidationOutputTarget);
}

function hasPositiveReleaseNotesValidationResult(text: string): boolean {
  return validationEvidenceSegments(text).some(segment =>
    hasPositiveValidationResult(segment) ||
    (!hasContradictoryValidationFailureMarker(segment) && /\bno\s+issues?\b/i.test(segment)),
  );
}

function hasValidatedCompletedLiveRehearsalEvidence(text: string): boolean {
  const payload = checkedEvidencePayload(text);
  const completedTargets = extractCompletedLiveRehearsalTargets(payload);
  if (completedTargets.length === 0) return false;

  const validationSegments = evidenceSegments(payload)
    .filter(isRehearsalValidationEvidenceSegment);
  if (validationSegments.length === 0) return false;

  const hasPositiveValidation = validationSegments.some(hasPositiveValidationResult);
  if (!hasPositiveValidation) return false;
  if (!hasDistinctQualifiedRehearsalValidationOutputTarget(validationSegments, completedTargets)) {
    return false;
  }
  if (!hasRequiredLiveRehearsalValidationFacts(validationSegments)) {
    return false;
  }

  return completedTargets.some(target => {
    const escapedTarget = escapeRegExp(target);
    const targetBinding = new RegExp(
      `\\b(?:validated target|validated input|rehearsal validate target|rehearsal validation target)\\b[^\\n.;|]*${escapedTarget}`,
      'i',
    );
    return validationSegments.some(segment => targetBinding.test(normalizeEvidenceTarget(segment)));
  });
}

function isValidatedCompletedLiveRehearsalEvidenceTargetLinked(text: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  if (normalizedTarget.length === 0 || !isMarkdownEvidenceTarget(normalizedTarget)) return false;

  const payload = checkedEvidencePayload(text);
  const completedTargets = extractCompletedLiveRehearsalTargets(payload)
    .map(normalizeEvidenceTarget);
  if (!completedTargets.includes(normalizedTarget)) return false;

  const validationSegments = evidenceSegments(payload)
    .filter(isRehearsalValidationEvidenceSegment);
  if (validationSegments.length === 0) return false;

  const hasPositiveValidation = validationSegments.some(hasPositiveValidationResult);
  if (!hasPositiveValidation) return false;
  if (!hasDistinctQualifiedRehearsalValidationOutputTarget(validationSegments, completedTargets)) {
    return false;
  }
  if (!hasRequiredLiveRehearsalValidationFacts(validationSegments)) return false;

  const escapedTarget = escapeRegExp(normalizedTarget);
  const targetBinding = new RegExp(
    `\\b(?:validated target|validated input|rehearsal validate target|rehearsal validation target)\\b[^\\n.;|]*${escapedTarget}`,
    'i',
  );
  return validationSegments.some(segment => targetBinding.test(normalizeEvidenceTarget(segment)));
}

function hasPassingRehearsalGate(
  validation: LiveRehearsalEvidenceValidationInput,
  releaseGate: string,
): boolean {
  const rows = Array.isArray(validation.rows)
    ? structuredRowObjects(validation.rows)
    : [];
  return rows.some(row =>
    row.releaseGate === releaseGate &&
    row.status === 'pass'
  );
}

function hasValidatedLivePreflightEvidence(text: string): boolean {
  const payload = checkedEvidencePayload(text);
  const completedTargets = extractCompletedLiveRehearsalTargets(payload);
  if (completedTargets.length === 0) return false;

  const livePreflightSegments = evidenceSegments(payload)
    .filter(isRehearsalLivePreflightEvidenceSegment);
  if (livePreflightSegments.length === 0) return false;

  const hasPositiveValidation = livePreflightSegments.some(hasPositiveValidationResult);
  if (!hasPositiveValidation) return false;
  if (!hasDistinctQualifiedLivePreflightOutputTarget(livePreflightSegments)) return false;
  if (!hasRequiredLivePreflightFacts(livePreflightSegments)) return false;
  if (!hasLivePreflightExpectedTxBoundToValidation(payload, livePreflightSegments)) return false;
  if (!hasLivePreflightTargetBoundToCompletedRehearsal(livePreflightSegments, completedTargets)) {
    return false;
  }

  return true;
}

function hasValidatedPostSubmitObserveEvidence(text: string): boolean {
  const payload = checkedEvidencePayload(text);
  const observeSegments = evidenceSegments(payload)
    .filter(isRehearsalPostSubmitObserveEvidenceSegment);
  if (observeSegments.length === 0) return false;

  const hasPositiveValidation = observeSegments.some(hasPositiveValidationResult);
  if (!hasPositiveValidation) return false;
  if (!hasDistinctQualifiedPostSubmitObserveOutputTarget(observeSegments)) return false;
  if (!hasRequiredPostSubmitObserveFacts(observeSegments)) return false;

  const expectedTxIds = new Set(
    [
      ...evidenceSegments(payload).filter(isRehearsalValidationEvidenceSegment),
      ...evidenceSegments(payload).filter(isRehearsalLivePreflightEvidenceSegment),
    ].flatMap(extractExpectedTransactionIds),
  );
  const nonObserveSegments = evidenceSegments(payload)
    .filter(segment => !isRehearsalPostSubmitObserveEvidenceSegment(segment));
  const submittedTxIds = new Set(nonObserveSegments.flatMap(extractSubmittedTransactionIds));
  const observeTxIds = new Set([
    ...observeSegments.flatMap(extractExpectedTransactionIds),
    ...observeSegments.flatMap(extractSubmittedTransactionIds),
  ]);

  return [...observeTxIds].some(txId => expectedTxIds.has(txId) || submittedTxIds.has(txId));
}

function hasValidatedAssemblyReportEvidence(text: string): boolean {
  const payload = checkedEvidencePayload(text);
  const assemblySegments = evidenceSegments(payload)
    .filter(isRehearsalAssemblyEvidenceSegment);
  if (assemblySegments.length === 0) return false;

  const hasPositiveValidation = assemblySegments.some(hasPositiveValidationResult);
  if (!hasPositiveValidation) return false;

  const outputTargets = assemblySegments
    .flatMap(segment => extractEvidenceTargets(assemblyReportOutputEvidenceText(segment)))
    .map(normalizeEvidenceTarget);
  return outputTargets.some(target =>
    isConcreteJsonEvidenceTarget(target) &&
    /\b(?:assembly|assemble|rehearsal[-_ ]?assembly)\b/i.test(target) &&
    !/(template|example|sample)/i.test(target)
  );
}

function hasValidatedPrepBundleEvidence(text: string): boolean {
  const payload = checkedEvidencePayload(text);
  const prepBundleSegments = evidenceSegments(payload)
    .filter(isRehearsalPrepBundleEvidenceSegment);
  if (prepBundleSegments.length === 0) return false;

  const hasPositiveValidation = prepBundleSegments.some(hasPositiveValidationResult);
  if (!hasPositiveValidation) return false;

  const hasBoundaryFacts = prepBundleSegments.some(segment =>
    /\bpreparedCommands\b.{0,120}\bnon[- ]?broadcast\b/i.test(segment) &&
    /\bgateBoundary\b.{0,80}\ball false\b/i.test(segment) &&
    /\bstageStatuses\b.{0,120}\bGO\b(?!\s*\/).{0,120}\bCREATED\b(?!\s*\/).{0,120}\bLINKED\b(?!\s*\/)/i.test(segment)
  );
  if (!hasBoundaryFacts) return false;

  const outputTargets = prepBundleSegments
    .flatMap(segment => extractEvidenceTargets(prepBundleOutputEvidenceText(segment)))
    .map(normalizeEvidenceTarget);
  return outputTargets.some(target =>
    isConcreteJsonEvidenceTarget(target) &&
    /\b(?:prep[-_ ]?bundle|preparation[-_ ]?bundle)\b/i.test(target) &&
    !/(template|example|sample)/i.test(target)
  );
}

function hasValidatedOfflineGateEvidence(text: string): boolean {
  const payload = checkedEvidencePayload(text);
  const offlineGateSegments = evidenceSegments(payload)
    .filter(isRehearsalOfflineGateEvidenceSegment);
  if (offlineGateSegments.length === 0) return false;

  const hasPositiveValidation = offlineGateSegments.some(hasPositiveValidationResult);
  if (!hasPositiveValidation) return false;

  const hasOfflineGateFacts = offlineGateSegments.some(segment =>
    /\boffline[- ]gate JSON report completed structured evidence\b/i.test(segment) &&
    /\ball offline stages pass[- ]equivalent\b/i.test(segment) &&
    /\bno[- ]broadcast\b/i.test(segment) &&
    /\bartifact binding consistency\b/i.test(segment)
  );
  if (!hasOfflineGateFacts) return false;

  const outputTargets = offlineGateSegments
    .flatMap(segment => extractEvidenceTargets(offlineGateOutputEvidenceText(segment)))
    .map(normalizeEvidenceTarget);
  return outputTargets.some(target =>
    isConcreteJsonEvidenceTarget(target) &&
    /\boffline[-_ ]?gate\b/i.test(target) &&
    !/(template|example|sample)/i.test(target)
  );
}

function hasValidatedRecoveryObserveEvidence(text: string, expectedKind: TestnetRecoveryDrillKind): boolean {
  const recoverySegments = evidenceSegments(checkedEvidencePayload(text))
    .filter(segment => isRecoveryObserveEvidenceSegment(segment, expectedKind));
  if (recoverySegments.length === 0) return false;

  const hasObservationCommand = recoverySegments.some(segment =>
    /\bnpm run rehearsal:recovery-observe(?:\s|$)/i.test(segment)
  );
  const hasValidationCommand = recoverySegments.some(segment =>
    /\bnpm run rehearsal:recovery-observe:validate\b/i.test(segment) &&
    /\brecovery-observe JSON validation PASS\b(?!\s*\/)/i.test(segment) &&
    hasPositiveValidationResult(segment)
  );
  if (!hasObservationCommand || !hasValidationCommand) return false;

  const completedTargets = extractCompletedRecoveryObserveJsonTargets(text, expectedKind)
    .map(normalizeEvidenceTarget);
  if (completedTargets.length === 0) return false;

  return recoveryObserveValidationEvidenceSegments(text, expectedKind).some(segment =>
    hasPositiveRecoveryObserveValidationResult(segment) &&
    completedTargets.some(target => hasRecoveryObserveValidationTargetBinding(segment, target))
  );
}

function hasValidatedBackupRestoreEvidence(text: string): boolean {
  const payload = checkedEvidencePayload(text);
  const backupSegments = backupRestoreValidationSegments(payload);
  if (backupSegments.length === 0) return false;

  return backupSegments.some(segment =>
    hasPositiveBackupRestoreValidationResult(segment) &&
    extractEvidenceTargets(segment).some(target =>
      isValidatedBackupRestoreEvidenceTargetLinked(payload, target)
    )
  );
}

function hasValidatedDependencyReviewEvidence(text: string): boolean {
  const payload = checkedEvidencePayload(text);
  const dependencyReviewSegments = dependencyReviewValidationSegments(payload);
  if (dependencyReviewSegments.length === 0) return false;

  return dependencyReviewSegments.some(segment =>
    hasPositiveDependencyReviewValidationResult(segment) &&
    extractEvidenceTargets(segment).some(target =>
      isValidatedDependencyReviewEvidenceTargetLinked(payload, target)
    )
  );
}

function hasValidatedSecurityReviewEvidence(text: string): boolean {
  const payload = checkedEvidencePayload(text);
  const securityReviewSegments = securityReviewValidationSegments(payload);
  if (securityReviewSegments.length === 0) return false;

  return securityReviewSegments.some(segment =>
    hasPositiveSecurityReviewValidationResult(segment) &&
    extractEvidenceTargets(segment).some(target =>
      isValidatedSecurityReviewEvidenceTargetLinked(payload, target)
    )
  );
}

function hasValidatedCleanCheckoutEvidence(text: string): boolean {
  const payload = checkedEvidencePayload(text);
  const completedTargets = extractCompletedCleanCheckoutEvidenceTargets(payload)
    .map(normalizeEvidenceTarget);
  if (completedTargets.length === 0) return false;

  return cleanCheckoutValidationSegments(payload).some(segment =>
    hasPositiveCleanCheckoutValidationResult(segment) &&
    completedTargets.some(target => {
      return (
        hasCleanCheckoutValidationTargetBinding(segment, target) &&
        hasDistinctQualifiedCleanCheckoutValidationOutputTarget(segment, target)
      );
    })
  );
}

function hasCleanCheckoutValidationTargetBinding(segment: string, target: string): boolean {
  const normalizedSegment = segment.toLowerCase();
  const normalizedTarget = normalizeEvidenceTarget(target);
  return (
    /\b(?:validated target|validated input|ci validate target|clean checkout validation target)\b/i.test(segment) &&
    normalizedTarget.length > 0 &&
    normalizedSegment.includes(normalizedTarget)
  );
}

function hasThreatModelValidationTargetBinding(segment: string, target: string): boolean {
  const normalizedSegment = segment.toLowerCase();
  const normalizedTarget = normalizeEvidenceTarget(target);
  return (
    THREAT_MODEL_VALIDATION_TARGET_BINDING.test(segment) &&
    normalizedTarget.length > 0 &&
    normalizedSegment.includes(normalizedTarget)
  );
}

function hasValidatedTechnicalAddendumEvidence(text: string): boolean {
  const payload = checkedEvidencePayload(text);
  const technicalAddendumSegments = technicalAddendumValidationSegments(payload);
  if (technicalAddendumSegments.length === 0) return false;

  return technicalAddendumSegments.some(segment =>
    hasPositiveTechnicalAddendumValidationResult(segment) &&
    extractEvidenceTargets(segment).some(target =>
      isValidatedTechnicalAddendumEvidenceTargetLinked(payload, target)
    )
  );
}

function hasValidatedTrustlessBurnEvidence(text: string): boolean {
  const payload = checkedEvidencePayload(text);
  const trustlessBurnSegments = trustlessBurnValidationSegments(payload);
  if (trustlessBurnSegments.length === 0) return false;

  return trustlessBurnSegments.some(segment =>
    hasPositiveTrustlessBurnValidationResult(segment) &&
    extractEvidenceTargets(segment).some(target =>
      isValidatedTrustlessBurnEvidenceTargetLinked(payload, target)
    )
  );
}

function hasValidatedBenchmarkEvidence(text: string): boolean {
  const payload = checkedEvidencePayload(text);
  const benchmarkSegments = benchmarkValidationSegments(payload);
  if (benchmarkSegments.length === 0) return false;

  return benchmarkSegments.some(segment =>
    hasPositiveBenchmarkValidationResult(segment) &&
    extractEvidenceTargets(segment).some(target =>
      isValidatedBenchmarkEvidenceTargetLinked(payload, target)
    )
  );
}

function hasValidatedCommitteeGovernanceEvidence(text: string): boolean {
  const payload = checkedEvidencePayload(text);
  const committeeGovernanceSegments = committeeGovernanceValidationSegments(payload);
  if (committeeGovernanceSegments.length === 0) return false;

  return committeeGovernanceSegments.some(segment =>
    hasPositiveCommitteeGovernanceValidationResult(segment) &&
    extractEvidenceTargets(segment).some(target =>
      isValidatedCommitteeGovernanceEvidenceTargetLinked(payload, target)
    )
  );
}

function hasValidatedOperatorReadinessEvidence(text: string): boolean {
  const payload = checkedEvidencePayload(text);
  const operatorReadinessSegments = operatorReadinessValidationSegments(payload);
  if (operatorReadinessSegments.length === 0) return false;

  return operatorReadinessSegments.some(segment =>
    hasPositiveOperatorReadinessValidationResult(segment) &&
    extractEvidenceTargets(segment).some(target =>
      isValidatedOperatorReadinessEvidenceTargetLinked(payload, target)
    )
  );
}

function hasValidatedExternalIntegrationEvidence(text: string): boolean {
  const payload = checkedEvidencePayload(text);
  const externalIntegrationSegments = externalIntegrationValidationSegments(payload);
  if (externalIntegrationSegments.length === 0) return false;

  return externalIntegrationSegments.some(segment =>
    hasPositiveExternalIntegrationValidationResult(segment) &&
    extractEvidenceTargets(segment).some(target =>
      isValidatedExternalIntegrationEvidenceTargetLinked(payload, target)
    )
  );
}

function hasValidatedFreshCheckpointEvidence(text: string): boolean {
  const payload = checkedEvidencePayload(text);
  const checkpointSegments = evidenceSegments(payload)
    .filter(isFreshCheckpointEvidenceSegment);
  if (checkpointSegments.length === 0) return false;

  const hasPositiveValidation = checkpointSegments.some(hasPositiveValidationResult);
  if (!hasPositiveValidation) return false;

  const outputTargets = checkpointSegments
    .flatMap(segment => extractEvidenceTargets(freshCheckpointOutputEvidenceText(segment)))
    .map(normalizeEvidenceTarget);
  return outputTargets.some(target =>
    isConcreteJsonEvidenceTarget(target) &&
    /\b(?:fresh[-_ ]?testnet|fresh[-_ ]?checkpoint|checkpoint)\b/i.test(target) &&
    !/(template|example|sample)/i.test(target)
  );
}

function extractCompletedLiveRehearsalTargets(text: string): string[] {
  const explicitTargets = [
    ...text.matchAll(/\bcompleted\s+live[- ]?rehearsals?\b[^;\n|]*(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;|]+)/gi),
  ].map(([, target]) => target);

  const candidateTargets = explicitTargets.length > 0
    ? explicitTargets
    : evidenceSegments(text)
      .filter(segment =>
        !isRehearsalValidationEvidenceSegment(segment) &&
        !isRehearsalLivePreflightEvidenceSegment(segment) &&
        !isRehearsalPostSubmitObserveEvidenceSegment(segment)
      )
      .flatMap(extractEvidenceTargets);

  return candidateTargets
    .map(normalizeEvidenceTarget)
    .filter(target =>
      /\blive[- ]?rehearsals?\b/i.test(target) &&
      /\bcompleted\b/i.test(target) &&
      /\.md$/i.test(target) &&
      !/(template|validation|validate|log|transcript)/i.test(target) &&
      !hasNonConcreteEvidenceTargetSegment(target) &&
      !hasPreBroadcastEvidenceMarker(target)
    );
}

function hasDistinctQualifiedLivePreflightOutputTarget(livePreflightSegments: string[]): boolean {
  return livePreflightSegments
    .flatMap(segment => extractEvidenceTargets(livePreflightOutputEvidenceText(segment)))
    .map(normalizeEvidenceTarget)
    .some(target =>
      isConcreteQualifiedValidationOutputTarget(target) &&
      /\b(?:live[-_ ]?preflight|preflight|validation|validate|log|transcript|ci|workflow)\b/i.test(target)
    );
}

function hasRequiredLivePreflightFacts(livePreflightSegments: string[]): boolean {
  return livePreflightSegments.some(segment =>
    /\bExpected transaction ID\b.{0,120}(?:0x)?[0-9a-fA-F]{64}\b/i.test(segment) &&
    /\bSettlement profile ID\s*=\s*authenticated-external-fee-v1\b/i.test(segment) &&
    /\bProfile activation status\s*=\s*ACTIVATED\b/i.test(segment) &&
    /\bEvidence purpose\s*=\s*gate3-lifecycle-closure\b/i.test(segment) &&
    /\bLegacy V1 transport\s*=\s*quarantined\b/i.test(segment) &&
    hasConcreteLivePreflightActivationEvidenceTarget(segment) &&
    /\bapprovals file\b/i.test(segment) &&
    /\breviewer approval evidence\b/i.test(segment) &&
    /\buser explicit live broadcast approval evidence\b/i.test(segment) &&
    /\bBRIDGE_BROADCAST_ENABLED\s*=\s*true\b/i.test(segment) &&
    /\bscoped\b.{0,80}\b(?:shell|scope)\b|\b(?:shell|scope)\b.{0,80}\bscoped\b/i.test(segment) &&
    hasPositiveLabeledPassEvidence(segment, /\bnpm run demo:readiness\b/i, 80) &&
    hasPositiveLabeledPassEvidence(segment, /\bBroadcast policy\b/i, 80) &&
    hasPositiveLabeledPassEvidence(segment, /\bLive settlement signing\b/i, 80) &&
    /\bNode URL\b.{0,80}\bhttps?:\/\/[^\s;)]+/i.test(segment) &&
    /\bErgo node network\b.{0,80}\btest[- ]?net\b/i.test(segment) &&
    /\bSidechain network\b.{0,120}\b(?:patched[- ]?devnet|test[- ]?net|non[- ]?main[- ]?net)\b/i.test(segment) &&
    !hasForbiddenTestnetLifecycleEvidenceNetworkFacts(segment)
  );
}

function hasDistinctQualifiedPostSubmitObserveOutputTarget(observeSegments: string[]): boolean {
  const targets = observeSegments
    .flatMap(segment => extractEvidenceTargets(postSubmitObserveOutputEvidenceText(segment)))
    .map(normalizeEvidenceTarget);
  return targets
    .some(target =>
      isConcreteQualifiedValidationOutputTarget(target) &&
      /\b(?:post[-_ ]?submit|observe|observation|log|transcript|ci|workflow)\b/i.test(target)
    );
}

function hasRequiredPostSubmitObserveFacts(observeSegments: string[]): boolean {
  return observeSegments.some(segment =>
    /\b(?:Expected|submitted) transaction ID\b.{0,120}(?:0x)?[0-9a-fA-F]{64}\b/i.test(segment) &&
    /\b(?:--json-out|post-submit observe JSON report|post[-_ ]?submit[-_ ]?observe\.json)\b/i.test(segment) &&
    /\b[^\s<>|;),]+\.json\b/i.test(segment) &&
    /\bSPV tracker successor output\b.{0,80}\bOUTPUTS\(0\)/i.test(segment) &&
    /\bAggregate DUP successor output\b.{0,80}\bOUTPUTS\(1\)/i.test(segment) &&
    /\bpositional recipient payout binding\b/i.test(segment) &&
    /\bcanonical miner fee output\b/i.test(segment)
  );
}

function hasLivePreflightExpectedTxBoundToValidation(
  text: string,
  livePreflightSegments: string[],
): boolean {
  const expectedTxIds = new Set(livePreflightSegments.flatMap(extractExpectedTransactionIds));
  if (expectedTxIds.size === 0) return false;

  const validationSubmittedTxIds = evidenceSegments(text)
    .filter(isRehearsalValidationEvidenceSegment)
    .flatMap(extractSubmittedTransactionIds);
  return validationSubmittedTxIds.some(txId => expectedTxIds.has(txId));
}

function hasLivePreflightTargetBoundToCompletedRehearsal(
  livePreflightSegments: string[],
  completedLiveRehearsalTargets: string[],
): boolean {
  return completedLiveRehearsalTargets.some(target => {
    const escapedTarget = escapeRegExp(target);
    const targetBinding = new RegExp(
      `\\b(?:external-fee live-preflight target|live preflight target|live-preflight target|rehearsal live-preflight target)\\b[^\\n.;|]*${escapedTarget}`,
      'i',
    );
    return livePreflightSegments.some(segment =>
      targetBinding.test(normalizeEvidenceTarget(segment))
    );
  });
}

function isRehearsalLivePreflightEvidenceSegment(segment: string): boolean {
  return /\bnpm run rehearsal:external-fee-live-preflight\b.{0,160}\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i
    .test(segment);
}

function isRehearsalPostSubmitObserveEvidenceSegment(segment: string): boolean {
  return /\bnpm run rehearsal:post-submit:observe\b.{0,180}\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i
    .test(segment);
}

function isRehearsalAssemblyEvidenceSegment(segment: string): boolean {
  return /\bnpm run rehearsal:assemble\b.{0,180}\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i
    .test(segment);
}

function isRehearsalPrepBundleEvidenceSegment(segment: string): boolean {
  return /\bnpm run rehearsal:prep-bundle\b.{0,180}\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i
    .test(segment);
}

function isRehearsalOfflineGateEvidenceSegment(segment: string): boolean {
  return /\bnpm run rehearsal:offline-gate\b.{0,180}\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i
    .test(segment);
}

function isRecoveryObserveEvidenceSegment(
  segment: string,
  expectedKind: TestnetRecoveryDrillKind,
): boolean {
  return (
    /\bnpm run rehearsal:recovery-observe(?::validate)?\b/i.test(segment) ||
    /\brecovery-observe JSON validation PASS\b(?!\s*\/)/i.test(segment) ||
    /\bstructured recovery observation PASS evidence\b/i.test(segment)
  ) && (
    segment.includes(expectedKind) ||
    recoveryObserveKindAlias(expectedKind).test(segment)
  );
}

function isFreshCheckpointEvidenceSegment(segment: string): boolean {
  return /\bnpm run rehearsal:fresh-testnet-check\b.{0,180}\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i
    .test(segment);
}

function isAggregatePrebroadcastJsonEvidenceSegment(segment: string): boolean {
  return (
    /\bnpm run settle:aggregate\b/i.test(segment) ||
    /\bnpm run prebroadcast:(?:from-json|validate|doctor|assemble)\b/i.test(segment) ||
    /\baggregate prebroadcast JSON\b/i.test(segment) ||
    /\baggregate (?:check|evidence) JSON\b/i.test(segment)
  ) && /\.json\b/i.test(segment);
}

function extractAggregatePrebroadcastJsonTargets(segment: string): string[] {
  const targets = extractEvidenceTargets(segment);
  const bareTargets = [
    ...segment.matchAll(
      /\b(?:--aggregate-evidence|--aggregate-json|--json-out|aggregate prebroadcast JSON output|aggregate evidence JSON|aggregate check JSON)\s+([^\s|;),]+\.json)\b/gi,
    ),
  ].map(([, target]) => target);
  return [...targets, ...bareTargets].filter(target =>
    /\b(?:aggregate|prebroadcast|check)\b/i.test(target)
  );
}

function livePreflightOutputEvidenceText(segment: string): string {
  const command = /\bnpm run rehearsal:external-fee-live-preflight\b/i.exec(segment);
  const outputSegment = command ? segment.slice(command.index).trim() : segment;
  const targetBinding = /\b(?:validated target|validated input|external-fee live-preflight target|live preflight target|live-preflight target|rehearsal live-preflight target)\b/i
    .exec(outputSegment);
  return targetBinding ? outputSegment.slice(0, targetBinding.index).trim() : outputSegment;
}

function freshCheckpointOutputEvidenceText(segment: string): string {
  const command = /\bnpm run rehearsal:fresh-testnet-check\b/i.exec(segment);
  const outputSegment = command ? segment.slice(command.index).trim() : segment;
  const targetBinding = /\b(?:fresh checkpoint target|fresh-checkpoint target|rehearsal fresh-checkpoint target|validated target|validated input)\b/i
    .exec(outputSegment);
  return targetBinding ? outputSegment.slice(0, targetBinding.index).trim() : outputSegment;
}

function assemblyReportOutputEvidenceText(segment: string): string {
  const command = /\bnpm run rehearsal:assemble\b/i.exec(segment);
  const outputSegment = command ? segment.slice(command.index).trim() : segment;
  const targetBinding = /\b(?:assembly report target|assembly target|rehearsal assembly target|validated target|validated input)\b/i
    .exec(outputSegment);
  return targetBinding ? outputSegment.slice(0, targetBinding.index).trim() : outputSegment;
}

function prepBundleOutputEvidenceText(segment: string): string {
  const command = /\bnpm run rehearsal:prep-bundle\b/i.exec(segment);
  const outputSegment = command ? segment.slice(command.index).trim() : segment;
  const targetBinding = /\b(?:prep-bundle target|prep bundle target|preparation bundle target|validated target|validated input)\b/i
    .exec(outputSegment);
  return targetBinding ? outputSegment.slice(0, targetBinding.index).trim() : outputSegment;
}

function offlineGateOutputEvidenceText(segment: string): string {
  const command = /\bnpm run rehearsal:offline-gate\b/i.exec(segment);
  const outputSegment = command ? segment.slice(command.index).trim() : segment;
  const targetBinding = /\b(?:offline-gate target|offline gate target|offline rehearsal gate target|validated target|validated input)\b/i
    .exec(outputSegment);
  return targetBinding ? outputSegment.slice(0, targetBinding.index).trim() : outputSegment;
}

function extractRecoveryObserveJsonTargets(segment: string): string[] {
  return extractEvidenceTargets(segment)
    .map(normalizeEvidenceTarget)
    .filter(target =>
      /\.json$/i.test(target) &&
      /\b(?:recovery[-_ ]?observe|failed[-_ ]?broadcast|reorg|stale[-_ ]?singleton)\b/i.test(target)
    );
}

function extractCompletedRecoveryObserveJsonTargets(
  text: string,
  expectedKind: TestnetRecoveryDrillKind,
): string[] {
  return evidenceSegments(checkedEvidencePayload(text))
    .filter(segment => isRecoveryObserveEvidenceSegment(segment, expectedKind))
    .filter(segment => !isRecoveryObserveValidationEvidenceSegment(segment))
    .flatMap(segment => extractRecoveryObserveJsonTargets(recoveryObserveObservationOutputEvidenceText(segment)))
    .filter(isConcreteRecoveryObserveJsonTarget);
}

function recoveryObserveValidationEvidenceSegments(
  text: string,
  expectedKind: TestnetRecoveryDrillKind,
): string[] {
  return evidenceSegments(checkedEvidencePayload(text))
    .filter(segment => isRecoveryObserveEvidenceSegment(segment, expectedKind))
    .filter(isRecoveryObserveValidationEvidenceSegment);
}

function isRecoveryObserveValidationEvidenceSegment(segment: string): boolean {
  return /\bnpm run rehearsal:recovery-observe:validate\b/i.test(segment) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(segment);
}

function hasPositiveRecoveryObserveValidationResult(segment: string): boolean {
  return /\brecovery-observe JSON validation PASS\b(?!\s*\/)/i.test(segment) &&
    hasPositiveValidationResult(segment);
}

function hasRecoveryObserveValidationTargetBinding(segment: string, target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  return normalizedTarget.length > 0 &&
    /\b(?:validated target|validated input|recovery-observe JSON validation target|recovery-observe validation target|recovery observe validation target)\b/i
      .test(segment) &&
    normalizeEvidenceTarget(segment).includes(normalizedTarget);
}

function recoveryObserveObservationOutputEvidenceText(segment: string): string {
  const command = /\bnpm run rehearsal:recovery-observe(?:\s|$)/i.exec(segment);
  const outputSegment = command ? segment.slice(command.index).trim() : segment;
  const targetBinding = /\b(?:validated target|validated input|recovery-observe JSON validation target|recovery-observe validation target|recovery observe validation target)\b/i
    .exec(outputSegment);
  return targetBinding ? outputSegment.slice(0, targetBinding.index).trim() : outputSegment;
}

function isConcreteRecoveryObserveJsonTarget(target: string): boolean {
  const normalized = normalizeEvidenceTarget(target);
  return (
    normalized.length > 0 &&
    /\.json$/i.test(normalized) &&
    !/[<>]/.test(normalized) &&
    !/(?:template|example|sample|generic|placeholder|todo|tbd|validation|validate|log|transcript)/i.test(normalized)
  );
}

function recoveryObserveKindAlias(kind: TestnetRecoveryDrillKind): RegExp {
  return kind === 'failed-broadcast-phantom-avl'
    ? /\bfailed[- ]broadcast\b|\bphantom AVL\b/i
    : /\breorged?[- ]burn\b|\bstale singleton\b/i;
}

function postSubmitObserveOutputEvidenceText(segment: string): string {
  const command = /\bnpm run rehearsal:post-submit:observe\b/i.exec(segment);
  const outputSegment = command ? segment.slice(command.index).trim() : segment;
  const targetBinding = /\b(?:observed target|post-submit observe target|post submit observe target|rehearsal post-submit observe target)\b/i
    .exec(outputSegment);
  return targetBinding ? outputSegment.slice(0, targetBinding.index).trim() : outputSegment;
}

function extractExpectedTransactionIds(value: string): string[] {
  return [...value.matchAll(/\bExpected transaction ID\b.{0,120}(?:0x)?([0-9a-fA-F]{64})\b/gi)]
    .map(([, txId]) => txId.toLowerCase());
}

function extractSubmittedTransactionIds(value: string): string[] {
  return [...value.matchAll(/\bsubmitted transaction ID\b.{0,120}(?:0x)?([0-9a-fA-F]{64})\b/gi)]
    .map(([, txId]) => txId.toLowerCase());
}

function extractKeyedPositiveInteger(segment: string, key: string): number | undefined {
  const match = new RegExp(`\\b${key}\\s*=\\s*([1-9][0-9]*)\\b`, 'i').exec(segment);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function hasRequiredLiveRehearsalValidationFacts(validationSegments: string[]): boolean {
  return validationSegments.some(segment => {
    const confirmationsRequired = extractKeyedPositiveInteger(segment, 'confirmationsRequired');
    const confirmationsObserved = extractKeyedPositiveInteger(segment, 'confirmationsObserved');

    return hasPositiveLabeledPassEvidence(segment, /\bconfirmation policy met\b/i, 80) &&
    confirmationsRequired !== undefined &&
    confirmationsObserved !== undefined &&
    confirmationsObserved >= confirmationsRequired &&
    /\bobserved confirmation count\b.{0,80}\b(?:>=|greater than or equal to)\b.{0,80}\brequired confirmation count\b/i.test(segment) &&
    /\bsubmitted transaction ID\b.{0,80}(?:0x)?[0-9a-fA-F]{64}\b/i.test(segment) &&
    /\bcompleted finality evidence\b.{0,120}(?:artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+|\[[^\]]+\]\([^)]+\))/i.test(segment);
  });
}

function hasPreBroadcastOnlyTestnetLifecycleEvidence(text: string): boolean {
  const payload = checkedEvidencePayload(text);
  return (
    extractEvidenceTargets(payload)
      .map(normalizeEvidenceTarget)
      .some(hasPreBroadcastEvidenceMarker) ||
    /\bpre[-_\s]?broadcast\b.{0,80}\b(?:dry[-_\s]?run|evidence|package)\b/i.test(payload) ||
    /\b(?:dry[-_\s]?run|evidence|package)\b.{0,80}\bpre[-_\s]?broadcast\b/i.test(payload)
  );
}

function hasForbiddenTestnetLifecycleEvidenceNetworkFacts(text: string): boolean {
  return evidenceSegments(checkedEvidencePayload(text))
    .filter(segment => hasEvidenceMarker(segment))
    .some(segment => {
      const normalized = normalizeEvidenceMarkerText(segment);
      const withoutNonMainnet = normalized.replace(/\bnon[- ]?main[- ]?net\b/gi, '');
      return (
        /\b(?:Ergo node network|Sidechain network|network|environment)\b.{0,80}\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b/i.test(withoutNonMainnet) ||
        /\b(?:main[- ]?net|main\s+network|main[- ]?chain|mainchain)\b.{0,80}\b(?:Ergo node network|Sidechain network|network|environment)\b/i.test(withoutNonMainnet) ||
        /\b(?:not on|not using|not connected to|without(?: the)?|no)\s+(?:the\s+)?test[- ]?net\b/i.test(normalized) ||
        /\btest[- ]?net\b.{0,80}\b(?:not|missing|absent|unavailable|unconnected|disconnected)\b/i.test(normalized)
      );
    });
}

function checkedEvidencePayload(text: string): string {
  const evidenceMarker = /\bEvidence:\s*/i.exec(text);
  return evidenceMarker ? text.slice(evidenceMarker.index + evidenceMarker[0].length) : text;
}

function hasPreBroadcastEvidenceMarker(value: string): boolean {
  return /pre[-_\s]?broadcast/i.test(value);
}

function hasDistinctQualifiedRehearsalValidationOutputTarget(
  validationSegments: string[],
  completedTargets: string[],
): boolean {
  const completedTargetSet = new Set(completedTargets);
  return validationSegments
    .flatMap(segment => extractEvidenceTargets(rehearsalValidationOutputEvidenceText(segment)))
    .map(normalizeEvidenceTarget)
    .some(target =>
      !completedTargetSet.has(target) &&
      isConcreteQualifiedValidationOutputTarget(target)
    );
}

function isRehearsalValidationEvidenceSegment(segment: string): boolean {
  return /\bnpm run rehearsal:validate\b.{0,120}\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i
    .test(segment);
}

function rehearsalValidationOutputEvidenceText(segment: string): string {
  const targetBinding = /\b(?:validated target|validated input|rehearsal validate target|rehearsal validation target)\b/i
    .exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function extractCompletedReleaseNotesDocumentTargets(text: string): string[] {
  return nonValidationEvidenceSegments(text)
    .flatMap(segment => extractEvidenceTargets(segment))
    .filter(isCompletedReleaseNotesDocumentTarget);
}

function extractReleaseNotesValidationOutputTargets(text: string): string[] {
  return validationEvidenceSegments(text)
    .flatMap(segment => extractEvidenceTargets(releaseNotesValidationOutputEvidenceText(segment)));
}

function extractCompletedBackupRestoreEvidenceTargets(text: string): string[] {
  return nonBackupRestoreValidationEvidenceSegments(text)
    .flatMap(segment => extractEvidenceTargets(segment))
    .filter(isCompletedBackupRestoreEvidenceTarget);
}

function extractCompletedDependencyReviewEvidenceTargets(text: string): string[] {
  return nonDependencyReviewValidationEvidenceSegments(text)
    .flatMap(segment => extractEvidenceTargets(segment))
    .filter(isCompletedDependencyReviewEvidenceTarget);
}

function extractCompletedCleanCheckoutEvidenceTargets(text: string): string[] {
  return nonCleanCheckoutValidationEvidenceSegments(text)
    .flatMap(segment => extractEvidenceTargets(segment))
    .filter(isCompletedCleanCheckoutEvidenceTarget);
}

function extractCompletedSecurityReviewEvidenceTargets(text: string): string[] {
  return nonSecurityReviewValidationEvidenceSegments(text)
    .flatMap(segment => extractEvidenceTargets(segment))
    .filter(isCompletedSecurityReviewEvidenceTarget);
}

function extractCompletedTrustlessBurnEvidenceTargets(text: string): string[] {
  return nonTrustlessBurnValidationEvidenceSegments(text)
    .flatMap(segment => extractEvidenceTargets(segment))
    .filter(isCompletedTrustlessBurnEvidenceTarget);
}

function extractCompletedBenchmarkEvidenceTargets(text: string): string[] {
  return nonBenchmarkValidationEvidenceSegments(text)
    .flatMap(segment => extractEvidenceTargets(segment))
    .filter(isCompletedBenchmarkEvidenceTarget);
}

function extractCompletedCommitteeGovernanceEvidenceTargets(text: string): string[] {
  return nonCommitteeGovernanceValidationEvidenceSegments(text)
    .flatMap(segment => extractEvidenceTargets(segment))
    .filter(isCompletedCommitteeGovernanceEvidenceTarget);
}

function extractCompletedOperatorReadinessEvidenceTargets(text: string): string[] {
  return nonOperatorReadinessValidationEvidenceSegments(text)
    .flatMap(segment => extractEvidenceTargets(segment))
    .filter(isCompletedOperatorReadinessEvidenceTarget);
}

function extractCompletedExternalIntegrationEvidenceTargets(text: string): string[] {
  return nonExternalIntegrationValidationEvidenceSegments(text)
    .flatMap(segment => extractEvidenceTargets(segment))
    .filter(isCompletedExternalIntegrationEvidenceTarget);
}

function extractCompletedTechnicalAddendumEvidenceTargets(text: string): string[] {
  return nonTechnicalAddendumValidationEvidenceSegments(text)
    .flatMap(segment => extractEvidenceTargets(segment))
    .filter(isCompletedTechnicalAddendumEvidenceTarget);
}

function extractCompletedThreatModelEvidenceTargets(text: string): string[] {
  return nonThreatModelValidationEvidenceSegments(text)
    .flatMap(segment => extractEvidenceTargets(segment))
    .filter(isCompletedThreatModelEvidenceTarget);
}

function validationEvidenceSegments(text: string): string[] {
  return evidenceSegments(text)
    .filter(isReleaseNotesValidationEvidenceSegment);
}

function backupRestoreValidationSegments(text: string): string[] {
  return evidenceSegments(text)
    .filter(isBackupRestoreValidationEvidenceSegment);
}

function dependencyReviewValidationSegments(text: string): string[] {
  return evidenceSegments(text)
    .filter(isDependencyReviewValidationEvidenceSegment);
}

function cleanCheckoutValidationSegments(text: string): string[] {
  return evidenceSegments(text)
    .filter(isCleanCheckoutValidationEvidenceSegment);
}

function securityReviewValidationSegments(text: string): string[] {
  return evidenceSegments(text)
    .filter(isSecurityReviewValidationEvidenceSegment);
}

function trustlessBurnValidationSegments(text: string): string[] {
  return evidenceSegments(text)
    .filter(isTrustlessBurnValidationEvidenceSegment);
}

function benchmarkValidationSegments(text: string): string[] {
  return evidenceSegments(text)
    .filter(isBenchmarkValidationEvidenceSegment);
}

function committeeGovernanceValidationSegments(text: string): string[] {
  return evidenceSegments(text)
    .filter(isCommitteeGovernanceValidationEvidenceSegment);
}

function operatorReadinessValidationSegments(text: string): string[] {
  return evidenceSegments(text)
    .filter(isOperatorReadinessValidationEvidenceSegment);
}

function externalIntegrationValidationSegments(text: string): string[] {
  return evidenceSegments(text)
    .filter(isExternalIntegrationValidationEvidenceSegment);
}

function technicalAddendumValidationSegments(text: string): string[] {
  return evidenceSegments(text)
    .filter(isTechnicalAddendumValidationEvidenceSegment);
}

function threatModelValidationSegments(text: string): string[] {
  return evidenceSegments(text)
    .filter(isThreatModelValidationEvidenceSegment);
}

const RELEASE_NOTES_VALIDATION_TARGET_BINDING =
  /\b(?:validated target|validated input|release-notes validate target|release-notes validation target)\b/i;
const BACKUP_RESTORE_VALIDATION_TARGET_BINDING =
  /\b(?:validated target|validated input|backup validate target|backup-restore validation target)\b/i;
const DEPENDENCY_REVIEW_VALIDATION_TARGET_BINDING =
  /\b(?:validated target|validated input|dependency validate target|dependency review validation target)\b/i;
const CLEAN_CHECKOUT_VALIDATION_TARGET_BINDING =
  /\b(?:validated target|validated input|ci validate target|clean checkout validation target)\b/i;
const SECURITY_REVIEW_VALIDATION_TARGET_BINDING =
  /\b(?:validated target|validated input|security validate target|security review validation target)\b/i;
const TRUSTLESS_BURN_VALIDATION_TARGET_BINDING =
  /\b(?:validated target|validated input|trustless validate target|trustless burn validation target)\b/i;
const BENCHMARK_VALIDATION_TARGET_BINDING =
  /\b(?:validated target|validated input|benchmark validate target|benchmark validation target)\b/i;
const COMMITTEE_GOVERNANCE_VALIDATION_TARGET_BINDING =
  /\b(?:validated target|validated input|governance validate target|governance validation target|committee governance validation target)\b/i;
const OPERATOR_READINESS_VALIDATION_TARGET_BINDING =
  /\b(?:validated target|validated input|operator validate target|operator readiness validation target)\b/i;
const EXTERNAL_INTEGRATION_VALIDATION_TARGET_BINDING =
  /\b(?:validated target|validated input|integration validate target|integration validation target|external integration validation target)\b/i;
const TECHNICAL_ADDENDUM_VALIDATION_TARGET_BINDING =
  /\b(?:validated target|validated input|addendum validate target|addendum validation target|technical addendum validation target)\b/i;
const THREAT_MODEL_VALIDATION_TARGET_BINDING =
  /\b(?:validated target|validated input|threat[- ]model validate target|threat[- ]model validation target|threat[- ]model evidence validation target|evidence[- ]matrix validation target)\b/i;

function nonValidationEvidenceSegments(text: string): string[] {
  return nonValidationTargetBindingEvidenceSegments(
    text,
    isReleaseNotesValidationEvidenceSegment,
    RELEASE_NOTES_VALIDATION_TARGET_BINDING,
  );
}

function nonBackupRestoreValidationEvidenceSegments(text: string): string[] {
  return nonValidationTargetBindingEvidenceSegments(
    text,
    isBackupRestoreValidationEvidenceSegment,
    BACKUP_RESTORE_VALIDATION_TARGET_BINDING,
  );
}

function nonDependencyReviewValidationEvidenceSegments(text: string): string[] {
  return nonValidationTargetBindingEvidenceSegments(
    text,
    isDependencyReviewValidationEvidenceSegment,
    DEPENDENCY_REVIEW_VALIDATION_TARGET_BINDING,
  );
}

function nonCleanCheckoutValidationEvidenceSegments(text: string): string[] {
  return nonValidationTargetBindingEvidenceSegments(
    text,
    isCleanCheckoutValidationEvidenceSegment,
    CLEAN_CHECKOUT_VALIDATION_TARGET_BINDING,
  );
}

function nonSecurityReviewValidationEvidenceSegments(text: string): string[] {
  return nonValidationTargetBindingEvidenceSegments(
    text,
    isSecurityReviewValidationEvidenceSegment,
    SECURITY_REVIEW_VALIDATION_TARGET_BINDING,
  );
}

function nonTrustlessBurnValidationEvidenceSegments(text: string): string[] {
  return nonValidationTargetBindingEvidenceSegments(
    text,
    isTrustlessBurnValidationEvidenceSegment,
    TRUSTLESS_BURN_VALIDATION_TARGET_BINDING,
  );
}

function nonBenchmarkValidationEvidenceSegments(text: string): string[] {
  return nonValidationTargetBindingEvidenceSegments(
    text,
    isBenchmarkValidationEvidenceSegment,
    BENCHMARK_VALIDATION_TARGET_BINDING,
  );
}

function nonCommitteeGovernanceValidationEvidenceSegments(text: string): string[] {
  return nonValidationTargetBindingEvidenceSegments(
    text,
    isCommitteeGovernanceValidationEvidenceSegment,
    COMMITTEE_GOVERNANCE_VALIDATION_TARGET_BINDING,
  );
}

function nonOperatorReadinessValidationEvidenceSegments(text: string): string[] {
  return nonValidationTargetBindingEvidenceSegments(
    text,
    isOperatorReadinessValidationEvidenceSegment,
    OPERATOR_READINESS_VALIDATION_TARGET_BINDING,
  );
}

function nonExternalIntegrationValidationEvidenceSegments(text: string): string[] {
  return nonValidationTargetBindingEvidenceSegments(
    text,
    isExternalIntegrationValidationEvidenceSegment,
    EXTERNAL_INTEGRATION_VALIDATION_TARGET_BINDING,
  );
}

function nonTechnicalAddendumValidationEvidenceSegments(text: string): string[] {
  return nonValidationTargetBindingEvidenceSegments(
    text,
    isTechnicalAddendumValidationEvidenceSegment,
    TECHNICAL_ADDENDUM_VALIDATION_TARGET_BINDING,
  );
}

function nonThreatModelValidationEvidenceSegments(text: string): string[] {
  return nonValidationTargetBindingEvidenceSegments(
    text,
    isThreatModelValidationEvidenceSegment,
    THREAT_MODEL_VALIDATION_TARGET_BINDING,
  );
}

function nonValidationTargetBindingEvidenceSegments(
  text: string,
  isValidationOutputSegment: (segment: string) => boolean,
  validationTargetBinding: RegExp,
): string[] {
  return evidenceSegments(text)
    .filter(segment =>
      !isValidationOutputSegment(segment) &&
      !validationTargetBinding.test(segment)
    );
}

function evidenceSegments(text: string): string[] {
  return text
    .split(/[;\n]+/)
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0);
}

function isReleaseNotesValidationEvidenceSegment(segment: string): boolean {
  return (
    /\bnpm run release-notes:validate\b/.test(segment) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(segment)
  );
}

function isBackupRestoreValidationEvidenceSegment(segment: string): boolean {
  return (
    /\bnpm run backup:validate\b/i.test(segment) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(segment)
  );
}

function isDependencyReviewValidationEvidenceSegment(segment: string): boolean {
  return (
    /\bnpm run dependency:validate\b/.test(segment) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(segment)
  );
}

function isCleanCheckoutValidationEvidenceSegment(segment: string): boolean {
  return /\bnpm run ci:validate\b[^;\n|]{0,200}\b(command output|output\s*:|log|transcript|CI run|workflow run|run id|run URL)\b/i
    .test(segment);
}

function isSecurityReviewValidationEvidenceSegment(segment: string): boolean {
  return (
    /\bnpm run security:validate\b/.test(segment) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(segment)
  );
}

function isTrustlessBurnValidationEvidenceSegment(segment: string): boolean {
  return (
    /\bnpm run trustless:validate\b/.test(segment) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(segment)
  );
}

function isBenchmarkValidationEvidenceSegment(segment: string): boolean {
  return (
    /\bnpm run benchmark:validate\b/.test(segment) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(segment)
  );
}

function isCommitteeGovernanceValidationEvidenceSegment(segment: string): boolean {
  return (
    /\bnpm run governance:validate\b/.test(segment) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(segment)
  );
}

function isOperatorReadinessValidationEvidenceSegment(segment: string): boolean {
  return (
    /\bnpm run operator:validate\b/.test(segment) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(segment)
  );
}

function isExternalIntegrationValidationEvidenceSegment(segment: string): boolean {
  return (
    /\bnpm run integration:validate\b/.test(segment) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(segment)
  );
}

function isTechnicalAddendumValidationEvidenceSegment(segment: string): boolean {
  return (
    /\bnpm run addendum:validate\b/.test(segment) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(segment)
  );
}

function isThreatModelValidationEvidenceSegment(segment: string): boolean {
  return (
    /\bnpm run threat-model:validate\b/.test(segment) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(segment)
  );
}

function releaseNotesValidationOutputEvidenceText(segment: string): string {
  const targetBinding = RELEASE_NOTES_VALIDATION_TARGET_BINDING.exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function backupRestoreValidationOutputEvidenceText(segment: string): string {
  const targetBinding = BACKUP_RESTORE_VALIDATION_TARGET_BINDING.exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function dependencyReviewValidationOutputEvidenceText(segment: string): string {
  const targetBinding = DEPENDENCY_REVIEW_VALIDATION_TARGET_BINDING.exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function cleanCheckoutValidationOutputEvidenceText(segment: string): string {
  const targetBinding = CLEAN_CHECKOUT_VALIDATION_TARGET_BINDING.exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function securityReviewValidationOutputEvidenceText(segment: string): string {
  const targetBinding = SECURITY_REVIEW_VALIDATION_TARGET_BINDING.exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function trustlessBurnValidationOutputEvidenceText(segment: string): string {
  const targetBinding = TRUSTLESS_BURN_VALIDATION_TARGET_BINDING.exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function benchmarkValidationOutputEvidenceText(segment: string): string {
  const targetBinding = BENCHMARK_VALIDATION_TARGET_BINDING.exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function committeeGovernanceValidationOutputEvidenceText(segment: string): string {
  const targetBinding = COMMITTEE_GOVERNANCE_VALIDATION_TARGET_BINDING.exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function operatorReadinessValidationOutputEvidenceText(segment: string): string {
  const targetBinding = OPERATOR_READINESS_VALIDATION_TARGET_BINDING.exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function externalIntegrationValidationOutputEvidenceText(segment: string): string {
  const targetBinding = EXTERNAL_INTEGRATION_VALIDATION_TARGET_BINDING.exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function technicalAddendumValidationOutputEvidenceText(segment: string): string {
  const targetBinding = TECHNICAL_ADDENDUM_VALIDATION_TARGET_BINDING.exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function threatModelValidationOutputEvidenceText(segment: string): string {
  const targetBinding = THREAT_MODEL_VALIDATION_TARGET_BINDING.exec(segment);
  return targetBinding ? segment.slice(0, targetBinding.index).trim() : segment;
}

function extractEvidenceTargets(text: string): string[] {
  return [
    ...[...text.matchAll(/(?:^|\s)(artifact:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[^\s),;]+)/g)].map(([, target]) => target),
    ...[...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(([, target]) => target.trim()),
  ];
}

function isCompletedEvidenceTarget(target: string): boolean {
  const normalizedTarget = normalizeEvidenceTarget(target);
  return (
    !isLocalOnlyEvidenceTarget(normalizedTarget) &&
    !isSharedSensitiveOrRuntimeEvidenceTarget(normalizedTarget) &&
    !classifyPublicationClaimText(normalizedTarget).hasProductionClaim &&
    !/-template\.md(?:[#?].*)?$/i.test(normalizedTarget) &&
    !/\b(?:not[-_ ]completed|uncompleted)\b/i.test(normalizedTarget) &&
    !hasNonConcreteEvidenceTargetSegment(normalizedTarget)
  );
}

function hasConcreteLivePreflightActivationEvidenceTarget(segment: string): boolean {
  const match = /\bActivation evidence target\s*(?:=|:)\s*([^\s),;|]+)/i.exec(segment);
  return match !== null && isConcreteJsonEvidenceTarget(match[1]);
}

function hasLocalOnlyEvidenceTarget(text: string): boolean {
  const normalized = text.replace(/\\/g, '/').toLowerCase();
  return evidenceTargetInspectionVariants(normalized).some(hasLocalOnlyEvidenceInspectionText);
}

function hasLocalOnlyEvidenceInspectionText(normalized: string): boolean {
  return /(?:^|[\s([<])(?:file:\/\/|[a-z]:\/|\/\/[^/\s]|\/(?:users?|home|tmp|var|private|mnt|volumes|etc)(?:\/|$))/i
    .test(normalized);
}

function normalizeEvidenceTarget(target: unknown): string {
  if (typeof target !== 'string') return '';
  return target.trim().split('#')[0].split('?')[0].replace(/[),;]+$/g, '').toLowerCase();
}

function isMarkdownEvidenceTarget(target: string): boolean {
  return /\.md$/i.test(normalizeEvidenceTarget(target));
}

function targetBasename(target: string): string {
  const withoutFragment = normalizeEvidenceTarget(target);
  return withoutFragment.split(/[\\/]/).filter(Boolean).at(-1)?.toLowerCase() ?? '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasNonTemplateMarkdownLink(text: string): boolean {
  const links = [...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
  return links.some(([, target]) => isCompletedEvidenceTarget(target.trim()));
}

function hasCommandOutputMarker(text: string): boolean {
  return (
    /\bnpm run [A-Za-z0-9:_-]+\b/.test(text) &&
    /\b(command output|output|log|transcript|CI run|workflow run|run id|run URL)\b/i.test(text)
  );
}

function containsTerm(text: string, term: string): boolean {
  return text.toLowerCase().includes(term.toLowerCase());
}
