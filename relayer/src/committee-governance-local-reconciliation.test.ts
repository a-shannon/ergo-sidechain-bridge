import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildLocalCommitteeGovernanceReconciliationPacket,
  buildLocalCommitteeGovernanceWrongNetworkPacket,
} from './committee-governance-local-reconciliation.js';
import { validateCommitteeGovernanceReconciliationJson } from './committee-governance-reconciliation.js';

describe('local committee governance reconciliation producer', () => {
  it('builds sanitized reconciliation and wrong-network packets accepted by the validator', () => {
    const observedAt = '2026-07-02T13:00:00.000Z';
    const reconciliation = validateCommitteeGovernanceReconciliationJson(
      buildLocalCommitteeGovernanceReconciliationPacket(observedAt),
    );
    const wrongNetwork = validateCommitteeGovernanceReconciliationJson(
      buildLocalCommitteeGovernanceWrongNetworkPacket(observedAt),
    );

    expect(reconciliation).toMatchObject({
      status: 'LINKED',
      kind: 'deployment-state-reconciliation',
      sourceLabel: 'local public Gate 6 governance reconciliation input',
      networkBinding: {
        expectedNetwork: 'testnet',
        observedNetwork: 'testnet',
        matched: true,
      },
      newCommittee: {
        threshold: 2,
        memberCount: 3,
      },
    });
    expect(Object.keys(reconciliation.singletonIdentities)).toEqual([
      'sideChainState',
      'aggregateDup',
      'batchDup',
      'spvTracker',
      'sideChainStateContract',
      'governanceContract',
    ]);
    expect(reconciliation.boundary).toMatchObject({
      readOnly: true,
      sanitizedPublicInputOnly: true,
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
    });

    expect(wrongNetwork).toMatchObject({
      status: 'LINKED',
      kind: 'wrong-network-negative',
      sourceLabel: 'local public Gate 6 wrong-network negative input',
      networkBinding: {
        expectedNetwork: 'testnet',
        observedNetwork: 'patched-devnet',
        matched: false,
      },
    });
  });

  it('prints producer claim boundaries in CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/committee-governance-local-reconciliation.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run governance:reconcile:local-packets');
    expect(result.stdout).toContain('does not load environment files');
    expect(result.stdout).toContain('not Gate 6 closure');
    expect(result.stdout).toContain('not key-rotation completion');
    expect(result.stdout).toContain('not deployment approval');
  });

  it('writes JSON packets accepted by the reconciliation validator CLI', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-governance-local-reconciliation-'));
    try {
      const reconciliationTarget = join(basename(dir), 'reconciliation.json');
      const wrongNetworkTarget = join(basename(dir), 'wrong-network.json');
      const reconciliationReportTarget = join(basename(dir), 'reconciliation-report.json');
      const wrongNetworkReportTarget = join(basename(dir), 'wrong-network-report.json');
      const producer = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/committee-governance-local-reconciliation.ts',
          '--observed-at',
          '2026-07-02T13:00:00.000Z',
          '--reconciliation-out',
          reconciliationTarget,
          '--wrong-network-out',
          wrongNetworkTarget,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(producer.status).toBe(0);
      expect(producer.stderr).toBe('');
      expect(producer.stdout).toContain('Committee governance reconciliation JSON: written');

      const reconciliation = runValidator(reconciliationTarget, reconciliationReportTarget);
      const wrongNetwork = runValidator(wrongNetworkTarget, wrongNetworkReportTarget);

      expect(reconciliation.status).toBe(0);
      expect(reconciliation.stderr).toBe('');
      expect(reconciliation.stdout).toContain('| Result | LINKED |');
      expect(reconciliation.stdout).toContain('| Deployment-state reconciliation linked | yes |');

      expect(wrongNetwork.status).toBe(0);
      expect(wrongNetwork.stderr).toBe('');
      expect(wrongNetwork.stdout).toContain('| Result | LINKED |');
      expect(wrongNetwork.stdout).toContain('| Wrong-network rejection linked | yes |');

      const reconciliationReport = JSON.parse(readFileSync(join(process.cwd(), reconciliationReportTarget), 'utf8'));
      const wrongNetworkReport = JSON.parse(readFileSync(join(process.cwd(), wrongNetworkReportTarget), 'utf8'));
      expect(reconciliationReport.status).toBe('LINKED');
      expect(wrongNetworkReport.status).toBe('LINKED');
      expect(reconciliationReport.boundary.keyRotationAuthorized).toBe(false);
      expect(wrongNetworkReport.boundary.gate6Closure).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects unsafe output targets before writing packets', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/committee-governance-local-reconciliation.ts',
        '--observed-at',
        '2026-07-02T13:00:00.000Z',
        '--reconciliation-out',
        '../operator/private-key-governance-reconciliation.json',
        '--wrong-network-out',
        'tmp-governance-safe/wrong-network.json',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('--reconciliation-out <blocked output target> must not target runtime or secret-bearing material');
  });
});

function runValidator(inputTarget: string, reportTarget: string) {
  return spawnSync(
    process.execPath,
    [
      'node_modules/tsx/dist/cli.mjs',
      'src/scripts/validate-committee-governance-reconciliation.ts',
      '--reconciliation-json',
      inputTarget,
      '--observed-at',
      '2026-07-02T13:00:00.000Z',
      '--json-out',
      reportTarget,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );
}
