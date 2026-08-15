import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { runPegInPostMintRecovery } from '../apps/bridge-daemon/peg-in-post-mint-recovery.js';
import {
  OPERATOR_RECOVERY_DRILL_ABSENT_CAPABILITIES,
  OPERATOR_RECOVERY_DRILL_EXPECTATIONS,
  OPERATOR_RECOVERY_DRILL_SCHEMA,
  runOperatorRecoveryDrill,
} from './operator-recovery-drill.js';

const ZERO_TRAPPED_CAPABILITIES = {
  transportReservation: 0,
  fundsAuthorityAcquire: 0,
  fundsReleaseAuthorize: 0,
  fundsTransportStart: 0,
} as const;

describe('operator recovery drill', () => {
  it('exercises the exact recovery matrix through ephemeral durable state', async () => {
    const report = await runOperatorRecoveryDrill();

    expect(report.schema).toBe(OPERATOR_RECOVERY_DRILL_SCHEMA);
    expect(report.result).toBe('PASS');
    expect(report.caseCount).toBe(7);
    expect(report.networkConfigured).toBe(false);
    expect(report.privateRuntimeDatabaseRead).toBe(false);
    expect(report.ephemeralDatabaseUsed).toBe(true);
    expect(report.absentCapabilities).toEqual(
      OPERATOR_RECOVERY_DRILL_ABSENT_CAPABILITIES,
    );
    expect(report.cases.map(value => ({
      id: value.id,
      expectedOutcome: value.expectedOutcome,
    }))).toEqual(OPERATOR_RECOVERY_DRILL_EXPECTATIONS);
    expect(report.cases.every(value => value.result === 'PASS')).toBe(true);
    expect(report.cases.map(value => value.trappedCapabilities)).toEqual(
      Array.from({ length: 7 }, () => ZERO_TRAPPED_CAPABILITIES),
    );
    expect(report.trappedCapabilityTotals).toEqual(ZERO_TRAPPED_CAPABILITIES);

    const byId = new Map(report.cases.map(value => [value.id, value]));
    expect(byId.get('H01_NORMAL_RESTART')?.stages).toMatchObject({
      reopen: 1,
      reconstruct: 2,
      sourceObserve: 4,
      journalRead: 1,
      holdInspect: 1,
    });
    expect(byId.get('H02_DATABASE_LOSS')?.stages).toMatchObject({
      reopen: 2,
      reconstruct: 2,
      sourceObserve: 4,
      holdInspect: 1,
    });
    expect(byId.get('H03_STALE_OR_COPY')?.stages).toMatchObject({
      reopen: 1,
      reconstruct: 2,
      sourceObserve: 4,
      incidentWrite: 1,
      holdInspect: 1,
    });
    expect(byId.get('H04_DIVERGENT_RPC')?.stages).toMatchObject({
      reopen: 1,
      reconstruct: 1,
      sourceObserve: 2,
      disagreement: 1,
      journalWrite: 0,
      holdInspect: 1,
    });
    expect(byId.get('H05_EVENT_REORDER')?.stages).toMatchObject({
      reopen: 1,
      candidateList: 1,
      outOfOrderReject: 4,
      holdInspect: 1,
    });
    expect(byId.get('H06_REORG_CONTAINMENT')?.stages).toMatchObject({
      reopen: 1,
      incidentWrite: 1,
      burnObserve: 1,
      burnTransition: 1,
      rollbackWrite: 1,
      quarantineWrite: 0,
      holdInspect: 1,
    });
    expect(byId.get('H06_REORG_CONTAINMENT')?.stages.ergoObserve).toBeGreaterThan(0);
    expect(byId.get('H07_PARTIAL_PERSISTENCE')?.stages).toMatchObject({
      reopen: 2,
      reconstruct: 2,
      sourceObserve: 4,
      incidentWriteAttempt: 2,
      incidentWrite: 1,
      holdInspect: 2,
    });
  });

  it('emits identical structured evidence for identical inputs', async () => {
    const first = await runOperatorRecoveryDrill();
    const second = await runOperatorRecoveryDrill();

    expect(second).toEqual(first);
    expect(first.caseSetDigestHex).toMatch(/^[0-9a-f]{64}$/);
    expect(first.reportDigestHex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('has no configuration, network, private-state, or value-release adapter', () => {
    const source = readFileSync(
      new URL('./operator-recovery-drill.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toMatch(
      /process\.env|\.env\b|deployed_state|private runtime|wallet material|mnemonic/i,
    );
    expect(source).not.toMatch(/\b(?:fetch|axios|JsonRpcProvider|WebSocket)\b/);
    expect(source).not.toMatch(
      /from ['"][^'"]*(?:signer|submitter|broadcast)[^'"]*['"]/i,
    );
    expect(source).not.toMatch(
      /\brunAuthenticatedSettlementReservedExecution\s*\(/,
    );
    expect(source).not.toMatch(
      /better-sqlite3|rawDatabase|CREATE\s+TRIGGER|DROP\s+TRIGGER/i,
    );
    expect(source).toContain("['acquireFundsExecutionAuthority', 'fundsAuthorityAcquire']");
    expect(source).toContain("['assertFundsReleaseAuthorized', 'fundsReleaseAuthorize']");
    expect(source).toContain("['startFundsReleaseTransport', 'fundsTransportStart']");
    expect(source).not.toMatch(/unlinkSync|clear\w*Hold/);
  });

  it('keeps post-mint recovery behind a route-report and incident-only root', () => {
    const drillSource = readFileSync(
      new URL('./operator-recovery-drill.ts', import.meta.url),
      'utf8',
    );
    const applicationSource = readFileSync(
      new URL('../apps/bridge-daemon/peg-in-post-mint-recovery.ts', import.meta.url),
      'utf8',
    );
    const adapterSource = readFileSync(
      new URL('../adapters/peg-in-post-mint-recovery.ts', import.meta.url),
      'utf8',
    );
    const coreSource = readFileSync(
      new URL('../relayer-core/peg-in-post-mint-recovery.ts', import.meta.url),
      'utf8',
    );

    expect(adapterSource).toContain('getPegInByBoxId(');
    expect(adapterSource).toContain('getPegInRouteReconstructionSnapshot()');
    expect(adapterSource).toContain('state.markPegInIncident(sourceBoxIdHex');
    expect(adapterSource).not.toMatch(
      /from ['"]\.\.\/(?:peg-in-route-cache-recovery|state-tracker)\.js['"]/,
    );
    expect(applicationSource).toMatch(
      /from '\.\.\/\.\.\/adapters\/peg-in-post-mint-recovery\.js'/,
    );
    expect(applicationSource).toMatch(
      /from '\.\.\/\.\.\/relayer-core\/peg-in-post-mint-recovery\.js'/,
    );
    expect(applicationSource).not.toMatch(
      /peg-in-route-cache-recovery|state-tracker|peg-in-transition/,
    );
    expect(applicationSource).toContain(
      'deps.assertRecoveryReportProvenance(recovery);',
    );
    expect(applicationSource).not.toMatch(/\bevent\s*:/);
    expect(drillSource).toContain(
      'assertRecoveryReportProvenance:',
    );
    expect(drillSource).toContain(
      'assertPegInRouteCacheRecoveryReportProvenance,',
    );
    expect(drillSource).toMatch(
      /runPegInPostMintRecovery\([\s\S]*?PEG_IN_POST_MINT_RECOVERY_DEPS[\s\S]*?\)/,
    );
    expect(coreSource).not.toMatch(/^import\s/m);
    expect([applicationSource, adapterSource, coreSource].join('\n')).not.toMatch(
      /ErgoClient|SidechainClient|PegInTransitionCoordinator|assertFundsReleaseAuthorized|startFundsReleaseTransport/,
    );
    expect([applicationSource, adapterSource, coreSource].join('\n')).not.toMatch(
      /deriveCommitmentTxId|submitCommitment|broadcast|signer|submitter/i,
    );
  });

  it('checks report provenance before loading the persisted lifecycle by exact ID', () => {
    const sourceBoxIdHex = 'ab'.repeat(32);
    let lifecycleReads = 0;
    let incidentWrites = 0;
    const state = {
      getPegInByBoxId: (value: string) => {
        lifecycleReads += 1;
        expect(value).toBe(sourceBoxIdHex);
        return undefined;
      },
      getPegInRouteReconstructionSnapshot: () => {
        throw new Error('route snapshot must not be read without a persisted lifecycle');
      },
      markPegInIncident: () => {
        incidentWrites += 1;
      },
    };
    const recovery = {
      reconstructionDigestHex: 'cd'.repeat(32),
      observationDigestHex: 'ef'.repeat(32),
    };

    expect(() => runPegInPostMintRecovery(
      sourceBoxIdHex,
      recovery,
      state,
      {
        assertRecoveryReportProvenance: () => {
          throw new Error('unproven route report');
        },
      },
    )).toThrow('unproven route report');
    expect(lifecycleReads).toBe(0);

    expect(() => runPegInPostMintRecovery(
      sourceBoxIdHex,
      recovery,
      state,
      { assertRecoveryReportProvenance: () => undefined },
    )).toThrow('persisted peg-in lifecycle row');
    expect(lifecycleReads).toBe(1);
    expect(incidentWrites).toBe(0);
  });
});
