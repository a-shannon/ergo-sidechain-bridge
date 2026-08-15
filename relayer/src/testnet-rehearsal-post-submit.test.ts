import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

import {
  buildTestnetRehearsalPostSubmitEvidence,
  LEGACY_V1_POST_SUBMIT_QUARANTINE,
  type TestnetRehearsalPostSubmitInput,
} from './testnet-rehearsal-post-submit.js';
import { LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE } from './testnet-rehearsal-live-preflight.js';

const EXPECTED_TX_ID = '1'.repeat(64);
const BURN_TX_ID = '2'.repeat(64);
const BURN_TX_ID_B = '3'.repeat(64);
const OUTPUT_BOX_ID = '4'.repeat(64);
const DUP_SUCCESSOR_BOX_ID = '5'.repeat(64);
const SPV_TRACKER_SUCCESSOR_BOX_ID = '6'.repeat(64);
const RECIPIENT_PAYOUT_BOX_ID = '7'.repeat(64);
const RECIPIENT_PAYOUT_BOX_ID_B = '8'.repeat(64);
const FINALITY_EVIDENCE_ARTIFACT = 'artifact://live-rehearsal/finality.log';

function livePreflightReport(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    status: 'GO',
    errors: [],
    expectedTxId: EXPECTED_TX_ID,
    runtimeBroadcastEnabled: false,
    targetBindings: {
      rehearsal: 'evidence/live-rehearsals/live-window.md',
      approvals: 'evidence/testnet-prebroadcast/aggregate-approvals-v2.json',
      transcript: 'artifact://live/live-preflight.log',
    },
    preSubmitBoundary: {
      reportAuthorizesBroadcast: false,
      liveSubmitPerformed: false,
      confirmationObserved: false,
      reconciliationPerformed: false,
      gate3ClosureAllowed: false,
      productionReadyClaimAllowed: false,
      testnetProductionCandidateClaimAllowed: false,
    },
    authorizationEvidence: {
      reviewerApproval: 'linked',
      userApproval: 'linked',
      scopedBroadcastShell: 'linked',
      readinessAfterEnable: 'linked',
      broadcastPolicyPass: 'linked',
      liveSettlementReadinessPass: 'linked',
      networkReconfirmation: 'linked',
      approvalJsonBinding: 'matched',
      releaseGateTranscriptLine: 'emitted',
    },
    approvalBinding: {
      command: 'check-batch',
      mode: 'batch',
      expectedTxId: EXPECTED_TX_ID,
      burnTxHashes: [BURN_TX_ID, BURN_TX_ID_B],
      bridgeEventRootHexes: ['9'.repeat(64), 'a'.repeat(64)],
      environment: 'testnet',
      ergoNodeNetwork: 'testnet',
      sidechainNetwork: 'patched-devnet',
      deployedStateHash: 'b'.repeat(64),
    },
    lines: [
      `npm run rehearsal:live-preflight command output: artifact://live/live-preflight.log PASS exit code 0 Expected transaction ID ${EXPECTED_TX_ID}`,
    ],
    ...overrides,
  };
}

function validInput(overrides: Partial<TestnetRehearsalPostSubmitInput> = {}): TestnetRehearsalPostSubmitInput {
  return {
    expectedTxId: EXPECTED_TX_ID,
    submittedTxId: EXPECTED_TX_ID,
    burnTxIds: [BURN_TX_ID, BURN_TX_ID_B],
    submissionArtifact: 'artifact://live-rehearsal/submit.log',
    confirmationArtifact: 'artifact://live-rehearsal/confirmation.log',
    finalityEvidenceArtifact: FINALITY_EVIDENCE_ARTIFACT,
    reconciliationArtifact: 'artifact://live-rehearsal/reconciliation.log',
    submissionTimestamp: '2026-05-17T14:45:00Z',
    firstObservedMempoolHeight: 100,
    confirmationHeight: 103,
    confirmationCount: 4,
    confirmationsRequired: 3,
    settlementOutputBoxIds: [
      SPV_TRACKER_SUCCESSOR_BOX_ID,
      DUP_SUCCESSOR_BOX_ID,
      RECIPIENT_PAYOUT_BOX_ID,
      RECIPIENT_PAYOUT_BOX_ID_B,
      OUTPUT_BOX_ID,
    ],
    dupSuccessorBoxId: DUP_SUCCESSOR_BOX_ID,
    spvTrackerSuccessorBoxId: SPV_TRACKER_SUCCESSOR_BOX_ID,
    recipientPayoutBoxId: RECIPIENT_PAYOUT_BOX_ID,
    recipientPayoutBoxIds: [RECIPIENT_PAYOUT_BOX_ID, RECIPIENT_PAYOUT_BOX_ID_B],
    feeNanoErg: '1100000',
    pegOutStatus: 'settled',
    failedEventQueue: 'empty',
    manualRepairPerformed: 'no',
    livePreflightReport: livePreflightReport(),
    livePreflightReportTarget: 'evidence/live-rehearsals/live-preflight.json',
    ...overrides,
  };
}

describe('testnet rehearsal post-submit evidence', () => {
  it('blocks new post-submit evidence from a quarantined legacy V1 live-preflight report', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      livePreflightReport: livePreflightReport(),
      livePreflightReportTarget: 'evidence/live-rehearsals/live-preflight.json',
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.observation).toBeUndefined();
    expect(report.errors).toContain(LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE);
    expect(report.errors).toContain(LEGACY_V1_POST_SUBMIT_QUARANTINE);
  });

  it('blocks evidence when the singular payout box does not match the first payout box in the batch set', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      recipientPayoutBoxId: RECIPIENT_PAYOUT_BOX_ID_B,
      recipientPayoutBoxIds: [RECIPIENT_PAYOUT_BOX_ID, RECIPIENT_PAYOUT_BOX_ID_B],
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain('Recipient payout box ID must match the first recipient payout box IDs entry');
  });

  it('blocks evidence when batch payout box IDs are duplicated', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      recipientPayoutBoxIds: [RECIPIENT_PAYOUT_BOX_ID, RECIPIENT_PAYOUT_BOX_ID],
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain('Recipient payout box IDs must be unique');
  });

  it('blocks evidence when batch burn transaction IDs are duplicated', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      burnTxIds: [BURN_TX_ID, BURN_TX_ID],
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain('Peg-out burn TX IDs must be unique');
  });

  it('blocks evidence when batch burns and recipient payouts do not align one-to-one', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      burnTxIds: [BURN_TX_ID, BURN_TX_ID_B],
      recipientPayoutBoxIds: [RECIPIENT_PAYOUT_BOX_ID],
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain('Peg-out burn TX ID count must match recipient payout box ID count');
  });

  it('blocks evidence when settlement outputs do not contain successors and payouts', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      settlementOutputBoxIds: [OUTPUT_BOX_ID],
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain('Settlement output box IDs must include DUP successor box ID');
    expect(report.errors).toContain('Settlement output box IDs must include SPV tracker successor box ID');
    expect(report.errors).toContain('Settlement output box IDs must include every recipient payout box ID');
  });

  it('blocks evidence when submitted transaction ID differs from the expected transaction ID', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      submittedTxId: '8'.repeat(64),
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain('Submitted transaction ID must match Expected transaction ID');
  });

  it('blocks unsafe miner fee nanoERG amounts before rendering evidence', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      feeNanoErg: '9007199254740993',
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.observation).toBeUndefined();
    expect(report.errors).toContain('Miner fee output feeNanoErg must be a positive safe integer');
  });

  it('blocks post-submit evidence when the burn order differs from the approved live-preflight report', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      burnTxIds: [BURN_TX_ID_B, BURN_TX_ID],
      livePreflightReport: livePreflightReport({
        approvalBinding: {
          command: 'check-batch',
          mode: 'batch',
          expectedTxId: EXPECTED_TX_ID,
          burnTxHashes: [BURN_TX_ID, BURN_TX_ID_B],
          bridgeEventRootHexes: ['9'.repeat(64), 'a'.repeat(64)],
          environment: 'testnet',
          ergoNodeNetwork: 'testnet',
          sidechainNetwork: 'patched-devnet',
          deployedStateHash: 'b'.repeat(64),
        },
      }),
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain(
      'Live-preflight report approvalBinding.burnTxHashes must match post-submit peg-out burn TX IDs in order',
    );
  });

  it('blocks post-submit evidence when a linked live-preflight report does not bind the same session', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      livePreflightReport: livePreflightReport({
        status: 'BLOCKED',
        errors: ['missing approval binding'],
        expectedTxId: '9'.repeat(64),
        preSubmitBoundary: {
          reportAuthorizesBroadcast: true,
          liveSubmitPerformed: false,
          confirmationObserved: false,
          reconciliationPerformed: false,
          gate3ClosureAllowed: false,
          productionReadyClaimAllowed: false,
          testnetProductionCandidateClaimAllowed: false,
        },
        authorizationEvidence: {
          reviewerApproval: 'blocked',
          userApproval: 'blocked',
          scopedBroadcastShell: 'blocked',
          readinessAfterEnable: 'blocked',
          broadcastPolicyPass: 'blocked',
          liveSettlementReadinessPass: 'blocked',
          networkReconfirmation: 'blocked',
          approvalJsonBinding: 'blocked',
          releaseGateTranscriptLine: 'blocked',
        },
        lines: ['npm run rehearsal:live-preflight command output: artifact://live/live-preflight.log PASS exit code 0'],
      }),
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain('Live-preflight report status must be GO');
    expect(report.errors).toContain(
      'Live-preflight report Expected transaction ID must match post-submit Expected transaction ID',
    );
    expect(report.errors).toContain('Live-preflight report preSubmitBoundary.reportAuthorizesBroadcast must be false');
    expect(report.errors).toContain('Live-preflight report authorizationEvidence.reviewerApproval must be linked');
    expect(report.errors).toContain('Live-preflight report authorizationEvidence.approvalJsonBinding must be matched');
    expect(report.errors).toContain('Live-preflight report authorizationEvidence.releaseGateTranscriptLine must be emitted');
    expect(report.errors).toContain(
      'Live-preflight report lines must include PASS transcript output bound to Expected transaction ID',
    );
  });

  it('blocks post-submit evidence when the linked live-preflight PASS line carries failure markers', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      livePreflightReport: livePreflightReport({
        lines: [
          `npm run rehearsal:live-preflight command output: artifact://live/live-preflight.log ` +
            `FAIL readiness regression before approval PASS exit code 0 Expected transaction ID ${EXPECTED_TX_ID}`,
        ],
      }),
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain(
      'Live-preflight report lines must include internally positive PASS transcript output bound to Expected transaction ID',
    );

    const compatibilityReport = buildTestnetRehearsalPostSubmitEvidence(validInput({
      livePreflightReport: livePreflightReport({
        lines: [
          `npm run rehearsal:live-preflight command output: artifact://live/live-preflight.log ` +
            `PASS exit code 0 validation\uFF1A \uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue ` +
            `Expected transaction ID ${EXPECTED_TX_ID}`,
        ],
      }),
    }));

    expect(compatibilityReport.status).toBe('BLOCKED');
    expect(compatibilityReport.markdown).toBeUndefined();
    expect(compatibilityReport.errors).toContain(
      'Live-preflight report lines must include internally positive PASS transcript output bound to Expected transaction ID',
    );

    const structuredTotalReport = buildTestnetRehearsalPostSubmitEvidence(validInput({
      livePreflightReport: livePreflightReport({
        lines: [
          `npm run rehearsal:live-preflight command output: artifact://live/live-preflight.log ` +
            `PASS exit code 0 errorsTotal=1 failures_total: 2 Expected transaction ID ${EXPECTED_TX_ID}`,
        ],
      }),
    }));

    expect(structuredTotalReport.status).toBe('BLOCKED');
    expect(structuredTotalReport.markdown).toBeUndefined();
    expect(structuredTotalReport.errors).toContain(
      'Live-preflight report lines must include internally positive PASS transcript output bound to Expected transaction ID',
    );
  });

  it('blocks post-submit evidence when the live-preflight report escalates claim boundaries', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      livePreflightReport: livePreflightReport({
        preSubmitBoundary: {
          reportAuthorizesBroadcast: false,
          liveSubmitPerformed: false,
          confirmationObserved: false,
          reconciliationPerformed: false,
          gate3ClosureAllowed: false,
          productionReadyClaimAllowed: true,
          testnetProductionCandidateClaimAllowed: true,
        },
      }),
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain(
      'Live-preflight report preSubmitBoundary.productionReadyClaimAllowed must be false',
    );
    expect(report.errors).toContain(
      'Live-preflight report preSubmitBoundary.testnetProductionCandidateClaimAllowed must be false',
    );
  });

  it('blocks evidence when the live-preflight report is missing', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      livePreflightReport: undefined,
      livePreflightReportTarget: undefined,
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain('Live-preflight report target is required');
    expect(report.errors).toContain('Live-preflight report is required');
  });

  it('blocks unsafe CLI Markdown output targets before reading live-preflight JSON inputs', () => {
    const outTarget = '../operator/private-key-evidence.md';
    const livePreflightTarget = 'missing-live-preflight-report.json';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-rehearsal-post-submit.ts',
        ...postSubmitCliArgs([
          '--live-preflight-report',
          livePreflightTarget,
          '--out',
          outTarget,
        ]),
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--out <blocked output target> must not target runtime or secret-bearing material');
    expect(result.stderr).not.toContain(outTarget);
    expect(result.stderr).not.toContain(livePreflightTarget);
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('keeps CLI Markdown output guard before live-preflight JSON reads', () => {
    const source = readFileSync(
      new URL('./scripts/testnet-rehearsal-post-submit.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;');
    expect(source).toContain('const livePreflightReport = args.livePreflightReport');
    expect(source.indexOf('const outputTarget = args.out ? resolveEvidenceOutputPath(args.out) : undefined;')).toBeLessThan(
      source.indexOf('const livePreflightReport = args.livePreflightReport'),
    );
  });

  it('blocks evidence when the live-preflight report target is a template', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      livePreflightReportTarget: '<live-preflight-report.json>',
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain('Live-preflight report target must not be a template, placeholder, or non-concrete target');
  });

  it('blocks shell-unsafe live-preflight report targets before exposing post-submit evidence', () => {
    const livePreflightReportTarget = 'evidence/live rehearsals/live-preflight report.json';
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      livePreflightReportTarget,
    }));
    const serialized = JSON.stringify(report);

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.observation).toBeUndefined();
    expect(report.errors).toContain(
      'Live-preflight report target must not contain whitespace or shell metacharacters',
    );
    expect(serialized).not.toContain(livePreflightReportTarget);
  });

  it('blocks row-named non-concrete post-submit and live-preflight report targets', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      submissionArtifact: 'artifact://live-rehearsal/generic-submit.log',
      confirmationArtifact: 'artifact://live-rehearsal/generic-confirmation.log',
      finalityEvidenceArtifact: 'artifact://live-rehearsal/generic-finality.log',
      reconciliationArtifact: 'artifact://live-rehearsal/generic-reconciliation.log',
      livePreflightReportTarget: 'evidence/live-rehearsals/generic-live-preflight.json',
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toEqual(expect.arrayContaining([
      'submission artifact must not be a template, placeholder, or non-concrete target',
      'confirmation artifact must not be a template, placeholder, or non-concrete target',
      'finality evidence artifact must not be a template, placeholder, or non-concrete target',
      'reconciliation artifact must not be a template, placeholder, or non-concrete target',
      'Live-preflight report target must not be a template, placeholder, or non-concrete target',
    ]));

    const fixtureReport = buildTestnetRehearsalPostSubmitEvidence(validInput({
      submissionArtifact: 'artifact://live-rehearsal/fixture-submit.log',
      confirmationArtifact: 'artifact://live-rehearsal/mock-confirmation.log',
      finalityEvidenceArtifact: 'artifact://live-rehearsal/dummy-finality.log',
      reconciliationArtifact: 'artifact://live-rehearsal/fake-reconciliation.log',
      livePreflightReportTarget: 'evidence/live-rehearsals/testdata-live-preflight.json',
    }));

    expect(fixtureReport.status).toBe('BLOCKED');
    expect(fixtureReport.markdown).toBeUndefined();
    expect(fixtureReport.errors).toEqual(expect.arrayContaining([
      'submission artifact must not be a template, placeholder, or non-concrete target',
      'confirmation artifact must not be a template, placeholder, or non-concrete target',
      'finality evidence artifact must not be a template, placeholder, or non-concrete target',
      'reconciliation artifact must not be a template, placeholder, or non-concrete target',
      'Live-preflight report target must not be a template, placeholder, or non-concrete target',
    ]));

    const syntheticReport = buildTestnetRehearsalPostSubmitEvidence(validInput({
      submissionArtifact: 'artifact://live-rehearsal/completed-synthetic-submit.log',
      confirmationArtifact: 'artifact://live-rehearsal/completed-synthetic-confirmation.log',
      finalityEvidenceArtifact: 'artifact://live-rehearsal/completed-synthetic-finality.log',
      reconciliationArtifact: 'artifact://live-rehearsal/completed-synthetic-reconciliation.log',
      livePreflightReportTarget: 'evidence/live-rehearsals/completed-synthetic-live-preflight.json',
    }));

    expect(syntheticReport.status).toBe('BLOCKED');
    expect(syntheticReport.markdown).toBeUndefined();
    expect(syntheticReport.errors).toEqual(expect.arrayContaining([
      'submission artifact must not be a template, placeholder, or non-concrete target',
      'confirmation artifact must not be a template, placeholder, or non-concrete target',
      'finality evidence artifact must not be a template, placeholder, or non-concrete target',
      'reconciliation artifact must not be a template, placeholder, or non-concrete target',
      'Live-preflight report target must not be a template, placeholder, or non-concrete target',
    ]));

    const simulatedReport = buildTestnetRehearsalPostSubmitEvidence(validInput({
      submissionArtifact: 'artifact://live-rehearsal/completed-simulated-submit.log',
      confirmationArtifact: 'artifact://live-rehearsal/completed-simulated-confirmation.log',
      finalityEvidenceArtifact: 'artifact://live-rehearsal/completed-simulated-finality.log',
      reconciliationArtifact: 'artifact://live-rehearsal/completed-simulated-reconciliation.log',
      livePreflightReportTarget: 'evidence/live-rehearsals/completed-simulated-live-preflight.json',
    }));

    expect(simulatedReport.status).toBe('BLOCKED');
    expect(simulatedReport.markdown).toBeUndefined();
    expect(simulatedReport.errors).toEqual(expect.arrayContaining([
      'submission artifact must not be a template, placeholder, or non-concrete target',
      'confirmation artifact must not be a template, placeholder, or non-concrete target',
      'finality evidence artifact must not be a template, placeholder, or non-concrete target',
      'reconciliation artifact must not be a template, placeholder, or non-concrete target',
      'Live-preflight report target must not be a template, placeholder, or non-concrete target',
    ]));

    const templateReport = buildTestnetRehearsalPostSubmitEvidence(validInput({
      submissionArtifact: 'artifact://live-rehearsal/template-submit.log',
      confirmationArtifact: 'artifact://live-rehearsal/sample-confirmation.log',
      finalityEvidenceArtifact: 'artifact://live-rehearsal/example-finality.log',
      reconciliationArtifact: 'artifact://live-rehearsal/template-reconciliation.log',
      livePreflightReportTarget: 'evidence/live-rehearsals/template-live-preflight.json',
    }));

    expect(templateReport.status).toBe('BLOCKED');
    expect(templateReport.markdown).toBeUndefined();
    expect(templateReport.errors).toEqual(expect.arrayContaining([
      'submission artifact must not be a template, placeholder, or non-concrete target',
      'confirmation artifact must not be a template, placeholder, or non-concrete target',
      'finality evidence artifact must not be a template, placeholder, or non-concrete target',
      'reconciliation artifact must not be a template, placeholder, or non-concrete target',
      'Live-preflight report target must not be a template, placeholder, or non-concrete target',
    ]));
  });

  it('blocks claim-escalating post-submit and live-preflight report targets', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      submissionArtifact: 'artifact://live-rehearsal/testnet-production-candidate-submit.log',
      confirmationArtifact: 'artifact://live-rehearsal/testnet-production-candidate-confirmation.log',
      finalityEvidenceArtifact: 'artifact://live-rehearsal/testnet-production-candidate-finality.log',
      reconciliationArtifact: 'artifact://live-rehearsal/testnet-production-candidate-reconciliation.log',
      livePreflightReportTarget: 'evidence/live-rehearsals/testnet-production-candidate-live-preflight.json',
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toEqual(expect.arrayContaining([
      'submission artifact must not be a template, placeholder, or non-concrete target',
      'confirmation artifact must not be a template, placeholder, or non-concrete target',
      'finality evidence artifact must not be a template, placeholder, or non-concrete target',
      'reconciliation artifact must not be a template, placeholder, or non-concrete target',
      'Live-preflight report target must not be a template, placeholder, or non-concrete target',
    ]));
  });

  it('still blocks concrete audit targets when their legacy V1 preflight is quarantined', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      submissionArtifact: 'artifact://live-rehearsal/sample-size-analysis-submit.log',
      confirmationArtifact: 'artifact://live-rehearsal/template-removal-audit-confirmation.log',
      finalityEvidenceArtifact: 'artifact://live-rehearsal/sample-size-analysis-finality.log',
      reconciliationArtifact: 'artifact://live-rehearsal/template-removal-audit-reconciliation.log',
      livePreflightReportTarget: 'evidence/live-rehearsals/template-removal-audit-live-preflight.json',
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain(LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE);
  });

  it('blocks evidence when confirmation policy is not satisfied', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      confirmationCount: 2,
      confirmationsRequired: 3,
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('Observed confirmation count must be greater than or equal to required confirmation count');
  });

  it('blocks template or sensitive artifact targets', () => {
    const blockedSecretName = `secrets.${'dlog'}`;
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      confirmationArtifact: '<artifact://template/confirmation.log>',
      finalityEvidenceArtifact: 'artifact://live-rehearsal/finality-todo.log',
      reconciliationArtifact: `artifact://live-rehearsal/${blockedSecretName}`,
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.errors).toContain('confirmation artifact must be a completed artifact:// target');
    expect(report.errors).toContain('confirmation artifact must not be a template, placeholder, or non-concrete target');
    expect(report.errors).toContain('finality evidence artifact must not be a template, placeholder, or non-concrete target');
    expect(report.errors).toContain('reconciliation artifact must not reference local runtime or secret-bearing material');
  });

  it.each([
    'evidence/live-rehearsals/operator/signing-key-live-preflight.json',
    'evidence/live-rehearsals/operator/api-key-live-preflight.json',
    'evidence/live-rehearsals/operator/seed-phrase-live-preflight.json',
    'evidence/live-rehearsals/runtime/deployed_state.json',
  ])('blocks sensitive live-preflight report target %s', target => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      livePreflightReportTarget: target,
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain('Live-preflight report target must not reference local runtime or secret-bearing material');
    expect(report.errors.join('\n')).not.toContain(target);
  });

  it.each([
    'artifact://live-rehearsal/operator/signing-key-submit.log',
    'artifact://live-rehearsal/operator/api-key-confirmation.log',
    'artifact://live-rehearsal/operator/seed-phrase-reconciliation.log',
    'artifact://live-rehearsal/runtime/deployed_state.json',
  ])('blocks sensitive post-submit artifact target %s', target => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      reconciliationArtifact: target,
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain('reconciliation artifact must not reference local runtime or secret-bearing material');
    expect(report.errors.join('\n')).not.toContain(target);
  });

  it('blocks punctuation-wrapped sensitive post-submit targets', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      livePreflightReportTarget: 'evidence/live-rehearsals/sourceTarget=(bridge-state.sqlite).json',
      reconciliationArtifact: 'artifact://live-rehearsal/sourceTarget=(.env)',
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain('Live-preflight report target must not reference local runtime or secret-bearing material');
    expect(report.errors).toContain('reconciliation artifact must not reference local runtime or secret-bearing material');
  });

  it('blocks URI-encoded sensitive post-submit targets', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      livePreflightReportTarget: 'evidence/live-rehearsals/sourceTarget=%28runtime%2Fbridge-state.sqlite%29.json',
      reconciliationArtifact: 'artifact://live-rehearsal/sourceTarget=%28.env%29/reconciliation.log',
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain('Live-preflight report target must not reference local runtime or secret-bearing material');
    expect(report.errors).toContain('reconciliation artifact must not reference local runtime or secret-bearing material');
  });

  it('blocks URI-encoded local-only post-submit targets', () => {
    const encodedLivePreflightTarget = [
      'file%3A%2F%2F%2F',
      'C%3A%2F',
      'tmp%2F',
      'live-preflight.json',
    ].join('');
    const encodedReconciliationTarget = [
      'artifact://live-rehearsal/sourceTarget=%2F',
      'tmp%2F',
      'reconciliation.log',
    ].join('');
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      livePreflightReportTarget: encodedLivePreflightTarget,
      reconciliationArtifact: encodedReconciliationTarget,
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain('Live-preflight report target must not reference local runtime or secret-bearing material');
    expect(report.errors).toContain('reconciliation artifact must not reference local runtime or secret-bearing material');
    expect(report.errors.join('\n')).not.toContain(encodedLivePreflightTarget);
    expect(report.errors.join('\n')).not.toContain(encodedReconciliationTarget);
  });

  it('blocks incomplete or reused post-submit evidence targets', () => {
    const report = buildTestnetRehearsalPostSubmitEvidence(validInput({
      submissionArtifact: 'artifact://live-rehearsal/submit-todo.log',
      confirmationArtifact: 'artifact://live-rehearsal/shared-confirmation.log',
      finalityEvidenceArtifact: 'artifact://live-rehearsal/shared-confirmation.log',
      reconciliationArtifact: 'artifact://live-rehearsal/shared-confirmation.log',
      livePreflightReportTarget: 'evidence/live-rehearsals/live-preflight-placeholder.json',
    }));

    expect(report.status).toBe('BLOCKED');
    expect(report.markdown).toBeUndefined();
    expect(report.errors).toContain('submission artifact must not be a template, placeholder, or non-concrete target');
    expect(report.errors).toContain('Live-preflight report target must not be a template, placeholder, or non-concrete target');
    expect(report.errors).toContain(
      'Post-submit artifact targets must be distinct: confirmation artifact and finality evidence artifact reuse the same evidence target',
    );
    expect(report.errors).toContain(
      'Post-submit artifact targets must be distinct: confirmation artifact and reconciliation artifact reuse the same evidence target',
    );
  });
});

function postSubmitCliArgs(overrides: string[] = []): string[] {
  return [
    '--expected-tx-id',
    EXPECTED_TX_ID,
    '--submitted-tx-id',
    EXPECTED_TX_ID,
    '--burn-tx-id',
    BURN_TX_ID,
    '--burn-tx-id',
    BURN_TX_ID_B,
    '--submission-artifact',
    'artifact://live-rehearsal/submit.log',
    '--confirmation-artifact',
    'artifact://live-rehearsal/confirmation.log',
    '--finality-evidence-artifact',
    FINALITY_EVIDENCE_ARTIFACT,
    '--reconciliation-artifact',
    'artifact://live-rehearsal/reconciliation.log',
    '--submission-timestamp',
    '2026-05-17T14:45:00Z',
    '--first-observed-mempool-height',
    '100',
    '--confirmation-height',
    '103',
    '--confirmation-count',
    '4',
    '--confirmations-required',
    '3',
    '--settlement-output-box-id',
    SPV_TRACKER_SUCCESSOR_BOX_ID,
    '--settlement-output-box-id',
    DUP_SUCCESSOR_BOX_ID,
    '--settlement-output-box-id',
    RECIPIENT_PAYOUT_BOX_ID,
    '--settlement-output-box-id',
    RECIPIENT_PAYOUT_BOX_ID_B,
    '--settlement-output-box-id',
    OUTPUT_BOX_ID,
    '--dup-successor-box-id',
    DUP_SUCCESSOR_BOX_ID,
    '--spv-tracker-successor-box-id',
    SPV_TRACKER_SUCCESSOR_BOX_ID,
    '--recipient-payout-box-id',
    RECIPIENT_PAYOUT_BOX_ID,
    '--recipient-payout-box-id',
    RECIPIENT_PAYOUT_BOX_ID_B,
    '--fee-nanoerg',
    '1100000',
    '--peg-out-status',
    'settled',
    '--failed-event-queue',
    'empty',
    '--manual-repair-performed',
    'no',
    ...overrides,
  ];
}
