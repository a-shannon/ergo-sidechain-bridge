import { createHash } from 'node:crypto';

export const PEG_IN_RUNTIME_LINEAGE_CUTOVER_MODEL_SCHEMA =
  'e2s.peg-in-runtime-lineage-cutover-model.v1' as const;
export const PEG_IN_RUNTIME_LINEAGE_CUTOVER_REPORT_SCHEMA =
  'e2s.peg-in-runtime-lineage-cutover-report.v1' as const;
export const PEG_IN_RUNTIME_LINEAGE_CUTOVER_REPORT_STATUS =
  'STRUCTURALLY_COMPLETE_NON_AUTHORIZING_MODEL' as const;

const UINT64_MAX = (1n << 64n) - 1n;
const MAX_RUNTIME_PROFILES = 64;
const MODEL_DIGEST_DOMAIN = Buffer.from(
  'E2S_PEG_IN_RUNTIME_LINEAGE_CUTOVER_MODEL_V1\0',
  'utf8',
);

/**
 * Shape-only claims supplied for structural assessment. Claim-present markers
 * are not authenticated facts and never become authority through this module.
 */
export interface PegInRuntimeLineageCutoverModel {
  readonly schema: typeof PEG_IN_RUNTIME_LINEAGE_CUTOVER_MODEL_SCHEMA;
  readonly sidechainIdHex: string;
  readonly targetPostState: {
    readonly blockHashHex: string;
    readonly blockHeight: string;
    readonly stateRootHex: string;
    readonly runtimeCodeSha256Hex: string;
    readonly runtimeCodeSizeBytes: string;
    readonly stateProofDigestHex: string;
    readonly authorityBoundVerificationDigestHex: string;
    readonly codeSemantics: 'target-post-state-only';
    readonly runtimeBuildAttestationClaimPresent: true;
    readonly launcherAtomicBootstrapProven: false;
    readonly targetRuntimeBuildEvidenceMatched: false;
    readonly targetRuntimeBuildIdentityVerified: false;
  };
  readonly recordProducerContext: {
    readonly executionBlockHashHex: string;
    readonly executionBlockHeight: string;
    readonly executionParentBlockHashHex: string;
    readonly recordStorageKeyHex: string;
    readonly recordOutcome: 'MEMBERSHIP' | 'NON_MEMBERSHIP';
    readonly activationRule: 'runtime-code-active-at-block-entry';
    readonly producerCodeSource: 'execution-parent-state';
    readonly runtimeUpgradeInExecutionBlock: boolean;
    readonly parentStateRuntimeCodeSha256Hex: string;
    readonly postStateRuntimeCodeSha256Hex: string;
    readonly producerRuntimeCodeSha256Hex: string;
    readonly producerCodeProofDigestHex: string;
  };
  readonly finalizedAncestry: {
    readonly profileId: string;
    readonly trustAnchorDigestHex: string;
    readonly targetFinalityProofDigestHex: string;
    readonly parentAncestryProofDigestHex: string;
    readonly checkpointDescendsFromTargetClaimPresent: true;
    readonly targetFinalityClaimPresent: true;
    readonly producerParentAncestryClaimPresent: true;
  };
  readonly upgradeHistory: {
    readonly startHeight: string;
    readonly endHeight: string;
    readonly startRuntimeCodeSha256Hex: string;
    readonly endRuntimeCodeSha256Hex: string;
    readonly sourceCommitmentDigestHex: string;
    readonly reviewDecisionDigestHex: string;
    readonly allCodeChangesEnumerationClaimPresent: true;
    readonly changeAndRevertCoverageClaimPresent: true;
    readonly noOmittedRuntimeChangeReviewClaimPresent: true;
    readonly transitions: readonly PegInRuntimeUpgradeTransition[];
  };
  readonly runtimeInvariantProfiles: readonly PegInRuntimeInvariantProfile[];
  readonly cutover: {
    readonly policyId: string;
    readonly policyDigestHex: string;
    readonly reviewDecisionDigestHex: string;
    readonly reviewerProfileId: string;
    readonly status: 'REVIEWED_NON_AUTHORIZING_MODEL';
    readonly sidechainActivationHeight: string;
    readonly eligibleErgoDepositHeightStart: string;
    readonly eligibleErgoDepositHeightEnd: string;
    readonly requiredRuntimeCodeSha256Hex: string;
    readonly upgradeHistoryReviewDecisionDigestHex: string;
  };
  readonly committedVaultIdentity: {
    readonly depositBoxIdHex: string;
    readonly committedVaultBoxIdHex: string;
    readonly committedVaultErgoTreeSha256Hex: string;
    readonly assetIdHex: string;
    readonly amount: string;
    readonly recipientHex: string;
    readonly identityDigestHex: string;
    readonly separateFromRuntimeLineage: true;
    readonly verificationStatus: 'REQUIRED_SEPARATELY';
    readonly verifiedByThisModel: false;
  };
  readonly boundary: PegInRuntimeLineageCutoverBoundary;
}

export interface PegInRuntimeUpgradeTransition {
  readonly activationHeight: string;
  readonly setCodeBlockHashHex: string;
  readonly previousRuntimeCodeSha256Hex: string;
  readonly nextRuntimeCodeSha256Hex: string;
  readonly transitionProofDigestHex: string;
  readonly runtimeBuildAttestationId: string;
  readonly runtimeBuildAttestationSha256Hex: string;
  readonly finalizedClaimPresent: true;
}

export interface PegInRuntimeInvariantProfile {
  readonly runtimeCodeSha256Hex: string;
  readonly runtimeBuildAttestationId: string;
  readonly runtimeBuildAttestationSha256Hex: string;
  readonly invariantReviewDigestHex: string;
  readonly replayKey: {
    readonly storageKeyHex: string;
    readonly monotonicityClaimPresent: true;
    readonly deletionImpossibilityClaimPresent: true;
  };
  readonly writeBeforeMint: {
    /**
     * Legacy shape-only name. "record" means the Solidity
     * `ErgoBridge.processedPegIns` bit, never the native post-execution
     * `BridgeCommitment::ProcessedPegIns` record. T16 supplies the exact
     * source-bound semantic profile; this marker alone proves neither.
     */
    readonly recordBeforeMintClaimPresent: true;
    readonly sameStateTransitionClaimPresent: true;
    readonly failedMintRollbackClaimPresent: true;
  };
  readonly mintEntrypoints: {
    readonly manifestSha256Hex: string;
    readonly allEntrypointsEnumerationClaimPresent: true;
    readonly alternateUnboundEntrypointCount: 0;
  };
}

export interface PegInRuntimeLineageCutoverBoundary {
  readonly targetPostStateCodeModelled: true;
  readonly producerExecutionCodeModelledSeparately: true;
  readonly upgradeInBlockCaseModelled: true;
  readonly finalizedAncestryModelled: true;
  readonly completeUpgradeHistoryModelled: true;
  readonly perRuntimeInvariantsModelled: true;
  readonly reviewedCutoverRangeModelled: true;
  readonly committedVaultIdentityModelledSeparately: true;
  readonly targetRuntimeBuildEvidenceMatched: false;
  readonly launcherAtomicBootstrapProven: false;
  readonly targetRuntimeBuildIdentityVerified: false;
  readonly executionCapabilityIssued: false;
  readonly targetStateCodeIsHistoricalProducerCode: false;
  readonly runtimeCodeIdentityVerified: false;
  readonly runtimeUpgradeHistoryVerified: false;
  readonly historicalMintAbsenceVerified: false;
  readonly committedVaultTransitionVerified: false;
  readonly mintAuthorized: false;
  readonly admissionEligible: false;
  readonly gate5Closed: false;
  readonly productionReady: false;
}

export interface PegInRuntimeLineageCutoverReport {
  readonly schema: typeof PEG_IN_RUNTIME_LINEAGE_CUTOVER_REPORT_SCHEMA;
  readonly status: typeof PEG_IN_RUNTIME_LINEAGE_CUTOVER_REPORT_STATUS;
  readonly modelDigestHex: string;
  readonly sidechainIdHex: string;
  readonly targetPostStateRuntimeCodeSha256Hex: string;
  readonly producerRuntimeCodeSha256Hex: string;
  readonly runtimeUpgradeInExecutionBlock: boolean;
  readonly runtimeCount: number;
  readonly transitionCount: number;
  readonly evidenceShape: {
    readonly targetPostStateAndProducerContextSeparated: true;
    readonly upgradeInBlockSemanticsConsistent: true;
    readonly finalizedAncestryPresent: true;
    readonly completeUpgradeHistoryClaimPresent: true;
    readonly changeAndRevertCoveragePresent: true;
    readonly everyRuntimeInvariantProfilePresent: true;
    readonly reviewedCutoverRangePresent: true;
    readonly committedVaultIdentitySeparated: true;
  };
  readonly boundary: PegInRuntimeLineageCutoverBoundary;
}

/**
 * Validate a complete local model of the evidence still needed after target-state
 * runtime-code proof and build-attestation matching. The result is deliberately
 * non-authorizing: it validates bindings and obligations, not launcher atomicity
 * or the independent provenance of those obligations.
 */
export function assessPegInRuntimeLineageCutover(
  value: unknown,
): PegInRuntimeLineageCutoverReport {
  const model = normalizePegInRuntimeLineageCutoverModel(value);
  return deepFreeze({
    schema: PEG_IN_RUNTIME_LINEAGE_CUTOVER_REPORT_SCHEMA,
    status: PEG_IN_RUNTIME_LINEAGE_CUTOVER_REPORT_STATUS,
    modelDigestHex: derivePegInRuntimeLineageCutoverModelDigestHex(model),
    sidechainIdHex: model.sidechainIdHex,
    targetPostStateRuntimeCodeSha256Hex:
      model.targetPostState.runtimeCodeSha256Hex,
    producerRuntimeCodeSha256Hex:
      model.recordProducerContext.producerRuntimeCodeSha256Hex,
    runtimeUpgradeInExecutionBlock:
      model.recordProducerContext.runtimeUpgradeInExecutionBlock,
    runtimeCount: model.runtimeInvariantProfiles.length,
    transitionCount: model.upgradeHistory.transitions.length,
    evidenceShape: {
      targetPostStateAndProducerContextSeparated: true,
      upgradeInBlockSemanticsConsistent: true,
      finalizedAncestryPresent: true,
      completeUpgradeHistoryClaimPresent: true,
      changeAndRevertCoveragePresent: true,
      everyRuntimeInvariantProfilePresent: true,
      reviewedCutoverRangePresent: true,
      committedVaultIdentitySeparated: true,
    },
    boundary: model.boundary,
  });
}

export function derivePegInRuntimeLineageCutoverModelDigestHex(
  value: unknown,
): string {
  const model = normalizePegInRuntimeLineageCutoverModel(value);
  return createHash('sha256')
    .update(Buffer.concat([
      MODEL_DIGEST_DOMAIN,
      Buffer.from(JSON.stringify(model), 'utf8'),
    ]))
    .digest('hex');
}

function normalizePegInRuntimeLineageCutoverModel(
  value: unknown,
): PegInRuntimeLineageCutoverModel {
  const record = exactRecord(value, [
    'boundary',
    'committedVaultIdentity',
    'cutover',
    'finalizedAncestry',
    'recordProducerContext',
    'runtimeInvariantProfiles',
    'schema',
    'sidechainIdHex',
    'targetPostState',
    'upgradeHistory',
  ], 'peg-in runtime lineage/cutover model');
  literal(
    record.schema,
    PEG_IN_RUNTIME_LINEAGE_CUTOVER_MODEL_SCHEMA,
    'peg-in runtime lineage/cutover model schema',
  );

  const targetPostState = normalizeTargetPostState(record.targetPostState);
  const recordProducerContext = normalizeRecordProducerContext(
    record.recordProducerContext,
  );
  const finalizedAncestry = normalizeFinalizedAncestry(
    record.finalizedAncestry,
  );
  const upgradeHistory = normalizeUpgradeHistory(record.upgradeHistory);
  const runtimeInvariantProfiles = normalizeRuntimeInvariantProfiles(
    record.runtimeInvariantProfiles,
  );
  const cutover = normalizeCutover(record.cutover);
  const committedVaultIdentity = normalizeCommittedVaultIdentity(
    record.committedVaultIdentity,
  );
  const boundary = normalizeBoundary(record.boundary);

  const model: PegInRuntimeLineageCutoverModel = {
    schema: PEG_IN_RUNTIME_LINEAGE_CUTOVER_MODEL_SCHEMA,
    sidechainIdHex: fixedHex(record.sidechainIdHex, 32, 'sidechain ID'),
    targetPostState,
    recordProducerContext,
    finalizedAncestry,
    upgradeHistory,
    runtimeInvariantProfiles,
    cutover,
    committedVaultIdentity,
    boundary,
  };
  assertProducerContext(model);
  assertFinalizedHistory(model);
  assertRuntimeInvariantCoverage(model);
  assertCutoverBinding(model);
  assertFailClosedBoundary(boundary);
  return deepFreeze(model);
}

function normalizeTargetPostState(
  value: unknown,
): PegInRuntimeLineageCutoverModel['targetPostState'] {
  const record = exactRecord(value, [
    'authorityBoundVerificationDigestHex',
    'blockHashHex',
    'blockHeight',
    'codeSemantics',
    'launcherAtomicBootstrapProven',
    'runtimeBuildAttestationClaimPresent',
    'runtimeCodeSha256Hex',
    'runtimeCodeSizeBytes',
    'stateProofDigestHex',
    'stateRootHex',
    'targetRuntimeBuildEvidenceMatched',
    'targetRuntimeBuildIdentityVerified',
  ], 'target post-state runtime code');
  literal(record.codeSemantics, 'target-post-state-only', 'target code semantics');
  literal(
    record.runtimeBuildAttestationClaimPresent,
    true,
    'runtime build attestation claim marker',
  );
  literal(record.launcherAtomicBootstrapProven, false, 'launcher atomic bootstrap flag');
  literal(record.targetRuntimeBuildEvidenceMatched, false, 'target runtime build evidence flag');
  literal(record.targetRuntimeBuildIdentityVerified, false, 'target runtime build identity flag');
  return {
    blockHashHex: fixedHex(record.blockHashHex, 32, 'target block hash'),
    blockHeight: uint64(record.blockHeight, 'target block height'),
    stateRootHex: fixedHex(record.stateRootHex, 32, 'target state root'),
    runtimeCodeSha256Hex: fixedHex(record.runtimeCodeSha256Hex, 32, 'target runtime code digest'),
    runtimeCodeSizeBytes: positiveUint64(record.runtimeCodeSizeBytes, 'target runtime code size'),
    stateProofDigestHex: fixedHex(record.stateProofDigestHex, 32, 'target runtime state proof digest'),
    authorityBoundVerificationDigestHex: fixedHex(
      record.authorityBoundVerificationDigestHex,
      32,
      'authority-bound target verification digest',
    ),
    codeSemantics: 'target-post-state-only',
    runtimeBuildAttestationClaimPresent: true,
    launcherAtomicBootstrapProven: false,
    targetRuntimeBuildEvidenceMatched: false,
    targetRuntimeBuildIdentityVerified: false,
  };
}

function normalizeRecordProducerContext(
  value: unknown,
): PegInRuntimeLineageCutoverModel['recordProducerContext'] {
  const record = exactRecord(value, [
    'activationRule',
    'executionBlockHashHex',
    'executionBlockHeight',
    'executionParentBlockHashHex',
    'parentStateRuntimeCodeSha256Hex',
    'postStateRuntimeCodeSha256Hex',
    'producerCodeProofDigestHex',
    'producerCodeSource',
    'producerRuntimeCodeSha256Hex',
    'recordOutcome',
    'recordStorageKeyHex',
    'runtimeUpgradeInExecutionBlock',
  ], 'record producer execution context');
  literal(record.activationRule, 'runtime-code-active-at-block-entry', 'runtime activation rule');
  literal(record.producerCodeSource, 'execution-parent-state', 'producer code source');
  if (record.recordOutcome !== 'MEMBERSHIP' && record.recordOutcome !== 'NON_MEMBERSHIP') {
    throw new Error('record outcome must be MEMBERSHIP or NON_MEMBERSHIP');
  }
  if (typeof record.runtimeUpgradeInExecutionBlock !== 'boolean') {
    throw new Error('runtime upgrade-in-block flag must be boolean');
  }
  return {
    executionBlockHashHex: fixedHex(record.executionBlockHashHex, 32, 'record execution block hash'),
    executionBlockHeight: uint64(record.executionBlockHeight, 'record execution block height'),
    executionParentBlockHashHex: fixedHex(
      record.executionParentBlockHashHex,
      32,
      'record execution parent block hash',
    ),
    recordStorageKeyHex: variableHex(record.recordStorageKeyHex, 'record storage key'),
    recordOutcome: record.recordOutcome,
    activationRule: 'runtime-code-active-at-block-entry',
    producerCodeSource: 'execution-parent-state',
    runtimeUpgradeInExecutionBlock: record.runtimeUpgradeInExecutionBlock,
    parentStateRuntimeCodeSha256Hex: fixedHex(
      record.parentStateRuntimeCodeSha256Hex,
      32,
      'parent-state runtime code digest',
    ),
    postStateRuntimeCodeSha256Hex: fixedHex(
      record.postStateRuntimeCodeSha256Hex,
      32,
      'execution post-state runtime code digest',
    ),
    producerRuntimeCodeSha256Hex: fixedHex(
      record.producerRuntimeCodeSha256Hex,
      32,
      'record producer runtime code digest',
    ),
    producerCodeProofDigestHex: fixedHex(
      record.producerCodeProofDigestHex,
      32,
      'record producer code proof digest',
    ),
  };
}

function normalizeFinalizedAncestry(
  value: unknown,
): PegInRuntimeLineageCutoverModel['finalizedAncestry'] {
  const record = exactRecord(value, [
    'checkpointDescendsFromTargetClaimPresent',
    'parentAncestryProofDigestHex',
    'producerParentAncestryClaimPresent',
    'profileId',
    'targetFinalityProofDigestHex',
    'targetFinalityClaimPresent',
    'trustAnchorDigestHex',
  ], 'finalized ancestry evidence');
  literal(
    record.checkpointDescendsFromTargetClaimPresent,
    true,
    'checkpoint descendant claim marker',
  );
  literal(
    record.targetFinalityClaimPresent,
    true,
    'target finality claim marker',
  );
  literal(
    record.producerParentAncestryClaimPresent,
    true,
    'producer parent ancestry claim marker',
  );
  return {
    profileId: identifier(record.profileId, 'finality profile ID'),
    trustAnchorDigestHex: fixedHex(record.trustAnchorDigestHex, 32, 'finality trust anchor digest'),
    targetFinalityProofDigestHex: fixedHex(
      record.targetFinalityProofDigestHex,
      32,
      'target finality proof digest',
    ),
    parentAncestryProofDigestHex: fixedHex(
      record.parentAncestryProofDigestHex,
      32,
      'producer parent ancestry proof digest',
    ),
    checkpointDescendsFromTargetClaimPresent: true,
    targetFinalityClaimPresent: true,
    producerParentAncestryClaimPresent: true,
  };
}

function normalizeUpgradeHistory(
  value: unknown,
): PegInRuntimeLineageCutoverModel['upgradeHistory'] {
  const record = exactRecord(value, [
    'allCodeChangesEnumerationClaimPresent',
    'changeAndRevertCoverageClaimPresent',
    'endHeight',
    'endRuntimeCodeSha256Hex',
    'noOmittedRuntimeChangeReviewClaimPresent',
    'reviewDecisionDigestHex',
    'sourceCommitmentDigestHex',
    'startHeight',
    'startRuntimeCodeSha256Hex',
    'transitions',
  ], 'runtime upgrade history');
  literal(
    record.allCodeChangesEnumerationClaimPresent,
    true,
    'all-code-changes enumeration claim marker',
  );
  literal(
    record.changeAndRevertCoverageClaimPresent,
    true,
    'change-and-revert coverage claim marker',
  );
  literal(
    record.noOmittedRuntimeChangeReviewClaimPresent,
    true,
    'no-omission review claim marker',
  );
  if (!Array.isArray(record.transitions)) {
    throw new Error('runtime upgrade transitions must be an array');
  }
  if (record.transitions.length >= MAX_RUNTIME_PROFILES) {
    throw new Error(
      `runtime upgrade transitions must contain at most ${MAX_RUNTIME_PROFILES - 1} entries`,
    );
  }
  return {
    startHeight: uint64(record.startHeight, 'runtime history start height'),
    endHeight: uint64(record.endHeight, 'runtime history end height'),
    startRuntimeCodeSha256Hex: fixedHex(
      record.startRuntimeCodeSha256Hex,
      32,
      'runtime history start code digest',
    ),
    endRuntimeCodeSha256Hex: fixedHex(
      record.endRuntimeCodeSha256Hex,
      32,
      'runtime history end code digest',
    ),
    sourceCommitmentDigestHex: fixedHex(
      record.sourceCommitmentDigestHex,
      32,
      'runtime history source commitment digest',
    ),
    reviewDecisionDigestHex: fixedHex(
      record.reviewDecisionDigestHex,
      32,
      'runtime history review decision digest',
    ),
    allCodeChangesEnumerationClaimPresent: true,
    changeAndRevertCoverageClaimPresent: true,
    noOmittedRuntimeChangeReviewClaimPresent: true,
    transitions: record.transitions.map(normalizeTransition),
  };
}

function normalizeTransition(
  value: unknown,
  index: number,
): PegInRuntimeUpgradeTransition {
  const label = `runtime upgrade transition ${index}`;
  const record = exactRecord(value, [
    'activationHeight',
    'finalizedClaimPresent',
    'nextRuntimeCodeSha256Hex',
    'previousRuntimeCodeSha256Hex',
    'runtimeBuildAttestationId',
    'runtimeBuildAttestationSha256Hex',
    'setCodeBlockHashHex',
    'transitionProofDigestHex',
  ], label);
  literal(
    record.finalizedClaimPresent,
    true,
    `${label} finality claim marker`,
  );
  return {
    activationHeight: uint64(record.activationHeight, `${label} activation height`),
    setCodeBlockHashHex: fixedHex(record.setCodeBlockHashHex, 32, `${label} block hash`),
    previousRuntimeCodeSha256Hex: fixedHex(
      record.previousRuntimeCodeSha256Hex,
      32,
      `${label} previous code digest`,
    ),
    nextRuntimeCodeSha256Hex: fixedHex(
      record.nextRuntimeCodeSha256Hex,
      32,
      `${label} next code digest`,
    ),
    transitionProofDigestHex: fixedHex(
      record.transitionProofDigestHex,
      32,
      `${label} proof digest`,
    ),
    runtimeBuildAttestationId: identifier(
      record.runtimeBuildAttestationId,
      `${label} build attestation ID`,
    ),
    runtimeBuildAttestationSha256Hex: fixedHex(
      record.runtimeBuildAttestationSha256Hex,
      32,
      `${label} build attestation digest`,
    ),
    finalizedClaimPresent: true,
  };
}

function normalizeRuntimeInvariantProfiles(
  value: unknown,
): readonly PegInRuntimeInvariantProfile[] {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.length > MAX_RUNTIME_PROFILES
  ) {
    throw new Error(
      `runtime invariant profiles must contain 1 to ${MAX_RUNTIME_PROFILES} entries`,
    );
  }
  return value.map((entry, index) => normalizeRuntimeInvariantProfile(entry, index));
}

function normalizeRuntimeInvariantProfile(
  value: unknown,
  index: number,
): PegInRuntimeInvariantProfile {
  const label = `runtime invariant profile ${index}`;
  const record = exactRecord(value, [
    'invariantReviewDigestHex',
    'mintEntrypoints',
    'replayKey',
    'runtimeBuildAttestationId',
    'runtimeBuildAttestationSha256Hex',
    'runtimeCodeSha256Hex',
    'writeBeforeMint',
  ], label);
  const replayKey = exactRecord(record.replayKey, [
    'deletionImpossibilityClaimPresent',
    'monotonicityClaimPresent',
    'storageKeyHex',
  ], `${label} replay-key invariant`);
  literal(
    replayKey.monotonicityClaimPresent,
    true,
    `${label} replay-key monotonicity claim marker`,
  );
  literal(
    replayKey.deletionImpossibilityClaimPresent,
    true,
    `${label} replay-key deletion claim marker`,
  );
  const writeBeforeMint = exactRecord(record.writeBeforeMint, [
    'failedMintRollbackClaimPresent',
    'recordBeforeMintClaimPresent',
    'sameStateTransitionClaimPresent',
  ], `${label} write-before-mint invariant`);
  literal(
    writeBeforeMint.recordBeforeMintClaimPresent,
    true,
    `${label} record-before-mint claim marker`,
  );
  literal(
    writeBeforeMint.sameStateTransitionClaimPresent,
    true,
    `${label} atomic state-transition claim marker`,
  );
  literal(
    writeBeforeMint.failedMintRollbackClaimPresent,
    true,
    `${label} failed-mint rollback claim marker`,
  );
  const mintEntrypoints = exactRecord(record.mintEntrypoints, [
    'allEntrypointsEnumerationClaimPresent',
    'alternateUnboundEntrypointCount',
    'manifestSha256Hex',
  ], `${label} mint-entrypoint inventory`);
  literal(
    mintEntrypoints.allEntrypointsEnumerationClaimPresent,
    true,
    `${label} mint-entrypoint completeness claim marker`,
  );
  literal(mintEntrypoints.alternateUnboundEntrypointCount, 0, `${label} alternate mint-entrypoint count`);
  return {
    runtimeCodeSha256Hex: fixedHex(record.runtimeCodeSha256Hex, 32, `${label} code digest`),
    runtimeBuildAttestationId: identifier(record.runtimeBuildAttestationId, `${label} build attestation ID`),
    runtimeBuildAttestationSha256Hex: fixedHex(
      record.runtimeBuildAttestationSha256Hex,
      32,
      `${label} build attestation digest`,
    ),
    invariantReviewDigestHex: fixedHex(
      record.invariantReviewDigestHex,
      32,
      `${label} review digest`,
    ),
    replayKey: {
      storageKeyHex: variableHex(replayKey.storageKeyHex, `${label} replay storage key`),
      monotonicityClaimPresent: true,
      deletionImpossibilityClaimPresent: true,
    },
    writeBeforeMint: {
      recordBeforeMintClaimPresent: true,
      sameStateTransitionClaimPresent: true,
      failedMintRollbackClaimPresent: true,
    },
    mintEntrypoints: {
      manifestSha256Hex: fixedHex(
        mintEntrypoints.manifestSha256Hex,
        32,
        `${label} mint-entrypoint manifest digest`,
      ),
      allEntrypointsEnumerationClaimPresent: true,
      alternateUnboundEntrypointCount: 0,
    },
  };
}

function normalizeCutover(
  value: unknown,
): PegInRuntimeLineageCutoverModel['cutover'] {
  const record = exactRecord(value, [
    'eligibleErgoDepositHeightEnd',
    'eligibleErgoDepositHeightStart',
    'policyDigestHex',
    'policyId',
    'requiredRuntimeCodeSha256Hex',
    'reviewDecisionDigestHex',
    'reviewerProfileId',
    'sidechainActivationHeight',
    'status',
    'upgradeHistoryReviewDecisionDigestHex',
  ], 'peg-in runtime cutover policy');
  literal(record.status, 'REVIEWED_NON_AUTHORIZING_MODEL', 'cutover model status');
  return {
    policyId: identifier(record.policyId, 'cutover policy ID'),
    policyDigestHex: fixedHex(record.policyDigestHex, 32, 'cutover policy digest'),
    reviewDecisionDigestHex: fixedHex(record.reviewDecisionDigestHex, 32, 'cutover review decision digest'),
    reviewerProfileId: identifier(record.reviewerProfileId, 'cutover reviewer profile ID'),
    status: 'REVIEWED_NON_AUTHORIZING_MODEL',
    sidechainActivationHeight: uint64(record.sidechainActivationHeight, 'cutover sidechain activation height'),
    eligibleErgoDepositHeightStart: uint64(
      record.eligibleErgoDepositHeightStart,
      'eligible Ergo deposit start height',
    ),
    eligibleErgoDepositHeightEnd: uint64(
      record.eligibleErgoDepositHeightEnd,
      'eligible Ergo deposit end height',
    ),
    requiredRuntimeCodeSha256Hex: fixedHex(
      record.requiredRuntimeCodeSha256Hex,
      32,
      'cutover required runtime code digest',
    ),
    upgradeHistoryReviewDecisionDigestHex: fixedHex(
      record.upgradeHistoryReviewDecisionDigestHex,
      32,
      'cutover upgrade-history review binding',
    ),
  };
}

function normalizeCommittedVaultIdentity(
  value: unknown,
): PegInRuntimeLineageCutoverModel['committedVaultIdentity'] {
  const record = exactRecord(value, [
    'amount',
    'assetIdHex',
    'committedVaultBoxIdHex',
    'committedVaultErgoTreeSha256Hex',
    'depositBoxIdHex',
    'identityDigestHex',
    'recipientHex',
    'separateFromRuntimeLineage',
    'verificationStatus',
    'verifiedByThisModel',
  ], 'committed vault identity');
  literal(record.separateFromRuntimeLineage, true, 'committed vault separation flag');
  literal(record.verificationStatus, 'REQUIRED_SEPARATELY', 'committed vault verification status');
  literal(record.verifiedByThisModel, false, 'committed vault local verification flag');
  return {
    depositBoxIdHex: fixedHex(record.depositBoxIdHex, 32, 'deposit box ID'),
    committedVaultBoxIdHex: fixedHex(record.committedVaultBoxIdHex, 32, 'committed vault box ID'),
    committedVaultErgoTreeSha256Hex: fixedHex(
      record.committedVaultErgoTreeSha256Hex,
      32,
      'committed vault ErgoTree digest',
    ),
    assetIdHex: fixedHex(record.assetIdHex, 32, 'committed vault asset ID'),
    amount: positiveUint64(record.amount, 'committed vault amount'),
    recipientHex: variableHex(record.recipientHex, 'committed vault recipient'),
    identityDigestHex: fixedHex(record.identityDigestHex, 32, 'committed vault identity digest'),
    separateFromRuntimeLineage: true,
    verificationStatus: 'REQUIRED_SEPARATELY',
    verifiedByThisModel: false,
  };
}

function normalizeBoundary(value: unknown): PegInRuntimeLineageCutoverBoundary {
  const modelledFields = [
    'committedVaultIdentityModelledSeparately',
    'completeUpgradeHistoryModelled',
    'finalizedAncestryModelled',
    'perRuntimeInvariantsModelled',
    'producerExecutionCodeModelledSeparately',
    'reviewedCutoverRangeModelled',
    'targetPostStateCodeModelled',
    'upgradeInBlockCaseModelled',
  ] as const;
  const deniedFields = [
    'admissionEligible',
    'committedVaultTransitionVerified',
    'executionCapabilityIssued',
    'gate5Closed',
    'historicalMintAbsenceVerified',
    'launcherAtomicBootstrapProven',
    'mintAuthorized',
    'productionReady',
    'runtimeCodeIdentityVerified',
    'runtimeUpgradeHistoryVerified',
    'targetRuntimeBuildEvidenceMatched',
    'targetRuntimeBuildIdentityVerified',
    'targetStateCodeIsHistoricalProducerCode',
  ] as const;
  const record = exactRecord(
    value,
    [...modelledFields, ...deniedFields],
    'peg-in runtime lineage/cutover boundary',
  );
  for (const field of modelledFields) {
    literal(record[field], true, `lineage boundary ${field}`);
  }
  for (const field of deniedFields) {
    literal(record[field], false, `lineage boundary ${field}`);
  }
  return {
    targetPostStateCodeModelled: true,
    producerExecutionCodeModelledSeparately: true,
    upgradeInBlockCaseModelled: true,
    finalizedAncestryModelled: true,
    completeUpgradeHistoryModelled: true,
    perRuntimeInvariantsModelled: true,
    reviewedCutoverRangeModelled: true,
    committedVaultIdentityModelledSeparately: true,
    targetRuntimeBuildEvidenceMatched: false,
    launcherAtomicBootstrapProven: false,
    targetRuntimeBuildIdentityVerified: false,
    executionCapabilityIssued: false,
    targetStateCodeIsHistoricalProducerCode: false,
    runtimeCodeIdentityVerified: false,
    runtimeUpgradeHistoryVerified: false,
    historicalMintAbsenceVerified: false,
    committedVaultTransitionVerified: false,
    mintAuthorized: false,
    admissionEligible: false,
    gate5Closed: false,
    productionReady: false,
  };
}

function assertProducerContext(model: PegInRuntimeLineageCutoverModel): void {
  const { recordProducerContext: producer, targetPostState: target } = model;
  if (
    producer.executionBlockHashHex !== target.blockHashHex
    || producer.executionBlockHeight !== target.blockHeight
    || producer.postStateRuntimeCodeSha256Hex !== target.runtimeCodeSha256Hex
  ) {
    throw new Error('record producer context must bind the exact target block and post-state code');
  }
  if (producer.producerRuntimeCodeSha256Hex !== producer.parentStateRuntimeCodeSha256Hex) {
    throw new Error('record producer code must be the runtime active in the execution parent state');
  }
  const changedInBlock =
    producer.parentStateRuntimeCodeSha256Hex !== producer.postStateRuntimeCodeSha256Hex;
  if (producer.runtimeUpgradeInExecutionBlock !== changedInBlock) {
    throw new Error('upgrade-in-block flag contradicts parent-state and post-state runtime code');
  }
}

function assertFinalizedHistory(model: PegInRuntimeLineageCutoverModel): void {
  const history = model.upgradeHistory;
  const startHeight = BigInt(history.startHeight);
  const endHeight = BigInt(history.endHeight);
  const targetHeight = BigInt(model.targetPostState.blockHeight);
  if (startHeight > endHeight || endHeight !== targetHeight) {
    throw new Error('runtime upgrade history must end at the exact target height');
  }
  if (history.endRuntimeCodeSha256Hex !== model.targetPostState.runtimeCodeSha256Hex) {
    throw new Error('runtime upgrade history end code does not match target post-state code');
  }

  let expectedCode = history.startRuntimeCodeSha256Hex;
  let previousHeight: bigint | null = null;
  const seenHeights = new Set<string>();
  for (const transition of history.transitions) {
    const activationHeight = BigInt(transition.activationHeight);
    if (
      activationHeight <= startHeight
      || activationHeight > endHeight
      || (previousHeight !== null && activationHeight <= previousHeight)
      || seenHeights.has(transition.activationHeight)
    ) {
      throw new Error('runtime upgrade transitions must be unique, ordered, and inside the reviewed interval');
    }
    if (transition.previousRuntimeCodeSha256Hex !== expectedCode) {
      throw new Error('runtime upgrade history contains a gap or contradictory predecessor');
    }
    if (transition.nextRuntimeCodeSha256Hex === transition.previousRuntimeCodeSha256Hex) {
      throw new Error('runtime upgrade transition must change the runtime code');
    }
    expectedCode = transition.nextRuntimeCodeSha256Hex;
    previousHeight = activationHeight;
    seenHeights.add(transition.activationHeight);
  }
  if (expectedCode !== history.endRuntimeCodeSha256Hex) {
    throw new Error('runtime upgrade history does not reach its declared end code');
  }

  const executionHeight = model.recordProducerContext.executionBlockHeight;
  const executionTransition = history.transitions.find(
    (transition) => transition.activationHeight === executionHeight,
  );
  if (model.recordProducerContext.runtimeUpgradeInExecutionBlock) {
    if (
      !executionTransition
      || executionTransition.setCodeBlockHashHex !== model.targetPostState.blockHashHex
      || executionTransition.previousRuntimeCodeSha256Hex
        !== model.recordProducerContext.parentStateRuntimeCodeSha256Hex
      || executionTransition.nextRuntimeCodeSha256Hex
        !== model.recordProducerContext.postStateRuntimeCodeSha256Hex
    ) {
      throw new Error('upgrade-in-block producer context lacks the exact finalized history transition');
    }
  } else if (executionTransition) {
    throw new Error('runtime history declares a target-block upgrade while producer context denies it');
  }
}

function assertRuntimeInvariantCoverage(model: PegInRuntimeLineageCutoverModel): void {
  const expectedCodes = new Set<string>([
    model.upgradeHistory.startRuntimeCodeSha256Hex,
    ...model.upgradeHistory.transitions.map(
      (transition) => transition.nextRuntimeCodeSha256Hex,
    ),
  ]);
  const profiles = new Map<string, PegInRuntimeInvariantProfile>();
  for (const profile of model.runtimeInvariantProfiles) {
    if (profiles.has(profile.runtimeCodeSha256Hex)) {
      throw new Error('runtime invariant profiles must not duplicate a runtime code');
    }
    profiles.set(profile.runtimeCodeSha256Hex, profile);
  }
  if (
    profiles.size !== expectedCodes.size
    || [...expectedCodes].some((code) => !profiles.has(code))
    || [...profiles].some(([code]) => !expectedCodes.has(code))
  ) {
    throw new Error('runtime invariant profiles must exactly cover every runtime in the reviewed history');
  }
  for (const transition of model.upgradeHistory.transitions) {
    const profile = profiles.get(transition.nextRuntimeCodeSha256Hex);
    if (
      !profile
      || profile.runtimeBuildAttestationId !== transition.runtimeBuildAttestationId
      || profile.runtimeBuildAttestationSha256Hex
        !== transition.runtimeBuildAttestationSha256Hex
    ) {
      throw new Error('runtime invariant profile does not match the transition build attestation');
    }
  }
}

function assertCutoverBinding(model: PegInRuntimeLineageCutoverModel): void {
  const cutover = model.cutover;
  if (
    BigInt(cutover.eligibleErgoDepositHeightStart)
      > BigInt(cutover.eligibleErgoDepositHeightEnd)
  ) {
    throw new Error('eligible Ergo deposit range is inverted');
  }
  if (
    BigInt(cutover.sidechainActivationHeight)
      < BigInt(model.upgradeHistory.startHeight)
    || BigInt(cutover.sidechainActivationHeight)
      > BigInt(model.upgradeHistory.endHeight)
  ) {
    throw new Error('cutover activation height is outside the reviewed runtime history');
  }
  let runtimeActiveAtCutoverEntry =
    model.upgradeHistory.startRuntimeCodeSha256Hex;
  for (const transition of model.upgradeHistory.transitions) {
    if (
      BigInt(transition.activationHeight)
        < BigInt(cutover.sidechainActivationHeight)
    ) {
      runtimeActiveAtCutoverEntry =
        transition.nextRuntimeCodeSha256Hex;
    }
  }
  if (
    cutover.requiredRuntimeCodeSha256Hex !== runtimeActiveAtCutoverEntry
    || cutover.upgradeHistoryReviewDecisionDigestHex
      !== model.upgradeHistory.reviewDecisionDigestHex
  ) {
    throw new Error(
      'cutover policy is not bound to the runtime active at block entry and the reviewed history decision',
    );
  }
}

function assertFailClosedBoundary(boundary: PegInRuntimeLineageCutoverBoundary): void {
  if (
    boundary.targetPostStateCodeModelled !== true
    || boundary.producerExecutionCodeModelledSeparately !== true
    || boundary.upgradeInBlockCaseModelled !== true
    || boundary.finalizedAncestryModelled !== true
    || boundary.completeUpgradeHistoryModelled !== true
    || boundary.perRuntimeInvariantsModelled !== true
    || boundary.reviewedCutoverRangeModelled !== true
    || boundary.committedVaultIdentityModelledSeparately !== true
    || boundary.targetRuntimeBuildEvidenceMatched !== false
    || boundary.launcherAtomicBootstrapProven !== false
    || boundary.targetRuntimeBuildIdentityVerified !== false
    || boundary.executionCapabilityIssued !== false
    || boundary.targetStateCodeIsHistoricalProducerCode !== false
    || boundary.runtimeCodeIdentityVerified !== false
    || boundary.runtimeUpgradeHistoryVerified !== false
    || boundary.historicalMintAbsenceVerified !== false
    || boundary.committedVaultTransitionVerified !== false
    || boundary.mintAuthorized !== false
    || boundary.admissionEligible !== false
    || boundary.gate5Closed !== false
    || boundary.productionReady !== false
  ) {
    throw new Error('runtime lineage/cutover model makes a premature authority or readiness claim');
  }
}

function exactRecord(
  value: unknown,
  expectedFields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...expectedFields].sort();
  if (
    actual.length !== expected.length
    || actual.some((field, index) => field !== expected[index])
  ) {
    throw new Error(`${label} must contain exactly the supported fields`);
  }
  return record;
}

function literal<T extends string | number | boolean>(
  value: unknown,
  expected: T,
  label: string,
): asserts value is T {
  if (value !== expected) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}`);
  }
}

function fixedHex(value: unknown, bytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || !new RegExp(`^[0-9a-f]{${bytes * 2}}$`).test(value)
  ) {
    throw new Error(`${label} must be exactly ${bytes} lowercase bytes`);
  }
  return value;
}

function variableHex(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length % 2 !== 0
    || !/^[0-9a-f]+$/.test(value)
  ) {
    throw new Error(`${label} must be non-empty lowercase hex`);
  }
  return value;
}

function identifier(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function uint64(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical unsigned decimal string`);
  }
  const parsed = BigInt(value);
  if (parsed > UINT64_MAX) {
    throw new Error(`${label} exceeds uint64`);
  }
  return value;
}

function positiveUint64(value: unknown, label: string): string {
  const normalized = uint64(value, label);
  if (normalized === '0') {
    throw new Error(`${label} must be positive`);
  }
  return normalized;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}
