import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { describe, it, expect } from 'vitest';
import {
  buildGoNoGoJsonReport,
  classifyFinalVerdict,
  classifyPatchedDevnetPackageScripts,
  classifyRuntimeFile,
  formatGoNoGoReport,
  pass,
  runtimeStateInspectionSkipped,
  nodeConfigInspectionSkipped,
  validateGoNoGoJsonReport,
  warn,
  fail,
} from './patched-devnet-go-no-go.js';

const requiredPackageScripts = {
  'e2e:aggregate': 'tsx src/scripts/e2e-aggregate-settlement.ts',
  'demo:devnet:safety': 'tsx src/scripts/devnet-session-safety.ts',
  'demo:patched-devnet:readiness': 'tsx src/scripts/patched-devnet-readiness.ts',
  'demo:anchor:preflight': 'tsx src/scripts/anchor-preflight.ts',
};

function safePrereqReport() {
  return buildGoNoGoJsonReport([
    fail('ergo-source', 'missing: ../ergo-source'),
    pass('run-patched-ergo-devnet.ps1', 'found: scripts/run-patched-ergo-devnet.ps1'),
    warn(
      'Secret env inspection',
      'disabled by default; funding and signer derivation are skipped unless --include-secret-env is set',
      true,
    ),
    nodeConfigInspectionSkipped(),
    runtimeStateInspectionSkipped(),
  ], {
    generatedAt: '2026-06-04T12:00:00.000Z',
    runtimeStateInspection: 'skipped',
  });
}

describe('classifyFinalVerdict', () => {
  it('returns NO-GO when any FAIL is present', () => {
    const results = [
      pass('a', 'ok'),
      fail('b', 'missing'),
      warn('c', 'offline', true),
    ];
    const v = classifyFinalVerdict(results);
    expect(v.verdict).toBe('NO-GO');
    expect(v.exitCode).toBe(1);
    expect(v.message).toContain('NO-GO');
  });

  it('returns LOCAL_PREREQS_OK when live-execution WARNs exist', () => {
    const results = [
      pass('a', 'ok'),
      warn('env', 'not aligned', true),
      warn('node', 'offline', true),
    ];
    const v = classifyFinalVerdict(results);
    expect(v.verdict).toBe('LOCAL_PREREQS_OK');
    expect(v.exitCode).toBe(0);
    expect(v.message).toContain('LOCAL PREREQS OK');
    expect(v.message).toContain('EXECUTION NOT READY');
  });

  it('returns LOCAL_PREREQS_OK even for non-live WARNs', () => {
    const results = [
      pass('a', 'ok'),
      warn('info', 'just a note'),
    ];
    const v = classifyFinalVerdict(results);
    expect(v.verdict).toBe('LOCAL_PREREQS_OK');
    expect(v.exitCode).toBe(0);
  });

  it('keeps value execution disabled when all local results are PASS', () => {
    const results = [
      pass('a', 'ok'),
      pass('b', 'ok'),
      pass('c', 'ok', true),
    ];
    const v = classifyFinalVerdict(results);
    expect(v.verdict).toBe('LOCAL_PREREQS_OK');
    expect(v.exitCode).toBe(0);
    expect(v.message).toContain('VALUE EXECUTION DISABLED');
    expect(v.message).toContain('reviewed activated profile required');
  });
});

describe('classifyPatchedDevnetPackageScripts', () => {
  it('accepts the required scripts only when legacy deployment commands are absent', () => {
    const results = classifyPatchedDevnetPackageScripts(requiredPackageScripts);
    expect(results.every(result => result.status === 'PASS')).toBe(true);
    expect(results).toContainEqual({
      status: 'PASS',
      label: 'retired script: deploy',
      detail: 'absent from package.json',
      liveExecution: undefined,
    });
    expect(results).toContainEqual({
      status: 'PASS',
      label: 'retired script: deploy:sidechain',
      detail: 'absent from package.json',
      liveExecution: undefined,
    });
  });

  it('fails closed if the legacy SCS/DUP deployment command is reintroduced', () => {
    const results = classifyPatchedDevnetPackageScripts({
      ...requiredPackageScripts,
      deploy: 'tsx src/scripts/deploy.ts',
    });
    expect(results).toContainEqual({
      status: 'FAIL',
      label: 'retired script: deploy',
      detail: 'legacy SCS/DUP deployment must not be exposed by package.json',
      liveExecution: undefined,
    });
    expect(classifyFinalVerdict(results).verdict).toBe('NO-GO');
  });

  it('fails closed if the owner-mint deployment command is reintroduced', () => {
    const results = classifyPatchedDevnetPackageScripts({
      ...requiredPackageScripts,
      'deploy:sidechain': 'tsx src/scripts/deploy-sidechain.ts',
    });
    expect(results).toContainEqual({
      status: 'FAIL',
      label: 'retired script: deploy:sidechain',
      detail: 'legacy owner-mint deployment must not be exposed by package.json',
      liveExecution: undefined,
    });
    expect(classifyFinalVerdict(results).verdict).toBe('NO-GO');
  });
});

describe('classifyRuntimeFile', () => {
  it('returns PASS when file does not exist', () => {
    const r = classifyRuntimeFile('contracts/deployed_state.json', false, false);
    expect(r.status).toBe('PASS');
    expect(r.detail).toContain('does not exist');
  });

  it('returns WARN when file exists and is dirty', () => {
    const r = classifyRuntimeFile('contracts/deployed_state.json', true, true);
    expect(r.status).toBe('WARN');
    expect(r.detail).toContain('uncommitted changes');
  });

  it('returns PASS when file exists and is clean', () => {
    const r = classifyRuntimeFile('relayer/bridge-state.sqlite', true, false);
    expect(r.status).toBe('PASS');
    expect(r.detail).toContain('clean');
  });

  it('marks all runtime file checks as liveExecution', () => {
    const r1 = classifyRuntimeFile('a', true, true);
    const r2 = classifyRuntimeFile('a', true, false);
    const r3 = classifyRuntimeFile('a', false, false);
    expect(r1.liveExecution).toBe(true);
    expect(r2.liveExecution).toBe(true);
    expect(r3.liveExecution).toBe(true);
  });

  it('can explicitly skip deployment-state and SQLite inspection', () => {
    const r = runtimeStateInspectionSkipped();
    expect(r.status).toBe('WARN');
    expect(r.liveExecution).toBe(true);
    expect(r.detail).toContain('--skip-runtime-state-checks');
    expect(r.detail).toContain('deployment-state files');
    expect(r.detail).toContain('SQLite state');
    expect(r.detail).toContain('backup directories');
  });

  it('can explicitly skip node config inspection to avoid devnet testMnemonic reads', () => {
    const r = nodeConfigInspectionSkipped();
    expect(r.status).toBe('WARN');
    expect(r.liveExecution).toBe(true);
    expect(r.detail).toContain('node config inspection disabled');
    expect(r.detail).toContain('--include-secret-env');
  });
});

describe('formatGoNoGoReport', () => {
  it('produces ASCII-only output', () => {
    const results = [
      pass('a', 'ok'),
      warn('b', 'not aligned', true),
      fail('c', 'missing'),
    ];
    const report = formatGoNoGoReport(results);
    // No non-ASCII characters
    for (const ch of report) {
      expect(ch.charCodeAt(0)).toBeLessThan(128);
    }
  });

  it('does not contain plain "RESULT: GO"', () => {
    const results = [
      pass('a', 'ok'),
      warn('b', 'offline', true),
    ];
    const report = formatGoNoGoReport(results);
    // Must not match the old misleading verdict
    expect(report).not.toMatch(/RESULT: GO\b(?! )/);
    expect(report).not.toMatch(/RESULT: GO$/m);
    expect(report).toContain('LOCAL PREREQS OK');
  });

  it('does not show READY when all local checks pass', () => {
    const results = [
      pass('a', 'ok'),
      pass('b', 'ok', true),
    ];
    const report = formatGoNoGoReport(results);
    expect(report).toContain('VALUE EXECUTION DISABLED');
    expect(report).not.toContain('READY FOR CONTROLLED DEVNET EXECUTION');
  });

  it('shows NO-GO when FAIL present', () => {
    const results = [
      pass('a', 'ok'),
      fail('b', 'missing'),
    ];
    const report = formatGoNoGoReport(results);
    expect(report).toContain('NO-GO');
  });
});

describe('buildGoNoGoJsonReport', () => {
  it('summarizes checks and preserves no-broadcast boundaries', () => {
    const results = [
      pass('local script', 'found: scripts/run-patched-ergo-devnet.ps1'),
      warn('Secret env inspection', 'disabled by default', true),
      fail('ergo-source', 'missing: ../ergo-source'),
    ];
    const report = buildGoNoGoJsonReport(results, {
      generatedAt: '2026-06-04T12:00:00.000Z',
      secretEnvInspection: 'disabled',
    });

    expect(report.schemaVersion).toBe(2);
    expect(report.command).toBe('demo:patched-devnet:go-no-go');
    expect(report.generatedAt).toBe('2026-06-04T12:00:00.000Z');
    expect(report.secretEnvInspection).toBe('disabled');
    expect(report.nodeConfigInspection).toBe('disabled');
    expect(report.runtimeStateInspection).toBe('inspected');
    expect(report.summary.verdict).toBe('NO-GO');
    expect(report.summary.passCount).toBe(1);
    expect(report.summary.warnCount).toBe(1);
    expect(report.summary.failCount).toBe(1);
    expect(report.summary.liveExecutionWarnCount).toBe(1);
    expect(report.boundary).toEqual({
      noEnvFileLoaded: true,
      noSigning: true,
      noBroadcast: true,
      noDbWrites: true,
      noDeployment: true,
    });
  });

  it('records when secret environment inspection is explicitly enabled', () => {
    const report = buildGoNoGoJsonReport([pass('a', 'ok')], {
      generatedAt: '2026-06-04T12:00:00.000Z',
      secretEnvInspection: 'enabled',
      nodeConfigInspection: 'enabled',
    });

    expect(report.secretEnvInspection).toBe('enabled');
    expect(report.nodeConfigInspection).toBe('enabled');
    expect(report.summary.verdict).toBe('LOCAL_PREREQS_OK');
  });

  it('records when runtime state inspection is explicitly skipped', () => {
    const report = buildGoNoGoJsonReport([runtimeStateInspectionSkipped()], {
      generatedAt: '2026-06-04T12:00:00.000Z',
      runtimeStateInspection: 'skipped',
    });

    expect(report.runtimeStateInspection).toBe('skipped');
    expect(report.summary.verdict).toBe('LOCAL_PREREQS_OK');
    expect(report.checks[0]?.detail).toContain('deployment-state files');
  });
});

describe('validateGoNoGoJsonReport', () => {
  it('passes safe prerequisite JSON without treating NO-GO as Gate 3 closure', () => {
    const result = validateGoNoGoJsonReport(safePrereqReport());

    expect(result.status).toBe('PASS');
    expect(result.errors).toEqual([]);
    expect(result.message).toContain('verdict=NO-GO');
    expect(result.message).toContain('not Gate 3 closure');
    expect(result.message).toContain('not broadcast authorization');
  });

  it('blocks a forged READY verdict while the reviewed activated profile is absent', () => {
    const report = safePrereqReport() as any;
    report.summary.verdict = 'READY';
    report.summary.message = 'forged ready verdict';
    report.summary.exitCode = 0;

    const result = validateGoNoGoJsonReport(report);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain(
      'summary.verdict must not be READY without a reviewed activated value profile',
    );
  });

  it('blocks reports that inspected secret environment or runtime state', () => {
    const report = safePrereqReport() as any;
    report.secretEnvInspection = 'enabled';
    report.nodeConfigInspection = 'enabled';
    report.runtimeStateInspection = 'inspected';
    report.checks = report.checks.filter((check: any) =>
      check.label !== 'Devnet signer alignment' &&
      check.label !== 'Runtime state inspection');

    const result = validateGoNoGoJsonReport(report);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('secretEnvInspection must be disabled');
    expect(result.errors).toContain('nodeConfigInspection must be disabled');
    expect(result.errors).toContain('runtimeStateInspection must be skipped');
    expect(result.errors).toContain('checks must include disabled node config inspection warning');
    expect(result.errors).toContain('checks must include --skip-runtime-state-checks Runtime state inspection warning');
  });

  it('blocks legacy schema v1 reports after node config inspection became explicit', () => {
    const report = safePrereqReport() as any;
    report.schemaVersion = 1;
    delete report.nodeConfigInspection;
    report.checks = report.checks.filter((check: any) => check.label !== 'Devnet signer alignment');
    report.summary.warnCount -= 1;
    report.summary.liveExecutionWarnCount -= 1;

    const result = validateGoNoGoJsonReport(report);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('schemaVersion must be 2');
    expect(result.errors).toContain('nodeConfigInspection must be disabled');
    expect(result.errors).toContain('checks must include disabled node config inspection warning');
  });

  it('blocks reports that weaken no-broadcast or no-deployment boundaries', () => {
    const report = safePrereqReport() as any;
    report.boundary.noBroadcast = false;
    report.boundary.noDeployment = false;

    const result = validateGoNoGoJsonReport(report);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('boundary.noBroadcast must be true');
    expect(result.errors).toContain('boundary.noDeployment must be true');
  });

  it('blocks reports that serialize local absolute paths', () => {
    const report = safePrereqReport() as any;
    const localPath = ['C:', 'Users', 'operator', 'private', 'node.conf'].join('\\');
    report.checks.push({
      status: 'WARN',
      label: 'Local config',
      detail: `config not found: ${localPath}`,
      liveExecution: true,
    });
    report.summary.warnCount += 1;
    report.summary.liveExecutionWarnCount += 1;

    const result = validateGoNoGoJsonReport(report);

    expect(result.status).toBe('BLOCKED');
    expect(result.errors).toContain('go/no-go JSON report must not serialize local absolute paths');
  });

  it('prints safe prerequisite boundaries in CLI help', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-patched-devnet-go-no-go.ts',
        '--help',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run demo:patched-devnet:go-no-go:validate');
    expect(result.stdout).toContain('schemaVersion=2');
    expect(result.stdout).toContain('secretEnvInspection=disabled');
    expect(result.stdout).toContain('nodeConfigInspection=disabled');
    expect(result.stdout).toContain('runtimeStateInspection=skipped');
    expect(result.stdout).toContain('not Gate 3 closure');
    expect(result.stdout).toContain('not live execution approval');
    expect(result.stdout).toContain('not broadcast authorization');
    expect(result.stdout).toContain('not a release claim');
  });

  it('validates a safe prerequisite JSON report through the CLI', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-go-no-go-report-'));
    try {
      const target = join(basename(dir), 'go-no-go-report.json');
      writeFileSync(join(process.cwd(), target), JSON.stringify(safePrereqReport(), null, 2));

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/validate-patched-devnet-go-no-go.ts',
          target,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain(`${target}: PASS go/no-go prerequisite report`);
      expect(result.stdout).toContain('not Gate 3 closure');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks unsafe CLI JSON targets without leaking target details', () => {
    const jsonTarget = '../operator/private-key-go-no-go-report.json';
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/validate-patched-devnet-go-no-go.ts',
        jsonTarget,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('<blocked JSON evidence target>: BLOCKED go/no-go prerequisite report');
    expect(result.stdout).toContain('refusing to read secret-bearing or runtime-state JSON evidence');
    expect(result.stdout).not.toContain(jsonTarget);
    expect(result.stdout).not.toContain(process.cwd());
  });

  it('accepts explicit configured prerequisite paths without serializing local paths', () => {
    const sourceDir = mkdtempSync(join(process.cwd(), 'tmp-go-no-go-source-'));
    const binaryDir = mkdtempSync(join(process.cwd(), 'tmp-go-no-go-frontier-'));
    const reportDir = mkdtempSync(join(process.cwd(), 'tmp-go-no-go-configured-'));
    const frontierBinary = join(binaryDir, 'frontier-template-node.exe');
    const reportTarget = join(basename(reportDir), 'configured-report.json');

    try {
      mkdirSync(join(sourceDir, 'src', 'main', 'resources', 'node1'), { recursive: true });
      writeFileSync(frontierBinary, '');

      const result = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'src/scripts/patched-devnet-go-no-go.ts',
          '--skip-runtime-state-checks',
          '--ergo-source-root',
          sourceDir,
          '--frontier-binary',
          frontierBinary,
          '--json-out',
          reportTarget,
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('ergo-source: found at configured location');
      expect(result.stdout).toContain('frontier-template-node.exe: found at configured default frontier binary location');
      expect(result.stdout).toContain('RESULT: LOCAL PREREQS OK -- EXECUTION NOT READY');
      expect(result.stdout).not.toContain(sourceDir);
      expect(result.stdout).not.toContain(frontierBinary);

      const report = JSON.parse(readFileSync(join(process.cwd(), reportTarget), 'utf8'));
      expect(validateGoNoGoJsonReport(report).status).toBe('PASS');
      expect(JSON.stringify(report)).not.toContain(sourceDir);
      expect(JSON.stringify(report)).not.toContain(frontierBinary);
      expect(report.summary.verdict).toBe('LOCAL_PREREQS_OK');
      expect(report.summary.failCount).toBe(0);
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
      rmSync(binaryDir, { recursive: true, force: true });
      rmSync(reportDir, { recursive: true, force: true });
    }
  });
});

describe('start-substrate launcher', () => {
  it('uses portable Frontier binary resolution aligned with go/no-go checks', () => {
    const launcher = readFileSync(join(process.cwd(), '..', 'start-substrate.bat'), 'utf8');

    expect(launcher).toContain('FRONTIER_TEMPLATE_NODE_PATH');
    expect(launcher).toContain('substrate-node\\target\\release\\frontier-template-node.exe');
    expect(launcher).not.toMatch(/\b[A-Za-z]:\\/);
    expect(launcher).not.toContain('cargo-frontier');
  });
});
