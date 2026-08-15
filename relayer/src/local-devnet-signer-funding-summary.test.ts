import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  buildLocalDevnetSignerFundingSummaryCommand,
  buildLocalDevnetSignerFundingSummaryReport,
  formatLocalDevnetSignerFundingSummaryMarkdown,
  validateLocalDevnetSignerFundingSummaryInputs,
  validateLocalDevnetSignerFundingSummaryReportJson,
} from './local-devnet-signer-funding-summary.js';

describe('Gate 3 local-devnet signer/funding summary', () => {
  it('builds a redacted operator summary from signer and funding command outputs', () => {
    const input = {
      sourceCommit: 'abcdef1',
      executionRequestTarget: '../evidence/rehearsal/gate3-local-devnet-execution-request-2026-07-08-abcdef1.md',
      executionRequestMarkdown: executionRequestMarkdown(),
      signerOutputTarget: '../evidence/live-rehearsals/local-devnet-signer-output.md',
      signerOutputMarkdown: signerOutputMarkdown(),
      fundingOutputTarget: '../evidence/live-rehearsals/local-devnet-funding-output.md',
      fundingOutputMarkdown: fundingOutputMarkdown(),
      signerCommand: 'npm run demo:devnet:signer -- --include-secret-material',
      fundingCommand: 'npm run demo:devnet:funding -- --address <relayer-address>',
      secretMaterialScope: 'scoped private local operator shell; no values serialized',
      command: buildLocalDevnetSignerFundingSummaryCommand({
        sourceCommit: 'abcdef1',
        executionRequest: '../evidence/rehearsal/request.md',
        signerOutput: '../evidence/live-rehearsals/signer.md',
        fundingOutput: '../evidence/live-rehearsals/funding.md',
        signerCommand: 'npm run demo:devnet:signer -- --include-secret-material',
        fundingCommand: 'npm run demo:devnet:funding -- --address <relayer-address>',
        secretMaterialScope: 'scoped private local operator shell; no values serialized',
        out: '../evidence/live-rehearsals/summary.md',
        jsonOut: '../evidence/live-rehearsals/summary.json',
      }),
    };
    expect(validateLocalDevnetSignerFundingSummaryInputs(input)).toEqual([]);

    const report = buildLocalDevnetSignerFundingSummaryReport(input);
    const markdown = formatLocalDevnetSignerFundingSummaryMarkdown(report);

    expect(report.status).toBe('LOCAL_DEVNET_SIGNER_FUNDING_SUMMARY_READY');
    expect(report.signerStatus).toBe('PASS');
    expect(report.fundingStatus).toBe('PASS');
    expect(report.enoughSpendableDevnetErg).toBe('yes');
    expect(report.signerCommand).toBe('npm run demo:devnet:signer -- --include-secret-material');
    expect(report.fundingCommand).toBe('npm run demo:devnet:funding -- --address <relayer-address>');
    expect(report.boundary['Operator-provided redacted summary only']).toBe('yes');
    expect(report.boundary['Secret or environment file read by summary command']).toBe('no');
    expect(report.boundary['Runtime database opened by summary command']).toBe('no');
    expect(report.boundary['Transaction signing performed by summary command']).toBe('no');
    expect(report.boundary['Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed']).toBe('no');
    expect(validateLocalDevnetSignerFundingSummaryReportJson(report)).toEqual([]);
    expect(markdown).toContain('# Gate 3 Local Devnet Signer/Funding Summary');
    expect(markdown).toContain('| Enough spendable devnet ERG | yes |');
    expect(markdown).toContain('| Secret material scope | scoped private local operator shell; no values serialized |');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('rejects unredacted signer or funding outputs before summary generation', () => {
    const errors = validateLocalDevnetSignerFundingSummaryInputs({
      sourceCommit: 'abcdef1',
      executionRequestTarget: '../evidence/rehearsal/request.md',
      executionRequestMarkdown: executionRequestMarkdown(),
      signerOutputTarget: '../evidence/live-rehearsals/signer.md',
      signerOutputMarkdown: `${signerOutputMarkdown()}\nWALLET_MNEMONIC=real secret words\n`,
      fundingOutputTarget: '../evidence/live-rehearsals/funding.md',
      fundingOutputMarkdown: fundingOutputMarkdown(),
      signerCommand: 'npm run demo:devnet:signer -- --include-secret-material',
      fundingCommand: 'npm run demo:devnet:funding -- --address <relayer-address>',
      secretMaterialScope: 'scoped private local operator shell; no values serialized',
      command: 'npm run rehearsal:local-devnet-signer-funding-summary -- --source-commit abcdef1',
    });

    expect(errors).toContain(
      '../evidence/live-rehearsals/signer.md: evidence hygiene must not contain mnemonic, signing-key, secret-key, seed, or API-key assignments',
    );
  });

  it('rejects reports that flip secret, runtime-state, signing, or broadcast boundaries', () => {
    const report = buildLocalDevnetSignerFundingSummaryReport({
      sourceCommit: 'abcdef1',
      executionRequestTarget: '../evidence/rehearsal/request.md',
      executionRequestMarkdown: executionRequestMarkdown(),
      signerOutputTarget: '../evidence/live-rehearsals/signer.md',
      signerOutputMarkdown: signerOutputMarkdown(),
      fundingOutputTarget: '../evidence/live-rehearsals/funding.md',
      fundingOutputMarkdown: fundingOutputMarkdown(),
      signerCommand: 'npm run demo:devnet:signer -- --include-secret-material',
      fundingCommand: 'npm run demo:devnet:funding -- --address <relayer-address>',
      secretMaterialScope: 'scoped private local operator shell; no values serialized',
      command: 'npm run rehearsal:local-devnet-signer-funding-summary -- --source-commit abcdef1',
    });

    const errors = validateLocalDevnetSignerFundingSummaryReportJson({
      ...report,
      boundary: {
        ...report.boundary,
        'Secret or environment file read by summary command': 'yes',
        'Runtime database opened by summary command': 'yes',
        'Transaction signing performed by summary command': 'yes',
        'Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed': 'yes',
      },
    });

    expect(errors).toContain('--local-devnet-signer-funding-summary-json report.boundary.Secret or environment file read by summary command must be no');
    expect(errors).toContain('--local-devnet-signer-funding-summary-json report.boundary.Runtime database opened by summary command must be no');
    expect(errors).toContain('--local-devnet-signer-funding-summary-json report.boundary.Transaction signing performed by summary command must be no');
    expect(errors).toContain(
      '--local-devnet-signer-funding-summary-json report.boundary.Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed must be no',
    );
  });

  it('writes guarded Markdown and JSON output from redacted operator command outputs', () => {
    const parentDir = join(process.cwd(), '..', 'evidence', 'live-rehearsals');
    mkdirSync(parentDir, { recursive: true });
    const dir = mkdtempSync(join(parentDir, 'tmp-local-devnet-signer-funding-summary-'));
    const targetDir = `../evidence/live-rehearsals/${basename(dir)}`;
    try {
      const executionRequest = `${targetDir}/gate3-local-devnet-execution-request-2026-07-08-abcdef1.md`;
      const signerOutput = `${targetDir}/local-devnet-signer-redacted-output.md`;
      const fundingOutput = `${targetDir}/local-devnet-funding-redacted-output.md`;
      const out = `${targetDir}/local-devnet-signer-funding-redacted-summary.md`;
      const jsonOut = `${targetDir}/local-devnet-signer-funding-redacted-summary.json`;
      writeFileSync(join(dir, 'gate3-local-devnet-execution-request-2026-07-08-abcdef1.md'), executionRequestMarkdown(), 'utf8');
      writeFileSync(join(dir, 'local-devnet-signer-redacted-output.md'), signerOutputMarkdown(), 'utf8');
      writeFileSync(join(dir, 'local-devnet-funding-redacted-output.md'), fundingOutputMarkdown(), 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/local-devnet-signer-funding-summary.ts',
          '--source-commit',
          'abcdef1',
          '--execution-request',
          executionRequest,
          '--signer-output',
          signerOutput,
          '--funding-output',
          fundingOutput,
          '--signer-command',
          'npm run demo:devnet:signer -- --include-secret-material',
          '--funding-command',
          'npm run demo:devnet:funding -- --address <relayer-address>',
          '--secret-material-scope',
          'scoped private local operator shell; no values serialized',
          '--out',
          out,
          '--json-out',
          jsonOut,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(stripNodeDeprecationWarnings(result.stderr)).toBe('');
      expect(result.stdout).toContain('# Gate 3 Local Devnet Signer/Funding Summary');
      expect(result.stdout).toContain('- local-devnet signer/funding summary JSON report written:');
      expect(result.stdout).not.toMatch(/\b[A-Za-z]:[\\/]/);
      expect(existsSync(join(dir, 'local-devnet-signer-funding-redacted-summary.md'))).toBe(true);
      expect(existsSync(join(dir, 'local-devnet-signer-funding-redacted-summary.json'))).toBe(true);
      const written = JSON.parse(readFileSync(join(dir, 'local-devnet-signer-funding-redacted-summary.json'), 'utf8'));
      expect(written.status).toBe('LOCAL_DEVNET_SIGNER_FUNDING_SUMMARY_READY');
      expect(written.signerStatus).toBe('PASS');
      expect(written.fundingStatus).toBe('PASS');
      expect(written.boundary['Secret or environment file read by summary command']).toBe('no');
      expect(JSON.stringify(written)).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function executionRequestMarkdown(): string {
  return [
    '# Gate 3 Local Devnet Execution Request',
    '',
    '## Summary',
    '',
    '| Field | Value |',
    '| --- | --- |',
    '| Status | LOCAL_DEVNET_REQUEST_READY |',
    '| Source commit | abcdef1 |',
    '| Signer/funding no-secret defaults | ../evidence/rehearsal/gate3-devnet-signer-funding-no-secret-defaults-2026-07-08-abcdef1.md |',
    '| Signer/funding defaults status | Default signer/funding checks are no-secret and operator-gated |',
    '',
    '## Boundary',
    '',
    '| Boundary | Value |',
    '| --- | --- |',
    '| Secret or environment file read | no |',
    '| Runtime database opened | no |',
    '| Transaction signing performed | no |',
    '| Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed | no |',
  ].join('\n');
}

function signerOutputMarkdown(): string {
  return [
    '# Redacted local-devnet signer output',
    '',
    'Command: npm run demo:devnet:signer -- --include-secret-material',
    '',
    '======================================================================',
    '  Devnet Signer / Mining Target Check',
    '======================================================================',
    '',
    '  Config: .../node1/application.conf',
    '  Fleet signer address: 9hAabc12...def345',
    '  Mining target (DEVNET_MINING_TARGET): 03abcdef...123456',
    '',
    '  [PASS] Devnet mining target: mining target matches Fleet signer: 9hAabc12...def345',
    '  [WARN] Devnet signer alignment (config-only): config-only check is secondary in miningPubKeyHex mode',
    '',
    '  Do not use node-wallet signing in this workflow.',
  ].join('\n');
}

function fundingOutputMarkdown(): string {
  return [
    '# Redacted local-devnet funding output',
    '',
    'Command: npm run demo:devnet:funding -- --address <relayer-address>',
    '',
    '======================================================================',
    '  Devnet Funding Preflight',
    '======================================================================',
    '',
    '  Relayer address: <relayer-address>',
    '',
    '  [PASS] Relayer funding: 0.5 ERG (>= 0.5 comfortable minimum)',
    '  Minimum required: 0.15 ERG',
    '  Comfortable level: 0.5 ERG',
    '',
    '----------------------------------------------------------------------',
    '  P2PK deploy balance:  0.5 ERG',
    '  Reward balance:       not inspected (no secret material)',
    '  Total public balance: 0.5 ERG',
    '',
    '  [PASS] Deploy readiness: P2PK: 0.5 ERG (>= 0.5). Ready to deploy.',
    '',
    '  Do not use node-wallet signing in this workflow.',
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
