import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  resolveEvidenceOutputPath,
  validateEvidenceOutputPath,
} from './evidence-output-path.js';

function makeWorkspace(): { root: string; bridgeRoot: string; workspaceRoot: string } {
  const root = mkdtempSync(join(tmpdir(), 'evidence-output-path-'));
  const bridgeRoot = join(root, 'bridge');
  const workspaceRoot = join(bridgeRoot, 'relayer');
  mkdirSync(workspaceRoot, { recursive: true });
  return { root, bridgeRoot, workspaceRoot };
}

describe('evidence output path guard', () => {
  it('accepts relative Markdown output paths inside the bridge repository', () => {
    const { root, bridgeRoot, workspaceRoot } = makeWorkspace();
    try {
      const result = resolveEvidenceOutputPath('../evidence/live-rehearsals/run.md', {
        bridgeRoot,
        workspaceRoot,
      });
      const paddedResult = resolveEvidenceOutputPath('  ../evidence/live-rehearsals/run.md  ', {
        bridgeRoot,
        workspaceRoot,
      });

      expect(result.errors).toEqual([]);
      expect(result.path?.replace(/\\/g, '/')).toMatch(/bridge\/evidence\/live-rehearsals\/run\.md$/);
      expect(paddedResult.errors).toEqual([]);
      expect(paddedResult.path?.replace(/\\/g, '/')).toMatch(/bridge\/evidence\/live-rehearsals\/run\.md$/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('blocks output paths that resolve outside the bridge repository', () => {
    const { root, bridgeRoot, workspaceRoot } = makeWorkspace();
    try {
      const errors = validateEvidenceOutputPath('../../outside.md', {
        bridgeRoot,
        workspaceRoot,
      });

      expect(errors).toContain('--out <blocked output target> must resolve inside the bridge repository');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('blocks claim-escalating Markdown output target names', () => {
    const { root, bridgeRoot, workspaceRoot } = makeWorkspace();
    try {
      for (const target of [
        '../evidence/live-rehearsals/production-ready-live-preflight.md',
        '../evidence/live-rehearsals/mainnet-production-live-preflight.md',
        '../evidence/live-rehearsals/testnet-production-candidate-live-preflight.md',
      ]) {
        const errors = validateEvidenceOutputPath(target, { bridgeRoot, workspaceRoot });

        expect(errors, target).toContain(
          '--out <blocked output target> must not use production claim wording',
        );
        expect(errors.join('\n'), target).not.toContain(target);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('blocks absolute, URI, non-Markdown, and sensitive output targets without echoing secrets', () => {
    const { root, bridgeRoot, workspaceRoot } = makeWorkspace();
    try {
      expect(validateEvidenceOutputPath('C:/tmp/evidence.md', { bridgeRoot, workspaceRoot })).toContain(
        '--out must be a relative path inside the bridge repository',
      );
      expect(validateEvidenceOutputPath('artifact://evidence/run.md', { bridgeRoot, workspaceRoot })).toContain(
        '--out must not be a URI',
      );
      const paddedUriErrors = validateEvidenceOutputPath(
        '  https://example.invalid/evidence/run.md?token=secret  ',
        { bridgeRoot, workspaceRoot },
      );
      expect(paddedUriErrors).toContain('--out must not be a URI');
      expect(paddedUriErrors.join('\n')).not.toContain('token=secret');
      expect(paddedUriErrors.join('\n')).not.toContain('example.invalid');
      expect(validateEvidenceOutputPath('../evidence/run.txt', { bridgeRoot, workspaceRoot })).toContain(
        '--out must be a Markdown file',
      );

      const sensitiveErrors = validateEvidenceOutputPath('../.' + 'env.md', { bridgeRoot, workspaceRoot });
      expect(sensitiveErrors.join('\n')).toContain('<blocked output target>');
      expect(sensitiveErrors.join('\n')).not.toContain('.' + 'env');

      for (const target of ['../wallet/recovery.md', '../runtime/bridge-state.sqlite.md']) {
        const errors = validateEvidenceOutputPath(target, { bridgeRoot, workspaceRoot });
        expect(errors.join('\n')).toContain('<blocked output target>');
        expect(errors.join('\n')).not.toContain(target);
      }
      for (const target of [
        '../evidence/signing-key-review.md',
        '../evidence/api-key-review.md',
        '../evidence/seed-phrase-review.md',
        '../evidence/sourceTarget=(.env)/run.md',
        '../evidence/sourceTarget=(runtime/bridge-state.sqlite)/run.md',
        '../evidence/sourceTarget=%28.env%29/run.md',
        '../evidence/sourceTarget=%28runtime%2Fbridge-state.sqlite%29/run.md',
      ]) {
        const errors = validateEvidenceOutputPath(target, { bridgeRoot, workspaceRoot });
        expect(errors, target).toContain(
          '--out <blocked output target> must not target runtime or secret-bearing material',
        );
        expect(errors.join('\n'), target).not.toContain(target);
      }
      for (const target of [
        '../evidence/sourceTarget=%2Ftmp%2Frun.md',
        '../evidence/sourceTarget=file%3A%2F%2F%2FC%3A%2Ftmp%2Frun.md',
      ]) {
        const errors = validateEvidenceOutputPath(target, { bridgeRoot, workspaceRoot });
        expect(errors, target).toContain(
          '--out <blocked output target> must not reference local-only evidence target bindings',
        );
        expect(errors.join('\n'), target).not.toContain(target);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('blocks missing output files below a junction that resolves outside the bridge repository', () => {
    const { root, bridgeRoot, workspaceRoot } = makeWorkspace();
    const external = join(root, 'external');
    try {
      mkdirSync(join(bridgeRoot, 'evidence'), { recursive: true });
      mkdirSync(external, { recursive: true });
      try {
        symlinkSync(external, join(bridgeRoot, 'evidence', 'link-out'), 'junction');
      } catch {
        return;
      }

      const errors = validateEvidenceOutputPath('../evidence/link-out/run.md', {
        bridgeRoot,
        workspaceRoot,
      });

      expect(errors).toContain('--out <blocked output target> must resolve inside the bridge repository');
      expect(errors.join('\n')).not.toContain('run.md');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('blocks existing output targets that are symlinks outside the bridge repository', () => {
    const { root, bridgeRoot, workspaceRoot } = makeWorkspace();
    const external = join(root, 'external');
    try {
      mkdirSync(join(bridgeRoot, 'evidence'), { recursive: true });
      mkdirSync(external, { recursive: true });
      writeFileSync(join(external, 'existing.md'), '# outside\n');
      try {
        symlinkSync(external, join(bridgeRoot, 'evidence', 'link-out'), 'junction');
      } catch {
        return;
      }

      const errors = validateEvidenceOutputPath('../evidence/link-out/existing.md', {
        bridgeRoot,
        workspaceRoot,
      });

      expect(errors).toContain('--out <blocked output target> must resolve inside the bridge repository');
      expect(errors.join('\n')).not.toContain('existing.md');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
