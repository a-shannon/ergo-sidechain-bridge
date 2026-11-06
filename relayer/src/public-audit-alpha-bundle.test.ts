import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createPublicAuditAlphaBundle,
  parsePublicAuditAlphaBundleArgs,
  PUBLIC_AUDIT_ALPHA_BUNDLE_REF,
} from './public-audit-alpha-bundle.js';

const FAKE_FRONTIER_COMMIT = '12'.repeat(20);

describe('public audit alpha standalone bundle', () => {
  it('exports the exact tracked bridge tree and excludes untracked runtime files', () => {
    const fixture = createFixtureRepository();
    const outputRoot = mkdtempSync(path.join(tmpdir(), 'bridge-audit-output-'));
    try {
      const firstPath = path.join(outputRoot, 'candidate-a.bundle');
      const secondPath = path.join(outputRoot, 'candidate-b.bundle');
      const first = withWorkingDirectory(outputRoot, () => createPublicAuditAlphaBundle({
        bridgeRoot: fixture.bridgeRoot,
        outputPath: firstPath,
      }));
      const hostileGlobalConfig = path.join(outputRoot, 'hostile.gitconfig');
      writeFileSync(hostileGlobalConfig, [
        '[init]',
        '\tdefaultObjectFormat = sha256',
        '[i18n]',
        '\tcommitEncoding = ISO-8859-1',
        '',
      ].join('\n'));
      const second = withEnvironmentVariable(
        'GIT_CONFIG_GLOBAL',
        hostileGlobalConfig,
        () => createPublicAuditAlphaBundle({
          bridgeRoot: fixture.bridgeRoot,
          outputPath: secondPath,
        }),
      );

      expect(first.source.headCommit).toBe(fixture.headCommit);
      expect(first.source.bridgeTree).toBe(fixture.bridgeTree);
      expect(first.source.frontierGitlinkCommit).toBe(FAKE_FRONTIER_COMMIT);
      expect(first.bundle.standaloneTree).toBe(fixture.bridgeTree);
      expect(first.bundle.standaloneCommit).toBe(second.bundle.standaloneCommit);
      expect(first.bundle.sha256).toBe(second.bundle.sha256);
      expect(JSON.stringify(first)).not.toContain(fixture.root);

      const cloneRoot = path.join(outputRoot, 'review-checkout');
      git(['clone', '--branch', 'public-audit-alpha', firstPath, cloneRoot]);
      expect(git(['-C', cloneRoot, 'rev-parse', 'HEAD^{tree}'])).toBe(fixture.bridgeTree);
      expect(git(['-C', cloneRoot, 'status', '--short'])).toBe('');
      expect(readFileSync(path.join(cloneRoot, 'README.md'), 'utf8').trim()).toBe('tracked bridge');
      const standaloneCommitMessage = git(['-C', cloneRoot, 'log', '-1', '--pretty=%B']);
      expect(standaloneCommitMessage).toContain('Classification: public-research-alpha');
      expect(standaloneCommitMessage).toContain(
        'Source publication policy: permitted-after-promotion',
      );
      expect(standaloneCommitMessage).toContain('Source promotion status: unverified');
      expect(standaloneCommitMessage).toContain('Supported release status: blocked');
      expect(existsSync(path.join(cloneRoot, '.gitignore'))).toBe(false);
      expect(existsSync(path.join(cloneRoot, '.env'))).toBe(false);
      expect(existsSync(path.join(cloneRoot, 'bridge-state.sqlite'))).toBe(false);
      expect(existsSync(path.join(cloneRoot, 'operator.log'))).toBe(false);
      expect(git(['-C', cloneRoot, 'ls-tree', 'HEAD', '--', 'substrate-node'])).toBe(
        `160000 commit ${FAKE_FRONTIER_COMMIT}\tsubstrate-node`,
      );
      expect(() => git([
        '-C',
        cloneRoot,
        'cat-file',
        '-e',
        `${fixture.headCommit}^{commit}`,
      ])).toThrow();

      const sidecar = JSON.parse(readFileSync(`${firstPath}.json`, 'utf8'));
      expect(sidecar).toEqual(first);
      expect(first.authority.scope).toBe('bundle-construction-only');
      expect(first.classification).toBe('public-research-alpha');
      expect(first.sourcePublicationPolicy).toBe('permitted-after-promotion');
      expect(first.sourcePromotionStatus).toBe('unverified');
      expect(first).not.toHaveProperty('sourcePublicationStatus');
      expect(first.supportedReleaseStatus).toBe('blocked');
      expect(first.independentReviewStatus).toBe('open');
      expect(first.claimBoundaries).toContain(
        'The bundle contains a separately invoked, loopback devnet-only reward consolidation utility; bundle construction and audit do not invoke it.',
      );
      expect(createHash('sha256').update(readFileSync(firstPath)).digest('hex')).toBe(
        first.bundle.sha256,
      );
      expect(first.bundle.ref).toBe(PUBLIC_AUDIT_ALPHA_BUNDLE_REF);

      rmSync(firstPath, { force: true });
      expect(createPublicAuditAlphaBundle({
        bridgeRoot: fixture.bridgeRoot,
        outputPath: firstPath,
      })).toEqual(first);
      rmSync(`${firstPath}.json`, { force: true });
      expect(createPublicAuditAlphaBundle({
        bridgeRoot: fixture.bridgeRoot,
        outputPath: firstPath,
      })).toEqual(first);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
      rmSync(outputRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it('rejects in-repository, pre-existing, and malformed output targets', () => {
    const fixture = createFixtureRepository();
    const outputRoot = mkdtempSync(path.join(tmpdir(), 'bridge-audit-output-'));
    try {
      expect(() => createPublicAuditAlphaBundle({
        bridgeRoot: fixture.bridgeRoot,
        outputPath: path.join(fixture.root, 'candidate.bundle'),
      })).toThrow('outside the source repository');

      const repositoryAlias = path.join(outputRoot, 'repository-alias');
      symlinkSync(
        fixture.bridgeRoot,
        repositoryAlias,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      expect(() => createPublicAuditAlphaBundle({
        bridgeRoot: fixture.bridgeRoot,
        outputPath: path.join(repositoryAlias, 'candidate.bundle'),
      })).toThrow('outside the source repository');

      const existingPath = path.join(outputRoot, 'existing.bundle');
      writeFileSync(existingPath, 'occupied');
      expect(() => createPublicAuditAlphaBundle({
        bridgeRoot: fixture.bridgeRoot,
        outputPath: existingPath,
      })).toThrow('must not already exist');
      expect(existsSync(`${existingPath}.json`)).toBe(false);

      const prepublishBlockedPath = path.join(outputRoot, 'prepublish-blocked.bundle');
      expect(() => createPublicAuditAlphaBundle({
        bridgeRoot: fixture.bridgeRoot,
        outputPath: prepublishBlockedPath,
        beforePublish: () => {
          throw new Error('prepublication check failed');
        },
      })).toThrow('prepublication check failed');
      expect(existsSync(prepublishBlockedPath)).toBe(false);
      expect(existsSync(`${prepublishBlockedPath}.json`)).toBe(false);

      expect(() => createPublicAuditAlphaBundle({
        bridgeRoot: fixture.bridgeRoot,
        outputPath: path.join(outputRoot, 'candidate.zip'),
      })).toThrow('.bundle extension');

      writeFileSync(path.join(fixture.bridgeRoot, 'README.md'), 'unstaged drift\n');
      expect(() => createPublicAuditAlphaBundle({
        bridgeRoot: fixture.bridgeRoot,
        outputPath: path.join(outputRoot, 'unstaged.bundle'),
      })).toThrow('tracked worktree must match the Git index');
      git(['-C', fixture.root, 'add', 'ergo-sidechain-bridge/README.md']);
      expect(() => createPublicAuditAlphaBundle({
        bridgeRoot: fixture.bridgeRoot,
        outputPath: path.join(outputRoot, 'staged.bundle'),
      })).toThrow('Git index must match HEAD');
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
      rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  it('ignores a substitute Git index supplied through the host environment', () => {
    const fixture = createFixtureRepository();
    const outputRoot = mkdtempSync(path.join(tmpdir(), 'bridge-audit-output-'));
    try {
      const alternateIndex = path.join(outputRoot, 'alternate-index');
      copyFileSync(path.join(fixture.root, '.git', 'index'), alternateIndex);
      writeFileSync(path.join(fixture.bridgeRoot, 'README.md'), 'staged drift\n');
      git(['-C', fixture.root, 'add', 'ergo-sidechain-bridge/README.md']);
      writeFileSync(path.join(fixture.bridgeRoot, 'README.md'), 'tracked bridge\n');

      const outputPath = path.join(outputRoot, 'candidate.bundle');
      expect(() => withEnvironmentVariable('GIT_INDEX_FILE', alternateIndex, () => (
        createPublicAuditAlphaBundle({ bridgeRoot: fixture.bridgeRoot, outputPath })
      ))).toThrow('tracked worktree must match the Git index');
      expect(existsSync(outputPath)).toBe(false);
      expect(existsSync(`${outputPath}.json`)).toBe(false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
      rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  it('fails closed when the validated output directory is replaced', () => {
    const fixture = createFixtureRepository();
    const outputRoot = mkdtempSync(path.join(tmpdir(), 'bridge-audit-output-'));
    const outputDirectory = path.join(outputRoot, 'current');
    const movedDirectory = path.join(outputRoot, 'moved');
    mkdirSync(outputDirectory);
    try {
      expect(() => createPublicAuditAlphaBundle({
        bridgeRoot: fixture.bridgeRoot,
        outputPath: path.join(outputDirectory, 'candidate.bundle'),
        beforePublish: () => {
          renameSync(outputDirectory, movedDirectory);
          symlinkSync(
            fixture.bridgeRoot,
            outputDirectory,
            process.platform === 'win32' ? 'junction' : 'dir',
          );
        },
      })).toThrow('output directory changed during bundle construction');
      expect(existsSync(path.join(fixture.bridgeRoot, 'candidate.bundle'))).toBe(false);
      expect(existsSync(path.join(fixture.bridgeRoot, 'candidate.bundle.json'))).toBe(false);
    } finally {
      rmSync(outputDirectory, { force: true });
      rmSync(movedDirectory, { recursive: true, force: true });
      rmSync(fixture.root, { recursive: true, force: true });
      rmSync(outputRoot, { recursive: true, force: true });
    }
  });

  it('requires one explicit bundle output argument', () => {
    expect(parsePublicAuditAlphaBundleArgs(['--out', 'candidate.bundle'])).toEqual({
      outputPath: 'candidate.bundle',
    });
    expect(() => parsePublicAuditAlphaBundleArgs([])).toThrow('--out is required');
    expect(() => parsePublicAuditAlphaBundleArgs(['--output', 'candidate.bundle'])).toThrow(
      'unknown argument',
    );
    expect(() => parsePublicAuditAlphaBundleArgs(['--out'])).toThrow('requires a bundle path');
    expect(() => parsePublicAuditAlphaBundleArgs([
      '--out',
      'a.bundle',
      '--out',
      'b.bundle',
    ])).toThrow('only once');
  });

});

function createFixtureRepository(): {
  root: string;
  bridgeRoot: string;
  headCommit: string;
  bridgeTree: string;
} {
  const root = mkdtempSync(path.join(tmpdir(), 'bridge-audit-source-'));
  const bridgeRoot = path.join(root, 'ergo-sidechain-bridge');
  git(['init', root]);
  git(['-C', root, 'config', 'user.name', 'A. Shannon']);
  git(['-C', root, 'config', 'user.email', 'a.shannon@users.noreply.github.com']);
  git(['-C', root, 'config', 'commit.gpgsign', 'false']);

  writeFileSync(path.join(root, '.gitignore'), '*.sqlite\n*.log\n.env\n');
  execFileSync(process.execPath, ['-e', [
    "const fs=require('fs');",
    `fs.mkdirSync(${JSON.stringify(bridgeRoot)},{recursive:true});`,
    `fs.writeFileSync(${JSON.stringify(path.join(bridgeRoot, 'README.md'))},'tracked bridge\\n');`,
    `fs.writeFileSync(${JSON.stringify(path.join(bridgeRoot, '.gitmodules'))},'[submodule \\\"substrate-node\\\"]\\n\\tpath = substrate-node\\n\\turl = https://example.invalid/frontier.git\\n');`,
  ].join('')]);
  git(['-C', root, 'add', '.gitignore', 'ergo-sidechain-bridge/README.md', 'ergo-sidechain-bridge/.gitmodules']);
  git([
    '-C',
    root,
    'update-index',
    '--add',
    '--cacheinfo',
    `160000,${FAKE_FRONTIER_COMMIT},ergo-sidechain-bridge/substrate-node`,
  ]);
  git(['-C', root, 'commit', '-m', 'fixture']);

  writeFileSync(path.join(bridgeRoot, '.env'), 'not exported\n');
  writeFileSync(path.join(bridgeRoot, 'bridge-state.sqlite'), 'not exported\n');
  writeFileSync(path.join(bridgeRoot, 'operator.log'), 'not exported\n');

  return {
    root,
    bridgeRoot,
    headCommit: git(['-C', root, 'rev-parse', 'HEAD']),
    bridgeTree: git(['-C', root, 'rev-parse', 'HEAD:ergo-sidechain-bridge']),
  };
}

function git(args: string[]): string {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim();
}

function withWorkingDirectory<T>(workingDirectory: string, action: () => T): T {
  const previous = process.cwd();
  process.chdir(workingDirectory);
  try {
    return action();
  } finally {
    process.chdir(previous);
  }
}

function withEnvironmentVariable<T>(name: string, value: string, action: () => T): T {
  const previous = process.env[name];
  process.env[name] = value;
  try {
    return action();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}
