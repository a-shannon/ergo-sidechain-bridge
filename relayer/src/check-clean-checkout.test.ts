import { createHash } from 'node:crypto';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildCompilerCheckPlan,
  environmentWithNodeOnPath,
  validateAuditNpmIdentity,
  validateCompilerNodeIdentity,
  validateNpmPackageBoundary,
} from './scripts/check-clean-checkout.js';

const executableBytes = Buffer.from('reviewed compiler node', 'utf8');
const executableSha256 = createHash('sha256')
  .update(executableBytes)
  .digest('hex');
const lock = Object.freeze({
  platform: 'win32-x64',
  nodeVersion: '24.14.0',
  nodeExecutableSha256: executableSha256,
});
const npmLock = Object.freeze({
  schema: 'e2s.clean-checkout-npm-lock.v1' as const,
  npmVersion: '11.16.0',
  npmCliRelativePath: 'node_modules/npm/bin/npm-cli.js',
  npmPackageSha256: 'ab'.repeat(32),
});

describe('clean-checkout dual-runtime boundary', () => {
  it('accepts only one exact identity shared by both compiler locks', () => {
    expect(validateCompilerNodeIdentity({
      locks: [lock, { ...lock }],
      platform: 'win32',
      arch: 'x64',
      observedVersion: 'v24.14.0',
      executableBytes,
    })).toEqual(lock);
  });

  it.each([
    ['missing lock', [lock], 'win32', 'x64', 'v24.14.0', executableBytes],
    ['platform drift', [lock, lock], 'linux', 'x64', 'v24.14.0', executableBytes],
    ['version drift', [lock, lock], 'win32', 'x64', 'v24.14.1', executableBytes],
    ['executable drift', [lock, lock], 'win32', 'x64', 'v24.14.0', Buffer.from('other')],
  ])('rejects %s', (_label, locks, platform, arch, observedVersion, bytes) => {
    expect(() => validateCompilerNodeIdentity({
      locks,
      platform,
      arch,
      observedVersion,
      executableBytes: bytes,
    })).toThrow(/clean-checkout compiler Node/);
  });

  it('rejects disagreement between the authenticated and federated locks', () => {
    expect(() => validateCompilerNodeIdentity({
      locks: [lock, { ...lock, nodeVersion: '24.14.1' }],
      platform: 'win32',
      arch: 'x64',
      observedVersion: 'v24.14.0',
      executableBytes,
    })).toThrow(/locks disagree/);
  });

  it('pins the parent Node directory once under the canonical PATH key', () => {
    const result = environmentWithNodeOnPath('/reviewed/node.exe', {
      Path: '/compiler',
      KEEP: 'yes',
      npm_execpath: '/untrusted/npm-cli.js',
      npm_node_execpath: '/untrusted/node',
    });
    expect(result).toEqual({
      KEEP: 'yes',
      PATH: `/reviewed${process.platform === 'win32' ? ';' : ':'}/compiler`,
    });
    expect(() => environmentWithNodeOnPath('/reviewed/node.exe', {
      Path: '/compiler',
      PATH: '/untrusted',
    })).toThrow(/ambiguous PATH/);
  });

  it('runs the compiler closure without npm recursion', () => {
    const plan = buildCompilerCheckPlan(
      '/compiler/node',
      '/workspace/relayer',
      '/workspace/bridge',
    );
    expect(plan.map(step => step.label)).toEqual([
      'architecture:check',
      'wasm:build',
      'build',
      'test:bounded',
    ]);
    expect(plan.filter(step => step.executable === '/compiler/node')).toHaveLength(3);
    expect(plan.find(step => step.label === 'wasm:build')).toEqual({
      label: 'wasm:build',
      executable: 'wasm-pack',
      args: ['build', '--target', 'nodejs'],
      cwd: path.resolve('/workspace/bridge', 'wasm-avl'),
    });
    expect(JSON.stringify(plan)).not.toMatch(/npm(?:-cli)?(?:\.js)?/i);
  });

  it('accepts a private npm package without local runtime state', () => {
    expect(validateNpmPackageBoundary(
      { name: 'ergo-sidechain-relayer', private: true },
      {
        files: [
          { path: 'package.json' },
          { path: 'src/index.ts' },
          { path: '.env.example' },
        ],
      },
    )).toEqual(['package.json', 'src/index.ts', '.env.example']);
  });

  it.each([
    ['non-private package', { private: false }, { files: [{ path: 'package.json' }] }],
    ['environment file', { private: true }, { files: [{ path: '.env.local' }] }],
    ['runtime database', { private: true }, { files: [{ path: 'state/bridge.sqlite-wal' }] }],
    ['runtime log', { private: true }, { files: [{ path: 'logs/operator.log.1' }] }],
    ['dependency tree', { private: true }, { files: [{ path: 'node_modules/pkg/index.js' }] }],
    ['unsafe path', { private: true }, { files: [{ path: '../outside.txt' }] }],
  ])('rejects %s in npm package inspection', (_label, packageMetadata, report) => {
    expect(() => validateNpmPackageBoundary(packageMetadata, report)).toThrow(
      /clean-checkout (?:relayer )?npm/,
    );
  });

  it('accepts only the canonical npm CLI inside the reviewed parent runtime', () => {
    expect(validateAuditNpmIdentity({
      lock: npmLock,
      configuredPath: '/audit/node_modules/npm/bin/npm-cli.js',
      canonicalPath: '/audit/node_modules/npm/bin/npm-cli.js',
      expectedPath: '/audit/node_modules/npm/bin/npm-cli.js',
      isRegularFile: true,
      isSymbolicLink: false,
      observedVersion: '11.16.0',
      packageSha256: npmLock.npmPackageSha256,
    })).toEqual(npmLock);
  });

  it.each([
    ['alias', '/alias/npm-cli.js', true, false, '11.16.0', npmLock.npmPackageSha256],
    ['non-file', '/audit/node_modules/npm/bin/npm-cli.js', false, false, '11.16.0', npmLock.npmPackageSha256],
    ['symlink', '/audit/node_modules/npm/bin/npm-cli.js', true, true, '11.16.0', npmLock.npmPackageSha256],
    ['version drift', '/audit/node_modules/npm/bin/npm-cli.js', true, false, '11.15.0', npmLock.npmPackageSha256],
    ['package drift', '/audit/node_modules/npm/bin/npm-cli.js', true, false, '11.16.0', 'cd'.repeat(32)],
  ])('rejects npm %s', (_label, canonicalPath, isRegularFile, isSymbolicLink, observedVersion, packageSha256) => {
    expect(() => validateAuditNpmIdentity({
      lock: npmLock,
      configuredPath: '/audit/node_modules/npm/bin/npm-cli.js',
      canonicalPath,
      expectedPath: '/audit/node_modules/npm/bin/npm-cli.js',
      isRegularFile,
      isSymbolicLink,
      observedVersion,
      packageSha256,
    })).toThrow(/clean-checkout npm/);
  });
});
