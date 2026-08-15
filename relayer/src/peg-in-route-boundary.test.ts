import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = path.dirname(fileURLToPath(import.meta.url));

function source(relativePath: string): string {
  return readFileSync(path.join(SOURCE_ROOT, relativePath), 'utf8');
}

describe('WP-01 peg-in route boundaries', () => {
  it('keeps the aggregate E2E helper diagnostic-only and free of peg-in minting', () => {
    const e2e = source('scripts/e2e-aggregate-settlement.ts');
    expect(e2e).not.toContain('bridge.mintSERG');
    expect(e2e).not.toContain('mintSERG');
    expect(e2e).not.toContain('Aggregate E2E sERG seed lock');
    expect(e2e).not.toContain('import-pegout');
    expect(e2e).toContain('supportedNonSubmissionCommands');
    expect(e2e).toContain('if (!supportedNonSubmissionCommands.has(command)) usage();');
    expect(e2e).toContain('Historical diagnostic flow');
  });

  it('leaves the old empty-register lock funding helper fail-closed', () => {
    const refund = source('scripts/refund-lock.ts');
    expect(refund).toContain('refund-lock is disabled');
    expect(refund).not.toContain('signAndSubmit');
    expect(refund).not.toContain('deployed_state.json');
    expect(refund).not.toContain('additionalRegisters: {}');
  });

  it('physically removes the historical v3 deposit broadcaster', () => {
    expect(existsSync(path.join(SOURCE_ROOT, 'scripts/trigger-peg-in.ts')))
      .toBe(false);
  });

  it('keeps route observation independent from runtime state and fund capabilities', () => {
    const assessment = source('peg-in-route-observation.ts');
    const cli = source('scripts/peg-in-route-observe.ts');
    const client = source('peg-in-route-read-only-node-client.ts');
    for (const contents of [assessment, cli, client]) {
      expect(contents).not.toContain("from './config.js'");
      expect(contents).not.toContain("from '../config.js'");
      expect(contents).not.toContain('loadDeployedState');
      expect(contents).not.toContain('StateTracker');
      expect(contents).not.toContain('signAndSubmit');
      expect(contents).not.toContain('submitTransaction');
      expect(contents).not.toContain('/transactions/check');
    }
    expect(client).toContain("'/script/p2sAddress'");
    expect(client).not.toContain("'/transactions'");
  });
});
