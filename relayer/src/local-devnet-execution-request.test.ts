import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

import { describe, expect, it } from 'vitest';

import {
  buildLocalDevnetExecutionRequestCommand,
  buildLocalDevnetExecutionRequestReport,
  formatLocalDevnetExecutionRequestMarkdown,
  validateLocalDevnetExecutionRequestReportJson,
  validatePatchedDevnetPlanJsonReport,
  validateSignerFundingDefaultsMarkdown,
  type PatchedDevnetPlanJsonReport,
} from './local-devnet-execution-request.js';
import {
  buildGoNoGoJsonReport,
  nodeConfigInspectionSkipped,
  pass,
  runtimeStateInspectionSkipped,
  validateGoNoGoJsonReport,
  warn,
} from './patched-devnet-go-no-go.js';

describe('Gate 3 local-devnet execution request', () => {
  it('turns current Gate 3 planning evidence into a bounded operator request', () => {
    const goNoGoValidation = validateGoNoGoJsonReport(goNoGoReport());
    const report = buildLocalDevnetExecutionRequestReport({
      sourceCommit: 'abcdef1',
      captureManifestTarget: '../evidence/rehearsal/gate3-live-rehearsal-capture-manifest-2026-07-06-ec29b2ef.md',
      captureManifestMarkdown: captureManifestMarkdown(),
      goNoGoJsonTarget: '../evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-configured-prereq-2026-07-06-1dea1a5a.json',
      goNoGoValidationTarget: '../evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-configured-prereq-validation-2026-07-06-1dea1a5a.md',
      goNoGoValidation,
      planJsonTarget: '../evidence/rehearsal/artifacts/patched-devnet-plan-2026-07-08-abcdef1.json',
      planJsonReport: patchedDevnetPlanReport(),
      signerFundingDefaultsTarget: '../evidence/rehearsal/gate3-devnet-signer-funding-no-secret-defaults-2026-07-08-836876b4.md',
      signerFundingDefaultsMarkdown: signerFundingDefaultsMarkdown(),
      command: buildLocalDevnetExecutionRequestCommand({
        sourceCommit: 'abcdef1',
        captureManifest: '../evidence/rehearsal/manifest.md',
        goNoGoJson: '../evidence/rehearsal/go-no-go.json',
        goNoGoValidation: '../evidence/rehearsal/go-no-go-validation.md',
        planJson: '../evidence/rehearsal/artifacts/patched-devnet-plan-2026-07-08-abcdef1.json',
        signerFundingDefaults: '../evidence/rehearsal/gate3-devnet-signer-funding-no-secret-defaults-2026-07-08-836876b4.md',
        out: '../evidence/rehearsal/request.md',
        jsonOut: '../evidence/rehearsal/request.json',
      }),
    });
    const markdown = formatLocalDevnetExecutionRequestMarkdown(report);

    expect(report.status).toBe('LOCAL_DEVNET_REQUEST_READY');
    expect(report.exitCode).toBe(0);
    expect(report.captureManifestPrerequisiteResult).toBe('BLOCKED with 65 structural issues');
    expect(report.captureManifestStructuralIssues).toBe(65);
    expect(report.goNoGoVerdict).toBe('LOCAL_PREREQS_OK');
    expect((report as any).patchedDevnetPlanJsonTarget).toBe('../evidence/rehearsal/artifacts/patched-devnet-plan-2026-07-08-abcdef1.json');
    expect((report as any).patchedDevnetPlanStatus).toBe('PATCHED_DEVNET_PLAN_READY');
    expect((report as any).patchedDevnetPlanStepCount).toBe(4);
    expect(report.signerFundingDefaultsStatus).toBe('Default signer/funding checks are no-secret and operator-gated');
    expect(report.operatorRequests).toHaveLength(4);
    expect(report.operatorRequests[2].phase).toBe('3. Prove funding and signer alignment privately');
    expect(report.operatorRequests[2].operatorAction).toContain('--address <relayer-address>');
    expect(report.operatorRequests[2].operatorAction).toContain('--include-secret-material');
    expect(report.forbiddenInputs).toContain(
      'Do not provide .env values, mnemonics, private keys, wallet material, API keys, node auth tokens, or seed phrases.',
    );
    expect((report.boundary as any)['Patched devnet plan reused']).toBe('yes');
    expect(report.boundary['Signer/funding no-secret defaults reused']).toBe('yes');
    expect(report.boundary['Secret or environment file read']).toBe('no');
    expect(report.boundary['Transaction signing performed']).toBe('no');
    expect(report.boundary['Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed']).toBe('no');
    expect(validateLocalDevnetExecutionRequestReportJson(report)).toEqual([]);
    expect(markdown).toContain('# Gate 3 Local Devnet Execution Request');
    expect(markdown).toContain('| Capture manifest structural issues | 65 |');
    expect(markdown).toContain('| Patched devnet plan JSON | ../evidence/rehearsal/artifacts/patched-devnet-plan-2026-07-08-abcdef1.json |');
    expect(markdown).toContain('| Patched devnet plan status | PATCHED_DEVNET_PLAN_READY |');
    expect(markdown).toContain('| Signer/funding no-secret defaults | ../evidence/rehearsal/gate3-devnet-signer-funding-no-secret-defaults-2026-07-08-836876b4.md |');
    expect(markdown).toContain('Prove funding and signer alignment privately');
    expect(markdown).toContain('--address <relayer-address>');
    expect(markdown).toContain('Do not provide .env values');
    expect(markdown).not.toMatch(/\b[A-Za-z]:[\\/]/);
  });

  it('validates signer/funding no-secret defaults evidence before operator requests can use it', () => {
    expect(validateSignerFundingDefaultsMarkdown(signerFundingDefaultsMarkdown(), '../evidence/rehearsal/defaults.md')).toEqual([]);
    expect(validateSignerFundingDefaultsMarkdown('# Missing defaults\n', '../evidence/rehearsal/defaults.md')).toContain(
      '../evidence/rehearsal/defaults.md must include signer/funding no-secret default evidence: # Gate 3 Devnet Signer/Funding No-Secret Defaults',
    );
  });

  it('rejects patched-devnet plan JSON that escalates execution boundaries', () => {
    const report = patchedDevnetPlanReport();
    expect(validatePatchedDevnetPlanJsonReport(report)).toEqual([]);
    expect(validatePatchedDevnetPlanJsonReport({
      ...report,
      boundary: {
        ...report.boundary,
        'Transaction signing performed': 'yes',
        'Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed': 'yes',
      },
    })).toEqual([
      '--plan-json report.boundary.Transaction signing performed must be no',
      '--plan-json report.boundary.Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed must be no',
    ]);
  });

  it('rejects reports that flip secret, signing, or broadcast boundaries', () => {
    const goNoGoValidation = validateGoNoGoJsonReport(goNoGoReport());
    const report = buildLocalDevnetExecutionRequestReport({
      sourceCommit: 'abcdef1',
      captureManifestTarget: '../evidence/rehearsal/manifest.md',
      captureManifestMarkdown: captureManifestMarkdown(),
      goNoGoJsonTarget: '../evidence/rehearsal/go-no-go.json',
      goNoGoValidationTarget: '../evidence/rehearsal/go-no-go-validation.md',
      goNoGoValidation,
      signerFundingDefaultsTarget: '../evidence/rehearsal/signer-funding-defaults.md',
      signerFundingDefaultsMarkdown: signerFundingDefaultsMarkdown(),
      command: 'npm run rehearsal:local-devnet-request -- --source-commit abcdef1',
    });

    const errors = validateLocalDevnetExecutionRequestReportJson({
      ...report,
      boundary: {
        ...report.boundary,
        'Secret or environment file read': 'yes',
        'Transaction signing performed': 'yes',
        'Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed': 'yes',
      },
    });

    expect(errors).toContain('--local-devnet-request-json report.boundary.Secret or environment file read must be no');
    expect(errors).toContain('--local-devnet-request-json report.boundary.Transaction signing performed must be no');
    expect(errors).toContain(
      '--local-devnet-request-json report.boundary.Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed must be no',
    );
  });

  it('writes guarded Markdown and JSON output from existing evidence targets', () => {
    const dir = mkdtempSync(join(process.cwd(), '..', 'evidence', 'rehearsal', 'tmp-local-devnet-request-'));
    const targetDir = `../evidence/rehearsal/${basename(dir)}`;
    try {
      const captureManifest = `${targetDir}/capture-manifest.md`;
      const goNoGoJson = `${targetDir}/go-no-go.json`;
      const goNoGoValidation = `${targetDir}/go-no-go-validation.md`;
      const planJson = `${targetDir}/patched-devnet-plan.json`;
      const signerFundingDefaults = `${targetDir}/gate3-devnet-signer-funding-no-secret-defaults-2026-07-08-abcdef1.md`;
      const out = `${targetDir}/request.md`;
      const jsonOut = `${targetDir}/request.json`;
      writeFileSync(join(dir, 'capture-manifest.md'), captureManifestMarkdown(), 'utf8');
      writeFileSync(join(dir, 'go-no-go.json'), `${JSON.stringify(goNoGoReport(), null, 2)}\n`, 'utf8');
      writeFileSync(join(dir, 'go-no-go-validation.md'), goNoGoValidationMarkdown(goNoGoJson), 'utf8');
      writeFileSync(join(dir, 'patched-devnet-plan.json'), `${JSON.stringify(patchedDevnetPlanReport(), null, 2)}\n`, 'utf8');
      writeFileSync(join(dir, 'gate3-devnet-signer-funding-no-secret-defaults-2026-07-08-abcdef1.md'), signerFundingDefaultsMarkdown(), 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/local-devnet-execution-request.ts',
          '--source-commit',
          'abcdef1',
          '--capture-manifest',
          captureManifest,
          '--go-no-go-json',
          goNoGoJson,
          '--go-no-go-validation',
          goNoGoValidation,
          '--plan-json',
          planJson,
          '--signer-funding-defaults',
          signerFundingDefaults,
          '--out',
          out,
          '--json-out',
          jsonOut,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(0);
      expect(stripNodeDeprecationWarnings(result.stderr)).toBe('');
      expect(result.stdout).toContain('# Gate 3 Local Devnet Execution Request');
      expect(result.stdout).toContain('- local-devnet execution request JSON report written:');
      expect(result.stdout).not.toMatch(/\b[A-Za-z]:[\\/]/);
      expect(existsSync(join(dir, 'request.md'))).toBe(true);
      expect(existsSync(join(dir, 'request.json'))).toBe(true);
      const written = JSON.parse(readFileSync(join(dir, 'request.json'), 'utf8'));
      expect(written.status).toBe('LOCAL_DEVNET_REQUEST_READY');
      expect(written.captureManifestStructuralIssues).toBe(65);
      expect(written.goNoGoVerdict).toBe('LOCAL_PREREQS_OK');
      expect(written.patchedDevnetPlanJsonTarget).toBe(planJson);
      expect(written.patchedDevnetPlanStatus).toBe('PATCHED_DEVNET_PLAN_READY');
      expect(written.patchedDevnetPlanStepCount).toBe(4);
      expect(written.signerFundingDefaultsTarget).toBe(signerFundingDefaults);
      expect(written.boundary['Patched devnet plan reused']).toBe('yes');
      expect(written.boundary['Signer/funding no-secret defaults reused']).toBe('yes');
      expect(written.boundary['Secret or environment file read']).toBe('no');
      expect(written.boundary['Transaction signing performed']).toBe('no');
      expect(JSON.stringify(written)).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when the go/no-go validation Markdown is not bound to PASS output', () => {
    const dir = mkdtempSync(join(process.cwd(), '..', 'evidence', 'rehearsal', 'tmp-local-devnet-request-invalid-'));
    const targetDir = `../evidence/rehearsal/${basename(dir)}`;
    try {
      const captureManifest = `${targetDir}/capture-manifest.md`;
      const goNoGoJson = `${targetDir}/go-no-go.json`;
      const goNoGoValidation = `${targetDir}/go-no-go-validation.md`;
      const signerFundingDefaults = `${targetDir}/gate3-devnet-signer-funding-no-secret-defaults-2026-07-08-abcdef1.md`;
      writeFileSync(join(dir, 'capture-manifest.md'), captureManifestMarkdown(), 'utf8');
      writeFileSync(join(dir, 'go-no-go.json'), `${JSON.stringify(goNoGoReport(), null, 2)}\n`, 'utf8');
      writeFileSync(join(dir, 'go-no-go-validation.md'), '# Missing PASS binding\n', 'utf8');
      writeFileSync(join(dir, 'gate3-devnet-signer-funding-no-secret-defaults-2026-07-08-abcdef1.md'), signerFundingDefaultsMarkdown(), 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/local-devnet-execution-request.ts',
          '--source-commit',
          'abcdef1',
          '--capture-manifest',
          captureManifest,
          '--go-no-go-json',
          goNoGoJson,
          '--go-no-go-validation',
          goNoGoValidation,
          '--signer-funding-defaults',
          signerFundingDefaults,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('--go-no-go-validation must include PASS go/no-go prerequisite report');
      expect(result.stderr).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when signer/funding defaults evidence is missing required no-secret bindings', () => {
    const dir = mkdtempSync(join(process.cwd(), '..', 'evidence', 'rehearsal', 'tmp-local-devnet-request-invalid-defaults-'));
    const targetDir = `../evidence/rehearsal/${basename(dir)}`;
    try {
      const captureManifest = `${targetDir}/capture-manifest.md`;
      const goNoGoJson = `${targetDir}/go-no-go.json`;
      const goNoGoValidation = `${targetDir}/go-no-go-validation.md`;
      const signerFundingDefaults = `${targetDir}/gate3-devnet-signer-funding-no-secret-defaults-2026-07-08-abcdef1.md`;
      writeFileSync(join(dir, 'capture-manifest.md'), captureManifestMarkdown(), 'utf8');
      writeFileSync(join(dir, 'go-no-go.json'), `${JSON.stringify(goNoGoReport(), null, 2)}\n`, 'utf8');
      writeFileSync(join(dir, 'go-no-go-validation.md'), goNoGoValidationMarkdown(goNoGoJson), 'utf8');
      writeFileSync(join(dir, 'gate3-devnet-signer-funding-no-secret-defaults-2026-07-08-abcdef1.md'), '# Missing defaults\n', 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/local-devnet-execution-request.ts',
          '--source-commit',
          'abcdef1',
          '--capture-manifest',
          captureManifest,
          '--go-no-go-json',
          goNoGoJson,
          '--go-no-go-validation',
          goNoGoValidation,
          '--signer-funding-defaults',
          signerFundingDefaults,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('must include signer/funding no-secret default evidence');
      expect(result.stderr).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when signer/funding defaults path traverses outside rehearsal evidence', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-local-devnet-request-traversal-'));
    try {
      const captureManifest = '../evidence/rehearsal/gate3-live-rehearsal-capture-manifest-2026-07-07-3de8887a.md';
      const goNoGoJson = '../evidence/rehearsal/artifacts/patched-devnet-go-no-go-local-nodes-online-prereq-2026-07-07-3de8887a.json';
      const goNoGoValidation = '../evidence/rehearsal/artifacts/patched-devnet-go-no-go-local-nodes-online-prereq-validation-2026-07-07-3de8887a.md';
      const traversedDefaults = `../evidence/rehearsal/../../relayer/${basename(dir)}/gate3-devnet-signer-funding-no-secret-defaults-2026-07-08-abcdef1.md`;
      writeFileSync(join(dir, 'gate3-devnet-signer-funding-no-secret-defaults-2026-07-08-abcdef1.md'), signerFundingDefaultsMarkdown(), 'utf8');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/local-devnet-execution-request.ts',
          '--source-commit',
          'abcdef1',
          '--capture-manifest',
          captureManifest,
          '--go-no-go-json',
          goNoGoJson,
          '--go-no-go-validation',
          goNoGoValidation,
          '--signer-funding-defaults',
          traversedDefaults,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('must resolve inside ../evidence/rehearsal/');
      expect(result.stderr).not.toMatch(/\b[A-Za-z]:[\\/]/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function captureManifestMarkdown(): string {
  return [
    '# Gate 3 Live Rehearsal Capture Manifest - abcdef1',
    '',
    '## Evidence Inputs',
    '',
    '| Input | Target | Status |',
    '| --- | --- | --- |',
    '| Gate 3 prerequisite map | ../evidence/rehearsal/gate3-rehearsal-prerequisite-map-2026-07-06-ec29b2ef.md | BLOCKED with 65 structural issues |',
    '| Patched-devnet go/no-go JSON | ../evidence/rehearsal/artifacts/patched-devnet-go-no-go-frontier-configured-prereq-2026-07-06-1dea1a5a.json | LOCAL_PREREQS_OK; local prereqs only; execution not ready |',
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

function patchedDevnetPlanReport(): PatchedDevnetPlanJsonReport {
  return {
    status: 'PATCHED_DEVNET_PLAN_READY',
    exitCode: 0,
    command: 'npm run demo:patched-devnet:plan -- --out <plan.md> --json-out <plan.json>',
    patchedNodeUrl: 'http://127.0.0.1:9051',
    stepCount: 4,
    stepTitles: [
      'No-secret prerequisite snapshot',
      'Private signer and funding checks',
      'Run patched local devnet rehearsal',
      'Assemble Gate 3 evidence',
    ],
    evidenceTargetsToProduce: [
      '../evidence/live-rehearsals/<redacted-signer-output.md>',
      '../evidence/live-rehearsals/<redacted-funding-output.md>',
      '../evidence/live-rehearsals/<local-devnet-signer-funding-summary.md>',
      '../evidence/live-rehearsals/<local-devnet-signer-funding-summary.json>',
      '../evidence/live-rehearsals/<completed-local-devnet-rehearsal.md>',
    ],
    boundary: {
      'Plan output only': 'yes',
      'Secret or environment file read': 'no',
      'Wallet recovery material or private key read': 'no',
      'Node config secret read': 'no',
      'Runtime database opened': 'no',
      'Deployment state opened': 'no',
      'Live node probe executed': 'no',
      'Transaction signing performed': 'no',
      'Transaction broadcast, submit, deploy, confirmation, reconciliation, or state mutation performed': 'no',
      'Gate 3 lifecycle evidence claimed complete': 'no',
      'Release gate PASS claimed': 'no',
      'Production-ready claim allowed': 'no',
      'Testnet production-candidate claim allowed': 'no',
    },
  };
}

function signerFundingDefaultsMarkdown(): string {
  return [
    '# Gate 3 Devnet Signer/Funding No-Secret Defaults',
    '',
    '## Summary',
    '',
    '| Field | Value |',
    '| --- | --- |',
    '| Result | Default signer/funding checks are no-secret and operator-gated |',
    '| Gate 3 lifecycle closure supported | no |',
    '| Release gate PASS supported | no |',
    '',
    '## Code Changes Verified',
    '',
    '| Area | Behavior |',
    '| --- | --- |',
    '| `demo:devnet:signer` | Default mode does not read mnemonic values or node config files. Secret-material derivation requires `--include-secret-material`. |',
    '| `demo:devnet:funding` | Default mode does not read mnemonic values. Public no-secret balance checking is available with `--address <relayer-address>`. Secret-material derivation requires `--include-secret-material`. |',
    '',
    '## Operator Boundary',
    '',
    '| Boundary | Value |',
    '| --- | --- |',
    '| Mnemonic or private key value read by default | no |',
    '| Node config file read by default | no |',
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
