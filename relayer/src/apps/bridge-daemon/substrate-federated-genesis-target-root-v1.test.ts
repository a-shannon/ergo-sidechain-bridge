import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Builds, compilers, observations and processes are stubs. Session/key custody,
// root control flow, materialization checks and bounded RPC decoding stay real.
const mocked = vi.hoisted(() => ({
  frontier: vi.fn(), ergoBuild: vi.fn(), process: vi.fn(), owned: vi.fn(),
  discover: vi.fn(), history: vi.fn(), compile: vi.fn(), materialize: vi.fn(),
  pin: vi.fn(), nodes: vi.fn(), environment: vi.fn(),
}));
vi.mock('../../substrate-federated-genesis-node-build-v1.js', () => ({ buildSubstrateFederatedGenesisNodeV1: mocked.frontier }));
vi.mock('../../substrate-federated-isolated-devnet-ergo-node-build-v1.js', () => ({ buildSubstrateFederatedIsolatedDevnetErgoNodeV1: mocked.ergoBuild }));
vi.mock('../../substrate-federated-isolated-devnet-ergo-node-process-v1.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../substrate-federated-isolated-devnet-ergo-node-process-v1.js')>(),
  createSubstrateFederatedIsolatedDevnetErgoNodeProcessV2: mocked.process,
  assertSubstrateFederatedIsolatedDevnetOwnedExecutionTargetV1: mocked.owned,
}));
vi.mock('../../substrate-federated-isolated-devnet-owned-reward-input-discovery-v1.js', () => ({
  discoverSubstrateFederatedRewardInputsForOwnedExecutionTargetV1: mocked.discover,
}));
vi.mock('../../substrate-federated-isolated-devnet-ergo-history-artifacts-v1.js', () => ({
  collectSubstrateFederatedIsolatedDevnetErgoHistoryArtifactsV2: mocked.history,
}));
vi.mock('../../substrate-federated-observed-genesis-v1.js', () => ({ compileObservedSubstrateFederatedGenesisV1: mocked.compile }));
vi.mock('../../pinned-local-native-verifier-build.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../pinned-local-native-verifier-build.js')>(), runBoundedProcess: mocked.materialize,
}));
vi.mock('../../native-executable-pin.js', () => ({ verifyExecutableSha256: mocked.pin }));
vi.mock('../../substrate-federated-authority-safe-devnet-build-environment-v1.js', () => ({
  buildSubstrateFederatedAuthoritySafeMinimalToolEnvironmentV1: mocked.environment,
}));
vi.mock('../../substrate-federated-authority-safe-devnet-process-v1.js', () => ({
  withOwnedFederatedGenesisDevnetProcessesV1: mocked.nodes,
}));

import { runSubstrateFederatedGenesisTargetRootV1, type RunSubstrateFederatedGenesisTargetRootV1Input } from './substrate-federated-genesis-target-root-v1.js';
import * as setups from '../../substrate-federated-isolated-devnet-setup-check-runner-v2.js';
import * as sources from '../../substrate-federated-isolated-devnet-source-attestation-session-v1.js';
import * as operators from '../../adapters/federated-genesis-operator-v1.js';
import { observeFederatedGenesisTargetsV1 } from '../../adapters/federated-genesis-target-observation-v1.js';
import { assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance } from '../../substrate-federated-isolated-devnet-setup-check-signer-binding-v2.js';

const KEYS = {
  code: '0x3a636f6465',
  profile: '0xaf86fef4216ac2bcd1c592b204011ad0710f901342def5945398fc0e02473bde',
  enforced: '0xaf86fef4216ac2bcd1c592b204011ad04e000f8baeaa137cf901a9235d7de9a1',
  bridge: '0xaf86fef4216ac2bcd1c592b204011ad0c1586bde54b249fb7f521faf831ade45',
  sudo: '0x5c0d1176a568c1f92944340dbfed9e9c530ebca703c85910e7164cb7d1c9e47b',
};
const PRIMARY = 'http://127.0.0.1:19955';
const WITNESS = 'http://127.0.0.1:19956';
const genesis = '0x' + '71'.repeat(32);
const wasm = Buffer.from('0061736d01000000', 'hex');
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const makeSetup = setups.createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2;
const makeSource = sources.createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2;
const makeOperator = operators.createFederatedGenesisOperatorV1;
const claimMining = setups.claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2;
let setup: Awaited<ReturnType<typeof makeSetup>> | undefined;
let source: ReturnType<typeof makeSource> | undefined;
let operator: ReturnType<typeof makeOperator> | undefined;
let miningCredential: ReturnType<typeof claimMining> | undefined;
let compiledGenesisBytes: Buffer | undefined;
let directory: string;
let input: RunSubstrateFederatedGenesisTargetRootV1Input;
let top: Record<string, string>;
let order: string[];
let active: boolean;
let started: boolean;
let calls: { url: string; method: string; params: unknown[] }[];
let readResult: (url: string, method: string, params: unknown[]) => unknown;
let stop: ReturnType<typeof vi.fn>;
const target = Object.freeze({});
const discovery = Object.freeze({ observation: Object.freeze({ genesisBoxIds: Object.freeze({
  tracker: '81'.repeat(32), duplicatePrevention: '82'.repeat(32), pooledReserve: '83'.repeat(32),
}) }) });
const history = Object.freeze({ observation: 'history component stub' });

function assertCustodyActive() {
  operators.assertFederatedGenesisOperatorV1(operator!);
  sources.readSubstrateFederatedGenesisProfilesFromSessionV2(source!);
  assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(setup!.signer);
}
function assertDisposed() {
  if (operator) expect(() => operators.assertFederatedGenesisOperatorV1(operator!)).toThrow(/disposed/);
  if (source) expect(() => sources.readSubstrateFederatedGenesisProfilesFromSessionV2(source!)).toThrow(/disposed/);
  if (setup) expect(() => assertSubstrateFederatedIsolatedDevnetSetupCheckSignerBindingV2Provenance(setup!.signer)).toThrow(/active process provenance/);
}
function rawSpec() {
  return { id: 'bridge_federated_v4_genesis', bootNodes: [], genesis: { raw: { top, childrenDefault: {} } } };
}
function response(result: unknown) { return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result })); }

beforeEach(() => {
  vi.clearAllMocks();
  setup = undefined; source = undefined; operator = undefined;
  miningCredential = undefined; compiledGenesisBytes = undefined;
  order = []; calls = []; active = false; started = false;
  directory = mkdtempSync(join(tmpdir(), 'fed-root-component-'));
  const bridgeRoot = join(directory, 'bridge');
  mkdirSync(bridgeRoot);
  mkdirSync(join(directory, 'target'));
  writeFileSync(join(directory, 'runtime.wasm'), wasm);
  input = {
    frontierBuild: { bridgeRoot, frontierSourcePath: directory, buildParentDirectory: directory,
      cargoHomeDirectory: directory, cargoExecutablePath: 'cargo', rustcExecutablePath: 'rustc',
      gitExecutablePath: 'git', protocExecutablePath: 'protoc' },
    ergoBuild: { bridgeRoot, worktreeRoot: directory, ergoSourcePath: directory,
      gitExecutablePath: 'git', javaExecutablePath: 'java', sbtLauncherJarPath: 'launcher' },
  };
  top = { [KEYS.code]: '0x' + wasm.toString('hex'), [KEYS.profile]: '0x0102',
    [KEYS.enforced]: '0x01', [KEYS.bridge]: '0x' + '33'.repeat(20), '0x1234': '0x5678' };
  vi.spyOn(setups, 'createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2').mockImplementation(async () => {
    order.push('setup'); setup = await makeSetup(); return setup;
  });
  vi.spyOn(sources, 'createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2').mockImplementation(value => {
    order.push('source'); source = makeSource(value); return source;
  });
  vi.spyOn(operators, 'createFederatedGenesisOperatorV1').mockImplementation(() => {
    order.push('operator'); operator = makeOperator();
    top[operator.nativeFunding.storageKeyHex] = operator.nativeFunding.accountInfoScaleHex;
    return operator;
  });
  vi.spyOn(setups, 'claimSubstrateFederatedIsolatedDevnetSetupMiningCredentialV2').mockImplementation(value => {
    expect(value).toBe(setup); miningCredential = claimMining(value); return miningCredential;
  });
  mocked.frontier.mockImplementation(async value => {
    order.push('frontier-build'); expect(value.sourceSession).toBe(source); assertCustodyActive();
    return { sourceDirectory: directory, targetDirectory: join(directory, 'target'),
      node: { path: join(directory, 'node.exe'), sha256Hex: '51'.repeat(32) },
      wasm: { path: join(directory, 'runtime.wasm'), sha256Hex: sha256(wasm) },
      sourceProofProfileScaleHex: source!.binding.federatedMintProfileScaleHex,
      sourceProofProfileIdHex: source!.binding.federatedMintProfile.proofProfileIdHex };
  });
  mocked.ergoBuild.mockImplementation(async () => {
    order.push('ergo-build'); assertCustodyActive();
    return { javaExecutablePath: 'java', nodeAssemblyJarPath: 'node.jar', receipt: {
      toolchain: { javaExecutableSha256Hex: '52'.repeat(32) }, build: { artifactSha256Hex: '53'.repeat(32) },
      buildIdentityDigestHex: '54'.repeat(32),
    } };
  });
  stop = vi.fn(async () => { order.push('stop'); active = false; });
  mocked.process.mockImplementation((build, binding, credential) => {
    order.push('process'); assertCustodyActive();
    expect(build).toEqual({ javaExecutablePath: 'java', expectedJavaExecutableSha256Hex: '52'.repeat(32),
      nodeAssemblyJarPath: 'node.jar', expectedNodeAssemblyJarSha256Hex: '53'.repeat(32), buildIdentityDigestHex: '54'.repeat(32) });
    expect(binding).toEqual({ miningTargetPublicKeyHex: setup!.signer.publicKeyHex,
      p2pkErgoTreeHex: setup!.signer.p2pkErgoTreeHex, rewardInputErgoTrees: setup!.signer.rewardInputErgoTrees,
      networkPrefix: 16, primaryNodeOrigin: 'http://127.0.0.1:9051', witnessNodeOrigin: 'http://127.0.0.1:9052' });
    expect(miningCredential).toBeDefined(); expect(credential).toBe(miningCredential);
    return { startMining: async () => { order.push('mine'); started = true; }, stop,
      withMiningActiveExecutionTarget: async (callback: (value: object) => Promise<unknown>) => {
        expect(started).toBe(true); active = true;
        try { return { value: await callback(target), receipt: { component: 'ergo process stub' } }; }
        finally { active = false; }
      } };
  });
  mocked.owned.mockImplementation(value => { if (!active || value !== target) throw new Error('target inactive'); });
  mocked.discover.mockImplementation(async (signer, value) => {
    order.push('discover'); expect(signer).toBe(setup!.signer); expect(value).toBe(target); expect(active).toBe(true);
    return discovery;
  });
  mocked.history.mockImplementation(async value => { order.push('history'); expect(value).toBe(discovery.observation); return history; });
  mocked.compile.mockImplementation(async value => {
    order.push('compile'); assertCustodyActive(); expect(active).toBe(true);
    expect(value.setupSigner).toBe(setup!.signer); expect(value.sourceSession).toBe(source);
    expect(value.target).toBe(target); expect(value.ownedDiscovery).toBe(discovery); expect(value.history).toBe(history);
    expect(value.genesis.operatorAddressHex).toBe(operator!.addressHex);
    expect(value.genesis.launchDomainHex).toBe(operator!.launchDomainHex);
    expect(value.genesis.endowments).toEqual([{ addressHex: operator!.addressHex, balance: '100000000000000000000' }]);
    expect(value.genesis.runtimeWasm).toEqual(wasm);
    const profiles = sources.readSubstrateFederatedGenesisProfilesFromSessionV2(source!);
    const genesisJson = JSON.stringify({ component: 'typed compiler stub', operatorAddressHex: operator!.addressHex });
    compiledGenesisBytes = Buffer.from(genesisJson);
    return { preparation: { ...profiles, mintProofProfile: source!.binding.federatedMintProfile,
      mintProofProfileScaleHex: source!.binding.federatedMintProfileScaleHex,
      application: { bridgeAddressHex: '33'.repeat(20) } },
      candidate: { genesisJson, genesisJsonSha256Hex: sha256(genesisJson), runtimeProfileScaleHex: '0x0102',
        runtimeProfileIdHex: '55'.repeat(32), familyIdHex: '56'.repeat(32) }, discovery: discovery.observation };
  });
  mocked.environment.mockReturnValue({ bounded: 'environment stub' });
  mocked.pin.mockResolvedValue(undefined);
  mocked.materialize.mockImplementation(async value => {
    order.push('materialize'); assertCustodyActive(); expect(active).toBe(true);
    expect(value.args).toEqual(['build-spec', '--chain', `fed-genesis:${join(directory, 'target', 'fed-genesis.json')}`, '--disable-default-bootnode', '--raw']);
    expect(JSON.parse(readFileSync(join(directory, 'target', 'fed-genesis.json'), 'utf8')).operatorAddressHex).toBe(operator!.addressHex);
    return { stdout: JSON.stringify(rawSpec()), stderr: '' };
  });
  mocked.nodes.mockImplementation(async (value, callback) => {
    order.push('nodes'); assertCustodyActive(); expect(active).toBe(true);
    expect(value.primaryRpcUrl).toBe(PRIMARY); expect(value.witnessRpcUrl).toBe(WITNESS);
    expect(value.nodeBinaryPath).toBe(join(directory, 'node.exe'));
    expect(value.expectedNodeBinarySha256Hex).toBe('51'.repeat(32));
    expect(value.genesisJsonBytes).toEqual(compiledGenesisBytes);
    expect([value.primaryP2pPort, value.witnessP2pPort, value.primaryPrometheusPort, value.witnessPrometheusPort])
      .toEqual([30355, 30356, 19615, 19616]);
    expect(sha256(value.genesisJsonBytes)).toBe(value.expectedGenesisJsonSha256Hex);
    try { return { value: await callback({ primaryRpcUrl: PRIMARY, witnessRpcUrl: WITNESS }), receipt: { component: 'FED process stub' } }; }
    finally { order.push('nodes-stop'); }
  });
  readResult = (_url, method, params) => {
    if (method === 'chain_getBlockHash') return genesis;
    if (method === 'chain_getHeader') return { number: '0x0' };
    if (method === 'author_pendingExtrinsics') return [];
    if (method === 'state_getStorage') { expect(params[1]).toBe(genesis); return top[params[0] as string] ?? null; }
    throw new Error('unreviewed RPC method');
  };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    assertCustodyActive(); expect(active).toBe(true); expect([PRIMARY, WITNESS]).toContain(url);
    expect(init.redirect).toBe('error'); expect(init.method).toBe('POST'); expect(init.signal).toBeInstanceOf(AbortSignal);
    const { method, params } = JSON.parse(init.body as string);
    calls.push({ url, method, params }); return response(readResult(url, method, params));
  }));
});
afterEach(() => {
  if (operator) operators.disposeFederatedGenesisOperatorV1(operator);
  source?.dispose(); setup?.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  rmSync(directory, { recursive: true, force: true });
});

describe('fresh FED target composition', () => {
  it('binds retained custody, actual component handles and both target views, then disposes them', async () => {
    const result = await runSubstrateFederatedGenesisTargetRootV1(input);
    expect(result.status).toBe('fresh-federated-genesis-observed');
    expect(result.nativeGenesisHashHex).toBe(genesis);
    expect(result.operatorAddressHex).toBe(operator!.addressHex);
    expect(result.issuanceInputBoxIds).toEqual(discovery.observation.genesisBoxIds);
    expect(result.singletonIssuanceEstablished).toBe(false); expect(result.operationalMintEstablished).toBe(false);
    expect(result.storageKeysChecked).toBe(6); expect(Object.isFrozen(result)).toBe(true);
    expect(order).toEqual(['setup', 'source', 'operator', 'frontier-build', 'ergo-build', 'process', 'mine',
      'discover', 'history', 'compile', 'materialize', 'nodes', 'nodes-stop', 'stop']);
    expect(calls.filter(call => call.method === 'state_getStorage')).toHaveLength(14);
    expect(new Set(calls.map(call => call.url))).toEqual(new Set([PRIMARY, WITNESS]));
    expect(mocked.pin).toHaveBeenCalledTimes(2); expect(stop).toHaveBeenCalledOnce(); assertDisposed();
  });

  it.each(['top extra', 'top accessor', 'nested extra', 'nested accessor', 'different roots'])
    ('rejects %s before creating custody or building', async fault => {
      const getter = vi.fn(() => input.frontierBuild);
      const value: any = { ...input, frontierBuild: { ...input.frontierBuild } };
      if (fault === 'top extra') value.callback = () => undefined;
      if (fault === 'top accessor') Object.defineProperty(value, 'frontierBuild', { enumerable: true, get: getter });
      if (fault === 'nested extra') value.frontierBuild.sourceSession = {};
      if (fault === 'nested accessor') Object.defineProperty(value.frontierBuild, 'bridgeRoot', { enumerable: true, get: getter });
      if (fault === 'different roots') value.frontierBuild.bridgeRoot = directory;
      await expect(runSubstrateFederatedGenesisTargetRootV1(value)).rejects.toThrow(
        fault === 'different roots' ? /same bridge repository/ : /exact data fields/);
      expect(getter).not.toHaveBeenCalled(); expect(order).toEqual([]); expect(mocked.frontier).not.toHaveBeenCalled();
    });

  it('captures nested path data before awaiting setup', async () => {
    const expected = { ...input.frontierBuild };
    vi.mocked(setups.createSubstrateFederatedIsolatedDevnetSetupCheckSessionV2).mockImplementationOnce(async () => {
      setup = await makeSetup(); (input.frontierBuild as any).cargoExecutablePath = 'changed'; return setup;
    });
    await runSubstrateFederatedGenesisTargetRootV1(input);
    expect(mocked.frontier.mock.calls[0][0]).toMatchObject(expected); assertDisposed();
  });

  it.each(['frontier', 'ergoBuild', 'process', 'discover', 'history', 'compile', 'materialize', 'nodes'] as const)
    ('cleans custody and stops only an acquired Ergo process after %s failure', async stage => {
      mocked[stage].mockImplementationOnce(() => { throw new Error(`failure at ${stage}`); });
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(`failure at ${stage}`);
      expect(stop).toHaveBeenCalledTimes(['frontier', 'ergoBuild', 'process'].includes(stage) ? 0 : 1);
      if (stage !== 'nodes') expect(mocked.nodes).not.toHaveBeenCalled(); assertDisposed();
    });

  it('disposes every key owner even when process cleanup fails', async () => {
    stop.mockRejectedValueOnce(new Error('cleanup failed'));
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('cleanup failed'); assertDisposed();
  });

  it.each(['source', 'operator', 'mining'])('cleans previously acquired owners after %s startup failure', async stage => {
    if (stage === 'source') vi.mocked(sources.createSubstrateFederatedIsolatedDevnetSourceAttestationSessionV2)
      .mockImplementationOnce(() => { throw new Error('source startup failed'); });
    if (stage === 'operator') vi.mocked(operators.createFederatedGenesisOperatorV1)
      .mockImplementationOnce(() => { throw new Error('operator startup failed'); });
    if (stage === 'mining') {
      const createProcess = mocked.process.getMockImplementation()!;
      mocked.process.mockImplementationOnce((...args) => ({ ...createProcess(...args),
        startMining: async () => { throw new Error('mining startup failed'); } }));
    }
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(`${stage} startup failed`);
    expect(stop).toHaveBeenCalledTimes(stage === 'mining' ? 1 : 0);
    expect(mocked.discover).not.toHaveBeenCalled(); expect(mocked.nodes).not.toHaveBeenCalled(); assertDisposed();
  });

  it('rejects an expired Ergo target before starting FED nodes', async () => {
    mocked.materialize.mockImplementationOnce(async () => { active = false; return { stdout: JSON.stringify(rawSpec()) }; });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow('target inactive');
    expect(mocked.nodes).not.toHaveBeenCalled(); expect(stop).toHaveBeenCalledOnce(); assertDisposed();
  });

  it.each(['empty', 'accessor', 'symbol', 'sudo', 'invalid key', 'invalid value'])
    ('rejects %s expected storage before any RPC request', async fault => {
      const expected: any = fault === 'empty' ? {} : { ...top };
      const getter = vi.fn(() => '0x5678');
      if (fault === 'accessor') Object.defineProperty(expected, '0x1234', { enumerable: true, get: getter });
      if (fault === 'symbol') expected[Symbol('extra')] = '0x00';
      if (fault === 'sudo') expected[KEYS.sudo] = '0x00';
      if (fault === 'invalid key') expected.invalid = '0x00';
      if (fault === 'invalid value') expected['0x1234'] = '0X00';
      await expect(observeFederatedGenesisTargetsV1(expected)).rejects.toThrow(/bounded exact data fields/);
      expect(fetch).not.toHaveBeenCalled(); expect(getter).not.toHaveBeenCalled(); expect(order).toEqual([]);
    });

  it.each(['source', 'setup', 'operator'])('rechecks %s custody after an awaited build', async owner => {
    const build = mocked.frontier.getMockImplementation()!;
    mocked.frontier.mockImplementationOnce(async value => {
      const built = await build(value);
      if (owner === 'source') source!.dispose();
      if (owner === 'setup') setup!.dispose();
      if (owner === 'operator') operators.disposeFederatedGenesisOperatorV1(operator!);
      return built;
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/disposed|active process provenance/);
    expect(mocked.ergoBuild).not.toHaveBeenCalled(); expect(mocked.nodes).not.toHaveBeenCalled(); assertDisposed();
  });

  it.each(['scale', 'id'])('rejects compiled federation %s drift before materialization', async field => {
    const compile = mocked.compile.getMockImplementation()!;
    mocked.compile.mockImplementationOnce(async value => {
      const result = await compile(value);
      if (field === 'scale') result.preparation.mintProofProfileScaleHex = '0xab';
      else result.preparation.mintProofProfile = { ...result.preparation.mintProofProfile, proofProfileIdHex: '0x' + 'ab'.repeat(32) };
      return result;
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/federation differs/);
    expect(mocked.materialize).not.toHaveBeenCalled(); expect(mocked.nodes).not.toHaveBeenCalled(); assertDisposed();
  });

  it.each(['runtime', 'profile', 'enforced', 'bridge', 'sudo', 'children', 'peers', 'id', 'duplicate keys'])
    ('rejects raw %s mismatch before starting FED nodes', async fault => {
      mocked.materialize.mockImplementationOnce(async () => {
        const spec: any = rawSpec();
        if (fault === 'runtime') top[KEYS.code] = '0x0061736d01000001';
        if (fault === 'profile') top[KEYS.profile] = '0x0103';
        if (fault === 'enforced') top[KEYS.enforced] = '0x00';
        if (fault === 'bridge') top[KEYS.bridge] = '0x' + '34'.repeat(20);
        if (fault === 'sudo') top[KEYS.sudo] = '0x01';
        if (fault === 'children') spec.genesis.raw.childrenDefault = { child: {} };
        if (fault === 'peers') spec.bootNodes = ['peer'];
        if (fault === 'id') spec.id = 'legacy_lab';
        const text = JSON.stringify(spec);
        return { stdout: fault === 'duplicate keys' ? text.replace('"bootNodes":[]', '"bootNodes":[],"bootNodes":[]') : text };
      });
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/raw storage differs|child storage|target or peers|duplicate JSON/);
      expect(mocked.nodes).not.toHaveBeenCalled(); expect(stop).toHaveBeenCalledOnce(); assertDisposed();
    });

  it('rejects modified materialization input before starting FED nodes', async () => {
    mocked.materialize.mockImplementationOnce(async () => {
      writeFileSync(join(directory, 'target', 'fed-genesis.json'), '{}'); return { stdout: JSON.stringify(rawSpec()) };
    });
    await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/typed genesis bytes changed/);
    expect(mocked.nodes).not.toHaveBeenCalled(); assertDisposed();
  });

  it.each(['account', 'balance', 'nonce', 'provider', 'reserved', 'frozen', 'flags', 'length'])
    ('rejects materialized operator %s drift before starting FED nodes', async fault => {
      mocked.materialize.mockImplementationOnce(async () => {
        const key = operator!.nativeFunding.storageKeyHex;
        if (fault === 'account') { top[key + '00'] = top[key]!; delete top[key]; }
        else {
          const account = Buffer.from(top[key]!.slice(2), 'hex');
          if (fault === 'length') top[key] += '00';
          else {
            const offsets = { balance: 16, nonce: 0, provider: 8, reserved: 32, frozen: 48, flags: 79 };
            account[offsets[fault as keyof typeof offsets]] ^= 1;
            top[key] = `0x${account.toString('hex')}`;
          }
        }
        return { stdout: JSON.stringify(rawSpec()) };
      });
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/operator funding differs/);
      expect(mocked.nodes).not.toHaveBeenCalled(); expect(stop).toHaveBeenCalledOnce(); assertDisposed();
    });

  it.each(['endpoint', 'genesis', 'height', 'storage', 'sudo', 'pool', 'changed genesis', 'advanced height'])
    ('rejects %s in the owned running-target observation', async fault => {
      const base = readResult;
      let genesisReads = 0; let headerReads = 0;
      readResult = (url, method, params) => {
        if (url === WITNESS) {
          if (method === 'chain_getBlockHash') {
            genesisReads++;
            if (fault === 'genesis' || (fault === 'changed genesis' && genesisReads === 2)) return '0x' + '72'.repeat(32);
          }
          if (method === 'chain_getHeader') {
            headerReads++;
            if (fault === 'height' || (fault === 'advanced height' && headerReads === 3)) return { number: '0x1' };
          }
          if (fault === 'storage' && method === 'state_getStorage' && params[0] === '0x1234') return '0x5679';
          if (fault === 'sudo' && method === 'state_getStorage' && params[0] === KEYS.sudo) return '0x01';
          if (fault === 'pool' && method === 'author_pendingExtrinsics') return ['0x01'];
        }
        if (fault === 'genesis' && method === 'state_getStorage') return top[params[0] as string] ?? null;
        return base(url, method, params);
      };
      if (fault === 'endpoint') mocked.nodes.mockImplementationOnce(async (_value, callback) =>
        ({ value: await callback({ primaryRpcUrl: 'http://127.0.0.1:19957', witnessRpcUrl: WITNESS }) }));
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/endpoints changed|disagree on genesis|no longer at genesis|storage differs|pool is not empty|genesis changed/);
      expect(stop).toHaveBeenCalledOnce(); assertDisposed();
    });

  it.each(['HTTP', 'ID', 'extra field', 'duplicate field', 'malformed UTF8', 'oversized body'])
    ('rejects %s RPC responses and releases custody', async fault => {
      const cancel = vi.fn();
      vi.mocked(fetch).mockImplementationOnce(async () => {
        if (fault === 'HTTP') return new Response('unavailable', { status: 503 });
        if (fault === 'ID') return new Response(JSON.stringify({ jsonrpc: '2.0', id: 2, result: genesis }));
        if (fault === 'extra field') return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: genesis, extra: true }));
        if (fault === 'duplicate field') return new Response(`{"jsonrpc":"2.0","id":1,"id":1,"result":"${genesis}"}`);
        if (fault === 'malformed UTF8') return new Response(new Uint8Array([0xff]));
        return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(34 * 1024 * 1024 + 1)); }, cancel }));
      });
      await expect(runSubstrateFederatedGenesisTargetRootV1(input)).rejects.toThrow(/RPC failed|envelope mismatch|exact data fields|duplicate JSON|encoded data|byte limit/);
      if (fault === 'oversized body') expect(cancel).toHaveBeenCalledOnce();
      expect(stop).toHaveBeenCalledOnce(); assertDisposed();
    });
});
