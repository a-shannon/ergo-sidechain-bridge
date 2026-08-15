import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const daemonSource = readFileSync(
  join(process.cwd(), 'src', 'relayer-daemon.ts'),
  'utf8',
).replace(/\r\n?/g, '\n');

function methodSource(
  startMarker: string,
  endMarker: string,
): string {
  const start = daemonSource.indexOf(startMarker);
  const end = daemonSource.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return daemonSource.slice(start, end);
}

describe('operator health daemon boundary', () => {
  it('emits through the static read-only composition after cycle authority clears', () => {
    expect(daemonSource).toContain(
      "from './apps/bridge-daemon/operator-health.js';",
    );
    expect(daemonSource).toContain(
      "this.activeErgoReadCycleDecision = null;\n          this.emitOperatorHealthProjection('cycle');",
    );
    expect(daemonSource).toContain(
      "this.emitOperatorHealthProjection('startup');",
    );
  });

  it('does not mutate hold state or log raw failures from the health method', () => {
    const method = methodSource(
      '  private emitOperatorHealthProjection(',
      '  private requireCurrentErgoReadQuorumDecision(',
    );

    expect(method).toContain('buildBridgeDaemonOperatorHealth({');
    expect(method).toContain("signerAvailability: 'not_configured'");
    expect(method).toContain('operatorHealthStateFingerprint(projection)');
    expect(method).toContain('getPegInCircuitBreakerState()');
    expect(method).toContain('ergoReadQuorumSupervisor.peekSnapshot()');
    expect(method).not.toContain('ergoReadQuorumSupervisor.getSnapshot(');
    expect(method).not.toContain('isFundsReleaseHeld(');
    expect(method).not.toMatch(
      /\b(?:loadSigner|runSigner|checker|submit|broadcast|authorize|privateKey|mnemonic)\b/i,
    );
    expect(method).not.toMatch(/\b(?:boxId|transactionId|burnId|digestHex)\b/);
    expect(method).not.toContain('error.message');
    expect(method).toContain("'operator_health_unavailable'");
  });

  it('records freshness only after the corresponding exact observations', () => {
    const tracker = methodSource(
      '  private async refreshAuthenticatedSpvTrackerHistory()',
      '  private async reconcileAuthenticatedSettlementCandidates()',
    );
    const finality = methodSource(
      '  private async updateSCSOracle(',
      '  private async processPhase2Unlocks(',
    );
    const solvency = methodSource(
      '  private async checkSolvencyInvariant(',
      '  private async isBoxInMempool(',
    );

    expect(tracker).toContain('this.commitmentObservedAtMs = Date.now();');
    expect(tracker).toContain(
      'this.commitmentObservedErgoHeight = current.observedErgoHeight;',
    );
    expect(tracker).not.toContain(
      'this.activeErgoReadCycleDecision?.tip.height',
    );
    expect(finality).toContain('this.finalityObservedAtMs = Date.now();');
    expect(solvency).toContain("this.solvencyHealthState = 'deficit';");
    expect(solvency).toContain("this.solvencyHealthState = 'clear';");
    expect(solvency).toContain("this.solvencyHealthState = 'unavailable';");
  });
});
