import { createHash } from 'node:crypto';
import { linkSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  parseV4DependencyInspectorOutput, parseV4LeveldbReceipt, parseV4MirrorReceipt,
  rootsOverlap, scanV4DirectDependencyTree, validateV4DependencyTrees, validateV4LeveldbTree,
  type V4DependencyExpected, type V4LeveldbExpected,
  type V4DependencyFile, type V4DependencyTree,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-dependencies.js';
import {
  assertV4FileOnlyRepositoriesTemplate, V4_FILE_ONLY_REPOSITORIES_TEMPLATE,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-lock.js';

const root = resolve('D:/v4-dependency-test-mirror');
const suffix = { '.jar': 1 };
function sha(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
function names(paths: readonly string[]): string {
  const hash = createHash('sha256');
  for (const path of paths) hash.update(path).update(Buffer.from([0]));
  return hash.digest('hex');
}
function frame(files: readonly V4DependencyFile[]): string {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.path).update(Buffer.from([0])).update(String(file.size))
      .update(Buffer.from([0])).update(file.sha256Hex).update('\n');
  }
  return hash.digest('hex');
}
const file = Object.freeze({ path: 'org/acme/a.jar', size: 1, sha256Hex: sha('x') });
const directories = ['org', 'org/acme'];
function makeReceipt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'r7-maven-file-repo-mirror-v1',
    sourceRoot: resolve('C:/public-coursier-cache'),
    mirrorRoot: root,
    directoryCount: directories.length, directorySha256: names(directories),
    fileCount: 1, fileMembershipSha256: names([file.path]),
    byteCount: '1', suffixCounts: suffix, aggregateSha256: frame([file]),
    files: [{ path: file.path, size: '1', sha256: file.sha256Hex }],
    sourceStableBeforeAfter: true, mirrorRecaptured: true,
    sourceOnlyPreparation: true, resolverOrCompilerExecuted: false,
    ...overrides,
  };
}
function expected(bytes: Buffer, overrides: Partial<V4DependencyExpected> = {}): V4DependencyExpected {
  return {
    receiptSha256Hex: sha(bytes), mirrorMetadataSha256Hex: sha('metadata'),
    mirrorAggregateSha256Hex: frame([file]), mirrorDirectoryCount: 2,
    mirrorFileCount: 1, mirrorBytes: 1, bootJarFrameSha256Hex: frame([
      { path: 'scala/a.jar', size: 1, sha256Hex: file.sha256Hex },
    ]), bootJarCount: 1, bootJarBytes: 1, bootDirectoryCount: 1,
    ...overrides,
  };
}
function compact(value: unknown): Buffer { return Buffer.from(JSON.stringify(value) + '\n'); }
function tree(
  folders: readonly string[], files: readonly V4DependencyFile[], metadata: string,
): V4DependencyTree {
  return {
    rootIdentity: 'root', directories: folders, files,
    bytes: files.reduce((sum, item) => sum + item.size, 0),
    directorySha256Hex: names(folders),
    fileMembershipSha256Hex: names(files.map(item => item.path)),
    metadataSha256Hex: metadata,
    membership: [...folders.map(path => 'D\t' + path + '\n'),
      ...files.map(item => 'F\t' + item.path + '\n')].sort().join(''),
    identities: new Map(),
  };
}
const leveldbDirectories = [
  'org', 'org/ethereum', 'org/ethereum/leveldbjni-all',
  'org/ethereum/leveldbjni-all/1.18.3',
];
const leveldbFiles: V4DependencyFile[] = [
  {
    path: 'org/ethereum/leveldbjni-all/1.18.3/leveldbjni-all-1.18.3.jar',
    size: 1, sha256Hex: sha('j'),
  },
  {
    path: 'org/ethereum/leveldbjni-all/1.18.3/leveldbjni-all-1.18.3.pom',
    size: 1, sha256Hex: sha('p'),
  },
];
function makeLeveldbReceipt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    aggregateSha256Hex: frame(leveldbFiles), buildExecuted: false, byteCount: 2,
    campaignAdmitted: false,
    coordinate: { artifactId: 'leveldbjni-all', groupId: 'org.ethereum', version: '1.18.3' },
    directoryCount: 4, externalAcceptanceEstablished: false, fileCount: 2,
    files: leveldbFiles.map(item => ({
      bytes: item.size, md5Hex: '0'.repeat(32), path: item.path,
      sha1Hex: '0'.repeat(40), sha256Hex: item.sha256Hex,
    })),
    providedDependencyResolutionEstablished: false, resolverExecuted: false,
    schema: 'v4-gitlab-leveldb-artifact-overlay-v1',
    sourceCacheChecksumSidecarsMatched: true,
    sourceRepositoryUrl: 'https://gitlab.com/api/v4/projects/61211221/packages/maven',
    sourceStableBeforeAfter: true, targetDirectSingleLinkRecaptured: true,
    ...overrides,
  };
}
function expectedLeveldb(bytes: Buffer, overrides: Partial<V4LeveldbExpected> = {}): V4LeveldbExpected {
  return {
    receiptSha256Hex: sha(bytes), aggregateSha256Hex: frame(leveldbFiles),
    directoryCount: 4, fileCount: 2, bytes: 2,
    coordinate: 'org.ethereum:leveldbjni-all:1.18.3', ...overrides,
  };
}

describe('V4 owned Maven and boot dependency capture boundaries', () => {
  it('detects drive-root ancestry without conflating component siblings', () => {
    expect(rootsOverlap('D:\\', 'D:\\foo')).toBe(true);
    expect(rootsOverlap('D:\\foo', 'D:\\')).toBe(true);
    expect(rootsOverlap('D:\\foo', 'D:\\foo\\bar')).toBe(true);
    expect(rootsOverlap('D:\\foo', 'D:\\foobar')).toBe(false);
  });

  it('requires the exact three-repository local template and order', () => {
    expect(() => assertV4FileOnlyRepositoriesTemplate(V4_FILE_ONLY_REPOSITORIES_TEMPLATE))
      .not.toThrow();
    for (const changed of [
      V4_FILE_ONLY_REPOSITORIES_TEMPLATE.replace('{{GITLAB_LEVELDB_FILE_URI}}',
        'https://gitlab.com/api/v4/projects/61211221/packages/maven'),
      V4_FILE_ONLY_REPOSITORIES_TEMPLATE.replace(
        '  bridge-maven-central-cache: {{MAVEN_CENTRAL_CACHE_URI}}\n'
        + '  bridge-gitlab-leveldb-local: {{GITLAB_LEVELDB_FILE_URI}}\n',
        '  bridge-gitlab-leveldb-local: {{GITLAB_LEVELDB_FILE_URI}}\n'
        + '  bridge-maven-central-cache: {{MAVEN_CENTRAL_CACHE_URI}}\n'),
      V4_FILE_ONLY_REPOSITORIES_TEMPLATE.replace(', bootOnly', ''),
    ]) {
      expect(() => assertV4FileOnlyRepositoriesTemplate(changed))
        .toThrow(/template or order/u);
    }
  });

  it('accepts only the pinned compact LevelDB receipt and its false claims', () => {
    const bytes = compact(makeLeveldbReceipt());
    const expected = expectedLeveldb(bytes);
    const parsed = parseV4LeveldbReceipt(bytes, expected);
    expect(parsed.files).toEqual(leveldbFiles);
    const duplicate = Buffer.from(bytes.toString().replace(
      '"schema":', '"schema":"v4-gitlab-leveldb-artifact-overlay-v1","schema":',
    ));
    expect(() => parseV4LeveldbReceipt(duplicate, expectedLeveldb(duplicate)))
      .toThrow(/duplicate/u);
    for (const change of [
      { buildExecuted: true }, { resolverExecuted: true },
      { campaignAdmitted: true }, { providedDependencyResolutionEstablished: true },
      { externalAcceptanceEstablished: true },
      { sourceCacheChecksumSidecarsMatched: false }, { sourceStableBeforeAfter: false },
      { targetDirectSingleLinkRecaptured: false }, { unexpected: true },
      { aggregateSha256Hex: sha('forged') }, { directoryCount: 3 }, { fileCount: 1 },
      { sourceRepositoryUrl: 'https://example.org/maven' },
      { coordinate: { artifactId: 'leveldbjni-all', groupId: 'org.ethereum', version: 'other' } },
    ]) {
      const altered = compact(makeLeveldbReceipt(change));
      expect(() => parseV4LeveldbReceipt(altered, expectedLeveldb(altered))).toThrow();
    }
    expect(() => parseV4LeveldbReceipt(bytes, {
      ...expected, receiptSha256Hex: sha('other'),
    })).toThrow(/receipt pin/u);
  });

  it('binds exactly four LevelDB directories and the POM and JAR bytes', () => {
    const bytes = compact(makeLeveldbReceipt());
    const expected = expectedLeveldb(bytes);
    const receipt = parseV4LeveldbReceipt(bytes, expected);
    const good = tree(leveldbDirectories, leveldbFiles, sha('leveldb metadata'));
    expect(validateV4LeveldbTree(good, receipt, expected)).toBe(expected.aggregateSha256Hex);
    expect(() => validateV4LeveldbTree(
      tree(leveldbDirectories, leveldbFiles.slice(0, 1), sha('metadata')),
      receipt, expected,
    )).toThrow(/physical closure/u);
    expect(() => validateV4LeveldbTree(
      tree([...leveldbDirectories, 'unrelated'], leveldbFiles, sha('metadata')),
      receipt, expected,
    )).toThrow(/physical closure/u);
    for (const index of [0, 1]) {
      const changed = leveldbFiles.map((item, at) => at === index
        ? { ...item, sha256Hex: sha('wrong ' + index) } : item);
      expect(() => validateV4LeveldbTree(
        tree(leveldbDirectories, changed, sha('metadata')), receipt, expected,
      )).toThrow(/POM or JAR/u);
    }
  });

  it('accepts only the pinned compact receipt and rejects duplicate keys', () => {
    const bytes = compact(makeReceipt());
    const pin = expected(bytes);
    const parsed = parseV4MirrorReceipt(bytes, root, pin, suffix);
    expect(parsed.files).toEqual([file]);
    const duplicate = Buffer.from(bytes.toString().replace(
      '"schema":', '"schema":"r7-maven-file-repo-mirror-v1","schema":',
    ));
    expect(() => parseV4MirrorReceipt(duplicate, root, expected(duplicate), suffix))
      .toThrow(/duplicate/u);
    const extra = compact(makeReceipt({ unexpected: true }));
    expect(() => parseV4MirrorReceipt(extra, root, expected(extra), suffix))
      .toThrow(/field set/u);
    expect(() => parseV4MirrorReceipt(bytes, root, expected(bytes, {
      receiptSha256Hex: sha('other'),
    }), suffix)).toThrow(/pin differs/u);
  });

  it('rejects false claims, changed aggregate, unsafe paths and case collisions', () => {
    for (const change of [
      { resolverOrCompilerExecuted: true }, { mirrorRecaptured: false },
      { aggregateSha256: sha('forged') },
      { files: [{ path: '../a.jar', size: '1', sha256: file.sha256Hex }] },
    ]) {
      const bytes = compact(makeReceipt(change));
      expect(() => parseV4MirrorReceipt(bytes, root, expected(bytes), suffix)).toThrow();
    }
    const repeated = [
      { path: 'org/acme/a.jar', size: '1', sha256: file.sha256Hex },
      { path: 'org/acme/A.jar', size: '1', sha256: file.sha256Hex },
    ];
    const duplicate = compact(makeReceipt({
      fileCount: 2, byteCount: '2', suffixCounts: { '.jar': 2 },
      files: repeated,
    }));
    expect(() => parseV4MirrorReceipt(duplicate, root, expected(duplicate, {
      mirrorFileCount: 2, mirrorBytes: 2,
    }), { '.jar': 2 })).toThrow(/path, order or digest/u);
  });

  it('binds physical mirror members to receipt and boot JARs to unique mirror content', () => {
    const bytes = compact(makeReceipt());
    const pin = expected(bytes);
    const receipt = parseV4MirrorReceipt(bytes, root, pin, suffix);
    const mirror = tree(directories, [file], pin.mirrorMetadataSha256Hex);
    const bootFile = { path: 'scala/a.jar', size: 1, sha256Hex: file.sha256Hex };
    const boot = tree(['scala'], [bootFile], sha('boot'));
    expect(validateV4DependencyTrees(mirror, boot, receipt, pin))
      .toBe(pin.bootJarFrameSha256Hex);
    expect(() => validateV4DependencyTrees(
      tree(directories, [{ ...file, sha256Hex: sha('forged') }],
        pin.mirrorMetadataSha256Hex), boot, receipt, pin,
    )).toThrow(/file content/u);
    expect(() => validateV4DependencyTrees(
      mirror, tree(['scala'], [{ ...bootFile, sha256Hex: sha('other') }], sha('boot')),
      receipt, pin,
    )).toThrow(/unique pinned mirror match/u);
    expect(() => validateV4DependencyTrees(
      mirror, tree(['scala'], [bootFile, { ...bootFile, path: 'scala/extra.jar' }], sha('boot')),
      receipt, pin,
    )).toThrow(/extra, absent/u);
  });

  it('accepts two pinned boot paths for one unique mirror JAR without losing the boot frame', () => {
    const bytes = compact(makeReceipt());
    const bootFiles: V4DependencyFile[] = [
      { path: 'scala/a.jar', size: 1, sha256Hex: file.sha256Hex },
      { path: 'scala/sbt/a-1.jar', size: 1, sha256Hex: file.sha256Hex },
    ];
    const bootDirectories = ['scala', 'scala/sbt'];
    const pin = expected(bytes, {
      bootJarFrameSha256Hex: frame(bootFiles), bootJarCount: 2,
      bootJarBytes: 2, bootDirectoryCount: 2,
    });
    const receipt = parseV4MirrorReceipt(bytes, root, pin, suffix);
    const mirror = tree(directories, [file], pin.mirrorMetadataSha256Hex);
    const boot = tree(bootDirectories, bootFiles, sha('boot'));
    expect(validateV4DependencyTrees(mirror, boot, receipt, pin))
      .toBe(pin.bootJarFrameSha256Hex);

    expect(() => validateV4DependencyTrees(mirror, tree(bootDirectories, [
      bootFiles[0]!, { ...bootFiles[1]!, path: 'scala/sbt/other.jar' },
    ], sha('boot')), receipt, pin)).toThrow(/boot JAR frame differs/u);
    expect(() => validateV4DependencyTrees(mirror, tree(bootDirectories, [
      bootFiles[0]!, { ...bootFiles[1]!, sha256Hex: sha('missing') },
    ], sha('boot')), receipt, pin)).toThrow(/unique pinned mirror match/u);

    const duplicateMirrorFiles: V4DependencyFile[] = [
      file, { ...file, path: 'org/acme/b.jar' },
    ];
    const duplicateBytes = compact(makeReceipt({
      fileCount: 2, byteCount: '2', suffixCounts: { '.jar': 2 },
      fileMembershipSha256: names(duplicateMirrorFiles.map(item => item.path)),
      aggregateSha256: frame(duplicateMirrorFiles),
      files: duplicateMirrorFiles.map(item => ({
        path: item.path, size: String(item.size), sha256: item.sha256Hex,
      })),
    }));
    const duplicatePin = expected(duplicateBytes, {
      mirrorAggregateSha256Hex: frame(duplicateMirrorFiles),
      mirrorFileCount: 2, mirrorBytes: 2,
      bootJarFrameSha256Hex: pin.bootJarFrameSha256Hex,
      bootJarCount: 2, bootJarBytes: 2, bootDirectoryCount: 2,
    });
    const duplicateReceipt = parseV4MirrorReceipt(
      duplicateBytes, root, duplicatePin, { '.jar': 2 },
    );
    expect(() => validateV4DependencyTrees(
      tree(directories, duplicateMirrorFiles, duplicatePin.mirrorMetadataSha256Hex),
      boot, duplicateReceipt, duplicatePin,
    )).toThrow(/unique pinned mirror match/u);
  });

  it('requires a canonical independent membership with existing parents', () => {
    const valid = 'D\torg\nF\torg/a.jar\n';
    expect(parseV4DependencyInspectorOutput(Buffer.from(valid).toString('base64'), 2, 100))
      .toBe(valid);
    for (const malformed of [
      'F\torg/a.jar\n',
      'D\torg\nF\torg/A.jar\nF\torg/a.jar\n',
      'F\torg/a.jar\nD\torg\n',
      'D\torg\r\n',
    ]) {
      expect(() => parseV4DependencyInspectorOutput(
        Buffer.from(malformed).toString('base64'), 3, 100,
      )).toThrow();
    }
    expect(() => parseV4DependencyInspectorOutput('YQ=', 3, 100)).toThrow();
    expect(() => parseV4DependencyInspectorOutput(Buffer.from(valid).toString('base64'), 1, 100))
      .toThrow(/count/u);
  });

  const fixtureParent = process.env.V4_DEPENDENCY_FIXTURE_PARENT;
  it.runIf(process.platform === 'win32' && Boolean(fixtureParent))(
    'checks direct physical trees, changed bytes, extras, links and caps on D', () => {
      const selectedParent = resolve(fixtureParent!);
      if (!/^D:\\/iu.test(selectedParent)) throw new Error('physical fixture parent must be on D');
      const fixtureRoot = mkdtempSync(join(selectedParent, 'v4-dependency-fixture-'));
      process.stdout.write('V4 dependency fixture preserved at ' + fixtureRoot + '\n');
      const createMirror = (name: string, contents: string): string => {
        const mirrorRoot = join(fixtureRoot, name);
        mkdirSync(mirrorRoot);
        mkdirSync(join(mirrorRoot, 'org'));
        mkdirSync(join(mirrorRoot, 'org', 'acme'));
        writeFileSync(join(mirrorRoot, 'org', 'acme', 'a.jar'), contents, { flag: 'wx' });
        return mirrorRoot;
      };
      const mirrorRoot = createMirror('mirror', 'x');
      const bootRoot = join(fixtureRoot, 'boot');
      mkdirSync(bootRoot);
      mkdirSync(join(bootRoot, 'scala'));
      writeFileSync(join(bootRoot, 'scala', 'a.jar'), 'x', { flag: 'wx' });
      const mirror = scanV4DirectDependencyTree(mirrorRoot, 8, 16, 1024);
      const boot = scanV4DirectDependencyTree(bootRoot, 8, 16, 1024);
      expect(mirror.files).toEqual([file]);
      const bytes = compact(makeReceipt({ mirrorRoot }));
      const pin = expected(bytes, { mirrorMetadataSha256Hex: mirror.metadataSha256Hex });
      const receipt = parseV4MirrorReceipt(bytes, mirrorRoot, pin, suffix);
      expect(validateV4DependencyTrees(mirror, boot, receipt, pin))
        .toBe(pin.bootJarFrameSha256Hex);

      const overlayRoot = join(fixtureRoot, 'leveldb-overlay');
      mkdirSync(overlayRoot);
      for (const directory of leveldbDirectories) {
        mkdirSync(join(overlayRoot, ...directory.split('/')), { recursive: true });
      }
      for (const [index, item] of leveldbFiles.entries()) {
        writeFileSync(join(overlayRoot, ...item.path.split('/')),
          index === 0 ? 'j' : 'p', { flag: 'wx' });
      }
      const overlay = scanV4DirectDependencyTree(overlayRoot, 6, 2, 1024);
      const overlayBytes = compact(makeLeveldbReceipt());
      const overlayExpected = expectedLeveldb(overlayBytes);
      const overlayReceipt = parseV4LeveldbReceipt(overlayBytes, overlayExpected);
      expect(validateV4LeveldbTree(overlay, overlayReceipt, overlayExpected))
        .toBe(overlayExpected.aggregateSha256Hex);
      expect(() => scanV4DirectDependencyTree(
        join(fixtureRoot, 'absent-leveldb-overlay'), 6, 2, 1024,
      )).toThrow();
      symlinkSync(overlayRoot, join(fixtureRoot, 'linked-leveldb-overlay'), 'junction');
      expect(() => scanV4DirectDependencyTree(
        join(fixtureRoot, 'linked-leveldb-overlay'), 6, 2, 1024,
      )).toThrow(/indirect/u);
      writeFileSync(join(overlayRoot, 'extra'), 'z', { flag: 'wx' });
      const extraOverlay = scanV4DirectDependencyTree(overlayRoot, 7, 3, 1024);
      expect(() => validateV4LeveldbTree(extraOverlay, overlayReceipt, overlayExpected))
        .toThrow(/physical closure/u);
      linkSync(join(overlayRoot, ...leveldbFiles[0]!.path.split('/')),
        join(overlayRoot, 'hardlinked.jar'));
      expect(() => scanV4DirectDependencyTree(overlayRoot, 8, 4, 1024))
        .toThrow(/indirect or too large/u);

      const extraRoot = createMirror('extra-mirror', 'x');
      mkdirSync(join(extraRoot, 'empty'));
      const extra = scanV4DirectDependencyTree(extraRoot, 8, 16, 1024);
      expect(() => validateV4DependencyTrees(extra, boot, receipt, pin))
        .toThrow(/mirror physical closure/u);

      const altered = scanV4DirectDependencyTree(createMirror('altered-mirror', 'y'), 8, 16, 1024);
      expect(() => validateV4DependencyTrees(altered, boot, receipt, {
        ...pin, mirrorMetadataSha256Hex: altered.metadataSha256Hex,
      })).toThrow(/file content/u);

      const hardlinkRoot = join(fixtureRoot, 'hardlink');
      mkdirSync(hardlinkRoot);
      const original = join(hardlinkRoot, 'a.jar');
      writeFileSync(original, 'x', { flag: 'wx' });
      linkSync(original, join(hardlinkRoot, 'b.jar'));
      expect(() => scanV4DirectDependencyTree(hardlinkRoot, 8, 16, 1024))
        .toThrow(/indirect or too large/u);
      const junctionRoot = join(fixtureRoot, 'junction-tree');
      mkdirSync(junctionRoot);
      symlinkSync(mirrorRoot, join(junctionRoot, 'linked-mirror'), 'junction');
      expect(() => scanV4DirectDependencyTree(junctionRoot, 8, 16, 1024))
        .toThrow(/unsupported dependency entry/u);
      expect(() => scanV4DirectDependencyTree(mirrorRoot, 2, 16, 1024))
        .toThrow(/entry cap|count or byte cap/u);
      const oversized = createMirror('oversized-mirror', 'xy');
      expect(() => scanV4DirectDependencyTree(oversized, 8, 1, 1024))
        .toThrow(/indirect or too large/u);
      expect(() => scanV4DirectDependencyTree(mirrorRoot, 8, 16, 8))
        .toThrow(/membership byte cap/u);
    },
  );
});
