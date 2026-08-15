import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  buildReadinessTriageReportFromResults,
  classifyReadinessTriageIssue,
  discoverDefaultReadinessTriageTargets,
  formatReadinessTriageReportMarkdown,
} from './readiness-triage.js';

describe('readiness evidence triage', () => {
  it('treats Gate 4 independent security review as a first-class readiness lane', () => {
    const report = buildReadinessTriageReportFromResults([
      {
        lane: 'security-review',
        target: '../evidence/security/current.md',
        label: '../evidence/security/current.md',
        status: 'BLOCKED',
        validatorCompleted: true,
        errors: [
          'Review Classification: External reviewer organization or affiliation must be concrete',
          'Publication Decision: Critical/high findings open must be 0',
          'Reviewer Sign-Off: Lead reviewer decision must approve',
        ],
      },
    ]);

    const counts = Object.fromEntries(
      report.categorySummaries.map(summary => [summary.category, summary.count]),
    );

    expect(report.lanes[0].lane).toBe('security-review');
    expect(counts['reviewer-or-external']).toBe(2);
    expect(counts['claim-or-publication-boundary']).toBe(1);
    expect(report.localClosure).toMatchObject({
      status: 'external-or-live-required',
      localOnlyIssueCount: 0,
      externalOrLiveIssueCount: 3,
      manualTriageIssueCount: 0,
    });
    expect(formatReadinessTriageReportMarkdown(report)).toContain('Gate 4 independent security review');
  });

  it('does not route Gate 4 external review obligations into local evidence work', () => {
    const report = buildReadinessTriageReportFromResults([
      {
        lane: 'security-review',
        target: '../evidence/security/current.md',
        label: '../evidence/security/current.md',
        status: 'BLOCKED',
        validatorCompleted: true,
        errors: [
          'Required Scope Coverage: ErgoScript contracts: coverage must be covered before Gate 4 evidence can pass',
          'Required Scope Coverage: ErgoScript contracts: status must be linked before security review evidence can pass',
          'Required Evidence Package: Fresh testnet rehearsal: status must be linked before security review evidence can pass',
          'Required Evidence Package: Batch settlement check/submit/confirm rehearsal: status must be linked before security review evidence can pass',
          'Finding Disposition: Critical findings: status must be linked before security review evidence can pass',
          'Required Negative Review Checks: Can a production path sign through the Ergo node wallet?: status must be linked before security review evidence can pass',
        ],
      },
    ]);

    const counts = Object.fromEntries(
      report.categorySummaries.map(summary => [summary.category, summary.count]),
    );

    expect(counts['reviewer-or-external']).toBe(4);
    expect(counts['node-backed-or-live-drill']).toBe(2);
    expect(counts['local-evidence']).toBeUndefined();
    expect(report.localClosure).toMatchObject({
      status: 'external-or-live-required',
      localOnlyIssueCount: 0,
      externalOrLiveIssueCount: 6,
      manualTriageIssueCount: 0,
    });
  });

  it('groups remaining validator blockers by actionability instead of gate-local wording', () => {
    const report = buildReadinessTriageReportFromResults([
      {
        lane: 'trustless-burn',
        target: '../evidence/trustless-burn/current.md',
        label: '../evidence/trustless-burn/current.md',
        status: 'BLOCKED',
        validatorCompleted: true,
        errors: [
          'Commitment Format: sidechain finality rule requires completed Gate 5 finality evidence',
          'Publication Decision: Open trustless burn blockers must be 0',
          'Reviewer Sign-Off: Protocol reviewer decision must approve',
        ],
      },
      {
        lane: 'committee-governance',
        target: '../evidence/governance/current.md',
        label: '../evidence/governance/current.md',
        status: 'BLOCKED',
        validatorCompleted: true,
        errors: [
          'Rotation Plan: Evaluate old and new signer behavior must be linked',
          'Positive Checks: New committee signer-gated mutation after rotation must be linked',
        ],
      },
      {
        lane: 'benchmark',
        target: '../evidence/benchmarks/current.md',
        label: '../evidence/benchmarks/current.md',
        status: 'BLOCKED',
        validatorCompleted: true,
        errors: [
          'Metric Table: Live batch settlement status must be linked',
          'Required Commands: npm run check requires command-specific completed output evidence',
        ],
      },
    ]);

    expect(report.status).toBe('BLOCKED');
    expect(report.totalStructuralIssues).toBe(7);
    const counts = Object.fromEntries(
      report.categorySummaries.map(summary => [summary.category, summary.count]),
    );
    expect(counts).toMatchObject({
      'node-backed-or-live-drill': 4,
      'claim-or-publication-boundary': 1,
      'local-evidence': 1,
      'reviewer-or-external': 1,
    });
    expect(report.localClosure).toMatchObject({
      status: 'local-evidence-work-available',
      localOnlyIssueCount: 1,
      externalOrLiveIssueCount: 6,
      manualTriageIssueCount: 0,
    });
  });

  it('does not treat Gate 5 on-chain or independent-review blockers as local evidence work', () => {
    const report = buildReadinessTriageReportFromResults([
      {
        lane: 'trustless-burn',
        target: '../evidence/trustless-burn/current.md',
        label: '../evidence/trustless-burn/current.md',
        status: 'BLOCKED',
        validatorCompleted: true,
        errors: [
          'Required Components: Ergo extension-section anchoring: status must be linked before Gate 5 evidence can pass',
          'Required Components: Sidechain header/finality verifier: status must be linked before Gate 5 evidence can pass',
          'Required Components: SPV relay contract or tracker: status must be linked before Gate 5 evidence can pass',
          'Required Components: Burn inclusion proof: status must be linked before Gate 5 evidence can pass',
          'Required Components: DUP settlement binding: status must be linked before Gate 5 evidence can pass',
          'Required Components: Independent review: status must be linked before Gate 5 evidence can pass',
          'Positive Proof Acceptance: Valid burn proof acceptance: status must be linked before Gate 5 evidence can pass',
        ],
      },
    ]);

    const counts = Object.fromEntries(
      report.categorySummaries.map(summary => [summary.category, summary.count]),
    );
    expect(counts['node-backed-or-live-drill']).toBe(6);
    expect(counts['reviewer-or-external']).toBe(1);
    expect(counts['local-evidence']).toBeUndefined();
    expect(report.localClosure).toMatchObject({
      status: 'external-or-live-required',
      localOnlyIssueCount: 0,
      externalOrLiveIssueCount: 7,
      manualTriageIssueCount: 0,
    });
    expect(report.localClosure.summary).toContain('No local-only closure candidates remain');
  });

  it('marks unknown blocker wording for manual triage before choosing another slice', () => {
    const report = buildReadinessTriageReportFromResults([
      {
        lane: 'benchmark',
        target: '../evidence/benchmarks/current.md',
        label: '../evidence/benchmarks/current.md',
        status: 'BLOCKED',
        validatorCompleted: true,
        errors: ['Unexpected release validator message without a known actionability marker'],
      },
    ]);

    expect(report.localClosure).toMatchObject({
      status: 'manual-triage-required',
      localOnlyIssueCount: 0,
      externalOrLiveIssueCount: 0,
      manualTriageIssueCount: 1,
    });
  });

  it('keeps claim and mutation boundaries explicit in markdown output', () => {
    const report = buildReadinessTriageReportFromResults([
      {
        lane: 'benchmark',
        target: '../evidence/benchmarks/current.md',
        label: '../evidence/benchmarks/current.md',
        status: 'PASS',
        validatorCompleted: true,
        errors: [],
      },
    ]);

    const markdown = formatReadinessTriageReportMarkdown(report);

    expect(markdown).toContain('| Result | PASS |');
    expect(markdown).toContain('| Local-only closure status | Complete |');
    expect(markdown).toContain('| Public claim authorization granted | no |');
    expect(markdown).toContain('| Evidence row closure claimed | no |');
    expect(markdown).toContain('| Transaction broadcast, deploy, key rotation, or state mutation performed | no |');
  });

  it('records an explicit source commit in generated triage reports', () => {
    const report = buildReadinessTriageReportFromResults([
      {
        lane: 'benchmark',
        target: '../evidence/benchmarks/current.md',
        label: '../evidence/benchmarks/current.md',
        status: 'PASS',
        validatorCompleted: true,
        errors: [],
      },
    ], { sourceCommit: 'abc1234' });
    const markdown = formatReadinessTriageReportMarkdown(report);

    expect(report.sourceCommit).toBe('abc1234');
    expect(markdown).toContain('| Source commit | abc1234 |');
  });

  it('classifies guarded targets without exposing sensitive local paths', () => {
    const localPrefix = ['C', String.fromCharCode(58), '/', 'profile', '/'].join('');
    const sensitiveSegment = ['private', 'Key'].join('');
    const guardedTarget = `${localPrefix}${sensitiveSegment}/evidence.md`;
    const report = buildReadinessTriageReportFromResults([
      {
        lane: 'benchmark',
        target: guardedTarget,
        label: '<blocked evidence target>',
        status: 'BLOCKED',
        validatorCompleted: false,
        errors: [`${guardedTarget}: refusing to read local absolute evidence paths`],
      },
    ]);

    expect(classifyReadinessTriageIssue(report.issues[0].issue)).toBe('target-access');
    expect(report.issues[0].issue).not.toContain(localPrefix);
    expect(report.issues[0].issue).not.toContain(sensitiveSegment);
    expect(report.issues[0].issue).toContain('[local-path]');
  });

  it('exposes a read-only CLI that fails closed for the current blocked benchmark candidate', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/readiness-triage.ts',
        '--benchmark',
        '../evidence/benchmarks/gate7-offline-structured-candidate-2026-06-27-59086914.md',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Bridge readiness triage: BLOCKED');
    expect(result.stdout).toContain('Gate 7 benchmark: BLOCKED');
    expect(result.stdout).toContain('Local-only closure status: External Or Live Required');
    expect(result.stdout).toContain('Actionability buckets:');
    expect(result.stderr).toBe('');
  });

  it('writes guarded markdown output for the current blocked triage result', () => {
    const out = `../evidence/readiness/tmp-readiness-triage-output-${process.pid}-${Date.now()}.md`;
    const outPath = join(process.cwd(), out);
    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/readiness-triage.ts',
          '--benchmark',
          '../evidence/benchmarks/gate7-offline-structured-candidate-2026-06-27-59086914.md',
          '--markdown',
          '--out',
          out,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('# Bridge Readiness Evidence Triage');
      expect(result.stderr).toBe('');
      expect(existsSync(outPath)).toBe(true);
      const written = readFileSync(outPath, 'utf8');
      expect(written).toContain('| Result | BLOCKED |');
      expect(written).toContain('| Local-only closure status | External Or Live Required |');
      expect(written).toContain('No local-only closure candidates remain');
      expect(written).toContain('| Evidence row closure claimed | no |');
      expect(written).toContain('| Transaction broadcast, deploy, key rotation, or state mutation performed | no |');
    } finally {
      rmSync(outPath, { force: true });
    }
  });

  it('writes guarded JSON output for downstream readiness automation without claiming closure', () => {
    const jsonOut = `../evidence/readiness/tmp-readiness-triage-output-${process.pid}-${Date.now()}.json`;
    const jsonOutPath = join(process.cwd(), jsonOut);
    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/readiness-triage.ts',
          '--benchmark',
          '../evidence/benchmarks/gate7-offline-structured-candidate-2026-06-27-59086914.md',
          '--source-commit',
          'abc1234',
          '--json-out',
          jsonOut,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toContain('Bridge readiness triage: BLOCKED');
      expect(result.stdout).toContain('- readiness triage JSON report written: ../evidence/readiness/');
      expect(result.stderr).toBe('');
      expect(existsSync(jsonOutPath)).toBe(true);
      const written = JSON.parse(readFileSync(jsonOutPath, 'utf8'));
      expect(written.status).toBe('BLOCKED');
      expect(written.sourceCommit).toBe('abc1234');
      expect(written.totalStructuralIssues).toBeGreaterThan(0);
      expect(written.localClosure.status).toBe('external-or-live-required');
      expect(written.localClosure.localOnlyIssueCount).toBe(0);
      expect(written.boundary['Evidence row closure claimed']).toBe('no');
      expect(written.boundary['Transaction broadcast, deploy, key rotation, or state mutation performed']).toBe('no');
      expect(JSON.stringify(written)).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(jsonOutPath, { force: true });
    }
  });

  it('discovers the latest default blocker maps for the durable readiness loop', () => {
    const root = join(tmpdir(), `readiness-defaults-${process.pid}-${Date.now()}`);
    try {
      const trustlessDir = join(root, 'trustless-burn');
      const securityDir = join(root, 'security');
      const governanceDir = join(root, 'governance');
      const benchmarkDir = join(root, 'benchmarks');
      mkdirSync(trustlessDir, { recursive: true });
      mkdirSync(securityDir, { recursive: true });
      mkdirSync(governanceDir, { recursive: true });
      mkdirSync(benchmarkDir, { recursive: true });

      writeFileSync(join(trustlessDir, 'gate5-trustless-burn-blocker-map-2026-06-28-old.md'), '# old\n');
      writeFileSync(join(trustlessDir, 'gate5-trustless-burn-blocker-map-2026-06-29-current.md'), '# current\n');
      writeFileSync(join(securityDir, 'gate4-independent-security-review-blocker-map-2026-06-28-old.md'), '# old\n');
      writeFileSync(join(securityDir, 'gate4-independent-security-review-blocker-map-2026-06-29-current.md'), '# current\n');
      writeFileSync(join(governanceDir, 'phase010a-committee-governance-blocker-map-2026-06-28-old.md'), '# old\n');
      writeFileSync(join(governanceDir, 'phase010a-committee-governance-blocker-map-2026-06-29-current.md'), '# current\n');
      writeFileSync(join(benchmarkDir, 'gate7-benchmark-blocker-map-2026-06-28-old.md'), '# old\n');
      writeFileSync(join(benchmarkDir, 'gate7-offline-structured-candidate-2026-06-29-current.md'), '# current\n');

      const discovered = discoverDefaultReadinessTriageTargets(root);

      expect(discovered.errors).toEqual([]);
      expect(discovered.targets).toEqual([
        {
          lane: 'security-review',
          target: expect.stringContaining('gate4-independent-security-review-blocker-map-2026-06-29-current.md'),
        },
        {
          lane: 'trustless-burn',
          target: expect.stringContaining('gate5-trustless-burn-blocker-map-2026-06-29-current.md'),
        },
        {
          lane: 'committee-governance',
          target: expect.stringContaining('phase010a-committee-governance-blocker-map-2026-06-29-current.md'),
        },
        {
          lane: 'benchmark',
          target: expect.stringContaining('gate7-offline-structured-candidate-2026-06-29-current.md'),
        },
      ]);
      for (const target of discovered.targets) {
        expect(target.target).not.toContain('\\');
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs the default durable triage loop without manual target arguments', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/readiness-triage.ts',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Bridge readiness triage: BLOCKED');
    expect(result.stdout).toContain('Gate 4 independent security review: BLOCKED');
    expect(result.stdout).toContain('Gate 5 trustless burn: BLOCKED');
    expect(result.stdout).toContain('Gate 6 committee governance: BLOCKED');
    expect(result.stdout).toContain('Gate 7 benchmark: BLOCKED');
    expect(result.stderr).toBe('');
  });
});
