import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const srcRoot = process.cwd().endsWith('relayer')
  ? join(process.cwd(), 'src')
  : join(process.cwd(), 'relayer', 'src');

function source(path: string): string {
  return readFileSync(join(srcRoot, path), 'utf8');
}

describe('legacy MCU daemon and script containment', () => {
  it('holds every new payout when no authenticated profile can prepare it', () => {
    const daemon = source('relayer-daemon.ts');
    const aggregateEnd = daemon.indexOf(
      'Peg-out held fail-closed because legacy aggregate payout execution is retired',
    );

    expect(aggregateEnd).toBeGreaterThan(-1);
    expect(daemon).not.toContain('this.pegOutBuilder.buildPhase1(');
    expect(daemon.slice(aggregateEnd, aggregateEnd + 500))
      .toContain('LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE');
  });

  it('quarantines immutable MCU rows without retaining a daemon spend call', () => {
    const daemon = source('relayer-daemon.ts');
    const quarantine = daemon.indexOf('Legacy MCU remains quarantined; daemon will not spend it');

    expect(quarantine).toBeGreaterThan(-1);
    expect(daemon).not.toContain('this.pegOutBuilder.buildPhase2(');
    expect(daemon).not.toContain("from './peg-out-builder.js'");
  });

  it('keeps the durable burn unchanged at the retired transport boundary', () => {
    const daemon = source('relayer-daemon.ts');
    const hold = daemon.indexOf(
      'Peg-out held fail-closed because legacy aggregate payout execution is retired',
    );
    const holdReturn = daemon.indexOf('return inventoryResult;', hold);

    expect(hold).toBeGreaterThan(-1);
    expect(holdReturn).toBeGreaterThan(hold);
    expect(daemon.slice(hold, holdReturn)).not.toContain('updatePegOutStatus(');
    expect(daemon).not.toContain('tryBatchSettlement(');
    expect(daemon).not.toContain('submitExplicitAggregate');
  });

  it('reduces every retained direct legacy script to the fail-closed guard', () => {
    const scripts = [
      'scripts/e2e-pegout-test.ts',
      'scripts/execute-phase2.ts',
      'scripts/test-phase1-e2e.ts',
      'scripts/test-phase2-e2e.ts',
      'scripts/test-roundtrip.ts',
    ];

    for (const path of scripts) {
      const script = source(path);
      expect(script, path).toContain('assertLegacyMcuDisabled(');
      expect(script, path).not.toContain("import 'dotenv/config'");
      expect(script, path).not.toMatch(
        /loadDeployedState|deployed_state|readFileSync|signAndSubmit|submitTransaction|assertSidechainBroadcastAllowed/,
      );
    }
  });
});
