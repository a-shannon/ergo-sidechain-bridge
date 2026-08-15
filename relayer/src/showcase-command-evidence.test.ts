import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

const cases = [
  {
    script: 'src/scripts/showcase-benchmark.ts',
    name: 'benchmark',
    title: '# Completed Offline Showcase Benchmark Output',
    command: '| Command | npm run showcase:benchmark -- --out <report.md> |',
    expected: [
      '| Batch size | Build time | Tracker proof | DUP lookup | DUP insert | Claim cores | Context vars | Inputs | Outputs | Notes |',
      '| 10 |',
      'does not authorize production throughput',
    ],
  },
  {
    script: 'src/scripts/showcase-lanes.ts',
    name: 'lanes',
    title: '# Completed Offline Showcase Lanes Output',
    command: '| Command | npm run showcase:lanes -- --out <report.md> |',
    expected: [
      '| Shard count | 2 |',
      '| Full parallel L1 settlement claimed | no |',
      'DUP and liquidity inputs are lane-local',
    ],
  },
  {
    script: 'src/scripts/inspect-proof-objects.ts',
    name: 'proofs',
    title: '# Completed Offline Proof Objects Output',
    command: '| Command | npm run showcase:proofs -- --out <report.md> |',
    expected: [
      '| Tracker key | 32 B | Sidechain block ID |',
      '| DUP insert proof | 67 B | State transition proof |',
      'does not authorize trustless burn completion',
    ],
  },
  {
    script: 'src/scripts/showcase-finality.ts',
    name: 'finality',
    title: '# Completed Offline Finality Output',
    command: '| Command | npm run showcase:finality -- --out <report.md> |',
    expected: [
      '| Single-claim settlement timeline | 4s | 2m | 22m | Offline model; no node calls |',
      '| Batch settlement timeline | 14s | 2m | 22m | Offline model; no node calls |',
      'does not authorize live settlement claims',
    ],
  },
];

describe('offline showcase command evidence reports', () => {
  it('writes completed no-broadcast command output evidence for each showcase command', () => {
    const tmpDir = mkdtempSync(join(process.cwd(), '.tmp-showcase-command-evidence-'));

    try {
      for (const item of cases) {
        const target = `${basename(tmpDir)}/${item.name}.md`;
        const result = spawnSync(
          process.execPath,
          ['node_modules/tsx/dist/cli.mjs', item.script, '--out', target],
          { cwd: process.cwd(), encoding: 'utf8' },
        );

        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
        expect(existsSync(join(process.cwd(), target))).toBe(true);

        const report = readFileSync(join(process.cwd(), target), 'utf8');
        expect(report).toContain(item.title);
        expect(report).toContain(item.command);
        expect(report).toContain('| Result | PASS |');
        expect(report).toContain('| Exit code | 0 |');
        expect(report).toContain('| Node calls | none |');
        expect(report).toContain('| Signing | none |');
        expect(report).toContain('| Broadcast | none |');
        expect(report).toContain('| Runtime database opened | no |');
        expect(report).toContain('| Deployment state opened | no |');
        expect(report).toContain('| Secret or environment file read | no |');
        expect(report).toContain('| Transaction broadcast, submit, deploy, or state mutation performed | no |');
        for (const expected of item.expected) expect(report).toContain(expected);
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
