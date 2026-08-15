import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { evaluateReleaseGate } from '../release-gate.js';
import { validateBackupRestoreEvidence } from '../backup-restore-evidence.js';
import { validateBenchmarkEvidence } from '../benchmark-evidence.js';
import { validateCleanCheckoutEvidence } from '../clean-checkout-evidence.js';
import { validateCommitteeGovernanceEvidence } from '../committee-governance-evidence.js';
import { validateDependencyReviewEvidence } from '../dependency-review-evidence.js';
import { readEvidenceJsonTarget } from '../evidence-json-target-path.js';
import { readEvidenceMarkdownTarget } from '../evidence-target-path.js';
import { validateExternalIntegrationEvidence } from '../external-integration-evidence.js';
import { validateOperatorReadinessEvidence } from '../operator-readiness-evidence.js';
import { validatePostSubmitObserveJsonReport } from '../post-submit-observe-json.js';
import { validateRehearsalEvidence } from '../rehearsal-evidence.js';
import { validateReleaseNotes } from '../release-notes-evidence.js';
import { validateRecoveryObserveJsonReport } from '../recovery-observe-json.js';
import { validateSecurityReviewEvidence } from '../security-review-evidence.js';
import { validateTechnicalAddendumEvidence } from '../technical-addendum-evidence.js';
import { validateTestnetRehearsalAssemblyReport } from '../testnet-rehearsal-assemble.js';
import { validateLivePreflightJsonReport } from '../testnet-rehearsal-live-preflight.js';
import { validateThreatModelEvidence } from '../threat-model-evidence.js';
import {
  validateFreshCheckpointArtifact,
} from '../testnet-offline-rehearsal-gate.js';
import { validateTrustlessBurnEvidence } from '../trustless-burn-evidence.js';
import {
  SETTLEMENT_PROFILE_AUTHORITY_EVIDENCE_ROLES,
  validateSettlementProfileActivationEvidence,
} from '../gate3-settlement-profile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const checklistPath = resolve(__dirname, '../../../docs/release-checklist.md');
const checklist = readFileSync(checklistPath, 'utf8');
const TARGET_ARGUMENT_FLAGS = new Set([
  '--fresh-checkpoint-json',
  '--live-preflight-json',
  '--assembly-report-json',
  '--recovery-observe-json',
  '--local-live-rehearsal-evidence',
  '--live-rehearsal-evidence',
  '--local-settlement-profile-activation-json',
  '--settlement-profile-activation-json',
  '--backup-restore-evidence',
  '--clean-checkout-evidence',
  '--dependency-review-evidence',
  '--security-review-evidence',
  '--trustless-burn-evidence',
  '--benchmark-evidence',
  '--governance-evidence',
  '--operator-readiness-evidence',
  '--integration-evidence',
  '--technical-addendum-evidence',
  '--release-notes',
  '--threat-model-evidence',
  '--post-submit-observe-json',
]);
const args = process.argv.slice(2);
const cliStructuralIssues: string[] = validateKnownOptions(args);
const freshCheckpointJsonTarget = parseTargetArgument(args, '--fresh-checkpoint-json');
const livePreflightJsonTarget = parseTargetArgument(args, '--live-preflight-json');
const assemblyReportJsonTarget = parseTargetArgument(args, '--assembly-report-json');
const recoveryObserveJsonTargets = parseTargetArguments(args, '--recovery-observe-json');
const localLiveRehearsalEvidenceTarget = parseTargetArgument(args, '--local-live-rehearsal-evidence');
const liveRehearsalEvidenceTarget = parseTargetArgument(args, '--live-rehearsal-evidence');
const localSettlementProfileActivationJsonTarget = parseTargetArgument(args, '--local-settlement-profile-activation-json');
const settlementProfileActivationJsonTarget = parseTargetArgument(args, '--settlement-profile-activation-json');
const backupRestoreEvidenceTarget = parseTargetArgument(args, '--backup-restore-evidence');
const cleanCheckoutEvidenceTarget = parseTargetArgument(args, '--clean-checkout-evidence');
const dependencyReviewEvidenceTarget = parseTargetArgument(args, '--dependency-review-evidence');
const securityReviewEvidenceTarget = parseTargetArgument(args, '--security-review-evidence');
const trustlessBurnEvidenceTarget = parseTargetArgument(args, '--trustless-burn-evidence');
const benchmarkEvidenceTarget = parseTargetArgument(args, '--benchmark-evidence');
const committeeGovernanceEvidenceTarget = parseTargetArgument(args, '--governance-evidence');
const operatorReadinessEvidenceTarget = parseTargetArgument(args, '--operator-readiness-evidence');
const externalIntegrationEvidenceTarget = parseTargetArgument(args, '--integration-evidence');
const technicalAddendumEvidenceTarget = parseTargetArgument(args, '--technical-addendum-evidence');
const releaseNotesTarget = parseTargetArgument(args, '--release-notes');
const threatModelEvidenceTarget = parseTargetArgument(args, '--threat-model-evidence');
const postSubmitObserveJsonTarget = parseTargetArgument(args, '--post-submit-observe-json');
const freshCheckpointJsonValidation = freshCheckpointJsonTarget
  ? validateFreshCheckpointJsonTarget(freshCheckpointJsonTarget)
  : undefined;
const livePreflightJsonValidation = livePreflightJsonTarget
  ? validateLivePreflightJsonTarget(livePreflightJsonTarget)
  : undefined;
const assemblyReportJsonValidation = assemblyReportJsonTarget
  ? validateAssemblyReportJsonTarget(assemblyReportJsonTarget)
  : undefined;
const recoveryObserveJsonValidations = recoveryObserveJsonTargets
  .map(validateRecoveryObserveJsonTarget);
const localLiveRehearsalEvidenceValidation = localLiveRehearsalEvidenceTarget
  ? validateLiveRehearsalEvidenceTarget(localLiveRehearsalEvidenceTarget)
  : undefined;
const liveRehearsalEvidenceValidation = liveRehearsalEvidenceTarget
  ? validateLiveRehearsalEvidenceTarget(liveRehearsalEvidenceTarget)
  : undefined;
const localSettlementProfileActivationJsonValidation = localSettlementProfileActivationJsonTarget
  ? validateSettlementProfileActivationJsonTarget(
      localSettlementProfileActivationJsonTarget,
      '--local-settlement-profile-activation-json',
    )
  : undefined;
const settlementProfileActivationJsonValidation = settlementProfileActivationJsonTarget
  ? validateSettlementProfileActivationJsonTarget(
      settlementProfileActivationJsonTarget,
      '--settlement-profile-activation-json',
    )
  : undefined;
const backupRestoreEvidenceValidation = backupRestoreEvidenceTarget
  ? validateBackupRestoreEvidenceTarget(backupRestoreEvidenceTarget)
  : undefined;
const cleanCheckoutEvidenceValidation = cleanCheckoutEvidenceTarget
  ? validateCleanCheckoutEvidenceTarget(cleanCheckoutEvidenceTarget)
  : undefined;
const dependencyReviewEvidenceValidation = dependencyReviewEvidenceTarget
  ? validateDependencyReviewEvidenceTarget(dependencyReviewEvidenceTarget)
  : undefined;
const securityReviewEvidenceValidation = securityReviewEvidenceTarget
  ? validateSecurityReviewEvidenceTarget(securityReviewEvidenceTarget)
  : undefined;
const trustlessBurnEvidenceValidation = trustlessBurnEvidenceTarget
  ? validateTrustlessBurnEvidenceTarget(trustlessBurnEvidenceTarget)
  : undefined;
const benchmarkEvidenceValidation = benchmarkEvidenceTarget
  ? validateBenchmarkEvidenceTarget(benchmarkEvidenceTarget)
  : undefined;
const committeeGovernanceEvidenceValidation = committeeGovernanceEvidenceTarget
  ? validateCommitteeGovernanceEvidenceTarget(committeeGovernanceEvidenceTarget)
  : undefined;
const operatorReadinessEvidenceValidation = operatorReadinessEvidenceTarget
  ? validateOperatorReadinessEvidenceTarget(operatorReadinessEvidenceTarget)
  : undefined;
const externalIntegrationEvidenceValidation = externalIntegrationEvidenceTarget
  ? validateExternalIntegrationEvidenceTarget(externalIntegrationEvidenceTarget)
  : undefined;
const technicalAddendumEvidenceValidation = technicalAddendumEvidenceTarget
  ? validateTechnicalAddendumEvidenceTarget(technicalAddendumEvidenceTarget)
  : undefined;
const releaseNotesValidation = releaseNotesTarget
  ? validateReleaseNotesTarget(releaseNotesTarget)
  : undefined;
const threatModelEvidenceValidation = threatModelEvidenceTarget
  ? validateThreatModelEvidenceTarget(threatModelEvidenceTarget)
  : undefined;
const postSubmitObserveJsonValidation = postSubmitObserveJsonTarget
  ? validatePostSubmitObserveJsonTarget(postSubmitObserveJsonTarget, livePreflightJsonTarget)
  : undefined;
const result = evaluateReleaseGate(checklist, {
  localLiveRehearsalEvidenceValidation,
  liveRehearsalEvidenceValidation,
  localSettlementProfileActivationJsonValidation,
  settlementProfileActivationJsonValidation,
  freshCheckpointJsonValidation,
  livePreflightJsonValidation,
  postSubmitObserveJsonValidation,
  assemblyReportJsonValidation,
  recoveryObserveJsonValidations,
  backupRestoreEvidenceValidation,
  cleanCheckoutEvidenceValidation,
  dependencyReviewEvidenceValidation,
  securityReviewEvidenceValidation,
  trustlessBurnEvidenceValidation,
  benchmarkEvidenceValidation,
  committeeGovernanceEvidenceValidation,
  operatorReadinessEvidenceValidation,
  externalIntegrationEvidenceValidation,
  technicalAddendumEvidenceValidation,
  releaseNotesValidation,
  threatModelEvidenceValidation,
});
const structuralIssues = [...cliStructuralIssues, ...result.issues];

if (result.status === 'BLOCKED' || structuralIssues.length > 0) {
  if (result.blockers.length > 0) {
    console.log(
      `Release gate BLOCKED: ${result.blockers.length}/${result.rowCount} pending evidence rows still block publication; ${structuralIssues.length} structural issue(s).`,
    );
  } else {
    console.log(`Release gate BLOCKED: ${structuralIssues.length} structural issue(s).`);
  }
} else {
  console.log(result.message);
}

for (const row of result.blockers) {
  console.log(
    `- ${row.gate}: ${row.item} [${row.status}] -> ${row.requiredResolution}`,
  );
}

for (const issue of structuralIssues) {
  console.log(`- structural issue: ${issue}`);
}

if (result.status === 'BLOCKED' || structuralIssues.length > 0) {
  process.exitCode = 1;
}

function validateKnownOptions(args: string[]): string[] {
  return [...new Set(
    args
      .filter(arg => arg.startsWith('--') && !TARGET_ARGUMENT_FLAGS.has(arg))
      .map(arg => `unknown option ${arg}`),
  )];
}

function parseTargetArgument(args: string[], flag: string): string | undefined {
  const indexes: number[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag) indexes.push(index);
  }
  if (indexes.length === 0) return undefined;
  if (indexes.length > 1) {
    cliStructuralIssues.push(`${flag} must be provided at most once`);
  }
  const target = args[indexes[0] + 1];
  if (!target || target.startsWith('--')) {
    cliStructuralIssues.push(`${flag} requires a target`);
    return undefined;
  }
  return target;
}

function parseTargetArguments(args: string[], flag: string): string[] {
  const targets: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== flag) continue;
    const target = args[index + 1];
    if (!target || target.startsWith('--')) {
      cliStructuralIssues.push(`${flag} requires a target`);
      continue;
    }
    targets.push(target);
  }
  return targets;
}

function validateReleaseNotesTarget(target: string) {
  const { errors, label, markdown } = readEvidenceMarkdownTarget(target);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors: errors.map(error => `${label}: ${error}`),
      classification: {
        releaseName: '',
        gitCommit: '',
        releaseLevel: '',
        decision: '',
        decisionOwner: '',
        decisionDate: '',
      },
      evidenceRows: [],
      assumptionRows: [],
      blockerRows: [],
      claimRows: [],
      operatorRows: [],
      signoffRows: [],
    };
  }
  const result = validateReleaseNotes(markdown);
  return {
    target,
    status: result.status,
    errors: result.errors,
    classification: result.classification,
    evidenceRows: result.evidenceRows,
    assumptionRows: result.assumptionRows,
    blockerRows: result.blockerRows,
    claimRows: result.claimRows,
    operatorRows: result.operatorRows,
    signoffRows: result.signoffRows,
  };
}

function validateThreatModelEvidenceTarget(target: string) {
  const { errors, label, markdown } = readEvidenceMarkdownTarget(target);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors: errors.map(error => `${label}: ${error}`),
      matrixRows: [],
    };
  }
  const result = validateThreatModelEvidence(markdown);
  return {
    target,
    status: result.status,
    errors: result.errors,
    classification: result.classification,
    matrixRows: result.matrixRows,
  };
}

function validateBackupRestoreEvidenceTarget(target: string) {
  const { errors, label, markdown } = readEvidenceMarkdownTarget(target);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors: errors.map(error => `${label}: ${error}`),
    };
  }
  const result = validateBackupRestoreEvidence(markdown);
  return {
    target,
    status: result.status,
    errors: result.errors,
    classification: result.classification,
    commandRows: result.commandRows,
    stateRows: result.stateRows,
    boundaryRows: result.boundaryRows,
    stopConditionRows: result.stopConditionRows,
    publicationEvidence: result.publicationEvidence,
    snapshotProvenance: result.snapshotProvenance,
    reviewerRows: result.reviewerRows,
  };
}

function validateLiveRehearsalEvidenceTarget(target: string) {
  const { errors, label, markdown } = readEvidenceMarkdownTarget(target);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors: errors.map(error => `${label}: ${error}`),
      rows: [],
    };
  }
  const result = validateRehearsalEvidence(markdown);
  return {
    target,
    status: result.status,
    errors: result.errors,
    rows: result.rows,
    sessionMetadata: result.sessionMetadata,
    publicationEvidence: result.publicationEvidence,
    reviewerSignoff: result.reviewerSignoff,
  };
}

function validateSettlementProfileActivationJsonTarget(target: string, argumentName: string) {
  const { errors, json } = readEvidenceJsonTarget(target, argumentName);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors,
    };
  }
  const authorityEvidenceRead = readSettlementProfileAuthorityEvidence(json, argumentName);
  const result = validateSettlementProfileActivationEvidence(json, authorityEvidenceRead.reports);
  const validationErrors = [...authorityEvidenceRead.errors, ...result.errors];
  return {
    target,
    status: validationErrors.length === 0 ? 'PASS' as const : 'BLOCKED' as const,
    errors: [...new Set(validationErrors)],
    report: json,
    authorityEvidence: authorityEvidenceRead.reports,
  };
}

function readSettlementProfileAuthorityEvidence(
  report: unknown,
  argumentName: string,
): { errors: string[]; reports?: Record<string, unknown> } {
  if (!isRecord(report) || !isRecord(report.evidenceTargets)) {
    return {
      errors: [`${argumentName} must expose structured authority evidence targets`],
    };
  }

  const errors: string[] = [];
  const reports: Record<string, unknown> = {};
  for (const role of SETTLEMENT_PROFILE_AUTHORITY_EVIDENCE_ROLES) {
    const target = report.evidenceTargets[role];
    if (typeof target !== 'string' || target.trim().length === 0) {
      errors.push(`${argumentName} evidenceTargets.${role} must identify a JSON evidence file`);
      continue;
    }
    const read = readEvidenceJsonTarget(target, `${argumentName} evidenceTargets.${role}`);
    errors.push(...read.errors);
    if (read.json !== undefined) reports[role] = read.json;
  }

  return { errors, reports };
}

function validateCleanCheckoutEvidenceTarget(target: string) {
  const { errors, label, markdown } = readEvidenceMarkdownTarget(target);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors: errors.map(error => `${label}: ${error}`),
      classification: {
        evidenceName: '',
        gitCommit: '',
        branch: '',
        releaseLevel: '',
        ciProvider: '',
        workflow: '',
        nodeVersion: '',
        rustTarget: '',
        wasmPackVersion: '',
        reviewer: '',
        date: '',
      },
      publicationDecision: {},
      commandRows: [],
      workflowRows: [],
      decisionRows: [],
      reviewerRows: [],
    };
  }
  const result = validateCleanCheckoutEvidence(markdown);
  return {
    target,
    status: result.status,
    errors: result.errors,
    classification: result.classification,
    publicationDecision: result.publicationDecision,
    commandRows: result.commandRows,
    workflowRows: result.workflowRows,
    decisionRows: result.decisionRows,
    reviewerRows: result.reviewerRows,
  };
}

function validateDependencyReviewEvidenceTarget(target: string) {
  const { errors, label, markdown } = readEvidenceMarkdownTarget(target);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors: errors.map(error => `${label}: ${error}`),
      classification: {},
      publicationDecision: {},
      commandRows: [],
      scopeRows: [],
      triageRows: [],
      upgradeRows: [],
      reviewerRows: [],
    };
  }
  const result = validateDependencyReviewEvidence(markdown);
  return {
    target,
    status: result.status,
    errors: result.errors,
    classification: result.classification,
    publicationDecision: result.publicationDecision,
    commandRows: result.commandRows,
    scopeRows: result.scopeRows,
    triageRows: result.triageRows,
    upgradeRows: result.upgradeRows,
    reviewerRows: result.reviewerRows,
  };
}

function validateSecurityReviewEvidenceTarget(target: string) {
  const { errors, label, markdown } = readEvidenceMarkdownTarget(target);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors: errors.map(error => `${label}: ${error}`),
      classification: {},
      publicationDecision: {},
      scopeRows: [],
      evidenceRows: [],
      findingRows: [],
      negativeRows: [],
      reviewerRows: [],
    };
  }
  const result = validateSecurityReviewEvidence(markdown);
  return {
    target,
    status: result.status,
    errors: result.errors,
    classification: result.classification,
    publicationDecision: result.publicationDecision,
    scopeRows: result.scopeRows,
    evidenceRows: result.evidenceRows,
    findingRows: result.findingRows,
    negativeRows: result.negativeRows,
    reviewerRows: result.reviewerRows,
  };
}

function validateTrustlessBurnEvidenceTarget(target: string) {
  const { errors, label, markdown } = readEvidenceMarkdownTarget(target);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors: errors.map(error => `${label}: ${error}`),
      classification: {},
      publicationDecision: {},
    };
  }
  const result = validateTrustlessBurnEvidence(markdown);
  return {
    target,
    status: result.status,
    errors: result.errors,
    classification: result.classification,
    publicationDecision: result.publicationDecision,
    componentRows: result.componentRows,
    commitmentRows: result.commitmentRows,
    burnProofRows: result.burnProofRows,
    localProofVector: result.localProofVector,
    localProofVectorReportTarget: result.localProofVectorReportTarget,
    positiveRows: result.positiveRows,
    negativeRows: result.negativeRows,
    reviewerRows: result.reviewerRows,
  };
}

function validateBenchmarkEvidenceTarget(target: string) {
  const { errors, label, markdown } = readEvidenceMarkdownTarget(target);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors: errors.map(error => `${label}: ${error}`),
      classification: {},
      publicationDecision: {},
      commandRows: [],
      metricRows: [],
      shardedLaneRows: [],
      bottleneckRows: [],
      claimsBoundary: { allowedClaims: [], blockedClaims: [] },
      reviewerRows: [],
    };
  }
  const result = validateBenchmarkEvidence(markdown);
  return {
    target,
    status: result.status,
    errors: result.errors,
    classification: result.classification,
    publicationDecision: result.publicationDecision,
    commandRows: result.commandRows,
    metricRows: result.metricRows,
    shardedLaneRows: result.shardedLaneRows,
    bottleneckRows: result.bottleneckRows,
    claimsBoundary: result.claimsBoundary,
    reviewerRows: result.reviewerRows,
  };
}

function validateCommitteeGovernanceEvidenceTarget(target: string) {
  const { errors, label, markdown } = readEvidenceMarkdownTarget(target);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors: errors.map(error => `${label}: ${error}`),
      classification: {},
      publicationDecision: {},
      scopeRows: [],
      commandRows: [],
      rotationRows: [],
      positiveRows: [],
      negativeRows: [],
      reviewerRows: [],
    };
  }
  const result = validateCommitteeGovernanceEvidence(markdown);
  return {
    target,
    status: result.status,
    errors: result.errors,
    classification: result.classification,
    publicationDecision: result.publicationDecision,
    scopeRows: result.scopeRows,
    commandRows: result.commandRows,
    rotationRows: result.rotationRows,
    positiveRows: result.positiveRows,
    negativeRows: result.negativeRows,
    reviewerRows: result.reviewerRows,
  };
}

function validateOperatorReadinessEvidenceTarget(target: string) {
  const { errors, label, markdown } = readEvidenceMarkdownTarget(target);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors: errors.map(error => `${label}: ${error}`),
      classification: {},
      publicationDecision: {},
      runbookRows: [],
      commandRows: [],
      drillRows: [],
      decisionRows: [],
      reviewerRows: [],
    };
  }
  const result = validateOperatorReadinessEvidence(markdown);
  return {
    target,
    status: result.status,
    errors: result.errors,
    classification: result.classification,
    publicationDecision: result.publicationDecision,
    runbookRows: result.runbookRows,
    commandRows: result.commandRows,
    drillRows: result.drillRows,
    decisionRows: result.decisionRows,
    reviewerRows: result.reviewerRows,
  };
}

function validateExternalIntegrationEvidenceTarget(target: string) {
  const { errors, label, markdown } = readEvidenceMarkdownTarget(target);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors: errors.map(error => `${label}: ${error}`),
      classification: {},
      publicationDecision: {},
      entryPointRows: [],
      freshCheckoutRows: [],
      decisionRows: [],
      negativeReviewRows: [],
      reviewerRows: [],
    };
  }
  const result = validateExternalIntegrationEvidence(markdown);
  return {
    target,
    status: result.status,
    errors: result.errors,
    classification: result.classification,
    publicationDecision: result.publicationDecision,
    entryPointRows: result.entryPointRows,
    freshCheckoutRows: result.freshCheckoutRows,
    decisionRows: result.decisionRows,
    negativeReviewRows: result.negativeReviewRows,
    reviewerRows: result.reviewerRows,
  };
}

function validateTechnicalAddendumEvidenceTarget(target: string) {
  const { errors, label, markdown } = readEvidenceMarkdownTarget(target);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors: errors.map(error => `${label}: ${error}`),
      classification: {},
      claimBoundary: {},
      publicationDecision: {},
      gateRows: [],
      decisionRows: [],
      reviewerRows: [],
    };
  }
  const result = validateTechnicalAddendumEvidence(markdown);
  return {
    target,
    status: result.status,
    errors: result.errors,
    classification: result.classification,
    claimBoundary: result.claimBoundary,
    publicationDecision: result.publicationDecision,
    gateRows: result.gateRows,
    decisionRows: result.decisionRows,
    reviewerRows: result.reviewerRows,
  };
}

function validatePostSubmitObserveJsonTarget(target: string, livePreflightTarget?: string) {
  const { errors, json } = readEvidenceJsonTarget(target);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors,
    };
  }
  const result = validatePostSubmitObserveJsonReport(json, {
    livePreflightTarget,
    livePreflightApprovedBurnTxHashes: livePreflightTarget
      ? readLivePreflightApprovedBurnTxHashes(livePreflightTarget)
      : undefined,
  });
  const observation = isRecord(json) && isRecord(json.observation)
    ? json.observation
    : undefined;
  const txBinding = observation && isRecord(observation.txBinding)
    ? observation.txBinding
    : undefined;
  return {
    target,
    status: result.errors.length === 0 ? 'PASS' as const : 'BLOCKED' as const,
    errors: result.errors,
    expectedTxId: normalizeTxId(txBinding?.expectedTxId),
    submittedTxId: normalizeTxId(txBinding?.submittedTxId),
    burnOrder: observation && Array.isArray(observation.burnOrder)
      ? observation.burnOrder
      : undefined,
    livePreflightBinding: observation && isRecord(observation.livePreflightBinding)
      ? observation.livePreflightBinding
      : undefined,
    confirmation: observation && isRecord(observation.confirmation)
      ? observation.confirmation
      : undefined,
    boundaries: observation && isRecord(observation.boundaries)
      ? observation.boundaries
      : undefined,
    sourceBindings: isRecord(json) && isRecord(json.sourceBindings)
      ? json.sourceBindings
      : undefined,
    observation,
  };
}

function readLivePreflightApprovedBurnTxHashes(target: string): string[] | undefined {
  const { errors, json } = readEvidenceJsonTarget(target);
  if (errors.length > 0 || !isRecord(json)) return undefined;
  const approvalBinding = isRecord(json.approvalBinding) ? json.approvalBinding : undefined;
  if (!Array.isArray(approvalBinding?.burnTxHashes)) return undefined;
  const burnTxHashes = approvalBinding.burnTxHashes.map(value =>
    typeof value === 'string' ? value.trim().toLowerCase().replace(/^0x/, '') : '',
  );
  return burnTxHashes.every(value => /^[0-9a-f]{64}$/.test(value)) ? burnTxHashes : undefined;
}

function validateLivePreflightJsonTarget(target: string) {
  const { errors, json } = readEvidenceJsonTarget(target);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors,
    };
  }
  const validationErrors = validateLivePreflightJsonReport(json);
  return {
    target,
    status: validationErrors.length === 0 ? 'PASS' as const : 'BLOCKED' as const,
    errors: validationErrors,
    settlementProfile: isRecord(json) && isRecord(json.settlementProfile)
      ? json.settlementProfile
      : undefined,
    expectedTxId: isRecord(json) ? normalizeTxId(json.expectedTxId) : undefined,
    runtimeBroadcastEnabled: isRecord(json)
      ? json.runtimeBroadcastEnabled
      : undefined,
    targetBindings: isRecord(json) && isRecord(json.targetBindings)
      ? json.targetBindings
      : undefined,
    preSubmitBoundary: isRecord(json) && isRecord(json.preSubmitBoundary)
      ? json.preSubmitBoundary
      : undefined,
    authorizationEvidence: isRecord(json) && isRecord(json.authorizationEvidence)
      ? json.authorizationEvidence
      : undefined,
    approvalBinding: isRecord(json) && isRecord(json.approvalBinding)
      ? json.approvalBinding
      : undefined,
  };
}

function validateAssemblyReportJsonTarget(target: string) {
  const { errors, json } = readEvidenceJsonTarget(target);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors,
    };
  }
  const result = validateTestnetRehearsalAssemblyReport(json);
  return {
    target,
    status: result.errors.length === 0 ? 'PASS' as const : 'BLOCKED' as const,
    errors: result.errors,
    expectedTxId: normalizeTxId(result.expectedTxId),
    submittedTxId: normalizeTxId(result.submittedTxId),
    targetBindings: isRecord(json) && isRecord(json.targetBindings)
      ? json.targetBindings
      : undefined,
    rehearsalValidation: isRecord(json) && isRecord(json.rehearsalValidation)
      ? json.rehearsalValidation
      : undefined,
    markdown: result.markdown,
  };
}

function validateRecoveryObserveJsonTarget(target: string) {
  const { errors, json } = readEvidenceJsonTarget(target);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors,
    };
  }
  const result = validateRecoveryObserveJsonReport(json);
  const report = isRecord(json) ? json : undefined;
  return {
    target,
    kind: result.kind,
    status: result.errors.length === 0 ? 'PASS' as const : 'BLOCKED' as const,
    errors: result.errors,
    pegOutBurnTxId: normalizeTxId(report?.pegOutBurnTxId),
    expectedTxId: normalizeTxId(report?.expectedTxId),
    singletonInventoryId: normalizeTxId(report?.singletonInventoryId),
    observationBoundary: report && isRecord(report.observationBoundary)
      ? report.observationBoundary
      : undefined,
    sourceBindings: report && isRecord(report.sourceBindings)
      ? report.sourceBindings
      : undefined,
  };
}

function validateFreshCheckpointJsonTarget(target: string) {
  const { errors, json } = readEvidenceJsonTarget(target);
  if (errors.length > 0) {
    return {
      target,
      status: 'BLOCKED' as const,
      errors,
    };
  }
  const validationErrors = validateFreshCheckpointArtifact(json);
  const checkpoint = isRecord(json) && isRecord(json.checkpoint)
    ? json.checkpoint
    : undefined;
  return {
    target,
    status: validationErrors.length === 0 ? 'PASS' as const : 'BLOCKED' as const,
    errors: validationErrors,
    expectedTxId: normalizeTxId(checkpoint?.expectedTxId),
    checkpoint,
    boundary: isRecord(json) && isRecord(json.boundary)
      ? json.boundary
      : undefined,
    sourceBindings: isRecord(json) && isRecord(json.sourceBindings)
      ? json.sourceBindings
      : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeTxId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase().replace(/^0x/, '');
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : undefined;
}
