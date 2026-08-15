import { describe, expect, it } from 'vitest';

import * as lineageCutoverModule from './peg-in-runtime-lineage-cutover.js';
import {
  PEG_IN_RUNTIME_LINEAGE_CUTOVER_MODEL_SCHEMA,
  assessPegInRuntimeLineageCutover,
  derivePegInRuntimeLineageCutoverModelDigestHex,
} from './peg-in-runtime-lineage-cutover.js';

const H = {
  sidechain: '01'.repeat(32),
  targetBlock: '02'.repeat(32),
  parentBlock: '03'.repeat(32),
  stateRoot: '04'.repeat(32),
  runtimeA: '05'.repeat(32),
  runtimeB: '06'.repeat(32),
  runtimeC: '07'.repeat(32),
  targetProof: '08'.repeat(32),
  authority: '09'.repeat(32),
  anchor: '0a'.repeat(32),
  finality: '0b'.repeat(32),
  ancestry: '0c'.repeat(32),
  source: '0d'.repeat(32),
  historyReview: '0e'.repeat(32),
  transitionOne: '0f'.repeat(32),
  transitionTwo: '10'.repeat(32),
  buildA: '11'.repeat(32),
  buildB: '12'.repeat(32),
  buildC: '13'.repeat(32),
  invariantA: '14'.repeat(32),
  invariantB: '15'.repeat(32),
  invariantC: '16'.repeat(32),
  entryA: '17'.repeat(32),
  entryB: '18'.repeat(32),
  entryC: '19'.repeat(32),
  cutoverPolicy: '1a'.repeat(32),
  cutoverReview: '1b'.repeat(32),
  deposit: '1c'.repeat(32),
  vault: '1d'.repeat(32),
  tree: '1e'.repeat(32),
  asset: '1f'.repeat(32),
  vaultIdentity: '20'.repeat(32),
};

function runtimeProfile(
  runtimeCodeSha256Hex: string,
  runtimeBuildAttestationId: string,
  runtimeBuildAttestationSha256Hex: string,
  invariantReviewDigestHex: string,
  manifestSha256Hex: string,
) {
  return {
    runtimeCodeSha256Hex,
    runtimeBuildAttestationId,
    runtimeBuildAttestationSha256Hex,
    invariantReviewDigestHex,
    replayKey: {
      storageKeyHex: 'aa'.repeat(32),
      monotonicityClaimPresent: true,
      deletionImpossibilityClaimPresent: true,
    },
    writeBeforeMint: {
      recordBeforeMintClaimPresent: true,
      sameStateTransitionClaimPresent: true,
      failedMintRollbackClaimPresent: true,
    },
    mintEntrypoints: {
      manifestSha256Hex,
      allEntrypointsEnumerationClaimPresent: true,
      alternateUnboundEntrypointCount: 0,
    },
  };
}

function modelWithUpgradeInTargetBlock() {
  return {
    schema: PEG_IN_RUNTIME_LINEAGE_CUTOVER_MODEL_SCHEMA,
    sidechainIdHex: H.sidechain,
    targetPostState: {
      blockHashHex: H.targetBlock,
      blockHeight: '120',
      stateRootHex: H.stateRoot,
      runtimeCodeSha256Hex: H.runtimeC,
      runtimeCodeSizeBytes: '4096',
      stateProofDigestHex: H.targetProof,
      authorityBoundVerificationDigestHex: H.authority,
      codeSemantics: 'target-post-state-only',
      runtimeBuildAttestationClaimPresent: true,
      launcherAtomicBootstrapProven: false,
      targetRuntimeBuildEvidenceMatched: false,
      targetRuntimeBuildIdentityVerified: false,
    },
    recordProducerContext: {
      executionBlockHashHex: H.targetBlock,
      executionBlockHeight: '120',
      executionParentBlockHashHex: H.parentBlock,
      recordStorageKeyHex: 'bb'.repeat(32),
      recordOutcome: 'MEMBERSHIP',
      activationRule: 'runtime-code-active-at-block-entry',
      producerCodeSource: 'execution-parent-state',
      runtimeUpgradeInExecutionBlock: true,
      parentStateRuntimeCodeSha256Hex: H.runtimeB,
      postStateRuntimeCodeSha256Hex: H.runtimeC,
      producerRuntimeCodeSha256Hex: H.runtimeB,
      producerCodeProofDigestHex: '21'.repeat(32),
    },
    finalizedAncestry: {
      profileId: 'grandpa-finality-v1',
      trustAnchorDigestHex: H.anchor,
      targetFinalityProofDigestHex: H.finality,
      parentAncestryProofDigestHex: H.ancestry,
      checkpointDescendsFromTargetClaimPresent: true,
      targetFinalityClaimPresent: true,
      producerParentAncestryClaimPresent: true,
    },
    upgradeHistory: {
      startHeight: '100',
      endHeight: '120',
      startRuntimeCodeSha256Hex: H.runtimeA,
      endRuntimeCodeSha256Hex: H.runtimeC,
      sourceCommitmentDigestHex: H.source,
      reviewDecisionDigestHex: H.historyReview,
      allCodeChangesEnumerationClaimPresent: true,
      changeAndRevertCoverageClaimPresent: true,
      noOmittedRuntimeChangeReviewClaimPresent: true,
      transitions: [
        {
          activationHeight: '110',
          setCodeBlockHashHex: '22'.repeat(32),
          previousRuntimeCodeSha256Hex: H.runtimeA,
          nextRuntimeCodeSha256Hex: H.runtimeB,
          transitionProofDigestHex: H.transitionOne,
          runtimeBuildAttestationId: 'runtime-build-b',
          runtimeBuildAttestationSha256Hex: H.buildB,
          finalizedClaimPresent: true,
        },
        {
          activationHeight: '120',
          setCodeBlockHashHex: H.targetBlock,
          previousRuntimeCodeSha256Hex: H.runtimeB,
          nextRuntimeCodeSha256Hex: H.runtimeC,
          transitionProofDigestHex: H.transitionTwo,
          runtimeBuildAttestationId: 'runtime-build-c',
          runtimeBuildAttestationSha256Hex: H.buildC,
          finalizedClaimPresent: true,
        },
      ],
    },
    runtimeInvariantProfiles: [
      runtimeProfile(H.runtimeA, 'runtime-build-a', H.buildA, H.invariantA, H.entryA),
      runtimeProfile(H.runtimeB, 'runtime-build-b', H.buildB, H.invariantB, H.entryB),
      runtimeProfile(H.runtimeC, 'runtime-build-c', H.buildC, H.invariantC, H.entryC),
    ],
    cutover: {
      policyId: 'peg-in-cutover-v1',
      policyDigestHex: H.cutoverPolicy,
      reviewDecisionDigestHex: H.cutoverReview,
      reviewerProfileId: 'independent-cutover-review-v1',
      status: 'REVIEWED_NON_AUTHORIZING_MODEL',
      sidechainActivationHeight: '100',
      eligibleErgoDepositHeightStart: '500000',
      eligibleErgoDepositHeightEnd: '510000',
      requiredRuntimeCodeSha256Hex: H.runtimeA,
      upgradeHistoryReviewDecisionDigestHex: H.historyReview,
    },
    committedVaultIdentity: {
      depositBoxIdHex: H.deposit,
      committedVaultBoxIdHex: H.vault,
      committedVaultErgoTreeSha256Hex: H.tree,
      assetIdHex: H.asset,
      amount: '1000000000',
      recipientHex: '00d8'.repeat(8),
      identityDigestHex: H.vaultIdentity,
      separateFromRuntimeLineage: true,
      verificationStatus: 'REQUIRED_SEPARATELY',
      verifiedByThisModel: false,
    },
    boundary: {
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
    },
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe('peg-in runtime lineage/cutover fail-closed model', () => {
  it('does not export the shape-only normalizer or positive verified claims', () => {
    expect(
      'normalizePegInRuntimeLineageCutoverModel' in lineageCutoverModule,
    ).toBe(false);
    expect(findPositiveVerifiedPaths(
      assessPegInRuntimeLineageCutover(modelWithUpgradeInTargetBlock()),
    )).toEqual([]);
  });

  it('snapshots caller-owned boundary accessors into constant non-authorizing values', () => {
    const model = modelWithUpgradeInTargetBlock();
    let runtimeCodeIdentityClaim = false;
    const boundary = { ...model.boundary };
    Object.defineProperty(boundary, 'runtimeCodeIdentityVerified', {
      enumerable: true,
      get: () => runtimeCodeIdentityClaim,
    });
    model.boundary = boundary;

    const report = assessPegInRuntimeLineageCutover(model);
    runtimeCodeIdentityClaim = true;

    expect(report.boundary.runtimeCodeIdentityVerified).toBe(false);
    expect(findPositiveVerifiedPaths(report)).toEqual([]);
  });

  it('models upgrade-in-block producer identity without issuing authority', () => {
    const model = modelWithUpgradeInTargetBlock();
    const report = assessPegInRuntimeLineageCutover(model);

    expect(report.status).toBe('STRUCTURALLY_COMPLETE_NON_AUTHORIZING_MODEL');
    expect(report.runtimeCount).toBe(3);
    expect(report.transitionCount).toBe(2);
    expect(report.runtimeUpgradeInExecutionBlock).toBe(true);
    expect(report.producerRuntimeCodeSha256Hex).toBe(H.runtimeB);
    expect(report.targetPostStateRuntimeCodeSha256Hex).toBe(H.runtimeC);
    expect(report.modelDigestHex).toBe(
      derivePegInRuntimeLineageCutoverModelDigestHex(model),
    );
    expect(report.boundary).toMatchObject({
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
    });
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.boundary)).toBe(true);
  });

  it('accepts a no-upgrade target only when producer, parent and post-state code agree', () => {
    const model = modelWithUpgradeInTargetBlock();
    model.recordProducerContext.runtimeUpgradeInExecutionBlock = false;
    model.recordProducerContext.parentStateRuntimeCodeSha256Hex = H.runtimeC;
    model.recordProducerContext.producerRuntimeCodeSha256Hex = H.runtimeC;
    model.upgradeHistory.transitions.pop();
    model.upgradeHistory.transitions[0]!.nextRuntimeCodeSha256Hex = H.runtimeC;
    model.upgradeHistory.transitions[0]!.runtimeBuildAttestationId =
      'runtime-build-c';
    model.upgradeHistory.transitions[0]!.runtimeBuildAttestationSha256Hex =
      H.buildC;
    model.runtimeInvariantProfiles.splice(1, 1);
    model.cutover.sidechainActivationHeight = '111';
    model.cutover.requiredRuntimeCodeSha256Hex = H.runtimeC;

    const report = assessPegInRuntimeLineageCutover(model);
    expect(report.runtimeUpgradeInExecutionBlock).toBe(false);
    expect(report.producerRuntimeCodeSha256Hex).toBe(H.runtimeC);
    expect(report.transitionCount).toBe(1);
  });

  it('treats a set-code block as old-runtime execution and activates the new runtime on the next block', () => {
    const atSetCode = modelWithUpgradeInTargetBlock();
    atSetCode.cutover.sidechainActivationHeight = '110';
    atSetCode.cutover.requiredRuntimeCodeSha256Hex = H.runtimeA;
    expect(() => assessPegInRuntimeLineageCutover(atSetCode)).not.toThrow();

    const afterSetCode = modelWithUpgradeInTargetBlock();
    afterSetCode.cutover.sidechainActivationHeight = '111';
    afterSetCode.cutover.requiredRuntimeCodeSha256Hex = H.runtimeB;
    expect(() => assessPegInRuntimeLineageCutover(afterSetCode)).not.toThrow();
  });

  it('rejects unknown or missing fields at every authority-bearing surface', () => {
    const unknownTop = { ...modelWithUpgradeInTargetBlock(), verified: true };
    expect(() => assessPegInRuntimeLineageCutover(unknownTop)).toThrow(
      /exactly the supported fields/,
    );

    const unknownNested = modelWithUpgradeInTargetBlock();
    Object.assign(unknownNested.recordProducerContext, { trusted: true });
    expect(() => assessPegInRuntimeLineageCutover(unknownNested)).toThrow(
      /exactly the supported fields/,
    );

    const missing = modelWithUpgradeInTargetBlock();
    delete (missing.upgradeHistory as Partial<typeof missing.upgradeHistory>)
      .changeAndRevertCoverageClaimPresent;
    expect(() => assessPegInRuntimeLineageCutover(missing)).toThrow(
      /exactly the supported fields/,
    );
  });

  it('rejects target post-state code conflated with producer code during upgrade-in-block', () => {
    const conflated = modelWithUpgradeInTargetBlock();
    conflated.recordProducerContext.producerRuntimeCodeSha256Hex = H.runtimeC;
    expect(() => assessPegInRuntimeLineageCutover(conflated)).toThrow(
      /runtime active in the execution parent state/,
    );

    const falseUpgrade = modelWithUpgradeInTargetBlock();
    falseUpgrade.recordProducerContext.runtimeUpgradeInExecutionBlock = false;
    expect(() => assessPegInRuntimeLineageCutover(falseUpgrade)).toThrow(
      /upgrade-in-block flag contradicts/,
    );

    const wrongBlock = modelWithUpgradeInTargetBlock();
    wrongBlock.recordProducerContext.executionBlockHashHex = 'ff'.repeat(32);
    expect(() => assessPegInRuntimeLineageCutover(wrongBlock)).toThrow(
      /exact target block and post-state code/,
    );
  });

  it('rejects promotion of non-atomic target-build evidence to execution identity', () => {
    const atomicLauncher = modelWithUpgradeInTargetBlock();
    atomicLauncher.targetPostState.launcherAtomicBootstrapProven = true as false;
    expect(() => assessPegInRuntimeLineageCutover(atomicLauncher)).toThrow(
      /launcher atomic bootstrap flag/,
    );

    const evidenceClaim = modelWithUpgradeInTargetBlock();
    evidenceClaim.targetPostState.targetRuntimeBuildEvidenceMatched =
      true as false;
    expect(() => assessPegInRuntimeLineageCutover(evidenceClaim)).toThrow(
      /target runtime build evidence flag/,
    );

    const identityClaim = modelWithUpgradeInTargetBlock();
    identityClaim.targetPostState.targetRuntimeBuildIdentityVerified =
      true as false;
    expect(() => assessPegInRuntimeLineageCutover(identityClaim)).toThrow(
      /target runtime build identity flag/,
    );
  });

  it('rejects absent finality or ancestry evidence', () => {
    for (const field of [
      'checkpointDescendsFromTargetClaimPresent',
      'targetFinalityClaimPresent',
      'producerParentAncestryClaimPresent',
    ] as const) {
      const model = modelWithUpgradeInTargetBlock();
      model.finalizedAncestry[field] = false as never;
      expect(() => assessPegInRuntimeLineageCutover(model)).toThrow();
    }
  });

  it('rejects incomplete, unordered, gapped, or contradictory upgrade histories', () => {
    const incomplete = modelWithUpgradeInTargetBlock();
    incomplete.upgradeHistory.allCodeChangesEnumerationClaimPresent =
      false as true;
    expect(() => assessPegInRuntimeLineageCutover(incomplete)).toThrow(
      /all-code-changes enumeration claim marker/,
    );

    const noRevertCoverage = modelWithUpgradeInTargetBlock();
    noRevertCoverage.upgradeHistory.changeAndRevertCoverageClaimPresent =
      false as true;
    expect(() => assessPegInRuntimeLineageCutover(noRevertCoverage)).toThrow(
      /change-and-revert coverage claim marker/,
    );

    const gap = modelWithUpgradeInTargetBlock();
    gap.upgradeHistory.transitions[1]!.previousRuntimeCodeSha256Hex = H.runtimeA;
    expect(() => assessPegInRuntimeLineageCutover(gap)).toThrow(
      /gap or contradictory predecessor/,
    );

    const omittedTargetUpgrade = modelWithUpgradeInTargetBlock();
    omittedTargetUpgrade.upgradeHistory.transitions.pop();
    omittedTargetUpgrade.upgradeHistory.endRuntimeCodeSha256Hex = H.runtimeB;
    expect(() => assessPegInRuntimeLineageCutover(omittedTargetUpgrade)).toThrow(
      /end code does not match target post-state code/,
    );
  });

  it('requires every historical runtime to prove replay, atomicity and no alternate mint path', () => {
    const missingProfile = modelWithUpgradeInTargetBlock();
    missingProfile.runtimeInvariantProfiles.pop();
    expect(() => assessPegInRuntimeLineageCutover(missingProfile)).toThrow(
      /exactly cover every runtime/,
    );

    const deletableReplay = modelWithUpgradeInTargetBlock();
    deletableReplay.runtimeInvariantProfiles[0]!.replayKey
      .deletionImpossibilityClaimPresent = false as true;
    expect(() => assessPegInRuntimeLineageCutover(deletableReplay)).toThrow(
      /replay-key deletion claim marker/,
    );

    const nonAtomic = modelWithUpgradeInTargetBlock();
    nonAtomic.runtimeInvariantProfiles[1]!.writeBeforeMint
      .sameStateTransitionClaimPresent = false as true;
    expect(() => assessPegInRuntimeLineageCutover(nonAtomic)).toThrow(
      /atomic state-transition claim marker/,
    );

    const alternateMint = modelWithUpgradeInTargetBlock();
    alternateMint.runtimeInvariantProfiles[2]!.mintEntrypoints
      .alternateUnboundEntrypointCount = 1 as 0;
    expect(() => assessPegInRuntimeLineageCutover(alternateMint)).toThrow(
      /alternate mint-entrypoint count/,
    );
  });

  it('rejects cutover drift and any attempt to let lineage verify the committed vault', () => {
    const invertedRange = modelWithUpgradeInTargetBlock();
    invertedRange.cutover.eligibleErgoDepositHeightStart = '510001';
    expect(() => assessPegInRuntimeLineageCutover(invertedRange)).toThrow(
      /deposit range is inverted/,
    );

    const wrongHistory = modelWithUpgradeInTargetBlock();
    wrongHistory.cutover.upgradeHistoryReviewDecisionDigestHex = 'ff'.repeat(32);
    expect(() => assessPegInRuntimeLineageCutover(wrongHistory)).toThrow(
      /not bound to the runtime active at block entry/,
    );

    const vaultClaim = modelWithUpgradeInTargetBlock();
    vaultClaim.committedVaultIdentity.verifiedByThisModel = true as false;
    expect(() => assessPegInRuntimeLineageCutover(vaultClaim)).toThrow(
      /committed vault local verification flag/,
    );
  });

  it('rejects every premature authority, historical-absence, Gate 5, or readiness claim', () => {
    const forbiddenTrue = [
      'executionCapabilityIssued',
      'targetRuntimeBuildEvidenceMatched',
      'targetRuntimeBuildIdentityVerified',
      'runtimeCodeIdentityVerified',
      'runtimeUpgradeHistoryVerified',
      'historicalMintAbsenceVerified',
      'committedVaultTransitionVerified',
      'mintAuthorized',
      'admissionEligible',
      'gate5Closed',
      'productionReady',
    ] as const;
    for (const field of forbiddenTrue) {
      const model = modelWithUpgradeInTargetBlock();
      model.boundary[field] = true as never;
      expect(() => assessPegInRuntimeLineageCutover(model)).toThrow(
        /lineage boundary .* must be false/,
      );
    }

    const producerClaim = modelWithUpgradeInTargetBlock();
    producerClaim.boundary.targetStateCodeIsHistoricalProducerCode = true as false;
    expect(() => assessPegInRuntimeLineageCutover(producerClaim)).toThrow(
      /lineage boundary .* must be false/,
    );

    const launcherClaim = modelWithUpgradeInTargetBlock();
    launcherClaim.boundary.launcherAtomicBootstrapProven = true as false;
    expect(() => assessPegInRuntimeLineageCutover(launcherClaim)).toThrow(
      /lineage boundary .* must be false/,
    );

  });
});

function findPositiveVerifiedPaths(
  value: unknown,
  path = '$',
): string[] {
  if (!value || typeof value !== 'object') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      findPositiveVerifiedPaths(entry, `${path}[${index}]`));
  }
  return Object.entries(value).flatMap(([key, entry]) => {
    const current = `${path}.${key}`;
    if (entry === true && /verified$/i.test(key)) {
      return [current];
    }
    return findPositiveVerifiedPaths(entry, current);
  });
}
