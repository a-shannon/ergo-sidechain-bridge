import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  buildTrustlessBurnExecutionRequestCommand,
  buildTrustlessBurnExecutionRequestReport,
  formatTrustlessBurnExecutionRequestMarkdown,
  validateTrustlessBurnExecutionRequestReportJson,
} from './trustless-burn-execution-request.js';

describe('Gate 5 trustless burn execution request', () => {
  it('turns the prerequisite map and operator packet into a bounded operator request', () => {
    const report = buildTrustlessBurnExecutionRequestReport({
      sourceCommit: 'abcdef1',
      prerequisiteMapTarget:
        '../evidence/trustless-burn/gate5-trustless-burn-prerequisite-map-2026-07-06-abcdef1.md',
      prerequisiteMapMarkdown: prerequisiteMapMarkdown(),
      operatorPacketTarget:
        '../evidence/trustless-burn/gate5-trustless-burn-operator-packet-2026-07-06-abcdef1.md',
      operatorPacketMarkdown: operatorPacketMarkdown(),
      command: buildTrustlessBurnExecutionRequestCommand({
        sourceCommit: 'abcdef1',
        prerequisiteMap: '../evidence/trustless-burn/map.md',
        operatorPacket: '../evidence/trustless-burn/packet.md',
        out: '../evidence/trustless-burn/request.md',
        jsonOut: '../evidence/trustless-burn/artifacts/request.json',
      }),
    });
    const markdown = formatTrustlessBurnExecutionRequestMarkdown(report);

    expect(report.status).toBe('TRUSTLESS_BURN_EXECUTION_REQUEST_READY');
    expect(report.exitCode).toBe(0);
    expect(report.candidateTarget).toBe('../evidence/trustless-burn/candidate.md');
    expect(report.prerequisiteMapResult).toBe('BLOCKED');
    expect(report.prerequisiteMapStructuralIssues).toBe(20);
    expect(report.operatorPacketResult).toBe('BLOCKED');
    expect(report.operatorPacketStructuralIssues).toBe(20);
    expect(report.operatorRequests).toHaveLength(6);
    expect(report.operatorRequests[0].phase).toBe('1. Bind one non-mainnet trustless-burn instance');
    expect(report.evidenceTargetsToProduce).toContain(
      '../evidence/trustless-burn/artifacts/<gate5-trustless-anchor-observe-report.json>',
    );
    expect(report.forbiddenInputs).toContain(
      'Do not provide .env values, mnemonics, private keys, wallet material, API keys, node auth tokens, seed phrases, raw runtime databases, private deployment-state files, or node data directories.',
    );
    expect(report.boundary['Secret or environment file read']).toBe('no');
    expect(report.boundary['Wallet recovery material or private key read']).toBe('no');
    expect(report.boundary['Runtime database opened by request command']).toBe('no');
    expect(report.boundary['Private deployment state opened by request command']).toBe('no');
    expect(report.boundary['Node or RPC request performed by request command']).toBe('no');
    expect(report.boundary['Transaction signing/check/submit/broadcast/reconciliation/deployment performed']).toBe('no');
    expect(report.boundary['Gate 5 trustless-burn evidence claimed complete']).toBe('no');
    expect(report.boundary['Release gate PASS claimed']).toBe('no');
    expect(validateTrustlessBurnExecutionRequestReportJson(report)).toEqual([]);
    expect(markdown).toContain('# Gate 5 Trustless Burn Execution Request');
    expect(markdown).toContain('| Prerequisite map structural issues | 20 |');
    expect(markdown).toContain('Bind one non-mainnet trustless-burn instance');
    expect(markdown).toContain('Do not provide .env values');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('rejects reports that flip secret, runtime-state, node, signing, or claim boundaries', () => {
    const report = buildTrustlessBurnExecutionRequestReport({
      sourceCommit: 'abcdef1',
      prerequisiteMapTarget: '../evidence/trustless-burn/map.md',
      prerequisiteMapMarkdown: prerequisiteMapMarkdown(),
      operatorPacketTarget: '../evidence/trustless-burn/packet.md',
      operatorPacketMarkdown: operatorPacketMarkdown(),
      command: 'npm run trustless:execution-request -- --source-commit abcdef1',
    });

    const errors = validateTrustlessBurnExecutionRequestReportJson({
      ...report,
      boundary: {
        ...report.boundary,
        'Secret or environment file read': 'yes',
        'Wallet recovery material or private key read': 'yes',
        'Runtime database opened by request command': 'yes',
        'Private deployment state opened by request command': 'yes',
        'Node or RPC request performed by request command': 'yes',
        'Transaction signing/check/submit/broadcast/reconciliation/deployment performed': 'yes',
        'Gate 5 trustless-burn evidence claimed complete': 'yes',
        'Release gate PASS claimed': 'yes',
      },
    });

    expect(errors).toContain('--trustless-burn-request-json report.boundary.Secret or environment file read must be no');
    expect(errors).toContain(
      '--trustless-burn-request-json report.boundary.Wallet recovery material or private key read must be no',
    );
    expect(errors).toContain(
      '--trustless-burn-request-json report.boundary.Runtime database opened by request command must be no',
    );
    expect(errors).toContain(
      '--trustless-burn-request-json report.boundary.Private deployment state opened by request command must be no',
    );
    expect(errors).toContain(
      '--trustless-burn-request-json report.boundary.Node or RPC request performed by request command must be no',
    );
    expect(errors).toContain(
      '--trustless-burn-request-json report.boundary.Transaction signing/check/submit/broadcast/reconciliation/deployment performed must be no',
    );
    expect(errors).toContain(
      '--trustless-burn-request-json report.boundary.Gate 5 trustless-burn evidence claimed complete must be no',
    );
    expect(errors).toContain('--trustless-burn-request-json report.boundary.Release gate PASS claimed must be no');
  });

  it('writes guarded Markdown and JSON output from existing Gate 5 inputs', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-burn-request-'));
    try {
      const prerequisiteMap = join(basename(dir), 'map.md');
      const operatorPacket = join(basename(dir), 'packet.md');
      const out = join(basename(dir), 'request.md');
      const jsonOut = join(basename(dir), 'request.json');
      writeFileSync(join(process.cwd(), prerequisiteMap), prerequisiteMapMarkdown(), 'utf8');
      writeFileSync(join(process.cwd(), operatorPacket), operatorPacketMarkdown(), 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/trustless-burn-execution-request.ts',
          '--source-commit',
          'abcdef1',
          '--prerequisite-map',
          prerequisiteMap,
          '--operator-packet',
          operatorPacket,
          '--out',
          out,
          '--json-out',
          jsonOut,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(stripNodeDeprecationWarnings(result.stderr)).toBe('');
      expect(result.stdout).toContain('# Gate 5 Trustless Burn Execution Request');
      expect(result.stdout).toContain('- trustless burn execution request JSON report written:');
      expect(result.stdout).not.toMatch(/\b[A-Za-z]:[\\/]/);
      expect(existsSync(join(process.cwd(), out))).toBe(true);
      expect(existsSync(join(process.cwd(), jsonOut))).toBe(true);
      const written = JSON.parse(readFileSync(join(process.cwd(), jsonOut), 'utf8'));
      expect(written.status).toBe('TRUSTLESS_BURN_EXECUTION_REQUEST_READY');
      expect(written.prerequisiteMapStructuralIssues).toBe(20);
      expect(written.boundary['Secret or environment file read']).toBe('no');
      expect(written.boundary['Transaction signing/check/submit/broadcast/reconciliation/deployment performed']).toBe('no');
      expect(JSON.stringify(written)).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when the prerequisite map is not a Gate 5 prerequisite map', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-trustless-burn-request-invalid-'));
    try {
      const prerequisiteMap = join(basename(dir), 'map.md');
      const operatorPacket = join(basename(dir), 'packet.md');
      writeFileSync(join(process.cwd(), prerequisiteMap), '# Other Map\n', 'utf8');
      writeFileSync(join(process.cwd(), operatorPacket), operatorPacketMarkdown(), 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/trustless-burn-execution-request.ts',
          '--source-commit',
          'abcdef1',
          '--prerequisite-map',
          prerequisiteMap,
          '--operator-packet',
          operatorPacket,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('--prerequisite-map must be a Gate 5 Trustless Burn Prerequisite Map');
      expect(result.stderr).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function prerequisiteMapMarkdown(): string {
  return [
    '# Gate 5 Trustless Burn Prerequisite Map - abcdef1',
    '',
    '## Validation Snapshot',
    '',
    '| Field | Value |',
    '| --- | --- |',
    '| Validator commit | abcdef1 |',
    '| Candidate target | ../evidence/trustless-burn/candidate.md |',
    '| Result | BLOCKED |',
    '| Structural issues | 20 |',
    '',
    '## Exact Remaining Validator Issues',
    '',
    '| Issue | Evidence prerequisite |',
    '| --- | --- |',
    '| Required Components: Ergo extension-section anchoring: status must be linked before Gate 5 evidence can pass | Anchor observation report. |',
    '| Required Components: Sidechain header/finality verifier: status must be linked before Gate 5 evidence can pass | Finality evidence. |',
    '| Required Components: Burn inclusion proof: status must be linked before Gate 5 evidence can pass | Proof acceptance evidence. |',
    '| Required Components: DUP settlement binding: status must be linked before Gate 5 evidence can pass | DUP settlement binding. |',
    '| Required Components: Independent review: status must be linked before Gate 5 evidence can pass | Review evidence. |',
    '| Positive Proof Acceptance: Valid burn proof acceptance: status must be linked before Gate 5 evidence can pass | Valid proof acceptance. |',
    '',
    '## Anchor Observation Input Request',
    '',
    'The sanitized public extension-observation JSON for `trustless:anchor-observe` must contain only public read-only extension data.',
    '',
    '## SPV Tracker Observation Input Request',
    '',
    'The sanitized public observation JSON for `trustless:spv-tracker-observe` must contain public tracker history.',
    '',
    '## Next Evidence Sequence',
    '',
    '| Step | Status under current authorization | Required output |',
    '| --- | --- | --- |',
    '| Capture proof acceptance and DUP settlement binding evidence | blocked until proof path and settlement drill are available | Positive burn proof acceptance plus DUP insertion. |',
    '',
    '## Boundary',
    '',
    '| Boundary | Value |',
    '| --- | --- |',
    '| Planning output only | yes |',
    '| Evidence row closure claimed | no |',
    '| Release gate PASS claimed | no |',
    '| Runtime database or deployment state opened | no |',
    '| Secret or environment file read | no |',
    '| Transaction broadcast, submit, deploy, reconcile, sign, or state mutation performed | no |',
  ].join('\n');
}

function operatorPacketMarkdown(): string {
  return [
    '# Gate 5 Trustless Burn Operator Packet - abcdef1',
    '',
    '## Source Snapshot',
    '',
    '| Field | Value |',
    '| --- | --- |',
    '| Candidate target | ../evidence/trustless-burn/candidate.md |',
    '| Prerequisite map | ../evidence/trustless-burn/map.md |',
    '| Current result | BLOCKED |',
    '| Structural issues | 20 |',
    '',
    '## Capture Inputs',
    '',
    '| Area | Operator must capture | Evidence to link |',
    '| --- | --- | --- |',
    '| Proof-path identity | Sidechain commitment, bridgeEventRoot, burnId, amount, recipient, sidechain transaction, event index, and duplicate-prevention key. | Proof-vector validation and burn-proof rows. |',
    '| Extension anchoring | Sanitized public extension-observation JSON and trustless:anchor-observe report. | Anchor observation report. |',
    '| SPV tracker and finality | Sanitized public tracker history, expected sidechain entry, tracker digest, proof digest, and finality binding. | SPV tracker observation and reconciliation report. |',
    '| Proof acceptance and DUP settlement | Positive proof acceptance and DUP settlement binding evidence. | Accepted burn proof evidence and negative rejection evidence. |',
    '| Independent review | Protocol, security, and operator review outcomes. | Independent review evidence and sign-off rows. |',
    '',
    '## Required Output Bindings',
    '',
    '- Trustless burn verification implemented = yes',
    '- Transitional trusted burn path disabled = yes',
    '- Critical/high findings open = 0',
    '- Production-ready claim allowed = no',
    '- Testnet production-candidate claim allowed = yes',
    '- Release supported = production deployment candidate',
    '',
    '## Boundary',
    '',
    '| Boundary | Value |',
    '| --- | --- |',
    '| Planning output only | yes |',
    '| Derived from Gate 5 prerequisite map | yes |',
    '| Completed trustless burn evidence claimed | no |',
    '| Evidence row closure claimed | no |',
    '| Release gate PASS claimed | no |',
    '| Runtime database or deployment state opened | no |',
    '| Transaction broadcast, submit, deploy, reconcile, sign, or state mutation performed | no |',
  ].join('\n');
}

function stripNodeDeprecationWarnings(stderr: string): string {
  return stderr
    .split(/\r?\n/)
    .filter(line => !line.includes('[DEP0205]'))
    .filter(line => !line.includes('Use `node --trace-deprecation'))
    .join('\n')
    .trim();
}
