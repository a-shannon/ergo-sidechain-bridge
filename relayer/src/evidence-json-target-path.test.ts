import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import { readEvidenceJsonTarget } from './evidence-json-target-path.js';

describe('evidence JSON target path', () => {
  it('reads relative JSON evidence inside the bridge repository', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-json-target-'));
    try {
      writeFileSync(join(dir, 'live-preflight.json'), JSON.stringify({ status: 'GO' }));

      const result = readEvidenceJsonTarget(`${basename(dir)}/live-preflight.json`, '--live-preflight-report');

      expect(result.errors).toEqual([]);
      expect(result.json).toEqual({ status: 'GO' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses claim-escalating JSON evidence target names', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-json-target-'));
    try {
      const productionReadyTarget = `${basename(dir)}/production-ready-live-preflight.json`;
      const mainnetProductionTarget = `${basename(dir)}/mainnet-production-live-preflight.json`;
      const productionCandidateTarget = `${basename(dir)}/testnet-production-candidate-live-preflight.json`;
      writeFileSync(join(process.cwd(), productionReadyTarget), JSON.stringify({ status: 'GO' }));
      writeFileSync(join(process.cwd(), mainnetProductionTarget), JSON.stringify({ status: 'GO' }));
      writeFileSync(join(process.cwd(), productionCandidateTarget), JSON.stringify({ status: 'GO' }));

      expect(readEvidenceJsonTarget(productionReadyTarget, '--live-preflight-report').errors).toContain(
        `${productionReadyTarget}: --live-preflight-report target must not use production claim wording`,
      );
      expect(readEvidenceJsonTarget(mainnetProductionTarget, '--live-preflight-report').errors).toContain(
        `${mainnetProductionTarget}: --live-preflight-report target must not use production claim wording`,
      );
      expect(readEvidenceJsonTarget(productionCandidateTarget, '--live-preflight-report').errors).toContain(
        `${productionCandidateTarget}: --live-preflight-report target must not use production claim wording`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses secret, runtime, URI, and escaped JSON evidence targets', () => {
    const blockedSecretName = `secrets.${'dlog'}`;

    expect(readEvidenceJsonTarget(`../${blockedSecretName}`, '--live-preflight-report').errors.join('\n'))
      .toContain('refusing to read secret-bearing or runtime-state JSON evidence');
    expect(readEvidenceJsonTarget('artifact://live/live-preflight.json', '--live-preflight-report').errors.join('\n'))
      .toContain('refusing to read URI JSON evidence targets');
    expect(readEvidenceJsonTarget('../../outside/live-preflight.json', '--live-preflight-report').errors.join('\n'))
      .toContain('must resolve inside the bridge repository');
    expect(readEvidenceJsonTarget('bridge-state.sqlite', '--live-preflight-report').errors.join('\n'))
      .toContain('refusing to read secret-bearing or runtime-state JSON evidence');
    for (const target of [
      'operator/signing-key-live-preflight.json',
      'operator/api-key-live-preflight.json',
      'operator/seed-phrase-live-preflight.json',
      '../evidence/sourceTarget=(.env)/live-preflight.json',
      '../evidence/sourceTarget=(runtime/bridge-state.sqlite)/live-preflight.json',
      '../evidence/sourceTarget=%28.env%29/live-preflight.json',
      '../evidence/sourceTarget=%28runtime%2Fbridge-state.sqlite%29/live-preflight.json',
    ]) {
      const result = readEvidenceJsonTarget(target, '--live-preflight-report');
      const serialized = JSON.stringify(result);

      expect(result.label, target).toBe('<blocked JSON evidence target>');
      expect(result.errors.join('\n'), target)
        .toContain('refusing to read secret-bearing or runtime-state JSON evidence');
      expect(serialized, target).not.toContain(target);
    }

    for (const target of [
      '../evidence/sourceTarget=%2Ftmp%2Flive-preflight.json',
      '../evidence/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Flive-preflight.json',
    ]) {
      const result = readEvidenceJsonTarget(target, '--live-preflight-report');
      const serialized = JSON.stringify(result);

      expect(result.label, target).toBe('<blocked JSON evidence target>');
      expect(result.errors.join('\n'), target)
        .toContain('refusing to read local-only JSON evidence target references');
      expect(serialized, target).not.toContain(target);
    }
  });

  it('sanitizes local absolute JSON target labels before reporting blocked reads', () => {
    const uncTarget = ['\\\\operator-share', 'operator', 'live-preflight.json'].join('\\');
    const posixTarget = '/' + ['tmp', 'live-preflight.json'].join('/');

    const uncErrors = readEvidenceJsonTarget(uncTarget, '--live-preflight-report').errors.join('\n');
    const posixErrors = readEvidenceJsonTarget(posixTarget, '--live-preflight-report').errors.join('\n');

    expect(uncErrors).toContain('<blocked JSON evidence target>: refusing to read local absolute JSON evidence paths');
    expect(uncErrors).not.toContain('operator-share');
    expect(posixErrors).toContain('<blocked JSON evidence target>: refusing to read local absolute JSON evidence paths');
    expect(posixErrors).not.toContain(posixTarget);
  });

  it('sanitizes whitespace-padded URI JSON targets before reporting blocked reads', () => {
    const result = readEvidenceJsonTarget(
      '  https://example.invalid/evidence/live-preflight.json?token=secret  ',
      '--live-preflight-report',
    );
    const errors = result.errors.join('\n');

    expect(result.label).toBe('<blocked JSON evidence target>');
    expect(errors).toContain('<blocked JSON evidence target>: refusing to read URI JSON evidence targets');
    expect(errors).not.toContain('token=secret');
    expect(errors).not.toContain('example.invalid');
  });

  it('sanitizes JSON target labels that resolve outside the bridge repository through a junction', () => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-json-target-'));
    const external = mkdtempSync(join(tmpdir(), 'post-submit-json-target-'));
    try {
      writeFileSync(join(external, 'live-preflight.json'), JSON.stringify({ status: 'GO' }));
      try {
        symlinkSync(external, join(dir, 'link-out'), 'junction');
      } catch {
        return;
      }

      const result = readEvidenceJsonTarget(`${basename(dir)}/link-out/live-preflight.json`, '--live-preflight-report');
      const errors = result.errors.join('\n');

      expect(result.label).toBe('<blocked JSON evidence target>');
      expect(errors).toContain('<blocked JSON evidence target>: --live-preflight-report must resolve inside the bridge repository');
      expect(errors).not.toContain('link-out');
      expect(errors).not.toContain('live-preflight.json');
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });
});
