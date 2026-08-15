import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const daemonSource = readFileSync(
  join(process.cwd(), 'src', 'relayer-daemon.ts'),
  'utf8',
).replace(/\r\n?/g, '\n');

function daemonTickSource(): string {
  const start = daemonSource.indexOf('  private async tick(): Promise<void> {');
  const end = daemonSource.indexOf('  private async processPegIns(', start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return daemonSource.slice(start, end);
}

function daemonStartSource(): string {
  const start = daemonSource.indexOf('  async start(): Promise<void> {');
  const end = daemonSource.indexOf(
    '  private async verifySidechainBurnForSettlement(',
    start,
  );
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return daemonSource.slice(start, end);
}

describe('Ergo read-quorum daemon boundary', () => {
  it('constructs only a statically bound dual-source pair when complete configuration exists', () => {
    expect(daemonSource).toContain(
      'const readQuorumConfig = getErgoReadQuorumSourceIdentityConfig();',
    );
    expect(daemonSource).toContain(
      'this.ergoReadQuorumSources = createErgoReadQuorumSources({',
    );
    expect(daemonSource).toContain('this.ergoReadQuorumSources = null;');
    expect(daemonSource).toContain('{ readOnly: true, direct: true }');
    expect(daemonSource).toContain(
      'requestTimeoutMs: PROTOCOL_PARAMS.ergoReadQuorumMaxAgeMs',
    );
    expect(daemonSource.match(
      /maxResponseBytes: STORAGE_RENT_MONITOR_MAX_RESPONSE_BYTES/g,
    )).toHaveLength(3);
  });

  it('requires quorum before sidechain initialization and again before startup mutation', () => {
    const start = daemonStartSource();
    const firstQuorum = start.indexOf(
      "await this.waitForErgoReadQuorum(\n      'sidechain initialization',",
    );
    const sidechainInit = start.indexOf('await this.sidechain.init();');
    const baselineProbe = start.indexOf("'startup reorg baseline'");
    const authority = start.indexOf('this.state.acquireFundsExecutionAuthority();');
    const reconciliationBoundary = start.indexOf("'startup reorg reconciliation'");
    const reconciliation = start.indexOf('await this.handleErgoReorg(ergoHeight);');

    expect(firstQuorum).toBeGreaterThanOrEqual(0);
    expect(sidechainInit).toBeGreaterThan(firstQuorum);
    expect(baselineProbe).toBeGreaterThan(sidechainInit);
    expect(authority).toBeGreaterThan(baselineProbe);
    expect(reconciliationBoundary).toBeGreaterThan(authority);
    expect(reconciliation).toBeGreaterThan(reconciliationBoundary);
    expect(start).not.toContain('this.ergo.getCurrentHeight()');
    expect(start).not.toContain('this.ergo.getBlockHeaderHash(');
    expect(start).not.toContain('getSignerKeys');
    expect(start).not.toContain('ergoSigner');
  });

  it('runs the quorum gate before any sidechain read or lifecycle selection', () => {
    const tick = daemonTickSource();
    const gate = tick.indexOf('await runErgoReadQuorumGate({');
    const decision = tick.indexOf(
      "readQuorum.decision !== 'allow_read_cycle' || readQuorum.tip === null",
    );
    const agreedTip = tick.indexOf('const ergoHeight = readQuorum.tip.height;');
    const sidechainRead = tick.indexOf(
      'await this.sidechain.getCurrentBlockNumber();',
    );
    const firstLifecycle = tick.indexOf(
      'await this.confirmPendingDupHeartbeats(ergoHeight);',
    );

    expect(gate).toBeGreaterThanOrEqual(0);
    expect(decision).toBeGreaterThan(gate);
    expect(agreedTip).toBeGreaterThan(decision);
    expect(sidechainRead).toBeGreaterThan(agreedTip);
    expect(firstLifecycle).toBeGreaterThan(sidechainRead);
  });

  it('uses the agreed quorum tip rather than a primary-only tip for the cycle baseline', () => {
    const tick = daemonTickSource();
    const gate = tick.indexOf('await runErgoReadQuorumGate({');
    const sidechainRead = tick.indexOf(
      'await this.sidechain.getCurrentBlockNumber();',
    );
    const prefix = tick.slice(gate, sidechainRead);

    expect(prefix).toContain('const ergoHeight = readQuorum.tip.height;');
    expect(prefix).toContain(
      'const currentErgoHeaderId = readQuorum.tip.headerIdHex;',
    );
    expect(prefix).not.toContain('this.ergo.getCurrentHeight()');
    expect(prefix).not.toContain('this.ergo.getBlockHeaderHash(');
  });

  it('revalidates the generation-bound decision before every value-cycle boundary', () => {
    const tick = daemonTickSource();
    const boundaries = [
      ['sidechain tip observation', 'await this.sidechain.getCurrentBlockNumber();'],
      ['Ergo reorg reconciliation', 'await this.handleErgoReorg(ergoHeight);'],
      ['pending peg-in reorg reconciliation', 'await this.reconcilePegIns(ergoHeight, true)'],
      ['DUP heartbeat confirmation', 'await this.confirmPendingDupHeartbeats(ergoHeight);'],
      ['aggregate settlement recovery', 'await this.recoverAggregateSettlementSubmissions();'],
      [
        'authenticated tracker reconstruction',
        'await this.refreshAuthenticatedSpvTrackerHistory();',
      ],
      [
        'authenticated settlement candidate reconciliation',
        'await this.reconcileAuthenticatedSettlementCandidates();',
      ],
      ['peg-in lifecycle selection', 'await this.processPegIns(ergoHeight);'],
      [
        'peg-out lifecycle selection',
        'completePegOutInventory = await this.processPegOuts(',
      ],
      ['SCS oracle lifecycle', 'await this.updateSCSOracle(sidechainHeight, ergoHeight);'],
      ['phase-two unlock lifecycle', 'await this.processPhase2Unlocks(ergoHeight);'],
      ['storage-rent monitoring', 'await this.storageRentCheck(readQuorum);'],
      [
        'MainChainLock fragmentation observation',
        'await this.observeMainChainLockFragmentation();',
      ],
      ['periodic peg-in reconciliation', 'await this.reconcilePegIns(ergoHeight);'],
      ['sync-state mutation', 'persistPegOutObservationCursor(this.state, {'],
    ] as const;

    for (const [boundary, action] of boundaries) {
      const boundaryIndex = tick.indexOf(`'${boundary}'`);
      const actionIndex = tick.indexOf(action, boundaryIndex);
      expect(boundaryIndex, boundary).toBeGreaterThanOrEqual(0);
      expect(actionIndex, action).toBeGreaterThan(boundaryIndex);
    }
    const pegOutStart = daemonSource.indexOf('private async processPegOuts');
    const pegOutEnd = daemonSource.indexOf(
      'private async findAnchoredTrackerIngest',
      pegOutStart,
    );
    const pegOut = daemonSource.slice(pegOutStart, pegOutEnd);
    const solvencyBoundary = pegOut.indexOf("'solvency alarm evaluation'");
    const solvencyAction = pegOut.indexOf(
      'await this.checkSolvencyInvariant(',
      solvencyBoundary,
    );
    expect(solvencyBoundary).toBeGreaterThanOrEqual(0);
    expect(solvencyAction).toBeGreaterThan(solvencyBoundary);
    expect(pegOut.slice(solvencyAction)).toContain('sidechainBackingSnapshot');
    expect(daemonSource).toContain(
      'this.ergoReadQuorumSupervisor.isReadCycleDecisionCurrent(',
    );
  });

  it('binds the backing decision to a complete matching vault inventory at the admitted tip', () => {
    const start = daemonSource.indexOf('private async checkSolvencyInvariant');
    const end = daemonSource.indexOf(
      'private holdFundsReleaseForUnavailableBackingAlarm',
      start,
    );
    const method = daemonSource.slice(start, end);
    const admitted = method.indexOf('requireErgoReadQuorumDecisionObservation(');
    const inventory = method.indexOf('observeErgoReadQuorumAddressBoxes(', admitted);
    const provenance = method.indexOf(
      'assertErgoReadQuorumAddressBoxSnapshotProvenance(',
      inventory,
    );
    const current = method.indexOf("'quorum-bound vault backing inventory'", provenance);
    const normalize = method.indexOf('normalizeErgoEip12BoxSnapshot(', current);
    const projection = method.indexOf(
      'projectCrossLedgerBackingAlarmFromTerminalLiabilityResolution({',
      normalize,
    );
    const finalCurrent = method.indexOf(
      "'quorum-bound backing alarm decision'",
      projection,
    );
    const decision = method.indexOf(
      'if (projection.deficitNanoErg > 0n)',
      finalCurrent,
    );

    expect(admitted).toBeGreaterThanOrEqual(0);
    expect(inventory).toBeGreaterThan(admitted);
    expect(provenance).toBeGreaterThan(inventory);
    expect(current).toBeGreaterThan(provenance);
    expect(normalize).toBeGreaterThan(current);
    expect(projection).toBeGreaterThan(normalize);
    expect(finalCurrent).toBeGreaterThan(projection);
    expect(decision).toBeGreaterThan(finalCurrent);
    expect(method).not.toContain('this.ergo.getUnspentBoxesByAddress(');
  });

  it('propagates the active decision to retained read guards and excludes retired transports', () => {
    expect(daemonSource).toContain(
      'private activeErgoReadCycleDecision: AllowedErgoReadCycleDecision | null = null;',
    );
    expect(daemonTickSource()).toContain(
      'this.activeErgoReadCycleDecision = readQuorum;',
    );
    expect(daemonStartSource()).toContain(
      'this.activeErgoReadCycleDecision = null;',
    );
    expect(daemonSource).toContain(
      'assertReadQuorumCurrent: boundary =>',
    );
    expect(daemonSource).not.toContain('SCS oracle signer loading');
    expect(daemonSource).not.toContain('submitScsOracleUpdate({');
    expect(daemonSource).toContain(
      'SCS oracle mutation is retired; finalized sidechain state is observation-only',
    );
    expect(daemonSource).not.toContain('DUP heartbeat signer loading');
    expect(daemonSource).not.toContain('submitDupHeartbeatTouch({');
    expect(daemonSource).not.toContain('peg-in commitment signer loading');
    expect(daemonSource).not.toContain('peg-in commitment fee selection');
    expect(daemonSource).not.toContain('submitPegInCommittedVaultTransition');
    expect(daemonSource).toContain(
      'this.assertActiveErgoReadQuorumDecision(boundary)',
    );
  });
});
