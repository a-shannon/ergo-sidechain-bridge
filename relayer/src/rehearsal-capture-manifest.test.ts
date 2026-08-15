import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildRehearsalCaptureManifest,
  formatRehearsalCaptureManifestMarkdown,
} from './rehearsal-capture-manifest.js';
import {
  buildGoNoGoJsonReport,
  nodeConfigInspectionSkipped,
  pass,
  runtimeStateInspectionSkipped,
  warn,
} from './patched-devnet-go-no-go.js';

describe('Gate 3 rehearsal capture manifest', () => {
  it('formats a concrete capture sequence without authorizing Gate 3 closure or broadcast', () => {
    const manifest = buildRehearsalCaptureManifest({
      sourceCommit: 'abcdef1',
      prerequisiteMapTarget: '../evidence/rehearsal/map.md',
      prerequisiteMapMarkdown: prerequisiteMapMarkdown(),
      operatorPacketTarget: '../evidence/rehearsal/operator.md',
      operatorPacketMarkdown: operatorPacketMarkdown(),
      liveTemplateTarget: '../docs/live-rehearsal-template.md',
      operatorRunbookTarget: '../docs/operator-runbooks.md',
      readinessRequestTarget: '../evidence/readiness/request.md',
      patchedDevnetGoNoGoJsonTarget: '../evidence/rehearsal/artifacts/patched-devnet-go-no-go.json',
      patchedDevnetGoNoGoValidationTarget: '../evidence/rehearsal/artifacts/patched-devnet-go-no-go-validation.md',
      patchedDevnetGoNoGoVerdict: 'LOCAL_PREREQS_OK',
      patchedDevnetGoNoGoValidationMessage:
        'PASS go/no-go prerequisite report: verdict=LOCAL_PREREQS_OK; not Gate 3 closure; not broadcast authorization',
      command: 'npm run rehearsal:capture-manifest -- --source-commit abcdef1 --out <manifest.md>',
    });

    const markdown = formatRehearsalCaptureManifestMarkdown(manifest);
    expect(markdown).toContain('# Gate 3 Live Rehearsal Capture Manifest - abcdef1');
    expect(markdown).toContain('| Gate 3 prerequisite map | ../evidence/rehearsal/map.md | BLOCKED with 65 structural issues |');
    expect(markdown).toContain(
      '| Patched-devnet go/no-go JSON | ../evidence/rehearsal/artifacts/patched-devnet-go-no-go.json | LOCAL_PREREQS_OK; local prereqs only; execution not ready |',
    );
    expect(markdown).toContain(
      '| Patched-devnet go/no-go validation | ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-validation.md | PASS go/no-go prerequisite report: verdict=LOCAL_PREREQS_OK; not Gate 3 closure; not broadcast authorization; planning only |',
    );
    expect(markdown).toContain('Local 1. Patched-devnet go/no-go JSON');
    expect(markdown).toContain('Linked current JSON: ../evidence/rehearsal/artifacts/patched-devnet-go-no-go.json');
    expect(markdown).toContain('rerun npm run demo:patched-devnet:go-no-go');
    expect(markdown).toContain('Unsigned legacy shape diagnostic');
    expect(markdown).toContain(
      'LOCAL_PREREQS_OK linked; read-only prerequisites only, not live lifecycle closure',
    );
    expect(markdown).toContain('Replacement-profile target-node acceptance');
    expect(markdown).toContain('No current command: define profile-specific preflight');
    expect(markdown).toContain('Testnet 10. Legacy V1 execution quarantine');
    expect(markdown).toContain('executionStatus QUARANTINED');
    expect(markdown).toContain('Approval cannot lift the quarantine');
    expect(markdown).toContain('| Legacy V1 settlement submission quarantine | active; approval cannot lift it |');
    expect(markdown).toContain(
      '| Separately versioned external-fee profile activation and legacy-route retirement | required before any new live preflight or submit handoff |',
    );
    expect(markdown).toContain('| New legacy V1 check or approval command emitted | no |');
    expect(markdown).not.toMatch(/\bnpm(?:\.cmd)?\s+run\s+settle:aggregate\s+--\s+check(?:-with-ingest|-anchored|-batch)?\b/);
    expect(markdown).not.toContain('npm run approvals:draft');
    expect(markdown).not.toContain('Approval-gated only: npm run rehearsal:live-preflight');
    expect(markdown).not.toContain('Explicit reviewer and user live approval bound to Expected transaction ID');
    expect(markdown).not.toContain('required before live preflight and submit');
    expect(markdown).toContain('| Concrete next capture order defined | yes |');
    expect(markdown).toContain('| Completed Gate 3 lifecycle evidence claimed | no |');
    expect(markdown).toContain('| Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed | no |');
    expect(markdown).not.toContain('C:\\');
  });

  it('CLI writes a guarded capture manifest from existing planning packets', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-rehearsal-capture-manifest-'));
    try {
      const prerequisiteMap = join(basename(dir), 'map.md');
      const operatorPacket = join(basename(dir), 'operator.md');
      const liveTemplate = join(basename(dir), 'live-template.md');
      const operatorRunbook = join(basename(dir), 'operator-runbook.md');
      const readinessRequest = join(basename(dir), 'readiness-request.md');
      const goNoGoJson = join(basename(dir), 'go-no-go.json');
      const goNoGoValidation = join(basename(dir), 'go-no-go-validation.md');
      const out = join(basename(dir), 'manifest.md');
      writeFileSync(join(process.cwd(), prerequisiteMap), prerequisiteMapMarkdown(), 'utf8');
      writeFileSync(join(process.cwd(), operatorPacket), operatorPacketMarkdown(), 'utf8');
      writeFileSync(join(process.cwd(), liveTemplate), '# Live Rehearsal Template\n', 'utf8');
      writeFileSync(join(process.cwd(), operatorRunbook), '# Operator Runbook\n', 'utf8');
      writeFileSync(join(process.cwd(), readinessRequest), '# Readiness Request\n', 'utf8');
      writeFileSync(join(process.cwd(), goNoGoJson), JSON.stringify(goNoGoReport(), null, 2), 'utf8');
      writeFileSync(join(process.cwd(), goNoGoValidation), goNoGoValidationMarkdown(goNoGoJson), 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/rehearsal-capture-manifest.ts',
          '--source-commit',
          'abcdef1',
          '--prerequisite-map',
          prerequisiteMap,
          '--operator-packet',
          operatorPacket,
          '--live-template',
          liveTemplate,
          '--operator-runbook',
          operatorRunbook,
          '--readiness-request',
          readinessRequest,
          '--patched-devnet-go-no-go-json',
          goNoGoJson,
          '--patched-devnet-go-no-go-validation',
          goNoGoValidation,
          '--out',
          out,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('Gate 3 live rehearsal capture manifest written');
      expect(result.stdout).toContain('Prerequisite structural issues: 65');
      expect(result.stdout).toContain('Patched-devnet go/no-go verdict: LOCAL_PREREQS_OK');
      const manifest = readFileSync(join(process.cwd(), out), 'utf8');
      expect(manifest).toContain('# Gate 3 Live Rehearsal Capture Manifest - abcdef1');
      expect(manifest).toContain('| Current readiness operator request |');
      expect(manifest).toContain('| Patched-devnet go/no-go JSON |');
      expect(manifest).toContain('| Patched-devnet go/no-go validation |');
      expect(manifest).toContain('LOCAL_PREREQS_OK; local prereqs only; execution not ready');
      expect(manifest).toContain('Testnet 10. Legacy V1 execution quarantine');
      expect(manifest).not.toContain('Approval-gated only: npm run rehearsal:live-preflight');
      expect(manifest).not.toContain('Explicit reviewer and user live approval bound to Expected transaction ID');
      expect(manifest).toContain('| Local 1. Patched-devnet go/no-go JSON |');
      expect(manifest).toContain('| Local 2. Unsigned legacy shape diagnostic |');
      expect(manifest).not.toMatch(/\bnpm(?:\.cmd)?\s+run\s+settle:aggregate\s+--\s+check(?:-with-ingest|-anchored|-batch)?\b/);
      expect(manifest).not.toContain('npm run approvals:draft');
      expect(manifest).toContain('| Secret or environment file read | no |');
      expect(manifest).not.toContain('C:\\');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function prerequisiteMapMarkdown(): string {
  return [
    '# Gate 3 Rehearsal Prerequisite Map - abcdef1',
    '',
    '## Validation Snapshot',
    '',
    '| Field | Value |',
    '| --- | --- |',
    '| Result | BLOCKED |',
    '| Structural issues | 65 |',
  ].join('\n');
}

function operatorPacketMarkdown(): string {
  return [
    '# Gate 3 Rehearsal Operator Packet - abcdef1',
    '',
    '## Source Snapshot',
    '',
    '| Field | Value |',
    '| --- | --- |',
    '| Current result | BLOCKED |',
    '| Structural issues | 65 |',
  ].join('\n');
}

function goNoGoReport() {
  return buildGoNoGoJsonReport(
    [
      pass('Bridge source', 'source checkout present'),
      warn('Secret env inspection', 'disabled by default; no .env file read', true),
      nodeConfigInspectionSkipped(),
      runtimeStateInspectionSkipped(),
    ],
    {
      generatedAt: '2026-07-06T00:00:00.000Z',
      runtimeStateInspection: 'skipped',
    },
  );
}

function goNoGoValidationMarkdown(target: string): string {
  return [
    '# Patched Devnet Prerequisite Validation Output',
    '',
    'Result:',
    '',
    '```text',
    `${target}: PASS go/no-go prerequisite report: verdict=LOCAL_PREREQS_OK; not Gate 3 closure; not broadcast authorization`,
    '```',
    '',
    'Validation status: PASS',
    '',
    'Boundary:',
    '',
    '- Does not close Gate 3.',
    '- Does not authorize transaction broadcast.',
  ].join('\n');
}
