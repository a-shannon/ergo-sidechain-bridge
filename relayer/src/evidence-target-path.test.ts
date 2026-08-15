import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  formatEvidenceTargetLabel,
  readEvidenceMarkdownTarget,
  validateEvidenceTargetPath,
} from './evidence-target-path.js';

describe('evidence target path validation', () => {
  it('accepts Markdown evidence files', () => {
    expect(validateEvidenceTargetPath('../evidence/runbooks/operator-readiness.md')).toEqual([]);
    expect(formatEvidenceTargetLabel('../evidence/runbooks/operator-readiness.md')).toBe(
      '../evidence/runbooks/operator-readiness.md',
    );
  });

  it('refuses claim-escalating Markdown evidence target names', () => {
    expect(validateEvidenceTargetPath('../evidence/runbooks/production-ready-live-preflight.md')).toContain(
      '../evidence/runbooks/production-ready-live-preflight.md: evidence target must not use production claim wording',
    );
    expect(validateEvidenceTargetPath('../evidence/runbooks/mainnet-production-live-preflight.md')).toContain(
      '../evidence/runbooks/mainnet-production-live-preflight.md: evidence target must not use production claim wording',
    );
    expect(validateEvidenceTargetPath('../evidence/runbooks/testnet-production-candidate-live-preflight.md')).toContain(
      '../evidence/runbooks/testnet-production-candidate-live-preflight.md: evidence target must not use production claim wording',
    );
  });

  it('rejects non-Markdown, repository-escape, environment, secret-bearing, and runtime database targets', () => {
    const envFileName = '.' + 'env';
    const secretDlogFileName = `secrets.${'dlog'}`;
    const localFileUrl = 'file:' + '///' + ['C:', 'tmp', 'evidence', 'run.md'].join('/');

    expect(validateEvidenceTargetPath(['C:', 'tmp', 'evidence', 'run.md'].join('\\'))).toContain(
      '<blocked evidence target>: refusing to read local absolute evidence paths',
    );
    expect(validateEvidenceTargetPath('/tmp/evidence/run.md')).toContain(
      '<blocked evidence target>: refusing to read local absolute evidence paths',
    );
    expect(validateEvidenceTargetPath(localFileUrl)).toContain(
      '<blocked evidence target>: refusing to read local file URLs as evidence',
    );
    expect(validateEvidenceTargetPath('https://example.invalid/evidence/run.md')).toContain(
      '<blocked evidence target>: refusing to read URI evidence targets',
    );
    expect(validateEvidenceTargetPath('artifact://release/ci.log')).toContain(
      '<blocked evidence target>: refusing to read URI evidence targets',
    );
    expect(validateEvidenceTargetPath('../../external/evidence.md')).toContain(
      '<blocked evidence target>: refusing to read evidence paths outside the bridge repository',
    );
    expect(validateEvidenceTargetPath(['..', '..', 'external', 'evidence.md'].join('\\'))).toContain(
      '<blocked evidence target>: refusing to read evidence paths outside the bridge repository',
    );
    expect(validateEvidenceTargetPath('../runtime/state.sqlite')).toContain(
      'state.sqlite: evidence validator only accepts Markdown evidence files',
    );
    expect(validateEvidenceTargetPath('../runtime/state.sqlite.md')).toContain(
      'state.sqlite.md: refusing to read runtime database files as evidence',
    );
    expect(validateEvidenceTargetPath(`../${envFileName}`)).toContain(
      '<blocked evidence target>: refusing to read environment files as evidence',
    );
    expect(validateEvidenceTargetPath(`../operator/${secretDlogFileName}.md`)).toContain(
      '<blocked evidence target>: refusing to read secret-bearing or runtime-state paths as evidence',
    );
    expect(validateEvidenceTargetPath('../runtime/wallet-backup.md')).toContain(
      '<blocked evidence target>: refusing to read secret-bearing or runtime-state paths as evidence',
    );
    expect(validateEvidenceTargetPath('../operator/mnemonic-review.md')).toContain(
      '<blocked evidence target>: refusing to read secret-bearing or runtime-state paths as evidence',
    );
    expect(validateEvidenceTargetPath('../operator/private-key-review.md')).toContain(
      '<blocked evidence target>: refusing to read secret-bearing or runtime-state paths as evidence',
    );
    expect(validateEvidenceTargetPath('../operator/signing-key-review.md')).toContain(
      '<blocked evidence target>: refusing to read secret-bearing or runtime-state paths as evidence',
    );
    expect(validateEvidenceTargetPath('../operator/api-key-review.md')).toContain(
      '<blocked evidence target>: refusing to read secret-bearing or runtime-state paths as evidence',
    );
    expect(validateEvidenceTargetPath('../operator/seed-phrase-review.md')).toContain(
      '<blocked evidence target>: refusing to read secret-bearing or runtime-state paths as evidence',
    );
    for (const target of [
      '../evidence/sourceTarget=(.env)/operator-readiness.md',
      '../evidence/sourceTarget=(runtime/bridge-state.sqlite)/operator-readiness.md',
      '../evidence/sourceTarget=%28.env%29/operator-readiness.md',
      '../evidence/sourceTarget=%28runtime%2Fbridge-state.sqlite%29/operator-readiness.md',
    ]) {
      const result = readEvidenceMarkdownTarget(target);
      const expectedError = target.includes('.env')
        ? '<blocked evidence target>: refusing to read environment files as evidence'
        : '<blocked evidence target>: refusing to read secret-bearing or runtime-state paths as evidence';

      expect(validateEvidenceTargetPath(target), target).toContain(expectedError);
      expect(result.label, target).toBe('<blocked evidence target>');
      expect(result.errors, target).toContain(expectedError);
      expect(JSON.stringify(result), target).not.toContain(target);
    }

    for (const target of [
      '../evidence/sourceTarget=%2Ftmp%2Foperator-readiness.md',
      '../evidence/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Foperator-readiness.md',
    ]) {
      const result = readEvidenceMarkdownTarget(target);
      const expectedError = '<blocked evidence target>: refusing to read local-only evidence target references';

      expect(validateEvidenceTargetPath(target), target).toContain(expectedError);
      expect(result.label, target).toBe('<blocked evidence target>');
      expect(result.errors, target).toContain(expectedError);
      expect(JSON.stringify(result), target).not.toContain(target);
    }
  });

  it('sanitizes local paths before reporting target errors', () => {
    const localTarget = ['C:', 'Users', 'alice', 'evidence', 'missing.md'].join('\\');
    const result = readEvidenceMarkdownTarget(localTarget);

    expect(result.label).toBe('<blocked evidence target>');
    expect(result.errors).toContain('<blocked evidence target>: refusing to read local absolute evidence paths');
    expect(result.errors.join('\n')).not.toContain('Users');
    expect(result.errors.join('\n')).not.toContain('missing.md');
  });

  it('sanitizes UNC evidence targets before reporting target errors', () => {
    const localTarget = '\\\\operator-share\\private\\release-review.md';
    const result = readEvidenceMarkdownTarget(localTarget);

    expect(result.label).toBe('<blocked evidence target>');
    expect(result.errors).toContain('<blocked evidence target>: refusing to read local absolute evidence paths');
    expect(result.errors.join('\n')).not.toContain('operator-share');
    expect(result.errors.join('\n')).not.toContain('release-review.md');
  });

  it('sanitizes repository-escape paths before reporting target errors', () => {
    const result = readEvidenceMarkdownTarget('../../external/evidence.md');

    expect(result.label).toBe('<blocked evidence target>');
    expect(result.errors).toContain(
      '<blocked evidence target>: refusing to read evidence paths outside the bridge repository',
    );
    expect(result.errors.join('\n')).not.toContain('../..');
  });

  it('refuses symlinked evidence targets that resolve outside the bridge repository', () => {
    const outsideRoot = mkdtempSync(join(tmpdir(), 'bridge-outside-evidence-'));
    const outsideEvidenceDir = join(outsideRoot, 'evidence');
    const internalRoot = mkdtempSync(join(process.cwd(), '.tmp-evidence-target-'));
    const linkPath = join(internalRoot, 'external-link');

    try {
      mkdirSync(outsideEvidenceDir);
      writeFileSync(join(outsideEvidenceDir, 'run.md'), '# outside evidence\n');
      symlinkSync(outsideEvidenceDir, linkPath, process.platform === 'win32' ? 'junction' : 'dir');

      const result = readEvidenceMarkdownTarget(`${basename(internalRoot)}/external-link/run.md`);

      expect(result.label).toBe('<blocked evidence target>');
      expect(result.errors).toContain(
        '<blocked evidence target>: refusing to read evidence paths outside the bridge repository',
      );
      expect(result.markdown).toBe('');
      expect(result.errors.join('\n')).not.toContain('external-link');
      expect(result.errors.join('\n')).not.toContain('run.md');
      expect(result.errors.join('\n')).not.toContain(outsideRoot);
    } finally {
      rmSync(internalRoot, { recursive: true, force: true });
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });

  it('sanitizes URI targets before reporting target errors', () => {
    const result = readEvidenceMarkdownTarget('https://example.invalid/evidence/run.md?token=secret');

    expect(result.label).toBe('<blocked evidence target>');
    expect(result.errors).toContain('<blocked evidence target>: refusing to read URI evidence targets');
    expect(result.errors.join('\n')).not.toContain('token=secret');
  });

  it('sanitizes whitespace-padded URI targets before reporting target errors', () => {
    const result = readEvidenceMarkdownTarget('  https://example.invalid/evidence/run.md?token=secret  ');
    const errors = result.errors.join('\n');

    expect(result.label).toBe('<blocked evidence target>');
    expect(errors).toContain('<blocked evidence target>: refusing to read URI evidence targets');
    expect(errors).not.toContain('token=secret');
    expect(errors).not.toContain('example.invalid');
  });
});
