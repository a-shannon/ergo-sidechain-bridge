import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  buildBoundaryOnlyCommitteeGuardReport,
  buildBlockedCommitteeGuardReport,
  buildPassedCommitteeGuardReport,
  buildPolicyRejectedCommitteeGuardReport,
  formatCommitteeGuardReportMarkdown,
} from './committee-governance-guard-report.js';

describe('committee governance guard report', () => {
  const spikeSource = readFileSync(
    join(process.cwd(), 'src/scripts/spikes/spike010a-committee-guard-eval.ts'),
    'utf8',
  );
  const stripKnownNodeRuntimeWarnings = (stderr: string): string =>
    stderr
      .replace(
        /\(node:\d+\) \[DEP0205\] DeprecationWarning: `module\.register\(\)` is deprecated\. Use `module\.registerHooks\(\)` instead\.\r?\n?/g,
        '',
      )
      .replace(/\(Use `node --trace-deprecation \.\.\.` to show where the warning was created\)\r?\n?/g, '');

  it('formats node-unavailable blocker evidence without leaking local paths or private key material', () => {
    const windowsPathPrefix = ['C:', 'Users'].join('\\');
    const error = new Error('fetch failed');
    error.stack = [
      'Error: fetch failed',
      `    at ${windowsPathPrefix}\\someone\\private\\bridge\\script.ts:12:3`,
    ].join('\n');
    (error as Error & { cause?: unknown }).cause = {
      code: 'ECONNREFUSED',
      syscall: 'connect',
      address: '127.0.0.1',
      port: 9052,
    };

    const report = buildBlockedCommitteeGuardReport({
      command: 'node .\\node_modules\\tsx\\dist\\cli.mjs src\\scripts\\spikes\\spike010a-committee-guard-eval.ts --out ../evidence/governance/artifacts/current.md',
      nodeEndpoint: 'http://127.0.0.1:9052',
      error,
    });

    const markdown = formatCommitteeGuardReportMarkdown(report);

    expect(markdown).toContain('# Phase 010a Committee Guard Evaluation Report');
    expect(markdown).toContain('| Result | BLOCKED |');
    expect(markdown).toContain('| Exit code | 1 |');
    expect(markdown).toContain('| Node endpoint | http://127.0.0.1:9052 |');
    expect(markdown).toContain('connect ECONNREFUSED 127.0.0.1:9052');
    expect(markdown).toContain('This is not completed Gate 6 command evidence.');
    expect(markdown).toContain('ERGO_API_KEY read | no');
    expect(markdown).toContain('Private key material serialized | no');
    expect(markdown).toContain('Broadcast, submit, deploy, or state mutation performed | no');
    expect(markdown).not.toContain(windowsPathPrefix);
    expect(markdown).not.toContain('privateKey');
    expect(markdown).not.toContain('mnemonic');
  });

  it('formats public-boundary prerequisite output without implying Gate 6 completion', () => {
    const report = buildBoundaryOnlyCommitteeGuardReport({
      command: 'node .\\node_modules\\tsx\\dist\\cli.mjs src\\scripts\\spikes\\spike010a-committee-guard-eval.ts --public-boundary',
    });

    const markdown = formatCommitteeGuardReportMarkdown(report);

    expect(markdown).toContain('| Result | BOUNDARY_ONLY |');
    expect(markdown).toContain('| Exit code | 0 |');
    expect(markdown).toContain('| Node endpoint | not used (--public-boundary) |');
    expect(markdown).toContain('| Ergo node request performed | no |');
    expect(markdown).toContain('| ERGO_API_KEY read | no |');
    expect(markdown).toContain('| Ephemeral committee key generated | no |');
    expect(markdown).toContain('| Key rotation authorization granted | no |');
    expect(markdown).toContain('This is public-boundary prerequisite output only.');
    expect(markdown).not.toContain('privateKey');
    expect(markdown).not.toContain('mnemonic');
  });

  it('formats threshold quorum PASS output without implying key-rotation completion', () => {
    const report = buildPassedCommitteeGuardReport({
      command: 'node .\\node_modules\\tsx\\dist\\cli.mjs src\\scripts\\spikes\\spike010a-committee-guard-eval.ts',
      nodeEndpoint: 'http://127.0.0.1:9052',
      network: 'testnet',
      height: 123,
      publicIdentifiers: {
        'New committee member 1': `02${'11'.repeat(32)}`,
        'New committee member 2': `02${'22'.repeat(32)}`,
        'New committee member 3': `02${'33'.repeat(32)}`,
        'Old single signer': `02${'44'.repeat(32)}`,
        'Non-committee signer': `02${'55'.repeat(32)}`,
      },
      checks: [
        'SCS 2-of-3 committee quorum accepted and old single signer rejected',
        'DUP member-loss quorum accepted and non-committee signer rejected',
      ],
    });

    const markdown = formatCommitteeGuardReportMarkdown(report);

    expect(markdown).toContain('| Result | PASS |');
    expect(markdown).toContain('SCS 2-of-3 committee quorum accepted');
    expect(markdown).toContain('## Public Signer Identifiers');
    expect(markdown).toContain(`| New committee member 1 | 02${'11'.repeat(32)} |`);
    expect(markdown).toContain(`| Old single signer | 02${'44'.repeat(32)} |`);
    expect(markdown).toContain(`| Non-committee signer | 02${'55'.repeat(32)} |`);
    expect(markdown).toContain('| Committee threshold signer quorum evaluated | yes |');
    expect(markdown).toContain('| Member-loss tolerance evaluated | yes |');
    expect(markdown).toContain('| Below-threshold rejection evaluated | yes |');
    expect(markdown).toContain('| Old single signer rejection evaluated | yes |');
    expect(markdown).toContain('| Non-committee rejection evaluated | yes |');
    expect(markdown).toContain('| ERGO_API_KEY read | no |');
    expect(markdown).toContain(
      'It is not release authorization, key-rotation completion, public-claim approval, deployment approval, or transaction broadcast approval.',
    );
    expect(markdown).not.toContain('privateKey');
    expect(markdown).not.toContain('mnemonic');
  });

  it('formats below-policy threshold rejection before node-backed evaluation', () => {
    const report = buildPolicyRejectedCommitteeGuardReport({
      command: 'node .\\node_modules\\tsx\\dist\\cli.mjs src\\scripts\\spikes\\spike010a-committee-guard-eval.ts --committee-threshold 1',
      reason: 'Committee threshold below policy rejected: committee threshold 1 is below minimum 2',
    });

    const markdown = formatCommitteeGuardReportMarkdown(report);

    expect(markdown).toContain('| Result | BLOCKED |');
    expect(markdown).toContain('| Node endpoint | not used (policy rejected before node request) |');
    expect(markdown).toContain('Committee threshold below policy rejected');
    expect(markdown).toContain('| Committee policy validation performed | yes |');
    expect(markdown).toContain('| Committee threshold below policy rejected | yes |');
    expect(markdown).toContain('| Ergo node request performed | no |');
    expect(markdown).toContain('| ERGO_API_KEY read | no |');
    expect(markdown).toContain('| Ephemeral committee key generated | no |');
    expect(markdown).toContain('| Transaction broadcast, submit, deploy, or state mutation performed | no |');
    expect(markdown).not.toContain('privateKey');
    expect(markdown).not.toContain('mnemonic');
  });

  it('keeps public-boundary mode before node-backed evaluation and API-key reads', () => {
    expect(spikeSource).not.toContain('const API_KEY = process.env.ERGO_API_KEY');
    expect(spikeSource).toContain('function ergoApiKey(): string');
    expect(spikeSource).toContain("if (!currentCliArgs?.useEnvApiKey) return 'hello'");
    expect(spikeSource).toContain("'--use-env-api-key'");

    const boundaryCheck = spikeSource.indexOf('if (args.publicBoundary)');
    const evaluationCall = spikeSource.indexOf('await runEvaluation(args)');

    expect(boundaryCheck).toBeGreaterThan(-1);
    expect(evaluationCall).toBeGreaterThan(boundaryCheck);
  });

  it('runs the node-backed drill as a 2-of-3 threshold committee evaluation', () => {
    expect(spikeSource).toContain("const COMMITTEE_THRESHOLD = '2'");
    expect(spikeSource).toContain('const COMMITTEE_SIZE = 3');
    expect(spikeSource).toContain('makeCommittee(committeePolicy.size)');
    expect(spikeSource).toContain('validateCommitteePolicy(args)');
    expect(spikeSource).toContain("'--committee-threshold'");
    expect(spikeSource).toContain("'SCS 2-of-3 committee quorum'");
    expect(spikeSource).toContain("'SCS member-loss quorum'");
    expect(spikeSource).toContain("'SCS single committee signer below threshold'");
    expect(spikeSource).toContain("'SCS old single signer after rotation'");
    expect(spikeSource).toContain("'SCS non-committee signer'");
    expect(spikeSource).toContain('publicIdentifiers');
    expect(spikeSource).toContain("'Old single signer': oldSingleSigner.pubKeyHex");
    expect(spikeSource).toContain("'Non-committee signer': nonCommitteeSigner.pubKeyHex");
    expect(spikeSource).toContain('privateKeyHexes');
  });

  it('emits public-boundary output without an Ergo node or private runtime state', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/spikes/spike010a-committee-guard-eval.ts',
        '--public-boundary',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    expect(stripKnownNodeRuntimeWarnings(result.stderr)).toBe('');
    expect(result.stdout).toContain('# Phase 010a Committee Guard Evaluation Report');
    expect(result.stdout).toContain('| Result | BOUNDARY_ONLY |');
    expect(result.stdout).toContain('| Ergo node request performed | no |');
    expect(result.stdout).toContain('| ERGO_API_KEY read | no |');
    expect(result.stdout).toContain('| Transaction broadcast, submit, deploy, or state mutation performed | no |');
    expect(result.stdout).toContain('This is public-boundary prerequisite output only.');
  });

  it('rejects below-policy threshold before node access or key generation', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'committee-policy-'));
    const reportPath = join(tempDir, 'below-policy.md');
    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/spikes/spike010a-committee-guard-eval.ts',
          '--committee-threshold',
          '1',
          '--out',
          reportPath,
        ],
        { cwd: process.cwd(), encoding: 'utf8' },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('Committee threshold below policy rejected');
      expect(existsSync(reportPath)).toBe(true);

      const report = readFileSync(reportPath, 'utf8');
      expect(report).toContain('| Result | BLOCKED |');
      expect(report).toContain('| Node endpoint | not used (policy rejected before node request) |');
      expect(report).toContain('| Committee policy validation performed | yes |');
      expect(report).toContain('| Committee threshold below policy rejected | yes |');
      expect(report).toContain('| Ergo node request performed | no |');
      expect(report).toContain('| ERGO_API_KEY read | no |');
      expect(report).toContain('| Ephemeral committee key generated | no |');
      expect(report).toContain('| Private key material serialized | no |');
      expect(report).toContain('| Transaction broadcast, submit, deploy, or state mutation performed | no |');
      expect(report).not.toContain(tempDir);
      expect(report).not.toContain('privateKey');
      expect(report).not.toContain('mnemonic');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('does not read ERGO_API_KEY by default during node-unavailable blocker capture', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'committee-no-env-key-'));
    const reportPath = join(tempDir, 'node-unavailable.md');
    const ergoApiKeyEnvName = ['ERGO', 'API', 'KEY'].join('_');
    const sensitiveEnvValue = ['fixture', 'node', 'auth', 'value'].join('-');
    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/spikes/spike010a-committee-guard-eval.ts',
          '--out',
          reportPath,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: {
            ...process.env,
            [ergoApiKeyEnvName]: sensitiveEnvValue,
            ERGO_NODE: 'http://127.0.0.1:1',
          },
        },
      );

      expect(result.status).toBe(1);
      expect(existsSync(reportPath)).toBe(true);

      const combinedOutput = `${result.stdout}\n${result.stderr}`;
      const report = readFileSync(reportPath, 'utf8');
      expect(report).toContain('| Result | BLOCKED |');
      expect(report).toContain('| ERGO_API_KEY read | no |');
      expect(report).toContain('| Private key material serialized | no |');
      expect(report).toContain('| Broadcast, submit, deploy, or state mutation performed | no |');
      expect(report).not.toContain(sensitiveEnvValue);
      expect(combinedOutput).not.toContain(sensitiveEnvValue);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('marks explicit ERGO_API_KEY opt-in without serializing the environment value', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'committee-env-key-opt-in-'));
    const reportPath = join(tempDir, 'node-unavailable.md');
    const ergoApiKeyEnvName = ['ERGO', 'API', 'KEY'].join('_');
    const sensitiveEnvValue = ['fixture', 'node', 'auth', 'value'].join('-');
    try {
      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/spikes/spike010a-committee-guard-eval.ts',
          '--use-env-api-key',
          '--out',
          reportPath,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: {
            ...process.env,
            [ergoApiKeyEnvName]: sensitiveEnvValue,
            ERGO_NODE: 'http://127.0.0.1:1',
          },
        },
      );

      expect(result.status).toBe(1);
      expect(existsSync(reportPath)).toBe(true);

      const combinedOutput = `${result.stdout}\n${result.stderr}`;
      const report = readFileSync(reportPath, 'utf8');
      expect(report).toContain('| Result | BLOCKED |');
      expect(report).toContain('| Command | node .\\node_modules\\tsx\\dist\\cli.mjs src\\scripts\\spikes\\spike010a-committee-guard-eval.ts --use-env-api-key --out <report.md> |');
      expect(report).toContain('| ERGO_API_KEY read | yes |');
      expect(report).not.toContain(sensitiveEnvValue);
      expect(combinedOutput).not.toContain(sensitiveEnvValue);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
