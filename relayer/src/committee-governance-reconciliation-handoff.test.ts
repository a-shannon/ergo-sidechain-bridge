import { spawnSync } from 'child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  buildCommitteeGovernanceReconciliationHandoffCommand,
  buildCommitteeGovernanceReconciliationHandoffReport,
  formatCommitteeGovernanceReconciliationHandoffMarkdown,
} from './committee-governance-reconciliation-handoff.js';
import type {
  CommitteeGovernanceReconciliationHandoffReport,
} from './committee-governance-reconciliation-handoff.js';
import type {
  CommitteeGovernanceReconciliationReport,
} from './committee-governance-reconciliation.js';

const reconciliationTarget = '../evidence/governance/artifacts/completed-reconciliation-report.json';
const wrongNetworkTarget = '../evidence/governance/artifacts/completed-wrong-network-report.json';

function expectedBoundary() {
  return {
    readOnly: true,
    sanitizedPublicInputOnly: true,
    privateDeploymentStateIncluded: false,
    deploymentStateOpened: false,
    runtimeDatabaseOpened: false,
    secretOrEnvironmentFileRead: false,
    signingOrWalletMaterialRead: false,
    nodeOrRpcRequestPerformed: false,
    keyRotationAuthorized: false,
    transactionBroadcastOrMutation: false,
    gate6Closure: false,
    governanceReadyClaimSupport: false,
    productionClaimSupport: false,
    testnetProductionCandidateClaimSupport: false,
  };
}

function linkedReconciliationReport(
  overrides: Partial<CommitteeGovernanceReconciliationReport> = {},
): CommitteeGovernanceReconciliationReport {
  return {
    schemaVersion: 1,
    command: 'governance:reconcile:validate',
    status: 'LINKED',
    kind: 'deployment-state-reconciliation',
    reason:
      'Sanitized deployment-state reconciliation binds network, singleton identity, old authority, new committee authority, and rollback state.',
    observedAt: '2026-07-02T13:00:00.000Z',
    sourceLabel: 'local public Gate 6 governance reconciliation input',
    targetLabel: 'sanitized non-mainnet committee reconciliation packet',
    deploymentStateDigestHex: '31'.repeat(32),
    sidechainIdHex: '32'.repeat(32),
    scsNftId: '33'.repeat(32),
    singletonIdentities: {
      sideChainState: '34'.repeat(32),
      aggregateDup: '35'.repeat(32),
      spvTracker: '36'.repeat(32),
    },
    oldAuthority: {
      label: 'previous committee authority public identifier',
      publicIdentifiers: [`02${'41'.repeat(32)}`],
    },
    newCommittee: {
      threshold: 2,
      memberCount: 3,
      publicIdentifiers: [
        `02${'51'.repeat(32)}`,
        `02${'52'.repeat(32)}`,
        `02${'53'.repeat(32)}`,
      ],
    },
    rollback: {
      previousAuthorityDigestHex: '61'.repeat(32),
      rollbackStateDigestHex: '62'.repeat(32),
      recoveryPath: 'rollback to previous-authority recovery packet if the committee rotation fails',
    },
    stopCondition: 'Stop and block rotation if network, singleton, authority, or rollback binding mismatches.',
    networkBinding: {
      expectedNetwork: 'testnet',
      observedNetwork: 'testnet',
      matched: true,
    },
    issueCount: 0,
    issues: [],
    commandLine:
      'npm run governance:reconcile:validate -- --reconciliation-json ../evidence/governance/artifacts/reconciliation-input.json --out <report.md> --json-out <report.json>',
    workingDirectory: 'ergo-sidechain-bridge/relayer',
    boundary: expectedBoundary(),
    ...overrides,
  };
}

function linkedWrongNetworkReport(
  overrides: Partial<CommitteeGovernanceReconciliationReport> = {},
): CommitteeGovernanceReconciliationReport {
  return {
    schemaVersion: 1,
    command: 'governance:reconcile:validate',
    status: 'LINKED',
    kind: 'wrong-network-negative',
    reason: 'Wrong-network negative evidence blocks committee governance rotation when network binding mismatches.',
    observedAt: '2026-07-02T13:00:00.000Z',
    sourceLabel: 'local public Gate 6 wrong-network negative input',
    targetLabel: 'sanitized non-mainnet wrong-network packet',
    deploymentStateDigestHex: '31'.repeat(32),
    singletonIdentities: {},
    stopCondition:
      'Governance rotation blocked because the deployment-state network does not match the intended testnet target.',
    networkBinding: {
      expectedNetwork: 'testnet',
      observedNetwork: 'patched-devnet',
      matched: false,
    },
    issueCount: 0,
    issues: [],
    commandLine:
      'npm run governance:reconcile:validate -- --reconciliation-json ../evidence/governance/artifacts/wrong-network-input.json --out <report.md> --json-out <report.json>',
    workingDirectory: 'ergo-sidechain-bridge/relayer',
    boundary: expectedBoundary(),
    ...overrides,
  };
}

describe('committee governance reconciliation handoff', () => {
  it('composes linked reconciliation reports into an operator handoff without closing Gate 6', () => {
    const report = buildCommitteeGovernanceReconciliationHandoffReport({
      command: buildCommitteeGovernanceReconciliationHandoffCommand({
        reconciliationReportJson: reconciliationTarget,
        wrongNetworkReportJson: wrongNetworkTarget,
      }),
      reconciliationReport: linkedReconciliationReport(),
      reconciliationReportSource: { mode: 'json', target: reconciliationTarget },
      wrongNetworkReport: linkedWrongNetworkReport(),
      wrongNetworkReportSource: { mode: 'json', target: wrongNetworkTarget },
    });
    const markdown = formatCommitteeGovernanceReconciliationHandoffMarkdown(report);

    expect(report.status).toBe('READY');
    expect(report.exitCode).toBe(0);
    expect(report.issueCount).toBe(0);
    expect(report.linkedPrerequisiteRows).toEqual([
      {
        row: 'Rotation Plan: Reconcile deployment state',
        status: 'prerequisite-linked',
        reportTarget: reconciliationTarget,
        remainingBoundary: 'Operator must bind this sanitized report into completed committee governance evidence before Gate 6 can close.',
      },
      {
        row: 'Negative Checks: Deployment state points to the wrong network',
        status: 'prerequisite-linked',
        reportTarget: wrongNetworkTarget,
        remainingBoundary: 'Operator must bind this wrong-network negative report into completed committee governance evidence before Gate 6 can close.',
      },
    ]);
    expect(report.operatorPacket.newCommitteeThreshold).toBe('2/3');
    expect(report.operatorPacket.singletonIdentityCount).toBe(3);
    expect(report.operatorPacket.rollbackBindingLinked).toBe(true);
    expect(report.boundary['Gate 6 committee governance closure claimed']).toBe('no');
    expect(report.boundary['Governance-ready claim supported']).toBe('no');
    expect(report.boundary['Transaction broadcast, submit, deploy, key rotation, or state mutation performed']).toBe('no');
    expect(markdown).toContain('# Gate 6 Governance Reconciliation Operator Handoff');
    expect(markdown).toContain('| Result | READY |');
    expect(markdown).toContain('| Reconcile deployment state | prerequisite-linked |');
    expect(markdown).toContain('| Wrong-network expected network | testnet |');
    expect(markdown).toContain('| Wrong-network observed network | patched-devnet |');
    expect(markdown).toContain('This handoff does not close Gate 6');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('blocks reused targets, malformed kinds, and claim-escalating input reports', () => {
    const report = buildCommitteeGovernanceReconciliationHandoffReport({
      command: buildCommitteeGovernanceReconciliationHandoffCommand({
        reconciliationReportJson: reconciliationTarget,
        wrongNetworkReportJson: reconciliationTarget,
      }),
      reconciliationReport: linkedReconciliationReport({
        boundary: {
          ...expectedBoundary(),
          gate6Closure: true,
          transactionBroadcastOrMutation: true,
        },
      }),
      reconciliationReportSource: { mode: 'json', target: reconciliationTarget },
      wrongNetworkReport: linkedReconciliationReport(),
      wrongNetworkReportSource: { mode: 'json', target: reconciliationTarget },
    });

    expect(report.status).toBe('BLOCKED');
    expect(report.exitCode).toBe(1);
    expect(report.issues).toContain('reconciliation and wrong-network report targets must be distinct');
    expect(report.issues).toContain('wrong-network report kind must be wrong-network-negative');
    expect(report.issues).toContain('reconciliation report boundary.transactionBroadcastOrMutation must be false');
    expect(report.issues).toContain('reconciliation report boundary.gate6Closure must be false');
  });

  it('builds a bounded command label without echoing output paths', () => {
    expect(buildCommitteeGovernanceReconciliationHandoffCommand({
      reconciliationReportJson: reconciliationTarget,
      wrongNetworkReportJson: wrongNetworkTarget,
      out: '../evidence/governance/artifacts/handoff.md',
      jsonOut: '../evidence/governance/artifacts/handoff.json',
    })).toBe(
      'npm run governance:reconcile:handoff -- --reconciliation-report-json ../evidence/governance/artifacts/completed-reconciliation-report.json --wrong-network-report-json ../evidence/governance/artifacts/completed-wrong-network-report.json --out <report.md> --json-out <report.json>',
    );
  });

  it('writes guarded Markdown and JSON artifacts from linked reconciliation report JSON', () => {
    const suffix = `${process.pid}-${Date.now()}`;
    const reconciliationJson = `../evidence/governance/artifacts/tmp-gate6-reconciliation-report-${suffix}.json`;
    const wrongNetworkJson = `../evidence/governance/artifacts/tmp-gate6-wrong-network-report-${suffix}.json`;
    const out = `../evidence/governance/artifacts/tmp-gate6-reconciliation-handoff-${suffix}.md`;
    const jsonOut = `../evidence/governance/artifacts/tmp-gate6-reconciliation-handoff-${suffix}.json`;
    const reconciliationPath = join(process.cwd(), reconciliationJson);
    const wrongNetworkPath = join(process.cwd(), wrongNetworkJson);
    const outPath = join(process.cwd(), out);
    const jsonOutPath = join(process.cwd(), jsonOut);

    try {
      writeFileSync(reconciliationPath, `${JSON.stringify(linkedReconciliationReport(), null, 2)}\n`, 'utf8');
      writeFileSync(wrongNetworkPath, `${JSON.stringify(linkedWrongNetworkReport(), null, 2)}\n`, 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/committee-governance-reconciliation-handoff.ts',
          '--reconciliation-report-json',
          reconciliationJson,
          '--wrong-network-report-json',
          wrongNetworkJson,
          '--out',
          out,
          '--json-out',
          jsonOut,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('# Gate 6 Governance Reconciliation Operator Handoff');
      expect(result.stdout).toContain('- committee governance reconciliation handoff JSON report written: ../evidence/governance/artifacts/');
      expect(existsSync(outPath)).toBe(true);
      expect(existsSync(jsonOutPath)).toBe(true);
      const written = JSON.parse(readFileSync(jsonOutPath, 'utf8')) as CommitteeGovernanceReconciliationHandoffReport;
      expect(written.status).toBe('READY');
      expect(written.reconciliationReportSource.target).toBe(reconciliationJson);
      expect(written.wrongNetworkReportSource.target).toBe(wrongNetworkJson);
      expect(written.boundary['Gate 6 committee governance closure claimed']).toBe('no');
      expect(JSON.stringify(written)).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(reconciliationPath, { force: true });
      rmSync(wrongNetworkPath, { force: true });
      rmSync(outPath, { force: true });
      rmSync(jsonOutPath, { force: true });
    }
  });

  it('exposes the handoff composer through npm scripts', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));

    expect(pkg.scripts['governance:reconcile:handoff']).toBe(
      'tsx src/scripts/committee-governance-reconciliation-handoff.ts',
    );
  });
});
