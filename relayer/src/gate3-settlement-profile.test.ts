import { describe, expect, it } from 'vitest';

import {
  computeSettlementProfileActivationId,
  computeSettlementProfileAuthorityEvidenceId,
  legacyGate3SettlementProfileBinding,
  validateGate3ClosureProfileBinding,
  validateSettlementProfileActivationEvidence,
  validateSettlementProfileBinding,
} from './gate3-settlement-profile.js';
import type { SettlementProfileAuthorityEvidenceReports } from './gate3-settlement-profile.js';

const activationTarget = '../evidence/activation/completed-settlement-profile-activation.json';

function activatedProfile() {
  return {
    settlementProfileId: 'authenticated-external-fee-v1',
    profileActivationStatus: 'ACTIVATED',
    evidencePurpose: 'gate3-lifecycle-closure',
    activationEvidenceTarget: activationTarget,
  };
}

function activationEvidence() {
  const report = {
    schemaVersion: 1,
    status: 'PASS',
    generatedAt: '2026-08-01T10:00:00.000Z',
    environment: 'testnet',
    ergoNodeNetwork: 'testnet',
    sidechainNetwork: 'patched-devnet',
    gitCommit: 'abc1234',
    activationId: '',
    settlementProfile: activatedProfile(),
    evidenceTargets: {
      targetNodeAcceptance: '../evidence/activation/completed-target-node-acceptance.json',
      fundsAuthorityTransition: '../evidence/activation/completed-funds-authority-transition.json',
      legacyRouteRetirement: '../evidence/activation/completed-legacy-route-retirement.json',
      crossProfileReplayLineage: '../evidence/activation/completed-cross-profile-replay-lineage.json',
    },
    evidenceIds: {
      targetNodeAcceptance: '',
      fundsAuthorityTransition: '',
      legacyRouteRetirement: '',
      crossProfileReplayLineage: '',
    },
    authorityBoundary: {
      targetNodeAccepted: true,
      fundsAuthorityTransitionComplete: true,
      legacyFundsRoutesRetired: true,
      crossProfileReplayLineagePreserved: true,
      gate3ClosedByThisEvidence: false,
      productionReadyClaimAllowed: false,
      mainnetProductionClaimAllowed: false,
    },
    reviewer: {
      decision: 'APPROVE',
      reviewer: 'reviewer-a',
      date: '2026-08-01',
    },
  };
  const profiles = {
    targetNodeAcceptance: {
      producerId: 'e2s.gate3-target-node-acceptance.v1',
      bindings: {
        unsignedTransactionId: '1'.repeat(64),
        nodeResponseDigest: '2'.repeat(64),
        nodeVersion: '6.0.4',
        acceptanceEndpoint: '/transactions/check',
        acceptedAtHeight: 123,
        contractProfileDigest: '3'.repeat(64),
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
        activationTransactionId: '4'.repeat(64),
        activationBlockId: '5'.repeat(64),
        activatedContractProfileDigest: '3'.repeat(64),
        mintAuthorityIdentityDigest: '6'.repeat(64),
        payoutAuthorityIdentityDigest: '7'.repeat(64),
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
        retirementRegistryDigest: '8'.repeat(64),
        legacyRouteInventoryDigest: '9'.repeat(64),
        replacementProfileDigest: '3'.repeat(64),
        retiredRouteCount: 4,
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
        sourceReplayDigest: 'a'.repeat(66),
        activatedReplayDigest: 'b'.repeat(66),
        lineageManifestDigest: 'c'.repeat(64),
        replacementProfileDigest: '3'.repeat(64),
        coveredBurnIdCount: 10,
      },
      decision: {
        allFundedLegacyProfilesCovered: true,
        replaySetImportedOrFrozen: true,
        oldReplayRoutesFrozen: true,
        duplicateAcrossProfilesRejected: true,
      },
    },
  } as const;
  const authorityEvidence = Object.fromEntries(Object.entries(profiles).map(([role, profile]) => {
    const typedRole = role as keyof typeof profiles;
    const evidence = {
      schemaVersion: 1,
      status: 'PASS',
      role: typedRole,
      producerId: profile.producerId,
      generatedAt: '2026-08-01T09:59:00.000Z',
      environment: report.environment,
      ergoNodeNetwork: report.ergoNodeNetwork,
      sidechainNetwork: report.sidechainNetwork,
      gitCommit: report.gitCommit,
      settlementProfileId: report.settlementProfile.settlementProfileId,
      evidenceTarget: report.evidenceTargets[typedRole],
      evidenceId: '',
      bindings: profile.bindings,
      decision: profile.decision,
    };
    evidence.evidenceId = computeSettlementProfileAuthorityEvidenceId(evidence);
    report.evidenceIds[typedRole] = evidence.evidenceId;
    return [typedRole, evidence];
  })) as unknown as SettlementProfileAuthorityEvidenceReports;
  report.activationId = computeSettlementProfileActivationId(report);
  return { report, authorityEvidence };
}

describe('Gate 3 settlement profile evidence', () => {
  it('keeps the legacy profile structurally parseable but ineligible for closure', () => {
    const binding = legacyGate3SettlementProfileBinding();

    expect(validateSettlementProfileBinding(binding)).toEqual([]);
    expect(validateGate3ClosureProfileBinding(binding, activationTarget)).toContain(
      'settlementProfile must bind authenticated-external-fee-v1, ACTIVATED, and gate3-lifecycle-closure',
    );
  });

  it('accepts an exact activated external-fee profile packet without closing Gate 3 itself', () => {
    const { report, authorityEvidence } = activationEvidence();
    const result = validateSettlementProfileActivationEvidence(report, authorityEvidence);

    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
    expect(result.authorityBoundary?.gate3ClosedByThisEvidence).toBe(false);
  });

  it('rejects relabelled legacy evidence without all authority transitions', () => {
    const { report, authorityEvidence } = activationEvidence();
    report.evidenceTargets.legacyRouteRetirement = 'artifact://activation/legacy-route-retirement.md';
    report.authorityBoundary.crossProfileReplayLineagePreserved = false;

    expect(validateSettlementProfileActivationEvidence(report, authorityEvidence).errors).toEqual(expect.arrayContaining([
      'settlement profile activation evidence evidenceTargets.legacyRouteRetirement must cite concrete completed evidence',
      'settlement profile activation evidence authorityBoundary.crossProfileReplayLineagePreserved must be true',
    ]));
  });

  it('rejects unknown profiles and activation target drift', () => {
    const unknown = { ...activatedProfile(), settlementProfileId: 'renamed-profile-v1' };

    expect(validateSettlementProfileBinding(unknown)).toContain(
      'settlementProfile.settlementProfileId is not a registered Gate 3 settlement profile',
    );
    expect(validateGate3ClosureProfileBinding(activatedProfile(), 'artifact://activation/completed-other.json')).toContain(
      'settlementProfile.activationEvidenceTarget must match the validated activation evidence target',
    );
    expect(validateGate3ClosureProfileBinding(
      {
        ...activatedProfile(),
        activationEvidenceTarget: '../evidence/activation/Completed-settlement-profile-activation.json',
      },
      activationTarget,
    )).toContain(
      'settlementProfile.activationEvidenceTarget must match the validated activation evidence target',
    );
  });

  it('accepts repository evidence paths but rejects absolute, escaping, and non-evidence targets', () => {
    expect(validateSettlementProfileBinding(activatedProfile())).toEqual([]);

    for (const activationEvidenceTarget of [
      ['C:', 'evidence', 'activation', 'completed-profile.json'].join('/'),
      '../../evidence/activation/completed-profile.json',
      '../evidence/../private/completed-profile.json',
      '../docs/completed-profile.json',
      'artifact://activation/../completed-profile.json',
    ]) {
      expect(validateSettlementProfileBinding({
        ...activatedProfile(),
        activationEvidenceTarget,
      })).toContain(
        'settlementProfile.activationEvidenceTarget must cite concrete completed activation evidence',
      );
    }
  });

  it('rejects authority target reuse and claim escalation', () => {
    const { report, authorityEvidence } = activationEvidence();
    report.evidenceTargets.crossProfileReplayLineage = report.evidenceTargets.legacyRouteRetirement;
    report.authorityBoundary.productionReadyClaimAllowed = true;

    expect(validateSettlementProfileActivationEvidence(report, authorityEvidence).errors).toEqual(expect.arrayContaining([
      'settlement profile activation evidence authority targets must be distinct',
      'settlement profile activation evidence authorityBoundary.productionReadyClaimAllowed must be false',
    ]));
  });

  it('binds activation identity to exact network identities', () => {
    const { report, authorityEvidence } = activationEvidence();
    report.sidechainNetwork = 'different-devnet';

    expect(validateSettlementProfileActivationEvidence(report, authorityEvidence).errors).toContain(
      'settlement profile activation evidence activationId must match the canonical activation fields',
    );

    report.sidechainNetwork = '';
    expect(validateSettlementProfileActivationEvidence(report, authorityEvidence).errors).toContain(
      'settlement profile activation evidence sidechainNetwork must identify a concrete network',
    );
  });

  it('rejects an authority target that circularly cites the activation report', () => {
    const { report, authorityEvidence } = activationEvidence();
    report.evidenceTargets.targetNodeAcceptance = report.settlementProfile.activationEvidenceTarget;
    report.activationId = computeSettlementProfileActivationId(report);

    expect(validateSettlementProfileActivationEvidence(report, authorityEvidence).errors).toContain(
      'settlement profile activation evidence authority targets must be distinct from the activation report target',
    );
  });

  it('rejects missing or relabelled structured authority evidence', () => {
    const { report, authorityEvidence } = activationEvidence();
    expect(validateSettlementProfileActivationEvidence(report).errors).toContain(
      'settlement profile activation evidence must include separately supplied structured authority evidence',
    );

    (authorityEvidence.fundsAuthorityTransition.decision as Record<string, boolean>)
      .legacyMintAuthorityDisabled = false;
    expect(validateSettlementProfileActivationEvidence(report, authorityEvidence).errors).toContain(
      'settlement profile activation authority evidence fundsAuthorityTransition.decision must expose the exact required authority facts',
    );
  });

  it('rejects ambiguous extra activation and authority fields', () => {
    const first = activationEvidence();
    (first.report as typeof first.report & { note: string }).note = 'unregistered';
    expect(validateSettlementProfileActivationEvidence(first.report, first.authorityEvidence).errors).toContain(
      'settlement profile activation evidence must expose exactly the registered fields',
    );

    const second = activationEvidence();
    (second.authorityEvidence.targetNodeAcceptance.decision as Record<string, boolean>)
      .unregisteredAuthorityFact = true;
    expect(validateSettlementProfileActivationEvidence(second.report, second.authorityEvidence).errors).toContain(
      'settlement profile activation authority evidence targetNodeAcceptance.decision must not omit or add authority facts',
    );
  });

  it('rejects authority evidence without concrete deciding identities', () => {
    const { report, authorityEvidence } = activationEvidence();
    authorityEvidence.targetNodeAcceptance.bindings.nodeResponseDigest = 'not-a-digest';

    expect(validateSettlementProfileActivationEvidence(report, authorityEvidence).errors).toEqual(expect.arrayContaining([
      'settlement profile activation authority evidence targetNodeAcceptance.bindings must expose concrete values for every required identity',
      'settlement profile activation authority evidence targetNodeAcceptance.evidenceId must match the canonical structured evidence',
    ]));
  });

  it('rejects case-malleable hexadecimal authority identities', () => {
    const { report, authorityEvidence } = activationEvidence();
    const targetEvidence = authorityEvidence.targetNodeAcceptance;
    targetEvidence.bindings.nodeResponseDigest = 'A'.repeat(64);
    targetEvidence.evidenceId = computeSettlementProfileAuthorityEvidenceId({
      ...targetEvidence,
      role: 'targetNodeAcceptance',
    });
    report.evidenceIds.targetNodeAcceptance = targetEvidence.evidenceId;
    report.activationId = computeSettlementProfileActivationId(report);

    expect(validateSettlementProfileActivationEvidence(report, authorityEvidence).errors).toContain(
      'settlement profile activation authority evidence targetNodeAcceptance.bindings must expose concrete values for every required identity',
    );
  });

  it('rejects disagreement about the activated replacement contract profile', () => {
    const { report, authorityEvidence } = activationEvidence();
    const replayEvidence = authorityEvidence.crossProfileReplayLineage;
    replayEvidence.bindings.replacementProfileDigest = 'd'.repeat(64);
    replayEvidence.evidenceId = computeSettlementProfileAuthorityEvidenceId({
      ...replayEvidence,
      role: 'crossProfileReplayLineage',
    });
    report.evidenceIds.crossProfileReplayLineage = replayEvidence.evidenceId;
    report.activationId = computeSettlementProfileActivationId(report);

    expect(validateSettlementProfileActivationEvidence(report, authorityEvidence).errors).toContain(
      'settlement profile activation authority evidence must bind one exact replacement contract profile digest',
    );
  });

  it('rejects reviewer approval predating the activation packet', () => {
    const { report, authorityEvidence } = activationEvidence();
    report.reviewer.date = '2026-07-31';
    report.activationId = computeSettlementProfileActivationId(report);

    expect(validateSettlementProfileActivationEvidence(report, authorityEvidence).errors).toContain(
      'settlement profile activation evidence reviewer.date must not predate the activation evidence',
    );
  });

  it('rejects impossible activation and reviewer calendar dates', () => {
    const impossibleTimestamp = activationEvidence();
    impossibleTimestamp.report.generatedAt = '2026-02-31T10:00:00.000Z';
    impossibleTimestamp.report.activationId = computeSettlementProfileActivationId(impossibleTimestamp.report);
    expect(validateSettlementProfileActivationEvidence(
      impossibleTimestamp.report,
      impossibleTimestamp.authorityEvidence,
    ).errors).toContain(
      'settlement profile activation evidence generatedAt must be an ISO UTC timestamp',
    );

    const impossibleReviewerDate = activationEvidence();
    impossibleReviewerDate.report.reviewer.date = '2026-02-31';
    impossibleReviewerDate.report.activationId = computeSettlementProfileActivationId(impossibleReviewerDate.report);
    expect(validateSettlementProfileActivationEvidence(
      impossibleReviewerDate.report,
      impossibleReviewerDate.authorityEvidence,
    ).errors).toContain(
      'settlement profile activation evidence reviewer.date must be an ISO calendar date',
    );
  });

  it('rejects sensitive activation evidence targets without echoing them', () => {
    for (const target of [
      'artifact://activation/C:/private/completed-profile.json',
      'artifact://activation/private-key/completed-profile.json',
      '../evidence/activation/private-key/completed-profile.json',
    ]) {
      expect(validateSettlementProfileBinding({
        ...activatedProfile(),
        activationEvidenceTarget: target,
      })).toContain(
        'settlementProfile.activationEvidenceTarget must cite concrete completed activation evidence',
      );
    }
  });
});
