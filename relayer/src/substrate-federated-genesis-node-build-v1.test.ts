import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Subprocesses and source-lock inspection are stubs. Custody, profile encoding,
// fixed patch hashes, exported-file checks and artifact binding are real.
const mocks = vi.hoisted(() => ({ run: vi.fn(), toolchain: vi.fn(), baseline: vi.fn() }));
vi.mock('./pinned-local-native-verifier-build.js', async importOriginal => ({
  ...await importOriginal<typeof import('./pinned-local-native-verifier-build.js')>(),
  runBoundedProcess: mocks.run,
}));
vi.mock('./consensus-source-baseline.js', () => ({ inspectConsensusSourceBaseline: mocks.baseline }));
vi.mock('./substrate-federated-authority-safe-devnet-build-environment-v1.js', async importOriginal => ({
  ...await importOriginal<typeof import('./substrate-federated-authority-safe-devnet-build-environment-v1.js')>(),
  inspectSubstrateFederatedAuthoritySafePinnedToolchainV1: mocks.toolchain,
}));

import { buildSubstrateFederatedGenesisNodeV1, type BuildSubstrateFederatedGenesisNodeV1Input } from './substrate-federated-genesis-node-build-v1.js';
import { createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2,
  readSubstrateFederatedGenesisProfilesFromSessionV2 } from './substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import { encodeFederatedPooledReserveSourceProofProfileScaleV1Hex } from './substrate-federated-pooled-reserve-source-proof-v1.js';

const bridgeRoot = fileURLToPath(new URL('../../', import.meta.url));
const sourceBytes = Buffer.from('[package]\nname="reviewed-fixture"\n');
const blob = createHash('sha1').update(`blob ${sourceBytes.length}\0`).update(sourceBytes).digest('hex');
const tree = '0066f584c0eff7c31bce59adb89bbdb5b90a80fe';
const wasm = Buffer.from('0061736d01000000', 'hex');
let root: string;
let input: BuildSubstrateFederatedGenesisNodeV1Input;
let session: ReturnType<typeof createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2>;
let fault: string;
let buildSource: string;
let configuration: { location: string; name: string; afterBuild: boolean; directory: boolean } | undefined;

function addConfiguration(target: string): void {
  if (!configuration) return;
  const locations: Record<string, string> = {
    home: input.cargoHomeDirectory,
    source: join(buildSource, '.cargo'),
    member: join(buildSource, 'runtime', '.cargo'),
    ancestor: join(input.buildParentDirectory, '.cargo'),
    wasm: join(target, 'debug/wbuild/frontier-template-v4-fed-genesis-runtime/.cargo'),
    temporary: join(dirname(buildSource.replace(/[\\/]+$/, '')), 'temp', '.cargo'),
  };
  const directory = locations[configuration.location]!;
  mkdirSync(directory, { recursive: true });
  if (configuration.directory) mkdirSync(join(directory, configuration.name));
  else writeFileSync(join(directory, configuration.name), '');
}

beforeEach(() => {
  vi.clearAllMocks();
  fault = '';
  buildSource = '';
  configuration = undefined;
  root = mkdtempSync(join(tmpdir(), 'bridge-fed-build-test-'));
  for (const name of ['repository', 'outputs', 'cache', 'tools']) mkdirSync(join(root, name));
  for (const name of ['cargo.exe', 'rustc.exe', 'git.exe', 'protoc.exe']) writeFileSync(join(root, 'tools', name), 'tool fixture');
  writeFileSync(join(root, 'repository', 'historical-artifact'), 'keep');
  session = createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2({
    ergoAdmissionThreshold: 1, ergoAdmissionPublicKeysHex: ['02' + '11'.repeat(32)],
  });
  input = { bridgeRoot, frontierSourcePath: join(root, 'repository'),
    buildParentDirectory: join(root, 'outputs'), cargoHomeDirectory: join(root, 'cache'),
    cargoExecutablePath: join(root, 'tools', 'cargo.exe'), rustcExecutablePath: join(root, 'tools', 'rustc.exe'),
    gitExecutablePath: join(root, 'tools', 'git.exe'), protocExecutablePath: join(root, 'tools', 'protoc.exe'), sourceSession: session };
  mocks.baseline.mockReturnValue({ status: 'PASS' });
  mocks.toolchain.mockImplementation(async () => ({ rustTarget: 'x86_64-pc-windows-msvc',
    generation: fault === 'tool drift' && mocks.toolchain.mock.calls.length > 1 ? 2 : 1 }));
  mocks.run.mockImplementation(async request => {
    const args = request.args as string[];
    if (args[2] === 'write-tree') return { stdout: fault === 'tree' ? 'ab'.repeat(20) : tree, stderr: '' };
    if (args[2] === 'ls-files') return { stdout: `100644 ${blob} 0\tCargo.toml\0` +
      `100644 ${blob} 0\truntime/Cargo.toml\0`, stderr: '' };
    if (args[2] === 'checkout-index') {
      buildSource = args.find(value => value.startsWith('--prefix='))!.slice('--prefix='.length);
      writeFileSync(join(buildSource, 'Cargo.toml'), fault === 'export drift' ? 'changed' : sourceBytes);
      mkdirSync(join(buildSource, 'runtime'));
      writeFileSync(join(buildSource, 'runtime/Cargo.toml'), sourceBytes);
      if (!configuration?.afterBuild) addConfiguration(join(dirname(buildSource.replace(/[\\/]+$/, '')), 'target'));
    }
    if (args[0] === 'build') {
      if (fault === 'cargo failure') throw new Error('compiler failed');
      if (fault === 'source disposed') session.dispose();
      if (fault === 'source drift') writeFileSync(join(buildSource, 'Cargo.toml'), 'changed');
      if (fault === 'protoc drift') writeFileSync(input.protocExecutablePath, 'changed tool');
      const target = request.env.CARGO_TARGET_DIR;
      const node = join(target, 'debug', process.platform === 'win32' ? 'frontier-template-node.exe' : 'frontier-template-node');
      const wasmPath = join(target, 'debug/wbuild/frontier-template-v4-fed-genesis-runtime/frontier_template_v4_fed_genesis_runtime.wasm');
      mkdirSync(dirname(node), { recursive: true });
      mkdirSync(dirname(wasmPath), { recursive: true });
      if (fault !== 'missing node') writeFileSync(node, Buffer.alloc(fault === 'small node' ? 1 : 1024 * 1024, 0x45));
      writeFileSync(wasmPath, fault === 'wrong wasm' ? Buffer.alloc(8) : wasm);
      if (configuration?.afterBuild) addConfiguration(target);
      if (fault === 'caller mutation') {
        (input as any).sourceSession = {};
        (input as any).frontierSourcePath = root;
        (input as any).gitExecutablePath = root;
      }
    }
    return { stdout: '', stderr: '' };
  });
});
afterEach(() => {
  session.dispose();
  if (!root.startsWith(join(tmpdir(), 'bridge-fed-build-test-'))) throw new Error('Unexpected test cleanup root');
  rmSync(root, { recursive: true, force: true });
});

describe('FED genesis build owner', () => {
  it.each(['', 'caller mutation'])('binds fresh public custody to the dedicated build and retains outputs: %s', async selected => {
    fault = selected;
    const expectedScale = encodeFederatedPooledReserveSourceProofProfileScaleV1Hex(
      readSubstrateFederatedGenesisProfilesFromSessionV2(session).mintProofProfile);
    const result = await buildSubstrateFederatedGenesisNodeV1(input);
    const buildCalls = mocks.run.mock.calls.map(([call]) => call).filter(call => call.args[0] === 'build');
    expect(buildCalls).toHaveLength(1);
    expect(buildCalls[0].args).toEqual(['build', '--offline', '--locked', '-p', 'frontier-template-node',
      '--no-default-features', '--features', 'bridge-federated-v4-genesis-node']);
    expect(buildCalls[0].env.BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_SCALE_HEX).toBe(expectedScale);
    expect(buildCalls[0].env.BRIDGE_LAB_FEDERATED_SOURCE_PROOF_PROFILE_ID_HEX).toBe(session.binding.federatedMintProfile.proofProfileIdHex);
    expect(buildCalls[0].env.SKIP_WASM_BUILD).toBeUndefined();
    expect(buildCalls[0].env.CARGO_NET_OFFLINE).toBe('true');
    expect(buildCalls[0].env.WASM_BUILD_WORKSPACE_HINT).toBe(result.sourceDirectory);
    const ownedTemporary = join(dirname(result.sourceDirectory), 'temp');
    expect(buildCalls[0].env.TEMP).toBe(ownedTemporary);
    expect(buildCalls[0].env.TMP).toBe(ownedTemporary);
    expect(buildCalls[0].env.TMPDIR).toBe(ownedTemporary);
    expect(result.sourceProofProfileScaleHex).toBe(expectedScale);
    expect(result.sourceProofProfileIdHex).toBe(session.binding.federatedMintProfile.proofProfileIdHex);
    expect(result.wasm.sha256Hex).toBe(createHash('sha256').update(wasm).digest('hex'));
    expect(result.node.bytes).toBe(1024 * 1024);
    expect(readFileSync(join(root, 'repository', 'historical-artifact'), 'utf8')).toBe('keep');
    expect(() => readSubstrateFederatedGenesisProfilesFromSessionV2(session)).not.toThrow();
    expect(mocks.run.mock.calls.filter(([call]) => call.args[0] !== 'build')
      .every(([call]) => call.env.GIT_INDEX_FILE.startsWith(input.buildParentDirectory))).toBe(true);
  });

  describe.each(['config', 'config.toml'])('Cargo %s exclusion', name => {
    it.each(['home', 'source', 'member', 'ancestor', 'wasm', 'temporary'])
      ('rejects an empty %s configuration before Cargo execution', async location => {
        configuration = { location, name, afterBuild: false, directory: false };
        await expect(buildSubstrateFederatedGenesisNodeV1(input)).rejects.toThrow(/Cargo configuration/);
        expect(mocks.run.mock.calls.some(([call]) => call.args[0] === 'build')).toBe(false);
      });
    it.each(['home', 'source', 'member', 'ancestor', 'wasm', 'temporary'])
      ('returns no artifacts if a %s configuration appears during compilation', async location => {
        configuration = { location, name, afterBuild: true, directory: false };
        await expect(buildSubstrateFederatedGenesisNodeV1(input)).rejects.toThrow(/Cargo configuration/);
        expect(mocks.run.mock.calls.filter(([call]) => call.args[0] === 'build')).toHaveLength(1);
      });
    it('rejects a directory at the configuration filename before Cargo execution', async () => {
      configuration = { location: 'home', name, afterBuild: false, directory: true };
      await expect(buildSubstrateFederatedGenesisNodeV1(input)).rejects.toThrow(/Cargo configuration/);
      expect(mocks.run.mock.calls.some(([call]) => call.args[0] === 'build')).toBe(false);
    });
  });

  it.each(['tree', 'export drift'])('rejects %s before Cargo execution', async selected => {
    fault = selected;
    await expect(buildSubstrateFederatedGenesisNodeV1(input)).rejects.toThrow(
      selected === 'tree' ? /reconstructed source tree/ : /exported source bytes/);
    expect(mocks.run.mock.calls.some(([call]) => call.args[0] === 'build')).toBe(false);
  });
  it.each(['cargo failure', 'source disposed', 'source drift', 'protoc drift', 'tool drift', 'missing node', 'small node', 'wrong wasm'])
    ('returns no build artifacts after %s', async selected => {
      fault = selected;
      const errors: Record<string, RegExp> = { 'cargo failure': /compiler failed/, 'source disposed': /disposed/,
        'source drift': /exported source bytes/, 'protoc drift': /tools changed/,
        'tool drift': /tools changed/, 'missing node': /ENOENT/, 'small node': /artifact size/, 'wrong wasm': /WASM version-one/ };
      await expect(buildSubstrateFederatedGenesisNodeV1(input)).rejects.toThrow(errors[selected]);
    });
  it.each(['disposed', 'clone', 'source output', 'lock failure', 'extra', 'accessor'])
    ('rejects %s before starting a subprocess', async selected => {
      let value = input;
      let error: RegExp;
      const getter = vi.fn(() => session);
      if (selected === 'disposed') { session.dispose(); error = /disposed/; }
      else if (selected === 'clone') { value = { ...input, sourceSession: { ...session } }; error = /provenance/; }
      else if (selected === 'source output') { value = { ...input, buildParentDirectory: input.frontierSourcePath }; error = /outside source/; }
      else if (selected === 'lock failure') { mocks.baseline.mockReturnValue({ status: 'BLOCKED' }); error = /source locks failed/; }
      else if (selected === 'extra') { value = { ...input, callback: () => undefined } as never; error = /exact data/; }
      else { value = { ...input }; Object.defineProperty(value, 'sourceSession', { enumerable: true, get: getter }); error = /exact data/; }
      await expect(buildSubstrateFederatedGenesisNodeV1(value)).rejects.toThrow(error);
      expect(mocks.run).not.toHaveBeenCalled();
      expect(getter).not.toHaveBeenCalled();
    });
});
