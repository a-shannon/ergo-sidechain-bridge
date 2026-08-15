import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import { buildCommitteeGovernanceValidationReport } from './committee-governance-evidence-report.js';
import {
  buildCommitteeGovernancePrerequisiteMap,
  formatCommitteeGovernancePrerequisiteMapMarkdown,
  prerequisiteForCommitteeGovernanceIssue,
} from './committee-governance-prerequisite-map.js';
import {
  buildCommitteeGovernanceReviewPacket,
  formatCommitteeGovernanceReviewPacketMarkdown,
} from './committee-governance-review-packet.js';

describe('committee governance prerequisite map', () => {
  it('maps exact Gate 6 validator blockers to operator prerequisites', () => {
    expect(
      prerequisiteForCommitteeGovernanceIssue(
        'Rotation Plan: Reconcile deployment state: status must be linked before committee governance evidence can pass',
      ),
    ).toContain('Sanitized non-mainnet deployment-state reconciliation evidence');
    expect(
      prerequisiteForCommitteeGovernanceIssue(
        'Negative Checks: Deployment state points to the wrong network: status must be linked before committee governance evidence can pass',
      ),
    ).toContain('Wrong-network negative evidence');
    expect(
      prerequisiteForCommitteeGovernanceIssue(
        'Publication Rules: Reviewer decision summary must use exact Open governance blockers = 0',
      ),
    ).toContain('exact `Open governance blockers = 0`');
  });

  it('formats a sanitized blocked prerequisite map without claiming closure', () => {
    const errors = [
      'Publication Rules: External review evidence must include a link, command, or artifact marker',
      'Reviewer Sign-Off: Security reviewer: decision must be approve before committee governance evidence can pass',
    ];
    const validation = blockedValidation(errors);
    const validationReport = buildCommitteeGovernanceValidationReport({
      command: 'npm run governance:validate -- ../evidence/governance/sample.md --report-out <report.md>',
      workingDirectory: 'ergo-sidechain-bridge/relayer',
      validatedTarget: '../evidence/governance/sample.md',
      validation,
    });
    const map = buildCommitteeGovernancePrerequisiteMap({
      validatorCommit: 'abcdef1',
      candidateTarget: '../evidence/governance/sample.md',
      validatorReportTarget: '../evidence/governance/artifacts/report.md',
      command: 'npm run governance:prerequisite-map -- --candidate ../evidence/governance/sample.md --validator-commit abcdef1 --validator-report-out <report.md> --out <map.md>',
      validationReport,
      validation,
    });

    const markdown = formatCommitteeGovernancePrerequisiteMapMarkdown(map);
    expect(markdown).toContain('| Result | BLOCKED |');
    expect(markdown).toContain('| Structural issues | 2 |');
    expect(markdown).toContain('Completed external governance/key-rotation review evidence');
    expect(markdown).toContain('| Gate 6 committee governance closure claimed | no |');
    expect(markdown).toContain('| Key rotation authorization granted | no |');
    expect(markdown).not.toContain('C:\\');
  });

  it('formats a Gate 6 external review packet with exact claim bindings and no authorization', () => {
    const validation = blockedValidation([
      'Publication Rules: Release supported must not be none before committee governance evidence can pass',
      'Publication Rules: External review evidence must include a link, command, or artifact marker',
      'Reviewer Sign-Off: Governance owner: decision must be approve before committee governance evidence can pass',
      'Reviewer Sign-Off: Security reviewer: decision must be approve before committee governance evidence can pass',
      'Reviewer Sign-Off: Operator reviewer: decision must be approve before committee governance evidence can pass',
    ]);
    const validationReport = buildCommitteeGovernanceValidationReport({
      command: 'npm run governance:validate -- ../evidence/governance/sample.md --report-out <report.md>',
      workingDirectory: 'ergo-sidechain-bridge/relayer',
      validatedTarget: '../evidence/governance/sample.md',
      validation,
    });
    const map = buildCommitteeGovernancePrerequisiteMap({
      validatorCommit: 'abcdef1',
      candidateTarget: '../evidence/governance/sample.md',
      validatorReportTarget: '../evidence/governance/artifacts/report.md',
      command: 'npm run governance:prerequisite-map -- --candidate ../evidence/governance/sample.md --validator-commit abcdef1 --validator-report-out <report.md> --out <map.md>',
      validationReport,
      validation,
    });

    const packet = buildCommitteeGovernanceReviewPacket({
      prerequisiteMap: map,
      prerequisiteMapTarget: '../evidence/governance/prerequisite-map.md',
      command: 'npm run governance:prerequisite-map -- --candidate ../evidence/governance/sample.md --validator-commit abcdef1 --validator-report-out <report.md> --out <map.md> --review-packet-out <packet.md>',
    });
    const markdown = formatCommitteeGovernanceReviewPacketMarkdown(packet);

    expect(markdown).toContain('# Gate 6 External Governance Review Packet - abcdef1');
    expect(markdown).toContain('Release supported = production deployment candidate');
    expect(markdown).toContain('Governance-ready claim allowed = yes');
    expect(markdown).toContain('Production-ready claim allowed = no');
    expect(markdown).toContain('Open governance blockers = 0');
    expect(markdown).toContain('| Completed external review evidence claimed | no |');
    expect(markdown).toContain('| Key rotation authorization granted | no |');
    expect(markdown).not.toContain('C:\\');
  });

  it('CLI writes a validation report, prerequisite map, and review packet for a guarded Markdown target', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-governance-prerequisite-map-'));
    try {
      const target = join(basename(dir), 'candidate.md');
      const reportOut = join(basename(dir), 'validator-report.md');
      const mapOut = join(basename(dir), 'prerequisite-map.md');
      const reviewPacketOut = join(basename(dir), 'review-packet.md');
      writeFileSync(join(process.cwd(), target), invalidCommitteeGovernanceEvidence(), 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/committee-governance-prerequisite-map.ts',
          '--candidate',
          target,
          '--validator-commit',
          'abcdef1',
          '--validator-report-out',
          reportOut,
          '--out',
          mapOut,
          '--review-packet-out',
          reviewPacketOut,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('Committee governance prerequisite map written');
      expect(result.stdout).toContain('Committee governance review packet written');
      const report = readFileSync(join(process.cwd(), reportOut), 'utf8');
      const map = readFileSync(join(process.cwd(), mapOut), 'utf8');
      const reviewPacket = readFileSync(join(process.cwd(), reviewPacketOut), 'utf8');
      expect(report).toContain('| Result | BLOCKED |');
      expect(map).toContain('# Phase 010a Committee Governance Prerequisite Map - abcdef1');
      expect(map).toContain('Manual Gate 6 evidence triage is required');
      expect(map).toContain('| Transaction broadcast, submit, deploy, rotate keys, reconcile, or state mutation performed | no |');
      expect(reviewPacket).toContain('# Gate 6 External Governance Review Packet - abcdef1');
      expect(reviewPacket).toContain('| Governance-ready claim authorized by this packet | no |');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function blockedValidation(errors: string[]) {
  return {
    status: 'BLOCKED' as const,
    scopeRows: [],
    commandRows: [],
    rotationRows: [],
    positiveRows: [],
    negativeRows: [],
    classification: {},
    publicationDecision: {},
    reviewerRows: [],
    errors,
    message: 'committee governance evidence BLOCKED',
  };
}

function invalidCommitteeGovernanceEvidence(): string {
  return [
    '# Committee Governance Candidate',
    '',
    '## Drill Classification',
    '',
    '| Field | Value |',
    '|---|---|',
    '| Drill name | Phase 010a incomplete fixture |',
    '| Git commit | abcdef1 |',
    '| Release level | production deployment candidate |',
    '| Environment | testnet |',
    '| Broadcast mode | disabled |',
    '| Governance model | committee governance |',
    '| Committee threshold | 2 |',
    '| Committee member count | 3 |',
    '| Reviewer | reviewer-a |',
    '| Date | 2026-07-02 |',
    '',
    '## Scope',
    '',
    '| Surface | Current authority | Target authority | Evidence | Status |',
    '|---|---|---|---|---|',
    '',
    '## Required Commands',
    '',
    '| Command | Evidence | Status |',
    '|---|---|---|',
    '',
    '## Rotation Plan',
    '',
    '| Step | Required evidence | Status | Stop condition |',
    '|---|---|---|---|',
    '',
    '## Positive Checks',
    '',
    '| Check | Expected result | Evidence | Status |',
    '|---|---|---|---|',
    '',
    '## Negative Checks',
    '',
    '| Check | Expected result | Evidence | Status |',
    '|---|---|---|---|',
    '',
    '## Publication Rules',
    '',
    '| Field | Value |',
    '|---|---|',
    '| Release supported | none |',
    '| Production-ready claim allowed | no |',
    '| Testnet production-candidate claim allowed | no |',
    '| Governance-ready claim allowed | no |',
    '| Open governance blockers | 12 |',
    '| Release notes updated | no |',
    '| Required release-note updates | none |',
    '| Required checklist updates | none |',
    '| External review evidence | none |',
    '| Reviewer decision summary | blocked |',
    '',
    '## Reviewer Sign-Off',
    '',
    '| Role | Name | Decision | Date | Notes |',
    '|---|---|---|---|---|',
    '| Governance owner | reviewer-a | block | 2026-07-02 | blocked |',
  ].join('\n');
}
