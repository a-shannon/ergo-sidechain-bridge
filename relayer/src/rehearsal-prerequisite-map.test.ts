import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import { buildRehearsalValidationReport } from './rehearsal-evidence-report.js';
import {
  buildRehearsalPrerequisiteMap,
  formatRehearsalPrerequisiteMapMarkdown,
  prerequisiteForRehearsalIssue,
} from './rehearsal-prerequisite-map.js';
import {
  buildRehearsalOperatorPacket,
  formatRehearsalOperatorPacketMarkdown,
} from './rehearsal-operator-packet.js';

describe('Gate 3 rehearsal prerequisite map', () => {
  it('maps rehearsal validator blockers to concrete operator prerequisites', () => {
    expect(
      prerequisiteForRehearsalIssue('Session Metadata: Environment is required'),
    ).toContain('Session Metadata');
    expect(
      prerequisiteForRehearsalIssue('Dry-Run Settlement Evidence: Expected transaction ID is required'),
    ).toContain('external-fee profile');
    expect(
      prerequisiteForRehearsalIssue('Reviewer Sign-Off: Reviewer is required'),
    ).toContain('Reviewer sign-off');
  });

  it('formats a blocked prerequisite map without closing Gate 3 or authorizing broadcast', () => {
    const validation = blockedValidation([
      'Session Metadata: Environment is required',
      'Preflight Evidence: Clean deployment state evidence is required',
      'Dry-Run Settlement Evidence: Expected transaction ID is required',
      'Reviewer Sign-Off: Reviewer is required',
    ]);
    const validationReport = buildRehearsalValidationReport({
      command: 'npm run rehearsal:validate -- ../docs/live-rehearsal-template.md --report-out <report.md>',
      workingDirectory: 'ergo-sidechain-bridge/relayer',
      validatedTarget: '../docs/live-rehearsal-template.md',
      validation,
    });
    const map = buildRehearsalPrerequisiteMap({
      validatorCommit: 'abcdef1',
      candidateTarget: '../docs/live-rehearsal-template.md',
      validatorReportTarget: '../evidence/rehearsal/artifacts/report.md',
      command: 'npm run rehearsal:prerequisite-map -- --candidate ../docs/live-rehearsal-template.md --validator-commit abcdef1 --validator-report-out <report.md> --out <map.md>',
      validationReport,
      validation,
    });

    const markdown = formatRehearsalPrerequisiteMapMarkdown(map);
    expect(markdown).toContain('# Gate 3 Rehearsal Prerequisite Map - abcdef1');
    expect(markdown).toContain('| Result | BLOCKED |');
    expect(markdown).toContain('| Structural issues | 4 |');
    expect(markdown).toContain('| Gate 3 lifecycle closure claimed | no |');
    expect(markdown).toContain('| Live execution approval granted | no |');
    expect(markdown).toContain('Capture unsigned legacy diagnostics and replacement-profile prerequisites');
    expect(markdown).not.toMatch(/\bnpm(?:\.cmd)?\s+run\s+settle:aggregate\s+--\s+check(?:-with-ingest|-anchored|-batch)?\b/);
    expect(markdown).toContain('| Transaction broadcast, submit, deploy, signing, runtime database access, or state mutation performed | no |');
    expect(markdown).not.toContain('C:\\');
  });

  it('formats an operator packet with exact capture questions and no authorization', () => {
    const validation = blockedValidation([
      'Dry-Run Settlement Evidence: Expected transaction ID is required',
      'Submit And Confirmation Evidence: Submitted transaction ID is required',
      'Reconciliation Evidence: submitted DUP successor box ID is required',
    ]);
    const validationReport = buildRehearsalValidationReport({
      command: 'npm run rehearsal:validate -- ../docs/live-rehearsal-template.md --report-out <report.md>',
      workingDirectory: 'ergo-sidechain-bridge/relayer',
      validatedTarget: '../docs/live-rehearsal-template.md',
      validation,
    });
    const map = buildRehearsalPrerequisiteMap({
      validatorCommit: 'abcdef1',
      candidateTarget: '../docs/live-rehearsal-template.md',
      validatorReportTarget: '../evidence/rehearsal/artifacts/report.md',
      command: 'npm run rehearsal:prerequisite-map -- --candidate ../docs/live-rehearsal-template.md --validator-commit abcdef1 --validator-report-out <report.md> --out <map.md>',
      validationReport,
      validation,
    });

    const packet = buildRehearsalOperatorPacket({
      prerequisiteMap: map,
      prerequisiteMapTarget: '../evidence/rehearsal/gate3-prerequisite-map.md',
      command: 'npm run rehearsal:prerequisite-map -- --candidate ../docs/live-rehearsal-template.md --validator-commit abcdef1 --validator-report-out <report.md> --out <map.md> --operator-packet-out <packet.md>',
    });
    const markdown = formatRehearsalOperatorPacketMarkdown(packet);

    expect(markdown).toContain('# Gate 3 Rehearsal Operator Packet - abcdef1');
    expect(markdown).toContain('Production-ready claim allowed by this rehearsal: no');
    expect(markdown).toContain('Testnet production-candidate claim allowed by this rehearsal: no');
    expect(markdown).toContain('| Completed live rehearsal evidence claimed | no |');
    expect(markdown).toContain('| Live execution approval granted | no |');
    expect(markdown).toContain('Unsigned legacy diagnostic');
    expect(markdown).toContain('Replacement-profile acceptance and future live lifecycle');
    expect(markdown).toContain('No for legacy V1');
    expect(markdown).not.toMatch(/\bnpm(?:\.cmd)?\s+run\s+settle:aggregate\s+--\s+check(?:-with-ingest|-anchored|-batch)?\b/);
    expect(markdown).not.toContain('C:\\');
  });

  it('CLI writes a validation report, prerequisite map, and operator packet for a guarded Markdown target', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-rehearsal-prerequisite-map-'));
    try {
      const target = join(basename(dir), 'candidate.md');
      const reportOut = join(basename(dir), 'validator-report.md');
      const mapOut = join(basename(dir), 'prerequisite-map.md');
      const operatorPacketOut = join(basename(dir), 'operator-packet.md');
      writeFileSync(join(process.cwd(), target), invalidRehearsalEvidence(), 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/rehearsal-prerequisite-map.ts',
          '--candidate',
          target,
          '--validator-commit',
          'abcdef1',
          '--validator-report-out',
          reportOut,
          '--out',
          mapOut,
          '--operator-packet-out',
          operatorPacketOut,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('Rehearsal prerequisite map written');
      expect(result.stdout).toContain('Rehearsal operator packet written');
      const report = readFileSync(join(process.cwd(), reportOut), 'utf8');
      const map = readFileSync(join(process.cwd(), mapOut), 'utf8');
      const operatorPacket = readFileSync(join(process.cwd(), operatorPacketOut), 'utf8');
      expect(report).toContain('| Result | BLOCKED |');
      expect(map).toContain('# Gate 3 Rehearsal Prerequisite Map - abcdef1');
      expect(map).toContain('| Gate 3 lifecycle closure claimed | no |');
      expect(operatorPacket).toContain('# Gate 3 Rehearsal Operator Packet - abcdef1');
      expect(operatorPacket).toContain('| Transaction broadcast, submit, deploy, signing, runtime database access, or state mutation performed | no |');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function blockedValidation(errors: string[]) {
  return {
    status: 'BLOCKED' as const,
    rows: [],
    sessionMetadata: {
      date: '',
      operator: '',
      reviewer: '',
      environment: '',
      gitCommit: '',
      releaseLevel: '',
      ergoNodeNetwork: '',
      sidechainNetwork: '',
      broadcastModeAtStart: '',
      broadcastModeAtEnd: '',
    },
    publicationEvidence: {
      releaseNotesUpdated: '',
      requiredReleaseNoteUpdates: '',
      pendingEvidenceRegisterUpdated: '',
      requiredChecklistUpdates: '',
      productionReadyClaimAllowed: '',
      testnetProductionCandidateClaimAllowed: '',
    },
    reviewerSignoff: {
      classification: '',
      publicationBlockersDiscovered: '',
      followUpTestsRequired: '',
      followUpRunbookChangesRequired: '',
      reviewer: '',
      date: '',
    },
    errors,
    message: 'rehearsal evidence BLOCKED',
  };
}

function invalidRehearsalEvidence(): string {
  return [
    '# Live Rehearsal Candidate',
    '',
    '## Session Metadata',
    '',
    '| Field | Value |',
    '|---|---|',
    '| Date | 2026-07-03 |',
    '| Operator | A. Shannon |',
    '| Reviewer | A. Shannon |',
    '| Environment | local devnet |',
    '| Git commit | abcdef1 |',
    '| Release level being evaluated | production deployment candidate |',
    '| Ergo node network | local devnet |',
    '| Sidechain network | patched devnet |',
    '| Broadcast mode at start | disabled |',
    '| Broadcast mode at end | disabled |',
    '',
    '## Lifecycle Rows',
    '',
    '| Release gate | Status | Evidence artifact | Blocking note | Required next evidence |',
    '|---|---|---|---|---|',
    '| Fresh local devnet lifecycle | publication blocker | artifact://rehearsal/fresh-local-devnet.md | Local devnet lifecycle remains pending. | Capture peg-in, peg-out, anchor, settlement check, submit, confirmation, and reconciliation evidence. |',
    '',
    '## Publication Evidence',
    '',
    '| Field | Value |',
    '|---|---|',
    '| Release notes updated | no |',
    '| Required release-note updates | none |',
    '| Pending evidence register updated | no |',
    '| Required checklist updates | none |',
    '| Production-ready claim allowed by this rehearsal | no |',
    '| Testnet production-candidate claim allowed by this rehearsal | no |',
    '',
    '## Reviewer Sign-Off',
    '',
    '| Field | Value |',
    '|---|---|',
    '| Classification | blocked |',
    '| Publication blockers discovered | yes |',
    '| Follow-up tests required | yes |',
    '| Follow-up runbook changes required | yes |',
    '| Reviewer | A. Shannon |',
    '| Date | 2026-07-03 |',
  ].join('\n');
}
