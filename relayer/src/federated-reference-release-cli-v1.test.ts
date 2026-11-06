import { spawnSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, mkdtempSync, realpathSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, parse, relative, resolve } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { canonicalJson } from './ergo-settlement-core/strict-json.js';
import { readBoundedRegularFile } from './create-only-out-of-repository-artifact.js';
import { readBoundedEvidenceJsonTargetText } from './evidence-json-target-path.js';
import { parseFederatedReferenceReleaseEvidenceV1 } from './federated-reference-release-evidence-v1.js';

vi.mock('./create-only-out-of-repository-artifact.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./create-only-out-of-repository-artifact.js')>();
  return { ...actual, readBoundedRegularFile: vi.fn(actual.readBoundedRegularFile) };
});

const relayer = realpathSync(process.cwd());
const directory = mkdtempSync(join(relayer, 'fed-cli-fixture-'));
const commit = '11'.repeat(20);
const tree = '22'.repeat(20);
const candidateArgs = ['--candidate-commit', commit, '--candidate-tree', tree];
const generator = 'src/scripts/prepare-federated-reference-release-evidence-v1.ts';
const release = 'src/scripts/release-gate.ts';

function run(script: string, args: string[]) {
  return spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', script, ...args], {
    cwd: relayer, encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024,
  });
}

function fixture(name: string, bytes: string | Buffer): string {
  const path = join(directory, name);
  writeFileSync(path, bytes, { flag: 'wx' });
  return relative(relayer, path).replace(/\\/g, '/');
}

afterAll(() => {
  const source = realpathSync(directory);
  const inside = relative(relayer, source);
  if (isAbsolute(inside) || inside.startsWith('..') || !basename(source).startsWith('fed-cli-fixture-')) {
    throw new Error('FED fixture cleanup escaped its owned relayer directory');
  }
  // Workspace policy retains directory cleanup in the same-drive quarantine.
  const quarantine = join(parse(source).root, 'A EFFACER');
  mkdirSync(quarantine, { recursive: true });
  const destination = join(quarantine, basename(source));
  if (existsSync(destination)) throw new Error('FED fixture quarantine destination occupied');
  renameSync(source, destination);
  if (existsSync(source) || !existsSync(destination)) throw new Error('FED fixture quarantine move incomplete');
});

describe('FED public evidence preparation and release CLI', () => {
  it('emits canonical blocked evidence for the exact candidate without a parent result', () => {
    const result = run(generator, candidateArgs);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const report = parseFederatedReferenceReleaseEvidenceV1(result.stdout);
    expect(result.stdout).toBe(`${canonicalJson(report)}\n`);
    expect(report.candidate).toEqual({ bridgeCommit: commit, bridgeTree: tree });
    expect(report.parentResult).toBeNull();
    expect(report.checks.publicParentResultValidated).toBe(false);
    expect(report.releaseStatus).toBe('BLOCKED');
    expect(Object.values(report.claims).every(value => value === false)).toBe(true);
  });

  it.each([
    ['unknown', [...candidateArgs, '--unknown', 'value']],
    ['duplicate', [...candidateArgs, '--candidate-commit', commit]],
    ['incomplete flag', [...candidateArgs, '--parent-result-json']],
    ['missing tree', ['--candidate-commit', commit]],
    ['flag instead of value', ['--candidate-commit', '--candidate-tree', tree]],
  ])('refuses generator arguments: %s', (_label, args) => {
    const result = run(generator, args as string[]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('FED reference evidence preparation failed\n');
  });

  it.each(['worker-result.json', 'recovery.json', 'secret.json', 'manifest.json']) (
    'refuses public-parent target %s before the bounded file reader', name => {
      const target = `${basename(directory)}/${name}`;
      vi.mocked(readBoundedRegularFile).mockClear();
      const read = readBoundedEvidenceJsonTargetText(target, '--parent-result-json');
      expect(read.text).toBeUndefined();
      expect(read.errors.length).toBeGreaterThan(0);
      expect(readBoundedRegularFile).not.toHaveBeenCalled();
      const result = run(generator, [...candidateArgs, '--parent-result-json', target]);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
    },
  );

  it('refuses an absolute parent target before the bounded file reader', () => {
    vi.mocked(readBoundedRegularFile).mockClear();
    const target = join(directory, 'absent.json');
    const read = readBoundedEvidenceJsonTargetText(target, '--parent-result-json');
    expect(read.errors.some(error => error.includes('absolute'))).toBe(true);
    expect(readBoundedRegularFile).not.toHaveBeenCalled();
    expect(run(generator, [...candidateArgs, '--parent-result-json', target]).status).toBe(1);
  });

  it.each(['absent', 'invalid', 'duplicate'] as const)(
    'recognizes the FED release flag and refuses %s JSON evidence', kind => {
      const target = kind === 'absent' ? `${basename(directory)}/absent.json`
        : fixture(`${kind}.json`, kind === 'invalid' ? '{' : '{"schema":1,"schema":2}');
      const result = run(release, ['--federated-reference-evidence-json', target]);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('Release gate BLOCKED');
      expect(result.stdout).not.toContain('unknown option --federated-reference-evidence-json');
      expect(result.stdout).toContain('FED');
    },
  );

  it('keeps a validated blocked FED report blocked in the actual release CLI', () => {
    const prepared = run(generator, candidateArgs);
    expect(prepared.status).toBe(0);
    const target = fixture('prepared.json', prepared.stdout);
    const read = readBoundedEvidenceJsonTargetText(target, '--federated-reference-evidence-json');
    expect(read.errors).toEqual([]);
    expect(read.text).toBe(prepared.stdout);
    const result = run(release, ['--federated-reference-evidence-json', target]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Release gate BLOCKED');
    expect(result.stdout).not.toContain('unknown option --federated-reference-evidence-json');
  });
});

describe('bounded public JSON raw reader', () => {
  it('preserves raw bytes and the caller alias for a direct regular single-link file', () => {
    const target = fixture('raw.json', '{"value":1,"value":2}\n');
    const alias = `./${target}`;
    const read = readBoundedEvidenceJsonTargetText(alias, '--parent-result-json');
    expect(read.errors).toEqual([]);
    expect(read.label).toBe(alias);
    expect(read.text).toBe('{"value":1,"value":2}\n');
  });

  it('refuses both names of a hardlinked evidence file', () => {
    const target = fixture('original.json', '{}\n');
    const linked = join(directory, 'linked.json');
    linkSync(resolve(relayer, target), linked);
    for (const name of [target, relative(relayer, linked)]) {
      expect(readBoundedEvidenceJsonTargetText(name, '--parent-result-json').text).toBeUndefined();
    }
  });

  it('refuses symlink evidence where the host permits creating one', () => {
    const target = fixture('direct.json', '{}\n');
    const linked = join(directory, 'symbolic.json');
    try { symlinkSync(resolve(relayer, target), linked, 'file'); }
    catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('EPERM');
      console.info('FED symlink negative unavailable: host EPERM');
      return;
    }
    const read = readBoundedEvidenceJsonTargetText(relative(relayer, linked), '--parent-result-json');
    expect(read.text).toBeUndefined();
    expect(read.errors.length).toBeGreaterThan(0);
  });

  it('refuses evidence reached through a real Windows directory junction before the bounded reader', () => {
    const direct = join(directory, 'junction-source');
    const linked = join(directory, 'junction-alias');
    mkdirSync(direct);
    writeFileSync(join(direct, 'public.json'), '{}\n', { flag: 'wx' });
    try { symlinkSync(direct, linked, 'junction'); }
    catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('EPERM');
      console.info('FED junction negative unavailable: host EPERM');
      return;
    }
    vi.mocked(readBoundedRegularFile).mockClear();
    const read = readBoundedEvidenceJsonTargetText(relative(relayer, join(linked, 'public.json')), '--parent-result-json');
    expect(read.text).toBeUndefined();
    expect(read.errors.length).toBeGreaterThan(0);
    expect(readBoundedRegularFile).not.toHaveBeenCalled();
  });

  it('refuses oversized and malformed UTF-8 evidence separately', () => {
    const oversized = fixture('oversized.json', Buffer.alloc(64 * 1024 + 1, 32));
    const invalidUtf8 = fixture('invalid-utf8.json', Buffer.from([0xff]));
    for (const target of [oversized, invalidUtf8]) {
      const read = readBoundedEvidenceJsonTargetText(target, '--parent-result-json');
      expect(read.text).toBeUndefined();
      expect(read.errors.length).toBeGreaterThan(0);
    }
  });
});
