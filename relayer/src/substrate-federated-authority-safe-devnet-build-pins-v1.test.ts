import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inspectBaseline: vi.fn(),
  runProcess: vi.fn(),
  validateToolchain: vi.fn(),
  inspectProtoc: vi.fn(),
  inspectRustSrc: vi.fn(),
}));

vi.mock('./consensus-source-baseline.js', async importOriginal => ({
  ...await importOriginal<typeof import('./consensus-source-baseline.js')>(),
  inspectConsensusSourceBaseline: mocks.inspectBaseline,
}));

vi.mock('./pinned-local-native-verifier-build.js', async importOriginal => ({
  ...await importOriginal<
    typeof import('./pinned-local-native-verifier-build.js')
  >(),
  runBoundedProcess: mocks.runProcess,
  validateNativeVerifierToolchainLock: mocks.validateToolchain,
}));

vi.mock(
  './substrate-federated-authority-safe-devnet-protoc-v1.js',
  () => ({
    inspectSubstrateFederatedAuthoritySafePinnedProtocV1:
      mocks.inspectProtoc,
  }),
);

vi.mock(
  './substrate-federated-authority-safe-devnet-rust-src-v1.js',
  () => ({
    inspectSubstrateFederatedAuthoritySafePinnedRustSrcV1:
      mocks.inspectRustSrc,
  }),
);

import {
  refreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1,
  type RefreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1Input,
} from './substrate-federated-authority-safe-devnet-build-pins-v1.js';
import {
  buildSubstrateFederatedAuthoritySafeCargoEnvironmentV1,
} from './substrate-federated-authority-safe-devnet-build-environment-v1.js';

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const BRIDGE_ROOT = resolve(MODULE_DIRECTORY, '..', '..');
const WORKTREE_ROOT = existsSync(join(BRIDGE_ROOT, '.git'))
  ? BRIDGE_ROOT
  : resolve(BRIDGE_ROOT, '..');
const FRONTIER_COMMIT = '75329a2df49e2cc7981485392c31160929d1bd48';
const FRONTIER_PATCH_SHA256 =
  '47fdb34df23ebd5aad7d64885d030f67b3ae1aa25d1990bccc010903039a8813';
const CARGO_VERSION = 'cargo 1.82.0 (8f40fc59f 2024-08-21)';
const RUSTC_VERSION = 'rustc 1.82.0 (f6e511eec 2024-10-15)';
const GIT_VERSION = 'git version 2.54.0.windows.1';
const BINARY_VERSION = process.platform === 'win32'
  ? 'frontier-template-node.exe 0.0.0-75329a2df49'
  : 'frontier-template-node 0.0.0-75329a2df49';
const RUNTIME_CODE = Buffer.from('001122334455', 'hex');

const temporaryDirectories: string[] = [];
let paths: ReturnType<typeof createPaths>;
let buildCount: number;
let mutateSecondBaseSpec: ((value: Record<string, unknown>) => void) | undefined;
let secondBaseSpecRawBytes: Buffer | undefined;
const buildCalls: Array<Readonly<{ env?: NodeJS.ProcessEnv }>> = [];

describe('Substrate federated authority-safe devnet build pins V1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildCount = 0;
    mutateSecondBaseSpec = undefined;
    secondBaseSpecRawBytes = undefined;
    buildCalls.length = 0;
    paths = createPaths();
    mocks.inspectProtoc.mockReset().mockReturnValue(protocObservation());
    mocks.inspectRustSrc.mockReset().mockReturnValue(rustSrcObservation());
    mocks.inspectBaseline.mockReturnValue(passingBaseline());
    mocks.runProcess.mockImplementation(runProcess);
    mocks.validateToolchain.mockReturnValue({ errors: [] });
  });

  afterEach(() => {
    for (const path of temporaryDirectories.splice(0)) {
      rmSync(path, { recursive: true, force: true });
    }
  });

  it('publishes same-toolchain base-spec and runtime pins without promoting native or authority claims', async () => {
    const result = await refreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1(
      input(),
    );

    const baseSpecBytes = Buffer.from(JSON.stringify(baseSpec()), 'utf8');
    expect(Buffer.from(result.baseSpecBytes)).toEqual(baseSpecBytes);
    expect(result.report).toMatchObject({
      status: 'same_toolchain_frontier_build_pins_reproduced',
      source: {
        frontierCommit: FRONTIER_COMMIT,
        frontierPatchSha256Hex: FRONTIER_PATCH_SHA256,
      },
      baseSpec: {
        byteLength: baseSpecBytes.length,
        sha256Hex: sha256(baseSpecBytes),
      },
      runtimeCode: {
        byteLength: RUNTIME_CODE.length,
        sha256Hex: sha256(RUNTIME_CODE),
      },
      observations: { nativeBinaryDigestsEqual: false },
      checks: {
        distinctFreshCargoTargetsUsed: true,
        sameExplicitCargoCacheRootSelected: true,
        cargoLockedAndOfflineForBothBuilds: true,
        baseSpecBytesReproducedExactly: true,
        runtimeCodeBytesReproducedExactly: true,
      },
      boundaries: {
        crossRootReproducibilityEstablished: false,
        nativeBinaryReproducibilityEstablished: false,
        independentBuildAttestationVerified: false,
        hermeticBuildAttestationVerified: false,
        targetNodeAcceptanceVerified: false,
        fundsAuthorityEstablished: false,
        gate5Closed: false,
        trustlessStatusEstablished: false,
        productionReadinessEstablished: false,
      },
    });
    expect(result.report.nativeBuilds).toHaveLength(2);
    expect(result.report.nativeBuilds[0]?.binarySha256Hex)
      .not.toBe(result.report.nativeBuilds[1]?.binarySha256Hex);
    expect(buildCalls).toHaveLength(2);
    expect(buildCalls[0]?.env?.CARGO_TARGET_DIR)
      .not.toBe(buildCalls[1]?.env?.CARGO_TARGET_DIR);
    expect(buildCalls[0]?.env?.CARGO_HOME)
      .not.toBe(buildCalls[1]?.env?.CARGO_HOME);
    for (const call of buildCalls) {
      const buildPath = call.env?.[process.platform === 'win32' ? 'Path' : 'PATH'];
      expect(buildPath?.split(delimiter).slice(0, 2)).toEqual([
        realpathSync(dirname(paths.git)),
        realpathSync(dirname(paths.cargo)),
      ]);
      expect(call.env).toMatchObject({
        CARGO_NET_OFFLINE: 'true',
        CARGO_INCREMENTAL: '0',
        PROTOC: realpathSync(paths.protoc),
        CARGO_PROFILE_DEV_INCREMENTAL: 'false',
        CARGO_PROFILE_DEV_DEBUG: '0',
        CARGO_PROFILE_DEV_CODEGEN_UNITS: '1',
      });
      expect(call.env?.WASM_BUILD_RUSTFLAGS).toContain(
        '--remap-path-prefix=',
      );
      expect(call.env?.WASM_BUILD_RUSTFLAGS).toContain(
        `--remap-path-prefix=${call.env?.CARGO_HOME}=/e2s/cargo-home`,
      );
      expect(call.env?.WASM_BUILD_RUSTFLAGS).toContain(
        '=/e2s/build-target',
      );
      expect(call.env?.WASM_BUILD_RUSTFLAGS).toContain(
        '=/e2s/rust-toolchain',
      );
      const nativeFlags = Object.entries(call.env ?? {})
        .find(([key]) => /^CARGO_TARGET_.+_RUSTFLAGS$/.test(key))?.[1];
      expect(nativeFlags).toContain(
        `--remap-path-prefix=${call.env?.CARGO_HOME}=/e2s/cargo-home`,
      );
      expect(call.env?.WASM_BUILD_RUSTFLAGS?.endsWith('/e2s/cargo-home'))
        .toBe(true);
      expect(nativeFlags?.endsWith('/e2s/cargo-home')).toBe(true);
    }
    const publicReport = JSON.stringify(result.report);
    expect(publicReport).not.toContain(paths.root);
    expect(publicReport).not.toContain(paths.source);
    expect(publicReport).not.toContain(paths.temporaryRoot);
    expect(publicReport).not.toContain(paths.cargoHome);
  });

  it('fails closed when the second fresh build changes the base-spec bytes', async () => {
    mutateSecondBaseSpec = value => {
      value.name = 'mutated second build';
    };

    await expect(
      refreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1(input()),
    ).rejects.toThrow(/different base chain-spec bytes/);
  });

  it('fails closed when a build emits a noncanonical runtime code field', async () => {
    mutateSecondBaseSpec = value => {
      const runtimeGenesis = ((value.genesis as Record<string, unknown>)
        .runtimeGenesis as Record<string, unknown>);
      runtimeGenesis.code = '0x0';
    };

    await expect(
      refreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1(input()),
    ).rejects.toThrow(/runtime code must be canonical hex/);
  });

  it('fails closed when raw base-spec stdout is not valid UTF-8', async () => {
    secondBaseSpecRawBytes = Buffer.from([0xff]);

    await expect(
      refreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1(input()),
    ).rejects.toThrow(/encoded as UTF-8/);
  });

  it('rejects semantically equal but byte-different base-spec output', async () => {
    secondBaseSpecRawBytes = Buffer.from(
      JSON.stringify(baseSpec(), null, 2),
      'utf8',
    );

    await expect(
      refreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1(input()),
    ).rejects.toThrow(/different base chain-spec bytes/);
  });

  it('stops before the second build when the source changes during the first build', async () => {
    mocks.inspectBaseline
      .mockReturnValueOnce(passingBaseline())
      .mockReturnValueOnce({
        ...passingBaseline(),
        sourceIdentity: {
          ...passingBaseline().sourceIdentity,
          frontierPatchSha256: '99'.repeat(32),
        },
      });

    await expect(
      refreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1(input()),
    ).rejects.toThrow(/complete source lock after build/);
    expect(buildCount).toBe(1);
  });

  it('rejects a Protobuf compiler change between the two pin builds', async () => {
    const first = protocObservation();
    const second = { ...first, version: `${first.version}-changed` };
    mocks.inspectProtoc
      .mockReset()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
      .mockReturnValueOnce(second);

    await expect(
      refreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1(input()),
    ).rejects.toThrow(/Protobuf compiler changed between the two builds/);
    expect(buildCount).toBe(2);
  });

  it('rejects a rust-src change between the two pin builds', async () => {
    const first = rustSrcObservation();
    const second = { ...first, cargoLockSha256Hex: '9'.repeat(64) };
    mocks.inspectRustSrc
      .mockReset()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
      .mockReturnValueOnce(second);

    await expect(
      refreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1(input()),
    ).rejects.toThrow(/Rust standard-library source changed between the two builds/);
    expect(buildCount).toBe(2);
  });

  it('rejects Cargo and rustc from different toolchain directories before building', async () => {
    const otherToolDirectory = join(paths.root, 'other-tools');
    mkdirSync(otherToolDirectory);
    const otherRustc = join(
      otherToolDirectory,
      process.platform === 'win32' ? 'rustc.exe' : 'rustc',
    );
    writeFileSync(otherRustc, 'rustc');

    await expect(
      refreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1({
        ...input(),
        rustcExecutablePath: otherRustc,
      }),
    ).rejects.toThrow(/one pinned toolchain directory/);
    expect(buildCount).toBe(0);
  });

  it.each([
    ['ASCII whitespace', 'cargo home'],
    ['Unicode whitespace', 'cargo\u00a0home'],
    ['equals sign', 'cargo=home'],
  ])('rejects a Cargo home with %s before building', (_case, name) => {
    const ambiguousCargoHome = join(paths.root, name);
    mkdirSync(ambiguousCargoHome);

    expect(() => buildSubstrateFederatedAuthoritySafeCargoEnvironmentV1({
      cargoTargetDirectory: paths.temporaryRoot,
      cargoHomeDirectory: ambiguousCargoHome,
      cargoExecutablePath: paths.cargo,
      frontierSourcePath: paths.source,
      gitExecutablePath: paths.git,
      protocExecutablePath: paths.protoc,
      rustcExecutablePath: paths.rustc,
      rustTarget: process.platform === 'win32'
        ? 'x86_64-pc-windows-msvc'
        : 'x86_64-unknown-linux-gnu',
    })).toThrow(
      /Cargo home path must not contain Unicode whitespace, control characters, or equals signs/,
    );
    expect(buildCount).toBe(0);
  });

  it.each([
    ['build temporary root', 'temporaryDirectoryRoot'],
    ['shared Cargo home', 'sharedCargoHomeRoot'],
  ] as const)(
    'rejects %s overlapping the patched Frontier source before building',
    async (_label, field) => {
      const overlapping = join(paths.source, field);
      mkdirSync(overlapping);

      await expect(
        refreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1({
          ...input(),
          [field]: overlapping,
        }),
      ).rejects.toThrow(/must not overlap patched Frontier source/);
      expect(buildCount).toBe(0);
    },
  );

  it.each([
    [
      'build temporary root',
      'temporaryDirectoryRoot',
      'Cargo/Rust toolchain',
      'cargo',
    ],
    [
      'shared Cargo home',
      'sharedCargoHomeRoot',
      'Cargo/Rust toolchain',
      'cargo',
    ],
    ['build temporary root', 'temporaryDirectoryRoot', 'Git tool', 'git'],
    ['shared Cargo home', 'sharedCargoHomeRoot', 'Git tool', 'git'],
  ] as const)(
    'rejects %s overlapping the pinned %s directory before building',
    async (_rootLabel, rootField, _toolLabel, toolField) => {
      await expect(
        refreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1({
          ...input(),
          [rootField]: dirname(paths[toolField]),
        }),
      ).rejects.toThrow(/must not overlap pinned/);
      expect(buildCount).toBe(0);
    },
  );
});

function protocObservation() {
  return Object.freeze({
    executablePath: paths.protoc,
    platformKey: `${process.platform}-${process.arch}`,
    version: 'libprotoc fixture',
    sha256Hex: sha256(Buffer.from('protoc')),
  });
}

function rustSrcObservation() {
  const libraryPath = join(
    dirname(paths.rustc),
    '..',
    'lib',
    'rustlib',
    'src',
    'rust',
    'library',
  );
  return Object.freeze({
    libraryPath,
    cargoManifestPath: join(libraryPath, 'Cargo.toml'),
    cargoLockPath: join(libraryPath, 'Cargo.lock'),
    cargoManifestSha256Hex: '1'.repeat(64),
    cargoLockSha256Hex: '2'.repeat(64),
    rustSrcLockSha256Hex: '3'.repeat(64),
  });
}

function createPaths() {
  const root = mkdtempSync(join(tmpdir(), 'fed-build-pins-v1-'));
  temporaryDirectories.push(root);
  const source = join(root, 'frontier-source');
  const temporaryRoot = join(root, 'builds');
  const cargoHome = join(root, 'cargo-home');
  const rustTools = join(root, 'rust-tools');
  const gitTools = join(root, 'git-tools');
  for (const path of [source, temporaryRoot, cargoHome, rustTools, gitTools]) {
    mkdirSync(path);
  }
  const cargo = join(
    rustTools,
    process.platform === 'win32' ? 'cargo.exe' : 'cargo',
  );
  const rustc = join(
    rustTools,
    process.platform === 'win32' ? 'rustc.exe' : 'rustc',
  );
  const git = join(
    gitTools,
    process.platform === 'win32' ? 'git.exe' : 'git',
  );
  const decoyGit = join(
    rustTools,
    process.platform === 'win32' ? 'git.exe' : 'git',
  );
  const protoc = join(
    gitTools,
    process.platform === 'win32' ? 'protoc.exe' : 'protoc',
  );
  writeFileSync(cargo, 'cargo');
  writeFileSync(rustc, 'rustc');
  writeFileSync(git, 'git');
  writeFileSync(decoyGit, 'unverified-git');
  writeFileSync(protoc, 'protoc');
  return {
    root,
    source,
    temporaryRoot,
    cargoHome,
    cargo,
    rustc,
    git,
    decoyGit,
    protoc,
  };
}

function input(): RefreshSubstrateFederatedAuthoritySafeDevnetBuildPinsV1Input {
  return {
    worktreeRoot: WORKTREE_ROOT,
    bridgeRoot: BRIDGE_ROOT,
    frontierSourcePath: paths.source,
    cargoExecutablePath: paths.cargo,
    rustcExecutablePath: paths.rustc,
    gitExecutablePath: paths.git,
    expectedFrontierCommit: FRONTIER_COMMIT,
    expectedFrontierPatchSha256Hex: FRONTIER_PATCH_SHA256,
    expectedFrontierBinaryVersion: BINARY_VERSION,
    temporaryDirectoryRoot: paths.temporaryRoot,
    sharedCargoHomeRoot: paths.cargoHome,
  };
}

function passingBaseline() {
  return {
    schemaVersion: 1 as const,
    kind: 'bridge-consensus-source-baseline-report' as const,
    status: 'PASS' as const,
    errors: [],
    checks: {
      lockBindingsValidated: true,
      solidityBuildClosureArtifactsValidated: true,
      frontierCheckoutRequired: true,
      frontierCheckoutValidated: true,
      ergoCheckoutRequired: false,
      ergoCheckoutValidated: false,
    },
    sourceIdentity: {
      solidityBuildManifestSha256: '10'.repeat(32),
      frontierCommit: FRONTIER_COMMIT,
      frontierPatchSha256: FRONTIER_PATCH_SHA256,
      ergoBaseCommit: '20'.repeat(20),
      ergoPatchSha256: '30'.repeat(32),
    },
    boundaries: {
      sidechainFinalityImplemented: false,
      runtimeCommitmentProducerImplemented: true,
      grandpaAuthorityTransitionVerificationImplemented: false,
      hashLinkedGrandpaVerificationImplemented: false,
      nativeRuntimeCommitmentStateVerificationImplemented: false,
      nativeFinalizedCheckpointVerificationImplemented: false,
      nativeRpcProofCodecImplemented: false,
      trustlessBurnVerificationImplemented: false,
      gate5Closed: false,
    },
  };
}

async function runProcess(value: Readonly<{
  executablePath: string;
  args: readonly string[];
  env?: NodeJS.ProcessEnv;
}>) {
  if (value.args[0] === '--version') {
    const stdout = value.executablePath === paths.cargo
      ? CARGO_VERSION
      : value.executablePath === paths.rustc
        ? RUSTC_VERSION
        : value.executablePath === paths.git
          ? GIT_VERSION
          : BINARY_VERSION;
    return processResult(stdout, '');
  }
  if (value.args[0] === 'build') {
    buildCount += 1;
    buildCalls.push(value);
    const target = value.env?.CARGO_TARGET_DIR;
    if (!target) throw new Error('mocked Cargo build requires CARGO_TARGET_DIR');
    const binary = join(
      target,
      'debug',
      process.platform === 'win32'
        ? 'frontier-template-node.exe'
        : 'frontier-template-node',
    );
    mkdirSync(dirname(binary), { recursive: true });
    writeFileSync(binary, `native-build-${buildCount}`);
    return processResult('', 'Finished dev profile');
  }
  if (value.args[0] === 'build-spec') {
    const value = baseSpec();
    if (buildCount === 2) mutateSecondBaseSpec?.(value);
    const stdout = JSON.stringify(value);
    return processResult(
      stdout,
      '2026-08-27 12:34:56 Building chain spec',
      buildCount === 2 ? secondBaseSpecRawBytes : undefined,
    );
  }
  throw new Error(`unexpected mocked process: ${value.args.join(' ')}`);
}

function processResult(
  stdout: string,
  stderr: string,
  rawStdout: Buffer = Buffer.from(stdout, 'utf8'),
) {
  return {
    pid: 1,
    exitCode: 0 as const,
    stdoutBytes: rawStdout,
    stderrBytes: Buffer.from(stderr, 'utf8'),
    stdout,
    stderr,
  };
}

function baseSpec(): Record<string, unknown> {
  return {
    name: 'Development',
    id: 'dev',
    genesis: {
      runtimeGenesis: {
        code: `0x${RUNTIME_CODE.toString('hex')}`,
        patch: { sudo: { key: `0x${'01'.repeat(20)}` } },
      },
    },
  };
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
