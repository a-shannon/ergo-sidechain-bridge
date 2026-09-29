import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  buildWasmAvlEnvironment,
  buildWasmAvlPlan,
  validateWasmBindgenVersion,
  validateWasmAvlBuildToolHashV2,
  validateWasmAvlRustToolchainVersions,
  validateWasmPackVersion,
} from './scripts/build-wasm-avl.js';
import {
  runWasmAvlBuildPipelineV2,
  type WasmAvlBuildPipelineDependenciesV2,
  type WasmAvlBuildPipelinePlanV2,
  type WasmAvlBuildPipelineToolsV2,
} from './scripts/build-wasm-avl-pipeline-v2.js';

const BRIDGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOME_ROOT = process.platform === 'win32' ? process.env.USERPROFILE : process.env.HOME;
if (!process.env.CARGO_HOME && !HOME_ROOT) throw new Error('test CARGO_HOME is unavailable');
const CARGO_HOME = path.resolve(process.env.CARGO_HOME ?? path.join(HOME_ROOT!, '.cargo'));
const RUSTUP_HOME = path.resolve(process.env.RUSTUP_HOME ?? path.join(HOME_ROOT!, '.rustup'));
const PATH_VALUE = process.env.PATH ?? process.env.Path;
if (!PATH_VALUE) throw new Error('test PATH is unavailable');
const REVIEWED_WASM_BINDGEN_EXECUTABLE_SHA256 =
  '9d669c8c13bb70a37c8518c9476f9b716c7fdf463daaa73742dffb486e7f802a';
const REVIEWED_WASM_BINDGEN_ARCHIVE_SHA256 =
  'd8ebacbfdbee70ffdcda0bbfefd99a645aee35ba31ba77dfa3b083f031674977';

describe('deterministic WASM AVL build', () => {
  it('uses encoded remap flags so paths with spaces remain one rustc argument', () => {
    const env = buildWasmAvlEnvironment({
      env: { KEEP: 'discarded', PATH: PATH_VALUE },
      bridgeRoot: '/workspace with spaces/bridge',
      cargoHome: '/profile with spaces/.cargo',
      rustupHome: '/profile with spaces/.rustup',
    });
    expect(env.KEEP).toBeUndefined();
    expect(env.CARGO_INCREMENTAL).toBe('0');
    expect(env.CARGO_NET_OFFLINE).toBe('true');
    expect(env.RUSTUP_AUTO_INSTALL).toBe('0');
    expect(env.CARGO_HOME).toBe('/profile with spaces/.cargo');
    expect(env.CARGO_ENCODED_RUSTFLAGS?.split('\u001f')).toEqual([
      '--remap-path-prefix=/profile with spaces/.cargo=/cargo-home',
      '--remap-path-prefix=/workspace with spaces/bridge=/bridge-source',
    ]);
  });

  it('preserves SystemRoot with the casing required by the Windows Job Object runner', () => {
    const env = buildWasmAvlEnvironment({
      env: { PATH: PATH_VALUE, SystemRoot: 'C:\\Windows' },
      bridgeRoot: BRIDGE_ROOT,
      cargoHome: CARGO_HOME,
      rustupHome: RUSTUP_HOME,
    });
    expect(env.SystemRoot).toBe('C:\\Windows');
  });

  it.each([
    'CARGO_ENCODED_RUSTFLAGS',
    'RUSTC_WORKSPACE_WRAPPER',
    'RUSTC_WRAPPER',
    'RUSTFLAGS',
  ])('rejects inherited %s', field => {
    expect(() => buildWasmAvlEnvironment({
      env: { [field.toLowerCase()]: 'unreviewed' },
      bridgeRoot: BRIDGE_ROOT,
      cargoHome: CARGO_HOME,
      rustupHome: RUSTUP_HOME,
    })).toThrow(`forbidden override ${field}`);
  });

  it.each([
    'CARGO_BUILD_TARGET',
    'CARGO_PROFILE_RELEASE_OPT_LEVEL',
    'CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_RUSTFLAGS',
  ])('rejects inherited %s', field => {
    expect(() => buildWasmAvlEnvironment({
      env: { [field]: 'unreviewed' },
      bridgeRoot: BRIDGE_ROOT,
      cargoHome: CARGO_HOME,
      rustupHome: RUSTUP_HOME,
    })).toThrow(`forbidden override ${field}`);
  });

  it('rejects the encoded rustflags separator inside a remap source', () => {
    expect(() => buildWasmAvlEnvironment({
      env: { PATH: PATH_VALUE },
      bridgeRoot: `/workspace${'\u001f'}injected`,
      cargoHome: CARGO_HOME,
      rustupHome: RUSTUP_HOME,
    })).toThrow('unsafe remap separator');
  });

  it('pins the wasm-pack command and canonical crate root', () => {
    const plan = buildWasmAvlPlan({
      bridgeRoot: BRIDGE_ROOT,
      cargoHome: CARGO_HOME,
      rustupHome: RUSTUP_HOME,
      env: { PATH: PATH_VALUE },
    });
    expect(plan.executable).toBe('wasm-pack');
    expect(plan.args).toEqual([
      'build', '--target', 'nodejs', '--no-opt', '--mode', 'no-install',
    ]);
    expect(plan.cwd).toBe(path.resolve(BRIDGE_ROOT, 'wasm-avl'));
    expect(plan.env.RUSTUP_HOME).toBe(RUSTUP_HOME);
    expect(plan.env.WASM_PACK_CACHE).toBe(
      path.resolve(BRIDGE_ROOT, 'wasm-avl', 'target', 'wasm-pack-cache'),
    );
    expect(plan.env.CARGO_ENCODED_RUSTFLAGS?.split('\u001f')).toEqual([
      `--remap-path-prefix=${CARGO_HOME}=/cargo-home`,
      `--remap-path-prefix=${BRIDGE_ROOT}=/bridge-source`,
    ]);
  });

  it('provisions the pinned generator and locked Rust crates before the hosted clean-checkout build', () => {
    const workflow = readFileSync(
      path.resolve(BRIDGE_ROOT, '.github', 'workflows', 'relayer-checks.yml'),
      'utf8',
    );
    const rustSetup = workflow.indexOf('name: Setup Rust 1.97.1');
    const generatorProvision = workflow.indexOf('name: Provision wasm-bindgen 0.2.120');
    const crateFetch = workflow.indexOf('name: Fetch locked WASM AVL dependencies');
    const candidateGate = workflow.indexOf('name: Run public-audit candidate gate');

    expect(rustSetup).toBeGreaterThanOrEqual(0);
    expect(generatorProvision).toBeGreaterThan(rustSetup);
    expect(crateFetch).toBeGreaterThan(rustSetup);
    expect(generatorProvision).toBeLessThan(candidateGate);
    expect(crateFetch).toBeLessThan(candidateGate);
    expect(workflow).toContain(
      'https://github.com/wasm-bindgen/wasm-bindgen/releases/download/0.2.120/wasm-bindgen-0.2.120-x86_64-pc-windows-msvc.tar.gz',
    );
    expect(workflow).toContain(REVIEWED_WASM_BINDGEN_ARCHIVE_SHA256);
    expect(workflow).toContain(REVIEWED_WASM_BINDGEN_EXECUTABLE_SHA256);
    expect(workflow).toContain('WASM_BINDGEN_EXECUTABLE=$executable');
    expect(workflow).toContain('cargo fetch --locked');
  });

  it('accepts only the reviewed wasm-pack version', () => {
    expect(() => validateWasmPackVersion('wasm-pack 0.14.0\n')).not.toThrow();
    expect(() => validateWasmPackVersion('wasm-pack 0.15.0\n')).toThrow(
      'requires wasm-pack 0.14.0',
    );
  });

  it('accepts only the wasm-bindgen CLI version pinned by Cargo.lock', () => {
    expect(() => validateWasmBindgenVersion('wasm-bindgen 0.2.120\n')).not.toThrow();
    expect(() => validateWasmBindgenVersion('wasm-bindgen 0.2.119\n')).toThrow(
      'requires wasm-bindgen 0.2.120',
    );
  });

  it.each([
    ['wasmPack', '6e569a9bea962dbdc3e30e9aef076b1d559f7819b1cbb7ffce85ece8a7e47da8'],
    ['wasmBindgen', REVIEWED_WASM_BINDGEN_EXECUTABLE_SHA256],
    ['rustc', 'cf79cfd77b0a144c56a0a6af6bf10bcdf095a73718cd4bf2b9d4fe2d2cbded55'],
    ['cargo', 'ddfbad20b31b918d3439d070945ec59bbfe037a6ec0ab5b584459e69c8b37d1b'],
  ] as const)('pins %s to the reviewed Windows x64 executable bytes', (name, hash) => {
    expect(() => validateWasmAvlBuildToolHashV2(name, hash, 'win32-x64')).not.toThrow();
    expect(() => validateWasmAvlBuildToolHashV2(
      name,
      `0${hash.slice(1)}`,
      'win32-x64',
    )).toThrow(`WASM AVL ${name} executable does not match its reviewed hash`);
  });

  it('fails closed when no reviewed host tool pins exist', () => {
    expect(() => validateWasmAvlBuildToolHashV2(
      'wasmBindgen',
      '9d669c8c13bb70a37c8518c9476f9b716c7fdf463daaa73742dffb486e7f802a',
      'linux-x64',
    )).toThrow('no reviewed tool pins for linux-x64');
  });

  it('accepts only the reviewed Rust and Cargo toolchain', () => {
    expect(() => validateWasmAvlRustToolchainVersions(
      'rustc 1.97.1 (8bab26f4f 2026-07-14)',
      'cargo 1.97.1 (c980f4866 2026-06-30)',
    )).not.toThrow();
    expect(() => validateWasmAvlRustToolchainVersions(
      'rustc 1.98.0 (unreviewed)',
      'cargo 1.97.1 (reviewed)',
    )).toThrow('requires Rust 1.97.1');
    expect(() => validateWasmAvlRustToolchainVersions(
      'rustc 1.97.1 (reviewed)',
      'cargo 1.96.0 (unreviewed)',
    )).toThrow('requires Rust 1.97.1');
    expect(() => validateWasmAvlRustToolchainVersions(
      'rustc 1.97.1 (8bab26f4f 2026-07-14)-tampered',
      'cargo 1.97.1 (c980f4866 2026-06-30)',
    )).toThrow('requires Rust 1.97.1');
    expect(() => validateWasmAvlRustToolchainVersions(
      'rustc 1.97.1 (8bab26f4f 2026-07-14)',
      'cargo 1.97.1 (c980f4866 2026-06-30)-tampered',
    )).toThrow('requires Rust 1.97.1');
  });
});

const PIPELINE_SOURCE_SHA256 = 'a'.repeat(64);
const PIPELINE_PACKAGE_SHA256 = 'b'.repeat(64);
const PIPELINE_TOOLS: Readonly<WasmAvlBuildPipelineToolsV2> = Object.freeze({
  wasmPack: Object.freeze({
    path: path.join(BRIDGE_ROOT, '.reviewed-tools', 'wasm-pack', 'wasm-pack.exe'),
    sha256Hex: '6e569a9bea962dbdc3e30e9aef076b1d559f7819b1cbb7ffce85ece8a7e47da8',
    version: 'wasm-pack 0.14.0',
  }),
  wasmBindgen: Object.freeze({
    path: path.join(BRIDGE_ROOT, '.reviewed-tools', 'wasm-bindgen', 'wasm-bindgen.exe'),
    sha256Hex: '9d669c8c13bb70a37c8518c9476f9b716c7fdf463daaa73742dffb486e7f802a',
    version: 'wasm-bindgen 0.2.120',
  }),
  rustc: Object.freeze({
    path: path.join(BRIDGE_ROOT, '.reviewed-tools', 'rustc', 'rustc.exe'),
    sha256Hex: 'cf79cfd77b0a144c56a0a6af6bf10bcdf095a73718cd4bf2b9d4fe2d2cbded55',
    version: 'rustc 1.97.1 (8bab26f4f 2026-07-14)',
  }),
  cargo: Object.freeze({
    path: path.join(BRIDGE_ROOT, '.reviewed-tools', 'cargo', 'cargo.exe'),
    sha256Hex: 'ddfbad20b31b918d3439d070945ec59bbfe037a6ec0ab5b584459e69c8b37d1b',
    version: 'cargo 1.97.1 (c980f4866 2026-06-30)',
  }),
});

function pipelinePlan(
  env: NodeJS.ProcessEnv = {
    PATH: ['C:/original-tools', 'C:/system-tools'].join(path.delimiter),
    CARGO_NET_OFFLINE: 'true',
    RUSTUP_AUTO_INSTALL: '0',
    WASM_PACK_CACHE: path.resolve(BRIDGE_ROOT, 'wasm-avl', 'target', 'wasm-pack-cache'),
  },
): WasmAvlBuildPipelinePlanV2 {
  return Object.freeze({
    executable: 'wasm-pack',
    args: Object.freeze([
      'build', '--target', 'nodejs', '--no-opt', '--mode', 'no-install',
    ] as const),
    cwd: path.resolve(BRIDGE_ROOT, 'wasm-avl'),
    env,
  });
}

function pipelineDependencies(): WasmAvlBuildPipelineDependenciesV2 & {
  fingerprintSource: ReturnType<typeof vi.fn>;
  inspectBuildTools: ReturnType<typeof vi.fn>;
  runBoundedProcess: ReturnType<typeof vi.fn>;
  assertPackageSmoke: ReturnType<typeof vi.fn>;
  emitBuildOutput: ReturnType<typeof vi.fn>;
} {
  return {
    fingerprintSource: vi.fn(() => PIPELINE_SOURCE_SHA256),
    inspectBuildTools: vi.fn(async () => PIPELINE_TOOLS),
    runBoundedProcess: vi.fn(async () => ({
      pid: 1234,
      exitCode: 0 as const,
      stdoutBytes: Buffer.from('built', 'utf8'),
      stderrBytes: Buffer.alloc(0),
      stdout: 'built',
      stderr: '',
    })),
    assertPackageSmoke: vi.fn(() => Object.freeze({
      sourceSha256Hex: PIPELINE_SOURCE_SHA256,
      packageSha256Hex: PIPELINE_PACKAGE_SHA256,
    })),
    emitBuildOutput: vi.fn(),
  };
}

describe('source-locked WASM AVL build pipeline', () => {
  it('uses the pinned offline no-install command and bounded Windows process contract', async () => {
    const dependencies = pipelineDependencies();
    const result = await runWasmAvlBuildPipelineV2(
      BRIDGE_ROOT,
      pipelinePlan(),
      dependencies,
    );
    const request = dependencies.runBoundedProcess.mock.calls[0]?.[0];

    expect(result.packageIdentity.packageSha256Hex).toBe(PIPELINE_PACKAGE_SHA256);
    expect(result.tools).toEqual(PIPELINE_TOOLS);
    expect(request.args).toEqual([
      'build', '--target', 'nodejs', '--no-opt', '--mode', 'no-install',
    ]);
    expect(request.env.CARGO_NET_OFFLINE).toBe('true');
    expect(request.env.RUSTUP_AUTO_INSTALL).toBe('0');
    expect(request.env.WASM_PACK_CACHE).toBe(
      path.resolve(BRIDGE_ROOT, 'wasm-avl', 'target', 'wasm-pack-cache'),
    );
    expect(request.env.PATH?.split(path.delimiter).slice(0, 4)).toEqual([
      path.dirname(PIPELINE_TOOLS.wasmBindgen.path),
      path.dirname(PIPELINE_TOOLS.rustc.path),
      path.dirname(PIPELINE_TOOLS.cargo.path),
      path.dirname(PIPELINE_TOOLS.wasmPack.path),
    ]);
    expect(request.timeoutMs).toBe(15 * 60_000);
    expect(request.terminationGraceMs).toBe(5_000);
    expect(request.label).toBe('WASM AVL source-locked no-install build');
    expect(dependencies.inspectBuildTools).toHaveBeenCalledTimes(2);
    expect(dependencies.assertPackageSmoke).toHaveBeenCalledOnce();
  });

  it('rejects a generator-install command before resolving tools or spawning', async () => {
    const dependencies = pipelineDependencies();
    const plan = {
      ...pipelinePlan(),
      args: ['build', '--target', 'nodejs', '--no-opt', '--mode', 'install'],
    } as unknown as WasmAvlBuildPipelinePlanV2;

    await expect(runWasmAvlBuildPipelineV2(BRIDGE_ROOT, plan, dependencies))
      .rejects.toThrow('offline no-install mode');
    expect(dependencies.inspectBuildTools).not.toHaveBeenCalled();
    expect(dependencies.runBoundedProcess).not.toHaveBeenCalled();
  });

  it.each([
    ['CARGO_NET_OFFLINE', 'false'],
    ['RUSTUP_AUTO_INSTALL', '1'],
    ['WASM_PACK_CACHE', path.join(BRIDGE_ROOT, 'unreviewed-cache')],
  ])('rejects altered %s before spawning', async (name, value) => {
    const valid = pipelinePlan();
    const plan = pipelinePlan({ ...valid.env, [name]: value });
    const dependencies = pipelineDependencies();

    await expect(runWasmAvlBuildPipelineV2(BRIDGE_ROOT, plan, dependencies))
      .rejects.toThrow('offline no-install mode');
    expect(dependencies.runBoundedProcess).not.toHaveBeenCalled();
  });

  it('does not build when the exact preinstalled generator cannot be resolved', async () => {
    const dependencies = pipelineDependencies();
    dependencies.inspectBuildTools.mockRejectedValueOnce(
      new Error('wasm-bindgen 0.2.120 is absent from the no-install cache'),
    );

    await expect(runWasmAvlBuildPipelineV2(
      BRIDGE_ROOT,
      pipelinePlan(),
      dependencies,
    )).rejects.toThrow('absent from the no-install cache');
    expect(dependencies.runBoundedProcess).not.toHaveBeenCalled();
    expect(dependencies.assertPackageSmoke).not.toHaveBeenCalled();
  });

  it('rejects source drift during the bounded build before package smoke', async () => {
    const dependencies = pipelineDependencies();
    dependencies.fingerprintSource
      .mockReturnValueOnce(PIPELINE_SOURCE_SHA256)
      .mockReturnValueOnce('f'.repeat(64));

    await expect(runWasmAvlBuildPipelineV2(
      BRIDGE_ROOT,
      pipelinePlan(),
      dependencies,
    )).rejects.toThrow('source inputs changed during the build');
    expect(dependencies.runBoundedProcess).toHaveBeenCalledOnce();
    expect(dependencies.assertPackageSmoke).not.toHaveBeenCalled();
    expect(dependencies.inspectBuildTools).toHaveBeenCalledOnce();
  });

  it('rejects post-build tool-path drift without returning an identity', async () => {
    const dependencies = pipelineDependencies();
    const changedTools: WasmAvlBuildPipelineToolsV2 = {
      ...PIPELINE_TOOLS,
      wasmBindgen: {
        ...PIPELINE_TOOLS.wasmBindgen,
        path: path.join(BRIDGE_ROOT, '.other-tools', 'wasm-bindgen.exe'),
      },
    };
    dependencies.inspectBuildTools
      .mockResolvedValueOnce(PIPELINE_TOOLS)
      .mockResolvedValueOnce(changedTools);

    await expect(runWasmAvlBuildPipelineV2(
      BRIDGE_ROOT,
      pipelinePlan(),
      dependencies,
    )).rejects.toThrow('build tools changed during the source build');
    expect(dependencies.assertPackageSmoke).toHaveBeenCalledOnce();
    expect(dependencies.inspectBuildTools).toHaveBeenCalledTimes(2);
  });

  it('propagates bounded timeout without smoke or a usable package identity', async () => {
    const dependencies = pipelineDependencies();
    const timeout = new Error('bounded process timed out');
    dependencies.runBoundedProcess.mockRejectedValueOnce(timeout);

    await expect(runWasmAvlBuildPipelineV2(
      BRIDGE_ROOT,
      pipelinePlan(),
      dependencies,
    )).rejects.toBe(timeout);
    expect(dependencies.runBoundedProcess.mock.calls[0]?.[0].terminationGraceMs)
      .toBe(5_000);
    expect(dependencies.assertPackageSmoke).not.toHaveBeenCalled();
    expect(dependencies.inspectBuildTools).toHaveBeenCalledOnce();
  });

  it('withholds the package identity when the generated-package ABI smoke fails', async () => {
    const dependencies = pipelineDependencies();
    dependencies.assertPackageSmoke.mockImplementationOnce(() => {
      throw new Error('production ABI smoke rejected generated package');
    });

    await expect(runWasmAvlBuildPipelineV2(
      BRIDGE_ROOT,
      pipelinePlan(),
      dependencies,
    )).rejects.toThrow('production ABI smoke rejected');
    expect(dependencies.inspectBuildTools).toHaveBeenCalledOnce();
    expect(dependencies.runBoundedProcess).toHaveBeenCalledOnce();
  });
});
