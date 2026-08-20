import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, parse, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  canonicalPathIdentity,
  isPathInside,
} from './create-only-out-of-repository-artifact.js';
import {
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BUILD_ARCHIVE_V1_MAGIC,
  buildSubstrateFederatedIsolatedDevnetGitEnvironmentV1,
  decodeSubstrateFederatedIsolatedDevnetGitBlobBatchV1,
  decodeSubstrateFederatedIsolatedDevnetBuildArchiveV1,
  encodeSubstrateFederatedIsolatedDevnetBuildArchiveV1,
  produceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1,
} from './substrate-federated-isolated-devnet-relayer-artifacts-v1.js';
import { parseSubstrateFederatedIsolatedDevnetRelayerArtifactsArgsV1 } from './scripts/build-substrate-federated-isolated-devnet-relayer-artifacts-v1.js';

const EXPECTED_HEAD = 'ab'.repeat(20);

function gitBlobIdentity(bytes: Buffer): string {
  return createHash('sha1')
    .update(Buffer.from(`blob ${bytes.byteLength}\0`, 'ascii'))
    .update(bytes)
    .digest('hex');
}

function gitBlobBatchEntry(objectSha1Hex: string, bytes: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`${objectSha1Hex} blob ${bytes.byteLength}\n`, 'ascii'),
    bytes,
    Buffer.from('\n', 'ascii'),
  ]);
}

describe('Substrate federated isolated-devnet relayer artifacts V1', () => {
  it('encodes a deterministic, sorted and round-trippable runtime archive', () => {
    const entries = [
      Object.freeze({
        path: 'relayer/dist/z.js',
        bytes: Uint8Array.from([0x03, 0x04]),
      }),
      Object.freeze({
        path: 'relayer/dist/a.js',
        bytes: Buffer.from([0x01, 0x02]),
      }),
    ];

    const first = encodeSubstrateFederatedIsolatedDevnetBuildArchiveV1(entries);
    const second = encodeSubstrateFederatedIsolatedDevnetBuildArchiveV1(
      [...entries].reverse(),
    );
    expect(first).toEqual(second);
    expect(first.subarray(0, 8).toString('ascii')).toBe(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_BUILD_ARCHIVE_V1_MAGIC,
    );

    const decoded = decodeSubstrateFederatedIsolatedDevnetBuildArchiveV1(first);
    expect(decoded.map(entry => entry.path)).toEqual([
      'relayer/dist/a.js',
      'relayer/dist/z.js',
    ]);
    expect(decoded.map(entry => Buffer.from(entry.bytes).toString('hex'))).toEqual([
      '0102',
      '0304',
    ]);
    expect(encodeSubstrateFederatedIsolatedDevnetBuildArchiveV1(decoded)).toEqual(first);
  });

  it('rejects isolated magic, version, digest, ordering and trailing-byte mutations', () => {
    const archive = encodeSubstrateFederatedIsolatedDevnetBuildArchiveV1([
      { path: 'relayer/dist/a.js', bytes: Buffer.from([0x01]) },
      { path: 'relayer/dist/z.js', bytes: Buffer.from([0x02]) },
    ]);

    const badMagic = Buffer.from(archive);
    badMagic[0] ^= 0x01;
    expect(() => decodeSubstrateFederatedIsolatedDevnetBuildArchiveV1(badMagic))
      .toThrow(/magic/);

    const badVersion = Buffer.from(archive);
    badVersion.writeUInt32BE(2, 8);
    expect(() => decodeSubstrateFederatedIsolatedDevnetBuildArchiveV1(badVersion))
      .toThrow(/version/);

    const badDigest = Buffer.from(archive);
    badDigest[28] ^= 0x01;
    expect(() => decodeSubstrateFederatedIsolatedDevnetBuildArchiveV1(badDigest))
      .toThrow(/digest/);

    const badOrder = Buffer.from(archive);
    const firstPathLength = badOrder.readUInt32BE(16);
    const firstPathStart = 60;
    const firstPath = badOrder.subarray(
      firstPathStart,
      firstPathStart + firstPathLength,
    ).toString('utf8');
    const leafOffset = firstPath.indexOf('a.js');
    expect(leafOffset).toBeGreaterThan(0);
    badOrder[firstPathStart + leafOffset] = 'z'.charCodeAt(0);
    expect(() => decodeSubstrateFederatedIsolatedDevnetBuildArchiveV1(badOrder))
      .toThrow(/ordering/);

    expect(() => decodeSubstrateFederatedIsolatedDevnetBuildArchiveV1(
      Buffer.concat([archive, Buffer.from([0x00])]),
    )).toThrow(/trailing/);
  });

  it('rejects duplicate, traversal, absolute and non-byte archive entries', () => {
    expect(() => encodeSubstrateFederatedIsolatedDevnetBuildArchiveV1([
      { path: 'relayer/a.js', bytes: Buffer.from([0x01]) },
      { path: 'relayer/a.js', bytes: Buffer.from([0x02]) },
    ])).toThrow(/unique/);

    for (const path of [
      '../relayer.js',
      '/relayer.js',
      'C:/relayer.js',
      'relayer\\entry.js',
      'relayer//entry.js',
      'relayer/./entry.js',
    ]) {
      expect(() => encodeSubstrateFederatedIsolatedDevnetBuildArchiveV1([
        { path, bytes: Buffer.from([0x01]) },
      ]), path).toThrow(/path/);
    }

    expect(() => encodeSubstrateFederatedIsolatedDevnetBuildArchiveV1([
      { path: 'relayer/entry.js', bytes: 'not-bytes' as unknown as Uint8Array },
    ])).toThrow(/Uint8Array/);
  });

  it('binds every Git batch blob to its immutable object and exact framing', () => {
    const content = Buffer.from('immutable source bytes\n', 'utf8');
    const objectSha1Hex = gitBlobIdentity(content);
    const expected = [Object.freeze({
      path: 'relayer/src/example.ts',
      objectSha1Hex,
      executable: false,
    })];
    const batch = gitBlobBatchEntry(objectSha1Hex, content);

    expect(decodeSubstrateFederatedIsolatedDevnetGitBlobBatchV1(
      batch,
      expected,
    )).toEqual([content]);

    const wrongIdentity = Buffer.from(batch);
    wrongIdentity[0] = wrongIdentity[0] === 0x30 ? 0x31 : 0x30;
    expect(() => decodeSubstrateFederatedIsolatedDevnetGitBlobBatchV1(
      wrongIdentity,
      expected,
    )).toThrow(/identity/);

    const wrongContent = Buffer.from(batch);
    const contentOffset = batch.indexOf(content);
    wrongContent[contentOffset] ^= 0x01;
    expect(() => decodeSubstrateFederatedIsolatedDevnetGitBlobBatchV1(
      wrongContent,
      expected,
    )).toThrow(/content differs/);

    expect(() => decodeSubstrateFederatedIsolatedDevnetGitBlobBatchV1(
      batch.subarray(0, batch.byteLength - 1),
      expected,
    )).toThrow(/content is truncated/);

    expect(() => decodeSubstrateFederatedIsolatedDevnetGitBlobBatchV1(
      Buffer.concat([batch, Buffer.from([0x00])]),
      expected,
    )).toThrow(/trailing bytes/);
  });

  it('requires exactly one explicit value for each CLI input', () => {
    const destinationDirectory = resolve('bounded-relayer-artifacts');
    const wasmPackExecutable = resolve('tools', 'wasm-pack');
    const bridgeRoot = resolve('bridge-root');
    const gitExecutable = resolve('tools', 'git');
    const args = [
      '--out', destinationDirectory,
      '--wasm-pack', wasmPackExecutable,
      '--bridge-root', bridgeRoot,
      '--expected-head', EXPECTED_HEAD,
      '--git', gitExecutable,
    ];
    expect(parseSubstrateFederatedIsolatedDevnetRelayerArtifactsArgsV1(args))
      .toEqual({
        bridgeRoot,
        gitExecutable,
        wasmPackExecutable,
        expectedHeadCommitSha1Hex: EXPECTED_HEAD,
        destinationDirectory,
      });

    expect(() => parseSubstrateFederatedIsolatedDevnetRelayerArtifactsArgsV1([]))
      .toThrow(/all five/);
    expect(() => parseSubstrateFederatedIsolatedDevnetRelayerArtifactsArgsV1([
      ...args.slice(0, -2), '--unknown', 'value',
    ])).toThrow(/unsupported/);
    expect(() => parseSubstrateFederatedIsolatedDevnetRelayerArtifactsArgsV1([
      ...args.slice(0, -2), '--out', 'duplicate',
    ])).toThrow(/repeat/);
    expect(() => parseSubstrateFederatedIsolatedDevnetRelayerArtifactsArgsV1([
      ...args.slice(0, -1), '--missing-value',
    ])).toThrow();
  });

  it('forces mutable Git replacement-object processing off', () => {
    const previous = process.env.GIT_NO_REPLACE_OBJECTS;
    try {
      process.env.GIT_NO_REPLACE_OBJECTS = '0';
      expect(buildSubstrateFederatedIsolatedDevnetGitEnvironmentV1())
        .toMatchObject({ GIT_NO_REPLACE_OBJECTS: '1' });
    } finally {
      if (previous === undefined) delete process.env.GIT_NO_REPLACE_OBJECTS;
      else process.env.GIT_NO_REPLACE_OBJECTS = previous;
    }
  });

  it('recognizes a direct child of a filesystem root without admitting siblings', () => {
    const volumeRoot = parse(resolve('.')).root;
    const directChild = join(volumeRoot, 'owned-child');
    expect(isPathInside(volumeRoot, directChild)).toBe(true);
    expect(canonicalPathIdentity(dirname(directChild)))
      .toBe(canonicalPathIdentity(volumeRoot));
    expect(isPathInside(
      join(volumeRoot, 'owned'),
      join(volumeRoot, 'owned-sibling'),
    )).toBe(false);
  });

  it('rejects sensitive explicit paths before invoking any external tool', async () => {
    const root = resolve('bounded-relayer-artifact-test');
    const production = produceSubstrateFederatedIsolatedDevnetRelayerArtifactsV1({
      bridgeRoot: join(root, 'bridge'),
      gitExecutable: join(root, 'private-keys', 'git.exe'),
      wasmPackExecutable: join(root, 'tools', 'wasm-pack.exe'),
      expectedHeadCommitSha1Hex: EXPECTED_HEAD,
      destinationDirectory: join(root, 'out'),
    });
    await expect(production).rejects.toThrow(
      process.platform === 'win32' ? /non-sensitive/ : /Windows/,
    );
  });

  it('keeps the producer config-explicit and outside network, signing and persistence adapters', () => {
    const moduleSource = readFileSync(new URL(
      './substrate-federated-isolated-devnet-relayer-artifacts-v1.ts',
      import.meta.url,
    ), 'utf8');
    const cliSource = readFileSync(new URL(
      './scripts/build-substrate-federated-isolated-devnet-relayer-artifacts-v1.ts',
      import.meta.url,
    ), 'utf8');
    const moduleImports = [...moduleSource.matchAll(/from\s+['"]([^'"]+)['"]/gu)]
      .map(match => match[1]);
    const cliImports = [...cliSource.matchAll(/from\s+['"]([^'"]+)['"]/gu)]
      .map(match => match[1]);

    expect(moduleImports).toEqual([
      'node:child_process',
      'node:crypto',
      'node:fs',
      'node:path',
      'esbuild',
      './create-only-out-of-repository-artifact.js',
      './strict-json.js',
    ]);
    expect(cliImports).toEqual([
      'node:path',
      'node:url',
      '../strict-json.js',
      '../substrate-federated-isolated-devnet-relayer-artifacts-v1.js',
    ]);
    for (const source of [moduleSource, cliSource]) {
      expect(source).not.toMatch(/node:http|node:https|axios|\bfetch\s*\(|dotenv/);
    }
    expect([...moduleImports, ...cliImports].join('\n')).not.toMatch(
      /ergo-client|sidechain-client|state-tracker|database|signer|submitter|broadcaster|profile-registry/,
    );
    expect(cliSource).not.toMatch(/process\.env/);
    expect(moduleSource).toContain("CARGO_NET_OFFLINE: 'true'");
    expect(moduleSource).toContain("'--', '--locked', '--offline'");
    expect(moduleSource).toContain('CARGO_ENCODED_RUSTFLAGS: encodedRustFlags');
    expect(moduleSource).toContain("rustSourcePathRemapping: 'local-prefix-redaction-v1'");
    expect(moduleSource).not.toContain("RUSTFLAGS: ''");
    expect(moduleSource).toContain("process.versions.node.split('.')[0]");
    expect(moduleSource).toContain("process.platform !== 'win32'");
    expect(moduleSource).toContain("'cat-file', '--batch'");
    expect(moduleSource).toContain("GIT_NO_REPLACE_OBJECTS: '1'");
    expect(moduleSource).not.toContain('checkout-index');
    expect(moduleSource).toContain("SCRATCH_DIRECTORY_PREFIX = '.e2s-rba-build-'");
    expect(moduleSource).not.toContain(
      '`.${basename(target.finalDirectory)}.build-${randomUUID()}`',
    );
    expect(moduleSource).toContain('constants.O_NOFOLLOW');
    expect(moduleSource).toContain('buildToolchainAuthenticated: false');
    expect(moduleSource).toContain('fixedLocalVolumesAuthenticated: false');
    expect(moduleSource).toContain('crossPlatformNoReplaceEstablished: false');
    expect(moduleSource).toContain("filter: /bridge_avl[.]js$/");
    expect(moduleSource).not.toContain("filter: /bridge_avl[.]js$/u");
    expect(moduleSource).toContain("outbase: 'src'");
    expect(moduleSource).toContain("entryNames: '[dir]/[name]'");
    expect(cliSource).toContain(
      "process.stderr.write('isolated relayer artifact production failed\\n')",
    );
  });
});
