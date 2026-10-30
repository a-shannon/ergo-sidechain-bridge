import { describe, expect, it } from 'vitest';
import { lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, parse, sep } from 'node:path';

import {
  assertSelectedV4BuildSbtOverlay,
  parseV4GitSnapshot,
  prepareV4GitHome,
  type V4GitSnapshotBytes,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-checkout.js';

const HEAD = '2cdbb8cf09d7ccbc060e1022e3c15bcf6a9991b1';
const TREE = '9f8d571534b21eec660ff21177adf725e50ddf02';
const BUILD_BASE = '2fb3ba62fb92ff45e45a3639c2dace53f31ed86d';
const modified = ['src/a.scala', 'src/b.scala', 'src/c.scala', 'src/d.scala', 'src/e.scala'];
const added = ['src/f.scala', 'src/g.scala', 'src/h.scala'];
const declared = [
  ...modified.map((path, index) => ({ path, status: 'modified' as const,
    baseBlob: String(index + 1).repeat(40), patchedBlob: 'a'.repeat(40) })),
  ...added.map(path => ({ path, status: 'added' as const, patchedBlob: 'b'.repeat(40) })),
  { path: 'build.sbt', status: 'modified' as const, baseBlob: BUILD_BASE,
    patchedBlob: '7e35f6295070996d5ae0f6fc22f10737e26ee4cd' },
];

function z(records: readonly string[]): Buffer {
  return Buffer.from(records.length === 0 ? '' : records.join('\0') + '\0', 'utf8');
}
function fixture(): V4GitSnapshotBytes {
  const tree = [
    '100644 blob ' + BUILD_BASE + '\tbuild.sbt',
    ...modified.map((path, index) => '100644 blob ' + String(index + 1).repeat(40) + '\t' + path),
    '160000 commit ' + '9'.repeat(40) + '\topaque-submodule',
  ];
  const index = [
    '100644 ' + BUILD_BASE + ' 0\tbuild.sbt',
    ...modified.map((path, index) => '100644 ' + String(index + 1).repeat(40) + ' 0\t' + path),
    '160000 ' + '9'.repeat(40) + ' 0\topaque-submodule',
  ];
  const flags = ['build.sbt', ...modified, 'opaque-submodule'].map(path => 'H ' + path);
  const status = [...modified, 'build.sbt'].map(path => ' M ' + path)
    .concat(added.map(path => '?? ' + path));
  return {
    head: Buffer.from(HEAD + '\n'), tree: Buffer.from(TREE + '\n'),
    fullTree: z(tree), buildSbtTreeEntry: z([tree[0]]), index: z(index),
    indexFlags: z(flags), status: z(status),
  };
}

const HOME_TEST_PARENT = parse('D:/').root;
function hasRequiredDVolume(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    const stat = lstatSync(HOME_TEST_PARENT);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('V4 D volume root is indirect');
    }
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENODEV') return false;
    throw error;
  }
}
function withGitHomeFixture(run: (paths: { source: string; home: string; root: string }) => void): void {
  const root = mkdtempSync(join(HOME_TEST_PARENT, 'v4-git-home-test-'));
  try {
    const source = join(root, 'owned', 'ergo-raw');
    const home = join(root, 'git-home');
    mkdirSync(source, { recursive: true });
    mkdirSync(home);
    run({ source, home, root });
  } finally {
    if (!root.startsWith(join(HOME_TEST_PARENT, 'v4-git-home-test-')) || root === HOME_TEST_PARENT + sep) {
      throw new Error('unsafe V4 Git HOME test fixture path');
    }
    rmSync(root, { recursive: true });
  }
}

function createKnownHomeCache(home: string): void {
  const appData = join(home, 'AppData');
  mkdirSync(join(appData, 'Roaming'), { recursive: true });
  const powershell = join(appData, 'Local', 'Microsoft', 'Windows', 'PowerShell');
  mkdirSync(powershell, { recursive: true });
  writeFileSync(join(powershell, 'StartupProfileData-NonInteractive'), Buffer.alloc(2080, 65));
}

describe('V4 bounded raw Git checkout projection', () => {
  it('requires an explicit current V6 selection for the reviewed 20,585-byte overlay', () => {
    const currentOverlay = {
      path: 'build.sbt' as const,
      status: 'modified' as const,
      baseBlob: BUILD_BASE,
      patchedBlob: '23f9dbe303639b4e42cb85b9c4ef220b0a8aff78',
      bytes: 20585,
      sha256Hex: 'a0e138c7f4379b1c42e004d4e776a81e24f4b7757d09ceeb7488bc3951a4db03',
    };
    expect(() => assertSelectedV4BuildSbtOverlay(currentOverlay, 'v6-current'))
      .not.toThrow();
    expect(() => assertSelectedV4BuildSbtOverlay(currentOverlay))
      .toThrow(/overlay differs/u);
    expect(() => assertSelectedV4BuildSbtOverlay({
      ...currentOverlay, sha256Hex: '0'.repeat(64),
    }, 'v6-current')).toThrow(/overlay differs/u);
  });

  it('accepts a pinned HEAD tree with clean index and exactly nine working changes', () => {
    const observed = parseV4GitSnapshot(fixture(), declared);
    expect(observed.headBuildSbtBlob).toBe(BUILD_BASE);
    expect(observed.status.split('\n')).toHaveLength(9);
    expect(observed.headTreeEntries.get('opaque-submodule')?.type).toBe('commit');
  });

  it('rejects wrong HEAD or root tree', () => {
    for (const changed of [
      { head: Buffer.from('0'.repeat(40) + '\n') },
      { tree: Buffer.from('0'.repeat(40) + '\n') },
    ]) {
      expect(() => parseV4GitSnapshot({ ...fixture(), ...changed }, declared)).toThrow(/HEAD or tree/u);
    }
  });

  it('rejects a substituted HEAD:build.sbt blob or tree entry', () => {
    const base = fixture();
    expect(() => parseV4GitSnapshot({ ...base,
      buildSbtTreeEntry: z(['100644 blob ' + '0'.repeat(40) + '\tbuild.sbt']),
    }, declared)).toThrow(/build.sbt blob/u);
    expect(() => parseV4GitSnapshot({ ...base,
      fullTree: Buffer.from(base.fullTree.toString('utf8').replace(BUILD_BASE, '0'.repeat(40))),
      index: Buffer.from(base.index.toString('utf8').replace(BUILD_BASE, '0'.repeat(40))),
    }, declared)).toThrow(/build.sbt blob/u);
  });

  it('rejects staged index drift, conflict stages and hidden index flags', () => {
    const base = fixture();
    expect(() => parseV4GitSnapshot({ ...base,
      index: Buffer.from(base.index.toString('utf8').replace(BUILD_BASE, '0'.repeat(40))),
    }, declared)).toThrow(/index differs/u);
    expect(() => parseV4GitSnapshot({ ...base,
      index: Buffer.from(base.index.toString('utf8').replace(' 0\tbuild.sbt', ' 2\tbuild.sbt')),
    }, declared)).toThrow(/index differs/u);
    expect(() => parseV4GitSnapshot({ ...base,
      indexFlags: Buffer.from(base.indexFlags.toString('utf8').replace('H build.sbt', 'S build.sbt')),
    }, declared)).toThrow(/index has/u);
  });

  it('rejects a tenth change, rename, and an unterminated -z stream', () => {
    const base = fixture();
    for (const status of [
      Buffer.concat([base.status, z(['?? src/tenth.scala'])]),
      z(['R  src/renamed.scala', 'src/old.scala']),
      Buffer.from(base.status.subarray(0, -1)),
    ]) {
      expect(() => parseV4GitSnapshot({ ...base, status }, declared)).toThrow();
    }
  });

  it('rejects duplicate or unsafe Git paths and inconsistent declarations', () => {
    const base = fixture();
    expect(() => parseV4GitSnapshot({ ...base,
      fullTree: Buffer.concat([base.fullTree, z(['100644 blob ' + '1'.repeat(40) + '\tSRC/A.scala'])]),
    }, declared)).toThrow(/duplicate|case-colliding/u);
    expect(() => parseV4GitSnapshot({ ...base,
      status: Buffer.from(base.status.toString('utf8').replace('src/f.scala', '../f.scala')),
    }, declared)).toThrow(/unsupported|unsafe/u);
    expect(() => parseV4GitSnapshot(base, [
      ...declared.slice(0, -1), { ...declared.at(-1)!, baseBlob: '0'.repeat(40) },
    ])).toThrow(/base blob/u);
  });
});

describe.skipIf(!hasRequiredDVolume())('V4 external isolated Git HOME', () => {
  it('accepts only an empty Local and Roaming created after the initial HOME check', () => {
    withGitHomeFixture(({ source, home }) => {
      const assertHome = prepareV4GitHome(source, home);
      assertHome();
      mkdirSync(join(home, 'AppData', 'Local'), { recursive: true });
      mkdirSync(join(home, 'AppData', 'Roaming'));
      assertHome();
    });
  });

  it('rejects an extra file in otherwise empty Local', () => {
    withGitHomeFixture(({ source, home }) => {
      const assertHome = prepareV4GitHome(source, home);
      mkdirSync(join(home, 'AppData', 'Local'), { recursive: true });
      mkdirSync(join(home, 'AppData', 'Roaming'));
      writeFileSync(join(home, 'AppData', 'Local', 'unexpected'), 'x');
      expect(assertHome).toThrow(/unknown entries/u);
    });
  });

  it('accepts a fresh external D HOME and only the known PowerShell cache metadata', () => {
    withGitHomeFixture(({ source, home }) => {
      const assertHome = prepareV4GitHome(source, home);
      assertHome();
      createKnownHomeCache(home);
      assertHome();
      mkdirSync(join(home, 'unexpected'));
      expect(assertHome).toThrow(/unknown entries/u);
    });
  });

  it('rejects a HOME under the owned product, including preparation and .git', () => {
    withGitHomeFixture(({ source, root }) => {
      for (const home of [join(source, '.git', 'bridge-no-global-home'),
        join(root, 'owned', 'preparation', 'git-home')]) {
        mkdirSync(home, { recursive: true });
        expect(() => prepareV4GitHome(source, home)).toThrow(/outside the owned source root/u);
      }
    });
  });

  it('rejects a populated or linked HOME and linked cache descendants', () => {
    withGitHomeFixture(({ source, home, root }) => {
      writeFileSync(join(home, 'preexisting'), 'x');
      expect(() => prepareV4GitHome(source, home)).toThrow(/unknown entries/u);
      rmSync(join(home, 'preexisting'));

      const linkedHome = join(root, 'linked-home');
      symlinkSync(home, linkedHome, 'junction');
      expect(() => prepareV4GitHome(source, linkedHome)).toThrow(/indirect/u);

      const assertHome = prepareV4GitHome(source, home);
      const local = join(home, 'AppData', 'Local');
      mkdirSync(join(home, 'AppData', 'Roaming'), { recursive: true });
      const external = join(root, 'external-local');
      mkdirSync(external);
      symlinkSync(external, local, 'junction');
      expect(assertHome).toThrow(/indirect/u);
    });
  });
});
