import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE,
  rejectLegacyAggregateSettlementSubmission,
} from './legacy-aggregate-settlement-conservation.js';

const srcRoot = join(process.cwd(), 'src');
const readSource = (...segments: string[]) => readFileSync(join(srcRoot, ...segments), 'utf8');

describe('legacy aggregate settlement retirement boundary', () => {
  it('keeps the fee-from-backing invariant explicit', () => {
    expect(rejectLegacyAggregateSettlementSubmission).toThrow(
      LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE,
    );
    expect(LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE).toContain(
      'miner fee from protected Ergo backing',
    );
    expect(LEGACY_AGGREGATE_SUBMISSION_DISABLED_MESSAGE).toContain(
      'only the net payout is burned on the sidechain',
    );
  });

  it('physically removes the programmatic signing and submission module', () => {
    expect(existsSync(join(srcRoot, 'legacy-aggregate-settlement-execution.ts'))).toBe(false);

    const approvals = readSource('aggregate-settlement-approvals.ts');
    expect(approvals).not.toContain('submitFileApprovedAggregate');
    expect(approvals).not.toContain('submitExplicitApprovedAggregate');
    expect(approvals).not.toContain("import('./legacy-aggregate-settlement-execution.js')");
  });

  it('physically removes legacy aggregate deployment and funding entrypoints', () => {
    const packageJson = JSON.parse(readSource('..', 'package.json')) as {
      scripts?: Record<string, string>;
    };
    const readiness = readSource('scripts', 'demo-readiness.ts');
    const goNoGo = readSource('scripts', 'patched-devnet-go-no-go.ts');
    const plan = readSource('scripts', 'patched-devnet-plan.ts');

    expect(packageJson.scripts).not.toHaveProperty('deploy:aggregate');
    expect(existsSync(join(srcRoot, 'scripts', 'deploy.ts'))).toBe(false);
    expect(existsSync(join(srcRoot, 'scripts', 'deploy-aggregate.ts'))).toBe(false);
    expect(readiness).not.toContain('run deploy-aggregate.ts');
    expect(goNoGo).not.toContain("'deploy:aggregate'");
    expect(plan).not.toContain('npm.cmd run deploy:aggregate');
  });

  it('exposes only diagnostics and historical reconciliation in the operator CLI', () => {
    const source = readSource('scripts', 'aggregate-settlement.ts');

    expect(source).toContain('const SUPPORTED_AGGREGATE_COMMANDS = new Set([');
    expect(source).toContain('if (!SUPPORTED_AGGREGATE_COMMANDS.has(command)) usage();');
    expect(source).not.toContain('signAndCheck(');
    expect(source).toContain('confirmSingleClaimSettlement(');
    expect(source).not.toMatch(/command === 'check(?:-|')/);
    expect(source).not.toMatch(/command === 'submit(?:-|')/);
    expect(source).not.toContain('signAndSubmit(');
    expect(source).not.toContain('submitExplicitAggregate');
  });

  it('holds new daemon burns while preserving historical confirmation', () => {
    const source = readSource('relayer-daemon.ts');

    expect(source).toContain(
      'Peg-out held fail-closed because legacy aggregate payout execution is retired',
    );
    expect(source).toContain('confirmSingleClaimSettlement(');
    expect(source).not.toContain('submitExplicitAggregate');
    expect(source).not.toContain('tryBatchSettlement(');
    expect(source).not.toContain('aggregateSettlementApprovals');
  });
});
