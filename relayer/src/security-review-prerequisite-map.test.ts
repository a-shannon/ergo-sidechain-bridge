import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import { validateSecurityReviewEvidence } from './security-review-evidence.js';
import {
  buildSecurityReviewValidationReport,
} from './security-review-evidence-report.js';
import {
  buildSecurityReviewExternalReviewPacket,
  formatSecurityReviewExternalReviewPacketMarkdown,
} from './security-review-external-review-packet.js';
import {
  buildSecurityReviewPrerequisiteMap,
  formatSecurityReviewPrerequisiteMapMarkdown,
} from './security-review-prerequisite-map.js';

const gate4BlockerTarget = '../evidence/security/gate4-independent-security-review-blocker-map-2026-06-26-4ec4f7d1.md';

function gate4BlockerMarkdown(): string {
  return readFileSync(join(process.cwd(), gate4BlockerTarget), 'utf8');
}

describe('Gate 4 independent security review prerequisite map', () => {
  it('maps independent-review blockers to exact external-review prerequisites', () => {
    const validation = validateSecurityReviewEvidence(gate4BlockerMarkdown());
    const validationReport = buildSecurityReviewValidationReport({
      command: `npm run security:validate -- ${gate4BlockerTarget} --report-out <report.md>`,
      workingDirectory: 'ergo-sidechain-bridge/relayer',
      validatedTarget: gate4BlockerTarget,
      validation,
    });
    const map = buildSecurityReviewPrerequisiteMap({
      validatorCommit: 'abcdef1',
      candidateTarget: gate4BlockerTarget,
      validatorReportTarget: '../evidence/security/artifacts/security-validate-gate4-blocked.md',
      command: `npm run security:prerequisite-map -- --candidate ${gate4BlockerTarget} --validator-commit abcdef1 --validator-report-out <report.md> --out <map.md>`,
      validationReport,
      validation,
    });
    const markdown = formatSecurityReviewPrerequisiteMapMarkdown(map);

    expect(map.structuralIssues).toBe(43);
    expect(markdown).toContain('# Gate 4 Independent Security Review Prerequisite Map - abcdef1');
    expect(markdown).toContain('| Required scope coverage | 14 |');
    expect(markdown).toContain('external reviewer organization or affiliation');
    expect(markdown).toContain('Critical/high findings open = 0');
    expect(markdown).toContain('| Transaction broadcast, submit, deploy, reconcile, sign, audit approval, accepted-risk closure, or state mutation performed | no |');
    expect(markdown).not.toContain('C:\\');
  });

  it('formats an external review packet without claiming Gate 4 closure', () => {
    const validation = validateSecurityReviewEvidence(gate4BlockerMarkdown());
    const validationReport = buildSecurityReviewValidationReport({
      command: `npm run security:validate -- ${gate4BlockerTarget} --report-out <report.md>`,
      workingDirectory: 'ergo-sidechain-bridge/relayer',
      validatedTarget: gate4BlockerTarget,
      validation,
    });
    const prerequisiteMap = buildSecurityReviewPrerequisiteMap({
      validatorCommit: 'abcdef1',
      candidateTarget: gate4BlockerTarget,
      validatorReportTarget: '../evidence/security/artifacts/security-validate-gate4-blocked.md',
      command: `npm run security:prerequisite-map -- --candidate ${gate4BlockerTarget} --validator-commit abcdef1 --validator-report-out <report.md> --out <map.md>`,
      validationReport,
      validation,
    });
    const packet = buildSecurityReviewExternalReviewPacket({
      prerequisiteMap,
      prerequisiteMapTarget: '../evidence/security/gate4-independent-security-review-prerequisite-map.md',
      command: `npm run security:prerequisite-map -- --candidate ${gate4BlockerTarget} --validator-commit abcdef1 --validator-report-out <report.md> --out <map.md> --review-packet-out <packet.md>`,
    });
    const markdown = formatSecurityReviewExternalReviewPacketMarkdown(packet);

    expect(markdown).toContain('# Gate 4 Independent Security External Review Packet - abcdef1');
    expect(markdown).toContain('Final decision = approve');
    expect(markdown).toContain('Production-ready claim allowed = no');
    expect(markdown).toContain('Publication blockers = 0');
    expect(markdown).toContain('| Gate 4 independent review closure claimed | no |');
    expect(markdown).toContain('| Transaction broadcast, submit, deploy, reconcile, sign, audit approval, accepted-risk closure, or state mutation performed | no |');
    expect(markdown).not.toContain('C:\\');
  });

  it('CLI writes a validation report, prerequisite map, and external review packet', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-security-prerequisite-map-'));
    try {
      const reportOut = join(basename(dir), 'validator-report.md');
      const mapOut = join(basename(dir), 'prerequisite-map.md');
      const reviewPacketOut = join(basename(dir), 'review-packet.md');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/security-review-prerequisite-map.ts',
          '--candidate',
          gate4BlockerTarget,
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
      expect(result.stdout).toContain('Security review validation report written');
      expect(result.stdout).toContain('Security review prerequisite map written');
      expect(result.stdout).toContain('Security review external review packet written');

      const report = readFileSync(join(process.cwd(), reportOut), 'utf8');
      const map = readFileSync(join(process.cwd(), mapOut), 'utf8');
      const reviewPacket = readFileSync(join(process.cwd(), reviewPacketOut), 'utf8');
      expect(report).toContain('| Result | BLOCKED |');
      expect(map).toContain('# Gate 4 Independent Security Review Prerequisite Map - abcdef1');
      expect(map).toContain('| External reviewer assigned | no |');
      expect(reviewPacket).toContain('# Gate 4 Independent Security External Review Packet - abcdef1');
      expect(reviewPacket).toContain('| Completed independent security review evidence claimed | no |');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
