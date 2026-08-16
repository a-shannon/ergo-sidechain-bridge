import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

import { describe, expect, it } from 'vitest';

const HEX = {
  sidechainId: '1'.repeat(64),
  deploymentDigest: '2'.repeat(64),
  scsNft: '3'.repeat(64),
  sideChainStateBox: '4'.repeat(64),
  aggregateDupBox: '5'.repeat(64),
  spvTrackerBox: '6'.repeat(64),
  oldAuthority: '7'.repeat(64),
  newCommittee1: '8'.repeat(64),
  newCommittee2: '9'.repeat(64),
  newCommittee3: 'a'.repeat(64),
  rollbackAuthority: 'b'.repeat(64),
  rollbackState: 'c'.repeat(64),
};

const SCRIPT = 'src/scripts/validate-committee-governance-reconciliation.ts';

function validReconciliationPacket(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'deployment-state-reconciliation',
    sourceLabel: 'operator sanitized committee governance reconciliation',
    targetLabel: 'sanitized non-mainnet committee reconciliation packet',
    observedAt: '2026-07-02T12:00:00.000Z',
    expectedNetwork: 'testnet',
    observedNetwork: 'testnet',
    deploymentStateDigestHex: HEX.deploymentDigest,
    sidechainIdHex: HEX.sidechainId,
    scsNftId: HEX.scsNft,
    singletonIdentities: {
      sideChainState: HEX.sideChainStateBox,
      aggregateDup: HEX.aggregateDupBox,
      spvTracker: HEX.spvTrackerBox,
    },
    oldAuthority: {
      label: 'previous committee authority',
      publicIdentifiers: [HEX.oldAuthority],
    },
    newCommittee: {
      threshold: 2,
      memberCount: 3,
      publicIdentifiers: [HEX.newCommittee1, HEX.newCommittee2, HEX.newCommittee3],
    },
    rollback: {
      previousAuthorityDigestHex: HEX.rollbackAuthority,
      rollbackStateDigestHex: HEX.rollbackState,
      recoveryPath: 'rollback to previous-authority recovery packet if committee rotation fails',
    },
    stopCondition: 'Stop and block rotation if network, singleton, authority, or rollback binding mismatches.',
    boundary: expectedBoundary(),
    ...overrides,
  };
}

function validWrongNetworkPacket(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'wrong-network-negative',
    sourceLabel: 'operator sanitized wrong-network governance negative evidence',
    targetLabel: 'sanitized non-mainnet wrong-network packet',
    observedAt: '2026-07-02T12:30:00.000Z',
    expectedNetwork: 'testnet',
    observedNetwork: 'patched-devnet',
    deploymentStateDigestHex: HEX.deploymentDigest,
    stopCondition: 'Governance rotation blocked because the deployment-state network does not match the intended testnet target.',
    boundary: expectedBoundary(),
    ...overrides,
  };
}

function expectedBoundary(): Record<string, unknown> {
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

function runValidator(packet: Record<string, unknown>, stem: string) {
  const outputDir = mkdtempSync(join(process.cwd(), `.tmp-gov-reconcile-${stem}-`));
  const inputTarget = `${basename(outputDir)}/input.json`;
  const markdownTarget = `${basename(outputDir)}/report.md`;
  const jsonTarget = `${basename(outputDir)}/report.json`;
  writeFileSync(join(process.cwd(), inputTarget), JSON.stringify(packet, null, 2));

  const result = spawnSync(
    process.execPath,
    [
      'node_modules/tsx/dist/cli.mjs',
      SCRIPT,
      '--reconciliation-json',
      inputTarget,
      '--out',
      markdownTarget,
      '--json-out',
      jsonTarget,
    ],
    { cwd: process.cwd(), encoding: 'utf8' },
  );

  return {
    outputDir,
    markdownPath: join(process.cwd(), markdownTarget),
    jsonPath: join(process.cwd(), jsonTarget),
    result,
  };
}

describe('committee governance reconciliation evidence', () => {
  it('writes linked Markdown and JSON reports from sanitized reconciliation JSON', () => {
    const run = runValidator(validReconciliationPacket(), 'linked');

    try {
      expect(run.result.status).toBe(0);
      expect(run.result.stderr).toBe('');
      expect(run.result.stdout).toContain('# Gate 6 Deployment-State Reconciliation Report');
      expect(run.result.stdout).toContain('| Result | LINKED |');
      expect(run.result.stdout).toContain('| Network binding matched | yes |');
      expect(run.result.stdout).toContain('| Gate 6 committee governance closure claimed | no |');
      expect(run.result.stdout).toContain('committee governance reconciliation JSON report written');

      const jsonReport = JSON.parse(readFileSync(run.jsonPath, 'utf8'));
      expect(jsonReport).toMatchObject({
        schemaVersion: 1,
        command: 'governance:reconcile:validate',
        status: 'LINKED',
        kind: 'deployment-state-reconciliation',
        networkBinding: {
          expectedNetwork: 'testnet',
          observedNetwork: 'testnet',
          matched: true,
        },
      });
      expect(jsonReport.boundary.transactionBroadcastOrMutation).toBe(false);

      const markdown = readFileSync(run.markdownPath, 'utf8');
      expect(markdown).not.toContain('privateKey');
      expect(markdown).not.toContain('mnemonic');
      expect(markdown).not.toContain('bridge-state.sqlite');
    } finally {
      rmSync(run.outputDir, { recursive: true, force: true });
    }
  });

  it('links wrong-network negative evidence only when the observed network mismatches and the stop condition blocks rotation', () => {
    const linked = runValidator(validWrongNetworkPacket(), 'wrong-network-linked');
    const matching = runValidator(validWrongNetworkPacket({ observedNetwork: 'testnet' }), 'wrong-network-matching');

    try {
      expect(linked.result.status).toBe(0);
      expect(linked.result.stdout).toContain('| Result | LINKED |');
      expect(linked.result.stdout).toContain('| Wrong-network rejection linked | yes |');

      expect(matching.result.status).toBe(1);
      expect(matching.result.stdout).toContain('| Result | BLOCKED |');
      expect(matching.result.stdout).toContain('wrong-network negative evidence requires expected and observed networks to differ');
    } finally {
      rmSync(linked.outputDir, { recursive: true, force: true });
      rmSync(matching.outputDir, { recursive: true, force: true });
    }
  }, 15_000);

  it('blocks unsafe fields and claim-escalating boundaries before they can support Gate 6 evidence', () => {
    const run = runValidator({
      ...validReconciliationPacket({
        privateDeploymentStateDump: { network: 'testnet' },
        targetLabel: 'sanitized packet with production-ready governance approval',
        boundary: {
          ...expectedBoundary(),
          deploymentStateOpened: true,
          gate6Closure: true,
        },
      }),
    }, 'blocked');

    try {
      expect(run.result.status).toBe(1);
      expect(run.result.stdout).toContain('| Result | BLOCKED |');
      expect(run.result.stdout).toContain('reconciliation JSON unexpected field privateDeploymentStateDump is not allowed');
      expect(run.result.stdout).toContain('targetLabel must not contain production or mainnet claim wording');
      expect(run.result.stdout).toContain('boundary.deploymentStateOpened must be false');
      expect(run.result.stdout).toContain('boundary.gate6Closure must be false');
    } finally {
      rmSync(run.outputDir, { recursive: true, force: true });
    }
  });

  it('exposes the reconciliation validator through npm scripts', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'));

    expect(pkg.scripts['governance:reconcile:validate']).toBe(
      'tsx src/scripts/validate-committee-governance-reconciliation.ts',
    );
  });

  it('keeps the CLI independent from runtime state and secret-bearing inputs', () => {
    const scriptPath = join(process.cwd(), SCRIPT);
    expect(existsSync(scriptPath)).toBe(true);
    if (!existsSync(scriptPath)) return;

    const source = readFileSync(scriptPath, 'utf8');
    expect(source).not.toMatch(/dotenv|better-sqlite3|axios|ErgoClient|deployed_state|bridge-state\.sqlite/i);
    expect(source).toContain('readEvidenceJsonTarget');
    expect(source).toContain('writeOfflineReportJson');
    expect(source).toContain("'wx'");
  });
});
