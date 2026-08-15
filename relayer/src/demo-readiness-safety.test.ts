import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

describe('demo readiness safety', () => {
  const source = readFileSync(join(process.cwd(), 'src/scripts/demo-readiness.ts'), 'utf8');
  const sidechainPreflightSource = readFileSync(join(process.cwd(), 'src/scripts/sidechain-demo-preflight.ts'), 'utf8');

  it('keeps public boundary mode before runtime helpers and deployment-state imports', () => {
    expect(source).not.toContain("import { ethers } from 'ethers'");
    expect(source).not.toContain("from '../ergo-helpers.js'");
    expect(source).not.toContain("from '../config.js'");
    expect(source).not.toContain("from '../batch-demo-preflight.js'");
    expect(source).toContain("await import('ethers')");
    expect(source).toContain("await import('../ergo-helpers.js')");
    expect(source).toContain("await import('../config.js')");
    expect(source).toContain("await import('../batch-demo-preflight.js')");
    expect(source).toContain("await import('../legacy-owner-mint-readiness.js')");

    const boundaryCheck = source.indexOf('if (process.argv.includes(PUBLIC_BOUNDARY_FLAG))');
    expect(boundaryCheck).toBeGreaterThan(-1);

    for (const guardedImport of [
      "await import('ethers')",
      "await import('../ergo-helpers.js')",
      "await import('../config.js')",
      "await import('../batch-demo-preflight.js')",
      "await import('../legacy-owner-mint-readiness.js')",
    ]) {
      expect(source.indexOf(guardedImport)).toBeGreaterThan(boundaryCheck);
    }
  });

  it('emits a public boundary report without opening deployment or runtime state', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/demo-readiness.ts',
        '--public-boundary',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Bridge Demo Readiness Public Boundary Report');
    expect(result.stdout).toContain('| Command | npm run demo:readiness -- --public-boundary |');
    expect(result.stdout).toContain('| Runtime database opened | no |');
    expect(result.stdout).toContain('| Deployment state opened | no |');
    expect(result.stdout).toContain('| Dotenv loaded | no |');
    expect(result.stdout).toContain('| Ergo node or sidechain RPC request performed | no |');
    expect(result.stdout).toContain('| Transaction broadcast, submit, deploy, signing, reconcile, or state mutation performed | no |');
  });

  it('prints demo readiness help before runtime helpers and deployment-state imports', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/demo-readiness.ts',
        '--help',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run demo:readiness');
    expect(result.stdout).toContain('--public-boundary');
    expect(result.stdout).not.toContain('Bridge Demo Readiness Check');
    expect(result.stdout).not.toContain('Loaded deployed state');
    expect(result.stdout).not.toContain('ERROR GET');
  });

  it('keeps sidechain preflight help before RPC and deployment-state imports', () => {
    expect(sidechainPreflightSource).not.toContain("import { ethers } from 'ethers'");
    expect(sidechainPreflightSource).not.toContain("import { loadDeployedState } from '../config.js'");
    expect(sidechainPreflightSource).toContain("await import('ethers')");
    expect(sidechainPreflightSource).toContain("await import('../config.js')");

    const helpCheck = sidechainPreflightSource.indexOf("if (isHelpRequested(process.argv))");
    expect(helpCheck).toBeGreaterThan(-1);

    for (const guardedImport of [
      "await import('ethers')",
      "await import('../config.js')",
    ]) {
      expect(sidechainPreflightSource.indexOf(guardedImport)).toBeGreaterThan(helpCheck);
    }
  });

  it('prints sidechain preflight help without opening deployment state or EVM RPC', () => {
    const result = spawnSync(
      process.execPath,
      [
        'node_modules/tsx/dist/cli.mjs',
        'src/scripts/sidechain-demo-preflight.ts',
        '--help',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: npm run demo:sidechain:preflight');
    expect(result.stdout).not.toContain('Sidechain Demo Preflight');
    expect(result.stdout).not.toContain('JsonRpcProvider failed');
    expect(result.stdout).not.toContain('Loaded deployed state');
  });

  it('routes both readiness scripts through the executable legacy-profile classifiers', () => {
    for (const script of [source, sidechainPreflightSource]) {
      expect(script).toContain('classifyLegacyOwnerMintDeploymentMetadata');
      expect(script).toContain('classifyLegacyOwnerMintRuntimeCode');
    }
  });
});
