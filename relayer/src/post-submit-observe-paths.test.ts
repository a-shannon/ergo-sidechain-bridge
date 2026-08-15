import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  resolveStateDbPath,
  validateStateDbPath,
} from './post-submit-observe-paths.js';

describe('post-submit observe state-db path guard', () => {
  it('accepts relative SQLite database paths inside the relayer workspace', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'post-submit-observe-paths-'));
    try {
      mkdirSync(join(workspace, 'runtime'), { recursive: true });
      writeFileSync(join(workspace, 'runtime', 'bridge-state.sqlite'), '');

      const result = resolveStateDbPath('runtime/bridge-state.sqlite', workspace);
      const paddedResult = resolveStateDbPath('  runtime/bridge-state.sqlite  ', workspace);

      expect(result.errors).toEqual([]);
      expect(result.path?.replace(/\\/g, '/')).toMatch(/runtime\/bridge-state\.sqlite$/);
      expect(paddedResult.errors).toEqual([]);
      expect(paddedResult.path?.replace(/\\/g, '/')).toMatch(/runtime\/bridge-state\.sqlite$/);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('blocks state-db targets that resolve outside the relayer workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'post-submit-observe-paths-'));
    const workspace = join(root, 'relayer');
    try {
      mkdirSync(workspace, { recursive: true });
      writeFileSync(join(root, 'outside.sqlite'), '');

      const errors = validateStateDbPath('../outside.sqlite', workspace);

      expect(errors).toContain('--state-db <blocked state-db target> must resolve inside the relayer workspace');
      expect(errors.join('\n')).not.toContain('outside.sqlite');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('blocks absolute, URI, non-SQLite, and sensitive state-db targets without echoing secrets', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'post-submit-observe-paths-'));
    try {
      expect(validateStateDbPath(join(tmpdir(), 'bridge-state.sqlite'), workspace)).toContain(
        '--state-db must be a relative path inside the relayer workspace',
      );
      expect(validateStateDbPath('artifact://runtime/bridge-state.sqlite', workspace)).toContain(
        '--state-db must not be a URI',
      );
      const paddedUriErrors = validateStateDbPath(
        '  https://example.invalid/runtime/bridge-state.sqlite?token=secret  ',
        workspace,
      );
      expect(paddedUriErrors).toContain('--state-db must not be a URI');
      expect(paddedUriErrors.join('\n')).not.toContain('token=secret');
      expect(paddedUriErrors.join('\n')).not.toContain('example.invalid');
      expect(validateStateDbPath('runtime/bridge-state.log', workspace)).toContain(
        '--state-db must point to a SQLite database file',
      );

      const sensitiveErrors = validateStateDbPath('../.' + 'env.sqlite', workspace);
      expect(sensitiveErrors.join('\n')).toContain('<blocked state-db target>');
      expect(sensitiveErrors.join('\n')).not.toContain('.' + 'env');

      for (const target of [
        'operator/private_key.sqlite',
        'operator/keystore.sqlite',
        'operator/signing-key.sqlite',
        'operator/api-key.sqlite',
        'operator/seed-phrase.sqlite',
        'sourceTarget=(.env)/bridge-state.sqlite',
        'sourceTarget=(api-key)/bridge-state.sqlite',
        'sourceTarget=(runtime/bridge-state.sqlite)/bridge-state.sqlite',
        'sourceTarget=%28.env%29/bridge-state.sqlite',
        'sourceTarget=%28runtime%2Fbridge-state.sqlite%29/bridge-state.sqlite',
      ]) {
        const errors = validateStateDbPath(target, workspace);
        expect(errors.join('\n')).toContain('<blocked state-db target>');
        expect(errors.join('\n')).not.toContain(target);
      }

      for (const target of [
        'sourceTarget=%2Ftmp%2Fbridge-state.sqlite',
        'sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Fbridge-state.sqlite',
      ]) {
        const errors = validateStateDbPath(target, workspace);
        expect(errors.join('\n')).toContain('<blocked state-db target>');
        expect(errors.join('\n')).not.toContain(target);
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('blocks missing state-db files below a junction that resolves outside the workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'post-submit-observe-paths-'));
    const workspace = join(root, 'relayer');
    const external = join(root, 'external');
    try {
      mkdirSync(workspace, { recursive: true });
      mkdirSync(external, { recursive: true });
      try {
        symlinkSync(external, join(workspace, 'link-out'), 'junction');
      } catch {
        return;
      }

      const errors = validateStateDbPath('link-out/new.sqlite', workspace);

      expect(errors).toContain('--state-db <blocked state-db target> must resolve inside the relayer workspace');
      expect(errors.join('\n')).not.toContain('new.sqlite');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
