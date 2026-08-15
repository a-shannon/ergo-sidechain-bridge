import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  LEGACY_V1_LIVE_PREFLIGHT_PROFILE,
  LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE,
  preflightTestnetRehearsalLive,
  validateLivePreflightJsonReport,
} from './testnet-rehearsal-live-preflight.js';
import { writeOfflineReportJson } from './offline-report-json.js';
import {
  buildAggregateSettlementPrebroadcastEvidenceRecord,
  type AggregateSettlementPrebroadcastClaimEvidence,
} from './aggregate-settlement-evidence.js';
import { TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY } from './aggregate-settlement-evidence.test-helper.js';

const EXPECTED_TX_ID = '4'.repeat(64);
const OTHER_TX_ID = '5'.repeat(64);
const PEG_OUT_BURN_TX_ID = '1'.repeat(64);
const OTHER_PEG_OUT_BURN_TX_ID = '2'.repeat(64);
const SIDECHAIN_BLOCK_HASH = '6'.repeat(64);
const SIDECHAIN_BLOCK_HASH_B = 'c'.repeat(64);
const BRIDGE_EVENT_ROOT = '7'.repeat(64);
const BRIDGE_EVENT_ROOT_B = 'd'.repeat(64);
const DEPLOYMENT_STATE_HASH = '8'.repeat(64);
const OTHER_DEPLOYMENT_STATE_HASH = '9'.repeat(64);
const CONTRACT_ID = 'a'.repeat(64);
const SINGLETON_ID = 'b'.repeat(64);
const NOW = new Date('2026-05-17T10:30:00.000Z');
const TRANSCRIPT_TARGET = 'artifact://live/live-preflight.log';

function overCapBurnTxHashes(): string[] {
  return Array.from({ length: 11 }, (_, index) => (0x10 + index).toString(16).repeat(32));
}

function overCapBridgeEventRootHexes(): string[] {
  return Array.from({ length: 11 }, (_, index) => (0x40 + index).toString(16).repeat(32));
}

function aggregateEvidenceRecord(overrides: {
  command?: string;
  claims?: AggregateSettlementPrebroadcastClaimEvidence[];
  expectedTxId?: string;
  bridgeEventRootHex?: string;
  sidechainHeaderHashHex?: string;
  ergoAnchorHeight?: number;
} = {}) {
  const command = overrides.command ?? 'check-with-ingest';
  const claims = overrides.claims ?? [{
    burnTxHash: PEG_OUT_BURN_TX_ID,
    sidechainBlockHeight: 200,
    sidechainHeaderHashHex: overrides.sidechainHeaderHashHex ?? SIDECHAIN_BLOCK_HASH,
    bridgeEventRootHex: overrides.bridgeEventRootHex ?? BRIDGE_EVENT_ROOT,
    ergoAnchorHeight: overrides.ergoAnchorHeight ?? 100,
  }];
  return buildAggregateSettlementPrebroadcastEvidenceRecord({
    generatedAt: '2026-05-17T10:20:00.000Z',
    command,
    label: 'live preflight aggregate check fixture',
    expectedTxId: overrides.expectedTxId ?? EXPECTED_TX_ID,
    transactionCheckResponse: '',
    checkerIdentity: {
      ...TEST_AGGREGATE_SETTLEMENT_CHECKER_IDENTITY,
      nodeOrigin: 'http://localhost:9053',
    },
    settlementShape: {
      inputCount: command === 'check-batch' ? 4 : 3,
      outputCount: 4,
      contextExtensionKeyCounts: command === 'check-batch' ? [0, 4, 4, 2] : [0, 4, 2],
      contextExtensionKeyCountsCsv: command === 'check-batch' ? '0,4,4,2' : '0,4,2',
    },
    claims,
  });
}

function singleDryRunSettlementEvidence(): string {
  return `- Peg-out burn TX ID: ${PEG_OUT_BURN_TX_ID} artifact://dry-run/peg-out-burn.log
- Expected transaction ID: ${EXPECTED_TX_ID} artifact://dry-run/expected-tx.log
- Bridge event root: ${BRIDGE_EVENT_ROOT} artifact://dry-run/bridge-event-root.log
- Daemon approval evidence: artifact://dry-run/daemon-approval-prep.log versioned approval file version 2 runtime context binding ergoNodeUrl http://localhost:9053 sidechainRpcUrl http://localhost:8545 sidechainWsUrl ws://localhost:9944 deployedStateHash ${DEPLOYMENT_STATE_HASH} mode single-with-ingest active approval window non-mainnet networks npm run settle:aggregate -- check-with-ingest ${PEG_OUT_BURN_TX_ID} ${SIDECHAIN_BLOCK_HASH} ${BRIDGE_EVENT_ROOT} 100 checkEvidence artifact://dry-run/check.log Expected transaction ID ${EXPECTED_TX_ID} peg-out burn TX ID ${PEG_OUT_BURN_TX_ID}`;
}

function batchClaims(roots = [BRIDGE_EVENT_ROOT, BRIDGE_EVENT_ROOT_B]): AggregateSettlementPrebroadcastClaimEvidence[] {
  return [
    {
      burnTxHash: PEG_OUT_BURN_TX_ID,
      sidechainBlockHeight: 200,
      sidechainHeaderHashHex: SIDECHAIN_BLOCK_HASH,
      bridgeEventRootHex: roots[0],
      ergoAnchorHeight: 100,
    },
    {
      burnTxHash: OTHER_PEG_OUT_BURN_TX_ID,
      sidechainBlockHeight: 201,
      sidechainHeaderHashHex: SIDECHAIN_BLOCK_HASH_B,
      bridgeEventRootHex: roots[1],
      ergoAnchorHeight: 101,
    },
  ];
}

function batchAggregateEvidenceRecord(roots = [BRIDGE_EVENT_ROOT, BRIDGE_EVENT_ROOT_B]) {
  return aggregateEvidenceRecord({
    command: 'check-batch',
    claims: batchClaims(roots),
  });
}

function batchDryRunSettlementEvidence(
  roots = [BRIDGE_EVENT_ROOT, BRIDGE_EVENT_ROOT_B],
): string {
  const burnSet = `${PEG_OUT_BURN_TX_ID},${OTHER_PEG_OUT_BURN_TX_ID}`;
  return `- Peg-out burn TX ID: ${burnSet} artifact://dry-run/peg-out-burn-batch.log
- Expected transaction ID: ${EXPECTED_TX_ID} artifact://dry-run/expected-tx.log
- Bridge event roots: ${roots.join(',')} artifact://dry-run/bridge-event-roots.log
- Daemon approval evidence: artifact://dry-run/daemon-approval-prep.log versioned approval file version 2 runtime context binding ergoNodeUrl http://localhost:9053 sidechainRpcUrl http://localhost:8545 sidechainWsUrl ws://localhost:9944 deployedStateHash ${DEPLOYMENT_STATE_HASH} mode batch active approval window non-mainnet networks npm run settle:aggregate -- check-batch ${PEG_OUT_BURN_TX_ID} ${OTHER_PEG_OUT_BURN_TX_ID} check-batch evidence for batch mode checkEvidence artifact://dry-run/check-batch.log Expected transaction ID ${EXPECTED_TX_ID} ordered burn set ${burnSet}`;
}

function completedLiveRehearsal(
  overrides: Record<string, string> = {},
  dryRunEvidence = singleDryRunSettlementEvidence(),
): string {
  const broadcast = {
    'Reviewer approval recorded':
      `reviewer-a explicit live broadcast approval for Expected transaction ID ${EXPECTED_TX_ID} artifact://live/reviewer-approval.md`,
    'User approval recorded':
      `user explicit live broadcast approval for Expected transaction ID ${EXPECTED_TX_ID} artifact://live/user-approval.md`,
    '`BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell':
      'yes BRIDGE_BROADCAST_ENABLED=true only in the intended shell scoped to the live rehearsal shell artifact://live/scoped-shell.log',
    'Readiness command re-run after enabling broadcast':
      'npm run demo:readiness PASS artifact://live/demo-readiness-after-enable.log',
    'Broadcast policy reports `PASS`':
      'npm run demo:readiness output [PASS] Broadcast policy: Ergo transaction broadcast is explicitly enabled artifact://live/broadcast-policy.log',
    'Live settlement readiness reports `PASS`':
      'npm run demo:readiness output [PASS] Live settlement signing: checked settlement paths artifact://live/live-settlement-signing.log',
    'Node URL and network re-confirmed':
      'Node URL http://localhost:9053; Ergo node network testnet; Sidechain network patched-devnet artifact://live/node-network-reconfirmed.log',
    ...overrides,
  };

  return `# Testnet Live Rehearsal

## Session Metadata

- Date: 2026-05-17
- Operator: operator-a
- Reviewer: reviewer-a
- Environment: testnet
- Git commit: abc1234
- Release level being evaluated: institutional reference
- Ergo node network: testnet
- Sidechain network: patched-devnet
- Broadcast mode at start: disabled
- Broadcast mode at end: disabled

## Lifecycle Gate Classification

| Release gate | Status | Evidence artifact | Blocking note | Required next evidence |
|---|---|---|---|---|
| Settlement submit evidence | publication blocker | <live-submit-artifact> | Submit not run yet. | Run live submit only after this preflight. |

## Preflight Evidence

- Broadcast policy result: artifact://preflight/broadcast-disabled.log Broadcast policy disabled before live window
- Clean deployment state evidence: artifact://preflight/clean-deployment-state.json deployment-state hash=${DEPLOYMENT_STATE_HASH}; contract IDs=${CONTRACT_ID}; singleton inventory=${SINGLETON_ID}

## Dry-Run Settlement Evidence

${dryRunEvidence}

## Broadcast Enablement Evidence

${listFields(broadcast)}

## Submit And Confirmation Evidence

- Submitted transaction ID: <pending live submit>
`;
}

function listFields(fields: Record<string, string>): string {
  return Object.entries(fields).map(([key, value]) => `- ${key}: ${value}`).join('\n');
}

function writeFixture(dir: string, markdown: string): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'completed-live.md'), markdown);
  return `${basename(dir)}/completed-live.md`;
}

function approvalFile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const approval = {
    mode: 'single-with-ingest',
    burnTxHash: PEG_OUT_BURN_TX_ID,
    expectedTxId: EXPECTED_TX_ID,
    approvedAt: '2026-05-17T10:05:00Z',
    expiresAt: '2026-05-17T11:05:00Z',
    checkCommand: `npm run settle:aggregate -- check-with-ingest ${PEG_OUT_BURN_TX_ID} ${SIDECHAIN_BLOCK_HASH} ${BRIDGE_EVENT_ROOT} 100`,
    checkEvidenceJson: 'aggregate-check.json',
    ...overrides,
  } as Record<string, unknown>;
  const burnTxHashes = Array.isArray(approval.burnTxHashes)
    ? approval.burnTxHashes.map(value => String(value))
    : [String(approval.burnTxHash)];
  const burnSet = burnTxHashes.join(',');
  const expectedTxId = String(approval.expectedTxId);
  const checkCommand = String(approval.checkCommand);
  approval.evidence =
    `artifact://approval/reviewer.log completed approval evidence target mode ${approval.mode} ` +
    `non-broadcast Expected transaction ID ${expectedTxId} ordered burn set ${burnSet}`;
  approval.checkEvidence =
    `artifact://dry-run/check.log ${checkCommand} mode ${approval.mode} non-broadcast PASS ` +
    `Expected transaction ID ${expectedTxId} ` +
    `ordered burn set ${burnSet}`;

  return {
    version: 2,
    createdAt: '2026-05-17T10:00:00Z',
    environment: 'testnet',
    ergoNodeNetwork: 'testnet',
    ergoNodeUrl: 'http://localhost:9053',
    sidechainNetwork: 'patched-devnet',
    sidechainRpcUrl: 'http://localhost:8545',
    sidechainWsUrl: 'ws://localhost:9944',
    deployedStateHash: DEPLOYMENT_STATE_HASH,
    approvals: [approval],
  };
}

function batchApprovalFile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return approvalFile({
    mode: 'batch',
    burnTxHashes: [PEG_OUT_BURN_TX_ID, OTHER_PEG_OUT_BURN_TX_ID],
    bridgeEventRootHexes: [BRIDGE_EVENT_ROOT, BRIDGE_EVENT_ROOT_B],
    checkCommand: `npm run settle:aggregate -- check-batch ${PEG_OUT_BURN_TX_ID} ${OTHER_PEG_OUT_BURN_TX_ID}`,
    ...overrides,
  });
}

function writeApprovalsFixture(dir: string, approvals: Record<string, unknown> = approvalFile()): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'approvals.json'), JSON.stringify(approvals, null, 2));
  return `${basename(dir)}/approvals.json`;
}

function writeLiveFixture(
  dir: string,
  markdown = completedLiveRehearsal(),
  approvals: Record<string, unknown> = approvalFile(),
  aggregateRecord = aggregateEvidenceRecord(),
): { rehearsalTarget: string; approvalsTarget: string } {
  writeFileSync(join(dir, 'aggregate-check.json'), JSON.stringify(aggregateRecord, null, 2));
  return {
    rehearsalTarget: writeFixture(dir, markdown),
    approvalsTarget: writeApprovalsFixture(dir, approvals),
  };
}

describe('testnet rehearsal live preflight', () => {
  it('quarantines complete legacy V1 evidence without emitting execution authority', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir);

      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      expect(report.profile).toBe(LEGACY_V1_LIVE_PREFLIGHT_PROFILE);
      expect(report.settlementProfile).toEqual({
        settlementProfileId: 'legacy-aggregate-v1',
        profileActivationStatus: 'QUARANTINED',
        evidencePurpose: 'historical-diagnostics',
        activationEvidenceTarget: 'none',
      });
      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toEqual([LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE]);
      expect(report.expectedTxId).toBe(EXPECTED_TX_ID);
      expect(report.targetBindings).toEqual({
        rehearsal: target.rehearsalTarget,
        approvals: target.approvalsTarget,
        transcript: TRANSCRIPT_TARGET,
      });
      expect(report.runtimeBroadcastEnabled).toBe(false);
      expect(report.preSubmitBoundary).toEqual({
        reportAuthorizesBroadcast: false,
        liveSubmitPerformed: false,
        confirmationObserved: false,
        reconciliationPerformed: false,
        gate3ClosureAllowed: false,
        productionReadyClaimAllowed: false,
        testnetProductionCandidateClaimAllowed: false,
      });
      expect(report.authorizationEvidence).toEqual({
        reviewerApproval: 'blocked',
        userApproval: 'blocked',
        scopedBroadcastShell: 'blocked',
        readinessAfterEnable: 'blocked',
        broadcastPolicyPass: 'blocked',
        liveSettlementReadinessPass: 'blocked',
        networkReconfirmation: 'blocked',
        approvalJsonBinding: 'blocked',
        releaseGateTranscriptLine: 'blocked',
      });
      expect(report.approvalBinding).toEqual({
        command: 'check-with-ingest',
        mode: 'single-with-ingest',
        expectedTxId: EXPECTED_TX_ID,
        burnTxHashes: [PEG_OUT_BURN_TX_ID],
        bridgeEventRootHexes: [BRIDGE_EVENT_ROOT],
        sidechainHeaderHashHex: SIDECHAIN_BLOCK_HASH,
        bridgeEventRootHex: BRIDGE_EVENT_ROOT,
        ergoAnchorHeight: 100,
        environment: 'testnet',
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedStateHash: DEPLOYMENT_STATE_HASH,
      });
      expect(report.lines.join('\n')).toContain('does not authorize broadcast');
      expect(report.lines.join('\n')).toContain('Legacy V1 submission quarantine:');
      expect(report.lines.join('\n')).not.toContain('PASS exit code 0');
      expect(report.lines.join('\n')).not.toContain('Live settlement signing PASS');
      expect(report.lines.join('\n')).not.toContain('user explicit live broadcast approval evidence linked');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('normalizes whitespace-padded bindings while preserving quarantine', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir);
      const report = preflightTestnetRehearsalLive({
        rehearsalTarget: `  ${target.rehearsalTarget}  `,
        approvalsTarget: `  ${target.approvalsTarget}  `,
        transcriptTarget: `  ${TRANSCRIPT_TARGET}  `,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.target).toBe(target.rehearsalTarget);
      expect(report.approvalsTarget).toBe(target.approvalsTarget);
      expect(report.transcriptTarget).toBe(TRANSCRIPT_TARGET);
      expect(report.targetBindings).toEqual({
        rehearsal: target.rehearsalTarget,
        approvals: target.approvalsTarget,
        transcript: TRANSCRIPT_TARGET,
      });
      expect(JSON.stringify(report)).not.toContain(`  ${TRANSCRIPT_TARGET}  `);
      expect(validateLivePreflightJsonReport({ schemaVersion: 1, ...report })).toContain(
        LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes a structured quarantine report with historical bindings', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir);
      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });
      const writeResult = writeOfflineReportJson(`${basename(dir)}/live-preflight.json`, {
        schemaVersion: 1,
        ...report,
      });
      const saved = JSON.parse(readFileSync(join(dir, 'live-preflight.json'), 'utf8'));

      expect(writeResult.errors).toEqual([]);
      expect(saved.profile).toBe(LEGACY_V1_LIVE_PREFLIGHT_PROFILE);
      expect(saved.status).toBe('BLOCKED');
      expect(saved.target).toBe(target.rehearsalTarget);
      expect(saved.approvalsTarget).toBe(target.approvalsTarget);
      expect(saved.transcriptTarget).toBe(TRANSCRIPT_TARGET);
      expect(saved.runtimeBroadcastEnabled).toBe(false);
      expect(saved.preSubmitBoundary.reportAuthorizesBroadcast).toBe(false);
      expect(saved.preSubmitBoundary.liveSubmitPerformed).toBe(false);
      expect(saved.authorizationEvidence.approvalJsonBinding).toBe('blocked');
      expect(saved.authorizationEvidence.releaseGateTranscriptLine).toBe('blocked');
      expect(saved.approvalBinding).toEqual(report.approvalBinding);
      expect(saved.targetBindings).toEqual({
        rehearsal: target.rehearsalTarget,
        approvals: target.approvalsTarget,
        transcript: TRANSCRIPT_TARGET,
      });
      expect(saved.expectedTxId).toBe(EXPECTED_TX_ID);
      expect(saved.errors).toEqual([LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE]);
      expect(saved.lines.join('\n')).toContain('does not authorize broadcast');
      expect(saved.lines.join('\n')).not.toContain('approval JSON binding matched');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects the legacy V1 report schema for release-gate consumption', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir);
      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      expect(validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...report,
      })).toContain(LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE);

      expect(validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...report,
        lines: [
          ...report.lines,
          '- Validation summary: PASS exit code 0; validation BLOCKED with 1 structural issue',
        ],
      })).toContain('live-preflight: JSON report lines must not include contradictory failure markers');

      expect(validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...report,
        lines: [
          ...report.lines,
          '- Validation summary: PASS exit code 0; validation\uFF1A \uFF22\uFF2C\uFF2F\uFF23\uFF2B\uFF25\uFF24 with \uFF11 structural issue',
        ],
      })).toContain('live-preflight: JSON report lines must not include contradictory failure markers');

      expect(validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...report,
        lines: [
          ...report.lines,
          '- JSON summary: errorCount: 1',
        ],
      })).toContain('live-preflight: JSON report lines must not include contradictory failure markers');

      expect(validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...report,
        lines: [
          ...report.lines,
          '- JSON summary: errorsTotal=1; failures_total: 2',
        ],
      })).toContain('live-preflight: JSON report lines must not include contradictory failure markers');

      expect(validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...report,
        lines: [
          ...report.lines,
          '- JSON summary: {"errors":["missing scoped broadcast shell"]}',
        ],
      })).toContain('live-preflight: JSON report lines must not include contradictory failure markers');

      expect(validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...report,
        lines: [
          ...report.lines,
          '- JSON summary: errorCount: 0',
          '- JSON summary: errorsTotal=0; failures_total: 0',
          '- JSON summary: {"errors":[]}',
        ],
      })).toContain(LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects live-preflight report lines with remaining issue markers', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir);
      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      expect(validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...report,
        lines: [
          '- historical validation only; this report does not authorize broadcast',
          '- Remaining issues:',
          '  - unresolved live-preflight blocker',
        ],
      })).toContain('live-preflight: JSON report lines must not include remaining issues');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects live-preflight report lines with open or known issue markers', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir);
      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      expect(validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...report,
        lines: [
          '- historical validation only; this report does not authorize broadcast',
          '- Open issues: unresolved live-preflight blocker',
        ],
      })).toContain('live-preflight: JSON report lines must not include remaining issues');
      expect(validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...report,
        lines: [
          '- historical validation only; this report does not authorize broadcast',
          '- Known issues: unresolved live-preflight blocker',
        ],
      })).toContain('live-preflight: JSON report lines must not include remaining issues');
      expect(validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...report,
        lines: [
          '- historical validation only; this report does not authorize broadcast',
          '- \uFF2F\uFF50\uFF45\uFF4E issues\uFF1A unresolved live-preflight blocker',
        ],
      })).toContain('live-preflight: JSON report lines must not include remaining issues');
      expect(validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...report,
        lines: [
          '- historical validation only; this report does not authorize broadcast',
          '- JSON summary: {"openIssues": 1, "pendingBlockers": 0}',
        ],
      })).toContain('live-preflight: JSON report lines must not include remaining issues');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks live-preflight JSON reports above the batch unlock claim cap', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir);
      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      const errors = validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...report,
        approvalBinding: {
          ...report.approvalBinding,
          command: 'check-batch',
          mode: 'batch',
          burnTxHashes: overCapBurnTxHashes(),
          bridgeEventRootHexes: overCapBridgeEventRootHexes(),
        },
      });

      expect(errors).toContain(
        'live-preflight: JSON report approvalBinding.burnTxHashes must not exceed batch unlock cap (10 claims)',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks live-preflight JSON reports with duplicate approved batch burns', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir);
      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      const errors = validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...report,
        approvalBinding: {
          ...report.approvalBinding,
          command: 'check-batch',
          mode: 'batch',
          burnTxHashes: [PEG_OUT_BURN_TX_ID, PEG_OUT_BURN_TX_ID],
          bridgeEventRootHexes: [BRIDGE_EVENT_ROOT, BRIDGE_EVENT_ROOT],
        },
      });

      expect(errors).toContain(
        'live-preflight: JSON report approvalBinding.burnTxHashes must not contain duplicates',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows concrete live-preflight audit targets that mention sample size or template removal', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const rehearsalTarget = `${basename(dir)}/template-removal-audit-live-rehearsal.md`;
      const approvalsTarget = `${basename(dir)}/sample-size-analysis-approvals.json`;
      const transcriptTarget = 'artifact://live/template-removal-audit-live-preflight.log';
      writeFileSync(join(dir, 'aggregate-check.json'), JSON.stringify(aggregateEvidenceRecord(), null, 2));
      writeFileSync(join(dir, 'template-removal-audit-live-rehearsal.md'), completedLiveRehearsal());
      writeFileSync(join(dir, 'sample-size-analysis-approvals.json'), JSON.stringify(approvalFile(), null, 2));

      const report = preflightTestnetRehearsalLive({
        rehearsalTarget,
        approvalsTarget,
        transcriptTarget,
        now: NOW,
      });

      expect(report.errors).toEqual([LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE]);
      expect(report.status).toBe('BLOCKED');
      expect(report.targetBindings).toEqual({
        rehearsal: rehearsalTarget,
        approvals: approvalsTarget,
        transcript: transcriptTarget,
      });
      expect(validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...report,
      })).toContain(LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks when the live-preflight command is run from a broadcast-enabled shell', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir);

      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        runtimeBroadcastEnabled: true,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.runtimeBroadcastEnabled).toBe(true);
      expect(report.preSubmitBoundary.reportAuthorizesBroadcast).toBe(false);
      expect(report.authorizationEvidence.scopedBroadcastShell).toBe('blocked');
      expect(report.lines.join('\n')).toContain('- runtime BRIDGE_BROADCAST_ENABLED: enabled');
      expect(report.errors).toContain(
        'Runtime broadcast policy: BRIDGE_BROADCAST_ENABLED must be false or unset while running rehearsal:live-preflight',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks malformed live-preflight JSON reports before release-gate claims', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir);
      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });
      const errors = validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...report,
        runtimeBroadcastEnabled: true,
        expectedTxId: 'not-a-transaction-id',
        errors: ['approval missing'],
        preSubmitBoundary: {
          ...report.preSubmitBoundary,
          liveSubmitPerformed: true,
          productionReadyClaimAllowed: true,
          testnetProductionCandidateClaimAllowed: true,
        },
        authorizationEvidence: {
          ...report.authorizationEvidence,
          reviewerApproval: 'blocked',
        },
        approvalBinding: {
          ...report.approvalBinding,
          expectedTxId: OTHER_TX_ID,
          bridgeEventRootHexes: [],
          ergoAnchorHeight: -1,
        },
      });

      expect(errors).toEqual(expect.arrayContaining([
        'live-preflight: JSON report errors must be empty',
        'live-preflight: JSON report runtimeBroadcastEnabled must be false',
        'live-preflight: JSON report expectedTxId must be 32-byte hex',
        'live-preflight: JSON report preSubmitBoundary.liveSubmitPerformed must be false',
        'live-preflight: JSON report preSubmitBoundary.productionReadyClaimAllowed must be false',
        'live-preflight: JSON report preSubmitBoundary.testnetProductionCandidateClaimAllowed must be false',
        'live-preflight: JSON report authorizationEvidence.reviewerApproval must be linked',
        'live-preflight: JSON report approvalBinding.expectedTxId must match expectedTxId',
        'live-preflight: JSON report approvalBinding.bridgeEventRootHexes must match bridgeEventRootHex for check-with-ingest',
        'live-preflight: JSON report approvalBinding.ergoAnchorHeight must be a non-negative integer for check-with-ingest',
      ]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks row-named non-concrete live-preflight target bindings', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir);
      const genericRehearsalTarget = `${basename(dir)}/generic-live-rehearsal.md`;
      const genericApprovalsTarget = `${basename(dir)}/generic-approvals.json`;
      writeFileSync(join(dir, 'generic-live-rehearsal.md'), completedLiveRehearsal());
      writeFileSync(join(dir, 'generic-approvals.json'), JSON.stringify(approvalFile(), null, 2));

      const report = preflightTestnetRehearsalLive({
        rehearsalTarget: genericRehearsalTarget,
        approvalsTarget: genericApprovalsTarget,
        transcriptTarget: 'artifact://live/sample-evidence-preflight.log',
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toEqual(expect.arrayContaining([
        'Rehearsal target: --rehearsal must not be a template, placeholder, or non-concrete target',
        'Approvals: --approvals must not be a template, placeholder, or non-concrete target',
        'Transcript target: --transcript must not be a template, placeholder, or non-concrete target',
      ]));

      const jsonErrors = validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...preflightTestnetRehearsalLive({
          ...target,
          transcriptTarget: TRANSCRIPT_TARGET,
          now: NOW,
        }),
        targetBindings: {
          rehearsal: genericRehearsalTarget,
          approvals: genericApprovalsTarget,
          transcript: 'artifact://live/sample-evidence-preflight.log',
        },
      });

      expect(jsonErrors).toEqual(expect.arrayContaining([
        'live-preflight: JSON report targetBindings.rehearsal must cite a concrete completed rehearsal target',
        'live-preflight: JSON report targetBindings.approvals must cite a concrete non-template JSON approvals target',
        'live-preflight: JSON report targetBindings.transcript must cite a concrete non-template transcript target',
      ]));

      const sampleRehearsalTarget = `${basename(dir)}/sample-live-rehearsal.md`;
      const sampleApprovalsTarget = `${basename(dir)}/sample-approvals.json`;
      writeFileSync(join(dir, 'sample-live-rehearsal.md'), completedLiveRehearsal());
      writeFileSync(join(dir, 'sample-approvals.json'), JSON.stringify(approvalFile(), null, 2));

      const sampleReport = preflightTestnetRehearsalLive({
        rehearsalTarget: sampleRehearsalTarget,
        approvalsTarget: sampleApprovalsTarget,
        transcriptTarget: 'artifact://live/sample-live-preflight.log',
        now: NOW,
      });

      expect(sampleReport.status).toBe('BLOCKED');
      expect(sampleReport.errors).toEqual(expect.arrayContaining([
        'Rehearsal target: --rehearsal must not be a template, placeholder, or non-concrete target',
        'Approvals: --approvals must not be a template, placeholder, or non-concrete target',
        'Transcript target: --transcript must not be a template, placeholder, or non-concrete target',
      ]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks fixture-style and synthetic live-preflight target bindings', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir);
      const fixtureRehearsalTarget = `${basename(dir)}/fixture-live-rehearsal.md`;
      const mockApprovalsTarget = `${basename(dir)}/mock-approvals.json`;
      writeFileSync(join(dir, 'fixture-live-rehearsal.md'), completedLiveRehearsal());
      writeFileSync(join(dir, 'mock-approvals.json'), JSON.stringify(approvalFile(), null, 2));

      const report = preflightTestnetRehearsalLive({
        rehearsalTarget: fixtureRehearsalTarget,
        approvalsTarget: mockApprovalsTarget,
        transcriptTarget: 'artifact://live/testdata-preflight.log',
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toEqual(expect.arrayContaining([
        'Rehearsal target: --rehearsal must not be a template, placeholder, or non-concrete target',
        'Approvals: --approvals must not be a template, placeholder, or non-concrete target',
        'Transcript target: --transcript must not be a template, placeholder, or non-concrete target',
      ]));

      const jsonErrors = validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...preflightTestnetRehearsalLive({
          ...target,
          transcriptTarget: TRANSCRIPT_TARGET,
          now: NOW,
        }),
        targetBindings: {
          rehearsal: fixtureRehearsalTarget,
          approvals: mockApprovalsTarget,
          transcript: 'artifact://live/testdata-preflight.log',
        },
      });

      expect(jsonErrors).toEqual(expect.arrayContaining([
        'live-preflight: JSON report targetBindings.rehearsal must cite a concrete completed rehearsal target',
        'live-preflight: JSON report targetBindings.approvals must cite a concrete non-template JSON approvals target',
        'live-preflight: JSON report targetBindings.transcript must cite a concrete non-template transcript target',
      ]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks simulated live-preflight target bindings', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir);
      const simulatedRehearsalTarget = `${basename(dir)}/completed-simulated-live-rehearsal.md`;
      const simulatedApprovalsTarget = `${basename(dir)}/completed-simulated-approvals.json`;
      const simulatedTranscriptTarget = 'artifact://live/completed-simulated-preflight.log';
      writeFileSync(join(dir, 'completed-simulated-live-rehearsal.md'), completedLiveRehearsal());
      writeFileSync(join(dir, 'completed-simulated-approvals.json'), JSON.stringify(approvalFile(), null, 2));

      const report = preflightTestnetRehearsalLive({
        rehearsalTarget: simulatedRehearsalTarget,
        approvalsTarget: simulatedApprovalsTarget,
        transcriptTarget: simulatedTranscriptTarget,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toEqual(expect.arrayContaining([
        'Rehearsal target: --rehearsal must not be a template, placeholder, or non-concrete target',
        'Approvals: --approvals must not be a template, placeholder, or non-concrete target',
        'Transcript target: --transcript must not be a template, placeholder, or non-concrete target',
      ]));

      const jsonErrors = validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...preflightTestnetRehearsalLive({
          ...target,
          transcriptTarget: TRANSCRIPT_TARGET,
          now: NOW,
        }),
        targetBindings: {
          rehearsal: simulatedRehearsalTarget,
          approvals: simulatedApprovalsTarget,
          transcript: simulatedTranscriptTarget,
        },
      });

      expect(jsonErrors).toEqual(expect.arrayContaining([
        'live-preflight: JSON report targetBindings.rehearsal must cite a concrete completed rehearsal target',
        'live-preflight: JSON report targetBindings.approvals must cite a concrete non-template JSON approvals target',
        'live-preflight: JSON report targetBindings.transcript must cite a concrete non-template transcript target',
      ]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks claim-escalating live-preflight target bindings', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir);
      const claimTranscriptTarget = 'artifact://live/testnet-production-candidate-preflight.log';

      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: claimTranscriptTarget,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Transcript target: --transcript must be a completed artifact target or non-template evidence link',
      );

      const jsonErrors = validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...preflightTestnetRehearsalLive({
          ...target,
          transcriptTarget: TRANSCRIPT_TARGET,
          now: NOW,
        }),
        targetBindings: {
          rehearsal: 'artifact://live/testnet-production-candidate-rehearsal.md',
          approvals: 'artifact://live/testnet-production-candidate-approvals.json',
          transcript: claimTranscriptTarget,
        },
      });

      expect(jsonErrors).toEqual(expect.arrayContaining([
        'live-preflight: JSON report targetBindings.rehearsal must cite a concrete completed rehearsal target',
        'live-preflight: JSON report targetBindings.approvals must cite a concrete non-template JSON approvals target',
        'live-preflight: JSON report targetBindings.transcript must cite a concrete non-template transcript target',
      ]));

      const syntheticRehearsalTarget = `${basename(dir)}/completed-synthetic-live-rehearsal.md`;
      const syntheticApprovalsTarget = `${basename(dir)}/completed-synthetic-approvals.json`;
      writeFileSync(join(dir, 'completed-synthetic-live-rehearsal.md'), completedLiveRehearsal());
      writeFileSync(join(dir, 'completed-synthetic-approvals.json'), JSON.stringify(approvalFile(), null, 2));

      const syntheticReport = preflightTestnetRehearsalLive({
        rehearsalTarget: syntheticRehearsalTarget,
        approvalsTarget: syntheticApprovalsTarget,
        transcriptTarget: 'artifact://live/completed-synthetic-preflight.log',
        now: NOW,
      });

      expect(syntheticReport.status).toBe('BLOCKED');
      expect(syntheticReport.errors).toEqual(expect.arrayContaining([
        'Rehearsal target: --rehearsal must not be a template, placeholder, or non-concrete target',
        'Approvals: --approvals must not be a template, placeholder, or non-concrete target',
        'Transcript target: --transcript must not be a template, placeholder, or non-concrete target',
      ]));

      const syntheticJsonErrors = validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...preflightTestnetRehearsalLive({
          ...target,
          transcriptTarget: TRANSCRIPT_TARGET,
          now: NOW,
        }),
        targetBindings: {
          rehearsal: syntheticRehearsalTarget,
          approvals: syntheticApprovalsTarget,
          transcript: 'artifact://live/completed-synthetic-preflight.log',
        },
      });

      expect(syntheticJsonErrors).toEqual(expect.arrayContaining([
        'live-preflight: JSON report targetBindings.rehearsal must cite a concrete completed rehearsal target',
        'live-preflight: JSON report targetBindings.approvals must cite a concrete non-template JSON approvals target',
        'live-preflight: JSON report targetBindings.transcript must cite a concrete non-template transcript target',
      ]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks shell-unsafe live-preflight JSON target bindings before release-gate consumption', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir);
      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });
      const shellUnsafeRehearsalTarget = 'evidence/live rehearsals/completed-live.md';
      const shellUnsafeApprovalsTarget = 'evidence/live approvals/approvals file.json';
      const shellUnsafeTranscriptTarget = 'artifact://live/live preflight.log';
      const jsonErrors = validateLivePreflightJsonReport({
        schemaVersion: 1,
        ...report,
        targetBindings: {
          rehearsal: shellUnsafeRehearsalTarget,
          approvals: shellUnsafeApprovalsTarget,
          transcript: shellUnsafeTranscriptTarget,
        },
      });

      expect(jsonErrors).toEqual(expect.arrayContaining([
        'live-preflight: JSON report targetBindings.rehearsal must not contain whitespace or shell metacharacters',
        'live-preflight: JSON report targetBindings.approvals must not contain whitespace or shell metacharacters',
        'live-preflight: JSON report targetBindings.transcript must not contain whitespace or shell metacharacters',
      ]));
      expect(jsonErrors.join('\n')).not.toContain(shellUnsafeRehearsalTarget);
      expect(jsonErrors.join('\n')).not.toContain(shellUnsafeApprovalsTarget);
      expect(jsonErrors.join('\n')).not.toContain(shellUnsafeTranscriptTarget);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks reviewer and user approvals that do not bind the Session Metadata reviewer and Expected transaction ID', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir, completedLiveRehearsal({
        'Reviewer approval recorded':
          `reviewer-b explicit live broadcast approval for Expected transaction ID ${EXPECTED_TX_ID} artifact://live/reviewer-approval.md`,
        'User approval recorded':
          `user explicit live broadcast approval for Expected transaction ID ${OTHER_TX_ID} artifact://live/user-approval.md`,
      }));

      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.preSubmitBoundary.reportAuthorizesBroadcast).toBe(false);
      expect(report.preSubmitBoundary.liveSubmitPerformed).toBe(false);
      expect(report.authorizationEvidence).toEqual({
        reviewerApproval: 'blocked',
        userApproval: 'blocked',
        scopedBroadcastShell: 'blocked',
        readinessAfterEnable: 'blocked',
        broadcastPolicyPass: 'blocked',
        liveSettlementReadinessPass: 'blocked',
        networkReconfirmation: 'blocked',
        approvalJsonBinding: 'blocked',
        releaseGateTranscriptLine: 'blocked',
      });
      expect(report.errors).toContain(
        'Broadcast Enablement Evidence: Reviewer approval recorded must name the Session Metadata Reviewer',
      );
      expect(report.errors).toContain(
        'Broadcast Enablement Evidence: User approval recorded must cite Expected transaction ID',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks scoped-shell evidence unless it proves yes, intended shell, and limited scope', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir, completedLiveRehearsal({
        '`BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell':
          'BRIDGE_BROADCAST_ENABLED=true artifact://live/broadcast-enable.log',
      }));

      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Broadcast Enablement Evidence: `BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell must contain yes',
      );
      expect(report.errors).toContain(
        'Broadcast Enablement Evidence: `BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell must name the intended shell',
      );
      expect(report.errors).toContain(
        'Broadcast Enablement Evidence: `BRIDGE_BROADCAST_ENABLED=true` set only in the intended shell must state the scope is limited',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks pre-submit rehearsal files that already close lifecycle or claim boundaries', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const markdown = completedLiveRehearsal()
        .replace(
          '| Settlement submit evidence | publication blocker | <live-submit-artifact> | Submit not run yet. | Run live submit only after this preflight. |',
          [
            `| Fresh testnet lifecycle | pass | artifact://live/fresh-testnet-lifecycle.md | Completed before preflight. | none |`,
            `| Settlement submit evidence | pass | artifact://live/submit.md | Completed before preflight. | none |`,
            `| Confirmation evidence | pass | artifact://live/confirmation.md | Completed before preflight. | none |`,
            `| Reconciliation evidence | pass | artifact://live/reconciliation.md | Completed before preflight. | none |`,
          ].join('\n'),
        ) + `

## Publication Evidence

- Production-ready claim allowed by this rehearsal: yes
- Testnet production-candidate claim allowed by this rehearsal: yes

## Reviewer Sign-Off

- Classification: pass
`;
      const target = writeLiveFixture(dir, markdown);

      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.preSubmitBoundary.liveSubmitPerformed).toBe(false);
      expect(report.preSubmitBoundary.productionReadyClaimAllowed).toBe(false);
      expect(report.preSubmitBoundary.testnetProductionCandidateClaimAllowed).toBe(false);
      expect(report.errors).toContain(
        'Pre-submit boundary: Fresh testnet lifecycle must not be pass before live submit evidence is assembled',
      );
      expect(report.errors).toContain(
        'Pre-submit boundary: Settlement submit evidence must not be pass before live submit evidence is assembled',
      );
      expect(report.errors).toContain(
        'Pre-submit boundary: Confirmation evidence must not be pass before live submit evidence is assembled',
      );
      expect(report.errors).toContain(
        'Pre-submit boundary: Reconciliation evidence must not be pass before live submit evidence is assembled',
      );
      expect(report.errors).toContain(
        'Pre-submit boundary: Production-ready claim allowed by this rehearsal must be no',
      );
      expect(report.errors).toContain(
        'Pre-submit boundary: Testnet production-candidate claim allowed by this rehearsal must be no',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks readiness rows that do not cite demo:readiness PASS outputs', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir, completedLiveRehearsal({
        'Broadcast policy reports `PASS`':
          'Broadcast policy PASS artifact://live/broadcast-policy.log',
        'Live settlement readiness reports `PASS`':
          'npm run demo:readiness output Live settlement signing artifact://live/live-settlement-signing.log',
      }));

      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Broadcast Enablement Evidence: Broadcast policy reports `PASS` must cite npm run demo:readiness',
      );
      expect(report.errors).toContain(
        'Broadcast Enablement Evidence: Live settlement readiness reports `PASS` must contain PASS',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks mainnet or negated testnet wording in the network reconfirmation', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir, completedLiveRehearsal({
        'Node URL and network re-confirmed':
          'Node URL http://localhost:9053; Ergo node network testnet not reachable; Sidechain network mainnet artifact://live/node-network-reconfirmed.log',
      }));

      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Broadcast Enablement Evidence: Node URL and network re-confirmed must not include mainnet or negated testnet network wording',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses sensitive rehearsal targets without echoing the target', () => {
    const report = preflightTestnetRehearsalLive({
      rehearsalTarget: '../.' + 'env',
      approvalsTarget: 'approvals.json',
      transcriptTarget: TRANSCRIPT_TARGET,
      now: NOW,
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.lines.join('\n')).toContain('<blocked evidence target>');
    expect(report.lines.join('\n')).not.toContain('.' + 'env');
  });

  it('refuses secret-bearing approvals and transcript targets without echoing sensitive labels', () => {
    const report = preflightTestnetRehearsalLive({
      rehearsalTarget: 'docs/live-rehearsal-template.md',
      approvalsTarget: '../.' + 'env',
      transcriptTarget: '../secrets.' + 'dlog',
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.lines.join('\n')).toContain('<blocked evidence target>');
    expect(report.lines.join('\n')).not.toContain('.' + 'env');
    expect(report.lines.join('\n')).not.toContain('secrets.' + 'dlog');

    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const writeResult = writeOfflineReportJson(`${basename(dir)}/blocked-live-preflight.json`, {
        schemaVersion: 1,
        ...report,
      });
      const savedText = readFileSync(join(dir, 'blocked-live-preflight.json'), 'utf8');
      expect(writeResult.errors).toEqual([]);
      expect(savedText).toContain('<blocked evidence target>');
      expect(savedText).not.toContain('.' + 'env');
      expect(savedText).not.toContain('secrets.' + 'dlog');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    for (const approvalsTarget of [
      '../operator/signing-key-approval.json',
      '../operator/api-key-approval.json',
      '../operator/seed-phrase-approval.json',
      '../runtime/deployed_state.json',
      'evidence/sourceTarget=(.env)/approvals.json',
      'evidence/sourceTarget=(runtime/bridge-state.sqlite)/approvals.json',
      'evidence/sourceTarget=%28.env%29/approvals.json',
      'evidence/sourceTarget=%28runtime%2Fbridge-state.sqlite%29/approvals.json',
    ]) {
      const secretReport = preflightTestnetRehearsalLive({
        rehearsalTarget: 'docs/live-rehearsal-template.md',
        approvalsTarget,
        transcriptTarget: TRANSCRIPT_TARGET,
      });
      const serialized = JSON.stringify(secretReport);

      expect(secretReport.status, approvalsTarget).toBe('BLOCKED');
      expect(secretReport.approvalsTarget, approvalsTarget).toBe('<blocked approval target>');
      expect(secretReport.targetBindings.approvals, approvalsTarget).toBe('<blocked approval target>');
      const expectedApprovalError = approvalsTarget.includes('.env')
        ? 'Approvals: <blocked approval target> must not be an environment file'
        : 'Approvals: <blocked approval target> must not be a secret-bearing or runtime-state path';
      expect(secretReport.errors, approvalsTarget).toContain(expectedApprovalError);
      expect(serialized, approvalsTarget).not.toContain(approvalsTarget);
    }

    for (const transcriptTarget of [
      'artifact://live/signing-key-live-preflight.log',
      'artifact://live/api-key-live-preflight.log',
      'artifact://live/seed-phrase-live-preflight.log',
      'artifact://live/deployed_state.json',
      'artifact://live/sourceTarget=(.env)/live-preflight.log',
      'artifact://live/sourceTarget=(bridge-state.sqlite)/live-preflight.log',
      'artifact://live/sourceTarget=%28.env%29/live-preflight.log',
      'artifact://live/sourceTarget=%28runtime%2Fbridge-state.sqlite%29/live-preflight.log',
    ]) {
      const secretReport = preflightTestnetRehearsalLive({
        rehearsalTarget: 'docs/live-rehearsal-template.md',
        approvalsTarget: 'approvals.json',
        transcriptTarget,
      });
      const serialized = JSON.stringify(secretReport);

      expect(secretReport.status, transcriptTarget).toBe('BLOCKED');
      expect(secretReport.transcriptTarget, transcriptTarget).toBe('<blocked evidence target>');
      expect(secretReport.targetBindings.transcript, transcriptTarget).toBe('<blocked evidence target>');
      expect(secretReport.errors, transcriptTarget).toContain(
        '<blocked evidence target>: refusing secret-bearing or runtime-state evidence targets',
      );
      expect(serialized, transcriptTarget).not.toContain(transcriptTarget);
    }
  });

  it('blocks unsafe CLI JSON output targets before live-preflight evidence inspection', () => {
    const jsonOutTarget = '../operator/private-key-report.json';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/testnet-rehearsal-live-preflight.ts',
        '--rehearsal',
        'missing-live-rehearsal.md',
        '--approvals',
        'missing-approvals.json',
        '--transcript',
        TRANSCRIPT_TARGET,
        '--json-out',
        jsonOutTarget,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--json-out <blocked output target> must not target runtime or secret-bearing material');
    expect(result.stderr).not.toContain(jsonOutTarget);
    expect(result.stderr).not.toContain('missing-live-rehearsal.md');
    expect(result.stderr).not.toContain('missing-approvals.json');
    expect(result.stderr).not.toContain(process.cwd());
  });

  it('keeps CLI JSON output guard before live-preflight report construction', () => {
    const source = readFileSync(
      new URL('./scripts/testnet-rehearsal-live-preflight.ts', import.meta.url),
      'utf8',
    );

    expect(source).toContain("import { resolveEvidenceJsonOutputPath } from '../evidence-json-output-path.js'");
    expect(source).toContain('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;');
    expect(source).toContain('const report = preflightTestnetRehearsalLive({');
    expect(source.indexOf('const jsonOutputTarget = args.jsonOut ? resolveEvidenceJsonOutputPath(args.jsonOut) : undefined;')).toBeLessThan(
      source.indexOf('const report = preflightTestnetRehearsalLive({'),
    );
  });

  it('refuses local absolute approvals and transcript targets without echoing target filenames', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir);
      const localApprovalsTarget = ['', 'tmp', 'approvals.json'].join('/');
      const localTranscriptTarget = ['', 'tmp', 'live-preflight.log'].join('/');

      const report = preflightTestnetRehearsalLive({
        rehearsalTarget: target.rehearsalTarget,
        approvalsTarget: localApprovalsTarget,
        transcriptTarget: localTranscriptTarget,
        now: NOW,
      });
      const serialized = JSON.stringify(report);

      expect(report.status).toBe('BLOCKED');
      expect(report.approvalsTarget).toBe('<blocked approval target>');
      expect(report.transcriptTarget).toBe('<blocked evidence target>');
      expect(report.targetBindings.approvals).toBe('<blocked approval target>');
      expect(report.targetBindings.transcript).toBe('<blocked evidence target>');
      expect(serialized).toContain('<blocked approval target>');
      expect(serialized).toContain('<blocked evidence target>');
      expect(serialized).not.toContain('approvals.json');
      expect(serialized).not.toContain('live-preflight.log');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses approval targets that resolve outside the bridge without echoing the target', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    const external = mkdtempSync(join(tmpdir(), 'live-preflight-approvals-'));
    try {
      const target = writeLiveFixture(dir);
      writeFileSync(join(external, 'approvals.json'), JSON.stringify(approvalFile(), null, 2));
      symlinkSync(external, join(dir, 'link-out'), process.platform === 'win32' ? 'junction' : 'dir');

      const report = preflightTestnetRehearsalLive({
        rehearsalTarget: target.rehearsalTarget,
        approvalsTarget: `${basename(dir)}/link-out/approvals.json`,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });
      const serialized = JSON.stringify(report);

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Approvals: <blocked approval target> must resolve inside the bridge repository',
      );
      expect(serialized).toContain('<blocked approval target>');
      expect(serialized).not.toContain('link-out');
      expect(serialized).not.toContain('approvals.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });

  it('requires approvals and transcript targets to be concrete live-preflight evidence targets', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeFixture(dir, completedLiveRehearsal());

      const report = preflightTestnetRehearsalLive({
        rehearsalTarget: target,
        approvalsTarget: 'artifact://live/approval.log',
        transcriptTarget: 'live-preflight.log',
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Approvals: <blocked approval target> must not be a URI because live-preflight must load the approval JSON',
      );
      expect(report.errors).toContain(
        'Transcript target: --transcript must be a completed artifact target or non-template evidence link',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks approval files with mismatched Expected transaction ID, burn, deployment hash, or active window', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      [
        'expected-tx',
        approvalFile({ expectedTxId: OTHER_TX_ID }),
        'Approvals: approval[0].checkEvidenceJson Expected transaction ID must match approval expectedTxId',
      ],
      [
        'burn',
        approvalFile({
          burnTxHash: OTHER_PEG_OUT_BURN_TX_ID,
          checkCommand: `npm run settle:aggregate -- check-with-ingest ${OTHER_PEG_OUT_BURN_TX_ID} ${SIDECHAIN_BLOCK_HASH} ${BRIDGE_EVENT_ROOT} 100`,
        }),
        'Approvals: approval[0].checkEvidenceJson burnTxHashes must match approval burnTxHashes in order',
      ],
      [
        'deployment-hash',
        {
          ...approvalFile(),
          deployedStateHash: OTHER_DEPLOYMENT_STATE_HASH,
        },
        'aggregate settlement approvals file deployedStateHash must match runtime context',
      ],
      [
        'expired',
        approvalFile({ expiresAt: '2026-05-17T10:10:00Z' }),
        'approval[0].expiresAt must be in the future',
      ],
    ];

    for (const [name, approvals, expectedError] of cases) {
      const dir = mkdtempSync(join(process.cwd(), `.tmp-live-preflight-${name}-`));
      try {
        const target = writeLiveFixture(dir, completedLiveRehearsal(), approvals);

        const report = preflightTestnetRehearsalLive({
          ...target,
          transcriptTarget: TRANSCRIPT_TARGET,
          now: NOW,
        });

        expect(report.status).toBe('BLOCKED');
        expect(report.errors.join('\n')).toContain(expectedError);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('blocks check-with-ingest live approvals without a dry-run Bridge event root', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const markdown = completedLiveRehearsal().replace(
        `- Bridge event root: ${BRIDGE_EVENT_ROOT} artifact://dry-run/bridge-event-root.log\n`,
        '',
      );
      const target = writeLiveFixture(dir, markdown);

      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Dry-Run Settlement Evidence: Bridge event root is required for check-with-ingest approvals binding',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks check-with-ingest live approvals whose dry-run Bridge event root differs from daemon evidence', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const markdown = completedLiveRehearsal().replace(
        `Bridge event root: ${BRIDGE_EVENT_ROOT}`,
        `Bridge event root: ${OTHER_TX_ID}`,
      );
      const target = writeLiveFixture(dir, markdown);

      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Approvals: Daemon approval evidence bridgeEventRootHex must match Dry-Run Settlement Evidence Bridge event root',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks self-consistent approval files whose check-with-ingest Bridge event root differs from live-preflight evidence', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const approvals = approvalFile({
        checkCommand: `npm run settle:aggregate -- check-with-ingest ${PEG_OUT_BURN_TX_ID} ${SIDECHAIN_BLOCK_HASH} ${OTHER_TX_ID} 100`,
      });
      const target = writeLiveFixture(dir, completedLiveRehearsal(), approvals);
      writeFileSync(join(dir, 'aggregate-check.json'), JSON.stringify(aggregateEvidenceRecord({
        bridgeEventRootHex: OTHER_TX_ID,
      }), null, 2));

      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Approvals: approval check-with-ingest command must match live-preflight daemon approval evidence',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('quarantines batch live approvals while retaining exact ordered roots for audit', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(
        dir,
        completedLiveRehearsal({}, batchDryRunSettlementEvidence()),
        batchApprovalFile(),
        batchAggregateEvidenceRecord(),
      );

      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toEqual([LEGACY_V1_LIVE_PREFLIGHT_QUARANTINE]);
      expect(report.approvalBinding).toEqual({
        command: 'check-batch',
        mode: 'batch',
        expectedTxId: EXPECTED_TX_ID,
        burnTxHashes: [PEG_OUT_BURN_TX_ID, OTHER_PEG_OUT_BURN_TX_ID],
        bridgeEventRootHexes: [BRIDGE_EVENT_ROOT, BRIDGE_EVENT_ROOT_B],
        environment: 'testnet',
        ergoNodeNetwork: 'testnet',
        sidechainNetwork: 'patched-devnet',
        deployedStateHash: DEPLOYMENT_STATE_HASH,
      });
      expect(report.lines.join('\n')).not.toContain('approval JSON binding matched');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks check-batch live approvals without dry-run Bridge event roots', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const markdown = completedLiveRehearsal(
        {},
        batchDryRunSettlementEvidence().replace(
          `- Bridge event roots: ${BRIDGE_EVENT_ROOT},${BRIDGE_EVENT_ROOT_B} artifact://dry-run/bridge-event-roots.log\n`,
          '',
        ),
      );
      const target = writeLiveFixture(dir, markdown, batchApprovalFile(), batchAggregateEvidenceRecord());

      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Dry-Run Settlement Evidence: Bridge event roots are required for check-batch approvals binding',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks check-batch live approvals whose approval roots differ from dry-run roots', () => {
    const cases: Array<[string, string[], string[]]> = [
      ['different-root', [BRIDGE_EVENT_ROOT, OTHER_TX_ID], [BRIDGE_EVENT_ROOT, BRIDGE_EVENT_ROOT_B]],
      ['reordered-roots', [BRIDGE_EVENT_ROOT_B, BRIDGE_EVENT_ROOT], [BRIDGE_EVENT_ROOT, BRIDGE_EVENT_ROOT_B]],
    ];

    for (const [name, approvalRoots, dryRunRoots] of cases) {
      const dir = mkdtempSync(join(process.cwd(), `.tmp-live-preflight-${name}-`));
      try {
        const target = writeLiveFixture(
          dir,
          completedLiveRehearsal({}, batchDryRunSettlementEvidence(dryRunRoots)),
          batchApprovalFile({ bridgeEventRootHexes: approvalRoots }),
          batchAggregateEvidenceRecord(approvalRoots),
        );

        const report = preflightTestnetRehearsalLive({
          ...target,
          transcriptTarget: TRANSCRIPT_TARGET,
          now: NOW,
        });

        expect(report.status).toBe('BLOCKED');
        expect(report.errors).toContain(
          'Approvals: approval check-batch bridgeEventRootHexes must match Dry-Run Settlement Evidence Bridge event roots in order',
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('blocks check-batch live approvals whose dry-run root count differs from the batch burns', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-extra-dry-run-root-'));
    try {
      const target = writeLiveFixture(
        dir,
        completedLiveRehearsal({}, batchDryRunSettlementEvidence([
          BRIDGE_EVENT_ROOT,
          BRIDGE_EVENT_ROOT_B,
          OTHER_TX_ID,
        ])),
        batchApprovalFile(),
        batchAggregateEvidenceRecord(),
      );

      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Dry-Run Settlement Evidence: Bridge event roots must include exactly one 32-byte hex root for each ordered batch burn',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks placeholder and reused live-preflight evidence targets', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeFixture(dir, completedLiveRehearsal());
      const approvalsTarget = writeApprovalsFixture(dir);

      const placeholderReport = preflightTestnetRehearsalLive({
        rehearsalTarget: target,
        approvalsTarget: '<aggregate-approvals-v2.json>',
        transcriptTarget: '<artifact://live/live-preflight.log>',
        now: NOW,
      });
      const reusedReport = preflightTestnetRehearsalLive({
        rehearsalTarget: target,
        approvalsTarget,
        transcriptTarget: approvalsTarget,
        now: NOW,
      });
      const reusedRehearsalLinkReport = preflightTestnetRehearsalLive({
        rehearsalTarget: target,
        approvalsTarget,
        transcriptTarget: `[same rehearsal](${target})`,
        now: NOW,
      });

      expect(placeholderReport.status).toBe('BLOCKED');
      expect(placeholderReport.errors).toContain(
        'Approvals: --approvals must not be a template, placeholder, or non-concrete target',
      );
      expect(placeholderReport.errors).toContain(
        'Transcript target: --transcript must not be a template, placeholder, or non-concrete target',
      );
      expect(reusedReport.status).toBe('BLOCKED');
      expect(reusedReport.errors).toContain('Transcript target must be distinct from approvals target');
      expect(reusedRehearsalLinkReport.status).toBe('BLOCKED');
      expect(reusedRehearsalLinkReport.errors).toContain('Transcript target must be distinct from rehearsal target');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks placeholder broadcast enablement evidence targets inside completed live rehearsal evidence', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir, completedLiveRehearsal({
        'Reviewer approval recorded':
          `reviewer-a explicit live broadcast approval for Expected transaction ID ${EXPECTED_TX_ID} ` +
          'artifact://live/reviewer-approval-todo.md',
        'Readiness command re-run after enabling broadcast':
          'npm run demo:readiness PASS [readiness example](evidence/live/readiness-example.log)',
      }));

      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Broadcast Enablement Evidence: Reviewer approval recorded must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
      expect(report.errors).toContain(
        'Broadcast Enablement Evidence: Readiness command re-run after enabling broadcast must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks generic and sample broadcast enablement evidence targets inside completed live rehearsal evidence', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      const target = writeLiveFixture(dir, completedLiveRehearsal({
        'Reviewer approval recorded':
          `reviewer-a explicit live broadcast approval for Expected transaction ID ${EXPECTED_TX_ID} ` +
          'artifact://live/generic-reviewer-approval.md',
        'Readiness command re-run after enabling broadcast':
          'npm run demo:readiness PASS [readiness sample](evidence/live/sample-evidence-readiness.log)',
      }));

      const report = preflightTestnetRehearsalLive({
        ...target,
        transcriptTarget: TRANSCRIPT_TARGET,
        now: NOW,
      });

      expect(report.status).toBe('BLOCKED');
      expect(report.errors).toContain(
        'Broadcast Enablement Evidence: Reviewer approval recorded must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
      expect(report.errors).toContain(
        'Broadcast Enablement Evidence: Readiness command re-run after enabling broadcast must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks local-only broadcast enablement evidence targets inside completed live rehearsal evidence', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-live-preflight-'));
    try {
      for (const [reviewerTarget, readinessTarget] of [
        [
          ['file:', '', '', 'C:', 'tmp', 'reviewer-approval.md'].join('/'),
          ['C:', 'tmp', 'demo-readiness-after-enable.log'].join('/'),
        ],
        [
          'file%3A%2F%2F%2FC%3A%2Ftmp%2Freviewer-approval.md',
          'C%3A%2Ftmp%2Fdemo-readiness-after-enable.log',
        ],
        [
          'artifact://live/sourceTarget=%2Ftmp%2Freviewer-approval.md',
          'artifact://live/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fdemo-readiness-after-enable.log',
        ],
      ]) {
        const target = writeLiveFixture(dir, completedLiveRehearsal({
          'Reviewer approval recorded':
            `reviewer-a explicit live broadcast approval for Expected transaction ID ${EXPECTED_TX_ID} ` +
            `[reviewer approval](${reviewerTarget})`,
          'Readiness command re-run after enabling broadcast':
            `npm run demo:readiness PASS [readiness output](${readinessTarget})`,
        }));

        const report = preflightTestnetRehearsalLive({
          ...target,
          transcriptTarget: TRANSCRIPT_TARGET,
          now: NOW,
        });

        expect(report.status, reviewerTarget).toBe('BLOCKED');
        expect(report.errors, reviewerTarget).toContain(
          'Broadcast Enablement Evidence: Reviewer approval recorded must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
        );
        expect(report.errors, readinessTarget).toContain(
          'Broadcast Enablement Evidence: Readiness command re-run after enabling broadcast must include a completed artifact marker or non-template evidence link; targetless command-output notes are not completed evidence',
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
