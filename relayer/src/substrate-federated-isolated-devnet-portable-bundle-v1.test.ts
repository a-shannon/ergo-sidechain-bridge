import {
  constants,
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fsFault = vi.hoisted(() => ({
  mode: 'none' as string,
  targetLstatPath: '',
  targetLstatCalls: 0,
  writeFailureSuffix: '',
  fsyncFailureSuffix: '',
  outputMutationSuffix: '',
  outputMutated: false,
  renameFailure: false,
  descriptorPaths: new Map<number, string>(),
  writePaths: [] as string[],
  renameCalls: 0,
}));

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const callLstatSync = actual.lstatSync as unknown as
    (...args: unknown[]) => unknown;
  const callOpenSync = actual.openSync as unknown as
    (...args: unknown[]) => number;
  const callCloseSync = actual.closeSync as unknown as
    (...args: unknown[]) => void;
  const callFsyncSync = actual.fsyncSync as unknown as
    (...args: unknown[]) => void;
  const callWriteSync = actual.writeSync as unknown as
    (...args: unknown[]) => number;
  const callRenameSync = actual.renameSync as unknown as
    (...args: unknown[]) => void;
  return {
    ...actual,
    lstatSync: (...args: unknown[]) => {
      const stat = callLstatSync(...args) as Record<PropertyKey, unknown>;
      if (
        fsFault.targetLstatPath.length === 0
        || String(args[0]).toLowerCase() !== fsFault.targetLstatPath
        || typeof stat.dev !== 'bigint'
      ) {
        return stat;
      }
      fsFault.targetLstatCalls += 1;
      if (fsFault.mode === 'zero-identity' && fsFault.targetLstatCalls === 1) {
        return statWithOverrides(stat, { dev: 0n, ino: 0n });
      }
      if (
        fsFault.mode === 'selection-drift'
        && fsFault.targetLstatCalls === 3
      ) {
        return statWithOverrides(stat, {
          mtimeNs: (stat.mtimeNs as bigint) + 1n,
        });
      }
      if (
        fsFault.mode === 'post-read-replacement'
        && fsFault.targetLstatCalls === 5
      ) {
        return statWithOverrides(stat, {
          ino: (stat.ino as bigint) + 1n,
        });
      }
      return stat;
    },
    openSync: (...args: unknown[]) => {
      const path = String(args[0]);
      const flags = args[1];
      if (
        flags === actual.constants.O_RDONLY
        && fsFault.outputMutationSuffix.length > 0
        && !fsFault.outputMutated
        && path.toLowerCase().endsWith(fsFault.outputMutationSuffix)
      ) {
        const size = actual.statSync(path).size;
        actual.writeFileSync(path, Buffer.alloc(size, 0x5a));
        fsFault.outputMutated = true;
      }
      const descriptor = callOpenSync(...args);
      if (
        typeof flags === 'number'
        && (
          (flags & actual.constants.O_WRONLY) !== 0
          || (flags & actual.constants.O_RDWR) !== 0
        )
      ) {
        fsFault.descriptorPaths.set(descriptor, path);
        fsFault.writePaths.push(path);
      } else {
        fsFault.descriptorPaths.set(descriptor, path);
      }
      return descriptor;
    },
    closeSync: (...args: unknown[]) => {
      fsFault.descriptorPaths.delete(Number(args[0]));
      return callCloseSync(...args);
    },
    writeSync: (...args: unknown[]) => {
      const path = fsFault.descriptorPaths.get(Number(args[0]));
      if (
        path !== undefined
        && fsFault.writeFailureSuffix.length > 0
        && path.toLowerCase().endsWith(fsFault.writeFailureSuffix)
      ) {
        throw new Error('injected write failure');
      }
      return callWriteSync(...args);
    },
    fsyncSync: (...args: unknown[]) => {
      const path = fsFault.descriptorPaths.get(Number(args[0]));
      if (
        path !== undefined
        && fsFault.fsyncFailureSuffix.length > 0
        && path.toLowerCase().endsWith(fsFault.fsyncFailureSuffix)
      ) {
        throw new Error('injected fsync failure');
      }
      return callFsyncSync(...args);
    },
    renameSync: (...args: unknown[]) => {
      fsFault.renameCalls += 1;
      if (fsFault.renameFailure) throw new Error('injected rename failure');
      return callRenameSync(...args);
    },
  };
});

import {
  assembleSubstrateFederatedIsolatedDevnetPortableBundleFromArgumentsV1,
} from './scripts/assemble-substrate-federated-isolated-devnet-portable-bundle-v1.js';
import { canonicalJson } from './strict-json.js';
import {
  assembleSubstrateFederatedIsolatedDevnetPortableBundleV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_BUNDLE_ASSEMBLY_V1_SCHEMA,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_FILE,
  type SubstrateFederatedIsolatedDevnetPortableSourcePathsV1,
} from './substrate-federated-isolated-devnet-portable-bundle-v1.js';
import {
  loadSubstrateFederatedIsolatedDevnetPortableReplayInputV1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1,
  SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_SCHEMA,
} from './substrate-federated-isolated-devnet-portable-replay-files-v1.js';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const CLI_SOURCE_FLAGS = Object.freeze([
  ['--tracker-template', 'trackerTemplate'],
  ['--duplicate-prevention-template', 'duplicatePreventionTemplate'],
  ['--source-lock-template', 'sourceLockTemplate'],
  ['--pooled-reserve-template', 'pooledReserveTemplate'],
  ['--source-acceptance-report', 'sourceAcceptanceReport'],
  ['--source-reported-finalized-blocks', 'sourceReportedFinalizedBlocks'],
  ['--source-runtime-history', 'sourceRuntimeHistory'],
  ['--source-application-history', 'sourceApplicationHistory'],
  ['--source-history-receipt', 'sourceHistoryReceipt'],
  ['--ergo-greatest-work-headers-manifest', 'ergoGreatestWorkHeadersManifest'],
  ['--ergo-transactions-manifest', 'ergoTransactionsManifest'],
  ['--ergo-utxo-transitions-manifest', 'ergoUtxoTransitionsManifest'],
  ['--relayer-source-archive', 'relayerSourceArchive'],
  ['--relayer-package-lock', 'relayerPackageLock'],
  ['--relayer-runtime-entrypoints-manifest', 'relayerRuntimeEntrypointsManifest'],
  ['--relayer-build-artifact', 'relayerBuildArtifact'],
  ['--attestation-packet', 'attestationPacket'],
] as const);
const TRUST_PINS = Object.freeze({
  expectedTargetDescriptorDigestHex: '11'.repeat(32),
  expectedSourceAttestationKeySetDigestHex: '22'.repeat(32),
});

let root: string;
let destination: string;
let sourcePaths: SubstrateFederatedIsolatedDevnetPortableSourcePathsV1;
let sourceBytes: Readonly<Record<string, Buffer>>;

describe('Substrate federated isolated-devnet portable bundle assembler V1', () => {
  beforeEach(() => {
    resetFsFault();
    root = mkdtempSync(join(tmpdir(), 'e2s-isolated-bundle-'));
    destination = join(root, 'portable-bundle');
    const written = writeSources(join(root, 'sources'));
    sourcePaths = written.paths;
    sourceBytes = written.bytes;
  });

  afterEach(() => {
    resetFsFault();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  });

  it('publishes exact opaque bytes, writes the canonical request last and joins the committed loader', () => {
    const result = assemble(destination, sourcePaths);

    expect(result).toEqual({
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_BUNDLE_ASSEMBLY_V1_SCHEMA,
      version: 1,
      artifactCount: 17,
      artifactByteCount: Object.values(sourceBytes).reduce(
        (total, bytes) => total + bytes.byteLength,
        0,
      ),
      requestFile:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_FILE,
    });
    for (const [role, relativePath] of Object.entries(
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1,
    )) {
      expect(readFileSync(join(destination, ...relativePath.split('/'))))
        .toEqual(sourceBytes[role]);
    }
    const requestPath = join(
      destination,
      SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_FILE,
    );
    const expectedRequest = {
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_SCHEMA,
      version: 1,
      files:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1,
    };
    expect(readFileSync(requestPath, 'utf8'))
      .toBe(`${canonicalJson(expectedRequest)}\n`);

    const loaded = loadSubstrateFederatedIsolatedDevnetPortableReplayInputV1(
      requestPath,
      TRUST_PINS,
    );
    for (const role of Object.keys(loaded.artifacts)) {
      expect(Buffer.from(
        loaded.artifacts[role as keyof typeof loaded.artifacts],
      )).toEqual(sourceBytes[role]);
    }
    expect(fsFault.writePaths.at(-1)?.toLowerCase()).toMatch(
      /portable-replay-request\.v1\.json$/,
    );
    expect(fsFault.renameCalls).toBe(1);
    expect(readdirSync(root).some(name => name.includes('.partial-'))).toBe(false);
  });

  it('exposes an explicit all-role CLI boundary and rejects malformed option sets', () => {
    const cliDestination = join(root, 'cli-bundle');
    const args = cliArguments(cliDestination, sourcePaths);
    expect(
      assembleSubstrateFederatedIsolatedDevnetPortableBundleFromArgumentsV1(
        args,
      ).artifactCount,
    ).toBe(17);

    const malformed = [
      args.slice(0, -2),
      args.map((value, index) => index === 2 ? '--destination' : value),
      args.map((value, index) => index === 2 ? '--unsupported-source' : value),
      args.map((value, index) => index === 3 ? '' : value),
    ];
    for (const variant of malformed) {
      expect(() =>
        assembleSubstrateFederatedIsolatedDevnetPortableBundleFromArgumentsV1(
          variant,
        )).toThrow();
    }
  });

  it('runs as a config-free child command with canonical stdout and generic failure output', () => {
    const script = resolve(
      MODULE_DIRECTORY,
      'scripts',
      'assemble-substrate-federated-isolated-devnet-portable-bundle-v1.ts',
    );
    const tsx = resolve(
      MODULE_DIRECTORY,
      '..',
      'node_modules',
      'tsx',
      'dist',
      'cli.mjs',
    );
    const childDestination = join(root, 'child-bundle');
    const args = cliArguments(childDestination, sourcePaths);
    const success = spawnSync(process.execPath, [tsx, script, ...args], {
      cwd: resolve(MODULE_DIRECTORY, '..'),
      encoding: 'utf8',
      env: childEnvironment(),
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
      windowsHide: true,
    });
    expect(success.error).toBeUndefined();
    expect(success.status).toBe(0);
    expect(success.stderr).toBe('');
    expect(success.stdout).toBe(`${canonicalJson({
      schema:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_BUNDLE_ASSEMBLY_V1_SCHEMA,
      version: 1,
      artifactCount: 17,
      artifactByteCount: Object.values(sourceBytes).reduce(
        (total, bytes) => total + bytes.byteLength,
        0,
      ),
      requestFile:
        SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_REPLAY_REQUEST_V1_FILE,
    })}\n`);

    const failure = spawnSync(
      process.execPath,
      [tsx, script, ...args.slice(0, -2)],
      {
        cwd: resolve(MODULE_DIRECTORY, '..'),
        encoding: 'utf8',
        env: childEnvironment(),
        maxBuffer: 1024 * 1024,
        timeout: 30_000,
        windowsHide: true,
      },
    );
    expect(failure.error).toBeUndefined();
    expect(failure.status).toBe(1);
    expect(failure.stdout).toBe('');
    expect(failure.stderr).toBe(
      'isolated portable bundle assembly failed\n',
    );
  });

  it('rejects existing, partial, relative and in-worktree destinations', () => {
    mkdirSync(destination);
    expect(() => assemble(destination, sourcePaths)).toThrow(/already exist/i);

    expect(() => assemble(
      join(root, '.bundle.partial-manual'),
      sourcePaths,
    )).toThrow(/must not be partial/i);
    expect(() => assemble('relative-bundle', sourcePaths)).toThrow(/absolute/i);

    const insideWorktree = resolve(
      MODULE_DIRECTORY,
      '.isolated-bundle-must-not-be-created',
    );
    expect(existsSync(insideWorktree)).toBe(false);
    expect(() => assemble(insideWorktree, sourcePaths)).toThrow(/Git worktree/i);
    expect(existsSync(insideWorktree)).toBe(false);
  });

  it('requires exact own data properties for the input and all 17 source roles', () => {
    expect(() => assembleSubstrateFederatedIsolatedDevnetPortableBundleV1({
      destinationDirectory: destination,
      sources: sourcePaths,
      approval: true,
    } as never)).toThrow(/unexpected fields/i);

    expect(() => assemble(destination, {
      ...sourcePaths,
      approval: destination,
    } as never)).toThrow(/unexpected fields/i);

    const descriptors = Object.getOwnPropertyDescriptors(sourcePaths);
    Object.defineProperty(descriptors, 'trackerTemplate', {
      value: {
        get: () => sourcePaths.trackerTemplate,
        enumerable: true,
        configurable: true,
      },
      enumerable: true,
      configurable: true,
      writable: true,
    });
    const accessorSources = Object.create(Object.prototype);
    Object.defineProperties(accessorSources, descriptors);
    expect(() => assemble(destination, accessorSources)).toThrow(/data property/i);
  });

  it('rejects sensitive, remote, relative, linked and repeated source identities', () => {
    const sensitive = join(root, '.env.local');
    writeFileSync(sensitive, Buffer.from('not-a-secret', 'ascii'));
    expect(() => assemble(destination, {
      ...sourcePaths,
      trackerTemplate: sensitive,
    })).toThrow(/non-sensitive/i);
    expect(() => assemble(destination, {
      ...sourcePaths,
      trackerTemplate: 'relative-template.es',
    })).toThrow(/absolute/i);
    expect(() => assemble(destination, {
      ...sourcePaths,
      trackerTemplate: '\\\\server\\share\\template.es',
    })).toThrow(/remote|device|non-UNC/i);
    expect(() => assemble(destination, {
      ...sourcePaths,
      trackerTemplate: sourcePaths.duplicatePreventionTemplate,
    })).toThrow(/distinct/i);

    const linkedTarget = sourcePaths.trackerTemplate;
    const retained = `${linkedTarget}.retained`;
    renameSync(linkedTarget, retained);
    try {
      symlinkSync(retained, linkedTarget, 'file');
    } catch (error) {
      expectUnsupportedLink(error);
      return;
    }
    expect(() => assemble(destination, sourcePaths)).toThrow(/single-link/i);
  });

  it('rejects hard links, zero identities, source drift and files outside the 16 MiB bound', () => {
    const hardLinkTarget = sourcePaths.trackerTemplate;
    rmSync(hardLinkTarget);
    try {
      linkSync(sourcePaths.duplicatePreventionTemplate, hardLinkTarget);
    } catch (error) {
      expectUnsupportedLink(error);
      return;
    }
    expect(() => assemble(destination, sourcePaths)).toThrow(/single-link/i);

    rmSync(hardLinkTarget);
    writeFileSync(hardLinkTarget, Buffer.from('restored-tracker', 'ascii'));
    setSourceFault('zero-identity', hardLinkTarget);
    expect(() => assemble(destination, sourcePaths)).toThrow(/single-link/i);

    setSourceFault('selection-drift', hardLinkTarget);
    expect(() => assemble(destination, sourcePaths)).toThrow(/changed after/i);

    setSourceFault('post-read-replacement', hardLinkTarget);
    expect(() => assemble(destination, sourcePaths)).toThrow(/identity changed/i);

    resetFsFault();
    truncateSync(hardLinkTarget, 16 * 1024 * 1024 + 1);
    expect(() => assemble(destination, sourcePaths)).toThrow(/bounded limit/i);
  });

  it('revalidates staged bytes immediately before publication', () => {
    fsFault.outputMutationSuffix = join(
      'contracts',
      'SPVTrackerSubstrateFederatedV1.es',
    ).toLowerCase();

    expect(() => assemble(destination, sourcePaths)).toThrow(
      /identity changed|content changed/i,
    );
    expect(fsFault.outputMutated).toBe(true);
    expect(existsSync(destination)).toBe(false);
    expect(fsFault.renameCalls).toBe(0);
    expect(readdirSync(root).filter(name => name.includes('.partial-'))).toEqual([]);
  });

  it('removes verified staging and never publishes after write, sync or rename failure', () => {
    const suffix = join(
      'artifacts',
      'relayer',
      'build-artifact.v1.bin',
    ).toLowerCase();
    const cases = [
      () => { fsFault.writeFailureSuffix = suffix; },
      () => { fsFault.fsyncFailureSuffix = suffix; },
      () => { fsFault.renameFailure = true; },
    ];
    for (const [index, configure] of cases.entries()) {
      resetFsFault();
      configure();
      const target = join(root, `failed-bundle-${index}`);
      expect(() => assemble(target, sourcePaths)).toThrow();
      expect(existsSync(target)).toBe(false);
      expect(readdirSync(root).filter(name => name.includes('.partial-')))
        .toEqual([]);
    }
  });

  it('keeps sources opaque and excludes authority, replay and live capabilities', () => {
    const moduleSource = readFileSync(new URL(
      './substrate-federated-isolated-devnet-portable-bundle-v1.ts',
      import.meta.url,
    ), 'utf8');
    const cliSource = readFileSync(new URL(
      './scripts/assemble-substrate-federated-isolated-devnet-portable-bundle-v1.ts',
      import.meta.url,
    ), 'utf8');
    for (const source of [moduleSource, cliSource]) {
      expect(source).not.toMatch(/node:http|node:https|axios|\bfetch\s*\(/);
      expect(source).not.toMatch(/process\.env|dotenv|config(?:uration)?-loader/i);
      expect(source).not.toMatch(/state-tracker|profile-registry|database/i);
      expect(source).not.toMatch(/replaySubstrate|signer|submitter|broadcaster/i);
    }
    expect(moduleSource).not.toMatch(/JSON\.parse|parseStrictJson/);
    expect(cliSource).toContain(
      "process.stderr.write('isolated portable bundle assembly failed\\n')",
    );
    expect(sourceBytes.attestationPacket).toEqual(Buffer.from([0xff, 0x00, 0x7b]));
  });
});

function assemble(
  target: string,
  sources: SubstrateFederatedIsolatedDevnetPortableSourcePathsV1,
) {
  return assembleSubstrateFederatedIsolatedDevnetPortableBundleV1({
    destinationDirectory: target,
    sources,
  });
}

function writeSources(targetRoot: string): Readonly<{
  paths: SubstrateFederatedIsolatedDevnetPortableSourcePathsV1;
  bytes: Readonly<Record<string, Buffer>>;
}> {
  mkdirSync(targetRoot, { recursive: true });
  const paths: Record<string, string> = {};
  const bytes: Record<string, Buffer> = {};
  for (const [index, role] of Object.keys(
    SUBSTRATE_FEDERATED_ISOLATED_DEVNET_PORTABLE_ARTIFACT_PATHS_V1,
  ).entries()) {
    const content = role === 'attestationPacket'
      ? Buffer.from([0xff, 0x00, 0x7b])
      : Buffer.from(`isolated-source-${index}:${role}`, 'utf8');
    const path = join(targetRoot, `${String(index).padStart(2, '0')}-${role}.bin`);
    writeFileSync(path, content);
    paths[role] = path;
    bytes[role] = content;
  }
  return Object.freeze({
    paths: Object.freeze(paths) as
      SubstrateFederatedIsolatedDevnetPortableSourcePathsV1,
    bytes: Object.freeze(bytes),
  });
}

function cliArguments(
  target: string,
  sources: SubstrateFederatedIsolatedDevnetPortableSourcePathsV1,
): string[] {
  return [
    '--destination',
    target,
    ...CLI_SOURCE_FLAGS.flatMap(([flag, role]) => [flag, sources[role]]),
  ];
}

function expectUnsupportedLink(error: unknown): void {
  const code = (error as NodeJS.ErrnoException).code;
  expect(['EPERM', 'EACCES', 'UNKNOWN', 'ENOTSUP']).toContain(code);
}

function childEnvironment(): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const key of [
    'Path',
    'PATH',
    'SystemRoot',
    'SYSTEMROOT',
    'WINDIR',
    'TEMP',
    'TMP',
    'ComSpec',
    'COMSPEC',
    'PATHEXT',
  ]) {
    const value = process.env[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function setSourceFault(mode: string, path: string): void {
  resetFsFault();
  fsFault.mode = mode;
  fsFault.targetLstatPath = path.toLowerCase();
}

function resetFsFault(): void {
  fsFault.mode = 'none';
  fsFault.targetLstatPath = '';
  fsFault.targetLstatCalls = 0;
  fsFault.writeFailureSuffix = '';
  fsFault.fsyncFailureSuffix = '';
  fsFault.outputMutationSuffix = '';
  fsFault.outputMutated = false;
  fsFault.renameFailure = false;
  fsFault.descriptorPaths.clear();
  fsFault.writePaths.length = 0;
  fsFault.renameCalls = 0;
}

function statWithOverrides(
  stat: Record<PropertyKey, unknown>,
  overrides: Readonly<Record<string, bigint>>,
): object {
  return new Proxy(stat, {
    get(target, property) {
      if (typeof property === 'string' && property in overrides) {
        return overrides[property];
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
