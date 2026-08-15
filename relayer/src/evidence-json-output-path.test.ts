import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  resolveEvidenceJsonOutputPath,
  validateEvidenceJsonOutputPath,
} from './evidence-json-output-path.js';

describe('evidence JSON output paths', () => {
  it('accepts relative JSON output paths inside the bridge repository', () => {
    expect(validateEvidenceJsonOutputPath('../evidence/live-rehearsals/preflight.json')).toEqual([]);
    const paddedResult = resolveEvidenceJsonOutputPath('  tmp/offline-gate.json  ');

    expect(resolveEvidenceJsonOutputPath('tmp/offline-gate.json').errors).toEqual([]);
    expect(paddedResult.errors).toEqual([]);
    expect(paddedResult.path?.replace(/\\/g, '/')).toMatch(/relayer\/tmp\/offline-gate\.json$/);
  });

  it('blocks claim-escalating JSON output target names', () => {
    for (const target of [
      '../evidence/live-rehearsals/production-ready-live-preflight.json',
      '../evidence/live-rehearsals/mainnet-production-live-preflight.json',
      '../evidence/live-rehearsals/testnet-production-candidate-live-preflight.json',
    ]) {
      const errors = validateEvidenceJsonOutputPath(target);

      expect(errors, target).toContain(
        '--json-out <blocked output target> must not use production claim wording',
      );
      expect(errors.join('\n'), target).not.toContain(target);
    }
  });

  it('rejects unsafe JSON output paths without leaking sensitive targets', () => {
    expect(validateEvidenceJsonOutputPath('../evidence/preflight.md')).toContain(
      '--json-out must be a JSON file',
    );
    expect(validateEvidenceJsonOutputPath('artifact://preflight/report.json')).toContain(
      '--json-out must not be a URI',
    );
    const paddedUriErrors = validateEvidenceJsonOutputPath(
      '  https://example.invalid/preflight/report.json?token=secret  ',
    );
    expect(paddedUriErrors).toContain('--json-out must not be a URI');
    expect(paddedUriErrors.join('\n')).not.toContain('token=secret');
    expect(paddedUriErrors.join('\n')).not.toContain('example.invalid');
    expect(validateEvidenceJsonOutputPath(['C:', 'tmp', 'report.json'].join('\\'))).toContain(
      '--json-out must be a relative path inside the bridge repository',
    );
    expect(validateEvidenceJsonOutputPath('../evidence/.env.report.json')).toContain(
      '--json-out <blocked output target> must not target runtime or secret-bearing material',
    );
    expect(validateEvidenceJsonOutputPath('../evidence/operator-private-key-report.json')).toContain(
      '--json-out <blocked output target> must not target runtime or secret-bearing material',
    );
    for (const target of [
      '../evidence/signing-key-report.json',
      '../evidence/api-key-report.json',
      '../evidence/seed-phrase-report.json',
      '../evidence/sourceTarget=(.env)/preflight.json',
      '../evidence/sourceTarget=(runtime/bridge-state.sqlite)/preflight.json',
      '../evidence/sourceTarget=%28.env%29/preflight.json',
      '../evidence/sourceTarget=%28runtime%2Fbridge-state.sqlite%29/preflight.json',
    ]) {
      const errors = validateEvidenceJsonOutputPath(target);
      expect(errors, target).toContain(
        '--json-out <blocked output target> must not target runtime or secret-bearing material',
      );
      expect(errors.join('\n'), target).not.toContain(target);
    }
    for (const target of [
      '../evidence/sourceTarget=%2Ftmp%2Fpreflight.json',
      '../evidence/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fpreflight.json',
    ]) {
      const errors = validateEvidenceJsonOutputPath(target);
      expect(errors, target).toContain(
        '--json-out <blocked output target> must not reference local-only evidence target bindings',
      );
      expect(errors.join('\n'), target).not.toContain(target);
    }
  });

  it('rejects outputs through junctions outside the bridge repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'evidence-json-output-'));
    const bridgeRoot = join(root, 'bridge');
    const relayerRoot = join(bridgeRoot, 'relayer');
    const external = join(root, 'external');
    const link = join(bridgeRoot, 'evidence-link');

    try {
      mkdirSync(relayerRoot, { recursive: true });
      mkdirSync(external, { recursive: true });
      symlinkSync(external, link, process.platform === 'win32' ? 'junction' : 'dir');

      const errors = validateEvidenceJsonOutputPath('../evidence-link/report.json', {
        workspaceRoot: relayerRoot,
        bridgeRoot,
      }).join('\n');

      expect(errors).toContain('--json-out <blocked output target> must resolve inside the bridge repository');
      expect(errors).not.toContain('report.json');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
