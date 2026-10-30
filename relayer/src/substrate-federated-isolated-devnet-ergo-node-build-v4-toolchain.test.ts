import { createHash } from 'node:crypto';
import {
  linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertSameV4PinnedToolchain, captureV4PinnedToolchain,
  type V4PinnedToolchainInput,
} from './substrate-federated-isolated-devnet-ergo-node-build-v4-toolchain.js';

let fixtureRoot: string | undefined;
afterEach(() => {
  if (!fixtureRoot) return;
  const path = resolve(fixtureRoot);
  if (dirname(path) !== resolve(tmpdir())
      || !basename(path).startsWith('v4-toolchain-')) {
    throw new Error('fixture cleanup path differs');
  }
  rmSync(path, { recursive: true });
  fixtureRoot = undefined;
});

function hash(bytes: string): string {
  return createHash('sha256').update(bytes, 'utf8').digest('hex');
}

function fixture(): V4PinnedToolchainInput {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'v4-toolchain-'));
  const javaHomeRoot = resolve(fixtureRoot, 'jdk');
  const javaBin = resolve(javaHomeRoot, 'bin');
  const javaLib = resolve(javaHomeRoot, 'lib');
  const sbtRoot = resolve(fixtureRoot, 'sbt');
  for (const path of [javaHomeRoot, javaBin, javaLib, sbtRoot]) mkdirSync(path);
  writeFileSync(resolve(javaBin, 'java.exe'), 'synthetic-java-executable');
  writeFileSync(resolve(javaLib, 'modules'), 'synthetic-java-modules');
  writeFileSync(resolve(javaHomeRoot, 'release'), 'synthetic-java-release');
  const sbtLauncherJarPath = resolve(sbtRoot, 'sbt-launch-1.12.11.jar');
  writeFileSync(sbtLauncherJarPath, 'synthetic-sbt-launcher');
  const expectedFrame = [
    'bin/java.exe:' + hash('synthetic-java-executable'),
    'lib/modules:' + hash('synthetic-java-modules'),
    'release:' + hash('synthetic-java-release'),
  ].join('\n');
  return {
    javaExecutablePath: resolve(javaBin, 'java.exe'), sbtLauncherJarPath,
    lock: {
      javaHomeSha256: hash(expectedFrame),
      sbtLauncherJarSha256: hash('synthetic-sbt-launcher'),
    },
  };
}

const windows = process.platform === 'win32' ? describe : describe.skip;
windows('V4 complete pinned Java and SBT toolchain', () => {
  it('matches V3 whole-home framing and stable direct identities without executing tools', () => {
    const input = fixture();
    const before = captureV4PinnedToolchain(input);
    const after = captureV4PinnedToolchain(input);
    expect(before).toMatchObject({
      javaHomeSha256Hex: input.lock.javaHomeSha256,
      sbtLauncherJarSha256Hex: input.lock.sbtLauncherJarSha256,
      javaExecutableSha256Hex: hash('synthetic-java-executable'),
      javaFileCount: 3, javaDirectoryCount: 3,
    });
    expect(before.javaBytes).toBe(
      Buffer.byteLength('synthetic-java-executable')
      + Buffer.byteLength('synthetic-java-modules')
      + Buffer.byteLength('synthetic-java-release'),
    );
    expect(() => assertSameV4PinnedToolchain(before, after)).not.toThrow();
  });

  it('refuses changed Java bytes, added Java membership and changed SBT bytes', () => {
    const input = fixture();
    writeFileSync(input.javaExecutablePath, 'changed-java-executable');
    expect(() => captureV4PinnedToolchain(input)).toThrow(/Java home differs/u);
    writeFileSync(input.javaExecutablePath, 'synthetic-java-executable');
    writeFileSync(resolve(dirname(dirname(input.javaExecutablePath)), 'extra'), 'extra');
    expect(() => captureV4PinnedToolchain(input)).toThrow(/Java home differs/u);
    rmSync(resolve(dirname(dirname(input.javaExecutablePath)), 'extra'));
    writeFileSync(input.sbtLauncherJarPath, 'changed-sbt-launcher');
    expect(() => captureV4PinnedToolchain(input)).toThrow(/SBT launcher differs/u);
  });

  it('refuses a hardlinked tool and detects same-byte identity drift across captures', () => {
    const input = fixture();
    const before = captureV4PinnedToolchain(input);
    writeFileSync(input.javaExecutablePath, readFileSync(input.javaExecutablePath));
    const after = captureV4PinnedToolchain(input);
    expect(() => assertSameV4PinnedToolchain(before, after)).toThrow(/changed across the Job/u);
    linkSync(input.sbtLauncherJarPath, resolve(dirname(input.sbtLauncherJarPath), 'second.jar'));
    expect(() => captureV4PinnedToolchain(input)).toThrow(/indirect/u);
  });
});
